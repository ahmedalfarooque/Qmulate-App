/**
 * `distribution/waterfall.ts` — Stage 1 of the distribution engine (PRD §08).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ORDER IS FIXED BY REGULATION AND IS NOT CONFIGURABLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *     revenue (ghallah / غلة)
 *       − ṣiyāna / صيانة  (the maintenance reserve — FIRST, always)      ← step 1
 *       − operating / management cost                                      ← step 2
 *       − Nazir fee (ʿushr / عُشر, set by the DEED — Nazarah Art. 11)      ← step 3
 *       = distributable
 *
 * Nothing in this module lets a caller reorder those three deductions, and no `Setting` selects an
 * order: ṣiyāna comes out before any operating cost, before any fee, and before any payout, because
 * that is what the regulation and this engagement's deed say. What *is* configurable is each
 * deduction's own **rule** (a fixed amount, a percentage, a top-up to a target balance, or none) and
 * each **rate** — every one of which arrives as an argument, never as a constant in this file.
 *
 * ⚠ The Nazir-fee rate applied here (this deed: 10% of revenue, customary ʿushr) is
 * **unverified — may be stale; confirm vs primary law** (CLAUDE.md binding rule 3). It reaches the
 * engine from `Setting nazirFee.percentOfRevenue`; grep this file for a rate and you will find none.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * FEE BASIS AND DEDUCTION POSITION ARE INDEPENDENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `PERCENT_OF_NET_INCOME` computes the fee on `revenue − reserve − operating`, but the fee is still
 * *deducted at step 3*. Basis answers "of what?"; position answers "when?". Conflating them is how a
 * net-income fee ends up reducing the base the reserve was computed from.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CORPUS GUARD LIVES HERE (S3 decision D1 — CLAUDE.md binding rule 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Stage 1 is the only door money enters the engine through, so {@link assertIncomeProvenance} runs
 * **before any arithmetic at all**. Corpus (asl / أصل) — sale proceeds, istibdal / استبدال proceeds,
 * expropriation compensation — is never income (ghallah / غلة), is never distributed, and is never
 * reclassified. The guard therefore refuses three distinct ways of smuggling it in:
 *
 *  1. a receipt whose class is not exactly `INCOME` or `CAPITAL`, a `CAPITAL` receipt naming no
 *     `capitalSource`, an `INCOME` receipt that *does* name one, or a declared income figure with no
 *     receipts behind it at all → `RECEIPT_UNCLASSIFIED`. **A caller that cannot show the
 *     classification is REFUSED, never trusted**: a bare revenue total is indistinguishable from
 *     istibdal proceeds, which is exactly why `revenue` carries provenance instead of a scalar.
 *  2. more declared income than the classified INCOME receipts evidence →
 *     `CORPUS_NOT_DISTRIBUTABLE`. Value with no income provenance is corpus until proven otherwise.
 *  3. less declared income than the INCOME receipts evidence → `DISTRIBUTION_INPUT_INVALID`. Not a
 *     corpus breach — an inconsistent input — but still a refusal, because silently distributing the
 *     smaller figure would leave classified ghallah unaccounted for.
 *
 * `capitalReceiptsMinor` is **reported** so the corpus is visible on the run, and it appears in NO
 * figure below `revenueMinor` (invariant I-C1). Deciding what happens to a corpus receipt is E5's
 * ledger work; this module's only job is to keep it out of the waterfall.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ROUNDING DIRECTION ON A PERCENTAGE-DERIVED DEDUCTION — stated, not implied
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A `PERCENT` reserve and a `PERCENT_OF_*` fee can land off the halala (5% of SAR 1,234.57 is
 * 61.7285). This module rounds such a deduction **half-up to the halala**, by delegating to
 * `percentOf` in `../money.js` — the one tested percentage path in the monorepo — and never
 * re-implementing the arithmetic:
 *
 *  · **Why not ceiling (the "conservative" direction)?** Rounding a deduction UP shrinks
 *    distributable, which does protect the ṣiyāna obligation — but it would put a SECOND rounding
 *    rule in a single run, one that no `Setting` selects and that would silently disagree with
 *    `Setting distribution.rounding.method`. Choosing a rounding direction is OQ-01's subject
 *    matter, and OQ-01 is unsigned; inventing a direction here would be resolving a
 *    [Product] + [Counsel] question in code (CLAUDE.md binding rule 4).
 *  · **What the exposure actually is.** Half-up can round a deduction DOWN by at most half a
 *    halala, so distributable can be at most **1 halala** larger per percentage deduction than a
 *    ceiling rule would give. Corpus is untouched either way — a deduction is taken out of income,
 *    never out of asl — so I-C1 is unaffected. The exposure is a sub-halala under-reserve of ṣiyāna
 *    / under-accrual of the fee, not a corpus breach.
 *  · **Consistency with Stage 5.** Stage 5's Hamilton split floors and then hands the leftover
 *    halalas out, because it must conserve `Σ lines == distributable` exactly. A deduction has no
 *    such conservation constraint: whatever a deduction does not take flows to the next step, so
 *    invariant I1 (`revenue == reserve + operating + fee + distributable`) holds for ANY rounding
 *    of the deductions, since `distributable` is derived AS the remainder.
 *
 * // TODO(surface): OQ-01 (sub-question) — the rounding DIRECTION on a percentage-derived
 * // *deduction* (ṣiyāna reserve, Nazir fee) is not covered by OQ-01's text, which is about the
 * // beneficiary split. Half-up is implemented for consistency with `percentOf`; a ceiling rule
 * // (conservative for the maintenance obligation) is the alternative. ≤1 halala per deduction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A NEGATIVE WATERFALL REFUSES INSTEAD OF CLAMPING (§08 I4)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * If reserve + operating already exceed revenue, or if the fee then exceeds what is left, no run is
 * emitted at all: `DISTRIBUTION_NEGATIVE`, thrown at the point of computation, before any
 * beneficiary line exists. Capping the ṣiyāna reserve at available income would understate the
 * founder's stipulated maintenance obligation while producing a nil distribution that *looks*
 * defensible — worse than a refusal that forces a human decision.
 *
 * The net-income check is deliberately made BEFORE the fee is computed, so a negative base can
 * never produce a negative `PERCENT_OF_NET_INCOME` fee that then "restores" a plausible-looking
 * distributable.
 *
 * // TODO(surface): §08 leaves a `TARGET_TOPUP` reserve larger than the period's revenue
 * // unspecified — "ṣiyāna first" and I4 collide. This module refuses (I4 literally). Whether
 * // ṣiyāna-first instead means "reserve up to available income and distribute nothing" is a fiqh
 * // question about the founder's condition and belongs to the Sharia reviewer, not to code.
 *
 * // TODO(surface): §08 Example A uses `exp-e-001` — a PAID maintenance expense — as the STIPULATED
 * // reserve. This module takes `maintenance` as a RULE (the Shart's stipulation) and
 * // `operatingCostMinor` as ACTUALS, and never derives a reserve from an expense row. Whether a
 * // maintenance cost already paid belongs in `operatingCostMinor`, reduces the reserve, or neither,
 * // is a fiqh + accounting question that changes real numbers on a real statement.
 *
 * // TODO(surface): §16 OQ-05 (zakat, deferred) says a future ruling inserts a step between the
 * // Nazir fee and distributable. `Waterfall` is a flat object with no extension point, so that
 * // would change the result schema and every persisted run's hash. Mitigation available today at
 * // no cost: each deduction emits its own trace step carrying an explicit `step` ordinal, so the
 * // deduction ORDER is data — an inserted step is an added field plus an added trace step, not a
 * // reordering of existing ones.
 */

