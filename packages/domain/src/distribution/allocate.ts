/**
 * `distribution/allocate.ts` — Stage 5 of the distribution engine (PRD §08): the exact split,
 * the residual rule, and line/total/notice assembly.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS RESPONSIBLE FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Stage 2 (`./resolver.js`) decides **who is entitled** and with what deed weight. Stage 3
 * (`./gates.js`) decides **who is payable now**. Neither may touch a monetary amount — that
 * separation is the type-level proof of §08 invariant I6, and it is what makes this file the ONLY
 * place a halala is assigned to a person. Everything here is therefore held to one standard:
 *
 *     **value is conserved to the halala, or nothing is emitted at all.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE METHOD — largest remainder (Hamilton), NOT half-up  (SPEC CORRECTION, "DEFECT-2")
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §16 OQ-01 and BUILD-PLAN both say "half-up". Half-up is **arithmetically incompatible** with the
 * largest-remainder method §08 Stage 5 actually specifies, and the incompatibility is not stylistic:
 *
 *   · Hamilton is *floor*-then-hand-out-the-leftover. Because every line is floored first, the sum
 *     of the floors is ≤ the total, so the residual is **never negative** and §08's own invariant
 *     I9 (`residual ≥ 0`) holds by construction.
 *   · Rounding each share half-up independently can make `Σ lines` **EXCEED** distributable (three
 *     lines of 33.335 → 33.34 × 3 = 100.02 against a 100.01 pool). That is a negative residual,
 *     i.e. distributing money the waqf does not have, and it makes I9 false.
 *
 * So this file implements §08 Stage 5 / BUILD-PLAN's *largest-remainder* instruction: exact integer
 * floor of `distributable × wᵢ / Σw`, then the leftover halalas one each to the largest fractional
 * remainders, ties broken by **ascending `beneficiaryId`**.
 *
 * ✓ **OQ-01 · RESIDUAL POLICY — DECIDED (product owner, 2026-08-11).** In the owner's words:
 * *"the engine's current halala handover rule is good."* So the rule implemented here **is** the rule:
 * floor each line, then hand the leftover halalas one each to the largest fractional remainders, ties
 * broken by ascending `beneficiaryId`. The residual goes to **beneficiary lines within the run**.
 *
 * That settles the second of OQ-01's two questions and closes the §16-vs-§08 contradiction in §08's
 * favour: §16 proposed sweeping the residual into next-period ghallah carry-forward, so that no line
 * received it and it landed in `totals.retainedMinor` instead. **§16 is now the drifted side** — the two
 * policies pay different people different money, and the owner chose this one. `16-open-questions.md`
 * carries the reconciliation.
 *
 * The first question — rounding *direction* at the halala — was never really open for this path and is
 * now moot here: Hamilton is floor-then-distribute, so no half-up/half-even/truncate choice arises
 * inside `allocateMinor` at all. `../money.js`'s `moneyRound` still takes a direction for other callers
 * and keeps its own marker.
 *
 * ⚠ One honest residue: §16 lists OQ-01 as **[Product] + [Counsel]**, and only Product has answered.
 * The owner is a practising Nazir, so this is the product's settled position; if a Sharia reviewer later
 * reads the residual differently against the Shart al-Waqif, this is the line that changes. That does
 * not reopen it — the engine has a decided rule and no longer implements a flagged guess.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THERE ARE TWO ALLOCATORS, AND WHY THAT IS THE POINT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `../money.js` already ships a tested `largestRemainderAllocate` over branded `Decimal` `Money`.
 * §08's contract is `Minor` (bigint halalas), so this file carries a bigint-native Hamilton too.
 * A second implementation of a money-splitting rule is normally a liability — so it is wired as an
 * **asset**: `allocateMinor` runs BOTH and refuses to return unless they agree element by element.
 *
 *   · the `Money`/`Decimal` path (`allocate` → `largestRemainderAllocate`) produces the amounts;
 *   · the bigint path here independently produces the floors, the remainders, the tie-break order
 *     and the residual — from raw decimal-string parsing, with **no `Decimal` involved at all**, so
 *     it does not inherit a decimal.js behaviour the other side depends on;
 *   · every returned amount must be `floorᵢ` or `floorᵢ + 1`, the bumped count must equal the
 *     residual, and `Σ == total`.
 *
 * Sprint 1 and Sprint 2 both shipped holes that existed because nothing compared two sides that
 * were supposed to agree. `floorsMinor` is on the public result for the same reason: I9 becomes
 * assertable from a persisted run rather than only from inside the engine.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `retainedMinor`  (SPEC CORRECTION, "DEFECT-1" — §08's I3 is unsatisfiable as written)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 I3 says `paid + withheld + crossBorder == distributable`. §08's own acceptance criteria
 * produce states where `distributable > 0` with ZERO payout lines — `NO_ELIGIBLE_BENEFICIARIES`
 * ("distributable is retained, carried forward") and an `NA_DIRECT_USE` waqf that did have period
 * revenue (§08 line 54: the waterfall still computes, only the split below it is skipped). Both make
 * I3 false. `totals.retainedMinor` closes it:
 *
 *     paid + withheld + crossBorder + retained == distributable          (I3, restated)
 *     Σ lines[¬EXCLUDED].entitledMinor + retained == distributable       (I2, restated)
 *
 * ⚠ `retainedMinor` is distributable attached to **NO line**. A WITHHELD amount also physically
 * sits in the waqf account, but it belongs to a named beneficiary and is counted in `withheldMinor`
 * — never here. This file only *reports* the retained value; where it goes is OQ-01 sub-question 2
 * and is unsigned (see the TODO above). Nothing here carries it forward.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PURITY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * No clock, no randomness, no I/O, no `Math.random`, no `localeCompare` (its ICU-dependent ordering
 * would make the residual tie-break — and therefore a payout — host-dependent, breaking I8). Every
 * ordering here is `compareBeneficiaryIds`, i.e. fixed UTF-16 code-unit order.
 */

