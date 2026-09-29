/**
 * KSA business-day arithmetic — the engine behind every statutory deadline.
 *
 * ## §17 E2 exit clause 2, verbatim
 *
 * > "`addBusinessDays` crosses a weekend + a seeded Hijri holiday correctly (unit-tested)"
 *
 * Three independent ways to be wrong, none of which produces a visible symptom — only a
 * confidently wrong date that a Nazir files against:
 *
 *  1. **The weekend is Friday/Saturday**, not Saturday/Sunday. A default-Western weekend shifts
 *     every KSA deadline. The workweek is therefore DATA, arriving from `Setting calendar.workweek`
 *     — never a constant inside the walk.
 *  2. **Holidays are skipped, not counted.** Counting Eid days into a business-day window reports a
 *     deadline that has already passed.
 *  3. **Hijri holidays MOVE.** One rule ("1 Shawwal, 3 days") costs ONE business day in 1447 (it
 *     lands Fri/Sat/Sun) and THREE in 1448 (Tue/Wed/Thu). An implementation that resolves a lunar
 *     holiday once and reuses it is wrong in every other year, and wrong by a different amount each
 *     time.
 *
 * ## The calendar is a PARAMETER
 *
 * `HolidayCalendar` is built by the caller from data it has already fetched (a `Setting` row and
 * seeded `HolidayCalendar` rows) and handed in. Nothing here reads a database, a clock or an
 * environment variable: `@qmulate/domain` is pure so a deadline computed today can be replayed
 * byte-for-byte during an audit years from now.
 *
 * ## Semantics that change answers if guessed
 *
 * - `addBusinessDays` steps from `start` **EXCLUSIVE**, decrementing on each business day. A
 *   business-day window therefore needs no terminal roll — the result is ALWAYS a business day.
 * - `n === 0` returns `start` **UNCHANGED**, even on a Friday or a holiday. "Zero business days
 *   from the trigger" is the trigger date; a silent roll here would move every same-day obligation.
 * - Rolling is a **separate named call** (`rollToBusinessDay`), so no caller receives a roll it did
 *   not ask for, and `following` vs `preceding` is STATUTORY rather than stylistic: you file AFTER
 *   a trigger event, you renew BEFORE an expiry.
 * - Negative `n` is supported — pre-alert offsets need it, and so does `preceding`.
 * - `isBusinessDay` precedence, in order: **working-day override → holiday → weekend → true**.
 * - Stepping outside the calendar's declared `coverage` **THROWS**. Walking past the end of the
 *   known holiday table is the same failure as an empty calendar, one step removed.
 *
 * ## Fail closed, everywhere
 *
 * An empty holiday set, an empty or full workweek, an unrecognised weekday code, an unknown rule
 * kind, an out-of-coverage query and an unrecognised roll convention all raise
 * `CALENDAR_UNAVAILABLE`. **No input is ever coerced and no default is ever substituted**: the
 * alternative to raising is a calendar in which no day is a holiday, which answers every question
 * confidently and wrongly.
 */

import { DomainError } from '../errors.js';
import {
  addCalendarDays,
  civilDate,
  civilDateFromDayNumber,
  civilDateFromParts,
  civilDateParts,
  civilDayNumber,
  daysInGregorianMonth,
  weekdayCodeOf,
  WEEKDAY_CODES,
  type CivilDate,
  type WeekdayCode,
} from './civil-date.js';
import {
  HIJRI_SUPPORTED_RANGE,
  fromHijriParts,
  toHijri,
  toHijriParts,
  type HijriDate,
} from './hijri.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Errors
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every calendar fault raises the one code `@qmulate/i18n` already has ar/en copy for.
 *
 * `CALENDAR_UNAVAILABLE` is documented in `../errors.ts` as "a business-day computation was
 * requested without an authoritative KSA holiday calendar" — which is exactly what a malformed,
 * empty or out-of-range calendar is.
 */
