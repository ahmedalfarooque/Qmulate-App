/**
 * S10/T3 — E9's exit, clauses 1 and 2, measured on the wire.
 *
 * "A document is RETRIEVABLE" — register(bytes) → download(bytes), sha256 round-tripped and
 * asserted against the row (whose hash is write-once since migration 47), THROUGH the storage
 * interface contract via the in-memory adapter. ⚠ THE CLAIM'S BOUNDARY, in the sentence that
 * makes it: retrievability is proven against the INTERFACE CONTRACT, not against S3 — the S3
 * adapter and its object-lock proof are owed to the named gate (owner ruling 2026-09-01, (C)).
 *
 * "Its reads are AUDITED" — every download lands a READ_SENSITIVE audit event naming the
 * document, counted in the same run beside a listing that deliberately does NOT audit (metadata
 * is not content; an inflated trail is its own kind of noise).
 *
 * Clause 3 (the delete refusal) is the DATABASE's and is measured in
 * `packages/database/test/document-vault-floor.integration.test.ts` — this surface deliberately
 * has NO delete procedure, so there is nothing here to refuse.
 *
 * Standing posture pinned WITHOUT the T4 pin's job: a beneficiary session cannot even CALL this
 * surface (the preset holds no `document:document:read`) — asserted as the CURRENT refusal
 * shape. ⊕ The scoping-level NAMED PIN for the deed-file ruling (memo `f85bb99`, "b") LANDED in
 * T4 — the last test but one below; its mutation (widen scoping's `Document` branch) killed the
 * pin ALONE while the standing-posture test stayed green, which is precisely the silent-opening
 * scenario the pin exists to catch. (This header said "is T4's, by the no-late-additions rule"
 * when T3 shipped; annotated when T4 delivered it.)
 */

import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  contextFor,
  countAuditEvents,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const OFFICER = `${API_TEST_PREFIX}t3-vault-officer`;
const OUTSIDER = `${API_TEST_PREFIX}t3-vault-outsider`;
const WAQF = 'waqf-001';
const OTHER_WAQF = 'waqf-002';

async function callerFor(userId: string, requestId: string) {
  return createCaller(await contextFor({ userId, requestId }));
}

/** Invented bytes, unique per run so re-runs on one cluster never collide on content. */
const CONTENT = randomBytes(2048);
const CONTENT_B64 = CONTENT.toString('base64');

let documentId = '';

