/**
 * `classification/gating.ts` — the pure BR-104 gating resolver.
 *
 * "**Classification is a gate, not a label**": re-classifying an endowment changes *which regulatory
 * duties exist for it*. This module is the one place that mapping is computed, so the API, a report, a
 * dashboard tile and a reclassification's "obligations gained / lost" diff cannot answer it four
 * different ways.
 *
 * Pure: no I/O, no clock, no money, no `Setting` read. The catalogue and the recorded classification are
 * arguments; the bands stay in `Setting` and are never consulted here (see the contract's header).
 */

import {
  CLASSIFICATION_GATES,
  CLASSIFICATION_GATE_MATRIX,
  CLASSIFICATION_BAND_SETTING_KEYS,
  CLASSIFICATION_UNVERIFIED_NOTE,
  DIRECT_USE_AXIS,
  GATE_EXCLUSION_REASON,
  HAS_INCOME_GATE,
  INCOME_EXCLUSION_REASON,
  isClassificationGate,
  isIncomeConditionalCell,
  isRetiredGate,
  type DirectUseFactMissingObligation,
} from './contract.js';
import type {
  ApplicableObligation,
  ClassificationObligations,
  ExcludedObligation,
  GatedObligation,
  IncomeFactMissingObligation,
  RetiredGateObligation,
  StaticClassificationGate,
  UnrecognisedGateObligation,
  WaqfClassification,
} from './contract.js';

/**
 * Does `gate` admit `classification`? The 5 × 5 matrix, as a total function.
 *
 * The whole of BR-104's gating logic is this one lookup, and it is a lookup rather than a chain of
 * comparisons on purpose — see the contract's header for why all twenty-five cells are written out.
 * ⚠ At `NOT_CLASSIFIED` every gate answers `false` (S8-Q4) — but a register read must never get
 * that far: `obligationsForClassification` LOCKS above the partition, because "excluded" is a
 * determination the absence of a classification cannot make.
 */
export function gateAppliesTo(
  gate: StaticClassificationGate,
  classification: WaqfClassification,
  directUtilization?: boolean | null,
): boolean | typeof DIRECT_USE_UNRECORDED {
  const bySize = CLASSIFICATION_GATE_MATRIX[gate][classification];
  const axis = DIRECT_USE_AXIS[gate];
  if (axis === 'ignores') return bySize;

  // ⊕ S9-4a — THE SECOND AXIS, and the refusal that comes with it. A gate that CONSULTS usage
  // cannot be decided while the attribute is NULL: the ruling's words are *"an endowment whose usage
  // is unrecorded is UNRECORDED, not 'not direct'"*, so reading NULL as `false` would silently
  // decide the very question nobody has answered — and in the `EXCLUDE_DIRECT` direction it would
  // ADD statutory duties, while in `SMALL_DIRECT` it would REMOVE one. There is no safe default for
  // an unasked question; the caller is told it was not asked (the `HAS_INCOME` posture, and the
  // distribution engine's `SHART_INCOMPLETE` posture one layer over).
  if (directUtilization === undefined || directUtilization === null) return DIRECT_USE_UNRECORDED;

  return axis === 'admits' ? bySize || directUtilization : bySize && !directUtilization;
}

/**
 * What `gateAppliesTo` returns instead of a boolean when a usage-sensitive gate meets an UNRECORDED
 * attribute. A named sentinel rather than `undefined`, so a caller that forgets to handle it gets a
 * type error rather than a falsy value that reads as "does not apply".
 */
export const DIRECT_USE_UNRECORDED = 'DIRECT_USE_UNRECORDED' as const;

/**
 * The SIZE values a gate admits, in `WAQF_CLASSIFICATIONS` order. Derived from the matrix, never
 * restated.
 *
 * ⊕ S9-4a — **SIZE ONLY. It does not answer the usage axis**, and a caller rendering "applies to:"
 * beside an obligation whose gate is in `DIRECT_USE_SENSITIVE_GATES` must say so, because for those
 * gates the size list is only half the answer: a MEDIUM direct-use endowment is admitted by
 * `SMALL_DIRECT` and excluded by `EXCLUDE_DIRECT`, and neither fact is in this list.
 */
export function classesAdmittedBy(gate: StaticClassificationGate): readonly WaqfClassification[] {
  const row = CLASSIFICATION_GATE_MATRIX[gate];
  return Object.freeze(
    (Object.keys(row) as WaqfClassification[]).filter((classification) => row[classification]),
  );
}

