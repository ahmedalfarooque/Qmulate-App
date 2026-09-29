import { describe, expect, it } from 'vitest';

import { defaultLocale } from '../src/config';
import {
  formatDateDual,
  formatDual,
  formatGregorian,
  formatHijri,
  formatNumber,
  formatPercent,
  formatSar,
  toDecimalString,
} from '../src/formatters';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * AC-E0-9 — "Money and dates cannot be mis-typed at the boundary"
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Two product invariants are asserted here, both of which look cosmetic and are not:
 *
 *   1. SAR RENDERS IN LATIN DIGITS IN BOTH LOCALES. This is Saudi banking convention, and
 *      it is what keeps a `tabular-nums` column aligned. Arabic-Indic digits in a ledger
 *      column produce a statement a Nazir cannot reconcile by eye against a bank export.
 *
 *   2. A FROZEN HIJRI SNAPSHOT IS DISPLAYED VERBATIM AND NEVER RECOMPUTED (NFR-02). Every
 *      legally significant date is stored as a canonical Gregorian UTC instant PLUS the
 *      Hijri string frozen at write time. If display recomputed the Hijri date, a filing
 *      already lodged with the Authority could silently render a different date after a
 *      calendar-table update — the archived statement would no longer match the record.
 *      The fixture below proves the distinction rather than assuming it: 2026-05-01 is
 *      1447-11-14 in Umm-al-Qura, so a snapshot of `1447-11-02` can only survive if it was
 *      passed through untouched.
 *
 * BOUNDARY: everything here is DISPLAY. Authoritative Umm-al-Qura conversion and KSA
 * business-day arithmetic live in `@qmulate/domain` (E2). No statutory deadline is
 * computed, asserted, or implied in this file.
 */

/**
 * Strip the bidi control characters and normalise the exotic spaces `Intl` inserts, so an
 * assertion can talk about the visible text. `ar` legitimately prefixes an RLM (U+200F) and
 * both locales separate the currency code from the amount with an NBSP (U+00A0) — neither
 * is a defect, and neither should have to be pasted as an invisible literal into a test.
 *
 * `\p{Cf}` covers every bidi/format control; `\p{Zs}` covers every space separator.
 */
function plain(value: string): string {
  return value.replace(/\p{Cf}/gu, '').replace(/\p{Zs}/gu, ' ');
}

/** Just the numerals, grouping and decimal separators — the part that must not vary. */
function numeralsOf(value: string): string {
  return plain(value).replace(/[^0-9.,-]/g, '');
}

/**
 * True when the string contains a decimal digit that is NOT ASCII 0–9: Arabic-Indic
 * (U+0660–U+0669), Extended Arabic-Indic (U+06F0–U+06F9), or any other `Nd` glyph. Written
 * as "remove the ASCII digits, then look for any digit still standing", so no code-point
 * range has to be pasted in as a literal.
 */
function hasNonLatinDigits(value: string): boolean {
  return /\p{Nd}/u.test(value.replace(/[0-9]/g, ''));
}

describe('runtime prerequisites', () => {
  it('runs on a full-ICU Node build', () => {
    // A `small-icu` build silently collapses every locale to en-US and would fail the
    // Arabic assertions below with a baffling diff. Fail here instead, with a reason.
    expect(new Intl.NumberFormat('ar-SA').resolvedOptions().locale).toBe('ar-SA');
    expect(new Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura').resolvedOptions().calendar).toBe(
      'islamic-umalqura',
    );
  });
});

