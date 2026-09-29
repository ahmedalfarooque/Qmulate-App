/**
 * `@qmulate/api` — the tRPC v11 server surface and the RBAC procedure ladder.
 *
 * Dependency direction (§17): `apps → api → {auth, domain, database, storage, jobs, i18n} → config`.
 * Nothing in `packages/*` may import this package back.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY *NOT* EXPORTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · **`createContextForSession`** — the test seam that builds a request context around an
 *   already-resolved session, bypassing `evaluateAuthGate`. It is reachable only from inside this
 *   package (the `exports` map publishes `.`, `./trpc`, `./root`, `./errors`, `./permissions` and
 *   nothing else), and `test/procedure-ladder.test.ts` scans THIS FILE to prove it is absent —
 *   because a one-line barrel edit would turn a test seam into a session-forgery door.
 * · **`makeSystemContext` / `SYSTEM_CONTEXT` / any `bypass`** — nothing in this package produces a
 *   bypassed context, and re-exporting the database package's system helpers from the API surface
 *   would put the force-filter's off switch one import away from a route handler.
 * · **A third procedure-ladder spelling.** §17's `endowmentScopedProcedure / makerProcedure /
 *   checkerProcedure / signerProcedure` and §10 §7.2's `waqfScoped / requireDistinctApprover /
 *   requireAmlMember` both ship, as aliases of ONE implementation. The invented
 *   `protectedProcedure / scopedProcedure / approvalProcedure` set that Sprint 1's comment promised
 *   is deleted, not implemented.
 */

/* ── the router ────────────────────────────────────────────────────────────────────────────── */
export { appRouter } from './root.js';
export type { AppRouter } from './root.js';

/* ── the distribution run lifecycle (E6/S7) ─────────────────────────────────────────────────
 *
 * ONE import for "the run's router and the pure boundary it is built on", the same shape
 * `src/settings.ts` uses for the Setting resolver and its router. `router-introspection.test.ts`
 * de-duplicates discovered routers BY IDENTITY, so re-exporting `distributionRouter` here does not
 * demand a second mount.
 *
 * ⚠ WHAT IS EXPORTED IS THE MACHINE VOCABULARY, NOT COPY. `resolveRefusal` names a caught refusal
 * (its `message` is developer-facing English and no surface renders it); `MAPPER_REFUSALS` and
 * `MAPPING_DIAGNOSTICS` are the two vocabularies S7-5 owes ar/en labels for, and they are exported so
 * that a parity test can enumerate them from the package rather than restate them.
 *
 * approval's `subjectId` to the distribution row's own `id`, so the router binds `subjectId: run.id`;
 * the deterministic-id design is the other branch of a contradiction recorded in
 * `src/distribution/subject.ts`'s header, and it is left reachable rather than deleted so the
 * unresolved seam stays visible.
 */
export { distributionRouter } from './routers/distribution.js';
export {
  DISTRIBUTION_RUN_APPROVAL_TYPE,
  DISTRIBUTION_RUN_ARTIFACT_KIND,
} from './distribution/subject.js';
export {
  MAPPER_REFUSALS,
  MAPPING_DIAGNOSTICS,
  isMapperRefusal,
  isShartRefusal,
  resolveRefusal,
} from './distribution/refusal.js';
export type {
  MapperRefusal,
  MappingDiagnostic,
  MappingDiagnosticCode,
  MappingDiagnosticSeverity,
  RefusalSource,
  ResolvedRefusal,
} from './distribution/refusal.js';
export {
  buildDistributionInput,
  excludeReversedPairs,
  ledgerWindowWhere,
  periodWindow,
  readShartForRun,
} from './distribution/input.js';
export type {
  BeneficiaryRunRow,
  BuildDistributionInputArgs,
  DistributionMapping,
  DistributionRunSettings,
  LedgerRunRow,
  PeriodWindow,
  ShartRunProjection,
  WaqfRunRow,
} from './distribution/input.js';

/* ── the request context ───────────────────────────────────────────────────────────────────── */
export {
  GrantIneligibleError,
  NOT_IMPLEMENTED_ELIGIBILITY_CHECK,
  activateGrant,
  activeGrantWhere,
  activeMembershipWhere,
  createContext,
  createSettingReader,
  resolveGrants,
  resolveTotpAssertedAt,
  sessionFromGate,
  toActorContext,
} from './context.js';
export type {
  ActorContextSource,
  AuditActor,
  CreateContextOptions,
  EligibilityCheck,
  EligibilityFailure,
  EligibilityResult,
  GrantActivationCandidate,
  GrantQueryClient,
  RequestContext,
  RequestLocale,
  ResolvedGrant,
  SessionContext,
  SettingReader,
  TrpcContext,
} from './context.js';

