/**
 * THE REFUSAL SEAM between the pure distribution engine and everything that calls it — plus the
 * non-refusing DIAGNOSTIC channel beside it (§3, {@link MAPPING_DIAGNOSTICS}), which is where the
 * mapping puts everything it noticed and would otherwise have had to drop on the floor.
 *
 * Two jobs, and they are opposite directions of one boundary:
 *
 *  1. {@link resolveRefusal} — reading a refusal the ENGINE threw, and naming it. The engine has no
 *     `{ ok: true } | { ok: false }` union; a refusal is a thrown `DomainError` and the thing that
 *     says *which* condition halted the run lives at `err.details.refusal`, by convention rather
 *     than by a typed parameter (`@qmulate/domain`'s `shartIncomplete(reason, details)`).
 *  2. {@link mapperRefusal} — refusing at the MAPPING boundary, for the states the engine's input
 *     type cannot express at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ NEVER KEY ON `code` ALONE. TWENTY-SIX REFUSALS SHARE `SHART_INCOMPLETE`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MEASURED in this change, mechanically, against the engine's own array:
 *
 *   node -e "…SHART_REFUSALS.length" → 26
 *
 * A caller that branches on `code === 'SHART_INCOMPLETE'` has learned nothing beyond "the founder's
 * conditions did not resolve" — it cannot tell a mis-transcribed continuation stipulation from a
 * missing lineage edge from a joint waqf. Every assertion, every log line and every screen must use
 * the DISCRIMINATOR. {@link resolveRefusal} exists so there is exactly one place that reads it, and
 * so no call site is tempted to parse the message: `shartIncomplete()` embeds only its `reason`
 * prose, and whether that prose contains the discriminator is a per-call-site accident.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY MAPPER REFUSALS ARE A SEPARATE, DISJOINT VOCABULARY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `SHART_REFUSALS` is CLOSED at twenty-six and the engine deliberately minted **no** new
 * discriminator for the database's third reversion state — `contract.ts`'s `REVERSION_KINDS` note
 * says so in as many words: *"the un-read state can never masquerade as the deed's silence and no
 * new engine discriminator was minted for it. `SHART_REFUSALS` still holds twenty-six."*
 *
 * So the mapper's own refusals live in {@link MAPPER_REFUSALS} and are carried at
 * `details.mapperRefusal`, never at `details.refusal`. Three consequences, all deliberate:
 *
 *  · a consumer typed against `ShartRefusal` can never be handed a value that is not one;
 *  · {@link resolveRefusal} reports `refusalSource`, so "the engine halted" and "we refused before
 *    the engine saw it" are never confused — they have different remedies (the first is a deed to
 *    interpret, the second a record to finish transcribing);
 *  · the two vocabularies are asserted DISJOINT at module load below. If a future engine version
 *    mints a discriminator that collides with one of ours, this module refuses to import rather
 *    than shipping one name with two meanings.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * COPY POSITION — NOTHING HERE IS USER-FACING PROSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every `message` produced here is developer-facing English for a log. The ONE user-facing sentence
 * for a halt is the catalogued `errors.domain.<CODE>` message, which `DomainError` already points at
 * through its own `messageKey` — this file never spells an i18n key, it only passes the one the error
 * already carries. The discriminators themselves render as UNTRANSLATED diagnostic codes
 * (`<DiagnosticCode>`), exactly as `routers/shart.ts` renders `wouldHaltWith`.
 *
 * ⚠ OWED TO S7-5 (the copy/parity stage): {@link MAPPER_REFUSALS} is a new machine-code vocabulary
 * emitted by `packages/api/src/distribution/**`, and `packages/i18n/test/code-source-parity.test.ts`
 * derives its groups from `packages/api/src/routers/deed.ts` alone — so nothing today notices these
 * codes at all. They are TIER 2 (internal operations: the wizard, the approvals queue), so
 * engineering MAY author their ar/en labels, but they must be added to that test's `GROUP_SOURCES`
 * in S7-5 or the "never silenced" property is satisfied only on paper.
 */

