/**
 * Access algebra — the pure authorization core.
 *
 * Source of truth: `docs/product/prd/10-roles-access-matrix-spec.md` §2 (the thirteen roles),
 * §3 (the read/write/approve/sign grid), §4 (segregation of duties) and §8 (delegation).
 * The role catalogue itself is ADR-0004 (`docs/decisions/ADR-0004-role-model-thirteen.md`).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ## HOW TO READ THE COMMENTS IN THIS FILE — the convention, because it is load-bearing
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * This sprint shipped three comments that asserted properties the code did not have, and each
 * one was believed by the next reader — one of them was repeated to the product owner as fact.
 * So every normative sentence below is tagged, and the tag is the whole point:
 *
 *  · **`SPEC:`** — a quotation or paraphrase of `10-roles-access-matrix-spec.md` (or a BR/ADR).
 *    It says what the SPECIFICATION requires. It is **not** a claim that anything in this file,
 *    this package, or this system enforces it. Treat it as a requirement to be checked against,
 *    never as evidence that the requirement is met.
 *  · **`ENFORCED HERE:`** — a property of the code in THIS file: a pure function's behaviour on
 *    its own arguments. Provable by a unit test with no database and no request.
 *  · **`NOT ENFORCED HERE:`** — a property the spec requires that this file does not deliver,
 *    naming who does (or that nobody yet does).
 *
 * An untagged sentence is background prose, and nothing in this file should be quoted as a
 * control on the strength of one.
 *
 * ## WHAT THIS MODULE ACTUALLY IS
 * A pure algebra over strings: it decides which permission strings a role MAY hold, and it
 * intersects sets. **ENFORCED HERE:** nothing more than that.
 *
 * **NOT ENFORCED HERE — and this is the sentence that has been got wrong twice:** these
 * functions are not a control on any live request. They must be CALLED to do anything, and a
 * caller that never calls them is unaffected. In particular:
 *  · they are not reached by `$queryRaw` / `$executeRawUnsafe` at all;
 *  · they do not see a database row, a session, or an endowment;
 *  · a preset says what a role may hold — never what a given caller currently holds.
 *
 * **SPEC** (§1 principle 8) requires the same rule at three layers — UI capability gating, the
 * tRPC procedure ladder, and the Prisma force-filter. **NOT ENFORCED HERE, and do not repeat
 * the three-layer sentence as a security property:** [ADR-0008](../../../docs/decisions/ADR-0008-authorization-plane-admission-control.md)
 * records that on the authorization plane all three layers resolved authority by reading one
 * table — "three layers that all resolve authority by reading one table are one layer" — and that
 * the control which actually closes the SQL path is privilege separation, not a fourth check.
 *
 * That landed in ADR-0008 round 6: the runtime database role holds no write on `waqf_access_grant`
 * at all, so the SQL path is refused by the server before any layer is consulted. The three-layer
 * sentence is STILL not a security property on its own — it never was — and the hard gate (no real
 * client data) stands for the residuals round 6 did not touch.
 *
 * ## The rule this module is a piece of the argument for
 * **SPEC** (BR-105 / BR-1103 / §3): the Nazir is the sole approval authority, per endowment, and
 * never the maker. **ENFORCED HERE:** only the two contributions below — everything else about
 * that rule lives in `packages/api`'s procedure ladder and `packages/database`'s guards.
 *
 * Layer one contributes two things nothing else can:
 * 1. Approval authority is **data, not literals**: {@link APPROVAL_AUTHORITY_ROLES} is the one
 *    place the answer is written down, and a test asserts it equals the set *derived* by
 *    scanning every preset for an approve/sign verb. **ENFORCED HERE:** a newly-invented role
 *    carrying `approve` fails that test whatever it is named.
 * 2. The preset table is the **ceiling at both ends**. **SPEC** (§10 principle 3): a grant "may
 *    narrow (never silently widen)". **ENFORCED HERE:** {@link resolveGrantPermissions}
 *    intersects on read, so a widened row written by a raw query, a migration or a PROVISIONAL
 *    fixture resolves to nothing extra — **for a caller that resolves its permissions through
 *    this function.** A caller that reads `WaqfAccessGrant.permissions` directly gets the
 *    widened row; nothing here can prevent that.
 *
 * ## Why this lives in `packages/domain` and not `packages/auth`
 * `packages/auth` depends on `@qmulate/database`, and `@qmulate/database` depends on
 * `@qmulate/domain`. `database → auth` would therefore be a cycle, while `database → domain`
 * already exists. The presets must be readable by the database seed (fixture-subset parity),
 * by `packages/auth`, and by `packages/api` — the domain is the only cycle-free home. The
 * package's purity constraint is unaffected: nothing here does I/O or imports anything
 * internal.
 *
 * ## Fail closed, everywhere
 * Unknown role, unknown verb, unknown module, unregistered resource, wildcard, wrong case,
 * stray whitespace, `null`, `undefined`, non-string ⇒ **DENY**. Never default-allow. This
 * follows the established house pattern: `requiresTotpForDbRole` in
 * `packages/auth/src/roles.ts` treats an unmapped role as TOTP-required.
 *
 * ## What is deliberately NOT here
 * - **No wildcards.** A wildcard in a string-based permission model is the classic way a
 *   least-privilege matrix quietly becomes root. The registry is CLOSED; `'aprove'` DENIES.
 * - **No co-authorization.** No `approvers: string[]`, no `coApprovedByUserId`, nothing whose
 *   cardinality on the approval side exceeds one (S2 decision D-2). Approval authority is
 *   single-valued by construction, so a second approval authority is not *expressible*.
 * - **No "leadership authority matrix" configurable** (S2 decision D-1) — not even one
 *   defaulting to empty. An empty configurable is a foothold; if it is ever wanted it becomes
 *   a deliberate future change with an ADR.
 * - **No `Delegation` model.** §10 §8 specifies the object; the schema does not have it and E2
 *   does not invent it (S2 decision D-7). {@link assertDelegatableScope} is the pure algebra
 *   half — the persistence half is E3/E11.
 */

import { DomainError } from './errors.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The vocabulary: modules × resources × verbs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The thirteen permission modules: §3's twelve grid rows, plus `approval`.
 *
 * `approval` has no grid row because §3 models approval as the `A*`/`S*` verb on each domain
 * row — but the `ApprovalRequest` record is itself a resource that must be readable and
 * approvable, and the shipped fixture already depends on `approval:request:approve`. It is the
 * ONLY grid-less module; see {@link MODULES_WITHOUT_GRID_ROW}.
 */
