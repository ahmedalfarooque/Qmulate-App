/**
 * S9-3d — §09's daily evaluator as a pure plan, and the two places it REFUSES to guess.
 *
 * The arithmetic is S9-1's and is tested there. What is new here is judgement:
 *
 *  1. **The ladder selection.** §09 says zero-tolerance rules escalate on a *faster* ladder, and
 *     gives no figures. So both ladders are configuration and the RELATION between them is
 *     asserted — a pair where the zero-tolerance rung is slower refuses, because it would make the
 *     strictest statutory duties the slowest to reach anyone, silently, in the one direction nobody
 *     inspects.
 *  2. **The `ComplianceTask.status` mirror.** Six deadline states onto five task statuses is not a
 *     bijection, so a total mirror must invent something. Exactly one mapping carries no invention
 *     (`met` → `COMPLETED`); the other five ABSTAIN, and the abstentions are asserted by name so a
 *     later "helpful" mapping is a test failure rather than a silent product decision.
 */

import { describe, expect, it } from 'vitest';

import { buildHolidayCalendar, type HolidayCalendar } from '../dates/index.js';
import {
  DEADLINE_STATUSES,
  ESCALATION_LEVELS,
  ESCALATION_LEVEL_DB_VALUE,
  ESCALATION_ROLE_BY_LEVEL,
  EVALUATOR_REFUSALS,
  MIRROR_ABSTENTIONS,
  TASK_STATUSES_FOR_MIRROR,
  escalationIdempotencyKey,
  ladderFromTuple,
  mirrorTaskStatus,
  planDeadlineEvaluation,
  reminderIdempotencyKey,
  selectEscalationLadder,
  type EvaluatedDeadlineFacts,
  type EvaluatorConfig,
} from '../deadlines/index.js';
import { DomainError } from '../errors.js';

/** A weekend-only KSA calendar over a window wide enough for every vector below. */
const CALENDAR: HolidayCalendar = buildHolidayCalendar({
  workweek: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
  coverage: { from: '2026-01-01', to: '2027-12-31' },
  observed: [{ date: '2026-05-19', nameAr: 'عطلة تجريبية', nameEn: 'test holiday' }],
});

const LADDERS = {
  ordinary: ladderFromTuple([0, 3, 10]),
  zeroTolerance: ladderFromTuple([0, 1, 3]),
};

const CONFIG: EvaluatorConfig = {
  preAlertOffsetsBd: [30, 15, 7, 3, 1],
  atRiskThresholdBd: 3,
  ladders: LADDERS,
};

function facts(over: Partial<EvaluatedDeadlineFacts> = {}): EvaluatedDeadlineFacts {
  return {
    deadlineId: 'dl-1',
    waqfId: 'waqf-001',
    ruleKey: 'ISTIBDAL_10BD',
    due: '2026-06-10',
    complianceTaskId: 'task-1',
    zeroTolerance: false,
    confidentiality: 'NORMAL',
    auditClassification: 'ROUTINE',
    ...over,
  };
}

function refusalOf(fn: () => unknown): { code: string; refusal: unknown } {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) {
      const details = (error.details ?? {}) as Record<string, unknown>;
      return { code: error.code, refusal: details['refusal'] };
    }
    throw error;
  }
  throw new Error('expected a refusal, got a value');
}

