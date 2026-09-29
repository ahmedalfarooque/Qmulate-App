/**
 * `distribution/timing.test.ts` — Stage 4: the post-fiscal-year-end distribution window.
 *
 * What this suite is FOR, so a later reader does not weaken it by accident:
 *
 * 1. **S3 decision D2 is a REGRESSION test, not a happy path.** The whole point of `EARLIER_OF` is
 *    that the Gregorian and Hijri windows land on different days, so a Gregorian-only reading can
 *    UNDER-report lateness. Every D2 test therefore asserts BOTH branches on ONE input — the same
 *    facts read as `ON_TIME` under `GREGORIAN` and `OVERDUE` under `EARLIER_OF` — because a
 *    regression to Gregorian-only would otherwise still pass a single-branch test.
 * 2. **The one-day divergence is real arithmetic, not a fixture.** `1448-10-22` is converted with
 *    `../dates`'s `fromHijri` — the ONE Umm al-Qura implementation — and the resulting `2027-03-30`
 *    is what the assertions compare against, so a change in the conversion tables fails here.
 * 3. **The month-end clamp is driven, not described.** A fiscal year ending 30 November is due
 *    28 February, not 2 March. The suite computes the deadline the way the CALLER must
 *    (`addCalendarMonths`), feeds it in, and asserts that a run on 1 March is OVERDUE — which
 *    overflow semantics would have called on time. Two days late with no symptom is the failure mode.
 * 4. **Every refusal is a typed `DomainError`.** A raw `RangeError` from the date engine escaping a
 *    pure module is an untyped failure mode; an unimplemented binding-calendar selector falling back
 *    to `GREGORIAN` would under-report lateness. Both are asserted.
 * 5. **OVERDUE never blocks.** Timing returns a run in every case; only a flag changes.
 */

import { describe, expect, it } from 'vitest';

import {
  addCalendarMonths,
  civilDate,
  formatHijriDate,
  fromHijri,
  parseHijriDate,
  toHijri,
  weekdayOf,
} from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import {
  BINDING_CALENDARS,
  DISBURSEMENT_SCHEDULES,
  parseDistributionInput,
  type BindingCalendar,
  type DeadlineInput,
  type DisbursementSchedule,
  type DistributionInput,
  type DistributionInputRaw,
  type RunFlag,
  type Timing,
} from '../contract.js';
import { deadlineBasisOf, evaluateTiming, resolveBindingDeadline } from '../timing.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

