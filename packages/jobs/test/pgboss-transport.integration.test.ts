/**
 * S10/T1 — the pg-boss transport, proven against a real Postgres.
 *
 * What this file is FOR, in order of importance:
 *
 *   1. THE STRUCTURAL DEDUPE (the stage's own condition): two SEPARATE PgBoss-backed queue
 *      instances racing the same envelope produce exactly ONE created job — enforced by pg-boss's
 *      partial unique index on (queue, singletonKey) inside its own schema, i.e. by Postgres, not
 *      by a check. ⚠ "The queue is configured with one worker" is a deployment fact, not a
 *      guarantee — which is WHY this test runs two instances.
 *   2. THE HONEST DELTA from the in-memory queue: the dedupe window is the pending+active
 *      lifetime, NOT forever — after completion, a same-key enqueue creates a NEW job. Pinned
 *      here so nobody discovers it in production and calls it a regression. (T2's notification
 *      single-flight is the layer that must make the SIDE EFFECT once-per-day, and its
 *      concurrent two-worker proof is owed there, not here.)
 *   3. THE OPTION-B POSTURE, from the queue's own connection: it runs as `qmulate_pgboss`, its
 *      schema is owned by that role, and `public` refuses it BY PRIVILEGE (42501), not by
 *      convention.
 *   4. The contract behaves identically through this door: boundary refusals, handler context,
 *      drain semantics, stop().
 *
 * Needs `PGBOSS_DATABASE_URL` (provision-roles creates the role + schema; dev-postgres injects
 * the URL). Skips LOUDLY without it — a skipped structural proof is not a proven one.
 */

import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { JOB_NAMES, createJobEnvelope, type JobPayload } from '../src/index.js';
import { jobIdFor, type JobActor, type JobHandlerContext } from '../src/queue.js';
import { PGBOSS_SCHEMA, createPgBossJobQueue, type PgBossJobQueue } from '../src/pgboss.js';

const PGBOSS_URL = process.env.PGBOSS_DATABASE_URL?.trim() ?? '';
const hasDatabase = PGBOSS_URL !== '';

if (!hasDatabase) {
  console.warn(
    '⚠ pgboss-transport.integration.test.ts: PGBOSS_DATABASE_URL is not set — the pg-boss ' +
      'transport suite (structural dedupe, Option-B posture) DID NOT RUN. That is a hole in the ' +
      'evidence, not a pass.',
  );
}

const ACTOR: JobActor = { actorType: 'SYSTEM', actorId: 'test:pgboss-transport' };

/** A unique-per-run key prefix so re-runs on a lived-in cluster never collide with old rows. */
const RUN = `run-${process.pid.toString(10)}-${Date.now().toString(36)}`;

const NAME = 'deadline.evaluate.daily' as const;
const PAYLOAD: JobPayload<typeof NAME> = { asOf: '2026-09-01T06:00:00.000+03:00' };

function envelopeWithKey(key: string) {
  return createJobEnvelope(NAME, PAYLOAD, { idempotencyKey: key });
}

const queues: PgBossJobQueue[] = [];
async function makeQueue(): Promise<PgBossJobQueue> {
  const queue = await createPgBossJobQueue({ actor: ACTOR, connectionString: PGBOSS_URL });
  queues.push(queue);
  return queue;
}

afterAll(async () => {
  for (const queue of queues) await queue.stop();
});

