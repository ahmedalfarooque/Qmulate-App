/**
 * `deadlines/coalescing.ts` — §09's ONE-OPEN-UPDATE-OBLIGATION RULE, as arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09's PARAGRAPH, QUOTED, BECAUSE EVERY CLAUSE OF IT IS LOAD-BEARING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * > **Coalescing.** There is **one open update obligation per waqf** at a time. Concurrent
 * > material changes append to its change-set rather than spawning parallel clocks; the due date
 * > is driven by the **earliest un-filed** change's effective date (the tightest deadline
 * > governs). Filing the update closes the task and clears the change-set; a subsequent change
 * > opens a fresh clock.
 *
 * Four rules, and this module is exactly those four:
 *
 *  1. **One open obligation.** Not one per change. Three asset disposals in a week are ONE update
 *     duty, not three — and the database makes the alternative unrepresentable (migration 40's
 *     partial unique index), so a caller that forgets to coalesce fails loudly rather than
 *     quietly filing three times.
 *  2. **Append, don't spawn.** A later change joins the open duty's change-set.
 *  3. **The EARLIEST un-filed change governs.** Adding a change can TIGHTEN the deadline and can
 *     never loosen it. This is the clause that makes coalescing safe: batching changes into one
 *     duty must never buy the Nazir more time than the tightest of them allowed.
 *  4. **Filing clears the set; the next change opens a fresh clock.** "Clears" is never a DELETE
 *     (this repo's append-only discipline) — each member is MARKED filed, and "un-filed" is the
 *     predicate everything else reads.
 *
 * ── HOW A TIGHTENING IS EXPRESSED, GIVEN THAT DEADLINES ARE FROZEN ───────────────────────────
 * §09 freezes a computed date the moment it is written, and migration 38 enforces that at rest
 * (`deadline_frozen_identity` — the computed identity never moves, NULL included). So a tightening
 * is NOT an UPDATE. It is a NEW `Deadline` row whose `recomputedFromId` names the row it
 * supersedes — §09's own and only correction path — leaving the superseded row on the record as
 * history. `recomputedFromId` is `UNIQUE`, so the supersession structure is a CHAIN: D1 ← D2 ← D3,
 * and the CURRENT deadline is the chain head (the row nothing supersedes). This module decides
 * WHETHER to tighten and names the row to supersede; it writes nothing.
 *
 * ── THE IDENTITY KEY IS PER-WAQF, AND THAT IS §09'S TEXT, NOT A CHOICE MADE HERE ─────────────
 * `TODO(surface)` — §09 says "one open update obligation **per waqf**", and this module implements
 * exactly that. Whether a finer key is right (per government PLATFORM — an Awqaf update is not a
 * Baladi update; or per change KIND — an asset change and a Nazarah change may be different
 * filings) is **NOT RULED ANYWHERE**: it is neither in §09, nor in the BRD, nor in any owner memo
 * entry (verified against the memo's S8 batches 1–5 and both S9 batches, 2026-08-27). It is a
 * question of what the Authority actually accepts as one submission, so it is the owner's and
 * counsel's, not this module's. Per-waqf is implemented; the finer question is carried, unasked
 * and unanswered, and MUST NOT be resolved by a code change.
 */

import { civilDate, type CivilDate } from '../dates/index.js';
import { DomainError } from '../errors.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The refusal vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Closed discriminators for `DEADLINE_STATE_INCOHERENT` raised from the coalescer
 * (`details.refusal`) — the one-code-many-conditions shape again.
 */
export const COALESCE_REFUSALS = [
  /**
   * An update obligation was to be raised or re-anchored with NOTHING un-filed behind it: no
   * reached certificate expiry and no un-filed material change. A statutory duty whose cause
   * nobody can state is the same defensibility failure this code exists for — so it refuses
   * rather than raising a duty with an invented anchor.
   */
  'UPDATE_OBLIGATION_WITHOUT_CAUSE',
  /**
   * A change-set member carries no effective date. CDE-Q2 makes the effective date THE clock, so
   * a dateless member cannot take part in the `min` that decides the governing anchor — and
   * dropping it silently would let the tightest change be the one that is ignored.
   */
  'CHANGE_SET_MEMBER_UNDATED',
  /**
   * The open obligation names a head deadline but no anchor for it (or an anchor with no row).
   * Half a deadline cannot be compared against a candidate anchor, and picking either half as the
   * winner decides which record to disbelieve — the `met ∧ waived` reasoning, one field over.
   */
  'OPEN_OBLIGATION_ANCHOR_INCOHERENT',
] as const;

export type CoalesceRefusal = (typeof COALESCE_REFUSALS)[number];

