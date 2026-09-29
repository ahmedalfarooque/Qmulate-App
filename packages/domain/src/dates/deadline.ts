/**
 * Statutory deadline computation — where the calendar engines meet the regulation.
 *
 * ## Binding rule 3 is the whole point of this module
 *
 * **Every** window figure in the Nazarah regulation is UNVERIFIED until confirmed against primary
 * Saudi law: the 30 / 15 / 10-business-day deadlines, the 3-month post-fiscal-year-end distribution
 * window, the ≥10-year retention period. So none of them appears in this file. `computeDeadline`
 * takes a `DeadlineWindow` that
 *
 *  - **names the `Setting` key** its figure came from (provenance is mandatory, not decorative),
 *  - **refuses to run when the figure is absent** — `SETTING_MISSING`, never a substituted default,
 *  - and **carries the "⚠ unverified — confirm vs primary law" marker out in the result**, so the
 *    caveat reaches a UI or a report instead of dying at the resolver.
 *
 * Grep this file for a number and you will find only `12` (months per year) and `2001` (a
 * non-leap year used to validate a recurring anchor). That is deliberate.
 *
 * ## Two ways to be wrong that both look right
 *
 *  - **Month arithmetic that overflows instead of clamping.** A 30 November fiscal year end plus
 *    three months is 28 February, not 2 March. Two days late, silently, every year.
 *  - **A roll direction chosen by taste.** `following` and `preceding` are STATUTORY: you file
 *    AFTER a trigger event, you renew BEFORE an expiry. `computeDeadline` will not pick one; `roll`
 *    is a required field.
 *
 * ## The one open question this module refuses to close (CLAUDE.md binding rule 4)
 *
 * "Within 3 months of the end of the fiscal year" has two readings when the year end is a month
 * end: the same day of month three months on (30 Sept → 30 Dec), or the END of the third month
 * (30 Sept → 31 Dec). They differ by up to three days on exactly the dates that matter, because a
 * fiscal year end is always a month end. That is a question of law, so `monthAnchor` is a
 * **required** field on any month-based window and there is no default — the choice is made
 * visibly, at the call site, by whoever can answer it.
 */

import { DomainError, settingMissing } from '../errors.js';
import {
  addCalendarDays,
  addCalendarMonths,
  civilDate,
  civilDateFromParts,
  civilDateParts,
  daysInGregorianMonth,
  type CivilDate,
} from './civil-date.js';
import {
  addBusinessDays,
  isBusinessDay,
  rollToBusinessDay,
  type HolidayCalendar,
  type RollConvention,
} from './business-days.js';
import { toHijri, type HijriDate } from './hijri.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Dual dates
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A calendar date and its frozen Umm al-Qura twin — §17 schema convention 2's shape.
 *
 * Both halves are canonical `yyyy-MM-dd` machine strings in Latin digits, so both sort and compare
 * the same way. ar/en display is `@qmulate/i18n`'s job (`formatHijri` / `formatDateDual`); nothing
 * here formats for a human.
 */
export interface DualDate {
  readonly gregorian: CivilDate;
  readonly hijri: HijriDate;
}

/**
 * Dual-date a civil date.
 *
 * The Hijri half comes from the ONE conversion in `./hijri.js`, so it necessarily agrees with the
 * six anchors Sprint 1 froze into the database. Throws outside the Umm al-Qura table window rather
 * than extrapolating.
 *
 * ⚠ NOT the same function as `dual(value, field)` in `packages/database/src/seed/hijri.ts`, which
 * parses a fixture string into `{ gregorian: Date, hijri: string }` for a Prisma column pair. This
 * is the pure, calendar-shaped version.
 */
