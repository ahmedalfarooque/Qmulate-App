/**
 * `reconciliation/` — BR-503 / NFR-14 / FIN-ACC-04: **the bank statement and the ledger must agree,
 * and where they do not, the run says so by name.** **E5.**
 *
 * The sub-barrel and the only door into the module. Entry points: {@link reconcile} (the pure run),
 * {@link assertReconcilable} (the scope and coherence refusals, applied before any arithmetic),
 * {@link exceptionsOf} / {@link isBalanced} / {@link hasUnreconciled} (reading a result).
 *
 * ⚠ **IT NEVER GUESSES A MATCH.** A pair is made on an explicit shared bank reference or not at all.
 * Pairing on amount-and-date would silently mis-pair four identical rents on the first of the month
 * and report the account balanced. An unreferenced entry is a FINDING, not a gap to be closed by a
 * heuristic.
 *
 * ⚠ **IT NEVER NETS CORPUS AGAINST INCOME** (Binding rule 1). Every total is split by receipt class,
 * and the module exposes no single combined figure — one number per account can read as "balanced"
 * while a capital receipt covers an income shortfall inside the arithmetic.
 *
 * ⚠ **NO TOLERANCE BAND.** The ledger ADR §4.5 sets the tolerance for classified balances at EXACT.
 * A band on a fiduciary reconciliation is where a permanent discrepancy takes up residence.
 *
 * ⚠ **WHAT IS NOT HERE:** writing `Transaction.reconciledAt`, fetching a statement, and the
 * period/cadence rules. This module is pure — it reads two lists and returns a verdict. Persistence
 * and the FIN-ACC-04 cadence belong to `packages/api` and `packages/jobs`.
 */

export {
  LEDGER_DIRECTIONS,
  RECEIPT_CLASSES,
  RECONCILIATION_FINDINGS,
  isReconciliationFinding,
} from './contract.js';
export type {
  ClassTotals,
  LedgerDirection,
  LedgerEntry,
  ReceiptClass,
  ReconciledPair,
  ReconciliationException,
  ReconciliationFinding,
  ReconciliationResult,
  StatementLine,
} from './contract.js';

export {
  assertReconcilable,
  exceptionsOf,
  hasUnreconciled,
  isBalanced,
  reconcile,
} from './reconcile.js';
export type { ReconcileInput } from './reconcile.js';
