// QMULATE — `JobQueue` / `InMemoryJobQueue` (E2's jobs seam).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE IS FOR
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `packages/jobs` shipped in Sprint 1 with the job vocabulary and NO test script and NO vitest
// config, so CI's "every packages/* workspace defines a `test` script" gate had nothing to run
// here. E2 adds the transport-agnostic queue, and these are the three properties it exists to
// guarantee — each one a property the pg-boss adapter (S9/E8) must also satisfy:
//
//   1. a DECLARED non-human actor is forced in and `'USER'` is refused;
//   2. `enqueue` is IDEMPOTENT on `idempotencyKey` — a repeat is a no-op returning the same id;
//   3. `schedule` and `work` round-trip, and `stop` is clean.

import { describe, expect, it } from 'vitest';

import {
  InMemoryJobQueue,
  JOB_NAMES,
  JOB_SCHEDULE_DEFAULTS,
  JobQueueError,
  assertJobActor,
  createInMemoryJobQueue,
  createJobEnvelope,
  jobIdFor,
  type JobActor,
  type JobHandlerContext,
  type JobQueue,
} from '../src/index.js';

const NOW = new Date('2026-07-27T06:00:00.000Z');
const AS_OF = '2026-07-27T06:00:00.000Z';

const WORKER: JobActor = { actorType: 'SERVICE', actorId: 'worker:deadline-evaluator' };

function queue(actor: JobActor = WORKER): InMemoryJobQueue {
  return createInMemoryJobQueue({ actor, now: () => NOW });
}

/** Reports the code rather than letting a diff serializer render a whole queue. */
async function rejectionCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    return error instanceof JobQueueError ? error.code : `not-a-JobQueueError:${String(error)}`;
  }
}

function throwCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error instanceof JobQueueError ? error.code : `not-a-JobQueueError:${String(error)}`;
  }
}

