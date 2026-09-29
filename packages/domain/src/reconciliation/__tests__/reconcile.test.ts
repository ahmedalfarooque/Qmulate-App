/**
 * E5 · the reconciliation run — BR-503 / NFR-14 / FIN-ACC-04.
 *
 * §17's E5 exit clause is *"a reconciliation run reports a deliberately-planted mismatch"*, and the
 * word carrying the weight is **reports**. So the tests below plant each mismatch deliberately and
 * assert the NAMED finding — never merely that `balanced` went false, which would pass for a run
 * that noticed something and could not say what.
 *
 * Three properties this file exists to hold, all of them refusals rather than features:
 *  1. **No guessed matches.** Four identical rents on the same day stay four exceptions.
 *  2. **No netting of corpus against income** (Binding rule 1).
 *  3. **No tolerance band** — one halala apart is a mismatch.
 */

import { describe, expect, it } from 'vitest';

import { money } from '../../money.js';
import {
  assertReconcilable,
  exceptionsOf,
  isBalanced,
  reconcile,
  type LedgerEntry,
  type ReconcileInput,
  type StatementLine,
} from '../index.js';
import { isDomainError, type DomainError } from '../../errors.js';

const WAQF = 'waqf-001';
const ACCOUNT = 'bankacct-fake-acct-w1';

function entry(overrides: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    waqfId: WAQF,
    bankAccountId: ACCOUNT,
    direction: 'REVENUE',
    receiptClass: 'INCOME',
    amount: money('1000.00'),
    valueDate: '2026-03-01',
    bankReference: `REF-${overrides.id}`,
    ...overrides,
  };
}

function line(overrides: Partial<StatementLine> & { bankReference: string }): StatementLine {
  return {
    bankAccountId: ACCOUNT,
    direction: 'REVENUE',
    amount: money('1000.00'),
    valueDate: '2026-03-01',
    ...overrides,
  };
}

function run(
  ledgerEntries: readonly LedgerEntry[],
  statementLines: readonly StatementLine[],
): ReturnType<typeof reconcile> {
  const input: ReconcileInput = {
    waqfId: WAQF,
    bankAccountId: ACCOUNT,
    ledgerEntries,
    statementLines,
  };
  return reconcile(input);
}

function caught(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (isDomainError(error)) return error;
    throw error;
  }
  throw new Error('expected a DomainError, and nothing was thrown');
}

describe('the clean case — so every failure below is a real subtraction', () => {
  it('pairs on the shared reference and reports nothing', () => {
    const result = run(
      [entry({ id: 'rev-a' }), entry({ id: 'rev-b', bankReference: 'REF-b' })],
      [line({ bankReference: 'REF-rev-a' }), line({ bankReference: 'REF-b' })],
    );
    expect(result.balanced).toBe(true);
    expect(isBalanced(result)).toBe(true);
    expect(result.exceptions).toEqual([]);
    expect(result.pairs.map((p) => p.ledgerEntryId).sort()).toEqual(['rev-a', 'rev-b']);
    expect(result.income.reconciledIn.toString()).toBe('2000');
    expect(result.income.unreconciledIn.toString()).toBe('0');
  });

  it('every input appears exactly once — as a pair or as an exception, never dropped', () => {
    // BR-503 / NFR-14's "no orphaned entries" as a property of the OUTPUT, not a hope about the
    // caller. A reconciliation that loses a row is worse than one that reports it.
    const ledger = [
      entry({ id: 'paired' }),
      entry({ id: 'only-ledger', bankReference: 'REF-only-ledger' }),
      entry({ id: 'no-ref', bankReference: null }),
    ];
    const statement = [
      line({ bankReference: 'REF-paired' }),
      line({ bankReference: 'REF-only-bank' }),
    ];
    const result = run(ledger, statement);

    const accountedLedger = new Set([
      ...result.pairs.map((p) => p.ledgerEntryId),
      ...result.exceptions.map((e) => e.ledgerEntryId).filter((id): id is string => id !== null),
    ]);
    expect([...accountedLedger].sort()).toEqual(['no-ref', 'only-ledger', 'paired']);

    const accountedRefs = new Set([
      ...result.pairs.map((p) => p.bankReference),
      ...result.exceptions.map((e) => e.bankReference).filter((r): r is string => r !== null),
    ]);
    for (const statementLine of statement) {
      expect(accountedRefs.has(statementLine.bankReference)).toBe(true);
    }
  });
});

