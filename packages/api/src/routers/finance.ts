/**
 * `finance` — E5's CAPTURE SURFACE: Arabic revenue and expense entry, and MAKER-CHECKER ON MONEY
 * MOVEMENT (BR-501, BR-502, release gates G-2 and G-3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE ASYMMETRY THIS FILE IS BUILT AROUND
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **RECORDING MONEY THAT ARRIVED IS NOT THE SAME ACT AS MOVING MONEY OUT**, and they are not gated
 * the same way.
 *
 *   `recordRevenue`  a receipt ALREADY LANDED in the endowment's dedicated account. Recording it is
 *                    bookkeeping against evidence somebody is holding — a bank line, a lease. It is
 *                    a MAKER write, audited, with the classification mandatory at entry.
 *
 *   `bankMovement.*` money LEAVES the endowment. That is the act §10 §4.2 puts behind segregation of
 *                    duties, and it is built as three procedures, not one:
 *                        request  → maker raises a BANK_MOVEMENT approval. NO ledger row is written.
 *                        approve  → `approval.approve` (root.ts). Maker ≠ checker, NAZIR, TOTP.
 *                        execute  → the ledger row is written, FROM THE APPROVED ARTIFACT.
 *
 * ⚠ `request` DELIBERATELY WRITES NO `Transaction`. `Transaction` has no draft/pending status column,
 * so an unapproved movement recorded as a row would be indistinguishable from a real one to every
 * reader — the reconciliation, the waterfall, a statement. The APPROVAL REQUEST *is* the pending
 * state. Adding a status column instead would put "is this money real yet?" into a field that
 * anything could set, which is the shape of the corpus-reclassification defect one table over.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THERE IS NO `finance.bankMovement.approve`, AND WHY THAT IS THE SAFER CHOICE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The decision is taken by **`approval.approve` in `root.ts`** — the package's ONE approving path,
 * exactly as `mintApprovalRequest` is its one minting path. A second approve procedure would have to
 * restate `checkerProcedure`'s guard chain, the MP-32 authority context, and the no-`select` rule
 * that C-08 exists because of; two approve paths is how the approver signs one canonical form and
 * the executor verifies another.
 *
 * ⚠ **SURFACED, NOT SETTLED:** that makes the gate `approval:request:approve`, and
 * `distribution:bank_movement:approve` — which §3's grid gives the Nazir specifically for money
 * movement — is **not yet the verb on this path**. Today the two are equivalent in authority: both
 * sit in the `nazir` preset and in no other, so nothing is loosened. They would diverge only if a
 * future role were given one and not the other. Recorded here rather than quietly resolved.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MAKER ≠ CHECKER IS PROVEN BY IDENTITY, NOT BY ROLE — AND THE ROLE SPLIT IS NOT THE PROOF
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The presets already make the Nazir structurally unable to be the maker here:
 * `distribution:bank_movement:initiate` is in `finance` and **not** in `nazir`;
 * `approval:request:approve` is in `nazir` and **not** in `finance`. That is a good property and it
 * is NOT segregation of duties — it is a role split, and it passes vacuously for the case §4.2
 * actually worries about: **one human legitimately holding BOTH grants on one endowment** (AC-4, the
 * small-team case that a real Nazarah engagement produces immediately).
 *
 * So the red test is that caller: they may `request`, and they may not approve their own request,
 * and the refusal comes from `assertDistinctApprover` comparing the ACTING identity against the
 * PERSISTED `makerId` — before any state change. See `finance-maker-checker.integration.test.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ANTI-COMMINGLING (BR-501 / G-2) IS THE DATABASE'S, AND THIS LAYER REFUSES EARLIER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Migration 19 makes a cross-endowment posting UNREPRESENTABLE (a composite foreign key on
 * `(waqfId, bankAccountId)`) and blocks a posting to a non-dedicated account
 * (`transaction_dedicated_account_only`). Neither guard moves. What this layer adds is a refusal
 * BEFORE the insert, carrying a sentence a Nazir can read instead of a SQLSTATE — and it never
 * replaces the database's, because an application check that the database does not also make is a
 * convention, not an invariant.
 *
 * ⚠ `isDedicated = false` IS REPRESENTABLE AND PERMANENTLY UNPOSTABLE — product owner, 2026-08-18
 * (S4 memo Q-E5-3(a)), confirming shipped behaviour rather than changing it. An engagement may need
 * to RECORD an account it does not control (a legacy commingled account during onboarding, an
 * inherited one mid-transfer). The account may exist; nothing may ever post to it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ACCOUNT IS DERIVED, NEVER SUPPLIED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `@qmulate/domain/ledger`'s `accountForTransaction` maps the row's own classification columns to an
 * operational account. No caller names an account, and no account is stored on the row. If it were
 * an input, the account and the classification would be two sides that must agree with nothing
 * comparing them — and migration 19's corpus guard would stop protecting the account, because the
 * account could move while the class stayed put.
 */

import { z } from 'zod';

import { recordEvent, type ExtendedPrismaClient } from '@qmulate/database';
import {
  OPERATIONAL_ACCOUNTS,
  UNRULED_RECEIPT_SUBJECTS,
  accountForTransaction,
  operationalAccountRef,
} from '@qmulate/domain/ledger';
import { ZERO, add, money, sub, toDbString, type Money } from '@qmulate/domain/money';
import { parseSetting } from '@qmulate/domain/settings';
import {
  reconcile,
  type ClassTotals,
  type LedgerEntry,
  type StatementLine,
} from '@qmulate/domain/reconciliation';

import { ApiError } from '../errors.js';
import { toActorContext } from '../context.js';
import { HIJRI_SNAPSHOT_PATTERN, assertHijriPairAgrees } from '../dual-date.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';
import { mintApprovalRequest } from './reservedMatter.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary and input shapes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Money at this boundary is a 2-dp decimal STRING, never a JS `number`.
 *
 * `canonicalJson` THROWS on a number, which is what keeps a float out of the hash the approver
 * signs; and `Decimal(18,2)` round-trips a string exactly. A `z.number()` here would be silently
 * lossy on amounts a real endowment produces (SAR 20,000,000.01 is fine, but the class of bug is
 * not worth the ergonomics).
 */
const moneyString = z
  .string()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    'money crosses this boundary as a non-negative decimal string with at most 2 decimal places ' +
      '("1234.56"), never a JS number — a float in the payload would be hashed into the approval the ' +
      'Nazir signs. The sign is carried by the transaction TYPE, never by the amount ' +
      '(CHECK transaction_amount_nonnegative).',
  );

/** Mirrors `ReceiptClass`. Spelled here, compared to the datamodel by the domain's parity test. */
const receiptClassInput = z.enum(['INCOME', 'CAPITAL']);
/** Mirrors `CapitalSource`. */
const capitalSourceInput = z.enum([
  'SALE_PROCEEDS',
  'ISTIBDAL_PROCEEDS',
  'EXPROPRIATION_COMPENSATION',
  'OTHER',
]);
/** Mirrors `ExpenseCategory`. */
const expenseCategoryInput = z.enum(['MAINTENANCE', 'OPERATIONS', 'NAZIR_FEE', 'ZAKAT', 'OTHER']);

/**
 * ⚠ ARABIC IS REQUIRED, AND `.min(1)` IS NOT ENOUGH TO SAY SO.
 *
 * NFR-01 / BR-502: transactions are recorded IN ARABIC, and the Arabic is the authoritative text.
 * A `z.string().min(1)` accepts `"rent"` and would let an all-English ledger accumulate while every
 * schema, test and docstring claimed otherwise — the exact shape of the asset-status defect
 * (V-E3-02), where an allow-list of Latin spellings gated an Arabic-authoritative column and the
 * Arabic slipped straight past it.
 *
 * So the check is that the string CONTAINS Arabic script. It deliberately does not forbid Latin
 * characters alongside it: a real description carries deed numbers, IBAN fragments and dates.
 */
const arabicText = (field: string, max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => /[؀-ۿݐ-ݿ]/u.test(value), {
      message:
        `${field} is Arabic-authoritative (NFR-01 / BR-502): a waqf's financial record is kept in ` +
        `Arabic and the Arabic text is the one that governs. A non-empty check alone would accept ` +
        `English and let an all-Latin ledger accumulate behind a schema that claims otherwise.`,
    });

/** ISO-8601 instant plus the FROZEN Hijri snapshot taken at write time (never recomputed downstream). */
const dualDateInput = {
  date: z.string().datetime({ offset: true }),
  dateHijri: z.string().regex(HIJRI_SNAPSHOT_PATTERN, 'dateHijri is a yyyy-MM-dd Hijri snapshot'),
};

/**
 * The subject grammar a `BANK_MOVEMENT` approval must name.
 *
 * ⚠ ONE DEFINITION, used by `request` to mint and by `execute` to verify. `subjectId` is what
 * `approval_request_one_open_per_subject` keys on, so two simultaneously-open approvals for one
 * movement are impossible — and two simultaneously-valid approvals for one act is a second authority
 * by arithmetic (MP-31).
 *
 * The `movementRef` is the maker's own reference for the payment (an invoice number, a payment
 * instruction id). It is required precisely so that two different payments of the same amount to the
 * same payee on the same day are two different subjects rather than one colliding one.
 */
