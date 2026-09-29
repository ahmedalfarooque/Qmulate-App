/**
 * `deadlines/evaluator.ts` — §09's DAILY EVALUATOR, as a pure plan.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT §09 ASKS OF THE DAILY JOB, CLAUSE BY CLAUSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * > **Daily evaluator** (`apps/worker`, pg-boss, Railway Cron, ~06:00 Asia/Riyadh): recomputes
 * > state for all open deadlines, fires reminders at each configured pre-alert offset, and
 * > escalates per the operating-model path — **owner (Case Manager) → Nazir → Leadership**. Each
 * > escalation writes an `EscalationEvent` + audit entry.
 * >
 * > **Zero-tolerance deadlines** (registration/updates `GOV-REG-01/02`, AML `GOV-AML-02`) escalate
 * > on a faster ladder and **cannot be dismissed, only resolved**.
 * >
 * > The job **never mutates the frozen due date** — it computes state and emits notifications only.
 *
 * S9-1 already built every piece of arithmetic this needs (`deriveDeadlineState`,
 * `preAlertsFiringOn`, `deriveEscalationLevel`) and left exactly two things to the caller, in its
 * own words: *"selecting the right ladder for the rule's `zeroTolerance` flag"*, and supplying
 * `today`. This module is those two things plus the plan the writer then executes — and it stays
 * **pure**: no clock, no database, no queue. `today` is a parameter, so the same row asked on two
 * days gives two answers and a vector can pin either.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE THIS MODULE REFUSES TO GUESS: THE `ComplianceTask.status` MIRROR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09 says the job *"computes state and mirrors it onto the bound `ComplianceTask.status`"*, and
 * the two vocabularies are **not** a bijection:
 *
 *   deadline state  →  pending · due_soon · at_risk · overdue · met · waived   (6)
 *   task status     →  NOT_STARTED · IN_PROGRESS · COMPLETED · RETIRED · NOT_APPLICABLE   (5)
 *
 * So a total mirror has to invent something, and there are two places it would invent:
 *
 *  1. **The four OPEN states carry no status fact.** `pending`, `due_soon`, `at_risk` and `overdue`
 *     are all "the duty is open and not yet discharged". Whether a human has STARTED the work —
 *     `NOT_STARTED` vs `IN_PROGRESS` — is a fact about a person, and a cron job that wrote
 *     `IN_PROGRESS` because a date approached would be fabricating activity. Worse, it would
 *     OVERWRITE a case manager's own `IN_PROGRESS` back and forth every night. So these four mirror
 *     to **nothing**, deliberately, and the deadline's own derived state remains the thing screens
 *     read for urgency.
 *  2. **`waived` has no honest target.** `NOT_APPLICABLE` means *this duty never applied to this
 *     endowment* — a classification-gate fact. A waiver means *it applied, and the breach was
 *     excused.* Collapsing them would make an excused statutory breach indistinguishable, in the
 *     register and in every report built from it, from a duty that was never owed. That is a
 *     product decision about what a compliance register asserts, so it is **ROUTED**, not resolved
 *     here (`MIRROR_UNDECIDED_WAIVED`, an owner-queue item).
 *
 * `met` → `COMPLETED` is the one mapping that carries no invention, and it is the only one made.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * AND THE THING THIS MODULE DOES NOT DO AT ALL: DECIDE WHETHER A SIGNAL MAY LEAVE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A plan entry says *what would be emitted*. Whether it MAY be emitted is `mayDispatch`'s single
 * question (`compliance/disclosure.ts`), asked by the writer with the SUBJECT ROW's classification
 * — never with a value this module derived. §09 rule 1 singles out the escalation pipeline, and
 * `ABSENT_OUTBOUND_PATHS`' own words for it are exact: *"an overdue GOV-AML-02 obligation
 * escalating to Leadership is a tip-off delivered by a cron job."* Putting the dispatch decision in
 * here would let a caller build the plan and skip the question; leaving it out means the writer
 * cannot emit anything without asking.
 */

import { DomainError } from '../errors.js';
import { type CivilDate, type HolidayCalendar } from '../dates/index.js';

import {
  ESCALATION_LEVELS,
  deriveDeadlineState,
  deriveEscalationLevel,
  preAlertsFiringOn,
  type DeadlineStatus,
  type DerivedDeadlineState,
  type EscalationLadder,
  type EscalationLevel,
} from './escalation.js';
import { type DeadlineRuleKey } from './rules.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Refusal vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Closed discriminators for `DEADLINE_STATE_INCOHERENT` raised from the evaluator
 * (`details.refusal`) — the one-code-many-conditions shape, again.
 */
