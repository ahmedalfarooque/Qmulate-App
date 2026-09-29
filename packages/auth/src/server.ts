/**
 * packages/auth/src/server.ts — the better-auth server instance.
 *
 * Self-hosted better-auth (no third-party identity provider — NFR-06), backed by the
 * Prisma adapter over `@qmulate/database`. Email + password with the **twoFactor (TOTP)**
 * plugin; issuer `QMULATE`.
 *
 * Rules this file exists to hold:
 *   - Secrets are read through `@qmulate/config/env` (zod-validated, fail-fast), never
 *     from `process.env` directly. The app refuses to boot without DATA_CLASSIFICATION.
 *   - The Prisma client comes from `@qmulate/database`, never from `@prisma/client` —
 *     the direct import skips the audit / scoping / field-encryption extensions.
 *   - Authorization is NOT on `User`. There is no `user.role` column: every grant is
 *     per-endowment (`WaqfAccessGrant`) plus a client-level `Membership`. Roles are read,
 *     never written, here.
 *
 * This module is server-only. Importing it into a client bundle would drag in the Prisma
 * client and the server env schema — use `@qmulate/auth/client` there.
 */

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';

import { serverEnv } from '@qmulate/config/env';
import { activeGrantWhere, activeMembershipWhere, getBasePrismaClient } from '@qmulate/database';

import { authRateLimitOptions } from './rate-limit';
import { isDevAdminExempt } from './dev-admin';
import { sendEmailOtp } from './email-otp';
import { type RoleKey, isRoleKey, requiresTotpForDbRole, roleKeyFromDbRole } from './roles';

/* ───────────────────────────────────────────────────────────────────────────────────────
 * Session windows
 *
 * NFR-06 sets an idle ceiling of 30 minutes for money-movement and filing roles. The E0
 * contract's illustrative better-auth block instead showed an 8-hour `expiresIn`, which
 * cannot satisfy that ceiling. Per the sprint rule (implement the safest option, surface
 * the question) this ships the SLIDING IDLE window: the session dies
 * `SESSION_IDLE_MINUTES` after the last refresh, and `updateAge` refreshes it at a third
 * of that. The value is configurable (`SESSION_IDLE_MINUTES`), never a hardcoded constant.
 * ─────────────────────────────────────────────────────────────────────────────────────── */

// TODO(surface): SCOPE/SECURITY — the E0 contract specified expiresIn = 8h, updateAge = 1h;
// NFR-06 specifies a ≤30-minute idle timeout for money/filing roles. Those are different
// policies and both cannot hold. We implement the stricter one (sliding idle from
// SESSION_IDLE_MINUTES, default 30) and additionally leave the door open to a longer
// window for read-only seats. Confirm the intended policy — and whether it should differ
// per role — before production.

/** Read lazily — see {@link getAuth}: touching the env schema at module scope would make
 *  `next build` demand runtime secrets just to collect route metadata. */
function idleSeconds(): number {
  return serverEnv.SESSION_IDLE_MINUTES * 60;
}

/** Step-up window: how recently a TOTP must have been asserted to count as "fresh". */
export const STEP_UP_FRESH_AGE_SECONDS = 60 * 10;

/**
 * better-auth owns the identity tables (`user`/`session`/`account`/`verification`/`two_factor`),
 * none of which are endowment-scoped — so it must NOT run through the per-request scoping and
 * audit extensions. Those extensions exist to force a `waqfId` filter and to write an
 * `audit_event` per material write; applied here they would filter out rows better-auth needs
 * and flood the audit chain with a row per session refresh.
 *
 * TODO(surface): §12 requires TOTP enrolment and the last-challenge time to be audited
 * (`AuditCategory.AUTH`). That belongs on better-auth's lifecycle hooks, not on a blanket Prisma
 * extension — wire it in S2/E2 alongside the tRPC context.
 */
const authPrisma = getBasePrismaClient();

