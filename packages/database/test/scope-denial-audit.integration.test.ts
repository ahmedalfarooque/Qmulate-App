/**
 * NFR-04 — A DENIED ATTEMPT ON A SENSITIVE RESOURCE IS LOGGED.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS BROKEN, MEASURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Round 1 closed the forge (`nested-write-authorization.integration.test.ts`). It did not record the
 * ATTEMPT, so the blocked escalation was exactly as invisible as the successful one had been — and
 * an auditor's first question about an access-control control is "show me the refusals".
 *
 * Two independent causes, both reproduced on a migrated + seeded fixture database:
 *
 *  (a) `installScopeDenialAuditing()` was OPT-IN and the default handler in `extensions/scoping.ts`
 *      was a no-op. Only `packages/api` called it. Measured with nothing installed:
 *        waqf.update({ data: { accessGrants: { create: <NAZIR seat> } } })  -> refused, correctly
 *        ACCESS_DENIED events: delta 0
 *      So for `apps/worker`, every script, every integration test, and an adversary reaching this
 *      package directly, the refusal left no trace at all.
 *
 *  (b) Even INSTALLED, a refusal raised inside a `withAudit()` block appended its event to that
 *      block's transaction — the transaction the refusal is about to roll back. Measured:
 *        ACCESS_DENIED events: delta 0
 *        prisma:error  Transaction API error: Transaction already closed: A query cannot be
 *                      executed on a transaction that was rolled back.
 *      The record of the denial was destroyed by the denial.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THIS FILE AVOIDS BEING A FLAKE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `deny()` is synchronous and returns `never`, so the write cannot be awaited before the refusal
 * propagates (and must not be — the enclosing transaction holds the audit chain's advisory lock for
 * its whole duration, so awaiting a fresh audited transaction inside it would self-deadlock). Round
 * 1's shape for asserting a fire-and-forget write was an 800 ms sleep. A sleep is how a real
 * regression gets to look like a flake, so `flushScopeDenialAudits()` is the barrier here and
 * `scopeDenialAuditStats()` reports what did NOT make it, rather than letting silence read as zero.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type AnyClient,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  retentionScaffoldingSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('NFR-04 (a refused write is recorded as ACCESS_DENIED)');

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';
const ADMIN = 'user-seed-admin';
const FINANCE = 'user-accountant-001';
const SUBJECT = 'user-family-board';

const TEST_GRANT = 'grant-deny-9';
const TEST_ASSET = 'asset-deny-9';

interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

/*
 * ⚠ `AnyClient` MOVED TO `./setup.js` (S4/E3 round 2, V3). All three files that reach for delegates
 * by name declared the same `Record<string, Record<string, …>>` locally, and none of them compiled:
 * `tsconfig.json` included `tests/**` — with an s — while the directory is `test/`, so nothing here
 * had EVER been typechecked. Under `noUncheckedIndexedAccess` that shape yields `… | undefined` at
 * every call site, and the cast itself is rejected outright (TS2352). The shared type is a MAPPED
 * TYPE over finite model/operation unions, which is stronger: a mistyped delegate is now a compile
 * error rather than `undefined is not a function` inside a probe that expects to be refused.
 */

/** The forged seat, exactly as the adversary wrote it: a LIVE NAZIR grant with the approve verbs. */
function forgedGrant(id: string): Record<string, unknown> {
  return {
    id,
    role: 'NAZIR',
    permissions: ['approval:request:approve'],
    dataScopes: [],
    scopeRefs: [],
    canViewAmlRestricted: false,
    amlCompartment: false,
    beneficiarySelfId: null,
    grantedByUserId: ADMIN,
    validFrom: new Date('2026-01-01T00:00:00Z'),
  };
}

