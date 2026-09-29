/**
 * AV7 — ADVERSARY PROBE. THE TRAIL A RUN LEAVES, AND WHETHER THE DIGEST RE-DERIVES.
 *
 * NOT a regression suite. Every `it()` here is an ATTACK or the POSITIVE CONTROL an attack needs.
 * Nothing in this file is a claim about what SHOULD happen — it prints and asserts what DOES.
 *
 * Targets:
 *   1. `create` writes the run through a PROJECTED `create` (`select: {id, status}`). The audit
 *      extension takes the after-image from the operation's own result, so the question is whether
 *      the ten-year trail records the digest, the amounts and the period — or only two fields.
 *   2. Does the stored `computationTrace.input` re-derive `runDigest` byte-for-byte?
 *   3. Does the digest MOVE when it must (a changed figure, a changed engineVersion) and STAY when
 *      it must (a replay of the same stored input)?
 *
 * ⚠ HARNESS DEBT PAID EXACTLY AS `distribution-run.integration.test.ts` PAYS IT: the runs and line
 * items this file creates are HARD-DELETED in `afterAll` as the migrator with the two retention
 * guards suspended for exactly those prefix-scoped statements, because
 * `@qmulate/database`'s seed suite pins ABSOLUTE `Distribution` / `DistributionLineItem` counts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

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
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AV7 audit-trace + digest-reproducibility probe');

const createCaller = createCallerFactory(appRouter);

const WAQF = 'waqf-001';
/** One fixed instant, as the sibling suite does — see the digest-vs-clock probe for why it matters. */
const NOW = new Date('2026-08-18T09:00:00.000Z');
/** A SECOND instant, one calendar day later in Asia/Riyadh. The attack on reproducibility. */
const NOW_NEXT_DAY = new Date('2026-08-19T09:00:00.000Z');

/** A window no other suite occupies (`dist-001` holds 01-01…03-31; the sibling holds 01-02…03-31). */
const PERIOD = { periodStart: '2026-01-03', periodEnd: '2026-03-31' } as const;
const PERIOD_B = { periodStart: '2026-01-04', periodEnd: '2026-03-31' } as const;

const MAKER = `${API_TEST_PREFIX}av7-maker`;

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

function subjects(): TestSubjectSpec[] {
  return [{ id: MAKER, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS }];
}

const callerFor = async (userId: string, requestId: string, now: Date = NOW) =>
  createCaller(await contextFor({ userId, requestId, now }));