export const PERMISSION_MODULES = [
  'endowment',
  'beneficiary',
  'finance',
  'distribution',
  'fee',
  'compliance',
  'aml',
  'legal',
  'document',
  'reporting',
  'admin',
  'audit',
  'approval',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/**
 * §3's four verbs plus `i` (initiate), spelled out.
 *
 * - `read` — **R**
 * - `write` — **W** (create/update draft)
 * - `initiate` — **i**: creates a request a *different* party must approve/sign. The maker's
 *   verb under segregation of duties (§4).
 * - `approve` — **A**: authorize another party's initiated action.
 * - `sign` — **S**: final governance signature on a reserved matter.
 *
 * The list is closed. Adding a verb is an authority-model change, not a convenience.
 */
export const PERMISSION_VERBS = ['read', 'write', 'initiate', 'approve', 'sign'] as const;

export type PermissionVerb = (typeof PERMISSION_VERBS)[number];

/**
 * The two verbs that constitute approval authority (§3's `A`/`A*` and `S`/`S*` cells).
 *
 * Every rule about "who may approve" is expressed in terms of this set, so there is exactly
 * one place to look and exactly one place to change.
 */
export const APPROVAL_VERBS = ['approve', 'sign'] as const;

export type ApprovalVerb = (typeof APPROVAL_VERBS)[number];

/**
 * Verbs excluded from ANY delegatable scope (§10 §8, verbatim: "sign on reserved matters and
 * final approve are excluded from any delegatable scope — an attempt to delegate them is
 * rejected"). Identical to {@link APPROVAL_VERBS} by construction, not by coincidence:
 * accountability is non-delegable (BR-105), so the two sets cannot drift apart.
 */
export const NON_DELEGABLE_VERBS: readonly ApprovalVerb[] = APPROVAL_VERBS;

/**
 * The CLOSED resource registry, keyed by module.
 *
 * A permission string naming an unregistered resource is **rejected** — that is what makes
 * the least-privilege claim provable rather than aspirational. Later epics add resources
 * deliberately (E3 assets, E7 SAR follow-up, …); nothing may reach for a resource that has
 * not been registered here first.
 *
 * Resource names are `snake_case` and colon-free (the colon is the segment separator).
 */
export const PERMISSION_RESOURCES: Readonly<Record<PermissionModule, readonly string[]>> = {
  /**
   * §3 row 1 "Endowment & deed" (BR-101–105). `deed` is what carries the Nazir's `S*`.
   *
   * ── WHY `asset` IS HERE (round-3 finding N-4) ─────────────────────────────────────────────
   * The corpus asset — the *aṣl* (أصل) itself — had no registered resource, so no permission
   * string could name a write to it and the force-filter had nothing to check. Measured
   * consequence: a `SUBCONTRACTOR` seat holding only `compliance:task:*` and
   * `document:document:write` moved `asset-001` from SAR 18,000,000.00 to 777,777.77 and
   * rewrote its Arabic address, through the ordinary Prisma delegate. A valuation feeds the
   * classification, and the classification decides which regulatory duties apply at all.
   *
   * **SPEC** (§3 row 1): there is no separate asset/property module — §3's own preamble lists
   * the modules as "endowment/deed, beneficiary/UBO, finance/distribution, compliance/filings,
   * documents/vault, reporting, admin/access-matrix, AML compartment". The endowed asset is
   * part of the endowment record, so it is a RESOURCE of this module and takes this row's
   * cells verbatim: `nazir`/`case_manager`/`compliance_officer`/`admin` `R W`,
   * `authorized_rep` `R W(scoped)`, `finance`/`leadership`/`family_board`/`auditor` `R`,
   * `counsel` `R(scoped)`, and **nothing at all** for `aml_officer`, `beneficiary` and
   * `subcontractor`.
   *
   * **ENFORCED HERE:** no new authority appears — `endowment:asset:approve` and
   * `endowment:asset:sign` are not in any preset, so the approval-authority derivation test is
   * unchanged. **NOT ENFORCED HERE:** which COLUMNS of an asset this gates is
   * `packages/database`'s `DOMAIN_WRITE_POLICIES`, not this file.
   */
  endowment: ['waqf', 'deed', 'asset'],
  /** §3 row 2 "Beneficiary & UBO" (BR-201–210). `ubo` is the sensitive beneficial-owner dataset. */
  beneficiary: ['beneficiary', 'ubo'],
  /**
   * §3 row 3 "Finance: capture" (BR-501–503) — the ledger and the dedicated waqf accounts.
   *
   * ⊕ `maintenance_policy` added S6/E5 by owner ruling (2026-08-18, OQ-06 tail): recording an
   * endowment's ṣiyāna (صيانة) reserve percentage under a SILENT deed is the Nazir's discretion and
   * gets its OWN verb. It previously borrowed `fee:nazir_fee:approve` — Nazir-only, so the
   * authority was right, but a MAINTENANCE decision gated by a FEE permission is a record an
   * auditor has to decode, and a future change to the fee verb would have moved the maintenance
   * gate with it silently. ⚠ NOT A WIDENING: the seat set is unchanged, `nazir` and nothing else.
   */
  finance: ['transaction', 'bank_account', 'maintenance_policy'],
  /** §3 row 4 "Finance: bank/distribution run" (BR-505–506) — the money MOVEMENT, not its capture. */
  distribution: ['run', 'line_item', 'bank_movement'],
  /** §3 row 5 "Nazir fee" (BR-507) — the deed-set ʿushr fee. ⚠ the rate is unverified. */
  fee: ['nazir_fee'],
  /** §3 row 6 "Compliance tasks & filings" (BR-601–603). `filing` is what carries the `A*`. */
  compliance: ['task', 'filing'],
  /** §3 row 7 "AML / SAR compartment" (BR-604) — a separate RESOURCE, never a permission level. */
  aml: ['sar'],
  /** §3 row 8 "Legal & judicial cases" (BR-612). `reserved_matter` carries the `A*`. */
  legal: ['case', 'reserved_matter'],
  /** §3 row 9 "Document vault" (BR-701–702). */
  document: ['document'],
  /**
   * §3 row 10 "Reporting & dashboards" (BR-901–902). `statement` is the beneficiary-facing
   * artifact; `report` is the aggregate the grid denies beneficiaries.
   */
  reporting: ['report', 'statement'],
  /**
   * §3 row 11 "Admin / access matrix". `setting` is the configuration plane (EXIT-3). `user` and
   * `access_level` are the ORGANISATION layer (migration 55): user management and the editable
   * access levels. They carry no endowment scope — see {@link ORG_SCOPE_PERMISSIONS}.
   */
  admin: ['access_matrix', 'setting', 'user', 'access_level'],
  /** §3 row 12 "Audit trail" (BR-607, NFR-04) — append-only; there is no write verb granted anywhere. */
  audit: ['event'],
  /** No grid row — the ApprovalRequest record itself (§4). Only `nazir` approves on it. */
  approval: ['request'],
};

/**
 * §3 grid row label → module key.
 *
 * Exported so the grid-parity test can align the markdown table's rows with this module list
 * by READING THE SPEC, instead of hand-copying a twelve-item list into a second file. A
 * renamed row breaks the test rather than silently un-testing a row.
 */
export const GRID_ROW_TO_MODULE: Readonly<Record<string, PermissionModule>> = {
  'Endowment & deed': 'endowment',
  'Beneficiary & UBO': 'beneficiary',
  'Finance: capture': 'finance',
  'Finance: bank/distribution run': 'distribution',
  'Nazir fee': 'fee',
  'Compliance tasks & filings': 'compliance',
  'AML / SAR compartment': 'aml',
  'Legal & judicial cases': 'legal',
  'Document vault': 'document',
  'Reporting & dashboards': 'reporting',
  'Admin / access matrix': 'admin',
  'Audit trail': 'audit',
};

/**
 * Modules with no §3 grid row. Exactly one, and it is `approval` — see
 * {@link PERMISSION_MODULES}. A grid-parity test must account for this module explicitly
 * rather than quietly skipping whatever it cannot match.
 */
export const MODULES_WITHOUT_GRID_ROW = ['approval'] as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The organisation layer (migration 55)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Permissions an ACCESS LEVEL may confer ORGANISATION-WIDE, i.e. with no endowment in the
 * sentence: managing users and levels, seating people on endowments, the configuration plane,
 * and reading the audit trail. Everything else in this file is a per-endowment permission and
 * is reached only through a `WaqfAccessGrant` on that endowment. The list is closed: an
 * endowment permission written into a level is rejected by {@link assertOrgScopePermissions}.
 *
 * ⚠ No approval verb appears here, and none may be added: approve/sign belong to the Nazir seat
 * on the endowment (ADR-0004, BR-105).
 */
export const ORG_SCOPE_PERMISSIONS = [
  'admin:user:read',
  'admin:user:write',
  'admin:access_level:read',
  'admin:access_level:write',
  'admin:access_matrix:read',
  'admin:access_matrix:write',
  'admin:setting:read',
  'admin:setting:write',
  'audit:event:read',
] as const;

export type OrgScopePermission = (typeof ORG_SCOPE_PERMISSIONS)[number];

const ORG_SCOPE_SET: ReadonlySet<string> = new Set(ORG_SCOPE_PERMISSIONS);

export function isOrgScopePermission(value: string): value is OrgScopePermission {
  return ORG_SCOPE_SET.has(value);
}

/** Throws unless every entry is a registered organisation-scope permission. */
export function assertOrgScopePermissions(values: readonly string[]): OrgScopePermission[] {
  const bad = values.filter((value) => !isOrgScopePermission(value));
  if (bad.length > 0) {
    throw new Error(
      `not organisation-scope permissions: ${bad.join(', ')}. A level confers only ` +
        `${ORG_SCOPE_PERMISSIONS.join(', ')}; endowment access is a seat on that endowment.`,
    );
  }
  return [...new Set(values)] as OrgScopePermission[];
}

/** The five default level keys. Rows in `access_level`; the keys are stable, the contents are not. */
export const ACCESS_LEVEL_KEYS = ['ADMIN', 'OWNER', 'MANAGER', 'USER', 'CUSTOM'] as const;
export type AccessLevelKey = (typeof ACCESS_LEVEL_KEYS)[number];

/** Registration state of an account (mirrors the `UserStatus` enum). */
export const USER_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REJECTED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface OrgAccessInput {
  readonly status: UserStatus;
  readonly isPrimaryAdmin: boolean;
  readonly levelPermissions: readonly string[];
  readonly overrides: readonly { readonly permission: string; readonly effect: 'ALLOW' | 'DENY' }[];
}

/**
 * The effective ORGANISATION-SCOPE permission set of an account — the TypeScript twin of the SQL
 * function `qmulate_actor_holds_org_permission` (migration 55), and a test compares the two.
 *
 * Order: an account that is not ACTIVE holds nothing; the primary administrator holds every
 * organisation permission (that is what makes it un-lockable); a DENY override beats the level;
 * an ALLOW override adds to it. Only registered organisation-scope strings survive.
 */
export function resolveOrgPermissions(input: OrgAccessInput): ReadonlySet<OrgScopePermission> {
  if (input.status !== 'ACTIVE') return new Set();
  if (input.isPrimaryAdmin) return new Set(ORG_SCOPE_PERMISSIONS);
  const denied = new Set(input.overrides.filter((o) => o.effect === 'DENY').map((o) => o.permission));
  const allowed = new Set<string>([
    ...input.levelPermissions,
    ...input.overrides.filter((o) => o.effect === 'ALLOW').map((o) => o.permission),
  ]);
  const result = new Set<OrgScopePermission>();
  for (const permission of allowed) {
    if (!denied.has(permission) && isOrgScopePermission(permission)) result.add(permission);
  }
  return result;
}

/**
 * The navigation sections of the product and the permission that makes each one VISIBLE. This is
 * the one place the sidebar and the route gates read from; a section without a row is not shown.
 * `scope: 'seat'` means "any active grant carrying this permission on any endowment";
 * `scope: 'org'` means the organisation-scope permission. Visibility is not authority: every API
 * procedure behind a section still checks its own permission on its own endowment.
 */
export const NAV_SECTIONS = [
  { key: 'dashboard', scope: 'any', permission: null },
  { key: 'endowments', scope: 'seat', permission: 'endowment:waqf:read' },
  { key: 'onboarding', scope: 'seat', permission: 'endowment:waqf:write' },
  { key: 'beneficiaries', scope: 'seat', permission: 'beneficiary:beneficiary:read' },
  { key: 'distributions', scope: 'seat', permission: 'distribution:run:read' },
  { key: 'compliance', scope: 'seat', permission: 'compliance:task:read' },
  { key: 'calendar', scope: 'seat', permission: 'compliance:task:read' },
  { key: 'financials', scope: 'seat', permission: 'finance:transaction:read' },
  { key: 'documents', scope: 'seat', permission: 'document:document:read' },
  { key: 'approvals', scope: 'seat', permission: 'approval:request:read' },
  { key: 'auditLog', scope: 'org', permission: 'audit:event:read' },
  { key: 'users', scope: 'org', permission: 'admin:user:read' },
  { key: 'roles', scope: 'org', permission: 'admin:access_level:read' },
] as const;

export type NavSectionKey = (typeof NAV_SECTIONS)[number]['key'];

/**
 * Which sections a caller may see, from their seats and their organisation permissions.
 * Pure, so the sidebar, the route gates and the tests all compute the same answer.
 */
export function visibleSections(input: {
  readonly seatPermissions: Iterable<string>;
  readonly orgPermissions: Iterable<string>;
}): NavSectionKey[] {
  const seat = new Set(input.seatPermissions);
  const org = new Set(input.orgPermissions);
  return NAV_SECTIONS.filter((section) => {
    if (section.scope === 'any') return true;
    if (section.scope === 'seat') return seat.has(section.permission);
    return org.has(section.permission);
  }).map((section) => section.key);
}

/**
 * A permission: `module:resource:verb`.
 *
 * The three-segment shape is canonical (`schema.prisma`'s `WaqfAccessGrant.permissions` doc
 * comment: `"module:resource:verb" tuples`). §10's prose occasionally describes a 2-tuple
 * `{module, verb}` — that is the drifted side.
 *
 * The `resource` segment is `string` at the type level because TypeScript cannot express
 * "a resource registered for *this* module" in a template literal; {@link isPermissionString}
 * closes that gap at runtime, and every entry in {@link ROLE_PRESETS} is asserted valid by a
 * test. So a typo compiles, and then denies — never widens.
 */
export type PermissionString = `${PermissionModule}:${string}:${PermissionVerb}`;

/** A permission split into its three registered segments. */
export interface ParsedPermission {
  readonly module: PermissionModule;
  readonly resource: string;
  readonly verb: PermissionVerb;
}

const MODULE_SET: ReadonlySet<string> = new Set(PERMISSION_MODULES);
const VERB_SET: ReadonlySet<string> = new Set(PERMISSION_VERBS);
const APPROVAL_VERB_SET: ReadonlySet<string> = new Set(APPROVAL_VERBS);

/**
 * Parse a permission against the closed registry.
 *
 * Returns `undefined` — never a partial result, never a guess — for anything that is not a
 * registered `module:resource:verb`. That deliberately includes:
 * - wildcards: `'*'`, `'approval:*'`, `'approval:request:*'`;
 * - typos: `'endowment:waqf:aprove'`;
 * - untrimmed input: `' endowment:waqf:read'` (whitespace is NOT forgiven — a value that
 *   arrived with stray whitespace did not come from this vocabulary, and silently trimming it
 *   is how a mismatch becomes a match);
 * - wrong case, wrong arity, non-strings.
 */
export function parsePermission(value: unknown): ParsedPermission | undefined {
  if (typeof value !== 'string') return undefined;

  const segments = value.split(':');
  if (segments.length !== 3) return undefined;

  const [module, resource, verb] = segments as [string, string, string];
  if (!MODULE_SET.has(module) || !VERB_SET.has(verb)) return undefined;

  const registered = PERMISSION_RESOURCES[module as PermissionModule];
  if (!registered.includes(resource)) return undefined;

  return {
    module: module as PermissionModule,
    resource,
    verb: verb as PermissionVerb,
  };
}

/** Type guard: is this a registered permission string? */
export function isPermissionString(value: unknown): value is PermissionString {
  return parsePermission(value) !== undefined;
}

/** Narrow untrusted input to a permission, or throw `PERMISSION_INVALID`. */
export function assertPermissionString(value: unknown): PermissionString {
  if (!isPermissionString(value)) {
    throw new DomainError(
      'PERMISSION_INVALID',
      `"${String(value)}" is not a registered module:resource:verb permission. The registry is closed: no wildcards, no trimming, no case folding.`,
      { details: { value: typeof value === 'string' ? value : typeof value } },
    );
  }
  return value;
}

/** Is this verb one of the two that constitute approval authority? */
export function isApprovalVerb(verb: unknown): verb is ApprovalVerb {
  return typeof verb === 'string' && APPROVAL_VERB_SET.has(verb);
}

/** Does this permission carry an approve/sign verb? False for anything unregistered. */
export function isApprovalPermission(value: unknown): boolean {
  const parsed = parsePermission(value);
  return parsed !== undefined && APPROVAL_VERB_SET.has(parsed.verb);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The thirteen roles
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The thirteen role keys, in the same order `packages/auth/src/roles.ts` composes `ROLES`
 * (8 internal ops + 2 portal + 3 third-party). ADR-0004: `MANDATE_LEAD` and `ACCOUNTANT` were
 * synonyms and were deleted; **`APPROVER` was removed outright, not remapped** — a standing
 * approver seat would create the second approval authority BR-105/BR-1103 forbid, and there
 * is deliberately no successor value.
 *
 * A test compares this list to `schema.prisma`'s `enum Role` (translated through
 * `packages/auth`'s `DB_ROLE_TO_ROLE_KEY`), reading both files as text, so the three sides
 * cannot drift again. The DB spelling differs in exactly one place: `SYSTEM_ADMIN` ↔ `admin`.
 */
export const ROLE_KEYS = [
  // internal ops (§2.1)
  'nazir',
  'authorized_rep',
  'case_manager',
  'finance',
  'compliance_officer',
  'aml_officer',
  'admin',
  'leadership',
  // client / beneficiary portal (§2.2)
  'family_board',
  'beneficiary',
  // oversight / third parties (§2.3)
  'subcontractor',
  'auditor',
  'counsel',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

const ROLE_KEY_SET: ReadonlySet<string> = new Set(ROLE_KEYS);

/**
 * Narrow untrusted input (a database row, a URL segment, a JSON body) to a role key.
 *
 * Two role vocabularies are live at once — the SCREAMING_SNAKE DB enum and these snake_case
 * product keys — so `'NAZIR'` and `'nazir '` are both realistic inputs. Both are refused
 * here: translation from the DB spelling is `roleKeyFromDbRole` in `packages/auth`, and it is
 * a deliberate call, not something this predicate does for free.
 */
export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && ROLE_KEY_SET.has(value);
}

/**
 * The ONLY place the Prisma `Role` spelling and the product key differ by more than case.
 * ADR-0004 left `SYSTEM_ADMIN` its DB spelling; §10.2 calls the seat `admin`.
 */
export const DB_ROLE_KEY_EXCEPTIONS: Readonly<Record<string, RoleKey>> = {
  SYSTEM_ADMIN: 'admin',
};

/**
 * Translate a Prisma `Role` value (`'NAZIR'`) to a product role key (`'nazir'`).
 *
 * A DERIVATION, not a second table: lower-case the enum value, with the one documented
 * exception above. That is deliberate — `packages/auth` states the same mapping as an explicit
 * literal table (it must stay dependency-free and importable from an edge middleware), and a
 * test asserts the two agree for **every** value of `schema.prisma`'s `enum Role`, reading both
 * files as text. Three sides, compared; no hand-copied list.
 *
 * Which to use: anything that already depends on `@qmulate/auth` should use its
 * `roleKeyFromDbRole`. `packages/database` must use this one — importing `auth` from `database`
 * would be a cycle.
 *
 * **Fails closed:** an unmapped or unknown value returns `undefined`, and every consumer here
 * treats `undefined` as "holds nothing". A new enum value therefore cannot silently acquire a
 * preset.
 */
export function roleKeyFromDbRole(dbRole: unknown): RoleKey | undefined {
  if (typeof dbRole !== 'string') return undefined;

  const exception = DB_ROLE_KEY_EXCEPTIONS[dbRole];
  if (exception !== undefined) return exception;

  // Only a canonical SCREAMING_SNAKE value translates: 'nazir', 'Nazir' and 'NAZIR ' do not.
  if (!/^[A-Z][A-Z_]*$/.test(dbRole)) return undefined;

  const candidate = dbRole.toLowerCase();
  return isRoleKey(candidate) ? candidate : undefined;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE APPROVAL AUTHORITY. One constant. One role.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The set of roles that may hold an `approve` or `sign` verb — **exactly `{ nazir }`**
 * (S2 decisions D-1 and D-2, both user decisions).
 *
 * Written down once, as data, so the answer is greppable and changing it is a visible,
 * single-line diff that a reviewer cannot miss. A test asserts this constant equals the set
 * DERIVED by scanning {@link ROLE_PRESETS} for approve/sign verbs, so the declaration and the
 * table can never disagree — the Sprint-1 lesson: wherever a rule is stated twice, make one
 * side test the other.
 *
 * - `leadership` is NOT here (D-1). §3's parenthetical "and, within the leadership authority
 *   matrix, `leadership` for portfolio-level matters" is the drifted side: §3's own TABLE,
 *   §2.1 and §11's stated default all give leadership read-only. There is deliberately no
 *   leadership-authority-matrix Setting — an empty configurable is a foothold.
 * - `authorized_rep` is NOT here, absolutely (D-2). §2.1's "may initiate but never solely
 *   authorize" is the drifted side: it invites a co-authorization reading that would create a
 *   second approval authority by prose ambiguity. Nazarah Art. 11(5) joint-and-several
 *   liability is about LIABILITY, not authority; BR-105 leaves accountability undivided.
 * - `admin` is NOT here: config authority ≠ governance authority (§2.1).
 * - `family_board`'s recorded principal consent is a chain-STEP, not an approval (§9/MP-07).
 */
export const APPROVAL_AUTHORITY_ROLES = ['nazir'] as const;

export type ApprovalAuthorityRole = (typeof APPROVAL_AUTHORITY_ROLES)[number];

const APPROVAL_AUTHORITY_SET: ReadonlySet<string> = new Set(APPROVAL_AUTHORITY_ROLES);

/** May this role hold approval authority at all? Fails closed on anything unrecognised. */
export function isApprovalAuthorityRole(role: unknown): role is ApprovalAuthorityRole {
  return typeof role === 'string' && APPROVAL_AUTHORITY_SET.has(role);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · ROLE_PRESETS — §3's grid, transcribed
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Verb mapping: R → read · W → write · i → initiate · A/A* → approve · S/S* → sign.
 *
 * The grid's parenthetical qualifiers are NOT verbs and are not encoded in the permission
 * string. They are enforced by other fields of the grant and by the Prisma force-filter:
 *   · `(scoped)` → `WaqfAccessGrant.scopeRefs` (the task/case/engagement ids in remit);
 *   · `self`     → `WaqfAccessGrant.beneficiarySelfId` (§5 identity isolation, applied
 *                  BEFORE role logic so no role can widen it);
 *   · `(agg)`    → aggregate-only projections at the query layer;
 *   · `aml`      → `WaqfAccessGrant.amlCompartment` membership (§6);
 *   · `(config)` → the `admin` module, which is where configuration authority is expressed.
 * A permission string that pretended to encode them would be a second, disagreeing source of
 * truth for scoping.
 *
 * The star on the A and S cells (TOTP step-up) is likewise not in the string:
 * `TOTP_STEP_UP_ACTIONS` in
 * `packages/auth` gates it by VERB, for every role, which is strictly stronger than the grid.
 *
 * Two deliberate narrowings of the grid, both in the safe direction, both flagged for report:
 *   1. `beneficiary` is given `reporting:statement:read` instead of the grid's `R self` on
 *      "Finance: capture". AC-2 requires a beneficiary's raw-ledger read to return the EMPTY
 *      set — statements, never the ledger — so granting `finance:transaction:read` at all
 *      would contradict the acceptance criterion.
 *   2. The `aml` module is held in a preset ONLY by `aml_officer`. §6 says no role reads the
 *      compartment — "including the Nazir by default" — without explicit membership, so the
 *      other roles' `aml` cells confer no preset permission; membership is provisioned
 *      explicitly and is audited (§6).
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Role → the permissions that role may hold. **A CEILING, not a default.**
 *
 * A `WaqfAccessGrant` carries its own `permissions` array; the resolved set is the
 * INTERSECTION of that array with this preset ({@link resolveGrantPermissions}), and a write
 * outside the preset is refused ({@link assertGrantPermissionsWithinPreset}). So a grant may
 * narrow, never widen (§10 principle 3).
 *
 * The registry is CLOSED: `ROLE_PRESETS[unknownRole]` is `undefined`, and every consumer here
 * treats that as **no permissions at all**.
 */
export const ROLE_PRESETS: Readonly<Record<RoleKey, readonly PermissionString[]>> = {
  /**
   * **SPEC** §2.1: "Full read/write on **assigned** endowments; **sole holder** of `sign` on reserved
   * matters and final `approve` on money/filing runs; **cannot be bypassed**."
   *
   * **NOT ENFORCED HERE — "cannot be bypassed" is the SPEC's posture, not a property of this
   * table.** This list is a CEILING on what a `nazir` grant may hold. It cannot make the Nazir
   * unbypassable: that requires the procedure ladder, the database guards, and — for the SQL path —
   * privilege separation, which landed in ADR-0008 round 6 (the runtime database role holds no write
   * on the authorization plane and owns no table). Even with all three, "cannot be bypassed" remains
   * bounded by who holds the provisioning and migrator credentials, which is a deployment property.
   * Quoting this comment as evidence that the Nazir cannot be bypassed is the mistake N-6 is about.
   *
   * **SPEC**, grid row by row: `R W S*` · `R W` · `R W` · `R A* S*` · `R A*` · `R W A*` · aml ·
   * `R W A*` · `R W` · `R` · `R (own endowments)` · `R`.
   *
   * **ENFORCED HERE:** the only preset in this table that may contain `approve` or `sign` — and a
   * test derives that set from the table rather than trusting this sentence.
   */
  nazir: [
    // Endowment & deed — R W S*  (the S* is on the deed: a waqf row is not "signed")
    'endowment:waqf:read',
    'endowment:waqf:write',
    'endowment:deed:read',
    'endowment:deed:write',
    'endowment:deed:sign',
    'endowment:asset:read',
    'endowment:asset:write',
    // Beneficiary & UBO — R W
    'beneficiary:beneficiary:read',
    'beneficiary:beneficiary:write',
    'beneficiary:ubo:read',
    'beneficiary:ubo:write',
    // Finance: capture — R W
    'finance:transaction:read',
    'finance:transaction:write',
    'finance:bank_account:read',
    'finance:bank_account:write',
    // ⊕ The ṣiyāna reserve percentage under a SILENT deed (OQ-06, product owner 2026-08-18: "the
    // law gives the nazir a discretion. at Qmulate each endownment will have a % set deserve at the
    // nazir's discretion"). ⚠ THIS PRESET AND NO OTHER — `finance` holds the capture verbs but not
    // this one, because reserving yield before distribution is a trustee's judgement about the
    // asset, not a bookkeeping act.
    'finance:maintenance_policy:read',
    'finance:maintenance_policy:write',
    // Finance: bank/distribution run — R A* S*   (never `write`/`initiate`: the Nazir is the
    // checker on money movement and must never be the maker — §4.2.)
    'distribution:run:read',
    'distribution:run:approve',
    'distribution:run:sign',
    'distribution:line_item:read',
    'distribution:bank_movement:read',
    'distribution:bank_movement:approve',
    // Nazir fee — R A*   (BR-507: a fee-basis change is a nazir A* action — EXIT-3.)
    'fee:nazir_fee:read',
    'fee:nazir_fee:approve',
    // Compliance tasks & filings — R W A*   (the A* is on the filing.)
    'compliance:task:read',
    'compliance:task:write',
    'compliance:filing:read',
    'compliance:filing:write',
    'compliance:filing:approve',
    // AML / SAR compartment — `aml`: membership only, never a preset permission (§6).
    // Legal & judicial cases — R W A*   (the A* is on the reserved matter.)
    'legal:case:read',
    'legal:case:write',
    'legal:reserved_matter:read',
    'legal:reserved_matter:write',
    'legal:reserved_matter:approve',
    // Document vault — R W
    'document:document:read',
    'document:document:write',
    // Reporting & dashboards — R
    'reporting:report:read',
    // Admin / access matrix — R (own endowments) only: the Nazir does not configure the matrix.
    'admin:access_matrix:read',
    // Audit trail — R
    'audit:event:read',
    // Approval requests — R A   (the seed already depends on both of these.)
    'approval:request:read',
    'approval:request:approve',
  ],

  /**
   * **SPEC** §2.1: "Scoped write **within an active delegation grant only**; may `initiate` but never
   * solely `authorize` a reserved matter."
   *
   * D-2 (user decision) makes that exclusion ABSOLUTE: **no `approve`, no `sign`, in any
   * combination, on any module.** The looser "never SOLELY" wording is the drifted side —
   * §3's grid gives `authorized_rep` no A or S cell in any of the twelve rows, and §8 excludes
   * approve/sign from every delegatable scope, and `authorized_rep` IS the delegation role.
   */
  authorized_rep: [
    'endowment:waqf:read',
    'endowment:waqf:write',
    'endowment:deed:read',
    'endowment:deed:write',
    'endowment:asset:read',
    'endowment:asset:write',
    'beneficiary:beneficiary:read',
    'beneficiary:beneficiary:write',
    'beneficiary:ubo:read',
    'beneficiary:ubo:write',
    'finance:transaction:read',
    'finance:transaction:write',
    'finance:bank_account:read',
    'finance:bank_account:write',
    // R i(scoped) — initiate, never authorize.
    'distribution:run:read',
    'distribution:run:initiate',
    'distribution:line_item:read',
    'distribution:bank_movement:read',
    'distribution:bank_movement:initiate',
    'fee:nazir_fee:read',
    'compliance:task:read',
    'compliance:task:write',
    'compliance:filing:read',
    'compliance:filing:write',
    'legal:case:read',
    'legal:case:write',
    'legal:reserved_matter:read',
    'legal:reserved_matter:write',
    'document:document:read',
    'document:document:write',
    'reporting:report:read',
    'audit:event:read',
    // May raise a request; may never resolve one.
    'approval:request:read',
    'approval:request:initiate',
  ],

  /**
   * **SPEC** §2.1: "Read/write on tasks, filings, calendar, documents; **submits** money/filing/
   * reserved items for approval; no bank-movement or sign authority."
   */
  case_manager: [
    'endowment:waqf:read',
    'endowment:waqf:write',
    'endowment:deed:read',
    'endowment:deed:write',
    'endowment:asset:read',
    'endowment:asset:write',
    'beneficiary:beneficiary:read',
    'beneficiary:beneficiary:write',
    'beneficiary:ubo:read',
    'beneficiary:ubo:write',
    'finance:transaction:read',
    'finance:bank_account:read',
    'distribution:run:read',
    'distribution:run:initiate',
    'distribution:line_item:read',
    'fee:nazir_fee:read',
    'compliance:task:read',
    'compliance:task:write',
    'compliance:filing:read',
    'compliance:filing:write',
    'legal:case:read',
    'legal:reserved_matter:read',
    'document:document:read',
    'document:document:write',
    'reporting:report:read',
    'audit:event:read',
    'approval:request:read',
    'approval:request:initiate',
  ],

  /**
   * **SPEC** §2.1: "Read/write finance; **initiates** (never solely authorizes) bank movements &
   * distribution runs; **maker under SoD**; commingling hard-blocked."
   *
   * This is the maker in AC-4: a user who legitimately holds BOTH `finance` and `nazir` grants
   * on one endowment (§4.2's small-team case) is still blocked from approving a run they
   * initiated — but that block is an IDENTITY check in the procedure layer, not a role check.
   * Nothing in this preset can express it.
   */
  finance: [
    // Endowment & deed — R ONLY. §3 row 1 gives `finance` no W cell, and round-3 finding N-1
    // measured the consequence of the force-filter never checking it: this seat rewrote
    // waqf-001's `classification` (MEDIUM -> LARGE), its `fiscalYearEnd` (12-31 -> 06-30), its
    // `type` and `entitlementOrder`, and the TrusteeshipDeed's `primaryNazir`.
    'endowment:waqf:read',
    'endowment:deed:read',
    'endowment:asset:read',
    'beneficiary:beneficiary:read',
    'beneficiary:ubo:read',
    // Finance: capture — R W
    'finance:transaction:read',
    'finance:transaction:write',
    'finance:bank_account:read',
    'finance:bank_account:write',
    // Finance: bank/distribution run — R W i
    'distribution:run:read',
    'distribution:run:write',
    'distribution:run:initiate',
    'distribution:line_item:read',
    'distribution:line_item:write',
    'distribution:bank_movement:read',
    'distribution:bank_movement:write',
    'distribution:bank_movement:initiate',
    // Nazir fee — R W i  (initiates a fee-basis change; only the Nazir approves it.)
    'fee:nazir_fee:read',
    'fee:nazir_fee:write',
    'fee:nazir_fee:initiate',
    'compliance:task:read',
    'compliance:filing:read',
    'document:document:read',
    'document:document:write',
    'reporting:report:read',
    'audit:event:read',
    'approval:request:read',
    'approval:request:initiate',
  ],

  /**
   * **SPEC** §2.1: "Read across assigned endowments; write compliance/UBO/KYC/legal-case state;
   * raise/close obligations; **AML-compartment member** (see §6); no money authorization."
   *
   * The AML membership is a per-endowment grant flag, not a preset permission — see the
   * `aml_officer` note below and §6.
   */
  compliance_officer: [
    'endowment:waqf:read',
    'endowment:waqf:write',
    'endowment:deed:read',
    'endowment:deed:write',
    'endowment:asset:read',
    'endowment:asset:write',
    'beneficiary:beneficiary:read',
    'beneficiary:beneficiary:write',
    'beneficiary:ubo:read',
    'beneficiary:ubo:write',
    'finance:transaction:read',
    'finance:bank_account:read',
    'distribution:run:read',
    'distribution:line_item:read',
    'fee:nazir_fee:read',
    'compliance:task:read',
    'compliance:task:write',
    'compliance:filing:read',
    'compliance:filing:write',
    'legal:case:read',
    'legal:case:write',
    'legal:reserved_matter:read',
    'legal:reserved_matter:write',
    'document:document:read',
    'document:document:write',
    'reporting:report:read',
    'audit:event:read',
    'approval:request:read',
    'approval:request:initiate',
  ],

  /**
   * **SPEC** §2.1: "The *only* role that can read/write the AML SAR compartment (§6). Usually held **in
   * addition** to `compliance_officer`. Membership is explicit and per-endowment; never
   * implied by seniority."
   *
   * MP-24: an AML compartment decision can only ever **block**, never approve. There is no
   * approve/sign verb anywhere in this preset, and no `aml:*:approve` permission exists in the
   * registry at all — so an approval authority cannot come to live inside the compartment the
   * legally accountable Nazir cannot audit.
   *
   * Holding these permissions is necessary but NOT sufficient: the grant must also carry
   * `amlCompartment = true` for the endowment. Membership is the gate; this is the capability.
   */
  aml_officer: [
    'beneficiary:beneficiary:read',
    'beneficiary:ubo:read',
    'aml:sar:read',
    'aml:sar:write',
    'document:document:read',
    'document:document:write',
    'reporting:report:read',
    'audit:event:read',
  ],

  /**
   * **SPEC** §2.1: "Configuration, user/role, and access-matrix management; **cannot `approve`/`sign`**
   * money, filings, or reserved matters (config authority ≠ governance authority)."
   *
   * `admin` provisions the seats that CAN approve, which is itself an audited, reserved-adjacent
   * action (§4.1: an access-matrix change on a live endowment requires a recorded Nazir
   * acknowledgement). MP-17: writing `waqf_access_grant` requires `admin:access_matrix:write`,
   * and a self-issued grant is separately unrepresentable at the database.
   */
  admin: [
    'endowment:waqf:read',
    'endowment:waqf:write',
    'endowment:deed:read',
    'endowment:deed:write',
    'endowment:asset:read',
    'endowment:asset:write',
    'beneficiary:beneficiary:read',
    'beneficiary:beneficiary:write',
    'beneficiary:ubo:read',
    'beneficiary:ubo:write',
    'compliance:task:read',
    'compliance:task:write',
    'compliance:filing:read',
    'compliance:filing:write',
    'document:document:read',
    'document:document:write',
    'reporting:report:read',
    // The configuration plane. `admin:setting:write` initiates a fee-basis change (EXIT-3);
    // the change itself still needs `fee:nazir_fee:approve`, which admin does not hold.
    'admin:access_matrix:read',
    'admin:access_matrix:write',
    'admin:setting:read',
    'admin:setting:write',
    'audit:event:read',
    'approval:request:read',
    'approval:request:initiate',
  ],

  /**
   * **SPEC** §2.1: "Read portfolio dashboards across clients/waqifs/endowments; **no per-endowment
   * operational write** by default."
   *
   * D-1 (user decision): **read-only, with NO approve and NO sign on any module**, and no
   * "leadership authority matrix" configurable — not even one defaulting to empty. §11 records
   * the depth as commercially unsettled with "default = read-only"; §3's parenthetical is the
   * single textual hook in the entire spec for a second approval role, and it is overridden.
   */
  leadership: [
    'endowment:waqf:read',
    'endowment:deed:read',
    'endowment:asset:read',
    'beneficiary:beneficiary:read',
    'finance:transaction:read',
    'finance:bank_account:read',
    'distribution:run:read',
    'distribution:line_item:read',
    'fee:nazir_fee:read',
    'compliance:task:read',
    'compliance:filing:read',
    'legal:case:read',
    'legal:reserved_matter:read',
    'document:document:read',
    'reporting:report:read',
    'admin:access_matrix:read',
    'audit:event:read',
    'approval:request:read',
  ],

  /**
   * **SPEC** §2.2: "Read reporting for **their** endowment(s); record reserved-matter
   * approvals/decisions on-record; manage family-side contacts. **No operational write** into
   * finance/compliance."
   *
   * MP-07: the principal's recorded consent is a separate CHAIN-STEP record — it can never set
   * an `ApprovalRequest` to APPROVED and can never open the Shart al-Waqif gate. So there is
   * no approve, no sign, and deliberately no `approval:request:write` here; the chain-step
   * model is E11's, and E2 does not invent it.
   */
  family_board: [
    'endowment:waqf:read',
    'endowment:deed:read',
    'endowment:asset:read',
    'beneficiary:beneficiary:read',
    'finance:transaction:read',
    'distribution:run:read',
    'distribution:line_item:read',
    'fee:nazir_fee:read',
    'legal:case:read',
    'legal:reserved_matter:read',
    'document:document:read',
    'reporting:report:read',
    'admin:access_matrix:read',
    'approval:request:read',
  ],

  /**
   * **SPEC** §2.2: "Read **own** entitlements/statements/distributions only; submit own KYC & documents;
   * messaging. **Hard identity isolation** (§5)."
   *
   * ⚠ **"submit own KYC & documents" IS RULED AND UNBUILT — the gap is TIMING, not model.** Product
   * owner, **Q-E4-2, 2026-08-18**, verbatim: *"beneficiary should enter their own kyc info - staff
   * verifies and can request more."* The model is therefore **beneficiary-entered, staff-verified,
   * with a request-more loop** (the beneficiary is the maker of their own KYC record), and it **ships
   * with the portal epic** (owner timing, same date). `beneficiary:beneficiary:write` sits in this
   * list for that surface; the force filter's write-nothing posture (C-07) is the **interim**, during
   * which staff enter KYC on a beneficiary's behalf. **Staff-entry is not the design** and must not be
   * recorded as one.
   *
   * Every permission here is additionally narrowed to `beneficiarySelfId` by the force-filter,
   * BEFORE role logic, so no role can widen it. `reporting:statement:read` — never
   * `reporting:report:read` (the grid: a beneficiary holds no aggregate read) and never
   * `finance:transaction:read` (AC-2: statements, never the raw ledger).
   *
   * ── `endowment:deed:read` — THE ONE ENDOWMENT VERB, ADDED BY OWNER RULING Q-E4-1(a) ─────────
   * **SPEC**, and it is a RULING and not a reading: the product owner answered Q-E4-1 with option
   * (a) on 2026-08-18 (`docs/product/prd/S4-owner-decision-memo.md`, "S5 addendum") — *every
   * beneficiary principal of a waqf may read THAT waqf's deed; self-isolation otherwise
   * untouched.* It settles D-E's *"deed can be seen by nazir, case manager and elegible
   * beneficiaries"* against the objection that *"eligible"* is a computed, frontier-varying,
   * never-persisted fact which no row can carry. The owner accepted the named consequence: a
   * member currently HELD behind a living ancestor, or excluded under a line the deed does not
   * continue, reads it too — the deed is what tells them why.
   *
   * ⚠ **"SCOPED TO OWN WAQF" IS NOT ENFORCED BY THIS LINE AND IS NOT A PROPERTY OF THIS TABLE.**
   * A preset is a CEILING over permission strings; it has never seen an endowment. What makes the
   * read own-waqf-only is that `WaqfAccessGrant` is per-endowment and rung 2 resolves the grant for
   * the REQUESTED `waqfId` (`resolveScope`) — a beneficiary holding one grant on waqf-001 gets
   * `NO_GRANT` → NOT_FOUND on waqf-002's deed, and would still get it if this list were longer.
   * The claim is measured in `packages/api/test/beneficiary-deed-read.integration.test.ts`, on a
   * foreign endowment that DOES have a deed, so the refusal cannot pass vacuously.
   *
   * ⚠ **NOT `endowment:waqf:read`, DELIBERATELY.** The endowment record stays invisible to the
   * portal seat, and with it `endowment.get`'s three-field trusteeship SUMMARY (gated by
   * `ENDOWMENT_RECORD_READ`, a different string — V-E3-03). The ruling opened the deed, not the
   * endowment; the widening is exactly one door and the neighbouring one is asserted still shut.
   *
   * ⚠ **RECORDED, NOT NARROWED:** `deed.verifyEligibility` is mounted on this same string, so the
   * portal seat can now reach it. It is a PURE dry run over caller-supplied flags — it touches no
   * row and discloses nothing about the endowment or any person — so it is left reachable and
   * named here rather than re-gated on `:write`, which would silently narrow the `case_manager`
   * seat the owner ruled on in D-E. Pinned as disclosing nothing stored, in the same file.
   */
  beneficiary: [
    'beneficiary:beneficiary:read',
    'beneficiary:beneficiary:write',
    // Owner ruling Q-E4-1(a), 2026-08-18 — see the block comment above. Own-waqf scoping is the
    // grant's, not this line's.
    'endowment:deed:read',
    'distribution:line_item:read',
    'document:document:read',
    'document:document:write',
    'reporting:statement:read',
  ],

  /**
   * **SPEC** §2.3: "**Scoped task access** to assigned work items on one endowment only; submit
   * evidence/documents to their remit; **no** finance, legal, beneficiary-PII, or AML access
   * unless separately granted."
   *
   * The grid's Document-vault cell is `W scoped` — write without read. Transcribed faithfully:
   * a subcontractor uploads evidence into the vault, it does not browse it. Everything is
   * additionally intersected with `scopeRefs` (§7.2).
   */
  subcontractor: ['compliance:task:read', 'compliance:task:initiate', 'document:document:write'],

  /**
   * **SPEC** §2.3: "Read-only, **scoped to an audit engagement window**; consumes evidence packs &
   * audit-ready financials." Read-only in the strictest sense: no write, no initiate, and — as
   * with every role but `nazir` — no approve and no sign.
   */
  auditor: [
    'endowment:waqf:read',
    'endowment:deed:read',
    'endowment:asset:read',
    'beneficiary:beneficiary:read',
    'finance:transaction:read',
    'finance:bank_account:read',
    'distribution:run:read',
    'distribution:line_item:read',
    'fee:nazir_fee:read',
    'compliance:task:read',
    'compliance:filing:read',
    'legal:case:read',
    'legal:reserved_matter:read',
    'document:document:read',
    'reporting:report:read',
    'audit:event:read',
    'approval:request:read',
  ],

  /**
   * **SPEC** §2.3: "Scoped read on reserved-matter dossiers, legal cases, and relevant documents for
   * matters they are engaged on."
   *
   * **SPEC** §9 / §3's chain row (BR-1102) places counsel at the **REVIEW** step of the
   * reserved-matter chain — a review, and neither an initiation nor an approval:
   * initiator → `family_board` principal approval → **`counsel` review** → Authority
   * approval/notice where required → `nazir` `S*`. So counsel authors the LEGAL CASE and holds no
   * initiate, no approve and no sign.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * ⚠ `legal:reserved_matter:write` WAS IN THIS PRESET AND IS GONE — **product owner, 2026-08-16
   * (decision D-D).** Asked *"Should counsel be able to mark a matter reserved?"* he answered
   * ***"no"***. This preset was **the drifted side**: §9's chain above already said review, not
   * initiation, and so does ADR-0005 (initiation sits with the Nazir and the authorized
   * representative). The router's holder set is DERIVED from this table, so it drifted with the
   * preset — that is V-E3-M3.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   *
   * **The removal was measured before it was made, so it is known to take away exactly one thing.**
   * Walking the MOUNTED tRPC router (`appRouter._def.procedures`, reading the permission each
   * endowment-scope middleware actually enforces): **1 of 30 procedures enforces that verb —
   * `reservedMatter.markReserved`**. Walking `DOMAIN_WRITE_POLICIES`: **0 of 21 models require it**
   * (the only `legal:*` model gate is `LegalCase → legal:case:write`). Every other occurrence in the
   * repo is a HOLDER — a preset here, or a fixture grant — not a consumer. Holding this verb
   * therefore meant precisely *"may mark a matter reserved"*, which is the sentence the owner said no
   * to. **ENFORCED HERE:** the derived holder set for that verb goes
   * `[nazir, authorized_rep, compliance_officer, counsel]` → `[nazir, authorized_rep,
   * compliance_officer]`; nothing else in this table moves.
   *
   * **§3 row 8's module cell is unchanged, deliberately.** "Legal & judicial cases" reads
   * `R W(scoped)` for `counsel`, and that `W` is carried by `legal:case:write` — the dossier counsel
   * actually authors. The `legal` module has TWO resources (`case`, `reserved_matter`); reading one
   * module-level `W` as reaching both resources is how an initiation verb arrived here in the first
   * place.
   *
   * ⚠ **AND IT IS NOT TO BE REPAIRED FROM THE OTHER END.** The owner's answer was *no*, so counsel
   * gains **no** approval-module verb in exchange: not `approval:request:initiate`, not `:approve`.
   * **ENFORCED HERE:** counsel holds `approval:request:read` and nothing else in that module.
   */
  counsel: [
    'endowment:waqf:read',
    'endowment:deed:read',
    'endowment:asset:read',
    'beneficiary:beneficiary:read',
    'compliance:task:read',
    'compliance:filing:read',
    'legal:case:read',
    'legal:case:write',
    'legal:reserved_matter:read',
    'document:document:read',
    'reporting:report:read',
    'audit:event:read',
    'approval:request:read',
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The algebra
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The permissions a role's preset grants. **Fails closed:** an unknown role — `'APPROVER'`,
 * `'NAZIR'`, `'nazir '`, `''`, `null`, a number — expands to the EMPTY set, never to a default.
 *
 * Returns a fresh array, so a caller cannot mutate the preset table through the result.
 */
export function expandRolePreset(role: unknown): readonly PermissionString[] {
  if (!isRoleKey(role)) return [];
  return [...ROLE_PRESETS[role]];
}

/**
 * Does this held permission set contain `required`?
 *
 * **Exact match on registered strings only.** No prefix matching, no wildcards, no
 * normalisation: an unregistered string on either side simply does not match, so a typo denies
 * and `'approval:request:*'` grants nothing.
 */
export function hasPermission(held: Iterable<unknown>, required: unknown): boolean {
  const target = parsePermission(required);
  if (target === undefined) return false;

  for (const candidate of held) {
    // Both sides are re-validated. `required` already parsed, so `===` alone would do today;
    // the second check is the belt that keeps this exact-match even if `parsePermission` is
    // ever loosened. There is deliberately no `startsWith`, no `endsWith(':*')`, no `split`.
    if (candidate === required && isPermissionString(candidate)) return true;
  }
  return false;
}

/**
 * Could a holder of this ROLE PRESET perform this permission?
 *
 * A capability question about the preset — **not** an authorization decision. A real
 * authorization decision is per-endowment and must resolve the caller's `WaqfAccessGrant`
 * (see {@link resolveGrantPermissions}); a role-shaped check would grant approval on every
 * endowment the user touches, which is exactly the bug MP-12 exists to prevent.
 *
 * **Fails closed** on an unknown role and on an unregistered permission.
 */
export function can(role: unknown, permission: unknown): boolean {
  // `isRoleKey` is the ONLY gate: the preset table is total over ROLE_KEYS (asserted by a
  // test that reads schema.prisma), so a narrowed role always has a preset. Anything that
  // does not narrow — 'APPROVER', 'NAZIR', 'nazir ', '', null — denies here.
  if (!isRoleKey(role)) return false;
  return hasPermission(ROLE_PRESETS[role], permission);
}

/**
 * The INTERSECTION of two permission sets — the only direction this function moves.
 *
 * Unregistered strings are dropped rather than passed through, and the result is
 * de-duplicated and ordered by `ceiling` so it is stable for snapshots and audit payloads.
 * `narrowPermissions(x, y)` is always a subset of BOTH `x` and `y`; there is no argument order
 * that widens.
 */
export function narrowPermissions(
  requested: Iterable<unknown>,
  ceiling: Iterable<unknown>,
): PermissionString[] {
  const requestedSet = new Set<string>();
  for (const value of requested) {
    if (isPermissionString(value)) requestedSet.add(value);
  }

  const result: PermissionString[] = [];
  const seen = new Set<string>();
  for (const value of ceiling) {
    if (!isPermissionString(value)) continue;
    if (!requestedSet.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/**
 * READ-TIME resolution of a grant's effective permissions: `grant.permissions ∩ preset(role)`.
 *
 * This is the half of the ceiling that survives a bad write. `WaqfAccessGrant.permissions` is
 * a free-text `String[]` that Sprint 1 shipped as "stored but not yet interpreted", so an
 * already-widened row can exist — written raw, migrated in, or seeded by a PROVISIONAL
 * fixture. Intersecting on read means such a row still grants nothing extra: a grant that
 * keeps `role = FINANCE` while appending `approval:request:approve` resolves to no approval
 * capability at all.
 *
 * An unknown role resolves to the EMPTY set. An empty `permissions` array resolves to the
 * empty set too — the preset is a **ceiling, not a default**; expanding a role to its preset
 * is the separate, deliberate {@link expandRolePreset} call.
 */
export function resolveGrantPermissions(
  role: unknown,
  storedPermissions: Iterable<unknown>,
): PermissionString[] {
  if (!isRoleKey(role)) return [];
  return narrowPermissions(storedPermissions, ROLE_PRESETS[role]);
}

/**
 * WRITE-TIME validation: every requested permission must be registered AND within the role's
 * preset. Returns the validated set; throws rather than silently narrowing, because a caller
 * asking for something outside the ceiling has a bug or an intent that needs refusing.
 *
 * - unknown role ⇒ `ROLE_UNKNOWN`
 * - unregistered string (incl. any wildcard) ⇒ `PERMISSION_INVALID`
 * - registered but outside the preset ⇒ `PERMISSION_ESCALATION`, naming the offenders
 */
export function assertGrantPermissionsWithinPreset(
  role: unknown,
  requested: Iterable<unknown>,
): PermissionString[] {
  if (!isRoleKey(role)) {
    throw new DomainError(
      'ROLE_UNKNOWN',
      `"${String(role)}" is not one of the thirteen role keys (§10.2 / ADR-0004). An unrecognised role holds nothing.`,
      { details: { role: typeof role === 'string' ? role : typeof role } },
    );
  }

  const validated = [...requested].map((value) => assertPermissionString(value));
  const preset: ReadonlySet<string> = new Set(ROLE_PRESETS[role]);
  const offending = validated.filter((permission) => !preset.has(permission));

  if (offending.length > 0) {
    throw new DomainError(
      'PERMISSION_ESCALATION',
      `role "${role}" may not hold ${String(offending.length)} requested permission(s): a grant may narrow its role preset, never widen it (§10 principle 3).`,
      { details: { role, offending } },
    );
  }

  return validated;
}

/**
 * Validate a proposed DELEGATION scope against the delegator's own permissions (§10 §8).
 *
 * Two independent refusals, in this order:
 * 1. **Non-delegable verbs.** Any `approve`/`sign` in the scope is rejected with
 *    `DELEGATION_NOT_DELEGABLE` — **even when the delegator legitimately holds it.** §8:
 *    "sign on reserved matters and final approve are excluded from any delegatable scope."
 *    Accountability is non-delegable (BR-105): a delegate may `initiate` a reserved matter;
 *    only the Nazir signs it. This check runs first precisely so that a Nazir's genuine
 *    holding can never be the thing that lets it through.
 * 2. **Subset of the delegator.** Every remaining permission must be one the delegator
 *    currently holds — `PERMISSION_ESCALATION` otherwise. A Nazir cannot delegate what they do
 *    not hold, and no delegate can hold more than the Nazir. The check is `every`, not `some`.
 *
 * Returns the narrowed scope on success. An empty scope is a legitimate no-op.
 *
 * **NOT proven here** (S2 decision D-7): `validUntil` expiry freezing in-flight work,
 * `jointlyLiable` display, and `viaDelegation` persistence all need the `Delegation` model,
 * which the schema does not have and E2 does not invent. AC-5 is therefore HALF-proven by
 * this function — say so; do not claim AC-5.
 */
export function assertDelegatableScope(
  delegatorPermissions: Iterable<unknown>,
  requestedScope: Iterable<unknown>,
): PermissionString[] {
  const scope = [...requestedScope].map((value) => assertPermissionString(value));

  const nonDelegable = scope.filter((permission) => {
    const parsed = parsePermission(permission);
    return parsed !== undefined && (NON_DELEGABLE_VERBS as readonly string[]).includes(parsed.verb);
  });
  if (nonDelegable.length > 0) {
    throw new DomainError(
      'DELEGATION_NOT_DELEGABLE',
      `approve/sign may never appear in a delegatable scope (§10 §8), even when the delegator holds them: ${nonDelegable.join(', ')}.`,
      { details: { nonDelegable, nonDelegableVerbs: [...NON_DELEGABLE_VERBS] } },
    );
  }

  const held: ReadonlySet<string> = new Set(
    [...delegatorPermissions].filter((value): value is PermissionString =>
      isPermissionString(value),
    ),
  );
  const beyondDelegator = scope.filter((permission) => !held.has(permission));
  if (beyondDelegator.length > 0) {
    throw new DomainError(
      'PERMISSION_ESCALATION',
      `a delegation scope must be a SUBSET of the delegator's active permissions (§10 §8); ${String(beyondDelegator.length)} requested permission(s) are not held by the delegator.`,
      { details: { beyondDelegator } },
    );
  }

  return scope;
}