import {
  DomainError,
  corpusNotDistributable,
  distributionNegative,
  receiptUnclassified,
} from '../errors.js';
import { percentOf } from '../money.js';
import {
  RECEIPT_CLASSES,
  minorOf,
  minorToDecimalString,
  minorToMoney,
  moneyToMinor,
  type DistributionInput,
  type FeeBasis,
  type MaintenanceRule,
  type Minor,
  type NazirFee,
  type ReceiptClass,
  type RevenueInput,
  type RunFlag,
  type TraceStep,
  type Waterfall,
} from './contract.js';

/** Zero halalas, branded once so no call site repeats the cast. */
const ZERO_MINOR: Minor = minorOf(0n);

/**
 * `percent`% of a halala amount, half-up to the halala.
 *
 * Routed through `../money.js`'s `percentOf` — never re-derived — for two reasons the header spells
 * out: it is the ONE tested percentage path, and its divide-by-100 convention is what makes
 * `ratePercent: '10'` mean ten percent rather than the 100×-underpaying `0.10`.
 */
function percentOfMinor(baseMinor: Minor, ratePercent: string): Minor {
  return moneyToMinor(percentOf(minorToMoney(baseMinor), ratePercent));
}

/** Narrow an untrusted receipt-class string. Deliberately NOT a zod enum — see the contract header. */
function asReceiptClass(value: string): ReceiptClass | null {
  return (RECEIPT_CLASSES as readonly string[]).includes(value) ? (value as ReceiptClass) : null;
}

