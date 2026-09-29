/**
 * `g9-adversarial.test.ts` — ADVERSARY 1's attack suite on gate **G-9**.
 *
 * G-9: "Waterfall conserves value (no leakage); shares sum correctly; ordered mode excludes lower
 * tiers while upper live."
 *
 * Every test here is an *attack*, not a restatement of the implementation. The suite is organised by
 * which G-9 clause it tries to break, and it has two kinds of member:
 *
 *  · **`describe('SURVIVED …')`** — an attack that the engine defeated. These are the positive
 *    evidence for G-9: each one asserts the defended property against an input chosen to break it.
 *  · **`describe('⚠ DEFECT …')`** — an attack that **SUCCEEDED**. These tests pin the engine's
 *    *current, wrong* behaviour so it cannot change silently, and each carries a `DEFECT-n` block
 *    stating what the correct behaviour would be and why the fix is not applied here. They are
 *    deliberately green: a red suite would be deleted, whereas a pinned defect gets read.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE ESTABLISHED, AND WHAT IT DID NOT
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * G-9 clause 1 (**conservation**) is *structurally* true and no input can break it, because
 * `computeWaterfall` derives `distributableMinor` AS the remainder `revenue − reserve − operating
 * − fee`. That makes invariant I1 a tautology, which `invariants.ts` states honestly. The load-
 * bearing question is therefore not "does it balance" but "**was each deduction computed from the
 * right base**", so every conservation test below ALSO recomputes each term independently from its
 * own basis with `percentOf` / the FIXED amount / `max(0, target − current)`.
 *
 * G-9 clause 2 (**shares sum**) survived every attack, over three independent implementations of
 * the split that must agree halala for halala before a run is emitted.
 *
 * G-9 clause 3 (**ordered exclusion**) was found **BROKEN in two directions**. Both are pinned
 * below; their status now differs, so read the status and not just the defect id.
 *
 * ✓✓ **CLAUSE 3 IS CERTIFIED AS OF 2026-08-17, AND THE CERTIFICATION NAMES WHAT GUARANTEES WHAT.** It had
 * been QUALIFIED since S3 — five premature closure claims are on this repo's record, none of them this one.
 * The owner's ruling (memo Q1: *"I-R1 is the guarantee"*) settled the one question that kept it open, and the
 * honest statement of the gate is now **two claims, two mechanisms**:
 *
 *  · **over DESCENDANTS** — no member of a ṭabaqa other than the entitled one is ever paid, asserted at
 *    runtime by invariant **I5**, which recomputes the lowest living ṭabaqa from the input;
 *  · **over the RECORDED ULTIMATE TAKER's line** (an untiered `CHARITABLE_JIHA` in a tiered family cohort,
 *    legal since R7) — **I5 says nothing about it, by design**, because a taker stands in no generation. It
 *    is guaranteed by its **default exclusion** (`REVERSION_PENDING_LIVING_BLOODLINE`) plus **I-R1's
 *    universal mirror**: no charity is paid a halala in the same run as any certified descendant.
 *
 * ⚠ **No comment, test or doc may say I5 covers the jiha line.** That sentence is what R6-I5 recorded as an
 * honesty gap, and the ruling resolves it by *scoping I5's claim*, not by widening I5.
 *   · DEFECT-A1 — ~~**STILL OPEN.**~~ **CLOSED, 2026-08-03, by refusal (R6).** ⚠ The struck wording is
 *     what this header said until 2026-08-10 and it was FALSE from R6 onward — the block below has read
 *     "CLOSED by refusal" since then, so the file contradicted itself. An untiered `FAMILY` member can no
 *     longer reach a run at all: `buildLineage` pass 4 halts `LINEAGE_LINK_MISSING` on **every** order, and
 *     supplying the link makes the declared `tabaqa: null` disagree with the derived depth
 *     (`TABAQA_MISMATCHES_LINEAGE_DEPTH`). The owner decided the *record* rather than the fiqh question, so
 *     "what an untiered family member IS" was never answered — it simply cannot be recorded.
 *     ✓ **Clause 3 was QUALIFIED for a different reason until 2026-08-17, and is now PROVEN:** R7 restores
 *     a reachable **untiered** line to a tiered family cohort (an ultimate-taker jiha), and what protects it
 *     is that line's default exclusion plus invariant I-R1. The owner **ruled that this is the guarantee**
 *     (memo Q1 — *"I-R1 is the guarantee"*; I5's claim is scoped to descendants), so the qualification is
 *     closed by the §"G-9 CLAUSE 3 · CERTIFIED" block at the end of this file. See the R7 block in
 *     DEFECT-A2 below for the configuration.
 *   · DEFECT-A2 — **CLOSED, 2026-07-30, by refusal.** A `CHARITABLE_JIHA` carrying a ṭabaqa now
 *     halts with `SHART_INCOMPLETE` (`resolver.assertJihaNotTiered`), so the misallocation it caused
 *     is unreachable. The two false comments it exposed are corrected in place. The cases below are
 *     inverted rather than deleted, so the exact inputs that lost SAR 560,000 can never compute.
 *     ⚠ **STILL CLOSED, BY A DIFFERENT RULE SINCE 2026-08-03.** `TABAQA_ON_CHARITABLE_WAQF` now
 *     refuses those inputs one stage earlier, and `assertJihaNotTiered` has become unreachable
 *     through `runDistribution` altogether — see this file's DEFECT-A2 block and the 120-cell
 *     enumeration in `jiha-tier-refusal.test.ts` §"REACHABILITY". The defect stays closed; what
 *     changed is only which refusal closes it.
 *
 * ⚠ PROVENANCE. The engine sources were being edited by sibling agents while this suite was
 * written, and one mid-write file state produced a spurious I1 breach that is NOT reproducible.
 * These results were taken against the snapshot whose md5s are recorded in the module report;
 * re-run this file after any engine edit rather than trusting the recorded outcome.
 */

import { describe, expect, it } from 'vitest';

import { isDomainError } from '../../errors.js';
import { fromMinor, percentOf, toMinor } from '../../money.js';
import { runDistribution } from '../engine.js';
import { resolveEntitlement } from '../resolver.js';
import { canonicalizeResult } from '../trace.js';
import { assertReversionIntegrity, type InvariantContext } from '../invariants.js';
import { assertResultShape, parseDistributionInput } from '../contract.js';
import type { DistributionInputRaw, DistributionResult, Minor } from '../contract.js';
import {
  BEN_001,
  BEN_002,
  BEN_003,
  BEN_006,
  BEN_007,
  BEN_008,
  BEN_306,
  BEN_307,
  beneficiary,
  exampleA,
  exampleDCharitable,
  exampleDJoint,
  exampleG,
  exampleH,
  patched,
  policy,
} from './fixtures/worked-examples.js';

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * Attack harness
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

type Attempt =
  | { readonly ok: true; readonly result: DistributionResult }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      /**
       * ADR-0009's `details.refusal` discriminator, surfaced by the harness.
       *
       * Necessary, not convenient: eighteen distinct refusals now share the `SHART_INCOMPLETE` code, so
       * an attack that asserted only the code could pass against a refusal it was not about — which is
       * precisely how R5's joint refusal would have silently invalidated the tiered-jiha attacks.
       */
      readonly refusal: string | null;
    };

/** Run an attack input without letting a refusal end the test — the refusal IS often the evidence. */
function attack(input: unknown): Attempt {
  try {
    return { ok: true, result: runDistribution(input as DistributionInputRaw) };
  } catch (error) {
    if (isDomainError(error)) {
      const details = error.details as Record<string, unknown> | undefined;
      const refusal = typeof details?.refusal === 'string' ? details.refusal : null;
      return { ok: false, code: error.code, message: error.message, refusal };
    }
    // A non-DomainError escaping a pure engine is itself a defect, so it is surfaced as one.
    return {
      ok: false,
      code: `NON_DOMAIN(${String(error)})`,
      message: String(error),
      refusal: null,
    };
  }
}

function mustRun(input: unknown): DistributionResult {
  const attempt = attack(input);
  if (!attempt.ok) throw new Error(`expected a run, got ${attempt.code}: ${attempt.message}`);
  return attempt.result;
}

/** `beneficiaryId → entitledMinor`, so a shifted halala is visible per person, not just in a total. */
function amountsById(result: DistributionResult): Readonly<Record<string, string>> {
  return Object.fromEntries(
    result.lines.map((line) => [line.beneficiaryId, String(line.entitledMinor)]),
  );
}

function statusesById(result: DistributionResult): Readonly<Record<string, string>> {
  return Object.fromEntries(
    result.lines.map((line) => [line.beneficiaryId, `${line.status}/${line.reasonCode ?? 'null'}`]),
  );
}

