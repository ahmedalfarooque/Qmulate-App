/**
 * QMULATE — the beneficiary registry surface (E4/S5): BR-201…BR-206, BR-210.
 *
 * MOVED OUT OF `root.ts` IN S5/E4 and WIDENED from the read-only surface E3 shipped. E3's own
 * header said why the write half waited: "a write surface here would put `parentId`, `lineageLink`
 * and `active` — the three columns that decide who is entitled — behind a router nobody has
 * reviewed for that purpose." E4 is that review, and these are its rules:
 *
 * ── WHAT A WRITE MAY AND MAY NOT DO ─────────────────────────────────────────────────────────
 *  · `enrol` is the ONLY door for the three eligibility columns (`parentId`, `lineageLink`,
 *    `active`). It mirrors the seed's coherence refusals (a jiha carries no edge; a non-jiha
 *    must carry one — R6; a supplied ṭabaqa must equal the depth the edges derive) so an
 *    incoherent record is refused HERE with a readable message rather than paid wrongly later.
 *  · There is NO edge-correction procedure in S5, DELIBERATELY. Re-parenting a member relocates
 *    a whole branch's money; the correction path (who may do it, against what evidence) is
 *    surfaced in BUILD-PLAN as an owed design, not shipped casually as an UPDATE.
 *  · `recordDeath` is one-way (`active: false` + the dual-dated certification). Reversing a
 *    certified death is likewise an owed design, not a write anyone holds today.
 *  · `stipulatedWeight` is a DEED term (the founder's allocation). It may be SET where null and
 *    is REFUSED where already recorded — same fail-safe direction as D-B's write-once trio,
 *    ⚠ surfaced (not ruled): whether a recorded deed weight is formally write-once is the
 *    product owner's question, carried in BUILD-PLAN. The refusal is reversible in code; a
 *    silently repriced beneficiary is not.
 *
 * ── SELF-ISOLATION (BR-210, §10 §5) ─────────────────────────────────────────────────────────
 * A beneficiary-principal session (a grant carrying `beneficiarySelfId`) is narrowed BY THE
 * FORCE FILTER, before any of this router runs: reads collapse to their own row, and EVERY write
 * on EVERY model is refused (C-07). Nothing here relaxes that, and no procedure below carries a
 * second, role-shaped isolation check that could disagree with the filter (§10 §5's 404-not-403
 * rule works BECAUSE the filter already narrowed the row set).
 *
 * ── THE UBO DATASET (BR-202/BR-203) ─────────────────────────────────────────────────────────
 * `…Enc` columns cross this boundary as PLAINTEXT and land as ciphertext (the encryption
 * extension); `…Hmac` siblings are DERIVED there and a caller-supplied value throws. Reading the
 * dataset back demands `beneficiary:ubo:read` — a caller holding only `beneficiary:beneficiary:read`
 * gets the record with the dataset withheld and says so (`uboDataset: null` + `uboDatasetWithheld`),
 * never a silent hole. ⚠ The `beneficiary` role preset holds NO `ubo:*` verb (access.ts §2.2), so a
 * beneficiary principal does not read their own identity/banking dataset back through this surface —
 * deliberate, recorded, and the portal's own submit-flow ships with the PORTAL EPIC. ⚠ Its MODEL is
 * ruled and is not "staff record it for them": product owner, Q-E4-2, 2026-08-18 — *"beneficiary
 * should enter their own kyc info - staff verifies and can request more"*, i.e. beneficiary-entered,
 * staff-verified, with a request-more loop, the beneficiary being the maker of their own KYC record.
 * Staff entering it on their behalf is the STATED INTERIM only, and this router's write procedures
 * (`refreshKyc`, `recordUbo`) are that interim — not the design.
 *
 * ── WHAT IS NEVER RETURNED ──────────────────────────────────────────────────────────────────
 * `lineageLink` appears ONLY in `lineage`'s integrity view (where the cross-check needs it) and
 * NEVER in `list`/`get`: it is the ẓuhūr/buṭūn ELIGIBILITY FACT, read for exactly one computation,
 * and must never be rendered as a person's gender — no UI label, no report column, no CSV export,
 * no i18n key (ADR-0009; schema comment on the column).
 *
 * ── KYC FRESHNESS (BR-205) ──────────────────────────────────────────────────────────────────
 * Computed on EVERY read from `kycLastRefreshed` + `Setting['kyc.refreshIntervalMonths']`
 * (⚠ unverified — confirm vs primary law) through the SAME `@qmulate/domain` predicates the
 * distribution gates use (`isKycUnverified` / `isKycStale`), so the registry chip and the engine's
 * STALE_KYC withhold cannot disagree. NEVER persisted: freshness is a function of today.
 */

import { z } from 'zod';

import {
  ancestryByBeneficiary,
  readBeneficiaryAncestry,
  type BeneficiaryAncestryRow,
} from '@qmulate/database';
import { DomainError } from '@qmulate/domain';
import { isKycStale, isKycUnverified } from '@qmulate/domain/distribution';
import { civilDate, toHijriSnapshot } from '@qmulate/domain/dates';

import { ApiError } from '../errors.js';
import { hasPermissionInGrant } from '../permissions.js';
import { createSettingResolver } from '../settings.js';
import { endowmentScopedProcedure, router } from '../trpc.js';

/* ── input primitives ─────────────────────────────────────────────────────────────────────── */

const beneficiaryId = z.string().min(1).max(64);

/** A bare calendar date, the fixture/deed convention. The Hijri twin is DERIVED server-side. */
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * The registry's closed vocabularies, spelled exactly as the Prisma enums spell them. A value
 * outside these unions is refused at input parse; the `as never` casts at the Prisma boundary
 * below are the codebase's existing idiom for the loosely-typed scoped client, never a widening
 * of what this contract accepts.
 */
const kindInput = z.enum(['FAMILY', 'CHARITABLE_JIHA', 'CATEGORY_ONLY']);
const lineInput = z.enum(['ZUHUR', 'BUTUN', 'NA']);
const lineageLinkInput = z.enum(['SON', 'DAUGHTER']);
const residencyInput = z.enum(['DOMESTIC', 'CROSS_BORDER']);

