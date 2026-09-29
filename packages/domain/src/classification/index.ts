/**
 * `classification/` — BR-104: **classification is a gate, not a label.** **E3.**
 *
 * The sub-barrel and the only door into the module. Entry points:
 * {@link obligationsForClassification} (what binds at a recorded class, what does not, and what could not
 * be read), {@link obligationDelta} (what a re-classification gains and loses), {@link gateAppliesTo}
 * (the single 4 × 4 lookup all of it rests on).
 *
 * ⚠ **The SAR 200M / 50M bands are NOT here and must never arrive.** They live in `Setting`, they are
 * UNVERIFIED against primary Saudi law (binding rule 3), and this module maps a *recorded* classification
 * to gates — it does not compute the band. {@link CLASSIFICATION_BAND_SETTING_KEYS} names the keys so a
 * caller can resolve and display them, with the ⚠ marker, from the one place they live.
 *
 * ⚠ **A row whose `gate` is unrecognised is reported, not excluded** — see
 * {@link obligationsForClassification}. A caller that treats `unrecognisedGate` as empty-by-assumption
 * will drop a regulatory duty silently, which is the failure this bucket exists to make impossible.
 */

export {
  CLASSIFICATION_BAND_SETTING_KEYS,
  CLASSIFICATION_GATES,
  CLASSIFICATION_GATE_MATRIX,
  CLASSIFICATION_UNVERIFIED_NOTE,
  GATE_EXCLUSION_REASON,
  REGISTER_LOCK_REASON,
  WAQF_CLASSIFICATIONS,
  isClassificationGate,
  isIncomeConditionalCell,
  isWaqfClassification,
} from './contract.js';
export type {
  ApplicableObligation,
  ClassificationGate,
  ClassificationObligations,
  ExcludedObligation,
  GateExclusionReason,
  GatedObligation,
  UnrecognisedGateObligation,
  WaqfClassification,
} from './contract.js';

export {
  classesAdmittedBy,
  gateAppliesTo,
  obligationDelta,
  obligationsForClassification,
} from './gating.js';
