/**
 * AV7 — ADVERSARY PROBE. WHAT THE APPEND-ONLY TRAIL ACTUALLY RECORDS ABOUT A PAYMENT,
 * AND WHETHER THE PAID AMOUNT CAN BE REWRITTEN WITHOUT ONE.
 *
 * NOT a regression suite. Each `it()` is an attack or its positive control.
 *
 *   1. The whole lifecycle runs (create → submit → approval.approve → execute) and EVERY audit event
 *      it produced is printed and inspected. The question is not "is there a row" — the sibling
 *      suite counts rows — it is "does the row say what happened".
 *   2. Then: a raw `UPDATE` of one beneficiary's `amountSar`, on the RUNTIME credential
 *      (`DATABASE_URL` = `qmulate_app`), on an EXECUTED run, and a count of the audit rows it left.
 *   3. And the same for `runDigest` / `engineVersion` — the two columns migration 21 records as
 *      "NOT write-once", verified here rather than trusted.
 *
 * ⚠ Every row this file creates is hard-deleted in `afterAll`, and the raw mutations are RESTORED to
 * their measured values in the same test that makes them, printed before and after.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THIS FILE'S PERIOD IS INSIDE A QUARTER THAT HAS ALREADY BEEN PAID, AND THE AV7-F2 GUARD WILL
 *   REFUSE IT. MEASURED 2026-08-20 — READ THIS BEFORE LANDING THAT GUARD.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `PERIOD` below is 2026-01-05…2026-03-31, which OVERLAPS the seeded historical run `dist-001`
 * (`waqf-001`, 2026-01-01…2026-03-31, EXECUTED). It was chosen to dodge
 * `distribution_one_live_run_per_period`, which is UNIQUE on the EXACT TRIPLE — so the window sits
 * inside a quarter whose ghallah `dist-001` already distributed, and `rev-001` (SAR 350,000.00,
 * 2026-03-31) is the only income receipt `waqf-001` has in the whole fixture.
 *
 * That is AV7-F2's own shape, and the fix refuses it. MEASURED on a `--reset` → `migrate:deploy` →
 * `db:seed` cluster with the candidate exclusion constraint installed
 * (`EXCLUDE USING gist ("waqfId" WITH =, daterange("periodStart"::date,"periodEnd"::date,'[]')
 * WITH &&) WHERE ("deletedAt" IS NULL AND "status" = 'EXECUTED')`): THIS FILE goes **3 of 4 tests
 * red**, every failure a `23P01` naming the constraint and `dist-001`'s range. Across the five
 * `@qmulate/api` distribution suites the same constraint is 24 of 60 red, and 45 of 60 with the
 * wider `status <> 'CANCELLED'` predicate.
 *
 * ⚠ THE FAILURES ARE TRUE POSITIVES, NOT COLLATERAL: a second EXECUTED run over that window really
 * is the same ghallah distributed twice. So the fix for this file is NOT a looser guard — it is a
 * window of its own (`av7-corpus-wall` shows the pattern: monthly windows the file populates
 * itself) plus its own INCOME and MAINTENANCE ledger rows in it. Cloning `rev-001`'s SAR 350,000.00
 * and `exp-e-001`'s SAR 40,000.00 into a free window reproduces the SAME waterfall — the figures
 * depend on the amounts, not on the dates — so no asserted number here has to move.
 * The full measurement and the candidate constraint live in
 * `packages/database/test/distribution-run-schema.integration.test.ts` §6.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
  warnNoDatabase,
  type TestSubjectSpec,
  bookIncome,
  paidPeriod,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AV7 lifecycle-trail probe');

const createCaller = createCallerFactory(appRouter);
const WAQF = 'waqf-001';
const NOW = new Date('2026-08-18T09:00:00.000Z');
/**
 * ⚠ ALLOCATED, NOT HAND-PICKED — and that is the whole point (AV7-F2, migration 26).
 *
 * This used to read `{ periodStart: '2026-01-05', periodEnd: '2026-03-31' }` with the comment
 * *"a window nothing else occupies (dist-001 = 01-01, sibling = 01-02, av7-audit-trace =
 * 01-03/04)"*. Every word of that was true about the UNIQUE TRIPLE and false about the money: all
 * four windows END on 2026-03-31 and all four therefore contain `rev-001`, the ONE income receipt
 * `waqf-001` has in the entire fixture — a receipt `dist-001` had already paid. Four suites were
 * distributing one receipt four times over and calling it four distinct periods. `paidPeriod()`
 * hands out whole months in a year reserved for this file, so a collision is a TYPE ERROR or a
 * red allocator test rather than a comment nobody can check.
 */