/** Decimal strings, never JS numbers — `Decimal(9,4)` / `Decimal(38,18)` do not fit IEEE-754. */
const sharePercentInput = z
  .string()
  .regex(/^\d{1,5}(\.\d{1,4})?$/, 'a share percent must be a decimal string, e.g. "12.5"');
const weightInput = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'a stipulated weight must be a non-negative decimal string');

/* ── KYC freshness, computed through the engine's own predicates ──────────────────────────── */

export type KycFreshness = 'FRESH' | 'STALE' | 'UNVERIFIED';

/**
 * One classification for one row, THROUGH the `@qmulate/domain` predicates the distribution gates
 * run (`gates.ts`): `UNVERIFIED` when the status is not VERIFIED or no refresh date exists at all
 * (never conflated with stale — the engine's own boundary), `STALE` when the refresh window has
 * lapsed, `FRESH` otherwise. ⚠ The interval is `Setting['kyc.refreshIntervalMonths']` — unverified
 * vs primary law — resolved per request, never cached, never defaulted.
 */
function kycFreshnessOf(
  verificationStatus: string,
  kycLastRefreshed: Date | null,
  asOf: Date,
  kycRefreshMonths: number,
): KycFreshness {
  // The engine predicate reads exactly these two fields; the cast narrows a registry row to the
  // engine's beneficiary shape rather than restating the rule (one implementation — gates.ts).
  const kycView = {
    verificationStatus,
    kycLastRefreshed: kycLastRefreshed === null ? null : civilDate(isoDateOnly(kycLastRefreshed)),
  } as unknown as Parameters<typeof isKycUnverified>[0];
  if (isKycUnverified(kycView)) {
    return 'UNVERIFIED';
  }
  return isKycStale(
    civilDate(isoDateOnly(kycLastRefreshed as Date)),
    civilDate(isoDateOnly(asOf)),
    kycRefreshMonths,
  )
    ? 'STALE'
    : 'FRESH';
}

