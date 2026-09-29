// QMULATE — the request/actor context that drives audit, scoping and encryption.
//
// ONE OBJECT CARRIES EVERY AUTHORIZATION AND ACCOUNTABILITY FACT about the caller. It is built
// once per request (in the tRPC context, E2/S2), passed to `createPrismaClient(ctx)`, and from
// then on the three Prisma extensions read it — never `process.env`, never a global, never an
// ambient "current user". That is what makes the force-filter fail-closed: a client built
// without grants can see nothing, and there is no code path that widens it later.
//
// NAMING: the E1 build contract calls this `ActorContext`; the task brief calls it
// `RequestContext`. They are the same type — `ActorContext` is exported as an alias so both
// spellings compile and neither agent has to rename anything.

import type { Role } from '../generated/client/index.js';

/** Who is acting. `SYSTEM` = a job/seed/migration; `SERVICE` = a machine-to-machine caller. */
export type ActorType = 'USER' | 'SYSTEM' | 'SERVICE';

/**
 * Why the scoping force-filter is being skipped. Both values are deliberately narrow and both
 * are auditable — there is no generic "admin bypass".
 *
 *  • `system-job`  the fixture seed, the pg-boss worker, and other trusted in-process jobs.
 *  • `migration`   data migrations and integration-test teardown. ALSO lifts the ban on bulk
 *                  operations (`deleteMany`/`updateMany`), which is why it must never be used
 *                  on a request path.
 */
export type ScopeBypass = 'system-job' | 'migration';

export interface RequestContext {
  // ── identity ───────────────────────────────────────────────────────────────────────────────
  /** better-auth user id. `null` only when `actorType !== 'USER'`. */
  actorId: string | null;
  actorType: ActorType;
  /**
   * Set when an AUTHORIZED REPRESENTATIVE Nazir acts under delegation (BR-105). The
   * representative is jointly and severally liable (Nazarah Art. 11(5)), so both identities are
   * bound into the audit hash.
   */
  onBehalfOfId?: string | null;
  /** Primary role for this request. Informational in S1; the permission grid lands in S2/E2. */
  role?: Role | null;

