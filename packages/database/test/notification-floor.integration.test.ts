/**
 * S10/T2 — migration 45, the reminder dedupe's FLOOR, probed at the database.
 *
 * Every probe runs on the MIGRATOR connection through `guardProbeSql`, which rolls back whatever
 * happens — so these prove the floor binds THE STRONGEST ordinary role, leave no rows behind, and
 * assert the exact SQLSTATE (a refusal with the wrong one must not pass as the right one).
 *
 * What is deliberately NOT here: the two-concurrent-workers composition (loser aborts → transport
 * retry → converges) lives with the worker in `apps/worker`'s T2 evidence, because it needs two
 * real queue consumers; this file is the floor itself.
 */

import { describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  PROBE_SUCCEEDED,
  closeDatabase,
  guardProbeSql,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  rollbackProbeSql,
  warnNoDatabase,
} from './setup.js';
import { afterAll } from 'vitest';

warnNoDatabase('migration 45 (the notification reminder floor)');

/** A reminder row INSERT as the migrator would write it. `payload` is a SQL literal fragment. */
function insertReminder(payloadJson: string, userId = 'user-seed-admin'): string {
  return (
    `INSERT INTO "notification" ("id", "userId", "waqfId", "kind", "payload", "createdAt") ` +
    `VALUES (gen_random_uuid()::text, '${userId}', 'waqf-001', 'deadline.reminder', ` +
    `'${payloadJson}'::jsonb, now())`
  );
}

describe.runIf(hasDatabase)('S10/T2 · migration 45 — the reminder floor', () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it('a DUPLICATE (userId, idempotencyKey) reminder is refused BY THE DATABASE with 23505 — for the migrator too', async () => {
    const raw = await privilegedPrisma();
    const payload = '{"idempotencyKey": "probe-m45-dup", "deadlineId": "probe"}';
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          guardProbeSql(
            `${insertReminder(payload)}; ${insertReminder(payload)}`,
            'unique_violation',
          ),
        ),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it('the same key for a DIFFERENT user is a different flight — admitted, and rolled back', async () => {
    // The index is (userId, key): two recipients of one reminder sweep are two rows by design.
    // Without this arm, an over-wide index (key alone) would pass every refusal probe above
    // while silently dropping every recipient after the first.
    const raw = await privilegedPrisma();
    const payload = '{"idempotencyKey": "probe-m45-two-users"}';
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          rollbackProbeSql([
            insertReminder(payload, 'user-seed-admin'),
            insertReminder(payload, 'user-case-manager-001'),
          ]),
        ),
      ),
    ).rejects.toThrow(PROBE_SUCCEEDED);
  });

  it('THE NULL TRAPDOOR IS CLOSED: a key-less reminder row is refused by CHECK (23514) — it cannot even be planted once', async () => {
    // The ratification's condition asked for TWO planted key-less rows "and show what happens":
    // measured, the scenario cannot BEGIN — the first row dies on
    // `notification_reminder_requires_idempotency_key`. Without that CHECK the pair would both
    // land (NULLs do not conflict in a unique index) and the floor would have a silent hole
    // exactly where a malformed writer falls through.
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          guardProbeSql(insertReminder('{"deadlineId": "probe-no-key"}'), 'check_violation'),
        ),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it('an EMPTY-STRING key is the same trapdoor wearing quotes — refused by the same CHECK', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(guardProbeSql(insertReminder('{"idempotencyKey": ""}'), 'check_violation')),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it("the floor's scope is EXACTLY the reminder kind: a key-less escalation notice is admitted (and rolled back)", async () => {
    // 'deadline.escalation' notices deliberately have no floor of their own: they are written
    // only inside the branch that just WON migration 41's escalation_event one-per-rung-per-day
    // index, in the same transaction, so the event's floor is transitively the notice's. A CHECK
    // here would be a second constraint claiming a guarantee another index already owns.
    const raw = await privilegedPrisma();
    const insert =
      `INSERT INTO "notification" ("id", "userId", "waqfId", "kind", "payload", "createdAt") ` +
      `VALUES (gen_random_uuid()::text, 'user-seed-admin', 'waqf-001', 'deadline.escalation', ` +
      `'{"deadlineId": "probe-esc"}'::jsonb, now())`;
    await expect(raw.$executeRawUnsafe(privilegedSql(rollbackProbeSql([insert])))).rejects.toThrow(
      PROBE_SUCCEEDED,
    );
  });
});
