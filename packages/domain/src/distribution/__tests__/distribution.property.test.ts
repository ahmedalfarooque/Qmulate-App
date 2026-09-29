/**
 * `distribution.property.test.ts` — the §08 engine's property suite (E6 exit clause, gate G-9).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR, AND WHY IT IS NOT A SECOND COPY OF THE VECTOR TESTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The sibling suites pin the SPECIFIC numbers the deed and the regulation care about — worked
 * examples A–F, the §08 acceptance criteria, the gate boundaries. Those catch a wrong answer on a
 * case someone thought of. This file catches a wrong answer on the case nobody thought of: it
 * asserts the ALGEBRA over generated inputs, so a waterfall that conserves value on six hand-built
 * examples and leaks a halala on the seventh fails here instead of on a real family's statement.
 *
 * Generators live in `./arbitraries.ts`; read that file's header first — it explains the six
 * cross-field couplings a valid `DistributionInputRaw` has to satisfy and how each is satisfied by
 * construction rather than by filtering.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RUN BUDGET, AND WHY IT IS DISTRIBUTED THE WAY IT IS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The E6 exit clause names a number: *"fast-check finds no waterfall leakage over 10 000 generated
 * cases."* {@link RUNS_LEAKAGE} = 10 000 is therefore stated explicitly on P1, the leakage
 * property — not left to fast-check's 100-run default, and not spread thinly across every property
 * so that no single one meets the clause.
 *
 * The remaining properties carry smaller counts because each costs two or more full engine runs per
 * case (a mutation property runs the engine twice and deep-compares), and because the space each
 * explores is far narrower than P1's. Every count is a named constant with the reason next to it,
 * so a future edit that quietly drops P1 to 100 is visible in review.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE SEED IS PINNED — AND THAT IS A TRADE, NOT A FREE WIN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * {@link SEED} is fixed, so CI explores the SAME cases on every run: a failure is reproducible from
 * the seed alone, and this suite can never flake. The cost is that it also stops discovering new
 * cases over time. That is the right trade for a gate — a gate that is red only sometimes is not a
 * gate — but it means the generators' COVERAGE has to be asserted rather than assumed, which is
 * what the `stats` counters below do. Without them a generator could drift until it only ever
 * produced, say, nil-revenue inputs, and every property here would still pass.
 *
 * To hunt for new counter-examples locally, change {@link SEED} or delete it temporarily; do not
 * commit an unpinned seed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE INDEPENDENT RE-DERIVATIONS ARE THE POINT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Two of these properties would be nearly vacuous if written the obvious way, and both are called
 * out honestly here rather than left to look strong:
 *
 * · **I1 is a tautology at runtime.** `computeWaterfall` derives `distributableMinor` AS the
 *   remainder, so `revenue == reserve + operating + fee + distributable` cannot fail unless the code
 *   is mis-typed. The assertion with teeth is {@link expectedReserveMinor} /
 *   {@link expectedNazirFee}, which recompute every deduction from ITS OWN BASIS in pure bigint —
 *   `halfUpPercentMinor` implements half-up as `(2n + d) / 2d` with no `Decimal` anywhere. A fee
 *   computed on the wrong base, or with §08's `0.10`-as-10% defect (a silent 100× underpayment of
 *   the ʿushr), fails term-by-term even though conservation still balances.
 *
 * · **The split would be self-confirming** if it were checked against `largestRemainderAllocate`,
 *   which is what `allocateMinor` already calls. {@link independentHamilton} therefore re-derives
 *   floors, remainders, the residual AND the tie-break from the weight strings in bigint, so the
 *   two implementations cross-check each other and the ascending-`beneficiaryId` tie-break is
 *   proven rather than inherited.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO ASSERTIONS THIS FILE DELIBERATELY DOES NOT MAKE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. **`Σ sharePercent === 100.000000` is NOT asserted, ever.** It is false in general: 100.00 split
 *    three ways gives 33.34 / 33.33 / 33.33, whose 6-dp figures happen to sum to 100 by luck, while
 *    most weight vectors do not. P1 counts the runs where the sum diverges and asserts that count is
 *    positive — an inverted assertion, so that a future author who "fixes" `sharePercent` into
 *    something that always sums to 100 (by making it a base rather than a display figure) fails.
 * 2. **I8 is not asserted from a single run.** Determinism is a statement about two runs; the engine
 *    correctly never reports `I8` in `invariantsChecked`, and P6 asserts it across runs instead.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED: 31 HAND-WRITTEN MUTANTS, 29 KILLED, 2 PROVABLY EQUIVALENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A green property suite proves nothing on its own, so every property here was checked by breaking
 * the engine on purpose and confirming it goes red. The first pass had FOUR survivors; two were
 * real gaps and were closed, and the remaining two are equivalent mutants — verified equivalent by
 * probe, not assumed:
 *
 * · **CLOSED — `EARLIER_OF` collapsed into `GREGORIAN`.** Survived because ~⅓ of runs use the
 *   `HIJRI` selector directly, which keeps `boundBy === 'HIJRI'` frequent whatever `EARLIER_OF`
 *   does. That mutant under-reports lateness — exactly what decision D2 exists to prevent.
 *   {@link assertTimingCoherence} now restates D2 independently, and P1 counts the `EARLIER_OF`
 *   runs bound by each calendar separately.
 * · **CLOSED — an excluded member keeping its weight out of the resolver.** Survived because the
 *   engine also filters on `entitled` before the allocator, so no payout changed. It still disarms
 *   the defensive guarantee `resolver.ts` documents for E5/S6. P5b's second property pins it, and
 *   P5b's first property independently pins the denominator itself (G-9 clause 3's decisive check:
 *   the surviving members get 50% each, not 33.3%).
 * · **EQUIVALENT — relaxing the net-income guard from `< 0n` to `< -1n`.** A `netIncome` of `−1`
 *   can never yield a run: the fee is non-negative on every basis, so `distributable = −1 − fee`
 *   fails the next guard with the SAME `DISTRIBUTION_NEGATIVE` code (and a
 *   `PERCENT_OF_NET_INCOME` fee refuses the negative base first). Probed across all four fee
 *   shapes: identical outcome. Only the message differs, and asserting on messages would be brittle.
 * · **EQUIVALENT — zeroing `retainedMinor` inside `assembleLines`' entitled-cohort branch.** In that
 *   branch `allocateMinor` hands out the WHOLE pool, so `retained` is already `0n`. Verified by
 *   probe: a throw-if-non-zero guard installed at that exact line passes all 10 000+ cases. The
 *   branch where `retained` really can be positive is `emptyTotals`, and zeroing it THERE is killed
 *   (by P1 and P7) — so the state DEFECT-1 exists for is covered, and this line is dead weight.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · SIX MORE MUTANTS, ALL KILLED — three in the engine, three in the GENERATORS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every engine file was restored by re-editing and confirmed byte-identical by `shasum -a 256`. The
 * generator mutants matter as much as the engine ones: **half of what P13 claims is a claim about
 * coverage**, and a coverage assertion nobody has broken on purpose is decoration.
 *
 * | # | mutation | killed by |
 * |---|---|---|
 * | 1 | `ultimateTakerVerdict`'s PENDING arm disabled — the taker is no longer default-excluded | P13.1 (**`expected 'WITHHELD' to be 'EXCLUDED'` — the property caught the paid charity before I-R1 had to**), P13.2, P13.3, P13.6 |
 * | 2 | the extinction trigger off by one (`livingBloodlineIds.length > 1`) — the LAST survivor stops counting | P13.1, P13.2, P13.3, P13.6 (via I-R1's flag cross-check) |
 * | 3 | `!isTaker` dropped from the per-capita effective weight — a charity paid per capita, not by deed weight (R7-e) | P13.1, P13.3 |
 * | 4 | `arbUltimateTakerCohort` can no longer emit an extinct bloodline | P13.1 `expected 0 to be greater than 2000`, P13.6, P13.7 — **the coverage minimum doing exactly its job** |
 * | 5 | `arbRefusedNatureInput`'s R7-f arm disabled | P12 **by name** (`+ "JIHA_TIERED"`), P10 `expected 0 to be greater than 50` |
 * | 6 | `arbMalformedLineageInput` case 7 disabled | P12 **by name** (`+ "LINEAGE_ROOTED_OUTSIDE_THE_WAQIF"`) |
 *
 * Mutants 5 and 6 are the two that matter most for this pass, because each targets a refusal R7 brought
 * back into reach. If either generator is ever removed, P12 names the refusal instead of going quiet —
 * which is the difference between this suite reporting a blind spot and having one.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7-D1 · FOUR MORE MUTANTS — and the coverage assertion that needed two attempts
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * | # | mutation | killed by |
 * |---|---|---|
 * | 7 | `reversionOutcome`'s placeholder check disabled — R7-D1 restored | P13.1 `expected 1n to be 0n` on the held taker (the safety counter), P13's paired placeholder property, `reversion-adversarial` §7.1/7.2/7.5 **on the money figure**, the escape grid's 16 → 0 |
 * | 8 | the hold made UNCONDITIONAL (`recordedBloodlineIds.length > 0`) — the over-broad fix | **57 tests across 13 files**, incl. P13.2/P13.3/P13.4/P13.6, P12's refusal census, `engine.test.ts` T1–T3, `reversion-adversarial` §7.4/§7.6, the grid's enumerated-extinct 8 |
 * | 9 | `'WITH_PLACEHOLDER'` forces no index | P13.1 `composition 'WITH_PLACEHOLDER' produced a register with no placeholder in it`, P13's paired property `expected 0 to be greater than 0` |
 * | 10 | `'ENUMERATED_ONLY'` forces no index | **8 red** — P13.1 `leaked a placeholder into the register`, plus P13.2/P13.3/P13.4/P13.6, whose subjects are only reachable on a register that really does revert |
 *
 * ⚠ **Mutant 9 SURVIVED the first version of its coverage assertion, and that is worth more than the
 * kill.** Counting "cases from the forced arm whose register got the shape it asked for" and requiring
 * `> 2_000` stayed green, because a drawn register of 2 … 6 members bears a placeholder ~97% of the time
 * regardless — the forced arm and a lucky one are statistically indistinguishable, so the threshold was
 * measuring the draw and not the forcing. The assertion is now the **exact guarantee**, asserted on every
 * case, with the counters demoted to proving both arms were drawn at all. *A coverage minimum can be
 * satisfied by the very accident it was written to exclude.*
 */

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { compareCivilDates, differenceInCalendarDays, fromHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import { GATE_PRECEDENCE } from '../gates.js';
import { allocateMinor } from '../allocate.js';
import {
  BENEFICIARY_KINDS,
  CONTINUATION_STIPULATIONS,
  ENTITLEMENT_ORDERS,
  LINEAGE_LINKS,
  SHART_REFUSALS,
  WAQF_TYPES,
  minorOf,
  parseDistributionInput,
  type DistributionInputRaw,
  type DistributionResult,
  type FeeBasis,
} from '../contract.js';
import { ENGINE_VERSION, runDistribution } from '../engine.js';
import { buildLineage, resolveEntitlement } from '../resolver.js';
import { canonicalizeResult } from '../trace.js';
import {
  MAX_MINOR,
  MONEY_ORDERS,
  ancestorChains,
  arbAnyReversionRunInput,
  arbBranchedLineageRunInput,
  arbCharitableJihaOnFamilyWaqfCase,
  arbCharitablePlaceholderCase,
  arbContinuationStipulation,
  arbDescendantOnCharitableWaqfCase,
  arbDistributionInput,
  arbEntitledCohort,
  arbGateFields,
  arbLineageRunInput,
  arbLiveRunInput,
  arbMalformedLineageInput,
  arbNonZeroWeight,
  arbRefusedNatureInput,
  arbRevenueCorruption,
  arbReversionRefusalCase,
  arbReversionRunInput,
  arbTieredCohort,
  arbTieredUltimateTakerCase,
  arbUltimateTakerWeightsUnusableCase,
  arbWeight,
  branchRoots,
  corruptRevenue,
  livingMembersWithIssue,
  maxLineageDepth,
  sumReceipts,
  withGateFieldsReplaced,
  withInjectedCapitalReceipt,
  withMemberDeceased,
  withSeniorTabaqaMember,
  type RawMaintenance,
  type RawNazirFee,
} from './arbitraries.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Run budget and seed
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Pinned so a failure is reproducible from the seed alone. See the header. */
const SEED = 0x51_4d_55_4c; // "QMUL"

/** P1 — the E6 exit clause names this number verbatim. Do not reduce it. */
const RUNS_LEAKAGE = 10_000;

/** P2 — one engine call, narrower space: enough to hit both sides of the refusal repeatedly. */
const RUNS_NEGATIVE = 1_500;

/** P5 — `allocateMinor` only, no engine: cheap, and the weight space is where the bugs hide. */
const RUNS_ALLOCATE = 2_000;

/** P7 / P8b — one engine call each over a narrow, purpose-built space. */
const RUNS_SINGLE_RUN = 1_000;

/** P3 / P4 / P8a — TWO engine calls plus a deep comparison per case. */
const RUNS_PAIRED = 500;

/** P6 / P9 / P10 — the space is tiny (a flag, a setting value, a string). */
const RUNS_SMALL = 300;

/** P6's byte-identity check: the §08 acceptance criterion says 50 repetitions. */
const CANONICAL_REPEATS = 50;

/**
 * Vitest's default `testTimeout` is 5 s, which P1's 10 000 engine runs exceed — the first run of
 * this suite failed on the clock, not on an assertion.
 *
 * ⚠ The original budgets here were sized at "~10× the measured wall time", and **that reasoning was
 * wrong**: the wall time it multiplied was measured in ISOLATION, but this suite runs inside
 * `turbo run test` across nine workspaces. MEASURED (S3): P1 takes **9.5 s alone and 129.8 s under
 * full-pipeline contention** — a 13.7× factor. So a 10× budget was not headroom over contention, it
 * was *below* it, and the 120 s ceiling went red in the pipeline while passing standalone. CI's
 * 2-core runner is slower again.
 *
 * Budgets are now sized against the CONTENDED time with real headroom. The package-level default
 * (`vitest.config.ts`, 60 s) covers everything; P1 names its own because it is the one test whose
 * run count is fixed by the E6 exit clause and cannot be trimmed to fit a clock.
 *
 * These are CEILINGS, not durations. At 9.5 s normal / 130 s contended, a 600 s ceiling still fails
 * a genuine O(n²) regression by a wide margin — it only stops a loaded box being reported as a
 * distribution-integrity defect, which is the worst possible false signal on this particular gate.
 */
const TIMEOUT_LEAKAGE_MS = 600_000;
const TIMEOUT_STANDARD_MS = 120_000;

/**
 * `verbose` is deliberately OFF: fast-check's execution summary allocates per run, and at 10 000
 * runs that is measurable. The seed and the shrunk counter-example are reported by default, which is
 * everything needed to reproduce a failure.
 */
function config(numRuns: number): fc.Parameters<unknown> {
  return { numRuns, seed: SEED };
}

// File-scoped, so every property gets the standard budget and only P1 needs to name its own.
vi.setConfig({ testTimeout: TIMEOUT_STANDARD_MS });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Outcome helper — a domain refusal is a legitimate result, an unexpected throw is not
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type Outcome =
  | { readonly ok: true; readonly result: DistributionResult }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      /**
       * ADR-0009's `details.refusal` discriminator.
       *
       * Load-bearing, not decorative: **twenty-six** distinct refusals now share the `SHART_INCOMPLETE`
       * code (this comment said "fifteen" until R7 added eight more — a count that drifts is a comment
       * teaching the next reader a false number, so it is pinned by `contract.test.ts` and not here),
       * so a property asserting only the code could pass while the engine refused for a reason the
       * property was not about. That is exactly how R5's joint refusal would have silently taken over
       * every pre-existing refusal property in this file.
       */
      readonly refusal: string | null;
    };

/**
 * Run the engine, classifying a `DomainError` as data and anything else as a bug.
 *
 * A `TypeError`, a `RangeError` from the date engines, or a raw `ZodError` escaping the pure core
 * is re-thrown so it fails the property loudly. That is the whole reason this wrapper exists: a
 * blanket `try/catch` would let a crash masquerade as "the engine refused, as expected".
 */
function runOutcome(input: DistributionInputRaw): Outcome {
  try {
    return { ok: true, result: runDistribution(input) };
  } catch (error) {
    if (isDomainError(error)) {
      const details = error.details as Record<string, unknown> | undefined;
      return {
        ok: false,
        code: error.code,
        message: error.message,
        refusal: typeof details?.refusal === 'string' ? details.refusal : null,
      };
    }
    throw error;
  }
}

