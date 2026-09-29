/**
 * D-A / V-E3-02 — **`asset.status` IS A CLOSED VOCABULARY, AND THE API AGREES WITH THE INSTALLED
 * DATABASE RATHER THAN WITH A FILE.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AND WHY IT NEEDS A DATABASE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `test/reserved-matter-surface.test.ts` compares this package's spelling of the vocabulary against
 * MIGRATION TEXT. That is a good check and it has already been vacuously green once: the path was
 * pinned to migration 12 while migration 13 had replaced `qmulate_asset_identity_guard()`'s body, so
 * 27/27 passed against a definition present in no database at all — ADR-0008 §2.4's failure mode, a
 * claim read rather than measured. The scan added there removes the stale-path bug; it cannot remove
 * the deeper one, because a migration FILE is still not the function that is INSTALLED.
 *
 * So this file reads `pg_proc.prosrc` and `pg_enum` — the live definitions — and compares them
 * against the constants the router enforces. Nothing here can be satisfied by a source file.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT D-A DECIDED (product owner, 2026-08-16)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * *"I'm thinking the list will be: Active, Fully Occupied/Rented, partially rented, vacant,
 * expropriated/substituted."* — so `sold`, `pledged`, `mortgaged` and `long_leased` are gone, and
 * that is intended: it is stricter than before and coherent with waqf perpetuity. The consequence
 * the API owns is that three of BR-306's four asset acts have NO representable end state, and must
 * be refused rather than remapped onto the surviving one (ADR-0004: refuse, do not remap).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACT_TO_ASSET_STATUS,
  ASSET_RESERVED_ACTS,
  ASSET_STATUSES,
  ORDINARY_ASSET_STATUSES,
  RESERVED_ASSET_STATUSES,
} from '../src/routers/reservedMatter.js';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('D-A / V-E3-02 (the closed asset-status vocabulary, against the LIVE database)');

const createCaller = createCallerFactory(appRouter);

const WAQF = 'waqf-001';
const ASSET = 'asset-001';
/** A CASE_MANAGER holding `endowment:asset:write` — the maker rung both asset procedures sit on. */
const MAKER = `${API_TEST_PREFIX}assetvocab-maker`;

