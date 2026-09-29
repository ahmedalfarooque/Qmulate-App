/**
 * S8-Q5 — the obligation library as EVIDENCE, driven against real rows (migration 31).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CLAIM §09 MADE AND THE DATABASE DID NOT KEEP
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09 Engine A: *"Each `ObligationTemplate` is immutable within a library version; changing an
 * obligation means publishing a new version, never mutating a shipped row (so historical tasks always
 * trace to the exact text that governed them)."*
 *
 * Measured before migration 31, nothing implemented any part of it: no `libraryVersion` column, no
 * UPDATE guard of any kind, a task carrying only a cuid FK, and — from migration 16's own census —
 * `UPDATE "compliance_obligation" SET "id" = …` COMMITTING as `qmulate_app`.
 *
 * **A compliance register whose obligations are mutable is not evidence of what was owed. It is a
 * current opinion about what is owed, with a history-shaped table.**
 *
 * ── EVERY REFUSAL HERE IS DRIVEN AS THE APPLICATION ROLE, NOT AS A SUPERUSER ─────────────────
 * `dev-postgres.ts` points `DATABASE_URL` at `qmulate_app`, the least-privileged role, which is what
 * makes a refusal measurement mean anything. Where a probe needs the privileged connection it says so
 * and says why.
 *
 * ── AND EVERY REFUSAL IS PAIRED WITH THE THING IT MUST STILL PERMIT ─────────────────────────
 * A guard that refuses everything is an outage, and the first person to hit one relaxes it rather
 * than routing around it (migration 5 §2f). So each block below asserts the permitted act beside the
 * refused one: `updatedAt` and `deletedAt` still move, a NEW VERSION still inserts, and a task's
 * status still transitions.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S8-Q5 obligation-template immutability (§09 Engine A, migration 31)');

/** A seeded placeholder obligation. `SEED-`-namespaced, derived from a fixture task. */
const SEEDED_CODE_PREFIX = 'SEED-';

const NEW_VERSION_ID = 'test-oblig-v2';
const NEW_VERSION = '2026-08-23.test';

