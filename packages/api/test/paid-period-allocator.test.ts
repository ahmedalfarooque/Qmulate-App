/**
 * The disjoint-window allocator's own suite — AV7-F2 / migration 26.
 *
 * ── WHY A TEST FOR A HELPER THAT LOOKS OBVIOUS ──────────────────────────────────────────────
 * `paidPeriod()` exists because installing `distribution_paid_periods_disjoint` turned 25 of 620
 * tests in this package red, and every one was a TRUE POSITIVE: the suites pinned `periodEnd` to
 * `2026-03-31` and varied only the START DAY, so their windows all overlapped each other AND the
 * seeded, already-paid `dist-001`. `waqf-001` has exactly ONE income receipt in the whole fixture
 * (`rev-001`), so one receipt was being distributed run after run. **The test suite was exercising
 * AV7-F2 on every pass, and the suites asserting that the lifecycle "worked" were the same shape
 * as the attack A-10 recorded as a breach.**
 *
 * The allocator's whole claim is that it cannot regrow that. A claim like that must be tested over
 * the WHOLE space it can produce, not on an example — an allocator that happens to be disjoint for
 * the ordinals somebody tried is the same discipline-based guarantee it replaced. So this file
 * enumerates every (suite, ordinal) pair the allocator admits and asserts pairwise disjointness
 * over all of them.
 *
 * ⚠ AND IT CHECKS TWO THINGS A DISJOINTNESS SWEEP ALONE CANNOT:
 *   · every window lies inside {@link PAID_PERIOD_BAND} — outside it the ENGINE REFUSES, because
 *     the seeded holiday calendar does not cover the fiscal-year anchor the deadline needs. A
 *     window can be perfectly disjoint and still uncomputable.
 *   · no allocated month falls inside the 2026-09 … 2027-10 range `av7-corpus-wall` populates with
 *     its own receipts — a window that swallowed one of those would change a pool THAT file
 *     asserts, and the failure would surface over there as a message about money. The exact
 *     guarantee against that is a RUNTIME one, in `bookIncome()`: it refuses if its window holds
 *     anything but the row it just booked.
 *
 * ⚠ NO DATABASE, deliberately: this runs in the `unit` CI job, which is the job that goes red when
 * somebody adds a suite and gives it a month another suite already owns. The constraint's
 * BEHAVIOUR lives in the integration suites and in migration 26 §3.
 */

import { describe, expect, it } from 'vitest';

import {
  PAID_PERIOD_BAND,
  PAID_PERIOD_YEARS,
  paidPeriod,
  paidPeriodCapacity,
  dateInsidePaidPeriod,
  type PaidPeriodSuite,
} from './setup.js';

/** Inclusive-on-both-ends day interval, as the constraint's `daterange(…, '[]')` sees it. */
interface Interval {
  readonly suite: string;
  readonly ordinal: number;
  readonly startDay: number;
  /** EXCLUSIVE, i.e. `periodEnd + 1 day` — `'[]'` normalised, and what `periodWindow()` produces. */
  readonly endDayExclusive: number;
}

