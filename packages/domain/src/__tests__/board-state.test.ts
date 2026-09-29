/**
 * `deriveBoardState` — the calendar-null / config-null branch that no fixture can reach (S11 · 2a's
 * surviving mutation M2, owed to 2b), and the vocabulary pins the i18n parity audit relies on.
 */
import { describe, expect, it } from 'vitest';

import { buildHolidayCalendar } from '../dates/index.js';
import { DEADLINE_STATUSES } from '../deadlines/escalation.js';
import {
  BOARD_CAUSES,
  BOARD_STATES,
  HEALTHY_BOARD_CAUSES,
  deriveBoardState,
  isLifecycleStatus,
} from '../deadlines/board-state.js';

const CONFIG = { preAlertOffsetsBd: [30, 15, 7, 3, 1], atRiskThresholdBd: 3 } as const;

function calendar() {
  return buildHolidayCalendar({
    workweek: ['SUN', 'MON', 'TUE', 'WED', 'THU'] as never,
    coverage: { from: '2026-01-01', to: '2026-12-31' },
    observed: [{ date: '2026-03-20', nameAr: 'عيد الفطر', nameEn: 'Eid al-Fitr' }] as never,
  });
}

describe('deriveBoardState — the branches a fixture cannot reach', () => {
  it('a NULL calendar yields cannot_compute carrying the refusal code — never pending (2a M2)', () => {
    const derived = deriveBoardState({
      today: '2026-09-02',
      due: '2026-09-30',
      satisfiedAt: null,
      waivedAt: null,
      calendar: null,
      config: CONFIG,
      cannotComputeBecause: 'CALENDAR_UNAVAILABLE',
    });
    expect(derived).toEqual({
      state: 'cannot_compute',
      businessDaysRemaining: null,
      cannotCompute: 'CALENDAR_UNAVAILABLE',
    });
  });

  it('a NULL config yields cannot_compute carrying the settings refusal — never pending', () => {
    const derived = deriveBoardState({
      today: '2026-09-02',
      due: '2026-09-30',
      satisfiedAt: null,
      waivedAt: null,
      calendar: calendar(),
      config: null,
      cannotComputeBecause: 'SETTING_MISSING',
    });
    expect(derived.state).toBe('cannot_compute');
    expect(derived.cannotCompute).toBe('SETTING_MISSING');
    expect(derived.businessDaysRemaining).toBeNull();
  });

  it('with no refusal code recorded, the missing input is still named rather than swallowed', () => {
    const derived = deriveBoardState({
      today: '2026-09-02',
      due: '2026-09-30',
      satisfiedAt: null,
      waivedAt: null,
      calendar: null,
      config: null,
      cannotComputeBecause: null,
    });
    expect(derived.cannotCompute).toBe('BOARD_INPUTS_MISSING');
  });

  it('a due date OUTSIDE the calendar coverage is cannot_compute with the engine refusal, not overdue', () => {
    const derived = deriveBoardState({
      today: '2026-09-02',
      due: '2015-09-24',
      satisfiedAt: null,
      waivedAt: null,
      calendar: calendar(),
      config: CONFIG,
      cannotComputeBecause: null,
    });
    expect(derived.state).toBe('cannot_compute');
    expect(derived.cannotCompute).toMatch(/COVERAGE|CALENDAR/);
  });

  it('closed rows read their recorded facts and never consult the calendar', () => {
    expect(
      deriveBoardState({
        today: '2026-09-02',
        due: '2026-01-01',
        satisfiedAt: new Date('2026-04-20T00:00:00.000Z'),
        waivedAt: null,
        calendar: null,
        config: null,
        cannotComputeBecause: 'CALENDAR_UNAVAILABLE',
      }).state,
    ).toBe('met');
    expect(
      deriveBoardState({
        today: '2026-09-02',
        due: '2026-01-01',
        satisfiedAt: null,
        waivedAt: new Date('2026-04-20T00:00:00.000Z'),
        calendar: null,
        config: null,
        cannotComputeBecause: 'CALENDAR_UNAVAILABLE',
      }).state,
    ).toBe('waived');
  });

  it('an open row inside coverage derives through the engine — overdue with negative days', () => {
    const derived = deriveBoardState({
      today: '2026-09-02',
      due: '2026-06-09',
      satisfiedAt: null,
      waivedAt: null,
      calendar: calendar(),
      config: CONFIG,
      cannotComputeBecause: null,
    });
    expect(derived.state).toBe('overdue');
    expect(derived.businessDaysRemaining).not.toBeNull();
    expect(derived.businessDaysRemaining as number).toBeLessThan(0);
    expect(derived.cannotCompute).toBeNull();
  });
});

describe('the board vocabularies — closed, pinned, parseable', () => {
  it('BOARD_STATES is exactly §09’s lifecycle plus cannot_compute', () => {
    expect([...BOARD_STATES]).toEqual([...DEADLINE_STATUSES, 'cannot_compute']);
    for (const status of DEADLINE_STATUSES) expect(isLifecycleStatus(status)).toBe(true);
    expect(isLifecycleStatus('cannot_compute')).toBe(false);
  });

  it('BOARD_CAUSES has six members, two of them healthy, and no duplicates', () => {
    expect(BOARD_CAUSES).toHaveLength(6);
    expect(new Set(BOARD_CAUSES).size).toBe(6);
    expect([...HEALTHY_BOARD_CAUSES].sort()).toEqual(['NOT_IN_SCOPE_YET', 'NO_SUBJECT']);
    for (const cause of HEALTHY_BOARD_CAUSES) expect(BOARD_CAUSES).toContain(cause);
  });
});