function calendarUnavailable(reason: string, details?: Readonly<Record<string, unknown>>): never {
  throw new DomainError(
    'CALENDAR_UNAVAILABLE',
    `Business-day calendar unusable: ${reason}. Refusing to compute rather than treating every ` +
      'day as a business day.',
    details !== undefined ? { details } : {},
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The workweek
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The Saudi working week: **Sunday–Thursday**, so the weekend is Friday/Saturday.
 *
 * ⚠ This constant exists for FIXTURES, SEEDS AND TESTS. Production resolves the workweek from
 * `Setting calendar.workweek`, and `buildHolidayCalendar` deliberately **requires** the field
 * rather than defaulting to this — a silent default is how a Western weekend gets into a Saudi
 * deadline in the first place.
 */
export const KSA_DEFAULT_WORKWEEK: readonly WeekdayCode[] = Object.freeze([
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
]);

const VALID_WEEKDAY_CODES: ReadonlySet<string> = new Set<string>(WEEKDAY_CODES);

/* ────────────────────────────────────────────────────────────────────────────
 * Holiday inputs
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where a resolved holiday came from — its provenance, carried through to reports. */
export type HolidayKind = 'observed' | 'hijri_recurring' | 'gregorian_recurring';

/**
 * A holiday anchored to an Umm al-Qura date, recurring every Hijri year.
 *
 * `hijriDay` is restricted to **1–29**: a 30th does not exist in every Hijri year, and silently
 * skipping the years where it is absent would drop a public holiday from the calendar without
 * telling anyone. Express those as explicit `observed` dates.
 */
export interface HijriRecurringHolidayRule {
  readonly kind: 'hijri_recurring';
  /** Stable id, carried onto every day the rule resolves to (so a report can group them). */
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string;
  /** 1 = Muharram … 12 = Dhu al-Hijjah. */
  readonly hijriMonth: number;
  /** 1–29. */
  readonly hijriDay: number;
  /** Consecutive days the holiday occupies, counting the anchor. `1` for a single day. */
  readonly spanDays: number;
}

/**
 * A holiday anchored to a Gregorian month/day, recurring every year (e.g. Founding Day).
 *
 * The anchor must exist in EVERY Gregorian year, so 29 February is refused for the same reason a
 * Hijri 30th is.
 */
export interface GregorianRecurringHolidayRule {
  readonly kind: 'gregorian_recurring';
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string;
  /** 1 = January … 12 = December. */
  readonly gregorianMonth: number;
  readonly gregorianDay: number;
  readonly spanDays: number;
}

/**
 * A recurring holiday rule.
 *
 * A CLOSED discriminated union, so an unmapped `kind` is a compile error — and, for rows arriving
 * as JSON from a database column, a runtime `CALENDAR_UNAVAILABLE`. An ignored rule is a missing
 * public holiday.
 */
export type HolidayRule = HijriRecurringHolidayRule | GregorianRecurringHolidayRule;

/**
 * A specific date the Authority has actually declared a holiday.
 *
 * Explicit observations take precedence over rule-derived days, because the Authority publishes the
 * real observed dates (a moon-sighting adjustment, an extended Eid) and those are authoritative
 * over any calculation.
 */
export interface ObservedHoliday {
  readonly date: CivilDate | string;
  readonly nameAr: string;
  readonly nameEn: string;
  /** Set when the row was materialised from a rule; free-standing observations leave it unset. */
  readonly ruleId?: string;
}

/**
 * A date declared a WORKING day despite the weekend or a holiday.
 *
 * `isWorkingDay` is the literal `true` — a "not a working day" is an `ObservedHoliday`, not a
 * `false` here, so the two concepts cannot be confused at a call site.
 */
export interface WorkingDayOverride {
  readonly date: CivilDate | string;
  readonly isWorkingDay: true;
  readonly reason?: string;
}

/** Everything needed to build a calendar. Nothing is optional that changes an answer silently. */
export interface HolidayCalendarInput {
  /** Working days, e.g. `['SUN','MON','TUE','WED','THU']`. Required; see `KSA_DEFAULT_WORKWEEK`. */
  readonly workweek: readonly WeekdayCode[];
  /**
   * The window this calendar is authoritative for. A query or a walk that leaves it THROWS, because
   * beyond the seeded holidays any answer is a guess.
   */
  readonly coverage: { readonly from: CivilDate | string; readonly to: CivilDate | string };
  readonly observed?: readonly ObservedHoliday[];
  readonly rules?: readonly HolidayRule[];
  readonly workingDayOverrides?: readonly WorkingDayOverride[];
}

/** A holiday resolved to one specific date, dual-dated and carrying its provenance. */
export interface ResolvedHoliday {
  readonly date: CivilDate;
  /** The frozen Umm al-Qura twin — §17 schema convention 2 applies to holidays too. */
  readonly hijri: HijriDate;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly source: HolidayKind;
  readonly ruleId?: string;
}

/** An immutable, validated business-day calendar. Build it with `buildHolidayCalendar`. */
export interface HolidayCalendar {
  readonly workweek: readonly WeekdayCode[];
  readonly weekendDays: readonly WeekdayCode[];
  readonly coverage: { readonly from: CivilDate; readonly to: CivilDate };
  readonly holidays: ReadonlyMap<CivilDate, ResolvedHoliday>;
  readonly workingDayOverrides: ReadonlyMap<CivilDate, WorkingDayOverride>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Building
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A `Map` whose mutators throw.
 *
 * `Object.freeze` alone does not protect a `Map` — its entries live in internal slots, so
 * `calendar.holidays.set(...)` would still succeed on a "frozen" map. Replacing the mutators is
 * what makes a built calendar genuinely immutable, which matters because a calendar is shared
 * across every deadline computation in a request.
 */
function sealMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const map = new Map<K, V>(entries);
  const refuse = (): never =>
    calendarUnavailable('a built HolidayCalendar is immutable; rebuild it from its input instead');
  Object.defineProperties(map, {
    set: { value: refuse, writable: false, configurable: false },
    delete: { value: refuse, writable: false, configurable: false },
    clear: { value: refuse, writable: false, configurable: false },
  });
  return Object.freeze(map) as ReadonlyMap<K, V>;
}

function validateWorkweek(workweek: readonly WeekdayCode[]): readonly WeekdayCode[] {
  if (!Array.isArray(workweek)) {
    calendarUnavailable('the workweek is not an array');
  }
  if (workweek.length === 0) {
    calendarUnavailable('the workweek is empty — no day would ever be a business day');
  }
  if (workweek.length === 7) {
    calendarUnavailable(
      'the workweek names all seven days — a calendar with no weekend is not a KSA calendar, and ' +
        'is far more likely to be a misconfigured Setting than a deliberate 24/7 rule',
    );
  }
  const seen = new Set<string>();
  for (const code of workweek) {
    if (typeof code !== 'string' || !VALID_WEEKDAY_CODES.has(code)) {
      calendarUnavailable(
        `${JSON.stringify(code)} is not a weekday code (expected one of ${WEEKDAY_CODES.join(', ')}). ` +
          'Codes are NOT trimmed, case-folded or otherwise coerced — a Setting row that reads ' +
          '"Thu" or "THU " is a configuration bug, not an alias',
        { received: code },
      );
    }
    if (seen.has(code)) {
      calendarUnavailable(`weekday ${code} appears twice in the workweek`, { received: code });
    }
    seen.add(code);
  }
  return Object.freeze([...workweek]);
}

function validateSpanDays(rule: HolidayRule): number {
  if (!Number.isInteger(rule.spanDays) || rule.spanDays < 1) {
    calendarUnavailable(
      `holiday rule ${rule.id}: spanDays must be a positive integer, received ${String(rule.spanDays)}`,
      { ruleId: rule.id },
    );
  }
  return rule.spanDays;
}

/**
 * One candidate holiday day, with its provenance already attached.
 *
 * Provenance is carried on the candidate rather than reconstructed later from array positions:
 * "which half of the concatenated list did this come from" is exactly the kind of implicit
 * agreement between two places that S1's post-mortem says nothing keeps true.
 */
interface HolidayCandidate {
  readonly date: CivilDate;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly source: HolidayKind;
  readonly ruleId?: string;
}

/** Materialise a `hijri_recurring` rule across every Hijri year touching the coverage window. */
function resolveHijriRule(
  rule: HijriRecurringHolidayRule,
  coverage: { readonly from: CivilDate; readonly to: CivilDate },
): HolidayCandidate[] {
  if (!Number.isInteger(rule.hijriMonth) || rule.hijriMonth < 1 || rule.hijriMonth > 12) {
    calendarUnavailable(
      `holiday rule ${rule.id}: hijriMonth ${String(rule.hijriMonth)} is outside 1–12`,
      { ruleId: rule.id },
    );
  }
  if (!Number.isInteger(rule.hijriDay) || rule.hijriDay < 1 || rule.hijriDay > 29) {
    calendarUnavailable(
      `holiday rule ${rule.id}: hijriDay ${String(rule.hijriDay)} must be 1–29. A 30th does not ` +
        'exist in every Hijri year, and skipping the years where it is absent would silently drop ' +
        'a public holiday — declare those as explicit observed dates instead',
      { ruleId: rule.id },
    );
  }
  const span = validateSpanDays(rule);

  // One Hijri year of slack at each end: a lunar year is ~11 days shorter than a solar one, so the
  // Hijri year containing coverage.from can begin before it.
  const firstHijriYear = toHijriParts(coverage.from).hy - 1;
  const lastHijriYear = toHijriParts(coverage.to).hy + 1;

  const resolved: HolidayCandidate[] = [];
  for (let hy = firstHijriYear; hy <= lastHijriYear; hy += 1) {
    // Years outside the Umm al-Qura table window are skipped rather than extrapolated. The bounds
    // are READ from the hijri module rather than restated here, so the two can never disagree. Any
    // date such a year would produce lies outside coverage anyway, the table window being wider.
    if (hy < HIJRI_SUPPORTED_RANGE.minHijriYear || hy > HIJRI_SUPPORTED_RANGE.maxHijriYear) {
      continue;
    }
    // `hijriDay` is validated to 1–29 above, and every Hijri month has at least 29 days, so the
    // anchor is guaranteed to exist in every year reached here.
    const anchor = fromHijriParts(hy, rule.hijriMonth, rule.hijriDay);
    for (let offset = 0; offset < span; offset += 1) {
      resolved.push({
        date: addCalendarDays(anchor, offset),
        nameAr: rule.nameAr,
        nameEn: rule.nameEn,
        source: 'hijri_recurring',
        ruleId: rule.id,
      });
    }
  }
  return resolved;
}

/** Materialise a `gregorian_recurring` rule across every Gregorian year touching coverage. */
function resolveGregorianRule(
  rule: GregorianRecurringHolidayRule,
  coverage: { readonly from: CivilDate; readonly to: CivilDate },
): HolidayCandidate[] {
  const { gregorianMonth: month, gregorianDay: day } = rule;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    calendarUnavailable(
      `holiday rule ${rule.id}: gregorianMonth ${String(month)} is outside 1–12`,
      { ruleId: rule.id },
    );
  }
  // The anchor must exist in EVERY year. 2001 is a common (non-leap) year, so validating against it
  // rejects 29 February — which is absent three years in four — as well as 31 April and friends.
  if (!Number.isInteger(day) || day < 1 || day > daysInGregorianMonth(2001, month)) {
    calendarUnavailable(
      `holiday rule ${rule.id}: ${String(month)}/${String(day)} does not exist in every Gregorian ` +
        'year (29 February in particular). Declare those as explicit observed dates instead',
      { ruleId: rule.id },
    );
  }
  const span = validateSpanDays(rule);

  const firstYear = civilDateParts(coverage.from).year;
  const lastYear = civilDateParts(coverage.to).year;

  const resolved: HolidayCandidate[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const anchor = civilDateFromParts(year, month, day);
    for (let offset = 0; offset < span; offset += 1) {
      resolved.push({
        date: addCalendarDays(anchor, offset),
        nameAr: rule.nameAr,
        nameEn: rule.nameEn,
        source: 'gregorian_recurring',
        ruleId: rule.id,
      });
    }
  }
  return resolved;
}

/**
 * Validate the input and materialise every holiday inside `coverage`.
 *
 * Refuses (`CALENDAR_UNAVAILABLE`) when:
 * - the workweek is empty, full, duplicated, or carries an unrecognised code;
 * - `coverage.from` is not strictly before `coverage.to`;
 * - a rule's `kind` is unrecognised, or its anchor does not exist in every year;
 * - a working-day override falls outside coverage;
 * - **the resolved holiday set inside coverage is empty.** This last one is EXIT-2's own mutation
 *   target: returning an empty map instead produces a calendar in which no day is ever a holiday,
 *   i.e. a confidently wrong statutory due date with no symptom at all.
 */
export function buildHolidayCalendar(input: HolidayCalendarInput): HolidayCalendar {
  const workweek = validateWorkweek(input.workweek);
  const weekendDays = Object.freeze(WEEKDAY_CODES.filter((code) => !workweek.includes(code)));

  if (input.coverage === undefined || input.coverage === null) {
    calendarUnavailable('no coverage window was declared');
  }
  const from = civilDate(input.coverage.from);
  const to = civilDate(input.coverage.to);
  if (from >= to) {
    calendarUnavailable(
      `coverage ${from} … ${to} is inverted or zero-length; a calendar must cover a real span`,
      { from, to },
    );
  }
  const coverage = Object.freeze({ from, to });

  // Rule-derived days first, then explicit observations, so an explicit observation OVERWRITES a
  // calculated one (the Authority's published date beats any calculation).
  const candidates: HolidayCandidate[] = [];
  for (const rule of input.rules ?? []) {
    if (rule === null || typeof rule !== 'object') {
      calendarUnavailable('a holiday rule is not an object');
    }
    switch (rule.kind) {
      case 'hijri_recurring':
        candidates.push(...resolveHijriRule(rule, coverage));
        break;
      case 'gregorian_recurring':
        candidates.push(...resolveGregorianRule(rule, coverage));
        break;
      default:
        // Reached only by a row that arrived as JSON; the union makes it a compile error otherwise.
        calendarUnavailable(
          `unrecognised holiday rule kind ${JSON.stringify((rule as { kind?: unknown }).kind)}. ` +
            'An ignored rule is a missing public holiday, so an unmapped kind DENIES rather than ' +
            'being skipped',
          { kind: (rule as { kind?: unknown }).kind },
        );
    }
  }
  for (const observed of input.observed ?? []) {
    candidates.push({
      date: civilDate(observed.date),
      nameAr: observed.nameAr,
      nameEn: observed.nameEn,
      source: 'observed',
      ...(observed.ruleId !== undefined ? { ruleId: observed.ruleId } : {}),
    });
  }

  const holidays = new Map<CivilDate, ResolvedHoliday>();
  for (const candidate of candidates) {
    // Outside coverage is dropped, not an error: a rule legitimately resolves in the Hijri years
    // that straddle the window. `isBusinessDay` refuses out-of-coverage queries anyway, so a
    // dropped day can never be silently read as "not a holiday".
    if (candidate.date < coverage.from || candidate.date > coverage.to) continue;
    holidays.set(candidate.date, {
      date: candidate.date,
      hijri: toHijri(candidate.date),
      nameAr: candidate.nameAr,
      nameEn: candidate.nameEn,
      source: candidate.source,
      ...(candidate.ruleId !== undefined ? { ruleId: candidate.ruleId } : {}),
    });
  }

  if (holidays.size === 0) {
    calendarUnavailable(
      'the resolved holiday set inside coverage is EMPTY. An empty calendar answers every ' +
        'business-day question as if no day were ever a holiday, which produces a confidently ' +
        'wrong statutory due date; the KSA calendar always has at least the two Eids',
      { coverageFrom: coverage.from, coverageTo: coverage.to },
    );
  }

  const overrides = new Map<CivilDate, WorkingDayOverride>();
  for (const override of input.workingDayOverrides ?? []) {
    const date = civilDate(override.date);
    if (date < coverage.from || date > coverage.to) {
      calendarUnavailable(
        `working-day override ${date} falls outside coverage ${coverage.from} … ${coverage.to}; a ` +
          'declaration the calendar cannot apply is a configuration error, not a no-op',
        { date },
      );
    }
    if (override.isWorkingDay !== true) {
      calendarUnavailable(
        `working-day override ${date} does not set isWorkingDay: true. A non-working day is an ` +
          'ObservedHoliday, not a false here',
        { date },
      );
    }
    overrides.set(date, Object.freeze({ ...override, date }));
  }

  return Object.freeze({
    workweek,
    weekendDays,
    coverage,
    holidays: sealMap(holidays),
    workingDayOverrides: sealMap(overrides),
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Queries
 * ──────────────────────────────────────────────────────────────────────────── */

function assertWithinCoverage(date: CivilDate, calendar: HolidayCalendar, what: string): void {
  if (date < calendar.coverage.from || date > calendar.coverage.to) {
    calendarUnavailable(
      `${what} ${date} is outside the calendar's coverage ${calendar.coverage.from} … ` +
        `${calendar.coverage.to}. Beyond the seeded holidays any answer would be a guess`,
      { date, from: calendar.coverage.from, to: calendar.coverage.to },
    );
  }
}

/**
 * Is this weekday outside the workweek?
 *
 * A pure WEEKDAY question, so it is answerable for any date and needs no coverage check. It is
 * **not** the business-day question: a `WorkingDayOverride` outranks the weekend, so an overridden
 * Friday is still `isWeekend === true` while being `isBusinessDay === true`.
 */
export function isWeekend(date: CivilDate | string, calendar: HolidayCalendar): boolean {
  return calendar.weekendDays.includes(weekdayCodeOf(civilDate(date)));
}

/**
 * The holiday record for this date, or `null`.
 *
 * Returns the RAW record and deliberately ignores working-day overrides, so a report can say
 * "Eid al-Fitr — worked". Use `isBusinessDay` for the decision. Throws outside coverage: answering
 * `null` there would be indistinguishable from "not a holiday".
 */
export function holidayOn(
  date: CivilDate | string,
  calendar: HolidayCalendar,
): ResolvedHoliday | null {
  const normalised = civilDate(date);
  assertWithinCoverage(normalised, calendar, 'holiday query');
  return calendar.holidays.get(normalised) ?? null;
}

/**
 * Is this a working day?
 *
 * Precedence, in order — **working-day override → holiday → weekend → true**. The override comes
 * first because it is the most specific and most recent statement of fact (the Authority recalling
 * a day, or declaring a compensating workday after an extended Eid).
 */
export function isBusinessDay(date: CivilDate | string, calendar: HolidayCalendar): boolean {
  const normalised = civilDate(date);
  assertWithinCoverage(normalised, calendar, 'business-day query');
  return isBusinessDayNormalised(normalised, calendar);
}

/** `isBusinessDay` for a date already validated as inside coverage. */
function isBusinessDayNormalised(date: CivilDate, calendar: HolidayCalendar): boolean {
  if (calendar.workingDayOverrides.has(date)) return true;
  if (calendar.holidays.has(date)) return false;
  return !calendar.weekendDays.includes(weekdayCodeOf(date));
}

/** `isBusinessDay` by day number, with the coverage check — the walk's inner loop. */
function isBusinessDayByDayNumber(dayNumber: number, calendar: HolidayCalendar): boolean {
  const date = civilDateFromDayNumber(dayNumber);
  assertWithinCoverage(date, calendar, 'business-day walk reached');
  return isBusinessDayNormalised(date, calendar);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Arithmetic
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Add `n` business days to `start`, stepping from `start` **EXCLUSIVE**.
 *
 * - `n === 0` returns `start` unchanged — **no roll**, even on a Friday or a holiday.
 * - `n !== 0` always lands on a business day, so a business-day window needs no terminal roll.
 * - `n < 0` walks backwards (pre-alert offsets, and the `preceding` roll direction).
 *
 * Throws `CALENDAR_UNAVAILABLE` if the walk (or `start` itself) leaves the calendar's coverage.
 */
export function addBusinessDays(
  start: CivilDate | string,
  n: number,
  calendar: HolidayCalendar,
): CivilDate {
  if (!Number.isInteger(n)) {
    throw new RangeError(
      `addBusinessDays: n must be an integer, received ${String(n)}. A fractional or non-finite ` +
        'business-day count is never a real statutory window.',
    );
  }
  const from = civilDate(start);
  assertWithinCoverage(from, calendar, 'business-day walk start');
  if (n === 0) return from;

  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let dayNumber = civilDayNumber(from);
  while (remaining > 0) {
    dayNumber += step;
    if (isBusinessDayByDayNumber(dayNumber, calendar)) remaining -= 1;
  }
  return civilDateFromDayNumber(dayNumber);
}

/**
 * Business days from `from` (**exclusive**) to `to` (**inclusive**), measured in the direction of
 * travel — so the result is negative when `to` precedes `from`.
 *
 * That convention is what makes `countBusinessDays(d, addBusinessDays(d, n)) === n` hold for
 * NEGATIVE `n` as well as positive (properties D4 and D7). The naive "from exclusive, to inclusive
 * regardless of direction" reading breaks the moment `from` is itself a weekend day.
 */
export function countBusinessDays(
  from: CivilDate | string,
  to: CivilDate | string,
  calendar: HolidayCalendar,
): number {
  const start = civilDate(from);
  const end = civilDate(to);
  assertWithinCoverage(start, calendar, 'business-day count start');
  assertWithinCoverage(end, calendar, 'business-day count end');

  const startDay = civilDayNumber(start);
  const endDay = civilDayNumber(end);
  if (startDay === endDay) return 0;

  const step = endDay > startDay ? 1 : -1;
  let count = 0;
  for (let dayNumber = startDay + step; ; dayNumber += step) {
    if (isBusinessDayByDayNumber(dayNumber, calendar)) count += 1;
    if (dayNumber === endDay) break;
  }
  return step === 1 ? count : -count;
}

/**
 * Which direction a non-business day is moved in.
 *
 * **Statutory, not stylistic.** `following` is the file-after-a-trigger direction; `preceding` is
 * the renew-before-expiry direction; `none` asserts that the raw date stands. There is deliberately
 * no `nearest` and no default — picking one on the caller's behalf picks a legal position.
 */
export type RollConvention = 'following' | 'preceding' | 'none';

const ROLL_CONVENTIONS: ReadonlySet<string> = new Set<string>(['following', 'preceding', 'none']);

/** Move `date` onto a business day in the requested direction (a no-op if it already is one). */
export function rollToBusinessDay(
  date: CivilDate | string,
  convention: RollConvention,
  calendar: HolidayCalendar,
): CivilDate {
  if (typeof convention !== 'string' || !ROLL_CONVENTIONS.has(convention)) {
    calendarUnavailable(
      `unrecognised roll convention ${JSON.stringify(convention)} (expected 'following', ` +
        "'preceding' or 'none'). Defaulting here would choose a statutory direction on the " +
        "caller's behalf",
      { convention },
    );
  }
  const normalised = civilDate(date);
  assertWithinCoverage(normalised, calendar, 'roll target');
  if (convention === 'none') return normalised;

  const step = convention === 'following' ? 1 : -1;
  let dayNumber = civilDayNumber(normalised);
  while (!isBusinessDayByDayNumber(dayNumber, calendar)) {
    dayNumber += step;
  }
  return civilDateFromDayNumber(dayNumber);
}

/**
 * The next business day **strictly after** `date`.
 *
 * Defined as `addBusinessDays(date, 1, calendar)` so there is exactly one implementation of the
 * walk — two would be two things to keep in agreement, and S1's lesson is that nothing keeps two
 * copies of a rule in agreement by itself.
 */
export function nextBusinessDay(date: CivilDate | string, calendar: HolidayCalendar): CivilDate {
  return addBusinessDays(date, 1, calendar);
}

/** The last business day **strictly before** `date`. Mirror of `nextBusinessDay`. */
export function previousBusinessDay(
  date: CivilDate | string,
  calendar: HolidayCalendar,
): CivilDate {
  return addBusinessDays(date, -1, calendar);
}