/** What {@link assertIncomeProvenance} proved about the period's receipts. */
export interface IncomeProvenance {
  /** Σ INCOME receipts — the gross ghallah, and the only value the waterfall may consume. */
  readonly incomeMinor: Minor;
  /** Σ CAPITAL receipts — asl. Reported so the corpus is visible; present in no figure below. */
  readonly capitalReceiptsMinor: Minor;
  /** Ids of the CAPITAL receipts held out, so the exclusion is auditable rather than implied. */
  readonly capitalReceiptIds: readonly string[];
}

/**
 * The corpus guard (D1 / CLAUDE.md binding rule 1). Runs BEFORE any arithmetic.
 *
 * Classifies every period receipt and proves the caller's declared `incomeMinor` is exactly the sum
 * of the INCOME-class receipts it can evidence. Refuses in every other case; see the header for the
 * three refusal codes and why they differ.
 *
 * ⚠ SPEC NOTE — the brief's I-C1 prose maps `incomeMinor < Σ INCOME` to `RECEIPT_UNCLASSIFIED`,
 * while acceptance test AT-11 maps it to `DISTRIBUTION_INPUT_INVALID`. AT-11 is implemented: the
 * receipts ARE classified in that state, so nothing is unclassified — the two figures simply
 * disagree, which is an input defect. Flagged rather than silently harmonised.
 *
 * @throws `RECEIPT_UNCLASSIFIED` — a class that is not exactly INCOME|CAPITAL, a CAPITAL receipt
 *   with no `capitalSource`, an INCOME receipt that names one, or declared income with no receipts.
 * @throws `CORPUS_NOT_DISTRIBUTABLE` — declared income exceeds the INCOME receipts behind it.
 * @throws `DISTRIBUTION_INPUT_INVALID` — declared income falls short of the INCOME receipts.
 */
