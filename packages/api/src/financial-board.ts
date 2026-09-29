/**
 * `financial-board.ts` — the `/financials` screen's STATE SELECTION, as one pure function.
 * **S11 · 2c (E10).**
 *
 * ── WHY IT LIVES HERE AND NOT IN `apps/web` ────────────────────────────────────────────────────
 * The same reason `compliance-board.ts` does, and the reason is measured rather than stylistic:
 * `apps/web` has **no unit-test runner at all** — no `test` script, no vitest config, and `ci.yml`
 * puts `apps/*` outside the suite-existence gate on purpose. A rule that decides WHICH SENTENCE a
 * Nazir reads about an empty financial position is not chrome; it is a claim about the endowment. So
 * it is written once, here, where a unit test can drive every combination including the ones no
 * fixture can reach, and the screen renders what it is handed.
 *
 * ⚠ Without this move the predicate's only executioner would have been the E2E leg — and a rule that
 * can only be tested through a browser is a rule that goes untested the first time the browser leg is
 * slow, flaky or skipped.
 */

/** Which empty state a financial board shows, or `null` when there is a position to render. */
export type FinancialEmptyReason = 'DIRECT_USE' | 'DIRECT_USE_UNRECORDED' | 'NO_TRANSACTIONS';

/**
 * WHICH empty state applies. Two decisions are encoded here and both are load-bearing.
 *
 * **1 · The direct-use axis is checked FIRST, and it is THREE-VALUED.** `true` means the
 * beneficiaries use the asset itself and no ghallah is distributed, which §14 §5.1(3) requires the
 * report to STATE rather than show zeros. `null` means **UNRECORDED** — never "not direct use"
 * (owner ruling 2026-08-25, the two-axis classification) — so it is reported as
 * `DIRECT_USE_UNRECORDED` and the question is left open rather than resolved to a `false`.
 *
 * **2 · Emptiness is keyed on the ACCOUNT COUNT, not on "the total is zero".** The two are
 * indistinguishable on the current fixture, because bank accounts are DERIVED from the account
 * references appearing on transactions — so an endowment with no transactions has no account either.
 * They diverge the moment a real endowment holds a linked dedicated account sitting at a nil
 * balance: a screen keyed on the sum would tell that Nazir to *"link the dedicated waqf account
 * first"*, which is a FALSE statement about an account that already exists. ⚠ The fixture cannot
 * tell these two predicates apart, so this choice is REASONED rather than measured — said plainly
 * here so the next reader knows which kind of claim it is.
 */
export function deriveFinancialEmptyReason(
  accountCount: number,
  directUtilization: boolean | null,
): FinancialEmptyReason | null {
  if (directUtilization === true) return 'DIRECT_USE';
  if (accountCount > 0) return null;
  if (directUtilization === null) return 'DIRECT_USE_UNRECORDED';
  return 'NO_TRANSACTIONS';
}
