/**
 * S9-2 — §09 Engine B's FROZEN deadline contract, driven against real rows (migration 38).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CLAIM §09 MAKES, NOW KEPT BY THE DATABASE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09's freeze rationale: *"A deadline that has been computed, displayed, and possibly FILED must
 * not shift under the user's feet if a library or calendar update changes the mapping later. So
 * the stored due date is authoritative once written. Recomputation happens only through an
 * explicit, audited administrative action — which writes a NEW `Deadline` revision, links
 * `recomputedFromId`, and logs before/after. No background job ever rewrites the due dates."*
 *
 * Measured before migration 38, `deadline` had NOT ONE guard: any UPDATE moved a due date
 * silently, DELETE erased statutory history, and nothing demanded the window-as-applied snapshot
 * that makes a stored date defensible later.
 *
 * ── EVERY REFUSAL IS DRIVEN AS THE APPLICATION ROLE, AND THE `ENABLE ALWAYS` PAIR AS THE
 *    MIGRATOR TOO ── a guard the migrator can bypass is a convention, not a control.
 * ── AND EVERY REFUSAL IS PAIRED WITH THE THING IT MUST STILL PERMIT (the S8 liveness lesson) ──
 * `escalatedAt`, `satisfiedAt`'s FIRST write, `complianceTaskId` binding and soft-delete all
 * still move; a recompute ROW still inserts. A freeze that freezes the lifecycle too is an
 * outage that reads as a working control.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  closeDatabase,
  databaseModule,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S9-2 deadline frozen contract (§09 Engine B, migration 38)');

const WAQF = 'waqf-001';
const ID = 'test-deadline-frozen-001';
const RECOMPUTE_ID = 'test-deadline-frozen-002';
const RECOMPUTE_ID_2 = 'test-deadline-frozen-003';
const MET_ID = 'test-deadline-met-001';

/** The window AS APPLIED — the §09 snapshot shape `computeRuleDeadline` produces. */
const SNAPSHOT = {
  settingKey: 'deadline.ISTIBDAL_10BD.businessDays',
  basis: 'business_days',
  amount: 10,
  roll: 'following',
  unverified: true,
} as const;

async function createRow(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const db = await databaseModule();
  const ctx = db.makeSystemContext({ actorId: 'test-deadline', requestId: `test-deadline-${id}` });
  const client = db.createPrismaClient(ctx);
  await db.withAudit(client, async (tx) => {
    await tx.deadline.create({
      data: {
        id,
        waqfId: WAQF,
        ruleKey: 'ISTIBDAL_10BD',
        anchorDate: new Date('2026-05-10T00:00:00.000Z'),
        anchorDateHijri: '1447-11-23',
        dueDate: new Date('2026-05-26T00:00:00.000Z'),
        dueDateHijri: '1447-12-09',
        windowSnapshot: SNAPSHOT,
        ...extra,
      },
    });
  });
}

async function deleteProbes(): Promise<void> {
  // The no-delete guard is ENABLE ALWAYS, so even cleanup cannot DELETE — probe rows are
  // soft-deleted (the guard's own sanctioned path) and given unique ids per run… except ids here
  // are fixed, so a PREVIOUS run's rows may exist. The premise assertions below tolerate that by
  // creating only when absent.
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    privilegedSql(
      `UPDATE "deadline" SET "deletedAt" = now() WHERE "id" IN
         ('${ID}','${RECOMPUTE_ID}','${RECOMPUTE_ID_2}','${MET_ID}') AND "deletedAt" IS NULL`,
    ),
  );
}

