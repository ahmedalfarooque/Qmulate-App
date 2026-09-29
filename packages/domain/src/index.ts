/**
 * `@qmulate/domain` — the pure core.
 *
 * ## Purity constraint (locked; do not relax without an ADR)
 * This package **imports nothing internal**. No `@qmulate/*` dependency, ever. It also performs
 * **no I/O**: no database, no network, no filesystem, no `process.env`, no clock reads hidden
 * inside a function (an `asOf` date is always a parameter), no logging. Its only third-party
 * dependencies are `decimal.js` (exact money) and `zod` (input schemas).
 *
 * ### Why
 * 1. **It is the part that must be provably right.** Distribution, the corpus/income guard and
 *    the statutory-deadline clock decide who gets paid what and when a filing is late. Pure,
 *    deterministic functions are exhaustively unit- and property-testable without a database,
 *    a fixture server, or a wall clock — the same inputs always produce the same result, so a
 *    computation can be replayed years later during an audit or a family dispute and defended.
 * 2. **It keeps the dependency graph acyclic.** Everything else (`api`, `database`, `auth`,
 *    `jobs`, the apps) may depend on the domain; the domain depends on none of them, so no
 *    persistence or transport concern can leak into a rule of entitlement.
 * 3. **It keeps confidential data out.** With no I/O, the engines cannot read a real client
 *    record — callers hand in already-scoped values and receive a result plus a trace.
 *
 * Anything needing I/O belongs in `@qmulate/database`, `@qmulate/api`, or `apps/worker`.
 *
 * ## What lives here (by epic)
 * - **E1:** exact money (`./money`) and the domain error vocabulary (`./errors`).
 * - **E2:** the authorization algebra (`./access`), the `Setting` vocabulary (`./settings`),
 *   and Umm-al-Qura Hijri conversion + KSA business-day arithmetic (`./dates`).
 * - **E3:** Nazir / authorized-representative eligibility (`./eligibility`) and BR-104's
 *   classification gating (`./classification`) — **shipped in Sprint 4**. Both are pure predicates over
 *   arguments: the eligibility resolver returns a *verdict* with a machine reason per criterion (§17's
 *   E3 exit clause is "blocked **with a clear reason**"), and the gating resolver maps a **recorded**
 *   classification to the obligations that bind at it. ⚠ Neither computes a regulatory figure — the SAR
 *   200M/50M bands stay in `Setting`, unverified (binding rule 3).
 * - **E6:** the distribution engine (`./distribution`) — **shipped in Sprint 3**. The waterfall
 *   (ṣiyāna → operating → Nazir fee → distributable) with the engine-side corpus guard,
 *   entitlement resolution over generational tiers (ṭabaqāt, ẓuhūr/buṭūn), the payability gates,
 *   the dual-calendar post-FYE deadline, the exact bigint (halala) largest-remainder split, and
 *   runtime assertion of §08's invariants I1–I9 plus the corpus invariant I-C1. Entry point:
 *   `runDistribution`.
 * - **E7:** the compliance/deadline gating predicates.
 *
 * ### Why the E6 engine is a folder with its own sub-barrel
 * Same reason as `./dates`: the stage modules (`waterfall`, `resolver`, `gates`, `timing`,
 * `allocate`, `invariants`, `trace`) are separately testable, and their separation is *itself* a
 * proof — `resolver.ts` and `gates.ts` contain no `Minor` in any signature, so neither stage
 * **can** touch an amount, which is invariant I6 (a payability gate never reallocates a
 * beneficiary's ghallah) enforced by the type system rather than by a runtime check.
 *
 * ### Why the authorization algebra lives in the *domain*
 * `packages/auth` depends on `@qmulate/database`, and `@qmulate/database` depends on
 * `@qmulate/domain` — so `database → auth` would be a cycle, while `database → domain`
 * already exists. The role presets must be readable by the database seed (fixture-subset
 * parity), by `packages/auth` and by `packages/api`; the domain is the only cycle-free home.
 * Purity is unaffected: `./access` is pure data plus total functions over it.
 *
 * ### Hijri conversion is ONE implementation (S2 decision D-4)
 * `./dates` is the single source of truth, via `Intl.DateTimeFormat` with the
 * `islamic-umalqura` calendar. It must reproduce, by construction, the six anchor conversions
 * already frozen in the database — those strings are committed history, and a mismatch would
 * silently rewrite filed dates. `@umalqura/core` is deliberately NOT a dependency (§17's
 * stack line naming it is a recorded deviation): CI runs `--frozen-lockfile`, and a new
 * library cannot rewrite frozen history anyway.
 *
 * Two invariants every engine added here must uphold (CLAUDE.md binding rule 1):
 * corpus (**asl / أصل**) is never distributed, reclassified, or eroded — only income
 * (**ghallah / غلة**) enters the waterfall; and on an unresolvable Shart al-Waqif the engine
 * halts with `SHART_INCOMPLETE` rather than inferring the founder's intent.
 */

