/**
 * R-3 · THE RESIDUAL A DELETE GUARD CANNOT REACH — a regulatory figure suppressed with no trail.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RESIDUAL, STATED WITHOUT DECORATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Migration 8 refuses hard `DELETE` on `setting`. The cheapest remaining way to make a regulatory
 * figure stop applying is:
 *
 *     UPDATE "setting" SET "deletedAt" = now() WHERE …
 *
 * Every reader filters `deletedAt: null` — `packages/api/src/context.ts` does it for the per-waqf
 * lookup and again for the global fallback — so a soft-deleted OVERRIDE vanishes from resolution and
 * the global value silently takes over, and a soft-deleted GLOBAL row makes the resolver fail closed.
 * Neither writes an audit event, because NOTHING in `src/**` writes `deletedAt` on `setting` at all:
 * the operation is necessarily raw today.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE PROVES, AND WHAT IT DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `qmulate_unaudited_setting_suppressions()` converts a SILENT suppression into a DETECTABLE one.
 * That is a DETECTION property, not a PREVENTION property, and the two must never be conflated: the
 * suppression is still PERMITTED, exactly as it was. Migration 8 §3 records why a trigger cannot write
 * the audit event instead (migration 6 §3's two blockers — it would fork the in-memory hash chain, and
 * it would need a second Umm al-Qura implementation plus a second canonicaliser, which ADR-0007
 * forbids for exactly the drift reason).
 *
 * ⚠ AND IT IS NOT A CONTROL UNTIL SOMETHING CALLS IT. This file calls it on every integration run,
 * which is a standing check in CI only. Wiring it into gate G-1's verifier or the reporting layer is
 * the follow-up that makes it operational, and that code is not owned here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FALSE NEGATIVE THIS FILE IS SHAPED BY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * "Audited" has to mean an event whose `after` payload carries a NON-NULL VALUE for `deletedAt`, not
 * one that merely has the KEY. A `Setting` CREATE event's `after` is the whole row, so it already
 * contains `"deletedAt": null` — measured on this database:
 *
 *     audit_event."after" for setting-classification.threshold.large.sar
 *       => { "id": …, "key": …, "value": {…}, "waqfId": null, "deletedAt": null, … }
 *
 * A key-presence predicate would therefore report EVERY setting ever created as having an audited
 * suppression. The `keyPresenceWouldBeAFalseNegative` case below asserts that measurement directly, so
 * the reasoning cannot quietly stop being true.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  hasDatabase,
  retentionRemainderScaffoldingSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('R-3 — an unaudited Setting suppression is detectable');

const TEST_ACTOR_ID = 'user-setting-suppression-harness';

/**
 * ⚠ ONE PROBE PER ENDOWMENT, ALL ON THE SAME KEY, AND BOTH HALVES OF THAT ARE DELIBERATE.
 *
 * `setting` carries `UNIQUE ("waqfId", "key")`, and the fixture already ships one override —
 * `waqf-001` → `nazirFee.percentOfRevenue`. Three probes on `waqf-001` would collide with each other
 * or with the fixture (measured: 23505 on the first attempt), and a probe that fails to be CREATED
 * makes every assertion about it vacuous. Distinct endowments remove that whole class of accident.
 *
 * The KEY is the same for all three, and it is `nazirFee.percentOfRevenue` on purpose: the Nazir fee
 * is deed-set (Art. 11) and this engagement's deed sets 10% of revenue (customary ʿushr) — ⚠ unverified
 * against primary Saudi law. Suppressing that override is the sharpest instance of the residual: the
 * resolver silently falls back to the global figure and the endowment's fee basis changes with nothing
 * recording it.
 */
const RAW_WAQF = 'waqf-002';
const AUDITED_WAQF = 'waqf-003';
const UNTOUCHED_WAQF = 'waqf-004';
const PROBE_KEY = 'nazirFee.percentOfRevenue';

/** Soft-deleted through the AUDITED path — must NOT be reported. */
const AUDITED_ROW = 'setting-9001-audited-suppression';
/** Soft-deleted through a raw UPDATE — MUST be reported. */
const RAW_ROW = 'setting-9002-raw-suppression';
/** Never suppressed at all — must NOT be reported, so "everything is reported" cannot pass. */
const UNTOUCHED_ROW = 'setting-9003-untouched';

const PROBE_IDS = [AUDITED_ROW, RAW_ROW, UNTOUCHED_ROW] as const;

interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

interface Suppression {
  readonly setting_id: string;
  readonly setting_key: string;
  readonly waqf_id: string | null;
  readonly tier: string;
  readonly events_naming_setting: bigint;
}

