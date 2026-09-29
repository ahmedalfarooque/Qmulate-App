import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  APPROVAL_AUTHORITY_ROLES,
  APPROVAL_VERBS,
  GRID_ROW_TO_MODULE,
  MODULES_WITHOUT_GRID_ROW,
  NON_DELEGABLE_VERBS,
  PERMISSION_MODULES,
  PERMISSION_RESOURCES,
  PERMISSION_VERBS,
  ROLE_KEYS,
  ROLE_PRESETS,
  assertDelegatableScope,
  assertGrantPermissionsWithinPreset,
  assertPermissionString,
  can,
  expandRolePreset,
  hasPermission,
  isApprovalAuthorityRole,
  isApprovalPermission,
  isPermissionString,
  isRoleKey,
  narrowPermissions,
  parsePermission,
  resolveGrantPermissions,
  roleKeyFromDbRole,
  type PermissionString,
  type RoleKey,
} from '../access.js';
import { isDomainError, type DomainError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE EXISTS TO PROVE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **The Nazir is the sole approval authority, per endowment, and never the maker.**
 *
 * This file proves the FIRST of the three independent layers — the preset algebra. The
 * procedure ladder (packages/api) and Postgres (constraints + triggers) prove it again,
 * because a TypeScript-only proof is one `$executeRawUnsafe` away from irrelevant.
 *
 * Two habits are deliberate throughout:
 *
 * 1. **DERIVED, NOT ENUMERATED.** The headline assertion scans every preset for an
 *    approve/sign verb and compares the resulting set to `{ nazir }`. A newly-invented role
 *    carrying `approve` fails this test *whatever it is named* — an enumerated list would
 *    only ever catch the names someone thought to write down.
 * 2. **COMPARE THE TWO SIDES THAT MUST AGREE.** Sprint 1's two security holes both existed
 *    because nothing compared two sides that were supposed to agree. So the role vocabulary
 *    here is checked against `packages/database/prisma/schema.prisma`'s `enum Role` AND
 *    against `packages/auth/src/roles.ts`, both read as TEXT at test time (the domain package
 *    imports nothing internal). Neither side is hand-copied.
 */

/** Run `fn` and hand back whatever it threw (or `undefined` if it did not throw). */
function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function expectDomainCode(fn: () => unknown, code: string): void {
  const error = caught(fn);
  expect(isDomainError(error), `expected a DomainError(${code}), got: ${String(error)}`).toBe(true);
  expect((error as DomainError).code).toBe(code);
  expect((error as DomainError).messageKey).toBe(`errors.domain.${code}`);
}

function readRepoFile(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), 'utf8');
}

/** Every `(role, module, verb)` triple that any preset actually grants. */
function everyGrantedTriple(): Array<{
  role: RoleKey;
  module: string;
  resource: string;
  verb: string;
}> {
  const triples: Array<{ role: RoleKey; module: string; resource: string; verb: string }> = [];
  for (const role of ROLE_KEYS) {
    for (const permission of ROLE_PRESETS[role]) {
      const parsed = parsePermission(permission);
      expect(
        parsed,
        `preset ${role} carries an unparseable permission "${permission}"`,
      ).not.toBeUndefined();
      if (parsed !== undefined) triples.push({ role, ...parsed });
    }
  }
  return triples;
}

/** The set of roles holding ANY approve/sign verb — derived from the presets, never listed. */
function derivedApprovalAuthorityRoles(): Set<string> {
  return new Set(
    everyGrantedTriple()
      .filter((triple) => (APPROVAL_VERBS as readonly string[]).includes(triple.verb))
      .map((triple) => triple.role),
  );
}

describe('THE HEADLINE INVARIANT — exactly one role holds approve/sign, and it is nazir', () => {
  /** MP-01. The whole sprint reduces to this line. */
  it('derives the approval-authority set from the presets and it is exactly {nazir}', () => {
    expect(derivedApprovalAuthorityRoles()).toEqual(new Set(['nazir']));
  });

  /**
   * D-1/D-2 require approval authority to be DATA — one exported constant — rather than
   * literals scattered across presets. This is the two-sides comparison for that constant:
   * the declared set must equal the set the preset table actually produces.
   */
  it('the declared APPROVAL_AUTHORITY_ROLES constant equals the derived set', () => {
    expect(new Set(APPROVAL_AUTHORITY_ROLES)).toEqual(derivedApprovalAuthorityRoles());
    expect(APPROVAL_AUTHORITY_ROLES).toEqual(['nazir']);
    expect(isApprovalAuthorityRole('nazir')).toBe(true);
    for (const role of ROLE_KEYS) {
      if (role !== 'nazir') expect(isApprovalAuthorityRole(role)).toBe(false);
    }
    // Fail closed on junk, exactly as `can()` does.
    for (const junk of ['APPROVER', 'NAZIR', 'nazir ', '', null, undefined]) {
      expect(isApprovalAuthorityRole(junk)).toBe(false);
    }
  });

  /** §3 grid rule: "No internal operational role except `nazir` holds `S` (sign)." */
  it('only nazir holds sign, on any module', () => {
    const signers = new Set(
      everyGrantedTriple()
        .filter((triple) => triple.verb === 'sign')
        .map((triple) => triple.role),
    );
    expect(signers).toEqual(new Set(['nazir']));
  });

  /**
   * D-1 (user decision): `leadership` gets NO approve verb, and there is deliberately NO
   * "leadership authority matrix" Setting — not even one defaulting to empty, because an
   * empty configurable is a foothold. §3's parenthetical ("and, within the leadership
   * authority matrix, `leadership` for portfolio-level matters") is the drifted side.
   *
   * D-2 (user decision): `authorized_rep`'s exclusion is ABSOLUTE, not "never SOLELY" —
   * §2.1's looser wording invites a co-approver, and BR-105 puts undivided accountability on
   * the Nazir.
   *
   * §2.1 on `admin`: "cannot approve/sign money, filings, or reserved matters (config
   * authority ≠ governance authority)."
   */
  it.each(['authorized_rep', 'admin', 'leadership'] as const)(
    '%s holds NO approve and NO sign on ANY module — absolutely, not "not solely"',
    (role) => {
      const offending = ROLE_PRESETS[role].filter((permission) => {
        const parsed = parsePermission(permission);
        return parsed !== undefined && (APPROVAL_VERBS as readonly string[]).includes(parsed.verb);
      });
      expect(offending).toEqual([]);

      // And no combination of module × resource can be talked into it.
      for (const module of PERMISSION_MODULES) {
        for (const resource of PERMISSION_RESOURCES[module]) {
          for (const verb of APPROVAL_VERBS) {
            expect(can(role, `${module}:${resource}:${verb}`)).toBe(false);
          }
        }
      }
    },
  );

  /**
   * There is NO co-authorization concept in the type system (D-2). Nothing whose cardinality
   * on the approval side exceeds one may exist here — no `approvers: string[]`, no
   * `coApprovedByUserId`. This test pins the *shape* of the exported surface, because the
   * cheap way to reintroduce a second approval authority is a plural field name.
   */
  it('exports no plural/co-authorization approval concept', () => {
    // Comments are stripped first: the doc comments NAME these banned shapes in order to
    // forbid them, and the assertion is about the code, not the prose.
    const code = readRepoFile('../access.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const banned of ['approvers', 'coApprovedBy', 'coApprover', 'secondApprover']) {
      expect(code.includes(banned), `${banned} would model co-authorization`).toBe(false);
    }
    expect(APPROVAL_AUTHORITY_ROLES).toHaveLength(1);
  });
});