describe('the planted mismatches — each REPORTED BY NAME (§17 E5 exit)', () => {
  it('MISSING_FROM_LEDGER · money moved through the account and the books do not record it', () => {
    // The most serious finding available: the bank says a movement happened on a dedicated waqf
    // account and the ledger has never heard of it.
    const result = run(
      [entry({ id: 'rev-a' })],
      [
        line({ bankReference: 'REF-rev-a' }),
        line({ bankReference: 'REF-ghost', amount: money('7500.00') }),
      ],
    );
    expect(result.balanced).toBe(false);
    const found = exceptionsOf(result, 'MISSING_FROM_LEDGER');
    expect(found).toHaveLength(1);
    expect(found[0]?.bankReference).toBe('REF-ghost');
    expect(found[0]?.statementAmount?.toString()).toBe('7500');
    expect(found[0]?.ledgerEntryId).toBeNull();
    // ⚠ AND ITS CLASS IS NULL, DELIBERATELY. The ledger never saw this line, so nobody has
    // classified it; assigning one here is exactly the guess ADR-0002 forbids.
    expect(found[0]?.receiptClass).toBeNull();
    // …so it is in NO class total. A caller cannot read `income` as "the account".
    expect(result.income.unreconciledIn.toString()).toBe('0');
    expect(result.capital.unreconciledIn.toString()).toBe('0');
  });

  it('MISSING_FROM_STATEMENT · the books record money the bank did not move', () => {
    const result = run(
      [entry({ id: 'rev-a' }), entry({ id: 'rev-b', bankReference: 'REF-b' })],
      [line({ bankReference: 'REF-rev-a' })],
    );
    const found = exceptionsOf(result, 'MISSING_FROM_STATEMENT');
    expect(found).toHaveLength(1);
    expect(found[0]?.ledgerEntryId).toBe('rev-b');
    expect(found[0]?.statementAmount).toBeNull();
    // The ledger's own figure IS classified, so it counts against its class.
    expect(result.income.unreconciledIn.toString()).toBe('1000');
  });

  it('AMOUNT_MISMATCH · ONE HALALA apart is a mismatch — there is no tolerance band', () => {
    // The ledger ADR §4.5 sets tolerance at EXACT for classified balances. A band is where a
    // permanent discrepancy takes up residence, so the smallest representable difference is the
    // right subject.
    const result = run(
      [entry({ id: 'rev-a', amount: money('1000.00') })],
      [line({ bankReference: 'REF-rev-a', amount: money('1000.01') })],
    );
    const found = exceptionsOf(result, 'AMOUNT_MISMATCH');
    expect(found).toHaveLength(1);
    expect(found[0]?.ledgerAmount?.toString()).toBe('1000');
    expect(found[0]?.statementAmount?.toString()).toBe('1000.01');
    expect(result.pairs).toEqual([]);
  });

  it('DIRECTION_MISMATCH · a receipt booked against a payment', () => {
    const result = run(
      [entry({ id: 'exp-a', direction: 'EXPENSE', receiptClass: null })],
      [line({ bankReference: 'REF-exp-a', direction: 'REVENUE' })],
    );
    const found = exceptionsOf(result, 'DIRECTION_MISMATCH');
    expect(found).toHaveLength(1);
    expect(found[0]?.ledgerEntryId).toBe('exp-a');
    // Reported as a direction disagreement, NOT silently re-signed into an amount difference.
    expect(exceptionsOf(result, 'AMOUNT_MISMATCH')).toEqual([]);
  });

  it('UNREFERENCED · a ledger entry nobody gave a bank reference is not matchable, and says so', () => {
    const result = run([entry({ id: 'rev-a', bankReference: null })], []);
    const found = exceptionsOf(result, 'UNREFERENCED');
    expect(found).toHaveLength(1);
    expect(found[0]?.ledgerEntryId).toBe('rev-a');
    expect(found[0]?.bankReference).toBeNull();
  });

  it('DUPLICATE_LEDGER_REFERENCE · two entries claiming one movement is not resolved by picking one', () => {
    // The natural implementation indexes by reference and lets the last write win, which would
    // report the register balanced while the same receipt is counted twice.
    const result = run(
      [
        entry({ id: 'rev-a', bankReference: 'REF-dup' }),
        entry({ id: 'rev-b', bankReference: 'REF-dup' }),
      ],
      [line({ bankReference: 'REF-dup' })],
    );
    const found = exceptionsOf(result, 'DUPLICATE_LEDGER_REFERENCE');
    expect(found).toHaveLength(2);
    expect(found.map((e) => e.ledgerEntryId).sort()).toEqual(['rev-a', 'rev-b']);
    // …and neither is silently paired off against the single statement line.
    expect(result.pairs).toEqual([]);
    // The statement line is NOT additionally reported as MISSING_FROM_LEDGER — that would report
    // one movement twice, under two different findings.
    expect(exceptionsOf(result, 'MISSING_FROM_LEDGER')).toEqual([]);
  });

  it('DUPLICATE_STATEMENT_REFERENCE · the statement contradicting itself is the bank’s finding, reported', () => {
    const result = run(
      [entry({ id: 'rev-a', bankReference: 'REF-dup' })],
      [
        line({ bankReference: 'REF-dup' }),
        line({ bankReference: 'REF-dup', amount: money('50.00') }),
      ],
    );
    expect(exceptionsOf(result, 'DUPLICATE_STATEMENT_REFERENCE')).toHaveLength(2);
    expect(result.pairs).toEqual([]);
    // The ledger entry is reported too — as MISSING_FROM_STATEMENT it would be misleading (the
    // statement has it, twice), so it must NOT be.
    expect(exceptionsOf(result, 'MISSING_FROM_STATEMENT')).toEqual([]);
  });
});