function buildAuth() {
  /**
   * ── THE RATE-LIMIT POSTURE IS STATED, NOT INHERITED (S7, owner-approved 2026-08-19) ──────
   *
   * Before this, no `rateLimit` option was passed at all, so the posture was whichever default
   * better-auth derived from `NODE_ENV` — MEASURED as ON under `production` and OFF under both
   * `test` and `development`, which meant the same `next start` command was rate-limited
   * locally and unlimited in CI. `./rate-limit.ts` carries the measurements, the built-in
   * per-path rules that `window`/`max` do not govern, and the two conditions the test-only
   * relaxation requires. It is a SECURITY control, so it fails closed: absent variable ⇒ full
   * limiting.
   */
  const rateLimit = authRateLimitOptions();

  if (rateLimit.relaxedForTests) {
    // Loud, once (buildAuth is memoised by `getAuth`), and impossible to mistake in a log.
    // If this line ever appears in a deployed environment's output, that environment is
    // misconfigured — which is precisely why it is printed rather than merely true.
    console.warn(
      '⚠ AUTH RATE LIMITING IS RELAXED — TEST_ONLY_DISABLE_AUTH_RATE_LIMIT is set AND ' +
        "DATA_CLASSIFICATION is 'fixture-only'. This is legal ONLY in a test harness. " +
        'If you are reading this in a deployed log, the deployment is misconfigured.',
    );
  }

  return betterAuth({
    database: prismaAdapter(authPrisma, { provider: 'postgresql' }),
    baseURL: serverEnv.BETTER_AUTH_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,

    rateLimit: { enabled: rateLimit.enabled, window: rateLimit.window, max: rateLimit.max },

    emailAndPassword: {
      enabled: true,
      // E0 only. Email verification needs a mail transport that does not exist yet; it is a
      // pre-production requirement, not a permanent exemption.
      requireEmailVerification: false,
    },

    session: {
      expiresIn: idleSeconds(),
      updateAge: Math.max(60, Math.floor(idleSeconds() / 3)),
      freshAge: STEP_UP_FRESH_AGE_SECONDS,
    },

    /**
     * ── THE DEV-ADMIN SIGN-IN CHALLENGE BYPASS (fixture-only, one account) ──────────────────
     * better-auth runs the root `hooks.after` BEFORE every plugin's after-hooks
     * (`dist/api/dispatch.mjs`: the user handler is pushed first, plugin hooks after). The
     * twoFactor plugin's sign-in hook decides whether to swap the fresh session for a 2FA
     * challenge by reading `ctx.context.newSession.user.twoFactorEnabled`. For the ONE account
     * `isDevAdminExempt` names — and only under `DATA_CLASSIFICATION=fixture-only` — this clears
     * that flag on the in-flight session object, so the plugin's own early return keeps the
     * session. The database row is untouched (the account stays enrolled), every other account
     * is challenged exactly as before, and with the variable absent this hook is a no-op.
     */
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return;
        const pending = ctx.context.newSession;
        if (!pending || !isDevAdminExempt(pending.user.email)) return;
        (pending.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled = false;
      }),
    },

    plugins: [
      twoFactor({
        issuer: 'Cumulate App',
        totpOptions: { digits: 6, period: 30 },
        otpOptions: {
          digits: 6,
          period: 5,
          allowedAttempts: 5,
          storeOTP: 'hashed',
          sendOTP: sendEmailOtp,
        },
      }),
    ],

    // NOTE (deviation from the E0 contract, deliberate): the contract showed
    // `advanced.database.generateId = false`, i.e. "let Prisma generate the id". The shipped
    // schema declares `model User { id String @id }` with **no** `@default`, and likewise for
    // Session/Account/Verification/TwoFactor — so nothing would generate one and every insert
    // would fail. better-auth's own id generation is therefore left ON.
  });
}

export type Auth = ReturnType<typeof buildAuth>;

let authInstance: Auth | undefined;