  // ── authorization ──────────────────────────────────────────────────────────────────────────
  /**
   * The endowments this caller may touch, from `WaqfAccessGrant`. An EMPTY array means "nothing"
   * — never "everything". This is the whole fail-closed contract.
   */
  authorizedWaqfIds: string[];
  /**
   * The caller's EFFECTIVE permission strings — `module:resource:verb`, already intersected with
   * their role preset by `resolveGrantPermissions()` in `@qmulate/domain`.
   *
   * ⚠ NEVER the raw `WaqfAccessGrant.permissions` array. That column is free text that Sprint 1
   * shipped as "stored but not yet interpreted", so a widened row can exist (written raw, migrated
   * in, or seeded); `resolveGrantPermissions()` intersects it with the preset so such a row still
   * grants nothing extra.
   *
   * ABSENT MEANS NOTHING, NOT EVERYTHING. The scoping extension consults it only to gate writes on
   * the AUTHORIZATION PLANE (`WaqfAccessGrant`, `ApprovalRequest`, `Membership`) and treats
   * `undefined` / `[]` as "no permission", so a context built without it can read its endowments and
   * write ordinary rows but can never issue a grant. The per-procedure permission check in
   * `packages/api` remains the primary enforcement; this is the second, independent one.
   *
   * ⚠ AND IT IS NOT PER-ENDOWMENT YET. One flat list for the whole request, which is only sound
   * because the force-filter has already narrowed every query to `authorizedWaqfIds`. A caller
   * holding different verbs on different endowments needs a per-waqf map — surfaced for E3, and the
   * reason the extension uses this ONLY for the authorization plane rather than for every model.
   */
  permissions?: readonly string[];
  /**
   * When set, the caller is a BENEFICIARY pinned to exactly this `Beneficiary.id`. Applied
   * BEFORE role logic (§10 §5): they can never enumerate co-beneficiaries, other endowments, or
   * the raw ledger.
   */
  beneficiarySelfId?: string | null;
  /**
   * ⚠ POSTURE ONLY. **`amlClause()` NO LONGER READS THIS FIELD, AND MUST NEVER READ IT AGAIN.**
   *
   * Sprint 1 shipped it as a global "may read AML_RESTRICTED rows" flag, and `amlClause()` returned
   * `null` — no restriction whatsoever, on any endowment — the instant it was true, BEFORE the
   * per-waqf compartment list was consulted. `makeSystemContext()` defaulted it to `true`. So the
   * no-tipping-off compartment (§10 §6, BR-604) — which is INVISIBILITY, not redaction, and whose
   * membership the Nazir does NOT hold by default — was opened by one boolean.
   *
   * {@link amlCompartmentWaqfIds} is now the sole authority. This field survives so a UI can render
   * "this caller is inside a compartment somewhere" and so `packages/api` can assert that it is
   * DERIVED from `amlCompartment = true` grants (never from `canViewAmlRestricted` on the row —
   * which the `waqf_access_grant_aml_flags` CHECK now ties to compartment membership anyway).
   */
  canViewAmlRestricted?: boolean;
  /**
   * Endowments for which this caller is inside the AML no-tipping-off compartment (BR-604).
   *
   * THE AUTHORITATIVE INPUT. Empty (the default) means "outside every compartment", which subtracts
   * every `AML_RESTRICTED` row from every query — fail-closed, and correct for the Nazir by default.
   */
  amlCompartmentWaqfIds?: string[];
  /**
   * See {@link ScopeBypass}. Absent/null for every request-path caller.
   *
   * ⚠ INVALID UNLESS `actorType === 'SYSTEM'`, enforced by {@link assertBypassNotUser} in both
   * {@link makeSystemContext} and `createPrismaClient()`. Sprint 1 let
   * `makeSystemContext({ actorType: 'USER', actorId: 'u1' })` produce an authenticated USER context
   * with the force-filter lifted, because the spread put `...overrides` AFTER `bypass: 'system-job'`.
   */
  bypass?: ScopeBypass | null;

  // ── provenance stamped into every audit event's `context` ─────────────────────────────────
  requestId?: string;
  ip?: string;
  userAgent?: string;
  /** tRPC procedure path, e.g. `waqf.updateClassification`. */
  procedure?: string;
  /** Free-text justification captured for sensitive reads/approvals. */
  reason?: string;
  /** Set by `withReservedMatter()` once an APPROVED reserved matter has been verified. */
  reservedMatterApprovalId?: string | null;

  /**
   * Overrides the audit event timestamp. Honoured ONLY when
   * `actorType === 'SYSTEM'` AND `DATA_CLASSIFICATION === 'fixture-only'` — see
   * `isOccurredAtOverrideAllowed()`. It exists for ONE reason: the fixture seed must be
   * byte-reproducible so the audit hash chain has a pinnable frozen final `rowHash` (A7).
   * A function is accepted so a seed can advance an ordinal per write without rebuilding ctx.
   */
  occurredAtOverride?: Date | (() => Date) | null;
}

/** The E1 build contract's name for {@link RequestContext}. Identical type. */
export type ActorContext = RequestContext;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Names shared with the hand-written SQL migration. Change them in BOTH places or not at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Transaction-local GUC that unlocks the `waqf_shart_immutable` trigger.
 *
 * Set it ONLY from `withReservedMatter()`, and only after verifying an APPROVED
 * `ApprovalRequest` of type `RESERVED_MATTER` with `checkerId != null && checkerId !== makerId`:
 *
 *   await tx.$executeRawUnsafe(`SELECT set_config($1, $2, true)`, RESERVED_MATTER_APPROVAL_GUC, id)
 *
 * The third argument `true` makes it transaction-local, so it cannot leak onto the next
 * statement of a pooled connection.
 */