describe('IT NEVER GUESSES A MATCH — the property that makes the rest trustworthy', () => {
  it('four identical rents on one day stay four exceptions, not four guessed pairs', () => {
    // The real shape: an endowment with four shops, same rent, same day. A heuristic pairing on
    // amount-and-date reports this account BALANCED with every pairing arbitrary — and the error
    // surfaces later as an unexplainable arrears figure against a real family.
    const same = { amount: money('5000.00'), valueDate: '2026-03-01' } as const;
    const result = run(
      ['a', 'b', 'c', 'd'].map((k) => entry({ id: `rev-${k}`, bankReference: null, ...same })),
      ['w', 'x', 'y', 'z'].map((k) => line({ bankReference: `BANK-${k}`, ...same })),
    );

    expect(result.balanced).toBe(false);
    expect(result.pairs).toEqual([]);
    expect(exceptionsOf(result, 'UNREFERENCED')).toHaveLength(4);
    expect(exceptionsOf(result, 'MISSING_FROM_LEDGER')).toHaveLength(4);
  });

  it('a matching amount and date with DIFFERENT references is not a pair', () => {
    const result = run(
      [entry({ id: 'rev-a', bankReference: 'LEDGER-REF' })],
      [line({ bankReference: 'BANK-REF' })],
    );
    expect(result.pairs).toEqual([]);
    expect(exceptionsOf(result, 'MISSING_FROM_STATEMENT')).toHaveLength(1);
    expect(exceptionsOf(result, 'MISSING_FROM_LEDGER')).toHaveLength(1);
  });
});

describe('CORPUS IS NEVER NETTED AGAINST INCOME (Binding rule 1)', () => {
  it('a capital receipt cannot cover an income shortfall inside the totals', () => {
    // The shape this split exists to make impossible: income short by 1,000 and capital over by
    // 1,000. A single per-account figure nets to zero and reads BALANCED — corpus quietly covering
    // a gap in ghallah, which is the non-diminution invariant defeated by arithmetic rather than
    // by an UPDATE.
    const result = run(
      [
        entry({ id: 'inc-missing', receiptClass: 'INCOME', amount: money('1000.00') }),
        entry({
          id: 'cap-paired',
          receiptClass: 'CAPITAL',
          amount: money('1000.00'),
          bankReference: 'REF-cap',
        }),
      ],
      [line({ bankReference: 'REF-cap', amount: money('1000.00') })],
    );

    expect(result.balanced).toBe(false);
    // The two classes are reported SEPARATELY and neither cancels the other.
    expect(result.income.unreconciledIn.toString()).toBe('1000');
    expect(result.income.reconciledIn.toString()).toBe('0');
    expect(result.capital.unreconciledIn.toString()).toBe('0');
    expect(result.capital.reconciledIn.toString()).toBe('1000');
    // And there is no combined figure on the result at all — asserted structurally, so a later
    // "convenience total" cannot be added without this going red.
    expect(result).not.toHaveProperty('total');
    expect(result).not.toHaveProperty('difference');
    expect(result).not.toHaveProperty('netUnreconciled');
  });

  it('an EXPENSE is its own bucket — it is neither ghallah nor an asl inflow', () => {
    const result = run(
      [entry({ id: 'exp-a', direction: 'EXPENSE', receiptClass: null, amount: money('300.00') })],
      [],
    );
    expect(result.expense.unreconciledIn.toString()).toBe('300');
    expect(result.income.unreconciledIn.toString()).toBe('0');
    expect(result.capital.unreconciledIn.toString()).toBe('0');
  });
});

