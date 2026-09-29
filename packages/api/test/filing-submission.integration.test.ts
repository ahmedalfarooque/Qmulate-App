/**
 * `filing-submission.integration.test.ts` — S8-Q6: a filing's `SUBMITTED` needs a checker (G-3).
 *
 * Owner ruling 2026-08-23 (memo, S8 addendum second batch, verbatim selection: "Require approval
 * (Recommended)"): a status change to `submitted` needs an APPROVED maker≠checker `GOVT_FILING`
 * approval — the money-movement shape, on the filing board. This file drives the ruled chain at
 * the wire and the guard at the database:
 *
 *   1. the happy path — request → approve (a DIFFERENT seat) → markSubmitted, approval SPENT;
 *   2. the refusals a wire caller meets — unapproved, wrong-subject;
 *   3. the refusals raw SQL meets — migration 35's trigger on UPDATE, on INSERT (born SUBMITTED),
 *      on approval reuse, and on re-pointing the evidence column;
 *   4. the LIVENESS half (the sprint's lesson, stated up front): the manual statuses stay a plain
 *      audited write — a gate on `SUBMITTED` must not lock the whole board.
 *
 * ⚠ ON A PROVISIONED ENDOWMENT, never the seeded filing rows (`gov-001…004` belong to
 * waqf-001/003 and other suites read their statuses). All subjects are test-prefixed and purged.
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
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

const createCaller = createCallerFactory(appRouter);

const FILING_WAQF = 'waqf-test-api-q6-filing';
/** The maker: may record statuses and raise a submission; may never approve one. */
const FILING_MAKER = `${API_TEST_PREFIX}q6-case-manager`;
/** The checker: the nazir seat Q6 confirms — `approval:request:approve` is the A*. */
const FILING_NAZIR = `${API_TEST_PREFIX}q6-nazir`;

const MAKER_PERMISSIONS = [
  'compliance:filing:read',
  'compliance:filing:write',
  'approval:request:read',
  'approval:request:initiate',
];

const NAZIR_PERMISSIONS = [
  'compliance:filing:read',
  'compliance:filing:approve',
  'approval:request:read',
  'approval:request:approve',
];

function dualNow(): { at: string; atHijri: string } {
  const at = new Date();
  return { at: at.toISOString(), atHijri: toHijriSnapshot(at) };
}

if (!hasDatabase) warnNoDatabase('filing-submission');

