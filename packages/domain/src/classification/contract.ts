/**
 * `classification/contract.ts` — **classification is a GATE, not a label** (BR-104).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It maps a **RECORDED** `WaqfClassification` to the set of regulatory obligations that bind at that
 * class, over the closed `ClassificationGate × WaqfClassification` matrix.
 *
 * ⚠ **IT DOES NOT COMPUTE THE CLASSIFICATION, AND MUST NEVER LEARN HOW.** The SAR 200M / 50M bands live
 * in `Setting['classification.threshold.large.sar' | 'classification.threshold.medium.sar']` and are
 * **UNVERIFIED against primary Saudi law** (CLAUDE.md binding rule 3), which is the whole reason they are
 * config: a correction must be a `Setting` change, not a deploy. A threshold reimplemented here would be
 * a second, hardcoded copy of an unverified statutory figure — the exact defect `../settings.ts` exists
 * to prevent. {@link CLASSIFICATION_BAND_SETTING_KEYS} names the keys so a caller can resolve them; there
 * is **no number in this file**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE MATRIX IS EXHAUSTIVE DATA RATHER THAN FOUR `if`s
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * All twenty-five cells (five static gates × five classes, `NOT_CLASSIFIED` included) are written
 * out. Two reasons, and the second is the load-bearing one:
 *
 *  1. A gate added to the vocabulary without a row is a **compile error**, so it cannot default to
 *     "applies to nobody" (an obligation silently vanishing from a register) or to "applies to everybody"
 *     (a small endowment told it owes a SOCPA-audited statement).
 *  2. `SMALL_DIRECT` and `LARGE_MEDIUM` are **complements**, and `ALL` is their union — relations that are
 *     invisible in nested conditionals and provable over a table. The E3 exit clause is a *contrast* (the
 *     MEDIUM waqf shows obligations the SMALL one does not), and a contrast cannot be proven from one
 *     side.
 *
 * ⚠ **Which classes an obligation binds is itself an unverified regulatory reading.** The gate lives on
 * the `ComplianceObligation` catalogue row (`gate ClassificationGate`, already carrying its own
 * `⚠ unverified` comment in `schema.prisma`), and every result out of this module carries the marker.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `WaqfClassification` IS IMPORTED, NOT RESTATED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The four classes come from `../distribution/contract.js`, where they are already compared
 * member-for-member against `schema.prisma` by `prisma-vocabulary-parity.test.ts`. Declaring a second
 * tuple here would create exactly the two-lists-that-must-agree situation this repo has been bitten by
 * three times (`enum Role`, `FeeBasis`, the whole distribution vocabulary). The direction of the import
 * is a little odd — a compliance module reading the distribution engine's contract — and it is
 * deliberate: one spelling beats a tidy dependency graph. `CLASSIFICATION_GATES` is new here and gets its
 * own text-read parity test against `schema.prisma`, for the same reason.
 */

import { WAQF_CLASSIFICATIONS } from '../distribution/contract.js';
import type { WaqfClassification } from '../distribution/contract.js';
import { UNVERIFIED_NOTE } from '../settings.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `ClassificationGate` — which endowment classes an obligation binds.
 *
 * Must equal `schema.prisma`'s `enum ClassificationGate` member-for-member;
 * `__tests__/classification-parity.test.ts` reads the schema as text and compares. It is deliberately
 * **not** added to `distribution/__tests__/prisma-vocabulary-parity.test.ts`, whose fourteen pairings are
 * the *distribution* contract's own and are pinned at that number.
 */
export const CLASSIFICATION_GATES = [
  'ALL',
  'LARGE_MEDIUM',
  'SMALL_DIRECT',
  // ⊕ S8-Q3 (product owner, 2026-08-23): "Adopt §09's five gates." Both of these were used by §09's
  // library table and existed in NO enum, which made SEVEN of its 37 templates unrepresentable —
  // including the distribution duty itself (FIN-DIST-01/02).
  'EXCLUDE_DIRECT',
  'HAS_INCOME',
  // ⚠ RETIRED BY THE SAME RULING — "refused-not-remapped", the JOINT/ADR-0004 precedent. It stays in
  // the vocabulary so no migration has to remap data (there is none to remap: zero §09 rows and zero
  // fixture rows ever used it) and so the name keeps meaning something to a reader of an old record.
  // What changed is that the ENGINE now refuses it — see RETIRED_GATES and `obligationsForClassification`.
  'LARGE_ONLY',
] as const;
export type ClassificationGate = (typeof CLASSIFICATION_GATES)[number];

