/**
 * packages/auth/src/dev-admin.ts — the LOCAL DEVELOPMENT ADMINISTRATOR: its fixture-only TOTP
 * exemption and the shape of its seats.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A developer working on a fixture-only database needs one account that can reach every screen
 * without a second factor on every sign-in. The TOTP gate is UNIVERSAL by product-owner decision
 * (2026-07-27, `evaluateAuthGate`), and better-auth challenges every enrolled account at sign-in —
 * so "automatic local login" is only possible as a per-account carve-out, and a carve-out is a
 * security control. It is therefore written the way `rate-limit.ts`'s test-only relaxation is
 * written: EXPLICIT, NAMED, and FAIL-CLOSED.
 *
 * The exemption is granted only when ALL of the following hold, read from `process.env` directly
 * (the same reasoning as `privileged-urls.ts`: a variable that is merely PRESENT must be decisive,
 * and a parsed schema could default or strip it):
 *
 *   · `DATA_CLASSIFICATION === 'fixture-only'`  — never on a production or staging posture;
 *   · `DEV_ADMIN_EMAIL` is set and non-empty     — the operator named ONE account, on purpose;
 *   · the session's email is EXACTLY that value  — case-sensitive, untrimmed, no wildcard.
 *
 * What it bypasses: the TOTP ENROLMENT GATE and the SIGN-IN TOTP CHALLENGE, for that one account.
 * Nothing else. Password verification, session validation, the per-endowment access matrix, the
 * maker≠checker rules and the privilege-separated database connections are untouched — the account
 * is authorised the way every other seat is, by `WaqfAccessGrant` rows (see {@link devAdminGrantPlan}).
 *
 * This module is dependency-free (no Prisma, no env schema, no better-auth) so the predicate can be
 * unit-tested as a pure function and imported from either side of the auth boundary.
 */

import { ROLE_PRESETS, type PermissionString } from '@qmulate/domain/access';

import {
  DB_ROLE_TO_ROLE_KEY,
  INTERNAL_OPS_ROLES,
  type InternalOpsRole,
  type RoleKey,
} from './roles';

/** The variable that names the ONE exempt account. Absent ⇒ no exemption exists. */
export const DEV_ADMIN_EMAIL_VARIABLE = 'DEV_ADMIN_EMAIL';

/** The classification under which the exemption may exist at all (NFR-03 guardrail vocabulary). */
const FIXTURE_ONLY = 'fixture-only';

type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * The exemption predicate. TRUE only for the one configured address, only under `fixture-only`.
 *
 * Every other input — a missing or empty variable, any other classification, a different address,
 * a non-string — is FALSE. There is no default, no prefix match and no case folding: the value in
 * the environment must be the value on the session, byte for byte.
 */
export function isDevAdminExempt(email: unknown, env: EnvLike = process.env): boolean {
  if (env.DATA_CLASSIFICATION !== FIXTURE_ONLY) return false;
  const configured = env[DEV_ADMIN_EMAIL_VARIABLE];
  if (typeof configured !== 'string' || configured.trim() === '') return false;
  return typeof email === 'string' && email === configured;
}

/**
 * The seats the development administrator holds on EVERY endowment: all eight internal operations
 * roles (§10 §2.1), each at its FULL preset.
 *
 * ── WHY EIGHT SEATS AND NOT ONE "SUPER" ROLE ─────────────────────────────────────────────────
 * Authorization here is `(subject, role, waqfId) → permitted actions`, and a grant may NARROW its
 * role's preset but never widen it (§10 principle 3 — `resolveGrantPermissions` applies the ceiling
 * on every read). No single preset covers every verb: only `nazir` may approve or sign, only
 * `admin` may write the access matrix, only `aml_officer` sits inside the AML compartment. The
 * widest reach the architecture can express is therefore one grant PER ROLE per endowment, which
 * `resolveScope` already supports ("a caller may hold more than one grant on one endowment") — it
 * selects the seat that carries the demanded permission, so attribution stays honest: an approval is
 * recorded against the `NAZIR` seat, a matrix change against the `SYSTEM_ADMIN` seat.
 *
 * What this does NOT do: it does not exempt the account from maker≠checker. That rule is a CHECK on
 * `approval_request` (`checkerId <> makerId`) and a trigger on the authority plane; a single account
 * cannot both make and approve, whoever it is. That is the architecture working, not a gap.
 */
export const DEV_ADMIN_ROLES: readonly InternalOpsRole[] = INTERNAL_OPS_ROLES;

/** `'nazir'` → `'NAZIR'`, `'admin'` → `'SYSTEM_ADMIN'` — the inverse of `DB_ROLE_TO_ROLE_KEY`, derived, not restated. */
export function dbRoleFor(role: RoleKey): string {
  const entry = Object.entries(DB_ROLE_TO_ROLE_KEY).find(([, key]) => key === role);
  if (entry === undefined) throw new Error(`no Prisma Role spelling for role key "${role}"`);
  return entry[0];
}

export interface DevAdminGrant {
  readonly waqfId: string;
  /** Prisma `Role` enum spelling. */
  readonly role: string;
  /** The role's full preset — `stored ∩ preset` is then the preset itself. */
  readonly permissions: readonly PermissionString[];
  readonly dataScopes: readonly string[];
  readonly canViewAmlRestricted: boolean;
  readonly amlCompartment: boolean;
}

/** One grant per (internal ops role × endowment). Pure; the setup script persists it. */
export function devAdminGrantPlan(waqfIds: readonly string[]): DevAdminGrant[] {
  const plan: DevAdminGrant[] = [];
  for (const waqfId of waqfIds) {
    for (const role of DEV_ADMIN_ROLES) {
      const inCompartment = role === 'aml_officer';
      plan.push({
        waqfId,
        role: dbRoleFor(role),
        permissions: [...ROLE_PRESETS[role]],
        // `dataScopes` is stored but not enforced anywhere (see `GRANT_SHAPE_BY_ROLE`'s note).
        dataScopes: [],
        // `waqf_access_grant_aml_flags`: canViewAmlRestricted may only be true inside the compartment.
        canViewAmlRestricted: inCompartment,
        amlCompartment: inCompartment,
      });
    }
  }
  return plan;
}
