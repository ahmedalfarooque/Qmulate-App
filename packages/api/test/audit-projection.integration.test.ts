// QMULATE — C-08: A NARROW `select` ON AN AUDITED UPDATE MAKES THE TRAIL LIE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, AND WHY ROUND 1 DID NOT CLOSE IT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `@qmulate/database`'s audit extension builds an event's PRE-image with `findFirst({ where })` —
// a whole row — and its POST-image from the write's own return value. `diffChangedKeys` then walks
// the union of both key sets and reads a key that is absent from the post-image as `null`.
//
// So a `select` on an audited `update` makes the audit event state, in the append-only table, that
// every column the projection dropped was SET TO NULL. It set none of them. The hash chain seals
// that as authentic evidence for ≥ 10 years.
//
// Round 1 deleted the one `select` that had already lied (`approval.approve`) and pinned the
// resulting key set. That closed one call site. The COERCION IS STILL THERE — it lives in
// `packages/database`, which this owner may not touch — so the next narrow `select` anywhere in the
// API re-creates the falsehood, and nothing would notice.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE PROVES
// ═══════════════════════════════════════════════════════════════════════════════════════════
//  1. REPRODUCTION — the defect is REAL, TODAY, on the shipped extension, and WORSE than "a few
//     columns go missing": a narrow-`select` `setting.update` writes an audit event claiming that
//     `createdAt`, `createdBy`, `key`, `waqfId` AND `value` were all set to null — i.e. that the
//     write WIPED the row. It changed one column. Observed from INSIDE the transaction and then
//     ROLLED BACK, so this suite proves
//     the falsehood without committing one (`audit_event` is append-only: an event written here
//     could never be removed, and a sibling assertion sweeps the table for exactly this shape).
//  2. BLOCKED — the same operation through `auditedWrite()` raises `UnauditableProjectionError`
//     BEFORE anything executes: no row changed, no audit event written.
//  3. NOT VACUOUS — the same update WITHOUT a projection succeeds through the same door, and its
//     audit event names EXACTLY the column that moved.
//  4. `include` and `omit` are refused too (the same defect, mirrored and repeated).
//  5. `create` is NOT refused — a create has no pre-image, so a projection there cannot produce a
//     false diff, and two shipped call sites use one deliberately to keep PII out of a ten-year
//     table. A guard that broke them would trade a privacy control for a diff bug.
//
// The mutation this file is written against: delete the `assertAuditableProjection(...)` call from
// `auditedTx`'s inner Proxy in `src/middleware/audit-projection.ts`. Tests 2 and 4 then fail.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withAudit, type ExtendedPrismaClient } from '@qmulate/database';

import {
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  purgeCreatedSettingRows,
  warnNoDatabase,
} from './setup.js';

import { ROLE_PRESETS } from '../src/index.js';
import {
  DIFFED_WRITE_OPERATIONS,
  PROJECTION_ARG_KEYS,
  UnauditableProjectionError,
  auditedTx,
  auditedWrite,
} from '../src/middleware/audit-projection.js';

warnNoDatabase('C-08 — a projected audited update cannot reach the trail');

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects and the row under test
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `p-` = projection. A distinct namespace so this file's rows never collide with another's. */
const NAZIR = 'user-test-api-p-nazir';

const WAQF_A = 'waqf-001';
const PERCENT_KEY = 'nazirFee.percentOfRevenue';

/**
 * The SEEDED per-endowment fee override. Chosen deliberately:
 *  · `Setting` is an AUDITED model, and `setting.update` is a real request-path write (it is what
 *    `settings.set` performs through the resolver), so this is the shape a future narrow `select`
 *    would actually take — not a contrived model nobody writes;
 *  · it is NOT `ApprovalRequest`, whose update events `approval-authority.integration.test.ts`
 *    sweeps for exactly this falsehood. Committing a reproduction there would turn a sibling
 *    assertion red — permanently, because the trail cannot be tidied up.
 */
const ROW_ID = `setting-${WAQF_A}-${PERCENT_KEY}`;

/** The envelope shape `nazirFee.percentOfRevenue` requires. ⚠ the FIGURE is unverified (rule 3). */
function feeEnvelope(v: number): Record<string, unknown> {
  return {
    v,
    unit: 'percent',
    unverified: true,
    note: '⚠ unverified — confirm vs primary law',
    source: 'waqf deed (C-08 projection exercise)',
  };
}

/** Raised inside the reproduction to roll the whole transaction back. */
class RollbackSentinel extends Error {
  override readonly name = 'RollbackSentinel';
}

interface SettingRow {
  readonly id: string;
  readonly key: string;
  readonly waqfId: string | null;
  readonly value: unknown;
}