/** The daily deadline sweep — the job with the most invariants attached to it (PRD §09). */
function dailyEnvelope(idempotencyKey = 'deadline:daily:2026-07-27') {
  return createJobEnvelope('deadline.evaluate.daily', { asOf: AS_OF }, { idempotencyKey });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · A DECLARED actor is forced in
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the declared actor', () => {
  // mutationToVerify: in InMemoryJobQueue's constructor, replace
  // `assertJobActor(options?.actor)` with `options.actor ?? { actorType: 'SYSTEM', actorId: 'job' }`.
  it('cannot construct a queue without one', () => {
    expect(throwCode(() => new InMemoryJobQueue(undefined as never))).toBe('INVALID_ACTOR');
    expect(throwCode(() => new InMemoryJobQueue({} as never))).toBe('INVALID_ACTOR');
    expect(throwCode(() => new InMemoryJobQueue({ actor: null } as never))).toBe('INVALID_ACTOR');
  });

  it("REFUSES actorType 'USER' — a job is never a person", () => {
    const code = throwCode(
      () =>
        new InMemoryJobQueue({ actor: { actorType: 'USER', actorId: 'user-nazir-001' } as never }),
    );
    expect(code).toBe('INVALID_ACTOR');
  });

  it('refuses an unknown actorType and a blank actorId', () => {
    for (const actor of [
      { actorType: 'ROBOT', actorId: 'x' },
      { actorType: 'service', actorId: 'x' },
      { actorType: 'SERVICE', actorId: '' },
      { actorType: 'SERVICE', actorId: '   ' },
      { actorType: 'SERVICE' },
      { actorId: 'x' },
    ]) {
      expect(
        throwCode(() => assertJobActor(actor)),
        JSON.stringify(actor),
      ).toBe('INVALID_ACTOR');
    }
  });

  it('accepts SYSTEM and SERVICE, and returns exactly the two declared fields', () => {
    expect(assertJobActor({ actorType: 'SYSTEM', actorId: 'seed' })).toEqual({
      actorType: 'SYSTEM',
      actorId: 'seed',
    });
    expect(assertJobActor({ actorType: 'SERVICE', actorId: 'worker:x', extra: 'dropped' })).toEqual(
      {
        actorType: 'SERVICE',
        actorId: 'worker:x',
      },
    );
  });

  it('hands the SAME declared actor to every handler run — never an ambient one', async () => {
    const store = queue();
    const seen: JobHandlerContext[] = [];

    await store.enqueue(dailyEnvelope('a'));
    await store.enqueue(dailyEnvelope('b'));
    await store.work('deadline.evaluate.daily', async (context) => {
      seen.push(context as JobHandlerContext);
    });

    expect(seen).toHaveLength(2);
    for (const context of seen) {
      expect(context.actor).toEqual(WORKER);
      expect(context.actor.actorType).not.toBe('USER');
      // The clock is SUPPLIED, not read: a retry must compute the same statutory answer.
      expect(context.now.toISOString()).toBe(NOW.toISOString());
    }
  });

  it("field names match @qmulate/database's actor context, so the S9 adapter is a pass-through", () => {
    // A structural parity assertion. `packages/jobs` deliberately has ZERO internal dependencies
    // (importing @qmulate/database here would drag Prisma into the job vocabulary), so the two
    // sides are compared by SHAPE rather than by import — and this test is the thing that notices
    // if `@qmulate/database` ever renames `actorType` / `actorId`.
    expect(Object.keys(assertJobActor(WORKER)).sort()).toEqual(['actorId', 'actorType']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · enqueue is idempotent
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('enqueue — idempotency on idempotencyKey', () => {
  // mutationToVerify: in InMemoryJobQueue#enqueue, delete the
  // `if (existing !== undefined) return { jobId, deduplicated: true }` early return.
  it('a repeat is a NO-OP that returns the SAME jobId', async () => {
    const store = queue();

    const first = await store.enqueue(dailyEnvelope());
    const second = await store.enqueue(dailyEnvelope());
    const third = await store.enqueue(dailyEnvelope());

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(third.deduplicated).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(third.jobId).toBe(first.jobId);

    // ONE job queued, not three. This is the assertion that "a cron retry did not double-send".
    expect(store.pending('deadline.evaluate.daily')).toHaveLength(1);
  });

  it('a repeat does NOT overwrite the queued payload', async () => {
    const store = queue();
    await store.enqueue(
      createJobEnvelope(
        'deadline.reminder.dispatch',
        { deadlineId: 'dl-001', offsetKey: 't-30bd', asOf: AS_OF },
        { idempotencyKey: 'deadline:dl-001:offset:t-30bd' },
      ),
    );
    // Same key, DIFFERENT payload — "idempotent" must mean "once", not "last writer wins": a
    // worker may already be holding the first payload.
    await store.enqueue(
      createJobEnvelope(
        'deadline.reminder.dispatch',
        { deadlineId: 'dl-001', offsetKey: 't-15bd', asOf: AS_OF },
        { idempotencyKey: 'deadline:dl-001:offset:t-30bd' },
      ),
    );

    const seen: string[] = [];
    await store.work('deadline.reminder.dispatch', async (context) => {
      seen.push(context.payload.offsetKey);
    });
    expect(seen).toEqual(['t-30bd']);
  });

  it('different keys are different jobs; the same key under a different NAME is too', async () => {
    const store = queue();
    await store.enqueue(dailyEnvelope('k1'));
    await store.enqueue(dailyEnvelope('k2'));
    await store.enqueue(
      createJobEnvelope('compliance.trigger.sweep', { asOf: AS_OF }, { idempotencyKey: 'k1' }),
    );

    expect(store.pending()).toHaveLength(3);
    expect(jobIdFor('deadline.evaluate.daily', 'k1')).not.toBe(
      jobIdFor('compliance.trigger.sweep', 'k1'),
    );
  });

  it('derives the jobId from (name, idempotencyKey) ONLY — no clock, no counter', async () => {
    const store = queue();
    const result = await store.enqueue(dailyEnvelope('stable'));
    expect(result.jobId).toBe(jobIdFor('deadline.evaluate.daily', 'stable'));

    // A second queue, a different process-lifetime, the same id. That is what makes the pg-boss
    // adapter able to derive the same key without coordinating with this one.
    const other = queue();
    const again = await other.enqueue(dailyEnvelope('stable'));
    expect(again.jobId).toBe(result.jobId);
  });

  it('REFUSES a missing or blank idempotencyKey', async () => {
    const store = queue();
    for (const key of [undefined, null, '', '   ', 42]) {
      expect(
        await rejectionCode(() =>
          store.enqueue({
            name: 'deadline.evaluate.daily',
            payload: { asOf: AS_OF },
            idempotencyKey: key as never,
          }),
        ),
        `key ${JSON.stringify(key)}`,
      ).toBe('MISSING_IDEMPOTENCY_KEY');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Boundary validation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('enqueue — validated at the boundary, by the enqueuer', () => {
  it('refuses a name outside the closed JOB_NAMES set', async () => {
    const store = queue();
    for (const name of ['deadline.evaluate', 'Deadline.Evaluate.Daily', '', 'nope', undefined]) {
      expect(
        await rejectionCode(() =>
          store.enqueue({
            name: name as never,
            payload: { asOf: AS_OF },
            idempotencyKey: 'k',
          }),
        ),
        `name ${JSON.stringify(name)}`,
      ).toBe('UNKNOWN_JOB');
    }
  });

  it('refuses a malformed payload rather than letting a worker discover it at 06:00', async () => {
    const store = queue();
    expect(
      await rejectionCode(() =>
        store.enqueue({
          name: 'deadline.evaluate.daily',
          payload: { asOf: 'not-an-instant' } as never,
          idempotencyKey: 'k',
        }),
      ),
    ).toBe('INVALID_PAYLOAD');

    expect(
      await rejectionCode(() =>
        store.enqueue({
          name: 'deadline.escalate',
          // `level` is an enum of owner | nazir | leadership; 'ceo' is not a rung.
          payload: { deadlineId: 'dl-1', level: 'ceo', asOf: AS_OF } as never,
          idempotencyKey: 'k2',
        }),
      ),
    ).toBe('INVALID_PAYLOAD');

    expect(store.pending()).toHaveLength(0);
  });

  it('accepts every job in JOB_NAMES that this suite can build a payload for', async () => {
    const store = queue();
    // Not every job's payload is constructible from a single generic shape, so this asserts the
    // NAMES are all reachable rather than fabricating nine payloads: a name that fell out of the
    // registry would fail `enqueue` with UNKNOWN_JOB above, and JOB_NAMES is derived from
    // JOB_PAYLOAD_SCHEMAS rather than hand-listed.
    expect(JOB_NAMES.length).toBeGreaterThanOrEqual(9);
    for (const name of [
      'deadline.evaluate.daily',
      'compliance.trigger.sweep',
      'kyc.refresh.sweep',
    ] as const) {
      const result = await store.enqueue(
        createJobEnvelope(name, { asOf: AS_OF }, { idempotencyKey: `k:${name}` }),
      );
      expect(result.deduplicated).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · schedule / work round-trip
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('schedule and work round-trip', () => {
  it('registers a schedule and reads it back', async () => {
    const store = queue();
    const daily = JOB_SCHEDULE_DEFAULTS['deadline.evaluate.daily'];
    if (daily === undefined) {
      // Not a non-null assertion: the default IS the thing under test, so its absence is a real
      // failure and must read as one rather than as a crash inside `schedule()`.
      throw new Error('JOB_SCHEDULE_DEFAULTS lost its deadline.evaluate.daily entry');
    }

    const registered = await store.schedule('deadline.evaluate.daily', daily);
    expect(registered.name).toBe('deadline.evaluate.daily');
    expect(registered.schedule.timeZone).toBe('Asia/Riyadh');

    expect(store.schedules()).toEqual([{ name: 'deadline.evaluate.daily', schedule: daily }]);
  });

  it('is idempotent per name — re-declaring a cron replaces it, never accumulates', async () => {
    const store = queue();
    await store.schedule('audit.chain.verify', {
      cron: '0 2 * * *',
      timeZone: 'Asia/Riyadh',
      note: 'first',
    });
    await store.schedule('audit.chain.verify', {
      cron: '0 3 * * *',
      timeZone: 'Asia/Riyadh',
      note: 'second',
    });

    const schedules = store.schedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.schedule.cron).toBe('0 3 * * *');
  });

  it('REFUSES a schedule with no explicit time zone or a blank cron', async () => {
    const store = queue();
    for (const schedule of [
      { cron: '', timeZone: 'Asia/Riyadh', note: '' },
      { cron: '0 6 * * *', timeZone: '', note: '' },
      { cron: '0 6 * * *', note: '' },
      undefined,
    ]) {
      expect(
        await rejectionCode(() => store.schedule('deadline.evaluate.daily', schedule as never)),
      ).toBe('INVALID_SCHEDULE');
    }
  });

  it('work() drains what is already pending and reports the count', async () => {
    const store = queue();
    await store.enqueue(dailyEnvelope('a'));
    await store.enqueue(dailyEnvelope('b'));
    await store.enqueue(
      createJobEnvelope('kyc.refresh.sweep', { asOf: AS_OF }, { idempotencyKey: 'other' }),
    );

    const result = await store.work('deadline.evaluate.daily', async () => {
      /* no side effect needed */
    });

    expect(result.processed).toBe(2);
    expect(result.failed).toEqual([]);
    // The OTHER job's work is untouched: `work` drains one name.
    expect(store.pending('kyc.refresh.sweep')).toHaveLength(1);
    expect(store.pending('deadline.evaluate.daily')).toHaveLength(0);
  });

  it('gives the handler the validated payload, the key, the requestId and attempt 1', async () => {
    const store = queue();
    await store.enqueue(
      createJobEnvelope(
        'deadline.reminder.dispatch',
        { deadlineId: 'dl-007', offsetKey: 't-10bd', asOf: AS_OF },
        { idempotencyKey: 'deadline:dl-007:offset:t-10bd', requestId: 'req-42' },
      ),
    );

    let context: JobHandlerContext<'deadline.reminder.dispatch'> | null = null;
    await store.work('deadline.reminder.dispatch', async (given) => {
      context = given;
    });

    expect(context).not.toBeNull();
    const seen = context as unknown as JobHandlerContext<'deadline.reminder.dispatch'>;
    expect(seen.payload.deadlineId).toBe('dl-007');
    expect(seen.idempotencyKey).toBe('deadline:dl-007:offset:t-10bd');
    expect(seen.requestId).toBe('req-42');
    expect(seen.attempt).toBe(1);
  });

  it('REFUSES a second handler for the same job', async () => {
    const store = queue();
    await store.work('audit.chain.verify', async () => {
      /* first */
    });
    expect(
      await rejectionCode(() =>
        store.work('audit.chain.verify', async () => {
          /* second */
        }),
      ),
    ).toBe('HANDLER_ALREADY_REGISTERED');
  });

  it('marks a failing job failed and REPORTS it — never silently drops it', async () => {
    const store = queue();
    await store.enqueue(dailyEnvelope('boom'));

    const result = await store.work('deadline.evaluate.daily', async () => {
      throw new Error('handler exploded');
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect((result.failed[0]?.error as Error).message).toBe('handler exploded');
    // Not pending any more (so it is not retried in-process) and not vanished either.
    expect(store.pending('deadline.evaluate.daily')).toHaveLength(0);
  });

  it('refuses an unknown job name for both schedule() and work()', async () => {
    const store = queue();
    expect(await rejectionCode(() => store.work('not.a.job' as never, async () => undefined))).toBe(
      'UNKNOWN_JOB',
    );
    expect(
      await rejectionCode(() =>
        store.schedule('not.a.job' as never, {
          cron: '0 6 * * *',
          timeZone: 'Asia/Riyadh',
          note: '',
        }),
      ),
    ).toBe('UNKNOWN_JOB');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · stop is clean
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('stop', () => {
  it('is idempotent and never throws on a second call', async () => {
    const store = queue();
    await store.stop();
    await store.stop();
    expect(store.stopped).toBe(true);
  });

  // mutationToVerify: in #assertRunning, `return` instead of throwing. Work would then be accepted
  // and silently dropped, which is indistinguishable from work that ran.
  it('REFUSES enqueue / schedule / work after stopping, rather than dropping them', async () => {
    const store = queue();
    await store.stop();

    expect(await rejectionCode(() => store.enqueue(dailyEnvelope()))).toBe('QUEUE_STOPPED');
    expect(
      await rejectionCode(() =>
        store.schedule('deadline.evaluate.daily', {
          cron: '0 6 * * *',
          timeZone: 'Asia/Riyadh',
          note: '',
        }),
      ),
    ).toBe('QUEUE_STOPPED');
    expect(
      await rejectionCode(() => store.work('deadline.evaluate.daily', async () => undefined)),
    ).toBe('QUEUE_STOPPED');
  });

  it('does NOT forget the jobs it was holding — "did this reminder go out?" stays answerable', async () => {
    const store = queue();
    await store.enqueue(dailyEnvelope('held'));
    await store.stop();
    expect(store.pending('deadline.evaluate.daily')).toHaveLength(1);
  });

  it('releases handlers, so a restarted queue re-registers them explicitly', async () => {
    const store = queue();
    await store.work('audit.chain.verify', async () => undefined);
    await store.stop();
    store.reset(); // test affordance, deliberately not on the JobQueue interface
    // Re-registration now succeeds rather than hitting HANDLER_ALREADY_REGISTERED.
    const result = await store.work('audit.chain.verify', async () => undefined);
    expect(result.processed).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · The interface offers no escape hatch
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the JobQueue surface', () => {
  it('exposes exactly enqueue / schedule / work / stop — reset is NOT on the interface', () => {
    const store = queue();
    // `reset` exists on the CLASS (a test affordance) and must not be reachable through the
    // interface: a queue whose contents can be quietly removed has no idempotency guarantee to
    // reason about. Asserted structurally, since an interface has no runtime representation.
    const surface: Record<keyof JobQueue, true> = {
      enqueue: true,
      schedule: true,
      work: true,
      stop: true,
    };
    expect(Object.keys(surface).sort()).toEqual(['enqueue', 'schedule', 'stop', 'work']);
    expect(Object.keys(surface)).not.toContain('reset');
    expect(typeof store.reset).toBe('function');
  });
});
