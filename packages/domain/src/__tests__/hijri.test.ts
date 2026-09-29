/**
 * Umm al-Qura (Hijri) conversion — the SINGLE implementation for the whole monorepo.
 *
 * ## Why this file is the strictest one in the package
 *
 * Sprint 1 froze Hijri strings into the database. `packages/database/src/seed/hijri.ts` refuses
 * to load unless the runtime reproduces six pinned conversions, and every legally significant
 * date is stored as a canonical Gregorian `DateTime` PLUS a `…Hijri` snapshot frozen at write
 * time (§17 schema convention 2). Those snapshots are **committed history**: they appear on
 * filings that have already gone to the Authority. If this module's mapping differs from the one
 * that wrote them by a single day, it does not "produce a different answer" — it retroactively
 * rewrites what a filed report says.
 *
 * So the six anchors are asserted here in **both directions**, and they are the same six strings
 * the seed pins. Per decision D-4 this package is the one implementation (Node `Intl`, no
 * `@umalqura/core`), and the seed becomes a thin re-export of it.
 *
 * ## The out-of-range trap
 *
 * The official Umm al-Qura tables cover **1300–1600 AH** (1882-11-12 … 2174-11-25 Gregorian).
 * Outside that window Node's ICU does NOT fail — it silently falls back to an arithmetic
 * approximation and returns a confident, wrong answer: `1500-01-01` (Gregorian) yields
 * `0905-05-20`, a date the Umm al-Qura calendar never defined. An extrapolated Hijri date on a
 * waqf deed is a fabricated fact. Every public entry point here THROWS outside the range.
 */

import { describe, expect, it } from 'vitest';

import { civilDate } from '../dates/civil-date.js';
import {
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
} from '../dates/hijri.js';

/** Run `fn` and hand back whatever it threw (or `undefined` if it did not throw). */
function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

/**
 * Assert a `RangeError` whose message NAMES the range fault.
 *
 * The message check is load-bearing, not cosmetic. A mutation run found that deleting the range
 * guard in `toHijriParts` left `toHijri` still throwing — because `formatHijriDate` independently
 * rejects a Hijri year below 1300, so the *downstream validity check* stood in for the *range
 * guard* and a bare `toThrow(RangeError)` could not tell the two apart. Meanwhile `toHijriParts`
 * itself returned silently extrapolated parts. Pinning the reason is what closes that gap.
 */
function expectRangeFault(fn: () => unknown, mustMention: string): void {
  const error = caught(fn);
  expect(error).toBeInstanceOf(RangeError);
  expect((error as RangeError).message).toContain(mustMention);
}

/** The phrase every out-of-range refusal must carry, in both directions. */
const TABLE_WINDOW = 'Umm al-Qura table window';

/**
 * THE SIX FROZEN ANCHORS.
 *
 * Copied deliberately, character for character, from the `ANCHORS` table in
 * `packages/database/src/seed/hijri.ts`. Owner-E's parity test compares the two lists
 * programmatically; this list is the domain-side half of that comparison and must stay in the
 * seed's order and spelling.
 */
const FROZEN_ANCHORS: ReadonlyArray<readonly [gregorian: string, hijri: string, why: string]> = [
  ['1978-05-01', '1398-05-23', 'earliest fixture date (asset-001 acquisition)'],
  ['1980-03-11', '1400-04-23', 'waqf-001 registration'],
  ['2005-06-30', '1426-05-23', 'waqf-004 registration'],
  ['2026-01-01', '1447-07-12', 'SEED_EPOCH'],
  ['2026-03-31', '1447-10-12', 'fixture quarter end'],
  ['2026-04-20', '1447-11-03', 'dist-001 close date'],
];

describe('the six frozen anchors (committed history — a mismatch rewrites filed dates)', () => {
  it.each(FROZEN_ANCHORS)('Gregorian %s → Hijri %s (%s)', (gregorian, hijri) => {
    expect(toHijri(gregorian)).toBe(hijri);
  });

  it.each(FROZEN_ANCHORS)('Hijri %s ← Gregorian %s, inverted (%s)', (gregorian, hijri) => {
    expect(fromHijri(hijri)).toBe(gregorian);
  });

  it('round-trips all six in both directions with no drift', () => {
    for (const [gregorian, hijri] of FROZEN_ANCHORS) {
      expect(fromHijri(toHijri(gregorian))).toBe(gregorian);
      expect(toHijri(fromHijri(hijri))).toBe(hijri);
    }
  });

  it('agrees with toHijriSnapshot for the same instant at UTC midnight', () => {
    // `toHijriSnapshot` is the name `packages/i18n/src/formatters.ts` already documents as living
    // here, and the shape the seed's `toHijri(date: Date)` collapses into. It must evaluate in
    // UTC by default, or the seed's frozen strings change on a non-UTC runner.
    for (const [gregorian, hijri] of FROZEN_ANCHORS) {
      expect(toHijriSnapshot(new Date(`${gregorian}T00:00:00.000Z`))).toBe(hijri);
    }
  });
});