function refuse(
  refusal: CoalesceRefusal,
  reason: string,
  extra: Readonly<Record<string, unknown>> = {},
): never {
  throw new DomainError('DEADLINE_STATE_INCOHERENT', reason, {
    details: { refusal, ...extra },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The identity key — declared, not chosen
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * §09's coalescing identity: the endowment. Exported as a named constant so the day somebody
 * needs a finer key, the change is visible as a change to this declaration — and so a test can
 * pin it against the migration's partial unique index, which keys on `waqfId` alone.
 */
export const COALESCE_IDENTITY_KEY = 'waqf' as const;

/** §09's canonical code for the 15-business-day update duty. Both triggers raise THIS template. */
export const UPDATE_OBLIGATION_TEMPLATE_CODE = 'GOV-REG-02' as const;

/**
 * The `ComplianceTaskStatus` members that count as OPEN for coalescing — **`compliance`'s ONE
 * definition, imported, never restated here.**
 *
 * ⚠ This was a second copy of the same two-member list in this file's first draft, and the
 * typechecker killed it as a duplicate export on the barrel. That was luck; the defect it caught
 * is real, and worth the note: two lists of "which statuses are open" that must agree, with
 * nothing pinning them, is how a retired duty starts blocking a fresh clock on one code path and
 * not the other. `compliance/instantiation.ts` already owns this list AND already has the test
 * proving it is a strict subset of `enum ComplianceTaskStatus` — so coalescing reads it rather
 * than agreeing with it. Migration 40's partial-index predicate is pinned against THIS constant.
 *
 * `COMPLETED`, `RETIRED` and `NOT_APPLICABLE` are all closed: a retired duty must not block a
 * fresh clock (§09's "a subsequent change opens a fresh clock"), and a `NOT_APPLICABLE` one was
 * never a duty.
 */
export { OPEN_TASK_STATUSES } from '../compliance/instantiation.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** One un-filed member of the change-set. */
export interface UnfiledChange {
  readonly id: string;
  /** CDE-Q2's clock: the change's EFFECTIVE date, never its discovery or recording date. */
  readonly effectiveDate: CivilDate | string | null;
  /** `ASSET` | `BENEFICIARY` | `NAZARAH` — carried for the audit context, never for the arithmetic. */
  readonly kind: string;
}

/** The open update obligation, if one exists, and the deadline currently bound to it. */
export interface OpenUpdateObligation {
  readonly taskId: string;
  /**
   * The CHAIN HEAD deadline bound to this task — the row nothing supersedes — or `null` when the
   * task carries no deadline yet (a task another path created, or one whose compute refused).
   */
  readonly headDeadlineId: string | null;
  /** That head's anchor. Must be present iff `headDeadlineId` is. */
  readonly headAnchor: CivilDate | string | null;
}

export interface CoalesceInput {
  /**
   * The certificate arm's anchor — `Waqf.certificateExpiry` — but ONLY when the sweep has decided
   * it is in scope (reached, or within the configured lead). `null` when the certificate arm is
   * not a cause right now. The sweep decides in-scope-ness; this module only ranks causes.
   */
  readonly certificateAnchor: CivilDate | string | null;
  /** Every un-filed change-set member for this endowment, INCLUDING any just recorded. */
  readonly unfiledChanges: readonly UnfiledChange[];
  readonly openObligation: OpenUpdateObligation | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The decision
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * What the caller must do. Every variant carries the governing anchor, so the caller never
 * recomputes the `min` and cannot disagree with this module about which change won.
 */
export type CoalesceDecision =
  /** No open obligation: raise the duty (reason `EVENT_TRIGGER`) and compute its deadline. */
  | {
      readonly action: 'RAISE';
      readonly governingAnchor: CivilDate;
      readonly governingCause: CoalesceCause;
    }
  /** An open obligation with no deadline: attach one at the governing anchor; raise nothing. */
  | {
      readonly action: 'ATTACH_DEADLINE';
      readonly taskId: string;
      readonly governingAnchor: CivilDate;
      readonly governingCause: CoalesceCause;
    }
  /**
   * An open obligation whose head deadline is already at least as tight as the governing anchor:
   * the change joins the set and the date does not move. §09's "the tightest deadline governs" —
   * read in the direction people forget, which is that a LOOSER new cause changes nothing.
   */
  | {
      readonly action: 'APPEND';
      readonly taskId: string;
      readonly headDeadlineId: string;
      readonly headAnchor: CivilDate;
      readonly governingAnchor: CivilDate;
      readonly governingCause: CoalesceCause;
    }
  /**
   * The governing anchor is EARLIER than the head's: the duty is now tighter than the date on
   * file. A NEW `Deadline` row supersedes `supersedesDeadlineId` via `recomputedFromId` — §09's
   * only correction path — and the superseded row stays as history.
   */
  | {
      readonly action: 'APPEND_AND_TIGHTEN';
      readonly taskId: string;
      readonly supersedesDeadlineId: string;
      readonly fromAnchor: CivilDate;
      readonly governingAnchor: CivilDate;
      readonly governingCause: CoalesceCause;
    };

/** Which cause won the `min`, so the audit trail records WHY the date is the date. */
export interface CoalesceCause {
  readonly kind: 'certificate_expiry' | 'material_change';
  /** The `MaterialChange` id for the change arm; `null` for the certificate arm (it is the waqf's own column). */
  readonly changeId: string | null;
  readonly changeKind: string | null;
}

/**
 * Decide, per §09's four clauses. Pure: no clock, no database, no `Setting`.
 *
 * @throws `DEADLINE_STATE_INCOHERENT` — no cause at all, an undated member, or an open obligation
 *         whose deadline/anchor pair is half-present.
 */
export function coalesceUpdateObligation(input: CoalesceInput): CoalesceDecision {
  const causes: { anchor: CivilDate; cause: CoalesceCause }[] = [];

  if (input.certificateAnchor !== null) {
    causes.push({
      anchor: civilDate(input.certificateAnchor),
      cause: { kind: 'certificate_expiry', changeId: null, changeKind: null },
    });
  }
  for (const change of input.unfiledChanges) {
    if (change.effectiveDate === null) {
      refuse(
        'CHANGE_SET_MEMBER_UNDATED',
        `change-set member ${change.id} carries no effective date. CDE-Q2 (owner-provisional ` +
          '2026-08-25) makes the EFFECTIVE date the clock, so an undated member cannot take part ' +
          'in deciding which change governs — and skipping it could silently drop the tightest ' +
          'one of them.',
        { changeId: change.id, changeKind: change.kind },
      );
    }
    causes.push({
      anchor: civilDate(change.effectiveDate),
      cause: { kind: 'material_change', changeId: change.id, changeKind: change.kind },
    });
  }

  if (causes.length === 0) {
    refuse(
      'UPDATE_OBLIGATION_WITHOUT_CAUSE',
      'no un-filed cause exists for a 15-business-day update obligation: no reached certificate ' +
        'expiry and no un-filed material change. §09 raises this duty from a trigger; a duty ' +
        'whose cause nobody can state has no anchor to count from, and the engine will not ' +
        'invent one.',
      { openObligationTaskId: input.openObligation?.taskId ?? null },
    );
  }

  // The EARLIEST un-filed cause governs — §09's own words, and the direction that matters:
  // batching changes into one duty must never buy more time than the tightest of them allowed.
  // Ties are broken toward the certificate arm only for the audit STORY (identical dates, so the
  // computed deadline is identical either way); sorted on the ISO day string, which orders
  // correctly by construction.
  causes.sort((a, b) => {
    const byDate = String(a.anchor).localeCompare(String(b.anchor));
    if (byDate !== 0) return byDate;
    if (a.cause.kind === b.cause.kind)
      return (a.cause.changeId ?? '').localeCompare(b.cause.changeId ?? '');
    return a.cause.kind === 'certificate_expiry' ? -1 : 1;
  });
  // Non-null: `causes.length === 0` refused above.
  const governing = causes[0] as { anchor: CivilDate; cause: CoalesceCause };

  const open = input.openObligation;
  if (open === null) {
    return Object.freeze({
      action: 'RAISE' as const,
      governingAnchor: governing.anchor,
      governingCause: governing.cause,
    });
  }

  if ((open.headDeadlineId === null) !== (open.headAnchor === null)) {
    refuse(
      'OPEN_OBLIGATION_ANCHOR_INCOHERENT',
      `open update obligation ${open.taskId} presents a half-populated deadline pair ` +
        `(headDeadlineId=${String(open.headDeadlineId)}, headAnchor=${String(open.headAnchor)}). ` +
        'Comparing a candidate anchor against half a record would decide which half to ' +
        'disbelieve; the coalescer refuses instead.',
      { taskId: open.taskId },
    );
  }

  if (open.headDeadlineId === null) {
    return Object.freeze({
      action: 'ATTACH_DEADLINE' as const,
      taskId: open.taskId,
      governingAnchor: governing.anchor,
      governingCause: governing.cause,
    });
  }

  // Non-null: the coherence check above ties the pair together.
  const headAnchor = civilDate(open.headAnchor as CivilDate | string);
  if (String(governing.anchor) < String(headAnchor)) {
    return Object.freeze({
      action: 'APPEND_AND_TIGHTEN' as const,
      taskId: open.taskId,
      supersedesDeadlineId: open.headDeadlineId,
      fromAnchor: headAnchor,
      governingAnchor: governing.anchor,
      governingCause: governing.cause,
    });
  }

  return Object.freeze({
    action: 'APPEND' as const,
    taskId: open.taskId,
    headDeadlineId: open.headDeadlineId,
    headAnchor,
    governingAnchor: governing.anchor,
    governingCause: governing.cause,
  });
}