describe.skipIf(!hasDatabase)(
  'an obligation template is immutable within its library version',
  () => {
    let subjectId: string;
    let subjectCode: string;

    beforeAll(async () => {
      await assertGuardsInstalled();
      const prisma = await basePrisma();
      const row = await prisma.complianceObligation.findFirst({
        where: { code: { startsWith: SEEDED_CODE_PREFIX } },
        orderBy: { code: 'asc' },
      });
      // THE PREMISE. Every refusal below is vacuous without a row to refuse it on, and a `SEED-` row is
      // what the fixture actually contains — asserted rather than assumed.
      expect(
        row,
        'the fixture seeds no SEED- obligation, so this whole suite proves nothing',
      ).not.toBeNull();
      subjectId = row!.id;
      subjectCode = row!.code;
      expect(row!.libraryVersion).toBe('fixture-derived');
      await cleanupNewVersion();
    });

    afterAll(async () => {
      await cleanupNewVersion();
      await closeDatabase();
    });

    /* ═══════════════════════════════════════════════════════════════════════════════════════
     * 1 · THE CONTENT COLUMNS, one at a time
     * ═══════════════════════════════════════════════════════════════════════════════════════ */

    it.each([
      ['titleAr', `'مُعدَّل'`],
      ['titleEn', `'edited'`],
      ['workstreamAr', `'مُعدَّل'`],
      ['workstreamEn', `'edited'`],
      ['code', `'SEED-RENAMED-99'`],
      ['libraryVersion', `'2099-01-01.1'`],
      ['deadlineRuleKey', `'REGISTER_30BD'`],
    ])('refuses an UPDATE of %s, as the APPLICATION role', async (column, literal) => {
      // One column per case rather than one UPDATE touching all of them: a guard that only checks the
      // first column it looks at would pass a combined probe. Each is driven separately so the failure
      // names the column that slipped.
      const prisma = await basePrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "compliance_obligation" SET "${column}" = ${literal} WHERE "id" = '${subjectId}'`,
        ),
      ).rejects.toThrow(/UPDATE on "compliance_obligation" is refused/);
    });

    it('refuses a change of `gate` — the column BR-104 turns on', async () => {
      // Called out separately because this is the one whose edit is silent AND consequential: flipping a
      // gate changes which endowments owe a duty, retroactively, for every task already recorded
      // against the row.
      const prisma = await basePrisma();
      const current = await prisma.complianceObligation.findFirstOrThrow({
        where: { id: subjectId },
        select: { gate: true },
      });
      // ⚠ THE PROBE MUST ACTUALLY CHANGE THE VALUE. The guard uses `IS DISTINCT FROM`, so setting a
      // column to what it already holds is correctly PERMITTED — and the first draft of this test set
      // `gate = 'ALL'` on a row whose gate already WAS `ALL`, then failed because nothing was refused.
      // That is a false negative in the making: had the guard been broken, this test would still have
      // "passed" for the same reason once inverted. Pick a value that differs, from the row itself.
      const different = current.gate === 'ALL' ? 'LARGE_MEDIUM' : 'ALL';
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "compliance_obligation" SET "gate" = '${different}'::"ClassificationGate" WHERE "id" = '${subjectId}'`,
        ),
      ).rejects.toThrow(/UPDATE on "compliance_obligation" is refused: gate/);
    });

    it('⊕ refuses a change of `confidentiality` — the AML compartment cannot be lifted in place', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // MIGRATION 33. MEASURED BEFORE THE FIX, AS `qmulate_app`, ON THE SEEDED GOV-AML-02 ROW:
      //   UPDATE … SET "confidentiality" = 'NORMAL' WHERE "code" = 'GOV-AML-02';   -- COMMITTED
      //   UPDATE … SET "titleEn"         = 'mutated' WHERE "code" = 'GOV-AML-02';  -- 42501
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // The duty to report AML/CTF suspicion to the FIU could be taken out of the compartment by one
      // UPDATE from the ordinary application role — no new library version, no approval, and no
      // error, because nothing malfunctions. It becomes visible to the eleven of thirteen presets
      // holding `compliance:task:read`, which is the S8-Q1 leak arriving back through the write path.
      //
      // ⚠ IT WAS INVISIBLE UNTIL THE LIBRARY WAS SEEDED. Migration 32 added the column and marked no
      // row, so every obligation was NORMAL and a guarded column was indistinguishable from an
      // unguarded one. Migration 31 had frozen the columns that existed when IT was written; the two
      // files were an hour apart and nothing joined them.
      //
      // ⚠ AND THE PROBE MUST CHANGE THE VALUE, for the reason the `gate` case above records: the
      // guard uses `IS DISTINCT FROM`, so writing a row's existing classification back is correctly
      // PERMITTED — and a probe that set NORMAL on an already-NORMAL row would be green with the
      // guard deleted.
      const prisma = await basePrisma();
      const current = await prisma.complianceObligation.findFirstOrThrow({
        where: { id: subjectId },
        select: { confidentiality: true },
      });
      const different = current.confidentiality === 'AML_RESTRICTED' ? 'NORMAL' : 'AML_RESTRICTED';
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "compliance_obligation" SET "confidentiality" = '${different}'::"Confidentiality" WHERE "id" = '${subjectId}'`,
        ),
      ).rejects.toThrow(/UPDATE on "compliance_obligation" is refused: confidentiality/);

      // THE LIVENESS HALF — writing the SAME classification back is still permitted, or every
      // converging re-seed of 46 rows would abort the whole seed transaction.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "compliance_obligation" SET "confidentiality" = '${current.confidentiality}'::"Confidentiality" WHERE "id" = '${subjectId}'`,
        ),
      ).resolves.toBeGreaterThanOrEqual(0);
    });

    it("⚠ RECORDED, NOT FIXED — a compliance_task's confidentiality is still re-writable", async () => {
      // Migration 33 deliberately did not freeze the TASK side, and the absence is asserted so it
      // reads as a decision rather than as something nobody looked at. A task is an INSTANCE, not a
      // shipped template: its classification is written at instantiation and may legitimately have to
      // follow its obligation, and freezing it before the instantiation engine exists would be a
      // guard nobody can satisfy (migration 5 §2f).
      //
      // ⚠ Nothing writes it today — the seed sets no task confidentiality and no router exists — so
      // there is nothing to protect yet. The day E7's Engine A instantiates tasks, whether the
      // classification freezes at instantiation is a question that has to be ANSWERED. This test
      // going red is that day arriving.
      const prisma = await basePrisma();
      const task = await prisma.complianceTask.findFirstOrThrow({
        select: { id: true, confidentiality: true },
        orderBy: { id: 'asc' },
      });
      const different = task.confidentiality === 'AML_RESTRICTED' ? 'NORMAL' : 'AML_RESTRICTED';
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "compliance_task" SET "confidentiality" = '${different}'::"Confidentiality" WHERE "id" = '${task.id}'`,
        ),
        "compliance_task.confidentiality is now guarded — update migration 33's header and delete this",
      ).resolves.toBe(1);
      // Restored inside the test, so the fixture the rest of the suite reads is unchanged.
      await prisma.$executeRawUnsafe(
        `UPDATE "compliance_task" SET "confidentiality" = '${task.confidentiality}'::"Confidentiality" WHERE "id" = '${task.id}'`,
      );
    });

    it('the refusal NAMES THE REMEDY, not just the prohibition', async () => {
      // A refusal that states only the prohibition gets the guard deleted by the next person who hits
      // it — migration 6's stated reason for passing the retirement instruction into its trigger. Here
      // the remedy is the whole of §09's rule, so it has to be in the message.
      const prisma = await basePrisma();
      let message = '';
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "compliance_obligation" SET "titleEn" = 'x' WHERE "id" = '${subjectId}'`,
        );
      } catch (error) {
        message = String((error as { message?: string }).message);
      }
      expect(message).toContain('publish a NEW VERSION');
      expect(message).toContain('libraryVersion');
      expect(message).toContain('deletedAt');
      // And it names the offending column, so a caller does not have to bisect.
      expect(message).toContain('titleEn');
    });

    it('survives the replica role — ENABLE ALWAYS, measured', async () => {
      // `session_replication_role = 'replica'` skips ordinary triggers, and it is the one statement that
      // turned three of migration 8's FK-accident refusals into PERMITTED.
      const raw = await privilegedPrisma();
      await expect(
        raw.$transaction([
          raw.$executeRawUnsafe(privilegedSql(`SET LOCAL session_replication_role = 'replica'`)),
          raw.$executeRawUnsafe(
            privilegedSql(
              `UPDATE "compliance_obligation" SET "titleEn" = 'x' WHERE "id" = '${subjectId}'`,
            ),
          ),
        ]),
      ).rejects.toThrow(/UPDATE on "compliance_obligation" is refused/);
    });

    /* ═══════════════════════════════════════════════════════════════════════════════════════
     * 2 · WHAT IT MUST STILL PERMIT — or it is an outage, not a guard
     * ═══════════════════════════════════════════════════════════════════════════════════════ */

    it('PERMITS a soft retire, which is the only way to take a template out of service', async () => {
      // ✓ RULED — S8-Q12 (product owner, 2026-08-23, memo S8 addendum second batch, verbatim
      // selection: "Ordinary maintenance, audited"). Retiring an obligation template — a GLOBAL row
      // that changes what every endowment owes — is NOT reserved-matter gated, unlike
      // waqf/asset/transaction/distribution. This was engineering's reading, flagged-not-settled
      // when this test shipped; the owner SIDED WITH IT, expressly overruling the orchestrator's
      // recommendation of a gate — the rejection is itself part of the record. The accepted
      // tradeoff, stated at answer time: a seat with catalogue write can retire a template without
      // a second approval; the AUDIT TRAIL is the control. (Migration 31's header keeps the
      // pre-ruling wording — an applied migration is a historical record; migration 33's header
      // carries the ruling citation.)
      const prisma = await basePrisma();
      await prisma.$executeRawUnsafe(
        `UPDATE "compliance_obligation" SET "deletedAt" = now() WHERE "id" = '${subjectId}'`,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "compliance_obligation" SET "deletedAt" = NULL WHERE "id" = '${subjectId}'`,
      );
    });

    it("PERMITS a new VERSION of the same code — §09's remedy actually works", async () => {
      // The remedy the refusal names must be reachable, or the guard is a dead end. `UNIQUE (code,
      // libraryVersion)` is what makes both rows coexist; under the old `UNIQUE (code)` this INSERT was
      // impossible, which is why §09's instruction could not be followed at all.
      const prisma = await basePrisma();
      const source = await prisma.complianceObligation.findFirstOrThrow({
        where: { id: subjectId },
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "compliance_obligation"
         ("id","code","section","workstreamAr","workstreamEn","titleAr","titleEn","gate",
          "deadlineRuleKey","libraryVersion","updatedAt")
       VALUES ('${NEW_VERSION_ID}','${source.code}','${source.section}'::"ComplianceSection",
               $$${source.workstreamAr}$$,$$${source.workstreamEn}$$,$$${source.titleAr}$$,
               $$corrected text$$,'${source.gate}'::"ClassificationGate",NULL,
               '${NEW_VERSION}',now())`,
      );

      const both = await prisma.complianceObligation.findMany({
        where: { code: source.code },
        orderBy: { libraryVersion: 'asc' },
      });
      expect(both.map((row) => row.libraryVersion)).toStrictEqual([
        '2026-08-23.test',
        'fixture-derived',
      ]);
      // The OLD row is untouched — which is the entire point of publishing rather than editing.
      expect(both.find((row) => row.libraryVersion === 'fixture-derived')?.titleEn).toBe(
        source.titleEn,
      );
    });

    it('refuses a SECOND row at the SAME (code, version) — the key is the pair', async () => {
      const prisma = await basePrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "compliance_obligation"
           ("id","code","section","workstreamAr","workstreamEn","titleAr","titleEn","gate",
            "libraryVersion","updatedAt")
         VALUES ('test-oblig-dup','${subjectCode}','FINANCIAL'::"ComplianceSection",
                 'x','x','x','x','ALL'::"ClassificationGate",'fixture-derived',now())`,
        ),
        // Postgres names the KEY COLUMNS rather than the index, which is the better thing to assert
        // anyway: it proves the key is the PAIR. Under the old single-column unique this same INSERT
        // failed with `Key (code)=…`, which is how the missing DROP was found.
      ).rejects.toThrow(/Key \(code, "libraryVersion"\)/);
    });
  },
);

