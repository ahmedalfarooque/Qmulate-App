/**
 * `distribution/__tests__/worked-examples.test.ts` — §08's five worked examples, driven end to end
 * through {@link runDistribution} and asserted **field by field, in halalas**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE DISCHARGES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Epic E6's exit clause 1 — "all three modes verified on the fixture" — plus the fourth mode §08
 * documents but the clause forgets to name:
 *
 *  | §17 scenario | mode              | example         | waqf                    |
 *  |--------------|-------------------|-----------------|-------------------------|
 *  | **V-1**      | ORDERED           | A, and E        | `waqf-001`              |
 *  | **V-2**      | SHARED (tashrik)  | B               | `waqf-002`              |
 *  | **V-3**      | direct use        | C **and C2**    | `waqf-004`              |
 *  | (unnamed)    | JOINT             | D               | `waqf-003`              |
 *  | (unnamed)    | Hamilton residual | F               | invented                |
 *
 * ⚠ **SCOPE.** V-1/V-2/V-3 as written in §17 are DATABASE-backed integration scenarios. This file
 * proves the **engine half** against the in-package TypeScript fixture (decision D3). The
 * seeded-database half and the UI leg are S7's, and they stay blocked on
 * `FIXTURE_DELTA_REQUIRED` — the JSON fixture is currently missing fields these scenarios need. No
 * claim about the database or the UI is made here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERY EXPECTED FIGURE IS DERIVED, NOT OBSERVED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The `EXPECTED_*` constants in `./fixtures/worked-examples.js` carry their arithmetic in comments.
 * On top of that, {@link describe} "each deduction recomputed independently from its own basis"
 * re-derives every waterfall term from its stated rule — `percentOf` for a rate, the literal for a
 * FIXED amount — instead of trusting the engine's own subtraction chain. That distinction matters:
 * invariant I1 (`revenue == reserve + operating + fee + distributable`) is a **tautology at runtime**
 * because `computeWaterfall` derives `distributable` AS the remainder, so conservation alone would
 * still hold if the fee were computed on the wrong base. The independent recomputation is what
 * catches §08's `Percent01` defect (`0.10` where the rate is `'10'`, a silent 100× underpayment).
 */

import { describe, expect, it } from 'vitest';

import {
  addCalendarMonths,
  civilDate,
  differenceInCalendarDays,
  formatHijriDate,
  fromHijri,
  parseHijriDate,
  toHijri,
} from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import { fromMinor, percentOf, toMinor } from '../../money.js';
import { canonicalizeResult } from '../trace.js';
import { ENGINE_VERSION, runDistribution } from '../engine.js';
import type { DistributionInputRaw, DistributionLine, DistributionResult } from '../contract.js';
import {
  AS_OF_GREGORIAN,
  AS_OF_HIJRI,
  BEN_006,
  DISPLAY_NAMES,
  EXPECTED_A,
  EXPECTED_B,
  EXPECTED_C,
  EXPECTED_C2,
  EXPECTED_D_CHARITABLE,
  EXPECTED_E,
  EXPECTED_F,
  EXPECTED_F_FLOORS,
  EXPECTED_G,
  EXPECTED_G_ZUHUR_AND_BUTUN,
  EXPECTED_H,
  EXPECTED_H_FLOORS,
  EXPECTED_J,
  EXPECTED_J_REVERTED,
  EXPECTED_TIMING,
  FIXTURE_DELTA_CLOSED_IN_S4,
  FIXTURE_DELTA_CLOSED_IN_S5,
  FIXTURE_DELTA_REQUIRED,
  FIXTURE_DELTA_TOTAL_BEFORE_S4,
  FYE_HIJRI,
  HIJRI_DEADLINE_AS_GREGORIAN,
  beneficiary,
  exampleA,
  exampleB,
  exampleC,
  exampleC2,
  exampleAContinuationRecorded,
  exampleDCharitable,
  exampleDCharitableExpiredJihaLicence,
  exampleDCharitableUnlicensedJiha,
  exampleDJoint,
  exampleDJointReEnteredAsFamily,
  exampleE,
  exampleEKycExactlyAtExpiry,
  exampleF,
  exampleG,
  exampleGZuhurAndButun,
  exampleH,
  exampleJ,
  exampleJReverted,
} from './fixtures/worked-examples.js';
import type { ExpectedExample, ExpectedLine } from './fixtures/worked-examples.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Shared assertion helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Flatten a result line into the exact shape {@link ExpectedLine} declares. Nothing omitted. */
function flatten(line: DistributionLine): ExpectedLine {
  return {
    beneficiaryId: line.beneficiaryId,
    status: line.status,
    entitledMinor: line.entitledMinor as bigint,
    sharePercent: line.sharePercent,
    tabaqa: line.basis.tabaqa,
    line: line.basis.line,
    branch: line.basis.branch,
    kind: line.basis.kind,
    rule: line.basis.rule,
    reasonCode: line.reasonCode,
    gateFlags: line.gateFlags,
    bankingRefForProceeds: line.bankingRefForProceeds,
    // ADR-0009's four basis fields, flattened like every other field so `toStrictEqual` covers them.
    // They are on the beneficiary's official Arabic statement (BR-505) and are therefore asserted, not
    // sampled.
    lineageDepth: line.basis.lineageDepth,
    parentId: line.basis.parentId,
    lineageLink: line.basis.lineageLink,
    continuationStipulation: line.basis.continuationStipulation,
  };
}

/**
 * Assert a whole run against its expectation, term by term.
 *
 * `toStrictEqual` on the waterfall and the totals rather than a field-by-field walk, deliberately: a
 * strict-equal fails on an EXTRA field too, so a future field added to `Waterfall` or `Totals`
 * without an expectation cannot pass silently.
 */
function expectExample(input: DistributionInputRaw, expected: ExpectedExample): DistributionResult {
  const result = runDistribution(input);

  expect(result.engineVersion).toBe(ENGINE_VERSION);
  expect(result.waqfId).toBe(expected.waqfId);
  expect(result.distributionType).toBe(expected.distributionType);
  expect(result.classification).toBe(expected.classification);
  expect(result.waqfType).toBe(expected.waqfType);
  expect(result.entitlementOrder).toBe(expected.entitlementOrder);
  expect(result.entitlementRule).toBe(expected.entitlementRule);

  expect(result.waterfall).toStrictEqual(expected.waterfall);
  expect(result.lines.map(flatten)).toStrictEqual(expected.lines);
  expect(result.totals).toStrictEqual(expected.totals);
  expect(result.timing).toStrictEqual(EXPECTED_TIMING);
  expect(result.flags).toStrictEqual(expected.flags);
  expect(result.invariantsChecked).toStrictEqual(expected.invariantsChecked);
  expect(result.authorityNotices.map((notice) => notice.beneficiaryId)).toStrictEqual(
    expected.authorityNoticeBeneficiaryIds,
  );

  return result;
}

