/**
 * Statutory deadline computation — where the calendar engines meet the regulation.
 *
 * ## Binding rule 3 is the point of this file
 *
 * **Every** window figure in the Nazarah regulation is UNVERIFIED until confirmed against primary
 * Saudi law: the 30 / 15 / 10-business-day deadlines, the 3-month post-fiscal-year-end
 * distribution window, the ≥10-year retention period. None of them may be a constant in this
 * package. `computeDeadline` therefore takes a `DeadlineWindow` that names the `Setting` key its
 * figure came from, refuses to run when the figure is absent (`SETTING_MISSING` — never a
 * default), and carries the "⚠ verify — may be stale (confirm vs primary law)" marker out in the
 * result so the caveat reaches a UI or a report rather than dying at the resolver.
 *
 * ## Two ways to be wrong that both look right
 *
 *  - **Month arithmetic that overflows instead of clamping.** A 30 November fiscal year end plus
 *    three months is 28 February, not 2 March. Two days late, silently, every year.
 *  - **A roll direction chosen by taste.** `following` and `preceding` are STATUTORY: you file
 *    AFTER a trigger event, you renew BEFORE an expiry. `computeDeadline` will not pick one.
 */

import { describe, expect, it } from 'vitest';

import {
  KSA_DEFAULT_WORKWEEK,
  buildHolidayCalendar,
  type HolidayCalendarInput,
} from '../dates/business-days.js';
import { addCalendarMonths, addCalendarYears, civilDate } from '../dates/civil-date.js';
import { computeDeadline, dual } from '../dates/deadline.js';
import { type DomainError, isDomainError } from '../errors.js';

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