export function assertIncomeProvenance(revenue: RevenueInput): IncomeProvenance {
  let incomeSum = 0n;
  let capitalSum = 0n;
  const capitalReceiptIds: string[] = [];

  for (const receipt of revenue.receipts) {
    const receiptClass = asReceiptClass(receipt.receiptClass);
    if (receiptClass === null) {
      throw receiptUnclassified(
        `receipt "${receipt.id}" carries receiptClass ${JSON.stringify(receipt.receiptClass)}, which is not exactly INCOME or CAPITAL. The vocabulary is closed and the case is significant — an unrecognised class is never assumed to be income`,
        {
          receiptId: receipt.id,
          receiptClass: receipt.receiptClass,
          expected: [...RECEIPT_CLASSES],
        },
      );
    }

    if (receiptClass === 'CAPITAL') {
      if (receipt.capitalSource === null) {
        throw receiptUnclassified(
          `CAPITAL receipt "${receipt.id}" names no capitalSource. Which corpus event produced the proceeds (sale, istibdal, expropriation) is part of the classification, not an annotation`,
          { receiptId: receipt.id },
        );
      }
      capitalSum += receipt.amountMinor;
      capitalReceiptIds.push(receipt.id);
      continue;
    }

    if (receipt.capitalSource !== null) {
      throw receiptUnclassified(
        `receipt "${receipt.id}" is classified INCOME yet names capitalSource ${JSON.stringify(receipt.capitalSource)}. That is a self-contradictory record — corpus proceeds filed as ghallah — and it is refused rather than distributed`,
        { receiptId: receipt.id, capitalSource: receipt.capitalSource },
      );
    }
    incomeSum += receipt.amountMinor;
  }

  // Checked BEFORE the sum comparison: "no breakdown at all" is a provenance failure, not a corpus
  // overstatement, and AT-11's bare `{ incomeMinor: 35_000_000n, receipts: [] }` must say so.
  if (revenue.receipts.length === 0 && revenue.incomeMinor > 0n) {
    throw receiptUnclassified(
      `${minorToDecimalString(revenue.incomeMinor)} SAR of income was declared with no receipts behind it. A caller that cannot show the income-vs-capital classification is refused, never trusted: a bare revenue total is indistinguishable from sale or istibdal proceeds`,
      { declaredIncomeMinor: revenue.incomeMinor.toString(), receiptCount: 0 },
    );
  }

  if (revenue.incomeMinor > incomeSum) {
    throw corpusNotDistributable(
      `${minorToDecimalString(revenue.incomeMinor)} SAR of income was declared but only ${minorToDecimalString(minorOf(incomeSum))} SAR is evidenced by INCOME-class receipts. The unevidenced ${minorToDecimalString(minorOf(revenue.incomeMinor - incomeSum))} SAR has no income provenance, so it is treated as corpus (asl) and blocked`,
      {
        declaredIncomeMinor: revenue.incomeMinor.toString(),
        classifiedIncomeMinor: incomeSum.toString(),
        capitalReceiptsMinor: capitalSum.toString(),
      },
    );
  }

  if (revenue.incomeMinor < incomeSum) {
    throw new DomainError(
      'DISTRIBUTION_INPUT_INVALID',
      `revenue.incomeMinor is ${minorToDecimalString(revenue.incomeMinor)} SAR but the INCOME-class receipts sum to ${minorToDecimalString(minorOf(incomeSum))} SAR. Classified ghallah is missing from the waterfall; the engine refuses rather than distributing the smaller figure and leaving the difference unaccounted for.`,
      {
        details: {
          declaredIncomeMinor: revenue.incomeMinor.toString(),
          classifiedIncomeMinor: incomeSum.toString(),
        },
      },
    );
  }

  return Object.freeze({
    incomeMinor: minorOf(incomeSum),
    capitalReceiptsMinor: minorOf(capitalSum),
    capitalReceiptIds: Object.freeze([...capitalReceiptIds]),
  });
}

/**
 * Step 1 · the ṣiyāna (صيانة) reserve, computed from the Shart's stipulated RULE.
 *
 * Never derived from a maintenance expense already paid — a reserve withheld from yield before
 * distribution and an incurred cost are different ledger events (see the header's `exp-e-001` note).
 *
 * - `FIXED` — the stipulated amount, verbatim.
 * - `PERCENT` — `ratePercent`% of revenue, half-up to the halala (see the header).
 * - `TARGET_TOPUP` — `max(0, target − current)`; **clamped at zero**, so a reserve already above its
 *   target tops up by nothing rather than by a negative amount that would inflate distributable.
 * - `NONE` — zero, because **the deed stipulates no reserve**. A founder's condition.
 * - `NAZIR_DISCRETION_PERCENT` — `ratePercent`% of revenue, identical arithmetic to `PERCENT` and a
 *   **different authority**: the deed is silent and the Nazir has recorded this figure for this
 *   endowment (OQ-06, product owner 2026-08-18).
 * - `UNSET` — zero, because **nobody has decided yet**. {@link runWaterfall} pairs it with
 *   `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED`; this function returns the amount only.
 *
 * ⚠ `NONE` AND `UNSET` RETURN THE SAME NUMBER AND ARE NOT THE SAME ANSWER. That is the whole of
 * OQ-06: before the ruling both were spelled `NONE`, so a run under a deed the founder wrote and a
 * run nobody had looked at produced byte-identical output. No caller may collapse them again.
 *
 * @throws `DISTRIBUTION_NEGATIVE` — `revenueMinor` is negative (only reachable by a cast; the
 *   contract's `nonNegativeMinorSchema` refuses it at the boundary).
 */
