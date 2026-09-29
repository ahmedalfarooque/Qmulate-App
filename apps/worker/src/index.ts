/**
 * QMULATE background worker — boot shell + the pg-boss transport (S10/T1).
 *
 * Sprint 1 scope was: prove the worker participates in the **residency guardrail** and the env
 * contract, then exit cleanly. Importing `@qmulate/config/env` parses and validates the
 * environment at module load, so a missing or invalid `DATA_CLASSIFICATION` (or `DATABASE_URL`,
 * `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) fails the process **before** any work is attempted —
 * the app refuses to boot rather than running against an unclassified environment.
 *
 * S10/T1 added the TRANSPORT (this header used to say "Sprint 9 (E9) replaces the body of
 * `main()` with the pg-boss runner" — it was S10). S10/T2 added THE RUNNER ITSELF — the caller
 * V-4 and the S9 close-out have been naming since 2026-08-27: with `PGBOSS_DATABASE_URL`
 * present the worker starts `PgBossJobQueue` (role `qmulate_pgboss`, schema `pgboss`, its own
 * credential — never `DATABASE_URL`), runs ONE day's deadline sweep as the declared service
 * seat (see `deadline-sweep.ts` — per-endowment jobs keyed on the KSA day, migration 45 as the
 * reminder floor, the coverage control after, loud-not-lethal), and exits with the sweep's own
 * verdict. Wake-drain-exit; the tick is Railway Cron (`railway.json`, 03:00 UTC = 06:00
 * Asia/Riyadh). ⚠ The T1 header's "HANDLER REGISTRY IS EMPTY ON PURPOSE" sentence is
 * SUPERSEDED BY T2 DELIVERING THE HANDLER DELIBERATELY — its Ban-5 aside was also imprecise:
 * the ban never listed `makeServiceSeatContext`; what keeps this app bypass-free is that the
 * factory TAKES no bypass while the `bypass:` property ban stands. Without `PGBOSS_DATABASE_URL`
 * the worker stays a validate-and-exit shell, so every existing environment keeps booting
 * unchanged.
 */

/* eslint-disable no-console -- a worker's stdout IS its log transport; structured logging lands with E10/E12. */

import { isFixtureOnly, serverEnv } from '@qmulate/config/env';
import { assertNoPrivilegedDatabaseUrls } from '@qmulate/config/privileged-urls';
import { JOB_NAMES, JOB_SCHEDULE_DEFAULTS } from '@qmulate/jobs';
import { createPgBossJobQueue } from '@qmulate/jobs/pgboss';

import { runDeadlineSweep } from './deadline-sweep.js';

interface LogFields {
  readonly [key: string]: unknown;
}

/** One JSON line per event — the shape a log drain can parse without a sidecar agent. */
function log(level: 'info' | 'warn', message: string, fields: LogFields = {}): void {
  console.log(
    JSON.stringify({
      level,
      time: new Date().toISOString(),
      service: 'qmulate-worker',
      message,
      ...fields,
    }),
  );
}

