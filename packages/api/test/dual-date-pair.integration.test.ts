/**
 * V-E3-M1 — **THE HIJRI HALF OF A DUAL DATE IS DERIVED, NOT TRUSTED.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS MEASURED, BEFORE THE FIX
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `classification.reclassify` and `endowment.update` accepted `atHijri` / `certificateExpiryHijri`
 * from the caller on a `\d{4}-\d{2}-\d{2}` regex and never compared it against the server-derived
 * `toHijriSnapshot(at)` that four other write paths already use. Driven through
 * `appRouter.createCaller` on a real database at `f823365`:
 *
 *   classification.reclassify({ waqfId: 'waqf-004', to: 'SMALL',
 *                               at: '2026-08-13T00:00:00.000Z', atHijri: '1300-01-01' })
 *     → ACCEPTED. Read back from `reclassification_event`:
 *         cmsvoanwx0003n55zfvnrz7bl  at=2026-08-13T00:00:00.000Z  atHijri=1300-01-01
 *       The derived snapshot is `1448-02-30`. That is a ~700-year discrepancy, in the append-only
 *       BR-104 record the regulator reads, on a table that refuses UPDATE, DELETE and TRUNCATE —
 *       so the corrective edit is refused too and the row is wrong for good.
 *   endowment.update({ certificateExpiry: '2026-08-13T00:00:00.000Z',
 *                      certificateExpiryHijri: '1300-01-01' })
 *     → ACCEPTED.
 *
 * ⚠ AN AUDIT WAS RUN BEFORE THE FIX WAS WRITTEN, over every stored dual-date pair on a freshly
 * migrated + seeded database (`reclassification_event.at/atHijri`, `waqf.registrationDate`,
 * `waqf.certificateExpiry`, `waqf.reversionRecordedAt`, `approval_request.decidedAt`):
 * **0 mismatched pairs out of 8 rows carrying both halves.** Had any existed, they would have gone
 * to the owner untouched — an append-only table is not a cleanup script's to correct.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ONE HIJRI IMPLEMENTATION (ADR-0007 / D-4)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The fix adds no second converter, no tolerance and no arithmetic: `src/dual-date.ts` calls
 * `@qmulate/domain`'s `toHijriSnapshot` — the same function the four other write paths call — and
 * requires byte equality. This suite derives its EXPECTED values the same way, so it is testing the
 * comparison rather than restating a table of dates.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

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

warnNoDatabase('V-E3-M1 (dual dates are validated as a PAIR)');

const createCaller = createCallerFactory(appRouter);

/** A CASE_MANAGER on waqf-002 — `endowment:waqf:read|write`, the maker rung both paths sit on. */
const MAKER = `${API_TEST_PREFIX}m1-maker`;

/**
 * ⚠ waqf-002, NOT waqf-004. `endowment-record.integration.test.ts` reclassifies waqf-004 and
 * restores it; two files moving one endowment's class in one run is an ordering dependency nobody
 * would see until it broke. Every assertion here that would APPEND to the history is a REFUSAL, so
 * this file writes no `reclassification_event` row at all — see the note on the positive control.
 */
const SUBJECT_WAQF = 'waqf-002';

/** A Gregorian instant and its TRUE snapshot, derived — never a literal. */
const AT = new Date('2026-08-13T00:00:00.000Z');
const TRUE_HIJRI = String(toHijriSnapshot(AT));
/** The measured wrong value: ~700 years out, and shaped exactly like a valid one. */
const WRONG_HIJRI = '1300-01-01';

