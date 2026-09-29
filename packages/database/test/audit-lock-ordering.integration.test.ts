// QMULATE — the audit chain lock is acquired EAGERLY, so lock order can never invert (40P01).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS FILE EXISTS TO PIN
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Sprint 1 shipped the chain lock LAZILY: `ensureChainHead()` took
// `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` on the first APPEND, which happens immediately
// AFTER the mutation it records. So an audited transaction reached the lock request already
// holding row locks, and two audited transactions could acquire the same two lockables in
// opposite orders:
//
//   T1: writes row A (row lock on A)      ──► requests the chain lock  ── waits on T2
//   T2: writes row B (row lock on B) ──► holds the chain lock ──► writes row A ── waits on T1
//
// That is a textbook cycle, and Postgres resolves it by killing one side with SQLSTATE 40P01.
// CI caught it as
//
//   Process 101 waits for ExclusiveLock on advisory lock [...]; blocked by process 100.
//   Process 100 waits for ShareLock on transaction 845; blocked by process 101.
//
// It is NOT a test-only artefact: `apps/worker` (pg-boss jobs) and `apps/web` (requests) write
// concurrently in production, and a deadlocked writer loses its whole transaction — the business
// row AND its audit event. A trustee's system of record that drops writes under load is not a
// system of record.
//
// THE FIX, WHICH THIS FILE ASSERTS THREE WAYS:
//   1. the lock is held before the caller's callback runs a single statement  (`is eager`);
//   2. the deterministic inversion above completes instead of deadlocking    (`barrier` test);
//   3. the same shape under natural concurrency, repeated, never deadlocks   (`storm` test).
//
// Assertion (1) is the one that fails FIRST if someone reverts to lazy acquisition, and it fails
// without depending on timing — the other two are the behaviour, (1) is the mechanism.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AUDIT_CHAIN_LOCK_KEY, verifyChain, type AuditHashRow } from '../src/hash-chain.js';
import {
  FICTIONAL_MARKER_AR,
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  deleteTestClients,
  ensureSeeded,
  hasDatabase,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('the audit chain lock-ordering regression (40P01)');

/** Distinct from the seed's actor and from G-1's, so these events are separable in the trail. */
const TEST_ACTOR_ID = 'user-lock-ordering-harness';

/** `client-9…` so `deleteTestClients()` reclaims them; outside G-1's 901–929 range. */
const ROW_A = 'client-950';
const ROW_B = 'client-951';

/**
 * How long a party waits at the barrier for the other to arrive.
 *
 * Both directions matter. Under the BUG both parties arrive within milliseconds and the barrier
 * opens, producing the inversion deterministically. Under the FIX the second transaction is
 * parked in Postgres waiting for the chain lock and can never arrive, so the first party must
 * time out, finish, and release — hence a wait rather than a rendezvous that hangs the suite.
 * Comfortably above Postgres's 1s default `deadlock_timeout`, so a real deadlock is detected
 * and reported rather than mistaken for slowness.
 */
const BARRIER_MS = 1_500;

type AuditRow = AuditHashRow & { prevHash: string; rowHash: string };

/**
 * A single-use, N-party barrier that OPENS ON TIMEOUT instead of hanging.
 *
 * `arrive()` resolves as soon as every party has arrived, or after `timeoutMs`, whichever comes
 * first. A rendezvous that only opens when all parties arrive would turn a correct (serialized)
 * implementation into a hung test, which is the worst possible failure mode for a regression that
 * is about blocking.
 */
function makeBarrier(parties: number, timeoutMs: number): () => Promise<void> {
  let arrived = 0;
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  return async function arrive(): Promise<void> {
    arrived += 1;
    if (arrived >= parties) {
      open();
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      opened,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
  };
}

/** Every string a Postgres deadlock can present itself as, through Prisma or through pg. */
function isDeadlock(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message}` : String(error);
  return /40P01|deadlock detected/i.test(text);
}

function describeRejections(results: PromiseSettledResult<unknown>[]): string {
  return results
    .flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            `[${String(index)}] ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          ]
        : [],
    )
    .join('\n---\n');
}