describe('formatSar — Latin digits in both locales', () => {
  it('renders SAR with Latin digits and correct grouping in en', () => {
    const output = formatSar('1234567.5', { locale: 'en' });

    expect(plain(output)).toBe('SAR 1,234,567.50');
    expect(hasNonLatinDigits(output)).toBe(false);
  });

  it('renders SAR with Latin digits and correct grouping in ar', () => {
    const output = formatSar('1234567.5', { locale: 'ar' });

    // `ar-SA` trails the currency code and leads with an RLM. That layout difference is
    // correct locale behaviour; the NUMERALS are what must not change.
    expect(plain(output)).toBe('1,234,567.50 SAR');
    expect(output).toContain('SAR');
    expect(hasNonLatinDigits(output)).toBe(false);
  });

  it('produces identical numerals in ar and en', () => {
    for (const amount of ['0', '100', '1000', '1234567.5', '-420.00']) {
      expect(numeralsOf(formatSar(amount, { locale: 'ar' }))).toBe(
        numeralsOf(formatSar(amount, { locale: 'en' })),
      );
    }
  });

  it('defaults to the product default locale (ar), not to English', () => {
    expect(defaultLocale).toBe('ar');
    expect(formatSar('1250.50')).toBe(formatSar('1250.50', { locale: 'ar' }));
  });

  it('emits Arabic-Indic digits only when explicitly asked for them', () => {
    const optedIn = formatSar('1250.50', { locale: 'ar', numberingSystem: 'arab' });
    const byDefault = formatSar('1250.50', { locale: 'ar' });

    expect(hasNonLatinDigits(optedIn)).toBe(true);
    expect(hasNonLatinDigits(byDefault)).toBe(false);
    expect(optedIn).toContain('SAR');
  });

  it('is tabular: always exactly two fraction digits, whatever the magnitude', () => {
    // This is the formatter's half of "tabular SAR" — a fixed decimal count so the point
    // lines up down a column. The typographic half (Geist Mono + `font-variant-numeric:
    // tabular-nums`) is the `.qm-currency` class in @qmulate/ui, tested there.
    const TABULAR = /^-?\d{1,3}(,\d{3})*\.\d{2}$/;

    for (const amount of ['0', '5', '100', '1000', '1234567.5', '-420']) {
      expect(numeralsOf(formatSar(amount, { locale: 'en' }))).toMatch(TABULAR);
    }
  });

  it('keeps full precision above Number.MAX_SAFE_INTEGER', () => {
    // Decimal(18,2) permits amounts a float cannot represent. Any path through a JS number
    // would render …992.00 here. The value reaches Intl as a decimal string instead.
    const output = formatSar('9007199254740993.01', { locale: 'en' });

    expect(plain(output)).toBe('SAR 9,007,199,254,740,993.01');
  });

  it('renders zero and negative amounts without losing the sign', () => {
    expect(numeralsOf(formatSar('0', { locale: 'en' }))).toBe('0.00');
    expect(numeralsOf(formatSar('-420.00', { locale: 'en' }))).toBe('-420.00');
    expect(numeralsOf(formatSar('-420.00', { locale: 'ar' }))).toBe('-420.00');
  });

  it('accepts a Decimal-shaped object as well as a decimal string', () => {
    // Structural, so `@qmulate/i18n` need not depend on decimal.js. A real decimal.js
    // Decimal satisfies exactly this shape.
    const decimalLike = {
      toFixed: (places?: number) => (places === undefined ? '350000' : '350000.00'),
      toString: () => '350000',
      toNumber: () => 350000,
      isNegative: () => false,
      isZero: () => false,
    };

    expect(plain(formatSar(decimalLike, { locale: 'en' }))).toBe('SAR 350,000.00');
  });
});

describe('toDecimalString — the value guard', () => {
  it.each(['0', '-0.01', '12.5', '.5', '9007199254740993.01', ' 42.00 '])(
    'accepts the decimal string %s',
    (value) => {
      expect(() => toDecimalString(value)).not.toThrow();
    },
  );

  it.each(['', 'abc', '1,000.00', '1e5', 'NaN', '12.3.4', '--1'])(
    'rejects the non-decimal string %s',
    (value) => {
      expect(() => toDecimalString(value)).toThrow(TypeError);
    },
  );

  it('KNOWN GAP: a JS number is banned at the TYPE level only, and truncates at runtime', () => {
    // `MoneyValue = string | DecimalLike` makes `formatSar(1250.5)` a compile error, which
    // is the intended guard. But nothing checks at runtime, and the DecimalLike branch
    // calls `value.toFixed()` — which a primitive number also answers, with ZERO fraction
    // digits. So a number reaching this function through an `any`, a JSON.parse, or an
    // untyped boundary is silently ROUNDED TO THE NEAREST WHOLE RIYAL rather than rejected.
    // This test pins the current behaviour so the loss is visible; it is NOT an endorsement.
    // The fix is a `typeof value === 'number'` throw at the top of `toDecimalString`.
    expect(toDecimalString(1250.5 as never)).toBe('1251');
    expect(toDecimalString(0.994 as never)).toBe('1');
  });
});

