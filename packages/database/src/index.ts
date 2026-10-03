// QMULATE — `@qmulate/database` public surface.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: nothing else in the monorepo imports `@prisma/client`.
// Every model type, every enum, the `Prisma` namespace and `Decimal` are re-exported from here,
// so `packages/api`, `apps/worker` and the rest can only reach the database through a client that
// already carries audit, scoping and field encryption. A direct `@prisma/client` import would be
// a client with none of them — which is why the ESLint config bans the specifier outside this
// package.
//
// ── ⚠ AND UNTIL S2 ROUND 4 THAT BAN WAS ONE IMPORT AWAY FROM MEANINGLESS ──────────────────────
// The star re-export below carried the `PrismaClient` CONSTRUCTOR out with the model types, so the
// ESLint rule banning `@prisma/client` was satisfied by importing the class from `@qmulate/database`
// instead. MEASURED from the barrel on a seeded fixture database:
//
//   const rogue = new PrismaClient();                       // imported from '@qmulate/database'
//   rogue.transaction.findMany()  -> 5 rows, every endowment (no force filter)
//   rogue.asset.update({ valuationSar: '2.00' })  -> PERMITTED, audit_event delta 0
//
// Its own pool, its own engine, none of the three guarantees, and nothing in the lint config or the
// type system objected. The constructor is therefore SHADOWED below: the name still exists (so no
// import breaks) and constructing it raises. `test/base-client-export-surface.test.ts` pins it.
//
// Dependency direction (§17): apps -> api -> {auth, domain, database, storage, jobs, i18n} -> config.
// `packages/domain` imports nothing internal; this package may depend on it.

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Generated Prisma surface: model types, enum objects, `Prisma`, `Decimal`
//
// ⚠ `PrismaClient` is deliberately NOT part of what this line usefully re-exports — see the
// shadowing declaration below. An explicit local export takes precedence over `export *` for the
// same name, which is what makes the shadow work without listing 38 model types by hand.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export * from '../generated/client/index.js';

import { Prisma as PrismaNamespace } from '../generated/client/index.js';

/**
 * ⚠ NOT the Prisma client constructor. Constructing it raises.
 *
 * The generated `PrismaClient` reached this barrel through `export *` above, which made the ESLint
 * ban on `@prisma/client` decorative: one import of this name produced a client with no force
 * filter (NFR-05), no column gate and no audit spine (NFR-04), on its own connection pool. The
 * measurement is in the header.
 *
 * It is shadowed rather than removed because `export *` has no exclusion form, and enumerating the
 * generated model types by hand would be a list that silently rots every time the schema changes.
 * Shadowing keeps ONE line of maintenance and fails loudly at the exact moment of misuse.
 *
 * ⚠ WHAT THIS DOES NOT CLOSE: `packages/database`'s own modules import the real constructor from
 * `../generated/client/index.js` (they must — one of them has to construct it), and that relative
 * path is reachable by anything inside this package. This closes the CROSS-PACKAGE route, which is
 * the one the ESLint rule was written for and the one a casual caller takes.
 */
export class PrismaClient {
  constructor() {
    throw new Error(
      'new PrismaClient() from @qmulate/database is refused. A raw Prisma client carries NONE of ' +
        'the three cross-cutting guarantees — no per-endowment force filter (NFR-05), no ' +
        'DOMAIN_WRITE_POLICIES column gate, and no hash-chained audit event (NFR-04) — and it opens ' +
        'a second connection pool that no guardrail watches. Measured before this refusal: ' +
        '`new PrismaClient().asset.update({ valuationSar })` revalued a corpus asset with an ' +
        'audit_event delta of 0. Use createPrismaClient(ctx) and wrap writes in withAudit().',
    );
  }
}

/**
 * The money type. `Decimal(18,2)` in Postgres, `decimal.js` in TypeScript, JS `number` NOWHERE
 * (§17 cross-cutting DoD). Re-exported so callers never have to decide between `Prisma.Decimal`
 * and a separate `decimal.js` import — they are the same class, and mixing the two spellings is
 * how a float eventually creeps in.
 */
