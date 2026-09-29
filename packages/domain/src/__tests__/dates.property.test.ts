/**
 * Property tests for the date engines (D1–D8).
 *
 * The vector tests in the sibling files pin the specific dates the regulation and the fixture care
 * about. These properties pin the ALGEBRA — the invariants that must hold for every date in the
 * covered window, not only the ones someone thought to write down. A business-day walk that is
 * right on the ten dates in `business-days.test.ts` and wrong on the eleventh still files a late
 * return.
 *
 * ## D5 deserves its own warning
 *
 * `addBusinessDays(addBusinessDays(d, n), -n) === d` is TRUE ONLY WHEN `d` is itself a business
 * day. It is intuitively appealing as an unconditional property, and it is false: from Friday
 * 2026-05-15, +1 business day is Sunday 2026-05-17, and −1 from there is Thursday 2026-05-14 — not
 * the Friday you started on. The information that the start was a non-business day is destroyed by
 * the first step, and it cannot be recovered.
 *
 * The failing case is therefore PINNED EXPLICITLY below, so that anyone who later "tidies up" the
 * guard into the unconditional form gets a red test instead of a plausible-looking refactor.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  KSA_DEFAULT_WORKWEEK,
  addBusinessDays,
  buildHolidayCalendar,
  countBusinessDays,
  isBusinessDay,
  type HolidayCalendar,
} from '../dates/business-days.js';
import {
  addCalendarDays,
  civilDate,
  compareCivilDates,
  differenceInCalendarDays,
  type CivilDate,
} from '../dates/civil-date.js';
import { HIJRI_SUPPORTED_RANGE, fromHijri, toHijri } from '../dates/hijri.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Fixture calendar and generators
 *
 * COVERAGE MARGIN IS DELIBERATE. The calendar covers 2025-01-01 … 2028-12-31 but dates are drawn
 * only from 2026-01-01 … 2027-12-31 and |n| ≤ 25. The widest possible walk (25 business days over
 * a Sun–Thu week plus holidays) is well under a year, so no property can fail merely by stepping
 * out of coverage — a CALENDAR_UNAVAILABLE inside a property would mask the invariant it is
 * meant to test.
 * ──────────────────────────────────────────────────────────────────────────── */

const COVERAGE_FROM = '2025-01-01';
const COVERAGE_TO = '2028-12-31';
const DRAW_FROM = civilDate('2026-01-01');
const DRAW_TO = civilDate('2027-12-31');
const DRAW_SPAN = differenceInCalendarDays(DRAW_FROM, DRAW_TO);

/**
 * CAL-P: the Sun–Thu KSA workweek, two mid-week observed holidays, and one MOVING Hijri rule
 * (1 Shawwal + 3 days) so the properties exercise a lunar holiday in every covered year rather
 * than only the two hand-written Gregorian ones.
 */
const CAL_P: HolidayCalendar = buildHolidayCalendar({
  workweek: KSA_DEFAULT_WORKWEEK,
  coverage: { from: COVERAGE_FROM, to: COVERAGE_TO },
  observed: [
    { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
    { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
  ],
  rules: [
    {
      kind: 'hijri_recurring',
      id: 'eid-al-fitr',
      nameEn: 'Eid al-Fitr (fixture)',
      nameAr: 'عيد الفطر (تجريبي)',
      hijriMonth: 10,
      hijriDay: 1,
      spanDays: 3,
    },
  ],
});

/** A civil date drawn uniformly from the safe inner window. */
const arbDate = fc
  .integer({ min: 0, max: DRAW_SPAN })
  .map((offset) => addCalendarDays(DRAW_FROM, offset));

/** A business-day offset small enough that the walk cannot leave coverage. */
const arbOffset = fc.integer({ min: -25, max: 25 });
const arbNonNegativeOffset = fc.integer({ min: 0, max: 25 });
const arbPositiveOffset = fc.integer({ min: 1, max: 20 });

describe('D1 — addBusinessDays(d, 0, c) === d for EVERY d, business day or not', () => {
  it('never rolls on a zero-length window', () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        expect(addBusinessDays(date, 0, CAL_P)).toBe(date);
      }),
      { numRuns: 400 },
    );
  });

  it('holds specifically on weekends and holidays, where a roll is most tempting', () => {
    for (const date of ['2026-05-15', '2026-05-16', '2026-05-19', '2026-03-20', '2026-03-22']) {
      expect(addBusinessDays(date, 0, CAL_P)).toBe(date);
      expect(isBusinessDay(date, CAL_P)).toBe(false);
    }
  });
});

