/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E6/S7 · V-1 (release gate G-9) AND V-7 (release gate G-1), ON THE REAL PROCEDURES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   V-1  A full ORDERED run on `waqf-001`: the corpus wall bites on that endowment's OWN ledger,
 *        the ṣiyāna reserve comes off FIRST, and the whole lifecycle
 *        (preview → create → submit → approval.approve → execute) posts three line items — one
 *        PAID, one EXCLUDED, one WITHHELD — with the closing identity asserted as an identity.
 *
 *   V-7  The material actions write audit rows; every row recomputes from the content the database
 *        holds; the chain verifies from genesis; and a privileged raw `UPDATE`/`DELETE` on
 *        `audit_event` is refused BY THE DATABASE.
 *
 * ── ⚠ THE CORPUS PROOF IS ON `waqf-001`'s OWN RUN, AND `rev-005` IS WHY ─────────────────────────
 * The task brief for this sprint originally proposed proving the wall with `rev-004`, which belongs
 * to `waqf-003`: on a `waqf-001` run that row is dropped by the `waqfId` filter before `receiptClass`
 * is ever consulted, so its exclusion would prove nothing about the corpus guard. `rev-005` (S7-2)
 * exists to close that: CAPITAL / `ISTIBDAL_PROCEEDS`, 4,200,000.00 SAR, dated 2026-02-17, on
 * `waqf-001`, in the run's period, against the SAME asset (`asset-002`) as `rev-001`'s rent and paid
 * into the SAME dedicated account. Every other discriminator is held equal, so **only its class can
 * explain its exclusion** — and the assertions below check that it is PRESENT in the receipts the
 * engine saw, ABSENT from every figure below revenue, and NAMED in the run's own output.
 *
 * ── ⚠ THERE ARE NOW **THREE** WINDOWS IN THIS FILE, AND THE SPLIT IS THE POINT (AV7-F2) ────────
 * `PERIOD` previews (a query — persists nothing, and where the `rev-005` corpus proof lives),
 * `SEEDED_PERIOD` proves the unique index refuses `dist-001`'s exact triple, and
 * `LIFECYCLE_PERIOD` is an ALLOCATED, disjoint window — the only one that reaches `EXECUTED`.
 * Before migration 26 all of this was one window inside an already-paid quarter, and 11 tests here
 * went red when the constraint landed. Each constant carries its own note below.
 *
 * ── ⚠ THE PREVIEW PERIOD IS `2026-01-02 … 2026-03-31`, NOT `2026-01-01 … 2026-03-31`, AS MEASURED ─
 * The seeded historical run `dist-001` occupies `waqf-001` / `2026-01-01` → `2026-03-31`, is
 * `EXECUTED` (terminal) and is not soft-deleted — and migration 21's partial unique index
 * `distribution_one_live_run_per_period` covers
 * `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'`. So a
 * second live run for that exact window is REFUSED BY THE DATABASE. That refusal is asserted below as
 * a property in its own right rather than worked around silently; the run this file exercises starts
 * one day later, and nothing is dated 2026-01-01 on `waqf-001`, so the ledger window's CONTENTS are
 * identical (`exp-e-001` 02-10, `rev-005` 02-17, `rev-001` 03-31; `exp-e-002` is 2026-04-01 and is
 * outside on either reading).
 *
 * ── ⚠ THE SEEDED `accountant@example.test` SEAT CANNOT COMPLETE THIS LIFECYCLE ──────────────────
 * MEASURED from `waqf_access_grant`: `user-accountant-001`'s FINANCE grant holds exactly
 * `finance:transaction:read`, `finance:transaction:write`, `distribution:run:read`,
 * `distribution:run:initiate`, `approval:request:read`, `approval:request:initiate` — and therefore
 * NEITHER `distribution:run:write` (which `create` demands) NOR `distribution:line_item:write` (which
 * `execute` demands). The seat is asserted as it is, and the lifecycle is driven by provisioned
 * subjects holding the `finance` preset's distribution verbs. That gap is a finding about the SEED,
 * not about the router, and it is recorded here rather than papered over by widening a procedure.
 *
 * ── ⚠ WHAT IS NOT PINNED, AND WHY ──────────────────────────────────────────────────────────────
 * No `rowHash` literal appears anywhere in this file. The seeded chain is NOT byte-reproducible
 * across two seeds of an identical fixture: `after.createdAt` / `after.updatedAt` are WALL-CLOCK and
 * sit inside the hashed payload (measured in `@qmulate/database`'s seed suite, which records two
 * different chain heads for one fixture). Pinning a hash here would produce a test that is green on
 * one database and red on the next for a reason that has nothing to do with the run. What IS pinned
 * is IMMUTABILITY and LINKAGE — each row recomputes from its own stored content, the chain joins from
 * genesis, and the database refuses to let either be edited.
 *
 * ── HARNESS FACTS THIS FILE DEPENDS ON ────────────────────────────────────────────────────────
 * Integration mode is `vitest run --mode integration`, `singleFork`, `fileParallelism: false`,
 * `TZ=UTC`, and the database is SHARED with `@qmulate/database`'s suite — which asserts ABSOLUTE row
 * counts (`Distribution: 1`, `DistributionLineItem: 2`). So every run and line item this file creates
 * is HARD-DELETED in `afterAll`, with the two retention guards suspended for exactly those
 * prefix-scoped statements. Soft-deleting is not sufficient and it is not a matter of taste: the
 * sibling suite's count queries do not filter `deletedAt`, and the finance suite already learned this
 * the expensive way (six assertions red on the SECOND consecutive database pass).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  bookIncome,
  paidPeriod,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
  warnNoDatabase,
  type TestSubjectSpec,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('the distribution run suite (E6/S7 exit clauses, release gates G-9 and G-1)');

const createCaller = createCallerFactory(appRouter);

const WAQF = 'waqf-001';

/**
 * ⚠ ONE FIXED INSTANT FOR THE WHOLE SUITE.
 *
 * `asOf` is derived from it (in `Asia/Riyadh`, which is S7-3's recorded reading of "which calendar day
 * is a Saudi trustee late on"), and `asOf` decides `daysUntilDeadline` and therefore whether the run
 * reports the Nazir as late. A wall-clock read would make `timing` unassertable and would put a
 * moving value inside the digest. It is also the TOTP assertion instant, so the step-up window is
 * satisfied by construction rather than by the developer's luck.
 */
const NOW = new Date('2026-08-18T09:00:00.000Z');

