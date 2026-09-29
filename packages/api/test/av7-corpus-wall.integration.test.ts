/**
 * AV7 — ADVERSARIAL PROBE · LENS: get corpus (asl / أصل) into a distribution, or get income
 * wrongly blocked out of one.  ⚠ THIS FILE ATTACKS — and since 2026-08-19 it is ALSO the regression
 * suite for the breaches that have been closed. Both roles, in one file, deliberately: the exploit's
 * own shape is the regression test, so a closed finding is INVERTED IN PLACE and never deleted.
 *
 * Every negative below is paired with a POSITIVE CONTROL in the same test, and every refusal is
 * asserted on the GUARD'S OWN MESSAGE (constraint/trigger name or the procedure's own machine
 * reason), never on a bare rejection.
 *
 * ── WHICH TESTS ARE WHICH, AS OF 2026-08-19 ───────────────────────────────────────────────────
 *   INVERTED — the exploit is CLOSED and these now assert the refusal:
 *     · A-1  (AV7-F1) an approved receipt-class correction no longer rides an amount edit
 *     · A-1b (AV7-F1, siblings) the same guard's DATE and CAPITAL-SOURCE arms, driven by raw SQL
 *     · A-6 + A-11 (AV7-F4, closed 2026-08-20) retiring a committed ledger row is a RESERVED
 *       MATTER at the database (migration 25), and a row retired WITH an approval is SEEN by the
 *       run and refused by name instead of vanishing from the corpus accounting
 *     · A-10 (AV7-F2, closed 2026-08-20) the SECOND payment over one receipt is refused 23P01 by
 *       `distribution_paid_periods_disjoint` (migration 26) and posts NOTHING, while the first
 *       run still pays its 410,000.00 in full
 *
 *   STILL ATTACKING — these are GREEN BECAUSE THE EXPLOIT STILL WORKS. Do not "fix" a green here by
 *   editing the assertion; the fix is in the named source file, and inverting these is part of it:
 *     · A-2a/A-2b (AV7-F6/F5) · A-3 (AV7-E) · A-8 (AV7-F8, scope) · A-9 · A-12 (AV7-F7)
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
  databaseModule,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
  warnNoDatabase,
  type TestSubjectSpec,
  recordReservedMatterChain,
} from './setup.js';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AV7 corpus-wall adversarial probe');

const createCaller = createCallerFactory(appRouter);
const WAQF = 'waqf-001';
const ACCOUNT = 'bankacct-fake-acct-w1';
const NOW = new Date('2026-08-18T09:00:00.000Z');

const MAKER = `${API_TEST_PREFIX}av7-maker`;
const NAZIR = `${API_TEST_PREFIX}av7-nazir`;
/**
 * ⊕ S12-2 · the STAFF seat that records the BR-1102 chain (owner ruling 2026-09-08, "staff"). The
 * Nazir seat above holds NO `legal:reserved_matter:write` — deliberately, it is the approver — so a
 * compliance officer records the letters before every receipt-class correction is signed.
 */
const STAFF = `${API_TEST_PREFIX}av7-staff`;
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

const MAKER_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
  'finance:bank_account:read',
  'distribution:bank_movement:initiate',
  'distribution:run:read',
  'distribution:run:write',
  'distribution:run:initiate',
  'distribution:line_item:read',
  'distribution:line_item:write',
  'approval:request:read',
  'approval:request:initiate',
];
const NAZIR_PERMISSIONS = [
  'finance:transaction:read',
  'legal:reserved_matter:read',
  'legal:reserved_matter:approve',
  'distribution:run:read',
  'distribution:line_item:read',
  'approval:request:read',
  'approval:request:approve',
];

function subjects(): TestSubjectSpec[] {
  return [
    { id: MAKER, role: 'FINANCE', waqfIds: [WAQF], permissions: MAKER_PERMISSIONS },
    { id: NAZIR, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
    { id: STAFF, role: 'COMPLIANCE_OFFICER', waqfIds: [WAQF], permissions: STAFF_PERMISSIONS },
  ];
}

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId, now: NOW }));

/** Halalas from a 2-dp decimal string, so every identity below is integer arithmetic. */
const halalas = (decimal: string): bigint => BigInt(decimal.replace('.', ''));

/** The probe's own receipts, so nothing seeded is spent. */
const AV7_MARKER = '(بيانات وهمية)';

/**
 * A-6's retirement approval. Prefixed so `purgeProbeLedger()` can take it away again.
 *
 * ⚠ HAND-MINTED BY RAW SQL, AND THAT IS THE HONEST SHAPE RATHER THAN A SHORTCUT: **there is no
 * soft-delete PROCEDURE in this system** (measured — `softDelete()` in
 * `packages/database/src/extensions/audit.ts` is exported with zero production callers, and no
 * router writes `transaction.deletedAt`), so there is no `requestRetirement` to call and no
 * `ReservedMatterKind` naming the act. Migration 25's header records both as owed to whoever builds
 * that procedure. What this row exercises is exactly what the trigger verifies: migration 4's eight
 * conditions over `type = RESERVED_MATTER`, `status = APPROVED`, this endowment, `checkerId`
 * non-null and <> `makerId`, and `subjectId` = THIS artifact.
 */
const F4_APPROVAL = 'appr-av7-f4-retire';

/** `user-accountant-001` is FINANCE on waqf-001; `user-approver-001` is NAZIR on it (measured). */
const F4_MAKER = 'user-accountant-001';
const F4_CHECKER = 'user-approver-001';

async function recordReceipt(args: {
  readonly tag: string;
  readonly amountSar: string;
  readonly date: string;
  readonly dateHijri: string;
  readonly receiptClass: 'INCOME' | 'CAPITAL';
  readonly capitalSource?: 'ISTIBDAL_PROCEEDS' | null;
}): Promise<string> {
  const created = await (
    await callerFor(MAKER, `av7-rec-${args.tag}`)
  ).finance.recordRevenue({
    waqfId: WAQF,
    bankAccountId: ACCOUNT,
    amountSar: args.amountSar,
    date: args.date,
    dateHijri: args.dateHijri,
    descriptionAr: `إيصال اختبار عدائي ${AV7_MARKER}`,
    category: args.receiptClass === 'INCOME' ? 'rent' : 'istibdal_proceeds',
    receiptClass: args.receiptClass,
    capitalSource: (args.capitalSource ?? null) as never,
  });
  return created.transactionId;
}

