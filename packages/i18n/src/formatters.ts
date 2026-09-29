/**
 * packages/i18n/src/formatters.ts — money, number, percent and dual-calendar display.
 *
 * Two hard rules from the cross-cutting DoD (§17) are enforced by the TYPES here, not by
 * convention:
 *
 *   1. MONEY IS NEVER A JS `number` (NFR-08). `MoneyValue = string | DecimalLike`, and
 *      `DecimalLike` requires `toNumber()` / `isNegative()` / `isZero()` — members a
 *      primitive `number` does not have. Passing a numeric literal is a COMPILE ERROR.
 *      Values are handed to `Intl` as decimal strings, so an 18,2 amount above 2^53
 *      still formats exactly.
 *
 *   2. A FROZEN HIJRI SNAPSHOT IS NEVER RECOMPUTED (NFR-02). Every legally significant
 *      date is stored as a canonical Gregorian UTC `DateTime` PLUS a `…Hijri` string
 *      frozen at write time. When that snapshot is supplied it is displayed VERBATIM, so
 *      a historical statement never shifts because a calendar library was updated.
 *
 * BOUNDARY: this module does DISPLAY-ONLY Hijri via `Intl`. The authoritative
 * Umm-al-Qura conversion and KSA business-day arithmetic (`@umalqura/core`,
 * `addBusinessDays`, `isBusinessDay`, `toHijriSnapshot`) live in `@qmulate/domain`.
 * Never compute a statutory deadline with anything in this file.
 */

import {
  defaultCurrency,
  defaultLocale,
  defaultNumberingSystem,
  defaultTimeZone,
  intlLocale,
  type Locale,
  type NumberingSystem,
} from './config';

/* ────────────────────────────────────────────────────────────────────────────
 * Money types — the `number` ban, encoded
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Structural type for a decimal.js `Decimal` (or any arbitrary-precision equivalent).
 *
 * Declared structurally rather than importing `decimal.js` so `@qmulate/i18n` stays
 * dependency-light — a real `Decimal` satisfies it. The members were chosen so that a
 * primitive `number` CANNOT satisfy it: `number` has `toFixed`/`toString` but has no
 * `toNumber`, `isNegative` or `isZero`.
 */
export interface DecimalLike {
  toFixed(decimalPlaces?: number): string;
  toString(): string;
  toNumber(): number;
  isNegative(): boolean;
  isZero(): boolean;
}

/** Anything that may carry money. Deliberately excludes `number`. */
export type MoneyValue = string | DecimalLike;

export interface MoneyFormatOptions {
  locale?: Locale;
  /** Latin digits by default, even in `ar` — Saudi banking convention. */
  numberingSystem?: NumberingSystem;
  currency?: string;
  /** `'code'` renders the literal "SAR" in both locales. */
  currencyDisplay?: 'code' | 'symbol' | 'name';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
}

export type NumberFormatOptions = Omit<MoneyFormatOptions, 'currency' | 'currencyDisplay'>;

/* ────────────────────────────────────────────────────────────────────────────
 * Internals
 * ──────────────────────────────────────────────────────────────────────────── */

/** `ar` + `latn` → `ar-SA-u-nu-latn`. */
function intlTag(locale: Locale, numberingSystem: NumberingSystem): string {
  return `${intlLocale[locale]}-u-nu-${numberingSystem}`;
}

const DECIMAL_STRING = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Normalise a MoneyValue to an exact decimal string.
 * `toFixed()` (no argument) is used for DecimalLike because it always yields normal
 * fixed-point notation — `toString()` can emit exponential form for extreme magnitudes.
 */
export function toDecimalString(value: MoneyValue): string {
  const raw = typeof value === 'string' ? value.trim() : value.toFixed();
  if (!DECIMAL_STRING.test(raw)) {
    throw new TypeError(
      `Invalid monetary/numeric value: expected a decimal string or a Decimal, received "${raw}".`,
    );
  }
  return raw;
}

/**
 * `Intl.NumberFormat#format` accepts a decimal STRING (ES2023) for arbitrary precision.
 * The cast is confined to this one helper because the ambient `lib` target may predate
 * ES2023 and type `format` as `(value: number | bigint) => string`.
 */
