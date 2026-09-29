/**
 * `@qmulate/domain/distribution` — the distribution engine (PRD §08, epic E6).
 *
 * ## The public surface, in one place
 *
 * This is the *sub-barrel*, on the same convention as `../dates/index.ts`: it is the only door into
 * the engine. `./engine.ts`'s {@link runDistribution} is the entrypoint; the stage functions below it
 * are exported because each one is separately testable and separately useful to E5/S6 (the ledger
 * can ask "is this cohort payable?" without running a whole distribution), but a caller that only
 * wants a run needs `runDistribution`, `parseDistributionInput` and the vocabulary.
 *
 * ## What a caller must know before using any of it
 *
 * 1. **Money is integer halalas as `bigint`** (`Minor`, branded; 1 SAR = 100n). No JS `number` is
 *    money, a weight, or a rate. `Decimal`↔minor conversion happens only through the boundary
 *    helpers (`toMinorFromDecimalString` / `minorToDecimalString`), which delegate to the tested
 *    money engine.
 * 2. **Corpus (asl / أصل) cannot enter the waterfall.** `revenue` carries receipt-level provenance,
 *    not a bare total: a caller that cannot show the income-vs-capital classification is REFUSED
 *    (`RECEIPT_UNCLASSIFIED`), never trusted. Sale, istibdal (استبدال) and expropriation proceeds are
 *    corpus and move no halala of a distribution (CLAUDE.md binding rule 1 / invariant I-C1).
 * 3. **No regulatory figure has a coded default.** Every `policy` field is required. The caller
 *    resolves each one from a `Setting` — or fails with `SETTING_MISSING` upstream. ⚠ The 3-month
 *    post-FYE window, the KYC refresh interval, the Nazir-fee rate, the rounding method and the
 *    binding-calendar selector are all *unverified — confirm vs primary law*, and the ⚠ marker
 *    travels into `result.unverifiedNotes` (binding rule 3).
 * 4. **The engine never guesses the Shart.** An unrecognised `entitlementOrder`, an unreadable
 *    `continuationStipulation`, an invalid lineage graph, and **every** `JOINT` waqf halt with
 *    `SHART_INCOMPLETE` carrying a {@link SHART_REFUSALS} discriminator in `details.refusal`. It
 *    never falls back to an equal split, never reuses the previous period, and never normalises a
 *    deed's free text.
 * 5. **Entitlement is lineage-based and per capita (ADR-0009).** A beneficiary is entitled because
 *    they descend from the waqif on a line the deed continues — not because their ṭabaqa is the
 *    lowest living one — and all eligible heads split the distributable equally. `ORDERED`
 *    (al-aʿlā fa-l-aʿlā) is preserved as the explicitly stipulated exception. A **joint** waqf, and
 *    any cohort mixing a charitable jiha with a family member **concurrently**, is refused: a waqf is
 *    either خيري or ذري, never both. The `JOINT` enum member nevertheless stays in {@link WAQF_TYPES}
 *    and in `schema.prisma` — the engine refuses the value, it does not narrow the vocabulary, because
 *    the Awqaf Law Art. 4 contradiction is open with counsel.
 * 6. **A ذري deed may name a charity as its ULTIMATE TAKER — مآل الوقف (R7, product owner 2026-08-10).**
 *    The appointment is a **recorded waqf-level clause** ({@link reversionInputSchema}), never inferred:
 *    the taker receives nothing while any descendant of the waqif is living **on a line the deed
 *    continues** (`REVERSION_PENDING_LIVING_BLOODLINE`, temporary) and takes the distributable once
 *    **no continuing line is left**, splitting by deed weight rather than per capita.
 *
 *    ⚠ *"The bloodline is over"* means **no continuing line**, not merely no survivor (R7-d, product
 *    owner 2026-08-11). Under `ZUHUR_ONLY` a living descendant on a broken daughter line does not hold
 *    the reversion; under `ZUHUR_AND_BUTUN` every living descendant does. Descendants on a **continuing**
 *    line who are merely *not entitled* — a zero deed weight, a head waiting behind a living ancestor —
 *    do NOT trigger it: the pool is retained and the run carries
 *    `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, because money that waits is recoverable and money
 *    paid to a charity is not. Neither does a register of unenumerated placeholders
 *    (`REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED`). Invariant `I-R1` asserts at runtime that **a
 *    charity is never paid a halala in the same run as any descendant**.
 * 6. **Purity is absolute.** No I/O, no clock, no randomness: `asOf` and both deadline dates are
 *    parameters, so a run replays byte-for-byte during an audit years later. Hashing the run is the
 *    caller's job — {@link canonicalizeResult} returns the exact bytes to hash, because there is no
 *    crypto in the pure core.
 *
 * ## Two names that must be aliased here, not re-exported bare
 *
 * · **`DeadlineBasis`** — `../dates/deadline.ts` exports a *different* type of the same name (which
 *   calendar unit a window is measured in) and `../index.ts` already re-exports it. This engine's
 *   version says which *instrument* set the due date, so it leaves through
 *   {@link DistributionDeadlineBasis}. A bare `DeadlineBasis` here is a duplicate export on the
 *   package barrel — and, worse if it ever resolved, two unrelated vocabularies under one name.
 * · **`RoundingMethod`** — owned by `../money.ts` and already on the package barrel. `contract.ts`
 *   re-exports it for the benefit of modules inside this folder; it deliberately does not leave here.
 *
 * `./trace.ts`'s `step` / `createTraceBuilder` are also deliberately absent: they are the assembly
 * plumbing `./engine.ts` uses to number a trace, and `step` is far too generic a name to put on a
 * package's public surface. Tests import them from `./trace.js` directly.
 */