describe('the ladder — configuration, with one structural relation asserted', () => {
  it('reads the positional tuple in ESCALATION_LEVELS order', () => {
    expect(ladderFromTuple([0, 3, 10])).toStrictEqual({
      case_manager: 0,
      nazir: 3,
      leadership: 10,
    });
  });

  it('REFUSES a tuple that is not three thresholds — a short one silently drops a rung', () => {
    // Most likely Leadership, the rung that matters most. Its OWN discriminator, because a truncated
    // config row and a coherent-but-forbidden policy need different remedies.
    expect(refusalOf(() => ladderFromTuple([0, 3]))).toStrictEqual({
      code: 'DEADLINE_STATE_INCOHERENT',
      refusal: 'LADDER_TUPLE_MALFORMED',
    });
    expect(refusalOf(() => ladderFromTuple([0, 3, 10, 20])).refusal).toBe('LADDER_TUPLE_MALFORMED');
  });

  it('selects the faster ladder for a zero-tolerance rule and the ordinary one otherwise', () => {
    expect(selectEscalationLadder({ zeroTolerance: true, ladders: LADDERS })).toStrictEqual(
      LADDERS.zeroTolerance,
    );
    expect(selectEscalationLadder({ zeroTolerance: false, ladders: LADDERS })).toStrictEqual(
      LADDERS.ordinary,
    );
  });

  it('REFUSES a zero-tolerance ladder that is SLOWER at any rung — §09 as an assertion', () => {
    // ⚠ THE POINT. §09 gives no figures, so nothing else would notice a pair configured backwards —
    // and backwards means the strictest duties escalate last, which is not a policy anybody chose.
    const backwards = {
      ordinary: ladderFromTuple([0, 3, 10]),
      zeroTolerance: ladderFromTuple([0, 5, 3]),
    };
    expect(
      refusalOf(() => selectEscalationLadder({ zeroTolerance: true, ladders: backwards })),
    ).toStrictEqual({
      code: 'DEADLINE_STATE_INCOHERENT',
      refusal: 'ZERO_TOLERANCE_LADDER_NOT_FASTER',
    });
    // …and it refuses for the ORDINARY selection too: the pair is incoherent whichever ladder the
    // caller wanted, so a run with no zero-tolerance rows in it must not pass silently.
    expect(
      refusalOf(() => selectEscalationLadder({ zeroTolerance: false, ladders: backwards })).refusal,
    ).toBe('ZERO_TOLERANCE_LADDER_NOT_FASTER');
  });

  it('PERMITS equal thresholds — "not slower" rather than "strictly faster everywhere"', () => {
    // A policy may legitimately engage the Case Manager at the same threshold for both classes and
    // diverge later. Demanding strictness everywhere would refuse a reasonable configuration.
    const equalFirstRung = {
      ordinary: ladderFromTuple([0, 3, 10]),
      zeroTolerance: ladderFromTuple([0, 1, 3]),
    };
    expect(() =>
      selectEscalationLadder({ zeroTolerance: true, ladders: equalFirstRung }),
    ).not.toThrow();
    const identical = {
      ordinary: ladderFromTuple([1, 3, 5]),
      zeroTolerance: ladderFromTuple([1, 3, 5]),
    };
    expect(() => selectEscalationLadder({ zeroTolerance: true, ladders: identical })).not.toThrow();
  });

  it('the rung → role and rung → database-value maps cover every level, exactly once', () => {
    for (const level of ESCALATION_LEVELS) {
      expect(ESCALATION_ROLE_BY_LEVEL[level]).toBeTruthy();
      expect(ESCALATION_LEVEL_DB_VALUE[level]).toBeTruthy();
    }
    expect(Object.keys(ESCALATION_ROLE_BY_LEVEL).sort()).toStrictEqual(
      [...ESCALATION_LEVELS].sort(),
    );
    // Two spellings of one vocabulary, compared rather than trusted: the domain's lower_snake and
    // the `escalation_event.level` enum's UPPER.
    expect(Object.values(ESCALATION_LEVEL_DB_VALUE)).toStrictEqual([
      'CASE_MANAGER',
      'NAZIR',
      'LEADERSHIP',
    ]);
    expect(new Set(Object.values(ESCALATION_LEVEL_DB_VALUE)).size).toBe(ESCALATION_LEVELS.length);
  });
});

describe('the status mirror — total, and abstaining twice on purpose', () => {
  it('is total over the six deadline states', () => {
    for (const status of DEADLINE_STATUSES) {
      const result = mirrorTaskStatus(status);
      // Exactly one of the two arms, never both, never neither.
      expect(result.mirror === null).toBe(result.abstention !== null);
    }
  });

  it('maps `met` → COMPLETED, and that is the ONLY mapping made', () => {
    expect(mirrorTaskStatus('met')).toStrictEqual({ mirror: 'COMPLETED', abstention: null });
    const mapped = DEADLINE_STATUSES.filter((status) => mirrorTaskStatus(status).mirror !== null);
    expect(mapped).toStrictEqual(['met']);
    expect(TASK_STATUSES_FOR_MIRROR).toContain('COMPLETED');
  });

  it('the four OPEN states abstain — a cron must not fabricate that work has started', () => {
    // Writing `IN_PROGRESS` because a date approached invents activity, and it would overwrite a
    // case manager's own answer every night.
    for (const status of ['pending', 'due_soon', 'at_risk', 'overdue'] as const) {
      expect(mirrorTaskStatus(status)).toStrictEqual({
        mirror: null,
        abstention: 'MIRROR_NOT_A_STATUS_FACT',
      });
    }
  });

  it('`waived` abstains as an OWNER-QUEUE item, not as an oversight', () => {
    // ⚠ THE LOAD-BEARING ONE. `NOT_APPLICABLE` means the duty never applied; a waiver means it
    // applied and the breach was excused. One target for both would make an excused statutory
    // breach indistinguishable from a duty never owed — in the register and in every report built
    // from it. If somebody later maps this, THIS assertion is what stops it being silent.
    expect(mirrorTaskStatus('waived')).toStrictEqual({
      mirror: null,
      abstention: 'MIRROR_UNDECIDED_WAIVED',
    });
    expect([...MIRROR_ABSTENTIONS]).toStrictEqual([
      'MIRROR_NOT_A_STATUS_FACT',
      'MIRROR_UNDECIDED_WAIVED',
    ]);
  });
});

