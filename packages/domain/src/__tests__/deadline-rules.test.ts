/**
 * §09 Engine B's RULE VOCABULARY (E8/S9-1) — the nine rule keys, the two refused non-clocks, and
 * the one compute entry point.
 *
 * ## What this file pins, and why each pin exists
 *
 *  - **The vocabulary equals `schema.prisma`'s** `Deadline.ruleKey` doc list, read as TEXT —
 *    the `prisma-vocabulary-parity` pattern: the engine may lead the schema, but never silently.
 *  - **§09's worked example B2 is a PINNED VECTOR**: trigger Sunday 2026-05-10, a 2-day mid-window
 *    holiday, 10 business days → due Tuesday **2026-05-26** — and the naïve "+10 calendar days"
 *    lands on 2026-05-20, which is ITSELF one of the holiday days, i.e. six business days early
 *    of the truth and a filing six days late in the other direction. That contrast is the whole
 *    reason Engine B exists, so it is asserted, not narrated.
 *  - **Windows are envelopes, never numbers** — the ⚠ unverified marker must travel from the
 *    `Setting` row into the computed date (binding rule 3), and a missing figure refuses
 *    (`SETTING_MISSING`) rather than defaulting.
 *  - **`RETENTION_10Y` and `AML_IMMEDIATE` refuse as non-clocks** with named discriminators —
 *    §09's own text for both; for AML also G-6 (a computed AML date in the general deadline plane
 *    would itself tip off). This is the structural answer to `UNRESOLVED_DEADLINE_BINDINGS`
 *    (E7's recorded debt to E8/S9); the catalogue-row notes retire in S9-2's library bump.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  KSA_DEFAULT_WORKWEEK,
  buildHolidayCalendar,
  isBusinessDay,
  type HolidayCalendarInput,
} from '../dates/business-days.js';
import { toHijri } from '../dates/hijri.js';
import { type DomainError, isDomainError } from '../errors.js';
import { isSettingKey, UNVERIFIED_NOTE, type SettingEnvelope } from '../settings.js';
import { OBLIGATION_LIBRARY } from '../compliance/index.js';
import {
  DEADLINE_RULE_KEYS,
  DEADLINE_RULES,
  NON_CLOCK_REFUSALS,
  computeRuleDeadline,
  isDeadlineRuleKey,
  type DeadlineRuleKey,
} from '../deadlines/index.js';

/* ── helpers ──────────────────────────────────────────────────────────────────────────────── */

