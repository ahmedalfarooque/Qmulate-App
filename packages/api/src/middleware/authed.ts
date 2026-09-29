/**
 * Rung 1 of the ladder: `authedProcedure`.
 *
 * §10 §7.2: "better-auth session valid; sets `ctx.user`". Two refusals, both fail-closed:
 *
 *   · no session at all                  → `UNAUTHENTICATED`  (tRPC `UNAUTHORIZED`)
 *   · session, enrolment gate not passed → `TOTP_ENROLMENT_REQUIRED`  (tRPC `FORBIDDEN`)
 *
 * ── THE ENROLMENT GATE IS UNIVERSAL ──────────────────────────────────────────────────────────
 * User decision, 2026-07-27: **no authenticated surface is reachable until the account has enrolled
 * TOTP** — not the dashboard, not the portal, not a read-only seat. This middleware therefore looks
 * at `session.status` and NEVER at the caller's roles. The gate that preceded it was
 * role-conditional (`userRequiresTotpEnrolment`), which meant a freshly-registered account holding
 * no grant and therefore no role walked straight past it. `apps/web/e2e/auth-journey.spec.ts` fails
 * if a role-conditional gate is reintroduced.
 *
 * ── WHAT THIS RUNG DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────
 * It does not decide anything about authority. There is no role lookup here, no
 * `getUserRoleKeys()`, no `getUserDbRoles()` — both union roles across every grant and membership
 * with NO `waqfId` parameter, so `roles.includes('nazir')` over either would confer approval on
 * every endowment the user touches (MP-12). Authority is resolved per endowment, one rung down.
 *
 * ── WHERE THE MIDDLEWARE ITSELF LIVES ────────────────────────────────────────────────────────
 * This file holds the DECISION ({@link assertAuthed}); `src/trpc.ts` wires it into a tagged tRPC
 * middleware. The split is not cosmetic: `t.middleware()` lives in `trpc.ts`, and importing `trpc.ts`
 * from here would be a runtime import cycle (`trpc.ts` imports this file). Keeping the decision as a
 * plain function also means it can be asserted directly, with no tRPC caller and no database.
 */

import { ApiError } from '../errors.js';

import type { SessionContext, TrpcContext } from '../context.js';

/** The context an authed procedure sees: `session` is proven non-null by the middleware. */
export interface AuthedContext extends TrpcContext {
  readonly session: SessionContext & { readonly status: 'authorized' };
}

/**
 * Narrows a context to {@link AuthedContext} or throws.
 *
 * Exported and unit-tested separately from the middleware so the refusal can be asserted without a
 * tRPC caller, and so there is exactly one implementation of the decision.
 *
 * FAIL CLOSED: the check is `status === 'authorized'`, an allow-list of one. A future `AuthGate`
 * variant that reaches here — or a hand-built session object with a mistyped status — is refused
 * with `GATE_NOT_CLEARED` rather than admitted.
 */
export function assertAuthed(ctx: TrpcContext): AuthedContext {
  const { session } = ctx;

  if (session === null) {
    throw new ApiError(
      'UNAUTHENTICATED',
      'no better-auth session on this request. Every domain read and write resolves through a ' +
        'WaqfAccessGrant, and there is no ambient "logged-in can read" tier (§10 principle 1).',
    );
  }

  if (session.status === 'totp-enrolment-required') {
    throw new ApiError(
      'TOTP_ENROLMENT_REQUIRED',
      'the account has not enrolled TOTP. The enrolment gate is UNIVERSAL (user decision ' +
        '2026-07-27): no authenticated surface is reachable without it, including read-only and ' +
        "portal seats. Do not make this conditional on the caller's roles — the window in which " +
        'an account holds no role is exactly the window before anyone has vetted it.',
      { userId: session.userId },
    );
  }

  if (session.status !== 'authorized') {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `unrecognised auth-gate status ${JSON.stringify(String(session.status))}. An unmapped gate ` +
        `state DENIES: this follows requiresTotpForDbRole's precedent that an unmapped value is ` +
        `treated as the restricted case.`,
    );
  }

  return { ...ctx, session: { ...session, status: 'authorized' } };
}