async function readRow(id: string): Promise<SettingRow | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<SettingRow[]>(
    `SELECT "id", "key", "waqfId", "value" FROM "setting" WHERE "id" = $1`,
    id,
  );
  return rows[0] ?? null;
}

async function restoreRow(id: string, value: unknown): Promise<void> {
  const prisma = await basePrisma();
  await prisma.$executeRawUnsafe(
    `UPDATE "setting" SET "value" = $2::jsonb WHERE "id" = $1`,
    id,
    JSON.stringify(value),
  );
}

interface AuditRow {
  readonly event_id: string;
  readonly action: string;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
}

/**
 * ⚠ THE ALIAS IS `event_id`, NOT `id`, AND THAT IS LOAD-BEARING.
 *
 * PostgreSQL resolves `ORDER BY <name>` against the SELECT list's OUTPUT columns before the input
 * ones. `SELECT "id"::text AS id … ORDER BY "id" DESC` therefore sorts the **text** cast, so
 * `audit_event` 99 outranks 132 — and "the latest event" silently became "the one whose id sorts
 * highest as a string". This suite found that the honest way: the reproduction passed once, failed
 * the next run, and was reading a seeded CREATE event both times.
 */
const LATEST_SETTING_EVENT_SQL = `SELECT "id"::text AS event_id, "action"::text AS action, "before", "after"
     FROM "audit_event"
    WHERE "entityType" = 'Setting' AND "entityId" = $1
    ORDER BY "id" DESC
    LIMIT 1`;

