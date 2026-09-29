/**
 * S9-3a — §09 Engine B's COMPUTE/PERSIST path on the wire (`deadline.compute` / `deadline.list`).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE PROVES, AND HOW IT AVOIDS PROVING IT WITH ITSELF
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The wire path assembles the calendar from the SEEDED `holiday_calendar` rows (E2's starter
 * set — every row ⚠ unverified BY NAME) and the configured windows, computes through the S9-1
 * pure engine, and persists migration 38's frozen shape. Each computed date here is asserted
 * TWICE, deliberately differently:
 *
 *  1. **A LITERAL PIN, measured then pinned** (the repo's driven-to-red-first discipline): the
 *     expected date was first taken from a red run over the real seeded calendar and is now a
 *     constant, so a silent change to the seed, the engine, or the assembly moves a literal.
 *  2. **PARITY with the domain compute over the same rows** — the wire result must equal what
 *     `computeRuleDeadline` returns when this test assembles the calendar itself, so the router
 *     cannot be quietly consuming a different calendar than the one it claims to.
 *
 * The FROZEN-at-rest half (UPDATE refused, lineage, lifecycle) is `packages/database`'s
 * `deadline-structure.integration.test.ts`; this suite asserts the wire writes the shape those
 * guards demand (`windowSnapshot` present with the Setting-key provenance, both dual pairs).
 *
 * ⚠ CLEANUP IS SOFT-DELETE ONLY: `deadline` rows are non-deletable by migration 8's retention
 * guard — the same guard the E7 stage watched refuse a test probe. `afterAll` soft-deletes this
 * suite's rows; `cleanupApiTestRows()` must never learn `deadline` as a hard-delete table.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeRuleDeadline } from '@qmulate/domain';
import {
  buildHolidayCalendar,
  civilDateFromUtcDate,
  toHijriSnapshot,
  type HolidayCalendar,
  type ObservedHoliday,
} from '@qmulate/domain/dates';
import { parseSetting } from '@qmulate/domain/settings';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  contextFor,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const OFFICER = `${API_TEST_PREFIX}s93-officer`;
const WAQF = 'waqf-001';

async function officerCaller(requestId: string) {
  return createCaller(await contextFor({ userId: OFFICER, requestId }));
}

function hijriOf(instant: Date): string {
  return String(toHijriSnapshot(instant));
}

/** Assemble the calendar EXACTLY as the router does, from the same seeded rows. */
async function calendarFromSeed(): Promise<HolidayCalendar> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<
    { date: Date; nameAr: string; nameEn: string | null; isWorkingDay: boolean }[]
  >(`SELECT "date","nameAr","nameEn","isWorkingDay" FROM "holiday_calendar" ORDER BY "date" ASC`);
  expect(rows.length, 'the seeded holiday starter set is missing').toBeGreaterThan(0);
  const workweekRow = await raw.$queryRawUnsafe<{ value: unknown }[]>(
    `SELECT "value" FROM "setting" WHERE "key" = 'calendar.workweek' AND "waqfId" IS NULL`,
  );
  const workweek = parseSetting('calendar.workweek', workweekRow[0]?.value);
  const observed: ObservedHoliday[] = rows
    .filter((row) => !row.isWorkingDay)
    .map((row) => ({
      date: civilDateFromUtcDate(row.date),
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? row.nameAr,
    }));
  const first = observed[0]?.date;
  const last = observed[observed.length - 1]?.date;
  return buildHolidayCalendar({
    workweek: workweek.v,
    coverage: { from: String(first), to: String(last) },
    observed,
  });
}