/** `percent`% of a halala amount, through the ONE tested percentage path. */
function pct(baseMinor: bigint, ratePercent: string): bigint {
  return toMinor(percentOf(fromMinor(baseMinor), ratePercent));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The five worked examples
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('worked example A · V-1 · ORDERED, medium family_dhurri (waqf-001)', () => {
  const result = expectExample(exampleA(), EXPECTED_A);

  it('V-1 · the whole run matches §08 Example A field for field, in halalas', () => {
    // Discharged by `expectExample` above. Restated as an explicit `it` so the §17 verification plan
    // can be traced to a named test rather than to a bare module-level call.
    expect(result.waqfId).toBe('waqf-001');
    expect(result.entitlementRule).toBe('ORDERED_LOWEST_LIVING_TABAQA');
  });

  it('excludes ben-002 from the DENOMINATOR, not merely from the payout', () => {
    // The check that catches an "exclusion" implemented by zeroing the amount while leaving the
    // weight in the divisor: three members each carry deed weight 12.5, but only the two entitled
    // ones are normalised over, so they take 50% each and not 33.33%.
    const entitled = result.lines.filter((line) => line.status !== 'EXCLUDED');
    expect(entitled).toHaveLength(2);
    for (const line of entitled) {
      expect(line.entitledMinor).toBe(13_750_000n);
      expect(line.sharePercent).toBe('50.000000');
    }
    expect(result.lines.map((line) => line.entitledMinor).reduce((a, b) => a + b, 0n)).toBe(
      27_500_000n,
    );
  });

  it('withholding ben-003 does NOT reallocate its share to ben-001 (I6)', () => {
    const withheld = result.lines.find((line) => line.beneficiaryId === 'ben-003');
    const paid = result.lines.find((line) => line.beneficiaryId === 'ben-001');
    expect(withheld?.status).toBe('WITHHELD');
    expect(withheld?.entitledMinor).toBe(13_750_000n);
    // ben-001 is paid exactly its own half — not its half plus the withheld one.
    expect(paid?.entitledMinor).toBe(13_750_000n);
    expect(result.totals.paidMinor).toBe(13_750_000n);
    // ben-003's share sits in `withheldMinor`, attached to a NAMED beneficiary — never in
    // `retainedMinor`, which is distributable attached to no line at all.
    expect(result.totals.withheldMinor).toBe(13_750_000n);
    expect(result.totals.retainedMinor).toBe(0n);
  });

  it('ben-001 passes the KYC gate because its window has not closed yet', () => {
    // 2026-01-15 + 12 calendar months = 2027-01-15, which is after asOf 2026-07-14.
    expect(addCalendarMonths(civilDate('2026-01-15'), 12)).toBe('2027-01-15');
    expect(differenceInCalendarDays(civilDate(AS_OF_GREGORIAN), civilDate('2027-01-15'))).toBe(185);
    expect(result.lines.find((line) => line.beneficiaryId === 'ben-001')?.gateFlags).toEqual([]);
  });
});

describe('worked example B · V-2 · SHARED (tashrik), small family_dhurri (waqf-002)', () => {
  const result = expectExample(exampleB(), EXPECTED_B);

  it('V-2 · the whole run matches §08 Example B field for field, in halalas', () => {
    expect(result.waqfId).toBe('waqf-002');
    expect(result.entitlementRule).toBe('SHARED_ALL_LIVING_TABAQAT');
  });

  /**
   * THE CONTRAST WITH A IS THE TEST.
   *
   * A and B have the same tier shape — a ṭabaqa-1 member and a ṭabaqa-2 member, both active. Under
   * ORDERED the ṭabaqa-2 member is EXCLUDED (an entitlement verdict, I5); under tashrik it is
   * ENTITLED and merely WITHHELD (a payability verdict, I6). A resolver that ignored
   * `entitlementOrder` would pass one of these two and fail the other.
   */
  it('entitles ṭabaqa 2 rather than excluding it — the tashrik contrast with Example A', () => {
    const tabaqaTwo = result.lines.find((line) => line.beneficiaryId === 'ben-005');
    expect(tabaqaTwo?.basis.tabaqa).toBe(2);
    expect(tabaqaTwo?.status).toBe('WITHHELD');
    expect(tabaqaTwo?.entitledMinor).toBe(8_500_000n);
    expect(tabaqaTwo?.reasonCode).toBe('KYC_UNVERIFIED');
    expect(result.totals.excludedCount).toBe(0);

    // The same tier, in the ORDERED waqf, is excluded on ENTITLEMENT grounds and owed nothing.
    const orderedRun = runDistribution(exampleA());
    const orderedTabaqaTwo = orderedRun.lines.find((line) => line.beneficiaryId === 'ben-002');
    expect(orderedTabaqaTwo?.basis.tabaqa).toBe(2);
    expect(orderedTabaqaTwo?.status).toBe('EXCLUDED');
    expect(orderedTabaqaTwo?.entitledMinor).toBe(0n);
    expect(orderedTabaqaTwo?.reasonCode).toBe('UPPER_TABAQA_EXTANT');
    expect(orderedRun.totals.excludedCount).toBe(1);
  });

  it('takes the ṣiyāna reserve as a PERCENT of revenue, half-up to the halala', () => {
    // 5% of 200,000.00 = 10,000.00 exactly; no rounding is exercised here, and the next describe
    // block proves the rate path itself on a figure that does round.
    expect(result.waterfall.maintenanceReserveMinor).toBe(pct(20_000_000n, '5'));
    expect(result.waterfall.maintenanceReserveMinor).toBe(1_000_000n);
  });
});

describe('worked example C · V-3 · direct utilization, nil period (waqf-004)', () => {
  const result = expectExample(exampleC(), EXPECTED_C);

  it('V-3 · emits no monetary line at all, and every total is zero', () => {
    expect(result.distributionType).toBe('NA_DIRECT_USE');
    expect(result.lines).toEqual([]);
    expect(result.totals.paidMinor).toBe(0n);
    expect(result.totals.withheldMinor).toBe(0n);
    expect(result.totals.crossBorderMinor).toBe(0n);
    expect(result.totals.retainedMinor).toBe(0n);
  });

  it('emits no line EVEN THOUGH the waqf has a live beneficiary cohort (I7 is unconditional)', () => {
    // The fixture deliberately carries two active beneficiaries; an empty input array would have
    // proven nothing. They benefit from asset-006 itself, not from ghallah.
    expect(exampleC().beneficiaries).toHaveLength(2);
    expect(result.lines).toHaveLength(0);
    expect(result.totals.excludedCount).toBe(0);
  });

  it('reports the flag set in canonical order — a set, not an emission sequence', () => {
    expect(result.flags).toStrictEqual([
      'NIL_DISTRIBUTION',
      'NA_DIRECT_USE',
      'UNVERIFIED_FIGURES_APPLIED',
    ]);
  });

  /**
   * ⚠ **INVERTED BY ADR-0009 — this used to be the test that a direct-use JOINT waqf COMPUTES.**
   *
   * Its old claim: "I7 outranks the joint-legs check", because a direct-use waqf moves no ghallah and
   * refusing it for a missing charitable leg would block a run whose answer is "no monetary
   * distribution" either way. That claim is now FALSE and the change is deliberate, not incidental: a
   * JOINT waqf is refused because **it cannot exist**, not because its split cannot be computed
   * (R5) — so there is nothing for I7 to outrank. A waqf whose recorded nature is impossible is void
   * whatever its figures say, and reporting "no monetary distribution" about it would be answering a
   * question that should never have been asked.
   *
   * What SURVIVES of the old claim, and is asserted below, is the half that is still true: the
   * `NA_DIRECT_USE` short-circuit still precedes the continuation parse, so a direct-use waqf is not
   * refused for an unreadable stipulation it never reads.
   *
   * ⚠ **Precise as of memo Q7 (2026-08-17), since the mechanism changed under the claim:** the
   * `continuation` expression is now *evaluated* above the short-circuit — hoisted alongside
   * `buildLineage` to keep the continuation parse outranking a lineage-graph refusal on a **paying**
   * deed — but `parseContinuationStipulation` is reached only under `LINEAGE_CONTINUATION`, so nothing
   * parses a direct-use deed's term and the outcome asserted here is unchanged. The claim is about the
   * REFUSAL, not about statement order.
   *
   * ⚠ **The "tiered jiha" half of that survivor is now INVERTED TOO (2026-08-03).** The same
   * reasoning that made a `JOINT` waqf outrank I7 applies verbatim to a ṭabaqa on a وقف خيري: it is a
   * fact about **the waqf's nature**, refused in `assertSingleWaqfNature` at Stage 0, ahead of the
   * short-circuit. See the test below, which drives both halves apart.
   */
  it('is REFUSED as a JOINT waqf, whatever its revenue — the joint refusal outranks I7 now', () => {
    for (const revenue of [
      { incomeMinor: 0n, receipts: [] },
      {
        incomeMinor: 10_000_000n,
        receipts: [{ id: 'rev-006', receiptClass: 'INCOME', amountMinor: 10_000_000n }],
      },
    ] satisfies ReadonlyArray<DistributionInputRaw['revenue']>) {
      try {
        runDistribution({ ...exampleC(), waqfType: 'JOINT', revenue });
        expect.unreachable('a JOINT waqf must be refused even on the direct-use path');
      } catch (error) {
        if (!isDomainError(error)) throw error;
        expect(error.code).toBe('SHART_INCOMPLETE');
        expect(error.details).toMatchObject({ refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' });
        // The refusal must explain itself in the domain's own terms, not just carry a code.
        expect(error.message).toContain('خيري');
        expect(error.message).toContain('ذري');

        // ⊕ S9-4a — THIS ASSERTION USED TO ENCODE THE WITHDRAWN DOCTRINE, and that is worth saying
        // rather than quietly swapping. It required the message to tell a Nazir that *"a waqf is
        // either خيري or ذري and never both"*, and required `details.openReconciliationItem` to name
        // Awqaf Law Art. 4 as an OPEN question for counsel — so that nobody read a product rule
        // under review as a settled finding.
        //
        // The product owner CLOSED that question on 2026-08-25, in the other direction: *"i was
        // wrong earlier, a joint waqf is described as partially ذري and partially خيري."* So the
        // old assertions now demand that the engine state something the owner has retracted. What
        // must be true instead: the refusal cites the RULING, and names the engine's own missing
        // design as the reason — a joint endowment is legitimate to record and this engine cannot
        // yet compute its distribution.
        expect(error.message).toContain('NOT SUPPORTED');
        expect(error.details).toMatchObject({
          ownerRuling: expect.stringContaining('fifth batch') as unknown as string,
        });
        // And the epic's open questions travel with the refusal, so "not supported" is a scope
        // statement with a work list behind it rather than a shrug.
        expect(
          (error.details as { openEpicQuestions?: readonly string[] }).openEpicQuestions ?? [],
          "the refusal must carry the joint epic's open questions",
        ).toHaveLength(3);
        expect(error.details).not.toHaveProperty('openReconciliationItem');
      }
    }
  });

  it('short-circuits BEFORE the continuation parse — but NOT before the waqf-nature rules', () => {
    // ⚠ THE INVERTED HALF, INPUT VERBATIM. This probe was driven from a `PUBLIC_CHARITABLE` waqf
    // precisely because — at the time — a jiha and a ṭabaqa could legally coexist there and only
    // `assertJihaNotTiered` refused them. MEASURED THEN: the run COMPUTED, with
    // `distributionType: 'NA_DIRECT_USE'`, `lines: []`, `entitlementRule: 'NA_DIRECT_USE'` and no
    // `CONTINUATION_STIPULATION_NOT_APPLIED` flag. MEASURED NOW: `SHART_INCOMPLETE` /
    // `TABAQA_ON_CHARITABLE_WAQF`, because a ṭabaqa on a وقف خيري is a fact about the waqf's NATURE
    // and Stage 0 refuses those before the short-circuit — the same precedence the JOINT case above
    // established, applied to the same kind of fact.
    try {
      runDistribution({
        ...exampleC(),
        waqfType: 'PUBLIC_CHARITABLE',
        // An unreadable stipulation too, in the same input.
        continuationStipulation: 'not a stipulation the engine knows',
        beneficiaries: [
          {
            ...BEN_006,
            tabaqa: 3,
          },
        ],
      });
      expect.unreachable('a ṭabaqa on a وقف خيري must be refused, direct use or not');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({ refusal: 'TABAQA_ON_CHARITABLE_WAQF' });
    }

    // ── THE SURVIVING HALF, still driven: the unreadable stipulation alone is never read on a
    //    direct-use run. One field apart from the input above — the ṭabaqa is gone, nothing else.
    const unreadableStipulationOnDirectUse = runDistribution({
      ...exampleC(),
      waqfType: 'PUBLIC_CHARITABLE',
      continuationStipulation: 'not a stipulation the engine knows',
      beneficiaries: [{ ...BEN_006, tabaqa: null }],
    });
    expect(unreadableStipulationOnDirectUse.distributionType).toBe('NA_DIRECT_USE');
    expect(unreadableStipulationOnDirectUse.lines).toEqual([]);
    expect(unreadableStipulationOnDirectUse.entitlementRule).toBe('NA_DIRECT_USE');
    // And no not-applied flag: NA_DIRECT_USE never reads the stipulation, so it has nothing to report.
    expect(unreadableStipulationOnDirectUse.flags).not.toContain(
      'CONTINUATION_STIPULATION_NOT_APPLIED',
    );
  });

  /**
   * …and the same claim about `buildLineage`, **narrowed by memo Q7 and no longer the claim it was.**
   *
   * ⚠ This block's reasoning used to read: *"this cohort is precisely an input that halts the moment the
   * lineage graph is built — and it computes here, which is only possible if the `NA_DIRECT_USE`
   * short-circuit returns before `buildLineage` is ever reached."* **The second half is false since
   * 2026-08-17:** `buildLineage` now runs ABOVE the short-circuit (*validity precedes short-circuits*),
   * so the graph IS built on this run — it just finds no members, because ben-101 / ben-102 record no
   * `lineageLink` and membership is decided by that field alone.
   *
   * What the test still proves, exactly: **`LINEAGE_LINK_MISSING` is the one `buildLineage` pass the
   * short-circuit outranks**, because it is a completeness requirement rather than a self-contradiction.
   * The negative half is asserted alongside it, because "it computed" alone would also be true of an
   * engine that had quietly stopped requiring the edge — and the *positive* half of the new precedence
   * (a contradictory register halting a direct-use deed) is pinned in `q7-validity-precedence.test.ts`,
   * not here, so this test is not silently doing two jobs.
   */
  it('short-circuits before LINEAGE_LINK_MISSING — the identical cohort HALTS under a monetary order', () => {
    expect(exampleC().beneficiaries.every((member) => member.lineageLink === null)).toBe(true);
    // Direct use: computes. ⚠ The comment here said "with no lineage graph built at all" — false since
    // Q7. The graph is built and validated; it simply has no members, because membership is decided by
    // `lineageLink` and neither record carries one. Asserted rather than described, on the run's own trace.
    const direct = runDistribution(exampleC());
    expect(direct.lines).toEqual([]);
    expect(
      direct.computationTrace.find((entry) => entry.code === 'NA_DIRECT_USE_SHORT_CIRCUIT')?.data,
    ).toMatchObject({ lineageGraphValidated: 'true', lineageGraphMemberCount: '0' });

    // The same cohort, one field changed: now the edge is REQUIRED, and the record cannot survive it.
    try {
      runDistribution({ ...exampleC(), entitlementOrder: 'ORDERED' });
      expect.unreachable('a FAMILY member with no lineageLink must halt on a monetary order (R6)');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        refusal: 'LINEAGE_LINK_MISSING',
        beneficiaryId: 'ben-101',
        entitlementOrder: 'ORDERED',
      });
    }
  });
});

/**
 * **Example C2 — the DEFECT-1 regression test. Do not delete this block.**
 *
 * It is the only state in which §08's invariant I3 as originally written is arithmetically FALSE, so
 * it is the test that keeps `totals.retainedMinor` in the result shape.
 */
describe('worked example C2 · V-3 · direct utilization WITH period revenue (DEFECT-1 prover)', () => {
  const result = expectExample(exampleC2(), EXPECTED_C2);

  it('V-3 · computes the waterfall in full even though nothing will be split (§08 line 54)', () => {
    expect(result.waterfall.revenueMinor).toBe(10_000_000n);
    expect(result.waterfall.nazirFeeMinor).toBe(1_000_000n);
    expect(result.waterfall.distributableMinor).toBe(9_000_000n);
    expect(result.lines).toEqual([]);
  });

  it("§08's I3 AS WRITTEN is false here; the restated I3 with `retained` is what holds", () => {
    const { paidMinor, withheldMinor, crossBorderMinor, retainedMinor } = result.totals;
    const distributable = result.waterfall.distributableMinor as bigint;

    // §08: paid + withheld + crossBorder == distributable  →  0 == 9_000_000  →  FALSE.
    expect(paidMinor + withheldMinor + crossBorderMinor).not.toBe(distributable);
    expect(paidMinor + withheldMinor + crossBorderMinor).toBe(0n);

    // Restated (the spec correction): + retained.
    expect(paidMinor + withheldMinor + crossBorderMinor + retainedMinor).toBe(distributable);
    expect(retainedMinor).toBe(9_000_000n);
  });

  it('restated I2 likewise: Σ lines + retained == distributable', () => {
    const lineSum = result.lines.reduce<bigint>(
      (running, line) => running + line.entitledMinor,
      0n,
    );
    expect(lineSum).toBe(0n);
    expect(lineSum + (result.totals.retainedMinor as bigint)).toBe(
      result.waterfall.distributableMinor as bigint,
    );
  });

  it('only REPORTS the retained value — it carries nothing forward (OQ-01 is unsigned)', () => {
    // No carry-forward mechanic exists in the result shape, and adding one would resolve OQ-01
    // sub-question 2 in code. The trace says so rather than the engine acting on it.
    const codes = result.computationTrace.map((entry) => entry.code);
    expect(codes).toContain('ALLOCATE_SHORT_CIRCUIT');
    expect(Object.keys(result.totals)).not.toContain('carryForwardMinor');
  });
});

/**
 * ⚠ **§08's Example D is now a REFUSED INPUT (ADR-0009 R5) — and this block is where that is pinned.**
 *
 * Example D was a JOINT waqf: a 40% charitable jiha beside two 30% family branches. The product owner
 * ruled that shape impossible — a waqf is either خيري (charitable, for a segment the waqif chooses) or
 * ذري (ancestral/generational), never both. So the block splits:
 *
 *  · `describe('§08 Example D is refused …')` proves the original input can never compute again, and
 *    proves the RE-ENTRY route (the same cohort under `FAMILY_DHURRI`) is refused too.
 *  · `describe('worked example D-خ …')` re-homes every bit of coverage Example D was the only carrier
 *    of: the 40/30/30 arithmetic, `ENTITY_UNLICENSED` (revoked, expired, and the on-expiry-day
 *    boundary), `CROSS_BORDER_PENDING` + the Authority notice, and the CAPITAL-receipt corpus proof.
 *
 * The old block was DELETED-BY-INVERSION rather than deleted: every assertion below is the same claim
 * about the same figures on a legal waqf, plus a refusal where a computation used to be. That is the
 * discipline this repo used when the tiered-jiha defect was closed, and it exists because a deleted
 * test is invisible while an inverted one is a record.
 */
describe('§08 Example D is refused — a waqf is either خيري or ذري, never both (ADR-0009 R5)', () => {
  it('refuses the original JOINT input outright, before any figure is used', () => {
    try {
      runDistribution(exampleDJoint());
      expect.unreachable('a JOINT waqf must never compute again');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        field: 'waqfType',
        refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED',
        waqfType: 'JOINT',
      });
    }
  });

  /**
   * The re-entry route, and the reason the refusal is keyed on the COHORT and not only on the type.
   *
   * If the engine only refused `waqfType: 'JOINT'`, the identical mixed خيري/ذري cohort would simply
   * arrive declared `FAMILY_DHURRI` and nothing would have been prevented — the jiha would take its
   * 40% out of a family endowment's ghallah. This is the test that makes the refusal mean something.
   */
  it('refuses the SAME cohort re-declared as FAMILY_DHURRI — the evasion is closed', () => {
    try {
      runDistribution(exampleDJointReEnteredAsFamily());
      expect.unreachable('a mixed خيري/ذري cohort must be refused under any waqfType');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        field: 'beneficiaries[].kind',
        refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY',
        waqfType: 'FAMILY_DHURRI',
        charitableJihaCount: 1,
        familyCount: 2,
      });
    }
  });

  /**
   * `JOINT_FIXED_DEED_SHARES` survives in `ENTITLEMENT_RULES` as a record that this repo once modelled
   * joint deeds — ADR-0009 decision 3 is a product rule under counsel review and may be reversed. Its
   * UNREACHABILITY is therefore carried by this test rather than by the comment beside it, which is the
   * only form of that claim this project has learned to trust.
   */
  it('no worked example — legal or refused — can produce the JOINT_FIXED_DEED_SHARES rule', () => {
    const computable = [
      exampleA(),
      exampleAContinuationRecorded(),
      exampleB(),
      exampleC(),
      exampleC2(),
      exampleDCharitable(),
      exampleE(),
      exampleF(),
      exampleG(),
      exampleGZuhurAndButun(),
      exampleH(),
    ];
    for (const input of computable) {
      const run = runDistribution(input);
      expect(run.entitlementRule).not.toBe('JOINT_FIXED_DEED_SHARES');
      for (const line of run.lines) {
        expect(line.basis.rule).not.toBe('JOINT_FIXED_DEED_SHARES');
      }
    }
    // And the two refused inputs emit no run at all, so they cannot be stamped with anything.
    for (const refused of [exampleDJoint(), exampleDJointReEnteredAsFamily()]) {
      expect(() => runDistribution(refused)).toThrowError();
    }
  });
});

