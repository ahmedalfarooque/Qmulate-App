/**
 * The per-request context. ONE object carrying every authorization and accountability fact about
 * the caller, built ONCE per request and never cached across requests.
 *
 * Source of truth: `docs/product/prd/10-roles-access-matrix-spec.md` §7.1 (the `WaqfAccessGrant`
 * model and "a grant is active iff `revokedAt == null && now ∈ [validFrom, validUntil ?? ∞)` …
 * evaluated on every request — no cached 'logged-in = authorized' state") and §7.2 (the ladder).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NAME COLLISION, DELIBERATELY RESOLVED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `RequestContext` is exported by BOTH `@qmulate/api` (this transport context: requestId / now /
 * locale / session) and `@qmulate/database` (the ACTOR context: actorId / actorType /
 * authorizedWaqfIds / permissions / beneficiarySelfId / bypass). They are completely different
 * objects, and a mistaken import compiles far enough to be dangerous — you would hand the transport
 * context to `createPrismaClient()`, get `authorizedWaqfIds: undefined`, and the failure would
 * surface somewhere unrelated.
 *
 * So: this one is {@link TrpcContext}. `RequestContext` survives only as a deprecated alias for the
 * Sprint-1 spelling, and the database one is ALWAYS imported here under its own `ActorContext`
 * alias. Never `import type { RequestContext } from '@qmulate/database'` in this package.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HARD CONTEXT INVARIANTS (each has its own test)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. **NEVER set `bypass`.** Nothing in this package may put a `bypass` on an actor context.
 *    `createPrismaClient()` refuses `bypass` on a non-SYSTEM actor (`assertBypassNotUser`), and
 *    `test/procedure-ladder.test.ts` scans this package's source to prove the identifier is never
 *    assigned here. Sprint 1's `makeSystemContext({actorType:'USER'})` returned an authenticated
 *    USER context with the force-filter LIFTED, because the spread put `...overrides` AFTER
 *    `bypass: 'system-job'`.
 * 2. **NEVER set `canViewAmlRestricted: true` from a request field.** AML visibility is derived ONLY
 *    from `amlCompartmentWaqfIds`, built from grants where `amlCompartment === true`. AC-3's
 *    mutation is literally "set `canViewAmlRestricted: true` on the resolved user context", which in
 *    Sprint 1 removed the AML restriction ENTIRELY (`amlClause()` returned `null` before the
 *    per-waqf list was consulted).
 * 3. **ONE `ExtendedPrismaClient` per request**, from `createPrismaClient(actorCtx)`, never cached
 *    across requests — the grants are baked into it, so reuse hands one caller another's visibility.
 * 4. **ONE clock read per request.** `now` defaults to a single `new Date()` and is the only clock
 *    read; every validity comparison in the request uses it, so a grant cannot be simultaneously
 *    expired and active within one request.
 * 5. **A client-level `Membership` contributes NOTHING** — not a role, and not even read scope. See
 *    {@link resolveGrants}' companion note below (MP-13).
 */

import { randomUUID } from 'node:crypto';

import {
  activeGrantWhere,
  activeMembershipWhere,
  createPrismaClient,
  getBasePrismaClient,
  type ActorContext,
  type ExtendedPrismaClient,
} from '@qmulate/database';
import { resolveOrgAccess, type OrgAccess } from '@qmulate/database';
import { evaluateAuthGate, getServerSession, hasTotpEnrolled, type AuthGate } from '@qmulate/auth';
import { defaultLocale, isLocale, type Locale } from '@qmulate/i18n';
import { roleKeyFromDbRole } from '@qmulate/domain';

import { deriveAmlCompartmentWaqfIds } from './middleware/aml.js';

// NOTE: `auditedWrite` is no longer imported here. `activateGrant()` was this file's only write, and
// since ADR-0008 round 6 it goes through `provisionAccessGrant()` on the provisioning connection —
// see the block at that call site. `auditedWrite` is still the door for every other write in
// `packages/api`; it is simply not one this module opens any more.
import { effectivePermissions, type PermissionString } from './permissions.js';

/**
 * ⚠ THE SHARED PREDICATES, RE-EXPORTED BY IDENTITY, NOT RE-SPELLED (MP-14).
 *
 * `activeGrantWhere()` is defined ONCE, in `@qmulate/database`, and is used by `@qmulate/auth`'s
 * `getUserDbRoles()` and by {@link resolveGrants} below. A test asserts the consumers reach the SAME
 * function object, so deleting `revokedAt: null` from the helper must break every consumer at once.
 *
 * Sprint 1 spelled the four clauses inline in `getUserDbRoles` and, five lines below, filtered
 * memberships on `deletedAt: null` alone — and nothing compared the two. Re-exporting rather than
 * re-deriving is the whole control.
 */
export { activeGrantWhere, activeMembershipWhere };

/** Locale codes accepted on the wire. `@qmulate/i18n`'s `Locale`, re-exported for callers. */
export type RequestLocale = Locale;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Session
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The authenticated principal, when there is one.
 *
 * `null` on {@link TrpcContext.session} means UNAUTHENTICATED. A non-null session with
 * `status: 'totp-enrolment-required'` means authenticated-but-not-cleared: the universal enrolment
 * gate has not been satisfied, and `authedProcedure` refuses it. Folding the gate status in here
 * (rather than adding a separate `gate` field) keeps one question with one answer — "is there a
 * principal, and is it cleared?"
 *
 * Note what is ABSENT: a `role` field. Authorization is per-endowment through `WaqfAccessGrant`
 * (§10 §7.1), never a global role on the user — and a `role` here would be the single most
 * convenient thing in the codebase for a permission check to reach for (MP-12).
 */
/** The organisation access of a caller with no session: nothing. */
const NO_ORG_ACCESS: OrgAccess = {
  userId: '',
  status: 'DISABLED',
  isPrimaryAdmin: false,
  accessLevel: null,
  permissions: new Set(),
};

