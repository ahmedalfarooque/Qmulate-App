/**
 * The API layer's view of the permission algebra — and the ONE place that decides which
 * procedures need a TOTP step-up.
 *
 * ── THIS FILE OWNS NO VOCABULARY ─────────────────────────────────────────────────────────────
 * There is no module list here, no verb list, no role list, no preset table, and deliberately no
 * "required permission per procedure" registry. All of that lives in `@qmulate/domain`'s
 * `access.ts` (the preset algebra, layer one of three) and is imported. A second copy of any of it
 * in this package would be the exact Sprint-1 failure mode: two sides that are supposed to agree
 * with nothing comparing them.
 *
 * What this file DOES own is the small amount of policy that is genuinely about the transport
 * boundary:
 *   · which verbs demand a fresh TOTP assertion, ASSERTED against `@qmulate/auth`'s
 *     `TOTP_STEP_UP_ACTIONS` rather than restated (see {@link assertStepUpPolicyAgrees});
 *   · the shape of the tag a guard middleware carries so `router-introspection.test.ts` can walk
 *     the REAL composed middleware chain of every procedure.
 */

import {
  APPROVAL_VERBS,
  assertPermissionString,
  hasPermission,
  isApprovalPermission,
  parsePermission,
  resolveGrantPermissions,
  type PermissionString,
  type PermissionVerb,
} from '@qmulate/domain';
import { TOTP_STEP_UP_ACTIONS } from '@qmulate/auth';

export {
  APPROVAL_AUTHORITY_ROLES,
  APPROVAL_VERBS,
  PERMISSION_MODULES,
  PERMISSION_RESOURCES,
  PERMISSION_VERBS,
  ROLE_KEYS,
  ROLE_PRESETS,
  assertPermissionString,
  hasPermission,
  isApprovalPermission,
  isApprovalVerb,
  isPermissionString,
  isRoleKey,
  parsePermission,
  resolveGrantPermissions,
  roleKeyFromDbRole,
} from '@qmulate/domain';
export type { ParsedPermission, PermissionString, PermissionVerb, RoleKey } from '@qmulate/domain';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · TOTP step-up policy
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The `Setting` key holding the step-up freshness window, in seconds (D-6).
 *
 * ⚠ NEVER A CONSTANT. NFR-06 makes "approve/sign need a fresh TOTP" the policy; the WINDOW is a
 * configurable regulatory-adjacent figure, so it lives in a `Setting` row and a correction is a
 * config change rather than a deploy. `packages/auth` ships `STEP_UP_FRESH_AGE_SECONDS = 600` as a
 * documentary default; this layer does NOT read it, because a hardcoded fallback is how a
 * fail-closed check quietly becomes a fail-open one.
 *
 * ⚠ NOT IN `@qmulate/domain`'s CLOSED `SETTING_SCHEMAS` REGISTRY, AND NOT SEEDED. Reported to the
 * integrator: until it is added there and seeded, every `approve`/`sign` procedure DENIES with
 * `TOTP_STEP_UP_REQUIRED` / `reason: 'SETTING_MISSING'`. That is the correct fail-closed direction
 * and it is asserted by a test — but it means the key must be provisioned before an approval can
 * ever succeed in a real environment.
 */
export const TOTP_STEP_UP_FRESHNESS_SETTING_KEY = 'auth.totpStepUp.freshnessSeconds';

/**
 * Does a procedure demanding `permission` need a fresh TOTP assertion?
 *
 * DERIVED from the permission's VERB, for every role — which is strictly stronger than §3's grid,
 * where the star sits only on the `A*`/`S*` cells of particular rows. A verb-level rule cannot be
 * forgotten on a new row.
 */
export function requiresTotpStepUp(permission: unknown): boolean {
  return isApprovalPermission(permission);
}

/**
 * Asserts that this layer's step-up trigger and `@qmulate/auth`'s `TOTP_STEP_UP_ACTIONS` are the
 * SAME SET, in both directions. Throws if they diverge.
 *
 * WHY IT IS A RUNTIME ASSERTION AND NOT A COMMENT: `TOTP_STEP_UP_ACTIONS` (`['approve','sign']`)
 * and `APPROVAL_VERBS` (`['approve','sign']`) are two independently-declared lists in two packages
 * that must agree. Sprint 1's two security holes both existed because nothing compared two sides
 * that were supposed to agree. So the comparison is code: called by
 * `router-introspection.test.ts`, and cheap enough to call at boot.
 *
 * The direction that matters most is `TOTP_STEP_UP_ACTIONS ⊆ APPROVAL_VERBS`: a verb that auth
 * says needs a step-up but which this layer does not treat as an approval verb would silently skip
 * the step-up gate.
 */
