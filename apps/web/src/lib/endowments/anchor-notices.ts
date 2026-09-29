/**
 * ⊕ S11-1 — the closed set of outcomes the anchor actions carry back to the endowment record.
 *
 * ⚠ THIS LIVES OUTSIDE `anchor-actions.ts` BECAUSE A `'use server'` MODULE MAY EXPORT ONLY ASYNC
 * FUNCTIONS. Measured on the stage's first E2E leg: `next build` refused the actions file with
 * "Server Actions must be async functions" while `tsc` had passed it — the web TYPECHECK is not the
 * web BUILD, and the constant + predicate below were the offending exports. Both the action (writer)
 * and the record page (reader) import from here, so the vocabulary stays declared once.
 */

export const NOTICE_PARAM = 'notice';

/** The closed set of outcomes the record page will render; anything else is dropped at the reader. */
export const ANCHOR_NOTICES = [
  'anchorSaved',
  'anchorSavedNotComputable',
  'anchorCleared',
  'istibdalSaved',
  'istibdalSavedNotComputable',
  'istibdalCleared',
  // ⊕ S11-2 — the discharge action's outcomes. The four refusals are NOTICES (closed words), not
  // refusal keys: `withRefusal` re-validates against `errors.access.*`, where every GATE_NOT_CLEARED
  // reads as one generic sentence — the wrong sentence for "already discharged".
  'dischargeSaved',
  'dischargeRefusedAlready',
  'dischargeRefusedNoDeadline',
  'dischargeRefusedPrecedes',
  'dischargeRefusedFuture',
  // ⊕ S12-2 · a BR-1102 chain step was recorded on the reserved-matters tab.
  'chainStepRecorded',
  // ⊕ S12-3 · a handover gate was cleared / reopened on the onboarding tab.
  'gateCleared',
  'gateReopened',
  // ⊕ S12-3b · the endowment was just REGISTERED; shown on its onboarding tab, where it lands.
  'intaken',
] as const;
export type AnchorNotice = (typeof ANCHOR_NOTICES)[number];

export function isAnchorNotice(value: unknown): value is AnchorNotice {
  return typeof value === 'string' && (ANCHOR_NOTICES as readonly string[]).includes(value);
}

/** Append a notice to a path — the same shape as `withRefusal`, for the success half. */
export function withNotice(path: string, notice: AnchorNotice): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${NOTICE_PARAM}=${notice}`;
}
