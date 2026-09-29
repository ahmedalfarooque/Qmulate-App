/**
 * Rung 2 of the ladder: `endowmentScopedProcedure(permission)` / `waqfScoped(permission)`.
 *
 * §10 §7.2, verbatim: "input MUST carry `waqfId`; loads the caller's active `WaqfAccessGrant` for
 * that `waqfId`; asserts the grant contains `permission`; injects `ctx.grant` (role, permissions,
 * beneficiarySelfId, scopeRefs, amlCompartment). **No grant → NOT_FOUND (not FORBIDDEN — do not
 * disclose the endowment exists).**"
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUR THINGS THIS RUNG MUST GET RIGHT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. **`permission` IS REQUIRED AT THE TYPE LEVEL** (MP-34). §7.2: "A domain procedure is
 *    *unwritable* without declaring its endowment scope and required permission — the type system
 *    makes the check non-optional." If it were optional, every procedure that omitted it would
 *    silently degrade to "any active grant on this endowment can do this" — which is exactly what
 *    the Prisma force-filter already does, so the mistake would be invisible in behaviour AND
 *    consistent across both layers. `test/procedure-ladder.test.ts` carries a `@ts-expect-error` on
 *    a zero-argument call, and `tsc` fails the build if that directive stops being needed.
 * 2. **THE LOOKUP IS PARAMETERISED BY THE TARGET `waqfId`.** `ctx.grants.find(g => g.waqfId === …)`
 *    — never "does this caller hold role X anywhere". A NAZIR on endowment A holds nothing on B
 *    (§10 principle 2, MP-08).
 * 3. **NO GRANT ⇒ `NOT_FOUND`, NEVER `FORBIDDEN`.** AC-1's and EXIT-1's mutations are precisely
 *    "change the throw to FORBIDDEN" and "fall back to `ctx.grants[0]` when no grant matches".
 * 4. **THE DENIAL IS AUDITED, AT THIS BOUNDARY, OUTSIDE ANY TRANSACTION.** Read denials produce no
 *    event in the force-filter by design (see `middleware/audit.ts`), so this is the only path that
 *    records them.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT HERE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * No role predicate of any kind. The check is `permission ∈ grant.permissions`, where
 * `grant.permissions` is already `stored ∩ preset(role)` — so a `finance` grant carrying a
 * hand-appended `distribution:run:approve` resolves to nothing extra (MP-18), and a grant whose role
 * has no preset resolves to the empty set (MP-20).
 */

import { z } from 'zod';

import { ApiError, noGrant, permissionDenied } from '../errors.js';
import { hasPermissionInGrant, type PermissionString } from '../permissions.js';
import { recordProcedureDenial } from './audit.js';

import type { ResolvedGrant } from '../context.js';
import type { AuthedContext } from './authed.js';

/**
 * The input shape every endowment-scoped procedure must carry.
 *
 * `min(1)` because an empty string would match nothing and produce a confusing NOT_FOUND rather than
 * a validation error; `max(64)` because ids are cuids or the fixture's `waqf-\d+` grammar, and an
 * unbounded string on an authorization key is a needless surface.
 */
export const waqfScopedInput = z.object({
  waqfId: z.string().min(1).max(64),
});

export type WaqfScopedInput = z.infer<typeof waqfScopedInput>;

/** The context a scoped procedure sees: the resolved grant for the requested endowment. */
export interface ScopedContext extends AuthedContext {
  /** The caller's ACTIVE grant for `input.waqfId`, with permissions already narrowed to the preset. */
  readonly grant: ResolvedGrant;
  /** The endowment this call is about. Echoed from input, after the grant proved it is reachable. */
  readonly waqfId: string;
  /** The permission this procedure demanded, for the audit trail and the rungs below. */
  readonly permission: PermissionString;
}

/**
 * Resolves the caller's grant for `waqfId` and asserts it carries `permission`.
 *
 * Two DIFFERENT refusals, and the difference is the whole non-disclosure design:
 *  · **no active grant on this endowment** ⇒ `NO_GRANT` ⇒ `NOT_FOUND`. The caller learns nothing
 *    about whether the endowment exists.
 *  · **a grant, but without this verb** ⇒ `PERMISSION_DENIED` ⇒ `FORBIDDEN`. Existence is already
 *    disclosed by the grant itself, so there is nothing left to protect and a precise error is more
 *    useful than a misleading one.
 *
 * Exported separately from the middleware so both refusals can be asserted without a tRPC caller.
 */