export const RESERVED_MATTER_APPROVAL_GUC = 'qmulate.reserved_matter_approval_id';

/**
 * ⚠ SUPERSEDED, AND KEPT ONLY SO THE NAME IN MIGRATION 1 IS STILL WRITTEN DOWN ONCE.
 *
 * `qmulate_app_runtime` is the NOLOGIN role migration 1 §2 creates as a "least-privilege runtime role
 * (defence in depth)". **It was never load-bearing, because nothing ever connected as it** — the
 * application connected as the database OWNER, which bypasses GRANTs entirely. Migration 1's own header
 * said so, and an `it.todo` in `test/audit-immutability.integration.test.ts` said so.
 *
 * ADR-0008 round 6 replaced it with a real one: **`qmulate_app`**, which is what `DATABASE_URL` now
 * connects as, and which holds `SELECT, INSERT` (never `UPDATE`/`DELETE`/`TRUNCATE`) on `audit_event`,
 * `SELECT` only on `waqf_access_grant`/`membership`, and owns nothing. The canonical name lives in SQL,
 * in `qmulate_runtime_role()` (migration 10 §1), and in TypeScript in
 * `src/provision-roles.ts`'s `RUNTIME_ROLE`.
 *
 * `qmulate_app_runtime` is consequently **no longer created at all**: the migrator is deliberately
 * `NOCREATEROLE`, so migration 1 §2 takes its documented NOTICE branch. That is correct — a migrator
 * that can create roles can create itself a superuser — and it is why the A4 assertion moved to the
 * live role.
 *
 * @deprecated Use `qmulate_runtime_role()` in SQL or `RUNTIME_ROLE` from `src/provision-roles.ts`.
 */
export const APP_RUNTIME_ROLE = 'qmulate_app_runtime';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ONE DEFINITION OF "AN ACTIVE GRANT"
//
// ⚠ EVERY PLACE THAT ANSWERS "WHAT MAY THIS CALLER DO" MUST USE THIS PREDICATE, BY IMPORT.
//
// It lives in `packages/database` and not in `packages/auth` because of the dependency direction
// (§17): `auth -> database`, never the reverse. So this is the one module BOTH `packages/auth`'s
// `getUserDbRoles()` and `packages/api`'s request-context factory can share, and a test can assert
// they share it by object identity rather than by reading two similar-looking object literals.
//
// WHY IT IS A FUNCTION AND NOT A CONSTANT: three of the four clauses compare against `now()`, and a
// module-scope constant would freeze the comparison instant at import time — so a long-lived process
// would keep honouring a grant that expired while it was running.
//
// WHY IT MATTERS THAT THERE IS ONLY ONE: Sprint 1 filtered GRANTS on the full validity window but
// MEMBERSHIPS on `deletedAt: null` alone, in the same function, five lines apart — and nothing
// compared the two. That asymmetry is real (see {@link activeMembershipWhere}) but it has to be a
// stated decision, not an artefact of two hand-written literals drifting.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * The four clauses that make a `WaqfAccessGrant` count. Shape matches Prisma's `where`.
 *
 * ⚠ `OR` IS DELIBERATELY MUTABLE. Prisma's generated `WaqfAccessGrantWhereInput.OR` is a mutable
 * array, and a `readonly` one is not assignable to it — so making this immutable "for hygiene" forces
 * every call site into a spread or a cast, and a cast at an authorization call site is exactly where
 * a clause goes missing. The function returns a FRESH object on every call, which is the property
 * that actually matters.
 */
export interface ActiveGrantWhere {
  readonly deletedAt: null;
  readonly revokedAt: null;
  readonly validFrom: { lte: Date };
  OR: [{ validUntil: null }, { validUntil: { gte: Date } }];
}