/** A minimal SHARED waqf whose only variables are the pool and the deed weights. */
function splitOnly(
  incomeMinor: bigint,
  weights: readonly (readonly [string, string])[],
): DistributionInputRaw {
  return {
    ...exampleA(),
    entitlementOrder: 'SHARED',
    revenue: {
      incomeMinor,
      receipts: [{ id: 'rev-split', receiptClass: 'INCOME', amountMinor: incomeMinor }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'NONE' },
    // `null` deed fee: the pool reaches the split undiminished, so the split is the only variable.
    nazirFee: null,
    beneficiaries: weights.map(([id, weight]) =>
      beneficiary({
        id,
        kind: 'FAMILY',
        active: true,
        tabaqa: 1,
        // ⚠ **IN the lineage graph now, and it is not optional.** This block used to read
        // `lineageLink: null` with the comment "ADR-0009 requires the edge only under
        // LINEAGE_CONTINUATION". **R6 retired that reading** (product owner, 2026-08-03): a
        // `FAMILY`/`CATEGORY_ONLY` member with no `lineageLink` halts `LINEAGE_LINK_MISSING` on EVERY
        // order, so every `splitOnly` harness below became an input the engine refuses.
        //
        // All of them are children of the waqif — `parentId: null` is the VALUE "the waqif is my
        // parent" (depth 1), never "unknown" — so the declared `tabaqa: 1` and the derived depth agree
        // and the flattest legal graph is the one that leaves the SPLIT as the only moving part, which
        // is what these harnesses are for.
        parentId: null,
        lineageLink: 'SON',
        line: 'ZUHUR',
        branch: 'Branch A',
        stipulatedWeight: weight,
        verificationStatus: 'VERIFIED',
        kycLastRefreshed: '2026-01-15',
        category: null,
        residency: 'DOMESTIC',
        disbursingEntity: null,
        bankingRefForProceeds: null,
      }),
    ),
  };
}

/**
 * An untiered member — the shape DEFECT-A1 turned on. `tabaqa: null` with a real deed weight.
 *
 * ⚠ **THIS RECORD IS NOW UNCONSTRUCTIBLE, AND THE HELPER IS KEPT VERBATIM SO THAT STAYS PROVABLE.**
 * R6 closed DEFECT-A1 by refusing the shape rather than by ruling on it, and it is closed on BOTH
 * of its fields, which is what makes it closed rather than moved:
 *
 *  · as written here (`lineageLink: null`) ⇒ `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING`;
 *  · give it the edge R6 demands (`lineageLink: 'SON'`, `parentId: null` ⇒ derived depth 1) and the
 *    `tabaqa: null` it is defined by then contradicts that depth ⇒ `TABAQA_MISMATCHES_LINEAGE_DEPTH`.
 *
 * Both are pinned in the inverted DEFECT-A1 block below. Do not "fix" this helper: its whole value is
 * that it still constructs the exact record that used to be paid SAR 275,000.
 */
function untiered(
  id: string,
  kind: 'FAMILY' | 'CATEGORY_ONLY',
  weight: string,
): DistributionInputRaw['beneficiaries'][number] {
  return beneficiary({
    id,
    kind,
    active: true,
    tabaqa: null,
    parentId: null,
    lineageLink: null,
    line: kind === 'FAMILY' ? 'ZUHUR' : 'NA',
    branch: kind === 'FAMILY' ? 'Branch A' : null,
    stipulatedWeight: weight,
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: kind === 'CATEGORY_ONLY' ? 'orphans of the family' : null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: null,
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * G-9 CLAUSE 1 · "the waterfall conserves value (no leakage)"
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('G-9 clause 1 · SURVIVED — no input leaks a halala out of the waterfall', () => {
  /**
   * Conservation AND term-by-term provenance in one assertion.
   *
   * Conservation alone is near-vacuous (I1 is a tautology — see the module header), so this also
   * recomputes the reserve and the fee from their own bases through `../../money.js`'s `percentOf`
   * — the one tested percentage path — and compares. A fee computed on the wrong base, or the
   * §08 `0.10`-vs-`'10'` defect, fails here while conservation still holds.
   */
  function assertWaterfallTermByTerm(
    result: DistributionResult,
    expected: {
      readonly reserveMinor: bigint;
      readonly feeMinor: bigint;
    },
  ): void {
    const w = result.waterfall;
    expect(w.maintenanceReserveMinor).toBe(expected.reserveMinor as Minor);
    expect(w.nazirFeeMinor).toBe(expected.feeMinor as Minor);
    expect(w.netIncomeMinor).toBe(
      (w.revenueMinor as bigint) -
        (w.maintenanceReserveMinor as bigint) -
        (w.operatingCostMinor as bigint),
    );
    expect(
      (w.maintenanceReserveMinor as bigint) +
        (w.operatingCostMinor as bigint) +
        (w.nazirFeeMinor as bigint) +
        (w.distributableMinor as bigint),
    ).toBe(w.revenueMinor as bigint);
    // Corpus never contributes to any figure below revenue (I-C1's arithmetic half).
    expect(
      (result.totals.entitledMinor as bigint) +
        (result.totals.retainedMinor as bigint) +
        (w.maintenanceReserveMinor as bigint) +
        (w.operatingCostMinor as bigint) +
        (w.nazirFeeMinor as bigint),
    ).toBe(w.revenueMinor as bigint);
  }

  /**
   * Prime halala revenues against a rate that divides nothing evenly.
   *
   * Chosen so `ratePercent × revenue / 100` is never an integer number of halalas: every case
   * exercises `percentOf`'s half-up rounding on BOTH the ṣiyāna reserve and a
   * `PERCENT_OF_NET_INCOME` fee whose base is itself a rounded figure.
   */
  it.each([1n, 7n, 33n, 101n, 1_000_003n, 9_999_991n, 999_999_937n])(
    'revenue %s halalas · 33.333333333333333333%% ṣiyāna · 10%% of net income',
    (revenue) => {
      const result = mustRun({
        ...exampleA(),
        revenue: {
          incomeMinor: revenue,
          receipts: [{ id: 'rev-prime', receiptClass: 'INCOME', amountMinor: revenue }],
        },
        operatingCostMinor: 0n,
        maintenance: { kind: 'PERCENT', ratePercent: '33.333333333333333333' },
        nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
        beneficiaries: [BEN_001, BEN_002, BEN_003],
      });

      const reserveMinor = toMinor(percentOf(fromMinor(revenue), '33.333333333333333333'));
      const netMinor = revenue - reserveMinor;
      const feeMinor = toMinor(percentOf(fromMinor(netMinor), '10'));
      assertWaterfallTermByTerm(result, { reserveMinor, feeMinor });
    },
  );

  /** A 100% ṣiyāna reserve leaves exactly nothing — the boundary at which the pool hits zero. */
  it('a 100% ṣiyāna reserve consumes the pool exactly and does not go negative', () => {
    const result = mustRun({
      ...exampleA(),
      revenue: {
        incomeMinor: 12_345_679n,
        receipts: [{ id: 'r', receiptClass: 'INCOME', amountMinor: 12_345_679n }],
      },
      operatingCostMinor: 0n,
      maintenance: { kind: 'PERCENT', ratePercent: '100' },
      nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    });
    expect(result.waterfall.maintenanceReserveMinor).toBe(12_345_679n as Minor);
    expect(result.waterfall.netIncomeMinor).toBe(0n as Minor);
    expect(result.waterfall.nazirFeeMinor).toBe(0n as Minor);
    expect(result.waterfall.distributableMinor).toBe(0n as Minor);
    expect(result.flags).toContain('NIL_DISTRIBUTION');
  });

  /** `TARGET_TOPUP` with the reserve already ABOVE its target must top up by 0, never by a credit. */
  it('TARGET_TOPUP with current > target reserves 0 and cannot inflate distributable', () => {
    const result = mustRun({
      ...exampleA(),
      maintenance: {
        kind: 'TARGET_TOPUP',
        targetBalanceMinor: 1_000_000n,
        currentBalanceMinor: 9_000_000n,
      },
    });
    expect(result.waterfall.maintenanceReserveMinor).toBe(0n as Minor);
    const feeMinor = toMinor(percentOf(fromMinor(35_000_000n), '10'));
    assertWaterfallTermByTerm(result, { reserveMinor: 0n, feeMinor });
    expect(result.waterfall.distributableMinor).toBe(31_500_000n as Minor);
  });

  /** A `TARGET_TOPUP` shortfall bigger than the period's income refuses; it never caps silently. */
  it('a TARGET_TOPUP shortfall exceeding revenue REFUSES rather than capping the ṣiyāna obligation', () => {
    const attempt = attack({
      ...exampleA(),
      maintenance: {
        kind: 'TARGET_TOPUP',
        targetBalanceMinor: 900_000_000n,
        currentBalanceMinor: 0n,
      },
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe('DISTRIBUTION_NEGATIVE');
  });

  /** A retainer larger than net income refuses, and no partial run escapes. */
  it('a RETAINER larger than net income REFUSES with DISTRIBUTION_NEGATIVE and emits no run', () => {
    const attempt = attack({
      ...exampleA(),
      nazirFee: { basis: 'RETAINER', fixedAmountMinor: 99_000_000n },
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe('DISTRIBUTION_NEGATIVE');
  });

  /**
   * A negative `PERCENT_OF_NET_INCOME` base must never become a *credit*.
   *
   * The net-income check runs BEFORE the fee is computed, so `reserve + operating > revenue` cannot
   * produce a negative fee that then restores a plausible-looking distributable.
   */
  it('reserve + operating exceeding revenue refuses BEFORE a negative fee can be computed', () => {
    const attempt = attack({
      ...exampleA(),
      operatingCostMinor: 40_000_000n,
      maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
      nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.code).toBe('DISTRIBUTION_NEGATIVE');
      // The message must name the NET INCOME step, proving the refusal happened before the fee.
      expect(attempt.message).toMatch(/operating cost/);
    }
  });

  /** ʿushr is 10% — never 0.1%. The `'10'`-vs-`0.10` defect is a 100× underpayment of the Nazir. */
  it('a PERCENT_OF_REVENUE rate of "10" takes 10%, not 0.1%', () => {
    const result = mustRun(exampleA());
    expect(result.waterfall.nazirFeeMinor).toBe(3_500_000n as Minor);
    expect(result.waterfall.nazirFeeMinor).not.toBe(35_000n as Minor);
  });

  /** Beyond the `Decimal(18,2)` column, the engine refuses rather than silently losing precision. */
  it('an astronomically large revenue refuses (typed) instead of overflowing quietly', () => {
    const huge = 10n ** 25n;
    const attempt = attack({
      ...exampleA(),
      revenue: {
        incomeMinor: huge,
        receipts: [{ id: 'r', receiptClass: 'INCOME', amountMinor: huge }],
      },
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      // ⚠ NOTE FOR THE PARENT AGENT: `MONEY_OVERFLOW` is a typed `DomainError`, but it is NOT in
      // `engine.ts`'s documented refusal table. The table is incomplete, not the guard.
      expect(attempt.code).toBe('MONEY_OVERFLOW');
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * G-9 CLAUSE 2 · "shares sum correctly"
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('G-9 clause 2 · SURVIVED — every split conserves the pool exactly', () => {
  function assertSplitConserves(result: DistributionResult): void {
    const entitled = result.lines.filter((line) => line.status !== 'EXCLUDED');
    const sum = entitled.reduce((running, line) => running + (line.entitledMinor as bigint), 0n);
    expect(sum + (result.totals.retainedMinor as bigint)).toBe(
      result.waterfall.distributableMinor as bigint,
    );
    expect(
      (result.totals.paidMinor as bigint) +
        (result.totals.withheldMinor as bigint) +
        (result.totals.crossBorderMinor as bigint) +
        (result.totals.retainedMinor as bigint),
    ).toBe(result.waterfall.distributableMinor as bigint);
    // I9's bound, re-asserted from the emitted run rather than from inside the engine.
    expect(result.totals.residualMinor as bigint).toBeGreaterThanOrEqual(0n);
    if (result.totals.entitledLineCount > 0) {
      expect(result.totals.residualMinor as bigint).toBeLessThan(
        BigInt(result.totals.entitledLineCount),
      );
    }
  }

  /** Equal weights over a line count coprime with the pool — the residual is live in every case. */
  it.each([2, 3, 7, 11, 13, 17, 41, 97, 300])(
    '%i equal-weight lines over a pool that does not divide evenly',
    (count) => {
      const weights = Array.from({ length: count }, (_unused, index) => {
        // Zero-padded so ascending code-point order equals ascending index for any count.
        const id = `ben-${String(index).padStart(4, '0')}`;
        return [id, '1'] as const;
      });
      // 10_007 is prime, so it is coprime with every count above.
      const result = mustRun(splitOnly(10_007n, weights));
      assertSplitConserves(result);
      expect(result.totals.entitledLineCount).toBe(count);
      const sum = result.lines.reduce(
        (running, line) => running + (line.entitledMinor as bigint),
        0n,
      );
      expect(sum).toBe(10_007n);
    },
  );

  /**
   * The tie-break is proven, not assumed.
   *
   * All remainders tie, so the leftover halalas must go to the code-point-LOWEST ids. The ids are
   * chosen so `localeCompare` would order them differently — `'ben-a'` sorts before `'ben-B'` under
   * ICU but AFTER it by code unit — so an implementation that used `localeCompare` would hand the
   * halala to a different family member and fail here.
   */
  it('an all-tie residual goes to the code-point-lowest id, NOT the locale-lowest', () => {
    const ids = ['ben-a', 'ben-B', 'ben-C', 'ben-d'] as const;
    const localeOrder = [...ids].sort((a, b) => a.localeCompare(b));
    // Guard the premise: if this ever stops holding the test has stopped being an attack.
    expect(localeOrder[0]).not.toBe('ben-B');

    // 10 halalas, 4 equal lines: floors 2 each (Σ 8), residual 2 → the two lowest code-point ids.
    const result = mustRun(
      splitOnly(
        10n,
        ids.map((id) => [id, '1'] as const),
      ),
    );
    expect(amountsById(result)).toStrictEqual({
      'ben-B': '3',
      'ben-C': '3',
      'ben-a': '2',
      'ben-d': '2',
    });
    expect(result.totals.residualMinor).toBe(2n as Minor);
    assertSplitConserves(result);
  });

  /** Arabic ids: still a total order, still conserved, still no ICU dependence. */
  it('Arabic and mixed-script ids split exactly and deterministically', () => {
    const ids = ['ben-ا', 'ben-ب', 'ben-A', 'ben-z'] as const;
    const first = mustRun(
      splitOnly(
        1_000_001n,
        ids.map((id) => [id, '3'] as const),
      ),
    );
    const reordered = mustRun(
      splitOnly(
        1_000_001n,
        [...ids].reverse().map((id) => [id, '3'] as const),
      ),
    );
    assertSplitConserves(first);
    expect(amountsById(first)).toStrictEqual(amountsById(reordered));
    expect(first.lines.map((line) => line.beneficiaryId)).toStrictEqual([
      'ben-A',
      'ben-z',
      'ben-ا',
      'ben-ب',
    ]);
  });

  /** An 18-dp weight against a whole one: the extreme of the representable weight range. */
  it('a 1e-18 deed weight beside a whole weight still conserves the pool', () => {
    const result = mustRun(
      splitOnly(27_500_000n, [
        ['ben-dust', '0.000000000000000001'],
        ['ben-whole', '12.5'],
      ]),
    );
    assertSplitConserves(result);
    const sum = result.lines.reduce(
      (running, line) => running + (line.entitledMinor as bigint),
      0n,
    );
    expect(sum).toBe(27_500_000n);
  });

  /** A 19-dp weight is refused, not truncated — the bound that keeps the bigint numerators finite. */
  it('a 19-dp deed weight is REFUSED rather than rounded to 18', () => {
    const attempt = attack(
      splitOnly(10_000n, [
        ['ben-a', '0.0000000000000000001'],
        ['ben-b', '1'],
      ]),
    );
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe('DISTRIBUTION_INPUT_INVALID');
  });

  /** A cohort in which EVERY deed weight is zero must not divide by zero, and must not throw. */
  it('an all-zero-weight cohort retains the whole pool instead of dividing by zero', () => {
    const result = mustRun(
      splitOnly(27_500_000n, [
        ['ben-a', '0'],
        ['ben-b', '0.00'],
        ['ben-c', '000'],
      ]),
    );
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(result.totals.retainedMinor).toBe(27_500_000n as Minor);
    expect(result.totals.entitledLineCount).toBe(0);
    expect(result.lines.every((line) => line.reasonCode === 'ZERO_STIPULATED_WEIGHT')).toBe(true);
    assertSplitConserves(result);
  });

  /** A duplicated beneficiary id is refused at the door — the split and the tie-break key on it. */
  it('a duplicated beneficiaryId is REFUSED, never silently merged or double-paid', () => {
    const attempt = attack(
      splitOnly(10_000n, [
        ['ben-dup', '1'],
        ['ben-dup', '1'],
      ]),
    );
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.code).toBe('DISTRIBUTION_INPUT_INVALID');
      expect(attempt.message).toMatch(/appears twice/);
    }
  });

  /** `sharePercent` must NOT be assertable as summing to 100 — pinning the false-friend explicitly. */
  it('sharePercent is display-only and does NOT sum to 100.000000', () => {
    const result = mustRun(
      splitOnly(10_000n, [
        ['ben-a', '1'],
        ['ben-b', '1'],
        ['ben-c', '1'],
      ]),
    );
    expect(result.lines.map((line) => line.sharePercent)).toStrictEqual([
      '33.340000',
      '33.330000',
      '33.330000',
    ]);
    const total = result.lines.reduce((running, line) => running + Number(line.sharePercent), 0);
    expect(total).toBeCloseTo(100.0, 5);
    // …but the money is exact, which is the point of not deriving anything from the percentages.
    expect(
      result.lines.reduce((running, line) => running + (line.entitledMinor as bigint), 0n),
    ).toBe(10_000n);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * G-9 CLAUSE 3 · "ordered mode excludes lower tiers while upper live"  — **BROKEN**
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('G-9 clause 3 · SURVIVED — the tier test itself is right when every member is tiered', () => {
  it('a living upper ṭabaqa excludes the lower one AND leaves its weight out of the denominator', () => {
    const result = mustRun(exampleA());
    // ben-002 (ṭabaqa 2) excluded, and ben-001/ben-003 get 50% each — not 33.3%, which is what a
    // resolver that "excluded" by zeroing the amount while leaving the weight in the divisor gives.
    expect(statusesById(result)['ben-002']).toBe('EXCLUDED/UPPER_TABAQA_EXTANT');
    expect(amountsById(result)).toStrictEqual({
      'ben-001': '13750000',
      'ben-002': '0',
      'ben-003': '13750000',
    });
  });

  /**
   * ⚠ **RE-POINTED: the premise had to change, because R6 made the old one unrepresentable.**
   *
   * This case used to drop every ṭabaqa-1 member from the cohort and run `[BEN_002]` alone, so that
   * ṭabaqa 2 was the lowest tier *recorded*. `BEN_002` carries `parentId: 'ben-001'` now — it must,
   * because its declared ṭabaqa 2 has to be reachable through a real edge — so that cohort halts
   * `LINEAGE_PARENT_UNKNOWN`. There is no way to restore the old shape: a ṭabaqa-2 descendant with no
   * ṭabaqa-1 parent in the register is precisely the unplaceable record R6 refuses.
   *
   * The monotonicity property is unchanged and is now stated over the shape that CAN exist: the
   * parent is present in both runs and only his **vital status** moves. Dead ⇒ ṭabaqa 2 is the lowest
   * LIVING tier and takes the whole distributable; alive ⇒ he takes it and ben-002 drops to 0. The
   * direction can only be down, which is the property.
   */
  it('adding a living upper-tier member never RAISES a lower tier (ordered monotonicity)', () => {
    const withoutUpper = mustRun({
      ...exampleA(),
      beneficiaries: [patched(BEN_001, { active: false }), BEN_002],
    });
    expect(amountsById(withoutUpper)['ben-002']).toBe('27500000');
    expect(statusesById(withoutUpper)['ben-001']).toBe('EXCLUDED/TABAQA_EXTINCT');

    // The SAME two people, one field changed: ben-001 alive. ben-002 drops to 0.
    const withUpper = mustRun({ ...exampleA(), beneficiaries: [BEN_001, BEN_002] });
    expect(amountsById(withUpper)['ben-002']).toBe('0');
    expect(amountsById(withUpper)['ben-001']).toBe('27500000');

    // …and the full three-member Example A agrees.
    expect(amountsById(mustRun(exampleA()))['ben-002']).toBe('0');
  });

  /**
   * ⚠ **INVERTED — a ṭabaqa numbered far from 1..n is now a REFUSED record, and the input is kept.**
   *
   * MEASURED before R6, on this exact cohort: it COMPUTED, with
   *   { ben-hi: EXCLUDED/UPPER_TABAQA_EXTANT, ben-mid: EXCLUDED/UPPER_TABAQA_EXTANT,
   *     ben-lo: WITHHELD/KYC_UNVERIFIED } and ben-lo entitled to the whole 27,500,000 halalas.
   *
   * ṭabaqa is now **derived from the parent edges and cross-checked** against the declared value, so
   * a member declaring ṭabaqa 500 must have 499 recorded ancestors. `ben-hi`'s
   * `9_007_199_254_740_991` is `Number.MAX_SAFE_INTEGER` and is not reachable by any register that
   * could exist. The refusal is the honest answer and the arbitrary-number attack is closed by
   * construction rather than by an ordering rule that happened to hold.
   */
  it('INVERTED: a ṭabaqa numbered far from 1..n is refused — the depth must be REACHABLE', () => {
    // The input VERBATIM. It halts on the dangling edge first — `BEN_002` carries `parentId:
    // 'ben-001'` and this cohort renames every member — so the refusal that fires is
    // `LINEAGE_PARENT_UNKNOWN`. That is a real refusal of this exact record and is asserted as such.
    const verbatim = attack({
      ...exampleA(),
      beneficiaries: [
        patched(BEN_001, { id: 'ben-hi', tabaqa: 9_007_199_254_740_991 }),
        patched(BEN_002, { id: 'ben-mid', tabaqa: 500 }),
        patched(BEN_003, { id: 'ben-lo', tabaqa: 499 }),
      ],
    });
    expect(verbatim.ok).toBe(false);
    if (verbatim.ok) return;
    expect(verbatim.code).toBe('SHART_INCOMPLETE');
    expect(verbatim.refusal).toBe('LINEAGE_PARENT_UNKNOWN');

    // …and with that dangling edge cleared — every member a child of the waqif, the most generous
    // reading available — the ṭabaqāt themselves are what is refused: derived depth 1 against declared
    // 499 / 500 / 9_007_199_254_740_991. THAT is the claim this test is named for, so it is asserted
    // separately rather than left to be inferred from the first refusal.
    const rooted = attack({
      ...exampleA(),
      beneficiaries: [
        patched(BEN_001, { id: 'ben-hi', tabaqa: 9_007_199_254_740_991, parentId: null }),
        patched(BEN_002, { id: 'ben-mid', tabaqa: 500, parentId: null }),
        patched(BEN_003, { id: 'ben-lo', tabaqa: 499, parentId: null }),
      ],
    });
    expect(rooted.ok).toBe(false);
    if (rooted.ok) return;
    expect(rooted.code).toBe('SHART_INCOMPLETE');
    expect(rooted.refusal).toBe('TABAQA_MISMATCHES_LINEAGE_DEPTH');
  });

  /**
   * …and the ordering claim the inverted case used to carry, re-pointed onto a REACHABLE chain.
   *
   * Three generations, each ṭabaqa reached through a real `parentId`, so the derived depth and the
   * declared ṭabaqa agree at every level. The verdicts are the ones the old far-numbered cohort
   * produced — al-aʿlā fa-l-aʿlā is about the ORDER of the tiers, and nothing in it depended on the
   * numbers being adjacent, which is what the original test set out to show.
   */
  it('orders a three-deep REACHABLE chain correctly — 1 excludes 2 excludes 3', () => {
    const result = mustRun({
      ...exampleA(),
      beneficiaries: [
        patched(BEN_003, { id: 'ben-lo', tabaqa: 1, parentId: null }),
        patched(BEN_002, { id: 'ben-mid', tabaqa: 2, parentId: 'ben-lo' }),
        patched(BEN_001, { id: 'ben-hi', tabaqa: 3, parentId: 'ben-mid' }),
      ],
    });
    expect(statusesById(result)).toStrictEqual({
      'ben-hi': 'EXCLUDED/UPPER_TABAQA_EXTANT',
      'ben-lo': 'WITHHELD/KYC_UNVERIFIED',
      'ben-mid': 'EXCLUDED/UPPER_TABAQA_EXTANT',
    });
    expect(amountsById(result)['ben-lo']).toBe('27500000');
  });

  it.each([0, -1, 1.5])('a ṭabaqa of %s is REFUSED at the boundary, not coerced', (tabaqa) => {
    const attempt = attack({
      ...exampleA(),
      beneficiaries: [patched(BEN_001, { tabaqa: tabaqa as number }), BEN_002, BEN_003],
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe('DISTRIBUTION_INPUT_INVALID');
  });

  it('SHARED is the contrast: the same tier shape excludes nobody', () => {
    const result = mustRun({ ...exampleA(), entitlementOrder: 'SHARED' });
    expect(result.totals.excludedCount).toBe(0);
    expect(result.totals.entitledLineCount).toBe(3);
  });

  /**
   * The excluded member's weight must leave the resolver as `'0'`, not merely be filtered later.
   *
   * Driven against `resolveEntitlement` directly, because through `runDistribution` the two are
   * indistinguishable: `entitledCohortWeights` already filters on `entitled`, so an excluded
   * member's weight never reaches the allocator either way. That makes the resolver's own `'0'`
   * a **defence in depth for a future consumer** that forgets to filter — the exact fixture failure
   * mode the audit names (waqf-001's three `12.5` weights summing to 37.5). Asserting it here is
   * what stops that safety net being deleted as dead code.
   */
  it('an excluded member leaves the resolver with weight "0", so a naive consumer still divides right', () => {
    const input = parseDistributionInput(exampleA());
    const resolution = resolveEntitlement(input);
    const excluded = resolution.resolved.find((member) => !member.entitled);
    expect(excluded?.beneficiaryId).toBe('ben-002');
    expect(excluded?.stipulatedWeight).toBe('0');
    // The deed's own figure is preserved, not destroyed.
    expect(excluded?.source.stipulatedWeight).toBe('12.5');
    // A consumer that sums every row's effective weight gets the entitled denominator, not 37.5.
    const naiveDenominator = resolution.resolved.reduce(
      (running, member) => running + Number(member.stipulatedWeight),
      0,
    );
    expect(naiveDenominator).toBe(25);
  });
});

describe('G-9 clause 3 · DEFECT-A1 — CLOSED by refusal: an untiered FAMILY member halts the run', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * DEFECT-A1 · ATTACK SUCCEEDED, THEN WAS CLOSED. Severity was HIGH.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   *
   * ⚠⚠ **EVERY TEST IN THIS BLOCK IS INVERTED, NOT DELETED. THE INPUTS ARE VERBATIM.** Each one used
   * to assert an amount the engine actually paid; each now asserts the refusal that stops it, and
   * carries the measured figure it used to produce. Deleting them would have thrown away the only
   * record of what the defect cost, and re-pointing them at a different cohort would have left the
   * original attack untested.
   *
   * **How it was closed (product-owner decision, 2026-08-03 — ADR-0009 open question 10, R6).** Not
   * by ruling on whether an untiered FAMILY member should be tier-excluded — that is the fiqh call
   * the original block correctly refused to make in a test file — but by **refusing the record**:
   * eligibility comes from descent, so the descent must be on record whatever rule the deed uses, and
   * nobody the engine cannot place in the family tree may be paid. `buildLineage` pass 4 now halts
   * `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` on **every** `entitlementOrder`, not only under
   * `LINEAGE_CONTINUATION` as it did when this defect was filed.
   *
   * **And it is closed on BOTH fields, which is why it is closed rather than moved one field away.**
   * The DEFECT-A1 record is defined by `tabaqa: null` on a `FAMILY` member. Add the `lineageLink` R6
   * demands and `parentId: null` puts them at derived depth 1, which the declared `tabaqa: null` then
   * contradicts ⇒ `TABAQA_MISMATCHES_LINEAGE_DEPTH`. There is no third field to escape through: the
   * derived depth and the declared ṭabaqa each test the other, and neither side is silently preferred.
   *
   * The `arbitraries.ts` comment quoted below — which ratified the untiered-FAMILY shape as
   * "legitimate" — is now describing a record the engine refuses. That file is not this agent's, and
   * whether its generator still produces the shape is called out in the report rather than edited here.
   *
   * ── THE ORIGINAL FINDING, KEPT VERBATIM FOR THE RECORD ────────────────────────────────────────
   * `resolver.ts`'s tier test is keyed on **`tabaqa !== null`, not on `kind`** (`isTiered`,
   * `orderedExclusionReason`). `beneficiaryInputSchema` permits `kind: 'FAMILY'` with
   * `tabaqa: null`, and nothing anywhere refuses that combination. Consequences, both pinned below:
   *
   *  1. In an ORDERED waqf an untiered FAMILY member is **entitled in every period**, alongside
   *     whichever ṭabaqa is currently lowest-living — and because normalisation is over the entitled
   *     cohort, they **dilute the entitled tier's share** (13,750,000 → 9,166,667 halalas here).
   *  2. When every recorded ṭabaqa is extinct they take the **whole pool** — SAR 275,000 of ghallah
   *     to a family member whose generational tier the deed never established.
   *
   * Why this is a G-9 clause-3 breach and not a design choice: the tier test is the *entire*
   * mechanism by which the founder's `al-aʿlā fa-l-aʿlā` condition is applied, and a FAMILY member
   * with no recorded ṭabaqa is exactly the state CLAUDE.md binding rule 1 names — "the conditions
   * needed to resolve entitlement or shares are missing … the engine halts and returns
   * `SHART_INCOMPLETE`. It never guesses, defaults, or infers the founder's intent." Treating a
   * missing tier as "outside the generational tree, therefore always entitled" **is** an inference,
   * and it is the most generous one available to that beneficiary.
   *
   * Worse, invariant **I5 exempts precisely this case** — `invariants.assertOrderedExclusion` skips
   * every line whose beneficiary has a null `tabaqa` — so the run reports `I5` in
   * `invariantsChecked` while the ordered condition was not applied to that member at all. That is
   * the Sprint-2 pattern: an invariant listed as checked whose claim does not cover the input.
   *
   * NOT FIXED HERE. The justification written in `resolver.ts:294-298` is about a
   * `CHARITABLE_JIHA` / `CATEGORY_ONLY` placeholder, and for those two kinds the exemption is
   * correct. Narrowing it to `kind !== 'FAMILY'`, versus refusing an untiered FAMILY member with
   * `SHART_INCOMPLETE`, versus refusing every untiered member in an ORDERED waqf, are three
   * different answers with different fiqh readings of the deed — CLAUDE.md binding rule 4 puts that
   * with the product owner and the Sharia reviewer, not in this test file.
   *
   * ⚠ This shape is not hypothetical. `fixtureDelta` records that `data/fixtures/sample-waqf.json`
   * carries **no `tabaqa`-complete beneficiary set today**, so `null` is the expected state of every
   * migrated record until E5/S6 backfills it.
   *
   * ⚠⚠ AND IT IS NOT AN OVERSIGHT — IT HAS BEEN RATIFIED IN A TEST COMMENT. `arbitraries.ts`'s
   * `arbTieredCohort` generates untiered `FAMILY` members on purpose and documents the reason:
   *
   *   "Untiered members (`tabaqa: null`) are included because they are the case that must NOT be
   *    tier-excluded, and the case whose share legitimately RISES when a senior tier appears."
   *
   * So the 10,000-case property run *does* explore this shape and passes — because the property it
   * asserts is stated in terms of the implementation's own definition of who is entitled. That is
   * the failure mode this codebase has already been bitten by: a check that asks "does the row say
   * X?" is not a check on whether X is right. Calling an untiered FAMILY member's exemption
   * "legitimate", and its enrichment "legitimate", is a **fiqh reading of the deed made in a test
   * file** — with no ADR, no open-question reference, and no `TODO(surface)` anywhere. CLAUDE.md
   * binding rule 4 reserves that call for the product owner and the Sharia reviewer.
   */
  const UNTIERED_FAMILY = untiered('ben-000-untiered', 'FAMILY', '12.5');

  /** Assert the refusal and return it, so each case can pin its own discriminator. */
  function mustRefuse(input: unknown, refusal: string): void {
    const attempt = attack(input);
    expect(attempt.ok, `expected a refusal, the run COMPUTED`).toBe(false);
    if (attempt.ok) return;
    expect(attempt.code).toBe('SHART_INCOMPLETE');
    // The discriminator, never the bare code: eighteen refusals share `SHART_INCOMPLETE`, so a
    // code-only assertion here would pass against any of them and prove nothing about DEFECT-A1.
    expect(attempt.refusal).toBe(refusal);
  }

  it('INVERTED: an untiered FAMILY member alongside ṭabaqa 1 is REFUSED, not paid a diluting share', () => {
    // MEASURED BEFORE R6, on this exact input: the run computed, and ben-001's entitlement fell from
    //   13,750,000 → 9,166,667 halalas (SAR 137,500.00 → SAR 91,666.67)
    // because the untiered member joined the entitled cohort and shrank nobody's exclusion but their
    // own. The full paid vector was
    //   { ben-000-untiered: 9166667, ben-001: 9166667, ben-002: 0, ben-003: 9166666 }
    // with `ben-000-untiered` reported `PAID/null` and invariant I5 nonetheless listed as checked.
    mustRefuse(
      { ...exampleA(), beneficiaries: [BEN_001, BEN_002, BEN_003, UNTIERED_FAMILY] },
      'LINEAGE_LINK_MISSING',
    );
  });

  it('INVERTED: with every recorded ṭabaqa extinct, the untiered member is REFUSED the WHOLE pool', () => {
    // MEASURED BEFORE R6: `ben-000-untiered` was paid **27,500,000 of 27,500,000 halalas**
    // (SAR 275,000 — the entire ghallah), `NO_ELIGIBLE_BENEFICIARIES` was NOT flagged, and I5 was
    // reported as checked on a run in which the ordered condition reached nobody at all.
    mustRefuse(
      {
        ...exampleA(),
        beneficiaries: [
          patched(BEN_001, { active: false }),
          patched(BEN_002, { active: false }),
          patched(BEN_003, { active: false }),
          UNTIERED_FAMILY,
        ],
      },
      'LINEAGE_LINK_MISSING',
    );
  });

  /**
   * The economic inversion, stated as money — and now unreachable.
   *
   * `al-aʿlā fa-l-aʿlā` means a senior generation coming alive should move ghallah TOWARDS the
   * senior tier. Before R6 a senior tier coming alive moved **SAR 45,833.34 towards a member who was
   * in no tier at all**, because excluding the junior tier shrank the normalisation denominator the
   * untiered member shared in. Both halves of that comparison are refused now, so the comparison
   * cannot be made — which is the only honest way for this test to stay true to its own name.
   */
  it('INVERTED: the SAR 45,833.34 enrichment is unreachable — both halves refuse', () => {
    const untieredMember = untiered('ben-u', 'FAMILY', '10');
    const junior1 = patched(BEN_001, { id: 'ben-j1', tabaqa: 2, stipulatedWeight: '10' });
    const junior2 = patched(BEN_001, { id: 'ben-j2', tabaqa: 2, stipulatedWeight: '10' });
    const senior = patched(BEN_001, { id: 'ben-s', tabaqa: 1, stipulatedWeight: '10' });

    // MEASURED BEFORE R6 · no senior tier ⇒ three-way split, the untiered member taking a third:
    //   { ben-j1: 9166667, ben-j2: 9166667, ben-u: 9166666 }
    mustRefuse(
      { ...exampleA(), beneficiaries: [untieredMember, junior1, junior2] },
      'LINEAGE_LINK_MISSING',
    );

    // MEASURED BEFORE R6 · senior tier alive ⇒ the juniors excluded and the untiered member's share
    // RISING from a third to a half: { ben-j1: 0, ben-j2: 0, ben-s: 13750000, ben-u: 13750000 }.
    //   gain = 13,750,000 − 9,166,666 = 4,583,334 halalas = SAR 45,833.34
    mustRefuse(
      { ...exampleA(), beneficiaries: [untieredMember, junior1, junior2, senior] },
      'LINEAGE_LINK_MISSING',
    );

    // The arithmetic itself is still stated, because the *size* of the defect is the finding and a
    // reader must not have to reconstruct it from a refusal message.
    expect(13_750_000n - 9_166_666n).toBe(4_583_334n); // SAR 45,833.34
  });

  it('INVERTED: the CATEGORY_ONLY placeholder route is refused on the same rule', () => {
    // MEASURED BEFORE R6: `ben-cat` was `PAID/null` for the whole 27,500,000 halalas — the same
    // outcome one `kind` field away, which is why R6's pass 4 covers `CATEGORY_ONLY` as well as
    // `FAMILY`. (That the placeholder half is engineering's call and not the owner's rule is recorded
    // as a TODO(surface) on `resolveEntitlement`; this test pins the behaviour, not the ruling.)
    mustRefuse(
      {
        ...exampleA(),
        beneficiaries: [
          patched(BEN_001, { active: false }),
          patched(BEN_002, { active: false }),
          patched(BEN_003, { active: false }),
          untiered('ben-cat', 'CATEGORY_ONLY', '10'),
        ],
      },
      'LINEAGE_LINK_MISSING',
    );
  });

  /**
   * ⚠ **THE SECOND DOOR, and the reason this defect is CLOSED rather than MOVED.**
   *
   * `LINEAGE_LINK_MISSING` refuses the record as originally written. The obvious next attack is to
   * supply exactly what that refusal asks for and change nothing else — a `lineageLink` on a member
   * whose `tabaqa` is still `null`. `parentId: null` places them at derived depth 1; the declared
   * `tabaqa: null` disagrees; `buildLineage` refuses rather than preferring the side that would put
   * them back outside the ṭabaqāt. Without this case the block would prove only that one field is
   * mandatory, not that the DEFECT-A1 *shape* has no representation.
   */
  it('INVERTED: adding the demanded lineageLink does NOT reopen it — the ṭabaqa cross-check refuses', () => {
    const linkedButUntiered = { ...UNTIERED_FAMILY, lineageLink: 'SON' as const };
    mustRefuse(
      { ...exampleA(), beneficiaries: [BEN_001, BEN_002, BEN_003, linkedButUntiered] },
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );

    // And the mirror: declaring a ṭabaqa the edges cannot reach is refused by the same cross-check,
    // so neither side of the pair can be trusted alone.
    mustRefuse(
      {
        ...exampleA(),
        beneficiaries: [
          BEN_001,
          BEN_002,
          BEN_003,
          { ...UNTIERED_FAMILY, lineageLink: 'SON' as const, tabaqa: 3 },
        ],
      },
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );
  });
});

describe('G-9 clause 3 · DEFECT-A2 — CLOSED by refusal: a tiered CHARITABLE_JIHA halts the run', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * DEFECT-A2 · ATTACK SUCCEEDED, THEN WAS CLOSED. Severity was HIGH. A FALSE CLAIM IN A COMMENT.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * **What the attack found.** `resolver.ts` claimed, of keying the tier test on `tabaqa`, that "a
   * jiha can never lose its deed share to the family leg by accident", and `invariants.ts` repeated
   * it. Both were false whenever the jiha's `tabaqa` was non-null — a value the schema permitted on
   * every `kind` — so the protection was keyed on a nullable data field rather than on the
   * beneficiary's kind. MEASURED on a JOINT waqf under ORDERED: a jiha at ṭabaqa 2 was
   * `EXCLUDED (UPPER_TABAQA_EXTANT)` and its 40% — 56,000,000 halalas, SAR 560,000 — went to the
   * family; in the mirror case the family lost everything. Neither run was flagged, and both were
   * still stamped `JOINT_FIXED_DEED_SHARES`.
   *
   * **How it was closed (product-owner decision, 2026-07-30, S3-D3).** Not by exempting the jiha
   * from the tier test — that route makes invariant I5 throw, which this suite demonstrated — but by
   * **refusing the input**: a charitable jiha is not a descendant of the waqif and cannot sit in the
   * ṭabaqāt, so a jiha carrying one is a deed record that contradicts itself, and the engine halts
   * with `SHART_INCOMPLETE` rather than choosing a reading (CLAUDE.md binding rule 1).
   * `resolver.assertJihaNotTiered` runs before entitlement is resolved. Both false comments are
   * corrected in place, and the case they describe can no longer reach the tier test at all.
   *
   * These three cases are kept — inverted — so the exact inputs that produced the misallocation can
   * never compute again. The refusal's own behaviour (message, offender list, the legal shapes it
   * must NOT break, the undecided CATEGORY_ONLY case) is covered by `jiha-tier-refusal.test.ts`.
   *
   * ⚠ **RE-POINTED BY ADR-0009, AND IT WAS NECESSARY.** The measurement was taken on a JOINT waqf,
   * which R5 now refuses *earlier* — so these three cases would have gone on passing while proving the
   * joint refusal instead of `assertJihaNotTiered`. They are driven from a `PUBLIC_CHARITABLE` waqf
   * (jihas only), the one shape where a jiha and a ṭabaqa can legally coexist in a record. The 40% deed
   * weight is unchanged, so the 56,000,000 halalas the defect moved is still the amount under test.
   *
   * ⚠⚠ **AND RE-POINTED AGAIN IS NOT POSSIBLE — `TABAQA_ON_CHARITABLE_WAQF` (product owner,
   * 2026-08-03) NOW ANSWERS THIS COHORT, AND EVERY OTHER ONE.** A وقف خيري has no generations, so no
   * beneficiary of one may carry a ṭabaqa — which is a strict generalisation of DEFECT-A2's own rule
   * and is checked at Stage 0, ahead of `assertJihaNotTiered`. The `PUBLIC_CHARITABLE` cohort these
   * two cases were re-pointed at in order to reach `JIHA_TIERED` is therefore refused one rule
   * earlier.
   *
   * ⚠⚠⚠ **THREE SENTENCES THAT STOOD HERE ARE FALSE AS OF R7 (product owner, 2026-08-10), AND THEY WERE
   * THE WORST KIND: A CROSS-FILE POINTER TELLING THE READER THE OPPOSITE OF WHAT THE POINTED-AT FILE NOW
   * SAYS.** They read: *"there is **no fourth shape to re-point at**: on `FAMILY_DHURRI` a jiha is
   * refused `CHARITABLE_JIHA_ON_FAMILY_WAQF` and on `JOINT` everything is refused. The **120-cell**
   * enumeration proving `JIHA_TIERED` is **unreachable** through `runDistribution` lives in
   * `jiha-tier-refusal.test.ts` §REACHABILITY."*
   *
   * Corrected, and MEASURED rather than reasoned:
   *  · **There IS a fourth shape**, and it is the one the old wording said to watch for. A وقف ذري MAY
   *    name a charitable jiha as its ultimate taker (مآل الوقف), so `CHARITABLE_JIHA_ON_FAMILY_WAQF` is
   *    now CONDITIONAL — it fires only on a jiha the deed does **not** name.
   *  · **`JIHA_TIERED` is REACHABLE through `runDistribution` again** on all three money-moving orders:
   *    `FAMILY_DHURRI` + a legible reversion naming the jiha + that jiha carrying a `tabaqa`.
   *  · **The census is 240 cells, not 120, and it proves reachability rather than closure** — 24 cells
   *    land on `JIHA_TIERED` and 8 RESOLVE (ESC-2's second shape). See `jiha-tier-refusal.test.ts`
   *    §REACHABILITY, whose own header records the same reversal as version (4) of its history.
   *
   * ✓✓ **AND THE QUALIFICATION IS NOW CLOSED BY RULING — memo Q1, product owner 2026-08-17: "I-R1 is the
   * guarantee."** What stood here read: *"What this does NOT do is un-qualify G-9 clause 3, and R7 must not
   * be quoted as closing it. R7 puts a reachable UNTIERED line back into a TIERED family cohort — the exact
   * configuration the qualification is about — and what keeps DEFECT-A2's outcome closed is no longer 'no
   * jiha can be here' but the taker's **default exclusion** plus invariant **I-R1**. That is a stronger
   * guarantee and it is also new code, so the gate stays QUALIFIED."* Every sentence of that is still true
   * **except the last clause**: the owner ruled that the untiered ultimate taker is **by design** outside
   * tier logic, that **I5's claim is scoped to descendants**, and that I-R1 plus the default exclusion **is**
   * the closing guarantee for the taker's line. So clause 3 is certified in two halves by two mechanisms —
   * see the §"G-9 CLAUSE 3 · CERTIFIED" block at the end of this file, which drives the configuration the
   * certification turns on and mutation-verifies that the certification depends on I-R1 and not on
   * something else.
   *
   * The two cases below are therefore **inverted rather than re-pointed**, keeping their inputs
   * verbatim: what DEFECT-A2 is actually about — *these exact inputs never compute, and the jiha's
   * 56,000,000 halalas are never redistributed* — is unchanged and still driven. The assertion moves
   * from a message regex to the `details.refusal` discriminator, which is the assertion that would
   * have caught this precedence shift immediately rather than after a message string drifted.
   */
  it('the jiha at a lower tier no longer loses its 40% — the run is refused', () => {
    // MEASURED BEFORE the ṭabaqa rule, on this exact input: `SHART_INCOMPLETE` / `JIHA_TIERED`, whose
    // message read "…is kind CHARITABLE_JIHA but carries a generational ṭabaqa…". MEASURED AFTER:
    // `SHART_INCOMPLETE` / `TABAQA_ON_CHARITABLE_WAQF`. Still refused, and still 56,000,000 halalas
    // that never move.
    const attempt = attack({
      ...exampleDCharitable(),
      entitlementOrder: 'ORDERED',
      beneficiaries: [patched(BEN_006, { tabaqa: 2 }), BEN_306, BEN_307],
    });
    expect(attempt.ok, 'expected a refusal, the run COMPUTED').toBe(false);
    if (attempt.ok) return;
    expect(attempt.code).toBe('SHART_INCOMPLETE');
    expect(attempt.refusal).toBe('TABAQA_ON_CHARITABLE_WAQF');
    // The offender is still named — a refusal nobody can act on is half a refusal.
    expect(attempt.message).toContain('ben-006');
  });

  it('the mirror case — the jiha at ṭabaqa 1 taking the whole pool — is refused too', () => {
    // MEASURED BEFORE: `JIHA_TIERED`, message in the PLURAL ("…are kind CHARITABLE_JIHA but carry a
    // generational ṭabaqa…") because all three jihas carried one. MEASURED AFTER:
    // `TABAQA_ON_CHARITABLE_WAQF`, which also names all three — the "names EVERY offender" claim
    // survives the change of rule and is asserted on the id list rather than on prose.
    const attempt = attack({
      ...exampleDCharitable(),
      entitlementOrder: 'ORDERED',
      beneficiaries: [
        patched(BEN_006, { tabaqa: 1 }),
        patched(BEN_306, { tabaqa: 2 }),
        patched(BEN_307, { tabaqa: 2 }),
      ],
    });
    expect(attempt.ok, 'expected a refusal, the run COMPUTED').toBe(false);
    if (attempt.ok) return;
    expect(attempt.refusal).toBe('TABAQA_ON_CHARITABLE_WAQF');
    for (const id of ['ben-006', 'ben-306', 'ben-307']) {
      expect(attempt.message).toContain(id);
    }
  });

  it('the protection is now keyed on kind, not on data: the null-ṭabaqa jiha still gets exactly 40%', () => {
    const result = runDistribution({ ...exampleDCharitable(), entitlementOrder: 'ORDERED' });
    const jiha = result.lines.find((line) => line.beneficiaryId === 'ben-006');
    expect(jiha?.status).toBe('PAID');
    expect(jiha?.entitledMinor).toBe(56_000_000n);
    expect(jiha?.sharePercent).toBe('40.000000');
  });

  /**
   * ✓✓ **R7 · THE CONFIGURATION G-9 CLAUSE 3'S CERTIFICATION TURNS ON, DRIVEN HERE.**
   *
   * Added by the S4 adversarial pass because it was **missing**: R7 restores a reachable UNTIERED line
   * into a TIERED family cohort — which is precisely what DEFECT-A1/A2 were about — and this suite
   * certified clause 3 without ever exercising it. What protects the outcome is no longer *"no jiha can
   * be in this cohort"* (R7 made that false) but two independent things: the taker is **EXCLUDED by
   * default** until the reversion triggers, and invariant **I-R1** asserts no charity is ever paid a
   * halala in the same run as a descendant. ✓ Since memo Q1 (product owner, 2026-08-17) those two **are**
   * the guarantee rather than a substitute for one: this test is now evidence FOR the certification, and
   * the sentence that called it "evidence for the qualification" is gone.
   *
   * Example A's ORDERED cohort, unchanged, plus `ben-006` named as the deed's ultimate taker. Every
   * figure derived by hand in halalas from Example A's own waterfall:
   *
   *   revenue 35,000,000 − ṣiyāna 4,000,000 − operating 0 − ʿushr 10% of revenue 3,500,000
   *     = 27,500,000 distributable   (⚠ the 10% ʿushr is unverified — confirm vs primary law)
   */
  it('R7 · a recorded ultimate taker takes ZERO beside a living ṭabaqa-1 descendant (clause 3 holds)', () => {
    const maal: DistributionInputRaw = {
      ...exampleA(),
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-006'] },
      beneficiaries: [BEN_001, BEN_002, BEN_003, BEN_006],
    };
    const result = mustRun(maal);
    const lines = new Map(result.lines.map((line) => [line.beneficiaryId, line]));

    // ORDERED ⇒ entitled ṭabaqa is 1 = { ben-001, ben-003 }, weights 12.5 + 12.5 = 25.
    //   ben-001 = 27,500,000 × 12.5 / 25 = 13,750,000
    //   ben-003 = 27,500,000 × 12.5 / 25 = 13,750,000
    //   13,750,000 + 13,750,000 = 27,500,000 ✓ residual 0
    expect(lines.get('ben-001')?.entitledMinor).toBe(13_750_000n);
    expect(lines.get('ben-003')?.entitledMinor).toBe(13_750_000n);
    expect(lines.get('ben-002')?.reasonCode).toBe('UPPER_TABAQA_EXTANT');

    // ⚠ THE DIVERSION, PRICED AT NOTHING. Had the taker escaped its verdict ladder the way DEFECT-A2's
    // jiha escaped the tier test, the denominator would have been 12.5 + 12.5 + 40 = 65 and the charity
    // would have taken floor(27,500,000 × 40/65) = floor(16,923,076.92) = 16,923,076, +1 on the largest
    // remainder = 16,923,077 halalas (SAR 169,230.77), cutting each living ṭabaqa-1 descendant from
    // 13,750,000 to 5,288,461. It takes ZERO, and on the reversion's OWN reason — never a tier code.
    expect(lines.get('ben-006')?.status).toBe('EXCLUDED');
    expect(lines.get('ben-006')?.entitledMinor).toBe(0n);
    expect(lines.get('ben-006')?.reasonCode).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    expect(lines.get('ben-006')?.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
    expect(lines.get('ben-006')?.reasonCode).not.toBe('TABAQA_EXTINCT');

    // Clause 3's own invariant is still asserted, and now over a cohort where the untiered exemption
    // has a subject — plus I-R1, which is what makes the zero above a guarantee rather than a result.
    expect(result.invariantsChecked).toContain('I5');
    expect(result.invariantsChecked).toContain('I-R1');
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.totals.retainedMinor).toBe(0n as Minor);

    // …and the same deed one generation later, with the bloodline over: the taker is the ONLY entitled
    // line, 27,500,000 × 40/40 = 27,500,000, residual 0 — and it is stamped with the reversion's rule,
    // not with the generational one it does not stand in.
    const reverted = mustRun({
      ...maal,
      beneficiaries: [
        patched(BEN_001, { active: false }),
        patched(BEN_002, { active: false }),
        patched(BEN_003, { active: false }),
        BEN_006,
      ],
    });
    const revertedLines = new Map(reverted.lines.map((line) => [line.beneficiaryId, line]));
    expect(revertedLines.get('ben-006')?.entitledMinor).toBe(27_500_000n);
    expect(revertedLines.get('ben-006')?.basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    expect(reverted.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(reverted.totals.retainedMinor).toBe(0n as Minor);
    // The extinct tiers are reported extinct — nothing was passed down a branch to reach the charity.
    for (const id of ['ben-001', 'ben-002', 'ben-003']) {
      expect(revertedLines.get(id)?.reasonCode, id).toBe('TABAQA_EXTINCT');
      expect(revertedLines.get(id)?.entitledMinor, id).toBe(0n);
    }
  });
});
describe('G-9 clause 3 · ⚠ DEFECT-A3 — a zero-weight living tier blocks the generation below it', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * DEFECT-A3 · **ATTACK SUCCEEDED (behaviour is surfaced in code, consequence is not).**
   * Severity: MEDIUM.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * `lowestLivingTabaqa` keys extinction on `active` alone, and `orderedExclusionReason` then
   * excludes every zero-weight member of the entitled tier. So a ṭabaqa whose only living members
   * all carry deed weight `'0'` is simultaneously (a) alive enough to block the tier below it and
   * (b) entitled to nothing — and the whole distributable is **retained**, with the next generation
   * excluded `UPPER_TABAQA_EXTANT` while receiving nothing.
   *
   * `resolver.ts:325-331` does state this consequence and surfaces the underlying question (is a
   * zero deed weight the deed excluding that person, or a data-entry error?). What is NOT surfaced
   * is that the run carries **no flag distinguishing it** from an ordinary
   * `NO_ELIGIBLE_BENEFICIARIES` period: a Nazir reading the statement sees "nobody entitled, the
   * ghallah is retained" and cannot tell that a living generation was skipped because of a zero in
   * a weight column.
   *
   * NOT FIXED HERE — binding rule 4. If a zero weight is read as a data-entry error the run should
   * REFUSE; if it is read as the deed excluding that person, the tier arguably should not block.
   */
  it('DEFECT: a living ṭabaqa-1 with weight "0" blocks ṭabaqa 2 and the whole pool is retained', () => {
    const result = mustRun({
      ...exampleA(),
      beneficiaries: [
        patched(BEN_001, { stipulatedWeight: '0' }),
        patched(BEN_003, { stipulatedWeight: '0' }),
        BEN_002, // ṭabaqa 2, active, weight 12.5 — receives nothing
      ],
    });
    expect(statusesById(result)).toStrictEqual({
      'ben-001': 'EXCLUDED/ZERO_STIPULATED_WEIGHT',
      'ben-002': 'EXCLUDED/UPPER_TABAQA_EXTANT',
      'ben-003': 'EXCLUDED/ZERO_STIPULATED_WEIGHT',
    });
    expect(result.totals.retainedMinor).toBe(27_500_000n as Minor);
    // Indistinguishable from an ordinary no-eligible-cohort period.
    expect(result.flags).toStrictEqual(['NO_ELIGIBLE_BENEFICIARIES', 'UNVERIFIED_FIGURES_APPLIED']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * I6 · a payability gate must move no halala — including through the residual
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('I6 · SURVIVED — no gate flip moves a halala, not even the residual one', () => {
  /** A pool coprime with the line count, so the residual is genuinely in play on every variant. */
  const base = splitOnly(10_001n, [
    ['ben-a', '1'],
    ['ben-b', '1'],
    ['ben-c', '1'],
  ]);

  const perturbations: ReadonlyArray<
    readonly [string, Partial<DistributionInputRaw['beneficiaries'][number]>]
  > = [
    ['verificationStatus → UNVERIFIED', { verificationStatus: 'UNVERIFIED' }],
    ['verificationStatus → PENDING', { verificationStatus: 'PENDING' }],
    ['kycLastRefreshed → stale', { kycLastRefreshed: '2020-01-01' }],
    ['kycLastRefreshed → null', { kycLastRefreshed: null }],
    ['residency → CROSS_BORDER', { residency: 'CROSS_BORDER' }],
    ['kind → CATEGORY_ONLY with a blank category', { kind: 'CATEGORY_ONLY', category: '   ' }],
    [
      'disbursingEntity unlicensed',
      { disbursingEntity: { name: 'E', licensed: false, licenceExpiry: null } },
    ],
  ];

  const clean = mustRun(base);

  it('the baseline residual really is live (otherwise the attack is vacuous)', () => {
    expect(clean.totals.residualMinor).toBe(2n as Minor);
    expect(amountsById(clean)).toStrictEqual({ 'ben-a': '3334', 'ben-b': '3334', 'ben-c': '3333' });
  });

  it.each(perturbations)('%s on each of the three lines in turn moves nothing', (_label, patch) => {
    for (const target of ['ben-a', 'ben-b', 'ben-c'] as const) {
      const flipped = mustRun({
        ...base,
        beneficiaries: base.beneficiaries.map((member) =>
          member.id === target ? { ...member, ...patch } : member,
        ),
      });
      // Every amount, on every line — including the one that was flipped.
      expect(amountsById(flipped)).toStrictEqual(amountsById(clean));
      expect(flipped.totals.residualMinor).toBe(clean.totals.residualMinor);
      expect(flipped.totals.entitledMinor).toBe(clean.totals.entitledMinor);
      // …and the flip DID change the status, so the perturbation was not a no-op.
      expect(statusesById(flipped)[target]).not.toBe(statusesById(clean)[target]);
    }
  });

  it('gating EVERY line leaves the entitlements intact and the pool fully withheld', () => {
    const allGated = mustRun({
      ...base,
      beneficiaries: base.beneficiaries.map((member) => ({
        ...member,
        verificationStatus: 'UNVERIFIED' as const,
      })),
    });
    expect(amountsById(allGated)).toStrictEqual(amountsById(clean));
    expect(allGated.totals.paidMinor).toBe(0n as Minor);
    expect(allGated.totals.withheldMinor).toBe(allGated.waterfall.distributableMinor);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * I-C1 · corpus (asl / أصل) must never reach a beneficiary line
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('I-C1 · SURVIVED — every route for smuggling corpus into the waterfall is refused', () => {
  it.each([
    [
      'a bare income total with no receipts behind it',
      { incomeMinor: 35_000_000n, receipts: [] },
      'RECEIPT_UNCLASSIFIED',
    ],
    [
      'a CAPITAL receipt declared as the period income',
      {
        incomeMinor: 35_000_000n,
        receipts: [
          {
            id: 'x',
            receiptClass: 'CAPITAL',
            capitalSource: 'SALE_PROCEEDS',
            amountMinor: 35_000_000n,
          },
        ],
      },
      'CORPUS_NOT_DISTRIBUTABLE',
    ],
    [
      'istibdal proceeds relabelled INCOME but still naming their capitalSource',
      {
        incomeMinor: 35_000_000n,
        receipts: [
          {
            id: 'x',
            receiptClass: 'INCOME',
            capitalSource: 'ISTIBDAL_PROCEEDS',
            amountMinor: 35_000_000n,
          },
        ],
      },
      'RECEIPT_UNCLASSIFIED',
    ],
    [
      'a lower-case class that would pass a case-insensitive check',
      {
        incomeMinor: 35_000_000n,
        receipts: [{ id: 'x', receiptClass: 'income', amountMinor: 35_000_000n }],
      },
      'RECEIPT_UNCLASSIFIED',
    ],
    [
      'an empty class string',
      {
        incomeMinor: 35_000_000n,
        receipts: [{ id: 'x', receiptClass: '', amountMinor: 35_000_000n }],
      },
      'RECEIPT_UNCLASSIFIED',
    ],
    [
      'a CAPITAL receipt naming no corpus event',
      { incomeMinor: 0n, receipts: [{ id: 'x', receiptClass: 'CAPITAL', amountMinor: 1n }] },
      'RECEIPT_UNCLASSIFIED',
    ],
    [
      'declared income EXCEEDING the classified INCOME receipts',
      {
        incomeMinor: 35_000_001n,
        receipts: [{ id: 'x', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
      },
      'CORPUS_NOT_DISTRIBUTABLE',
    ],
    [
      'declared income FALLING SHORT of the classified INCOME receipts',
      {
        incomeMinor: 34_999_999n,
        receipts: [{ id: 'x', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
      },
      'DISTRIBUTION_INPUT_INVALID',
    ],
    [
      'a negative CAPITAL receipt used to net corpus against income',
      {
        incomeMinor: 35_000_000n,
        receipts: [
          { id: 'a', receiptClass: 'INCOME', amountMinor: 35_000_000n },
          { id: 'b', receiptClass: 'CAPITAL', capitalSource: 'OTHER', amountMinor: -1_000_000n },
        ],
      },
      'DISTRIBUTION_INPUT_INVALID',
    ],
    [
      'duplicate receipt ids double-counting one income row',
      {
        incomeMinor: 35_000_000n,
        receipts: [
          { id: 'dup', receiptClass: 'INCOME', amountMinor: 17_500_000n },
          { id: 'dup', receiptClass: 'INCOME', amountMinor: 17_500_000n },
        ],
      },
      'DISTRIBUTION_INPUT_INVALID',
    ],
  ])('%s ⇒ %s', (_label, revenue, expectedCode) => {
    const attempt = attack({ ...exampleA(), revenue });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe(expectedCode);
  });

  it('an arbitrarily large CAPITAL receipt changes nothing but capitalReceiptsMinor and one flag', () => {
    const withoutCorpus = mustRun(exampleA());
    const withCorpus = mustRun({
      ...exampleA(),
      revenue: {
        incomeMinor: 35_000_000n,
        receipts: [
          { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n },
          {
            id: 'cap-huge',
            receiptClass: 'CAPITAL',
            capitalSource: 'EXPROPRIATION_COMPENSATION',
            amountMinor: 900_000_000_000n,
          },
        ],
      },
    });

    expect(withCorpus.waterfall.capitalReceiptsMinor).toBe(900_000_000_000n as Minor);
    expect(withoutCorpus.waterfall.capitalReceiptsMinor).toBe(0n as Minor);
    expect(withCorpus.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');

    // Every other waterfall figure, every total and every line is byte-identical.
    const strip = (result: DistributionResult): unknown =>
      JSON.parse(
        JSON.stringify(
          {
            waterfall: { ...result.waterfall, capitalReceiptsMinor: 'IGNORED' },
            totals: result.totals,
            lines: result.lines,
          },
          (_key, value) => (typeof value === 'bigint' ? String(value) : value),
        ),
      );
    expect(strip(withCorpus)).toStrictEqual(strip(withoutCorpus));
  });

  it('a zero-amount CAPITAL row is still flagged — the flag reports presence, not magnitude', () => {
    const result = mustRun({
      ...exampleA(),
      revenue: {
        incomeMinor: 35_000_000n,
        receipts: [
          { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n },
          {
            id: 'cap-0',
            receiptClass: 'CAPITAL',
            capitalSource: 'ISTIBDAL_PROCEEDS',
            amountMinor: 0n,
          },
        ],
      },
    });
    expect(result.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(result.waterfall.capitalReceiptsMinor).toBe(0n as Minor);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * I8 / purity · the run must be replayable, and must not touch the caller's object
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('I8 + purity · SURVIVED', () => {
  const jsonify = (value: unknown): string =>
    JSON.stringify(value, (_key, inner) =>
      typeof inner === 'bigint' ? `${String(inner)}n` : inner,
    );

  it('the beneficiary array order does not affect any byte of the result', () => {
    const canonical = canonicalizeResult(mustRun(exampleA()));
    const orders: ReadonlyArray<readonly [unknown, unknown, unknown]> = [
      [BEN_001, BEN_002, BEN_003],
      [BEN_003, BEN_002, BEN_001],
      [BEN_002, BEN_001, BEN_003],
      [BEN_003, BEN_001, BEN_002],
    ];
    for (const beneficiaries of orders) {
      expect(canonicalizeResult(mustRun({ ...exampleA(), beneficiaries }))).toBe(canonical);
    }
  });

  it('50 replays of one input are byte-identical', () => {
    const first = canonicalizeResult(mustRun(exampleA()));
    for (let repeat = 0; repeat < 50; repeat += 1) {
      expect(canonicalizeResult(mustRun(exampleA()))).toBe(first);
    }
  });

  it('the caller-supplied input object is not mutated — on success OR on a refusal', () => {
    const good = exampleA();
    const goodBefore = jsonify(good);
    runDistribution(good);
    expect(jsonify(good)).toBe(goodBefore);

    const bad = {
      ...exampleA(),
      nazirFee: { basis: 'RETAINER' as const, fixedAmountMinor: 10n ** 12n },
    };
    const badBefore = jsonify(bad);
    expect(attack(bad).ok).toBe(false);
    expect(jsonify(bad)).toBe(badBefore);

    // …and a refusal deep inside the split leaves the input untouched too.
    const shart = { ...exampleA(), entitlementOrder: 'ordered' };
    const shartBefore = jsonify(shart);
    const attempt = attack(shart);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe('SHART_INCOMPLETE');
    expect(jsonify(shart)).toBe(shartBefore);
  });

  it('the emitted result is frozen and its lines cannot be re-ordered in place', () => {
    const result = mustRun(exampleA());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lines)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * `invariantsChecked` honesty
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('invariantsChecked · every listed id was really asserted on that run', () => {
  it('I8 is never claimed — it is unprovable from one run', () => {
    for (const input of [exampleA(), exampleDCharitable(), exampleG(), exampleH()]) {
      expect(mustRun(input).invariantsChecked).not.toContain('I8');
    }
  });

  it('a nil run omits I5 and I6 rather than claiming them over an empty line set', () => {
    const nil = mustRun({
      ...exampleA(),
      revenue: { incomeMinor: 0n, receipts: [] },
      maintenance: { kind: 'NONE' },
    });
    expect(nil.lines).toStrictEqual([]);
    expect(nil.invariantsChecked).toStrictEqual(['I1', 'I2', 'I3', 'I4', 'I7', 'I9', 'I-C1']);
  });

  it('a no-eligible-cohort run claims I5 (lines exist) but not I6 (no entitled line)', () => {
    const noEligible = mustRun({
      ...exampleA(),
      beneficiaries: [
        patched(BEN_001, { active: false }),
        patched(BEN_002, { active: false }),
        patched(BEN_003, { active: false }),
      ],
    });
    expect(noEligible.invariantsChecked).toContain('I5');
    expect(noEligible.invariantsChecked).not.toContain('I6');
  });

  it('the omissions are recorded in the trace, not left to be inferred', () => {
    const result = mustRun(exampleA());
    const step = result.computationTrace.find((entry) => entry.code === 'INVARIANTS_ASSERTED');
    // I8 is never assertable from one run. I-L1 is a LINEAGE claim and Example A is ORDERED, so the
    // engine states it as not-checked rather than omitting it — an invariant that did not apply is a
    // fact about the run, not an absence for a reader to infer. R7's I-R1 joins them: Example A records
    // no مآل clause and pays no charitable line, so the reversion invariant claims nothing here.
    expect(step?.data?.notChecked).toBe('I8,I-L1,I-R1');

    // And on a lineage run the omission list shrinks, so the claim is not one-sided. It shrinks to
    // `I8,I-R1` and not to `I8`: Example G is a pure bloodline with no reversion clause, so I-R1 still
    // has nothing to say about it — which is the correct behaviour and the reason to assert the exact
    // string rather than `toContain('I8')`.
    const lineage = mustRun(exampleG());
    const lineageStep = lineage.computationTrace.find(
      (entry) => entry.code === 'INVARIANTS_ASSERTED',
    );
    expect(lineageStep?.data?.notChecked).toBe('I8,I-R1');
  });

  /**
   * ⚠ **INVERTED WITH ITS PARENT DEFECT, input verbatim.** DEFECT-A1's companion observation was that
   * I5 is listed on a run in which an untiered FAMILY member was never subjected to the ordered
   * condition at all — "I5 checked" did not mean "ordered exclusion was applied to every
   * beneficiary", and nothing on the run said so.
   *
   * R6 removes the gap by removing the input: the member I5 could not cover can no longer reach a
   * run. **The corollary is asserted the only way it still can be — as a refusal** — because the
   * alternative (asserting `I5` on some *other* run) would be a test whose name no longer matches
   * anything it does. MEASURED before R6, on this exact input: `I5` was in `invariantsChecked`, the
   * untiered line carried `basis.tabaqa: null` and `reasonCode: null`, and its basis nonetheless
   * stamped `rule: 'ORDERED_LOWEST_LIVING_TABAQA'` — the run telling a beneficiary that
   * al-aʿlā fa-l-aʿlā was the rule applied to them while no tier test had touched them.
   *
   * ⚠ **The underlying honesty gap in I5 is NOT itself closed and must not be read as closed.**
   * `invariants.assertOrderedExclusion` still skips every line whose beneficiary has a null `tabaqa`.
   *
   * ⚠⚠ **AND THE SCOPE SENTENCE THAT USED TO FOLLOW IS NOW STALE — CORRECTED, NOT DELETED.** It read:
   * *"what changed is that a `FAMILY`/`CATEGORY_ONLY` member can no longer BE one. A
   * `CHARITABLE_JIHA` still can — legitimately, and `assertJihaNotTiered` refuses the tiered variant
   * — so the exemption survives for the kind it was written for."*
   *
   * That was true of R6 as first built. **R6-F1's correction re-opened it for a second kind:**
   * `buildLineage` pass 4 now requires the lineage edge from a `CATEGORY_ONLY` member only on a
   * `FAMILY_DHURRI` waqf, so a `CATEGORY_ONLY` member on a وقف خيري CAN carry `tabaqa: null`, reach
   * an `ORDERED` run and be paid — with `I5` certified in `invariantsChecked`, no tier test having
   * touched it, and its published `basis.rule` reading `ORDERED_LOWEST_LIVING_TABAQA`. That is the
   * DEFECT-A1 signature exactly. It is measured, with the money it does and does not move, in
   * `escape-class-adversarial.test.ts` §9 (`R6-F1-B`), and it is on the same product-owner question
   * as §9's header. **The claim below is therefore scoped to the `FAMILY_DHURRI` waqf it drives, and
   * must not be read as covering the charitable side.**
   */
  it('DEFECT-A1 corollary INVERTED: the run I5 could not cover no longer exists', () => {
    const attempt = attack({
      ...exampleA(),
      beneficiaries: [BEN_001, BEN_002, BEN_003, untiered('ben-000-untiered', 'FAMILY', '12.5')],
    });
    expect(attempt.ok).toBe(false);
    if (attempt.ok) return;
    expect(attempt.code).toBe('SHART_INCOMPLETE');
    expect(attempt.refusal).toBe('LINEAGE_LINK_MISSING');
    // The refusal names the person, which the silent I5 exemption never did.
    expect(attempt.message).toContain('ben-000-untiered');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * Contract conformance of the emitted run
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('the emitted run always satisfies its own contract', () => {
  const inputs: ReadonlyArray<readonly [string, DistributionInputRaw]> = [
    ['Example A (ORDERED)', exampleA()],
    ['Example D-خ (PUBLIC_CHARITABLE + corpus)', exampleDCharitable()],
    // ADR-0009: the lineage path carries its own corpus receipt and its own per-capita split, so the
    // "every emitted run satisfies its own contract" prover must meet it too.
    ['Example G (LINEAGE / ZUHUR_ONLY + corpus)', exampleG()],
    ['Example H (per-capita residual)', exampleH()],
    [
      'nil run',
      { ...exampleA(), revenue: { incomeMinor: 0n, receipts: [] }, maintenance: { kind: 'NONE' } },
    ],
    [
      'no eligible cohort',
      {
        ...exampleA(),
        beneficiaries: [
          patched(BEN_001, { active: false }),
          patched(BEN_002, { active: false }),
          patched(BEN_003, { active: false }),
        ],
      },
    ],
    [
      '300-line split',
      splitOnly(
        10_007n,
        Array.from(
          { length: 300 },
          (_u, index) => [`ben-${String(index).padStart(4, '0')}`, '1'] as const,
        ),
      ),
    ],
  ];

  it.each(inputs)('%s · no undefined field, no negative money, ascending ids', (_label, input) => {
    const result = mustRun(input);

    // No `undefined` anywhere: an absent key and a null key serialize differently, and the result
    // is canonicalized and hashed for the Nazir's signature.
    const walk = (value: unknown, path: string): void => {
      if (value === undefined) throw new Error(`undefined at ${path}`);
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${String(index)}]`));
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
      }
    };
    expect(() => walk(result, 'result')).not.toThrow();

    for (const line of result.lines) {
      expect(line.entitledMinor as bigint).toBeGreaterThanOrEqual(0n);
      expect(line.sharePercent).toMatch(/^\d+\.\d{6}$/);
    }
    const ids = result.lines.map((line) => line.beneficiaryId);
    expect(ids).toStrictEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(new Set(ids).size).toBe(ids.length);
    // One line per input beneficiary, except where the engine short-circuits to `lines: []`.
    if (result.lines.length > 0) expect(ids.length).toBe(input.beneficiaries.length);
  });

  /**
   * `assertResultShape`'s ordering guard is exercised directly.
   *
   * Through `runDistribution` the guard is unobservable — `assembleLines` sorts, so the guard never
   * fires and deleting it changes no output. Driving it with a hand-built out-of-order result is
   * what makes it load-bearing: a future refactor that drops the sort now has a test that catches
   * it, instead of two silent safety nets that were removed together.
   */
  it('assertResultShape REJECTS a result whose lines are not ascending by beneficiaryId', () => {
    const good = mustRun(exampleA());
    expect(assertResultShape(good)).toBe(good);

    const reversed: DistributionResult = { ...good, lines: [...good.lines].reverse() };
    expect(() => assertResultShape(reversed)).toThrow(/ascending beneficiaryId order/);

    const firstLine = good.lines[0];
    expect(firstLine).toBeDefined();
    if (firstLine === undefined) return;
    const duplicated: DistributionResult = { ...good, lines: [firstLine, firstLine] };
    expect(() => assertResultShape(duplicated)).toThrow(/two lines for one beneficiary/);
  });

  it('no beneficiary display name can reach the hashed surface', () => {
    // Both natures, and the lineage tree — whose `parentId` edges are the newest thing on the hashed
    // surface. They are IDS, deliberately: a family tree recorded by name would put PII in a persisted,
    // signed trace, which is the whole reason the contract has no `name` field.
    for (const input of [exampleDCharitable(), exampleG(), exampleH()]) {
      const result = mustRun(input);
      const serialized = canonicalizeResult(result) + JSON.stringify(result.computationTrace);
      for (const needle of [
        'Fatimah',
        'Al-Rashidi',
        'Al-Munir',
        'Al-Qahtani',
        'Salma',
        'Omar',
        'Nawal',
        'Jawaher',
      ]) {
        expect(serialized).not.toContain(needle);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 · attacking the LINEAGE cohort — the per-capita denominator is the new attack surface
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('the per-capita denominator is exactly the eligible head count, and nothing else', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * WHY THIS IS THE SHARPEST SURFACE ADR-0009 OPENED
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * Under deed weights, mis-counting one beneficiary changed that beneficiary's share. Under per capita
   * it changes **everyone's**: the denominator is a head count, so one extra or missing head moves every
   * other line. So the attacks below are all attempts to change the head count without changing the
   * deed — by adding an ineligible person, by double-counting one, or by killing one and watching where
   * the freed money goes.
   */

  const AMOUNT_PER_HEAD_6 = 13_000_000n; // 78_000_000 / 6, exact
  const AMOUNT_PER_HEAD_5 = 15_600_000n; // 78_000_000 / 5, exact

  it('an EXCLUDED buṭūn descendant does not dilute anyone — G-9 clause 3 for a lineage cohort', () => {
    const base = mustRun(exampleG());
    for (const line of base.lines.filter((entry) => entry.status !== 'EXCLUDED')) {
      expect(line.entitledMinor).toBe(AMOUNT_PER_HEAD_6);
    }

    // ⚠ **THE NEWCOMER'S ID MOVED TO ben-217, AND IT HAD TO.** This case used to graft `ben-210` onto
    // the cohort; `waqf-005`'s tree is now contiguous ben-201…ben-216, so that id is refused
    // `DISTRIBUTION_INPUT_INVALID` (a duplicate) — a confusing way to fail a test about eligibility.
    // Sibling suites adding a member to this tree must start at ben-217.
    //
    // A NEW descendant down the buṭūn line: son of ben-213, whose own ancestor chain runs through the
    // waqif's DAUGHTER ben-202. Under ZUHUR_ONLY he is not eligible, so he must not appear in the
    // denominator — an implementation that counted "every graph member" instead of "every ELIGIBLE
    // member" would drop all six lines to 78_000_000 / 7 = 11_142_857 and short every single
    // beneficiary by SAR 18,571.43.
    const enlarged = mustRun({
      ...exampleG(),
      beneficiaries: [
        ...exampleG().beneficiaries,
        beneficiary({
          id: 'ben-217',
          kind: 'FAMILY',
          active: true,
          // ben-213 is ṭabaqa 2, so his son is ṭabaqa 3 — declared AND derived, and they must agree.
          tabaqa: 3,
          parentId: 'ben-213',
          lineageLink: 'SON',
          line: 'BUTUN',
          branch: 'Branch B',
          stipulatedWeight: '5',
          verificationStatus: 'VERIFIED',
          kycLastRefreshed: '2026-04-01',
          category: null,
          residency: 'DOMESTIC',
          disbursingEntity: null,
          bankingRefForProceeds: null,
        }),
      ],
    });
    const newcomer = enlarged.lines.find((entry) => entry.beneficiaryId === 'ben-217');
    expect(newcomer?.status).toBe('EXCLUDED');
    expect(newcomer?.reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(newcomer?.entitledMinor).toBe(0n);
    // Every pre-existing amount is byte-identical.
    expect(amountsById(enlarged)).toMatchObject(amountsById(base));
    expect(enlarged.totals.entitledMinor).toBe(78_000_000n);
  });

  it('an ELIGIBLE newcomer dilutes everyone equally, which is the rule working', () => {
    // The contrast that keeps the test above honest: the same newcomer down a line that is AT THE
    // FRONTIER is eligible, and then every share must fall. 78_000_000 / 7 = 11_142_857 r 1 ⇒ six at
    // 11_142_857 and the lowest ELIGIBLE id (ben-202) bumped to 11_142_858.
    //
    // ⚠ **The parent moved from ben-204 to ben-207, and that is R-FRONTIER, not bookkeeping.** ben-204
    // is ALIVE, so under the frontier rule his son is excluded `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`
    // and this test would have proved the opposite of its own name. ben-207 is a DECEASED son of the
    // deceased ben-201, so his children stand at the frontier — the newcomer is a sibling of ben-208
    // and ben-209 and is eligible for the same reason they are.
    const enlarged = mustRun({
      ...exampleG(),
      beneficiaries: [
        ...exampleG().beneficiaries,
        beneficiary({
          id: 'ben-218',
          kind: 'FAMILY',
          active: true,
          tabaqa: 3,
          parentId: 'ben-207',
          lineageLink: 'SON',
          line: 'ZUHUR',
          branch: 'Branch A',
          stipulatedWeight: '5',
          verificationStatus: 'VERIFIED',
          kycLastRefreshed: '2026-04-01',
          category: null,
          residency: 'DOMESTIC',
          disbursingEntity: null,
          bankingRefForProceeds: null,
        }),
      ],
    });
    expect(enlarged.totals.entitledLineCount).toBe(7);
    expect(78_000_000n / 7n).toBe(11_142_857n);
    const amounts = enlarged.lines
      .filter((entry) => entry.status !== 'EXCLUDED')
      .map((entry) => entry.entitledMinor as bigint);
    expect(new Set(amounts)).toEqual(new Set([11_142_858n, 11_142_857n]));
    expect(amounts.reduce((running, amount) => running + amount, 0n)).toBe(78_000_000n);
  });

  /**
   * **Per capita, not per stirpes — and this is the test that tells them apart.**
   *
   * Kill ben-205, a Branch A grandchild of the waqif. Per capita, the freed 13,000.00 spreads over the
   * five remaining heads and EVERY survivor rises to 78_000_000 / 5 = 15_600_000 — including ben-202,
   * who is in a different branch entirely. Per stirpes, his branch's share would stay in his branch and
   * ben-202 would not move at all.
   *
   * ⚠ **The subject moved from ben-207 to ben-205 and the choice is load-bearing twice over.** In the
   * rebuilt `waqf-005` tree ben-207 is ALREADY deceased, so "killing" him would change nothing and the
   * test would assert 5 heads against a run that still had 6. ben-205 is (a) currently eligible and
   * (b) a **leaf** — he has no descendants waiting behind him, so his death removes exactly one head.
   * Killing a non-leaf (ben-204, say) would ADD heads as his children came to the frontier, which is a
   * true and important behaviour but a different test: it is pinned in `worked-examples.test.ts`.
   *
   * The owner chose per capita explicitly, having been shown this consequence (ADR-0009 R3), so the
   * assertion is the equality across ALL survivors rather than "the total is still conserved" — which
   * both models satisfy.
   */
  it('a death raises EVERY survivor by exactly the recomputation, across branch boundaries', () => {
    const base = mustRun(exampleG());
    const afterDeath = mustRun({
      ...exampleG(),
      beneficiaries: exampleG().beneficiaries.map((member) =>
        member.id === 'ben-205' ? { ...member, active: false } : member,
      ),
    });

    expect(afterDeath.totals.entitledLineCount).toBe(5);
    expect(78_000_000n / 5n).toBe(AMOUNT_PER_HEAD_5);
    for (const line of afterDeath.lines.filter((entry) => entry.status !== 'EXCLUDED')) {
      expect(line.entitledMinor).toBe(AMOUNT_PER_HEAD_5);
    }
    // ben-202 is in Branch B and gains anyway — the per-stirpes discriminator.
    const before202 = base.lines.find((entry) => entry.beneficiaryId === 'ben-202')?.entitledMinor;
    const after202 = afterDeath.lines.find(
      (entry) => entry.beneficiaryId === 'ben-202',
    )?.entitledMinor;
    expect(before202).toBe(AMOUNT_PER_HEAD_6);
    expect(after202).toBe(AMOUNT_PER_HEAD_5);
    expect((after202 as bigint) > (before202 as bigint)).toBe(true);

    // And a death NEVER lowers anyone: the head count can only shrink, so each remaining share can only
    // rise. Stated as a per-line inequality so a single mis-attributed line is caught.
    for (const line of afterDeath.lines.filter((entry) => entry.status !== 'EXCLUDED')) {
      const previous = base.lines.find((entry) => entry.beneficiaryId === line.beneficiaryId);
      expect((line.entitledMinor as bigint) >= (previous?.entitledMinor as bigint)).toBe(true);
    }
    // The dead man's line is EXCLUDED and holds nothing — his share was not "held" anywhere.
    const dead = afterDeath.lines.find((entry) => entry.beneficiaryId === 'ben-205');
    expect(dead?.status).toBe('EXCLUDED');
    expect(dead?.reasonCode).toBe('BENEFICIARY_INACTIVE');
    expect(dead?.entitledMinor).toBe(0n);
    expect(afterDeath.totals.entitledMinor).toBe(78_000_000n);
  });

  it('a duplicate id cannot double-count a head — it is refused at the door AND in the resolver', () => {
    const base = exampleG();
    const duplicated = {
      ...base,
      beneficiaries: [...base.beneficiaries, { ...base.beneficiaries[0] }],
    } as DistributionInputRaw;
    const attempt = attack(duplicated);
    expect(attempt.ok).toBe(false);
    // The contract door catches it first, with its own code — a duplicate is a malformed INPUT before it
    // is an unresolvable Shart. Both refusals exist; the resolver's own is driven in `resolver.test.ts`.
    if (!attempt.ok) expect(attempt.code).toBe('DISTRIBUTION_INPUT_INVALID');
  });

  /**
   * ⚠ **RE-POINTED FROM ben-206 TO ben-210, because ben-206 now proves the opposite half.**
   *
   * In the rebuilt tree ben-206 is a **SON's daughter and is ENTITLED** under `ZUHUR_ONLY` — she is
   * the record that proves a line may end in a daughter. Driving "the excluded buṭūn member" from her
   * would assert `EXCLUDED` against a paid line. ben-210 is the right subject: his mother ben-203 is a
   * **deceased DAUGHTER** of the waqif, so the line reaches the frontier and is then cut by her link.
   *
   * Both halves of the claim survive intact — his own link is not read, his ancestor's is.
   */
  it('the ẓuhūr filter cannot be evaded by re-labelling the PERSON rather than the ancestor', () => {
    // ben-210's exclusion depends on his mother's link, not on his own. Flipping HIS link must change
    // nothing — an implementation that tested the person's own link would suddenly pay him.
    for (const link of ['SON', 'DAUGHTER'] as const) {
      const run = mustRun({
        ...exampleG(),
        beneficiaries: exampleG().beneficiaries.map((member) =>
          member.id === 'ben-210' ? { ...member, lineageLink: link } : member,
        ),
      });
      const line = run.lines.find((entry) => entry.beneficiaryId === 'ben-210');
      expect(line?.status).toBe('EXCLUDED');
      expect(line?.reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
      expect(run.totals.entitledLineCount).toBe(6);
    }
    // Whereas flipping the ANCESTOR's link is exactly what does change it — so the filter reads the
    // chain and not a constant. ben-203 becoming a SON opens her whole (deceased) branch: ben-210 and
    // ben-211 both come to the frontier, 6 heads → 8. ben-216 stays excluded, now because his father
    // ben-210 is ALIVE and holds that line — a different rung of the same precedence.
    const promoted = mustRun({
      ...exampleG(),
      beneficiaries: exampleG().beneficiaries.map((member) =>
        member.id === 'ben-203' ? { ...member, lineageLink: 'SON' } : member,
      ),
    });
    expect(promoted.lines.find((entry) => entry.beneficiaryId === 'ben-210')?.status).not.toBe(
      'EXCLUDED',
    );
    expect(promoted.lines.find((entry) => entry.beneficiaryId === 'ben-216')?.reasonCode).toBe(
      'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
    );
    expect(promoted.totals.entitledLineCount).toBe(8);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * Refusals that must stay refusals
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('the engine refuses rather than guessing', () => {
  it.each([
    ['ordered', 'SHART_INCOMPLETE'],
    ['ORDERED ', 'SHART_INCOMPLETE'],
    [' ORDERED', 'SHART_INCOMPLETE'],
    ['MURATTAB', 'SHART_INCOMPLETE'],
    ['ORDEREDX', 'SHART_INCOMPLETE'],
    ['', 'SHART_INCOMPLETE'],
    ['NA_DIRECT_USE ', 'SHART_INCOMPLETE'],
  ])('entitlementOrder %o ⇒ %s', (order, expectedCode) => {
    const attempt = attack({ ...exampleA(), entitlementOrder: order });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe(expectedCode);
  });

  it('an unreadable Shart outranks a would-be-negative waterfall', () => {
    // Both defects present: the order is illegible AND the retainer exceeds net income.
    const attempt = attack({
      ...exampleA(),
      entitlementOrder: 'murattab',
      nazirFee: { basis: 'RETAINER', fixedAmountMinor: 99_000_000n },
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe('SHART_INCOMPLETE');
  });

  /**
   * ⚠ **RE-POINTED BY ADR-0009 R5.** These two cases used to be "a JOINT waqf with one leg missing".
   * The refusal is now larger in two directions at once — every joint waqf, and every mixed خيري/ذري
   * cohort under any legal type — so the table covers both, and each case pins `details.refusal`
   * because eighteen refusals now share the `SHART_INCOMPLETE` code.
   */
  it.each([
    ['a JOINT waqf with both legs (the shape that used to compute)', 'JOINT', undefined],
    ['a JOINT waqf with only the charitable leg', 'JOINT', [BEN_006]],
    ['a JOINT waqf with only the family leg', 'JOINT', [BEN_007, BEN_008]],
    ['a JOINT waqf with no cohort at all', 'JOINT', []],
  ] as const)('%s ⇒ WAQF_TYPE_JOINT_NOT_SUPPORTED', (_label, waqfType, beneficiaries) => {
    const base = exampleDJoint();
    const attempt = attack({
      ...base,
      waqfType,
      beneficiaries: beneficiaries ?? base.beneficiaries,
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.code).toBe('SHART_INCOMPLETE');
      expect(attempt.refusal).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    }
  });

  it.each(['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const)(
    'the RE-ENTRY route — a mixed خيري/ذري cohort declared %s ⇒ COHORT_MIXES_CHARITABLE_AND_FAMILY',
    (waqfType) => {
      const attempt = attack({ ...exampleDJoint(), waqfType });
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) {
        expect(attempt.code).toBe('SHART_INCOMPLETE');
        expect(attempt.refusal).toBe('COHORT_MIXES_CHARITABLE_AND_FAMILY');
      }
    },
  );

  /**
   * The lineage graph's own refusal surface, driven adversarially. Each of these is a way a real seed
   * mapper or a mis-transcribed deed could break the family tree, and every one must HALT rather than
   * be repaired — an engine that "fixed" a dangling `parentId` by treating the member as a child of the
   * waqif would promote them a generation and change every other beneficiary's per-capita share.
   */
  it.each([
    ['a lineageLink outside {SON, DAUGHTER}', { lineageLink: 'son' }, 'LINEAGE_LINK_UNRECOGNISED'],
    ['a parentId nobody holds', { parentId: 'ben-ghost' }, 'LINEAGE_PARENT_UNKNOWN'],
    ['a member who is its own parent', { parentId: 'ben-207' }, 'LINEAGE_CYCLE'],
    ['a recorded descendant with no ṭabaqa', { tabaqa: null }, 'TABAQA_MISMATCHES_LINEAGE_DEPTH'],
    ['a ṭabaqa the parent edges contradict', { tabaqa: 4 }, 'TABAQA_MISMATCHES_LINEAGE_DEPTH'],
    [
      'a FAMILY member with no lineage fact at all',
      { lineageLink: null, parentId: null, tabaqa: null },
      'LINEAGE_LINK_MISSING',
    ],
    [
      'a parent edge on someone recorded as no descendant',
      { lineageLink: null, tabaqa: null },
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    ],
  ] as const)('%s ⇒ %s', (_label, patch, refusal) => {
    const base = exampleG();
    const attempt = attack({
      ...base,
      beneficiaries: base.beneficiaries.map((member) =>
        member.id === 'ben-207' ? { ...member, ...patch } : member,
      ),
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.code).toBe('SHART_INCOMPLETE');
      expect(attempt.refusal).toBe(refusal);
    }
  });

  it.each([null, '', '  ', 'zuhur_only', 'ZUHUR_ONLY ', 'ظهور فقط'])(
    'continuationStipulation %o on a lineage deed ⇒ CONTINUATION_STIPULATION_UNRECOGNISED',
    (recorded) => {
      const attempt = attack({ ...exampleG(), continuationStipulation: recorded });
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) {
        expect(attempt.code).toBe('SHART_INCOMPLETE');
        expect(attempt.refusal).toBe('CONTINUATION_STIPULATION_UNRECOGNISED');
      }
    },
  );

  it.each([
    [{ roundingUnitMinor: 5n }, 'SETTING_INVALID'],
    [{ roundingMethod: 'LARGEST_REMAINDER_BANKERS' as const }, 'SETTING_INVALID'],
    [{ kycRefreshMonths: -1 }, 'DISTRIBUTION_INPUT_INVALID'],
    [{ kycRefreshMonths: 1.5 }, 'DISTRIBUTION_INPUT_INVALID'],
    [{ kycRefreshMonths: 1_000_000 }, 'SETTING_INVALID'],
  ])('a policy of %o ⇒ %s — never a coded fallback', (patch, expectedCode) => {
    const attempt = attack({ ...exampleA(), policy: policy(patch) });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe(expectedCode);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * G-9 CLAUSE 3 · CERTIFIED — and the certification says WHICH mechanism guarantees WHICH half
 *
 * **Owner ruling: memo Q1, product owner 2026-08-17 — "I-R1 is the guarantee."** The untiered recorded
 * ultimate taker (مآل الوقف) is BY DESIGN outside tier logic; **I5's claim narrows to descendants**; the
 * taker's line is guaranteed by its DEFAULT EXCLUSION plus **I-R1's universal mirror**. That ruling is what
 * closes the qualification this file has carried since S3 — and this block is where it is closed, because
 * `docs`/`BUILD-PLAN` may only report a closure that a measurement here supports.
 *
 * ⚠ **THE CONFIGURATION IS THE ONE THE OLD QUALIFICATION NAMED**, not a nearby one: an **UNTIERED**
 * `CHARITABLE_JIHA` inside a **TIERED** family cohort, on `ORDERED`, with real living ṭabaqa-1 descendants
 * beside it and the jiha's deed weight (40) large enough that an escape would show up as **halalas** rather
 * than only as a reason code.
 *
 * ⚠ **AND IT IS MUTATION-VERIFIED AGAINST THE MECHANISM THE RULING NAMES.** MEASURED 2026-08-17 by disabling
 * I-R1's universal mirror (the final `if (paidCharitableIds.length > 0 && paidDescendantIds.length > 0)`
 * throw in `invariants.assertReversionIntegrity`) and re-running: **case 3 below goes RED** — `expected
 * [Function] to throw an error`, `g9-adversarial.test.ts:2191` — and the rest of this file stays green.
 * Across the whole package the mutation kills **3 of 1,824** — the suite's size at the moment of that
 * measurement; four boundary cases landed in `continuing-line-adversarial` afterwards, so it reads 1,828
 * now, and the denominator is left as taken rather than rescaled. The three are: this case,
 * `engine.test.ts:2541` and
 * `reversion-adversarial.test.ts:1271` — the mirror's other two drivers, so the guarantee is triple-driven
 * and not certified by this block alone. That is the point of the mutation: if nothing had reddened, clause 3
 * would be certified by something other than what the ruling names, and the honest report would have been
 * *"the ruling does not describe the code"* rather than a closure. Restored, and the suite re-measured green.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('G-9 clause 3 · CERTIFIED (memo Q1, product owner 2026-08-17)', () => {
  /** Example A's ORDERED cohort — tiered descendants — plus `ben-006` named as the deed's مآل. */
  function maalOverTieredCohort(): DistributionInputRaw {
    return {
      ...exampleA(),
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-006'] },
      beneficiaries: [BEN_001, BEN_002, BEN_003, BEN_006],
    };
  }

  it('1 · HALF ONE · I5 is asserted and covers the DESCENDANTS — every off-tier member excluded by a tier code', () => {
    const result = mustRun(maalOverTieredCohort());
    // ṭabaqa 1 = { ben-001, ben-003 } living ⇒ entitled; ben-002 (ṭabaqa 2) waits.
    expect(result.invariantsChecked).toContain('I5');
    // ⚠ `ben-003` is WITHHELD by a payability GATE (Example A gives it an unverified KYC), not excluded —
    // and that is worth asserting rather than editing around: a gate never touches entitlement (I6), so
    // clause 3's claim is about the EXCLUSION codes and the amounts below, which are unaffected by it.
    expect(statusesById(result)).toMatchObject({
      'ben-001': 'PAID/null',
      'ben-003': 'WITHHELD/KYC_UNVERIFIED',
      'ben-002': 'EXCLUDED/UPPER_TABAQA_EXTANT',
    });
    // 27,500,000 × 12.5/25 = 13,750,000 each, residual 0 — Example A's own waterfall, by hand.
    expect(amountsById(result)).toMatchObject({
      'ben-001': '13750000',
      'ben-002': '0',
      'ben-003': '13750000',
    });
  });

  it('2 · HALF TWO · the untiered taker is decided by the REVERSION ladder — never by a tier code', () => {
    const result = mustRun(maalOverTieredCohort());
    const jiha = result.lines.find((line) => line.beneficiaryId === 'ben-006');
    expect(jiha?.status).toBe('EXCLUDED');
    expect(jiha?.entitledMinor).toBe(0n);
    // The default exclusion — the first of the two mechanisms the ruling names.
    expect(jiha?.reasonCode).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    // …and NOT a tier code, on either side. I5 makes no claim here and must not appear to.
    expect(jiha?.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
    expect(jiha?.reasonCode).not.toBe('TABAQA_EXTINCT');
    expect(jiha?.basis.tabaqa).toBeNull();
    // Had it escaped its ladder the way DEFECT-A2's jiha escaped the tier test, the denominator would have
    // been 12.5 + 12.5 + 40 = 65 and the charity would have taken floor(27,500,000 × 40/65) + 1 =
    // 16,923,077 halalas (SAR 169,230.77), cutting each living descendant to 5,288,461. It takes ZERO.
    expect(result.totals.entitledMinor).toBe(27_500_000n as Minor);
  });

  it('3 · THE GUARANTEE · I-R1 REFUSES a run that pays a charity beside a certified descendant', () => {
    /*
     * The load-bearing case, and the only one in this block that is mutation-sensitive to the mechanism the
     * ruling names. The resolver will not *produce* this state — that is what half two proves — so the
     * state is FORGED and handed to the invariant directly: a charity holding one halala on a run that also
     * pays two certified descendants. I-R1's universal mirror must refuse it.
     *
     * `reversion: null` on the context's input is deliberate: it removes the taker set, so claims 1, 2 and 4
     * of I-R1 make no claim at all and **only the mirror can throw**. A forged state that tripped an earlier
     * claim would prove the wrong half.
     */
    const legal = mustRun(maalOverTieredCohort());
    const forgedLines = legal.lines.map((line) =>
      line.beneficiaryId === 'ben-006'
        ? { ...line, status: 'PAID' as const, entitledMinor: 1n as Minor }
        : line,
    );
    const ctx: InvariantContext = {
      input: parseDistributionInput({ ...maalOverTieredCohort(), reversion: null }),
      distributionType: 'MONETARY',
      order: 'ORDERED',
      waterfall: legal.waterfall,
      lines: forgedLines,
      totals: legal.totals,
      floorsMinor: [],
      entitledIds: ['ben-001', 'ben-003', 'ben-006'],
      flags: [],
    };

    let caught: unknown;
    expect(() => {
      try {
        assertReversionIntegrity(ctx);
      } catch (error) {
        caught = error;
        throw error;
      }
    }).toThrow();
    if (!isDomainError(caught)) throw caught ?? new Error('no error captured');
    expect(caught.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
    expect(caught.details).toMatchObject({ invariantId: 'I-R1' });
    // It names both sides, because "a charity was paid beside the bloodline" is unreadable without them.
    expect(caught.message).toContain('ben-006');
    expect(caught.message).toContain('ben-001');
    // …and it states the rule it enforces, so a reader of the failure learns R5 rather than a code.
    expect(caught.message).toContain('never both');
  });

  it('4 · THE CONTROL · the same forged lines WITHOUT a paid descendant do NOT breach the mirror', () => {
    // The mirror is about SHARING, and this is the boundary its own doc states: a charity paid alone after
    // the family is gone is closed by the refusals and by REVERSION_WITH_NO_RECORDED_BLOODLINE, not here.
    // Without this control, case 3 would pass for a mirror that simply refused every paid charity.
    const legal = mustRun(maalOverTieredCohort());
    const forgedLines = legal.lines.map((line) =>
      line.beneficiaryId === 'ben-006'
        ? { ...line, status: 'PAID' as const, entitledMinor: 1n as Minor }
        : { ...line, status: 'EXCLUDED' as const, entitledMinor: 0n as Minor },
    );
    expect(() => {
      assertReversionIntegrity({
        input: parseDistributionInput({ ...maalOverTieredCohort(), reversion: null }),
        distributionType: 'MONETARY',
        order: 'ORDERED',
        waterfall: legal.waterfall,
        lines: forgedLines,
        totals: legal.totals,
        floorsMinor: [],
        entitledIds: ['ben-006'],
        flags: [],
      });
    }).not.toThrow();
  });

  it('5 · BOTH HALVES ON ONE RUN · I5 and I-R1 are both reported, and the taker takes only once the line ends', () => {
    // The pairing is the certification: I5 present (descendants covered) AND I-R1 present (the taker's line
    // covered). A run reporting only one of them would be the R6-I5 defect in the other direction.
    const pending = mustRun(maalOverTieredCohort());
    expect(pending.invariantsChecked).toContain('I5');
    expect(pending.invariantsChecked).toContain('I-R1');
    expect(pending.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // One generation later — every recorded descendant deceased — the taker is the only entitled line, at
    // its DEED weight (40/40 ⇒ the whole 27,500,000), stamped with the reversion's own rule.
    const reverted = mustRun({
      ...maalOverTieredCohort(),
      beneficiaries: [
        patched(BEN_001, { active: false }),
        patched(BEN_002, { active: false }),
        patched(BEN_003, { active: false }),
        BEN_006,
      ],
    });
    expect(amountsById(reverted)).toMatchObject({
      'ben-001': '0',
      'ben-002': '0',
      'ben-003': '0',
      'ben-006': '27500000',
    });
    expect(reverted.lines.find((line) => line.beneficiaryId === 'ben-006')?.basis.rule).toBe(
      'ULTIMATE_TAKER_MAAL_AL_WAQF',
    );
    expect(reverted.invariantsChecked).toContain('I-R1');
    // I-R1's mirror is non-vacuous on THIS run too: a charity is paid, and no descendant is.
    expect(reverted.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  it('6 · R6-I5 · the I5 exemption has a REACHABLE SUBJECT, which is what made it an honesty gap', () => {
    /*
     * R6-I5 is memo Q1's second half and closes with it. The gap was never that I5 was wrong — it was that
     * I5's untiered exemption had **no reachable subject** for a while, so a green I5 said nothing while
     * looking like coverage. R7 gave it one (the untiered taker) and the ruling makes the exemption a
     * CLAIM rather than a flag. Asserted structurally: this cohort really does mix tiered and untiered
     * members, so the exemption is exercised rather than vacuous.
     */
    const result = mustRun(maalOverTieredCohort());
    const tiered = result.lines.filter((line) => line.basis.tabaqa !== null);
    const untiered = result.lines.filter((line) => line.basis.tabaqa === null);
    expect(tiered.map((line) => line.beneficiaryId)).toStrictEqual([
      'ben-001',
      'ben-002',
      'ben-003',
    ]);
    expect(untiered.map((line) => line.beneficiaryId)).toStrictEqual(['ben-006']);
    // The exemption's content: no untiered line carries a tier code, on a run where tier codes DO appear.
    expect(tiered.some((line) => line.reasonCode === 'UPPER_TABAQA_EXTANT')).toBe(true);
    for (const line of untiered) {
      expect(line.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
      expect(line.reasonCode).not.toBe('TABAQA_EXTINCT');
    }
    expect(result.invariantsChecked).toContain('I5');
  });
});
