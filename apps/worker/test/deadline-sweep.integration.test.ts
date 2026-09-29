/**
 * S10/T2 — the caller, measured end to end: two REAL workers, the coverage control's structural
 * proof, and V-4's conjunct (iv) by running THE WORKER BINARY twice.
 *
 * Needs a migrated, seeded database (`DATABASE_URL`) and the queue credential
 * (`PGBOSS_DATABASE_URL`). Skips LOUDLY without them — a skipped two-worker proof is not a
 * proven one. Runs serially (singleFork) and is the FOURTH integration suite; ordering after
 * `@qmulate/jobs#test:integration` lives in turbo.json and CI's task-graph gate checks it.
 *
 * WHAT EACH ARM PROVES, and what it deliberately does not:
 *  · TWO REAL WORKERS: two PgBoss-backed queue instances race the same day's per-endowment
 *    keys and drain CONCURRENTLY against one database. The transport's exclusive window means
 *    each endowment's job is fetched by exactly one worker — so this arm proves the DEPLOYMENT
 *    (two workers do not double-run a day), not the floor.
 *  · THE FLOOR under FORCED same-endowment concurrency: two direct concurrent
 *    `deadline.evaluate` calls for one endowment and one asOf. The interleaving is genuinely
 *    nondeterministic (both may serialize; one may abort on migration 45's index and 25P02 its
 *    transaction) — the INVARIANT asserted is the state: exactly one reminder row per
 *    (recipient, key), and a rerun converges to already-sent. That is the composition the
 *    floor + retry design promises; which interleaving happened on a given run is weather.
 *  · V-4 (iv): the WORKER BINARY (tsx src/index.ts — the same entry Railway Cron starts) runs
 *    TWICE for the same KSA day. Across every evaluator pass this file causes (two module
 *    drains + the forced pair + two binary runs), the fixture deadline's reminder exists
 *    EXACTLY ONCE per recipient — "a reminder fires exactly once ahead of it (idempotent on
 *    cron re-run)", measured on the process, not a harness import.
 *  · STRUCTURAL OUTSIDE: the sweep pointed at an UNGRANTED seat enqueues nothing, while the
 *    coverage control given the same seat id names EVERY live endowment with its real waqfId
 *    under the CONTROL's identity. A control that inherited the seat's view could not pass.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServiceSeatContext } from '@qmulate/api/service-seat';
import { appRouter } from '@qmulate/api/root';
import { createCallerFactory } from '@qmulate/api/trpc';
import {
  SWEEP_COVERAGE_CONTROL_ACTOR_ID,
  runSweepCoverageControl,
} from '@qmulate/database/sweep-coverage';
import { toHijriSnapshot } from '@qmulate/domain/dates';
import { createPgBossJobQueue, type PgBossJobQueue } from '@qmulate/jobs/pgboss';

import {
  DEADLINE_SWEEP_SEAT_ID,
  ksaDayOf,
  runDeadlineSweep,
  sweepIdempotencyKey,
} from '../src/deadline-sweep.js';

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const PGBOSS_URL = process.env.PGBOSS_DATABASE_URL?.trim() ?? '';
const canRun = DATABASE_URL !== '' && PGBOSS_URL !== '';

if (!canRun) {
  console.warn(
    '⚠ deadline-sweep.integration.test.ts: DATABASE_URL and/or PGBOSS_DATABASE_URL not set — ' +
      'the two-worker proof, the coverage structural test and V-4(iv) DID NOT RUN.',
  );
}

const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAQF = 'waqf-001';
const UNGRANTED_SEAT = 'user-service-deadline-sweeper-ungranted-probe';

/** One shared "now" for the whole file: every arm must land on the SAME KSA day. */
const NOW = new Date();
const KSA_DAY = ksaDayOf(NOW);

const queues: PgBossJobQueue[] = [];
async function makeQueue(): Promise<PgBossJobQueue> {
  const queue = await createPgBossJobQueue({
    actor: { actorType: 'SYSTEM', actorId: 'test:worker-sweep' },
    connectionString: PGBOSS_URL,
  });
  queues.push(queue);
  return queue;
}

async function pgQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(sql, params as never[]);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

/** The fixture deadline this file creates: due exactly 15 BD out, so offset 15 fires TODAY. */
let fixtureDeadlineId = '';