/* ── the ladder ────────────────────────────────────────────────────────────────────────────── */
export {
  amlProcedure,
  approvalTargetInput,
  authedProcedure,
  checkerProcedure,
  createCallerFactory,
  endowmentScopedProcedure,
  makerProcedure,
  mergeRouters,
  middleware,
  publicProcedure,
  requireAmlMember,
  requireDistinctApprover,
  router,
  signerProcedure,
  waqfScoped,
  waqfScopedInput,
} from './trpc.js';
export type { ApprovalTarget, WaqfScopedInput } from './trpc.js';

/* ── the guard DECISIONS, exported for later epics' routers and for direct assertion in tests ─
 *
 * Each is a plain function, separable from tRPC: the wiring into tagged middlewares lives in
 * `src/trpc.ts` (see the note there on why). So every refusal in this ladder can be asserted with no
 * tRPC caller and, for the pure ones, no database.
 */
export { assertAuthed } from './middleware/authed.js';
export type { AuthedContext } from './middleware/authed.js';

export { auditScopeRefusal, requireWaqfIdInput, resolveScope } from './middleware/scope.js';
export type { ScopedContext } from './middleware/scope.js';

export {
  approvalFingerprint,
  approvalFingerprintMatches,
  assertApprovalPermission,
  assertDistinctApprover,
  auditApprovalRefusal,
  evaluateStepUp,
  stepUpRefusalFor,
  selfCheckCarveOutApplies,
  permissionIsWriteVerb,
  readStepUpWindowSeconds,
  requireApprovalRequestIdInput,
  resolveApprover,
} from './middleware/segregation.js';
export type { ApprovalRow, ApproverContext, StepUpRefusal } from './middleware/segregation.js';

export { amlCompartmentWaqfIds, assertAmlMember, isAmlMember } from './middleware/aml.js';

export {
  installApiAuditing,
  isApiAuditingInstalled,
  recordProcedureDenial,
} from './middleware/audit.js';
export type { ProcedureDenial } from './middleware/audit.js';

/* ── errors ────────────────────────────────────────────────────────────────────────────────── */
export {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  ApiError,
  DATABASE_ERROR_CODES_ARE_SERVER_BUGS,
  DATABASE_ERROR_CODE_TO_API,
  DOMAIN_ERROR_CODE_TO_API,
  apiErrorToTRPCError,
  isApiError,
  noGrant,
  permissionDenied,
  segregationOfDuties,
  toTRPCError,
} from './errors.js';
export type { ApiErrorCode, ApiErrorDetails } from './errors.js';

/* ── the permission algebra, re-exported from `@qmulate/domain` (never re-implemented) ─────── */
export {
  APPROVAL_AUTHORITY_ROLES,
  APPROVAL_VERBS,
  GUARD_KINDS,
  GUARD_TAG_PROPERTY,
  PERMISSION_MODULES,
  PERMISSION_RESOURCES,
  PERMISSION_VERBS,
  ROLE_KEYS,
  ROLE_PRESETS,
  TOTP_STEP_UP_FRESHNESS_SETTING_KEY,
  assertProcedurePermission,
  assertStepUpPolicyAgrees,
  effectivePermissions,
  hasPermissionInGrant,
  isApprovalPermission,
  isApprovalVerb,
  isPermissionString,
  isRoleKey,
  parsePermission,
  permissionVerb,
  readGuardTag,
  requiresTotpStepUp,
  roleKeyFromDbRole,
  tagGuard,
} from './permissions.js';
export type {
  GuardKind,
  GuardTag,
  ParsedPermission,
  PermissionString,
  PermissionVerb,
  RoleKey,
} from './permissions.js';

/* ── the compliance board's KPI composition (E10 · S11-2b) ────────────────────────────────────
 * Pure, unit-tested here, rendered by `apps/web` without logic of its own. See the module header. */
export { KPI_TONE_RANK, composeComplianceKpis, dominantTone } from './compliance-board.js';
export type { ComposeKpisInput, KpiChip, KpiKey, KpiTone } from './compliance-board.js';

/** ⊕ S11 · 2c — `/financials`' state selection, pure and unit-driven for the same reason. */
export { deriveFinancialEmptyReason } from './financial-board.js';
export type { FinancialEmptyReason } from './financial-board.js';