describe('the role vocabulary is the thirteen — checked against the other two sides', () => {
  /**
   * PARITY WITH `enum Role` IN schema.prisma, translated through `packages/auth`'s
   * DB→product-key map. Both files are read as TEXT: `packages/domain` imports nothing
   * internal (and `database` → `domain` already exists, so importing either would be a cycle).
   *
   * A new enum value therefore cannot ship without an explicit preset decision here — and if
   * that preset carries an approval verb, the headline test above fails.
   */
  it('ROLE_PRESETS is total over schema.prisma enum Role (thirteen values)', () => {
    const schema = readRepoFile('../../../database/prisma/schema.prisma');
    const block = /\benum\s+Role\s*\{([^}]*)\}/.exec(schema);
    expect(block, 'could not find `enum Role` in schema.prisma').not.toBeNull();

    const enumValues = (block?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z_]*$/.test(line));

    // The DB→product-key translation lives in packages/auth; parse it rather than restate it,
    // so the one spelling difference (SYSTEM_ADMIN ↔ admin) is never hand-copied twice.
    const authSource = readRepoFile('../../../auth/src/roles.ts');
    const mapBlock = /DB_ROLE_TO_ROLE_KEY[^=]*=\s*\{([\s\S]*?)\n\};/.exec(authSource);
    expect(
      mapBlock,
      'could not find DB_ROLE_TO_ROLE_KEY in packages/auth/src/roles.ts',
    ).not.toBeNull();

    const dbRoleToKey = new Map<string, string>();
    for (const line of (mapBlock?.[1] ?? '').split('\n')) {
      const entry = /^\s*([A-Z][A-Z_]*)\s*:\s*'([a-z_]+)'/.exec(line);
      if (entry !== null) dbRoleToKey.set(entry[1] ?? '', entry[2] ?? '');
    }

    expect(new Set(dbRoleToKey.keys())).toEqual(new Set(enumValues));
    expect(new Set([...dbRoleToKey.values()])).toEqual(new Set(ROLE_KEYS));
    expect(Object.keys(ROLE_PRESETS).sort()).toEqual([...ROLE_KEYS].sort());
    expect(ROLE_KEYS).toHaveLength(13);

    // ADR-0004: APPROVER was removed, NOT remapped. No successor value exists.
    for (const removed of ['MANDATE_LEAD', 'ACCOUNTANT', 'APPROVER']) {
      expect(enumValues).not.toContain(removed);
    }
  });

  /** ROLE_KEYS is in the same order as packages/auth's ROLES, parsed from that file. */
  it('ROLE_KEYS matches packages/auth ROLES in order', () => {
    const authSource = readRepoFile('../../../auth/src/roles.ts');
    const composed: string[] = [];
    for (const name of ['INTERNAL_OPS_ROLES', 'PORTAL_ROLES', 'THIRD_PARTY_ROLES']) {
      const arrayBlock = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(
        authSource,
      );
      expect(arrayBlock, `could not find ${name} in packages/auth/src/roles.ts`).not.toBeNull();
      for (const match of (arrayBlock?.[1] ?? '').matchAll(/'([a-z_]+)'/g)) {
        composed.push(match[1] ?? '');
      }
    }
    expect([...ROLE_KEYS]).toEqual(composed);
  });

  /**
   * THREE SIDES, COMPARED. `packages/domain` derives the DB→product-key translation;
   * `packages/auth` states it as a literal table; `schema.prisma` defines the enum. All three
   * must agree for every enum value — otherwise a role could resolve to one preset in the
   * database package and another in the API package.
   */
  it('roleKeyFromDbRole agrees with packages/auth for every schema.prisma enum Role value', () => {
    const schema = readRepoFile('../../../database/prisma/schema.prisma');
    const enumValues = (/\benum\s+Role\s*\{([^}]*)\}/.exec(schema)?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z_]*$/.test(line));
    expect(enumValues).toHaveLength(13);

    const authSource = readRepoFile('../../../auth/src/roles.ts');
    const mapBlock = /DB_ROLE_TO_ROLE_KEY[^=]*=\s*\{([\s\S]*?)\n\};/.exec(authSource);
    const authMap = new Map<string, string>();
    for (const line of (mapBlock?.[1] ?? '').split('\n')) {
      const entry = /^\s*([A-Z][A-Z_]*)\s*:\s*'([a-z_]+)'/.exec(line);
      if (entry !== null) authMap.set(entry[1] ?? '', entry[2] ?? '');
    }

    for (const value of enumValues) {
      expect(roleKeyFromDbRole(value), `${value} must translate`).not.toBeUndefined();
      expect(roleKeyFromDbRole(value)).toBe(authMap.get(value));
      expect(ROLE_PRESETS[roleKeyFromDbRole(value) as RoleKey]).toBeDefined();
    }
    expect(roleKeyFromDbRole('SYSTEM_ADMIN')).toBe('admin');
  });

  it('roleKeyFromDbRole fails closed on anything that is not a canonical enum value', () => {
    for (const junk of [
      'nazir',
      'Nazir',
      'NAZIR ',
      'APPROVER',
      'MANDATE_LEAD',
      '',
      null,
      undefined,
      7,
    ]) {
      expect(roleKeyFromDbRole(junk), `${String(junk)} must not translate`).toBeUndefined();
    }
  });

  it('isRoleKey narrows, and refuses every near-miss', () => {
    expect(isRoleKey('nazir')).toBe(true);
    for (const junk of [
      'NAZIR',
      'nazir ',
      ' nazir',
      'APPROVER',
      'Nazir',
      '',
      null,
      undefined,
      7,
      {},
    ]) {
      expect(isRoleKey(junk), `${String(junk)} must not narrow to a RoleKey`).toBe(false);
    }
  });
});

