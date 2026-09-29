/**
 * S9-3c — §09's CHANGE-SET at rest, and "one open update obligation per waqf" as a CONSTRAINT
 * (migration 40), driven against real rows.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT MIGRATION 40 CLAIMS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09: *"There is one open update obligation per waqf at a time. Concurrent material changes append
 * to its change-set rather than spawning parallel clocks; the due date is driven by the earliest
 * un-filed change's effective date … Filing the update closes the task and clears the change-set;
 * a subsequent change opens a fresh clock."*
 *
 * Two things have to be true at rest for that paragraph to mean anything:
 *
 *  1. **The cause cannot be edited.** `effectiveDate` IS the statutory clock (CDE-Q2,
 *     owner-provisional 2026-08-25). Editing it moves a deadline WITHOUT recomputing it — precisely
 *     what `deadline_frozen_identity` refuses one table over — so the whole cause tuple is frozen.
 *  2. **A second open update duty is unrepresentable.** Not "the application coalesces properly",
 *     which is a claim about code; a partial unique index, which is a claim about the database.
 *
 * ── EVERY REFUSAL IS DRIVEN AS THE APPLICATION ROLE, AND EVERY `ENABLE ALWAYS` ONE AS THE
 *    MIGRATOR TOO ── a guard the migrator can bypass is a convention, not a control.
 * ── AND EVERY REFUSAL IS PAIRED WITH WHAT IT MUST STILL PERMIT (the S8 liveness lesson) ──
 * binding an unbound change, the FIRST filing write, and soft-delete all still move. A freeze that
 * freezes the lifecycle is an outage that reads as a working control.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  closeDatabase,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  retentionRemainderScaffoldingSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S9-3c material-change change-set + one-open-update index (migration 40)');

const WAQF = 'waqf-001';

/**
 * RUN-SCOPED PROBE IDS, and the reason is a real hazard rather than tidiness.
 *
 * Cleanup here can only SOFT-delete (`material_change` and `compliance_task` are both in migration
 * 8's retention family, `ENABLE ALWAYS` — the guards refuse a hard delete even to cleanup, which is
 * them working). With FIXED ids a second run therefore meets last run's rows, and several probes
 * below assert a CHECK CONSTRAINT by name on an INSERT — those would instead hit a PRIMARY KEY
 * conflict and go red for the wrong reason, or worse, a future looser assertion would go GREEN for
 * the wrong reason. Fresh ids per run remove the class. Soft-deleted probe rows accumulate, which
 * is what this repository already tolerates for `deadline`.
 */
const RUN = `${String(process.pid)}${Math.trunc(Date.now() / 1000).toString(36)}`;
const CHANGE_A = `test-mc-frozen-${RUN}`;
const CHANGE_FILED = `test-mc-filed-${RUN}`;
const TASK_A = `test-mc-task-a-${RUN}`;
const TASK_B = `test-mc-task-b-${RUN}`;

async function createChange(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const raw = await privilegedPrisma();
  const columns: Record<string, unknown> = {
    id,
    waqfId: WAQF,
    kind: 'ASSET',
    effectiveDate: new Date('2026-05-10T00:00:00.000Z'),
    effectiveDateHijri: '1447-11-23',
    sourceRef: 'test — invented fixture cause',
    updatedAt: new Date(),
    ...extra,
  };
  const keys = Object.keys(columns);
  const values = keys
    .map((key) => {
      const value = columns[key];
      if (value === null) return 'NULL';
      if (value instanceof Date) return `'${value.toISOString()}'`;
      if (key === 'kind') return `'${String(value)}'::"MaterialChangeKind"`;
      return `'${String(value)}'`;
    })
    .join(', ');
  await raw.$executeRawUnsafe(
    privilegedSql(
      `INSERT INTO "material_change" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${values})`,
    ),
  );
}

