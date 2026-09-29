/**
 * S10-1b — `deleteProvisionedEndowments` over §09 Engine B's tables.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A TEST FOR A TEST HELPER, WHICH IS NORMALLY THE WRONG INSTINCT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Because this helper's failure mode is not a failing test — it is the NEXT RUN dying in
 * `beforeAll` with a bare `23503`, on a database that is now permanently poisoned for every
 * suite that provisions an endowment. `setup.ts`'s own comments record that landmine (AV4-B2)
 * biting SIX times across four sprints: `beneficiary`, `reclassification_event`,
 * `government_filing`, and then `compliance_task` / `transaction` / `bank_account` together.
 * Each time the pattern was identical — a `waqf` child with an FK RESTRICT and its own DELETE
 * guard, invisible until the first test wrote a row of that kind onto a PROVISIONED endowment.
 *
 * S9 hit it again and DECLARED it rather than paying it: `deadline-triggers.integration.test.ts`
 * is deliberately pinned to a FIXTURE endowment with a comment saying the helper "does not yet
 * know `material_change`, `deadline`, `lease` or `legal_case`". That list was itself one short —
 * `escalation_event` (migration 41) is a `waqf` child too.
 *
 * So the helper now knows five more tables, and this file is the control that says so. It plants
 * a row in every one of them on a provisioned endowment and then purges it. Without this, the
 * evidence that the new DELETE clauses work would be "the suite went green", which is exactly
 * what it said for six sprints while the gap was open — the tables were simply never written.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE SELF-FK THAT LOOKS LIKE `beneficiary`'s AND ISN'T
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `deadline.recomputedFromId` is a SELF-FK (§09's only correction path: a corrected deadline is
 * a NEW row linking its predecessor, UNIQUE so the chain cannot fork), so the obvious move is to
 * copy `beneficiary`'s leaf-first loop. That is what the first version of this change did, and
 * the mutation replacing the loop with a flat DELETE **SURVIVED** against the two-link chain this
 * file plants — which is how the loop was found to be unnecessary.
 *
 * The two constraints differ in their DELETE ACTION: `beneficiary`'s is `ON DELETE RESTRICT`
 * (immediate, per row), `deadline`'s carries no clause and is therefore NO ACTION (checked at
 * end of statement). One DELETE removing the whole chain leaves nothing dangling by the time the
 * check runs. The chain is still planted here, deliberately — it is what makes that difference
 * an exercised fact rather than a claim in a comment.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  FICTIONAL_MARKER_AR,
  closeDatabase,
  deleteProvisionedEndowments,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  warnNoDatabase,
} from './setup.js';

const PURGE_WAQF = `${API_TEST_WAQF_PREFIX}purge-engineb`;

/** The five tables S10-1b taught the helper, in the order the purge removes them. */
const ENGINE_B_TABLES = [
  'escalation_event',
  'deadline',
  'material_change',
  'legal_case',
  'lease',
] as const;

