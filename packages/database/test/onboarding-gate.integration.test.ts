/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-3 · THE THREE HANDOVER GATES ARE SEQUENCED AT THE DATABASE, AND GATE 02 GATES A RUN AND A FILING
 *         (migration 52 · BR-1101 · V-11 · §17 E11 exit)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every probe runs on the OWNER (so what refuses is the guard, never the ACL) and is rolled back.
 * The fixture's gate rows are the subjects: waqf-004 has Gate 01 CLEARED and Gates 02/03 OPEN (the
 * V-11 subject); waqf-001 has all three CLEARED.
 *
 * The api says the sentence first (`ONBOARDING_GATE_NOT_CLEARED`); these are the walls, and the
 * mutation at the end shows they are walls: with `qmulate_onboarding_gate_cleared()` neutralised, the
 * filing that was refused is admitted, and restored it is refused again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_SUCCEEDED,
  assertGuardsInstalled,
  closeDatabase,
  ensureSeeded,
  hasDatabase,
  privilegedPrisma,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-3 · onboarding gates (migration 52)');

const OPEN_SUBJECT = 'waqf-004';
const CLEARED_SUBJECT = 'waqf-001';
const RUN_NONCE = `${String(process.pid)}-${String(Date.now())}`;
const AT = `'2026-01-01T00:00:00.000Z'::timestamp`;
const HIJRI = `'1447-07-12'`;

type RawClient = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

const clearSql = (waqfId: string, rank: 1 | 2 | 3): string =>
  `UPDATE "onboarding_gate"
      SET "status" = 'CLEARED', "clearedAt" = ${AT}, "clearedAtHijri" = ${HIJRI},
          "clearedBy" = 'user-case-manager-001', "evidence" = '{"probe":true}'::jsonb
    WHERE "waqfId" = '${waqfId}' AND "gate" = (SELECT g FROM (VALUES
      ('GATE_01_AUTHORITY_LEGAL'::"OnboardingGateKind", 1),
      ('GATE_02_SYSTEMS_CONTROLS'::"OnboardingGateKind", 2),
      ('GATE_03_PEOPLE_PROPERTY_CADENCE'::"OnboardingGateKind", 3)) AS k(g, r) WHERE r = ${String(rank)})`;

const reopenSql = (waqfId: string, rank: 1 | 2 | 3): string =>
  `UPDATE "onboarding_gate"
      SET "status" = 'OPEN', "clearedAt" = NULL, "clearedAtHijri" = NULL, "clearedBy" = NULL,
          "reopenedAt" = ${AT}, "reopenedAtHijri" = ${HIJRI}, "reopenedBy" = 'user-nazir-001',
          "reopenReason" = 'probe (بيانات وهمية)'
    WHERE "waqfId" = '${waqfId}' AND "gate" = (SELECT g FROM (VALUES
      ('GATE_01_AUTHORITY_LEGAL'::"OnboardingGateKind", 1),
      ('GATE_02_SYSTEMS_CONTROLS'::"OnboardingGateKind", 2),
      ('GATE_03_PEOPLE_PROPERTY_CADENCE'::"OnboardingGateKind", 3)) AS k(g, r) WHERE r = ${String(rank)})`;

const filingSql = (waqfId: string, status: string, suffix: string): string =>
  `INSERT INTO "government_filing" ("id","waqfId","platform","status","createdAt","updatedAt")
   VALUES ('filing-s12-${suffix}-${RUN_NONCE}','${waqfId}','QIWA'::"GovernmentPlatform",'${status}'::"FilingStatus",now(),now())`;