/**
 * Partition a catalogue by a **recorded** classification: what binds, what does not, and what could not
 * be read at all.
 *
 * `excluded` is returned alongside `obligations` deliberately — it is what makes the E3 exit clause's
 * contrast provable in **one** call (`waqf-002` is SMALL, so the two `LARGE_MEDIUM` codes appear in
 * `excluded` carrying `GATE_EXCLUDES_CLASSIFICATION`, rather than merely being absent, and "absent"
 * cannot be told apart from "the catalogue never had them").
 *
 * ⚠ **A row with an unrecognised `gate` goes to `unrecognisedGate`, and the caller must REFUSE.** It is
 * not silently excluded: an obligation disappearing from an endowment's register because a catalogue row
 * was mis-typed is a compliance failure that leaves no trace. The array is data rather than a throw so a
 * caller can name every bad row in one pass.
 *
 * ⚠ Duplicate `code`s are **not** de-duplicated. The catalogue's `code` is `@unique` in the database, so a
 * duplicate here means the caller assembled the list wrongly, and silently collapsing it would hide that
 * — the same reasoning as the engine refusing to de-duplicate a repeated ultimate-taker id.
 */
export function obligationsForClassification(args: {
  readonly classification: WaqfClassification;
  readonly catalogue: readonly GatedObligation[];
  /**
   * ⊕ S8-Q3 — the LEDGER fact `HAS_INCOME` needs: does this endowment record revenue or expense in
   * the period under consideration?
   *
   * ⚠ **OPTIONAL, and its absence is REPORTED rather than defaulted.** A caller that has no ledger
   * to consult (a setup screen, a catalogue preview) legitimately cannot supply it — so omitting it is
   * allowed, and every `HAS_INCOME` row then lands in `incomeFactMissing` instead of being decided.
   * Making the parameter required would have pushed every such caller into inventing a boolean, which
   * is the same defect one level up.
   *
   * `null` is accepted and treated exactly as absent, because that is what a nullable database column
   * reads as and a caller should not have to translate it.
   */
  readonly hasIncomeInPeriod?: boolean | null;
  /**
   * ⊕ S9-4a — ذات انتفاع مباشر, the ORTHOGONAL USAGE AXIS (owner ruling, fifth batch).
   *
   * ⚠ **OPTIONAL, and `null`/absent is REPORTED rather than defaulted**, exactly like
   * `hasIncomeInPeriod` above and for a sharper reason: the ruling says in terms that *"an endowment
   * whose usage is unrecorded is UNRECORDED, not 'not direct'."* Reading absence as `false` decides
   * the question nobody asked — and it decides it in BOTH directions at once, adding the
   * monetary-distribution duties (`EXCLUDE_DIRECT`) while removing the simplified statement
   * (`SMALL_DIRECT`). Rows whose gate consults usage land in `directUseFactMissing`.
   *
   * A gate that IGNORES usage (`ALL`, `LARGE_MEDIUM`) is unaffected, so a caller with no attribute
   * still gets a complete answer for most of the catalogue.
   */
  readonly directUtilization?: boolean | null;
}): ClassificationObligations {
  const { classification, catalogue, hasIncomeInPeriod, directUtilization } = args;

  // ⊕ S8-Q4 (owner, 2026-08-23) — THE REGISTER LOCK, and it sits ABOVE the partition on purpose.
  // "NOT_CLASSIFIED must never gate a template TRUE — it is the absence of a determination, not a
  // class." Partitioning here would put every row in `excluded`, which READS as "considered and
  // not owed" — a determination the missing classification cannot make in either direction. So no
  // partition is computed at all: empty lists plus `registerLocked: true`, the SHART_INCOMPLETE
  // posture. E7 exit clause A2 is this line ("the register is locked … and no tasks are
  // materialised"). The one exit is recording the real classification — `obligationDelta` FROM
  // this state therefore reports the new class's full set as `gained`, which is exactly what a
  // Nazir authorising the first classification should be shown.
  if (classification === 'NOT_CLASSIFIED') {
    return Object.freeze({
      classification,
      registerLocked: true,
      obligations: Object.freeze([]),
      excluded: Object.freeze([]),
      unrecognisedGate: Object.freeze([]),
      retiredGate: Object.freeze([]),
      incomeFactMissing: Object.freeze([]),
      directUseFactMissing: Object.freeze([]),
      unverifiedNotes: Object.freeze([CLASSIFICATION_UNVERIFIED_NOTE]),
      bandSettingKeys: CLASSIFICATION_BAND_SETTING_KEYS,
    });
  }

  const obligations: ApplicableObligation[] = [];
  const excluded: ExcludedObligation[] = [];
  const unrecognisedGate: UnrecognisedGateObligation[] = [];
  const retiredGate: RetiredGateObligation[] = [];
  const incomeFactMissing: IncomeFactMissingObligation[] = [];
  const directUseFactMissing: DirectUseFactMissingObligation[] = [];

  const liveGates = Object.freeze(CLASSIFICATION_GATES.filter((gate) => !isRetiredGate(gate)));

  for (const entry of catalogue) {
    if (!isClassificationGate(entry.gate)) {
      unrecognisedGate.push({
        ...entry,
        recordedGate: entry.gate,
        recognisedGates: CLASSIFICATION_GATES,
      });
      continue;
    }

    // RETIRED BEFORE ANYTHING ELSE (S8-Q3). Checked first because `LARGE_ONLY` still HAS a matrix row
    // — kept so the matrix stays total over its key type — and consulting it would produce a
    // perfectly plausible verdict for a rule the product no longer has.
    if (isRetiredGate(entry.gate)) {
      retiredGate.push({ ...entry, retiredGateValue: entry.gate, liveGates });
      continue;
    }

    // THE RUNTIME PREDICATE (S8-Q3). §09: `has_income` "applies to any class where the waqf has >= 1
    // revenue/expense record in the period" — a fact about the ledger, so it cannot come from the
    // matrix and must not be invented here.
    if (entry.gate === HAS_INCOME_GATE) {
      if (hasIncomeInPeriod === undefined || hasIncomeInPeriod === null) {
        incomeFactMissing.push({ ...entry, requiredFact: 'hasIncomeInPeriod' });
      } else if (hasIncomeInPeriod) {
        obligations.push({ ...entry, resolvedGate: HAS_INCOME_GATE, unverified: true });
      } else {
        excluded.push({
          ...entry,
          resolvedGate: HAS_INCOME_GATE,
          reason: INCOME_EXCLUSION_REASON,
          unverified: true,
        });
      }
      continue;
    }

    const resolvedGate: StaticClassificationGate = entry.gate;
    const applies = gateAppliesTo(resolvedGate, classification, directUtilization);

    // ⊕ S9-4a — the usage axis was consulted and the attribute is UNRECORDED. Reported, never
    // defaulted: `EXCLUDE_DIRECT` read as not-direct would ADD the monetary-distribution duties to
    // an endowment that may have no yield at all, and `SMALL_DIRECT` read the same way would REMOVE
    // the simplified statement from one that owes it. Its own bucket, for `incomeFactMissing`'s
    // reason: "we could not decide" must never be filed as "considered and not owed".
    if (applies === DIRECT_USE_UNRECORDED) {
      directUseFactMissing.push({ ...entry, resolvedGate, requiredFact: 'directUtilization' });
      continue;
    }

    if (!applies) {
      excluded.push({
        ...entry,
        resolvedGate,
        reason: GATE_EXCLUSION_REASON,
        unverified: true,
      });
      continue;
    }

    // ⊕ E7-completion — §09's ONE income-conditional cell: `SMALL_DIRECT` at `DIRECT_UTILIZATION`
    // is admitted by the matrix AND THEN decided by the ledger ("Direct-utilization only when it
    // actually records income/expense" — the cell exit clause A6 turns on). Decided exactly like
    // `HAS_INCOME` above: absent fact → reported undecided, never defaulted in either direction.
    if (isIncomeConditionalCell(resolvedGate, directUtilization)) {
      if (hasIncomeInPeriod === undefined || hasIncomeInPeriod === null) {
        incomeFactMissing.push({ ...entry, requiredFact: 'hasIncomeInPeriod' });
      } else if (hasIncomeInPeriod) {
        obligations.push({ ...entry, resolvedGate, unverified: true });
      } else {
        excluded.push({
          ...entry,
          resolvedGate,
          reason: INCOME_EXCLUSION_REASON,
          unverified: true,
        });
      }
      continue;
    }

    obligations.push({ ...entry, resolvedGate, unverified: true });
  }

  return Object.freeze({
    classification,
    registerLocked: false,
    obligations: Object.freeze(obligations),
    excluded: Object.freeze(excluded),
    unrecognisedGate: Object.freeze(unrecognisedGate),
    retiredGate: Object.freeze(retiredGate),
    incomeFactMissing: Object.freeze(incomeFactMissing),
    directUseFactMissing: Object.freeze(directUseFactMissing),
    unverifiedNotes: Object.freeze([CLASSIFICATION_UNVERIFIED_NOTE]),
    bandSettingKeys: CLASSIFICATION_BAND_SETTING_KEYS,
  });
}