describe.runIf(hasDatabase)('S10/T1 · the pg-boss transport', () => {
  it('CONCURRENT FIRST BOOT: two instances starting at once both come up (migrate-on-start race, measured)', async () => {
    // On a fresh --reset cluster this is pg-boss's FIRST contact with its schema, so the two
    // migrate-on-start runs genuinely race (condition 6's question). On a lived-in cluster the
    // migration is a no-op and this still proves concurrent boot is safe — the deploy-restart
    // shape production actually produces.
    const [a, b] = await Promise.all([makeQueue(), makeQueue()]);
    expect(a.actor.actorId).toBe(ACTOR.actorId);
    expect(b.actor.actorId).toBe(ACTOR.actorId);
  });

  it('OPTION-B POSTURE from the live connection: runs as qmulate_pgboss, owns its schema, and public REFUSES it with 42501', async () => {
    const probe = new Client({ connectionString: PGBOSS_URL });
    await probe.connect();
    try {
      const who = await probe.query<{ current_user: string }>('SELECT current_user');
      expect(who.rows[0]?.current_user).toBe('qmulate_pgboss');

      const owner = await probe.query<{ owner: string }>(
        `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = $1`,
        [PGBOSS_SCHEMA],
      );
      expect(owner.rows[0]?.owner).toBe('qmulate_pgboss');

      // The refusal is a PRIVILEGE, not a convention: reading endowment data from the queue
      // credential must die with 42501 (insufficient_privilege). A different error here (e.g.
      // 42P01 undefined_table) would mean the probe proved nothing about privileges.
      await expect(probe.query('SELECT count(*) FROM public.waqf')).rejects.toMatchObject({
        code: '42501',
      });

      // ⚠ THE BOUND THAT MATTERS, asserted where the deviation was decided: the role holds
      // database-level CREATE (measured necessary — Postgres checks it on pg-boss's
      // `CREATE SCHEMA IF NOT EXISTS` even when the schema exists and is owned by the caller)
      // but NEVER schema-level CREATE on `public`. If this flips true, the queue role can put
      // a table beside ours and Option B's whole premise is gone.
      const publicCreate = await probe.query<{ p: boolean }>(
        `SELECT has_schema_privilege('qmulate_pgboss', 'public', 'CREATE') AS p`,
      );
      expect(publicCreate.rows[0]?.p).toBe(false);
    } finally {
      await probe.end();
    }
  });

  it('STRUCTURAL DEDUPE: two instances racing one envelope create exactly ONE job, same derived id, loser flagged', async () => {
    const [a, b] = await Promise.all([makeQueue(), makeQueue()]);
    const key = `${RUN}-race`;

    const [ra, rb] = await Promise.all([
      a.enqueue(envelopeWithKey(key)),
      b.enqueue(envelopeWithKey(key)),
    ]);

    const expectedId = jobIdFor(NAME, key);
    expect(ra.jobId).toBe(expectedId);
    expect(rb.jobId).toBe(expectedId);
    // Exactly one creation. Not "at least", not "usually": the partial unique index makes the
    // count a fact about Postgres, and this assertion is red if both writes ever land.
    expect([ra.deduplicated, rb.deduplicated].filter((d) => d).length).toBe(1);

    // And the database agrees: one row for this key in the pending states.
    const probe = new Client({ connectionString: PGBOSS_URL });
    await probe.connect();
    try {
      const rows = await probe.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${PGBOSS_SCHEMA}.job
          WHERE name = $1 AND singleton_key = $2 AND state IN ('created', 'retry', 'active')`,
        [NAME, key],
      );
      expect(rows.rows[0]?.n).toBe('1');
    } finally {
      await probe.end();
    }
  });

  it('sequential repeat while pending: same id, deduplicated: true, and a drain processes ONE run', async () => {
    const queue = await makeQueue();
    const key = `${RUN}-repeat`;

    const first = await queue.enqueue(envelopeWithKey(key));
    const second = await queue.enqueue(envelopeWithKey(key));
    expect(first.deduplicated).toBe(false);
    expect(second).toEqual({ jobId: jobIdFor(NAME, key), deduplicated: true });

    const seen: JobHandlerContext<typeof NAME>[] = [];
    const result = await queue.work(NAME, async (context) => {
      if (context.idempotencyKey.startsWith(RUN)) seen.push(context);
    });
    expect(result.failed).toEqual([]);
    const mine = seen.filter((context) => context.idempotencyKey === key);
    expect(mine).toHaveLength(1);
    // The handler context carries the DECLARED actor and the validated payload — the same
    // contract facts the in-memory suite pins, proven through the durable door.
    expect(mine[0]?.actor).toEqual(ACTOR);
    expect(mine[0]?.payload).toEqual(PAYLOAD);
    expect(mine[0]?.attempt).toBe(1);
  });

  it('THE HONEST DELTA, pinned: after completion the same key enqueues a NEW job (window = pending+active, not forever)', async () => {
    const queue = await makeQueue();
    const key = `${RUN}-window`;

    await queue.enqueue(envelopeWithKey(key));
    await queue.work(NAME, async () => {
      /* completes the job */
    });

    const after = await queue.enqueue(envelopeWithKey(key));
    // ⚠ If this assertion ever flips — pg-boss starts deduplicating against completed jobs —
    // the transport's semantics CHANGED under an upgrade and T2's side-effect keying must be
    // re-examined, not assumed still-sufficient. The in-memory queue answers `true` here; that
    // divergence is documented in src/pgboss.ts's header and is deliberate.
    expect(after.deduplicated).toBe(false);
  });

  it('boundary refusals fire through this door too: unknown job, blank key, invalid payload, stopped queue, double handler', async () => {
    const queue = await makeQueue();

    await expect(
      queue.enqueue({
        name: 'not.a.job',
        payload: {},
        idempotencyKey: `${RUN}-x`,
      } as never),
    ).rejects.toMatchObject({ code: 'UNKNOWN_JOB' });

    await expect(
      queue.enqueue({ name: NAME, payload: PAYLOAD, idempotencyKey: '   ' } as never),
    ).rejects.toMatchObject({ code: 'MISSING_IDEMPOTENCY_KEY' });

    await expect(
      queue.enqueue({
        name: NAME,
        payload: { asOf: 'not-a-timestamp' },
        idempotencyKey: `${RUN}-bad`,
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });

    await queue.work(NAME, async () => {});
    await expect(queue.work(NAME, async () => {})).rejects.toMatchObject({
      code: 'HANDLER_ALREADY_REGISTERED',
    });

    await queue.stop();
    await expect(queue.enqueue(envelopeWithKey(`${RUN}-stopped`))).rejects.toMatchObject({
      code: 'QUEUE_STOPPED',
    });
    // stop() is idempotent — a second call must not throw.
    await expect(queue.stop()).resolves.toBeUndefined();
  });

  it('a mis-declared actor is refused BEFORE any connection is opened', async () => {
    await expect(
      createPgBossJobQueue({
        actor: { actorType: 'USER', actorId: 'user-1' } as never,
        // An unreachable URL on purpose: if the actor check ran after connect, this would hang
        // or die with a network error instead of INVALID_ACTOR — the order IS the assertion.
        connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/never',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTOR' });
  });

  it('schedule() upserts one cron per queue and validates like the in-memory queue', async () => {
    const queue = await makeQueue();

    await expect(
      queue.schedule(NAME, { cron: '0 6 * * *', timeZone: '' } as never),
    ).rejects.toMatchObject({ code: 'INVALID_SCHEDULE' });

    const registered = await queue.schedule(NAME, { cron: '0 6 * * *', timeZone: 'Asia/Riyadh' });
    expect(registered.name).toBe(NAME);
    // Re-registering replaces rather than accumulates — pg-boss keeps ONE schedule row per
    // (queue, key). Asserted in its own tables so "idempotent" is measured, not narrated.
    await queue.schedule(NAME, { cron: '15 6 * * *', timeZone: 'Asia/Riyadh' });
    const probe = new Client({ connectionString: PGBOSS_URL });
    await probe.connect();
    try {
      const rows = await probe.query<{ cron: string }>(
        `SELECT cron FROM ${PGBOSS_SCHEMA}.schedule WHERE name = $1`,
        [NAME],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.cron).toBe('15 6 * * *');
    } finally {
      await probe.end();
    }
  });

  it('the closed vocabulary exists as real queues: every JOB_NAMES member was created in the pgboss schema', async () => {
    await makeQueue();
    const probe = new Client({ connectionString: PGBOSS_URL });
    await probe.connect();
    try {
      const rows = await probe.query<{ name: string }>(`SELECT name FROM ${PGBOSS_SCHEMA}.queue`);
      const present = new Set(rows.rows.map((row) => row.name));
      for (const name of JOB_NAMES) expect(present.has(name), `queue ${name}`).toBe(true);
    } finally {
      await probe.end();
    }
  });

  it('a failing handler is terminal (retryLimit 0): reported in WorkResult, not silently retried in the same drain', async () => {
    const queue = await makeQueue();
    const key = `${RUN}-fail`;
    await queue.enqueue(envelopeWithKey(key));

    const result = await queue.work(NAME, async (context) => {
      if (context.idempotencyKey === key) throw new Error('deliberate handler failure');
    });
    const mine = result.failed.filter((f) => f.jobId === jobIdFor(NAME, key));
    expect(mine).toHaveLength(1);

    // Terminal means terminal: a second drain (fresh instance — the first now holds the handler
    // registration) must NOT see the failed job again.
    const second = await makeQueue();
    const replay = await second.work(NAME, async (context) => {
      if (context.idempotencyKey === key) throw new Error('the failed job came back');
    });
    expect(replay.failed.filter((f) => f.jobId === jobIdFor(NAME, key))).toEqual([]);
  });
});