import { DomainError, isDomainError, type DomainErrorCode } from '@qmulate/domain';
import { SHART_REFUSALS, type ShartRefusal } from '@qmulate/domain/distribution';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The mapper's own closed vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every way the DATABASE→ENGINE mapping refuses BEFORE `runDistribution` is called.
 *
 * These are not engine refusals and they are not shape errors. Each one names a recorded state that
 * the engine's input type **cannot represent**, so passing it on would require choosing one of the
 * representable states on the record's behalf — which is the guess binding rule 1 forbids.
 */
export const MAPPER_REFUSALS = [
  /**
   * `Waqf.reversionClauseCaptured = false`: **nobody has read this deed's مآل clause yet.**
   *
   * The engine's `reversion` is two-state (`clause | null`) and `null` means *the deed positively
   * records no ultimate taker* (R7-c). There is no third state, on purpose — so an un-read clause
   * has NO representation and must be refused here. Passing `null` would make the engine assert, on
   * the deed's behalf, that the founder named nobody to take the endowment when the family ends.
   *
   * `waqf-005` is exactly this row (MEASURED: `reversionClauseCaptured: false`,
   * `completeness.missing: ['REVERSION_CLAUSE_UNREAD']`).
   */
  'REVERSION_CLAUSE_UNREAD',
  /**
   * `shartAlWaqif.completeness.missing` is non-empty — a HALTING gap by the Shart's own declaration.
   *
   * ⚠ THE ENGINE CANNOT SEE THIS FIELD AT ALL. `completeness` is not part of `DistributionInputRaw`,
   * so the seed's claim that a `missing` gap means *"the engine returns `SHART_INCOMPLETE` and
   * computes nothing"* (`packages/database/src/seed/shart.ts` header) is only true if the MAPPER
   * enforces it. Nothing enforced it before this change.
   */
  'SHART_COMPLETENESS_HALTING_GAP',
  /** The `shartAlWaqif` Json is not the shape this build reads. Refused, never sentinel-defaulted. */
  'SHART_UNREADABLE',
  /**
   * `Waqf.entitlementOrder` (the column) and `shartAlWaqif.orderRule` (the Json) disagree.
   *
   * Two recorded copies of the founder's order rule, with money between them. Neither is
   * "the drifted side" a priori, so the mapper refuses instead of picking.
   */
  'ENTITLEMENT_ORDER_DISAGREES_WITH_SHART',
  /** `Waqf.continuationStipulation` and `shartAlWaqif.continuationStipulation` disagree. */
  'CONTINUATION_STIPULATION_DISAGREES_WITH_SHART',
  /**
   * The مآل columns (`reversionKind` + `waqf_reversion_taker` rows) and the Shart Json's own
   * `reversion` clause disagree about kind, status, or the ids named.
   */
  'REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD',
  /** `shartAlWaqif.maintenanceReserve.kind` is not one this build recognises. */
  'MAINTENANCE_RULE_UNRECOGNISED',
  /**
   * The deed stipulates a `target_topup` ṣiyāna reserve and **no reserve-fund balance is available**.
   *
   * The engine's `TARGET_TOPUP` needs `targetBalanceMinor` AND `currentBalanceMinor`; the Shart Json
   * records only `targetBalanceSar`, and no column anywhere holds a reserve-fund balance. Defaulting
   * the current balance to zero would top the fund up to its FULL target every single period.
   * Unreachable on today's fixture (no seeded deed uses `target_topup`) and refused rather than
   * guessed the day one does.
   */
  'MAINTENANCE_TARGET_BALANCE_UNAVAILABLE',
  /** A rate could not be expressed as a plain decimal string (exponent notation, or >18 dp). */
  'RATE_UNREPRESENTABLE',
  /** The deed names a Nazir-fee basis but not the figure that basis needs. */
  'NAZIR_FEE_RULE_INCOMPLETE',
  /** `shartAlWaqif.nazirFee.basis` is not one this build recognises. */
  'NAZIR_FEE_BASIS_UNRECOGNISED',
  /** `shartAlWaqif.disbursementSchedule` is not one this build recognises. */
  'DISBURSEMENT_SCHEDULE_UNRECOGNISED',
  /**
   * `Beneficiary.stipulatedWeight` is NULL.
   *
   * The column is nullable because migration 12 refused to INVENT a weight for every existing row;
   * the mapper refuses for the mirror-image reason. A substituted `'1'` would be this code deciding
   * a deed-stipulated share.
   */
  'BENEFICIARY_WEIGHT_MISSING',
  /** `Beneficiary.stipulatedWeight` is negative, or not a plain decimal literal. */
  'BENEFICIARY_WEIGHT_UNREPRESENTABLE',
  /**
   * A `REVENUE` row carries no `receiptClass`.
   *
   * A DB CHECK makes this unrepresentable (`receiptClass` is mandatory on every `REVENUE` row), so
   * reaching it means the constraint was bypassed. Refused with the engine's own
   * `RECEIPT_UNCLASSIFIED` code — the sentence already exists in both locales — rather than assumed
   * to be income: a bare revenue total is indistinguishable from sale or istibdal proceeds.
   */
  'RECEIPT_CLASS_MISSING',
  /**
   * A receipt names a `capitalSource` this build's vocabulary does not hold.
   *
   * It cannot be forwarded (the engine's field is a `z.enum`) and it must NOT become `null`: that
   * would turn *"this CAPITAL receipt names a corpus event we do not recognise"* into *"this CAPITAL
   * receipt names none"*, which is a different fact with a different remedy.
   */
  'CAPITAL_SOURCE_UNRECOGNISED',
  /**
   * A ledger row handed to the mapper falls outside the period window it was supposed to be
   * fetched for. The window is applied twice — once by the query, once here — because a router bug
   * that fetched the wrong period would otherwise pay out a plausible wrong number.
   */
  'LEDGER_ROW_OUTSIDE_PERIOD_WINDOW',
  /** A ledger row handed to the mapper is soft-deleted. A deleted row is not evidence. */
  'LEDGER_ROW_SOFT_DELETED',
] as const;