/**
 * What a re-classification **gains and loses** — BR-104's point, made visible.
 *
 * `classification.reclassify` returns these two lists so a Nazir sees that moving MEDIUM → LARGE is not a
 * relabelling: it is an endowment acquiring regulatory duties. Computed from the same matrix as everything
 * else, so the diff cannot disagree with the applicable list the screen showed a moment earlier.
 *
 * ⚠ Rows with an unrecognised gate are carried into the result's `unrecognisedGate` (from the `to` side)
 * and appear in neither diff list: a duty nobody can read must not be reported as gained or lost.
 *
 * ⊕ S8-Q4 — a `NOT_CLASSIFIED` side contributes EMPTY lists (its register is locked, nothing is
 * bound), so the delta FROM it reports the new class's full set as `gained` — the consequence a
 * Nazir recording the first classification is authorising, made visible. A delta TO it is total
 * here for the same reason every lookup is, but both the API's input schema and migration 34's
 * `to`-check refuse the transition itself: a determination is never revoked into absence.
 */
export function obligationDelta(args: {
  readonly from: WaqfClassification;
  readonly to: WaqfClassification;
  readonly catalogue: readonly GatedObligation[];
  /**
   * ⊕ E7-completion — passed through to BOTH sides. With the fact supplied, every ledger-decided
   * row (`HAS_INCOME`, and the income-conditional `SMALL_DIRECT` cell) resolves the same way on each
   * side, so a delta involving direct use reports the simplified-statement duty as genuinely gained
   * or lost instead of vanishing into "undecided". Omitting it keeps the old behaviour.
   */
  readonly hasIncomeInPeriod?: boolean | null;
  /**
   * ⊕ S9-4a — the usage axis, passed through to BOTH sides for the same reason and one more: **a
   * reclassification does not change it.** It is a fact about the endowment, not about its size, so
   * supplying it on one side only would attribute a usage-driven gate change to a size change that
   * did not cause it. Omitted/`null` ⇒ the usage-sensitive rows are undecided on both sides and
   * therefore report as `unchanged` rather than as gained or lost, which is the honest answer.
   */
  readonly directUtilization?: boolean | null;
}): {
  readonly from: WaqfClassification;
  readonly to: WaqfClassification;
  readonly gained: readonly ApplicableObligation[];
  readonly lost: readonly ApplicableObligation[];
  readonly unchanged: readonly ApplicableObligation[];
  readonly unrecognisedGate: readonly UnrecognisedGateObligation[];
  readonly unverifiedNotes: readonly string[];
} {
  const before = obligationsForClassification({
    classification: args.from,
    catalogue: args.catalogue,
    hasIncomeInPeriod: args.hasIncomeInPeriod,
    directUtilization: args.directUtilization,
  });
  const after = obligationsForClassification({
    classification: args.to,
    catalogue: args.catalogue,
    hasIncomeInPeriod: args.hasIncomeInPeriod,
    directUtilization: args.directUtilization,
  });

  const boundBefore = new Set(before.obligations.map((entry) => entry.code));
  const boundAfter = new Set(after.obligations.map((entry) => entry.code));

  return Object.freeze({
    from: args.from,
    to: args.to,
    gained: Object.freeze(after.obligations.filter((entry) => !boundBefore.has(entry.code))),
    // Taken from the BEFORE side, so a lost obligation is reported with the gate that used to admit it.
    lost: Object.freeze(before.obligations.filter((entry) => !boundAfter.has(entry.code))),
    unchanged: Object.freeze(after.obligations.filter((entry) => boundBefore.has(entry.code))),
    unrecognisedGate: after.unrecognisedGate,
    unverifiedNotes: Object.freeze([CLASSIFICATION_UNVERIFIED_NOTE]),
  });
}