export const Decimal = PrismaNamespace.Decimal;
export type Decimal = InstanceType<typeof PrismaNamespace.Decimal>;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Actor context, residency, error types
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  APP_RUNTIME_ROLE,
  AuditTransactionRequiredError,
  ForbiddenScopeError,
  InvalidBypassError,
  MoneyAsNumberError,
  RESERVED_MATTER_APPROVAL_GUC,
  ReservedMatterNotApprovedError,
  SYSTEM_CONTEXT,
  ShartAmendmentForbiddenError,
  UnauditableNestedWriteError,
  UnsupportedBulkOperationError,
  activeGrantWhere,
  activeMembershipWhere,
  assertBypassNotUser,
  dataClassification,
  isBypassed,
  isFixtureOnly,
  isOccurredAtOverrideAllowed,
  isRequestContext,
  makeServiceSeatContext,
  makeSystemContext,
  resolveOccurredAt,
} from './context.js';
export type {
  ActiveGrantWhere,
  ActorContext,
  ActorType,
  DataClassification,
  RequestContext,
  ScopeBypass,
  ServiceSeatContextInput,
  SystemContextOverrides,
} from './context.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Access-matrix BOOTSTRAP — provisioning only, and it needs table OWNERSHIP
//
// ⚠ THIS SUSPENDS A SECURITY GUARD. `withAccessMatrixBootstrap()` turns off migration 5/7/9's
// `waqf_access_grant_admission` trigger for one callback. It exists because authority cannot
// authorise its own first instance: since migration 9 removed the forgeable `actorType = 'SYSTEM'`
// disjunct, the FIRST `admin:access_matrix:write` holder on a database cannot be issued by any rule
// the trigger can state. The alternative was a branch inside the trigger, and a branch a forged row
// can satisfy is not a control. Read the module header before adding a caller — it is the fixture
// seed and the two test harnesses, and it must never be a request path.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  ACCESS_MATRIX_ADMISSION_TRIGGER,
  withAccessMatrixBootstrap,
} from './access-matrix-bootstrap.js';
export type { RawSqlExecutor } from './access-matrix-bootstrap.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// S12-3b · The INTAKE door — an endowment is BORN on the provisioning connection, in one audited
// transaction, admitted by `waqf_birth_admission` on sibling-endowment authority (migration 53).
// The runtime role holds no INSERT on `waqf`/`waqif`; this is the only request-path birth.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  FixtureOnlyIdentifierRefusedError,
  INTAKE_ENTITLEMENT_ORDERS,
  INTAKE_WAQF_NATURES,
  INTAKE_WAQF_TYPES,
  IntakeNestedTransactionError,
  assertFixtureGrammar,
  intakeEndowment,
  intakeShart,
} from './intake.js';
export type { EndowmentIntakeInput, EndowmentIntakeResult } from './intake.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Reserved matters — the ONE door, and the ONE approval-artifact fingerprint
//
// `withReservedMatter()` is the only sanctioned way to open a reserved-matter database guard, and
// it can never open the Shart al-Waqif columns (user decision, 2026-07-27). `approvalFingerprint()`
// is the single implementation of `ApprovalRequest.payloadHash` — `packages/api`'s approve and
// execute procedures MUST use it rather than hashing the payload themselves, or the approver would
// sign one canonical form and the executor would verify another.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  DEED_TERM_WRITE_ONCE_COLUMNS,
  REVERSION_CAPTURE_COLUMN,
  SHART_COLUMNS,
  approvalCanonicalForm,
  approvalFingerprint,
  approvalFingerprintMatches,
  withReservedMatter,
} from './reserved-matter.js';

