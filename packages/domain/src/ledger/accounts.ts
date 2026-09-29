/**
 * `ledger/accounts.ts` — the PLATFORM'S OPERATIONAL CHART OF ACCOUNTS.
 *
 * [ADR — Ledger system of record](../../../../docs/decisions/ADR-ledger-system-of-record.md) §7
 * requires, **before E5/E6 build**, "a per-endowment/per-property/per-beneficiary operational chart
 * of accounts with an explicit **corpus vs income account class**", for two reasons it makes
 * load-bearing: to ENFORCE the non-diminution invariant, and to RECONCILE line-for-line against the
 * statutory book of record. `Transaction.receiptClass` (ADR-0002) satisfies binding rule 1
 * *structurally*; §7 says in terms that it does **not** discharge this requirement.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CONSTRAINT THIS FILE IS BUILT UNDER, AND IT IS THE WHOLE DESIGN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ACCOUNT HERE IS DERIVED FROM A CLASSIFICATION THAT ALREADY EXISTS AND IS ALREADY RULED.**
 * Not one account is invented for a receipt type nobody has ruled on. An account is *a place to put
 * something*; creating one for an unruled receipt type answers the fiqh question by accident, in the
 * most durable way available — by giving the answer a home in the schema — and then the ruling
 * arrives to find the decision already taken.
 *
 * So the catalogue is a projection of three closed enums that are already in the database:
 *   · `ReceiptClass`    INCOME | CAPITAL              (ADR-0002)
 *   · `CapitalSource`   SALE | ISTIBDAL | EXPROPRIATION | OTHER
 *   · `ExpenseCategory` MAINTENANCE | OPERATIONS | NAZIR_FEE | ZAKAT | OTHER
 *
 * and {@link assertCoversVocabulary} proves the projection is total in both directions, so a member
 * added to any of the three cannot ship without an account and an account cannot outlive its member.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ FOUR RECEIPT TYPES DELIBERATELY HAVE NO ACCOUNT, AND THE ABSENCE IS THE DELIVERABLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Q6(f)–(i) of the Sharia review brief — **lease premium / key money (خلو)**, **insurance proceeds on
 * a destroyed building**, **rent arrears collected after an istibdal**, and **an income-funded ṣiyāna
 * reserve once accumulated** — were added to the brief on 2026-08-18, *after* the answered copy was
 * written (2026-07-26). No review of that date reached them, and the owner's memo says so.
 *
 * They are named in {@link UNRULED_RECEIPT_SUBJECTS} and `accounts.test.ts` asserts that **no account
 * in this catalogue serves any of them**. That is not a gap to be filled later by whoever notices it:
 * it is a *refusal*, and the test is what stops a future session helpfully adding `INC-KEY-MONEY`
 * because the enum looked incomplete. **The ruling precedes the record.**
 *
 * ⚠ The sharpest of the four, because it is the one that looks already-solved: a maintenance
 * **EXPENSE** (money actually spent on the asset) has an account — `EXP-SIYANA` — and a maintenance
 * **RESERVE** (income withheld and *not* spent) does not. Whether an accumulated reserve has become
 * corpus is Q6(i), and giving it an account would answer it. See {@link EXP_SIYANA_IS_NOT_A_RESERVE}.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ "SOCPA-ALIGNED" IS A CLAIM THIS FILE DOES NOT MAKE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BR-502 asks for "a SOCPA-aligned chart of accounts". The ledger ADR §3 assigns the **statutory**
 * COA to the accredited accounting system (Wafeq) and keeps the **operational** one here; §4.4 makes
 * the platform reconcile against it line-for-line.
 *
 * This catalogue therefore carries `socpaAccountCode: null` on every account, and that null is
 * honest rather than unfinished. Inventing SOCPA numbers would be fabricating regulatory figures
 * (binding rule 3) — the mapping is a fact about an external standard nobody in this repository has
 * verified, and a plausible-looking account number is worse than an absent one because it will be
 * copied. When the mapping is confirmed against SOCPA's own material, it lands as **data**, and the
 * shape here is already the shape that receives it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PURE. No I/O, no database, no clock. `@qmulate/domain` imports nothing internal.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

import { DomainError } from '../errors.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary — MIRRORED from `schema.prisma`, never invented here
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Mirrors `ReceiptClass` in `schema.prisma`. */
export const LEDGER_RECEIPT_CLASSES = ['INCOME', 'CAPITAL'] as const;
export type LedgerReceiptClass = (typeof LEDGER_RECEIPT_CLASSES)[number];

