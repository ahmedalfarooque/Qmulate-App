/**
 * R-1 · THE RETENTION REMAINDER — configuration, identity and compliance evidence are never
 * hard-deleted.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS REPRODUCED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Migration 6 closed hard `DELETE` on eleven corpus/ledger tables and named, in its own header, what
 * it was leaving open. A census read from the LIVE `pg_trigger` catalogue over EVERY table in `public`
 * — freshly migrated and seeded, 2026-07-29 — measured the remainder. Each DELETE below was a real
 * erasure inside a transaction that was then rolled back, with `audit_event` counted on both sides:
 *
 *   table                   pg_trigger  DELETE (plain)       DELETE (replica role)  TRUNCATE   audit
 *   setting                 NONE        **PERMITTED**        **PERMITTED**          PERMITTED  131->131
 *   client                  NONE        FK-accident 23503    **PERMITTED**          FK-acc.    131->131
 *   waqif                   NONE        FK-accident 23503    **PERMITTED**          FK-acc.    131->131
 *   compliance_obligation   NONE        FK-accident 23503    **PERMITTED**          FK-acc.    131->131
 *   compliance_task         NONE        **PERMITTED**        **PERMITTED**          PERMITTED  131->131
 *   government_filing       NONE        **PERMITTED**        **PERMITTED**          PERMITTED  131->131
 *   zakat_filing            NONE        **PERMITTED**†       **PERMITTED**†         PERMITTED  131->131
 *   deadline                NONE        **PERMITTED**†       **PERMITTED**†         PERMITTED  131->131
 *   legal_case              NONE        **PERMITTED**†       **PERMITTED**†         PERMITTED  131->131
 *
 * ⚠ THREE FALSE NEGATIVES HAD TO BE DESIGNED OUT, and they are the reason to read this header:
 *
 *   † THE FIXTURE SHIPS ZERO `zakat_filing`, `deadline` AND `legal_case` ROWS. A `DELETE` against an
 *     empty table erases nothing and reads as a working control. Every case here that touches one of
 *     those three CONSTRUCTS its subject first, and asserts the delete matched exactly one row.
 *
 *   ‡ `FK-accident 23503` IS NOT A CONTROL. `client`, `waqif` and `compliance_obligation` refused a
 *     plain `DELETE` before migration 8 — but only because a child row happened to exist and the FK is
 *     RESTRICT. `SET session_replication_role = 'replica'` skips the INTERNAL RI triggers too, so one
 *     statement turned all three into **PERMITTED**, leaving the children ORPHANED. Referential
 *     integrity that evaporates under a session GUC is a property of the FK graph.
 *
 *   § A REFUSAL THAT DOES NOT NAME THE TABLE PROVES NOTHING ABOUT THAT TABLE. Migration 4 shipped a
 *     TRUNCATE test that passed on a cascade into `document`; before migration 8,
 *     `TRUNCATE "client" CASCADE` was refused with the message `TRUNCATE on "waqf" is refused`. Every
 *     assertion here matches the TARGET table's name.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THIS FILE IS STRUCTURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   1. THE CENSUS, from `pg_trigger` — plus an ALLOW-LIST over every table in `public`, so a new
 *      table arriving with no DELETE coverage and no recorded verdict turns this red. That is the
 *      structural fix for the myopia that let migration 4 conclude `waqf` was the only gap: it had
 *      censused only the tables that were already guarded.
 *   2. PER TABLE, GUARD ON: refused, refused under the replica role, and the refusal names the table.
 *   3. THE MUTATION, EXECUTED: guards off inside a rolled-back transaction, the erasure driven to
 *      completion, `audit_event` measured. The reproduction above, re-run every CI run.
 *   4. POSITIVE CONTROLS: soft delete still works on all nine; the three tables with a documented
 *      NO-GUARD verdict are still deletable, so the verdict is visible rather than assumed.
 *
 * ⚠ THE RESIDUAL IS UNCHANGED AND UNNARROWED. Step 3 disables triggers, which needs table OWNERSHIP —
 * and on Railway the runtime connects AS THE OWNER. Every assertion here is about a caller who has NOT
 * disabled the guards. Privilege separation is deferred to E12 by ADR-0008, the insider with
 * application-database credentials is INSIDE the threat model, and the hard gate stands: no real client
 * data before E12.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  RETENTION_REMAINDER_SCAFFOLDING_GUARDS,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  guardProbeSql,
  hasDatabase,
  retentionRemainderScaffoldingSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('R-1 — configuration, identity and compliance evidence are never hard-deleted');

const WAQF = 'waqf-001';
/**
 * The seat the round-2/3 re-attacks used: a FINANCE-tier subject holding compliance/document write
 * verbs and nothing that entitles it to erase a regulatory figure or a founder record.
 */