/* ── money (E1 + E2 additions) ──────────────────────────────────────────────────────────────
 * NOTE: SAR *formatting* is deliberately absent. `formatSar`/`formatCurrency` live in
 * `@qmulate/i18n` (locale, numeral system and RTL are theirs; `tabular-nums` is CSS in
 * `@qmulate/ui`). A rival formatter here would be a second display path that could disagree
 * with the first on a legal statement — §17's "SAR formatting in packages/domain" bullet is
 * satisfied by i18n. */
export {
  MINOR_UNITS_PER_MAJOR,
  MONEY_SCALE,
  ROUNDING_METHODS,
  ZERO,
  abs,
  add,
  allocate,
  compare,
  divide,
  equals,
  fromMinor,
  isNegative,
  isPositive,
  isRoundingMethod,
  isZero,
  largestRemainderAllocate,
  max,
  min,
  money,
  moneyRound,
  mul,
  negate,
  percentOf,
  sub,
  sum,
  toDbString,
  toMinor,
} from './money.js';
export type { AllocationWeight, Money, MoneyInput, RoundingMethod } from './money.js';

export {
  DOMAIN_ERROR_CODES,
  DomainError,
  corpusNotDistributable,
  hasDomainCode,
  isDomainError,
  settingMissing,
  shartIncomplete,
} from './errors.js';
/* E3 adds three codes — `NAZIR_INELIGIBLE`, `DEED_TERM_WRITE_ONCE`, `RESERVED_MATTER_REQUIRED` — and
 * each one obliges `packages/i18n` to carry `errors.domain.<CODE>` in BOTH locales (the i18n suite
 * parses `errors.ts` as text and asserts it). Arabic is authoritative, NFR-01. */
export type {
  DomainErrorCode,
  DomainErrorDetails,
  DomainErrorOptions,
  SerializedDomainError,
} from './errors.js';

/* ── the authorization algebra (E2) ─────────────────────────────────────────────────────────
 * `APPROVAL_AUTHORITY_ROLES` is the one place the answer to "who may approve" is written
 * down: exactly `{ nazir }` (S2 decisions D-1, D-2). A test asserts it equals the set derived
 * by scanning ROLE_PRESETS for approve/sign verbs, so the two can never disagree. */
export {
  APPROVAL_AUTHORITY_ROLES,
  APPROVAL_VERBS,
  DB_ROLE_KEY_EXCEPTIONS,
  GRID_ROW_TO_MODULE,
  MODULES_WITHOUT_GRID_ROW,
  NON_DELEGABLE_VERBS,
  PERMISSION_MODULES,
  PERMISSION_RESOURCES,
  PERMISSION_VERBS,
  ROLE_KEYS,
  ROLE_PRESETS,
  assertDelegatableScope,
  assertGrantPermissionsWithinPreset,
  assertPermissionString,
  can,
  expandRolePreset,
  hasPermission,
  isApprovalAuthorityRole,
  isApprovalPermission,
  isApprovalVerb,
  isPermissionString,
  isRoleKey,
  narrowPermissions,
  parsePermission,
  resolveGrantPermissions,
  roleKeyFromDbRole,
} from './access.js';
export type {
  ApprovalAuthorityRole,
  ApprovalVerb,
  ParsedPermission,
  PermissionModule,
  PermissionString,
  PermissionVerb,
  RoleKey,
} from './access.js';