/** Mirrors `CapitalSource` in `schema.prisma`. */
export const LEDGER_CAPITAL_SOURCES = [
  'SALE_PROCEEDS',
  'ISTIBDAL_PROCEEDS',
  'EXPROPRIATION_COMPENSATION',
  'OTHER',
] as const;
export type LedgerCapitalSource = (typeof LEDGER_CAPITAL_SOURCES)[number];

/** Mirrors `ExpenseCategory` in `schema.prisma`. */
export const LEDGER_EXPENSE_CATEGORIES = [
  'MAINTENANCE',
  'OPERATIONS',
  'NAZIR_FEE',
  'ZAKAT',
  'OTHER',
] as const;
export type LedgerExpenseCategory = (typeof LEDGER_EXPENSE_CATEGORIES)[number];

/**
 * The account CLASS — the "explicit corpus vs income account class" the ledger ADR §7 demands.
 *
 * Three, not two, and the third is the point of the split: an OUTFLOW is neither *ghallah* nor an
 * *aṣl* inflow, exactly as `Transaction.receiptClass` is null on an `EXPENSE` (ADR-0002). Forcing an
 * expense into one of the two inflow classes would make "an expense paid out of income" and "income
 * received" the same class, and the reconciliation's whole reason for splitting totals by class is
 * that a capital receipt must never be able to offset an income shortfall inside the arithmetic.
 */
export const ACCOUNT_CLASSES = [
  /** *Ghallah* / غلة. Yield the corpus produced. The ONLY class the distribution waterfall consumes. */
  'INCOME',
  /** *Aṣl* / أصل. The endowed principal and any capital standing in its place. NEVER distributed. */
  'CORPUS',
  /** An outflow. Funded from income (binding rule 1), and never itself an inflow of either class. */
  'OUTFLOW',
] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The catalogue
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One account in the operational chart.
 *
 * `code` is a QMULATE-internal, stable, human-readable key. It is deliberately **not** a number:
 * a numeric code invites the reader to assume it means something in an external standard, and this
 * catalogue's mapping to the statutory COA is `null` (see the header).
 */
export interface OperationalAccount {
  readonly code: string;
  /** Corpus, income, or outflow. The invariant-bearing field. */
  readonly accountClass: AccountClass;
  /** Arabic-authoritative name (NFR-01). Arabic is this product's authoritative language. */
  readonly nameAr: string;
  readonly nameEn: string;
  /**
   * The classification this account is the projection of. An account exists **because** a member of
   * a closed database enum exists — never because a receipt type seemed to need somewhere to go.
   */
  readonly derivedFrom:
    | { readonly kind: 'RECEIPT'; readonly receiptClass: 'INCOME' }
    | {
        readonly kind: 'RECEIPT';
        readonly receiptClass: 'CAPITAL';
        readonly capitalSource: LedgerCapitalSource;
      }
    | { readonly kind: 'EXPENSE'; readonly expenseCategory: LedgerExpenseCategory };
  /**
   * ⚠ ALWAYS `null` IN THIS REPOSITORY, AND THAT IS A DECISION. The statutory SOCPA-aligned chart is
   * the accredited accounting system's (ledger ADR §3); the mapping is an unverified fact about an
   * external standard, and binding rule 3 forbids stating one as settled. It lands as data.
   */
  readonly socpaAccountCode: null;
  /** True where the account may receive value that reaches the distribution waterfall. */
  readonly distributable: boolean;
  /** ⚠ unverified — set where the account's very existence rests on a figure or rule nobody confirmed. */
  readonly unverified: boolean;
  readonly note?: string;
}

/**
 * ⚠ A ṢIYĀNA **EXPENSE** IS NOT A ṢIYĀNA **RESERVE**, AND ONLY ONE OF THEM HAS AN ACCOUNT.
 *
 * `EXP-SIYANA` records money **spent** keeping the endowed asset sound — an outflow, funded from
 * income, uncontroversial. A *reserve* is income **withheld and not spent**, and whether it has
 * become corpus once accumulated is **[Q6(i)](../../../../docs/sharia-review-brief.md), unruled**.
 *
 * The distinction is easy to lose because both are called "maintenance" in English and *ṣiyāna* in
 * Arabic, and losing it would create a corpus account by accident. The reserve is a figure the
 * distribution engine computes at waterfall step 1 and holds in the waqf's account; it has no COA
 * entry here and must not acquire one before the ruling.
 */