describe('formatNumber and formatPercent', () => {
  it('formats a plain number with Latin digits in both locales', () => {
    expect(plain(formatNumber('1234.5', { locale: 'en' }))).toBe('1,234.5');
    expect(numeralsOf(formatNumber('1234.5', { locale: 'ar' }))).toBe('1,234.5');
    expect(hasNonLatinDigits(formatNumber('1234.5', { locale: 'ar' }))).toBe(false);
  });

  it('honours explicit fraction-digit bounds', () => {
    expect(plain(formatNumber('1234.5', { locale: 'en', minimumFractionDigits: 2 }))).toBe(
      '1,234.50',
    );
  });

  it('treats a ratio as a ratio by default — 0.125 renders as 12.5%', () => {
    expect(numeralsOf(formatPercent('0.125', { locale: 'en' }))).toBe('12.5');
    expect(formatPercent('0.125', { locale: 'en' })).toContain('%');
  });

  it("shifts the point without floats when basis is 'percent' — 12.5 renders as 12.5%", () => {
    // Entitlement shares arrive expressed both ways depending on the source document, so
    // the basis is always explicit and never inferred. The shift happens on the decimal
    // STRING, so 7.25 does not become 0.07250000000000001.
    expect(numeralsOf(formatPercent('12.5', { locale: 'en', basis: 'percent' }))).toBe('12.5');
    expect(numeralsOf(formatPercent('7.25', { locale: 'en', basis: 'percent' }))).toBe('7.25');
    expect(numeralsOf(formatPercent('0.5', { locale: 'en', basis: 'percent' }))).toBe('0.5');
  });

  it('keeps Latin digits for percentages in ar, even though the percent sign localises', () => {
    // `ar-SA` uses U+066A rather than U+0025. The SYMBOL may localise; the DIGITS must not.
    const output = formatPercent('0.125', { locale: 'ar' });

    expect(numeralsOf(output)).toBe('12.5');
    expect(hasNonLatinDigits(output)).toBe(false);
  });
});

