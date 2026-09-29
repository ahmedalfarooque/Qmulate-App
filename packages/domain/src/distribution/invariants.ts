/**
 * `distribution/invariants.ts` — runtime assertion of §08's I1–I9, the corpus invariant I-C1, and
 * ADR-0009's per-capita invariant I-L1.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS, AND WHY IT RE-DERIVES INSTEAD OF RE-READING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every function here checks an assembled run *from the outside*. Where an invariant can be
 * recomputed from the ENGINE'S INPUT rather than from a stage's output, it is — because an assertion
 * built from the same intermediate the stage produced only restates the stage. Concretely:
 *
 *  · I5 recomputes the lowest living ṭabaqa from `input.beneficiaries`, **not** from
 *    `resolution.entitledTabaqa`, and — new in ADR-0009 — rebuilds the **parent graph** from
 *    `input.beneficiaries` to recheck the ẓuhūr/buṭūn verdict, rather than reading the resolver's
 *    `LineageIndex`. That makes I5 a check *on* the resolver rather than a paraphrase of it.
 *  · I6 recomputes the whole Hamilton split from the entitled cohort's **effective** weights, in
 *    bigint, from `input.beneficiaries` + the declared order — a **third** independent derivation
 *    (after `../money.js`'s `Decimal` allocator and `./allocate.ts`'s bigint one), and one that has
 *    no gate input at all.
 *  · I-L1 states the per-capita claim directly over the emitted amounts: the only load-bearing proof
 *    that R3 was applied.
 *  · **I-R1 (R7) rebuilds the extinction test from `input.beneficiaries`** — the deed's مآل clause plus
 *    each member's own `active` — and compares it with the published
 *    `REVERSION_TO_ULTIMATE_TAKER_APPLIED`. The flag is therefore *checkable* rather than trusted, and
 *    `ctx.flags` exists for that one purpose. Its universal mirror — **a charity is never paid a halala
 *    in the same run as any descendant** — is R5 as a runtime assertion and is the one claim here that
 *    holds whatever a future refusal is relaxed to.
 *  · I-C1 re-sums the INCOME and CAPITAL receipts from `input.revenue.receipts`, not from
 *    `waterfall.capitalReceiptsMinor`.
 *
 * A breach throws `DomainError('DISTRIBUTION_INVARIANT_BREACH')` naming the invariant id, so
 * **no partial, negative or self-inconsistent run is ever emitted**. Reaching one of these is an
 * engine defect, not bad data — bad data is refused earlier, by the schema, the corpus guard, the
 * resolver's `SHART_INCOMPLETE` and the waterfall's `DISTRIBUTION_NEGATIVE`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `invariantsChecked` IS AN HONEST LIST — READ THIS BEFORE ADDING TO IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * {@link assertInvariants} returns **only the ids it actually asserted on this run**. A false entry
 * there is worse than an absent one, because the next reader believes it. Two consequences:
 *
 *  · **I8 (determinism) is NEVER listed.** It is a statement about *two* runs
 *    (`runDistribution(x)` deep-equals `runDistribution(x)`, trace included) and is unprovable from
 *    one. Three code rules make it true — `asOf`/`deadline` are parameters (no clock), all ordering
 *    is `compareBeneficiaryIds` (never `localeCompare`), and `canonicalizeResult` sorts keys and
 *    renders bigints — and a property test in `__tests__` proves it over repeated runs. Nothing here
 *    can, so nothing here claims it.
 *  · **I5, I6, I7's monetary half, I-L1 and I-R1 are conditional**, and the conditions are stated at each
 *    call site. A run with no lines at all (the `NIL_DISTRIBUTION` short-circuit, which §08 specifies as
 *    `lines = []`) has no ordered-exclusion claim to check, so I5 is not listed for it.
 *  · ⚠ **I-L1 and I-R1 SWAP on a reverted run, and that swap is the point.** Once R7's reversion has
 *    triggered, the entitled lines are charitable ultimate takers splitting by deed weight, so
 *    "equal per head" makes no claim about the line that took the money: I-L1 goes into `notAsserted`
 *    and I-R1 is asserted instead. Reporting an invariant that says nothing about the paid line — while
 *    a reader takes the id in `invariantsChecked` as proof it was covered — is precisely the defect
 *    R6-I5 recorded, and this file has shipped it once already.
 *  · ✓ **I5's CLAIM IS SCOPED TO DESCENDANTS, BY RULING — memo Q1, product owner 2026-08-17.** I5 makes
 *    **no** claim about a recorded ultimate taker's line, on any order: on `ORDERED` the taker is
 *    untiered, and on `LINEAGE_CONTINUATION` it has an empty ancestor chain, so both branches skip it.
 *    That is **by design and not a gap**: an untiered ultimate taker is outside tier logic because it is
 *    not in the generational tree, and its line is guaranteed instead by **I-R1's universal mirror plus
 *    the taker's default exclusion** (`REVERSION_PENDING_LIVING_BLOODLINE`) — a *different* guarantee
 *    from I5's and a stronger one, because it holds whatever a future refusal is relaxed to. The owner
 *    ruled exactly this ("I-R1 is the guarantee"), which is why the sentence now **claims** the scoping
 *    rather than flagging it as the R6-I5 honesty gap. What must never be written here is a sentence
 *    saying I5 covers the jiha line: it does not, it is not meant to, and G-9 clause 3's certification
 *    names I-R1 for that half.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHERE AN ASSERTION IS WEAK, IT SAYS SO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **I1 is a tautology at runtime.** `computeWaterfall` derives `distributableMinor` *as* the
 * remainder `revenue − reserve − operating − fee`, so the conservation equation cannot fail unless
 * the code is mis-typed. It is asserted anyway (a mis-typed field assignment is exactly the slip it
 * catches), but the assertion that gives §17's gate G-9 teeth is in the tests, which recompute each
 * deduction INDEPENDENTLY from its basis — `percentOf(fromMinor(revenue), ratePercent)`, the FIXED
 * amount, `max(0, target − current)` — and compare term by term. Stated plainly here so no reader
 * mistakes a green I1 for proof that the fee was computed on the right base.
 */

import { DomainError, distributionInvariantBreach } from '../errors.js';
import {
  CONTINUATION_STIPULATIONS,
  INVARIANT_IDS,
  MAX_WEIGHT_DECIMAL_PLACES,
  RECEIPT_CLASSES,
  compareBeneficiaryIds,
} from './contract.js';
import type {
  BeneficiaryInput,
  ContinuationStipulation,
  DistributionInput,
  DistributionLine,
  EntitlementOrder,
  ExclusionReasonCode,
  InvariantId,
  Minor,
  RunFlag,
  Totals,
  Waterfall,
} from './contract.js';

/** Everything an invariant needs, and nothing a stage could hide a disagreement behind. */
export interface InvariantContext {
  readonly input: DistributionInput;
  readonly distributionType: 'MONETARY' | 'NA_DIRECT_USE';
  readonly order: EntitlementOrder;
  readonly waterfall: Waterfall;
  /** ALL lines, ascending `beneficiaryId` — entitled and excluded alike. */
  readonly lines: readonly DistributionLine[];
  readonly totals: Totals;
  /** The pre-bump Hamilton floors, index-aligned with the ascending-id entitled cohort. */
  readonly floorsMinor: readonly bigint[];
  /** The entitled cohort's ids, ascending. Empty on a direct-use run. */
  readonly entitledIds: readonly string[];
  /**
   * The run's published flags, in canonical order.
   *
   * ⚠ Present for exactly one purpose, and it is a **cross-check, never an input to a decision**: I-R1
   * recomputes the R7 extinction test from `input` and refuses the run if the recomputation and the
   * published `REVERSION_TO_ULTIMATE_TAKER_APPLIED` disagree. That is what makes the flag *checkable*
   * rather than trusted. No invariant may take a flag as evidence that the thing it names happened —
   * that would make this module a paraphrase of the engine, which is the failure mode the header exists
   * to prevent.
   */
  readonly flags: readonly RunFlag[];
}

/**
 * Assert every invariant this run supports, and report exactly which ones those were.
 *
 * Order is deliberate: conservation and non-negativity first (they are the cheapest and the most
 * likely to be broken by a coding slip), then the structural claims, then the corpus invariant last
 * — I-C1 is the one whose failure would mean endowed principal had been distributed, so it is
 * checked against the raw receipts after every downstream figure exists to be tested.
 *
 * The returned ids are in canonical `INVARIANT_IDS` order, so `result.invariantsChecked` is stable
 * under a reshuffle of the calls below (I8).
 *
 * @throws `DISTRIBUTION_INVARIANT_BREACH` on any breach. No run is returned.
 */
