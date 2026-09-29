/**
 * `distribution/timing.ts` — Stage 4 of the distribution engine (PRD §08).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS STAGE DOES, AND WHAT IT DELIBERATELY DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * If the Shart al-Waqif stipulates a disbursement schedule, that schedule sets the due date. If the
 * Shart is silent, ghallah must be distributed within **3 months of fiscal-year-end**
 * (⚠ unverified — may be stale; confirm vs primary law, CLAUDE.md binding rule 3; the figure lives in
 * `Setting deadline.DISTRIBUTE_3M_FYE.months` and arrives on `deadline.months`).
 *
 * **Both deadline dates are INJECTED, not derived here.** Purity means the engine reads no calendar
 * it was not handed: the caller computes `deadlineGregorian` with `computeDeadline` and
 * `deadlineHijri` with the same one Umm al-Qura implementation, and passes both in. What this module
 * does is put them on ONE comparison axis (`fromHijri`), decide which of the two BINDS, and report
 * every part of that decision so a late run can be defended — or contested — years later.
 *
 * `deadlineBasisOf` therefore records PROVENANCE, not arithmetic: it says which instrument set the
 * date, and it changes no figure. It cannot do more, because `DisbursementSchedule`
 * (`ANNUAL | QUARTERLY | CUSTOM`) carries no dates — a `CUSTOM` schedule has no date payload in the
 * §08 input at all, so the engine has no way to check an injected deadline against the Shart's
 * actual stipulation. That gap is reported to the product owner, not papered over here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S3 DECISION D2 — THE BINDING DEADLINE IS THE EARLIER OF THE TWO CALENDARS, BY DEFAULT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `deadlineGregorian = FYE + N calendar months` and `deadlineHijri = Hijri(FYE) + N Hijri months`
 * are **two different days**, not one day in two calendars. For FYE 2026-12-31 with N = 3 they are
 * `2027-03-31` and `1448-10-22` — and `1448-10-22` is `2027-03-30`, one day EARLIER. A run submitted
 * on 2027-03-31 is on time by the Gregorian reading and one day late by the Hijri one.
 *
 * So: which calendar binds is a `Setting` (`distribution.deadline.bindingCalendar`,
 * `EARLIER_OF | GREGORIAN | HIJRI`) whose flagged default is `EARLIER_OF`, chosen so that lateness
 * can never be UNDER-reported — the direction that matters when the counterparty is the Authority.
 * `EARLIER_OF` resolves a tie to `GREGORIAN` (the two dates are the same day, so the label is the
 * only thing at stake, and the Gregorian figure is the one on the filing).
 *
 * **Both dates are ALWAYS reported**, alongside `boundBy` and `bindingDeadlineGregorian`, whichever
 * calendar was selected. A result that reported only the binding date would make a
 * `GREGORIAN`-configured run indistinguishable from an `EARLIER_OF` one that happened to land on the
 * Gregorian date, which is precisely the regression D2 exists to prevent.
 *
 * ⚠ The selector itself is unverified: whether Saudi law reads the 3-month window in the Hijri or the
 * Gregorian calendar (or either, at the Nazir's election) is a question for counsel. The engine
 * applies the configured answer and carries the ⚠ marker into the result.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CALENDAR MONTHS, NOT BUSINESS DAYS — AND THE MONTH-END CLAMP
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * This is a **calendar-month** span. It is NOT one of the 30/15/10 **business-day** statutory filing
 * deadlines (§09's deadline engine), so nothing here calls `addBusinessDays` and no holiday calendar
 * is needed. The month-end clamp that makes `2026-11-30 + 3 months = 2027-02-28` (not 2027-03-02)
 * lives in `../dates`'s `addCalendarMonths` and is exercised by this module's tests against injected
 * deadlines, because a two-day-late deadline with no symptom is the failure mode.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * OVERDUE NEVER BLOCKS, AND THE BOUNDARY IS INCLUSIVE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `OVERDUE` is a flag for the compliance dashboard, never a refusal: the run still computes, is
 * reviewable and is signable — a Nazir who is late still owes the family a statement. Only
 * `TIMING_OVERDUE` is added.
 *
 * `asOf` exactly ON the binding deadline is `ON_TIME` (`daysUntilDeadline === 0`): "within 3 months"
 * includes the last day. §08 does not state this, and the same inclusive convention is used for the
 * KYC-freshness boundary in Stage 3, so the two cannot disagree. Documented because an off-by-one
 * here is a wrongly-flagged (or wrongly-cleared) compliance breach.
 */

