/**
 * `@qmulate/jobs` — the job vocabulary.
 *
 * **The pg-boss transport lives behind `@qmulate/jobs/pgboss` and is NOT re-exported here**
 * (landed S10/T1 — this header used to say it would land "in Sprint 9 (E9)", which did not
 * happen). This barrel ships *names, payload schemas, schedule metadata* and the in-memory
 * queue; keeping the driver on its own subpath means `apps/web` can enqueue work, and tests can
 * assert on payloads, without ever pulling a queue driver (and its Postgres pool) into their
 * module graph. Railway Cron bindings and the handler registry are the T2 caller stage.
 *
 * ## Rules every job here must honour (PRD §09, §12, §17)
 * - **Idempotent.** Re-running the cron must not double-send a reminder or double-write a state
 *   change. Every enqueue carries an `idempotencyKey`; handlers key their side effects on it.
 * - **Audited.** A job that changes state emits an audit event, with the job as the actor.
 * - **Never mutates a frozen date.** The deadline evaluator computes *state* and emits
 *   notifications. It never rewrites a stored `dueDateGregorian` / `dueDateHijri` — a computed,
 *   displayed, possibly-filed deadline must not shift under the user's feet when a calendar
 *   library updates. Recomputation is an explicit, audited administrative action only.
 * - **Deterministic clock.** Every payload carries `asOf`; no handler reads the wall clock.
 * - **Respects the AML compartment.** Notification fan-out must not tip off a subject.
 */

import { z } from 'zod';

/**
 * The TRANSPORT BOUNDARY (E2): `JobQueue` + `InMemoryJobQueue`.
 *
 * Re-exported here so `import { InMemoryJobQueue } from '@qmulate/jobs'` is the one obvious door,
 * and so the vocabulary and the interface cannot drift into two packages. ⚠ The pg-boss transport
 * (S10/T1) is deliberately NOT on this barrel — `@qmulate/jobs/pgboss` only, so importing a
 * payload schema never imports a database driver. See `src/queue.ts` for why a declared
 * non-human actor is forced in and why `enqueue` deduplicates on `idempotencyKey`.
 */
export {
  InMemoryJobQueue,
  JobQueueError,
  assertJobActor,
  createInMemoryJobQueue,
  jobIdFor,
  type EnqueueResult,
  type InMemoryJobQueueOptions,
  type JobActor,
  type JobHandler,
  type JobHandlerContext,
  type JobQueue,
  type JobQueueErrorCode,
  type JobQueueErrorDetails,
  type RegisteredSchedule,
  type WorkResult,
} from './queue.js';

/** Canonical UTC ISO-8601 instant — the sort/arithmetic truth for every job payload. */
const isoInstant = z.string().datetime({ offset: true });

/** A database identifier (cuid/uuid). Opaque to this package. */
const id = z.string().min(1).max(64);

/**
 * Optional scope narrowing: run for these endowments only.
 *
 * ⚠ ABSENT = EVERY ENDOWMENT THE SEAT HOLDS A GRANT ON — **not** "every live endowment", which is
 * what this line said until S10/T1 and what D1 made false: the service seat runs with the scoping
 * bypass OFF (owner ruling, 2026-08-28), so `scopeFilter` narrows every read to the seat's real
 * grants and an endowment nobody granted the seat is silently invisible to the sweep. That blind
 * spot is G-5's second bound; the coverage control that makes it LOUD (one audit event per
 * ungranted endowment, from an identity OUTSIDE the seat) ships with the T2 caller stage —
 * this docstring correction ships in T1 as documentation only, and must not be read as the
 * control existing yet. Used by admin re-runs and by tests; the scheduled sweep passes nothing.
 */
const waqfScope = z.array(id).min(1).max(500).optional();

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Payload schemas — zod is the source of truth; the TS types are inferred from it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Daily deadline evaluator: recompute derived state, fire pre-alerts, escalate overdue items. */
export const deadlineEvaluateDailyPayload = z.object({
  asOf: isoInstant,
  waqfIds: waqfScope,
});

/** Send one reminder for one deadline at one configured pre-alert offset. */
export const deadlineReminderDispatchPayload = z.object({
  deadlineId: id,
  /** Which configured pre-alert produced this reminder (e.g. `'t-30bd'`). Offsets live in `Setting`. */
  offsetKey: z.string().min(1).max(32),
  asOf: isoInstant,
});

/** Escalate an overdue/at-risk obligation up the operating-model path: owner → Nazir → Leadership. */
export const deadlineEscalatePayload = z.object({
  deadlineId: id,
  /** Rung reached on the escalation ladder. */
  level: z.enum(['owner', 'nazir', 'leadership']),
  asOf: isoInstant,
});

/** Sweep for events that *create* obligations (registration triggers, material changes, istibdal). */
export const complianceTriggerSweepPayload = z.object({
  asOf: isoInstant,
  waqfIds: waqfScope,
});

/** Registration-certificate expiry sweep — raises the update obligation clocked from expiry. */
export const certificateExpirySweepPayload = z.object({
  asOf: isoInstant,
  waqfIds: waqfScope,
});

/** KYC/UBO refresh sweep — flags beneficiary records past the configured refresh window. */
export const kycRefreshSweepPayload = z.object({
  asOf: isoInstant,
  waqfIds: waqfScope,
});

/**
 * Document-retention sweep — reports objects approaching or past their retention date.
 *
 * It **never deletes**. True erasure only happens through the maker/checker, TOTP-gated
 * controlled-deletion workflow; a background job must not be able to destroy a record.
 */
export const documentRetentionSweepPayload = z.object({
  asOf: isoInstant,
});