function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function expectDomainCode(fn: () => unknown, code: string): DomainError {
  const error = caught(fn);
  expect(isDomainError(error)).toBe(true);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

/** A parsed Setting envelope, shaped exactly as `parseSetting` returns one. */
function env<T>(v: T, unit: string | null, unverified = true): SettingEnvelope<T> {
  return unverified
    ? { v, unit, unverified, source: 'test fixture', note: UNVERIFIED_NOTE }
    : { v, unit, unverified, source: 'test fixture' };
}

/**
 * The B2 calendar: KSA Sun–Thu workweek and the worked example's 2-day mid-window holiday
 * (2026-05-19/20) — the same two observed days `deadline.test.ts`'s CAL_A carries, coverage wide
 * enough for the KYC vector that crosses into 2027.
 */
const CAL: HolidayCalendarInput = {
  workweek: KSA_DEFAULT_WORKWEEK,
  coverage: { from: '2025-01-01', to: '2028-12-31' },
  observed: [
    { date: '2026-05-19', nameEn: 'Fixture holiday day 1', nameAr: 'عطلة تجريبية ١' },
    { date: '2026-05-20', nameEn: 'Fixture holiday day 2', nameAr: 'عطلة تجريبية ٢' },
  ],
};
const calendar = buildHolidayCalendar(CAL);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary pins
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the rule vocabulary', () => {
  it("equals schema.prisma's Deadline.ruleKey documented list, read as text", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const schema = readFileSync(resolve(here, '../../../database/prisma/schema.prisma'), 'utf8');
    // The doc comment on `Deadline.ruleKey` lists the nine, pipe-separated across two lines.
    const match = schema.match(
      /§09 rule vocabulary: ([A-Z0-9_ |\n/]+?)\.\s*\n\s*\/\/\/ The WINDOW LENGTH/,
    );
    expect(match, 'the Deadline.ruleKey doc comment moved — re-pin this parser').not.toBeNull();
    const captured = match?.[1] ?? '';
    const documented = captured
      .split('|')
      .map((token) => token.replace(/[^A-Z0-9_]/g, ''))
      .filter((token) => token.length > 0);
    expect(new Set(documented)).toEqual(new Set(DEADLINE_RULE_KEYS));
  });

  it('every descriptor is keyed by its own key, and the kinds partition the nine', () => {
    for (const key of DEADLINE_RULE_KEYS) {
      expect(DEADLINE_RULES[key].key).toBe(key);
    }
    const byKind = (kind: string): DeadlineRuleKey[] =>
      DEADLINE_RULE_KEYS.filter((key) => DEADLINE_RULES[key].kind === kind);
    expect(byKind('statutory_clock')).toEqual([
      'REGISTER_30BD',
      'UPDATE_15BD',
      'ISTIBDAL_10BD',
      'DISTRIBUTE_3M_FYE',
    ]);
    expect(byKind('pre_expiry_alert')).toEqual([
      'KYC_REFRESH',
      'LICENSE_RENEWAL',
      'CONTRACT_RENEWAL',
    ]);
    expect(byKind('as_dated')).toEqual(['HEARING']);
    expect(byKind('retention_floor')).toEqual(['RETENTION_10Y']);
  });

  it("rolls are §09's, per rule: file AFTER a trigger, renew BEFORE an expiry, a dated fact stands", () => {
    expect(DEADLINE_RULES.REGISTER_30BD.roll).toBe('following');
    expect(DEADLINE_RULES.UPDATE_15BD.roll).toBe('following');
    expect(DEADLINE_RULES.ISTIBDAL_10BD.roll).toBe('following');
    expect(DEADLINE_RULES.DISTRIBUTE_3M_FYE.roll).toBe('following');
    expect(DEADLINE_RULES.KYC_REFRESH.roll).toBe('preceding');
    expect(DEADLINE_RULES.LICENSE_RENEWAL.roll).toBe('none');
    expect(DEADLINE_RULES.CONTRACT_RENEWAL.roll).toBe('none');
    expect(DEADLINE_RULES.HEARING.roll).toBe('none');
  });

  it('zero-tolerance is exactly the registration/update clocks (§09; AML is zero-tolerance but not a clock)', () => {
    const zeroTolerance = DEADLINE_RULE_KEYS.filter((key) => DEADLINE_RULES[key].zeroTolerance);
    expect(zeroTolerance).toEqual(['REGISTER_30BD', 'UPDATE_15BD']);
  });

  it('names registered Setting keys — the four originals and the five S9-2 registrations', () => {
    // Registered + seeded since E1/E2 — if one of these goes red the registry lost a key.
    for (const key of [
      'deadline.REGISTER_30BD.businessDays',
      'deadline.UPDATE_15BD.businessDays',
      'deadline.ISTIBDAL_10BD.businessDays',
      'deadline.DISTRIBUTE_3M_FYE.months',
      'kyc.refreshIntervalMonths',
      'retention.minimumYears',
    ]) {
      expect(isSettingKey(key), `${key} should be a registered Setting key`).toBe(true);
    }
    // ⊕ S9-2 REGISTERED + SEEDED these three (with `deadline.preAlertOffsetsBd` and
    // `deadline.atRiskThresholdBd` beside them) — the tripwire below flipped exactly as designed
    // on the day the registration landed, and now pins the registered state.
    for (const key of [
      'deadline.DISTRIBUTE_3M_FYE.monthAnchor',
      'deadline.LICENSE_RENEWAL.preExpiryLeadBd',
      'deadline.CONTRACT_RENEWAL.preExpiryLeadBd',
      'deadline.preAlertOffsetsBd',
      'deadline.atRiskThresholdBd',
    ]) {
      expect(isSettingKey(key), `${key} should be a registered Setting key (S9-2)`).toBe(true);
    }
    // Descriptor names agree with the lists above (no third spelling anywhere).
    expect(DEADLINE_RULES.DISTRIBUTE_3M_FYE.monthAnchorSettingKey).toBe(
      'deadline.DISTRIBUTE_3M_FYE.monthAnchor',
    );
    expect(DEADLINE_RULES.LICENSE_RENEWAL.leadSettingKey).toBe(
      'deadline.LICENSE_RENEWAL.preExpiryLeadBd',
    );
    expect(DEADLINE_RULES.CONTRACT_RENEWAL.leadSettingKey).toBe(
      'deadline.CONTRACT_RENEWAL.preExpiryLeadBd',
    );
  });

  it('covers every deadlineRuleKey the obligation catalogue binds — computably or by NAMED refusal, never by silence', () => {
    const bound = new Set(
      OBLIGATION_LIBRARY.map((row) => row.deadlineRuleKey).filter(
        (key): key is string => key !== null,
      ),
    );
    expect(bound.size).toBeGreaterThan(0);
    for (const key of bound) {
      if (key === 'AML_IMMEDIATE') continue; // refused by name below — the §09 Engine-C reading
      expect(
        isDeadlineRuleKey(key),
        `catalogue binds '${key}' which the vocabulary does not know`,
      ).toBe(true);
    }
    // The catalogue does bind AML_IMMEDIATE today (GOV-AML-02) — if this stops being true,
    // the AML arm of computeRuleDeadline loses its live subject and this file should say so.
    expect(bound.has('AML_IMMEDIATE')).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · §09 worked example B2 — the pinned vector
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§09 B2: ISTIBDAL_10BD across a Fri/Sat weekend + a 2-day mid-window holiday', () => {
  const result = computeRuleDeadline({
    ruleKey: 'ISTIBDAL_10BD',
    anchor: '2026-05-10', // Sunday — istibdal completion (the trigger day, excluded)
    calendar,
    settings: { windowBusinessDays: env(10, 'business_days') },
  });

  it('lands on the 10th business day, 2026-05-26 — not the naïve 2026-05-20', () => {
    expect(result.computed.due.gregorian).toBe('2026-05-26');
    // Business-day windows land on a business day by construction: no roll happened.
    expect(result.computed.rawDue.gregorian).toBe('2026-05-26');
    expect(result.computed.rolled).toBe(false);
    expect(result.computed.basis).toBe('business_days');
    expect(result.computed.rollConvention).toBe('following');
  });

  it('the naïve "+10 calendar days" date is ITSELF one of the skipped holiday days', () => {
    expect(isBusinessDay('2026-05-20', calendar)).toBe(false);
    expect(isBusinessDay('2026-05-19', calendar)).toBe(false);
  });

  it('carries the frozen Umm al-Qura twin from the ONE conversion', () => {
    expect(result.computed.due.hijri).toBe(toHijri('2026-05-26'));
    expect(result.computed.from.hijri).toBe(toHijri('2026-05-10'));
  });

  it('carries the ⚠ unverified marker out of the envelope into the result (binding rule 3)', () => {
    expect(result.computed.unverifiedNote).not.toBeNull();
    expect(result.computed.unverifiedNote).toContain('unverified');
    expect(result.computed.unverifiedNote).toContain('primary law');
    expect(result.computed.window.settingKey).toBe('deadline.ISTIBDAL_10BD.businessDays');
  });

  it('echoes the rule identity: kind, anchor semantics, zero-tolerance flag', () => {
    expect(result.ruleKey).toBe('ISTIBDAL_10BD');
    expect(result.kind).toBe('statutory_clock');
    expect(result.zeroTolerance).toBe(false);
    expect(result.anchorSemantics).toContain('COMPLETION');
    expect(result.actionable).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The other computable rules
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the statutory clocks', () => {
  it('REGISTER_30BD uses the same arithmetic and is zero-tolerance', () => {
    const result = computeRuleDeadline({
      ruleKey: 'REGISTER_30BD',
      anchor: '2026-05-10',
      calendar,
      settings: { windowBusinessDays: env(30, 'business_days') },
    });
    // 30 business days from Sun 2026-05-10, skipping 2 holiday days + weekends.
    expect(result.computed.due.gregorian).toBe('2026-06-23');
    expect(result.zeroTolerance).toBe(true);
  });

  it('DISTRIBUTE_3M_FYE refuses without the CONFIGURED month anchor — the question of law has no default', () => {
    const error = expectDomainCode(
      () =>
        computeRuleDeadline({
          ruleKey: 'DISTRIBUTE_3M_FYE',
          anchor: '2026-09-30',
          calendar,
          settings: { windowMonths: env(3, 'months') },
        }),
      'SETTING_MISSING',
    );
    expect(error.message).toContain('deadline.DISTRIBUTE_3M_FYE.monthAnchor');
  });

  it("DISTRIBUTE_3M_FYE's two anchor readings differ on a real fiscal year end — the pin that keeps the question open", () => {
    const dayOfMonth = computeRuleDeadline({
      ruleKey: 'DISTRIBUTE_3M_FYE',
      anchor: '2026-09-30',
      calendar,
      settings: {
        windowMonths: env(3, 'months'),
        monthAnchor: env<'day_of_month' | 'end_of_month'>('day_of_month', null),
      },
    });
    const endOfMonth = computeRuleDeadline({
      ruleKey: 'DISTRIBUTE_3M_FYE',
      anchor: '2026-09-30',
      calendar,
      settings: {
        windowMonths: env(3, 'months'),
        monthAnchor: env<'day_of_month' | 'end_of_month'>('end_of_month', null),
      },
    });
    expect(dayOfMonth.computed.due.gregorian).toBe('2026-12-30');
    expect(endOfMonth.computed.due.gregorian).toBe('2026-12-31');
    expect(dayOfMonth.computed.due.gregorian).not.toBe(endOfMonth.computed.due.gregorian);
  });

  it('an unverified month ANCHOR marks the date unverified even under a verified window', () => {
    const result = computeRuleDeadline({
      ruleKey: 'DISTRIBUTE_3M_FYE',
      anchor: '2026-09-30',
      calendar,
      settings: {
        windowMonths: env(3, 'months', false),
        monthAnchor: env<'day_of_month' | 'end_of_month'>('day_of_month', null, true),
      },
    });
    expect(result.computed.unverifiedNote).not.toBeNull();
  });
});

describe('the pre-expiry rules', () => {
  it('KYC_REFRESH: anniversary of the last verification, rolled PRECEDING off a weekend', () => {
    const result = computeRuleDeadline({
      ruleKey: 'KYC_REFRESH',
      anchor: '2026-03-13', // last verification; +12 months = Sat 2027-03-13
      calendar,
      settings: { windowMonths: env(12, 'months') },
    });
    expect(result.computed.rawDue.gregorian).toBe('2027-03-13');
    expect(result.computed.due.gregorian).toBe('2027-03-11'); // Thursday — renew BEFORE, never after
    expect(result.computed.rolled).toBe(true);
    expect(result.computed.rollConvention).toBe('preceding');
    expect(result.actionable).toBeNull();
  });

  it('LICENSE_RENEWAL: the expiry IS the due date (a fact, roll none); the ACTIONABLE date is expiry − lead business days', () => {
    const result = computeRuleDeadline({
      ruleKey: 'LICENSE_RENEWAL',
      anchor: '2026-06-30', // Tuesday
      calendar,
      settings: { preExpiryLeadBd: env(10, 'business_days', false) },
    });
    expect(result.computed.due.gregorian).toBe('2026-06-30');
    expect(result.computed.rolled).toBe(false);
    // The expiry date is a recorded fact, not a regulatory figure — no ⚠ marker on the DATE.
    expect(result.computed.unverifiedNote).toBeNull();
    expect(result.actionable?.gregorian).toBe('2026-06-16'); // 10 business days earlier, Tuesday
    expect(result.actionable?.hijri).toBe(toHijri('2026-06-16'));
  });

  it('CONTRACT_RENEWAL behaves identically over its own Setting key', () => {
    const result = computeRuleDeadline({
      ruleKey: 'CONTRACT_RENEWAL',
      anchor: '2026-06-30',
      calendar,
      settings: { preExpiryLeadBd: env(5, 'business_days', false) },
    });
    expect(result.computed.due.gregorian).toBe('2026-06-30');
    expect(result.actionable?.gregorian).toBe('2026-06-23');
  });

  it('a negative or fractional lead refuses as SETTING_INVALID', () => {
    for (const bad of [-3, 2.5]) {
      expectDomainCode(
        () =>
          computeRuleDeadline({
            ruleKey: 'LICENSE_RENEWAL',
            anchor: '2026-06-30',
            calendar,
            settings: { preExpiryLeadBd: env(bad, 'business_days', false) },
          }),
        'SETTING_INVALID',
      );
    }
  });
});

describe('HEARING — as dated', () => {
  it('the entered date stands, even on a weekend — a court date does not roll', () => {
    const result = computeRuleDeadline({
      ruleKey: 'HEARING',
      anchor: '2026-06-27', // Saturday
      calendar,
      settings: {},
    });
    expect(result.computed.due.gregorian).toBe('2026-06-27');
    expect(result.computed.rolled).toBe(false);
    expect(result.computed.unverifiedNote).toBeNull();
    expect(result.actionable).toBeNull();
  });

  it('a lead supplied to a hearing refuses — the values came from the wrong rows', () => {
    expectDomainCode(
      () =>
        computeRuleDeadline({
          ruleKey: 'HEARING',
          anchor: '2026-06-27',
          calendar,
          settings: { preExpiryLeadBd: env(5, 'business_days', false) },
        }),
      'SETTING_INVALID',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The refusals — non-clocks and absent figures
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('non-clock refusals (DEADLINE_RULE_NOT_A_CLOCK, discriminated)', () => {
  it('RETENTION_10Y is a deletion floor, never a due date', () => {
    const error = expectDomainCode(
      () =>
        computeRuleDeadline({
          ruleKey: 'RETENTION_10Y',
          anchor: '2026-05-10',
          calendar,
          settings: {},
        }),
      'DEADLINE_RULE_NOT_A_CLOCK',
    );
    expect(error.details?.refusal).toBe('RETENTION_FLOOR_NOT_A_CLOCK');
    expect(error.message).toContain('retention.minimumYears');
  });

  it('AML_IMMEDIATE is a same-day event SLA — and a computed AML date would itself tip off (G-6)', () => {
    const error = expectDomainCode(
      () =>
        computeRuleDeadline({
          ruleKey: 'AML_IMMEDIATE',
          anchor: '2026-05-10',
          calendar,
          settings: {},
        }),
      'DEADLINE_RULE_NOT_A_CLOCK',
    );
    expect(error.details?.refusal).toBe('AML_IMMEDIATE_NOT_A_CLOCK');
    expect(error.message).toContain('no-tipping-off');
  });

  it("an unknown binding ('external', a typo) resolves to nothing, never to something plausible", () => {
    for (const bad of ['external', 'ISTIBDAL_10DB', '']) {
      const error = expectDomainCode(
        () => computeRuleDeadline({ ruleKey: bad, anchor: '2026-05-10', calendar, settings: {} }),
        'DEADLINE_RULE_NOT_A_CLOCK',
      );
      expect(error.details?.refusal).toBe('RULE_KEY_UNKNOWN');
    }
  });

  it('the discriminator vocabulary is closed and every refusal above is drawn from it', () => {
    expect([...NON_CLOCK_REFUSALS]).toEqual([
      'RETENTION_FLOOR_NOT_A_CLOCK',
      'AML_IMMEDIATE_NOT_A_CLOCK',
      'RULE_KEY_UNKNOWN',
    ]);
  });
});

describe('absent and mis-assembled figures', () => {
  it('a missing window refuses (SETTING_MISSING) and names the Setting row', () => {
    const error = expectDomainCode(
      () =>
        computeRuleDeadline({
          ruleKey: 'ISTIBDAL_10BD',
          anchor: '2026-05-10',
          calendar,
          settings: {},
        }),
      'SETTING_MISSING',
    );
    expect(error.message).toContain('deadline.ISTIBDAL_10BD.businessDays');
  });

  it('an extra figure refuses (SETTING_INVALID) — a month anchor on a business-day clock means wrong rows', () => {
    expectDomainCode(
      () =>
        computeRuleDeadline({
          ruleKey: 'ISTIBDAL_10BD',
          anchor: '2026-05-10',
          calendar,
          settings: {
            windowBusinessDays: env(10, 'business_days'),
            monthAnchor: env<'day_of_month' | 'end_of_month'>('day_of_month', null),
          },
        }),
      'SETTING_INVALID',
    );
  });
});
