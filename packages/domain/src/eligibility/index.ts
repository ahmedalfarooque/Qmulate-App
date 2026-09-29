/**
 * `eligibility/` — Nazir and authorized-representative eligibility (BR-109, NFR-09). **E3.**
 *
 * The sub-barrel and the only door into the module, matching `./dates` and `./distribution`. Entry
 * points: {@link resolveEligibility} for one subject, {@link resolveDeedEligibility} for a whole
 * trusteeship deed, {@link assertDeedEligible} to refuse a seat before any write.
 *
 * Three things to know before calling it:
 *
 *  1. **It returns a VERDICT, not a boolean.** §17's E3 exit clause is "blocked **with a clear
 *     reason**", so every criterion is reported with its applicability, the recorded fact, and a stable
 *     machine reason code. The ar/en sentence a human reads is `packages/i18n`'s (E10/E12) — nothing
 *     here is user-facing copy.
 *  2. **`null` is not a pass.** An unassessed binding criterion refuses with `ELIGIBILITY_NOT_ASSESSED`.
 *     "Nobody has checked their residency" must never seat a Nazir.
 *  3. **The two conditional criteria bind only on their context**, which is an argument with no default:
 *     Saudi nationality iff `endowerIsForeign && holdsRealProperty`, Authority licensing iff
 *     `nazirIsLegalPerson`.
 *
 * ⚠ Every criterion is **UNVERIFIED against primary Saudi law** (binding rule 3) and each verdict says
 * so. The KSA-residency block in particular must not be quoted anywhere as settled law.
 */

export {
  CRITERION_APPLICABILITIES,
  CRITERION_AUTHORITY,
  CRITERION_REASON,
  ELIGIBILITY_CRITERIA,
  ELIGIBILITY_REASON_CODES,
  ELIGIBILITY_SUBJECTS,
  ELIGIBILITY_UNVERIFIED_NOTE,
  SURFACED_REPRESENTATIVE_SCOPE,
  eligibilityContextSchema,
  eligibilityFlagsSchema,
  isEligibilityCriterion,
  isEligibilityReasonCode,
  isEligibilitySubject,
} from './contract.js';
export type {
  CriterionApplicability,
  DeedEligibility,
  EligibilityContext,
  EligibilityCriterion,
  EligibilityCriterionOutcome,
  EligibilityFlags,
  EligibilityReasonCode,
  EligibilitySubject,
  EligibilityVerdict,
} from './contract.js';

export {
  applicabilityOf,
  assertDeedEligible,
  resolveDeedEligibility,
  resolveEligibility,
} from './resolve.js';