/** Verify the audit hash chain over a window and raise an alert on any break. */
export const auditChainVerifyPayload = z.object({
  since: isoInstant.optional(),
  until: isoInstant.optional(),
});

/** Deliver one already-composed notification over one channel. */
export const notificationDispatchPayload = z.object({
  notificationId: id,
  channel: z.enum(['email', 'in_app']),
  /** Locale the notification body was composed in. Copy itself comes from `@qmulate/i18n`. */
  locale: z.enum(['ar', 'en']),
});

/** Every job name, and the schema validating its payload. Adding a job means adding it here. */
export const JOB_PAYLOAD_SCHEMAS = {
  'deadline.evaluate.daily': deadlineEvaluateDailyPayload,
  'deadline.reminder.dispatch': deadlineReminderDispatchPayload,
  'deadline.escalate': deadlineEscalatePayload,
  'compliance.trigger.sweep': complianceTriggerSweepPayload,
  'certificate.expiry.sweep': certificateExpirySweepPayload,
  'kyc.refresh.sweep': kycRefreshSweepPayload,
  'document.retention.sweep': documentRetentionSweepPayload,
  'audit.chain.verify': auditChainVerifyPayload,
  'notification.dispatch': notificationDispatchPayload,
} as const;

/** The closed set of job names. */
export const JOB_NAMES = Object.keys(JOB_PAYLOAD_SCHEMAS) as readonly JobName[];

export type JobPayloadSchemas = typeof JOB_PAYLOAD_SCHEMAS;

/** A job name. */
export type JobName = keyof JobPayloadSchemas;

/** Every job name mapped to its validated payload type. */
export type JobPayloads = { [TName in JobName]: z.infer<JobPayloadSchemas[TName]> };

/** The validated payload type for a given job name. */
export type JobPayload<TName extends JobName> = JobPayloads[TName];

/**
 * What is actually enqueued.
 *
 * `idempotencyKey` is **required**, not optional: it is the only thing standing between a cron
 * retry and a beneficiary receiving the same reminder twice. Build it from the natural key of
 * the effect (e.g. `deadline:<id>:offset:<offsetKey>`), never from a timestamp or a random id.
 */
export interface JobEnvelope<TName extends JobName = JobName> {
  readonly name: TName;
  readonly payload: JobPayload<TName>;
  readonly idempotencyKey: string;
  /** Correlation id linking the job back to the request or schedule that produced it. */
  readonly requestId?: string;
  /** Earliest execution instant (UTC ISO-8601). Absent = as soon as a worker is free. */
  readonly runAfter?: string;
}

/** Parse and validate an untrusted payload for a job. Throws a `ZodError` on invalid input. */
export function parseJobPayload<TName extends JobName>(
  name: TName,
  payload: unknown,
): JobPayload<TName> {
  const schema: z.ZodTypeAny = JOB_PAYLOAD_SCHEMAS[name];
  return schema.parse(payload) as JobPayload<TName>;
}

/** Type guard for an unknown string coming off the wire or out of the queue table. */
export function isJobName(value: string): value is JobName {
  return Object.prototype.hasOwnProperty.call(JOB_PAYLOAD_SCHEMAS, value);
}

/** Build a well-formed envelope. The idempotency key is the caller's deliberate choice. */
export function createJobEnvelope<TName extends JobName>(
  name: TName,
  payload: JobPayload<TName>,
  options: { idempotencyKey: string; requestId?: string; runAfter?: string },
): JobEnvelope<TName> {
  return {
    name,
    payload,
    idempotencyKey: options.idempotencyKey,
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    ...(options.runAfter !== undefined ? { runAfter: options.runAfter } : {}),
  };
}

/**
 * Default cron schedules for the jobs that run on a timer.
 *
 * These are **operational defaults, not statutory figures** — but they are still configuration:
 * The T2 caller stage reads the effective schedule from `Setting`/env and treats this map as the
 * seed (a duty this comment once assigned to Sprint 9), so
 * changing when the evaluator runs never requires a code change. Jobs absent from this map are
 * event-driven (enqueued by a request or by another job).
 *
 * Times are Asia/Riyadh: the operating day the deadlines are counted in.
 */
export interface JobSchedule {
  readonly cron: string;
  readonly timeZone: string;
  readonly note: string;
}

export const JOB_SCHEDULE_DEFAULTS: Partial<Record<JobName, JobSchedule>> = {
  'deadline.evaluate.daily': {
    cron: '0 6 * * *',
    timeZone: 'Asia/Riyadh',
    note: 'Recomputes deadline state, fires pre-alerts, escalates. Never rewrites a frozen due date.',
  },
  'compliance.trigger.sweep': {
    cron: '30 6 * * *',
    timeZone: 'Asia/Riyadh',
    note: 'Raises obligations from triggering events (registration, material change, istibdal notice).',
  },
  'certificate.expiry.sweep': {
    cron: '0 7 * * *',
    timeZone: 'Asia/Riyadh',
    note: 'Raises the update obligation clocked from certificate expiry.',
  },
  'kyc.refresh.sweep': {
    cron: '30 7 * * *',
    timeZone: 'Asia/Riyadh',
    note: 'Flags beneficiary KYC/UBO records past the configured refresh window.',
  },
  'document.retention.sweep': {
    cron: '0 3 * * 0',
    timeZone: 'Asia/Riyadh',
    note: 'Reports on retention windows only. Deletion is never automated.',
  },
  'audit.chain.verify': {
    cron: '0 2 * * *',
    timeZone: 'Asia/Riyadh',
    note: 'Verifies the audit hash chain and alerts on any break.',
  },
};