const LOW_PRIVILEGE_SEAT = 'user-accountant-001';

interface RawTx {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}
interface PrismaLike extends RawTx {
  $transaction: <T>(fn: (tx: RawTx) => Promise<T>) => Promise<T>;
}

interface Target {
  readonly table: string;
  /** Why this row is configuration, identity or compliance evidence. */
  readonly why: string;
  /** SQL returning exactly one `id`. */
  readonly pick: string;
  /** For the three tables the fixture leaves EMPTY — see † in the header. */
  readonly construct?: readonly string[];
}

const MADE_ZAKAT = 'zakat-9001';
const MADE_DEADLINE = 'deadline-9001';
const MADE_LEGAL_CASE = 'legalcase-9001';

/**
 * ⚠ NO `peel` HELPERS HERE, AND THAT IS THE INTERESTING PART.
 *
 * `corpus-retention.integration.test.ts` removes FK children before each probe so a 23503 cannot
 * masquerade as the guard. That is unnecessary — and weaker — for this set, because FK constraints are
 * implemented as **AFTER ROW** triggers while a retention guard is a **BEFORE DELETE ROW** trigger, so
 * the guard is reached first and the refusal genuinely names the target table. Measured on this
 * database: a plain `DELETE FROM "client"` with three `waqif` children alive raises
 * `DELETE on "client" is refused`, not 23503.
 *
 * Where the FK does have to be taken out of the picture — the negative control that shows the guard is
 * doing the work, and the mutation that shows what happens without it — the file uses
 * `SET LOCAL session_replication_role = 'replica'`, which skips the INTERNAL RI triggers while leaving
 * every `ENABLE ALWAYS` trigger firing. That is both simpler than peeling and a stronger control: it
 * is the exact statement that turned `client`, `waqif` and `compliance_obligation` from
 * "refused, 23503" into "**PERMITTED**, children orphaned" before migration 8.
 */
const TARGETS: readonly Target[] = [
  {
    table: 'setting',
    why: 'EVERY regulatory figure in the system, all of them ⚠ unverified (Binding rule 3)',
    // A per-waqf OVERRIDE, not a global row: deleting the override is the sharp case, because the
    // resolver then falls back to the global value with no error and no event.
    pick: `SELECT "id" FROM "setting" WHERE "waqfId" IS NOT NULL ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'compliance_task',
    why: 'whether a statutory duty was discharged, and when',
    pick: `SELECT "id" FROM "compliance_task" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'compliance_obligation',
    why: 'the obligation CATALOGUE — what applied to which classification',
    pick: `SELECT "id" FROM "compliance_obligation" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'government_filing',
    why: 'the evidence that a filing was made to the Authority — or that it was not (BR-603)',
    pick: `SELECT "id" FROM "government_filing" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'zakat_filing',
    why: 'BR-509 — fiscal year, status and amount',
    pick: `SELECT '${MADE_ZAKAT}'::text AS "id"`,
    construct: [
      `INSERT INTO "zakat_filing" ("id","waqfId","fiscalYear","status","amountSar","createdAt","updatedAt")
         VALUES ('${MADE_ZAKAT}','${WAQF}','2099','draft', 1.00, now(), now())`,
    ],
  },
  {
    table: 'deadline',
    why: 'satisfiedAt / escalatedAt, and the businessDaysUsed SNAPSHOT that exists so history is not rewritten',
    pick: `SELECT '${MADE_DEADLINE}'::text AS "id"`,
    construct: [
      // `windowSnapshot` is demanded by migration 38's provenance trigger — a probe row is an
      // engine-era row like any other, and the demand catching THIS file's construct on S9-2's
      // first counted run is that trigger doing its job.
      `INSERT INTO "deadline" ("id","waqfId","ruleKey","anchorDate","anchorDateHijri","dueDate",
           "dueDateHijri","businessDaysUsed","windowSnapshot","createdAt","updatedAt")
         VALUES ('${MADE_DEADLINE}','${WAQF}','REGISTER_30BD','2099-01-01'::timestamp,'1521-01-01',
                 '2099-02-15'::timestamp,'1521-02-15', 30,
                 '{"settingKey":"deadline.REGISTER_30BD.businessDays","basis":"business_days","amount":30,"roll":"following","unverified":true}'::jsonb,
                 now(), now())`,
    ],
  },
  {
    table: 'legal_case',
    why: 'BR-612 — a judicial matter that is frequently ABOUT the corpus',
    pick: `SELECT '${MADE_LEGAL_CASE}'::text AS "id"`,
    construct: [
      `INSERT INTO "legal_case" ("id","waqfId","subjectAr","forum","status","createdAt","updatedAt")
         VALUES ('${MADE_LEGAL_CASE}','${WAQF}','نزاع وهمي (بيانات وهمية)','General Court','open',
                 now(), now())`,
    ],
  },
  {
    table: 'waqif',
    why: 'the FOUNDER (واقف) — the author of an immutable Shart al-Waqif who was himself erasable',
    pick: `SELECT "id" FROM "waqif" ORDER BY "id" LIMIT 1`,
  },
  {
    table: 'client',
    why: 'the engagement grouping, parent of the client-tier `membership` roles',
    pick: `SELECT "id" FROM "client" ORDER BY "id" LIMIT 1`,
  },
];