/** A `GOV-REG-02` task at the canonical code, so the partial index's predicate matches. */
async function createUpdateTask(id: string, status: string): Promise<void> {
  const raw = await privilegedPrisma();
  const obligation = await raw.$queryRawUnsafe<{ id: string; libraryVersion: string }[]>(
    `SELECT "id","libraryVersion" FROM "compliance_obligation"
       WHERE "code" = 'GOV-REG-02' AND "deletedAt" IS NULL LIMIT 1`,
  );
  const row = obligation[0];
  expect(row, 'the canonical GOV-REG-02 obligation must be seeded').toBeDefined();
  await raw.$executeRawUnsafe(
    privilegedSql(
      `INSERT INTO "compliance_task"
         ("id","waqfId","obligationId","templateCode","templateVersion","status","updatedAt",
          "classificationAtInstantiation","instantiatedReason")
       VALUES ('${id}', '${WAQF}', '${String(row?.id)}', 'GOV-REG-02',
               '${String(row?.libraryVersion)}', '${status}'::"ComplianceTaskStatus", now(),
               'MEDIUM'::"WaqfClassification", 'EVENT_TRIGGER'::"TaskInstantiationReason")`,
    ),
  );
}

/**
 * PROBE CLEANUP — a HARD delete, through migration 8's own scaffolding suspension.
 *
 * ⚠ THIS WAS A SOFT DELETE IN THE FIRST DRAFT AND THAT WAS WRONG, measured on the counted
 * integration pass: `obligation-library-seed.integration.test.ts` asserts
 * `prisma.complianceTask.count()` is exactly **10** — a raw count that includes soft-deleted rows —
 * and this suite's four `GOV-REG-02` probe tasks took it to 15. A suite whose leftovers move another
 * suite's pinned count is a suite that makes the whole invocation order-dependent, which is worse
 * than the inconvenience it was avoiding.
 *
 * `retentionRemainderScaffoldingSql` is the sanctioned route: it suspends migration 8's
 * `_no_delete` triggers for the length of ONE statement so a test can remove its own probe rows.
 * (Both tables are members: `compliance_task` since E2, `material_change` since migration 40.)
 * Using it for CLEANUP is exactly its stated purpose — its warning is that a PROBE run inside it
 * proves nothing, because the guard being probed is not installed while it runs. No probe here runs
 * inside it.
 */
async function cleanup(): Promise<void> {
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    retentionRemainderScaffoldingSql([
      `DELETE FROM "material_change" WHERE "id" LIKE 'test-mc-%'`,
      `DELETE FROM "compliance_task" WHERE "id" LIKE 'test-mc-task-%'`,
    ]),
  );
}

