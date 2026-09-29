/**
 * `endowment` — BR-101's endowment record, and the ONE door through which a founder's condition that
 * was illegible at intake may ever be recorded.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THREE PROCEDURES, THREE DIFFERENT RUNGS, AND THE SPREAD IS THE DESIGN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   `get`              rung 2, `endowment:waqf:read`   — the whole BR-101 payload in one call
 *   `update`           rung 3a (maker), `endowment:waqf:write` — a DELIBERATELY TINY whitelist
 *   `recordDeedTerms`  rung 3c (SIGNER), `endowment:deed:sign` — a deed act, not a row edit
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT `update` MAY NOT ACCEPT, AND WHY EACH EXCLUSION IS DIFFERENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The input is `{ certificateExpiry, certificateExpiryHijri }` and nothing else:
 *  · `shartAlWaqif*` — NEVER writable, by anyone, through any path (Binding rule 1, ADR-0006).
 *    `qmulate_shart_guard()` tier 1 raises 42501 without consulting any approval, and
 *    `withReservedMatter()` refuses the columns before the transaction opens. **There is deliberately
 *    no `shart.update` anywhere in this package** — an operation that can only ever fail is worse
 *    than none, because its existence implies a key exists somewhere.
 *  · `certificateNumber` / `deedNumber` — reserved-matter-only at the database (migration 4/5), and
 *    the approval must name the artifact `waqf:<id>:<column>`. That path is `withReservedMatter()`,
 *    not this procedure.
 *  · `continuationStipulation`, `reversion*` — write-once (tier 3), and the first write is a DEED
 *    ACT. It goes through {@link endowmentRouter.recordDeedTerms} on the signer rung.
 *  · `classification` — goes through `classification.reclassify`, which appends the BR-104 history
 *    event in the SAME transaction. A bare column update would move the endowment's regulatory class
 *    with no history, which is the half of BR-104 that matters.
 *  · ⚠ `type`, `nature`, `entitlementOrder` — **SURFACED, NOT DECIDED.** These three are founder's
 *    conditions carried in freely-editable columns: they are not in `SHART_COLUMNS`, not in the
 *    reserved-matter tier, and not in `DOMAIN_WRITE_POLICIES.Waqf`'s overrides, so anyone holding
 *    `endowment:waqf:write` can retype a ذري endowment as خيري or change al-aʿlā fa-l-aʿlā to
 *    tashrik with an ordinary update. S4 makes that incoherent by putting `continuationStipulation`
 *    write-once directly beside `entitlementOrder`. This procedure REFUSES them (they are simply not
 *    in the input), which closes the door *this* file opens and closes nothing else — the residual is
 *    the raw column, and bringing all three into the write-once tier is a change to what a LIVE
 *    endowment permits, i.e. the owner's call.
 *    TODO(surface): may `Waqf.type` / `Waqf.nature` / `Waqf.entitlementOrder` be amended on a live
 *    endowment at all, or do they belong in the write-once/reserved tier beside
 *    `continuationStipulation`? S4 must not decide it silently in either direction.
 *
 *    ✓ **ANSWERED — product owner, 2026-08-16 (D-B): *"yes they are unchangable"*.** The question
 *    above is kept VERBATIM rather than deleted, because it is the record of what was asked and of
 *    the state the code shipped in. What changed: migration 13 adds the three columns to
 *    `qmulate_shart_guard()` as TIER 1b, **SEALED OUTRIGHT** — not write-once, because all three are
 *    NOT NULL and already populated, so there is no unwritten state and no first write to spend. No
 *    approval, GUC, migration or backfill opens them; a directed change is a SUPERSEDING INSTRUMENT
 *    recorded as a new record (Binding rule 1, ADR-0006). `DOMAIN_WRITE_POLICIES.Waqf.ungoverned`
 *    now lists them so the DATABASE's refusal is the one the caller sees rather than a permission
 *    message that would imply the right seat could do it, and
 *    `test/domain-write-gate.integration.test.ts` proves the seal holds for a NAZIR seat carrying
 *    every endowment write verb. This procedure still does not accept them — one fewer door.
 */

import { z } from 'zod';

import { canonicalJson, recordEvent, serializeForAudit } from '@qmulate/database';
import { DomainError } from '@qmulate/domain';
import { toHijriSnapshot } from '@qmulate/domain/dates';

import { ApiError, isDatabaseGuardRefusal } from '../errors.js';
import { toActorContext } from '../context.js';
import { HIJRI_SNAPSHOT_PATTERN, assertHijriPairAgrees } from '../dual-date.js';
import { decideThenExecute } from '../middleware/approval-plane.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { resolveScope } from '../middleware/scope.js';
import type { PermissionString } from '../permissions.js';
import { endowmentScopedProcedure, makerProcedure, router, signerProcedure } from '../trpc.js';
import { DEED_RECORD_READ } from './deed.js';

import type { ScopedContext } from '../middleware/scope.js';

/**
 * The permission that gates READING the endowment record — `endowment.get`'s rung-2 argument.
 *
 * ⚠ SPELLED ONCE AND SHARED, because a second copy is what V-E3-03 was. `routers/navigation.ts`
 * imports THIS constant to decide which endowments it may disclose, so the navigator and the record
 * reader are gated by the same string; two literals in two files that must agree is the failure mode
 * this repository keeps re-learning. `test/navigation-disclosure.integration.test.ts` proves the
 * resulting relationship for every seat in the role model.
 */
export const ENDOWMENT_RECORD_READ = 'endowment:waqf:read' satisfies PermissionString;