describe('D2 — for n !== 0 the result is ALWAYS a business day', () => {
  it('lands on a business day in both directions, so no terminal roll is ever needed', () => {
    fc.assert(
      fc.property(arbDate, arbOffset, (date, n) => {
        fc.pre(n !== 0);
        expect(isBusinessDay(addBusinessDays(date, n, CAL_P), CAL_P)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });
});

describe('D3 — addBusinessDays is STRICTLY monotonic in n', () => {
  it('gives a strictly later date for a strictly larger n', () => {
    fc.assert(
      fc.property(arbDate, arbOffset, arbOffset, (date, a, b) => {
        fc.pre(a !== b);
        const [smaller, larger] = a < b ? [a, b] : [b, a];
        const earlier = addBusinessDays(date, smaller, CAL_P);
        const later = addBusinessDays(date, larger, CAL_P);
        expect(compareCivilDates(earlier, later)).toBe(-1);
      }),
      { numRuns: 400 },
    );
  });

  it('brackets the n === 0 identity: result(-1) < d < result(+1)', () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        expect(compareCivilDates(addBusinessDays(date, -1, CAL_P), date)).toBe(-1);
        expect(compareCivilDates(date, addBusinessDays(date, 1, CAL_P))).toBe(-1);
      }),
      { numRuns: 200 },
    );
  });
});

describe('D4 — countBusinessDays inverts addBusinessDays for n >= 0', () => {
  it('counts back exactly the n that was added', () => {
    fc.assert(
      fc.property(arbDate, arbNonNegativeOffset, (date, n) => {
        expect(countBusinessDays(date, addBusinessDays(date, n, CAL_P), CAL_P)).toBe(n);
      }),
      { numRuns: 400 },
    );
  });
});

describe('D5 — the involution holds ONLY when the start is itself a business day', () => {
  it('round-trips when isBusinessDay(d, c)', () => {
    fc.assert(
      fc.property(arbDate, arbOffset, (date, n) => {
        fc.pre(isBusinessDay(date, CAL_P));
        expect(addBusinessDays(addBusinessDays(date, n, CAL_P), -n, CAL_P)).toBe(date);
      }),
      { numRuns: 400 },
    );
  });

  /**
   * THE PINNED FAILURE CASE. Do NOT "simplify" D5 by deleting the `isBusinessDay` precondition:
   * the unconditional property is FALSE, and this test exists to prove it stays false rather than
   * being quietly accepted as a rounding quirk.
   */
  it('FAILS on purpose from a non-business-day start — Friday 2026-05-15 does not survive ±1', () => {
    const friday = civilDate('2026-05-15');
    expect(isBusinessDay(friday, CAL_P)).toBe(false);
    const forward = addBusinessDays(friday, 1, CAL_P);
    expect(forward).toBe('2026-05-17'); // Sunday
    const back = addBusinessDays(forward, -1, CAL_P);
    expect(back).toBe('2026-05-14'); // Thursday — NOT the Friday we started on
    expect(back).not.toBe(friday);
  });

  it('FAILS on purpose from a holiday start too, so the cause is not read as "weekend only"', () => {
    const holiday = civilDate('2026-05-19');
    expect(isBusinessDay(holiday, CAL_P)).toBe(false);
    expect(addBusinessDays(addBusinessDays(holiday, 1, CAL_P), -1, CAL_P)).toBe('2026-05-18');
  });

  it('finds NO counter-example when the start IS a business day (exhaustive over a month)', () => {
    // Exhaustive rather than sampled, over the month containing both the weekend and the holiday
    // pair, so the precondition is shown to be exactly the right one — not merely sufficient.
    for (let offset = 0; offset < 31; offset += 1) {
      const date = addCalendarDays(civilDate('2026-05-01'), offset);
      for (const n of [-5, -2, -1, 1, 2, 5]) {
        const roundTrip = addBusinessDays(addBusinessDays(date, n, CAL_P), -n, CAL_P);
        if (isBusinessDay(date, CAL_P)) {
          expect(roundTrip).toBe(date);
        } else {
          expect(roundTrip).not.toBe(date);
        }
      }
    }
  });
});

