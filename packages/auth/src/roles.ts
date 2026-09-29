/**
 * packages/auth/src/roles.ts — the role catalogue and the TOTP policy.
 *
 * Sources of truth:
 *   - docs/product/prd/10-roles-access-matrix-spec.md §2 (catalogue) and §3 (the R/W/A/S grid)
 *   - NFR-06 (docs/product/prd/15-nonfunctional-requirements.md): "TOTP mandatory for
 *     money-movement and filing roles" + step-up re-assert on every approve/sign.
 *
 * This module is deliberately dependency-free (no Prisma, no env, no better-auth) so it can
 * be imported from a client component, an edge middleware, or a pure unit test.
 *
 * ── Role count: RESOLVED — §10.2's THIRTEEN ────────────────────────────────────────────
 * Three role sets used to disagree (the sprint brief's 11, §10.2's 13, and a 16-value
 * Prisma enum). Decided 2026-07-27 by the user: **§10.2's 13 is canonical**. The Prisma
 * enum was narrowed to match — `MANDATE_LEAD` and `ACCOUNTANT` were synonyms and were
 * removed; `APPROVER` was **removed, not remapped**, because §10 models approval as an
 * action the `nazir` holds and a standing approver seat would create the second approval
 * authority BR-105/BR-1103 rule out. See
 * `docs/decisions/ADR-0004-role-model-thirteen.md`.
 *
 * The DB spelling and the product key still differ in exactly one place —
 * `SYSTEM_ADMIN` ↔ `admin` — which `DB_ROLE_TO_ROLE_KEY` handles.
 */

/** Internal QMULATE staff — the Phase-1 operations app (§10 2.1). */
export const INTERNAL_OPS_ROLES = [
  'nazir',
  'authorized_rep',
  'case_manager',
  'finance',
  'compliance_officer',
  'aml_officer',
  'admin',
  'leadership',
] as const;

/** Client / beneficiary portal — Phase 2 seats, access model scaffolded now (§10 2.2). */
export const PORTAL_ROLES = ['family_board', 'beneficiary'] as const;

/** Oversight and third parties — scoped or export-only, no general seat (§10 2.3). */
export const THIRD_PARTY_ROLES = ['subcontractor', 'auditor', 'counsel'] as const;

/** The full catalogue: 13 keys. */
export const ROLES = [...INTERNAL_OPS_ROLES, ...PORTAL_ROLES, ...THIRD_PARTY_ROLES] as const;

export type RoleKey = (typeof ROLES)[number];
export type InternalOpsRole = (typeof INTERNAL_OPS_ROLES)[number];

/** Narrow untrusted input (a DB string, a URL segment) to a known role key. */
export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/* ───────────────────────────────────────────────────────────────────────────────────────
 * TOTP policy (NFR-06)
 *
 * NFR-06 says TOTP is mandatory for "money-movement and filing roles" but never enumerates
 * them; the §3 grid marks the TOTP-gated cells `A*`/`S*` and **only `nazir` holds any of
 * them**. Requiring TOTP of one person and no one else is not a defensible security
 * posture for a trustee's system of record, so we implement the SAFEST reading: enrolment
 * is mandatory for every internal ops seat, and a fresh TOTP assertion is required at the
 * moment of every approve/sign regardless of role.
 *
 * Over-requiring TOTP is the cheap error; under-requiring it is not.
 * ─────────────────────────────────────────────────────────────────────────────────────── */

// TODO(surface): SCOPE/SECURITY — is TOTP enrolment mandatory for read-only internal roles
// (`leadership`) and for the Phase-2 portal roles (`family_board`, `beneficiary`)? We
// currently require it for all 8 internal seats and leave it OPTIONAL for portal and
// third-party roles. Confirm before Phase 2 onboards beneficiaries.

/** Roles that CANNOT reach the app until `user.twoFactorEnabled === true`. */
export const TOTP_REQUIRED_ROLES: readonly RoleKey[] = INTERNAL_OPS_ROLES;

/** Alias under the E0 contract's name. Same list — do not let the two drift. */
export const TOTP_MANDATORY_ROLES = TOTP_REQUIRED_ROLES;

/** Actions that re-assert a fresh TOTP within `session.freshAge`, whoever performs them. */
export const TOTP_STEP_UP_ACTIONS = ['approve', 'sign'] as const;
export type TotpStepUpAction = (typeof TOTP_STEP_UP_ACTIONS)[number];

/** The single predicate. Enrolment gate: does holding this role force TOTP enrolment? */
export function requiresTotp(role: RoleKey): boolean {
  return TOTP_REQUIRED_ROLES.includes(role);
}

/** Step-up gate: does this action need a fresh TOTP assertion before it may execute? */
export function requiresStepUpTotp(action: string): action is TotpStepUpAction {
  return (TOTP_STEP_UP_ACTIONS as readonly string[]).includes(action);
}

/** True if ANY of the caller's held roles forces TOTP enrolment. */
export function anyRoleRequiresTotp(roles: readonly RoleKey[]): boolean {
  return roles.some(requiresTotp);
}

/* ───────────────────────────────────────────────────────────────────────────────────────
 * Prisma `Role` enum → RoleKey
 *
 * `WaqfAccessGrant.role` and `Membership.role` store the 13-value SCREAMING_SNAKE enum.
 * Since the 2026-07-27 decision the two sets are the SAME THIRTEEN, so this map is now
 * total over the enum and differs only in spelling (`SYSTEM_ADMIN` ↔ `admin`) plus case.
 *
 * It stays a `Record<string, RoleKey>` rather than a `Record<Role, RoleKey>` on purpose:
 * the lookup key is an untrusted string off a database row, and the caller must keep
 * handling `undefined`. `requiresTotpForDbRole` FAILS SAFE on an unmapped value, so adding
 * a value to the Prisma enum without adding it here cannot create a TOTP-exempt seat.
 * ─────────────────────────────────────────────────────────────────────────────────────── */
export const DB_ROLE_TO_ROLE_KEY: Readonly<Record<string, RoleKey>> = {
  SYSTEM_ADMIN: 'admin', // the one place the DB spelling and the product key differ
  NAZIR: 'nazir',
  AUTHORIZED_REP: 'authorized_rep',
  CASE_MANAGER: 'case_manager',
  FINANCE: 'finance',
  COMPLIANCE_OFFICER: 'compliance_officer',
  AML_OFFICER: 'aml_officer',
  COUNSEL: 'counsel',
  AUDITOR: 'auditor',
  SUBCONTRACTOR: 'subcontractor',
  FAMILY_BOARD: 'family_board',
  LEADERSHIP: 'leadership',
  BENEFICIARY: 'beneficiary',
};

/** `'NAZIR'` → `'nazir'`. `undefined` when the DB value has no product-vocabulary twin. */
export function roleKeyFromDbRole(dbRole: string): RoleKey | undefined {
  return DB_ROLE_TO_ROLE_KEY[dbRole];
}

/**
 * TOTP enrolment gate for a raw DB role value.
 * **Fails safe:** an unrecognised or unmapped role is treated as TOTP-required, so adding a
 * value to the Prisma enum can never accidentally create a TOTP-exempt seat.
 */
export function requiresTotpForDbRole(dbRole: string): boolean {
  const key = roleKeyFromDbRole(dbRole);
  return key === undefined ? true : requiresTotp(key);
}
