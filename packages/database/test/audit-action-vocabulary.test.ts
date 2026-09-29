// S10/T1 — the AuditAction vocabulary pin.
//
// ⚠ WHY A HAND-LIST, WHEN THE REPO'S RULE IS "DERIVE SUBJECTS": because enum MEMBERS are
// VOCABULARY, and vocabulary is exactly what the canon says to hand-list so an addition goes RED
// instead of landing silently. Measured before this file existed (2026-09-01, orchestrator):
// `AuditAction` had NEVER been widened (the only migration mentioning it is 00000000000000_init —
// zero `ALTER TYPE "AuditAction" ADD VALUE` in all 44 migrations), NO pin of any kind covered it
// (no Record<AuditAction, …>, no exhaustive switch, no hand-list), and NO i18n copy is keyed to
// any member. So a new member — say, the T2 coverage control's SWEEP_COVERAGE_GAP — would have
// shipped with nothing anywhere noticing, no ar/en statement copy demanded, and the parity
// suites' silence reading as success. This is the repo's recurring failure wearing an enum.
//
// THE DISCIPLINE THIS PIN ENFORCES when it goes red on a deliberate widening:
//   1. Extend this list IN THE SAME CHANGE, with the migration that adds the member
//      (`ALTER TYPE … ADD VALUE` — its first ever, so also re-read ADR-0004's refuse-don't-remap
//      rule before writing it).
//   2. DECLARE THE ar/en COPY OWED, explicitly, in the change's record. Audit actions surface in
//      the trail admins read and in any export a regulator sees; that wording is PRODUCT-APPROVED
//      text (E10/E12 review), and a code change may not invent it (CLAUDE.md, register item #12's
//      rule for reason-code copy). Declaring the debt is mandatory because — measured, above —
//      NOTHING ELSE will demand it.
//   3. If the member records an absence or a control fact (the LOGIN_FAILED / ACCESS_DENIED
//      family), say which reader it exists for in the migration comment.
//
// This file lives in packages/database's OWN suite: schema.prisma is this package's file AND a
// turbo globalDependency, so the hash inputs cover what is read and a cache replay cannot serve
// a stale pass over a widened enum (the S6/E5 lesson, run 32137246961).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SCHEMA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'prisma',
  'schema.prisma',
);

/** The FOURTEEN members as of migration 46 (S10/T2; 13 at T1's migration 44). Order is the enum's own. */
const PINNED_AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE_SOFT',
  'APPROVE',
  'REJECT',
  'READ_SENSITIVE',
  'EXPORT',
  'LOGIN',
  'LOGIN_FAILED',
  'ACCESS_DENIED',
  'FILING_STATUS_CHANGE',
  'DISTRIBUTION_POST',
  'AML_REPORT',
  // ⊕ S10/T2, migration 46 — the enum's FIRST widening, done the way this pin's message demands:
  // the migration is vocabulary-only, this list moves 13 → 14 in the SAME change, and the ar/en
  // statement copy is DECLARED OWED to E10/E12 in the stage record (product-approved text, never
  // invented in code). Emitted by packages/database/src/sweep-coverage.ts — one event per
  // endowment the deadline sweep seat cannot see.
  'SWEEP_COVERAGE_GAP',
] as const;

describe('AuditAction vocabulary (S10/T1 pin)', () => {
  it('holds exactly the PINNED members, in order — a widening must be deliberate and must declare its ar/en copy owed', () => {
    const source = readFileSync(SCHEMA, 'utf8');
    const match = /enum AuditAction \{([^}]*)\}/.exec(source);
    expect(match, 'enum AuditAction not found in schema.prisma').not.toBeNull();

    const members = (match?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));

    expect(
      members,
      'AuditAction changed. If this is deliberate: extend PINNED_AUDIT_ACTIONS in this same ' +
        'change, add the ALTER TYPE migration, and DECLARE THE ar/en COPY OWED in the change ' +
        'record — nothing else in this repository will demand it (measured 2026-09-01: no other ' +
        'pin, no keyed i18n copy, never widened before). A silent vocabulary addition is the ' +
        'failure this file exists to end.',
    ).toStrictEqual([...PINNED_AUDIT_ACTIONS]);
  });
});
