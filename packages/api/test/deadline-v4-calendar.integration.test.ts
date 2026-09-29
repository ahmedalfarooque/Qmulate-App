/**
 * S10/T2 — V-4's calendar conjuncts (i), (ii), (iii), measured on the wire.
 *
 * The DoD row (17-build-ship-dod.md:261-265) has FOUR conjuncts; this file carries the three
 * date-computation ones for the rule family the row itself names (`UPDATE_15BD` — the one
 * anchor-complete family, which is exactly why V-4 is claimable while G-5 is not):
 *
 *   (i)  a window whose NAIVE due date lands on a FRIDAY produces a rolled-forward business day;
 *   (ii) a window crossing a seeded HIJRI-MOVING holiday block is displaced past it;
 *   (iii) the result shows Hijri + Gregorian — claimed as the ENGINE-OUTPUT reading: migration
 *        38 stores the pair and its CHECK makes one-calendar-without-the-other UNREPRESENTABLE
 *        (`("actionableDate" IS NULL) = ("actionableDateHijri" IS NULL)`, and the due pair is
 *        NOT NULL twice over). The rendered-surface reading is E10's, by name.
 *
 * Conjunct (iv) — the reminder firing exactly once, idempotent on cron re-run — lives with the
 * WORKER (apps/worker/test), because its honest form runs the worker twice, not a harness import.
 *
 * ⚠ MECHANICS, stated so the assertions read plainly: `UPDATE_15BD` is a BUSINESS-DAY window,
 * and the engine's own contract says such windows "land on a business day by construction, so
 * their roll is an identity" — Fridays and holidays are ABSORBED DURING COUNTING, not rolled at
 * the end. The DoD's "rolls forward" is the calendar-day mental model; the engine implements the
 * strictly stronger form. Both arms therefore assert DISPLACEMENT (the KSA calendar genuinely
 * moved the date past the naive reading) plus THE CROSSING ITSELF, so neither can go vacuous:
 *
 *   · the FIXTURE-HORIZON hazard is real and named — the seeded Hijri holidays cover 1447–1449
 *     (roughly 2025–2028), and a re-run dated past that would cross nothing and "pass". Arm (ii)
 *     asserts a seeded holiday lies STRICTLY INSIDE the anchor→due span AND that the same
 *     compute over a holiday-free calendar lands EARLIER; past the horizon both assertions go
 *     RED rather than the scenario going quiet.
 *   · ⚠ BOTH CAVEATS TRAVEL WITH THE V-4 CLAIM: the roll logic is proven against the FIXTURE
 *     calendar, not an authoritative Saudi list (which authority feeds `HolidayCalendar` is the
 *     DoD's own open question, raised against V-4 by name at 17-build-ship-dod.md:324), and the
 *     fixture has the 1447–1449 horizon.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeRuleDeadline } from '@qmulate/domain';
import {
  addCalendarDays,
  buildHolidayCalendar,
  civilDateFromUtcDate,
  civilDateToUtcDate,
  compareCivilDates,
  toHijriSnapshot,
  weekdayOf,
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

const OFFICER = `${API_TEST_PREFIX}v4-officer`;
const WAQF = 'waqf-001';

function hijriOf(instant: Date): string {
  return String(toHijriSnapshot(instant));
}

/** The seeded observed-holiday rows, as the router's own assembly sees them. */
async function seededHolidays(): Promise<ObservedHoliday[]> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<
    { date: Date; nameAr: string; nameEn: string | null; isWorkingDay: boolean }[]
  >(`SELECT "date","nameAr","nameEn","isWorkingDay" FROM "holiday_calendar" ORDER BY "date" ASC`);
  return rows
    .filter((row) => !row.isWorkingDay)
    .map((row) => ({
      date: civilDateFromUtcDate(row.date),
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? row.nameAr,
    }));
}

async function workweek(): Promise<readonly string[]> {
  const raw = await privilegedPrisma();
  const row = await raw.$queryRawUnsafe<{ value: unknown }[]>(
    `SELECT "value" FROM "setting" WHERE "key" = 'calendar.workweek' AND "waqfId" IS NULL`,
  );
  return parseSetting('calendar.workweek', row[0]?.value).v as readonly string[];
}