export function computeMaintenanceReserve(revenueMinor: Minor, rule: MaintenanceRule): Minor {
  if (revenueMinor < 0n) {
    throw distributionNegative(
      `revenue is ${minorToDecimalString(revenueMinor)} SAR; a negative pool has no ṣiyāna reserve to compute`,
      { revenueMinor: revenueMinor.toString() },
    );
  }

  switch (rule.kind) {
    case 'FIXED':
      return rule.amountMinor;
    case 'PERCENT':
    // The Nazir's recorded discretion computes exactly like the founder's percentage — the
    // arithmetic is not what differs, the AUTHORITY is. Sharing the branch is deliberate: two
    // copies of one calculation is how the two figures would start disagreeing.
    // falls through
    case 'NAZIR_DISCRETION_PERCENT':
      return percentOfMinor(revenueMinor, rule.ratePercent);
    case 'TARGET_TOPUP': {
      const shortfall = rule.targetBalanceMinor - rule.currentBalanceMinor;
      return shortfall > 0n ? minorOf(shortfall) : ZERO_MINOR;
    }
    case 'NONE':
    // Deed says none (a founder's condition) vs nobody has decided (OQ-06). Same amount, and the
    // DIFFERENCE IS CARRIED BY THE FLAG runWaterfall raises, never by this number.
    // falls through
    case 'UNSET':
      return ZERO_MINOR;
    default: {
      // Unreachable while MAINTENANCE_RULE_KINDS stays closed; kept so a new kind cannot
      // default-allow its way to a silent zero reserve.
      const unmapped: never = rule;
      throw new DomainError(
        'SETTING_INVALID',
        `computeMaintenanceReserve: unmapped maintenance rule ${JSON.stringify(unmapped)}. The vocabulary is closed; an unknown ṣiyāna rule is never approximated to zero.`,
      );
    }
  }
}

/** What {@link computeNazirFee} settled. `basis` is `null` only when the deed is silent. */
export interface NazirFeeOutcome {
  readonly nazirFeeMinor: Minor;
  readonly basis: FeeBasis | null;
  readonly flags: readonly RunFlag[];
}

/**
 * Step 3 · the Nazir fee, set by the DEED (Nazarah Art. 11) — never by statute.
 *
 * ⚠ the rate is unverified — confirm vs primary law. This engagement's deed sets
 * `PERCENT_OF_REVENUE @ '10'` (customary ʿushr / عُشر), resolved by the caller from
 * `Setting nazirFee.percentOfRevenue`, whose unit is **out of 100**. The Awqaf Law's ≤10%-of-net-
 * income figure is the Authority's own separate fee and is not this one.
 *
 * `fee === null` (the deed is silent) yields a zero fee **plus**
 * `AUTHORITY_FEE_DETERMINATION_PENDING`. The flag is the record that step 3 is HELD pending the
 * Authority-determination path — a silently zero-fee run must be impossible to produce, because it
 * is indistinguishable from a deed that genuinely charges nothing.
 *
 * @throws `DISTRIBUTION_NEGATIVE` — the base this basis reads is negative. Checked here as well as
 *   in {@link computeWaterfall} so a direct caller cannot obtain a negative fee, which would act as
 *   a *credit* and inflate distributable.
 */
