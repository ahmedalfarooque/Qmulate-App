/**
 * Umm al-Qura (Hijri) conversion — **the single implementation for the whole monorepo**.
 *
 * ## Why "single" is the load-bearing word
 *
 * At the end of Sprint 1 there were THREE Hijri implementations: `packages/database/src/seed/hijri.ts`
 * (which pins six anchor conversions and refuses to load unless the runtime reproduces them),
 * `defaultToHijri` in `packages/database/src/extensions/audit.ts` (untested), and a documented-but-
 * absent `@qmulate/domain` engine. Two implementations of a calendar mean two different frozen
 * strings can be written into the same database. Decision **D-4** collapses all three into this
 * module; the seed becomes a thin re-export through its existing `setHijriFormatter()` hook.
 *
 * Per §17 schema convention 2, every legally significant date is stored as a canonical Gregorian
 * UTC `DateTime` **plus** a `…Hijri String` snapshot frozen at insert time. Those snapshots are
 * **committed history** — they appear on filings already lodged with the Authority. If this
 * module's mapping differs from the one that wrote them by a single day, it does not merely
 * "return a different answer": it retroactively rewrites what a filed report says. Hence the six
 * anchors, asserted in both directions in `../__tests__/hijri.test.ts`.
 *
 * ## Implementation: Node `Intl`, deliberately, and no `@umalqura/core` (D-4)
 *
 * `Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn')` on a full-ICU Node 22 build is what
 * wrote the seeded history, so it is what must read it. §17's stack line naming `@umalqura/core` is
 * a recorded deliberate deviation: a dependency swap cannot rewrite frozen strings, and CI runs
 * `--frozen-lockfile`.
 *
 * ## THE OUT-OF-RANGE TRAP (the reason every entry point range-checks)
 *
 * The official Umm al-Qura tables cover **1300–1600 AH**, i.e. **1882-11-12 … 2174-11-25**
 * Gregorian. Outside that window ICU does **not** fail — it silently switches to an arithmetic
 * approximation and returns a confident, wrong answer. Gregorian `1500-01-01` yields `0905-05-20`,
 * a date the Umm al-Qura calendar never defined. An extrapolated Hijri date on a waqf deed is a
 * fabricated fact, so every public function here THROWS outside the range rather than answering.
 *
 * ## Purity
 *
 * No I/O, no clock, no `process.env`. The formatter and a day-number → parts memo are module-level
 * caches; memoising a pure function of static ICU tables is not state.
 */

import {
  civilDate,
  civilDateFromDayNumber,
  civilDateFromInstant,
  civilDayNumber,
  type CivilDate,
} from './civil-date.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

declare const HIJRI_DATE_BRAND: unique symbol;

/**
 * A Umm al-Qura date as a canonical, zero-padded `yyyy-MM-dd` string in **Latin digits**.
 *
 * The format is deliberately identical in shape to `CivilDate` so both halves of a dual-date pair
 * sort and compare the same way. Latin digits are pinned (`nu-latn`): an Arabic-Indic snapshot in a
 * database column would break every string comparison and every sort, and Saudi banking convention
 * uses Latin digits anyway. Display-side localisation is `@qmulate/i18n`'s job, never this file's.
 */
export type HijriDate = string & { readonly [HIJRI_DATE_BRAND]: 'HijriDate' };