describe.skipIf(!hasDatabase)("a task's template snapshot is frozen", () => {
  let taskId: string;
  let taskCode: string;

  beforeAll(async () => {
    const prisma = await basePrisma();
    const row = await prisma.complianceTask.findFirstOrThrow({ orderBy: { id: 'asc' } });
    taskId = row.id;
    taskCode = row.templateCode;
    // THE PREMISE: the backfill actually populated the snapshot from the joined obligation.
    expect(
      row.templateCode.length,
      'the snapshot backfill left templateCode empty',
    ).toBeGreaterThan(0);
    expect(row.templateVersion).toBe('fixture-derived');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it.each(['templateCode', 'templateVersion'])('refuses an UPDATE of %s', async (column) => {
    const prisma = await basePrisma();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "compliance_task" SET "${column}" = 'moved' WHERE "id" = '${taskId}'`,
      ),
    ).rejects.toThrow(/"templateCode"\/"templateVersion" are a FROZEN SNAPSHOT/);
  });

  it('the refusal tells you to RETIRE and re-instantiate, not to correct in place', async () => {
    const prisma = await basePrisma();
    let message = '';
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "compliance_task" SET "templateCode" = 'moved' WHERE "id" = '${taskId}'`,
      );
    } catch (error) {
      message = String((error as { message?: string }).message);
    }
    expect(message).toContain('RETIRE');
    expect(message).toContain('the history of the mistake is part of the record');
    expect(message).toContain(taskCode);
  });

  it('PERMITS an ordinary status transition — the guard is narrow', async () => {
    // If this failed, the register would be read-only and every guard above would be an outage.
    const prisma = await basePrisma();
    const before = await prisma.complianceTask.findFirstOrThrow({ where: { id: taskId } });
    await prisma.$executeRawUnsafe(
      `UPDATE "compliance_task" SET "notes" = 'touched by the S8-Q5 suite' WHERE "id" = '${taskId}'`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "compliance_task" SET "notes" = ${before.notes === null ? 'NULL' : `$$${before.notes}$$`} WHERE "id" = '${taskId}'`,
    );
  });
});

describe.skipIf(!hasDatabase)('the identity exposure migration 16 measured is closed', () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it.each(['compliance_obligation', 'compliance_task'])(
    'refuses renaming a %s row onto another identity',
    async (table) => {
      // ⚠ THE ATTACK THE CONTENT GUARD CANNOT SEE. Leave every content column alone and move the ROW:
      // every task pointing at the old id now records a different duty, and not one watched column
      // changed. Migration 16's census MEASURED this committing as `qmulate_app`.
      const prisma = await basePrisma();
      const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "${table}" ORDER BY "id" LIMIT 1`,
      );
      expect(row, `${table} is empty, so this probe proves nothing`).toBeDefined();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "id" = '${row!.id}-renamed' WHERE "id" = '${row!.id}'`,
        ),
      ).rejects.toThrow();
    },
  );
});

/** Removes the extra version row this suite inserts. Goes round the no-delete guard, as it must. */
async function cleanupNewVersion(): Promise<void> {
  const raw = await privilegedPrisma();
  for (const sql of [
    `ALTER TABLE "compliance_obligation" DISABLE TRIGGER "compliance_obligation_no_delete"`,
    `DELETE FROM "compliance_obligation" WHERE "id" IN ('${NEW_VERSION_ID}','test-oblig-dup')`,
    `ALTER TABLE "compliance_obligation" ENABLE ALWAYS TRIGGER "compliance_obligation_no_delete"`,
  ])
    await raw.$executeRawUnsafe(privilegedSql(sql));
}