export function bankMovementSubjectId(waqfId: string, movementRef: string): string {
  return `bank-movement:${waqfId}:${movementRef}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Shared refusals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The account exists, belongs to THIS endowment, and is DEDICATED — checked before any insert.
 *
 * ⚠ THIS DOES NOT REPLACE THE DATABASE GUARDS AND MUST NEVER BE TREATED AS DOING SO. Migration 19's
 * composite foreign key makes a cross-endowment posting unrepresentable and
 * `transaction_dedicated_account_only` refuses a non-dedicated one; both still fire if this function
 * is bypassed, which is the point of having them. What this adds is a readable refusal and the
 * guarantee that nothing is written and rolled back.
 */
async function assertPostableAccount(
  db: ExtendedPrismaClient,
  waqfId: string,
  bankAccountId: string,
): Promise<{ readonly accountRef: string }> {
  const account = await db.bankAccount.findFirst({
    where: { id: bankAccountId },
    select: { id: true, waqfId: true, isDedicated: true, accountRef: true, deletedAt: true },
  });

  if (account === null || account.deletedAt !== null) {
    // ⚠ `SCOPE_REF_MISMATCH` maps to NOT_FOUND, never FORBIDDEN (§7.2). The scoping force-filter has
    // already hidden every other endowment's accounts, so "no such account here" is the whole truth
    // this caller is owed — saying "that account belongs to waqf-003" would leak the existence of an
    // endowment they hold no grant on.
    throw new ApiError(
      'SCOPE_REF_MISMATCH',
      `no bank account ${JSON.stringify(bankAccountId)} is visible on waqf ${waqfId}.`,
      { waqfId, bankAccountId },
    );
  }

  if (account.waqfId !== waqfId) {
    throw new ApiError(
      'PERMISSION_DENIED',
      `COMMINGLING_REFUSED: bank account ${bankAccountId} belongs to waqf ${account.waqfId}, not ` +
        `${waqfId}. Each endowment keeps DEDICATED accounts and funds are never commingled ` +
        `(BR-501, KPI 2 zero-tolerance). Migration 19's composite foreign key makes this pair ` +
        `unrepresentable in any case; refusing here means nothing is written and rolled back.`,
      { waqfId, bankAccountId, accountWaqfId: account.waqfId },
    );
  }

  if (account.isDedicated !== true) {
    throw new ApiError(
      'PERMISSION_DENIED',
      `NON_DEDICATED_ACCOUNT: bank account ${JSON.stringify(account.accountRef)} is recorded with ` +
        `isDedicated = false and NOTHING MAY EVER BE POSTED TO IT (BR-501's personal-funds leg; ` +
        `trigger transaction_dedicated_account_only). Such an account is deliberately representable ` +
        `— an engagement may need to record an account it does not control, e.g. a legacy commingled ` +
        `account during onboarding — and deliberately unpostable (product owner, 2026-08-18, S4 memo ` +
        `Q-E5-3(a)). Post to the endowment's dedicated account instead.`,
      { waqfId, bankAccountId, accountRef: account.accountRef },
    );
  }

  return { accountRef: account.accountRef };
}

/**
 * The classification columns, coherent, with the operational account DERIVED from them.
 *
 * Any incoherence surfaces as the domain's own `RECEIPT_UNCLASSIFIED` / `RECEIPT_CLASS_INCOHERENT`
 * rather than as a database CHECK violation, so the caller is told which rule they broke.
 */