const FIFTEEN_BD_SETTINGS = {
  windowBusinessDays: parseSetting('deadline.UPDATE_15BD.businessDays', {
    v: 15,
    unit: 'business_days',
    unverified: true,
    source: 'parity fixture — the figure the seed carries',
    note: '⚠ unverified — confirm vs primary law',
  }),
};

async function computeOnWire(requestId: string, anchor: Date) {
  const caller = createCaller(await contextFor({ userId: OFFICER, requestId }));
  return caller.deadline.compute({
    waqfId: WAQF,
    ruleKey: 'UPDATE_15BD',
    anchor: anchor.toISOString(),
    anchorHijri: hijriOf(anchor),
    triggerEvent: `V-4 calendar conjunct measurement (${requestId})`,
  });
}

describe.runIf(hasDatabase)(
  'S10/T2 · V-4 conjuncts (i)(ii)(iii) — UPDATE_15BD on the KSA calendar',
  () => {
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
      const raw = await privilegedPrisma();
      await raw.$executeRawUnsafe(
        `UPDATE "deadline" SET "deletedAt" = now()
        WHERE "createdBy" = '${OFFICER}' AND "deletedAt" IS NULL`,
      );
      await cleanupApiTestRows();
    });

    it('(i) an anchor whose NAIVE +15-calendar-day due is a FRIDAY: the engine lands strictly later, on a Sun–Thu business day', async () => {
      // 2026-09-17 (Thu) + 15 calendar days = 2026-10-02, and THE PREMISE IS ASSERTED, not assumed:
      // if this date ever stops being a Friday the arm is measuring nothing and must say so.
      const anchor = new Date('2026-09-17T00:00:00.000Z');
      const naive = addCalendarDays(civilDateFromUtcDate(anchor), 15);
      // weekdayOf is getUTCDay() on the civil date: 5 = Friday.
      expect(weekdayOf(naive), 'the premise died: the naive due date is no longer a Friday').toBe(
        5,
      );

      const result = await computeOnWire('v4-friday', anchor);
      const due = civilDateFromUtcDate(new Date(result.deadline.dueDate));

      // Rolled FORWARD past the naive Friday — never earlier, never onto the weekend.
      expect(compareCivilDates(due, naive)).toBe(1);
      // 5 = Friday, 6 = Saturday — the KSA weekend; the due date must be Sun–Thu.
      expect([5, 6].includes(weekdayOf(due))).toBe(false);

      // Parity with the domain compute over the same seeded rows (the router consumes the
      // calendar it claims to).
      const calendar = await calendarFromSeed();
      const expected = computeRuleDeadline({
        ruleKey: 'UPDATE_15BD',
        anchor: civilDateFromUtcDate(anchor),
        calendar,
        settings: FIFTEEN_BD_SETTINGS,
      });
      expect(String(due)).toBe(String(expected.computed.due.gregorian));
    });

    it('(ii) a window CROSSING a seeded Hijri-moving holiday block is displaced past it — and the crossing itself is asserted', async () => {
      // The anchor is DERIVED from the seed rather than hardcoded: seven calendar days before
      // the first seeded EID day the calendar can serve, so the 15-BD walk must pass through the
      // block. Two constraints, both learned from this arm's own first red run:
      //   · HIJRI-MOVING only — the conjunct names a Hijri-moving holiday, and the seed's FIRST
      //     block is Founding Day (fixed-Gregorian Feb 22): picking `holidays[0]` measured the
      //     wrong holiday KIND. The Eid blocks are the moving ones (عيد in the seeded name).
      //   · INSIDE COVERAGE — an anchor before the calendar's first row is CALENDAR_UNAVAILABLE
      //     by design (the engine refuses to guess outside the seeded span), so the pick skips
      //     any Eid day whose anchor would fall out of coverage.
      // Deriving keeps the arm honest across seed edits inside the horizon; PAST the 1447–1449
      // horizon the crossing/displacement assertions below go red instead of quietly passing.
      const holidays = await seededHolidays();
      expect(holidays.length, 'no seeded holidays — arm (ii) has no subject').toBeGreaterThan(0);
      const coverageFrom = holidays[0]!.date;
      const eid = holidays.find(
        (holiday) =>
          holiday.nameAr.includes('عيد') &&
          compareCivilDates(addCalendarDays(holiday.date, -7), coverageFrom) >= 0,
      );
      expect(
        eid,
        'no seeded HIJRI-MOVING (Eid) holiday inside coverage — arm (ii) has no subject',
      ).toBeDefined();
      const anchorCivil = addCalendarDays(eid!.date, -7);
      const anchor = civilDateToUtcDate(anchorCivil);

      const result = await computeOnWire('v4-eid', anchor);
      const due = civilDateFromUtcDate(new Date(result.deadline.dueDate));

      // THE CROSSING: at least one seeded holiday lies STRICTLY inside anchor → due.
      const crossed = holidays.filter(
        (holiday) =>
          compareCivilDates(holiday.date, anchorCivil) === 1 &&
          compareCivilDates(holiday.date, due) === -1,
      );
      expect(
        crossed.length,
        'the window crossed NO seeded holiday — the fixture horizon may have passed and this arm ' +
          'is measuring nothing (17-build-ship-dod.md:324 raises exactly this against V-4)',
      ).toBeGreaterThan(0);

      // THE DISPLACEMENT: the same compute over the seeded calendar MINUS the crossed block
      // lands strictly EARLIER — the block genuinely moved the date. ⚠ Not an EMPTY calendar:
      // `buildHolidayCalendar` REFUSES an empty holiday set by design ("the KSA calendar always
      // has at least the two Eids" — fail-closed, measured on this arm's own second red run),
      // and that refusal is the engine being right, not an obstacle. Removing exactly the
      // crossed days keeps the comparison calendar legal AND isolates the displacement to the
      // block this conjunct is about.
      const week = await workweek();
      const crossedDays = new Set(crossed.map((holiday) => String(holiday.date)));
      const allButCrossed = (await seededHolidays()).filter(
        (holiday) => !crossedDays.has(String(holiday.date)),
      );
      expect(allButCrossed.length, 'removing the block emptied the calendar').toBeGreaterThan(0);
      const bare = buildHolidayCalendar({
        workweek: week as never,
        coverage: {
          from: String(coverageFrom),
          to: String((await seededHolidays()).at(-1)!.date),
        },
        observed: allButCrossed,
      });
      const withoutBlock = computeRuleDeadline({
        ruleKey: 'UPDATE_15BD',
        anchor: anchorCivil,
        calendar: bare,
        settings: FIFTEEN_BD_SETTINGS,
      });
      expect(compareCivilDates(due, withoutBlock.computed.due.gregorian)).toBe(1);
    });

    it("(iii) ENGINE-OUTPUT reading: the persisted row carries BOTH calendars, agreeing — the rendered surface stays E10's", async () => {
      const anchor = new Date('2026-09-17T00:00:00.000Z');
      const result = await computeOnWire('v4-dual', anchor);

      const raw = await privilegedPrisma();
      const stored = await raw.$queryRawUnsafe<
        { dueDate: Date; dueDateHijri: string; anchorDate: Date; anchorDateHijri: string }[]
      >(
        `SELECT "dueDate","dueDateHijri","anchorDate","anchorDateHijri" FROM "deadline" WHERE "id" = '${result.deadline.id}'`,
      );
      const row = stored[0];
      expect(row).toBeDefined();
      // Both calendars, and they AGREE — the Hijri snapshot re-derived from the stored Gregorian
      // must equal the stored Hijri (the pairing is structural per migration 38; the agreement is
      // this assertion's).
      expect(row?.dueDateHijri).toBe(String(toHijriSnapshot(row!.dueDate)));
      expect(row?.anchorDateHijri).toBe(String(toHijriSnapshot(row!.anchorDate)));
    });
  },
);

/** Assemble the calendar EXACTLY as the router does, from the same seeded rows. */
async function calendarFromSeed(): Promise<HolidayCalendar> {
  const observed = await seededHolidays();
  const week = await workweek();
  const first = observed[0]?.date;
  const last = observed[observed.length - 1]?.date;
  return buildHolidayCalendar({
    workweek: week as never,
    coverage: { from: String(first), to: String(last) },
    observed,
  });
}