/**
 * The PREVIEW window. See the header: 01-02, not 01-01, because `dist-001` holds the 01-01 window.
 *
 * ⚠ IT DELIBERATELY STILL OVERLAPS `dist-001`'s ALREADY-PAID QUARTER, and it must. `preview` is a
 * QUERY — the test at `is a QUERY and writes nothing` proves no `distribution` row appears — so
 * migration 26's period-overlap constraint, whose predicate is `status = 'EXECUTED'`, never sees it.
 * And this window is where V-1's CORPUS PROOF lives: `rev-005` is dated 2026-02-17, so only a window
 * containing Q1-2026 can show a SEEDED capital receipt held out by its CLASS on this endowment. A
 * fresh window would have replaced that proof with one about a receipt the test booked itself, which
 * is a strictly weaker statement about the fixture. So the preview window did NOT move.
 */
const PERIOD = { periodStart: '2026-01-02', periodEnd: '2026-03-31' } as const;
/** The window `dist-001` already occupies — used to prove the index, never to write. */
const SEEDED_PERIOD = { periodStart: '2026-01-01', periodEnd: '2026-03-31' } as const;
/**
 * ⚠ THE WINDOW THE LIFECYCLE ACTUALLY PAYS FOR — ALLOCATED, AND SEPARATE FROM {@link PERIOD}
 * (AV7-F2, migration 26).
 *
 * `create → submit → approve → execute` produces an `EXECUTED` row, and an `EXECUTED` row inside
 * `dist-001`'s quarter is *the same ghallah distributed twice* — SAR 820,000.00 recorded as owed
 * against SAR 410,000.00. MEASURED: this file went **11 of its tests red** the moment
 * `distribution_paid_periods_disjoint` landed, every failure a `23P01` naming the constraint and
 * `dist-001`'s range, and every one a TRUE POSITIVE. `rev-001` (SAR 350,000.00) is the ONLY income
 * receipt `waqf-001` has in the whole fixture, and `dist-001` had already paid it.
 *
 * ⚠ THE FIGURES DID NOT MOVE, WHICH IS WHY THIS SPLIT IS SAFE. `bookIncome` puts SAR 350,000.00
 * inside this window through `finance.recordRevenue`, and on `waqf-001` the maintenance reserve is a
 * deed-stipulated flat SAR 40,000.00 with a Nazir fee of 10% of revenue, while
 * `resolveOperatingCost()` counts `OPERATIONS` expenses only. So 350,000 − 40,000 − 0 − 35,000 =
 * **275,000.00** and three lines — byte-identical to what the seeded quarter produced. Not one
 * expected figure below was rewritten to fit the new window; `grossRevenueSar` is still `350000`
 * and `distributableSar` still `275000`.
 */
const LIFECYCLE_PERIOD = paidPeriod('distribution-run', 1);

const RUN_MAKER = `${API_TEST_PREFIX}dist-run-maker`;
/**
 * The seeded INTAKE endowment, whose مآل الوقف clause has never been read
 * (`reversionClauseCaptured: false`). It is the one seeded row that exercises the REFUSAL half of
 * `preview`'s `{computed} | {refused}` union against real data.
 */
const INTAKE_WAQF = 'waqf-005';
const RUN_CHECKER = `${API_TEST_PREFIX}dist-run-checker`;

/**
 * The `finance` preset's distribution verbs, spelled out.
 *
 * ⚠ `waqf_access_grant_permission_guard` refuses `approve`/`sign` on any role but NAZIR, so a FINANCE
 * seat cannot be widened into an approver even by a provisioning write — which is the structural half
 * of maker ≠ checker and the reason the checker below is a second, NAZIR subject.
 */
const FINANCE_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
  'distribution:run:read',
  'distribution:run:write',
  'distribution:run:initiate',
  'distribution:line_item:read',
  'distribution:line_item:write',
  'approval:request:read',
  'approval:request:initiate',
];

const NAZIR_PERMISSIONS = [
  'distribution:run:read',
  'distribution:line_item:read',
  'approval:request:read',
  'approval:request:approve',
];

