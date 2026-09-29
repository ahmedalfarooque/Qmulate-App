/**
 * R-2 · TRUNCATE IS REFUSED ON EACH TABLE'S OWN ACCOUNT — not by the accident of a cascade.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SEPARATE FILE, AND WHY EVERY ASSERTION MATCHES A TABLE NAME
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `TRUNCATE` fires NO row triggers at all, so a `BEFORE DELETE` guard without a `BEFORE TRUNCATE`
 * sibling is one statement away from irrelevant. Migration 4 learned that on `waqf` — where the
 * refusal it shipped a passing test for came only from a cascade into `document`, the one downstream
 * table that happened to have a TRUNCATE guard. A property of the FK graph, not a control.
 *
 * THE SAME FALSE NEGATIVE WAS MEASURED AGAIN HERE, BEFORE MIGRATION 8. On a freshly migrated and
 * seeded database, 2026-07-29:
 *
 *   TRUNCATE "client" CASCADE   -> refused [42501] `TRUNCATE on "waqf" is refused`      ← wrong table
 *   TRUNCATE "waqif"  CASCADE   -> refused [42501] `TRUNCATE on "waqf" is refused`      ← wrong table
 *   TRUNCATE "setting"          -> **PERMITTED** (table emptied — every regulatory figure gone)
 *   TRUNCATE "compliance_obligation" CASCADE -> **PERMITTED** (cascaded into an unguarded child)
 *
 * So `client` and `waqif` LOOKED covered and were not: one `TRUNCATE "client" CASCADE` issued when
 * `waqf` had no guard, or with `waqf`'s guard dropped, empties the whole family tree. Every assertion
 * below therefore matches `TRUNCATE on "<the target>" is refused`, so a neighbour's guard can never be
 * mistaken for the target's.
 *
 * ⚠ ON THE NON-CASCADE FORM. Postgres validates the "referenced in a foreign key constraint" rule
 * BEFORE it fires `BEFORE TRUNCATE`, so a plain `TRUNCATE "client"` raises 0A000 and the guard never
 * runs — the same behaviour `shart-immutability.integration.test.ts` records for `waqf`. That is not
 * asserted away: what matters is that NO form of TRUNCATE empties the table, so the non-cascade case
 * asserts the statement raised AND the row count is unchanged, without claiming which check won.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  ensureSeeded,
  guardProbeSql,
  hasDatabase,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('R-2 — TRUNCATE coverage on the retention-remainder tables');

interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

/** Every table migration 8 governs, and whether the FK graph short-circuits the non-cascade form. */
const GOVERNED: readonly { table: string; fkReferenced: boolean }[] = [
  { table: 'setting', fkReferenced: false },
  { table: 'client', fkReferenced: true },
  { table: 'waqif', fkReferenced: true },
  { table: 'compliance_obligation', fkReferenced: true },
  { table: 'compliance_task', fkReferenced: false },
  { table: 'government_filing', fkReferenced: false },
  { table: 'zakat_filing', fkReferenced: false },
  { table: 'deadline', fkReferenced: false },
  { table: 'legal_case', fkReferenced: false },
];