/** Numeric Umm al-Qura parts: Hijri year, month (1–12) and day (1–29/30). */
export interface HijriParts {
  readonly hy: number;
  readonly hm: number;
  readonly hd: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The supported range
 * ──────────────────────────────────────────────────────────────────────────── */

const MIN_HIJRI_YEAR = 1300;
const MAX_HIJRI_YEAR = 1600;

/**
 * The window in which a conversion is a LOOKUP rather than an extrapolation.
 *
 * `1300-01-01 AH` = `1882-11-12` and `1600-12-30 AH` = `2174-11-25`, the bounds of the KACST
 * Umm al-Qura tables that ICU carries. Both civil bounds are asserted in the test suite, so a
 * future ICU update that shifts them fails loudly here instead of quietly at a call site.
 */
export const HIJRI_SUPPORTED_RANGE = Object.freeze({
  minHijriYear: MIN_HIJRI_YEAR,
  maxHijriYear: MAX_HIJRI_YEAR,
  minCivilDate: '1882-11-12' as CivilDate,
  maxCivilDate: '2174-11-25' as CivilDate,
});

/* ────────────────────────────────────────────────────────────────────────────
 * The ICU bridge
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The one formatter.
 *
 * Locale spelled exactly as `packages/database/src/seed/hijri.ts` spells it, because that is the
 * configuration that produced the frozen anchors. `timeZone: 'UTC'` is what makes the conversion
 * host-independent.
 */
const UMM_AL_QURA_FORMATTER = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

const MS_PER_DAY = 86_400_000;

/**
 * Day number → Umm al-Qura parts, memoised.
 *
 * The inverse conversion probes a handful of neighbouring days per call, and the property suite
 * samples hundreds of dates, so this cache turns an O(runs × probes) pile of `formatToParts` calls
 * into something negligible. It is a pure memo: the mapping is static ICU data.
 */
const PARTS_BY_DAY_NUMBER = new Map<number, HijriParts>();

function partsOfDayNumber(dayNumber: number): HijriParts {
  const cached = PARTS_BY_DAY_NUMBER.get(dayNumber);
  if (cached !== undefined) return cached;

  const parts = UMM_AL_QURA_FORMATTER.formatToParts(new Date(dayNumber * MS_PER_DAY));
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;
  let era: string | undefined;
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'era') era = part.value;
  }
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(
      'Hijri conversion failed: Intl did not return year/month/day parts. This Node build is ' +
        'probably compiled with small-icu; QMULATE requires full ICU (the Node 22 default). ' +
        'A small-icu build silently degrades this request to the Gregorian calendar.',
    );
  }
  if (era !== undefined && era !== 'AH') {
    // A non-AH era means ICU did not honour the `islamic-umalqura` calendar request at all.
    throw new RangeError(
      `Hijri conversion failed: Intl reported era "${era}", not "AH". The runtime did not apply ` +
        'the islamic-umalqura calendar.',
    );
  }

  const resolved: HijriParts = { hy: Number(year), hm: Number(month), hd: Number(day) };
  PARTS_BY_DAY_NUMBER.set(dayNumber, resolved);
  return resolved;
}

/** Sortable integer key for a Hijri triple — `1447-07-12` becomes `14470712`. */
function hijriKey(parts: HijriParts): number {
  return parts.hy * 10_000 + parts.hm * 100 + parts.hd;
}

/** Mean synodic month, used ONLY as a starting estimate for the inverse search. */
const MEAN_SYNODIC_MONTH = 29.530588853;

/** Day number of `1300-01-01 AH`, the anchor the estimate is measured from. */
const EPOCH_DAY_NUMBER = civilDayNumber(HIJRI_SUPPORTED_RANGE.minCivilDate);

/**
 * Cap on the correction walk in `locateHijriDayNumber`.
 *
 * Measured, not guessed: across the full 1300–1600 AH table the mean-month estimate is never more
 * than **2 days** from the true month start. 40 is a safety margin large enough to absorb a future
 * ICU table revision and small enough that a genuinely impossible target terminates instead of
 * looping.
 */
const MAX_LOCATE_STEPS = 40;

/**
 * Umm al-Qura parts → day number.
 *
 * ICU exposes no inverse, so this estimates from the mean synodic month and then walks day by day
 * to the exact match. Deliberately NOT range-checked: `hijriMonthLength` needs it at the very edge
 * of the table. The range check belongs at the public boundary, where the caller is.
 */