function derivedAccountFor(input: {
  type: 'REVENUE' | 'EXPENSE';
  receiptClass: 'INCOME' | 'CAPITAL' | null;
  capitalSource: z.infer<typeof capitalSourceInput> | null;
  expenseCategory: z.infer<typeof expenseCategoryInput> | null;
}) {
  return accountForTransaction({
    type: input.type,
    receiptClass: input.receiptClass,
    capitalSource: input.capitalSource,
    expenseCategory: input.expenseCategory,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const financeRouter = router({
  /**
   * The endowment's operational chart of accounts, as INSTANCES on this endowment.
   *
   * Read-only and derived: there is no account-creation procedure, because the chart is a closed
   * projection of the database's own classification enums (`@qmulate/domain/ledger`). An endowment
   * does not get private account definitions — that is what makes two endowments' books comparable
   * and a line-for-line reconciliation against the statutory book possible at all.
   */
  chartOfAccounts: endowmentScopedProcedure('finance:transaction:read').query(({ ctx }) => ({
    waqfId: ctx.waqfId,
    accounts: OPERATIONAL_ACCOUNT_VIEW.map((account) => ({
      ...account,
      ref: operationalAccountRef(ctx.waqfId, account.code),
    })),
    /**
     * ⚠ NAMED IN THE RESPONSE, not just in a docstring. Four receipt types have NO account because
     * Q6(f)–(i) of the Sharia review brief are unruled; a UI that renders this chart must be able to
     * say so rather than presenting a complete-looking list.
     */
    unruledSubjects: UNRULED_SUBJECT_VIEW,
    /** ⚠ The statutory SOCPA mapping belongs to the accredited accounting system and is not held here. */
    socpaMappingHeld: false as const,
  })),

  /**
   * ⊕ S11 item 2a — THE FINANCIAL BOARD'S READ: cash position, receipts and expenses, distributions,
   * arrears — for ONE endowment, from the ledger, with binding rule 1 visible on the wire.
   *
   * ⚠ REVENUE IS INCOME-CLASS RECEIPTS ONLY. Capital receipts (sale · istibdal · expropriation
   * compensation) are CORPUS and are reported APART, by source — never folded into "revenue". A board
   * that summed them together would be the corpus/income invariant broken in the one place a Nazir
   * reads it. A mutation pins this.
   *
   * SUMS are exact and go through the DOMAIN's `money()` (a Decimal branded at the halala) and
   * `toDbString` — no JS number touches money (the money lint ban and the source scan both pin it). A reversed original and
   * its reversal are BOTH excluded (owner ruling Q-E5-1(b), the same rule the waterfall applies), and a
   * row that has a live correction is excluded in favour of the correction.
   *
   * ARREARS are `NOT_MODELLED` — an explicit state, never a zero: a zero would assert "nothing owed";
   * this asserts "we do not track this yet", which is true (owner question on BR-902's meaning).
   *
   * COMMINGLING (KPI 2): the counts a chip needs to be green HONESTLY — how many accounts were checked,
   * how many are not dedicated, how many receipts sit on one. The database forbids the breach; the
   * chip still shows the numbers it did not find, not a bare green.
   */
  summary: endowmentScopedProcedure('finance:transaction:read').query(async ({ ctx }) => {
    const [waqfRow, accounts, transactions, distributions] = await Promise.all([
      /**
       * ⊕ S11 item 2c — THE DIRECT-UTILIZATION AXIS, because §14 §5.1(3) is a requirement ABOUT THIS
       * REPORT: *"Direct-utilization waqfs have no monetary distribution — the report states this
       * rather than showing zeros."* Without this column the financial screen cannot tell a
       * distributes-nothing-by-design endowment from one that simply has no money yet, and would have
       * to render §10's *"the dedicated waqf account must be linked first"* at an endowment where
       * linking one would change nothing.
       *
       * ⚠ THREE-VALUED, and the NULL is NOT "not direct use" — it means UNRECORDED (owner ruling
       * 2026-08-25, the two-axis classification). A caller asked about a NULL must say
       * `DIRECT_USE_UNRECORDED` and park the question, never guess a `false`.
       */
      ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId },
        select: { directUtilization: true },
      }),
      ctx.db.bankAccount.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null },
        select: { id: true, accountRef: true, purpose: true, isDedicated: true, currency: true },
        orderBy: { accountRef: 'asc' },
      }),
      ctx.db.transaction.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null },
        select: {
          id: true,
          type: true,
          receiptClass: true,
          capitalSource: true,
          expenseCategory: true,
          amountSar: true,
          bankAccountId: true,
          reversalOfId: true,
          reversedBy: { where: { deletedAt: null }, select: { id: true } },
          corrections: { where: { deletedAt: null }, select: { id: true } },
        },
      }),
      ctx.db.distribution.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null },
        select: { id: true, status: true, distributableSar: true, executedAt: true },
      }),
    ]);

    // Exact money through the DOMAIN: `money()` brands a Decimal(18,2) at the halala; `toDbString` renders
    // the canonical 2-dp string. No JS number touches an amount (the money lint ban and the source scan).
    const moneyOf = (amount: { toString(): string }): Money => money(String(amount));
    const sarOf = (value: Money): string => toDbString(value);

    const dedicatedIds = new Set(accounts.filter((a) => a.isDedicated).map((a) => a.id));
    const live = transactions.filter(
      (row) =>
        row.reversalOfId === null && row.reversedBy.length === 0 && row.corrections.length === 0,
    );
    const excluded = transactions.length - live.length;

    let income: Money = ZERO;
    let capital: Money = ZERO;
    let expenses: Money = ZERO;
    const capitalBySource = new Map<string, Money>();
    const expensesByCategory = new Map<string, Money>();
    const perAccount = new Map<
      string,
      { receipts: Money; capitalReceipts: Money; expenses: Money }
    >();
    let receiptsOnNonDedicated = 0;
    for (const row of live) {
      const amount = moneyOf(row.amountSar);
      const account = perAccount.get(row.bankAccountId) ?? {
        receipts: ZERO,
        capitalReceipts: ZERO,
        expenses: ZERO,
      };
      if (String(row.type) === 'REVENUE') {
        account.receipts = add(account.receipts, amount);
        if (!dedicatedIds.has(row.bankAccountId)) receiptsOnNonDedicated += 1;
        if (String(row.receiptClass) === 'CAPITAL') {
          capital = add(capital, amount);
          /**
           * ⚠ BINDING RULE 1 ON A PER-ACCOUNT ROW. The portfolio total has carried
           * `ofWhichCapitalSar` since S11-2a, but this per-account accumulator did not split by
           * class — so `netSar` below blended CORPUS and INCOME with nothing on the wire saying so,
           * and a Nazir reading one account row saw a single figure of which (on waqf-001) 93.9% was
           * istibdal proceeds: principal, never distributable. The class must travel WITH the
           * figure, at every altitude a figure is published.
           */
          account.capitalReceipts = add(account.capitalReceipts, amount);
          const source = String(row.capitalSource ?? 'UNSTATED');
          capitalBySource.set(source, add(capitalBySource.get(source) ?? ZERO, amount));
        } else {
          income = add(income, amount);
        }
      } else {
        account.expenses = add(account.expenses, amount);
        expenses = add(expenses, amount);
        const category = String(row.expenseCategory ?? 'UNSTATED');
        expensesByCategory.set(category, add(expensesByCategory.get(category) ?? ZERO, amount));
      }
      perAccount.set(row.bankAccountId, account);
    }

    const byStatus = new Map<string, number>();
    let executedDistributable: Money = ZERO;
    for (const run of distributions) {
      const status = String(run.status);
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      if (status === 'EXECUTED')
        executedDistributable = add(executedDistributable, moneyOf(run.distributableSar));
    }

    return {
      waqfId: ctx.waqfId,
      /**
       * `true` = the beneficiaries use the asset itself and NO ghallah is distributed (§14 §5.1(3));
       * `false` = a distributing endowment; `null` = **UNRECORDED**, never "not direct use". A screen
       * reading `null` must name it (`DIRECT_USE_UNRECORDED`) rather than resolve it.
       */
      directUtilization: waqfRow?.directUtilization ?? null,
      cashPosition: {
        totalSar: sarOf(sub(add(income, capital), expenses)),
        /** Cash that is CORPUS — inside the total, never distributable. */
        ofWhichCapitalSar: sarOf(capital),
        accounts: accounts.map((account) => {
          const sums = perAccount.get(account.id) ?? {
            receipts: ZERO,
            capitalReceipts: ZERO,
            expenses: ZERO,
          };
          return {
            id: account.id,
            accountRef: account.accountRef,
            purpose: account.purpose,
            isDedicated: account.isDedicated,
            currency: account.currency,
            netSar: sarOf(sub(sums.receipts, sums.expenses)),
            /**
             * REQUIRED, never optional — an optional companion reproduces the blending defect at the
             * first second consumer, the same reasoning as `StatTile`'s mandatory `status.label`.
             * `netSar` mixes classes by construction (receipts minus expenses); this says how much of
             * it is corpus, so the mixed figure can never be published without its qualifier.
             */
            ofWhichCapitalSar: sarOf(sums.capitalReceipts),
          };
        }),
      },
      receipts: {
        /** INCOME-class receipts ONLY — the only class that may ever enter the waterfall. */
        incomeSar: sarOf(income),
        /** CAPITAL-class receipts — corpus, shown APART, by source. */
        capitalSar: sarOf(capital),
        capitalBySource: [...capitalBySource.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([source, value]) => ({ source, amountSar: sarOf(value) })),
      },
      expenses: {
        totalSar: sarOf(expenses),
        byCategory: [...expensesByCategory.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, value]) => ({ category, amountSar: sarOf(value) })),
      },
      distributions: {
        count: distributions.length,
        byStatus: [...byStatus.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([status, count]) => ({ status, count })),
        executedDistributableSar: sarOf(executedDistributable),
      },
      /** ⚠ An explicit STATE, never a zero: nothing in the model records what is owed and unpaid. */
      arrears: { state: 'NOT_MODELLED' as const },
      commingling: {
        accountsChecked: accounts.length,
        nonDedicatedAccounts: accounts.filter((a) => !a.isDedicated).length,
        receiptsOnNonDedicated,
      },
      /** Reversed pairs and corrected originals, excluded from every sum above (Q-E5-1(b)). */
      excludedRows: excluded,
    };
  }),

  /**
   * Record a receipt that has ALREADY landed in the endowment's dedicated account.
   *
   * A maker write. Not maker-checked: nothing moves — the money is already there, and refusing to
   * record it until a second person approves would make the ledger less complete than the bank
   * statement, which is the opposite of what reconciliation needs.
   *
   * ⚠ THE CLASSIFICATION IS MANDATORY AT ENTRY AND HAS NO DEFAULT (binding rule 1, ADR-0002). The
   * database CHECK `transaction_revenue_requires_receipt_class` makes an unclassified receipt
   * unrepresentable; this refuses first, with the reason. Defaulting to `INCOME` is precisely how
   * sale proceeds become distributable ghallah.
   */
  recordRevenue: makerProcedure('finance:transaction:write')
    .input(
      z.object({
        bankAccountId: z.string().min(1).max(128),
        assetId: z.string().min(1).max(128).nullable().default(null),
        amountSar: moneyString,
        ...dualDateInput,
        descriptionAr: arabicText('descriptionAr', 500),
        descriptionEn: z.string().max(500).nullable().default(null),
        /** SOCPA-aligned operational category. ⚠ see `Transaction.category`'s TODO(surface). */
        category: z.string().min(1).max(120),
        receiptClass: receiptClassInput,
        capitalSource: capitalSourceInput.nullable().default(null),
        capitalSourceNoteAr: z.string().max(1000).nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const instant = new Date(input.date);
      assertHijriPairAgrees(instant, input.dateHijri, 'date', 'dateHijri');

      await assertPostableAccount(ctx.db, ctx.waqfId, input.bankAccountId);

      // Throws RECEIPT_UNCLASSIFIED / RECEIPT_CLASS_INCOHERENT before anything is written.
      const account = derivedAccountFor({
        type: 'REVENUE',
        receiptClass: input.receiptClass,
        capitalSource: input.capitalSource,
        expenseCategory: null,
      });

      // `capitalSource = OTHER` requires the Arabic justification (CHECK
      // transaction_capital_other_requires_note). Refused here so `OTHER` cannot become a silent
      // bucket — ADR-0002 §6 names a rising OTHER count as a signal the enum is wrong.
      if (input.capitalSource === 'OTHER') {
        const note = input.capitalSourceNoteAr;
        if (note === null || !/[؀-ۿݐ-ݿ]/u.test(note)) {
          throw new ApiError(
            'GATE_NOT_CLEARED',
            'capitalSource = OTHER requires capitalSourceNoteAr — an ARABIC justification saying what ' +
              'this corpus receipt actually is (CHECK transaction_capital_other_requires_note). OTHER is ' +
              'a pressure valve, not a bucket: a receipt nobody can name is a receipt nobody can audit.',
            { waqfId: ctx.waqfId },
          );
        }
      }

      const created = await auditedWrite(ctx.db, async (tx) =>
        // A `create` MAY project — it has no pre-image, so no diff can be falsified (C-08).
        tx.transaction.create({
          data: {
            waqfId: ctx.waqfId,
            type: 'REVENUE',
            category: input.category,
            receiptClass: input.receiptClass,
            capitalSource: input.capitalSource,
            capitalSourceNoteAr: input.capitalSourceNoteAr,
            descriptionAr: input.descriptionAr,
            descriptionEn: input.descriptionEn,
            amountSar: input.amountSar,
            date: instant,
            dateHijri: input.dateHijri,
            bankAccountId: input.bankAccountId,
            assetId: input.assetId,
            createdBy: ctx.actor.actorId,
          },
          select: { id: true, type: true, receiptClass: true, capitalSource: true },
        }),
      );

      return {
        transactionId: created.id,
        receiptClass: input.receiptClass,
        /** DERIVED from the classification — never stored, never supplied. */
        account: account.code,
        accountClass: account.accountClass,
        accountRef: operationalAccountRef(ctx.waqfId, account.code, input.assetId),
        /** Whether this receipt may ever reach the distribution waterfall. */
        distributable: account.distributable,
      };
    }),

  /**
   * BR-503 / FIN-ACC-04 — RECONCILE ONE DEDICATED ACCOUNT AGAINST A BANK STATEMENT.
   *
   * E5's third exit clause: *"a reconciliation run reports a deliberately-planted mismatch."* The
   * word carrying the weight is **reports** — the run turns a divergence into a named, attributable
   * line a Nazir can act on, and never into a silently absorbed difference.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * THE ARITHMETIC IS THE PURE ENGINE'S. THIS PROCEDURE ONLY FETCHES, CALLS, AND PERSISTS.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * `@qmulate/domain/reconciliation` decides every pairing and every finding. Nothing about
   * matching is re-implemented here, because the engine's two rules are the ones a transport layer
   * is most tempted to soften: **it never guesses a match** (an unreferenced entry is a FINDING,
   * not a gap for a heuristic), and **it never nets corpus against income** (one number per account
   * can read as "balanced" while a capital receipt covers an income shortfall inside the sum).
   *
   * ⚠ THE STATEMENT COMES FROM THE CALLER, AND THAT IS HONEST RATHER THAN PROVISIONAL. No Saudi
   * bank feed is evidenced anywhere in the source material, and the government-platform row of the
   * data model says the same thing about filings: these are manual status inputs, not integrations.
   * A fabricated "fetch the statement" step would be the most misleading thing this file could do.
   *
   * ⚠ `reconciledAt` IS WRITTEN ONLY ON CONFIRMED PAIRS, and only when `commit` is true. A run is
   * readable without changing anything — which is what makes it usable as a check rather than only
   * as a ritual — and a row is never stamped reconciled because it appeared in a run that happened.
   */
  reconcile: makerProcedure('finance:transaction:write')
    .input(
      z.object({
        bankAccountId: z.string().min(1).max(128),
        /** Inclusive window over `Transaction.date`. */
        periodStart: z.string().datetime({ offset: true }),
        periodEnd: z.string().datetime({ offset: true }),
        /**
         * The bank's own lines. Every one carries a reference: a statement line without one is not
         * a statement line, and accepting it would force the engine to guess.
         */
        statementLines: z
          .array(
            z.object({
              bankReference: z.string().min(1).max(128),
              direction: z.enum(['REVENUE', 'EXPENSE']),
              amountSar: moneyString,
              valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'valueDate is yyyy-MM-dd'),
            }),
          )
          .max(5000),
        /**
         * `false` (the default) reports without touching a row. ⚠ Deliberately opt-IN: a
         * reconciliation that stamps rows merely by being run makes "reconciled" mean "somebody
         * pressed the button", which is precisely the assurance a Nazir is signing.
         */
        commit: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPostableAccount(ctx.db, ctx.waqfId, input.bankAccountId);

      const rows = await ctx.db.transaction.findMany({
        where: {
          waqfId: ctx.waqfId,
          bankAccountId: input.bankAccountId,
          deletedAt: null,
          date: { gte: new Date(input.periodStart), lte: new Date(input.periodEnd) },
          // ⚠ A REVERSED ORIGINAL AND ITS REVERSAL ARE BOTH EXCLUDED (owner ruling Q-E5-1(b)).
          // The pair nets to zero by EXCLUSION rather than by arithmetic — there are no negative
          // amounts in this schema — so a reconciliation that included them would report the
          // corrected receipt AND the two rows that cancel each other, i.e. the money twice.
          reversalOfId: null,
          reversedBy: { none: {} },
        },
        select: {
          id: true,
          waqfId: true,
          bankAccountId: true,
          type: true,
          receiptClass: true,
          amountSar: true,
          date: true,
          bankReference: true,
        },
      });

      const ledgerEntries: LedgerEntry[] = rows.map((row) => ({
        id: row.id,
        waqfId: row.waqfId,
        bankAccountId: row.bankAccountId,
        direction: row.type as 'REVENUE' | 'EXPENSE',
        receiptClass: row.receiptClass as 'INCOME' | 'CAPITAL' | null,
        amount: money(String(row.amountSar)),
        valueDate: row.date.toISOString().slice(0, 10),
        bankReference: row.bankReference,
      }));

      const statementLines: StatementLine[] = input.statementLines.map((line) => ({
        bankReference: line.bankReference,
        bankAccountId: input.bankAccountId,
        direction: line.direction,
        amount: money(line.amountSar),
        valueDate: line.valueDate,
      }));

      // The pure run. `assertReconcilable` inside it refuses a cross-endowment or incoherent input
      // BEFORE any arithmetic — the domain-layer mirror of G-2.
      const result = reconcile({
        waqfId: ctx.waqfId,
        bankAccountId: input.bankAccountId,
        ledgerEntries,
        statementLines,
      });

      let stamped = 0;
      if (input.commit && result.pairs.length > 0) {
        const at = ctx.now;
        await auditedWrite(ctx.db, async (tx) => {
          for (const pair of result.pairs) {
            // ⚠ NO `select` ON AN AUDITED UPDATE (C-08): a projection makes the audit diff compare
            // full-vs-narrow and records every dropped column as "set to null".
            await tx.transaction.update({
              where: { id: pair.ledgerEntryId },
              data: { reconciledAt: at },
            });
            stamped += 1;
          }
        });
      }

      await recordEvent(toActorContext(ctx, { procedure: 'finance.reconcile' }), {
        // ⚠ `READ_SENSITIVE`, not `READ` — the latter is not a member of `AuditAction`, and the
        // audit extension refused the row rather than coercing it, which is the extension working.
        // A dry run IS a sensitive read: it discloses the whole of one endowment's account activity.
        action: input.commit ? 'UPDATE' : 'READ_SENSITIVE',
        category: 'MUTATION',
        // `SENSITIVE`, not an invented `INTERNAL`: `AuditClassification` is ROUTINE | SENSITIVE |
        // RESTRICTED, and a reconciliation discloses the whole of one endowment's account activity.
        classification: 'SENSITIVE',
        entityType: 'BankAccount',
        entityId: input.bankAccountId,
        waqfId: ctx.waqfId,
        extraContext: {
          balanced: result.balanced,
          pairs: result.pairs.length,
          exceptions: result.exceptions.length,
          // The findings BY NAME, in the trail, not merely a count.
          findings: result.exceptions.map((e) => e.finding).join(','),
          ledgerEntryCount: ledgerEntries.length,
          statementLineCount: statementLines.length,
          committed: input.commit,
          stamped,
        },
      });

      return {
        waqfId: result.waqfId,
        bankAccountId: result.bankAccountId,
        balanced: result.balanced,
        pairs: result.pairs.length,
        /** Every exception, BY NAME and with the row or reference it is about. */
        exceptions: result.exceptions.map((exception) => ({
          finding: exception.finding,
          ledgerEntryId: exception.ledgerEntryId,
          bankReference: exception.bankReference,
          direction: exception.direction,
          // ⚠ Money crosses this boundary as a 2-dp decimal STRING, never a Decimal instance and
          // never a JS number: there is deliberately no tRPC transformer, so a Decimal would reach
          // the client as `{}` and a number would be a float in a fiduciary figure.
          ledgerAmount: exception.ledgerAmount === null ? null : toDbString(exception.ledgerAmount),
          statementAmount:
            exception.statementAmount === null ? null : toDbString(exception.statementAmount),
          receiptClass: exception.receiptClass,
        })),
        /** ⚠ Split by class, always. There is deliberately no combined figure to mistake for the answer. */
        income: classTotals(result.income),
        capital: classTotals(result.capital),
        expense: classTotals(result.expense),
        committed: input.commit,
        reconciledAtWritten: stamped,
      };
    }),

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * `receiptClass` — CORRECTING A MIS-CLASSIFIED RECEIPT (product owner, 2026-08-18, Q-E5-1(b))
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * The owner's ruling, in three parts, all of them load-bearing:
   *   1. A correction is possible **in BOTH directions** — income→capital and capital→income.
   *   2. **EVERY** correction requires an approved reserved matter. *(Engineering had recommended
   *      asymmetric gating — free in the corpus-protecting direction, gated in the other. The owner
   *      chose the stricter uniform gate; this implements the owner's answer, not engineering's.)*
   *   3. It is a **SUPERSEDING RECORD** — a reversal entry plus a re-entered receipt, both audited
   *      — and **never an edit**.
   *
   * ⚠ THE DATABASE COLUMN GUARD DOES NOT MOVE, AND A READER WHO THINKS OTHERWISE HAS IT BACKWARDS.
   * `transaction_corpus_class_immutable` (migration 19 §4) still refuses every in-place
   * reclassification of a committed CAPITAL receipt, unconditionally, consulting no approval id.
   * That guard is precisely what forces a correction to be a record rather than an UPDATE. This
   * flow ADDS ROWS.
   *
   * ⚠ WHY THE REVERSAL MIRRORS INSTEAD OF NEGATING. `transaction_amount_nonnegative` holds and the
   * sign is carried by `type`, so a negative contra-entry is unrepresentable; and booking the
   * reversal as an EXPENSE would record a classification error as an operating outflow and corrupt
   * the waterfall's step 2. So the reversal is a row IDENTICAL to the original that declares itself
   * one (`transaction_correction_shape` enforces the mirror), and the pair nets to zero by
   * EXCLUSION. Every consumer must drop both — `finance.reconcile` above already does.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * `maintenanceReservePolicy` — THE NAZIR'S ṢIYĀNA DISCRETION UNDER A SILENT DEED (OQ-06)
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * Product owner, 2026-08-18, verbatim: *"the law gives the nazir a discretion. at Qmulate each
   * endownment will have a % set deserve at the nazir's discretion."* And on which seat records it
   * (the OQ-06 tail, same day): **(b), a DEDICATED permission string.**
   *
   * ⚠ THE INTERIM THIS REPLACES WAS WORSE THAN THE RECORD SAID, AND THE CORRECTION IS RECORDED
   * RATHER THAN QUIETLY FIXED. OQ-06's entry described the interim as "an ordinary Setting row
   * behind `checkerProcedure('fee:nazir_fee:approve')`". That was WRONG, measured while building
   * this: `settings.set` governs `nazirFee.*` keys and **refuses every other registered key**, so
   * `distribution.maintenance.nazirDiscretionPercent` had **no request-path write surface at all**.
   * The percentage was recordable only by a seed edit or raw SQL. So this procedure does not
   * replace a borrowed gate — it builds the path the ruling needs, with its own verb from the start.
   *
   * ⚠ `finance:maintenance_policy:write` SITS IN THE `nazir` PRESET AND IN NO OTHER — asserted in
   * both directions by `packages/domain`'s access suite. The `finance` seat holds every capture
   * verb and NOT this one, because reserving yield before distribution is a trustee's judgement
   * about the asset, not a bookkeeping act.
   *
   * ⚠ THE PERCENTAGE IS ⚠ UNVERIFIED, ALWAYS. The DISCRETION is the owner's ruling; any particular
   * figure is a number nobody has confirmed against primary law (binding rule 3), so the envelope
   * this writes carries `unverified: true` and it is not optional.
   */
  maintenanceReservePolicy: router({
    /** What percentage this endowment's Nazir has recorded, or that none has been recorded. */
    get: endowmentScopedProcedure('finance:maintenance_policy:read').query(async ({ ctx }) => {
      const row = await ctx.db.setting.findFirst({
        where: { waqfId: ctx.waqfId, key: MAINTENANCE_POLICY_SETTING_KEY, deletedAt: null },
        select: { value: true, updatedAt: true },
      });
      const envelope = (row?.value ?? null) as { v?: unknown; unverified?: unknown } | null;
      return {
        waqfId: ctx.waqfId,
        /** `null` means NOBODY HAS DECIDED — never "reserve nothing". The two are different runs. */
        ratePercent: typeof envelope?.v === 'string' ? envelope.v : null,
        recorded: row !== null,
        recordedAt: row?.updatedAt ?? null,
        unverified: true as const,
        note: "⚠ unverified — confirm vs primary law. The discretion is the owner's ruling; the figure is not.",
      };
    }),

    /**
     * Record (or revise) the percentage. A Nazir act, by the ruling's own words.
     *
     * ⚠ ZERO IS ACCEPTED AND IS NOT THE SAME AS NOT RECORDING ONE. `'0'` is the Nazir choosing to
     * reserve nothing, and the engine's `NAZIR_DISCRETION_PERCENT` kind carries it as a decision;
     * an absent row is `UNSET` and raises `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED`. That
     * distinction is the whole of OQ-06 and this procedure must not collapse it — which is why
     * there is deliberately no "clear the policy" verb here: un-deciding is not an act the ruling
     * describes, and a DELETE would silently turn a recorded zero back into nobody's answer.
     */
    set: makerProcedure('finance:maintenance_policy:write')
      .input(
        z.object({
          /** Out of 100 — `'5'` is five percent. Validated against the domain's own schema below. */
          ratePercent: z.string().min(1).max(16),
          /** Arabic-authoritative: the reasoning behind the Nazir's figure. */
          reasonAr: arabicText('reasonAr', 2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // ⚠ VALIDATED BY `@qmulate/domain`'s OWN SETTING SCHEMA, never by a regex here. The registry
        // is the one place that knows this key's shape, and a second validator in the transport
        // layer is how the two sides start disagreeing.
        const envelope = parseSetting(MAINTENANCE_POLICY_SETTING_KEY, {
          v: input.ratePercent,
          unit: 'percent',
          unverified: true,
          source: `Nazir discretion recorded via finance.maintenanceReservePolicy.set — ${input.reasonAr}`,
          // ⚠ NOT DECORATION AND NOT OPTIONAL. The registry's own refinement refuses an
          // `unverified: true` envelope that does not carry this exact marker — measured: the first
          // version of this procedure omitted it and `parseSetting` refused the write. That is the
          // binding-rule-3 machinery working: a figure cannot be stored as unverified while looking
          // settled to whatever renders it.
          note: UNVERIFIED_FIGURE_NOTE,
        });

        const before = await ctx.db.setting.findFirst({
          where: { waqfId: ctx.waqfId, key: MAINTENANCE_POLICY_SETTING_KEY },
          select: { id: true, value: true },
        });

        const written = await auditedWrite(ctx.db, async (tx) => {
          if (before === null) {
            return tx.setting.create({
              data: {
                id: `setting-${ctx.waqfId}-${MAINTENANCE_POLICY_SETTING_KEY}`,
                waqfId: ctx.waqfId,
                key: MAINTENANCE_POLICY_SETTING_KEY,
                value: envelope as never,
                createdBy: ctx.actor.actorId,
              },
              select: { id: true },
            });
          }
          // ⚠ NO `select` ON AN AUDITED UPDATE (C-08).
          await tx.setting.update({
            where: { id: before.id },
            data: { value: envelope as never, deletedAt: null },
          });
          return { id: before.id };
        });

        await recordEvent(
          toActorContext(ctx, { procedure: 'finance.maintenanceReservePolicy.set' }),
          {
            action: before === null ? 'CREATE' : 'UPDATE',
            category: 'MUTATION',
            classification: 'SENSITIVE',
            entityType: 'Setting',
            entityId: written.id,
            waqfId: ctx.waqfId,
            extraContext: {
              key: MAINTENANCE_POLICY_SETTING_KEY,
              ratePercent: input.ratePercent,
              reasonAr: input.reasonAr,
              // WHOSE decision this is. The engine's trace says the same thing on every run that
              // consumes it; a statement that cannot name the authority behind a deduction cannot
              // be defended to a beneficiary who asks why their share fell.
              reserveAuthority: 'NAZIR_DISCRETION',
              ruling: 'product owner 2026-08-18 — OQ-06 and its tail (dedicated permission)',
              unverified: true,
            },
          },
        );

        return {
          waqfId: ctx.waqfId,
          ratePercent: input.ratePercent,
          settingKey: MAINTENANCE_POLICY_SETTING_KEY,
          /** ⚠ Carried in the response so a UI cannot render the figure without the marker. */
          unverified: true as const,
        };
      }),
  }),

  receiptClass: router({
    /**
     * Step 1 — raise the reserved matter. Nothing is written to the ledger.
     *
     * The subject grammar is the ROW being corrected, so `approval_request_one_open_per_subject`
     * makes two simultaneously-open corrections of one receipt impossible.
     */
    /**
     * ⚠ THE GATE ON *RAISING* A CORRECTION IS `finance:transaction:write`, AND THAT WAS A CHOICE.
     *
     * The obvious alternative — `legal:reserved_matter:write`, the verb that says "this seat may
     * declare something a reserved matter" — was tried first and is NOT WORKABLE here, measured:
     * that verb sits in `nazir`, `case_manager`, `compliance_officer` and `admin`, and in `finance`
     * it is narrowed away by `grant ∩ preset`. So the seat that books receipts — the one that
     * discovers a mis-classification while reconciling — could not raise the correction at all,
     * while the `nazir` who could raise it then cannot approve it (maker ≠ checker), which blocks
     * the flow entirely for a single-Nazir engagement.
     *
     * What the owner's ruling actually gates is the **APPROVAL**: a RESERVED_MATTER of kind
     * `RECEIPT_CLASS_CORRECTION`, maker ≠ checker, NAZIR-only, with a fresh TOTP. An unapproved
     * request changes nothing at all — `executeCorrection` refuses it — so the cost of the wider
     * request gate is bounded by a guard that is not wide.
     *
     * ⚠ SURFACED FOR THE OWNER, NOT SETTLED (binding rule 4). Widening a guard later is safe;
     * narrowing a live one is not (D-5), so this is flagged rather than treated as decided.
     */
    requestCorrection: makerProcedure('finance:transaction:write')
      .input(
        z.object({
          transactionId: z.string().min(1).max(128),
          toReceiptClass: receiptClassInput,
          toCapitalSource: capitalSourceInput.nullable().default(null),
          toCapitalSourceNoteAr: z.string().max(1000).nullable().default(null),
          /** Arabic-authoritative: WHY the original classification was wrong. */
          reasonAr: arabicText('reasonAr', 2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const original = await loadCorrectableReceipt(ctx.db, ctx.waqfId, input.transactionId);

        if (original.receiptClass === input.toReceiptClass) {
          throw new ApiError(
            'GATE_NOT_CLEARED',
            `RECEIPT_CLASS_UNCHANGED: transaction ${input.transactionId} is already ` +
              `${input.toReceiptClass}. A correction that corrects nothing would still produce a ` +
              `reversal and a re-entry, i.e. two rows of noise in an append-only trail and a spent ` +
              `reserved-matter approval that authorised no change.`,
            { waqfId: ctx.waqfId, transactionId: input.transactionId },
          );
        }

        // The TARGET classification must itself be coherent, checked before an approval is minted —
        // a governance record authorising an unrepresentable end state is worse than no record.
        const targetAccount = derivedAccountFor({
          type: 'REVENUE',
          receiptClass: input.toReceiptClass,
          capitalSource: input.toCapitalSource,
          expenseCategory: null,
        });

        // ⚠ THE SUBJECT AS IT STANDS RIGHT NOW — INCLUDING ITS AMOUNT AND ITS DATE — GOES INTO THE
        // BYTES THE NAZIR SIGNS. See {@link correctionSubjectFacts}: an approval authorises the
        // reclassification of a SPECIFIC receipt as it read when the approver looked at it, and a
        // later edit invalidates that approval rather than riding it (AV7-F1).
        const pinned = correctionSubjectFacts(original);

        const minted = await mintApprovalRequest(ctx, {
          waqfId: ctx.waqfId,
          type: 'RESERVED_MATTER',
          reservedMatterKind: 'RECEIPT_CLASS_CORRECTION',
          subjectId: receiptCorrectionSubjectId(input.transactionId),
          payload: {
            transactionId: input.transactionId,
            ...pinned,
            toReceiptClass: input.toReceiptClass,
            toCapitalSource: input.toCapitalSource,
            toCapitalSourceNoteAr: input.toCapitalSourceNoteAr,
            reasonAr: input.reasonAr,
            targetAccount: targetAccount.code,
          },
          procedure: 'finance.receiptClass.requestCorrection',
        });

        return {
          approvalRequestId: minted.approvalRequestId,
          status: minted.status,
          fromReceiptClass: original.receiptClass,
          toReceiptClass: input.toReceiptClass,
          targetAccount: targetAccount.code,
          /**
           * ⚠ THE FIGURE THIS APPROVAL IS SCOPED TO, returned so a UI cannot show a Nazir a
           * reclassification without the amount it applies to. Same string that is inside
           * `payloadHash`.
           */
          fromAmountSar: pinned.fromAmountSar,
          fromDate: pinned.fromDate,
          /** ⚠ Nothing has changed yet, and the response says so rather than implying it has. */
          ledgerRowsWritten: 0 as const,
        };
      }),

    /**
     * Step 3 — write the superseding record. Step 2 is `approval.approve`.
     *
     * ONE transaction, THREE facts: the reversal, the re-entry, and the approval marked EXECUTED.
     * All or nothing — a reversal that committed without its re-entry would erase a receipt from
     * the endowment's books entirely, which is the one outcome worse than the mis-classification.
     */
    executeCorrection: makerProcedure('finance:transaction:write')
      .input(z.object({ approvalRequestId: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const approval = await ctx.db.approvalRequest.findFirst({
          where: { id: input.approvalRequestId },
          select: {
            id: true,
            waqfId: true,
            type: true,
            reservedMatterKind: true,
            status: true,
            subjectId: true,
            makerId: true,
            checkerId: true,
            payload: true,
          },
        });

        if (approval === null) {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            'APPROVAL_NOT_VISIBLE',
          );
        }
        // ⚠ TYPE FIRST, THEN KIND. An approval raised for another act carries a payloadHash that
        // still matches its OWN payload, so every later check looks healthy while the wrong act is
        // authorised. The KIND is the second half: the database cannot make that comparison,
        // because `ReservedMatterKind` lives in Prisma and this subject is a free-text string.
        if (approval.type !== 'RESERVED_MATTER') {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_APPROVAL_TYPE: the approval is ${String(approval.type)}, not RESERVED_MATTER`,
          );
        }
        if (String(approval.reservedMatterKind) !== 'RECEIPT_CLASS_CORRECTION') {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_KIND: the approval is ${String(approval.reservedMatterKind)}, not ` +
              `RECEIPT_CLASS_CORRECTION. An approved istibdal is not a licence to reclassify a receipt`,
          );
        }
        if (approval.status !== 'APPROVED') {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `APPROVAL_NOT_USABLE: status is ${String(approval.status)}, not APPROVED`,
          );
        }
        if (approval.waqfId !== ctx.waqfId) {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_ENDOWMENT: the approval belongs to waqf ${approval.waqfId}`,
          );
        }
        if (approval.checkerId === null || approval.checkerId === approval.makerId) {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `SEGREGATION_OF_DUTIES: maker ${approval.makerId} and checker ` +
              `${String(approval.checkerId)} are not two people`,
          );
        }

        const payload = (
          typeof approval.payload === 'object' && approval.payload !== null ? approval.payload : {}
        ) as Record<string, unknown>;
        const correction = parseApprovedCorrection(payload, ctx.waqfId, input.approvalRequestId);

        if (approval.subjectId !== receiptCorrectionSubjectId(correction.transactionId)) {
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_SUBJECT: the approval names ${JSON.stringify(approval.subjectId)}`,
          );
        }

        const original = await loadCorrectableReceipt(ctx.db, ctx.waqfId, correction.transactionId);

        // ── THE ROW MUST STILL BE WHAT THE APPROVER SAW — ALL FOUR PINNED FACTS ────────────────
        // Class, AMOUNT, capital source, DATE. Before AV7-F1 only the class was re-compared, and
        // that is how SAR 4,200,000 of corpus entered a distributable pool under an approval that
        // named SAR 1.00. See {@link correctionSubjectFacts} and {@link CORRECTION_SUBJECT_DRIFT}:
        // the loop is driven by an exhaustive record, so a fact added to the payload cannot be left
        // uncompared without a compile error.
        const nowReads = correctionSubjectFacts(original);
        for (const key of CORRECTION_DRIFT_ORDER) {
          const approved = correction[key];
          const current = nowReads[key];
          if (approved === current) continue;
          throw correctionNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            CORRECTION_SUBJECT_DRIFT[key](correction.transactionId, approved, current),
          );
        }

        const written = await auditedWrite(ctx.db, async (tx) => {
          // (a) THE REVERSAL — mirrors the original exactly. `transaction_correction_shape`
          // re-proves the mirror at the database, so a drift here is refused rather than committed.
          const reversal = await tx.transaction.create({
            data: {
              waqfId: ctx.waqfId,
              type: 'REVENUE',
              category: original.category,
              receiptClass: original.receiptClass,
              capitalSource: original.capitalSource,
              capitalSourceNoteAr: original.capitalSourceNoteAr,
              descriptionAr: `عكس قيد: ${original.descriptionAr}`,
              descriptionEn:
                original.descriptionEn === null ? null : `Reversal of: ${original.descriptionEn}`,
              amountSar: original.amountSar,
              date: original.date,
              dateHijri: original.dateHijri,
              bankAccountId: original.bankAccountId,
              assetId: original.assetId,
              bankReference: original.bankReference,
              reversalOfId: original.id,
              correctionApprovalRequestId: input.approvalRequestId,
              createdBy: ctx.actor.actorId,
            },
            select: { id: true },
          });

          // (b) THE RE-ENTRY — the corrected classification, on a NEW row.
          const reentry = await tx.transaction.create({
            data: {
              waqfId: ctx.waqfId,
              type: 'REVENUE',
              category: original.category,
              receiptClass: correction.toReceiptClass,
              capitalSource: correction.toCapitalSource,
              capitalSourceNoteAr: correction.toCapitalSourceNoteAr,
              descriptionAr: `${original.descriptionAr} — ${correction.reasonAr}`,
              descriptionEn: original.descriptionEn,
              amountSar: original.amountSar,
              date: original.date,
              dateHijri: original.dateHijri,
              bankAccountId: original.bankAccountId,
              assetId: original.assetId,
              bankReference: original.bankReference,
              correctionOfId: original.id,
              correctionApprovalRequestId: input.approvalRequestId,
              createdBy: ctx.actor.actorId,
            },
            select: { id: true },
          });

          // ⚠ NO `select` on the UPDATE (C-08).
          await tx.approvalRequest.update({
            where: { id: input.approvalRequestId },
            data: { status: 'EXECUTED' },
          });

          return { reversalId: reversal.id, reentryId: reentry.id };
        });

        await recordEvent(
          toActorContext(ctx, { procedure: 'finance.receiptClass.executeCorrection' }),
          {
            action: 'CREATE',
            category: 'MUTATION',
            classification: 'SENSITIVE',
            entityType: 'Transaction',
            entityId: written.reentryId,
            waqfId: ctx.waqfId,
            extraContext: {
              correctionOf: original.id,
              reversalId: written.reversalId,
              fromReceiptClass: correction.fromReceiptClass,
              toReceiptClass: correction.toReceiptClass,
              approvalRequestId: input.approvalRequestId,
              approvalMakerId: approval.makerId,
              approvalCheckerId: approval.checkerId,
              // ⚠ SAID IN THE TRAIL, not only in a docstring: the original row was NOT edited.
              originalRowEdited: false,
              shape: 'SUPERSEDING_RECORD',
            },
          },
        );

        const account = derivedAccountFor({
          type: 'REVENUE',
          receiptClass: correction.toReceiptClass,
          capitalSource: correction.toCapitalSource,
          expenseCategory: null,
        });

        return {
          originalTransactionId: original.id,
          reversalTransactionId: written.reversalId,
          reentryTransactionId: written.reentryId,
          fromReceiptClass: correction.fromReceiptClass,
          toReceiptClass: correction.toReceiptClass,
          account: account.code,
          accountClass: account.accountClass,
          /** The original still says what it said. Stated in the response, asserted in the suite. */
          originalRowEdited: false as const,
        };
      }),
  }),

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * `correctAmount` — AN IN-PLACE EDIT, WITH AN AUDIT EVENT (product owner, 2026-08-18, Q-E5-2(b))
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * ⚠ THIS PROCEDURE DELIBERATELY BREAKS THE HOUSE CONVENTION, AND THE MEMO SAYS SO IN TERMS. The
   * Shart al-Waqif, the trusteeship deed and (above) the receipt class all correct by SUPERSEDING
   * RECORD. A committed receipt's `amountSar` corrects **in place**, and the audit event carrying
   * before/after is the record of it. That is the owner's ruling, not a shortcut: bank statements
   * really are corrected, and a data-entry typo that could never be fixed would be permanent.
   *
   * ⚠ TWO WIRING QUESTIONS THE MEMO LEAVES OPEN, ANSWERED CONSERVATIVELY AND FLAGGED RATHER THAN
   * SETTLED (CLAUDE.md binding rule 4 — this is arguably policy, not mechanics):
   *
   *   (a) WHICH SEATS. Shipped on `finance:transaction:write`, held by `nazir`, `finance` and
   *       `admin` — the same verb that could have entered the wrong figure in the first place.
   *       The conservative alternative is a Nazir-only approve verb.
   *   (b) IS THE EDIT ITSELF MAKER-CHECKED? Shipped **not** maker-checked. The ruling says
   *       "in-place edit, audited", and adding an approval requirement the owner did not ask for
   *       would quietly re-answer the question he answered — a correction nobody can make in
   *       practice is the same as no correction flow, which is option (a) he rejected.
   *
   * → **Both are surfaced for the owner in OQ-06's neighbourhood and in BUILD-PLAN.** Widening a
   * guard later is safe; narrowing a live one is not (D-5), so the narrower reading was NOT
   * assumed.
   *
   * ⚠ WHAT IT CANNOT DO, whatever the seat: it cannot touch `receiptClass`, `type`, `waqfId` or
   * `bankAccountId`. Migration 19's guards refuse all four independently of this code.
   */
  correctAmount: makerProcedure('finance:transaction:write')
    .input(
      z.object({
        transactionId: z.string().min(1).max(128),
        amountSar: moneyString,
        /** Arabic-authoritative: WHY the figure was wrong. Never optional on a money correction. */
        reasonAr: arabicText('reasonAr', 2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.transaction.findFirst({
        where: { waqfId: ctx.waqfId, id: input.transactionId, deletedAt: null },
        select: { id: true, amountSar: true, type: true, receiptClass: true, reversalOfId: true },
      });
      if (before === null) {
        throw new ApiError(
          'SCOPE_REF_MISMATCH',
          `no transaction ${JSON.stringify(input.transactionId)} is visible on waqf ${ctx.waqfId}.`,
          { waqfId: ctx.waqfId, transactionId: input.transactionId },
        );
      }

      // ⚠ A REVERSAL'S AMOUNT IS NOT CORRECTABLE. It mirrors its original by construction, so
      // editing it would break the mirror `transaction_correction_shape` enforces — and the fix for
      // a wrong figure on a reversed receipt is to correct the RE-ENTRY, which is a live row.
      if (before.reversalOfId !== null) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `AMOUNT_ON_REVERSAL: transaction ${input.transactionId} is a reversal and mirrors the row ` +
            `it cancels. Correct the re-entry instead; a reversal whose amount differs from its ` +
            `original is a partial write-off wearing a correction's name.`,
          { waqfId: ctx.waqfId, transactionId: input.transactionId },
        );
      }

      const beforeAmount = toDbString(money(String(before.amountSar)));
      if (beforeAmount === input.amountSar) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `AMOUNT_UNCHANGED: transaction ${input.transactionId} already reads ${beforeAmount}. An ` +
            `audit event recording a change that did not happen makes the trail harder to read, not ` +
            `more complete.`,
          { waqfId: ctx.waqfId, transactionId: input.transactionId },
        );
      }

      await auditedWrite(ctx.db, async (tx) => {
        // ⚠ NO `select` (C-08). The audit extension diffs a full pre-image against this result; a
        // projection would record every dropped column as "set to null" and the hash chain would
        // seal that as authentic.
        await tx.transaction.update({
          where: { id: input.transactionId },
          data: { amountSar: input.amountSar },
        });
      });

      await recordEvent(toActorContext(ctx, { procedure: 'finance.correctAmount' }), {
        action: 'UPDATE',
        category: 'MUTATION',
        classification: 'SENSITIVE',
        entityType: 'Transaction',
        entityId: input.transactionId,
        waqfId: ctx.waqfId,
        extraContext: {
          // BEFORE AND AFTER, explicitly, because this is the ONE money field in the system that
          // moves in place — the ruling's own words — and the event is the whole record of it.
          amountBefore: beforeAmount,
          amountAfter: input.amountSar,
          reasonAr: input.reasonAr,
          ruling: 'S4 owner-decision memo Q-E5-2(b), 2026-08-18 — in-place edit, audited',
          shape: 'IN_PLACE_EDIT',
        },
      });

      return {
        transactionId: input.transactionId,
        amountBefore: beforeAmount,
        amountAfter: input.amountSar,
        /** ⚠ Named in the response: this is NOT the superseding-record shape used elsewhere. */
        shape: 'IN_PLACE_EDIT' as const,
      };
    }),

  bankMovement: router({
    /**
     * Step 1 of 3 — a MAKER raises a bank movement. **No ledger row is written.**
     *
     * The whole artifact travels in the approval's `payload`, and `execute` reads the movement from
     * there rather than from its own caller. That is what makes the approval an approval of
     * something specific rather than a blank cheque: `payloadHash` binds it, and a payload changed
     * after approval voids it instead of executing.
     */
    request: makerProcedure('distribution:bank_movement:initiate')
      .input(
        z.object({
          /** The maker's own reference for the payment. Part of the approval's subject id. */
          movementRef: z.string().min(1).max(64),
          bankAccountId: z.string().min(1).max(128),
          assetId: z.string().min(1).max(128).nullable().default(null),
          amountSar: moneyString,
          ...dualDateInput,
          descriptionAr: arabicText('descriptionAr', 500),
          descriptionEn: z.string().max(500).nullable().default(null),
          category: z.string().min(1).max(120),
          expenseCategory: expenseCategoryInput,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const instant = new Date(input.date);
        assertHijriPairAgrees(instant, input.dateHijri, 'date', 'dateHijri');

        // Refused BEFORE an approval is minted, not after it is approved. A governance record
        // promising a payment the system can never post is worse than no record — the same reasoning
        // `requestReservedAct` uses for an act with no representable end state.
        await assertPostableAccount(ctx.db, ctx.waqfId, input.bankAccountId);

        const account = derivedAccountFor({
          type: 'EXPENSE',
          receiptClass: null,
          capitalSource: null,
          expenseCategory: input.expenseCategory,
        });

        // ⚠ ONE MINTING PATH (`mintApprovalRequest`), shared with `approval.initiate` and the
        // reserved-matter acts. `makerId` is the ACTING identity and never an input — a
        // caller-supplied maker would let the maker nominate somebody else and walk straight through
        // maker ≠ checker.
        const minted = await mintApprovalRequest(ctx, {
          waqfId: ctx.waqfId,
          type: 'BANK_MOVEMENT',
          subjectId: bankMovementSubjectId(ctx.waqfId, input.movementRef),
          payload: {
            movementRef: input.movementRef,
            bankAccountId: input.bankAccountId,
            assetId: input.assetId,
            // Already a string. `canonicalJson` throws on a number, which is the point.
            amountSar: input.amountSar,
            date: instant.toISOString(),
            dateHijri: input.dateHijri,
            descriptionAr: input.descriptionAr,
            descriptionEn: input.descriptionEn,
            category: input.category,
            expenseCategory: input.expenseCategory,
            account: account.code,
          },
          procedure: 'finance.bankMovement.request',
        });

        return {
          approvalRequestId: minted.approvalRequestId,
          status: minted.status,
          payloadHash: minted.payloadHash,
          account: account.code,
          /** ⚠ Stated in the response so no caller mistakes a raised request for a posted payment. */
          ledgerRowWritten: false as const,
        };
      }),

    /**
     * Step 3 of 3 — post the approved movement to the ledger.
     *
     * Step 2 is `approval.approve` (root.ts): maker ≠ checker on the PERSISTED `makerId`, an ACTIVE
     * NAZIR grant on this endowment, a `Setting`-driven TOTP step-up, the payload fingerprint, and
     * the open-status gate. None of it is restated here.
     *
     * ⚠ THE TYPE IS ASSERTED FIRST, BEFORE THE SUBJECT AND BEFORE ANYTHING ELSE. An approval raised
     * for one act must never be spendable on another, and a `RESERVED_MATTER` or `DISTRIBUTION_RUN`
     * approval reaching this path would have a `payloadHash` that still matches its OWN payload — so
     * every downstream check looks healthy while the wrong thing is authorised. The type is the only
     * check that catches it.
     */
    execute: makerProcedure('finance:transaction:write')
      .input(
        z.object({
          approvalRequestId: z.string().min(1).max(128),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const approval = await ctx.db.approvalRequest.findFirst({
          where: { id: input.approvalRequestId },
          select: {
            id: true,
            waqfId: true,
            type: true,
            status: true,
            subjectId: true,
            makerId: true,
            checkerId: true,
            payload: true,
          },
        });

        if (approval === null) {
          throw movementNotAuthorised(ctx.waqfId, input.approvalRequestId, 'APPROVAL_NOT_VISIBLE');
        }

        // ── (1) THE TYPE, FIRST ────────────────────────────────────────────────────────────
        if (approval.type !== 'BANK_MOVEMENT') {
          throw movementNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_APPROVAL_TYPE: the approval is ${String(approval.type)}, not BANK_MOVEMENT. An ` +
              `approval raised for one act is never a licence for another — and its payloadHash still ` +
              `matches its OWN payload, so every later check would look healthy while the wrong act ` +
              `was authorised`,
          );
        }

        // ── (2) status, endowment, and a genuine second authority ─────────────────────────
        if (approval.status !== 'APPROVED') {
          throw movementNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `APPROVAL_NOT_USABLE: status is ${String(approval.status)}, not APPROVED`,
          );
        }
        if (approval.waqfId !== ctx.waqfId) {
          throw movementNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_ENDOWMENT: the approval belongs to waqf ${approval.waqfId}`,
          );
        }
        if (approval.checkerId === null || approval.checkerId === approval.makerId) {
          // Belt over the CHECK `approval_request_checker_ne_maker` and the
          // `approval_request_authority` trigger. Re-proven at spend time because an APPROVED row is
          // durable and this is the last moment before money is recorded as having moved.
          throw movementNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `SEGREGATION_OF_DUTIES: maker ${approval.makerId} and checker ` +
              `${String(approval.checkerId)} are not two people`,
          );
        }

        // ── (3) THE MOVEMENT IS READ FROM THE APPROVED ARTIFACT, NEVER FROM THIS CALL ─────
        const payload = (
          typeof approval.payload === 'object' && approval.payload !== null ? approval.payload : {}
        ) as Record<string, unknown>;
        const movement = parseApprovedMovement(payload, ctx.waqfId, input.approvalRequestId);

        if (approval.subjectId !== bankMovementSubjectId(ctx.waqfId, movement.movementRef)) {
          throw movementNotAuthorised(
            ctx.waqfId,
            input.approvalRequestId,
            `WRONG_SUBJECT: the approval names ${JSON.stringify(approval.subjectId)}, which is not ` +
              `this endowment's subject for movementRef ${JSON.stringify(movement.movementRef)}`,
          );
        }

        // Re-checked at EXECUTE time, not only at request time: an account may have been retired, or
        // its `isDedicated` flipped, between approval and posting.
        await assertPostableAccount(ctx.db, ctx.waqfId, movement.bankAccountId);

        const account = derivedAccountFor({
          type: 'EXPENSE',
          receiptClass: null,
          capitalSource: null,
          expenseCategory: movement.expenseCategory,
        });

        const posted = await auditedWrite(ctx.db, async (tx) => {
          const row = await tx.transaction.create({
            data: {
              waqfId: ctx.waqfId,
              type: 'EXPENSE',
              category: movement.category,
              expenseCategory: movement.expenseCategory,
              descriptionAr: movement.descriptionAr,
              descriptionEn: movement.descriptionEn,
              amountSar: movement.amountSar,
              date: new Date(movement.date),
              dateHijri: movement.dateHijri,
              bankAccountId: movement.bankAccountId,
              assetId: movement.assetId,
              createdBy: ctx.actor.actorId,
            },
            select: { id: true },
          });

          // EXECUTED, not left APPROVED: a non-terminal status keeps the one-open-per-subject slot
          // occupied and would block the next legitimate movement on this reference. It also stops
          // one approval being spent twice.
          // ⚠ NO `select` on an UPDATE (C-08) — a projection makes the audit diff compare
          // full-vs-narrow and record every dropped column as "set to null".
          await tx.approvalRequest.update({
            where: { id: input.approvalRequestId },
            data: { status: 'EXECUTED' },
          });

          return row;
        });

        await recordEvent(toActorContext(ctx, { procedure: 'finance.bankMovement.execute' }), {
          action: 'CREATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'Transaction',
          entityId: posted.id,
          waqfId: ctx.waqfId,
          extraContext: {
            // The trail proves the AUTHORITY, not merely that a row appeared (BR-607, NFR-04).
            approvalRequestId: input.approvalRequestId,
            approvalMakerId: approval.makerId,
            approvalCheckerId: approval.checkerId,
            movementRef: movement.movementRef,
            account: account.code,
            accountClass: account.accountClass,
            amountSar: movement.amountSar,
            bankAccountId: movement.bankAccountId,
          },
        });

        return {
          transactionId: posted.id,
          approvalRequestId: input.approvalRequestId,
          account: account.code,
          accountClass: account.accountClass,
          makerId: approval.makerId,
          checkerId: approval.checkerId,
        };
      }),
  }),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The approved artifact, re-validated. An unreadable payload REFUSES; it is never partly applied. */