describe('the plan', () => {
  it('fires a reminder EXACTLY on its own day, and on no other', () => {
    // Due 2026-06-10 (a Wednesday). Three business days before it, counting back over the weekend,
    // is 2026-06-07 — so the `3` offset fires there and nowhere near it.
    const onTheDay = planDeadlineEvaluation({
      today: '2026-06-07',
      calendar: CALENDAR,
      deadlines: [facts()],
      config: CONFIG,
    });
    expect(onTheDay.entries[0]?.remindersFiringToday).toStrictEqual([3]);

    for (const day of ['2026-06-06', '2026-06-08', '2026-06-09']) {
      const other = planDeadlineEvaluation({
        today: day,
        calendar: CALENDAR,
        deadlines: [facts()],
        config: CONFIG,
      });
      expect(
        other.entries[0]?.remindersFiringToday,
        `${day} must not fire the 3-bd offset`,
      ).not.toContain(3);
    }
  });

  it('emits NOTHING for a met or waived deadline, on any day', () => {
    for (const over of [{ satisfiedAt: '2026-06-01' }, { waived: true }]) {
      const plan = planDeadlineEvaluation({
        today: '2026-06-07',
        calendar: CALENDAR,
        deadlines: [facts(over)],
        config: CONFIG,
      });
      expect(plan.entries[0]?.remindersFiringToday).toStrictEqual([]);
      expect(plan.entries[0]?.escalateTo).toBeNull();
    }
  });

  it('escalates only when OVERDUE, and the zero-tolerance rule reaches a HIGHER rung sooner', () => {
    // Two business days past due. Ordinary ladder: case_manager at 0, nazir at 3 → case_manager.
    // Zero-tolerance ladder: case_manager at 0, nazir at 1, leadership at 3 → nazir.
    const day = '2026-06-12';
    const ordinary = planDeadlineEvaluation({
      today: day,
      calendar: CALENDAR,
      deadlines: [facts({ zeroTolerance: false })],
      config: CONFIG,
    });
    const zero = planDeadlineEvaluation({
      today: day,
      calendar: CALENDAR,
      deadlines: [facts({ deadlineId: 'dl-2', zeroTolerance: true, ruleKey: 'UPDATE_15BD' })],
      config: CONFIG,
    });
    expect(ordinary.entries[0]?.state.status).toBe('overdue');
    expect(ordinary.entries[0]?.escalateTo).toBe('case_manager');
    expect(ordinary.entries[0]?.ladderUsed).toBe('ordinary');
    expect(zero.entries[0]?.escalateTo).toBe('nazir');
    expect(zero.entries[0]?.ladderUsed).toBe('zero_tolerance');
  });

  it('does not escalate a deadline due TODAY — at_risk is not late', () => {
    const plan = planDeadlineEvaluation({
      today: '2026-06-10',
      calendar: CALENDAR,
      deadlines: [facts()],
      config: CONFIG,
    });
    expect(plan.entries[0]?.state.status).toBe('at_risk');
    expect(plan.entries[0]?.escalateTo).toBeNull();
  });

  it('passes the dispatch subject through UNTOUCHED — the evaluator never interprets it', () => {
    // ⚠ An evaluator that "helpfully" normalised these would be the cast `mayDispatch`'s own doc
    // comment warns about: an unrecognised value must reach the fail-closed branch as it was found.
    const plan = planDeadlineEvaluation({
      today: '2026-06-12',
      calendar: CALENDAR,
      deadlines: [
        facts({ confidentiality: 'AML_RESTRICTED', auditClassification: 'RESTRICTED' }),
        facts({ deadlineId: 'dl-x', confidentiality: '<unreadable subject row>' }),
      ],
      config: CONFIG,
    });
    expect(plan.entries[0]?.dispatchSubject).toStrictEqual({
      confidentiality: 'AML_RESTRICTED',
      auditClassification: 'RESTRICTED',
    });
    expect(plan.entries[1]?.dispatchSubject.confidentiality).toBe('<unreadable subject row>');
  });

  it('REPORTS every abstention rather than dropping the row', () => {
    const plan = planDeadlineEvaluation({
      today: '2026-06-12',
      calendar: CALENDAR,
      deadlines: [facts(), facts({ deadlineId: 'dl-2', waived: true })],
      config: CONFIG,
    });
    // "nothing to do" and "we could not decide" must not be the same output.
    expect(plan.abstained).toStrictEqual([
      { deadlineId: 'dl-1', reason: 'MIRROR_NOT_A_STATUS_FACT' },
      { deadlineId: 'dl-2', reason: 'MIRROR_UNDECIDED_WAIVED' },
    ]);
    expect(plan.entries.length).toBe(2);
  });

  it('REFUSES a duplicated deadline in one batch — one row cannot have two plans', () => {
    expect(
      refusalOf(() =>
        planDeadlineEvaluation({
          today: '2026-06-07',
          calendar: CALENDAR,
          deadlines: [facts(), facts()],
          config: CONFIG,
        }),
      ),
    ).toStrictEqual({
      code: 'DEADLINE_STATE_INCOHERENT',
      refusal: 'DUPLICATE_DEADLINE_IN_BATCH',
    });
  });

  it('REFUSES contradictory recorded facts rather than ranking them', () => {
    expect(
      refusalOf(() =>
        planDeadlineEvaluation({
          today: '2026-06-07',
          calendar: CALENDAR,
          deadlines: [facts({ satisfiedAt: '2026-06-01', waived: true })],
          config: CONFIG,
        }),
      ).refusal,
    ).toBe('DEADLINE_FACTS_CONTRADICT');
  });

  it('refuses an incoherent ladder pair even when NO row would escalate today', () => {
    // ⚠ The ladder is selected BEFORE the state is derived, deliberately: a mis-assembled config
    // must fail the run, not only the rows that happen to be late. Otherwise the defect stays latent
    // until the first overdue deadline — which is the worst possible moment to discover it.
    const backwards = {
      ordinary: ladderFromTuple([0, 3, 10]),
      zeroTolerance: ladderFromTuple([0, 5, 3]),
    };
    expect(
      refusalOf(() =>
        planDeadlineEvaluation({
          today: '2026-01-05', // months before due — nothing is overdue, nothing even due_soon
          calendar: CALENDAR,
          deadlines: [facts()],
          config: { ...CONFIG, ladders: backwards },
        }),
      ).refusal,
    ).toBe('ZERO_TOLERANCE_LADDER_NOT_FASTER');
  });

  it('the refusal vocabulary is closed', () => {
    expect([...EVALUATOR_REFUSALS]).toStrictEqual([
      'ZERO_TOLERANCE_LADDER_NOT_FASTER',
      'LADDER_TUPLE_MALFORMED',
      'DEADLINE_FACTS_CONTRADICT',
      'DUPLICATE_DEADLINE_IN_BATCH',
    ]);
  });
});