/* ── the `Setting` vocabulary (E2) ──────────────────────────────────────────────────────────
 * Binding rule 3: every regulatory figure is configuration, carries the ⚠ unverified marker
 * inside its stored value, and an engine refuses rather than substituting a default. */
export {
  LEGACY_SETTING_KEYS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  SETTING_SCOPE_ORDER,
  UNVERIFIED_FIGURE_KEYS,
  UNVERIFIED_NOTE,
  WEEKDAY_CODES,
  isSettingKey,
  isWeekdayCode,
  parseSetting,
  pickMostSpecific,
  settingEnvelopeSchema,
  settingScopeOrder,
} from './settings.js';
export type {
  ScopedSettingCandidate,
  SettingEnvelope,
  SettingKey,
  SettingScopeTier,
  SettingValue,
} from './settings.js';

/* ── dates: Umm al-Qura conversion + KSA business days (E2) ─────────────────────────────────
 * Re-exported from `./dates/index.ts`, which is the dates engine's own sub-barrel and the only
 * door into it — the `@internal` helpers in `./dates/civil-date.ts` et al. (day-number
 * arithmetic, `weekdayCodeOf`, the indexed `WEEKDAY_CODES`) are shared implementation detail
 * and are deliberately not surfaced.
 *
 * `WeekdayCode` comes from HERE, not from `./settings.js`: the calendar owns the weekday
 * vocabulary, and the `calendar.workweek` Setting is merely expressed in it. `settings.ts`
 * holds the same seven codes as a `const` tuple because `z.enum()` needs runtime literals, and
 * a test compares the two lists in order so they cannot disagree about which day is Friday. */
export {
  HIJRI_SUPPORTED_RANGE,
  KSA_DEFAULT_WORKWEEK,
  addBusinessDays,
  addCalendarDays,
  addCalendarMonths,
  addCalendarYears,
  buildHolidayCalendar,
  civilDate,
  civilDateFromInstant,
  civilDateFromParts,
  civilDateFromUtcDate,
  civilDateToUtcDate,
  compareCivilDates,
  computeDeadline,
  countBusinessDays,
  differenceInCalendarDays,
  dual,
  formatHijriDate,
  fromHijri,
  fromHijriParts,
  hijriMonthLength,
  holidayOn,
  isBusinessDay,
  isValidHijriDate,
  isWeekend,
  nextBusinessDay,
  parseHijriDate,
  previousBusinessDay,
  rollToBusinessDay,
  toHijri,
  toHijriParts,
  toHijriSnapshot,
  weekdayOf,
} from './dates/index.js';
export type {
  CivilDate,
  ComputeDeadlineInput,
  ComputedDeadline,
  DeadlineBasis,
  DeadlineWindow,
  DualDate,
  GregorianRecurringHolidayRule,
  HijriDate,
  HijriParts,
  HijriRecurringHolidayRule,
  HolidayCalendar,
  HolidayCalendarInput,
  HolidayKind,
  HolidayRule,
  MonthAnchor,
  ObservedHoliday,
  ResolvedHoliday,
  RollConvention,
  Weekday,
  WeekdayCode,
  WorkingDayOverride,
} from './dates/index.js';

/* ── Nazir / authorized-representative eligibility (E3) ─────────────────────────────────────
 * BR-109 / NFR-09. Re-exported from `./eligibility/index.ts`, the module's own sub-barrel and the
 * only door into it. Three things bite: it returns a VERDICT and never a bare boolean (the exit
 * clause is "blocked WITH A CLEAR REASON"); `null` on a binding criterion is a REFUSAL
 * (`ELIGIBILITY_NOT_ASSESSED`) and never a pass; and the two conditional criteria bind only on their
 * `EligibilityContext`, which has no defaults. ⚠ Every criterion is unverified against primary Saudi
 * law and the verdict says so — the KSA-residency block especially. */
export {
  CRITERION_APPLICABILITIES,
  CRITERION_AUTHORITY,
  CRITERION_REASON,
  ELIGIBILITY_CRITERIA,
  ELIGIBILITY_REASON_CODES,
  ELIGIBILITY_SUBJECTS,
  ELIGIBILITY_UNVERIFIED_NOTE,
  SURFACED_REPRESENTATIVE_SCOPE,
  applicabilityOf,
  assertDeedEligible,
  eligibilityContextSchema,
  eligibilityFlagsSchema,
  isEligibilityCriterion,
  isEligibilityReasonCode,
  isEligibilitySubject,
  resolveDeedEligibility,
  resolveEligibility,
} from './eligibility/index.js';
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
} from './eligibility/index.js';

