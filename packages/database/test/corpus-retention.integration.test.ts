/**
 * N-3 · A CORPUS OR LEDGER ROW IS NEVER HARD-DELETED — the whole family, not just `asset`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS REPRODUCED, AND WHY IT IS BINDING RULE 1
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The *asl* (أصل) is the endowed principal, and CLAUDE.md's first binding rule states that a
 * NON-DIMINUTION-OF-CORPUS INVARIANT ALWAYS HOLDS: "no operation may distribute, erode, or reclassify
 * corpus as income." A corpus asset row VANISHING, with no audit event and no way back, is the
 * sharpest available violation of that — and until `00000000000006_e2_corpus_retention_guards` it was
 * permitted. It was reached in the round-2 re-attack by a SUBCONTRACTOR seat holding only
 * compliance/document write permissions, through `$executeRawUnsafe` on its own scoped Prisma client.
 *
 * Migration 4 closed `DELETE` on `waqf` after a `pg_trigger` census found it "the only guarded table
 * with no DELETE coverage". That sentence was true; the conclusion drawn from it was too narrow,
 * because the census had been run over the GUARDED tables. Re-run over ALL of them on a freshly
 * migrated + seeded database, 2026-07-28:
 *
 *   table                    target                 deleted  audit_event delta
 *   asset                    asset-001                    1  0
 *   expropriation            exp-001                      1  0
 *   transaction              exp-e-001                    1  0
 *   distribution_line_item   dli-dist-001-ben-001         1  0
 *   distribution             dist-001                     1  0     ← a PAID, EXECUTED run
 *   bank_account             bankacct-fake-acct-w1        1  0
 *   nazir_fee                fee-001                      1  0
 *   lease                    (constructed)                1  0
 *   trusteeship_deed         trust-waqf-001               1  0
 *   beneficiary              ben-003                      1  0
 *   reclassification_event   (constructed)                1  0
 *
 * ⚠ TWO OF THOSE ROWS HAD TO BE CONSTRUCTED. The fixture ships ZERO `lease` and ZERO
 * `reclassification_event` rows, so a probe that simply issued a `DELETE` would have removed nothing
 * and read as a working control. Every case in this file that touches an empty table therefore
 * INSERTS its subject first, and the assertions below check the DELETE matched a row.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THIS FILE IS STRUCTURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   1. THE CENSUS, read from `pg_trigger` — not from the migration text. The claim "every
 *      corpus/ledger table has DELETE and TRUNCATE coverage, ENABLE ALWAYS" is checked against the
 *      live catalogue, so a table added to the schema without a guard turns this red.
 *   2. PER TABLE, GUARD ON: the `DELETE` is refused, the refusal NAMES THAT TABLE (not a cascaded
 *      sibling — migration 4 shipped a TRUNCATE test that was passing on the accident of an FK
 *      cascade), and it is refused under `session_replication_role = 'replica'` too.
 *   3. PER TABLE, GUARD OFF: the MUTATION, executed. Inside a rolled-back transaction the guards are
 *      disabled and the delete is driven to completion, with `audit_event` measured before and after.
 *      That is the reproduction above, re-run on every CI run, so "the guard is what stops this" is
 *      demonstrated rather than assumed.
 *   4. THE POSITIVE CONTROLS: soft delete still works, and a DRAFT run's line items are still
 *      deletable. A guard that leaves no legal path is an outage, not a control.
 *
 * ⚠ AND THE RESIDUAL, UNCHANGED. Step 3 disables triggers, which needs table OWNERSHIP — and on
 * Railway the runtime connects AS THE OWNER. So every assertion here is about a caller who has NOT
 * disabled the guards. Privilege separation is deferred to E12 by ADR-0008, the insider with
 * application-database credentials is INSIDE the threat model, and the hard gate stands: no real
 * client data before E12.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  RETENTION_SCAFFOLDING_GUARDS,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  guardProbeSql,
  hasDatabase,
  retentionScaffoldingSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('N-3 — corpus and ledger rows are never hard-deleted');

const WAQF = 'waqf-001';
/** The seat the round-2 re-attack used: compliance/document write verbs and nothing else. */
const SUBCONTRACTOR = 'user-accountant-001';

interface RawTx {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}
interface PrismaLike extends RawTx {
  $transaction: <T>(fn: (tx: RawTx) => Promise<T>) => Promise<T>;
}

/**
 * One corpus / ledger table, with everything needed to delete a real row of it.
 *
 * `construct` exists for the two tables the fixture leaves empty. `peel` nulls or removes the FK
 * children that would otherwise make the DELETE fail for reasons that are not the guard.
 */
interface Target {
  readonly table: string;
  /** Human-readable reason this table is corpus or ledger evidence. */
  readonly why: string;
  /** SQL returning exactly one `id`. */
  readonly pick: string;
  readonly construct?: readonly string[];
  readonly peel?: (id: string) => readonly string[];
}

const CONSTRUCTED_LEASE = 'lease-retention-9001';
const CONSTRUCTED_RECLASS = 'reclass-retention-9001';

/**
 * ⚠ THE ORDER MATTERS, and only for the MUTATION loop. That loop deletes one row per table inside a
 * single transaction, so a parent whose `peel` removes its children must come AFTER them — otherwise
 * the child's own case finds an empty table and reports a DEFECTIVE PROBE. Measured: with
 * `distribution` first, `distribution_line_item` had nothing left to delete and the case read as a
 * pass until the `deleted === 1` assertion caught it.
 */