describe('idempotency keys — the day is IN the key, and that is the design', () => {
  it('a reminder key is one deadline, one offset, one day', () => {
    expect(reminderIdempotencyKey({ deadlineId: 'dl-1', offsetBd: 3, onDay: '2026-06-07' })).toBe(
      'deadline-reminder:dl-1:t-3bd:2026-06-07',
    );
    // Different day ⇒ different key. A key WITHOUT the day would make a reminder unrepeatable
    // across a legitimate recompute lineage; a key with a timestamp would deduplicate nothing.
    expect(
      reminderIdempotencyKey({ deadlineId: 'dl-1', offsetBd: 3, onDay: '2026-06-08' }),
    ).not.toBe(reminderIdempotencyKey({ deadlineId: 'dl-1', offsetBd: 3, onDay: '2026-06-07' }));
  });

  it('an escalation key repeats DAILY at the rung it reached — silence would be a dismissal', () => {
    // ⚠ §09: zero-tolerance items "cannot be dismissed, only resolved". A ladder that went quiet
    // after its first message would be a dismissal implemented as silence, so the key is per-day.
    const monday = escalationIdempotencyKey({
      deadlineId: 'dl-1',
      level: 'nazir',
      onDay: '2026-06-15',
    });
    const tuesday = escalationIdempotencyKey({
      deadlineId: 'dl-1',
      level: 'nazir',
      onDay: '2026-06-16',
    });
    expect(monday).not.toBe(tuesday);
    expect(monday).toBe('deadline-escalation:dl-1:nazir:2026-06-15');
    // Two rungs on one day are two keys — an escalation reaching the Nazir does not consume the
    // Case Manager's own record of having been told.
    expect(
      escalationIdempotencyKey({ deadlineId: 'dl-1', level: 'case_manager', onDay: '2026-06-15' }),
    ).not.toBe(monday);
  });
});