describe('worked example D-خ · PUBLIC_CHARITABLE, large (waqf-003) — the corpus-guard prover', () => {
  const result = expectExample(exampleDCharitable(), EXPECTED_D_CHARITABLE);

  it('labels the run with the tashrik rule — the JOINT rule is gone, not renamed', () => {
    expect(result.entitlementOrder).toBe('SHARED');
    expect(result.entitlementRule).toBe('SHARED_ALL_LIVING_TABAQAT');
    for (const line of result.lines) {
      expect(line.basis.rule).toBe('SHARED_ALL_LIVING_TABAQAT');
    }
  });

  /**
   * The 40/30/30 arithmetic, and why the figures are unchanged from §08's.
   *
   * ADR-0009 R3 makes a *lineage* cohort per capita; it says nothing about a charitable allocation,
   * where the deed's own weights still govern. So the deed weights [40, 30, 30] over Σ 100 apply
   * exactly as they did, and 140_000_000 × 40 / 100 = 56_000_000 is the same halala. Re-derived below
   * rather than asserted as a constant, so a reader can check the claim without the fixture.
   */
  it('splits 40/30/30 by deed weight, summing to distributable exactly', () => {
    expect(result.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-006', 56_000_000n],
      ['ben-306', 42_000_000n],
      ['ben-307', 42_000_000n],
    ]);
    const pool = result.waterfall.distributableMinor as bigint;
    expect((pool * 40n) / 100n).toBe(56_000_000n);
    expect((pool * 30n) / 100n).toBe(42_000_000n);
    expect(56_000_000n + 42_000_000n + 42_000_000n).toBe(140_000_000n);
    expect(result.totals.entitledMinor).toBe(pool);
    expect(result.totals.residualMinor).toBe(0n);
  });

  it('honours the ascending-id order rather than the input order', () => {
    // The input hands ben-006, ben-306, ben-307 in ascending order already, so reverse it: an engine
    // that echoed input order would attach ben-307's cross-border routing to ben-006's 40% share.
    const input = exampleDCharitable();
    const reversed = runDistribution({
      ...input,
      beneficiaries: [...input.beneficiaries].reverse(),
    });
    expect(reversed.lines.map((line) => line.beneficiaryId)).toEqual([
      'ben-006',
      'ben-306',
      'ben-307',
    ]);
    expect(reversed.lines.map((line) => line.entitledMinor)).toEqual([
      56_000_000n,
      42_000_000n,
      42_000_000n,
    ]);
    expect(reversed.lines.map((line) => line.status)).toEqual([
      'PAID',
      'PAID',
      'CROSS_BORDER_PENDING',
    ]);
  });

  /**
   * I-C1 · CLAUDE.md binding rule 1. Istibdal (استبدال) proceeds are corpus (asl / أصل), and corpus
   * moves no halala of a distribution. **This is the only fixture carrying a CAPITAL receipt into a
   * charitable run, and it must not be dropped.**
   */
  it('keeps 20,000,000.00 of istibdal proceeds OUT of every figure below revenue', () => {
    expect(result.waterfall.capitalReceiptsMinor).toBe(2_000_000_000n);

    // The corpus total appears in no downstream figure. Stated as the full identity rather than as
    // "capital is not in distributable", because the leak could hide in any one term.
    const w = result.waterfall;
    expect(
      (w.maintenanceReserveMinor as bigint) +
        (w.operatingCostMinor as bigint) +
        (w.nazirFeeMinor as bigint) +
        (w.distributableMinor as bigint),
    ).toBe(w.revenueMinor as bigint);
    expect(w.revenueMinor).toBe(180_000_000n);

    // And the fee was taken on revenue, not on revenue + corpus. 10% of 2,180,000.00 would be
    // 21,800,000n — a fee levied on the endowed principal itself.
    expect(w.nazirFeeMinor).toBe(pct(180_000_000n, '10'));
    expect(w.nazirFeeMinor).not.toBe(pct(2_180_000_000n, '10'));

    expect(result.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
  });

  it('names the excluded corpus receipt in the trace, so the exclusion is auditable', () => {
    const step = result.computationTrace.find(
      (entry) => entry.code === 'CAPITAL_RECEIPTS_EXCLUDED',
    );
    expect(step?.data?.receiptIds).toBe('cap-001');
    expect(step?.data?.capitalReceiptsMinor).toBe('20000000.00');
  });

  it('routes ben-307 cross-border rather than blocking it, and queues ONE Authority notice', () => {
    const line = result.lines.find((entry) => entry.beneficiaryId === 'ben-307');
    expect(line?.status).toBe('CROSS_BORDER_PENDING');
    // Routed, not refused: the entitlement is the full 30% share.
    expect(line?.entitledMinor).toBe(42_000_000n);
    expect(result.totals.crossBorderMinor).toBe(42_000_000n);
    expect(result.authorityNotices).toHaveLength(1);
    expect(result.authorityNotices[0]?.type).toBe('CROSS_BORDER_DISBURSEMENT');
    expect(result.authorityNotices[0]?.reasonCode).toBe('CROSS_BORDER_PENDING');
    // ⚠ the notice's legal basis (Nazarah Art. 10(7)) is unverified — confirm vs primary law.
    expect(result.authorityNotices[0]?.reason).toContain('verify');
  });

  it('never tier-excludes a charitable jiha, whose ṭabaqa is null', () => {
    for (const line of result.lines) {
      expect(line.basis.tabaqa).toBeNull();
      expect(line.basis.kind).toBe('CHARITABLE_JIHA');
      expect(line.reasonCode === 'UPPER_TABAQA_EXTANT').toBe(false);
      expect(line.reasonCode === 'TABAQA_EXTINCT').toBe(false);
    }
  });

  /**
   * ESC-1 · a خيري waqf's beneficiaries are the **segment the waqif chose**, not the bloodline.
   *
   * ⚠ The refusal this used to assert has **moved**, and the move is the point. A jiha carrying a
   * `lineageLink` was previously caught downstream by `buildLineage` as
   * `LINEAGE_EDGE_ON_NON_DESCENDANT`; since ESC-1 it is caught earlier and more broadly by
   * `assertSingleWaqfNature` as `DESCENDANT_ON_CHARITABLE_WAQF`, which keys on *any* beneficiary
   * recording descent on a charitable waqf — jiha, family member or `CATEGORY_ONLY` placeholder
   * alike. Both halves are asserted so the precedence is pinned rather than inferred.
   */
  it('carries no lineage edge on any jiha — a charity is not a descendant of the waqif', () => {
    for (const line of result.lines) {
      expect(line.basis.lineageDepth).toBeNull();
      expect(line.basis.parentId).toBeNull();
      expect(line.basis.lineageLink).toBeNull();
      expect(line.basis.continuationStipulation).toBeNull();
    }

    // A recorded descent claim on a خيري waqf — refused for the WAQF's nature, before the graph.
    const input = exampleDCharitable();
    try {
      runDistribution({
        ...input,
        beneficiaries: input.beneficiaries.map((member) =>
          member.id === 'ben-006' ? { ...member, lineageLink: 'SON' } : member,
        ),
      });
      expect.unreachable('a lineage edge on a charitable waqf must be refused');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        refusal: 'DESCENDANT_ON_CHARITABLE_WAQF',
        recordedDescendantIds: ['ben-006'],
      });
    }

    // A parent edge with NO link records no descent claim, so ESC-1 does not see it — and the
    // lineage graph refuses it instead. This is the surviving route to the older refusal.
    try {
      runDistribution({
        ...input,
        beneficiaries: input.beneficiaries.map((member) =>
          member.id === 'ben-006' ? { ...member, parentId: 'ben-306' } : member,
        ),
      });
      expect.unreachable('a parent edge with no lineage link must be refused');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT',
        beneficiaryId: 'ben-006',
      });
    }
  });

  it('refuses a LINEAGE order on this charitable waqf — a charity has no descendants', () => {
    try {
      runDistribution({
        ...exampleDCharitable(),
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_ONLY',
      });
      expect.unreachable('LINEAGE_CONTINUATION on a PUBLIC_CHARITABLE waqf must be refused');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({ refusal: 'LINEAGE_ORDER_ON_CHARITABLE_WAQF' });
    }
  });

  describe('variant · the jiha licence fails', () => {
    it('WITHHOLDS the jiha line for ENTITY_UNLICENSED and retains its 560,000.00 on the line', () => {
      const revoked = runDistribution(exampleDCharitableUnlicensedJiha());
      const jiha = revoked.lines.find((line) => line.beneficiaryId === 'ben-006');

      expect(jiha?.status).toBe('WITHHELD');
      expect(jiha?.reasonCode).toBe('ENTITY_UNLICENSED');
      expect(jiha?.gateFlags).toEqual(['ENTITY_UNLICENSED']);
      // The entitlement is UNCHANGED by the gate (I6) — the amount stays on the jiha's own line.
      expect(jiha?.entitledMinor).toBe(56_000_000n);

      expect(revoked.totals.paidMinor).toBe(42_000_000n);
      expect(revoked.totals.withheldMinor).toBe(56_000_000n);
      expect(revoked.totals.crossBorderMinor).toBe(42_000_000n);
      expect(revoked.totals.retainedMinor).toBe(0n);
      // I3 still holds.
      expect(42_000_000n + 56_000_000n + 42_000_000n + 0n).toBe(140_000_000n);

      // Every OTHER line is untouched — the withhold reallocated nothing.
      const base = runDistribution(exampleDCharitable());
      for (const id of ['ben-306', 'ben-307']) {
        expect(revoked.lines.find((line) => line.beneficiaryId === id)?.entitledMinor).toBe(
          base.lines.find((line) => line.beneficiaryId === id)?.entitledMinor,
        );
      }
    });

    it('trips the same gate on an EXPIRED licence, not only a revoked one', () => {
      const expired = runDistribution(exampleDCharitableExpiredJihaLicence());
      const jiha = expired.lines.find((line) => line.beneficiaryId === 'ben-006');
      expect(jiha?.status).toBe('WITHHELD');
      expect(jiha?.reasonCode).toBe('ENTITY_UNLICENSED');
      expect(jiha?.entitledMinor).toBe(56_000_000n);
    });

    it('treats a licence expiring exactly ON the run date as still valid', () => {
      // The boundary that decides whether a charity is paid: expiry day itself is inside the licence.
      const input = exampleDCharitableExpiredJihaLicence();
      const onExpiryDay: DistributionInputRaw = {
        ...input,
        beneficiaries: input.beneficiaries.map((entry) =>
          entry.id === 'ben-006'
            ? {
                ...entry,
                disbursingEntity: {
                  name: 'Example Charitable Jiha (fictional)',
                  licensed: true,
                  licenceExpiry: AS_OF_GREGORIAN,
                },
              }
            : entry,
        ),
      };
      const result2 = runDistribution(onExpiryDay);
      expect(result2.lines.find((line) => line.beneficiaryId === 'ben-006')?.status).toBe('PAID');
    });
  });
});