describe.runIf(hasDatabase)('S10/T3 · the vault surface — retrievable, audited', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [WAQF],
        permissions: ['endowment:waqf:read', 'document:document:read', 'document:document:write'],
      },
      {
        id: OUTSIDER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [OTHER_WAQF],
        permissions: ['endowment:waqf:read', 'document:document:read'],
      },
    ]);
  });

  afterAll(async () => {
    // Soft-retire this suite's rows (hard DELETE is exactly what the floor refuses — using the
    // sanctioned path is the point, not an inconvenience). Rows carry deletedAt; the storage
    // objects are per-process in-memory and vanish with the suite.
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      `UPDATE "document" SET "deletedAt" = now()
        WHERE "createdBy" = '${OFFICER}' AND "deletedAt" IS NULL`,
    );
    await cleanupApiTestRows();
  });

  it('CLAUSE 1 · register → download round-trips the exact bytes, hash-verified against the write-once row', async () => {
    const officer = await callerFor(OFFICER, 't3-register');
    const registered = await officer.document.register({
      waqfId: WAQF,
      type: 'financial',
      titleAr: 'قائمة مالية سنوية (وهمية)',
      titleEn: 'Annual financial statement (invented)',
      contentBase64: CONTENT_B64,
    });
    documentId = registered.documentId;

    // Binding rule 3 travels: the seeded retention figure is unverified and the caller sees it.
    expect(registered.unverifiedNote).toContain('unverified');
    expect(registered.retentionUntil).not.toBe('');

    const downloaded = await (
      await callerFor(OFFICER, 't3-download')
    ).document.download({ waqfId: WAQF, documentId });

    expect(downloaded.contentBase64).toBe(CONTENT_B64);
    expect(downloaded.sha256).toBe(registered.sha256);
    expect(downloaded.titleAr).toContain('وهمية');
  });

  it('CLAUSE 2 · the download landed a READ_SENSITIVE event naming the document — and list deliberately did not', async () => {
    const before = await countAuditEvents({ action: 'READ_SENSITIVE', entityId: documentId });
    expect(before, 'the first download must already be on the trail').toBeGreaterThan(0);

    // A listing reads metadata, not content: no event.
    await (await callerFor(OFFICER, 't3-list')).document.list({ waqfId: WAQF });
    expect(await countAuditEvents({ action: 'READ_SENSITIVE', entityId: documentId })).toBe(before);

    // A second download is a second read of client legal/financial content: one more event.
    await (
      await callerFor(OFFICER, 't3-download-2')
    ).document.download({ waqfId: WAQF, documentId });
    expect(await countAuditEvents({ action: 'READ_SENSITIVE', entityId: documentId })).toBe(
      before + 1,
    );
  });

  it("NON-DISCLOSURE · another endowment's officer gets the nonexistent-id shape, not a hint", async () => {
    const outsider = await callerFor(OUTSIDER, 't3-outsider');
    // The WIRE shape is NOT_FOUND — which is the whole §10 §7.2 property: another endowment's
    // document id must be indistinguishable from a nonexistent one, so even the error CODE says
    // nothing about existence (NO_GRANT is the internal cause; NOT_FOUND is what leaves).
    await expect(
      outsider.document.download({ waqfId: OTHER_WAQF, documentId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('STANDING POSTURE · a beneficiary session cannot call the vault surface at all (preset holds no document read)', async () => {
    // The seeded beneficiary seat (Q-E4-1's subject). This is the CURRENT refusal shape — at the
    // permission rung, before scoping is even consulted. T4's named pin adds the scoping-level
    // statement of the deed-file ruling; this arm just pins that today nothing is open.
    const beneficiary = await callerFor('user-beneficiary-ben-001', 't3-beneficiary');
    await expect(beneficiary.document.list({ waqfId: WAQF })).rejects.toMatchObject({
      message: expect.stringContaining('PERMISSION_DENIED') as unknown,
    });
  });

  it('THE NAMED PIN (T4, ruling f85bb99 "b") · the deed FILE does not follow the deed RECORD: scoping itself withholds every endowment-level document from a beneficiary view, while admitting their own rows', async () => {
    /*
     * WHY THIS PIN EXISTS BESIDE THE STANDING-POSTURE TEST ABOVE, which looks like a neighbour
     * doing the same job: that test proves the beneficiary PRESET lacks `document:document:read`
     * — the PERMISSION rung. This one drives the SCOPED CLIENT directly (ctx.db), where no
     * permission rung exists, so the only thing that can withhold the deed is scoping's own
     * `Document` branch (own-`beneficiaryId` rows only). If someone later adds the read verb to
     * the beneficiary preset for an unrelated reason, the standing-posture test goes red and
     * gets UPDATED — and at that exact moment, without this pin, the deed file would open
     * silently. Two layers; only this one states the ruling.
     *
     * THE RULING, cited by name: S10 fourth batch, memo commit `f85bb99`, owner verbatim "b" —
     * the deed FILE does NOT follow the deed RECORD. Beneficiary principals keep Q-E4-1's
     * record read; NO deed file of any type is beneficiary-readable; a beneficiary's document
     * visibility is own-`beneficiaryId` rows only. The memo's caveat, verbatim: "⚠ Not
     * counsel-verified. This is a disclosure decision by the product owner in their capacity as
     * practising Nazir; whether a beneficiary has a *legal right* to a copy of the waqf deed
     * under Saudi law is a question for counsel and is not answered here. If counsel says such
     * a right exists, this row is revisited — and the answer would be a superseding entry,
     * never an edit to this one."
     */
    const officer = await callerFor(OFFICER, 't4-pin-register');
    const deed = await officer.document.register({
      waqfId: WAQF,
      type: 'deed',
      titleAr: 'صك وقفية (وهمي — دبوس T4)',
      contentBase64: Buffer.from('invented deed bytes, T4 pin').toString('base64'),
    });
    const ownKyc = await officer.document.register({
      waqfId: WAQF,
      type: 'kyc',
      titleAr: 'مستند تحقق (وهمي — دبوس T4)',
      contentBase64: Buffer.from('invented kyc bytes, T4 pin').toString('base64'),
      beneficiaryId: 'ben-001',
    });

    const beneficiaryCtx = await contextFor({
      userId: 'user-beneficiary-ben-001',
      requestId: 't4-pin-scoped-view',
    });
    const visible = await beneficiaryCtx.db.document.findMany({
      where: { waqfId: WAQF, deletedAt: null },
      select: { id: true, type: true, beneficiaryId: true },
    });

    // The positive control FIRST, so an empty view can never pass this pin vacuously: the
    // beneficiary's own row IS visible — the branch admits, it does not blanket-deny.
    expect(
      visible.map((row) => row.id),
      "the own-beneficiaryId row must be visible — scoping admits the subject's own documents " +
        '(ruling f85bb99 "b" keeps own rows open; a blanket denial would be a different, ' +
        'unruled posture)',
    ).toContain(ownKyc.documentId);

    // The pin itself: the endowment-level deed file is NOT in the beneficiary's view — and
    // neither is ANY row that is not their own.
    expect(
      visible.map((row) => row.id),
      'ruling f85bb99 "b" (owner, 2026-09-01): the deed FILE does not follow the deed RECORD — ' +
        'an endowment-level type:deed document reached a beneficiary-scoped view. If this went ' +
        "red because scoping's Document branch was widened, that widening silently opened the " +
        'deed file; the branch is CONFIRMED CORRECT AS WRITTEN by the ruling and a change to it ' +
        'needs a superseding owner entry, never an edit.',
    ).not.toContain(deed.documentId);
    for (const row of visible) {
      expect(
        row.beneficiaryId,
        `ruling f85bb99 "b": document ${row.id} (type ${row.type}) is in a beneficiary-scoped ` +
          `view without being their own — beneficiary visibility is own-beneficiaryId rows ONLY`,
      ).toBe('ben-001');
    }
  });

  it('the retention Setting is consumed, never a constant: absence refuses with the DOMAIN vocabulary', async () => {
    // Register against a waqf whose Setting resolution still finds the GLOBAL row — then prove
    // the refusal arm by asking with the Setting temporarily soft-deleted, restored in finally.
    // (Soft-delete + restore of one Setting row, privileged, inside this test only: the global
    // row is not endowment data and the restore is asserted.)
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      `UPDATE "setting" SET "deletedAt" = now() WHERE "key" = 'retention.minimumYears' AND "waqfId" IS NULL`,
    );
    try {
      const officer = await callerFor(OFFICER, 't3-no-setting');
      await expect(
        officer.document.register({
          waqfId: WAQF,
          type: 'correspondence',
          titleAr: 'مراسلة (وهمية)',
          contentBase64: Buffer.from('probe').toString('base64'),
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('SETTING_MISSING') as unknown,
      });
    } finally {
      await raw.$executeRawUnsafe(
        `UPDATE "setting" SET "deletedAt" = NULL WHERE "key" = 'retention.minimumYears' AND "waqfId" IS NULL`,
      );
    }
    const restored = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "setting" WHERE "key" = 'retention.minimumYears' AND "waqfId" IS NULL AND "deletedAt" IS NULL`,
    );
    expect(Number(restored[0]?.n ?? 0), 'the Setting row must be restored').toBe(1);
  });
});