describe.skipIf(!hasDatabase)('R-3 · unaudited Setting suppression is detectable', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const suppressions = async (): Promise<Suppression[]> =>
    prisma.$queryRawUnsafe<Suppression[]>(`SELECT * FROM qmulate_unaudited_setting_suppressions()`);

  const reported = async (): Promise<string[]> =>
    (await suppressions()).map((row) => row.setting_id);

  /**
   * Removes the probe rows.
   *
   * ⚠ THROUGH THE SCAFFOLDING WRAPPER, because migration 8 refuses hard `DELETE` on `setting`
   * outright. That is the honest demonstration of the residual, not a workaround: `ALTER TABLE …
   * DISABLE TRIGGER` needs table OWNERSHIP, and on Railway the runtime connects AS THE OWNER
   * (ADR-0008, deferred to E12). One `DO` block = one statement = one transaction, so a raise rolls
   * the DISABLE back and the guard is never left off.
   */
  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      retentionRemainderScaffoldingSql(
        PROBE_IDS.map((id) => `DELETE FROM "setting" WHERE "id" = '${id}'`),
      ),
    );
  };

  /** Creates a per-waqf override through the AUDITED path, so a real CREATE event names it. */
  const auditedCreate = async (id: string, waqfId: string): Promise<void> => {
    const { makeSystemContext, withAudit } = db;
    await withAudit(
      makeSystemContext({
        actorId: TEST_ACTOR_ID,
        requestId: `r4-suppression-create-${id}`,
        reason: 'R-3 integration assertion',
      }),
      async (tx) => {
        const created = await tx.setting.create({
          data: {
            id,
            key: PROBE_KEY,
            waqfId,
            // The caveat travels with the figure: a ten-year record of a number that omits
            // "unverified against primary Saudi law" reads as settled law to whoever finds it.
            value: {
              v: '1.00',
              unit: 'percent',
              unverified: true,
              note: '⚠ unverified — confirm vs primary law (بيانات وهمية)',
            },
          },
        });
        // Not decoration: a `create` that silently produced nothing would make every later assertion
        // about this row vacuously true.
        if (created.id !== id) throw new Error(`the audited create did not write ${id}`);
      },
    );
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    db = await databaseModule();
    prisma = (await basePrisma()) as unknown as PrismaLike;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  it('the detection function exists and returns the documented shape', async () => {
    const [row] = await prisma.$queryRawUnsafe<{ proc: string | null }[]>(
      `SELECT to_regprocedure('qmulate_unaudited_setting_suppressions()')::text AS proc`,
    );
    expect(
      row?.proc,
      'the detection function is missing, so an unaudited suppression is not even findable',
    ).toBe('qmulate_unaudited_setting_suppressions()');
    // Called, not merely present. A function nobody can execute is not a check.
    await expect(suppressions()).resolves.toBeInstanceOf(Array);
  });

  it('the seeded database reports NO unaudited suppression', async () => {
    // The baseline. If this were non-empty the two cases below could not distinguish "detected" from
    // "already noisy", and the whole file would be untrustworthy.
    expect(
      await reported(),
      'the seeded fixture already contains a suppressed Setting with no audit event',
    ).toEqual([]);
  });

  it('a RAW soft-delete IS reported — the reproduction', async () => {
    await auditedCreate(RAW_ROW, RAW_WAQF);
    expect(await reported(), 'a live row was reported as suppressed').not.toContain(RAW_ROW);

    const [before] = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "audit_event"`,
    );

    // The residual, executed. Not rolled back: the detection has to be observed on a COMMITTED row,
    // because that is the state an operator would be looking at.
    const changed = await prisma.$executeRawUnsafe(
      `UPDATE "setting" SET "deletedAt" = now() WHERE "id" = '${RAW_ROW}'`,
    );
    expect(
      changed,
      'DEFECTIVE PROBE: the UPDATE matched no row, so nothing was suppressed. Round 3 caught this ' +
        'exact shape — an escalation targeting a row that already holds the target value is a no-op ' +
        'that reads as PERMITTED.',
    ).toBe(1);

    const [after] = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "audit_event"`,
    );
    expect(
      Number(after?.n ?? '0') - Number(before?.n ?? '0'),
      'the raw suppression wrote an audit event, which would mean the residual is closed — re-read ' +
        'migration 8 §3 and update it',
    ).toBe(0);

    // …and the figure really is gone as far as every reader is concerned.
    const [visible] = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "setting" WHERE "id" = '${RAW_ROW}' AND "deletedAt" IS NULL`,
    );
    expect(visible?.n, 'the row is still visible, so nothing was suppressed').toBe('0');

    const rows = await suppressions();
    const found = rows.find((row) => row.setting_id === RAW_ROW);
    expect(found, 'an unaudited suppression of a regulatory figure went undetected').toBeDefined();
    expect(found?.tier, 'the tier is what says whether one endowment or all of them changed').toBe(
      'endowment',
    );
    expect(found?.waqf_id).toBe(RAW_WAQF);
    // The count is what tells an operator the row is REAL rather than a stray: it was created
    // through the audited path, so at least the CREATE event names it.
    expect(Number(found?.events_naming_setting ?? 0)).toBeGreaterThan(0);
  });

  it('an AUDITED soft-delete is NOT reported — the positive control', async () => {
    // Without this the function could simply return every soft-deleted row and still pass the case
    // above. There is no shipped procedure that revokes a setting, so this exercises the path E11 has
    // yet to build: `withAudit()` + the ordinary delegate, which is what an audited unset would use.
    await auditedCreate(AUDITED_ROW, AUDITED_WAQF);

    const { makeSystemContext, withAudit } = db;
    await withAudit(
      makeSystemContext({
        actorId: TEST_ACTOR_ID,
        requestId: 'r4-suppression-audited-unset',
        reason: 'R-3 positive control — an audited suppression',
      }),
      async (tx) => {
        await tx.setting.update({
          where: { id: AUDITED_ROW },
          data: { deletedAt: new Date('2026-07-01T00:00:00.000Z') },
        });
      },
    );

    const [row] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
      `SELECT "deletedAt" FROM "setting" WHERE "id" = '${AUDITED_ROW}'`,
    );
    expect(
      row?.deletedAt,
      'DEFECTIVE PROBE: the audited update did not actually suppress the row, so "not reported" ' +
        'would be vacuous',
    ).not.toBeNull();

    expect(
      await reported(),
      'an AUDITED suppression was reported as unaudited. The function would then flag every ' +
        'legitimate unset E11 builds, which is how a detection check gets switched off.',
    ).not.toContain(AUDITED_ROW);

    // And the raw one is STILL reported in the same call, so the two branches are distinguished by
    // the trail rather than by which row happened to be queried.
    expect(await reported()).toContain(RAW_ROW);
  });

  it('a live, never-suppressed row is not reported', async () => {
    // The other direction of the same worry: a function that returned every `setting` row would pass
    // both cases above.
    await auditedCreate(UNTOUCHED_ROW, UNTOUCHED_WAQF);
    expect(await reported()).not.toContain(UNTOUCHED_ROW);
  });

  it('keyPresenceWouldBeAFalseNegative · a CREATE event already carries "deletedAt": null', async () => {
    // THE MEASUREMENT THE PREDICATE IS BUILT ON, asserted rather than described. `after` is the whole
    // row, so the KEY is always there. If a future change to `serializeForAudit` stopped emitting
    // null columns, this case goes red and the `->> 'deletedAt' IS NOT NULL` predicate should be
    // re-examined — the same reasoning migration 6 §3 recorded for `waqf_access_grant`.
    const rows = await prisma.$queryRawUnsafe<
      { hasKey: boolean; valueIsNull: boolean; action: string }[]
    >(
      `SELECT ("after" ? 'deletedAt')            AS "hasKey",
              (("after" ->> 'deletedAt') IS NULL) AS "valueIsNull",
              "action"::text                      AS action
         FROM "audit_event"
        WHERE "entityType" = 'Setting' AND "entityId" = $1 AND "action" = 'CREATE'
        ORDER BY "id" DESC LIMIT 1`,
      UNTOUCHED_ROW,
    );
    expect(
      rows[0]?.action,
      'no CREATE event for the probe row — the audited path did not run',
    ).toBe('CREATE');
    expect(
      rows[0]?.hasKey,
      'a CREATE event no longer carries the `deletedAt` key; the false-negative note in migration 8 ' +
        '§3 needs revisiting, but the predicate is still safe (it tests the VALUE)',
    ).toBe(true);
    expect(
      rows[0]?.valueIsNull,
      'a CREATE event carries a NON-NULL deletedAt, which would make every created row read as ' +
        'having an audited suppression — the predicate must be changed',
    ).toBe(true);
  });

  it.todo(
    'NOT CLOSED — `UPDATE "setting" SET "value" = …` is NOT governed at all. A raw update still ' +
      'rewrites a fee basis or a statutory window with no audit event, and unlike the suppression it ' +
      'is not even detectable after the fact: there is no "current state vs trail" invariant to check ' +
      'because the value legitimately changes over time. Closing it needs either the side ledger ' +
      'migration 6 §3 surfaced (a table outside the hash chain, outside `public` so Prisma sees no ' +
      'drift) or E12’s privilege separation. SURFACED, NOT TAKEN — it is an architecture decision ' +
      'about what the evidence pack contains and what PDPL applies to.',
  );

  it.todo(
    'NOT A CONTROL UNTIL SOMETHING CALLS IT — this file is the only caller, so the check runs in CI ' +
      'and nowhere else. Wire `qmulate_unaudited_setting_suppressions()` into gate G-1’s verifier ' +
      '(packages/database/src/**) or the reporting layer so a suppression nobody authorised is SEEN ' +
      'rather than merely findable. Same follow-up migration 6 §3 recorded for ' +
      '`qmulate_unaudited_grant_suppressions()`.',
  );
});
