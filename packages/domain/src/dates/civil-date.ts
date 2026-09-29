/**
 * Civil (Gregorian) calendar dates — the arithmetic substrate for every date engine here.
 *
 * ## A calendar date is not an instant
 *
 * `CivilDate` is a branded `YYYY-MM-DD` string, never a `Date`. "The deed was registered on
 * 1980-03-11" carries no time and no zone; a `Date` carries both, and the moment you store a
 * calendar date as an instant you have to pick a zone, and every read has to pick the same one.
 * Sprint 1 already made that choice for the database (canonical UTC `DateTime` columns, anchored at
 * UTC midnight); this module makes it structural: the arithmetic happens on the calendar, so the
 * results are identical under any host `TZ`.
 *
 * `Date` appears in exactly two places, both explicit boundary conversions:
 * `civilDateFromUtcDate` / `civilDateToUtcDate` (for the UTC-midnight columns) and
 * `civilDateFromInstant(instant, timeZone)` (for a real instant, where the ZONE IS A PARAMETER —
 * Riyadh is UTC+03:00, so any instant from 21:00Z onward is already the next calendar day in KSA
 * and a filing timestamped 22:30Z on the deadline is a day late there).
 *
 * ## Purity (locked — see `../index.ts`)
 *
 * No `@qmulate/*` import, no I/O, no `process.env`, and **no clock read**: there is no `today()`
 * here, deliberately. An `asOf` date is always a parameter, because a deadline engine that can
 * read the wall clock cannot be replayed years later during an audit.
 *
 * ## Month and year arithmetic CLAMPS
 *
 * `addCalendarMonths('2026-11-30', 3)` is `2027-02-28`, not `2027-03-02`. Overflow semantics
 * applied to the 3-month post-fiscal-year-end distribution window (⚠ verify — may be stale;
 * confirm vs primary law) would report every 30-November year end's deadline two days late,
 * silently, forever.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * The branded calendar-date type
 * ──────────────────────────────────────────────────────────────────────────── */

declare const CIVIL_DATE_BRAND: unique symbol;

/**
 * A Gregorian calendar date as a canonical, zero-padded `YYYY-MM-DD` string.
 *
 * Structurally a `string`, so it sorts, compares and serialises like one (the zero padding is what
 * makes a lexicographic compare a chronological compare). The brand stops an arbitrary string —
 * an unvalidated form field, a `2026-2-3`, a `2026-02-30`, an ISO instant — being passed where a
 * validated calendar date is required. Build one with `civilDate()`.
 */
export type CivilDate = string & { readonly [CIVIL_DATE_BRAND]: 'CivilDate' };

/** Day of the week, `0` = Sunday … `6` = Saturday — the same numbering as `Date.getUTCDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A weekday as a stable three-letter code.
 *
 * This is the vocabulary a workweek is configured in (`Setting calendar.workweek`), because
 * `['SUN','MON','TUE','WED','THU']` survives a JSON round-trip and a code review in a way that
 * `[0,1,2,3,4]` does not — and because the KSA weekend being Friday/Saturday rather than
 * Saturday/Sunday is exactly the kind of fact that a bare integer array hides.
 */
export type WeekdayCode = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

/**
 * Weekday codes indexed by `Weekday`, i.e. Sunday-first.
 *
 * ⚠ THE FORMATTING OF THIS DECLARATION IS LOAD-BEARING. `src/__tests__/settings.test.ts` parses
 * this array out of this file **as text** to prove that `settings.ts`'s `z.enum` tuple and the date
 * engine agree, in order, about which day is Friday — two lists that must agree with nothing
 * comparing them is the Sprint-1 failure mode, and disagreeing here would move every KSA weekend
 * and therefore every statutory due date. That test looks for `Object.freeze([` … `])`, so this
 * declaration deliberately closes with `]);` and carries no trailing `as const` (which would make
 * the match run on past the array and silently compare the wrong thing). The element type is
 * pinned by the annotation instead.
 *
 * @internal Not part of the package's public barrel; `@qmulate/domain`'s dates modules share it.
 */
export const WEEKDAY_CODES: readonly WeekdayCode[] = Object.freeze([
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
]);

/** `YYYY-MM-DD`, zero-padded, nothing else — no whitespace, no time, no zone, no separators. */
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MS_PER_DAY = 86_400_000;

/* ────────────────────────────────────────────────────────────────────────────
 * Internal helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * UTC-midnight timestamp for a Gregorian y/m/d, with no two-digit-year surprise.
 *
 * `Date.UTC(26, 0, 1)` means 1926, not 26 CE. `setUTCFullYear` has no such remapping, which
 * matters because this module's range extends back past 1900 (the earliest fixture date is 1978,
 * but the Umm al-Qura table window opens in 1882).
 */