/** Days since the epoch for a `YYYY-MM-DD` civil date. */
function dayNumber(civil: string): number {
  const [y, m, d] = civil.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

const SUITES = Object.keys(PAID_PERIOD_YEARS) as readonly PaidPeriodSuite[];

const EVERY_WINDOW: readonly Interval[] = SUITES.flatMap((suite) =>
  Array.from({ length: paidPeriodCapacity(suite) }, (_, i) => i + 1).map((ordinal) => {
    const period = paidPeriod(suite, ordinal);
    return {
      suite,
      ordinal,
      startDay: dayNumber(period.periodStart),
      endDayExclusive: dayNumber(period.periodEnd) + 1,
    };
  }),
);

/** Half-open overlap: each starts before the other ends. */
function overlaps(a: Interval, b: Interval): boolean {
  return a.startDay < b.endDayExclusive && b.startDay < a.endDayExclusive;
}

describe('paidPeriod · the disjoint-window allocator (AV7-F2)', () => {
  it('is not vacuous — there are suites, and every one has capacity', () => {
    // FOUR, not five: `av7-corpus-wall` is deliberately NOT in the registry. It already drives its
    // own monthly windows and books its own receipts (A-1 … A-12), and A-10 must be able to build
    // an OVERLAPPING pair on purpose — it is the test that proves the constraint refuses one.
    expect(SUITES.length).toBeGreaterThanOrEqual(4);
    expect(EVERY_WINDOW.length).toBeGreaterThanOrEqual(SUITES.length * 4);
    for (const suite of SUITES) expect(paidPeriodCapacity(suite)).toBeGreaterThanOrEqual(4);
  });

  it('gives every suite DISTINCT months — a shared month would pass or fail by file order', () => {
    // The suites share one database and several purge distributions with
    // `createdBy LIKE 'user-test-api-%'`, i.e. each other's. A shared month is order-dependent.
    const all = SUITES.flatMap((suite) => [...PAID_PERIOD_YEARS[suite]]);
    const duplicates = all.filter((month, i) => all.indexOf(month) !== i);
    expect(duplicates, `SUITE_MONTHS reuses: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('⚠ EVERY window is pairwise DISJOINT from every other, over the whole space', () => {
    const found: string[] = [];
    for (let i = 0; i < EVERY_WINDOW.length; i++) {
      for (let j = i + 1; j < EVERY_WINDOW.length; j++) {
        const a = EVERY_WINDOW[i] as Interval;
        const b = EVERY_WINDOW[j] as Interval;
        if (overlaps(a, b)) found.push(`${a.suite}#${a.ordinal} ↔ ${b.suite}#${b.ordinal}`);
      }
    }
    expect(found, found.slice(0, 8).join(' | ')).toEqual([]);
  });

  it('⚠ EVERY window lies inside PAID_PERIOD_BAND — outside it the ENGINE REFUSES', () => {
    // Not a tidiness rule. `runDeadline()` anchors on `<periodEnd's YEAR>-<fiscalYearEnd>` and adds
    // the 3-month post-FYE window, so a period in year Y makes the engine ask the holiday calendar
    // about Y-12-31 and (Y+1)-03-31. The seeded calendar covers 2026-02-22 … 2028-09-23, so Y=2028
    // asks 2028-12-31 and gets CALENDAR_UNAVAILABLE. A window can be perfectly disjoint and still
    // uncomputable, and that failure reads as a broken run rather than as a bad window.
    const from = dayNumber(PAID_PERIOD_BAND.from);
    const to = dayNumber(PAID_PERIOD_BAND.to);
    for (const w of EVERY_WINDOW) {
      expect(
        w.startDay,
        `${w.suite}#${w.ordinal} starts before PAID_PERIOD_BAND.from (${PAID_PERIOD_BAND.from})`,
      ).toBeGreaterThanOrEqual(from);
      expect(
        w.endDayExclusive - 1,
        `${w.suite}#${w.ordinal} ends after PAID_PERIOD_BAND.to (${PAID_PERIOD_BAND.to}) — the ` +
          `engine will answer CALENDAR_UNAVAILABLE, not a wrong number`,
      ).toBeLessThanOrEqual(to);
    }
  });

  it('⚠ NO allocated month falls in the range av7-corpus-wall populates itself', () => {
    // The hazard a disjointness sweep cannot see: an allocated window that CONTAINS another
    // suite's receipt changes a pool that suite asserts, and the failure surfaces over there with
    // a message about money rather than about windows.
    //
    // ⚠ THIS CHECK IS DELIBERATELY NARROW, AND THE WIDE VERSION WAS DELETED. The first draft
    // scanned every date literal in every test file and flagged 31 "collisions" — almost all of
    // them the test CLOCK (`NOW = new Date('2026-08-18…')`), which is not a ledger date at all. A
    // check that cries wolf on the clock would be turned off by the next person to see it red. So
    // the static half asserts only the one fact that is exactly checkable, and the REAL guarantee
    // is the runtime one: `bookIncome()` refuses if its window is not empty apart from the row it
    // just booked (see its docstring). That cannot be fooled by anything a text scan would miss.
    const CORPUS_WALL_RANGE = { from: '2026-09', to: '2027-10' } as const;
    const offenders = SUITES.flatMap((suite) =>
      [...PAID_PERIOD_YEARS[suite]]
        .filter((month) => month >= CORPUS_WALL_RANGE.from && month <= CORPUS_WALL_RANGE.to)
        .map((month) => `${suite} is allocated ${month}`),
    );
    expect(
      offenders,
      `av7-corpus-wall drives its own monthly windows and books its own receipts across ` +
        `${CORPUS_WALL_RANGE.from} … ${CORPUS_WALL_RANGE.to} (A-1 … A-12). A window allocated in ` +
        `that range would capture one of its receipts.`,
    ).toEqual([]);
  });

  it('is DETERMINISTIC — the same key always yields the same window', () => {
    for (const suite of SUITES) {
      for (let ordinal = 1; ordinal <= paidPeriodCapacity(suite); ordinal++) {
        expect(paidPeriod(suite, ordinal)).toEqual(paidPeriod(suite, ordinal));
      }
    }
  });

  it('splits each month into four weekly slots, the last running to month end', () => {
    expect(paidPeriod('distribution-run', 1)).toEqual({
      periodStart: '2026-05-01',
      periodEnd: '2026-05-07',
    });
    expect(paidPeriod('distribution-run', 2)).toEqual({
      periodStart: '2026-05-08',
      periodEnd: '2026-05-14',
    });
    expect(paidPeriod('distribution-run', 3)).toEqual({
      periodStart: '2026-05-15',
      periodEnd: '2026-05-21',
    });
    // ⚠ The LAST slot runs to the end of the month — 31 in May, 30 in June — so the 29th/30th/31st
    // are never in a gap no window covers. A hard-coded 28 would leave days a receipt could be
    // booked into with nothing paying them.
    expect(paidPeriod('distribution-run', 4)).toEqual({
      periodStart: '2026-05-22',
      periodEnd: '2026-05-31',
    });
    expect(paidPeriod('distribution-run', 8)).toEqual({
      periodStart: '2026-06-22',
      periodEnd: '2026-06-30',
    });
    // February, on a NON-leap year, in the band.
    expect(paidPeriod('av7-lifecycle-trail', 4)).toEqual({
      periodStart: '2027-12-22',
      periodEnd: '2027-12-31',
    });
  });

  it('REFUSES an out-of-range ordinal rather than wrapping into another suite’s window', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => paidPeriod('distribution-run', bad)).toThrow(/ordinal must be an integer/);
    }
    // One past capacity is the interesting case: it is the wrap that would collide silently.
    const capacity = paidPeriodCapacity('av7-lifecycle-trail');
    expect(() => paidPeriod('av7-lifecycle-trail', capacity + 1)).toThrow(
      /ordinal must be an integer/,
    );
  });

  it('dateInsidePaidPeriod lands strictly inside its window, for every window', () => {
    // A booking date one day outside the window is the failure that looks like "the engine lost my
    // receipt": the run computes, finds an empty ledger, and reports a zero pool.
    for (const suite of SUITES) {
      for (let ordinal = 1; ordinal <= paidPeriodCapacity(suite); ordinal++) {
        const period = paidPeriod(suite, ordinal);
        const booked = dateInsidePaidPeriod(period).slice(0, 10);
        expect(
          dayNumber(booked),
          `${suite}#${ordinal} books before its window`,
        ).toBeGreaterThanOrEqual(dayNumber(period.periodStart));
        expect(dayNumber(booked), `${suite}#${ordinal} books after its window`).toBeLessThanOrEqual(
          dayNumber(period.periodEnd),
        );
      }
    }
  });

  it('⚠ MUTATION · the disjointness sweep really bites — a reused month is caught by it alone', () => {
    // The guarantee must not rest on the distinct-months assertion: if somebody deletes that, the
    // sweep above still has to fail. This drives the sweep's own logic over two suites sharing a
    // month and requires it to report both halves.
    const windows: Interval[] = ['alpha', 'beta'].flatMap((suite) =>
      [1, 2].map((ordinal) => {
        const startDay = ordinal === 1 ? dayNumber('2026-06-01') : dayNumber('2026-06-16');
        const endDay = ordinal === 1 ? dayNumber('2026-06-15') : dayNumber('2026-06-30');
        return { suite, ordinal, startDay, endDayExclusive: endDay + 1 };
      }),
    );
    const found: string[] = [];
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i] as Interval;
        const b = windows[j] as Interval;
        if (overlaps(a, b)) found.push(`${a.suite}#${a.ordinal} ↔ ${b.suite}#${b.ordinal}`);
      }
    }
    // alpha#1↔beta#1 and alpha#2↔beta#2. The two halves of one month must NOT be reported.
    expect(found).toEqual(['alpha#1 ↔ beta#1', 'alpha#2 ↔ beta#2']);
  });
});
