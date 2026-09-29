/**
 * The pg-boss transport — `PgBossJobQueue`.  (S10/T1)
 *
 * The durable twin of `InMemoryJobQueue`: SAME contract, SAME boundary refusals (shared via
 * `validateEnvelopeAtBoundary`, not copied), SAME derived job id (`jobIdFor`) — backed by
 * pg-boss@12 on the queue's OWN database credential.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ DELIBERATELY NOT EXPORTED FROM THE BARREL (`src/index.ts`).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Import it as `@qmulate/jobs/pgboss`, nowhere else. The barrel is imported by anything that
 * wants a payload schema or `JOB_NAMES` — re-exporting the driver there would pull pg-boss (and
 * its Postgres pool) into the module graph of every such importer. Only `apps/worker` may hold
 * the queue credential, and the subpath keeps that structural: today's dependency graph making it
 * harmless is exactly the sentence this repo has been burned by.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CREDENTIAL AND THE SCHEMA (ADR-0008 round 6 extension, S10/T1 — Option B, chosen)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The connection string MUST be `PGBOSS_DATABASE_URL`, connecting as `qmulate_pgboss` — a role
 * that OWNS schema `pgboss` and holds NOTHING in `public` (provision-roles.ts creates both; the
 * schema name here and `PGBOSS_SCHEMA` there must agree, and the integration suite asserts the
 * posture). pg-boss runs its own DDL inside the one schema its role owns (`migrate: true`), so
 * the queue existing grants `qmulate_app` nothing and touches no guarded table.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT "IDEMPOTENT ON idempotencyKey" MEANS HERE — measured, and narrower than in-memory. HONEST.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every send carries `singletonKey: idempotencyKey`, and every queue is created with
 * `policy: 'exclusive'` — BOTH halves are required, and the second was MEASURED, not read off
 * the option's name: under the default `standard` policy `singletonKey` binds to NO index at all
 * (pg-boss's singleton indexes are policy-scoped partial UNIQUE indexes — `plans.js` job_i1…i8 —
 * and the first run of this suite proved two racing sends both landed). `exclusive` is
 * `job_i6`: UNIQUE (name, singleton_key) WHERE state <= 'active', i.e. at most one job per
 * (queue, key) across created/retry/active, enforced by Postgres. Two concurrent enqueues of one
 * envelope race, exactly one row wins (`ON CONFLICT DO NOTHING`), the loser's `send()` returns
 * `null`, and both callers get the SAME derived `jobId` with the loser marked
 * `deduplicated: true`. The integration suite proves that with two separate PgBoss instances
 * against one database.
 *
 * ⚠ The window is the job's PENDING+ACTIVE lifetime, NOT forever: after the job completes,
 * a fresh enqueue with the same key creates a NEW pg-boss job (the in-memory queue, which never
 * forgets, would have said `deduplicated: true`). That delta is pinned by an integration test
 * rather than hidden. It is the right trade for the real callers — a cron retry or a concurrent
 * duplicate lands inside the window, and every handler additionally keys its SIDE EFFECTS on the
 * idempotency key (the rule at the top of `src/index.ts`), which is what T2's notification
 * single-flight proof is about. Anything needing once-EVER semantics needs a durable record of
 * its own, not a queue row.
 */

import { PgBoss } from 'pg-boss';

import type { JobEnvelope, JobName, JobPayload, JobSchedule } from './index.js';
import { JOB_NAMES, isJobName, parseJobPayload } from './index.js';
import {
  JobQueueError,
  assertJobActor,
  jobIdFor,
  validateEnvelopeAtBoundary,
  type EnqueueResult,
  type JobActor,
  type JobHandler,
  type JobQueue,
  type RegisteredSchedule,
  type WorkResult,
} from './queue.js';

/**
 * The one schema the queue role owns. Spelled here rather than imported from
 * `@qmulate/database/…` on purpose — this package has zero internal dependencies, and the
 * integration suite (which may import both sides) asserts the two constants agree.
 */
export const PGBOSS_SCHEMA = 'pgboss';

/** What a queued envelope looks like inside pg-boss's `data` column. */
interface StoredEnvelope {
  readonly payload: unknown;
  readonly idempotencyKey: string;
  readonly requestId: string;
}

export interface PgBossJobQueueOptions {
  /** ⚠ REQUIRED. The declared non-human identity every handler run is attributed to. */
  readonly actor: JobActor;
  /** `PGBOSS_DATABASE_URL` — the queue role's OWN credential, never `DATABASE_URL`. */
  readonly connectionString: string;
  /** Injected clock, so tests are deterministic. Defaults to the real clock. */
  readonly now?: () => Date;
  /**
   * pg-boss's migrate-on-start. Default `true`: the role owns the schema, so the DDL surface is
   * exactly the schema it may touch. The integration suite measures concurrent boot (two
   * instances starting at once) rather than assuming pg-boss serializes it.
   */
  readonly migrate?: boolean;
  /**
   * Per-queue retry policy overrides (S10/T2). The default stays `retryLimit: 0` — terminal
   * fail, the in-memory twin's semantics — and a caller that wants retries DECLARES them per
   * queue, visibly, rather than inheriting a default nobody chose. `policy: 'exclusive'` is NOT
   * overridable: it is load-bearing for the idempotency contract (see the header) and a queue
   * without it would silently stop deduplicating.
   */
  readonly queueOptions?: Partial<
    Record<JobName, { retryLimit?: number; retryDelaySeconds?: number; retryBackoff?: boolean }>
  >;
}