export const EXP_SIYANA_IS_NOT_A_RESERVE =
  'EXP-SIYANA records maintenance SPENT. A maintenance RESERVE — income withheld and unspent — is Q6(i) of the Sharia review brief and is UNRULED; it has no account.' as const;

/**
 * The chart. Ordered corpus-visible-first so a reader meets the non-diminution boundary before the
 * ordinary operating accounts.
 */
export const OPERATIONAL_ACCOUNTS: readonly OperationalAccount[] = Object.freeze([
  /* ── INCOME (ghallah / غلة) — the only class the waterfall consumes ────────────────────── */
  Object.freeze({
    code: 'INC-GHALLAH',
    accountClass: 'INCOME',
    nameAr: 'غلة الوقف',
    nameEn: 'Endowment income (ghallah)',
    derivedFrom: Object.freeze({ kind: 'RECEIPT', receiptClass: 'INCOME' }),
    socpaAccountCode: null,
    distributable: true,
    unverified: false,
    note:
      'Rent and operating returns. The ONE classification every source agreed on before the review, ' +
      'and confirmed by it: Q6(a), rent = income (Fadwa, designated authoritative by the product ' +
      'owner 2026-08-18). There is exactly one income account because `ReceiptClass` has exactly one ' +
      'income member — subdividing it by revenue TYPE would require classifying revenue types, which ' +
      'is the unruled part.',
  }),

  /* ── CORPUS (asl / أصل) — structurally blocked from distribution ──────────────────────── */
  Object.freeze({
    code: 'COR-SALE',
    accountClass: 'CORPUS',
    nameAr: 'أصل — حصيلة بيع',
    nameEn: 'Corpus — sale proceeds',
    derivedFrom: Object.freeze({
      kind: 'RECEIPT',
      receiptClass: 'CAPITAL',
      capitalSource: 'SALE_PROCEEDS',
    }),
    socpaAccountCode: null,
    distributable: false,
    unverified: false,
    note: 'Q6(b) — ruled capital.',
  }),
  Object.freeze({
    code: 'COR-ISTIBDAL',
    accountClass: 'CORPUS',
    nameAr: 'أصل — حصيلة استبدال',
    nameEn: 'Corpus — istibdal (substitution) proceeds',
    derivedFrom: Object.freeze({
      kind: 'RECEIPT',
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
    }),
    socpaAccountCode: null,
    distributable: false,
    unverified: false,
    note: 'Q6(c) — ruled capital. Proceeds stay corpus and flow into the replacement asset.',
  }),
  Object.freeze({
    code: 'COR-EXPROPRIATION',
    accountClass: 'CORPUS',
    nameAr: 'أصل — تعويض نزع ملكية',
    nameEn: 'Corpus — expropriation compensation',
    derivedFrom: Object.freeze({
      kind: 'RECEIPT',
      receiptClass: 'CAPITAL',
      capitalSource: 'EXPROPRIATION_COMPENSATION',
    }),
    socpaAccountCode: null,
    distributable: false,
    unverified: true,
    note:
      '⚠ Q6(d) is ruled "USUALLY capital", not flatly capital — the qualifier is the reviewer\'s and ' +
      'is carried here deliberately. An atypical compensation is routed to review (ledger ADR §3), ' +
      'never reclassified by whoever books it.',
  }),
  Object.freeze({
    code: 'COR-OTHER',
    accountClass: 'CORPUS',
    nameAr: 'أصل — مصدر آخر (يستلزم بيانًا)',
    nameEn: 'Corpus — other source (requires an Arabic justification)',
    derivedFrom: Object.freeze({
      kind: 'RECEIPT',
      receiptClass: 'CAPITAL',
      capitalSource: 'OTHER',
    }),
    socpaAccountCode: null,
    distributable: false,
    unverified: true,
    note:
      '⚠ A PRESSURE VALVE, NOT A BUCKET (ADR-0002 §6). `capitalSource = OTHER` requires ' +
      '`capitalSourceNoteAr` by database CHECK. A rising count here means the enum is wrong, not that ' +
      'the valve is working. ⚠ It is NOT a home for Q6(f)–(i): posting key money or insurance ' +
      'proceeds here would classify them CAPITAL, which is the unruled question — see ' +
      'UNRULED_RECEIPT_SUBJECTS.',
  }),

  /* ── OUTFLOW — funded from income; never an inflow of either class ────────────────────── */
  Object.freeze({
    code: 'EXP-SIYANA',
    accountClass: 'OUTFLOW',
    nameAr: 'مصروف — صيانة',
    nameEn: 'Expense — maintenance (ṣiyāna) SPENT',
    derivedFrom: Object.freeze({ kind: 'EXPENSE', expenseCategory: 'MAINTENANCE' }),
    socpaAccountCode: null,
    distributable: false,
    unverified: false,
    note: EXP_SIYANA_IS_NOT_A_RESERVE,
  }),
  Object.freeze({
    code: 'EXP-OPERATIONS',
    accountClass: 'OUTFLOW',
    nameAr: 'مصروف — تشغيل وإدارة',
    nameEn: 'Expense — operating / management',
    derivedFrom: Object.freeze({ kind: 'EXPENSE', expenseCategory: 'OPERATIONS' }),
    socpaAccountCode: null,
    distributable: false,
    unverified: false,
    note: 'Waterfall step 2. Excludes the Nazir fee, which is step 3 on its own basis.',
  }),
  Object.freeze({
    code: 'EXP-NAZIR-FEE',
    accountClass: 'OUTFLOW',
    nameAr: 'مصروف — أتعاب الناظر',
    nameEn: 'Expense — Nazir fee',
    derivedFrom: Object.freeze({ kind: 'EXPENSE', expenseCategory: 'NAZIR_FEE' }),
    socpaAccountCode: null,
    distributable: false,
    unverified: true,
    note:
      '⚠ unverified — confirm vs primary law. The DEED sets this fee (Nazarah Art. 11); this ' +
      "engagement's is 10% of revenue (ʿushr / عُشر). It is NOT the Authority's own ≤10%-of-net-income " +
      'fee, which has a different payee, base and instrument and never posts here.',
  }),
  Object.freeze({
    code: 'EXP-ZAKAT',
    accountClass: 'OUTFLOW',
    nameAr: 'مصروف — زكاة',
    nameEn: 'Expense — zakat',
    derivedFrom: Object.freeze({ kind: 'EXPENSE', expenseCategory: 'ZAKAT' }),
    socpaAccountCode: null,
    distributable: false,
    unverified: true,
    note:
      '⚠ THE ACCOUNT EXISTS BECAUSE `ExpenseCategory.ZAKAT` EXISTS, AND IT RULES NOTHING. Whether the ' +
      'system may distribute with no zakat step — and if not, on what base, at what rate, at which ' +
      'point in the waterfall and borne by whom — is Q10 of the Sharia review brief and OQ-05, and it ' +
      'is UNANSWERED: the reviewer was asked and did not answer. The waterfall has no zakat step and ' +
      'this account does not add one; it is where a zakat payment WOULD be booked if a ruling ever ' +
      'requires one.',
  }),
  Object.freeze({
    code: 'EXP-OTHER',
    accountClass: 'OUTFLOW',
    nameAr: 'مصروف — أخرى',
    nameEn: 'Expense — other',
    derivedFrom: Object.freeze({ kind: 'EXPENSE', expenseCategory: 'OTHER' }),
    socpaAccountCode: null,
    distributable: false,
    unverified: false,
  }),
] as const satisfies readonly OperationalAccount[]);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · What has NO account, named — so the absence can be tested
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The receipt types that get **no account in this chart**, with the reason each is refused.
 *
 * `accounts.test.ts` asserts that no `OperationalAccount` serves any of these. The list is not
 * documentation of a backlog — it is the specification of a refusal, and the test is what prevents a
 * later session from "completing" the chart.
 */
