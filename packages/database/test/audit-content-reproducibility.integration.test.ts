/**
 * AL-1 · EVERY audit row's hash reproduces FROM THE BYTES THE DATABASE ACTUALLY HOLDS.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FINDING THIS FILE EXISTS FOR (measured 2026-08-16, S4)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `appendAuditEvent()` wrote `before`/`after` as `Prisma.DbNull` when there was no image to record.
 * `Prisma.DbNull` is a SENTINEL OBJECT recognized BY IDENTITY, and under the Next.js bundler that
 * identity is lost: the `Prisma` namespace the transpiled `@qmulate/database` closes over is not the
 * copy the executing client compares against, and an unrecognized sentinel is written as what it
 * looks like — `{}` (`JSON.stringify(Prisma.DbNull) === '{}'`). The row's `rowHash` had already been
 * computed over `null`. So the row was born unable to verify against its own stored content.
 *
 * MEASURED, through the REAL WEB PATH — a fresh cluster (migrate + seed), `next dev`, a registered
 * account with TOTP and no grant, two `endowment.get` calls over HTTP:
 *
 *   BEFORE the fix   155 rows · 153 reproduce · 2 BROKEN
 *                    both: action=ACCESS_DENIED, procedure=endowment.get, stored `{}`/`{}`,
 *                    and both reproduce EXACTLY when before/after are replaced by `null`.
 *   AFTER  the fix   157 rows · 155 reproduce · the same 2 still broken (append-only: they are
 *                    NOT repairable and were NOT rewritten), and the two NEW denials written by the
 *                    same server through the same procedure store SQL NULL and reproduce.
 *
 * The 153 that reproduced throughout are the positive control: the same writer, in a plain Node
 * realm, produces rows whose content and hash agree — so this is a broken ROW, not a broken
 * recomputation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A NEW FILE RATHER THAN LEANING ON A6
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `audit-immutability.integration.test.ts`'s A6 (`verifyChain`) does check every row — and it DID
 * go red when this shape appeared. Two things it cannot do, and this file does:
 *
 *   1. A6 stops at the FIRST break and reports two hashes. The sweep below reports EVERY divergent
 *      row with the discriminator that names the cause (does the stored hash reproduce when
 *      before/after are replaced by `null`?), so the next occurrence is diagnosed, not investigated.
 *   2. A6 is a property of a DATABASE. The write-boundary assertions below are a property of the
 *      WRITER: they write through `recordEvent()` — the hook the API layer and the scope-denial
 *      handler both use — and then read the row back with raw SQL to assert the column is SQL NULL
 *      and not `{}`. `IS NULL` is asked of Postgres, because Prisma reports both a JSON `null` and a
 *      SQL NULL as JS `null` and would have hidden the very distinction that failed.
 *
 * ⚠ NEITHER OF THESE WOULD HAVE FIRED IN CI BEFORE THE FIX, AND THAT IS THE OTHER HALF OF THE
 * FINDING: the e2e job is the only thing that exercises the bundled realm, it runs on its own
 * database, and no chain verification runs after it. The write-boundary assertions below hold in
 * ANY realm, so they are the part that travels.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED (2026-08-16) — every line below is a run that happened, not an argument
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   1. REAL broken rows, not a simulation. Run against the scratch cluster that still carried the
 *      two pre-fix web denials, the sweep went RED and named them:
 *          {id: "154", action: "ACCESS_DENIED", procedure: "endowment.get",
 *           reproducesAsNull: true, storedBefore: "{}", storedAfter: "{}"}  (and id 155)
 *      Then, on a freshly migrated + seeded cluster, the same sweep passed over 4,800+ rows.
 *   2. Poisoned WRITER. `appendAuditEvent` was temporarily changed to `data.before =
 *      payloadRow.before ?? {}` while the hash still saw `null`. Both write-boundary tests went RED
 *      — and the sweep STAYED GREEN, because the writer's own read-back self-check refused each row
 *      before it could commit ("audit_event 5137 … would have been stored with content its own
 *      rowHash does not reproduce … REFUSED and the transaction rolled back"). The mutation cannot
 *      even poison the table. The source was then restored and byte-compared against its backup.
 *   3. The detector is exercised in-file on a matched clean/poisoned pair, so this suite cannot pass
 *      by looking at nothing.
 *
 * ⚠ NOT DONE, DELIBERATELY: no AL-1 row is ever INSERTED by this file. Such a row can never be
 * deleted, so a test that writes one would poison every later run on that database — which is the
 * whole reason the finding is severe.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeRowHash, type AuditHashRow } from '../src/hash-chain.js';
import {
  FICTIONAL_MARKER_AR,
  closeDatabase,
  databaseModule,
  deleteTestClients,
  ensureSeeded,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('AL-1 (every audit row reproduces its own hash from its stored content)');

/** Not `user-seed-admin`: `seed.integration.test.ts` counts that actor's events exactly. */
const TEST_ACTOR_ID = 'user-al1-harness';