function locateHijriDayNumber(hy: number, hm: number, hd: number): number {
  const monthsSinceEpoch = (hy - MIN_HIJRI_YEAR) * 12 + (hm - 1);
  let dayNumber = EPOCH_DAY_NUMBER + Math.round(monthsSinceEpoch * MEAN_SYNODIC_MONTH) + (hd - 1);
  const target = hy * 10_000 + hm * 100 + hd;

  for (let step = 0; step <= MAX_LOCATE_STEPS; step += 1) {
    const key = hijriKey(partsOfDayNumber(dayNumber));
    if (key === target) return dayNumber;
    dayNumber += key < target ? 1 : -1;
  }

  throw new RangeError(
    `Hijri date ${pad4(hy)}-${pad2(hm)}-${pad2(hd)} could not be located in the Umm al-Qura ` +
      `tables within ${MAX_LOCATE_STEPS} steps. It is treated as non-existent rather than ` +
      'approximated.',
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

function assertInHijriYearRange(hy: number, context: string): void {
  if (!Number.isInteger(hy) || hy < MIN_HIJRI_YEAR || hy > MAX_HIJRI_YEAR) {
    throw new RangeError(
      `${context}: Hijri year ${hy} is outside the Umm al-Qura table window ` +
        `${MIN_HIJRI_YEAR}–${MAX_HIJRI_YEAR} AH. Outside it a conversion would be an ` +
        'EXTRAPOLATION, not a lookup — refused rather than answered.',
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Gregorian → Hijri
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Convert a civil date to Umm al-Qura numeric parts.
 *
 * THROWS outside `HIJRI_SUPPORTED_RANGE` rather than letting ICU extrapolate.
 */
export function toHijriParts(date: CivilDate | string): HijriParts {
  const normalised = civilDate(date);
  if (
    normalised < HIJRI_SUPPORTED_RANGE.minCivilDate ||
    normalised > HIJRI_SUPPORTED_RANGE.maxCivilDate
  ) {
    throw new RangeError(
      `toHijri: ${normalised} is outside the Umm al-Qura table window ` +
        `${HIJRI_SUPPORTED_RANGE.minCivilDate} … ${HIJRI_SUPPORTED_RANGE.maxCivilDate}. ` +
        'Node ICU would silently EXTRAPOLATE an answer here (Gregorian 1500-01-01 becomes a ' +
        'nonsense 10th-century AH date); an extrapolated Hijri date on a waqf record is a ' +
        'fabricated fact, so the conversion is refused.',
    );
  }
  return partsOfDayNumber(civilDayNumber(normalised));
}

/** Convert a civil date to the canonical `yyyy-MM-dd` Umm al-Qura string. */
export function toHijri(date: CivilDate | string): HijriDate {
  return formatHijriDate(toHijriParts(date));
}

/**
 * Freeze an **instant** as its Umm al-Qura snapshot — the write-time call for every `…Hijri` column.
 *
 * `timeZone` defaults to `'UTC'` because UTC is what the Sprint-1 seed used, and changing it would
 * change the frozen strings. Pass `'Asia/Riyadh'` when the snapshot must reflect the Saudi calendar
 * day of a real event: an instant at 21:30Z is already tomorrow in KSA, so the two answers differ
 * for three hours of every day and both are "correct" — the caller must choose.
 *
 * This is the name `packages/i18n/src/formatters.ts` already documents as living in
 * `@qmulate/domain`, and the shape `packages/database/src/seed/hijri.ts`'s `toHijri(date: Date)`
 * collapses into. Do not rename it.
 */
export function toHijriSnapshot(instant: Date, timeZone: string = 'UTC'): HijriDate {
  return toHijri(civilDateFromInstant(instant, timeZone));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hijri → Gregorian
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Length of an Umm al-Qura month: **29 or 30 days**, never anything else.
 *
 * Determined by asking whether a 30th day exists, rather than by differencing two month starts —
 * which keeps `hijriMonthLength(1600, 12)` inside the table instead of probing 1601, the first
 * extrapolated year.
 */
export function hijriMonthLength(hy: number, hm: number): 29 | 30 {
  assertInHijriYearRange(hy, 'hijriMonthLength');
  if (!Number.isInteger(hm) || hm < 1 || hm > 12) {
    throw new RangeError(`hijriMonthLength: Hijri month ${hm} is outside 1–12.`);
  }
  const startDayNumber = locateHijriDayNumber(hy, hm, 1);
  const thirtieth = partsOfDayNumber(startDayNumber + 29);
  return thirtieth.hy === hy && thirtieth.hm === hm && thirtieth.hd === 30 ? 30 : 29;
}

/**
 * Does this Umm al-Qura date exist?
 *
 * Total and non-throwing — `false` for a bad year, a bad month, a bad day, and for anything
 * outside the table window. A predicate that threw would push callers into try/catch control flow.
 */
export function isValidHijriDate(hy: number, hm: number, hd: number): boolean {
  if (!Number.isInteger(hy) || !Number.isInteger(hm) || !Number.isInteger(hd)) return false;
  if (hy < MIN_HIJRI_YEAR || hy > MAX_HIJRI_YEAR) return false;
  if (hm < 1 || hm > 12) return false;
  if (hd < 1) return false;
  return hd <= hijriMonthLength(hy, hm);
}

/**
 * Convert Umm al-Qura parts to a civil date.
 *
 * **Never clamps.** `1447-12-30` does not exist (Dhu al-Hijjah 1447 has 29 days) and throws; a
 * library that clamped it to the 29th would hand a fabricated deed date a plausible Gregorian twin.
 */
export function fromHijriParts(hy: number, hm: number, hd: number): CivilDate {
  assertInHijriYearRange(hy, 'fromHijri');
  if (!Number.isInteger(hm) || hm < 1 || hm > 12) {
    throw new RangeError(`fromHijri: Hijri month ${hm} is outside 1–12.`);
  }
  if (!Number.isInteger(hd) || hd < 1) {
    throw new RangeError(`fromHijri: Hijri day ${hd} is not a positive integer.`);
  }
  const length = hijriMonthLength(hy, hm);
  if (hd > length) {
    throw new RangeError(
      `fromHijri: ${pad4(hy)}-${pad2(hm)}-${pad2(hd)} does not exist — month ${hm} of ${hy} AH ` +
        `has ${length} days. The date is NOT clamped to the ${length}th.`,
    );
  }
  return civilDateFromDayNumber(locateHijriDayNumber(hy, hm, hd));
}

/** Convert a canonical `yyyy-MM-dd` Umm al-Qura string to a civil date. */
export function fromHijri(hijri: HijriDate | string): CivilDate {
  const { hy, hm, hd } = parseHijriDate(hijri);
  return fromHijriParts(hy, hm, hd);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Parse / format (the canonical machine string — display belongs to @qmulate/i18n)
 * ──────────────────────────────────────────────────────────────────────────── */

const HIJRI_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Format numeric parts as the canonical `yyyy-MM-dd` Umm al-Qura string.
 *
 * Validates existence first, so a `HijriDate` value is always a real date. This is a MACHINE
 * format; `formatHijri` / `formatDateDual` in `@qmulate/i18n` do the ar/en display work.
 */
export function formatHijriDate(parts: HijriParts): HijriDate {
  const { hy, hm, hd } = parts;
  if (!isValidHijriDate(hy, hm, hd)) {
    throw new RangeError(
      `formatHijriDate: ${String(hy)}-${String(hm)}-${String(hd)} is not a valid Umm al-Qura date ` +
        `within ${MIN_HIJRI_YEAR}–${MAX_HIJRI_YEAR} AH.`,
    );
  }
  return `${pad4(hy)}-${pad2(hm)}-${pad2(hd)}` as HijriDate;
}

/**
 * Parse a canonical `yyyy-MM-dd` Umm al-Qura string into numeric parts.
 *
 * Rejects unpadded input, surrounding whitespace and any non-existent date. `'1447-01-01 '` — the
 * shape a trimmed-nowhere database column produces — throws rather than being coerced.
 */
export function parseHijriDate(value: HijriDate | string): HijriParts {
  const match = HIJRI_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new RangeError(
      `Invalid Hijri date ${JSON.stringify(value)}: expected a bare, zero-padded yyyy-MM-dd ` +
        'Umm al-Qura date in Latin digits.',
    );
  }
  const hy = Number(match[1]);
  const hm = Number(match[2]);
  const hd = Number(match[3]);
  if (!isValidHijriDate(hy, hm, hd)) {
    throw new RangeError(
      `Invalid Hijri date ${JSON.stringify(value)}: that day does not exist in the Umm al-Qura ` +
        `tables (supported ${MIN_HIJRI_YEAR}–${MAX_HIJRI_YEAR} AH).`,
    );
  }
  return { hy, hm, hd };
}