export const UNRULED_RECEIPT_SUBJECTS = Object.freeze([
  Object.freeze({
    subject: 'LEASE_PREMIUM_KEY_MONEY',
    labelAr: 'خلو / بدل خلو',
    labelEn: 'Lease premium / key money',
    question: 'Q6(f)',
    why: 'Income (it arises from letting the asset) or capital (it is consideration for a right in the asset itself)? Unruled.',
  }),
  Object.freeze({
    subject: 'INSURANCE_PROCEEDS',
    labelAr: 'تعويض تأمين على مبنى موقوف',
    labelEn: 'Insurance proceeds on a destroyed or damaged endowed building',
    question: 'Q6(g)',
    why: 'Capital standing in the place of the asset, or income of the period received? And does total loss differ from partial damage? Unruled.',
  }),
  Object.freeze({
    subject: 'POST_ISTIBDAL_RENT_ARREARS',
    labelAr: 'متأخرات أجرة محصلة بعد الاستبدال',
    labelEn: 'Rent arrears collected after an istibdal',
    question: 'Q6(h)',
    why: 'They accrued on the OLD corpus asset. Do they follow it into the substitution proceeds as corpus, or are they income of the period received? Unruled.',
  }),
  Object.freeze({
    subject: 'ACCUMULATED_SIYANA_RESERVE',
    labelAr: 'احتياطي صيانة ممول من الغلة',
    labelEn: 'A ṣiyāna reserve funded out of income, once accumulated and unspent',
    question: 'Q6(i)',
    why: 'Has it become corpus, or is it retained income still releasable to beneficiaries? Unruled. ⚠ Not to be confused with EXP-SIYANA, which is maintenance SPENT and does have an account.',
  }),
] as const);