export function computeNazirFee(args: {
  readonly revenueMinor: Minor;
  readonly netIncomeMinor: Minor;
  readonly fee: NazirFee | null;
}): NazirFeeOutcome {
  const { revenueMinor, netIncomeMinor, fee } = args;

  if (fee === null) {
    return Object.freeze({
      nazirFeeMinor: ZERO_MINOR,
      basis: null,
      flags: Object.freeze<RunFlag[]>(['AUTHORITY_FEE_DETERMINATION_PENDING']),
    });
  }

  switch (fee.basis) {
    case 'PERCENT_OF_REVENUE': {
      if (revenueMinor < 0n) {
        throw distributionNegative(
          `the PERCENT_OF_REVENUE fee base is ${minorToDecimalString(revenueMinor)} SAR. A negative base would yield a negative fee, i.e. a credit that inflates distributable`,
          { basis: fee.basis, baseMinor: revenueMinor.toString() },
        );
      }
      return Object.freeze({
        nazirFeeMinor: percentOfMinor(revenueMinor, fee.ratePercent),
        basis: fee.basis,
        flags: Object.freeze<RunFlag[]>([]),
      });
    }
    case 'PERCENT_OF_NET_INCOME': {
      if (netIncomeMinor < 0n) {
        throw distributionNegative(
          `the PERCENT_OF_NET_INCOME fee base is ${minorToDecimalString(netIncomeMinor)} SAR — the ṣiyāna reserve and operating cost already exceed revenue. A negative base would yield a negative fee, i.e. a credit that inflates distributable`,
          { basis: fee.basis, baseMinor: netIncomeMinor.toString() },
        );
      }
      return Object.freeze({
        nazirFeeMinor: percentOfMinor(netIncomeMinor, fee.ratePercent),
        basis: fee.basis,
        flags: Object.freeze<RunFlag[]>([]),
      });
    }
    case 'RETAINER':
      return Object.freeze({
        nazirFeeMinor: fee.fixedAmountMinor,
        basis: fee.basis,
        flags: Object.freeze<RunFlag[]>([]),
      });
    default: {
      const unmapped: never = fee;
      throw new DomainError(
        'SETTING_INVALID',
        `computeNazirFee: unmapped fee basis ${JSON.stringify(unmapped)}. The vocabulary is closed; an unknown basis is never approximated to zero, because a zero fee is a defensible-looking number.`,
      );
    }
  }
}

/** What {@link computeWaterfall} produced, plus everything the run needs to record about it. */
export interface WaterfallOutcome {
  readonly waterfall: Waterfall;
  readonly flags: readonly RunFlag[];
  readonly trace: readonly TraceStep[];
}

/**
 * Stage 1 · ghallah → distributable, in the fixed regulatory order.
 *
 * Order of operations, and every one of them is load-bearing:
 *  0. the corpus guard, before any arithmetic (`assertIncomeProvenance`);
 *  1. the ṣiyāna reserve;
 *  2. the operating cost (ACTUALS, as supplied);
 *  3. `netIncome = revenue − reserve − operating`, refusing if it is negative **before** the fee is
 *     computed, so a negative base can never yield a negative fee;
 *  4. the Nazir fee, on its own basis but deducted here;
 *  5. `distributable = netIncome − fee`, refusing if it is negative.
 *
 * Flags emitted by THIS stage, and only these two:
 *  · `AUTHORITY_FEE_DETERMINATION_PENDING` — the deed is silent on the fee.
 *  · `CAPITAL_RECEIPTS_EXCLUDED` — at least one CAPITAL receipt was held out of the waterfall.
 *    Keyed on the *presence* of a corpus receipt rather than on a positive amount: a 0-halala
 *    istibdal row is still a corpus row that was excluded, and the flag's job is to make that
 *    visible rather than to report a magnitude.
 *
 * `NIL_DISTRIBUTION`, `NO_ELIGIBLE_BENEFICIARIES`, `NA_DIRECT_USE`, `TIMING_OVERDUE` and
 * `UNVERIFIED_FIGURES_APPLIED` belong to the short-circuits, the resolver and Stage 4 — not here.
 *
 * @throws `RECEIPT_UNCLASSIFIED` / `CORPUS_NOT_DISTRIBUTABLE` / `DISTRIBUTION_INPUT_INVALID` — from
 *   the corpus guard.
 * @throws `DISTRIBUTION_NEGATIVE` — net income or distributable would be negative. **No run is
 *   emitted**: the throw happens before any beneficiary line exists (§08 I4).
 */
