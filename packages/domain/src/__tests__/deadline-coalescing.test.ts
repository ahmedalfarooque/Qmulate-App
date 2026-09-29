/**
 * S9-3c — §09's coalescing paragraph, clause by clause.
 *
 * The four clauses, and which test carries each:
 *
 *   1. "one open update obligation per waqf"        → `RAISE` only when none is open
 *   2. "append to its change-set, not parallel clocks" → `APPEND` / `APPEND_AND_TIGHTEN`, never a
 *                                                        second raise
 *   3. "the EARLIEST un-filed change's effective date (the tightest deadline governs)"
 *                                                   → the `min`, AND the direction people forget:
 *                                                     a LOOSER new cause changes nothing
 *   4. "filing clears the set; a subsequent change opens a fresh clock"
 *                                                   → the empty un-filed set has no cause at all
 *
 * ⚠ CLAUSE 3 IS THE SAFETY PROPERTY, and it is asserted in BOTH directions on purpose. Coalescing
 * exists to stop three changes becoming three clocks — but the same mechanism, written carelessly,
 * would let a batch of changes inherit the LOOSEST of their dates and hand the Nazir extra time on
 * the tightest one. So there are two tests: adding an earlier change TIGHTENS, and adding a later
 * change does not move the date at all.
 */

import { describe, expect, it } from 'vitest';

// ⚠ `OPEN_TASK_STATUSES` is imported from `compliance`, NOT from `deadlines` — and the import path
// is itself part of what this file asserts. `coalescing.ts` re-exports compliance's single
// definition rather than declaring its own; reading it from the owner here means a second copy
// re-appearing in `deadlines` could not satisfy this test by accident.
import { OPEN_TASK_STATUSES } from '../compliance/index.js';
import {
  COALESCE_IDENTITY_KEY,
  COALESCE_REFUSALS,
  UPDATE_OBLIGATION_TEMPLATE_CODE,
  coalesceUpdateObligation,
  type CoalesceInput,
} from '../deadlines/index.js';
import { DomainError } from '../errors.js';

const CHANGE = (id: string, effectiveDate: string | null, kind = 'ASSET') =>
  ({ id, effectiveDate, kind }) as const;

function refusalOf(input: CoalesceInput): { code: string; refusal: unknown } {
  try {
    coalesceUpdateObligation(input);
  } catch (error) {
    if (error instanceof DomainError) {
      const details = (error.details ?? {}) as Record<string, unknown>;
      return { code: error.code, refusal: details['refusal'] };
    }
    throw error;
  }
  throw new Error('expected a refusal, got a decision');
}

describe('the declared constants — §09 text, not choices made in code', () => {
  it('the identity key is the endowment, and the template is the canonical GOV-REG-02', () => {
    // §09: "one open update obligation **per waqf**". Pinned as a constant so that the day a finer
    // key (per platform? per change kind?) is ruled, it is an edit to a declaration — and so the
    // migration's partial unique index, which keys on `waqfId` alone, has something to agree with.
    expect(COALESCE_IDENTITY_KEY).toBe('waqf');
    expect(UPDATE_OBLIGATION_TEMPLATE_CODE).toBe('GOV-REG-02');
  });

  it('reuses compliance\'s ONE definition of "open" rather than restating it', () => {
    // ⚠ This file's subject had a second copy of this list in its first draft. Two lists that must
    // agree with nothing pinning them is how a RETIRED duty starts blocking a fresh clock on one
    // code path and not the other. `RETIRED` and `NOT_APPLICABLE` must be absent: §09 says a
    // subsequent change opens a FRESH clock, so a retired duty cannot hold the endowment's slot.
    expect([...OPEN_TASK_STATUSES]).toStrictEqual(['NOT_STARTED', 'IN_PROGRESS']);
  });

  it('the refusal vocabulary is closed', () => {
    expect([...COALESCE_REFUSALS]).toStrictEqual([
      'UPDATE_OBLIGATION_WITHOUT_CAUSE',
      'CHANGE_SET_MEMBER_UNDATED',
      'OPEN_OBLIGATION_ANCHOR_INCOHERENT',
    ]);
  });
});