/* ── the entrypoint ─────────────────────────────────────────────────────────────────────── */
export { ENGINE_VERSION, runDistribution } from './engine.js';

/* ── the contract: parsing, boundary helpers, and every closed vocabulary ───────────────── */
export {
  AUTHORITY_NOTICE_TYPES,
  BENEFICIARY_KINDS,
  BENEFICIARY_LINES,
  BINDING_CALENDARS,
  CAPITAL_SOURCES,
  CONTINUATION_STIPULATIONS,
  DEADLINE_BASES,
  DISBURSEMENT_SCHEDULES,
  ENTITLEMENT_ORDERS,
  ENTITLEMENT_RULES,
  EXCLUSION_REASON_CODES,
  FEE_BASES,
  GATE_REASON_CODES,
  INVARIANT_IDS,
  LINEAGE_LINKS,
  LINE_STATUSES,
  MAINTENANCE_RULE_KINDS,
  MAX_WEIGHT_DECIMAL_PLACES,
  RECEIPT_CLASSES,
  RESIDENCIES,
  REVERSION_KINDS,
  RUN_FLAGS,
  SHARE_PERCENT_SCALE,
  SHART_REFUSALS,
  TIMING_STATUSES,
  TRACE_STAGES,
  VERIFICATION_STATUSES,
  WAQF_CLASSIFICATIONS,
  WAQF_TYPES,
  assertInputConsistency,
  assertResultShape,
  beneficiaryInputSchema,
  civilDateSchema,
  compareBeneficiaryIds,
  deadlineInputSchema,
  disbursingEntitySchema,
  distributionInputSchema,
  dualDateSchema,
  hijriDateSchema,
  isRunFlag,
  maintenanceRuleSchema,
  minorOf,
  minorSchema,
  minorToDecimalString,
  minorToMoney,
  moneyToMinor,
  nazirFeeSchema,
  nonNegativeMinorSchema,
  parseDistributionInput,
  policyInputSchema,
  ratePercentSchema,
  receiptInputSchema,
  reversionInputSchema,
  revenueInputSchema,
  sharePercentOf,
  stipulatedWeightSchema,
  toMinorFromDecimalString,
} from './contract.js';

