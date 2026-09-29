/**
 * `shart` — BR-103's "structured, referenceable conditions". **READ ONLY, FOR EVER.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THERE IS NO `shart.update`, AND ITS ABSENCE IS THE FEATURE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Binding rule 1, restated unconditionally by the product owner on 2026-07-29 and recorded as
 * ADR-0006: the Shart al-Waqif **cannot be changed at all** — not by a direct edit, a migration, a
 * backfill, a "correction", and **not by any approval, however complete**. `qmulate_shart_guard()`
 * tier 1 raises SQLSTATE 42501 on any change to the four columns WITHOUT CONSULTING THE
 * RESERVED-MATTER GUC, and `withReservedMatter()` refuses them before the transaction opens.
 *
 * So this router deliberately offers **no write of any kind**, and that is a stronger statement than
 * "a write that fails":
 *  · An operation that can only ever fail IMPLIES a key exists somewhere and that the caller simply
 *    lacks it. There is no key. The absence of the procedure is the only honest encoding of that.
 *  · A `shart.update` would also be a place a future change could quietly acquire a
 *    `withReservedMatter()` wrapper and become a working amendment path, which is exactly the hole
 *    ADR-0006 closed.
 * A correction directed by a competent authority or a court is a **SUPERSEDING INSTRUMENT recorded as
 * a NEW record** — never an edit to this one. The founder's own terms that could not be written at
 * insert (`continuationStipulation`, the مآل clause) are a different tier and go through
 * `endowment.recordDeedTerms`; they are write-once, not amendable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `unspecified` IS NEVER REPORTED AS `none`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The Shart JSON's own load-bearing distinction, kept intact on the wire:
 *   `maintenanceReserve: { kind: 'unspecified' }`  the deed is SILENT / we do not know  → ADVISORY
 *   `maintenanceReserve: { kind: 'none' }`         the deed POSITIVELY stipulates none  → a decision
 *   `reversion: { status: 'unread' }`              nobody has read the مآل clause       → HALTING
 *   `reversion: { status: 'none' }`                the deed records no ultimate taker   → a statement
 * Collapsing either pair would let an un-transcribed deed masquerade as a transcribed one, and
 * "where does this endowment go when the family ends?" is not a question code may answer by default
 * (Binding rule 6).
 *
 * And `completeness.missing` ≠ `completeness.advisory`: `missing` is HALTING (the engine returns
 * `SHART_INCOMPLETE` and computes nothing), `advisory` is not (the run proceeds and the flag is
 * surfaced). {@link shartRouter.completeness} keeps them in separate arrays for that reason.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE REFUSAL DISCRIMINATORS ARE DIAGNOSTIC CODES, NOT COPY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `wouldHaltWith` returns `SHART_REFUSALS` members (`CONTINUATION_STIPULATION_UNRECOGNISED`,
 * `LINEAGE_LINK_MISSING`, …). They are rendered UNTRANSLATED. The single user-facing sentence for a
 * halt is `errors.domain.SHART_INCOMPLETE`; per-discriminator ar/en wording is product-approved legal
 * text a beneficiary may dispute before the Authority, it is E10/E12's to write, and **it must never
 * be invented in a code change**. Nothing in this file contains user-facing prose.
 */

import { SHART_REFUSALS, type ShartRefusal } from '@qmulate/domain/distribution';

import { ApiError } from '../errors.js';
import { endowmentScopedProcedure, router } from '../trpc.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Reading the JSON without a second schema
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The subset of the Shart JSON this router projects.
 *
 * ⚠ IT IS A READ, NOT A VALIDATION, AND THE DIFFERENCE IS DELIBERATE. The zod schema
 * (`shartAlWaqifSchema`) lives in `packages/database/src/seed/shart.ts` and is **not exported from
 * that package's barrel**, so it cannot be imported here without a change to a file this owner does
 * not own. Re-declaring it would create a SECOND definition of the founder's conditions' shape — two
 * sides that must agree with nothing comparing them, which is this repo's recorded failure mode.
 *
 * So the read is structural and TOTAL: every field is narrowed defensively and an unrecognised shape
 * surfaces as `null`/`'unrecognised'` rather than being coerced. A row that does not match is a data
 * problem to SEE, not one to smooth over — and the write path cannot produce one, because the seed
 * validates against the real schema before insert.
 *
 * ⚠ REPORTED AS OWED (E5+): `schema.prisma`'s `Waqf` comment used to claim the schema lives in
 * `@qmulate/domain/shart`. That module does not exist and never has; the database agent corrected the
 * comment in S4. The MOVE is still owed — the seed and the engine should share one definition — and
 * when it lands, THIS function should be replaced by a call to it rather than extended.
 */
