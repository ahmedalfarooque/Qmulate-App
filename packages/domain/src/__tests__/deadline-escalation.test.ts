/**
 * §09 Engine B's DERIVED state + escalation arithmetic (E8/S9-1).
 *
 * ## The two properties this file exists to hold
 *
 *  - **State is derived, never stored as truth** — every function here is a pure function of
 *    `(facts, today)`, `today` a parameter. The same row asked on two days gives two answers, and
 *    nothing here can be cached as durable (the `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` lesson).
 *  - **Recorded facts beat date arithmetic, and contradictory facts REFUSE** — a deadline both
 *    met and waived is `DEADLINE_STATE_INCOHERENT`, never a precedence choice: ranking them would
 *    decide which record to disbelieve.
 */

import { describe, expect, it } from 'vitest';

import {
  KSA_DEFAULT_WORKWEEK,
  buildHolidayCalendar,
  type HolidayCalendarInput,
} from '../dates/business-days.js';
import { type DomainError, isDomainError } from '../errors.js';
import {
  DEADLINE_STATUSES,
  ESCALATION_LEVELS,
  deriveDeadlineState,
  deriveEscalationLevel,
  preAlertsFiringOn,
  type EscalationLadder,
} from '../deadlines/index.js';

function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function expectIncoherent(fn: () => unknown): DomainError {
  const error = caught(fn);
  expect(isDomainError(error)).toBe(true);
  expect((error as DomainError).code).toBe('DEADLINE_STATE_INCOHERENT');
  return error as DomainError;
}

