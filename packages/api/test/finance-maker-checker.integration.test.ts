/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E5's SECOND EXIT CLAUSE, AND RELEASE GATE G-3:
 *
 *     **A MAKER CANNOT APPROVE THEIR OWN MONEY MOVEMENT.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ THE VACUOUS VERSION OF THIS SUITE, WRITTEN DOWN SO IT IS NOT WRITTEN BY ACCIDENT ───────
 * The presets already make the Nazir unable to be the maker here:
 * `distribution:bank_movement:initiate` sits in `finance` and not in `nazir`, and
 * `approval:request:approve` sits in `nazir` and not in `finance`. A suite that proved "a finance
 * seat cannot approve" would therefore be GREEN with segregation of duties deleted, because the
 * ROLE SPLIT would carry it. That is not the property §10 §4.2 is about.
 *
 * The property is about **one human holding BOTH grants on one endowment** — AC-4's case, which a
 * real Nazarah engagement produces on day one, because the firm is small and the same person raises
 * the payment and is the appointed Nazir. For that caller a role-shaped check passes and only an
 * IDENTITY check fails. So the red test in this file is that caller, on the REAL procedures
 * (`finance.bankMovement.request` → `approval.approve`), and every mutation below is chosen to prove
 * the identity check is what is carrying it.
 *
 * ── WHAT ELSE THIS FILE PROVES ────────────────────────────────────────────────────────────────
 *  · G-2's application half: a posting to another endowment's account, and to a NON-DEDICATED
 *    account, are refused BY NAME before anything is written (the DB guards still fire underneath).
 *  · `isDedicated = false` is REPRESENTABLE and UNPOSTABLE — product owner 2026-08-18, Q-E5-3(a).
 *  · Arabic is required on a financial record and `.min(1)` is not what enforces it (NFR-01/BR-502).
 *  · A receipt's classification is mandatory at entry and has no default (binding rule 1).
 *  · An approval raised for one act cannot be spent on another — the TYPE is asserted first.
 *  · The posted row is written from the APPROVED ARTIFACT, never from the executor's own input.
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
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('the finance maker-checker suite (E5 exit clause 2, release gate G-3)');

const createCaller = createCallerFactory(appRouter);

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';

/** waqf-001's seeded dedicated account (`derivedId.bankAccount('FAKE-ACCT-W1')`). */
const ACCOUNT_A = 'bankacct-fake-acct-w1';
/** waqf-002's — used to prove a cross-endowment posting is refused. */
const ACCOUNT_B = 'bankacct-fake-acct-w2';

/**
 * AC-4's case, and the ONLY subject that can prove this suite's headline: one human who
 * legitimately holds the FINANCE seat and the NAZIR seat on the SAME endowment.
 */
const MAKER_AND_NAZIR = `${API_TEST_PREFIX}fin-maker-and-nazir`;
/** A distinct Nazir on the same endowment — the second authority that makes an approval possible. */
const SECOND_NAZIR = `${API_TEST_PREFIX}fin-second-nazir`;
/** A plain finance seat: may raise a movement, may never approve one. */
const FINANCE_ONLY = `${API_TEST_PREFIX}fin-finance-only`;

/** A non-dedicated account created by this suite, then torn down. Q-E5-3(a). */
const NON_DEDICATED_ID = `bankacct-${API_TEST_PREFIX}non-dedicated`;

const FINANCE_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
  'finance:bank_account:read',
  'finance:bank_account:write',
  'distribution:bank_movement:read',
  'distribution:bank_movement:write',
  'distribution:bank_movement:initiate',
  'approval:request:read',
  'approval:request:initiate',
];

const NAZIR_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
  'distribution:bank_movement:read',
  'distribution:bank_movement:approve',
  'approval:request:read',
  'approval:request:approve',
];

