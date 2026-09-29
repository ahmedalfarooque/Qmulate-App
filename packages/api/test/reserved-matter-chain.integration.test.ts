/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-2 · THE BR-1102 CHAIN END TO END, THROUGH THE REAL PROCEDURES (BR-1102 · BR-1103 · §10 §9)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * The owner's rulings of 2026-09-08, verbatim: "staff" (who records the principal's consent) and
 * "every matter" (counsel review on every reserved matter). This file drives a kinded reserved
 * matter from mint to sign on a provisioned intake endowment:
 *
 *   mint  → the Principal's board seat and counsel are NOTIFIED of the steps due (RACI, BR-1103)
 *   sign  → REFUSED, naming PRINCIPAL_CONSENT and COUNSEL_REVIEW (the sentence)
 *   staff records principal consent against a reference → COUNSEL_REVIEW still named
 *   staff records counsel review → the Nazir's seat is notified the sign is READY
 *   sign  → APPROVED, and the trail says chainEnforced: true
 *   a step cannot be recorded twice, after the decision, or when not required
 *   a KINDLESS reserved-matter row still signs on maker ≠ checker alone (S12 Q8, surfaced)
 *
 * The api-level positive control for every refusal is the same flow succeeding once the missing
 * fact is recorded — no scaffolding lays down a recorded step; the procedures do.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  deleteProvisionedEndowments,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
  recordReservedMatterChain,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-2 · the BR-1102 chain end to end');

const createCaller = createCallerFactory(appRouter);

const WAQF = `${API_TEST_WAQF_PREFIX}chain`;
const MAKER = `${API_TEST_PREFIX}chain-staff`;
const NAZIR = `${API_TEST_PREFIX}chain-nazir`;
const BOARD = `${API_TEST_PREFIX}chain-board`;
const COUNSEL = `${API_TEST_PREFIX}chain-counsel`;

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId }));

const asRejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { cause?: unknown }).cause ?? '')}`
      : String(error);
  }
  throw new Error('expected a rejection and got a resolution');
};

describe.skipIf(!hasDatabase)('S12-2 · a reserved matter travels its chain', () => {
  let mintedId: string;

  beforeAll(async () => {
    await assertSeeded();
    await provisionIntakeEndowment({ id: WAQF, classification: 'SMALL' });
    await provisionTestSubjects([
      {
        id: MAKER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [WAQF],
        permissions: [
          'endowment:waqf:read',
          'approval:request:read',
          'approval:request:initiate',
          'legal:reserved_matter:read',
          'legal:reserved_matter:write',
        ],
      },
      {
        id: NAZIR,
        role: 'NAZIR',
        waqfIds: [WAQF],
        permissions: [
          'endowment:waqf:read',
          'approval:request:read',
          'approval:request:approve',
          'legal:reserved_matter:read',
          'legal:reserved_matter:write',
          'legal:reserved_matter:approve',
        ],
      },
      {
        id: BOARD,
        role: 'FAMILY_BOARD',
        waqfIds: [WAQF],
        permissions: ['approval:request:read', 'legal:reserved_matter:read'],
      },
      {
        id: COUNSEL,
        role: 'COUNSEL',
        waqfIds: [WAQF],
        permissions: ['legal:reserved_matter:read'],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await deleteProvisionedEndowments([WAQF]);
    await cleanupApiTestRows();
    await closeDatabase();
  });

  const notificationsFor = async (userId: string) => {
    const prisma = await privilegedPrisma();
    return prisma.notification.findMany({
      where: { userId, waqfId: WAQF },
      select: { kind: true, payload: true },
      orderBy: { createdAt: 'asc' },
    });
  };

  it('1 · the mint ROUTES the steps due to the Principal and to counsel (BR-1103), and forces counsel review', async () => {
    const minted = await (
      await callerFor(MAKER, 'chain-mint')
    ).approval.initiate({
      waqfId: WAQF,
      type: 'RESERVED_MATTER',
      reservedMatterKind: 'DEED_IDENTITY',
      subjectId: `waqf:${WAQF}:certificateNumber`,
      payload: { kind: 'probe', waqfId: WAQF, note: 'S12-2 chain (بيانات وهمية)' },
    });
    mintedId = minted.approvalRequestId;
    expect(minted.status).toBe('PENDING');

    const prisma = await privilegedPrisma();
    const row = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: mintedId },
      select: { counselReviewRequired: true, authorityNoticeRequired: true },
    });
    expect(row.counselReviewRequired, '"every matter" — forced true on a kinded mint').toBe(true);
    expect(row.authorityNoticeRequired).toBe(false);

    const board = await notificationsFor(BOARD);
    expect(board.map((n) => [n.kind, (n.payload as { step: string }).step])).toEqual([
      ['reserved_matter.step_due', 'PRINCIPAL_CONSENT'],
    ]);
    const counsel = await notificationsFor(COUNSEL);
    expect(counsel.map((n) => [n.kind, (n.payload as { step: string }).step])).toEqual([
      ['reserved_matter.step_due', 'COUNSEL_REVIEW'],
    ]);
    // The Nazir is not due yet — nothing routes to the sign before the chain is complete.
    expect(await notificationsFor(NAZIR)).toEqual([]);
  });

  it('2 · the sign is REFUSED by name, on both approve procedures, before anything is written', async () => {
    const generic = await asRejection(
      (await callerFor(NAZIR, 'chain-sign-early')).approval.approve({
        waqfId: WAQF,
        approvalRequestId: mintedId,
      }),
    );
    expect(generic).toMatch(/RESERVED_MATTER_CHAIN_INCOMPLETE/);
    expect(generic).toMatch(/PRINCIPAL_CONSENT/);
    expect(generic).toMatch(/COUNSEL_REVIEW/);

    const reserved = await asRejection(
      (await callerFor(NAZIR, 'chain-sign-early-rm')).reservedMatter.approve({
        waqfId: WAQF,
        approvalRequestId: mintedId,
      }),
    );
    expect(reserved).toMatch(/RESERVED_MATTER_CHAIN_INCOMPLETE/);

    const prisma = await privilegedPrisma();
    const row = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: mintedId },
      select: { status: true, checkerId: true },
    });
    expect(String(row.status)).toBe('PENDING');
    expect(row.checkerId).toBeNull();
  });

  it('3 · list reports the missing steps and what THIS reader may do', async () => {
    const asNazir = await (
      await callerFor(NAZIR, 'chain-list-nazir')
    ).reservedMatter.list({ waqfId: WAQF });
    const mine = asNazir.find((r) => r.approvalRequestId === mintedId);
    expect(mine?.chainMissing).toEqual(['PRINCIPAL_CONSENT', 'COUNSEL_REVIEW']);
    expect(mine?.chain).toEqual({
      principalConsent: 'NOT_RECORDED',
      counselReview: 'NOT_RECORDED',
      authorityNotice: 'NOT_REQUIRED',
    });
    expect(mine?.writable).toEqual({ recordStep: true, sign: true });

    const asBoard = await (
      await callerFor(BOARD, 'chain-list-board')
    ).reservedMatter.list({ waqfId: WAQF });
    expect(asBoard.find((r) => r.approvalRequestId === mintedId)?.writable).toEqual({
      recordStep: false,
      sign: false,
    });
  });

  it("4 · STAFF records the principal's written consent against its reference; COUNSEL_REVIEW is still named", async () => {
    const result = await (
      await callerFor(MAKER, 'chain-principal')
    ).reservedMatter.recordPrincipalConsent({
      waqfId: WAQF,
      approvalRequestId: mintedId,
      reference: 'FAKE-BOARD-LETTER-2026-09-08',
    });
    expect(result.step).toBe('PRINCIPAL_CONSENT');
    expect(result.chainMissing).toEqual(['COUNSEL_REVIEW']);
    expect(result.signReady).toBe(false);

    const again = await asRejection(
      (await callerFor(MAKER, 'chain-principal-again')).reservedMatter.recordPrincipalConsent({
        waqfId: WAQF,
        approvalRequestId: mintedId,
        reference: 'FAKE-BOARD-LETTER-OTHER',
      }),
    );
    expect(again).toMatch(/STEP_ALREADY_RECORDED/);

    const notRequired = await asRejection(
      (await callerFor(MAKER, 'chain-authority-nr')).reservedMatter.recordAuthorityNotice({
        waqfId: WAQF,
        approvalRequestId: mintedId,
        reference: 'FAKE-AWQAF-REF',
      }),
    );
    expect(notRequired).toMatch(/STEP_NOT_REQUIRED/);

    const badDocument = await asRejection(
      (await callerFor(MAKER, 'chain-counsel-baddoc')).reservedMatter.recordCounselReview({
        waqfId: WAQF,
        approvalRequestId: mintedId,
        reference: 'FAKE-COUNSEL-MEMO',
        documentId: 'doc-does-not-exist',
      }),
    );
    expect(badDocument).toMatch(/REFERENCE_DOCUMENT_NOT_VISIBLE/);

    const stillRefused = await asRejection(
      (await callerFor(NAZIR, 'chain-sign-half')).reservedMatter.approve({
        waqfId: WAQF,
        approvalRequestId: mintedId,
      }),
    );
    expect(stillRefused).toMatch(/COUNSEL_REVIEW/);
    expect(stillRefused).not.toMatch(/PRINCIPAL_CONSENT/);
  });

  it('5 · a seat WITHOUT legal:reserved_matter:write cannot record a step', async () => {
    const refused = await asRejection(
      (await callerFor(BOARD, 'chain-board-record')).reservedMatter.recordCounselReview({
        waqfId: WAQF,
        approvalRequestId: mintedId,
        reference: 'FAKE-COUNSEL-MEMO',
      }),
    );
    expect(refused).toMatch(/PERMISSION_DENIED|FORBIDDEN|NOT_FOUND|NO_GRANT/);
  });

  it('6 · the last step completes the chain and the Nazir is told the sign is READY (BR-1103)', async () => {
    const result = await (
      await callerFor(MAKER, 'chain-counsel')
    ).reservedMatter.recordCounselReview({
      waqfId: WAQF,
      approvalRequestId: mintedId,
      reference: 'FAKE-COUNSEL-MEMO-2026-09-08',
    });
    expect(result.chainMissing).toEqual([]);
    expect(result.signReady).toBe(true);

    const nazir = await notificationsFor(NAZIR);
    expect(nazir.map((n) => [n.kind, (n.payload as { step: string }).step])).toEqual([
      ['reserved_matter.sign_ready', 'NAZIR_SIGN'],
    ]);

    const prisma = await privilegedPrisma();
    const row = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: mintedId },
      select: {
        principalConsentBy: true,
        principalConsentReference: true,
        principalConsentRecordedAtHijri: true,
        counselReviewBy: true,
        counselReviewReference: true,
      },
    });
    expect(row.principalConsentBy).toBe(MAKER);
    expect(row.principalConsentReference).toBe('FAKE-BOARD-LETTER-2026-09-08');
    expect(row.principalConsentRecordedAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.counselReviewBy).toBe(MAKER);
    expect(row.counselReviewReference).toBe('FAKE-COUNSEL-MEMO-2026-09-08');
  });

  it('7 · the Nazir signs — and the trail says the chain was ENFORCED', async () => {
    const signed = await (
      await callerFor(NAZIR, 'chain-sign')
    ).reservedMatter.approve({ waqfId: WAQF, approvalRequestId: mintedId });
    expect(signed.status).toBe('APPROVED');
    expect(signed.chainEnforced).toBe(true);
    expect(signed.chainIncomplete).toEqual([]);
    expect(signed.messageKey).toBeNull();

    const prisma = await privilegedPrisma();
    const events = await prisma.$queryRawUnsafe<
      { ctx: { chainEnforced?: boolean; chainIncomplete?: string[] } }[]
    >(
      `SELECT "context" AS ctx FROM "audit_event"
        WHERE "entityType" = 'ApprovalRequest' AND "entityId" = $1 AND "action" = 'APPROVE'
          AND "context" ? 'chainEnforced'`,
      mintedId,
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.ctx.chainEnforced === true)).toBe(true);
  });

  it('8 · a step cannot be recorded AFTER the decision', async () => {
    const late = await asRejection(
      (await callerFor(MAKER, 'chain-late')).reservedMatter.recordAuthorityNotice({
        waqfId: WAQF,
        approvalRequestId: mintedId,
        reference: 'FAKE-LATE',
      }),
    );
    expect(late).toMatch(/NOT_OPEN|STEP_NOT_REQUIRED/);
  });

  it('9 · a KINDLESS reserved-matter row carries no chain and signs on maker ≠ checker alone (S12 Q8)', async () => {
    const minted = await (
      await callerFor(MAKER, 'chain-kindless-mint')
    ).approval.initiate({
      waqfId: WAQF,
      type: 'RESERVED_MATTER',
      subjectId: `setting:${WAQF}:probe`,
      payload: { kind: 'probe-kindless', waqfId: WAQF },
    });
    const signed = await (
      await callerFor(NAZIR, 'chain-kindless-sign')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: minted.approvalRequestId });
    expect(signed.status).toBe('APPROVED');
  });

  it('10 · the harness helper records exactly the missing steps, through the same procedures', async () => {
    const minted = await (
      await callerFor(MAKER, 'chain-helper-mint')
    ).approval.initiate({
      waqfId: WAQF,
      type: 'RESERVED_MATTER',
      reservedMatterKind: 'ACCESS_MATRIX_CHANGE',
      subjectId: `waqf:${WAQF}:accessMatrix`,
      payload: { kind: 'probe-helper', waqfId: WAQF },
    });
    const recorded = await recordReservedMatterChain(await callerFor(MAKER, 'chain-helper'), {
      waqfId: WAQF,
      approvalRequestId: minted.approvalRequestId,
    });
    expect(recorded).toEqual(['PRINCIPAL_CONSENT', 'COUNSEL_REVIEW']);
    const signed = await (
      await callerFor(NAZIR, 'chain-helper-sign')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: minted.approvalRequestId });
    expect(signed.status).toBe('APPROVED');
  });
});