describe('formatDateDual — both calendars, always', () => {
  /** 09:00 UTC = 12:00 in Riyadh, so no calendar-day ambiguity from the timezone. */
  const INSTANT = '2026-05-01T09:00:00Z';
  /**
   * The FROZEN snapshot for a fixture record. Deliberately NOT the true Umm-al-Qura
   * conversion of `INSTANT` (which is 1447-11-14): if display ever recomputed, this value
   * could not survive, so the test proves the property instead of restating it.
   */
  const FROZEN_HIJRI = '1447-11-02';

  it('returns both calendars plus the canonical ISO instant', () => {
    const result = formatDateDual(INSTANT, { locale: 'en' });

    expect(result.primaryCalendar).toBe('gregorian');
    expect(result.primary).toBe('May 1, 2026');
    expect(result.secondary).toMatch(/1447/);
    expect(result.iso).toBe('2026-05-01T09:00:00.000Z');
    expect(result.hijriFromSnapshot).toBe(false);
  });

  it('never drops the alternate calendar — both carry legal meaning', () => {
    for (const primary of ['hijri', 'gregorian'] as const) {
      const result = formatDateDual(INSTANT, { locale: 'ar', primary });

      expect(result.primary.length).toBeGreaterThan(0);
      expect(result.secondary.length).toBeGreaterThan(0);
      expect(result.primary).not.toBe(result.secondary);
    }
  });

  it("puts Hijri first on regulator-facing surfaces when primary is 'hijri'", () => {
    const result = formatDateDual(INSTANT, { locale: 'en', primary: 'hijri' });

    expect(result.primaryCalendar).toBe('hijri');
    expect(result.primary).toMatch(/1447/);
    expect(result.secondary).toBe('May 1, 2026');
  });

  it('PREFERS a supplied frozen Hijri snapshot and displays it verbatim', () => {
    const computed = formatHijri(INSTANT, { locale: 'en' });
    const result = formatDateDual(INSTANT, { locale: 'en', hijriSnapshot: FROZEN_HIJRI });

    expect(result.secondary).toBe(FROZEN_HIJRI);
    expect(result.hijriFromSnapshot).toBe(true);
    // The proof: the snapshot differs from what this runtime's calendar tables produce.
    expect(computed).not.toBe(FROZEN_HIJRI);
    expect(result.secondary).not.toBe(computed);
  });

  it('uses the frozen snapshot as the PRIMARY value too', () => {
    const result = formatDateDual(INSTANT, {
      locale: 'ar',
      primary: 'hijri',
      hijriSnapshot: FROZEN_HIJRI,
    });

    expect(result.primary).toBe(FROZEN_HIJRI);
    expect(result.hijriFromSnapshot).toBe(true);
  });

  it('leaves the Gregorian side computed even when the Hijri side is frozen', () => {
    // Only the Hijri string is snapshotted at write time. The Gregorian instant IS the
    // canonical record, so it is always rendered from `iso`.
    const result = formatDateDual(INSTANT, { locale: 'en', hijriSnapshot: FROZEN_HIJRI });

    expect(result.primary).toBe(formatGregorian(INSTANT, { locale: 'en' }));
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('recomputes when the snapshot is %s', (_label, snapshot) => {
    const result = formatDateDual(INSTANT, { locale: 'en', hijriSnapshot: snapshot });

    expect(result.hijriFromSnapshot).toBe(false);
    expect(result.secondary).toBe(formatHijri(INSTANT, { locale: 'en' }));
  });

  it('is exposed under the E0 contract name formatDual as the same function', () => {
    expect(formatDual).toBe(formatDateDual);
  });

  it('accepts a Date and an ISO string interchangeably', () => {
    expect(formatDateDual(new Date(INSTANT), { locale: 'en' })).toEqual(
      formatDateDual(INSTANT, { locale: 'en' }),
    );
  });

  it('throws on an unparseable date rather than rendering "Invalid Date"', () => {
    expect(() => formatDateDual('not-a-date')).toThrow(TypeError);
    expect(() => formatGregorian('2026-13-45')).toThrow(TypeError);
  });
});

describe('calendar rendering', () => {
  const INSTANT = '2026-05-01T09:00:00Z';

  it('renders the Umm-al-Qura Hijri year, not the Gregorian one', () => {
    const hijri = formatHijri(INSTANT, { locale: 'en' });

    expect(hijri).toMatch(/1447/);
    expect(hijri).not.toMatch(/2026/);
  });

  it('renders Hijri in Arabic script for the ar locale, with Latin digits', () => {
    const hijri = formatHijri(INSTANT, { locale: 'ar' });

    expect(hijri).toMatch(/\p{Script=Arabic}/u);
    // Latin digits even inside Arabic prose — the same rule as SAR figures.
    expect(hijri).toMatch(/1447/);
    expect(hasNonLatinDigits(hijri)).toBe(false);
  });

  it('resolves the calendar day in Asia/Riyadh, not in UTC', () => {
    // 22:00 UTC is already the NEXT day in Riyadh (UTC+3). Getting this wrong shifts a
    // recorded date across a day boundary — and, downstream, across a deadline.
    expect(formatGregorian('2026-05-01T22:00:00Z', { locale: 'en' })).toBe('May 2, 2026');
    expect(formatGregorian('2026-05-01T09:00:00Z', { locale: 'en' })).toBe('May 1, 2026');
  });

  it('supports the three date styles without throwing', () => {
    for (const dateStyle of ['short', 'medium', 'long'] as const) {
      expect(formatHijri(INSTANT, { locale: 'en', dateStyle })).toMatch(/1447/);
      expect(() => formatGregorian(INSTANT, { locale: 'en', dateStyle })).not.toThrow();
    }
    // `medium` (the default) and `long` carry a four-digit Gregorian year.
    expect(formatGregorian(INSTANT, { locale: 'en', dateStyle: 'medium' })).toMatch(/2026/);
    expect(formatGregorian(INSTANT, { locale: 'en', dateStyle: 'long' })).toMatch(/2026/);
  });

  it('`short` yields a TWO-digit Gregorian year — never use it on a legal record', () => {
    // Characterization, not endorsement: this is stock `Intl` behaviour for `dateStyle:'short'`
    // in `en`, and ICU's islamic-umalqura short pattern is asymmetric (it keeps 1447 in full).
    // A two-digit year is ambiguous on a deed, a filing or a beneficiary statement.
    //
    // TODO(surface): decide whether `formatGregorian` should force a four-digit year outright,
    // or whether `short` stays available for dense table cells only and printed/legal output is
    // held to `medium`+ by a lint rule. Until then the default (`medium`) is the safe one.
    expect(formatGregorian(INSTANT, { locale: 'en', dateStyle: 'short' })).toBe('5/1/26');
    expect(formatHijri(INSTANT, { locale: 'en', dateStyle: 'short' })).toMatch(/1447/);
  });
});