export const EVALUATOR_REFUSALS = [
  /**
   * The zero-tolerance ladder engages LATER than the ordinary one at some rung. §09's structural
   * demand is that zero-tolerance rules escalate on a **faster** ladder; a pair where the
   * zero-tolerance rung is slower is a mis-assembled config that would make the strictest duties
   * the slowest to escalate — silently, and in exactly the direction nobody would check.
   */
  'ZERO_TOLERANCE_LADDER_NOT_FASTER',
  /**
   * A ladder Setting tuple is not the three thresholds `ESCALATION_LEVELS` demands. ⚠ ITS OWN CODE,
   * not folded into the not-faster one: a short tuple is a malformed CONFIG (somebody edited a row),
   * a not-faster pair is a coherent config expressing a policy §09 forbids. Same refusal, different
   * remedy — and this file's first draft did reuse the wrong code, which would have sent a reader
   * looking for a policy problem when the row was simply truncated.
   */
  'LADDER_TUPLE_MALFORMED',
  /**
   * A deadline was handed to the evaluator with both a satisfied and a waived fact. The deriver
   * already refuses this; named here so the plan cannot report the row as skipped-for-some-reason.
   */
  'DEADLINE_FACTS_CONTRADICT',
  /** Two entries in one batch claim the same deadline id — one row cannot have two plans. */
  'DUPLICATE_DEADLINE_IN_BATCH',
] as const;

export type EvaluatorRefusal = (typeof EVALUATOR_REFUSALS)[number];