describe.skipIf(!hasDatabase)('R-2 · TRUNCATE on the retention-remainder tables', () => {
  let prisma: PrismaLike;

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
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
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('every governed table carries a BEFORE TRUNCATE statement trigger, ENABLE ALWAYS', async () => {
    const rows = await prisma.$queryRawUnsafe<
      { table: string; tgname: string; tgenabled: string }[]
    >(
      `SELECT c.relname AS "table", t.tgname, t.tgenabled::text AS tgenabled
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = 'public' AND (t.tgtype & 32) <> 0`,
    );
    const covered = new Map(rows.map((r) => [r.table, r]));

    expect(
      GOVERNED.filter(({ table }) => !covered.has(table)).map(({ table }) => table),
      'a governed table has a DELETE guard and NO TRUNCATE guard, which is one statement from ' +
        'irrelevant — TRUNCATE fires no row triggers',
    ).toEqual([]);
    expect(
      GOVERNED.map(({ table }) => covered.get(table))
        .filter((r) => r !== undefined && r.tgenabled !== 'A')
        .map((r) => `${r?.tgname}=${r?.tgenabled}`),
      "a TRUNCATE guard is not 'ENABLE ALWAYS'",
    ).toEqual([]);
  });

  describe('TRUNCATE … CASCADE is refused by the TARGET table', () => {
    for (const { table } of GOVERNED) {
      it(`refuses TRUNCATE "${table}" CASCADE, naming "${table}"`, async () => {
        const error = await runProbe(
          guardProbeSql(`TRUNCATE "${table}" CASCADE`, 'insufficient_privilege'),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(
          error,
          `the TRUNCATE refusal came from a CASCADED table, not from "${table}" — this is the exact ` +
            `false negative migration 4 shipped, and it was measured again on "client" and "waqif" ` +
            `before migration 8 (both refused with \`TRUNCATE on "waqf" is refused\`)`,
        ).toMatch(new RegExp(`TRUNCATE on "${table}" is refused`));
      });
    }
  });

  describe('the plain, non-CASCADE form does not empty the table either', () => {
    for (const { table, fkReferenced } of GOVERNED) {
      it(`TRUNCATE "${table}" raises and leaves the row count unchanged`, async () => {
        const countSql = `SELECT count(*)::text AS n FROM "${table}"`;
        const [before] = await prisma.$queryRawUnsafe<{ n: string }[]>(countSql);

        let raised: string | null = null;
        try {
          await prisma.$executeRawUnsafe(`TRUNCATE "${table}"`);
        } catch (error: unknown) {
          raised = String(error);
        }
        expect(raised, `TRUNCATE "${table}" succeeded`).not.toBeNull();

        // ⚠ WHICH CHECK WON IS NOT ASSERTED FOR THE FK-REFERENCED TABLES. Postgres validates the
        // FK rule before firing BEFORE TRUNCATE, so 0A000 arrives first and the guard never runs.
        // The outcome that matters is that the table is not empty; the CASCADE case above is what
        // proves the guard itself.
        if (!fkReferenced) {
          expect(
            raised,
            `"${table}" is not FK-referenced, so its OWN guard must be what fired`,
          ).toMatch(new RegExp(`TRUNCATE on "${table}" is refused`));
        }

        const [after] = await prisma.$queryRawUnsafe<{ n: string }[]>(countSql);
        expect(after?.n, `"${table}" was emptied`).toBe(before?.n);
      });
    }
  });

  it('refuses TRUNCATE under session_replication_role = replica as well', async () => {
    // A BEFORE TRUNCATE trigger created without ENABLE ALWAYS is `tgenabled = 'O'` and is SKIPPED
    // after one plain `SET` — the Sprint-1 finding that defeated gate G-1. Asserted behaviourally
    // rather than by reading `tgenabled`, because the catalogue value is what a regression would
    // change silently.
    for (const { table } of GOVERNED) {
      const error = await runProbe(
        guardProbeSql(
          `SET LOCAL session_replication_role = 'replica'; TRUNCATE "${table}" CASCADE`,
          'insufficient_privilege',
        ),
      );
      expect(error, `"${table}" TRUNCATE was skipped under the replica role`).toContain(
        `${PROBE_BLOCKED}[42501]`,
      );
      expect(error).toMatch(new RegExp(`TRUNCATE on "${table}" is refused`));
    }
  });

  it('MUTATION · with the TRUNCATE guard off, `setting` empties and audit_event does not move', async () => {
    // The reproduction, driven to completion inside a rolled-back transaction. `setting` is the
    // sharpest single statement available in this file's remit: it holds EVERY regulatory figure in
    // the system — the SAR 200M/50M bands, the 30/15/10-business-day windows, the 3-month post-FYE
    // distribution window, the >= 10-year retention period and both 10% fees — all ⚠ unverified
    // against primary Saudi law. One TRUNCATE took all sixteen rows with no audit event.
    let emptied: number | null = null;
    let auditDelta: number | null = null;
    const ROLLBACK = '__qmulate_setting_truncate__';

    try {
      await (
        prisma as unknown as {
          $transaction: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
        }
      ).$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE "setting" DISABLE TRIGGER setting_no_truncate`);
        const [before] = await tx.$queryRawUnsafe<{ s: string; a: string }[]>(
          `SELECT (SELECT count(*) FROM "setting")::text AS s,
                  (SELECT count(*) FROM "audit_event")::text AS a`,
        );
        await tx.$executeRawUnsafe(`TRUNCATE "setting"`);
        const [after] = await tx.$queryRawUnsafe<{ s: string; a: string }[]>(
          `SELECT (SELECT count(*) FROM "setting")::text AS s,
                  (SELECT count(*) FROM "audit_event")::text AS a`,
        );
        emptied = Number(before?.s ?? '0') - Number(after?.s ?? '0');
        auditDelta = Number(after?.a ?? '0') - Number(before?.a ?? '0');
        throw new Error(ROLLBACK);
      });
    } catch (error: unknown) {
      if (!String(error).includes(ROLLBACK)) throw error;
    }

    expect(
      emptied,
      'the TRUNCATE removed no rows, so this case is a false negative rather than a reproduction',
    ).toBeGreaterThan(0);
    expect(auditDelta, 'the mass erasure produced an audit event').toBe(0);

    await assertGuardsInstalled(); // and no guard was left off
    const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "setting"`,
    );
    expect(Number(row?.n ?? '0')).toBeGreaterThan(0);
  });
});