describe.skipIf(!hasDatabase)('the deadline row is §09-frozen (migration 38)', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    const raw = await privilegedPrisma();
    // Fixed ids + no-delete guard ⇒ a re-run finds last run's rows. Start from a clean logical
    // slate: hard state is immutable anyway; only presence matters, so create-if-absent.
    const existing = await raw.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "deadline" WHERE "id" = '${ID}'`,
    );
    if (existing.length === 0) await createRow(ID);
  });

  afterAll(async () => {
    await deleteProbes();
    await closeDatabase();
  });

  /* ── 1 · provenance is demanded at birth ──────────────────────────────────────────────── */

  it('an INSERT without the window-as-applied snapshot is refused — for the app role AND the migrator', async () => {
    await expect(
      createRow('test-deadline-no-snapshot', { windowSnapshot: undefined }),
    ).rejects.toThrow(/must record the window AS APPLIED/);
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `INSERT INTO "deadline"
             ("id","waqfId","ruleKey","anchorDate","anchorDateHijri","dueDate","dueDateHijri","updatedAt")
           VALUES ('test-deadline-no-snapshot','${WAQF}','ISTIBDAL_10BD',now(),'1447-01-01',now(),'1447-01-01',now())`,
        ),
      ),
    ).rejects.toThrow(/must record the window AS APPLIED/);
  });

  /* ── 2 · the computed identity is frozen ──────────────────────────────────────────────── */

  it('moving the due date is refused — app role and migrator alike, and the frozen twin too', async () => {
    const raw = await privilegedPrisma();
    for (const column of ['dueDate', 'anchorDate'] as const) {
      await expect(
        raw.$executeRawUnsafe(
          privilegedSql(`UPDATE "deadline" SET "${column}" = now() WHERE "id" = '${ID}'`),
        ),
      ).rejects.toThrow(/FROZEN once written/);
    }
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`UPDATE "deadline" SET "dueDateHijri" = '1447-12-10' WHERE "id" = '${ID}'`),
      ),
    ).rejects.toThrow(/FROZEN once written/);
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "deadline" SET "windowSnapshot" = '{"amount": 11}'::jsonb WHERE "id" = '${ID}'`,
        ),
      ),
    ).rejects.toThrow(/FROZEN once written/);
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`UPDATE "deadline" SET "ruleKey" = 'REGISTER_30BD' WHERE "id" = '${ID}'`),
      ),
    ).rejects.toThrow(/FROZEN once written/);
  });

  it('back-filling recompute lineage onto an existing row is refused — NULL is part of the frozen identity', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "deadline" SET "recomputedFromId" = '${RECOMPUTE_ID}' WHERE "id" = '${ID}'`,
        ),
      ),
    ).rejects.toThrow(/FROZEN once written/);
  });

  /* ── 3 · the recompute path is a NEW row, and the lineage is a chain ──────────────────── */

  it('a correction inserts a NEW row linking recomputedFromId; a SECOND claimant on the same predecessor is refused', async () => {
    const raw = await privilegedPrisma();
    const existing = await raw.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "deadline" WHERE "id" = '${RECOMPUTE_ID}'`,
    );
    if (existing.length === 0) {
      await createRow(RECOMPUTE_ID, { recomputedFromId: ID });
    }
    // Two "current" corrections of one deadline would both claim to be the date on file.
    await expect(createRow(RECOMPUTE_ID_2, { recomputedFromId: ID })).rejects.toThrow(
      /Unique constraint|deadline_recomputedFromId_key/,
    );
  });

  /* ── 4 · lifecycle facts: write-once, and the contradiction is unrepresentable ────────── */

  it('satisfiedAt writes ONCE (liveness first), then never rewrites, and a met row cannot be waived', async () => {
    // ⊕ S11-2 (migration 49): a met row carries its KIND — `satisfiedAt` alone is now refused by
    // `deadline_discharge_kind_pairs_with_met`, so the liveness write is the PAIR, as every writer writes it.
    const raw = await privilegedPrisma();
    const existing = await raw.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "deadline" WHERE "id" = '${MET_ID}'`,
    );
    if (existing.length === 0) await createRow(MET_ID);

    // LIVENESS: the entitled first write works (idempotent across re-runs via WHERE IS NULL).
    await raw.$executeRawUnsafe(
      privilegedSql(
        `UPDATE "deadline" SET "satisfiedAt" = '2026-05-20T00:00:00Z', "dischargeKind" = 'MET',
                "satisfiedEvidenceId" = 'test-evidence-1'
          WHERE "id" = '${MET_ID}' AND "satisfiedAt" IS NULL`,
      ),
    );
    // Write-once: rewriting the fact, or its evidence, is refused.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`UPDATE "deadline" SET "satisfiedAt" = now() WHERE "id" = '${MET_ID}'`),
      ),
    ).rejects.toThrow(/recorded satisfaction is write-once/);
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "deadline" SET "satisfiedEvidenceId" = 'test-evidence-2' WHERE "id" = '${MET_ID}'`,
        ),
      ),
    ).rejects.toThrow(/recorded satisfaction is write-once/);
    // Met ∧ waived is unrepresentable AT REST — the CHECK, before any trigger opinion.
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "deadline" SET "waivedAt" = now(), "waivedReason" = 'x' WHERE "id" = '${MET_ID}'`,
        ),
      ),
    ).rejects.toThrow(/deadline_state_coherent/);
  });

  it('the waiver pair travels together, and evidence cannot free-float without a met fact', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`UPDATE "deadline" SET "waivedAt" = now() WHERE "id" = '${ID}'`),
      ),
    ).rejects.toThrow(/deadline_waiver_pair/);
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "deadline" SET "satisfiedEvidenceId" = 'test-evidence-x' WHERE "id" = '${ID}'`,
        ),
      ),
    ).rejects.toThrow(/deadline_evidence_with_met/);
  });

  /* ── 5 · the lifecycle the freeze must still PERMIT (liveness) ─────────────────────────── */

  it('escalatedAt, the task binding and soft-delete still move — a freeze is not an outage', async () => {
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      privilegedSql(`UPDATE "deadline" SET "escalatedAt" = now() WHERE "id" = '${ID}'`),
    );
    await raw.$executeRawUnsafe(
      privilegedSql(
        `UPDATE "deadline" SET "complianceTaskId" = 'test-task-ref' WHERE "id" = '${ID}'`,
      ),
    );
    await raw.$executeRawUnsafe(
      privilegedSql(`UPDATE "deadline" SET "deletedAt" = now() WHERE "id" = '${ID}'`),
    );
    // And back out of soft-delete, so re-runs see a live row.
    await raw.$executeRawUnsafe(
      privilegedSql(`UPDATE "deadline" SET "deletedAt" = NULL WHERE "id" = '${ID}'`),
    );
  });

  /* ── 6 · a deadline is evidence: no DELETE, no TRUNCATE, for anyone ───────────────────── */

  it('DELETE and TRUNCATE are refused for the migrator too (migration 8, ENABLE ALWAYS)', async () => {
    const raw = await privilegedPrisma();
    // Migration 8's guards, not this stage's — S9-2's first draft re-declared them and the
    // census caught the duplicate. Asserted here anyway: the freeze story is incomplete if the
    // rows it froze could be erased.
    await expect(
      raw.$executeRawUnsafe(privilegedSql(`DELETE FROM "deadline" WHERE "id" = '${ID}'`)),
    ).rejects.toThrow(/DELETE on "deadline" is refused/);
    await expect(raw.$executeRawUnsafe(privilegedSql(`TRUNCATE "deadline"`))).rejects.toThrow(
      /TRUNCATE|refused/,
    );
  });
});