describe.skipIf(!hasDatabase)('deleteProvisionedEndowments — §09 Engine B tables', () => {
  beforeAll(async () => {
    if (!hasDatabase) {
      warnNoDatabase('deleteProvisionedEndowments / Engine B');
      return;
    }
    await assertSeeded();
  });

  afterAll(async () => {
    if (hasDatabase) await deleteProvisionedEndowments([PURGE_WAQF]);
    await closeDatabase();
  });

  it('purges an endowment carrying a deadline, a recompute chain, an escalation, a material change and a legal case', async () => {
    const prisma = await privilegedPrisma();
    await provisionIntakeEndowment({ id: PURGE_WAQF });

    // ── plant one row per table, raw on the privileged connection ──────────────────────────
    // Raw SQL for `provisionIntakeEndowment`'s own stated reason: these rows exist to be
    // DELETED, and driving them through the real procedures would drag in maker-checker
    // approvals, settings and a holiday calendar that have nothing to do with what is under
    // test. What is under test is the purge, not how the rows got there.
    await plantDeadline(prisma, `${PURGE_WAQF}-dl-1`, '2026-05-31', '1447-12-14', null);
    // ⚠ THE CHAIN, and it has to be set AT INSERT. Two of migration 38's guards shape this and
    // neither was obvious from the column list: `deadline_insert_provenance` demands a non-null
    // `windowSnapshot` on every engine-era INSERT, and `deadline_frozen_identity` freezes
    // `recomputedFromId` **NULL INCLUDED**, so back-filling the link with an UPDATE is refused
    // ("back-filling lineage onto a row fabricates provenance"). Both were MEASURED here, by
    // this test failing against them on its first run — which is the guards working.
    await plantDeadline(
      prisma,
      `${PURGE_WAQF}-dl-2`,
      '2026-06-02',
      '1447-12-16',
      `${PURGE_WAQF}-dl-1`,
    );

    await prisma.$executeRawUnsafe(`
      INSERT INTO "escalation_event" ("id","waqfId","deadlineId","level","derivedStatus",
                                      "businessDaysOverdue","ladderUsed","asOfDate","asOfDateHijri",
                                      "createdAt")
      VALUES ('${PURGE_WAQF}-esc-1', '${PURGE_WAQF}', '${PURGE_WAQF}-dl-1', 'CASE_MANAGER',
              'overdue', 3, 'ordinary', '2026-06-05T00:00:00Z', '1447-12-19', now())`);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "material_change" ("id","waqfId","kind","effectiveDate","effectiveDateHijri",
                                     "sourceRef","createdAt","updatedAt")
      VALUES ('${PURGE_WAQF}-mc-1', '${PURGE_WAQF}', 'ASSET', '2026-05-10T00:00:00Z',
              '1447-11-22', 'S10-1b purge control', now(), now())`);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "legal_case" ("id","waqfId","subjectAr","forum","status","createdAt","updatedAt")
      VALUES ('${PURGE_WAQF}-lc-1', '${PURGE_WAQF}', 'قضية اختبار ${FICTIONAL_MARKER_AR}',
              'GENERAL_COURT', 'OPEN', now(), now())`);

    // ── the planting itself has to be positively controlled ───────────────────────────────
    // A purge that removes nothing passes trivially if the INSERTs silently failed. Four
    // tables are asserted non-empty BEFORE the purge; `lease` is deliberately absent (see
    // the assertion below), so it is not claimed here.
    const before = await countRows(prisma, PURGE_WAQF);
    expect(before.deadline, 'both deadline rows planted, incl. the recompute chain').toBe(2);
    expect(before.escalation_event).toBe(1);
    expect(before.material_change).toBe(1);
    expect(before.legal_case).toBe(1);

    // ── the act ───────────────────────────────────────────────────────────────────────────
    await deleteProvisionedEndowments([PURGE_WAQF]);

    const after = await countRows(prisma, PURGE_WAQF);
    for (const table of ENGINE_B_TABLES) {
      expect(after[table], `${table} rows survived the purge`).toBe(0);
    }

    const waqf = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "waqf" WHERE "id" = '${PURGE_WAQF}'`,
    );
    expect(Number(waqf[0]?.n ?? -1), 'the endowment itself is gone').toBe(0);
  });

  it('re-provisioning the SAME id succeeds — the landmine this helper keeps stepping on', async () => {
    // THE REGRESSION THAT MATTERS. Every previous instance of this bug was green on the first
    // run and dead on the second, because `provisionIntakeEndowment` purges the id before
    // inserting. Doing it twice in one process is the cheapest honest stand-in for "run the
    // suite twice against one database".
    await provisionIntakeEndowment({ id: PURGE_WAQF });
    const prisma = await privilegedPrisma();
    await plantDeadline(prisma, `${PURGE_WAQF}-dl-3`, '2026-06-21', '1448-01-06', null);

    await expect(provisionIntakeEndowment({ id: PURGE_WAQF })).resolves.toBeUndefined();

    const after = await countRows(prisma, PURGE_WAQF);
    expect(after.deadline, 'the second provisioning purged the first run’s deadline').toBe(0);
  });

  it('⚠ DECLARED INCOMPLETE — `lease` is purged but `asset` is not, so a lease is unreachable', async () => {
    // Stated as an assertion rather than a comment so it cannot rot quietly. `lease.assetId` is
    // NOT NULL with an FK RESTRICT onto `asset`, and `asset` is not in the purge at all — so an
    // endowment that could carry a lease could not be purged anyway, one table earlier. Teaching
    // the helper `lease` is correct and necessary but NOT sufficient, and the asset chain
    // (`expropriation`, `maintenance_ticket`, `asset`) is owed to the first stage that
    // provisions an asset. If someone adds `asset` to the purge, this test should fail and be
    // rewritten — that is the point of pinning it.
    const prisma = await privilegedPrisma();
    const purgeSql = deleteProvisionedEndowments.toString();
    expect(purgeSql, '`lease` is in the purge').toContain('DELETE FROM "lease"');
    expect(purgeSql, '`asset` is NOT in the purge — if it is now, rewrite this test').not.toContain(
      'DELETE FROM "asset"',
    );

    const assetFk = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM information_schema.columns
        WHERE table_name = 'lease' AND column_name = 'assetId' AND is_nullable = 'NO'`,
    );
    expect(
      Number(assetFk[0]?.n ?? -1),
      'lease.assetId is NOT NULL, so a lease needs an asset',
    ).toBe(1);
  });
});

async function countRows(
  prisma: { $queryRawUnsafe: <T>(sql: string) => Promise<T> },
  waqfId: string,
): Promise<Record<(typeof ENGINE_B_TABLES)[number], number>> {
  const out = {} as Record<(typeof ENGINE_B_TABLES)[number], number>;
  for (const table of ENGINE_B_TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${table}" WHERE "waqfId" = '${waqfId}'`,
    );
    out[table] = Number(rows[0]?.n ?? -1);
  }
  return out;
}

/**
 * One `deadline` row, with the two things migration 38 will not do without.
 *
 * `windowSnapshot` is REQUIRED at insert (`deadline_insert_provenance`) — §09's "snapshot of the
 * window actually applied, so a later Setting change never silently rewrites history". The values
 * below are a plausible UPDATE_15BD envelope; nothing in this file reads them back, they exist so
 * the row is legal. `recomputedFromId` is passed at INSERT because the identity freeze covers it
 * with NULL included, so it can never be added afterwards.
 */
async function plantDeadline(
  prisma: { $executeRawUnsafe: (sql: string) => Promise<number> },
  id: string,
  dueDate: string,
  dueDateHijri: string,
  recomputedFromId: string | null,
): Promise<void> {
  const snapshot = JSON.stringify({
    basis: 'BUSINESS_DAYS',
    amount: 15,
    settingKey: 'deadline.UPDATE_15BD.businessDays',
    unverified: true,
    roll: 'FORWARD',
  });
  await prisma.$executeRawUnsafe(`
    INSERT INTO "deadline" ("id","waqfId","ruleKey","anchorDate","anchorDateHijri","dueDate",
                            "dueDateHijri","windowSnapshot","recomputedFromId","createdAt","updatedAt")
    VALUES ('${id}', '${PURGE_WAQF}', 'UPDATE_15BD',
            '2026-05-10T00:00:00Z', '1447-11-22', '${dueDate}T00:00:00Z', '${dueDateHijri}',
            '${snapshot}'::jsonb,
            ${recomputedFromId === null ? 'NULL' : `'${recomputedFromId}'`},
            now(), now())`);
}
