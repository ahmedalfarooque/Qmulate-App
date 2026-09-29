/**
 * ⊕ S11-1 — the seed's declared coverage constant vs the window the engine can actually answer for.
 *
 * `SEED_HOLIDAY_COVERAGE` is calendar-YEAR bounds of the years the seed loaded. The engine's
 * coverage is derived from the ROWS — first observed holiday to last (`assembleCalendar`, "never
 * wider than them"). Those are two different questions, and the constant's name answered the
 * second while its value answered the first: a January 2026 anchor was `CALENDAR_UNAVAILABLE` on a
 * fixture whose constant said 2026 was loaded (measured 2026-09-02, S11-1's first gate run).
 *
 * This pin converts that discovered discrepancy into a maintained invariant: the observed-row
 * window is asserted NARROWER THAN OR EQUAL TO the declared bounds, so a widening of either side
 * goes red instead of silently over-promising. Pure — no database.
 */

import { describe, expect, it } from 'vitest';

import { SEED_HOLIDAYS, SEED_HOLIDAY_COVERAGE } from '../src/seed/holidays.js';

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('the seeded holiday rows vs the declared coverage constant', () => {
  const observed = SEED_HOLIDAYS.filter((row) => !row.isWorkingDay)
    .map((row) => isoDay(row.date))
    .sort();
  const first = observed[0];
  const last = observed[observed.length - 1];

  it('has observed holidays to derive a window from at all', () => {
    expect(observed.length).toBeGreaterThan(0);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
  });

  it('the answerable window (first..last observed row) is NARROWER THAN OR EQUAL TO the declared years', () => {
    expect(String(first) >= SEED_HOLIDAY_COVERAGE.from).toBe(true);
    expect(String(last) <= SEED_HOLIDAY_COVERAGE.to).toBe(true);
  });

  it('and it IS narrower at both edges today — the measured fact this file exists to keep visible', () => {
    // If either of these ever becomes false, the constant and the rows have converged: update the
    // constant's doc comment and this expectation deliberately, never by deleting the assertion.
    expect(first).toBe('2026-02-22');
    expect(last).toBe('2028-09-23');
    expect(String(first) > SEED_HOLIDAY_COVERAGE.from).toBe(true);
    expect(String(last) < SEED_HOLIDAY_COVERAGE.to).toBe(true);
  });
});