/**
 * "This grant is in force at `asOf`" — not soft-deleted, not revoked, started, not expired.
 *
 * Mirrored in SQL by `qmulate_has_active_grant()` (migration
 * `00000000000003_e2_authority_guards`), which the `approval_request_authority` trigger uses to
 * decide whether a recorded `checkerId` really holds the authority it claims. A test compares the
 * two sides so the TypeScript predicate and the trigger cannot drift.
 *
 * @param asOf pass the request's single `new Date()` so every check in one request agrees.
 */
export function activeGrantWhere(asOf: Date = new Date()): ActiveGrantWhere {
  return {
    deletedAt: null,
    revokedAt: null,
    validFrom: { lte: asOf },
    OR: [{ validUntil: null }, { validUntil: { gte: asOf } }],
  };
}

/**
 * "This `Membership` is in force" — and it is a WEAKER predicate than {@link activeGrantWhere},
 * because the `Membership` model has no `revokedAt`, `validFrom` or `validUntil` columns at all.
 *
 * ⚠ THAT ASYMMETRY IS A KNOWN GAP, NOT A DESIGN. A membership can only be soft-deleted, so it never
 * expires and cannot be revoked except by setting `deletedAt`. What stops it from being a privilege
 * escalation is the CHECK constraint `membership_role_family_level_only`, which restricts
 * `Membership.role` to `FAMILY_BOARD`: a client-level row can therefore never carry an operational
 * seat, let alone an approval authority. Adding a validity window to `Membership` is the proper fix
 * and belongs to whichever epic revisits family-level access.
 */