describe('clause 1 + 2 — one open obligation; later changes APPEND rather than spawn', () => {
  it('raises when nothing is open, clocked from the change', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [CHANGE('mc-1', '2026-05-10')],
      openObligation: null,
    });
    expect(decision.action).toBe('RAISE');
    expect(String(decision.governingAnchor)).toBe('2026-05-10');
    expect(decision.governingCause).toStrictEqual({
      kind: 'material_change',
      changeId: 'mc-1',
      changeKind: 'ASSET',
    });
  });

  it('NEVER raises a second time while one is open — three changes in a week are ONE duty', () => {
    const open = { taskId: 'task-1', headDeadlineId: 'dl-1', headAnchor: '2026-05-10' };
    for (const later of ['2026-05-12', '2026-05-14', '2026-05-20']) {
      const decision = coalesceUpdateObligation({
        certificateAnchor: null,
        unfiledChanges: [CHANGE('mc-1', '2026-05-10'), CHANGE('mc-2', later)],
        openObligation: open,
      });
      expect(decision.action).not.toBe('RAISE');
    }
  });

  it('attaches a deadline to an open obligation that has none, without raising a duplicate', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [CHANGE('mc-1', '2026-05-10')],
      openObligation: { taskId: 'task-1', headDeadlineId: null, headAnchor: null },
    });
    expect(decision.action).toBe('ATTACH_DEADLINE');
    expect(decision.action === 'ATTACH_DEADLINE' && decision.taskId).toBe('task-1');
  });
});

describe('clause 3 — the earliest un-filed change governs, in BOTH directions', () => {
  it('TIGHTENS when a newly-recorded change is effective EARLIER than the date on file', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [CHANGE('mc-1', '2026-05-20'), CHANGE('mc-2', '2026-05-04', 'BENEFICIARY')],
      openObligation: { taskId: 'task-1', headDeadlineId: 'dl-1', headAnchor: '2026-05-20' },
    });
    expect(decision.action).toBe('APPEND_AND_TIGHTEN');
    if (decision.action !== 'APPEND_AND_TIGHTEN') return;
    expect(String(decision.fromAnchor)).toBe('2026-05-20');
    expect(String(decision.governingAnchor)).toBe('2026-05-04');
    // §09's only correction path: a NEW row naming the one it supersedes. Never an UPDATE — the
    // date on file has been displayed and possibly filed, and migration 38 makes moving it
    // impossible at rest anyway.
    expect(decision.supersedesDeadlineId).toBe('dl-1');
    expect(decision.governingCause.changeId).toBe('mc-2');
  });

  it('does NOT move the date when the new change is effective LATER — the direction people forget', () => {
    // ⚠ THE SAFETY PROPERTY. If coalescing let a batch inherit the loosest of its dates, batching
    // would buy the Nazir extra time on the tightest change — which is worse than not coalescing.
    const decision = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [CHANGE('mc-1', '2026-05-04'), CHANGE('mc-2', '2026-05-20')],
      openObligation: { taskId: 'task-1', headDeadlineId: 'dl-1', headAnchor: '2026-05-04' },
    });
    expect(decision.action).toBe('APPEND');
    if (decision.action !== 'APPEND') return;
    expect(String(decision.headAnchor)).toBe('2026-05-04');
    expect(String(decision.governingAnchor)).toBe('2026-05-04');
    expect(decision.governingCause.changeId).toBe('mc-1');
  });

  it('an equal date is an APPEND, not a tightening — a supersession chain link for no change', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [CHANGE('mc-1', '2026-05-10'), CHANGE('mc-2', '2026-05-10')],
      openObligation: { taskId: 'task-1', headDeadlineId: 'dl-1', headAnchor: '2026-05-10' },
    });
    expect(decision.action).toBe('APPEND');
  });

  it('the CERTIFICATE arm competes in the same min, and can be beaten by a change', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: '2026-09-30',
      unfiledChanges: [CHANGE('mc-1', '2026-05-10')],
      openObligation: null,
    });
    expect(decision.action).toBe('RAISE');
    expect(String(decision.governingAnchor)).toBe('2026-05-10');
    expect(decision.governingCause.kind).toBe('material_change');
  });

  it('…and can WIN it, when the expiry is the tighter of the two', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: '2026-05-04',
      unfiledChanges: [CHANGE('mc-1', '2026-05-10')],
      openObligation: null,
    });
    expect(String(decision.governingAnchor)).toBe('2026-05-04');
    expect(decision.governingCause).toStrictEqual({
      kind: 'certificate_expiry',
      changeId: null,
      changeKind: null,
    });
  });

  it('a tie between the two arms resolves deterministically, and to the SAME date either way', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: '2026-05-10',
      unfiledChanges: [CHANGE('mc-1', '2026-05-10')],
      openObligation: null,
    });
    // The tie-break decides only the audit STORY (which cause is named); the date is identical, so
    // no deadline depends on it. Asserted so the tie is not silently order-dependent.
    expect(String(decision.governingAnchor)).toBe('2026-05-10');
    expect(decision.governingCause.kind).toBe('certificate_expiry');
  });

  it('picks the min regardless of the order the changes arrive in', () => {
    const forward = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [
        CHANGE('a', '2026-06-01'),
        CHANGE('b', '2026-03-15'),
        CHANGE('c', '2026-09-09'),
      ],
      openObligation: null,
    });
    const reversed = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [
        CHANGE('c', '2026-09-09'),
        CHANGE('b', '2026-03-15'),
        CHANGE('a', '2026-06-01'),
      ],
      openObligation: null,
    });
    expect(String(forward.governingAnchor)).toBe('2026-03-15');
    expect(String(reversed.governingAnchor)).toBe('2026-03-15');
    expect(forward.governingCause.changeId).toBe('b');
    expect(reversed.governingCause.changeId).toBe('b');
  });

  it('crosses a year boundary correctly (string ordering on ISO days, not on day-of-year)', () => {
    const decision = coalesceUpdateObligation({
      certificateAnchor: null,
      unfiledChanges: [CHANGE('a', '2027-01-05'), CHANGE('b', '2026-12-28')],
      openObligation: null,
    });
    expect(String(decision.governingAnchor)).toBe('2026-12-28');
  });
});