/**
 * The better-auth instance, constructed on first use.
 *
 * Construction reads `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` through the fail-fast env schema,
 * so building it at module scope would make `next build` demand runtime secrets just to collect
 * page data — a build must not need production credentials. Memoised, so every caller shares one
 * instance (and therefore one Prisma pool).
 */
export function getAuth(): Auth {
  authInstance ??= buildAuth();
  return authInstance;
}

/**
 * Convenience façade over {@link getAuth} for call sites that read like `auth.api.…`.
 * Property access is what triggers construction — importing this binding does not.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, property, receiver) {
    return Reflect.get(getAuth() as object, property, receiver) as unknown;
  },
  has(_target, property) {
    return Reflect.has(getAuth() as object, property);
  },
  ownKeys() {
    return Reflect.ownKeys(getAuth() as object);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(getAuth() as object, property);
  },
});

/** Read the current session from a request's headers. `null` when unauthenticated. */
export async function getServerSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

/**
 * Session and user types are derived from the endpoint's own return type rather than from
 * `auth.$Infer`, so a plugin that widens the session (twoFactor already does) can never
 * drift from what callers actually receive.
 */
export type Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
export type AuthUser = Session['user'];

/**
 * True once the user has completed TOTP enrolment.
 * Read structurally: `twoFactorEnabled` is contributed by the twoFactor plugin, and we do
 * not want a plugin-typing change to turn a security check into a type error.
 */
export function hasTotpEnrolled(user: unknown): boolean {
  return (
    typeof user === 'object' &&
    user !== null &&
    (user as { twoFactorEnabled?: unknown }).twoFactorEnabled === true
  );
}

/**
 * Every role the user holds, across per-endowment grants and client-level memberships.
 *
 * Returns product-vocabulary `RoleKey`s. Since the 2026-07-27 role decision the Prisma enum
 * and §10's catalogue are the same thirteen, so nothing is normally dropped — but a DB value
 * with no mapping still silently would be. For any SECURITY decision use
 * `userRequiresTotpEnrolment`, which evaluates the raw DB values and fails safe.
 */
export async function getUserRoleKeys(userId: string): Promise<RoleKey[]> {
  const dbRoles = await getUserDbRoles(userId);
  const keys = new Set<RoleKey>();
  for (const dbRole of dbRoles) {
    const key = roleKeyFromDbRole(dbRole);
    if (key !== undefined && isRoleKey(key)) keys.add(key);
  }
  return [...keys];
}

/**
 * The raw `Role` enum values held by the user (grants + memberships), de-duplicated.
 *
 * ── THE VALIDITY PREDICATE IS IMPORTED, NOT WRITTEN HERE (MP-14) ──────────────────────────
 * `activeGrantWhere()` and `activeMembershipWhere()` come from `@qmulate/database`, which is the
 * ONE definition every consumer shares — this function, and `packages/api`'s request-context
 * factory. Sprint 1 had the four grant clauses inline HERE and, five lines below, filtered
 * memberships on `deletedAt: null` alone. Nothing compared the two, and nothing tied either to
 * the context factory that would be written later. Deleting `revokedAt: null` from the shared
 * helper must now break every consumer at once, which is the property that makes this a control
 * rather than a coincidence.
 *
 * The asymmetry between the two predicates is REAL and is documented at
 * `activeMembershipWhere()`: `Membership` has no `revokedAt` / `validFrom` / `validUntil` columns
 * at all. What stops that from being an escalation is the CHECK constraint
 * `membership_role_family_level_only` — a client-level row can only ever be `FAMILY_BOARD`.
 *
 * ⚠ THIS IS A POSTURE HELPER, NOT AN AUTHORIZER. It takes NO `waqfId`, so
 * `roles.includes('nazir')` over its output would confer authority on every endowment the user
 * touches (MP-12). Any authority decision must be a per-waqf grant lookup.
 */