/** The engine's civil-date form (`YYYY-MM-DD`), from a stored UTC instant. */
function isoDateOnly(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Resolve the KYC refresh interval for this request. Missing/invalid THROWS — never a default. */
async function kycRefreshMonthsFor(
  db: Parameters<typeof createSettingResolver>[0],
  now: Date,
  waqfId: string,
): Promise<number> {
  const resolver = createSettingResolver(db, { now });
  const resolved = await resolver.resolve('kyc.refreshIntervalMonths', { waqfId });
  return resolved.envelope.v as number;
}

/* ── shared projections ───────────────────────────────────────────────────────────────────── */

/**
 * The registry projection, one shape for `list` and `get`.
 *
 * ⚠ NO `lineageLink` — see the module header. ⚠ Decimals cross as STRINGS. ⚠ `kycFreshness` is
 * computed, never stored, and `categoryCaptured` is the BR-206 state the screen renders (the
 * Arabic text itself is on `get` only).
 */
interface RegistryRow {
  readonly id: string;
  readonly branch: string;
  readonly relationshipAr: string;
  readonly relationshipEn: string | null;
  readonly kind: string;
  readonly verificationStatus: string;
  readonly active: boolean;
  readonly deceasedAt: string | null;
  readonly deceasedAtHijri: string | null;
  readonly tabaqa: number | null;
  readonly residency: string;
  readonly isUbo: boolean;
  readonly kycLastRefreshed: string | null;
  readonly kycLastRefreshedHijri: string | null;
  readonly kycFreshness: KycFreshness;
  readonly categoryCaptured: boolean;
  readonly sharePercent: string | null;
  readonly stipulatedWeight: string | null;
}

const REGISTRY_SELECT = {
  id: true,
  branch: true,
  relationshipAr: true,
  relationshipEn: true,
  kind: true,
  verificationStatus: true,
  active: true,
  deceasedAt: true,
  deceasedAtHijri: true,
  tabaqa: true,
  residency: true,
  isUbo: true,
  kycLastRefreshed: true,
  kycLastRefreshedHijri: true,
  categoryDescriptionAr: true,
  sharePercent: true,
  stipulatedWeight: true,
} as const;

type RegistryRecord = {
  id: string;
  branch: string;
  relationshipAr: string;
  relationshipEn: string | null;
  kind: unknown;
  verificationStatus: unknown;
  active: boolean;
  deceasedAt: Date | null;
  deceasedAtHijri: string | null;
  tabaqa: number | null;
  residency: unknown;
  isUbo: boolean;
  kycLastRefreshed: Date | null;
  kycLastRefreshedHijri: string | null;
  categoryDescriptionAr: string | null;
  sharePercent: unknown;
  stipulatedWeight: unknown;
};

function projectRegistryRow(
  row: RegistryRecord,
  asOf: Date,
  kycRefreshMonths: number,
): RegistryRow {
  return {
    id: row.id,
    branch: row.branch,
    relationshipAr: row.relationshipAr,
    relationshipEn: row.relationshipEn,
    kind: String(row.kind),
    verificationStatus: String(row.verificationStatus),
    active: row.active,
    deceasedAt: row.deceasedAt === null ? null : row.deceasedAt.toISOString(),
    deceasedAtHijri: row.deceasedAtHijri,
    tabaqa: row.tabaqa,
    residency: String(row.residency),
    isUbo: row.isUbo,
    kycLastRefreshed: row.kycLastRefreshed === null ? null : row.kycLastRefreshed.toISOString(),
    kycLastRefreshedHijri: row.kycLastRefreshedHijri,
    kycFreshness: kycFreshnessOf(
      String(row.verificationStatus),
      row.kycLastRefreshed,
      asOf,
      kycRefreshMonths,
    ),
    categoryCaptured: row.categoryDescriptionAr !== null,
    sharePercent: row.sharePercent === null ? null : String(row.sharePercent),
    stipulatedWeight: row.stipulatedWeight === null ? null : String(row.stipulatedWeight),
  };
}

/* ── the router ───────────────────────────────────────────────────────────────────────────── */

export const beneficiaryRouter = router({
  /**
   * The registry (BR-201). For a beneficiary session the force-filter narrows it to their own row,
   * before role logic — the wider projection is therefore always the caller's own data or data a
   * staff grant covers.
   */
  list: endowmentScopedProcedure('beneficiary:beneficiary:read').query(async ({ ctx }) => {
    const kycRefreshMonths = await kycRefreshMonthsFor(ctx.db, ctx.now, ctx.waqfId);
    const rows = await ctx.db.beneficiary.findMany({
      where: { waqfId: ctx.waqfId },
      select: REGISTRY_SELECT,
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => projectRegistryRow(row as RegistryRecord, ctx.now, kycRefreshMonths));
  }),

  /**
   * One record (BR-201/BR-202), with the UBO dataset DISCLOSED BY PERMISSION CLASS:
   * `beneficiary:ubo:read` holders get the decrypted dataset; everyone else gets `uboDataset: null`
   * with `uboDatasetWithheld: true` — a stated withholding, never a silent hole.
   *
   * ⚠ §10 §5: a beneficiary fetching ANOTHER beneficiary's id gets **404, not 403** — the
   * force-filter already narrowed the row set to `beneficiarySelfId`, so this procedure does not
   * need — and must not have — a second, role-shaped isolation check that could disagree with it.
   */
  get: endowmentScopedProcedure('beneficiary:beneficiary:read')
    .input(z.object({ beneficiaryId }))
    .query(async ({ ctx, input }) => {
      const kycRefreshMonths = await kycRefreshMonthsFor(ctx.db, ctx.now, ctx.waqfId);
      const row = await ctx.db.beneficiary.findFirst({
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        select: {
          ...REGISTRY_SELECT,
          categoryDescriptionAr: true,
          line: true,
          parentId: true,
          uboIdTypeEnc: true,
          uboIdNumberEnc: true,
          uboBankingRefEnc: true,
          uboShareOfProceeds: true,
        },
      });
      if (row === null) {
        throw new ApiError(
          'NO_GRANT',
          `beneficiary ${input.beneficiaryId} is not visible to this caller on waqf ${ctx.waqfId}. ` +
            `§10 §5: a direct fetch of another beneficiary's id returns 404, NOT 403 — existence ` +
            `itself is not disclosed.`,
          { beneficiaryId: input.beneficiaryId, waqfId: ctx.waqfId },
        );
      }

      // The UBO permission is checked against the caller's OTHER seats on THIS endowment too —
      // §10 §4.2's two-seats-on-one-endowment case — via the same helper `resolveScope` uses, so
      // the disclosure rule and the rung's own rule cannot drift.
      const mayReadUbo = ctx.grants
        .filter((grant) => grant.waqfId === ctx.waqfId)
        .some((grant) => hasPermissionInGrant(grant, 'beneficiary:ubo:read'));

      const base = projectRegistryRow(row as RegistryRecord, ctx.now, kycRefreshMonths);
      return {
        ...base,
        categoryDescriptionAr: row.categoryDescriptionAr,
        line: String(row.line),
        parentId: row.parentId,
        // ⚠ Values here are PLAINTEXT because the encryption extension decrypted them on read for
        // an authorized caller; at rest they are ciphertext (`test/e4-field-encryption` proves it
        // against a raw connection).
        uboDataset: mayReadUbo
          ? {
              idType: row.uboIdTypeEnc,
              idNumber: row.uboIdNumberEnc,
              bankingRefForProceeds: row.uboBankingRefEnc,
              shareOfProceeds:
                row.uboShareOfProceeds === null ? null : String(row.uboShareOfProceeds),
            }
          : null,
        uboDatasetWithheld: !mayReadUbo,
      };
    }),

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * S4/E3 · THE ANCESTOR WALK, AS A READ — moved here verbatim in S5/E4
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * ── WHY THE ANCESTRY IS A SEPARATE ARRAY AND NOT A FIELD ON EACH MEMBER ───────────────────
   * R-FRONTIER (product owner, 2026-08-03) makes entitlement a property of a CHAIN, not of a row: a
   * member is entitled only if EVERY ancestor strictly between them and the waqif is deceased. So the
   * caller needs every (beneficiary, ancestor) PAIR — one stale vital status on a grandparent silently
   * moves an entire branch's money, and a nearest-ancestor field would hide exactly that.
   * R7-d's continuing-line predicate tests ancestors too.
   *
   * ⚠ NOTHING HERE MAY BE CACHED, MATERIALIZED OR PERSISTED. There is deliberately no `excluded`,
   * `ineligible`, `entitledCohort` or `lastComputedFrontier` column anywhere in the schema, no
   * materialized view and no cached cohort — because `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is a
   * **TEMPORARY** exclusion that reverses on that ancestor's death. The `integrity` verdicts below are
   * recomputed on every call for the same reason.
   *
   * ⚠ `lineageLink` IS RETURNED BECAUSE THE INTEGRITY VIEW NEEDS IT, AND IT MUST NEVER BE RENDERED AS
   * A PERSON'S GENDER: no UI label, no report column, no CSV export, no i18n key. It is the
   * ẓuhūr/buṭūn ELIGIBILITY FACT, read for exactly one computation (the `ZUHUR_ONLY`
   * intermediate-ancestor test).
   *
   * ⚠ THE WALK ISSUES RAW SQL, WHICH BYPASSES THE PRISMA FORCE FILTER. `readBeneficiaryAncestry`
   * performs NO authorization of its own and says so in its header: `waqfId` is a REQUIRED argument and
   * every caller must already hold a verified grant. This procedure is on rung 2 with
   * `beneficiary:beneficiary:read`, so an ACTIVE grant for `ctx.waqfId` was resolved before this body
   * ran — that resolution IS the authorization, and `ctx.waqfId` (never an input id) is what is passed.
   *
   * ⚠ AND THE ROW READ IS STILL THROUGH THE SCOPED CLIENT, WHICH MATTERS FOR A BENEFICIARY SESSION:
   * the force filter narrows `Beneficiary` to `beneficiarySelfId` for such a caller, so `members` is
   * their own row while `ancestry` — raw SQL — is not narrowed at all. The two are therefore
   * INTERSECTED below rather than returned side by side.
   */
  lineage: endowmentScopedProcedure('beneficiary:beneficiary:read').query(async ({ ctx }) => {
    const members = await ctx.db.beneficiary.findMany({
      where: { waqfId: ctx.waqfId },
      select: {
        id: true,
        parentId: true,
        lineageLink: true,
        tabaqa: true,
        active: true,
        kind: true,
      },
      orderBy: { id: 'asc' },
    });

    const visible = new Set(members.map((member) => member.id));

    // The walk, then INTERSECTED with what this caller may see. Without the intersection a beneficiary
    // session — narrowed by the force filter to its own row — would still receive the whole family's
    // ancestry through the raw-SQL path, which is the §10 §5 isolation defeated by a projection.
    const ancestryRows = (await readBeneficiaryAncestry(ctx.db, ctx.waqfId)).filter(
      (row: BeneficiaryAncestryRow) =>
        visible.has(row.beneficiaryId) && visible.has(row.ancestorId),
    );
    const chains = ancestryByBeneficiary(ancestryRows);

    // ── DERIVED ṬABAQA, AND THE CROSS-CHECK ────────────────────────────────────────────────
    // `tabaqa` is A CROSS-CHECK, NOT A TRUSTED INPUT: for any member of the lineage graph the
    // authoritative value is DERIVED from `parentId` depth. `parentId: null` means A CHILD OF THE
    // WAQIF (derived depth 1) and NEVER "unknown", which is why the derivation has exactly one base
    // case. A disagreement is REPORTED (`tabaqaMismatch`), never reconciled — the engine refuses such
    // a graph (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) and this read must not make the graph look healthy.
    const derivedDepth = (id: string): number | null => {
      const chain = chains.get(id);
      if (chain === undefined) return 1; // no ancestor strictly between them and the waqif
      const deepest = chain.at(-1);
      return deepest === undefined ? 1 : deepest.depth + 1;
    };

    const missingLineageLink: string[] = [];
    const tabaqaMismatch: string[] = [];
    const rootedOutsideWaqif: string[] = [];

    const projected = members.map((member) => {
      const kind = String(member.kind);
      const link = member.lineageLink === null ? null : String(member.lineageLink);
      // ⚠ A NON-MEMBER OF THE GRAPH HAS NO DERIVED DEPTH. Graph membership is decided by
      // `lineageLink !== null` (the schema's own rule: `parentId: null` means a child of the
      // waqif ONLY for members). Deriving `1` for a charitable jiha — which carries neither an
      // edge nor a ṭabaqa, by design — made `agrees` false for every jiha and rendered a
      // spurious "recorded tier disagrees" wart beside legitimate rows (found by the E4 e2e
      // pass, S5). The integrity arrays never had the defect: `tabaqaMismatch` only ever fires
      // on a non-null recorded ṭabaqa.
      const depth = link === null ? null : derivedDepth(member.id);

      // R6 (product owner, 2026-08-03): the lineage edge is REQUIRED ON EVERY DEED, not only a
      // lineage-order one — eligibility comes from descent whatever rule the deed uses, and the engine
      // will not pay someone it cannot place. A `CHARITABLE_JIHA` legitimately carries none.
      if (link === null && kind !== 'CHARITABLE_JIHA') missingLineageLink.push(member.id);

      if (member.tabaqa !== null && depth !== null && member.tabaqa !== depth) {
        tabaqaMismatch.push(member.id);
      }
      // A member whose parent id does not resolve inside this endowment. The COMPOSITE foreign key
      // `[waqfId, parentId] -> [waqfId, id]` makes a cross-endowment edge structurally impossible, so
      // this can only fire for a parent that is invisible to THIS caller — which is a scoping fact,
      // not a data fact, and is reported as such rather than as corruption.
      if (member.parentId !== null && !visible.has(member.parentId)) {
        rootedOutsideWaqif.push(member.id);
      }

      return {
        id: member.id,
        parentId: member.parentId,
        lineageLink: link,
        tabaqaRecorded: member.tabaqa,
        tabaqaDerived: depth,
        agrees: member.tabaqa === null ? depth === null : member.tabaqa === depth,
        active: member.active,
        kind,
      };
    });

    return {
      members: projected,
      ancestry: ancestryRows.map((row: BeneficiaryAncestryRow) => ({
        beneficiaryId: row.beneficiaryId,
        ancestorId: row.ancestorId,
        depth: row.depth,
        /** THE input to the frontier test. An ancestor's status decides a whole branch's entitlement. */
        ancestorActive: row.ancestorActive,
        ancestorLineageLink: row.ancestorLineageLink,
      })),
      /**
       * ⚠ RECOMPUTED EVERY CALL, NEVER STORED. See the procedure header — nothing may persist an
       * exclusion or integrity verdict, because the exclusions this data drives are temporary.
       */
      integrity: {
        missingLineageLink,
        tabaqaMismatch,
        rootedOutsideWaqif,
        /**
         * ⚠ ALWAYS EMPTY HERE, AND HONESTLY SO. A one-row cycle is impossible (CHECK
         * `beneficiary_no_self_parent`) and a LONGER cycle is refused by the ENGINE
         * (`LINEAGE_CYCLE`), not detected here: `qmulate_beneficiary_ancestry()` breaks a cycle with a
         * path array and CAPS the recursion, so a cyclic graph yields a TRUNCATED walk rather than a
         * flag. Reporting an empty list is the accurate statement; claiming detection would not be.
         */
        cycles: [] as string[],
      },
    };
  }),

  /**
   * The picker `endowment.recordDeedTerms` needs: `CHARITABLE_JIHA` rows on this waqf that carry
   * NEITHER a `lineageLink` NOR a `tabaqa`. Moved verbatim from `root.ts` in S5/E4.
   *
   * ⚠ RETURNING CANDIDATES IS NOT INFERRING A REVERSION (R7-c). The engine must NEVER conclude that a
   * charity is the endowment's ultimate taker because it happens to be present in the register — the
   * مآل clause is a RECORDED deed clause, entered by a human and signed by the Nazir through
   * `endowment.recordDeedTerms`. This procedure answers "which rows COULD a clause name", and the
   * response says so on its face.
   *
   * A recorded ultimate taker is not a descendant, so a row carrying a lineage edge or a generation is
   * excluded from the list rather than offered and then refused at signing time.
   */
  ultimateTakerCandidates: endowmentScopedProcedure('beneficiary:beneficiary:read').query(
    async ({ ctx }) => {
      const rows = await ctx.db.beneficiary.findMany({
        where: {
          waqfId: ctx.waqfId,
          kind: 'CHARITABLE_JIHA' as never,
          lineageLink: null,
          tabaqa: null,
        },
        select: {
          id: true,
          branch: true,
          relationshipAr: true,
          categoryDescriptionAr: true,
          stipulatedWeight: true,
        },
        orderBy: { id: 'asc' },
      });

      return rows.map((row) => ({
        id: row.id,
        branch: row.branch,
        relationshipAr: row.relationshipAr,
        categoryDescriptionAr: row.categoryDescriptionAr,
        // A WEIGHT IS NOT MONEY, but it crosses as a decimal STRING all the same: `Decimal(38,18)` does
        // not fit IEEE-754, and a taker's share IS its recorded weight (per capita is the bloodline's
        // rule, not a charity's). `null` is a fact the mapper REFUSES rather than substitutes.
        stipulatedWeight: row.stipulatedWeight === null ? null : String(row.stipulatedWeight),
      }));
    },
  ),

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * S5/E4 · THE WRITE SURFACE
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * Enrol a member (BR-201/BR-204) — the ONLY door for the three eligibility columns.
   *
   * The coherence refusals mirror the seed's (`map.ts`) and the engine's, so an incoherent record
   * is refused with a readable message before a row exists:
   *  · a `CHARITABLE_JIHA` carries NO edge, NO link, NO ṭabaqa (it is not a descendant);
   *  · a `FAMILY`/`CATEGORY_ONLY` member MUST carry a `lineageLink` (R6 — the engine will not pay
   *    someone it cannot place) and a ṭabaqa equal to the depth its edge derives;
   *  · the parent must exist ON THIS ENDOWMENT (the composite FK makes a cross-endowment edge
   *    structurally impossible; this refusal is the readable version);
   *  · a living member carries no death certification, and a deceased one carries a dual-dated one
   *    (enrolling DECEASED ancestors is legitimate and necessary — R7's data obligation: a
   *    reverting deed needs its dead descendants on record).
   */
  enrol: endowmentScopedProcedure('beneficiary:beneficiary:write')
    .input(
      z
        .object({
          branch: z.string().min(1).max(200),
          /** Arabic-authoritative (NFR-01). Required; the English label is optional. */
          relationshipAr: z.string().min(1).max(200),
          relationshipEn: z.string().min(1).max(200).nullable(),
          kind: kindInput,
          parentId: beneficiaryId.nullable(),
          lineageLink: lineageLinkInput.nullable(),
          line: lineInput,
          tabaqa: z.number().int().positive().nullable(),
          active: z.boolean(),
          /** The death CERTIFICATION date — required exactly when `active` is false and the member is dead. */
          deceasedOn: calendarDate.nullable(),
          sharePercent: sharePercentInput.nullable(),
          stipulatedWeight: weightInput.nullable(),
          residency: residencyInput,
          /**
           * BR-206. Null = not captured; a CATEGORY_ONLY member stays disbursement-blocked until it
           * is. ⚠ `.trim()` is LOAD-BEARING, not tidiness: the engine's `CATEGORY_NOT_CAPTURED`
           * gate treats a whitespace-only description as blank (`gates.ts` trims), so a `"   "` that
           * satisfied a bare `.min(1)` would show CAPTURED in the registry while the engine kept
           * WITHHOLDING — the two disagreeing (S5 correctness adversary). Trimming here makes the
           * stored value and the gate's "blank" test agree.
           */
          categoryDescriptionAr: z.string().trim().min(1).max(2000).nullable(),
        })
        .superRefine((value, refusal) => {
          // The same coherence the database CHECK `beneficiary_active_not_deceased` enforces,
          // refused at parse so the caller gets a field-level message rather than a 23514.
          if (value.active && value.deceasedOn !== null) {
            refusal.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['deceasedOn'],
              message:
                'active: true with a death certification date is incoherent — a certified death ' +
                'and a living member cannot be one record.',
            });
          }
          if (!value.active && value.deceasedOn === null && value.kind !== 'CATEGORY_ONLY') {
            // ⚠ NOT symmetric with the engine, deliberately: `active: false` without a certification
            // is a SCOPE EXIT, which R7-D1 keeps distinct from a death — but enrolling a member as
            // already-out-of-scope with no story is far more likely a slip than a fact, and an
            // unenumerated CATEGORY_ONLY placeholder is the one legitimate holder of that state
            // (R7-D1, owner-confirmed). Family scope-exits are recorded via a future correction
            // path, not at enrolment.
            refusal.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['active'],
              message:
                'an inactive FAMILY/CHARITABLE_JIHA enrolment must carry its death certification ' +
                '(deceasedOn); a scope exit without a death is not an enrolment-time state.',
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      // ⚠ THE COHERENCE ENROL ENFORCES IS waqfType-DEPENDENT, AND OMITTING THAT WAS THE S5
      // CORRECTNESS ADVERSARY'S HIGH FINDING. Without the type, enrol applied the ذري/R6 rules to
      // EVERY endowment: on a خيري (PUBLIC_CHARITABLE) waqf it (a) FALSELY refused an edgeless
      // CATEGORY_ONLY segment the engine legally accepts (R6-F1 scopes the edge requirement to ذري
      // deeds), and (b) ACCEPTED a bloodline member (a lineageLink or a ṭabaqa) the engine refuses,
      // silently poisoning every future run of that endowment. The three خيري refusals below and
      // R6-F1's ذري-only edge scoping are PRODUCT POSITIONS (memo Q6, product owner 2026-08-17) —
      // enrol mirrors the engine's `assertSingleWaqfNature` / `buildLineage` (resolver.ts), by the
      // engine's own discriminator codes, so the register and a run cannot disagree. ⚠ Unlike the
      // seed (which defers the خيري mirrors to run time — one authored file, reviewed as a whole),
      // enrol is a LIVE per-form action: a fat-fingered bloodline member on a خيري waqf would break
      // every run with no warning, so the write boundary refuses it here.
      const waqf = await ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId },
        select: { type: true, entitlementOrder: true },
      });
      if (waqf === null) {
        // ctx.waqfId resolved at rung 2, so a null row is a torn scope, not a caller fact — refuse
        // through the same non-disclosure path as a missing endowment.
        throw new ApiError(
          'NO_GRANT',
          `waqf ${ctx.waqfId} is not visible through this caller's own client, so a beneficiary ` +
            `cannot be enrolled on it.`,
          { waqfId: ctx.waqfId },
        );
      }
      const waqfType = String(waqf.type);
      const order = String(waqf.entitlementOrder);

      // خيري MIRROR (memo Q6, absolute): a charitable waqf has no bloodline and no generations, so
      // no member may carry a descent claim or a ṭabaqa. Checked before the kind branches because it
      // applies to a FAMILY or CATEGORY_ONLY row regardless of what else is wrong with it.
      if (waqfType === 'PUBLIC_CHARITABLE') {
        if (input.lineageLink !== null || input.parentId !== null) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `the waqf is typed PUBLIC_CHARITABLE (وقف خيري) but this beneficiary records a ` +
              `lineageLink or a parent edge — the recorded claim that they descend from the waqif. ` +
              `A charitable waqf's beneficiaries are the segment the waqif chose, not the waqif's ` +
              `bloodline; this record would make the endowment both خيري and ذري, which a waqf ` +
              `cannot be.`,
            { details: { refusal: 'DESCENDANT_ON_CHARITABLE_WAQF', waqfId: ctx.waqfId } },
          );
        }
        if (input.tabaqa !== null) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `the waqf is typed PUBLIC_CHARITABLE (وقف خيري) but this beneficiary records a ` +
              `generational ṭabaqa. A charitable waqf's beneficiaries sit in no ṭabaqāt — there is ` +
              `no bloodline to rank them by.`,
            { details: { refusal: 'TABAQA_ON_CHARITABLE_WAQF', waqfId: ctx.waqfId } },
          );
        }
      }

      if (input.kind === 'CHARITABLE_JIHA') {
        if (input.parentId !== null || input.lineageLink !== null || input.tabaqa !== null) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `a CHARITABLE_JIHA is not a descendant of the waqif: it carries no parentId, no ` +
              `lineageLink and no tabaqa. Recorded ultimate takers included — مآل الوقف names a ` +
              `destination, not a bloodline. Same condition the engine refuses.`,
            { details: { refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT', waqfId: ctx.waqfId } },
          );
        }
      } else {
        // R6 / R6-F1 (memo Q6): the edge is demanded when DESCENT is the eligibility — a FAMILY
        // member anywhere, or any non-jiha on a ذري waqf — and NOT on a خيري waqf's CATEGORY_ONLY
        // segment (there the BR-206 blank-category gate covers a not-yet-identified class) nor on a
        // direct-use deed (nobody is paid, so nobody must be placed). This exactly mirrors the
        // engine's `descentIsTheEligibility` guard (resolver.ts).
        const descentIsTheEligibility = input.kind === 'FAMILY' || waqfType === 'FAMILY_DHURRI';
        if (descentIsTheEligibility && order !== 'NA_DIRECT_USE' && input.lineageLink === null) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `a ${input.kind} member with no lineageLink cannot be enrolled on this ${waqfType} ` +
              `waqf. R6 (product owner, 2026-08-03): eligibility comes from DESCENT, so the descent ` +
              `must be on record whatever order the deed uses — the engine will not pay someone it ` +
              `cannot place in the family tree.`,
            { details: { refusal: 'LINEAGE_LINK_MISSING', waqfId: ctx.waqfId } },
          );
        }
        // The ṭabaqa cross-check applies only to a member that is IN the graph (carries a link). A
        // member with no link is only reachable here on a خيري or direct-use deed, where it carries
        // no ṭabaqa either (خيري refused it above; direct-use never derives one) and is accepted.
        if (input.lineageLink !== null) {
          // Derived ṭabaqa: parentId null = A CHILD OF THE WAQIF (depth 1), never "unknown".
          let derived = 1;
          if (input.parentId !== null) {
            const parent = await ctx.db.beneficiary.findFirst({
              where: { id: input.parentId, waqfId: ctx.waqfId },
              select: { id: true, tabaqa: true, kind: true, lineageLink: true },
            });
            if (parent === null) {
              throw new DomainError(
                'SHART_INCOMPLETE',
                `parent ${input.parentId} does not exist on waqf ${ctx.waqfId}. A family tree is ` +
                  `waqf-scoped: the composite foreign key makes a cross-endowment edge structurally ` +
                  `impossible, and this is its readable refusal.`,
                { details: { refusal: 'LINEAGE_PARENT_UNKNOWN', waqfId: ctx.waqfId } },
              );
            }
            if (parent.lineageLink === null || parent.tabaqa === null) {
              throw new DomainError(
                'SHART_INCOMPLETE',
                `parent ${input.parentId} is not a placeable member of the lineage graph (it ` +
                  `carries no lineageLink or no tabaqa), so it cannot be anyone's ancestor. Fix the ` +
                  `parent's record first — the cross-check exists so the two sides test each other.`,
                { details: { refusal: 'LINEAGE_PARENT_UNKNOWN', waqfId: ctx.waqfId } },
              );
            }
            derived = parent.tabaqa + 1;
          }
          if (input.tabaqa !== derived) {
            throw new DomainError(
              'SHART_INCOMPLETE',
              `tabaqa ${String(input.tabaqa)} disagrees with the depth the parent edge derives ` +
                `(${String(derived)}). The supplied value is a CROSS-CHECK, not a trusted input — ` +
                `the engine halts on such a graph, so it is refused at enrolment instead.`,
              {
                details: {
                  refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH',
                  waqfId: ctx.waqfId,
                  tabaqaSupplied: input.tabaqa,
                  tabaqaDerived: derived,
                },
              },
            );
          }
        }
      }

      // The dual-dated certification, derived server-side from the caller's calendar date
      // (convention 2 / ADR-0007: ONE implementation derives every Hijri twin).
      const deceasedAt =
        input.deceasedOn === null ? null : new Date(`${input.deceasedOn}T00:00:00Z`);
      const deceasedAtHijri = deceasedAt === null ? null : String(toHijriSnapshot(deceasedAt));

      const created = await ctx.db.beneficiary.create({
        data: {
          waqfId: ctx.waqfId,
          branch: input.branch,
          relationshipAr: input.relationshipAr,
          relationshipEn: input.relationshipEn,
          kind: input.kind as never,
          residency: input.residency as never,
          categoryDescriptionAr: input.categoryDescriptionAr,
          tabaqa: input.tabaqa,
          line: input.line as never,
          parentId: input.parentId,
          lineageLink: input.lineageLink as never,
          active: input.active,
          deceasedAt,
          deceasedAtHijri,
          sharePercent: input.sharePercent,
          stipulatedWeight: input.stipulatedWeight,
          verificationStatus: 'UNVERIFIED' as never,
          confidentiality: 'SENSITIVE_PII' as never,
          createdBy: ctx.actor.actorId,
        },
        select: { id: true },
      });
      return { id: created.id, waqfId: ctx.waqfId };
    }),

  /**
   * Certify a death (BR-204 / R-FRONTIER). ONE-WAY: `active` goes false and the dual-dated
   * certification is recorded; there is deliberately NO reverse procedure in S5 (a wrongly
   * certified death is a correction path that needs its own design — owed, surfaced in BUILD-PLAN).
   *
   * ⚠ A death moves OTHER PEOPLE's money: the deceased's children arrive at the living frontier
   * the moment this commits (R-FRONTIER), and nothing here recomputes or caches that — the engine
   * reads the graph fresh every run, which is the whole reason no verdict is ever persisted.
   */
  recordDeath: endowmentScopedProcedure('beneficiary:beneficiary:write')
    .input(z.object({ beneficiaryId, deceasedOn: calendarDate }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.beneficiary.findFirst({
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        select: { id: true, active: true, deceasedAt: true, kind: true },
      });
      if (row === null) {
        throw new ApiError(
          'NO_GRANT',
          `beneficiary ${input.beneficiaryId} is not visible to this caller on waqf ${ctx.waqfId}.`,
          { beneficiaryId: input.beneficiaryId, waqfId: ctx.waqfId },
        );
      }
      if (String(row.kind) !== 'FAMILY') {
        // ⚠ A DEATH IS A FACT ABOUT A NATURAL PERSON. A CHARITABLE_JIHA (a charity, possibly the
        // recorded ultimate taker) and a CATEGORY_ONLY class ("the poor of the district") do not
        // die, and marking one `active: false` through this one-way path is exactly the R7-D1 shape
        // the engine defends against — an unenumerated placeholder's inactivity must NOT read as a
        // bloodline extinction. No money moves either way (the engine keys R7-D1 on `kind`), but the
        // registry must not hold an incoherent certification. Found by the S5 correctness adversary.
        throw new DomainError(
          'DEATH_ON_NON_PERSON',
          `beneficiary ${input.beneficiaryId} is a ${String(row.kind)}, not a natural person. A ` +
            `death is certified for a FAMILY beneficiary; a charity or a not-yet-identified class ` +
            `is retired through a different, reversible act, not a one-way death certification.`,
          { details: { beneficiaryId: input.beneficiaryId, kind: String(row.kind) } },
        );
      }
      if (row.deceasedAt !== null) {
        throw new DomainError(
          'DEATH_ALREADY_CERTIFIED',
          `beneficiary ${input.beneficiaryId} already carries a death certification. A death is ` +
            `certified once; correcting a wrong certification is an owed design (BUILD-PLAN), not ` +
            `an overwrite.`,
          { details: { beneficiaryId: input.beneficiaryId } },
        );
      }
      const deceasedAt = new Date(`${input.deceasedOn}T00:00:00Z`);
      await ctx.db.beneficiary.update({
        // ⚠ `{ id, waqfId }`, NOT the compound alias `waqfId_id: {…}` — same pin, same atomicity
        // (Prisma's extended WhereUniqueInput allows non-unique fields beside the unique key), but
        // the alias spelling BROKE every update on this surface: the force filter's
        // UNIQUE_WRITE_OPS pre-check (scoping.ts) re-feeds this `where` into a plain `findFirst`,
        // whose WhereInput has no `waqfId_id` member, so Prisma threw `Unknown argument` before the
        // update ran. Found by `test/e4-registry.integration.test.ts` — all four update-shaped
        // procedures were unreachable under the alias.
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        data: {
          active: false,
          deceasedAt,
          deceasedAtHijri: String(toHijriSnapshot(deceasedAt)),
        },
        select: { id: true },
      });
      return { id: input.beneficiaryId, active: false };
    }),

  /**
   * Record a KYC verification/refresh (BR-205). The refresh instant is THE SERVER'S CLOCK — a
   * verification is an act performed now, and a caller-supplied timestamp would let a stale file
   * be dressed as fresh. Sets `verificationStatus: VERIFIED` and the dual-dated refresh instant;
   * freshness is recomputed on every read from this value plus the Setting, never stored.
   */
  refreshKyc: endowmentScopedProcedure('beneficiary:beneficiary:write')
    .input(z.object({ beneficiaryId }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.beneficiary.findFirst({
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        select: { id: true },
      });
      if (row === null) {
        throw new ApiError(
          'NO_GRANT',
          `beneficiary ${input.beneficiaryId} is not visible to this caller on waqf ${ctx.waqfId}.`,
          { beneficiaryId: input.beneficiaryId, waqfId: ctx.waqfId },
        );
      }
      const refreshedAt = ctx.now;
      await ctx.db.beneficiary.update({
        // ⚠ `{ id, waqfId }`, NOT the compound alias `waqfId_id: {…}` — same pin, same atomicity
        // (Prisma's extended WhereUniqueInput allows non-unique fields beside the unique key), but
        // the alias spelling BROKE every update on this surface: the force filter's
        // UNIQUE_WRITE_OPS pre-check (scoping.ts) re-feeds this `where` into a plain `findFirst`,
        // whose WhereInput has no `waqfId_id` member, so Prisma threw `Unknown argument` before the
        // update ran. Found by `test/e4-registry.integration.test.ts` — all four update-shaped
        // procedures were unreachable under the alias.
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        data: {
          verificationStatus: 'VERIFIED' as never,
          kycLastRefreshed: refreshedAt,
          kycLastRefreshedHijri: String(toHijriSnapshot(refreshedAt)),
        },
        select: { id: true },
      });
      return {
        id: input.beneficiaryId,
        kycLastRefreshed: refreshedAt.toISOString(),
      };
    }),

  /**
   * Capture a category/characteristics description (BR-206) — the write that UNBLOCKS
   * disbursement for a `CATEGORY_ONLY` member (`CATEGORY_NOT_CAPTURED` is rank 0 in the gate
   * ladder). Arabic-authoritative (NFR-01).
   *
   * Refused on a `FAMILY` member: an individually identified person has no "category", and
   * accepting one here would turn the BR-206 field into free text on every row.
   */
  captureCategory: endowmentScopedProcedure('beneficiary:beneficiary:write')
    .input(z.object({ beneficiaryId, categoryAr: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.beneficiary.findFirst({
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        select: { id: true, kind: true },
      });
      if (row === null) {
        throw new ApiError(
          'NO_GRANT',
          `beneficiary ${input.beneficiaryId} is not visible to this caller on waqf ${ctx.waqfId}.`,
          { beneficiaryId: input.beneficiaryId, waqfId: ctx.waqfId },
        );
      }
      if (String(row.kind) === 'FAMILY') {
        throw new DomainError(
          'CATEGORY_ON_IDENTIFIED_MEMBER',
          `beneficiary ${input.beneficiaryId} is an individually identified FAMILY member; BR-206's ` +
            `category capture applies to a not-yet-identified class (CATEGORY_ONLY) or a charitable ` +
            `purpose (CHARITABLE_JIHA), not to a person.`,
          { details: { beneficiaryId: input.beneficiaryId } },
        );
      }
      await ctx.db.beneficiary.update({
        // ⚠ `{ id, waqfId }`, NOT the compound alias `waqfId_id: {…}` — same pin, same atomicity
        // (Prisma's extended WhereUniqueInput allows non-unique fields beside the unique key), but
        // the alias spelling BROKE every update on this surface: the force filter's
        // UNIQUE_WRITE_OPS pre-check (scoping.ts) re-feeds this `where` into a plain `findFirst`,
        // whose WhereInput has no `waqfId_id` member, so Prisma threw `Unknown argument` before the
        // update ran. Found by `test/e4-registry.integration.test.ts` — all four update-shaped
        // procedures were unreachable under the alias.
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        data: { categoryDescriptionAr: input.categoryAr },
        select: { id: true },
      });
      return { id: input.beneficiaryId, categoryCaptured: true };
    }),

  /**
   * Record — or clear — the UBO flag and minimum dataset (BR-202/BR-203), gated by the DISTINCT
   * `beneficiary:ubo:write` verb.
   *
   * `…Enc` values cross this boundary as PLAINTEXT and land as ciphertext (the encryption
   * extension); the `…Hmac` siblings are DERIVED there and a caller-supplied value throws
   * (`HmacColumnWriteError`). Clearing the flag also clears the dataset — a non-UBO row carrying
   * an identity/banking payload would be sensitive data with no stated basis for holding it.
   */
  recordUbo: endowmentScopedProcedure('beneficiary:ubo:write')
    .input(
      z.object({
        beneficiaryId,
        ubo: z.discriminatedUnion('isUbo', [
          z.object({ isUbo: z.literal(false) }),
          z.object({
            isUbo: z.literal(true),
            idType: z.string().min(1).max(64),
            idNumber: z.string().min(1).max(128),
            bankingRefForProceeds: z.string().min(1).max(128),
            shareOfProceedsPercent: sharePercentInput.nullable(),
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.beneficiary.findFirst({
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        select: { id: true },
      });
      if (row === null) {
        throw new ApiError(
          'NO_GRANT',
          `beneficiary ${input.beneficiaryId} is not visible to this caller on waqf ${ctx.waqfId}.`,
          { beneficiaryId: input.beneficiaryId, waqfId: ctx.waqfId },
        );
      }
      const data = input.ubo.isUbo
        ? {
            isUbo: true,
            uboIdTypeEnc: input.ubo.idType,
            uboIdNumberEnc: input.ubo.idNumber,
            uboBankingRefEnc: input.ubo.bankingRefForProceeds,
            uboShareOfProceeds: input.ubo.shareOfProceedsPercent,
          }
        : {
            isUbo: false,
            uboIdTypeEnc: null,
            uboIdNumberEnc: null,
            uboBankingRefEnc: null,
            uboShareOfProceeds: null,
          };
      await ctx.db.beneficiary.update({
        // ⚠ `{ id, waqfId }`, NOT the compound alias `waqfId_id: {…}` — same pin, same atomicity
        // (Prisma's extended WhereUniqueInput allows non-unique fields beside the unique key), but
        // the alias spelling BROKE every update on this surface: the force filter's
        // UNIQUE_WRITE_OPS pre-check (scoping.ts) re-feeds this `where` into a plain `findFirst`,
        // whose WhereInput has no `waqfId_id` member, so Prisma threw `Unknown argument` before the
        // update ran. Found by `test/e4-registry.integration.test.ts` — all four update-shaped
        // procedures were unreachable under the alias.
        where: { id: input.beneficiaryId, waqfId: ctx.waqfId },
        data,
        select: { id: true },
      });
      return { id: input.beneficiaryId, isUbo: input.ubo.isUbo };
    }),
});