describe.skipIf(!hasDatabase)('NFR-04 · a blocked escalation is recorded', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${TEST_GRANT}%'`,
    );
    // ⚠ WRAPPED SINCE `00000000000006_e2_corpus_retention_guards` — see nested-write-audit's note.
    // This file's assets only ever appear via a REFUSED write, so the DELETE usually matches nothing;
    // the wrapper is here so the day one does commit, the teardown does not start failing instead.
    await prisma.$executeRawUnsafe(
      retentionScaffoldingSql([`DELETE FROM "asset" WHERE "id" LIKE '${TEST_ASSET}%'`]),
    );
  };

  const attempt = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  /**
   * `ACCESS_DENIED` rows, after waiting on the denial queue.
   *
   * The wait is the whole point: it is a real barrier over the queued writes, not a guess at how
   * long they take.
   */
  const deniedEvents = async (): Promise<number> => {
    await db.flushScopeDenialAudits();
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "audit_event" WHERE "action" = 'ACCESS_DENIED'`,
    );
    return Number(rows[0]?.n ?? 0);
  };

  /** The most recent `ACCESS_DENIED` row, so the CONTENT can be asserted, not only the count. */
  const lastDenial = async (): Promise<Record<string, unknown> | undefined> => {
    await db.flushScopeDenialAudits();
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "entityType", "entityId", "waqfId", "actorId", "category", "context"::text AS "context"
         FROM "audit_event" WHERE "action" = 'ACCESS_DENIED' ORDER BY "id" DESC LIMIT 1`,
    );
    return rows[0];
  };

  const financeContext = () =>
    ({
      actorId: FINANCE,
      actorType: 'USER',
      authorizedWaqfIds: [WAQF_A],
      permissions: ['finance:transaction:write', 'finance:transaction:read'],
      requestId: 'test-denial-audit',
    }) as never;

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    db = await databaseModule();
    prisma =
      // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      (await privilegedPrisma()) as unknown as PrismaLike;
    await cleanup();
  });

  afterAll(async () => {
    await db.flushScopeDenialAudits();
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // (a) DEFAULT-ON. No caller has to opt in.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('records the refusal WITHOUT anyone calling installScopeDenialAuditing()', async () => {
    // This test deliberately never calls the installer. Importing `@qmulate/database` is the only
    // thing that has happened — which is exactly the situation `apps/worker`, every script and an
    // adversary reaching the package directly are in, and the situation in which the round-1
    // handler recorded nothing.
    const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
    const before = await deniedEvents();

    const error = await attempt(() =>
      client.waqf.update({
        where: { id: WAQF_A },
        data: {
          accessGrants: {
            create: { ...forgedGrant(`${TEST_GRANT}01`), user: { connect: { id: SUBJECT } } },
          },
        },
      }),
    );

    expect(error, 'the forge was permitted').toMatch(/AUTHORIZATION PLANE/);
    expect(
      await deniedEvents(),
      'the blocked escalation left no trace — the refusal is as invisible as the forge was',
    ).toBe(before + 1);
    expect(db.scopeDenialAuditStats().failed, 'a denial event failed to write').toBe(0);
  });

  it('the recorded event names the plane table, the actor and the reason', async () => {
    // A count alone would pass if the event said nothing useful. An auditor needs to know WHO tried
    // WHAT and why it was refused.
    const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
    await attempt(() =>
      client.waqfAccessGrant.create({
        data: { ...forgedGrant(`${TEST_GRANT}02`), userId: SUBJECT, waqfId: WAQF_A },
      }),
    );

    const row = await lastDenial();
    expect(row?.entityType).toBe('WaqfAccessGrant');
    expect(row?.actorId).toBe(FINANCE);
    expect(row?.category).toBe('ACCESS');
    expect(String(row?.context)).toMatch(/AUTHORIZATION PLANE/);
    // jsonb's text output inserts a space after the colon, so the regex must not assume otherwise.
    expect(String(row?.context)).toMatch(/"operation":\s*"create"/);
  });

  it('records an out-of-scope write, and names the endowment that was attempted', async () => {
    const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
    const before = await deniedEvents();

    const error = await attempt(() =>
      client.asset.create({
        data: {
          id: `${TEST_ASSET}01`,
          waqfId: WAQF_B, // a stranger's endowment
          type: 'land_parcel',
          titleDeedNumber: 'DENY-01',
          addressAr: 'عنوان اختباري (بيانات وهمية)',
          acquiredDate: new Date('2020-01-01T00:00:00Z'),
          acquiredDateHijri: '1441-05-06',
          valuationSar: '1000.00',
        },
      }),
    );

    expect(error).toMatch(/no WaqfAccessGrant for waqf waqf-002/);
    expect(await deniedEvents()).toBe(before + 1);
    const row = await lastDenial();
    // `attemptedWaqfId` is what makes a denial investigable: "tried to write into waqf-002".
    expect(row?.waqfId).toBe(WAQF_B);
    expect(row?.entityId).toBe(WAQF_B);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // (b) THE EVENT SURVIVES THE ROLLBACK IT CAUSED
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('records a refusal raised INSIDE withAudit(), which rolls that transaction back', async () => {
    // The hard case. The refusal aborts the enclosing transaction, so an event appended to that
    // transaction is destroyed with it — measured as delta 0 plus "Transaction already closed".
    // `outsideAuditTransaction()` detaches the async context so the event commits on its own
    // connection.
    const ctx = financeContext();
    const before = await deniedEvents();

    const error = await attempt(() =>
      db.withAudit(ctx, async (tx: unknown) => {
        const t = tx as unknown as AnyClient;
        return t.waqf.update({
          where: { id: WAQF_A },
          data: {
            accessGrants: {
              create: { ...forgedGrant(`${TEST_GRANT}03`), user: { connect: { id: SUBJECT } } },
            },
          },
        });
      }),
    );

    expect(error).toMatch(/AUTHORIZATION PLANE/);
    expect(
      await deniedEvents(),
      'the denial event was rolled back together with the write it refused',
    ).toBe(before + 1);
    expect(db.scopeDenialAuditStats().failed).toBe(0);
  });

  it('the refused write is still absent — recording a denial never softens it', async () => {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM "waqf_access_grant" WHERE "id" LIKE '${TEST_GRANT}%'`,
    );
    expect(rows.length, 'a forged grant survived').toBe(0);
    const nazir = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT qmulate_has_active_grant($1, $2, 'NAZIR') AS ok`,
      SUBJECT,
      WAQF_A,
    );
    expect(nazir[0]?.ok, 'the database believes a third party is now the Nazir').toBe(false);
  });

  it('the denial event is itself part of the hash chain, not a side channel', async () => {
    // An ACCESS_DENIED row that is not chained could be deleted without breaking verification, which
    // would make the denial record exactly as forgeable as the thing it records.
    await db.flushScopeDenialAudits();
    const rows = await (await privilegedPrisma()).auditEvent.findMany({ orderBy: { id: 'asc' } });
    const result = db.verifyChain(rows);
    expect(result.ok, `the chain broke: ${JSON.stringify(result).slice(0, 400)}`).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The limitation is declared, not glossed
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('scopeDenialAuditStats() reports failures instead of letting silence read as zero', async () => {
    await db.flushScopeDenialAudits();
    const stats = db.scopeDenialAuditStats();
    expect(stats.recorded).toBeGreaterThan(0);
    // If this ever fails, the trail is INCOMPLETE and the number says by how much — which is the
    // point of counting rather than assuming.
    expect(stats.failed, 'denial events were lost; the trail is incomplete').toBe(0);
  });
});