describe('clause 4 + coherence — a duty with no cause, and half-populated state', () => {
  it('REFUSES to raise or re-anchor with nothing un-filed behind it', () => {
    // This is the state right after a filing: the change-set is cleared, no expiry is in scope.
    // §09 raises this duty FROM A TRIGGER, so a duty whose cause nobody can state has no anchor —
    // and the engine will not invent one.
    expect(
      refusalOf({ certificateAnchor: null, unfiledChanges: [], openObligation: null }),
    ).toStrictEqual({
      code: 'DEADLINE_STATE_INCOHERENT',
      refusal: 'UPDATE_OBLIGATION_WITHOUT_CAUSE',
    });
    // …and equally with an obligation already open: re-anchoring needs a cause too.
    expect(
      refusalOf({
        certificateAnchor: null,
        unfiledChanges: [],
        openObligation: { taskId: 'task-1', headDeadlineId: 'dl-1', headAnchor: '2026-05-10' },
      }).refusal,
    ).toBe('UPDATE_OBLIGATION_WITHOUT_CAUSE');
  });

  it('REFUSES an undated change-set member rather than skipping it', () => {
    // Skipping would be the dangerous behaviour: the dropped member could be the TIGHTEST one, and
    // the run would report a governing anchor computed from an incomplete set.
    expect(
      refusalOf({
        certificateAnchor: null,
        unfiledChanges: [CHANGE('mc-1', '2026-05-10'), CHANGE('mc-2', null)],
        openObligation: null,
      }),
    ).toStrictEqual({
      code: 'DEADLINE_STATE_INCOHERENT',
      refusal: 'CHANGE_SET_MEMBER_UNDATED',
    });
  });

  it('REFUSES a half-populated open obligation instead of picking which half to disbelieve', () => {
    for (const open of [
      { taskId: 't', headDeadlineId: 'dl-1', headAnchor: null },
      { taskId: 't', headDeadlineId: null, headAnchor: '2026-05-10' },
    ]) {
      expect(
        refusalOf({
          certificateAnchor: null,
          unfiledChanges: [CHANGE('mc-1', '2026-05-10')],
          openObligation: open,
        }).refusal,
      ).toBe('OPEN_OBLIGATION_ANCHOR_INCOHERENT');
    }
  });
});