export interface SessionContext {
  /**
   * The `AuthGate` outcome, narrowed to the two AUTHENTICATED cases.
   *
   * The TOTP enrolment gate is UNIVERSAL (user decision 2026-07-27): every authenticated surface,
   * including read-only and portal seats. An e2e test in `apps/web/e2e/auth-journey.spec.ts` fails
   * if a role-conditional gate is reintroduced, so do NOT make this depend on the caller's roles.
   */
  readonly status: 'authorized' | 'totp-enrolment-required' | 'account-pending' | 'account-disabled';
  readonly userId: string;
  readonly email: string;
  /** better-auth two-factor enrolment state, read structurally via `hasTotpEnrolled`. */
  readonly twoFactorEnabled: boolean;
  /**
   * When the caller last asserted a TOTP factor (D-6). `null` means NO ASSERTION IS KNOWN, and
   * every `approve`/`sign` procedure then DENIES — `null` is never treated as "recent enough".
   *
   * ⚠ WHERE THIS VALUE COMES FROM, STATED HONESTLY. better-auth's `twoFactor` plugin records no
   * "last verified at" anywhere: with 2FA enabled, sign-in returns a `twoFactorRedirect` and NO
   * session, and the session row is created by `verifyTOTP`. So `session.createdAt` IS the instant
   * the factor was asserted — a server-written database column, unforgeable by a caller — and that
   * is what {@link resolveTotpAssertedAt} reads.
   *
   * ⚠ CONSEQUENCE, REPORTED RATHER THAN PAPERED OVER: because `updateAge` refreshes a session
   * WITHOUT a new assertion, `updatedAt` is deliberately NOT used — so a step-up currently requires
   * a fresh SIGN-IN rather than a re-assert prompt. A proper step-up needs an endpoint that stamps
   * the assertion time; that is a product gap, and the wrong "fix" for it is a wider window.
   */
  readonly totpAssertedAt: Date | null;
  /**
   * @deprecated Sprint 1 declared `freshUntil` and never wrote it. Kept so the Sprint-1 type is not
   * a broken import; it is always `null` and nothing reads it. Use {@link totpAssertedAt} plus the
   * `Setting`-driven window — a precomputed expiry instant would bake the window in at session
   * creation and survive a configuration change.
   */
  readonly freshUntil: null;
}

/**
 * Resolves the TOTP assertion instant from a better-auth session record, FAIL-CLOSED.
 *
 * Returns `null` — never a guess, never `now` — when: the user has not enrolled TOTP (nothing was
 * asserted), the record has no usable `createdAt`, or the value is not a valid `Date`.
 *
 * Read structurally rather than through better-auth's inferred types: the plugin set widens the
 * session shape, and a typing change must not be able to turn a security check into a type error
 * that someone silences with a cast.
 */
export function resolveTotpAssertedAt(user: unknown, sessionRecord: unknown): Date | null {
  if (!hasTotpEnrolled(user)) return null;
  if (typeof sessionRecord !== 'object' || sessionRecord === null) return null;
  const raw = (sessionRecord as { createdAt?: unknown }).createdAt;
  const value = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : null;
  if (value === null || Number.isNaN(value.getTime())) return null;
  return value;
}

/**
 * Narrows an `AuthGate` (+ the raw session record) to a {@link SessionContext}.
 *
 * FAILS CLOSED on an unrecognised status: an `AuthGate` variant this build does not know about
 * produces `null` (unauthenticated), so a new gate state cannot become an implicit "authorized".
 * `roles` from the gate is deliberately DISCARDED — it is a union across every grant and membership
 * with no `waqfId` at all, and its own doc says it is a posture helper (MP-12).
 */