import { DomainError, distributionInvariantBreach } from '../errors.js';
import { allocate } from '../money.js';

import {
  MAX_WEIGHT_DECIMAL_PLACES,
  compareBeneficiaryIds,
  minorOf,
  minorToDecimalString,
  minorToMoney,
  moneyToMinor,
  sharePercentOf,
} from './contract.js';
import type {
  AuthorityNotice,
  DistributionLine,
  GateReasonCode,
  Minor,
  RoundingMethod,
  Totals,
  TraceStep,
} from './contract.js';
import type { EntitlementResolution } from './resolver.js';
import type { GateOutcome } from './gates.js';

/**
 * One member of the resolver's verdict, taken *structurally* off {@link EntitlementResolution}
 * rather than by importing `ResolvedBeneficiary` by name — this module then depends on one exported
 * name from `./resolver.js` instead of two.
 */
type ResolvedMember = EntitlementResolution['resolved'][number];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The bigint-native Hamilton split
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A non-negative plain decimal literal, after trimming and dropping a leading `+`. */
const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Trailing zeros in the fraction, which carry no value and must not inflate the common scale. */
const TRAILING_ZEROS = /0+$/;

interface WeightParts {
  readonly integerDigits: string;
  /** Significant fraction digits only — `'1.50'` normalises to `'5'`, matching `Decimal.dp()`. */
  readonly fractionDigits: string;
}

/**
 * Split a weight literal into integer and significant-fraction digits, with **no `Decimal`**.
 *
 * Deliberately hand-rolled: `../money.js` scales weights with `Decimal.times(10ⁿ).toFixed(0)`, so
 * re-using `Decimal` here would make the "independent" cross-check share the very component whose
 * behaviour is being cross-checked. Trailing zeros are stripped because `Decimal` normalises them
 * (`new Decimal('1.50').decimalPlaces() === 1`); a mismatch there would silently change the common
 * scale on one side only.
 */
function parseWeightParts(raw: string, index: number): WeightParts {
  if (typeof raw !== 'string') {
    throw new DomainError(
      'MONEY_NUMBER_INPUT',
      `allocateMinor: weight at index ${String(index)} is a ${typeof raw}, not a decimal string. A JS number is never a weight — binary floats cannot hold a deed share exactly.`,
      { details: { index, receivedType: typeof raw } },
    );
  }

  const trimmed = raw.trim();
  const unsigned = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

  if (!UNSIGNED_DECIMAL.test(unsigned)) {
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      `allocateMinor: weight at index ${String(index)} ("${trimmed}") is not a non-negative plain decimal literal. Signs, exponent notation, NaN, Infinity and blanks are refused, never coerced.`,
      { details: { index, weight: trimmed } },
    );
  }

  const dot = unsigned.indexOf('.');
  const integerDigits = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const rawFraction = dot === -1 ? '' : unsigned.slice(dot + 1);

  return { integerDigits, fractionDigits: rawFraction.replace(TRAILING_ZEROS, '') };
}

interface ScaledWeights {
  readonly weightIntegers: readonly bigint[];
  readonly weightTotal: bigint;
  readonly weightScale: number;
}

/**
 * Lift the weight vector onto a common integer scale, exactly.
 *
 * Scaling every weight by the same 10ⁿ leaves `total × wᵢ / Σw` unchanged, so the floors — and the
 * *ordering* of the remainders — are invariant under the choice of scale. That is why a scale
 * disagreement with `../money.js` could never change a payout even if the normalisation above
 * drifted; the cross-check in {@link allocateMinor} is what would catch it if it did.
 */
function scaleWeights(weights: readonly string[]): ScaledWeights {
  const parts = weights.map((weight, index) => parseWeightParts(weight, index));

  const weightScale = parts.reduce(
    (widest, part) => Math.max(widest, part.fractionDigits.length),
    0,
  );

  if (weightScale > MAX_WEIGHT_DECIMAL_PLACES) {
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      `allocateMinor: weights may carry at most ${String(MAX_WEIGHT_DECIMAL_PLACES)} decimal places; this vector needs ${String(weightScale)}. The bound exists to keep the bigint numerators finite.`,
      { details: { weightScale, maximum: MAX_WEIGHT_DECIMAL_PLACES } },
    );
  }

  const weightIntegers = parts.map((part) =>
    BigInt(part.integerDigits + part.fractionDigits.padEnd(weightScale, '0')),
  );
  const weightTotal = weightIntegers.reduce((running, value) => running + value, 0n);

  return { weightIntegers, weightTotal, weightScale };
}

interface HamiltonRow {
  readonly index: number;
  readonly floorMinor: bigint;
  /** `numerator mod Σw`. Compared as an exact bigint — never divided into a float. */
  readonly remainder: bigint;
}

