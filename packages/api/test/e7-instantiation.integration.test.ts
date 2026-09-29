/**
 * `e7-instantiation.integration.test.ts` — §09 Engine A's acceptance set A1–A6, measured at the
 * API against the real seeded catalogue (E7-completion stage; owner sequencing ruling 2026-08-24).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT EACH CLAUSE IS PROVEN ON, AND WHY THAT SUBJECT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · A1 — `waqf-001`, THE FIXTURE'S MEDIUM WAQF, because E7's exit clause names it: *"the
 *    fixture's medium waqf generates the class-gated task set."* The expected set is DERIVED from
 *    the canonical catalogue in this file (never hand-listed) AND the count is pinned literally —
 *    a derivation alone would follow a broken resolver wherever it went.
 *  · A2 — a provisioned NOT_CLASSIFIED endowment: the act is refused AND zero rows exist after.
 *  · A3/A4 — a provisioned LARGE endowment round-tripped LARGE→SMALL→LARGE: retire-with-history,
 *    re-instantiation, and the retired copies still queryable.
 *  · A5 — DELETE refused at the database for BOTH the app and the migrator roles; un-retiring
 *    refused (migration 36's terminal rule).
 *  · A6 — TWO provisioned DIRECT_UTILIZATION endowments, one moneyless and one with a single raw
 *    INCOME receipt, so *"`FIN-MGT-04` instantiates only if the waqf records income/expense"* is
 *    a measured CONTRAST at the full stack, not a resolver unit test repeated.
 *
 * ── ⚠ CLEANUP CONTRACT (the once-per-database landmine, rule 5) ──────────────────────────────
 * A1 writes engine tasks onto a FIXTURE endowment, and `@qmulate/database`'s suite pins the
 * global task count at 10 and waqf-001's LARGE_MEDIUM task count at 2 — so this file purges its
 * own engine rows from waqf-001 in `afterAll` (and self-heals in `beforeAll` against a crashed
 * previous run), scoped to `"instantiatedReason" IS NOT NULL`, which NO fixture row carries and
 * migration 36 makes unforgeable (the identity is frozen, NULL included). The provisioned
 * endowments' children are removed by `deleteProvisionedEndowments`, which learned three new
 * tables for this suite. `audit_event` rows are left alone — append-only, no FK.
 *
 * All rows invented — no client data (G-8: Arabic prose carries the fictional marker).
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { OBLIGATION_LIBRARY, OBLIGATION_LIBRARY_VERSION } from '@qmulate/domain/compliance';
import { obligationsForClassification } from '@qmulate/domain/classification';
import type { WaqfClassification } from '@qmulate/domain/classification';
import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  FICTIONAL_MARKER_AR,
  assertSeeded,
  basePrisma,
  contextFor,
  countAuditEvents,
  deleteProvisionedEndowments,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const OFFICER = `${API_TEST_PREFIX}e7-officer`;
const MEDIUM_WAQF = 'waqf-001';
const LOCKED_WAQF = `${API_TEST_WAQF_PREFIX}e7-locked`;
const ROUNDTRIP_WAQF = `${API_TEST_WAQF_PREFIX}e7-roundtrip`;
const DIRECT_MONEYLESS_WAQF = `${API_TEST_WAQF_PREFIX}e7-direct-dry`;
const DIRECT_INCOME_WAQF = `${API_TEST_WAQF_PREFIX}e7-direct-wet`;
const DIRECT_ACCOUNT_ID = `${API_TEST_PREFIX}e7-direct-account`;

const ALL_SUBJECT_WAQFS = [
  LOCKED_WAQF,
  ROUNDTRIP_WAQF,
  DIRECT_MONEYLESS_WAQF,
  DIRECT_INCOME_WAQF,
] as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The expected sets — DERIVED from the canonical catalogue through the real resolver, so this
 * file cannot disagree with the engine about §09's table; the literal pins below keep the
 * derivation honest in the other direction.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const STORABLE = OBLIGATION_LIBRARY.filter((row) => row.titleAr !== null);
const RECURRENCE_BY_CODE = new Map(STORABLE.map((row) => [row.code, row.recurrence]));

/**
 * ⊕ S9-4a — `directUtilization` is now a PARAMETER of the expectation, not an omission.
 *
 * ⚠ THE OMISSION WAS A REAL DEFECT IN THIS HELPER AND IT SHOWED UP AS A COUNT. Leaving the usage
 * axis absent parks every usage-sensitive row (`SMALL_DIRECT`, `EXCLUDE_DIRECT`) in
 * `directUseFactMissing` instead of deciding it — so the DERIVED expectation silently dropped
 * `FIN-DIST-01` (gate `EXCLUDE_DIRECT`) while the api path, which reads the attribute off the row,
 * correctly instantiated it. A derived expectation that consults fewer facts than the code under
 * test is not an independent check; it is a second implementation with a hole in it.
 */
