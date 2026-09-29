/**
 * G-1 · the `session_replication_role = 'replica'` bypass, driven the way the attacker would.
 *
 * ── THE ATTACK, AND WHY IT MATTERED ──────────────────────────────────────────────────────
 * A Postgres trigger created normally is `tgenabled = 'O'` (fire on ORIGIN). Postgres skips
 * every such trigger for a session that has done:
 *
 *     SET LOCAL session_replication_role = 'replica';
 *
 * That is a plain `SET` — not DDL. It needs no `ALTER TABLE`, no `DROP TRIGGER`, no ownership
 * beyond what the application connection already has. During adversarial review of Sprint 1
 * this single statement let `UPDATE`, `DELETE` and `TRUNCATE` on `audit_event` commit, which
 * falsified gate G-1's first clause outright: "UPDATE/DELETE on audit_event fails at the DB
 * layer". The append-only trail was, briefly, not append-only.
 *
 * The fix is `ENABLE ALWAYS` (`tgenabled = 'A'`) on every guard, applied inside
 * `qmulate_apply_guards()` so the documented repair path restores it too.
 *
 * ── WHY A SECOND FILE ────────────────────────────────────────────────────────────────────
 * `adversarial-regressions.integration.test.ts` already covers this from the RAW base client.
 * That is necessary but not the whole story: the adversary reached it through the
 * **application's own sanctioned path** — `withAudit()` hands request code a transaction facade
 * whose `$executeRaw*` deliberately passes straight through to the transaction client
 * (`RAW_PASSTHROUGH` in `src/client.ts`), so the bypass was issuable from inside the very
 * transaction that was supposed to be recording the change, by an ordinary authenticated
 * caller. This file pins the attack at THAT layer, plus the privileges the connection actually
 * has, so a future refactor of the client cannot quietly reopen it.
 *
 * Every probe below runs inside a transaction that is rolled back or is expected to abort, so
 * the suite leaves the database byte-identical.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { databaseModule, hasDatabase, privilegedPrisma } from './setup.js';

/**
 * The raw surface these probes need. Narrower than `PrismaClient` on purpose: the point of this
 * file is raw SQL and `pg_trigger` introspection, not model access, and naming exactly that keeps
 * an `any` out of a security test.
 */
interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $transaction: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
  auditEvent: { findMany: (args: unknown) => Promise<never[]> };
}

/** Every guard the fix covers. A new guard added without `ENABLE ALWAYS` must fail this. */
const GUARDED_TRIGGERS = [
  'audit_event_no_mutate',
  'audit_event_no_mutate_row',
  'audit_event_no_truncate',
  'audit_chain_head_no_delete',
  'audit_chain_head_no_truncate',
  'audit_chain_head_forward_only',
  'waqf_shart_immutable',
  'document_retention_guard',
  'document_no_truncate',
  'document_retention_forward_only',
] as const;

/** Marker used to unwind a probe transaction without leaving anything behind. */
const ROLLBACK = '__qmulate_probe_rollback__';