interface HamiltonSplit {
  readonly amountsMinor: readonly bigint[];
  readonly floorsMinor: readonly bigint[];
  readonly residualMinor: bigint;
  /** Indices that received one leftover halala. `size === residualMinor`. */
  readonly bumped: ReadonlySet<number>;
}

/**
 * The largest-remainder split, in exact bigint arithmetic.
 *
 * `remainder` comparison is a bigint comparison — the fractional parts are **never** divided into a
 * JS `number`, because two remainders that differ in the 17th significant digit would compare equal
 * as doubles and the tie-break would silently move a halala to the wrong beneficiary.
 */
function hamiltonSplit(totalMinor: bigint, weights: readonly string[]): HamiltonSplit {
  if (weights.length === 0) {
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      "allocateMinor: at least one weight is required. An empty entitled cohort is the caller's branch to take (retained, not split) — never a zero-line split.",
    );
  }

  if (totalMinor < 0n) {
    throw new DomainError(
      'MONEY_NEGATIVE',
      `allocateMinor: the total to allocate is ${String(totalMinor)} halalas. A negative pool is never distributable, and bigint division truncates toward zero rather than flooring, so the Hamilton floors would not be floors.`,
      { details: { totalMinor: String(totalMinor) } },
    );
  }

  const { weightIntegers, weightTotal } = scaleWeights(weights);

  if (weightTotal === 0n) {
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      'allocateMinor: the weights sum to zero — there is no basis on which to split. A cohort in which every deed weight is zero must be EXCLUDED upstream (ZERO_STIPULATED_WEIGHT), not divided by zero here.',
    );
  }

  const rows: readonly HamiltonRow[] = weightIntegers.map((weightInteger, index) => {
    const numerator = totalMinor * weightInteger;
    // Both operands are non-negative, so bigint truncation IS the floor.
    const floorMinor = numerator / weightTotal;
    return { index, floorMinor, remainder: numerator - floorMinor * weightTotal };
  });

  const floorsMinor = rows.map((row) => row.floorMinor);
  const flooredTotal = floorsMinor.reduce((running, value) => running + value, 0n);
  const residualMinor = totalMinor - flooredTotal;

  // Largest remainder first; ties by ASCENDING INDEX. The caller orders the cohort by ascending
  // `beneficiaryId`, so ascending index *is* §08's ascending-beneficiaryId tie-break.
  const ranked = [...rows].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });

  const bumped = new Set<number>();
  let leftover = residualMinor;
  for (const row of ranked) {
    if (leftover <= 0n) break;
    bumped.add(row.index);
    leftover -= 1n;
  }

  const amountsMinor = rows.map((row) => row.floorMinor + (bumped.has(row.index) ? 1n : 0n));

  return { amountsMinor, floorsMinor, residualMinor, bumped };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Public: the split
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface AllocationResult {
  /** One amount per weight, in the SAME order as `weights`. `Σ == totalMinor`, exactly. */
  readonly amountsMinor: readonly Minor[];
  /**
   * The pre-bump floors, independently derived in bigint. Published so §08's I9 is assertable from
   * a persisted run, and so the duplicated derivation is load-bearing rather than dead code.
   */
  readonly floorsMinor: readonly bigint[];
  /** `totalMinor − Σ floorsMinor`. `0 ≤ residualMinor < amountsMinor.length` halalas (I9). */
  readonly residualMinor: bigint;
}

/**
 * Split `totalMinor` halalas across `weights` so the parts sum to **exactly** `totalMinor`.
 *
 * Runs the two allocators described in the file header and refuses to return unless they agree.
 * A disagreement is an engine defect, not a data problem, so it raises
 * `DISTRIBUTION_INVARIANT_BREACH` — never a partial or approximate answer.
 *
 * `method` is a parameter with no default: it is read from the `distribution.rounding.method`
 * `Setting` (binding rule 3). `LARGEST_REMAINDER_BANKERS` is declared but unimplemented and
 * **throws `SETTING_INVALID`** on the way through `../money.js`'s `allocate` — a silent fall back
 * to half-up would produce a statement indistinguishable from a ratified one.
 */
