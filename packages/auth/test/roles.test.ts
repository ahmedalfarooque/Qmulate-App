import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  anyRoleRequiresTotp,
  DB_ROLE_TO_ROLE_KEY,
  INTERNAL_OPS_ROLES,
  isRoleKey,
  PORTAL_ROLES,
  requiresStepUpTotp,
  requiresTotp,
  requiresTotpForDbRole,
  ROLES,
  roleKeyFromDbRole,
  THIRD_PARTY_ROLES,
  TOTP_MANDATORY_ROLES,
  TOTP_REQUIRED_ROLES,
  TOTP_STEP_UP_ACTIONS,
  type RoleKey,
} from '../src/roles';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THE ROLE COUNT IS THIRTEEN — decided 2026-07-27, see ADR-0004
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Three sources used to disagree:
 *
 *   · the Sprint-1 task brief said "the 11 roles" (§07's older enum);
 *   · `docs/product/prd/10-roles-access-matrix-spec.md` §2 defines 13 keys
 *     (8 internal ops + 2 portal + 3 third-party);
 *   · the Prisma `Role` enum shipped 16, adding SYSTEM_ADMIN plus the synonyms
 *     MANDATE_LEAD / ACCOUNTANT and the orphan APPROVER.
 *
 * §10.2's THIRTEEN is now canonical everywhere. The Prisma enum was narrowed to match:
 * the synonyms went, and APPROVER was **removed, not remapped** — approval is an action the
 * `nazir` holds, and a standing approver seat would create the second approval authority
 * BR-105/BR-1103 forbid.
 *
 * The drift existed because nothing compared the two sides. `parity with the Prisma enum`
 * below now does, by reading `schema.prisma` — so they cannot silently diverge again.
 *
 * This is a SCOPE question and it is surfaced, not resolved here. Reconciling the
 * catalogue to one list is a prerequisite for the S2/E2 permission grid — and when it is
 * reconciled, this file is where the new count must be argued, in one place, on purpose.
 * A test that quietly agreed with whichever number the code happened to hold would be
 * worth nothing.
 */

/** §10.2, in the order the module composes them. */
const EXPECTED_INTERNAL_OPS_ROLES = [
  'nazir',
  'authorized_rep',
  'case_manager',
  'finance',
  'compliance_officer',
  'aml_officer',
  'admin',
  'leadership',
] as const;

const EXPECTED_PORTAL_ROLES = ['family_board', 'beneficiary'] as const;
const EXPECTED_THIRD_PARTY_ROLES = ['subcontractor', 'auditor', 'counsel'] as const;

/**
 * Money-movement and statutory-filing seats. These are the roles NFR-06 is actually about:
 * anyone who can move a riyal out of a waqf bank account or lodge a filing with the
 * Authority in QMULATE's name as Nazir.
 */
const MONEY_OR_FILING_ROLES = [
  'nazir', // signs; holds every A*/S* cell in the §3 grid
  'authorized_rep', // delegated manager, jointly & severally liable (Nazarah Art. 11(5))
  'finance', // executes payouts and records receipts
  'case_manager', // prepares and lodges filings
  'compliance_officer', // lodges statutory filings
  'aml_officer', // clears / blocks a payout on AML grounds
  'admin', // can grant the seats above to someone else — equivalent power
] as const satisfies readonly RoleKey[];

/** Seats with no write path to money or a filing. */
const READ_ONLY_OR_EXTERNAL_ROLES = [
  'leadership', // internal, read-only reporting
  'family_board', // portal oversight
  'beneficiary', // portal, own record only
  'subcontractor', // scoped task access
  'auditor', // export-only oversight
  'counsel', // scoped legal access
] as const satisfies readonly RoleKey[];

describe('the role catalogue', () => {
  it('holds exactly 13 roles — see the contested-count note at the top of this file', () => {
    expect(ROLES).toHaveLength(13);
  });

  it('is composed of the three §10.2 groups, in order', () => {
    expect(INTERNAL_OPS_ROLES).toEqual(EXPECTED_INTERNAL_OPS_ROLES);
    expect(PORTAL_ROLES).toEqual(EXPECTED_PORTAL_ROLES);
    expect(THIRD_PARTY_ROLES).toEqual(EXPECTED_THIRD_PARTY_ROLES);
    expect(ROLES).toEqual([
      ...EXPECTED_INTERNAL_OPS_ROLES,
      ...EXPECTED_PORTAL_ROLES,
      ...EXPECTED_THIRD_PARTY_ROLES,
    ]);
  });

  it('has no duplicate key', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  it('keeps the three groups disjoint', () => {
    // A role that is both an internal seat and a portal seat would make every downstream
    // "is this an internal user?" branch ambiguous.
    const groups = [INTERNAL_OPS_ROLES, PORTAL_ROLES, THIRD_PARTY_ROLES];
    const total = groups.reduce((sum, group) => sum + group.length, 0);

    expect(new Set(groups.flat()).size).toBe(total);
  });

  it('uses snake_case machine codes, never display labels', () => {
    // Enums stay machine codes; their ar/en labels come from the i18n catalogue. A role
    // key that leaked into the UI as-is would be untranslatable.
    for (const role of ROLES) {
      expect(role).toMatch(/^[a-z][a-z_]*[a-z]$/);
    }
  });

  it('covers every role named in the two policy partitions below', () => {
    // Guards the partitions themselves from drifting out of the catalogue.
    const partitioned = [...MONEY_OR_FILING_ROLES, ...READ_ONLY_OR_EXTERNAL_ROLES];

    expect([...partitioned].sort()).toEqual([...ROLES].sort());
  });
});

describe('isRoleKey — narrowing untrusted input', () => {
  it('accepts every catalogue key', () => {
    for (const role of ROLES) {
      expect(isRoleKey(role)).toBe(true);
    }
  });

  it.each([
    ['the SCREAMING_SNAKE database form', 'NAZIR'],
    ['a value removed by ADR-0004', 'APPROVER'],
    ['a made-up role', 'root'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
    ['an object', { role: 'nazir' }],
  ])('rejects %s', (_label, value) => {
    expect(isRoleKey(value)).toBe(false);
  });
});

describe('TOTP_REQUIRED_ROLES — NFR-06', () => {
  it('contains every money-movement and statutory-filing role', () => {
    for (const role of MONEY_OR_FILING_ROLES) {
      const why = `${role} moves money or lodges filings — TOTP enrolment must be mandatory`;
      expect(TOTP_REQUIRED_ROLES, why).toContain(role);
    }
  });

  it('excludes the portal and third-party seats', () => {
    for (const role of ['family_board', 'beneficiary', 'subcontractor', 'auditor', 'counsel']) {
      expect(TOTP_REQUIRED_ROLES).not.toContain(role);
    }
  });

  it('DELIBERATELY over-requires: read-only `leadership` is included too', () => {
    // NFR-06 says "mandatory for money-movement and filing roles" but never enumerates
    // them, and the §3 grid marks A*/S* on `nazir` ALONE. Requiring TOTP of one person and
    // nobody else is not a defensible posture for a trustee's system of record, so the
    // implementation requires enrolment for all 8 internal seats — `leadership` included,
    // even though it is read-only.
    //
    // Over-requiring is the cheap error. This assertion exists so that RELAXING it is a
    // conscious edit rather than a silent drift, and it is cross-referenced by the
    // TODO(surface) in src/roles.ts: confirm the intended breadth before Phase 2 onboards
    // beneficiaries and the portal seats arrive.
    expect(TOTP_REQUIRED_ROLES).toContain('leadership');
    expect(TOTP_REQUIRED_ROLES).toEqual([...INTERNAL_OPS_ROLES]);
  });

  it('is the same list as the contract-named alias — the two must never drift', () => {
    expect(TOTP_MANDATORY_ROLES).toBe(TOTP_REQUIRED_ROLES);
  });

  it('agrees with requiresTotp for every role in the catalogue', () => {
    for (const role of ROLES) {
      expect(requiresTotp(role)).toBe(TOTP_REQUIRED_ROLES.includes(role));
    }
  });

  it('requires TOTP for exactly the internal seats and nothing else', () => {
    const required = ROLES.filter(requiresTotp);
    const notRequired = ROLES.filter((role) => !requiresTotp(role));

    expect(required).toEqual([...EXPECTED_INTERNAL_OPS_ROLES]);
    expect(notRequired).toEqual([...EXPECTED_PORTAL_ROLES, ...EXPECTED_THIRD_PARTY_ROLES]);
  });
});

describe('anyRoleRequiresTotp — the multi-grant case', () => {
  it('is false for an empty grant set', () => {
    expect(anyRoleRequiresTotp([])).toBe(false);
  });

  it('is false when every held role is TOTP-optional', () => {
    expect(anyRoleRequiresTotp(['beneficiary', 'family_board'])).toBe(false);
  });

  it('is true when ANY held role requires it', () => {
    // A user with a beneficiary portal seat on their own waqf AND a finance seat on the
    // firm's book must be gated on the stricter of the two.
    expect(anyRoleRequiresTotp(['beneficiary', 'finance'])).toBe(true);
    expect(anyRoleRequiresTotp(['nazir'])).toBe(true);
  });
});

describe('step-up TOTP — a fresh assertion at the moment of the act', () => {
  it('covers approve and sign, whoever performs them', () => {
    expect(TOTP_STEP_UP_ACTIONS).toEqual(['approve', 'sign']);
    expect(requiresStepUpTotp('approve')).toBe(true);
    expect(requiresStepUpTotp('sign')).toBe(true);
  });

  it.each(['read', 'list', 'export', 'create', 'update', 'delete', '', 'APPROVE'])(
    'does not step up for %s',
    (action) => {
      expect(requiresStepUpTotp(action)).toBe(false);
    },
  );
});

describe('the Prisma Role enum → RoleKey map', () => {
  it('only ever maps to a key that exists in the catalogue', () => {
    for (const [dbRole, key] of Object.entries(DB_ROLE_TO_ROLE_KEY)) {
      expect(isRoleKey(key), `${dbRole} maps to unknown role key ${key}`).toBe(true);
    }
  });

  it('leaves no product role unreachable from the database', () => {
    // If a RoleKey had no DB value mapping to it, no grant could ever produce it and the
    // seat would be dead code.
    const reachable = new Set(Object.values(DB_ROLE_TO_ROLE_KEY));

    for (const role of ROLES) {
      expect(reachable.has(role), `no database Role maps to ${role}`).toBe(true);
    }
  });

  it('uses SCREAMING_SNAKE keys, matching the Prisma enum', () => {
    for (const dbRole of Object.keys(DB_ROLE_TO_ROLE_KEY)) {
      expect(dbRole).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    }
  });

  /**
   * PARITY WITH THE PRISMA ENUM — the check whose absence let the counts drift.
   *
   * `packages/auth` cannot import `@qmulate/database` here (that would pull the generated
   * client and a live datasource into a pure unit test), so the enum is read out of
   * `schema.prisma` as text. A missing schema fails the test rather than skipping it: silence
   * is how this drift survived Sprint 1 in the first place.
   */
  it('is in exact parity with the Prisma Role enum in schema.prisma', () => {
    const schemaPath = fileURLToPath(
      new URL('../../database/prisma/schema.prisma', import.meta.url),
    );
    const schema = readFileSync(schemaPath, 'utf8');

    const block = /\benum\s+Role\s*\{([^}]*)\}/.exec(schema);
    expect(block, 'could not find `enum Role` in schema.prisma').not.toBeNull();

    const enumValues = (block?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z_]*$/.test(line));

    expect(new Set(enumValues)).toEqual(new Set(Object.keys(DB_ROLE_TO_ROLE_KEY)));
    expect(enumValues).toHaveLength(ROLES.length);

    for (const removed of ['MANDATE_LEAD', 'ACCOUNTANT', 'APPROVER']) {
      expect(enumValues, `${removed} was removed by ADR-0004`).not.toContain(removed);
    }
  });

  it('maps every DB value to its product key', () => {
    // Since ADR-0004 the only spelling difference left is SYSTEM_ADMIN -> admin.
    expect(roleKeyFromDbRole('SYSTEM_ADMIN')).toBe('admin');
    expect(roleKeyFromDbRole('CASE_MANAGER')).toBe('case_manager');
    expect(roleKeyFromDbRole('FINANCE')).toBe('finance');
    expect(roleKeyFromDbRole('NAZIR')).toBe('nazir');
  });

  it('the map is TOTAL over the narrowed enum — 13 values, 13 keys', () => {
    // Guards the other direction from `requiresTotpForDbRole`'s fail-safe: a value added to the
    // Prisma enum without a mapping here would silently vanish from `getUserRoleKeys`.
    const dbValues = Object.keys(DB_ROLE_TO_ROLE_KEY);
    expect(dbValues).toHaveLength(13);
    expect(new Set(Object.values(DB_ROLE_TO_ROLE_KEY))).toEqual(new Set(ROLES));
  });

  it.each([
    ['MANDATE_LEAD', 'a synonym for CASE_MANAGER'],
    ['ACCOUNTANT', 'a synonym for FINANCE'],
    ['APPROVER', "removed outright — approval is the nazir's action (BR-105/BR-1103)"],
  ])('%s is gone from the map (%s) — ADR-0004', (removed) => {
    // Not merely unmapped: these values no longer exist in the Prisma enum either. The mapping
    // must not quietly resurrect one by translating it to a survivor.
    expect(roleKeyFromDbRole(removed)).toBeUndefined();
  });

  it('returns undefined rather than guessing for an unknown value', () => {
    expect(roleKeyFromDbRole('DEFINITELY_NOT_A_ROLE')).toBeUndefined();
    expect(roleKeyFromDbRole('')).toBeUndefined();
  });
});

describe('requiresTotpForDbRole — fails SAFE', () => {
  it('requires TOTP for an unmapped or unknown database role', () => {
    // The security-critical property: adding a value to the Prisma enum can never
    // accidentally mint a TOTP-exempt seat. The default is "gated", not "allowed".
    expect(requiresTotpForDbRole('APPROVER')).toBe(true); // removed by ADR-0004
    expect(requiresTotpForDbRole('SOME_FUTURE_ROLE')).toBe(true);
    expect(requiresTotpForDbRole('')).toBe(true);
  });

  const MONEY_OR_FILING_DB_ROLES = [
    'NAZIR',
    'AUTHORIZED_REP',
    'FINANCE',
    'COMPLIANCE_OFFICER',
    'AML_OFFICER',
  ];

  it.each(MONEY_OR_FILING_DB_ROLES)(
    'requires TOTP for the money/filing database role %s',
    (dbRole) => {
      expect(requiresTotpForDbRole(dbRole)).toBe(true);
    },
  );

  it.each(['COUNSEL', 'AUDITOR', 'SUBCONTRACTOR', 'FAMILY_BOARD', 'BENEFICIARY'])(
    'leaves TOTP optional for the external database role %s',
    (dbRole) => {
      expect(requiresTotpForDbRole(dbRole)).toBe(false);
    },
  );
});

describe('module purity', () => {
  it('imports nothing — it must run in edge middleware and in the browser', () => {
    // `src/roles.ts` is the single predicate consulted by the login gate, the middleware
    // and the client. A stray import of Prisma or the env schema would drag the server
    // module graph into the browser bundle and break the edge runtime, and the failure
    // would surface as an opaque bundling error rather than as a test.
    const source = readFileSync(fileURLToPath(new URL('../src/roles.ts', import.meta.url)), 'utf8');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    expect(withoutComments).not.toMatch(/^\s*import\s/m);
    expect(withoutComments).not.toMatch(/\brequire\s*\(/);
    expect(withoutComments).not.toMatch(/\bawait import\s*\(/);
  });

  it('keeps the surfaced scope questions visible in the source', () => {
    // Binding rule 4: fiqh / legal / scope questions are surfaced, never resolved in code.
    // If someone deletes the TODO(surface) markers without the questions actually being
    // answered, the open decisions become invisible. This is the tripwire.
    const source = readFileSync(fileURLToPath(new URL('../src/roles.ts', import.meta.url)), 'utf8');
    // Only DECLARATIONS count — a line that merely cross-references one does not.
    const declarations = source.match(/^[ \t]*\/\/ TODO\(surface\):/gm) ?? [];

    // Was 2. The role-catalogue question was ANSWERED on 2026-07-27 (ADR-0004: §10.2's 13,
    // APPROVER removed), so its marker is legitimately gone — a resolved question must not be
    // kept alive as a permanent comment, or the tripwire becomes noise nobody reads. Lowering
    // this number is only correct alongside a decision record; the subject assertion below is
    // what stops a marker being deleted without one.
    expect(declarations.length).toBeGreaterThanOrEqual(1);
    expect(source).toMatch(/TODO\(surface\)[\s\S]{0,400}TOTP enrolment mandatory/);
    // And the resolved one must NOT quietly come back as an open question.
    expect(source).not.toMatch(/TODO\(surface\)[\s\S]{0,400}reconcile the role catalogue/);
  });
});
