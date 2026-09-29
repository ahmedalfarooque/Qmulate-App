/**
 * The BR-1102 reserved-matter approval chain — PURE. (S12-2)
 *
 * §10 §9, verbatim: *"initiator → `family_board` principal approval → `counsel` review → Authority
 * approval/notice where required → `nazir` S*. The engine disables the `nazir` sign action until
 * every prior step is recorded complete, and names the missing step when blocked."*
 *
 * This module is the ONE vocabulary of steps and the ONE reading of "complete". `packages/database`
 * mirrors it in SQL (`qmulate_reserved_matter_chain_defect()`, migration 51) and `packages/api`
 * consumes it for `chainState()` and the refusal; a parity test pins the step names against the SQL.
 *
 * Owner ruling 2026-09-08, verbatim *"every matter"*: counsel review is required on every reserved
 * matter. So `counselReviewRequired` is read but a kinded matter is minted with it `true`, and the
 * database refuses a kinded row with it `false`. Principal consent is required unconditionally. The
 * Authority step is conditional (`authorityNoticeRequired`).
 */

/** The three recorded steps, in chain order. The Nazir's sign is not a step; it is what they gate. */
export const RESERVED_MATTER_CHAIN_STEPS = [
  'PRINCIPAL_CONSENT',
  'COUNSEL_REVIEW',
  'AUTHORITY_NOTICE',
] as const;
export type ReservedMatterChainStep = (typeof RESERVED_MATTER_CHAIN_STEPS)[number];

/** What a screen renders per step. `NOT_REQUIRED` is only ever the Authority step's (and, for a kindless row, every step's). */
export type ChainStepState = 'RECORDED' | 'NOT_RECORDED' | 'NOT_REQUIRED';

export interface ReservedMatterChainRow {
  /** `reservedMatterKind` — `null` ⇒ a kindless RESERVED_MATTER row carries NO chain. */
  readonly reservedMatterKind: string | null;
  readonly counselReviewRequired: boolean;
  readonly authorityNoticeRequired: boolean;
  readonly principalConsentRecordedAt: Date | string | null;
  readonly counselReviewRecordedAt: Date | string | null;
  readonly authorityNoticeRecordedAt: Date | string | null;
}

export interface ReservedMatterChainState {
  readonly principalConsent: ChainStepState;
  readonly counselReview: ChainStepState;
  readonly authorityNotice: ChainStepState;
}

const recorded = (value: Date | string | null): boolean => value !== null && value !== '';

/** Per-step state read off the RECORDED FACTS, never inferred from the decision. */
export function reservedMatterChainState(row: ReservedMatterChainRow): ReservedMatterChainState {
  if (row.reservedMatterKind === null) {
    // A kindless row carries no chain (S12 Q8 — surfaced, not decided).
    return {
      principalConsent: 'NOT_REQUIRED',
      counselReview: 'NOT_REQUIRED',
      authorityNotice: 'NOT_REQUIRED',
    };
  }
  return {
    principalConsent: recorded(row.principalConsentRecordedAt) ? 'RECORDED' : 'NOT_RECORDED',
    counselReview: !row.counselReviewRequired
      ? 'NOT_REQUIRED'
      : recorded(row.counselReviewRecordedAt)
        ? 'RECORDED'
        : 'NOT_RECORDED',
    authorityNotice: !row.authorityNoticeRequired
      ? 'NOT_REQUIRED'
      : recorded(row.authorityNoticeRecordedAt)
        ? 'RECORDED'
        : 'NOT_RECORDED',
  };
}

/** The unrecorded-but-required steps, in chain order. Empty ⇔ the sign may proceed. */
export function missingReservedMatterChainSteps(
  state: ReservedMatterChainState,
): readonly ReservedMatterChainStep[] {
  const missing: ReservedMatterChainStep[] = [];
  if (state.principalConsent === 'NOT_RECORDED') missing.push('PRINCIPAL_CONSENT');
  if (state.counselReview === 'NOT_RECORDED') missing.push('COUNSEL_REVIEW');
  if (state.authorityNotice === 'NOT_RECORDED') missing.push('AUTHORITY_NOTICE');
  return missing;
}

/** The FIRST missing step — the one the SQL twin names — or `null` when complete. */
export function firstMissingReservedMatterChainStep(
  row: ReservedMatterChainRow,
): ReservedMatterChainStep | null {
  return missingReservedMatterChainSteps(reservedMatterChainState(row))[0] ?? null;
}
