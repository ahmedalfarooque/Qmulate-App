// QMULATE — the seed's Umm al-Qura (Hijri) helpers.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THIS FILE NO LONGER CONVERTS ANYTHING. THERE IS EXACTLY ONE HIJRI IMPLEMENTATION.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// User decision D-4 (2026-07-27): `packages/domain` owns the single implementation, built on Node's
// `Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn')`. `@umalqura/core` is NOT added — CI runs
// `--frozen-lockfile`, and a new library cannot rewrite frozen history anyway.
//
// Sprint 1 shipped THREE independent implementations of the same conversion:
//
//   1. this file's own `Intl` formatter (with the anchor self-test);
//   2. `defaultToHijri` in `src/extensions/audit.ts` — a second copy, with no anchor test, which
//      stamped `occurredAtHijri` on every audit event;
//   3. the wrapper this file's own header demanded at `src/database/src/hijri.ts`, which was never
//      written.
//
// Two implementations of a FROZEN date snapshot means two different strings can end up in the same
// database for the same instant, and the whole point of freezing the snapshot is that a filed Saudi
// date can never shift retroactively. All three are now one:
//
//   • this module re-exports `@qmulate/domain`'s `toHijriSnapshot`;
//   • `src/client.ts` calls `setHijriFormatter()` — the collapse hook Sprint 1 left unused — at
//     module load, so the audit spine stamps its events with the same function;
//   • `test/hijri-parity.integration.test.ts` asserts the three call sites agree across the
//     fixture's full date range (1978–2026) and on all six frozen anchors, in BOTH directions.
//
// WHAT SURVIVES FROM THE OLD FILE, AND WHY:
//   • THE ANCHOR SELF-TEST. It is not redundant with the domain package's own tests. It runs at
//     MODULE LOAD in the seed process, so the seed physically cannot write a row if this runtime's
//     Umm al-Qura tables disagree with the six conversions already committed to the database. It
//     also catches a small-ICU Node build, where the request silently degrades to Gregorian.
//   • `parseFixtureDate` / `dual`. These are fixture-parsing concerns (a bare `YYYY-MM-DD` anchored
//     at UTC midnight), not calendar arithmetic, and they belong to the seed.
//
// FORMAT (unchanged): `yyyy-MM-dd`, Latin digits, zero-padded, Umm al-Qura, evaluated in UTC.

import { HIJRI_SUPPORTED_RANGE, toHijriSnapshot } from '@qmulate/domain/dates';

/** `yyyy-MM-dd` in the Umm al-Qura calendar, Latin digits, zero-padded. */
export type HijriDateString = string;

/**
 * ANCHOR SELF-TEST — pinned Gregorian→Umm al-Qura conversions, run at MODULE LOAD.
 *
 * These six strings are COMMITTED HISTORY: they are already in the database, in
 * `waqf.registrationDateHijri`, `asset.acquiredDateHijri` and friends, and
 * `test/seed.integration.test.ts` pins three of them literally. If the runtime disagrees with any
 * one of them, every frozen snapshot this seed would write is suspect — so the module refuses to
 * load rather than writing drifted calendar history.
 *
 * D-4 requires the single implementation to reproduce all six BY CONSTRUCTION. That is asserted
 * here, and again from the other direction (Hijri → Gregorian) in
 * `test/hijri-parity.integration.test.ts`.
 */
const ANCHORS: ReadonlyArray<readonly [string, HijriDateString]> = [
  ['1978-05-01', '1398-05-23'], // earliest fixture date (asset-001 acquisition)
  ['1980-03-11', '1400-04-23'], // waqf-001 registration
  ['2005-06-30', '1426-05-23'], // waqf-004 registration
  ['2026-01-01', '1447-07-12'], // SEED_EPOCH
  ['2026-03-31', '1447-10-12'], // fixture quarter end
  ['2026-04-20', '1447-11-03'], // dist-001 close date
];

/** Exported so the parity test drives the SAME six pairs rather than re-typing them. */
export const HIJRI_ANCHORS = ANCHORS;

for (const [gregorian, expected] of ANCHORS) {
  const actual: string = toHijriSnapshot(new Date(`${gregorian}T00:00:00.000Z`));
  if (actual !== expected) {
    throw new Error(
      `Hijri anchor self-test failed: ${gregorian} converted to ${actual}, expected ${expected}. ` +
        'The runtime Umm al-Qura tables differ from the ones the seeded snapshots were pinned ' +
        'against — refusing to write drifted calendar history. (A small-ICU Node build fails here ' +
        'too: the islamic-umalqura request would silently degrade to Gregorian.)',
    );
  }
}

/**
 * Freeze a Gregorian instant as its Umm al-Qura `yyyy-MM-dd` snapshot.
 *
 * A THIN RE-EXPORT of `@qmulate/domain`'s `toHijriSnapshot` — the single implementation (D-4). The
 * seed keeps the name `toHijri` because that is what its ~40 call sites use and because the audit
 * spine exports the same name; renaming would be churn with no safety gain.
 *
 * Deterministic and pure: the same `Date` always yields the same string, which is what lets the
 * audit hash chain be byte-reproducible (assertion A7). Out-of-range instants THROW rather than
 * letting ICU extrapolate — see `HIJRI_SUPPORTED_RANGE`.
 */
export function toHijri(date: Date): HijriDateString {
  if (Number.isNaN(date.getTime())) {
    throw new Error('toHijri received an invalid Date');
  }
  return toHijriSnapshot(date);
}

/** Nullable convenience for optional dual-date columns (`certificateExpiry`, `kycLastRefreshed`, …). */
export function toHijriOrNull(date: Date | null | undefined): HijriDateString | null {
  return date === null || date === undefined ? null : toHijri(date);
}

/** Re-exported so a caller can report the supported window without importing `@qmulate/domain`. */
export { HIJRI_SUPPORTED_RANGE };

/**
 * Parse a fixture `YYYY-MM-DD` string as UTC midnight.
 *
 * DETERMINISM: the fixture supplies calendar dates with no time or zone. Anchoring them at UTC
 * midnight (never at local time) is what makes the seed produce identical rows on a CI runner in
 * any timezone. `new Date('YYYY-MM-DD')` already parses as UTC, but the explicit suffix documents
 * the intent and the regex rejects anything that is not a bare calendar date.
 */
export function parseFixtureDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Invalid fixture date for ${field}: ${JSON.stringify(value)} (expected YYYY-MM-DD)`,
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid fixture date for ${field}: ${JSON.stringify(value)}`);
  }
  return date;
}

/** `parseFixtureDate` for nullable fixture fields. */
export function parseFixtureDateOrNull(
  value: string | null | undefined,
  field: string,
): Date | null {
  return value === null || value === undefined ? null : parseFixtureDate(value, field);
}

/** A Gregorian date and its frozen Hijri twin — the shape every dual-date column pair consumes. */
export interface DualDate {
  readonly gregorian: Date;
  readonly hijri: HijriDateString;
}

/** Build both halves of a dual-date column pair from a fixture `YYYY-MM-DD` string. */
export function dual(value: string, field: string): DualDate {
  const gregorian = parseFixtureDate(value, field);
  return { gregorian, hijri: toHijri(gregorian) };
}

/** Nullable variant: yields `{ gregorian: null, hijri: null }` so both columns stay in step. */
export function dualOrNull(
  value: string | null | undefined,
  field: string,
): { readonly gregorian: Date | null; readonly hijri: HijriDateString | null } {
  if (value === null || value === undefined) return { gregorian: null, hijri: null };
  return dual(value, field);
}
