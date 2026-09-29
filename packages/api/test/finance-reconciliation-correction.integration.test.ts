/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E5's THIRD EXIT CLAUSE — *"a reconciliation run reports a deliberately-planted mismatch"* —
 * and the two CORRECTION flows the product owner ruled on 2026-08-18.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ THE VACUOUS VERSION, AGAIN WRITTEN DOWN SO IT IS NOT WRITTEN BY ACCIDENT ────────────────
 * A reconciliation suite that only asserts "the run returned exceptions" passes over an engine
 * that can never match ANYTHING. Before migration 20 that was literally the state of the system:
 * `Transaction` carried no bank reference, so every entry came back `UNREFERENCED` and a
 * "reports a mismatch" assertion would have been green over a reconciliation incapable of
 * reconciling. R6-C1's lesson one layer down.
 *
 * So every mismatch test here is paired with a POSITIVE CONTROL — the same account, the same
 * period, a statement that agrees, reconciling clean — and the planted mismatch is asserted BY
 * NAME and BY ROW, never by count.
 *
 * ── THE TWO CORRECTION RULINGS ───────────────────────────────────────────────────────────────
 *  Q-E5-1(b)  receipt class — BOTH directions, EVERY correction reserved-matter-gated, a
 *             SUPERSEDING RECORD (mirrored reversal + re-entry), never an edit.
 *  Q-E5-2(b)  amountSar — an IN-PLACE edit with an audit event carrying before/after.
 *
 * ⚠ The suite asserts, for the first, that the ORIGINAL ROW IS UNCHANGED — because "we corrected
 * it by adding records" is exactly the claim that is easy to write and easy to get wrong.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
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
  recordReservedMatterChain,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('the reconciliation + receipt-correction suite (E5 exit clause 3, Q-E5-1/2)');

const createCaller = createCallerFactory(appRouter);

const WAQF_A = 'waqf-001';
const ACCOUNT_A = 'bankacct-fake-acct-w1';

/** waqf-001's seeded rent receipt — SAR 350,000, INCOME. */
const REV_001 = 'rev-001';
/** waqf-001's seeded maintenance expense — SAR 40,000. */
const EXP_001 = 'exp-e-001';
/** waqf-001's seeded Nazir-fee expense — SAR 35,000. The account has THREE seeded movements. */
const EXP_002 = 'exp-e-002';
/** The seeded bank references (`derivedId.bankReference`). */
const REF_REV_001 = 'FAKE-BNK-REV-001';
const REF_EXP_001 = 'FAKE-BNK-EXP-E-001';
const REF_EXP_002 = 'FAKE-BNK-EXP-E-002';
// ⚠ waqf-001's CAPITAL receipt (S7/E6). `derivedId.bankReference` is `FAKE-BNK-${id.toUpperCase()}`.
const REF_REV_005 = 'FAKE-BNK-REV-005';

const PERIOD_START = '2026-01-01T00:00:00.000Z';
const PERIOD_END = '2026-12-31T23:59:59.000Z';

const MAKER = `${API_TEST_PREFIX}rec-maker`;
const NAZIR = `${API_TEST_PREFIX}rec-nazir`;
/** ⊕ S12-2 · records the BR-1102 chain before the Nazir signs a correction (owner: "staff"). */
const STAFF = `${API_TEST_PREFIX}rec-staff`;
// `approval:request:read` is what makes the approval ROW visible to the recorder — the reserved-matter
// verbs alone leave `approval_request` filtered to nothing (measured: NOT_FOUND on the first run).
// …and `approval:request:initiate` is what the WRITE gate on `approval_request` demands (any approval
// verb — `DOMAIN_WRITE_POLICIES.ApprovalRequest`); the compliance-officer preset carries it.
const STAFF_PERMISSIONS = [
  'approval:request:read',
  'approval:request:initiate',
  'legal:reserved_matter:read',
  'legal:reserved_matter:write',
];

// ⚠ NO `legal:reserved_matter:write` HERE, AND ITS ABSENCE IS A MEASUREMENT. That verb is not in
// the `finance` preset, so `grant ∩ preset` narrows it away — the first version of this suite
// granted it and every correction test failed PERMISSION_DENIED. The finance seat is the one that
// discovers a mis-classification while reconciling, so the REQUEST gate is
// `finance:transaction:write`; what the owner's ruling gates is the APPROVAL.
const MAKER_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
  'finance:bank_account:read',
  'approval:request:read',
  'approval:request:initiate',
];

const NAZIR_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
  // ⊕ OQ-06 tail (owner, 2026-08-18): the maintenance-reserve policy has its OWN verb, in the
  // `nazir` preset and no other. Granted here and DELIBERATELY ABSENT from MAKER_PERMISSIONS —
  // the finance seat's refusal is one of the assertions below.
  'finance:maintenance_policy:read',
  'finance:maintenance_policy:write',
  'legal:reserved_matter:read',
  'legal:reserved_matter:approve',
  'approval:request:read',
  'approval:request:approve',
];