function subjects(): TestSubjectSpec[] {
  return [
    // ⚠ TWO grants for one user, on the SAME endowment. That is the premise, not a mistake.
    { id: MAKER_AND_NAZIR, role: 'FINANCE', waqfIds: [WAQF_A], permissions: FINANCE_PERMISSIONS },
    { id: MAKER_AND_NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: NAZIR_PERMISSIONS },
    { id: SECOND_NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: NAZIR_PERMISSIONS },
    {
      id: FINANCE_ONLY,
      role: 'FINANCE',
      waqfIds: [WAQF_A, WAQF_B],
      permissions: FINANCE_PERMISSIONS,
    },
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fixture helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A per-PROCESS tag mixed into every `movementRef`.
 *
 * ⚠ NOT COSMETIC. `approval_request_one_open_per_subject` is a partial unique index over
 * `(waqfId, type, COALESCE(subjectId, ''))` for NON-TERMINAL rows, so a reference that repeats across
 * runs collides with any row an earlier (or killed) run left behind, and the failure looks like a
 * broken guard rather than like leftover data.
 */
const RUN_TAG = `${process.pid}-${API_TEST_PREFIX}`;
let refCounter = 0;
const nextRef = (label: string): string => `${RUN_TAG}${label}-${++refCounter}`;

/** A well-formed movement body. Arabic is real Arabic; the amount is a decimal STRING. */
function movementInput(overrides: Record<string, unknown> = {}) {
  return {
    waqfId: WAQF_A,
    movementRef: nextRef('mv'),
    bankAccountId: ACCOUNT_A,
    assetId: null,
    amountSar: '1500.00',
    date: '2026-06-01T00:00:00.000Z',
    dateHijri: '1447-12-15',
    descriptionAr: 'صيانة مصعد العمارة (بيانات وهمية)',
    descriptionEn: 'Lift maintenance (fictional data)',
    category: 'maintenance',
    expenseCategory: 'MAINTENANCE' as const,
    ...overrides,
  };
}

async function readApproval(id: string) {
  const prisma = await basePrisma();
  return prisma.approvalRequest.findUnique({
    where: { id },
    select: { id: true, status: true, type: true, makerId: true, checkerId: true, subjectId: true },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.runIf(hasDatabase)('finance · maker-checker on money movement (G-3)', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());

    // The non-dedicated account (Q-E5-3(a)). Created directly: there is deliberately no procedure
    // that creates one, and the ruling is about REPRESENTABILITY, so the row must exist to be tested.
    const prisma = await basePrisma();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "bank_account" ("id","waqfId","accountRef","ibanEnc","ibanHmac","bankNameAr","purpose","currency","isDedicated","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SAR',false,now(),now())
       ON CONFLICT ("id") DO UPDATE SET "deletedAt" = NULL, "isDedicated" = false`,
      NON_DEDICATED_ID,
      WAQF_A,
      `${API_TEST_PREFIX}legacy-commingled`,
      'enc:fixture-only',
      `hmac-${API_TEST_PREFIX}non-dedicated`,
      'حساب موروث مشترك (بيانات وهمية)',
      'legacy commingled account recorded during onboarding',
    );
  });

  afterAll(async () => {
    // ⚠ `privilegedPrisma`, NOT `basePrisma` — and the reason is a PROPERTY OF THE SYSTEM, not a
    // test-harness detail. `DATABASE_URL` is the LEAST-privileged runtime role (`qmulate_app`,
    // ADR-0008 round 6), which holds no DELETE on `transaction` at all: the first version of this
    // teardown used it and failed with `42501 permission denied for table transaction`. That refusal
    // is the privilege matrix working, so the cleanup uses the migrator role rather than the request
    // path's. Nothing in the assertions above runs on this connection.
    const prisma = await privilegedPrisma();
    // ⚠ SOFT DELETE, AND THIS SUITE CANNOT DO OTHERWISE — which is a property worth recording rather
    // than a harness inconvenience. `DELETE FROM "transaction"` is refused 42501 even as the MIGRATOR
    // role: a ledger row carries a >= 10-year retention obligation (NFR-07 / BR-702) and the
    // non-diminution invariant means no operation may erode it, so the guard's own message says
    // "Set deletedAt instead." A finance test literally cannot tidy up by erasing evidence.
    //
    // The first two versions of this teardown were both refused, each for a different real reason —
    // `basePrisma` has no DELETE privilege on `transaction` at all (ADR-0008's least-privileged
    // runtime role), and the migrator has the privilege but not the permission (the trigger). Both
    // refusals are the system working, and neither was worked around.
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
        -- bank_account carries the SAME retention guard, and its message is explicit about why:
        -- "the account row is what proves which endowment's money moved where." This suite's
        -- non-dedicated account is its own scaffolding rather than evidence, so it goes; a
        -- soft-delete left it in the database suite's E1-2 count and turned the second consecutive
        -- pass red on BankAccount 3 -> 4.
        -- (No backticks in this block: it lives inside a JS template literal.)
        ALTER TABLE "bank_account" DISABLE TRIGGER bank_account_no_delete;
        DELETE FROM "bank_account" WHERE "id" LIKE 'bankacct-user-test-api-%';
        ALTER TABLE "bank_account" ENABLE ALWAYS TRIGGER bank_account_no_delete;
      END
      $$;
    `);
    // (The non-dedicated account is removed inside the same block above — `bank_account` carries
    // its own retention guard, so a plain DELETE is refused 42501 exactly like `transaction`'s.)
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * THE HEADLINE — AC-4, on the real procedures
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('a maker cannot approve their own bank movement (E5 exit clause 2)', () => {
    it('holds BOTH seats on this endowment — the premise, asserted rather than assumed', async () => {
      // If this ever stops being true the headline test below becomes a role-split test and passes
      // for the wrong reason. It is asserted first, and separately, so the failure names itself.
      const ctx = await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3-premise' });
      const roles = ctx.grants
        .filter((grant: { waqfId: string }) => grant.waqfId === WAQF_A)
        .map((grant: { role: string }) => grant.role)
        .sort();
      expect(roles).toEqual(['FINANCE', 'NAZIR']);
    });

    it('⚠ THE RED TEST · the maker is refused, by IDENTITY, before any state change', async () => {
      const makerCtx = await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3-self-request' });
      const raised = await createCaller(makerCtx).finance.bankMovement.request(movementInput());

      expect(raised.status).toBe('PENDING');
      // ⚠ No ledger row yet. The approval request IS the pending state.
      expect(raised.ledgerRowWritten).toBe(false);

      const beforeApprove = await countAuditEvents({
        action: 'APPROVE',
        entityId: raised.approvalRequestId,
      });

      const approveCtx = await contextFor({
        userId: MAKER_AND_NAZIR,
        requestId: 'g3-self-approve',
      });
      let thrown: unknown;
      try {
        await createCaller(approveCtx).approval.approve({
          waqfId: WAQF_A,
          approvalRequestId: raised.approvalRequestId,
        });
      } catch (error) {
        thrown = error;
      }

      // ⚠ ASSERT THE GUARD'S OWN NAME, never a bare rejection: a refusal is only evidence when it
      // carries the reason. A typo in the input would also "throw".
      expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
      expect(String((thrown as { message?: string }).message)).toContain('SEGREGATION_OF_DUTIES');

      // BEFORE ANY STATE CHANGE (§10 §4.2) — not merely "the end state is unchanged".
      const row = await readApproval(raised.approvalRequestId);
      expect(row?.status).toBe('PENDING');
      expect(row?.checkerId).toBeNull();
      expect(
        await countAuditEvents({ action: 'APPROVE', entityId: raised.approvalRequestId }),
      ).toBe(beforeApprove);
    });

    it('and the ledger stays empty — a refused approval posts nothing', async () => {
      const makerCtx = await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3-self-noledger' });
      const raised = await createCaller(makerCtx).finance.bankMovement.request(movementInput());

      await expect(
        createCaller(
          await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3-self-noledger-approve' }),
        ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId }),
      ).rejects.toThrow();

      // The half that makes the refusal mean something: execute must ALSO refuse, because the
      // approval never became APPROVED. Without this, a broken `execute` could post anyway.
      await expect(
        createCaller(
          await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3-self-noledger-exec' }),
        ).finance.bankMovement.execute({
          waqfId: WAQF_A,
          approvalRequestId: raised.approvalRequestId,
        }),
      ).rejects.toThrow(/BANK_MOVEMENT_NOT_AUTHORISED[\s\S]*APPROVAL_NOT_USABLE/);
    });

    it('the SAME caller CAN approve a movement raised by someone else', async () => {
      // The half that makes the refusal above about WHO INITIATED rather than about who is asking.
      // Without it, "approval always fails" would satisfy the red test.
      const raised = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-other-request' }),
      ).finance.bankMovement.request(movementInput());

      await expect(
        createCaller(
          await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3-other-approve' }),
        ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId }),
      ).resolves.toMatchObject({ status: 'APPROVED', checkerId: MAKER_AND_NAZIR });
    });

    it('a finance seat cannot approve at all — the role split, which is NOT the property above', async () => {
      const raised = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-finance-request' }),
      ).finance.bankMovement.request(movementInput());

      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-finance-approve' }),
        ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId }),
      ).rejects.toThrow();
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * The whole three-step path, end to end
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('request → approve → execute', () => {
    it('posts the ledger row only after a genuine second authority, and records both identities', async () => {
      const input = movementInput();
      const raised = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-happy-request' }),
      ).finance.bankMovement.request(input);

      await createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'g3-happy-approve' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId });

      const posted = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-happy-execute' }),
      ).finance.bankMovement.execute({
        waqfId: WAQF_A,
        approvalRequestId: raised.approvalRequestId,
      });

      expect(posted.makerId).toBe(FINANCE_ONLY);
      expect(posted.checkerId).toBe(SECOND_NAZIR);
      expect(posted.makerId).not.toBe(posted.checkerId);
      expect(posted.account).toBe('EXP-SIYANA');
      expect(posted.accountClass).toBe('OUTFLOW');

      const prisma = await basePrisma();
      const row = await prisma.transaction.findUnique({
        where: { id: posted.transactionId },
        select: {
          waqfId: true,
          type: true,
          expenseCategory: true,
          descriptionAr: true,
          amountSar: true,
          bankAccountId: true,
          receiptClass: true,
        },
      });
      expect(row?.waqfId).toBe(WAQF_A);
      expect(row?.type).toBe('EXPENSE');
      expect(row?.expenseCategory).toBe('MAINTENANCE');
      expect(row?.descriptionAr).toBe(input.descriptionAr);
      expect(String(row?.amountSar)).toBe('1500');
      // An EXPENSE is neither ghallah nor an asl inflow (ADR-0002).
      expect(row?.receiptClass).toBeNull();

      // The approval is spent, not left standing as a second live authority.
      expect((await readApproval(raised.approvalRequestId))?.status).toBe('EXECUTED');
    });

    it('one approval cannot be spent twice', async () => {
      const raised = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-twice-request' }),
      ).finance.bankMovement.request(movementInput());
      await createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'g3-twice-approve' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: raised.approvalRequestId });

      const caller = createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-twice-exec' }),
      );
      await caller.finance.bankMovement.execute({
        waqfId: WAQF_A,
        approvalRequestId: raised.approvalRequestId,
      });

      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-twice-exec2' }),
        ).finance.bankMovement.execute({
          waqfId: WAQF_A,
          approvalRequestId: raised.approvalRequestId,
        }),
      ).rejects.toThrow(/APPROVAL_NOT_USABLE: status is EXECUTED/);
    });

    it('⚠ an approval raised for ANOTHER act cannot be spent here — the TYPE is asserted first', async () => {
      // A RESERVED_MATTER approval's payloadHash still matches its OWN payload, so every later check
      // in the chain looks healthy. The type is the only one that catches it.
      const initiated = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-wrongtype-init' }),
      ).approval.initiate({
        waqfId: WAQF_A,
        type: 'RESERVED_MATTER',
        subjectId: `${RUN_TAG}wrong-type`,
        payload: { note: 'not a bank movement' },
      });

      await createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'g3-wrongtype-approve' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: initiated.approvalRequestId });

      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'g3-wrongtype-exec' }),
        ).finance.bankMovement.execute({
          waqfId: WAQF_A,
          approvalRequestId: initiated.approvalRequestId,
        }),
      ).rejects.toThrow(/WRONG_APPROVAL_TYPE: the approval is RESERVED_MATTER/);
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * G-2's application half, and Q-E5-3(a)
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('anti-commingling, refused before anything is written (BR-501 / G-2)', () => {
    it("refuses a receipt posted to ANOTHER endowment's account, naming the reason", async () => {
      // FINANCE_ONLY holds grants on BOTH endowments, so this is not a scoping refusal in disguise:
      // the caller may legitimately see waqf-002 and its account, and is still refused.
      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'g2-cross' }),
        ).finance.recordRevenue({
          waqfId: WAQF_A,
          bankAccountId: ACCOUNT_B,
          amountSar: '100.00',
          date: '2026-06-01T00:00:00.000Z',
          dateHijri: '1447-12-15',
          descriptionAr: 'إيجار (بيانات وهمية)',
          category: 'rent',
          receiptClass: 'INCOME',
        }),
      ).rejects.toThrow(/COMMINGLING_REFUSED[\s\S]*belongs to waqf waqf-002/);
    });

    it('⚠ isDedicated = false is REPRESENTABLE and UNPOSTABLE (owner-ruled, Q-E5-3(a))', async () => {
      // Half one: the row exists. The ruling is that an engagement may RECORD an account it does not
      // control — refusing the row would answer a product question by migration.
      const prisma = await basePrisma();
      const account = await prisma.bankAccount.findUnique({
        where: { id: NON_DEDICATED_ID },
        select: { id: true, isDedicated: true, waqfId: true },
      });
      expect(account).not.toBeNull();
      expect(account?.isDedicated).toBe(false);
      expect(account?.waqfId).toBe(WAQF_A);

      // Half two: nothing may ever be posted to it.
      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'g2-nondedicated' }),
        ).finance.recordRevenue({
          waqfId: WAQF_A,
          bankAccountId: NON_DEDICATED_ID,
          amountSar: '100.00',
          date: '2026-06-01T00:00:00.000Z',
          dateHijri: '1447-12-15',
          descriptionAr: 'إيجار (بيانات وهمية)',
          category: 'rent',
          receiptClass: 'INCOME',
        }),
      ).rejects.toThrow(/NON_DEDICATED_ACCOUNT/);
    });

    it('and the DATABASE still refuses it if this layer is bypassed — the guard is not the app check', async () => {
      // The application refusal above is a better message, not the invariant. Proven by going around
      // it entirely: a raw insert as the least-privileged runtime role must still be refused, with
      // the TRIGGER's own text.
      const prisma = await basePrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "transaction"
             ("id","waqfId","type","category","receiptClass","descriptionAr","amountSar","date","dateHijri","bankAccountId","createdAt","updatedAt")
           VALUES ($1,$2,'REVENUE','rent','INCOME','إيجار (بيانات وهمية)',100,now(),'1447-12-16',$3,now(),now())`,
          `${API_TEST_PREFIX}raw-nondedicated`,
          WAQF_A,
          NON_DEDICATED_ID,
        ),
      ).rejects.toThrow(/dedicated/i);
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * Capture discipline — Arabic, and the classification
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('capture discipline', () => {
    it('⚠ refuses an English-only descriptionAr — .min(1) is not what NFR-01 asks for', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'cap-english' }),
        ).finance.recordRevenue({
          waqfId: WAQF_A,
          bankAccountId: ACCOUNT_A,
          amountSar: '100.00',
          date: '2026-06-01T00:00:00.000Z',
          dateHijri: '1447-12-15',
          descriptionAr: 'Rent for March',
          category: 'rent',
          receiptClass: 'INCOME',
        }),
      ).rejects.toThrow(/Arabic-authoritative/);
    });

    it('refuses an INCOME receipt that also names a capital source (incoherent, not "probably capital")', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'cap-incoherent' }),
        ).finance.recordRevenue({
          waqfId: WAQF_A,
          bankAccountId: ACCOUNT_A,
          amountSar: '100.00',
          date: '2026-06-01T00:00:00.000Z',
          dateHijri: '1447-12-15',
          descriptionAr: 'إيجار (بيانات وهمية)',
          category: 'rent',
          receiptClass: 'INCOME',
          capitalSource: 'SALE_PROCEEDS',
        }),
      ).rejects.toThrow(/RECEIPT_CLASS_INCOHERENT|cannot name a capitalSource/);
    });

    it('refuses capitalSource = OTHER with no Arabic justification — OTHER is a valve, not a bucket', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'cap-other' }),
        ).finance.recordRevenue({
          waqfId: WAQF_A,
          bankAccountId: ACCOUNT_A,
          amountSar: '100.00',
          date: '2026-06-01T00:00:00.000Z',
          dateHijri: '1447-12-15',
          descriptionAr: 'مقبوض آخر (بيانات وهمية)',
          category: 'other',
          receiptClass: 'CAPITAL',
          capitalSource: 'OTHER',
        }),
      ).rejects.toThrow(/capitalSourceNoteAr/);
    });

    it('a CAPITAL receipt lands in a CORPUS account and is NOT distributable (binding rule 1)', async () => {
      const result = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'cap-corpus' }),
      ).finance.recordRevenue({
        waqfId: WAQF_A,
        bankAccountId: ACCOUNT_A,
        amountSar: '250000.00',
        date: '2026-06-01T00:00:00.000Z',
        dateHijri: '1447-12-15',
        descriptionAr: 'حصيلة استبدال (بيانات وهمية)',
        category: 'istibdal_proceeds',
        receiptClass: 'CAPITAL',
        capitalSource: 'ISTIBDAL_PROCEEDS',
      });

      expect(result.account).toBe('COR-ISTIBDAL');
      expect(result.accountClass).toBe('CORPUS');
      expect(result.distributable).toBe(false);
    });

    it('an INCOME receipt lands in ghallah and IS distributable', async () => {
      const result = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'cap-income' }),
      ).finance.recordRevenue({
        waqfId: WAQF_A,
        bankAccountId: ACCOUNT_A,
        amountSar: '350000.00',
        date: '2026-06-01T00:00:00.000Z',
        dateHijri: '1447-12-15',
        descriptionAr: 'إيجار الربع الأول (بيانات وهمية)',
        category: 'rent',
        receiptClass: 'INCOME',
      });

      expect(result.account).toBe('INC-GHALLAH');
      expect(result.accountClass).toBe('INCOME');
      expect(result.distributable).toBe(true);
    });

    it('refuses a Hijri snapshot that does not match the Gregorian date', async () => {
      await expect(
        createCaller(
          await contextFor({ userId: FINANCE_ONLY, requestId: 'cap-hijri' }),
        ).finance.recordRevenue({
          waqfId: WAQF_A,
          bankAccountId: ACCOUNT_A,
          amountSar: '100.00',
          date: '2026-06-01T00:00:00.000Z',
          dateHijri: '1400-01-01',
          descriptionAr: 'إيجار (بيانات وهمية)',
          category: 'rent',
          receiptClass: 'INCOME',
        }),
      ).rejects.toThrow(/DUAL_DATE_MISMATCH/);
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * The chart of accounts, as the surface sees it
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('chartOfAccounts', () => {
    it('names the four UNRULED receipt types in the response, not only in a docstring', async () => {
      // A UI that renders this chart must be able to say what is missing. A complete-looking list
      // with four silent omissions is how the fiqh question gets answered by omission.
      const chart = await createCaller(
        await contextFor({ userId: FINANCE_ONLY, requestId: 'coa' }),
      ).finance.chartOfAccounts({ waqfId: WAQF_A });

      expect(chart.unruledSubjects.map((s) => s.subject)).toStrictEqual([
        'LEASE_PREMIUM_KEY_MONEY',
        'INSURANCE_PROCEEDS',
        'POST_ISTIBDAL_RENT_ARREARS',
        'ACCUMULATED_SIYANA_RESERVE',
      ]);
      expect(chart.socpaMappingHeld).toBe(false);
      for (const account of chart.accounts) {
        expect(account.socpaAccountCode).toBeNull();
        expect(account.ref.startsWith(`${WAQF_A}:`)).toBe(true);
      }
    });
  });
});
