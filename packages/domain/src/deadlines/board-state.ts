/**
 * `deadlines/board-state.ts` — ONE deadline row's state as the compliance board renders it. **S11 · 2b.**
 *
 * ── WHY THIS IS ITS OWN PURE FUNCTION ───────────────────────────────────────────────────────────
 * `deadline.board` (api, S11 · 2a) derived each row's state inline, and one branch of that inline code —
 * "the calendar or the settings could not be assembled, so the row is `cannot_compute` and carries the
 * refusal code" — was UNREACHABLE on the fixture: the seeded calendar always assembles. Mutation M2 of
 * item 2a survived because of it: a version that returned `pending` there passed every suite. A branch no
 * fixture can reach is tested by pulling it into a function whose inputs a unit test can set to `null`,
 * which is what this file is. The api now calls {@link deriveBoardState}; the only logic left inline is
 * the query.
 *
 * ── THE STATE VOCABULARY, CLOSED ───────────────────────────────────────────────────────────────
 * {@link BOARD_STATES} is §09's lifecycle ({@link DEADLINE_STATUSES}) plus ONE board-only member,
 * `cannot_compute`: the row exists, its due date is frozen, and TODAY the engine cannot say where it stands
 * — a refusal, never a guess. It is listed literally (not spread) so the i18n parity audit can parse the
 * members off this declaration; a test pins it against `DEADLINE_STATUSES` so the two cannot drift.
 *
 * {@link BOARD_CAUSES} is the closed vocabulary for "this rule has NO row, and here is why". The board
 * renders every one as its own sentence in both locales, because four of them are different kinds of
 * absence that a bare empty cell would collapse into one:
 *  · `NOT_RECORDED` — the clock-start fact is not on the record (an owner act is owed);
 *  · `RECORDED_NOT_COMPUTABLE` — recorded, but the calendar cannot span it (S11-1's G-5 bound);
 *  · `ROUTED_NO_HOME` — the rule is routed to a model that does not exist yet (LICENSE_RENEWAL);
 *  · `NOT_COMPUTED` — the inputs exist and nothing has computed the row (a maker act is owed);
 *  · `NOT_IN_SCOPE_YET` — nothing is due yet (a valid certificate outside the sweep's lead): HEALTHY;
 *  · `NO_SUBJECT` — the rule has nothing to attach to (no pending istibdal): HEALTHY.
 *
 * ⚠ Binding rule 3: every window behind a `due` here is unverified against primary law. This module
 * carries no number; it reads the frozen due date and the caller's calendar and thresholds.
 */

import { DomainError } from '../errors.js';
import { type CivilDate, type HolidayCalendar } from '../dates/index.js';
import { DEADLINE_STATUSES, deriveDeadlineState, type DeadlineStatus } from './escalation.js';

/** The lifecycle (§09) plus the board-only `cannot_compute`. Listed literally — see the header. */
export const BOARD_STATES = [
  'pending',
  'due_soon',
  'at_risk',
  'overdue',
  'met',
  'waived',
  'cannot_compute',
] as const;
export type BoardState = (typeof BOARD_STATES)[number];

/** Why a rule has NO row — six kinds of absence, each its own sentence on the board. */
export const BOARD_CAUSES = [
  'NOT_RECORDED',
  'RECORDED_NOT_COMPUTABLE',
  'ROUTED_NO_HOME',
  'NOT_COMPUTED',
  'NOT_IN_SCOPE_YET',
  'NO_SUBJECT',
] as const;
export type BoardCause = (typeof BOARD_CAUSES)[number];

/** The two causes that mean "nothing is owed today" — the board may colour them healthy. */
export const HEALTHY_BOARD_CAUSES: ReadonlySet<BoardCause> = new Set([
  'NOT_IN_SCOPE_YET',
  'NO_SUBJECT',
]);

export interface BoardStateInput {
  /** The evaluation day — a parameter, never a clock read. */
  readonly today: CivilDate | string;
  /** The row's FROZEN due date. */
  readonly due: CivilDate | string;
  /** The recorded discharge fact, if any (any non-null value means MET). */
  readonly satisfiedAt: unknown;
  /** The recorded waiver fact, if any. */
  readonly waivedAt: unknown;
  /** `null` when the calendar could not be assembled — the row is then `cannot_compute`. */
  readonly calendar: HolidayCalendar | null;
  /** `null` when the thresholds could not be resolved — the row is then `cannot_compute`. */
  readonly config: {
    readonly preAlertOffsetsBd: readonly number[];
    readonly atRiskThresholdBd: number;
  } | null;
  /** The refusal code that made `calendar` or `config` null, carried onto the row. */
  readonly cannotComputeBecause: string | null;
}

export interface DerivedBoardState {
  readonly state: BoardState;
  /** Positive before due, negative after, `null` when the state is not computable or the row is closed. */
  readonly businessDaysRemaining: number | null;
  /** The refusal code when `state === 'cannot_compute'`, else `null`. */
  readonly cannotCompute: string | null;
}

/**
 * One row's state. Closed rows (met · waived) are read from their recorded facts and never computed;
 * open rows are derived through {@link deriveDeadlineState} when the calendar and thresholds exist, and
 * are `cannot_compute` — carrying the refusal — when they do not, or when the derivation itself refuses
 * (a due date outside the calendar's coverage). No branch returns `pending` for want of an input.
 */
export function deriveBoardState(input: BoardStateInput): DerivedBoardState {
  if (input.satisfiedAt !== null && input.satisfiedAt !== undefined) {
    return { state: 'met', businessDaysRemaining: null, cannotCompute: null };
  }
  if (input.waivedAt !== null && input.waivedAt !== undefined) {
    return { state: 'waived', businessDaysRemaining: null, cannotCompute: null };
  }
  if (input.calendar === null || input.config === null) {
    return {
      state: 'cannot_compute',
      businessDaysRemaining: null,
      cannotCompute: input.cannotComputeBecause ?? 'BOARD_INPUTS_MISSING',
    };
  }
  try {
    const derived = deriveDeadlineState({
      today: input.today,
      due: input.due,
      calendar: input.calendar,
      preAlertOffsetsBd: input.config.preAlertOffsetsBd,
      atRiskThresholdBd: input.config.atRiskThresholdBd,
      metDate: null,
      waived: false,
    });
    return {
      state: derived.status,
      businessDaysRemaining: derived.businessDaysRemaining,
      cannotCompute: null,
    };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { state: 'cannot_compute', businessDaysRemaining: null, cannotCompute: error.code };
  }
}

/** `true` iff `state` is a lifecycle status (§09) rather than the board-only refusal. */
export function isLifecycleStatus(state: BoardState): state is DeadlineStatus {
  return (DEADLINE_STATUSES as readonly string[]).includes(state);
}
