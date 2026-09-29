// QMULATE — RELEASE GATE G-1 / scenario V-7: the audit trail is append-only and tamper-evident.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE HAS TO PROVE, AND WHY EACH HALF IS NEEDED
// ═══════════════════════════════════════════════════════════════════════════════════════════
// TAMPER-RESISTANT (the trigger). `UPDATE`, `DELETE` and `TRUNCATE` on `audit_event` are refused
// by a database trigger, so a privileged operator at a psql prompt cannot rewrite history. On
// Railway the runtime normally connects as the database OWNER, and an owner BYPASSES table GRANTs
// but NOT triggers — which is why the trigger is the load-bearing control and the least-privilege
// role is only defence in depth. Both are asserted; the trigger leg is asserted unconditionally.
//
// TAMPER-EVIDENT (the hash chain). A trigger can be dropped and a backup can be doctored offline.
// The sha256 chain makes that detectable: every row binds its own content and its predecessor's
// digest, so altering, deleting or re-ordering any historical row invalidates everything after it.
//
// ⚠ V-7 STATES A LIMITATION HONESTLY, AND SO DOES THIS FILE: a trigger cannot record the attempt
// it is rejecting into the very table it is protecting. Evidence for a raw-SQL attempt is the
// Postgres error log; only the API-layer path emits an `ACCESS_DENIED` event. There is a test
// below that asserts exactly that — the raw attempts leave no audit row — so the limitation is
// documented by the suite rather than quietly assumed.
//
// TABLE NAME: `audit_event`, not `audit_log`. §07 says `AuditLog`; §12, §17's E1 exit criterion,
// G-1, V-7, BUILD-PLAN and ADR-0003 all say `audit_event`, and that is what shipped. A test below
// pins the name so the disagreement cannot silently resolve itself in the wrong direction.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  GENESIS_HASH,
  recomputeRowHash,
  verifyChain,
  type AuditHashRow,
} from '../src/hash-chain.js';
import {
  FICTIONAL_MARKER_AR,
  PROBE_BLOCKED,
  PROBE_NOT_BLOCKED,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  deleteTestClients,
  ensureSeeded,
  guardProbeSql,
  hasDatabase,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('gate G-1 (audit immutability)');

/** Distinct from the seed's actor so seed events and test events are separable. */
const TEST_ACTOR_ID = 'user-test-harness';

type AuditRow = AuditHashRow & { prevHash: string; rowHash: string; occurredAtHijri: string };

describe.skipIf(!hasDatabase)('G-1 · audit_event is append-only (V-7)', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    // A trail with rows in it. Verifying an EMPTY chain would pass vacuously.
    ensureSeeded();
    await deleteTestClients();
  });

  afterAll(async () => {
    await deleteTestClients();
    await closeDatabase();
  });

  // ── helpers ────────────────────────────────────────────────────────────────────────────────

  async function countEvents(): Promise<number> {
    const prisma = // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      await privilegedPrisma();
    return prisma.auditEvent.count();
  }

  async function allEvents(): Promise<AuditRow[]> {
    const prisma = await privilegedPrisma();
    return (await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } })) as unknown as AuditRow[];
  }

  async function minEvent(): Promise<AuditRow> {
    const prisma = await privilegedPrisma();
    const row = (await prisma.auditEvent.findFirst({
      orderBy: { id: 'asc' },
    })) as unknown as AuditRow | null;
    if (row === null)
      throw new Error('audit_event is empty — the seed did not run, so G-1 cannot be proven');
    return row;
  }

  /** Creates one audited Client row and returns the event that recorded it. */
  async function auditedCreate(id: string, requestId: string): Promise<AuditRow> {
    const { makeSystemContext, withAudit } = await databaseModule();
    const ctx = makeSystemContext({
      actorId: TEST_ACTOR_ID,
      requestId,
      reason: 'G-1 integration assertion',
    });
    await withAudit(ctx, async (tx) => {
      await tx.client.create({
        data: { id, nameAr: `عميل اختبار ${FICTIONAL_MARKER_AR}`, nameEn: `Test Client ${id}` },
      });
    });

    const prisma = await privilegedPrisma();
    const row = (await prisma.auditEvent.findFirst({
      where: { entityType: 'Client', entityId: id },
      orderBy: { id: 'desc' },
    })) as unknown as AuditRow | null;
    if (row === null) throw new Error(`no audit_event was written for Client ${id} — G-1 fails`);
    return row;
  }

  // ── the table itself ───────────────────────────────────────────────────────────────────────

  it('is named audit_event — §07’s audit_log does not exist', async () => {
    const prisma = await privilegedPrisma();
    const rows = await prisma.$queryRawUnsafe<{ event: string | null; log: string | null }[]>(
      `SELECT to_regclass('public.audit_event')::text AS event, to_regclass('public.audit_log')::text AS log`,
    );
    expect(rows[0]?.event).toBe('audit_event');
    expect(rows[0]?.log).toBeNull();
  });

  // ── A1 / A2 / A3 — the trigger ─────────────────────────────────────────────────────────────

  it('A1 · UPDATE is refused with SQLSTATE 42501 and the row is untouched', async () => {
    const before = await minEvent();

    const error = await runProbe(
      guardProbeSql(
        `UPDATE "audit_event" SET "action" = 'CREATE' WHERE "id" = (SELECT MIN("id") FROM "audit_event")`,
        'insufficient_privilege',
      ),
    );
    expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
    expect(error).not.toContain(PROBE_NOT_BLOCKED);
    expect(error).toMatch(/append-only/);

    const after = await minEvent();
    expect(after.id).toBe(before.id);
    expect(after.rowHash).toBe(before.rowHash);
    expect(after.action).toBe(before.action);
  });

  it('A1b · a zero-row UPDATE is refused too — the guard is statement-level', async () => {
    // `WHERE false` matches nothing, so a row-level trigger would never fire. Probing whether the
    // table is writable must not be a way to find out that it is.
    const error = await runProbe(
      guardProbeSql(
        `UPDATE "audit_event" SET "action" = 'CREATE' WHERE false`,
        'insufficient_privilege',
      ),
    );
    expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
  });

  it('A2 · DELETE is refused and the row count is unchanged', async () => {
    const before = await countEvents();

    const error = await runProbe(
      guardProbeSql(
        `DELETE FROM "audit_event" WHERE "id" = (SELECT MIN("id") FROM "audit_event")`,
        'insufficient_privilege',
      ),
    );
    expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
    expect(error).toMatch(/append-only/);
    expect(await countEvents()).toBe(before);
  });

  it('A3 · TRUNCATE is refused and the row count is unchanged', async () => {
    const before = await countEvents();
    expect(before).toBeGreaterThan(0);

    const error = await runProbe(guardProbeSql(`TRUNCATE "audit_event"`, 'insufficient_privilege'));
    expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
    expect(error).toMatch(/append-only/);
    expect(await countEvents()).toBe(before);
  });

  it('refuses DELETE and TRUNCATE on the chain head as well', async () => {
    for (const statement of [`DELETE FROM "audit_chain_head"`, `TRUNCATE "audit_chain_head"`]) {
      const error = await runProbe(guardProbeSql(statement, 'insufficient_privilege'));
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
    }
    const prisma = await privilegedPrisma();
    expect(await prisma.auditChainHead.count()).toBe(1);
  });

  // ── A4 — least privilege (defence in depth) ────────────────────────────────────────────────

  it('A4 · the RUNTIME role may SELECT and INSERT on audit_event but never UPDATE, DELETE or TRUNCATE', async () => {
    // ⚠ THIS ASSERTION MOVED ROLES IN ADR-0008 ROUND 6, AND THE REASON IS THE WHOLE POINT.
    //
    // It used to name `qmulate_app_runtime` — the NOLOGIN role migration 1 §2 creates as a
    // "least-privilege runtime role (defence in depth)". That role was never once load-bearing,
    // because NOTHING EVER CONNECTED AS IT: the application connected as the database OWNER, which
    // bypasses GRANTs entirely. Migration 1's own header said so. The `it.todo` below said so.
    //
    // Round 6 made a real one. `qmulate_app` is what `DATABASE_URL` now connects as, and it holds
    // exactly this posture on `audit_event` — asserted here against the LIVE role rather than the
    // decorative one. `qmulate_app_runtime` is consequently no longer created at all: the migrator is
    // deliberately `NOCREATEROLE`, so migration 1 §2 takes its documented NOTICE branch. That is
    // correct, not a regression — role creation belongs out of band in
    // `scripts/provision-db-roles.ts`, and a migrator that could create roles could create itself a
    // superuser.
    const prisma = await privilegedPrisma();

    const runtimeRole = 'qmulate_app';
    const roles = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = '${runtimeRole}'`,
    );
    expect(
      roles[0]?.n,
      `The ${runtimeRole} role is missing. Run \`pnpm exec tsx scripts/provision-db-roles.ts\` on ` +
        'the platform superuser. Without it, migration 10 degrades to a NOTICE and the append-only ' +
        'posture asserted below is not enforced against anything.',
    ).toBe(1);

    const privileges = await prisma.$queryRawUnsafe<
      { ins: boolean; sel: boolean; upd: boolean; del: boolean; trunc: boolean }[]
    >(
      `SELECT has_table_privilege('${runtimeRole}','audit_event','INSERT')   AS ins,
              has_table_privilege('${runtimeRole}','audit_event','SELECT')   AS sel,
              has_table_privilege('${runtimeRole}','audit_event','UPDATE')   AS upd,
              has_table_privilege('${runtimeRole}','audit_event','DELETE')   AS del,
              has_table_privilege('${runtimeRole}','audit_event','TRUNCATE') AS trunc`,
    );
    // INSERT stays because APPEND-ONLY REQUIRES IT — that is the privilege every audited write needs,
    // and it is why a forged marker row was ever possible. The three that go are what "append-only"
    // means as an ACL rather than only as a trigger.
    expect(privileges[0]).toEqual({ ins: true, sel: true, upd: false, del: false, trunc: false });

    // And the runtime role does NOT own the table, which is what makes the GRANTs above bite at all.
    const owner = await prisma.$queryRawUnsafe<{ owner: string }[]>(
      `SELECT tableowner AS owner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_event'`,
    );
    expect(
      owner[0]?.owner,
      'the runtime role OWNS audit_event, and an owner bypasses every GRANT above. That is exactly ' +
        'the state ADR-0008 spent five rounds unable to close.',
    ).not.toBe(runtimeRole);
    expect(owner[0]?.owner).toBe('qmulate_owner');
  });

  // ── THE `it.todo` THAT USED TO BE HERE IS DELIVERED ─────────────────────────────────────────
  // It read: "SURFACED (LEGAL/OPS): Railway connects as the database OWNER, and an owner bypasses
  // GRANTs. A4 proves the least-privilege posture EXISTS; it does not prove the running application is
  // constrained by it. Provision a dedicated non-owner login role and a separate APP_DATABASE_URL
  // before any environment carries data beyond the fixture."
  //
  // ADR-0008 round 6 did exactly that: `DATABASE_URL` is now `qmulate_app`, a non-owner login role,
  // and A4 above asserts BOTH the GRANTs and the fact that the runtime role does not own the table.
  // Whether a DEPLOYED service actually holds that credential is still a deployment fact no test can
  // assert — `assertNoPrivilegedDatabaseUrls()` at each app's boot is the closest available control.
  it('A4b · the append-only privilege posture is enforced against the connection the app uses', async () => {
    const prisma = await privilegedPrisma();
    const rows = await prisma.$queryRawUnsafe<{ who: string; owns: boolean }[]>(
      `SELECT current_user AS who, false AS owns`,
    );
    expect(rows[0]?.who, 'the privileged harness connection is not the owner role').toBe(
      'qmulate_owner',
    );
  });

  // ── a normal domain write leaves a correct, correctly-linked event ─────────────────────────

  it('records a CREATE with the full after-image and no before-image', async () => {
    const event = await auditedCreate('client-901', 'test-create');

    expect(event.action).toBe('CREATE');
    expect(event.entityType).toBe('Client');
    expect(event.entityId).toBe('client-901');
    expect(event.actorId).toBe(TEST_ACTOR_ID);
    expect(event.actorType).toBe('SYSTEM');
    expect(event.category).toBe('MUTATION');
    expect(event.before).toBeNull();

    const after = event.after as Record<string, unknown>;
    expect(after.id).toBe('client-901');
    expect(after.nameEn).toBe('Test Client client-901');
    expect(after.nameAr).toContain(FICTIONAL_MARKER_AR);
    // `createdBy` is stamped from the actor context rather than trusted from the caller.
    expect(after.createdBy).toBe(TEST_ACTOR_ID);

    const context = event.context as Record<string, unknown>;
    expect(context.requestId).toBe('test-create');
    expect(context.operation).toBe('create');

    // Every legally-significant timestamp is dual: UTC plus a FROZEN Umm al-Qura snapshot.
    expect(event.occurredAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(event.occurredAtHijri.startsWith('14')).toBe(true);
  });

  it('links each event to its predecessor and recomputes its own digest', async () => {
    const event = await auditedCreate('client-902', 'test-link');
    const prisma = await privilegedPrisma();

    const predecessor = (await prisma.auditEvent.findFirst({
      where: { id: { lt: event.id as bigint } },
      orderBy: { id: 'desc' },
    })) as unknown as AuditRow | null;

    expect(event.prevHash).toBe(predecessor === null ? GENESIS_HASH : predecessor.rowHash);
    expect(recomputeRowHash(event, event.prevHash)).toBe(event.rowHash);
    expect(event.rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('diffs CHANGED KEYS ONLY on an update, and ignores updatedAt noise', async () => {
    await auditedCreate('client-903', 'test-update-seed');

    const { makeSystemContext, withAudit } = await databaseModule();
    const ctx = makeSystemContext({ actorId: TEST_ACTOR_ID, requestId: 'test-update' });
    await withAudit(ctx, async (tx) => {
      await tx.client.update({ where: { id: 'client-903' }, data: { nameEn: 'Renamed Client' } });
    });

    const prisma = await privilegedPrisma();
    const event = (await prisma.auditEvent.findFirst({
      where: { entityType: 'Client', entityId: 'client-903', action: 'UPDATE' },
      orderBy: { id: 'desc' },
    })) as unknown as AuditRow | null;
    expect(event).not.toBeNull();
    const updated = event as AuditRow;

    const before = updated.before as Record<string, unknown>;
    const after = updated.after as Record<string, unknown>;
    expect(Object.keys(after)).toEqual(['nameEn']);
    expect(before.nameEn).toBe('Test Client client-903');
    expect(after.nameEn).toBe('Renamed Client');
    // A full-row diff on every update would bloat the trail past reading; `updatedAt` changes on
    // every single write and carries no information, so it is stripped (§12).
    expect(Object.keys(after)).not.toContain('updatedAt');
    expect(recomputeRowHash(updated, updated.prevHash)).toBe(updated.rowHash);
  });

  // ── A9 — atomicity ─────────────────────────────────────────────────────────────────────────

  it('A9 · a throw inside withAudit rolls back BOTH the row and its audit event', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();
    const prisma = await privilegedPrisma();

    const eventsBefore = await countEvents();
    const ctx = makeSystemContext({ actorId: TEST_ACTOR_ID, requestId: 'test-rollback' });

    await expect(
      withAudit(ctx, async (tx) => {
        await tx.client.create({
          data: {
            id: 'client-904',
            nameAr: `عميل مُلغى ${FICTIONAL_MARKER_AR}`,
            nameEn: 'Rolled Back',
          },
        });
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    expect(await prisma.client.count({ where: { id: 'client-904' } })).toBe(0);
    expect(await countEvents()).toBe(eventsBefore);
  });

  // ── A10 — concurrency ──────────────────────────────────────────────────────────────────────

  it('A10 · twenty parallel audited writes append twenty rows and never fork the chain', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();
    const eventsBefore = await countEvents();

    const ids = Array.from({ length: 20 }, (_, index) => `client-9${String(index + 10)}`);
    await Promise.all(
      ids.map((id) => {
        const ctx = makeSystemContext({ actorId: TEST_ACTOR_ID, requestId: `test-parallel-${id}` });
        return withAudit(
          ctx,
          async (tx) => {
            await tx.client.create({
              data: { id, nameAr: `عميل متوازٍ ${FICTIONAL_MARKER_AR}`, nameEn: `Parallel ${id}` },
            });
          },
          // Twenty interactive transactions can exceed the default pool, so they queue. The
          // advisory lock guarantees the queue always drains: the holder is never blocked.
          { maxWait: 60_000, timeout: 60_000 },
        );
      }),
    );

    expect(await countEvents()).toBe(eventsBefore + 20);

    const rows = await allEvents();
    const prevHashes = rows.map((row) => row.prevHash);
    expect(new Set(prevHashes).size).toBe(prevHashes.length);
  });

  // ── A6 — the chain verifies end to end ─────────────────────────────────────────────────────

  it('A6 · every row recomputes, from genesis, with zero breaks', async () => {
    const rows = await allEvents();
    expect(rows.length).toBeGreaterThan(96);

    const result = verifyChain(rows);
    expect(
      result.reason ?? 'ok',
      `chain broke at audit_event id ${result.brokenAtId ?? '?'} after ${result.checked} rows`,
    ).toBe('ok');
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(rows.length);
  });

  /**
   * ⚠ ADDED IN S4 BECAUSE A6 BROKE AND ITS MESSAGE COULD NOT SAY WHY (measured 2026-08-13).
   *
   * A6 stops at the FIRST break and reports two hashes, which is the right thing for a tamper-
   * evidence check and useless for diagnosis. This test does not weaken it or replace it — it names
   * the ONE shape that was actually found, so the next person does not repeat the forensics:
   *
   *   MEASURED over 5,511 rows — 41 broken, and the correlation is total:
   *
   *     41 broken / 0 clean   denials carrying `context.procedure`  (`endowment.get` 29,
   *                           `deed.get` 6, `reservedMatter.list` 6) — stored `{}`/`{}`
   *      0 broken / 303 clean denials carrying `context.operation`  (the force-filter handler in
   *                           `src/client.ts`) — stored `null`/`null`
   *      0 broken / 5,167     every other audit row, including 4,680 that store `{}`/`{}` and verify
   *
   *   Each broken row's stored `rowHash` recomputes correctly ONLY with both fields replaced by
   *   `null` — so the writer hashed `null` and persisted `{}`.
   *
   *   ⚠ AND THE CONTROL IS MEASURED, WHICH IS WHAT MAKES THIS ACTIONABLE: on a later pristine
   *   database, `packages/api`'s own suite wrote **12 `procedure=endowment.get` denials, `null`/`null`,
   *   12/12 verifying** — the SAME writer and the SAME procedure name as 29 of the broken rows. So the
   *   fault is not in `recordProcedureDenial`'s logic; it is in the PROCESS. The broken rows were
   *   written by the apps/web Next.js server (whose E3 screens are read-only, so a denial is the only
   *   audit row it writes at all); the clean ones by vitest.
   *
   *   ⚠ MECHANISM IS STILL A HYPOTHESIS. `appendAuditEvent` hashes `payloadRow.before` and then writes
   *   `payloadRow.before === null ? Prisma.DbNull : payloadRow.before`, so the two cannot disagree
   *   inside one process — and `JSON.stringify(Prisma.DbNull)` is `{}` (measured). A `DbNull` sentinel
   *   whose identity the executing client does not recognise (a second copy of the client runtime in a
   *   bundled build) would land as `{}` exactly like this. That last step is inference; everything
   *   above it is measurement.
   *
   *   ✓ UPDATE 2026-08-16 (AL-1) — NO LONGER A HYPOTHESIS, AND THE WRITER IS FIXED. The shape was
   *   reproduced ON DEMAND through the real web path (fresh cluster, migrate + seed, `next dev`, a
   *   registered TOTP-enrolled account with no grant, two `endowment.get` calls over HTTP): 155 rows,
   *   153 reproduce, **2 broken — both `ACCESS_DENIED` / `procedure=endowment.get`, stored `{}`/`{}`,
   *   both reproducing exactly when before/after are replaced by `null`** — while the 153 seed rows
   *   written by the same writer in a plain Node realm reproduced throughout. `appendAuditEvent()` now
   *   OMITS the key instead of passing the sentinel (an absent key cannot be reinterpreted by a
   *   bundler) and then RE-HASHES THE ROW `create()` RETURNED, refusing to commit any row whose stored
   *   content does not reproduce its own hash. Re-measured after the fix on the same server and the
   *   same procedure: the two new denials store SQL NULL and verify; the two broken rows were left
   *   exactly as they are, because this table is append-only. The sweep, the write-boundary
   *   assertions and the mutation evidence live in `audit-content-reproducibility.integration.test.ts`.
   *   ⚠ THIS TEST STAYS. It is the detector for the shape, and a fixed writer is not a reason to stop
   *   looking for the row.
   *
   *   ⚠ NOTHING IN CI WOULD CATCH IT. The e2e job runs on its own database and no chain verification
   *   runs after it, so the first evidence would be a production trail that stops verifying the first
   *   time a user opens an endowment they have no grant on.
   *
   * `audit_event` is append-only, so such a row is UNREPAIRABLE: once written, every chain
   * verification on that database fails for ever. It is reported, not worked around.
   */
  it('stores no `{}` where the hash says NULL — the S4 break, named rather than re-diagnosed', async () => {
    // ⚠ AN EMPTY DIFF IS NORMAL, AND THAT IS THE POINT OF MEASURING RATHER THAN BANNING IT: 4,680 of
    // 5,153 rows on the diagnosed database stored `{}`/`{}` and verified perfectly, because
    // `diffChangedKeys()` legitimately returns two empty objects for an update whose only changed keys
    // are in `AUDIT_DIFF_IGNORE`. So the assertion is not "no empty diff" — it is "no empty diff that
    // its OWN rowHash disagrees with", and the discriminator is that the stored hash recomputes when
    // both fields are replaced by `null`.
    //
    // Read through PRISMA rather than a raw driver: `occurredAt` is `timestamp WITHOUT time zone`, and
    // a raw driver interprets it in the LOCAL zone while Prisma reads it as UTC — measured while
    // diagnosing this, the raw path reported all 141 seeded rows broken on a UTC+6 machine.
    const rows = await allEvents();
    const emptyDiff = rows.filter(
      (row) =>
        JSON.stringify((row as unknown as { before: unknown }).before) === '{}' &&
        JSON.stringify((row as unknown as { after: unknown }).after) === '{}',
    );
    const hashedAsNull = emptyDiff.filter(
      (row) =>
        recomputeRowHash(row, row.prevHash) !== row.rowHash &&
        recomputeRowHash({ ...row, before: null, after: null }, row.prevHash) === row.rowHash,
    );
    expect(
      hashedAsNull.map(
        (row) =>
          `id=${String(row.id)} action=${row.action} procedure=${
            ((row as unknown as { context: { procedure?: string } | null }).context ?? {})
              .procedure ?? '-'
          }`,
      ),
      'audit rows store `{}` for before/after while their rowHash was computed over `null`. Such a ' +
        'row can NEVER verify and can NEVER be repaired — audit_event is append-only — so every ' +
        'chain verification on this database fails from here on. See this test’s comment for the ' +
        'measurement and the (labelled) hypothesis about Prisma.DbNull.',
    ).toEqual([]);
  });

  it('the chain head points at the newest row', async () => {
    const prisma = await privilegedPrisma();
    const rows = await allEvents();
    const last = rows[rows.length - 1];
    expect(last).toBeDefined();

    const head = await prisma.auditChainHead.findFirstOrThrow();
    expect(head.id).toBe(1);
    expect(head.lastRowHash).toBe((last as AuditRow).rowHash);
    expect(String(head.lastId)).toBe(String((last as AuditRow).id));
  });

  // ── V-7's stated limitation, asserted rather than assumed ──────────────────────────────────

  it('does NOT self-audit a raw-SQL tampering attempt — the documented V-7 limitation', async () => {
    const prisma = await privilegedPrisma();
    const before = await prisma.auditEvent.count({ where: { action: 'ACCESS_DENIED' } });

    await runProbe(
      guardProbeSql(
        `UPDATE "audit_event" SET "classification" = 'ROUTINE' WHERE "id" = (SELECT MIN("id") FROM "audit_event")`,
        'insufficient_privilege',
      ),
    );

    // A trigger cannot record into the table it is protecting, and it aborts the transaction that
    // would have carried the record. The evidence for a raw attempt is the Postgres error log.
    // The API-layer path is what emits ACCESS_DENIED — that is E2/S2, not this gate.
    expect(await prisma.auditEvent.count({ where: { action: 'ACCESS_DENIED' } })).toBe(before);
  });

  it.todo(
    'A7 · pin the frozen final rowHash. It must be captured against a FRESH `prisma migrate deploy` ' +
      'plus exactly ONE seed run, on a database no test has written to — this suite deliberately ' +
      'appends its own events, so the value observed here is not the one to pin. Capture with: ' +
      'SELECT "rowHash" FROM "audit_event" ORDER BY "id" DESC LIMIT 1; then assert it here. Until ' +
      'it is pinned, A7 is proven only at unit level (test/hash-chain.test.ts frozen vectors) and ' +
      'seed determinism is proven only by re-run stability (test/seed.integration.test.ts).',
  );

  it.todo(
    'External anchoring of the chain (§12 marks it P1) is not implemented: a party who controls the ' +
      'database for long enough can rewrite the whole tail consistently. Publishing periodic head ' +
      'digests somewhere the operator does not control is what closes that.',
  );
});