function parseApprovedMovement(
  payload: Record<string, unknown>,
  waqfId: string,
  approvalRequestId: string,
): {
  movementRef: string;
  bankAccountId: string;
  assetId: string | null;
  amountSar: string;
  date: string;
  dateHijri: string;
  descriptionAr: string;
  descriptionEn: string | null;
  category: string;
  expenseCategory: z.infer<typeof expenseCategoryInput>;
} {
  const parsed = z
    .object({
      movementRef: z.string().min(1).max(64),
      bankAccountId: z.string().min(1).max(128),
      assetId: z.string().min(1).max(128).nullable(),
      amountSar: moneyString,
      date: z.string().datetime({ offset: true }),
      dateHijri: z.string().regex(HIJRI_SNAPSHOT_PATTERN),
      descriptionAr: z.string().min(1).max(500),
      descriptionEn: z.string().max(500).nullable(),
      category: z.string().min(1).max(120),
      expenseCategory: expenseCategoryInput,
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw movementNotAuthorised(
      waqfId,
      approvalRequestId,
      `APPROVED_ARTIFACT_UNREADABLE: the approved payload does not describe a bank movement ` +
        `(${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}). ` +
        `Refusing beats posting the readable half — a partial payment is not a smaller version of ` +
        `the approved one`,
    );
  }
  return parsed.data;
}

/** Class totals as decimal strings — see the note on the exception amounts above. */
function classTotals(totals: ClassTotals): {
  readonly reconciledIn: string;
  readonly unreconciledIn: string;
} {
  return {
    reconciledIn: toDbString(totals.reconciledIn),
    unreconciledIn: toDbString(totals.unreconciledIn),
  };
}

/**
 * The `Setting` key holding a Nazir's recorded ṣiyāna percentage for one endowment (OQ-06).
 *
 * ⚠ PER-ENDOWMENT ONLY. There is deliberately no global row: a platform-wide default percentage
 * would be a figure nobody chose applied to every endowment — the exact defect OQ-06 opened — and
 * because `pickMostSpecific` falls back to the global row, one would make "no policy recorded"
 * unrepresentable.
 */
export const MAINTENANCE_POLICY_SETTING_KEY = 'distribution.maintenance.nazirDiscretionPercent';

/** The exact marker every unverified `Setting` envelope must carry (binding rule 3). */
const UNVERIFIED_FIGURE_NOTE = '⚠ unverified — confirm vs primary law';

/** The subject a receipt-correction approval must name. ONE definition, used to mint and to verify. */
export function receiptCorrectionSubjectId(transactionId: string): string {
  return `receipt-class:${transactionId}`;
}

/** The receipt being corrected, with everything the reversal must mirror. */
async function loadCorrectableReceipt(
  db: ExtendedPrismaClient,
  waqfId: string,
  transactionId: string,
) {
  const row = await db.transaction.findFirst({
    where: { waqfId, id: transactionId, deletedAt: null },
    select: {
      id: true,
      type: true,
      category: true,
      receiptClass: true,
      capitalSource: true,
      capitalSourceNoteAr: true,
      descriptionAr: true,
      descriptionEn: true,
      amountSar: true,
      date: true,
      dateHijri: true,
      bankAccountId: true,
      assetId: true,
      bankReference: true,
      reversalOfId: true,
      correctionOfId: true,
    },
  });

  if (row === null) {
    throw new ApiError(
      'SCOPE_REF_MISMATCH',
      `no transaction ${JSON.stringify(transactionId)} is visible on waqf ${waqfId}.`,
      { waqfId, transactionId },
    );
  }
  if (row.type !== 'REVENUE') {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `NOT_A_RECEIPT: transaction ${transactionId} is an EXPENSE. Only a REVENUE receipt carries an ` +
        `income-vs-capital classification at all (ADR-0002), so there is nothing here to correct.`,
      { waqfId, transactionId },
    );
  }
  if (row.reversalOfId !== null) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `ALREADY_A_REVERSAL: transaction ${transactionId} cancels another row and is not itself a live ` +
        `receipt. Correcting it would start a chain, and then no reader can tell which rows are live ` +
        `without walking the whole chain.`,
      { waqfId, transactionId },
    );
  }
  return row;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE FACTS A RECEIPT-CORRECTION APPROVAL PINS — ONE definition, used to MINT and to VERIFY
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ WHY THIS EXISTS: THE PAYLOAD USED TO NAME NO MONEY AT ALL, and that is how SAR 4,200,000 of
 * corpus entered a distributable pool on a Nazir approval that named SAR 1.00 (AV7-F1). Measured on
 * this branch before the fix, with no raw SQL and a genuine second-Nazir approval: the run's
 * `distributableSar` moved 410,000.00 → 4,190,000.00 (a delta of 378,000,000 halalas), and
 * afterwards the run reported `capitalReceiptsSar 0.00` with `CAPITAL_RECEIPTS_EXCLUDED` ABSENT and
 * `excludedCapitalReceipts` empty — nothing in the record said corpus had ever been there. The
 * approval's `payloadHash` still verified against its own payload, so nothing looked wrong.
 *
 * ⚠ THE DIRECTION OF THE REFUSAL MATTERS AND IS NOT NEGOTIABLE. `finance.correctAmount` — an
 * in-place, audited, un-approved amount edit — is LEGAL and stays legal: the product owner ruled it
 * so (S4 memo Q-E5-2(b)), and a typo nobody can fix is worse than no correction flow at all. What
 * was NEVER ruled is that such an edit may silently RE-SCOPE an approval already given. So these
 * comparisons refuse the DRIFT — *the approval described N, the row now says M* — and say what to do
 * about it. They do not forbid the edit and they must never be reworded to sound as if they do.
 *
 * ⚠ WHAT THIS DOES **NOT** CLOSE, stated so nobody reads it as more than it is: a maker may still
 * move an INCOME row's amount, and therefore the pool, with one un-approved call (AV7-F7 / A-12,
 * registered separately — MEASURED: `distributableSar` 410,000.00 → 8,960,000.00). That is the
 * owner-ruled shape of `correctAmount`, not this guard's business. What closes here is narrower and
 * exact: **a reclassification can no longer be executed at a magnitude, on a date, or from a capital
 * source the approver never saw.**
 *
 * ⚠ ONE RESIDUAL WINDOW, READ FROM THE TRIGGER RATHER THAN DRIVEN (single-process harness, so it
 * is FLAGGED not claimed): the comparison reads the row BEFORE `auditedWrite` opens its transaction,
 * so a concurrent edit landing in between would leave the reversal mirroring a figure the original no
 * longer carries. For `amountSar` the database is the second line and it holds —
 * `qmulate_transaction_correction_shape()` (migration 20 §5) re-proves type / receiptClass /
 * capitalSource / amountSar / bankAccountId against the original AT COMMIT and raises 42501. For
 * `date` it does NOT: `date` is absent from that mirror, which is AV7-F5's registered fix direction
 * and a second, independent reason for it. Neither race is driven anywhere in this repo today.
 *
 * ⚠ `bankAccountId` AND `waqfId` ARE DELIBERATELY NOT PINNED HERE — not an oversight. Migration 19's
 * `transaction_endowment_immutable` makes both unrepresentable-to-move on a committed receipt, so a
 * comparison here would be a second copy of a guarantee the database already gives. `amountSar`,
 * `date` and `capitalSource` have no such trigger (migration 19 §4 refuses CAPITAL → not-CAPITAL and
 * nothing narrower), which is exactly why they are pinned.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