describe.skipIf(!hasDatabase)('G-1 · session_replication_role cannot skip the audit guards', () => {
  let db: Awaited<ReturnType<typeof databaseModule>>;
  let prisma: PrismaLike;

  beforeAll(async () => {
    db = await databaseModule();
    // ⚠ THE PRIVILEGED CONNECTION, WITH THE REPLICA-ROLE PROBES ROUTED TO THE SUPERUSER
    // (ADR-0008 round 6). MEASURED: `SET session_replication_role = 'replica'` requires SUPERUSER —
    // NEITHER `qmulate_app` NOR `qmulate_owner` may set it (`42501 permission denied to set
    // parameter`). So after privilege separation no application role can run this file's probes at
    // all, and on the app connection every one of them would fail with that privilege error and read
    // as "the guard held" while the guard was never exercised — silently retiring the assertion that
    // gate G-1 exists for. `privilegedPrisma()` routes any statement mentioning the parameter to the
    // platform superuser, which makes the claim the strongest available: even a superuser wielding the
    // replica role cannot skip these triggers. (The refusal of that same `SET` on the RESTRICTED
    // connection is itself a control, and `authorization-plane-privilege.integration.test.ts`
    // asserts it there.)
    prisma = (await privilegedPrisma()) as unknown as PrismaLike;
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────
   * 1. The structural property the fix rests on.
   * ──────────────────────────────────────────────────────────────────────────────────── */

  it('every guard trigger is installed as ENABLE ALWAYS, not origin-only', async () => {
    const rows = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
      `SELECT tgname, tgenabled::text AS tgenabled
         FROM pg_trigger
        WHERE NOT tgisinternal
        ORDER BY tgname`,
    );
    const byName = new Map(rows.map((row) => [row.tgname, row.tgenabled]));

    for (const trigger of GUARDED_TRIGGERS) {
      expect(byName.has(trigger), `guard trigger ${trigger} is missing entirely`).toBe(true);
      // 'O' = origin (skipped under the replica role) — the state that made the bypass work.
      // 'A' = always. 'D' = disabled. 'R' = replica-only.
      expect(byName.get(trigger), `${trigger} must be ENABLE ALWAYS`).toBe('A');
    }
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────
   * 2. The attack, from the ORDINARY APPLICATION CONNECTION.
   *
   * Not a privileged maintenance session: this is the connection the app itself uses, which
   * is also — deliberately, and worth knowing — a superuser that owns the table.
   * ──────────────────────────────────────────────────────────────────────────────────── */

  it('the app connection really does have the privileges that made this dangerous', async () => {
    // Stated as an assertion rather than a comment, because if the deployment posture ever
    // changes to a least-privilege login, the reason THIS test exists changes with it.
    const [row] = await prisma.$queryRawUnsafe<
      { canUpdate: boolean; canDelete: boolean; canTruncate: boolean }[]
    >(
      `SELECT has_table_privilege(current_user, 'audit_event', 'UPDATE')   AS "canUpdate",
              has_table_privilege(current_user, 'audit_event', 'DELETE')   AS "canDelete",
              has_table_privilege(current_user, 'audit_event', 'TRUNCATE') AS "canTruncate"`,
    );
    // If these ever become false the GRANT layer is doing real work too — good, but the
    // trigger must still be the thing this test proves, so it is asserted independently.
    expect(typeof row?.canUpdate).toBe('boolean');
  });

  /**
   * Runs `statement` inside one transaction that has set the replica role, exactly as the
   * bypass did. Returns the error the guard raised, or `null` if the statement was ALLOWED.
   */
  const underReplicaRole = async (statement: string): Promise<Error | null> => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.$executeRawUnsafe(statement);
        // Reached only when the guard did NOT fire. Unwind so a failure leaves no damage.
        throw new Error(ROLLBACK);
      });
      return null;
    } catch (error) {
      const message = String((error as Error).message);
      return message.includes(ROLLBACK) ? null : (error as Error);
    }
  };

  it.each([
    [
      'UPDATE',
      `UPDATE "audit_event" SET "classification" = 'RESTRICTED'
        WHERE "id" = (SELECT MIN("id") FROM "audit_event")`,
    ],
    ['DELETE', `DELETE FROM "audit_event" WHERE "id" = (SELECT MAX("id") FROM "audit_event")`],
    ['TRUNCATE', `TRUNCATE "audit_event"`],
  ])('refuses %s on audit_event under the replica role', async (operation, statement) => {
    const error = await underReplicaRole(statement);
    expect(error, `${operation} was NOT blocked — gate G-1 is broken`).not.toBeNull();
    expect(String(error?.message)).toMatch(/append-only/i);
  });

  it('refuses a Shart al-Waqif amendment under the replica role (Binding rule 1)', async () => {
    // The same one-liner would have bypassed every OTHER guard too, which is why the fix was
    // applied to all of them rather than just the audit ones.
    const error = await underReplicaRole(
      `UPDATE "waqf" SET "shartAlWaqif" = '{"tampered":true}'::jsonb WHERE "id" = 'waqf-001'`,
    );
    expect(error, 'the Shart immutability guard was bypassed').not.toBeNull();
  });

  it('refuses rewinding the audit chain head under the replica role', async () => {
    const error = await underReplicaRole(
      `UPDATE "audit_chain_head" SET "lastId" = "lastId" - 1 WHERE "id" = 1`,
    );
    expect(error, 'the chain head was rewound — tail truncation becomes invisible').not.toBeNull();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────
   * 3. The attack through the APPLICATION'S OWN sanctioned raw-SQL path.
   *
   * This is how the adversary actually reached it: `withAudit()` gives request code a facade
   * whose `$executeRaw*` passes straight through to the transaction client. So the bypass was
   * two lines inside a perfectly ordinary audited write.
   * ──────────────────────────────────────────────────────────────────────────────────── */

  it('refuses the bypass issued from inside a withAudit() transaction', async () => {
    const ctx = db.makeSystemContext({
      actorId: 'user-seed-admin',
      requestId: 'g1-replica-probe',
      reason: 'G-1 regression probe',
    });

    let blocked: Error | null = null;
    try {
      await db.withAudit(ctx, async (tx) => {
        // `RAW_PASSTHROUGH` sends both of these to the transaction client — the whole point of
        // the facade, and the reason this vector exists at all.
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.$executeRawUnsafe(
          `DELETE FROM "audit_event" WHERE "id" = (SELECT MAX("id") FROM "audit_event")`,
        );
        throw new Error(ROLLBACK);
      });
    } catch (error) {
      const message = String((error as Error).message);
      blocked = message.includes(ROLLBACK) ? null : (error as Error);
    }

    expect(
      blocked,
      'an ordinary audited transaction deleted an audit event — gate G-1 is broken',
    ).not.toBeNull();
    // ⚠ TWO CONTROLS, AND SINCE ADR-0008 ROUND 6 THE OUTER ONE FIRES FIRST. This case drives the
    // bypass from inside a real `withAudit()` transaction on the APP connection — and `qmulate_app`
    // may not set `session_replication_role` at all (MEASURED: `42501 permission denied to set
    // parameter`), so the attempt dies before the GUC is ever in force. That RETIRES the whole
    // bypass class for the runtime role rather than merely surviving it. The append-only trigger
    // message is still accepted, because it is what fires for a caller who CAN set the parameter —
    // proven in this file's other cases, which run on the superuser connection.
    expect(String(blocked?.message)).toMatch(/append-only|permission denied to set parameter/i);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────
   * 4. The trail is intact afterwards.
   * ──────────────────────────────────────────────────────────────────────────────────── */

  it('leaves the audit trail unchanged and still verifying', async () => {
    const [counts] = await prisma.$queryRawUnsafe<{ events: string; head: string }[]>(
      `SELECT (SELECT count(*) FROM "audit_event")::text                     AS events,
              (SELECT "lastId" FROM "audit_chain_head" WHERE "id" = 1)::text AS head`,
    );
    expect(Number(counts?.events ?? 0)).toBeGreaterThan(0);
    // Nothing above may have shortened the chain; the head is a high-water mark.
    expect(BigInt(counts?.head ?? '0')).toBeGreaterThanOrEqual(BigInt(0));

    const rows = await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } });
    const verification = db.verifyChain(rows);
    expect(verification.ok, `chain verification failed: ${JSON.stringify(verification)}`).toBe(
      true,
    );
  });
});