/* ── classification gating (E3) ─────────────────────────────────────────────────────────────
 * BR-104: classification is a GATE, not a label. Re-exported from `./classification/index.ts`.
 *
 * ⚠ The SAR 200M / 50M bands are NOT here and must never arrive: they live in `Setting`, they are
 * UNVERIFIED against primary Saudi law, and this module maps a RECORDED classification to gates.
 * ⚠ A catalogue row whose `gate` is unrecognised lands in `unrecognisedGate` and the CALLER MUST
 * REFUSE — it is neither applicable nor excluded, because a duty must not vanish from a register.
 *
 * `WaqfClassification` is deliberately NOT re-exported from here: `./distribution` already owns that
 * name on this surface and the two are the same type, imported rather than restated. `WAQF_CLASSIFICATIONS`
 * likewise. */
export {
  CLASSIFICATION_BAND_SETTING_KEYS,
  CLASSIFICATION_GATES,
  CLASSIFICATION_GATE_MATRIX,
  CLASSIFICATION_UNVERIFIED_NOTE,
  GATE_EXCLUSION_REASON,
  REGISTER_LOCK_REASON,
  classesAdmittedBy,
  gateAppliesTo,
  isClassificationGate,
  isWaqfClassification,
  obligationDelta,
  obligationsForClassification,
} from './classification/index.js';
export type {
  ApplicableObligation,
  ClassificationGate,
  ClassificationObligations,
  ExcludedObligation,
  GateExclusionReason,
  GatedObligation,
  UnrecognisedGateObligation,
} from './classification/index.js';

/* ── the distribution engine (E6) ───────────────────────────────────────────────────────────
 * Re-exported from `./distribution/index.ts`, the engine's own sub-barrel and the only door into
 * it. Entry point: `runDistribution(input) -> DistributionResult` — pure, deterministic, halala-
 * exact, with the corpus guard and §08's invariants asserted before anything is returned.
 *
 * Read `./distribution/index.ts`'s header before calling it. The five things that bite:
 * money is `bigint` halalas (`Minor`), never a JS number; `revenue` carries receipt-level
 * income-vs-capital provenance and a caller without it is REFUSED (corpus / asl / أصل never
 * enters the waterfall); every `policy` figure is required with no coded default (⚠ each is
 * unverified until confirmed vs primary Saudi law and the marker travels in
 * `result.unverifiedNotes`); an unreadable Shart halts with `SHART_INCOMPLETE`; and hashing the
 * run is the CALLER's job — `canonicalizeResult` yields the bytes, because the pure core has no
 * crypto.
 *
 * TWO NAMES ARE DELIBERATELY NOT HERE, and this list is explicit rather than `export *` so that
 * stays visible at review time (an `export *` colliding with an explicit export above would be
 * silently shadowed, not a compile error):
 *   · `DeadlineBasis` — `./dates` already owns that name for a DIFFERENT concept (which calendar
 *     unit a window is measured in, vs. which instrument set the due date). The engine's version
 *     leaves as `DistributionDeadlineBasis`.
 *   · `RoundingMethod` — owned by `./money.ts` and exported above. `contract.ts` re-exports it for
 *     modules inside the distribution folder only.
 * Also absent: `./distribution/trace.ts`'s `step` / `createTraceBuilder`, which are the trace
 * plumbing the engine uses internally — `step` is far too generic a name for this surface. */
