/**
 * `reconciliation/contract.ts` — the vocabulary of a bank reconciliation run.
 *
 * BR-503 ("perform periodic bank reconciliation against the ledger"), NFR-14, FIN-ACC-04, and the
 * ledger ADR §4.4/§4.5 ("fail loud, never silently diverge"). §17's E5 exit clause is:
 * *"a reconciliation run reports a deliberately-planted mismatch."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE THIS MODULE OBEYS, AND IT IS THE ENGINE'S RULE, NOT A NEW ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **IT NEVER GUESSES A MATCH.** A pair is made on an explicit shared reference or not at all.
 *
 * The tempting alternative — pair a statement line with a ledger entry of the same amount on the
 * same day — is exactly the wrong thing for this domain. An endowment with four shops collects four
 * rents of the same amount on the first of the month; heuristically pairing them produces a run that
 * reports "balanced" while two of the four pairings are wrong, and the error surfaces later as an
 * unexplainable arrears figure against a real family. A reconciliation that quietly invents pairings
 * is worse than one that reports work to do: the first hides a discrepancy, the second names it.
 *
 * So an unreferenced line is **UNMATCHED and reported**. That is not a limitation to be improved
 * away later — it is the finding. `SILENT` matching would need a product decision, not a heuristic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CORPUS AND INCOME ARE NEVER NETTED (Binding rule 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A reconciliation that reports one number per account can be "balanced" while a capital receipt
 * silently offsets an income shortfall — corpus covering a gap in ghallah, which is the
 * non-diminution invariant being defeated by arithmetic rather than by an UPDATE. Every total this
 * module produces is therefore split by {@link ReceiptClass}, and the barrel exposes no combined
 * figure that a caller could mistake for the answer.
 */

import type { Money } from '../money.js';

/** Mirrors `ReceiptClass` in `schema.prisma`. An EXPENSE carries none — see {@link LedgerEntry}. */
export const RECEIPT_CLASSES = ['INCOME', 'CAPITAL'] as const;
export type ReceiptClass = (typeof RECEIPT_CLASSES)[number];

/** Mirrors `TxnType` in `schema.prisma`. */
export const LEDGER_DIRECTIONS = ['REVENUE', 'EXPENSE'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/**
 * One row of the platform's own ledger, as the reconciliation sees it.
 *
 * ⚠ `receiptClass` is `null` **exactly when** `direction` is `EXPENSE` — an outflow is neither
 * ghallah nor an aṣl inflow (ADR-0002). {@link assertReconcilable} refuses any other combination
 * rather than reconciling a row whose classification contradicts its direction.
 */
export interface LedgerEntry {
  readonly id: string;
  /** The endowment. Every entry in one run must share it — see {@link assertReconcilable}. */
  readonly waqfId: string;
  /** The dedicated account. Every entry in one run must share it (BR-501). */
  readonly bankAccountId: string;
  readonly direction: LedgerDirection;
  readonly receiptClass: ReceiptClass | null;
  readonly amount: Money;
  /** Calendar day, `yyyy-MM-dd`. Not a matching key — see the module header. */
  readonly valueDate: string;
  /**
   * The bank's own reference for this movement, as recorded on the ledger row.
   *
   * `null` means NOBODY HAS RECORDED ONE — never "look it up by amount". An entry with no reference
   * is reported `UNREFERENCED`, which is a piece of work, not an error.
   */
  readonly bankReference: string | null;
}

/** One line of the bank's statement — the external side, which the platform does not author. */
export interface StatementLine {
  /** The bank's reference. REQUIRED: a statement line with no reference is not a statement line. */
  readonly bankReference: string;
  readonly bankAccountId: string;
  readonly direction: LedgerDirection;
  readonly amount: Money;
  readonly valueDate: string;
}

/** Why a pair could not be made, or was made and disagrees. */
export const RECONCILIATION_FINDINGS = [
  /** On the statement, absent from the ledger. Money moved that the books do not record. */
  'MISSING_FROM_LEDGER',
  /** In the ledger, absent from the statement. The books record money the bank did not move. */
  'MISSING_FROM_STATEMENT',
  /** Paired by reference, but the amounts differ. */
  'AMOUNT_MISMATCH',
  /** Paired by reference, but the direction differs — a receipt booked against a payment. */
  'DIRECTION_MISMATCH',
  /** A ledger entry carries no bank reference, so it is not matchable at all. */
  'UNREFERENCED',
  /** Two ledger entries claim the same bank reference. One movement cannot be two entries. */
  'DUPLICATE_LEDGER_REFERENCE',
  /** Two statement lines carry the same reference. The statement contradicts itself. */
  'DUPLICATE_STATEMENT_REFERENCE',
] as const;
export type ReconciliationFinding = (typeof RECONCILIATION_FINDINGS)[number];

export function isReconciliationFinding(value: unknown): value is ReconciliationFinding {
  return (
    typeof value === 'string' && (RECONCILIATION_FINDINGS as readonly string[]).includes(value)
  );
}

/**
 * One thing a human has to look at. Deliberately NOT called an "error": several of these are
 * ordinary timing (a cheque presented after period end) and the run does not know which.
 */
export interface ReconciliationException {
  readonly finding: ReconciliationFinding;
  /** The ledger row, when the finding has one. */
  readonly ledgerEntryId: string | null;
  /** The statement reference, when the finding has one. */
  readonly bankReference: string | null;
  readonly direction: LedgerDirection;
  /** The ledger's figure, when there is one. */
  readonly ledgerAmount: Money | null;
  /** The bank's figure, when there is one. */
  readonly statementAmount: Money | null;
  /**
   * `null` for an EXPENSE and for a statement line the ledger never saw — in the second case the
   * class is genuinely unknown, and guessing it is how a capital receipt gets treated as income.
   */
  readonly receiptClass: ReceiptClass | null;
}

/** A confirmed pair: one ledger entry, one statement line, same reference, direction and amount. */
export interface ReconciledPair {
  readonly ledgerEntryId: string;
  readonly bankReference: string;
  readonly direction: LedgerDirection;
  readonly amount: Money;
  readonly receiptClass: ReceiptClass | null;
}

/**
 * Totals for ONE receipt class. Split by class on purpose (Binding rule 1) — a single combined
 * figure lets a capital receipt offset an income shortfall inside the arithmetic.
 */
export interface ClassTotals {
  readonly reconciledIn: Money;
  readonly unreconciledIn: Money;
}

export interface ReconciliationResult {
  readonly waqfId: string;
  readonly bankAccountId: string;
  /**
   * TRUE only when there are NO exceptions at all. There is no tolerance and no "close enough":
   * the ledger ADR §4.5 sets the tolerance for classified balances at EXACT, and a tolerance band
   * on a fiduciary reconciliation is a place for a discrepancy to live permanently.
   */
  readonly balanced: boolean;
  readonly pairs: readonly ReconciledPair[];
  /** Ordered by {@link RECONCILIATION_FINDINGS}, then by reference — deterministic for a report. */
  readonly exceptions: readonly ReconciliationException[];
  /** Inflows only, by class. Outflows are not "income" of any class and are counted separately. */
  readonly income: ClassTotals;
  readonly capital: ClassTotals;
  readonly expense: ClassTotals;
}