describe('month boundaries', () => {
  it('crosses 1447 → 1448 on the right Gregorian day', () => {
    expect(toHijri('2026-06-15')).toBe('1447-12-29');
    expect(toHijri('2026-06-16')).toBe('1448-01-01');
  });

  it('reports Dhu al-Hijjah 1447 as a 29-day month', () => {
    expect(hijriMonthLength(1447, 12)).toBe(29);
  });

  it('refuses 1447-12-30 — it never clamps a non-existent day to the 29th', () => {
    // A library that clamps here would answer "2026-06-15" for a date that does not exist,
    // which is how a fabricated deed date gets a plausible Gregorian twin.
    expect(() => fromHijri('1447-12-30')).toThrow(RangeError);
    expect(() => fromHijriParts(1447, 12, 30)).toThrow(RangeError);
    expect(isValidHijriDate(1447, 12, 30)).toBe(false);
    expect(isValidHijriDate(1447, 12, 29)).toBe(true);
  });

  it('only ever reports a 29- or 30-day Hijri month', () => {
    for (let year = 1440; year <= 1455; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        expect([29, 30]).toContain(hijriMonthLength(year, month));
      }
    }
  });

  it('is consistent with the forward mapping: month length equals the last valid day', () => {
    for (let year = 1445; year <= 1450; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const length = hijriMonthLength(year, month);
        expect(isValidHijriDate(year, month, length)).toBe(true);
        expect(isValidHijriDate(year, month, length + 1)).toBe(false);
        // Walking one day past the last day of the month must land on day 1 of the next month.
        const last = fromHijriParts(year, month, length);
        const nextParts = toHijriParts(
          civilDate(
            new Date(new Date(`${last}T00:00:00.000Z`).getTime() + 86_400_000)
              .toISOString()
              .slice(0, 10),
          ),
        );
        expect(nextParts.hd).toBe(1);
        expect(nextParts.hm).toBe(month === 12 ? 1 : month + 1);
      }
    }
  });
});