async function main(): Promise<void> {
  // ⚠ FIRST, BEFORE ANYTHING ELSE (ADR-0008 round 6). A worker that was handed
  // `MIGRATOR_DATABASE_URL` holds ownership of every table and can suspend every guard trigger in the
  // schema — silently, with no test anywhere able to notice. This refuses to start instead. The
  // worker opens no database connection at all today (E9 wires pg-boss), so this costs one call and
  // is in place before the connection exists rather than after.
  assertNoPrivilegedDatabaseUrls('apps/worker');

  // Never log env *values* — only which classification is in force. Secrets must not reach stdout.
  log('info', 'worker started', {
    nodeEnv: serverEnv.NODE_ENV,
    dataClassification: serverEnv.DATA_CLASSIFICATION,
    logLevel: serverEnv.LOG_LEVEL,
  });

  if (!isFixtureOnly()) {
    // Layer 1 of the residency guardrail is the env flag itself; this is the operator-visible
    // reminder that a non-fixture classification means real data rules now apply (KSA residency,
    // PDPL, no fixture seeding). The seed enforces the hard refusal — see @qmulate/database.
    log(
      'warn',
      'DATA_CLASSIFICATION is not fixture-only: real-data controls apply to this environment',
    );
  }

  log('info', 'job vocabulary loaded', {
    jobCount: JOB_NAMES.length,
    jobs: JOB_NAMES,
    scheduled: Object.keys(JOB_SCHEDULE_DEFAULTS),
  });

  const pgbossUrl = process.env.PGBOSS_DATABASE_URL?.trim() ?? '';
  if (pgbossUrl === '') {
    // No queue credential ⇒ the S1 behaviour, unchanged: validate and exit. Every environment
    // that existed before T1 keeps working; attaching the transport is an explicit deployment
    // decision made by supplying the credential, never a surprise a deploy inherits.
    log('info', 'worker shell exiting cleanly — PGBOSS_DATABASE_URL not set, no queue attached');
    process.exitCode = 0;
    return;
  }

  // The queue's OWN credential and identity (S10/T1, Option B): role qmulate_pgboss, schema
  // pgboss. The DECLARED actor is the transport's identity for handler attribution; the SEAT's
  // context is a different identity, constructed inside runDeadlineSweep via
  // createServiceSeatContext (T2, per D1 — note that factory takes no bypass parameter, which
  // is what lets this app construct it while Ban 5's `bypass:` syntax ban stands untouched).
  const queue = await createPgBossJobQueue({
    actor: { actorType: 'SYSTEM', actorId: 'worker:qmulate' },
    connectionString: pgbossUrl,
    // The sweep's DECLARED retry policy (T2): a race loser's transaction aborts on migration
    // 45's floor and must re-run into the already-sent check — retryLimit 0 would leave it
    // failed and the day's evaluation for that endowment undone. 60s delay so a same-drain
    // refetch cannot spin; every other queue keeps the terminal default until its own caller
    // declares otherwise.
    queueOptions: {
      'deadline.evaluate.daily': { retryLimit: 2, retryDelaySeconds: 60, retryBackoff: true },
    },
  });
  log('info', 'pg-boss transport started', { schema: 'pgboss', role: 'qmulate_pgboss' });

  // ⚠ NO pg-boss cron schedules, still: the tick is Railway Cron (apps/worker/railway.json,
  // 03:00 UTC = 06:00 Asia/Riyadh) starting this process — wake, enqueue, drain, exit. A
  // cron-born pg-boss job would carry no envelope, and the enqueuer is the one party allowed
  // to read a clock (the single read below).
  const summary = await runDeadlineSweep(queue, new Date());
  log('info', 'deadline sweep finished', { ...summary });
  if (summary.coverage.ran === false) {
    // LOUD, NOT LETHAL: the control's failure must be visible in every log drain without
    // failing the sweep that DID run. It gets its own line and its own level.
    log('warn', 'sweep-coverage control FAILED — the G-5 blind-spot report did not run', {
      error: summary.coverage.error,
    });
  } else if (summary.coverage.ungrantedWaqfIds.length > 0) {
    log('warn', 'sweep-coverage control: endowments the sweep seat CANNOT SEE', {
      ungrantedWaqfIds: summary.coverage.ungrantedWaqfIds,
    });
  }

  // Wake-drain-exit: no resident subscription, no SIGTERM choreography — the process ends when
  // the day's sweep does (Railway cron restartPolicy NEVER; railway.json). A failed job leaves
  // exit 1 so the cron run itself reads red, ON TOP of the failure being in the summary line —
  // a retry-pending failure is pg-boss state, not a reason to report the tick green.
  await queue.stop();
  log('info', 'queue stopped — sweep run complete', {
    failedJobs: summary.failed.length,
  });
  process.exitCode = summary.failed.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