function expectRefusal(input: DistributionInputRaw, code: string): void {
  const outcome = runOutcome(input);
  expect(outcome.ok, `expected ${code}, got a result`).toBe(false);
  if (!outcome.ok) expect(outcome.code).toBe(code);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Independent re-derivations (pure bigint — no `Decimal`, no engine helper)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `ratePercent`% of `baseMinor`, half-up to the halala, in exact integer arithmetic.
 *
 * `round_halfup(n / d) === floor((2n + d) / 2d)` for non-negative `n`, `d` — so the whole
 * computation stays in bigint and shares no code path with `money.ts`'s `percentOf`. That
 * independence is the point: this is the derivation that catches a fee taken on the wrong base, a
 * rate read as a fraction instead of out of 100 (the §08 `0.10` defect — a 100× underpayment that
 * leaves every conservation identity intact), or a rounding direction quietly changed to floor.
 */
function halfUpPercentMinor(baseMinor: bigint, ratePercent: string): bigint {
  const dot = ratePercent.indexOf('.');
  const whole = dot === -1 ? ratePercent : ratePercent.slice(0, dot);
  const fraction = dot === -1 ? '' : ratePercent.slice(dot + 1);
  const scaledRate = BigInt(`${whole}${fraction}`);
  const denominator = 100n * 10n ** BigInt(fraction.length);
  const numerator = baseMinor * scaledRate;
  return (2n * numerator + denominator) / (2n * denominator);
}

/** The ṣiyāna (صيانة) reserve, from the Shart's RULE — never from a maintenance expense. */
function expectedReserveMinor(revenueMinor: bigint, rule: RawMaintenance): bigint {
  switch (rule.kind) {
    case 'FIXED':
      return rule.amountMinor;
    case 'PERCENT':
      return halfUpPercentMinor(revenueMinor, rule.ratePercent);
    case 'TARGET_TOPUP': {
      // Clamped at zero: a reserve already above its target tops up by nothing, never by a negative
      // amount that would inflate distributable.
      const shortfall = rule.targetBalanceMinor - rule.currentBalanceMinor;
      return shortfall > 0n ? shortfall : 0n;
    }
    case 'NONE':
      return 0n;
    // OQ-06 — the Nazir's recorded discretion under a silent deed. Same arithmetic as the founder's
    // PERCENT; recomputed independently here for the same reason every other arm is.
    case 'NAZIR_DISCRETION_PERCENT':
      return halfUpPercentMinor(revenueMinor, rule.ratePercent);
    // OQ-06 — deed silent, nothing recorded. Zero, and the run carries the flag that says so.
    case 'UNSET':
      return 0n;
    default: {
      const unmapped: never = rule;
      throw new Error(`expectedReserveMinor: unmapped rule ${JSON.stringify(unmapped)}`);
    }
  }
}

/** The Nazir fee (ʿushr / عُشر) on its deed-set basis. `null` deed ⇒ zero fee, `null` basis. */
function expectedNazirFee(
  revenueMinor: bigint,
  netIncomeMinor: bigint,
  fee: RawNazirFee,
): { readonly minor: bigint; readonly basis: FeeBasis | null } {
  if (fee === null || fee === undefined) return { minor: 0n, basis: null };
  switch (fee.basis) {
    case 'PERCENT_OF_REVENUE':
      return {
        minor: halfUpPercentMinor(revenueMinor, fee.ratePercent),
        basis: 'PERCENT_OF_REVENUE',
      };
    case 'PERCENT_OF_NET_INCOME':
      return {
        minor: halfUpPercentMinor(netIncomeMinor, fee.ratePercent),
        basis: 'PERCENT_OF_NET_INCOME',
      };
    case 'RETAINER':
      return { minor: fee.fixedAmountMinor, basis: 'RETAINER' };
    default: {
      const unmapped: never = fee;
      throw new Error(`expectedNazirFee: unmapped fee ${JSON.stringify(unmapped)}`);
    }
  }
}

interface HamiltonExpectation {
  readonly amounts: readonly bigint[];
  readonly floors: readonly bigint[];
  readonly remainders: readonly bigint[];
  readonly residual: bigint;
  readonly bumped: ReadonlySet<number>;
}

function decimalPlacesOf(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

function scaleWeightToInteger(value: string, scale: number): bigint {
  const dot = value.indexOf('.');
  const whole = dot === -1 ? value : value.slice(0, dot);
  const fraction = dot === -1 ? '' : value.slice(dot + 1);
  return BigInt(whole + fraction.padEnd(scale, '0'));
}

/**
 * Hamilton (largest-remainder) from first principles, in bigint.
 *
 * Floor, remainder, residual and the tie-break are all re-derived from the weight STRINGS, so this
 * shares no line of code with either `money.ts`'s allocator or `allocate.ts`'s cross-check. The
 * tie-break is "remainder descending, then index ascending" — and because the engine feeds the
 * cohort in ascending `beneficiaryId` order, ascending index IS ascending id.
 */
function independentHamilton(totalMinor: bigint, weights: readonly string[]): HamiltonExpectation {
  const scale = weights.reduce((max, weight) => Math.max(max, decimalPlacesOf(weight)), 0);
  const weightIntegers = weights.map((weight) => scaleWeightToInteger(weight, scale));
  const weightTotal = weightIntegers.reduce((running, value) => running + value, 0n);

  const floors = weightIntegers.map((weight) => (totalMinor * weight) / weightTotal);
  const remainders = weightIntegers.map(
    (weight, index) => totalMinor * weight - (floors[index] ?? 0n) * weightTotal,
  );
  const residual = totalMinor - floors.reduce((running, value) => running + value, 0n);

  const ranked = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return a.remainder > b.remainder ? -1 : 1;
    });
  const bumped = new Set(ranked.slice(0, Number(residual)).map((entry) => entry.index));
  const amounts = floors.map((floor, index) => (bumped.has(index) ? floor + 1n : floor));

  return { amounts, floors, remainders, residual, bumped };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Shared result assertions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const SHARE_PERCENT_PATTERN = /^\d+\.\d{6}$/;

interface StatusSums {
  readonly paid: bigint;
  readonly withheld: bigint;
  readonly crossBorder: bigint;
  readonly entitled: bigint;
  readonly excludedCount: number;
}

/**
 * Partition `lines` on `status` and sum each bucket FROM THE LINES.
 *
 * Never carried forward from a running counter inside the engine: a mis-assigned status has to show
 * up as an imbalance here, which it cannot do if the test reads the same accumulator the engine
 * wrote.
 */
function sumByStatus(result: DistributionResult): StatusSums {
  let paid = 0n;
  let withheld = 0n;
  let crossBorder = 0n;
  let entitled = 0n;
  let excludedCount = 0;

  for (const line of result.lines) {
    const amount = line.entitledMinor as bigint;
    switch (line.status) {
      case 'PAID':
        paid += amount;
        entitled += amount;
        break;
      case 'WITHHELD':
        withheld += amount;
        entitled += amount;
        break;
      case 'CROSS_BORDER_PENDING':
        crossBorder += amount;
        entitled += amount;
        break;
      case 'EXCLUDED':
        excludedCount += 1;
        // I3: an EXCLUDED line contributes zero. Asserted, not assumed.
        expect(amount).toBe(0n);
        break;
    }
  }

  return { paid, withheld, crossBorder, entitled, excludedCount };
}

/**
 * Every conservation identity the E6 exit clause and G-9 clause 1 rest on, as ONE chain.
 *
 * The chain matters more than any single link: G-9 says "no leakage", and value can leak at the
 * waterfall (step 1), at the split (step 2), at the status partition (step 3) or by a corpus receipt
 * bleeding into any of them (step 4). Checking only the first would have passed a build that paid
 * out istibdal proceeds.
 */
function assertConservation(input: DistributionInputRaw, result: DistributionResult): void {
  const waterfall = result.waterfall;
  const revenue = waterfall.revenueMinor as bigint;
  const reserve = waterfall.maintenanceReserveMinor as bigint;
  const operating = waterfall.operatingCostMinor as bigint;
  const fee = waterfall.nazirFeeMinor as bigint;
  const netIncome = waterfall.netIncomeMinor as bigint;
  const distributable = waterfall.distributableMinor as bigint;
  const capital = waterfall.capitalReceiptsMinor as bigint;

  /* ── I-C1 · the corpus totals, re-derived from the receipts ──────────────────────────── */
  expect(revenue).toBe(sumReceipts(input.revenue, 'INCOME'));
  expect(capital).toBe(sumReceipts(input.revenue, 'CAPITAL'));

  /* ── I1 · every deduction recomputed from ITS OWN BASIS (the assertion with teeth) ───── */
  expect(reserve).toBe(expectedReserveMinor(revenue, input.maintenance));
  expect(operating).toBe(input.operatingCostMinor);
  expect(netIncome).toBe(revenue - reserve - operating);
  const feeExpectation = expectedNazirFee(revenue, netIncome, input.nazirFee);
  expect(fee).toBe(feeExpectation.minor);
  expect(waterfall.nazirFeeBasis).toBe(feeExpectation.basis);
  expect(distributable).toBe(netIncome - fee);

  /* ── I1 · conservation itself (tautological at runtime — see the header) ─────────────── */
  expect(reserve + operating + fee + distributable).toBe(revenue);
  expect(distributable).toBeLessThanOrEqual(revenue);

  /* ── I4 · no negative escapes ────────────────────────────────────────────────────────── */
  for (const value of [revenue, reserve, operating, fee, netIncome, distributable, capital]) {
    expect(value >= 0n).toBe(true);
  }

  /* ── I2 / I3 · the split and the status partition, both summed from the LINES ────────── */
  const sums = sumByStatus(result);
  const totals = result.totals;
  const retained = totals.retainedMinor as bigint;

  expect(sums.entitled).toBe(totals.entitledMinor as bigint);
  expect(sums.paid).toBe(totals.paidMinor as bigint);
  expect(sums.withheld).toBe(totals.withheldMinor as bigint);
  expect(sums.crossBorder).toBe(totals.crossBorderMinor as bigint);
  expect(sums.excludedCount).toBe(totals.excludedCount);

  // I2 restated (DEFECT-1): the §08 original is false for a nil run, an ineligible cohort, and a
  // direct-use waqf that had period revenue. `retainedMinor` is what closes it.
  expect(sums.entitled + retained).toBe(distributable);
  // I3 restated (DEFECT-1), same reason.
  expect(sums.paid + sums.withheld + sums.crossBorder + retained).toBe(distributable);

  for (const value of [
    sums.paid,
    sums.withheld,
    sums.crossBorder,
    retained,
    totals.residualMinor as bigint,
  ]) {
    expect(value >= 0n).toBe(true);
  }

  /* ── I-C1 · the corpus total is arithmetically ABSENT from every downstream figure ───── */
  expect(reserve + operating + fee + sums.entitled + retained).toBe(revenue);

  /* ── I9 · the residual bound, against the reported line count ───────────────────────── */
  const residual = totals.residualMinor as bigint;
  if (totals.entitledLineCount === 0) {
    expect(residual).toBe(0n);
  } else {
    expect(residual < BigInt(totals.entitledLineCount)).toBe(true);
  }
}

/**
 * Output shape facts every run must satisfy, whatever its numbers (AT-16, I8's ordering half).
 *
 * `lines` ordering is asserted with plain `<` on the id strings — the same UTF-16 code-unit order
 * `compareBeneficiaryIds` uses, and deliberately NOT `localeCompare`, whose ICU-dependent ordering
 * would make the residual tie-break — and therefore a payout — host-dependent.
 */
function assertShapeAndOrdering(input: DistributionInputRaw, result: DistributionResult): void {
  expect(result.engineVersion).toBe(ENGINE_VERSION);
  expect(result.waqfId).toBe(input.waqfId);

  for (let index = 1; index < result.lines.length; index += 1) {
    const previous = result.lines[index - 1];
    const current = result.lines[index];
    expect(previous).toBeDefined();
    expect(current).toBeDefined();
    if (previous !== undefined && current !== undefined) {
      expect(previous.beneficiaryId < current.beneficiaryId).toBe(true);
    }
  }

  for (const line of result.lines) {
    expect(line.sharePercent).toMatch(SHARE_PERCENT_PATTERN);
    // No optional fields in the output: an absent value is an explicit `null`, because an absent key
    // and a `null` key serialize differently and the result is canonicalized and hashed.
    expect(line.reasonCode === null || typeof line.reasonCode === 'string').toBe(true);
    expect(
      line.bankingRefForProceeds === null || typeof line.bankingRefForProceeds === 'string',
    ).toBe(true);
    for (const flag of line.gateFlags) {
      expect(GATE_PRECEDENCE).toContain(flag);
    }
  }

  // Invariants the engine asserts on EVERY run. I8 can never be among them: determinism is a claim
  // about two runs and is not assertable from one.
  for (const id of ['I1', 'I2', 'I3', 'I4', 'I7', 'I9', 'I-C1'] as const) {
    expect(result.invariantsChecked).toContain(id);
  }
  expect(result.invariantsChecked).not.toContain('I8');

  // `CAPITAL_RECEIPTS_EXCLUDED` is keyed on the PRESENCE of a corpus row, not on a positive amount:
  // a 0-halala istibdal row is still a corpus row that was held out.
  const hasCapitalRow = input.revenue.receipts.some(
    (receipt) => receipt.receiptClass === 'CAPITAL',
  );
  expect(result.flags.includes('CAPITAL_RECEIPTS_EXCLUDED')).toBe(hasCapitalRow);

  // ⚠ every run carries its unverified markers, so no surface can quote a figure without its caveat.
  expect(result.unverifiedNotes.length).toBeGreaterThan(0);
  expect(result.flags).toContain('UNVERIFIED_FIGURES_APPLIED');

  assertTimingCoherence(input, result);
}

/**
 * Decision D2, restated independently: WHICH deadline binds, and the guarantee behind the choice.
 *
 * The `EARLIER_OF` branch is asserted two ways on purpose. The exact form (`boundBy === 'HIJRI'` iff
 * the Hijri deadline lands strictly earlier) pins the tie rule — a same-day tie resolves to
 * `GREGORIAN`, because only the label differs and the Gregorian figure is what appears on the
 * filing. The inequality form — *the binding deadline is never LATER than either candidate* — pins
 * the RATIONALE: D2 exists so lateness can never be under-reported, and a build that quietly
 * collapsed `EARLIER_OF` into `GREGORIAN` would still satisfy every conservation identity in this
 * file while telling a Nazir he had a day he did not have. That mutant survived the first
 * adversarial pass; this is what kills it.
 */
function assertTimingCoherence(input: DistributionInputRaw, result: DistributionResult): void {
  const timing = result.timing;

  // Both deadlines are always reported, whichever one bound (D2).
  expect(timing.deadlineGregorian).toBe(input.deadline.gregorian);
  expect(timing.deadlineHijri).toBe(input.deadline.hijri);
  expect(timing.settingKey).toBe(input.deadline.settingKey);
  expect(timing.months).toBe(input.deadline.months);
  expect(timing.bindingCalendar).toBe(input.policy.bindingCalendar);
  // The two deadlines are placed on ONE comparison axis by the engine's own Hijri implementation.
  expect(timing.hijriDeadlineAsGregorian).toBe(fromHijri(input.deadline.hijri));

  const hijriIsEarlier =
    compareCivilDates(timing.hijriDeadlineAsGregorian, timing.deadlineGregorian) < 0;

  switch (timing.bindingCalendar) {
    case 'EARLIER_OF':
      expect(timing.boundBy).toBe(hijriIsEarlier ? 'HIJRI' : 'GREGORIAN');
      expect(timing.bindingDeadlineGregorian).toBe(
        hijriIsEarlier ? timing.hijriDeadlineAsGregorian : timing.deadlineGregorian,
      );
      // The rationale, not just the mechanics: never later than either candidate.
      expect(
        compareCivilDates(timing.bindingDeadlineGregorian, timing.deadlineGregorian) <= 0,
      ).toBe(true);
      expect(
        compareCivilDates(timing.bindingDeadlineGregorian, timing.hijriDeadlineAsGregorian) <= 0,
      ).toBe(true);
      break;
    case 'GREGORIAN':
      expect(timing.boundBy).toBe('GREGORIAN');
      expect(timing.bindingDeadlineGregorian).toBe(timing.deadlineGregorian);
      break;
    case 'HIJRI':
      expect(timing.boundBy).toBe('HIJRI');
      expect(timing.bindingDeadlineGregorian).toBe(timing.hijriDeadlineAsGregorian);
      break;
  }

  expect(timing.daysUntilDeadline).toBe(
    differenceInCalendarDays(input.asOf.gregorian, timing.bindingDeadlineGregorian),
  );
  // Inclusive boundary: exactly ON the deadline is ON_TIME.
  expect(timing.status).toBe(timing.daysUntilDeadline < 0 ? 'OVERDUE' : 'ON_TIME');
  expect(result.flags.includes('TIMING_OVERDUE')).toBe(timing.status === 'OVERDUE');

  expect(timing.basis).toBe(
    input.disbursementSchedule === null ? 'POST_FYE_DEFAULT' : 'SHART_SCHEDULE',
  );
  // ⚠ the marker travels with the run exactly when the window figure is flagged unverified.
  expect(timing.unverifiedNote === null).toBe(!input.deadline.unverified);
  // OVERDUE flags the run for the compliance dashboard; it never blocks the computation.
  expect(result.lines.length >= 0).toBe(true);
}

/** Σ of the 6-dp display percentages, ×10⁶ as an integer so the comparison itself is exact. */
function sharePercentSumScaled(result: DistributionResult): bigint {
  return result.lines.reduce((running, line) => {
    const [whole = '0', fraction = '0'] = line.sharePercent.split('.');
    return running + BigInt(whole + fraction);
  }, 0n);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P1 · Conservation and leakage — the E6 exit clause (10 000 cases)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P1 — waterfall conserves value and corpus never leaks (E6 exit clause, G-9 clause 1)', () => {
  it(
    `finds no leakage over ${String(RUNS_LEAKAGE)} generated cases`,
    () => {
      const stats = {
        succeeded: 0,
        refusedNegative: 0,
        withCapitalReceipts: 0,
        nilRuns: 0,
        directUse: 0,
        noEligibleCohort: 0,
        feeSilent: 0,
        feePercentOfRevenue: 0,
        feePercentOfNetIncome: 0,
        feeRetainer: 0,
        reserveFixed: 0,
        reservePercent: 0,
        reserveTargetTopup: 0,
        reserveNone: 0,
        overdue: 0,
        boundByHijri: 0,
        earlierOfBoundByHijri: 0,
        earlierOfBoundByGregorian: 0,
        withheldSomething: 0,
        crossBorderSomething: 0,
        retainedSomething: 0,
        residualNonZero: 0,
        sharePercentSumNot100: 0,
        // ADR-0009 coverage. Each is asserted below, because the lineage path is now the product's
        // NORMAL deed shape: a generator that quietly stopped producing multi-generation trees, or
        // stopped producing buṭūn exclusions, would leave the rule that decides who is paid untested
        // while every assertion above stayed green.
        orderLineage: 0,
        orderOrdered: 0,
        orderShared: 0,
        continuationZuhurOnly: 0,
        continuationZuhurAndButun: 0,
        lineageDepthAtLeast2: 0,
        lineageDepthAtLeast3: 0,
        butunExcluded: 0,
        weightsNotAppliedFlag: 0,
        continuationNotAppliedFlag: 0,
        perCapitaChecked: 0,
      };

      fc.assert(
        fc.property(arbDistributionInput(), (input) => {
          stats[`reserve${maintenanceLabel(input.maintenance)}`] += 1;
          stats[feeLabel(input.nazirFee)] += 1;
          if (input.entitlementOrder === 'LINEAGE_CONTINUATION') stats.orderLineage += 1;
          if (input.entitlementOrder === 'ORDERED') stats.orderOrdered += 1;
          if (input.entitlementOrder === 'SHARED') stats.orderShared += 1;
          if (input.continuationStipulation === 'ZUHUR_ONLY') stats.continuationZuhurOnly += 1;
          if (input.continuationStipulation === 'ZUHUR_AND_BUTUN') {
            stats.continuationZuhurAndButun += 1;
          }
          const depth = maxLineageDepth(input.beneficiaries);
          if (depth >= 2) stats.lineageDepthAtLeast2 += 1;
          if (depth >= 3) stats.lineageDepthAtLeast3 += 1;
          if (input.revenue.receipts.some((receipt) => receipt.receiptClass === 'CAPITAL')) {
            stats.withCapitalReceipts += 1;
          }

          const outcome = runOutcome(input);

          if (!outcome.ok) {
            // The ONLY refusal a well-formed input may produce. Every cross-field coupling is
            // satisfied by construction (see `arbitraries.ts`), so a SHART_INCOMPLETE or an
            // INPUT_INVALID here would mean the generator — not the engine — is wrong, and it must
            // fail rather than be tolerated by a permissive code set.
            expect(outcome.code).toBe('DISTRIBUTION_NEGATIVE');
            stats.refusedNegative += 1;

            // I4, the fail-fast half: the refusal must be predictable from the input alone, so a run
            // that throws when it should have computed (or vice versa) fails here.
            const revenue = sumReceipts(input.revenue, 'INCOME');
            const reserve = expectedReserveMinor(revenue, input.maintenance);
            const netIncome = revenue - reserve - input.operatingCostMinor;
            const fee =
              netIncome < 0n ? 0n : expectedNazirFee(revenue, netIncome, input.nazirFee).minor;
            expect(netIncome < 0n || netIncome - fee < 0n).toBe(true);
            return;
          }

          stats.succeeded += 1;
          const { result } = outcome;

          assertConservation(input, result);
          assertShapeAndOrdering(input, result);

          if (result.flags.includes('NIL_DISTRIBUTION')) stats.nilRuns += 1;
          if (result.flags.includes('NA_DIRECT_USE')) stats.directUse += 1;
          if (result.flags.includes('NO_ELIGIBLE_BENEFICIARIES')) stats.noEligibleCohort += 1;
          if (result.timing.status === 'OVERDUE') stats.overdue += 1;
          if (result.timing.boundBy === 'HIJRI') stats.boundByHijri += 1;
          if (result.timing.bindingCalendar === 'EARLIER_OF') {
            if (result.timing.boundBy === 'HIJRI') stats.earlierOfBoundByHijri += 1;
            else stats.earlierOfBoundByGregorian += 1;
          }
          if ((result.totals.withheldMinor as bigint) > 0n) stats.withheldSomething += 1;
          if ((result.totals.crossBorderMinor as bigint) > 0n) stats.crossBorderSomething += 1;
          if ((result.totals.retainedMinor as bigint) > 0n) stats.retainedSomething += 1;
          if ((result.totals.residualMinor as bigint) > 0n) stats.residualNonZero += 1;
          if (result.lines.length > 0 && sharePercentSumScaled(result) !== 100_000_000n) {
            stats.sharePercentSumNot100 += 1;
          }
          if (result.lines.some((line) => line.reasonCode === 'BUTUN_LINE_NOT_CONTINUED')) {
            stats.butunExcluded += 1;
          }
          if (result.flags.includes('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA')) {
            stats.weightsNotAppliedFlag += 1;
          }
          if (result.flags.includes('CONTINUATION_STIPULATION_NOT_APPLIED')) {
            stats.continuationNotAppliedFlag += 1;
          }
          if (result.invariantsChecked.includes('I-L1')) stats.perCapitaChecked += 1;
        }),
        config(RUNS_LEAKAGE),
      );

      /* ── Coverage assertions ────────────────────────────────────────────────────────────────
       * With a pinned seed these counts are DETERMINISTIC, so they are safe to assert. They exist
       * because a green property proves nothing about a generator that stopped producing the
       * interesting shapes: a suite that only ever met nil-revenue inputs would still pass every
       * assertion above. Thresholds are set well below the observed values so a legitimate widening
       * of the generators does not require editing them.
       * ────────────────────────────────────────────────────────────────────────────────────── */
      expect(stats.succeeded).toBeGreaterThan(3_000);
      expect(stats.refusedNegative).toBeGreaterThan(300);
      expect(stats.withCapitalReceipts).toBeGreaterThan(1_000);
      expect(stats.nilRuns).toBeGreaterThan(50);
      expect(stats.directUse).toBeGreaterThan(100);
      expect(stats.noEligibleCohort).toBeGreaterThan(50);
      expect(stats.retainedSomething).toBeGreaterThan(50);

      // All four ṣiyāna rule kinds and all four fee states (three bases + deed silent).
      expect(stats.reserveFixed).toBeGreaterThan(500);
      expect(stats.reservePercent).toBeGreaterThan(500);
      expect(stats.reserveTargetTopup).toBeGreaterThan(500);
      expect(stats.reserveNone).toBeGreaterThan(500);
      expect(stats.feePercentOfRevenue).toBeGreaterThan(500);
      expect(stats.feePercentOfNetIncome).toBeGreaterThan(500);
      expect(stats.feeRetainer).toBeGreaterThan(500);
      expect(stats.feeSilent).toBeGreaterThan(500);

      // Both timing branches, so decision D2's `EARLIER_OF` is genuinely exercised in both directions.
      // The two `earlierOf*` counters matter more than the raw `boundByHijri` one: the `HIJRI`
      // SELECTOR trivially yields `boundBy: 'HIJRI'`, so a build that collapsed `EARLIER_OF` into
      // `GREGORIAN` would keep `boundByHijri` high. These two prove the selector actually chose.
      expect(stats.overdue).toBeGreaterThan(100);
      expect(stats.boundByHijri).toBeGreaterThan(100);
      expect(stats.earlierOfBoundByHijri).toBeGreaterThan(50);
      expect(stats.earlierOfBoundByGregorian).toBeGreaterThan(50);

      // Gate outcomes other than PAID, and a non-zero Hamilton residual.
      expect(stats.withheldSomething).toBeGreaterThan(100);
      expect(stats.crossBorderSomething).toBeGreaterThan(50);
      expect(stats.residualNonZero).toBeGreaterThan(50);

      // The INVERTED assertion (see the header): `Σ sharePercent` does NOT generally equal
      // 100.000000, and this suite must never come to depend on it doing so.
      expect(stats.sharePercentSumNot100).toBeGreaterThan(50);

      /* ── ADR-0009 coverage ──────────────────────────────────────────────────────────────────
       * All four orders reached, both continuation values reached, and — the two that matter most —
       * the generator really produces MULTI-GENERATION trees and really produces buṭūn exclusions.
       * A generator drifting to all-roots or to all-sons would leave the ancestor walk and the ẓuhūr
       * filter entirely untested with the whole suite still green, which is the failure mode these
       * counters exist for.
       * ──────────────────────────────────────────────────────────────────────────────────────── */
      expect(stats.orderLineage).toBeGreaterThan(1_000);
      expect(stats.orderOrdered).toBeGreaterThan(1_000);
      expect(stats.orderShared).toBeGreaterThan(1_000);
      expect(stats.continuationZuhurOnly).toBeGreaterThan(500);
      expect(stats.continuationZuhurAndButun).toBeGreaterThan(500);
      expect(stats.lineageDepthAtLeast2).toBeGreaterThan(2_000);
      expect(stats.lineageDepthAtLeast3).toBeGreaterThan(1_000);
      expect(stats.butunExcluded).toBeGreaterThan(200);
      expect(stats.perCapitaChecked).toBeGreaterThan(300);
      // Both honesty flags reached: a recorded Shart figure per capita did not apply, and a recorded
      // continuation term an ORDERED/SHARED deed did not consume.
      expect(stats.weightsNotAppliedFlag).toBeGreaterThan(200);
      expect(stats.continuationNotAppliedFlag).toBeGreaterThan(200);
    },
    TIMEOUT_LEAKAGE_MS,
  );
});

function maintenanceLabel(rule: RawMaintenance): 'Fixed' | 'Percent' | 'TargetTopup' | 'None' {
  switch (rule.kind) {
    case 'FIXED':
      return 'Fixed';
    case 'PERCENT':
      return 'Percent';
    case 'TARGET_TOPUP':
      return 'TargetTopup';
    default:
      return 'None';
  }
}