export type UnruledReceiptSubject = (typeof UNRULED_RECEIPT_SUBJECTS)[number]['subject'];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Lookup — the only sanctioned way to reach an account from a transaction
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const BY_CODE: ReadonlyMap<string, OperationalAccount> = new Map(
  OPERATIONAL_ACCOUNTS.map((account) => [account.code, account]),
);

/** @throws `SETTING_INVALID` when the code is not in the catalogue. */
export function accountByCode(code: string): OperationalAccount {
  const found = BY_CODE.get(code);
  if (found === undefined) {
    throw new DomainError(
      'SETTING_INVALID',
      `no operational account is coded ${JSON.stringify(code)}. The chart is CLOSED and is a projection of ` +
        `ReceiptClass / CapitalSource / ExpenseCategory — it is never extended to give an unruled receipt ` +
        `type somewhere to live (see UNRULED_RECEIPT_SUBJECTS). Known: ${[...BY_CODE.keys()].join(', ')}`,
      { details: { code, known: [...BY_CODE.keys()] } },
    );
  }
  return found;
}

/** How a `Transaction` row presents itself to the chart. Mirrors the columns, nothing more. */
export interface TransactionClassification {
  readonly type: 'REVENUE' | 'EXPENSE';
  readonly receiptClass: LedgerReceiptClass | null;
  readonly capitalSource: LedgerCapitalSource | null;
  readonly expenseCategory: LedgerExpenseCategory | null;
}

/**
 * The account a classified transaction posts to — **derived, never stored on the row and never
 * chosen by a caller.**
 *
 * That direction is the design. If the account were an input, the account and the classification
 * would be two sides that must agree with nothing comparing them — the failure mode this codebase
 * has paid for repeatedly. Deriving it means the corpus guard on `receiptClass` (migration 19) is
 * automatically a guard on the account: a receipt cannot be moved between corpus and income accounts
 * without moving its class, and the class cannot move at all.
 *
 * @throws `RECEIPT_UNCLASSIFIED` — a `REVENUE` row with no class, or a `CAPITAL` row with no source.
 *   The database CHECKs make both unrepresentable; this refuses them anyway rather than defaulting,
 *   because a default here would be a silent corpus/income decision.
 * @throws `RECEIPT_CLASS_INCOHERENT` — the columns contradict each other (an `EXPENSE` carrying a
 *   receipt class, an `INCOME` carrying a capital source).
 */