function refuse(
  refusal: EvaluatorRefusal,
  reason: string,
  extra: Readonly<Record<string, unknown>> = {},
): never {
  throw new DomainError('DEADLINE_STATE_INCOHERENT', reason, { details: { refusal, ...extra } });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The ladder selection — §09's "faster ladder", asserted rather than trusted
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Read a `deadline.escalationLadder*Bd` Setting tuple into an {@link EscalationLadder}.
 *
 * ⚠ THE ONE PLACE THE POSITIONAL CONVENTION IS INTERPRETED. The Setting holds
 * `[case_manager, nazir, leadership]` — a flat array because the seed's value union deliberately
 * admits no objects, and widening it for one config's convenience would loosen a narrow contract for
 * every future key. The order is unambiguous because `ESCALATION_LEVELS` is fixed vocabulary; this
 * function is what stops each caller re-deciding which index is which.
 *
 * @throws `DEADLINE_STATE_INCOHERENT` — wrong length (a two-rung ladder silently dropping
 *         Leadership is exactly the shape that must not be tolerated).
 */
export function ladderFromTuple(tuple: readonly number[]): EscalationLadder {
  if (tuple.length !== ESCALATION_LEVELS.length) {
    refuse(
      'LADDER_TUPLE_MALFORMED',
      `an escalation ladder must carry exactly ${String(ESCALATION_LEVELS.length)} thresholds, in ` +
        `the order ${ESCALATION_LEVELS.join(' → ')} (received ${String(tuple.length)}). A short ` +
        'tuple would silently drop a rung — most likely Leadership, the one that matters most.',
      { received: tuple.length, expected: ESCALATION_LEVELS.length },
    );
  }
  return Object.freeze({
    case_manager: tuple[0] as number,
    nazir: tuple[1] as number,
    leadership: tuple[2] as number,
  });
}

export interface LadderPair {
  /** The ordinary operating-model ladder. */
  readonly ordinary: EscalationLadder;
  /**
   * The ladder for zero-tolerance rules. §09 does not give figures, so both are configuration —
   * but the RELATION between them is structural and is checked: not slower at any rung.
   */
  readonly zeroTolerance: EscalationLadder;
}

/**
 * Pick the ladder for a rule, and REFUSE a pair that contradicts §09's "faster" requirement.
 *
 * The check is *not slower at any rung*, not *strictly faster at every rung*: a policy may
 * legitimately engage the Case Manager at the same threshold for both classes and then diverge
 * later, and demanding strictness everywhere would refuse a reasonable configuration. What it
 * refuses is the direction that cannot be intended.
 *
 * @throws `DEADLINE_STATE_INCOHERENT` (`ZERO_TOLERANCE_LADDER_NOT_FASTER`).
 */
export function selectEscalationLadder(args: {
  readonly zeroTolerance: boolean;
  readonly ladders: LadderPair;
}): EscalationLadder {
  const { ordinary, zeroTolerance: fast } = args.ladders;
  for (const level of ESCALATION_LEVELS) {
    if (fast[level] > ordinary[level]) {
      refuse(
        'ZERO_TOLERANCE_LADDER_NOT_FASTER',
        `the zero-tolerance escalation ladder engages '${level}' at ${String(fast[level])} ` +
          `business days overdue, LATER than the ordinary ladder's ${String(ordinary[level])}. ` +
          '§09 requires zero-tolerance rules to escalate on a FASTER ladder — a pair configured ' +
          'this way makes the strictest statutory duties the slowest to reach anyone, which is ' +
          'not a policy anybody chose.',
        { level, zeroTolerance: fast[level], ordinary: ordinary[level] },
      );
    }
  }
  return args.zeroTolerance ? fast : ordinary;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The `ComplianceTask.status` mirror — total, and honest about its two gaps
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Why a derived state does not mirror onto a task status. */
export const MIRROR_ABSTENTIONS = [
  /**
   * `pending` / `due_soon` / `at_risk` / `overdue` — all "open and not discharged". Whether a human
   * has begun the work is a fact about a person; a cron writing `IN_PROGRESS` because a date
   * approached fabricates activity and overwrites a case manager's own answer nightly.
   */
  'MIRROR_NOT_A_STATUS_FACT',
  /**
   * `waived` — ⚠ AN OWNER-QUEUE ITEM, not a defect. `NOT_APPLICABLE` means the duty never applied;
   * a waiver means it applied and the breach was excused. One target for both would make an
   * excused statutory breach indistinguishable from a duty never owed, in the register and in every
   * report built from it.
   */
  'MIRROR_UNDECIDED_WAIVED',
] as const;

export type MirrorAbstention = (typeof MIRROR_ABSTENTIONS)[number];

/** `schema.prisma`'s `ComplianceTaskStatus`, restated and pinned by a test (the usual reason). */
export const TASK_STATUSES_FOR_MIRROR = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'RETIRED',
  'NOT_APPLICABLE',
] as const;

export type MirrorTaskStatus = (typeof TASK_STATUSES_FOR_MIRROR)[number];

export type StatusMirror =
  | { readonly mirror: MirrorTaskStatus; readonly abstention: null }
  | { readonly mirror: null; readonly abstention: MirrorAbstention };

/**
 * §09's mirror, TOTAL over the six deadline states — and returning `null` twice, on purpose.
 *
 * Exactly one mapping carries no invention (`met` → `COMPLETED`) and it is the only one made. The
 * function is total so that a seventh deadline state could not arrive and fall through to a
 * plausible default; a test asserts every state is covered and that the abstentions are these two.
 */
export function mirrorTaskStatus(status: DeadlineStatus): StatusMirror {
  switch (status) {
    case 'met':
      return Object.freeze({ mirror: 'COMPLETED' as const, abstention: null });
    case 'waived':
      return Object.freeze({ mirror: null, abstention: 'MIRROR_UNDECIDED_WAIVED' as const });
    case 'pending':
    case 'due_soon':
    case 'at_risk':
    case 'overdue':
      return Object.freeze({ mirror: null, abstention: 'MIRROR_NOT_A_STATUS_FACT' as const });
    default: {
      // Unreachable while `DeadlineStatus` is the closed six; kept so a new member cannot
      // default-allow. The exhaustiveness is what makes that true rather than hoped.
      const never: never = status;
      return never;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The plan
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** One open deadline, as the evaluator needs to see it. Every field is a stored fact. */
export interface EvaluatedDeadlineFacts {
  readonly deadlineId: string;
  readonly waqfId: string;
  readonly ruleKey: DeadlineRuleKey;
  /** The FROZEN due date. Read, never recomputed — §09's freeze. */
  readonly due: CivilDate | string;
  readonly complianceTaskId: string | null;
  /** §09's rule table: zero-tolerance rules take the faster ladder. */
  readonly zeroTolerance: boolean;
  readonly satisfiedAt?: CivilDate | string | null | undefined;
  readonly waived?: boolean | undefined;
  /**
   * The SUBJECT ROW's confidentiality and audit classification, carried so the writer can ask
   * `mayDispatch` with values that came from the database rather than from this module. ⚠ Passed
   * THROUGH untouched and never interpreted here: an evaluator that "helpfully" normalised them
   * would be the cast `mayDispatch`'s own doc comment warns about.
   */
  readonly confidentiality: string;
  readonly auditClassification: string;
}

export interface EvaluatorConfig {
  readonly preAlertOffsetsBd: readonly number[];
  readonly atRiskThresholdBd: number;
  readonly ladders: LadderPair;
}

/** What the writer should do about one deadline today. */
export interface DeadlinePlanEntry {
  readonly deadlineId: string;
  readonly waqfId: string;
  readonly ruleKey: DeadlineRuleKey;
  readonly complianceTaskId: string | null;
  readonly state: DerivedDeadlineState;
  /** Offsets whose reminder fires EXACTLY today — idempotence by derivation, no stored flag. */
  readonly remindersFiringToday: readonly number[];
  /** The highest rung engaged, or `null`. Only an `overdue` deadline escalates. */
  readonly escalateTo: EscalationLevel | null;
  /** Which ladder was selected, echoed so an audit entry can record WHY the rung is the rung. */
  readonly ladderUsed: 'ordinary' | 'zero_tolerance';
  readonly statusMirror: StatusMirror;
  /** Verbatim from the facts — the writer's `mayDispatch` arguments, unmodified. */
  readonly dispatchSubject: {
    readonly confidentiality: string;
    readonly auditClassification: string;
  };
}

export interface DeadlineEvaluationPlan {
  readonly today: string;
  readonly entries: readonly DeadlinePlanEntry[];
  /**
   * Deadlines whose state mirrors nowhere, grouped by why. Reported rather than dropped: a batch
   * that silently skipped rows would make "nothing to do" and "we could not decide" identical.
   */
  readonly abstained: readonly { readonly deadlineId: string; readonly reason: MirrorAbstention }[];
}

/**
 * Build the day's plan. PURE — `today` is a parameter, nothing is read, nothing is written.
 *
 * @throws `DEADLINE_STATE_INCOHERENT` — a duplicated deadline id, contradictory recorded facts, or
 *         a ladder pair that contradicts §09's "faster".
 */
export function planDeadlineEvaluation(args: {
  readonly today: CivilDate | string;
  readonly calendar: HolidayCalendar;
  readonly deadlines: readonly EvaluatedDeadlineFacts[];
  readonly config: EvaluatorConfig;
}): DeadlineEvaluationPlan {
  const seen = new Set<string>();
  const entries: DeadlinePlanEntry[] = [];
  const abstained: { deadlineId: string; reason: MirrorAbstention }[] = [];

  for (const facts of args.deadlines) {
    if (seen.has(facts.deadlineId)) {
      refuse(
        'DUPLICATE_DEADLINE_IN_BATCH',
        `deadline ${facts.deadlineId} appears twice in one evaluation batch. One row cannot have ` +
          'two plans, and a batch that deduplicated silently could emit one reminder twice.',
        { deadlineId: facts.deadlineId },
      );
    }
    seen.add(facts.deadlineId);

    if (facts.satisfiedAt != null && facts.waived === true) {
      refuse(
        'DEADLINE_FACTS_CONTRADICT',
        `deadline ${facts.deadlineId} is recorded both satisfied and waived. Ranking them would ` +
          'decide which record to disbelieve; the row must be corrected first.',
        { deadlineId: facts.deadlineId },
      );
    }

    // The ladder is selected BEFORE the state is derived, so a contradictory ladder pair refuses
    // the whole batch rather than only the rows that happen to be overdue today.
    const ladder = selectEscalationLadder({
      zeroTolerance: facts.zeroTolerance,
      ladders: args.config.ladders,
    });

    const state = deriveDeadlineState({
      today: args.today,
      due: facts.due,
      calendar: args.calendar,
      preAlertOffsetsBd: args.config.preAlertOffsetsBd,
      atRiskThresholdBd: args.config.atRiskThresholdBd,
      metDate: facts.satisfiedAt ?? null,
      waived: facts.waived ?? false,
    });

    // ⚠ Recomputed rather than read off `state.preAlertsFiringToday`, and the two are asserted
    // equal by a test. A met or waived deadline must emit NOTHING, and `deriveDeadlineState`'s
    // precedence means its `preAlertsFiringToday` is already empty for those — this call makes the
    // plan's independence from that internal ordering explicit rather than a dependency on it.
    const reminders =
      state.status === 'met' || state.status === 'waived'
        ? []
        : preAlertsFiringOn({
            today: args.today,
            due: facts.due,
            calendar: args.calendar,
            preAlertOffsetsBd: args.config.preAlertOffsetsBd,
          });

    const statusMirror = mirrorTaskStatus(state.status);
    if (statusMirror.mirror === null) {
      abstained.push({ deadlineId: facts.deadlineId, reason: statusMirror.abstention });
    }

    entries.push(
      Object.freeze({
        deadlineId: facts.deadlineId,
        waqfId: facts.waqfId,
        ruleKey: facts.ruleKey,
        complianceTaskId: facts.complianceTaskId,
        state,
        remindersFiringToday: Object.freeze([...reminders]),
        escalateTo: deriveEscalationLevel({ state, ladder }),
        ladderUsed: facts.zeroTolerance ? ('zero_tolerance' as const) : ('ordinary' as const),
        statusMirror,
        dispatchSubject: Object.freeze({
          confidentiality: facts.confidentiality,
          auditClassification: facts.auditClassification,
        }),
      }),
    );
  }

  return Object.freeze({
    today: String(args.today),
    entries: Object.freeze(entries),
    abstained: Object.freeze(abstained),
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Who a rung reaches — the ladder's levels as ROLES, pinned
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * BR-1004's path, mapped onto the THIRTEEN roles (ADR-0004). All three exist as real seats, so the
 * mapping needs no invention — which is why it is a frozen table here rather than a switch in the
 * writer, and why a test pins it against `schema.prisma`'s `enum Role`.
 *
 * ⚠ RECIPIENTS ARE GRANT HOLDERS **ON THIS ENDOWMENT**, never role holders globally: a Nazir of
 * endowment A must not be told that endowment B's registration is overdue. The writer resolves them
 * through `WaqfAccessGrant`, which is the same access-matrix answer every read goes through.
 *
 * ⚠ AND AN EMPTY RECIPIENT SET IS A REPORTED FACT, NOT A SILENT SUCCESS. An endowment with no
 * LEADERSHIP grant escalates to nobody, and the run must say so — otherwise "escalated to
 * leadership" and "nobody holds that seat here" are the same log line, which is precisely how an
 * unread escalation becomes an escalation that was never sent.
 */
export const ESCALATION_ROLE_BY_LEVEL: Readonly<Record<EscalationLevel, string>> = Object.freeze({
  case_manager: 'CASE_MANAGER',
  nazir: 'NAZIR',
  leadership: 'LEADERSHIP',
});

/**
 * The `EscalationLevel` values as the `escalation_event.level` enum spells them (migration 41).
 *
 * Two spellings of one vocabulary, so they are compared rather than trusted — the rule this
 * repository has been bitten by five times. The domain's are lower_snake (`case_manager`), the
 * database's UPPER (`CASE_MANAGER`); a test asserts this map is a bijection onto both.
 */
export const ESCALATION_LEVEL_DB_VALUE: Readonly<Record<EscalationLevel, string>> = Object.freeze({
  case_manager: 'CASE_MANAGER',
  nazir: 'NAZIR',
  leadership: 'LEADERSHIP',
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · Reminder identity — idempotence as a KEY, not as a flag
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The idempotency key for one reminder: one deadline, one offset, one day.
 *
 * §09's cadence is "each reminder fires exactly once on its own day", and S9-1 delivered that
 * DERIVATIONALLY (`preAlertsFiringOn` matches an exact remaining count). This key is the second
 * latch, at the transport: even if the evaluator ran twice on one day — a retried cron, an operator
 * re-run, two workers — the queue deduplicates on this string and the second enqueue is a no-op.
 *
 * ⚠ THE DAY IS IN THE KEY AND THAT IS THE WHOLE POINT. A key of `(deadline, offset)` alone would
 * make a reminder unrepeatable across a legitimate recompute lineage; a key with a timestamp in it
 * would make every run unique and deduplicate nothing.
 */
export function reminderIdempotencyKey(args: {
  readonly deadlineId: string;
  readonly offsetBd: number;
  readonly onDay: CivilDate | string;
}): string {
  return `deadline-reminder:${args.deadlineId}:t-${String(args.offsetBd)}bd:${String(args.onDay)}`;
}

/**
 * The idempotency key for one escalation: one deadline, one rung, one day.
 *
 * Deliberately NOT `(deadline, rung)` without the day: an obligation that stays overdue must keep
 * escalating daily at the rung it has reached — §09's zero-tolerance items "cannot be dismissed,
 * only resolved", and a ladder that went quiet after its first message would be a dismissal
 * implemented as silence.
 */
export function escalationIdempotencyKey(args: {
  readonly deadlineId: string;
  readonly level: EscalationLevel;
  readonly onDay: CivilDate | string;
}): string {
  return `deadline-escalation:${args.deadlineId}:${args.level}:${String(args.onDay)}`;
}