/**
 * May this caller be told a TRUSTEESHIP-DEED fact about this endowment?
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ G7-V2 — V-E3-03'S CLASS, LIVE INSIDE V-E3-03'S OWN REFERENCE POINT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * V-E3-03 was "navigation discloses what `endowment.get` refuses", and `endowment.get` was taken as
 * the standard. It was doing the same thing one layer down. MEASURED through `createCaller` as the
 * SEEDED seat `user-admin-001`, whose resolved grant permissions on `waqf-001` are exactly
 * `["endowment:waqf:read","admin:access_matrix:read","admin:access_matrix:write","audit:event:read"]`:
 *
 *   deed.get({ waqfId: 'waqf-001' })
 *     → THREW FORBIDDEN · "PERMISSION_DENIED: role SYSTEM_ADMIN holds an active grant on waqf
 *        waqf-001 but not endowment:deed:read"
 *   endowment.get({ waqfId: 'waqf-001' }).trusteeship
 *     → { "primaryNazir": "QMULATE (professional Nazir)", "jointlyLiable": true,
 *         "hasAuthorizedRep": true }
 *
 * The appointed Nazir's NAME, the Art. 11(5) liability position and the existence of a delegated
 * manager are the trusteeship deed's own facts (BR-105). A summary of a record is a read of that
 * record, exactly as a tree of an endowment is a read of the endowment.
 *
 * ── THE FIX IS A NARROWING OF THIS FILE, NEVER A WIDENING OF `deed.get` ─────────────────────
 * This asks {@link resolveScope} — the SAME function rung 2 mounts `deed.get` on, with the SAME
 * permission constant, imported from `./deed.js` so there is one spelling. `try/catch` is control
 * flow on purpose (the pattern `routers/navigation.ts` established): the alternative is a second
 * predicate that starts identical and drifts the first time the rung learns a new rule. Nothing is
 * audited — withholding a field from a caller who never asked for the deed is not an attempt on it,
 * and rung 2 already audits the denial when they DO ask.
 */
function maySeeDeedFacts(ctx: ScopedContext): boolean {
  try {
    resolveScope(ctx, ctx.waqfId, DEED_RECORD_READ);
    return true;
  } catch {
    return false;
  }
}

/**
 * ⊕ S11-1 — does this caller hold a WRITE verb on this endowment? The record screen asks so it can
 * render a write control ONLY to a seat that can use it: the E3 e2e pin ("no create, reclassify or
 * deed-term affordance exists on any endowment screen") encodes the rule that a control the reader
 * cannot use is a false statement about the product — measured when the anchor form first rendered
 * to a read-only seat and that pin went red. Same shape as {@link maySeeDeedFacts}: the SAME
 * `resolveScope` the maker rung mounts the procedure on, never a second predicate that can drift.
 * Nothing is audited — a screen deciding not to draw a button is not an attempt on anything.
 */