export function computeWaterfall(input: DistributionInput): WaterfallOutcome {
  const provenance = assertIncomeProvenance(input.revenue);
  const revenueMinor = provenance.incomeMinor;
  const { capitalReceiptsMinor, capitalReceiptIds } = provenance;

  const flags: RunFlag[] = [];
  const trace: TraceStep[] = [];

  trace.push({
    stage: 'WATERFALL',
    code: 'REVENUE_CLASSIFIED',
    message:
      'Period receipts classified income-vs-capital; only INCOME-class value enters the waterfall.',
    data: {
      revenueMinor: minorToDecimalString(revenueMinor),
      capitalReceiptsMinor: minorToDecimalString(capitalReceiptsMinor),
      receiptCount: String(input.revenue.receipts.length),
      capitalReceiptCount: String(capitalReceiptIds.length),
    },
  });

  if (capitalReceiptIds.length > 0) {
    flags.push('CAPITAL_RECEIPTS_EXCLUDED');
    trace.push({
      stage: 'WATERFALL',
      code: 'CAPITAL_RECEIPTS_EXCLUDED',
      message:
        'Capital (asl) receipts held out of the waterfall: sale, istibdal and expropriation proceeds remain corpus and are never distributed.',
      data: {
        capitalReceiptsMinor: minorToDecimalString(capitalReceiptsMinor),
        receiptIds: capitalReceiptIds.join(','),
      },
    });
  }

  /* ── Step 1 · ṣiyāna (صيانة), always first ─────────────────────────────────────────────── */
  const maintenanceReserveMinor = computeMaintenanceReserve(revenueMinor, input.maintenance);

  // ⊕ OQ-06 (product owner, 2026-08-18). A zero reserve that is NOBODY'S ANSWER is flagged; a zero
  // reserve somebody chose is not. `UNSET` is the only kind that raises it — asserted exhaustively
  // over MAINTENANCE_RULE_KINDS in `waterfall.test.ts`, so a kind added later cannot slip in
  // unclassified. Interim per the owner's memo: the run still computes.
  const reservePolicyUnacknowledged = input.maintenance.kind === 'UNSET';
  if (reservePolicyUnacknowledged) {
    flags.push('MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED');
  }

  trace.push({
    stage: 'WATERFALL',
    code: 'MAINTENANCE_RESERVE',
    message: reservePolicyUnacknowledged
      ? 'Ṣiyāna (maintenance) reserved from yield first. ⚠ The deed is SILENT on maintenance and NO Nazir discretion has been recorded for this endowment, so the reserve is zero because nobody has decided — not because a reserve of nothing was chosen (OQ-06).'
      : 'Ṣiyāna (maintenance) reserved from yield first, before any operating cost or fee.',
    data: {
      step: '1',
      kind: input.maintenance.kind,
      maintenanceReserveMinor: minorToDecimalString(maintenanceReserveMinor),
      // WHOSE figure this is. `NONE`/`PERCENT`/`FIXED`/`TARGET_TOPUP` are the founder's condition;
      // `NAZIR_DISCRETION_PERCENT` is the trustee's recorded discretion under a silent deed; `UNSET`
      // is neither. A statement that cannot say which of the three produced the reserve cannot be
      // defended to a beneficiary.
      reserveAuthority:
        input.maintenance.kind === 'NAZIR_DISCRETION_PERCENT'
          ? 'NAZIR_DISCRETION'
          : input.maintenance.kind === 'UNSET'
            ? 'NOBODY'
            : 'SHART_AL_WAQIF',
    },
  });

  /* ── Step 2 · operating / management cost (actuals) ────────────────────────────────────── */
  const operatingCostMinor = input.operatingCostMinor;
  trace.push({
    stage: 'WATERFALL',
    code: 'OPERATING_COST',
    message: 'Operating/management cost deducted (actuals as supplied; excludes the Nazir fee).',
    data: { step: '2', operatingCostMinor: minorToDecimalString(operatingCostMinor) },
  });

  const netIncomeRaw = revenueMinor - maintenanceReserveMinor - operatingCostMinor;
  if (netIncomeRaw < 0n) {
    throw distributionNegative(
      `revenue ${minorToDecimalString(revenueMinor)} − ṣiyāna reserve ${minorToDecimalString(maintenanceReserveMinor)} − operating cost ${minorToDecimalString(operatingCostMinor)} = ${minorToDecimalString(minorOf(netIncomeRaw))} SAR. The stipulated reserve is not capped at available income: capping it would understate the founder's maintenance condition while producing a nil distribution that looks defensible`,
      {
        revenueMinor: revenueMinor.toString(),
        maintenanceReserveMinor: maintenanceReserveMinor.toString(),
        operatingCostMinor: operatingCostMinor.toString(),
        netIncomeMinor: netIncomeRaw.toString(),
      },
    );
  }
  const netIncomeMinor = minorOf(netIncomeRaw);
  trace.push({
    stage: 'WATERFALL',
    code: 'NET_INCOME',
    message:
      'Net income = revenue − ṣiyāna reserve − operating cost (the PERCENT_OF_NET_INCOME base).',
    data: { netIncomeMinor: minorToDecimalString(netIncomeMinor) },
  });

  /* ── Step 3 · the Nazir fee (ʿushr), on its own basis, deducted here ───────────────────── */
  const feeOutcome = computeNazirFee({
    revenueMinor,
    netIncomeMinor,
    fee: input.nazirFee,
  });
  flags.push(...feeOutcome.flags);
  trace.push({
    stage: 'WATERFALL',
    code: 'NAZIR_FEE',
    message:
      'Nazir fee deducted at step 3, on the basis the DEED sets (Nazarah Art. 11). ⚠ the rate is unverified — confirm vs primary law.',
    data: {
      step: '3',
      basis: feeOutcome.basis ?? 'DEED_SILENT',
      nazirFeeMinor: minorToDecimalString(feeOutcome.nazirFeeMinor),
    },
  });

  const distributableRaw = netIncomeMinor - feeOutcome.nazirFeeMinor;
  if (distributableRaw < 0n) {
    throw distributionNegative(
      `net income ${minorToDecimalString(netIncomeMinor)} − Nazir fee ${minorToDecimalString(feeOutcome.nazirFeeMinor)} = ${minorToDecimalString(minorOf(distributableRaw))} SAR. No run is emitted`,
      {
        netIncomeMinor: netIncomeMinor.toString(),
        nazirFeeMinor: feeOutcome.nazirFeeMinor.toString(),
        distributableMinor: distributableRaw.toString(),
      },
    );
  }
  const distributableMinor = minorOf(distributableRaw);
  trace.push({
    stage: 'WATERFALL',
    code: 'DISTRIBUTABLE',
    message: 'Distributable ghallah = net income − Nazir fee. Only this figure reaches the split.',
    data: { distributableMinor: minorToDecimalString(distributableMinor) },
  });

  const waterfall: Waterfall = Object.freeze({
    revenueMinor,
    capitalReceiptsMinor,
    maintenanceReserveMinor,
    operatingCostMinor,
    netIncomeMinor,
    nazirFeeMinor: feeOutcome.nazirFeeMinor,
    nazirFeeBasis: feeOutcome.basis,
    distributableMinor,
  });

  // I4, third layer (the schema is the first, the two throws above are the second). A negative here
  // means a coding slip rather than bad data, so it names the invariant.
  assertNoNegativeWaterfallTerm(waterfall);

  return Object.freeze({
    waterfall,
    flags: Object.freeze([...flags]),
    trace: Object.freeze([...trace]),
  });
}

/**
 * Every monetary term of an assembled waterfall is `>= 0` (§08 I4, at Stage 1).
 *
 * Deliberately not exported: `invariants.ts` owns the run-level I4 backstop over the whole result.
 * This is Stage 1's own fail-fast, so a slip cannot travel past the stage that made it.
 */
function assertNoNegativeWaterfallTerm(waterfall: Waterfall): void {
  const terms: ReadonlyArray<readonly [string, Minor]> = [
    ['revenueMinor', waterfall.revenueMinor],
    ['capitalReceiptsMinor', waterfall.capitalReceiptsMinor],
    ['maintenanceReserveMinor', waterfall.maintenanceReserveMinor],
    ['operatingCostMinor', waterfall.operatingCostMinor],
    ['netIncomeMinor', waterfall.netIncomeMinor],
    ['nazirFeeMinor', waterfall.nazirFeeMinor],
    ['distributableMinor', waterfall.distributableMinor],
  ];
  for (const [name, value] of terms) {
    if (value < 0n) {
      throw distributionNegative(
        `waterfall.${name} is ${minorToDecimalString(value)} SAR after assembly (§08 I4). No run is emitted`,
        { field: name, valueMinor: value.toString() },
      );
    }
  }
}