import {
  compareCivilDates,
  differenceInCalendarDays,
  fromHijri,
  type CivilDate,
} from '../dates/index.js';
import { DomainError } from '../errors.js';
import type {
  BindingCalendar,
  DeadlineBasis,
  DeadlineInput,
  DisbursementSchedule,
  DistributionInput,
  RunFlag,
  Timing,
  TraceStep,
} from './contract.js';

/**
 * Which INSTRUMENT set the due date.
 *
 * A stipulated schedule of any shape means the Shart spoke; `null` means it was silent and the
 * post-FYE default window applies. Note that `null` must be a RECORDED fact in the input, not an
 * inference from a missing field — which is why `disbursementSchedule` is non-optional in the
 * contract.
 */
export function deadlineBasisOf(schedule: DisbursementSchedule | null): DeadlineBasis {
  return schedule === null ? 'POST_FYE_DEFAULT' : 'SHART_SCHEDULE';
}

/** Which of the two injected deadlines binds, and both of them on one axis. */
export interface BindingDeadline {
  readonly boundBy: 'GREGORIAN' | 'HIJRI';
  readonly bindingDeadlineGregorian: CivilDate;
  /** `fromHijri(deadline.hijri)` — the Hijri deadline expressed on the Gregorian axis. */
  readonly hijriDeadlineAsGregorian: CivilDate;
}

/**
 * Put both injected deadlines on one axis and apply the configured selector (D2).
 *
 * The Hijri half is converted with `../dates`'s `fromHijri` — the ONE Umm al-Qura implementation —
 * so the comparison cannot be made against a second calendar. Unlike `asOf`, the two halves are
 * deliberately NOT cross-checked for agreement: they are different days on purpose.
 *
 * @throws `DISTRIBUTION_INPUT_INVALID` — the Hijri deadline is not a convertible Umm al-Qura date.
 *   Only reachable when a caller bypasses `parseDistributionInput` (which validates it) by casting;
 *   converted from `../dates`'s `RangeError` so no untyped third-party exception escapes the engine.
 * @throws `SETTING_INVALID` — the binding-calendar selector is not one the engine implements. Fails
 *   closed rather than defaulting: a silent fallback to `GREGORIAN` would under-report lateness,
 *   which is the exact direction D2 forbids.
 */
export function resolveBindingDeadline(args: {
  readonly deadline: DeadlineInput;
  readonly bindingCalendar: BindingCalendar;
}): BindingDeadline {
  const { deadline, bindingCalendar } = args;

  let hijriDeadlineAsGregorian: CivilDate;
  try {
    hijriDeadlineAsGregorian = fromHijri(deadline.hijri);
  } catch (error) {
    throw new DomainError(
      'DISTRIBUTION_INPUT_INVALID',
      `deadline.hijri "${deadline.hijri}" is not a convertible Umm al-Qura date, so the two deadlines cannot be placed on one comparison axis: ${error instanceof Error ? error.message : String(error)}`,
      { details: { deadlineHijri: deadline.hijri, settingKey: deadline.settingKey } },
    );
  }

  switch (bindingCalendar) {
    case 'EARLIER_OF': {
      // A tie resolves to GREGORIAN: the two are the same day, so only the label differs, and the
      // Gregorian figure is the one that appears on the filing.
      const hijriIsEarlier = compareCivilDates(hijriDeadlineAsGregorian, deadline.gregorian) < 0;
      return Object.freeze({
        boundBy: hijriIsEarlier ? ('HIJRI' as const) : ('GREGORIAN' as const),
        bindingDeadlineGregorian: hijriIsEarlier ? hijriDeadlineAsGregorian : deadline.gregorian,
        hijriDeadlineAsGregorian,
      });
    }
    case 'GREGORIAN':
      return Object.freeze({
        boundBy: 'GREGORIAN' as const,
        bindingDeadlineGregorian: deadline.gregorian,
        hijriDeadlineAsGregorian,
      });
    case 'HIJRI':
      return Object.freeze({
        boundBy: 'HIJRI' as const,
        bindingDeadlineGregorian: hijriDeadlineAsGregorian,
        hijriDeadlineAsGregorian,
      });
    default: {
      // Unreachable while BINDING_CALENDARS stays closed; kept so a new selector cannot
      // default-allow its way to the under-reporting branch.
      const unmapped: never = bindingCalendar;
      throw new DomainError(
        'SETTING_INVALID',
        `distribution.deadline.bindingCalendar is ${JSON.stringify(unmapped)}, which this engine does not implement. Refusing rather than falling back to GREGORIAN — a fallback would under-report lateness, and never over-report it.`,
        { details: { bindingCalendar: String(unmapped) } },
      );
    }
  }
}

/** What {@link evaluateTiming} produced. */
export interface TimingOutcome {
  readonly timing: Timing;
  readonly flags: readonly RunFlag[];
  readonly trace: readonly TraceStep[];
}

