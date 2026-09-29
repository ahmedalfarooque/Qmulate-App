/**
 * `deadlines/escalation.ts` — §09 Engine B's DERIVED deadline state and escalation arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * STATE IS DERIVED, NEVER STORED AS TRUTH
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09: "State is derived, not stored as truth — the frozen due date is the source; a daily job
 * computes state and mirrors it onto the bound `ComplianceTask.status`." So this module exposes
 * PURE functions of `(facts, today)`:
 *
 *  - the frozen due date and the recorded facts (met / waived) come from the row;
 *  - `today` is a PARAMETER, never a clock read — a pure engine reads no clock it was not
 *    handed, and the daily evaluator (apps/worker, S9-3) is the one place that supplies "now";
 *  - the thresholds (pre-alert offsets, the at-risk threshold, the escalation ladder) are
 *    CONFIGURATION, resolved by the caller and validated here.
 *
 * Nothing here mutates anything; nothing here may be cached as durable (the same derivation on
 * the next day is the next day's answer — the `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` lesson,
 * one engine over).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE LADDER — WHAT §09 FIXES AND WHAT IS CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The escalation PATH is the operating model's and is fixed vocabulary here:
 * owner (Case Manager) → Nazir → Leadership (BR-1004). WHEN each rung engages (after how many
 * business days overdue) is an operating policy, so it arrives as a validated config parameter;
 * §09's only structural demand — zero-tolerance rules escalate on a FASTER ladder and cannot be
 * dismissed, only resolved — is the caller's to honour by selecting the right ladder for the
 * rule's `zeroTolerance` flag, and the flag travels on every computed rule deadline so the
 * selection is one field read, not a lookup.
 */

import { DomainError } from '../errors.js';
import {
  compareCivilDates,
  countBusinessDays,
  civilDate,
  type CivilDate,
  type HolidayCalendar,
} from '../dates/index.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Status vocabulary and derivation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** §09's deadline lifecycle: pending → due_soon → at_risk → overdue → met | waived. */
export const DEADLINE_STATUSES = [
  'pending',
  'due_soon',
  'at_risk',
  'overdue',
  'met',
  'waived',
] as const;

export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

export interface DeadlineStateInput {
  /** The evaluation instant — a parameter, never a clock read. */
  readonly today: CivilDate | string;
  /** The FROZEN due date (the stored, authoritative one — never recomputed here). */
  readonly due: CivilDate | string;
  readonly calendar: HolidayCalendar;
  /**
   * Pre-alert offsets in business days before due, e.g. `[30, 15, 7, 3, 1]`. Order-insensitive;
   * must be positive whole numbers, unique. The LARGEST is the `due_soon` horizon.
   */
  readonly preAlertOffsetsBd: readonly number[];
  /** The final at-risk threshold, in business days before due. Non-negative whole number. */
  readonly atRiskThresholdBd: number;
  /** The recorded satisfied-at fact, if any. */
  readonly metDate?: CivilDate | string | null | undefined;
  /** The recorded waiver fact, if any. */
  readonly waived?: boolean | undefined;
}

export interface DerivedDeadlineState {
  readonly status: DeadlineStatus;
  /**
   * Business days from `today` to `due` in the direction of travel — positive before due,
   * `0` on the day, NEGATIVE once overdue (how many business days late).
   */
  readonly businessDaysRemaining: number;
  /** Pre-alert offsets whose reminder fires exactly today (see {@link preAlertsFiringOn}). */
  readonly preAlertsFiringToday: readonly number[];
}

function incoherent(reason: string, details: Record<string, unknown>): never {
  throw new DomainError('DEADLINE_STATE_INCOHERENT', reason, { details });
}

function validateOffsets(offsets: readonly number[]): void {
  for (const offset of offsets) {
    if (!Number.isInteger(offset) || offset <= 0) {
      incoherent(
        `pre-alert offsets must be positive whole business-day counts (received ${String(offset)}). ` +
          'A zero or negative offset is not an earlier reminder — it is a reminder after the due date.',
        { offset },
      );
    }
  }
  if (new Set(offsets).size !== offsets.length) {
    incoherent(
      'pre-alert offsets must be unique — a duplicated offset double-fires one reminder.',
      {
        offsets: [...offsets],
      },
    );
  }
}

/**
 * Derive a deadline's state at `today`.
 *
 * Precedence, in order and exclusive:
 *  1. `met` / `waived` — recorded facts win over any date arithmetic (a met deadline that the
 *     calendar says is overdue was met late, and the LATENESS is the mirror's business, not the
 *     status's). Both at once is a contradiction and refuses.
 *  2. `overdue` — today is strictly past the due date on the civil axis.
 *  3. `at_risk` — within the final threshold (inclusive; due today = at risk).
 *  4. `due_soon` — within the largest pre-alert offset (inclusive).
 *  5. `pending`.
 *
 * @throws `DEADLINE_STATE_INCOHERENT` — met AND waived, or malformed thresholds.
 */