export function accountForTransaction(tx: TransactionClassification): OperationalAccount {
  if (tx.type === 'EXPENSE') {
    if (tx.receiptClass !== null || tx.capitalSource !== null) {
      throw new DomainError(
        'RECEIPT_CLASS_INCOHERENT',
        `an EXPENSE is an outflow and is neither ghallah nor an asl inflow, so it carries no receiptClass ` +
          `and no capitalSource (ADR-0002; database CHECK transaction_expense_has_no_receipt_class). Got ` +
          `receiptClass=${String(tx.receiptClass)} capitalSource=${String(tx.capitalSource)}.`,
        { details: { receiptClass: tx.receiptClass, capitalSource: tx.capitalSource } },
      );
    }
    if (tx.expenseCategory === null) {
      throw new DomainError(
        'RECEIPT_UNCLASSIFIED',
        'an EXPENSE names its expenseCategory (database CHECK transaction_expense_requires_category). ' +
          'There is no default outflow account: guessing one would misstate the waterfall step the money left at.',
        {},
      );
    }
    return accountByCode(EXPENSE_ACCOUNT_BY_CATEGORY[tx.expenseCategory]);
  }

  if (tx.expenseCategory !== null) {
    throw new DomainError(
      'RECEIPT_CLASS_INCOHERENT',
      `a REVENUE receipt carries no expenseCategory (got ${String(tx.expenseCategory)}).`,
      { details: { expenseCategory: tx.expenseCategory } },
    );
  }
  if (tx.receiptClass === null) {
    throw new DomainError(
      'RECEIPT_UNCLASSIFIED',
      'every REVENUE receipt is classified income-vs-capital AT ENTRY (binding rule 1, ADR-0002; database ' +
        'CHECK transaction_revenue_requires_receipt_class). An unclassified receipt has no account, and ' +
        'defaulting it to income is how sale proceeds become distributable ghallah.',
      {},
    );
  }
  if (tx.receiptClass === 'INCOME') {
    if (tx.capitalSource !== null) {
      throw new DomainError(
        'RECEIPT_CLASS_INCOHERENT',
        `an INCOME receipt cannot name a capitalSource (got ${tx.capitalSource}; database CHECK ` +
          `transaction_income_has_no_capital_source).`,
        { details: { capitalSource: tx.capitalSource } },
      );
    }
    return accountByCode('INC-GHALLAH');
  }
  if (tx.capitalSource === null) {
    throw new DomainError(
      'RECEIPT_UNCLASSIFIED',
      'a CAPITAL receipt always names where it came from (database CHECK transaction_capital_requires_source). ' +
        'Corpus with no stated source cannot be reconciled to the asset it stands in the place of.',
      {},
    );
  }
  return accountByCode(CORPUS_ACCOUNT_BY_SOURCE[tx.capitalSource]);
}

/** `CapitalSource` → account code. Total over the enum; {@link assertCoversVocabulary} proves it. */
export const CORPUS_ACCOUNT_BY_SOURCE: Readonly<Record<LedgerCapitalSource, string>> =
  Object.freeze({
    SALE_PROCEEDS: 'COR-SALE',
    ISTIBDAL_PROCEEDS: 'COR-ISTIBDAL',
    EXPROPRIATION_COMPENSATION: 'COR-EXPROPRIATION',
    OTHER: 'COR-OTHER',
  });

/** `ExpenseCategory` → account code. Total over the enum. */
export const EXPENSE_ACCOUNT_BY_CATEGORY: Readonly<Record<LedgerExpenseCategory, string>> =
  Object.freeze({
    MAINTENANCE: 'EXP-SIYANA',
    OPERATIONS: 'EXP-OPERATIONS',
    NAZIR_FEE: 'EXP-NAZIR-FEE',
    ZAKAT: 'EXP-ZAKAT',
    OTHER: 'EXP-OTHER',
  });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Per-endowment / per-property instances (ledger ADR §7)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The identity of one account **instance**: this account, on this endowment, optionally on one
 * property.
 *
 * §7 asks for a per-endowment/per-property chart. The catalogue above is the *chart*; an endowment
 * does not get a private set of account definitions, it gets instances of the shared ones — which is
 * what makes two endowments' books comparable and what makes a line-for-line reconciliation against
 * the statutory book possible at all.
 *
 * ⚠ THE ENDOWMENT IS ALWAYS PART OF THE KEY, WITH NO "SHARED" FORM. Anti-commingling (BR-501, G-2)
 * is not a rule applied to accounts here; it is a property of the naming, so an account belonging to
 * no endowment cannot be referred to.
 */