export function allocateMinor(
  totalMinor: Minor,
  weights: readonly string[],
  method: RoundingMethod,
): AllocationResult {
  // The method check comes FIRST (inside `allocate`), so an unratified rounding policy is refused
  // before any arithmetic — including before the weight vector is judged.
  const moneyParts = allocate(minorToMoney(totalMinor), weights, method);
  const fromMoneyEngine = moneyParts.map((part) => moneyToMinor(part));

  const independent = hamiltonSplit(totalMinor, weights);

  if (fromMoneyEngine.length !== independent.amountsMinor.length) {
    throw distributionInvariantBreach(
      'I2',
      `the two allocators returned different line counts (${String(fromMoneyEngine.length)} vs ${String(independent.amountsMinor.length)})`,
      { lineCount: weights.length },
    );
  }

  for (const [index, expected] of independent.amountsMinor.entries()) {
    const actual = fromMoneyEngine[index];
    if (actual === undefined || actual !== expected) {
      throw distributionInvariantBreach(
        'I9',
        `the bigint Hamilton split and money.ts's Decimal allocator disagree at index ${String(index)}: ${String(actual)} vs ${String(expected)} halalas. Two implementations of one split must agree halala for halala, tie-break included`,
        {
          index,
          fromMoneyEngine: String(actual),
          fromBigintSplit: String(expected),
          totalMinor: String(totalMinor),
        },
      );
    }
  }

  const allocatedTotal = fromMoneyEngine.reduce<bigint>((running, value) => running + value, 0n);
  if (allocatedTotal !== (totalMinor as bigint)) {
    throw distributionInvariantBreach(
      'I2',
      `the split sums to ${String(allocatedTotal)} halalas against a pool of ${String(totalMinor)}. Refusing to return money that does not add up`,
      { allocatedTotal: String(allocatedTotal), totalMinor: String(totalMinor) },
    );
  }

  // Every amount is its own floor, or its floor plus exactly one leftover halala. This is what
  // makes the duplicated floor derivation load-bearing: it cross-checks the money engine against
  // an independent computation instead of merely restating it.
  for (const [index, floorMinor] of independent.floorsMinor.entries()) {
    const amount = fromMoneyEngine[index];
    if (amount === undefined || (amount !== floorMinor && amount !== floorMinor + 1n)) {
      throw distributionInvariantBreach(
        'I9',
        `line ${String(index)} was allocated ${String(amount)} halalas, which is neither its floor (${String(floorMinor)}) nor floor+1. Largest-remainder hands out at most one leftover halala per line`,
        { index, amount: String(amount), floorMinor: String(floorMinor) },
      );
    }
  }

  if (BigInt(independent.bumped.size) !== independent.residualMinor) {
    throw distributionInvariantBreach(
      'I9',
      `${String(independent.bumped.size)} lines were bumped against a residual of ${String(independent.residualMinor)} halalas`,
      { bumped: String(independent.bumped.size), residualMinor: String(independent.residualMinor) },
    );
  }

  assertResidualBoundedBy(independent.residualMinor, weights.length);

  return {
    amountsMinor: fromMoneyEngine.map((value) => minorOf(value)),
    floorsMinor: independent.floorsMinor,
    residualMinor: independent.residualMinor,
  };
}

/**
 * §08 I9: `0 ≤ residual < lineCount`.
 *
 * The upper bound is not decoration. `Σ remainders = residual × Σw` and every remainder is `< Σw`,
 * so `residual` is strictly less than the number of lines with a *positive* remainder — which is
 * why a zero-weight line (remainder 0) can never be handed a leftover halala.
 */