export {
  AUTHORITY_NOTICE_TYPES,
  BENEFICIARY_KINDS,
  BENEFICIARY_LINES,
  BINDING_CALENDARS,
  CAPITAL_SOURCES,
  DEADLINE_BASES,
  DISBURSEMENT_SCHEDULES,
  ENGINE_VERSION,
  ENTITLEMENT_ORDERS,
  ENTITLEMENT_RULES,
  EXCLUSION_REASON_CODES,
  FEE_BASES,
  GATE_PRECEDENCE,
  GATE_REASON_CODES,
  GATE_REASON_TEXT,
  INVARIANT_IDS,
  LINE_STATUSES,
  MAINTENANCE_RULE_KINDS,
  MAX_WEIGHT_DECIMAL_PLACES,
  RECEIPT_CLASSES,
  RESIDENCIES,
  RUN_FLAGS,
  SHARE_PERCENT_SCALE,
  TIMING_STATUSES,
  TRACE_STAGES,
  VERIFICATION_STATUSES,
  WAQF_CLASSIFICATIONS,
  WAQF_TYPES,
  allocateMinor,
  assembleLines,
  assertCorpusSegregation,
  assertDirectUseNullity,
  assertDirectUseTotals,
  assertInputConsistency,
  assertInvariants,
  assertIncomeProvenance,
  assertNoNegatives,
  assertOrderedExclusion,
  assertPerCapitaEquality,
  assertResidualBound,
  assertResultShape,
  assertSingleWaqfNature,
  assertSplitConservation,
  assertWaterfallConservation,
  beneficiaryInputSchema,
  canonicalizeResult,
  civilDateSchema,
  compareBeneficiaryIds,
  computeMaintenanceReserve,
  computeNazirFee,
  computeWaterfall,
  deadlineBasisOf,
  deadlineInputSchema,
  disbursingEntitySchema,
  distributionInputSchema,
  dualDateSchema,
  emptyTotals,
  entitledCohortWeights,
  entitlementRuleFor,
  evaluateGates,
  evaluateTiming,
  gateReasonText,
  hijriDateSchema,
  isCategoryUncaptured,
  isEntityUnlicensed,
  isKycStale,
  isKycUnverified,
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
  parseEntitlementOrder,
  policyInputSchema,
  ratePercentSchema,
  receiptInputSchema,
  resolveBindingDeadline,
  resolveEntitlement,
  revenueInputSchema,
  runDistribution,
  sharePercentOf,
  stipulatedWeightSchema,
  toMinorFromDecimalString,
  traceText,
} from './distribution/index.js';
export type {
  AllocationResult,
  AssembleArgs,
  AssembledLines,
  AuthorityNotice,
  AuthorityNoticeType,
  BeneficiaryInput,
  BeneficiaryKind,
  BeneficiaryLine,
  BindingCalendar,
  BindingDeadline,
  CapitalSource,
  DeadlineInput,
  DisbursementSchedule,
  DisbursingEntity,
  DistributionDeadlineBasis,
  DistributionInput,
  DistributionInputRaw,
  DistributionLine,
  DistributionResult,
  DualDateInput,
  EntitledCohort,
  EntitlementOrder,
  EntitlementResolution,
  EntitlementRule,
  ExclusionReasonCode,
  FeeBasis,
  GateOutcome,
  GateReasonCode,
  IncomeProvenance,
  InvariantContext,
  InvariantId,
  LineBasis,
  LineReasonCode,
  LineStatus,
  MaintenanceRule,
  MaintenanceRuleKind,
  Minor,
  NazirFee,
  NazirFeeOutcome,
  PolicyInput,
  ReceiptClass,
  ReceiptInput,
  Residency,
  ResolvedBeneficiary,
  RevenueInput,
  RunFlag,
  Timing,
  TimingOutcome,
  TimingStatus,
  Totals,
  TraceEntry,
  TraceStage,
  TraceStep,
  VerificationStatus,
  WaqfClassification,
  WaqfType,
  Waterfall,
  WaterfallOutcome,
} from './distribution/index.js';