describe('worked example E · V-1 · the STALE_KYC block and the all-lines-gated state (waqf-001)', () => {
  const result = expectExample(exampleE(), EXPECTED_E);

  it('blocks ben-001 for STALE_KYC — a window that closed, not a verification that never happened', () => {
    // 2025-06-01 + 12 calendar months = 2026-06-01; asOf 2026-07-14 is 43 days past it.
    expect(addCalendarMonths(civilDate('2025-06-01'), 12)).toBe('2026-06-01');
    expect(differenceInCalendarDays(civilDate('2026-06-01'), civilDate(AS_OF_GREGORIAN))).toBe(43);

    const line = result.lines.find((entry) => entry.beneficiaryId === 'ben-001');
    expect(line?.status).toBe('WITHHELD');
    expect(line?.reasonCode).toBe('STALE_KYC');
    // ONE flag: a verified-but-expired record must not also report KYC_UNVERIFIED, or a single
    // condition would carry two reason codes whose ar/en copy will diverge.
    expect(line?.gateFlags).toEqual(['STALE_KYC']);
  });

  it('leaves every ENTITLEMENT identical to Example A (I6 — the gate changed no amount)', () => {
    const base = runDistribution(exampleA());
    expect(result.waterfall).toStrictEqual(base.waterfall);
    expect(result.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toStrictEqual(
      base.lines.map((line) => [line.beneficiaryId, line.entitledMinor]),
    );
    expect(result.totals.entitledMinor).toBe(base.totals.entitledMinor);
  });

  it('still produces a reviewable, signable run with paid 0 and withheld == distributable', () => {
    expect(result.totals.paidMinor).toBe(0n);
    expect(result.totals.withheldMinor).toBe(result.waterfall.distributableMinor as bigint);
    expect(result.totals.retainedMinor).toBe(0n);
    // I3 holds in the all-gated state.
    expect(
      (result.totals.paidMinor as bigint) +
        (result.totals.withheldMinor as bigint) +
        (result.totals.crossBorderMinor as bigint) +
        (result.totals.retainedMinor as bigint),
    ).toBe(result.waterfall.distributableMinor as bigint);
    expect(result.invariantsChecked).toContain('I3');
  });

  it('treats KYC dated exactly one refresh window before the run date as FRESH', () => {
    // 2025-07-14 + 12 months = 2026-07-14 = asOf, and `asOf > expiry` is FALSE. §08 is silent on
    // this edge; an off-by-one here wrongly blocks or wrongly pays a family member.
    expect(addCalendarMonths(civilDate('2025-07-14'), 12)).toBe(AS_OF_GREGORIAN);
    const fresh = runDistribution(exampleEKycExactlyAtExpiry());
    const line = fresh.lines.find((entry) => entry.beneficiaryId === 'ben-001');
    expect(line?.status).toBe('PAID');
    expect(line?.gateFlags).toEqual([]);
  });

  it('and one day earlier is the first STALE day — the boundary pinned in both directions', () => {
    const input = exampleEKycExactlyAtExpiry();
    const oneDayOlder: DistributionInputRaw = {
      ...input,
      beneficiaries: input.beneficiaries.map((entry) =>
        entry.id === 'ben-001' ? { ...entry, kycLastRefreshed: '2025-07-13' } : entry,
      ),
    };
    const stale = runDistribution(oneDayOlder);
    expect(stale.lines.find((line) => line.beneficiaryId === 'ben-001')?.reasonCode).toBe(
      'STALE_KYC',
    );
  });
});

describe('worked example F · the Hamilton residual, halala by halala', () => {
  const result = expectExample(exampleF(), EXPECTED_F);

  it('splits 100.00 three equal ways as 33.34 / 33.33 / 33.33, summing to exactly 100.00', () => {
    expect(result.lines.map((line) => line.entitledMinor)).toEqual([3_334n, 3_333n, 3_333n]);
    expect(result.lines.reduce<bigint>((running, line) => running + line.entitledMinor, 0n)).toBe(
      10_000n,
    );
    expect(result.lines.map((line) => line.sharePercent)).toEqual([
      '33.340000',
      '33.330000',
      '33.330000',
    ]);
  });

  it('breaks the three-way remainder tie on ASCENDING beneficiaryId, so ben-a takes the halala', () => {
    // floors 10_000 / 3 = 3_333 each (Σ 9_999); every remainder is 1, so nothing but the tie-break
    // decides who gets the leftover halala. That makes this the test of the tie-break itself.
    expect(EXPECTED_F_FLOORS).toEqual([3_333n, 3_333n, 3_333n]);
    expect(EXPECTED_F_FLOORS.reduce((a, b) => a + b, 0n)).toBe(9_999n);
    expect(result.totals.residualMinor).toBe(1n);

    const bumped = result.lines.filter((line) => line.entitledMinor === 3_334n);
    expect(bumped).toHaveLength(1);
    expect(bumped[0]?.beneficiaryId).toBe('ben-a');
    // …and 'ben-a' really is the least id under the code-unit ordering the engine uses.
    expect(['ben-c', 'ben-a', 'ben-b'].slice().sort()).toEqual(['ben-a', 'ben-b', 'ben-c']);
  });

  it('never lets a line exceed its floor by more than one halala (I9)', () => {
    for (const [index, line] of result.lines.entries()) {
      const floor = EXPECTED_F_FLOORS[index] ?? -1n;
      expect([floor, floor + 1n]).toContain(line.entitledMinor);
    }
    // 0 ≤ residual < entitledLineCount.
    expect(result.totals.residualMinor as bigint).toBeGreaterThanOrEqual(0n);
    expect(result.totals.residualMinor as bigint).toBeLessThan(
      BigInt(result.totals.entitledLineCount),
    );
  });

  it('does NOT assert that sharePercent sums to 100.000000 — it does here only by luck', () => {
    // 33.34 + 33.33 + 33.33 happens to be 100.000000. Generalising that into an assertion would
    // make a correct engine fail on, say, 100.00 split seven ways — sharePercent is display only.
    const sum = result.lines
      .map((line) => Number(line.sharePercent))
      .reduce((running, value) => running + value, 0);
    expect(sum).toBeCloseTo(100, 6);
    // The claim that IS load-bearing is the halala identity, asserted above.
    expect(result.totals.entitledMinor).toBe(10_000n);
  });

  it('records a silent deed as a null basis plus a flag, never as a genuine zero fee', () => {
    expect(result.waterfall.nazirFeeMinor).toBe(0n);
    expect(result.waterfall.nazirFeeBasis).toBeNull();
    expect(result.flags).toContain('AUTHORITY_FEE_DETERMINATION_PENDING');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * G-9 clause 1, the version with teeth: each deduction recomputed from its OWN basis
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Invariant I1 is a runtime tautology — `computeWaterfall` derives `distributableMinor` AS the
 * remainder, so `revenue == reserve + operating + fee + distributable` cannot fail unless the code is
 * mis-typed. These tests are the ones that bite: every term is re-derived from the rule that
 * produced it, so a fee computed on the wrong base fails even though conservation still holds.
 */
/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 · the lineage examples (G, G′, H)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('worked example G · LINEAGE_CONTINUATION / ZUHUR_ONLY, large family_dhurri (waqf-005)', () => {
  const result = expectExample(exampleG(), EXPECTED_G);

  /**
   * R1 — a generation's DEATH is what triggers continuation, and it is not an obstacle to it.
   *
   * ben-201 is a son of the waqif who is dead. Under the tier model his generation's death made
   * ṭabaqa 2 wait for extinction; under the lineage rule his son ben-205 **continues** and is paid
   * this period, at the same per-head amount as his living uncle ben-204.
   *
   * The assertion is deliberately stated as an equality with a living child of the waqif rather than
   * as "greater than zero": an implementation that paid ben-205 a *reduced* share (his father's
   * block, per stirpes) would pass a non-zero check and fail this one.
   */
  it('R1 · a deceased ancestor does NOT block his descendants — ben-205 is paid in full', () => {
    const orphan = result.lines.find((line) => line.beneficiaryId === 'ben-205');
    const livingRoot = result.lines.find((line) => line.beneficiaryId === 'ben-204');

    expect(orphan?.status).toBe('PAID');
    expect(orphan?.entitledMinor).toBe(13_000_000n);
    // Exactly equal to a living child of the waqif — one head is one head, whatever died above it.
    expect(orphan?.entitledMinor).toBe(livingRoot?.entitledMinor);

    // And his father is excluded for his OWN vital status, not for anything about his line.
    const deceased = result.lines.find((line) => line.beneficiaryId === 'ben-201');
    expect(deceased?.status).toBe('EXCLUDED');
    expect(deceased?.reasonCode).toBe('BENEFICIARY_INACTIVE');
    expect(deceased?.entitledMinor).toBe(0n);

    // Two dead ancestors in a row are walked through just the same: ben-208's father ben-207 AND
    // grandfather ben-201 are both deceased, and he is paid the identical head share.
    const grandchild = result.lines.find((line) => line.beneficiaryId === 'ben-208');
    expect(grandchild?.status).toBe('PAID');
    expect(grandchild?.entitledMinor).toBe(13_000_000n);
  });

  /**
   * ★ **R-FRONTIER — the product owner's own sentence, and the single assertion this rebuild exists
   * for.**
   *
   * *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A is
   * dead."* ben-204 is alive; his son ben-212 therefore receives nothing, and the exclusion names
   * **who** holds the entitlement rather than merely stating that someone does.
   *
   * The second half is what makes it a rule and not a coincidence: kill ben-204 in the same register
   * and ben-212 becomes entitled in the identical run. The exclusion is TEMPORARY — anything that
   * treats it as durable (copy, a report, a cached cohort, a "permanently excluded" filter) is wrong
   * for this code specifically.
   */
  it('R-FRONTIER · a LIVING ancestor holds the line, and his death reverses it', () => {
    const held = result.lines.find((line) => line.beneficiaryId === 'ben-212');
    expect(held?.status).toBe('EXCLUDED');
    expect(held?.reasonCode).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(held?.entitledMinor).toBe(0n);

    const step = result.computationTrace.find(
      (entry) => entry.code === 'BENEFICIARY_EXCLUDED' && entry.data?.beneficiaryId === 'ben-212',
    );
    expect(step?.data?.blockingAncestorId).toBe('ben-204');

    // One death later, in the same register: ben-204 exits and his son takes his own head share.
    const input = exampleG();
    const afterDeath = runDistribution({
      ...input,
      beneficiaries: input.beneficiaries.map((member) =>
        member.id === 'ben-204' ? { ...member, active: false } : member,
      ),
    });
    const nowEntitled = afterDeath.lines.find((line) => line.beneficiaryId === 'ben-212');
    expect(nowEntitled?.status).toBe('PAID');
    expect(nowEntitled?.reasonCode).toBeNull();
    // ben-204 leaves the cohort and ben-212 AND ben-215 enter it, so the head count rises 6 → 7 and
    // every share falls. 78_000_000 / 7 = 11_142_857 with a residual of 1n (7 × 11_142_857 =
    // 77_999_999), which the tie-break hands to the lowest eligible id, ben-202.
    expect(afterDeath.totals.entitledLineCount).toBe(7);
    expect(nowEntitled?.entitledMinor).toBe(11_142_857n);
    expect(afterDeath.totals.residualMinor).toBe(1n);
    expect(afterDeath.lines.find((line) => line.beneficiaryId === 'ben-202')?.entitledMinor).toBe(
      11_142_858n,
    );
  });

  /**
   * ★ The case that fails an implementation which stops at the parent.
   *
   * ben-215's father ben-214 is DEAD — a "was my parent alive?" test pays him — but his grandfather
   * ben-204 is ALIVE and holds that line. The blocking ancestor recorded must therefore be ben-204,
   * not ben-214: a death in the middle of a chain frees nobody while anyone above it lives.
   */
  it('R-FRONTIER · a dead parent does not free a grandchild while the GRANDparent lives', () => {
    const held = result.lines.find((line) => line.beneficiaryId === 'ben-215');
    expect(held?.status).toBe('EXCLUDED');
    expect(held?.reasonCode).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');

    const step = result.computationTrace.find(
      (entry) => entry.code === 'BENEFICIARY_EXCLUDED' && entry.data?.beneficiaryId === 'ben-215',
    );
    // The GRANDfather, two steps up — not the dead father one step up.
    expect(step?.data?.blockingAncestorId).toBe('ben-204');
    expect(step?.data?.blockingAncestorId).not.toBe('ben-214');
  });

  it('R1 · no line anywhere carries a tier exclusion — ṭabaqa is not the key', () => {
    for (const line of result.lines) {
      expect(line.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
      expect(line.reasonCode).not.toBe('TABAQA_EXTINCT');
    }
    // The contrast that makes that mean something: the SAME cohort under ORDERED does tier-exclude.
    const ordered = runDistribution({
      ...exampleG(),
      entitlementOrder: 'ORDERED',
      continuationStipulation: null,
    });
    expect(
      ordered.lines.filter((line) => line.reasonCode === 'UPPER_TABAQA_EXTANT').length,
    ).toBeGreaterThan(0);
    // …and it reaches the OPPOSITE verdict about the same people: ben-205 is paid under lineage and
    // excluded under ORDERED (ṭabaqa 2 waits while ben-202 and ben-204 live), while ben-201 — dead —
    // is excluded under both. The order is read, and it is decisive.
    expect(result.lines.find((line) => line.beneficiaryId === 'ben-205')?.status).toBe('PAID');
    expect(ordered.lines.find((line) => line.beneficiaryId === 'ben-205')?.status).toBe('EXCLUDED');
  });

  /**
   * R2's eligibility test, walked case by case. Each id is here because it breaks a DIFFERENT wrong
   * implementation — see the table in the fixture's docstring.
   */
  it('R2 · ZUHUR_ONLY excludes exactly the lines with a DAUGHTER strictly between them and the waqif', () => {
    const reasonById = new Map(result.lines.map((line) => [line.beneficiaryId, line.reasonCode]));

    // A daughter OF THE WAQIF is eligible in her own right — no intermediate ancestor exists.
    expect(reasonById.get('ben-202')).toBeNull();
    // A son's daughter is eligible: her OWN link is never tested, only her ancestors'.
    expect(reasonById.get('ben-206')).toBe('KYC_UNVERIFIED'); // a payability block, not an exclusion
    // A son's son's daughter is eligible for the same reason, two generations down.
    expect(reasonById.get('ben-209')).toBe('CROSS_BORDER_PENDING');
    // A dead DAUGHTER's children are NOT — the line does not continue under this deed…
    expect(reasonById.get('ben-210')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(reasonById.get('ben-211')).toBe('BUTUN_LINE_NOT_CONTINUED');
    // …nor is a living daughter's son…
    expect(reasonById.get('ben-213')).toBe('BUTUN_LINE_NOT_CONTINUED');
    // …nor a descendant whose DAUGHTER ancestor is two steps up: the walk is not just the parent.
    expect(reasonById.get('ben-216')).toBe('BUTUN_LINE_NOT_CONTINUED');

    // Exactly four buṭūn exclusions, so nothing else was swept in.
    expect(
      result.lines
        .filter((line) => line.reasonCode === 'BUTUN_LINE_NOT_CONTINUED')
        .map((line) => line.beneficiaryId),
    ).toEqual(['ben-210', 'ben-211', 'ben-213', 'ben-216']);
  });

  /**
   * The blocking ancestor, and the precedence question it exposes.
   *
   * ben-216's chain is `[ben-210 (SON, living), ben-203 (DAUGHTER, deceased)]`, so BOTH exclusion
   * facts apply. The engine reports the daughter-line break — permanent under this deed — over the
   * living-ancestor hold, which reverses on a death; and it must therefore name **ben-203**, the
   * nearest non-SON, rather than ben-210, the nearest ancestor.
   *
   * ✓ That precedence is OWNER-RATIFIED since 2026-08-25 (memo, S8 addendum fourth batch,
   * "Register #12": "Ratify permanent-over-temporary") — it was `resolver.ts`'s TODO(surface),
   * engineering's call, until then. Still pinned here so a reversal is a visible test change.
   */
  it('names the BLOCKING ANCESTOR in the trace — a beneficiary disputing this is owed which one', () => {
    const blockingById = new Map(
      result.computationTrace
        .filter((entry) => entry.code === 'BENEFICIARY_EXCLUDED')
        .map((entry) => [entry.data?.beneficiaryId, entry.data?.blockingAncestorId]),
    );

    // A dead daughter of the waqif ends both her children's lines.
    expect(blockingById.get('ben-210')).toBe('ben-203');
    expect(blockingById.get('ben-211')).toBe('ben-203');
    // A living daughter of the waqif ends her son's line — the nearest non-son is his mother.
    expect(blockingById.get('ben-213')).toBe('ben-202');
    // ★ Two steps up, past a LIVING son: the break out-ranks the hold, and names ben-203.
    expect(blockingById.get('ben-216')).toBe('ben-203');
    expect(blockingById.get('ben-216')).not.toBe('ben-210');

    // An exclusion on the member's OWN vital status names nobody — there is no ancestor to blame.
    expect(blockingById.get('ben-201')).toBe('null');
    expect(blockingById.get('ben-214')).toBe('null');
  });

  /**
   * R3 — per capita, and the consequence the owner was shown and chose anyway.
   *
   * Branch A holds four of the six eligible heads (ben-205, 206, 208, 209); Branch B and Branch D
   * hold one each (ben-202, ben-204); **Branch C holds none at all** this period. Per capita, Branch
   * A therefore collects four times what Branch B does, and Branch C collects nothing — under per
   * stirpes each of the waqif's four children's lines would take a quarter. The assertion states the
   * ratio, because "each head gets the same" alone does not distinguish the two models when a branch
   * happens to have one member.
   */
  it('R3 · per capita, so a branch collects per living head — 4:1:1:0 here, not 1:1:1:1', () => {
    const amountOf = (id: string) =>
      (result.lines.find((line) => line.beneficiaryId === id)?.entitledMinor ?? 0n) as bigint;
    const branchA =
      amountOf('ben-205') + amountOf('ben-206') + amountOf('ben-208') + amountOf('ben-209');
    const branchB = amountOf('ben-202') + amountOf('ben-213');
    const branchC =
      amountOf('ben-203') + amountOf('ben-210') + amountOf('ben-211') + amountOf('ben-216');
    const branchD =
      amountOf('ben-204') + amountOf('ben-212') + amountOf('ben-214') + amountOf('ben-215');

    expect(branchA).toBe(52_000_000n);
    expect(branchB).toBe(13_000_000n);
    expect(branchC).toBe(0n);
    expect(branchD).toBe(13_000_000n);
    expect(branchA).toBe(branchB * 4n);
    expect(branchA + branchB + branchC + branchD).toBe(78_000_000n);
    // Per stirpes over the waqif's four children would have given each line 19_500_000n.
    expect(branchB).not.toBe(19_500_000n);
  });

  /**
   * R3's honesty obligation. A Shart figure that vanishes without trace is the defect class this
   * project keeps paying for, so the run must SAY the deed's weights were not applied.
   */
  it('R3 · flags the deed weights as NOT APPLIED and names each one in the trace', () => {
    expect(result.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');

    const steps = result.computationTrace.filter(
      (entry) => entry.code === 'STIPULATED_WEIGHT_NOT_APPLIED',
    );
    // One step per ELIGIBLE member — six, not sixteen: an excluded member was not paid a different
    // amount than the deed said, it was not paid at all, which is a separate fact with its own step.
    expect(steps.map((entry) => entry.data?.beneficiaryId)).toEqual([
      'ben-202',
      'ben-204',
      'ben-205',
      'ben-206',
      'ben-208',
      'ben-209',
    ]);
    // The deed's own figure is RECORDED in the step, not merely reported as absent.
    const deedById = new Map(
      steps.map((entry) => [entry.data?.beneficiaryId, entry.data?.deedWeight]),
    );
    expect(deedById.get('ben-204')).toBe('30');
    expect(deedById.get('ben-208')).toBe('5');
    for (const entry of steps) {
      expect(entry.data?.appliedWeight).toBe('1');
      // The open question travels with the flag: nobody asked whether an explicit unequal allocation
      // should override per capita, and the run says so rather than implying the matter is settled.
      expect(entry.data?.openQuestion).toBe('ADR-0009 open question 1');
    }

    // ben-204's deed figure is SIX TIMES ben-208's and they are paid the same halala. That is the
    // whole of open question 1, stated as an arithmetic fact rather than as a note.
    const paid204 = result.lines.find((line) => line.beneficiaryId === 'ben-204')?.entitledMinor;
    const paid208 = result.lines.find((line) => line.beneficiaryId === 'ben-208')?.entitledMinor;
    expect(paid204).toBe(paid208);
  });

  /**
   * A gate is evaluated **only for the entitled cohort**, so an excluded line can carry no gate flag
   * and can queue no Authority notice — however loudly its own record asks for one.
   *
   * ben-213 is `CROSS_BORDER` and excluded. If gates ran before (or independently of) the entitlement
   * verdict, this run would carry a second cross-border notice naming a beneficiary the deed owes
   * nothing — a filing to the Authority about a payment that is not being made.
   */
  it('never gates an EXCLUDED line — ben-213 is cross-border and queues no notice', () => {
    const excluded = result.lines.find((line) => line.beneficiaryId === 'ben-213');
    expect(excluded?.status).toBe('EXCLUDED');
    expect(excluded?.gateFlags).toEqual([]);
    expect(excluded?.reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
    // …and its record really does ask to be routed cross-border, so the absence is not vacuous.
    expect(exampleG().beneficiaries.find((member) => member.id === 'ben-213')?.residency).toBe(
      'CROSS_BORDER',
    );

    expect(result.authorityNotices.map((notice) => notice.beneficiaryId)).toEqual(['ben-209']);
  });

  it('asserts I-L1 on this run, and every other invariant a monetary run supports', () => {
    expect(result.invariantsChecked).toContain('I-L1');
    // I8 is never reported from one run — determinism is a claim about two.
    expect(result.invariantsChecked).not.toContain('I8');
  });

  /**
   * The derived depth and the declared ṭabaqa are the SAME number on every line, and the engine
   * refuses rather than preferring one when they differ. Both halves are asserted: the agreement, and
   * the refusal — an agreement test alone would pass on an engine that simply echoed the input.
   */
  it('derives lineageDepth from the parent edges and cross-checks it against the declared tabaqa', () => {
    for (const line of result.lines) {
      expect(line.basis.lineageDepth).toBe(line.basis.tabaqa);
      expect(line.basis.continuationStipulation).toBe('ZUHUR_ONLY');
    }
    // The three generations really are three.
    expect(new Set(result.lines.map((line) => line.basis.lineageDepth))).toEqual(
      new Set([1, 2, 3]),
    );

    const input = exampleG();
    try {
      runDistribution({
        ...input,
        beneficiaries: input.beneficiaries.map((member) =>
          member.id === 'ben-207' ? { ...member, tabaqa: 5 } : member,
        ),
      });
      expect.unreachable('a tabaqa that disagrees with the derived depth must halt');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH',
        beneficiaryId: 'ben-207',
        // ⚠ `suppliedTabaqa` is a STRING and `derivedDepth` a NUMBER. That is what `resolver.ts` emits
        // (the ṭabaqa is stringified so `null` can be reported in the same field); asserted as-is
        // rather than normalised, because a test that quietly coerced would stop being able to tell a
        // 5 from a "5" in a persisted audit payload. Reported as an inconsistency to the resolver's
        // owner, not silently papered over here.
        suppliedTabaqa: '5',
        derivedDepth: 2,
      });
    }
  });

  it('keeps 20,000,000.00 of istibdal proceeds out of the lineage waterfall too', () => {
    // The corpus guard on the path that will carry real family statements — not only the charitable one.
    const w = result.waterfall;
    expect(w.capitalReceiptsMinor).toBe(2_000_000_000n);
    expect(w.revenueMinor).toBe(100_000_000n);
    expect(
      (w.maintenanceReserveMinor as bigint) +
        (w.operatingCostMinor as bigint) +
        (w.nazirFeeMinor as bigint) +
        (w.distributableMinor as bigint),
    ).toBe(w.revenueMinor as bigint);
    expect(w.nazirFeeMinor).toBe(pct(100_000_000n, '10'));
    expect(w.nazirFeeMinor).not.toBe(pct(2_100_000_000n, '10'));
  });

  it('refuses the run outright when the deed records no continuation stipulation', () => {
    for (const recorded of [null, '', ' ZUHUR_ONLY', 'zuhur_only', 'ZUHUR']) {
      try {
        runDistribution({ ...exampleG(), continuationStipulation: recorded });
        expect.unreachable(`continuationStipulation ${JSON.stringify(recorded)} must halt`);
      } catch (error) {
        if (!isDomainError(error)) throw error;
        expect(error.code).toBe('SHART_INCOMPLETE');
        expect(error.details).toMatchObject({ refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED' });
      }
    }
  });

  /**
   * R6 · the descent fact is mandatory, and a family waqf's cohort cannot hide anyone outside the tree.
   *
   * The escape this closes was MEASURED at 78,000,000 of 78,000,000 halalas: a `FAMILY` member with
   * `tabaqa: null, lineageLink: null` sat in neither the ṭabaqāt nor the lineage graph and collected
   * the entire distributable with no flag raised.
   */
  it('R6 · refuses a FAMILY member the engine cannot place in the family tree', () => {
    const input = exampleG();
    try {
      runDistribution({
        ...input,
        beneficiaries: [
          ...input.beneficiaries,
          beneficiary({
            id: 'ben-999',
            kind: 'FAMILY',
            active: true,
            // Neither a tier nor an edge: in the ṭabaqāt tree AND in the lineage graph, nowhere.
            tabaqa: null,
            parentId: null,
            lineageLink: null,
            line: 'ZUHUR',
            branch: null,
            stipulatedWeight: '10',
            verificationStatus: 'VERIFIED',
            kycLastRefreshed: '2026-04-01',
            category: null,
            residency: 'DOMESTIC',
            disbursingEntity: null,
            bankingRefForProceeds: 'FAKE-IBAN-0999',
          }),
        ],
      });
      expect.unreachable('an unplaceable FAMILY beneficiary must halt on every order');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({
        refusal: 'LINEAGE_LINK_MISSING',
        beneficiaryId: 'ben-999',
        kind: 'FAMILY',
      });
    }
  });
});

describe('worked example G′ · the SAME tree under ZUHUR_AND_BUTUN — the contrast IS the rule', () => {
  const result = expectExample(exampleGZuhurAndButun(), EXPECTED_G_ZUHUR_AND_BUTUN);
  const zuhurOnly = runDistribution(exampleG());

  it('changes ONE field of the input and nothing above the split', () => {
    // Byte-identical waterfall: the continuation term is a Stage-2 fact and touches no money above it.
    expect(result.waterfall).toStrictEqual(zuhurOnly.waterfall);
    expect(result.totals.entitledMinor).toBe(zuhurOnly.totals.entitledMinor);
  });

  /**
   * The two records the stipulation actually MOVES, and the two it only re-labels.
   *
   * ben-210 and ben-211 are the children of the waqif's **deceased** daughter ben-203: already at the
   * frontier of their line, excluded under `ZUHUR_ONLY` for one reason only — that the line ran
   * through a daughter. They are a brother and a sister, paid the identical halala here, which is
   * what shows that once buṭūn lines continue the sexes on the path stop mattering entirely.
   */
  it('makes the dead daughter’s children eligible, and leaves the deceased members excluded', () => {
    const byId = new Map(result.lines.map((line) => [line.beneficiaryId, line]));
    expect(byId.get('ben-210')?.status).toBe('PAID');
    expect(byId.get('ben-211')?.status).toBe('PAID');
    expect(byId.get('ben-210')?.entitledMinor).toBe(byId.get('ben-211')?.entitledMinor);
    // No line carries the buṭūn code at all under this stipulation.
    for (const line of result.lines) {
      expect(line.reasonCode).not.toBe('BUTUN_LINE_NOT_CONTINUED');
    }
    // A stipulation is not a resurrection: vital status is untouched by which lines the deed continues.
    for (const dead of ['ben-201', 'ben-203', 'ben-207', 'ben-214']) {
      expect(byId.get(dead)?.status).toBe('EXCLUDED');
      expect(byId.get(dead)?.reasonCode).toBe('BENEFICIARY_INACTIVE');
    }
    expect(result.totals.excludedCount).toBe(8);
  });

  /**
   * ★ The half that is easy to miss: **two members stay excluded and their REASON changes.**
   *
   * ben-213's mother ben-202 is a *living* daughter and ben-216's father ben-210 is a *living* son, so
   * neither is at the frontier. Dropping the daughter-line filter does not pay them — it changes what
   * they are told: `BUTUN_LINE_NOT_CONTINUED` (permanent under this deed) becomes
   * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` (reverses on a death). Two different legal statements about
   * the same person in the same period, which is precisely why the two codes are not interchangeable
   * and why E10/E12 owes them separate product-approved Arabic.
   *
   * And ben-216's **blocking ancestor moves**, from ben-203 (two steps up, the dead daughter) to
   * ben-210 (one step up, his living father) — proof the reason and the ancestor come from one walk.
   */
  it('re-labels rather than pays the members a LIVING ancestor still blocks', () => {
    const byId = new Map(result.lines.map((line) => [line.beneficiaryId, line]));
    for (const id of ['ben-213', 'ben-216']) {
      expect(byId.get(id)?.status).toBe('EXCLUDED');
      expect(byId.get(id)?.reasonCode).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
      expect(zuhurOnly.lines.find((line) => line.beneficiaryId === id)?.reasonCode).toBe(
        'BUTUN_LINE_NOT_CONTINUED',
      );
    }

    const blocking = (run: DistributionResult, id: string) =>
      run.computationTrace.find(
        (entry) => entry.code === 'BENEFICIARY_EXCLUDED' && entry.data?.beneficiaryId === id,
      )?.data?.blockingAncestorId;
    expect(blocking(zuhurOnly, 'ben-216')).toBe('ben-203');
    expect(blocking(result, 'ben-216')).toBe('ben-210');

    // ben-212 and ben-215 are blocked by SONS, so the stipulation was never what excluded them: same
    // code, same blocking ancestor, both runs.
    for (const id of ['ben-212', 'ben-215']) {
      expect(byId.get(id)?.reasonCode).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
      expect(blocking(result, id)).toBe('ben-204');
      expect(blocking(zuhurOnly, id)).toBe('ben-204');
    }
  });

  /**
   * The visible cost of the head count, and the reason ADR-0009 open question 8 (observation date)
   * has to be settled before real statements ship.
   */
  it('cuts every surviving beneficiary from 13,000.00 to 9,750.00 — 6 heads to 8', () => {
    const before = zuhurOnly.lines.find((line) => line.beneficiaryId === 'ben-204')?.entitledMinor;
    const after = result.lines.find((line) => line.beneficiaryId === 'ben-204')?.entitledMinor;
    expect(before).toBe(13_000_000n);
    expect(after).toBe(9_750_000n);
    // 78_000_000 / 6 = 13_000_000; 78_000_000 / 8 = 9_750_000. Exactly the recomputation, no residual.
    expect(78_000_000n / 6n).toBe(13_000_000n);
    expect(78_000_000n / 8n).toBe(9_750_000n);
    expect(result.totals.residualMinor).toBe(0n);
    expect(result.totals.entitledLineCount).toBe(8);
    expect(zuhurOnly.totals.entitledLineCount).toBe(6);
  });

  it('names the rule on every line so the beneficiary statement says which reading applied', () => {
    // BR-505: "your line continues" and "your line does not continue under this deed" are different
    // legal statements, so the two lineage rules are different labels and not one shared one.
    for (const line of result.lines) {
      expect(line.basis.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN');
      expect(line.basis.continuationStipulation).toBe('ZUHUR_AND_BUTUN');
    }
    for (const line of zuhurOnly.lines) {
      expect(line.basis.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
    }
  });
});

describe('worked example H · the per-capita residual, halala by halala (waqf-005-residual)', () => {
  const result = expectExample(exampleH(), EXPECTED_H);

  it('splits 100.00 over six equal heads as 1_667 × 4 + 1_666 × 2, summing to exactly 100.00', () => {
    const entitled = result.lines.filter((line) => line.status !== 'EXCLUDED');
    expect(entitled.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-202', 1_667n],
      ['ben-204', 1_667n],
      ['ben-205', 1_667n],
      ['ben-206', 1_667n],
      ['ben-208', 1_666n],
      ['ben-209', 1_666n],
    ]);
    expect(1_667n * 4n + 1_666n * 2n).toBe(10_000n);
    expect(result.totals.entitledMinor).toBe(10_000n);
  });

  /**
   * The tie-break, and the trap in it.
   *
   * All six remainders tie, so the residual goes to the four LOWEST ELIGIBLE ids. The ten excluded
   * members are not in the cohort at all, so the ranking skips them: an implementation that ranked
   * over all sixteen records would bump ben-201, ben-202, ben-203 and ben-204 — the same halalas,
   * attached to the wrong people, and two of them dead.
   */
  it('breaks the six-way tie on ascending ELIGIBLE beneficiaryId, skipping the excluded', () => {
    expect(EXPECTED_H_FLOORS).toEqual([1_666n, 1_666n, 1_666n, 1_666n, 1_666n, 1_666n]);
    const floorSum = EXPECTED_H_FLOORS.reduce((running, floor) => running + floor, 0n);
    expect(floorSum).toBe(9_996n);
    expect(result.totals.residualMinor).toBe(10_000n - floorSum);
    expect(result.totals.residualMinor).toBe(4n);

    const bumped = result.lines
      .filter((line) => (line.entitledMinor as bigint) === 1_667n)
      .map((line) => line.beneficiaryId);
    expect(bumped).toEqual(['ben-202', 'ben-204', 'ben-205', 'ben-206']);
    // ben-201 and ben-203 are excluded AND dead, and both sort BELOW every bumped id: they must not
    // appear anywhere in the bumped set, which is exactly what a rank-over-all-records bug would do.
    expect(bumped).not.toContain('ben-201');
    expect(bumped).not.toContain('ben-203');
  });

  it('I-L1 · the per-head spread is exactly ONE halala here — the bound at its limit', () => {
    const amounts = result.lines
      .filter((line) => line.status !== 'EXCLUDED')
      .map((line) => line.entitledMinor as bigint);
    const max = amounts.reduce((a, b) => (b > a ? b : a));
    const min = amounts.reduce((a, b) => (b < a ? b : a));
    expect(max - min).toBe(1n);
    expect(result.invariantsChecked).toContain('I-L1');
  });

  it('does NOT raise the weights-not-applied flag — every eligible weight is the same figure', () => {
    // The negative half of R3's honesty obligation. A flag that fires on every lineage run tells a
    // reader nothing, so "not fired here" is as load-bearing as "fired in G".
    expect(result.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    expect(
      result.computationTrace.filter((entry) => entry.code === 'STIPULATED_WEIGHT_NOT_APPLIED'),
    ).toHaveLength(0);
    // …and the eligible cohort really does all record '1', so the absence is not vacuous.
    for (const member of exampleH().beneficiaries) {
      expect(member.stipulatedWeight).toBe('1');
    }
  });
});

describe('a recorded continuation stipulation an ORDERED deed does not consume is FLAGGED', () => {
  /**
   * ⚠ SURFACED, NOT RESOLVED — ADR-0009 open question 3.
   *
   * `ORDERED` does not read the continuation term, so the engine carries it and says so. Whether a deed
   * can be BOTH al-aʿlā fa-l-aʿlā and ZUHUR_ONLY is unanswered; if it can, this flag is marking a live
   * defect (a buṭūn descendant being paid on a deed that excluded them) rather than a design choice.
   * Either way the term is never silently dropped, which is the only part engineering gets to decide.
   */
  it('raises CONTINUATION_STIPULATION_NOT_APPLIED and changes not one halala of Example A', () => {
    const base = runDistribution(exampleA());
    const withTerm = runDistribution(exampleAContinuationRecorded());

    expect(withTerm.flags).toContain('CONTINUATION_STIPULATION_NOT_APPLIED');
    expect(base.flags).not.toContain('CONTINUATION_STIPULATION_NOT_APPLIED');

    // Every figure identical: the flag is the whole difference.
    expect(withTerm.waterfall).toStrictEqual(base.waterfall);
    expect(withTerm.lines.map(flatten)).toStrictEqual(base.lines.map(flatten));
    expect(withTerm.totals).toStrictEqual(base.totals);
  });

  it('records the value it did not apply, and the open question, in the trace', () => {
    const withTerm = runDistribution(exampleAContinuationRecorded());
    const step = withTerm.computationTrace.find(
      (entry) => entry.code === 'CONTINUATION_STIPULATION_NOT_APPLIED',
    );
    expect(step?.data?.recordedStipulation).toBe('ZUHUR_ONLY');
    expect(step?.data?.order).toBe('ORDERED');
    expect(step?.data?.openQuestion).toBe('ADR-0009 open question 3');
    // And the basis printed on the statement does NOT claim the term applied.
    for (const line of withTerm.lines) {
      expect(line.basis.continuationStipulation).toBeNull();
    }
  });
});

describe('each deduction recomputed independently from its own basis (G-9 clause 1)', () => {
  const cases = [
    {
      label: 'A · FIXED ṣiyāna + PERCENT_OF_REVENUE ʿushr',
      input: exampleA(),
      reserve: 4_000_000n,
      operating: 0n,
      fee: () => pct(35_000_000n, '10'),
      revenue: 35_000_000n,
    },
    {
      label: 'B · PERCENT ṣiyāna + PERCENT_OF_REVENUE ʿushr',
      input: exampleB(),
      reserve: pct(20_000_000n, '5'),
      operating: 0n,
      fee: () => pct(20_000_000n, '10'),
      revenue: 20_000_000n,
    },
    {
      label: 'D-خ · FIXED ṣiyāna + actual operating cost + ʿushr on revenue only',
      input: exampleDCharitable(),
      reserve: 10_000_000n,
      operating: 12_000_000n,
      fee: () => pct(180_000_000n, '10'),
      revenue: 180_000_000n,
    },
    {
      label: 'F · NONE ṣiyāna + a silent deed',
      input: exampleF(),
      reserve: 0n,
      operating: 0n,
      fee: () => 0n,
      revenue: 10_000n,
    },
  ] as const;

  for (const scenario of cases) {
    it(`recomputes every term of ${scenario.label}`, () => {
      const { waterfall } = runDistribution(scenario.input);

      expect(waterfall.revenueMinor).toBe(scenario.revenue);
      expect(waterfall.maintenanceReserveMinor).toBe(scenario.reserve);
      expect(waterfall.operatingCostMinor).toBe(scenario.operating);
      expect(waterfall.netIncomeMinor).toBe(
        scenario.revenue - scenario.reserve - scenario.operating,
      );
      expect(waterfall.nazirFeeMinor).toBe(scenario.fee());
      expect(waterfall.distributableMinor).toBe(
        scenario.revenue - scenario.reserve - scenario.operating - scenario.fee(),
      );
    });
  }

  it('applies a rate OUT OF 100 — the §08 `Percent01` defect would underpay 100×, silently', () => {
    // §08 sketches `rate: Percent01 = z.number().min(0).max(1)`, i.e. 0.10 for ten percent, while
    // `percentOf` divides by 100 and the shipped Setting holds `10`. Feeding 0.10 into that path
    // computes 0.1% of revenue: arithmetically valid, invariant-clean, and invisible in every
    // conservation check, because I1 would still balance.
    const { waterfall } = runDistribution(exampleA());
    expect(waterfall.nazirFeeMinor).toBe(3_500_000n);
    expect(waterfall.nazirFeeMinor).not.toBe(pct(35_000_000n, '0.10'));
    expect(pct(35_000_000n, '0.10')).toBe(35_000n);
  });

  it('computes a PERCENT_OF_NET_INCOME fee on net but still deducts it at step 3', () => {
    // Basis answers "of what?"; position answers "when?". Conflating them would let a net-income fee
    // reduce the base the ṣiyāna reserve was computed from.
    const input: DistributionInputRaw = {
      ...exampleA(),
      nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    };
    const { waterfall } = runDistribution(input);
    expect(waterfall.netIncomeMinor).toBe(31_000_000n);
    expect(waterfall.nazirFeeMinor).toBe(pct(31_000_000n, '10'));
    expect(waterfall.nazirFeeMinor).toBe(3_100_000n);
    // The reserve is unchanged — it was taken off revenue first, before the fee existed.
    expect(waterfall.maintenanceReserveMinor).toBe(4_000_000n);
    expect(waterfall.distributableMinor).toBe(27_900_000n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The injected deadline's provenance (decision D2)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The deadline is INJECTED, so a fixture that merely hard-codes `1448-10-22` proves nothing. These
 * tests verify the injected pair against `../../dates` — the one Umm al-Qura implementation — so a
 * wrong fixture date cannot make a wrong engine look right.
 */
describe('the injected post-FYE deadline is verified against the ONE calendar, not asserted', () => {
  it('asOf is one instant in two calendars', () => {
    expect(toHijri(civilDate(AS_OF_GREGORIAN))).toBe(AS_OF_HIJRI);
  });

  it('the Hijri deadline is Hijri(FYE) + exactly 3 Hijri months, same day of month', () => {
    // FYE 2026-12-31 → 1448-07-22.
    expect(toHijri(civilDate('2026-12-31'))).toBe(FYE_HIJRI);

    const from = parseHijriDate(FYE_HIJRI);
    const to = parseHijriDate(EXPECTED_TIMING.deadlineHijri);
    expect(to.hy).toBe(from.hy);
    expect(to.hm - from.hm).toBe(3);
    expect(to.hd).toBe(from.hd);
    expect(formatHijriDate(to)).toBe('1448-10-22');
  });

  it('the Gregorian deadline is FYE + 3 Gregorian months, and lands a DAY LATER than the Hijri one', () => {
    expect(addCalendarMonths(civilDate('2026-12-31'), 3)).toBe('2027-03-31');
    expect(fromHijri(EXPECTED_TIMING.deadlineHijri as never)).toBe(HIJRI_DEADLINE_AS_GREGORIAN);
    expect(differenceInCalendarDays(civilDate('2027-03-31'), civilDate('2027-03-30'))).toBe(-1);
  });

  it('EARLIER_OF therefore binds on the HIJRI date — decision D2 doing visible work', () => {
    const { timing } = runDistribution(exampleA());
    expect(timing.bindingCalendar).toBe('EARLIER_OF');
    expect(timing.boundBy).toBe('HIJRI');
    expect(timing.bindingDeadlineGregorian).toBe('2027-03-30');
    // BOTH deadlines are always reported, whichever bound.
    expect(timing.deadlineGregorian).toBe('2027-03-31');
    expect(timing.deadlineHijri).toBe('1448-10-22');
    expect(timing.daysUntilDeadline).toBe(
      differenceInCalendarDays(civilDate(AS_OF_GREGORIAN), civilDate('2027-03-30')),
    );
    expect(timing.daysUntilDeadline).toBe(259);
  });

  it('carries the ⚠ unverified marker and the Setting key that produced the due date', () => {
    const { timing, unverifiedNotes, flags } = runDistribution(exampleA());
    expect(timing.settingKey).toBe('deadline.DISTRIBUTE_3M_FYE.months');
    expect(timing.months).toBe(3);
    expect(timing.unverifiedNote).not.toBeNull();
    expect(unverifiedNotes.length).toBeGreaterThan(0);
    expect(flags).toContain('UNVERIFIED_FIGURES_APPLIED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Cross-example properties
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const ALL_EXAMPLES: ReadonlyArray<readonly [string, () => DistributionInputRaw]> = [
  ['A', exampleA],
  ['B', exampleB],
  ['C', exampleC],
  ['C2', exampleC2],
  ['D-خ', exampleDCharitable],
  ['E', exampleE],
  ['F', exampleF],
  // ADR-0009's lineage examples run through EVERY cross-example property too — conservation,
  // determinism, ordering, no-undefined and the AT-16 PII scan. The lineage path is the one that will
  // carry real family statements, so exempting it from the cross-example checks would exempt the only
  // path that matters.
  ['G · ZUHUR_ONLY', exampleG],
  ['G′ · ZUHUR_AND_BUTUN', exampleGZuhurAndButun],
  ['H · per-capita residual', exampleH],
  ['A + recorded-but-unapplied stipulation', exampleAContinuationRecorded],
];

describe('every worked example satisfies the invariants that make it signable', () => {
  for (const [label, build] of ALL_EXAMPLES) {
    it(`${label} · conserves value through the waterfall and the split`, () => {
      const { waterfall: w, totals: t, lines } = runDistribution(build());

      // I1 — waterfall conservation.
      expect(
        (w.maintenanceReserveMinor as bigint) +
          (w.operatingCostMinor as bigint) +
          (w.nazirFeeMinor as bigint) +
          (w.distributableMinor as bigint),
      ).toBe(w.revenueMinor as bigint);

      // I2 (restated) — Σ lines + retained == distributable.
      const lineSum = lines
        .filter((line) => line.status !== 'EXCLUDED')
        .reduce<bigint>((running, line) => running + line.entitledMinor, 0n);
      expect(lineSum + (t.retainedMinor as bigint)).toBe(w.distributableMinor as bigint);
      expect(t.entitledMinor).toBe(lineSum);

      // I3 (restated) — the status partition sums to distributable.
      expect(
        (t.paidMinor as bigint) +
          (t.withheldMinor as bigint) +
          (t.crossBorderMinor as bigint) +
          (t.retainedMinor as bigint),
      ).toBe(w.distributableMinor as bigint);

      // I4 — no negatives anywhere.
      for (const value of Object.values({ ...w, ...t })) {
        if (typeof value === 'bigint') expect(value >= 0n).toBe(true);
        if (typeof value === 'number') expect(value >= 0).toBe(true);
      }

      // Every EXCLUDED line is owed exactly nothing.
      for (const line of lines) {
        if (line.status === 'EXCLUDED') expect(line.entitledMinor).toBe(0n);
      }
    });

    it(`${label} · is deterministic, computationTrace and all (I8)`, () => {
      const first = runDistribution(build());
      const second = runDistribution(build());
      expect(first).toStrictEqual(second);
      expect(canonicalizeResult(first)).toBe(canonicalizeResult(second));
    });

    it(`${label} · orders lines by ascending beneficiaryId with no duplicate`, () => {
      const { lines } = runDistribution(build());
      const ids = lines.map((line) => line.beneficiaryId);
      expect(ids).toStrictEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${label} · has no undefined field anywhere — absent values are explicit null`, () => {
      const result = runDistribution(build());
      // `JSON.stringify` drops `undefined` values, so a round-trip that loses a key proves one was
      // there. Bigints must be replaced first, since `JSON.stringify` throws on them.
      const serialized = JSON.stringify(result, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
      expect(serialized).not.toContain('undefined');
      const keyCount = (value: unknown): number =>
        value === null || typeof value !== 'object'
          ? 0
          : Object.entries(value).reduce(
              (running, [, nested]) => running + 1 + keyCount(nested),
              0,
            );
      expect(keyCount(result)).toBe(keyCount(JSON.parse(serialized) as unknown));
    });

    it(`${label} · keeps beneficiary NAMES off the hashed surface (AT-16)`, () => {
      const result = runDistribution(build());
      const serialized = canonicalizeResult(result);
      for (const name of Object.values(DISPLAY_NAMES)) {
        expect(serialized).not.toContain(name);
      }
      // The trace in particular — it is persisted and hashed, so PII there is an audit-surface leak.
      const trace = JSON.stringify(result.computationTrace);
      for (const name of Object.values(DISPLAY_NAMES)) {
        expect(trace).not.toContain(name);
      }
      // The contract has no `name` field at all, which is what makes the above structural. The one
      // exception is a jiha's own ENTITY name, which is not a natural person's PII and is not on the
      // result either — the input carries it, the output does not.
      expect(serialized).not.toContain('Example Charitable Jiha');
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The engine/database gap stays visible
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the S5/S7 fixture delta is recorded, not forgotten', () => {
  it('lists what data/fixtures/sample-waqf.json must gain before V-1..V-3 run against the DB', () => {
    // Asserted so the list cannot be quietly emptied: S3 proved the ENGINE half of V-1/V-2/V-3, and
    // the seeded-database half is blocked until these fields exist. S4/E3 closed seven of them.
    // ⚠ The floor here was 15 until S5/E4 APPLIED the delta to sample-waqf.json on 2026-08-17 and
    // closed thirteen more — the difference went to FIXTURE_DELTA_CLOSED_IN_S5, verbatim, not into a
    // deletion (the conservation test below is what proves that). The pin is the exact measured count
    // after that move: seven entries stay owed (two amendments waiting on Beneficiary columns, the
    // AT-03 extinction subject, R7-d's seed obligation, and the three standing records).
    expect(FIXTURE_DELTA_REQUIRED.length).toBeGreaterThanOrEqual(7);
    for (const entry of FIXTURE_DELTA_REQUIRED) {
      expect(entry.length).toBeGreaterThan(40);
    }
  });

  /**
   * ⚠ **S4/E3 · THE CONSERVATION LAW BETWEEN THE TWO LISTS.**
   *
   * Seven items were discharged by migration 12 and the fixture changes that came with it, so the
   * required list legitimately got shorter. The failure mode that creates is obvious and this project
   * has already paid for it four times (CLAUDE.md register item #13's "four premature closures"): an
   * item can be *deleted* and the diff reads exactly like an item being *closed*.
   *
   * So closure is conserved. An entry may only leave `FIXTURE_DELTA_REQUIRED` by arriving in
   * `FIXTURE_DELTA_CLOSED_IN_S4`, and every arrival must NAME what closed it — a `✓ CLOSED` prefix and
   * the original text behind it, so the historical claim survives its own resolution. S5/E4 (2026-08-17)
   * applied the delta to sample-waqf.json itself and the same law now spans THREE lists: thirteen more
   * entries moved, verbatim, into `FIXTURE_DELTA_CLOSED_IN_S5`, and the sum is conserved across all three.
   */
  it('conserves every entry: an item may only LEAVE the required list by arriving in a closed list', () => {
    expect(FIXTURE_DELTA_CLOSED_IN_S4.length).toBeGreaterThan(0);
    expect(FIXTURE_DELTA_CLOSED_IN_S5.length).toBeGreaterThan(0);
    expect(
      FIXTURE_DELTA_REQUIRED.length +
        FIXTURE_DELTA_CLOSED_IN_S4.length +
        FIXTURE_DELTA_CLOSED_IN_S5.length,
      `the three lists now hold ${String(
        FIXTURE_DELTA_REQUIRED.length +
          FIXTURE_DELTA_CLOSED_IN_S4.length +
          FIXTURE_DELTA_CLOSED_IN_S5.length,
      )} entries between them but held ${String(FIXTURE_DELTA_TOTAL_BEFORE_S4)} before S4/E3. An ` +
        `entry was DELETED rather than closed. Move it to the sprint's FIXTURE_DELTA_CLOSED_IN_* list ` +
        `with a ✓ CLOSED prefix naming the artefact that discharged it, and keep the original text ` +
        `behind it.`,
    ).toBeGreaterThanOrEqual(FIXTURE_DELTA_TOTAL_BEFORE_S4);

    for (const entry of FIXTURE_DELTA_CLOSED_IN_S4) {
      // Named closure, and the original preserved behind it. A bare "done" would be the same
      // information loss as a deletion.
      expect(entry.startsWith('✓ CLOSED S4/E3'), entry.slice(0, 80)).toBe(true);
      expect(entry, entry.slice(0, 80)).toContain('── ORIGINAL ENTRY ──');
      expect(entry.length).toBeGreaterThan(200);
    }

    // The mirror for S5's closures: each names its sprint and date, carries a ` — ` seam before the
    // verbatim original, and is too long to be a bare "done".
    for (const entry of FIXTURE_DELTA_CLOSED_IN_S5) {
      expect(entry.startsWith('✓ CLOSED (S5/E4, 2026-08-17):'), entry.slice(0, 80)).toBe(true);
      expect(entry, entry.slice(0, 80)).toContain(' — ');
      expect(entry.length).toBeGreaterThan(150);
    }

    // The lists are pairwise DISJOINT — an item asserted as both owed and closed (or closed twice)
    // would have one of the claims passing vacuously, the same reasoning as the parity test's
    // category-disjointness check.
    const closed = new Set([...FIXTURE_DELTA_CLOSED_IN_S4, ...FIXTURE_DELTA_CLOSED_IN_S5]);
    expect(closed.size).toBe(FIXTURE_DELTA_CLOSED_IN_S4.length + FIXTURE_DELTA_CLOSED_IN_S5.length);
    for (const entry of FIXTURE_DELTA_REQUIRED) {
      expect(closed.has(entry), entry.slice(0, 80)).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE PROVABLY CANNOT CATCH — disclosed, not hidden
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * These suites were mutation-tested against 35 hand-written engine defects (plus one no-op control,
 * which correctly survived and so proves the harness discriminates). **33 of the 35 were killed.**
 * The two that survive are **equivalent mutants** — they cannot change any observable output of
 * `runDistribution`, so no test of the entrypoint could kill them. Recorded here so the gap is a
 * known, reasoned one rather than an unexamined pass:
 *
 * 1. **`resolver.ts`'s `stipulatedWeight: entitled ? weight : '0'` substitution.** Zeroing an
 *    excluded member's weight is defensive redundancy: `allocate.ts`'s `entitledCohortWeights`
 *    already `.filter(member => member.entitled)` before reading any weight, so the substitution is
 *    unreachable through this entrypoint, and no weight appears anywhere in `DistributionResult`
 *    (asserted below). It protects a DIRECT `resolveEntitlement` consumer — E5/S6's ledger — and
 *    belongs to `resolver.test.ts`'s unit coverage, not to an end-to-end example.
 * 2. **`allocate.ts`'s `retained = distributable − Σ entitled` on the entitled path.** Hard-coding
 *    it to `0n` changes nothing, because `allocateMinor` guarantees `Σ amounts == distributable`
 *    exactly, so `retained` is *provably* zero whenever a cohort exists. The paths where retained is
 *    non-zero go through `emptyTotals`, and those ARE covered (AT-06 and worked example C2).
 */
describe('the suite discloses its own limits', () => {
  it('reports the weight of ENTITLED lines only, which is why mutant 1 above is unobservable', () => {
    const result = runDistribution(exampleA());

    // An entitled line's deed weight IS on the hashed trace — deliberately, so the split's basis is
    // auditable from a persisted run. M12 does not touch an entitled member's weight.
    const allocated = result.computationTrace.filter((entry) => entry.code === 'ALLOCATE_LINE');
    expect(allocated.map((entry) => entry.data?.stipulatedWeight)).toEqual(['12.5', '12.5']);

    // An EXCLUDED line's weight is reported NOWHERE — not on the line, not in its trace step. That
    // absence is the exact reason the `entitled ? weight : '0'` substitution cannot be observed
    // through `runDistribution`, and therefore the reason the mutant survives.
    const excludedSteps = result.computationTrace.filter(
      (entry) => entry.code === 'ALLOCATE_EXCLUDED_LINE',
    );
    expect(excludedSteps).toHaveLength(1);
    for (const entry of excludedSteps) {
      expect(entry.data?.stipulatedWeight).toBeUndefined();
    }
    // …and `DistributionLine` has no weight field at all, for entitled or excluded lines.
    for (const line of result.lines) {
      expect('stipulatedWeight' in line).toBe(false);
    }
  });

  it('retained is necessarily zero whenever a cohort exists, which is why mutant 2 is unobservable', () => {
    for (const build of [
      exampleA,
      exampleB,
      exampleDCharitable,
      exampleE,
      exampleF,
      exampleG,
      exampleGZuhurAndButun,
      exampleH,
    ]) {
      const result = runDistribution(build());
      expect(result.totals.entitledLineCount).toBeGreaterThan(0);
      expect(result.totals.retainedMinor).toBe(0n);
      expect(result.totals.entitledMinor).toBe(result.waterfall.distributableMinor as bigint);
    }
    // …and the branches where it is NOT zero are the ones that go through `emptyTotals`.
    expect(runDistribution(exampleC2()).totals.retainedMinor).toBe(9_000_000n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · worked examples J and J′ — ONE deed, TWO periods, 27,500,000 halalas of destination
 *
 * The feature is the CONTRAST, so the two are asserted as a pair and their difference is asserted
 * explicitly rather than left for a reader to compare two expectation objects. Both are wholly
 * invented — `waqf-006`, `ben-601`, `ben-602`, `jiha-601` — and `sample-waqf.json` cannot express the
 * مآل clause at all yet, which is the first entry on `FIXTURE_DELTA_REQUIRED`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('worked example J · R7 · a ذري deed with a recorded مآل, while the family LIVES', () => {
  const result = expectExample(exampleJ(), EXPECTED_J);

  it('pays the living frontier in full and the ultimate taker exactly ZERO', () => {
    // Discharged field-for-field by `expectExample`. Restated as the sentence that matters, in halalas:
    // one entitled head ⇒ 27,500,000 × 1/1 = 27,500,000 to ben-601, and 0 to the charity.
    const amounts = new Map(result.lines.map((line) => [line.beneficiaryId, line.entitledMinor]));
    expect(amounts.get('ben-601')).toBe(27_500_000n);
    expect(amounts.get('jiha-601')).toBe(0n);
    expect(result.totals.retainedMinor).toBe(0n);
  });

  it('⚠ MEASURED CONTRAST · an escaping taker would have taken 13,750,000 — half the pool', () => {
    // The taker's deed weight is 10, identical to ben-601's. If it were ever entitled on a pending run
    // the Hamilton split would be 27,500,000 × 10/20 = 13,750,000 each — the exact figure R6-D1 and
    // ESC-1 were measured at, halving a living descendant of the waqif. Asserting the arithmetic here
    // makes the ZERO above a measured absence rather than a coincidence of a one-weight cohort.
    const taker = exampleJ().beneficiaries.find((entry) => entry.id === 'jiha-601');
    const head = exampleJ().beneficiaries.find((entry) => entry.id === 'ben-601');
    expect(taker?.stipulatedWeight).toBe('10');
    expect(head?.stipulatedWeight).toBe('10');
    expect((27_500_000n * 10n) / 20n).toBe(13_750_000n);
    // …and the engine paid it nothing, on the reversion's own reason rather than on a tier or a gate.
    const line = result.lines.find((entry) => entry.beneficiaryId === 'jiha-601');
    expect(line?.reasonCode).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    expect(line?.gateFlags).toStrictEqual([]);
  });

  it('carries the مآل on the trace of every line, not only the taker`s', () => {
    // The clause is a fact about the WAQF, so a descendant's statement can state the endowment's
    // destination too — which is one of the reasons it is recorded at waqf level rather than as a
    // per-beneficiary marker (only the taker's own statement could print that).
    const step = result.computationTrace.find(
      (entry) => entry.code === 'REVERSION_CLAUSE_RESOLVED',
    );
    expect(step?.data).toMatchObject({
      reversionKind: 'CHARITABLE_ULTIMATE_TAKER',
      ultimateTakerIds: 'jiha-601',
      recordedBloodlineCount: '2',
      triggered: 'false',
    });
  });
});

describe('worked example J′ · R7 · the same deed once the bloodline is over', () => {
  const result = expectExample(exampleJReverted(), EXPECTED_J_REVERTED);

  it('hands the whole 27,500,000 to the مآل, on its OWN entitlement rule', () => {
    const line = result.lines.find((entry) => entry.beneficiaryId === 'jiha-601');
    // One taker, deed weight 10 over Σ 10 ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
    expect(line?.entitledMinor).toBe(27_500_000n);
    expect(line?.status).toBe('PAID');
    expect(result.totals.residualMinor).toBe(0n);
    // ⚠ `basis.rule` VARIES WITHIN THIS RUN — the first fixture where it does. A charity paid a family
    // endowment's whole ghallah on a line stamped with a lineage rule is the mis-statement ADR-0009
    // records as a defect.
    expect(line?.basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    for (const id of ['ben-601', 'ben-602']) {
      expect(result.lines.find((entry) => entry.beneficiaryId === id)?.basis.rule, id).toBe(
        'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      );
    }
    // …while the RUN keeps the order's rule: the deed's standing order did not change.
    expect(result.entitlementRule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
  });

  it('swaps I-L1 for I-R1 rather than reporting an invariant that says nothing', () => {
    // Per capita is the BLOODLINE's rule. Once the takers split by deed weight, "equal per head" makes
    // no claim about the line that took the money — and reporting it anyway is the R6-I5 defect, where
    // I5 was certified on a run whose paying line it had never tested.
    expect(result.invariantsChecked).not.toContain('I-L1');
    expect(result.invariantsChecked).toContain('I-R1');
    // …and the pending period reports the opposite pair, which is what makes this a swap.
    const pending = runDistribution(exampleJ());
    expect(pending.invariantsChecked).toContain('I-L1');
    expect(pending.invariantsChecked).toContain('I-R1');
  });

  it('THE CONTRAST · two `active` flags move 27,500,000 halalas, and nothing else differs', () => {
    const pending = runDistribution(exampleJ());

    // Identical waterfall — the reversion is a cohort question, never a money one.
    expect(result.waterfall).toStrictEqual(pending.waterfall);
    // Identical registers apart from two booleans.
    const before = exampleJ().beneficiaries.map((entry) => `${entry.id}:${String(entry.active)}`);
    const after = exampleJReverted().beneficiaries.map(
      (entry) => `${entry.id}:${String(entry.active)}`,
    );
    expect(before).toStrictEqual(['ben-601:true', 'ben-602:true', 'jiha-601:true']);
    expect(after).toStrictEqual(['ben-601:false', 'ben-602:false', 'jiha-601:true']);

    // …and completely different destinations for the same 27,500,000.
    const amountOf = (run: DistributionResult, id: string): bigint =>
      run.lines.find((line) => line.beneficiaryId === id)?.entitledMinor as bigint;
    expect(amountOf(pending, 'ben-601')).toBe(27_500_000n);
    expect(amountOf(pending, 'jiha-601')).toBe(0n);
    expect(amountOf(result, 'ben-601')).toBe(0n);
    expect(amountOf(result, 'jiha-601')).toBe(27_500_000n);

    // Different flag, and the pending run carries NEITHER reversion flag — it is an ordinary period.
    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(pending.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(pending.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
  });

  it('names the reversion in the trace, with the bloodline count that triggered it', () => {
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_TRIGGERED');
    expect(step?.data).toMatchObject({
      recordedBloodlineCount: '2',
      livingBloodlineCount: '0',
      ultimateTakerIds: 'jiha-601',
    });
    // ⚠ The count is over the CERTIFIED graph, not over a `kind` filter: 2 is the number of members
    // `buildLineage` placed in the waqif's tree, which is what "the bloodline is over" is measured on.
    expect(
      exampleJReverted().beneficiaries.filter((entry) => entry.lineageLink !== null),
    ).toHaveLength(2);
  });

  /**
   * ⚠ **INVERTED IN S4/E3 — was `and FIXTURE_DELTA_REQUIRED records that sample-waqf.json cannot express
   * this deed at all`.**
   *
   * That test pinned the مآل clause as inexpressible: `schema.prisma` had no column for it, so this
   * fixture module was the only place the reversion path existed. Migration 12 gave the clause a home
   * (`Waqf.reversionKind` + `reversionClauseCaptured` + the dual recorded-at pair + `waqf_reversion_taker`)
   * and the fixture now states it as absent on every endowment, so the obligation is **discharged** and
   * its entry moved to `FIXTURE_DELTA_CLOSED_IN_S4`.
   *
   * Inverted rather than deleted, and inverted in **both** halves, because only one half closed:
   *
   *  · the COLUMN obligation is closed, and this test now asserts that closure is recorded with the
   *    migration named — not merely that the entry is gone (which is what a deletion would have left);
   *  · the **SEED** obligation is still open. R7-d needs a reverting deed's DECEASED descendants on
   *    record before a reversion can be computed, and no fixture endowment records a مآل at all yet, so
   *    `REVERSION_WITH_NO_RECORDED_BLOODLINE` is still owed a subject and is still asserted present in
   *    the required list. A column is not a computable path.
   */
  it('records the مآل clause as CLOSED-with-a-named-migration, while the SEED obligation stays open', () => {
    // ── HALF 1: the column obligation left the required list and arrived, named, in the closed list.
    const closedReversion = FIXTURE_DELTA_CLOSED_IN_S4.filter(
      (entry) => entry.includes('waqfs[].reversion') || entry.includes('مآل'),
    );
    expect(closedReversion.length).toBeGreaterThanOrEqual(1);
    const closedText = closedReversion.join(' ');
    expect(closedText).toContain('waqfs[].reversion');
    expect(closedText).toContain('00000000000012_e3_lineage_reversion_deed_terms');
    // …and the two-state input is recorded as UNCHANGED. This is the load-bearing half of the closure:
    // if the un-read state (`reversionClauseCaptured = false`) ever became an engine input, R7-c's
    // "never inferred" would be renegotiated in a mapper rather than with the owner.
    expect(closedText).toContain('TWO-STATE');
    expect(FIXTURE_DELTA_REQUIRED.join(' ')).not.toContain('waqfs[].reversion {');

    // ── HALF 2: the seed obligation is STILL OWED, and still says so in the required list.
    const owedReversion = FIXTURE_DELTA_REQUIRED.filter(
      (entry) => entry.includes('reversion') || entry.includes('مآل'),
    );
    expect(owedReversion.length).toBeGreaterThanOrEqual(2);
    expect(owedReversion.join(' ')).toContain('REVERSION_WITH_NO_RECORDED_BLOODLINE');
  });
});