async function seatCaller(requestId: string) {
  const ctx = await createServiceSeatContext(DEADLINE_SWEEP_SEAT_ID, { now: NOW, requestId });
  return createCallerFactory(appRouter)(ctx);
}

async function reminderRowsForFixture(): Promise<{ userId: string; key: string }[]> {
  return pgQuery<{ userId: string; key: string }>(
    `SELECT "userId", "payload"->>'idempotencyKey' AS key FROM "notification"
      WHERE "kind" = 'deadline.reminder'
        AND "payload"->>'deadlineId' = $1
      ORDER BY "userId", key`,
    [fixtureDeadlineId],
  );
}

describe.runIf(canRun)('S10/T2 · the caller, end to end', () => {
  beforeAll(async () => {
    // The fixture subject: an UPDATE_15BD deadline anchored NOW — due in 15 business days, so
    // the seeded preAlertOffsetsBd [30,15,7,3,1] fires the 15-offset reminder on THIS tick.
    // Created BY THE SEAT: deadline.compute is a compliance:task:write act, which is exactly
    // the one permission the seat holds — its whole job, done through its own front door.
    // ⚠ BOUND TO A NORMAL TASK, and that binding is load-bearing — measured on this file's first
    // run: an UNBOUND deadline is UNCLASSIFIABLE and the dispatcher refuses to emit anything
    // about it (the G-6 suite's own third test pins exactly that), so an unbound fixture
    // produced ZERO reminders and conjunct (iv) had no subject. The dispatch gate reads the
    // bound task's confidentiality; a seeded NORMAL task on waqf-001 gives it one.
    const tasks = await pgQuery<{ id: string }>(
      `SELECT "id" FROM "compliance_task"
        WHERE "waqfId" = $1 AND "confidentiality" = 'NORMAL' AND "deletedAt" IS NULL
        ORDER BY "id" LIMIT 1`,
      [WAQF],
    );
    expect(tasks[0], 'a seeded NORMAL compliance task on waqf-001 is required').toBeDefined();
    const caller = await seatCaller(`v4-fixture-${KSA_DAY}`);
    const result = await caller.deadline.compute({
      waqfId: WAQF,
      ruleKey: 'UPDATE_15BD',
      anchor: NOW.toISOString(),
      anchorHijri: String(toHijriSnapshot(NOW)),
      complianceTaskId: tasks[0]!.id,
      triggerEvent: `V-4(iv) fixture — reminder due on the sweep day (${KSA_DAY})`,
    });
    fixtureDeadlineId = result.deadline.id;
  });

  afterAll(async () => {
    for (const queue of queues) await queue.stop();
    // Soft-delete this file's deadline rows (the retention guard refuses hard DELETE — that is
    // the guard working). Notifications for a soft-deleted deadline are inert debris; the next
    // run creates a fresh deadline id, so keys never collide across runs.
    const owner = process.env.MIGRATOR_DATABASE_URL?.trim();
    if (owner && fixtureDeadlineId !== '') {
      const client = new Client({ connectionString: owner });
      await client.connect();
      try {
        await client.query(`UPDATE "deadline" SET "deletedAt" = now() WHERE "id" = $1`, [
          fixtureDeadlineId,
        ]);
      } finally {
        await client.end();
      }
    }
  });

  it('the seat is structurally NON-HUMAN: no credential account exists, and none can be created by sign-in', async () => {
    const rows = await pgQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM "account" WHERE "userId" = $1`,
      [DEADLINE_SWEEP_SEAT_ID],
    );
    expect(rows[0]?.n).toBe('0');
  });

  it("TWO REAL WORKERS, ONE DATABASE: concurrent sweeps split the day's jobs, nothing runs twice, reminders land once", async () => {
    const [a, b] = await Promise.all([makeQueue(), makeQueue()]);
    const [first, second] = await Promise.all([runDeadlineSweep(a, NOW), runDeadlineSweep(b, NOW)]);

    // The transport accounting, stated the way the design actually promises it — this block's
    // first form asserted totalEnqueued === grantCount and went RED on its first run (7 for 6):
    // the two sweeps' PHASES OVERLAP, so worker A can complete an endowment's job before worker
    // B enqueues that key, the exclusive window frees on completion (THE HONEST DELTA, pinned in
    // the jobs suite), and B legally creates a second same-day job whose evaluate then reports
    // already-sent. Per-day once-ness was NEVER the transport's guarantee — it is the floor's,
    // asserted on rows below. What the transport DOES promise, and what is asserted:
    const totalEnqueued = first.enqueued + second.enqueued;
    const totalDeduplicated = first.deduplicated + second.deduplicated;
    const grantCount = first.grantedWaqfIds.length;
    expect(grantCount).toBeGreaterThan(0);
    expect(first.grantedWaqfIds).toEqual(second.grantedWaqfIds);
    // every (endowment, day) key produced AT LEAST one job and every enqueue was accounted
    // exactly once — created or deduplicated, never lost;
    expect(totalEnqueued).toBeGreaterThanOrEqual(grantCount);
    expect(totalEnqueued + totalDeduplicated).toBe(2 * grantCount);
    // every CREATED job was processed by exactly one worker (fetch locks via state transition),
    // and nothing failed — a loser's abort would surface here as a failed job, loudly.
    expect(first.processed + second.processed).toBe(totalEnqueued);
    expect([...first.failed, ...second.failed]).toEqual([]);

    // The fixture deadline's 15-BD reminder fired: once per recipient, no more.
    const rows = await reminderRowsForFixture();
    expect(rows.length).toBeGreaterThan(0);
    const distinct = new Set(rows.map((row) => `${row.userId}|${row.key}`));
    expect(distinct.size).toBe(rows.length);

    // Full coverage on the real seat: the control ran and found nothing dark.
    expect(first.coverage).toEqual({ ran: true, ungrantedWaqfIds: [] });
  });

  it('THE FLOOR under FORCED same-endowment concurrency: whatever the interleaving, the state converges to exactly-once', async () => {
    const baseline = await reminderRowsForFixture();

    const [one, two] = await Promise.allSettled([
      (await seatCaller('race-a')).deadline.evaluate({
        waqfId: WAQF,
        asOf: NOW.toISOString(),
        asOfHijri: String(toHijriSnapshot(NOW)),
        triggerEvent: 'forced concurrent evaluate — floor race arm A',
      }),
      (await seatCaller('race-b')).deadline.evaluate({
        waqfId: WAQF,
        asOf: NOW.toISOString(),
        asOfHijri: String(toHijriSnapshot(NOW)),
        triggerEvent: 'forced concurrent evaluate — floor race arm B',
      }),
    ]);

    // Nondeterminism, stated rather than hidden: both may serialize (both fulfilled, the later
    // one counting already-sent), or the loser aborts on migration 45's unique index. What may
    // NOT happen is a second reminder row — and when there IS a loser, ITS WHOLE RUN fails (a
    // 23505 inside an interactive transaction aborts it — 25P02), which is the design: the
    // failure is LOUD, carries the constraint's own signature, and the retry converges. A loser
    // failing for any OTHER reason would be a different bug wearing this test's clothes, so the
    // rejection's shape is asserted, not just its existence.
    const outcomes = [one, two];
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        const message =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        expect(
          /notification_reminder_single_flight|Unique constraint|23505|25P02|current transaction is aborted/i.test(
            message,
          ),
          `the losing run failed for a NON-floor reason: ${message}`,
        ).toBe(true);
      }
    }

    const after = await reminderRowsForFixture();
    expect(after.map((row) => `${row.userId}|${row.key}`).sort()).toEqual(
      baseline.map((row) => `${row.userId}|${row.key}`).sort(),
    );

    // CONVERGENCE: a clean re-run (the retry's shape) succeeds and adds nothing.
    await (
      await seatCaller('race-retry')
    ).deadline.evaluate({
      waqfId: WAQF,
      asOf: NOW.toISOString(),
      asOfHijri: String(toHijriSnapshot(NOW)),
      triggerEvent: 'forced concurrent evaluate — the converging retry',
    });
    expect((await reminderRowsForFixture()).length).toBe(baseline.length);
  });

  it('V-4 (iv): THE WORKER BINARY, twice, same KSA day — exit 0 both times, the reminder count never moves', async () => {
    const before = await reminderRowsForFixture();
    expect(before.length, 'the fixture reminder must exist before the binary runs').toBeGreaterThan(
      0,
    );

    for (const run of [1, 2]) {
      // The binary runs with a DEPLOYMENT-SHAPED env — the same blanking discipline
      // playwright.config.ts applies to the web server, for the same measured reason: the
      // harness chain legitimately holds the privileged URLs, a child env can be overridden but
      // never have a key deleted, and the worker's OWN boot guard REFUSED the un-blanked env on
      // this arm's first run (PrivilegedDatabaseUrlError naming MIGRATOR + SUPERUSER — the
      // guard exercised in anger, which is the only evidence it fires that this suite has).
      // A deployed worker holds DATABASE_URL and PGBOSS_DATABASE_URL, nothing else.
      const result = spawnSync('pnpm', ['exec', 'tsx', 'src/index.ts'], {
        cwd: WORKER_DIR,
        env: {
          ...process.env,
          MIGRATOR_DATABASE_URL: '',
          SUPERUSER_DATABASE_URL: '',
          ACCESS_MATRIX_DATABASE_URL: '',
        },
        encoding: 'utf8',
        timeout: 90_000,
      });
      expect(
        result.status,
        `worker binary run ${String(run)} failed:\n${result.stdout}\n${result.stderr}`,
      ).toBe(0);
      expect(result.stdout).toContain('deadline sweep finished');
    }

    const after = await reminderRowsForFixture();
    expect(after.map((row) => `${row.userId}|${row.key}`).sort()).toEqual(
      before.map((row) => `${row.userId}|${row.key}`).sort(),
    );
  });

  it('STRUCTURALLY OUTSIDE THE SEAT: an ungranted seat sweeps NOTHING while the control names EVERY endowment, under its own identity', async () => {
    // The sweep half: same code, ungranted seat, zero enqueued — the force filter working.
    const queue = await makeQueue();
    const summary = await runDeadlineSweep(queue, NOW, UNGRANTED_SEAT);
    expect(summary.grantedWaqfIds).toEqual([]);
    expect(summary.enqueued).toBe(0);
    expect(summary.processed).toBe(0);

    // The control half (already run inside the sweep, loud-not-lethal): every live endowment
    // reported dark. Re-run directly for the return value AND assert the audit rows carry the
    // CONTROL's identity and each endowment's REAL id — never a summary row, never the seat.
    // The correlation id is UNIQUE PER RUN, deliberately: audit_event is append-only, so a
    // second suite run on the same cluster still sees the first run's events — keying this
    // probe's read on a day-stable id double-counted them (measured: round 2 of one chain saw
    // 12 for 6). Uniqueness here costs nothing; the CONTROL's own ids stay caller-supplied.
    const probeRequestId = `structural-${KSA_DAY}-${String(process.pid)}-${Date.now().toString(36)}`;
    const coverage = await runSweepCoverageControl({
      seatUserId: UNGRANTED_SEAT,
      now: NOW,
      requestId: probeRequestId,
    });
    expect(coverage.grantedWaqfIds).toEqual([]);
    expect(coverage.ungrantedWaqfIds.length).toBeGreaterThan(0);
    expect(coverage.ungrantedWaqfIds).toEqual([...coverage.liveWaqfIds]);

    const events = await pgQuery<{ entityId: string; actorId: string; actorType: string }>(
      `SELECT "entityId", "actorId", "actorType" FROM "audit_event"
        WHERE "action" = 'SWEEP_COVERAGE_GAP'
          AND "context"->>'requestId' = $1
        ORDER BY "entityId"`,
      [probeRequestId],
    );
    expect(events.map((event) => event.entityId)).toEqual([...coverage.ungrantedWaqfIds]);
    for (const event of events) {
      expect(event.actorId).toBe(SWEEP_COVERAGE_CONTROL_ACTOR_ID);
      expect(event.actorId).not.toBe(DEADLINE_SWEEP_SEAT_ID);
      expect(event.actorType).toBe('SYSTEM');
    }
  });

  it('the transport key for this whole file was ONE KSA day', () => {
    // Belt: if the file ever straddles midnight KSA, the arms above stop sharing keys and the
    // dedupe assertions become weather. Fail loudly instead.
    expect(ksaDayOf(new Date())).toBe(KSA_DAY);
    expect(sweepIdempotencyKey(WAQF, KSA_DAY)).toBe(`deadline-evaluate:${WAQF}:${KSA_DAY}`);
  });
});