describe.runIf(hasDatabase)('AV7 · the trail a distribution run leaves, and the digest', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());
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

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * ATTACK 1 — what does the audit row for a CREATED run actually contain?
   * ───────────────────────────────────────────────────────────────────────────────────── */

  it('ATTACK 1 · the CREATE audit event for a run records only {id,status} — not the digest, not a halala', async () => {
    const prisma = await basePrisma();
    const caller = await callerFor(MAKER, 'av7-create');

    const created = await caller.distribution.create({ waqfId: WAQF, ...PERIOD });
    expect(created.status).toBe('COMPUTED');
    // POSITIVE CONTROL: the run really does carry the material facts IN THE TABLE.
    const row = await prisma.distribution.findUniqueOrThrow({
      where: { id: created.distributionId },
      select: {
        engineVersion: true,
        runDigest: true,
        distributableSar: true,
        grossRevenueSar: true,
      },
    });
    expect(row.runDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(row.engineVersion).not.toBeNull();

    // POSITIVE CONTROL: an audit event for this row EXISTS and names the actor.
    const events = await prisma.auditEvent.findMany({
      where: { entityType: 'Distribution', entityId: created.distributionId },
      select: { id: true, action: true, actorId: true, waqfId: true, before: true, after: true },
      orderBy: { id: 'asc' },
    });
    console.log(
      'AV7/ATTACK-1 audit events for the created run:',
      JSON.stringify(events, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
    );
    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe('CREATE');
    expect(events[0]?.actorId).toBe(MAKER);

    // THE ATTACK: the after-image is the projected result, so the trail carries TWO fields.
    const after = events[0]?.after as Record<string, unknown> | null;
    expect(after).not.toBeNull();
    expect(Object.keys(after ?? {}).sort()).toEqual(['id', 'status']);
    // Stated as the negative it is: none of the material facts of the run are in the trail.
    expect(Object.keys(after ?? {})).not.toContain('runDigest');
    expect(Object.keys(after ?? {})).not.toContain('engineVersion');
    expect(Object.keys(after ?? {})).not.toContain('distributableSar');
    expect(Object.keys(after ?? {})).not.toContain('computationTrace');
  });

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * ATTACK 2 — does the STORED input re-derive the STORED digest?
   * ───────────────────────────────────────────────────────────────────────────────────── */

  it('ATTACK 2 · the stored computationTrace.input re-derives the stored runDigest exactly', async () => {
    const prisma = await basePrisma();
    const { canonicalizeResult, runDistribution } = await import('@qmulate/domain/distribution');

    const run = await prisma.distribution.findFirstOrThrow({
      where: { waqfId: WAQF, createdBy: MAKER, periodStart: new Date('2026-01-03T00:00:00.000Z') },
      select: { id: true, runDigest: true, engineVersion: true, computationTrace: true },
    });
    const trace = run.computationTrace as Record<string, unknown>;
    const storedInput = trace['input'];
    expect(storedInput).toBeTruthy();

    // ⚠ THE STORED INPUT IS NOT DIRECTLY REPLAYABLE. `serializeInput` JSON-stringifies every
    // `bigint` to a STRING, and the engine's `nonNegativeMinorSchema` is `z.bigint()`. So a naive
    // replay is a zod failure, and this probe reports whether that is so BEFORE reviving.
    let naiveError: string | null = null;
    try {
      runDistribution(storedInput as never);
    } catch (error) {
      naiveError = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'n/a';
    }
    console.log('AV7/ATTACK-2 naive replay of the stored input =>', naiveError ?? 'ACCEPTED');

    // Revive: every key whose name ends in `Minor` is halalas-as-string. Nothing else is numeric.
    const revive = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(revive);
      if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
          out[key] =
            key.endsWith('Minor') && typeof item === 'string' ? BigInt(item) : revive(item);
        }
        return out;
      }
      return value;
    };

    const replayed = runDistribution(revive(storedInput) as never);
    const replayedDigest = createHash('sha256')
      .update(canonicalizeResult(replayed), 'utf8')
      .digest('hex');
    console.log(
      `AV7/ATTACK-2 stored=${String(run.runDigest)} replayed=${replayedDigest} match=${String(
        replayedDigest === run.runDigest,
      )}`,
    );
    expect(replayedDigest).toBe(run.runDigest);

    // AND THE DIGEST MOVES WHEN A FIGURE MOVES — one halala on one receipt.
    const mutated = revive(storedInput) as {
      revenue: { incomeMinor: bigint; receipts: { amountMinor: bigint }[] };
    };
    mutated.revenue.incomeMinor = mutated.revenue.incomeMinor + 1n;
    const firstIncome = mutated.revenue.receipts[0];
    if (firstIncome) firstIncome.amountMinor = firstIncome.amountMinor + 1n;
    const mutatedDigest = createHash('sha256')
      .update(canonicalizeResult(runDistribution(mutated as never)), 'utf8')
      .digest('hex');
    expect(mutatedDigest).not.toBe(run.runDigest);

    // AND WHEN THE ENGINE VERSION MOVES. `ENGINE_VERSION` is a byte of the digest; forge it on a
    // shallow COPY of the result (bigints survive a spread) rather than editing the constant.
    const forgedVersion = { ...replayed, engineVersion: 'e6-distribution/9.9.9' };
    const forgedDigest = createHash('sha256')
      .update(canonicalizeResult(forgedVersion as never), 'utf8')
      .digest('hex');
    console.log(`AV7/ATTACK-2 forged-engineVersion digest=${forgedDigest}`);
    expect(forgedDigest).not.toBe(run.runDigest);
  });

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * ATTACK 3 — the CLOCK is inside the digest. Two runs of one register, two days, two digests.
   * ───────────────────────────────────────────────────────────────────────────────────── */

  it('ATTACK 3 · the same register previewed on two different DAYS produces two different digests', async () => {
    const sameDay1 = await (
      await callerFor(MAKER, 'av7-clock-a', NOW)
    ).distribution.preview({ waqfId: WAQF, ...PERIOD_B });
    const sameDay2 = await (
      await callerFor(MAKER, 'av7-clock-b', NOW)
    ).distribution.preview({ waqfId: WAQF, ...PERIOD_B });
    const nextDay = await (
      await callerFor(MAKER, 'av7-clock-c', NOW_NEXT_DAY)
    ).distribution.preview({ waqfId: WAQF, ...PERIOD_B });

    if (
      sameDay1.status !== 'computed' ||
      sameDay2.status !== 'computed' ||
      nextDay.status !== 'computed'
    ) {
      throw new Error('preview refused; the probe needs a computing run');
    }

    // POSITIVE CONTROL: determinism holds within one instant.
    expect(sameDay2.run.runDigest).toBe(sameDay1.run.runDigest);
    console.log(
      `AV7/ATTACK-3 sameInstant=${sameDay1.run.runDigest}\n` +
        `AV7/ATTACK-3 nextDay     =${nextDay.run.runDigest}\n` +
        `AV7/ATTACK-3 asOf same=${JSON.stringify(sameDay1.run.timing.asOf)} next=${JSON.stringify(nextDay.run.timing.asOf)}\n` +
        `AV7/ATTACK-3 daysUntilDeadline same=${String(sameDay1.run.timing.daysUntilDeadline)} next=${String(nextDay.run.timing.daysUntilDeadline)}`,
    );

    // THE ATTACK: every money figure is identical, and the digest is not.
    expect(nextDay.run.waterfall).toEqual(sameDay1.run.waterfall);
    expect(nextDay.run.totals).toEqual(sameDay1.run.totals);
    expect(nextDay.run.runDigest).not.toBe(sameDay1.run.runDigest);
  });
});