const PERIOD = paidPeriod('av7-lifecycle-trail', 1);

const MAKER = `${API_TEST_PREFIX}av7-life-maker`;
const CHECKER = `${API_TEST_PREFIX}av7-life-checker`;

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
    { id: MAKER, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS },
    { id: CHECKER, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
  ];
}

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId, now: NOW }));

const j = (value: unknown): string =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

describe.runIf(hasDatabase)(
  'AV7 · the trail of a payment, and rewriting one without a trace',
  () => {
    let runId = '';
    let lineIds: readonly string[] = [];
    let firstAuditId = 0n;

    beforeAll(async () => {
      await assertSeeded();
      await provisionTestSubjects(subjects());
      // ⚠ BOOKED BEFORE `firstAuditId` IS TAKEN, DELIBERATELY. `bookIncome` goes through
      // `finance.recordRevenue`, which is audited; capturing the watermark afterwards keeps the
      // booking's own events OUT of the range the first test prints and inspects, so that test
      // still sees exactly the events the LIFECYCLE wrote and nothing else.
      await bookIncome({ waqfId: WAQF, period: PERIOD, tag: 'av7-life' });
      const prisma = await basePrisma();
      const max = await prisma.auditEvent.aggregate({ _max: { id: true } });
      firstAuditId = (max._max.id ?? 0n) + 1n;
    });

    afterAll(async () => {
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
      await cleanupApiTestRows();
      await closeDatabase();
    });

    it('the lifecycle runs, and every audit event it wrote is printed and inspected', async () => {
      const prisma = await basePrisma();

      const created = await (
        await callerFor(MAKER, 'av7-life-create')
      ).distribution.create({
        waqfId: WAQF,
        ...PERIOD,
      });
      runId = created.distributionId;

      const submitted = await (
        await callerFor(MAKER, 'av7-life-submit')
      ).distribution.submit({
        waqfId: WAQF,
        distributionId: runId,
      });
      await (
        await callerFor(CHECKER, 'av7-life-approve')
      ).approval.approve({
        waqfId: WAQF,
        approvalRequestId: submitted.approvalRequestId,
      });
      const posted = await (
        await callerFor(MAKER, 'av7-life-execute')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: runId,
        approvalRequestId: submitted.approvalRequestId,
      });
      expect(posted.status).toBe('EXECUTED');
      lineIds = posted.lineItemIds;
      expect(lineIds.length).toBeGreaterThan(0);

      const events = await prisma.auditEvent.findMany({
        where: { id: { gte: firstAuditId } },
        select: {
          id: true,
          action: true,
          category: true,
          actorId: true,
          entityType: true,
          entityId: true,
          after: true,
          context: true,
        },
        orderBy: { id: 'asc' },
      });
      console.log(`AV7/LIFE ${String(events.length)} audit events:\n${j(events)}`);

      // POSITIVE CONTROL · every event names an actor. Not one is anonymous.
      for (const event of events) expect(event.actorId).not.toBeNull();

      const digest = (
        await prisma.distribution.findUniqueOrThrow({
          where: { id: runId },
          select: { runDigest: true },
        })
      ).runDigest;

      // ── WHAT IS ANCHORED IN THE CHAIN ────────────────────────────────────────────────────────
      // The DISTRIBUTION_POST event carries the digest in its context. THIS is what makes the
      // digest meaningful: the run column is editable, this copy is inside the hash chain.
      // ⚠ THERE ARE TWO. `deriveAction` turns the APPROVED→EXECUTED status move into
      // `DISTRIBUTION_POST` as well, so the extension writes one AND the router writes one. Only the
      // router's carries the authority context; a reader that takes "the" DISTRIBUTION_POST event gets
      // whichever it happened to select.
      const posts = events.filter((event) => event.action === 'DISTRIBUTION_POST');
      console.log(`AV7/LIFE DISTRIBUTION_POST events = ${String(posts.length)}:\n${j(posts)}`);
      expect(posts.length).toBeGreaterThanOrEqual(1);
      const anchored = posts.filter((event) => j(event.context).includes(String(digest)));
      console.log(
        `AV7/LIFE of ${String(posts.length)} DISTRIBUTION_POST events, ${String(anchored.length)} carry the runDigest`,
      );
      expect(anchored.length).toBe(1);

      // The ApprovalRequest CREATE event carries `payloadHash`, which binds the digest at submit.
      const approvalCreate = events.find(
        (event) => event.entityType === 'ApprovalRequest' && event.action === 'CREATE',
      );
      expect(approvalCreate).toBeDefined();
      expect(Object.keys((approvalCreate?.after ?? {}) as Record<string, unknown>)).toContain(
        'payloadHash',
      );

      // ── WHAT IS NOT ─────────────────────────────────────────────────────────────────────────
      // THE FINDING: each line item's event records {id, beneficiaryId}. The AMOUNT that person was
      // paid is in no audit event at all.
      const lineEvents = events.filter((event) => event.entityType === 'DistributionLineItem');
      expect(lineEvents.length).toBe(lineIds.length);
      for (const event of lineEvents) {
        const after = (event.after ?? {}) as Record<string, unknown>;
        expect(Object.keys(after).sort()).toEqual(['beneficiaryId', 'id']);
        expect(Object.keys(after)).not.toContain('amountSar');
        expect(Object.keys(after)).not.toContain('sharePercent');
        expect(Object.keys(after)).not.toContain('status');
      }
    });

    it('ATTACK · a paid amount is rewritten by the RUNTIME role and leaves NO audit row', async () => {
      const prisma = await basePrisma();
      const target = lineIds[0] as string;

      const before = await prisma.distributionLineItem.findUniqueOrThrow({
        where: { id: target },
        select: { amountSar: true, sharePercent: true, status: true },
      });
      const auditBefore = await prisma.auditEvent.count();

      // Raw SQL on the app credential: no Prisma extension, no audit event, no trigger on this column.
      const changed = await prisma.$executeRawUnsafe(
        `UPDATE "distribution_line_item" SET "amountSar" = 999999.99 WHERE "id" = $1`,
        target,
      );
      const after = await prisma.distributionLineItem.findUniqueOrThrow({
        where: { id: target },
        select: { amountSar: true },
      });
      const auditAfter = await prisma.auditEvent.count();

      console.log(
        `AV7/LIFE-ATTACK line=${target} amountSar ${before.amountSar.toString()} -> ` +
          `${after.amountSar.toString()} (rows=${String(changed)}); ` +
          `audit_event ${String(auditBefore)} -> ${String(auditAfter)}`,
      );

      expect(changed).toBe(1);
      expect(after.amountSar.toString()).toBe('999999.99');
      expect(auditAfter).toBe(auditBefore); // ← the whole finding, in one assertion

      // Restore, and prove the restore is equally untraced.
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution_line_item" SET "amountSar" = $2::numeric WHERE "id" = $1`,
        target,
        before.amountSar.toString(),
      );
      const restored = await prisma.distributionLineItem.findUniqueOrThrow({
        where: { id: target },
        select: { amountSar: true },
      });
      expect(restored.amountSar.toString()).toBe(before.amountSar.toString());
      expect(await prisma.auditEvent.count()).toBe(auditBefore);
    });

    it('ATTACK · `runDigest` and `engineVersion` are rewritten on an EXECUTED run, untraced', async () => {
      const prisma = await basePrisma();
      const before = await prisma.distribution.findUniqueOrThrow({
        where: { id: runId },
        select: { status: true, runDigest: true, engineVersion: true },
      });
      expect(before.status).toBe('EXECUTED'); // the terminal state, per the lattice
      const auditBefore = await prisma.auditEvent.count();

      const changed = await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "runDigest" = $2, "engineVersion" = $3 WHERE "id" = $1`,
        runId,
        'd'.repeat(64),
        'e6-distribution/9.9.9-FORGED',
      );
      const after = await prisma.distribution.findUniqueOrThrow({
        where: { id: runId },
        select: { runDigest: true, engineVersion: true },
      });
      const auditAfter = await prisma.auditEvent.count();

      console.log(
        `AV7/LIFE-DIGEST rows=${String(changed)} ${String(before.runDigest)} -> ` +
          `${String(after.runDigest)} | ${String(before.engineVersion)} -> ` +
          `${String(after.engineVersion)}; audit_event ${String(auditBefore)} -> ${String(auditAfter)}`,
      );

      expect(changed).toBe(1);
      expect(after.runDigest).toBe('d'.repeat(64));
      expect(after.engineVersion).toBe('e6-distribution/9.9.9-FORGED');
      expect(auditAfter).toBe(auditBefore);

      // DETECTION EXISTS, and this is the control that makes the finding a MEDIUM and not a HIGH: the
      // chain-anchored DISTRIBUTION_POST event still carries the ORIGINAL digest.
      const posts = await prisma.auditEvent.findMany({
        where: { action: 'DISTRIBUTION_POST', entityId: runId },
        select: { id: true, context: true },
      });
      const anchored = posts.filter((event) => j(event.context).includes(String(before.runDigest)));
      console.log(
        `AV7/LIFE-DIGEST ${String(anchored.length)} of ${String(posts.length)} DISTRIBUTION_POST events still carry the ORIGINAL digest`,
      );
      expect(anchored.length).toBe(1);
      expect(j(posts)).not.toContain('d'.repeat(64));

      await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "runDigest" = $2, "engineVersion" = $3 WHERE "id" = $1`,
        runId,
        before.runDigest,
        before.engineVersion,
      );
    });

    it('POSITIVE CONTROL · the guarded columns REFUSE the same runtime role, by name', async () => {
      const prisma = await basePrisma();
      const messages: string[] = [];
      for (const [label, sql] of [
        [
          'waqf.shartAlWaqif',
          `UPDATE "waqf" SET "shartAlWaqif" = '{"x":1}'::jsonb WHERE "id" = 'waqf-001'`,
        ],
        [
          'transaction.receiptClass',
          `UPDATE "transaction" SET "receiptClass" = 'INCOME' WHERE "id" = 'rev-005'`,
        ],
        ['audit_event UPDATE', `UPDATE "audit_event" SET "actorId" = 'attacker' WHERE "id" = 1`],
      ] as const) {
        try {
          await prisma.$executeRawUnsafe(sql);
          messages.push(`${label}: NOT REFUSED`);
        } catch (error) {
          messages.push(
            `${label}: ${(error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 220)}`,
          );
        }
      }
      console.log(`AV7/LIFE-CONTROL\n  ${messages.join('\n  ')}`);
      expect(messages[0]).toContain('shart_al_waqif is immutable');
      expect(messages[1]).toContain('may not be reclassified IN PLACE');
      // ⚠ As `qmulate_app` the refusal is the GRANT layer, not the trigger — the trigger's own
      // sentence is only reachable by a role that HOLDS update (measured separately on the owner).
      expect(messages[2]).toContain('permission denied for table audit_event');
    });
  },
);