function feeLabel(
  fee: RawNazirFee,
): 'feeSilent' | 'feePercentOfRevenue' | 'feePercentOfNetIncome' | 'feeRetainer' {
  if (fee === null || fee === undefined) return 'feeSilent';
  switch (fee.basis) {
    case 'PERCENT_OF_REVENUE':
      return 'feePercentOfRevenue';
    case 'PERCENT_OF_NET_INCOME':
      return 'feePercentOfNetIncome';
    default:
      return 'feeRetainer';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P2 · Non-negativity — a negative pool ALWAYS refuses, and no partial run escapes (I4)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P2 — no negative figure ever escapes; a negative distributable always throws (I4)', () => {
  it('refuses exactly when the independently-computed waterfall would go negative', () => {
    const stats = { threw: 0, computed: 0 };

    fc.assert(
      fc.property(arbDistributionInput(), (input) => {
        const revenue = sumReceipts(input.revenue, 'INCOME');
        const reserve = expectedReserveMinor(revenue, input.maintenance);
        const netIncome = revenue - reserve - input.operatingCostMinor;
        const shouldThrowOnNet = netIncome < 0n;
        const fee = shouldThrowOnNet
          ? 0n
          : expectedNazirFee(revenue, netIncome, input.nazirFee).minor;
        const shouldThrow = shouldThrowOnNet || netIncome - fee < 0n;

        const outcome = runOutcome(input);

        if (shouldThrow) {
          stats.threw += 1;
          expect(outcome.ok, 'a negative waterfall must produce NO result object at all').toBe(
            false,
          );
          if (!outcome.ok) expect(outcome.code).toBe('DISTRIBUTION_NEGATIVE');
          return;
        }

        stats.computed += 1;
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
          // The fee is never computed on a negative base: a negative base would yield a negative
          // fee, i.e. a CREDIT that inflates distributable while every conservation check still
          // balances. Asserted positively rather than left to the throw above.
          expect((outcome.result.waterfall.netIncomeMinor as bigint) >= 0n).toBe(true);
          expect(outcome.result.waterfall.nazirFeeMinor as bigint).toBe(fee);
        }
      }),
      config(RUNS_NEGATIVE),
    );

    // Both sides of the refusal must be exercised, or this property is proving one branch only.
    expect(stats.threw).toBeGreaterThan(50);
    expect(stats.computed).toBeGreaterThan(300);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P3 · Ordered monotonicity (I5, G-9 clause 3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P3 — ORDERED: a living senior ṭabaqa never increases a junior tier’s entitlement (I5)', () => {
  it('excludes every junior tiered member when ṭabaqa 1 comes alive, and never raises one', () => {
    const stats = { pairs: 0, untieredSubjects: 0, juniorAmountsDropped: 0 };

    fc.assert(
      fc.property(
        arbLiveRunInput(arbTieredCohort, 'ORDERED'),
        arbNonZeroWeight,
        (base, newcomerWeight) => {
          const before = runOutcome(base);
          expect(before.ok, 'arbLiveRunInput must always reach Stage 5').toBe(true);
          if (!before.ok) return;

          // The newcomer is at ṭabaqa 1; every generated tiered member sits at 2 … 5.
          const after = runOutcome(withSeniorTabaqaMember(base, newcomerWeight));
          expect(after.ok).toBe(true);
          if (!after.ok) return;

          stats.pairs += 1;
          assertConservation(base, before.result);
          assertConservation(withSeniorTabaqaMember(base, newcomerWeight), after.result);

          // The pool itself is untouched: adding a beneficiary changes the SPLIT, never the waterfall.
          expect(after.result.waterfall).toStrictEqual(before.result.waterfall);

          const beforeById = new Map(
            before.result.lines.map((line) => [line.beneficiaryId, line] as const),
          );

          for (const member of base.beneficiaries) {
            const lineAfter = after.result.lines.find((line) => line.beneficiaryId === member.id);
            const lineBefore = beforeById.get(member.id);
            expect(lineAfter).toBeDefined();
            expect(lineBefore).toBeDefined();
            if (lineAfter === undefined || lineBefore === undefined) continue;

            if (member.tabaqa === null) {
              // An untiered member is never tier-excluded — kept as an assertion, but see the
              // coverage note below: after ESC-1 this branch has no subject and the counter must
              // read ZERO. It is asserted, not deleted, so that if a future change makes the shape
              // representable again the claim is already in place rather than needing to be
              // remembered.
              expect(lineAfter.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
              expect(lineAfter.reasonCode).not.toBe('TABAQA_EXTINCT');
              stats.untieredSubjects += 1;
              continue;
            }

            // Monotonicity: a junior tier can only be driven to zero, never raised. Holds for EVERY
            // member of the cohort, including the ṭabaqa-1 root — adding a senior head can take a
            // share away and can never hand one out.
            expect(
              (lineAfter.entitledMinor as bigint) <= (lineBefore.entitledMinor as bigint),
            ).toBe(true);
            expect(lineAfter.status).toBe('EXCLUDED');
            expect(lineAfter.entitledMinor as bigint).toBe(0n);

            if (member.tabaqa === 1) {
              /*
               * ⚠ The generated cohort ALREADY HAS a ṭabaqa-1 member — its extinct root — and after
               * R6 it must (a ṭabaqa-4 member needs three ancestors on file). The newcomer joins that
               * SAME tier and revives it, so ṭabaqa 1 becomes the entitled tier and the root is no
               * longer excluded for being in an extinct generation: it is excluded for its own vital
               * status, which is `orderedExclusionReason`'s rung 3 and the correct statement to make
               * about it. The property used to demand `UPPER_TABAQA_EXTANT` from every tiered member
               * indiscriminately and went red here for exactly that reason. The claim it is really
               * about — a JUNIOR tier is driven to zero — is asserted on ṭabaqa ≥ 2 below.
               */
              expect(lineAfter.reasonCode).toBe('BENEFICIARY_INACTIVE');
              continue;
            }

            // With ṭabaqa 1 living, every ṭabaqa ≥ 2 member is excluded with the code that says WHY
            // — an upper tier still lives — regardless of its own `active` status.
            expect(lineAfter.reasonCode).toBe('UPPER_TABAQA_EXTANT');
            if ((lineBefore.entitledMinor as bigint) > 0n) stats.juniorAmountsDropped += 1;
          }
        },
      ),
      config(RUNS_PAIRED),
    );

    expect(stats.pairs).toBeGreaterThan(200);
    // If no junior amount ever actually DROPPED, the property was vacuous.
    expect(stats.juniorAmountsDropped).toBeGreaterThan(100);
    /*
     * ⚠ **THIS COUNTER USED TO BE ASSERTED `> 50` AND IS NOW ASSERTED `=== 0`. THAT IS A FINDING, NOT
     * A RELAXATION.** The old assertion needed a cohort holding a tiered member and an untiered one at
     * the same time. After ESC-1 no such cohort existed: on a ذري waqf every FAMILY/CATEGORY_ONLY
     * member must carry a lineage edge (R6) and an edge forces a derived ṭabaqa, so everyone is
     * tiered; on a خيري waqf only jihas may be recorded and a jiha may not carry a ṭabaqa (S3-D3), so
     * nobody is.
     *
     * ⚠⚠ **R7 · THE CLAIM THAT USED TO STAND HERE IS NARROWED, AND THE OLD WORDING IS KEPT AS THE
     * RECORD.** It read: *"The escape S3-D1 exploited — an untiered member sliding past the ṭabaqa
     * contest and taking the pool — is therefore **structurally unrepresentable**, which is strictly
     * stronger than the property that used to chase it."*
     *
     * A tiered bloodline plus an UNTIERED recorded ultimate taker is legal on a ذري waqf since R7, so
     * the shape is representable again and calling it unrepresentable would be a comment asserting a
     * property the code lacks. **The exact-zero assertion stays, and its subject changes**: it is now a
     * statement about THIS generator (`arbTieredCohort` mints no jiha, deliberately — a taker would
     * make every draw of the ORDERED monotonicity pair a reversion run) rather than about the engine.
     * The reachable subject is driven by P13's R7-f property, where the taker's DEFAULT EXCLUSION — not
     * its absence — is what keeps the S3-D1 outcome closed. A change that makes THIS generator produce
     * an untiered subject still fails here, loudly, which is what the counter is for.
     */
    expect(stats.untieredSubjects).toBe(0);
  });

  /**
   * The other half of the finding above, stated as refusals rather than as an absent counter.
   *
   * A property that only counts zero is satisfiable by a generator that stopped generating. This one
   * builds the shape **deliberately, both ways round**, and requires the engine to refuse each — which
   * is what makes "unrepresentable" a claim about the engine rather than about `arbitraries.ts`.
   */
  it('cannot even build a cohort holding a tiered and an untiered member — both ways refuse', () => {
    const stats = { dhurri: 0, khayri: 0 };

    fc.assert(
      fc.property(arbLiveRunInput(arbTieredCohort, 'ORDERED'), arbNonZeroWeight, (base, weight) => {
        const tiered = base.beneficiaries[0];
        if (tiered === undefined) return;

        // ذري: a tiered family tree plus one member the engine cannot place at all.
        const onDhurri = runOutcome({
          ...base,
          waqfType: 'FAMILY_DHURRI',
          beneficiaries: [
            ...base.beneficiaries,
            {
              ...tiered,
              id: 'zz-untiered',
              kind: 'FAMILY',
              active: true,
              tabaqa: null,
              parentId: null,
              lineageLink: null,
              stipulatedWeight: weight,
            },
          ],
        });
        expect(onDhurri.ok).toBe(false);
        if (!onDhurri.ok) {
          expect(onDhurri.code).toBe('SHART_INCOMPLETE');
          expect(onDhurri.refusal).toBe('LINEAGE_LINK_MISSING');
          stats.dhurri += 1;
        }

        // خيري: an untiered jiha plus one tiered placeholder — the mirror, refused before the tier
        // contest is ever reached.
        //
        // ⚠ INVERTED (2026-08-03). MEASURED BEFORE: `DESCENDANT_ON_CHARITABLE_WAQF` (ESC-1), keyed on
        // the placeholder's `lineageLink`. MEASURED AFTER: `TABAQA_ON_CHARITABLE_WAQF`, keyed on its
        // `tabaqa: 1` and checked first — a وقف خيري has no generations, so no beneficiary of one may
        // sit in a ṭabaqa. The input is unchanged and the property it proves is unchanged: the
        // tiered/untiered cohort this whole block is about cannot be built on either waqf type.
        const onKhayri = runOutcome({
          ...base,
          waqfType: 'PUBLIC_CHARITABLE',
          beneficiaries: [
            {
              ...tiered,
              id: 'zz-jiha',
              kind: 'CHARITABLE_JIHA',
              active: true,
              tabaqa: null,
              parentId: null,
              lineageLink: null,
              line: 'NA',
              stipulatedWeight: weight,
            },
            {
              ...tiered,
              id: 'zz-placeholder',
              kind: 'CATEGORY_ONLY',
              active: true,
              tabaqa: 1,
              parentId: null,
              lineageLink: 'SON',
              stipulatedWeight: weight,
            },
          ],
        });
        expect(onKhayri.ok).toBe(false);
        if (!onKhayri.ok) {
          expect(onKhayri.code).toBe('SHART_INCOMPLETE');
          expect(onKhayri.refusal).toBe('TABAQA_ON_CHARITABLE_WAQF');
          stats.khayri += 1;
        }
      }),
      config(RUNS_SMALL),
    );

    expect(stats.dhurri).toBeGreaterThan(200);
    expect(stats.khayri).toBeGreaterThan(200);
  });

  it('SHARED is the contrast case: the same tier shape excludes nobody for being junior', () => {
    fc.assert(
      fc.property(arbLiveRunInput(arbTieredCohort, 'SHARED'), (input) => {
        const outcome = runOutcome(input);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        // Tashrik has no tier test at all. A resolver that ignored `entitlementOrder` would pass
        // the ORDERED property above and fail here — which is the whole point of the pair.
        for (const line of outcome.result.lines) {
          expect(line.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
          expect(line.reasonCode).not.toBe('TABAQA_EXTINCT');
        }
        expect(outcome.result.entitlementRule).toBe('SHARED_ALL_LIVING_TABAQAT');
        assertConservation(input, outcome.result);
      }),
      config(RUNS_PAIRED),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P4 · Withhold isolation (I6)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P4 — a gate stamps a status and never moves a halala (I6)', () => {
  it('leaves EVERY line’s entitledMinor unchanged when one beneficiary’s gate inputs are replaced', () => {
    const stats = { pairs: 0, statusChanged: 0, noticesChanged: 0 };

    fc.assert(
      fc.property(
        arbLiveRunInput(arbEntitledCohort(2, 8), 'SHARED'),
        fc.nat(),
        arbGateFields,
        (base, indexSeed, patch) => {
          const index = indexSeed % base.beneficiaries.length;
          const target = base.beneficiaries[index];
          expect(target).toBeDefined();
          if (target === undefined) return;

          const before = runOutcome(base);
          const after = runOutcome(withGateFieldsReplaced(base, index, patch));
          expect(before.ok).toBe(true);
          expect(after.ok).toBe(true);
          if (!before.ok || !after.ok) return;

          stats.pairs += 1;

          // The waterfall and the whole entitlement roll-up are untouched: payability is orthogonal
          // to the split. `gates.ts` has no `Minor` in any signature, which is the STRUCTURAL half
          // of I6; this is the empirical half.
          expect(after.result.waterfall).toStrictEqual(before.result.waterfall);
          expect(after.result.totals.entitledMinor).toBe(before.result.totals.entitledMinor);
          expect(after.result.totals.retainedMinor).toBe(before.result.totals.retainedMinor);
          expect(after.result.totals.residualMinor).toBe(before.result.totals.residualMinor);
          expect(after.result.totals.entitledLineCount).toBe(
            before.result.totals.entitledLineCount,
          );

          const beforeById = new Map(
            before.result.lines.map((line) => [line.beneficiaryId, line] as const),
          );
          for (const line of after.result.lines) {
            const previous = beforeById.get(line.beneficiaryId);
            expect(previous).toBeDefined();
            if (previous === undefined) continue;

            // EVERY line, including the mutated one: a gate changes no amount at all.
            expect(line.entitledMinor).toBe(previous.entitledMinor);
            expect(line.sharePercent).toBe(previous.sharePercent);
            expect(line.basis).toStrictEqual(previous.basis);

            if (line.beneficiaryId === target.id) {
              if (line.status !== previous.status) stats.statusChanged += 1;
            } else {
              // Gates are per-beneficiary: no OTHER line's payability may move either.
              expect(line.status).toBe(previous.status);
              expect(line.reasonCode).toBe(previous.reasonCode);
              expect(line.gateFlags).toStrictEqual(previous.gateFlags);
            }
          }

          if (after.result.authorityNotices.length !== before.result.authorityNotices.length) {
            stats.noticesChanged += 1;
          }
          assertConservation(withGateFieldsReplaced(base, index, patch), after.result);
        },
      ),
      config(RUNS_PAIRED),
    );

    expect(stats.pairs).toBeGreaterThan(200);
    // If the mutation never changed a status, the property never tested a gate flip. The observed
    // figure is ~33 of 500 pairs: replacing five gate fields with a fresh draw lands on the same
    // verdict most of the time, because most draws trip SOME gate and precedence collapses them.
    expect(stats.statusChanged).toBeGreaterThan(20);
    // And a cross-border notice must appear/disappear sometimes, so the notice path is covered.
    expect(stats.noticesChanged).toBeGreaterThan(10);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P5 · Residual soundness (I2, I9, G-9 clause 2)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P5 — the split sums exactly and the residual is bounded, for ALL weight vectors (I9)', () => {
  it('agrees halala-for-halala with an independent bigint Hamilton, tie-break included', () => {
    const stats = { vectors: 0, residualNonZero: 0, withZeroWeights: 0, tiedTopRemainders: 0 };

    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX_MINOR }),
        fc.array(arbWeight, { minLength: 1, maxLength: 40 }),
        (totalMinor, weights) => {
          const nonZero = weights.filter((weight) => !/^0+(?:\.0+)?$/.test(weight));
          if (nonZero.length === 0) {
            // An all-zero vector has no basis on which to split; the money engine refuses it, and
            // the resolver is what keeps such a cohort away from here (ZERO_STIPULATED_WEIGHT).
            expect(() =>
              allocateMinor(minorOf(totalMinor), weights, 'LARGEST_REMAINDER_HALF_UP'),
            ).toThrow(/weights sum to zero/);
            return;
          }

          const allocation = allocateMinor(
            minorOf(totalMinor),
            weights,
            'LARGEST_REMAINDER_HALF_UP',
          );
          const expected = independentHamilton(totalMinor, weights);
          stats.vectors += 1;

          expect(allocation.amountsMinor.map((amount) => amount as bigint)).toStrictEqual([
            ...expected.amounts,
          ]);
          expect([...allocation.floorsMinor]).toStrictEqual([...expected.floors]);
          expect(allocation.residualMinor).toBe(expected.residual);

          // Σ is exact — no leftover, no overspend.
          const allocated = allocation.amountsMinor.reduce<bigint>(
            (running, amount) => running + (amount as bigint),
            0n,
          );
          expect(allocated).toBe(totalMinor);

          // I9's bound, stated against the NON-ZERO line count — strictly tighter than the
          // engine's own `weights.length` form, because a zero-weight line is never handed a
          // leftover halala.
          expect(allocation.residualMinor >= 0n).toBe(true);
          expect(allocation.residualMinor < BigInt(nonZero.length)).toBe(true);

          for (const [index, amount] of allocation.amountsMinor.entries()) {
            const floor = allocation.floorsMinor[index] ?? -1n;
            expect((amount as bigint) === floor || (amount as bigint) === floor + 1n).toBe(true);
            if (/^0+(?:\.0+)?$/.test(weights[index] ?? '')) {
              expect(amount as bigint).toBe(0n);
              stats.withZeroWeights += 1;
            }
          }

          if (allocation.residualMinor > 0n) stats.residualNonZero += 1;
          if (
            expected.remainders.filter((remainder) => remainder === (expected.remainders[0] ?? 0n))
              .length > 1
          ) {
            stats.tiedTopRemainders += 1;
          }
        },
      ),
      config(RUNS_ALLOCATE),
    );

    expect(stats.vectors).toBeGreaterThan(1_000);
    expect(stats.residualNonZero).toBeGreaterThan(100);
    expect(stats.withZeroWeights).toBeGreaterThan(50);
    expect(stats.tiedTopRemainders).toBeGreaterThan(100);
  });

  it('breaks an all-equal-remainder tie by ASCENDING index, for every pool remainder', () => {
    // All-equal weights are the worst case for ties: every remainder is identical, so the tie-break
    // alone decides who gets the extra halala. §08 specifies ascending `beneficiaryId`, and the
    // engine feeds the cohort in that order — so ascending index must be what wins.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.bigInt({ min: 0n, max: 10n ** 9n }),
        (lineCount, quotient) => {
          const count = BigInt(lineCount);
          for (let remainder = 0n; remainder < count; remainder += 1n) {
            const total = quotient * count + remainder;
            const allocation = allocateMinor(
              minorOf(total),
              Array.from({ length: lineCount }, () => '1'),
              'LARGEST_REMAINDER_HALF_UP',
            );
            expect(allocation.residualMinor).toBe(remainder);
            for (let index = 0; index < lineCount; index += 1) {
              const amount = allocation.amountsMinor[index] as bigint | undefined;
              const expectedAmount = BigInt(index) < remainder ? quotient + 1n : quotient;
              expect(amount).toBe(expectedAmount);
            }
          }
        },
      ),
      config(RUNS_SMALL),
    );
  });

  it('holds on the adversarial vectors a random draw is unlikely to produce', () => {
    const total = 10n ** 12n + 7n;
    const cases: readonly { readonly label: string; readonly weights: readonly string[] }[] = [
      { label: 'single line takes everything', weights: ['1'] },
      { label: 'one dominant weight', weights: ['1000000', '0.000001', '0.000001'] },
      { label: 'many tiny equal weights', weights: Array.from({ length: 200 }, () => '0.001') },
      {
        label: 'full 18-dp precision at both magnitude extremes',
        weights: ['0.000000000000000001', '999999999999.999999999999999999', '1'],
      },
      { label: 'zero weights interleaved', weights: ['0', '1', '0', '1', '0.0', '2'] },
      {
        label: 'hundreds of lines, mixed magnitudes',
        weights: Array.from({ length: 300 }, (_unused, index) => String((index % 7) + 1)),
      },
    ];

    for (const { label, weights } of cases) {
      const allocation = allocateMinor(minorOf(total), weights, 'LARGEST_REMAINDER_HALF_UP');
      const expected = independentHamilton(total, weights);
      expect(
        allocation.amountsMinor.map((amount) => amount as bigint),
        label,
      ).toStrictEqual([...expected.amounts]);
      const sum = allocation.amountsMinor.reduce<bigint>(
        (running, amount) => running + (amount as bigint),
        0n,
      );
      expect(sum, label).toBe(total);
      const nonZero = weights.filter((weight) => !/^0+(?:\.0+)?$/.test(weight)).length;
      expect(allocation.residualMinor < BigInt(nonZero), label).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P5b · The normalisation denominator (G-9 clause 3's decisive check)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P5b — the split normalises over the ENTITLED cohort only (G-9 clause 3)', () => {
  it('matches an independent Hamilton over the entitled members’ DEED weights, ORDERED', () => {
    // This is the check that catches an implementation which "excludes" a member by zeroing its
    // amount while leaving its weight in the divisor: the amounts would still sum to distributable
    // and every conservation identity would still hold, but each surviving member would be short.
    // Worked example A is the concrete case — ben-001 and ben-003 must get 50% each, not 33.3%.
    const stats = { runs: 0, withExclusions: 0 };

    fc.assert(
      fc.property(arbLiveRunInput(arbTieredCohort, 'ORDERED'), (input) => {
        const outcome = runOutcome(input);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { result } = outcome;

        const deedWeightById = new Map(
          input.beneficiaries.map((member) => [member.id, member.stipulatedWeight] as const),
        );
        const entitledLines = result.lines.filter((line) => line.status !== 'EXCLUDED');
        if (entitledLines.length === 0) return;

        stats.runs += 1;
        if (entitledLines.length < result.lines.length) stats.withExclusions += 1;

        const weights = entitledLines.map((line) => deedWeightById.get(line.beneficiaryId) ?? '');
        for (const weight of weights) expect(weight).not.toBe('');

        const expected = independentHamilton(
          result.waterfall.distributableMinor as bigint,
          weights,
        );
        expect(entitledLines.map((line) => line.entitledMinor as bigint)).toStrictEqual([
          ...expected.amounts,
        ]);
        expect(result.totals.residualMinor as bigint).toBe(expected.residual);
      }),
      config(RUNS_PAIRED),
    );

    expect(stats.runs).toBeGreaterThan(200);
    // Without exclusions this property would only be testing an unfiltered split.
    expect(stats.withExclusions).toBeGreaterThan(100);
  });

  it('an excluded member carries weight ZERO out of the resolver, entitled ones their deed share', () => {
    // `resolver.ts` documents this as a defensive guarantee for E5/S6: "an excluded member
    // contributes 0 to the normalisation denominator, so a consumer that forgets to filter on
    // `entitled` still splits over the right total." The engine itself filters, so removing the
    // zeroing changes no payout today — it survived the first adversarial pass for exactly that
    // reason — but it silently disarms the guarantee the next consumer will rely on.
    const stats = { excluded: 0, entitled: 0 };

    fc.assert(
      fc.property(
        arbDistributionInput({ orders: ['ORDERED', 'SHARED'], orderWeights: [1, 1] }),
        (input) => {
          const resolution = resolveEntitlement(parseDistributionInput(input));
          for (const member of resolution.resolved) {
            if (member.entitled) {
              expect(member.stipulatedWeight).toBe(member.source.stipulatedWeight);
              stats.entitled += 1;
            } else {
              expect(member.stipulatedWeight).toBe('0');
              stats.excluded += 1;
            }
          }
          // `resolved` is ascending by id whatever order the caller supplied the cohort in.
          for (let index = 1; index < resolution.resolved.length; index += 1) {
            const previous = resolution.resolved[index - 1]?.beneficiaryId ?? '';
            const current = resolution.resolved[index]?.beneficiaryId ?? '';
            expect(previous < current).toBe(true);
          }
          expect(resolution.excludedCount + resolution.entitledIds.length).toBe(
            resolution.resolved.length,
          );
        },
      ),
      config(RUNS_SINGLE_RUN),
    );

    expect(stats.excluded).toBeGreaterThan(500);
    expect(stats.entitled).toBeGreaterThan(500);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P6 · Determinism (I8)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P6 — the engine is deterministic and its canonical bytes are stable (I8)', () => {
  it('deep-equals itself on a second run, computationTrace included', () => {
    fc.assert(
      fc.property(arbDistributionInput(), (input) => {
        const first = runOutcome(input);
        const second = runOutcome(input);
        if (!first.ok || !second.ok) {
          expect(second.ok).toBe(first.ok);
          if (!first.ok && !second.ok) {
            expect(second.code).toBe(first.code);
            expect(second.message).toBe(first.message);
          }
          return;
        }
        // `toStrictEqual` and not `toEqual`: an `undefined` where a `null` belongs would serialize
        // differently, and the result is canonicalized and hashed for the Nazir's signature.
        expect(second.result).toStrictEqual(first.result);
      }),
      config(RUNS_SMALL),
    );
  });

  it(`serializes byte-identically over ${String(CANONICAL_REPEATS)} repetitions`, () => {
    fc.assert(
      fc.property(arbLiveRunInput(arbEntitledCohort(1, 6), 'SHARED'), (input) => {
        const outcome = runOutcome(input);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        const baseline = canonicalizeResult(outcome.result);
        expect(baseline.length).toBeGreaterThan(0);
        for (let repetition = 0; repetition < CANONICAL_REPEATS; repetition += 1) {
          const repeat = runOutcome(input);
          expect(repeat.ok).toBe(true);
          if (repeat.ok) expect(canonicalizeResult(repeat.result)).toBe(baseline);
        }
      }),
      // Deliberately few cases: each one is 51 engine runs plus 51 serializations.
      config(20),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P7 · Direct-use nullity (I7 — and the DEFECT-1 prover)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P7 — NA_DIRECT_USE emits no monetary line, whatever the period revenue (I7)', () => {
  it('computes the waterfall, retains the whole distributable, and emits zero lines', () => {
    const stats = { withRevenue: 0, withPositiveRetained: 0, nil: 0 };

    fc.assert(
      fc.property(
        arbDistributionInput({ orders: ['NA_DIRECT_USE'], orderWeights: [1] }),
        (input) => {
          const outcome = runOutcome(input);
          if (!outcome.ok) {
            expect(outcome.code).toBe('DISTRIBUTION_NEGATIVE');
            return;
          }
          const { result } = outcome;

          expect(result.distributionType).toBe('NA_DIRECT_USE');
          expect(result.entitlementRule).toBe('NA_DIRECT_USE');
          expect(result.lines).toStrictEqual([]);
          expect(result.authorityNotices).toStrictEqual([]);
          expect(result.totals.paidMinor as bigint).toBe(0n);
          expect(result.totals.withheldMinor as bigint).toBe(0n);
          expect(result.totals.crossBorderMinor as bigint).toBe(0n);
          expect(result.totals.entitledMinor as bigint).toBe(0n);
          expect(result.totals.entitledLineCount).toBe(0);
          expect(result.totals.residualMinor as bigint).toBe(0n);
          expect(result.flags).toContain('NA_DIRECT_USE');

          // THE DEFECT-1 PROVER. §08's I3 as written (`paid + withheld + crossBorder ==
          // distributable`) is FALSE here whenever the period had revenue: 0 !== distributable. The
          // restated identity holds only because `retainedMinor` exists. The engine only REPORTS the
          // retained value; where it goes is OQ-01 sub-question 2 and is unsigned.
          expect(result.totals.retainedMinor).toBe(result.waterfall.distributableMinor);
          assertConservation(input, result);

          if ((result.waterfall.revenueMinor as bigint) > 0n) stats.withRevenue += 1;
          if ((result.totals.retainedMinor as bigint) > 0n) stats.withPositiveRetained += 1;
          if (result.flags.includes('NIL_DISTRIBUTION')) stats.nil += 1;
        },
      ),
      config(RUNS_SINGLE_RUN),
    );

    // Without a positive-revenue direct-use case this property would never reach the state that
    // makes §08's original I3 false — i.e. it would not be the DEFECT-1 regression test.
    expect(stats.withRevenue).toBeGreaterThan(100);
    expect(stats.withPositiveRetained).toBeGreaterThan(100);
    expect(stats.nil).toBeGreaterThan(20);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P8 · The corpus guard (CLAUDE.md binding rule 1, I-C1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P8 — corpus (asl / أصل) can move no halala of a distribution (I-C1)', () => {
  it('injecting an arbitrary CAPITAL receipt changes only capitalReceiptsMinor and the flag', () => {
    const stats = { pairs: 0, flagNewlyAdded: 0, largeInjection: 0 };

    fc.assert(
      fc.property(
        arbDistributionInput(),
        fc.bigInt({ min: 0n, max: MAX_MINOR }),
        fc.constantFrom(
          'SALE_PROCEEDS' as const,
          'ISTIBDAL_PROCEEDS' as const,
          'EXPROPRIATION_COMPENSATION' as const,
          'OTHER' as const,
        ),
        (base, amountMinor, source) => {
          const before = runOutcome(base);
          const injected = withInjectedCapitalReceipt(base, amountMinor, source);
          const after = runOutcome(injected);

          if (!before.ok) {
            // A corpus receipt cannot rescue a negative waterfall either: the refusal is unchanged.
            expect(after.ok).toBe(false);
            if (!after.ok) expect(after.code).toBe(before.code);
            return;
          }
          expect(after.ok, 'a corpus receipt must never change whether a run succeeds').toBe(true);
          if (!after.ok) return;

          stats.pairs += 1;
          if (amountMinor > MAX_MINOR / 2n) stats.largeInjection += 1;

          const beforeCapital = before.result.waterfall.capitalReceiptsMinor as bigint;
          const afterCapital = after.result.waterfall.capitalReceiptsMinor as bigint;
          expect(afterCapital).toBe(beforeCapital + amountMinor);

          // Every other waterfall figure is byte-identical: istibdal (استبدال), sale and
          // expropriation proceeds are asl and never become ghallah.
          expect({ ...after.result.waterfall, capitalReceiptsMinor: beforeCapital }).toStrictEqual(
            before.result.waterfall,
          );
          expect(after.result.lines).toStrictEqual(before.result.lines);
          expect(after.result.totals).toStrictEqual(before.result.totals);
          expect(after.result.timing).toStrictEqual(before.result.timing);
          expect(after.result.authorityNotices).toStrictEqual(before.result.authorityNotices);
          expect(after.result.invariantsChecked).toStrictEqual(before.result.invariantsChecked);
          expect(after.result.unverifiedNotes).toStrictEqual(before.result.unverifiedNotes);

          // The only permitted flag difference is the corpus-exclusion marker.
          expect(after.result.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
          const withoutMarker = after.result.flags.filter(
            (flag) => flag !== 'CAPITAL_RECEIPTS_EXCLUDED',
          );
          const beforeWithoutMarker = before.result.flags.filter(
            (flag) => flag !== 'CAPITAL_RECEIPTS_EXCLUDED',
          );
          expect(withoutMarker).toStrictEqual(beforeWithoutMarker);
          if (!before.result.flags.includes('CAPITAL_RECEIPTS_EXCLUDED')) stats.flagNewlyAdded += 1;

          assertConservation(injected, after.result);
        },
      ),
      config(RUNS_PAIRED),
    );

    expect(stats.pairs).toBeGreaterThan(150);
    expect(stats.flagNewlyAdded).toBeGreaterThan(30);
    // The injected corpus must sometimes DWARF the income, which is the realistic istibdal shape
    // (§08 Example D: 20 000 000.00 of expropriation compensation against 1 800 000.00 of ghallah).
    expect(stats.largeInjection).toBeGreaterThan(30);
  });

  it('refuses every way a caller can fail to evidence its declared ghallah', () => {
    const seen = new Map<string, number>();

    fc.assert(
      fc.property(arbDistributionInput(), arbRevenueCorruption, (base, corruption) => {
        const corrupted = corruptRevenue(base.revenue, corruption);
        // `null` means the corruption is a no-op on THIS revenue (reclassifying a 0-halala receipt
        // leaves the figures agreeing). Skipping is honest; corrupting something else would not be.
        if (corrupted === null) return;

        const outcome = runOutcome({ ...base, revenue: corrupted.revenue });
        expect(outcome.ok, `expected ${corrupted.expectedCode}`).toBe(false);
        if (!outcome.ok) {
          expect(outcome.code).toBe(corrupted.expectedCode);
          seen.set(corruption.kind, (seen.get(corruption.kind) ?? 0) + 1);
        }
      }),
      config(RUNS_SINGLE_RUN),
    );

    // All six refusal routes must actually be walked, or the guard is only half tested.
    for (const kind of [
      'DROP_ALL_RECEIPTS',
      'OVERSTATE_INCOME',
      'UNDERSTATE_INCOME',
      'RECLASSIFY_INCOME_AS_CAPITAL',
      'UNKNOWN_RECEIPT_CLASS',
      'INCOME_WITH_CAPITAL_SOURCE',
    ] as const) {
      expect(seen.get(kind) ?? 0, `corruption ${kind} was never exercised`).toBeGreaterThan(5);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P9 · Config is never silently ignored (binding rule 3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P9 — an unhonourable Setting is refused, never approximated (binding rule 3)', () => {
  it('refuses ANY rounding granularity other than the halala', () => {
    fc.assert(
      fc.property(
        arbDistributionInput(),
        fc.bigInt({ min: 0n, max: 10n ** 6n }).filter((value) => value !== 1n),
        (base, roundingUnitMinor) => {
          // Refused rather than ignored: a configured 5-halala granularity that this allocator
          // cannot honour must not produce a statement that looks ratified.
          expectRefusal(
            { ...base, policy: { ...base.policy, roundingUnitMinor } },
            'SETTING_INVALID',
          );
        },
      ),
      config(RUNS_SMALL),
    );
  });

  it('refuses LARGEST_REMAINDER_BANKERS rather than falling back to half-up', () => {
    fc.assert(
      fc.property(arbLiveRunInput(arbEntitledCohort(1, 5), 'SHARED'), (base) => {
        // OQ-01 is unresolved: half-even's tie-breaking semantics ARE the open question. A silent
        // fallback would produce a distribution statement indistinguishable from a ratified one.
        expectRefusal(
          { ...base, policy: { ...base.policy, roundingMethod: 'LARGEST_REMAINDER_BANKERS' } },
          'SETTING_INVALID',
        );
      }),
      config(RUNS_SMALL),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P10 · The engine never guesses the Shart (binding rule 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P11 — the LINEAGE entitlement rule (ADR-0009)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Re-derive **R-FRONTIER** from the INPUT, independently of the resolver: the entitled set is the
 * *nearest living point on each line of descent*.
 *
 * The whole value of these properties rests on this walk being a second implementation rather than a
 * paraphrase of the first: it reads `parentId` / `lineageLink` / `active` straight off the generated
 * cohort, walks to the root itself, and never consults the result. If it agreed with the resolver by
 * construction it would be a tautology, which is what the "independent re-derivations" section of this
 * file's header is about.
 *
 * ⚠ **THIS FUNCTION WAS WRONG, AND ITS COMMENT WAS THE WRONG PART.** It used to end with: *"Note what
 * it does NOT do: it never looks at an ancestor's `active`. That is R1 — a generation's death does not
 * block the next — and a test helper that vital-tested ancestors would quietly re-import the tier model
 * the rule replaced."* That reasoning conflated two different claims. A generation's death does not
 * block the next — true, and still true here. But a generation's **survival** does hold the entitlement:
 * the product owner's words are *"son A's child does not get since Son A is alive. Son A's child only
 * gets anything if son A is dead."* The old helper therefore certified every living descendant as
 * entitled and would have ratified an engine that paid three generations of one line simultaneously.
 * A confident comment asserting a property the code did not have is the exact defect class this repo
 * keeps paying for; it is recorded here rather than quietly replaced.
 *
 * The three rungs, in the resolver's own precedence order:
 *
 *  1. the member's OWN `active` — nobody else's;
 *  2. `ZUHUR_ONLY` only: an ancestor **strictly between** them and the waqif who is not a `SON`
 *     (permanent under this deed, and it OUTRANKS rung 3);
 *  3. an ancestor strictly between them and the waqif who is still **living** (temporary — it reverses
 *     on that ancestor's death).
 *
 * Their own `lineageLink` is never read: a line may end in a daughter.
 */
function expectedFrontier(
  input: DistributionInputRaw,
  continuation: 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN',
): ReadonlySet<string> {
  const byId = new Map(input.beneficiaries.map((member) => [member.id, member]));
  const eligible = new Set<string>();

  for (const member of input.beneficiaries) {
    if (!member.active) continue;
    if (member.lineageLink === null) continue;

    let blocked = false;
    let cursor = member.parentId === null ? undefined : byId.get(member.parentId);
    // Bounded by the cohort size: the generator produces acyclic graphs, and a bound rather than a
    // `while (true)` means a generator regression cannot hang the suite.
    for (let step = 0; step <= input.beneficiaries.length && cursor !== undefined; step += 1) {
      // Rung 2 — the daughter-line break, ZUHUR_ONLY only.
      if (continuation === 'ZUHUR_ONLY' && cursor.lineageLink !== 'SON') {
        blocked = true;
        break;
      }
      // Rung 3 — a living ancestor holds this line, under BOTH stipulations.
      if (cursor.active) {
        blocked = true;
        break;
      }
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    if (!blocked) eligible.add(member.id);
  }
  return eligible;
}

/**
 * The exclusion code R-FRONTIER owes each excluded member, re-derived independently.
 *
 * Separate from {@link expectedFrontier} because the SET and the REASON are different claims, and the
 * reason is the one printed on a beneficiary's official Arabic statement (BR-505): telling someone
 * "wait for your father to die" when in fact their line never continues under this Shart is a
 * materially different statement, and rung 2 outranking rung 3 is engineering's call — pinned here so
 * a silent reversal cannot land.
 */
function expectedExclusionReason(
  input: DistributionInputRaw,
  continuation: 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN',
  beneficiaryId: string,
): string | null {
  const byId = new Map(input.beneficiaries.map((member) => [member.id, member]));
  const member = byId.get(beneficiaryId);
  if (member === undefined || member.lineageLink === null) return null;
  if (!member.active) return 'BENEFICIARY_INACTIVE';

  let livingAncestor = false;
  let cursor = member.parentId === null ? undefined : byId.get(member.parentId);
  for (let step = 0; step <= input.beneficiaries.length && cursor !== undefined; step += 1) {
    // Rung 2 wins the moment it is found, wherever rung 3 was found — the walk is nearest-first, but
    // the PRECEDENCE is by rung, not by distance.
    if (continuation === 'ZUHUR_ONLY' && cursor.lineageLink !== 'SON') {
      return 'BUTUN_LINE_NOT_CONTINUED';
    }
    if (cursor.active) livingAncestor = true;
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }
  return livingAncestor ? 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR' : null;
}

describe('P11 — lineage entitlement: per capita, ẓuhūr-filtered, ṭabaqa DERIVED (ADR-0009)', () => {
  it('pays every eligible head an equal share, within one halala (I-L1)', () => {
    const stats = { runs: 0, spreadOne: 0, spreadZero: 0, cohortsOverFive: 0 };

    fc.assert(
      fc.property(
        fc.constantFrom('ZUHUR_ONLY' as const, 'ZUHUR_AND_BUTUN' as const),
        fc.integer({ min: 2, max: 9 }),
        (continuation, maxSize) =>
          fc.assert(
            fc.property(arbLineageRunInput(continuation, { minSize: 2, maxSize }), (input) => {
              const outcome = runOutcome(input);
              // `arbLiveRunInput` guarantees a positive distributable, and the tree is well-formed by
              // construction, so a refusal here means the GENERATOR is wrong — it must fail, not be
              // tolerated.
              expect(outcome.ok, outcome.ok ? '' : `unexpected ${outcome.code}`).toBe(true);
              if (!outcome.ok) return;
              const { result } = outcome;
              stats.runs += 1;
              if (input.beneficiaries.length > 5) stats.cohortsOverFive += 1;

              const entitled = result.lines.filter((line) => line.status !== 'EXCLUDED');
              if (entitled.length === 0) return;
              const amounts = entitled.map((line) => line.entitledMinor as bigint);
              const max = amounts.reduce((a, b) => (b > a ? b : a));
              const min = amounts.reduce((a, b) => (b < a ? b : a));
              expect(max - min <= 1n).toBe(true);
              if (max - min === 1n) stats.spreadOne += 1;
              else stats.spreadZero += 1;

              // And the invariant the engine claims it asserted really is claimed.
              expect(result.invariantsChecked).toContain('I-L1');

              // Every eligible line's amount is the pool divided by the head count, floor or floor+1
              // — the arithmetic statement of "per capita", independent of the allocator.
              const pool = result.waterfall.distributableMinor as bigint;
              const heads = BigInt(entitled.length);
              const floor = pool / heads;
              for (const amount of amounts) {
                expect(amount === floor || amount === floor + 1n).toBe(true);
              }
              expect(amounts.reduce((running, amount) => running + amount, 0n)).toBe(pool);
            }),
            config(RUNS_PAIRED),
          ),
      ),
      // The outer property only picks the two knobs; the inner one does the work. `numRuns: 4` covers
      // both continuations at two cohort ceilings without multiplying the engine calls by 300.
      { numRuns: 4, seed: SEED },
    );

    expect(stats.runs).toBeGreaterThan(1_000);
    expect(stats.cohortsOverFive).toBeGreaterThan(100);
    // Both sides of the bound: a suite that only ever met exact divisions would pass a bound written
    // as `=== 0n`, and a suite that never met one would not know the equal case works.
    expect(stats.spreadOne).toBeGreaterThan(50);
    expect(stats.spreadZero).toBeGreaterThan(50);
  });

  /**
   * **R-FRONTIER (a) and (c), together: the entitled set is EXACTLY the living frontier.**
   *
   * (c) is the equality — every entitled member is at the frontier and every frontier member is
   * entitled — checked against {@link expectedFrontier}, a walk that shares no line of code with the
   * resolver. (a) is the half of it that names the defect the rule was written to close, and it is
   * asserted separately and positively so it cannot be satisfied vacuously: **no beneficiary with a
   * living intermediate ancestor is ever entitled.**
   *
   * Both stipulations, and both exclusion codes with their precedence, in one pass.
   */
  it('entitles EXACTLY the living frontier, and never anyone under a living ancestor', () => {
    const stats = {
      runs: 0,
      someExcluded: 0,
      someEligible: 0,
      deepChains: 0,
      heldByLivingAncestor: 0,
      butunBreak: 0,
      entitledBelowRoot: 0,
      bothFactsApply: 0,
    };

    for (const continuation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
      fc.assert(
        fc.property(
          // MIXED vital status: under R-FRONTIER an all-alive tree entitles only its roots, so an
          // ALL_ALIVE generator would leave the whole substitution half of the rule ungenerated.
          arbLineageRunInput(continuation, { minSize: 2, maxSize: 9, vitalStatus: 'MIXED' }),
          (input) => {
            const outcome = runOutcome(input);
            expect(outcome.ok).toBe(true);
            if (!outcome.ok) return;
            stats.runs += 1;
            if (maxLineageDepth(input.beneficiaries) >= 3) stats.deepChains += 1;

            const chains = ancestorChains(input.beneficiaries);
            const byId = new Map(input.beneficiaries.map((member) => [member.id, member] as const));

            const expected = expectedFrontier(input, continuation);
            const actual = new Set(
              outcome.result.lines
                .filter((line) => line.status !== 'EXCLUDED')
                .map((line) => line.beneficiaryId),
            );
            // (c) — set equality, both directions at once.
            expect([...actual].sort()).toEqual([...expected].sort());

            // (a) — stated positively over the ACTUAL entitled set, so it survives an
            // `expectedFrontier` that drifted in the same direction as the engine.
            for (const id of actual) {
              const chain = chains.get(id) ?? [];
              for (const ancestorId of chain) {
                expect(
                  byId.get(ancestorId)?.active,
                  `${id} is entitled while ancestor ${ancestorId} lives`,
                ).not.toBe(true);
              }
              if (chain.length > 0) stats.entitledBelowRoot += 1;
            }

            if (actual.size < input.beneficiaries.length) stats.someExcluded += 1;
            if (actual.size > 0) stats.someEligible += 1;

            for (const line of outcome.result.lines) {
              if (line.status !== 'EXCLUDED') continue;
              // The code the independent walk says is owed — set AND reason, which are two claims.
              expect(line.reasonCode).toBe(
                expectedExclusionReason(input, continuation, line.beneficiaryId),
              );
              if (line.reasonCode === 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR') {
                stats.heldByLivingAncestor += 1;
              }
              if (line.reasonCode === 'BUTUN_LINE_NOT_CONTINUED') {
                stats.butunBreak += 1;
                // PRECEDENCE, measured on the cases where BOTH facts hold: the permanent reason is
                // the one a beneficiary is told. Counted so the assertion is not vacuous.
                const chain = chains.get(line.beneficiaryId) ?? [];
                if (chain.some((ancestorId) => byId.get(ancestorId)?.active === true)) {
                  stats.bothFactsApply += 1;
                }
              }
              if (continuation === 'ZUHUR_AND_BUTUN') {
                expect(line.reasonCode).not.toBe('BUTUN_LINE_NOT_CONTINUED');
              }
              // Never a TIER reason: ṭabaqa is not the exclusion key on this path (R1).
              expect(line.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
              expect(line.reasonCode).not.toBe('TABAQA_EXTINCT');
              // Nor a zero-weight exclusion: weights are not applied, so they cannot exclude either.
              expect(line.reasonCode).not.toBe('ZERO_STIPULATED_WEIGHT');
            }
          },
        ),
        config(RUNS_PAIRED),
      );
    }

    expect(stats.runs).toBeGreaterThan(800);
    expect(stats.someExcluded).toBeGreaterThan(100);
    expect(stats.someEligible).toBeGreaterThan(500);
    // The ancestor walk is only meaningfully tested on chains longer than parent-only.
    expect(stats.deepChains).toBeGreaterThan(200);
    // R-FRONTIER coverage, asserted rather than assumed. Without the first, "nobody under a living
    // ancestor is entitled" would be satisfiable by a generator that produced no living ancestors at
    // all; without the second, the frontier would never have MOVED off the roots and the whole
    // substitution half of the rule would be untested.
    expect(stats.heldByLivingAncestor).toBeGreaterThan(300);
    expect(stats.entitledBelowRoot).toBeGreaterThan(300);
    expect(stats.butunBreak).toBeGreaterThan(100);
    expect(stats.bothFactsApply).toBeGreaterThan(20);
  });

  it('reports a DERIVED tabaqa that equals the parent-edge depth on every line', () => {
    fc.assert(
      fc.property(arbLineageRunInput('ZUHUR_AND_BUTUN', { minSize: 2, maxSize: 9 }), (input) => {
        const outcome = runOutcome(input);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        const byId = new Map(input.beneficiaries.map((member) => [member.id, member]));
        for (const line of outcome.result.lines) {
          // Depth re-derived here, from the input, without consulting the declared `tabaqa`.
          let depth = 1;
          let cursor = byId.get(line.beneficiaryId);
          for (let step = 0; step <= input.beneficiaries.length; step += 1) {
            const parentId = cursor?.parentId ?? null;
            if (parentId === null) break;
            depth += 1;
            cursor = byId.get(parentId);
          }
          expect(line.basis.lineageDepth).toBe(depth);
          // The two sides agree, and the engine reports the derived one on both fields.
          expect(line.basis.tabaqa).toBe(depth);
          expect(line.basis.parentId).toBe(byId.get(line.beneficiaryId)?.parentId ?? null);
          expect(line.basis.continuationStipulation).toBe('ZUHUR_AND_BUTUN');
        }
      }),
      config(RUNS_SINGLE_RUN),
    );

    // The other half: a supplied `tabaqa` that disagrees HALTS. Without this the property above would
    // pass on an engine that simply echoed whatever the input declared.
    fc.assert(
      fc.property(
        arbLineageRunInput('ZUHUR_AND_BUTUN', { minSize: 2, maxSize: 6 }),
        fc.nat(1_000_000),
        (input, victimPick) => {
          const victimIndex = victimPick % input.beneficiaries.length;
          const outcome = runOutcome({
            ...input,
            beneficiaries: input.beneficiaries.map((member, index) =>
              index === victimIndex ? { ...member, tabaqa: (member.tabaqa ?? 1) + 1 } : member,
            ),
          });
          expect(outcome.ok).toBe(false);
          if (!outcome.ok) {
            expect(outcome.code).toBe('SHART_INCOMPLETE');
            expect(outcome.refusal).toBe('TABAQA_MISMATCHES_LINEAGE_DEPTH');
          }
        },
      ),
      config(RUNS_SMALL),
    );
  });

  /**
   * **R-FRONTIER (b) + per capita, not per stirpes — over generated MULTI-BRANCH trees.**
   *
   * ⚠ **THIS PROPERTY'S HEADLINE CLAIM WAS FALSE AND HAS BEEN REPLACED. IT USED TO READ:** *"A death
   * removes one head, so the pool divides over fewer people and every survivor's share can only RISE."*
   * Under R-FRONTIER a death can also **ADD** heads — the deceased's children step up to the frontier
   * their parent was holding — so the denominator can GROW and every other beneficiary's share can
   * FALL. `stats.someoneFell` counts exactly that and is asserted **positive**: the superseded
   * monotonicity claim is not merely dropped, its falsity is pinned, so nobody can restore it as an
   * "obvious" invariant later.
   *
   * What replaces it, and why each half is load-bearing:
   *
   *  · **(b) containment.** The newly entitled are all **strict descendants of the deceased**, and the
   *    only member to LOSE entitlement is the deceased. A death moves entitlement down that person's
   *    own line and nowhere else.
   *  · **(b) other-branch invariance.** For every line of descent the deceased is not in, the number of
   *    entitled heads is **unchanged**. This is the claim a "recompute the whole tree" implementation
   *    with an off-by-one ancestor walk breaks first, and it is why the generator fixes the branch
   *    count — on a single-line cohort it is vacuously true.
   *  · **per capita.** Every survivor sits on the NEW per-head floor (or one halala above), regardless
   *    of branch. Per stirpes would give each branch a block and split it internally, so members of
   *    different-sized branches would hold different amounts. ADR-0009 R3 records that the owner was
   *    shown this consequence and chose it.
   *
   * The victim is drawn from {@link livingMembersWithIssue} on most runs. A uniform draw is nearly
   * always a leaf or an already-excluded member, whose death changes the entitled set not at all — 500
   * runs of that would assert containment over a no-op and report it as coverage. A minority of runs
   * still take the uniform draw, because a death that changes nothing must also be safe.
   */
  it('a death moves entitlement only DOWN the deceased’s own line, and re-splits per capita', () => {
    const stats = {
      pairs: 0,
      headCountDropped: 0,
      headCountRose: 0,
      someoneRose: 0,
      someoneFell: 0,
      steppedUp: 0,
      multiBranchEntitled: 0,
    };

    for (const continuation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
      fc.assert(
        fc.property(
          arbBranchedLineageRunInput(continuation, { branches: 3, perBranch: 4 }),
          fc.nat(1_000_000),
          fc.oneof(
            { weight: 4, arbitrary: fc.constant(true) },
            { weight: 1, arbitrary: fc.constant(false) },
          ),
          (input, victimPick, preferHolder) => {
            const before = runOutcome(input);
            expect(before.ok).toBe(true);
            if (!before.ok) return;

            const holders = livingMembersWithIssue(input.beneficiaries);
            const pool =
              preferHolder && holders.length > 0
                ? holders
                : input.beneficiaries.map((member) => member.id);
            const victimId = pool[victimPick % pool.length];
            if (victimId === undefined) return;

            const after = runOutcome(withMemberDeceased(input, victimId));
            expect(after.ok).toBe(true);
            if (!after.ok) return;
            stats.pairs += 1;

            const chains = ancestorChains(input.beneficiaries);
            const roots = branchRoots(input.beneficiaries);
            const victimRoot = roots.get(victimId);

            const entitledOf = (result: DistributionResult): ReadonlySet<string> =>
              new Set(
                result.lines
                  .filter((line) => line.status !== 'EXCLUDED')
                  .map((line) => line.beneficiaryId),
              );
            const wasEntitled = entitledOf(before.result);
            const isEntitled = entitledOf(after.result);

            if (isEntitled.size < wasEntitled.size) stats.headCountDropped += 1;
            if (isEntitled.size > wasEntitled.size) stats.headCountRose += 1;
            if (new Set([...isEntitled].map((id) => roots.get(id))).size > 1) {
              stats.multiBranchEntitled += 1;
            }

            // The deceased holds nothing, and is excluded for their OWN vital status.
            const dead = after.result.lines.find((line) => line.beneficiaryId === victimId);
            expect(dead?.status).toBe('EXCLUDED');
            expect(dead?.reasonCode).toBe('BENEFICIARY_INACTIVE');
            expect(dead?.entitledMinor).toBe(0n);

            // (b) — the ONLY member to lose entitlement is the deceased …
            for (const id of wasEntitled) {
              if (isEntitled.has(id)) continue;
              expect(id, 'a death must not un-entitle anyone but the deceased').toBe(victimId);
            }
            // … and everyone who GAINS it is a strict descendant of the deceased.
            for (const id of isEntitled) {
              if (wasEntitled.has(id)) continue;
              stats.steppedUp += 1;
              expect(
                (chains.get(id) ?? []).includes(victimId),
                `${id} became entitled but does not descend from ${victimId}`,
              ).toBe(true);
            }
            // (b) — every OTHER line's head count is untouched.
            const headsPerRoot = (set: ReadonlySet<string>): ReadonlyMap<string, number> => {
              const counts = new Map<string, number>();
              for (const id of set) {
                const root = roots.get(id) ?? id;
                counts.set(root, (counts.get(root) ?? 0) + 1);
              }
              return counts;
            };
            const wasHeads = headsPerRoot(wasEntitled);
            const isHeads = headsPerRoot(isEntitled);
            for (const root of new Set([...roots.values()])) {
              if (root === victimRoot) continue;
              expect(isHeads.get(root) ?? 0, `line ${root} changed head count`).toBe(
                wasHeads.get(root) ?? 0,
              );
            }

            // per capita — every survivor on the NEW floor, whatever branch they sit in.
            const beforeById = new Map(
              before.result.lines.map((line) => [line.beneficiaryId, line.entitledMinor as bigint]),
            );
            const distributable = after.result.waterfall.distributableMinor as bigint;
            const heads = BigInt(isEntitled.size);
            const floor = heads === 0n ? 0n : distributable / heads;
            for (const line of after.result.lines) {
              if (line.status === 'EXCLUDED') continue;
              const now = line.entitledMinor as bigint;
              const then = beforeById.get(line.beneficiaryId) ?? 0n;
              if (now > then) stats.someoneRose += 1;
              if (now < then) stats.someoneFell += 1;
              expect(now === floor || now === floor + 1n).toBe(true);
            }

            // The pool is untouched: a death moves money between people, never out of the waqf.
            expect(before.result.waterfall.distributableMinor).toBe(
              after.result.waterfall.distributableMinor,
            );
            // …and it is fully accounted for either way. A death CAN empty the frontier outright —
            // the last living head on the last continuing line — and then nothing is entitled and the
            // whole pool is retained (§08's `NO_ELIGIBLE_BENEFICIARIES`, a flag and not an error). The
            // two arms are asserted separately rather than folded, so "everyone was excluded" can
            // never satisfy the distributed-in-full claim by arithmetic accident.
            if (heads === 0n) {
              expect(after.result.totals.entitledMinor as bigint).toBe(0n);
              expect(after.result.totals.retainedMinor).toBe(
                after.result.waterfall.distributableMinor,
              );
            } else {
              expect(after.result.totals.entitledMinor).toBe(distributable);
            }
          },
        ),
        config(RUNS_PAIRED),
      );
    }

    expect(stats.pairs).toBeGreaterThan(600);
    // Both directions of the head count. `headCountRose` is the one the superseded property could not
    // produce at all, and it is the whole of the substitution rule.
    expect(stats.headCountDropped).toBeGreaterThan(100);
    expect(stats.headCountRose).toBeGreaterThan(100);
    expect(stats.steppedUp).toBeGreaterThan(100);
    expect(stats.someoneRose).toBeGreaterThan(300);
    // ⚠ The retired claim's falsity, pinned. A survivor's share CAN fall when someone dies, because
    // the deceased's issue step up and dilute the pool. If this ever reads zero, either the generator
    // stopped producing living holders or the engine went back to a model where it cannot happen.
    expect(stats.someoneFell).toBeGreaterThan(50);
    // Other-branch invariance is vacuous unless more than one line actually holds entitled heads.
    expect(stats.multiBranchEntitled).toBeGreaterThan(300);
  });

  it('applies the deed weights on ORDERED/SHARED and NOT on lineage — the flag says which', () => {
    // The R3 honesty obligation, both directions, over generated cohorts.
    fc.assert(
      fc.property(
        arbLineageRunInput('ZUHUR_AND_BUTUN', { minSize: 2, maxSize: 6, weightsEqual: true }),
        (input) => {
          const outcome = runOutcome(input);
          expect(outcome.ok).toBe(true);
          if (!outcome.ok) return;
          // Equal recorded weights ⇒ per capita overrode nothing ⇒ no flag. A flag on every lineage run
          // would tell a reader nothing.
          expect(outcome.result.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
        },
      ),
      config(RUNS_SINGLE_RUN),
    );

    const stats = { flagged: 0, unequal: 0 };
    fc.assert(
      fc.property(arbLineageRunInput('ZUHUR_AND_BUTUN', { minSize: 3, maxSize: 8 }), (input) => {
        const outcome = runOutcome(input);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const eligibleWeights = new Set(
          outcome.result.lines
            .filter((line) => line.status !== 'EXCLUDED')
            .map(
              (line) =>
                input.beneficiaries.find((member) => member.id === line.beneficiaryId)
                  ?.stipulatedWeight ?? '',
            ),
        );
        if (eligibleWeights.size > 1) {
          stats.unequal += 1;
          // Unequal recorded weights ⇒ per capita DID override the deed ⇒ the run must say so.
          expect(outcome.result.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
          stats.flagged += 1;
        }
      }),
      config(RUNS_SINGLE_RUN),
    );
    expect(stats.unequal).toBeGreaterThan(300);
    expect(stats.flagged).toBe(stats.unequal);
  });
});

describe('P10 — an unrecognised entitlement order always halts with SHART_INCOMPLETE', () => {
  it('refuses every string outside the closed vocabulary, near-misses included', () => {
    const stats = { nearMisses: 0, refusals: 0 };

    fc.assert(
      fc.property(
        arbDistributionInput(),
        fc.oneof(
          {
            weight: 3,
            arbitrary: fc.constantFrom(
              '',
              ' ',
              'ordered',
              'Ordered',
              'ORDERED ',
              ' ORDERED',
              'SHARED\n',
              'shared',
              'MURATTAB',
              'na_direct_use',
              'n/a (direct use of the asset)',
              'الأعلى فالأعلى',
            ),
          },
          { weight: 1, arbitrary: fc.string() },
        ),
        (base, order) => {
          if (order === 'ORDERED' || order === 'SHARED' || order === 'NA_DIRECT_USE') return;
          if (order.trim() !== order || order !== order.toUpperCase()) stats.nearMisses += 1;

          // No trimming, no case folding, no aliasing: every such convenience is the engine
          // inferring what the waqif meant. Resolution goes to the condition-interpretation path.
          expectRefusal({ ...base, entitlementOrder: order }, 'SHART_INCOMPLETE');
          stats.refusals += 1;
        },
      ),
      config(RUNS_SMALL),
    );

    expect(stats.refusals).toBeGreaterThan(100);
    expect(stats.nearMisses).toBeGreaterThan(20);
  });

  it('the deed-illegibility verdict outranks the money verdict', () => {
    // The engine narrows the Shart's order in an INPUT-stage pre-flight, BEFORE the waterfall. So an
    // input that is BOTH unreadable and insolvent reports the unreadable deed — not
    // DISTRIBUTION_NEGATIVE about figures that were never going to be used.
    fc.assert(
      fc.property(arbDistributionInput(), (base) => {
        const insolvent: DistributionInputRaw = {
          ...base,
          entitlementOrder: 'MURATTAB',
          maintenance: { kind: 'FIXED', amountMinor: MAX_MINOR },
          operatingCostMinor: MAX_MINOR,
        };
        expectRefusal(insolvent, 'SHART_INCOMPLETE');
      }),
      config(RUNS_SMALL),
    );
  });

  /**
   * ⚠ **INVERTED AND WIDENED BY ADR-0009 R5.** This was "a JOINT waqf with only ONE leg halts rather
   * than deciding the other does not exist". Now EVERY joint waqf halts — one leg, two legs, no cohort,
   * any order, including a direct-use one — because a waqf is either خيري or ذري and never both.
   *
   * Driven from a purpose-built refusal arbitrary rather than by patching a live input, so that all
   * three of R5's refusals are generated deliberately and each case asserts its own discriminator.
   * `SHART_INCOMPLETE` now covers **twenty-six** distinct refusals (was "fifteen" here until R7), so a
   * code-only property could pass while the engine refused for the wrong reason.
   */
  it('every JOINT waqf, every mixed خيري/ذري cohort, and every nature contradiction halts', () => {
    const stats = {
      joint: 0,
      mixedCohort: 0,
      lineageOnCharitable: 0,
      jihaOnFamilyWaqf: 0,
      descendantOnCharitableWaqf: 0,
      // ⚠ RENAMED FROM `jihaTiered` (2026-08-03). The arm that used to yield `JIHA_TIERED` now yields
      // `TABAQA_ON_CHARITABLE_WAQF`, which is checked at Stage 0 and outranks it on every route. The
      // counter is not deleted — the shape it counts (a jiha carrying a ṭabaqa) is still generated
      // and still refused; only the discriminator moved.
      tabaqaOnCharitable: 0,
      /**
       * ⚠ **BACK FROM ZERO (R7-f).** This counter did not exist, because `JIHA_TIERED` had no reachable
       * input at all and the arm that once produced it was re-pointed at `TABAQA_ON_CHARITABLE_WAQF`.
       * R7 makes a `CHARITABLE_JIHA` legal on a ذري waqf as its recorded ultimate taker, and a taker
       * carrying a `tabaqa` walks past every Stage-0 check onto `assertJihaNotTiered` at Stage 2.
       */
      jihaTiered: 0,
      /**
       * ✓ **NEW (memo Q7, product owner 2026-08-17).** `JIHA_TIERED` on a **direct-use** waqf — the cell
       * ESC-2 named, where the record used to compute because I7's short-circuit returned before the guard.
       * Validity now precedes short-circuits, so this counter exists at all; it was structurally zero
       * before, which is why the old code asserted the draw could never happen.
       */
      jihaTieredDirectUse: 0,
      jointDirectUse: 0,
      jointLineage: 0,
      descendantDirectUse: 0,
      tabaqaDirectUse: 0,
    };

    fc.assert(
      fc.property(arbRefusedNatureInput, ({ input, refusal }) => {
        const outcome = runOutcome(input);
        expect(outcome.ok, `${refusal} must refuse`).toBe(false);
        if (outcome.ok) return;
        expect(outcome.code).toBe('SHART_INCOMPLETE');
        expect(outcome.refusal).toBe(refusal);

        if (refusal === 'WAQF_TYPE_JOINT_NOT_SUPPORTED') {
          stats.joint += 1;
          if (input.entitlementOrder === 'NA_DIRECT_USE') stats.jointDirectUse += 1;
          if (input.entitlementOrder === 'LINEAGE_CONTINUATION') stats.jointLineage += 1;
        }
        if (refusal === 'COHORT_MIXES_CHARITABLE_AND_FAMILY') stats.mixedCohort += 1;
        if (refusal === 'LINEAGE_ORDER_ON_CHARITABLE_WAQF') stats.lineageOnCharitable += 1;
        if (refusal === 'CHARITABLE_JIHA_ON_FAMILY_WAQF') stats.jihaOnFamilyWaqf += 1;
        if (refusal === 'DESCENDANT_ON_CHARITABLE_WAQF') {
          stats.descendantOnCharitableWaqf += 1;
          if (input.entitlementOrder === 'NA_DIRECT_USE') stats.descendantDirectUse += 1;
        }
        if (refusal === 'TABAQA_ON_CHARITABLE_WAQF') {
          stats.tabaqaOnCharitable += 1;
          if (input.entitlementOrder === 'NA_DIRECT_USE') stats.tabaqaDirectUse += 1;
        }
        if (refusal === 'JIHA_TIERED') {
          stats.jihaTiered += 1;
          // ✓ INVERTED BY memo Q7 (product owner, 2026-08-17). This read
          // `expect(input.entitlementOrder).not.toBe('NA_DIRECT_USE')`, with the comment: "the arm never
          // draws NA_DIRECT_USE … on a ذري direct-use waqf the identical input COMPUTES (I7's short-circuit
          // returns before the guard), which is ESC-2's second reachable shape." Validity now precedes the
          // short-circuit, so the direct-use draw refuses too — and the assertion becomes a POSITIVE
          // coverage count rather than an exclusion, checked against its own minimum below.
          if (input.entitlementOrder === 'NA_DIRECT_USE') stats.jihaTieredDirectUse += 1;
        }
      }),
      // Six refusals now share this arbitrary; the old 300 left the newest two at ~50 draws each,
      // which is under their own coverage minimums. Still a tiny space — one engine call per case.
      config(RUNS_SINGLE_RUN),
    );

    // Coverage, asserted rather than assumed: every refusal this arbitrary claims to build must
    // actually have been built.
    expect(stats.joint).toBeGreaterThan(50);
    expect(stats.mixedCohort).toBeGreaterThan(50);
    expect(stats.lineageOnCharitable).toBeGreaterThan(50);
    expect(stats.jihaOnFamilyWaqf).toBeGreaterThan(50);
    expect(stats.tabaqaOnCharitable).toBeGreaterThan(50);
    // ⚠ R7-f · `JIHA_TIERED`'s first generated coverage since it became unreachable. A drop to zero here
    // means the ذري route closed again and the refusal is back to being proven by nothing.
    expect(stats.jihaTiered).toBeGreaterThan(50);
    // ESC-1's own minimum — the refusal that had no generator at all until the ESC-1 pass, and that
    // would have lost its generator again to the ṭabaqa rule if its arm had not been re-shaped.
    expect(stats.descendantOnCharitableWaqf).toBeGreaterThan(50);
    // The four cases where a Stage-0 nature refusal must outrank a short-circuit that used to win: a
    // direct-use JOINT waqf, a JOINT waqf on the lineage order, a direct-use خيري waqf whose cohort is
    // the waqif's own bloodline, and — new — a direct-use خيري waqf whose jiha carries a ṭabaqa. That
    // last one is a strictly stronger claim than its predecessor: `JIHA_TIERED` sat at Stage 2 and
    // I7's short-circuit beat it, so it could never be asserted at all.
    expect(stats.jointDirectUse).toBeGreaterThan(5);
    expect(stats.jointLineage).toBeGreaterThan(5);
    expect(stats.descendantDirectUse).toBeGreaterThan(5);
    expect(stats.tabaqaDirectUse).toBeGreaterThan(5);
    // ✓ Q7 · and the FIFTH such case, which could not exist until the guard moved above the short-circuit:
    // a ذري DIRECT-USE waqf whose recorded ultimate taker carries a ṭabaqa. This is ESC-2's second shape,
    // now generated and refused rather than pinned as computing.
    expect(stats.jihaTieredDirectUse).toBeGreaterThan(5);
  });

  /**
   * **R6-D1 and ESC-1, each PAIRED WITH ITS CONTROL** — requirement (d) of the property brief.
   *
   * A refusal property on its own cannot tell *"the engine refuses a charity on an ancestral waqf"*
   * from *"the engine refuses this whole family of inputs"*. Both pairs run the identical register
   * twice, changing exactly the one fact the refusal is about, and require the other run to **compute
   * and pay**. Without that half, a denial-of-service regression — refuse every register with
   * placeholders, refuse every ancestral tree — would show up as a passing refusal property.
   *
   *  · **R6-D1** — a `CHARITABLE_JIHA` on a `FAMILY_DHURRI` waqf refuses; the same register with the
   *    jiha(s) dropped resolves and pays the bloodline the 27,500,000 the measured defect diverted.
   *  · **ESC-1** — an ancestral register declared `PUBLIC_CHARITABLE` refuses; the byte-identical
   *    register declared `FAMILY_DHURRI` resolves and pays. One word of the deed record is the whole
   *    difference, which is exactly what the refusal claims to be about.
   */
  it('the two R5 refusals refuse a CONTRADICTION, not a legal deed — each against its control', () => {
    const stats = {
      jihaRefused: 0,
      jihaControlPaid: 0,
      descendantRefused: 0,
      descendantControlPaid: 0,
      descendantControlDirectUse: 0,
    };

    fc.assert(
      fc.property(arbCharitableJihaOnFamilyWaqfCase, ({ input, control, order }) => {
        const refused = runOutcome(input);
        expect(refused.ok, 'a charity on an ancestral waqf must refuse').toBe(false);
        if (!refused.ok) {
          expect(refused.code).toBe('SHART_INCOMPLETE');
          expect(refused.refusal).toBe('CHARITABLE_JIHA_ON_FAMILY_WAQF');
          stats.jihaRefused += 1;
        }

        const computed = runOutcome(control);
        expect(computed.ok, 'the same register minus the charity must COMPUTE').toBe(true);
        if (computed.ok && order !== 'NA_DIRECT_USE') {
          expect(computed.result.entitlementRule).not.toBe('JOINT_FIXED_DEED_SHARES');
          if ((computed.result.totals.entitledMinor as bigint) > 0n) stats.jihaControlPaid += 1;
        }
      }),
      config(RUNS_PAIRED),
    );

    fc.assert(
      fc.property(arbDescendantOnCharitableWaqfCase, ({ input, control, order }) => {
        const refused = runOutcome(input);
        expect(refused.ok, 'a bloodline on a charitable waqf must refuse').toBe(false);
        if (!refused.ok) {
          expect(refused.code).toBe('SHART_INCOMPLETE');
          // ⚠ INVERTED (2026-08-03). This pair's INPUT is deliberately byte-identical to its control
          // except for the one word `waqfType`, so the tree arrives ṭabaqa-cross-checked — and
          // `TABAQA_ON_CHARITABLE_WAQF` answers that record before ESC-1 does. MEASURED BEFORE:
          // `DESCENDANT_ON_CHARITABLE_WAQF`. The pair's claim is unchanged: one word of the deed
          // record is the whole difference between a refused run and a paying one. Stripping the
          // ṭabaqāt to keep the old discriminator would have broken the control (a ذري tree with no
          // ṭabaqāt halts `TABAQA_MISMATCHES_LINEAGE_DEPTH`) and destroyed the pairing, so ESC-1's
          // own generator lives in `arbCharitablePlaceholderCase` and `arbRefusedNatureInput` instead.
          expect(refused.refusal).toBe('TABAQA_ON_CHARITABLE_WAQF');
          stats.descendantRefused += 1;
        }

        const computed = runOutcome(control);
        expect(computed.ok, 'the SAME register declared ذري must COMPUTE').toBe(true);
        if (!computed.ok) return;
        if (order === 'NA_DIRECT_USE') {
          // A direct-use waqf legitimately resolves no cohort — the "and pays" half cannot apply.
          expect(computed.result.lines).toStrictEqual([]);
          stats.descendantControlDirectUse += 1;
          return;
        }
        // Not every control PAYS: `vitalStatus: 'MIXED'` admits an all-deceased register, which
        // legitimately pays nobody and retains the pool. Counted rather than required per run.
        if ((computed.result.totals.entitledMinor as bigint) > 0n) {
          stats.descendantControlPaid += 1;
        }
      }),
      config(RUNS_PAIRED),
    );

    expect(stats.jihaRefused).toBeGreaterThan(400);
    expect(stats.jihaControlPaid).toBeGreaterThan(100);
    expect(stats.descendantRefused).toBeGreaterThan(400);
    // The load-bearing count: without it, "the engine refuses ancestral registers declared خيري"
    // would be satisfied by an engine that refuses ancestral registers.
    expect(stats.descendantControlPaid).toBeGreaterThan(100);
    expect(stats.descendantControlDirectUse).toBeGreaterThan(20);
  });

  /**
   * ⚠⚠ **HALF-INVERTED — this test was the property-level measurement of R6-F1.**
   *
   * ── WHAT IT ASSERTED, KEPT VERBATIM AS THE RECORD ─────────────────────────────────────────
   * Its name was *"FINDING · a CATEGORY_ONLY placeholder cannot be recorded on a خيري waqf, either
   * way round"*, and its body was one blanket claim over both arms of the same generator:
   *
   *     const outcome = runOutcome(input(base));
   *     expect(outcome.ok, 'a خيري waqf with a placeholder must refuse either way').toBe(false);
   *     expect(outcome.refusal).toBe(refusal);   // DESCENDANT_ON_CHARITABLE_WAQF | LINEAGE_LINK_MISSING
   *
   * Two engineering-authored rules, each carrying its own `TODO(surface)`, closed the shape entirely:
   * **R6** demanded a `lineageLink` on every `FAMILY`/`CATEGORY_ONLY` record whatever the waqf type,
   * and **ESC-1** refused any record carrying one on a خيري waqf. A charitable waqf therefore had no
   * legal way to record a not-yet-enumerated segment — the very thing `CATEGORY_ONLY` exists for.
   *
   * ── WHAT CLOSED IT ────────────────────────────────────────────────────────────────────────
   * `buildLineage` pass 4 now scopes the `CATEGORY_ONLY` edge requirement to a `FAMILY_DHURRI` waqf.
   * The inputs below are UNCHANGED — the same generator, the same two recordings — and only the
   * no-link arm's expected verdict moved, from `LINEAGE_LINK_MISSING` to a computed run.
   *
   * ── WHY IT IS SPLIT RATHER THAN LOOSENED ──────────────────────────────────────────────────
   * The with-link arm is asserted at full strength and unchanged: ESC-1 still refuses a خيري record
   * that claims descent, and that arm is what would redden if ESC-1 lapsed. The no-link arm asserts
   * three things, not merely `ok`:
   *   1. it computes;
   *   2. **no line carries a lineage depth** — the engine placed nobody in a family tree, so the
   *      placeholder is being paid as a charitable *segment* and there is no bloodline in the run to
   *      take ghallah from. This is the predicate that separates "legitimately unplaced on a خيري
   *      waqf" from the escape class, and it is asserted per draw rather than argued in prose;
   *   3. the pool is conserved — entitlement sums to the distributable, residual 0 — so "it resolves"
   *      cannot be satisfied by a run that quietly paid nothing.
   */
  it('a خيري placeholder computes edgeless and untiered, and is refused for either claim', () => {
    const stats = { withLink: 0, withoutLink: 0, withoutLinkPaid: 0, descendant: 0, tabaqa: 0 };

    fc.assert(
      fc.property(
        arbDistributionInput(),
        arbCharitablePlaceholderCase,
        (base, { input, refusal, withTabaqa }) => {
          const built = input(base);
          const outcome = runOutcome(built);

          if (refusal !== null) {
            // ── THE REFUSING ARMS. ⚠ Now TWO of them, and which one fires is the precedence claim:
            //    a recorded ṭabaqa outranks a recorded descent, because a وقف خيري has no generations
            //    and that is checked first. Both discriminators are counted below so neither rule can
            //    quietly absorb the other's cells.
            expect(outcome.ok, 'a خيري waqf recording descent or a ṭabaqa must refuse').toBe(false);
            if (!outcome.ok) {
              expect(outcome.code).toBe('SHART_INCOMPLETE');
              expect(outcome.refusal).toBe(refusal);
            }
            if (withTabaqa) stats.tabaqa += 1;
            else stats.descendant += 1;
            stats.withLink += 1;
            return;
          }

          // ── INVERTED ARM ──
          expect(outcome.ok, 'a خيري waqf with an EDGELESS placeholder must compute').toBe(true);
          if (!outcome.ok) return;
          const { result } = outcome;
          // (2) nobody is in a family tree, so no bloodline shares this pool.
          for (const line of result.lines) expect(line.basis.lineageDepth).toBeNull();
          // ⚠ A nil run legitimately emits NO line at all (`NIL_DISTRIBUTION`, engine.ts's literal
          // reading of §08 line 405), and the general base draws zero-revenue periods. So the
          // two-line claim is stated on the runs that HAVE a pool, and the nil branch is named
          // rather than swept into the same `toBeGreaterThan`.
          const distributable = result.waterfall.distributableMinor as bigint;
          if (distributable === 0n) {
            expect(result.lines).toStrictEqual([]);
            expect(result.flags).toContain('NIL_DISTRIBUTION');
          } else {
            expect(result.lines).toHaveLength(2);
            // (3) conservation — nothing leaks out of the pool the waterfall produced.
            const summed = result.lines.reduce(
              (acc, line) => acc + (line.entitledMinor as bigint),
              0n,
            );
            expect(summed).toBe(result.totals.entitledMinor as bigint);
            expect(summed + (result.totals.retainedMinor as bigint)).toBe(distributable);
            stats.withoutLinkPaid += 1;
          }
          stats.withoutLink += 1;
        },
      ),
      config(RUNS_SMALL),
    );

    // BOTH recordings must still be generated: one arm alone reads as an ordinary refusal (or an
    // ordinary run) rather than as the two sides of the line R6-F1's correction drew.
    expect(stats.withLink).toBeGreaterThan(50);
    expect(stats.withoutLink).toBeGreaterThan(50);
    // ⚠ Load-bearing: without it, "the edgeless arm computes" would be satisfied by an engine that
    // resolves a خيري placeholder cohort and then pays it nothing.
    expect(stats.withoutLinkPaid).toBeGreaterThan(50);
    // ⚠ AND BOTH REFUSALS, separately. ESC-1's cell is the narrow one — descent recorded WITHOUT a
    // generation — and it is the only one left that reaches `DESCENDANT_ON_CHARITABLE_WAQF` through
    // `runDistribution` on this generator. A drop to zero here means the ṭabaqa rule has swallowed it.
    expect(stats.descendant).toBeGreaterThan(20);
    expect(stats.tabaqa).toBeGreaterThan(20);
  });

  /**
   * The complement, and it is the half that makes the property above worth having: the GENERAL
   * generator must never produce a mixed cohort that computes. Without this, "no mixed cohort ever
   * pays a charity out of a family endowment" would rest on the generator's silence.
   */
  it('no generated legal input ever computes with a mixed خيري/ذري cohort', () => {
    const stats = { computed: 0, charitableCohorts: 0, familyCohorts: 0 };

    fc.assert(
      fc.property(arbDistributionInput(), (input) => {
        const hasJiha = input.beneficiaries.some((member) => member.kind === 'CHARITABLE_JIHA');
        const hasFamily = input.beneficiaries.some((member) => member.kind === 'FAMILY');
        // The generator's own guarantee, asserted at the point of use: one nature or the other.
        expect(hasJiha && hasFamily).toBe(false);
        expect(input.waqfType).not.toBe('JOINT');
        if (hasJiha) stats.charitableCohorts += 1;
        if (hasFamily) stats.familyCohorts += 1;

        const outcome = runOutcome(input);
        if (outcome.ok) {
          stats.computed += 1;
          // And no emitted run can carry the joint rule, on any line.
          expect(outcome.result.entitlementRule).not.toBe('JOINT_FIXED_DEED_SHARES');
        }
      }),
      config(RUNS_SINGLE_RUN),
    );

    expect(stats.computed).toBeGreaterThan(100);
    expect(stats.charitableCohorts).toBeGreaterThan(20);
    expect(stats.familyCohorts).toBeGreaterThan(200);
  });

  /**
   * The continuation stipulation is a CLOSED TWO-VALUE deed term with NO default (ADR-0009 R2). Which
   * lines a founder continued is not something code may choose, so an absent, whitespace-padded or
   * wrong-cased value halts exactly as an unreadable order does.
   */
  it('an unrecognised continuation stipulation always halts on a lineage deed', () => {
    const stats = { refusals: 0, nearMisses: 0 };

    fc.assert(
      fc.property(
        arbLineageRunInput('ZUHUR_ONLY', { minSize: 2, maxSize: 6 }),
        fc.oneof(
          {
            weight: 3,
            arbitrary: fc.constantFrom(
              '',
              ' ',
              'zuhur_only',
              'Zuhur_Only',
              'ZUHUR_ONLY ',
              ' ZUHUR_AND_BUTUN',
              'ZUHUR',
              'BUTUN',
              'ظهور فقط',
              'ظهور وبطون',
            ),
          },
          { weight: 1, arbitrary: fc.string() },
        ),
        (base, recorded) => {
          if (recorded === 'ZUHUR_ONLY' || recorded === 'ZUHUR_AND_BUTUN') return;
          if (recorded.trim() !== recorded || recorded !== recorded.toUpperCase()) {
            stats.nearMisses += 1;
          }
          const outcome = runOutcome({ ...base, continuationStipulation: recorded });
          expect(outcome.ok).toBe(false);
          if (outcome.ok) return;
          expect(outcome.code).toBe('SHART_INCOMPLETE');
          expect(outcome.refusal).toBe('CONTINUATION_STIPULATION_UNRECOGNISED');
          stats.refusals += 1;
        },
      ),
      config(RUNS_SMALL),
    );

    expect(stats.refusals).toBeGreaterThan(100);
    expect(stats.nearMisses).toBeGreaterThan(20);

    // `null` is refused too, and it is the case a caller is most likely to hit: a deed whose
    // continuation term was simply never transcribed.
    fc.assert(
      fc.property(arbLineageRunInput('ZUHUR_AND_BUTUN', { minSize: 2, maxSize: 6 }), (base) => {
        const outcome = runOutcome({ ...base, continuationStipulation: null });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.refusal).toBe('CONTINUATION_STIPULATION_UNRECOGNISED');
      }),
      config(RUNS_SMALL),
    );
  });

  /**
   * A malformed family tree is refused, never repaired. An engine that "fixed" a dangling `parentId`
   * by treating the member as a child of the waqif would promote them a generation and change every
   * other beneficiary's per-capita share.
   */
  it('every lineage-graph malformation halts with its own refusal, and none is repaired', () => {
    const seen = new Set<string>();
    const stats = { viaEngine: 0, viaBuildLineage: 0 };

    fc.assert(
      fc.property(arbMalformedLineageInput, ({ input, refusal, route }) => {
        if (route === 'ENGINE') {
          const outcome = runOutcome(input);
          expect(outcome.ok, `${refusal} must refuse`).toBe(false);
          if (outcome.ok) return;
          expect(outcome.code).toBe('SHART_INCOMPLETE');
          expect(outcome.refusal).toBe(refusal);
          stats.viaEngine += 1;
          seen.add(refusal);
          return;
        }

        /*
         * ⚠ FINDING — `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` is no longer reachable through
         * `runDistribution`. The only member allowed to sit outside the family tree is a
         * `CHARITABLE_JIHA`, so the orphaned subtree has to hang off one; its members necessarily
         * carry a `lineageLink` (graph membership IS the link), and ESC-1 refuses any lineage link on
         * the خيري waqf a jiha requires — at Stage 0, before `buildLineage` is called.
         *
         * MEASURED on exactly this input: `resolveEntitlement` ⇒ `DESCENDANT_ON_CHARITABLE_WAQF`,
         * `buildLineage` ⇒ `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF`. Both are asserted here — the engine's
         * verdict AND the guard's own — so the narrowing is a documented pair of facts rather than a
         * refusal quietly proving a different refusal under its name.
         *
         * ⚠ **RE-MEASURED 2026-08-03: the engine's half moved to `TABAQA_ON_CHARITABLE_WAQF`.** The
         * orphaned subtree's members are placed descendants, so they carry ṭabaqāt as well as links,
         * and a وقف خيري may hold neither — the ṭabaqa rule is checked first. The FINDING is unchanged
         * and if anything sharper: the guard is still unreachable through the front door, and now two
         * Stage-0 rules stand in front of it rather than one. `buildLineage`'s own verdict below is
         * the assertion that keeps the guard tested at all.
         */
        const throughEngine = runOutcome(input);
        expect(throughEngine.ok).toBe(false);
        if (!throughEngine.ok) expect(throughEngine.refusal).toBe('TABAQA_ON_CHARITABLE_WAQF');

        let guardRefusal: string | null = null;
        try {
          buildLineage(parseDistributionInput(input));
        } catch (error) {
          if (!isDomainError(error)) throw error;
          const details = error.details as Record<string, unknown> | undefined;
          expect(error.code).toBe('SHART_INCOMPLETE');
          guardRefusal = typeof details?.refusal === 'string' ? details.refusal : null;
        }
        expect(guardRefusal, 'buildLineage must still refuse the orphaned subtree').toBe(refusal);
        stats.viaBuildLineage += 1;
        seen.add(refusal);
      }),
      config(RUNS_SMALL),
    );

    // Every malformation the arbitrary can build must actually have been built — otherwise the
    // property is quietly proving a subset and the untested refusals look covered.
    expect([...seen].sort()).toEqual([
      'CONTINUATION_STIPULATION_UNRECOGNISED',
      'LINEAGE_CYCLE',
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
      'LINEAGE_LINK_MISSING',
      'LINEAGE_LINK_UNRECOGNISED',
      'LINEAGE_PARENT_UNKNOWN',
      'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    ]);
    // Both routes exercised. The second count is small on purpose — one case in eight — but it must
    // not be zero, or the guard has no generator at all and its coverage is imaginary.
    expect(stats.viaEngine).toBeGreaterThan(200);
    expect(stats.viaBuildLineage).toBeGreaterThan(10);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P13 · R7 — مآل الوقف, the reversion to a charitable ultimate taker
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **The product owner's decision, 2026-08-10.** A وقف ذري may name a charitable jiha as its ULTIMATE
 * TAKER: it receives nothing while any descendant lives, and takes the distributable once the bloodline
 * is over — *"a waqf ذري may eventually … end up at a charity once ALL descendants are dead and the
 * bloodline is over."*
 *
 * This is a new **legal cohort** and a new **distribution path**, and it lands on the exact configuration
 * this repo has been burned by twice: a charity and a bloodline in one register. So the properties below
 * are written the way the two findings would have been caught, not the way the feature is described.
 *
 * ═══ WHY P13.1 CARRIES THE FULL 10 000-RUN BUDGET ═══
 * R6-D1 and ESC-1 both survived 10 000 green generated runs, because no generator could put a charity and
 * a bloodline in the same cohort — the suite's silence was reported as success. P13.1 runs the R5 mirror
 * (*a charitable line is never paid a halala in the same run as a line the engine CERTIFIED as a
 * descendant of the waqif*) at the same budget, over the **only population where it can be violated**.
 * Asserting it over `arbDistributionInput()` would be very nearly vacuous, which is precisely the mistake.
 *
 * ═══ THE POPULATION, MEASURED — 10,000 cases, three outcomes, none of them a rounding error ═══
 * R7-D1 splits every extinct-looking register in two, so the budget is now spent on three outcomes and
 * each carries its own counted minimum (the figures below are the recorded run, not the minimums):
 *
 *   | outcome | cases | minimum |
 *   |---|---|---|
 *   | the reversion FIRES (enumerated, extinct) | 2,676 | 2,000 |
 *   | the reversion is HELD by a placeholder (R7-D1) | 2,374 | 2,000 |
 *   | the reversion is HELD by a living descendant | 4,950 | 2,000 |
 *
 *   Emitted runs 7,626 · I-R1 reported on every one of them (asserted as an equality, not a threshold) ·
 *   **charities paid on a placeholder register: 0**. The 2,374 held cases do not currently emit at all
 *   (⚠ R7-D2 — see `reversion-adversarial.test.ts` §7), which is why the partition is asserted exactly
 *   rather than as "9,000 of 10,000 emitted".
 *
 * ═══ THE ANCHOR FIGURES, DERIVED BY HAND IN HALALAS ═══
 * The generated runs check the algebra; these are the arithmetic the design was specified against, and
 * they are the same waterfall the R6-D1 / ESC-1 diversions were measured on, so the before/after is
 * comparable. Income **40,000,000**; ṣiyāna PERCENT `'10'` ⇒ 40,000,000 × 10 / 100 = **4,000,000**;
 * operating **4,500,000**; Nazir fee PERCENT_OF_REVENUE `'10'` ⇒ **4,000,000**
 * *(⚠ ʿushr unverified — confirm vs primary law)*.
 *   40,000,000 − 4,000,000 − 4,500,000 − 4,000,000 = **27,500,000** distributable (SAR 275,000.00).
 * · one taker, weight `'10'`, bloodline extinct ⇒ 27,500,000 × 10 / 10 = **27,500,000**, residual 0.
 * · two takers `'70'`/`'30'` ⇒ 27,500,000 × 70 / 100 = 19,250,000 and × 30 / 100 = 8,250,000;
 *   19,250,000 + 8,250,000 = 27,500,000 ✓ — a spread of 11,000,000, which is why **I-L1 must NOT be
 *   asserted on a reverted run** and I-R1 stands in its place.
 * · two takers `'1'`/`'2'` ⇒ exact 9,166,666.66… / 18,333,333.33…; floors 9,166,666 + 18,333,333 =
 *   27,499,999, residual 1, largest remainder (.666 > .333) ⇒ **9,166,667 / 18,333,333** = 27,500,000 ✓.
 * · bloodline LIVING, one taker ⇒ the taker takes **0**. Before amendment D that same input PAID the
 *   charity **13,750,000 of 27,500,000**, halving a living ṭabaqa-1 descendant. R7 does not merely refuse
 *   that diversion — it prices it at nothing.
 *
 * Each generated run re-derives its own split with {@link independentHamilton} over the takers' DEED
 * weights, so the arithmetic is checked at scale rather than only on the anchors.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The lines the engine certified as descendants of the waqif — the fact R5 is actually about. */
function paidDescendantIds(result: DistributionResult): readonly string[] {
  return result.lines
    .filter(
      (line) =>
        (line.entitledMinor as bigint) !== 0n &&
        line.basis.kind !== 'CHARITABLE_JIHA' &&
        (line.basis.lineageDepth !== null || line.basis.lineageLink !== null),
    )
    .map((line) => line.beneficiaryId);
}

/** The charitable lines holding a non-zero entitlement this period. */
function paidCharitableIds(result: DistributionResult): readonly string[] {
  return result.lines
    .filter(
      (line) => (line.entitledMinor as bigint) !== 0n && line.basis.kind === 'CHARITABLE_JIHA',
    )
    .map((line) => line.beneficiaryId);
}

describe('P13 — R7: a charity takes a ذري endowment’s ghallah only once the bloodline is over', () => {
  it(
    `never pays a charity beside a certified descendant, over ${String(RUNS_LEAKAGE)} reversion runs`,
    () => {
      const stats = {
        cases: 0,
        runs: 0,
        applied: 0,
        pending: 0,
        pendingWithEntitledDescendant: 0,
        takerTookWholePool: 0,
        takerTookNothing: 0,
        twoTakersUnequalSplit: 0,
        zeroWeightTakerExcluded: 0,
        appliedLineage: 0,
        appliedOrdered: 0,
        appliedShared: 0,
        /**
         * ⚠ **R7-d (2026-08-11) · THE WIDENING'S OWN POPULATION.** Reverted runs whose register still
         * holds **living** blood descendants — every one of them on a line the deed does not continue.
         * Before the owner's answer this configuration was `pending` and the pool was RETAINED; it now
         * pays the deed's مآل, and it is the single most dangerous shape in the file, because a charity
         * is paid in a period in which the waqif has living issue. I-R1's universal mirror is what makes
         * it safe (every survivor is EXCLUDED holding `0n`, so nothing is *shared*), and this counter is
         * what stops the claim from being "0 out of 0" — R6-C1's exact failure, one rule later.
         */
        appliedWithLivingNonContinuing: 0,
        iR1Checked: 0,
        iL1CheckedOnPending: 0,
        iL1SkippedOnApplied: 0,
        /**
         * Pending runs on which no descendant is entitled either — the narrowed
         * `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` state.
         *
         * ⚠ **MEASURED AT 0 SINCE THE 2026-08-11 WIDENING, and recorded rather than asserted.** It is
         * unreachable *in this population*: `LIVING_BUT_NONE_ENTITLED` used to supply it and now
         * TRIGGERS instead, and no other arm here can hold a continuing line while entitling nobody
         * (`MIXED` forces a living root, `ALL_LIVING` entitles the roots, and the bloodline weights are
         * forced non-zero by `arbUltimateTakerCohort`). Deliberately left WITHOUT a minimum: adding one
         * would be satisfied only by giving this arbitrary a zero-weight generator, and that population
         * has its own property (`R7-d · BOUNDARY`), where the flag is asserted at a counted minimum. The
         * counter stays so the zero is visible instead of merely absent.
         */
        takerNotPaid: 0,
        residualOnTakerSplit: 0,
        /** R7-D1 · extinct-looking registers whose extinction cannot be certified (placeholder present). */
        heldByPlaceholder: 0,
        /** …of those, the ones that EMITTED a run holding the pool. */
        heldByPlaceholderEmitted: 0,
        /** …and the ones the engine refused to emit at all (⚠ R7-D2 — see the note below). */
        heldByPlaceholderNotEmitted: 0,
        /** THE SAFETY COUNTER. Must end at 0: no charity paid on placeholder evidence, by any route. */
        charityPaidOnPlaceholderRegister: 0,
        /**
         * ⚠ The AXIS's own coverage, and it needed two attempts to become load-bearing — recorded
         * because it is the same lesson the axis exists for. `heldByPlaceholder` above is satisfied by
         * the `'DRAWN'` arm alone (measured: a degenerate `'WITH_PLACEHOLDER'` forcing no index left it
         * at 2,368 and P13.1 green), and so is a *threshold* on these two counters, because a drawn
         * register of 2 … 6 members bears a placeholder ~97% of the time anyway. What discriminates a
         * forced arm from a lucky one is the **guarantee**, so the shape is asserted EXACTLY on every
         * case in the property body and these counters only prove both arms were drawn at all.
         */
        forcedPlaceholder: 0,
        forcedEnumerated: 0,
      };

      fc.assert(
        fc.property(arbAnyReversionRunInput, (kase) => {
          const { input, takerIds, bloodlineIds, expectApplied, expectHeldByPlaceholder } = kase;
          stats.cases += 1;
          // ⚠ The axis's GUARANTEE, checked against the register it actually produced rather than
          // against its label, on EVERY case. A threshold here would be met by luck (see the counters'
          // note); an exact claim is what a degenerate forcing rule fails.
          if (kase.composition === 'WITH_PLACEHOLDER' && kase.bloodlineIds.length > 0) {
            stats.forcedPlaceholder += 1;
            expect(
              kase.unenumeratedBloodlineIds.length,
              "composition 'WITH_PLACEHOLDER' produced a register with no placeholder in it",
            ).toBeGreaterThan(0);
          }
          if (kase.composition === 'ENUMERATED_ONLY') {
            stats.forcedEnumerated += 1;
            expect(
              kase.unenumeratedBloodlineIds,
              "composition 'ENUMERATED_ONLY' leaked a placeholder into the register",
            ).toStrictEqual([]);
          }
          const outcome = runOutcome(input);

          /* ── ⚠ R7-D1's configuration, and the ONE claim asserted over it: NO CHARITY IS PAID ────
           * A register whose recorded descendants include a `CATEGORY_ONLY` placeholder cannot certify
           * its own extinction — a placeholder's `active: false` records that a placeholder is not in
           * force, nobody's death — so the reversion must be HELD even though no living descendant is on
           * record. Measured before the fix, on R6-D1's cohort verbatim: the charity took **27,500,000
           * of 27,500,000 halalas**.
           *
           * ⚠⚠ **R7-D2 · MEASURED HERE, NOT ENDORSED.** `resolver.reversionOutcome` holds the trigger, but
           * `invariants.independentReversionState` still recomputes `applied` as *"a clause, a non-empty
           * register, nobody living"* — it was not brought onto the fix. The two disagree, so `I-R1`'s
           * flag cross-check fires and the run is refused `DISTRIBUTION_INVARIANT_BREACH` instead of
           * emitting a retained pool with a reason. **No halala moves either way**, which is why this
           * property can state its money claim over both branches; the CONTRACT (retain + say why) is
           * pinned red in `reversion-adversarial.test.ts` §7, and that is where the defect is owned.
           * Tolerating the throw here without asserting the money claim would be the weakening this file
           * exists to refuse.
           * ────────────────────────────────────────────────────────────────────────────────────────── */
          if (expectHeldByPlaceholder) {
            stats.heldByPlaceholder += 1;
            if (!outcome.ok) {
              stats.heldByPlaceholderNotEmitted += 1;
              // A refused run pays nobody. Asserted as the specific code so a NEW refusal appearing on
              // this route — or a plain crash — cannot hide inside "it threw".
              expect(outcome.code, `${outcome.code}/${String(outcome.refusal)}`).toBe(
                'DISTRIBUTION_INVARIANT_BREACH',
              );
              return;
            }
            stats.heldByPlaceholderEmitted += 1;
            const takerTotalHeld = outcome.result.lines
              .filter((line) => takerIds.includes(line.beneficiaryId))
              .reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
            if (takerTotalHeld !== 0n) stats.charityPaidOnPlaceholderRegister += 1;
            expect(takerTotalHeld).toBe(0n);
            expect(outcome.result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
            // The pool waits for the family the register has not finished enumerating.
            expect(outcome.result.totals.retainedMinor).toBe(
              outcome.result.waterfall.distributableMinor,
            );
            return;
          }

          // Every remaining case is a LEGAL deed record over a guaranteed-positive pool, so a refusal
          // means the GENERATOR is wrong and must fail rather than be tolerated: a reversion property
          // whose inputs all throw is exactly the silence P13 exists to prevent.
          expect(
            outcome.ok,
            outcome.ok ? '' : `unexpected ${outcome.code}/${outcome.refusal}`,
          ).toBe(true);
          if (!outcome.ok) return;
          const { result } = outcome;
          stats.runs += 1;

          assertConservation(input, result);
          assertShapeAndOrdering(input, result);

          /* ── THE R5 MIRROR — the property that would have caught R6-D1 and ESC-1 ──────────── */
          const charitablePaid = paidCharitableIds(result);
          const descendantsPaid = paidDescendantIds(result);
          expect(
            charitablePaid.length === 0 || descendantsPaid.length === 0,
            `this run pays charity ${charitablePaid.join(',')} AND certified descendant(s) ${descendantsPaid.join(',')} out of one distributable`,
          ).toBe(true);

          /* ── The flag is a fact about the register, not a claim the resolver makes ────────── */
          expect(result.flags.includes('REVERSION_TO_ULTIMATE_TAKER_APPLIED')).toBe(expectApplied);
          // I-R1 must actually have been asserted — otherwise every claim above rests on this test
          // alone and the engine's own cross-check of its flag is unreported.
          expect(result.invariantsChecked).toContain('I-R1');
          stats.iR1Checked += 1;

          const takerLines = result.lines.filter((line) => takerIds.includes(line.beneficiaryId));
          const bloodlineLines = result.lines.filter((line) =>
            bloodlineIds.includes(line.beneficiaryId),
          );
          expect(takerLines).toHaveLength(takerIds.length);

          const takerTotal = takerLines.reduce(
            (running, line) => running + (line.entitledMinor as bigint),
            0n,
          );
          const distributable = result.waterfall.distributableMinor as bigint;

          if (expectApplied) {
            stats.applied += 1;
            if (input.entitlementOrder === 'LINEAGE_CONTINUATION') stats.appliedLineage += 1;
            if (input.entitlementOrder === 'ORDERED') stats.appliedOrdered += 1;
            if (input.entitlementOrder === 'SHARED') stats.appliedShared += 1;

            /* ── ⚠ R7-d's WIDENED ARM, and the two claims that make it safe ─────────────────────
             * A reverted run may now carry LIVING blood descendants: a `ZUHUR_ONLY` deed whose only
             * survivors sit on broken daughter lines. So the run says "the bloodline is over" about a
             * register with living issue on it — startling, and correct under the owner's answer.
             *
             * What keeps R5 intact is asserted rather than assumed: every such survivor must be
             * EXCLUDED on the PERMANENT buṭūn code (not on a temporary one, which would tell someone
             * whose line never continues to wait for a relative to die) and must hold `0n`, so
             * `paidDescendantIds` stays empty and the mirror above has nothing to fire on. The generic
             * bloodline loop below re-checks the `0n`; this checks the code, and the flag that a
             * consumer must not read as "the family is gone".
             * ─────────────────────────────────────────────────────────────────────────────────── */
            if (kase.livingNonContinuingBloodlineIds.length > 0) {
              stats.appliedWithLivingNonContinuing += 1;
              expect(input.continuationStipulation).toBe('ZUHUR_ONLY');
              expect(input.entitlementOrder).toBe('LINEAGE_CONTINUATION');
              for (const id of kase.livingNonContinuingBloodlineIds) {
                const line = result.lines.find((entry) => entry.beneficiaryId === id);
                expect(line?.status, id).toBe('EXCLUDED');
                expect(line?.entitledMinor as bigint, id).toBe(0n);
                expect(line?.reasonCode, id).toBe('BUTUN_LINE_NOT_CONTINUED');
              }
              // The trace owes the reader the names — "the bloodline is over" over a register with
              // survivors on it must not be a bare claim.
              const triggered = result.computationTrace.find(
                (entry) => entry.code === 'REVERSION_TRIGGERED',
              );
              expect(triggered?.data?.['livingNonContinuingBloodlineIds']).toBe(
                kase.livingNonContinuingBloodlineIds.join(','),
              );
            }

            // (b) the taker(s) take the WHOLE distributable, and nothing is retained.
            expect(takerTotal).toBe(distributable);
            expect(result.totals.retainedMinor as bigint).toBe(0n);
            if (distributable > 0n) stats.takerTookWholePool += 1;

            // Every descendant is out of the cohort — the bloodline being over IS the trigger.
            for (const line of bloodlineLines) {
              expect(line.status).toBe('EXCLUDED');
              expect(line.entitledMinor as bigint).toBe(0n);
              expect(line.basis.rule).not.toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
            }

            /* ── R7-e · the split is by DEED WEIGHT, never per capita ──────────────────────── */
            const entitledTakers = takerLines.filter((line) => line.status !== 'EXCLUDED');
            const deedWeightById = new Map(
              input.beneficiaries.map((member) => [member.id, member.stipulatedWeight] as const),
            );
            const weights = entitledTakers.map(
              (line) => deedWeightById.get(line.beneficiaryId) ?? '',
            );
            for (const weight of weights) expect(weight).not.toBe('');
            const expectedSplit = independentHamilton(distributable, weights);
            expect(entitledTakers.map((line) => line.entitledMinor as bigint)).toStrictEqual([
              ...expectedSplit.amounts,
            ]);
            if (expectedSplit.residual > 0n) stats.residualOnTakerSplit += 1;

            for (const line of entitledTakers) {
              // The BR-505 label: a charity paid a family endowment's whole ghallah on a line stamped
              // with a LINEAGE rule is the mis-statement ADR-0009 records as a defect.
              expect(line.basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
              expect(line.reasonCode).not.toBe('REVERSION_PENDING_LIVING_BLOODLINE');
              expect(line.basis.lineageDepth).toBeNull();
              expect(line.basis.tabaqa).toBeNull();
            }
            for (const line of takerLines) {
              if (line.status !== 'EXCLUDED') continue;
              // The only reason a taker is out on a triggered run: the deed gave it nothing.
              expect(line.reasonCode).toBe('ZERO_STIPULATED_WEIGHT');
              stats.zeroWeightTakerExcluded += 1;
            }
            if (entitledTakers.length > 1 && new Set(weights).size > 1) {
              stats.twoTakersUnequalSplit += 1;
            }

            // ⚠ THE INVARIANT SWAP. Per capita is the BLOODLINE's rule, so on a reverted run I-L1
            // makes no claim about the line that took the money and must NOT be reported — reporting
            // an invariant that says nothing about the paid line is the R6-I5 defect.
            if (input.entitlementOrder === 'LINEAGE_CONTINUATION') {
              expect(result.invariantsChecked).not.toContain('I-L1');
              stats.iL1SkippedOnApplied += 1;
            }
            return;
          }

          /* ── (a) PENDING — the taker takes NOTHING while any descendant lives ───────────── */
          stats.pending += 1;
          expect(takerTotal).toBe(0n);
          stats.takerTookNothing += 1;
          for (const line of takerLines) {
            expect(line.status).toBe('EXCLUDED');
            expect(line.entitledMinor as bigint).toBe(0n);
            // Temporary, and it must say so by name: the takers are alive by construction, so the
            // reason can only be the bloodline's survival.
            expect(line.reasonCode).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
            expect(line.basis.rule).not.toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
          }
          const entitledDescendants = bloodlineLines.filter((line) => line.status !== 'EXCLUDED');
          if (entitledDescendants.length > 0) {
            stats.pendingWithEntitledDescendant += 1;
            // The bloodline holds the whole pool: the charity's presence in the register moved nothing.
            const bloodlineTotal = entitledDescendants.reduce(
              (running, line) => running + (line.entitledMinor as bigint),
              0n,
            );
            expect(bloodlineTotal).toBe(distributable);
            expect(result.totals.retainedMinor as bigint).toBe(0n);
            if (
              input.entitlementOrder === 'LINEAGE_CONTINUATION' &&
              result.invariantsChecked.includes('I-L1')
            ) {
              stats.iL1CheckedOnPending += 1;
            }
          } else {
            stats.takerNotPaid += 1;
          }
        }),
        config(RUNS_LEAKAGE),
      );

      /* ── Coverage: every new shape reached, with an explicit minimum ────────────────────────
       * A generator that stopped producing extinct bloodlines would leave the ENTIRE new
       * distribution path unexecuted while every assertion above stayed green — which is lesson 5,
       * restated for the feature it is being applied to.
       * ──────────────────────────────────────────────────────────────────────────────────────── */
      /*
       * ⚠ `runs > 9_000` was the old form, and it is REPLACED BY AN EXACT PARTITION rather than lowered.
       * R7-D1 splits the population into outcomes with different contracts, so "9,000 of 10,000 emitted"
       * is not a true statement about a correct engine. Every generated case is accounted for as exactly
       * one outcome — which a generator that quietly stopped producing one of them cannot satisfy — and
       * each then carries its own minimum below.
       *
       * ⚠ **R7-D2 REGRESSION PIN.** This partition briefly read
       * `runs + heldByPlaceholderNotEmitted === cases`, because a placeholder-held register was refused
       * `DISTRIBUTION_INVARIANT_BREACH` rather than emitting: the resolver held the trigger while
       * `invariants.independentReversionState` still recomputed `applied` without the placeholder
       * conjunct, so the two disagreed and `I-R1` refused the run. That is fixed — the invariant now
       * recomputes the conjunct independently — so **`heldByPlaceholderNotEmitted` must be exactly 0**,
       * and a non-zero count means the two sides have drifted apart again. Asserting the ZERO is the
       * point; without it the partition would silently absorb a returning defect.
       */
      expect(stats.cases).toBeGreaterThan(9_000);
      expect(stats.heldByPlaceholderNotEmitted).toBe(0);
      expect(stats.runs + stats.heldByPlaceholderEmitted + stats.heldByPlaceholderNotEmitted).toBe(
        stats.cases,
      );
      // ⚠⚠ THE SAFETY CLAIM OF THE WHOLE SECTION, over the configuration that used to pay 27,500,000
      // of 27,500,000: not one charity took a halala on a register that had not been enumerated.
      expect(stats.charityPaidOnPlaceholderRegister).toBe(0);
      // …and the configuration was genuinely REACHED, at a counted minimum, on the same budget as the
      // outcomes it sits beside. Without this the claim above is "0 out of 0" — R6-C1's exact failure.
      expect(stats.heldByPlaceholder).toBeGreaterThan(2_000);
      // …and both forced arms were actually DRAWN, so the exact guarantees asserted per case above are
      // claims about a population rather than about the empty set.
      expect(stats.forcedPlaceholder).toBeGreaterThan(2_000);
      expect(stats.forcedEnumerated).toBeGreaterThan(4_000);
      expect(stats.applied).toBeGreaterThan(2_000);
      // ⚠ **R7-d's WIDENED ARM, REACHED AT A COUNTED MINIMUM.** The configuration that used to RETAIN
      // the pool and now pays a charity while the waqif has living issue. Measured at this weighting:
      // ≈ 130 of 10,000 (the `LIVING_BUT_NONE_ENTITLED` arm × `LINEAGE_CONTINUATION` × `ZUHUR_ONLY` ×
      // an enumerated register). Without this minimum the widening's whole population could vanish from
      // the mirror — the generator would report its silence as success, and the one assertion that
      // matters most here (`I-R1`, no charity paid beside a certified descendant) would be a claim about
      // the empty set. Lesson R6-C1, applied to the rule that reopened it.
      expect(stats.appliedWithLivingNonContinuing).toBeGreaterThan(50);
      expect(stats.pending).toBeGreaterThan(2_000);
      expect(stats.pendingWithEntitledDescendant).toBeGreaterThan(2_000);
      expect(stats.takerTookWholePool).toBeGreaterThan(2_000);
      expect(stats.takerTookNothing).toBeGreaterThan(2_000);
      // All three money orders reach the reverted path: the reversion is governed by the CLAUSE, not
      // by the entitlement order, and a suite that only ever reverted a lineage deed would not know it.
      expect(stats.appliedLineage).toBeGreaterThan(500);
      expect(stats.appliedOrdered).toBeGreaterThan(500);
      expect(stats.appliedShared).toBeGreaterThan(500);
      // R7-e's teeth: an UNEQUAL two-taker split, which per capita would have made 50/50.
      expect(stats.twoTakersUnequalSplit).toBeGreaterThan(500);
      // The taker ladder's rung 3, and the Hamilton residual on a charity's split.
      expect(stats.zeroWeightTakerExcluded).toBeGreaterThan(200);
      expect(stats.residualOnTakerSplit).toBeGreaterThan(100);
      // Both sides of the invariant swap actually observed. ⚠ `iR1Checked > 9_000` became
      // `=== stats.runs` for the same reason as the partition above — an EXACT claim (every emitted run
      // reported I-R1) rather than a threshold that a non-emitting third of the population invalidates.
      expect(stats.iR1Checked).toBe(stats.runs);
      expect(stats.runs).toBeGreaterThan(6_500);
      expect(stats.iL1SkippedOnApplied).toBeGreaterThan(500);
      expect(stats.iL1CheckedOnPending).toBeGreaterThan(500);
    },
    TIMEOUT_LEAKAGE_MS,
  );

  /**
   * ⚠ **INVERTED 2026-08-11 · R7-d ANSWERED: *"bloodline is over means no continuing line."***
   *
   * *"The bloodline is over"* is still not *"nobody is entitled this period"* — that distinction is the
   * boundary property immediately below, and it is untouched. What changed is the OTHER half. Under
   * `ZUHUR_ONLY` a waqif with only daughters has living blood descendants whose line the deed does not
   * continue, and the product owner has now said that the ẓuhūr line being over IS the bloodline being
   * over: **the reversion TRIGGERS and the deed's مآل takes the distributable.**
   *
   * ═══ THE INPUT IS VERBATIM; ONLY THE VERDICT IS INVERTED ═══
   * Same generator (`LIVING_BUT_NONE_ENTITLED`), same order, same term, same bloodline bounds. MEASURED
   * BEFORE 2026-08-11, on this exact population: every case had `entitledMinor === 0`,
   * `retainedMinor === distributableMinor`, `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` raised and
   * `REVERSION_TO_ULTIMATE_TAKER_APPLIED` absent, with the taker's line reading
   * `REVERSION_PENDING_LIVING_BLOODLINE`. Every one of those six statements is now the opposite, and the
   * whole distributable moves.
   *
   * ═══ WHAT THIS PROPERTY IS REALLY GUARDING ═══
   * The widening's danger is R5: a wrongly-triggered reversion pays a charity while the family lives. So
   * the assertions are not only *"the taker took the pool"* — they are that **every living survivor is
   * EXCLUDED on the PERMANENT code holding zero halalas**, which is what keeps I-R1's universal mirror
   * true of a run that pays a charity in a period with living blood descendants on the register. The
   * temporary code (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) must never appear on such a survivor: their
   * line does not continue under this deed, and telling them to wait for a relative to die would be the
   * wrong sentence as well as the wrong money.
   */
  it('R7-d · INVERTED · a living descendant on a broken line TRIGGERS the reversion — was RETAINED', () => {
    const stats = { runs: 0, butunBreak: 0, inactiveRoot: 0, livingSurvivors: 0 };

    fc.assert(
      fc.property(
        arbReversionRunInput({
          liveness: 'LIVING_BUT_NONE_ENTITLED',
          // ⚠ `ENUMERATED_ONLY` is REQUIRED for this claim and was not needed before the widening: a
          // placeholder anywhere in the register HOLDS the reversion whatever the continuing-line test
          // says (R7-D1, owner-confirmed in the same breath), so on the default `'DRAWN'` this property
          // would have been asserting the trigger over a population that legitimately does not trigger.
          // The placeholder × widening interaction is its own property below.
          composition: 'ENUMERATED_ONLY',
          order: 'LINEAGE_CONTINUATION',
          continuation: 'ZUHUR_ONLY',
          minBloodline: 2,
          maxBloodline: 5,
        }),
        (kase) => {
          const { input, takerIds, livingBloodlineIds, expectApplied } = kase;
          // The generator's own premise, asserted at the point of use rather than trusted. ⚠ Both halves
          // together are the subject: living descendants ARE on record (so this is not an ordinary
          // extinct register) AND the trigger fires anyway (so the widening is what is being measured).
          expect(livingBloodlineIds.length).toBeGreaterThan(0);
          expect(kase.continuingBloodlineIds).toStrictEqual([]);
          expect(kase.livingNonContinuingBloodlineIds).toStrictEqual(livingBloodlineIds);
          expect(expectApplied).toBe(true);

          const outcome = runOutcome(input);
          expect(
            outcome.ok,
            outcome.ok ? '' : `unexpected ${outcome.code}/${outcome.refusal}`,
          ).toBe(true);
          if (!outcome.ok) return;
          const { result } = outcome;
          stats.runs += 1;
          stats.livingSurvivors += livingBloodlineIds.length;

          assertConservation(input, result);

          // ⚠ THE INVERSION, in money: the pool no longer waits. The taker(s) hold all of it and the
          // family holds none — over a register with living blood descendants on it.
          const distributable = result.waterfall.distributableMinor as bigint;
          const takerTotal = result.lines
            .filter((line) => takerIds.includes(line.beneficiaryId))
            .reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
          expect(takerTotal).toBe(distributable);
          expect(result.totals.retainedMinor as bigint).toBe(0n);
          expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
          expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
          expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED');
          // I-R1 must have run: every claim here otherwise rests on this test alone.
          expect(result.invariantsChecked).toContain('I-R1');

          // ⚠ AND R5 HELD, per line rather than in aggregate. Every survivor out on the PERMANENT code
          // holding nothing — which is why "a charity was paid in a period with living issue" is not a
          // breach of the mirror.
          for (const id of livingBloodlineIds) {
            const line = result.lines.find((entry) => entry.beneficiaryId === id);
            expect(line?.status, id).toBe('EXCLUDED');
            expect(line?.entitledMinor as bigint, id).toBe(0n);
            expect(line?.reasonCode, id).toBe('BUTUN_LINE_NOT_CONTINUED');
            stats.butunBreak += 1;
          }
          for (const line of result.lines) {
            if (line.reasonCode === 'BENEFICIARY_INACTIVE') stats.inactiveRoot += 1;
            // The temporary code has no business on this register: nobody is waiting for anything.
            expect(line.reasonCode).not.toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
            expect(line.reasonCode).not.toBe('REVERSION_PENDING_LIVING_BLOODLINE');
          }

          // The run NAMES the survivors it is deciding over, so "the bloodline is over" printed against
          // a register with living issue is auditable rather than bare.
          const triggered = result.computationTrace.find(
            (entry) => entry.code === 'REVERSION_TRIGGERED',
          );
          expect(triggered?.data?.['livingNonContinuingBloodlineIds']).toBe(
            livingBloodlineIds.join(','),
          );
          expect(triggered?.data?.['continuationStipulation']).toBe('ZUHUR_ONLY');
        },
      ),
      config(RUNS_SINGLE_RUN),
    );

    expect(stats.runs).toBeGreaterThan(800);
    // The register really did hold survivors on every case — otherwise this is an ordinary extinct
    // register wearing the widening's name, and the inversion above would be vacuous.
    expect(stats.livingSurvivors).toBeGreaterThan(800);
    expect(stats.butunBreak).toBeGreaterThan(800);
    expect(stats.inactiveRoot).toBeGreaterThan(500);
  });

  /**
   * **R7-d's THREE BOUNDARIES · the trigger is descent + liveness + the stipulation, and NOTHING else.**
   *
   * The widening's whole difficulty is that *"no continuing line"* and *"nobody entitled"* are different
   * questions, and the second is easier to compute. An implementation that read the exclusion codes — or
   * `entitledBloodlineCount`, or a line's status — would agree with the correct one on the population
   * above and disagree here, where a charity would then be paid while the family plainly continues:
   *
   *  1. **a zero deed weight on every living head.** Their lines continue perfectly well; the deed
   *     merely gives them nothing this period. Generated by `LIVING_CONTINUING_ZERO_WEIGHT`, which
   *     builds LIVING `SON` children of the waqif (empty ancestor chains — no walk can break them) with
   *     `stipulatedWeight: '0'`, on `ORDERED`/`SHARED` where a weight excludes.
   *  2. **the frontier rule is irrelevant.** A descendant held behind a living ancestor is proof the
   *     line is alive; the ancestor is on it and breathing. Covered by the `LINEAGE_CONTINUATION` arm of
   *     the same generator, where the `'0'` weights are NOT applied (per capita, R3) and every root is
   *     therefore entitled — the same register proving that no weight reached the trigger.
   *  3. **gates never touch entitlement (I6)**, so they can never reach the trigger either. Asserted
   *     over the drawn gate fields: the generator varies KYC/residency/licence freely, so a withheld or
   *     cross-border head appears in this population and must still hold the reversion.
   *
   * The claim in one line: **on every one of these runs the taker holds zero halalas.**
   */
  it('R7-d · BOUNDARY · living heads on CONTINUING lines hold the reversion, entitled or not', () => {
    const stats = {
      runs: 0,
      nobodyEntitled: 0,
      somebodyEntitled: 0,
      zeroWeightExcluded: 0,
      gateTouched: 0,
      notTriggeredFlag: 0,
    };

    fc.assert(
      fc.property(
        fc
          .record({
            order: fc.constantFrom(...MONEY_ORDERS),
            continuation: arbContinuationStipulation,
          })
          .chain(({ order, continuation }) =>
            arbReversionRunInput({
              liveness: 'LIVING_CONTINUING_ZERO_WEIGHT',
              // Enumerated, so the hold this property observes is the CONTINUING LINE doing the work and
              // never R7-D1's placeholder rule. Mixing the two would make a green run ambiguous about
              // which fail-safe held it.
              composition: 'ENUMERATED_ONLY',
              order,
              continuation: order === 'LINEAGE_CONTINUATION' ? continuation : null,
              minBloodline: 2,
              maxBloodline: 5,
            }),
          ),
        (kase) => {
          const { input, takerIds, bloodlineIds, livingBloodlineIds, expectApplied } = kase;
          // The premise: every recorded descendant is alive AND on a line the deed continues, at every
          // continuation term — which is what makes "nobody entitled" the only thing left varying.
          expect(livingBloodlineIds).toStrictEqual(bloodlineIds);
          expect(kase.continuingBloodlineIds).toStrictEqual(bloodlineIds);
          expect(kase.livingNonContinuingBloodlineIds).toStrictEqual([]);
          expect(expectApplied).toBe(false);

          const outcome = runOutcome(input);
          expect(
            outcome.ok,
            outcome.ok ? '' : `unexpected ${outcome.code}/${outcome.refusal}`,
          ).toBe(true);
          if (!outcome.ok) return;
          const { result } = outcome;
          stats.runs += 1;

          assertConservation(input, result);

          // ⚠⚠ THE CLAIM, on every run in this population: the charity takes NOTHING. A trigger derived
          // from the entitled cohort would hand it the whole pool on the `ORDERED`/`SHARED` half.
          const takerTotal = result.lines
            .filter((line) => takerIds.includes(line.beneficiaryId))
            .reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
          expect(takerTotal).toBe(0n);
          expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
          expect(result.invariantsChecked).toContain('I-R1');
          for (const id of takerIds) {
            const line = result.lines.find((entry) => entry.beneficiaryId === id);
            // Held because a line the deed continues is still going — never the unenumerated code, which
            // would be false of a register of individually-named living people.
            expect(line?.reasonCode, id).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
          }

          const entitledDescendants = result.lines.filter(
            (line) => bloodlineIds.includes(line.beneficiaryId) && line.status !== 'EXCLUDED',
          );
          if (entitledDescendants.length === 0) {
            /* BOUNDARY 1 · `ORDERED`/`SHARED` — every living head carries deed weight '0'. The entitled
             * cohort is EMPTY and the lines are all alive: the exact disagreement between the two
             * possible implementations of the trigger, and the pool is retained. */
            stats.nobodyEntitled += 1;
            expect(input.entitlementOrder).not.toBe('LINEAGE_CONTINUATION');
            expect(result.totals.retainedMinor).toBe(result.waterfall.distributableMinor);
            expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
            // The narrowed flag's remaining meaning, exercised: a CONTINUING line is going and nobody on
            // it is entitled. This is the population that keeps it from being dead code after the
            // widening took its old headline example away.
            expect(result.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
            stats.notTriggeredFlag += 1;
            for (const id of bloodlineIds) {
              const line = result.lines.find((entry) => entry.beneficiaryId === id);
              expect(line?.reasonCode, id).toBe('ZERO_STIPULATED_WEIGHT');
              stats.zeroWeightExcluded += 1;
            }
          } else {
            /* BOUNDARY 2 · `LINEAGE_CONTINUATION` — the same `'0'` weights are NOT applied (per capita,
             * R3), so the living frontier is entitled and holds the whole pool. The charity is held for
             * the ordinary reason, and the deed weight reached neither the entitlement nor the trigger. */
            stats.somebodyEntitled += 1;
            expect(input.entitlementOrder).toBe('LINEAGE_CONTINUATION');
            const bloodlineTotal = entitledDescendants.reduce(
              (running, line) => running + (line.entitledMinor as bigint),
              0n,
            );
            expect(bloodlineTotal).toBe(result.waterfall.distributableMinor);
            expect(result.totals.retainedMinor as bigint).toBe(0n);
          }

          /* BOUNDARY 3 · a GATE never reaches the trigger (I6). The gate fields are drawn, so withheld
           * and cross-border heads occur in this population; a withheld descendant is an ENTITLED
           * descendant, and the taker is 0 above regardless. */
          if (result.lines.some((line) => line.gateFlags.length > 0)) stats.gateTouched += 1;
        },
      ),
      config(RUNS_SINGLE_RUN),
    );

    expect(stats.runs).toBeGreaterThan(800);
    // ⚠ BOTH boundaries reached, each at its own minimum. If either went to zero the property would
    // still pass every assertion above while proving only half of what it claims.
    expect(stats.nobodyEntitled).toBeGreaterThan(300);
    expect(stats.somebodyEntitled).toBeGreaterThan(200);
    expect(stats.zeroWeightExcluded).toBeGreaterThan(600);
    expect(stats.notTriggeredFlag).toBeGreaterThan(300);
    // …and boundary 3's population is non-empty: a gate really did trip somewhere in here, so "gates
    // cannot reach the trigger" is a claim about runs that had gates.
    expect(stats.gateTouched).toBeGreaterThan(100);
  });

  /**
   * **R7-D1 × R7-d · the placeholder hold WINS over the widened trigger.**
   *
   * Owner-confirmed in the same breath as the widening: a register of unenumerated placeholders must
   * *"hold the reversion"*. So the two fail-safes are ordered rather than merged — the continuing-line
   * test may say *no line continues*, and the answer is still **held**, because a placeholder's
   * `lineageLink` is where the register hangs a branch and says nothing about the lines of the people it
   * stands for. Under `ZUHUR_ONLY` least of all, where the answer turns on each unrecorded person's own
   * chain of links.
   *
   * The population is the widening's own register — a DECEASED `DAUGHTER` root above living issue, which
   * without a placeholder TRIGGERS (the property two above) — with `WITH_PLACEHOLDER` forcing index 0.
   * Nothing may be paid, and the run must say *unenumerated* rather than *living*, because on some of
   * these registers the enumerated survivors are on broken lines and "descendants are living on a line
   * this deed continues" would be false.
   */
  it('R7-D1 × R7-d · a placeholder holds the reversion even when NO line continues', () => {
    const stats = { runs: 0, withLivingSurvivors: 0, charityPaid: 0 };

    fc.assert(
      fc.property(
        arbReversionRunInput({
          liveness: 'LIVING_BUT_NONE_ENTITLED',
          composition: 'WITH_PLACEHOLDER',
          order: 'LINEAGE_CONTINUATION',
          continuation: 'ZUHUR_ONLY',
          minBloodline: 2,
          maxBloodline: 5,
        }),
        (kase) => {
          const { input, takerIds, expectApplied, expectHeldByPlaceholder } = kase;
          // No line continues — and the reversion must still be HELD, by the placeholder.
          expect(kase.continuingBloodlineIds).toStrictEqual([]);
          expect(kase.unenumeratedBloodlineIds.length).toBeGreaterThan(0);
          expect(expectApplied).toBe(false);
          expect(expectHeldByPlaceholder).toBe(true);

          const outcome = runOutcome(input);
          expect(
            outcome.ok,
            outcome.ok ? '' : `unexpected ${outcome.code}/${outcome.refusal}`,
          ).toBe(true);
          if (!outcome.ok) return;
          const { result } = outcome;
          stats.runs += 1;
          if (kase.livingBloodlineIds.length > 0) stats.withLivingSurvivors += 1;

          assertConservation(input, result);

          const takerTotal = result.lines
            .filter((line) => takerIds.includes(line.beneficiaryId))
            .reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
          if (takerTotal !== 0n) stats.charityPaid += 1;
          expect(takerTotal).toBe(0n);
          expect(result.totals.retainedMinor).toBe(result.waterfall.distributableMinor);
          expect(result.flags).toContain('REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED');
          expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
          // ⚠ And it must NOT say the other thing: on this register the enumerated survivors sit on
          // broken lines, so "descendants are living on a line this deed continues" is false and a
          // Nazir reading it would look for a family the register does not contain.
          expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
          for (const id of takerIds) {
            const line = result.lines.find((entry) => entry.beneficiaryId === id);
            expect(line?.reasonCode, id).toBe('REVERSION_PENDING_BLOODLINE_UNENUMERATED');
          }
        },
      ),
      config(RUNS_SINGLE_RUN),
    );

    expect(stats.runs).toBeGreaterThan(800);
    // THE SAFETY COUNTER: not one charity took a halala on a register nobody had enumerated, even with
    // the widened trigger saying the recorded lines were over.
    expect(stats.charityPaid).toBe(0);
    // …and the interaction was genuinely exercised: these registers hold LIVING blood descendants, which
    // is the configuration the widening created and the placeholder rule then overrode.
    expect(stats.withLivingSurvivors).toBeGreaterThan(800);
  });

  /**
   * **The reversion is RECOMPUTED every period, and nothing downstream caches the pending exclusion.**
   *
   * ⚠ That per-period recomputation is a **choice, not a finding** — see ADR-0009's R7 open questions. A
   * classical مآل clause may be final once the family leg is extinguished, in which case a later-recorded
   * birth should NOT take the endowment back off the charity; here it does. Nobody has been asked. The
   * property pins the behaviour that ships so the question stays visible instead of being settled by
   * whichever way the code happens to run.
   *
   * The third run is the anti-caching half: re-running the ORIGINAL input after the mutated one must give
   * byte-identical bytes back. A memoized `PENDING` verdict would pass the first two assertions.
   *
   * ⚠ **`composition: 'ENUMERATED_ONLY'` (R7-D1).** The claim is *"one death later the register REVERTS"*,
   * and that is only true of a register in which every record is an enumerated person. Kill the last
   * survivor on a placeholder-bearing register and the reversion is still HELD — correctly: nobody has
   * enumerated the placeholder's generation, so the family is not known to be over. On the default
   * `'DRAWN'` this property was silently asserting the reversion over both, and the placeholder half is
   * now its own test immediately below rather than an accident of the draw.
   */
  it('one death later the same ENUMERATED register reverts, and the pending state is never cached', () => {
    const stats = { pairs: 0, exactlyOneLiving: 0 };

    fc.assert(
      fc.property(
        arbReversionRunInput({
          liveness: 'MIXED',
          composition: 'ENUMERATED_ONLY',
          order: 'LINEAGE_CONTINUATION',
          continuation: 'ZUHUR_AND_BUTUN',
          minBloodline: 2,
          maxBloodline: 5,
        }),
        ({ input, takerIds, bloodlineIds, livingBloodlineIds, expectApplied }) => {
          if (expectApplied || livingBloodlineIds.length === 0) return;

          const before = runOutcome(input);
          expect(before.ok).toBe(true);
          if (!before.ok) return;

          // Every remaining death, in one step — "the bloodline is over" is the whole trigger, and with
          // one survivor left this really is *one* death later.
          const after = runOutcome(
            livingBloodlineIds.reduce<DistributionInputRaw>(
              (running, id) => withMemberDeceased(running, id),
              input,
            ),
          );
          expect(after.ok).toBe(true);
          if (!after.ok) return;
          stats.pairs += 1;
          if (livingBloodlineIds.length === 1) stats.exactlyOneLiving += 1;

          // The pool is untouched: a death changes the SPLIT, never the waterfall.
          expect(after.result.waterfall).toStrictEqual(before.result.waterfall);

          expect(before.result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
          expect(after.result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

          const takerTotal = (result: DistributionResult): bigint =>
            result.lines
              .filter((line) => takerIds.includes(line.beneficiaryId))
              .reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
          expect(takerTotal(before.result)).toBe(0n);
          expect(takerTotal(after.result)).toBe(
            after.result.waterfall.distributableMinor as bigint,
          );

          // And no descendant holds a halala on the reverted run.
          for (const line of after.result.lines) {
            if (!bloodlineIds.includes(line.beneficiaryId)) continue;
            expect(line.entitledMinor as bigint).toBe(0n);
          }

          // ── nothing cached: the original register still reads PENDING, byte for byte ──
          const again = runOutcome(input);
          expect(again.ok).toBe(true);
          if (again.ok) expect(again.result).toStrictEqual(before.result);
        },
      ),
      config(RUNS_PAIRED),
    );

    expect(stats.pairs).toBeGreaterThan(200);
    // Without this the property would only ever have tested "kill everyone at once".
    expect(stats.exactlyOneLiving).toBeGreaterThan(20);
  });

  /**
   * **R7-D1 · THE MIRROR OF THE TEST ABOVE, AND THE HALF THAT PAID A CHARITY 27,500,000 HALALAS.**
   *
   * The same paired transition — a living register, then every survivor deceased — over a register that
   * carries a `CATEGORY_ONLY` **placeholder** for a generation nobody has enumerated. The last death must
   * NOT hand the endowment to the charity: *a placeholder is sound evidence FOR a living bloodline and no
   * evidence at all AGAINST one*, so its `active: false` records that a placeholder is not in force, never
   * anybody's death.
   *
   * ⚠ **The pre-fix measurement, so the direction of this test is not a preference.** R6-D1's cohort
   * verbatim — two inactive placeholders (derived ṭabaqāt 1 → 2) plus one named ultimate taker, `ORDERED` —
   * paid the charity **27,500,000 of 27,500,000 halalas** with `I-R1` reported as checked. That is R6-D1's
   * measured payload restored one `reversion` field later.
   *
   * ⚠⚠ **R7-D2 (see P13.1's note): the `after` run currently does not EMIT at all** — the resolver holds the
   * trigger while `invariants.independentReversionState` still recomputes it as fired, so `I-R1`'s flag
   * cross-check refuses the run. No halala moves, which is what this property asserts; the retained-pool
   * CONTRACT is pinned red in `reversion-adversarial.test.ts` §7.
   */
  it('R7-D1 · the last death on a PLACEHOLDER-bearing register does NOT hand it to the charity', () => {
    const stats = { pairs: 0, afterEmitted: 0, afterNotEmitted: 0, charityPaid: 0 };

    fc.assert(
      fc.property(
        arbReversionRunInput({
          liveness: 'MIXED',
          composition: 'WITH_PLACEHOLDER',
          order: 'LINEAGE_CONTINUATION',
          continuation: 'ZUHUR_AND_BUTUN',
          minBloodline: 2,
          maxBloodline: 5,
        }),
        ({ input, takerIds, livingBloodlineIds, unenumeratedBloodlineIds, expectApplied }) => {
          // The generator's premise, asserted at the point of use: a placeholder really is on record and
          // the register really does start out with a living descendant.
          expect(unenumeratedBloodlineIds.length).toBeGreaterThan(0);
          if (expectApplied || livingBloodlineIds.length === 0) return;

          const before = runOutcome(input);
          expect(before.ok, before.ok ? '' : `unexpected ${before.code}`).toBe(true);
          if (!before.ok) return;
          // Nothing to the charity while a descendant lives — the ordinary hold, and the control that
          // makes the `after` half a statement about the last death rather than about the whole register.
          const takerTotal = (result: DistributionResult): bigint =>
            result.lines
              .filter((line) => takerIds.includes(line.beneficiaryId))
              .reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
          expect(takerTotal(before.result)).toBe(0n);

          const after = runOutcome(
            livingBloodlineIds.reduce<DistributionInputRaw>(
              (running, id) => withMemberDeceased(running, id),
              input,
            ),
          );
          stats.pairs += 1;

          if (!after.ok) {
            stats.afterNotEmitted += 1;
            // ⚠ R7-D2, measured by name so a different failure cannot hide inside "it threw".
            expect(after.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
            return;
          }
          stats.afterEmitted += 1;
          if (takerTotal(after.result) !== 0n) stats.charityPaid += 1;
          expect(takerTotal(after.result)).toBe(0n);
          expect(after.result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
          expect(after.result.totals.retainedMinor).toBe(after.result.waterfall.distributableMinor);
        },
      ),
      config(RUNS_PAIRED),
    );

    // The transition was actually driven, and NOT ONCE did the last death pay the charity.
    expect(stats.pairs).toBeGreaterThan(200);
    expect(stats.charityPaid).toBe(0);
  });

  /**
   * **R7-b · (d) a jiha on a ذري waqf that the deed does NOT record as its ultimate taker is refused.**
   *
   * Both halves of the narrowing, so it cannot be satisfied by a refusal that simply got wider or one that
   * got looser:
   *
   *  · `reversion: null` — the pre-R7 record. Still refused: R7-c forbids inferring a مآل from a charity's
   *    mere presence in the cohort.
   *  · a clause naming only SOME of the jihas — the predicate is `every`, not `some`, because one unnamed
   *    charity beside named ones is still a charity paid concurrently with the family.
   *
   * ⚠ **WHICH discriminator is derived from the cohort, not asserted as one code.** With a `FAMILY` member
   * present `COHORT_MIXES_CHARITABLE_AND_FAMILY` fires first; with only `CATEGORY_ONLY` placeholders it is
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` — R6-D1's own route, which the mixed-cohort check cannot see because
   * it needs `familyCount > 0`. A property asserting one code would have passed while the OTHER route went
   * unproven, which is how a refusal quietly stops proving anything.
   */
  it('R7-b · an unnamed charity on a ذري waqf still refuses — with a clause and without one', () => {
    const stats = { nullClause: 0, someNamed: 0, mixedCohortRoute: 0, jihaOnFamilyRoute: 0 };

    for (const clause of ['NULL', 'NAMES_SOME_JIHAS'] as const) {
      fc.assert(
        fc.property(
          fc.constantFrom(...MONEY_ORDERS).chain((order) =>
            arbReversionRunInput({
              liveness: 'MIXED',
              order,
              clause,
              // `NAMES_SOME_JIHAS` needs two jihas to leave one unnamed while the named set stays
              // non-empty (an empty list is a different refusal with its own generator).
              minTakers: 2,
              maxTakers: 2,
            }),
          ),
          ({ input, clause: shape, unnamedJihaIds, hasFamilyMember }) => {
            expect(input.reversion === null).toBe(shape === 'NULL');
            expect(unnamedJihaIds.length).toBeGreaterThan(0);

            const outcome = runOutcome(input);
            expect(outcome.ok, 'an unnamed charity on a ذري waqf must refuse').toBe(false);
            if (outcome.ok) return;
            expect(outcome.code).toBe('SHART_INCOMPLETE');
            // Derived from the register, exactly as the engine's precedence derives it.
            const expected = hasFamilyMember
              ? 'COHORT_MIXES_CHARITABLE_AND_FAMILY'
              : 'CHARITABLE_JIHA_ON_FAMILY_WAQF';
            expect(outcome.refusal).toBe(expected);
            if (expected === 'COHORT_MIXES_CHARITABLE_AND_FAMILY') stats.mixedCohortRoute += 1;
            else stats.jihaOnFamilyRoute += 1;
            if (shape === 'NULL') stats.nullClause += 1;
            else stats.someNamed += 1;
          },
        ),
        config(RUNS_SMALL),
      );
    }

    expect(stats.nullClause).toBeGreaterThan(200);
    expect(stats.someNamed).toBeGreaterThan(200);
    // BOTH routes must be walked. The placeholder-only route is R6-D1's, and it is the one that was
    // invisible to every check until R6-C1 built a generator for it.
    expect(stats.mixedCohortRoute).toBeGreaterThan(100);
    expect(stats.jihaOnFamilyRoute).toBeGreaterThan(10);
  });

  /**
   * R7's **eight** new refusals, each generated deliberately and each asserting its own discriminator.
   *
   * `SHART_REFUSALS` now holds twenty-six members sharing one error code, so a property that checked only
   * `SHART_INCOMPLETE` could pass while the engine refused for a reason it was not about — which is exactly
   * how R5's joint refusal would once have silently absorbed every pre-existing refusal property here.
   *
   * The arbitrary also proves a **precedence** rule rather than relying on it: every arm builds a cohort
   * that would otherwise halt on a COHORT refusal, and requires the REVERSION discriminator instead —
   * because three cohort refusals grant an exemption on the strength of the clause, and an exemption
   * granted on an unreadable clause is how a refusal becomes a payout.
   */
  it('every illegible or unusable مآل clause halts with its own discriminator', () => {
    const seen = new Map<string, number>();
    const directUse = new Map<string, number>();

    fc.assert(
      fc.property(arbReversionRefusalCase, ({ input, refusal }) => {
        const outcome = runOutcome(input);
        expect(outcome.ok, `${refusal} must refuse`).toBe(false);
        if (outcome.ok) return;
        expect(outcome.code).toBe('SHART_INCOMPLETE');
        expect(outcome.refusal).toBe(refusal);
        seen.set(refusal, (seen.get(refusal) ?? 0) + 1);
        if (input.entitlementOrder === 'NA_DIRECT_USE') {
          directUse.set(refusal, (directUse.get(refusal) ?? 0) + 1);
        }
      }),
      config(RUNS_SINGLE_RUN),
    );

    for (const refusal of [
      'REVERSION_ON_CHARITABLE_WAQF',
      'REVERSION_KIND_UNRECOGNISED',
      'REVERSION_WITH_NO_ULTIMATE_TAKER',
      'REVERSION_ULTIMATE_TAKER_DUPLICATED',
      'REVERSION_ULTIMATE_TAKER_UNKNOWN',
      'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
      'REVERSION_WITH_NO_RECORDED_BLOODLINE',
      'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
    ] as const) {
      expect(seen.get(refusal) ?? 0, `${refusal} was never generated`).toBeGreaterThan(20);
    }
    // The Stage-0 arms outrank I7's direct-use short-circuit — the strongest form of the claim, and
    // only assertable because `assertReversionLegible` runs before the short-circuit rather than after.
    for (const refusal of [
      'REVERSION_ON_CHARITABLE_WAQF',
      'REVERSION_KIND_UNRECOGNISED',
      'REVERSION_WITH_NO_ULTIMATE_TAKER',
      'REVERSION_ULTIMATE_TAKER_DUPLICATED',
      'REVERSION_ULTIMATE_TAKER_UNKNOWN',
      'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
    ] as const) {
      expect(
        directUse.get(refusal) ?? 0,
        `${refusal} was never proven against a direct-use waqf`,
      ).toBeGreaterThan(2);
    }
    // And the two Stage-2 arms must NOT have been generated on a direct-use waqf: that run returns
    // before the graph is built, so it never reaches either, and a non-zero count here would mean the
    // generator is producing inputs whose refusal it cannot honestly predict.
    expect(directUse.get('REVERSION_WITH_NO_RECORDED_BLOODLINE') ?? 0).toBe(0);
    expect(directUse.get('ULTIMATE_TAKER_WEIGHTS_UNUSABLE') ?? 0).toBe(0);
  });

  /**
   * `ULTIMATE_TAKER_WEIGHTS_UNUSABLE` **against its control**: the same triggered register with one weight
   * changed from `'0'` to `'7'` must PAY.
   *
   * Without the control, "the engine refuses an all-zero taker vector" is satisfied by an engine that
   * refuses every reverted run — and R7-a's whole point is the reverted run working. The refusal also must
   * not be a silent equal split (R7-e: per capita is the bloodline's rule, not a charity's) and must not
   * fall through to `NO_ELIGIBLE_BENEFICIARIES`, which would hide an unusable deed record behind an
   * ordinary flag and retain the pool as though the deed were fine.
   */
  it('an all-zero ultimate-taker weight vector refuses; one real weight pays the whole pool', () => {
    const stats = { refused: 0, controlPaid: 0 };

    fc.assert(
      fc.property(arbUltimateTakerWeightsUnusableCase, ({ input, control, controlTakerId }) => {
        const refused = runOutcome(input);
        expect(refused.ok, 'an all-zero taker vector must refuse').toBe(false);
        if (!refused.ok) {
          expect(refused.code).toBe('SHART_INCOMPLETE');
          expect(refused.refusal).toBe('ULTIMATE_TAKER_WEIGHTS_UNUSABLE');
          stats.refused += 1;
        }

        const computed = runOutcome(control);
        expect(computed.ok, 'the same register with one real weight must COMPUTE').toBe(true);
        if (!computed.ok) return;
        const line = computed.result.lines.find((l) => l.beneficiaryId === controlTakerId);
        expect(line).toBeDefined();
        if (line === undefined) return;
        expect(line.entitledMinor).toBe(computed.result.waterfall.distributableMinor);
        expect(line.basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
        expect(computed.result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
        stats.controlPaid += 1;
      }),
      config(RUNS_SMALL),
    );

    expect(stats.refused).toBeGreaterThan(200);
    // The load-bearing count: the refusal is about the weight vector, not about reverted runs.
    expect(stats.controlPaid).toBeGreaterThan(200);
  });

  /**
   * **R7-f · I5's untiered exemption has a reachable subject again — and this is that subject.**
   *
   * Before R7 no cohort the engine admitted could hold a tiered member and an untiered one at once (on a
   * ذري waqf everyone carries an edge and therefore a derived ṭabaqa; on a خيري waqf nobody may carry
   * either). So `isTiered()`'s exemption, and invariant I5's, were **vacuous in the money path** and the
   * property that used to chase them was reduced to counting zero.
   *
   * A tiered bloodline plus an UNTIERED recorded ultimate taker is now legal, and it is the case that must
   * **not** be tier-excluded: a taker is decided by the reversion clause, and `UPPER_TABAQA_EXTANT` /
   * `TABAQA_EXTINCT` would be a false statement about a charity that is in no generation at all. Both
   * halves are asserted — the exemption while the family lives, and the payout once it does not.
   */
  it('R7-f · an untiered ultimate taker beside tiered descendants is never TIER-excluded (I5)', () => {
    const stats = { pending: 0, applied: 0, tieredDescendants: 0 };

    // ⚠ `composition` is paired to `liveness` (R7-D1). The APPLIED half needs a register whose extinction
    // can be certified, so `ALL_DECEASED` is drawn `ENUMERATED_ONLY`; the PENDING half is drawn `DRAWN`,
    // where placeholders and named members mix freely, because the tier-exemption claim does not depend on
    // composition while somebody lives. A placeholder-bearing extinct register has no lines to make the
    // claim about at all (R7-D2), so including it here would only add vacuous iterations.
    for (const [liveness, composition] of [
      ['MIXED', 'DRAWN'],
      ['ALL_DECEASED', 'ENUMERATED_ONLY'],
    ] as const) {
      fc.assert(
        fc.property(
          arbReversionRunInput({
            liveness,
            composition,
            order: 'ORDERED',
            minBloodline: 2,
            maxBloodline: 5,
            minTakers: 1,
            maxTakers: 1,
          }),
          ({ input, takerIds, bloodlineIds, expectApplied }) => {
            const outcome = runOutcome(input);
            expect(outcome.ok, outcome.ok ? '' : `unexpected ${outcome.refusal}`).toBe(true);
            if (!outcome.ok) return;
            const { result } = outcome;

            // The cohort really is tiered — otherwise the claim has no subject and the exemption is
            // being "proven" over a cohort with no generations in it.
            const tiered = result.lines.filter(
              (line) => bloodlineIds.includes(line.beneficiaryId) && line.basis.tabaqa !== null,
            );
            expect(tiered.length).toBeGreaterThan(0);
            stats.tieredDescendants += 1;

            for (const line of result.lines) {
              if (!takerIds.includes(line.beneficiaryId)) continue;
              // ⚠ The exemption, positively: a charity is in no ṭabaqa, so no tier verdict may be
              // published against it — whatever the family's tiers are doing.
              expect(line.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
              expect(line.reasonCode).not.toBe('TABAQA_EXTINCT');
              expect(line.basis.tabaqa).toBeNull();
              if (expectApplied) {
                expect(line.status).not.toBe('EXCLUDED');
                expect(line.entitledMinor).toBe(result.waterfall.distributableMinor);
              } else {
                expect(line.reasonCode).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
                expect(line.entitledMinor as bigint).toBe(0n);
              }
            }
            // I5 is genuinely asserted on these runs — the exemption is not being reported as checked
            // over a run that had no tiered line to check.
            expect(result.invariantsChecked).toContain('I5');
            if (expectApplied) stats.applied += 1;
            else stats.pending += 1;
          },
        ),
        config(RUNS_SINGLE_RUN),
      );
    }

    expect(stats.tieredDescendants).toBeGreaterThan(1_500);
    expect(stats.pending).toBeGreaterThan(500);
    expect(stats.applied).toBeGreaterThan(500);
  });

  /**
   * ✓✓ **INVERTED — ESC-2 IS CLOSED BY RULING (memo Q7, product owner 2026-08-17).**
   *
   * What this property asserted, and it was true of that engine: *"a tiered ultimate taker on a ذري
   * DIRECT-USE waqf **computes**, contradiction unreported. I7's short-circuit returns before
   * `assertJihaNotTiered`, so the deed record's self-contradiction (a charity sitting in a generational
   * tier) goes unreported. No halala moves … but the contradiction is silently accepted. This is the same
   * precedence question `CHARITABLE_JIHA_ON_FAMILY_WAQF` answered one way (refuse before the short-circuit)
   * and `JIHA_TIERED` answers the other (after it). **It is the product owner's to settle, and engineering
   * must not settle it silently in two directions** … If the owner decides the record must refuse, this test
   * inverts; that is the point of writing it down rather than leaving the cell blank."*
   *
   * He decided the record must refuse — **validity precedes short-circuits: a record that cannot describe a
   * real endowment halts even when nothing would be paid** — so the test inverts exactly as it said it
   * would. Same generator, same construction, opposite verdict, and the discriminator is asserted by name
   * because this input clears four other refusals on its way to the guard.
   */
  it('✓ ESC-2 CLOSED · a tiered ultimate taker on a ذري DIRECT-USE waqf is now REFUSED JIHA_TIERED', () => {
    const stats = { refused: 0 };

    fc.assert(
      fc.property(
        arbDistributionInput(),
        arbTieredUltimateTakerCase,
        (base, { beneficiaries, reversion, tabaqa, tieredTakerId }) => {
          const outcome = runOutcome({
            ...base,
            waqfType: 'FAMILY_DHURRI',
            entitlementOrder: 'NA_DIRECT_USE',
            continuationStipulation: null,
            beneficiaries: [...beneficiaries],
            reversion,
            operatingCostMinor: 0n,
            maintenance: { kind: 'NONE' },
            nazirFee: null,
          });

          expect(outcome.ok, 'a self-contradicting record must halt, payable or not').toBe(false);
          if (outcome.ok) return;
          stats.refused += 1;
          expect(tabaqa).toBeGreaterThan(0);
          // Never a bare SHART_INCOMPLETE: this input passes JOINT, the reversion legibility checks, the
          // three narrowed cohort refusals and the two خيري-only rules before reaching the guard.
          expect(outcome.code).toBe('SHART_INCOMPLETE');
          expect(outcome.refusal).toBe('JIHA_TIERED');
          // …and the offender is named, so an operator knows which field to correct.
          expect(outcome.message).toContain(tieredTakerId);
        },
      ),
      config(RUNS_SMALL),
    );

    expect(stats.refused).toBeGreaterThan(200);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * P12 · The generator census — the blind-spot detector itself
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * **The lesson this whole file exists to hold: a property whose generator cannot reach a
 * configuration reports its silence as success, at scale.**
 *
 * This repo learned it twice, both measured. 10 000 generated runs stayed green while a hand-built
 * `FAMILY_DHURRI` cohort paid a charity **27,500,000 of 27,500,000 halalas** (R6-D1) — because no
 * generator emitted that pair. `JIHA_TIERED` looked covered for the same reason and was not. Both were
 * found by reading, not by the suite.
 *
 * Every other property here asserts that the ENGINE behaves. This one asserts that the GENERATORS
 * reach — over the five closed vocabularies the engine refuses on, and over the refusal vocabulary
 * itself. It is the only test in the file whose failure means "the suite has gone quiet" rather than
 * "the engine is wrong", and it is written so that adding a refusal to `contract.ts` without a
 * generator fails immediately and by name.
 */
describe('P12 — the generators reach every shape the engine has an opinion about', () => {
  /**
   * Refusals with no generator, each with the reason it has none. **A refusal may only appear here
   * with a stated reason** — the assertion below is `SHART_REFUSALS \ observed === keys(this)`, so a
   * new refusal that nobody generated fails by name, and a refusal that becomes reachable and stays
   * listed here fails too.
   */
  const REFUSALS_WITH_NO_ENGINE_GENERATOR: Readonly<Record<string, string>> = {
    /** Defensive arm: reachable only if a Stage-0 nature refusal were bypassed first. */
    ENTITLEMENT_RULE_UNMAPPED:
      'a defensive arm of `entitlementRuleFor`; every path to it is refused earlier by design',
    /** `assertInputConsistency` refuses a duplicate id at the contract door (`*_INPUT_INVALID`). */
    BENEFICIARY_ID_DUPLICATED:
      'refused at the contract door as DISTRIBUTION_INPUT_INVALID; the discriminator exists for direct resolver callers',
    /*
     * ⚠⚠ **TWO ENTRIES ARE GONE FROM THIS LIST, AND THAT IS THE FINDING OF THE R7 PASS.** Both are
     * refusals that had *stopped* being reachable and are reachable again — the direction nobody watches,
     * because an exemption entry only ever looks like tidy bookkeeping.
     *
     * ── `JIHA_TIERED` · removed. Its entry read, verbatim: ────────────────────────────────────────
     *   "`assertJihaNotTiered` can no longer be reached through `runDistribution` — or through
     *    `resolveEntitlement` — by any input at all. `TABAQA_ON_CHARITABLE_WAQF` (product owner,
     *    2026-08-03) generalises its rule along the waqf axis and is checked at Stage 0, and the other
     *    two waqf types were already spoken for:
     *        PUBLIC_CHARITABLE ⇒ TABAQA_ON_CHARITABLE_WAQF   (or COHORT_MIXES… beside a FAMILY member)
     *        FAMILY_DHURRI     ⇒ CHARITABLE_JIHA_ON_FAMILY_WAQF (R6-D1; or COHORT_MIXES…)
     *        JOINT             ⇒ WAQF_TYPE_JOINT_NOT_SUPPORTED
     *    `WAQF_TYPES` has exactly three members and the schema enforces it, so that is exhaustive."
     *
     * That entry even predicted its own end: *"R6-D1 is under active review ('a ذري deed may be permitted
     * to name a charity'); if it is removed, `FAMILY_DHURRI` + a tiered jiha reaches this guard again."*
     * R7 is that review's answer. `CHARITABLE_JIHA_ON_FAMILY_WAQF` is now conditional, so a **recorded
     * ultimate taker** carrying a `tabaqa` walks past every Stage-0 check and lands on the guard at
     * Stage 2 — generated by `arbTieredUltimateTakerCase` / `arbRefusedNatureInput` pick 5.
     *
     * ── `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` · removed. Its entry read: ─────────────────────────────
     *   "unreachable through runDistribution since ESC-1; generated and asserted against buildLineage
     *    directly."
     *
     * The reasoning was that the only member allowed outside the family tree is a `CHARITABLE_JIHA`, and a
     * jiha's waqf must be خيري, where ESC-1 refuses the orphaned subtree's own lineage links at Stage 0.
     * **R7 gives a jiha a legal seat on a ذري waqf**, so a descendant whose `parentId` points at the taker
     * hangs off something that is not the waqif's line and the walk refuses it through the front door.
     * `arbMalformedLineageInput` case 7 builds it with `route: 'ENGINE'`; case 3's خيري shape is kept as
     * `'BUILD_LINEAGE_ONLY'`, because *that* shape really is still unreachable.
     *
     * Neither was found by this suite. Both were found by asking, refusal by refusal, *"did R7 change what
     * reaches this?"* — which is why the list below must never be edited without that question being asked.
     */
  };

  it('reaches every SHART_INCOMPLETE refusal, or names the reason it cannot', () => {
    const observed = new Set<string>();

    const record = (input: DistributionInputRaw): void => {
      const outcome = runOutcome(input);
      if (!outcome.ok && outcome.refusal !== null) observed.add(outcome.refusal);
    };

    fc.assert(
      fc.property(arbRefusedNatureInput, ({ input }) => {
        record(input);
      }),
      config(RUNS_SMALL),
    );
    fc.assert(
      fc.property(arbMalformedLineageInput, ({ input, route }) => {
        if (route === 'ENGINE') record(input);
      }),
      config(RUNS_SMALL),
    );
    fc.assert(
      fc.property(arbDistributionInput(), arbCharitablePlaceholderCase, (base, placeholder) => {
        record(placeholder.input(base));
      }),
      config(RUNS_SMALL),
    );
    fc.assert(
      fc.property(arbDescendantOnCharitableWaqfCase, ({ input }) => {
        record(input);
      }),
      config(RUNS_SMALL),
    );
    fc.assert(
      fc.property(arbCharitableJihaOnFamilyWaqfCase, ({ input }) => {
        record(input);
      }),
      config(RUNS_SMALL),
    );
    // R7 · the eight مآل refusals, and the two the reversion brought back into reach.
    fc.assert(
      fc.property(arbReversionRefusalCase, ({ input }) => {
        record(input);
      }),
      config(RUNS_SINGLE_RUN),
    );
    // The Shart's own legibility — an order outside the closed four.
    fc.assert(
      fc.property(arbDistributionInput(), (base) => {
        record({ ...base, entitlementOrder: 'MURATTAB' });
      }),
      config(RUNS_SMALL),
    );

    const missing = SHART_REFUSALS.filter((refusal) => !observed.has(refusal)).sort();
    expect(
      missing,
      'every refusal must have a generator, or be listed with the reason it cannot have one',
    ).toEqual(Object.keys(REFUSALS_WITH_NO_ENGINE_GENERATOR).sort());
    // And nothing may be parked in the exemption list that is in fact reachable.
    for (const refusal of Object.keys(REFUSALS_WITH_NO_ENGINE_GENERATOR)) {
      expect(
        observed.has(refusal),
        `${refusal} is reachable and must leave the exemption list`,
      ).toBe(false);
    }
  });

  /**
   * The other half: over the GENERAL arbitrary, every legal cell of the closed vocabularies is
   * reached with a stated minimum, and every refused cell is reached ZERO times.
   *
   * The zero counts are as load-bearing as the minimums. A guaranteed refusal inside the general
   * arbitrary buys one throw at the price of the whole run budget — and, worse, it makes the
   * conservation properties pass on inputs that never computed. The exact-zero assertions are what
   * keeps the refused shapes confined to the refusal arbitraries where P10 proves them.
   */
  it('covers every legal vocabulary cell, and produces no refused cell, in the general arbitrary', () => {
    const census = {
      waqfType: { PUBLIC_CHARITABLE: 0, FAMILY_DHURRI: 0, JOINT: 0 },
      order: { LINEAGE_CONTINUATION: 0, ORDERED: 0, SHARED: 0, NA_DIRECT_USE: 0, OTHER: 0 },
      continuation: { ZUHUR_ONLY: 0, ZUHUR_AND_BUTUN: 0, NULL: 0, OTHER: 0 },
      kind: { FAMILY: 0, CHARITABLE_JIHA: 0, CATEGORY_ONLY: 0 },
      link: { SON: 0, DAUGHTER: 0, NULL_ON_DESCENDANT_KIND: 0, OTHER: 0 },
      // The four cells that must never appear together in a computing input (ADR-0009 R5 + ESC-1).
      mixedCohort: 0,
      jihaOnFamilyWaqf: 0,
      descendantOnCharitableWaqf: 0,
      jihaCarryingLineageEdge: 0,
      jihaCarryingTabaqa: 0,
      // A ذري cohort holding a placeholder is LEGAL and must stay reachable — it is the register
      // R6-D1's control depends on, and the one a real not-yet-enumerated generation is recorded as.
      placeholderOnFamilyWaqf: 0,
      emptyCohort: 0,
      /**
       * R7 · coupling 9, as a checked fact rather than a convention.
       *
       * A مآل clause is only legal where a `CHARITABLE_JIHA` sits inside a ذري cohort, which this
       * generator's two exhaustive branches cannot produce — so a reversion here would be a guaranteed
       * refusal on **every** draw and P1/P2/P7/P8 would all go red for a reason that has nothing to do
       * with the invariants they are about. That is not hypothetical: it is exactly what
       * `arbCharitableCohort`'s `lineageLink` fiction did before ESC-1×R6 (see
       * `descendantOnCharitableWaqf` below, the one cell that WAS non-zero). Pinned at zero here; the
       * reversion population is censused by P13's own coverage counters.
       */
      reversionRecorded: 0,
    };

    fc.assert(
      fc.property(arbDistributionInput(), (input) => {
        census.waqfType[input.waqfType] += 1;

        const order = input.entitlementOrder;
        if ((ENTITLEMENT_ORDERS as readonly string[]).includes(order)) {
          census.order[order as (typeof ENTITLEMENT_ORDERS)[number]] += 1;
        } else census.order.OTHER += 1;

        const stipulation = input.continuationStipulation;
        if (stipulation === null) census.continuation.NULL += 1;
        else if ((CONTINUATION_STIPULATIONS as readonly string[]).includes(stipulation)) {
          census.continuation[stipulation as (typeof CONTINUATION_STIPULATIONS)[number]] += 1;
        } else census.continuation.OTHER += 1;

        let hasJiha = false;
        let hasFamily = false;
        let hasDescendant = false;
        let hasPlaceholder = false;
        for (const member of input.beneficiaries) {
          census.kind[member.kind] += 1;
          if (member.kind === 'CHARITABLE_JIHA') {
            hasJiha = true;
            if (member.lineageLink !== null || member.parentId !== null) {
              census.jihaCarryingLineageEdge += 1;
            }
            if (member.tabaqa !== null) census.jihaCarryingTabaqa += 1;
          }
          if (member.kind === 'FAMILY') hasFamily = true;
          if (member.kind === 'CATEGORY_ONLY') hasPlaceholder = true;

          const link = member.lineageLink;
          if (link === null) {
            if (member.kind !== 'CHARITABLE_JIHA') census.link.NULL_ON_DESCENDANT_KIND += 1;
          } else if ((LINEAGE_LINKS as readonly string[]).includes(link)) {
            census.link[link as (typeof LINEAGE_LINKS)[number]] += 1;
            hasDescendant = true;
          } else {
            census.link.OTHER += 1;
            hasDescendant = true;
          }
        }

        if (hasJiha && hasFamily) census.mixedCohort += 1;
        if (input.waqfType === 'FAMILY_DHURRI' && hasJiha) census.jihaOnFamilyWaqf += 1;
        if (input.waqfType === 'PUBLIC_CHARITABLE' && hasDescendant) {
          census.descendantOnCharitableWaqf += 1;
        }
        if (input.waqfType === 'FAMILY_DHURRI' && hasPlaceholder) {
          census.placeholderOnFamilyWaqf += 1;
        }
        if (input.beneficiaries.length === 0) census.emptyCohort += 1;
        if (input.reversion !== null) census.reversionRecorded += 1;
      }),
      config(RUNS_LEAKAGE),
    );

    /* ── Legal cells: reached, with a minimum ────────────────────────────────────────────── */
    expect(census.waqfType.FAMILY_DHURRI).toBeGreaterThan(5_000);
    expect(census.waqfType.PUBLIC_CHARITABLE).toBeGreaterThan(1_000);
    expect(census.order.LINEAGE_CONTINUATION).toBeGreaterThan(1_000);
    expect(census.order.ORDERED).toBeGreaterThan(1_000);
    expect(census.order.SHARED).toBeGreaterThan(1_000);
    expect(census.order.NA_DIRECT_USE).toBeGreaterThan(200);
    expect(census.continuation.ZUHUR_ONLY).toBeGreaterThan(500);
    expect(census.continuation.ZUHUR_AND_BUTUN).toBeGreaterThan(500);
    expect(census.continuation.NULL).toBeGreaterThan(1_000);
    expect(census.kind.FAMILY).toBeGreaterThan(5_000);
    expect(census.kind.CATEGORY_ONLY).toBeGreaterThan(5_000);
    expect(census.kind.CHARITABLE_JIHA).toBeGreaterThan(1_000);
    expect(census.link.SON).toBeGreaterThan(5_000);
    expect(census.link.DAUGHTER).toBeGreaterThan(5_000);
    // Both structural extremes of the cohort, which several properties short-circuit on.
    expect(census.emptyCohort).toBeGreaterThan(100);
    expect(census.placeholderOnFamilyWaqf).toBeGreaterThan(2_000);
    // Every member of the two closed enums is a census key — so a member added to `contract.ts`
    // without a generator shows up as a key with no minimum rather than as silence.
    expect(Object.keys(census.waqfType).sort()).toEqual([...WAQF_TYPES].sort());
    expect(Object.keys(census.kind).sort()).toEqual([...BENEFICIARY_KINDS].sort());

    /* ── Refused cells: exactly zero, and confined to the refusal arbitraries ─────────────── */
    expect(census.waqfType.JOINT).toBe(0);
    expect(census.order.OTHER).toBe(0);
    expect(census.continuation.OTHER).toBe(0);
    expect(census.link.OTHER).toBe(0);
    // R6 — no descendant-kind member without its lineage fact, on any order.
    expect(census.link.NULL_ON_DESCENDANT_KIND).toBe(0);
    // R5 and its two derived refusals.
    expect(census.mixedCohort).toBe(0);
    expect(census.jihaOnFamilyWaqf).toBe(0);
    // ⚠ ESC-1's cell. This is the one that was NON-ZERO before this pass: `arbCharitableCohort`
    // minted `CATEGORY_ONLY` placeholders carrying a `lineageLink` on every خيري draw, so roughly a
    // fifth of the general arbitrary became a guaranteed `DESCENDANT_ON_CHARITABLE_WAQF` refusal and
    // P1, P2, P7 and P8 all went red. Pinned at zero so it cannot come back.
    expect(census.descendantOnCharitableWaqf).toBe(0);
    // S3-D3 and the jiha's edge ban.
    expect(census.jihaCarryingTabaqa).toBe(0);
    expect(census.jihaCarryingLineageEdge).toBe(0);
    // R7 · coupling 9. The reversion population is deliberately elsewhere — see the field's comment.
    expect(census.reversionRecorded).toBe(0);
  });
});
