/**
 * The deadline sweep — the caller §09 Engine B has been waiting for since S9.  (S10/T2)
 *
 * Shape: WAKE → ENQUEUE per endowment → DRAIN → COVERAGE CONTROL → EXIT. Railway Cron
 * (`apps/worker/railway.json`, 03:00 UTC = 06:00 Asia/Riyadh) starts the worker process; this
 * module does one day's sweep and returns. pg-boss's own cron is deliberately unused — a
 * cron-born pg-boss job carries no envelope (no `asOf`), and the enqueuer is the one party
 * allowed to read a clock.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * IDENTITY — the declared service seat, constructed here and only here (D1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `createServiceSeatContext` resolves the seat's REAL grants; a seat nobody granted anything
 * sweeps nothing (correct), and what it cannot see is the COVERAGE CONTROL's job to report —
 * under the control's own identity, never the seat's, LOUD but not lethal (a broken control
 * must not stop deadline evaluation for the endowments the seat does hold).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * SINGLE-FLIGHT, honestly stated — two layers, neither claiming the other's guarantee
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · TRANSPORT: one pg-boss job per (endowment, KSA day) — `policy: 'exclusive'` gives
 *    at-most-one PENDING job per key. That is a race-narrowing convenience, NOT a per-day
 *    guarantee (a completed job frees its key — measured, "THE HONEST DELTA").
 *  · FLOOR: migration 45's partial unique index on the reminder notification. Two evaluators
 *    that do collide converge: the loser's transaction aborts, its job fails loudly, the retry
 *    (declared below: retryLimit 2) re-runs into the already-sent check.
 *
 * The KSA DAY comes from the repo's own calendar (`civilDateFromInstant(now, 'Asia/Riyadh')`),
 * never a UTC date slice — a UTC-derived key would split the KSA day at 03:00 local and
 * per-endowment-per-day would quietly evaporate for three hours every night. Boundary-pinned in
 * the unit test (00:30 and 23:30 KSA on one KSA day yield the same key).
 *
 * ⚠ The EVALUATOR's own internal "today" remains `civilDateFromUtcDate(asOf)` — the engine's
 * shipped S9-3d convention, not this module's to change; at the 06:00-Riyadh tick the UTC and
 * KSA civil dates agree. This module's KSA day governs the TRANSPORT key only.
 */

import { appRouter } from '@qmulate/api/root';
import { createServiceSeatContext } from '@qmulate/api/service-seat';
import { createCallerFactory } from '@qmulate/api/trpc';
import { runSweepCoverageControl } from '@qmulate/database/sweep-coverage';
import { civilDateFromInstant, toHijriSnapshot } from '@qmulate/domain/dates';
import { createJobEnvelope, type JobQueue } from '@qmulate/jobs';

/** The seat's principal row (seeded; non-human, no credential — see seed/map.ts's entry). */
export const DEADLINE_SWEEP_SEAT_ID = 'user-service-deadline-sweeper';

/** The KSA civil day of an instant, as the transport key's day component. */
export function ksaDayOf(instant: Date): string {
  return String(civilDateFromInstant(instant, 'Asia/Riyadh'));
}

/** One job per (endowment, KSA day). Deterministic — a cron re-tick reuses the same key. */
export function sweepIdempotencyKey(waqfId: string, ksaDay: string): string {
  return `deadline-evaluate:${waqfId}:${ksaDay}`;
}

export interface DeadlineSweepSummary {
  readonly ksaDay: string;
  readonly grantedWaqfIds: readonly string[];
  readonly enqueued: number;
  readonly deduplicated: number;
  readonly processed: number;
  readonly failed: readonly { readonly jobId: string; readonly message: string }[];
  readonly coverage:
    | { readonly ran: true; readonly ungrantedWaqfIds: readonly string[] }
    | { readonly ran: false; readonly error: string };
}

/**
 * One day's sweep. `now` is the tick's single clock read, taken by the caller (`src/index.ts`)
 * — everything downstream is deterministic in it.
 *
 * `seatUserId` defaults to THE deployment seat and exists for one reason: the coverage
 * control's STRUCTURAL test points this same code at an ungranted seat and watches the sweep
 * emit nothing while the control names every endowment — a proof about the code path, which a
 * hardcoded id would put out of reach. Production callers never pass it.
 */
export async function runDeadlineSweep(
  queue: JobQueue,
  now: Date,
  seatUserId: string = DEADLINE_SWEEP_SEAT_ID,
): Promise<DeadlineSweepSummary> {
  const ksaDay = ksaDayOf(now);
  const requestId = `deadline-sweep:${ksaDay}`;

  // The seat's view, ONCE, for the enqueue phase: which endowments may it sweep at all.
  const seatContext = await createServiceSeatContext(seatUserId, { now, requestId });
  const grantedWaqfIds = [...new Set(seatContext.grants.map((grant) => grant.waqfId))].sort();

  let enqueued = 0;
  let deduplicated = 0;
  for (const waqfId of grantedWaqfIds) {
    const result = await queue.enqueue(
      createJobEnvelope(
        'deadline.evaluate.daily',
        { asOf: now.toISOString(), waqfIds: [waqfId] },
        { idempotencyKey: sweepIdempotencyKey(waqfId, ksaDay), requestId },
      ),
    );
    if (result.deduplicated) deduplicated += 1;
    else enqueued += 1;
  }

  // DRAIN. Each job gets a FRESH seat context — a retry must re-resolve grants, not inherit a
  // view from the enqueue phase (a grant revoked mid-day narrows the next attempt, correctly).
  const callerFor = createCallerFactory(appRouter);
  const work = await queue.work('deadline.evaluate.daily', async (job) => {
    const waqfId = job.payload.waqfIds?.[0];
    if (waqfId === undefined || job.payload.waqfIds?.length !== 1) {
      throw new Error(
        `deadline sweep: expected exactly one waqfId per job, got ${JSON.stringify(job.payload.waqfIds)} ` +
          `(key ${job.idempotencyKey}) — the per-endowment key promises per-endowment payloads.`,
      );
    }
    const asOfDate = new Date(job.payload.asOf);
    const ctx = await createServiceSeatContext(seatUserId, {
      now: job.now,
      requestId: job.requestId,
    });
    await callerFor(ctx).deadline.evaluate({
      waqfId,
      asOf: job.payload.asOf,
      asOfHijri: toHijriSnapshot(asOfDate),
      triggerEvent: `scheduled daily sweep (${job.idempotencyKey}, attempt ${String(job.attempt)})`,
    });
  });

  // THE COVERAGE CONTROL — after the sweep, LOUD NOT LETHAL: its failure is reported in the
  // summary and the exit code stays the sweep's own. It runs under ITS OWN identity and reads
  // outside the seat's view (see @qmulate/database/sweep-coverage's header for the structure).
  let coverage: DeadlineSweepSummary['coverage'];
  try {
    const result = await runSweepCoverageControl({ seatUserId, now, requestId });
    coverage = { ran: true, ungrantedWaqfIds: result.ungrantedWaqfIds };
  } catch (error: unknown) {
    coverage = { ran: false, error: error instanceof Error ? error.message : String(error) };
  }

  return {
    ksaDay,
    grantedWaqfIds,
    enqueued,
    deduplicated,
    processed: work.processed,
    failed: work.failed.map((failure) => ({
      jobId: failure.jobId,
      message: failure.error instanceof Error ? failure.error.message : String(failure.error),
    })),
    coverage,
  };
}