/* ── compliance obligation library (E7) ────────────────────────────────────────────────────
 * §09 Engine A's TEMPLATE LIBRARY: the 37 regulatory obligations a Nazir owes, each carrying the
 * gate that decides which endowment classes it binds. Re-exported from `./compliance/index.ts`.
 *
 * ⚠ It is the LIBRARY, not the register. *(This note read "not yet in the database — seven rows
 * are gated `has_income` or `exclude_direct` and `enum ClassificationGate` has neither" until S8's
 * stage 9/migration 30 made both halves false: the gates exist and the 36 storable rows are
 * seeded.)* GATING is `./classification`'s job; per-endowment TASK INSTANTIATION is
 * `./compliance/instantiation.ts`'s — the E7-completion planner exported below.
 *
 * ⚠ `libraryOpenQuestions()` is not decoration: TWELVE of the 37 rows carry an open question, and
 * `FRAMEWORK_BULLETS_WITHOUT_TEMPLATE` records TEN framework duties the library tracks with nothing
 * at all — including the one binding rule 1's `SHART_INCOMPLETE` refusal hands off to. A caller that
 * treats this library as complete is wrong in a way the data will tell it about.
 * ─────────────────────────────────────────────────────────────────────────────────────────── */
export {
  COMPLIANCE_PHASES,
  COMPLIANCE_RECURRENCES,
  COMPLIANCE_SECTIONS,
  COMPLIANCE_UNVERIFIED_NOTE,
  CROSS_SUBSECTION_COVERAGE,
  FRAMEWORK_BULLETS_WITHOUT_TEMPLATE,
  OBLIGATION_LIBRARY,
  OBLIGATION_LIBRARY_VERSION,
  OBLIGATION_TEMPLATE_SCHEMA_DELTA,
  SOURCE_SILENT_FIELDS,
  UNRESOLVED_DEADLINE_BINDINGS,
  UNRESOLVED_RECURRENCE_SUBJECTS,
  UNSOURCED_ARABIC_SUBJECTS,
  isComplianceRecurrence,
  isComplianceSection,
  libraryOpenQuestions,
  obligationTemplate,
  templatesInSection,
  // ⊕ E7-completion — the per-endowment task-instantiation planner (§09 Engine A, second half).
  EVENT_TEMPLATE_CODES_PER_SPEC,
  INSTANTIATION_REFUSALS,
  OPEN_TASK_STATUSES,
  TASK_INSTANTIATION_REASONS,
  isOpenTaskStatus,
  planRegisterInstantiation,
  // ⊕ S10-2b — the return to NOT_CLASSIFIED (owner rulings 2026-08-25 gate / 2026-08-27
  // disposition). A SEPARATE planner, not an occasion: see instantiation.ts §5.
  RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON,
  planReturnToNotClassified,
} from './compliance/index.js';
export type {
  CompliancePhase,
  ComplianceRecurrence,
  ComplianceSection,
  FrameworkBulletRef,
  ObligationTemplate,
  // ⊕ E7-completion — instantiation planner types.
  ExistingTaskRef,
  InstantiableTemplateFacts,
  InstantiationOccasion,
  InstantiationRefusal,
  PlannedRetirement,
  PlannedTask,
  RegisterInstantiationArgs,
  RegisterInstantiationPlan,
  ReturnToNotClassifiedPlan,
  TaskInstantiationReason,
} from './compliance/index.js';

/* ── deadline engine (E8/S9 — §09 Engine B's pure layer) ───────────────────────────────────
 * The nine-rule vocabulary + rule-shaped computation (composing `./dates`'s calculator — every
 * window is a `Setting` envelope the caller resolved, refused when absent, ⚠-marked in the
 * result), and the DERIVED deadline state + escalation arithmetic (`today` is a parameter,
 * never a clock read; state is never stored as truth). Re-exported from `./deadlines/index.ts`.
 *
 * ⚠ Two catalogue bindings are refused as NOT CLOCKS, per §09's own text: `RETENTION_10Y` (a
 * deletion floor the retention policy enforces) and `AML_IMMEDIATE` (a same-day event SLA — and
 * a computed AML date in the general deadline plane would itself be a G-6 leak).
 * ─────────────────────────────────────────────────────────────────────────────────────────── */