export function dual(date: CivilDate | string): DualDate {
  const gregorian = civilDate(date);
  return { gregorian, hijri: toHijri(gregorian) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Windows
 * ──────────────────────────────────────────────────────────────────────────── */

/** Which calendar the window is measured in. Derived from the window, never passed separately. */
export type DeadlineBasis = 'business_days' | 'calendar_months' | 'calendar_days';

/**
 * How a month-based window treats the day of month. **Required** — see the module note.
 *
 * - `day_of_month` — the same day, `months` later, clamped into a shorter month
 *   (30 Sept + 3 = 30 Dec; 30 Nov + 3 = 28 Feb).
 * - `end_of_month` — the LAST day of the month `months` later, whatever the anchor's day was
 *   (30 Sept + 3 = 31 Dec; 30 Nov + 3 = 28 Feb).
 */
export type MonthAnchor = 'day_of_month' | 'end_of_month';

/**
 * A statutory window, as resolved from configuration.
 *
 * Exactly ONE of `businessDays` / `calendarMonths` / `calendarDays` must be present. Two is not
 * "prefer the first" — it is an unusable configuration, and guessing would silently pick a
 * statutory basis.
 */
export interface DeadlineWindow {
  /**
   * The `Setting` key the figure came from, e.g. `distribution.postFyeWindow.months`.
   *
   * Mandatory. It appears in the `SETTING_MISSING` message and in the result, so an operator reading
   * a wrong deadline can find the row that produced it.
   */
  readonly settingKey: string;
  /** Business days (weekends and holidays skipped). Negative for a pre-alert offset. */
  readonly businessDays?: number | undefined;
  /** Whole calendar months. Requires `monthAnchor`. */
  readonly calendarMonths?: number | undefined;
  /** Whole calendar days (no skipping). */
  readonly calendarDays?: number | undefined;
  /** Required when `calendarMonths` is set. No default — the choice is a legal one. */
  readonly monthAnchor?: MonthAnchor | undefined;
  /**
   * `false` ONLY when the figure has been confirmed against primary Saudi law and that confirmation
   * is recorded. Defaults to `true`, so an unmarked figure is treated as unverified — the safe
   * direction (binding rule 3).
   */
  readonly unverified?: boolean | undefined;
}

/** What `computeDeadline` returns. Every intermediate is exposed so the result is auditable. */
export interface ComputedDeadline {
  /** The anchor the window was measured from. */
  readonly from: DualDate;
  /** The date before any roll. Equal to `due` when no roll was needed. */
  readonly rawDue: DualDate;
  /** The date after the requested roll — the deadline to act on. */
  readonly due: DualDate;
  /** `true` when the roll actually moved the date. */
  readonly rolled: boolean;
  readonly rollConvention: RollConvention;
  readonly basis: DeadlineBasis;
  /** The window as supplied, echoed so the `settingKey` travels with the answer. */
  readonly window: DeadlineWindow;
  /**
   * The staleness marker, or `null` when the figure is recorded as verified.
   *
   * Surfaces MUST render this wherever the deadline is shown. A regulatory figure presented as
   * settled truth is the failure binding rule 3 exists to prevent.
   */
  readonly unverifiedNote: string | null;
}

export interface ComputeDeadlineInput {
  /** The triggering date (a filing trigger, a fiscal year end). Never a clock read — a parameter. */
  readonly from: CivilDate | string;
  readonly window: DeadlineWindow;
  /** Built by the caller from `Setting calendar.workweek` + seeded holiday rows. */
  readonly calendar: HolidayCalendar;
  /** Required. `following` to file after a trigger, `preceding` to renew before an expiry. */
  readonly roll: RollConvention;
}

/**
 * The verbatim staleness marker.
 *
 * Wording tracks CLAUDE.md binding rule 3 ("verify — may be stale (confirm vs primary law)"). The
 * words `unverified` and `primary law` are asserted by the test suite, so a rewrite that drops the
 * caveat fails rather than quietly shipping a figure as settled.
 */
const UNVERIFIED_NOTE =
  '⚠ unverified — this figure may be stale; confirm vs primary law (the Arabic regulation ' +
  'originals + Saudi counsel) before relying on it.';

/* ────────────────────────────────────────────────────────────────────────────
 * Window validation
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every unusable-window fault raises `SETTING_MISSING`.
 *
 * One code, deliberately: from the engine's point of view an ambiguous, malformed or unparseable
 * window is not meaningfully different from an absent one — in every case there is no figure it may
 * act on, and the safe response is identical. The message says which fault it was.
 */
function unusableWindow(settingKey: string, reason: string): never {
  const error = settingMissing(settingKey, { reason });
  throw new DomainError('SETTING_MISSING', `${error.message} Unusable because: ${reason}.`, {
    details: { settingKey, reason },
  });
}

interface ResolvedWindow {
  readonly basis: DeadlineBasis;
  readonly amount: number;
  readonly monthAnchor: MonthAnchor | null;
}

const MONTH_ANCHORS: ReadonlySet<string> = new Set<string>(['day_of_month', 'end_of_month']);

function resolveWindow(window: DeadlineWindow): ResolvedWindow {
  if (window === null || typeof window !== 'object') {
    // No settingKey to name, so name the parameter instead.
    unusableWindow('<window>', 'the window is not an object');
  }
  const settingKey = typeof window.settingKey === 'string' ? window.settingKey.trim() : '';
  if (settingKey.length === 0) {
    unusableWindow(
      '<unnamed>',
      'settingKey is empty — every regulatory figure must name the Setting row it came from, so a ' +
        'wrong deadline can be traced back to a config row rather than to code',
    );
  }

  const present: Array<{ readonly basis: DeadlineBasis; readonly amount: number }> = [];
  if (window.businessDays !== undefined) {
    present.push({ basis: 'business_days', amount: window.businessDays });
  }
  if (window.calendarMonths !== undefined) {
    present.push({ basis: 'calendar_months', amount: window.calendarMonths });
  }
  if (window.calendarDays !== undefined) {
    present.push({ basis: 'calendar_days', amount: window.calendarDays });
  }

  if (present.length === 0) {
    unusableWindow(
      settingKey,
      'no figure was supplied (businessDays / calendarMonths / calendarDays are all absent). ' +
        'Regulatory figures are configuration, never hardcoded defaults, so the engine refuses ' +
        'rather than inventing one',
    );
  }
  if (present.length > 1) {
    unusableWindow(
      settingKey,
      `${present.length} bases were supplied (${present.map((entry) => entry.basis).join(', ')}). ` +
        "Preferring one would silently choose a statutory basis on the caller's behalf",
    );
  }

  const chosen = present[0];
  if (chosen === undefined) {
    unusableWindow(settingKey, 'internal: no basis resolved');
  }
  if (!Number.isInteger(chosen.amount)) {
    unusableWindow(
      settingKey,
      `the figure ${String(chosen.amount)} is not an integer. A fractional or non-finite window ` +
        'is never a real statutory period, and truncating it would invent one',
    );
  }

  let monthAnchor: MonthAnchor | null = null;
  if (chosen.basis === 'calendar_months') {
    if (typeof window.monthAnchor !== 'string' || !MONTH_ANCHORS.has(window.monthAnchor)) {
      unusableWindow(
        settingKey,
        `a month-based window must declare monthAnchor as 'day_of_month' or 'end_of_month' ` +
          `(received ${JSON.stringify(window.monthAnchor)}). "Within 3 months of the end of the ` +
          'fiscal year" has two readings that differ by up to three days on exactly the dates ' +
          'that matter, and which one applies is a question of law — so there is no default',
      );
    }
    monthAnchor = window.monthAnchor;
  } else if (window.monthAnchor !== undefined) {
    unusableWindow(
      settingKey,
      `monthAnchor is meaningless on a ${chosen.basis} window; its presence means the window was ` +
        'assembled from the wrong Setting rows',
    );
  }

  return { basis: chosen.basis, amount: chosen.amount, monthAnchor };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Computation
 * ──────────────────────────────────────────────────────────────────────────── */

/** The last day of the month `months` after `from`'s month, whatever `from`'s day was. */
function endOfMonthAfter(from: CivilDate, months: number): CivilDate {
  const shifted = addCalendarMonths(from, months);
  const { year, month } = civilDateParts(shifted);
  return civilDateFromParts(year, month, daysInGregorianMonth(year, month));
}

/**
 * Compute a statutory deadline.
 *
 * Order of operations: resolve the window (refusing an absent or ambiguous one), add it in its own
 * basis, then apply the requested roll. Business-day windows land on a business day by construction,
 * so their roll is an identity — the call is still made, because it is what validates that the
 * result lies inside the calendar's coverage.
 *
 * @throws `SETTING_MISSING` — the window figure is absent, ambiguous, or unusable.
 * @throws `CALENDAR_UNAVAILABLE` — the anchor, the raw due date or the roll leaves coverage.
 */
export function computeDeadline(input: ComputeDeadlineInput): ComputedDeadline {
  const { basis, amount, monthAnchor } = resolveWindow(input.window);
  const from = civilDate(input.from);
  const { calendar, roll } = input;

  // Coverage check on the ANCHOR. A window measured from a date the calendar does not cover is
  // unanswerable even when the due date happens to land inside it.
  void isBusinessDay(from, calendar);

  let rawDue: CivilDate;
  switch (basis) {
    case 'business_days':
      rawDue = addBusinessDays(from, amount, calendar);
      break;
    case 'calendar_months':
      rawDue =
        monthAnchor === 'end_of_month'
          ? endOfMonthAfter(from, amount)
          : addCalendarMonths(from, amount);
      break;
    case 'calendar_days':
      rawDue = addCalendarDays(from, amount);
      break;
    default: {
      // Unreachable while `DeadlineBasis` stays closed; kept so a new basis cannot default-allow.
      const unmapped: never = basis;
      unusableWindow(input.window.settingKey, `unmapped deadline basis ${String(unmapped)}`);
    }
  }

  const due = rollToBusinessDay(rawDue, roll, calendar);
  const unverified = input.window.unverified ?? true;

  return Object.freeze({
    from: dual(from),
    rawDue: dual(rawDue),
    due: dual(due),
    rolled: due !== rawDue,
    rollConvention: roll,
    basis,
    window: input.window,
    unverifiedNote: unverified ? UNVERIFIED_NOTE : null,
  });
}
