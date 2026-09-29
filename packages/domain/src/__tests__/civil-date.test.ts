/**
 * Civil (Gregorian) calendar-date arithmetic — the substrate every other date engine sits on.
 *
 * These are not "date library" tests for their own sake. Three of the assertions below decide
 * whether a statutory filing date is right or wrong:
 *
 *  1. **A calendar date is not an instant.** `CivilDate` is a `YYYY-MM-DD` string, never a
 *     `Date`. A `Date` carries a time and a zone; "the deed was registered on 1980-03-11" does
 *     not. Anchoring everything at UTC midnight and doing the arithmetic on the calendar (not on
 *     epoch milliseconds plus a timezone offset) is what makes the suite deterministic under any
 *     `TZ` (EXIT-2 requires determinism under `TZ=UTC`; these tests hold under any TZ).
 *  2. **Month/year arithmetic CLAMPS, never overflows.** The 3-month post-fiscal-year-end
 *     distribution window (⚠ unverified — confirm vs primary law) applied to a 30 November
 *     year-end must land in February, not spill into March. A library that returns 2027-03-02
 *     for "2026-11-30 + 3 months" produces a deadline two days late, every time, silently.
 *  3. **A malformed or non-existent date THROWS.** `new Date('2026-02-30')` rolls forward to
 *     2026-03-02 without complaint. That is a data-integrity failure disguised as a value.
 */

import { describe, expect, it } from 'vitest';

import {
  WEEKDAY_CODES,
  addCalendarDays,
  addCalendarMonths,
  addCalendarYears,
  civilDate,
  civilDateFromInstant,
  civilDateFromParts,
  civilDateFromUtcDate,
  civilDateToUtcDate,
  compareCivilDates,
  differenceInCalendarDays,
  weekdayCodeOf,
  weekdayOf,
} from '../dates/civil-date.js';