/** Pulls a `<name> "AssetStatus"[] := ARRAY[…]` declaration out of the LIVE function body. */
function liveGuardArray(prosrc: string, arrayName: string): string[] {
  const declaration = `${arrayName} "AssetStatus"[] := ARRAY[`;
  const start = prosrc.indexOf(declaration);
  if (start === -1) {
    throw new Error(
      `the INSTALLED qmulate_asset_identity_guard() has no "${arrayName}" declaration. Fix this ` +
        `parser rather than deleting the assertion — it is the only thing comparing the API's idea ` +
        `of "which statuses are a reserved matter" against the function that is actually running.`,
    );
  }
  const end = prosrc.indexOf(']::"AssetStatus"[]', start);
  if (end === -1)
    throw new Error(`found ${arrayName} in prosrc but no closing ']::"AssetStatus"[]'`);
  return [...prosrc.slice(start + declaration.length, end).matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map(
    (match) => match[1] as string,
  );
}

describe.skipIf(!hasDatabase)('D-A · the closed asset-status vocabulary', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: MAKER,
        role: 'CASE_MANAGER',
        waqfIds: [WAQF],
        permissions: [
          'endowment:asset:read',
          'endowment:asset:write',
          'approval:request:read',
          'approval:request:initiate',
        ],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 1 · The LIVE type and the LIVE guard
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('ASSET_STATUSES equals the INSTALLED "AssetStatus" enum, member for member', async () => {
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ label: string }[]>(
      `SELECT e.enumlabel AS label
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'AssetStatus'
        ORDER BY e.enumsortorder`,
    );
    expect(
      rows.length,
      'no "AssetStatus" type is installed — migration 13 has not been applied',
    ).toBeGreaterThan(0);
    expect(rows.map((row) => row.label)).toEqual([...ASSET_STATUSES]);
  });

  it('the guard that is RUNNING partitions the type exactly as the router believes', async () => {
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ prosrc: string }[]>(
      `SELECT prosrc FROM pg_proc WHERE proname = 'qmulate_asset_identity_guard'`,
    );
    expect(rows.length, 'qmulate_asset_identity_guard() is not installed').toBe(1);
    const prosrc = rows[0]?.prosrc ?? '';

    // ⚠ THE LIVE BODY, not a migration file. A migration that was edited after being applied, or a
    // database restored from an older dump, disagrees with the repository — and this is the only
    // assertion in the package that would notice.
    expect([...RESERVED_ASSET_STATUSES].sort()).toEqual(
      liveGuardArray(prosrc, 'reserved_statuses').sort(),
    );
    expect([...ORDINARY_ASSET_STATUSES].sort()).toEqual(
      liveGuardArray(prosrc, 'ordinary_statuses').sort(),
    );
    // The twelve-spelling text array and its normalisation are gone from the RUNNING function too.
    expect(prosrc).not.toMatch(/reserved_acts\s+text\[\]\s*:=/);
    expect(prosrc).not.toContain('replace(');
  });

  it('the guard is ENABLE ALWAYS — one `session_replication_role = replica` must not skip it', async () => {
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
      `SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'asset' AND t.tgname = 'asset_identity_guard' AND NOT t.tgisinternal`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tgenabled, "'A' = ENABLE ALWAYS").toBe('A');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 2 · V-E3-02 · the old free-text spellings are UNREPRESENTABLE, not merely ungated
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('every retired spelling is refused at TYPE PARSE, on the runtime connection', async () => {
    // ⚠ ON THE APP CONNECTION (`qmulate_app`), never the owner. A refusal observed as the table owner
    // proves nothing about the runtime — that is the whole point of ADR-0008's privilege split.
    //
    // V-E3-02 was that `asset.status` was FREE TEXT with no CHECK, gated by an allow-list of twelve
    // lower-cased Latin spellings, so ANY other spelling — including the Arabic one, and Arabic is
    // authoritative (NFR-01) — committed a disposal with no reserved-matter approval. The fix is a
    // closed type, so the refusal now happens at 22P02 BEFORE any trigger runs and there is no
    // thirteenth spelling to forget.
    const prisma = await basePrisma();

    const attempt = async (sql: string, value: string): Promise<string | undefined> => {
      try {
        await prisma.$executeRawUnsafe(sql, value, ASSET);
        return undefined;
      } catch (error) {
        const meta = (error as { meta?: { code?: string } }).meta?.code;
        if (meta !== undefined) return meta;
        const match = /Code: `(\w+)`|code: "(\w+)"/.exec(String((error as Error).message));
        return match?.[1] ?? match?.[2];
      }
    };

    for (const retired of [
      'sold',
      'disposed',
      'pledged',
      'mortgaged',
      'long_leased',
      'مباع',
      'x',
    ]) {
      // ⚠ BOTH SHAPES, because they fail for two different reasons and only one of them is the
      // interesting one. An UNCAST text parameter cannot even be assigned to the column (42804
      // datatype_mismatch); a caller who CASTS — which is what anyone writing raw SQL against a
      // typed column actually does — is refused at type parse (22P02
      // invalid_text_representation). Asserting only the first would leave the second untested and
      // would read as though a cast might get through.
      expect(
        await attempt(`UPDATE "asset" SET "status" = $1 WHERE "id" = $2`, retired),
        `uncast UPDATE with ${JSON.stringify(retired)} was NOT refused`,
      ).toBe('42804');
      expect(
        await attempt(`UPDATE "asset" SET "status" = $1::"AssetStatus" WHERE "id" = $2`, retired),
        `cast UPDATE with ${JSON.stringify(retired)} was NOT refused`,
      ).toBe('22P02');
    }

    // ⚠ AND THE REFUSAL IS ABOUT THE VALUE, NOT ABOUT RAW SQL BEING BLOCKED. A legal ORDINARY value
    // written the same way COMMITS — without which every assertion above would hold on a connection
    // that simply cannot write this column at all.
    const legal = await attempt(
      `UPDATE "asset" SET "status" = $1::"AssetStatus" WHERE "id" = $2`,
      'VACANT',
    );
    expect(
      legal,
      'the runtime role cannot write a LEGAL status either — the probe is vacuous',
    ).toBeUndefined();

    const after = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status"::text AS status FROM "asset" WHERE "id" = $1`,
      ASSET,
    );
    expect(after[0]?.status).toBe('VACANT');
    expect(ASSET_STATUSES as readonly string[]).toContain(after[0]?.status);

    // Put the seeded value back. `asset-001` seeds ACTIVE, and a status this file moved would
    // otherwise travel to the next suite — the database is shared and the run order is fixed.
    await prisma.$executeRawUnsafe(
      `UPDATE "asset" SET "status" = 'ACTIVE'::"AssetStatus" WHERE "id" = $1`,
      ASSET,
    );
    const restored = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status"::text AS status FROM "asset" WHERE "id" = $1`,
      ASSET,
    );
    expect(restored[0]?.status).toBe('ACTIVE');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 3 · The three acts D-A left with nowhere to land
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('requestReservedAct REFUSES an act with no representable end state, and mints nothing', async () => {
    const prisma = await basePrisma();
    const countRequests = async (): Promise<number> => {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "approval_request" WHERE "makerId" = $1`,
        MAKER,
      );
      return Number(rows[0]?.n ?? 0);
    };

    for (const act of ASSET_RESERVED_ACTS.filter((a) => ACT_TO_ASSET_STATUS[a] === null)) {
      const before = await countRequests();
      const ctx = await contextFor({ userId: MAKER, requestId: `assetvocab-${act}` });
      let thrown: unknown;
      try {
        await createCaller(ctx).asset.requestReservedAct({
          waqfId: WAQF,
          assetId: ASSET,
          act,
          justification: `D-A: ${act} has no representable end state (بيانات وهمية)`,
        });
      } catch (error) {
        thrown = error;
      }
      const message = String((thrown as Error | undefined)?.message);
      expect(message, `${act} was not refused`).toContain('ASSET_END_STATE_UNREPRESENTABLE');
      // ⚠ "REFUSED" AND "MINTED NOTHING" ARE DIFFERENT CLAIMS. An approval left behind would occupy
      // this asset's one-open-per-subject slot and block the act that IS still performable.
      expect(await countRequests(), `${act} left an approval_request behind`).toBe(before);
    }
  }, 120_000);

  it('the ONE surviving act still works end-to-end up to the approval', async () => {
    // ⚠ THE POSITIVE CONTROL. Without it, "three acts are refused" is equally true of a router that
    // refuses all four, and BR-306 would be silently unimplementable rather than narrowed.
    const ctx = await contextFor({ userId: MAKER, requestId: 'assetvocab-istibdal' });
    const minted = await createCaller(ctx).asset.requestReservedAct({
      waqfId: WAQF,
      assetId: ASSET,
      act: 'SUBSTITUTION_ISTIBDAL',
      justification:
        'D-A: the one act whose end state survives the closed vocabulary (بيانات وهمية)',
    });
    expect(minted.status).toBe('PENDING');
    // BR-306: the asset itself is UNCHANGED by marking the act reserved.
    expect(minted.blocked).toBe(true);

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ payload: unknown; reservedMatterKind: string }[]>(
      `SELECT "payload", "reservedMatterKind"::text AS "reservedMatterKind"
         FROM "approval_request" WHERE "id" = $1`,
      minted.approvalRequestId,
    );
    const payload = rows[0]?.payload as Record<string, unknown>;
    expect(rows[0]?.reservedMatterKind).toBe('ASSET_SUBSTITUTION_ISTIBDAL');
    // The artifact the Nazir will sign names the CLOSED-vocabulary value, not a free-text one.
    expect(payload['toStatus']).toBe('SUBSTITUTED_ISTIBDAL');
    expect(ASSET_STATUSES as readonly string[]).toContain(String(payload['toStatus']));
  }, 120_000);
});