/** The subject row's identity-as-the-approver-saw-it. Every member is a canonical STRING or `null`. */
interface CorrectionSubjectFacts {
  readonly fromReceiptClass: 'INCOME' | 'CAPITAL';
  /** 2-dp decimal string, canonicalised through `money()` so `1` and `1.00` cannot disagree. */
  readonly fromAmountSar: string;
  readonly fromCapitalSource: z.infer<typeof capitalSourceInput> | null;
  /**
   * The row's `date` as an ISO-8601 instant.
   *
   * ⚠ `dateHijri` IS NOT SEPARATELY PINNED, and that is reasoned rather than forgotten: a receipt
   * cannot be written at all unless its supplied Hijri snapshot IS the Umm-al-Qura snapshot of this
   * instant — `assertHijriPairAgrees` refuses the pair with `DUAL_DATE_MISMATCH` at entry — so at
   * write time the two halves agree and pinning the Gregorian half pins both. What a later raw-SQL
   * `date` shift does is move one half and leave the other, and that is caught HERE by name; A-1b in
   * `av7-corpus-wall.integration.test.ts` drives it on the runtime credential.
   */
  readonly fromDate: string;
}

/**
 * Read the pinned facts off a live row.
 *
 * ⚠ CANONICALISED, not stringified: `Decimal(18,2)` prints `4200000` for some values and
 * `4200000.00` for others depending on how it was constructed, and a comparison of two spellings of
 * one number is a guard that fails open on a formatting accident. `toDbString(money(...))` is the
 * same normalisation `correctAmount` uses for its own before/after, so the two sides cannot drift.
 */
