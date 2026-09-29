/**
 * `compliance/` — E7's obligation TEMPLATE LIBRARY (§09 Engine A). **S8.**
 *
 * The sub-barrel and the only door into the module. What lives here is the *library* — the 37
 * regulatory obligations a Nazir owes, each carrying the gate that decides which endowment classes it
 * binds. What does NOT live here:
 *
 *  · **gating** — that is `../classification`, which already consumes exactly this shape.
 *    `obligationsForClassification({ classification, catalogue: OBLIGATION_LIBRARY })` is the whole
 *    of "what does this endowment owe". *(This line read "instantiation and gating" until the
 *    E7-completion stage: instantiation now lives HERE, in `instantiation.ts` — the planner that
 *    turns a partition into task rows to create/retire. Gating stays where it was.)*
 *  · **deadlines** — Engine B is E8/S9. A template names a `deadlineRuleKey`; the WINDOW lives in
 *    `Setting` and no number appears in this module. Seven of the 37 bindings currently resolve to
 *    nothing and say so on the row.
 *  · **any Arabic this repository wrote.** `titleAr` is a byte-for-byte quote from
 *    `docs/domain/unified-framework.md`, verified character by character on every test run. One row
 *    carries `null` because the framework does not restate its obligation at all.
 *
 * ⚠ **Read {@link libraryOpenQuestions} before treating this library as finished.** Twelve of the 37
 * rows carry an open question — three cadences the spec cannot express as a single value, seven
 * deadline bindings that resolve to nothing, and two rows whose Arabic is absent or does not cover
 * the English claim. They are carried as DATA, not as comments, precisely so a caller cannot mistake
 * the library for complete.
 */

export {
  AML_RESTRICTED_TEMPLATE_CODES,
  COMPLIANCE_PHASES,
  COMPLIANCE_RECURRENCES,
  COMPLIANCE_SECTIONS,
  COMPLIANCE_UNVERIFIED_NOTE,
  CROSS_SUBSECTION_COVERAGE,
  FRAMEWORK_BULLETS_WITHOUT_TEMPLATE,
  OBLIGATION_TEMPLATE_SCHEMA_DELTA,
  SOURCE_SILENT_FIELDS,
  UNRESOLVED_DEADLINE_BINDINGS,
  UNRESOLVED_RECURRENCE_SUBJECTS,
  UNSOURCED_ARABIC_SUBJECTS,
  isComplianceRecurrence,
  isComplianceSection,
  questionReason,
  templateConfidentiality,
} from './contract.js';

export type {
  CompliancePhase,
  ComplianceRecurrence,
  ComplianceSection,
  FrameworkBulletRef,
  ObligationTemplate,
} from './contract.js';

export {
  OBLIGATION_LIBRARY,
  OBLIGATION_LIBRARY_VERSION,
  REGISTER_INSTANTIATION_REASONS,
  EVENT_TRIGGER_REASON,
  isRegisterInstantiationReason,
  type RegisterInstantiationReason,
  assertCompartmentedCodesResolve,
  libraryOpenQuestions,
  obligationTemplate,
  storableTemplates,
  templatesInSection,
  templatesWithheldFromRegister,
} from './catalogue.js';

export {
  EVENT_TEMPLATE_CODES_PER_SPEC,
  INSTANTIATION_REFUSALS,
  OPEN_TASK_STATUSES,
  TASK_INSTANTIATION_REASONS,
  RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON,
  isOpenTaskStatus,
  planRegisterInstantiation,
  planReturnToNotClassified,
} from './instantiation.js';
export type {
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
} from './instantiation.js';

export {
  ABSENT_OUTBOUND_PATHS,
  AUDIT_CLASSIFICATIONS,
  CONFIDENTIALITY_CLASSES,
  DISPATCH_REFUSALS,
  OUTBOUND_CHANNELS,
  isOutboundChannel,
  mayDispatch,
} from './disclosure.js';
export type {
  AuditClassificationClass,
  ConfidentialityClass,
  DispatchRefusal,
  DispatchVerdict,
  OutboundChannel,
} from './disclosure.js';