// Migration 54 — the fixture-only development administrator's self-approval exemption, read from
// the database (the only place it is written). See `src/self-approval-exemption.ts`.
export {
  SELF_APPROVAL_EXEMPTION_SETTING,
  isSelfApprovalExempt,
  recordSelfApprovalExemption,
} from './self-approval-exemption.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ANCESTOR WALK (R-FRONTIER) — entitlement is a property of a CHAIN, not of a row
//
// ⚠ `readBeneficiaryAncestry()` ISSUES RAW SQL, WHICH BYPASSES THE PER-ENDOWMENT FORCE FILTER. It
// performs no authorization of its own: `waqfId` is a required argument and every caller must
// already hold a verified grant on that endowment. Read `src/lineage.ts`'s header before adding a
// call site — and note that NOTHING may cache, materialize or persist what it returns, because
// `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is a TEMPORARY exclusion that reverses on a death.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export { ANCESTRY_MAX_DEPTH, ancestryByBeneficiary, readBeneficiaryAncestry } from './lineage.js';
export type { BeneficiaryAncestryRow } from './lineage.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Client factory and the sanctioned write path
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  CONNECTION_ROLE_ENV,
  EXTENSION_ORDER,
  MissingConnectionCredentialError,
  UnextendedClientWriteError,
  createPrismaClient,
  createScopedPrisma,
  disconnectPrisma,
  flushScopeDenialAudits,
  // ⚠ THE UNEXTENDED HANDLE. Read the block above `UnextendedClientWriteError` in `client.ts`
  // before adding a call site: it is write-guarded since S2 round 4, but its cross-endowment READS
  // and its raw-SQL surface are still open, and both are named residuals rather than oversights.
  getBasePrismaClient,
  getSystemPrisma,
  hasConnectionCredential,
  installScopeDenialAuditing,
  recordEvent,
  scopeDenialAuditStats,
  setReservedMatterApproval,
  systemPrisma,
  withAudit,
} from './client.js';
export type { ConnectionRole, ExtendedPrismaClient } from './client.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE PRIVILEGED (OWNER) CONNECTION — `MIGRATOR_DATABASE_URL`
//
// ⚠ THESE TWO HANDLES CAN RUN DDL, SUSPEND A GUARD AND HARD-DELETE. They exist for the three things
// that genuinely need table ownership after ADR-0008 round 6: the fixture seed, the two integration
// harnesses' SCAFFOLDING, and a one-off operational bootstrap. They must never be reached from a
// request path, and a REFUSAL PROBE MUST NEVER RUN ON THEM — a test that sees a guard refuse while
// connected as the owner is measuring nothing at all.
//
// `apps/web` and `apps/worker` call `assertNoPrivilegedDatabaseUrls()` at boot, so a service that
// was accidentally given `MIGRATOR_DATABASE_URL` refuses to start rather than quietly holding this.
// `test/base-client-export-surface.test.ts` allow-lists every file permitted to name them.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export { createPrivilegedPrismaClient, getPrivilegedBasePrismaClient } from './client.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ACCESS-MATRIX WRITE PATH — `ACCESS_MATRIX_DATABASE_URL`
//
// The ONE runtime route that may mint or widen a seat, now that the runtime role holds no INSERT on
// `waqf_access_grant` at all. Two functions, and the Prisma client they use is NEVER returned to a
// caller — there is no exported handle on the provisioning connection, deliberately, because such a
// handle would carry `$executeRawUnsafe` on a role that holds INSERT on the authorization plane and
// would re-create the exact hole ADR-0008 describes. Grant admission is fully live on that
// connection. Read `src/access-matrix.ts`'s header before adding a caller.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  AccessMatrixNestedTransactionError,
  provisionAccessGrant,
  revokeAccessGrant,
} from './access-matrix.js';
export type { AccessGrantInput } from './access-matrix.js';