export function operationalAccountRef(
  waqfId: string,
  code: string,
  assetId?: string | null,
): string {
  const account = accountByCode(code);
  if (waqfId.length === 0) {
    throw new DomainError(
      'SETTING_INVALID',
      "an operational account instance is always an endowment's. There is no unscoped or shared form: " +
        'commingling is prevented by making a cross-endowment reference unnameable, not by checking for it.',
      { details: { code } },
    );
  }
  return assetId === undefined || assetId === null || assetId.length === 0
    ? `${waqfId}:${account.code}`
    : `${waqfId}:${account.code}:${assetId}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · Totality — the projection is proven, not asserted in a comment
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Proves the chart is a TOTAL projection of the three closed enums, in both directions:
 * every enum member has exactly one account, and every account traces to a live enum member.
 *
 * Called by `accounts.test.ts` and cheap enough to call at boot. It exists as code rather than as a
 * docstring for the reason this codebase keeps rediscovering: two sides that must agree, with
 * nothing comparing them, is how the parity holes happened.
 *
 * @throws `SETTING_INVALID` naming the exact divergence.
 */
export function assertCoversVocabulary(): void {
  const problems: string[] = [];

  const incomeAccounts = OPERATIONAL_ACCOUNTS.filter(
    (a) => a.derivedFrom.kind === 'RECEIPT' && a.derivedFrom.receiptClass === 'INCOME',
  );
  if (incomeAccounts.length !== 1) {
    problems.push(
      `expected exactly ONE income account (ReceiptClass has one income member); found ${incomeAccounts.length}`,
    );
  }

  for (const source of LEDGER_CAPITAL_SOURCES) {
    const matches = OPERATIONAL_ACCOUNTS.filter(
      (a) =>
        a.derivedFrom.kind === 'RECEIPT' &&
        a.derivedFrom.receiptClass === 'CAPITAL' &&
        a.derivedFrom.capitalSource === source,
    );
    if (matches.length !== 1) {
      problems.push(`CapitalSource ${source} maps to ${matches.length} accounts, expected 1`);
    }
    if (!BY_CODE.has(CORPUS_ACCOUNT_BY_SOURCE[source])) {
      problems.push(
        `CORPUS_ACCOUNT_BY_SOURCE[${source}] points at ${CORPUS_ACCOUNT_BY_SOURCE[source]}, which is not in the chart`,
      );
    }
  }

  for (const category of LEDGER_EXPENSE_CATEGORIES) {
    const matches = OPERATIONAL_ACCOUNTS.filter(
      (a) => a.derivedFrom.kind === 'EXPENSE' && a.derivedFrom.expenseCategory === category,
    );
    if (matches.length !== 1) {
      problems.push(`ExpenseCategory ${category} maps to ${matches.length} accounts, expected 1`);
    }
    if (!BY_CODE.has(EXPENSE_ACCOUNT_BY_CATEGORY[category])) {
      problems.push(
        `EXPENSE_ACCOUNT_BY_CATEGORY[${category}] points at ${EXPENSE_ACCOUNT_BY_CATEGORY[category]}, which is not in the chart`,
      );
    }
  }

  // The other direction: no orphan account whose enum member has gone.
  for (const account of OPERATIONAL_ACCOUNTS) {
    const from = account.derivedFrom;
    if (from.kind === 'EXPENSE' && !LEDGER_EXPENSE_CATEGORIES.includes(from.expenseCategory)) {
      problems.push(
        `${account.code} derives from a retired ExpenseCategory ${from.expenseCategory}`,
      );
    }
    if (
      from.kind === 'RECEIPT' &&
      from.receiptClass === 'CAPITAL' &&
      !LEDGER_CAPITAL_SOURCES.includes(from.capitalSource)
    ) {
      problems.push(`${account.code} derives from a retired CapitalSource ${from.capitalSource}`);
    }
  }

  // The invariant the whole chart exists to carry.
  for (const account of OPERATIONAL_ACCOUNTS) {
    if (account.distributable && account.accountClass !== 'INCOME') {
      problems.push(
        `${account.code} is ${account.accountClass} and distributable — corpus is never distributed (binding rule 1)`,
      );
    }
  }

  if (problems.length > 0) {
    throw new DomainError(
      'SETTING_INVALID',
      `the operational chart of accounts has drifted from the database vocabulary it projects:\n  ${problems.join('\n  ')}`,
      { details: { problems } },
    );
  }
}