/** The `details.mapperRefusal` discriminator. See {@link MAPPER_REFUSALS}. */
export type MapperRefusal = (typeof MAPPER_REFUSALS)[number];

/**
 * The domain code each mapper refusal reports.
 *
 * Not all of them are `SHART_INCOMPLETE`, and flattening them into it would be the same defect as
 * keying on `code` alone from the other end: a missing reserve-fund balance is a `Setting`/data gap
 * with an operational remedy, not an unreadable founder's condition with a legal one. Every code
 * used here is a `DOMAIN_ERROR_CODES` member with `errors.domain.<CODE>` copy in **both** locales
 * (MEASURED: 36 codes, 36 keys in each of `packages/i18n/messages/{ar,en}.json`), so the one
 * user-facing sentence always exists.
 */
const MAPPER_REFUSAL_CODE: Readonly<Record<MapperRefusal, DomainErrorCode>> = {
  REVERSION_CLAUSE_UNREAD: 'SHART_INCOMPLETE',
  SHART_COMPLETENESS_HALTING_GAP: 'SHART_INCOMPLETE',
  SHART_UNREADABLE: 'SHART_INCOMPLETE',
  ENTITLEMENT_ORDER_DISAGREES_WITH_SHART: 'SHART_INCOMPLETE',
  CONTINUATION_STIPULATION_DISAGREES_WITH_SHART: 'SHART_INCOMPLETE',
  REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD: 'SHART_INCOMPLETE',
  MAINTENANCE_RULE_UNRECOGNISED: 'SHART_INCOMPLETE',
  MAINTENANCE_TARGET_BALANCE_UNAVAILABLE: 'SETTING_MISSING',
  RATE_UNREPRESENTABLE: 'SETTING_INVALID',
  NAZIR_FEE_RULE_INCOMPLETE: 'SHART_INCOMPLETE',
  NAZIR_FEE_BASIS_UNRECOGNISED: 'SHART_INCOMPLETE',
  DISBURSEMENT_SCHEDULE_UNRECOGNISED: 'SHART_INCOMPLETE',
  BENEFICIARY_WEIGHT_MISSING: 'SHART_INCOMPLETE',
  BENEFICIARY_WEIGHT_UNREPRESENTABLE: 'SHART_INCOMPLETE',
  RECEIPT_CLASS_MISSING: 'RECEIPT_UNCLASSIFIED',
  CAPITAL_SOURCE_UNRECOGNISED: 'RECEIPT_UNCLASSIFIED',
  LEDGER_ROW_OUTSIDE_PERIOD_WINDOW: 'DISTRIBUTION_INPUT_INVALID',
  LEDGER_ROW_SOFT_DELETED: 'DISTRIBUTION_INPUT_INVALID',
};