export function sessionFromGate(gate: AuthGate, sessionRecord: unknown): SessionContext | null {
  if (
    gate.status !== 'authorized' &&
    gate.status !== 'totp-enrolment-required' &&
    gate.status !== 'account-pending' &&
    gate.status !== 'account-disabled'
  ) {
    return null;
  }

  const user = gate.user as { id?: unknown; email?: unknown };
  const userId = typeof user.id === 'string' ? user.id : null;
  if (userId === null) return null;

  return {
    status: gate.status,
    userId,
    email: typeof user.email === 'string' ? user.email : '',
    twoFactorEnabled: hasTotpEnrolled(gate.user),
    totpAssertedAt: resolveTotpAssertedAt(gate.user, sessionRecord),
    freshUntil: null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Grants
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One ACTIVE `WaqfAccessGrant`, with its permissions already resolved.
 *
 * `permissions` is the EFFECTIVE set — `grant.permissions ∩ preset(role)` via
 * `resolveGrantPermissions` — never the raw column. That column is free text that Sprint 1 shipped
 * as "stored but not yet interpreted", so an already-widened row can exist (written raw, migrated
 * in, or seeded by a PROVISIONAL fixture); intersecting on READ means such a row still grants
 * nothing extra (MP-18).
 */
export interface ResolvedGrant {
  readonly waqfId: string;
  /** The Prisma `Role` enum value, as stored. `role` is write-once at the database (MP-15). */
  readonly role: string;
  /** EFFECTIVE permissions: `grant.permissions ∩ preset(role)`. Never the raw column. */
  readonly permissions: readonly PermissionString[];
  readonly beneficiarySelfId: string | null;
  readonly scopeRefs: readonly string[];
  readonly amlCompartment: boolean;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  /** The grant row id — recorded in the APPROVE audit event so the trail proves the AUTHORITY. */
  readonly grantId: string;
}

/** The provenance stamped into every audit event this request produces. */
export interface AuditActor {
  readonly actorId: string | null;
  readonly actorType: 'USER' | 'SYSTEM' | 'SERVICE';
  /**
   * ⚠ CONFERS ZERO CAPABILITY (MP-36). Free-form today and bound into the audit hash, so a
   * caller-supplied value would become cryptographically sealed evidence of a delegation that may
   * never have existed. NO authority code path in this package reads it — asserted by a source scan
   * — and the approve procedure resolves its checker grant for `actorId`, never for
   * `onBehalfOfId ?? actorId`. The stronger form (refusing to set it without a backing ACTIVE
   * `Delegation` row) needs a model the schema does not have (D-7), so E2 pins it to `null`.
   */
  readonly onBehalfOfId: string | null;
  readonly requestId: string;
  readonly ip?: string;
  readonly userAgent?: string;
  /** tRPC procedure path, e.g. `approval.approve`. Set per call by the ladder. */
  readonly procedure?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The Setting reader
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The narrow port the ladder needs in order to read a `Setting` rather than hardcode a figure.
 *
 * ⚠ THIS IS NOT A SECOND SETTING RESOLVER. The typed, registry-backed resolver over
 * `@qmulate/domain`'s closed `SETTING_SCHEMAS` is `createSettingResolver` in `src/settings.ts`, and
 * EXIT-3 requires exactly one of those.
 *
 * This port returns the RAW stored envelope, and the ladder uses it for exactly one key —
 * `auth.totpStepUp.freshnessSeconds` (D-6) — because a security guard must FAIL CLOSED, and the
 * typed resolver's contract is to THROW (`SETTING_MISSING` / `SETTING_INVALID`) rather than to
 * report absence. A throw mid-guard is an unhandled 500 on a surface whose correct answer is a typed
 * `TOTP_STEP_UP_REQUIRED` denial, and "the deny path depends on catching an exception from the
 * happy-path resolver" is not a shape to build an approval gate on. `readStepUpWindowSeconds`
 * therefore reads through here and maps every unknown to `null`, which every caller treats as DENY.
 *
 * The key IS registered and IS seeded — `@qmulate/domain`'s `SETTING_SCHEMAS` declares it with the
 * `securityWindowSeconds` schema (integer, 1‥86 400) and `packages/database/src/seed/settings.ts`
 * writes the global row.
 *
 * `test/procedure-ladder.test.ts` ("the registry schema and readStepUpWindowSeconds accept EXACTLY
 * the same values") drives eleven candidate `v` values through BOTH validators and asserts they
 * agree on every one, plus that the `seconds` unit is pinned on both sides — so the two
 * hand-written validators cannot drift apart. (This note previously credited
 * `test/setting-resolver.integration.test.ts` with asserting "the three refusals". No such
 * assertion exists there, and there are not three of them; the comment was corrected rather than
 * left naming a test that does not do what it claims.)
 *
 * NO PROCESS-LIFETIME CACHE, EVER. Every `raw()` is a query. EXIT-3's mutation is "hoist the
 * per-request memo to module scope", and it must fail — a fee-basis change has to flow through with
 * no redeploy, which is impossible behind a module-scope cache.
 */
export interface SettingReader {
  /**
   * The raw stored envelope for `key`, resolving ENDOWMENT BEFORE GLOBAL, or `null` when no row
   * exists at any tier. `null` is never a default: every caller must decide what "absent" means,
   * and for a security window it means DENY.
   */
  raw(key: string, waqfId?: string | null): Promise<unknown>;
}

/**
 * The minimal reader, over the caller's own scoped client.
 *
 * `Setting` is classified `allow-global` in the force-filter, so a global row is readable by any
 * authenticated caller and a per-endowment row only by a caller with a grant on that endowment —
 * exactly the visibility this port needs, and one more reason not to reach for the base client.
 */
export function createSettingReader(db: ExtendedPrismaClient): SettingReader {
  return {
    async raw(key: string, waqfId?: string | null): Promise<unknown> {
      if (waqfId !== undefined && waqfId !== null) {
        const override = await db.setting.findFirst({
          where: { key, waqfId, deletedAt: null },
          select: { value: true },
        });
        if (override !== null) return override.value;
      }
      const global = await db.setting.findFirst({
        where: { key, waqfId: null, deletedAt: null },
        select: { value: true },
      });
      return global === null ? null : global.value;
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · TrpcContext
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface TrpcContext {
  /** Correlation id threaded through logs, jobs and audit events for one request. */
  readonly requestId: string;
  /** THE single request-scoped clock read. Engines and guards never read the clock themselves. */
  readonly now: Date;
  readonly locale: RequestLocale;
  /** `null` = unauthenticated. See {@link SessionContext.status} for the gate outcome. */
  readonly session: SessionContext | null;
  /**
   * Every ACTIVE grant the caller holds, re-evaluated on THIS request. Empty means nothing — never
   * everything. There is no cached "logged-in = authorized" state (§10 §7.1).
   */
  readonly grants: readonly ResolvedGrant[];
  /**
   * The organisation layer (migration 55): registration state and the effective ORGANISATION-scope
   * permission set. Resolved for every authenticated principal; an unauthenticated caller holds
   * an empty set. Never a substitute for a grant: endowment data is still reached only through
   * `grants`, and `orgProcedure` is the only rung that reads this.
   */
  readonly org: OrgAccess;
  readonly actor: AuditActor;
  /** ONE `ExtendedPrismaClient` for this request, with the caller's grants baked in. */
  readonly db: ExtendedPrismaClient;
  readonly settings: SettingReader;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * @deprecated Sprint-1 spelling. Use {@link TrpcContext} — `@qmulate/database` also exports a
 * `RequestContext` and the two are different objects (see the file header).
 */
export type RequestContext = TrpcContext;

export interface CreateContextOptions {
  /** The request's headers. `evaluateAuthGate` reads the better-auth session from them. */
  readonly headers: Headers;
  readonly requestId?: string;
  readonly now?: Date;
  readonly locale?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * The subset of {@link TrpcContext} {@link toActorContext} actually reads.
 *
 * Declared so the function is total over a context that does not yet have its `db` — which is the
 * real construction order: the actor context is the INPUT to `createPrismaClient()`. The
 * alternative was a cast at the one call site, and a cast where an authorization object is built is
 * exactly where a field goes missing.
 */
export type ActorContextSource = Pick<
  TrpcContext,
  'requestId' | 'grants' | 'actor' | 'ipAddress' | 'userAgent'
>;

/**
 * Translates a {@link TrpcContext} into the actor context `@qmulate/database` needs.
 *
 * ⚠ EVERY FIELD IS DERIVED. Nothing is passed through from the request:
 *  · `bypass` is NEVER set — there is no code path in this package that produces one (invariant 1).
 *  · `canViewAmlRestricted` is derived from `amlCompartment === true` GRANTS, never from the grant's
 *    own `canViewAmlRestricted` column (whose value the DB CHECK `waqf_access_grant_aml_flags` now
 *    ties to compartment membership anyway) and never from a request field. AC-3's mutation is to
 *    derive it from the wrong one of those two booleans. `amlClause()` no longer reads the field at
 *    all — it is posture only — so this is belt and braces, in the safe direction.
 *  · `authorizedWaqfIds` is EXACTLY the caller's active grants' endowments. A `Membership`
 *    contributes nothing (MP-13).
 *  · `permissions` is the union of the EFFECTIVE (preset-intersected) sets. Absent means nothing.
 */
export function toActorContext(
  ctx: ActorContextSource,
  options: { readonly procedure?: string; readonly reason?: string } = {},
): ActorContext {
  // ⊕ S8-Q2 — ONE derivation, shared with the procedure rung. It used to be a second copy of the
  // filter, and adding the Nazir's by-construction arm to only one of them would have produced a
  // session whose procedure rung admitted the Nazir while this force-filter context still subtracted
  // every restricted row from them: an outage that reads as a working control.
  const amlCompartmentWaqfIds = deriveAmlCompartmentWaqfIds(ctx.grants);

  const permissions = [...new Set(ctx.grants.flatMap((grant) => [...grant.permissions]))];

  const beneficiarySelfIds = [
    ...new Set(
      ctx.grants
        .map((grant) => grant.beneficiarySelfId)
        .filter((value): value is string => value !== null),
    ),
  ];

  return {
    actorId: ctx.actor.actorId,
    actorType: ctx.actor.actorType,
    onBehalfOfId: ctx.actor.onBehalfOfId,
    authorizedWaqfIds: [...new Set(ctx.grants.map((grant) => grant.waqfId))],
    permissions,
    // A guardian case is an EXPLICIT second `beneficiarySelfId` grant (§10 §5), so more than one is
    // representable — but the force-filter pins a session to ONE id. Until it takes a set, the
    // fail-closed reading of "two pins" is the first one, and the narrowing is SURFACED rather than
    // silently widened to "sees both". Deterministic because `resolveGrants` orders by waqfId.
    beneficiarySelfId: beneficiarySelfIds[0] ?? null,
    // DERIVED FROM COMPARTMENT MEMBERSHIP. See the warning above.
    canViewAmlRestricted: amlCompartmentWaqfIds.length > 0,
    amlCompartmentWaqfIds,
    requestId: ctx.requestId,
    ...(ctx.ipAddress !== undefined ? { ip: ctx.ipAddress } : {}),
    ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
    ...(options.procedure !== undefined ? { procedure: options.procedure } : {}),
    ...(options.reason !== undefined ? { reason: options.reason } : {}),
    // NO `bypass`. NO `occurredAtOverride`. NO `role`.
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4b · THE DECLARED SERVICE SEAT'S REQUEST CONTEXT (S10-3b)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Owner rulings.** The seat is a declared NON-HUMAN identity with enumerated minimal permissions,
 * granted on every endowment it sweeps, visible in the access matrix like any seat, its writes
 * audited as SYSTEM-actor acts and **never maker acts** (2026-08-27, S9 third batch); its
 * `actorType` is **`SYSTEM`** with the scoping bypass explicitly OFF (2026-08-28, D1).
 *
 * ── WHY THE WORKER NEEDS ITS OWN FACTORY AND CANNOT REUSE THE SESSION ONE ────────────────────
 * `createContextForSession` PINS `actorType: 'USER'`. That pin is correct and must stay: it is what
 * makes "a request that arrived over HTTP is a person's" true by construction. The seat is the one
 * caller that is legitimately not a person, and it does not arrive over HTTP at all — the memo:
 * *"The worker constructs its context in-process — it must not arrive over HTTP, because rung 1
 * demands an `authorized` session and the TOTP-enrolment gate is universal by the 2026-07-27
 * decision, which a seat cannot satisfy."*
 *
 * ⚠ SO THE DANGEROUS PROPERTY IS NOT "CAN THE SEAT WRITE". IT IS THAT NOTHING ARRIVING OVER HTTP
 * MAY EVER BECOME ONE. That is why this is a SEPARATE function rather than a parameter on the
 * session factory: a `createContextForSession(session, { actorType })` would put the seat's
 * identity one caller-supplied argument away from the request path, and the wire is exactly where
 * an argument can come from. There is no parameter; there are two functions, and the HTTP one has
 * no way to produce this shape. `test/service-seat-request-context.test.ts` asserts that in both
 * directions, and `test/procedure-ladder.test.ts` proves neither is re-exported from `src/index.ts`.
 *
 * ⚠ AND NOTE WHAT IS **NOT** WRITTEN HERE: `bypass`. D1 says the seat's bypass is "explicitly
 * `null` at every construction site", and in `@qmulate/database` it is exactly that — a literal in
 * `makeServiceSeatContext`. In THIS package it is satisfied more strongly, by ABSENCE: invariant 1
 * of this file forbids any code here from assigning `bypass` at all, `toActorContext` states "NO
 * `bypass`" in terms, and `procedure-ladder.test.ts`'s MP-22 scans every file under `src/` for the
 * property. Writing `bypass: null` here to look faithful to the ruling's wording would BREAK that
 * scan and trade a structural guarantee for a literal. The absence IS the explicit choice.
 */
export interface ServiceSeatContextOptions {
  readonly requestId?: string;
  readonly now?: Date;
  readonly locale?: string;
}

/**
 * Builds the in-process request context for the declared service seat.
 *
 * The seat's authority comes from its REAL `WaqfAccessGrant` rows, resolved here exactly as a
 * human's are — so a seat nobody has granted anything to sweeps nothing, and the force filter
 * subtracts every endowment it does not hold. `session` is synthesized as `authorized` because the
 * seat has no better-auth session and never will; the gate it would otherwise face (universal TOTP
 * enrolment) is not a control a non-human identity can satisfy or should be exempted from — it is a
 * control about PEOPLE, and the seat's equivalent is that it cannot arrive over the wire at all.
 */
export async function createServiceSeatContext(
  seatUserId: string,
  options: ServiceSeatContextOptions = {},
): Promise<TrpcContext> {
  if (typeof seatUserId !== 'string' || seatUserId.trim() === '') {
    throw new Error(
      "createServiceSeatContext: the seat's principal id is REQUIRED. An unattributed write into " +
        'an append-only >= 10-year trail is worse than a refused one.',
    );
  }

  const now = options.now ?? new Date();
  const requestId = options.requestId ?? randomUUID();
  const locale: RequestLocale = isLocale(options.locale) ? options.locale : defaultLocale;

  const actor: AuditActor = {
    actorId: seatUserId,
    // ⚠ THE D1 RULING, AND THE ONE LINE THAT DISTINGUISHES THIS FACTORY FROM THE SESSION ONE.
    actorType: 'SYSTEM',
    onBehalfOfId: null,
    requestId,
  };

  // The seat's REAL grants, by the same resolver a human goes through. Not a parameter — a caller
  // that could pass its own grant list would be choosing its own authority.
  const grants = await resolveGrants(getBasePrismaClient(), seatUserId, now);

  const session: SessionContext = {
    status: 'authorized',
    userId: seatUserId,
    email: `${seatUserId}@service.invalid`,
    twoFactorEnabled: false,
    // ⚠ null, and it MUST stay null: D-6 makes every approve/sign procedure DENY on a null
    // assertion rather than treat it as recent enough. The seat asserts no TOTP factor because it
    // has none, so this is the honest value AND a second, independent reason the seat can approve
    // nothing — beside the never-maker guard and the preset that gives it no approval verb.
    totpAssertedAt: null,
    // Deprecated Sprint-1 field, always null and read by nothing.
    freshUntil: null,
  };

  const db = createPrismaClient(toActorContext({ requestId, grants, actor }));

  return {
    requestId,
    now,
    locale,
    session,
    grants,
    // A service seat is not a person: it holds no organisation access (migration 55).
    org: NO_ORG_ACCESS,
    actor,
    db,
    settings: createSettingReader(db),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Grant resolution
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The columns grant resolution needs. Narrow on purpose — nothing here needs `dataScopes`. */
const GRANT_SELECT = {
  id: true,
  waqfId: true,
  role: true,
  permissions: true,
  beneficiarySelfId: true,
  scopeRefs: true,
  amlCompartment: true,
  validFrom: true,
  validUntil: true,
} as const;

/** The one delegate shape {@link resolveGrants} needs. Keeps the function unit-testable. */
export interface GrantQueryClient {
  readonly waqfAccessGrant: {
    findMany(args: {
      where: Record<string, unknown>;
      select: typeof GRANT_SELECT;
      orderBy: { waqfId: 'asc' };
    }): Promise<readonly GrantRow[]>;
  };
}

interface GrantRow {
  readonly id: string;
  readonly waqfId: string;
  readonly role: string;
  readonly permissions: readonly string[];
  readonly beneficiarySelfId: string | null;
  readonly scopeRefs: readonly string[];
  readonly amlCompartment: boolean;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}

/**
 * Loads and resolves the caller's ACTIVE grants, as of `asOf`.
 *
 * ── WHY IT READS THROUGH THE UNEXTENDED CLIENT ────────────────────────────────────────────────
 * This runs BEFORE the scoped client exists, and it must: the force-filter is built FROM this
 * answer, so reading grants through it would be circular ("you may see the grants for the endowments
 * your grants let you see"). The `where` is pinned to `userId`, so the query can only ever return
 * the caller's own rows.
 *
 * The validity window is {@link activeGrantWhere}, imported, not restated (MP-14). A revoked,
 * expired or future-dated grant therefore yields nothing, and `authorizedWaqfIds` is `[]`.
 *
 * ── A `Membership` CONTRIBUTES NOTHING (MP-13) ────────────────────────────────────────────────
 * Not a role, and not even read scope. Three reasons, and it is DELIBERATELY stricter than "expand
 * a membership into waqfIds for READ scope only":
 *   1. MP-13 asserts `authorizedWaqfIds === []` for a membership-only caller, and a read expansion
 *      would make that false.
 *   2. `Membership` has NO `revokedAt`, `validFrom` or `validUntil` — only `deletedAt` — so any
 *      reach it conferred would be unexpirable and revocable only by soft-delete. What keeps that
 *      from being an escalation today is the CHECK `membership_role_family_level_only`; relying on
 *      a CHECK for the *shape* of family access is thinner than not conferring reach at all.
 *   3. §10 principle 2: "Scope is the endowment, not the client … never per-family." Family-board
 *      read reach is expressible — and is expressed, in the fixture — as an explicit per-endowment
 *      `FAMILY_BOARD` grant.
 * `activeMembershipWhere()` is still re-exported above so `@qmulate/auth`'s posture helper and the
 * parity tests share the one predicate.
 */
export async function resolveGrants(
  db: GrantQueryClient,
  userId: string,
  asOf: Date,
): Promise<ResolvedGrant[]> {
  const rows = await db.waqfAccessGrant.findMany({
    where: { userId, ...activeGrantWhere(asOf) },
    select: GRANT_SELECT,
    orderBy: { waqfId: 'asc' },
  });

  return rows.map((row) => ({
    grantId: row.id,
    waqfId: row.waqfId,
    role: String(row.role),
    // THE CEILING, APPLIED ON READ (MP-18). An already-widened row grants nothing extra.
    // `roleKeyFromDbRole` is `@qmulate/domain`'s single derivation ('NAZIR' -> 'nazir', with the one
    // documented SYSTEM_ADMIN -> admin exception); an unmapped value returns `undefined` and
    // `resolveGrantPermissions(undefined, …)` is the EMPTY set, so a new `Role` enum value resolves
    // to no permissions rather than to a default.
    permissions: effectivePermissions(roleKeyFromDbRole(row.role), row.permissions),
    beneficiarySelfId: row.beneficiarySelfId,
    scopeRefs: [...row.scopeRefs],
    amlCompartment: row.amlCompartment,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · The factories
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * THE request-context factory. Call it once per request, in the HTTP handler.
 *
 * `requestId` defaults to `crypto.randomUUID()`; `now` defaults to ONE `new Date()` and is the only
 * clock read for the whole request. An unrecognised `locale` falls back to the DEFAULT (Arabic),
 * never to English — Arabic is the default locale, not a fallback (§11).
 *
 * The gate is `evaluateAuthGate(headers)` from `@qmulate/auth`, unconditionally. The TOTP enrolment
 * gate is UNIVERSAL (user decision 2026-07-27); do not reintroduce a role-conditional gate — an
 * e2e test in `apps/web/e2e/auth-journey.spec.ts` fails if you do.
 *
 * ⚠ TWO better-auth SESSION READS PER REQUEST, AND WHY. `AuthGate` carries `user` and `roles` but
 * NOT the session record, and `totpAssertedAt` can only come from the record's `createdAt` (see
 * {@link SessionContext.totpAssertedAt}). Rather than re-implement the gate here — the one thing
 * the brief forbids, because a role-conditional gate is the bug that was just fixed — this calls
 * both and accepts the duplicate read. REPORTED: the fix is for `AuthGate.authorized` to carry the
 * session, which is a change to `packages/auth`.
 */
export async function createContext(options: CreateContextOptions): Promise<TrpcContext> {
  const [gate, sessionRecord] = await Promise.all([
    evaluateAuthGate(options.headers),
    getServerSession(options.headers),
  ]);
  return createContextForSession(sessionFromGate(gate, sessionRecord?.session ?? null), options);
}

/**
 * The half of {@link createContext} below the auth gate: takes an already-resolved
 * {@link SessionContext} and builds the request context around it.
 *
 * ⚠ NOT EXPORTED FROM `src/index.ts`, ON PURPOSE. This is the seam the integration suites use to
 * drive the ladder as a chosen subject without minting signed better-auth cookies. The package's
 * `exports` map publishes only `.`, `./trpc`, `./root`, `./errors` and `./permissions`, so no OTHER
 * package can reach it: the only callers are this module and this package's own tests.
 * `test/procedure-ladder.test.ts` scans `src/index.ts` to prove it is not re-exported, because a
 * one-line barrel edit would turn a test seam into a session-forgery door.
 */
export async function createContextForSession(
  session: SessionContext | null,
  options: Omit<CreateContextOptions, 'headers'> = {},
): Promise<TrpcContext> {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? randomUUID();
  const locale: RequestLocale = isLocale(options.locale) ? options.locale : defaultLocale;

  const actor: AuditActor = {
    actorId: session?.userId ?? null,
    actorType: 'USER',
    // Pinned to null in E2 — see AuditActor.onBehalfOfId (MP-36 / D-7).
    onBehalfOfId: null,
    requestId,
    ...(options.ipAddress !== undefined ? { ip: options.ipAddress } : {}),
    ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
  };

  // Grants are resolved for an authenticated principal whether or not the enrolment gate cleared:
  // `authedProcedure` refuses a `totp-enrolment-required` session outright, so the set is never USED
  // in that case, and resolving it unconditionally keeps ONE code path answering "what may this
  // caller touch". An unauthenticated caller gets `[]`, and the force-filter then matches nothing.
  const [grants, org] =
    session === null
      ? [[], NO_ORG_ACCESS]
      : await Promise.all([
          resolveGrants(getBasePrismaClient(), session.userId, now),
          resolveOrgAccess(getBasePrismaClient(), session.userId),
        ]);

  const source: ActorContextSource = {
    requestId,
    grants,
    actor,
    ...(options.ipAddress !== undefined ? { ipAddress: options.ipAddress } : {}),
    ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
  };

  // ONE client per request (invariant 3). `createPrismaClient` memoizes per CONTEXT OBJECT, and
  // `toActorContext` builds a fresh one here, so nothing is shared with another caller.
  const db = createPrismaClient(toActorContext(source));

  return {
    requestId,
    now,
    locale,
    session,
    grants,
    org,
    actor,
    db,
    settings: createSettingReader(db),
    ...(options.ipAddress !== undefined ? { ipAddress: options.ipAddress } : {}),
    ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · Grant activation — AC-6's SEAM (and nothing more)
 *
 * BR-109 / NFR-09: eligibility is a DATA CONSTRAINT, not UI copy. A nazir or authorized_rep grant
 * for a candidate who is not a KSA resident — or, where the endower is foreign and the asset is real
 * property, not a Saudi national — must be REFUSED at activation, with the failing criterion NAMED
 * and the block AUDITED.
 *
 * ⚠ E2 SHIPS THE SEAM, NOT THE RESOLVER. §17 assigns the pure `eligibilityResolver` to E3/S4, and
 * this file does not build it. What E2 owes is that there is exactly ONE audited door
 * ({@link activateGrant}), that the criterion reaches the caller, and that **the default hook is not a
 * silent pass-through** — because a seam whose default says "yes" is not a seam, it is a hole with a
 * comment next to it. AC-6's mutation is precisely "change the default hook to `() => ({ eligible:
 * true })`", and it must fail.
 *
 * Do NOT claim AC-6 green on the strength of this.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The subject of an eligibility decision. Deliberately identifiers only — no PII travels here. */
export interface GrantActivationCandidate {
  readonly userId: string;
  readonly waqfId: string;
  /** The Prisma `Role` enum value being activated. */
  readonly role: string;
}

/** One named reason activation was refused. The NAME is the deliverable (BR-109: "the failing criterion is NAMED"). */
export interface EligibilityFailure {
  /** A stable machine criterion, e.g. `KSA_RESIDENCY`. Never prose. */
  readonly criterion: string;
  /** Developer-facing detail for the trail. No PII — this lands in an append-only table. */
  readonly detail: string;
}

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly failing?: readonly EligibilityFailure[];
}

export type EligibilityCheck = (
  candidate: GrantActivationCandidate,
) => EligibilityResult | Promise<EligibilityResult>;

/**
 * THE DEFAULT HOOK. It THROWS.
 *
 * ⚠ NOT A PASS-THROUGH, AND NOT `{ eligible: true }`. Until E3 supplies the real resolver, the honest
 * answer to "is this candidate eligible?" is "this system cannot tell" — and for an eligibility
 * constraint that has to mean REFUSE. A default that returned `eligible: true` would make every
 * assertion about BR-109 pass over a system that never checks anything, which is the precise shape of
 * the Sprint-1 failure mode: a claimed enforcement with no implementation.
 */
export const NOT_IMPLEMENTED_ELIGIBILITY_CHECK: EligibilityCheck = (candidate) => {
  throw new Error(
    `eligibility for a ${candidate.role} grant on waqf ${candidate.waqfId} cannot be determined: ` +
      `the eligibility resolver is E3/S4 (§17) and is not implemented. BR-109 makes eligibility a ` +
      `DATA CONSTRAINT, so "cannot determine" refuses. Inject an eligibilityCheck to proceed — and ` +
      `do NOT make the default return { eligible: true }.`,
  );
};

/** Raised when activation is refused. Carries the failing criteria, named. */
export class GrantIneligibleError extends Error {
  readonly code = 'GRANT_INELIGIBLE';
  readonly failing: readonly EligibilityFailure[];

  constructor(candidate: GrantActivationCandidate, failing: readonly EligibilityFailure[]) {
    super(
      `grant activation refused for user ${candidate.userId} on waqf ${candidate.waqfId} as ` +
        `${candidate.role}: ${failing.map((f) => f.criterion).join(', ')}. Eligibility is a data ` +
        `constraint, not UI copy (BR-109 / NFR-09).`,
    );
    this.name = 'GrantIneligibleError';
    this.failing = failing;
  }
}

/**
 * THE ONE AUDITED DOOR through which a `WaqfAccessGrant` becomes active.
 *
 * Order, and why: the eligibility hook runs BEFORE anything is written, so a refusal writes no grant
 * — only the audited block. A grant that existed for the duration of a transaction is a grant that
 * existed.
 *
 * ⚠ WHAT THIS DOES NOT DO. It does not check the CALLER's authority to issue the grant. That is the
 * procedure ladder's job (`admin:access_matrix:write`, enforced by `endowmentScopedProcedure` and,
 * independently, by the force-filter's authorization-plane write policy and the database's
 * `waqf_access_grant_no_self_issue` CHECK). Doing it here as well would be a fourth place the rule
 * lives, and the one most likely to disagree.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ E3+ IMPLEMENTERS — AN API-SHAPE CONSTRAINT, NOT A PERMISSION PROBLEM
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **Write the authorization plane with a DIRECT, TOP-LEVEL delegate operation.** A RELATION-NESTED
 * write into `WaqfAccessGrant`, `Membership` or `ApprovalRequest` is refused, and the refusal is not
 * permission-shaped: it fires for a caller who legitimately holds `admin:access_matrix:write`, and
 * there is no flag, option or context that turns it off. So none of these work, however
 * well-permissioned the caller:
 *
 *   ✗ tx.waqf.update({ where: { id }, data: { accessGrants:     { create: {...} } } })
 *   ✗ tx.user.update({ where: { id }, data: { grants:           { create: {...} } } })
 *   ✗ tx.waqf.update({ where: { id }, data: { approvalRequests: { create: {...} } } })
 *   ✓ tx.waqfAccessGrant.create({ data: {...} })          ← this function
 *
 * Reissue a nested write as the equivalent top-level operation inside the same
 * {@link auditedWrite} block, so the statements still commit together. That is the whole cost.
 *
 * WHY IT IS ABSOLUTE RATHER THAN MERELY STRICT — two independent reasons:
 * (a) C-01: the nested form was a live privilege-escalation path. A beneficiary portal seat holding
 *     only `beneficiary:beneficiary:write` minted itself an ACTIVE `NAZIR` grant through
 *     `user.update({ data: { grants: { create: … } } })` and then approved a `BANK_MOVEMENT`. Every
 *     downstream layer accepted the forged seat because the row is genuine and well-formed.
 * (b) AUDITABILITY, which is the half that makes it unconditional: the audit spine records the
 *     PARENT row's before/after image and never names the child, so a nested grant is invisible in
 *     the trail EVEN WHEN IT IS AUTHORIZED. An access-matrix change nobody can review is not an
 *     access-matrix change anybody should be able to make.
 *
 * ⚠ WHERE THE ENFORCEMENT LIVES, AND WHAT THIS FILE MAY CLAIM ABOUT IT. Both halves are enforced in
 * `packages/database`'s extensions (the authorization walk in `extensions/scoping.ts`, the
 * auditability walk in `extensions/audit.ts`) and are proven by THAT package's own suites. This
 * comment deliberately names neither function nor test: an earlier version named
 * `assertNestedRelationWrite`, which does not exist, and credited a test in this package that does
 * not drive the nested form. What THIS package's suite proves is the other half — that the
 * legitimate top-level path works end to end (`test/grant-activation.integration.test.ts`).
 *
 * ⚠ NEITHER WALK SURVIVES RAW SQL, AND THAT IS WHY THE CLOSURE IS A PRIVILEGE.
 * `$executeRawUnsafe` on the caller's own scoped client is not intercepted by any Prisma extension,
 * so for all of Sprint 2 an insider with application-database credentials could insert a grant row
 * directly — ADR-0008's central finding.
 *
 * ADR-0008 round 6 closed that route by taking the privilege away rather than by adding a check: the
 * runtime role holds NO INSERT/UPDATE/DELETE on `waqf_access_grant` and owns no table, so the same
 * statement is now `42501 permission denied for table waqf_access_grant` — MEASURED end to end in
 * `packages/database/test/authorization-plane-privilege.integration.test.ts`. The one legitimate write
 * moved to `provisionAccessGrant()` on a separate credential (see the block at that call site below).
 *
 * ⚠ WHAT IS **NOT** CLOSED, so nothing here is quoted as more than it is: whoever holds
 * `ACCESS_MATRIX_DATABASE_URL` can still forge the same chain (pinned as a passing attack), raw
 * unaudited writes to ORDINARY audited tables are untouched, and which credential a deployed service
 * actually holds is a deployment fact. The hard gate stands: no real client data yet.
 */
export async function activateGrant(
  ctx: TrpcContext,
  candidate: GrantActivationCandidate,
  input: {
    readonly permissions: readonly string[];
    /**
     * @deprecated ACCEPTED AND IGNORED. The issuer is `ctx.actor.actorId`, always — see the
     * `grantedByUserId` comment on the `create` below. Kept in the type so an existing caller does
     * not silently start passing an argument nothing reads; a future cleanup may remove it.
     */
    readonly grantedByUserId?: string;
    readonly validFrom: Date;
    readonly validUntil?: Date | null;
    readonly beneficiarySelfId?: string | null;
    readonly amlCompartment?: boolean;
  },
  options: { readonly eligibilityCheck?: EligibilityCheck } = {},
): Promise<{ readonly grantId: string }> {
  const check = options.eligibilityCheck ?? NOT_IMPLEMENTED_ELIGIBILITY_CHECK;
  const result = await check(candidate);

  if (!result.eligible) {
    const failing = result.failing ?? [
      {
        criterion: 'UNSPECIFIED',
        detail: 'the eligibility check refused without naming a criterion',
      },
    ];
    // THE BLOCK IS AUDITED. "Eligibility is a data constraint, not UI copy" cuts both ways: a refusal
    // nobody can review is not an enforcement either. Outside any transaction, for the same reason
    // every other boundary denial is.
    const { recordEvent } = await import('@qmulate/database');
    await recordEvent(toActorContext(ctx, { procedure: 'grant.activate' }), {
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      classification: 'SENSITIVE',
      entityType: 'WaqfAccessGrant',
      entityId: `${candidate.userId}@${candidate.waqfId}`,
      waqfId: candidate.waqfId,
      extraContext: {
        code: 'GRANT_INELIGIBLE',
        role: candidate.role,
        failing: failing.map((f) => f.criterion),
        reason: failing.map((f) => `${f.criterion}: ${f.detail}`).join('; '),
      },
    }).catch(() => {
      // The refusal stands whether or not the trail write succeeded — see recordProcedureDenial.
    });

    throw new GrantIneligibleError(candidate, failing);
  }

  // ⚠ THE WRITE TRAVELS THE PROVISIONING CONNECTION, NOT `ctx.db`  (ADR-0008 round 6).
  //
  // It used to be `auditedWrite(ctx.db, tx => tx.waqfAccessGrant.create(…))` — i.e. the same database
  // role, and therefore the same privilege, that ADR-0008's reproduction used to forge a `NAZIR` seat
  // through `$executeRawUnsafe` on its own scoped client. The runtime role now holds **no INSERT on
  // `waqf_access_grant` at all** (migration 10), so that call would fail with
  // `42501 permission denied for table waqf_access_grant` — which is the point: THE ONLY WAY TO MINT A
  // SEAT IS THIS DOOR.
  //
  // What did NOT change:
  //   • every app-layer check above still runs, in this procedure, on this context;
  //   • `provisionAccessGrant()` builds its client from THIS ctx, so the scoping extension's write
  //     policy, the force filter and the column gate evaluate identically;
  //   • `waqf_access_grant_admission` is fully live on the provisioning connection — the row is
  //     admitted only because `ctx.actor.actorId` holds an ESTABLISHED `admin:access_matrix:write`
  //     grant on `candidate.waqfId`. The provisioner owns nothing, so it cannot suspend that trigger
  //     (MEASURED: 42501 must be owner of table waqf_access_grant).
  //   • the issuer is still the SESSION and never the payload — `input.grantedByUserId` stays
  //     accepted-and-ignored, and `AccessGrantInput` has no such field to pass it into.
  //
  // What DID change, and is a constraint on future callers: the grant now commits in its own
  // transaction on its own connection, so it can no longer be atomic with anything else in a caller's
  // block. That costs nothing today (this always opened its own `auditedWrite`), and
  // `provisionAccessGrant()` THROWS if it is ever called inside one rather than silently splitting.
  const { provisionAccessGrant } = await import('@qmulate/database');
  return provisionAccessGrant(toActorContext(ctx, { procedure: 'grant.activate' }), {
    userId: candidate.userId,
    waqfId: candidate.waqfId,
    role: candidate.role,
    permissions: input.permissions,
    validFrom: input.validFrom,
    validUntil: input.validUntil ?? null,
    amlCompartment: input.amlCompartment ?? false,
    beneficiarySelfId: input.beneficiarySelfId ?? null,
  });
}