describe.skipIf(!hasDatabase)('S12-3 · onboarding gates at the database', () => {
  let owner: RawClient;

  /**
   * ⚠ ONE STATEMENT, ONE CONNECTION. A first draft issued `BEGIN` / statements / `ROLLBACK` as
   * separate `$executeRawUnsafe` calls on the pooled Prisma client. Locally the pool happened to hand
   * them to one connection; on CI it did not — a transaction stayed OPEN holding a row lock, and a later
   * `ALTER TABLE … DISABLE TRIGGER` (which needs ACCESS EXCLUSIVE) blocked until the job's 25-minute
   * timeout killed it with no output (CI run 34231994890). The harness's `rollbackProbeSql` exists
   * for exactly this: every statement inside one `DO` block that always RAISES, so nothing can leak.
   * `SET CONSTRAINTS ALL IMMEDIATE` makes any DEFERRED constraint trigger fire at statement end, so its
   * refusal is observable inside the block rather than lost at a COMMIT that never comes.
   */
  const inRolledBackTx = async (statements: readonly string[]): Promise<string | null> => {
    const text = await runProbe(rollbackProbeSql(['SET CONSTRAINTS ALL IMMEDIATE', ...statements]));
    return text.includes(PROBE_SUCCEEDED) ? null : text;
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    owner = (await privilegedPrisma()) as unknown as RawClient;
  }, 300_000);

  afterAll(async () => {
    await closeDatabase();
  });

  it('0 · the fixture states the subjects this file relies on', async () => {
    const rows = await owner.$queryRawUnsafe<{ waqfId: string; gate: string; status: string }[]>(
      `SELECT "waqfId", "gate"::text AS gate, "status"::text AS status FROM "onboarding_gate"
        WHERE "waqfId" IN ('${OPEN_SUBJECT}','${CLEARED_SUBJECT}') ORDER BY "waqfId", "gate"`,
    );
    expect(rows).toEqual([
      { waqfId: 'waqf-001', gate: 'GATE_01_AUTHORITY_LEGAL', status: 'CLEARED' },
      { waqfId: 'waqf-001', gate: 'GATE_02_SYSTEMS_CONTROLS', status: 'CLEARED' },
      { waqfId: 'waqf-001', gate: 'GATE_03_PEOPLE_PROPERTY_CADENCE', status: 'CLEARED' },
      { waqfId: 'waqf-004', gate: 'GATE_01_AUTHORITY_LEGAL', status: 'CLEARED' },
      { waqfId: 'waqf-004', gate: 'GATE_02_SYSTEMS_CONTROLS', status: 'OPEN' },
      { waqfId: 'waqf-004', gate: 'GATE_03_PEOPLE_PROPERTY_CADENCE', status: 'OPEN' },
    ]);
  });

  describe('1 · the order, in both directions', () => {
    it('1a · Gate 03 cannot be CLEARED over an open Gate 02 — named', async () => {
      const failure = await inRolledBackTx([clearSql(OPEN_SUBJECT, 3)]);
      expect(failure).toMatch(/ONBOARDING_GATE_ORDER/);
      expect(failure).toMatch(/GATE_02_SYSTEMS_CONTROLS is not CLEARED/);
    });

    it('1b · POSITIVE CONTROL · Gate 02 CAN be cleared over a cleared Gate 01 (rolled back)', async () => {
      expect(await inRolledBackTx([clearSql(OPEN_SUBJECT, 2)])).toBeNull();
    });

    it('1c · Gate 03 can be cleared once Gate 02 is, in the same transaction', async () => {
      expect(
        await inRolledBackTx([clearSql(OPEN_SUBJECT, 2), clearSql(OPEN_SUBJECT, 3)]),
      ).toBeNull();
    });

    it('1d · Gate 01 cannot be REOPENED while Gate 02 is CLEARED; Gate 03 can', async () => {
      const failure = await inRolledBackTx([reopenSql(CLEARED_SUBJECT, 1)]);
      expect(failure).toMatch(/ONBOARDING_GATE_ORDER/);
      expect(failure).toMatch(/cannot be REOPENED/);
      expect(await inRolledBackTx([reopenSql(CLEARED_SUBJECT, 3)])).toBeNull();
    });

    it('1e · a gate row is not re-pointed to another gate or endowment', async () => {
      const failure = await inRolledBackTx([
        `UPDATE "onboarding_gate" SET "gate" = 'GATE_01_AUTHORITY_LEGAL' WHERE "id" = 'gate-${OPEN_SUBJECT}-3'`,
      ]);
      expect(failure).toMatch(/write-once/);
    });
  });

  describe('2 · the CHECKs', () => {
    it('2a · a CLEARED gate is attributed and dual-dated', async () => {
      const noBy = await inRolledBackTx([
        `UPDATE "onboarding_gate" SET "status" = 'CLEARED', "clearedAt" = ${AT}, "clearedAtHijri" = ${HIJRI}
          WHERE "id" = 'gate-${OPEN_SUBJECT}-2'`,
      ]);
      expect(noBy).toMatch(/onboarding_gate_cleared_is_attributed/);
      const noHijri = await inRolledBackTx([
        `UPDATE "onboarding_gate" SET "status" = 'CLEARED', "clearedAt" = ${AT}, "clearedBy" = 'x'
          WHERE "id" = 'gate-${OPEN_SUBJECT}-2'`,
      ]);
      expect(noHijri).toMatch(/onboarding_gate_cleared_dual_dated/);
    });

    it('2b · a REOPEN is reasoned, and a CLEARED gate carries no reopen record', async () => {
      const noReason = await inRolledBackTx([
        `UPDATE "onboarding_gate" SET "status" = 'OPEN', "clearedAt" = NULL, "clearedAtHijri" = NULL,
                "clearedBy" = NULL, "reopenedAt" = ${AT}, "reopenedAtHijri" = ${HIJRI}, "reopenedBy" = 'x'
          WHERE "id" = 'gate-${CLEARED_SUBJECT}-3'`,
      ]);
      expect(noReason).toMatch(/onboarding_gate_reopen_is_reasoned/);
      const clearedWithReopen = await inRolledBackTx([
        `UPDATE "onboarding_gate" SET "reopenedAt" = ${AT}, "reopenedAtHijri" = ${HIJRI}, "reopenedBy" = 'x',
                "reopenReason" = 'r' WHERE "id" = 'gate-${CLEARED_SUBJECT}-3'`,
      ]);
      expect(clearedWithReopen).toMatch(/onboarding_gate_cleared_has_no_reopen/);
    });
  });

  describe('3 · never deleted', () => {
    it('3a · DELETE is refused', async () => {
      const failure = await inRolledBackTx([
        `DELETE FROM "onboarding_gate" WHERE "id" = 'gate-${OPEN_SUBJECT}-3'`,
      ]);
      expect(failure).toMatch(/REOPENED|never removed|refused/i);
    });
    it('3b · TRUNCATE is refused', async () => {
      expect(await inRolledBackTx([`TRUNCATE "onboarding_gate"`])).not.toBeNull();
    });
  });

  describe('4 · what Gate 02 blocks (the twins)', () => {
    it('4a · a filing cannot be SUBMITTED on an endowment whose Gate 02 is open', async () => {
      const failure = await inRolledBackTx([filingSql(OPEN_SUBJECT, 'SUBMITTED', '4a')]);
      expect(failure).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      expect(failure).toMatch(/Gate 02/);
    });

    it('4b · POSITIVE CONTROL · a filing that is NOT a submission is admitted on the same endowment', async () => {
      expect(await inRolledBackTx([filingSql(OPEN_SUBJECT, 'IN_PROGRESS', '4b')])).toBeNull();
    });

    it('4c · with Gate 02 cleared in the same transaction, the onboarding twin no longer refuses the submission', async () => {
      const failure = await inRolledBackTx([
        clearSql(OPEN_SUBJECT, 2),
        filingSql(OPEN_SUBJECT, 'SUBMITTED', '4c'),
      ]);
      // Another guard may still speak (a submission needs its approval) — but not THIS one.
      expect(failure ?? '').not.toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
    });

    it('4d · a distribution cannot be BORN on an endowment whose Gate 02 is open', async () => {
      // Copy the seeded run's row shape onto waqf-004 with a fresh id, as an unapproved COMPUTED run.
      const failure = await inRolledBackTx([
        `CREATE TEMP TABLE qm_probe_run ON COMMIT DROP AS SELECT * FROM "distribution" WHERE "id" = 'dist-001'`,
        `UPDATE qm_probe_run SET "id" = 'dist-s12-probe-${RUN_NONCE}', "waqfId" = '${OPEN_SUBJECT}',
                "status" = 'COMPUTED', "approvalRequestId" = NULL, "executedAt" = NULL, "executedAtHijri" = NULL`,
        `INSERT INTO "distribution" SELECT * FROM qm_probe_run`,
      ]);
      expect(failure).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      expect(failure).toMatch(/distribution run cannot be created/);
    });

    it('4e · the same birth on the CLEARED endowment is not refused by the onboarding twin', async () => {
      const failure = await inRolledBackTx([
        `CREATE TEMP TABLE qm_probe_run2 ON COMMIT DROP AS SELECT * FROM "distribution" WHERE "id" = 'dist-001'`,
        `UPDATE qm_probe_run2 SET "id" = 'dist-s12-probe2-${RUN_NONCE}', "status" = 'COMPUTED',
                "approvalRequestId" = NULL, "executedAt" = NULL, "executedAtHijri" = NULL`,
        `INSERT INTO "distribution" SELECT * FROM qm_probe_run2`,
      ]);
      expect(failure ?? '').not.toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
    });

    it('4f · absence is not evidence: an endowment with NO gate rows is blocked', async () => {
      const rows = await owner.$queryRawUnsafe<{ cleared: boolean }[]>(
        `SELECT qmulate_onboarding_gate_cleared('waqf-does-not-exist', 'GATE_02_SYSTEMS_CONTROLS') AS cleared`,
      );
      expect(rows[0]?.cleared).toBe(false);
    });
  });

  describe('5 · MUTATION — the predicate neutralised, observed, restored', () => {
    it('5a · with qmulate_onboarding_gate_cleared() := true the submission is ADMITTED by this twin; restored, refused', async () => {
      const defs = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_onboarding_gate_cleared(text,"OnboardingGateKind")'::regprocedure) AS def`,
      );
      const original = defs[0]?.def ?? '';
      expect(original).toContain(`"status" = 'CLEARED'`);
      let underMutation: string | null = 'not-attempted';
      try {
        await owner.$executeRawUnsafe(
          `CREATE OR REPLACE FUNCTION qmulate_onboarding_gate_cleared(p_waqf_id text, p_gate "OnboardingGateKind")
             RETURNS boolean LANGUAGE sql STABLE AS $qm_mut$ SELECT true $qm_mut$`,
        );
        underMutation = await inRolledBackTx([filingSql(OPEN_SUBJECT, 'SUBMITTED', '5a')]);
      } finally {
        await owner.$executeRawUnsafe(original);
      }
      expect(underMutation ?? '').not.toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      const restored = await inRolledBackTx([filingSql(OPEN_SUBJECT, 'SUBMITTED', '5a2')]);
      expect(restored).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      const after = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_onboarding_gate_cleared(text,"OnboardingGateKind")'::regprocedure) AS def`,
      );
      expect(after[0]?.def).toBe(original);
    });
  });
});