function subjects(): TestSubjectSpec[] {
  return [
    { id: MAKER, role: 'FINANCE', waqfIds: [WAQF_A], permissions: MAKER_PERMISSIONS },
    { id: NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: NAZIR_PERMISSIONS },
    { id: STAFF, role: 'COMPLIANCE_OFFICER', waqfIds: [WAQF_A], permissions: STAFF_PERMISSIONS },
  ];
}

/** The statement, as the bank really reports it — every seeded movement, agreeing exactly. */
const AGREEING_STATEMENT = [
  {
    bankReference: REF_REV_001,
    direction: 'REVENUE' as const,
    amountSar: '350000.00',
    valueDate: '2026-03-31',
  },
  {
    bankReference: REF_EXP_001,
    direction: 'EXPENSE' as const,
    amountSar: '40000.00',
    valueDate: '2026-02-10',
  },
  // ⚠ EVERY LINE MATTERS. waqf-001's dedicated account carries FOUR seeded movements, and an
  // "agreeing" statement that listed only some would leave a permanent MISSING_FROM_STATEMENT — the
  // positive control would never be clean and every mismatch assertion below would be measuring
  // that instead of the planted one.
  {
    bankReference: REF_EXP_002,
    direction: 'EXPENSE' as const,
    amountSar: '35000.00',
    valueDate: '2026-04-01',
  },
  // ⚠ THE FOURTH LINE IS CORPUS, AND IT IMPROVES THIS FIXTURE RATHER THAN PATCHING IT (S7/E6).
  // `rev-005` is waqf-001's first CAPITAL receipt — istibdal (استبدال) proceeds, SAR 4,200,000 —
  // added so V-1 can prove the corpus wall on waqf-001's OWN run (`rev-004` sits on waqf-003, so a
  // waqf-001 run drops it on the `waqfId` filter before `receiptClass` is read, proving endowment
  // scoping and nothing about corpus). A bank statement reports corpus movements too, so an
  // "agreeing" statement MUST carry it.
  //
  // ⚠ AND IT MAKES THE CLASS SPLIT A REAL ASSERTION FOR THE FIRST TIME. Until now
  // `capital.reconciledIn` was `'0.00'` — a figure that would also read `'0.00'` if the split were
  // broken and everything fell into `income`. With a corpus line present, income and capital must
  // each report their own total and there is still deliberately NO combined figure to read.
  {
    bankReference: REF_REV_005,
    direction: 'REVENUE' as const,
    amountSar: '4200000.00',
    valueDate: '2026-02-17',
  },
];

async function reconcileWith(
  statementLines: readonly {
    bankReference: string;
    direction: 'REVENUE' | 'EXPENSE';
    amountSar: string;
    valueDate: string;
  }[],
  options: { commit?: boolean; requestId: string },
) {
  return createCaller(
    await contextFor({ userId: MAKER, requestId: options.requestId }),
  ).finance.reconcile({
    waqfId: WAQF_A,
    bankAccountId: ACCOUNT_A,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    statementLines: [...statementLines],
    commit: options.commit ?? false,
  });
}