describe.runIf(hasDatabase)('S9-3c · the change-set at rest (migration 40)', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    await cleanup();
    await createChange(CHANGE_A);
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  /* ── 1 · the cause tuple is frozen ─────────────────────────────────────────────────────── */

  it('editing the EFFECTIVE DATE is refused — the app role and the migrator alike', async () => {
    const raw = await privilegedPrisma();
    // ⚠ THE LOAD-BEARING REFUSAL. CDE-Q2 makes this column the statutory clock, so an UPDATE here
    // moves a 15-business-day deadline while the computed `deadline` row keeps the old date — two
    // records of one obligation, disagreeing, with nothing saying which is the deadline.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "material_change" SET "effectiveDate" = '2026-04-01T00:00:00.000Z'
             WHERE "id" = '${CHANGE_A}'`,
        ),
      ),
    ).rejects.toThrow(/CAUSE tuple|never changes/i);

    // And the frozen Hijri twin, separately — a guard that seals one half of a dual pair leaves the
    // record internally inconsistent instead of unchanged.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "material_change" SET "effectiveDateHijri" = '1447-10-01' WHERE "id" = '${CHANGE_A}'`,
        ),
      ),
    ).rejects.toThrow(/CAUSE tuple/i);
  });

  it('the rest of the cause tuple is frozen too, column by column', async () => {
    const raw = await privilegedPrisma();
    for (const [column, value] of [
      ['kind', `'NAZARAH'::"MaterialChangeKind"`],
      ['sourceRef', `'a different reason entirely'`],
      ['waqfId', `'waqf-002'`],
    ] as const) {
      await expect(
        raw.$executeRawUnsafe(
          privilegedSql(
            `UPDATE "material_change" SET "${column}" = ${value} WHERE "id" = '${CHANGE_A}'`,
          ),
        ),
        `${column} must be frozen`,
      ).rejects.toThrow(/CAUSE tuple/i);
    }
  });

  it('the refusal names the remedy — a correction is a NEW change row, not an edit', async () => {
    const raw = await privilegedPrisma();
    let message = '';
    try {
      await raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "material_change" SET "effectiveDate" = now() WHERE "id" = '${CHANGE_A}'`,
        ),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    // A refusal that does not name the legal alternative gets the guard deleted by the next person
    // who hits it (migration 6 §1's own reasoning).
    expect(message).toMatch(/NEW change row/i);
    expect(message).toMatch(/CDE-Q2/);
  });

  /* ── 2 · the lifecycle that must still move ────────────────────────────────────────────── */

  it('LIVENESS: binding an unbound change to its duty still works (NULL -> value)', async () => {
    await createUpdateTask(TASK_A, 'NOT_STARTED');
    const raw = await privilegedPrisma();
    const bound = await raw.$executeRawUnsafe(
      privilegedSql(
        `UPDATE "material_change" SET "complianceTaskId" = '${TASK_A}' WHERE "id" = '${CHANGE_A}'`,
      ),
    );
    expect(bound).toBe(1);
  });

  it('…but RE-pointing a bound cause at a different duty is refused', async () => {
    await createUpdateTask(TASK_B, 'COMPLETED');
    const raw = await privilegedPrisma();
    // Migration 35's re-point lesson, third table now: this would rewrite WHICH duty the change was
    // coalesced into, and therefore which deadline it drove.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "material_change" SET "complianceTaskId" = '${TASK_B}' WHERE "id" = '${CHANGE_A}'`,
        ),
      ),
    ).rejects.toThrow(/set once|Re-pointing/i);
  });

  it('LIVENESS: the FIRST filing write lands; a second one, and any un-filing, is refused', async () => {
    await createChange(CHANGE_FILED, { complianceTaskId: TASK_A });
    const raw = await privilegedPrisma();
    const filed = await raw.$executeRawUnsafe(
      privilegedSql(
        `UPDATE "material_change"
           SET "filedAt" = '2026-05-25T00:00:00.000Z', "filedAtHijri" = '1447-12-08'
           WHERE "id" = '${CHANGE_FILED}'`,
      ),
    );
    expect(filed).toBe(1);

    // ⚠ UN-FILING is the dangerous one: §09 says a subsequent change opens a FRESH clock, so
    // reopening a discharged one would resurrect an obligation that was met.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "material_change" SET "filedAt" = NULL, "filedAtHijri" = NULL
             WHERE "id" = '${CHANGE_FILED}'`,
        ),
      ),
    ).rejects.toThrow(/write-once|resurrect/i);

    // Re-dating a filing is the same defect wearing a correction's clothes.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "material_change" SET "filedAt" = now() WHERE "id" = '${CHANGE_FILED}'`,
        ),
      ),
    ).rejects.toThrow(/write-once/i);
  });

  it('LIVENESS: soft-delete still works — the legal retirement route the refusals point at', async () => {
    const softId = `test-mc-soft-${RUN}`;
    await createChange(softId);
    const raw = await privilegedPrisma();
    const retired = await raw.$executeRawUnsafe(
      privilegedSql(`UPDATE "material_change" SET "deletedAt" = now() WHERE "id" = '${softId}'`),
    );
    expect(retired).toBe(1);
  });

  /* ── 3 · the CHECKs ───────────────────────────────────────────────────────────────────── */

  it('a half-populated filed pair is unrepresentable', async () => {
    const raw = await privilegedPrisma();
    await expect(
      createChange(`test-mc-halfpair-001-${RUN}`, {
        complianceTaskId: TASK_A,
        filedAt: new Date('2026-05-25T00:00:00.000Z'),
        filedAtHijri: null,
      }),
    ).rejects.toThrow(/material_change_filed_dual_dated/i);
    // …and the other way round.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `INSERT INTO "material_change"
             ("id","waqfId","kind","effectiveDate","effectiveDateHijri","sourceRef","updatedAt","filedAtHijri")
           VALUES ('test-mc-halfpair-002-${RUN}','${WAQF}','ASSET'::"MaterialChangeKind",
                   '2026-05-10T00:00:00.000Z','1447-11-23','probe',now(),'1447-12-08')`,
        ),
      ),
    ).rejects.toThrow(/material_change_filed_dual_dated/i);
  });

  it('a FILED change with no duty behind it is unrepresentable', async () => {
    await expect(
      createChange(`test-mc-unbound-filed-001-${RUN}`, {
        filedAt: new Date('2026-05-25T00:00:00.000Z'),
        filedAtHijri: '1447-12-08',
      }),
    ).rejects.toThrow(/material_change_filed_implies_bound/i);
  });

  it('an UNBOUND, UNFILED change is legitimate — the transient state the CHECK deliberately allows', async () => {
    // The converse is NOT constrained on purpose: `recordMaterialChange` writes the change first
    // and binds it after the coalescer has decided which duty it belongs to. A CHECK demanding a
    // task id at insert would make the honest ordering impossible.
    await createChange(`test-mc-unbound-001-${RUN}`);
    const raw = await privilegedPrisma();
    const rows = await raw.$queryRawUnsafe<{ complianceTaskId: string | null }[]>(
      `SELECT "complianceTaskId" FROM "material_change" WHERE "id" = 'test-mc-unbound-001-${RUN}'`,
    );
    expect(rows[0]?.complianceTaskId).toBeNull();
  });

  it('DELETE and TRUNCATE are refused, and the refusal names this table (not a cascade neighbour)', async () => {
    const raw = await privilegedPrisma();
    let deleteMessage = '';
    try {
      await raw.$executeRawUnsafe(
        privilegedSql(`DELETE FROM "material_change" WHERE "id" = '${CHANGE_A}'`),
      );
    } catch (error) {
      deleteMessage = error instanceof Error ? error.message : String(error);
    }
    expect(deleteMessage).toMatch(/DELETE on "material_change" is refused/);
    // The hint migration 40 passed as `TG_ARGV[0]` — the "what to do instead" that stops the guard
    // being deleted by the next person who hits it.
    expect(deleteMessage).toMatch(/deletedAt/);
    expect(deleteMessage).toMatch(/un-filed/);

    await expect(
      raw.$executeRawUnsafe(privilegedSql(`TRUNCATE TABLE "material_change"`)),
    ).rejects.toThrow(/TRUNCATE on "material_change" is refused/);
  });

  /* ── 4 · ONE OPEN UPDATE OBLIGATION PER WAQF, as a constraint ─────────────────────────── */

  describe("the partial unique index — §09's coalescing rule made unrepresentable", () => {
    it('refuses a SECOND open GOV-REG-02 on the same endowment — for the migrator too', async () => {
      // TASK_A was created NOT_STARTED above, so the endowment's slot is taken.
      // ⚠ This is the whole point of the index: the application coalesces, and this is what
      // happens when it forgets. Without it a second raise would quietly create a parallel
      // statutory clock that somebody later files twice — or files once and believes both closed.
      //
      // ⚠ ASSERTED ON SQLSTATE + THE KEY, NOT ON THE INDEX NAME — and that is a measurement, not a
      // convenience. This test's first draft matched `/compliance_task_one_open_update_per_waqf/`
      // and went RED against a database that had refused correctly: Prisma's `$executeRawUnsafe`
      // surfaces `Raw query failed. Code: '23505'. Message: 'Key ("waqfId")=(waqf-001) already
      // exists.'` and ELIDES the constraint name. Matching the name would have been asserting
      // Prisma's error formatting; `23505` + the conflicting key is the database's own answer.
      // The index NAME is pinned separately, in `REQUIRED_UNIQUE_INDEXES` — so it is still not
      // droppable in silence, it is just not this assertion's job.
      for (const [id, status] of [
        [`test-mc-task-dupe-${RUN}`, 'NOT_STARTED'],
        [`test-mc-task-dupe2-${RUN}`, 'IN_PROGRESS'],
      ] as const) {
        let message = '';
        try {
          await createUpdateTask(id, status);
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        expect(message, `a second open GOV-REG-02 as ${status} must be refused`).toMatch(/23505/);
        expect(message).toMatch(/"waqfId"\)=\(waqf-001\) already exists/);
      }
    });

    it('permits a CLOSED one beside it — a completed duty does not hold the slot', async () => {
      // TASK_B was created COMPLETED above and coexists with the open TASK_A. History is not a
      // lock: §09's "a subsequent change opens a fresh clock" requires exactly this.
      const raw = await privilegedPrisma();
      const rows = await raw.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "compliance_task"
           WHERE "waqfId" = '${WAQF}' AND "templateCode" = 'GOV-REG-02' AND "deletedAt" IS NULL`,
      );
      expect(Number(rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(2);
    });

    it("permits an open one on a DIFFERENT endowment — the key is per-waqf, §09's own identity", async () => {
      const raw = await privilegedPrisma();
      const obligation = await raw.$queryRawUnsafe<{ id: string; libraryVersion: string }[]>(
        `SELECT "id","libraryVersion" FROM "compliance_obligation"
           WHERE "code" = 'GOV-REG-02' AND "deletedAt" IS NULL LIMIT 1`,
      );
      const row = obligation[0];
      const created = await raw.$executeRawUnsafe(
        privilegedSql(
          `INSERT INTO "compliance_task"
             ("id","waqfId","obligationId","templateCode","templateVersion","status","updatedAt",
              "classificationAtInstantiation","instantiatedReason")
           VALUES ('test-mc-task-otherwaqf-${RUN}', 'waqf-002', '${String(row?.id)}', 'GOV-REG-02',
                   '${String(row?.libraryVersion)}', 'NOT_STARTED'::"ComplianceTaskStatus", now(),
                   'MEDIUM'::"WaqfClassification", 'EVENT_TRIGGER'::"TaskInstantiationReason")`,
        ),
      );
      expect(created).toBe(1);
    });

    it('a SOFT-RETIRED open row frees the slot — otherwise the endowment could never file again', async () => {
      const raw = await privilegedPrisma();
      await raw.$executeRawUnsafe(
        privilegedSql(`UPDATE "compliance_task" SET "deletedAt" = now() WHERE "id" = '${TASK_A}'`),
      );
      // The assertion is that this RESOLVES: with the previous open row soft-retired, the
      // endowment's slot is free again. Before the `deletedAt IS NULL` clause in the predicate
      // this threw 23505 forever, which would have left the endowment unable to record another
      // update duty for the rest of its life.
      await expect(
        createUpdateTask(`test-mc-task-afterretire-${RUN}`, 'NOT_STARTED'),
      ).resolves.not.toThrow();
      // Put the endowment back to one open row for whatever runs next.
      await raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "compliance_task" SET "deletedAt" = now() WHERE "id" = 'test-mc-task-afterretire-${RUN}'`,
        ),
      );
    });
  });
});