function expectedInstantiation(
  classification: WaqfClassification,
  hasIncome: boolean,
  directUtilization: boolean | null,
): { instantiate: string[]; eventSkipped: string[] } {
  const partition = obligationsForClassification({
    classification,
    catalogue: STORABLE.map((row) => ({
      code: row.code,
      gate: row.gate,
      section: row.section,
      workstreamAr: row.workstreamAr,
      workstreamEn: row.workstreamEn,
      titleAr: row.titleAr as string,
      titleEn: row.titleEn,
      deadlineRuleKey: row.deadlineRuleKey,
    })),
    hasIncomeInPeriod: hasIncome,
    directUtilization,
  });
  return {
    instantiate: partition.obligations
      .filter((row) => RECURRENCE_BY_CODE.get(row.code) !== 'EVENT')
      .map((row) => row.code)
      .sort(),
    eventSkipped: partition.obligations
      .filter((row) => RECURRENCE_BY_CODE.get(row.code) === 'EVENT')
      .map((row) => row.code)
      .sort(),
  };
}

/** Remove THIS SUITE's engine rows from the fixture endowment. See the header's cleanup contract. */
async function purgeEngineTasksOnFixtureWaqf(): Promise<void> {
  const prisma = await privilegedPrisma();
  await prisma.$executeRawUnsafe(
    [
      'DO $qm_e7_task_purge$',
      'BEGIN',
      '  ALTER TABLE "compliance_task" DISABLE TRIGGER compliance_task_no_delete;',
      `  DELETE FROM "compliance_task" WHERE "waqfId" = '${MEDIUM_WAQF}' AND "instantiatedReason" IS NOT NULL;`,
      '  ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_no_delete;',
      'END',
      '$qm_e7_task_purge$;',
    ].join('\n'),
  );
}

async function officerCaller(requestId: string) {
  return createCaller(await contextFor({ userId: OFFICER, requestId }));
}