export function resolveScope(
  ctx: AuthedContext,
  waqfId: string,
  permission: PermissionString,
): ScopedContext {
  // THE TARGET ENDOWMENT, NOT "ANY ENDOWMENT". `ctx.grants` was re-evaluated on THIS request against
  // the shared `activeGrantWhere()` predicate, so a revoked / expired / future-dated grant is already
  // absent. No fallback, no `?? ctx.grants[0]`, no "the caller only has one grant so it must be this
  // one" — EXIT-1's mutation is exactly that fallback.
  const candidates = ctx.grants.filter((candidate) => candidate.waqfId === waqfId);

  if (candidates.length === 0) throw noGrant(waqfId, permission);

  // ── A CALLER MAY HOLD MORE THAN ONE GRANT ON ONE ENDOWMENT, AND §10 §4.2 SAYS SO ─────────────
  // "A user who legitimately holds both `finance` and `nazir` grants on the same endowment (small
  // teams)…" — and `WaqfAccessGrant` is unique on `(userId, waqfId, role)`, so two seats on one
  // endowment is a normal, representable state. Picking `candidates[0]` would therefore make the
  // outcome depend on ROW ORDER: the AC-4 subject would be refused `approval:request:approve` because
  // their FINANCE grant happened to sort first, and the refusal would look like a working authority
  // check while actually being an ordering accident.
  //
  // So the grant selected is the one that CARRIES the demanded permission. That is not a widening:
  // every candidate's `permissions` is already `stored ∩ preset(role)`, so the caller can only reach a
  // verb some seat they genuinely hold confers. And selecting by permission — rather than unioning
  // into a synthetic grant — is what keeps ATTRIBUTION correct: `ctx.grant.grantId` and
  // `ctx.grant.role` name the seat that actually conferred the authority, which is what the APPROVE
  // audit event records (MP-32). A union would record "some grant of theirs".
  const grant = candidates.find((candidate) => hasPermissionInGrant(candidate, permission));

  if (grant === undefined) {
    throw permissionDenied(
      waqfId,
      permission,
      candidates.map((candidate) => candidate.role).join('+'),
    );
  }

  return { ...ctx, grant, waqfId, permission };
}

/**
 * Reads and validates the `waqfId` an endowment-scoped procedure must carry.
 *
 * A scoped procedure whose input has no `waqfId` is a BUILD error, not a caller error — but it must
 * still DENY rather than fall through to an unscoped query, so the refusal is `NO_GRANT`
 * (`NOT_FOUND`) rather than a validation message that would disclose the procedure's shape.
 */
export function requireWaqfIdInput(input: unknown, path: string): string {
  const parsed = waqfScopedInput.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(
      'NO_GRANT',
      `procedure ${path} is endowment-scoped but its input carries no usable waqfId. §10 §7.2: the ` +
        `input MUST carry waqfId. Refused as NO_GRANT (NOT_FOUND) rather than proceeding unscoped.`,
      { procedure: path },
    );
  }
  return parsed.data.waqfId;
}

/**
 * Records the boundary denial for a scope/permission refusal.
 *
 * Called ONLY for this rung's own refusals. An error thrown by the procedure BODY is the body's
 * business, and recording it as `ACCESS_DENIED` would fill the trail with events that are not access
 * denials — so the caller (`src/trpc.ts`) wraps the authorization decision, never `next()`.
 */
export async function auditScopeRefusal(
  ctx: AuthedContext,
  path: string,
  waqfId: string,
  permission: PermissionString,
  error: unknown,
): Promise<void> {
  if (!(error instanceof ApiError)) return;
  if (error.code !== 'NO_GRANT' && error.code !== 'PERMISSION_DENIED') return;

  await recordProcedureDenial(ctx, {
    procedure: path,
    code: error.code,
    waqfId,
    permission,
    reason: error.message,
    entityType: 'Waqf',
    entityId: waqfId,
  });
}