function correctionSubjectFacts(row: {
  readonly receiptClass: unknown;
  readonly capitalSource: unknown;
  readonly amountSar: string | { toString(): string };
  readonly date: Date;
}): CorrectionSubjectFacts {
  return {
    fromReceiptClass: String(row.receiptClass) as CorrectionSubjectFacts['fromReceiptClass'],
    fromAmountSar: toDbString(money(String(row.amountSar))),
    fromCapitalSource: (row.capitalSource === null
      ? null
      : String(row.capitalSource)) as CorrectionSubjectFacts['fromCapitalSource'],
    fromDate: row.date.toISOString(),
  };
}

/**
 * One sentence per pinned fact, keyed by the fact itself.
 *
 * ⚠ THE `Record<keyof CorrectionSubjectFacts, …>` TYPE IS THE LOAD-BEARING PART: adding a fact to
 * {@link CorrectionSubjectFacts} without giving it a refusal sentence here is a COMPILE ERROR, and
 * the comparison loop is driven by these keys — so a fact cannot be pinned into the payload and then
 * left uncompared, which is precisely the shape of the defect this closes.
 */
const CORRECTION_SUBJECT_DRIFT: Readonly<
  Record<
    keyof CorrectionSubjectFacts,
    (transactionId: string, approved: string | null, current: string | null) => string
  >
