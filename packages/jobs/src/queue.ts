/**
 * The job-queue boundary — `JobQueue`, plus an in-memory implementation.
 *
 * Source of truth: `docs/product/prd/17-build-ship-dod.md` (E2 ships "storage/jobs interfaces so
 * features depend on interfaces, not MinIO/pg-boss") and PRD §09/§12 for the four standing rules
 * every job honours. The pg-boss transport LANDED in S10/T1 (`./pgboss.ts` — this header used to
 * say S9/E8, which did not happen); Railway Cron bindings are the T2 caller stage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NO pg-boss IMPORT IN THIS MODULE OR THE BARREL. ON PURPOSE — STILL.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A feature enqueues through this interface and is handed an implementation. That is what keeps
 * `apps/web` free of a queue driver and lets a test assert on what was enqueued without a
 * database. Now that the adapter exists, the same property is kept by the subpath: the driver is
 * `@qmulate/jobs/pgboss` and nothing here or in `src/index.ts` imports it, so a payload-schema
 * importer never acquires a Postgres pool by accident.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE PROPERTIES THIS INTERFACE HAS TO ENCODE (each has its own test)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. **A DECLARED ACTOR IS FORCED IN, NEVER DEFAULTED.** A queue cannot be constructed without
 *    one, and {@link assertJobActor} REFUSES `actorType: 'USER'`. A job that runs as a user is a
 *    job whose writes are attributed to a person who was not there — and, at the approval
 *    boundary, MP-23's "a SYSTEM or SERVICE actor can never produce an approval" only holds
 *    because the actor type is *declared* rather than inherited from whoever happened to enqueue
 *    the work. Sprint 1's `makeSystemContext({actorType:'USER'})` bug was precisely an ambient
 *    context winning over a declared one.
 * 2. **`enqueue` IS IDEMPOTENT ON `idempotencyKey`.** A repeat is a NO-OP that returns the SAME
 *    job id. `JobEnvelope.idempotencyKey` is required (not optional) because it is the only thing
 *    standing between a cron retry and a beneficiary receiving the same distribution reminder
 *    twice. Deduplication lives HERE, in the transport boundary, so every implementation gets it
 *    and no handler has to remember.
 * 3. **THE PAYLOAD IS VALIDATED AT THE BOUNDARY.** `parseJobPayload` runs on the way in, so an
 *    unknown job name or a malformed payload is refused by the enqueuer — the party that still has
 *    a stack trace — rather than by a worker at 06:00 with nobody watching.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY ABSENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · **No wall-clock read inside a handler.** `JobHandlerContext.now` is supplied by the queue and
 *   every payload carries its own `asOf`; a handler that read the clock would compute a different
 *   statutory deadline on a retry than on the first attempt.
 * · **No retry/backoff policy.** That is transport behaviour (pg-boss owns it; the S10/T1
 *   adapter pins `retryLimit: 0` until the T2 caller sets a real per-queue policy), and
 *   inventing one here would be a second policy for the real adapter to disagree with.
 * · **No audit dependency.** Auditing a job's state change is the HANDLER's job, through
 *   `@qmulate/database`'s `withAudit`, using the actor this queue hands it. Importing the database
 *   package here would drag Prisma into the job vocabulary.
 * · **No `deleteJob` / `purge`.** A queue whose contents can be quietly removed is a queue whose
 *   idempotency guarantee cannot be reasoned about. {@link InMemoryJobQueue.reset} exists and is
 *   NOT part of `JobQueue` — it is a test affordance, and it says so.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⊕ BUILT AS WRITTEN (S10/T1): THE pg-boss ADAPTER HAS ITS OWN ROLE AND ITS OWN SCHEMA.
//
// This block used to open "WHEN THE pg-boss ADAPTER LANDS (S9/E8): IT NEEDS ITS OWN ROLE AND ITS
// OWN SCHEMA", written down while the reason was fresh — and the reason held. ADR-0008 round 6
// split the database into three roles; pg-boss creates and manages its own tables, so the obvious
// shortcut — reuse `DATABASE_URL` — would have required granting the RUNTIME role `CREATE` on
// schema `public`, and a runtime that can create a table can create one named after one of ours.
//
// MEASURED as `qmulate_app` at the time: `CREATE SCHEMA` → `42501 permission denied for database`,
// `CREATE TABLE` → `42501 permission denied for schema public`. That posture is unchanged and was
// not loosened: `qmulate_pgboss` OWNS schema `pgboss` (provision-roles.ts creates both), pg-boss
// connects as it via `PGBOSS_DATABASE_URL`, it holds ZERO grants in `public` (CENSUS-G asserts
// that), and the adapter lives at `./pgboss.ts` behind the `@qmulate/jobs/pgboss` subpath.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import {
  JOB_NAMES,
  isJobName,
  parseJobPayload,
  type JobEnvelope,
  type JobName,
  type JobPayload,
  type JobSchedule,
} from './index.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Errors
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Machine codes for queue failures. Human wording is resolved by callers via `@qmulate/i18n`. */
export type JobQueueErrorCode =
  /** The name is not in the closed {@link JOB_NAMES} set. */
  | 'UNKNOWN_JOB'
  /** The payload does not satisfy its job's zod schema. */
  | 'INVALID_PAYLOAD'
  /** `idempotencyKey` is absent, blank, or not a string. */
  | 'MISSING_IDEMPOTENCY_KEY'
  /** The declared actor is missing, blank, or `actorType: 'USER'`. */
  | 'INVALID_ACTOR'
  /** A second handler was registered for a job that already has one. */
  | 'HANDLER_ALREADY_REGISTERED'
  /** Work was requested for a job with no registered handler. */
  | 'NO_HANDLER'
  /** The queue has been stopped; it accepts no further work. */
  | 'QUEUE_STOPPED'
  /** A cron expression or time zone is absent or unusable. */
  | 'INVALID_SCHEDULE';