describe('civilDate construction', () => {
  it('accepts a zero-padded YYYY-MM-DD calendar date', () => {
    expect(civilDate('2026-05-10')).toBe('2026-05-10');
    expect(civilDate('1978-05-01')).toBe('1978-05-01');
    expect(civilDate('2028-02-29')).toBe('2028-02-29');
  });

  it('rejects anything that is not a bare, zero-padded calendar date', () => {
    for (const bad of [
      '2026-5-10', // unpadded month
      '2026-05-1', // unpadded day
      '26-05-10', // two-digit year
      '2026/05/10',
      '2026-05-10T00:00:00Z', // an instant, not a calendar date
      '2026-05-10 ', // trailing space — the classic database-row input
      ' 2026-05-10',
      '',
      'not-a-date',
    ]) {
      expect(() => civilDate(bad)).toThrow(RangeError);
    }
  });

  it('rejects a date that does not exist rather than rolling it forward', () => {
    // `new Date('2026-02-30')` silently yields 2026-03-02. That is the bug this guards.
    expect(() => civilDate('2026-02-30')).toThrow(RangeError);
    expect(() => civilDate('2027-02-29')).toThrow(RangeError); // 2027 is not a leap year
    expect(() => civilDate('2026-04-31')).toThrow(RangeError);
    expect(() => civilDate('2026-13-01')).toThrow(RangeError);
    expect(() => civilDate('2026-00-10')).toThrow(RangeError);
    expect(() => civilDate('2026-05-00')).toThrow(RangeError);
  });

  it('builds from parts, and rejects non-integer or out-of-range parts', () => {
    expect(civilDateFromParts(2026, 5, 10)).toBe('2026-05-10');
    expect(civilDateFromParts(1882, 11, 12)).toBe('1882-11-12');
    expect(() => civilDateFromParts(2026, 2, 30)).toThrow(RangeError);
    expect(() => civilDateFromParts(2026, 5, 10.5)).toThrow(RangeError);
    expect(() => civilDateFromParts(Number.NaN, 5, 10)).toThrow(RangeError);
    expect(() => civilDateFromParts(2026, 13, 1)).toThrow(RangeError);
  });

  it('round-trips through a UTC Date without shifting the calendar day', () => {
    const utc = civilDateToUtcDate(civilDate('2026-05-10'));
    expect(utc.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    expect(civilDateFromUtcDate(utc)).toBe('2026-05-10');
    expect(() => civilDateFromUtcDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('civilDateFromInstant — the ONE place a zone is allowed to matter', () => {
  /**
   * An audit event is an instant; the Hijri snapshot frozen beside it is a calendar date. The
   * conversion needs an explicit zone, and the zone is a PARAMETER — never `process.env.TZ`,
   * never the host default. Riyadh is UTC+03:00, so any instant between 21:00Z and 24:00Z is
   * ALREADY the next calendar day in Saudi Arabia. A filing recorded at 22:30Z on the deadline
   * is a day late in Riyadh.
   */
  it('resolves an instant to the calendar day in the named zone', () => {
    const instant = new Date('2026-05-10T21:30:00.000Z');
    expect(civilDateFromInstant(instant, 'UTC')).toBe('2026-05-10');
    expect(civilDateFromInstant(instant, 'Asia/Riyadh')).toBe('2026-05-11');
  });

  it('resolves an instant before the UTC+3 rollover to the same day in both zones', () => {
    const instant = new Date('2026-05-10T06:00:00.000Z');
    expect(civilDateFromInstant(instant, 'UTC')).toBe('2026-05-10');
    expect(civilDateFromInstant(instant, 'Asia/Riyadh')).toBe('2026-05-10');
  });

  it('throws on an invalid instant or an unknown zone rather than guessing', () => {
    expect(() => civilDateFromInstant(new Date(Number.NaN), 'UTC')).toThrow(RangeError);
    expect(() => civilDateFromInstant(new Date('2026-05-10T00:00:00Z'), 'Mars/Olympus')).toThrow();
  });
});

describe('weekdayOf', () => {
  /**
   * 0 = Sunday … 6 = Saturday, matching `Date.prototype.getUTCDay()`. The KSA weekend is
   * Friday/Saturday (5/6), so these numbers are load-bearing for every business-day walk.
   */
  it('numbers the week Sunday-first, matching getUTCDay', () => {
    expect(weekdayOf(civilDate('2026-05-10'))).toBe(0); // Sunday
    expect(weekdayOf(civilDate('2026-05-11'))).toBe(1); // Monday
    expect(weekdayOf(civilDate('2026-05-15'))).toBe(5); // Friday  — KSA weekend
    expect(weekdayOf(civilDate('2026-05-16'))).toBe(6); // Saturday — KSA weekend
    expect(weekdayOf(civilDate('2026-05-17'))).toBe(0); // Sunday
  });
});

describe('weekdayCodeOf / WEEKDAY_CODES — the number↔code map the workweek is expressed in', () => {
  /**
   * `Setting calendar.workweek` is a list of CODES; the business-day walk asks a date for its code
   * and tests membership. So "Friday is 5 is 'FRI'" is the hinge the entire KSA weekend hangs on,
   * and it is asserted BEHAVIOURALLY here rather than only structurally.
   *
   * A mutation run showed why: swapping `'FRI'` and `'SAT'` inside `WEEKDAY_CODES` changes nothing
   * observable in the business-day suite, because the weekend happens to be exactly those two days
   * so membership in `{FRI, SAT}` is unaffected. Only a direct assertion on the mapping catches a
   * reordering — and a THU/FRI slip, which the same reordering bug would equally produce, moves
   * every statutory deadline.
   */
  it('maps every weekday number to its code, Sunday-first', () => {
    expect(WEEKDAY_CODES).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
    expect(WEEKDAY_CODES).toHaveLength(7);
    expect(new Set(WEEKDAY_CODES).size).toBe(7);
  });

  it('agrees with weekdayOf on real dates, including both KSA weekend days', () => {
    const cases: ReadonlyArray<readonly [string, number, string]> = [
      ['2026-05-10', 0, 'SUN'],
      ['2026-05-11', 1, 'MON'],
      ['2026-05-12', 2, 'TUE'],
      ['2026-05-13', 3, 'WED'],
      ['2026-05-14', 4, 'THU'],
      ['2026-05-15', 5, 'FRI'], // KSA weekend day 1
      ['2026-05-16', 6, 'SAT'], // KSA weekend day 2
    ];
    for (const [date, number, code] of cases) {
      expect(weekdayOf(civilDate(date))).toBe(number);
      expect(weekdayCodeOf(civilDate(date))).toBe(code);
      expect(WEEKDAY_CODES[number]).toBe(code);
    }
  });

  it('is frozen, so no caller can reorder the week at runtime', () => {
    expect(Object.isFrozen(WEEKDAY_CODES)).toBe(true);
  });
});

describe('compareCivilDates / differenceInCalendarDays', () => {
  it('orders dates chronologically and returns exactly -1 | 0 | 1', () => {
    expect(compareCivilDates(civilDate('2026-05-10'), civilDate('2026-05-11'))).toBe(-1);
    expect(compareCivilDates(civilDate('2026-05-11'), civilDate('2026-05-10'))).toBe(1);
    expect(compareCivilDates(civilDate('2026-05-10'), civilDate('2026-05-10'))).toBe(0);
    // Year and month boundaries — a naive string compare on unpadded input would get these wrong.
    expect(compareCivilDates(civilDate('2026-12-31'), civilDate('2027-01-01'))).toBe(-1);
    expect(compareCivilDates(civilDate('2026-09-30'), civilDate('2026-10-01'))).toBe(-1);
  });

  it('counts whole days FROM the first argument TO the second (positive when `to` is later)', () => {
    expect(differenceInCalendarDays(civilDate('2026-05-10'), civilDate('2026-05-20'))).toBe(10);
    expect(differenceInCalendarDays(civilDate('2026-05-20'), civilDate('2026-05-10'))).toBe(-10);
    expect(differenceInCalendarDays(civilDate('2026-05-10'), civilDate('2026-05-10'))).toBe(0);
  });

  it('counts across a leap day and across the DST transitions of other zones', () => {
    // 2028 is a leap year: February has 29 days.
    expect(differenceInCalendarDays(civilDate('2028-02-01'), civilDate('2028-03-01'))).toBe(29);
    expect(differenceInCalendarDays(civilDate('2027-02-01'), civilDate('2027-03-01'))).toBe(28);
    // Northern-hemisphere DST weekend. Calendar arithmetic must not lose or gain an hour-derived
    // day; KSA has no DST but a CI runner's host zone might.
    expect(differenceInCalendarDays(civilDate('2026-03-28'), civilDate('2026-03-30'))).toBe(2);
  });
});

describe('addCalendarDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addCalendarDays(civilDate('2026-05-10'), 1)).toBe('2026-05-11');
    expect(addCalendarDays(civilDate('2026-05-31'), 1)).toBe('2026-06-01');
    expect(addCalendarDays(civilDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addCalendarDays(civilDate('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addCalendarDays(civilDate('2027-02-28'), 1)).toBe('2027-03-01');
    expect(addCalendarDays(civilDate('2026-01-01'), -1)).toBe('2025-12-31');
    expect(addCalendarDays(civilDate('2026-05-10'), 0)).toBe('2026-05-10');
  });

  it('rejects a non-integer offset', () => {
    expect(() => addCalendarDays(civilDate('2026-05-10'), 1.5)).toThrow(RangeError);
    expect(() => addCalendarDays(civilDate('2026-05-10'), Number.NaN)).toThrow(RangeError);
  });
});

describe('addCalendarMonths — CLAMPS to the last day of the target month', () => {
  /**
   * THE VECTOR THAT MATTERS: the 3-month post-fiscal-year-end distribution window
   * (⚠ unverified — confirm vs primary law) run off a 30 November year-end.
   * Overflow semantics would give 2027-03-02 — a deadline reported two days late.
   */
  it('clamps 2026-11-30 + 3 months to 2027-02-28, never 2027-03-02', () => {
    expect(addCalendarMonths(civilDate('2026-11-30'), 3)).toBe('2027-02-28');
  });

  it('clamps into a LEAP February when the target year has one', () => {
    expect(addCalendarMonths(civilDate('2027-11-30'), 3)).toBe('2028-02-29');
  });

  it('leaves a day that exists in the target month alone', () => {
    expect(addCalendarMonths(civilDate('2026-12-31'), 3)).toBe('2027-03-31');
    expect(addCalendarMonths(civilDate('2026-01-15'), 1)).toBe('2026-02-15');
  });

  /**
   * PRESERVES THE DAY OF MONTH — it is NOT an "end of month" operator.
   *
   * `2027-09-30 + 3 months` is **2027-12-30**, not 2027-12-31: 30 September is the last day of its
   * month, but 30 December is a perfectly ordinary day of December, so nothing is clamped.
   *
   * Whether the statutory 3-month post-fiscal-year-end distribution window
   * (⚠ verify — may be stale; confirm vs primary law) means "the same day of month, three months
   * on" or "the END of the third month" is a question of law, not of arithmetic — so this
   * primitive refuses to decide it. `computeDeadline` makes the caller declare a `monthAnchor`
   * explicitly, and has no default. See `deadline.test.ts`.
   */
  it('does NOT promote a month-end start to a month-end result', () => {
    expect(addCalendarMonths(civilDate('2027-09-30'), 3)).toBe('2027-12-30');
    expect(addCalendarMonths(civilDate('2026-04-30'), 1)).toBe('2026-05-30'); // not 05-31
    expect(addCalendarMonths(civilDate('2026-02-28'), 1)).toBe('2026-03-28'); // not 03-31
  });

  it('clamps every 31st into a 30-day month', () => {
    expect(addCalendarMonths(civilDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addCalendarMonths(civilDate('2026-03-31'), 1)).toBe('2026-04-30');
    expect(addCalendarMonths(civilDate('2026-05-31'), 1)).toBe('2026-06-30');
  });

  it('works backwards and across year boundaries', () => {
    expect(addCalendarMonths(civilDate('2027-03-31'), -1)).toBe('2027-02-28');
    expect(addCalendarMonths(civilDate('2026-01-31'), -2)).toBe('2025-11-30');
    expect(addCalendarMonths(civilDate('2026-06-15'), -12)).toBe('2025-06-15');
    expect(addCalendarMonths(civilDate('2026-05-10'), 0)).toBe('2026-05-10');
  });

  it('rejects a non-integer month offset', () => {
    expect(() => addCalendarMonths(civilDate('2026-05-10'), 1.5)).toThrow(RangeError);
  });
});

describe('addCalendarYears — CLAMPS a leap day into a common year', () => {
  it('clamps 2028-02-29 + 10 years to 2038-02-28', () => {
    expect(addCalendarYears(civilDate('2028-02-29'), 10)).toBe('2038-02-28');
  });

  it('keeps a leap day when the target year is also a leap year', () => {
    expect(addCalendarYears(civilDate('2028-02-29'), 4)).toBe('2032-02-29');
    // 2100 is NOT a leap year (divisible by 100, not by 400) — the century rule.
    expect(addCalendarYears(civilDate('2096-02-29'), 4)).toBe('2100-02-28');
  });

  it('is exactly addCalendarMonths(d, n * 12)', () => {
    // The ≥10-year document retention period (⚠ unverified — confirm vs primary law) is expressed
    // in years; it must agree with the month engine rather than being a second implementation.
    for (const start of ['2026-01-31', '2028-02-29', '2026-12-31', '2026-05-10']) {
      for (const years of [1, 4, 10, -1, -10]) {
        expect(addCalendarYears(civilDate(start), years)).toBe(
          addCalendarMonths(civilDate(start), years * 12),
        );
      }
    }
  });
});