function subjects(): TestSubjectSpec[] {
  return [
    // ⚠ TWO endowments for the maker: `waqf-001` for the computing run, `waqf-005` for the refusal.
    {
      id: RUN_MAKER,
      role: 'FINANCE',
      waqfIds: [WAQF, INTAKE_WAQF],
      permissions: FINANCE_PERMISSIONS,
    },
    { id: RUN_CHECKER, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
  ];
}

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId, now: NOW }));

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.runIf(hasDatabase)('distribution · the run lifecycle (G-9, G-1)', () => {
  /** Filled by the lifecycle test and read by the audit assertions that follow it. */
  let posted: {
    distributionId: string;
    approvalRequestId: string;
    makerId: string;
    checkerId: string | null;
    engineVersion: string | null;
    runDigest: string | null;
    lineItemIds: readonly string[];
  } | null = null;

  /** Audit deltas captured in-test, never absolutes — the database is shared. */
  const before = { approve: 0, distributionPost: 0 };

  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());
  });

  afterAll(async () => {
    // ⚠ HARD DELETE, IN TEARDOWN ONLY, AS THE MIGRATOR, AND IT NEEDS THIS PARAGRAPH.
    //
    // `distribution` and `distribution_line_item` both carry a retention DELETE guard
    // (`qmulate_retention_reject_delete` / `qmulate_distribution_line_reject_delete`), which refuses
    // DELETE for EVERY role including the migrator — a run and its lines are evidence of a payment
    // and carry a >= 10-year retention obligation (NFR-07 / BR-702). Soft-deleting instead was
    // considered and is NOT sufficient: `@qmulate/database`'s `seed.integration.test.ts` pins
    // ABSOLUTE counts (`Distribution: 1`, `DistributionLineItem: 2`) and its queries do not filter
    // `deletedAt`, so a soft-deleted run of this suite's turns that suite red on the SECOND
    // consecutive pass over one cluster. The guards are therefore suspended for exactly these two
    // prefix-scoped statements and restored `ENABLE ALWAYS` inside the SAME atomic `DO` block — one
    // block is one statement is one transaction, so a raise rolls the DISABLE back with it.
    //
    // Line items first: `distribution_line_item` carries two composite FKs to `distribution`.
    // Neither statement can reach a fixture row: both are scoped to `createdBy LIKE
    // 'user-test-api-%'`, and the seed attributes its rows to `user-seed-admin`.
    const prisma = await privilegedPrisma();
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "distribution_line_item" DISABLE TRIGGER distribution_line_item_no_delete;
        DELETE FROM "distribution_line_item" WHERE "createdBy" LIKE 'user-test-api-%';
        ALTER TABLE "distribution_line_item" ENABLE ALWAYS TRIGGER distribution_line_item_no_delete;
        ALTER TABLE "distribution" DISABLE TRIGGER distribution_no_delete;
        DELETE FROM "distribution" WHERE "createdBy" LIKE 'user-test-api-%';
        ALTER TABLE "distribution" ENABLE ALWAYS TRIGGER distribution_no_delete;
      END
      $$;
    `);
    // `cleanupApiTestRows()` purges the grants, the users and every `approval_request` this suite's
    // subjects raised. `audit_event` rows are deliberately left: an append-only trail you can tidy up
    // is not append-only.
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 0 · The premises, asserted rather than assumed
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('the premises this suite rests on', () => {
    it('waqf-001 is the ORDERED / ZUHUR_ONLY family endowment with a COMPLETE Shart', async () => {
      // If any of this drifts, every expected figure below becomes a coincidence.
      const prisma = await basePrisma();
      const waqf = await prisma.waqf.findUniqueOrThrow({
        where: { id: WAQF },
        select: {
          type: true,
          classification: true,
          entitlementOrder: true,
          continuationStipulation: true,
          fiscalYearEnd: true,
          reversionClauseCaptured: true,
          reversionKind: true,
        },
      });
      expect(waqf.type).toBe('FAMILY_DHURRI');
      expect(waqf.classification).toBe('MEDIUM');
      expect(waqf.entitlementOrder).toBe('ORDERED');
      expect(waqf.continuationStipulation).toBe('ZUHUR_ONLY');
      expect(waqf.fiscalYearEnd).toBe('12-31');
      expect(waqf.reversionClauseCaptured).toBe(true);
      // No مآل الوقف is recorded on any fixture deed, and `null` here means the deed positively
      // records none — never "unknown".
      expect(waqf.reversionKind).toBeNull();
    });

    it('⚠ rev-005 is the CAPITAL receipt that makes the corpus wall provable ON THIS ENDOWMENT', async () => {
      const prisma = await basePrisma();
      const capital = await prisma.transaction.findUniqueOrThrow({
        where: { id: 'rev-005' },
        select: {
          waqfId: true,
          type: true,
          receiptClass: true,
          capitalSource: true,
          amountSar: true,
          date: true,
          assetId: true,
        },
      });
      expect(capital.waqfId).toBe(WAQF);
      expect(capital.type).toBe('REVENUE');
      expect(capital.receiptClass).toBe('CAPITAL');
      expect(capital.capitalSource).toBe('ISTIBDAL_PROCEEDS');
      expect(capital.amountSar.toString()).toBe('4200000');
      expect(capital.date.toISOString()).toBe('2026-02-17T00:00:00.000Z');

      // THE CONTROL THAT MAKES THE EXCLUSION MEAN SOMETHING: the income receipt it is compared
      // against is on the SAME asset, in the SAME period, on the same endowment. Only the class
      // differs, so only the class can explain the different treatment.
      const income = await prisma.transaction.findUniqueOrThrow({
        where: { id: 'rev-001' },
        select: { waqfId: true, receiptClass: true, assetId: true, amountSar: true },
      });
      expect(income.waqfId).toBe(capital.waqfId);
      expect(income.assetId).toBe(capital.assetId);
      expect(income.receiptClass).toBe('INCOME');
      expect(income.amountSar.toString()).toBe('350000');
    });

    it('⚠ the seeded accountant seat cannot complete this lifecycle — measured, not assumed', async () => {
      // A finding about the SEED. `create` demands `distribution:run:write` and `execute` demands
      // `distribution:line_item:write`; the seeded FINANCE grant holds neither, so the lifecycle
      // below is driven by provisioned subjects. Asserted so that widening the seed later is a
      // deliberate act rather than an accident that quietly changes what this file proves.
      const prisma = await basePrisma();
      const grant = await prisma.waqfAccessGrant.findFirstOrThrow({
        where: { userId: 'user-accountant-001', waqfId: WAQF, role: 'FINANCE' },
        select: { permissions: true },
      });
      expect(grant.permissions).toContain('distribution:run:initiate');
      expect(grant.permissions).not.toContain('distribution:run:write');
      expect(grant.permissions).not.toContain('distribution:line_item:write');
    });

    it('both provisioned seats hold exactly one grant each on this endowment', async () => {
      const makerCtx = await contextFor({
        userId: RUN_MAKER,
        requestId: 'g9-premise-maker',
        now: NOW,
      });
      const checkerCtx = await contextFor({
        userId: RUN_CHECKER,
        requestId: 'g9-premise-checker',
        now: NOW,
      });
      expect(
        makerCtx.grants
          .filter((grant: { waqfId: string }) => grant.waqfId === WAQF)
          .map((grant: { role: string }) => grant.role),
      ).toEqual(['FINANCE']);
      expect(
        checkerCtx.grants
          .filter((grant: { waqfId: string }) => grant.waqfId === WAQF)
          .map((grant: { role: string }) => grant.role),
      ).toEqual(['NAZIR']);
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 1 · V-1 · preview — the waterfall, the corpus wall, and the lines
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('V-1 · preview computes waqf-001 Q1-2026 and holds the corpus out VISIBLY', () => {
    it('the whole run, figure by figure', async () => {
      const caller = await callerFor(RUN_MAKER, 'g9-preview');
      const answer = await caller.distribution.preview({ waqfId: WAQF, ...PERIOD });

      // A refusal here would carry a named discriminator; assert the branch before reading it, so a
      // refused run cannot be silently read as an empty computed one.
      expect(answer.status).toBe('computed');
      if (answer.status !== 'computed') throw new Error('unreachable — narrowing for TypeScript');
      const run = answer.run;

      // ── THE WATERFALL, ṢIYĀNA FIRST ─────────────────────────────────────────────────────
      expect(run.waterfall).toEqual({
        revenueSar: '350000.00',
        // ⚠ CORPUS. Present, named, and in NO figure below this line.
        capitalReceiptsSar: '4200000.00',
        maintenanceReserveSar: '40000.00',
        operatingSar: '0.00',
        netIncomeSar: '310000.00',
        nazirFeeSar: '35000.00',
        nazirFeeBasis: 'PERCENT_OF_REVENUE',
        distributableSar: '275000.00',
      });

      // ── THE CORPUS WALL, THREE WAYS ─────────────────────────────────────────────────────
      // 1. the capital receipt reached the engine (it is named in the run's own output);
      expect(run.excludedCapitalReceipts).toEqual([
        {
          transactionId: 'rev-005',
          receiptClass: 'CAPITAL',
          capitalSource: 'ISTIBDAL_PROCEEDS',
          amountSar: '4200000.00',
        },
      ]);
      // 2. the engine raised the flag that says so — keyed on PRESENCE, not on a positive amount;
      expect(run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
      // 3. and the trace step names the excluded id, which is what a statement is derived from.
      const capitalStep = run.computationTrace.find(
        (entry) => entry.stage === 'WATERFALL' && entry.code === 'CAPITAL_RECEIPTS_EXCLUDED',
      );
      expect(capitalStep?.data?.['receiptIds']).toBe('rev-005');
      expect(capitalStep?.data?.['capitalReceiptsMinor']).toBe('4200000.00');
      // And the negative half: 4,200,000 appears in NO figure the family could be paid from.
      expect(run.waterfall.revenueSar).not.toBe('4550000.00');
      expect(run.totals.entitledSar).toBe('275000.00');

      // ── THE ORDER OF THE WATERFALL, FROM THE TRACE'S OWN `seq`, not from the totals ──────
      // The totals are consistent with several orders; the trace is what says ṣiyāna came first.
      expect(
        run.computationTrace
          .filter((entry) => entry.stage === 'WATERFALL')
          .sort((a, b) => a.seq - b.seq)
          .map((entry) => entry.code),
      ).toEqual([
        'REVENUE_CLASSIFIED',
        'CAPITAL_RECEIPTS_EXCLUDED',
        'MAINTENANCE_RESERVE',
        'OPERATING_COST',
        'NET_INCOME',
        'NAZIR_FEE',
        'DISTRIBUTABLE',
      ]);
      const reserveStep = run.computationTrace.find(
        (entry) => entry.code === 'MAINTENANCE_RESERVE',
      );
      expect(reserveStep?.data?.['step']).toBe('1');
      expect(reserveStep?.data?.['reserveAuthority']).toBe('SHART_AL_WAQIF');
      expect(run.computationTrace.find((entry) => entry.code === 'NAZIR_FEE')?.data?.['step']).toBe(
        '3',
      );

      // ── THE LINES ───────────────────────────────────────────────────────────────────────
      expect(run.entitlementRule).toBe('ORDERED_LOWEST_LIVING_TABAQA');
      expect(run.lines.map((line) => line.beneficiaryId)).toEqual([
        'ben-001',
        'ben-002',
        'ben-003',
      ]);
      expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledSar])).toEqual([
        ['ben-001', 'PAID', '137500.00'],
        // ⚠ ṭabaqa 2 while ṭabaqa 1 is alive, on an ORDERED deed.
        ['ben-002', 'EXCLUDED', '0.00'],
        // ⚠ `kycLastRefreshed` is NULL, so the gate is KYC_UNVERIFIED and never STALE_KYC — and the
        // entitlement is UNCHANGED by the gate (I6). A withheld share is never reallocated.
        ['ben-003', 'WITHHELD', '137500.00'],
      ]);
      expect(run.lines.map((line) => line.sharePercent)).toEqual([
        // SIX decimals, which is why migration 21 widened the column from (9,4).
        '50.000000',
        '0.000000',
        '50.000000',
      ]);
      expect(run.lines.map((line) => line.reasonCode)).toEqual([
        null,
        'UPPER_TABAQA_EXTANT',
        'KYC_UNVERIFIED',
      ]);
      expect(run.lines.map((line) => line.gateFlags)).toEqual([[], [], ['KYC_UNVERIFIED']]);
      // No column carries a target account reference, so a PAID line has none (BR-501, owed).
      expect(run.lines.every((line) => line.bankingRefForProceeds === null)).toBe(true);
      expect(run.lines.every((line) => line.basis.rule === 'ORDERED_LOWEST_LIVING_TABAQA')).toBe(
        true,
      );
      // ⚠ MEASURED, AND IT CONTRADICTS THE SPRINT BRIEF'S EXPECTATION. The brief expected
      // `basis.continuationStipulation === 'ZUHUR_ONLY'` on every line. On an ORDERED deed the
      // continuation term is NOT APPLIED — the engine says so with its own flag — so the basis
      // carries `null` and the flag is raised. The deed's term is still recorded on the waqf row
      // (asserted in the premises above); what is asserted here is what the ENGINE did with it.
      expect(run.lines.every((line) => line.basis.continuationStipulation === null)).toBe(true);
      expect(run.flags).toContain('CONTINUATION_STIPULATION_NOT_APPLIED');

      // ── TOTALS, AND THE CLOSING IDENTITY AS AN IDENTITY ─────────────────────────────────
      expect(run.totals).toEqual({
        paidSar: '137500.00',
        withheldSar: '137500.00',
        crossBorderSar: '0.00',
        retainedSar: '0.00',
        entitledSar: '275000.00',
        excludedCount: 1,
        entitledLineCount: 2,
        residualSar: '0.00',
      });
      // I1 / I-C1 as arithmetic over the halala integers, not as a restatement of the totals:
      // reserve + operating + fee + paid + withheld + crossBorder + retained === gross revenue.
      const halalas = (decimal: string): bigint => BigInt(decimal.replace('.', ''));
      expect(
        halalas(run.waterfall.maintenanceReserveSar) +
          halalas(run.waterfall.operatingSar) +
          halalas(run.waterfall.nazirFeeSar) +
          halalas(run.totals.paidSar) +
          halalas(run.totals.withheldSar) +
          halalas(run.totals.crossBorderSar) +
          halalas(run.totals.retainedSar),
      ).toBe(halalas(run.waterfall.revenueSar));
      // And the corpus is NOT in that identity — the wall, stated as an equation.
      expect(halalas(run.waterfall.capitalReceiptsSar)).toBe(420_000_000n);

      // ── WHAT THE ENGINE CHECKED, AND WHICH BUILD ────────────────────────────────────────
      expect(run.invariantsChecked).toEqual([
        'I1',
        'I2',
        'I3',
        'I4',
        'I5',
        'I6',
        'I7',
        'I9',
        'I-C1',
      ]);
      expect(run.engineVersion).toBe('e6-distribution/4.0.0');
      expect(run.runDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(run.authorityNotices).toEqual([]);

      // ── TIMING · with EARLIER_OF the HIJRI deadline binds, one day earlier ───────────────
      expect(run.timing.deadlineGregorian).toBe('2027-03-31');
      expect(run.timing.deadlineHijri).toBe('1448-10-22');
      expect(run.timing.hijriDeadlineAsGregorian).toBe('2027-03-30');
      expect(run.timing.bindingCalendar).toBe('EARLIER_OF');
      expect(run.timing.boundBy).toBe('HIJRI');
      expect(run.timing.bindingDeadlineGregorian).toBe('2027-03-30');
      expect(run.timing.status).toBe('ON_TIME');
      expect(run.timing.asOf.gregorian).toBe('2026-08-18');
      expect(run.timing.settingKey).toBe('deadline.DISTRIBUTE_3M_FYE.months');
      expect(run.timing.months).toBe(3);

      // ── ⚠ EVERY FIGURE IS UNVERIFIED, AND THE RUN SAYS SO (binding rule 3) ──────────────
      expect(run.flags).toContain('UNVERIFIED_FIGURES_APPLIED');
      expect(run.unverifiedNotes).toEqual(['⚠ unverified — confirm vs primary law']);
      expect(run.timing.unverifiedNote).toBe('⚠ unverified — confirm vs primary law');

      // ── THE MAPPING'S OWN OBSERVATIONS, WHICH THE ENGINE CANNOT SEE ─────────────────────
      const diagnostics = new Map(run.diagnostics.map((d) => [d.code, d]));
      // Q-S7-1: waqf-001 carries BOTH a deed-stipulated fixed reserve AND a recorded Nazir
      // discretionary percentage. The deed wins (it is a founder's condition), and the conflict is
      // REPORTED rather than dropped — which is the whole reason the mapper returns diagnostics.
      expect(
        diagnostics.get('MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION')?.severity,
      ).toBe('CONFLICT');
      expect(diagnostics.has('CAPITAL_RECEIPTS_PASSED_TO_ENGINE')).toBe(true);
      // MAINTENANCE actuals are NOT folded into the reserve: the reserve comes from the deed's rule,
      // and `exp-e-001` (40,000.00 MAINTENANCE, in period) is excluded from operating cost.
      expect(diagnostics.get('OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED')?.detail).toMatchObject({
        expenseCategory: 'MAINTENANCE',
        excludedTotalSar: '40000.00',
      });
    });

    it('⚠ THE REFUSAL HALF · an unread مآل clause comes back as DATA, with its DISCRIMINATOR', async () => {
      // THE PROPERTY THIS STAGE EXISTS TO GET RIGHT. `src/trpc.ts`'s `errorFormatter` threads only
      // `code` and `messageKey`, and TWENTY-SIX of the engine's refusals share the code
      // `SHART_INCOMPLETE` — so a thrown refusal reaches a screen as one code for twenty-six
      // different reasons, and the only way left to tell them apart would be to parse an English
      // message. `preview` therefore returns the NAMED refusal as data.
      //
      // `waqf-005` is the seeded intake endowment whose مآل الوقف clause has never been read. That
      // state has NO engine discriminator at all — the engine's `reversion` is `clause | null` and
      // `null` means "the deed positively records none" — so it must be refused at the MAPPING
      // boundary, and the assertion is on the mapper's own name, not on a bare throw.
      const prisma = await basePrisma();
      expect(
        (
          await prisma.waqf.findUniqueOrThrow({
            where: { id: INTAKE_WAQF },
            select: { reversionClauseCaptured: true },
          })
        ).reversionClauseCaptured,
        'waqf-005 must still be the unread-clause row, or this test proves nothing',
      ).toBe(false);

      const answer = await (
        await callerFor(RUN_MAKER, 'g9-refusal')
      ).distribution.preview({ waqfId: INTAKE_WAQF, ...PERIOD });

      expect(answer.status).toBe('refused');
      if (answer.status !== 'refused') throw new Error('unreachable — narrowing for TypeScript');
      // The ONE user-facing sentence's key, as the error itself declared it — written in exactly one
      // place in the repository, and read here rather than reconstructed.
      expect(answer.messageKey).toBe('errors.domain.SHART_INCOMPLETE');
      expect(answer.code).toBe('SHART_INCOMPLETE');
      // ⚠ AND THE DISCRIMINATOR, WHICH IS THE WHOLE POINT. This is the field an error shape cannot
      // carry, and without it a screen could only say "the conditions are incomplete".
      expect(answer.refusal).toBe('REVERSION_CLAUSE_UNREAD');
      expect(answer.refusalSource).toBe('mapper');
      expect(answer.details).toMatchObject({ waqfId: INTAKE_WAQF });
      expect(answer.waqfId).toBe(INTAKE_WAQF);
    });

    it('…and the MUTATION on the same endowment THROWS instead of returning data', async () => {
      // The other half of the split: a write that refuses must never look like a write that
      // succeeded. `preview` answers with data; `create` raises, and the domain code and key travel
      // on the error shape exactly as `toTRPCError` routes them.
      let thrown: unknown;
      try {
        await (
          await callerFor(RUN_MAKER, 'g9-refusal-create')
        ).distribution.create({ waqfId: INTAKE_WAQF, ...PERIOD });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, 'create must not resolve on an endowment the mapping refuses').toBeDefined();
      expect((thrown as { cause?: { code?: string } }).cause?.code).toBe('SHART_INCOMPLETE');
      expect((thrown as { cause?: { messageKey?: string } }).cause?.messageKey).toBe(
        'errors.domain.SHART_INCOMPLETE',
      );
      const prisma = await basePrisma();
      expect(
        await prisma.distribution.count({ where: { waqfId: INTAKE_WAQF, deletedAt: null } }),
      ).toBe(0);
    });

    it('is a QUERY and writes nothing — no run row appears', async () => {
      // The half that makes `preview` a preview. Without it, "it computed" would be satisfied by a
      // procedure that also persisted.
      const prisma = await basePrisma();
      const rows = await prisma.distribution.count({ where: { waqfId: WAQF, deletedAt: null } });
      const caller = await callerFor(RUN_MAKER, 'g9-preview-readonly');
      await caller.distribution.preview({ waqfId: WAQF, ...PERIOD });
      expect(await prisma.distribution.count({ where: { waqfId: WAQF, deletedAt: null } })).toBe(
        rows,
      );
    });

    it('two computations of the same period produce the SAME digest', async () => {
      // Reproducibility is the property that makes a digest worth signing. `asOf` is fixed by NOW, so
      // the only way these could differ is a non-deterministic ordering inside the run.
      const first = await (
        await callerFor(RUN_MAKER, 'g9-repro-1')
      ).distribution.preview({
        waqfId: WAQF,
        ...PERIOD,
      });
      const second = await (
        await callerFor(RUN_MAKER, 'g9-repro-2')
      ).distribution.preview({
        waqfId: WAQF,
        ...PERIOD,
      });
      if (first.status !== 'computed' || second.status !== 'computed') {
        throw new Error('both previews must compute');
      }
      expect(second.run.runDigest).toBe(first.run.runDigest);
      // And the version is INSIDE those bytes, not merely beside them: it appears in the result and
      // in the INPUT trace step, so a version bump changes the digest.
      expect(
        first.run.computationTrace.find((entry) => entry.stage === 'INPUT')?.data?.[
          'engineVersion'
        ],
      ).toBe('e6-distribution/4.0.0');
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 2 · V-1 · the lifecycle
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('V-1 · create → submit → approval.approve → execute', () => {
    beforeAll(async () => {
      // {@link LIFECYCLE_PERIOD} is allocated, so it starts EMPTY — it cannot inherit `rev-001`.
      // The pool is booked through the real procedure, and `bookIncome` refuses if the window holds
      // anything but the row it just booked, so the 275,000.00 asserted below cannot drift by a row
      // some other suite left behind.
      await bookIncome({ waqfId: WAQF, period: LIFECYCLE_PERIOD, tag: 'g9-lifecycle' });
    });

    it('⚠ a second live run for the SEEDED period is refused by the database', async () => {
      // Migration 21's partial unique index, exercised through the router. `dist-001` is EXECUTED and
      // not soft-deleted, so its window is taken. This is asserted BEFORE the happy path so a
      // failure here cannot be mistaken for the happy path's.
      const caller = await callerFor(RUN_MAKER, 'g9-period-collision');
      await expect(
        caller.distribution.create({ waqfId: WAQF, ...SEEDED_PERIOD }),
      ).rejects.toThrow();
      const prisma = await basePrisma();
      // Nothing was written and rolled forward: the seeded run is still the only one for that window.
      expect(
        await prisma.distribution.count({
          where: {
            waqfId: WAQF,
            periodStart: new Date('2026-01-01T00:00:00.000Z'),
            periodEnd: new Date('2026-03-31T00:00:00.000Z'),
            deletedAt: null,
          },
        }),
      ).toBe(1);
    });

    it('posts three line items only after a genuine second authority', async () => {
      const created = await (
        await callerFor(RUN_MAKER, 'g9-create')
      ).distribution.create({
        waqfId: WAQF,
        ...LIFECYCLE_PERIOD,
      });
      expect(created.status).toBe('COMPUTED');
      // ⚠ No line items yet. A computed run is not a paid one.
      expect(created.lineItemsWritten).toBe(false);
      expect(created.run.waterfall.distributableSar).toBe('275000.00');

      const prisma = await basePrisma();
      const stored = await prisma.distribution.findUniqueOrThrow({
        where: { id: created.distributionId },
        select: {
          waqfId: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          periodStartHijri: true,
          periodEndHijri: true,
          grossRevenueSar: true,
          reserveSar: true,
          operatingSar: true,
          nazirFeeSar: true,
          distributableSar: true,
          engineVersion: true,
          runDigest: true,
          approvalRequestId: true,
          createdBy: true,
        },
      });
      // The five money columns, and the two migration 21 added.
      expect(stored.waqfId).toBe(WAQF);
      expect(stored.status).toBe('COMPUTED');
      expect(stored.grossRevenueSar.toString()).toBe('350000');
      expect(stored.reserveSar.toString()).toBe('40000');
      expect(stored.operatingSar.toString()).toBe('0');
      expect(stored.nazirFeeSar.toString()).toBe('35000');
      expect(stored.distributableSar.toString()).toBe('275000');
      expect(stored.engineVersion).toBe('e6-distribution/4.0.0');
      expect(stored.runDigest).toBe(created.run.runDigest);
      expect(stored.approvalRequestId).toBeNull();
      expect(stored.createdBy).toBe(RUN_MAKER);
      // The dual date is FROZEN at write time, both halves, never recomputed downstream.
      // ⚠ THESE FOUR MOVED WITH {@link LIFECYCLE_PERIOD}, AND THE HIJRI PAIR WAS **COMPUTED, NOT
      // INVENTED** — Hijri dates are not arithmetic anybody should do by hand, and a wrong one here
      // would be a wrong dual date on a Nazir's statement. They come from the repo's own
      // `toHijriSnapshot()` (Umm al-Qura), and the reason they can be TRUSTED is that the same call
      // reproduces the pair this test asserted before the window moved:
      //     2026-01-02 -> 1447-07-13   ✓ the old literal
      //     2026-03-31 -> 1447-10-12   ✓ the old literal
      //     2026-05-01 -> 1447-11-14   ← the new one, from the same function
      //     2026-05-07 -> 1447-11-20   ← the new one, from the same function
      // They stay as LITERALS rather than becoming `toHijri(LIFECYCLE_PERIOD.periodStart)`: the
      // property under test is that the dual date is FROZEN AT WRITE TIME and never recomputed on
      // read, and asserting the stored value against a fresh call to the same converter would be
      // satisfied by a column that recomputes — i.e. it would test nothing this test is for.
      expect(stored.periodStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
      expect(stored.periodEnd.toISOString()).toBe('2026-05-07T00:00:00.000Z');
      expect(stored.periodStartHijri).toBe('1447-11-14');
      expect(stored.periodEndHijri).toBe('1447-11-20');

      // ── SUBMIT · mints the DISTRIBUTION_RUN approval ────────────────────────────────────
      const submitted = await (
        await callerFor(RUN_MAKER, 'g9-submit')
      ).distribution.submit({
        waqfId: WAQF,
        distributionId: created.distributionId,
      });
      expect(submitted.status).toBe('PENDING_APPROVAL');
      expect(submitted.approvalStatus).toBe('PENDING');
      expect(submitted.lineItemsWritten).toBe(false);

      const approval = await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: submitted.approvalRequestId },
        select: {
          type: true,
          status: true,
          makerId: true,
          checkerId: true,
          subjectId: true,
          payloadHash: true,
          payload: true,
        },
      });
      // ⚠ THE TYPE IS `DISTRIBUTION_RUN`. A `BANK_MOVEMENT` here would abort the transaction at
      // COMMIT inside `execute`, after every application check had passed.
      expect(approval.type).toBe('DISTRIBUTION_RUN');
      expect(approval.status).toBe('PENDING');
      expect(approval.makerId).toBe(RUN_MAKER);
      expect(approval.checkerId).toBeNull();
      // ⚠ THE SUBJECT IS THE RUN ROW'S OWN ID, because `qmulate_distribution_authority` compares
      // `subjectId` to `NEW."id"`.
      expect(approval.subjectId).toBe(created.distributionId);
      expect(approval.payloadHash).toMatch(/^[0-9a-f]{64}$/);
      // ⚠ AND THE ENGINE BUILD IS INSIDE WHAT THE NAZIR SIGNS — this is what makes a re-run under a
      // different version void the fingerprint instead of executing quietly.
      const payload = approval.payload as Record<string, unknown>;
      expect(payload['engineVersion']).toBe('e6-distribution/4.0.0');
      expect(payload['runDigest']).toBe(created.run.runDigest);
      expect(payload['distributionId']).toBe(created.distributionId);
      expect(payload['distributableSar']).toBe('275000.00');

      // ── the deltas, captured HERE, before the approve ───────────────────────────────────
      before.approve = await countAuditEvents({
        action: 'APPROVE',
        entityId: submitted.approvalRequestId,
      });
      before.distributionPost = await countAuditEvents({
        action: 'DISTRIBUTION_POST',
        entityId: created.distributionId,
      });

      // ── the maker may NOT post before the checker has decided ───────────────────────────
      await expect(
        (await callerFor(RUN_MAKER, 'g9-early-execute')).distribution.execute({
          waqfId: WAQF,
          distributionId: created.distributionId,
          approvalRequestId: submitted.approvalRequestId,
        }),
      ).rejects.toThrow(/DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*APPROVAL_NOT_USABLE/);
      expect(
        await prisma.distributionLineItem.count({
          where: { distributionId: created.distributionId },
        }),
      ).toBe(0);

      // ── APPROVE · the ONE approving path, on the checker rung ───────────────────────────
      const decided = await (
        await callerFor(RUN_CHECKER, 'g9-approve')
      ).approval.approve({
        waqfId: WAQF,
        approvalRequestId: submitted.approvalRequestId,
      });
      expect(decided.status).toBe('APPROVED');
      expect(decided.checkerId).toBe(RUN_CHECKER);

      // ── EXECUTE · the lines ────────────────────────────────────────────────────────────
      const result = await (
        await callerFor(RUN_MAKER, 'g9-execute')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      });
      expect(result.status).toBe('EXECUTED');
      expect(result.makerId).toBe(RUN_MAKER);
      expect(result.checkerId).toBe(RUN_CHECKER);
      expect(result.makerId).not.toBe(result.checkerId);
      expect(result.lineItemIds).toHaveLength(3);
      posted = { ...result };

      // ── the persisted lines ────────────────────────────────────────────────────────────
      const lines = await prisma.distributionLineItem.findMany({
        where: { distributionId: created.distributionId },
        select: {
          waqfId: true,
          beneficiaryId: true,
          status: true,
          sharePercent: true,
          amountSar: true,
          blockedReason: true,
          createdBy: true,
        },
        orderBy: { beneficiaryId: 'asc' },
      });
      expect(
        lines.map((line) => [
          line.beneficiaryId,
          line.status,
          line.amountSar.toString(),
          line.sharePercent.toString(),
          line.blockedReason,
        ]),
      ).toEqual([
        ['ben-001', 'PAID', '137500', '50', null],
        // ⚠ EXPLICIT, because the column DEFAULTS to PAID: an EXCLUDED line that relied on the
        // default would have been recorded as a payment.
        ['ben-002', 'EXCLUDED', '0', '0', 'UPPER_TABAQA_EXTANT'],
        ['ben-003', 'WITHHELD', '137500', '50', 'KYC_UNVERIFIED'],
      ]);
      // ⚠ `waqfId` COMES FROM THE PARENT RUN, NEVER FROM THE BENEFICIARY. Migration 19's composite
      // FKs make the wrong choice a constraint violation — and the right choice for the wrong reason
      // is still wrong, so it is asserted against the run's endowment.
      expect(lines.every((line) => line.waqfId === stored.waqfId)).toBe(true);
      expect(lines.every((line) => line.createdBy === RUN_MAKER)).toBe(true);

      // ── the run and its approval both reached their terminal states ─────────────────────
      const finalRun = await prisma.distribution.findUniqueOrThrow({
        where: { id: created.distributionId },
        select: {
          status: true,
          approvalRequestId: true,
          executedAt: true,
          executedAtHijri: true,
          engineVersion: true,
          runDigest: true,
        },
      });
      expect(finalRun.status).toBe('EXECUTED');
      expect(finalRun.approvalRequestId).toBe(submitted.approvalRequestId);
      expect(finalRun.executedAt?.toISOString()).toBe(NOW.toISOString());
      expect(finalRun.executedAtHijri).toBe('1448-03-05');
      expect(finalRun.engineVersion).toBe('e6-distribution/4.0.0');
      expect(finalRun.runDigest).toBe(created.run.runDigest);
      // EXECUTED, not left APPROVED: a standing approval keeps the one-open-per-subject slot and
      // would be a second live authority.
      expect(
        (
          await prisma.approvalRequest.findUniqueOrThrow({
            where: { id: submitted.approvalRequestId },
            select: { status: true },
          })
        ).status,
      ).toBe('EXECUTED');
    });

    it('one approval cannot be spent twice', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      await expect(
        (await callerFor(RUN_MAKER, 'g9-spend-twice')).distribution.execute({
          waqfId: WAQF,
          distributionId: posted.distributionId,
          approvalRequestId: posted.approvalRequestId,
        }),
        // The run is EXECUTED (terminal), so the state gate refuses before the approval is even read.
      ).rejects.toThrow(/DISTRIBUTION_RUN_STATE_REFUSED/);
      const prisma = await basePrisma();
      expect(
        await prisma.distributionLineItem.count({
          where: { distributionId: posted.distributionId },
        }),
      ).toBe(3);
    });

    it('`lines` reads the posted lines back at SIX decimals and 2-dp money', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      const rows = await (
        await callerFor(RUN_MAKER, 'g9-lines')
      ).distribution.lines({
        waqfId: WAQF,
        distributionId: posted.distributionId,
      });
      expect(rows.map((row) => [row.beneficiaryId, row.sharePercent, row.amountSar])).toEqual([
        // ⚠ THE SCALE IS THE POINT. `Decimal.toString()` would give '50' and '137500' here; the
        // statement figure a beneficiary reads has to carry the engine's own six decimals, which is
        // what migration 21 widened the column for.
        ['ben-001', '50.000000', '137500.00'],
        ['ben-002', '0.000000', '0.00'],
        ['ben-003', '50.000000', '137500.00'],
      ]);
      expect(rows.every((row) => row.waqfId === WAQF)).toBe(true);
    });

    it('⚠ the COLUMN itself holds six decimals — asked of Postgres, not of Prisma', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      // `numeric(9,6)::text` prints its full scale, so this distinguishes the widened column from the
      // old `Decimal(9,4)` (which would print '50.0000'). Prisma's Decimal normalizes trailing zeros
      // away and therefore cannot tell the two apart at all — the same class of coercion as AL-1.
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ beneficiaryId: string; text: string }[]>(
        `SELECT "beneficiaryId", "sharePercent"::text AS "text"
           FROM "distribution_line_item" WHERE "distributionId" = $1 ORDER BY "beneficiaryId" ASC`,
        posted.distributionId,
      );
      expect(rows.map((row) => [row.beneficiaryId, row.text])).toEqual([
        ['ben-001', '50.000000'],
        ['ben-002', '0.000000'],
        ['ben-003', '50.000000'],
      ]);
    });

    it('`get` returns the run with the build that produced it', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      const row = await (
        await callerFor(RUN_MAKER, 'g9-get')
      ).distribution.get({
        waqfId: WAQF,
        distributionId: posted.distributionId,
      });
      expect(row?.status).toBe('EXECUTED');
      expect(row?.engineVersion).toBe('e6-distribution/4.0.0');
      expect(row?.runDigest).toBe(posted.runDigest);
      expect(row?.distributableSar).toBe('275000.00');
      // The seeded historical run carries NEITHER column — `null` means nobody recorded one, which is
      // exactly what a run written before migration 21 should say about itself.
      const seeded = await (
        await callerFor(RUN_MAKER, 'g9-get-seeded')
      ).distribution.get({
        waqfId: WAQF,
        distributionId: 'dist-001',
      });
      expect(seeded?.engineVersion).toBeNull();
      expect(seeded?.runDigest).toBeNull();
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 3 · V-7 · the audit trail
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('V-7 · the material actions are audited, and the trail cannot be edited', () => {
    it('the APPROVE and DISTRIBUTION_POST deltas are exactly what the two writes produce', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      const approve = await countAuditEvents({
        action: 'APPROVE',
        entityId: posted.approvalRequestId,
      });
      const post = await countAuditEvents({
        action: 'DISTRIBUTION_POST',
        entityId: posted.distributionId,
      });
      // ⚠ DELTAS, NOT ABSOLUTES: this database is shared with `@qmulate/database`'s suite.
      //
      // ⚠ AND THE DELTA IS **2** ON EACH, NOT 1 — MEASURED, AND EXPLAINED RATHER THAN ROUNDED. Each
      // material write produces TWO rows, and they are different kinds of evidence:
      //   · the DIFFED mutation event, written by the audit extension from the write itself, with
      //     before/after images (`deriveAction` names it `APPROVE` for an ApprovalRequest status move
      //     and `DISTRIBUTION_POST` for a Distribution reaching EXECUTED — neither is passed in);
      //   · the AUTHORITY-CONTEXT event (MP-32), written with `recordEvent`, whose job is to name the
      //     grant, the role, the maker, the checker and the artifact hash, and which carries NO
      //     before/after because it describes no row change.
      // The two are separated by SQL below, which is the only way to tell them apart.
      expect(approve - before.approve).toBe(2);
      expect(post - before.distributionPost).toBe(2);
    });

    it('the two kinds are distinguished with RAW SQL — `before`/`after` IS NULL, not Prisma', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      // ⚠ RAW SQL, AND THE REASON IS DEFECT AL-1. Prisma reports a JSON `{}`/`null` and a SQL NULL
      // indistinguishably, and that coercion is exactly what hid a trail claiming columns had been
      // "set to null". The question `"after" IS NULL` has to be asked of POSTGRES.
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        { action: string; beforeIsNull: boolean; afterIsNull: boolean; procedure: string | null }[]
      >(
        `SELECT "action",
                "before" IS NULL AS "beforeIsNull",
                "after"  IS NULL AS "afterIsNull",
                "context"->>'procedure' AS "procedure"
           FROM "audit_event"
          WHERE "entityId" = $1 AND "action" = 'DISTRIBUTION_POST'
          ORDER BY "id" ASC`,
        posted.distributionId,
      );
      expect(rows).toHaveLength(2);
      const diffed = rows.filter((row) => !row.afterIsNull);
      const context = rows.filter((row) => row.beforeIsNull && row.afterIsNull);
      expect(diffed).toHaveLength(1);
      expect(context).toHaveLength(1);
      // The status move carries a BEFORE image too — it is an update, not a create.
      expect(diffed[0]?.beforeIsNull).toBe(false);
      expect(context[0]?.procedure).toBe('distribution.execute');
    });

    it('the DISTRIBUTION_POST authority event names the approval, both identities and the digest', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      // An event that records only "a run was posted" is not an audit of an AUTHORITY (BR-607,
      // NFR-04). The context must name what conferred it.
      const prisma = await privilegedPrisma();
      const [row] = await prisma.$queryRawUnsafe<{ context: Record<string, unknown> }[]>(
        `SELECT "context" FROM "audit_event"
          WHERE "entityId" = $1 AND "action" = 'DISTRIBUTION_POST' AND "after" IS NULL
          ORDER BY "id" DESC LIMIT 1`,
        posted.distributionId,
      );
      const extra = (row?.context?.['extra'] ?? row?.context ?? {}) as Record<string, unknown>;
      expect(extra['approvalRequestId']).toBe(posted.approvalRequestId);
      expect(extra['approvalMakerId']).toBe(RUN_MAKER);
      expect(extra['approvalCheckerId']).toBe(RUN_CHECKER);
      expect(extra['engineVersion']).toBe('e6-distribution/4.0.0');
      expect(extra['runDigest']).toBe(posted.runDigest);
      expect(extra['lineItemCount']).toBe('3');
    });

    it('one CREATE event per line item, each naming the line it created', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      const counts = await Promise.all(
        posted.lineItemIds.map((id) => countAuditEvents({ action: 'CREATE', entityId: id })),
      );
      // `createMany` is banned by the audit spine precisely because it returns no per-row result, so
      // the created ids could not be recorded. One `create` each is what makes this assertion possible.
      expect(counts).toEqual([1, 1, 1]);
    });

    it('every row this run wrote recomputes from the content the database holds', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      const { recomputeRowHash } = await import('@qmulate/database');
      const prisma = await privilegedPrisma();
      const rows = (await prisma.auditEvent.findMany({
        where: {
          OR: [
            { entityId: posted.distributionId },
            { entityId: posted.approvalRequestId },
            { entityId: { in: [...posted.lineItemIds] } },
          ],
        },
        orderBy: { id: 'asc' },
      })) as unknown as (Parameters<typeof recomputeRowHash>[0] & {
        prevHash: string;
        rowHash: string;
      })[];
      // A silently-empty sweep proves nothing: 2 APPROVE + 2 DISTRIBUTION_POST + 1 UPDATE (the
      // PENDING_APPROVAL → APPROVED move) + 3 CREATE, at minimum.
      expect(rows.length).toBeGreaterThanOrEqual(8);
      const broken = rows.filter((row) => recomputeRowHash(row, row.prevHash) !== row.rowHash);
      expect(broken.map((row) => String(row.id))).toEqual([]);
    });

    it('the WHOLE chain still verifies from genesis, in id order', async () => {
      const { verifyChain } = await import('@qmulate/database');
      const prisma = await privilegedPrisma();
      const rows = (await prisma.auditEvent.findMany({
        orderBy: { id: 'asc' },
      })) as unknown as never;
      const result = verifyChain(rows);
      expect(result.brokenAtId).toBeUndefined();
      expect(result.ok).toBe(true);
      // The sweep must have reached a seeded trail, or "ok" is a statement about nothing.
      expect(result.checked).toBeGreaterThan(96);
    });

    it('a privileged raw UPDATE and DELETE on audit_event are both refused by the DATABASE', async () => {
      if (posted === null) throw new Error('the lifecycle test must run first');
      // G-1. Attempted on the MIGRATOR connection — the most privileged role this harness has — so a
      // pass cannot be explained by a missing GRANT. Append-only means append-only for the owner too.
      const prisma = await privilegedPrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "audit_event" SET "action" = 'UPDATE' WHERE "entityId" = $1`,
          posted.distributionId,
        ),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "audit_event" WHERE "entityId" = $1`,
          posted.distributionId,
        ),
      ).rejects.toThrow();
      // And the rows are still there, unchanged — the refusal is not a partial application.
      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "audit_event"
          WHERE "entityId" = $1 AND "action" = 'DISTRIBUTION_POST'`,
        posted.distributionId,
      );
      expect(Number(row?.n ?? 0)).toBe(2);
    });
  });
});