export function assertStepUpPolicyAgrees(): void {
  const approval: ReadonlySet<string> = new Set(APPROVAL_VERBS);
  const stepUp: ReadonlySet<string> = new Set(TOTP_STEP_UP_ACTIONS);

  const missingFromApproval = [...stepUp].filter((verb) => !approval.has(verb));
  const missingFromStepUp = [...approval].filter((verb) => !stepUp.has(verb));

  if (missingFromApproval.length > 0 || missingFromStepUp.length > 0) {
    throw new Error(
      'the TOTP step-up verb set and the approval-authority verb set have drifted. ' +
        `@qmulate/auth TOTP_STEP_UP_ACTIONS = [${[...stepUp].join(', ')}]; ` +
        `@qmulate/domain APPROVAL_VERBS = [${[...approval].join(', ')}]. ` +
        `In TOTP_STEP_UP_ACTIONS but not an approval verb: [${missingFromApproval.join(', ')}] ` +
        `(these would skip the step-up gate). ` +
        `An approval verb but not in TOTP_STEP_UP_ACTIONS: [${missingFromStepUp.join(', ')}].`,
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Guard tags — how the introspection test reads the REAL ladder
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The kinds of guard a procedure can be built on.
 *
 * Each guard middleware's raw function carries one of these in a {@link GuardTag}, so
 * `router-introspection.test.ts` can walk `appRouter._def.procedures[path]._def.middlewares` and
 * see WHICH GUARDS ARE ACTUALLY COMPOSED — not which ones a `.meta()` block claims.
 *
 * That distinction is the whole point. tRPC's `meta` is caller-supplied and can be overwritten by
 * a later `.meta()` call, so a router that forgot the ladder could still declare that it had it. A
 * middleware, by contrast, either runs or does not, and the permission the tag reports is the SAME
 * closure variable the middleware enforces — so the test reads the enforcement, not a description
 * of it.
 */
export const GUARD_KINDS = [
  /** better-auth session present AND the universal TOTP-enrolment gate cleared. */
  'authed',
  /** `waqfId` in input, active grant resolved, required permission asserted. */
  'endowment-scope',
  /** maker≠checker on the persisted `makerId`, plus the approval's currency (§10 §4.2/§4.3). */
  'segregation',
  /** a fresh TOTP assertion inside the Setting-driven window (NFR-06 step-up, D-6). */
  'totp-step-up',
  /** an ORGANISATION-scope permission held through the caller's access level (migration 55). */
  'org-scope',
  /** AML compartment membership for the target endowment (§10 §6). May only BLOCK. */
  'aml-member',
] as const;

export type GuardKind = (typeof GUARD_KINDS)[number];

/** The marker property name. A string constant so the test cannot mistype it silently. */
export const GUARD_TAG_PROPERTY = 'qmulateGuard' as const;

export interface GuardTag {
  readonly kind: GuardKind;
  /**
   * The permission this guard enforces, for the guards that enforce one. It is the same value the
   * middleware closure uses — read, not restated.
   */
  readonly permission?: PermissionString;
}

/** A middleware function carrying its {@link GuardTag}. */
export type TaggedMiddlewareFn = ((...args: never[]) => unknown) & {
  readonly [GUARD_TAG_PROPERTY]?: GuardTag;
};

/**
 * Attaches a {@link GuardTag} to a middleware function and returns it.
 *
 * Non-enumerable so it never leaks into a JSON serialization of anything, and non-writable so a
 * later edit cannot relabel a guard as something it is not.
 */
export function tagGuard<F extends (...args: never[]) => unknown>(fn: F, tag: GuardTag): F {
  Object.defineProperty(fn, GUARD_TAG_PROPERTY, {
    value: Object.freeze({ ...tag }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return fn;
}

/** Reads a {@link GuardTag} off a value that may or may not be a tagged middleware. */
export function readGuardTag(value: unknown): GuardTag | undefined {
  if (typeof value !== 'function') return undefined;
  const tag = (value as TaggedMiddlewareFn)[GUARD_TAG_PROPERTY];
  if (tag === undefined || typeof tag !== 'object') return undefined;
  return (GUARD_KINDS as readonly string[]).includes(tag.kind) ? tag : undefined;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Resolving a caller's effective permissions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The verb of a permission, or `undefined` for anything unregistered.
 *
 * FAILS CLOSED by construction: `undefined` is never an approval verb, so an unparseable
 * permission can never be treated as one that needs (or, worse, satisfies) a step-up.
 */
export function permissionVerb(permission: unknown): PermissionVerb | undefined {
  return parsePermission(permission)?.verb;
}

/**
 * The EFFECTIVE permission set of one grant: `grant.permissions ∩ preset(role)`.
 *
 * A thin, named re-export of `@qmulate/domain`'s `resolveGrantPermissions` so every call site in
 * this package reads the same way and nothing is tempted to use `can(role, permission)` instead.
 *
 * ⚠ `can()` IS NOT AN AUTHORIZATION FUNCTION. It answers a question about a ROLE PRESET, with no
 * endowment involved — so `can('nazir', 'approval:request:approve')` is true for a caller whose
 * grant is on a DIFFERENT endowment. That is MP-12's bug exactly, and it is why nothing in this
 * package calls it.
 */
export function effectivePermissions(
  role: unknown,
  storedPermissions: Iterable<unknown>,
): PermissionString[] {
  return resolveGrantPermissions(role, storedPermissions);
}

/**
 * Does this ALREADY-RESOLVED grant carry `permission`?
 *
 * The one authorization primitive this package uses. Three properties, all load-bearing:
 *  · it takes a GRANT, so the answer is inherently per-endowment — there is no way to ask it a
 *    role-shaped question (MP-12);
 *  · `grant.permissions` is the EFFECTIVE set (`stored ∩ preset(role)`), so a widened row grants
 *    nothing extra (MP-18);
 *  · matching is `hasPermission`'s EXACT match over registered strings — no prefixes, no wildcards,
 *    no trimming, no case folding. `'approval:request:*'` grants nothing and `'aprove'` denies
 *    (MP-19).
 */
export function hasPermissionInGrant(
  grant: { readonly permissions: readonly unknown[] },
  permission: unknown,
): boolean {
  return hasPermission(grant.permissions, permission);
}

/**
 * Narrows a build-time argument to a registered permission, or throws `PERMISSION_INVALID`.
 *
 * Used by `endowmentScopedProcedure(permission)` so a typo in a procedure definition fails at
 * ROUTER CONSTRUCTION — i.e. at import time, i.e. at boot and in every test run — instead of
 * denying silently at request time and inviting someone to "fix" the matcher by broadening it.
 */
export function assertProcedurePermission(permission: unknown): PermissionString {
  return assertPermissionString(permission);
}