/**
 * Stage 4 · evaluate the distribution deadline against the injected `asOf`.
 *
 * Flags emitted by THIS stage, and only these two:
 *  · `TIMING_OVERDUE` — `asOf` is past the binding deadline. Never blocks the run.
 *  · `UNVERIFIED_FIGURES_APPLIED` — `deadline.unverified` is `true`, i.e. this run applied a window
 *    figure that has not been confirmed against primary Saudi law. Emitted from the one input that
 *    actually carries a verification signal; the engine may also add it from `unverifiedNotes`, and
 *    duplicate flags are the caller's to collapse.
 *
 * `unverifiedNote` echoes `policy.unverifiedNote` when the window is unverified, and is `null` only
 * when the figure has been confirmed. It is taken from the input rather than from a constant in this
 * package on purpose: `packages/domain` currently holds two different ⚠ markers (see the contract's
 * `policyInputSchema` note), and pinning one here would reject a caller carrying the other.
 */
export function evaluateTiming(input: DistributionInput): TimingOutcome {
  const basis = deadlineBasisOf(input.disbursementSchedule);
  const { boundBy, bindingDeadlineGregorian, hijriDeadlineAsGregorian } = resolveBindingDeadline({
    deadline: input.deadline,
    bindingCalendar: input.policy.bindingCalendar,
  });

  // (from, to): positive while the deadline is still ahead, negative once it has passed.
  const daysUntilDeadline = differenceInCalendarDays(
    input.asOf.gregorian,
    bindingDeadlineGregorian,
  );
  // Inclusive boundary: exactly on the deadline is ON_TIME. See the module header.
  const status = daysUntilDeadline < 0 ? 'OVERDUE' : 'ON_TIME';

  const flags: RunFlag[] = [];
  if (status === 'OVERDUE') flags.push('TIMING_OVERDUE');
  if (input.deadline.unverified) flags.push('UNVERIFIED_FIGURES_APPLIED');

  const timing: Timing = Object.freeze({
    status,
    basis,
    deadlineGregorian: input.deadline.gregorian,
    deadlineHijri: input.deadline.hijri,
    hijriDeadlineAsGregorian,
    bindingCalendar: input.policy.bindingCalendar,
    boundBy,
    bindingDeadlineGregorian,
    daysUntilDeadline,
    // Copied rather than aliased: the result is persisted and hashed, and must not change if the
    // caller mutates the input object afterwards.
    asOf: Object.freeze({ gregorian: input.asOf.gregorian, hijri: input.asOf.hijri }),
    settingKey: input.deadline.settingKey,
    months: input.deadline.months,
    unverifiedNote: input.deadline.unverified ? input.policy.unverifiedNote : null,
  });

  const steps: TraceStep[] = [
    {
      stage: 'TIMING',
      code: 'DEADLINE_BASIS',
      message:
        basis === 'SHART_SCHEDULE'
          ? 'The Shart stipulates a disbursement schedule; the due date comes from the deed.'
          : 'The Shart is silent on a schedule; the post-fiscal-year-end default window applies. ⚠ the window figure is unverified — confirm vs primary law.',
      data: {
        basis,
        disbursementSchedule: input.disbursementSchedule ?? 'NONE',
        fiscalYearEnd: input.fiscalYearEnd,
        settingKey: input.deadline.settingKey,
        months: String(input.deadline.months),
      },
    },
    {
      stage: 'TIMING',
      code: 'DEADLINE_CANDIDATES',
      message:
        'Both deadlines computed and reported: the Gregorian and Hijri windows land on different days.',
      data: {
        deadlineGregorian: input.deadline.gregorian,
        deadlineHijri: input.deadline.hijri,
        hijriDeadlineAsGregorian,
      },
    },
    {
      stage: 'TIMING',
      code: 'BINDING_DEADLINE',
      message:
        'Binding deadline selected per Setting distribution.deadline.bindingCalendar (S3 decision D2; EARLIER_OF so lateness is never under-reported).',
      data: { bindingCalendar: input.policy.bindingCalendar, boundBy, bindingDeadlineGregorian },
    },
    {
      stage: 'TIMING',
      code: 'TIMING_STATUS',
      message:
        'asOf compared against the binding deadline. OVERDUE flags the run for the compliance dashboard; it never blocks the computation.',
      data: {
        status,
        asOfGregorian: input.asOf.gregorian,
        asOfHijri: input.asOf.hijri,
        daysUntilDeadline: String(daysUntilDeadline),
      },
    },
  ];

  return Object.freeze({
    timing,
    flags: Object.freeze([...flags]),
    trace: Object.freeze(steps),
  });
}