/**
 * Gates whose meaning is a fixed set of classes, so the matrix can answer them with a lookup.
 *
 * ⚠ **`HAS_INCOME` IS DELIBERATELY NOT HERE, AND THE TYPE IS WHAT ENFORCES THAT.** §09 describes it in
 * terms as *"a runtime predicate, not a static class set"* — it applies to any class where the
 * endowment actually records revenue or expense in the period. That is a fact about the LEDGER, not
 * about the classification, and no width of `Record<Gate, Record<Class, boolean>>` can express it.
 *
 * The owner's Q3 ruling names this consequence and leaves the design to engineering. The design is:
 * keep the matrix TOTAL over the gates it can actually answer, and make it a **compile error** to look
 * `HAS_INCOME` up in it. A row of four `false`s would have type-checked, read as "applies to nobody",
 * and silently dropped four of §09's obligations — including recording revenue and expenses in Arabic
 * (FIN-ACC-02), which is the one duty NFR-01 makes non-negotiable.
 */
export const STATIC_CLASSIFICATION_GATES = [
  'ALL',
  'LARGE_MEDIUM',
  'SMALL_DIRECT',
  'EXCLUDE_DIRECT',
  'LARGE_ONLY',
] as const;
export type StaticClassificationGate = (typeof STATIC_CLASSIFICATION_GATES)[number];

/** The runtime-predicate gate. Separated from the static ones by TYPE, not by convention. */
export const HAS_INCOME_GATE = 'HAS_INCOME' as const;

/**
 * Gates the engine RECOGNISES and REFUSES — retired vocabulary, per S8-Q3.
 *
 * ⚠ A retired gate is **not** an unrecognised one and must never be routed to the same bucket. An
 * unrecognised gate means "somebody mis-typed a catalogue row"; a retired gate means "this row was
 * written against a rule the product no longer has". Both must halt rather than resolve — silently
 * excluding either drops a statutory duty and leaves no trace, which is the failure
 * `obligationsForClassification`'s buckets exist to prevent — but a caller reporting them needs to
 * tell a reader which happened.
 */
export const RETIRED_GATES: readonly ClassificationGate[] = Object.freeze(['LARGE_ONLY']);

/** Is this gate retired? Total over the recognised vocabulary. */
export function isRetiredGate(gate: string): boolean {
  return (RETIRED_GATES as readonly string[]).includes(gate);
}

/** Is this gate answerable from the matrix alone? */
export function isStaticClassificationGate(value: string): value is StaticClassificationGate {
  return (STATIC_CLASSIFICATION_GATES as readonly string[]).includes(value);
}

/** Re-exported so a caller need not reach into the distribution contract for the four classes. */
export { WAQF_CLASSIFICATIONS };
export type { WaqfClassification };

/**
 * The `Setting` keys that hold the classification bands. **Keys only — never the figures.**
 *
 * ⚠ The SAR 200M / 50M thresholds they resolve to are UNVERIFIED against primary Saudi law and must be
 * presented with {@link CLASSIFICATION_UNVERIFIED_NOTE} wherever they are shown (binding rule 3). This
 * module maps a *recorded* classification and never reads these; they are listed so the API's
 * `classification.get` can return the provenance of a band alongside the class it produced.
 */
export const CLASSIFICATION_BAND_SETTING_KEYS: readonly string[] = Object.freeze([
  'classification.threshold.large.sar',
  'classification.threshold.medium.sar',
]);

/** The one ⚠ marker every result carries. Byte-identical to the `Setting` marker. */
export const CLASSIFICATION_UNVERIFIED_NOTE = UNVERIFIED_NOTE;

/**
 * The single reason an obligation is excluded by this module.
 *
 * A machine code, and a closed one-value vocabulary: the *only* thing gating decides is whether the class
 * is in the gate's set. Anything else that could exclude an obligation — it is not yet started, it is
 * waived, its deadline has passed — is a **task instance's** state and belongs to E7, not here.
 */
export const GATE_EXCLUSION_REASON = 'GATE_EXCLUDES_CLASSIFICATION' as const;