function hijriOf(instant: Date): string {
  return String(toHijriSnapshot(instant));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.runIf(hasDatabase)('E7 · §09 Engine A — per-endowment task instantiation (A1–A6)', () => {
  beforeAll(async () => {
    await assertSeeded();
    await purgeEngineTasksOnFixtureWaqf(); // self-heal: a crashed run's rows must not poison this one
    // Endowments FIRST: the officer's grants name these ids (FK to `waqf`).
    await provisionIntakeEndowment({ id: LOCKED_WAQF, classification: 'NOT_CLASSIFIED' });
    await provisionIntakeEndowment({ id: ROUNDTRIP_WAQF, classification: 'LARGE' });
    await provisionIntakeEndowment({
      id: DIRECT_MONEYLESS_WAQF,
      // ⊕ S9-4a — the A6 contrast's subject is now SMALL **and** direct-use, two axes instead of one
      // conflated value. That is the ruling's own example: *"an endowment could be small AND
      // direct-use."*
      classification: 'SMALL',
      directUtilization: true,
    });
    await provisionIntakeEndowment({
      id: DIRECT_INCOME_WAQF,
      classification: 'SMALL',
      directUtilization: true,
    });
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [MEDIUM_WAQF, ...ALL_SUBJECT_WAQFS],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'compliance:task:read',
          'compliance:task:write',
        ],
      },
    ]);

    // A6's "records income/expense" arm: one dedicated account + one INCOME receipt, written raw
    // because no product path creates an endowment's first account — the same choice
    // `finance-maker-checker` records for its non-dedicated subject. The app role writes the
    // transaction so every live guard (dedication, classification-at-entry) is satisfied, not
    // bypassed; both rows are removed by `deleteProvisionedEndowments` in afterAll.
    const prisma = await basePrisma();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "bank_account" ("id","waqfId","accountRef","ibanEnc","ibanHmac","bankNameAr","purpose","currency","isDedicated","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SAR',true,now(),now())
       ON CONFLICT ("id") DO NOTHING`,
      DIRECT_ACCOUNT_ID,
      DIRECT_INCOME_WAQF,
      `${API_TEST_PREFIX}e7-direct-dedicated`,
      'enc:fixture-only',
      `hmac-${API_TEST_PREFIX}e7-direct`,
      `حساب الوقف المخصص ${FICTIONAL_MARKER_AR}`,
      'dedicated account for the A6 has_income contrast',
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "transaction"
         ("id","waqfId","type","category","receiptClass","descriptionAr","amountSar","date","dateHijri","bankAccountId","createdAt","updatedAt")
       VALUES ($1,$2,'REVENUE','rent','INCOME',$3,1000,'2026-02-01'::timestamp,'1447-08-13',$4,now(),now())
       ON CONFLICT ("id") DO NOTHING`,
      `${API_TEST_PREFIX}e7-direct-income`,
      DIRECT_INCOME_WAQF,
      `إيراد إيجار تجريبي ${FICTIONAL_MARKER_AR}`,
      DIRECT_ACCOUNT_ID,
    );
  });

  afterAll(async () => {
    await purgeEngineTasksOnFixtureWaqf();
    await deleteProvisionedEndowments([...ALL_SUBJECT_WAQFS]);
    // ⚠ THE HOUSE CONVENTION, LEARNED BY MEASUREMENT: every sibling suite calls this in its own
    // afterAll, and this file's first draft did not — so a FILTERED run left the officer's `user`
    // row behind and `seed.integration.test.ts`'s exact E1-2 row counts went red two tests deep,
    // one package away, on the NEXT db-suite run (reproduced deliberately before this line landed:
    // filtered e7 run → db suite → `writes exactly the E1-2 row counts` + `seeds the three
    // negative-test identities` both fail; with this line, green).
    const { cleanupApiTestRows } = await import('./setup.js');
    await cleanupApiTestRows();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * A1 — the fixture's MEDIUM waqf generates the class-gated task set (the exit clause itself)
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('A1 · initial setup on waqf-001 (MEDIUM, ledger has income)', () => {
    it('materialises exactly the applicable non-EVENT templates — 30 tasks, derived AND pinned', async () => {
      const caller = await officerCaller('e7-a1-instantiate');
      const result = await caller.compliance.instantiateRegister({ waqfId: MEDIUM_WAQF });

      expect(result.classification).toBe('MEDIUM');
      // waqf-001's fixture ledger has income rows (rev-001, rev-005, …), so `hasIncome` is a fact
      // about the SEED and this assertion notices if the fixture ever loses its receipts.
      expect(result.hasIncome).toBe(true);

      const expected = expectedInstantiation('MEDIUM', true, false);
      expect(result.instantiated.map((task) => task.templateCode).sort()).toEqual(
        expected.instantiate,
      );
      // ⚠ THE LITERAL PIN. 28 was E7's exit number AT LIBRARY 2026-08-20.1 and STANDS as that
      // version's measurement; 30 is the 2026-08-26.1 number, not a correction of 28 — the
      // owner-ruled bump adds FIN-MGT-05 (ALL, cadence-less) and GOV-SHART-03 (LARGE_MEDIUM,
      // annual) to a MEDIUM register, while FIN-DIST-03/GOV-GEN-04 are EVENT and never
      // pre-materialise. 40 storable templates: 30 instantiate; 9 are EVENT; 1 (`FIN-MGT-04`,
      // small_direct) is excluded by the class. A derivation-only assertion would follow a
      // broken resolver.
      expect(result.instantiated).toHaveLength(30);

      // ⚠ EIGHT skipped codes on the wire, not the catalogue's nine (six-not-seven at
      // 2026-08-20.1) — AND THAT IS S8-Q1 HOLDING
      // THE LINE, found by this test's own first draft, which expected seven and was thereby
      // DEMANDING A LEAK: the officer is NOT an AML-compartment member, so `amlClause` drops the
      // `GOV-AML-02` row from the catalogue read and the response must not name the duty even in
      // a skip list ("the general register shows nothing AML-attributable"). The instantiation
      // OUTCOME is membership-invariant today because the one compartmented template is EVENT —
      // it materialises nothing for member and non-member alike — and the register-read parity
      // below keeps that property honest.
      expect(result.skippedEventTemplates.sort()).toEqual(
        expected.eventSkipped.filter((code) => code !== 'GOV-AML-02'),
      );
      expect(result.skippedEventTemplates).toHaveLength(8);
      expect(JSON.stringify(result)).not.toContain('GOV-AML-02');

      // The exit clause's named four (audit/budget/bylaws/periodic statements), individually.
      for (const code of ['FIN-MGT-02', 'FIN-MGT-03', 'GOV-SHART-02', 'GOV-GEN-01']) {
        expect(expected.instantiate).toContain(code);
      }
      // And the small_direct-only template does NOT appear — the clause's negative half.
      expect(result.instantiated.map((task) => task.templateCode)).not.toContain('FIN-MGT-04');

      // §09's OTHER not-pre-materialised templates all sit in the skip (GOV-AML-02 is the
      // compartment case above) — including the two 2026-08-26.1 EVENT additions: instantiation
      // never writes an event duty onto the board.
      for (const code of [
        'GOV-REG-02',
        'GOV-PROT-02',
        'GOV-GEN-03',
        'GOV-INV-01',
        'FIN-DIST-03',
        'GOV-GEN-04',
      ]) {
        expect(result.skippedEventTemplates).toContain(code);
      }

      // The five open-or-closed fixture rows on waqf-001 are pre-engine: the planner reports the
      // OPEN ones as unattributable (SEED-* codes) and manages none of them.
      for (const task of result.unknownOpen) {
        expect(task.templateCode).toMatch(/^SEED-/);
      }

      // The rows the engine wrote, read back through the board: full identity, frozen snapshot.
      const board = await caller.compliance.tasks({ waqfId: MEDIUM_WAQF });
      const engineRows = board.tasks.filter((task) => task.instantiatedReason !== null);
      expect(engineRows).toHaveLength(30);
      for (const task of engineRows) {
        expect(task).toMatchObject({
          status: 'NOT_STARTED',
          templateVersion: OBLIGATION_LIBRARY_VERSION,
          classificationAtInstantiation: 'MEDIUM',
          instantiatedReason: 'INITIAL_SETUP',
          retiredReason: null,
          retiredAt: null,
        });
      }

      // NOTHING the engine wrote is compartmented — the one AML_RESTRICTED template is EVENT and
      // never pre-materialises. Asserted at the database so the day this stops being true is loud.
      const prisma = await basePrisma();
      const restricted = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "compliance_task"
          WHERE "waqfId" = '${MEDIUM_WAQF}' AND "confidentiality" = 'AML_RESTRICTED'`,
      );
      expect(Number(restricted[0]?.n ?? -1)).toBe(0);

      // ONE correlated register-generation event, entity = the register (natural key: the waqf).
      expect(
        await countAuditEvents({
          action: 'CREATE',
          category: 'MUTATION',
          entityId: MEDIUM_WAQF,
          waqfId: MEDIUM_WAQF,
        }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('REFUSES a second initial setup — after setup, the register changes only through reclassify', async () => {
      const caller = await officerCaller('e7-a1-again');
      await expect(caller.compliance.instantiateRegister({ waqfId: MEDIUM_WAQF })).rejects.toThrow(
        /already has an engine-instantiated register/,
      );
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * A2 — no classification ⇒ locked, and NO tasks are materialised
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('A2 · NOT_CLASSIFIED refuses the act, and the table stays empty', () => {
    it('refuses with the lock, pointing at the one exit', async () => {
      const caller = await officerCaller('e7-a2-locked');
      await expect(caller.compliance.instantiateRegister({ waqfId: LOCKED_WAQF })).rejects.toThrow(
        /NOT_CLASSIFIED.*LOCKED/s,
      );

      // "no tasks are materialised" is a COUNT, not an error message.
      const prisma = await basePrisma();
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "compliance_task" WHERE "waqfId" = '${LOCKED_WAQF}'`,
      );
      expect(Number(rows[0]?.n ?? -1)).toBe(0);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * A3 / A4 — the reclassification round trip, with history
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('A3/A4 · LARGE→SMALL retires with history; SMALL→LARGE re-instantiates beside it', () => {
    it('sets up: a LARGE register instantiates (moneyless, so the ledger-gated rows are excluded)', async () => {
      const caller = await officerCaller('e7-a34-setup');
      const result = await caller.compliance.instantiateRegister({ waqfId: ROUNDTRIP_WAQF });
      expect(result.hasIncome).toBe(false);
      const expected = expectedInstantiation('LARGE', false, false);
      expect(result.instantiated.map((task) => task.templateCode).sort()).toEqual(
        expected.instantiate,
      );
      // 40 storable − 9 EVENT − 1 small_direct − 4 HAS_INCOME (moneyless) = 26
      // (was 36 − 7 − 1 − 4 = 24 at library 2026-08-20.1).
      expect(result.instantiated).toHaveLength(26);
    });

    it('A3 · LARGE→SMALL: the LARGE_MEDIUM tasks retire (reason recorded, rows kept), FIN-MGT-04 arrives, ONE correlated event', async () => {
      const caller = await officerCaller('e7-a3-downgrade');
      const at = new Date();
      const result = await caller.classification.reclassify({
        waqfId: ROUNDTRIP_WAQF,
        to: 'SMALL',
        reason: `E7 A3 exercise: revaluation shrank the asset base ${FICTIONAL_MARKER_AR}`,
        at: at.toISOString(),
        atHijri: hijriOf(at),
      });

      expect(result.taskDiff.applied).toBe(true);
      const diff = result.taskDiff as Extract<typeof result.taskDiff, { applied: true }>;
      // The six LARGE_MEDIUM templates — §09's worked four (budget, SOCPA audit, bylaws,
      // periodic statements) plus GOV-GOVN-02, which the catalogue gates identically, plus
      // GOV-SHART-03 (the bylaws review, since library 2026-08-26.1 — §09's worked shape names
      // it since the same amendment; five at 2026-08-20.1).
      expect(diff.tasksRetired.map((task) => task.templateCode).sort()).toEqual([
        'FIN-MGT-02',
        'FIN-MGT-03',
        'GOV-GEN-01',
        'GOV-GOVN-02',
        'GOV-SHART-02',
        'GOV-SHART-03',
      ]);
      expect(diff.tasksInstantiated.map((task) => task.templateCode)).toEqual(['FIN-MGT-04']);

      // "reason recorded, rows kept": the retired rows exist, RETIRED, carrying §09's own string.
      const board = await caller.compliance.tasks({ waqfId: ROUNDTRIP_WAQF });
      const retired = board.tasks.filter((task) => task.status === 'RETIRED');
      expect(retired).toHaveLength(6);
      for (const task of retired) {
        expect(task.retiredReason).toBe('reclassified LARGE→SMALL');
        expect(task.retiredAt).toBe(at.toISOString());
      }
      const arrived = board.tasks.find((task) => task.templateCode === 'FIN-MGT-04');
      expect(arrived).toMatchObject({
        status: 'NOT_STARTED',
        instantiatedReason: 'RECLASSIFICATION',
        classificationAtInstantiation: 'SMALL',
      });

      // BR-104's "one correlated audit event": the reclassification's SENSITIVE trail row carries
      // the whole task delta beside the duty delta — read back from the database, not the response.
      const prisma = await basePrisma();
      const trail = await prisma.$queryRawUnsafe<
        { instantiated: unknown; retired: unknown; applied: unknown }[]
      >(
        `SELECT "context"->'tasksInstantiated' AS instantiated,
                "context"->'tasksRetired' AS retired,
                "context"->'taskDiffApplied' AS applied
           FROM "audit_event"
          WHERE "waqfId" = '${ROUNDTRIP_WAQF}' AND "entityType" = 'ReclassificationEvent'
            AND "context"->>'to' = 'SMALL'
          ORDER BY "id" DESC LIMIT 1`,
      );
      expect(trail[0]?.applied).toBe(true);
      expect(trail[0]?.instantiated).toEqual(['FIN-MGT-04']);
      expect((trail[0]?.retired as string[]).sort()).toEqual([
        'FIN-MGT-02',
        'FIN-MGT-03',
        'GOV-GEN-01',
        'GOV-GOVN-02',
        'GOV-SHART-02',
        'GOV-SHART-03',
      ]);
    });

    it('A4 · SMALL→LARGE: the six LARGE_MEDIUM templates re-instantiate with reason RECLASSIFICATION, and the retired copies REMAIN', async () => {
      const caller = await officerCaller('e7-a4-upgrade');
      const at = new Date();
      const result = await caller.classification.reclassify({
        waqfId: ROUNDTRIP_WAQF,
        to: 'LARGE',
        reason: `E7 A4 exercise: revaluation restored the asset base ${FICTIONAL_MARKER_AR}`,
        at: at.toISOString(),
        atHijri: hijriOf(at),
      });

      const diff = result.taskDiff as Extract<typeof result.taskDiff, { applied: true }>;
      expect(diff.tasksInstantiated.map((task) => task.templateCode).sort()).toEqual([
        'FIN-MGT-02',
        'FIN-MGT-03',
        'GOV-GEN-01',
        'GOV-GOVN-02',
        'GOV-SHART-02',
        'GOV-SHART-03',
      ]);
      expect(diff.tasksRetired.map((task) => task.templateCode)).toEqual(['FIN-MGT-04']);

      const board = await caller.compliance.tasks({ waqfId: ROUNDTRIP_WAQF });
      // History accumulates: 6 retired at A3 + FIN-MGT-04 retired here = 7 retired rows queryable,
      // BESIDE the 6 fresh open copies. "Previously-retired copies remain queryable as history."
      expect(board.tasks.filter((task) => task.status === 'RETIRED')).toHaveLength(7);
      const freshAudit = board.tasks.filter(
        (task) => task.templateCode === 'FIN-MGT-03' && task.status === 'NOT_STARTED',
      );
      expect(freshAudit).toHaveLength(1);
      expect(freshAudit[0]).toMatchObject({
        instantiatedReason: 'RECLASSIFICATION',
        classificationAtInstantiation: 'LARGE',
      });
      // The A3-retired copy of the SAME template sits beside the fresh one.
      expect(
        board.tasks.filter(
          (task) => task.templateCode === 'FIN-MGT-03' && task.status === 'RETIRED',
        ),
      ).toHaveLength(1);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * A5 — no deletion; RETIRED is terminal
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('A5 · a ComplianceTask can never be deleted, and RETIRED never reverses', () => {
    it('DELETE is refused for the app role AND the migrator (ENABLE ALWAYS)', async () => {
      const app = await basePrisma();
      await expect(
        app.$executeRawUnsafe(`DELETE FROM "compliance_task" WHERE "waqfId" = '${ROUNDTRIP_WAQF}'`),
      ).rejects.toThrow(/deletedAt|42501|permission denied/i);

      const owner = await privilegedPrisma();
      await expect(
        owner.$executeRawUnsafe(
          `DELETE FROM "compliance_task" WHERE "waqfId" = '${ROUNDTRIP_WAQF}'`,
        ),
      ).rejects.toThrow(/deletedAt|42501/i);
    });

    it('a NEW retirement without its facts is refused — A3 lives at the transition, not the CHECK', async () => {
      // The CHECK must admit pre-engine RETIRED rows (facts never existed), so the TRIGGER is what
      // makes every engine-era retirement carry its reason. Probed on a live open task.
      const app = await basePrisma();
      await expect(
        app.$executeRawUnsafe(
          `UPDATE "compliance_task" SET "status" = 'RETIRED'
            WHERE "waqfId" = '${ROUNDTRIP_WAQF}' AND "status" = 'NOT_STARTED'`,
        ),
      ).rejects.toThrow(/transition into RETIRED must record/);
    });

    it('un-retiring is refused with the migration-36 terminal rule — history cannot be erased without a DELETE', async () => {
      const app = await basePrisma();
      await expect(
        app.$executeRawUnsafe(
          `UPDATE "compliance_task"
              SET "status" = 'NOT_STARTED', "retiredReason" = NULL, "retiredAt" = NULL
            WHERE "waqfId" = '${ROUNDTRIP_WAQF}' AND "status" = 'RETIRED'`,
        ),
      ).rejects.toThrow(/RETIRED is terminal/);
    });

    it('the frozen instantiation identity refuses a rewrite, NULL included', async () => {
      // ⚠ The rewrite targets a value DIFFERENT from the stored one — this test's first draft
      // wrote `'LARGE'` onto rows instantiated AT `LARGE`, which `IS DISTINCT FROM` correctly
      // reads as no change at all (24 rows "updated", nothing refused, nothing rewritten).
      const app = await basePrisma();
      await expect(
        app.$executeRawUnsafe(
          `UPDATE "compliance_task" SET "classificationAtInstantiation" = 'SMALL'
            WHERE "waqfId" = '${ROUNDTRIP_WAQF}' AND "instantiatedReason" = 'INITIAL_SETUP'`,
        ),
      ).rejects.toThrow(/instantiation identity/);
      // And the NULL-included arm, on a pre-engine fixture row.
      await expect(
        app.$executeRawUnsafe(
          `UPDATE "compliance_task"
              SET "classificationAtInstantiation" = 'MEDIUM', "instantiatedReason" = 'INITIAL_SETUP'
            WHERE "id" = 'task-001'`,
        ),
      ).rejects.toThrow(/fabricates provenance|instantiation identity/);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * A6 — direct-utilization: exclude_direct omitted; FIN-MGT-04 only-if income; upkeep applies
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('A6 · the DIRECT_UTILIZATION contrast, measured on two endowments', () => {
    it('moneyless: distribution templates omitted, NO simplified statement, asset upkeep still applies', async () => {
      const caller = await officerCaller('e7-a6-dry');
      const result = await caller.compliance.instantiateRegister({
        waqfId: DIRECT_MONEYLESS_WAQF,
      });
      expect(result.hasIncome).toBe(false);

      const codes = result.instantiated.map((task) => task.templateCode);
      const expected = expectedInstantiation('SMALL', false, true);
      expect([...codes].sort()).toEqual(expected.instantiate);
      // 18 at 2026-08-20.1; 19 at 2026-08-26.1 — FIN-MGT-05 (gate `all`, the framework's own
      // unqualified bullet) applies to a moneyless direct-use waqf too: a statement of financial
      // POSITION exists without income. ⚠ Engineering's transcription of an unqualified bullet,
      // declared — the income-conditional cell stays FIN-MGT-04's alone.
      expect(result.instantiated).toHaveLength(19);

      // exclude_direct: a direct-use waqf has NO monetary distribution duties.
      expect(codes).not.toContain('FIN-DIST-01');
      expect(result.skippedEventTemplates).not.toContain('FIN-DIST-02'); // excluded, not merely event-skipped
      // §09's cell: the simplified statement binds Direct-utilization ONLY with income.
      expect(codes).not.toContain('FIN-MGT-04');
      // …and asset upkeep (GOV-PROT-01) still applies — A6's third arm.
      expect(codes).toContain('GOV-PROT-01');
    });

    it('with ONE recorded income receipt: FIN-MGT-04 instantiates — the only-if, as a measured contrast', async () => {
      const caller = await officerCaller('e7-a6-wet');
      const result = await caller.compliance.instantiateRegister({ waqfId: DIRECT_INCOME_WAQF });
      expect(result.hasIncome).toBe(true);

      const codes = result.instantiated.map((task) => task.templateCode);
      const expected = expectedInstantiation('SMALL', true, true);
      expect([...codes].sort()).toEqual(expected.instantiate);
      // 23 at 2026-08-20.1; 24 at 2026-08-26.1 (FIN-MGT-05 joins; the A6 contrast — FIN-MGT-04
      // present here, absent dry — is untouched by the bump).
      expect(result.instantiated).toHaveLength(24);

      expect(codes).toContain('FIN-MGT-04');
      // Still no distribution duty — income does not turn a direct-use waqf into a distributing one.
      expect(codes).not.toContain('FIN-DIST-01');
    });
  });
});