function expectDomainCode(run: () => unknown, code: string): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected a DomainError with code ${code}, got ${
        caught === undefined ? 'no throw' : String(caught)
      }`,
    );
  }
  expect(caught.code).toBe(code);
  return caught;
}

const UNVERIFIED_NOTE = '⚠ unverified — confirm vs primary law';
const POST_FYE_SETTING_KEY = 'deadline.DISTRIBUTE_3M_FYE.months';

/**
 * The §08 reference pair, verified against `../dates` rather than copied from prose:
 * FYE 2026-12-31 (= 1448-07-22 AH) + 3 months gives 2027-03-31 Gregorian and 1448-10-22 Hijri,
 * and 1448-10-22 IS 2027-03-30 — one day EARLIER than the Gregorian reading.
 */
const DEADLINE_GREGORIAN = '2027-03-31';
const DEADLINE_HIJRI = '1448-10-22';
/** The same value as the contract's `hijriDateSchema` produces, so the branded type matches. */
const DEADLINE_HIJRI_BRANDED = formatHijriDate(parseHijriDate(DEADLINE_HIJRI));

interface TimingParts {
  readonly asOfGregorian?: string;
  readonly deadlineGregorian?: string;
  readonly deadlineHijri?: string;
  readonly bindingCalendar?: BindingCalendar;
  readonly disbursementSchedule?: DisbursementSchedule | null;
  readonly unverified?: boolean;
  readonly months?: number;
  readonly settingKey?: string;
  readonly fiscalYearEnd?: string;
}

function rawFor(parts: TimingParts = {}): DistributionInputRaw {
  const asOfGregorian = parts.asOfGregorian ?? '2026-07-14';
  return {
    waqfId: 'waqf-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'ORDERED',
    continuationStipulation: null,
    // R7 · no مآل clause. Timing is orthogonal to the reversion, and this file keeps it that way.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: parts.fiscalYearEnd ?? '12-31',
    disbursementSchedule: parts.disbursementSchedule ?? null,
    revenue: {
      incomeMinor: 35_000_000n,
      receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [],
    // A true dual date, through the one Umm al-Qura implementation — `parseDistributionInput`
    // refuses a hand-written pair, which is how a second Hijri implementation would be caught.
    asOf: { gregorian: asOfGregorian, hijri: toHijri(civilDate(asOfGregorian)) },
    deadline: {
      gregorian: parts.deadlineGregorian ?? DEADLINE_GREGORIAN,
      hijri: parts.deadlineHijri ?? DEADLINE_HIJRI,
      settingKey: parts.settingKey ?? POST_FYE_SETTING_KEY,
      months: parts.months ?? 3,
      unverified: parts.unverified ?? true,
    },
    policy: {
      kycRefreshMonths: 12,
      roundingUnitMinor: 1n,
      roundingMethod: 'LARGEST_REMAINDER_HALF_UP',
      bindingCalendar: parts.bindingCalendar ?? 'EARLIER_OF',
      unverifiedNote: UNVERIFIED_NOTE,
    },
  };
}

function parsed(parts: TimingParts = {}): DistributionInput {
  return parseDistributionInput(rawFor(parts));
}

function timingOf(parts: TimingParts = {}): Timing {
  return evaluateTiming(parsed(parts)).timing;
}

/** A `DeadlineInput` for the unit-level `resolveBindingDeadline` tests. */
function deadlineInput(gregorian: string, hijri: string): DeadlineInput {
  return parsed({ deadlineGregorian: gregorian, deadlineHijri: hijri }).deadline;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Provenance: WHICH instrument set the due date
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('deadlineBasisOf', () => {
  it('a silent Shart falls back to the post-FYE default window', () => {
    expect(deadlineBasisOf(null)).toBe('POST_FYE_DEFAULT');
  });

  it('every stipulated schedule means the deed spoke (covers the whole vocabulary)', () => {
    for (const schedule of DISBURSEMENT_SCHEDULES) {
      expect(deadlineBasisOf(schedule)).toBe('SHART_SCHEDULE');
    }
  });

  it('is PROVENANCE only — it changes no date and no status', () => {
    const silent = timingOf({ disbursementSchedule: null });
    const stipulated = timingOf({ disbursementSchedule: 'QUARTERLY' });

    expect(silent.basis).toBe('POST_FYE_DEFAULT');
    expect(stipulated.basis).toBe('SHART_SCHEDULE');
    // The engine reads no calendar it was not handed: both deadlines are injected, so recording the
    // instrument cannot move the arithmetic.
    expect({ ...stipulated, basis: silent.basis }).toStrictEqual({ ...silent });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S3 decision D2 · which calendar binds
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveBindingDeadline — decision D2', () => {
  it('puts the Hijri deadline on the Gregorian axis with the ONE Umm al-Qura implementation', () => {
    // Not a hard-coded fixture: the expected value is derived from ../dates in the assertion itself.
    expect(fromHijri(DEADLINE_HIJRI)).toBe(civilDate('2027-03-30'));

    const resolved = resolveBindingDeadline({
      deadline: deadlineInput(DEADLINE_GREGORIAN, DEADLINE_HIJRI),
      bindingCalendar: 'EARLIER_OF',
    });
    expect(resolved.hijriDeadlineAsGregorian).toBe(fromHijri(DEADLINE_HIJRI));
  });

  it('EARLIER_OF binds on the HIJRI date when it is the earlier of the two', () => {
    const resolved = resolveBindingDeadline({
      deadline: deadlineInput(DEADLINE_GREGORIAN, DEADLINE_HIJRI),
      bindingCalendar: 'EARLIER_OF',
    });
    expect(resolved.boundBy).toBe('HIJRI');
    expect(resolved.bindingDeadlineGregorian).toBe(civilDate('2027-03-30'));
  });

  it('EARLIER_OF binds on the GREGORIAN date when THAT is the earlier of the two', () => {
    // 1448-10-23 is 2027-03-31, so a Gregorian deadline of 2027-03-25 is earlier.
    expect(fromHijri('1448-10-23')).toBe(civilDate('2027-03-31'));
    const resolved = resolveBindingDeadline({
      deadline: deadlineInput('2027-03-25', '1448-10-23'),
      bindingCalendar: 'EARLIER_OF',
    });
    expect(resolved.boundBy).toBe('GREGORIAN');
    expect(resolved.bindingDeadlineGregorian).toBe(civilDate('2027-03-25'));
  });

  it('EARLIER_OF resolves a TIE to GREGORIAN (same day; the Gregorian figure is on the filing)', () => {
    const resolved = resolveBindingDeadline({
      deadline: deadlineInput('2027-03-30', DEADLINE_HIJRI),
      bindingCalendar: 'EARLIER_OF',
    });
    expect(resolved.hijriDeadlineAsGregorian).toBe(resolved.bindingDeadlineGregorian);
    expect(resolved.boundBy).toBe('GREGORIAN');
  });

  it('GREGORIAN and HIJRI each bind their own date, and both still report the other', () => {
    const deadline = deadlineInput(DEADLINE_GREGORIAN, DEADLINE_HIJRI);

    const gregorian = resolveBindingDeadline({ deadline, bindingCalendar: 'GREGORIAN' });
    expect(gregorian.boundBy).toBe('GREGORIAN');
    expect(gregorian.bindingDeadlineGregorian).toBe(civilDate('2027-03-31'));
    expect(gregorian.hijriDeadlineAsGregorian).toBe(civilDate('2027-03-30'));

    const hijri = resolveBindingDeadline({ deadline, bindingCalendar: 'HIJRI' });
    expect(hijri.boundBy).toBe('HIJRI');
    expect(hijri.bindingDeadlineGregorian).toBe(civilDate('2027-03-30'));
  });

  it('covers every declared selector, so a new one cannot ship untested', () => {
    const deadline = deadlineInput(DEADLINE_GREGORIAN, DEADLINE_HIJRI);
    for (const bindingCalendar of BINDING_CALENDARS) {
      const resolved = resolveBindingDeadline({ deadline, bindingCalendar });
      expect(['GREGORIAN', 'HIJRI']).toContain(resolved.boundBy);
    }
  });

  it('REFUSES an unimplemented selector rather than falling back to GREGORIAN', () => {
    // A silent fallback would under-report lateness — the one direction D2 forbids.
    const error = expectDomainCode(
      () =>
        resolveBindingDeadline({
          deadline: deadlineInput(DEADLINE_GREGORIAN, DEADLINE_HIJRI),
          bindingCalendar: 'LATER_OF' as unknown as BindingCalendar,
        }),
      'SETTING_INVALID',
    );
    expect(error.message).toContain('LATER_OF');
  });

  it('converts a date-engine RangeError into a typed DomainError', () => {
    // Only reachable by bypassing `parseDistributionInput`. A raw RangeError escaping a pure module
    // is an untyped failure mode for a caller that switches on `DomainError.code`.
    const deadline = {
      ...deadlineInput(DEADLINE_GREGORIAN, DEADLINE_HIJRI),
      hijri: '1448-13-99' as DeadlineInput['hijri'],
    };
    const error = expectDomainCode(
      () => resolveBindingDeadline({ deadline, bindingCalendar: 'EARLIER_OF' }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('1448-13-99');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-13 · the D2 regression: the SAME facts, read two ways
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('evaluateTiming — AT-13, both branches on one input', () => {
  const AT13_ASOF = '2027-03-31';

  it('EARLIER_OF reports the run OVERDUE by one day', () => {
    const outcome = evaluateTiming(
      parsed({ asOfGregorian: AT13_ASOF, bindingCalendar: 'EARLIER_OF' }),
    );
    const { timing, flags } = outcome;

    expect(timing.hijriDeadlineAsGregorian).toBe(civilDate('2027-03-30'));
    expect(timing.boundBy).toBe('HIJRI');
    expect(timing.bindingDeadlineGregorian).toBe(civilDate('2027-03-30'));
    expect(timing.status).toBe('OVERDUE');
    expect(timing.daysUntilDeadline).toBe(-1);
    expect(flags).toContain<RunFlag>('TIMING_OVERDUE');

    // BOTH deadlines are present whichever one bound.
    expect(timing.deadlineGregorian).toBe(civilDate('2027-03-31'));
    expect(timing.deadlineHijri).toBe(DEADLINE_HIJRI_BRANDED);
  });

  it('GREGORIAN reports the SAME facts as ON TIME — this is the under-report D2 exists to stop', () => {
    const outcome = evaluateTiming(
      parsed({ asOfGregorian: AT13_ASOF, bindingCalendar: 'GREGORIAN' }),
    );
    const { timing, flags } = outcome;

    expect(timing.boundBy).toBe('GREGORIAN');
    expect(timing.bindingDeadlineGregorian).toBe(civilDate('2027-03-31'));
    expect(timing.status).toBe('ON_TIME');
    expect(timing.daysUntilDeadline).toBe(0);
    expect(flags).not.toContain<RunFlag>('TIMING_OVERDUE');

    // The Hijri deadline is STILL reported, so the divergence is visible on the record even when the
    // configured calendar ignored it.
    expect(timing.hijriDeadlineAsGregorian).toBe(civilDate('2027-03-30'));
  });

  it('HIJRI matches EARLIER_OF here, and the only difference is the recorded selector', () => {
    const earlier = timingOf({ asOfGregorian: AT13_ASOF, bindingCalendar: 'EARLIER_OF' });
    const hijri = timingOf({ asOfGregorian: AT13_ASOF, bindingCalendar: 'HIJRI' });
    expect(hijri.status).toBe('OVERDUE');
    expect({ ...hijri, bindingCalendar: earlier.bindingCalendar }).toStrictEqual({ ...earlier });
  });

  it('carries the ⚠ marker, and drops it only when the window is recorded as verified', () => {
    const unverified = evaluateTiming(parsed({ unverified: true }));
    expect(unverified.timing.unverifiedNote).toBe(UNVERIFIED_NOTE);
    expect(unverified.flags).toContain<RunFlag>('UNVERIFIED_FIGURES_APPLIED');

    const verified = evaluateTiming(parsed({ unverified: false }));
    expect(verified.timing.unverifiedNote).toBeNull();
    expect(verified.flags).not.toContain<RunFlag>('UNVERIFIED_FIGURES_APPLIED');
  });

  it('records the Setting row and window size that produced the due date', () => {
    const timing = timingOf({ settingKey: POST_FYE_SETTING_KEY, months: 3 });
    // Provenance travels with the answer: an operator reading a wrong due date can find the row.
    expect(timing.settingKey).toBe(POST_FYE_SETTING_KEY);
    expect(timing.months).toBe(3);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Example A · the reference timing block
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('evaluateTiming — Example A (asOf 2026-07-14, FYE 12-31)', () => {
  it('reports the full block, field by field', () => {
    const timing = timingOf();

    expect(timing).toStrictEqual<Timing>({
      status: 'ON_TIME',
      basis: 'POST_FYE_DEFAULT',
      deadlineGregorian: civilDate('2027-03-31'),
      deadlineHijri: DEADLINE_HIJRI_BRANDED,
      hijriDeadlineAsGregorian: civilDate('2027-03-30'),
      bindingCalendar: 'EARLIER_OF',
      boundBy: 'HIJRI',
      bindingDeadlineGregorian: civilDate('2027-03-30'),
      daysUntilDeadline: 259,
      asOf: { gregorian: civilDate('2026-07-14'), hijri: toHijri(civilDate('2026-07-14')) },
      settingKey: POST_FYE_SETTING_KEY,
      months: 3,
      unverifiedNote: UNVERIFIED_NOTE,
    });
  });

  it('has no undefined field and survives JSON (the result is persisted and hashed)', () => {
    const timing = timingOf();
    for (const [key, value] of Object.entries(timing)) {
      expect(value, `timing.${key}`).not.toBeUndefined();
    }
    expect(() => JSON.stringify(timing)).not.toThrow();
    expect(Object.isFrozen(timing)).toBe(true);
  });

  it("is deterministic and does not alias the caller's asOf object into the result", () => {
    const input = parsed();
    expect(evaluateTiming(input)).toStrictEqual(evaluateTiming(input));
    expect(evaluateTiming(input).timing.asOf).not.toBe(input.asOf);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The ON_TIME / OVERDUE boundary — inclusive, in both directions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('evaluateTiming — the deadline boundary', () => {
  it('asOf EXACTLY on the binding deadline is ON_TIME ("within 3 months" includes the last day)', () => {
    const timing = timingOf({ asOfGregorian: '2027-03-30' });
    expect(timing.bindingDeadlineGregorian).toBe(civilDate('2027-03-30'));
    expect(timing.daysUntilDeadline).toBe(0);
    expect(timing.status).toBe('ON_TIME');
  });

  it('one day past the binding deadline is OVERDUE', () => {
    const timing = timingOf({ asOfGregorian: '2027-03-31' });
    expect(timing.daysUntilDeadline).toBe(-1);
    expect(timing.status).toBe('OVERDUE');
  });

  it('one day before is ON_TIME with one day remaining', () => {
    const timing = timingOf({ asOfGregorian: '2027-03-29' });
    expect(timing.daysUntilDeadline).toBe(1);
    expect(timing.status).toBe('ON_TIME');
  });

  it('OVERDUE never blocks: the run still computes and is signable', () => {
    const outcome = evaluateTiming(parsed({ asOfGregorian: '2028-01-01' }));
    expect(outcome.timing.status).toBe('OVERDUE');
    expect(outcome.timing.daysUntilDeadline).toBeLessThan(-1);
    // A flag for the compliance dashboard — not a refusal, and not an exception.
    expect(outcome.flags).toStrictEqual<RunFlag[]>([
      'TIMING_OVERDUE',
      'UNVERIFIED_FIGURES_APPLIED',
    ]);
    expect(outcome.trace.length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Calendar months, month-end clamping, and NOT business days
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('evaluateTiming — the calendar-month edges', () => {
  it('a 30-November fiscal year end is due 28 February, and 1 March is OVERDUE', () => {
    // The clamp lives in ../dates. Overflow semantics would answer 2027-03-02 — two days late,
    // every year, with no symptom.
    const fye = civilDate('2026-11-30');
    const due = addCalendarMonths(fye, 3);
    expect(due).toBe(civilDate('2027-02-28'));

    // `bindingCalendar: 'GREGORIAN'` isolates the Gregorian clamp from the D2 selector.
    const onTheDay = timingOf({
      fiscalYearEnd: '11-30',
      deadlineGregorian: due,
      bindingCalendar: 'GREGORIAN',
      asOfGregorian: '2027-02-28',
    });
    expect(onTheDay.status).toBe('ON_TIME');
    expect(onTheDay.daysUntilDeadline).toBe(0);

    const dayAfter = timingOf({
      fiscalYearEnd: '11-30',
      deadlineGregorian: due,
      bindingCalendar: 'GREGORIAN',
      asOfGregorian: '2027-03-01',
    });
    expect(dayAfter.status).toBe('OVERDUE');
    expect(dayAfter.daysUntilDeadline).toBe(-1);
  });

  it('a 31-December fiscal year end is due 31 March (no clamp needed)', () => {
    expect(addCalendarMonths(civilDate('2026-12-31'), 3)).toBe(civilDate('2027-03-31'));
  });

  it('a 30-November fiscal year end clamps INTO a leap February', () => {
    expect(addCalendarMonths(civilDate('2027-11-30'), 3)).toBe(civilDate('2028-02-29'));
  });

  it('does NOT roll a deadline off the KSA weekend — this is not a business-day window', () => {
    // 2027-04-02 is a Friday (weekday 5) — a KSA weekend day. The 30/15/10 business-day statutory
    // filing deadlines belong to §09's engine; a calendar-month distribution window is not rolled.
    expect(weekdayOf(civilDate('2027-04-02'))).toBe(5);
    const timing = timingOf({
      deadlineGregorian: '2027-04-02',
      bindingCalendar: 'GREGORIAN',
      asOfGregorian: '2027-04-02',
    });
    expect(timing.bindingDeadlineGregorian).toBe(civilDate('2027-04-02'));
    expect(timing.status).toBe('ON_TIME');
  });

  it('a zero-month window means the fiscal year end itself is the deadline', () => {
    const timing = timingOf({
      months: 0,
      deadlineGregorian: '2026-12-31',
      deadlineHijri: '1448-07-22',
      bindingCalendar: 'GREGORIAN',
      asOfGregorian: '2027-01-01',
    });
    expect(fromHijri('1448-07-22')).toBe(civilDate('2026-12-31'));
    expect(timing.months).toBe(0);
    expect(timing.status).toBe('OVERDUE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The computation trace
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('evaluateTiming — the trace', () => {
  it('records the basis, both candidate deadlines, the selector, and the verdict', () => {
    const { trace } = evaluateTiming(parsed());

    expect(trace.map((step) => step.code)).toStrictEqual([
      'DEADLINE_BASIS',
      'DEADLINE_CANDIDATES',
      'BINDING_DEADLINE',
      'TIMING_STATUS',
    ]);
    expect(trace.every((step) => step.stage === 'TIMING')).toBe(true);

    const candidates = trace.find((step) => step.code === 'DEADLINE_CANDIDATES');
    expect(candidates?.data).toStrictEqual({
      deadlineGregorian: '2027-03-31',
      deadlineHijri: DEADLINE_HIJRI,
      hijriDeadlineAsGregorian: '2027-03-30',
    });

    const binding = trace.find((step) => step.code === 'BINDING_DEADLINE');
    expect(binding?.data).toStrictEqual({
      bindingCalendar: 'EARLIER_OF',
      boundBy: 'HIJRI',
      bindingDeadlineGregorian: '2027-03-30',
    });
  });

  it('keeps every trace datum a string, so the hashed trace survives JSON', () => {
    const { trace } = evaluateTiming(parsed({ asOfGregorian: '2027-03-31' }));
    for (const step of trace) {
      for (const [key, value] of Object.entries(step.data ?? {})) {
        expect(typeof value, `${step.code}.${key}`).toBe('string');
      }
    }
    expect(JSON.stringify(trace)).toContain('"daysUntilDeadline":"-1"');
  });

  it('names the Setting row and the window in the basis step when the Shart is silent', () => {
    const silent = evaluateTiming(parsed({ disbursementSchedule: null }));
    const basisStep = silent.trace.find((step) => step.code === 'DEADLINE_BASIS');
    expect(basisStep?.data).toStrictEqual({
      basis: 'POST_FYE_DEFAULT',
      disbursementSchedule: 'NONE',
      fiscalYearEnd: '12-31',
      settingKey: POST_FYE_SETTING_KEY,
      months: '3',
    });
    expect(basisStep?.message).toContain('unverified');

    const stipulated = evaluateTiming(parsed({ disbursementSchedule: 'ANNUAL' }));
    expect(
      stipulated.trace.find((step) => step.code === 'DEADLINE_BASIS')?.data?.disbursementSchedule,
    ).toBe('ANNUAL');
  });
});