export function deriveDeadlineState(input: DeadlineStateInput): DerivedDeadlineState {
  const today = civilDate(input.today);
  const due = civilDate(input.due);
  validateOffsets(input.preAlertOffsetsBd);
  if (!Number.isInteger(input.atRiskThresholdBd) || input.atRiskThresholdBd < 0) {
    incoherent(
      `the at-risk threshold must be a non-negative whole business-day count (received ${String(input.atRiskThresholdBd)}).`,
      { atRiskThresholdBd: input.atRiskThresholdBd },
    );
  }

  const met = input.metDate !== undefined && input.metDate !== null;
  const waived = input.waived === true;
  if (met && waived) {
    incoherent(
      'a deadline cannot be both met and waived — one fact excuses the duty, the other satisfies ' +
        'it, and ranking them here would decide which record to disbelieve.',
      { metDate: String(input.metDate), waived },
    );
  }

  const rawRemaining = countBusinessDays(today, due, input.calendar);
  // The backward walk can produce IEEE -0 (zero business days, negative direction); normalise so
  // consumers comparing with Object.is (vitest's toBe, Map keys) never see two zeros.
  const businessDaysRemaining = rawRemaining === 0 ? 0 : rawRemaining;
  const preAlertsFiringToday = met || waived ? [] : preAlertsFiringOn(input);

  let status: DeadlineStatus;
  if (met) {
    status = 'met';
  } else if (waived) {
    status = 'waived';
  } else if (compareCivilDates(today, due) > 0) {
    status = 'overdue';
  } else if (businessDaysRemaining <= input.atRiskThresholdBd) {
    status = 'at_risk';
  } else if (
    input.preAlertOffsetsBd.length > 0 &&
    businessDaysRemaining <= Math.max(...input.preAlertOffsetsBd)
  ) {
    status = 'due_soon';
  } else {
    status = 'pending';
  }

  return Object.freeze({
    status,
    businessDaysRemaining,
    preAlertsFiringToday: Object.freeze(preAlertsFiringToday),
  });
}

/**
 * Which pre-alert offsets fire exactly at `today` — i.e. `today` is exactly `offset` business
 * days before the due date. The daily evaluator uses this to emit each reminder ONCE, on its own
 * day, without storing reminder state (idempotence comes from the derivation, not from a flag).
 */
export function preAlertsFiringOn(
  input: Pick<DeadlineStateInput, 'today' | 'due' | 'calendar' | 'preAlertOffsetsBd'>,
): readonly number[] {
  validateOffsets(input.preAlertOffsetsBd);
  const remaining = countBusinessDays(civilDate(input.today), civilDate(input.due), input.calendar);
  if (remaining <= 0) return [];
  return input.preAlertOffsetsBd.filter((offset) => offset === remaining);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The escalation ladder
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The operating-model escalation path, in order (BR-1004). Fixed vocabulary, not configuration. */
export const ESCALATION_LEVELS = ['case_manager', 'nazir', 'leadership'] as const;

export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

/**
 * When each rung engages: after how many business days OVERDUE (0 = the first business day past
 * due). Rungs must cover the three levels in path order with non-decreasing thresholds — a ladder
 * that escalates to leadership before the Nazir is a mis-assembled config, not a policy.
 */
export interface EscalationLadder {
  readonly case_manager: number;
  readonly nazir: number;
  readonly leadership: number;
}

function validateLadder(ladder: EscalationLadder): void {
  let previous = -1;
  for (const level of ESCALATION_LEVELS) {
    const threshold = ladder[level];
    if (!Number.isInteger(threshold) || threshold < 0) {
      incoherent(
        `escalation threshold for '${level}' must be a non-negative whole business-day count ` +
          `(received ${String(threshold)}).`,
        { level, threshold },
      );
    }
    if (threshold < previous) {
      incoherent(
        `escalation thresholds must be non-decreasing along the path ` +
          `(${ESCALATION_LEVELS.join(' → ')}); '${level}' engages at ${String(threshold)} which is ` +
          'before the previous rung.',
        { ladder: { ...ladder } },
      );
    }
    previous = threshold;
  }
}

/**
 * The highest rung engaged for a DERIVED state, or `null` when none is.
 *
 * Takes the whole {@link DerivedDeadlineState} rather than a bare day count, deliberately: only an
 * `overdue` deadline escalates, and taking the state makes "due today but not yet overdue" (a
 * remaining count of 0 with status `at_risk`) unrepresentable as an escalation input — with a bare
 * number that case and "0 business days late" would be the same argument.
 *
 * Days-overdue is `max(0, -businessDaysRemaining)`, on the SAME axis as the remaining count
 * ("due tomorrow" = 1 remaining ⇒ "due yesterday" = 1 late, the due day itself counting on the
 * walk back). A weekend-dated deadline asked on the next weekend day is late with 0 business days
 * elapsed, and a rung with threshold 0 engages there — being late is the fact; the elapsed count
 * only paces the LATER rungs.
 */
export function deriveEscalationLevel(args: {
  readonly state: DerivedDeadlineState;
  readonly ladder: EscalationLadder;
}): EscalationLevel | null {
  validateLadder(args.ladder);
  if (args.state.status !== 'overdue') return null;
  const businessDaysOverdue = Math.max(0, -args.state.businessDaysRemaining);

  let engaged: EscalationLevel | null = null;
  for (const level of ESCALATION_LEVELS) {
    if (businessDaysOverdue >= args.ladder[level]) engaged = level;
  }
  return engaged;
}
