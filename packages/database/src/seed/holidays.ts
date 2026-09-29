// QMULATE — the seeded KSA business-day calendar (`HolidayCalendar`).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS: "SEEDED" IS A LOAD-BEARING WORD
// ═══════════════════════════════════════════════════════════════════════════════════════════
// §17's E2 exit clause 2 reads, verbatim: "`addBusinessDays` crosses a weekend + **a seeded Hijri
// holiday** correctly". Before this file, `HolidayCalendar` HAD ZERO ROWS — nothing in `seed.ts` or
// `src/seed/*` wrote one, and the only references to the model anywhere in `packages/database/src`
// were the scoping extension's model lists. So the exit clause was unsatisfiable by construction,
// and every business-day answer the system could give was computed over an EMPTY holiday set.
//
// An empty holiday set is the dangerous shape, not the harmless one: it produces a statutory due
// date that is confidently wrong by however many public holidays fall inside the window. That is why
// `buildHolidayCalendar()` in `@qmulate/domain` raises `CALENDAR_UNAVAILABLE` on an empty set
// instead of treating every day as a business day — and why these rows have to exist for the
// deadline engine to answer anything at all.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠ BINDING RULE 3 — EVERY ROW HERE IS UNVERIFIED, AND SAYS SO IN ITS OWN NAME
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The authoritative source for the KSA public-holiday set is an OPEN QUESTION (UD-2, unanswered).
// This list is a STARTER SET, assembled from general knowledge of the Saudi calendar, and it is NOT
// presented as authoritative:
//
//   • `HolidayCalendar` has no `unverified` column, so the marker travels in the NAMES — the
//     English marker is the same `UNVERIFIED_NOTE` constant every unverified `Setting` carries, and
//     the Arabic name carries its Arabic twin. The caveat therefore reaches any report, export or UI
//     that renders a holiday, in whichever language it renders it (NFR-01: Arabic-authoritative).
//   • The Eid dates are RULE-RESOLVED from the Umm al-Qura tables. The Saudi Authority publishes
//     OBSERVED dates, which may differ by a day either way from a table-resolved one (moon
//     sighting), and an extended Eid block is a decree, not an arithmetic fact. Rule-resolved dates
//     are a placeholder for observed ones, never a substitute.
//   • Nothing here may be quoted as "the KSA holiday calendar" until it has been confirmed against
//     an authoritative published source and the ⚠ markers have been removed deliberately.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// DETERMINISM AND AUDIT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Every date is a pure function of the Umm al-Qura tables or of a fixed Gregorian month/day — no
// clock read, no randomness — so the seed stays byte-reproducible (assertion A7). `HolidayCalendar`
// is NOT in `UNAUDITED_MODELS`, so each row written through the audited path appends an
// `audit_event`; the seed writes them in an append-only final step so no existing audit ordinal
// shifts.

import { fromHijriParts, toHijri } from '@qmulate/domain/dates';

import { UNVERIFIED_NOTE } from './settings.js';

/** The Arabic twin of {@link UNVERIFIED_NOTE}. Arabic is the authoritative language (NFR-01). */
export const UNVERIFIED_NOTE_AR = '⚠ غير مُتحقَّق — يلزم التأكد من النص النظامي';

export interface SeedHoliday {
  /** Deterministic id: `holiday-<YYYY-MM-DD>`. */
  readonly id: string;
  /** UTC midnight of the holiday. `HolidayCalendar.date` is `@unique`. */
  readonly date: Date;
  /** The frozen Umm al-Qura twin (§17 schema convention 2 applies to holidays too). */
  readonly dateHijri: string;
  readonly nameAr: string;
  readonly nameEn: string;
  /**
   * `true` marks a date declared a WORKING day despite the weekend or a holiday. No row here sets
   * it: declaring a Friday a working day is a decree, and inventing one would be fabricating a
   * regulatory fact. The column is mapped into `HolidayCalendarInput.workingDayOverrides` all the
   * same, so the path exists the day a real override is recorded.
   */
  readonly isWorkingDay: boolean;
}

/**
 * The Gregorian-fixed Saudi national days.
 *
 * Founding Day (يوم التأسيس, 22 February) and National Day (اليوم الوطني, 23 September) are anchored
 * to the Gregorian calendar, not the Hijri one — the one place in this file where the date does not
 * move year to year.
 */
const GREGORIAN_FIXED: ReadonlyArray<{
  readonly month: number;
  readonly day: number;
  readonly nameAr: string;
  readonly nameEn: string;
}> = [
  { month: 2, day: 22, nameAr: 'يوم التأسيس', nameEn: 'Founding Day' },
  { month: 9, day: 23, nameAr: 'اليوم الوطني', nameEn: 'Saudi National Day' },
];

/**
 * The Hijri-moving Eid blocks.
 *
 * ⚠ THE SPANS ARE THE LEAST CERTAIN THING IN THIS FILE. The anchor days (1 Shawwāl, 9 Dhū al-Ḥijjah)
 * are calendar facts; how many days the public-sector holiday actually runs is set by decree and
 * varies. They are seeded so the business-day engine has a multi-day Hijri-moving holiday to cross —
 * which is exactly what EXIT-2 tests — and every resolved day carries the ⚠ marker.
 */
const HIJRI_RECURRING: ReadonlyArray<{
  readonly hijriMonth: number;
  readonly hijriDay: number;
  readonly spanDays: number;
  readonly nameAr: string;
  readonly nameEn: string;
}> = [
  { hijriMonth: 10, hijriDay: 1, spanDays: 4, nameAr: 'عيد الفطر', nameEn: 'Eid al-Fitr' },
  { hijriMonth: 12, hijriDay: 9, spanDays: 5, nameAr: 'عيد الأضحى', nameEn: 'Eid al-Adha' },
];