/** Every table migration 8 governs. */
const GOVERNED_TABLES = TARGETS.map((t) => t.table);

/**
 * Tables in `public` with NO `BEFORE DELETE` coverage, and the recorded reason.
 *
 * ⚠ THIS LIST IS THE POINT OF THE ALLOW-LIST TEST. Migration 4 concluded `waqf` was "the only guarded
 * table with no DELETE coverage" — true, and useless, because the census had been run over the tables
 * that were already guarded. Censusing `public` and requiring a VERDICT for every uncovered table is
 * what stops that recurring: a table added to the schema without one turns this red, which forces the
 * question to be asked rather than noticed two migrations later.
 */
const DELETE_DELIBERATELY_UNGUARDED: Readonly<Record<string, string>> = {
  // migration 8 §4 — weighed, with a reason, and NOT guarded
  budget:
    'an ESTIMATE, not a record of an act; what happened lives in `transaction`/`distribution`, both ' +
    'refused outright by migration 6. Also the probe table `domain-write-gate` needs for the ' +
    'ADR-0008 child-create residual, precisely because it is unguarded.',
  vendor:
    'global reference data, no act / amount / endowment. The schema already decided it is ' +
    'disposable: `maintenance_ticket."vendorId"` is a plain column, not an FK, so "a ticket must ' +
    'survive vendor de-listing".',
  maintenance_ticket:
    'no amount column at all — the ṣiyāna money is a `transaction` row (guarded since migration 6) ' +
    'and the paperwork is a `document` (guarded since migration 1). Operational work-tracking.',
  // the identity plane — reported by migration 8's header, not its subject
  user: 'better-auth owns it; the identity plane is not this migration’s subject. REPORTED, not closed.',
  account: 'better-auth credentials; deliberately excluded from the audited models. REPORTED.',
  session: 'ephemeral by design — a session that cannot be deleted is a security bug.',
  two_factor: 'better-auth TOTP secret material; lifecycle belongs to better-auth.',
  verification: 'better-auth short-lived tokens; expiry-driven deletion is the intended lifecycle.',
  membership:
    'client-tier roles. An authorization-plane table with no DELETE coverage — REPORTED as an open ' +
    'finding rather than guarded here: `packages/api/test/setup.ts` tears its own memberships down, ' +
    'and the authorization plane is round 3’s subject, not this file’s.',
  // infrastructure and reference data
  holiday_calendar:
    'the KSA business-day calendar — reference data, regenerable, and a wrong holiday must be ' +
    'removable or the deadline engine computes wrong dates forever.',
  notification: 'delivery artifacts, not evidence of an act.',
  _prisma_migrations: 'Prisma’s own bookkeeping table.',
};