/**
 * ⚠ A BUILD-TIME SELF-CHECK, RUN AT IMPORT — the same shape as `routers/shart.ts`'s.
 *
 * Two properties, both of which silently break the moment somebody adds a name:
 *  · the two vocabularies are DISJOINT, so `details.refusal` and `details.mapperRefusal` can never
 *    carry the same string with two meanings;
 *  · every mapper refusal has a domain code, so none can be thrown with `undefined` as its code.
 *
 * It fails HERE — at import, in every suite including `router-introspection`, which imports every
 * module under `src/` — rather than at request time on a distribution run.
 */
for (const refusal of MAPPER_REFUSALS) {
  if ((SHART_REFUSALS as readonly string[]).includes(refusal)) {
    throw new Error(
      `MAPPER_REFUSALS and the engine's SHART_REFUSALS both contain "${refusal}". The mapper's ` +
        `vocabulary must stay DISJOINT from the engine's: they are carried on different details ` +
        `keys and mean different things (a record to finish transcribing vs a deed to interpret), ` +
        `and one name with two meanings is how a caller learns to trust the wrong remedy. Rename ` +
        `the mapper's value — the engine's twenty-six are closed and are not ours to move.`,
    );
  }
  if (MAPPER_REFUSAL_CODE[refusal] === undefined) {
    throw new Error(
      `MAPPER_REFUSALS contains "${refusal}" with no entry in MAPPER_REFUSAL_CODE. A refusal with ` +
        `no domain code has no user-facing sentence and no tRPC status.`,
    );
  }
}

/** Narrow an untrusted string to a mapper refusal. */
export function isMapperRefusal(value: unknown): value is MapperRefusal {
  return typeof value === 'string' && (MAPPER_REFUSALS as readonly string[]).includes(value);
}

/** Narrow an untrusted string to one of the engine's twenty-six discriminators. */
export function isShartRefusal(value: unknown): value is ShartRefusal {
  return typeof value === 'string' && (SHART_REFUSALS as readonly string[]).includes(value);
}

/**
 * Build the mapper's refusal.
 *
 * `reason` is developer-facing English for a log — it is NOT copy, and no surface renders it. The
 * discriminator goes to `details.mapperRefusal`; `details` may carry any extra non-PII context, and
 * **never a beneficiary name** (the same AT-16 rule the engine's trace lives under).
 */