interface ShartProjection {
  readonly orderRule: string | null;
  readonly continuationStipulation: string | null;
  readonly reversion: {
    readonly status: string;
    readonly kind: string | null;
    readonly ultimateTakerIds: readonly string[];
    readonly recordedAtHijri: string | null;
  };
  readonly tiers: readonly {
    readonly tabaqa: number | null;
    readonly labelAr: string | null;
    readonly lines: readonly string[];
    readonly stipulatedWeight: number | null;
  }[];
  readonly lines: readonly string[];
  readonly maintenanceReserve: { readonly kind: string };
  readonly disbursementChannel: { readonly kind: string };
  readonly disbursementSchedule: string | null;
  readonly nazirFee: {
    readonly basis: string | null;
    /** ⚠ unverified — confirm against primary law. Deed-set (ʿushr), never a statutory rate. */
    readonly ratePercent: number | null;
    readonly amountSar: string | null;
    readonly unverified: true;
  };
  readonly completeness: {
    readonly status: string | null;
    readonly missing: readonly string[];
    readonly advisory: readonly string[];
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** The sentinel for a shape this build does not recognise. Never coerced into a real value. */
const UNRECOGNISED = 'unrecognised' as const;

function projectShart(raw: unknown): ShartProjection {
  const shart = asRecord(raw);
  const reversion = asRecord(shart['reversion']);
  const completeness = asRecord(shart['completeness']);
  const nazirFee = asRecord(shart['nazirFee']);

  return {
    orderRule: asString(shart['orderRule']),
    // NULL is a MEANINGFUL answer: the deed states no continuation term. Absent keeps HALTING at the
    // engine and is never assumed (Binding rule 6).
    continuationStipulation: asString(shart['continuationStipulation']),
    reversion: {
      // ⚠ THREE STATES, AND `unread` MUST NEVER BE REPORTED AS `none`. See the file header.
      status: asString(reversion['status']) ?? UNRECOGNISED,
      kind: asString(reversion['kind']),
      ultimateTakerIds: asStringArray(reversion['ultimateTakerIds']),
      recordedAtHijri: asString(reversion['recordedAtHijri']),
    },
    tiers: (Array.isArray(shart['tiers']) ? shart['tiers'] : []).map((tier) => {
      const row = asRecord(tier);
      return {
        tabaqa: asNumber(row['tabaqa']),
        labelAr: asString(row['labelAr']),
        lines: asStringArray(row['lines']),
        // NULL means the deed does not stipulate an absolute weight — a FACT, not a default. The
        // engine then renormalises relative weights within the entitled cohort.
        stipulatedWeight: asNumber(row['stipulatedWeight']),
      };
    }),
    // The distinct ẓuhūr/buṭūn lines the tiers actually mention. Derived, never a second stored list.
    lines: [
      ...new Set(
        (Array.isArray(shart['tiers']) ? shart['tiers'] : []).flatMap((tier) =>
          asStringArray(asRecord(tier)['lines']),
        ),
      ),
    ].sort(),
    maintenanceReserve: {
      kind: asString(asRecord(shart['maintenanceReserve'])['kind']) ?? UNRECOGNISED,
    },
    disbursementChannel: {
      kind: asString(asRecord(shart['disbursementChannel'])['kind']) ?? UNRECOGNISED,
    },
    disbursementSchedule: asString(shart['disbursementSchedule']),
    nazirFee: {
      basis: asString(nazirFee['basis']),
      ratePercent: asNumber(nazirFee['ratePercent']),
      // A money figure crosses as a STRING, never a JS number (Decimal(18,2) does not fit IEEE-754).
      amountSar: asString(nazirFee['amountSar']),
      // ⚠ THE ʿUSHR RATE IS UNVERIFIED (Binding rule 3) — deed-set, not statutory.
      unverified: true as const,
    },
    completeness: {
      status: asString(completeness['status']),
      missing: asStringArray(completeness['missing']),
      advisory: asStringArray(completeness['advisory']),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Which SHART_REFUSALS discriminator a run would hit TODAY
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Maps the Shart's own halting-gap codes onto the engine's refusal discriminators.
 *
 * ⚠ IT IS A PROJECTION OF WHAT THE ENGINE WOULD SAY, NOT A SECOND DECISION. The engine decides; this
 * answers "what would it say if you ran it now" so a Nazir can see the halt before a distribution
 * period rather than during one. Every value is asserted to be a real `SHART_REFUSALS` member below,
 * so a discriminator that is renamed in the engine fails this file rather than shipping a code the
 * engine no longer raises.
 */
const HALTING_GAP_TO_REFUSAL: Readonly<Record<string, ShartRefusal>> = {
  ORDER_RULE: 'ENTITLEMENT_ORDER_UNRECOGNISED',
  CONTINUATION_STIPULATION: 'CONTINUATION_STIPULATION_UNRECOGNISED',
  REVERSION_CLAUSE_UNREAD: 'REVERSION_ULTIMATE_TAKER_UNKNOWN',
  CHARITABLE_FAMILY_SPLIT: 'COHORT_MIXES_CHARITABLE_AND_FAMILY',
  TIER_DEFINITIONS: 'TABAQA_MISMATCHES_LINEAGE_DEPTH',
  DISBURSEMENT_CHANNEL: 'ENTITLEMENT_RULE_UNMAPPED',
};

/**
 * ⚠ A BUILD-TIME SELF-CHECK, RUN AT IMPORT. A mapping onto a discriminator the engine does not raise
 * would put a code on a Nazir's screen that no run can ever produce — the same class of defect as a
 * permission typo that denies silently, and it fails HERE rather than at request time.
 */
for (const [gap, refusal] of Object.entries(HALTING_GAP_TO_REFUSAL)) {
  if (!(SHART_REFUSALS as readonly string[]).includes(refusal)) {
    throw new Error(
      `shart.completeness maps the halting gap ${gap} onto "${refusal}", which is not a member of ` +
        `SHART_REFUSALS. The engine's discriminators are the closed vocabulary; fix the mapping, do ` +
        `not add a code the engine cannot raise.`,
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const shartRouter = router({
  /**
   * The founder's conditions, as REFERENCEABLE FIELDS (BR-103) — order rule, tiers, lines, maintenance
   * reserve, disbursement channel, the deed-set Nazir fee, the continuation stipulation and the مآل
   * clause.
   *
   * `immutable: true` is on the payload on purpose: the client must not have to infer, from the
   * absence of an update procedure, that there is no amendment path.
   */
  get: endowmentScopedProcedure('endowment:waqf:read').query(async ({ ctx }) => {
    const waqf = await ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: {
        shartAlWaqif: true,
        shartAlWaqifVersion: true,
        shartAlWaqifSetAt: true,
        shartAlWaqifSetAtHijri: true,
      },
    });
    if (waqf === null) {
      throw new ApiError(
        'NO_GRANT',
        `waqf ${ctx.waqfId} is not visible through this caller's own client. Surfaced as NOT_FOUND so ` +
          `the endowment's existence is not disclosed (§10 §7.2).`,
        { waqfId: ctx.waqfId },
      );
    }

    return {
      version: waqf.shartAlWaqifVersion,
      setAt: waqf.shartAlWaqifSetAt.toISOString(),
      // The FROZEN Umm-al-Qura snapshot taken at insert. Never recomputed downstream (D-4).
      setAtHijri: waqf.shartAlWaqifSetAtHijri,
      structured: projectShart(waqf.shartAlWaqif),
      /** ⚠ Binding rule 1 / ADR-0006. There is no `shart.update`, and there never will be. */
      immutable: true as const,
      supersedingInstrumentOnly: true as const,
    };
  }),

  /**
   * What is MISSING (halting), what is ADVISORY (not), and which discriminators a run would hit today.
   *
   * ⚠ THE TWO LISTS ARE NEVER MERGED. `missing` means the engine refuses to compute; `advisory` means
   * it computes and raises a flag. A UI that showed one list of "issues" would make a halting gap look
   * like a warning, and a Nazir would discover the difference on the day a distribution was due.
   */
  completeness: endowmentScopedProcedure('endowment:waqf:read').query(async ({ ctx }) => {
    const waqf = await ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: { shartAlWaqif: true },
    });
    if (waqf === null) {
      throw new ApiError(
        'NO_GRANT',
        `waqf ${ctx.waqfId} is not visible through this caller's own client. Surfaced as NOT_FOUND so ` +
          `the endowment's existence is not disclosed (§10 §7.2).`,
        { waqfId: ctx.waqfId },
      );
    }

    const shart = projectShart(waqf.shartAlWaqif);

    return {
      /** HALTING. The engine returns `SHART_INCOMPLETE` and computes nothing. */
      missing: [...shart.completeness.missing],
      /** NON-HALTING. The run proceeds and the flag is surfaced. */
      advisory: [...shart.completeness.advisory],
      /**
       * The `SHART_REFUSALS` discriminators a run would hit, DEDUPLICATED and sorted.
       *
       * ⚠ RENDER THESE AS UNTRANSLATED DIAGNOSTIC CODES. The one user-facing sentence for a halt is
       * `errors.domain.SHART_INCOMPLETE`; per-discriminator ar/en wording is E10/E12's and must never
       * be invented in a code change.
       */
      wouldHaltWith: [
        ...new Set(
          shart.completeness.missing
            .map((gap) => HALTING_GAP_TO_REFUSAL[gap])
            .filter((refusal): refusal is ShartRefusal => refusal !== undefined),
        ),
      ].sort(),
      /**
       * ⚠ THE GAPS WITH NO MAPPED DISCRIMINATOR, NAMED RATHER THAN DROPPED. A halting gap that
       * silently produced no `wouldHaltWith` entry would read as "nothing would go wrong".
       */
      unmappedHaltingGaps: shart.completeness.missing.filter(
        (gap) => HALTING_GAP_TO_REFUSAL[gap] === undefined,
      ),
      /** ⚠ Never collapsed into `none`. See the file header. */
      maintenanceReserveKind: shart.maintenanceReserve.kind,
      reversionStatus: shart.reversion.status,
    };
  }),
});