function assertResidualBoundedBy(residualMinor: bigint, lineCount: number): void {
  if (residualMinor < 0n) {
    throw distributionInvariantBreach(
      'I9',
      `the residual is ${String(residualMinor)} halalas. A negative residual means Σ lines EXCEEDS distributable — the signature failure of half-up rounding, which this engine does not use`,
      { residualMinor: String(residualMinor) },
    );
  }
  if (lineCount > 0 && residualMinor >= BigInt(lineCount)) {
    throw distributionInvariantBreach(
      'I9',
      `the residual is ${String(residualMinor)} halalas across ${String(lineCount)} lines; largest-remainder leaves strictly fewer leftover halalas than lines`,
      { residualMinor: String(residualMinor), lineCount },
    );
  }
  if (lineCount === 0 && residualMinor !== 0n) {
    throw distributionInvariantBreach(
      'I9',
      `a zero-line split reported a residual of ${String(residualMinor)} halalas`,
      { residualMinor: String(residualMinor) },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Public: the totals of a run with no entitled cohort
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Totals for a run in which **no line is entitled to anything** — the nil run, the
 * `NO_ELIGIBLE_BENEFICIARIES` cohort, and an `NA_DIRECT_USE` waqf that nonetheless had period
 * revenue (the DEFECT-1 case).
 *
 * All three of `paid`/`withheld`/`crossBorder` are `0n` and the whole distributable sits in
 * `retainedMinor`, which is exactly what makes the restated I2/I3 hold where §08's original text
 * cannot. `excludedCount` is still reported: §08 emits the EXCLUDED lines, so the count must not be
 * silently zeroed just because nothing was paid.
 */
export function emptyTotals(retainedMinor: Minor, excludedCount: number): Totals {
  if ((retainedMinor as bigint) < 0n) {
    throw distributionInvariantBreach(
      'I4',
      `retainedMinor is ${String(retainedMinor)} halalas; no monetary total may be negative`,
      { retainedMinor: String(retainedMinor) },
    );
  }
  if (!Number.isInteger(excludedCount) || excludedCount < 0) {
    throw distributionInvariantBreach(
      'I3',
      `excludedCount is ${String(excludedCount)}; a line count must be a non-negative integer`,
      { excludedCount: String(excludedCount) },
    );
  }

  const zero = minorOf(0n);
  return {
    paidMinor: zero,
    withheldMinor: zero,
    crossBorderMinor: zero,
    retainedMinor,
    entitledMinor: zero,
    excludedCount,
    entitledLineCount: 0,
    residualMinor: zero,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Public: the cohort ordering (the one definition of it)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface EntitledCohort {
  /** The entitled beneficiary ids, ascending (`compareBeneficiaryIds`, never `localeCompare`). */
  readonly beneficiaryIds: readonly string[];
  /** Deed weights in the SAME order — the vector `allocateMinor` must be called with. */
  readonly weights: readonly string[];
}

/**
 * The entitled cohort in the ONE order the split is defined over: ascending `beneficiaryId`.
 *
 * `AllocationResult` is positional, so the order the weights were passed in *is* the mapping from
 * halalas to people. §08 defines the residual tie-break as "ascending `beneficiaryId`", which is
 * only meaningful if the vector is in that order — pass a cohort in input order and, with equal
 * weights, the leftover halala lands on a different family member.
 *
 * `engine.ts` should build its weight vector from here rather than re-deriving it, so the ordering
 * has exactly one definition. {@link assembleLines} independently re-derives the same cohort and
 * refuses a mismatched allocation, so a caller that ignores this helper fails loudly rather than
 * mis-paying quietly.
 */
export function entitledCohortWeights(resolution: EntitlementResolution): EntitledCohort {
  const entitled = sortedById(resolution.resolved.filter((member) => member.entitled));
  return {
    beneficiaryIds: entitled.map((member) => member.beneficiaryId),
    weights: entitled.map((member) => member.stipulatedWeight),
  };
}

function sortedById(members: readonly ResolvedMember[]): readonly ResolvedMember[] {
  return [...members].sort((a, b) => compareBeneficiaryIds(a.beneficiaryId, b.beneficiaryId));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Public: line assembly
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface AssembleArgs {
  readonly resolution: EntitlementResolution;
  /** Gate verdict per **entitled** beneficiary id. An entitled id with no verdict is refused. */
  readonly gateOutcomes: ReadonlyMap<string, GateOutcome>;
  /** Must have been produced by {@link allocateMinor} over {@link entitledCohortWeights}. */
  readonly allocation: AllocationResult;
  readonly distributableMinor: Minor;
}

export interface AssembledLines {
  readonly lines: readonly DistributionLine[];
  readonly totals: Totals;
  readonly authorityNotices: readonly AuthorityNotice[];
  readonly trace: readonly TraceStep[];
}

/**
 * Turn the resolver's verdict, the gates' verdict and the split into the run's lines, totals and
 * Authority notices.
 *
 * Three cross-module checks run before a single line is built, because this is the last place a
 * disagreement between stages can be caught before money is attributed to a named person:
 *
 * 1. **The resolver against itself** — `entitledIds`, `excludedCount` and the per-member
 *    `entitled`/`exclusionReason` fields must tell one story.
 * 2. **The allocation against the cohort** — the split is recomputed from the ascending-id cohort's
 *    own weights and must match `args.allocation` amount for amount. This is what catches a caller
 *    that built its weight vector in the wrong order, including the equal-weight case where only
 *    the tie-break differs and the totals still balance.
 * 3. **The gates against the cohort** — every entitled id must carry a gate verdict. A missing
 *    verdict must never default to `PAID`.
 *
 * EXCLUDED lines are emitted, always, with `entitledMinor === 0n`: the record has to show who was
 * excluded and why (BR-505). They carry `gateFlags: []` — payability was never reached, because
 * excluded ≠ withheld (§08) and Example A pins `gateFlags []` on the tier-excluded line.
 */
export function assembleLines(args: AssembleArgs): AssembledLines {
  const { resolution, gateOutcomes, allocation, distributableMinor } = args;

  if ((distributableMinor as bigint) < 0n) {
    throw distributionInvariantBreach(
      'I4',
      `distributableMinor is ${String(distributableMinor)} halalas; the waterfall must refuse a negative pool before any line exists`,
      { distributableMinor: String(distributableMinor) },
    );
  }

  assertResolverSelfConsistent(resolution);

  const entitled = sortedById(resolution.resolved.filter((member) => member.entitled));
  const excluded = sortedById(resolution.resolved.filter((member) => !member.entitled));

  const trace: TraceStep[] = [
    {
      stage: 'ALLOCATE',
      code: 'ALLOCATE_COHORT',
      message: 'Entitled cohort resolved for the split; excluded members contribute no weight.',
      data: {
        rule: resolution.rule,
        entitledLineCount: String(entitled.length),
        excludedCount: String(excluded.length),
        distributable: minorToDecimalString(distributableMinor),
      },
    },
  ];

  if (entitled.length === 0) {
    return assembleNilCohort({ excluded, allocation, distributableMinor, trace });
  }

  assertAllocationMatchesCohort(entitled, allocation, distributableMinor);

  const lines: DistributionLine[] = [];
  const notices: AuthorityNotice[] = [];

  let paid = 0n;
  let withheld = 0n;
  let crossBorder = 0n;
  let entitledTotal = 0n;

  for (const [index, member] of entitled.entries()) {
    const entitledMinorValue = allocation.amountsMinor[index];
    const floorMinor = allocation.floorsMinor[index];
    if (entitledMinorValue === undefined || floorMinor === undefined) {
      throw distributionInvariantBreach(
        'I2',
        `the allocation has no amount at index ${String(index)} for an entitled cohort of ${String(entitled.length)}`,
        { index, entitledLineCount: entitled.length },
      );
    }

    const outcome = gateOutcomes.get(member.beneficiaryId);
    if (outcome === undefined) {
      throw distributionInvariantBreach(
        'I3',
        `entitled beneficiary "${member.beneficiaryId}" carries no gate verdict. A missing payability verdict must never default to PAID`,
        { beneficiaryId: member.beneficiaryId },
      );
    }

    // §08 I6: the gate sets the STATUS, never the amount. `entitledMinorValue` comes from the split
    // and is untouched here — withholding a line does not reallocate a halala to anyone else.
    const line: DistributionLine = {
      beneficiaryId: member.beneficiaryId,
      status: outcome.status,
      entitledMinor: entitledMinorValue,
      // Display only. Derived FROM the allocated integer amount so it can never contradict the
      // money, and never a base for recomputing one: the 6-dp figures do not generally sum to
      // 100.000000 (100.00 three ways → 33.34 / 33.33 / 33.33 → 100.000000 only by luck).
      sharePercent: sharePercentOf(entitledMinorValue, distributableMinor),
      basis: member.basis,
      reasonCode: outcome.reasonCode,
      gateFlags: outcome.gateFlags,
      bankingRefForProceeds: member.source.bankingRefForProceeds,
    };
    lines.push(line);

    entitledTotal += entitledMinorValue;
    switch (outcome.status) {
      case 'PAID':
        paid += entitledMinorValue;
        break;
      case 'WITHHELD':
        withheld += entitledMinorValue;
        break;
      case 'CROSS_BORDER_PENDING':
        crossBorder += entitledMinorValue;
        // The notice is queued ONLY when cross-border is the BINDING status. A line withheld for
        // KYC still records CROSS_BORDER_PENDING in `gateFlags`, so the routing requirement is not
        // lost, but the Authority is not notified of a disbursement that is not happening.
        // SURFACED, not resolved: whether Nazarah Art. 10(7) requires notice at the point of
        // ENTITLEMENT or of PAYMENT is a question of Saudi law for counsel.
        // ⚠ verify — may be stale (confirm vs primary law).
        notices.push({
          type: 'CROSS_BORDER_DISBURSEMENT',
          beneficiaryId: member.beneficiaryId,
          reasonCode: 'CROSS_BORDER_PENDING',
          reason:
            'Cross-border disbursement: Authority notice required before the line may be paid (Nazarah Art. 10(7) — ⚠ verify: may be stale, confirm vs primary law).',
        });
        break;
    }

    trace.push({
      stage: 'ALLOCATE',
      code: 'ALLOCATE_LINE',
      message: 'Entitled line allocated.',
      data: {
        beneficiaryId: member.beneficiaryId,
        status: outcome.status,
        stipulatedWeight: member.stipulatedWeight,
        floor: minorToDecimalString(minorOf(floorMinor)),
        entitled: minorToDecimalString(entitledMinorValue),
        residualHalala: entitledMinorValue === floorMinor ? '0' : '1',
        sharePercent: line.sharePercent,
        reasonCode: outcome.reasonCode ?? 'null',
        gateFlags: outcome.gateFlags.join(','),
      },
    });
  }

  for (const member of excluded) {
    const line = excludedLine(member, distributableMinor);
    lines.push(line);
    trace.push(excludedTraceStep(line));
  }

  lines.sort((a, b) => compareBeneficiaryIds(a.beneficiaryId, b.beneficiaryId));

  const retained = (distributableMinor as bigint) - entitledTotal;
  if (retained < 0n) {
    throw distributionInvariantBreach(
      'I2',
      `Σ entitled lines is ${String(entitledTotal)} halalas against a distributable pool of ${String(distributableMinor)} — the split handed out more than exists`,
      { entitledTotal: String(entitledTotal), distributableMinor: String(distributableMinor) },
    );
  }

  const totals: Totals = {
    paidMinor: minorOf(paid),
    withheldMinor: minorOf(withheld),
    crossBorderMinor: minorOf(crossBorder),
    retainedMinor: minorOf(retained),
    entitledMinor: minorOf(entitledTotal),
    excludedCount: excluded.length,
    entitledLineCount: entitled.length,
    residualMinor: minorOf(allocation.residualMinor),
  };

  assertTotalsBalance(totals, distributableMinor);

  trace.push(totalsTraceStep(totals, allocation));
  if (notices.length > 0) {
    trace.push({
      stage: 'ALLOCATE',
      code: 'ALLOCATE_AUTHORITY_NOTICE',
      message: 'Cross-border disbursement notices queued for the Authority.',
      data: {
        noticeCount: String(notices.length),
        beneficiaryIds: notices.map((notice) => notice.beneficiaryId).join(','),
      },
    });
  }

  return { lines, totals, authorityNotices: notices, trace };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Internals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The `NO_ELIGIBLE_BENEFICIARIES` / nil-cohort branch (AT-06).
 *
 * The EXCLUDED lines ARE emitted with their reason codes — §08 says "zero *payout* lines", not zero
 * lines — and the whole distributable lands in `retainedMinor`, which is the only reason the
 * restated I3 holds here at all.
 */
function assembleNilCohort(args: {
  readonly excluded: readonly ResolvedMember[];
  readonly allocation: AllocationResult;
  readonly distributableMinor: Minor;
  readonly trace: readonly TraceStep[];
}): AssembledLines {
  const { excluded, allocation, distributableMinor } = args;

  if (
    allocation.amountsMinor.length !== 0 ||
    allocation.floorsMinor.length !== 0 ||
    allocation.residualMinor !== 0n
  ) {
    throw distributionInvariantBreach(
      'I2',
      `no beneficiary is entitled, yet the allocation carries ${String(allocation.amountsMinor.length)} amounts and a residual of ${String(allocation.residualMinor)} halalas. An empty cohort is retained, never split`,
      {
        amountCount: allocation.amountsMinor.length,
        residualMinor: String(allocation.residualMinor),
      },
    );
  }

  const lines = [...excluded]
    .sort((a, b) => compareBeneficiaryIds(a.beneficiaryId, b.beneficiaryId))
    .map((member) => excludedLine(member, distributableMinor));

  const totals = emptyTotals(distributableMinor, lines.length);
  assertTotalsBalance(totals, distributableMinor);

  const trace: TraceStep[] = [
    ...args.trace,
    ...lines.map((line) => excludedTraceStep(line)),
    {
      stage: 'ALLOCATE',
      code: 'ALLOCATE_RETAINED_NO_ENTITLED_LINE',
      message:
        'No beneficiary is entitled this period; the whole distributable is reported as retained and attached to no line. Where it goes is OQ-01 sub-question 2 and is unsigned — the engine does not carry it forward.',
      data: { retained: minorToDecimalString(distributableMinor) },
    },
    totalsTraceStep(totals, allocation),
  ];

  return { lines, totals, authorityNotices: [], trace };
}

/** An EXCLUDED line: owed nothing, reason recorded, payability never reached. */
function excludedLine(member: ResolvedMember, distributableMinor: Minor): DistributionLine {
  const zero = minorOf(0n);
  return {
    beneficiaryId: member.beneficiaryId,
    status: 'EXCLUDED',
    entitledMinor: zero,
    sharePercent: sharePercentOf(zero, distributableMinor),
    basis: member.basis,
    reasonCode: member.exclusionReason,
    // Empty by design: an exclusion is an ENTITLEMENT verdict, and the payability gates were never
    // reached. §08 Example A pins `gateFlags []` on the tier-excluded line.
    gateFlags: [] as readonly GateReasonCode[],
    bankingRefForProceeds: member.source.bankingRefForProceeds,
  };
}

function excludedTraceStep(line: DistributionLine): TraceStep {
  return {
    stage: 'ALLOCATE',
    code: 'ALLOCATE_EXCLUDED_LINE',
    message:
      'Excluded line emitted for the record: owed nothing this period, and not in the split.',
    data: {
      beneficiaryId: line.beneficiaryId,
      entitled: minorToDecimalString(line.entitledMinor),
      reasonCode: line.reasonCode ?? 'null',
    },
  };
}

function totalsTraceStep(totals: Totals, allocation: AllocationResult): TraceStep {
  return {
    stage: 'ALLOCATE',
    code: 'ALLOCATE_TOTALS',
    message:
      'Totals rolled up from the lines. `retained` is distributable attached to no line (spec correction to §08 I2/I3).',
    data: {
      paid: minorToDecimalString(totals.paidMinor),
      withheld: minorToDecimalString(totals.withheldMinor),
      crossBorder: minorToDecimalString(totals.crossBorderMinor),
      retained: minorToDecimalString(totals.retainedMinor),
      entitled: minorToDecimalString(totals.entitledMinor),
      entitledLineCount: String(totals.entitledLineCount),
      excludedCount: String(totals.excludedCount),
      residualHalalas: String(allocation.residualMinor),
    },
  };
}

/**
 * The resolver must tell one story about its own verdict.
 *
 * Cheap, and it catches the class of bug that is otherwise invisible: a member marked entitled
 * while absent from `entitledIds` would be paid but not counted, and an excluded member with no
 * `exclusionReason` is an unexplained zero on a family member's statement.
 */
function assertResolverSelfConsistent(resolution: EntitlementResolution): void {
  const seen = new Set<string>();
  for (const member of resolution.resolved) {
    if (seen.has(member.beneficiaryId)) {
      throw distributionInvariantBreach(
        'I2',
        `the resolver returned two rows for beneficiary "${member.beneficiaryId}"`,
        { beneficiaryId: member.beneficiaryId },
      );
    }
    seen.add(member.beneficiaryId);

    if (member.entitled && member.exclusionReason !== null) {
      throw distributionInvariantBreach(
        'I5',
        `beneficiary "${member.beneficiaryId}" is entitled yet carries exclusion reason ${member.exclusionReason}`,
        { beneficiaryId: member.beneficiaryId, exclusionReason: member.exclusionReason },
      );
    }
    if (!member.entitled && member.exclusionReason === null) {
      throw distributionInvariantBreach(
        'I5',
        `beneficiary "${member.beneficiaryId}" is excluded with no reason code. An unexplained zero is not a statement of entitlement basis (BR-505)`,
        { beneficiaryId: member.beneficiaryId },
      );
    }
  }

  const entitledFromRows = resolution.resolved
    .filter((member) => member.entitled)
    .map((member) => member.beneficiaryId);
  const declared = new Set(resolution.entitledIds);

  if (declared.size !== resolution.entitledIds.length) {
    throw distributionInvariantBreach('I2', 'resolution.entitledIds contains a duplicate id', {
      declaredCount: resolution.entitledIds.length,
    });
  }
  if (
    declared.size !== entitledFromRows.length ||
    entitledFromRows.some((id) => !declared.has(id))
  ) {
    throw distributionInvariantBreach(
      'I2',
      `resolution.entitledIds (${String(resolution.entitledIds.length)}) does not match the rows marked entitled (${String(entitledFromRows.length)})`,
      {
        declared: String(resolution.entitledIds.length),
        fromRows: String(entitledFromRows.length),
      },
    );
  }

  const excludedFromRows = resolution.resolved.filter((member) => !member.entitled).length;
  if (resolution.excludedCount !== excludedFromRows) {
    throw distributionInvariantBreach(
      'I2',
      `resolution.excludedCount is ${String(resolution.excludedCount)} but ${String(excludedFromRows)} rows are excluded`,
      { declared: resolution.excludedCount, fromRows: excludedFromRows },
    );
  }
}

/**
 * The allocation must be the split of THIS cohort, in THIS order.
 *
 * Recomputes the Hamilton split from the ascending-id cohort's own weights and compares. A caller
 * that passed its weight vector in input order rather than ascending-id order fails here — including
 * the equal-weight case, where only the tie-break differs, every total still balances, and the wrong
 * family member is the one who receives the leftover halala.
 */
function assertAllocationMatchesCohort(
  entitled: readonly ResolvedMember[],
  allocation: AllocationResult,
  distributableMinor: Minor,
): void {
  if (allocation.amountsMinor.length !== entitled.length) {
    throw distributionInvariantBreach(
      'I2',
      `the allocation has ${String(allocation.amountsMinor.length)} amounts for an entitled cohort of ${String(entitled.length)}`,
      { amountCount: allocation.amountsMinor.length, entitledLineCount: entitled.length },
    );
  }
  if (allocation.floorsMinor.length !== entitled.length) {
    throw distributionInvariantBreach(
      'I9',
      `the allocation has ${String(allocation.floorsMinor.length)} floors for an entitled cohort of ${String(entitled.length)}`,
      { floorCount: allocation.floorsMinor.length, entitledLineCount: entitled.length },
    );
  }

  const expected = hamiltonSplit(
    distributableMinor as bigint,
    entitled.map((member) => member.stipulatedWeight),
  );

  if (expected.residualMinor !== allocation.residualMinor) {
    throw distributionInvariantBreach(
      'I9',
      `the allocation reports a residual of ${String(allocation.residualMinor)} halalas; splitting this cohort's own weights gives ${String(expected.residualMinor)}`,
      {
        supplied: String(allocation.residualMinor),
        recomputed: String(expected.residualMinor),
      },
    );
  }

  for (const [index, member] of entitled.entries()) {
    const supplied = allocation.amountsMinor[index];
    const recomputed = expected.amountsMinor[index];
    const suppliedFloor = allocation.floorsMinor[index];
    const recomputedFloor = expected.floorsMinor[index];
    if (
      supplied === undefined ||
      recomputed === undefined ||
      suppliedFloor === undefined ||
      recomputedFloor === undefined ||
      supplied !== recomputed ||
      suppliedFloor !== recomputedFloor
    ) {
      throw distributionInvariantBreach(
        'I2',
        `the supplied allocation does not match the split of the entitled cohort at index ${String(index)} (beneficiary "${member.beneficiaryId}", weight ${member.stipulatedWeight}): ${String(supplied)} vs ${String(recomputed)} halalas. The weight vector must be built from entitledCohortWeights(), i.e. the entitled cohort in ascending beneficiaryId order`,
        {
          index,
          beneficiaryId: member.beneficiaryId,
          supplied: String(supplied),
          recomputed: String(recomputed),
        },
      );
    }
  }
}

/**
 * §08 I3 as restated by the DEFECT-1 correction, plus the non-negativity of every reported total.
 *
 * The three status sums are re-derived from the totals object rather than trusted from a running
 * counter, so a mis-assigned status shows up here as an imbalance instead of on a statement.
 * `invariants.ts` asserts the same identity again over the assembled lines; the duplication is
 * deliberate — this is the last check before the numbers leave Stage 5.
 */
function assertTotalsBalance(totals: Totals, distributableMinor: Minor): void {
  const monetary: readonly (readonly [string, bigint])[] = [
    ['paidMinor', totals.paidMinor],
    ['withheldMinor', totals.withheldMinor],
    ['crossBorderMinor', totals.crossBorderMinor],
    ['retainedMinor', totals.retainedMinor],
    ['entitledMinor', totals.entitledMinor],
    ['residualMinor', totals.residualMinor],
  ];
  for (const [field, value] of monetary) {
    if (value < 0n) {
      throw distributionInvariantBreach(
        'I4',
        `totals.${field} is ${String(value)} halalas; no monetary total may be negative`,
        { field, value: String(value) },
      );
    }
  }

  const statusSum =
    (totals.paidMinor as bigint) +
    (totals.withheldMinor as bigint) +
    (totals.crossBorderMinor as bigint) +
    (totals.retainedMinor as bigint);
  if (statusSum !== (distributableMinor as bigint)) {
    throw distributionInvariantBreach(
      'I3',
      `paid + withheld + crossBorder + retained = ${String(statusSum)} halalas against a distributable pool of ${String(distributableMinor)}`,
      { statusSum: String(statusSum), distributableMinor: String(distributableMinor) },
    );
  }

  const entitledPlusRetained = (totals.entitledMinor as bigint) + (totals.retainedMinor as bigint);
  if (entitledPlusRetained !== (distributableMinor as bigint)) {
    throw distributionInvariantBreach(
      'I2',
      `Σ entitled + retained = ${String(entitledPlusRetained)} halalas against a distributable pool of ${String(distributableMinor)}`,
      {
        entitledPlusRetained: String(entitledPlusRetained),
        distributableMinor: String(distributableMinor),
      },
    );
  }

  assertResidualBoundedBy(totals.residualMinor as bigint, totals.entitledLineCount);
}
