/**
 * KSA business-day arithmetic — **the E2 exit vector** (§17 E2 exit clause 2, verbatim:
 * "`addBusinessDays` crosses a weekend + a seeded Hijri holiday correctly (unit-tested)").
 *
 * ## What is actually being proven
 *
 * A statutory deadline in the Nazarah regulation is expressed in BUSINESS days
 * (⚠ 30 / 15 / 10 business days — unverified, confirm vs primary law). Getting the arithmetic
 * wrong does not produce a visibly broken screen; it produces a confidently wrong date that a
 * Nazir files against. Three independent ways to be wrong, each tested in ISOLATION here so a
 * failure names its own cause:
 *
 *  1. **The weekend is Friday/Saturday, not Saturday/Sunday.** A default-Western weekend shifts
 *     every KSA deadline. The workweek is Sunday–Thursday and it arrives as DATA (in production
 *     from `Setting calendar.workweek`), never as a constant inside the walk.
 *  2. **Holidays are skipped, not counted.** Including Eid days in a business-day count reports a
 *     deadline that has already passed.
 *  3. **Hijri holidays MOVE.** The same rule (1 Shawwal, 3 days) costs ONE business day in 1447
 *     and THREE in 1448 because it lands on a Fri/Sat/Sun in one year and a Tue/Wed/Thu in the
 *     next. Any implementation that resolves a lunar holiday once and reuses it is wrong in every
 *     other year, and wrong by a different amount each time.
 *
 * ## Semantics that change answers if guessed (documented, then pinned)
 *
 * - `addBusinessDays` steps from `start` **EXCLUSIVE**, decrementing on each business day. A
 *   business-day window therefore needs no terminal roll: the result is ALWAYS a business day.
 * - `n === 0` returns `start` **UNCHANGED**, even on a Friday or a holiday. It must not roll —
 *   "zero business days from the trigger" is the trigger date, and a silent roll here would
 *   quietly move every same-day obligation.
 * - Rolling is a **separate named call** (`rollToBusinessDay`) so no caller receives a roll it did
 *   not ask for, and `following` vs `preceding` is STATUTORY, not stylistic: you file AFTER a
 *   trigger event, you renew BEFORE an expiry.
 * - Negative `n` is supported (pre-alert offsets, and `preceding` counts backward).
 * - `isBusinessDay` precedence, in order: working-day override → holiday → weekend → true.
 * - Stepping outside the calendar's declared `coverage` THROWS. Silently continuing past the end
 *   of the known holiday table is the same failure as an empty calendar, one step removed.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, type WeekdayCode } from '../dates/civil-date.js';
import { type DomainError, isDomainError } from '../errors.js';
import {
  KSA_DEFAULT_WORKWEEK,
  addBusinessDays,
  buildHolidayCalendar,
  countBusinessDays,
  holidayOn,
  isBusinessDay,
  isWeekend,
  nextBusinessDay,
  previousBusinessDay,
  rollToBusinessDay,
  type HolidayCalendarInput,
  type HolidayRule,
} from '../dates/business-days.js';

/** Run `fn` and hand back whatever it threw (or `undefined` if it did not throw). */
function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function expectDomainCode(fn: () => unknown, code: string): void {
  const error = caught(fn);
  expect(isDomainError(error)).toBe(true);
  expect((error as DomainError).code).toBe(code);
  expect((error as DomainError).messageKey).toBe(`errors.domain.${code}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * CAL-A — the E2 exit calendar
 *
 * Sun–Thu workweek (Fri/Sat weekend) plus two OBSERVED holidays on 2026-05-19 and 2026-05-20
 * (Tue/Wed — deliberately mid-week, so a holiday failure cannot hide behind a weekend failure).
 * Coverage is declared explicitly; stepping outside it throws.
 * ──────────────────────────────────────────────────────────────────────────── */
const CAL_A_INPUT: HolidayCalendarInput = {
  workweek: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
  coverage: { from: '2025-01-01', to: '2028-12-31' },
  observed: [
    { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
    { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
  ],
};

const CAL_A = buildHolidayCalendar(CAL_A_INPUT);

describe('CAL-A shape (the weekday facts every vector below depends on)', () => {
  it('places the fixture dates on the weekdays the vectors assume', () => {
    // If any of these is wrong the whole file is testing something else. Sun=0 … Sat=6.
    expect(isWeekend(civilDate('2026-05-10'), CAL_A)).toBe(false); // Sunday
    expect(isWeekend(civilDate('2026-05-15'), CAL_A)).toBe(true); // Friday
    expect(isWeekend(civilDate('2026-05-16'), CAL_A)).toBe(true); // Saturday
    expect(isWeekend(civilDate('2026-05-17'), CAL_A)).toBe(false); // Sunday
    expect(holidayOn(civilDate('2026-05-19'), CAL_A)?.nameEn).toBe('Fixture holiday day 1');
    expect(holidayOn(civilDate('2026-05-20'), CAL_A)?.nameEn).toBe('Fixture holiday day 2');
    expect(holidayOn(civilDate('2026-05-21'), CAL_A)).toBeNull();
  });

  it('exposes the KSA default workweek as data, and it is Sunday–Thursday', () => {
    // Production reads the workweek from `Setting calendar.workweek`; this constant exists for
    // fixtures and seeds, and is NOT a default inside buildHolidayCalendar (which requires it).
    expect(KSA_DEFAULT_WORKWEEK).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU']);
  });

  it('marks the resolved holidays with their Hijri twin', () => {
    // 2026-05-19 is 1447-12-02 in Umm al-Qura, and it must agree with the frozen anchors.
    expect(holidayOn(civilDate('2026-05-19'), CAL_A)?.hijri).toBe('1447-12-02');
    expect(holidayOn(civilDate('2026-05-19'), CAL_A)?.source).toBe('observed');
  });
});

describe('EXIT-2 — addBusinessDays crosses a weekend AND a seeded Hijri holiday', () => {
  /**
   * THE HEADLINE VECTOR. From Sunday 2026-05-10, ten business days:
   *
   *   05-11 Mon 1 · 05-12 Tue 2 · 05-13 Wed 3 · 05-14 Thu 4 · [05-15 Fri, 05-16 Sat weekend]
   *   05-17 Sun 5 · 05-18 Mon 6 · [05-19 Tue, 05-20 Wed HOLIDAY] · 05-21 Thu 7
   *   [05-22 Fri, 05-23 Sat weekend] · 05-24 Sun 8 · 05-25 Mon 9 · 05-26 Tue 10
   *
   * Two weekends (4 days) and one two-day holiday are skipped: 16 calendar days for 10 business
   * days. A Sat/Sun weekend would answer 2026-05-22; counting the holiday would answer
   * 2026-05-24. Both are wrong, and both look plausible.
   */
  it('spans two weekends and a two-day holiday: 2026-05-10 + 10 bd = 2026-05-26', () => {
    expect(addBusinessDays('2026-05-10', 10, CAL_A)).toBe('2026-05-26');
  });

  it('ISOLATION — weekend only: 2026-05-11 + 4 bd = 2026-05-17', () => {
    // Mon → Tue 1, Wed 2, Thu 3, [Fri/Sat skipped], Sun 4. No holiday involved.
    expect(addBusinessDays('2026-05-11', 4, CAL_A)).toBe('2026-05-17');
  });

  it('ISOLATION — holiday only: 2026-05-18 + 1 bd = 2026-05-21', () => {
    // Mon → [Tue, Wed HOLIDAY] → Thu 1. No weekend involved.
    expect(addBusinessDays('2026-05-18', 1, CAL_A)).toBe('2026-05-21');
  });

  it('starts on a WEEKEND day without counting it: 2026-05-15 (Fri) + 1 bd = 2026-05-17', () => {
    expect(addBusinessDays('2026-05-15', 1, CAL_A)).toBe('2026-05-17');
  });

  it('starts on a HOLIDAY without counting it: 2026-05-19 + 1 bd = 2026-05-21', () => {
    expect(addBusinessDays('2026-05-19', 1, CAL_A)).toBe('2026-05-21');
  });

  it('n === 0 returns the start UNCHANGED — even on a Friday, a Saturday or a holiday', () => {
    // A roll here would silently move every same-day obligation. Rolling is opt-in, by name.
    expect(addBusinessDays('2026-05-10', 0, CAL_A)).toBe('2026-05-10'); // business day
    expect(addBusinessDays('2026-05-15', 0, CAL_A)).toBe('2026-05-15'); // Friday
    expect(addBusinessDays('2026-05-16', 0, CAL_A)).toBe('2026-05-16'); // Saturday
    expect(addBusinessDays('2026-05-19', 0, CAL_A)).toBe('2026-05-19'); // holiday
    expect(isBusinessDay(civilDate('2026-05-15'), CAL_A)).toBe(false);
    expect(isBusinessDay(civilDate('2026-05-19'), CAL_A)).toBe(false);
  });

  it('always lands on a business day for n !== 0, so no terminal roll is needed', () => {
    for (const n of [1, 2, 3, 5, 10, 20, -1, -5, -10]) {
      const result = addBusinessDays('2026-05-10', n, CAL_A);
      expect(isBusinessDay(result, CAL_A)).toBe(true);
    }
  });

  it('walks backwards: negative n counts business days before the start', () => {
    // From Tue 2026-05-26 back ten business days must return to Sun 2026-05-10 (the forward
    // vector inverted — valid because 2026-05-10 is itself a business day).
    expect(addBusinessDays('2026-05-26', -10, CAL_A)).toBe('2026-05-10');
    // From Sun 2026-05-17 back one business day skips the Fri/Sat weekend to Thu 2026-05-14.
    expect(addBusinessDays('2026-05-17', -1, CAL_A)).toBe('2026-05-14');
    // From Thu 2026-05-21 back one business day skips the two holidays to Mon 2026-05-18.
    expect(addBusinessDays('2026-05-21', -1, CAL_A)).toBe('2026-05-18');
  });

  it('rejects a non-integer or non-finite n rather than truncating it', () => {
    expect(() => addBusinessDays('2026-05-10', 1.5, CAL_A)).toThrow(RangeError);
    expect(() => addBusinessDays('2026-05-10', Number.NaN, CAL_A)).toThrow(RangeError);
    expect(() => addBusinessDays('2026-05-10', Number.POSITIVE_INFINITY, CAL_A)).toThrow(
      RangeError,
    );
  });
});

describe('MOVING HOLIDAY — one hijri_recurring rule, two different business-day costs', () => {
  /**
   * ONE rule: `{ kind: 'hijri_recurring', hijriMonth: 10, hijriDay: 1, spanDays: 3 }` — the
   * 1 Shawwal Eid al-Fitr shape.
   *
   *   1447 → 2026-03-20 (Fri) / 03-21 (Sat) / 03-22 (Sun)  → only Sunday is a workday → COSTS 1
   *   1448 → 2027-03-09 (Tue) / 03-10 (Wed) / 03-11 (Thu)  → all three are workdays → COSTS 3
   *
   * Same rule, same span, three-times the cost, because the lunar year is ~11 days shorter. This
   * is the assertion that a "resolve the holiday once and cache it" implementation cannot pass.
   */
  const MOVING_RULE = {
    kind: 'hijri_recurring',
    id: 'eid-al-fitr',
    nameEn: 'Eid al-Fitr (fixture)',
    nameAr: 'عيد الفطر (تجريبي)',
    hijriMonth: 10,
    hijriDay: 1,
    spanDays: 3,
  } as const;

  const CAL_MOVING = buildHolidayCalendar({
    workweek: KSA_DEFAULT_WORKWEEK,
    coverage: { from: '2026-01-01', to: '2028-12-31' },
    rules: [MOVING_RULE],
  });

  /** The same calendar with the rule removed, so the DIFFERENCE is attributable to the rule. */
  const CAL_NO_RULE = buildHolidayCalendar({
    workweek: KSA_DEFAULT_WORKWEEK,
    coverage: { from: '2026-01-01', to: '2028-12-31' },
    // A calendar must not be empty (see CALENDAR_UNAVAILABLE below), so park a single observed
    // holiday far from either test window.
    observed: [{ date: '2028-06-01', nameEn: 'Unrelated', nameAr: 'غير ذي صلة' }],
  });

  it('resolves 1 Shawwal 1447 to 2026-03-20 and spans three days', () => {
    expect(holidayOn(civilDate('2026-03-20'), CAL_MOVING)?.ruleId).toBe('eid-al-fitr');
    expect(holidayOn(civilDate('2026-03-20'), CAL_MOVING)?.hijri).toBe('1447-10-01');
    expect(holidayOn(civilDate('2026-03-21'), CAL_MOVING)?.hijri).toBe('1447-10-02');
    expect(holidayOn(civilDate('2026-03-22'), CAL_MOVING)?.hijri).toBe('1447-10-03');
    expect(holidayOn(civilDate('2026-03-23'), CAL_MOVING)).toBeNull();
    expect(holidayOn(civilDate('2026-03-19'), CAL_MOVING)).toBeNull();
    expect(holidayOn(civilDate('2026-03-20'), CAL_MOVING)?.source).toBe('hijri_recurring');
  });

  it('resolves the SAME rule to 2027-03-09 in 1448 — eleven days earlier in the solar year', () => {
    expect(holidayOn(civilDate('2027-03-09'), CAL_MOVING)?.hijri).toBe('1448-10-01');
    expect(holidayOn(civilDate('2027-03-10'), CAL_MOVING)?.hijri).toBe('1448-10-02');
    expect(holidayOn(civilDate('2027-03-11'), CAL_MOVING)?.hijri).toBe('1448-10-03');
  });

  it('costs ONE business day in 1447 (Fri/Sat/Sun) …', () => {
    // Window Mon 2026-03-16 → Thu 2026-03-26. Without the rule: 8 business days.
    // With it, 2026-03-20/21/22 are holidays but 20 and 21 were already weekend, so exactly one
    // workday (Sun 03-22) is lost.
    expect(countBusinessDays('2026-03-16', '2026-03-26', CAL_NO_RULE)).toBe(8);
    expect(countBusinessDays('2026-03-16', '2026-03-26', CAL_MOVING)).toBe(7);
  });

  it('… and THREE business days in 1448 (Tue/Wed/Thu) — same rule, different cost', () => {
    // Window Mon 2027-03-08 → Thu 2027-03-18. Without the rule: 8 business days.
    // With it, all three holiday days were workdays, so three are lost.
    expect(countBusinessDays('2027-03-08', '2027-03-18', CAL_NO_RULE)).toBe(8);
    expect(countBusinessDays('2027-03-08', '2027-03-18', CAL_MOVING)).toBe(5);
  });

  it('shows the cost difference through addBusinessDays as well as countBusinessDays', () => {
    // 5 business days from the Thursday before each Eid.
    expect(addBusinessDays('2026-03-19', 5, CAL_NO_RULE)).toBe('2026-03-26');
    expect(addBusinessDays('2026-03-19', 5, CAL_MOVING)).toBe('2026-03-29'); // one workday lost
    expect(addBusinessDays('2027-03-04', 5, CAL_NO_RULE)).toBe('2027-03-11');
    expect(addBusinessDays('2027-03-04', 5, CAL_MOVING)).toBe('2027-03-16'); // three lost
  });

  it('rejects a hijri_recurring rule anchored on a 30th, which does not exist every year', () => {
    // Silently skipping the years where the 30th is absent would drop a public holiday from the
    // calendar without telling anyone. Express those as explicit `observed` dates instead.
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2026-01-01', to: '2028-12-31' },
          rules: [{ ...MOVING_RULE, hijriDay: 30 }],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });

  it('rejects an unknown rule kind instead of ignoring it', () => {
    // Compile-time half: the rule union is CLOSED, so an unmapped kind cannot be written.
    // @ts-expect-error — 'lunisolar_something' is not a HolidayRule kind.
    const compileTime: HolidayRule = { ...MOVING_RULE, kind: 'lunisolar_something' };
    void compileTime;

    // Runtime half: a row that reached the process through JSON / a DB column still fails closed
    // rather than being skipped, because an ignored rule is a missing public holiday.
    const smuggled = { ...MOVING_RULE, kind: 'lunisolar_something' } as unknown as HolidayRule;
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2026-01-01', to: '2028-12-31' },
          rules: [smuggled],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });
});

describe('gregorian_recurring rules', () => {
  const CAL_FOUNDING = buildHolidayCalendar({
    workweek: KSA_DEFAULT_WORKWEEK,
    coverage: { from: '2026-01-01', to: '2028-12-31' },
    rules: [
      {
        kind: 'gregorian_recurring',
        id: 'founding-day',
        nameEn: 'Founding Day (fixture)',
        nameAr: 'يوم التأسيس (تجريبي)',
        gregorianMonth: 2,
        gregorianDay: 22,
        spanDays: 1,
      },
    ],
  });

  it('recurs on the same Gregorian day in every covered year', () => {
    for (const year of [2026, 2027, 2028]) {
      expect(holidayOn(civilDate(`${year}-02-22`), CAL_FOUNDING)?.ruleId).toBe('founding-day');
    }
    expect(holidayOn(civilDate('2026-02-23'), CAL_FOUNDING)).toBeNull();
  });

  it('rejects 29 February as a recurring anchor — it is absent three years in four', () => {
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2026-01-01', to: '2028-12-31' },
          rules: [
            {
              kind: 'gregorian_recurring',
              id: 'leap',
              nameEn: 'Leap',
              nameAr: 'كبيسة',
              gregorianMonth: 2,
              gregorianDay: 29,
              spanDays: 1,
            },
          ],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });
});

describe('a working-day override OUTRANKS both the holiday and the weekend', () => {
  const CAL_OVERRIDE = buildHolidayCalendar({
    ...CAL_A_INPUT,
    workingDayOverrides: [
      // A Friday declared a working day (a compensating workday after an extended Eid).
      { date: '2026-05-15', isWorkingDay: true, reason: 'Compensating workday (fixture)' },
      // A holiday day declared a working day (the Authority recalls a day).
      { date: '2026-05-19', isWorkingDay: true, reason: 'Holiday recalled (fixture)' },
    ],
  });

  it('makes an overridden Friday a business day', () => {
    expect(isWeekend(civilDate('2026-05-15'), CAL_OVERRIDE)).toBe(true); // still a Friday
    expect(isBusinessDay(civilDate('2026-05-15'), CAL_OVERRIDE)).toBe(true); // but a workday
  });

  it('makes an overridden holiday a business day, while the holiday record survives', () => {
    // `holidayOn` reports the raw record; `isBusinessDay` applies the precedence. Keeping the
    // record visible is deliberate — a report must be able to say "Eid, worked".
    expect(holidayOn(civilDate('2026-05-19'), CAL_OVERRIDE)?.nameEn).toBe('Fixture holiday day 1');
    expect(isBusinessDay(civilDate('2026-05-19'), CAL_OVERRIDE)).toBe(true);
  });

  it('changes the arithmetic: the exit vector shortens by the two recovered days', () => {
    // With Fri 05-15 and Tue 05-19 recovered as workdays, ten business days from 2026-05-10 lands
    // two workdays earlier than CAL-A's 2026-05-26.
    expect(addBusinessDays('2026-05-10', 10, CAL_OVERRIDE)).toBe('2026-05-24');
  });

  it('rejects an override outside the declared coverage', () => {
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          ...CAL_A_INPUT,
          workingDayOverrides: [{ date: '2030-01-01', isWorkingDay: true }],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });
});

describe('CALENDAR_UNAVAILABLE — fail closed, never treat every day as a business day', () => {
  /**
   * EXIT-2's own mutation target: replacing this throw with `return { workweek, holidays: new
   * Map() }` produces a calendar in which no day is ever a holiday, i.e. a confidently wrong
   * statutory due date with no symptom.
   */
  it('refuses an empty holiday set', () => {
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2026-01-01', to: '2028-12-31' },
        }),
      'CALENDAR_UNAVAILABLE',
    );
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2026-01-01', to: '2028-12-31' },
          observed: [],
          rules: [],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });

  it('refuses a holiday set whose every entry falls OUTSIDE coverage (an empty set in disguise)', () => {
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2026-01-01', to: '2026-12-31' },
          observed: [{ date: '2027-05-19', nameEn: 'Out of range', nameAr: 'خارج النطاق' }],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });

  it('refuses an empty workweek (no day is a workday) and a full one (no weekend exists)', () => {
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: [],
          coverage: { from: '2026-01-01', to: '2028-12-31' },
          observed: [{ date: '2026-05-19', nameEn: 'H', nameAr: 'ع' }],
        }),
      'CALENDAR_UNAVAILABLE',
    );
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
          coverage: { from: '2026-01-01', to: '2028-12-31' },
          observed: [{ date: '2026-05-19', nameEn: 'H', nameAr: 'ع' }],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });

  it('refuses a duplicated or unrecognised weekday code', () => {
    // Compile-time half: `WeekdayCode` is a closed union, so a typo cannot be written.
    // @ts-expect-error — 'THURSDAY' is not a WeekdayCode.
    const compileTime: readonly WeekdayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THURSDAY'];
    void compileTime;

    // Runtime half: the same strings arriving from `Setting calendar.workweek` (free-form JSON)
    // must DENY, not be coerced. 'Thu' and 'THU ' are the realistic database-row shapes.
    for (const workweek of [
      ['SUN', 'SUN', 'MON', 'TUE', 'THU'], // duplicate
      ['SUN', 'MON', 'TUE', 'WED', 'Thu'], // wrong case
      ['SUN', 'MON', 'TUE', 'WED', 'THURSDAY'], // long form
      ['SUN', 'MON', 'TUE', 'WED', 'THU '], // trailing space
    ] as unknown as readonly WeekdayCode[][]) {
      expectDomainCode(
        () =>
          buildHolidayCalendar({
            workweek,
            coverage: { from: '2026-01-01', to: '2028-12-31' },
            observed: [{ date: '2026-05-19', nameEn: 'H', nameAr: 'ع' }],
          }),
        'CALENDAR_UNAVAILABLE',
      );
    }
  });

  it('refuses an inverted or zero-length coverage window', () => {
    expectDomainCode(
      () =>
        buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: '2028-12-31', to: '2026-01-01' },
          observed: [{ date: '2026-05-19', nameEn: 'H', nameAr: 'ع' }],
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });
});

describe('coverage is a hard boundary, checked mid-walk', () => {
  it('throws when the walk steps past the end of the known holiday table', () => {
    // CAL-A covers to 2028-12-31. From Thu 2028-12-28, ten business days needs 2029, which is
    // beyond the seeded holidays — the answer would be a guess.
    expectDomainCode(() => addBusinessDays('2028-12-28', 10, CAL_A), 'CALENDAR_UNAVAILABLE');
  });

  it('throws for a query date outside coverage, in either direction', () => {
    expectDomainCode(() => isBusinessDay(civilDate('2029-01-01'), CAL_A), 'CALENDAR_UNAVAILABLE');
    expectDomainCode(() => isBusinessDay(civilDate('2024-12-31'), CAL_A), 'CALENDAR_UNAVAILABLE');
    expectDomainCode(() => addBusinessDays('2025-01-02', -10, CAL_A), 'CALENDAR_UNAVAILABLE');
    expectDomainCode(
      () => countBusinessDays('2028-12-01', '2029-02-01', CAL_A),
      'CALENDAR_UNAVAILABLE',
    );
  });

  it('permits a walk that stays inside coverage right up to the boundary', () => {
    // Thu 2028-12-28 + 1 bd: Fri/Sat weekend, then Sun 2028-12-31 — the last covered day.
    expect(addBusinessDays('2028-12-28', 1, CAL_A)).toBe('2028-12-31');
  });
});

describe('countBusinessDays', () => {
  it('excludes `from` and includes `to`, so it inverts addBusinessDays exactly', () => {
    expect(countBusinessDays('2026-05-10', '2026-05-26', CAL_A)).toBe(10);
    expect(countBusinessDays('2026-05-11', '2026-05-17', CAL_A)).toBe(4);
    expect(countBusinessDays('2026-05-18', '2026-05-21', CAL_A)).toBe(1);
    expect(countBusinessDays('2026-05-10', '2026-05-10', CAL_A)).toBe(0);
  });

  it('is negative and symmetric when `to` precedes `from`', () => {
    expect(countBusinessDays('2026-05-26', '2026-05-10', CAL_A)).toBe(-10);
    // The symmetry holds even when `from` is NOT a business day — the interval is always
    // "from exclusive, to inclusive", measured in the direction of travel.
    expect(countBusinessDays('2026-05-15', '2026-05-14', CAL_A)).toBe(-1);
    expect(countBusinessDays('2026-05-14', '2026-05-15', CAL_A)).toBe(0); // 05-15 is a Friday
  });

  it('counts zero across a pure weekend', () => {
    expect(countBusinessDays('2026-05-14', '2026-05-16', CAL_A)).toBe(0);
  });
});

describe('rollToBusinessDay — opt-in, and directional by statute not by taste', () => {
  it('following rolls FORWARD past weekend and holiday alike', () => {
    expect(rollToBusinessDay('2026-05-15', 'following', CAL_A)).toBe('2026-05-17'); // Fri → Sun
    expect(rollToBusinessDay('2026-05-19', 'following', CAL_A)).toBe('2026-05-21'); // holiday → Thu
  });

  it('preceding rolls BACKWARD — the renewal-before-expiry direction', () => {
    expect(rollToBusinessDay('2026-05-15', 'preceding', CAL_A)).toBe('2026-05-14'); // Fri → Thu
    expect(rollToBusinessDay('2026-05-20', 'preceding', CAL_A)).toBe('2026-05-18'); // holiday → Mon
  });

  it('none leaves the date exactly as given, business day or not', () => {
    expect(rollToBusinessDay('2026-05-15', 'none', CAL_A)).toBe('2026-05-15');
    expect(rollToBusinessDay('2026-05-19', 'none', CAL_A)).toBe('2026-05-19');
  });

  it('is the identity on a date that is already a business day, in every convention', () => {
    for (const convention of ['following', 'preceding', 'none'] as const) {
      expect(rollToBusinessDay('2026-05-18', convention, CAL_A)).toBe('2026-05-18');
    }
  });

  it('rejects an unrecognised convention rather than defaulting to one', () => {
    // A silent default here picks a statutory direction on the caller's behalf.
    expectDomainCode(
      // @ts-expect-error — the convention set is closed.
      () => rollToBusinessDay('2026-05-15', 'nearest', CAL_A),
      'CALENDAR_UNAVAILABLE',
    );
  });
});

describe('nextBusinessDay / previousBusinessDay are STRICT (never return the input)', () => {
  it('moves at least one day even from a business day', () => {
    expect(nextBusinessDay('2026-05-18', CAL_A)).toBe('2026-05-21'); // Mon → Thu (2 holidays)
    expect(previousBusinessDay('2026-05-21', CAL_A)).toBe('2026-05-18'); // Thu → Mon
    expect(nextBusinessDay('2026-05-14', CAL_A)).toBe('2026-05-17'); // Thu → Sun (weekend)
    expect(previousBusinessDay('2026-05-17', CAL_A)).toBe('2026-05-14'); // Sun → Thu
  });

  it('equals addBusinessDays(±1) exactly, so there is one implementation of the walk', () => {
    for (const date of ['2026-05-10', '2026-05-14', '2026-05-15', '2026-05-19', '2026-05-21']) {
      expect(nextBusinessDay(date, CAL_A)).toBe(addBusinessDays(date, 1, CAL_A));
      expect(previousBusinessDay(date, CAL_A)).toBe(addBusinessDays(date, -1, CAL_A));
    }
  });
});

describe('the holiday calendar is a PARAMETER, never ambient state', () => {
  it('gives different answers for different calendars in the same process', () => {
    const strict = buildHolidayCalendar({
      ...CAL_A_INPUT,
      observed: [
        ...(CAL_A_INPUT.observed ?? []),
        { date: '2026-05-21', nameEn: 'Extra day', nameAr: 'يوم إضافي' },
      ],
    });
    expect(addBusinessDays('2026-05-18', 1, CAL_A)).toBe('2026-05-21');
    expect(addBusinessDays('2026-05-18', 1, strict)).toBe('2026-05-24');
    // CAL_A is unchanged — building a calendar must not mutate its input or any shared state.
    expect(holidayOn(civilDate('2026-05-21'), CAL_A)).toBeNull();
  });

  it('is frozen: a caller cannot widen a built calendar after the fact', () => {
    expect(Object.isFrozen(CAL_A)).toBe(true);
    expect(() => {
      (CAL_A.holidays as unknown as Map<string, unknown>).delete('2026-05-19');
    }).toThrow();
    expect(holidayOn(civilDate('2026-05-19'), CAL_A)).not.toBeNull();
  });
});