export function mapperRefusal(
  refusal: MapperRefusal,
  reason: string,
  details: Readonly<Record<string, unknown>> = {},
): DomainError {
  return new DomainError(
    MAPPER_REFUSAL_CODE[refusal],
    `distribution mapping refused (${refusal}): ${reason} ` +
      `The database→engine mapping halts; it does not choose a representable state on the record's behalf.`,
    { details: { ...details, mapperRefusal: refusal } },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Reading a refusal back out
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Where the discriminator came from. `null` when the error carried none. */
export type RefusalSource = 'engine' | 'mapper';

/**
 * A refusal, named.
 *
 * `code` is the machine code; `refusal` is the DISCRIMINATOR — the only field that distinguishes the
 * twenty-six `SHART_INCOMPLETE`s from each other. `messageKey` is the key the thrown error already
 * carried (read, never constructed here), so exactly one place in the repo writes each i18n key.
 */
export interface ResolvedRefusal {
  /** A `DOMAIN_ERROR_CODES` member, or `'UNKNOWN'` for a non-`DomainError` throw. */
  readonly code: DomainErrorCode | 'UNKNOWN';
  /** The discriminator, or `null` when the error carried none. NEVER inferred from the message. */
  readonly refusal: ShartRefusal | MapperRefusal | null;
  /** Which vocabulary {@link refusal} belongs to. `null` iff `refusal` is `null`. */
  readonly refusalSource: RefusalSource | null;
  /** The i18n key for the ONE user-facing sentence, as the error itself declared it. */
  readonly messageKey: string | null;
  /** Developer-facing English. Log it; never render it. */
  readonly message: string;
  /** Structured non-PII context. Always an object, so a caller need not null-check it. */
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * Name a caught refusal, from either side of the boundary.
 *
 * Total: a non-`DomainError` throw resolves to `{ code: 'UNKNOWN', refusal: null }` rather than
 * being re-thrown, because the run lifecycle needs a value to persist and a screen to render even
 * when something unexpected escaped. The caller decides whether `'UNKNOWN'` is fatal — but it is
 * never silently reported as a refusal the engine made.
 *
 * ⚠ AN UNRECOGNISED DISCRIMINATOR IS DROPPED TO `null`, NOT PASSED THROUGH. If `details.refusal`
 * holds a string that is not a `SHART_REFUSALS` member, the engine's vocabulary and this build have
 * drifted, and forwarding the unknown string would put a code on a Nazir's screen that no
 * `<DiagnosticCode>` can explain and no test enumerates. It surfaces instead as
 * `details.unrecognisedRefusal`, where it is visible without being trusted.
 */
export function resolveRefusal(error: unknown): ResolvedRefusal {
  if (!isDomainError(error)) {
    return {
      code: 'UNKNOWN',
      refusal: null,
      refusalSource: null,
      messageKey: null,
      message: error instanceof Error ? error.message : String(error),
      details: {},
    };
  }

  const details: Readonly<Record<string, unknown>> = error.details ?? {};
  const engineCandidate = details['refusal'];
  const mapperCandidate = details['mapperRefusal'];

  if (isShartRefusal(engineCandidate)) {
    return {
      code: error.code,
      refusal: engineCandidate,
      refusalSource: 'engine',
      messageKey: error.messageKey,
      message: error.message,
      details,
    };
  }
  if (isMapperRefusal(mapperCandidate)) {
    return {
      code: error.code,
      refusal: mapperCandidate,
      refusalSource: 'mapper',
      messageKey: error.messageKey,
      message: error.message,
      details,
    };
  }

  const unrecognised = engineCandidate ?? mapperCandidate;
  return {
    code: error.code,
    refusal: null,
    refusalSource: null,
    messageKey: error.messageKey,
    message: error.message,
    details:
      unrecognised === undefined ? details : { ...details, unrecognisedRefusal: unrecognised },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The diagnostic channel — what the mapping noticed and REFUSED TO DROP
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Observations the mapping makes that do **not** stop the run.
 *
 * ── WHY THIS EXISTS AT ALL, AND WHY THE BUILDER'S RETURN TYPE IS NOT A BARE INPUT ────────────
 * `waqf-001` carries BOTH a deed-stipulated fixed 40,000.00 SAR ṣiyāna reserve AND a per-endowment
 * `Setting['distribution.maintenance.nazirDiscretionPercent'] = '5'` (MEASURED, in
 * `packages/database/src/seed/settings.ts`: those are the only two per-waqf Setting rows in the seed).
 * The deed wins — the founder's rule is a term of the Shart al-Waqif — so the discretion row is
 * either dead data or a live conflict, and **nothing in the schema, the seed or the engine
 * adjudicates it**. Whichever it is, the mapping is the only place that sees both sides, and if the
 * builder returned only a `DistributionInputRaw` the conflict would have nowhere to go. That silence
 * is what produced the conflict in the first place, so the builder returns the input **and** these.
 *
 * ── THEY ARE NOT RUN FLAGS ───────────────────────────────────────────────────────────────────
 * The engine's `RUN_FLAGS` describe the COMPUTATION and travel inside the hashed result. These
 * describe the MAPPING — facts about the record that the engine cannot see because they are about
 * fields it is not given — and they are deliberately outside the digest: adding them would make the
 * bytes a Nazir signs depend on this package's diagnostic wording, and `trace.ts` is explicit that
 * everything inside those bytes is frozen copy.
 *
 * ── COPY POSITION ───────────────────────────────────────────────────────────────────────────
 * TIER 2 (internal operations). Engineering MAY author their ar/en labels under a `distribution.*`
 * namespace; S7-5 owns that, together with adding this file to
 * `packages/i18n/test/code-source-parity.test.ts`'s `GROUP_SOURCES`. Until it does, **nothing in CI
 * notices that these codes have no copy** — next-intl prints a missing key rather than throwing.
 * ⚠ The moment one of them lands on a BENEFICIARY STATEMENT it becomes a different artifact and goes
 * through the owed register instead (the `RECEIPT_CLASS_CORRECTION` precedent).
 */
export const MAPPING_DIAGNOSTICS = [
  /**
   * ⚠ THE Q-S7-1 CONFLICT, MADE VISIBLE. The deed states a ṣiyāna rule **and** a Nazir discretionary
   * percentage is recorded for this endowment. The deed wins (it is a founder's condition and
   * immutable); the recorded discretion is not applied, and it is reported rather than ignored.
   * Options for the owner, none of them taken here: (a) a discretion row on a non-silent deed is a
   * data defect the UI must flag; (b) it is simply inert; (c) the Nazir may reserve IN ADDITION to
   * the deed's figure. `waqf-001` is exactly this row.
   */
  'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION',
  /**
   * The deed's ṣiyāna percentage, read back out of the Shart Json, carries more significant digits
   * than an IEEE-754 double can hold exactly — i.e. it is the residue of a float division and not a
   * figure a human wrote.
   *
   * ⚠ MEASURED, and the defect is UPSTREAM of this package:
   * `packages/database/src/seed/shart.ts` stores the deed's percentage as
   * `waqf.maintenanceRule.percent / 100`, in floating point. Of the 10,000 two-decimal percentages
   * from 0.01 to 100.00, **2,760 do not survive that division as a short decimal** — a deed
   * stipulating 2.9% is stored as `0.028999999999999998`, which shifts back to
   * `'2.8999999999999998'`, satisfies `ratePercentSchema` (≤ 18 dp, ≤ 100) and is therefore ACCEPTED
   * by the engine as the founder's rate.
   *
   * This mapping neither repairs it nor refuses it. Repairing would mean this code deciding what the
   * founder's percentage was; refusing would block an endowment on a defect in another package, on
   * every run. The EXACT stored value is passed through — so the run is still reproducible from the
   * record — and the diagnostic names the upstream cause.
   *
   * ✓ Today's fixture is unaffected: the only percent-basis deed is `waqf-002` at 5%, and
   * `5 / 100 === 0.05` exactly.
   */
  'MAINTENANCE_PERCENT_RATE_NOT_EXACTLY_REPRESENTABLE',
  /**
   * The deed is silent on maintenance and no Nazir discretion is recorded ⇒ `{ kind: 'UNSET' }`, and
   * the engine will raise `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED`. Echoed on the mapping side so
   * the wizard can say WHY before the run is computed, not only after.
   *
   * ⚠ The reserve is ZERO on this path, and that zero is not a decision anybody made. The owner's
   * OQ-06 ruling gives the Nazir a discretion; a discretion is not a default, and this code exists
   * so the difference is visible.
   */
  'MAINTENANCE_POLICY_UNACKNOWLEDGED',
  /**
   * The deed records no Nazir-fee basis, but a `nazirFee.percentOfRevenue` figure is configured for
   * this endowment. The figure is **NOT substituted**: the Nazir fee is set by the DEED (Nazarah Art.
   * 11), not by statute and not by configuration, so a silent deed means `nazirFee: null` and the
   * engine's `AUTHORITY_FEE_DETERMINATION_PENDING`. Whether a configured figure may stand in for a
   * silent deed is a trusteeship-authority question, surfaced here and not answered.
   */
  'NAZIR_FEE_DEED_SILENT_CONFIGURED_FIGURE_NOT_SUBSTITUTED',
  /**
   * The deed's Nazir-fee rate and the configured `nazirFee.percentOfRevenue` figure disagree. The
   * deed wins. On today's fixture they AGREE (`waqf-001`: deed 10%, Setting override 10) — which is
   * why the disagreement has to be asserted rather than assumed away.
   */
  'NAZIR_FEE_DEED_RATE_DISAGREES_WITH_CONFIGURED_FIGURE',
  /**
   * An EXPENSE row in the period was NOT counted as an operating cost, and here is its category and
   * total. `operatingCostMinor` is Σ `OPERATIONS` only:
   *   · `MAINTENANCE` actuals are a PAID COST and must never be added to the reserve — the reserve
   *     comes from the deed's rule (`EXP_SIYANA_IS_NOT_A_RESERVE` exists in `@qmulate/domain/ledger`
   *     for exactly this confusion);
   *   · `NAZIR_FEE` is COMPUTED by the engine at waterfall step 3, never read from cash, or it would
   *     be deducted twice;
   *   · `ZAKAT` is unruled (Q10) and this code may not decide whether it precedes distribution;
   *   · `OTHER` has no ruling either way, and folding an unclassified cost into the deduction that
   *     reduces every beneficiary's share is the kind of quiet decision this file exists to avoid.
   */
  'OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED',
  /**
   * A reversed original and/or its mirroring reversal were dropped from the period's ledger, with
   * their ids. The pair nets to zero **by exclusion, not by arithmetic** — `amountSar` is
   * non-negative and the sign is carried by `type`, so a negative contra-entry is unrepresentable and
   * a consumer that included both would report the money twice.
   */
  'LEDGER_REVERSED_PAIR_EXCLUDED',
  /**
   * CAPITAL receipts were PASSED IN to the engine, with their ids. Not "excluded here" — the
   * opposite. Filtering them out before the engine would leave `capitalReceiptsMinor` at zero, the
   * `CAPITAL_RECEIPTS_EXCLUDED` flag unraised and the trace step naming the excluded ids absent: the
   * corpus would become INVISIBLE instead of VISIBLY EXCLUDED. This code is the caller-side record
   * that the wall was fed, not bypassed.
   */
  'CAPITAL_RECEIPTS_PASSED_TO_ENGINE',
  /**
   * `shartAlWaqif.completeness.advisory` codes, echoed. NON-halting by the Shart's own declaration —
   * kept in a separate channel from the halting `missing` list, because a UI that showed one list of
   * "issues" would make a halting gap look like a warning.
   */
  'SHART_ADVISORY_GAP',
  /**
   * `beneficiaries[].disbursingEntity` was sent as `null` for every member because **no column
   * exists**. It is in the engine's declared fixture delta and is owed to E5/E6 — i.e. to this
   * sprint. Consequence, stated: the `ENTITY_UNLICENSED` gate cannot fire from database data at all,
   * so a licence expiry on a disbursing jiha is currently unenforceable on a real run.
   */
  'DISBURSING_ENTITY_HAS_NO_COLUMN',
  /**
   * `beneficiaries[].bankingRefForProceeds` was sent as `null` for every member because there is no
   * top-level column (only the encrypted UBO pair). Consequence, stated: a PAID line carries no
   * target reference (BR-501). Owed to E5/E6 with the item above.
   */
  'BANKING_REF_FOR_PROCEEDS_HAS_NO_COLUMN',
] as const;

/** One mapping observation's machine code. See {@link MAPPING_DIAGNOSTICS}. */
export type MappingDiagnosticCode = (typeof MAPPING_DIAGNOSTICS)[number];

/**
 * How loudly a surface should render a diagnostic.
 *
 * `CONFLICT` means two recorded facts disagree, or a figure is provably not what was recorded — a
 * human has to look. `NOTICE` means the mapping did something correct that the reader still needs to
 * know about. Deliberately two values and not a numeric severity: a scale invites "medium", and the
 * only question a Nazir asks is whether somebody must act.
 */
export type MappingDiagnosticSeverity = 'CONFLICT' | 'NOTICE';

/**
 * One observation.
 *
 * `detail` values are **STRINGS ONLY**, the same rule the engine's `TraceStep.data` lives under: a
 * `bigint` has no JSON form, a `Decimal` serialises as `{}`, and a JS number in a fiduciary figure is
 * banned end to end. Money appears here as a decimal string; ids appear as ids. **Never a name.**
 */
export interface MappingDiagnostic {
  readonly code: MappingDiagnosticCode;
  readonly severity: MappingDiagnosticSeverity;
  readonly detail: Readonly<Record<string, string>>;
}

/** Build one diagnostic. A helper only so the string-only `detail` rule has one enforcement point. */
export function mappingDiagnostic(
  code: MappingDiagnosticCode,
  severity: MappingDiagnosticSeverity,
  detail: Readonly<Record<string, string>> = {},
): MappingDiagnostic {
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value !== 'string') {
      throw new Error(
        `mappingDiagnostic(${code}): detail.${key} is ${typeof value}, not a string. Diagnostic ` +
          `details are strings for the same reason the engine's trace data is: a bigint has no JSON ` +
          `form, a Decimal serialises as {}, and a float in a fiduciary figure is banned.`,
      );
    }
  }
  return { code, severity, detail };
}