describe.skipIf(!hasDatabase)('S8-Q6 · GovernmentFiling submission needs a checker (G-3)', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionIntakeEndowment({ id: FILING_WAQF, classification: 'SMALL' });
    await provisionTestSubjects([
      {
        id: FILING_MAKER,
        role: 'CASE_MANAGER',
        waqfIds: [FILING_WAQF],
        permissions: MAKER_PERMISSIONS,
      },
      { id: FILING_NAZIR, role: 'NAZIR', waqfIds: [FILING_WAQF], permissions: NAZIR_PERMISSIONS },
    ]);
  });

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 1 · LIVENESS FIRST — the manual board is a plain audited write (BR-603)
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('LIVENESS · a manual status is recorded without any approval, and audited', async () => {
    const ctx = await contextFor({ userId: FILING_MAKER, requestId: 'q6-manual' });
    const caller = createCaller(ctx);

    const row = await caller.filing.setStatus({
      waqfId: FILING_WAQF,
      platform: 'BALADI',
      status: 'IN_PROGRESS',
      ...dualNow(),
    });
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.approvalRequestId).toBeNull();

    // ACCEPTED / REJECTED record the AUTHORITY's own decision — deliberately ungated.
    const rejected = await caller.filing.setStatus({
      waqfId: FILING_WAQF,
      platform: 'BALADI',
      status: 'REJECTED',
      ...dualNow(),
    });
    expect(rejected.status).toBe('REJECTED');

    const board = await caller.filing.list({ waqfId: FILING_WAQF });
    expect(board.filings.map((entry) => entry.platform)).toContain('BALADI');
    // BR-603 on the wire: no screen may imply a live integration.
    expect(board.manualStatusNote).toContain('not a live integration');
  });

  it('SUBMITTED is unrepresentable through the manual verb — the input type is the transport gate', async () => {
    const ctx = await contextFor({ userId: FILING_MAKER, requestId: 'q6-manual-submit' });
    await expect(
      createCaller(ctx).filing.setStatus({
        waqfId: FILING_WAQF,
        platform: 'BALADI',
        status: 'SUBMITTED' as never,
        ...dualNow(),
      }),
    ).rejects.toThrow();
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 2 · THE RULED CHAIN — request → approve (different seat) → markSubmitted, approval spent
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('THE CHAIN · maker requests, the nazir approves, the maker submits — and the approval is SPENT', async () => {
    const makerCtx = await contextFor({ userId: FILING_MAKER, requestId: 'q6-chain-request' });
    const maker = createCaller(makerCtx);

    const raised = await maker.filing.requestSubmission({
      waqfId: FILING_WAQF,
      platform: 'AWQAF_DIGITAL',
    });
    expect(raised.status).toBe('PENDING');

    // BEFORE approval: markSubmitted is refused, naming the approval's state — not a bare throw.
    let earlyError: unknown;
    try {
      await maker.filing.markSubmitted({
        waqfId: FILING_WAQF,
        platform: 'AWQAF_DIGITAL',
        approvalRequestId: raised.approvalRequestId,
        ...dualNow(),
      });
    } catch (error) {
      earlyError = error;
    }
    expect(String((earlyError as { message?: string }).message)).toContain('PENDING');

    // The CHECKER approves — a different human, the nazir seat (Q6: "the approver seat stays nazir").
    await createCaller(
      await contextFor({ userId: FILING_NAZIR, requestId: 'q6-chain-approve' }),
    ).approval.approve({ waqfId: FILING_WAQF, approvalRequestId: raised.approvalRequestId });

    const auditBefore = await countAuditEvents({ action: 'UPDATE', waqfId: FILING_WAQF });

    const submitted = await maker.filing.markSubmitted({
      waqfId: FILING_WAQF,
      platform: 'AWQAF_DIGITAL',
      approvalRequestId: raised.approvalRequestId,
      ...dualNow(),
    });
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.approvalRequestId).toBe(raised.approvalRequestId);
    expect(submitted.lastUpdated).not.toBeNull();
    expect(submitted.lastUpdatedHijri).not.toBeNull();

    // The approval reached its terminal state WITH the submission — one approval, one submission.
    const prisma = await basePrisma();
    const approval = await prisma.approvalRequest.findFirstOrThrow({
      where: { id: raised.approvalRequestId },
      select: { status: true, makerId: true, checkerId: true },
    });
    expect(String(approval.status)).toBe('EXECUTED');
    expect(approval.makerId).toBe(FILING_MAKER);
    expect(approval.checkerId).toBe(FILING_NAZIR);
    expect(approval.makerId).not.toBe(approval.checkerId);

    expect(await countAuditEvents({ action: 'UPDATE', waqfId: FILING_WAQF })).toBeGreaterThan(
      auditBefore,
    );
  });

  it('an approval for ONE filing is not a licence for ANOTHER — wrong subject, refused by name', async () => {
    const makerCtx = await contextFor({ userId: FILING_MAKER, requestId: 'q6-wrong-subject' });
    const maker = createCaller(makerCtx);

    // A fresh, APPROVED authority naming the QIWA row…
    const qiwa = await maker.filing.requestSubmission({ waqfId: FILING_WAQF, platform: 'QIWA' });
    await createCaller(
      await contextFor({ userId: FILING_NAZIR, requestId: 'q6-wrong-subject-approve' }),
    ).approval.approve({ waqfId: FILING_WAQF, approvalRequestId: qiwa.approvalRequestId });

    // …aimed at the MUQEEM row. Refused with the subject named (C-14's sentence).
    await maker.filing.setStatus({
      waqfId: FILING_WAQF,
      platform: 'MUQEEM',
      status: 'IN_PROGRESS',
      ...dualNow(),
    });
    let thrown: unknown;
    try {
      await maker.filing.markSubmitted({
        waqfId: FILING_WAQF,
        platform: 'MUQEEM',
        approvalRequestId: qiwa.approvalRequestId,
        ...dualNow(),
      });
    } catch (error) {
      thrown = error;
    }
    expect(String((thrown as { message?: string }).message)).toContain('naming THIS filing row');

    // The QIWA approval is still APPROVED and unspent — a refused submission consumes nothing.
    const prisma = await basePrisma();
    const approval = await prisma.approvalRequest.findFirstOrThrow({
      where: { id: qiwa.approvalRequestId },
      select: { status: true },
    });
    expect(String(approval.status)).toBe('APPROVED');
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 3 · THE DATABASE IS THE DECIDING SIDE — migration 35, on the APP connection
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('raw SQL meets the same wall: no-approval UPDATE, born-SUBMITTED INSERT, spent reuse, re-point', async () => {
    const prisma = await basePrisma();

    // (a) A bare UPDATE into SUBMITTED with no approval at all — 42501, naming G-3 and the ruling.
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "government_filing" WHERE "waqfId" = $1 AND "platform" = 'BALADI'`,
      FILING_WAQF,
    );
    const baladiId = rows[0]?.id;
    expect(baladiId, 'the liveness test above recorded a BALADI row').toBeDefined();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "government_filing" SET "status" = 'SUBMITTED' WHERE "id" = $1`,
        baladiId,
      ),
    ).rejects.toThrow(/S8-Q6|self-approved/);

    // (b) A filing BORN SUBMITTED — the INSERT arm (migration 14's V1/AV-5 lesson, one table over).
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "government_filing" ("id","waqfId","platform","status","updatedAt")
           VALUES ('q6-born-submitted', $1, 'EJAR', 'SUBMITTED', now())`,
        FILING_WAQF,
      ),
    ).rejects.toThrow(/S8-Q6|self-approved/);

    // (c) The SPENT approval from the happy path cannot authorise a second submission:
    //     move AWQAF_DIGITAL out of SUBMITTED (the Authority answered), then try to re-enter with
    //     the EXECUTED approval still recorded on the row. `p_allow_spent := false` is the guard.
    await prisma.$executeRawUnsafe(
      `UPDATE "government_filing" SET "status" = 'REJECTED' WHERE "waqfId" = $1 AND "platform" = 'AWQAF_DIGITAL'`,
      FILING_WAQF,
    );
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "government_filing" SET "status" = 'SUBMITTED' WHERE "waqfId" = $1 AND "platform" = 'AWQAF_DIGITAL'`,
        FILING_WAQF,
      ),
    ).rejects.toThrow(/EXECUTED'?, not APPROVED/);

    // (d) Re-pointing the evidence column OUTSIDE a submission — rewriting which authority a
    //     recorded submission rests on — is its own refusal.
    const qiwaRows = await prisma.$queryRawUnsafe<
      { id: string; approvalRequestId: string | null }[]
    >(
      `SELECT "id", "approvalRequestId" FROM "government_filing" WHERE "waqfId" = $1 AND "platform" = 'QIWA'`,
      FILING_WAQF,
    );
    const qiwaId = qiwaRows[0]?.id;
    expect(qiwaId, 'the wrong-subject test above created the QIWA row').toBeDefined();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "government_filing" SET "approvalRequestId" = 'q6-fabricated' WHERE "id" = $1`,
        qiwaId,
      ),
    ).rejects.toThrow(/re-pointing|may only change/i);
  });
});