function utcTimestamp(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function isWholeNumber(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Days in a Gregorian month, honouring the 4/100/400 leap rule via day 0 of the next month.
 *
 * @internal
 */
export function daysInGregorianMonth(year: number, month: number): number {
  return new Date(utcTimestamp(year, month + 1, 0)).getUTCDate();
}

const daysInMonth = daysInGregorianMonth;

/**
 * Days since the Unix epoch — the integer every date walk is done in.
 *
 * @internal
 */
export function civilDayNumber(date: CivilDate): number {
  const { year, month, day } = civilDateParts(date);
  return utcTimestamp(year, month, day) / MS_PER_DAY;
}

/**
 * Inverse of `civilDayNumber`.
 *
 * @internal
 */
export function civilDateFromDayNumber(dayNumber: number): CivilDate {
  if (!isWholeNumber(dayNumber)) {
    throw new RangeError(`civilDateFromDayNumber: ${dayNumber} is not an integer day number.`);
  }
  return civilDateFromUtcDate(new Date(dayNumber * MS_PER_DAY));
}

/**
 * Split a validated `CivilDate` into numeric parts.
 *
 * @internal
 */
export function civilDateParts(date: CivilDate): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const match = CIVIL_DATE_PATTERN.exec(date);
  if (match === null) {
    // Only reachable if a caller forged the brand with a cast.
    throw new RangeError(`Not a canonical YYYY-MM-DD civil date: ${JSON.stringify(date)}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Construction
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Validate and brand a `YYYY-MM-DD` string.
 *
 * **Rejects a date that does not exist** rather than rolling it forward. `new Date('2026-02-30')`
 * yields 2026-03-02 with no complaint — a data-integrity failure disguised as a value, and the
 * kind of thing that turns a mistyped deed date into a plausible-looking fact. It also rejects
 * anything that is not a bare, zero-padded calendar date: `'2026-5-1'`, `'2026-05-10T00:00:00Z'`
 * and a trailing space (the realistic database-row shape) all throw.
 *
 * Idempotent: a `CivilDate` is a `string`, so re-validating one is free and safe.
 */
export function civilDate(value: string): CivilDate {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new RangeError(
      `Invalid civil date ${JSON.stringify(value)}: expected a bare, zero-padded YYYY-MM-DD ` +
        'calendar date (no time, no zone, no surrounding whitespace).',
    );
  }
  return civilDateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Build a `CivilDate` from numeric parts, with `month` 1-based (1 = January).
 *
 * The 1-based month is deliberate and is the whole reason this function exists: JavaScript's
 * 0-based `Date` month is the single most common off-by-one in date code, and it fails silently
 * (December becomes January of the next year).
 */
export function civilDateFromParts(year: number, month: number, day: number): CivilDate {
  for (const [name, value] of [
    ['year', year],
    ['month', month],
    ['day', day],
  ] as const) {
    if (!isWholeNumber(value)) {
      throw new RangeError(`Invalid civil date: ${name} must be an integer, received ${value}.`);
    }
  }
  if (year < 0 || year > 9999) {
    throw new RangeError(
      `Invalid civil date: year ${year} is outside the 0000–9999 range the canonical format holds.`,
    );
  }
  if (month < 1 || month > 12) {
    throw new RangeError(`Invalid civil date: month ${month} is outside 1–12.`);
  }
  if (day < 1 || day > 31) {
    throw new RangeError(`Invalid civil date: day ${day} is outside 1–31.`);
  }

  // Round-trip through UTC to reject a day the month does not have. `2026-02-30` becomes
  // `2026-03-02` here, and the mismatch is the rejection.
  const timestamp = utcTimestamp(year, month, day);
  const probe = new Date(timestamp);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(
      `Invalid civil date: ${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)} does not exist ` +
        `(${pad(month, 2)}/${year} has ${daysInMonth(year, month)} days). It is NOT rolled forward.`,
    );
  }

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as CivilDate;
}

/**
 * Read the calendar date out of a `Date` interpreted **in UTC**.
 *
 * This is the boundary conversion for the database's canonical UTC-midnight `DateTime` columns.
 * For a genuine instant (an audit timestamp, a payment confirmation) use `civilDateFromInstant`
 * and name the zone — reading an instant "in UTC" is a decision, not a default.
 */
export function civilDateFromUtcDate(date: Date): CivilDate {
  const time = date.getTime();
  if (Number.isNaN(time)) {
    throw new RangeError('civilDateFromUtcDate received an invalid Date.');
  }
  return civilDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** UTC midnight for a calendar date — the canonical instant the database stores. */
export function civilDateToUtcDate(date: CivilDate | string): Date {
  const { year, month, day } = civilDateParts(civilDate(date));
  return new Date(utcTimestamp(year, month, day));
}

/**
 * Formatter cache, keyed by IANA zone.
 *
 * Memoising a pure function is not I/O: the zone rules are static ICU data and the result depends
 * only on the arguments. Construction is the expensive part, and a deadline engine may convert
 * thousands of instants.
 */
const ZONE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = ZONE_FORMATTERS.get(timeZone);
  if (cached !== undefined) return cached;
  // An unknown zone makes `Intl` throw a RangeError. That is the desired behaviour: fail closed
  // rather than silently falling back to the host default, which would make the answer depend on
  // which machine ran the computation.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  ZONE_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/**
 * Resolve a real instant to the calendar day it falls on **in a named zone**.
 *
 * The zone is a required parameter, never inferred. Riyadh is UTC+03:00 with no DST, so an instant
 * at 21:30Z is already tomorrow in KSA; a statutory deadline evaluated in the wrong zone is wrong
 * by a day for three hours out of every twenty-four.
 */
export function civilDateFromInstant(instant: Date, timeZone: string): CivilDate {
  const time = instant.getTime();
  if (Number.isNaN(time)) {
    throw new RangeError('civilDateFromInstant received an invalid Date.');
  }
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(
      'civilDateFromInstant: Intl did not return year/month/day parts. This Node build is ' +
        'probably compiled with small-icu; QMULATE requires full ICU (the Node 22 default).',
    );
  }
  return civilDateFromParts(Number(year), Number(month), Number(day));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Inspection and comparison
 * ──────────────────────────────────────────────────────────────────────────── */

/** Day of the week, `0` = Sunday … `6` = Saturday (Friday = 5 and Saturday = 6 are the KSA weekend). */
export function weekdayOf(date: CivilDate | string): Weekday {
  return civilDateToUtcDate(date).getUTCDay() as Weekday;
}

/**
 * Weekday as its three-letter code.
 *
 * @internal
 */
export function weekdayCodeOf(date: CivilDate | string): WeekdayCode {
  const code = WEEKDAY_CODES[weekdayOf(date)];
  if (code === undefined) {
    throw new RangeError(`weekdayCodeOf: no code for weekday ${weekdayOf(date)}.`);
  }
  return code;
}

/** Chronological ordering: `-1` when `a` is earlier, `1` when later, `0` when the same day. */
export function compareCivilDates(a: CivilDate | string, b: CivilDate | string): -1 | 0 | 1 {
  const left = civilDate(a);
  const right = civilDate(b);
  // Zero-padded canonical form ⇒ a lexicographic compare IS a chronological compare.
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Whole days **from** `from` **to** `to`; positive when `to` is later.
 *
 * The argument order is `(from, to)` — the reading order of "from A to B" — and NOT date-fns's
 * `(dateLeft, dateRight)` subtraction order. Getting this backwards flips the sign of every
 * "days remaining" figure, so the parameter names are the documentation.
 */
export function differenceInCalendarDays(from: CivilDate | string, to: CivilDate | string): number {
  return civilDayNumber(civilDate(to)) - civilDayNumber(civilDate(from));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Calendar arithmetic
 * ──────────────────────────────────────────────────────────────────────────── */

/** Add (or subtract, for a negative `days`) whole calendar days. */
export function addCalendarDays(date: CivilDate | string, days: number): CivilDate {
  if (!isWholeNumber(days)) {
    throw new RangeError(`addCalendarDays: days must be an integer, received ${days}.`);
  }
  return civilDateFromDayNumber(civilDayNumber(civilDate(date)) + days);
}

/**
 * Add (or subtract) whole calendar months, **CLAMPING** the day to the target month's last day.
 *
 * THE VECTOR THAT MATTERS: `2026-11-30 + 3 months = 2027-02-28`. Overflow semantics would answer
 * `2027-03-02`, which for the 3-month post-fiscal-year-end distribution window
 * (⚠ verify — may be stale; confirm vs primary law) is a deadline reported two days late, with no
 * symptom. `2027-11-30 + 3 months` clamps into a LEAP February and gives `2028-02-29`.
 */
export function addCalendarMonths(date: CivilDate | string, months: number): CivilDate {
  if (!isWholeNumber(months)) {
    throw new RangeError(`addCalendarMonths: months must be an integer, received ${months}.`);
  }
  const { year, month, day } = civilDateParts(civilDate(date));
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (((monthIndex % 12) + 12) % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return civilDateFromParts(targetYear, targetMonth, clampedDay);
}

/**
 * Add (or subtract) whole calendar years, clamping 29 February into a common year.
 *
 * Defined as `addCalendarMonths(date, years * 12)` on purpose: the ≥10-year document retention
 * period (⚠ verify — may be stale; confirm vs primary law) is expressed in years and must agree
 * with the month engine rather than being a second implementation of the same clamp.
 */
export function addCalendarYears(date: CivilDate | string, years: number): CivilDate {
  if (!isWholeNumber(years)) {
    throw new RangeError(`addCalendarYears: years must be an integer, received ${years}.`);
  }
  return addCalendarMonths(date, years * 12);
}
