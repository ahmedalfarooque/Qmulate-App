/**
 * MP-02 / MP-03 / MP-14 — THE GRID TESTS THE CODE AND THE CODE TESTS THE GRID.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE STANDING INSTRUCTION THIS FILE IMPLEMENTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Both Sprint-1 security holes existed because NOTHING COMPARED TWO SIDES THAT WERE SUPPOSED TO
 * AGREE. The role count drifted three ways (a brief said 11, §10.2 says 13, the Prisma enum shipped
 * 16) for exactly that reason, and `roles.test.ts` closed it by PARSING `enum Role` out of
 * `schema.prisma` as text.
 *
 * This file applies the same technique to the thing that actually decides authority: §10 §3's
 * permission grid. The markdown TABLE is parsed out of the spec at test time and compared,
 * CELL FOR CELL, against `ROLE_PRESETS` in `@qmulate/domain` — in BOTH directions. Neither side is
 * hardcoded here. A grid edit with no preset change fails; a preset edit with no grid change fails.
 *
 *   MP-02  every A / A* / S / S* cell agrees with the presets, per module row and per role column
 *   MP-03  `ROLE_PRESETS` is TOTAL over `schema.prisma`'s `enum Role` — a new enum value cannot ship
 *          without an explicit preset decision, and if that preset carries an approval verb MP-01
 *          fails
 *   MP-14  the ACTIVE-GRANT predicate has ONE definition, shared by import
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY IT LIVES IN packages/auth
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It is the package that already owns the role catalogue and the DB-value↔product-key map, and it is
 * the one place all three vocabularies meet: §10's markdown, `@qmulate/domain`'s presets, and
 * `schema.prisma`'s enum. `@qmulate/domain` cannot host it (it imports nothing internal) and
 * `packages/database` cannot (importing `@qmulate/auth` from there would be a dependency cycle).
 *
 * `@qmulate/database/context` is imported for the shared predicate — safe in a unit test because
 * `context.ts`'s only Prisma import is `import type`, which is fully erased.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  APPROVAL_AUTHORITY_ROLES,
  GRID_ROW_TO_MODULE,
  MODULES_WITHOUT_GRID_ROW,
  PERMISSION_MODULES,
  ROLE_KEYS,
  ROLE_PRESETS,
  parsePermission,
  roleKeyFromDbRole as domainRoleKeyFromDbRole,
} from '@qmulate/domain/access';
import { activeGrantWhere, activeMembershipWhere } from '@qmulate/database/context';
import { describe, expect, it } from 'vitest';

import { DB_ROLE_TO_ROLE_KEY, ROLES, roleKeyFromDbRole } from '../src/roles';

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. PARSE §10 §3's GRID OUT OF THE SPEC
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface ParsedGrid {
  /** Role column headers, in the order the table declares them. */
  readonly roleColumns: string[];
  /** `rowLabel -> roleKey -> raw cell text`. */
  readonly cells: Map<string, Map<string, string>>;
}

/**
 * Find the grid table and read it.
 *
 * Located by its HEADER CONTENT (a `| Module |` row whose remaining cells are backticked role keys),
 * not by line number: §10 has three other tables, and pinning line 71 would silently start reading
 * the wrong one the first time a paragraph is added above it.
 */