describe('D6 — fromHijri ∘ toHijri is the identity across the whole supported range', () => {
  const RANGE_SPAN = differenceInCalendarDays(
    HIJRI_SUPPORTED_RANGE.minCivilDate,
    HIJRI_SUPPORTED_RANGE.maxCivilDate,
  );

  it('spans the full Umm al-Qura table window (1882-11-12 … 2174-11-25)', () => {
    expect(RANGE_SPAN).toBeGreaterThan(100_000);
  });

  it('round-trips every sampled civil date with no drift', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: RANGE_SPAN }), (offset) => {
        const date: CivilDate = addCalendarDays(HIJRI_SUPPORTED_RANGE.minCivilDate, offset);
        expect(fromHijri(toHijri(date))).toBe(date);
      }),
      { numRuns: 600 },
    );
  });

  it('round-trips the exact boundaries', () => {
    for (const date of [HIJRI_SUPPORTED_RANGE.minCivilDate, HIJRI_SUPPORTED_RANGE.maxCivilDate]) {
      expect(fromHijri(toHijri(date))).toBe(date);
    }
  });

  it('is strictly order-preserving — a later civil date is never an earlier Hijri date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: RANGE_SPAN }),
        fc.integer({ min: 0, max: RANGE_SPAN }),
        (a, b) => {
          fc.pre(a !== b);
          const [earlier, later] = a < b ? [a, b] : [b, a];
          const left = toHijri(addCalendarDays(HIJRI_SUPPORTED_RANGE.minCivilDate, earlier));
          const right = toHijri(addCalendarDays(HIJRI_SUPPORTED_RANGE.minCivilDate, later));
          // Both are zero-padded `yyyy-MM-dd` in Latin digits, so a string compare IS the order.
          expect(left < right).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('D7 — countBusinessDays inverts a BACKWARD walk symmetrically', () => {
  /**
   * Not in the original brief's D-list, added because negative `n` is a supported input (pre-alert
   * offsets, and the `preceding` roll direction) and an asymmetric count would make every
   * "days remaining" figure wrong by one whenever the anchor is a weekend.
   */
  it('returns exactly -n for a backward walk, whatever the start day is', () => {
    fc.assert(
      fc.property(arbDate, arbNonNegativeOffset, (date, n) => {
        // n === 0 is excluded only because `-0` is not `Object.is`-equal to the `+0` the count
        // returns; the value itself is right. The zero case is pinned separately below.
        fc.pre(n !== 0);
        expect(countBusinessDays(date, addBusinessDays(date, -n, CAL_P), CAL_P)).toBe(-n);
      }),
      { numRuns: 400 },
    );
  });

  it('returns a plain 0 (not -0) for a zero-length backward window', () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        expect(countBusinessDays(date, addBusinessDays(date, -0, CAL_P), CAL_P)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('holds from a Friday and from a holiday, the cases the forward-only convention breaks', () => {
    expect(countBusinessDays('2026-05-15', addBusinessDays('2026-05-15', -1, CAL_P), CAL_P)).toBe(
      -1,
    );
    expect(countBusinessDays('2026-05-19', addBusinessDays('2026-05-19', -1, CAL_P), CAL_P)).toBe(
      -1,
    );
  });
});

describe('D8 — adding a holiday can only push a forward deadline LATER, never earlier', () => {
  it('is monotonic in the holiday set for n > 0', () => {
    fc.assert(
      fc.property(arbDate, arbPositiveOffset, arbDate, (start, n, extraHoliday) => {
        const widened = buildHolidayCalendar({
          workweek: KSA_DEFAULT_WORKWEEK,
          coverage: { from: COVERAGE_FROM, to: COVERAGE_TO },
          observed: [
            { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
            { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
            { date: extraHoliday, nameEn: 'Extra', nameAr: 'إضافي' },
          ],
          rules: [
            {
              kind: 'hijri_recurring',
              id: 'eid-al-fitr',
              nameEn: 'Eid al-Fitr (fixture)',
              nameAr: 'عيد الفطر (تجريبي)',
              hijriMonth: 10,
              hijriDay: 1,
              spanDays: 3,
            },
          ],
        });
        const base = addBusinessDays(start, n, CAL_P);
        const withExtra = addBusinessDays(start, n, widened);
        expect(compareCivilDates(withExtra, base)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 120 },
    );
  });

  it('is symmetric backwards: adding a holiday can only push a backward result EARLIER', () => {
    const widened = buildHolidayCalendar({
      workweek: KSA_DEFAULT_WORKWEEK,
      coverage: { from: COVERAGE_FROM, to: COVERAGE_TO },
      observed: [
        { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
        { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
        { date: '2026-05-25', nameEn: 'Extra', nameAr: 'إضافي' },
      ],
      rules: [
        {
          kind: 'hijri_recurring',
          id: 'eid-al-fitr',
          nameEn: 'Eid al-Fitr (fixture)',
          nameAr: 'عيد الفطر (تجريبي)',
          hijriMonth: 10,
          hijriDay: 1,
          spanDays: 3,
        },
      ],
    });
    fc.assert(
      fc.property(arbDate, arbPositiveOffset, (start, n) => {
        const base = addBusinessDays(start, -n, CAL_P);
        const withExtra = addBusinessDays(start, -n, widened);
        expect(compareCivilDates(withExtra, base)).toBeLessThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });
});