function formatExact(formatter: Intl.NumberFormat, decimalString: string): string {
  return (formatter.format as (value: number | bigint | string) => string)(decimalString);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Money
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Format a SAR amount. Latin digits in both locales, exactly two fraction digits,
 * currency rendered as the code "SAR".
 *
 * Returns the bare string — the `<CurrencyValue>` component from `@qmulate/ui` wraps it
 * in a `<bdi>` with `tabular-nums` so the amount reads as one atomic, bidi-isolated
 * token and the minus sign cannot jump sides in RTL.
 */
export function formatSar(value: MoneyValue, options: MoneyFormatOptions = {}): string {
  const {
    locale = defaultLocale,
    numberingSystem = defaultNumberingSystem,
    currency = defaultCurrency,
    currencyDisplay = 'code',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    signDisplay = 'auto',
  } = options;

  const formatter = new Intl.NumberFormat(intlTag(locale, numberingSystem), {
    style: 'currency',
    currency,
    currencyDisplay,
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  });

  return formatExact(formatter, toDecimalString(value));
}

/** Alias of {@link formatSar} for call sites that read better as a generic currency. */
export const formatCurrency = formatSar;

/** Format a plain (non-currency) decimal. Same `number`-is-banned contract. */
export function formatNumber(value: MoneyValue, options: NumberFormatOptions = {}): string {
  const {
    locale = defaultLocale,
    numberingSystem = defaultNumberingSystem,
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay = 'auto',
  } = options;

  const formatter = new Intl.NumberFormat(intlTag(locale, numberingSystem), {
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  });

  return formatExact(formatter, toDecimalString(value));
}

export interface PercentFormatOptions {
  locale?: Locale;
  numberingSystem?: NumberingSystem;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /**
   * How the input is expressed. `'ratio'` (the `Intl` convention, and the default) means
   * `0.125` → "12.5%". `'percent'` means the value is ALREADY a percentage: `12.5` →
   * "12.5%". Stated explicitly because entitlement shares are stored either way
   * depending on the source document — never guess.
   */
  basis?: 'ratio' | 'percent';
}

/** Format an entitlement share or a fee rate. Read the `basis` note above before use. */
export function formatPercent(value: MoneyValue, options: PercentFormatOptions = {}): string {
  const {
    locale = defaultLocale,
    numberingSystem = defaultNumberingSystem,
    minimumFractionDigits,
    maximumFractionDigits = 2,
    basis = 'ratio',
  } = options;

  const decimalString = toDecimalString(value);
  const formatter = new Intl.NumberFormat(intlTag(locale, numberingSystem), {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
  });

  if (basis === 'ratio') return formatExact(formatter, decimalString);

  // 'percent' basis: shift the decimal point left by two WITHOUT going through a float.
  return formatExact(formatter, shiftDecimalLeftTwo(decimalString));
}

/** Divide an exact decimal string by 100 by moving the point — no float arithmetic. */
function shiftDecimalLeftTwo(decimalString: string): string {
  const sign = decimalString.startsWith('-') ? '-' : '';
  const unsigned = decimalString.replace(/^[+-]/, '');
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const digits = intPart + fracPart;
  const pointIndex = intPart.length - 2;

  if (pointIndex <= 0) {
    return `${sign}0.${'0'.repeat(-pointIndex)}${digits}`;
  }
  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dates — dual Umm-al-Qura Hijri + Gregorian
 * ──────────────────────────────────────────────────────────────────────────── */

export type DateInput = Date | string;
export type CalendarName = 'hijri' | 'gregorian';
export type DateStyle = 'short' | 'medium' | 'long';

export interface DateFormatOptions {
  locale?: Locale;
  numberingSystem?: NumberingSystem;
  dateStyle?: DateStyle;
  /** Fixed to KSA so server and client render the same calendar day. */
  timeZone?: string;
}

export interface DualDateOptions extends DateFormatOptions {
  /** `'hijri'` on regulator-facing surfaces, `'gregorian'` on internal ops surfaces. */
  primary?: CalendarName;
  /**
   * The FROZEN Hijri string written at insert time (`…AtHijri`). When present it is
   * displayed VERBATIM and never recomputed — this is what keeps a historical statement
   * stable across calendar-library upgrades (NFR-02).
   */
  hijriSnapshot?: string | null;
}

export interface DualDate {
  primary: string;
  secondary: string;
  primaryCalendar: CalendarName;
  /** Canonical Gregorian UTC ISO-8601 — the sort/arithmetic truth. */
  iso: string;
  /** True when the Hijri side came from the frozen snapshot rather than `Intl`. */
  hijriFromSnapshot: boolean;
}

function toDate(input: DateInput): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid date value: "${String(input)}".`);
  }
  return date;
}

/** Gregorian display for the requested locale. */
export function formatGregorian(input: DateInput, options: DateFormatOptions = {}): string {
  const {
    locale = defaultLocale,
    numberingSystem = defaultNumberingSystem,
    dateStyle = 'medium',
    timeZone = defaultTimeZone,
  } = options;

  return new Intl.DateTimeFormat(`${intlLocale[locale]}-u-ca-gregory-nu-${numberingSystem}`, {
    dateStyle,
    timeZone,
  }).format(toDate(input));
}

/**
 * Umm-al-Qura Hijri display. DISPLAY ONLY — never use this to compute or verify a
 * statutory deadline; that is `@qmulate/domain`'s job with `@umalqura/core`.
 */
export function formatHijri(input: DateInput, options: DateFormatOptions = {}): string {
  const {
    locale = defaultLocale,
    numberingSystem = defaultNumberingSystem,
    dateStyle = 'medium',
    timeZone = defaultTimeZone,
  } = options;

  return new Intl.DateTimeFormat(
    `${intlLocale[locale]}-u-ca-islamic-umalqura-nu-${numberingSystem}`,
    { dateStyle, timeZone },
  ).format(toDate(input));
}

/**
 * Render one calendar primary and the other secondary. Both are always available —
 * the alternate is never dropped, because both carry legal meaning.
 *
 * If `hijriSnapshot` is supplied it wins over any computed Hijri value, verbatim.
 */
export function formatDateDual(input: DateInput, options: DualDateOptions = {}): DualDate {
  const { primary = 'gregorian', hijriSnapshot = null, ...rest } = options;

  const date = toDate(input);
  const gregorian = formatGregorian(date, rest);

  const snapshot = typeof hijriSnapshot === 'string' ? hijriSnapshot.trim() : '';
  const hijriFromSnapshot = snapshot.length > 0;
  const hijri = hijriFromSnapshot ? snapshot : formatHijri(date, rest);

  return {
    primary: primary === 'hijri' ? hijri : gregorian,
    secondary: primary === 'hijri' ? gregorian : hijri,
    primaryCalendar: primary,
    iso: date.toISOString(),
    hijriFromSnapshot,
  };
}

/** Alias of {@link formatDateDual}, matching the E0 contract's `formatDual` name. */
export const formatDual = formatDateDual;