> = {
  fromReceiptClass: (_id, approved, current) =>
    `SUBJECT_MOVED: the approval was raised against receiptClass ${String(approved)}; the row now ` +
    `reads ${String(current)}`,
  fromAmountSar: (id, approved, current) =>
    `SUBJECT_AMOUNT_MOVED: the approval was raised against transaction ${id} reading SAR ` +
    `${String(approved)}; the row now reads SAR ${String(current)}. The amount edit itself is ` +
    `legal and audited (product owner, S4 memo Q-E5-2(b)) — what is refused here is an edit ` +
    `SILENTLY RE-SCOPING an approval already given: a Nazir who authorised moving SAR ` +
    `${String(approved)} between corpus and income did not authorise moving SAR ${String(current)}. ` +
    `Raise a fresh correction against the row as it now stands, or restore the figure the approval ` +
    `names`,
  fromCapitalSource: (id, approved, current) =>
    `SUBJECT_CAPITAL_SOURCE_MOVED: the approval was raised against transaction ${id} carrying ` +
    `capitalSource ${JSON.stringify(approved)}; the row now carries ${JSON.stringify(current)}. ` +
    `Which corpus a receipt came from is part of what the approver read — sale proceeds, istibdal ` +
    `proceeds and expropriation compensation are not interchangeable — so the substituted source ` +
    `is a different act from the approved one`,
  fromDate: (id, approved, current) =>
    `SUBJECT_DATE_MOVED: the approval was raised against transaction ${id} dated ${String(approved)}; ` +
    `the row is now dated ${String(current)}. The date decides WHICH PERIOD's waterfall this receipt ` +
    `belongs to, so a re-dated row is a different receipt for every purpose a distribution run has`,
};