function parseGrid(markdown: string): ParsedGrid {
  const lines = markdown.split('\n');
  const cellsOf = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trimStart().startsWith('| Module ')) continue;
    const header = cellsOf(line);
    // The role columns are backticked keys; the first cell is the literal "Module".
    if (header.length > 5 && header.slice(1).every((cell) => /^`[a-z_]+`$/.test(cell))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex === -1) {
    throw new Error(
      'could not find §10 §3 permission-grid table in 10-roles-access-matrix-spec.md. A parity test ' +
        'that cannot find its other side must FAIL, never skip — silence is how the role counts ' +
        'drifted three ways in Sprint 1.',
    );
  }

  const roleColumns = cellsOf(lines[headerIndex] ?? '')
    .slice(1)
    .map((cell) => cell.replace(/`/g, ''));

  const cells = new Map<string, Map<string, string>>();
  // headerIndex + 1 is the `|---|` separator.
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trimStart().startsWith('|')) break; // end of table
    const row = cellsOf(line);
    // Row label: `**Endowment & deed** (BR-101–105)` -> `Endowment & deed`.
    const labelMatch = /\*\*(.+?)\*\*/.exec(row[0] ?? '');
    if (labelMatch === null) continue;
    const label = labelMatch[1] ?? '';
    const byRole = new Map<string, string>();
    roleColumns.forEach((role, column) => {
      byRole.set(role, row[column + 1] ?? '');
    });
    cells.set(label, byRole);
  }
  return { roleColumns, cells };
}

/**
 * Does this cell grant an `approve` (or a `sign`) capability?
 *
 * TOKENISED, not substring-matched. Cells contain qualifiers — `R W(scoped)`, `R(agg)`,
 * `R(evidence pack)`, `**R W aml**`, `R scoped(i)` — and a naive `includes('A')` would fire on the
 * "a" in "pack" or on `AML`. A token counts only if it is exactly `A`, `A*`, `S` or `S*` after
 * markdown emphasis is stripped.
 */
function cellVerbs(cell: string): { approve: boolean; sign: boolean } {
  const tokens = cell
    .replace(/\*\*/g, '')
    .split(/[\s/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return {
    approve: tokens.some((token) => token === 'A' || token === 'A*'),
    sign: tokens.some((token) => token === 'S' || token === 'S*'),
  };
}

const SPEC = readRepoFile('../../../docs/product/prd/10-roles-access-matrix-spec.md');
const GRID = parseGrid(SPEC);

/** `roleKey -> module -> {approve, sign}`, derived from `ROLE_PRESETS`. Never enumerated. */
function presetVerbsByModule(): Map<string, Map<string, { approve: boolean; sign: boolean }>> {
  const result = new Map<string, Map<string, { approve: boolean; sign: boolean }>>();
  for (const role of ROLE_KEYS) {
    const byModule = new Map<string, { approve: boolean; sign: boolean }>();
    for (const module of PERMISSION_MODULES) byModule.set(module, { approve: false, sign: false });
    for (const permission of ROLE_PRESETS[role]) {
      const parsed = parsePermission(permission);
      if (parsed === undefined) continue;
      const entry = byModule.get(parsed.module);
      if (entry === undefined) continue;
      if (parsed.verb === 'approve') entry.approve = true;
      if (parsed.verb === 'sign') entry.sign = true;
    }
    result.set(role, byModule);
  }
  return result;
}

const PRESET_VERBS = presetVerbsByModule();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2. THE SCAN IS TRUSTWORTHY
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the grid scan itself', () => {
  it('found all thirteen role columns and all twelve module rows', () => {
    // A silently-empty or half-read table would make every assertion below vacuous.
    expect(GRID.roleColumns).toHaveLength(13);
    expect(GRID.cells.size).toBe(12);
    expect(GRID.roleColumns).toContain('nazir');
    expect(GRID.roleColumns).toContain('counsel');
  });

  it('the grid’s role columns are exactly the catalogue, in BOTH directions', () => {
    expect(new Set(GRID.roleColumns)).toEqual(new Set(ROLES));
    expect(new Set(GRID.roleColumns)).toEqual(new Set(ROLE_KEYS));
  });

  it('every grid row label maps to a module, and every module is accounted for', () => {
    // `GRID_ROW_TO_MODULE` is exported from `@qmulate/domain` for exactly this alignment, so the
    // twelve row labels are not hand-copied into a second file. A RENAMED row breaks the test rather
    // than silently un-testing a row.
    for (const label of GRID.cells.keys()) {
      expect(GRID_ROW_TO_MODULE[label], `grid row "${label}" maps to no module`).toBeDefined();
    }
    const mapped = new Set(Object.values(GRID_ROW_TO_MODULE));
    const unmapped = PERMISSION_MODULES.filter((module) => !mapped.has(module));
    // Exactly one module has no grid row — the `approval` module (the ApprovalRequest record itself,
    // §4). It is named explicitly rather than quietly skipped.
    expect(unmapped).toEqual([...MODULES_WITHOUT_GRID_ROW]);
  });

  it('the cell tokeniser does not fire on prose', () => {
    // The mistakes this guards against: "pack" contains an `a`, `R W aml` contains "aml", `R(agg)`
    // contains an `a`. None of them is an approve cell.
    expect(cellVerbs('R(evidence pack)')).toEqual({ approve: false, sign: false });
    expect(cellVerbs('**R W aml**')).toEqual({ approve: false, sign: false });
    expect(cellVerbs('R(agg)')).toEqual({ approve: false, sign: false });
    expect(cellVerbs('R W(scoped)')).toEqual({ approve: false, sign: false });
    expect(cellVerbs('R (own endowments)')).toEqual({ approve: false, sign: false });
    expect(cellVerbs('R A*')).toEqual({ approve: true, sign: false });
    expect(cellVerbs('R A* S*')).toEqual({ approve: true, sign: true });
    expect(cellVerbs('R W S*')).toEqual({ approve: false, sign: true });
    expect(cellVerbs('R self / W self')).toEqual({ approve: false, sign: false });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3. MP-02 — CELL FOR CELL, BOTH DIRECTIONS
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('MP-02 · the presets and §10 §3’s grid agree cell for cell', () => {
  // 12 module rows × 13 role columns = 156 cells, each its own named case, so a failure says WHICH
  // cell disagrees rather than "the presets do not match the grid".
  const pairs: [string, string, string][] = [];
  for (const label of GRID.cells.keys()) {
    const module = GRID_ROW_TO_MODULE[label];
    if (module === undefined) continue;
    for (const role of GRID.roleColumns) pairs.push([label, role, module]);
  }

  it.each(pairs)('%s × %s', (label, role, module) => {
    const cell = GRID.cells.get(label)?.get(role) ?? '';
    const fromGrid = cellVerbs(cell);
    const fromPreset = PRESET_VERBS.get(role)?.get(module) ?? { approve: false, sign: false };

    expect(
      fromPreset.approve,
      `APPROVE mismatch on "${label}" × ${role}: grid cell is ${JSON.stringify(cell)} (approve=` +
        `${String(fromGrid.approve)}) but the preset says ${String(fromPreset.approve)}. The grid and ` +
        `the code are the two sides that must agree — fix whichever one is wrong, deliberately.`,
    ).toBe(fromGrid.approve);

    expect(
      fromPreset.sign,
      `SIGN mismatch on "${label}" × ${role}: grid cell is ${JSON.stringify(cell)} (sign=` +
        `${String(fromGrid.sign)}) but the preset says ${String(fromPreset.sign)}.`,
    ).toBe(fromGrid.sign);
  });

  it('the grid itself gives A/A*/S/S* to nazir and to nobody else', () => {
    // DERIVED FROM THE MARKDOWN, so this is a statement about the SPEC rather than about the code.
    // §3's grid-rules bullet adds a parenthetical "(and, within the leadership authority matrix,
    // `leadership` for portfolio-level matters)" — the single textual hook in the whole spec for a
    // second approval role. D-1 overrides it: the TABLE, §2.1 and §11's stated default all agree on
    // read-only, and that is what ships. This assertion is over the TABLE.
    const rolesWithAuthority = new Set<string>();
    for (const byRole of GRID.cells.values()) {
      for (const [role, cell] of byRole) {
        const verbs = cellVerbs(cell);
        if (verbs.approve || verbs.sign) rolesWithAuthority.add(role);
      }
    }
    expect(rolesWithAuthority).toEqual(new Set(APPROVAL_AUTHORITY_ROLES));
    expect([...rolesWithAuthority]).toEqual(['nazir']);
  });

  it('D-1 / D-2: leadership and authorized_rep hold NO approve or sign, on any module', () => {
    for (const role of ['leadership', 'authorized_rep'] as const) {
      const byModule = PRESET_VERBS.get(role);
      expect(byModule).toBeDefined();
      for (const [module, verbs] of byModule ?? []) {
        expect(verbs.approve, `${role} holds approve on ${module}`).toBe(false);
        expect(verbs.sign, `${role} holds sign on ${module}`).toBe(false);
      }
    }
  });

  it('there is NO leadership-authority-matrix Setting anywhere (D-1)', () => {
    // "Do NOT model a leadership authority matrix Setting. Not even one defaulting to empty — an
    // empty configurable is a foothold." Asserted against the Setting registry itself.
    const registry = readRepoFile('../../domain/src/settings.ts');
    expect(registry).not.toMatch(/leadership.*authorityMatrix|authorityMatrix.*leadership/i);
    expect(registry).not.toMatch(/leadershipAuthority/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4. MP-03 — TOTAL OVER schema.prisma's enum Role
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('MP-03 · ROLE_PRESETS is TOTAL over schema.prisma’s enum Role', () => {
  /** Read as TEXT — `packages/auth` must not import the generated Prisma client in a unit test. */
  const enumValues = (() => {
    const schema = readRepoFile('../../database/prisma/schema.prisma');
    const block = /\benum\s+Role\s*\{([^}]*)\}/.exec(schema);
    if (block === null) {
      throw new Error(
        'could not find `enum Role` in schema.prisma — the parity test must FAIL, not skip',
      );
    }
    return (block[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z_]*$/.test(line));
  })();

  it('found the enum', () => {
    expect(enumValues).toHaveLength(13);
    expect(enumValues).toContain('SYSTEM_ADMIN');
    expect(enumValues).toContain('NAZIR');
  });

  it('every enum value resolves to a role key that HAS a preset', () => {
    // MP-03's mutation adds `CO_NAZIR` to the enum. It must fail HERE — before anyone writes the
    // preset — because the dangerous version of that change is the one where the preset is written
    // hastily and happens to carry an approval verb.
    for (const dbRole of enumValues) {
      const key = domainRoleKeyFromDbRole(dbRole);
      expect(
        key,
        `schema.prisma's enum Role has ${dbRole} but @qmulate/domain cannot resolve it to a role key. ` +
          `A new enum value needs an explicit preset decision — and if that preset carries approve or ` +
          `sign, MP-01 fails too.`,
      ).toBeDefined();
      expect(ROLE_PRESETS[key as never], `${dbRole} -> ${String(key)} has no preset`).toBeDefined();
    }
  });

  it('and the other direction: every role key is reachable from a DB enum value', () => {
    // A preset nothing can be granted is dead code that still gets read as specification.
    const reachable = new Set(enumValues.map((value) => domainRoleKeyFromDbRole(value)));
    for (const key of ROLE_KEYS) {
      expect(reachable.has(key), `no schema.prisma Role maps to ${key}`).toBe(true);
    }
  });

  it('ADR-0004’s removed values stay removed, and resolve to nothing', () => {
    for (const removed of ['MANDATE_LEAD', 'ACCOUNTANT', 'APPROVER', 'CO_NAZIR']) {
      expect(enumValues, `${removed} is back in enum Role`).not.toContain(removed);
      expect(domainRoleKeyFromDbRole(removed)).toBeUndefined();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5. THREE ROLE VOCABULARIES, ONE SET
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('packages/auth’s ROLES and @qmulate/domain’s ROLE_KEYS are the same thirteen', () => {
  it('agree as sets and as ordered lists', () => {
    expect([...ROLES]).toEqual([...ROLE_KEYS]);
  });

  it('the two DB-value maps agree on every value', () => {
    // `packages/auth` keeps a literal map; `@qmulate/domain` derives the key (lowercase + the single
    // `SYSTEM_ADMIN -> admin` exception). A derivation and a table must agree, and only a test can
    // say so.
    for (const [dbRole, key] of Object.entries(DB_ROLE_TO_ROLE_KEY)) {
      expect(domainRoleKeyFromDbRole(dbRole), `${dbRole}`).toBe(key);
      expect(roleKeyFromDbRole(dbRole)).toBe(domainRoleKeyFromDbRole(dbRole));
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6. MP-14 — ONE ACTIVE-GRANT PREDICATE, SHARED BY IMPORT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('MP-14 · the active-grant predicate has exactly one definition', () => {
  it('carries all four validity clauses', () => {
    const asOf = new Date('2026-07-27T00:00:00.000Z');
    const where = activeGrantWhere(asOf);
    expect(where.deletedAt).toBeNull();
    expect(
      where.revokedAt,
      'revokedAt: null is missing — a revoked grant would still be active',
    ).toBeNull();
    expect(where.validFrom).toEqual({ lte: asOf });
    expect(where.OR).toEqual([{ validUntil: null }, { validUntil: { gte: asOf } }]);
  });

  it('is a FUNCTION of `asOf`, not a frozen constant', () => {
    // A module-scope constant would pin the comparison instant at import time, so a long-lived
    // process would keep honouring a grant that expired while it was running.
    const a = new Date('2026-01-01T00:00:00.000Z');
    const b = new Date('2027-01-01T00:00:00.000Z');
    expect(activeGrantWhere(a)).not.toEqual(activeGrantWhere(b));
  });

  it('getUserDbRoles uses the SHARED helper, not an inline literal (source scan)', () => {
    // Object identity across package boundaries cannot be asserted here: importing `src/server.ts`
    // constructs a Prisma client and reads the server env schema, which is why the auth vitest config
    // says so explicitly. The next best thing is to pin the STRUCTURE — the helper is imported from
    // `@qmulate/database` and the four clauses appear nowhere else in the file.
    const source = readRepoFile('../src/server.ts');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    expect(withoutComments).toMatch(
      /import\s*\{[^}]*activeGrantWhere[^}]*\}\s*from\s*'@qmulate\/database'/,
    );
    expect(withoutComments).toMatch(/activeGrantWhere\(now\)/);
    expect(withoutComments).toMatch(/activeMembershipWhere\(\)/);
    // THE ASSERTION THAT MATTERS: the clauses must not be re-written inline anywhere in this file.
    // Sprint 1 had them inline here, and five lines below filtered memberships on `deletedAt: null`
    // alone, with nothing comparing the two.
    expect(
      withoutComments,
      'server.ts spells out `revokedAt: null` itself — that is a SECOND definition of "active", and ' +
        'MP-14 requires exactly one so deleting the clause breaks every consumer at once',
    ).not.toMatch(/revokedAt:\s*null/);
    expect(withoutComments).not.toMatch(/validUntil:\s*\{\s*gte/);
  });

  it('documents the membership asymmetry rather than hiding it', () => {
    // `Membership` genuinely has no validity window. That is a known gap; what is NOT acceptable is
    // an unexplained difference between two predicates in the same function.
    expect(activeMembershipWhere()).toEqual({ deletedAt: null });
    const contextSource = readRepoFile('../../database/src/context.ts');
    expect(contextSource).toMatch(/membership_role_family_level_only/);
    expect(contextSource).toMatch(/asymmetry/i);
  });
});