export {
  ANCHOR_DECLARATIONS,
  ANCHOR_DERIVED_RULE_KEYS,
  ANCHOR_OWNER_QUEUE_ITEMS,
  ANCHOR_ROUTED_RULE_KEYS,
  ANCHOR_CHAIN_REFUSALS,
  ANCHOR_ROUTING_REFUSALS,
  COALESCE_IDENTITY_KEY,
  COALESCE_REFUSALS,
  DEADLINE_RULE_KEYS,
  DEADLINE_RULES,
  BOARD_CAUSES,
  BOARD_STATES,
  HEALTHY_BOARD_CAUSES,
  deriveBoardState,
  isLifecycleStatus,
  DEADLINE_STATUSES,
  ESCALATION_LEVELS,
  ESCALATION_LEVEL_DB_VALUE,
  ESCALATION_ROLE_BY_LEVEL,
  EVALUATOR_REFUSALS,
  FISCAL_YEAR_END_READING,
  MIRROR_ABSTENTIONS,
  TASK_STATUSES_FOR_MIRROR,
  NON_CLOCK_REFUSALS,
  UPDATE_OBLIGATION_TEMPLATE_CODE,
  WINDOW_SNAPSHOT_KEYS,
  anchorDeclarationFor,
  anchorProvenanceOf,
  coalesceUpdateObligation,
  computeRuleDeadline,
  deriveAnchor,
  deriveDeadlineState,
  deriveEscalationLevel,
  escalationIdempotencyKey,
  isDeadlineRuleKey,
  ladderFromTuple,
  mirrorTaskStatus,
  planDeadlineEvaluation,
  preAlertsFiringOn,
  reminderIdempotencyKey,
  resolveFiscalYearEndAnchor,
  selectAnchorChainHead,
  selectEscalationLadder,
  windowSnapshotOf,
} from './deadlines/index.js';
export type {
  AnchorCandidate,
  AnchorChainCandidate,
  AnchorChainRefusal,
  AnchorDeclaration,
  AnchorProvenance,
  AnchorRouting,
  AnchorRoutingRefusal,
  AnchorSource,
  AnchorSubject,
  CoalesceCause,
  CoalesceDecision,
  CoalesceInput,
  CoalesceRefusal,
  ComputeRuleDeadlineInput,
  ComputedRuleDeadline,
  DeadlineEvaluationPlan,
  DeadlinePlanEntry,
  DeadlineRuleDescriptor,
  DeadlineRuleKey,
  DeadlineRuleKind,
  BoardCause,
  BoardState,
  BoardStateInput,
  DerivedBoardState,
  DeadlineStateInput,
  DeadlineStatus,
  DerivedAnchor,
  DerivedDeadlineState,
  EscalationLadder,
  EscalationLevel,
  EvaluatedDeadlineFacts,
  EvaluatorConfig,
  EvaluatorRefusal,
  LadderPair,
  MirrorAbstention,
  MirrorTaskStatus,
  NonClockRefusal,
  OpenUpdateObligation,
  RuleSettingValues,
  RuleWindowSource,
  StatusMirror,
  UnfiledChange,
} from './deadlines/index.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// S12-2 · the BR-1102 reserved-matter chain and BR-1103 RACI routing — pure vocabulary and reading.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  RACI_PARTIES,
  RACI_ROLES_BY_PARTY,
  RACI_SIGN_ROUTING,
  RACI_STEP_ROUTING,
  RESERVED_MATTER_CHAIN_STEPS,
  firstMissingReservedMatterChainStep,
  missingReservedMatterChainSteps,
  reservedMatterChainState,
  routeReservedMatter,
} from './reserved-matter/index.js';
export type {
  ChainStepState,
  RaciParty,
  ReservedMatterChainRow,
  ReservedMatterChainState,
  ReservedMatterChainStep,
  ReservedMatterRoute,
} from './reserved-matter/index.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// S12-3 · the three sequenced onboarding gates (BR-1101) — order, what Gate 02 blocks, prerequisites.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  GATED_ACTIVITIES,
  GATE_BLOCKING,
  GATE_PREREQUISITE_CODES,
  ONBOARDING_GATES,
  OPERATING_MODEL_GATE_CHECKLIST,
  clearOrderRefusal,
  downstreamBlock,
  gateRank,
  isGateCleared,
  nextGate,
  priorGate,
  reopenOrderRefusal,
  unattestedChecklistItems,
  unmetGatePrerequisites,
} from './onboarding/index.js';
export type {
  DownstreamBlock,
  GateOrderRefusal,
  GatePrerequisiteCode,
  GatePrerequisiteFacts,
  GateRow,
  GatedActivity,
  OnboardingGate,
  OnboardingGateStatus,
} from './onboarding/index.js';