describe.runIf(hasDatabase)('finance · reconciliation and corrections', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());
  });

  afterAll(async () => {
    // Soft delete only: a ledger row carries the >=10-year retention obligation and DELETE is
    // refused 42501 even for the migrator. See the maker-checker suite's teardown.
    const prisma = await privilegedPrisma();
    // ⚠ A HARD DELETE, IN TEARDOWN ONLY, AS THE MIGRATOR — and it needs this paragraph.
    //
    // Soft-deleting was tried first and is NOT sufficient: the database suite pins EXACT fixture
    // row counts on `transaction`, and its count queries do not filter `deletedAt`. Running both
    // integration suites TWICE on ONE cluster (the standing integration proof) therefore turned the
    // SECOND database pass red on six assertions — this suite's rows leaking into another suite's
    // fixture. That is a real finding about test isolation, not a flake, and papering over it by
    // relaxing the other suite's pins would destroy a control that exists to catch seed drift.
    //
    // `transaction_no_delete` (migration 6) refuses DELETE for every role including the migrator,
    // so the guard is suspended for exactly this one prefixed statement and restored `ENABLE
    // ALWAYS` in the same atomic `DO` block — one block is one statement is one transaction, so a
    // raise rolls the DISABLE back with it.
    //
    // ⚠ THE COMMENT DELIBERATELY DOES NOT NAME THE ACCESS-MATRIX PROVISIONING HELPER, even though
    // this follows the same pattern for the same reason. `base-client-export-surface.test.ts`
    // enforces its allowlist with a TEXT SCAN, so merely mentioning that identifier in prose adds a
    // file to the census of callers — which is a fair trade for a scan that cannot be defeated by
    // indirection, and worth recording so the next author does not "helpfully" add the reference
    // back. The justification is the same: legitimate because this is fixture TEARDOWN, never a
    // request path. No assertion in this suite runs on this connection.
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "transaction" DISABLE TRIGGER transaction_no_delete;
        DELETE FROM "transaction" WHERE "createdBy" LIKE 'user-test-api-%';
        ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_no_delete;
      END
      $$;
    `);
    await prisma.$executeRawUnsafe(
      `UPDATE "transaction" SET "reconciledAt" = NULL WHERE "waqfId" = $1`,
      WAQF_A,
    );
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * E5 EXIT CLAUSE 3
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('a reconciliation run reports a deliberately-planted mismatch', () => {
    it('THE POSITIVE CONTROL · an agreeing statement reconciles clean, with real pairs', async () => {
      // ⚠ THIS TEST IS WHAT MAKES EVERY MISMATCH TEST BELOW MEAN ANYTHING. Without it, an engine
      // that matched nothing would satisfy all of them.
      const result = await reconcileWith(AGREEING_STATEMENT, { requestId: 'rec-clean' });

      expect(result.balanced).toBe(true);
      expect(result.pairs).toBe(4);
      expect(result.exceptions).toStrictEqual([]);
      // The income leg reconciled, in full, and is reported SPLIT BY CLASS.
      expect(result.income.reconciledIn).toBe('350000.00');
      expect(result.income.unreconciledIn).toBe('0.00');
      // ⚠ And corpus is a separate figure — now a NON-ZERO one (S7/E6's `rev-005`), which is what
      // makes this a real test of the split rather than a comparison of two zeroes. Binding rule 1:
      // there is still no combined total anywhere in this result to read.
      expect(result.capital.reconciledIn).toBe('4200000.00');
      expect(result.capital.unreconciledIn).toBe('0.00');
      // 350,000 + 4,200,000 is NOT reported, and must never be: netting corpus against income is
      // exactly the arithmetic the non-diminution invariant forbids.
      expect(result).not.toHaveProperty('total');
    });

    it('⚠ THE PLANTED MISMATCH · a wrong amount is reported BY NAME and BY ROW', async () => {
      const result = await reconcileWith(
        [
          // The bank says the rent was 349,000. The ledger says 350,000. One thousand riyals of a
          // family's income, on one line.
          // ⚠ EXACTLY ONE LINE IS ALTERED and the other two are left agreeing, so the run's single
          // exception IS the planted one. Dropping a line instead would add a
          // MISSING_FROM_STATEMENT and the assertion would be measuring the wrong divergence.
          { ...AGREEING_STATEMENT[0]!, amountSar: '349000.00' },
          AGREEING_STATEMENT[1]!,
          AGREEING_STATEMENT[2]!,
          AGREEING_STATEMENT[3]!,
        ],
        { requestId: 'rec-amount-mismatch' },
      );

      expect(result.balanced).toBe(false);
      expect(result.exceptions).toHaveLength(1);

      const exception = result.exceptions[0]!;
      expect(exception.finding).toBe('AMOUNT_MISMATCH');
      // BY ROW — the Nazir is told which receipt, not merely that something is wrong.
      expect(exception.ledgerEntryId).toBe(REV_001);
      expect(exception.bankReference).toBe(REF_REV_001);
      expect(exception.ledgerAmount).toBe('350000.00');
      expect(exception.statementAmount).toBe('349000.00');
      expect(exception.receiptClass).toBe('INCOME');
    });

    it('a movement the ledger never saw is MISSING_FROM_LEDGER, named by its reference', async () => {
      const result = await reconcileWith(
        [
          ...AGREEING_STATEMENT,
          {
            bankReference: 'FAKE-BNK-GHOST-1',
            direction: 'REVENUE',
            amountSar: '12345.00',
            valueDate: '2026-07-01',
          },
        ],
        { requestId: 'rec-missing-ledger' },
      );

      expect(result.balanced).toBe(false);
      const finding = result.exceptions.find((e) => e.finding === 'MISSING_FROM_LEDGER');
      expect(finding?.bankReference).toBe('FAKE-BNK-GHOST-1');
      expect(finding?.statementAmount).toBe('12345.00');
      // ⚠ The class is NULL and must stay null: the ledger never saw this line, so its
      // income-vs-capital class is genuinely unknown, and guessing it is how a capital receipt
      // gets treated as income.
      expect(finding?.receiptClass).toBeNull();
    });

    it('books that record money the bank did not move are MISSING_FROM_STATEMENT', async () => {
      const result = await reconcileWith([AGREEING_STATEMENT[0]!], {
        requestId: 'rec-missing-statement',
      });

      expect(result.balanced).toBe(false);
      const finding = result.exceptions.find((e) => e.finding === 'MISSING_FROM_STATEMENT');
      expect(finding?.ledgerEntryId).toBe(EXP_001);
    });

    it('a receipt booked against a payment is a DIRECTION_MISMATCH, not an amount problem', async () => {
      const result = await reconcileWith(
        [{ ...AGREEING_STATEMENT[0]!, direction: 'EXPENSE' }, AGREEING_STATEMENT[1]!],
        { requestId: 'rec-direction' },
      );

      const findings = result.exceptions.map((e) => e.finding);
      expect(findings).toContain('DIRECTION_MISMATCH');
    });

    it('the run REPORTS without stamping anything unless commit is asked for', async () => {
      // ⚠ `commit` is opt-IN on purpose: a reconciliation that stamps rows merely by being run makes
      // "reconciled" mean "somebody pressed the button", which is the assurance a Nazir is signing.
      const prisma = await basePrisma();
      await (
        await privilegedPrisma()
      ).$executeRawUnsafe(
        `UPDATE "transaction" SET "reconciledAt" = NULL WHERE "id" = $1`,
        REV_001,
      );

      const dryRun = await reconcileWith(AGREEING_STATEMENT, { requestId: 'rec-dry' });
      expect(dryRun.committed).toBe(false);
      expect(dryRun.reconciledAtWritten).toBe(0);
      expect(
        (
          await prisma.transaction.findUnique({
            where: { id: REV_001 },
            select: { reconciledAt: true },
          })
        )?.reconciledAt,
      ).toBeNull();
    });

    it('⚠ commit WRITES reconciledAt — and only on confirmed pairs', async () => {
      const result = await reconcileWith(AGREEING_STATEMENT, {
        commit: true,
        requestId: 'rec-commit',
      });

      expect(result.committed).toBe(true);
      // ⚠ 3 → 4 (S7/E6): `rev-005`, waqf-001's CAPITAL receipt, is a confirmed pair too. A bank
      // statement reports corpus movements, and reconciling one is not distributing it — the
      // corpus guard is on what enters the WATERFALL, not on what the bank is allowed to have moved.
      expect(result.reconciledAtWritten).toBe(4);

      const prisma = await basePrisma();
      const stamped = await prisma.transaction.findUnique({
        where: { id: REV_001 },
        select: { reconciledAt: true },
      });
      expect(stamped?.reconciledAt).toBeInstanceOf(Date);
      // ⚠ AND THE CORPUS ROW IS STAMPED TOO — asserted rather than left to the count, because a
      // count of 4 would also be satisfied by stamping some other row twice. E5's `reconciledAt`
      // was deliberately left mutable on a capital receipt ("a not-a-seal control"), and this is
      // the first fixture that can prove the reconciler actually reaches one.
      const stampedCapital = await prisma.transaction.findUnique({
        where: { id: 'rev-005' },
        select: { reconciledAt: true, receiptClass: true },
      });
      expect(stampedCapital?.receiptClass).toBe('CAPITAL');
      expect(stampedCapital?.reconciledAt).toBeInstanceOf(Date);
    });

    it('an unmatched row is NOT stamped, even in the same committed run', async () => {
      // The half that stops `commit` meaning "mark everything reconciled". EXP_001 is absent from
      // the statement, so it must stay unstamped while REV_001 is stamped in the same call.
      await (
        await privilegedPrisma()
      ).$executeRawUnsafe(
        `UPDATE "transaction" SET "reconciledAt" = NULL WHERE "waqfId" = $1`,
        WAQF_A,
      );

      const result = await reconcileWith([AGREEING_STATEMENT[0]!], {
        commit: true,
        requestId: 'rec-partial-commit',
      });
      expect(result.reconciledAtWritten).toBe(1);

      const prisma = await basePrisma();
      const rows = await prisma.transaction.findMany({
        where: { id: { in: [REV_001, EXP_001, EXP_002] } },
        select: { id: true, reconciledAt: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r.reconciledAt]));
      expect(byId.get(REV_001)).toBeInstanceOf(Date);
      expect(byId.get(EXP_001)).toBeNull();
      expect(byId.get(EXP_002)).toBeNull();
    });

    it('the audit trail names the findings, not merely their count', async () => {
      const before = await countAuditEvents({ action: 'UPDATE', entityId: ACCOUNT_A });
      await reconcileWith([{ ...AGREEING_STATEMENT[0]!, amountSar: '1.00' }], {
        commit: true,
        requestId: 'rec-audit',
      });
      expect(await countAuditEvents({ action: 'UPDATE', entityId: ACCOUNT_A })).toBeGreaterThan(
        before,
      );
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * Q-E5-1(b) — the receipt-class correction, BOTH directions, as a superseding record
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('receipt-class correction (owner ruling Q-E5-1(b))', () => {
    /** Raises a correction and approves it, returning the approval id. */
    async function approvedCorrection(
      transactionId: string,
      to: { toReceiptClass: 'INCOME' | 'CAPITAL'; toCapitalSource?: string | null },
      tag: string,
    ) {
      const raised = await createCaller(
        await contextFor({ userId: MAKER, requestId: `corr-req-${tag}` }),
      ).finance.receiptClass.requestCorrection({
        waqfId: WAQF_A,
        transactionId,
        toReceiptClass: to.toReceiptClass,
        toCapitalSource: (to.toCapitalSource ?? null) as never,
        reasonAr: 'تصحيح تصنيف: المبلغ حصيلة استبدال وليس غلة (بيانات وهمية)',
      });
      // ⊕ S12-2: the chain is recorded by STAFF before the Nazir may sign (migration 51).
      await recordReservedMatterChain(
        createCaller(await contextFor({ userId: STAFF, requestId: `corr-chain-${tag}` })),
        { waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId },
      );
      await createCaller(
        await contextFor({ userId: NAZIR, requestId: `corr-app-${tag}` }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId });
      return raised.approvalRequestId;
    }

    /** A fresh INCOME receipt to correct, so the seeded rows keep their meaning. */
    async function freshIncomeReceipt(tag: string): Promise<string> {
      const created = await createCaller(
        await contextFor({ userId: MAKER, requestId: `corr-seed-${tag}` }),
      ).finance.recordRevenue({
        waqfId: WAQF_A,
        bankAccountId: ACCOUNT_A,
        amountSar: '500000.00',
        date: '2026-06-01T00:00:00.000Z',
        dateHijri: '1447-12-15',
        descriptionAr: 'مقبوض قيد المراجعة (بيانات وهمية)',
        category: 'rent',
        receiptClass: 'INCOME',
      });
      return created.transactionId;
    }

    it('⚠ INCOME → CAPITAL · writes a mirrored reversal and a re-entry, and does NOT edit the original', async () => {
      const originalId = await freshIncomeReceipt('i2c');
      const approvalId = await approvedCorrection(
        originalId,
        { toReceiptClass: 'CAPITAL', toCapitalSource: 'ISTIBDAL_PROCEEDS' },
        'i2c',
      );

      const result = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-exec-i2c' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: approvalId,
      });

      expect(result.originalRowEdited).toBe(false);
      expect(result.account).toBe('COR-ISTIBDAL');
      expect(result.accountClass).toBe('CORPUS');

      const prisma = await basePrisma();
      const rows = await prisma.transaction.findMany({
        where: {
          id: { in: [originalId, result.reversalTransactionId, result.reentryTransactionId] },
        },
        select: {
          id: true,
          receiptClass: true,
          capitalSource: true,
          amountSar: true,
          reversalOfId: true,
          correctionOfId: true,
          correctionApprovalRequestId: true,
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));

      // ⚠ THE ORIGINAL STILL SAYS WHAT IT SAID. This is the assertion the whole ruling turns on.
      expect(byId.get(originalId)?.receiptClass).toBe('INCOME');
      expect(byId.get(originalId)?.capitalSource).toBeNull();

      // The reversal MIRRORS it — same class, same source, same amount.
      const reversal = byId.get(result.reversalTransactionId);
      expect(reversal?.receiptClass).toBe('INCOME');
      expect(reversal?.reversalOfId).toBe(originalId);
      expect(String(reversal?.amountSar)).toBe(String(byId.get(originalId)?.amountSar));

      // The re-entry carries the corrected class and names what it corrects.
      const reentry = byId.get(result.reentryTransactionId);
      expect(reentry?.receiptClass).toBe('CAPITAL');
      expect(reentry?.capitalSource).toBe('ISTIBDAL_PROCEEDS');
      expect(reentry?.correctionOfId).toBe(originalId);
      expect(reentry?.correctionApprovalRequestId).toBe(approvalId);
    });

    it('⚠ CAPITAL → INCOME · the other direction works too (the owner ruled BOTH)', async () => {
      // Engineering had recommended gating only this direction. The owner chose the uniform gate,
      // and this test is what proves the other direction is actually reachable rather than
      // documented-as-allowed.
      const originalId = await freshIncomeReceipt('c2i-seed');
      const toCapital = await approvedCorrection(
        originalId,
        { toReceiptClass: 'CAPITAL', toCapitalSource: 'SALE_PROCEEDS' },
        'c2i-a',
      );
      const first = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-exec-c2i-a' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: toCapital,
      });

      // Now correct the CAPITAL re-entry back to INCOME.
      const backToIncome = await approvedCorrection(
        first.reentryTransactionId,
        { toReceiptClass: 'INCOME', toCapitalSource: null },
        'c2i-b',
      );
      const second = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-exec-c2i-b' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: backToIncome,
      });

      expect(second.fromReceiptClass).toBe('CAPITAL');
      expect(second.toReceiptClass).toBe('INCOME');
      expect(second.account).toBe('INC-GHALLAH');
    });

    it('⚠ the corpus column guard still refuses the IN-PLACE flip — the flow adds records', async () => {
      // The point of the whole design, proven by going around the api entirely. If this ever stops
      // being refused, the correction flow stopped being a superseding record.
      const originalId = await freshIncomeReceipt('guard');
      const toCapital = await approvedCorrection(
        originalId,
        { toReceiptClass: 'CAPITAL', toCapitalSource: 'SALE_PROCEEDS' },
        'guard',
      );
      const done = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-exec-guard' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: toCapital,
      });

      const prisma = await basePrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "transaction" SET "receiptClass" = 'INCOME', "capitalSource" = NULL WHERE "id" = $1`,
          done.reentryTransactionId,
        ),
      ).rejects.toThrow(/may not be reclassified IN PLACE[\s\S]*SUPERSEDING RECORD/);
    });

    it('refuses to execute without an APPROVED reserved matter of the right KIND', async () => {
      const originalId = await freshIncomeReceipt('kind');
      // A BANK_MOVEMENT approval, approved — the wrong instrument entirely.
      const wrong = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-kind-init' }),
      ).approval.initiate({
        waqfId: WAQF_A,
        type: 'BANK_MOVEMENT',
        subjectId: `${API_TEST_PREFIX}wrong-instrument-${originalId}`,
        payload: { note: 'not a receipt correction' },
      });
      await createCaller(
        await contextFor({ userId: NAZIR, requestId: 'corr-kind-app' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: wrong.approvalRequestId });

      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'corr-kind-exec' }),
        ).finance.receiptClass.executeCorrection({
          waqfId: WAQF_A,
          approvalRequestId: wrong.approvalRequestId,
        }),
      ).rejects.toThrow(/WRONG_APPROVAL_TYPE: the approval is BANK_MOVEMENT/);
    });

    it('refuses a correction that corrects nothing', async () => {
      const originalId = await freshIncomeReceipt('noop');
      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'corr-noop' }),
        ).finance.receiptClass.requestCorrection({
          waqfId: WAQF_A,
          transactionId: originalId,
          toReceiptClass: 'INCOME',
          toCapitalSource: null,
          reasonAr: 'لا تغيير (بيانات وهمية)',
        }),
      ).rejects.toThrow(/RECEIPT_CLASS_UNCHANGED/);
    });

    it('refuses to correct an EXPENSE — an outflow carries no classification to correct', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'corr-expense' }),
        ).finance.receiptClass.requestCorrection({
          waqfId: WAQF_A,
          transactionId: EXP_001,
          toReceiptClass: 'CAPITAL',
          toCapitalSource: 'SALE_PROCEEDS',
          reasonAr: 'محاولة تصحيح مصروف (بيانات وهمية)',
        }),
      ).rejects.toThrow(/NOT_A_RECEIPT/);
    });

    it('⚠ a reversal cannot itself be reversed — the database refuses the chain', async () => {
      const originalId = await freshIncomeReceipt('chain');
      const approvalId = await approvedCorrection(
        originalId,
        { toReceiptClass: 'CAPITAL', toCapitalSource: 'SALE_PROCEEDS' },
        'chain',
      );
      const done = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-exec-chain' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: approvalId,
      });

      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'corr-chain-req' }),
        ).finance.receiptClass.requestCorrection({
          waqfId: WAQF_A,
          transactionId: done.reversalTransactionId,
          toReceiptClass: 'INCOME',
          toCapitalSource: null,
          reasonAr: 'محاولة تصحيح قيد عكسي (بيانات وهمية)',
        }),
      ).rejects.toThrow(/ALREADY_A_REVERSAL/);
    });

    /* ─────────────────────────────────────────────────────────────────────────────────────────
     * ⊕ AV7-F1 (HIGH, closed 2026-08-19) — THE APPROVAL IS SCOPED TO THE FIGURE THE NAZIR SAW
     * ─────────────────────────────────────────────────────────────────────────────────────────
     * The adversarial probe measured SAR 4,200,000 of corpus entering a distributable pool on an
     * approval that named SAR 1.00, with no SQL and a genuine second-Nazir approval: the payload
     * `approvalFingerprint` hashes carried no money field at all, and `executeCorrection`
     * re-compared only `fromReceiptClass`. `packages/api/test/av7-corpus-wall.integration.test.ts`
     * A-1 carries the full money measurement (distributable 410,000.00 → 4,190,000.00 before the
     * fix, → unchanged after). This is the same guard asserted from the FLOW's own suite, so a
     * future edit to the correction flow trips a test in the file it lives next to.
     *
     * ⚠ AND IT ASSERTS THE DIRECTION: `correctAmount` still succeeds. The owner ruled the in-place
     * amount edit legal (Q-E5-2(b)); this guard refuses the SILENT RE-SCOPING of an approval, never
     * the edit. A version of this test that only asserted the refusal would pass equally over a
     * guard that had forbidden the edit and quietly overturned the ruling.
     * ───────────────────────────────────────────────────────────────────────────────────────── */
    it('⚠ an amount edit after approval INVALIDATES the approval (SUBJECT_AMOUNT_MOVED) — and the edit itself still succeeds', async () => {
      const originalId = await freshIncomeReceipt('drift');
      const approvalId = await approvedCorrection(
        originalId,
        { toReceiptClass: 'CAPITAL', toCapitalSource: 'ISTIBDAL_PROCEEDS' },
        'drift',
      );

      // The figure is INSIDE the bytes the Nazir signed.
      const prisma = await basePrisma();
      const signed = await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: approvalId },
        select: { payload: true, payloadHash: true },
      });
      expect((signed.payload as Record<string, unknown>).fromAmountSar).toBe('500000.00');

      // POSITIVE CONTROL ON THE RULING: the edit is legal and it happens.
      const edited = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-drift-edit' }),
      ).finance.correctAmount({
        waqfId: WAQF_A,
        transactionId: originalId,
        amountSar: '9000000.00',
        reasonAr: 'تصحيح المبلغ بعد مراجعة كشف الحساب (بيانات وهمية)',
      });
      expect(edited.amountBefore).toBe('500000.00');
      expect(edited.amountAfter).toBe('9000000.00');

      // THE REFUSAL, on the guard's own machine reason, naming BOTH figures.
      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'corr-drift-exec' }),
        ).finance.receiptClass.executeCorrection({
          waqfId: WAQF_A,
          approvalRequestId: approvalId,
        }),
      ).rejects.toThrow(
        /SUBJECT_AMOUNT_MOVED[\s\S]*reading SAR 500000\.00; the row now reads SAR 9000000\.00/,
      );

      // Nothing was written, and the approval was not spent.
      const collateral = await prisma.transaction.findMany({
        where: { OR: [{ reversalOfId: originalId }, { correctionOfId: originalId }] },
        select: { id: true },
      });
      expect(collateral).toEqual([]);
      const unspent = await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: approvalId },
        select: { status: true, payloadHash: true },
      });
      expect(unspent.status).toBe('APPROVED');
      expect(unspent.payloadHash).toBe(signed.payloadHash);

      // POSITIVE CONTROL: restore the figure the approval names and the SAME approval executes.
      await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-drift-restore' }),
      ).finance.correctAmount({
        waqfId: WAQF_A,
        transactionId: originalId,
        amountSar: '500000.00',
        reasonAr: 'إرجاع المبلغ إلى ما وافق عليه الناظر (بيانات وهمية)',
      });
      const done = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-drift-exec-ok' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: approvalId,
      });
      expect(done.toReceiptClass).toBe('CAPITAL');
      const reentry = await prisma.transaction.findUniqueOrThrow({
        where: { id: done.reentryTransactionId },
        select: { receiptClass: true, amountSar: true },
      });
      expect(reentry.receiptClass).toBe('CAPITAL');
      expect(reentry.amountSar.toString()).toBe('500000');
    });

    it('⚠ the reconciliation EXCLUDES a reversed original and its reversal — the pair nets by exclusion', async () => {
      // Without this, a corrected receipt and the two rows that cancel each other would all appear,
      // i.e. the money twice, and the account would never reconcile again.
      const originalId = await freshIncomeReceipt('excl');
      const approvalId = await approvedCorrection(
        originalId,
        { toReceiptClass: 'CAPITAL', toCapitalSource: 'SALE_PROCEEDS' },
        'excl',
      );
      const done = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'corr-exec-excl' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: approvalId,
      });

      const result = await reconcileWith(AGREEING_STATEMENT, { requestId: 'rec-after-correction' });
      const reported = new Set(
        result.exceptions.map((e) => e.ledgerEntryId).filter((id): id is string => id !== null),
      );
      expect(reported.has(originalId)).toBe(false);
      expect(reported.has(done.reversalTransactionId)).toBe(false);
      // The RE-ENTRY is live and does appear — it is the receipt now.
      expect(reported.has(done.reentryTransactionId)).toBe(true);
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * OQ-06 tail — the maintenance-reserve policy has its OWN permission (owner, 2026-08-18)
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('maintenance-reserve policy (OQ-06 tail)', () => {
    it('⚠ the FINANCE seat cannot record it — reserving yield is a trustee judgement, not bookkeeping', async () => {
      // The seat that books every receipt on this endowment is refused. If this ever passes, the
      // dedicated verb has leaked into the finance preset and the ruling has been undone.
      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'mrp-finance' }),
        ).finance.maintenanceReservePolicy.set({
          waqfId: WAQF_A,
          ratePercent: '5',
          reasonAr: 'تقدير الناظر (بيانات وهمية)',
        }),
      ).rejects.toThrow();
    });

    it('the NAZIR records it, and the figure comes back carrying its unverified marker', async () => {
      const result = await createCaller(
        await contextFor({ userId: NAZIR, requestId: 'mrp-set' }),
      ).finance.maintenanceReservePolicy.set({
        waqfId: WAQF_A,
        ratePercent: '7.5',
        reasonAr: 'مصعد ومكيفات المبنى تحتاج صيانة دورية (بيانات وهمية)',
      });

      expect(result.ratePercent).toBe('7.5');
      // ⚠ The DISCRETION is the owner's ruling; the FIGURE is a number nobody has confirmed
      // against primary law, and the response cannot be rendered without saying so.
      expect(result.unverified).toBe(true);

      const read = await createCaller(
        await contextFor({ userId: NAZIR, requestId: 'mrp-get' }),
      ).finance.maintenanceReservePolicy.get({ waqfId: WAQF_A });
      expect(read.ratePercent).toBe('7.5');
      expect(read.recorded).toBe(true);
    });

    it('⚠ a RECORDED zero is not the same as no policy — the read distinguishes them', async () => {
      // The whole of OQ-06 in one assertion. `'0'` is the Nazir choosing to reserve nothing;
      // an absent row is nobody having decided, and the engine raises a flag for the second.
      await createCaller(
        await contextFor({ userId: NAZIR, requestId: 'mrp-zero' }),
      ).finance.maintenanceReservePolicy.set({
        waqfId: WAQF_A,
        ratePercent: '0',
        reasonAr: 'المبنى جديد ولا يحتاج احتياطي هذه الفترة (بيانات وهمية)',
      });

      const read = await createCaller(
        await contextFor({ userId: NAZIR, requestId: 'mrp-zero-get' }),
      ).finance.maintenanceReservePolicy.get({ waqfId: WAQF_A });
      expect(read.ratePercent).toBe('0');
      expect(read.recorded).toBe(true);
    });

    it('refuses a rate that is not a rate — validated by the DOMAIN registry, not a local regex', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: NAZIR, requestId: 'mrp-bad' }),
        ).finance.maintenanceReservePolicy.set({
          waqfId: WAQF_A,
          ratePercent: '150',
          reasonAr: 'نسبة غير صالحة (بيانات وهمية)',
        }),
      ).rejects.toThrow();
    });

    it('refuses an English-only reason — the record is Arabic-authoritative', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: NAZIR, requestId: 'mrp-english' }),
        ).finance.maintenanceReservePolicy.set({
          waqfId: WAQF_A,
          ratePercent: '5',
          reasonAr: 'Lift needs servicing',
        }),
      ).rejects.toThrow(/Arabic-authoritative/);
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * Q-E5-2(b) — amountSar corrects IN PLACE, with an audit event
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('amount correction (owner ruling Q-E5-2(b))', () => {
    it('⚠ edits IN PLACE and records before/after — deliberately NOT the superseding shape', async () => {
      const created = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'amt-seed' }),
      ).finance.recordRevenue({
        waqfId: WAQF_A,
        bankAccountId: ACCOUNT_A,
        amountSar: '1000.00',
        date: '2026-06-01T00:00:00.000Z',
        dateHijri: '1447-12-15',
        descriptionAr: 'إيجار بمبلغ خاطئ (بيانات وهمية)',
        category: 'rent',
        receiptClass: 'INCOME',
      });

      const before = await countAuditEvents({
        action: 'UPDATE',
        entityId: created.transactionId,
      });

      const result = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'amt-fix' }),
      ).finance.correctAmount({
        waqfId: WAQF_A,
        transactionId: created.transactionId,
        amountSar: '1100.00',
        reasonAr: 'خطأ إدخال: كشف الحساب يقول ١١٠٠ (بيانات وهمية)',
      });

      expect(result.amountBefore).toBe('1000.00');
      expect(result.amountAfter).toBe('1100.00');
      expect(result.shape).toBe('IN_PLACE_EDIT');

      // The row itself moved — that is the ruling, and it is what makes the audit event the record.
      const prisma = await basePrisma();
      const row = await prisma.transaction.findUnique({
        where: { id: created.transactionId },
        select: { amountSar: true },
      });
      expect(String(row?.amountSar)).toBe('1100');

      // And there is an audit event for it. An in-place money edit with no event would be the
      // rev-004 defect wearing a ruling's name.
      expect(
        await countAuditEvents({ action: 'UPDATE', entityId: created.transactionId }),
      ).toBeGreaterThan(before);
    });

    it('refuses an unchanged amount', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'amt-noop' }),
        ).finance.correctAmount({
          waqfId: WAQF_A,
          transactionId: REV_001,
          amountSar: '350000.00',
          reasonAr: 'لا تغيير (بيانات وهمية)',
        }),
      ).rejects.toThrow(/AMOUNT_UNCHANGED/);
    });

    it("refuses to correct a REVERSAL's amount — it mirrors by construction", async () => {
      const created = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'amt-rev-seed' }),
      ).finance.recordRevenue({
        waqfId: WAQF_A,
        bankAccountId: ACCOUNT_A,
        amountSar: '777.00',
        date: '2026-06-01T00:00:00.000Z',
        dateHijri: '1447-12-15',
        descriptionAr: 'مقبوض (بيانات وهمية)',
        category: 'rent',
        receiptClass: 'INCOME',
      });
      const raised = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'amt-rev-req' }),
      ).finance.receiptClass.requestCorrection({
        waqfId: WAQF_A,
        transactionId: created.transactionId,
        toReceiptClass: 'CAPITAL',
        toCapitalSource: 'SALE_PROCEEDS',
        reasonAr: 'تصحيح (بيانات وهمية)',
      });
      // ⊕ S12-2: the chain is recorded by STAFF before the Nazir may sign (migration 51).
      await recordReservedMatterChain(
        createCaller(await contextFor({ userId: STAFF, requestId: 'amt-rev-chain' })),
        { waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId },
      );
      await createCaller(
        await contextFor({ userId: NAZIR, requestId: 'amt-rev-app' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId });
      const done = await createCaller(
        await contextFor({ userId: MAKER, requestId: 'amt-rev-exec' }),
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF_A,
        approvalRequestId: raised.approvalRequestId,
      });

      await expect(
        createCaller(
          await contextFor({ userId: MAKER, requestId: 'amt-rev-fix' }),
        ).finance.correctAmount({
          waqfId: WAQF_A,
          transactionId: done.reversalTransactionId,
          amountSar: '1.00',
          reasonAr: 'محاولة تعديل قيد عكسي (بيانات وهمية)',
        }),
      ).rejects.toThrow(/AMOUNT_ON_REVERSAL/);
    });

    it('⚠ and it still cannot touch the CLASS — the two rulings do not bleed into each other', async () => {
      // Q-E5-2(b) opened `amountSar` in place. It opened nothing else, and the corpus guard is what
      // proves that rather than this procedure's own input schema.
      const prisma = await basePrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "transaction" SET "receiptClass" = 'INCOME', "capitalSource" = NULL WHERE "id" = 'rev-004'`,
        ),
      ).rejects.toThrow(/may not be reclassified IN PLACE/);
    });
  });
});