/**
 * ⊕ S8-Q3's second reason: the gate is `HAS_INCOME` and the endowment records none this period.
 *
 * ⚠ **A DISTINCT CODE, not a reuse of the one above, because the two are different facts with
 * different lifetimes.** `GATE_EXCLUDES_CLASSIFICATION` is a statement about the endowment's CLASS and
 * changes only on a reclassification — a recorded, audited, deliberate act. This one is a statement
 * about the LEDGER in a PERIOD and flips the moment a single receipt is booked. A screen that showed
 * both under one sentence would tell a Nazir that a duty does not apply to this endowment when the
 * truth is that it does not apply *yet, this period*.
 */
export const INCOME_EXCLUSION_REASON = 'NO_INCOME_IN_PERIOD' as const;

export const GATE_EXCLUSION_REASONS = [GATE_EXCLUSION_REASON, INCOME_EXCLUSION_REASON] as const;

export type GateExclusionReason = (typeof GATE_EXCLUSION_REASONS)[number];

/**
 * ⊕ S8-Q4 (owner, 2026-08-23) — the register-lock reason, for the ONE state where this module
 * refuses to partition at all: a recorded classification of `NOT_CLASSIFIED`.
 *
 * ⚠ **NOT a third `GateExclusionReason`, and the difference is the ruling.** An exclusion reason is
 * a DETERMINATION — "this duty was considered and this endowment's class is outside its gate". The
 * absence of a classification cannot make that determination for a single row, in either
 * direction: gating everything FALSE would report forty-odd duties as "excluded", which reads as
 * "considered and not owed" when the truth is "not yet askable". So the resolver returns a LOCKED
 * result carrying this reason and EMPTY lists — the same posture the distribution engine takes on
 * `SHART_INCOMPLETE`: it halts rather than answering a question whose premise is missing. The lock
 * lifts the moment the real classification is recorded (`classification.reclassify` FROM
 * `NOT_CLASSIFIED` is the one exit, and it must always work — the liveness half).
 */