async function countSettingEvents(entityId: string): Promise<number> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "audit_event" WHERE "entityType" = 'Setting' AND "entityId" = $1`,
    entityId,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * The highest `audit_event.id` in the table. Captured before an assertion so "the latest event for
 * this row" can be proven to be a NEW one rather than a seeded `CREATE` that happens to match.
 */
async function maxAuditEventId(): Promise<bigint> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<{ n: bigint | null }[]>(
    `SELECT max("id") AS n FROM "audit_event"`,
  );
  return rows[0]?.n === null || rows[0]?.n === undefined ? 0n : BigInt(String(rows[0].n));
}

async function latestSettingEvent(entityId: string): Promise<AuditRow | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<AuditRow[]>(LATEST_SETTING_EVENT_SQL, entityId);
  return rows[0] ?? null;
}

/** A fresh request-scoped client for the Nazir — real grants, real force filter, real audit. */
async function nazirDb(requestId: string): Promise<ExtendedPrismaClient> {
  const ctx = await contextFor({ userId: NAZIR, requestId });
  return ctx.db;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The suite
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('C-08 · a projected audited write cannot reach the trail', () => {
  let originalValue: unknown;

  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      { id: NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: ROLE_PRESETS.nazir },
    ]);

    const row = await readRow(ROW_ID);
    if (row === null) {
      throw new Error(
        `Setting row "${ROW_ID}" is absent. It is seeded by packages/database/src/seed/settings.ts ` +
          `(the waqf-001 fee override). This suite refuses to create it: a test that provisions its ` +
          `own precondition proves nothing about the shipped configuration.`,
      );
    }
    originalValue = row.value;
  });

  afterAll(async () => {
    // The seeded row is restored byte-for-byte: a sibling suite compares ABSOLUTE Setting counts and
    // asserts every row carries a consistent ⚠ marker.
    if (originalValue !== undefined) await restoreRow(ROW_ID, originalValue);
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 1 · REPRODUCTION — observed inside the transaction, then rolled back
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('REPRODUCTION · a narrow `select` makes the audit event claim the WHOLE ROW was nulled', async () => {
    const db = await nazirDb('c08-reproduce');
    const baseline = await maxAuditEventId();
    let observed: AuditRow | null = null;

    // ⚠ RAW `withAudit`, ON PURPOSE. This is the door the repair closes; calling it here is how the
    // defect gets DRIVEN rather than described. The lint rule that bans this import applies to
    // `src/**`, not to a test whose whole job is to prove why the ban exists.
    await expect(
      withAudit(db, async (tx) => {
        await tx.setting.update({
          where: { id: ROW_ID },
          data: { value: feeEnvelope(11) },
          // THE DEFECT. A perfectly ordinary-looking projection: "I only need the id back."
          select: { id: true },
        });

        // Read the event the extension just appended, from INSIDE the transaction — reads in a
        // `withAudit` block see the block's own uncommitted writes.
        const rows = await tx.$queryRawUnsafe<AuditRow[]>(LATEST_SETTING_EVENT_SQL, ROW_ID);
        observed = rows[0] ?? null;

        // ROLL EVERYTHING BACK. `audit_event` is append-only by database trigger, so an event
        // committed here could never be deleted — and it would be a permanent, hash-sealed lie in
        // the evidence table. A rollback is the only honest way to reproduce this.
        throw new RollbackSentinel('reproduction complete — rolling back');
      }),
    ).rejects.toThrow(RollbackSentinel);

    const event = observed as AuditRow | null;
    expect(
      event,
      'no Setting audit event was appended — the reproduction read the wrong thing',
    ).not.toBeNull();
    // It is THIS write's event, not a seeded CREATE that happens to share the entityId. Without this
    // the whole reproduction can pass or fail on which event id sorts highest.
    expect(BigInt(event?.event_id ?? '0') > baseline).toBe(true);
    expect(event?.action).toBe('UPDATE');

    const after = (event?.after ?? {}) as Record<string, unknown>;
    const before = (event?.before ?? {}) as Record<string, unknown>;

    // THE WRITE MOVED ONE COLUMN: `value`. The event claims FIVE moved.
    expect(Object.keys(after).sort()).toEqual(['createdAt', 'createdBy', 'key', 'value', 'waqfId']);

    // THE LIE, in the two columns that identify which figure this row even is.
    expect(after['key'], 'the trail says `key` was set to null').toBeNull();
    expect(before['key']).toBe(PERCENT_KEY);
    expect(after['waqfId'], 'the trail says `waqfId` was set to null').toBeNull();
    expect(before['waqfId']).toBe(WAQF_A);
    // …and the row's own creation instant, erased.
    expect(after['createdAt']).toBeNull();
    expect(before['createdAt']).not.toBeNull();

    // ⚠ AND THE COLUMN THAT DID MOVE IS ALSO REPORTED AS NULL. The write set `value` to a new
    // envelope; the event says it was NULLED. So the trail does not merely lose four columns — it
    // records a whole-row WIPE that never happened, on the row that carries this endowment's Nazir
    // fee basis, hash-sealed, in the evidence table.
    expect(before['value']).not.toBeNull();
    expect(
      after['value'],
      'the trail says `value` was set to null; it was set to a new envelope',
    ).toBeNull();

    // And nothing survived: the rollback took the row change AND the event with it.
    expect(await readRow(ROW_ID)).toEqual(
      expect.objectContaining({ key: PERCENT_KEY, waqfId: WAQF_A, value: originalValue }),
    );
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 2 · BLOCKED — refused before anything executes
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('BLOCKED · the same operation through `auditedWrite` is refused, and writes NOTHING', async () => {
    const db = await nazirDb('c08-blocked');
    const eventsBefore = await countSettingEvents(ROW_ID);

    await expect(
      auditedWrite(db, async (tx) => {
        await tx.setting.update({
          where: { id: ROW_ID },
          data: { value: feeEnvelope(12) },
          select: { id: true },
        });
      }),
    ).rejects.toThrow(UnauditableProjectionError);

    // The refusal is BEFORE execution, so the row is untouched and no event exists to be wrong.
    expect((await readRow(ROW_ID))?.value).toEqual(originalValue);
    expect(await countSettingEvents(ROW_ID)).toBe(eventsBefore);
  });

  it('BLOCKED · the refusal NAMES the projection and says what to do instead', async () => {
    const db = await nazirDb('c08-message');
    let thrown: unknown;
    try {
      await auditedWrite(db, (tx) =>
        tx.setting.update({
          where: { id: ROW_ID },
          data: { value: feeEnvelope(13) },
          select: { id: true },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnauditableProjectionError);
    const error = thrown as UnauditableProjectionError;
    expect(error.code).toBe('UNAUDITABLE_PROJECTION');
    expect(error.model).toBe('Setting');
    expect(error.operation).toBe('update');
    expect(error.projections).toEqual(['select']);
    // A refusal a reader cannot act on gets "fixed" by deleting the guard.
    expect(error.message).toContain('SET TO NULL');
    expect(error.message).toContain('FIX: drop the projection');
  });

  it('BLOCKED · `include` and `omit` are refused too — the same defect, mirrored', async () => {
    const db = await nazirDb('c08-include-omit');

    await expect(
      auditedWrite(db, (tx) =>
        tx.setting.update({
          where: { id: ROW_ID },
          data: { value: feeEnvelope(14) },
          // Widens the post-image with a relation the pre-image never had: the diff then reports
          // `waqf` as a column that changed FROM null.
          include: { waqf: true },
        }),
      ),
    ).rejects.toThrow(UnauditableProjectionError);

    await expect(
      auditedWrite(db, (tx) =>
        (
          tx.setting as unknown as {
            update(args: unknown): Promise<unknown>;
          }
        ).update({
          where: { id: ROW_ID },
          data: { value: feeEnvelope(15) },
          omit: { createdBy: true },
        }),
      ),
    ).rejects.toThrow(UnauditableProjectionError);

    expect((await readRow(ROW_ID))?.value).toEqual(originalValue);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 3 · NOT VACUOUS — the unprojected write succeeds and its diff is exact
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('NOT VACUOUS · without a projection the write succeeds and the diff names ONLY `value`', async () => {
    const db = await nazirDb('c08-honest');
    const baseline = await maxAuditEventId();

    await auditedWrite(db, async (tx) => {
      await tx.setting.update({
        where: { id: ROW_ID },
        data: { value: feeEnvelope(9) },
      });
    });

    const event = await latestSettingEvent(ROW_ID);
    expect(event, 'the honest write produced no audit event').not.toBeNull();
    expect(BigInt(event?.event_id ?? '0') > baseline).toBe(true);
    expect(event?.action).toBe('UPDATE');

    const after = (event?.after ?? {}) as Record<string, unknown>;
    const before = (event?.before ?? {}) as Record<string, unknown>;

    // EXACTLY the column that moved. `updatedAt` is in the extension's ignore list; every other
    // column compared equal because the whole row came back, so it is simply not reported.
    expect(Object.keys(after).sort()).toEqual(['value']);
    expect(Object.keys(before).sort()).toEqual(['value']);

    // The three the false diff erased are not claimed to have changed, because they did not.
    for (const key of ['key', 'waqfId', 'createdAt', 'deletedAt']) {
      expect(key in after, `the diff claims ${key} changed; it did not`).toBe(false);
    }

    // The change really landed — a guard that quietly turned every write into a no-op would pass
    // every assertion above.
    expect((await readRow(ROW_ID))?.value).toEqual(
      expect.objectContaining({ v: 9, unverified: true }),
    );
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 4 · `create` IS EXEMPT — the privacy projections must keep working
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('a projected `create` is ALLOWED — no pre-image means no diff to falsify', async () => {
    const db = await nazirDb('c08-create-exempt');
    const baseline = await maxAuditEventId();
    const scopedKey = 'distribution.rounding.method';
    const createdId = `setting-${WAQF_A}-c08-${scopedKey}`;

    try {
      const created = await auditedWrite(db, (tx) =>
        tx.setting.create({
          data: {
            id: createdId,
            key: scopedKey,
            waqfId: WAQF_A,
            value: {
              v: 'HALF_UP',
              unit: 'rounding_mode',
              unverified: false,
              source: 'c08 exercise',
            },
          },
          // The deliberate projection `approval.initiate` and `activateGrant` both rely on: the
          // event records this result AS the after-image with NO diff, so an omitted column is
          // simply not reported rather than falsely reported as null.
          select: { id: true },
        }),
      );
      expect(created).toEqual({ id: createdId });

      const event = await latestSettingEvent(createdId);
      expect(event?.action).toBe('CREATE');
      expect(BigInt(event?.event_id ?? '0') > baseline).toBe(true);
      // `before` is null on a create, which is precisely why the projection is harmless here.
      expect(event?.before).toBeNull();
    } finally {
      // ⚠ WRAPPED SINCE `00000000000008_e2_retention_remainder`: hard `DELETE` on `setting` is now
      // refused outright, so this teardown declares the exemption instead of relying on a table with
      // no guard on it. `purgeCreatedSettingRows` disables and re-enables the trigger inside one
      // transaction; see its doc comment for why this row is safe to purge and a seeded one is not.
      await purgeCreatedSettingRows([createdId]);
    }
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 5 · the guard is wired into the door, not merely available next to it
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('`auditedTx` guards the handle itself — not just the one call site', async () => {
    // Round 1's failure mode was a repair that existed and was never wired. This asserts the wiring
    // directly: wrap a live client and prove the delegate that comes back is the guarded one.
    const db = await nazirDb('c08-wiring');
    const guarded = auditedTx(db);

    // ⚠ SYNCHRONOUS, and deliberately so: the guard throws when the delegate method is CALLED,
    // before a promise exists. That is the loudest available failure — it cannot be swallowed by a
    // missing `await`, which is exactly how a would-be guard becomes decorative.
    expect(() =>
      guarded.setting.update({
        where: { id: ROW_ID },
        data: { value: feeEnvelope(16) },
        select: { id: true },
      }),
    ).toThrow(UnauditableProjectionError);

    // …and a read is untouched: the guard is about the diffed WRITE operations only.
    const read = await guarded.setting.findFirst({
      where: { id: ROW_ID },
      select: { id: true, key: true },
    });
    expect(read).toEqual({ id: ROW_ID, key: PERCENT_KEY });

    expect(DIFFED_WRITE_OPERATIONS).toEqual(['update', 'upsert']);
    expect(PROJECTION_ARG_KEYS).toEqual(['select', 'include', 'omit']);
  });
});