describe.skipIf(!hasDatabase)('V-E3-M1 · a dual date is validated as a PAIR', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: MAKER,
        role: 'CASE_MANAGER',
        waqfIds: [SUBJECT_WAQF],
        permissions: ['endowment:waqf:read', 'endowment:waqf:write'],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  it('the probe is not vacuous: the wrong value is well-formed and really is wrong', () => {
    // Without this, a refusal could be the REGEX rejecting a malformed string rather than the pair
    // check rejecting a wrong date — two different guards, one of which already existed.
    expect(WRONG_HIJRI).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TRUE_HIJRI).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(WRONG_HIJRI).not.toBe(TRUE_HIJRI);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * classification.reclassify — the append-only one
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('reclassify REFUSES a mismatched pair, names both values, and writes NOTHING', async () => {
    const prisma = await basePrisma();
    const before = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "reclassification_event" WHERE "waqfId" = $1`,
      SUBJECT_WAQF,
    );

    const ctx = await contextFor({ userId: MAKER, requestId: 'm1-reclassify-mismatch' });
    let thrown: unknown;
    try {
      await createCaller(ctx).classification.reclassify({
        waqfId: SUBJECT_WAQF,
        to: 'MEDIUM',
        reason: `V-E3-M1: a Hijri half ~700 years from its Gregorian one (بيانات وهمية)`,
        at: AT.toISOString(),
        atHijri: WRONG_HIJRI,
      });
    } catch (error) {
      thrown = error;
    }

    const message = String((thrown as Error | undefined)?.message);
    expect(message).toContain('DUAL_DATE_MISMATCH');
    // BOTH values in the message. A refusal that says only "invalid" leaves the operator guessing
    // which half is wrong, and the two halves are edited on different screens.
    expect(message).toContain(WRONG_HIJRI);
    expect(message).toContain(TRUE_HIJRI);

    // ⚠ "REFUSED" AND "REFUSED BEFORE ANY WRITE" ARE DIFFERENT CLAIMS, and on an append-only table
    // only the second one is worth anything. Asserted on the ROW COUNT, not on the throw.
    const after = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "reclassification_event" WHERE "waqfId" = $1`,
      SUBJECT_WAQF,
    );
    expect(Number(after[0]?.n ?? -1)).toBe(Number(before[0]?.n ?? -2));

    // And the column did not move either.
    const current = await createCaller(
      await contextFor({ userId: MAKER, requestId: 'm1-reclassify-check' }),
    ).classification.get({ waqfId: SUBJECT_WAQF });
    expect(current.current).toBe('SMALL');
  }, 120_000);

  it('reclassify REFUSES a Gregorian instant outside the Umm-al-Qura table', async () => {
    // `toHijriSnapshot` throws a RangeError outside its window. That must surface as a NAMED refusal
    // rather than an unhandled 500 — a caller can reach it with any parseable ISO date.
    const ctx = await contextFor({ userId: MAKER, requestId: 'm1-reclassify-range' });
    let thrown: unknown;
    try {
      await createCaller(ctx).classification.reclassify({
        waqfId: SUBJECT_WAQF,
        to: 'MEDIUM',
        reason: 'V-E3-M1: a date outside the Umm-al-Qura window (بيانات وهمية)',
        at: '1600-01-01T00:00:00.000Z',
        atHijri: '1008-01-01',
      });
    } catch (error) {
      thrown = error;
    }
    const message = String((thrown as Error | undefined)?.message);
    expect(message).toContain('HIJRI_OUT_OF_RANGE');
    expect(message).toContain('REFUSED rather than approximated');
    // ⚠ The window is quoted in CIVIL dates, which is the unit the caller supplied. An earlier draft
    // of this refusal answered a Gregorian complaint with a Hijri year range, which reads like a
    // different error entirely.
    expect(message).toContain('1882-11-12');
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * endowment.update — the correctable one, held to the same rule
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('endowment.update REFUSES a mismatched certificate-expiry pair and leaves the row alone', async () => {
    const prisma = await basePrisma();
    const before = await prisma.$queryRawUnsafe<
      { certificateExpiry: Date | null; certificateExpiryHijri: string | null }[]
    >(
      `SELECT "certificateExpiry", "certificateExpiryHijri" FROM "waqf" WHERE "id" = $1`,
      SUBJECT_WAQF,
    );

    const ctx = await contextFor({ userId: MAKER, requestId: 'm1-update-mismatch' });
    let thrown: unknown;
    try {
      await createCaller(ctx).endowment.update({
        waqfId: SUBJECT_WAQF,
        certificateExpiry: AT.toISOString(),
        certificateExpiryHijri: WRONG_HIJRI,
      });
    } catch (error) {
      thrown = error;
    }
    expect(String((thrown as Error | undefined)?.message)).toContain('DUAL_DATE_MISMATCH');

    const after = await prisma.$queryRawUnsafe<
      { certificateExpiry: Date | null; certificateExpiryHijri: string | null }[]
    >(
      `SELECT "certificateExpiry", "certificateExpiryHijri" FROM "waqf" WHERE "id" = $1`,
      SUBJECT_WAQF,
    );
    expect(after[0]?.certificateExpiryHijri ?? null).toBe(
      before[0]?.certificateExpiryHijri ?? null,
    );
    expect(after[0]?.certificateExpiry?.toISOString() ?? null).toBe(
      before[0]?.certificateExpiry?.toISOString() ?? null,
    );
  }, 120_000);

  it('endowment.update ACCEPTS the agreeing pair, and stores the SERVER’s snapshot', async () => {
    // ⚠ THE POSITIVE HALF, so this file is not a suite that passes over a validator refusing
    // everything. It also proves the second half of the fix: the value persisted is the server's
    // derivation, not the caller's string, even though the two are now proven equal.
    const ctx = await contextFor({ userId: MAKER, requestId: 'm1-update-agrees' });
    const result = await createCaller(ctx).endowment.update({
      waqfId: SUBJECT_WAQF,
      certificateExpiry: AT.toISOString(),
      certificateExpiryHijri: TRUE_HIJRI,
    });
    expect(result.certificateExpiryHijri).toBe(TRUE_HIJRI);

    const prisma = await basePrisma();
    const stored = await prisma.$queryRawUnsafe<{ certificateExpiryHijri: string | null }[]>(
      `SELECT "certificateExpiryHijri" FROM "waqf" WHERE "id" = $1`,
      SUBJECT_WAQF,
    );
    expect(stored[0]?.certificateExpiryHijri).toBe(TRUE_HIJRI);

    // Restore the seeded state so this file leaves the fixture as it found it (`waqf-002` seeds with
    // no certificate expiry). Both halves move together — schema convention 2 in both directions.
    await createCaller(
      await contextFor({ userId: MAKER, requestId: 'm1-update-restore' }),
    ).endowment.update({
      waqfId: SUBJECT_WAQF,
      certificateExpiry: null,
      certificateExpiryHijri: null,
    });
    const restored = await prisma.$queryRawUnsafe<{ certificateExpiryHijri: string | null }[]>(
      `SELECT "certificateExpiryHijri" FROM "waqf" WHERE "id" = $1`,
      SUBJECT_WAQF,
    );
    expect(restored[0]?.certificateExpiryHijri).toBeNull();
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * The standing audit — no stored pair anywhere disagrees with the single implementation
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('no stored dual-date pair in the database disagrees with toHijriSnapshot', async () => {
    // ⚠ THE ONE-OFF AUDIT, MADE PERMANENT. It ran once by hand before the fix (0 mismatches out of 8
    // rows); as a test it also covers every row any suite writes from now on, including the write
    // paths this file does not touch. A mismatch here is NOT a cleanup script's to repair — the
    // tables are append-only by design and what to do about a bad row is the owner's call.
    const prisma = await basePrisma();
    const pairs = [
      { table: 'reclassification_event', gregorian: 'at', hijri: 'atHijri' },
      { table: 'waqf', gregorian: 'registrationDate', hijri: 'registrationDateHijri' },
      { table: 'waqf', gregorian: 'certificateExpiry', hijri: 'certificateExpiryHijri' },
      { table: 'waqf', gregorian: 'reversionRecordedAt', hijri: 'reversionRecordedAtHijri' },
      { table: 'approval_request', gregorian: 'decidedAt', hijri: 'decidedAtHijri' },
    ] as const;

    let examined = 0;
    const mismatched: string[] = [];

    for (const pair of pairs) {
      const rows = await prisma.$queryRawUnsafe<{ id: string; g: Date; h: string }[]>(
        `SELECT "id", "${pair.gregorian}" AS g, "${pair.hijri}" AS h FROM "${pair.table}"
          WHERE "${pair.gregorian}" IS NOT NULL AND "${pair.hijri}" IS NOT NULL`,
      );
      for (const row of rows) {
        examined += 1;
        const derived = String(toHijriSnapshot(row.g));
        if (derived !== row.h) {
          mismatched.push(
            `${pair.table}.${row.id}: ${pair.gregorian}=${row.g.toISOString()} stored ` +
              `${pair.hijri}=${row.h}, derived ${derived}`,
          );
        }
      }
    }

    // Not vacuous: the seed writes five `registrationDate` pairs, so an empty examination means the
    // query is wrong rather than the database clean.
    expect(
      examined,
      'the audit examined no rows — fix the query, do not delete the assertion',
    ).toBeGreaterThan(0);
    expect(
      mismatched,
      `stored dual-date pairs disagree with the single Hijri implementation`,
    ).toEqual([]);
  }, 120_000);
});