export function activeMembershipWhere(): { readonly deletedAt: null } {
  return { deletedAt: null };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Residency classification
//
// Read straight from `process.env`, not through `@qmulate/config`. `@qmulate/config` is the
// zod-validated gate at APP BOOT (assertions B1/B2); this reader exists so the same decision can
// be made inside a bare `tsx` process (the seed) and inside a unit test with no config module
// loaded. A guardrail that a failed import can switch off is not a guardrail.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type DataClassification = 'fixture-only' | 'production';

/** The raw `DATA_CLASSIFICATION` value, or `undefined` when unset/unrecognized. */
export function dataClassification(): DataClassification | undefined {
  const raw = process.env.DATA_CLASSIFICATION;
  return raw === 'fixture-only' || raw === 'production' ? raw : undefined;
}

export function isFixtureOnly(): boolean {
  return dataClassification() === 'fixture-only';
}

/**
 * Deterministic audit timestamps are a FIXTURE-ONLY affordance. In production every event is
 * stamped with the real wall clock, no exceptions — a caller-supplied `occurredAt` would let an
 * actor backdate their own trail.
 */
export function isOccurredAtOverrideAllowed(ctx: RequestContext): boolean {
  return ctx.actorType === 'SYSTEM' && isFixtureOnly();
}

/** Resolves {@link RequestContext.occurredAtOverride} if and only if it is permitted. */
export function resolveOccurredAt(ctx: RequestContext): Date {
  if (ctx.occurredAtOverride != null && isOccurredAtOverrideAllowed(ctx)) {
    const value =
      typeof ctx.occurredAtOverride === 'function'
        ? ctx.occurredAtOverride()
        : ctx.occurredAtOverride;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  }
  return new Date();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// System context
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠ BYPASSES THE SCOPING FORCE-FILTER. For the fixture seed, migrations and trusted in-process
 * jobs ONLY. It must never be reachable from a request path — a request that ends up holding
 * this context has escaped the per-endowment access matrix (NFR-05) entirely.
 *
 * Note what it does NOT switch off: writes still emit audit events, and UBO/IBAN columns are
 * still field-encrypted. Only the row-visibility filter is lifted.
 */
export const SYSTEM_CONTEXT: RequestContext = Object.freeze({
  actorId: null,
  actorType: 'SYSTEM',
  authorizedWaqfIds: [],
  // FALSE, changed in E2. It used to be `true`, which combined with `amlClause()`'s short-circuit to
  // mean "a system context sees the whole AML compartment". A bypassed context does not need it —
  // `scopeFilter()` returns `null` at step 2 for a bypass, before AML is ever consulted — so the flag
  // was pure blast radius: any context built from this shape WITHOUT a bypass silently held the
  // clearance. See {@link RequestContext.canViewAmlRestricted}.
  canViewAmlRestricted: false,
  bypass: 'system-job',
  requestId: 'system',
}) as RequestContext;

/**
 * Overrides {@link makeSystemContext} accepts.
 *
 * `actorType` is pinned to `'SYSTEM'` AT THE TYPE LEVEL so `makeSystemContext({ actorType: 'USER' })`
 * is a compile error, not merely a runtime one. That call is the T-25 hole: because Sprint 1 spread
 * `...overrides` after `bypass: 'system-job'`, it returned an authenticated USER context with the
 * scoping force-filter lifted — `scopeFilter()` returns `null` at step 2, BEFORE beneficiary
 * isolation, grants or AML are consulted, and `bypass: 'migration'` additionally lifts the ban on
 * `deleteMany`/`updateMany`.
 *
 * The runtime check ({@link assertBypassNotUser}) stays too: a `Partial<RequestContext>` widened
 * through an `as never`, a JSON round-trip, or a value read from configuration all reach the same
 * factory without passing this type.
 */
export type SystemContextOverrides = Partial<Omit<RequestContext, 'actorType'>> & {
  readonly actorType?: 'SYSTEM';
};

/**
 * A mutable copy of {@link SYSTEM_CONTEXT} — e.g. the seed's `SEED_ACTOR`.
 *
 * `actorType` and `bypass` are applied AFTER the overrides and are then re-asserted, so no override
 * can produce a bypassed non-SYSTEM context however it is typed.
 */
export function makeSystemContext(overrides: SystemContextOverrides = {}): RequestContext {
  const ctx: RequestContext = {
    actorId: null,
    authorizedWaqfIds: [],
    canViewAmlRestricted: false,
    requestId: 'system',
    ...overrides,
    // Resolved AFTER the spread — the ordering bug T-25 was. But the override is HONOURED rather
    // than silently coerced to 'SYSTEM': a caller who asked for a USER context and got a SYSTEM one
    // with a bypass would be handed exactly the escalation this fix is about, just quietly. So the
    // requested actorType stands and `assertBypassNotUser` refuses the combination below.
    actorType: overrides.actorType ?? 'SYSTEM',
    bypass: overrides.bypass === undefined ? 'system-job' : overrides.bypass,
  };
  assertBypassNotUser(ctx);
  return ctx;
}

/**
 * A bypass is valid ONLY for a `SYSTEM` actor. Throws otherwise.
 *
 * Called from {@link makeSystemContext} and from `createPrismaClient()`, so there is no route to a
 * client whose force-filter is lifted for a `USER` or a `SERVICE` actor. A `SERVICE` (machine-to-
 * machine) caller is refused as well: it is an authenticated *caller*, so it belongs inside the
 * access matrix, and "the integration needs to see everything" is exactly the argument that would
 * make the matrix decorative.
 *
 * FAIL CLOSED: an unrecognised `actorType` is refused too, following `requiresTotpForDbRole`'s
 * precedent that an unmapped value is treated as the restricted case.
 */
export function assertBypassNotUser(ctx: RequestContext): void {
  if (ctx.bypass === undefined || ctx.bypass === null) return;
  if (ctx.actorType === 'SYSTEM') return;
  throw new InvalidBypassError(ctx.actorType, ctx.bypass);
}

/** True when the scoping force-filter is lifted for this context. */
export function isBypassed(ctx: RequestContext): boolean {
  // Re-checks the actor type rather than trusting the field: this predicate is the ONE thing that
  // stands between a context and an unfiltered query, so it must not be satisfiable by a `bypass`
  // value alone. Belt and braces with `assertBypassNotUser`, which refuses such a context at
  // construction — but a context can be built as a bare object literal, and one is, in tests.
  if (ctx.actorType !== 'SYSTEM') return false;
  return ctx.bypass === 'system-job' || ctx.bypass === 'migration';
}

/** Structural test used by the `withAudit(ctx | db, fn)` overloads. */
export function isRequestContext(value: unknown): value is RequestContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'actorType' in value &&
    'authorizedWaqfIds' in value &&
    Array.isArray((value as RequestContext).authorizedWaqfIds)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Error types
//
// Each carries a stable `code` so the API layer can map it to a status without string matching.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** A caller tried to read or write a row outside their `authorizedWaqfIds`. */
export class ForbiddenScopeError extends Error {
  readonly code = 'FORBIDDEN_SCOPE';
  readonly model: string;
  readonly operation: string;

  // Explicit field assignment rather than TypeScript parameter properties: parameter properties
  // are not erasable, so they break `node --experimental-strip-types`, which is a plausible way
  // for a job or a script to load this package without a compile step.
  constructor(model: string, operation: string, message: string) {
    super(message);
    this.name = 'ForbiddenScopeError';
    this.model = model;
    this.operation = operation;
  }
}

/**
 * A mutation on an audited model was attempted outside `withAudit()`. Thrown rather than
 * silently skipping the audit row: an unaudited write is worse than a failed one (NFR-04).
 */
export class AuditTransactionRequiredError extends Error {
  readonly code = 'AUDIT_TRANSACTION_REQUIRED';
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} must run inside withAudit(): every mutation of an audited model ` +
        `commits together with its audit event, in one transaction (NFR-04).`,
    );
    this.name = 'AuditTransactionRequiredError';
  }
}

/**
 * `createMany` / `updateMany` / `deleteMany` / hard `delete` on an audited model. There is no
 * reliable per-row before/after image for these, so they cannot produce a faithful trail.
 * Loop over single-row operations, or use `softDelete()`.
 */
export class UnsupportedBulkOperationError extends Error {
  readonly code = 'UNSUPPORTED_BULK_OPERATION';
  constructor(model: string, operation: string, hint: string) {
    super(`${model}.${operation} is not permitted on an audited model: ${hint}`);
    this.name = 'UnsupportedBulkOperationError';
  }
}

/**
 * A write payload would mutate an audited model THROUGH A RELATION (gate G-1).
 *
 * Sibling of {@link UnsupportedBulkOperationError} and refused for the same reason: the audit
 * spine cannot produce a faithful before/after image for the row, so committing it would put an
 * unrecorded material write into the system of record. The full argument — including why the
 * alternative (auditing nested children) is not achievable at the client-extension layer — is the
 * block comment above `assertNestedWritesAuditable` in `extensions/audit.ts`.
 */
export class UnauditableNestedWriteError extends Error {
  readonly code = 'UNAUDITABLE_NESTED_WRITE';
  /** The model whose rows the nested verb would have written. */
  readonly target: string;
  /** Dotted payload path, e.g. `Waqf.data.assets`. */
  readonly path: string;

  constructor(target: string, path: string, detail: string, delegate: string) {
    super(
      `${path} would ${detail} ${target} rows through a relation, and the audit spine cannot ` +
        `record it: a nested write returns only the parent row, so there is no per-row ` +
        `before-image and — for a nested create — no id to name. G-1 requires every material ` +
        `write to emit exactly one audit_event, so this is refused rather than committed ` +
        `unrecorded. Issue it as a top-level ${delegate} operation instead, and wrap both ` +
        `statements in withAudit() if they must commit together.`,
    );
    this.name = 'UnauditableNestedWriteError';
    this.target = target;
    this.path = path;
  }
}

/** A JS `number` was supplied for a `Decimal` column. Money is `decimal.js` end to end. */
export class MoneyAsNumberError extends Error {
  readonly code = 'MONEY_AS_NUMBER';
  constructor(model: string, field: string) {
    super(
      `${model}.${field} is a Decimal column and was given a JS number. Floating point is banned ` +
        `for money and for shares end to end — pass a Decimal or a decimal string instead.`,
    );
    this.name = 'MoneyAsNumberError';
  }
}

/**
 * Raised by `withReservedMatter()` when the supplied `ApprovalRequest` is not an APPROVED,
 * maker != checker `RESERVED_MATTER` for the target waqf.
 *
 * Declared here (rather than in `src/reserved-matter.ts`) so the class has one definition:
 * `reserved-matter.ts` was not assigned to any Sprint-1 agent — see the sprint report.
 */
export class ReservedMatterNotApprovedError extends Error {
  readonly code = 'RESERVED_MATTER_NOT_APPROVED';
  constructor(message: string) {
    super(message);
    this.name = 'ReservedMatterNotApprovedError';
  }
}

/**
 * A write would have touched a Shart al-Waqif column.
 *
 * DELIBERATELY A DIFFERENT ERROR from {@link ReservedMatterNotApprovedError}. That one means "this
 * approval is not good enough" and invites the caller to obtain a better one. This one means "no
 * approval exists or could exist" (user decision, 2026-07-27: "shart al-waqif cannot be changed,
 * regardless of approvals"). Collapsing them into one code would send every future caller looking
 * for the approval that would unlock it.
 */
export class ShartAmendmentForbiddenError extends Error {
  readonly code = 'SHART_AMENDMENT_FORBIDDEN';
  constructor(message: string) {
    super(message);
    this.name = 'ShartAmendmentForbiddenError';
  }
}

/**
 * A `bypass` was set on a context whose `actorType` is not `SYSTEM`.
 *
 * The T-25 hole, as an error type: `makeSystemContext({ actorType: 'USER', actorId: 'u1' })` used to
 * return an authenticated USER context with the scoping force-filter lifted, and nothing rejected
 * the combination.
 */
export class InvalidBypassError extends Error {
  readonly code = 'INVALID_BYPASS';
  readonly actorType: string;
  readonly bypass: string;

  constructor(actorType: string, bypass: string) {
    super(
      `bypass "${bypass}" is invalid for actorType "${actorType}": the scoping force-filter (NFR-05) ` +
        `may only be lifted for a SYSTEM actor — the fixture seed, a data migration, or a trusted ` +
        `in-process job. A USER or SERVICE caller is an authenticated caller and belongs INSIDE the ` +
        `per-endowment access matrix. Build the context with createPrismaClient({ actorType: 'USER', ` +
        `authorizedWaqfIds: [...] }) and give the caller a WaqfAccessGrant instead.`,
    );
    this.name = 'InvalidBypassError';
    this.actorType = actorType;
    this.bypass = bypass;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DECLARED SERVICE SEAT (S10-3a) — a context whose bypass CANNOT be turned on
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Owner rulings, both binding and given a day apart:**
 *  · 2026-08-27 (S9 addendum, THIRD batch) — E9's evaluator runs as a DECLARED NON-HUMAN identity:
 *    enumerated minimal permissions (`compliance:task:write` only), granted on every endowment it
 *    sweeps, visible in the access matrix like any seat, its writes audited as SYSTEM-actor acts,
 *    **never maker acts: the seat can approve nothing.**
 *  · 2026-08-28 (S10 addendum, FIRST batch — D1) — the audited actor type is **`SYSTEM`**, with the
 *    scoping **`bypass` explicitly `null` at every construction site**, never left to the factory
 *    default. The force filter applies to this seat exactly as to a human seat.
 *
 * ── WHY THIS EXISTS RATHER THAN A CONVENTION ────────────────────────────────────────────────
 * The memo records the known cost of the ruled form, and this function is the control it says is
 * owed: unlike a `SERVICE` seat — for which a bypass is refused BY TYPE at both chokepoints — a
 * `SYSTEM` seat stays *eligible* for one, and {@link makeSystemContext}'s default is on the UNSAFE
 * side (`bypass: 'system-job'` unless the caller passes `null`; the ternary tests `=== undefined`).
 * So the guarantee would otherwise rest on every future construction site remembering one
 * parameter, where forgetting is silent and the audit events look identical either way.
 *
 * ⚠ THE FIX IS NOT "REMEMBER TO PASS `bypass: null`". IT IS THAT THERE IS NOTHING TO PASS.
 * This function takes no `bypass` and no `actorType`; both are written here and cannot be
 * overridden by any argument, however typed. The unsafe value is not discouraged, it is
 * unreachable through this door.
 *
 * ⊕ AND THE OTHER HALF WAS ALREADY IN PLACE, BUILT FOR A DIFFERENT REASON. `apps/worker` — the only
 * place the seat is constructed — cannot import {@link makeSystemContext} at all: ESLint Ban 5
 * (S10-1a) forbids it there, and a CI probe proves the ban bites in that app specifically. So this
 * constructor is not merely the RECOMMENDED door into the seat, it is the only one the worker can
 * reach. That ban was written to close an unrelated hole (the worker was the one runtime app with
 * no bypass scan); that it turns out to be the structural half of D1's debt is luck worth recording
 * as luck, not claimed as design.
 *
 * ⚠ WHAT THIS DOES **NOT** DO. It does not confer authority. The seat still resolves through the
 * access matrix like any other principal: `authorizedWaqfIds` must be its REAL grants, and the six
 * guards in `extensions/scoping.ts` all run because {@link isBypassed} returns false. A seat with
 * no grants sees nothing — which is the property the owner's testing phase depends on being true.
 */
export interface ServiceSeatContextInput {
  /** The seat's principal id — a real `user` row, so `waqf_access_grant` can point at it. */
  readonly actorId: string;
  /** The endowments the seat holds ACTIVE grants on. Never a wildcard, never all-endowments. */
  readonly authorizedWaqfIds: readonly string[];
  /** Correlation id for this sweep. */
  readonly requestId: string;
  /** Why this run is happening, for the trail. */
  readonly reason?: string;
}

export function makeServiceSeatContext(input: ServiceSeatContextInput): RequestContext {
  if (typeof input?.actorId !== 'string' || input.actorId.trim() === '') {
    throw new Error(
      "makeServiceSeatContext: actorId is REQUIRED and must name the seat's own principal row. " +
        'An unattributed write into an append-only >= 10-year trail is worse than a refused one.',
    );
  }
  if (typeof input.requestId !== 'string' || input.requestId.trim() === '') {
    throw new Error('makeServiceSeatContext: requestId is REQUIRED.');
  }

  const ctx: RequestContext = {
    actorId: input.actorId,
    // The seat's REAL grants. An empty list is legal and means "sweeps nothing" — which is the
    // correct behaviour for a seat nobody has granted anything to, and must never be widened here.
    authorizedWaqfIds: [...input.authorizedWaqfIds],
    canViewAmlRestricted: false,
    requestId: input.requestId,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    // ⚠ NOT OVERRIDABLE, AND WRITTEN LAST SO NO SPREAD CAN REACH THEM. `actorType` is the owner's
    // D1 ruling; `bypass: null` is the same ruling's second half, stated EXPLICITLY rather than
    // inherited — the factory's default is the unsafe value and this is the one place that fact is
    // neutralised.
    actorType: 'SYSTEM',
    bypass: null,
  };

  // Belt: the same assertion the general factory runs. It cannot fire given the literals above,
  // and it stays because a future edit to this function is exactly the event it guards.
  assertBypassNotUser(ctx);
  return ctx;
}