export type JobQueueErrorDetails = Readonly<Record<string, unknown>>;

export class JobQueueError extends Error {
  readonly code: JobQueueErrorCode;
  readonly messageKey: string;
  readonly details?: JobQueueErrorDetails;

  constructor(code: JobQueueErrorCode, message: string, details?: JobQueueErrorDetails) {
    super(message);
    this.name = 'JobQueueError';
    this.code = code;
    this.messageKey = `errors.jobs.${code}`;
    if (details !== undefined) this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The declared actor
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The non-human identity a job runs as. **Declared by the caller; never inferred.**
 *
 * Structurally the subset of `@qmulate/database`'s `RequestContext` a job needs, spelled here
 * rather than imported so `@qmulate/jobs` keeps zero internal dependencies. A test asserts the
 * field names match.
 *
 * ⊕ CORRECTED S10-3a — THIS COMMENT USED TO SAY THE ADAPTER WOULD BUILD THE CONTEXT, and that is
 * now decided the other way. It read: *"the pg-boss adapter in S9/E8 is where the two meet — it
 * will build a real `makeSystemContext(...)` / SERVICE context from this and hand it to
 * `withAudit`."* Two things changed. (1) The owner ruled the seat's identity (D1, 2026-08-28):
 * `actorType: 'SYSTEM'` with the scoping `bypass` EXPLICITLY `null`, and the context is built by
 * `makeServiceSeatContext()` in `@qmulate/database`, which takes no `bypass` parameter at all.
 * (2) Building it HERE would have required importing `@qmulate/database` into this package,
 * breaking the zero-internal-dependency property this very paragraph exists to protect — and it
 * would have put the construction OUTSIDE ESLint Ban 5's scope, which covers `apps/worker` and
 * `apps/web` and deliberately not this package. So the seat's context is constructed in
 * `apps/worker` and handed to the adapter; the transport stays context-agnostic, as designed.
 *
 * ⚠ `'USER'` IS NOT A MEMBER, AT THE TYPE LEVEL AND AT RUNTIME. A background job that runs as a
 * user attributes its writes to someone who was not there, and at the approval boundary that is
 * the difference between "a Nazir approved this" and "a retry did". The union excludes it and
 * {@link assertJobActor} refuses it anyway, because a value arriving from JSON is not typed.
 */
export interface JobActor {
  readonly actorType: 'SYSTEM' | 'SERVICE';
  /** A stable, non-human identifier, e.g. `worker:deadline-evaluator`. Never a user id. */
  readonly actorId: string;
}

const JOB_ACTOR_TYPES: readonly string[] = ['SYSTEM', 'SERVICE'];

/**
 * Narrows an untrusted value to a {@link JobActor}, or throws `INVALID_ACTOR`.
 *
 * FAILS CLOSED on every unknown: absent, non-object, unknown `actorType`, `'USER'`, blank
 * `actorId`. There is no default actor — "the system" is not a fallback, it is a claim about who
 * did something, and an unattributable write in an append-only >= 10-year trail is worse than a
 * refused one.
 */
export function assertJobActor(value: unknown): JobActor {
  if (typeof value !== 'object' || value === null) {
    throw new JobQueueError(
      'INVALID_ACTOR',
      'a JobQueue requires a DECLARED actor. There is no default and no ambient context: a job ' +
        'writes into an append-only trail, so "who did this" must be stated, not inferred.',
      { actor: value === null ? 'null' : typeof value },
    );
  }

  const candidate = value as { actorType?: unknown; actorId?: unknown };

  if (typeof candidate.actorType !== 'string' || !JOB_ACTOR_TYPES.includes(candidate.actorType)) {
    throw new JobQueueError(
      'INVALID_ACTOR',
      `actorType ${JSON.stringify(candidate.actorType)} is not one of ` +
        `${JOB_ACTOR_TYPES.join(' | ')}. 'USER' is refused explicitly: a background job running ` +
        `as a user attributes its writes to someone who was not there, and at the approval ` +
        `boundary that is the difference between "a Nazir approved this" and "a retry did".`,
      {
        actorType:
          typeof candidate.actorType === 'string'
            ? candidate.actorType
            : typeof candidate.actorType,
      },
    );
  }

  if (typeof candidate.actorId !== 'string' || candidate.actorId.trim() === '') {
    throw new JobQueueError(
      'INVALID_ACTOR',
      'actorId must be a non-blank, stable, non-human identifier (e.g. "worker:deadline-evaluator").',
      { actorType: candidate.actorType },
    );
  }

  return { actorType: candidate.actorType as JobActor['actorType'], actorId: candidate.actorId };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Handlers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Everything a handler is given. Nothing it needs is ambient.
 *
 * `payload` is already validated by `parseJobPayload`, so a handler never re-parses; `now` is
 * supplied rather than read, so a retry computes the same answer as the first attempt; `attempt`
 * is visible so a handler can log it without inventing its own counter; and `actor` is the
 * DECLARED identity every audited write must be attributed to.
 */
export interface JobHandlerContext<TName extends JobName = JobName> {
  readonly name: TName;
  readonly payload: JobPayload<TName>;
  /** The key this job was deduplicated on. Key every side effect on it (PRD §09: idempotent). */
  readonly idempotencyKey: string;
  /** Correlation id linking the job back to the request or schedule that produced it. */
  readonly requestId: string;
  /** 1 for the first run. Supplied by the transport; never derived from a clock. */
  readonly attempt: number;
  /** ⚠ The DECLARED non-human identity. Never a user. See {@link JobActor}. */
  readonly actor: JobActor;
  /** The queue's single clock read for this run. A handler must not read the wall clock itself. */
  readonly now: Date;
}

export type JobHandler<TName extends JobName = JobName> = (
  context: JobHandlerContext<TName>,
) => Promise<void>;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The interface
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** What `enqueue` reports. `deduplicated` is the observable half of the idempotency guarantee. */
export interface EnqueueResult {
  /** Stable id, derived from `(name, idempotencyKey)`. A repeat returns the SAME id. */
  readonly jobId: string;
  /** `true` when an equivalent job was already queued and nothing new was created. */
  readonly deduplicated: boolean;
}

/** A registered recurring schedule. `cron`/`timeZone` are the transport's to interpret. */
export interface RegisteredSchedule<TName extends JobName = JobName> {
  readonly name: TName;
  readonly schedule: JobSchedule;
}

/** What `work` reports after draining the jobs pending for one name. */
export interface WorkResult {
  readonly name: JobName;
  readonly processed: number;
  /** Handler failures, in order. A failed job is NOT silently dropped — see `InMemoryJobQueue`. */
  readonly failed: readonly { readonly jobId: string; readonly error: unknown }[];
}

/**
 * The queue boundary. Four verbs, and no way to ask for less safety than they give.
 *
 * Note what is NOT here: no `enqueueWithoutIdempotency`, no `force`, no `purge`, no way to enqueue
 * a name outside {@link JOB_NAMES}. An interface that offers an escape hatch has no guarantee.
 */
export interface JobQueue {
  /**
   * Enqueue one job. **Idempotent on `envelope.idempotencyKey`** — a repeat is a no-op returning
   * the same `jobId`, and the previously-queued payload is left exactly as it was (a second
   * enqueue must never quietly rewrite work that a worker may already be holding).
   */
  enqueue<TName extends JobName>(envelope: JobEnvelope<TName>): Promise<EnqueueResult>;

  /**
   * Register a recurring schedule. Idempotent per name: re-registering replaces the schedule, so
   * a deploy that re-declares its crons does not accumulate duplicates.
   */
  schedule<TName extends JobName>(
    name: TName,
    schedule: JobSchedule,
  ): Promise<RegisteredSchedule<TName>>;

  /**
   * Register the handler for `name` and drain whatever is already pending for it.
   *
   * A second registration for the same name is `HANDLER_ALREADY_REGISTERED` rather than a silent
   * replacement: two handlers for one job is an ambiguity about which side effect happened.
   */
  work<TName extends JobName>(name: TName, handler: JobHandler<TName>): Promise<WorkResult>;

  /** Stop accepting work. Idempotent, and never throws on a second call. */
  stop(): Promise<void>;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The in-memory implementation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface InMemoryJobQueueOptions {
  /** ⚠ REQUIRED. The declared non-human identity every handler run is attributed to. */
  readonly actor: JobActor;
  /** Injected clock, so tests are deterministic. Defaults to the real clock. */
  readonly now?: () => Date;
}

interface QueuedJob {
  readonly jobId: string;
  readonly name: JobName;
  readonly payload: unknown;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly runAfter: string | null;
  attempts: number;
  status: 'pending' | 'completed' | 'failed';
}

/**
 * In-memory `JobQueue` for local development, the E2 seam, and tests.
 *
 * It enforces the SAME contract the pg-boss adapter must: a declared actor, boundary payload
 * validation, and deduplication on `idempotencyKey`. That is the point — a test proving "the cron
 * retry did not double-send" must exercise the same guarantee production relies on. It is **not**
 * durable and holds nothing across a process restart, so it must never back a deployed worker.
 */
export class InMemoryJobQueue implements JobQueue {
  readonly #actor: JobActor;
  readonly #now: () => Date;
  /** `jobId` -> job. `jobId` is derived from `(name, idempotencyKey)`, which IS the dedupe key. */
  readonly #jobs = new Map<string, QueuedJob>();
  readonly #handlers = new Map<JobName, JobHandler>();
  readonly #schedules = new Map<JobName, JobSchedule>();
  #stopped = false;

  constructor(options: InMemoryJobQueueOptions) {
    // The actor is validated in the CONSTRUCTOR, so a queue cannot exist without a declared,
    // non-human identity. Validating it lazily (at the first handler run) would let a mis-declared
    // worker start up cleanly and fail at 06:00.
    this.#actor = assertJobActor((options as { actor?: unknown } | undefined)?.actor);
    this.#now = options.now ?? ((): Date => new Date());
  }

  /** The declared actor, for a caller that needs to build a matching database context. */
  get actor(): JobActor {
    return this.#actor;
  }

  async enqueue<TName extends JobName>(envelope: JobEnvelope<TName>): Promise<EnqueueResult> {
    this.#assertRunning('enqueue');

    const { name: jobName, idempotencyKey, payload } = validateEnvelopeAtBoundary(envelope);

    const jobId = jobIdFor(jobName, idempotencyKey);
    const existing = this.#jobs.get(jobId);
    if (existing !== undefined) {
      // ⚠ A NO-OP, INCLUDING THE PAYLOAD. The queued work is left exactly as it was: a second
      // enqueue that overwrote the payload would silently change work a worker may already hold,
      // and "idempotent" would mean "last writer wins" instead of "once".
      return { jobId, deduplicated: true };
    }

    this.#jobs.set(jobId, {
      jobId,
      name: jobName,
      payload,
      idempotencyKey,
      requestId: (envelope as { requestId?: string }).requestId ?? jobId,
      runAfter: (envelope as { runAfter?: string }).runAfter ?? null,
      attempts: 0,
      status: 'pending',
    });

    return { jobId, deduplicated: false };
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

    // Idempotent per name: a deploy that re-declares its crons must not accumulate duplicates.
    this.#schedules.set(name, schedule);
    return { name, schedule };
  }

  async work<TName extends JobName>(name: TName, handler: JobHandler<TName>): Promise<WorkResult> {
    this.#assertRunning('work');

    if (!isJobName(name)) {
      throw new JobQueueError('UNKNOWN_JOB', `${JSON.stringify(name)} is not a registered job.`, {
        name: String(name),
      });
    }
    if (this.#handlers.has(name)) {
      throw new JobQueueError(
        'HANDLER_ALREADY_REGISTERED',
        `a handler for ${name} is already registered. Two handlers for one job is an ambiguity ` +
          `about which side effect happened — and the audit trail would record both.`,
        { name },
      );
    }
    this.#handlers.set(name, handler as JobHandler);

    return this.#drain(name);
  }

  async stop(): Promise<void> {
    // Idempotent, and it does NOT clear the queued jobs: a stopped queue that forgot what it held
    // would make "did this reminder go out?" unanswerable. Handlers are released so a restarted
    // queue re-registers them explicitly.
    this.#stopped = true;
    this.#handlers.clear();
  }

  /* ── inspection (NOT part of `JobQueue`) ───────────────────────────────────────────────── */

  /** Jobs still awaiting a handler, oldest first. A test affordance, and it says so. */
  pending(name?: JobName): readonly QueuedJob[] {
    return [...this.#jobs.values()].filter(
      (job) => job.status === 'pending' && (name === undefined || job.name === name),
    );
  }

  /** Every registered schedule. The `schedule()` half of the round-trip. */
  schedules(): readonly RegisteredSchedule[] {
    return [...this.#schedules.entries()].map(([name, schedule]) => ({ name, schedule }));
  }

  /** True once {@link stop} has run. */
  get stopped(): boolean {
    return this.#stopped;
  }

  /**
   * ⚠ TEST AFFORDANCE ONLY, and deliberately NOT on the `JobQueue` interface.
   *
   * Drops every job, handler and schedule. It is not `purge()` and it is not reachable through the
   * interface, because a queue whose contents can be quietly removed is a queue whose idempotency
   * guarantee cannot be reasoned about.
   */
  reset(): void {
    this.#jobs.clear();
    this.#handlers.clear();
    this.#schedules.clear();
    this.#stopped = false;
  }

  /* ── internals ─────────────────────────────────────────────────────────────────────────── */

  async #drain(name: JobName): Promise<WorkResult> {
    const handler = this.#handlers.get(name);
    if (handler === undefined) {
      throw new JobQueueError('NO_HANDLER', `no handler registered for ${name}.`, { name });
    }

    const failed: { jobId: string; error: unknown }[] = [];
    let processed = 0;

    for (const job of [...this.#jobs.values()]) {
      if (job.status !== 'pending' || job.name !== name) continue;

      job.attempts += 1;
      const now = this.#now();
      try {
        await handler({
          name,
          payload: job.payload as JobPayload<JobName>,
          idempotencyKey: job.idempotencyKey,
          requestId: job.requestId,
          attempt: job.attempts,
          actor: this.#actor,
          now,
        });
        job.status = 'completed';
        processed += 1;
      } catch (error: unknown) {
        // A failed job is marked, not deleted: the retry/backoff policy belongs to the transport
        // (pg-boss — `./pgboss.ts` since S10/T1), and swallowing the failure here would make a
        // broken handler invisible.
        job.status = 'failed';
        failed.push({ jobId: job.jobId, error });
      }
    }

    return { name, processed, failed };
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
 * The three boundary checks every transport runs on the way in, extracted so the pg-boss adapter
 * (S10/T1, `./pgboss.ts`) enforces THE SAME refusals as the in-memory queue rather than a copy
 * that happens to agree today. UNKNOWN_JOB / MISSING_IDEMPOTENCY_KEY / INVALID_PAYLOAD — the
 * refusals belong to the CONTRACT, not to an implementation, and `test/queue.test.ts` exercises
 * them through both doors.
 */
export function validateEnvelopeAtBoundary(envelope: unknown): {
  name: JobName;
  idempotencyKey: string;
  payload: unknown;
  requestId: string | undefined;
  runAfter: string | undefined;
} {
  const name = (envelope as { name?: unknown } | undefined)?.name;
  if (!isJobName(typeof name === 'string' ? name : '')) {
    throw new JobQueueError(
      'UNKNOWN_JOB',
      `${JSON.stringify(name)} is not a registered job. The set is closed (${JOB_NAMES.length} ` +
        `names in JOB_PAYLOAD_SCHEMAS); adding a job means adding its payload schema first.`,
      { name: typeof name === 'string' ? name : typeof name },
    );
  }
  const jobName = name as JobName;

  const idempotencyKey = (envelope as { idempotencyKey?: unknown }).idempotencyKey;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw new JobQueueError(
      'MISSING_IDEMPOTENCY_KEY',
      'idempotencyKey is REQUIRED and must be non-blank. It is the only thing standing between ' +
        'a cron retry and a beneficiary receiving the same reminder twice — build it from the ' +
        'natural key of the effect (e.g. "deadline:<id>:offset:t-30bd"), never from a timestamp ' +
        'or a random id, both of which make every retry a fresh job.',
      { name: jobName },
    );
  }

  // VALIDATED AT THE BOUNDARY, by the enqueuer, who still has a stack trace.
  let payload: unknown;
  try {
    payload = parseJobPayload(jobName, (envelope as { payload?: unknown }).payload);
  } catch (error: unknown) {
    throw new JobQueueError(
      'INVALID_PAYLOAD',
      `payload for ${jobName} does not satisfy its schema: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { name: jobName },
    );
  }

  const requestId = (envelope as { requestId?: unknown }).requestId;
  const runAfter = (envelope as { runAfter?: unknown }).runAfter;
  return {
    name: jobName,
    idempotencyKey,
    payload,
    requestId: typeof requestId === 'string' && requestId.trim() !== '' ? requestId : undefined,
    runAfter: typeof runAfter === 'string' && runAfter.trim() !== '' ? runAfter : undefined,
  };
}

/**
 * The deduplication key, made visible.
 *
 * `(name, idempotencyKey)` and nothing else — no timestamp, no counter, no random component — so
 * the same logical effect always maps to the same id, in this process and in the pg-boss adapter
 * that replaces it. Exported so the pg-boss transport (`./pgboss.ts`, S10/T1) derives its own key
 * the SAME way instead of
 * inventing a second scheme that happens to agree today.
 */
export function jobIdFor(name: JobName, idempotencyKey: string): string {
  return `${name}#${idempotencyKey}`;
}

/**
 * Convenience constructor, mirroring `createStorageAdapter`'s shape.
 *
 * There is deliberately no `driver` parameter, STILL — and S10/T1, which added the pg-boss
 * transport, decided AGAINST the discriminator this comment once promised: a factory that can
 * hand back either driver has to import both, which would pull pg-boss into every barrel
 * importer. The two constructors live behind their own doors (`createInMemoryJobQueue` here,
 * `createPgBossJobQueue` in `@qmulate/jobs/pgboss`) and the choice is made where the credential
 * lives: `apps/worker`.
 */
export function createInMemoryJobQueue(options: InMemoryJobQueueOptions): InMemoryJobQueue {
  return new InMemoryJobQueue(options);
}