const TARGETS: readonly Target[] = [
  {
    table: 'distribution_line_item',
    why: 'who was paid what, on a run that is out of computation',
    pick: `SELECT "id" FROM "distribution_line_item" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'distribution',
    why: 'a PAID run — dist-001 is EXECUTED',
    pick: `SELECT "id" FROM "distribution" ORDER BY "id" LIMIT 1`,
    peel: (id) => [`DELETE FROM "distribution_line_item" WHERE "distributionId" = '${id}'`],
  },
  {
    table: 'transaction',
    why: 'the ledger, and the income-vs-capital classification the waterfall consumes',
    pick: `SELECT "id" FROM "transaction" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'bank_account',
    why: 'the dedicated, non-commingled account a waqf’s money moved through',
    pick: `SELECT "id" FROM "bank_account" ORDER BY "id" LIMIT 1`,
    peel: (id) => [`DELETE FROM "transaction" WHERE "bankAccountId" = '${id}'`],
  },
  {
    table: 'asset',
    why: 'the corpus itself — asl / أصل',
    // A parcel with no expropriation, lease or maintenance ticket hanging off it, so the refusal can
    // only come from `asset_no_delete`.
    pick: `SELECT a."id" FROM "asset" a
            WHERE NOT EXISTS (SELECT 1 FROM "expropriation" x WHERE x."assetId" = a."id")
              AND NOT EXISTS (SELECT 1 FROM "lease" l WHERE l."assetId" = a."id")
              AND NOT EXISTS (SELECT 1 FROM "maintenance_ticket" m WHERE m."assetId" = a."id")
            ORDER BY a."id" LIMIT 1`,
    peel: (id) => [`UPDATE "transaction" SET "assetId" = NULL WHERE "assetId" = '${id}'`],
  },
  {
    table: 'expropriation',
    why: 'the istibdal record — corpus proceeds staying corpus',
    pick: `SELECT "id" FROM "expropriation" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'nazir_fee',
    why: 'the deed-set ʿushr taken out of ghallah before distribution',
    pick: `SELECT "id" FROM "nazir_fee" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'lease',
    why: 'the instrument the ghallah arises from',
    // ⚠ CONSTRUCTED: the fixture ships zero leases. Without this the DELETE matches nothing.
    pick: `SELECT '${CONSTRUCTED_LEASE}'::text AS "id"`,
    construct: [
      `INSERT INTO "lease" ("id","waqfId","assetId","tenantAr","rentSar","startDate",
          "startDateHijri","endDate","endDateHijri","status","createdAt","updatedAt")
        SELECT '${CONSTRUCTED_LEASE}', a."waqfId", a."id", 'مستأجر وهمي (بيانات وهمية)', 1000.00,
               '2026-01-01'::timestamp, '1447-07-12', '2027-01-01'::timestamp, '1448-07-05',
               'ACTIVE', now(), now()
          FROM "asset" a WHERE a."waqfId" = '${WAQF}' ORDER BY a."id" LIMIT 1`,
    ],
  },
  {
    table: 'trusteeship_deed',
    why: 'the Nazir’s own appointment — jointly and severally liable, Art. 11(5)',
    pick: `SELECT "id" FROM "trusteeship_deed" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'beneficiary',
    why: 'entitlement (branch, tabaqa, share) plus the UBO dataset',
    pick: `SELECT b."id" FROM "beneficiary" b
            WHERE NOT EXISTS (SELECT 1 FROM "distribution_line_item" l WHERE l."beneficiaryId" = b."id")
              AND NOT EXISTS (SELECT 1 FROM "waqf_access_grant" g WHERE g."beneficiarySelfId" = b."id")
              AND NOT EXISTS (SELECT 1 FROM "document" d WHERE d."beneficiaryId" = b."id")
            ORDER BY b."id" LIMIT 1`,
  },
  {
    table: 'reclassification_event',
    why: 'the classification history that decides which obligations applied when',
    // ⚠ CONSTRUCTED for the same reason as `lease`. Note `from`/`to` are `WaqfClassification`
    // (large / medium / small), NOT `ReceiptClass` — this table is the waqf's size history.
    //
    // ⚠ AMENDED IN S4, AND THE OLD ROW IS WHY. This scaffolding used to insert `from: SMALL` while
    // `waqf-001` is MEDIUM — a transition that never happened. S4's migration 12 installs
    // `reclassification_event_from_matches_current`, which refuses exactly that, so the INSERT
    // began raising 42501 in `beforeAll` and took THIS WHOLE FILE WITH IT: 24 retention tests
    // reported as SKIPPED, including the `asl` / أصل DELETE refusal that Binding rule 1 turns on.
    // The trigger is right and the fixture was wrong: `from` must be the waqf's CURRENT
    // classification, because an event is inserted BEFORE the waqf is updated, in one transaction.
    // Fixed by making the row coherent (MEDIUM → LARGE), NOT by relaxing the guard.
    pick: `SELECT '${CONSTRUCTED_RECLASS}'::text AS "id"`,
    construct: [
      `INSERT INTO "reclassification_event" ("id","waqfId","from","to","at","atHijri","reason","createdAt")
        VALUES ('${CONSTRUCTED_RECLASS}','${WAQF}','MEDIUM'::"WaqfClassification",
                'LARGE'::"WaqfClassification",'2026-03-01'::timestamp,'1447-09-12',
                'e2 round-3 test row (بيانات وهمية)', now())`,
    ],
  },
];

/** Every table migration 6 governs, for the census. */
const GOVERNED_TABLES = TARGETS.map((t) => t.table);

describe.skipIf(!hasDatabase)('N-3 · corpus and ledger retention at the database layer', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  /** The `asset` target, by name — the array order is load-bearing for the mutation loop only. */
  const assetTarget = TARGETS.find((t) => t.table === 'asset') as Target;

  const pickId = async (target: Target): Promise<string> => {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(target.pick);
    expect(
      rows.length,
      `DEFECTIVE PROBE: ${target.table}'s pick matched ${rows.length} rows, not 1`,
    ).toBe(1);
    const id = rows[0]?.id;
    expect(id, `DEFECTIVE PROBE: ${target.table}'s pick returned no id`).toBeDefined();
    return id as string;
  };

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      retentionScaffoldingSql([
        `DELETE FROM "lease" WHERE "id" = '${CONSTRUCTED_LEASE}'`,
        `DELETE FROM "reclassification_event" WHERE "id" = '${CONSTRUCTED_RECLASS}'`,
      ]),
    );
  };

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

    // The two constructed subjects are committed for the duration of this file, so the guard-on
    // cases have a real row to fail against. They are removed in `afterAll` — through
    // `retentionScaffoldingSql`, which is itself the demonstration that the guard is in force.
    for (const target of TARGETS) {
      if (target.construct === undefined) continue;
      for (const statement of target.construct) await prisma.$executeRawUnsafe(statement);
      const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "${target.table}"`,
      );
      expect(
        Number(row?.n ?? '0'),
        `${target.table}'s constructed subject is missing`,
      ).toBeGreaterThan(0);
    }
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE CENSUS, READ FROM pg_trigger
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the census — coverage is read from the live catalogue, not from the migration', () => {
    it('every corpus / ledger table has a ROW-level BEFORE DELETE guard, ENABLE ALWAYS', async () => {
      const rows = await prisma.$queryRawUnsafe<
        { table: string; tgname: string; tgenabled: string }[]
      >(
        `SELECT c.relname AS "table", t.tgname, t.tgenabled::text AS tgenabled
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
            AND (t.tgtype & 8) <> 0      -- DELETE
            AND (t.tgtype & 1) <> 0      -- FOR EACH ROW
            AND (t.tgtype & 2) <> 0`, // BEFORE
      );
      const covered = new Map(rows.map((r) => [r.table, r]));

      const uncovered = GOVERNED_TABLES.filter((t) => !covered.has(t));
      expect(
        uncovered,
        'a corpus / ledger table has NO row-level DELETE guard. This is exactly the census that ' +
          'found every one of them open; a table that loses its guard must never pass as healthy.',
      ).toEqual([]);

      const notAlways = GOVERNED_TABLES.map((t) => covered.get(t)).filter(
        (r) => r !== undefined && r.tgenabled !== 'A',
      );
      expect(
        notAlways.map((r) => `${r?.tgname}=${r?.tgenabled}`),
        "a DELETE guard is not 'ENABLE ALWAYS' — one plain `SET session_replication_role = " +
          "'replica'` skips it, which is the Sprint-1 finding that defeated gate G-1",
      ).toEqual([]);
    });

    it('every one of them has a TRUNCATE guard too — TRUNCATE fires no row triggers', async () => {
      const rows = await prisma.$queryRawUnsafe<{ table: string; tgenabled: string }[]>(
        `SELECT c.relname AS "table", t.tgenabled::text AS tgenabled
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public' AND (t.tgtype & 32) <> 0`,
      );
      const covered = new Map(rows.map((r) => [r.table, r.tgenabled]));
      expect(GOVERNED_TABLES.filter((t) => covered.get(t) !== 'A')).toEqual([]);
    });

    it('the scaffolding list in setup.ts covers every guard it might have to switch off', () => {
      // A test that lays a corpus row down has to be able to take it away. If a table gains a guard
      // and `RETENTION_SCAFFOLDING_GUARDS` is not updated, the next teardown fails with a refusal
      // that looks like a product bug — so the two lists are pinned together here.
      const wrapped = new Set(RETENTION_SCAFFOLDING_GUARDS.map((g) => g.table));
      expect(GOVERNED_TABLES.filter((t) => !wrapped.has(t))).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. GUARD ON — the DELETE is refused, and the refusal names the right table
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the hard DELETE is refused, by the table’s OWN guard', () => {
    for (const target of TARGETS) {
      it(`refuses DELETE on "${target.table}" — ${target.why}`, async () => {
        const id = await pickId(target);
        const error = await runProbe(
          guardProbeSql(
            `DELETE FROM "${target.table}" WHERE "id" = '${id}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        // ⚠ THE REFUSAL MUST NAME THIS TABLE. Migration 4 shipped a TRUNCATE test that passed
        // because the statement cascaded into `document`, whose guard fired — a property of the FK
        // graph, not a control. No peel runs here, so the row's own BEFORE DELETE trigger is the
        // first thing Postgres reaches.
        expect(
          error,
          `the refusal came from a different table, not from "${target.table}"`,
        ).toMatch(new RegExp(`(DELETE on "${target.table}" is refused)`));

        const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM "${target.table}" WHERE "id" = '${id}'`,
        );
        expect(row?.n, 'the row went anyway').toBe('1');
      });
    }

    it('refuses them all under session_replication_role = replica', async () => {
      // `ENABLE ALWAYS`, asserted behaviourally rather than by reading `tgenabled`. A guard created
      // with a plain `CREATE TRIGGER` is `tgenabled = 'O'` and one `SET` — not DDL, a plain `SET` —
      // skips it entirely. That is how gate G-1 fell during Sprint-1 review.
      for (const target of TARGETS) {
        const id = await pickId(target);
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              `DELETE FROM "${target.table}" WHERE "id" = '${id}'`,
            'insufficient_privilege',
          ),
        );
        expect(error, `"${target.table}" was skipped under the replica role`).toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
      }
    });

    it('refuses TRUNCATE CASCADE on each of them, on its own account', async () => {
      for (const target of TARGETS) {
        const error = await runProbe(
          guardProbeSql(`TRUNCATE "${target.table}" CASCADE`, 'insufficient_privilege'),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(
          error,
          `the TRUNCATE refusal came from a cascaded table, not "${target.table}"`,
        ).toMatch(new RegExp(`TRUNCATE on "${target.table}" is refused`));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. THE MUTATION, EXECUTED — the reproduction, re-run
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('MUTATION · with the guards off, every one of them is erased and audit_event does not move', async () => {
    // THE REPRODUCTION AS A TEST. Drop the guard from `qmulate_apply_e2_corpus_retention()` — or
    // create it without `ENABLE ALWAYS` — and the table below goes back to being erasable. Rather
    // than describe that, this runs it: inside a rolled-back transaction the retention guards are
    // disabled and each delete is driven to completion, with `audit_event` measured on both sides.
    //
    // Round 1 of this sprint shipped a test that asserted on source shape and passed at full
    // strength while the guard it described was bypassable. Nothing here reads source text.
    const ROLLBACK = '__qmulate_retention_mutation__';
    const observed: Record<string, { deleted: number; auditDelta: number }> = {};
    let unexpected: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        for (const { table, trigger } of RETENTION_SCAFFOLDING_GUARDS) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER ${trigger}`);
        }
        await tx.$executeRawUnsafe(
          `ALTER TABLE "distribution_line_item" DISABLE TRIGGER distribution_line_item_no_delete`,
        );

        for (const target of TARGETS) {
          const rows = await tx.$queryRawUnsafe<{ id: string }[]>(target.pick);
          const id = rows[0]?.id;
          if (id === undefined) {
            observed[target.table] = { deleted: -1, auditDelta: -1 }; // a defective probe, reported
            continue;
          }
          for (const statement of target.peel?.(id) ?? []) await tx.$executeRawUnsafe(statement);

          const [before] = await tx.$queryRawUnsafe<{ n: string }[]>(
            `SELECT count(*)::text AS n FROM "audit_event"`,
          );
          const deleted = await tx.$executeRawUnsafe(
            `DELETE FROM "${target.table}" WHERE "id" = '${id}'`,
          );
          const [after] = await tx.$queryRawUnsafe<{ n: string }[]>(
            `SELECT count(*)::text AS n FROM "audit_event"`,
          );
          observed[target.table] = {
            deleted,
            auditDelta: Number(after?.n ?? '0') - Number(before?.n ?? '0'),
          };
        }
        throw new Error(ROLLBACK);
      });
    } catch (error: unknown) {
      if (!errorText(error).includes(ROLLBACK)) unexpected = error;
    }

    expect(
      unexpected === undefined
        ? null
        : `${errorText(unexpected)} | observed: ${JSON.stringify(observed)}`,
      'the mutation could not be driven to completion, so it proves nothing about the guards',
    ).toBeNull();

    for (const target of TARGETS) {
      const result = observed[target.table];
      expect(result, `${target.table} was never attempted`).toBeDefined();
      expect(
        result?.deleted,
        `${target.table}: the DELETE matched ${String(result?.deleted)} rows, ` +
          `so this case is a false negative rather than a reproduction`,
      ).toBe(1);
      expect(result?.auditDelta, `${target.table}: the erasure produced an audit event`).toBe(0);
    }

    // Nothing was left behind, and no guard was left off.
    await assertGuardsInstalled();
    const [counts] = await prisma.$queryRawUnsafe<{ assets: string; runs: string }[]>(
      `SELECT (SELECT count(*) FROM "asset")::text AS assets,
              (SELECT count(*) FROM "distribution")::text AS runs`,
    );
    expect(Number(counts?.assets ?? '0')).toBeGreaterThan(0);
    expect(Number(counts?.runs ?? '0')).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. THE ATTACK AS IT WAS ACTUALLY DRIVEN — a scoped client’s own raw connection
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the SUBCONTRACTOR seat that found this', () => {
    it('cannot erase a corpus asset through $executeRawUnsafe on its own scoped client', async () => {
      // Prisma client extensions do NOT intercept `$queryRaw` / `$executeRaw*`, so this statement
      // reaches Postgres with every TypeScript control already behind it. That is the whole reason
      // the guard has to be a trigger.
      const client = db.createPrismaClient({
        actorId: SUBCONTRACTOR,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF],
        permissions: ['compliance:task:write', 'document:document:write'],
        requestId: 'round3-subcontractor-erasure',
      } as never) as unknown as PrismaLike;

      const id = await pickId(assetTarget);
      let thrown: unknown;
      try {
        await client.$executeRawUnsafe(`DELETE FROM "asset" WHERE "id" = '${id}'`);
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown, 'a SUBCONTRACTOR erased a corpus asset from raw SQL').toBeDefined();
      // ⚠ THE REFUSAL MOVED LAYERS IN ADR-0008 ROUND 6. Before: the statement reached Postgres and the
      // retention TRIGGER refused it. Now the runtime role holds no DELETE on this table at all, so the
      // ACL refuses first — `42501 permission denied for table …`. Both are accepted below: the trigger
      // message must stay matchable on a database where the privilege matrix has not been applied
      // (migration 10 degrades to a NOTICE when the roles are absent), and the PRIVILEGE claim is
      // asserted unconditionally on the restricted connection in
      // `authorization-plane-privilege.integration.test.ts`. The TRIGGER itself is still proven — by
      // the `runProbe()` cases in this same file, which run on the OWNER connection where the privilege
      // is present and the guard is therefore what raises.
      expect(errorText(thrown)).toMatch(
        /DELETE on "asset" is refused|permission denied for table asset/,
      );
      expect(errorText(thrown)).toMatch(
        /non-diminution-of-corpus|permission denied for table asset/,
      );

      const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "asset" WHERE "id" = '${id}'`,
      );
      expect(row?.n).toBe('1');
    });

    it('closes DELETE + re-INSERT — the move that defeated the Shart guard as C-03', async () => {
      // Migration 5 §2f gated `asset."titleDeedNumber"` behind a reserved matter and said in its own
      // header that DELETE + re-INSERT walked around it. This is that statement, refused.
      const id = await pickId(assetTarget);
      const [before] = await prisma.$queryRawUnsafe<{ titleDeedNumber: string }[]>(
        `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = '${id}'`,
      );

      const error = await runProbe(
        guardProbeSql(
          [
            `UPDATE "transaction" SET "assetId" = NULL WHERE "assetId" = '${id}'`,
            `; DELETE FROM "asset" WHERE "id" = '${id}'`,
            `; INSERT INTO "asset" SELECT * FROM jsonb_populate_record(NULL::"asset",`,
            `    '{"id":"${id}","titleDeedNumber":"FORGED-BY-REINSERT"}'::jsonb)`,
          ].join('\n'),
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "asset" is refused/);

      const [after] = await prisma.$queryRawUnsafe<{ titleDeedNumber: string }[]>(
        `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = '${id}'`,
      );
      expect(after?.titleDeedNumber, 'a corpus asset’s title deed was substituted').toBe(
        before?.titleDeedNumber,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 5. THE POSITIVE CONTROLS — the legal paths are still open
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the legal retirement paths still work', () => {
    it('soft delete is still permitted on every table that has deletedAt', async () => {
      // A guard that leaves no way to retire a row is an outage, not a control. Rolled back, so the
      // seeded fixture is unchanged — `seed.integration.test.ts` counts these rows absolutely.
      //
      // ⚠ FOUR EXCEPTIONS NOW, ALL EXCLUDED BY NAME RATHER THAN BY A `catch`, and each with its own
      // inverted case below. `asset` — since migration 14 a soft-retirement of a CORPUS PARCEL is
      // gated as a reserved matter (AV-4). `trusteeship_deed` — since migration 17 a recorded Nazir
      // appointment is WRITE-ONCE for every seat, `deletedAt` included, on the product owner's ruling
      // (memo Q10: *"the trusteeship deed can only be editted by a court judge"*). `transaction` —
      // since migration 25 retiring a COMMITTED LEDGER ROW is a reserved matter in both directions
      // and on the birth, on the owner's ruling of 2026-08-20 (memo "S7 · AV7-F4", AV7-F4).
      // `distribution` — since migration 27, and ⚠ THIS ONE IS DIFFERENT IN KIND: the PATTERN is
      // ruled (Q8 + AV7-F4) but the SUBJECT is engineering's extension of it, and the owner has NOT
      // been asked whether retiring a PAID RUN is a reserved matter. It closes an EVIDENCE gap
      // rather than a money gap — migration 26 left `deletedAt` out of
      // `distribution_paid_periods_disjoint` on purpose, so period disjointness already survives an
      // unapproved retirement; what it stops is a paid run, line items intact and halalas still
      // owed, vanishing from `get`/`list`/`lines`, which all filter `deletedAt: null`.
      // Every other table here retires freely, and that is what this loop proves.
      for (const target of TARGETS) {
        if (
          target.table === 'distribution_line_item' ||
          target.table === 'reclassification_event'
        ) {
          continue; // no `deletedAt` column — covered by the two cases below
        }
        if (target.table === 'asset') continue; // gated since migration 14 — asserted below
        if (target.table === 'trusteeship_deed') continue; // sealed since migration 17 — below
        if (target.table === 'transaction') continue; // gated since migration 25 — below
        if (target.table === 'distribution') continue; // gated since migration 27 — below
        const id = await pickId(target);
        const error = await runProbe(
          `DO $qm_soft$
           BEGIN
             UPDATE "${target.table}" SET "deletedAt" = now() WHERE "id" = '${id}';
             RAISE EXCEPTION 'QMULATE_SOFT_DELETE_OK' USING ERRCODE = 'P0001';
           END
           $qm_soft$;`,
        );
        expect(error, `soft delete was refused on "${target.table}"`).toContain(
          'QMULATE_SOFT_DELETE_OK',
        );
      }
    });

    it('but soft-retiring a CORPUS PARCEL is a RESERVED MATTER, not a free retirement', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ INVERTED, NOT DELETED (S4/E3 round 2, AV-4). `asset` used to run through the loop above
      // and PASS — "soft delete is still permitted" was true of a corpus parcel, and that was the
      // defect. MEASURED as `qmulate_app` with no approval in session, on a pristine seed:
      //
      //   BEFORE  COMMITS  UPDATE "asset" SET "deletedAt" = now() WHERE "id" = 'asset-001'
      //   AFTER   REFUSED  42501 … 'changing "deletedAt" … is a RESERVED MATTER'
      //
      // `asset_no_delete` (this file's own subject) refuses the HARD delete and names `deletedAt` as
      // the only legal retirement — and that path had nothing on it, which `scoping.ts` USED TO
      // record from the other side: "`deletedAt` is deliberately ungoverned, so a SOFT DELETE of a
      // corpus asset … is still membership-only". ⚠ THAT SENTENCE IS NOW CORRECTED IN `scoping.ts`
      // (round 4, AV4-03) — it stayed in shipped source for two rounds after this very test made it
      // false, and the corrected entry says so rather than quietly replacing it. A retired parcel
      // leaves every register the Nazir, the classification bands and the Authority report read
      // from, so in substance it is a disposal.
      //
      // ⚠ TODO(surface) — SCOPE, ENGINEERING'S FAIL-SAFE READING, NOT THE OWNER'S RULING. Whether
      // EVERY retirement of a corpus parcel is reserved — as opposed to only those that are disposals
      // in substance — is the product owner's call. Gating both is the fail-safe direction: it
      // refuses a route and disposes of nothing, and the approval it asks for is the one the
      // expropriation already needed. Do not remove this marker to make the test read cleaner.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const id = await pickId(assetTarget);
      const error = await runProbe(
        guardProbeSql(
          `UPDATE "asset" SET "deletedAt" = now() WHERE "id" = '${id}'`,
          'insufficient_privilege',
        ),
      );
      expect(error, 'a corpus parcel was soft-retired with no reserved matter').toContain(
        `${PROBE_BLOCKED}[42501]`,
      );
      expect(error).toMatch(/RESERVED MATTER/);
      expect(error).toMatch(/asset:.*:deletedAt/);
      // The refusal has to be actionable, and it has to admit what it is not sure about.
      expect(error).toMatch(/withReservedMatter/);
      expect(error).toMatch(/TODO\(surface\)/);

      const [row] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
        `SELECT "deletedAt" FROM "asset" WHERE "id" = '${id}'`,
      );
      expect(row?.deletedAt ?? null, 'the probe left a corpus parcel retired').toBeNull();
    });

    it('and a recorded NAZIR APPOINTMENT cannot be retired at all (memo Q10)', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ INVERTED, NOT DELETED — the `asset` case above is the precedent. `trusteeship_deed` used to
      // run through the loop and PASS: "soft delete is still permitted" was true of the Nazir's own
      // appointment. MEASURED as `qmulate_app` with no approval, rolled back:
      //
      //   BEFORE  ⚠ COMMITS  UPDATE "trusteeship_deed" SET "deletedAt" = now()
      //   AFTER     REFUSED  42501 … 'a recorded Nazir appointment is WRITE-ONCE FOR EVERY SEAT'
      //
      // The product owner's ruling (S4 owner-decision memo Q10, 2026-08-17): *"the trusteeship deed
      // can only be editted by a court judge."* ⚠ Rendered by engineering — and FLAGGED as a
      // rendering, because it converts "edit" into "supersede" — as: no system seat may edit a
      // recorded appointment, and a court-ordered change enters as a NEW superseding record carrying
      // the court instrument. `deletedAt` is not carved out of that: retiring the appointment is a
      // change to the appointment.
      //
      // ⚠ SO THIS TABLE NOW HAS **NO** RETIREMENT PATH AT ALL — the hard DELETE is refused by this
      // file's own `trusteeship_deed_no_delete` and the soft one by migration 17. That is the
      // fail-safe direction of the ruling and it is deliberately loud rather than quietly softened:
      // the remedy the refusal names (a superseding record) is not reachable in this schema yet
      // (`waqfId` is UNIQUE, and no column links a superseding row to the one it supersedes), which
      // migration 17's header and refusal both state as owed to E4.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const target = TARGETS.find((t) => t.table === 'trusteeship_deed') as Target;
      const id = await pickId(target);
      const error = await runProbe(
        guardProbeSql(
          `UPDATE "trusteeship_deed" SET "deletedAt" = now() WHERE "id" = '${id}'`,
          'insufficient_privilege',
        ),
      );
      expect(
        error,
        'a recorded Nazir appointment was retired with nothing to authorise it',
      ).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/WRITE-ONCE FOR EVERY SEAT/);
      expect(error).toMatch(/deletedAt/);
      // The remedy, and the admission that it is not reachable yet — both must survive here, because
      // this is the file a reader lands in when they ask "how do I retire a deed?".
      expect(error).toMatch(/SUPERSEDING RECORD/i);
      expect(error).toMatch(/NOT YET REACHABLE IN THIS SCHEMA/);

      const [row] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
        `SELECT "deletedAt" FROM "trusteeship_deed" WHERE "id" = '${id}'`,
      );
      expect(row?.deletedAt ?? null, 'the probe left an appointment retired').toBeNull();
    });

    it('and retiring a DISTRIBUTION RUN is gated too — CONFIRMED by the owner (migrations 27+28)', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ THIS CASE USED TO CARRY A `TODO(surface)` AND NO LONGER DOES — AND THE SEQUENCE IS THE
      // POINT, so it is recorded rather than deleted.
      //
      // `asset` (migration 14) is BR-306/AV-4. `trusteeship_deed` (migration 17) is the owner's
      // memo Q10. `transaction` (migration 25) is the owner's memo AV7-F4, uniform. `distribution`
      // arrived DIFFERENTLY: the PATTERN was ruled twice (Q8 for `waqf."deletedAt"`, AV7-F4 for any
      // committed receipt) but the SUBJECT was new, so migration 27 shipped the gate FLAGGED as
      // engineering's reading — in its header, in its refusal message, in the census and here —
      // rather than either withholding a control or dressing a judgement as a ruling.
      //
      // **The owner then answered: "confirmed."** (S4 memo "S7 · Migration 27", 2026-08-20,
      // recorded RECORD-ONLY in its own commit first.) So the flag came off — and it came off by
      // MIGRATION 28 replacing the guard body, because 27 was already applied and Prisma checksums
      // applied migrations, so the false sentence could not be edited out in place.
      // ⚠ THAT SEQUENCE — flag, ask, confirm, then unflag CITING the answer — is what is worth
      // keeping. A gate quietly unflagged, or never flagged at all, would read identically today
      // and would have taught nobody anything.
      //
      // ⚠ AND IT CLOSES AN **EVIDENCE** GAP, NOT A MONEY GAP — stated because the opposite is the
      // easy assumption. Migration 26 deliberately left `deletedAt` OUT of
      // `distribution_paid_periods_disjoint`, so an unapproved retirement never freed a paid period
      // to be paid twice. MEASURED as `qmulate_app`, no approval, before migration 27:
      //
      //   BEFORE  ⚠ COMMITS  UPDATE "distribution" SET "deletedAt" = now()  → {"rows":1}
      //                      ⇒ an EXECUTED run — `distribution_line_item` rows intact, those halalas
      //                        still owed to named beneficiaries — disappears from `get`, `list` and
      //                        `lines`, all of which filter `deletedAt: null`. The payment does not
      //                        vanish; only the evidence of it does.
      //   AFTER     REFUSED  42501 … 'RETIRING A DISTRIBUTION RUN … is a RESERVED MATTER'
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const [run] = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT "id", "status"::text AS status FROM "distribution"
          WHERE "deletedAt" IS NULL ORDER BY "id" LIMIT 1`,
      );
      expect(run, 'no live distribution row to probe — the fixture is not seeded').toBeDefined();
      const runId = run?.id ?? '';

      const error = await runProbe(
        guardProbeSql(
          `UPDATE "distribution" SET "deletedAt" = now() WHERE "id" = '${runId}'`,
          'insufficient_privilege',
        ),
      );
      expect(error, 'a distribution run was retired with no reserved matter').toContain(
        `${PROBE_BLOCKED}[42501]`,
      );
      expect(error).toMatch(/RETIRING A DISTRIBUTION RUN on distribution/);
      expect(error).toMatch(/is a RESERVED MATTER/);
      expect(error).toMatch(new RegExp(`distribution:${runId}:deletedAt`));
      expect(error).toMatch(/withReservedMatter/);
      // ⚠ THESE ASSERTIONS ARE INVERTED RATHER THAN DELETED. They used to require the message to
      // say `ENGINEERING'S EXTENSION …` and `has NOT been put to the owner` — correct while that
      // was true, and FALSE the moment the owner answered. A guard asserting something false in
      // the text handed to the caller it just refused is worse than a stale comment: it is
      // addressed to someone acting on it. So the message now CITES the ruling, and the OLD
      // wording is asserted ABSENT — because the failure mode from here is a revert that silently
      // re-flags a control the owner has ratified.
      expect(error).toMatch(/verbatim: "confirmed\."/);
      expect(error).toMatch(/is a reserved matter by his ruling/);
      expect(error).not.toMatch(/has NOT been put to the owner/);
      expect(error).not.toMatch(/NOT A RULING ABOUT DISTRIBUTION RUNS/);
      // …and it must not let a reader think an approval reopens the period.
      expect(error).toMatch(/a retired run is not an unpaid one/);
      // The status-specific SENTENCE. `dist-001` is the seeded EXECUTED run.
      if (run?.status === 'EXECUTED') {
        expect(error).toMatch(/THIS RUN HAS PAID/);
      } else {
        expect(error).toMatch(/has paid nothing, which is the weakest case for a gate/);
      }
      // The row is untouched — `guardProbeSql` refused before anything was written.
      const [after] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
        `SELECT "deletedAt" FROM "distribution" WHERE "id" = '${runId}'`,
      );
      expect(after?.deletedAt ?? null).toBeNull();
    });

    it('and retiring a COMMITTED LEDGER ROW is a RESERVED MATTER, income or capital alike (AV7-F4)', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ INVERTED, NOT DELETED — the `asset` and `trusteeship_deed` cases above are the precedent.
      // `transaction` ran through the loop and PASSED, i.e. *"soft delete is still permitted"* was
      // true of the ledger the distribution waterfall is computed from, and THAT WAS THE DEFECT.
      // MEASURED as `qmulate_app`, no approval in session, on this cluster before migration 25:
      //
      //   BEFORE  ⚠ COMMITS  UPDATE "transaction" SET "deletedAt" = now()   → {"rows":1}
      //                      ⇒ the run's capitalReceiptsSar went 4,200,000.00 -> 0.00,
      //                        CAPITAL_RECEIPTS_EXCLUDED vanished from the flags,
      //                        excludedCapitalReceipts emptied, and NO diagnostic and NO trace step
      //                        named the row — while the row still read CAPITAL / 4200000 /
      //                        ISTIBDAL_PROCEEDS. The corpus went INVISIBLE, not visibly excluded.
      //   AFTER     REFUSED  42501 … 'RETIRING A COMMITTED LEDGER ROW … is a RESERVED MATTER'
      //
      // ⚠ THE RULING IS THE OWNER'S AND IT IS UNIFORM, so this case carries NO `TODO(surface)` —
      // unlike the `asset` case above, whose scope question is still open. Product owner, 2026-08-20
      // (S4 owner-decision memo, "S7 · AV7-F4"), option (a): soft-deleting ANY committed receipt,
      // income or capital, is reserved-matter-gated, on Q-E5-1's logic that anything changing what is
      // distributable gets the gate. **The income/capital difference is in the refusal's stated
      // REASON, never in its strictness** — which is why both arms are asserted below rather than
      // just the corpus one: a later change that made capital stricter than income would be a
      // deviation from the ruling, and only a two-arm test can see it.
      //
      // ⚠ AND THE RETIREMENT IS NOT THE CORRECTION PATH. `finance.receiptClass.requestCorrection` /
      // `executeCorrection` (owner ruling Q-E5-1(b)) adds a mirroring reversal plus a re-entry and
      // leaves both rows VISIBLE; `transaction_no_delete` refuses the hard delete. So the ledger's
      // legal retirement path is this gate, and its legal CORRECTION path is a superseding record.
      // The full behavioural suite — the birth arm, the clear direction, the near-miss where a
      // genuine approval names another subject, and the positive control where a real approval lets
      // the retirement through — is `packages/api/test/av7-corpus-wall.integration.test.ts` A-6.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const target = TARGETS.find((t) => t.table === 'transaction') as Target;
      const id = await pickId(target);
      const [subject] = await prisma.$queryRawUnsafe<
        { type: string; receiptClass: string | null }[]
      >(`SELECT "type", "receiptClass" FROM "transaction" WHERE "id" = '${id}'`);

      const error = await runProbe(
        guardProbeSql(
          `UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = '${id}'`,
          'insufficient_privilege',
        ),
      );
      expect(error, 'a committed ledger row was retired with no reserved matter').toContain(
        `${PROBE_BLOCKED}[42501]`,
      );
      expect(error).toMatch(/RETIRING A COMMITTED LEDGER ROW on transaction/);
      expect(error).toMatch(/is a RESERVED MATTER/);
      expect(error).toMatch(new RegExp(`transaction:${id}:deletedAt`));
      // Actionable, and it must name the CORRECTION path so a reader who wanted that is redirected
      // rather than left hunting for a stronger credential.
      expect(error).toMatch(/withReservedMatter/);
      expect(error).toMatch(/superseding record/i);
      // The class-specific SENTENCE — whichever row `pickId` happened to choose.
      if (subject?.type === 'REVENUE' && subject.receiptClass === 'CAPITAL') {
        expect(error).toMatch(/CORPUS THE RUN CANNOT SEE/);
      } else if (subject?.type === 'REVENUE') {
        expect(error).toMatch(/SHRINKS the distributable pool/);
      } else {
        expect(error).toMatch(/waterfall's operating leg/);
      }
      // ⚠ AND THE OTHER CLASS, EXPLICITLY, so "uniform" is measured rather than asserted in prose:
      // a CAPITAL row and an INCOME row are BOTH refused, and the sentences differ.
      const capitalError = await runProbe(
        guardProbeSql(
          `UPDATE "transaction" SET "deletedAt" = now()
             WHERE "id" = (SELECT "id" FROM "transaction"
                            WHERE "type" = 'REVENUE' AND "receiptClass" = 'CAPITAL'
                            ORDER BY "id" LIMIT 1)`,
          'insufficient_privilege',
        ),
      );
      expect(capitalError).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(capitalError).toMatch(/a CAPITAL receipt \(asl \/ أصل/);
      const incomeError = await runProbe(
        guardProbeSql(
          `UPDATE "transaction" SET "deletedAt" = now()
             WHERE "id" = (SELECT "id" FROM "transaction"
                            WHERE "type" = 'REVENUE' AND "receiptClass" = 'INCOME'
                            ORDER BY "id" LIMIT 1)`,
          'insufficient_privilege',
        ),
      );
      expect(incomeError).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(incomeError).toMatch(/an INCOME receipt \(ghallah \/ غلة\)/);
      expect(incomeError).toMatch(/THE SAME STRICTNESS AS THE CAPITAL ARM/);

      const [row] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
        `SELECT "deletedAt" FROM "transaction" WHERE "id" = '${id}'`,
      );
      expect(row?.deletedAt ?? null, 'the probe left a ledger row retired').toBeNull();
    });

    it('a DRAFT run’s line items are still deletable — E5 has to be able to re-compute', async () => {
      // The conditional half of `distribution_line_item_no_delete`. Built and torn down inside ONE
      // rolled-back transaction: `seed.integration.test.ts` counts `distribution` rows absolutely,
      // and `distribution_authority` is DEFERRED so it never fires on a transaction that aborts.
      const ROLLBACK = '__qmulate_draft_lines__';
      const run = 'dist-ret-9001';
      const line = 'dli-ret-9001';
      let deleted: number | undefined;
      let refusedWhenApproved: string | null = 'not attempted';

      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO "distribution"
               ("id","waqfId","periodStart","periodStartHijri","periodEnd","periodEndHijri",
                "grossRevenueSar","reserveSar","operatingSar","nazirFeeSar","distributableSar",
                "status","approvalRequestId","computationTrace","createdAt","updatedAt")
             VALUES ('${run}','${WAQF}','2026-01-01','1447-07-12','2026-12-31','1448-07-05',
                     100.00, 10.00, 10.00, 10.00, 70.00,
                     'DRAFT'::"DistributionStatus", NULL,
                     '{"fixture":"e2 round-3 test row (بيانات وهمية)"}'::jsonb, now(), now())`,
          );
          await tx.$executeRawUnsafe(
            // ⚠ `waqfId` IS E5's (migration 19 §2) AND IS NOT OPTIONAL SCAFFOLDING. The line item
            // gained an endowment column so a run of one endowment cannot pay another's
            // beneficiary; it is NOT NULL and tied by composite FK to BOTH the run and the
            // beneficiary. This scaffolding predated it and failed 23502 on the first run of that
            // migration — correctly. It must be the RUN's endowment, which is also what the
            // beneficiary lookup below filters on, so the row stays coherent.
            `INSERT INTO "distribution_line_item"
               ("id","waqfId","distributionId","beneficiaryId","sharePercent","amountSar","status","createdAt")
             SELECT '${line}','${WAQF}','${run}', b."id", 100.0000, 70.00,
                    'PAID'::"DistributionLineStatus", now()
               FROM "beneficiary" b WHERE b."waqfId" = '${WAQF}' ORDER BY b."id" LIMIT 1`,
          );

          // DRAFT: permitted.
          deleted = await tx.$executeRawUnsafe(
            `DELETE FROM "distribution_line_item" WHERE "id" = '${line}'`,
          );

          // …and the same line, once the run has left computation: refused. `PENDING_APPROVAL` is
          // where the line stops being working state and starts being the artifact under review.
          await tx.$executeRawUnsafe(
            // ⚠ `waqfId` IS E5's (migration 19 §2) AND IS NOT OPTIONAL SCAFFOLDING. The line item
            // gained an endowment column so a run of one endowment cannot pay another's
            // beneficiary; it is NOT NULL and tied by composite FK to BOTH the run and the
            // beneficiary. This scaffolding predated it and failed 23502 on the first run of that
            // migration — correctly. It must be the RUN's endowment, which is also what the
            // beneficiary lookup below filters on, so the row stays coherent.
            `INSERT INTO "distribution_line_item"
               ("id","waqfId","distributionId","beneficiaryId","sharePercent","amountSar","status","createdAt")
             SELECT '${line}','${WAQF}','${run}', b."id", 100.0000, 70.00,
                    'PAID'::"DistributionLineStatus", now()
               FROM "beneficiary" b WHERE b."waqfId" = '${WAQF}' ORDER BY b."id" LIMIT 1`,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "distribution" SET "status" = 'PENDING_APPROVAL' WHERE "id" = '${run}'`,
          );
          try {
            await tx.$executeRawUnsafe(
              `DELETE FROM "distribution_line_item" WHERE "id" = '${line}'`,
            );
            refusedWhenApproved = null;
          } catch (error: unknown) {
            refusedWhenApproved = errorText(error);
            throw new Error(ROLLBACK); // the failed statement poisoned the transaction
          }
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) {
          throw new Error(
            `the DRAFT-lines positive control could not be set up: ${errorText(error).slice(0, 600)}`,
          );
        }
      }

      expect(deleted, 'a DRAFT run’s line item could not be deleted — E5 cannot re-compute').toBe(
        1,
      );
      expect(
        refusedWhenApproved,
        'a line item of a PENDING_APPROVAL run was deleted: the artifact under review is editable',
      ).not.toBeNull();
      expect(refusedWhenApproved).toMatch(/is refused \(row .*, run .* is PENDING_APPROVAL\)/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 6. WHAT IS STILL OPEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.todo(
    'SURFACED, NOT RESOLVED (product scope) — a row created IN ERROR now has no purge path in ' +
      'Phase 1 on any of these tables, the same consequence migration 4 recorded for `waqf`. And ' +
      '`beneficiary` carries the UBO / beneficial-owner dataset, so a PDPL erasure request will ' +
      'meet this guard: retention-vs-erasure is a real conflict that belongs in the PDPL compliance ' +
      'register (CLAUDE.md lists that register as a load-bearing gap), not in a DELETE statement. ' +
      'Confirm before real client data.',
  );

  it.todo(
    'NOT CLOSED, AND NOT IN THIS LAYER — the CAUSE of the finding. A SUBCONTRACTOR seat holding only ' +
      'compliance/document write verbs reaches `asset` writes at all; it is stopped by a row guard, ' +
      'not by the permission ladder. That mapping is the force filter in ' +
      'packages/database/src/extensions/scoping.ts, which migration 6 does not own and must not be ' +
      'assumed fixed. Migration 5 §2f reported the same thing for `asset."titleDeedNumber"`.',
  );

  it.todo(
    'STILL UNGATED ON `asset` — only `titleDeedNumber` is reserved-matter-bound (migration 5 §2f). ' +
      '`addressAr`, `valuationSar`, `type` and `status` are identity-ish or valuation-bearing on the ' +
      'corpus and are freely writable by anyone who can write the row. Deciding which of them are ' +
      'reserved matters is a scope call for before E4 ships the asset module.',
  );
});