type StoredRow = AuditHashRow & { prevHash: string; rowHash: string };

interface Divergence {
  id: string;
  action: string;
  procedure: string;
  /** The discriminator that named AL-1: the stored hash reproduces only with both fields nulled. */
  reproducesAsNull: boolean;
  storedBefore: string;
  storedAfter: string;
}

describe.skipIf(!hasDatabase)('AL-1 · stored content reproduces its own rowHash', () => {
  beforeAll(async () => {
    // A trail with rows in it. Sweeping an EMPTY table would pass vacuously.
    ensureSeeded();
    await deleteTestClients();
  });

  afterAll(async () => {
    // The `client` row goes; its audit_event stays, because the table is append-only and that is
    // the property under test.
    await deleteTestClients();
    await closeDatabase();
  });

  /**
   * Read through PRISMA, not a raw driver: `occurredAt` is `timestamp WITHOUT time zone`, and a raw
   * driver interprets it in the LOCAL zone while Prisma reads it as UTC. Measured while diagnosing
   * this: the raw path reported all 141 seeded rows broken on a UTC+6 machine — a false positive on
   * every row, which is the worst possible outcome for a verification test.
   */
  async function allEvents(): Promise<StoredRow[]> {
    const prisma = await privilegedPrisma();
    return (await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } })) as unknown as StoredRow[];
  }

  /** `IS NULL` asked of POSTGRES. Prisma reports SQL NULL and JSON `null` identically. */
  async function storedJsonShape(id: bigint | string): Promise<{
    beforeIsSqlNull: boolean;
    afterIsSqlNull: boolean;
    beforeText: string | null;
    afterText: string | null;
  }> {
    const prisma = await privilegedPrisma();
    const [row] = await prisma.$queryRawUnsafe<
      {
        beforeIsSqlNull: boolean;
        afterIsSqlNull: boolean;
        beforeText: string | null;
        afterText: string | null;
      }[]
    >(
      `SELECT "before" IS NULL AS "beforeIsSqlNull",
              "after"  IS NULL AS "afterIsSqlNull",
              "before"::text   AS "beforeText",
              "after"::text    AS "afterText"
         FROM "audit_event" WHERE "id" = $1::bigint`,
      String(id),
    );
    if (row === undefined) throw new Error(`audit_event ${String(id)} vanished between reads`);
    return row;
  }

  function divergences(rows: readonly StoredRow[]): Divergence[] {
    return rows
      .filter((row) => recomputeRowHash(row, row.prevHash) !== row.rowHash)
      .map((row) => ({
        id: String(row.id),
        action: row.action,
        procedure:
          ((row as unknown as { context: { procedure?: string } | null }).context ?? {})
            .procedure ?? '-',
        reproducesAsNull:
          recomputeRowHash({ ...row, before: null, after: null }, row.prevHash) === row.rowHash,
        storedBefore: JSON.stringify((row as unknown as { before: unknown }).before),
        storedAfter: JSON.stringify((row as unknown as { after: unknown }).after),
      }));
  }

  // ── 1 · THE SWEEP ───────────────────────────────────────────────────────────────────────────

  it('every row in the table recomputes from the content the database holds', async () => {
    const rows = await allEvents();
    // The seed alone writes well over a hundred events; a table this small means the seed did not
    // run and the sweep would be proving nothing.
    expect(rows.length, 'audit_event is too small to be a seeded trail').toBeGreaterThan(96);

    expect(
      divergences(rows),
      'These audit rows store content their own rowHash does not reproduce. Such a row can NEVER ' +
        'verify and can NEVER be repaired — audit_event is append-only — so every chain ' +
        'verification on this database fails from here on. `reproducesAsNull: true` is AL-1 ' +
        'exactly: the writer hashed `null` and persisted `{}`. Do NOT "fix" it with an UPDATE; ' +
        'report the count and fix the writer.',
    ).toEqual([]);
  });

  /**
   * ⚠ THE SWEEP MUST NOT BE ABLE TO PASS BY BEING BLIND.
   *
   * The detector is exercised on a row shaped exactly like AL-1, IN MEMORY — never inserted, because
   * an append-only table keeps whatever a test writes into it for ever. If this ever goes green
   * against a poisoned row, the sweep above is decoration.
   */
  it('the detector actually detects — an AL-1-shaped row is reported, not passed over', async () => {
    const [first] = await allEvents();
    expect(first, 'audit_event is empty').toBeDefined();
    const template = first as StoredRow;

    // A row hashed over `null`/`null` — the honest shape a denial has. Its hash is derived here
    // rather than found in the table, so this proof does not depend on the trail having written a
    // denial yet (it had not, on a freshly seeded database — measured).
    const hashedOverNull = { ...template, before: null, after: null };
    const rowHash = recomputeRowHash(hashedOverNull, template.prevHash);

    // The clean row must NOT be reported: a detector that flags everything proves nothing.
    expect(divergences([{ ...hashedOverNull, rowHash } as StoredRow])).toEqual([]);

    // The SAME hash, with `{}` stored where the hash saw `null`. This IS AL-1.
    const poisoned = { ...template, before: {}, after: {}, rowHash } as StoredRow;
    const found = divergences([poisoned]);
    expect(found).toHaveLength(1);
    expect(found[0]?.reproducesAsNull).toBe(true);
  });

  // ── 2 · THE WRITE BOUNDARY, IN THIS REALM AND IN ANY OTHER ──────────────────────────────────

  it('an ACCESS_DENIED written through recordEvent() stores SQL NULL, not {}', async () => {
    const { makeSystemContext, recordEvent } = await databaseModule();
    const ctx = makeSystemContext({
      actorId: TEST_ACTOR_ID,
      requestId: 'al1-denial',
      procedure: 'endowment.get',
      reason: 'AL-1 write-boundary assertion',
    });

    // The same call shape `recordProcedureDenial()` makes: no before/after at all.
    const { id, rowHash } = await recordEvent(ctx, {
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityType: 'Procedure',
      entityId: 'endowment.get',
      waqfId: 'waqf-001',
      extraContext: { code: 'NO_GRANT', reason: 'AL-1 write-boundary assertion' },
    });

    const shape = await storedJsonShape(id);
    // ⚠ ASKED OF POSTGRES. `{}` and SQL NULL are both `null` once Prisma has read them, and that
    // coercion is precisely what let AL-1 through unnoticed for the length of a sprint.
    expect(
      shape,
      `audit_event ${String(id)} stored before=${shape.beforeText ?? 'SQL NULL'} ` +
        `after=${shape.afterText ?? 'SQL NULL'} — a denial has no before-image, and an empty ` +
        'object says something different (and false): "a diff with no changed keys".',
    ).toMatchObject({ beforeIsSqlNull: true, afterIsSqlNull: true });

    const prisma = await privilegedPrisma();
    const stored = (await prisma.auditEvent.findUniqueOrThrow({
      where: { id },
    })) as unknown as StoredRow;
    expect(stored.rowHash).toBe(rowHash);
    expect(recomputeRowHash(stored, stored.prevHash)).toBe(stored.rowHash);
  });

  it('an ordinary audited write reproduces too — the positive control, in the same run', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();
    const ctx = makeSystemContext({
      actorId: TEST_ACTOR_ID,
      requestId: 'al1-positive-control',
      reason: 'AL-1 positive control',
    });

    // A `client-9…` row, the harness's established test-row namespace (`deleteTestClients()` takes
    // it away again). The CREATE path gives this event a real, non-empty `after` image — so the
    // control fails if the RECOMPUTATION is broken, which is what makes it a control at all.
    const id = 'client-9al1';
    await withAudit(ctx, async (tx) => {
      await tx.client.create({
        data: { id, nameAr: `عميل اختبار ${FICTIONAL_MARKER_AR}`, nameEn: `AL-1 control ${id}` },
      });
    });

    const prisma = await privilegedPrisma();
    const stored = (await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: 'Client', entityId: id },
      orderBy: { id: 'desc' },
    })) as unknown as StoredRow;

    // A non-empty `after` — otherwise this control would pass for the same reason the bug hid.
    expect(Object.keys((stored as unknown as { after: object }).after).length).toBeGreaterThan(0);
    expect(recomputeRowHash(stored, stored.prevHash)).toBe(stored.rowHash);
  });

  // ── 3 · AND THE SWEEP STILL HOLDS AFTER THIS FILE HAS WRITTEN TO THE TABLE ───────────────────

  it('the whole table still reproduces after these writes', async () => {
    expect(divergences(await allEvents())).toEqual([]);
  });
});