/**
 * The comparison order — class, then amount, then source, then date.
 *
 * `Object.keys` on a string-keyed object preserves insertion order (ECMA-262 §OrdinaryOwnPropertyKeys),
 * so the declaration order above IS this order; the cast is only to recover the key type.
 */
const CORRECTION_DRIFT_ORDER = Object.keys(
  CORRECTION_SUBJECT_DRIFT,
) as readonly (keyof CorrectionSubjectFacts)[];

/** The approved correction, re-validated. An unreadable payload REFUSES; it is never partly applied. */
function parseApprovedCorrection(
  payload: Record<string, unknown>,
  waqfId: string,
  approvalRequestId: string,
) {
  const parsed = z
    .object({
      transactionId: z.string().min(1).max(128),
      fromReceiptClass: receiptClassInput,
      fromCapitalSource: capitalSourceInput.nullable(),
      /**
       * ⚠ REQUIRED, NOT OPTIONAL, AND THAT IS THE FIX (AV7-F1). An approval minted before this
       * field existed carries no money and therefore CANNOT be executed — it fails
       * `APPROVED_ARTIFACT_UNREADABLE` and must be re-raised. That is the correct direction: a
       * governance record that never named a figure cannot be retro-fitted with one here, because
       * the figure would be whatever the row happens to say now, which is the defect itself. There
       * are no such rows in the seed (`RECEIPT_CLASS_CORRECTION` appears in no fixture) — verified,
       * not assumed.
       */
      fromAmountSar: moneyString,
      fromDate: z.string().datetime({ offset: true }),
      toReceiptClass: receiptClassInput,
      toCapitalSource: capitalSourceInput.nullable(),
      toCapitalSourceNoteAr: z.string().max(1000).nullable(),
      reasonAr: z.string().min(1).max(2000),
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw correctionNotAuthorised(
      waqfId,
      approvalRequestId,
      `APPROVED_ARTIFACT_UNREADABLE: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/** The classification did not change, and the record says why. */
function correctionNotAuthorised(
  waqfId: string,
  approvalRequestId: string,
  detail: string,
): ApiError {
  return new ApiError(
    'GATE_NOT_CLEARED',
    `RECEIPT_CORRECTION_NOT_AUTHORISED: a receipt's income-vs-capital classification may only be ` +
      `corrected under an APPROVED, maker <> checker RESERVED_MATTER of kind ` +
      `RECEIPT_CLASS_CORRECTION naming THIS receipt (product owner, 2026-08-18, S4 memo Q-E5-1(b)). ` +
      `The correction is a SUPERSEDING RECORD — a mirrored reversal plus a re-entry, both audited — ` +
      `and never an edit: migration 19's corpus guard refuses the in-place change unconditionally. ` +
      `waqf ${waqfId}, approvalRequestId ${approvalRequestId}: ${detail}.`,
    { waqfId, approvalRequestId, reason: 'RECEIPT_CORRECTION_NOT_AUTHORISED', detail },
  );
}

/** Money did not move, and the record says why. */
function movementNotAuthorised(
  waqfId: string,
  approvalRequestId: string,
  detail: string,
): ApiError {
  return new ApiError(
    'GATE_NOT_CLEARED',
    `BANK_MOVEMENT_NOT_AUTHORISED: money may not leave waqf ${waqfId}'s dedicated account without an ` +
      `APPROVED, maker <> checker BANK_MOVEMENT approval naming THIS movement (§10 §4.2, BR-501, ` +
      `release gate G-3). approvalRequestId ${approvalRequestId}: ${detail}.`,
    { waqfId, approvalRequestId, reason: 'BANK_MOVEMENT_NOT_AUTHORISED', detail },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Static views of the chart — computed ONCE at import, so `chartOfAccounts` stays synchronous
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const OPERATIONAL_ACCOUNT_VIEW = OPERATIONAL_ACCOUNTS.map((account) => ({
  code: account.code,
  accountClass: account.accountClass,
  nameAr: account.nameAr,
  nameEn: account.nameEn,
  distributable: account.distributable,
  unverified: account.unverified,
  socpaAccountCode: account.socpaAccountCode,
}));

const UNRULED_SUBJECT_VIEW = UNRULED_RECEIPT_SUBJECTS.map((subject) => ({
  subject: subject.subject,
  labelAr: subject.labelAr,
  labelEn: subject.labelEn,
  question: subject.question,
  why: subject.why,
}));