/** Same CAL-A as the business-day suite: Sun–Thu workweek, two mid-week observed holidays. */
const CAL_A_INPUT: HolidayCalendarInput = {
  workweek: KSA_DEFAULT_WORKWEEK,
  coverage: { from: '2025-01-01', to: '2028-12-31' },
  observed: [
    { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
    { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
  ],
};
const CAL_A = buildHolidayCalendar(CAL_A_INPUT);

/**
 * The 3-month post-fiscal-year-end distribution window, shaped as it will arrive from
 * `Setting distribution.postFyeWindow.months`.
 *
 * ⚠ verify — may be stale (confirm vs primary law). The figure is NOT hardcoded in the engine;
 * this literal lives in a test fixture, which is exactly where a provisional figure belongs.
 *
 * `monthAnchor: 'end_of_month'` is the reading under which a 30 September fiscal year end has until
 * 31 December — i.e. the window runs to the END of the third month. It is used here because a
 * fiscal year end is always a month end, and because it is the reading the E2 exit vectors encode.
 * **It is not a settled legal position** — see the `monthAnchor` block near the bottom of this file.
 */
const POST_FYE_3_MONTHS = {
  settingKey: 'distribution.postFyeWindow.months',
  calendarMonths: 3,
  monthAnchor: 'end_of_month',
} as const;

describe('addCalendarMonths / addCalendarYears clamp (re-pinned here because deadlines depend on it)', () => {
  it('clamps a 30 November year end + 3 months to 28 February, never 2 March', () => {
    expect(addCalendarMonths(civilDate('2026-11-30'), 3)).toBe('2027-02-28');
  });

  it('clamps into a leap February when the target year has one', () => {
    expect(addCalendarMonths(civilDate('2027-11-30'), 3)).toBe('2028-02-29');
  });

  it('clamps a leap day out of a common year ten years later', () => {
    expect(addCalendarYears(civilDate('2028-02-29'), 10)).toBe('2038-02-28');
  });
});

describe('computeDeadline — calendar-month windows', () => {
  it('lands on a business day with no roll needed: 2026-12-31 + 3 months = 2027-03-31', () => {
    const result = computeDeadline({
      from: '2026-12-31',
      window: POST_FYE_3_MONTHS,
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.rawDue.gregorian).toBe('2027-03-31'); // Wednesday — already a business day
    expect(result.due.gregorian).toBe('2027-03-31');
    expect(result.rolled).toBe(false);
    expect(result.basis).toBe('calendar_months');
  });

  it('ROLLS FORWARD when the raw due date lands on a Friday: 2027-09-30 + 3 months', () => {
    // 2027-09-30 + 3 months = 2027-12-31, which is a FRIDAY (KSA weekend). `following` rolls past
    // Sat 2028-01-01 to Sun 2028-01-02.
    const result = computeDeadline({
      from: '2027-09-30',
      window: POST_FYE_3_MONTHS,
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.rawDue.gregorian).toBe('2027-12-31');
    expect(result.due.gregorian).toBe('2028-01-02');
    expect(result.rolled).toBe(true);
  });

  it('ROLLS FORWARD when the raw due date lands on a seeded holiday', () => {
    // Day-of-month reading: 2026-02-19 + 3 months = 2026-05-19, a seeded holiday; 05-20 is the
    // second holiday day; so the deadline rolls to Thu 2026-05-21.
    const result = computeDeadline({
      from: '2026-02-19',
      window: {
        settingKey: 'compliance.someFiling.months',
        calendarMonths: 3,
        monthAnchor: 'day_of_month',
      },
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.rawDue.gregorian).toBe('2026-05-19');
    expect(result.due.gregorian).toBe('2026-05-21');
    expect(result.rolled).toBe(true);
  });

  it('rolls BACKWARD under `preceding` — the renew-before-expiry direction', () => {
    const result = computeDeadline({
      from: '2027-09-30',
      window: POST_FYE_3_MONTHS,
      calendar: CAL_A,
      roll: 'preceding',
    });
    expect(result.rawDue.gregorian).toBe('2027-12-31'); // Friday
    expect(result.due.gregorian).toBe('2027-12-30'); // Thursday
    expect(result.rolled).toBe(true);
  });

  it('leaves a non-business-day due date alone under `none`', () => {
    const result = computeDeadline({
      from: '2027-09-30',
      window: POST_FYE_3_MONTHS,
      calendar: CAL_A,
      roll: 'none',
    });
    expect(result.due.gregorian).toBe('2027-12-31');
    expect(result.rolled).toBe(false);
  });
});

describe('monthAnchor is REQUIRED — the engine will not pick a legal reading', () => {
  /**
   * "Within 3 months of the end of the fiscal year" has two readings, and a fiscal year end is
   * always a month end, so they differ on exactly the dates that matter. Both are pinned here; the
   * choice between them is a question of law and is surfaced to the user, not resolved in code
   * (CLAUDE.md binding rule 4).
   */
  it('gives two different answers for the same 30 September year end', () => {
    const dayOfMonth = computeDeadline({
      from: '2027-09-30',
      window: {
        settingKey: 'distribution.postFyeWindow.months',
        calendarMonths: 3,
        monthAnchor: 'day_of_month',
      },
      calendar: CAL_A,
      roll: 'following',
    });
    const endOfMonth = computeDeadline({
      from: '2027-09-30',
      window: POST_FYE_3_MONTHS, // end_of_month
      calendar: CAL_A,
      roll: 'following',
    });
    // 30 December is an ordinary day of December, so nothing is clamped.
    expect(dayOfMonth.rawDue.gregorian).toBe('2027-12-30');
    expect(dayOfMonth.due.gregorian).toBe('2027-12-30'); // Thursday — no roll needed
    // The end of the third month is 31 December, a Friday, which then rolls.
    expect(endOfMonth.rawDue.gregorian).toBe('2027-12-31');
    expect(endOfMonth.due.gregorian).toBe('2028-01-02');
  });

  it('agrees when the anchor is a 30 November year end (both clamp into February)', () => {
    for (const monthAnchor of ['day_of_month', 'end_of_month'] as const) {
      expect(
        computeDeadline({
          from: '2026-11-30',
          window: { settingKey: 'k', calendarMonths: 3, monthAnchor },
          calendar: CAL_A,
          roll: 'none',
        }).rawDue.gregorian,
      ).toBe('2027-02-28');
    }
  });

  it('throws SETTING_MISSING when a month window omits monthAnchor', () => {
    const error = caught(() =>
      computeDeadline({
        from: '2027-09-30',
        window: { settingKey: 'distribution.postFyeWindow.months', calendarMonths: 3 },
        calendar: CAL_A,
        roll: 'following',
      }),
    );
    expect(isDomainError(error)).toBe(true);
    expect((error as DomainError).code).toBe('SETTING_MISSING');
    expect((error as DomainError).message).toContain('monthAnchor');
  });

  it('throws SETTING_MISSING for an unrecognised monthAnchor rather than defaulting', () => {
    expectDomainCode(
      () =>
        computeDeadline({
          from: '2027-09-30',
          window: {
            settingKey: 'k',
            calendarMonths: 3,
            // @ts-expect-error — the anchor set is closed.
            monthAnchor: 'end_of_quarter',
          },
          calendar: CAL_A,
          roll: 'following',
        }),
      'SETTING_MISSING',
    );
  });

  it('rejects monthAnchor on a window that is not month-based (wrong Setting rows assembled)', () => {
    expectDomainCode(
      () =>
        computeDeadline({
          from: '2026-05-10',
          window: { settingKey: 'k', businessDays: 10, monthAnchor: 'end_of_month' },
          calendar: CAL_A,
          roll: 'none',
        }),
      'SETTING_MISSING',
    );
  });
});

describe('computeDeadline — business-day windows need no terminal roll', () => {
  /**
   * ⚠ verify — may be stale (confirm vs primary law): 10 business days is the istibdal
   * Authority-notice window in `docs/domain/nazarah-regulation.md`. It arrives from a `Setting`.
   */
  const ISTIBDAL_NOTICE = {
    settingKey: 'compliance.istibdalNotice.businessDays',
    businessDays: 10,
  } as const;

  it('reproduces the EXIT-2 vector through the deadline API', () => {
    const result = computeDeadline({
      from: '2026-05-10',
      window: ISTIBDAL_NOTICE,
      calendar: CAL_A,
      roll: 'none',
    });
    expect(result.due.gregorian).toBe('2026-05-26');
    expect(result.rawDue.gregorian).toBe('2026-05-26');
    expect(result.rolled).toBe(false);
    expect(result.basis).toBe('business_days');
  });

  it('is unaffected by the roll convention, because the result is already a business day', () => {
    for (const roll of ['following', 'preceding', 'none'] as const) {
      expect(
        computeDeadline({ from: '2026-05-10', window: ISTIBDAL_NOTICE, calendar: CAL_A, roll }).due
          .gregorian,
      ).toBe('2026-05-26');
    }
  });

  it('supports a negative window for a pre-alert offset', () => {
    const preAlert = {
      settingKey: 'compliance.preAlert.businessDays',
      businessDays: -3,
    } as const;
    // Three business days BEFORE Tue 2026-05-26: Mon 05-25, Sun 05-24, Thu 05-21.
    expect(
      computeDeadline({ from: '2026-05-26', window: preAlert, calendar: CAL_A, roll: 'none' }).due
        .gregorian,
    ).toBe('2026-05-21');
  });
});

describe('computeDeadline — calendar-day windows', () => {
  it('adds plain calendar days and then applies the requested roll', () => {
    const window = { settingKey: 'compliance.someWindow.calendarDays', calendarDays: 5 } as const;
    const result = computeDeadline({
      from: '2026-05-10',
      window,
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.rawDue.gregorian).toBe('2026-05-15'); // Friday
    expect(result.due.gregorian).toBe('2026-05-17'); // rolled to Sunday
    expect(result.basis).toBe('calendar_days');
  });
});

describe('the window figure is CONFIGURATION — a missing one throws, never defaults', () => {
  it('throws SETTING_MISSING when no figure was supplied, naming the Setting key', () => {
    const error = caught(() =>
      computeDeadline({
        from: '2026-05-10',
        window: { settingKey: 'distribution.postFyeWindow.months', monthAnchor: undefined },
        calendar: CAL_A,
        roll: 'following',
      }),
    );
    expect(isDomainError(error)).toBe(true);
    expect((error as DomainError).code).toBe('SETTING_MISSING');
    expect((error as DomainError).message).toContain('distribution.postFyeWindow.months');
  });

  it('throws SETTING_MISSING for an explicitly undefined figure (an unresolved Setting row)', () => {
    expectDomainCode(
      () =>
        computeDeadline({
          from: '2026-05-10',
          window: {
            settingKey: 'compliance.istibdalNotice.businessDays',
            businessDays: undefined,
          },
          calendar: CAL_A,
          roll: 'following',
        }),
      'SETTING_MISSING',
    );
  });

  it('refuses a window that names TWO bases — the caller must not be guessed at', () => {
    expectDomainCode(
      () =>
        computeDeadline({
          from: '2026-05-10',
          window: {
            settingKey: 'compliance.confused',
            businessDays: 10,
            calendarMonths: 3,
            monthAnchor: 'end_of_month',
          },
          calendar: CAL_A,
          roll: 'following',
        }),
      'SETTING_MISSING',
    );
  });

  it('refuses a non-integer or non-finite figure rather than truncating it', () => {
    for (const businessDays of [10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectDomainCode(
        () =>
          computeDeadline({
            from: '2026-05-10',
            window: { settingKey: 'compliance.istibdalNotice.businessDays', businessDays },
            calendar: CAL_A,
            roll: 'following',
          }),
        'SETTING_MISSING',
      );
    }
  });

  it('refuses a blank settingKey — provenance is mandatory, not decorative', () => {
    expectDomainCode(
      () =>
        computeDeadline({
          from: '2026-05-10',
          window: { settingKey: '   ', calendarMonths: 3 },
          calendar: CAL_A,
          roll: 'following',
        }),
      'SETTING_MISSING',
    );
  });
});

describe('the "unverified" marker travels with the result (binding rule 3)', () => {
  it('carries the stale-figure note and the Setting key by default', () => {
    const result = computeDeadline({
      from: '2026-12-31',
      window: POST_FYE_3_MONTHS,
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.window.settingKey).toBe('distribution.postFyeWindow.months');
    expect(result.unverifiedNote).not.toBeNull();
    expect(result.unverifiedNote).toContain('unverified');
    expect(result.unverifiedNote).toContain('primary law');
  });

  it('drops the note ONLY when the caller has explicitly recorded the figure as verified', () => {
    const result = computeDeadline({
      from: '2026-12-31',
      window: { ...POST_FYE_3_MONTHS, unverified: false },
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.unverifiedNote).toBeNull();
  });
});

describe('every deadline is DUAL-DATED (Gregorian + frozen Umm al-Qura)', () => {
  it('carries both calendars on `from`, `rawDue` and `due`', () => {
    const result = computeDeadline({
      from: '2027-09-30',
      window: POST_FYE_3_MONTHS,
      calendar: CAL_A,
      roll: 'following',
    });
    expect(result.from).toEqual({ gregorian: '2027-09-30', hijri: '1449-04-29' });
    expect(result.rawDue).toEqual({ gregorian: '2027-12-31', hijri: '1449-08-03' });
    expect(result.due).toEqual({ gregorian: '2028-01-02', hijri: '1449-08-05' });
  });

  it('agrees with the six frozen anchors', () => {
    // The Hijri half must be the SAME conversion the database froze in Sprint 1, not a second one.
    expect(dual('2026-01-01')).toEqual({ gregorian: '2026-01-01', hijri: '1447-07-12' });
    expect(dual('2026-03-31')).toEqual({ gregorian: '2026-03-31', hijri: '1447-10-12' });
    expect(dual('2026-04-20')).toEqual({ gregorian: '2026-04-20', hijri: '1447-11-03' });
    expect(dual('1978-05-01')).toEqual({ gregorian: '1978-05-01', hijri: '1398-05-23' });
  });

  it('refuses to dual-date something outside the Umm al-Qura table window', () => {
    expect(() => dual('1500-01-01')).toThrow(RangeError);
  });

  it('uses Latin digits and the zero-padded machine format in both halves', () => {
    const { gregorian, hijri } = dual('2026-05-10');
    expect(gregorian).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('computeDeadline reads no clock and no ambient calendar', () => {
  it('is deterministic: the same inputs always produce the same result', () => {
    const call = (): string =>
      computeDeadline({
        from: '2027-09-30',
        window: POST_FYE_3_MONTHS,
        calendar: CAL_A,
        roll: 'following',
      }).due.gregorian;
    expect(call()).toBe(call());
    expect(call()).toBe('2028-01-02');
  });

  it('propagates CALENDAR_UNAVAILABLE when the roll would leave the covered window', () => {
    expectDomainCode(
      () =>
        computeDeadline({
          from: '2028-12-01',
          window: POST_FYE_3_MONTHS,
          calendar: CAL_A,
          roll: 'following',
        }),
      'CALENDAR_UNAVAILABLE',
    );
  });
});
