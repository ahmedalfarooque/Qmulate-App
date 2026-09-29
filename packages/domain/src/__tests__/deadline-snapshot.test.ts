/**
 * ⊕ S11-1 — the window AS APPLIED is built in ONE place, and its shape is pinned here.
 *
 * `windowSnapshotOf` moved from `packages/api`'s router into the domain because the SEED became a
 * second writer of `Deadline` rows. Two copies of a key list agree only until one changes; one
 * implementation plus this pin is how the shape stays a measurement. The pin is deliberately a
 * hand-list (vocabulary, per the canon): adding a key goes RED here and is then a deliberate act.
 */

import { describe, expect, it } from 'vitest';

import { buildHolidayCalendar } from '../dates/index.js';
import { WINDOW_SNAPSHOT_KEYS, computeRuleDeadline, windowSnapshotOf } from '../deadlines/index.js';

const calendar = buildHolidayCalendar({
  workweek: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
  coverage: { from: '2026-01-01', to: '2026-12-31' },
  observed: [{ date: '2026-02-22', nameAr: 'يوم التأسيس', nameEn: 'Founding Day' }],
});

const settings = {
  windowBusinessDays: {
    v: 30,
    unit: 'business_days',
    unverified: true,
    source: 'test',
    note: '⚠ unverified — confirm vs primary law',
  },
};

describe('windowSnapshotOf — one implementation, one key set', () => {
  it('carries exactly the pinned keys, in order, with `null` where a dimension does not apply', () => {
    const computed = computeRuleDeadline({
      ruleKey: 'REGISTER_30BD',
      anchor: '2026-01-15',
      calendar,
      settings,
    });
    const snapshot = windowSnapshotOf(computed, settings, null);
    expect(Object.keys(snapshot)).toStrictEqual([...WINDOW_SNAPSHOT_KEYS]);
    expect(snapshot.settingKey).toBe('deadline.REGISTER_30BD.businessDays');
    expect(snapshot.businessDays).toBe(30);
    // A business-day rule has no month dimension: `null`, not absent — "not applicable" is a value.
    expect(snapshot.calendarMonths).toBeNull();
    expect(snapshot.unverified).toBe(true);
  });

  it('adds `anchorSource` ONLY when a declared home is named — absent, not null, otherwise', () => {
    const computed = computeRuleDeadline({
      ruleKey: 'REGISTER_30BD',
      anchor: '2026-01-15',
      calendar,
      settings,
    });
    const provenance = {
      subject: 'waqf' as const,
      sourceId: 'waqf-001',
      kind: 'REGULATION_EFFECTIVE_DATE',
    };
    const withSource = windowSnapshotOf(computed, settings, provenance);
    expect(Object.keys(withSource)).toStrictEqual([...WINDOW_SNAPSHOT_KEYS, 'anchorSource']);
    expect(withSource.anchorSource).toStrictEqual(provenance);
    // The coalescing path passes null and must not leave a `null` key behind — a reader that saw
    // `anchorSource: null` could not tell "no home named" from "provenance unreadable".
    expect('anchorSource' in windowSnapshotOf(computed, settings, null)).toBe(false);
  });

  it('the pinned key list is closed — ten keys, and this file is where an eleventh is declared', () => {
    expect([...WINDOW_SNAPSHOT_KEYS]).toStrictEqual([
      'settingKey',
      'basis',
      'businessDays',
      'calendarMonths',
      'calendarDays',
      'monthAnchor',
      'roll',
      'unverified',
      'leadSettingKey',
      'preExpiryLeadBd',
    ]);
  });
});
