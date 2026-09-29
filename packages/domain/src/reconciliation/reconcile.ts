/**
 * `reconciliation/reconcile.ts` — the pure run. No I/O, no clock, no database.
 *
 * §17's E5 exit clause: *"a reconciliation run reports a deliberately-planted mismatch."* The word
 * that carries the weight is **reports**. This module's whole job is to turn a divergence into a
 * named, attributable line a Nazir can act on — never into a silently absorbed difference.
 *
 * Read `./contract.ts`'s header first: it states the two rules this file implements — **never guess
 * a match**, and **never net corpus against income**.
 */

import { DomainError } from '../errors.js';
import { ZERO, add, compare, equals, type Money } from '../money.js';

import {
  RECONCILIATION_FINDINGS,
  type ClassTotals,
  type LedgerEntry,
  type ReceiptClass,
  type ReconciledPair,
  type ReconciliationException,
  type ReconciliationFinding,
  type ReconciliationResult,
  type StatementLine,
} from './contract.js';

export interface ReconcileInput {
  readonly waqfId: string;
  readonly bankAccountId: string;
  readonly ledgerEntries: readonly LedgerEntry[];
  readonly statementLines: readonly StatementLine[];
}

/**
 * Refuses an input that could not describe one account's activity, BEFORE reconciling any of it.
 *
 * ⚠ THIS IS THE DOMAIN-LAYER MIRROR OF G-2, AND IT IS NOT REDUNDANT WITH THE DATABASE. Migration 19
 * makes a cross-endowment *row* unrepresentable; this refuses a cross-endowment *run* — a caller
 * that gathered entries with a wrong `where` clause, or that reconciles two accounts as one. A
 * reconciliation is the one place where mixing two endowments' movements would look like ordinary
 * arithmetic and produce a plausible total (BR-501 / KPI 2).
 *
 * It also refuses a row whose classification contradicts its direction, because reconciling such a
 * row means deciding what it is, and that is ADR-0002's question, not this module's.
 */
export function assertReconcilable(input: ReconcileInput): void {
  const foreignEntries = input.ledgerEntries.filter(
    (entry) => entry.waqfId !== input.waqfId || entry.bankAccountId !== input.bankAccountId,
  );
  if (foreignEntries.length > 0) {
    throw new DomainError(
      'RECONCILIATION_SCOPE_MIXED',
      `a reconciliation of ${input.bankAccountId} (${input.waqfId}) was given ` +
        `${String(foreignEntries.length)} ledger entr${foreignEntries.length === 1 ? 'y' : 'ies'} ` +
        `belonging to another endowment or account. Each endowment's dedicated account is ` +
        `reconciled on its own (BR-501 / KPI 2): mixing them is the one place where commingling ` +
        `looks like ordinary arithmetic and produces a plausible total.`,
      {
        details: {
          waqfId: input.waqfId,
          bankAccountId: input.bankAccountId,
          offendingLedgerEntryIds: foreignEntries.map((entry) => entry.id),
        },
      },
    );
  }

  const foreignLines = input.statementLines.filter(
    (line) => line.bankAccountId !== input.bankAccountId,
  );
  if (foreignLines.length > 0) {
    throw new DomainError(
      'RECONCILIATION_SCOPE_MIXED',
      `a reconciliation of ${input.bankAccountId} was given ${String(foreignLines.length)} ` +
        `statement line(s) drawn on another account. A statement belongs to one account, and ` +
        `reconciling two as one is commingling however coherent the arithmetic looks (BR-501).`,
      {
        details: {
          bankAccountId: input.bankAccountId,
          offendingBankReferences: foreignLines.map((line) => line.bankReference),
        },
      },
    );
  }

  // ADR-0002's shape, asserted rather than assumed: REVENUE carries a class, EXPENSE carries none.
  const incoherent = input.ledgerEntries.filter((entry) =>
    entry.direction === 'REVENUE' ? entry.receiptClass === null : entry.receiptClass !== null,
  );
  if (incoherent.length > 0) {
    throw new DomainError(
      'RECEIPT_CLASS_INCOHERENT',
      `${String(incoherent.length)} ledger entr${incoherent.length === 1 ? 'y' : 'ies'} carr` +
        `${incoherent.length === 1 ? 'ies' : 'y'} a classification that contradicts its ` +
        `direction: a REVENUE entry must carry a receiptClass and an EXPENSE must carry none ` +
        `(ADR-0002). The run HALTS rather than deciding which the row is — that is the ` +
        `classification question, and it belongs to the product owner and the Sharia review.`,
      {
        details: {
          offendingLedgerEntryIds: incoherent.map((entry) => entry.id),
          rule: 'a REVENUE entry carries a receiptClass; an EXPENSE carries none (ADR-0002)',
        },
      },
    );
  }
}