export async function getUserDbRoles(userId: string): Promise<string[]> {
  // ONE clock read for the whole function, so the grant and membership queries cannot disagree
  // about "now" — and so a replayed audit can reason about a single instant.
  const now = new Date();
  const [grants, memberships] = await Promise.all([
    authPrisma.waqfAccessGrant.findMany({
      where: { userId, ...activeGrantWhere(now) },
      select: { role: true },
    }),
    authPrisma.membership.findMany({
      where: { userId, ...activeMembershipWhere() },
      select: { role: true },
    }),
  ]);

  return [...new Set([...grants, ...memberships].map((row) => String(row.role)))];
}

/**
 * Re-exported so `packages/api`'s context factory and the parity tests reach the SAME function
 * object rather than two look-alike literals. The definition lives in `@qmulate/database` because
 * the dependency direction is `auth -> database`, never the reverse.
 */
export { activeGrantWhere, activeMembershipWhere };

/**
 * True when the user holds at least one role for which TOTP enrolment is mandatory. Evaluated
 * on the RAW enum values so an unmapped role can never create a TOTP-exempt seat.
 *
 * ⚠ NOTE (2026-07-27): this is **no longer the enrolment gate** — `evaluateAuthGate` now gates
 * EVERY authenticated user, role or no role. This predicate survives because "which roles make
 * TOTP mandatory" is still a real policy question for step-up (`TOTP_STEP_UP_ACTIONS`) and for
 * reporting on a seat's posture. Do not reintroduce it as the gate condition: see
 * `evaluateAuthGate` for why.
 */
export async function userRequiresTotpEnrolment(userId: string): Promise<boolean> {
  const dbRoles = await getUserDbRoles(userId);
  return dbRoles.some(requiresTotpForDbRole);
}

/** What a gated page should do with the current request. */
export type AuthGate =
  | { status: 'unauthenticated' }
  | { status: 'totp-enrolment-required'; user: AuthUser }
  | { status: 'authorized'; user: AuthUser; roles: RoleKey[] };

/**
 * The single gate every authenticated surface calls.
 *
 * ── TOTP ENROLMENT IS UNIVERSAL (user decision, 2026-07-27) ───────────────────────────────
 * **No authenticated surface is reachable until the account has enrolled TOTP.** Not the
 * dashboard, not the portal, not a read-only seat.
 *
 * This replaced a role-conditional gate, and the reason is worth keeping. The old condition was
 * `!enrolled && userRequiresTotpEnrolment(user.id)`, i.e. gate only those holding a
 * TOTP-mandatory role. A freshly-registered account holds no grant and no membership, therefore
 * no role, therefore the gate did not fire — so a brand-new user walked straight into the app
 * shell while the sign-up screen was telling them, in both languages:
 *
 *     "Two-factor verification is required for this role.
 *      You cannot reach the application until it is enabled."
 *
 * The screen was right and the code was wrong. A gate that depends on already having been
 * granted something is also backwards for onboarding: the window in which an account has no
 * role is exactly the window before anyone has vetted it.
 *
 * Consequence, stated plainly: enrolling TOTP is now part of registration for everyone,
 * including Phase-2 portal users (`family_board`, `beneficiary`). That is a deliberate
 * tightening, not an oversight — see the deviations table in `docs/product/prd/BUILD-PLAN.md`.
 *
 * `userRequiresTotpEnrolment` is intentionally NOT consulted here any more. It remains the
 * policy predicate for step-up and posture reporting.
 */
export async function evaluateAuthGate(headers: Headers): Promise<AuthGate> {
  const session = await getServerSession(headers);
  if (session === null) return { status: 'unauthenticated' };

  const { user } = session;
  // The ONE carve-out, fail-closed: `isDevAdminExempt` is false unless DATA_CLASSIFICATION is
  // `fixture-only` AND DEV_ADMIN_EMAIL names exactly this address — see `./dev-admin.ts`.
  if (!hasTotpEnrolled(user) && !isDevAdminExempt(user.email)) {
    return { status: 'totp-enrolment-required', user };
  }

  return { status: 'authorized', user, roles: await getUserRoleKeys(user.id) };
}