const CAL: HolidayCalendarInput = {
  workweek: KSA_DEFAULT_WORKWEEK,
  coverage: { from: '2025-01-01', to: '2028-12-31' },
  observed: [
    { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
    { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
  ],
};
const calendar = buildHolidayCalendar(CAL);

/** Due Tuesday 2026-06-30; offsets [30, 15, 7, 3, 1]; at-risk within 3 business days. */
const BASE = {
  due: '2026-06-30',
  calendar,
  preAlertOffsetsBd: [30, 15, 7, 3, 1],
  atRiskThresholdBd: 3,
} as const;

describe('the status walk, one derivation per day', () => {
  it('far out → pending, nothing firing', () => {
    const state = deriveDeadlineState({ ...BASE, today: '2026-05-03' });
    expect(state.status).toBe('pending');
    expect(state.businessDaysRemaining).toBeGreaterThan(30);
    expect(state.preAlertsFiringToday).toEqual([]);
  });

  it('exactly 30 business days out → due_soon, and the 30-offset reminder fires TODAY only', () => {
    // 30 business days before Tue 2026-06-30 on this calendar is Sun 2026-05-17
    // (the two 05-19/20 holidays sit inside the span).
    const state = deriveDeadlineState({ ...BASE, today: '2026-05-17' });
    expect(state.businessDaysRemaining).toBe(30);
    expect(state.status).toBe('due_soon');
    expect(state.preAlertsFiringToday).toEqual([30]);
    // The next day it no longer fires: idempotence comes from the derivation, not a stored flag.
    const nextDay = deriveDeadlineState({ ...BASE, today: '2026-05-18' });
    expect(nextDay.preAlertsFiringToday).toEqual([]);
    expect(nextDay.status).toBe('due_soon');
  });

  it('within the final threshold → at_risk (inclusive: due today IS at risk)', () => {
    const threeOut = deriveDeadlineState({ ...BASE, today: '2026-06-25' }); // Thu, 3 bd before Tue
    expect(threeOut.businessDaysRemaining).toBe(3);
    expect(threeOut.status).toBe('at_risk');
    expect(threeOut.preAlertsFiringToday).toEqual([3]);

    const onTheDay = deriveDeadlineState({ ...BASE, today: '2026-06-30' });
    expect(onTheDay.businessDaysRemaining).toBe(0);
    expect(onTheDay.status).toBe('at_risk');
    expect(onTheDay.preAlertsFiringToday).toEqual([]);
  });

  it('past due, unmet → overdue, with remaining counted NEGATIVE in business days', () => {
    const state = deriveDeadlineState({ ...BASE, today: '2026-07-01' }); // Wednesday
    expect(state.status).toBe('overdue');
    expect(state.businessDaysRemaining).toBe(-1);
    expect(state.preAlertsFiringToday).toEqual([]);
  });

  it('overdue counts along the same axis as remaining: due Thu, asked Fri → 1 business day late', () => {
    // `countBusinessDays` is from-exclusive/to-inclusive in the direction of travel, so the due
    // day itself counts when walking backwards — symmetric with "due tomorrow = 1 remaining".
    const state = deriveDeadlineState({ ...BASE, due: '2026-06-25', today: '2026-06-26' });
    expect(state.status).toBe('overdue');
    expect(state.businessDaysRemaining).toBe(-1);
  });

  it('a weekend-dated deadline (an as-dated hearing) can be late with ZERO business days elapsed', () => {
    // Due Sat 2026-06-27; today Sun 2026-06-28. Calendar-late; the walk back crosses only the
    // weekend due day, so 0 business days have elapsed — late is still late.
    const state = deriveDeadlineState({ ...BASE, due: '2026-06-27', today: '2026-06-28' });
    expect(state.status).toBe('overdue');
    expect(state.businessDaysRemaining).toBe(0);
  });
});

describe('recorded facts', () => {
  it("met wins over any date arithmetic — a deadline met late is met (the lateness is the mirror's business)", () => {
    const state = deriveDeadlineState({ ...BASE, today: '2026-07-15', metDate: '2026-07-02' });
    expect(state.status).toBe('met');
    expect(state.preAlertsFiringToday).toEqual([]);
  });

  it('waived wins the same way', () => {
    const state = deriveDeadlineState({ ...BASE, today: '2026-06-25', waived: true });
    expect(state.status).toBe('waived');
    expect(state.preAlertsFiringToday).toEqual([]);
  });

  it('met AND waived refuses — ranking them would decide which record to disbelieve', () => {
    expectIncoherent(() =>
      deriveDeadlineState({ ...BASE, today: '2026-06-25', metDate: '2026-06-24', waived: true }),
    );
  });
});

describe('threshold validation', () => {
  it('a zero, negative, fractional or duplicated pre-alert offset refuses', () => {
    for (const offsets of [[0], [-3], [2.5], [7, 7]]) {
      expectIncoherent(() =>
        deriveDeadlineState({ ...BASE, preAlertOffsetsBd: offsets, today: '2026-06-01' }),
      );
    }
  });

  it('a negative or fractional at-risk threshold refuses', () => {
    for (const bad of [-1, 1.5]) {
      expectIncoherent(() =>
        deriveDeadlineState({ ...BASE, atRiskThresholdBd: bad, today: '2026-06-01' }),
      );
    }
  });

  it('no offsets at all is legal — a deadline with no reminders still has a lifecycle', () => {
    const state = deriveDeadlineState({
      ...BASE,
      preAlertOffsetsBd: [],
      today: '2026-06-01',
    });
    expect(state.status).toBe('pending');
  });
});

describe('preAlertsFiringOn', () => {
  it('fires an offset exactly on its own day, and nothing at or past due', () => {
    expect(
      preAlertsFiringOn({ ...BASE, today: '2026-06-23' }), // Tue, 5 bd before — no 5 offset
    ).toEqual([]);
    expect(preAlertsFiringOn({ ...BASE, today: '2026-06-29' })).toEqual([1]); // Monday, 1 bd
    expect(preAlertsFiringOn({ ...BASE, today: '2026-06-30' })).toEqual([]);
    expect(preAlertsFiringOn({ ...BASE, today: '2026-07-05' })).toEqual([]);
  });
});

describe('the escalation ladder', () => {
  const LADDER: EscalationLadder = { case_manager: 0, nazir: 3, leadership: 10 };

  const stateAt = (today: string, due = BASE.due) => deriveDeadlineState({ ...BASE, due, today });

  it('a non-overdue deadline never escalates — even due-today (remaining 0, at_risk)', () => {
    expect(deriveEscalationLevel({ state: stateAt('2026-06-30'), ladder: LADDER })).toBeNull();
    expect(deriveEscalationLevel({ state: stateAt('2026-06-01'), ladder: LADDER })).toBeNull();
  });

  it('walks owner → Nazir → Leadership as the overdue count grows', () => {
    // Wed 2026-07-01: 1 business day late → case_manager (rung 0 engaged since overdue).
    expect(deriveEscalationLevel({ state: stateAt('2026-07-01'), ladder: LADDER })).toBe(
      'case_manager',
    );
    // Sun 2026-07-05: 3 business days late → nazir.
    expect(deriveEscalationLevel({ state: stateAt('2026-07-05'), ladder: LADDER })).toBe('nazir');
    // Tue 2026-07-14: 10 business days late → leadership.
    expect(deriveEscalationLevel({ state: stateAt('2026-07-14'), ladder: LADDER })).toBe(
      'leadership',
    );
  });

  it('a rung-0 ladder engages on the FIRST calendar day past due, business days elapsed or not', () => {
    // Due Sat 2026-06-27, today Sun 2026-06-28: overdue with 0 business days elapsed — being
    // late is the fact; the elapsed count only paces the LATER rungs.
    const state = deriveDeadlineState({ ...BASE, due: '2026-06-27', today: '2026-06-28' });
    expect(deriveEscalationLevel({ state, ladder: LADDER })).toBe('case_manager');
  });

  it('a deferred first rung yields null until it engages', () => {
    const deferred: EscalationLadder = { case_manager: 2, nazir: 5, leadership: 10 };
    expect(deriveEscalationLevel({ state: stateAt('2026-07-01'), ladder: deferred })).toBeNull();
    expect(deriveEscalationLevel({ state: stateAt('2026-07-02'), ladder: deferred })).toBe(
      'case_manager',
    );
  });

  it('a ladder that escalates to leadership before the Nazir refuses — mis-assembled config, not policy', () => {
    expectIncoherent(() =>
      deriveEscalationLevel({
        state: stateAt('2026-07-01'),
        ladder: { case_manager: 5, nazir: 3, leadership: 10 },
      }),
    );
    expectIncoherent(() =>
      deriveEscalationLevel({
        state: stateAt('2026-07-01'),
        ladder: { case_manager: 0, nazir: -1, leadership: 10 },
      }),
    );
  });

  it('the vocabularies are closed and ordered', () => {
    expect([...DEADLINE_STATUSES]).toEqual([
      'pending',
      'due_soon',
      'at_risk',
      'overdue',
      'met',
      'waived',
    ]);
    expect([...ESCALATION_LEVELS]).toEqual(['case_manager', 'nazir', 'leadership']);
  });
});