/**
 * The Hijri years the Eid blocks are resolved for.
 *
 * 1447–1449 AH spans roughly 2025-06 → 2028-05, which brackets the fixture's own working window
 * (`SEED_EPOCH` = 2026-01-01) with more than a year of slack at each end. The engine's coverage
 * window is derived from the rows themselves, so extending this array is the only change needed to
 * widen it.
 */
const HIJRI_YEARS: readonly number[] = [1447, 1448, 1449];

/** The Gregorian years the fixed national days are resolved for. Chosen to match `HIJRI_YEARS`. */
const GREGORIAN_YEARS: readonly number[] = [2026, 2027, 2028];

function utcMidnight(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

function addDays(civil: string, days: number): string {
  const date = utcMidnight(civil);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function markedAr(nameAr: string): string {
  return `${nameAr} ${UNVERIFIED_NOTE_AR}`;
}

function markedEn(nameEn: string, dayIndex: number, spanDays: number): string {
  const ordinal = spanDays > 1 ? ` (day ${String(dayIndex + 1)} of ${String(spanDays)})` : '';
  return `${nameEn}${ordinal} ${UNVERIFIED_NOTE}`;
}

/**
 * Build the seeded holiday rows.
 *
 * DEDUPED BY DATE, deliberately: `HolidayCalendar.date` is `@unique`, and a Gregorian-fixed national
 * day CAN land inside a Hijri-moving Eid block (the Hijri year drifts ~11 days a year against the
 * Gregorian one, so every Gregorian date eventually meets every Hijri one). Where they collide the
 * two names are joined rather than one silently winning — a lost holiday is a wrong statutory
 * deadline, and a silent overwrite is how you get one.
 */
export function buildSeedHolidays(): readonly SeedHoliday[] {
  const byDate = new Map<string, { nameAr: string; nameEn: string }>();

  const put = (civil: string, nameAr: string, nameEn: string): void => {
    const existing = byDate.get(civil);
    if (existing === undefined) {
      byDate.set(civil, { nameAr, nameEn });
      return;
    }
    // Join, do not overwrite. Both names stay visible with their markers intact.
    byDate.set(civil, {
      nameAr: `${existing.nameAr} / ${nameAr}`,
      nameEn: `${existing.nameEn} / ${nameEn}`,
    });
  };

  for (const year of GREGORIAN_YEARS) {
    for (const fixed of GREGORIAN_FIXED) {
      const civil = `${String(year).padStart(4, '0')}-${String(fixed.month).padStart(2, '0')}-${String(fixed.day).padStart(2, '0')}`;
      put(civil, markedAr(fixed.nameAr), markedEn(fixed.nameEn, 0, 1));
    }
  }

  for (const hijriYear of HIJRI_YEARS) {
    for (const rule of HIJRI_RECURRING) {
      // `fromHijriParts` THROWS rather than clamping a non-existent Hijri date, so a bad anchor is a
      // loud seed failure instead of a plausible wrong date.
      const anchor: string = fromHijriParts(hijriYear, rule.hijriMonth, rule.hijriDay);
      for (let dayIndex = 0; dayIndex < rule.spanDays; dayIndex += 1) {
        put(
          addDays(anchor, dayIndex),
          markedAr(rule.nameAr),
          markedEn(rule.nameEn, dayIndex, rule.spanDays),
        );
      }
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // deterministic insertion order
    .map(([civil, names]) => ({
      id: `holiday-${civil}`,
      date: utcMidnight(civil),
      dateHijri: toHijri(civil),
      nameAr: names.nameAr,
      nameEn: names.nameEn,
      isWorkingDay: false,
    }));
}

/** Everything the seed writes to `holiday_calendar`, in insertion order. */
export const SEED_HOLIDAYS: readonly SeedHoliday[] = buildSeedHolidays();

/**
 * The Gregorian YEARS the seed loaded, as calendar-year bounds.
 *
 * ⚠⚠ THIS IS **NOT** THE WINDOW THE ENGINE CAN ANSWER FOR, AND THE NAME INVITED THAT MISREADING
 * (S11-1, 2026-09-02 — found by walking into it). The engine's coverage is derived from the ROWS,
 * first observed holiday to last, by `packages/api`'s `assembleCalendar` ("coverage never wider
 * than them" — fail-closed and correct), and the seed's own deadline derivation mirrors it. On this
 * fixture that answerable window is **2026-02-22 → 2028-09-23** (Founding Day 1447 → National Day
 * 1450), NARROWER than these bounds at BOTH edges: a January 2026 anchor is `CALENDAR_UNAVAILABLE`
 * although this constant says 2026 is loaded. Nothing on the compute path reads this constant —
 * its only readers are `seed.integration.test.ts` — so it misleads humans and its own test, and
 * nothing else. `holiday-coverage.test.ts` pins the relationship (observed window ⊆ these bounds) so
 * a widening of either side goes red instead of silently over-promising.
 *
 * ⊕ The production consequence is recorded against the DoD's holiday-source open question
 * (`17-build-ship-dod.md`): an authority list that begins mid-year leaves the engine unable to
 * answer for dates before that year's first holiday — a real statutory window the system would
 * decline to compute while every human says "we have that year loaded".
 *
 * (The original rationale, still true of what the VALUE is: derived from the loaded years, never
 * hard-coded, and narrowed by one Gregorian year at each end because the FIRST and LAST Hijri years
 * in the set are only partially covered by the Gregorian span.)
 */
export const SEED_HOLIDAY_COVERAGE: { readonly from: string; readonly to: string } = {
  from: `${String(GREGORIAN_YEARS[0] ?? 2026)}-01-01`,
  to: `${String(GREGORIAN_YEARS[GREGORIAN_YEARS.length - 1] ?? 2028)}-12-31`,
};