/** Findings sort in declaration order — most serious first — then by reference, for a stable report. */
const FINDING_ORDER = new Map<ReconciliationFinding, number>(
  RECONCILIATION_FINDINGS.map((finding, index) => [finding, index]),
);

function sortExceptions(
  exceptions: readonly ReconciliationException[],
): readonly ReconciliationException[] {
  return [...exceptions].sort((a, b) => {
    const byFinding = (FINDING_ORDER.get(a.finding) ?? 0) - (FINDING_ORDER.get(b.finding) ?? 0);
    if (byFinding !== 0) return byFinding;
    const aKey = a.bankReference ?? a.ledgerEntryId ?? '';
    const bKey = b.bankReference ?? b.ledgerEntryId ?? '';
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

/** Indexes a list by reference, separating the duplicates rather than letting the last one win. */
function indexByReference<T>(
  items: readonly T[],
  reference: (item: T) => string | null,
): { unique: Map<string, T>; duplicated: Map<string, T[]> } {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = reference(item);
    if (key === null) continue;
    const bucket = grouped.get(key);
    if (bucket === undefined) grouped.set(key, [item]);
    else bucket.push(item);
  }
  const unique = new Map<string, T>();
  const duplicated = new Map<string, T[]>();
  for (const [key, bucket] of grouped) {
    // ⚠ A duplicate is NOT resolved by taking the first. Two ledger rows claiming one bank movement
    // is a real finding (a double-entry of the same receipt), and picking one would report the
    // register as balanced while the money is counted twice.
    if (bucket.length === 1 && bucket[0] !== undefined) unique.set(key, bucket[0]);
    else duplicated.set(key, bucket);
  }
  return { unique, duplicated };
}

/**
 * Reconcile one account for one period.
 *
 * Deterministic and total: for any input that passes {@link assertReconcilable} it returns a result,
 * and every ledger entry and every statement line appears exactly once — as a pair, or as an
 * exception. Nothing is dropped, which is what makes "no orphaned entries" (BR-503 / NFR-14) a
 * property of the output rather than a hope about the caller.
 */
export function reconcile(input: ReconcileInput): ReconciliationResult {
  assertReconcilable(input);

  const ledger = indexByReference(input.ledgerEntries, (entry) => entry.bankReference);
  const statement = indexByReference(input.statementLines, (line) => line.bankReference);

  const pairs: ReconciledPair[] = [];
  const exceptions: ReconciliationException[] = [];

  // 1 · Ledger entries with no reference at all — not matchable, and said so.
  for (const entry of input.ledgerEntries) {
    if (entry.bankReference !== null) continue;
    exceptions.push({
      finding: 'UNREFERENCED',
      ledgerEntryId: entry.id,
      bankReference: null,
      direction: entry.direction,
      ledgerAmount: entry.amount,
      statementAmount: null,
      receiptClass: entry.receiptClass,
    });
  }

  // 2 · Contradictory references on either side.
  for (const [reference, bucket] of ledger.duplicated) {
    for (const entry of bucket) {
      exceptions.push({
        finding: 'DUPLICATE_LEDGER_REFERENCE',
        ledgerEntryId: entry.id,
        bankReference: reference,
        direction: entry.direction,
        ledgerAmount: entry.amount,
        statementAmount: null,
        receiptClass: entry.receiptClass,
      });
    }
  }
  for (const [reference, bucket] of statement.duplicated) {
    for (const line of bucket) {
      exceptions.push({
        finding: 'DUPLICATE_STATEMENT_REFERENCE',
        ledgerEntryId: null,
        bankReference: reference,
        direction: line.direction,
        ledgerAmount: null,
        statementAmount: line.amount,
        // The class of a line the ledger never matched is genuinely unknown. Guessing it is how a
        // capital receipt gets counted as income.
        receiptClass: null,
      });
    }
  }

  // 3 · The matchable population: one ledger entry and one statement line per reference.
  for (const [reference, entry] of ledger.unique) {
    const line = statement.unique.get(reference);
    if (line === undefined) {
      // Absent from the statement — unless the statement had it as a DUPLICATE, in which case that
      // is already reported and re-reporting it here would double-count one movement.
      if (!statement.duplicated.has(reference)) {
        exceptions.push({
          finding: 'MISSING_FROM_STATEMENT',
          ledgerEntryId: entry.id,
          bankReference: reference,
          direction: entry.direction,
          ledgerAmount: entry.amount,
          statementAmount: null,
          receiptClass: entry.receiptClass,
        });
      }
      continue;
    }

    if (entry.direction !== line.direction) {
      exceptions.push({
        finding: 'DIRECTION_MISMATCH',
        ledgerEntryId: entry.id,
        bankReference: reference,
        direction: entry.direction,
        ledgerAmount: entry.amount,
        statementAmount: line.amount,
        receiptClass: entry.receiptClass,
      });
      continue;
    }

    // EXACT. No tolerance band — the ledger ADR §4.5 sets it at exact for classified balances, and a
    // band is where a permanent discrepancy takes up residence.
    if (!equals(entry.amount, line.amount)) {
      exceptions.push({
        finding: 'AMOUNT_MISMATCH',
        ledgerEntryId: entry.id,
        bankReference: reference,
        direction: entry.direction,
        ledgerAmount: entry.amount,
        statementAmount: line.amount,
        receiptClass: entry.receiptClass,
      });
      continue;
    }

    pairs.push({
      ledgerEntryId: entry.id,
      bankReference: reference,
      direction: entry.direction,
      amount: entry.amount,
      receiptClass: entry.receiptClass,
    });
  }

  // 4 · Statement lines the ledger does not have. The most serious class: money moved through a
  //     dedicated waqf account and the books do not record it.
  for (const [reference, line] of statement.unique) {
    if (ledger.unique.has(reference) || ledger.duplicated.has(reference)) continue;
    exceptions.push({
      finding: 'MISSING_FROM_LEDGER',
      ledgerEntryId: null,
      bankReference: reference,
      direction: line.direction,
      ledgerAmount: null,
      statementAmount: line.amount,
      receiptClass: null,
    });
  }

  return {
    waqfId: input.waqfId,
    bankAccountId: input.bankAccountId,
    balanced: exceptions.length === 0,
    pairs,
    exceptions: sortExceptions(exceptions),
    income: totalsFor(pairs, exceptions, 'REVENUE', 'INCOME'),
    capital: totalsFor(pairs, exceptions, 'REVENUE', 'CAPITAL'),
    expense: totalsFor(pairs, exceptions, 'EXPENSE', null),
  };
}

/**
 * Totals for one (direction, class) bucket.
 *
 * ⚠ `unreconciledIn` counts the LEDGER's figure, and only where the ledger has one. A statement line
 * the ledger never saw has no class — including it in a class total would be exactly the guess this
 * module refuses. Such lines are `MISSING_FROM_LEDGER` exceptions and are visible there; they are
 * deliberately NOT summed into any class, so a caller cannot read a class total as "the account".
 */
function totalsFor(
  pairs: readonly ReconciledPair[],
  exceptions: readonly ReconciliationException[],
  direction: 'REVENUE' | 'EXPENSE',
  receiptClass: ReceiptClass | null,
): ClassTotals {
  const matches = (entryClass: ReceiptClass | null, entryDirection: string): boolean =>
    entryDirection === direction && entryClass === receiptClass;

  const reconciledIn = pairs
    .filter((pair) => matches(pair.receiptClass, pair.direction))
    .reduce<Money>((total, pair) => add(total, pair.amount), ZERO);

  const unreconciledIn = exceptions
    .filter(
      (exception) =>
        exception.ledgerAmount !== null && matches(exception.receiptClass, exception.direction),
    )
    .reduce<Money>((total, exception) => add(total, exception.ledgerAmount as Money), ZERO);

  return { reconciledIn, unreconciledIn };
}

/** True when the run found nothing to look at. Spelled out so a caller need not re-derive it. */
export function isBalanced(result: ReconciliationResult): boolean {
  return result.balanced && result.exceptions.length === 0;
}

/** The exceptions of one kind, for a report that groups them. */
export function exceptionsOf(
  result: ReconciliationResult,
  finding: ReconciliationFinding,
): readonly ReconciliationException[] {
  return result.exceptions.filter((exception) => exception.finding === finding);
}

/**
 * The net UNRECONCILED position of one class, as a signed comparison against zero.
 *
 * Exposed as a comparison rather than as a number so a caller cannot print "the difference" and
 * treat it as the answer: with `MISSING_FROM_LEDGER` lines deliberately outside every class total,
 * no single scalar describes this account, and one that looked like it would be misleading.
 */
export function hasUnreconciled(totals: ClassTotals): boolean {
  return compare(totals.unreconciledIn, ZERO) !== 0;
}
