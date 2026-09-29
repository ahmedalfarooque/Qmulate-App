/**
 * `@qmulate/domain/ledger` — the platform's OPERATIONAL chart of accounts (ledger ADR §7).
 *
 * The statutory, SOCPA-aligned chart belongs to the accredited accounting system; this is the
 * operational one the domain reasons over and reconciles from, and every account in it is a
 * projection of a classification that already exists in `schema.prisma` and has already been ruled.
 * Four receipt types — Q6(f)–(i) of the Sharia review brief — deliberately have no account at all.
 * See `accounts.ts`'s header before adding one.
 */

export {
  ACCOUNT_CLASSES,
  CORPUS_ACCOUNT_BY_SOURCE,
  EXPENSE_ACCOUNT_BY_CATEGORY,
  EXP_SIYANA_IS_NOT_A_RESERVE,
  LEDGER_CAPITAL_SOURCES,
  LEDGER_EXPENSE_CATEGORIES,
  LEDGER_RECEIPT_CLASSES,
  OPERATIONAL_ACCOUNTS,
  UNRULED_RECEIPT_SUBJECTS,
  accountByCode,
  accountForTransaction,
  assertCoversVocabulary,
  operationalAccountRef,
} from './accounts.js';

export type {
  AccountClass,
  LedgerCapitalSource,
  LedgerExpenseCategory,
  LedgerReceiptClass,
  OperationalAccount,
  TransactionClassification,
  UnruledReceiptSubject,
} from './accounts.js';