describe.runIf(hasDatabase)('S9-3a · deadline.compute — the frozen date on file', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [WAQF],
        permissions: ['endowment:waqf:read', 'compliance:task:read', 'compliance:task:write'],
      },
    ]);
  });

  afterAll(async () => {
    // Soft-delete only: the retention guard refuses DELETE for everyone (migration 8) — which is
    // that guard working, not an inconvenience to engineer around.
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      `UPDATE "deadline" SET "deletedAt" = now()
        WHERE "createdBy" = '${OFFICER}' AND "deletedAt" IS NULL`,
    );
    await cleanupApiTestRows();
  });

  /* ── 1 · the statutory business-day clock, over the REAL seeded calendar ────────────────── */

  it('ISTIBDAL_10BD: computes over the seeded holidays, persists the §09 frozen shape, and the ⚠ note travels', async () => {
    const caller = await officerCaller('s93-istibdal');
    const anchor = new Date('2026-05-10T00:00:00.000Z'); // a Sunday — §09 B2's own trigger day
    const result = await caller.deadline.compute({
      waqfId: WAQF,
      ruleKey: 'ISTIBDAL_10BD',
      anchor: anchor.toISOString(),
      anchorHijri: hijriOf(anchor),
      triggerEvent: 'test istibdal completion — invented fixture event',
    });

    // (1) THE LITERAL PIN — measured on a red run over the real seeded calendar, then pinned.
    // ⚠ NOT the pure weekend walk: the naive Sun–Thu count from Sun 2026-05-10 lands 2026-05-21,
    // and the measured date is 2026-05-24 — the seeded starter set's rule-resolved Eid al-Adha
    // days sit INSIDE the window and the walk skipped them. That contrast is §09 B2's whole
    // point, here over the REAL seeded rows rather than a fixture holiday. If the seed's holiday
    // set changes, this literal MOVES — deliberately.
    expect(result.deadline.dueDateHijri).toBe(EXPECTED_ISTIBDAL.hijri);
    expect(new Date(result.deadline.dueDate).toISOString().slice(0, 10)).toBe(
      EXPECTED_ISTIBDAL.gregorian,
    );

    // (2) PARITY — the wire result equals the domain compute over the same seeded rows.
    const calendar = await calendarFromSeed();
    const expected = computeRuleDeadline({
      ruleKey: 'ISTIBDAL_10BD',
      anchor: civilDateFromUtcDate(anchor),
      calendar,
      settings: {
        windowBusinessDays: parseSetting('deadline.ISTIBDAL_10BD.businessDays', {
          v: 10,
          unit: 'business_days',
          unverified: true,
          source: 'parity fixture — same figure the seed carries',
          note: '⚠ unverified — confirm vs primary law',
        }),
      },
    });
    expect(new Date(result.deadline.dueDate).toISOString().slice(0, 10)).toBe(
      expected.computed.due.gregorian,
    );
    expect(result.deadline.dueDateHijri).toBe(expected.computed.due.hijri);

    // Binding rule 3 on the wire: the caveat travels with the date.
    expect(result.unverifiedNote).not.toBeNull();
    expect(result.unverifiedNote).toContain('unverified');

    // The frozen shape migration 38 demands, read back at rest.
    const raw = await privilegedPrisma();
    const stored = await raw.$queryRawUnsafe<
      { windowSnapshot: Record<string, unknown>; businessDaysUsed: number | null }[]
    >(
      `SELECT "windowSnapshot","businessDaysUsed" FROM "deadline" WHERE "id" = '${result.deadline.id}'`,
    );
    expect(stored[0]?.windowSnapshot).toMatchObject({
      settingKey: 'deadline.ISTIBDAL_10BD.businessDays',
      basis: 'business_days',
      businessDays: 10,
      roll: 'following',
      unverified: true,
    });
    expect(stored[0]?.businessDaysUsed).toBe(10);
  });

  /* ── 2 · the month clock consumes the CONFIGURED anchor — the question of law stays config ─ */

  it('DISTRIBUTE_3M_FYE: consumes the seeded day_of_month anchor and records it in the snapshot', async () => {
    const caller = await officerCaller('s93-fye');
    const anchor = new Date('2026-09-30T00:00:00.000Z');
    const result = await caller.deadline.compute({
      waqfId: WAQF,
      ruleKey: 'DISTRIBUTE_3M_FYE',
      anchor: anchor.toISOString(),
      anchorHijri: hijriOf(anchor),
      triggerEvent: 'test fiscal-year end — invented fixture event',
    });
    // day_of_month: 30 Sept + 3 months = 30 Dec (2026-12-30 is a Wednesday — a business day).
    expect(new Date(result.deadline.dueDate).toISOString().slice(0, 10)).toBe('2026-12-30');
    expect(result.unverifiedNote).not.toBeNull();

    const raw = await privilegedPrisma();
    const stored = await raw.$queryRawUnsafe<{ windowSnapshot: Record<string, unknown> }[]>(
      `SELECT "windowSnapshot" FROM "deadline" WHERE "id" = '${result.deadline.id}'`,
    );
    expect(stored[0]?.windowSnapshot).toMatchObject({
      settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
      basis: 'calendar_months',
      calendarMonths: 3,
      monthAnchor: 'day_of_month',
      unverified: true,
    });
  });

  /* ── 3 · a pre-expiry rule: the due date is the FACT, the actionable date is ours ────────── */

  it('LICENSE_RENEWAL: due = the recorded expiry (no ⚠ — a fact, not a figure); actionable = expiry − 30 business days', async () => {
    const caller = await officerCaller('s93-license');
    const anchor = new Date('2026-06-30T00:00:00.000Z'); // Tuesday
    const result = await caller.deadline.compute({
      waqfId: WAQF,
      ruleKey: 'LICENSE_RENEWAL',
      anchor: anchor.toISOString(),
      anchorHijri: hijriOf(anchor),
      triggerEvent: 'test licence expiry — invented fixture event',
    });
    expect(new Date(result.deadline.dueDate).toISOString().slice(0, 10)).toBe('2026-06-30');
    // The DATE is a recorded fact; the seeded lead is operating policy — nothing here is an
    // unverified regulatory figure, so the note is null. The CONTRAST with case 1 is the point.
    expect(result.unverifiedNote).toBeNull();
    expect(result.deadline.actionableDate).not.toBeNull();
    // Parity for the actionable date over the same seeded calendar.
    const calendar = await calendarFromSeed();
    const expected = computeRuleDeadline({
      ruleKey: 'LICENSE_RENEWAL',
      anchor: civilDateFromUtcDate(anchor),
      calendar,
      settings: {
        preExpiryLeadBd: parseSetting('deadline.LICENSE_RENEWAL.preExpiryLeadBd', {
          v: 30,
          unit: 'business_days',
          unverified: false,
          source: 'parity fixture — same figure the seed carries',
        }),
      },
    });
    expect(
      new Date(result.deadline.actionableDate as unknown as string).toISOString().slice(0, 10),
    ).toBe(expected.actionable?.gregorian);
  });

  /* ── 4 · non-clocks refuse BY NAME on the wire ────────────────────────────────────────────── */

  it.each([
    ['RETENTION_10Y', 'RETENTION_FLOOR_NOT_A_CLOCK'],
    ['AML_IMMEDIATE', 'AML_IMMEDIATE_NOT_A_CLOCK'],
    ['external', 'RULE_KEY_UNKNOWN'],
  ])('%s refuses with DEADLINE_RULE_NOT_A_CLOCK (%s) and persists NOTHING', async (ruleKey) => {
    const caller = await officerCaller(`s93-nonclock-${ruleKey}`);
    const anchor = new Date('2026-05-10T00:00:00.000Z');
    const raw = await privilegedPrisma();
    const before = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "deadline" WHERE "createdBy" = '${OFFICER}'`,
    );
    await expect(
      caller.deadline.compute({
        waqfId: WAQF,
        ruleKey,
        anchor: anchor.toISOString(),
        anchorHijri: hijriOf(anchor),
        triggerEvent: 'test non-clock refusal',
      }),
    ).rejects.toThrow(/not a deadline rule|FLOOR governing deletion|not one of the nine/);
    const after = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "deadline" WHERE "createdBy" = '${OFFICER}'`,
    );
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  /* ── 5 · the task binding is scoped: another endowment's task reads as nonexistent ───────── */

  it("a task id on ANOTHER endowment refuses as not-found — §10 §7.2's non-disclosure shape", async () => {
    const caller = await officerCaller('s93-crosswaqf');
    // task-003 is one of the fixture's ten pre-engine rows and does NOT sit on waqf-001.
    const raw = await privilegedPrisma();
    const foreign = await raw.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "compliance_task" WHERE "waqfId" <> '${WAQF}' ORDER BY "id" ASC LIMIT 1`,
    );
    expect(foreign).toHaveLength(1);
    const anchor = new Date('2026-05-10T00:00:00.000Z');
    await expect(
      caller.deadline.compute({
        waqfId: WAQF,
        ruleKey: 'ISTIBDAL_10BD',
        anchor: anchor.toISOString(),
        anchorHijri: hijriOf(anchor),
        complianceTaskId: foreign[0]?.id ?? 'missing',
        triggerEvent: 'test cross-endowment binding refusal',
      }),
    ).rejects.toThrow(/not found|NOT_FOUND|does not name a task/i);
  });

  /* ── 6 · the board reads back, soonest due first ─────────────────────────────────────────── */

  it("deadline.list returns this suite's rows ordered by due date", async () => {
    const caller = await officerCaller('s93-list');
    const { deadlines } = await caller.deadline.list({ waqfId: WAQF });
    const mine = deadlines.filter((row) => row.ruleKey !== 'never');
    expect(mine.length).toBeGreaterThanOrEqual(3);
    const dues = mine.map((row) => new Date(row.dueDate).getTime());
    expect([...dues].sort((a, b) => a - b)).toEqual(dues);
  });
});

/**
 * ⚠ MEASURED THEN PINNED (driven to red first): the first run of this suite carried
 * `9999-99-99` here and the real values were transcribed from that run's own failure output
 * over the real seeded calendar. A silent seed/engine/assembly change moves these literals.
 */
const EXPECTED_ISTIBDAL = { gregorian: '2026-05-24', hijri: '1447-12-07' } as const;