/**
 * Durable `JobQueue` on pg-boss. Construct via {@link createPgBossJobQueue}, which validates the
 * actor BEFORE opening a connection (a mis-declared worker must fail at boot, not at 06:00).
 */
export class PgBossJobQueue implements JobQueue {
  readonly #actor: JobActor;
  readonly #now: () => Date;
  readonly #boss: PgBoss;
  /** Names a handler has been registered for. Second registration = HANDLER_ALREADY_REGISTERED. */
  readonly #handled = new Set<JobName>();
  #stopped = false;

  private constructor(actor: JobActor, boss: PgBoss, now: () => Date) {
    this.#actor = actor;
    this.#boss = boss;
    this.#now = now;
  }

  /** The declared actor, for a caller that needs to build a matching database context. */
  get actor(): JobActor {
    return this.#actor;
  }

  static async create(options: PgBossJobQueueOptions): Promise<PgBossJobQueue> {
    // Actor first, connection second — the same constructor-time refusal the in-memory queue
    // makes, kept BEFORE any I/O so an unattributable queue never even connects.
    const actor = assertJobActor((options as { actor?: unknown } | undefined)?.actor);

    const boss = new PgBoss({
      connectionString: options.connectionString,
      schema: PGBOSS_SCHEMA,
      migrate: options.migrate ?? true,
    });
    // pg-boss emits 'error' for background maintenance failures; an unhandled emitter tears the
    // process down with no context. Surfacing it on stderr is the worker's log transport.
    boss.on('error', (error: unknown) => {
      console.error('[pg-boss]', error instanceof Error ? error.message : String(error));
    });
    await boss.start();

    // v12 requires queues to exist before send/fetch. The set is closed (JOB_NAMES), so they are
    // created here, idempotently.
    //
    // `policy: 'exclusive'` is LOAD-BEARING for the idempotency contract — see the header: the
    // singleton unique index is policy-scoped, and under the default policy `singletonKey`
    // deduplicates NOTHING (measured on this suite's first run: two racing sends, two rows).
    // A failed job sits OUTSIDE the exclusive window (state > active), so a terminal failure
    // frees its key rather than wedging it forever.
    //
    // `retryLimit: 0` is DELIBERATE for T1: `fail()` is terminal, matching the in-memory queue's
    // 'failed' status — a per-job retry/backoff policy is the caller stage's (T2) decision to
    // make per queue, not a default to inherit silently. It also keeps `work()`'s drain loop
    // finite: with retries on and a zero delay, a failing job would be re-fetchable inside the
    // same drain.
    for (const name of JOB_NAMES) {
      const overrides = options.queueOptions?.[name];
      await boss.createQueue(name, {
        policy: 'exclusive',
        retryLimit: overrides?.retryLimit ?? 0,
        ...(overrides?.retryDelaySeconds !== undefined
          ? { retryDelay: overrides.retryDelaySeconds }
          : {}),
        ...(overrides?.retryBackoff !== undefined ? { retryBackoff: overrides.retryBackoff } : {}),
      });
    }

    return new PgBossJobQueue(actor, boss, options.now ?? ((): Date => new Date()));
  }