describe.skipIf(!hasDatabase)('R-1 · the retention remainder at the database layer', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

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
      retentionRemainderScaffoldingSql([
        `DELETE FROM "zakat_filing" WHERE "id" = '${MADE_ZAKAT}'`,
        `DELETE FROM "deadline" WHERE "id" = '${MADE_DEADLINE}'`,
        `DELETE FROM "legal_case" WHERE "id" = '${MADE_LEGAL_CASE}'`,
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

    // The three constructed subjects are committed for the duration of this file so the guard-on
    // cases have a REAL row to fail against — see † in the header. They come out in `afterAll`
    // through the scaffolding wrapper, which is itself the demonstration the guard is in force.
    for (const target of TARGETS) {
      if (target.construct === undefined) continue;
      for (const statement of target.construct) await prisma.$executeRawUnsafe(statement);
      const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "${target.table}"`,
      );
      expect(
        Number(row?.n ?? '0'),
        `${target.table}'s constructed subject is missing, so every case on it is vacuous`,
      ).toBeGreaterThan(0);
    }
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE CENSUS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the census — read from the live catalogue, not from the migration text', () => {
    it('every governed table has a ROW-level BEFORE DELETE guard, ENABLE ALWAYS', async () => {
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

      expect(
        GOVERNED_TABLES.filter((t) => !covered.has(t)),
        'a governed table has NO row-level DELETE guard. Every one of these was measured erasable ' +
          'with audit_event unmoved; a table that loses its guard must never pass as healthy.',
      ).toEqual([]);

      expect(
        GOVERNED_TABLES.map((t) => covered.get(t))
          .filter((r) => r !== undefined && r.tgenabled !== 'A')
          .map((r) => `${r?.tgname}=${r?.tgenabled}`),
        "a DELETE guard is not 'ENABLE ALWAYS' — one plain `SET session_replication_role = " +
          "'replica'` skips it, and that same GUC is what turned three FK accidents into erasures",
      ).toEqual([]);
    });

    it('EVERY table in public either has DELETE coverage or a recorded no-guard verdict', async () => {
      // Statement-level counts too (`audit_chain_head` is covered by a statement trigger), because
      // the question is "is DELETE governed at all", not "by which flavour of trigger".
      const rows = await prisma.$queryRawUnsafe<{ table: string }[]>(
        `SELECT c.relname AS "table"
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r' AND n.nspname = 'public'
            AND NOT EXISTS (
              SELECT 1 FROM pg_trigger t
               WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
                 AND (t.tgtype & 8) <> 0 AND (t.tgtype & 2) <> 0
            )
          ORDER BY 1`,
      );
      const uncovered = rows.map((r) => r.table);

      expect(
        uncovered.filter((t) => DELETE_DELIBERATELY_UNGUARDED[t] === undefined),
        'a table in `public` has NO DELETE coverage and NO recorded verdict. Decide and record one ' +
          'in DELETE_DELIBERATELY_UNGUARDED (or guard it) — this assertion exists because migration ' +
          '4 censused only the tables that were ALREADY guarded and concluded `waqf` was the only ' +
          'gap, while every corpus and ledger table sat wide open.',
      ).toEqual([]);

      // …and the reverse, so the verdict list cannot rot into a description of the past: a table
      // that GAINS a guard must lose its no-guard verdict.
      expect(
        Object.keys(DELETE_DELIBERATELY_UNGUARDED).filter((t) => !uncovered.includes(t)),
        'a table carries a no-guard verdict but IS now guarded — remove the stale verdict',
      ).toEqual([]);
    });

    it('the scaffolding list in setup.ts covers every guard a teardown might have to switch off', () => {
      const wrapped = new Set(RETENTION_REMAINDER_SCAFFOLDING_GUARDS.map((g) => g.table));
      expect(
        GOVERNED_TABLES.filter((t) => !wrapped.has(t)),
        'a table gained a guard without joining RETENTION_REMAINDER_SCAFFOLDING_GUARDS, so the next ' +
          'teardown fails with a refusal that reads like a product bug',
      ).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. GUARD ON
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
        // ⚠ NAMES THIS TABLE — see § in the header. No `peel` runs here, so for `client`, `waqif`
        // and `compliance_obligation` the FK would also refuse; asserting the name is what
        // distinguishes the guard from the FK accident that was there before migration 8.
        expect(error, `the refusal did not come from "${target.table}"'s own guard`).toMatch(
          new RegExp(`DELETE on "${target.table}" is refused`),
        );
        // The refusal names the legal alternative, or the next person to hit it deletes the guard.
        expect(error, 'the refusal does not say what to do instead').toMatch(/deletedAt|status/);

        const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM "${target.table}" WHERE "id" = '${id}'`,
        );
        expect(row?.n, 'the row went anyway').toBe('1');
      });
    }

    it('refuses them all under session_replication_role = replica — where the FK cannot mask it', async () => {
      // ‡ THE CENTRAL NEGATIVE CONTROL, AND THE `ENABLE ALWAYS` ASSERTION IN ONE.
      //
      // Before migration 8, `client`, `waqif` and `compliance_obligation` refused a plain DELETE with
      // 23503 and looked protected. `SET session_replication_role = 'replica'` skips the INTERNAL RI
      // triggers, which is the exact statement that turned all three into **PERMITTED** with their
      // children ORPHANED — so under this GUC an FK cannot be what refuses, and anything that does
      // refuse is the guard.
      //
      // The same GUC also skips a trigger created WITHOUT `ENABLE ALWAYS` (`tgenabled = 'O'`) — one
      // plain `SET`, not DDL — which is the Sprint-1 finding that defeated gate G-1. So this one case
      // proves the guard is present, is what refuses, and is `ENABLE ALWAYS`, behaviourally rather
      // than by reading `tgenabled`.
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
        expect(
          error,
          `under the replica role no FK can refuse, so "${target.table}" was erasable`,
        ).toMatch(new RegExp(`DELETE on "${target.table}" is refused`));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. THE MUTATION, EXECUTED — the reproduction, re-run
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('MUTATION · with the guards off, every one of them is erased and audit_event does not move', async () => {
    // THE REPRODUCTION AS A TEST. Drop a guard from `qmulate_apply_e2_retention_remainder()`, or
    // create it without `ENABLE ALWAYS`, and the table goes straight back to erasable. Rather than
    // describe that, this runs it: inside a rolled-back transaction the guards are disabled and each
    // delete is driven to completion, with `audit_event` measured on both sides.
    const ROLLBACK = '__qmulate_remainder_mutation__';
    const observed: Record<string, { deleted: number; auditDelta: number }> = {};
    let unexpected: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        for (const { table, trigger } of RETENTION_REMAINDER_SCAFFOLDING_GUARDS) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER ${trigger}`);
        }
        // …and the FK graph out of the way too, so a 23503 cannot stop the reproduction short. This
        // is the statement the original measurement used: `client`, `waqif` and
        // `compliance_obligation` were erased under it with their children left ORPHANED.
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);

        for (const target of TARGETS) {
          const rows = await tx.$queryRawUnsafe<{ id: string }[]>(target.pick);
          const id = rows[0]?.id;
          if (id === undefined) {
            observed[target.table] = { deleted: -1, auditDelta: -1 }; // defective, and reported
            continue;
          }
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
        `${target.table}: the DELETE matched ${String(result?.deleted)} rows, so this case is a ` +
          `false negative rather than a reproduction`,
      ).toBe(1);
      expect(result?.auditDelta, `${target.table}: the erasure produced an audit event`).toBe(0);
    }

    // Nothing left behind, and no guard left off.
    await assertGuardsInstalled();
    const [counts] = await prisma.$queryRawUnsafe<{ settings: string; clients: string }[]>(
      `SELECT (SELECT count(*) FROM "setting")::text  AS settings,
              (SELECT count(*) FROM "client")::text   AS clients`,
    );
    expect(Number(counts?.settings ?? '0')).toBeGreaterThan(0);
    expect(Number(counts?.clients ?? '0')).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. THE ATTACK AS IT IS ACTUALLY DRIVEN — a scoped client’s own raw connection
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('a low-privilege seat on its own scoped client', () => {
    it('cannot erase a per-waqf Setting override through $executeRawUnsafe', async () => {
      // Prisma client extensions do NOT intercept `$queryRaw` / `$executeRaw*`, so this statement
      // reaches Postgres with every TypeScript control already behind it — ADR-0008's structural
      // point, and the whole reason the guard has to be a trigger.
      //
      // The override is the sharp target: erase it and the resolver silently falls back to the GLOBAL
      // figure for that endowment. No error, no event, a different fee basis.
      const client = db.createPrismaClient({
        actorId: LOW_PRIVILEGE_SEAT,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF],
        permissions: ['compliance:task:write', 'document:document:write'],
        requestId: 'round4-setting-erasure',
      } as never) as unknown as PrismaLike;

      const id = await pickId(TARGETS[0] as Target); // the `setting` target

      // ⚠ INSIDE A TRANSACTION THAT ALWAYS ROLLS BACK, and that is not belt-and-braces.
      // The mutation run caught this: with the refusal function replaced by `RETURN OLD`, a bare
      // `$executeRawUnsafe` here COMMITTED, the seeded override was gone, and the next five cases
      // reported `DEFECTIVE PROBE: setting's pick matched 0 rows` instead of the finding. A probe must
      // never be able to destroy the fixture it is measuring — `guardProbeSql` exists for exactly this
      // reason, and it cannot be used here because the statement has to travel through the SCOPED
      // client to prove extensions do not intercept raw SQL.
      const ROLLBACK = '__qmulate_scoped_setting_probe__';
      let thrown: unknown;
      try {
        await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`DELETE FROM "setting" WHERE "id" = '${id}'`);
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        thrown = errorText(error).includes(ROLLBACK) ? undefined : error;
      }
      expect(thrown, 'a low-privilege seat erased a regulatory figure from raw SQL').toBeDefined();
      // ⚠ THE REFUSAL MOVED LAYERS IN ADR-0008 ROUND 6. Before: the statement reached Postgres and
      // `setting_no_delete` refused it. Now the runtime role holds no DELETE on `setting`, so the ACL
      // refuses first — `42501 permission denied for table setting`. Both are accepted, so this case
      // does not go red on a database where the privilege matrix was never applied (migration 10
      // degrades to a NOTICE when the roles are absent); the PRIVILEGE claim is asserted
      // unconditionally in `authorization-plane-privilege.integration.test.ts`, and the TRIGGER is
      // still proven by this file's `runProbe()` cases, which run on the OWNER connection where the
      // privilege is present and the guard is therefore what raises.
      expect(errorText(thrown)).toMatch(
        /DELETE on "setting" is refused|permission denied for table setting/,
      );
      expect(errorText(thrown)).toMatch(
        /fall back to the GLOBAL value|permission denied for table setting/,
      );

      const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "setting" WHERE "id" = '${id}'`,
      );
      expect(row?.n).toBe('1');
    });

    it('closes DELETE + re-INSERT on a Setting — the move that defeated the Shart guard as C-03', async () => {
      // `setting` has no write-once trigger, so the row's VALUE is editable by design (that is what
      // `settings.set` does, behind Nazir approval + TOTP). What must not be available is removing
      // the row and putting a different one back under the same id with no trace, which is exactly
      // how the Shart was substituted (C-03) and a grant's immutable role rewritten (C-09).
      const id = await pickId(TARGETS[0] as Target);
      const [before] = await prisma.$queryRawUnsafe<{ value: unknown }[]>(
        `SELECT "value" FROM "setting" WHERE "id" = '${id}'`,
      );

      const error = await runProbe(
        guardProbeSql(
          [
            `DELETE FROM "setting" WHERE "id" = '${id}'`,
            `; INSERT INTO "setting" SELECT * FROM jsonb_populate_record(NULL::"setting",`,
            `    '{"id":"${id}","key":"nazirFee.percentOfRevenue","value":{"v":"99.00"},`,
            `      "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}'::jsonb)`,
          ].join('\n'),
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "setting" is refused/);

      const [after] = await prisma.$queryRawUnsafe<{ value: unknown }[]>(
        `SELECT "value" FROM "setting" WHERE "id" = '${id}'`,
      );
      expect(
        JSON.stringify(after?.value),
        'a regulatory figure was substituted by DELETE + re-INSERT',
      ).toBe(JSON.stringify(before?.value));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 5. THE POSITIVE CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the legal paths are still open, and the no-guard verdicts are real', () => {
    it('soft delete is still permitted on all nine — a guard with no legal path is an outage', async () => {
      // Rolled back, so the seeded fixture is unchanged: `seed.integration.test.ts` counts these
      // rows absolutely.
      for (const target of TARGETS) {
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

    it('the three tables with a NO-GUARD verdict really are still deletable', async () => {
      // The verdict made visible rather than asserted in prose. If someone later guards `budget`,
      // `vendor` or `maintenance_ticket` without revisiting migration 8 §4 and
      // `domain-write-gate.integration.test.ts`, this turns red and points at the decision.
      const ROLLBACK = '__qmulate_unguarded_verdict__';
      const observed: Record<string, string> = {};
      let unexpected: unknown;

      try {
        await prisma.$transaction(async (tx) => {
          const cases: readonly { table: string; insert: string; id: string }[] = [
            {
              table: 'budget',
              id: 'budget-9001',
              insert: `INSERT INTO "budget" ("id","waqfId","fiscalYear","revenueEstimate","expenseEstimate","createdAt","updatedAt")
                         VALUES ('budget-9001','${WAQF}','2098', 1, 1, now(), now())`,
            },
            {
              table: 'vendor',
              id: 'vendor-9001',
              insert: `INSERT INTO "vendor" ("id","nameAr","role","createdAt","updatedAt")
                         VALUES ('vendor-9001','مورّد وهمي (بيانات وهمية)','P-01', now(), now())`,
            },
            {
              table: 'maintenance_ticket',
              id: 'ticket-9001',
              insert: `INSERT INTO "maintenance_ticket" ("id","assetId","kind","status","openedAt","openedAtHijri","createdAt","updatedAt")
                         SELECT 'ticket-9001', a."id", 'repair', 'open', now(), '1447-07-12', now(), now()
                           FROM "asset" a WHERE a."waqfId" = '${WAQF}' ORDER BY a."id" LIMIT 1`,
            },
          ];
          for (const kase of cases) {
            await tx.$executeRawUnsafe(kase.insert);
            const deleted = await tx.$executeRawUnsafe(
              `DELETE FROM "${kase.table}" WHERE "id" = '${kase.id}'`,
            );
            observed[kase.table] = deleted === 1 ? 'deletable' : `matched ${String(deleted)} rows`;
          }
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) unexpected = error;
      }

      expect(
        unexpected === undefined ? null : errorText(unexpected),
        'the no-guard verdict could not be exercised, so it is unverified',
      ).toBeNull();
      expect(observed).toEqual({
        budget: 'deletable',
        vendor: 'deletable',
        maintenance_ticket: 'deletable',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 6. WHAT IS STILL OPEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.todo(
    'SURFACED, NOT RESOLVED (product scope) — soft-delete does NOT free the identity on three of ' +
      'these tables, because the unique key does not exclude soft-deleted rows: ' +
      'setting UNIQUE("waqfId","key"), government_filing UNIQUE("waqfId","platform"), ' +
      'zakat_filing UNIQUE("waqfId","fiscalYear"). So "soft-delete it and record a replacement" is ' +
      'unavailable for those three. It costs nothing today — verified across packages/{api,database}' +
      '/src, NO shipped path writes a non-null deletedAt on any of them, and there is no "unset this ' +
      'override" procedure at all — but whoever builds the correction path in E11 must choose ' +
      'between a partial unique index (… WHERE "deletedAt" IS NULL) and supersede-in-place.',
  );

  it.todo(
    'SURFACED — PDPL. `client` and `waqif` are named natural persons (nameAr is required and ' +
      'Arabic-authoritative), so a PDPL erasure request against a family or a founder now meets this ' +
      'guard, exactly as migration 6 recorded for `beneficiary`. Retention-vs-erasure belongs in the ' +
      'PDPL compliance register, which CLAUDE.md lists as an unwritten load-bearing gap.',
  );

  it.todo(
    'REPORTED, NOT CLOSED — `membership` (client-tier roles, CHECK ' +
      'membership_role_family_level_only) has NO DELETE coverage and is an authorization-plane table. ' +
      'It is not this file’s subject and `packages/api/test/setup.ts` tears its own memberships down, ' +
      'so guarding it is one coordinated change with the round-3 authorization-plane owner.',
  );

  it.todo(
    'NOT CLOSED, AND NOT IN THIS LAYER — the CAUSE. A seat holding only compliance/document write ' +
      'verbs reaches `setting` and `waqif` writes at all; it is stopped by a row guard, not by the ' +
      'permission ladder. That mapping is the force filter in ' +
      'packages/database/src/extensions/scoping.ts, which migration 8 does not own.',
  );
});