describe('the refusals — applied BEFORE any arithmetic', () => {
  it('refuses a run mixing two endowments — the domain-layer mirror of G-2', () => {
    const error = caught(() =>
      run([entry({ id: 'rev-a' }), entry({ id: 'rev-foreign', waqfId: 'waqf-002' })], []),
    );
    expect(error.code).toBe('RECONCILIATION_SCOPE_MIXED');
    expect(error.messageKey).toBe('errors.domain.RECONCILIATION_SCOPE_MIXED');
    expect(error.details?.['offendingLedgerEntryIds']).toEqual(['rev-foreign']);
  });

  it('refuses a run mixing two accounts of the SAME endowment', () => {
    // Not the same finding as mixing endowments, and worth its own subject: BR-501 requires
    // dedicated accounts, so two accounts reconciled as one is still commingling, even inside one
    // waqf.
    const error = caught(() =>
      run(
        [entry({ id: 'rev-a' }), entry({ id: 'rev-other', bankAccountId: 'bankacct-other' })],
        [],
      ),
    );
    expect(error.code).toBe('RECONCILIATION_SCOPE_MIXED');
  });

  it('refuses a statement line belonging to another account', () => {
    const error = caught(() =>
      run(
        [entry({ id: 'rev-a' })],
        [line({ bankReference: 'REF-x', bankAccountId: 'bankacct-other' })],
      ),
    );
    expect(error.code).toBe('RECONCILIATION_SCOPE_MIXED');
    expect(error.details?.['offendingBankReferences']).toEqual(['REF-x']);
  });

  it('refuses a REVENUE entry with no classification, and an EXPENSE that carries one', () => {
    // ADR-0002's shape. The engine halts rather than deciding what the row is — that is the
    // classification question, and it belongs to the owner and the Sharia review.
    const noClass = caught(() => run([entry({ id: 'rev-a', receiptClass: null })], []));
    expect(noClass.code).toBe('RECEIPT_CLASS_INCOHERENT');
    expect(noClass.details?.['offendingLedgerEntryIds']).toEqual(['rev-a']);

    const classedExpense = caught(() =>
      run([entry({ id: 'exp-a', direction: 'EXPENSE', receiptClass: 'INCOME' })], []),
    );
    expect(classedExpense.code).toBe('RECEIPT_CLASS_INCOHERENT');
  });

  it('assertReconcilable is callable on its own, and passes a coherent input', () => {
    expect(() =>
      assertReconcilable({
        waqfId: WAQF,
        bankAccountId: ACCOUNT,
        ledgerEntries: [entry({ id: 'rev-a' })],
        statementLines: [line({ bankReference: 'REF-rev-a' })],
      }),
    ).not.toThrow();
  });
});

describe('the report is deterministic', () => {
  it('orders exceptions by severity then reference, so two runs of one input read alike', () => {
    const result = run(
      [entry({ id: 'rev-z', bankReference: null }), entry({ id: 'rev-a', bankReference: 'REF-a' })],
      [line({ bankReference: 'REF-ghost' })],
    );
    expect(result.exceptions.map((e) => e.finding)).toEqual([
      'MISSING_FROM_LEDGER',
      'MISSING_FROM_STATEMENT',
      'UNREFERENCED',
    ]);
  });

  it('an empty run is balanced, and says so without pretending to have checked anything', () => {
    const result = run([], []);
    expect(result.balanced).toBe(true);
    expect(result.pairs).toEqual([]);
    expect(result.exceptions).toEqual([]);
    // ⚠ Stated rather than left implicit: a caller must not read "balanced" on an empty run as
    // evidence that an account was reconciled. Whether a period SHOULD have movements is the
    // cadence question (FIN-ACC-04), and it is not this module's.
    expect(result.income.reconciledIn.toString()).toBe('0');
  });
});