// S12-1 / AV4-02 — the approval DECISION door, on the same provisioning connection. The client is
// never returned; `decideApproval()` is the entire sanctioned surface. Read `src/approval-plane.ts`.
export {
  ApprovalPlaneNestedTransactionError,
  ReservedMatterChainIncompleteError,
  decideApproval,
} from './approval-plane.js';
export type {
  ApprovalDecision,
  ApprovalDecisionInput,
  DecidedApprovalRow,
} from './approval-plane.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Audit spine
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  AUDIT_DIFF_IGNORE,
  REDACTED_ENCRYPTED_PLACEHOLDER,
  UNAUDITED_MODELS,
  appendAuditEvent,
  assertNestedWritesAuditable,
  assertOperationNestedWritesAuditable,
  createAuditExtension,
  currentAuditTransaction,
  outsideAuditTransaction,
  recordAuditEvent,
  // ⚠ `runAuditedTransaction` IS NO LONGER RE-EXPORTED HERE (S2 round 4). It hands its callback
  // `state.rawTx` — the RAW transaction client, which by construction is the one receiver the
  // unextended handle's write guard must exempt (the audit spine re-issues mutations through it). So
  // it was the last Prisma-delegate route to an unrecorded write on the public surface. MEASURED,
  // AFTER the write guard shipped and through the guarded handle:
  //
  //   runAuditedTransaction(getBasePrismaClient(), makeSystemContext(), async (s) =>
  //     s.rawTx.asset.update({ where: { id: 'asset-002' }, data: { valuationSar: '11.00' } }))
  //     -> PERMITTED. asset-002: 42,000,000 -> 11.  audit_event DELTA 0.
  //
  // `withAudit(ctx, fn)` is the public equivalent and gives the caller the EXTENDED client, so every
  // mutation inside it emits its event. Nothing outside `packages/database` imported this, and the
  // two in-package callers (`src/client.ts`, `src/seed.ts`) import it from `./extensions/audit.js`
  // directly, so removing it from the barrel costs nothing.
  //
  // RESIDUAL, NOT CLOSED: `package.json` publishes `./extensions/audit` as a subpath, so it is still
  // reachable at `@qmulate/database/extensions/audit`. Removing that subpath is a `package.json`
  // change, outside this change's files, and it is reported rather than assumed away.
  setHijriFormatter,
  softDelete,
  toHijri,
} from './extensions/audit.js';
export type {
  AuditEventInput,
  AuditTransactionOptions,
  AuditTxState,
  RawTransactionClient,
} from './extensions/audit.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Hash chain — canonicalization, hashing, verification
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  AUDIT_CHAIN_LOCK_KEY,
  AUDIT_HASH_PAYLOAD_FIELDS,
  CanonicalJsonError,
  GENESIS_HASH,
  HASH_HEX_RE,
  buildAuditPayload,
  canonicalJson,
  computeHash,
  dateToCanonicalString,
  decimalToCanonicalString,
  numberToCanonicalString,
  recomputeRowHash,
  serializeForAudit,
  verifyChain,
} from './hash-chain.js';
export type {
  AuditHashPayloadField,
  AuditHashRow,
  ChainVerificationResult,
  JsonSafe,
} from './hash-chain.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Scoping force-filter
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  ALL_MODELS,
  AML_CONFIDENTIALITY_MODELS,
  AUTHORIZATION_PLANE_MODELS,
  BENEFICIARY_FORBIDDEN_MODELS,
  CLIENT_REACHABLE_MODELS,
  DOMAIN_WRITE_POLICIES,
  DOMAIN_WRITE_UNGATED,
  PARENT_SCOPED_MODELS,
  SCOPING_KNOWN_GAPS,
  UNSCOPED_MODELS,
  USER_SCOPED_MODELS,
  WAQF_DIRECT_SCOPED_MODELS,
  WAQF_NULLABLE_SCOPED_MODELS,
  WAQF_SELF_SCOPED_MODELS,
  assertDomainWriteCoverage,
  assertScopingCoverage,
  createScopingExtension,
  scopeFilter,
  // ⚠ `setScopeDenialHandler` IS NO LONGER RE-EXPORTED HERE, AND THAT IS DELIBERATE (S2 round 4).
  // It is the OFF SWITCH for the NFR-04 denial trail, and it was on the public barrel with nothing
  // in the monorepo importing it. MEASURED on a seeded fixture database: an out-of-scope
  // `asset.update` produced `ACCESS_DENIED` delta 1 with the default handler, and delta 0 after one
  // call to `setScopeDenialHandler(() => {})` — process-wide, for every caller, silently. The
  // sanctioned direction is `installScopeDenialAuditing()`, which only ever RE-INSTALLS the real
  // handler and is still exported. RESIDUAL, NOT CLOSED: `package.json` publishes
  // `./extensions/scoping` as a subpath, so the setter is still reachable at
  // `@qmulate/database/extensions/scoping`. Removing that subpath is a `package.json` change,
  // outside this change's files, and it is reported rather than assumed away.
} from './extensions/scoping.js';
export type { ScopeDenial, ScopeDenialHandler } from './extensions/scoping.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Field encryption
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  ENCRYPTED_COLUMN_NAMES,
  ENCRYPTED_FIELDS,
  EncryptedFieldError,
  EncryptedFieldQueryError,
  HMAC_COLUMN_NAMES,
  HmacColumnWriteError,
  KNOWN_UNENCRYPTED_SENSITIVE_FIELDS,
  createEncryptionExtension,
  qualifiedColumn,
} from './extensions/encryption.js';

export {
  CIPHER_ENVELOPE_RE,
  FieldCryptoError,
  configureFieldCrypto,
  decryptField,
  encryptField,
  isCipherEnvelope,
  isFieldCryptoConfigured,
  maybeDecryptField,
  normalizeForHash,
  resetFieldCrypto,
  searchHash,
  searchHashEquals,
} from './crypto.js';
export type { FieldCryptoConfig } from './crypto.js';

// ── The organisation layer (migration 55) ─────────────────────────────────────────────────────
export {
  resolveOrgAccess,
  setPrimaryAdmin,
  setUserAccessLevel,
  setUserOverrides,
  setUserStatus,
  upsertAccessLevel,
  applyDefaultAccessProfile,
} from './org-access.js';
export type { OrgAccess, OrgAccessQueryClient } from './org-access.js';

/** Plain reachability probe for the configured database (web start-up, `pnpm dev:health`). */
export { describeDatabaseTarget, isConnectionFailure, probeDatabase, type DatabaseProbe } from './health.js';