describe('out-of-range conversions THROW — they never extrapolate', () => {
  it('pins the exact nonsense Node ICU would otherwise return for Gregorian 1500-01-01', () => {
    // Node ICU answers '0905-05-20' here, silently, with no error. That is the whole reason this
    // guard exists. If this ever returns a value, the guard is gone.
    expectRangeFault(() => toHijri('1500-01-01'), TABLE_WINDOW);
    const error = caught(() => toHijri('1500-01-01'));
    expect(String(error)).not.toContain('0905-05-20');
  });

  /**
   * THE PARTS ENTRY POINT MUST GUARD TOO.
   *
   * `toHijri` = `formatHijriDate(toHijriParts(d))`, and `formatHijriDate` independently rejects a
   * Hijri year below 1300 — so `toHijri` throws even with the range guard deleted, while
   * `toHijriParts` happily returns `{ hy: 905, hm: 5, hd: 20 }`. Testing the composed function
   * alone therefore cannot see the hole. Each entry point is checked directly, and by REASON.
   */
  it('guards toHijriParts, toHijri and toHijriSnapshot INDEPENDENTLY, below the window', () => {
    expectRangeFault(() => toHijriParts('1500-01-01'), TABLE_WINDOW);
    expectRangeFault(() => toHijriParts('1882-11-11'), TABLE_WINDOW);
    expectRangeFault(() => toHijri('1882-11-11'), TABLE_WINDOW);
    expectRangeFault(() => toHijriSnapshot(new Date('1882-11-11T00:00:00.000Z')), TABLE_WINDOW);
  });

  it('guards all three INDEPENDENTLY above the window as well', () => {
    expectRangeFault(() => toHijriParts('2174-11-26'), TABLE_WINDOW);
    expectRangeFault(() => toHijriParts('2200-01-01'), TABLE_WINDOW);
    expectRangeFault(() => toHijri('2174-11-26'), TABLE_WINDOW);
    expectRangeFault(() => toHijri('2200-01-01'), TABLE_WINDOW);
    expectRangeFault(() => toHijriSnapshot(new Date('2200-01-01T00:00:00.000Z')), TABLE_WINDOW);
  });

  it('publishes the window bounds, and converts on the last day inside each', () => {
    expect(HIJRI_SUPPORTED_RANGE.minCivilDate).toBe('1882-11-12');
    expect(HIJRI_SUPPORTED_RANGE.maxCivilDate).toBe('2174-11-25');
    expect(HIJRI_SUPPORTED_RANGE.minHijriYear).toBe(1300);
    expect(HIJRI_SUPPORTED_RANGE.maxHijriYear).toBe(1600);

    // One day inside each boundary converts.
    expect(toHijri('1882-11-12')).toBe('1300-01-01');
    expect(toHijri('2174-11-25')).toBe('1600-12-30');
    expect(toHijriParts('1882-11-12')).toEqual({ hy: 1300, hm: 1, hd: 1 });
    expect(toHijriParts('2174-11-25')).toEqual({ hy: 1600, hm: 12, hd: 30 });
  });

  it('rejects Hijri years outside 1300–1600 in the inverse direction too, by reason', () => {
    expectRangeFault(() => fromHijriParts(1299, 12, 29), TABLE_WINDOW);
    expectRangeFault(() => fromHijriParts(1601, 1, 1), TABLE_WINDOW);
    expectRangeFault(() => hijriMonthLength(1299, 12), TABLE_WINDOW);
    expectRangeFault(() => hijriMonthLength(1601, 1), TABLE_WINDOW);
    expect(() => fromHijri('1299-12-29')).toThrow(RangeError);
    expect(() => fromHijri('1601-01-01')).toThrow(RangeError);
    expect(() => fromHijri('0905-05-20')).toThrow(RangeError);
    expect(isValidHijriDate(1299, 12, 29)).toBe(false);
    expect(isValidHijriDate(1601, 1, 1)).toBe(false);
    // The boundary years themselves DO convert.
    expect(fromHijriParts(1300, 1, 1)).toBe('1882-11-12');
    expect(fromHijriParts(1600, 12, 30)).toBe('2174-11-25');
  });

  /**
   * WHICH guard fired, not merely that one did.
   *
   * `fromHijriParts` range-checks the year itself AND then calls `hijriMonthLength`, which
   * range-checks again — deliberate defence in depth. A mutation run showed that deleting the
   * entry-point check leaves the downstream one covering for it, so a bare "it throws" assertion
   * cannot tell a two-layer guard from a one-layer guard. Naming the failing layer keeps both
   * honest: this test dies if the entry-point check is removed, and the `hijriMonthLength` case
   * above dies if the downstream one is.
   */
  it('refuses at the ENTRY POINT, not only downstream (both layers pinned separately)', () => {
    expectRangeFault(() => fromHijriParts(1299, 12, 29), 'fromHijri:');
    expectRangeFault(() => hijriMonthLength(1299, 12), 'hijriMonthLength:');
  });

  it('rejects a malformed Hijri string rather than coercing it', () => {
    for (const bad of [
      '1447-1-01',
      '1447-01-1',
      '1447-13-01',
      '1447-00-01',
      '1447-01-00',
      '',
      '1447',
      'not-a-date',
      '1447-01-01 ',
    ]) {
      expect(() => parseHijriDate(bad)).toThrow(RangeError);
      expect(() => fromHijri(bad)).toThrow(RangeError);
    }
  });

  it('rejects an invalid instant, and requires the zone to be a parameter', () => {
    expect(() => toHijriSnapshot(new Date(Number.NaN))).toThrow(RangeError);
    // A Riyadh evening instant is ALREADY the next calendar day in KSA, so the zone changes the
    // frozen snapshot. Both answers are correct; the caller must choose, and 'UTC' is the default
    // because that is what the seeded history was written with.
    const instant = new Date('2026-01-01T21:30:00.000Z');
    expect(toHijriSnapshot(instant)).toBe('1447-07-12');
    expect(toHijriSnapshot(instant, 'UTC')).toBe('1447-07-12');
    expect(toHijriSnapshot(instant, 'Asia/Riyadh')).toBe('1447-07-13');
  });
});

describe('parse / format / parts', () => {
  it('formats parts into the canonical zero-padded machine string', () => {
    expect(formatHijriDate({ hy: 1447, hm: 7, hd: 12 })).toBe('1447-07-12');
    expect(formatHijriDate({ hy: 1400, hm: 12, hd: 30 })).toBe('1400-12-30');
  });

  it('refuses to format a non-existent Hijri date', () => {
    expect(() => formatHijriDate({ hy: 1447, hm: 12, hd: 30 })).toThrow(RangeError);
    expect(() => formatHijriDate({ hy: 1447, hm: 13, hd: 1 })).toThrow(RangeError);
  });

  it('parses into parts and back with no loss', () => {
    expect(parseHijriDate('1447-07-12')).toEqual({ hy: 1447, hm: 7, hd: 12 });
    expect(formatHijriDate(parseHijriDate('1398-05-23'))).toBe('1398-05-23');
  });

  it('exposes parts for a civil date matching the string form', () => {
    expect(toHijriParts(civilDate('2026-01-01'))).toEqual({ hy: 1447, hm: 7, hd: 12 });
    expect(formatHijriDate(toHijriParts(civilDate('2026-01-01')))).toBe(toHijri('2026-01-01'));
  });

  it('uses Latin digits, never Arabic-Indic, in the machine string', () => {
    // `nu-latn` is pinned in the formatter locale. An Arabic-Indic snapshot in the database
    // would break every string comparison and every sort.
    expect(toHijri('2026-01-01')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('purity', () => {
  it('reads no clock: the same input always yields the same output', () => {
    const first = toHijri('2026-03-31');
    const second = toHijri('2026-03-31');
    expect(first).toBe(second);
    expect(first).toBe('1447-10-12');
  });
});