describe.skipIf(!hasDatabase)('audit chain lock ordering · no 40P01 (regression)', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    await deleteTestClients();

    // Two committed rows for the two transactions to contend over. Created in ONE audited
    // transaction so the setup itself cannot be the thing that deadlocks.
    const { makeSystemContext, withAudit } = await databaseModule();
    await withAudit(
      makeSystemContext({
        actorId: TEST_ACTOR_ID,
        requestId: 'lock-ordering-setup',
        reason: 'lock-ordering regression fixtures',
      }),
      async (tx) => {
        for (const id of [ROW_A, ROW_B]) {
          await tx.client.create({
            data: {
              id,
              nameAr: `عميل ترتيب الأقفال ${FICTIONAL_MARKER_AR}`,
              nameEn: `Lock ordering ${id}`,
            },
          });
        }
      },
    );
  });

  afterAll(async () => {
    await deleteTestClients();
    await closeDatabase();
  });

  // ── 1 · the mechanism ──────────────────────────────────────────────────────────────────────

  it('is eager: the chain lock is already held when the callback gets control', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();

    const held = await withAudit(
      makeSystemContext({ actorId: TEST_ACTOR_ID, requestId: 'lock-ordering-eager' }),
      async (tx) => {
        // FIRST statement of the block. Raw, so it passes straight to the transaction's own
        // connection (`makeTxFacade`), which is the backend whose locks we are inspecting.
        // A lazily-taken lock would not be here yet: nothing has been appended.
        const rows = await tx.$queryRawUnsafe<{ n: bigint | number }[]>(
          `SELECT count(*) AS n
             FROM pg_locks
            WHERE locktype = 'advisory'
              AND pid = pg_backend_pid()
              AND granted
              AND mode = 'ExclusiveLock'
              AND ((classid::bigint << 32) + objid::bigint) = ${AUDIT_CHAIN_LOCK_KEY.toString()}`,
        );
        return Number(rows[0]?.n ?? 0);
      },
    );

    expect(
      held,
      'the audit chain advisory lock must be held from the START of an audited transaction — ' +
        'a lazily-taken lock inverts the lock order against the row locks the callback has ' +
        'already taken, which is SQLSTATE 40P01',
    ).toBe(1);
  });

  it('does NOT take the chain lock on a plain read outside an audited transaction', async () => {
    // The other half of "eager": eager must not mean "always". A read has nothing to append, so
    // making it queue behind writers would turn every query into a global serialization point.
    const { makeSystemContext, createPrismaClient } = await databaseModule();
    const db = createPrismaClient(
      makeSystemContext({ actorId: TEST_ACTOR_ID, requestId: 'lock-ordering-read' }),
    );

    await db.client.findMany({ where: { id: ROW_A } });

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(
      `SELECT count(*) AS n
         FROM pg_locks
        WHERE locktype = 'advisory'
          AND ((classid::bigint << 32) + objid::bigint) = ${AUDIT_CHAIN_LOCK_KEY.toString()}`,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });

  // ── 2 · the deterministic inversion ────────────────────────────────────────────────────────

  it('two audited transactions taking rows A→B and B→A both commit (no 40P01)', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();
    const arrive = makeBarrier(2, BARRIER_MS);

    /**
     * `first` is row-locked with RAW SQL before the barrier, so the row lock is taken WITHOUT
     * touching the chain lock — that is what widens the sprint-1 inversion window from
     * microseconds to "as long as the barrier holds", making a timing-dependent bug
     * deterministic. The audited writes that follow are the ordinary production shape.
     */
    async function party(label: string, first: string, second: string): Promise<void> {
      await withAudit(
        makeSystemContext({
          actorId: TEST_ACTOR_ID,
          requestId: `lock-ordering-${label}`,
          reason: 'lock-ordering regression',
        }),
        async (tx) => {
          await tx.$queryRawUnsafe(`SELECT 1 FROM "client" WHERE "id" = $1 FOR UPDATE`, first);
          await arrive();
          await tx.client.update({ where: { id: first }, data: { nameEn: `${label} first` } });
          await tx.client.update({ where: { id: second }, data: { nameEn: `${label} second` } });
        },
        { maxWait: 60_000, timeout: 60_000 },
      );
    }

    const results = await Promise.allSettled([
      party('ab', ROW_A, ROW_B),
      party('ba', ROW_B, ROW_A),
    ]);

    const deadlocked = results.filter((r) => r.status === 'rejected' && isDeadlock(r.reason));
    expect(
      deadlocked.length,
      `a lock-order inversion deadlocked an audited transaction:\n${describeRejections(results)}`,
    ).toBe(0);
    expect(
      results.every((r) => r.status === 'fulfilled'),
      `an audited transaction failed:\n${describeRejections(results)}`,
    ).toBe(true);
  });

  // ── 3 · the same shape under natural concurrency ───────────────────────────────────────────

  it('sixteen interleaved audited transactions over the same two rows never deadlock', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();

    // No barrier here: this is the unmodified production shape (first audited write, then the
    // chain lock, then a second write touching the other party's row). Under the lazy lock the
    // inversion window is small but real, so this leg is repeated; under the eager lock the
    // transactions are serialized and it cannot happen at all.
    for (let round = 0; round < 4; round += 1) {
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, (_, index) => {
          const [first, second] = index % 2 === 0 ? [ROW_A, ROW_B] : [ROW_B, ROW_A];
          return withAudit(
            makeSystemContext({
              actorId: TEST_ACTOR_ID,
              requestId: `lock-ordering-storm-${String(round)}-${String(index)}`,
            }),
            async (tx) => {
              await tx.client.update({
                where: { id: first },
                data: { nameEn: `storm ${String(round)}-${String(index)} a` },
              });
              await tx.client.update({
                where: { id: second },
                data: { nameEn: `storm ${String(round)}-${String(index)} b` },
              });
            },
            { maxWait: 120_000, timeout: 120_000 },
          );
        }),
      );

      expect(
        results.filter((r) => r.status === 'rejected').length,
        `round ${String(round)} lost transactions:\n${describeRejections(results)}`,
      ).toBe(0);
    }
  });

  // ── 4 · serializing the appenders is still what keeps the chain honest ─────────────────────

  it('the chain still verifies from genesis after the contention above', async () => {
    const prisma = await basePrisma();
    const rows = (await prisma.auditEvent.findMany({
      orderBy: { id: 'asc' },
    })) as unknown as AuditRow[];

    const result = verifyChain(rows);
    expect(
      result.reason ?? 'ok',
      `chain broke at audit_event id ${result.brokenAtId ?? '?'} after ${String(result.checked)} rows`,
    ).toBe('ok');

    // Distinct predecessors: no two events claim the same `prevHash`, so nothing forked.
    const prevHashes = rows.map((row) => row.prevHash);
    expect(new Set(prevHashes).size).toBe(prevHashes.length);

    const head = await prisma.auditChainHead.findFirstOrThrow();
    const last = rows[rows.length - 1] as AuditRow;
    expect(head.lastRowHash).toBe(last.rowHash);
  });
});