  async enqueue<TName extends JobName>(envelope: JobEnvelope<TName>): Promise<EnqueueResult> {
    this.#assertRunning('enqueue');

    const validated = validateEnvelopeAtBoundary(envelope);
    const jobId = jobIdFor(validated.name, validated.idempotencyKey);

    const stored: StoredEnvelope = {
      payload: validated.payload,
      idempotencyKey: validated.idempotencyKey,
      requestId: validated.requestId ?? jobId,
    };

    // `singletonKey` is THE structural dedupe: pg-boss's partial unique index means exactly one
    // (queue, key) row can be pending/active, however many processes race this call. A `null`
    // return IS the dedupe signal, and the caller still gets the same derived jobId either way.
    const sent = await this.#boss.send(validated.name, stored as unknown as object, {
      singletonKey: validated.idempotencyKey,
      ...(validated.runAfter !== undefined ? { startAfter: new Date(validated.runAfter) } : {}),
    });

    return { jobId, deduplicated: sent === null };
  }

  async schedule<TName extends JobName>(
    name: TName,
    schedule: JobSchedule,
  ): Promise<RegisteredSchedule<TName>> {
    this.#assertRunning('schedule');

    if (!isJobName(name)) {
      throw new JobQueueError('UNKNOWN_JOB', `${JSON.stringify(name)} is not a registered job.`, {
        name: String(name),
      });
    }
    const cron = (schedule as { cron?: unknown } | undefined)?.cron;
    const timeZone = (schedule as { timeZone?: unknown } | undefined)?.timeZone;
    if (
      typeof cron !== 'string' ||
      cron.trim() === '' ||
      typeof timeZone !== 'string' ||
      timeZone.trim() === ''
    ) {
      throw new JobQueueError(
        'INVALID_SCHEDULE',
        'a schedule needs a non-blank cron expression AND an explicit time zone. The operating ' +
          'day statutory deadlines are counted in is Asia/Riyadh, and a cron with an implicit ' +
          'zone runs at a different local hour depending on where the container happens to be.',
        { name },
      );
    }

    // pg-boss upserts one schedule per (queue, key); a deploy that re-declares its crons
    // replaces rather than accumulates — the same idempotency the in-memory queue promises.
    //
    // ⚠ A cron-fired job carries NO envelope (pg-boss sends the static `data` below, and the
    // interesting payload fields — `asOf` above all — cannot be static). Whether production cron
    // lives here or in Railway Cron, and how a cron-born job acquires its envelope, is T2's (the
    // caller stage's) decision; this method is the mechanical registration half only.
    await this.#boss.schedule(name, cron, null, { tz: timeZone });
    return { name, schedule };
  }

  async work<TName extends JobName>(name: TName, handler: JobHandler<TName>): Promise<WorkResult> {
    this.#assertRunning('work');

    if (!isJobName(name)) {
      throw new JobQueueError('UNKNOWN_JOB', `${JSON.stringify(name)} is not a registered job.`, {
        name: String(name),
      });
    }
    if (this.#handled.has(name)) {
      throw new JobQueueError(
        'HANDLER_ALREADY_REGISTERED',
        `a handler for ${name} is already registered. Two handlers for one job is an ambiguity ` +
          `about which side effect happened — and the audit trail would record both.`,
        { name },
      );
    }
    this.#handled.add(name);

    // DRAIN, not subscribe: `work()` processes what is pending NOW and returns — the shape a
    // Railway-Cron-triggered worker run needs (wake, drain, exit), and the same observable
    // behaviour as the in-memory queue. pg-boss's long-poll `work()` subscription is deliberately
    // not used here; if T2 wants a resident worker it makes that choice visibly.
    const failed: { jobId: string; error: unknown }[] = [];
    let processed = 0;

    for (;;) {
      const jobs = await this.#boss.fetch<StoredEnvelope>(name, {
        batchSize: 20,
        includeMetadata: true,
      });
      if (jobs.length === 0) break;

      for (const job of jobs) {
        const stored = job.data;
        const contractJobId =
          typeof stored.idempotencyKey === 'string'
            ? jobIdFor(name, stored.idempotencyKey)
            : job.id;
        const now = this.#now();
        try {
          // Re-validated on the way OUT as well as in: the row spent time in a database this
          // process does not own exclusively, and a handler is the last party with a chance to
          // refuse a payload that no longer parses.
          const payload = parseJobPayload(name, stored.payload) as JobPayload<TName>;
          await handler({
            name,
            payload,
            idempotencyKey: stored.idempotencyKey,
            requestId: stored.requestId,
            attempt: job.retryCount + 1,
            actor: this.#actor,
            now,
          });
          await this.#boss.complete(name, job.id);
          processed += 1;
        } catch (error: unknown) {
          // Marked, not deleted. Terminal under the default retryLimit 0 (the in-memory twin's
          // semantics); under a declared per-queue retry policy pg-boss returns it to 'retry'
          // and a later drain re-delivers. Either way it is REPORTED here — a failure absorbed
          // by a retry policy must still be visible to the run that saw it.
          await this.#boss.fail(name, job.id);
          failed.push({ jobId: contractJobId, error });
        }
      }
    }

    return { name, processed, failed };
  }

  async stop(): Promise<void> {
    // Idempotent, never throws on a second call. Queued jobs are durable rows — a stopped queue
    // forgets nothing, which is the property the in-memory queue can only imitate.
    if (this.#stopped) return;
    this.#stopped = true;
    this.#handled.clear();
    await this.#boss.stop({ graceful: true });
  }

  #assertRunning(operation: string): void {
    if (this.#stopped) {
      throw new JobQueueError(
        'QUEUE_STOPPED',
        `${operation} was called on a stopped queue. A stopped queue accepts no work rather than ` +
          `accepting it and dropping it — silently discarded work is indistinguishable from work ` +
          `that ran.`,
        { operation },
      );
    }
  }
}

/**
 * The factory, mirroring `createInMemoryJobQueue`'s shape. Async because a durable queue must
 * connect and (by default) migrate its own schema before it can promise anything.
 */
export async function createPgBossJobQueue(
  options: PgBossJobQueueOptions,
): Promise<PgBossJobQueue> {
  return PgBossJobQueue.create(options);
}
