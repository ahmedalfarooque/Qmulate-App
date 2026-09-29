/**
 * The operational chart of accounts (ledger ADR §7).
 *
 * The tests that matter most here are the NEGATIVE ones. A chart of accounts is trivially easy to
 * make "complete" — you add an account — and the whole point of this one is that four receipt types
 * deliberately have nowhere to go. So the suite spends more effort proving the chart REFUSES than
 * proving it maps.
 */

import { describe, expect, it } from 'vitest';

import { isDomainError } from '../../errors.js';
import {
  ACCOUNT_CLASSES,
  CORPUS_ACCOUNT_BY_SOURCE,
  EXPENSE_ACCOUNT_BY_CATEGORY,
  LEDGER_CAPITAL_SOURCES,
  LEDGER_EXPENSE_CATEGORIES,
  OPERATIONAL_ACCOUNTS,
  UNRULED_RECEIPT_SUBJECTS,
  accountByCode,
  accountForTransaction,
  assertCoversVocabulary,
  operationalAccountRef,
  type TransactionClassification,
} from '../accounts.js';

function expectDomainCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(isDomainError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected a DomainError ${code}, but the call returned normally`);
}

const revenue = (
  receiptClass: TransactionClassification['receiptClass'],
  capitalSource: TransactionClassification['capitalSource'] = null,
): TransactionClassification => ({
  type: 'REVENUE',
  receiptClass,
  capitalSource,
  expenseCategory: null,
});

const expense = (
  expenseCategory: TransactionClassification['expenseCategory'],
): TransactionClassification => ({
  type: 'EXPENSE',
  receiptClass: null,
  capitalSource: null,
  expenseCategory,
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The projection is TOTAL — derived from the enums, never transcribed
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the chart is a total projection of the database vocabulary', () => {
  it('agrees with ReceiptClass / CapitalSource / ExpenseCategory in both directions', () => {
    expect(() => {
      assertCoversVocabulary();
    }).not.toThrow();
  });

  it('gives every CapitalSource exactly one corpus account (derived from the enum)', () => {
    for (const source of LEDGER_CAPITAL_SOURCES) {
      const account = accountByCode(CORPUS_ACCOUNT_BY_SOURCE[source]);
      expect(account.accountClass).toBe('CORPUS');
      expect(account.distributable).toBe(false);
    }
  });

  it('gives every ExpenseCategory exactly one outflow account (derived from the enum)', () => {
    for (const category of LEDGER_EXPENSE_CATEGORIES) {
      const account = accountByCode(EXPENSE_ACCOUNT_BY_CATEGORY[category]);
      expect(account.accountClass).toBe('OUTFLOW');
      expect(account.distributable).toBe(false);
    }
  });

  it('codes are unique', () => {
    const codes = OPERATIONAL_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every account carries an Arabic name — Arabic is the authoritative language (NFR-01)', () => {
    for (const account of OPERATIONAL_ACCOUNTS) {
      expect(account.nameAr.length).toBeGreaterThan(0);
      // Not merely non-empty: an English string in the Arabic slot would pass a length check.
      expect(account.nameAr).toMatch(/[؀-ۿ]/u);
    }
  });

  it('every account class in ACCOUNT_CLASSES is actually used', () => {
    // A class nobody uses is a class nobody has thought about; it would sit in the vocabulary
    // looking load-bearing.
    const used = new Set(OPERATIONAL_ACCOUNTS.map((a) => a.accountClass));
    expect([...ACCOUNT_CLASSES].every((cls) => used.has(cls))).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Binding rule 1 — corpus is never distributable, at the account level
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('binding rule 1 holds over the chart itself', () => {
  it('ONLY income-class accounts are distributable, and there is exactly one', () => {
    const distributable = OPERATIONAL_ACCOUNTS.filter((a) => a.distributable);
    expect(distributable.map((a) => a.code)).toStrictEqual(['INC-GHALLAH']);
    expect(distributable[0]?.accountClass).toBe('INCOME');
  });

  it('no CORPUS account is distributable — asserted over the whole chart, not one example', () => {
    for (const account of OPERATIONAL_ACCOUNTS) {
      if (account.accountClass === 'CORPUS') expect(account.distributable).toBe(false);
    }
  });

  it('sale, istibdal and expropriation proceeds all land in CORPUS', () => {
    for (const source of [
      'SALE_PROCEEDS',
      'ISTIBDAL_PROCEEDS',
      'EXPROPRIATION_COMPENSATION',
    ] as const) {
      expect(accountForTransaction(revenue('CAPITAL', source)).accountClass).toBe('CORPUS');
    }
  });

  it('rent / operating returns land in INCOME and are distributable (Q6(a), ruled)', () => {
    const account = accountForTransaction(revenue('INCOME'));
    expect(account.code).toBe('INC-GHALLAH');
    expect(account.distributable).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE REFUSALS — four receipt types have no home, and that is the deliverable
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('Q6(f)–(i) have NO account, and the chart cannot be completed into giving them one', () => {
  it('names all four unruled subjects', () => {
    expect(UNRULED_RECEIPT_SUBJECTS.map((s) => s.subject)).toStrictEqual([
      'LEASE_PREMIUM_KEY_MONEY',
      'INSURANCE_PROCEEDS',
      'POST_ISTIBDAL_RENT_ARREARS',
      'ACCUMULATED_SIYANA_RESERVE',
    ]);
  });

  it('no account in the chart is FOR any of them', () => {
    // Deliberately a text search over every field a future account would have to fill in to serve
    // one of these subjects. If somebody adds `INC-KEY-MONEY` — or renames an existing account to
    // mention key money — this goes red and they have to read UNRULED_RECEIPT_SUBJECTS.
    //
    // ⚠ The account NOTES legitimately mention these subjects in order to REFUSE them, so the
    // search covers codes and names only; a note saying "this is not for key money" must stay legal.
    const needles = ['KEY.?MONEY', 'خلو', 'INSURANCE', 'تأمين', 'ARREAR', 'متأخر', 'RESERVE'];
    for (const account of OPERATIONAL_ACCOUNTS) {
      const searchable = `${account.code} ${account.nameEn} ${account.nameAr}`;
      for (const needle of needles) {
        expect(
          new RegExp(needle, 'iu').test(searchable),
          `account ${account.code} ("${account.nameEn}" / "${account.nameAr}") looks like it serves an ` +
            `UNRULED receipt type (matched /${needle}/i). Q6(f)–(i) of the Sharia review brief are ` +
            `unanswered — they were added to the brief AFTER the answered copy was written — and giving ` +
            `one an account answers the fiqh question by putting it in the schema. The ruling precedes ` +
            `the record.`,
        ).toBe(false);
      }
    }
  });

  it('the maintenance EXPENSE account exists and is NOT a maintenance reserve', () => {
    // The sharpest of the four, because it looks already-solved. Money SPENT on the asset has an
    // account; income WITHHELD and unspent does not, because whether it has become corpus is Q6(i).
    const spent = accountForTransaction(expense('MAINTENANCE'));
    expect(spent.code).toBe('EXP-SIYANA');
    expect(spent.accountClass).toBe('OUTFLOW');
    // If it were ever reclassified CORPUS, Q6(i) would have been answered by a code change.
    expect(spent.accountClass).not.toBe('CORPUS');
    expect(spent.note).toContain('Q6(i)');
  });

  it('COR-OTHER is not a back door for them — it classifies CAPITAL, which is the question', () => {
    const other = accountByCode('COR-OTHER');
    expect(other.accountClass).toBe('CORPUS');
    expect(other.note ?? '').toContain('Q6(f)');
  });

  it('the zakat account exists because the ENUM does, and rules nothing (Q10 unanswered)', () => {
    const zakat = accountForTransaction(expense('ZAKAT'));
    expect(zakat.code).toBe('EXP-ZAKAT');
    expect(zakat.unverified).toBe(true);
    expect(zakat.note ?? '').toContain('UNANSWERED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ The SOCPA mapping is absent, and absent on purpose
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the statutory SOCPA mapping is not invented here', () => {
  it('every account carries socpaAccountCode === null', () => {
    // Binding rule 3. The statutory chart belongs to the accredited accounting system (ledger ADR
    // §3); a plausible-looking account number nobody verified is worse than an absent one, because
    // it gets copied. When the mapping is confirmed it lands as DATA, into this same shape.
    for (const account of OPERATIONAL_ACCOUNTS) {
      expect(account.socpaAccountCode).toBeNull();
    }
  });

  it('flags the accounts whose existence rests on an unverified figure or an unruled point', () => {
    const unverified = OPERATIONAL_ACCOUNTS.filter((a) => a.unverified).map((a) => a.code);
    expect(unverified).toStrictEqual([
      // ⚠ "usually" capital, not flatly — the reviewer's qualifier.
      'COR-EXPROPRIATION',
      // ⚠ a pressure valve that must not silently become a bucket.
      'COR-OTHER',
      // ⚠ the deed-set ʿushr, unconfirmed against primary law.
      'EXP-NAZIR-FEE',
      // ⚠ Q10 / OQ-05, unanswered.
      'EXP-ZAKAT',
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The account is DERIVED, never supplied — so the corpus guard covers it for free
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('accountForTransaction refuses rather than defaults', () => {
  it('an unclassified REVENUE receipt has no account', () => {
    expectDomainCode(() => accountForTransaction(revenue(null)), 'RECEIPT_UNCLASSIFIED');
  });

  it('a CAPITAL receipt with no source has no account', () => {
    expectDomainCode(() => accountForTransaction(revenue('CAPITAL', null)), 'RECEIPT_UNCLASSIFIED');
  });

  it('an EXPENSE with no category has no account', () => {
    expectDomainCode(() => accountForTransaction(expense(null)), 'RECEIPT_UNCLASSIFIED');
  });

  it('an INCOME receipt carrying a capital source is incoherent, not "probably capital"', () => {
    expectDomainCode(
      () => accountForTransaction(revenue('INCOME', 'SALE_PROCEEDS')),
      'RECEIPT_CLASS_INCOHERENT',
    );
  });

  it('an EXPENSE carrying a receipt class is incoherent', () => {
    expectDomainCode(
      () =>
        accountForTransaction({
          type: 'EXPENSE',
          receiptClass: 'INCOME',
          capitalSource: null,
          expenseCategory: 'OPERATIONS',
        }),
      'RECEIPT_CLASS_INCOHERENT',
    );
  });

  it('an unknown code is refused with the closed chart named', () => {
    expectDomainCode(() => accountByCode('INC-KEY-MONEY'), 'SETTING_INVALID');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Per-endowment / per-property instances — anti-commingling by naming (BR-501, G-2)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe("an account instance is always an endowment's", () => {
  it('scopes to the endowment, and to a property when one is given', () => {
    expect(operationalAccountRef('waqf-001', 'INC-GHALLAH')).toBe('waqf-001:INC-GHALLAH');
    expect(operationalAccountRef('waqf-001', 'INC-GHALLAH', 'asset-001')).toBe(
      'waqf-001:INC-GHALLAH:asset-001',
    );
  });

  it('treats null and empty assetId as "endowment-level", never as a property called ""', () => {
    expect(operationalAccountRef('waqf-001', 'INC-GHALLAH', null)).toBe('waqf-001:INC-GHALLAH');
    expect(operationalAccountRef('waqf-001', 'INC-GHALLAH', '')).toBe('waqf-001:INC-GHALLAH');
  });

  it('has NO unscoped form — a cross-endowment account is unnameable, not merely refused', () => {
    expectDomainCode(() => operationalAccountRef('', 'INC-GHALLAH'), 'SETTING_INVALID');
  });

  it('refuses an instance of an account that is not in the chart', () => {
    expectDomainCode(() => operationalAccountRef('waqf-001', 'COR-KEY-MONEY'), 'SETTING_INVALID');
  });

  it('two endowments never share an instance reference', () => {
    expect(operationalAccountRef('waqf-001', 'INC-GHALLAH')).not.toBe(
      operationalAccountRef('waqf-002', 'INC-GHALLAH'),
    );
  });
});