export type {
  AuthorityNotice,
  AuthorityNoticeType,
  BeneficiaryInput,
  BeneficiaryKind,
  BeneficiaryLine,
  BindingCalendar,
  CapitalSource,
  ContinuationStipulation,
  DeadlineInput,
  DisbursementSchedule,
  DisbursingEntity,
  /** Aliased on purpose — `../dates` owns the other `DeadlineBasis`. See the header. */
  DistributionDeadlineBasis,
  DistributionInput,
  DistributionInputRaw,
  DistributionLine,
  DistributionResult,
  DualDateInput,
  EntitlementOrder,
  EntitlementRule,
  ExclusionReasonCode,
  FeeBasis,
  GateReasonCode,
  InvariantId,
  LineBasis,
  LineReasonCode,
  LineStatus,
  LineageLink,
  MaintenanceRule,
  MaintenanceRuleKind,
  Minor,
  NazirFee,
  PolicyInput,
  ReceiptClass,
  ReceiptInput,
  Residency,
  ReversionInput,
  ReversionKind,
  RevenueInput,
  RunFlag,
  ShartRefusal,
  Timing,
  TimingStatus,
  Totals,
  TraceEntry,
  TraceStage,
  TraceStep,
  VerificationStatus,
  WaqfClassification,
  WaqfType,
  Waterfall,
} from './contract.js';

/* ── Stage 1 · the waterfall and the corpus guard ───────────────────────────────────────── */
export {
  assertIncomeProvenance,
  computeMaintenanceReserve,
  computeNazirFee,
  computeWaterfall,
} from './waterfall.js';
export type { IncomeProvenance, NazirFeeOutcome, WaterfallOutcome } from './waterfall.js';

/* ── Stage 2 · entitlement ──────────────────────────────────────────────────────────────── */
export {
  assertJihaNotTiered,
  /** R7 · مآل الوقف · narrows the deed's reversion clause; step 2 of `assertSingleWaqfNature`. */
  assertReversionLegible,
  /** ADR-0009 R5 · REPLACES `assertJointLegsPresent`, whose subject (a joint split) cannot exist. */
  assertSingleWaqfNature,
  buildLineage,
  entitlementRuleFor,
  parseContinuationStipulation,
  parseEntitlementOrder,
  parseLineageLink,
  resolveEntitlement,
} from './resolver.js';
export type { EntitlementResolution, LineageIndex, ResolvedBeneficiary } from './resolver.js';

/* ── Stage 3 · payability ───────────────────────────────────────────────────────────────── */
export {
  GATE_PRECEDENCE,
  GATE_REASON_TEXT,
  evaluateGates,
  gateReasonText,
  isCategoryUncaptured,
  isEntityUnlicensed,
  isKycStale,
  isKycUnverified,
} from './gates.js';
export type { GateOutcome } from './gates.js';

/* ── Stage 4 · timing ───────────────────────────────────────────────────────────────────── */
export { deadlineBasisOf, evaluateTiming, resolveBindingDeadline } from './timing.js';
export type { BindingDeadline, TimingOutcome } from './timing.js';

/* ── Stage 5 · the split and line assembly ──────────────────────────────────────────────── */
export { allocateMinor, assembleLines, emptyTotals, entitledCohortWeights } from './allocate.js';
export type { AllocationResult, AssembleArgs, AssembledLines, EntitledCohort } from './allocate.js';

/* ── Stage 6 · the invariants ───────────────────────────────────────────────────────────── */
export {
  assertCorpusSegregation,
  assertDirectUseNullity,
  assertDirectUseTotals,
  assertInvariants,
  assertNoNegatives,
  assertOrderedExclusion,
  /** ADR-0009 I-L1 · the only load-bearing proof that the per-capita rule was applied. */
  assertPerCapitaEquality,
  assertResidualBound,
  /** R7 I-R1 · reversion integrity, incl. "a charity is never paid beside a descendant" (R5 at runtime). */
  assertReversionIntegrity,
  assertSplitConservation,
  assertWaterfallConservation,
} from './invariants.js';
export type { InvariantContext } from './invariants.js';

/* ── the trace: the human view, and the bytes the CALLER hashes ─────────────────────────── */
export { canonicalizeResult, traceText } from './trace.js';