describe('the permission registry is CLOSED', () => {
  it('every preset permission is a registered module:resource:verb', () => {
    for (const role of ROLE_KEYS) {
      for (const permission of ROLE_PRESETS[role]) {
        expect(isPermissionString(permission), `${role}: ${permission}`).toBe(true);
      }
    }
  });

  it('has thirteen modules — the grid’s twelve rows plus `approval`', () => {
    expect(PERMISSION_MODULES).toHaveLength(13);
    expect(new Set(PERMISSION_MODULES)).toEqual(
      new Set([...Object.values(GRID_ROW_TO_MODULE), ...MODULES_WITHOUT_GRID_ROW]),
    );
    expect(Object.keys(GRID_ROW_TO_MODULE)).toHaveLength(12);
    // `approval` has no grid row: the grid models approval as the A*/S* verb on each domain
    // row, while the shipped seed additionally addresses the ApprovalRequest resource itself
    // (`approval:request:approve`). It is the ONLY grid-less module, and only nazir approves on it.
    expect(MODULES_WITHOUT_GRID_ROW).toEqual(['approval']);
  });

  /** The grid row labels are read out of the spec, so a renamed row cannot go unnoticed. */
  it('GRID_ROW_TO_MODULE covers exactly §10 §3’s twelve table rows', () => {
    const spec = readRepoFile('../../../../docs/product/prd/10-roles-access-matrix-spec.md');
    const rowLabels: string[] = [];
    for (const line of spec.split('\n')) {
      // Grid rows start `| **<label>** (BR-...)` or `| **<label>** (this doc)`.
      const match = /^\|\s*\*\*(.+?)\*\*\s*(\(|\|)/.exec(line);
      // 14 cells (module + 13 roles) → 16 pieces once the leading/trailing pipes are counted.
      if (match !== null && line.split('|').length === 16) rowLabels.push(match[1] ?? '');
    }
    expect(new Set(rowLabels)).toEqual(new Set(Object.keys(GRID_ROW_TO_MODULE)));
  });

  it('rejects an unregistered resource, module, or verb', () => {
    expect(isPermissionString('endowment:waqf:read')).toBe(true);
    expect(isPermissionString('endowment:not_a_resource:read')).toBe(false);
    expect(isPermissionString('not_a_module:waqf:read')).toBe(false);
    expect(isPermissionString('endowment:waqf:aprove')).toBe(false); // the typo must DENY
    expect(isPermissionString('endowment:waqf:delete')).toBe(false);
    expect(isPermissionString('endowment:waqf')).toBe(false);
    expect(isPermissionString('endowment:waqf:read:extra')).toBe(false);
    expect(isPermissionString('  endowment:waqf:read  ')).toBe(false); // no trimming
    expect(isPermissionString('Endowment:waqf:read')).toBe(false);
    for (const junk of ['', null, undefined, 7, {}, []]) {
      expect(isPermissionString(junk)).toBe(false);
    }
  });

  /** MP-19: wildcards grant NOTHING. This is how a least-privilege matrix becomes root. */
  it.each(['*', '*:*:*', 'approval:*', 'approval:request:*', 'approval:*:approve'])(
    'the wildcard %s is not a permission and grants nothing',
    (wildcard) => {
      expect(isPermissionString(wildcard)).toBe(false);
      expect(parsePermission(wildcard)).toBeUndefined();
      expect(hasPermission([wildcard], 'approval:request:approve')).toBe(false);
      expect(hasPermission(['approval:request:approve'], wildcard)).toBe(false);
      expect(can('nazir', wildcard)).toBe(false);
      expect(narrowPermissions([wildcard], ROLE_PRESETS.nazir)).toEqual([]);
    },
  );

  it('assertPermissionString throws PERMISSION_INVALID on anything unregistered', () => {
    expect(assertPermissionString('approval:request:approve')).toBe('approval:request:approve');
    expectDomainCode(() => assertPermissionString('approval:request:*'), 'PERMISSION_INVALID');
    expectDomainCode(() => assertPermissionString('aml:sar:aprove'), 'PERMISSION_INVALID');
    expectDomainCode(() => assertPermissionString(null), 'PERMISSION_INVALID');
  });

  it('parsePermission returns the triple for a registered string, undefined otherwise', () => {
    expect(parsePermission('distribution:run:approve')).toEqual({
      module: 'distribution',
      resource: 'run',
      verb: 'approve',
    });
    expect(parsePermission('distribution:run:approve ')).toBeUndefined();
  });

  it('every registered resource name is non-empty and colon-free', () => {
    for (const module of PERMISSION_MODULES) {
      expect(PERMISSION_RESOURCES[module].length).toBeGreaterThan(0);
      for (const resource of PERMISSION_RESOURCES[module]) {
        expect(resource).toMatch(/^[a-z][a-z_]*$/);
      }
    }
    expect(PERMISSION_VERBS).toEqual(['read', 'write', 'initiate', 'approve', 'sign']);
    expect(APPROVAL_VERBS).toEqual(['approve', 'sign']);
  });
});

describe('can() fails closed on every unrecognised input (MP-20)', () => {
  it('grants the positive control', () => {
    expect(can('nazir', 'approval:request:approve')).toBe(true);
    expect(can('finance', 'finance:transaction:write')).toBe(true);
  });

  /**
   * Two role vocabularies are live at once in this codebase — SCREAMING_SNAKE DB values and
   * snake_case product keys — and they differ in more than case in exactly one place
   * (SYSTEM_ADMIN ↔ admin). `'nazir '` off a database row and `'NAZIR'` off a URL segment are
   * both realistic inputs. `requiresTotpForDbRole` in packages/auth already fails safe by
   * design; this resolver has no such precedent, so it is pinned here.
   */
  it.each([
    ['APPROVER', 'the role ADR-0004 removed outright'],
    ['SOME_FUTURE_ROLE', 'an unknown role'],
    ['', 'empty string'],
    ['nazir ', 'trailing space off a DB row'],
    [' nazir', 'leading space'],
    ['NAZIR', 'the DB spelling where a product key is expected'],
    ['SYSTEM_ADMIN', 'the DB spelling of admin'],
    ['Nazir', 'wrong case'],
  ])('denies %s (%s)', (role) => {
    expect(can(role, 'endowment:waqf:read')).toBe(false);
    expect(can(role, 'approval:request:approve')).toBe(false);
    expect(expandRolePreset(role)).toEqual([]);
  });

  it.each([null, undefined, 7, {}, [], true])('denies the non-string %s', (role) => {
    expect(can(role, 'endowment:waqf:read')).toBe(false);
    expect(expandRolePreset(role)).toEqual([]);
  });

  it('denies an unrecognised permission even for a role that holds everything it can', () => {
    expect(can('nazir', 'endowment:waqf:destroy')).toBe(false);
    expect(can('nazir', 'not_a_module:waqf:read')).toBe(false);
    expect(can('nazir', '')).toBe(false);
    expect(can('nazir', null)).toBe(false);
  });

  it('expandRolePreset returns a copy, so a caller cannot mutate the preset table', () => {
    const expanded = expandRolePreset('nazir') as PermissionString[];
    const before = ROLE_PRESETS.nazir.length;
    expanded.push('endowment:waqf:read');
    expect(ROLE_PRESETS.nazir).toHaveLength(before);
  });
});

describe('narrowPermissions is an INTERSECTION and never widens (MP-18)', () => {
  it('keeps only what both sides hold', () => {
    expect(
      narrowPermissions(
        ['endowment:waqf:read', 'distribution:run:approve'],
        ['endowment:waqf:read', 'endowment:waqf:write'],
      ),
    ).toEqual(['endowment:waqf:read']);
  });

  it('cannot widen: the result is always a subset of BOTH inputs', () => {
    for (const role of ROLE_KEYS) {
      const widened = [...ROLE_PRESETS.nazir, 'distribution:run:sign'];
      const narrowed = narrowPermissions(widened, ROLE_PRESETS[role]);
      for (const permission of narrowed) {
        expect(ROLE_PRESETS[role]).toContain(permission);
        expect(widened).toContain(permission);
      }
    }
  });

  it('drops unregistered strings rather than passing them through', () => {
    expect(narrowPermissions(['approval:*', 'endowment:waqf:read'], ROLE_PRESETS.nazir)).toEqual([
      'endowment:waqf:read',
    ]);
  });

  it('de-duplicates', () => {
    expect(
      narrowPermissions(['endowment:waqf:read', 'endowment:waqf:read'], ROLE_PRESETS.nazir),
    ).toEqual(['endowment:waqf:read']);
  });
});

describe('the role preset is the CEILING at both ends (MP-18)', () => {
  /**
   * READ-TIME. An already-widened row — from a raw write, a migration, or a PROVISIONAL
   * fixture — must still grant nothing extra. `permissions String[]` is free text that
   * Sprint 1 documented as "stored but not yet interpreted"; a grant that keeps
   * `role = FINANCE` while appending an approve permission is a second approval authority
   * that every role-shaped check misses.
   */
  it('resolveGrantPermissions intersects the stored permissions with the preset', () => {
    const smuggled = [
      'finance:transaction:read',
      'distribution:run:approve',
      'approval:request:approve',
    ];
    const resolved = resolveGrantPermissions('finance', smuggled);

    expect(resolved).toEqual(['finance:transaction:read']);
    expect(resolved).not.toContain('distribution:run:approve');
    expect(resolved).not.toContain('approval:request:approve');
    expect(hasPermission(resolved, 'distribution:run:approve')).toBe(false);
  });

  it('resolveGrantPermissions fails closed on an unknown role', () => {
    expect(resolveGrantPermissions('APPROVER', ['distribution:run:approve'])).toEqual([]);
    expect(resolveGrantPermissions(null, ['endowment:waqf:read'])).toEqual([]);
  });

  it('an empty stored permission set resolves to the empty set, never to the preset', () => {
    // A grant carrying no explicit permissions grants nothing: the preset is a CEILING, not a
    // default. Expanding a role to its preset is a separate, deliberate call.
    expect(resolveGrantPermissions('nazir', [])).toEqual([]);
  });

  /** WRITE-TIME. The other end of the ceiling: the widened row must not be writable at all. */
  it('assertGrantPermissionsWithinPreset rejects a permission outside the role preset', () => {
    expect(assertGrantPermissionsWithinPreset('finance', ['finance:transaction:read'])).toEqual([
      'finance:transaction:read',
    ]);
    expectDomainCode(
      () => assertGrantPermissionsWithinPreset('finance', ['approval:request:approve']),
      'PERMISSION_ESCALATION',
    );
    expectDomainCode(
      () => assertGrantPermissionsWithinPreset('finance', ['approval:*']),
      'PERMISSION_INVALID',
    );
    expectDomainCode(
      () => assertGrantPermissionsWithinPreset('APPROVER', ['endowment:waqf:read']),
      'ROLE_UNKNOWN',
    );
  });

  it('names the offending permissions in the error details, without PII', () => {
    const error = caught(() =>
      assertGrantPermissionsWithinPreset('finance', ['distribution:run:approve']),
    ) as DomainError;
    expect(error.details?.['offending']).toEqual(['distribution:run:approve']);
  });
});

describe('delegation is bounded and non-escalating (MP-35 / AC-5 pure half)', () => {
  const nazirPermissions = ROLE_PRESETS.nazir;

  it('NON_DELEGABLE_VERBS is exactly the approval verbs', () => {
    expect(new Set(NON_DELEGABLE_VERBS)).toEqual(new Set(APPROVAL_VERBS));
  });

  it('(a) returns the narrowed subset for a legitimate scope', () => {
    expect(assertDelegatableScope(nazirPermissions, ['compliance:task:write'])).toEqual([
      'compliance:task:write',
    ]);
  });

  it('(b) throws on ANY permission the delegator does not hold', () => {
    // `finance` cannot be handed `endowment:deed:sign` — and a Nazir cannot delegate a
    // permission they do not themselves hold either.
    expectDomainCode(
      () => assertDelegatableScope(ROLE_PRESETS.finance, ['compliance:task:write']),
      'PERMISSION_ESCALATION',
    );
    // MP-35's mutation turns `every` into `some`: a mixed scope must still be rejected.
    expectDomainCode(
      () => assertDelegatableScope(nazirPermissions, ['compliance:task:write', 'aml:sar:write']),
      'PERMISSION_ESCALATION',
    );
  });

  it('(c) throws on approve/sign EVEN WHEN the delegator legitimately holds it', () => {
    for (const verb of NON_DELEGABLE_VERBS) {
      const held = nazirPermissions.filter((permission) => permission.endsWith(`:${verb}`));
      expect(
        held.length,
        `nazir must hold at least one :${verb} to make this test meaningful`,
      ).toBeGreaterThan(0);
      for (const permission of held) {
        expect(hasPermission(nazirPermissions, permission)).toBe(true);
        expectDomainCode(
          () => assertDelegatableScope(nazirPermissions, [permission]),
          'DELEGATION_NOT_DELEGABLE',
        );
        // …and it is still rejected when hidden among otherwise-legitimate permissions.
        expectDomainCode(
          () => assertDelegatableScope(nazirPermissions, ['compliance:task:write', permission]),
          'DELEGATION_NOT_DELEGABLE',
        );
      }
    }
  });

  it('rejects an unregistered string in a delegation scope', () => {
    expectDomainCode(
      () => assertDelegatableScope(nazirPermissions, ['approval:*']),
      'PERMISSION_INVALID',
    );
  });

  it('an empty scope is a no-op subset, not an error', () => {
    expect(assertDelegatableScope(nazirPermissions, [])).toEqual([]);
  });

  /**
   * NON-ESCALATION AT THE PRESET LEVEL (D-7). No role's preset can be expanded into an
   * approve/sign string it does not already hold, for any delegator/delegate pair. This is
   * the half of AC-5 that is provable without a `Delegation` model — the model is deferred to
   * E3/E11 and must NOT be invented here to make AC-5 look green.
   */
  it('no delegator/delegate pair can produce an approve/sign the delegate did not hold', () => {
    for (const delegator of ROLE_KEYS) {
      for (const delegate of ROLE_KEYS) {
        const delegable = ROLE_PRESETS[delegator].filter((permission) => {
          const parsed = parsePermission(permission);
          return (
            parsed !== undefined &&
            !(NON_DELEGABLE_VERBS as readonly string[]).includes(parsed.verb)
          );
        });
        const result = assertDelegatableScope(
          ROLE_PRESETS[delegator],
          narrowPermissions(delegable, ROLE_PRESETS[delegator]),
        );
        for (const permission of result) {
          const parsed = parsePermission(permission);
          expect((APPROVAL_VERBS as readonly string[]).includes(parsed?.verb ?? '')).toBe(false);
          expect(ROLE_PRESETS[delegator]).toContain(permission);
        }
        // The delegate's own ceiling is unchanged by anything the delegator does.
        expect(
          resolveGrantPermissions(delegate, result).every((p) =>
            ROLE_PRESETS[delegate].includes(p),
          ),
        ).toBe(true);
      }
    }
  });
});

describe('grid rules the presets must not violate (§10 §3)', () => {
  /** "`beneficiary` never holds any aggregate (`agg`) read — only `self`." */
  it('beneficiary holds no aggregate read', () => {
    expect(ROLE_PRESETS.beneficiary).not.toContain('reporting:report:read');
    // Statements are the beneficiary's surface; the raw ledger is not (AC-2: a beneficiary's
    // Transaction read returns the empty set).
    expect(ROLE_PRESETS.beneficiary).toContain('reporting:statement:read');
    expect(ROLE_PRESETS.beneficiary).not.toContain('finance:transaction:read');
    expect(can('beneficiary', 'finance:transaction:read')).toBe(false);
  });

  /**
   * Owner ruling **Q-E4-1(a)**, 2026-08-18 (`docs/product/prd/S4-owner-decision-memo.md`, "S5
   * addendum"): *every beneficiary principal of a waqf may read THAT waqf's deed; self-isolation
   * otherwise untouched.*
   *
   * This is the CEILING half and it is deliberately the weaker of the two assertions available:
   * a preset is a set of strings that has never seen an endowment, so "own waqf only" is NOT
   * provable here and is not claimed here. It is the grant's — `WaqfAccessGrant` is per-endowment
   * and rung 2 resolves the grant for the REQUESTED waqfId — and it is measured in
   * `packages/api/test/beneficiary-deed-read.integration.test.ts` against a foreign endowment that
   * really does carry a deed.
   *
   * What IS provable here, and is the point of pinning it: the ruling opened exactly ONE endowment
   * verb. `endowment:waqf:read` would additionally hand the portal seat the endowment record and
   * `endowment.get`'s three-field trusteeship summary (V-E3-03: a summary of a record is a read of
   * it), and the ruling did not open that.
   */
  it('beneficiary holds the deed read (Q-E4-1(a)) and EXACTLY that one endowment verb', () => {
    expect(can('beneficiary', 'endowment:deed:read')).toBe(true);
    expect(ROLE_PRESETS.beneficiary.filter((p) => p.startsWith('endowment:'))).toEqual([
      'endowment:deed:read',
    ]);
    // The endowment record itself stays shut, and so does deed WRITE — memo Q10 put deed write
    // beyond every seat, and Q-E4-1 did not touch it.
    expect(can('beneficiary', 'endowment:waqf:read')).toBe(false);
    expect(can('beneficiary', 'endowment:asset:read')).toBe(false);
    expect(can('beneficiary', 'endowment:deed:write')).toBe(false);
    expect(can('beneficiary', 'endowment:deed:sign')).toBe(false);
  });

  /** "`admin` never holds `A`/`S` on domain money/filing/reserved matters." */
  it('admin holds R W on the admin/access-matrix module and no domain money authority', () => {
    expect(can('admin', 'admin:access_matrix:read')).toBe(true);
    expect(can('admin', 'admin:access_matrix:write')).toBe(true);
    expect(can('admin', 'admin:setting:write')).toBe(true);
    // EXIT-3: admin may INITIATE a fee-basis change; only nazir approves it.
    expect(can('admin', 'fee:nazir_fee:approve')).toBe(false);
    expect(can('nazir', 'fee:nazir_fee:approve')).toBe(true);
    for (const module of ['finance', 'distribution', 'fee', 'legal'] as const) {
      for (const resource of PERMISSION_RESOURCES[module]) {
        expect(can('admin', `${module}:${resource}:write`)).toBe(false);
      }
    }
  });

  /**
   * "The AML compartment column is not 'another permission on the compliance module' — it is
   * a separate resource whose very existence is hidden outside `aml` membership." And §6:
   * no role — "including the Nazir by default" — reads it without explicit membership.
   */
  it('the AML compartment is its own module, held in the preset only by aml_officer', () => {
    const amlHolders = ROLE_KEYS.filter((role) =>
      ROLE_PRESETS[role].some((permission) => parsePermission(permission)?.module === 'aml'),
    );
    expect(amlHolders).toEqual(['aml_officer']);
    expect(can('nazir', 'aml:sar:read')).toBe(false);
    // …and membership can only ever BLOCK, never approve (MP-24): there is no aml approve verb.
    for (const verb of APPROVAL_VERBS) {
      for (const role of ROLE_KEYS) {
        expect(can(role, `aml:sar:${verb}`)).toBe(false);
      }
    }
  });

  /** The makers under SoD initiate and never approve (§4.1). */
  it.each(['finance', 'case_manager', 'authorized_rep', 'compliance_officer'] as const)(
    '%s can initiate but never approve a distribution run',
    (role) => {
      expect(can(role, 'distribution:run:approve')).toBe(false);
      expect(can(role, 'approval:request:approve')).toBe(false);
    },
  );

  it('finance initiates money movement; only nazir approves it', () => {
    expect(can('finance', 'distribution:run:initiate')).toBe(true);
    expect(can('finance', 'distribution:run:write')).toBe(true);
    expect(can('finance', 'distribution:run:approve')).toBe(false);
    expect(can('nazir', 'distribution:run:approve')).toBe(true);
  });

  /**
   * MP-07: family_board's recorded principal consent is a separate chain-step record; it can
   * never set an ApprovalRequest to APPROVED. So it holds no approve/sign and no write on the
   * approval module.
   */
  it('family_board records consent but holds no approval verb', () => {
    expect(can('family_board', 'approval:request:read')).toBe(true);
    expect(can('family_board', 'approval:request:approve')).toBe(false);
    expect(can('family_board', 'approval:request:write')).toBe(false);
    expect(can('family_board', 'endowment:deed:sign')).toBe(false);
  });

  it('only nazir holds any approval-module approve verb', () => {
    const approvers = ROLE_KEYS.filter((role) => can(role, 'approval:request:approve'));
    expect(approvers).toEqual(['nazir']);
  });
});

describe('hasPermission is exact-match only', () => {
  it('matches an identical registered string and nothing else', () => {
    expect(hasPermission(['endowment:waqf:read'], 'endowment:waqf:read')).toBe(true);
    expect(hasPermission(['endowment:waqf:read'], 'endowment:waqf:write')).toBe(false);
    expect(hasPermission(['endowment:waqf:write'], 'endowment:waqf:read')).toBe(false);
    expect(hasPermission([], 'endowment:waqf:read')).toBe(false);
  });

  it('never lets a prefix stand in for a permission', () => {
    expect(hasPermission(['endowment:waqf:read'], 'endowment:waqf:rea')).toBe(false);
    expect(hasPermission(['endowment:waqf:read'], 'endowment')).toBe(false);
    expect(hasPermission(['endowment'], 'endowment:waqf:read')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * N-4 · the corpus asset is a RESOURCE of the "Endowment & deed" row
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('endowment:asset — §3 row 1, cell for cell (N-4)', () => {
  /**
   * §3 row 1 "Endowment & deed", transcribed from the markdown table:
   *
   *   nazir R W · authorized_rep R W(scoped) · case_manager R W · finance R ·
   *   compliance_officer R W · aml_officer — · admin R W · leadership R · family_board R ·
   *   beneficiary — · subcontractor — · auditor R · counsel R(scoped)
   *
   * Written as data so a failure names the ROLE that disagrees, not "the presets are wrong".
   */
  const ROW_1: Readonly<Record<string, { read: boolean; write: boolean }>> = {
    nazir: { read: true, write: true },
    authorized_rep: { read: true, write: true },
    case_manager: { read: true, write: true },
    finance: { read: true, write: false },
    compliance_officer: { read: true, write: true },
    aml_officer: { read: false, write: false },
    admin: { read: true, write: true },
    leadership: { read: true, write: false },
    family_board: { read: true, write: false },
    beneficiary: { read: false, write: false },
    subcontractor: { read: false, write: false },
    auditor: { read: true, write: false },
    counsel: { read: true, write: false },
  };

  it('is a registered resource of the endowment module', () => {
    expect(PERMISSION_RESOURCES.endowment).toContain('asset');
    expect(parsePermission('endowment:asset:write')).toEqual({
      module: 'endowment',
      resource: 'asset',
      verb: 'write',
    });
  });

  it.each(ROLE_KEYS)('%s holds exactly §3 row 1’s asset cells', (role) => {
    const expected = ROW_1[role];
    expect(expected, `${role} is missing from the transcribed row`).toBeDefined();
    expect(can(role, 'endowment:asset:read')).toBe(expected?.read);
    expect(can(role, 'endowment:asset:write')).toBe(expected?.write);
  });

  it('the finance seat that N-1 measured holds asset READ and nothing more', () => {
    // The whole point of the finding: a ledger seat may LOOK at the corpus register. It may not
    // revalue it, and a revaluation feeds the classification that decides which duties apply.
    expect(can('finance', 'endowment:asset:read')).toBe(true);
    expect(can('finance', 'endowment:asset:write')).toBe(false);
    expect(can('finance', 'endowment:waqf:write')).toBe(false);
    expect(can('finance', 'endowment:deed:write')).toBe(false);
  });

  it('introduces NO new approval authority', () => {
    // A new resource is the classic way an approve verb arrives by the back door. There is no
    // `endowment:asset:approve` in any preset, and no role gains one.
    for (const role of ROLE_KEYS) {
      expect(can(role, 'endowment:asset:approve')).toBe(false);
      expect(can(role, 'endowment:asset:sign')).toBe(false);
    }
    const approvers = ROLE_KEYS.filter((role) =>
      ROLE_PRESETS[role].some((permission) => isApprovalPermission(permission)),
    );
    expect(approvers).toEqual(['nazir']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * N-6 · a spec quotation may not read as a code guarantee
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the comment convention in access.ts (N-6)', () => {
  /**
   * A source scan, deliberately — the artefact under test IS text. Three comments shipped this
   * sprint asserted properties the code lacked and each was believed by the next reader; one was
   * repeated to the product owner as fact. So the legend that separates a SPEC quotation from an
   * ENFORCED HERE claim is itself pinned, and the discredited three-layer sentence cannot come
   * back unqualified.
   */
  const source = readRepoFile('../access.ts');

  it('states the SPEC / ENFORCED HERE / NOT ENFORCED HERE legend up front', () => {
    const legend = source.slice(0, source.indexOf('import '));
    expect(legend).toContain('`SPEC:`');
    expect(legend).toContain('`ENFORCED HERE:`');
    expect(legend).toContain('`NOT ENFORCED HERE:`');
  });

  it('does not claim three independent enforcement layers as a property of this file', () => {
    // ADR-0008: "three layers that all resolve authority by reading one table are one layer".
    // The sentence may appear ONLY next to the qualification, never on its own.
    expect(source).not.toMatch(/This is layer one of three\./);
    expect(source).not.toMatch(/enforce it a third time/);
    const threeLayers = source.indexOf('three layers');
    expect(
      threeLayers,
      'the three-layer sentence is gone entirely — say what IS true instead',
    ).toBeGreaterThan(-1);
    expect(source).toContain('ADR-0008');
    expect(source).toContain('NOT ENFORCED HERE, and do not repeat');
  });

  it('says out loud that these functions are not reached by raw SQL', () => {
    expect(source).toMatch(/not reached by `\$queryRaw` \/ `\$executeRawUnsafe`/);
  });

  it('does not present §2.1’s "cannot be bypassed" as something this file delivers', () => {
    // The nazir preset used to quote §2.1's posture verbatim, so "cannot be bypassed" read as a
    // guarantee of the table it sat above. Any surviving occurrence must be inside a SPEC-tagged
    // sentence.
    const index = source.indexOf('cannot be bypassed');
    if (index === -1) return;
    const window = source.slice(Math.max(0, index - 400), index);
    expect(window, '"cannot be bypassed" appears with no SPEC tag before it').toContain('SPEC');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * D-D · counsel REVIEWS a reserved matter; counsel does not MARK one
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('D-D · `counsel` holds no reserved-matter write (product owner, 2026-08-16)', () => {
  /**
   * **The decision.** Asked *"Should counsel be able to mark a matter reserved?"* the product owner
   * answered ***"no"*** (2026-08-16, decisions log D-D). The `counsel` preset was **the drifted
   * side** — it carried `legal:reserved_matter:write`, and the holder set every consumer derives is
   * derived from this table, so the router drifted with it (V-E3-M3).
   *
   * **Why removing exactly that string is exactly the decision, measured rather than read.** Walking
   * the mounted tRPC router, ONE of thirty procedures enforces the verb (`reservedMatter.markReserved`);
   * walking `DOMAIN_WRITE_POLICIES`, ZERO of twenty-one models require it. Every other occurrence in
   * the repo is a holder, not a consumer. So holding it meant precisely "may mark a matter reserved".
   *
   * ⚠ **The failure mode this block exists to catch is the RE-ADD**, in either of its two shapes:
   * putting the verb back, or "repairing" counsel's dead-end call by handing it an approval-module
   * initiate/approve verb instead. ADR-0005 keeps initiation with the Nazir and the authorized
   * representative; the second shape would be a worse change than the one D-D reversed.
   */
  const SPEC = readRepoFile('../../../../docs/product/prd/10-roles-access-matrix-spec.md');

  it('counsel cannot mark a matter reserved', () => {
    expect(can('counsel', 'legal:reserved_matter:write')).toBe(false);
    expect(expandRolePreset('counsel')).not.toContain('legal:reserved_matter:write');
  });

  it('the derived holder set for that verb is exactly the three seats that keep it', () => {
    // DERIVED from the table, not enumerated against it: a fourth holder appearing under ANY role
    // name fails here. `counsel` was the fourth until 2026-08-16.
    const holders = ROLE_KEYS.filter((role) => can(role, 'legal:reserved_matter:write'));
    expect(holders).toEqual(['nazir', 'authorized_rep', 'compliance_officer']);
  });

  it('counsel was given NOTHING in exchange — no approval-module authority arrived', () => {
    // The tempting "fix" for V-E3-M3 was to let counsel create the ApprovalRequest instead. D-D
    // forecloses it. `approval:request:read` is the only approval-module verb counsel holds.
    expect(can('counsel', 'approval:request:initiate')).toBe(false);
    expect(can('counsel', 'approval:request:approve')).toBe(false);
    expect(can('counsel', 'legal:reserved_matter:approve')).toBe(false);
    expect(can('counsel', 'legal:reserved_matter:sign')).toBe(false);
    const approvalModule = ROLE_PRESETS.counsel.filter(
      (permission) => parsePermission(permission)?.module === 'approval',
    );
    expect(approvalModule).toEqual(['approval:request:read']);
  });

  it('counsel keeps the review seat: reserved-matter READ and the legal-case dossier WRITE', () => {
    // §3 row 8 "Legal & judicial cases" reads `R W(scoped)` for counsel. The `W` is carried by
    // `legal:case:write`; the row does NOT become an `R` row because of D-D, and a later reader must
    // not "restore" the module cell by putting the reserved-matter verb back.
    expect(can('counsel', 'legal:reserved_matter:read')).toBe(true);
    expect(can('counsel', 'legal:case:read')).toBe(true);
    expect(can('counsel', 'legal:case:write')).toBe(true);
  });

  it('§10 places counsel at the REVIEW step of the chain, which is the side that never drifted', () => {
    // The two sides that must agree. The spec said "review" all along; the preset said "initiate".
    expect(SPEC).toContain('`counsel` review');
    expect(SPEC).toContain('Reserved-matter **counsel review** step in the approval chain');
  });

  it('the removal moved one permission and only one', () => {
    // Measured before/after: 263 -> 262 across the thirteen presets, counsel 14 -> 13, every other
    // preset unchanged. Pinned so a future edit that "also tidies" a neighbouring seat is visible.
    expect(ROLE_PRESETS.counsel).toHaveLength(13);
    const total = ROLE_KEYS.reduce((count, role) => count + ROLE_PRESETS[role].length, 0);
    // ⚠ **263 SINCE 2026-08-18, AND THE +1 IS NAMED RATHER THAN ABSORBED.** This census caught the
    // Q-E4-1(a) change on the first run, which is exactly its job: it is a whole-table count, so a
    // preset edit anywhere shows up here whether or not the editor thought about this file.
    //
    // The one moved permission: `beneficiary` gained `endowment:deed:read` (7 → 8) on the product
    // owner's Q-E4-1 option (a) ruling — `docs/product/prd/S4-owner-decision-memo.md`, "S5
    // addendum". `counsel` is still 13 and every other preset is unchanged, which the two
    // assertions here prove jointly: the total moved by exactly one, and it moved in the seat named
    // below. A number bumped without this paragraph would be the failure this test exists to stop.
    expect(ROLE_PRESETS.beneficiary).toHaveLength(7);
    // ⊕ **265 SINCE S6/E5 (2026-08-18), AND THE +2 IS NAMED RATHER THAN ABSORBED.** This census
    // caught the OQ-06-tail change on the first run, which is exactly its job.
    //
    // The two moved permissions: `nazir` gained `finance:maintenance_policy:read` and
    // `:write` (48 → 50) on the product owner's OQ-06 tail ruling — recording an endowment's
    // ṣiyāna reserve percentage under a silent deed gets its own verb instead of borrowing
    // `fee:nazir_fee:approve`. ⚠ NO OTHER PRESET GAINED THEM, and that is the half a reader should
    // check: the authority did not widen, only the NAME of the gate changed. `counsel` is still 13
    // and `beneficiary` still 7, which the assertions here prove jointly.
    expect(
      ROLE_PRESETS.nazir.filter((p) => p.startsWith('finance:maintenance_policy:')),
    ).toHaveLength(2);
    expect(
      ROLE_KEYS.filter(
        (role) =>
          role !== 'nazir' &&
          ROLE_PRESETS[role].some((p) => p.startsWith('finance:maintenance_policy:')),
      ),
    ).toStrictEqual([]);
    expect(total).toBe(265);
  });

  it('access.ts records the decision, its date, and that the preset was the drifted side', () => {
    // A source scan, in this file's N-6 habit: the reasoning is the thing that stops the re-add, so
    // deleting the reasoning while keeping the code is itself a regression.
    const source = readRepoFile('../access.ts');
    expect(source).toContain('product owner, 2026-08-16');
    expect(source).toContain('decision D-D');
    expect(source).toMatch(/drifted side/);
  });
});