export function assertInvariants(ctx: InvariantContext): readonly InvariantId[] {
  const checked = new Set<InvariantId>();

  assertWaterfallConservation(ctx.waterfall);
  checked.add('I1');

  // One function, two invariants: I2 is the entitlement identity and I3 the status identity, and
  // they are asserted together because they share the same partition of `lines` — computing that
  // partition twice would invite the two halves to disagree about what "excluded" means.
  assertSplitConservation(ctx.lines, ctx.totals, ctx.waterfall);
  checked.add('I2');
  checked.add('I3');

  assertNoNegatives(ctx.waterfall, ctx.lines, ctx.totals);
  checked.add('I4');

  // I5 needs lines to make a claim about. The `NIL_DISTRIBUTION` short-circuit emits none (§08
  // line 405 literally: `lines = []`), and a direct-use run has no cohort at all (I7), so in both
  // cases there is nothing to check — and the id is therefore NOT reported.
  if (ctx.lines.length > 0 && ctx.order !== 'NA_DIRECT_USE') {
    assertOrderedExclusion(ctx.order, ctx.input, ctx.lines);
    checked.add('I5');
  }

  // R7 · the extinction state, recomputed HERE from `ctx.input` — never read back from the resolution
  // or from the flag. It gates I-L1 below and is cross-checked against the published flag by I-R1.
  const reversion = independentReversionState(ctx.input);

  // I-L1 · per-capita equality. Asserted BEFORE I6, deliberately: I6's independent Hamilton split
  // would also catch a resolver that applied deed weights to a lineage cohort, but it would report it
  // as "the split does not match" — an amount mismatch. I-L1 names the actual defect ("per capita was
  // not applied"), and putting it first means a mutation of the effective weight surfaces under the
  // invariant whose whole subject it is. Monetary + non-empty, stated here like I5/I6/I7's halves.
  //
  // ⚠ **NOT asserted on a reverted run** (R7). Per capita is the BLOODLINE's rule; once the reversion has
  // triggered the entitled lines are charitable ultimate takers splitting by their recorded deed weights
  // (R7-e), so "equal per head" makes no claim about the line that took the money — and a 70/30 split
  // would fail it. I-R1 stands in its place and is asserted instead. Reporting an invariant that makes no
  // claim about the paid line is the R6-I5 defect; it is not repeated here.
  if (
    ctx.order === 'LINEAGE_CONTINUATION' &&
    ctx.distributionType === 'MONETARY' &&
    ctx.totals.entitledLineCount > 0 &&
    !reversion.applied
  ) {
    assertPerCapitaEquality(ctx.lines);
    checked.add('I-L1');
  }

  // I6 needs at least one entitled LINE. `entitledLineCount` and not `entitledIds.length`: the nil
  // short-circuit can have a live cohort and still emit no lines.
  if (ctx.totals.entitledLineCount > 0) {
    assertGateNeutrality(ctx);
    checked.add('I6');
  }

  assertDirectUseNullity(ctx.order, ctx.distributionType, ctx.lines);
  if (ctx.distributionType === 'NA_DIRECT_USE') {
    // The monetary half of I7, which the briefed signature above cannot see (it takes no totals).
    assertDirectUseTotals(ctx.totals, ctx.waterfall);
  }
  checked.add('I7');

  // I8 (determinism) is deliberately absent — see the module header. It cannot be asserted from one
  // run, so it is never reported as checked.

  assertResidualBound(ctx.totals.residualMinor, ctx.totals.entitledLineCount);
  checked.add('I9');

  // I-R1 · reversion integrity, including the universal mirror. Asserted whenever it makes a CLAIM:
  // a run with no مآل clause and no charitable line has nothing for it to say, so the id is not
  // reported — the same honesty rule I5/I6/I7's halves follow. The mirror is what makes it non-vacuous
  // on an ordinary run that happens to hold a charitable line at all.
  const reversionClaimApplies =
    ctx.lines.length > 0 &&
    (ctx.input.reversion !== null ||
      ctx.lines.some((line) => line.basis.kind === 'CHARITABLE_JIHA'));
  if (reversionClaimApplies) {
    assertReversionIntegrity(ctx, reversion);
    checked.add('I-R1');
  }

  assertCorpusSegregation(ctx.input, ctx.waterfall, ctx.totals);
  checked.add('I-C1');

  return Object.freeze(INVARIANT_IDS.filter((id) => checked.has(id)));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I1 · waterfall conservation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I1: `revenue == reserve + operating + fee + distributable`, and
 * `netIncome == revenue − reserve − operating`.
 *
 * ⚠ Tautological at runtime — see the module header. Kept because a mis-typed field assignment
 * (`netIncomeMinor` where `distributableMinor` was meant) is a real slip that it does catch, and
 * because a future waterfall that stops deriving distributable as the remainder — §16 OQ-05's zakat
 * step is exactly that shape — would make it load-bearing overnight.
 */
export function assertWaterfallConservation(waterfall: Waterfall): void {
  const deductions =
    (waterfall.maintenanceReserveMinor as bigint) +
    (waterfall.operatingCostMinor as bigint) +
    (waterfall.nazirFeeMinor as bigint);
  const recomposed = deductions + (waterfall.distributableMinor as bigint);

  if (recomposed !== (waterfall.revenueMinor as bigint)) {
    throw distributionInvariantBreach(
      'I1',
      `ṣiyāna reserve + operating + Nazir fee + distributable = ${String(recomposed)} halalas against revenue of ${String(waterfall.revenueMinor)}. Value leaked out of the waterfall between two deductions`,
      {
        revenueMinor: String(waterfall.revenueMinor),
        maintenanceReserveMinor: String(waterfall.maintenanceReserveMinor),
        operatingCostMinor: String(waterfall.operatingCostMinor),
        nazirFeeMinor: String(waterfall.nazirFeeMinor),
        distributableMinor: String(waterfall.distributableMinor),
      },
    );
  }

  const expectedNetIncome =
    (waterfall.revenueMinor as bigint) -
    (waterfall.maintenanceReserveMinor as bigint) -
    (waterfall.operatingCostMinor as bigint);
  if (expectedNetIncome !== (waterfall.netIncomeMinor as bigint)) {
    throw distributionInvariantBreach(
      'I1',
      `netIncome is reported as ${String(waterfall.netIncomeMinor)} halalas but revenue − ṣiyāna reserve − operating cost is ${String(expectedNetIncome)}. netIncome is the PERCENT_OF_NET_INCOME fee base, so a wrong value here is a wrong fee`,
      {
        netIncomeMinor: String(waterfall.netIncomeMinor),
        expectedNetIncomeMinor: String(expectedNetIncome),
      },
    );
  }

  // A fee with no basis must be zero, and a basis with no fee configuration must not appear: the
  // pair is the record of whether step 3 ran or was HELD pending the Authority determination.
  if (waterfall.nazirFeeBasis === null && (waterfall.nazirFeeMinor as bigint) !== 0n) {
    throw distributionInvariantBreach(
      'I1',
      `the Nazir fee is ${String(waterfall.nazirFeeMinor)} halalas with no fee basis recorded. A fee taken on no stated basis is not defensible against Nazarah Art. 11`,
      { nazirFeeMinor: String(waterfall.nazirFeeMinor) },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I2 + I3 · the split conserves distributable, and the status partition adds up
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I2 (restated): `Σ lines[¬EXCLUDED].entitledMinor + retained == distributable`.
 * I3 (restated): `paid + withheld + crossBorder + retained == distributable`, EXCLUDED lines
 * contributing 0.
 *
 * Both are the DEFECT-1 restatements. §08's originals omit `retainedMinor` and are therefore FALSE
 * in three states its own acceptance criteria produce: the nil run, `NO_ELIGIBLE_BENEFICIARIES`
 * with a positive distributable, and an `NA_DIRECT_USE` waqf that did have period revenue (§08
 * line 54 — the waterfall still computes; only the split below it is skipped).
 *
 * The three status sums are computed **by partitioning `lines`**, never carried forward from a
 * running counter, so a mis-assigned status surfaces here as an imbalance instead of on a
 * beneficiary's statement. The reported roll-ups (`totals.entitledMinor`, the counts) are then
 * compared against the same partition, so the summary cannot drift from the lines it summarises.
 */
export function assertSplitConservation(
  lines: readonly DistributionLine[],
  totals: Totals,
  waterfall: Waterfall,
): void {
  let paid = 0n;
  let withheld = 0n;
  let crossBorder = 0n;
  let entitledFromLines = 0n;
  let entitledLineCount = 0;
  let excludedCount = 0;

  for (const line of lines) {
    if (line.status === 'EXCLUDED') {
      excludedCount += 1;
      if ((line.entitledMinor as bigint) !== 0n) {
        throw distributionInvariantBreach(
          'I3',
          `EXCLUDED line "${line.beneficiaryId}" carries ${String(line.entitledMinor)} halalas. An exclusion means the deed owes nothing this period — a non-zero amount there is a withhold mislabelled as an exclusion, which silently removes the beneficiary's weight from the denominator`,
          { beneficiaryId: line.beneficiaryId, entitledMinor: String(line.entitledMinor) },
        );
      }
      continue;
    }

    entitledLineCount += 1;
    entitledFromLines += line.entitledMinor as bigint;
    switch (line.status) {
      case 'PAID':
        paid += line.entitledMinor as bigint;
        break;
      case 'WITHHELD':
        withheld += line.entitledMinor as bigint;
        break;
      case 'CROSS_BORDER_PENDING':
        crossBorder += line.entitledMinor as bigint;
        break;
      default: {
        const unmapped: never = line.status;
        throw distributionInvariantBreach(
          'I3',
          `line "${line.beneficiaryId}" carries status ${JSON.stringify(unmapped)}, which is not in the status partition. An unpartitioned status is money in no total`,
          { beneficiaryId: line.beneficiaryId, status: String(unmapped) },
        );
      }
    }
  }

  const distributable = waterfall.distributableMinor as bigint;

  // ⚠ HONESTY NOTE — defence in depth. On a real run this is implied: the status partition below
  // pins `paid`/`withheld`/`crossBorder` to the lines, and I-C1's leakage identity reads
  // `totals.entitledMinor` against `revenueMinor`. So no single-field mutation of a real run reaches
  // this check alone. It is kept because it names the failure precisely — "the summary has drifted
  // from the lines it summarises" — where the implied route would report a corpus breach instead,
  // sending a reader to look for leaked principal that is not there.
  if (entitledFromLines !== (totals.entitledMinor as bigint)) {
    throw distributionInvariantBreach(
      'I2',
      `totals.entitledMinor is ${String(totals.entitledMinor)} halalas but the non-EXCLUDED lines sum to ${String(entitledFromLines)}. The reported roll-up has drifted from the lines it summarises`,
      {
        reported: String(totals.entitledMinor),
        fromLines: String(entitledFromLines),
      },
    );
  }

  if (entitledFromLines + (totals.retainedMinor as bigint) !== distributable) {
    throw distributionInvariantBreach(
      'I2',
      `Σ entitled lines ${String(entitledFromLines)} + retained ${String(totals.retainedMinor)} = ${String(entitledFromLines + (totals.retainedMinor as bigint))} halalas against a distributable pool of ${String(distributable)}. Every halala of distributable ghallah is either attached to a line or reported as retained — never neither`,
      {
        entitledFromLines: String(entitledFromLines),
        retainedMinor: String(totals.retainedMinor),
        distributableMinor: String(distributable),
      },
    );
  }

  const statusSums: ReadonlyArray<readonly [string, bigint, bigint]> = [
    ['paidMinor', paid, totals.paidMinor as bigint],
    ['withheldMinor', withheld, totals.withheldMinor as bigint],
    ['crossBorderMinor', crossBorder, totals.crossBorderMinor as bigint],
  ];
  for (const [field, fromLines, reported] of statusSums) {
    if (fromLines !== reported) {
      throw distributionInvariantBreach(
        'I3',
        `totals.${field} is ${String(reported)} halalas but partitioning the lines on status gives ${String(fromLines)}`,
        { field, reported: String(reported), fromLines: String(fromLines) },
      );
    }
  }

  const statusTotal = paid + withheld + crossBorder + (totals.retainedMinor as bigint);
  if (statusTotal !== distributable) {
    throw distributionInvariantBreach(
      'I3',
      `paid ${String(paid)} + withheld ${String(withheld)} + crossBorder ${String(crossBorder)} + retained ${String(totals.retainedMinor)} = ${String(statusTotal)} halalas against a distributable pool of ${String(distributable)}`,
      { statusTotal: String(statusTotal), distributableMinor: String(distributable) },
    );
  }

  if (totals.entitledLineCount !== entitledLineCount) {
    throw distributionInvariantBreach(
      'I2',
      `totals.entitledLineCount is ${String(totals.entitledLineCount)} but ${String(entitledLineCount)} lines are not EXCLUDED. The residual bound (I9) is stated against this count, so a wrong value weakens I9 silently`,
      { reported: totals.entitledLineCount, fromLines: entitledLineCount },
    );
  }
  if (totals.excludedCount !== excludedCount) {
    throw distributionInvariantBreach(
      'I2',
      `totals.excludedCount is ${String(totals.excludedCount)} but ${String(excludedCount)} lines are EXCLUDED`,
      { reported: totals.excludedCount, fromLines: excludedCount },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I4 · nothing is negative
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I4: every monetary field of `waterfall`, of `totals`, and every `line.entitledMinor` is `>= 0`;
 * every count is a non-negative integer.
 *
 * The **third** layer of I4, deliberately. The first is `nonNegativeMinorSchema` on every input
 * money field; the second is `computeWaterfall`'s two `DISTRIBUTION_NEGATIVE` throws at the point of
 * computation, before any line exists. This one re-walks the ASSEMBLED result, so a negative that
 * appeared during line assembly (a subtraction in the wrong direction) cannot reach a statement.
 */
export function assertNoNegatives(
  waterfall: Waterfall,
  lines: readonly DistributionLine[],
  totals: Totals,
): void {
  const monetary: ReadonlyArray<readonly [string, bigint]> = [
    ['waterfall.revenueMinor', waterfall.revenueMinor as bigint],
    ['waterfall.capitalReceiptsMinor', waterfall.capitalReceiptsMinor as bigint],
    ['waterfall.maintenanceReserveMinor', waterfall.maintenanceReserveMinor as bigint],
    ['waterfall.operatingCostMinor', waterfall.operatingCostMinor as bigint],
    ['waterfall.netIncomeMinor', waterfall.netIncomeMinor as bigint],
    ['waterfall.nazirFeeMinor', waterfall.nazirFeeMinor as bigint],
    ['waterfall.distributableMinor', waterfall.distributableMinor as bigint],
    ['totals.paidMinor', totals.paidMinor as bigint],
    ['totals.withheldMinor', totals.withheldMinor as bigint],
    ['totals.crossBorderMinor', totals.crossBorderMinor as bigint],
    ['totals.retainedMinor', totals.retainedMinor as bigint],
    ['totals.entitledMinor', totals.entitledMinor as bigint],
    ['totals.residualMinor', totals.residualMinor as bigint],
  ];
  for (const [field, value] of monetary) {
    if (value < 0n) {
      throw distributionInvariantBreach(
        'I4',
        `${field} is ${String(value)} halalas. No monetary figure in an emitted run may be negative`,
        { field, valueMinor: String(value) },
      );
    }
  }

  const counts: ReadonlyArray<readonly [string, number]> = [
    ['totals.excludedCount', totals.excludedCount],
    ['totals.entitledLineCount', totals.entitledLineCount],
  ];
  for (const [field, value] of counts) {
    if (!Number.isInteger(value) || value < 0) {
      throw distributionInvariantBreach(
        'I4',
        `${field} is ${String(value)}; a line count must be a non-negative integer`,
        { field, value: String(value) },
      );
    }
  }

  for (const line of lines) {
    if ((line.entitledMinor as bigint) < 0n) {
      throw distributionInvariantBreach(
        'I4',
        `line "${line.beneficiaryId}" carries ${String(line.entitledMinor)} halalas`,
        { beneficiaryId: line.beneficiaryId, entitledMinor: String(line.entitledMinor) },
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I5 · ordered exclusion, its SHARED contrast, and its LINEAGE contrast + positive claim
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I5, in three branches — one per entitlement path that emits lines.
 *
 * **`ORDERED`** (§08's original, unchanged): if any member of ṭabaqa *k* is living then every member
 * of a ṭabaqa `> k` is `EXCLUDED` with `entitledMinor === 0n` and
 * `reasonCode === 'UPPER_TABAQA_EXTANT'`, and every member of a ṭabaqa `< k` is
 * `EXCLUDED / TABAQA_EXTINCT`. **The lowest living ṭabaqa is recomputed here from
 * `input.beneficiaries`**, independently of `resolution.entitledTabaqa`. That is the whole point:
 * trusting the resolver's own answer would make this a restatement of the resolver rather than a
 * check on it.
 *
 * Two clarifications §08 omits, both pinned by AT-15 and both implemented by `./resolver.ts`:
 *
 *  · **The tier test applies ONLY to members with a non-null `tabaqa`.** A `CHARITABLE_JIHA` or a
 *    `CATEGORY_ONLY` placeholder is not in the generational tree and is never tier-excluded.
 *
 *    ✓ **THE EXEMPTION IS CORRECT AND CLAIMED, not tolerated — memo Q1, product owner 2026-08-17.** It
 *    is the exemption R6-I5 flagged as an honesty gap, and the owner ruled that an untiered recorded
 *    ultimate taker (مآل الوقف) is **by design** outside tier logic: its verdict comes from the reversion
 *    clause, not from a generation it does not stand in. So this branch is silent about that line **on
 *    purpose**, and what guarantees it is stated where it lives: the taker is EXCLUDED by default
 *    (`REVERSION_PENDING_LIVING_BLOODLINE`, `resolver.ultimateTakerVerdict`) and **I-R1's universal
 *    mirror** forbids a charity being paid a halala in the same run as any certified descendant. G-9
 *    clause 3 is certified by I5 **over descendants** and by I-R1 + the default exclusion over the
 *    taker's line — two claims, two mechanisms, neither standing in for the other.
 *
 *    ⚠ This bullet used to add "which is what stops a joint waqf's charitable leg losing its 40%
 *    deed share to the family leg by accident". **That was false as shipped** and is corrected here
 *    (S3 adversarial review): the skip is keyed on `tabaqa`, so it protected nothing the moment a
 *    jiha's `tabaqa` was populated — measured, such a jiha was `EXCLUDED (UPPER_TABAQA_EXTANT)` and
 *    its whole deed share went to the family. What actually stops that is
 *    `resolver.assertJihaNotTiered`, which **halts with `SHART_INCOMPLETE`** before entitlement is
 *    resolved (product-owner decision, 2026-07-30). This skip is merely consistent with that
 *    refusal; it does not create the protection. **ADR-0009 note:** a *joint* waqf can no longer reach
 *    this function at all — it is refused at Stage 0 — but the tiered-jiha refusal is what protects a
 *    charitable jiha on a `PUBLIC_CHARITABLE` waqf, which still can.
 *  · **`SHARED` (tashrik) has no tier test at all**, so this function's `SHARED` branch asserts the
 *    contrast: no line may carry a tier-based exclusion code. Without that branch a resolver that
 *    ignored `entitlementOrder` entirely would satisfy I5 for every SHARED waqf.
 *
 * **`LINEAGE_CONTINUATION`** (ADR-0009 as corrected by **R-FRONTIER**, 2026-08-03), two claims, and
 * the second is the substantive one:
 *
 *  · *The contrast*, on the exact shape of the SHARED branch: **no line may carry
 *    `UPPER_TABAQA_EXTANT` or `TABAQA_EXTINCT`.** Without it, a resolver that silently kept applying
 *    the tier test under lineage would satisfy I5 — the same hole the SHARED branch exists to close.
 *  · *The positive frontier claim*, recomputed **from `input.beneficiaries` by rebuilding the parent
 *    graph here** — never from the resolver's `LineageIndex`, which would make this a paraphrase. For
 *    every line, the expected verdict is derived from its proper-ancestor chain:
 *
 *      | nearest chain fact | expected |
 *      |---|---|
 *      | under `ZUHUR_ONLY`, an ancestor that is not a `SON` | `EXCLUDED / BUTUN_LINE_NOT_CONTINUED` |
 *      | otherwise, an ancestor that is still `active` | `EXCLUDED / ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` |
 *      | otherwise | neither of those two codes may appear |
 *
 *    with `entitledMinor === 0n` on every excluded line. Two tolerances, both narrow and both for
 *    the same reason — the *reason code* on a multiply-blocked line is a precedence question the
 *    resolver owns, while *excluded and holding nothing* is the entitlement fact this invariant is
 *    for: `BENEFICIARY_INACTIVE` is accepted when the member really is inactive, and either lineage
 *    code is accepted when **both** chain facts really block. Where only one fact blocks, the code is
 *    required exactly.
 *
 *    ⚠ **CORRECTION (R-FRONTIER).** This paragraph used to end *"the recomputation NEVER consults an
 *    ancestor's `active`; an invariant that vital-tested ancestors would re-import the tier model"*.
 *    **That is now exactly backwards for the frontier half**, and an invariant that kept it would
 *    have gone on certifying the defect the owner corrected: a grandchild paid while their father
 *    lives. An ancestor's `active` is a first-class part of the eligibility rule and this check reads
 *    it. What must still never be vital-tested is the **buṭūn** half — whether a line continues is a
 *    fact about links alone, and a *dead* ancestor is still walked through — which is why
 *    {@link independentAncestorChains} is deliberately built from `parentId` + `lineageLink` only and
 *    the vital status is joined in here, per line, where the frontier rule needs it.
 *
 * The continuation stipulation is re-narrowed here from `input.continuationStipulation` rather than
 * taken from the resolution, so an unrecognised term reaching an emitted lineage run is itself a
 * breach: the resolver should have refused the run.
 */
export function assertOrderedExclusion(
  order: EntitlementOrder,
  input: DistributionInput,
  lines: readonly DistributionLine[],
): void {
  const byId = new Map<string, BeneficiaryInput>(
    input.beneficiaries.map((beneficiary) => [beneficiary.id, beneficiary]),
  );

  if (order === 'LINEAGE_CONTINUATION') {
    assertLineageExclusion(input, lines, byId);
    return;
  }

  if (order === 'SHARED') {
    for (const line of lines) {
      if (line.reasonCode === 'UPPER_TABAQA_EXTANT' || line.reasonCode === 'TABAQA_EXTINCT') {
        throw distributionInvariantBreach(
          'I5',
          `line "${line.beneficiaryId}" carries the tier-based exclusion ${line.reasonCode} under SHARED (tashrik / تشريك), where every living tier shares together and no ṭabaqa excludes another. A tier exclusion here means the ORDERED rule was applied to a shared waqf`,
          { beneficiaryId: line.beneficiaryId, reasonCode: line.reasonCode, order },
        );
      }
    }
    return;
  }

  if (order !== 'ORDERED') return;

  // Independent recomputation: "living" is `active === true` and nothing else. An inactive member
  // does not keep their tier alive (§08: they are absent for the extinction test).
  let entitledTabaqa: number | null = null;
  for (const beneficiary of input.beneficiaries) {
    if (beneficiary.tabaqa === null || !beneficiary.active) continue;
    if (entitledTabaqa === null || beneficiary.tabaqa < entitledTabaqa) {
      entitledTabaqa = beneficiary.tabaqa;
    }
  }

  for (const line of lines) {
    const beneficiary = byId.get(line.beneficiaryId);
    if (beneficiary === undefined) {
      throw distributionInvariantBreach(
        'I5',
        `the run emitted a line for "${line.beneficiaryId}", who is not among the input beneficiaries. A line with no recorded beneficiary cannot be reconciled against the deed`,
        { beneficiaryId: line.beneficiaryId },
      );
    }

    if (beneficiary.tabaqa === null) {
      if (line.reasonCode === 'UPPER_TABAQA_EXTANT' || line.reasonCode === 'TABAQA_EXTINCT') {
        throw distributionInvariantBreach(
          'I5',
          `line "${line.beneficiaryId}" has no ṭabaqa (kind ${beneficiary.kind}) yet was excluded with the tier reason ${line.reasonCode}. An untiered member — a charitable jiha, a category placeholder — is not in the generational tree and can never be tier-excluded`,
          {
            beneficiaryId: line.beneficiaryId,
            kind: beneficiary.kind,
            reasonCode: line.reasonCode,
          },
        );
      }
      continue;
    }

    const expected: 'TABAQA_EXTINCT' | 'UPPER_TABAQA_EXTANT' | null =
      entitledTabaqa === null || beneficiary.tabaqa < entitledTabaqa
        ? 'TABAQA_EXTINCT'
        : beneficiary.tabaqa > entitledTabaqa
          ? 'UPPER_TABAQA_EXTANT'
          : null;

    if (expected === null) continue;

    if (line.status !== 'EXCLUDED' || line.reasonCode !== expected) {
      throw distributionInvariantBreach(
        'I5',
        `ṭabaqa ${String(beneficiary.tabaqa)} member "${line.beneficiaryId}" should be EXCLUDED / ${expected} because ṭabaqa ${entitledTabaqa === null ? 'none' : String(entitledTabaqa)} is the lowest tier holding a living member (al-aʿlā fa-l-aʿlā), but the line is ${line.status} / ${line.reasonCode ?? 'null'}`,
        {
          beneficiaryId: line.beneficiaryId,
          tabaqa: String(beneficiary.tabaqa),
          entitledTabaqa: entitledTabaqa === null ? 'null' : String(entitledTabaqa),
          expectedReasonCode: expected,
          actualStatus: line.status,
          actualReasonCode: line.reasonCode ?? 'null',
        },
      );
    }
    if ((line.entitledMinor as bigint) !== 0n) {
      throw distributionInvariantBreach(
        'I5',
        `tier-excluded line "${line.beneficiaryId}" carries ${String(line.entitledMinor)} halalas`,
        { beneficiaryId: line.beneficiaryId, entitledMinor: String(line.entitledMinor) },
      );
    }
  }
}

/**
 * I5's `LINEAGE_CONTINUATION` branch — the contrast plus the positive ẓuhūr/buṭūn claim.
 *
 * See {@link assertOrderedExclusion}'s doc for what is asserted and why the graph is rebuilt here.
 */
function assertLineageExclusion(
  input: DistributionInput,
  lines: readonly DistributionLine[],
  byId: ReadonlyMap<string, BeneficiaryInput>,
): void {
  const continuation = input.continuationStipulation;
  if (
    continuation === null ||
    !(CONTINUATION_STIPULATIONS as readonly string[]).includes(continuation)
  ) {
    throw distributionInvariantBreach(
      'I5',
      `a LINEAGE_CONTINUATION run was emitted with continuationStipulation ${continuation === null ? 'null' : JSON.stringify(continuation)}, which is not one of ${CONTINUATION_STIPULATIONS.join(' | ')}. The resolver must refuse such a run with SHART_INCOMPLETE (CONTINUATION_STIPULATION_UNRECOGNISED) — reaching here means it did not`,
      { continuationStipulation: continuation === null ? 'null' : continuation },
    );
  }
  const term = continuation as ContinuationStipulation;

  // Independent rebuild. Deliberately NOT `resolver.buildLineage`: sharing it would make this a
  // re-run of the component under test. It reads `parentId` + `lineageLink` only — never `active`.
  const ancestorsById = independentAncestorChains(input);

  for (const line of lines) {
    if (line.reasonCode === 'UPPER_TABAQA_EXTANT' || line.reasonCode === 'TABAQA_EXTINCT') {
      throw distributionInvariantBreach(
        'I5',
        `line "${line.beneficiaryId}" carries the tier-based exclusion ${line.reasonCode} under LINEAGE_CONTINUATION, where a generation's death does not block the next generation (ADR-0009 R1). A tier exclusion here means the al-aʿlā fa-l-aʿlā rule was applied to a lineage waqf`,
        {
          beneficiaryId: line.beneficiaryId,
          reasonCode: line.reasonCode,
          order: input.entitlementOrder,
        },
      );
    }

    const beneficiary = byId.get(line.beneficiaryId);
    if (beneficiary === undefined) {
      throw distributionInvariantBreach(
        'I5',
        `the run emitted a line for "${line.beneficiaryId}", who is not among the input beneficiaries. A line with no recorded beneficiary cannot be reconciled against the deed`,
        { beneficiaryId: line.beneficiaryId },
      );
    }

    const chain = ancestorsById.get(line.beneficiaryId) ?? [];

    // R-FRONTIER, recomputed independently: the two facts a proper-ancestor chain can carry, each
    // taken at its NEAREST occurrence, and the deed's own precedence between them (the permanent
    // reason outranks the temporary one).
    const lineBreakAncestorId =
      term === 'ZUHUR_ONLY'
        ? (chain.find((ancestorId) => byId.get(ancestorId)?.lineageLink !== 'SON') ?? null)
        : null;
    const livingAncestorId =
      chain.find((ancestorId) => byId.get(ancestorId)?.active === true) ?? null;

    const expected: ExclusionReasonCode | null =
      lineBreakAncestorId !== null
        ? 'BUTUN_LINE_NOT_CONTINUED'
        : livingAncestorId !== null
          ? 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'
          : null;

    if (expected === null) {
      // Nothing on this chain blocks: neither lineage exclusion code may appear. Both directions
      // matter — the false-positive half is what stops a resolver telling an entitled family member
      // that their line ended, or that a dead man is holding their share.
      if (
        line.reasonCode === 'BUTUN_LINE_NOT_CONTINUED' ||
        line.reasonCode === 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'
      ) {
        throw distributionInvariantBreach(
          'I5',
          `line "${line.beneficiaryId}" is excluded ${line.reasonCode}, but nothing on their line of descent blocks them: ${
            term === 'ZUHUR_AND_BUTUN'
              ? 'both sons and daughters continue indefinitely under this deed'
              : 'every ancestor strictly between the waqif and them is a SON'
          }, and every one of those ancestors is deceased (chain: ${chain.length === 0 ? 'none — a child of the waqif' : chain.join(' → ')}), so the entitlement rests with THEM. Telling a family member their line does not continue, or that someone ahead of them holds it, when the register says otherwise is the most disputable statement this engine makes`,
          {
            beneficiaryId: line.beneficiaryId,
            continuationStipulation: term,
            ancestorChain: chain.join(','),
            actualReasonCode: line.reasonCode,
          },
        );
      }
      continue;
    }

    /*
     * A blocked line must be EXCLUDED with **one of two** reason codes, and the second one is not a
     * loophole — it is the resolver's documented precedence.
     *
     * ⚠ **DEFECT FOUND BY THE PROPERTY SUITE (P1/P2, 10 000 cases), FIXED HERE.** This check originally
     * demanded `BUTUN_LINE_NOT_CONTINUED` and nothing else. But the resolver tests vital status FIRST —
     * a line carries exactly ONE reason code, and "you are dead" outranks "your line does not
     * continue", which is the right order for a statement a family reads. So a member who is BOTH
     * deceased AND down a buṭūn line was correctly reported `BENEFICIARY_INACTIVE`, and this invariant
     * then threw `DISTRIBUTION_INVARIANT_BREACH` — the loudest failure the engine has — on a perfectly
     * legal input. MEASURED consequence: any ZUHUR_ONLY waqf whose register contains a deceased
     * descendant of a daughter could not produce a distribution at all. On a real family register with
     * three generations that is not an edge case, it is Tuesday.
     *
     * The claim that survives, and is what the rule actually requires, is that such a line is EXCLUDED
     * and holds nothing. Which of the reasons it carries is a precedence question the resolver owns; an
     * invariant that insisted on one of them was asserting a fact about the reason-code ordering while
     * pretending to assert a fact about entitlement. *(This paragraph's closing sentence read "The same
     * tolerance now covers the frontier code" until 2026-08-25 — that tolerance existed only because
     * the dual-block precedence was undecided, and the owner's fourth-batch ruling decided it:
     * permanent over temporary. The frontier tolerance is gone below; the BENEFICIARY_INACTIVE
     * tolerance stays, because "you are dead outranks everything" was the resolver's ruled order
     * already and this defect note is its record.)*
     */
    const excludedForAcceptableReason =
      line.status === 'EXCLUDED' &&
      (line.reasonCode === expected ||
        // Only when the beneficiary really is inactive — otherwise this arm would let any exclusion
        // reason through and the invariant would stop being load-bearing.
        // ✓ A doubly-blocked line reports the PERMANENT reason — the OWNER'S ruling since
        // 2026-08-25 (memo, S8 addendum fourth batch, "Register #12": verbatim "Ratify
        // permanent-over-temporary (Recommended)"). A third arm here used to ALSO accept
        // `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` on a dual block, because pinning one code while
        // the precedence was engineering's open `TODO(surface)` would have made an invariant
        // breach out of an undecided question. With the ruling the tolerance is GONE and this
        // invariant is strictly stronger: on a dual block only `BUTUN_LINE_NOT_CONTINUED`
        // satisfies it, via the `expected` arm above — `expected` derives lineBreak-first from
        // the same chain facts, which is now the ruled order, not a coincidence of computation.
        (line.reasonCode === 'BENEFICIARY_INACTIVE' && !beneficiary.active));

    if (!excludedForAcceptableReason) {
      throw distributionInvariantBreach(
        'I5',
        `line "${line.beneficiaryId}" should be EXCLUDED for ${expected} (or, if they are also deceased, for BENEFICIARY_INACTIVE): ${
          expected === 'BUTUN_LINE_NOT_CONTINUED'
            ? `under ZUHUR_ONLY the ancestor "${lineBreakAncestorId ?? ''}" strictly between the waqif and them is a DAUGHTER, so the deed does not continue their line`
            : `the ancestor "${livingAncestorId ?? ''}" strictly between the waqif and them is still living and holds the entitlement, so it has not yet reached them (R-FRONTIER)`
        } (chain: ${chain.join(' → ')}) — but the line is ${line.status} / ${line.reasonCode ?? 'null'}`,
        {
          beneficiaryId: line.beneficiaryId,
          continuationStipulation: term,
          ancestorChain: chain.join(','),
          expectedReasonCode: expected,
          blockingAncestorId: lineBreakAncestorId ?? livingAncestorId ?? 'null',
          actualStatus: line.status,
          actualReasonCode: line.reasonCode ?? 'null',
          beneficiaryActive: beneficiary.active,
        },
      );
    }
    if ((line.entitledMinor as bigint) !== 0n) {
      throw distributionInvariantBreach(
        'I5',
        `line "${line.beneficiaryId}" is excluded (${expected}), yet carries ${String(line.entitledMinor)} halalas`,
        { beneficiaryId: line.beneficiaryId, entitledMinor: String(line.entitledMinor) },
      );
    }
  }
}

/**
 * Every graph member's **proper** ancestors, nearest first — rebuilt from the input alone.
 *
 * A second, independent implementation of `resolver.buildLineage`'s walk, on purpose (Sprints 1–3 all
 * shipped defects that existed because nothing compared two sides that were supposed to agree). It is
 * *tolerant* rather than refusing: by the time an invariant runs the resolver has already refused every
 * invalid graph, so a walk that cannot complete here stops rather than throwing a second diagnosis of
 * the same fact. The one bound that matters is the cohort size, so a cycle cannot spin.
 *
 * ⚠ Reads `parentId` and `lineageLink` only — **never `active`**, and that is now a statement about
 * this function rather than about the whole check. The *shape* of a family tree does not depend on
 * who is alive, so keeping vital status out of the rebuild means the chain is the same chain whether
 * or not the frontier rule is applied to it. R-FRONTIER's vital test is joined in by
 * {@link assertOrderedExclusion}'s lineage branch, per line, against `input.beneficiaries`.
 */
function independentAncestorChains(
  input: DistributionInput,
): ReadonlyMap<string, readonly string[]> {
  const byId = new Map<string, BeneficiaryInput>(
    input.beneficiaries.map((beneficiary) => [beneficiary.id, beneficiary]),
  );
  const chains = new Map<string, readonly string[]>();

  for (const beneficiary of input.beneficiaries) {
    if (beneficiary.lineageLink === null) continue;

    const chain: string[] = [];
    let cursor: BeneficiaryInput | undefined = beneficiary;
    for (let hop = 0; hop < input.beneficiaries.length; hop += 1) {
      const parentId: string | null = cursor?.parentId ?? null;
      if (cursor === undefined || parentId === null) break;
      const parent: BeneficiaryInput | undefined = byId.get(parentId);
      if (parent === undefined || parent.lineageLink === null) break;
      chain.push(parent.id);
      cursor = parent;
    }
    chains.set(beneficiary.id, Object.freeze(chain));
  }

  return chains;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I-L1 · per capita means equal per head (ADR-0009 R3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I-L1: on a `LINEAGE_CONTINUATION` monetary run with at least one entitled line,
 * `max(entitledMinor) − min(entitledMinor) <= 1n` over the **entitled** lines.
 *
 * **This is the only load-bearing proof that R3 was applied.** Per capita expressed as a comment is
 * exactly defect class 2 — a claim the code might not honour, believed by the next reader — so it is
 * a runtime assertion with a mutation-verified test behind it (change one effective weight from `'1'`
 * to `'2'` and this throws).
 *
 * **Exact, not approximate, and the bound is `1` for a reason.** With an equal integer weight per head
 * every Hamilton remainder is equal, so the floors are all `distributable / n` and the residual `r`
 * (`< n`, by I9) hands exactly one extra halala to the `r` lowest ids. So the spread is `1` when the
 * pool does not divide evenly and `0` when it does — never more. A tolerance wider than one halala
 * would let a real weighting slip through on a large pool.
 *
 * EXCLUDED lines are skipped: they carry `0n` by I2/I3 and are not in the cohort that shares.
 */
export function assertPerCapitaEquality(lines: readonly DistributionLine[]): void {
  let lowest: bigint | null = null;
  let highest: bigint | null = null;
  let lowestId = '';
  let highestId = '';

  for (const line of lines) {
    if (line.status === 'EXCLUDED') continue;
    const amount = line.entitledMinor as bigint;
    if (lowest === null || amount < lowest) {
      lowest = amount;
      lowestId = line.beneficiaryId;
    }
    if (highest === null || amount > highest) {
      highest = amount;
      highestId = line.beneficiaryId;
    }
  }

  if (lowest === null || highest === null) return;

  if (highest - lowest > 1n) {
    throw distributionInvariantBreach(
      'I-L1',
      `a LINEAGE_CONTINUATION run pays "${highestId}" ${String(highest)} halalas and "${lowestId}" ${String(lowest)} — a spread of ${String(highest - lowest)}. Every entitled member — the living head of each continuing line (R-FRONTIER) — shares the distributable EQUALLY per head (ADR-0009 R3), so with equal weights the largest-remainder split can differ by at most one halala. A wider spread means deed weights, or a branch weighting, were applied to a per-capita cohort`,
      {
        highestBeneficiaryId: highestId,
        highestMinor: String(highest),
        lowestBeneficiaryId: lowestId,
        lowestMinor: String(lowest),
        spreadMinor: String(highest - lowest),
      },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I-R1 · reversion integrity, and R5 as a runtime assertion (R7)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The R7 extinction state as this module recomputes it — from `input` alone. */
interface IndependentReversionState {
  /** The ids the deed names as مآل. Empty when the deed records no clause. */
  readonly takerIds: ReadonlySet<string>;
  /** Every member the register claims descends from the waqif. */
  readonly bloodlineIds: readonly string[];
  /** Those of them that are `active`. */
  readonly livingBloodlineIds: readonly string[];
  /**
   * Those living descendants who **keep the bloodline going** — living *and*, under `ZUHUR_ONLY`, with
   * every ancestor strictly between them and the waqif a `SON` (R7-d, product owner 2026-08-11:
   * *"bloodline is over means no continuing line"*). Equals `livingBloodlineIds` under
   * `ZUHUR_AND_BUTUN`, and wherever the deed records no term this module can recognise — but **no longer
   * on `ORDERED`/`SHARED` as such** (memo Q5, product owner 2026-08-17: one trigger everywhere).
   */
  readonly continuingBloodlineIds: readonly string[];
  /**
   * Those of them that are `CATEGORY_ONLY` **placeholders** for descendants never enumerated (R7-D1).
   * A placeholder is evidence FOR a living bloodline and none against one, so while any stands the
   * trigger is held — separately from `continuingBloodlineIds`, because the two are different reasons.
   */
  readonly unenumeratedBloodlineIds: readonly string[];
  /**
   * R7-d's trigger as WIDENED on 2026-08-11: a clause exists, the register is non-empty, **no recorded
   * descendant keeps a continuing line going**, and every recorded descendant was individually
   * enumerated (R7-D1's fourth conjunct).
   *
   * ⚠ The third conjunct used to read `livingBloodlineIds.length === 0`. That was the strict reading
   * the owner replaced; keeping it here while the resolver widened is exactly the R7-D2 shape (the
   * check and the thing checked drifting apart), so both sides moved in one change — independently.
   */
  readonly applied: boolean;
}

/**
 * Recompute R7's extinction test **from `input.beneficiaries` alone** — never from the resolution, from
 * a line's status, or from the run's flag.
 *
 * That is the whole point: `assertReversionIntegrity` then compares this against the published
 * `REVERSION_TO_ULTIMATE_TAKER_APPLIED`, so the flag becomes checkable rather than trusted. Membership in
 * the bloodline is `lineageLink !== null` — the register's own claim of descent — which is the same
 * predicate `resolver.buildLineage` uses for graph membership and is derived here a second time, in the
 * same spirit as {@link independentAncestorChains}.
 *
 * ═══ R7-d's WIDENING (product owner, 2026-08-11) — RECOMPUTED, NOT MIRRORED ═══
 * *"Bloodline is over means no continuing line."* So the trigger's third conjunct is no longer *nobody
 * is living* but *nobody is living **on a line the deed continues***, and this function derives that
 * predicate for itself:
 *
 *  · the **continuation term** is re-narrowed from `input.continuationStipulation` against
 *    `CONTINUATION_STIPULATIONS`, and — ✓ **since memo Q5 (product owner, 2026-08-17)** — applied on
 *    **every** entitlement order. The clause that scoped it to `LINEAGE_CONTINUATION` is deleted here in
 *    the same change that deletes it from the resolver, for R7-D2's reason: *"the continuation
 *    stipulation, not the entitlement order, defines whose line counts"*, so a check still keyed on the
 *    order would refuse every newly-triggering `ORDERED`/`SHARED` run as an engine defect;
 *  · the **ancestor chains** come from {@link independentAncestorChains}, this module's own rebuild.
 *
 * Anything unrecognised degrades to `null` ⇒ the strict test ⇒ **fewer** reversions, which is the
 * fail-safe direction: an unreadable stipulation must never be the reason a charity is paid. (The
 * resolver refuses such a run outright, so this arm should be unreachable; it is written to be safe
 * rather than to rely on that.)
 *
 * ⚠ This is a **second implementation of the same fiqh rule, on purpose** — the resolver's shared
 * ancestor walk is the first. That is the one duplication this module exists to have: R7-D2 happened
 * because the check and the thing checked drifted, and the fix is for both to move in one change while
 * staying derivable from different starting points, not for one to read the other.
 */
function independentReversionState(input: DistributionInput): IndependentReversionState {
  const takerIds: ReadonlySet<string> =
    input.reversion === null ? new Set<string>() : new Set(input.reversion.ultimateTakerIds);

  // Re-narrowed here, from the raw input fields, for the reasons in the doc above.
  //
  // ✓ Q5 (product owner, 2026-08-17) · the `input.entitlementOrder === 'LINEAGE_CONTINUATION' &&` conjunct
  // that stood here is GONE, and it had to go in the same change as the resolver's: a check that still
  // scoped the term by order while the thing checked no longer did is R7-D2's exact shape, and it would
  // refuse every newly-triggering `ORDERED`/`SHARED` run as a `DISTRIBUTION_INVARIANT_BREACH`. Still
  // recomputed HERE from the raw field rather than read from the resolver.
  const raw = input.continuationStipulation;
  const continuation: ContinuationStipulation | null =
    raw !== null && (CONTINUATION_STIPULATIONS as readonly string[]).includes(raw)
      ? (raw as ContinuationStipulation)
      : null;

  const byId = new Map<string, BeneficiaryInput>(
    input.beneficiaries.map((beneficiary) => [beneficiary.id, beneficiary]),
  );
  const chains = independentAncestorChains(input);

  const bloodlineIds: string[] = [];
  const livingBloodlineIds: string[] = [];
  // The trigger's own list since 2026-08-11: descent + liveness + the deed's continuation term, and
  // nothing else. NOT the entitled cohort — a zero deed weight, a head waiting behind a living
  // ancestor, and a gate all leave the cohort empty while the line plainly continues, and each of
  // those must HOLD the reversion.
  const continuingBloodlineIds: string[] = [];
  // R7-D1, recomputed here INDEPENDENTLY rather than read off the resolver — a placeholder for
  // descendants never enumerated cannot certify a family's extinction. Kept as its own list, not folded
  // into `continuingBloodlineIds`, because the two hold the trigger for different reasons and a run must
  // be able to say which: a line is still going, versus we were never shown who exists.
  const unenumeratedBloodlineIds: string[] = [];
  for (const beneficiary of input.beneficiaries) {
    if (beneficiary.lineageLink === null) continue;
    bloodlineIds.push(beneficiary.id);
    if (beneficiary.active) {
      livingBloodlineIds.push(beneficiary.id);
      // The ẓuhūr walk, independently: is every ancestor strictly between them and the waqif a SON?
      // The beneficiary's OWN link is never read — a son's daughter continues the line, a daughter's
      // son does not — and neither is any ancestor's `active`: whether a line CONTINUES is a fact
      // about links, and a dead ancestor is walked through. R-FRONTIER's living-ancestor fact is
      // deliberately not consulted here (boundary 2): a descendant waiting behind a living ancestor
      // is proof the line is alive, not evidence against it.
      const chain = chains.get(beneficiary.id) ?? [];
      const lineBroken =
        continuation === 'ZUHUR_ONLY' &&
        chain.some((ancestorId) => byId.get(ancestorId)?.lineageLink !== 'SON');
      if (!lineBroken) continuingBloodlineIds.push(beneficiary.id);
    }
    if (beneficiary.kind === 'CATEGORY_ONLY') unenumeratedBloodlineIds.push(beneficiary.id);
  }

  return {
    takerIds,
    bloodlineIds: Object.freeze([...bloodlineIds].sort(compareBeneficiaryIds)),
    livingBloodlineIds: Object.freeze([...livingBloodlineIds].sort(compareBeneficiaryIds)),
    continuingBloodlineIds: Object.freeze([...continuingBloodlineIds].sort(compareBeneficiaryIds)),
    unenumeratedBloodlineIds: Object.freeze(
      [...unenumeratedBloodlineIds].sort(compareBeneficiaryIds),
    ),
    // ⚠ THIRD CONJUNCT WIDENED 2026-08-11 (R7-d) and FOURTH ADDED EARLIER FOR R7-D1.
    //
    // Before R7-D1 this read "clause + non-empty register + nobody living ⇒ applied" while the resolver
    // held the trigger on a placeholder-bearing register, and I-R1's flag cross-check then refused the
    // whole run as a `DISTRIBUTION_INVARIANT_BREACH` — reporting a legal ذري deed over an
    // incompletely-enumerated family as an engine defect. No halala moved either way, but a retained
    // pool and a refusal are different answers to the Nazir, and only one of them is true. The same
    // failure mode is why the widening had to land on BOTH sides in one change: a resolver that
    // triggers on "no continuing line" against a check that still tests "nobody living" would refuse
    // every ZUHUR_ONLY register whose survivors sit on broken lines.
    applied:
      takerIds.size > 0 &&
      bloodlineIds.length > 0 &&
      continuingBloodlineIds.length === 0 &&
      unenumeratedBloodlineIds.length === 0,
  };
}

/**
 * **I-R1 · reversion integrity** (R7), in four claims. The third is the load-bearing one.
 *
 * 1. **On a reverted run**, every entitled line is one of the ids the deed named as مآل, every bloodline
 *    line is `EXCLUDED` holding `0n`, no line carries `REVERSION_PENDING_LIVING_BLOODLINE`, and each paid
 *    taker's `basis.rule` is `ULTIMATE_TAKER_MAAL_AL_WAQF` — the BR-505 label ADR-0009 records the
 *    absence of as a defect.
 * 2. **On a pending run**, no named taker holds a halala. ⚠ "Pending" widened on 2026-08-11: a run is
 *    pending because a line the deed CONTINUES is still going (or because the register is
 *    unenumerated), not merely because someone is alive. Under `ZUHUR_ONLY` a reverted run can now
 *    carry living blood descendants — every one of them EXCLUDED `BUTUN_LINE_NOT_CONTINUED` and holding
 *    `0n`, which is what keeps claims 1 and 3 true of it.
 * 3. **THE UNIVERSAL MIRROR, on every run this is asserted for: a charitable line is never paid a halala
 *    in the same run as a line the engine CERTIFIED as a descendant of the waqif.** That is R5 — *a waqf
 *    is either خيري or ذري, never both* — turned into a runtime assertion, and it is the strongest
 *    guarantee this design can offer, because it holds **whatever a future refusal is relaxed to**.
 *
 *    ⚠ **What it does and does NOT cover, measured rather than asserted.** With both cohort refusals
 *    disabled it refuses ESC-1 (a jiha taking 13,750,000 of 27,500,000 beside a living ṭabaqa-1
 *    descendant) and R6-D1's living-descendant variant. It says **nothing** about R6-D1's other measured
 *    shape — a charity paid 27,500,000 of 27,500,000 with every descendant already dead — because no
 *    descendant is paid there, so nothing is *shared*. That route is closed by the refusal
 *    (`CHARITABLE_JIHA_ON_FAMILY_WAQF`) and by `REVERSION_WITH_NO_RECORDED_BLOODLINE`, not by this
 *    invariant, and claiming otherwise here would be a comment asserting a property the code lacks.
 * 4. **The self-report is cross-checked**: if the published flag and this module's independent
 *    recomputation of the extinction test disagree in either direction, the run is refused. A flag that
 *    nothing checks is a comment with a `RUN_FLAGS` entry.
 *
 * @throws `DISTRIBUTION_INVARIANT_BREACH` naming `I-R1`.
 */
export function assertReversionIntegrity(
  ctx: InvariantContext,
  reversion: IndependentReversionState = independentReversionState(ctx.input),
): void {
  const { lines, flags, input } = ctx;
  const flagged = flags.includes('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

  // 4 · the flag is CHECKED, not trusted. Both directions: a run that quietly paid a charity without
  // raising the flag is the worse of the two, and a run that raised it while the family lives is the
  // one that would have moved money.
  if (flagged !== reversion.applied) {
    throw distributionInvariantBreach(
      'I-R1',
      `the run ${flagged ? 'reports' : 'does not report'} REVERSION_TO_ULTIMATE_TAKER_APPLIED, but recomputing the extinction test from the input says the recorded bloodline ${reversion.applied ? 'IS over' : 'is NOT over'}: ${String(reversion.bloodlineIds.length)} descendant(s) on record, ${String(reversion.livingBloodlineIds.length)} of them living${reversion.livingBloodlineIds.length === 0 ? '' : ` (${reversion.livingBloodlineIds.join(', ')})`}, of whom ${String(reversion.continuingBloodlineIds.length)} on a line this deed CONTINUES${reversion.continuingBloodlineIds.length === 0 ? '' : ` (${reversion.continuingBloodlineIds.join(', ')})`}, ${String(reversion.unenumeratedBloodlineIds.length)} unenumerated placeholder(s), ${String(reversion.takerIds.size)} ultimate taker(s) named. "The bloodline is over" means NO CONTINUING LINE (product owner, 2026-08-11), and the reversion flag must be a fact about the register, not a claim the resolver makes about itself`,
      {
        flagged,
        recomputed: reversion.applied,
        recordedBloodlineCount: reversion.bloodlineIds.length,
        livingBloodlineIds: reversion.livingBloodlineIds.join(','),
        continuingBloodlineIds: reversion.continuingBloodlineIds.join(','),
        unenumeratedBloodlineIds: reversion.unenumeratedBloodlineIds.join(','),
        ultimateTakerCount: reversion.takerIds.size,
      },
    );
  }

  for (const line of lines) {
    const isTaker = reversion.takerIds.has(line.beneficiaryId);
    const paid = (line.entitledMinor as bigint) !== 0n;

    // 2 · a taker holds nothing while the bloodline is extant.
    if (isTaker && paid && !reversion.applied) {
      throw distributionInvariantBreach(
        'I-R1',
        `line "${line.beneficiaryId}" is one of the deed's recorded ultimate takers (مآل الوقف) and carries ${String(line.entitledMinor)} halalas, but the recorded bloodline is not over: ${
          reversion.continuingBloodlineIds.length > 0
            ? `${String(reversion.continuingBloodlineIds.length)} descendant(s) of the waqif ${reversion.continuingBloodlineIds.length === 1 ? 'is' : 'are'} living on a line this deed continues (${reversion.continuingBloodlineIds.join(', ')})`
            : `the register holds ${String(reversion.unenumeratedBloodlineIds.length)} unenumerated placeholder(s) (${reversion.unenumeratedBloodlineIds.join(', ')}), so the engine was never shown who exists`
        }. A charity takes a ذري endowment's ghallah only once the bloodline is over (R7)`,
        {
          beneficiaryId: line.beneficiaryId,
          entitledMinor: String(line.entitledMinor),
          livingBloodlineIds: reversion.livingBloodlineIds.join(','),
          continuingBloodlineIds: reversion.continuingBloodlineIds.join(','),
          unenumeratedBloodlineIds: reversion.unenumeratedBloodlineIds.join(','),
        },
      );
    }

    if (!reversion.applied) {
      continue;
    }

    // 1 · on a reverted run the bloodline holds nothing and the takers hold everything.
    if (paid && !isTaker) {
      throw distributionInvariantBreach(
        'I-R1',
        `the deed's reversion (مآل الوقف) took effect on this run, but line "${line.beneficiaryId}" — which the clause does not name as an ultimate taker — carries ${String(line.entitledMinor)} halalas. Once the bloodline is over the distributable goes to the recorded taker(s) and to nobody else`,
        {
          beneficiaryId: line.beneficiaryId,
          entitledMinor: String(line.entitledMinor),
          ultimateTakerIds: [...reversion.takerIds].sort(compareBeneficiaryIds).join(','),
        },
      );
    }
    if (!isTaker && line.status !== 'EXCLUDED') {
      throw distributionInvariantBreach(
        'I-R1',
        `the deed's reversion took effect, but line "${line.beneficiaryId}" is ${line.status} rather than EXCLUDED. Every descendant on a reverted run is out of the cohort — the bloodline is over, which is the condition that triggered the reversion in the first place`,
        { beneficiaryId: line.beneficiaryId, status: line.status },
      );
    }
    if (line.reasonCode === 'REVERSION_PENDING_LIVING_BLOODLINE') {
      throw distributionInvariantBreach(
        'I-R1',
        `line "${line.beneficiaryId}" is excluded REVERSION_PENDING_LIVING_BLOODLINE on a run where the reversion DID trigger. The two statements are contradictory: the same run cannot both pay the ultimate taker and tell it the bloodline is extant`,
        { beneficiaryId: line.beneficiaryId, reasonCode: line.reasonCode },
      );
    }
    if (isTaker && paid && line.basis.rule !== 'ULTIMATE_TAKER_MAAL_AL_WAQF') {
      throw distributionInvariantBreach(
        'I-R1',
        `line "${line.beneficiaryId}" was paid ${String(line.entitledMinor)} halalas as this endowment's ultimate taker, but its published entitlement basis reads ${line.basis.rule}. A charity paid a family endowment's whole ghallah on a line stamped with a lineage rule is an official Arabic statement telling a charity that its line of descent from the waqif continues — the exact mis-statement ADR-0009 records as a defect`,
        {
          beneficiaryId: line.beneficiaryId,
          rule: line.basis.rule,
          expectedRule: 'ULTIMATE_TAKER_MAAL_AL_WAQF',
        },
      );
    }
  }

  /*
   * 3 · THE UNIVERSAL MIRROR — R5 as a runtime assertion, independent of `input.reversion` entirely.
   *
   * ⚠ **It keys on DESCENDANT-NESS, not on "is not a charity", and that distinction is load-bearing in
   * BOTH directions.** R5's content is that a charity and a **bloodline** never share one endowment's
   * ghallah. Keying the other half on `kind !== 'CHARITABLE_JIHA'` would have thrown
   * `DISTRIBUTION_INVARIANT_BREACH` — the loudest failure this engine has — on a perfectly legal خيري
   * cohort: a `CHARITABLE_JIHA` beside a `CATEGORY_ONLY` segment ("the poor of the district, not yet
   * enrolled") is the ordinary state of a charitable deed before enrolment, both lines are paid, and
   * neither is a descendant of anyone. That is the same false-positive class as the I5 defect recorded
   * above, and it costs nothing to avoid: a paid line is a **bloodline** line iff the engine placed it in
   * the waqif's family tree, which `basis.lineageDepth`/`basis.lineageLink` record per line.
   *
   * Every *sharing* catch survives the narrowing, because the escapes that shared paid a line the engine
   * had itself CERTIFIED as a descendant: R6-D1's `CATEGORY_ONLY` placeholders (derived ṭabaqāt 1 and 2,
   * cross-check passed) and ESC-1's identical cohort under `ORDERED`. Verified by mutation: with both
   * cohort refusals disabled, the pre-R7 input that paid a charity 13,750,000 halalas beside a living
   * ṭabaqa-1 descendant is refused here — and the variant where every descendant was already dead is
   * **not**, correctly, because nothing is shared there. See the caveat on this function's doc.
   */
  const paidCharitableIds: string[] = [];
  const paidDescendantIds: string[] = [];
  for (const line of lines) {
    if ((line.entitledMinor as bigint) === 0n) continue;
    if (line.basis.kind === 'CHARITABLE_JIHA') {
      paidCharitableIds.push(line.beneficiaryId);
      continue;
    }
    // In the waqif's family tree — the fact R5 is about. `lineageDepth` is the DERIVED depth, so this is
    // the engine's own certification of descent rather than the register's unchecked claim.
    if (line.basis.lineageDepth !== null || line.basis.lineageLink !== null) {
      paidDescendantIds.push(line.beneficiaryId);
    }
  }
  if (paidCharitableIds.length > 0 && paidDescendantIds.length > 0) {
    throw distributionInvariantBreach(
      'I-R1',
      `this run pays ${String(paidCharitableIds.length)} charitable jiha (${paidCharitableIds.join(', ')}) AND ${String(paidDescendantIds.length)} certified descendant${paidDescendantIds.length === 1 ? '' : 's'} of the waqif (${paidDescendantIds.join(', ')}) out of the same distributable. A waqf is either خيري (charitable) or ذري (ancestral/generational) and never both (R5): a charity may be a ذري endowment's ULTIMATE TAKER, taking the ghallah once the bloodline is over, but it never SHARES a period's ghallah with the bloodline`,
      {
        waqfType: input.waqfType,
        paidCharitableIds: paidCharitableIds.join(','),
        paidDescendantIds: paidDescendantIds.join(','),
        reversionRecorded: input.reversion !== null,
      },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I6 · a gate never moves a halala
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I6: changing a beneficiary's gate result leaves every OTHER line's `entitledMinor` unchanged.
 * Payability is orthogonal to the split.
 *
 * **I6 is primarily STRUCTURAL, and that is stronger than any runtime check**: `./gates.ts` and
 * `./resolver.ts` contain no `Minor` in any signature, local or import, so neither stage *can* read
 * or produce an amount. The code-review rule is in `gates.ts`'s header: if `Minor` appears there,
 * I6 has stopped being structural.
 *
 * ⚠ **ADR-0009 makes the structural claim harder to keep, and it is restated rather than assumed.**
 * `./resolver.ts` took the largest addition of its life (the lineage graph) and the per-capita flag is
 * the first thing in it that *looks* numeric. The code-review rule now lives in **both** headers: if
 * `Minor`, `Decimal`, `Number(...)` or any arithmetic on a weight appears in either module, I6 has
 * stopped being structural. The weight comparison in `resolver.canonicalWeight` is string-only for
 * exactly that reason.
 *
 * What THIS function adds is the checkable consequence, and it is not a paraphrase of Stage 5:
 * it recomputes the **entire Hamilton split** — floors, exact bigint remainders, the
 * ascending-`beneficiaryId` tie-break and the leftover-halala bumps — from the entitled cohort's
 * **effective** weights derived from `input.beneficiaries` **and the declared order**, with **no gate
 * data in scope at all**, and requires every emitted line to match halala for halala. So:
 *
 *  · a gate outcome that inflated one line and deflated another (equal floors, swapped bumps) is
 *    caught, because the *tie-break order* is recomputed, not just the floor band;
 *  · a line-assembly bug that mis-indexed the amounts is caught;
 *  · a resolver that altered an entitled member's deed weight is caught, because the weights come
 *    from the input rather than from `resolution.resolved`;
 *  · **a resolver that applied deed weights to a per-capita lineage cohort is caught**, because the
 *    effective weight is derived from the ORDER (see {@link effectiveWeightsFor}) rather than read
 *    back from the resolution. I-L1 names that failure more precisely and runs first; this catches it
 *    too, from a completely different direction.
 *
 * This is the **third** independent implementation of the split (after `../money.js`'s `Decimal`
 * allocator and `./allocate.ts`'s bigint one). Three is deliberate, not accidental: Sprints 1 and 2
 * both shipped defects that existed precisely because nothing compared two sides that were supposed
 * to agree.
 *
 * What it does NOT prove: perturbation independence as a *universal* statement (flip any one gate,
 * nothing else moves). That quantifies over inputs and belongs to the fast-check property test.
 */
function assertGateNeutrality(ctx: InvariantContext): void {
  const { input, lines, order, totals, entitledIds, floorsMinor, waterfall } = ctx;

  if (entitledIds.length !== totals.entitledLineCount) {
    throw distributionInvariantBreach(
      'I6',
      `${String(entitledIds.length)} beneficiaries are entitled but ${String(totals.entitledLineCount)} non-EXCLUDED lines were emitted`,
      { entitledIds: entitledIds.length, entitledLineCount: totals.entitledLineCount },
    );
  }
  if (floorsMinor.length !== entitledIds.length) {
    throw distributionInvariantBreach(
      'I6',
      `the allocation carries ${String(floorsMinor.length)} floors for an entitled cohort of ${String(entitledIds.length)}`,
      { floorCount: floorsMinor.length, entitledCount: entitledIds.length },
    );
  }

  const byId = new Map<string, BeneficiaryInput>(
    input.beneficiaries.map((beneficiary) => [beneficiary.id, beneficiary]),
  );

  // The cohort in the ONE order the split is defined over. Sorted here rather than trusted, so a
  // caller that handed the weight vector in input order fails instead of mis-paying.
  const cohort = [...entitledIds].sort(compareBeneficiaryIds);
  const weights = effectiveWeightsFor(
    order,
    cohort,
    byId,
    // R7 · taken from the INPUT's deed clause, not from the resolution, so this stays an independent
    // derivation: a resolver that gave a taker a per-capita head instead of its recorded weight produces
    // amounts that do not match the recomputation.
    input.reversion === null ? EMPTY_ID_SET : new Set(input.reversion.ultimateTakerIds),
  );

  const expected = independentHamilton(waterfall.distributableMinor as bigint, weights);

  if (expected.residualMinor !== (totals.residualMinor as bigint)) {
    throw distributionInvariantBreach(
      'I9',
      `totals.residualMinor is ${String(totals.residualMinor)} halalas; splitting the entitled cohort's own deed weights independently gives ${String(expected.residualMinor)}`,
      {
        reported: String(totals.residualMinor),
        recomputed: String(expected.residualMinor),
      },
    );
  }

  const entitledLines = lines.filter((line) => line.status !== 'EXCLUDED');
  for (const [index, beneficiaryId] of cohort.entries()) {
    const line = entitledLines[index];
    const expectedFloor = expected.floorsMinor[index];
    const expectedAmount = expected.amountsMinor[index];
    const suppliedFloor = floorsMinor[index];

    if (
      line === undefined ||
      expectedFloor === undefined ||
      expectedAmount === undefined ||
      suppliedFloor === undefined
    ) {
      throw distributionInvariantBreach(
        'I6',
        `the entitled cohort and the emitted lines disagree in length at index ${String(index)} (beneficiary "${beneficiaryId}")`,
        { index, beneficiaryId },
      );
    }

    if (line.beneficiaryId !== beneficiaryId) {
      throw distributionInvariantBreach(
        'I6',
        `entitled line ${String(index)} is "${line.beneficiaryId}" but the ascending-id cohort has "${beneficiaryId}" there. The amounts are positional, so a mis-ordered cohort pays the right totals to the wrong people`,
        { index, lineBeneficiaryId: line.beneficiaryId, cohortBeneficiaryId: beneficiaryId },
      );
    }
    if (suppliedFloor !== expectedFloor) {
      throw distributionInvariantBreach(
        'I9',
        `the floor reported for "${beneficiaryId}" is ${String(suppliedFloor)} halalas; the independent split gives ${String(expectedFloor)}`,
        { beneficiaryId, reported: String(suppliedFloor), recomputed: String(expectedFloor) },
      );
    }
    if ((line.entitledMinor as bigint) !== expectedAmount) {
      throw distributionInvariantBreach(
        'I6',
        `line "${beneficiaryId}" (status ${line.status}) carries ${String(line.entitledMinor)} halalas; the split of the deed weights alone — computed with no gate data in scope — gives ${String(expectedAmount)}. A payability gate must never change an amount: a withheld share is retained in the waqf's own account, never reallocated`,
        {
          beneficiaryId,
          status: line.status,
          emitted: String(line.entitledMinor),
          fromWeightsOnly: String(expectedAmount),
        },
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I7 · direct-use nullity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I7: `entitlementOrder === 'NA_DIRECT_USE'` ⇒ `distributionType === 'NA_DIRECT_USE'` and
 * `lines === []`, **regardless of period revenue**. The waterfall still computes (§08 line 54) and
 * any positive distributable is reported as `totals.retainedMinor`.
 *
 * Asserted as a **biconditional**, which §08 states only one way round: a `MONETARY` run must not
 * claim the direct-use type either, or a run that did pay a family would be filed as a
 * no-distribution run.
 *
 * ⚠ **PRECEDENCE AMENDED BY ADR-0009 — the substance is unchanged, the ranking is not.** I7 used to
 * outrank the joint-legs refusal: S3 short-circuited a direct-use run *before* checking that a JOINT
 * waqf declared both legs, on the reasoning that a run moving no ghallah should not be refused for an
 * incomplete split. R5 dissolves that reasoning — a `JOINT` waqf is not a waqf with an incomplete
 * record, it is **not a waqf** — so a direct-use JOINT waqf is now refused at Stage 0 and never
 * reaches this assertion. I7 remains **unconditional for runs that happen**: direct use ⇒ no cohort,
 * no monetary line, whatever the period's revenue was.
 */
export function assertDirectUseNullity(
  order: EntitlementOrder,
  distributionType: 'MONETARY' | 'NA_DIRECT_USE',
  lines: readonly DistributionLine[],
): void {
  const orderIsDirectUse = order === 'NA_DIRECT_USE';
  const typeIsDirectUse = distributionType === 'NA_DIRECT_USE';

  if (orderIsDirectUse !== typeIsDirectUse) {
    throw distributionInvariantBreach(
      'I7',
      `entitlementOrder is ${order} but distributionType is ${distributionType}. The two must agree: a direct-utilization waqf distributes no ghallah, and a monetary run must never be filed as one that did not`,
      { order, distributionType },
    );
  }

  if (typeIsDirectUse && lines.length > 0) {
    throw distributionInvariantBreach(
      'I7',
      `a direct-utilization run emitted ${String(lines.length)} line(s). Beneficiaries of an intifāʿ-mubāshir waqf benefit from the asset itself, so there is no monetary line whatever the period's revenue was`,
      { lineCount: lines.length },
    );
  }
}

/**
 * I7's monetary half: on a direct-use run nothing is paid, withheld or routed, and the whole
 * distributable is reported as retained.
 *
 * Split out because the briefed {@link assertDirectUseNullity} signature takes no totals. Together
 * with it this is what makes worked example C2 — a direct-use waqf WITH period revenue — assertable
 * at all; it is the one case in which §08's I3 as originally written is arithmetically false.
 *
 * ⚠ HONESTY NOTE — **defence in depth, not an independent check.** Once
 * {@link assertDirectUseNullity} has established `lines === []`, {@link assertSplitConservation}
 * already forces every status sum to `0` and `retained` to equal `distributable`, so this function
 * cannot be the *sole* failure on a real run and no single-field mutation of one can reach it. It is
 * kept because it states I7's monetary claim directly — a reader looking for "a direct-use waqf
 * distributes nothing" finds it asserted, not inferred from two other invariants — and because it
 * would bite immediately if the nullity or conservation checks were ever weakened. It is exported so
 * the claim is testable on its own rather than only through its implication.
 */
export function assertDirectUseTotals(totals: Totals, waterfall: Waterfall): void {
  const moved: ReadonlyArray<readonly [string, bigint]> = [
    ['paidMinor', totals.paidMinor as bigint],
    ['withheldMinor', totals.withheldMinor as bigint],
    ['crossBorderMinor', totals.crossBorderMinor as bigint],
    ['entitledMinor', totals.entitledMinor as bigint],
  ];
  for (const [field, value] of moved) {
    if (value !== 0n) {
      throw distributionInvariantBreach(
        'I7',
        `a direct-utilization run reports totals.${field} = ${String(value)} halalas. No ghallah moves on a direct-use waqf`,
        { field, value: String(value) },
      );
    }
  }

  if ((totals.retainedMinor as bigint) !== (waterfall.distributableMinor as bigint)) {
    throw distributionInvariantBreach(
      'I7',
      `a direct-utilization run computed ${String(waterfall.distributableMinor)} halalas of distributable but reports ${String(totals.retainedMinor)} as retained. The whole distributable must be visible as retained — where it then goes is OQ-01 sub-question 2 and is unsigned, so the engine reports it and decides nothing`,
      {
        retainedMinor: String(totals.retainedMinor),
        distributableMinor: String(waterfall.distributableMinor),
      },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I9 · the residual bound
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I9: `0 <= residualMinor < entitledLineCount` halalas, and `0` when there are no entitled lines.
 *
 * A **negative** residual is the signature failure of half-up rounding — `Σ lines` exceeding
 * distributable, i.e. distributing money the waqf does not have. That is why §16/BUILD-PLAN's
 * "half-up" is arithmetically incompatible with the largest-remainder method §08 Stage 5 specifies,
 * and why this engine floors first (see `./allocate.ts`'s header).
 */
export function assertResidualBound(residualMinor: Minor, entitledLineCount: number): void {
  const residual = residualMinor as bigint;

  if (residual < 0n) {
    throw distributionInvariantBreach(
      'I9',
      `the residual is ${String(residual)} halalas. A negative residual means Σ lines EXCEEDS distributable — money the waqf does not have`,
      { residualMinor: String(residual) },
    );
  }
  if (!Number.isInteger(entitledLineCount) || entitledLineCount < 0) {
    throw distributionInvariantBreach(
      'I9',
      `entitledLineCount is ${String(entitledLineCount)}; the residual bound is stated against a non-negative integer line count`,
      { entitledLineCount: String(entitledLineCount) },
    );
  }
  if (entitledLineCount === 0) {
    if (residual !== 0n) {
      throw distributionInvariantBreach(
        'I9',
        `a run with no entitled line reports a residual of ${String(residual)} halalas. With nothing to split there is no leftover to hand out`,
        { residualMinor: String(residual) },
      );
    }
    return;
  }
  if (residual >= BigInt(entitledLineCount)) {
    throw distributionInvariantBreach(
      'I9',
      `the residual is ${String(residual)} halalas across ${String(entitledLineCount)} entitled line(s); largest-remainder leaves strictly fewer leftover halalas than lines`,
      { residualMinor: String(residual), entitledLineCount },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I-C1 · the corpus invariant (CLAUDE.md binding rule 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * I-C1 — the invariant §08 never wrote down, and the one whose failure would mean endowed principal
 * had been distributed.
 *
 *  · `waterfall.revenueMinor == Σ receipts[INCOME].amountMinor` (ghallah / غلة, re-summed here);
 *  · `waterfall.capitalReceiptsMinor == Σ receipts[CAPITAL].amountMinor` (asl / أصل);
 *  · `distributableMinor <= revenueMinor`;
 *  · **the capital total appears in NO downstream figure**, asserted as
 *    `Σ entitled + retained + ṣiyāna reserve + operating + Nazir fee == revenueMinor`. If a single
 *    halala of corpus had leaked into any deduction or any line, that identity would exceed
 *    `revenueMinor` by exactly the leak.
 *
 * The two sums are re-derived from `input.revenue.receipts` rather than read off the waterfall, so
 * this is a check on `assertIncomeProvenance` rather than a restatement of it. Sale proceeds,
 * istibdal (استبدال) proceeds and expropriation compensation are corpus: never distributed, never
 * eroded, never reclassified as income.
 */
export function assertCorpusSegregation(
  input: DistributionInput,
  waterfall: Waterfall,
  totals: Totals,
): void {
  let incomeSum = 0n;
  let capitalSum = 0n;
  for (const receipt of input.revenue.receipts) {
    if (receipt.receiptClass === 'INCOME') {
      incomeSum += receipt.amountMinor;
      continue;
    }
    if (receipt.receiptClass === 'CAPITAL') {
      capitalSum += receipt.amountMinor;
      continue;
    }
    // Unreachable: `assertIncomeProvenance` refuses an unrecognised class with
    // RECEIPT_UNCLASSIFIED before any arithmetic. Reaching here means the corpus guard was bypassed.
    throw distributionInvariantBreach(
      'I-C1',
      `receipt "${receipt.id}" carries receiptClass ${JSON.stringify(receipt.receiptClass)}, which is neither ${RECEIPT_CLASSES.join(' nor ')}. An unclassified receipt reached the invariants, so the corpus guard did not run`,
      { receiptId: receipt.id, receiptClass: receipt.receiptClass },
    );
  }

  if (incomeSum !== (waterfall.revenueMinor as bigint)) {
    throw distributionInvariantBreach(
      'I-C1',
      `waterfall.revenueMinor is ${String(waterfall.revenueMinor)} halalas but the INCOME-class receipts sum to ${String(incomeSum)}. The waterfall's pool must be exactly the classified ghallah`,
      {
        revenueMinor: String(waterfall.revenueMinor),
        incomeReceiptsMinor: String(incomeSum),
      },
    );
  }
  if (capitalSum !== (waterfall.capitalReceiptsMinor as bigint)) {
    throw distributionInvariantBreach(
      'I-C1',
      `waterfall.capitalReceiptsMinor is ${String(waterfall.capitalReceiptsMinor)} halalas but the CAPITAL-class receipts sum to ${String(capitalSum)}. Corpus must be reported exactly as it was classified, so that its absence from every figure below is auditable`,
      {
        capitalReceiptsMinor: String(waterfall.capitalReceiptsMinor),
        capitalReceiptsFromReceipts: String(capitalSum),
      },
    );
  }

  if ((waterfall.distributableMinor as bigint) > (waterfall.revenueMinor as bigint)) {
    throw distributionInvariantBreach(
      'I-C1',
      `distributable is ${String(waterfall.distributableMinor)} halalas against revenue of ${String(waterfall.revenueMinor)}. Distributable can never exceed the period's income — value beyond it could only have come from corpus`,
      {
        distributableMinor: String(waterfall.distributableMinor),
        revenueMinor: String(waterfall.revenueMinor),
      },
    );
  }

  const accountedFor =
    (totals.entitledMinor as bigint) +
    (totals.retainedMinor as bigint) +
    (waterfall.maintenanceReserveMinor as bigint) +
    (waterfall.operatingCostMinor as bigint) +
    (waterfall.nazirFeeMinor as bigint);
  if (accountedFor !== (waterfall.revenueMinor as bigint)) {
    throw distributionInvariantBreach(
      'I-C1',
      `Σ entitled + retained + ṣiyāna reserve + operating + Nazir fee = ${String(accountedFor)} halalas against income of ${String(waterfall.revenueMinor)}. The ${String(capitalSum)} halalas of capital (asl) receipts must be arithmetically absent from every figure below revenue; a difference of exactly that amount means corpus entered the waterfall`,
      {
        accountedForMinor: String(accountedFor),
        revenueMinor: String(waterfall.revenueMinor),
        capitalReceiptsMinor: String(capitalSum),
      },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The independent Hamilton split used by I6 / I9
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface IndependentSplit {
  readonly amountsMinor: readonly bigint[];
  readonly floorsMinor: readonly bigint[];
  readonly residualMinor: bigint;
}

/**
 * The weight vector the split *should* have used, derived from the input and the DECLARED ORDER.
 *
 * This is where I6 stays an independent check under ADR-0009 rather than becoming a restatement:
 *
 *  · `LINEAGE_CONTINUATION` ⇒ **`'1'` per head** (R3). Derived from the order, **not** read back from
 *    `resolution.resolved[].stipulatedWeight`, so a resolver that applied the deed's figures to a
 *    per-capita cohort produces amounts that do not match this recomputation.
 *  · every other order ⇒ the beneficiary's own deed weight, exactly as before.
 *
 *  · **R7** · a **recorded ultimate taker** takes its own deed weight on EVERY order, including
 *    `LINEAGE_CONTINUATION`. Per capita is the bloodline's rule and a charity is not a head of a
 *    bloodline (R7-e), so a taker handed `'1'` beside a 70/30 clause would be a real mis-split. The taker
 *    set comes from `input.reversion` — the deed clause — never from the resolution.
 *
 * ⚠ It must stay keyed on the ORDER (and, for a taker, on the deed's own clause). Keying it on "are the
 * emitted weights all equal?" would make the check agree with whatever the resolver did, which is the
 * failure mode this whole module avoids.
 */
function effectiveWeightsFor(
  order: EntitlementOrder,
  cohort: readonly string[],
  byId: ReadonlyMap<string, BeneficiaryInput>,
  ultimateTakerIds: ReadonlySet<string>,
): readonly string[] {
  return cohort.map((beneficiaryId) => {
    const beneficiary = byId.get(beneficiaryId);
    if (beneficiary === undefined) {
      throw distributionInvariantBreach(
        'I6',
        `entitled beneficiary "${beneficiaryId}" is not among the input beneficiaries, so the weight the split used cannot be verified`,
        { beneficiaryId },
      );
    }
    // One head, one share. See `resolver.PER_CAPITA_WEIGHT` — deliberately duplicated as a literal
    // rather than imported, so the two modules are not one module wearing two hats. A recorded ultimate
    // taker is never a head: its share is the deed's own figure (R7-e).
    return order === 'LINEAGE_CONTINUATION' && !ultimateTakerIds.has(beneficiaryId)
      ? '1'
      : beneficiary.stipulatedWeight;
  });
}

/** The taker set of a deed with no reversion clause. Frozen and shared — it is read, never added to. */
const EMPTY_ID_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

/**
 * The largest-remainder split, derived here for the third time and on purpose.
 *
 * Hand-rolled in `bigint` from the raw decimal-string weights, with **no `Decimal` and no import
 * from `./allocate.ts`**: sharing either would make this a re-run of the component it is meant to
 * cross-check. Remainders are compared as exact bigints — never divided into a JS `number`, where
 * two remainders differing in the 17th significant digit would compare equal and the tie-break
 * would move a halala to the wrong family member.
 */
function independentHamilton(totalMinor: bigint, weights: readonly string[]): IndependentSplit {
  const scale = weights.reduce((widest, weight, index) => {
    const fraction = fractionDigitsOf(weight, index);
    return Math.max(widest, fraction.length);
  }, 0);

  if (scale > MAX_WEIGHT_DECIMAL_PLACES) {
    throw distributionInvariantBreach(
      'I6',
      `the entitled cohort's deed weights need ${String(scale)} decimal places; at most ${String(MAX_WEIGHT_DECIMAL_PLACES)} is representable`,
      { weightScale: scale, maximum: MAX_WEIGHT_DECIMAL_PLACES },
    );
  }

  const integers = weights.map((weight, index) => {
    const dot = weight.indexOf('.');
    const integerDigits = dot === -1 ? weight : weight.slice(0, dot);
    return BigInt(integerDigits + fractionDigitsOf(weight, index).padEnd(scale, '0'));
  });
  const weightTotal = integers.reduce((running, value) => running + value, 0n);

  if (weightTotal === 0n) {
    throw distributionInvariantBreach(
      'I6',
      "the entitled cohort's effective weights sum to zero. Under ORDERED/SHARED a member whose deed share is zero must be EXCLUDED upstream (ZERO_STIPULATED_WEIGHT); under LINEAGE_CONTINUATION every eligible HEAD carries a weight of 1; and a recorded ultimate taker whose deed weight is zero is likewise excluded upstream, with an ALL-zero taker vector refused outright (ULTIMATE_TAKER_WEIGHTS_UNUSABLE). So an entitled cohort can never have a zero denominator on any path",
      { cohortSize: weights.length },
    );
  }

  const rows = integers.map((weightInteger, index) => {
    const numerator = totalMinor * weightInteger;
    // Both operands are non-negative (I4 has already run), so bigint truncation IS the floor.
    const floorMinor = numerator / weightTotal;
    return { index, floorMinor, remainder: numerator - floorMinor * weightTotal };
  });

  const floorsMinor = rows.map((row) => row.floorMinor);
  const residualMinor = totalMinor - floorsMinor.reduce((running, value) => running + value, 0n);

  // Largest remainder first; ties by ascending index, which — because `cohort` is sorted — IS §08's
  // ascending-`beneficiaryId` tie-break.
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

  return {
    amountsMinor: rows.map((row) => row.floorMinor + (bumped.has(row.index) ? 1n : 0n)),
    floorsMinor,
    residualMinor,
  };
}

/** Significant fraction digits of a validated non-negative decimal literal. `'1.50'` → `'5'`. */
function fractionDigitsOf(weight: string, index: number): string {
  if (!/^\d+(?:\.\d+)?$/.test(weight)) {
    // The contract's `stipulatedWeightSchema` already refused this shape, so reaching it means the
    // schema was bypassed by a cast.
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      `the deed weight at cohort index ${String(index)} ("${weight}") is not a non-negative plain decimal literal, so the split cannot be verified independently.`,
      { details: { index, weight } },
    );
  }
  const dot = weight.indexOf('.');
  return dot === -1 ? '' : weight.slice(dot + 1).replace(/0+$/, '');
}