export const REGISTER_LOCK_REASON = 'REGISTER_LOCKED_NOT_CLASSIFIED' as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The SIZE matrix — all twenty cells (five gates × four size values)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `gate → SIZE → does it bind`. **Exhaustive in both dimensions**, and now only ONE of the two axes.
 *
 * ⊕ **S9-4a: THIS MATRIX WAS SIXTEEN CELLS AND IS TWENTY, and it lost a column rather than gaining
 * one.** `DIRECT_UTILIZATION` used to be a fifth column here — a SIZE value — which the owner ruled
 * it is not (fifth batch, 2026-08-25: ذات انتفاع مباشر is an orthogonal usage attribute; *"there
 * are 3 types: large, medium, small"*). The usage axis now lives in {@link DIRECT_USE_AXIS} and is
 * applied ON TOP of this lookup by `gateAppliesTo`.
 *
 * ⚠ The cell count moved 16 → 20 because `NOT_CLASSIFIED` stays and the gate list is unchanged
 * (5 × 4 = 20, against the old 4 gates' worth of arithmetic in the previous header — which said
 * "sixteen" while the object held five gates × five classes = 25, a number
 * `obligation-gating.test.ts`'s own comment used correctly. The header was stale; corrected here
 * rather than carried.)
 *
 * ⚠ unverified — confirm vs primary law, like every gate assignment.
 */
export const CLASSIFICATION_GATE_MATRIX: Readonly<
  Record<StaticClassificationGate, Readonly<Record<WaqfClassification, boolean>>>
> = Object.freeze({
  /**
   * Every endowment, whatever its class. The regulation's baseline duties.
   *
   * ⚠ ⊕ S8-Q4: `NOT_CLASSIFIED: false` — EVEN HERE, and this row is where the ruling's sentence
   * bites. "NOT_CLASSIFIED must never gate a template TRUE — it is the absence of a determination,
   * not a class" (owner, 2026-08-23). An unclassified endowment does not owe the BASELINE set
   * either: its register is LOCKED (`obligationsForClassification` refuses to partition at all —
   * see `gating.ts`), and these cells exist so that even a caller that bypasses the lock and
   * consults the matrix directly finds nothing gated TRUE. `obligation-gating.test.ts` pins the
   * whole `NOT_CLASSIFIED` column false across every gate.
   */
  ALL: Object.freeze({
    LARGE: true,
    MEDIUM: true,
    SMALL: true,
    NOT_CLASSIFIED: false,
  }),
  /** The heavier duties: audited financial statements, internal bylaws, and their kin. */
  LARGE_MEDIUM: Object.freeze({
    LARGE: true,
    MEDIUM: true,
    SMALL: false,
    NOT_CLASSIFIED: false,
  }),
  /** The complement of `LARGE_MEDIUM` — the lighter-touch regime. */
  SMALL_DIRECT: Object.freeze({
    LARGE: false,
    MEDIUM: false,
    SMALL: true,
    NOT_CLASSIFIED: false,
  }),
  /**
   * ⊕ S8-Q3 — the monetary-distribution duties. §09: *"a Direct-utilization waqf has none"*, because
   * its benefit IS the direct use of the asset and there is no yield to distribute.
   *
   * ⚠ It is NOT the same set as `LARGE_MEDIUM` plus `SMALL`: those are size bands and this is a
   * statement about whether the endowment distributes money at all. The two coincide today over four
   * classes and would diverge the moment a fifth class existed. ⚠ unverified — confirm vs primary law.
   */
  EXCLUDE_DIRECT: Object.freeze({
    LARGE: true,
    MEDIUM: true,
    SMALL: true,
    NOT_CLASSIFIED: false,
  }),
  /**
   * ⚠ RETIRED (S8-Q3). The row is kept so the matrix stays TOTAL over its key type and so
   * `classesAdmittedBy` can still answer for an old record — but `obligationsForClassification`
   * REFUSES a catalogue row carrying this gate before ever consulting the matrix. Deleting the row
   * would make the retirement a type error at every call site instead of a reported refusal, which is
   * the wrong shape: the point of refusing rather than remapping is that the DATA is what gets
   * reported, not the code that reads it.
   */
  LARGE_ONLY: Object.freeze({
    LARGE: true,
    MEDIUM: false,
    SMALL: false,
    NOT_CLASSIFIED: false,
  }),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The SECOND axis — ذات انتفاع مباشر (S9-4a, owner ruling fifth batch)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * How the DIRECT-USE attribute modifies a gate's size answer.
 *
 *  · `ignores`  — the gate does not consult usage at all; the size answer stands.
 *  · `admits`   — direct use ADMITS the row even where size would not (`SMALL_DIRECT`: the
 *                 lighter-touch regime is written for small endowments **and** direct-use ones).
 *  · `excludes` — direct use EXCLUDES the row whatever the size (`EXCLUDE_DIRECT`: §09 — *"a
 *                 Direct-utilization waqf has none"* of the monetary-distribution duties, because
 *                 its benefit IS the direct use and there is no yield to distribute).
 *
 * ⚠ **THE TWO SENSITIVE GATES PULL IN OPPOSITE DIRECTIONS, and that is the whole reason this axis
 * had to leave the size enum.** While `DIRECT_UTILIZATION` was a size value, `SMALL_DIRECT` and
 * `EXCLUDE_DIRECT` could only ever be keyed on the same single column, so a **MEDIUM direct-use**
 * endowment was unrepresentable — and it is precisely the case where the two gates disagree: it
 * should get the lighter-touch statement (`admits`) and NOT the distribution duties (`excludes`).
 * The old model could express neither.
 *
 * ⚠ unverified — confirm vs primary law (binding rule 3), like every gate assignment. And the
 * ruling's own counsel flag stands: the regulation summary reads the classification instrument as
 * FOUR categories; the owner (a practising Nazir) reads direct-benefit as an attribute.
 */
export const DIRECT_USE_AXIS: Readonly<
  Record<StaticClassificationGate, 'ignores' | 'admits' | 'excludes'>
> = Object.freeze({
  ALL: 'ignores',
  LARGE_MEDIUM: 'ignores',
  SMALL_DIRECT: 'admits',
  EXCLUDE_DIRECT: 'excludes',
  /** Retired (S8-Q3); refused before the matrix is consulted, so its axis entry never runs. */
  LARGE_ONLY: 'ignores',
});

/**
 * The gates that CONSULT the direct-use attribute — derived from {@link DIRECT_USE_AXIS}, never
 * restated. A row carrying one of these cannot be decided while the attribute is NULL.
 */
export const DIRECT_USE_SENSITIVE_GATES: readonly StaticClassificationGate[] = Object.freeze(
  (Object.keys(DIRECT_USE_AXIS) as StaticClassificationGate[]).filter(
    (gate) => DIRECT_USE_AXIS[gate] !== 'ignores',
  ),
);

/**
 * §09's ONE income-conditional MATRIX CELL, **re-keyed on the attribute** (S9-4a).
 *
 * §09's footnote sits on exactly one ✓: *"Simplified annual financial statement — Small ✓ ·
 * Direct-utilization ✓ **(if income/expense exists)**"*. So the condition attaches to the
 * DIRECT-USE half of `SMALL_DIRECT`, not to a size — which is what it always meant and what the
 * old signature could not say. A plain `SMALL` endowment owes the simplified statement
 * unconditionally; a direct-use one owes it only if it actually records income or expense.
 *
 * ⚠ Before S9-4a this read `gate === 'SMALL_DIRECT' && classification === 'DIRECT_UTILIZATION'`.
 * The behaviour for a direct-use endowment is UNCHANGED; what changed is that a **MEDIUM** direct-use
 * endowment now reaches this cell at all (via `admits`), and reaches it income-conditionally, which
 * the old model made unrepresentable rather than deciding wrongly.
 */
export function isIncomeConditionalCell(
  gate: StaticClassificationGate,
  directUtilization: boolean | null | undefined,
): boolean {
  return gate === 'SMALL_DIRECT' && directUtilization === true;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Obligation shapes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A catalogue row as this module needs it — a **structural** subset of `ComplianceObligation`, not the
 * Prisma type (`packages/domain` imports nothing internal, and that constraint is locked).
 *
 * ⚠ `gate` is a **`string`, not a `ClassificationGate`**, and that is the same decision
 * `distribution/contract.ts` header rule 4 makes for `entitlementOrder`: an unrecognised value must reach
 * this module as **data** so it can be *reported*, rather than being a shape error — or, far worse, being
 * silently treated as "does not apply", which is a regulatory obligation vanishing from an endowment's
 * register with nothing anywhere saying so.
 */
export interface GatedObligation {
  /** The catalogue code, e.g. `"GL-3-1-register-30bd"`. */
  readonly code: string;
  /** `ClassificationGate` as recorded. Unrecognised values are reported, never dropped. */
  readonly gate: string;
  /** `ComplianceSection` — kept as `string` for the same reason; E7 owns that vocabulary. */
  readonly section: string;
  /** Arabic-authoritative (NFR-01). Passed through untouched; this module writes no copy. */
  readonly workstreamAr: string;
  readonly workstreamEn: string;
  readonly titleAr: string;
  readonly titleEn: string;
  /** `Setting['deadline.<ruleKey>.…']`. The WINDOW is never stored on the obligation. */
  readonly deadlineRuleKey: string | null;
}

/** An obligation that binds at this classification. */
export interface ApplicableObligation extends GatedObligation {
  /** The recognised gate that admitted it. Narrowed from `GatedObligation.gate`. */
  readonly resolvedGate: ClassificationGate;
  /** ⚠ Always `true` — which classes an obligation binds is an unverified regulatory reading. */
  readonly unverified: true;
}

/** An obligation the recorded classification is outside the gate of. */
export interface ExcludedObligation extends GatedObligation {
  readonly resolvedGate: ClassificationGate;
  readonly reason: GateExclusionReason;
  readonly unverified: true;
}

/**
 * A catalogue row whose `gate` is not a recognised {@link CLASSIFICATION_GATES} member.
 *
 * ⚠ **Reported as its own bucket, and it is NEITHER applicable NOR excluded.** Folding it into `excluded`
 * would mean an unreadable gate silently removes a duty from an endowment's compliance register — a
 * compliance obligation disappearing because a catalogue row was mis-typed. **The caller must refuse the
 * request when this array is non-empty**, exactly as the engine halts on an unreadable Shart rather than
 * guessing; it is surfaced as data rather than thrown so the caller can name every bad row at once
 * instead of one per round trip.
 */
export interface UnrecognisedGateObligation extends GatedObligation {
  readonly recordedGate: string;
  readonly recognisedGates: readonly ClassificationGate[];
}

/** What {@link obligationsForClassification} returns. */
/** A catalogue row whose gate is recognised but RETIRED (S8-Q3). Neither applicable nor excluded. */
export interface RetiredGateObligation extends GatedObligation {
  readonly retiredGateValue: string;
  /** The gates still in service, so a refusal message can name the alternatives. */
  readonly liveGates: readonly ClassificationGate[];
}

/**
 * A `HAS_INCOME` row evaluated without the ledger fact it needs (S8-Q3).
 *
 * Carries the fact's NAME rather than a value, so a caller's message can say *what to supply* rather
 * than only that something was missing — the same reason the retention guards' refusals name the legal
 * alternative instead of only the prohibition.
 */
export interface IncomeFactMissingObligation extends GatedObligation {
  readonly requiredFact: 'hasIncomeInPeriod';
}

/**
 * ⊕ S9-4a. A row whose gate consults the direct-use axis, met with an UNRECORDED attribute.
 *
 * Carries `resolvedGate` (which the income variant does not need) because the two sensitive gates
 * pull in OPPOSITE directions — a reader has to know whether the undecided row would have been
 * ADMITTED by direct use or EXCLUDED by it, and `DIRECT_USE_AXIS[resolvedGate]` is that answer.
 */
export interface DirectUseFactMissingObligation extends GatedObligation {
  readonly resolvedGate: StaticClassificationGate;
  readonly requiredFact: 'directUtilization';
}

export interface ClassificationObligations {
  readonly classification: WaqfClassification;
  /**
   * ⊕ S8-Q4. `true` ⇔ `classification === 'NOT_CLASSIFIED'`: the register is LOCKED and NO
   * partition was computed — every list below is empty, and their emptiness means "not asked",
   * never "nothing owed". A caller rendering a register MUST check this before reading the lists;
   * a caller instantiating tasks MUST refuse while it is `true` (the ruling: "no tasks instantiate
   * until the real classification is recorded"). See {@link REGISTER_LOCK_REASON}.
   */
  readonly registerLocked: boolean;
  readonly obligations: readonly ApplicableObligation[];
  readonly excluded: readonly ExcludedObligation[];
  /** ⚠ Non-empty ⇒ the caller must REFUSE. See {@link UnrecognisedGateObligation}. */
  readonly unrecognisedGate: readonly UnrecognisedGateObligation[];
  /**
   * ⊕ S8-Q3. Rows whose gate is RECOGNISED but RETIRED (`LARGE_ONLY`).
   *
   * ⚠ **Its own bucket, not folded into `unrecognisedGate` and emphatically not into `excluded`.**
   * "Somebody mis-typed a catalogue row" and "this row was written against a rule the product no
   * longer has" need different sentences to a reader, and either folded into `excluded` would drop a
   * statutory duty with no trace — which is the entire failure mode these buckets exist to prevent.
   * ⚠ Non-empty ⇒ the caller must REFUSE.
   */
  readonly retiredGate: readonly RetiredGateObligation[];
  /**
   * ⊕ S8-Q3. `HAS_INCOME` rows the caller supplied no ledger fact for.
   *
   * ⚠ **NOT defaulted in either direction, and this is the sharpest of the new buckets.** `false`
   * silently drops four §09 obligations, including recording revenue and expenses in Arabic — the one
   * duty NFR-01 makes non-negotiable. `true` tells a small direct-use endowment with no money that it
   * owes bank reconciliation and a zakat filing. There is no safe default for an unasked question, so
   * the engine reports that it was not asked. Same posture the distribution engine takes on
   * `SHART_INCOMPLETE`: it halts rather than guessing.
   */
  readonly incomeFactMissing: readonly IncomeFactMissingObligation[];
  /**
   * ⊕ S9-4a. Rows whose gate CONSULTS the direct-use attribute (`SMALL_DIRECT`, `EXCLUDE_DIRECT`)
   * while `Waqf.directUtilization` is UNRECORDED.
   *
   * ⚠ **Its own bucket, and NOT folded into `excluded` — for `incomeFactMissing`'s reason, sharpened.**
   * The owner's ruling is explicit that unrecorded is not "not direct", and reading absence as `false`
   * would decide the question in BOTH directions at once: `EXCLUDE_DIRECT` would ADD the
   * monetary-distribution duties to an endowment that may have no yield, while `SMALL_DIRECT` would
   * REMOVE the simplified annual statement from one that owes it. There is no safe default for an
   * unasked question. ⚠ Non-empty ⇒ the caller must not treat the partition as complete.
   */
  readonly directUseFactMissing: readonly DirectUseFactMissingObligation[];
  readonly unverifiedNotes: readonly string[];
  /** The `Setting` keys behind the band that produced this class. Provenance, not figures. */
  readonly bandSettingKeys: readonly string[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Guards
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Is this a recognised gate? */
export function isClassificationGate(value: unknown): value is ClassificationGate {
  return (CLASSIFICATION_GATES as readonly unknown[]).includes(value);
}

/** Is this a recognised classification? */
export function isWaqfClassification(value: unknown): value is WaqfClassification {
  return (WAQF_CLASSIFICATIONS as readonly unknown[]).includes(value);
}