function holdsVerb(ctx: ScopedContext, permission: PermissionString): boolean {
  try {
    resolveScope(ctx, ctx.waqfId, permission);
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary this router echoes, spelled ONCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The closed two-value deed term (ADR-0009 R2), as a zod enum.
 *
 * ⚠ NO THIRD MEMBER AND NO DEFAULT (Binding rule 6). "Unknown" is the ABSENCE of a value: the field
 * is `.optional()` on the input and the column stays NULL, and an absent stipulation keeps HALTING at
 * the engine (`SHART_INCOMPLETE` / `CONTINUATION_STIPULATION_UNRECOGNISED`). A Nazir must be able to
 * SEE the halt, which is why neither this input nor the database supplies a value.
 */
const continuationStipulationInput = z.enum(['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN']);

/** مآل الوقف's recognised readings. One member today, and the discriminator exists BECAUSE it is one. */
const reversionKindInput = z.enum(['CHARITABLE_ULTIMATE_TAKER']);

/**
 * A frozen Umm-al-Qura snapshot, `yyyy-MM-dd` (schema convention 2).
 *
 * ⚠ THE REGEX PROVES A SHAPE, NEVER A VALUE — that was V-E3-M1. The value is compared against the
 * server's own derivation in the mutation body ({@link assertHijriPairAgrees}); zod cannot do it,
 * because the check is a relation between two fields and one Hijri implementation (ADR-0007).
 */
const hijriSnapshot = z
  .string()
  .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string');

/** The `ApprovalRequest.subjectId` a deed-term recording must name. One grammar, one place. */
export function deedTermSubjectId(waqfId: string): string {
  return `waqf:${waqfId}:deedTerms`;
}

/** `ReservedMatterKind.DEED_TERM_RECORD` — what a deed-term approval authorises. */
export const DEED_TERM_RESERVED_MATTER_KIND = 'DEED_TERM_RECORD' as const;

/**
 * THE CANONICAL ARTIFACT a Nazir's signature binds to.
 *
 * `serializeForAudit` first, for the same reason `settings.ts` does it: `canonicalJson` REFUSES a JS
 * `number`, and an all-strings tree survives a `jsonb` round-trip byte-identically, so the hash
 * recomputed from the STORED payload still matches. There is no second canonicaliser here —
 * `approvalFingerprint` does the encoding.
 *
 * ── ONE FACT, ONE SPELLING: `ultimateTakerIds` (V-E3-L2, closed S4) ─────────────────────────
 * This field was `ultimateTakerBeneficiaryIds` here and in the web view model while the engine input,
 * the fixture JSON, the seed's schema and ADR-0009 all said `ultimateTakerIds` — one fact under two
 * names. `ultimateTakerIds` wins because it is the name the fact already carries **in the record**:
 * it is a key inside the `shartAlWaqif` JSON, which lives in a WRITE-ONCE column no migration,
 * backfill or approval may rewrite (Binding rule 1 / ADR-0006), and `shart.ts` reads it back by that
 * key. The other spelling existed only in live code.
 *
 * ⚠ THE COST, STATED RATHER THAN GLOSSED: this key is part of the artifact whose canonical JSON is
 * compared against `approval_request.payload`, so the rename changes the fingerprint. Any approval
 * minted under the old spelling would now fail `ARTIFACT_MISMATCH` — which is the correct, hard
 * refusal ("raise a new request for the new reading"), never a silent divergence. ZERO such rows
 * exist: the fixture mints no `RESERVED_MATTER` approval at all (pinned in `apps/web/e2e`), and no
 * production database exists (NFR-03).
 *
 * ⚠ AND IT DOES NOT TOUCH THE PARITY PIN. `prisma-vocabulary-parity.test.ts` pins `ultimateTakerIds`
 * ABSENT as a **column on `model Waqf`** — the takers are ROWS in `waqf_reversion_taker`, so the
 * clause has two sides that must agree (R7). A tRPC field name is not a Prisma column; that pin's
 * intent is untouched and it still fails if anyone adds the column.
 */
export function deedTermArtifact(input: {
  readonly waqfId: string;
  readonly continuationStipulation: string | null;
  readonly reversion: {
    readonly kind: string;
    readonly ultimateTakerIds: string[];
  } | null;
}): Record<string, unknown> {
  return {
    kind: 'waqf.deedTerms',
    waqfId: input.waqfId,
    continuationStipulation: input.continuationStipulation,
    reversion:
      input.reversion === null
        ? null
        : {
            kind: input.reversion.kind,
            // SORTED and NOT deduplicated. Sorted so the artifact is order-insensitive; a repeat is
            // REFUSED below rather than collapsed, because a duplicated taker double-counts in the
            // weight vector and MOVES MONEY (`REVERSION_ULTIMATE_TAKER_DUPLICATED`).
            ultimateTakerIds: [...input.reversion.ultimateTakerIds].sort(),
          },
    reversionClauseCaptured: true,
  } satisfies Record<string, unknown>;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Reads
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const ENDOWMENT_SELECT = {
  id: true,
  waqifId: true,
  certificateNumber: true,
  deedNumber: true,
  classification: true,
  type: true,
  nature: true,
  entitlementOrder: true,
  continuationStipulation: true,
  reversionClauseCaptured: true,
  reversionKind: true,
  reversionRecordedAt: true,
  reversionRecordedAtHijri: true,
  fiscalYearEnd: true,
  registrationDate: true,
  registrationDateHijri: true,
  certificateExpiry: true,
  certificateExpiryHijri: true,
  // ⊕ S11-1 — the REGISTER_30BD clock-start as recorded operator input (migration 48). Read here so
  // the record screen can show "recorded / not recorded" beside the registration date it is NOT.
  registrationAnchorDate: true,
  registrationAnchorDateHijri: true,
  registrationAnchorKind: true,
  shartAlWaqifVersion: true,
  waqif: { select: { clientId: true } },
  reversionTakers: { select: { beneficiaryId: true }, orderBy: { beneficiaryId: 'asc' } },
  // ⚠ NO `trusteeship` HERE, AND ITS ABSENCE IS THE G7-V2 FIX. The deed summary is read by a
  // SECOND query that only runs for a caller {@link maySeeDeedFacts} admits, so a withheld deed
  // fact is never loaded rather than loaded-and-dropped. See {@link TRUSTEESHIP_SUMMARY_SELECT}.
} as const;

/**
 * The three deed facts the RECORD screen needs — and no more.
 *
 * The representative's NAME, scope and appointment dates stay in `deed.get`; this summary only says
 * that one exists. Both are behind {@link DEED_RECORD_READ} now, so the difference is how much a
 * deed reader is told, never whether a non-reader is told anything.
 */
const TRUSTEESHIP_SUMMARY_SELECT = {
  primaryNazir: true,
  jointlyLiable: true,
  authorizedRepName: true,
} as const;

export const endowmentRouter = router({
  /**
   * BR-101, whole, in ONE payload — including the registration date in BOTH calendars.
   *
   * ⚠ `waqfId` and `found` ARE PART OF THE CONTRACT, not leftovers. `test/scope-denial.integration.
   * test.ts` asserts both on the positive half of AC-1 ("this is the half that stops the suite passing
   * over a ladder that denies everyone"), and E3 widening the payload must not quietly delete the one
   * assertion that keeps the negative half honest. A caller with no grant never reaches this body at
   * all — rung 2 throws `NO_GRANT` → `NOT_FOUND`, never `FORBIDDEN`, disclosing nothing about whether
   * the endowment exists (AC-E3-01's second half).
   *
   * `found: false` with a resolved grant means the row is invisible through the caller's own client
   * (soft-deleted, or the force filter disagreeing with the grant set) — a state worth being able to
   * SEE rather than one to collapse into a 404.
   */
  get: endowmentScopedProcedure(ENDOWMENT_RECORD_READ).query(async ({ ctx }) => {
    const waqf = await ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: ENDOWMENT_SELECT,
    });

    // ── THE DEED SUMMARY IS A SECOND, GATED READ (G7-V2) ──────────────────────────────────────
    // Not selected above and then filtered: a caller without `endowment:deed:read` never causes the
    // row to be read at all, so there is no in-memory copy for a later projection bug to leak.
    const deedDisclosed = maySeeDeedFacts(ctx);
    // ⊕ S11-1 — which of the two clock-start inputs this caller may WRITE (the procedures' own rungs:
    // `deadline.recordRegistrationAnchor` is `endowment:waqf:write`, `recordIstibdalCompletion` is
    // `endowment:asset:write`). Facts about the READER, carried separately from facts about the
    // endowment — the panels draw a form only where the answer is `true`.
    const writable = {
      registrationAnchor: holdsVerb(ctx, 'endowment:waqf:write'),
      istibdalCompletion: holdsVerb(ctx, 'endowment:asset:write'),
      // ⊕ S11-2 — the discharge verb (owner ruling f797fea; rung: the precedent's plain maker, put to the owner with the design).
      registrationDischarge: holdsVerb(ctx, 'compliance:task:write'),
    };
    const deed =
      deedDisclosed && waqf !== null
        ? await ctx.db.trusteeshipDeed.findFirst({
            where: { waqfId: ctx.waqfId },
            select: TRUSTEESHIP_SUMMARY_SELECT,
          })
        : null;

    // ⚠ A DISCRIMINATED UNION ON `found`, NOT A BAG OF NULLABLES. Both branches carry the SAME key
    // set, so `if (data.found)` narrows every field to its non-null type at the consumer — a UI
    // cannot render `certificateNumber` without having handled the not-found branch first.
    if (waqf === null) {
      return {
        waqfId: ctx.waqfId,
        found: false as const,
        id: null,
        waqifId: null,
        clientId: null,
        certificateNumber: null,
        deedNumber: null,
        classification: null,
        type: null,
        nature: null,
        entitlementOrder: null,
        continuationStipulation: null,
        reversion: null,
        fiscalYearEnd: null,
        registrationDate: null,
        registrationDateHijri: null,
        certificateExpiry: null,
        certificateExpiryHijri: null,
        registrationAnchor: null,
        writable: null,
        shartAlWaqifVersion: null,
        trusteeship: null,
      };
    }

    return {
      waqfId: ctx.waqfId,
      found: true as const,
      id: waqf.id,
      waqifId: waqf.waqifId,
      clientId: waqf.waqif.clientId,
      certificateNumber: waqf.certificateNumber,
      deedNumber: waqf.deedNumber,
      classification: String(waqf.classification),
      type: String(waqf.type),
      nature: String(waqf.nature),
      entitlementOrder: String(waqf.entitlementOrder),
      // NULL is a MEANINGFUL answer here: the deed states no continuation term, or the term was
      // illegible at intake. Either way the engine halts rather than assuming one.
      continuationStipulation:
        waqf.continuationStipulation === null ? null : String(waqf.continuationStipulation),
      reversion: {
        // ⚠ `captured: false` means NOBODY HAS READ THE DEED'S مآل CLAUSE, which is NOT the same fact
        // as `kind: null` ("the deed positively records no ultimate taker", R7-c). The two travel as
        // separate fields precisely so a UI cannot conflate them.
        captured: waqf.reversionClauseCaptured,
        kind: waqf.reversionKind === null ? null : String(waqf.reversionKind),
        ultimateTakerIds: waqf.reversionTakers.map((row) => row.beneficiaryId),
        recordedAt: waqf.reversionRecordedAt?.toISOString() ?? null,
        recordedAtHijri: waqf.reversionRecordedAtHijri,
      },
      fiscalYearEnd: waqf.fiscalYearEnd,
      // BOTH CALENDARS. The Hijri side is the FROZEN snapshot taken at write time and is never
      // recomputed downstream — a filed date that shifts because a conversion library changed is a
      // rewritten legal record (D-4).
      registrationDate: waqf.registrationDate.toISOString(),
      registrationDateHijri: waqf.registrationDateHijri,
      certificateExpiry: waqf.certificateExpiry?.toISOString() ?? null,
      certificateExpiryHijri: waqf.certificateExpiryHijri,
      // ⊕ S11-1 — ONE object or null, never three loose nullables: the CHECKs make the three columns
      // move together, and the wire shape says so. `null` = NOT RECORDED, which the engine turns into
      // a refusal BY NAME for REGISTER_30BD — never "no deadline".
      registrationAnchor:
        waqf.registrationAnchorDate === null ||
        waqf.registrationAnchorDateHijri === null ||
        waqf.registrationAnchorKind === null
          ? null
          : {
              date: waqf.registrationAnchorDate.toISOString(),
              dateHijri: waqf.registrationAnchorDateHijri,
              kind: String(waqf.registrationAnchorKind),
            },
      writable,
      shartAlWaqifVersion: waqf.shartAlWaqifVersion,
      // ⚠ FOUR STATES, NOT TWO, AND THE FIRST ONE IS THE G7-V2 FIX.
      //   · `disclosed: false`                   — this caller may not read deed facts. Every field
      //                                            below is null and NOTHING was read.
      //   · `disclosed: true, recorded: false`   — no trusteeship deed is recorded on this endowment.
      //   · `disclosed: true, recorded: true`    — the summary, as `deed.get` would answer it.
      // "Withheld" and "not recorded" are DIFFERENT FACTS and are carried as different fields, the
      // same discipline `reversion.captured` vs `reversion.kind` follows: a screen that renders
      // "no Nazir is appointed" to a caller who merely lacks a verb has stated something false
      // about a governance record.
      trusteeship: {
        disclosed: deedDisclosed,
        recorded: deedDisclosed ? deed !== null : null,
        primaryNazir: deed?.primaryNazir ?? null,
        jointlyLiable: deed?.jointlyLiable ?? null,
        // A BOOLEAN, not the name. `deed.get` is the procedure that discloses the representative's
        // identity and scope; the endowment record only ever says whether one exists.
        hasAuthorizedRep: deed === null ? null : deed.authorizedRepName !== null,
      },
    };
  }),

  /**
   * ⊕ S11-1 — the endowment's expropriations, for the record screen's istibdal-completion input.
   *
   * There was NO expropriation surface anywhere before this (measured 2026-09-02: no router, no UI),
   * and the owner's ruling made the istibdal COMPLETION date an operator input — so the row it lives
   * on has to be visible to be written. Read-only here; the one write is
   * `deadline.recordIstibdalCompletion`. Gated by `endowment:asset:read`, the same permission that
   * governs the asset a taking is about. The compensation figure is deliberately NOT projected: it
   * is a ledger fact (`rev-004`'s corpus receipt), and this screen is about the clock.
   */
  expropriations: endowmentScopedProcedure('endowment:asset:read').query(async ({ ctx }) => {
    const rows = await ctx.db.expropriation.findMany({
      where: { waqfId: ctx.waqfId, deletedAt: null },
      select: {
        id: true,
        assetId: true,
        scope: true,
        announcedDate: true,
        announcedDateHijri: true,
        istibdalStatus: true,
        istibdalCompletedDate: true,
        istibdalCompletedDateHijri: true,
        authorityNotifiedDate: true,
        authorityNotifiedDateHijri: true,
      },
      orderBy: { announcedDate: 'asc' },
    });
    return {
      expropriations: rows.map((row) => ({
        id: row.id,
        assetId: row.assetId,
        scope: row.scope,
        announcedDate: row.announcedDate.toISOString(),
        announcedDateHijri: row.announcedDateHijri,
        istibdalStatus: row.istibdalStatus,
        // The two are one fact and travel as one object or null — the CHECK says so.
        istibdalCompleted:
          row.istibdalCompletedDate === null || row.istibdalCompletedDateHijri === null
            ? null
            : {
                date: row.istibdalCompletedDate.toISOString(),
                dateHijri: row.istibdalCompletedDateHijri,
              },
        authorityNotified:
          row.authorityNotifiedDate === null || row.authorityNotifiedDateHijri === null
            ? null
            : {
                date: row.authorityNotifiedDate.toISOString(),
                dateHijri: row.authorityNotifiedDateHijri,
              },
      })),
    };
  }),

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 3 · The tiny write
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * Certificate validity, and nothing else. See the file header for every exclusion and its reason.
   */
  update: makerProcedure('endowment:waqf:write')
    .input(
      z
        .object({
          certificateExpiry: z.string().datetime().nullable(),
          certificateExpiryHijri: hijriSnapshot.nullable(),
        })
        // DUAL DATES MOVE TOGETHER (schema convention 2). A Gregorian expiry with no Hijri snapshot
        // is a legally-significant date recorded in one calendar, and the Hijri side must be the
        // snapshot frozen at WRITE time — so it is supplied, not derived here from a value the caller
        // could have computed with a different library.
        .refine(
          (value) => (value.certificateExpiry === null) === (value.certificateExpiryHijri === null),
          {
            message:
              'certificateExpiry and certificateExpiryHijri are both present or both absent: a ' +
              'legally-significant date is dual-calendar (schema convention 2).',
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const expiry = input.certificateExpiry === null ? null : new Date(input.certificateExpiry);

      // ── THE PAIR IS PROVEN, NOT TRUSTED (V-E3-M1) ─────────────────────────────────────────
      // The `.refine` above proves both halves are present or both absent; it says nothing about
      // whether they are the SAME DATE. MEASURED before this check existed: `certificateExpiry =
      // 2026-08-13` with `certificateExpiryHijri = 1300-01-01` was accepted. A certificate's expiry
      // is a filed date a Nazir plans against, so the Hijri half stored is the SERVER's derivation
      // through the single Hijri implementation (ADR-0007), and a caller that disagrees is refused
      // rather than silently overwritten.
      const expiryHijri =
        expiry === null || input.certificateExpiryHijri === null
          ? null
          : assertHijriPairAgrees(
              expiry,
              input.certificateExpiryHijri,
              'certificateExpiry',
              'certificateExpiryHijri',
            );

      return auditedWrite(ctx.db, async (tx) => {
        // ⚠ NO `select`. The audit extension diffs this operation's own result against a FULL-ROW
        // pre-image and reads an absent key as `null`, so a projection would record every dropped
        // column as "set to null" in the append-only trail (C-08). `auditedWrite`'s handle refuses
        // one outright; the response shape is projected in TypeScript below.
        const updated = await tx.waqf.update({
          where: { id: ctx.waqfId },
          data: { certificateExpiry: expiry, certificateExpiryHijri: expiryHijri },
        });

        return {
          id: updated.id,
          certificateExpiry: updated.certificateExpiry?.toISOString() ?? null,
          certificateExpiryHijri: updated.certificateExpiryHijri,
        };
      });
    }),

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 4 · THE DEED ACT
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * Record `continuationStipulation` and/or the مآل الوقف clause — ONCE, EVER.
   *
   * ── WHY THE SIGNER RUNG AND NOT A WRITE RUNG ──────────────────────────────────────────────
   * These are FOUNDER'S CONDITIONS. Landing them as plain columns would have re-opened ADR-0006's
   * hole through a new column, so three layers divide the work and none of them duplicates another:
   *   1. THIS RUNG — `endowment:deed:sign`, held by `nazir` ALONE in `ROLE_PRESETS`; maker ≠ checker
   *      against the PERSISTED `makerId`; a fresh TOTP inside the `Setting`-driven window; and the
   *      `payloadHash` binding the Nazir to the exact terms they were shown.
   *   2. THE COLUMN GATE (`DOMAIN_WRITE_POLICIES.Waqf.overrides`) — the same permission, enforced
   *      inside Prisma, so a write that bypassed this router still needs the Nazir's verb.
   *   3. THE DATABASE (`qmulate_shart_guard()` tier 3) — `NULL -> value` once, then `value -> ANYTHING`
   *      (including back to NULL) raises SQLSTATE 42501 with the superseding-instrument message. That
   *      one holds against raw SQL, a migration and `session_replication_role = 'replica'`.
   *
   * ── THE PRE-CHECK IS NOT A DUPLICATE OF LAYER 3 ───────────────────────────────────────────
   * It refuses BEFORE the transaction opens, so a second attempt writes nothing at all — not even a
   * rolled-back audit event — and the caller gets `DEED_TERM_WRITE_ONCE` (a CONFLICT with its own
   * ar/en sentence) instead of a raw SQLSTATE. If the pre-check is ever raced, the trigger still
   * refuses and {@link isDatabaseGuardRefusal} restates it as the same code, so the two layers agree
   * on the ANSWER while disagreeing on the moment.
   *
   * ⚠ `reversion: null` IS A POSITIVE STATEMENT — "the deed records no مآل" (R7-c) — and NOT an
   * omission. `reversionClauseCaptured` may only ever be sent as `true`, because this procedure IS the
   * act of having read the clause; there is no way to record "I have not read it".
   */
  recordDeedTerms: signerProcedure('endowment:deed:sign')
    .input(
      z.object({
        continuationStipulation: continuationStipulationInput.optional(),
        reversion: z
          .object({
            kind: reversionKindInput,
            /** Never deduplicated — a repeat is refused. See {@link deedTermArtifact}. */
            ultimateTakerIds: z.array(z.string().min(1).max(64)).min(1),
          })
          .nullable(),
        /** A literal. There is no "not yet read" to record: calling this IS the reading. */
        reversionClauseCaptured: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ⚠ `{ continuationStipulation: undefined, reversion: null }` IS A LEGITIMATE CALL and is not
      // refused here. It records `reversionClauseCaptured: false -> true` with `reversionKind` staying
      // NULL, which is the positive statement "the deed records no ultimate taker" (R7-c). It is only
      // a no-op when the row ALREADY says so, and the write-once pre-check below catches exactly that.

      // ── (a) THE PRE-IMAGE, read through the caller's OWN scoped client ────────────────────────
      const current = await ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId },
        select: {
          id: true,
          type: true,
          continuationStipulation: true,
          reversionClauseCaptured: true,
          reversionKind: true,
          reversionRecordedAt: true,
        },
      });
      if (current === null) {
        // Same non-disclosure path as a missing endowment: the grant resolved, the row did not.
        throw new ApiError(
          'NO_GRANT',
          `waqf ${ctx.waqfId} is not visible through this caller's own client, so its deed terms ` +
            `cannot be recorded. Surfaced as NOT_FOUND rather than as a write failure.`,
          { waqfId: ctx.waqfId },
        );
      }

      // ── (b) WRITE-ONCE, CHECKED BEFORE ANYTHING OPENS ────────────────────────────────────────
      const alreadyRecorded: string[] = [];
      if (input.continuationStipulation !== undefined && current.continuationStipulation !== null) {
        alreadyRecorded.push('continuationStipulation');
      }
      if (current.reversionClauseCaptured) {
        // TRUE means somebody has already read this deed's مآل clause and recorded the reading —
        // whether that reading NAMED takers or recorded that there are none. Either way a second
        // recording is a CHANGE to a founder's condition.
        alreadyRecorded.push('reversionClauseCaptured');
      }
      if (current.reversionKind !== null) alreadyRecorded.push('reversionKind');
      if (current.reversionRecordedAt !== null) alreadyRecorded.push('reversionRecordedAt');

      if (alreadyRecorded.length > 0) {
        throw deedTermWriteOnce(ctx.waqfId, alreadyRecorded);
      }

      // ── (c) THE APPROVAL IS ABOUT THESE EXACT TERMS ──────────────────────────────────────────
      // Rung 3 has already proven `payloadHash === approvalFingerprint(payload)`, maker ≠ checker, an
      // ACTIVE NAZIR grant on THIS endowment, the step-up, and `status = PENDING`. What is left is
      // that the artifact the Nazir signed IS the artifact being submitted — without it, an approval
      // raised for one deed reading could be spent on another and every guard would look healthy.
      if (ctx.approval.type !== 'RESERVED_MATTER') {
        throw new ApiError(
          'APPROVAL_STALE',
          `WRONG_APPROVAL_TYPE: approval_request ${ctx.approval.id} is ${ctx.approval.type}, not ` +
            `RESERVED_MATTER. Recording a founder's condition is a reserved matter, and an approval ` +
            `raised for one kind of act may never be spent on another.`,
          { approvalRequestId: ctx.approval.id, reason: 'WRONG_APPROVAL_TYPE' },
        );
      }
      const expectedSubject = deedTermSubjectId(ctx.waqfId);
      if (ctx.approval.subjectId !== expectedSubject) {
        throw new ApiError(
          'APPROVAL_STALE',
          `WRONG_SUBJECT: approval_request ${ctx.approval.id} names subject ` +
            `${JSON.stringify(ctx.approval.subjectId)}, not ${JSON.stringify(expectedSubject)}. The ` +
            `subject is what makes "the approval for THIS deed reading on THIS endowment" ` +
            `unambiguous, and what the one-open-per-subject unique index keys on.`,
          { approvalRequestId: ctx.approval.id, reason: 'WRONG_SUBJECT' },
        );
      }

      const artifact = deedTermArtifact({
        waqfId: ctx.waqfId,
        continuationStipulation: input.continuationStipulation ?? null,
        reversion:
          input.reversion === null
            ? null
            : {
                kind: input.reversion.kind,
                ultimateTakerIds: [...input.reversion.ultimateTakerIds],
              },
      });
      if (canonicalJson(ctx.approval.payload) !== canonicalJson(serializeForAudit(artifact))) {
        throw new ApiError(
          'APPROVAL_STALE',
          `ARTIFACT_MISMATCH: the deed terms submitted are not the terms recorded on ` +
            `approval_request ${ctx.approval.id}. The approver signs the exact artifact they saw ` +
            `(§10 §4.3) — whoever changes a founder's condition after approval would otherwise be ` +
            `the real approver. Raise a new request for the new reading.`,
          { approvalRequestId: ctx.approval.id, reason: 'ARTIFACT_MISMATCH' },
        );
      }

      // ── (d) THE NAMED TAKERS MUST RESOLVE, IN THIS ENDOWMENT, AS NON-DESCENDANT CHARITIES ────
      // REFUSE, NEVER REPAIR. Every one of these is a shape the engine would otherwise have to
      // refuse at run time on real money (`REVERSION_ULTIMATE_TAKER_UNKNOWN`,
      // `REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE`, `REVERSION_ULTIMATE_TAKER_DUPLICATED`), and a
      // clause recorded now is a clause that cannot be edited later.
      let takerIds: string[] = [];
      if (input.reversion !== null) {
        takerIds = [...input.reversion.ultimateTakerIds];

        const duplicated = takerIds.filter((id, index) => takerIds.indexOf(id) !== index);
        if (duplicated.length > 0) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `the مآل clause names beneficiary id(s) ${[...new Set(duplicated)].join(', ')} more than ` +
              `once. A repeat is REFUSED, never deduplicated: it would double-count in the weight ` +
              `vector and move money (REVERSION_ULTIMATE_TAKER_DUPLICATED).`,
            {
              details: {
                refusal: 'REVERSION_ULTIMATE_TAKER_DUPLICATED',
                waqfId: ctx.waqfId,
                beneficiaryIds: [...new Set(duplicated)],
              },
            },
          );
        }

        const named = await ctx.db.beneficiary.findMany({
          where: { id: { in: takerIds }, waqfId: ctx.waqfId },
          select: { id: true, kind: true, lineageLink: true, tabaqa: true },
        });

        const unknown = takerIds.filter((id) => !named.some((row) => row.id === id));
        if (unknown.length > 0) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `the مآل clause names beneficiary id(s) ${unknown.join(', ')}, which do not exist on ` +
              `waqf ${ctx.waqfId}. A clause that names an unresolvable id records a destination ` +
              `nobody can pay (REVERSION_ULTIMATE_TAKER_UNKNOWN).`,
            {
              details: {
                refusal: 'REVERSION_ULTIMATE_TAKER_UNKNOWN',
                waqfId: ctx.waqfId,
                beneficiaryIds: unknown,
              },
            },
          );
        }

        const notCharitable = named.filter((row) => String(row.kind) !== 'CHARITABLE_JIHA');
        if (notCharitable.length > 0) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `the مآل clause names ${notCharitable.map((row) => `${row.id} (${String(row.kind)})`).join(', ')}. ` +
              `R7 permits a ذري deed to name a CHARITABLE_JIHA as its ultimate taker and nothing ` +
              `else (REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE).`,
            {
              details: {
                refusal: 'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
                waqfId: ctx.waqfId,
                beneficiaryIds: notCharitable.map((row) => row.id),
              },
            },
          );
        }

        // A recorded ultimate taker is NOT a descendant, so it carries neither a lineage edge nor a
        // generation. A row that carries either is a family member being written into the reversion
        // clause, which is how a bloodline gets paid as if it were a charity.
        const carriesDescent = named.filter(
          (row) => row.lineageLink !== null || row.tabaqa !== null,
        );
        if (carriesDescent.length > 0) {
          throw new DomainError(
            'SHART_INCOMPLETE',
            `the مآل clause names ${carriesDescent.map((row) => row.id).join(', ')}, which carry a ` +
              `lineageLink and/or a tabaqa. A recorded ultimate taker is not a descendant of the ` +
              `waqif and must carry neither (LINEAGE_EDGE_ON_NON_DESCENDANT).`,
            {
              details: {
                refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT',
                waqfId: ctx.waqfId,
                beneficiaryIds: carriesDescent.map((row) => row.id),
              },
            },
          );
        }
      }

      const recordedAt = ctx.now;
      const recordedAtHijri = String(toHijriSnapshot(recordedAt));

      try {
        // (i) THE DECISION — on the approval plane (S12-1 / AV4-02, migration 50). Same shape as
        //     `approval.approve` and `settings.set`: decided FIRST on the provisioning connection,
        //     executed SECOND on the runtime, VOIDED if the execution fails
        //     (`middleware/approval-plane.ts`). The acting identity, never an input; the DB CHECK
        //     and the `approval_request_authority` trigger re-prove maker ≠ checker and "an ACTIVE
        //     NAZIR on THIS endowment" in SQL.
        return await decideThenExecute(ctx, 'endowment.recordDeedTerms', recordedAt, () =>
          auditedWrite(ctx.db, async (tx) => {
            // (ii) THE FOUNDER'S CONDITION. No `select` — see `update` above.
            const updated = await tx.waqf.update({
              where: { id: ctx.waqfId },
              data: {
                // ⚠ THE FIELD IS OMITTED, NOT SET TO NULL, WHEN THE CALLER DID NOT SUPPLY IT. Writing
                // `null` explicitly would be a `NULL -> NULL` no-op today and a `value -> NULL` refusal
                // the day the column is populated — i.e. a latent 42501 in the ordinary path.
                ...(input.continuationStipulation !== undefined
                  ? { continuationStipulation: input.continuationStipulation }
                  : {}),
                // ⚠ THE DATE PAIR IS UNCONDITIONAL, AND THE `reversion: null` BRANCH IS WHY.
                //
                // MEASURED (S4 round 3, finding AV3-01): with the dates inside the `reversion !== null`
                // arm, this procedure emitted `reversionClauseCaptured: true` with BOTH dates absent on
                // the branch that records "this deed names NO ultimate taker" — the state 4 of the 5
                // seeded endowments are in — which is EXACTLY the half-write migration 14's tier 3a
                // refuses (42501). So the one production caller of the مآل capture path was broken by
                // the guard added to protect it, and no test reached the branch.
                //
                // Recording that the clause has been READ is a dated act whichever answer it carries:
                // "I read it on this date and it names none" is as much a founder's-condition record as
                // "I read it and here is the taker". The dates belong to the CAPTURE, not to the kind —
                // which is the same correction migration 14 made to the CHECK constraint.
                reversionClauseCaptured: true,
                reversionRecordedAt: recordedAt,
                reversionRecordedAtHijri: recordedAtHijri,
                ...(input.reversion !== null ? { reversionKind: input.reversion.kind } : {}),
              },
            });

            // (iii) THE NAMED TAKERS. One `create` per row: `createMany` is on the audit extension's
            //       BANNED_OPERATIONS (no per-row before-image), and a nested write into an audited
            //       model is refused outright. A `create` may project — it has no pre-image, so there
            //       is no diff to falsify.
            for (const beneficiaryId of [...takerIds].sort()) {
              await tx.waqfReversionTaker.create({
                data: { waqfId: ctx.waqfId, beneficiaryId, createdBy: ctx.actor.actorId },
                select: { id: true, waqfId: true, beneficiaryId: true },
              });
            }

            // (iv) EXECUTED. `APPROVED` is NON-terminal, so leaving it there would keep the
            //      one-open-per-subject slot occupied and block the next legitimate reserved matter on
            //      this subject. PENDING → APPROVED → EXECUTED is the only legal route.
            await tx.approvalRequest.update({
              where: { id: ctx.approval.id },
              data: { status: 'EXECUTED' },
            });

            // (v) THE TRAIL PROVES THE AUTHORITY, not merely the identity (MP-32, BR-607, NFR-04).
            await recordEvent(toActorContext(ctx, { procedure: 'endowment.recordDeedTerms' }), {
              action: 'APPROVE',
              category: 'APPROVAL',
              classification: 'SENSITIVE',
              entityType: 'Waqf',
              entityId: ctx.waqfId,
              waqfId: ctx.waqfId,
              extraContext: {
                grantId: ctx.authority.grantId,
                role: ctx.authority.role,
                approvalRequestId: ctx.approval.id,
                reservedMatterKind: DEED_TERM_RESERVED_MATTER_KIND,
                subjectId: ctx.approval.subjectId,
                makerId: ctx.approval.makerId,
                payloadHash: ctx.approval.payloadHash,
                totpAssertedAt: ctx.totpAssertedAt.toISOString(),
                continuationStipulation: input.continuationStipulation ?? null,
                reversionKind: input.reversion?.kind ?? null,
                ultimateTakerCount: takerIds.length,
                recordedAtHijri,
                writeOnce: true,
              },
            });

            return {
              waqfId: updated.id,
              continuationStipulation:
                updated.continuationStipulation === null
                  ? null
                  : String(updated.continuationStipulation),
              reversion: {
                captured: updated.reversionClauseCaptured,
                kind: updated.reversionKind === null ? null : String(updated.reversionKind),
                ultimateTakerIds: [...takerIds].sort(),
              },
              writeOnce: true as const,
            };
          }),
        );
      } catch (error) {
        // THE RACE, RESTATED IN THE DOMAIN'S OWN VOCABULARY. Two concurrent recordings both pass the
        // pre-check and one loses at the trigger. `isDatabaseGuardRefusal` matches the POSTGRES
        // SQLSTATE, never the guard's prose — and this call site is the only thing that knows which
        // guarded write it attempted, which is why the classification happens here and not in
        // `toTRPCError`.
        if (isDatabaseGuardRefusal(error)) {
          throw deedTermWriteOnce(ctx.waqfId, ['continuationStipulation', 'reversion*'], {
            raisedBy: 'qmulate_shart_guard',
          });
        }
        throw error;
      }
    }),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The one refusal this file mints
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `DEED_TERM_WRITE_ONCE` — a founder's condition is already recorded.
 *
 * ⚠ THE MESSAGE MUST POINT AT THE SUPERSEDING-INSTRUMENT RULE, and that is not decoration: the
 * message is the only place a future engineer learns that there is no approval to go and get. It
 * mirrors `qmulate_shart_guard()` tier 3's own wording deliberately, so the app-layer and
 * database-layer refusals read as the same rule rather than as two policies.
 *
 * A `DomainError`, not an `ApiError`, so the user-facing sentence lives once at
 * `errors.domain.DEED_TERM_WRITE_ONCE` and reaches the client as a CONFLICT via
 * `DOMAIN_ERROR_CODE_TO_TRPC_STATUS`.
 */
function deedTermWriteOnce(
  waqfId: string,
  columns: readonly string[],
  extra: Readonly<Record<string, unknown>> = {},
): DomainError {
  return new DomainError(
    'DEED_TERM_WRITE_ONCE',
    `deed term(s) ${columns.join(', ')} on waqf ${waqfId} are already recorded and are WRITE-ONCE. ` +
      `They are conditions of the founder, not row values: once recorded they may not be changed, ` +
      `cleared or re-stated — not by an edit, a migration, a backfill, a "correction", and not by ` +
      `any reserved-matter approval (Binding rule 1, ADR-0006). If a competent authority or a court ` +
      `directs a change, the answer is a SUPERSEDING INSTRUMENT recorded as a NEW record, never an ` +
      `edit to this one.`,
    { details: { waqfId, columns: [...columns], ...extra } },
  );
}
