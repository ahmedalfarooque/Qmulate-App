/**
 * `@qmulate/domain/dates` — the pure date engines: Umm al-Qura conversion and KSA business days.
 *
 * ## The public surface, in one place
 *
 * This is the *sub-barrel* for the dates engine. The package barrel (`../index.ts`) re-exports from
 * here; nothing outside `packages/domain` should reach into `./civil-date.js`, `./hijri.js`,
 * `./business-days.js` or `./deadline.js` directly, because the `@internal`-marked helpers in those
 * files (day-number arithmetic, `daysInGregorianMonth`, `weekdayCodeOf`, `WEEKDAY_CODES`) are shared
 * implementation detail and are deliberately NOT re-exported below.
 *
 * ## What callers need to know before using any of it
 *
 * 1. **PURITY IS ABSOLUTE.** No `@qmulate/*` import, no I/O, no `process.env`, and **no clock
 *    read** — there is no `today()` here, on purpose. An `asOf` / `from` / `start` date is always a
 *    parameter, so a statutory deadline can be replayed byte-for-byte during an audit years later.
 * 2. **The holiday calendar is a PARAMETER, never a database read.** The caller resolves
 *    `Setting calendar.workweek` and the seeded holiday rows, calls `buildHolidayCalendar` once, and
 *    passes the result in.
 * 3. **There is exactly ONE Hijri implementation and it is here** (decision D-4). It reproduces the
 *    six anchor conversions Sprint 1 froze into the database, in both directions. Out-of-range
 *    conversions THROW rather than letting Node ICU extrapolate a nonsense answer.
 * 4. **No regulatory figure lives in this code.** The 30 / 15 / 10-business-day deadlines, the
 *    3-month post-fiscal-year-end window and the ≥10-year retention period are all
 *    ⚠ unverified-until-confirmed-vs-primary-law, arrive as a `DeadlineWindow` naming their
 *    `Setting` key, and raise `SETTING_MISSING` when absent rather than defaulting.
 * 5. **Fail closed.** An empty holiday set, an empty or full workweek, an unrecognised weekday code
 *    or rule kind, an out-of-coverage query and an unrecognised roll convention all raise
 *    `CALENDAR_UNAVAILABLE`. Nothing is coerced; no default is ever substituted.
 */

/* ── Civil (Gregorian) calendar dates ─────────────────────────────────────── */
export {
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
  weekdayOf,
} from './civil-date.js';
export type { CivilDate, Weekday, WeekdayCode } from './civil-date.js';

/* ── Umm al-Qura (Hijri) conversion ───────────────────────────────────────── */
export {
  HIJRI_SUPPORTED_RANGE,
  formatHijriDate,
  fromHijri,
  fromHijriParts,
  hijriMonthLength,
  isValidHijriDate,
  parseHijriDate,
  toHijri,
  toHijriParts,
  toHijriSnapshot,
} from './hijri.js';
export type { HijriDate, HijriParts } from './hijri.js';

/* ── KSA business days ────────────────────────────────────────────────────── */
export {
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
} from './business-days.js';
export type {
  GregorianRecurringHolidayRule,
  HijriRecurringHolidayRule,
  HolidayCalendar,
  HolidayCalendarInput,
  HolidayKind,
  HolidayRule,
  ObservedHoliday,
  ResolvedHoliday,
  RollConvention,
  WorkingDayOverride,
} from './business-days.js';

/* ── Statutory deadlines ──────────────────────────────────────────────────── */
export { computeDeadline, dual } from './deadline.js';
export type {
  ComputeDeadlineInput,
  ComputedDeadline,
  DeadlineBasis,
  DeadlineWindow,
  DualDate,
  MonthAnchor,
} from './deadline.js';