describe.runIf(hasDatabase)('AV7 · the corpus wall, attacked', () => {
  /**
   * ⚠ IDEMPOTENCE: every receipt this probe writes is HARD-DELETED before and after the run, with
   * `transaction_no_delete` suspended for exactly that prefix-scoped statement (the pattern
   * `distribution-run.integration.test.ts` already uses for its two tables). Without it a second
   * pass over one cluster measures the FIRST pass's rows and every figure below becomes a
   * coincidence — which is the failure mode this repo has a name for.
   */
  async function purgeProbeLedger(): Promise<void> {
    const owner = await privilegedPrisma();
    await owner.$executeRawUnsafe(`
      DO $av7$
      BEGIN
        ALTER TABLE "distribution_line_item" DISABLE TRIGGER distribution_line_item_no_delete;
        DELETE FROM "distribution_line_item" WHERE "createdBy" LIKE 'user-test-api-av7-%';
        ALTER TABLE "distribution_line_item" ENABLE ALWAYS TRIGGER distribution_line_item_no_delete;
        ALTER TABLE "distribution" DISABLE TRIGGER distribution_no_delete;
        DELETE FROM "distribution" WHERE "createdBy" LIKE 'user-test-api-av7-%';
        ALTER TABLE "distribution" ENABLE ALWAYS TRIGGER distribution_no_delete;
        ALTER TABLE "transaction" DISABLE TRIGGER transaction_no_delete;
        DELETE FROM "transaction" WHERE "createdBy" LIKE 'user-test-api-av7-%';
        ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_no_delete;
        DELETE FROM "approval_request" WHERE "id" LIKE 'appr-av7-f4-%';
      END
      $av7$;
    `);
  }

  /**
   * A-6's step 3 — a GENUINE reserved matter naming `transaction:<id>:deletedAt`.
   *
   * ⚠ `approval_request_no_delete` refuses a DELETE on any row THE AUDIT TRAIL RECORDS. This row is
   * written by raw SQL, so no `audit_event` names it and `purgeProbeLedger()` can remove it — the
   * same property that keeps this file's other scaffolding purgeable. It is also why this must NOT
   * become a `mintApprovalRequest()` call: that path audits, and the row would then be undeletable
   * and would leak into the next file.
   */
  async function mintRetirementApproval(id: string, transactionId: string): Promise<void> {
    const owner = await privilegedPrisma();
    await owner.$executeRawUnsafe(
      `INSERT INTO "approval_request"
         ("id","waqfId","type","status","makerId","checkerId","subjectId","payloadHash","payload",
          "decidedAt","createdAt","updatedAt","deletedAt")
       VALUES ($1, $2, 'RESERVED_MATTER'::"ApprovalType", 'APPROVED'::"ApprovalStatus", $3, $4, $5,
               $6, $7::jsonb, now(), now(), now(), NULL)`,
      id,
      WAQF,
      F4_MAKER,
      F4_CHECKER,
      `transaction:${transactionId}:deletedAt`,
      'f'.repeat(64),
      JSON.stringify({ probe: 'AV7-F4', subject: `transaction:${transactionId}:deletedAt` }),
    );
  }

  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());
    await purgeProbeLedger();
  });

  afterAll(async () => {
    await purgeProbeLedger();
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * PC-0 · POSITIVE CONTROL — the wall, working, on the seeded Q1 register
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('PC-0 · baseline: rev-005 (CAPITAL 4,200,000) is EXCLUDED and VISIBLE, and every halala closes', async () => {
    const answer = await (
      await callerFor(MAKER, 'av7-pc0')
    ).distribution.preview({ waqfId: WAQF, periodStart: '2026-01-02', periodEnd: '2026-03-31' });
    expect(answer.status).toBe('computed');
    if (answer.status !== 'computed') throw new Error('unreachable');
    const run = answer.run;
    console.log('AV7 PC-0 waterfall:', JSON.stringify(run.waterfall));
    console.log('AV7 PC-0 totals:', JSON.stringify(run.totals));
    console.log('AV7 PC-0 excludedCapitalReceipts:', JSON.stringify(run.excludedCapitalReceipts));
    expect(run.waterfall.capitalReceiptsSar).toBe('4200000.00');
    expect(run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    // THE CLOSING IDENTITY, as integer halalas.
    expect(
      halalas(run.waterfall.maintenanceReserveSar) +
        halalas(run.waterfall.operatingSar) +
        halalas(run.waterfall.nazirFeeSar) +
        halalas(run.totals.paidSar) +
        halalas(run.totals.withheldSar) +
        halalas(run.totals.crossBorderSar) +
        halalas(run.totals.retainedSar) +
        halalas(run.totals.residualSar),
    ).toBe(halalas(run.waterfall.revenueSar));
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-1 · ✅ INVERTED (AV7-F1 CLOSED, 2026-08-19) — THE APPROVAL NOW BINDS THE AMOUNT
   *
   * ── WHAT THIS TEST USED TO PROVE, measured on this cluster before the fix ─────────────────
   * `requestCorrection`'s payload named the transaction and the FROM/TO classes and NOTHING about
   * the magnitude — measured payload keys were exactly
   *   ["fromCapitalSource","fromReceiptClass","reasonAr","targetAccount","toCapitalSource",
   *    "toCapitalSourceNoteAr","toReceiptClass","transactionId"]
   * — and `executeCorrection` re-checked only `fromReceiptClass`. So: approve a correction on a
   * SAR 1.00 CAPITAL row → `finance.correctAmount` it to 4,200,000.00 (maker-only, un-approved,
   * owner-ruled legal) → execute the SAME approval. Measured result, no SQL anywhere:
   *   BEFORE  revenue 500000.00 · capital 1.00       · distributable 410000.00  [flag raised]
   *   AFTER   revenue 4700000.00 · capital 0.00      · distributable 4190000.00 [flag ABSENT]
   *   distributable delta 378,000,000 halalas, `excludedCapitalReceipts` empty, and the approval's
   *   `payloadHash` unchanged and status EXECUTED — so nothing looked wrong.
   *
   * ── WHAT IT PROVES NOW ────────────────────────────────────────────────────────────────────
   * `correctionSubjectFacts` puts `fromAmountSar` and `fromDate` INTO the bytes the Nazir signs, and
   * `executeCorrection` re-compares all four pinned facts. The drifted approval is refused by name.
   *
   * ⚠ AND THE REFUSAL POINTS AT THE DRIFT, NOT AT THE EDIT — asserted below in both directions:
   * `correctAmount` STILL SUCCEEDS (the owner ruled it legal, Q-E5-2(b)), and restoring the figure
   * the approval names lets the very same approval execute. A guard that had forbidden the edit
   * would have quietly overturned a ruling; this one refuses only the re-scoping.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-1 · ✅ an approval naming SAR 1.00 REFUSES the 4,200,000.00 row as SUBJECT_AMOUNT_MOVED — and still executes once the figure is restored', async () => {
    const P1 = { periodStart: '2026-09-01', periodEnd: '2026-09-30' } as const;
    const incomeDate = '2026-09-10T00:00:00.000Z';
    const capitalDate = '2026-09-11T00:00:00.000Z';

    const incomeId = await recordReceipt({
      tag: 'a1-income',
      amountSar: '500000.00',
      date: incomeDate,
      dateHijri: toHijriSnapshot(new Date(incomeDate)),
      receiptClass: 'INCOME',
    });
    const capitalId = await recordReceipt({
      tag: 'a1-capital',
      amountSar: '1.00',
      date: capitalDate,
      dateHijri: toHijriSnapshot(new Date(capitalDate)),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });
    console.log('A-1 receipts:', JSON.stringify({ incomeId, capitalId }));

    /* ── POSITIVE CONTROL: the wall holds on this period before the attack ───────────────── */
    const before = await (
      await callerFor(MAKER, 'av7-a1-pc')
    ).distribution.preview({ waqfId: WAQF, ...P1 });
    if (before.status !== 'computed') throw new Error(`PC refused: ${JSON.stringify(before)}`);
    console.log('A-1 BEFORE waterfall:', JSON.stringify(before.run.waterfall));
    expect(before.run.waterfall.revenueSar).toBe('500000.00');
    expect(before.run.waterfall.capitalReceiptsSar).toBe('1.00');
    expect(before.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');

    /* ── 1 · the maker raises the reclassification, the Nazir approves it ────────────────── */
    const raised = await (
      await callerFor(MAKER, 'av7-a1-request')
    ).finance.receiptClass.requestCorrection({
      waqfId: WAQF,
      transactionId: capitalId,
      toReceiptClass: 'INCOME',
      toCapitalSource: null,
      reasonAr: `تصحيح تصنيف: المبلغ غلة وليس حصيلة استبدال ${AV7_MARKER}`,
    });
    const prisma = await basePrisma();
    const pending = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: raised.approvalRequestId },
      select: { payload: true, payloadHash: true, reservedMatterKind: true },
    });
    console.log('A-1 approval payload (what the Nazir signs):', JSON.stringify(pending.payload));
    // ⚠ THE FIX, STATED AS AN ASSERTION: the artifact now names the money AND the date, and names
    // them with the FIGURE THE APPROVER SAW. `not.toContain('amountSar')` was the old assertion and
    // it would STILL PASS against `fromAmountSar` — so the inversion asserts the key positively,
    // by its real name, and asserts its VALUE. A key-absence test is not the mirror of a
    // key-presence test.
    const payloadKeys = Object.keys(pending.payload as Record<string, unknown>).sort();
    console.log('A-1 payload keys:', JSON.stringify(payloadKeys));
    expect(payloadKeys).toContain('fromAmountSar');
    expect(payloadKeys).toContain('fromDate');
    const signedPayload = pending.payload as Record<string, unknown>;
    expect(signedPayload.fromAmountSar).toBe('1.00');
    expect(signedPayload.fromDate).toBe(capitalDate);
    // The response says the same thing, so a UI cannot render the reclassification without its figure.
    expect(raised.fromAmountSar).toBe('1.00');
    expect(raised.fromDate).toBe(capitalDate);

    // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
    await recordReservedMatterChain(await callerFor(STAFF, 'av7-a1-approve-chain'), {
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });
    await (
      await callerFor(NAZIR, 'av7-a1-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });

    /* ── 2 · THE EDIT STILL SUCCEEDS. This is half the fix, and it is asserted, not assumed ─
     * The product owner ruled the in-place amount edit legal and audited (Q-E5-2(b)). A "fix" that
     * refused it here would have re-answered a question the owner answered — so the assertion below
     * is a POSITIVE CONTROL ON THE RULING, not a step in an attack. */
    const edited = await (
      await callerFor(MAKER, 'av7-a1-inflate')
    ).finance.correctAmount({
      waqfId: WAQF,
      transactionId: capitalId,
      amountSar: '4200000.00',
      reasonAr: `تصحيح المبلغ ${AV7_MARKER}`,
    });
    console.log('A-1 correctAmount (STILL LEGAL):', JSON.stringify(edited));
    expect(edited.amountBefore).toBe('1.00');
    expect(edited.amountAfter).toBe('4200000.00');

    /* ── 3 · THE REFUSAL · the drifted approval no longer executes, and the message NAMES BOTH
     *        FIGURES rather than merely rejecting ────────────────────────────────────────── */
    let refusal: unknown = null;
    try {
      await (
        await callerFor(MAKER, 'av7-a1-execute')
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF,
        approvalRequestId: raised.approvalRequestId,
      });
    } catch (error) {
      refusal = error;
    }
    console.log('A-1 executeCorrection REFUSED:', String(refusal).slice(0, 700));
    expect(refusal).not.toBeNull();
    expect(String(refusal)).toMatch(/RECEIPT_CORRECTION_NOT_AUTHORISED[\s\S]*SUBJECT_AMOUNT_MOVED/);
    // The guard's own sentence, carrying the approved figure AND the current one.
    expect(String(refusal)).toMatch(/reading SAR 1\.00; the row now reads SAR 4200000\.00/);
    // ⚠ AND IT DOES NOT READ AS A BAN ON THE EDIT — the remedy is in the message.
    expect(String(refusal)).toMatch(/The amount edit itself is legal and audited/);

    /* ── 4 · NOTHING WAS WRITTEN, and the approval is still unspent ──────────────────────── */
    const collateral = await prisma.transaction.findMany({
      where: { OR: [{ reversalOfId: capitalId }, { correctionOfId: capitalId }] },
      select: { id: true, receiptClass: true },
    });
    console.log('A-1 rows written by the refused execute:', JSON.stringify(collateral));
    expect(collateral).toEqual([]);
    const unspent = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: raised.approvalRequestId },
      select: { status: true, payloadHash: true },
    });
    console.log('A-1 approval after the refusal:', JSON.stringify(unspent));
    expect(unspent.status).toBe('APPROVED');
    expect(unspent.payloadHash).toBe(pending.payloadHash);

    /* ── 5 · THE MONEY DID NOT CROSS THE WALL, and the corpus is LOUD not silent ─────────── */
    const after = await (
      await callerFor(MAKER, 'av7-a1-after')
    ).distribution.preview({ waqfId: WAQF, ...P1 });
    if (after.status !== 'computed')
      throw new Error(`post-attack refused: ${JSON.stringify(after)}`);
    console.log('A-1 AFTER waterfall:', JSON.stringify(after.run.waterfall));
    console.log('A-1 AFTER flags:', JSON.stringify(after.run.flags));
    console.log(
      'A-1 AFTER excludedCapitalReceipts:',
      JSON.stringify(after.run.excludedCapitalReceipts),
    );
    expect(after.run.waterfall.revenueSar).toBe('500000.00');
    // ⚠ The corpus is now 4,200,000.00 — the row really was enlarged, and the run SAYS SO. That is
    // the shape the whole wall exists for: bigger corpus, still corpus, still named.
    expect(after.run.waterfall.capitalReceiptsSar).toBe('4200000.00');
    expect(after.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(after.run.excludedCapitalReceipts.map((r) => r.transactionId)).toContain(capitalId);
    const delta =
      halalas(after.run.waterfall.distributableSar) -
      halalas(before.run.waterfall.distributableSar);
    console.log('A-1 distributable delta (halalas):', delta.toString());
    // ⚠ WAS 378,000,000 BEFORE THE FIX. The pool did not move by one halala.
    expect(delta).toBe(0n);

    /* ── 6 · THE CONSEQUENCE, MEASURED RATHER THAN GUESSED: while the drifted approval is still
     *        APPROVED it holds the subject's one-open slot, so a FRESH correction is refused.
     *        Recoverable (step 7), but it is a real cost and it is recorded, not hidden. There is
     *        no `approval.void` / `approval.reject` procedure in `appRouter` — measured by grep —
     *        so the only remedy today is step 7. Reported to the orchestrator as owed. ───────── */
    let secondRaise: unknown = null;
    try {
      await (
        await callerFor(MAKER, 'av7-a1-reraise')
      ).finance.receiptClass.requestCorrection({
        waqfId: WAQF,
        transactionId: capitalId,
        toReceiptClass: 'INCOME',
        toCapitalSource: null,
        reasonAr: `إعادة طلب التصحيح على المبلغ الجديد ${AV7_MARKER}`,
      });
    } catch (error) {
      secondRaise = error;
    }
    console.log(
      'A-1 fresh correction while the stale one lives:',
      String(secondRaise).slice(0, 300),
    );
    expect(String(secondRaise)).toMatch(/ALREADY_OPEN[\s\S]*already APPROVED/);

    /* ── 7 · POSITIVE CONTROL · RESTORE THE FIGURE THE APPROVAL NAMES → THE SAME APPROVAL
     *        EXECUTES. This is what proves the guard is a DRIFT check and not a block: without it a
     *        green step 3 could equally mean `executeCorrection` is broken for everyone. ─────── */
    const restored = await (
      await callerFor(MAKER, 'av7-a1-restore')
    ).finance.correctAmount({
      waqfId: WAQF,
      transactionId: capitalId,
      amountSar: '1.00',
      reasonAr: `إرجاع المبلغ إلى ما وافق عليه الناظر ${AV7_MARKER}`,
    });
    console.log('A-1 restore:', JSON.stringify(restored));
    const executed = await (
      await callerFor(MAKER, 'av7-a1-execute-ok')
    ).finance.receiptClass.executeCorrection({
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });
    console.log('A-1 executeCorrection ACCEPTED after restore:', JSON.stringify(executed));
    const reentry = await prisma.transaction.findUniqueOrThrow({
      where: { id: executed.reentryTransactionId },
      select: { receiptClass: true, amountSar: true, capitalSource: true },
    });
    console.log(
      'A-1 re-entry row:',
      JSON.stringify({ ...reentry, amountSar: reentry.amountSar.toString() }),
    );
    expect(reentry.receiptClass).toBe('INCOME');
    // ⚠ SAR 1.00 — exactly what the Nazir authorised, and not one halala more.
    expect(reentry.amountSar.toString()).toBe('1');
    const settled = await (
      await callerFor(MAKER, 'av7-a1-settled')
    ).distribution.preview({ waqfId: WAQF, ...P1 });
    if (settled.status !== 'computed') throw new Error(`refused: ${JSON.stringify(settled)}`);
    console.log('A-1 SETTLED waterfall:', JSON.stringify(settled.run.waterfall));
    expect(settled.run.waterfall.revenueSar).toBe('500001.00');
    expect(settled.run.waterfall.capitalReceiptsSar).toBe('0.00');
    void incomeId;
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-1b · ✅ THE OTHER TWO ARMS OF THE SAME GUARD, DRIVEN RATHER THAN CLAIMED
   *
   * `executeCorrection` pins FOUR facts about the subject row, and a table with three live arms and
   * one dead one is the shape this repo has been burned by. Neither `date` nor a CAPITAL→CAPITAL
   * `capitalSource` change has a trigger — migration 19 §4 refuses CAPITAL → not-CAPITAL and nothing
   * narrower, and `transaction_endowment_immutable` covers only waqfId/bankAccountId — so both are
   * raw-SQL reachable and both are driven here on the runtime credential.
   *
   * ⚠ NO API PROCEDURE MOVES EITHER COLUMN TODAY. That is stated rather than implied: this test
   * measures that the guard covers a route, not that a route exists.
   *
   * ⚠ DATES ARE IN 2028, DELIBERATELY, and the reason is a defect this test caused on its first
   * run: it was written against October 2026, which is A-2b's own preview window, and its 300,000
   * CAPITAL subject re-dated to November silently changed A-2b's waterfall and turned that test
   * red. Every test in this file shares ONE endowment's ledger, so a period is a resource — this
   * one previews nothing and therefore only needs dates that no OTHER window contains.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-1b · ✅ a re-dated row is SUBJECT_DATE_MOVED and a substituted capitalSource is SUBJECT_CAPITAL_SOURCE_MOVED; an untouched row still executes', async () => {
    const app = await basePrisma();
    const prisma = app;

    /* (a) THE DATE ARM. The date decides which period's waterfall a receipt lands in (A-9). */
    const dateSubject = await recordReceipt({
      tag: 'a1b-date',
      amountSar: '300000.00',
      date: '2028-02-05T00:00:00.000Z',
      dateHijri: toHijriSnapshot(new Date('2028-02-05T00:00:00.000Z')),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });
    const dateApproval = await (
      await callerFor(MAKER, 'av7-a1b-date-req')
    ).finance.receiptClass.requestCorrection({
      waqfId: WAQF,
      transactionId: dateSubject,
      toReceiptClass: 'INCOME',
      toCapitalSource: null,
      reasonAr: `تصحيح تصنيف ${AV7_MARKER}`,
    });
    // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
    await recordReservedMatterChain(await callerFor(STAFF, 'av7-a1b-date-app-chain'), {
      waqfId: WAQF,
      approvalRequestId: dateApproval.approvalRequestId,
    });
    await (
      await callerFor(NAZIR, 'av7-a1b-date-app')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: dateApproval.approvalRequestId });
    const moved = await app.$executeRawUnsafe(
      `UPDATE "transaction" SET "date" = '2028-03-05T00:00:00.000Z' WHERE "id" = $1`,
      dateSubject,
    );
    console.log('A-1b date shift as qmulate_app: rows', moved);
    expect(moved).toBe(1);
    let dateRefusal: unknown = null;
    try {
      await (
        await callerFor(MAKER, 'av7-a1b-date-exec')
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF,
        approvalRequestId: dateApproval.approvalRequestId,
      });
    } catch (error) {
      dateRefusal = error;
    }
    console.log('A-1b date refusal:', String(dateRefusal).slice(0, 520));
    expect(String(dateRefusal)).toMatch(
      /RECEIPT_CORRECTION_NOT_AUTHORISED[\s\S]*SUBJECT_DATE_MOVED[\s\S]*2028-02-05T00:00:00\.000Z[\s\S]*2028-03-05T00:00:00\.000Z/,
    );

    /* (b) THE CAPITAL-SOURCE ARM. Istibdal proceeds and sale proceeds are not interchangeable. */
    const sourceSubject = await recordReceipt({
      tag: 'a1b-source',
      amountSar: '250000.00',
      date: '2028-02-06T00:00:00.000Z',
      dateHijri: toHijriSnapshot(new Date('2028-02-06T00:00:00.000Z')),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });
    const sourceApproval = await (
      await callerFor(MAKER, 'av7-a1b-src-req')
    ).finance.receiptClass.requestCorrection({
      waqfId: WAQF,
      transactionId: sourceSubject,
      toReceiptClass: 'INCOME',
      toCapitalSource: null,
      reasonAr: `تصحيح تصنيف ${AV7_MARKER}`,
    });
    // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
    await recordReservedMatterChain(await callerFor(STAFF, 'av7-a1b-src-app-chain'), {
      waqfId: WAQF,
      approvalRequestId: sourceApproval.approvalRequestId,
    });
    await (
      await callerFor(NAZIR, 'av7-a1b-src-app')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: sourceApproval.approvalRequestId });
    const swapped = await app.$executeRawUnsafe(
      `UPDATE "transaction" SET "capitalSource" = 'SALE_PROCEEDS' WHERE "id" = $1`,
      sourceSubject,
    );
    console.log('A-1b capitalSource swap as qmulate_app: rows', swapped);
    expect(swapped).toBe(1);
    let sourceRefusal: unknown = null;
    try {
      await (
        await callerFor(MAKER, 'av7-a1b-src-exec')
      ).finance.receiptClass.executeCorrection({
        waqfId: WAQF,
        approvalRequestId: sourceApproval.approvalRequestId,
      });
    } catch (error) {
      sourceRefusal = error;
    }
    console.log('A-1b capitalSource refusal:', String(sourceRefusal).slice(0, 520));
    expect(String(sourceRefusal)).toMatch(
      /RECEIPT_CORRECTION_NOT_AUTHORISED[\s\S]*SUBJECT_CAPITAL_SOURCE_MOVED[\s\S]*"ISTIBDAL_PROCEEDS"[\s\S]*"SALE_PROCEEDS"/,
    );

    /* (c) POSITIVE CONTROL · an untouched row executes. Four live arms, none of them a wall. */
    const clean = await recordReceipt({
      tag: 'a1b-clean',
      amountSar: '120000.00',
      date: '2028-02-07T00:00:00.000Z',
      dateHijri: toHijriSnapshot(new Date('2028-02-07T00:00:00.000Z')),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });
    const cleanApproval = await (
      await callerFor(MAKER, 'av7-a1b-clean-req')
    ).finance.receiptClass.requestCorrection({
      waqfId: WAQF,
      transactionId: clean,
      toReceiptClass: 'INCOME',
      toCapitalSource: null,
      reasonAr: `تصحيح تصنيف ${AV7_MARKER}`,
    });
    // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
    await recordReservedMatterChain(await callerFor(STAFF, 'av7-a1b-clean-app-chain'), {
      waqfId: WAQF,
      approvalRequestId: cleanApproval.approvalRequestId,
    });
    await (
      await callerFor(NAZIR, 'av7-a1b-clean-app')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: cleanApproval.approvalRequestId });
    const ok = await (
      await callerFor(MAKER, 'av7-a1b-clean-exec')
    ).finance.receiptClass.executeCorrection({
      waqfId: WAQF,
      approvalRequestId: cleanApproval.approvalRequestId,
    });
    console.log('A-1b POSITIVE CONTROL executed:', JSON.stringify(ok));
    expect(ok.toReceiptClass).toBe('INCOME');
    expect(ok.account).toBe('INC-GHALLAH');
    const cleanReentry = await prisma.transaction.findUniqueOrThrow({
      where: { id: ok.reentryTransactionId },
      select: { receiptClass: true, amountSar: true },
    });
    expect(cleanReentry.receiptClass).toBe('INCOME');
    expect(cleanReentry.amountSar.toString()).toBe('120000');
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-2a · THE MIRROR MIGRATION 20 §5 PROMISES CAN BE BROKEN AFTER THE FACT, THROUGH THE API
   *
   * `qmulate_transaction_correction_shape()` fires on the ROW BEING WRITTEN. It never re-checks a
   * pair when the ORIGINAL is amended, and `finance.correctAmount` refuses only to edit a REVERSAL
   * (`AMOUNT_ON_REVERSAL`). So the "reversal MIRRORS its original exactly" guarantee that
   * `excludeReversedPairs` cites as its licence for a single pass is defeasible by one maker call.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-2a · a reversed CAPITAL original can be inflated after its reversal — the mirror breaks, unaudited by any guard', async () => {
    const d = '2026-09-20T00:00:00.000Z';
    const originalId = await recordReceipt({
      tag: 'a2a',
      amountSar: '100.00',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });
    const raised = await (
      await callerFor(MAKER, 'av7-a2a-req')
    ).finance.receiptClass.requestCorrection({
      waqfId: WAQF,
      transactionId: originalId,
      toReceiptClass: 'INCOME',
      toCapitalSource: null,
      reasonAr: `تصحيح ${AV7_MARKER}`,
    });
    // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
    await recordReservedMatterChain(await callerFor(STAFF, 'av7-a2a-app-chain'), {
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });
    await (
      await callerFor(NAZIR, 'av7-a2a-app')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });
    const done = await (
      await callerFor(MAKER, 'av7-a2a-exec')
    ).finance.receiptClass.executeCorrection({
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });

    /* POSITIVE CONTROL: the guard DOES refuse an amount edit on the reversal row, by name. */
    await expect(
      (await callerFor(MAKER, 'av7-a2a-rev-edit')).finance.correctAmount({
        waqfId: WAQF,
        transactionId: done.reversalTransactionId,
        amountSar: '1.00',
        reasonAr: `محاولة ${AV7_MARKER}`,
      }),
    ).rejects.toThrow(/AMOUNT_ON_REVERSAL/);

    /* THE ATTACK: edit the ORIGINAL instead. Nothing refuses. */
    const edited = await (
      await callerFor(MAKER, 'av7-a2a-orig-edit')
    ).finance.correctAmount({
      waqfId: WAQF,
      transactionId: originalId,
      amountSar: '20000000.00',
      reasonAr: `تصحيح المبلغ ${AV7_MARKER}`,
    });
    console.log('A-2a correctAmount on a REVERSED original:', JSON.stringify(edited));

    const prisma = await basePrisma();
    const pair = await prisma.transaction.findMany({
      where: { id: { in: [originalId, done.reversalTransactionId, done.reentryTransactionId] } },
      select: {
        id: true,
        receiptClass: true,
        amountSar: true,
        reversalOfId: true,
        correctionOfId: true,
      },
      orderBy: { id: 'asc' },
    });
    console.log(
      'A-2a pair after the edit:',
      JSON.stringify(pair.map((r) => ({ ...r, amountSar: r.amountSar.toString() }))),
    );
    const original = pair.find((r) => r.id === originalId);
    const reversal = pair.find((r) => r.id === done.reversalTransactionId);
    // ⚠ THE PAIR NO LONGER MIRRORS: 20,000,000 of corpus "cancelled" by a 100.00 reversal.
    expect(original?.amountSar.toString()).toBe('20000000');
    expect(reversal?.amountSar.toString()).toBe('100');
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-2b · THE REVERSED-PAIR EXCLUSION IS WINDOW-SCOPED: A REVERSAL DATED OUTSIDE THE PERIOD
   *        LEAVES THE CANCELLED RECEIPT IN THE POOL — AND ITS RE-ENTRY IN CORPUS AT THE SAME TIME
   *
   * `transaction_correction_shape()` mirrors `type`/`receiptClass`/`capitalSource`/`amountSar`/
   * `bankAccountId` and NOT `date`, and `excludeReversedPairs` can only see rows inside
   * `ledgerWindowWhere`'s window. Move the reversal one day past `periodEnd` and the original is
   * never known to be reversed.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-2b · a reversal dated one day outside the period re-admits the cancelled INCOME, double-counting it against its own corpus re-entry', async () => {
    const P2 = { periodStart: '2026-10-01', periodEnd: '2026-10-31' } as const;
    const baseDate = '2026-10-05T00:00:00.000Z';
    const subjectDate = '2026-10-06T00:00:00.000Z';

    await recordReceipt({
      tag: 'a2b-base',
      amountSar: '500000.00',
      date: baseDate,
      dateHijri: toHijriSnapshot(new Date(baseDate)),
      receiptClass: 'INCOME',
    });
    const subjectId = await recordReceipt({
      tag: 'a2b-subject',
      amountSar: '300000.00',
      date: subjectDate,
      dateHijri: toHijriSnapshot(new Date(subjectDate)),
      receiptClass: 'INCOME',
    });

    // A legitimate, fully approved INCOME → CAPITAL correction: the money was istibdal proceeds.
    const raised = await (
      await callerFor(MAKER, 'av7-a2b-req')
    ).finance.receiptClass.requestCorrection({
      waqfId: WAQF,
      transactionId: subjectId,
      toReceiptClass: 'CAPITAL',
      toCapitalSource: 'ISTIBDAL_PROCEEDS',
      reasonAr: `المبلغ حصيلة استبدال ${AV7_MARKER}`,
    });
    // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
    await recordReservedMatterChain(await callerFor(STAFF, 'av7-a2b-app-chain'), {
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });
    await (
      await callerFor(NAZIR, 'av7-a2b-app')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });
    const done = await (
      await callerFor(MAKER, 'av7-a2b-exec')
    ).finance.receiptClass.executeCorrection({
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });

    /* ── POSITIVE CONTROL: with the reversal IN the window, the correction works exactly ──── */
    const before = await (
      await callerFor(MAKER, 'av7-a2b-pc')
    ).distribution.preview({ waqfId: WAQF, ...P2 });
    if (before.status !== 'computed') throw new Error(`PC refused: ${JSON.stringify(before)}`);
    console.log('A-2b BEFORE waterfall:', JSON.stringify(before.run.waterfall));
    console.log('A-2b BEFORE excludedCapital:', JSON.stringify(before.run.excludedCapitalReceipts));
    expect(before.run.waterfall.revenueSar).toBe('500000.00');
    expect(before.run.waterfall.capitalReceiptsSar).toBe('300000.00');

    /* ── THE ATTACK · shift the REVERSAL's date past periodEnd ────────────────────────────── */
    // Tried on the LEAST-PRIVILEGED runtime credential first: that is what decides severity.
    const app = await basePrisma();
    let appError: unknown = null;
    let appRows = 0;
    try {
      appRows = await app.$executeRawUnsafe(
        `UPDATE "transaction" SET "date" = '2026-11-05 00:00:00', "dateHijri" = '1448-05-16' WHERE "id" = $1`,
        done.reversalTransactionId,
      );
    } catch (error) {
      appError = error;
    }
    console.log(
      'A-2b date shift as qmulate_app:',
      JSON.stringify({
        rows: appRows,
        error: appError === null ? null : String(appError).slice(0, 300),
      }),
    );

    if (appError !== null) {
      const owner = await privilegedPrisma();
      const ownerRows = await owner.$executeRawUnsafe(
        `UPDATE "transaction" SET "date" = '2026-11-05 00:00:00', "dateHijri" = '1448-05-16' WHERE "id" = $1`,
        done.reversalTransactionId,
      );
      console.log('A-2b date shift as qmulate_owner: rows', ownerRows);
    }

    const after = await (
      await callerFor(MAKER, 'av7-a2b-after')
    ).distribution.preview({ waqfId: WAQF, ...P2 });
    if (after.status !== 'computed')
      throw new Error(`post-attack refused: ${JSON.stringify(after)}`);
    console.log('A-2b AFTER waterfall:', JSON.stringify(after.run.waterfall));
    console.log('A-2b AFTER excludedCapital:', JSON.stringify(after.run.excludedCapitalReceipts));
    console.log(
      'A-2b AFTER diagnostics:',
      JSON.stringify(after.run.diagnostics.map((d) => [d.code, d.detail])),
    );
    // ⚠ THE CANCELLED RECEIPT IS BACK IN THE POOL, and the SAME 300,000 is corpus in the same run.
    expect(after.run.waterfall.revenueSar).toBe('800000.00');
    expect(after.run.waterfall.capitalReceiptsSar).toBe('300000.00');
    expect(
      after.run.diagnostics.some((d) => d.code === 'LEDGER_REVERSED_PAIR_EXCLUDED'),
      'no diagnostic names the reversed original any more',
    ).toBe(false);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-3 · INVERTED (AV7-E/E2/E3 CLOSED, 2026-08-19) — THE STORED TRACE IS NOW REPLAYED
   *
   * WARNING: NOT THIS AGENT'S FIX AND NOT THIS AGENT'S GUARD. `STORED_LINES_DISAGREE_WITH_REPLAY`
   * was landed in `src/routers/distribution.ts` by the concurrent AV7-E/E3 agent WHILE THIS FILE
   * WAS BEING EDITED, and it turned A-3 and A-4 red mid-session. This probe file is in the AV7-F1
   * agent's list and that guard's file is not, so the inversion is done HERE to keep the tree
   * green: it asserts the MACHINE REASON and the zero-write outcome, and deliberately does NOT pin
   * the guard's prose. The AV7-E/E3 owner should deepen these two assertions if they want more, and
   * this paragraph should be the first thing they read.
   *
   * -- WHAT THIS TEST PROVED BEFORE THAT GUARD, measured on this cluster --------------------
   * `runDigest` was compared, at step 7, against the APPROVAL PAYLOAD's copy — column vs payload —
   * while the LINE AMOUNTS `execute` writes came from `readStoredLines(run.computationTrace)`, a
   * DIFFERENT Json blob no comparison touched, with nothing checking the sum of lines against
   * `distributableSar`. Measured: lines summed to 520,500,000 halalas against a 41,000,000 pool
   * (12.7x), `ben-001` paid 5,000,000.00 out of 410,000.00, run EXECUTED, and `distribution.get`
   * reporting a 410,000.00 pool for ever while `distribution.lines` reported 5,000,000.00.
   *
   * -- WHAT SURVIVES THE FIX AND IS STILL ASSERTED BELOW, because both are still true -------
   *   - the raw-SQL trace edit COMMITS on `qmulate_app`, the runtime credential, and
   *   - it is UNAUDITED: `audit_event` does not move.
   * The guard catches the substitution at SPEND time; it does not make the write unrepresentable.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-3 · an edited trace is refused at execute as STORED_LINES_DISAGREE_WITH_REPLAY, and nothing is posted', async () => {
    const P = { periodStart: '2026-11-01', periodEnd: '2026-11-30' } as const;
    const d = '2026-11-05T00:00:00.000Z';
    await recordReceipt({
      tag: 'a3',
      amountSar: '500000.00',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'INCOME',
    });

    const created = await (
      await callerFor(MAKER, 'av7-a3-create')
    ).distribution.create({ waqfId: WAQF, ...P });
    expect(created.run.waterfall.distributableSar).toBe('410000.00');
    const submitted = await (
      await callerFor(MAKER, 'av7-a3-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR, 'av7-a3-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    /* ── THE ATTACK · rewrite ONE line amount inside the stored trace ─────────────────────── */
    const auditBefore = await countAuditEvents({
      action: 'UPDATE',
      entityId: created.distributionId,
    });
    const app = await basePrisma();
    let appError: unknown = null;
    let rows = 0;
    try {
      rows = await app.$executeRawUnsafe(
        `UPDATE "distribution"
            SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,entitledSar}', '"5000000.00"')
          WHERE "id" = $1`,
        created.distributionId,
      );
    } catch (error) {
      appError = error;
    }
    console.log(
      'A-3 trace edit as qmulate_app:',
      JSON.stringify({ rows, error: appError === null ? null : String(appError).slice(0, 300) }),
    );
    // The owner-escalation branch this probe originally carried is GONE, deliberately: it existed
    // to reach the code under test when `qmulate_app` was refused, and migration 22 has since made
    // the column WRITE-ONCE for every role. Escalating past a seal to re-run an attack the seal
    // closed would measure the escalation, not the guard.

    const auditAfter = await countAuditEvents({
      action: 'UPDATE',
      entityId: created.distributionId,
    });
    console.log(
      'A-3 audit_event UPDATE rows naming this run, before/after the trace edit:',
      JSON.stringify({ auditBefore, auditAfter }),
    );
    // ⚠ THE EDIT IS UNAUDITED: raw SQL never reaches the audit extension.
    expect(auditAfter).toBe(auditBefore);

    const prisma = await basePrisma();
    const afterEdit = await prisma.distribution.findUniqueOrThrow({
      where: { id: created.distributionId },
      select: { runDigest: true, engineVersion: true, distributableSar: true },
    });
    // ⚠ THE DIGEST DID NOT MOVE. Step 7 compares THIS to the approval payload's copy.
    expect(afterEdit.runDigest).toBe(created.run.runDigest);

    /* ── THE REFUSAL · TWO ACCEPTABLE PLACES FOR IT, AND WHY THE ALTERNATION IS NOT SLACK ───
     * The AV7-E/E3 agent shipped BOTH halves while this file was being edited: a DATABASE seal
     * (migration 22 — `"computationTrace" is WRITE-ONCE`) and an APPLICATION replay
     * (`STORED_LINES_DISAGREE_WITH_REPLAY` at `execute`). On a cluster carrying migration 22 the
     * write never lands, so `execute` has nothing to catch; on one without it the replay catches
     * the spend. Both are named machine reasons from a CLOSED set of two, and the outcome asserted
     * after them is identical and unconditional: no line item, run not EXECUTED. A bare rejection,
     * a wrong-column error or a passing execute matches nothing here. */
    let refusal: unknown = null;
    if (rows === 0) {
      // The database refused the write. THAT is the refusal, and it is the stronger one.
      expect(String(appError)).toMatch(/"computationTrace" is WRITE-ONCE/);
      refusal = appError;
    } else {
      try {
        await (
          await callerFor(MAKER, 'av7-a3-execute')
        ).distribution.execute({
          waqfId: WAQF,
          distributionId: created.distributionId,
          approvalRequestId: submitted.approvalRequestId,
        });
      } catch (error) {
        refusal = error;
      }
      console.log('A-3 execute REFUSED:', String(refusal).slice(0, 700));
      // Both line sets are named — the substituted one and the replay — so a reader can see which
      // figure was manufactured.
      expect(String(refusal)).toMatch(
        /DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*STORED_LINES_DISAGREE_WITH_REPLAY/,
      );
      expect(String(refusal)).toMatch(/5000000\.00/);
      expect(String(refusal)).toMatch(/205000\.00/);
    }
    expect(refusal).not.toBeNull();

    /* ── AND NOTHING WAS POSTED. 520,500,000 halalas of payment record, before the guard. ─── */
    const lines = await prisma.distributionLineItem.findMany({
      where: { distributionId: created.distributionId },
      select: { beneficiaryId: true, status: true, amountSar: true },
      orderBy: { beneficiaryId: 'asc' },
    });
    console.log('A-3 posted lines:', JSON.stringify(lines));
    expect(lines).toEqual([]);
    const runAfter = await prisma.distribution.findUniqueOrThrow({
      where: { id: created.distributionId },
      select: { status: true },
    });
    console.log('A-3 run status after the refusal:', runAfter.status);
    expect(runAfter.status).toBe('PENDING_APPROVAL');
    void afterEdit;

    /* ── THE TWO SURFACES NOW AGREE, WHICH IS THE POINT ───────────────────────────────────── */
    // Before the guard, `distribution.get` reported a 410,000.00 pool for ever while
    // `distribution.lines` reported a 5,000,000.00 entitlement — a permanent disagreement between
    // the Nazir's view and the beneficiary's. Neither surface now carries the manufactured figure.
    const readRun = await (
      await callerFor(MAKER, 'av7-a3-get')
    ).distribution.get({ waqfId: WAQF, distributionId: created.distributionId });
    const readLines = await (
      await callerFor(MAKER, 'av7-a3-lines')
    ).distribution.lines({ waqfId: WAQF, distributionId: created.distributionId });
    console.log(
      'A-3 get vs lines:',
      JSON.stringify({
        distributableSar: readRun?.distributableSar,
        lines: readLines.map((l) => [l.beneficiaryId, l.amountSar]),
      }),
    );
    expect(readRun?.distributableSar).toBe('410000.00');
    expect(readLines).toEqual([]);

    /* ── POSITIVE CONTROL · THE SEAL REFUSED THE TAMPER, NOT THE RUN ──────────────────────────
     * Only reachable on the branch where the write never landed, so the run is genuinely
     * untampered: the SAME approval must still post, at the figures the engine computed. Without
     * this, a green refusal above would be indistinguishable from `execute` being broken outright —
     * which is the failure mode this repo has banked as a working guard before. */
    if (rows === 0) {
      const posted = await (
        await callerFor(MAKER, 'av7-a3-execute-clean')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      });
      const cleanLines = await prisma.distributionLineItem.findMany({
        where: { distributionId: created.distributionId },
        select: { beneficiaryId: true, status: true, amountSar: true },
        orderBy: { beneficiaryId: 'asc' },
      });
      console.log(
        'A-3 POSITIVE CONTROL · the untampered run posts:',
        JSON.stringify({
          status: posted.status,
          lines: cleanLines.map((l) => [l.beneficiaryId, l.status, l.amountSar.toString()]),
        }),
      );
      expect(posted.status).toBe('EXECUTED');
      // ⚠ 205,000.00 — the engine's own figure, not the 5,000,000.00 the tamper asked for.
      expect(cleanLines.map((l) => [l.beneficiaryId, l.status, l.amountSar.toString()])).toEqual([
        ['ben-001', 'PAID', '205000'],
        ['ben-002', 'EXCLUDED', '0'],
        ['ben-003', 'WITHHELD', '205000'],
      ]);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-3-PC · THE PAIRED POSITIVE CONTROL — the digest guard IS live, and fires BY NAME when the
   *          field it actually covers moves. This is what proves A-3 reached the code under test.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-3-PC · moving `runDigest` itself is refused as ARTIFACT_DIGEST_MISMATCH — the guard exists, it just does not cover the lines', async () => {
    const P = { periodStart: '2026-12-01', periodEnd: '2026-12-30' } as const;
    const d = '2026-12-05T00:00:00.000Z';
    await recordReceipt({
      tag: 'a3pc',
      amountSar: '500000.00',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'INCOME',
    });
    const created = await (
      await callerFor(MAKER, 'av7-a3pc-create')
    ).distribution.create({ waqfId: WAQF, ...P });
    const submitted = await (
      await callerFor(MAKER, 'av7-a3pc-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR, 'av7-a3pc-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const app = await basePrisma();
    const rows = await app.$executeRawUnsafe(
      `UPDATE "distribution" SET "runDigest" = repeat('a', 64) WHERE "id" = $1`,
      created.distributionId,
    );
    console.log('A-3-PC runDigest edit as qmulate_app: rows', rows);

    await expect(
      (await callerFor(MAKER, 'av7-a3pc-execute')).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      }),
    ).rejects.toThrow(/DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*ARTIFACT_DIGEST_MISMATCH/);
    const prisma = await basePrisma();
    expect(
      await prisma.distributionLineItem.count({
        where: { distributionId: created.distributionId },
      }),
    ).toBe(0);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-4 · CAN A RUN WRITE A LINE TO ANOTHER ENDOWMENT'S BENEFICIARY?
   *
   * ⚠ THE ANSWER MOVED TWICE ON 2026-08-19 AND THE TEST SAYS SO RATHER THAN BEING QUIETLY RETUNED.
   * It used to be refused by migration 19's composite FK — `distribution_line_item_waqfId_
   * beneficiaryId_fkey`, at INSERT, after `execute` had begun writing. The AV7-E/E3 agent then
   * landed an application replay (`STORED_LINES_DISAGREE_WITH_REPLAY`) which caught the substituted
   * trace first, and then a DATABASE seal (migration 22, `"computationTrace" is WRITE-ONCE`) which
   * refuses the substitution before it lands at all. So the FK is **no longer reached by this
   * route** and this test no longer exercises it. See A-3's header for the ownership note.
   *
   * ⚠ That is an honest loss of coverage and it is recorded here, not smoothed over: the composite
   * FK is still proven — by `packages/database/test/e5-anticommingling-corpus-guard.integration.
   * test.ts` edge 7/7b, which drives it in SQL directly and was mutation-verified by dropping it.
   *   ⚠ NOTE THE TRAP THIS TEST WAS WRITTEN AROUND, still true: a refusal here proves whichever
   *     guard fires FIRST, and neither of them is the corpus wall.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-4 · a foreign beneficiary injected into the trace is refused BEFORE the FK is reached, and posts nothing', async () => {
    const P = { periodStart: '2027-01-01', periodEnd: '2027-01-31' } as const;
    const d = '2027-01-05T00:00:00.000Z';
    await recordReceipt({
      tag: 'a4',
      amountSar: '500000.00',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'INCOME',
    });
    const created = await (
      await callerFor(MAKER, 'av7-a4-create')
    ).distribution.create({ waqfId: WAQF, ...P });
    const submitted = await (
      await callerFor(MAKER, 'av7-a4-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR, 'av7-a4-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const app = await basePrisma();
    // `ben-004` belongs to waqf-002.
    let thrown: unknown = null;
    let rows = 0;
    try {
      rows = await app.$executeRawUnsafe(
        `UPDATE "distribution" SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,beneficiaryId}', '"ben-004"') WHERE "id" = $1`,
        created.distributionId,
      );
    } catch (error) {
      thrown = error;
    }
    console.log('A-4 trace substitution rows:', rows);
    if (rows === 1) {
      try {
        await (
          await callerFor(MAKER, 'av7-a4-execute')
        ).distribution.execute({
          waqfId: WAQF,
          distributionId: created.distributionId,
          approvalRequestId: submitted.approvalRequestId,
        });
      } catch (error) {
        thrown = error;
      }
    }
    console.log('A-4 execute refusal:', String(thrown).slice(0, 700));
    // ⚠ EITHER GUARD IS AN ACCEPTABLE REFUSAL AND THE ALTERNATION SAYS WHICH ONE IS EXPECTED FIRST.
    // It is NOT a loosened assertion: both alternatives are named machine reasons, and a bare
    // rejection or a wrong-column error matches neither. Today the replay guard wins; if the AV7-E/E3
    // owner ever moves that check after the write, the FK arm is what should catch it, and this test
    // stays green for the RIGHT reason instead of going red for a re-ordering.
    expect(String(thrown)).toMatch(
      /"computationTrace" is WRITE-ONCE|STORED_LINES_DISAGREE_WITH_REPLAY|distribution_line_item_waqfId_beneficiaryId_fkey/,
    );
    const prisma = await basePrisma();
    expect(
      await prisma.distributionLineItem.count({
        where: { distributionId: created.distributionId },
      }),
    ).toBe(0);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-5 · HALALA CONSERVATION ON AN ODD POOL — can a halala be created or destroyed?
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-5 · an odd pool (500,000.01) splits over two heads with every halala accounted for', async () => {
    const P = { periodStart: '2027-02-01', periodEnd: '2027-02-28' } as const;
    const d = '2027-02-05T00:00:00.000Z';
    await recordReceipt({
      tag: 'a5',
      amountSar: '500000.01',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'INCOME',
    });
    const answer = await (
      await callerFor(MAKER, 'av7-a5')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (answer.status !== 'computed') throw new Error(`refused: ${JSON.stringify(answer)}`);
    const run = answer.run;
    console.log('A-5 waterfall:', JSON.stringify(run.waterfall));
    console.log('A-5 totals:', JSON.stringify(run.totals));
    console.log(
      'A-5 lines:',
      JSON.stringify(
        run.lines.map((l) => [l.beneficiaryId, l.status, l.entitledSar, l.sharePercent]),
      ),
    );
    const lineSum = run.lines.reduce((total, line) => total + halalas(line.entitledSar), 0n);
    console.log(
      'A-5 Σ lines vs distributable:',
      JSON.stringify({
        lineSum: lineSum.toString(),
        distributable: halalas(run.waterfall.distributableSar).toString(),
        residual: halalas(run.totals.residualSar).toString(),
      }),
    );
    // ⚠ MEASURED, AND IT IS NOT WHAT THE FIELD NAME SUGGESTS: `residualSar` REPORTS the
    // largest-remainder leftover that is ALREADY INSIDE the lines (ben-001 carries 205,000.01).
    // Σ lines == distributable EXACTLY; a consumer that ADDS residualSar to Σ lines double-counts
    // the halala. Recorded here because the identity is the thing being asserted.
    expect(lineSum).toBe(halalas(run.waterfall.distributableSar));
    expect(halalas(run.totals.residualSar)).toBe(1n);
    // I1 over the integers, on an amount that cannot divide evenly.
    expect(
      halalas(run.waterfall.maintenanceReserveSar) +
        halalas(run.waterfall.operatingSar) +
        halalas(run.waterfall.nazirFeeSar) +
        halalas(run.totals.paidSar) +
        halalas(run.totals.withheldSar) +
        halalas(run.totals.crossBorderSar) +
        halalas(run.totals.retainedSar),
    ).toBe(halalas(run.waterfall.revenueSar));
  });
  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-6 · ✅ INVERTED (AV7-F4 CLOSED, 2026-08-20) — A RETIRED CAPITAL RECEIPT IS REFUSED AT THE
   *        DATABASE, AND WHEN IT IS LEGITIMATELY RETIRED THE RUN HALTS BY NAME INSTEAD OF
   *        LOSING THE CORPUS.
   *
   * ── WHAT THIS TEST USED TO PROVE, measured on this cluster before the fix ─────────────────
   * `ledgerWindowWhere` filtered `deletedAt: null` in SQL, so a soft-deleted CAPITAL row never
   * reached the engine. ONE statement on `qmulate_app`, no approval anywhere:
   *   A-6 soft delete as qmulate_app: {"rows":1,"error":null}
   *   BEFORE  revenue 500000.00 · capitalReceipts 4200000.00  [CAPITAL_RECEIPTS_EXCLUDED raised]
   *   AFTER   revenue 500000.00 · capitalReceipts       0.00  [flag ABSENT, excludedCapital []]
   *   AFTER diagnostics: SHART_ADVISORY_GAP, MAINTENANCE_DEED_RULE_WINS…,
   *                      DISBURSING_ENTITY_HAS_NO_COLUMN, BANKING_REF_FOR_PROCEEDS_HAS_NO_COLUMN
   *                      — no CAPITAL_RECEIPTS_PASSED_TO_ENGINE, no trace step
   * while the row still read `CAPITAL / 4200000 / ISTIBDAL_PROCEEDS`. That is the exact failure the
   * mapper's header says `rev-005` exists to prevent, reached through the route the retention guard
   * itself recommends (*"Set `deletedAt` instead"*) and through a filter nobody read as a corpus
   * filter. The corpus became INVISIBLE rather than VISIBLY EXCLUDED.
   *
   * ── WHAT IT PROVES NOW, IN FIVE STEPS, AND BOTH HALVES OF THE FIX ARE NEEDED ──────────────
   *   1  PC   while the row is live the wall is loud (unchanged from the attacking version).
   *   2  GATE the same UPDATE on `qmulate_app` is REFUSED 42501 by `transaction_row_retirement`
   *           (migration 25), the message naming the subject an approval would have to carry, and
   *           NOTHING is written — the row is still live afterwards.
   *   2b GATE the INCOME receipt in the same period is refused too, with a DIFFERENT SENTENCE and
   *           the SAME strictness (product owner, 2026-08-20, memo "S7 · AV7-F4", option (a)).
   *   3  PC   ON THE GATE: with a GENUINE APPROVED maker <> checker reserved matter naming
   *           `transaction:<id>:deletedAt`, the very same statement SUCCEEDS. A guard that refuses
   *           everything is not a fix.
   *   4  THE VISIBILITY HALF: with the row legitimately retired, the run no longer says the corpus
   *           was never there — it HALTS, `LEDGER_ROW_SOFT_DELETED`, naming the class, the capital
   *           source, the amount and the retirement instant.
   *   5  PC   the CLEAR direction is gated too (refused without the approval, accepted with it),
   *           and once the row is live again the period COMPUTES with the corpus visible at
   *           4,200,000.00 and the flag raised. The period is not wedged.
   *
   * ⚠ WHY REFUSE AND NOT "NAME IT AND KEEP COMPUTING": see `assertRowsInWindow`'s docstring. The
   * short form is that the alternative has to decide whether the retired row's money counts, and a
   * diagnostic is not a refusal. Silence — the pre-fix answer — is the only one the ruling forbids.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-6 · ✅ retiring a CAPITAL receipt is REFUSED 42501 by name; approved, it retires and the run HALTS naming the corpus', async () => {
    const P = { periodStart: '2027-03-01', periodEnd: '2027-03-31' } as const;
    const di = '2027-03-05T00:00:00.000Z';
    const dc = '2027-03-06T00:00:00.000Z';
    const incomeId = await recordReceipt({
      tag: 'a6-income',
      amountSar: '500000.00',
      date: di,
      dateHijri: toHijriSnapshot(new Date(di)),
      receiptClass: 'INCOME',
    });
    const capitalId = await recordReceipt({
      tag: 'a6-capital',
      amountSar: '4200000.00',
      date: dc,
      dateHijri: toHijriSnapshot(new Date(dc)),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });

    /* ── 1 · POSITIVE CONTROL: while the row is live the wall is loud ────────────────────── */
    const before = await (
      await callerFor(MAKER, 'av7-a6-pc')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (before.status !== 'computed') throw new Error(`PC refused: ${JSON.stringify(before)}`);
    console.log('A-6 BEFORE waterfall:', JSON.stringify(before.run.waterfall));
    expect(before.run.waterfall.capitalReceiptsSar).toBe('4200000.00');
    expect(before.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');

    /* ── 2 · THE GATE · the same statement, on the RUNTIME credential, is now refused ─────
     * ⚠ ASSERTED ON `basePrisma()` — the app role — and never on the owner connection: a refusal
     * observed as the table owner proves nothing about the runtime, which is the whole point of
     * the privilege split (`test/setup.ts`'s own rule). */
    const app = await basePrisma();
    const retire = (id: string): Promise<number> =>
      app.$executeRawUnsafe(`UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = $1`, id);

    let refused: unknown = null;
    try {
      await retire(capitalId);
    } catch (error) {
      refused = error;
    }
    const capitalRefusal = String(refused);
    console.log('A-6 GATE · retire the CAPITAL row as qmulate_app:', capitalRefusal.slice(0, 420));
    expect(
      refused,
      'the unapproved soft delete COMMITTED — migration 25 is not live',
    ).not.toBeNull();
    // THE GUARD'S OWN MESSAGE, not an exit status: a probe with a wrong column name also "fails".
    expect(capitalRefusal).toContain('42501');
    expect(capitalRefusal).toMatch(/RETIRING A COMMITTED LEDGER ROW on transaction/);
    expect(capitalRefusal).toMatch(/is a RESERVED MATTER/);
    // The class-specific SENTENCE, and the subject an approval must name.
    expect(capitalRefusal).toMatch(
      /a CAPITAL receipt \(asl \/ أصل, capitalSource=ISTIBDAL_PROCEEDS\)/,
    );
    expect(capitalRefusal).toMatch(/CORPUS THE RUN CANNOT SEE/);
    expect(capitalRefusal).toContain(`transaction:${capitalId}:deletedAt`);
    // …and NOTHING was written.
    const stillLive = await app.transaction.findUniqueOrThrow({
      where: { id: capitalId },
      select: { deletedAt: true },
    });
    expect(stillLive.deletedAt).toBeNull();

    /* ── 2b · SAME STRICTNESS, DIFFERENT STATED REASON · the INCOME receipt beside it ─────
     * The owner ruled (a) UNIFORM. This is the assertion that stops a later change making capital
     * stricter than income: both are refused, and only the sentence differs. */
    let incomeRefused: unknown = null;
    try {
      await retire(incomeId);
    } catch (error) {
      incomeRefused = error;
    }
    const incomeRefusal = String(incomeRefused);
    console.log('A-6 GATE · retire the INCOME row as qmulate_app:', incomeRefusal.slice(0, 300));
    expect(incomeRefused).not.toBeNull();
    expect(incomeRefusal).toContain('42501');
    expect(incomeRefusal).toMatch(/an INCOME receipt \(ghallah \/ غلة\)/);
    expect(incomeRefusal).toMatch(/SHRINKS the distributable pool/);
    expect(incomeRefusal).toMatch(/THE SAME STRICTNESS AS THE CAPITAL ARM/);

    /* ── 3 · POSITIVE CONTROL ON THE GATE · a GENUINE approval retires it ────────────────── */
    await mintRetirementApproval(F4_APPROVAL, capitalId);
    const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
    const throughTheGate = async (sql: string): Promise<void> => {
      await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config($1, $2, true)`,
          RESERVED_MATTER_APPROVAL_GUC,
          F4_APPROVAL,
        );
        await tx.$executeRawUnsafe(sql, capitalId);
      });
    };
    await throughTheGate(`UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = $1`);
    const retired = await app.transaction.findUniqueOrThrow({
      where: { id: capitalId },
      select: { deletedAt: true, receiptClass: true, capitalSource: true, amountSar: true },
    });
    console.log(
      'A-6 PC · approved retirement:',
      JSON.stringify({
        deletedAt: retired.deletedAt === null ? null : 'set',
        receiptClass: retired.receiptClass,
        amountSar: retired.amountSar.toString(),
      }),
    );
    expect(retired.deletedAt, 'a genuine approval did not open the gate').not.toBeNull();

    /* ── 4 · THE VISIBILITY HALF · the run HALTS BY NAME instead of losing the corpus ─────
     * This is the assertion the pre-fix version could not make: `ledgerWindowWhere` no longer pins
     * `deletedAt: null`, so the row is FETCHED and `assertRowsInWindow` refuses. Compare the old
     * measurement quoted in this test's header — capital 0.00 and not one word about it. */
    const after = await (
      await callerFor(MAKER, 'av7-a6-after')
    ).distribution.preview({ waqfId: WAQF, ...P });
    console.log('A-6 AFTER preview:', JSON.stringify(after).slice(0, 700));
    expect(after.status).toBe('refused');
    if (after.status !== 'refused') throw new Error('unreachable');
    expect(after.refusal).toBe('LEDGER_ROW_SOFT_DELETED');
    expect(after.refusalSource).toBe('mapper');
    expect(after.code).toBe('DISTRIBUTION_INPUT_INVALID');
    // ⚠ AND IT NAMES THE CORPUS. A refusal that said only "a row is retired" would have replaced
    // silence with a shrug: the Nazir has to be told WHICH receipt and HOW MUCH.
    expect(after.details['transactionId']).toBe(capitalId);
    expect(after.details['receiptClass']).toBe('CAPITAL');
    expect(after.details['capitalSource']).toBe('ISTIBDAL_PROCEEDS');
    expect(after.details['amountSar']).toBe('4200000');
    expect(String(after.details['deletedAt'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    /* ── 5 · THE CLEAR IS GATED TOO, AND THE PERIOD IS NOT WEDGED ────────────────────────── */
    let unretireRefused: unknown = null;
    try {
      await app.$executeRawUnsafe(
        `UPDATE "transaction" SET "deletedAt" = NULL WHERE "id" = $1`,
        capitalId,
      );
    } catch (error) {
      unretireRefused = error;
    }
    const clearRefusal = String(unretireRefused);
    console.log('A-6 GATE · un-retire without an approval:', clearRefusal.slice(0, 260));
    expect(
      unretireRefused,
      'the CLEAR direction is ungated — a retirement could be undone',
    ).not.toBeNull();
    expect(clearRefusal).toMatch(/UN-RETIRING A RETIRED LEDGER ROW on transaction/);
    expect(clearRefusal).toContain('42501');

    await throughTheGate(`UPDATE "transaction" SET "deletedAt" = NULL WHERE "id" = $1`);
    const restored = await (
      await callerFor(MAKER, 'av7-a6-restored')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (restored.status !== 'computed') throw new Error(`refused: ${JSON.stringify(restored)}`);
    console.log('A-6 RESTORED waterfall:', JSON.stringify(restored.run.waterfall));
    expect(restored.run.waterfall.capitalReceiptsSar).toBe('4200000.00');
    expect(restored.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(restored.run.excludedCapitalReceipts.map((r) => r.transactionId)).toContain(capitalId);
    expect(restored.run.waterfall.revenueSar).toBe('500000.00');
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-7 · THE ENTRY-TIME BOUNDS — three shapes that CANNOT be recorded, asserted by name
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-7 · a 0-halala CAPITAL receipt still raises the flag; an unsourced CAPITAL row and a lower-case class are unrepresentable', async () => {
    const P = { periodStart: '2027-04-01', periodEnd: '2027-04-30' } as const;
    const di = '2027-04-05T00:00:00.000Z';
    const dz = '2027-04-06T00:00:00.000Z';
    await recordReceipt({
      tag: 'a7-income',
      amountSar: '500000.00',
      date: di,
      dateHijri: toHijriSnapshot(new Date(di)),
      receiptClass: 'INCOME',
    });

    /* (a) a CAPITAL receipt with NO capitalSource — refused AT ENTRY, by name. */
    let unsourced: unknown = null;
    try {
      await recordReceipt({
        tag: 'a7-unsourced',
        amountSar: '1000.00',
        date: dz,
        dateHijri: toHijriSnapshot(new Date(dz)),
        receiptClass: 'CAPITAL',
        capitalSource: null,
      });
    } catch (error) {
      unsourced = error;
    }
    console.log('A-7(a) unsourced CAPITAL refusal:', String(unsourced).slice(0, 300));
    expect(String(unsourced)).toMatch(
      /RECEIPT_UNCLASSIFIED[\s\S]*transaction_capital_requires_source/,
    );

    /* (b) a ZERO-amount CAPITAL receipt: the flag keys on PRESENCE, and the claim is tested. */
    const zeroId = await recordReceipt({
      tag: 'a7-zero',
      amountSar: '0.00',
      date: dz,
      dateHijri: toHijriSnapshot(new Date(dz)),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });
    const zero = await (
      await callerFor(MAKER, 'av7-a7-zero')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (zero.status !== 'computed') throw new Error(`refused: ${JSON.stringify(zero)}`);
    console.log('A-7(b) waterfall:', JSON.stringify(zero.run.waterfall));
    console.log('A-7(b) excludedCapital:', JSON.stringify(zero.run.excludedCapitalReceipts));
    expect(zero.run.waterfall.capitalReceiptsSar).toBe('0.00');
    expect(zero.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(zero.run.excludedCapitalReceipts.map((r) => r.transactionId)).toContain(zeroId);

    /* (c) a lower-case `income` class — the enum refuses it, on the runtime credential. */
    const app = await basePrisma();
    let caseError: unknown = null;
    try {
      await app.$executeRawUnsafe(
        `UPDATE "transaction" SET "receiptClass" = 'income' WHERE "id" = $1`,
        zeroId,
      );
    } catch (error) {
      caseError = error;
    }
    console.log('A-7(c) lower-case class refusal:', String(caseError).slice(0, 260));
    expect(String(caseError)).toMatch(/invalid input value for enum|ReceiptClass/i);

    /* (d) `capitalSource = OTHER`: refused without the Arabic note, and FLAGGED with it. */
    let noNote: unknown = null;
    try {
      await (
        await callerFor(MAKER, 'av7-a7-other-nonote')
      ).finance.recordRevenue({
        waqfId: WAQF,
        bankAccountId: ACCOUNT,
        amountSar: '777.00',
        date: dz,
        dateHijri: toHijriSnapshot(new Date(dz)),
        descriptionAr: `مقبوض ${AV7_MARKER}`,
        category: 'other_corpus',
        receiptClass: 'CAPITAL',
        capitalSource: 'OTHER',
        capitalSourceNoteAr: null,
      });
    } catch (error) {
      noNote = error;
    }
    console.log('A-7(d) OTHER without a note:', String(noNote).slice(0, 260));
    expect(String(noNote)).toMatch(/transaction_capital_other_requires_note/);

    const other = await (
      await callerFor(MAKER, 'av7-a7-other')
    ).finance.recordRevenue({
      waqfId: WAQF,
      bankAccountId: ACCOUNT,
      amountSar: '777.00',
      date: dz,
      dateHijri: toHijriSnapshot(new Date(dz)),
      descriptionAr: `مقبوض ${AV7_MARKER}`,
      category: 'other_corpus',
      receiptClass: 'CAPITAL',
      capitalSource: 'OTHER',
      capitalSourceNoteAr: `حصيلة غير مصنفة ${AV7_MARKER}`,
    });
    const withOther = await (
      await callerFor(MAKER, 'av7-a7-other-preview')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (withOther.status !== 'computed') throw new Error(`refused: ${JSON.stringify(withOther)}`);
    console.log(
      'A-7(d) OTHER capital in the run:',
      JSON.stringify({
        capital: withOther.run.waterfall.capitalReceiptsSar,
        revenue: withOther.run.waterfall.revenueSar,
        named: withOther.run.excludedCapitalReceipts,
      }),
    );
    expect(withOther.run.waterfall.revenueSar).toBe('500000.00');
    expect(withOther.run.waterfall.capitalReceiptsSar).toBe('777.00');
    expect(withOther.run.excludedCapitalReceipts.map((r) => r.transactionId)).toContain(
      other.transactionId,
    );
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-11 · ✅ INVERTED (AV7-F4 CLOSED, 2026-08-20) — REACHABILITY, MEASURED ON THE REQUEST-PATH
   *         CLIENT. THE EXTENSIONS STILL DO NOT SURVIVE RAW SQL; THE DATABASE DOES.
   *
   * A-2b/A-3/A-6 all attack through `basePrisma()` (the UNEXTENDED client). That left the honest
   * question open: can the client a PROCEDURE holds do the same? `extensions/scoping.ts` says in its
   * own header that it "DOES NOT SURVIVE RAW SQL", and before the fix this measured it:
   *   A-11 soft delete through the REQUEST-PATH client: {"rows":1,"error":null}
   *   A-11 AFTER capitalReceiptsSar: 0.00
   *
   * ⚠ THE INVERTED CLAIM IS DELIBERATELY NARROWER THAN "IT IS FIXED", because only one of the two
   * layers moved. `ctx.db`'s extensions are STILL bypassed by raw SQL — that sentence in
   * `scoping.ts` is still true and this test still does not contradict it. What refuses the write is
   * `transaction_row_retirement` (migration 25), a trigger, i.e. the layer the repo's own argument
   * calls load-bearing: *"the trigger is the LOAD-BEARING control, not the GRANTs"*. So the finding
   * A-11 recorded — a raw query on the request path is ungoverned by the extensions — survives; what
   * has changed is that the ungoverned statement no longer reaches a committed retirement.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-11 · ✅ the request-path `ctx.db` raw soft-delete is refused 42501 by the TRIGGER (not by the extensions), and the run still names the corpus', async () => {
    const P = { periodStart: '2027-09-01', periodEnd: '2027-09-30' } as const;
    const di = '2027-09-05T00:00:00.000Z';
    const dc = '2027-09-06T00:00:00.000Z';
    await recordReceipt({
      tag: 'a11-income',
      amountSar: '500000.00',
      date: di,
      dateHijri: toHijriSnapshot(new Date(di)),
      receiptClass: 'INCOME',
    });
    const capitalId = await recordReceipt({
      tag: 'a11-capital',
      amountSar: '2000000.00',
      date: dc,
      dateHijri: toHijriSnapshot(new Date(dc)),
      receiptClass: 'CAPITAL',
      // ⚠ ISTIBDAL_PROCEEDS, not SALE_PROCEEDS: this helper hardcodes `category: 'istibdal_proceeds'`
      // for every CAPITAL row (see its body), so a SALE_PROCEEDS source would have produced a row
      // whose category and capitalSource DISAGREE — an incoherent probe subject. A-11 does not turn
      // on which capital source it is. (Found by typecheck after this probe was committed: the
      // adversary never ran `tsc`, and neither did the orchestrator before committing it.)
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });

    const ctx = (await contextFor({ userId: MAKER, requestId: 'av7-a11', now: NOW })) as {
      db: { $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number> };
    };
    const before = await (
      await callerFor(MAKER, 'av7-a11-pc')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (before.status !== 'computed') throw new Error(`PC refused: ${JSON.stringify(before)}`);
    expect(before.run.waterfall.capitalReceiptsSar).toBe('2000000.00');

    let error: unknown = null;
    let rows = -1;
    try {
      rows = await ctx.db.$executeRawUnsafe(
        `UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = $1`,
        capitalId,
      );
    } catch (caught) {
      error = caught;
    }
    const message = String(error);
    console.log(
      'A-11 soft delete through the REQUEST-PATH client:',
      JSON.stringify({ rows, error: error === null ? null : message.slice(0, 380) }),
    );
    expect(
      error,
      `the request-path client committed the retirement (rows=${String(rows)})`,
    ).not.toBeNull();
    expect(message).toContain('42501');
    expect(message).toMatch(/RETIRING A COMMITTED LEDGER ROW on transaction/);
    expect(message).toContain(`transaction:${capitalId}:deletedAt`);
    // The guard names the CLASS, so the reader of a log knows corpus was the subject.
    expect(message).toMatch(/a CAPITAL receipt \(asl \/ أصل/);

    /* POSITIVE CONTROL, in the same test: the run this client serves still computes, and still
     * names the corpus with its number. A refusal that also broke the legitimate read would be a
     * different defect wearing this one's fix. */
    const after = await (
      await callerFor(MAKER, 'av7-a11-after')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (after.status !== 'computed') throw new Error(`refused: ${JSON.stringify(after)}`);
    console.log('A-11 AFTER capitalReceiptsSar:', after.run.waterfall.capitalReceiptsSar);
    expect(after.run.waterfall.capitalReceiptsSar).toBe('2000000.00');
    expect(after.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(after.run.excludedCapitalReceipts.map((r) => r.transactionId)).toContain(capitalId);
    // …and the row is still live, so nothing partial was written.
    const row = await (
      await basePrisma()
    ).transaction.findUniqueOrThrow({ where: { id: capitalId }, select: { deletedAt: true } });
    expect(row.deletedAt).toBeNull();
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-8 · THE WALL IS ONE-SIDED: THERE IS NO CAPITAL OUTFLOW CLASS, SO A CORPUS PAYMENT
   *       BOOKED AS `OPERATIONS` IS DEDUCTED FROM GHALLAH
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-8 · a corpus outflow has no expense class of its own; booked OPERATIONS it reduces the family pool 1:1', async () => {
    const P = { periodStart: '2027-05-01', periodEnd: '2027-05-31' } as const;
    const di = '2027-05-05T00:00:00.000Z';
    await recordReceipt({
      tag: 'a8-income',
      amountSar: '500000.00',
      date: di,
      dateHijri: toHijriSnapshot(new Date(di)),
      receiptClass: 'INCOME',
    });
    const before = await (
      await callerFor(MAKER, 'av7-a8-pc')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (before.status !== 'computed') throw new Error(`PC refused: ${JSON.stringify(before)}`);

    /* An EXPENSE cannot carry a receiptClass at all — the CHECK says so, on the runtime role. */
    const app = await basePrisma();
    let checkError: unknown = null;
    try {
      await app.$executeRawUnsafe(
        `UPDATE "transaction" SET "receiptClass" = 'CAPITAL', "capitalSource" = 'ISTIBDAL_PROCEEDS' WHERE "id" = 'exp-e-001'`,
      );
    } catch (error) {
      checkError = error;
    }
    console.log('A-8 EXPENSE + receiptClass refusal:', String(checkError).slice(0, 300));
    expect(String(checkError)).toMatch(/transaction_expense_has_no_receipt_class/);

    /* So the only place to put a corpus payment is an operating/other bucket. OPERATIONS deducts. */
    const de = '2027-05-10T00:00:00.000Z';
    // The only expense path is the maker-checked bank movement — a mitigating fact, recorded.
    const raised = await (
      await callerFor(MAKER, 'av7-a8-request')
    ).finance.bankMovement.request({
      waqfId: WAQF,
      movementRef: 'AV7-ISTIBDAL-BUY-1',
      bankAccountId: ACCOUNT,
      amountSar: '100000.00',
      date: de,
      dateHijri: toHijriSnapshot(new Date(de)),
      descriptionAr: `شراء العقار البديل (استبدال) ${AV7_MARKER}`,
      category: 'istibdal_replacement_purchase',
      expenseCategory: 'OPERATIONS',
    });
    await (
      await callerFor(NAZIR, 'av7-a8-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });
    const spent = await (
      await callerFor(MAKER, 'av7-a8-exec')
    ).finance.bankMovement.execute({
      waqfId: WAQF,
      approvalRequestId: raised.approvalRequestId,
    });
    console.log('A-8 corpus purchase booked as:', JSON.stringify(spent));
    const after = await (
      await callerFor(MAKER, 'av7-a8-after')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (after.status !== 'computed') throw new Error(`refused: ${JSON.stringify(after)}`);
    console.log('A-8 BEFORE waterfall:', JSON.stringify(before.run.waterfall));
    console.log('A-8 AFTER waterfall:', JSON.stringify(after.run.waterfall));
    expect(
      halelDelta(before.run.waterfall.distributableSar, after.run.waterfall.distributableSar),
    ).toBe(10_000_000n);
    expect(after.run.waterfall.capitalReceiptsSar).toBe('0.00');
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-9 · THE PERIOD BOUNDARY — a receipt with a clock time, and the UTC/Riyadh seam
   *
   * `periodWindow` is half-open in **UTC** while `asOf` is read in **Asia/Riyadh**. A receipt
   * captured at 00:30 on 1 July KSA time is 21:30Z on 30 June, so it lands in the JUNE run.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-9 · a CAPITAL receipt captured at 00:30 KSA on 1 July is counted in the JUNE period, and is still VISIBLE there', async () => {
    const P_JUN = { periodStart: '2027-06-01', periodEnd: '2027-06-30' } as const;
    const P_JUL = { periodStart: '2027-07-01', periodEnd: '2027-07-31' } as const;
    const di = '2027-06-05T00:00:00.000Z';
    // 2027-06-30T21:30:00Z === 2027-07-01T00:30 in Asia/Riyadh (UTC+03:00, no DST).
    const edge = '2027-06-30T21:30:00.000Z';
    await recordReceipt({
      tag: 'a9-income',
      amountSar: '500000.00',
      date: di,
      dateHijri: toHijriSnapshot(new Date(di)),
      receiptClass: 'INCOME',
    });
    const edgeId = await recordReceipt({
      tag: 'a9-edge',
      amountSar: '1000000.00',
      date: edge,
      dateHijri: toHijriSnapshot(new Date(edge)),
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    });

    const june = await (
      await callerFor(MAKER, 'av7-a9-jun')
    ).distribution.preview({ waqfId: WAQF, ...P_JUN });
    if (june.status !== 'computed') throw new Error(`refused: ${JSON.stringify(june)}`);
    console.log('A-9 JUNE waterfall:', JSON.stringify(june.run.waterfall));
    console.log('A-9 JUNE excludedCapital:', JSON.stringify(june.run.excludedCapitalReceipts));
    // The half-open bound does its job: the corpus row is NOT silently dropped by a `lte` bound.
    expect(june.run.waterfall.capitalReceiptsSar).toBe('1000000.00');
    expect(june.run.excludedCapitalReceipts.map((r) => r.transactionId)).toContain(edgeId);
    expect(june.run.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');

    const july = await (
      await callerFor(MAKER, 'av7-a9-jul')
    ).distribution.preview({ waqfId: WAQF, ...P_JUL });
    if (july.status !== 'computed') {
      console.log('A-9 JULY refused:', JSON.stringify(july));
    } else {
      console.log('A-9 JULY waterfall:', JSON.stringify(july.run.waterfall));
      // ⚠ THE SEAM: on the Nazir's own calendar this receipt belongs to July, and July does not
      // report it. Recorded rather than asserted as a defect — the zone choice is surfaced in
      // `RUN_AS_OF_TIME_ZONE`'s docstring and is the owner's to rule on.
      expect(july.run.waterfall.capitalReceiptsSar).toBe('0.00');
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-10 · ✅ INVERTED (AV7-F2 CLOSED, 2026-08-20) — THE SECOND PAYMENT OVER ONE RECEIPT IS
   *         REFUSED BY THE DATABASE, AND THE FIRST ONE STILL PAYS.
   *
   * ── WHAT THIS TEST USED TO PROVE, MEASURED ON THIS CLUSTER ─────────────────────────────────
   * `distribution_one_live_run_per_period` is unique on the EXACT triple
   * (`waqfId`,`periodStart`,`periodEnd`), so two runs whose windows merely OVERLAP were two
   * different keys and the index saw nothing. Both were created, both submitted, both approved by
   * a REAL second Nazir, both `EXECUTED`:
   *     run a   2027-08-01 … 2027-08-31   revenue 500,000.00   distributable 410,000.00  EXECUTED
   *     run b   2027-08-02 … 2027-08-31   revenue 500,000.00   distributable 410,000.00  EXECUTED
   *     ⇒ 820,000.00 recorded as owed against 410,000.00 of ghallah, from ONE receipt.
   * ⚠ AND NOTHING WAS WRONG WITH EITHER RUN. Each is INDIVIDUALLY CORRECT — no engine invariant is
   * violated by either, and there is no second answer to compare against. The excess has no income
   * provenance, so it is asl by the engine's own definition (Binding rule 1). No raw SQL, no
   * disabled trigger: ordinary procedure calls and genuine approvals throughout.
   *
   * ── WHAT IT PROVES NOW ────────────────────────────────────────────────────────────────────
   *   1  run `a` still computes, is approved, and PAYS in full — 410,000.00 over its lines. A guard
   *      that stopped the first legitimate quarter would be worse than the breach.
   *   2  run `b` — one day apart, overlapping — is created and approved exactly as before (those
   *      are COMPUTATIONS, and migration 26's predicate is `status = 'EXECUTED'` on purpose), and
   *      then REFUSED at `execute`, the last moment before a halala is attributed.
   *   3  the refusal is the DATABASE's: `23P01` naming `distribution_paid_periods_disjoint`, with
   *      both conflicting daterange keys in its DETAIL.
   *   4  ⚠ AND NOTHING IS POSTED BY THE REFUSED RUN — asserted, not assumed. The total across both
   *      runs is 410,000.00, not 820,000.00: `execute` writes the line items and moves the status
   *      inside ONE transaction, so the constraint aborting the status move must roll the lines
   *      back with it. That is the assertion that makes this a fix rather than a message.
   *
   * ⚠ WHY THE PAIR IS NOT MOVED ONTO `paidPeriod()`: this file is deliberately ABSENT from the
   * allocator's registry. A-10's whole job is to build an OVERLAPPING pair on purpose, and an
   * allocator whose contract is "every window is disjoint" cannot express that. The windows here
   * are hand-written because the collision is the subject.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-10 · ✅ the second run over the same 500,000.00 receipt is REFUSED 23P01 by distribution_paid_periods_disjoint, and posts nothing', async () => {
    const A = { periodStart: '2027-08-01', periodEnd: '2027-08-31' } as const;
    const B = { periodStart: '2027-08-02', periodEnd: '2027-08-31' } as const;
    const d = '2027-08-10T00:00:00.000Z';
    const receiptId = await recordReceipt({
      tag: 'a10',
      amountSar: '500000.00',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'INCOME',
    });

    const posted: { id: string; sum: bigint }[] = [];
    let secondRunId = '';
    let refusal: unknown = null;

    for (const [tag, period] of [
      ['a', A],
      ['b', B],
    ] as const) {
      const created = await (
        await callerFor(MAKER, `av7-a10-create-${tag}`)
      ).distribution.create({ waqfId: WAQF, ...period });
      // ⚠ BOTH runs still COMPUTE the same 500,000.00, and both are still APPROVED. The guard is
      // not a gate on computing an alternative window — it is a gate on PAYING a second time.
      expect(created.run.waterfall.revenueSar).toBe('500000.00');
      const submitted = await (
        await callerFor(MAKER, `av7-a10-submit-${tag}`)
      ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
      await (
        await callerFor(NAZIR, `av7-a10-approve-${tag}`)
      ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

      if (tag === 'b') {
        secondRunId = created.distributionId;
        try {
          await (
            await callerFor(MAKER, 'av7-a10-exec-b')
          ).distribution.execute({
            waqfId: WAQF,
            distributionId: created.distributionId,
            approvalRequestId: submitted.approvalRequestId,
          });
        } catch (error) {
          refusal = error;
        }
        continue;
      }

      const result = await (
        await callerFor(MAKER, `av7-a10-exec-${tag}`)
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      });
      expect(result.status).toBe('EXECUTED');
      const rows = await (
        await callerFor(MAKER, `av7-a10-lines-${tag}`)
      ).distribution.lines({ waqfId: WAQF, distributionId: created.distributionId });
      const sum = rows.reduce((total, row) => total + halalas(row.amountSar), 0n);
      console.log(
        `A-10 run ${tag}:`,
        JSON.stringify({
          period,
          distributionId: created.distributionId,
          lines: rows.map((r) => [r.beneficiaryId, r.status, r.amountSar]),
          sum: sum.toString(),
        }),
      );
      posted.push({ id: created.distributionId, sum });
    }

    /* ── 3 · THE REFUSAL IS THE DATABASE'S, AND IT NAMES THE CONSTRAINT ───────────────────── */
    const message = String(refusal);
    console.log('A-10 second execute:', message.slice(0, 600));
    expect(
      refusal,
      'the SECOND run over the same receipt EXECUTED — AV7-F2 is open and 820,000.00 is owed ' +
        'against 410,000.00 of ghallah',
    ).not.toBeNull();
    expect(message).toContain('23P01');
    expect(message).toContain('distribution_paid_periods_disjoint');
    // The DETAIL carries both normalised dateranges, which is what makes the refusal legible: the
    // `'[]'` bound means 2027-08-31 is INSIDE both, so Postgres prints the exclusive upper bound.
    expect(message).toMatch(/2027-08-01/);
    expect(message).toMatch(/2027-08-02/);

    /* ── 4 · AND THE REFUSED RUN POSTED NOTHING ───────────────────────────────────────────── */
    const prisma = await basePrisma();
    const second = await prisma.distribution.findUniqueOrThrow({
      where: { id: secondRunId },
      select: { status: true, distributableSar: true },
    });
    const secondLines = await prisma.distributionLineItem.count({
      where: { distributionId: secondRunId },
    });
    console.log('A-10 refused run:', JSON.stringify({ status: second.status, lines: secondLines }));
    // `execute` writes the lines and moves the status in ONE transaction, so the constraint
    // aborting the status move must take the lines with it. This is the assertion that separates a
    // fix from a message: a refusal that left line items behind would still owe the money.
    expect(second.status).not.toBe('EXECUTED');
    expect(secondLines, 'the refused run left line items behind — the halalas are still owed').toBe(
      0,
    );

    /* ── 1 · THE FIRST RUN STILL PAID IN FULL ─────────────────────────────────────────────── */
    const live = await prisma.distribution.findMany({
      where: { id: { in: [...posted.map((p) => p.id), secondRunId] } },
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        distributableSar: true,
      },
      orderBy: { periodStart: 'asc' },
    });
    console.log(
      'A-10 both runs:',
      JSON.stringify(
        live.map((r) => ({
          id: r.id,
          status: r.status,
          from: r.periodStart.toISOString().slice(0, 10),
          to: r.periodEnd.toISOString().slice(0, 10),
          distributableSar: r.distributableSar.toString(),
        })),
      ),
    );
    expect(live.filter((r) => r.status === 'EXECUTED')).toHaveLength(1);
    const total = posted.reduce((sum, run) => sum + run.sum, 0n);
    console.log('A-10 total entitled across both runs (halalas):', total.toString());
    // ⚠ 410,000.00 — the ghallah that exists — where this test used to measure 820,000.00.
    expect(total).toBe(halalas('410000.00'));
    void receiptId;
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * A-12 · ONE SEAT, NO APPROVAL, ARBITRARY POOL — `correctAmount` on an INCOME receipt
   *
   * Owner-ruled as an in-place audited edit (Q-E5-2(b)); recorded here for its effect on the pool,
   * because a single FINANCE identity moves the distributable with no second authority at all.
   * ═══════════════════════════════════════════════════════════════════════════════════════ */
  it('A-12 · a single maker raises the distributable from 410,000.00 to 8,960,000.00 with one un-approved call', async () => {
    const P = { periodStart: '2027-10-01', periodEnd: '2027-10-31' } as const;
    const d = '2027-10-05T00:00:00.000Z';
    const id = await recordReceipt({
      tag: 'a12',
      amountSar: '500000.00',
      date: d,
      dateHijri: toHijriSnapshot(new Date(d)),
      receiptClass: 'INCOME',
    });
    const before = await (
      await callerFor(MAKER, 'av7-a12-pc')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (before.status !== 'computed') throw new Error(`PC refused: ${JSON.stringify(before)}`);
    expect(before.run.waterfall.distributableSar).toBe('410000.00');

    const edited = await (
      await callerFor(MAKER, 'av7-a12-edit')
    ).finance.correctAmount({
      waqfId: WAQF,
      transactionId: id,
      amountSar: '10000000.00',
      reasonAr: `تصحيح المبلغ ${AV7_MARKER}`,
    });
    console.log('A-12 correctAmount:', JSON.stringify(edited));
    const after = await (
      await callerFor(MAKER, 'av7-a12-after')
    ).distribution.preview({ waqfId: WAQF, ...P });
    if (after.status !== 'computed') throw new Error(`refused: ${JSON.stringify(after)}`);
    console.log('A-12 AFTER waterfall:', JSON.stringify(after.run.waterfall));
    expect(after.run.waterfall.distributableSar).toBe('8960000.00');
  });
});

/** `before − after`, in halalas. */
function halelDelta(before: string, after: string): bigint {
  return BigInt(before.replace('.', '')) - BigInt(after.replace('.', ''));
}
