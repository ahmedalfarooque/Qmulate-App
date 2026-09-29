/**
 * `distribution/__tests__/acceptance.test.ts` — §08's Given/When/Then acceptance criteria, one
 * `describe` each, plus the gate-precedence rule.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE MAPPING FROM §08's NINE CRITERIA TO THE AT IDS BELOW
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 lists nine acceptance criteria; S3's brief expands them into sixteen numbered tests, because
 * several of §08's criteria bundle a happy case with an edge that needs its own assertion. The
 * correspondence, so neither list can be silently dropped:
 *
 *  | §08 criterion                        | here                                              |
 *  |--------------------------------------|---------------------------------------------------|
 *  | fee basis — net income (happy)        | **AT-01**                                        |
 *  | fee basis — deed silent (edge)        | **AT-02**                                        |
 *  | ordered — top tier extinct (edge)     | **AT-03**, with **AT-15** pinning the near cases |
 *  | residual allocation (edge)            | **AT-04**                                        |
 *  | insufficient revenue (error)          | **AT-05**                                        |
 *  | no eligible beneficiaries (error/empty)| **AT-06**                                       |
 *  | zero revenue (empty)                  | **AT-07**                                        |
 *  | malformed shart (error)               | **AT-08**                                        |
 *  | determinism (property)                | **AT-09**                                        |
 *
 * The remaining ids are S3 additions the criteria imply but do not state: **AT-10** gate precedence,
 * **AT-11** the D1 corpus guard, **AT-12** corpus non-interference, **AT-13** the D2 binding
 * calendar, **AT-14** input consistency and the fail-closed `Setting`s, **AT-16** output shape.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERY EXPECTED FIGURE IS IN HALALAS AND WAS DERIVED FROM THE STATED RULE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 SAR = 100n. Where a figure could plausibly be copied from output, the arithmetic is written out
 * in the test so a reader can check it against §08 without running anything.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import { fromMinor, percentOf, toMinor } from '../../money.js';
import { GATE_PRECEDENCE } from '../gates.js';
import { canonicalizeResult } from '../trace.js';
import { runDistribution } from '../engine.js';
import { INVARIANT_IDS, RUN_FLAGS, SHARE_PERCENT_SCALE } from '../contract.js';
import type { DistributionInputRaw, DistributionResult, GateReasonCode } from '../contract.js';
import {
  AS_OF_GREGORIAN,
  AS_OF_HIJRI,
  beneficiary,
  deadline,
  exampleA,
  exampleB,
  exampleDCharitable,
  exampleDJoint,
  exampleF,
  exampleG,
  exampleH,
  policy,
} from './fixtures/worked-examples.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Assert a call throws a `DomainError` with exactly this code, and return it for further checks. */
function expectDomainError(run: () => unknown, code: string): ReturnType<typeof asDomainError> {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(isDomainError(thrown), `expected a DomainError(${code}), got ${String(thrown)}`).toBe(
    true,
  );
  const domainError = asDomainError(thrown);
  expect(domainError.code).toBe(code);
  return domainError;
}

function asDomainError(value: unknown): { code: string; message: string; details?: unknown } {
  if (!isDomainError(value)) throw new Error('not a DomainError');
  return value;
}

/** `percent`% of a halala amount, through the ONE tested percentage path. */
/** One emitted line by id, or a failing assertion naming what the run actually produced. */
function lineOf(result: DistributionResult, id: string): DistributionResult['lines'][number] {
  const found = result.lines.find((line) => line.beneficiaryId === id);
  if (found === undefined) {
    throw new Error(
      `no line for "${id}"; emitted ids were [${result.lines
        .map((line) => line.beneficiaryId)
        .join(', ')}]`,
    );
  }
  return found;
}

function pct(baseMinor: bigint, ratePercent: string): bigint {
  return toMinor(percentOf(fromMinor(baseMinor), ratePercent));
}

/**
 * A single-beneficiary SHARED waqf whose one member takes 100% of a 100.00 distributable.
 *
 * Used by the gate tests: it isolates payability from every other variable, and because the cohort
 * has one member the split cannot mask a gate defect behind a rounding difference.
 */
function oneMemberWaqf(
  member: DistributionInputRaw['beneficiaries'][number],
): DistributionInputRaw {
  return {
    waqfId: 'waqf-gate-probe',
    classification: 'SMALL',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'SHARED',
    continuationStipulation: null,
    // R7 · no مآل clause. Stated rather than defaulted, because the gate probes below must isolate
    // payability — a reversion here would change WHO is entitled and stop them testing the gates.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 10_000n,
      receipts: [{ id: 'rev-gate-001', receiptClass: 'INCOME', amountMinor: 10_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'NONE' },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [member],
    asOf: { gregorian: AS_OF_GREGORIAN, hijri: AS_OF_HIJRI },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * A `CATEGORY_ONLY` beneficiary rigged to trip exactly the named gates and no others.
 *
 * `kind` stays `CATEGORY_ONLY` in every case and only `category` moves, so a precedence walk changes
 * one condition at a time rather than swapping the record's whole nature.
 *
 * The `STALE_KYC` + `KYC_UNVERIFIED` pair is reachable together — `PENDING` with an *old* date
 * satisfies both predicates — which is what makes an ordered walk over `GATE_PRECEDENCE` possible.
 */
function trippingBeneficiary(
  trip: readonly GateReasonCode[],
): DistributionInputRaw['beneficiaries'][number] {
  const has = (code: GateReasonCode): boolean => trip.includes(code);
  const wantsStale = has('STALE_KYC');
  const wantsUnverified = has('KYC_UNVERIFIED');

  return beneficiary({
    id: 'ben-gate',
    kind: 'CATEGORY_ONLY',
    active: true,
    // ⚠ **IN the lineage graph, and under R6 it must be.** This record was `tabaqa: null,
    // lineageLink: null` with the note "the edge is only mandatory under LINEAGE_CONTINUATION". R6
    // (product owner, 2026-08-03) requires the descent on EVERY order for `FAMILY` and
    // `CATEGORY_ONLY` alike, so the whole AT-10 precedence walk became an input the engine refuses
    // before a single gate was evaluated.
    //
    // An unnamed child of the waqif: `parentId: null` is depth 1 and the declared ṭabaqa agrees.
    // Nothing about the GATES changes — payability never reads a lineage field (I6) — which is
    // exactly why this is a safe way to make the probe legal again.
    tabaqa: 1,
    parentId: null,
    lineageLink: 'SON',
    line: 'NA',
    branch: null,
    stipulatedWeight: '10',
    category: has('CATEGORY_NOT_CAPTURED') ? null : 'orphans of the family (fictional)',
    // VERIFIED + old date ⇒ stale only. PENDING + old date ⇒ stale AND unverified.
    // PENDING + null date ⇒ unverified only. VERIFIED + fresh date ⇒ neither.
    verificationStatus: wantsUnverified ? 'PENDING' : 'VERIFIED',
    kycLastRefreshed: wantsStale ? '2025-06-01' : wantsUnverified ? null : '2026-04-01',
    residency: has('CROSS_BORDER_PENDING') ? 'CROSS_BORDER' : 'DOMESTIC',
    disbursingEntity: has('ENTITY_UNLICENSED')
      ? { name: 'Example Disbursing Entity (fictional)', licensed: false, licenceExpiry: null }
      : null,
    bankingRefForProceeds: 'FAKE-IBAN-GATE',
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-01 · fee basis — net income (happy)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-01 · a PERCENT_OF_NET_INCOME fee is computed on net but deducted at step 3', () => {
  /**
   * GIVEN revenue 100,000.00, ṣiyāna FIXED 10,000.00, operating 5,000.00, fee 10% of net income.
   * WHEN the engine computes.
   * THEN net = 85,000.00, fee = 8,500.00, distributable = 76,500.00.
   */
  const input: DistributionInputRaw = {
    ...exampleA(),
    revenue: {
      incomeMinor: 10_000_000n,
      receipts: [{ id: 'rev-at01', receiptClass: 'INCOME', amountMinor: 10_000_000n }],
    },
    operatingCostMinor: 500_000n,
    maintenance: { kind: 'FIXED', amountMinor: 1_000_000n },
    nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
  };
  const result = runDistribution(input);

  it('computes net income as revenue − ṣiyāna − operating', () => {
    // 10_000_000 − 1_000_000 − 500_000 = 8_500_000.
    expect(result.waterfall.netIncomeMinor).toBe(8_500_000n);
  });

  it('takes the fee on NET income, not on revenue', () => {
    expect(result.waterfall.nazirFeeMinor).toBe(850_000n);
    expect(result.waterfall.nazirFeeMinor).toBe(pct(8_500_000n, '10'));
    // 10% of revenue would be 1_000_000n — the basis genuinely changes the figure.
    expect(result.waterfall.nazirFeeMinor).not.toBe(pct(10_000_000n, '10'));
  });

  it('still deducts it at step 3, leaving distributable 76,500.00', () => {
    // 8_500_000 − 850_000 = 7_650_000.
    expect(result.waterfall.distributableMinor).toBe(7_650_000n);
    expect(result.waterfall.nazirFeeBasis).toBe('PERCENT_OF_NET_INCOME');
    // Basis and position are independent: the ṣiyāna reserve is untouched by the fee's basis.
    expect(result.waterfall.maintenanceReserveMinor).toBe(1_000_000n);
  });

  it('conserves value — I1 across all four terms', () => {
    expect(1_000_000n + 500_000n + 850_000n + 7_650_000n).toBe(10_000_000n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-02 · fee basis — deed silent (edge)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-02 · a deed silent on the Nazir fee yields a FLAGGED zero, never a silent one', () => {
  const input: DistributionInputRaw = { ...exampleA(), nazirFee: null };
  const result = runDistribution(input);

  it('records a zero fee with a NULL basis', () => {
    expect(result.waterfall.nazirFeeMinor).toBe(0n);
    expect(result.waterfall.nazirFeeBasis).toBeNull();
  });

  it('flags AUTHORITY_FEE_DETERMINATION_PENDING so the held step is on the record', () => {
    // The flag is what distinguishes "step 3 is HELD pending the Authority-determination path" from
    // "this deed genuinely charges nothing". A silently zero-fee run must be impossible to produce.
    expect(result.flags).toContain('AUTHORITY_FEE_DETERMINATION_PENDING');
  });

  it('still computes, with the HIGHER distributable the un-deducted fee implies', () => {
    // Example A's distributable is 27_500_000 with the 10% fee taken; without it, the whole
    // 31_000_000 of net income reaches the split.
    expect(result.waterfall.distributableMinor).toBe(31_000_000n);
    expect(runDistribution(exampleA()).waterfall.distributableMinor).toBe(27_500_000n);
    expect(result.totals.entitledMinor).toBe(31_000_000n);
    // 31_000_000 over two equal weights.
    expect(result.lines.map((line) => line.entitledMinor)).toEqual([15_500_000n, 0n, 15_500_000n]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-03 · ordered — top tier extinct (edge)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-03 · ORDERED with every ṭabaqa-1 member inactive promotes ṭabaqa 2', () => {
  /**
   * GIVEN `entitlementOrder: 'ORDERED'` and every ṭabaqa-1 member `active: false`.
   * WHEN the engine computes.
   * THEN ṭabaqa 2 takes 100% of distributable and the ṭabaqa-1 lines are EXCLUDED / TABAQA_EXTINCT.
   */
  const base = exampleA();
  const input: DistributionInputRaw = {
    ...base,
    beneficiaries: base.beneficiaries.map((entry) =>
      entry.tabaqa === 1 ? { ...entry, active: false } : entry,
    ),
  };
  const result = runDistribution(input);

  it('gives ṭabaqa 2 the WHOLE distributable', () => {
    const promoted = result.lines.find((line) => line.beneficiaryId === 'ben-002');
    expect(promoted?.basis.tabaqa).toBe(2);
    expect(promoted?.status).toBe('PAID');
    expect(promoted?.entitledMinor).toBe(27_500_000n);
    expect(promoted?.sharePercent).toBe('100.000000');
    expect(result.totals.entitledLineCount).toBe(1);
  });

  it('excludes the extinct tier with TABAQA_EXTINCT — not BENEFICIARY_INACTIVE', () => {
    // Every such member IS also individually inactive, but the operative fact on the statement is
    // that the GENERATION has ended. §08 names this code for exactly this case.
    for (const id of ['ben-001', 'ben-003']) {
      const line = result.lines.find((entry) => entry.beneficiaryId === id);
      expect(line?.status).toBe('EXCLUDED');
      expect(line?.entitledMinor).toBe(0n);
      expect(line?.reasonCode).toBe('TABAQA_EXTINCT');
    }
    expect(result.totals.excludedCount).toBe(2);
  });

  it('reports the promoted tier in the trace', () => {
    const step = result.computationTrace.find((entry) => entry.code === 'ORDERED_ENTITLED_TABAQA');
    expect(step?.data?.entitledTabaqa).toBe('2');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-04 · residual allocation (edge)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-04 · 100.00 three equal ways is 33.34 / 33.33 / 33.33, tie-broken by ascending id', () => {
  const result = runDistribution(exampleF());

  it('allocates the floors and hands the single leftover halala to the LEAST id', () => {
    // floors: 10_000 × 1 / 3 = 3_333n each, Σ 9_999n. residual 1n. All three remainders are 1n, so
    // ONLY the tie-break decides who is bumped.
    expect(result.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-a', 3_334n],
      ['ben-b', 3_333n],
      ['ben-c', 3_333n],
    ]);
    expect(result.totals.residualMinor).toBe(1n);
  });

  it('sums to exactly 100.00 — no halala created, none lost', () => {
    expect(result.lines.reduce<bigint>((running, line) => running + line.entitledMinor, 0n)).toBe(
      10_000n,
    );
    expect(result.totals.entitledMinor).toBe(10_000n);
    expect(result.totals.retainedMinor).toBe(0n);
  });

  it('renders sharePercent at 6 dp and does NOT require it to sum to 100.000000', () => {
    expect(result.lines.map((line) => line.sharePercent)).toEqual([
      '33.340000',
      '33.330000',
      '33.330000',
    ]);
    for (const line of result.lines) {
      expect(line.sharePercent.split('.')[1]).toHaveLength(SHARE_PERCENT_SCALE);
    }
    // §08's own figures. That they happen to sum to 100.000000 here is luck, not a rule — see the
    // "does NOT assert" test in worked-examples.test.ts.
  });

  it('never uses half-up on the split — a negative residual is the signature of that bug', () => {
    // Half-up would let Σ lines EXCEED distributable, making §08's own I9 (`residual ≥ 0`) false.
    expect(result.totals.residualMinor as bigint).toBeGreaterThanOrEqual(0n);
    expect(result.totals.entitledMinor as bigint).toBeLessThanOrEqual(
      result.waterfall.distributableMinor as bigint,
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-05 · insufficient revenue (error)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-05 · a waterfall that would go negative REFUSES, emitting no run at all', () => {
  /**
   * GIVEN revenue 50,000.00, ṣiyāna FIXED 40,000.00, operating 10,000.00, fee 10% of revenue.
   * WHEN the engine computes.
   * THEN `DISTRIBUTION_NEGATIVE` — distributable would be −5,000.00 — and NO result is returned.
   */
  const input: DistributionInputRaw = {
    ...exampleA(),
    revenue: {
      incomeMinor: 5_000_000n,
      receipts: [{ id: 'rev-at05', receiptClass: 'INCOME', amountMinor: 5_000_000n }],
    },
    operatingCostMinor: 1_000_000n,
    maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
  };

  it('throws DISTRIBUTION_NEGATIVE and returns nothing', () => {
    // net = 5_000_000 − 4_000_000 − 1_000_000 = 0; fee = 10% of 5_000_000 = 500_000;
    // distributable = 0 − 500_000 = −500_000.
    const error = expectDomainError(() => runDistribution(input), 'DISTRIBUTION_NEGATIVE');
    const details = error.details as Record<string, string>;
    expect(details.netIncomeMinor).toBe('0');
    expect(details.nazirFeeMinor).toBe('500000');
    expect(details.distributableMinor).toBe('-500000');
  });

  it('never derives a NEGATIVE fee from a negative base', () => {
    // Push the reserve past revenue so net income itself is negative. The refusal must land BEFORE
    // the fee is computed: a negative PERCENT_OF_NET_INCOME fee would act as a CREDIT and restore a
    // plausible-looking distributable.
    const negativeNet: DistributionInputRaw = {
      ...input,
      maintenance: { kind: 'FIXED', amountMinor: 9_000_000n },
      nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    };
    const error = expectDomainError(() => runDistribution(negativeNet), 'DISTRIBUTION_NEGATIVE');
    const details = error.details as Record<string, string>;
    // The net-income check fired, so no fee figure exists in the details at all.
    expect(details.netIncomeMinor).toBe('-5000000');
    expect(details.nazirFeeMinor).toBeUndefined();
  });

  it('refuses a TARGET_TOPUP reserve larger than the period revenue rather than capping it', () => {
    // ⚠ SURFACED, NOT RESOLVED: whether "ṣiyāna first" instead means "reserve up to available income
    // and distribute nothing" is a fiqh question about the founder's condition. §08's I4 is
    // implemented literally — capping would understate the stipulated maintenance obligation while
    // producing a nil distribution that LOOKS defensible.
    const topUp: DistributionInputRaw = {
      ...input,
      maintenance: {
        kind: 'TARGET_TOPUP',
        targetBalanceMinor: 20_000_000n,
        currentBalanceMinor: 0n,
      },
    };
    expectDomainError(() => runDistribution(topUp), 'DISTRIBUTION_NEGATIVE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-06 · no eligible beneficiaries (error/empty)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-06 · nobody eligible is a FLAG, not an exception', () => {
  /**
   * GIVEN distributable > 0 and every beneficiary either inactive or carrying deed weight `'0'`.
   * WHEN the engine computes.
   * THEN no throw; `NO_ELIGIBLE_BENEFICIARIES`; zero payout lines; the EXCLUDED lines emitted with
   * their reasons; the whole distributable in `retainedMinor`.
   */
  const base = exampleB();
  const input: DistributionInputRaw = {
    ...base,
    // Example B has exactly two members: ben-004 becomes inactive, ben-005 keeps a zero deed share.
    // Two DIFFERENT exclusion reasons on purpose — §08 names both routes into this state.
    beneficiaries: base.beneficiaries.map((entry, index) =>
      index === 0 ? { ...entry, active: false } : { ...entry, stipulatedWeight: '0' },
    ),
  };
  const result = runDistribution(input);

  it('does not throw, and flags the state', () => {
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(result.waterfall.distributableMinor).toBe(17_000_000n);
  });

  it('emits zero PAYOUT lines but keeps the EXCLUDED lines with their reasons (BR-505)', () => {
    expect(result.lines).toHaveLength(2);
    for (const line of result.lines) {
      expect(line.status).toBe('EXCLUDED');
      expect(line.entitledMinor).toBe(0n);
      expect(line.gateFlags).toEqual([]);
    }
    expect(result.lines.map((line) => line.reasonCode)).toEqual([
      'BENEFICIARY_INACTIVE',
      'ZERO_STIPULATED_WEIGHT',
    ]);
    expect(result.totals.paidMinor).toBe(0n);
    expect(result.totals.withheldMinor).toBe(0n);
    expect(result.totals.crossBorderMinor).toBe(0n);
    expect(result.totals.entitledLineCount).toBe(0);
    expect(result.totals.excludedCount).toBe(2);
  });

  it('retains the whole distributable — the ONLY reason the restated I3 holds here', () => {
    expect(result.totals.retainedMinor).toBe(17_000_000n);
    // §08's I3 as written: 0 == 17_000_000 → FALSE.
    expect(0n).not.toBe(result.waterfall.distributableMinor as bigint);
    // Restated: + retained.
    expect(result.totals.retainedMinor).toBe(result.waterfall.distributableMinor as bigint);
  });

  it('filters the zero-weight member out BEFORE the allocator', () => {
    // `largestRemainderAllocate` throws INVALID_ALLOCATION_WEIGHTS on an all-zero weight vector,
    // which would turn §08's explicitly non-throwing case into an exception. That it did not throw
    // is the assertion; the reason code is the mechanism.
    expect(result.totals.residualMinor).toBe(0n);
    const zeroWeight = result.lines.find((line) => line.beneficiaryId === 'ben-005');
    expect(zeroWeight?.reasonCode).toBe('ZERO_STIPULATED_WEIGHT');
  });

  it('checks I5 (there are lines) but not I6 (there is no entitled line)', () => {
    expect(result.invariantsChecked).toContain('I5');
    expect(result.invariantsChecked).not.toContain('I6');
  });

  /**
   * ⚠ **INVERTED 2026-08-11 · R7-d ANSWERED — and the distinction this test guards SURVIVED, on the
   * other route.**
   *
   * *"Nobody eligible"* and *"the bloodline is over"* are still different things and must never be
   * collapsed. What changed is which register sits on which side of the line. Asked whether *"the
   * bloodline is over"* means **no living descendant** or **no continuing line**, the product owner
   * answered the second — so a `ZUHUR_ONLY` register whose only survivor sits on a broken daughter line
   * IS an ended bloodline, and the deed's مآل takes the pool.
   *
   * MEASURED BEFORE THE ANSWER, on this exact register: `NO_ELIGIBLE_BENEFICIARIES` raised,
   * `entitledLineCount` 0, `retainedMinor` 27,500,000, the taker's line
   * `REVERSION_PENDING_LIVING_BLOODLINE` at 0, and `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` on the
   * flags. All of it inverted below with the input verbatim.
   *
   * ⚠ AT-06's own state — *nobody eligible, the pool retained, the charity at zero* — is NOT lost with
   * it: the second half of this test reaches it by the route the widening does not touch (a zero deed
   * weight on a living head whose line plainly continues), which is boundary 1. Dropping that half would
   * have deleted the acceptance coverage for `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` entirely.
   */
  it('R7-d · INVERTED · nobody eligible on a BROKEN line ⇒ the مآل takes it — and boundary 1 still waits', () => {
    /** Every field stated — the fixture builder has no defaults, by the same design as the schema. */
    const member = (
      id: string,
      tabaqa: number | null,
      active: boolean,
      parentId: string | null,
      patch: Partial<Parameters<typeof beneficiary>[0]> = {},
    ): DistributionInputRaw['beneficiaries'][number] =>
      beneficiary({
        id,
        kind: 'FAMILY',
        active,
        tabaqa,
        parentId,
        lineageLink: 'SON',
        line: 'ZUHUR',
        branch: 'Branch A',
        stipulatedWeight: '10',
        verificationStatus: 'VERIFIED',
        kycLastRefreshed: '2026-04-01',
        category: null,
        residency: 'DOMESTIC',
        disbursingEntity: null,
        bankingRefForProceeds: `FAKE-IBAN-${id}`,
        ...patch,
      });

    const daughterLine = runDistribution({
      ...exampleA(),
      entitlementOrder: 'LINEAGE_CONTINUATION',
      continuationStipulation: 'ZUHUR_ONLY',
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-maal'] },
      beneficiaries: [
        // The waqif's daughter, deceased — the walk goes THROUGH her, so her son is placed at depth 2.
        member('dau-001', 1, false, null, { lineageLink: 'DAUGHTER', line: 'BUTUN' }),
        // Her LIVING son: a blood descendant of the waqif whose line this deed does not continue.
        member('dau-002', 2, true, 'dau-001'),
        member('jiha-maal', null, true, null, {
          kind: 'CHARITABLE_JIHA',
          lineageLink: null,
          line: 'NA',
          branch: 'Charitable',
        }),
      ],
    });

    // ⚠ INVERTED · this is now a REVERTED run, not an AT-06 run. The bloodline is over because no line
    // this deed continues is still going, so the pool is the charity's: 27,500,000 × 10/10 = 27,500,000,
    // residual 0. `NO_ELIGIBLE_BENEFICIARIES` is gone precisely because someone now IS eligible.
    expect(daughterLine.flags).not.toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(daughterLine.totals.entitledLineCount).toBe(1);
    expect(daughterLine.totals.paidMinor).toBe(27_500_000n);
    expect(daughterLine.totals.retainedMinor).toBe(0n);
    expect(lineOf(daughterLine, 'jiha-maal').entitledMinor).toBe(27_500_000n);
    expect(lineOf(daughterLine, 'jiha-maal').reasonCode).toBeNull();
    expect(lineOf(daughterLine, 'jiha-maal').basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    // ⚠ UNCHANGED, and it is what keeps R5 intact on a run that pays a charity while a blood descendant
    // of the waqif is alive: the living grandson keeps his PERMANENT reason and holds `0n`, so no
    // descendant is PAID in the same run as the charity (I-R1's universal mirror).
    expect(lineOf(daughterLine, 'dau-002').entitledMinor).toBe(0n);
    expect(lineOf(daughterLine, 'dau-002').reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(daughterLine.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(daughterLine.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(daughterLine.invariantsChecked).toContain('I-R1');

    /* ── BOUNDARY 1 · AT-06's state, reached by the route the widening does NOT touch ─────────────
     * A living son of the waqif — depth 1, `parentId: null`, an EMPTY proper-ancestor chain, so no walk
     * can break his line at either continuation term — carrying deed weight `'0'` under `SHARED`, where
     * a weight excludes. Nobody is eligible, his line plainly CONTINUES, and the reversion must NOT
     * trigger: 27,500,000 waits, recoverably, and the charity takes zero.
     *
     * ⚠ This is the acceptance-level statement that *"nobody eligible"* is still not *"the bloodline is
     * over"*. A trigger computed from the entitled cohort would agree with the correct one on the
     * register above and pay a charity 27,500,000 here, on the strength of a data-entry figure.
     * ──────────────────────────────────────────────────────────────────────────────────────────── */
    const zeroWeightButContinuing = runDistribution({
      ...exampleA(),
      entitlementOrder: 'SHARED',
      continuationStipulation: null,
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-maal'] },
      beneficiaries: [
        member('son-001', 1, true, null, { stipulatedWeight: '0' }),
        member('jiha-maal', null, true, null, {
          kind: 'CHARITABLE_JIHA',
          lineageLink: null,
          line: 'NA',
          branch: 'Charitable',
        }),
      ],
    });
    expect(zeroWeightButContinuing.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(zeroWeightButContinuing.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(zeroWeightButContinuing.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(zeroWeightButContinuing.totals.entitledLineCount).toBe(0);
    expect(zeroWeightButContinuing.totals.retainedMinor).toBe(27_500_000n);
    expect(lineOf(zeroWeightButContinuing, 'son-001').reasonCode).toBe('ZERO_STIPULATED_WEIGHT');
    expect(lineOf(zeroWeightButContinuing, 'jiha-maal').entitledMinor).toBe(0n);
    expect(lineOf(zeroWeightButContinuing, 'jiha-maal').reasonCode).toBe(
      'REVERSION_PENDING_LIVING_BLOODLINE',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-07 · zero revenue (empty)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-07 · zero revenue is a valid NIL run', () => {
  const base = exampleA();
  const input: DistributionInputRaw = {
    ...base,
    revenue: { incomeMinor: 0n, receipts: [] },
    // NONE, not Example A's FIXED 40,000: a stipulated reserve against zero revenue is AT-05's
    // refusal, not a nil run. The two cases must not be conflated.
    maintenance: { kind: 'NONE' },
  };
  const result = runDistribution(input);

  it('produces a valid run with no line and every total zero', () => {
    expect(result.waterfall.distributableMinor).toBe(0n);
    expect(result.lines).toEqual([]);
    expect(result.totals).toStrictEqual({
      paidMinor: 0n,
      withheldMinor: 0n,
      crossBorderMinor: 0n,
      retainedMinor: 0n,
      entitledMinor: 0n,
      excludedCount: 0,
      entitledLineCount: 0,
      residualMinor: 0n,
    });
    expect(result.flags).toContain('NIL_DISTRIBUTION');
  });

  it('holds I3 trivially, and is still a filed statement with a timing block', () => {
    expect(result.timing.status).toBe('ON_TIME');
    expect(result.invariantsChecked).toContain('I3');
  });

  /**
   * ⚠ SURFACED, NOT RESOLVED — §08 is INCONSISTENT and this engine does not harmonise it.
   *
   * On zero revenue §08 says `lines = []` flatly, discarding the entitlement-basis record; on an
   * ineligible cohort (AT-06) it says zero *PAYOUT* lines, and Example A emits an EXCLUDED line for
   * ben-002. So a nil run with a live cohort reports `excludedCount: 0` while an
   * `NO_ELIGIBLE_BENEFICIARIES` run with the same cohort reports its exclusions in full. BR-505
   * requires a per-beneficiary statement showing the entitlement basis, which argues for emitting
   * the EXCLUDED lines in BOTH branches. Whether a nil-run statement must carry the entitlement
   * basis is a product/reporting scope call for the product owner (CLAUDE.md binding rule 4).
   */
  it('discards the entitlement-basis record that AT-06 preserves — the §08 inconsistency, pinned', () => {
    expect(input.beneficiaries).toHaveLength(3);
    expect(result.lines).toHaveLength(0);
    expect(result.totals.excludedCount).toBe(0);
    // Whereas AT-06's ineligible cohort, with the same three-member shape, reports its exclusions.
    const ineligible = runDistribution({
      ...input,
      beneficiaries: input.beneficiaries.map((entry) => ({ ...entry, active: false })),
    });
    expect(ineligible.lines).toHaveLength(0);
    // …because distributable is still 0 here, so the NIL short-circuit wins over the cohort branch.
    // The divergence appears only once distributable > 0, which AT-06 demonstrates.
    expect(ineligible.flags).toContain('NIL_DISTRIBUTION');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-08 · malformed shart (error)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-08 · an unreadable Shart HALTS — the engine never infers the founder’s intent', () => {
  it('AT-08a · an unrecognised entitlementOrder throws SHART_INCOMPLETE, not a shape error', () => {
    // This is why `entitlementOrder` is `z.string()` and not a zod enum: the value must reach
    // `parseEntitlementOrder` as DATA. A shape error would report DISTRIBUTION_INPUT_INVALID, i.e.
    // "your object is malformed" instead of "nobody can read this deed".
    const error = expectDomainError(
      () => runDistribution({ ...exampleA(), entitlementOrder: 'MURATTAB' }),
      'SHART_INCOMPLETE',
    );
    expect(error.message).toContain('MURATTAB');
    const details = error.details as Record<string, unknown>;
    expect(details.field).toBe('entitlementOrder');
    // ADR-0009 added LINEAGE_CONTINUATION and put it FIRST: it is the deed shape the product treats as
    // normal, and the echoed list is what a Nazir reads to find out what the engine will accept.
    expect(details.recognised).toEqual([
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
      'NA_DIRECT_USE',
    ]);
  });

  it('AT-08a · never falls back to an equal split or to the previous period', () => {
    for (const bad of ['', 'ordered', ' ORDERED', 'ORDERED ', 'al-a`la fa-l-a`la', 'n/a']) {
      expectDomainError(
        () => runDistribution({ ...exampleA(), entitlementOrder: bad }),
        'SHART_INCOMPLETE',
      );
    }
    // Note `'ordered'` in that list: no case folding, no trimming. Every such convenience would be
    // the engine deciding what the waqif meant.
  });

  it('AT-08a · halts on the deed even when the waterfall would ALSO refuse', () => {
    // Order matters: the operator must be told the deed is unreadable, not given figures that were
    // never going to be used.
    const both: DistributionInputRaw = {
      ...exampleA(),
      entitlementOrder: 'MURATTAB',
      maintenance: { kind: 'FIXED', amountMinor: 99_000_000n },
    };
    expectDomainError(() => runDistribution(both), 'SHART_INCOMPLETE');
  });

  /**
   * ⚠ **INVERTED BY ADR-0009 R5 — this was "a JOINT waqf MISSING a leg halts".**
   *
   * It is now "a joint waqf halts, full stop", and the reason changed underneath the code: the old
   * refusal (`assertJointLegsPresent`) was about a split whose two legs could not be LOCATED; the new
   * one is that the waqf **cannot exist**. A waqf is either خيري (charitable, for a segment the waqif
   * chooses) or ذري (ancestral/generational) — never both.
   *
   * `details.missingLegs` is gone with the function that produced it. The assertions below pin
   * `details.refusal` instead, which matters more than it looks: ADR-0009 and R7 route twenty-six distinct
   * refusals through `SHART_INCOMPLETE`, so a code-only assertion would pass against any of them.
   */
  it('AT-08b · a JOINT waqf halts — two legs, one leg, or none', () => {
    const base = exampleDJoint();
    const cohorts: ReadonlyArray<readonly [string, DistributionInputRaw['beneficiaries']]> = [
      ['both legs (the shape that used to compute)', base.beneficiaries],
      ['family only', base.beneficiaries.filter((entry) => entry.kind !== 'CHARITABLE_JIHA')],
      ['charitable only', base.beneficiaries.filter((entry) => entry.kind === 'CHARITABLE_JIHA')],
      ['no cohort at all', []],
    ];
    for (const [label, beneficiaries] of cohorts) {
      const error = expectDomainError(
        () => runDistribution({ ...base, beneficiaries }),
        'SHART_INCOMPLETE',
      );
      expect(
        (error.details as Record<string, unknown>).refusal,
        `${label} must be refused as an impossible waqf`,
      ).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
      // The old discriminator must be GONE, not merely unasserted: a leftover `missingLegs` would mean
      // the leg-location refusal was still live somewhere and this test was proving the wrong thing.
      expect((error.details as Record<string, unknown>).missingLegs).toBeUndefined();
    }
  });

  /**
   * The re-entry route, and why the refusal is keyed on the COHORT rather than on the declared type.
   *
   * If only `waqfType: 'JOINT'` were refused, the identical mixed خيري/ذري cohort would arrive declared
   * `FAMILY_DHURRI` and a charity would take its fixed share out of a family endowment's ghallah with
   * nothing raised. This is the test that makes R5 more than a spelling rule.
   */
  it('AT-08b · a MIXED خيري/ذري cohort halts under a legal waqfType too — the evasion is closed', () => {
    const base = exampleDJoint();
    for (const waqfType of ['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const) {
      const error = expectDomainError(
        () => runDistribution({ ...base, waqfType }),
        'SHART_INCOMPLETE',
      );
      expect(error.details).toMatchObject({
        refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY',
        waqfType,
        charitableJihaCount: 1,
        familyCount: 2,
      });
    }
    /*
     * ⚠⚠ **INVERTED TWICE. The original claim was right after all, and the record of both moves is
     * kept because each was true of a different engine.**
     *
     * (1) ORIGINAL CLAIM: "a placeholder is NOT a leg — jiha + `CATEGORY_ONLY` is a legal charitable
     *     waqf whose segment is not yet individually identified. The refusal must not over-reach into
     *     that." `assertSingleWaqfNature` always agreed — it counts placeholders separately and
     *     refuses nothing on this cohort (driven directly in `resolver.test.ts`).
     *
     * (2) MEASURED under R6 + ESC-1, and this is what the assertions here became: the run was refused
     *     anyway, by two LATER rules that squeezed the record from both sides and left it no legal
     *     form at all —
     *
     *       lineageLink absent  ⇒ LINEAGE_LINK_MISSING           (R6 · buildLineage pass 4)
     *       lineageLink present ⇒ DESCENDANT_ON_CHARITABLE_WAQF  (ESC-1 · assertSingleWaqfNature)
     *
     *     so "the poor of the district, not yet enrolled" — the ordinary state of a خيري deed before
     *     enrolment — could not be entered.
     *
     * (3) ✓ CORRECTED: `buildLineage` pass 4 requires the lineage edge from a `CATEGORY_ONLY` member
     *     **only on a `FAMILY_DHURRI` waqf**, because on a خيري waqf eligibility does not come from
     *     descent and demanding an edge forced a fiction. The edgeless half is inverted onto the
     *     computation below; the edge-bearing half still refuses (ESC-1 is untouched), which is what
     *     keeps "a charitable waqf's beneficiaries may not be a bloodline" intact.
     *
     * THE ARITHMETIC, by hand, in halalas — Example D's own figures, which is why this cohort is
     * driven from `exampleDJoint()` rather than a fresh fixture:
     *
     *     revenue                          180,000,000
     *     − ṣiyāna (FIXED)                 −10,000,000
     *     − operating                      −12,000,000
     *     − ʿushr 10% of REVENUE           −18,000,000   (⚠ verify — may be stale)
     *     = distributable                  140,000,000
     *
     * `SHARED` (tashrik) applies the deed weights and runs no tier test at all. Weights 40/30/30 over
     * Σ 100, every member active and non-zero:
     *
     *     ben-006 (jiha)      140,000,000 × 40 / 100 = 56,000,000   (exact)
     *     ben-007 (segment)   140,000,000 × 30 / 100 = 42,000,000   (exact)
     *     ben-008 (segment)   140,000,000 × 30 / 100 = 42,000,000   (exact)
     *     Σ = 140,000,000, residual 0.
     *
     * `ben-008` is `CROSS_BORDER`, so its line ROUTES rather than blocks (BR-511) — the entitlement is
     * identical and an Authority notice is queued. That is the one gate that does not withhold.
     */
    const placeholderCohort = (lineageLink: string | null, tabaqa: number | null) => ({
      ...base,
      waqfType: 'PUBLIC_CHARITABLE' as const,
      beneficiaries: base.beneficiaries.map((entry) =>
        entry.kind === 'FAMILY'
          ? {
              ...entry,
              kind: 'CATEGORY_ONLY' as const,
              tabaqa,
              parentId: null,
              lineageLink,
              line: 'NA' as const,
              category: 'orphans of the district',
            }
          : entry,
      ),
    });

    const computed = runDistribution(placeholderCohort(null, null));
    expect(
      computed.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-006', 'PAID', 56_000_000n],
      ['ben-007', 'PAID', 42_000_000n],
      ['ben-008', 'CROSS_BORDER_PENDING', 42_000_000n],
    ]);
    // No member claims a descent it does not have — the whole reason the fictional edge was wrong.
    expect(computed.lines.map((line) => line.basis.lineageDepth)).toStrictEqual([null, null, null]);

    // ⚠ BR-206's gate has a reachable subject again: blank the segment's category and the line is
    // WITHHELD with its entitlement INTACT (I6 — a gate stamps a status, it never moves an amount).
    const uncaptured = runDistribution({
      ...placeholderCohort(null, null),
      beneficiaries: placeholderCohort(null, null).beneficiaries.map((entry) =>
        entry.id === 'ben-007' ? { ...entry, category: null } : entry,
      ),
    });
    expect(
      uncaptured.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-006', 'PAID', 56_000_000n],
      ['ben-007', 'WITHHELD', 42_000_000n],
      ['ben-008', 'CROSS_BORDER_PENDING', 42_000_000n],
    ]);
    expect(uncaptured.lines.find((line) => line.beneficiaryId === 'ben-007')?.reasonCode).toBe(
      'CATEGORY_NOT_CAPTURED',
    );

    // …and the half that did NOT move: recording the segment as a descendant still claims two natures.
    //
    // ⚠ (4) INVERTED IN PART (product owner, 2026-08-03). `placeholderCohort('SON', 1)` records an
    // edge AND a generational tier. MEASURED BEFORE: `DESCENDANT_ON_CHARITABLE_WAQF`. MEASURED AFTER:
    // `TABAQA_ON_CHARITABLE_WAQF` — a وقف خيري has no generations, so the ṭabaqa is refused first.
    // Both recordings are driven, so ESC-1's coverage is not quietly absorbed by the newer rule.
    expect(
      expectDomainError(() => runDistribution(placeholderCohort('SON', 1)), 'SHART_INCOMPLETE')
        .details,
    ).toMatchObject({ refusal: 'TABAQA_ON_CHARITABLE_WAQF' });
    expect(
      expectDomainError(() => runDistribution(placeholderCohort('SON', null)), 'SHART_INCOMPLETE')
        .details,
    ).toMatchObject({ refusal: 'DESCENDANT_ON_CHARITABLE_WAQF' });
  });

  /**
   * ⚠ **THE ASYMMETRY IS INVERTED, AND THAT IS THE POINT OF THIS TEST.**
   *
   * S3 pinned a finding here: `assertJointLegsPresent` ran inside the RESOLVER, at Stage 2, i.e. AFTER
   * the waterfall, so a one-legged JOINT waqf with impossible figures reported `DISTRIBUTION_NEGATIVE`
   * — "money wins" — while an unreadable `entitlementOrder` reported `SHART_INCOMPLETE` because it was
   * checked in a Stage-0 pre-flight. Same class of defect, two diagnostics; the operator was sent to
   * fix the money on a waqf whose deed was the problem. That test's own note said the fix was to move
   * the check into the pre-flight, and called it a decision for whoever owned `engine.ts`.
   *
   * ADR-0009 made that decision. `assertSingleWaqfNature` now runs at **Stage 0**, beside
   * `parseEntitlementOrder` and BEFORE `computeWaterfall`, so the deed wins on both halves. The
   * reasoning is stronger than tidiness: a run on a waqf that **cannot exist** is void whatever its
   * figures say, and "insufficient revenue" is the wrong thing to tell someone about an impossible
   * endowment.
   *
   * The test therefore asserts the NEW precedence *and* keeps the contrast that makes it a precedence
   * claim rather than a coincidence — the same impossible figures on a LEGAL waqf still report the
   * money error, proving Stage 1 was not simply disabled.
   */
  it('AT-08b · pins the INVERTED asymmetry: the deed now wins on BOTH halves', () => {
    const jointAndBroke: DistributionInputRaw = {
      ...exampleDJoint(),
      // A reserve far beyond revenue, so the waterfall would also refuse — this is the exact input
      // shape that used to answer DISTRIBUTION_NEGATIVE.
      maintenance: { kind: 'FIXED', amountMinor: 999_000_000_000n },
    };
    const error = expectDomainError(() => runDistribution(jointAndBroke), 'SHART_INCOMPLETE');
    expect(error.details).toMatchObject({ refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' });

    // The unreadable-ORDER half is UNCHANGED — it always outranked the money error.
    expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          entitlementOrder: 'MURATTAB',
          maintenance: { kind: 'FIXED', amountMinor: 999_000_000_000n },
        }),
      'SHART_INCOMPLETE',
    );

    // And the CONTRAST: identical impossible figures on a legal waqf still report the money error, so
    // Stage 1 still runs and this is a precedence result rather than a suppressed waterfall.
    expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          maintenance: { kind: 'FIXED', amountMinor: 999_000_000_000n },
        }),
      'DISTRIBUTION_NEGATIVE',
    );
  });

  /**
   * The lineage path's own half of AT-08: an unreadable continuation stipulation is exactly as
   * unreadable as an unrecognised order, and gets the same treatment.
   */
  it('AT-08c · an unrecognised continuation stipulation halts, and is never defaulted', () => {
    for (const recorded of [null, '', '  ', 'zuhur_only', 'ZUHUR_ONLY ', 'ZUHUR', 'ظهور فقط']) {
      const error = expectDomainError(
        () => runDistribution({ ...exampleG(), continuationStipulation: recorded }),
        'SHART_INCOMPLETE',
      );
      expect(error.details).toMatchObject({ refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED' });
    }
    // Both recognised values compute — so the refusal is about legibility, not about strictness.
    expect(() =>
      runDistribution({ ...exampleG(), continuationStipulation: 'ZUHUR_ONLY' }),
    ).not.toThrow();
    expect(() =>
      runDistribution({ ...exampleG(), continuationStipulation: 'ZUHUR_AND_BUTUN' }),
    ).not.toThrow();
  });

  it('AT-08c · a malformed family tree halts rather than being repaired', () => {
    const base = exampleG();
    const cases: ReadonlyArray<readonly [string, DistributionInputRaw]> = [
      [
        'LINEAGE_PARENT_UNKNOWN',
        {
          ...base,
          beneficiaries: base.beneficiaries.map((entry) =>
            entry.id === 'ben-207' ? { ...entry, parentId: 'ben-no-such-person' } : entry,
          ),
        },
      ],
      [
        'LINEAGE_CYCLE',
        {
          ...base,
          beneficiaries: base.beneficiaries.map((entry) =>
            entry.id === 'ben-207' ? { ...entry, parentId: 'ben-207' } : entry,
          ),
        },
      ],
      [
        'LINEAGE_LINK_UNRECOGNISED',
        {
          ...base,
          beneficiaries: base.beneficiaries.map((entry) =>
            entry.id === 'ben-207' ? { ...entry, lineageLink: 'son' } : entry,
          ),
        },
      ],
      [
        'TABAQA_MISMATCHES_LINEAGE_DEPTH',
        {
          ...base,
          beneficiaries: base.beneficiaries.map((entry) =>
            entry.id === 'ben-207' ? { ...entry, tabaqa: null } : entry,
          ),
        },
      ],
    ];
    for (const [refusal, input] of cases) {
      const error = expectDomainError(() => runDistribution(input), 'SHART_INCOMPLETE');
      expect((error.details as Record<string, unknown>).refusal, refusal).toBe(refusal);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-09 · determinism (property)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-09 · determinism — no clock, no randomness, no host-dependent ordering', () => {
  const inputs: ReadonlyArray<readonly [string, () => DistributionInputRaw]> = [
    ['A', exampleA],
    ['D-خ', exampleDCharitable],
    ['F', exampleF],
    // ADR-0009: the lineage path is the one that will carry real family statements, and its ancestor
    // walk plus its R3 flag list are two new ways to make a run host-dependent. Both are covered here.
    ['G · LINEAGE / ZUHUR_ONLY', exampleG],
    ['H · per-capita residual', exampleH],
  ];

  for (const [label, build] of inputs) {
    it(`${label} · two runs are deep-equal, computationTrace included`, () => {
      expect(runDistribution(build())).toStrictEqual(runDistribution(build()));
    });

    it(`${label} · canonicalizeResult is byte-identical over 50 repetitions`, () => {
      const first = canonicalizeResult(runDistribution(build()));
      for (let index = 0; index < 50; index += 1) {
        expect(canonicalizeResult(runDistribution(build()))).toBe(first);
      }
    });
  }

  it('emits flags and invariantsChecked in canonical vocabulary order, not emission order', () => {
    // What makes a stored run's bytes stable when the engine's internal call order is reshuffled.
    for (const [, build] of inputs) {
      const result = runDistribution(build());
      const flagOrder = result.flags.map((flag) => RUN_FLAGS.indexOf(flag));
      expect(flagOrder).toStrictEqual([...flagOrder].sort((a, b) => a - b));
      const invariantOrder = result.invariantsChecked.map((id) => INVARIANT_IDS.indexOf(id));
      expect(invariantOrder).toStrictEqual([...invariantOrder].sort((a, b) => a - b));
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-10 · gate precedence
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-10 · gate precedence — the binding reason, with every tripped flag preserved', () => {
  it('exposes the precedence as a constant, so a test cannot restate the order', () => {
    expect(GATE_PRECEDENCE).toEqual([
      'CATEGORY_NOT_CAPTURED',
      'ENTITY_UNLICENSED',
      'STALE_KYC',
      'KYC_UNVERIFIED',
      'CROSS_BORDER_PENDING',
    ]);
  });

  /**
   * The precedence walk: trip gates `i..end` and assert the binding reason is `GATE_PRECEDENCE[i]`.
   *
   * Driven off the constant rather than a hand-written table, so the rule and the test cannot drift.
   */
  for (const [index, expectedBinding] of GATE_PRECEDENCE.entries()) {
    it(`with gates ${index}..end tripped, the binding reason is ${expectedBinding}`, () => {
      const trip = GATE_PRECEDENCE.slice(index);
      const result = runDistribution(oneMemberWaqf(trippingBeneficiary(trip)));
      const line = result.lines[0];

      expect(line?.reasonCode).toBe(expectedBinding);
      // EVERY tripped gate survives in `gateFlags`, in precedence order — a dropped flag is
      // evidence lost from a family dispute.
      expect(line?.gateFlags).toEqual(trip);
      // Only CROSS_BORDER_PENDING routes; the other four block.
      expect(line?.status).toBe(
        expectedBinding === 'CROSS_BORDER_PENDING' ? 'CROSS_BORDER_PENDING' : 'WITHHELD',
      );
      // …and the amount is untouched by any of it (I6).
      expect(line?.entitledMinor).toBe(9_000n);
    });
  }

  it('a beneficiary tripping nothing is PAID with no reason and no flags', () => {
    const result = runDistribution(oneMemberWaqf(trippingBeneficiary([])));
    expect(result.lines[0]?.status).toBe('PAID');
    expect(result.lines[0]?.reasonCode).toBeNull();
    expect(result.lines[0]?.gateFlags).toEqual([]);
  });

  it('the four-gate case §08 names: category + licence + unverified + cross-border', () => {
    const member = beneficiary({
      id: 'ben-multi',
      kind: 'CATEGORY_ONLY',
      active: true,
      // R6: see `trippingBeneficiary`. An unnamed child of the waqif, depth 1.
      tabaqa: 1,
      parentId: null,
      lineageLink: 'SON',
      line: 'NA',
      branch: null,
      stipulatedWeight: '10',
      category: null,
      verificationStatus: 'UNVERIFIED',
      kycLastRefreshed: null,
      residency: 'CROSS_BORDER',
      disbursingEntity: {
        name: 'Example Disbursing Entity (fictional)',
        licensed: false,
        licenceExpiry: null,
      },
      bankingRefForProceeds: 'FAKE-IBAN-MULTI',
    });
    const line = runDistribution(oneMemberWaqf(member)).lines[0];

    expect(line?.status).toBe('WITHHELD');
    expect(line?.reasonCode).toBe('CATEGORY_NOT_CAPTURED');
    expect(line?.gateFlags).toEqual([
      'CATEGORY_NOT_CAPTURED',
      'ENTITY_UNLICENSED',
      'KYC_UNVERIFIED',
      'CROSS_BORDER_PENDING',
    ]);
    // STALE_KYC is absent on purpose: a never-verified record has no window to have aged out of, so
    // one condition does not carry two codes.
    expect(line?.gateFlags).not.toContain('STALE_KYC');
  });

  it('cross-border + stale KYC ⇒ WITHHELD on STALE_KYC, and NO Authority notice is queued', () => {
    // §08's own named case. KYC blocks payment outright; cross-border merely ROUTES it, so the KYC
    // reason binds. The notice is queued only when cross-border is the BINDING status — notifying
    // the Authority of a disbursement that is not happening would be a mis-filing.
    //
    // ⚠ SURFACED, NOT RESOLVED: whether Nazarah Art. 10(7) requires notice at the point of
    // ENTITLEMENT or at the point of PAYMENT is a question of Saudi law for counsel.
    const result = runDistribution(
      oneMemberWaqf(trippingBeneficiary(['STALE_KYC', 'CROSS_BORDER_PENDING'])),
    );
    const line = result.lines[0];
    expect(line?.status).toBe('WITHHELD');
    expect(line?.reasonCode).toBe('STALE_KYC');
    expect(line?.gateFlags).toEqual(['STALE_KYC', 'CROSS_BORDER_PENDING']);
    // The routing requirement is NOT lost — it is on the line's flags.
    expect(line?.gateFlags).toContain('CROSS_BORDER_PENDING');
    expect(result.authorityNotices).toEqual([]);
  });

  it('a cross-border line that trips nothing else DOES queue the notice', () => {
    const result = runDistribution(oneMemberWaqf(trippingBeneficiary(['CROSS_BORDER_PENDING'])));
    expect(result.lines[0]?.status).toBe('CROSS_BORDER_PENDING');
    expect(result.authorityNotices).toHaveLength(1);
    expect(result.authorityNotices[0]?.beneficiaryId).toBe('ben-gate');
  });

  it('never runs the gates on an EXCLUDED line — excluded is not withheld', () => {
    // §08: an exclusion is an ENTITLEMENT verdict. A payability reason on such a line would
    // misrepresent the deed's own exclusion as a paperwork problem.
    const excluded = runDistribution(exampleA()).lines.find(
      (line) => line.beneficiaryId === 'ben-002',
    );
    expect(excluded?.status).toBe('EXCLUDED');
    expect(excluded?.reasonCode).toBe('UPPER_TABAQA_EXTANT');
    expect(excluded?.gateFlags).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-11 · the corpus guard (D1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-11 · a caller who cannot show the classification is REFUSED, never trusted', () => {
  const withRevenue = (revenue: DistributionInputRaw['revenue']): DistributionInputRaw => ({
    ...exampleA(),
    revenue,
    maintenance: { kind: 'NONE' },
  });

  it('RECEIPT_UNCLASSIFIED · income declared with NO receipts behind it', () => {
    // The whole point of D1: a bare revenue total is indistinguishable from sale or istibdal
    // proceeds, so it is refused rather than silently distributed.
    const error = expectDomainError(
      () => runDistribution(withRevenue({ incomeMinor: 35_000_000n, receipts: [] })),
      'RECEIPT_UNCLASSIFIED',
    );
    expect((error.details as Record<string, unknown>).receiptCount).toBe(0);
  });

  it('RECEIPT_UNCLASSIFIED · a class that is not EXACTLY INCOME or CAPITAL', () => {
    for (const receiptClass of ['', 'income', 'Income', 'INCOME ', 'REVENUE', 'capital']) {
      const error = expectDomainError(
        () =>
          runDistribution(
            withRevenue({
              incomeMinor: 35_000_000n,
              receipts: [{ id: 'rev-bad', receiptClass, amountMinor: 35_000_000n }],
            }),
          ),
        'RECEIPT_UNCLASSIFIED',
      );
      expect(error.message).toContain('rev-bad');
    }
  });

  it('RECEIPT_UNCLASSIFIED · a CAPITAL receipt naming no capitalSource', () => {
    expectDomainError(
      () =>
        runDistribution(
          withRevenue({
            incomeMinor: 0n,
            receipts: [{ id: 'cap-bad', receiptClass: 'CAPITAL', amountMinor: 2_000_000_000n }],
          }),
        ),
      'RECEIPT_UNCLASSIFIED',
    );
  });

  it('RECEIPT_UNCLASSIFIED · an INCOME receipt that names a capitalSource', () => {
    // Corpus proceeds filed as ghallah — a self-contradictory record, refused rather than distributed.
    expectDomainError(
      () =>
        runDistribution(
          withRevenue({
            incomeMinor: 35_000_000n,
            receipts: [
              {
                id: 'rev-contradiction',
                receiptClass: 'INCOME',
                capitalSource: 'ISTIBDAL_PROCEEDS',
                amountMinor: 35_000_000n,
              },
            ],
          }),
        ),
      'RECEIPT_UNCLASSIFIED',
    );
  });

  it('CORPUS_NOT_DISTRIBUTABLE · declared income EXCEEDS its INCOME provenance', () => {
    // The unevidenced difference has no income provenance, so it is corpus (asl) until proven
    // otherwise — and corpus is blocked.
    const error = expectDomainError(
      () =>
        runDistribution(
          withRevenue({
            incomeMinor: 35_000_000n,
            receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 30_000_000n }],
          }),
        ),
      'CORPUS_NOT_DISTRIBUTABLE',
    );
    const details = error.details as Record<string, string>;
    expect(details.declaredIncomeMinor).toBe('35000000');
    expect(details.classifiedIncomeMinor).toBe('30000000');
  });

  it('DISTRIBUTION_INPUT_INVALID · declared income falls SHORT of its INCOME receipts', () => {
    // Not a corpus breach — the receipts ARE classified — but still a refusal: distributing the
    // smaller figure would leave classified ghallah unaccounted for.
    expectDomainError(
      () =>
        runDistribution(
          withRevenue({
            incomeMinor: 30_000_000n,
            receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
          }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('accepts a CAPITAL-only period with zero declared income', () => {
    // A period that produced only corpus proceeds is legal: the run is nil, and the corpus is
    // REPORTED so it is visible rather than hidden.
    const result = runDistribution(
      withRevenue({
        incomeMinor: 0n,
        receipts: [
          {
            id: 'cap-001',
            receiptClass: 'CAPITAL',
            capitalSource: 'EXPROPRIATION_COMPENSATION',
            amountMinor: 2_000_000_000n,
          },
        ],
      }),
    );
    expect(result.waterfall.revenueMinor).toBe(0n);
    expect(result.waterfall.capitalReceiptsMinor).toBe(2_000_000_000n);
    expect(result.waterfall.distributableMinor).toBe(0n);
    expect(result.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(result.flags).toContain('NIL_DISTRIBUTION');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-12 · corpus moves nothing (I-C1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-12 · injecting corpus changes NOTHING except the reported corpus total', () => {
  const base = runDistribution(exampleA());
  const withCorpus = runDistribution({
    ...exampleA(),
    revenue: {
      incomeMinor: 35_000_000n,
      receipts: [
        { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n },
        {
          id: 'cap-001',
          receiptClass: 'CAPITAL',
          capitalSource: 'ISTIBDAL_PROCEEDS',
          amountMinor: 2_000_000_000n,
        },
      ],
    },
  });

  it('leaves every line identical, halala for halala', () => {
    expect(withCorpus.lines).toStrictEqual(base.lines);
  });

  it('leaves every total identical', () => {
    expect(withCorpus.totals).toStrictEqual(base.totals);
  });

  it('leaves every waterfall figure identical EXCEPT capitalReceiptsMinor', () => {
    expect(base.waterfall.capitalReceiptsMinor).toBe(0n);
    expect(withCorpus.waterfall.capitalReceiptsMinor).toBe(2_000_000_000n);
    const { capitalReceiptsMinor: _baseCapital, ...baseRest } = base.waterfall;
    const { capitalReceiptsMinor: _corpusCapital, ...corpusRest } = withCorpus.waterfall;
    expect(corpusRest).toStrictEqual(baseRest);
  });

  it('adds exactly one flag, and changes no other', () => {
    expect(withCorpus.flags).toStrictEqual([
      'CAPITAL_RECEIPTS_EXCLUDED',
      'UNVERIFIED_FIGURES_APPLIED',
    ]);
    expect(base.flags).toStrictEqual(['UNVERIFIED_FIGURES_APPLIED']);
  });

  it('holds for sale proceeds and expropriation compensation too, whatever the magnitude', () => {
    for (const capitalSource of ['SALE_PROCEEDS', 'EXPROPRIATION_COMPENSATION', 'OTHER'] as const) {
      for (const amountMinor of [1n, 999_999_999_999n]) {
        const result = runDistribution({
          ...exampleA(),
          revenue: {
            incomeMinor: 35_000_000n,
            receipts: [
              { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n },
              { id: 'cap-x', receiptClass: 'CAPITAL', capitalSource, amountMinor },
            ],
          },
        });
        expect(result.lines).toStrictEqual(base.lines);
        expect(result.totals).toStrictEqual(base.totals);
        expect(result.waterfall.distributableMinor).toBe(27_500_000n);
        expect(result.waterfall.capitalReceiptsMinor).toBe(amountMinor);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-13 · the binding calendar (decision D2)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-13 · which calendar binds the post-FYE window, and both dates always reported', () => {
  /**
   * GIVEN FYE `12-31`, the injected pair (2027-03-31 Gregorian / 1448-10-22 Hijri = 2027-03-30), and
   * `asOf` 2027-03-31.
   * WHEN timing evaluates.
   * THEN under `EARLIER_OF` the Hijri date binds and the run is OVERDUE by one day; under
   * `GREGORIAN` the same input is ON_TIME.
   */
  const onTheGregorianDeadline: DistributionInputRaw = {
    ...exampleA(),
    // 2027-03-31 → 1448-10-23, taken from the ONE conversion rather than typed.
    asOf: { gregorian: '2027-03-31', hijri: toHijri(civilDate('2027-03-31')) },
  };

  it('EARLIER_OF binds on the HIJRI date, so the run is OVERDUE by one day', () => {
    const { timing, flags } = runDistribution(onTheGregorianDeadline);
    expect(timing.hijriDeadlineAsGregorian).toBe('2027-03-30');
    expect(timing.boundBy).toBe('HIJRI');
    expect(timing.bindingDeadlineGregorian).toBe('2027-03-30');
    expect(timing.status).toBe('OVERDUE');
    expect(timing.daysUntilDeadline).toBe(-1);
    expect(flags).toContain('TIMING_OVERDUE');
  });

  it('GREGORIAN on the SAME input is ON_TIME — that one-day divergence IS decision D2', () => {
    // The regression this pins: a fallback to Gregorian-only would UNDER-report lateness, which is
    // the one direction D2 forbids.
    const { timing, flags } = runDistribution({
      ...onTheGregorianDeadline,
      policy: policy({ bindingCalendar: 'GREGORIAN' }),
    });
    expect(timing.boundBy).toBe('GREGORIAN');
    expect(timing.bindingDeadlineGregorian).toBe('2027-03-31');
    expect(timing.status).toBe('ON_TIME');
    expect(timing.daysUntilDeadline).toBe(0);
    expect(flags).not.toContain('TIMING_OVERDUE');
  });

  it('HIJRI explicitly gives the same answer as EARLIER_OF here', () => {
    const { timing } = runDistribution({
      ...onTheGregorianDeadline,
      policy: policy({ bindingCalendar: 'HIJRI' }),
    });
    expect(timing.boundBy).toBe('HIJRI');
    expect(timing.status).toBe('OVERDUE');
  });

  it('reports BOTH deadlines under every selector', () => {
    for (const bindingCalendar of ['EARLIER_OF', 'GREGORIAN', 'HIJRI'] as const) {
      const { timing } = runDistribution({
        ...onTheGregorianDeadline,
        policy: policy({ bindingCalendar }),
      });
      expect(timing.deadlineGregorian).toBe('2027-03-31');
      expect(timing.deadlineHijri).toBe('1448-10-22');
      expect(timing.hijriDeadlineAsGregorian).toBe('2027-03-30');
      expect(timing.bindingCalendar).toBe(bindingCalendar);
    }
  });

  it('computes the run either way — being late never blocks a statement', () => {
    const overdue = runDistribution(onTheGregorianDeadline);
    expect(overdue.totals.entitledMinor).toBe(27_500_000n);
    expect(overdue.lines).toHaveLength(3);
    // ⚠ the 3-month window itself is unverified — the marker travels with the run.
    expect(overdue.timing.unverifiedNote).not.toBeNull();
    expect(overdue.unverifiedNotes.length).toBeGreaterThan(0);
  });

  it('reports unverifiedNote as NULL when the window figure has been confirmed', () => {
    const confirmed = runDistribution({
      ...exampleA(),
      deadline: deadline({ unverified: false }),
    });
    expect(confirmed.timing.unverifiedNote).toBeNull();
    // The RUN-level flag still fires: `policy` is assembled entirely from unverified Settings, so
    // every run currently applies at least one figure that has not been confirmed.
    expect(confirmed.flags).toContain('UNVERIFIED_FIGURES_APPLIED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-14 · input consistency and fail-closed Settings
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-14 · the input is cross-checked, and a Setting the engine cannot honour is REFUSED', () => {
  it('DISTRIBUTION_INPUT_INVALID · a mismatched asOf dual date, naming BOTH values', () => {
    // 2026-07-14 converts to 1448-01-29. `1448-01-28` is a REAL Umm al-Qura day, just the wrong one,
    // so it reaches `assertInputConsistency`'s cross-check — the cheapest possible proof that the
    // caller used our one Hijri implementation and not a second one.
    const error = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          asOf: { gregorian: '2026-07-14', hijri: '1448-01-28' },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('1448-01-29');
    expect(error.message).toContain('1448-01-28');
  });

  /**
   * ⚠ SPEC/BRIEF DEFECT, PINNED HERE.
   *
   * The S3 brief's AT-14 uses `hijri: '1448-01-30'` as the mismatched value and expects an error
   * "naming both values". **`1448-01-30` does not exist** — Umm al-Qura month 1448-01 has 29 days —
   * so it is refused one layer earlier, by `hijriDateSchema`, and the message names the malformed
   * date rather than the correct conversion. Both paths yield `DISTRIBUTION_INPUT_INVALID`, so the
   * criterion's *code* holds; only its *message* claim does not. The valid-but-wrong case above is
   * the one that exercises the dual-date cross-check.
   */
  it('DISTRIBUTION_INPUT_INVALID · a Hijri date that does not exist is refused by the SCHEMA', () => {
    const error = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          asOf: { gregorian: '2026-07-14', hijri: '1448-01-30' },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('asOf.hijri');
    // Refused, not extrapolated — an out-of-table Hijri day never becomes a confident wrong answer.
    expect(error.message).toContain('Umm al-Qura');
  });

  it('DISTRIBUTION_INPUT_INVALID · a duplicate beneficiaryId', () => {
    // The split, the residual tie-break and the statement all key on the id, and §08 never says it
    // must be unique.
    const base = exampleA();
    const error = expectDomainError(
      () =>
        runDistribution({
          ...base,
          // ben-001 appears twice, byte for byte.
          beneficiaries: [...base.beneficiaries, ...base.beneficiaries.slice(0, 1)],
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('ben-001');
  });

  it('DISTRIBUTION_INPUT_INVALID · a duplicate RECEIPT id', () => {
    // Beyond the brief, and worth keeping: the corpus guard reports the ids of the CAPITAL receipts
    // it excluded (I-C1), and a duplicated id makes that record unauditable — nobody can tell
    // whether one receipt was counted twice or two receipts once.
    const error = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          revenue: {
            incomeMinor: 35_000_000n,
            receipts: [
              { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 20_000_000n },
              { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 15_000_000n },
            ],
          },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('rev-001');
  });

  it('SETTING_INVALID · a rounding granularity this allocator cannot honour', () => {
    // Refused rather than silently IGNORED: a configured 5-halala granularity that the engine
    // quietly allocates at 1 would produce a statement nobody configured.
    const error = expectDomainError(
      () => runDistribution({ ...exampleA(), policy: policy({ roundingUnitMinor: 5n }) }),
      'SETTING_INVALID',
    );
    expect(error.message).toContain('distribution.rounding.unitMinor');
  });

  it('SETTING_INVALID · LARGEST_REMAINDER_BANKERS — never a silent fall back to half-up', () => {
    // Declared but unimplemented. A fallback would produce a statement indistinguishable from a
    // ratified one.
    const error = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          policy: policy({ roundingMethod: 'LARGEST_REMAINDER_BANKERS' }),
        }),
      'SETTING_INVALID',
    );
    expect(error.message).toContain('LARGEST_REMAINDER_BANKERS');
  });

  it('DISTRIBUTION_INPUT_INVALID · a missing policy figure fails to parse, never defaults', () => {
    // §08 sketched `kycRefreshMonths: z.number().int().default(12)`. A defaulted statutory window is
    // exactly what `settings.ts` exists to prevent: a missing row must be SETTING_MISSING upstream,
    // never a confidently wrong KYC verdict here.
    const { kycRefreshMonths: _dropped, ...withoutKyc } = policy();
    const error = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          policy: withoutKyc as DistributionInputRaw['policy'],
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('kycRefreshMonths');
  });

  it('DISTRIBUTION_INPUT_INVALID · a period whose start is after its end', () => {
    expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          period: { start: '2026-12-31', end: '2026-01-01' },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('DISTRIBUTION_INPUT_INVALID · a weight that is a JS number rather than a decimal string', () => {
    // `largestRemainderAllocate` rejects a `number` at runtime, so §08's `z.number()` weight could
    // never have reached the allocator at all. The refusal is moved to the boundary.
    const base = exampleA();
    expectDomainError(
      () =>
        runDistribution({
          ...base,
          beneficiaries: base.beneficiaries.map((entry) => ({
            ...entry,
            stipulatedWeight: 12.5 as unknown as string,
          })),
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-15 · the three exclusion codes, pinned against one another
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-15 · BENEFICIARY_INACTIVE vs TABAQA_EXTINCT vs UPPER_TABAQA_EXTANT', () => {
  /**
   * GIVEN ORDERED, ṭabaqa 1 = { ben-A active, ben-B INACTIVE }, ṭabaqa 2 = { ben-C active }.
   * WHEN the resolver runs.
   * THEN ben-A takes 100%; ben-B is `BENEFICIARY_INACTIVE`; ben-C is `UPPER_TABAQA_EXTANT`.
   */
  const member = (
    id: string,
    tabaqa: number,
    active: boolean,
    parentId: string | null = null,
  ): DistributionInputRaw['beneficiaries'][number] =>
    beneficiary({
      id,
      kind: 'FAMILY',
      active,
      tabaqa,
      // ⚠ **R6: the edge is mandatory on EVERY order now, and a declared ṭabaqa must be REACHED
      // through it.** So a ṭabaqa-2 member takes a `parentId` — a tier contrast on a family waqf
      // requires a real two-node graph. The tier VERDICTS are unchanged: `orderedExclusionReason`
      // still keys on `tabaqa`, and the derived depth only has to agree with it.
      parentId,
      lineageLink: 'SON',
      line: 'ZUHUR',
      branch: 'Branch A',
      stipulatedWeight: '10',
      verificationStatus: 'VERIFIED',
      kycLastRefreshed: '2026-04-01',
      category: null,
      residency: 'DOMESTIC',
      disbursingEntity: null,
      bankingRefForProceeds: `FAKE-IBAN-${id}`,
    });

  const cohort = [
    member('ben-A', 1, true),
    member('ben-B', 1, false),
    member('ben-C', 2, true, 'ben-A'),
  ];

  const withOrder = (entitlementOrder: string): DistributionInputRaw => ({
    ...exampleA(),
    entitlementOrder,
    beneficiaries: cohort,
  });

  it('ORDERED · the inactive member of the LIVING tier is BENEFICIARY_INACTIVE', () => {
    const result = runDistribution(withOrder('ORDERED'));
    const reasons = new Map(result.lines.map((line) => [line.beneficiaryId, line.reasonCode]));

    // ben-A is the only entitled member and takes the whole distributable.
    expect(result.lines.find((line) => line.beneficiaryId === 'ben-A')?.entitledMinor).toBe(
      27_500_000n,
    );
    // NOT UPPER_TABAQA_EXTANT (there is no upper tier above ṭabaqa 1) and NOT TABAQA_EXTINCT (the
    // tier is not extinct — ben-A lives). §08 supplies no code for this, the commonest real case.
    expect(reasons.get('ben-B')).toBe('BENEFICIARY_INACTIVE');
    expect(reasons.get('ben-C')).toBe('UPPER_TABAQA_EXTANT');
  });

  it('SHARED · the SAME cohort entitles ben-A and ben-C, excluding only ben-B', () => {
    const result = runDistribution(withOrder('SHARED'));
    const entitled = result.lines.filter((line) => line.status !== 'EXCLUDED');
    expect(entitled.map((line) => line.beneficiaryId)).toEqual(['ben-A', 'ben-C']);
    // 27_500_000 over two equal weights.
    expect(entitled.map((line) => line.entitledMinor)).toEqual([13_750_000n, 13_750_000n]);
    expect(result.lines.find((line) => line.beneficiaryId === 'ben-B')?.reasonCode).toBe(
      'BENEFICIARY_INACTIVE',
    );
  });

  /**
   * ⚠ **RE-POINTED BY ADR-0009 — the CLAIM survives, its SUBJECT could not.**
   *
   * This used to put a `CHARITABLE_JIHA` beside the family cohort. That cohort is now refused
   * (`COHORT_MIXES_CHARITABLE_AND_FAMILY`), so the test would have started passing for the wrong
   * reason — proving the R5 refusal instead of "an untiered member is never tier-excluded".
   *
   * The claim is re-pointed onto a `CATEGORY_ONLY` placeholder, which is the OTHER untiered kind and is
   * explicitly **not a leg**: family + placeholder is a legal ذري cohort with an unnamed descendant. The
   * figures are unchanged (equal deed weights with ben-A ⇒ half each), so the tier claim is tested on
   * exactly the arithmetic it was tested on before. The jiha version is asserted as a REFUSAL below,
   * so nothing that used to be covered is now merely absent.
   */
  const untieredPlaceholder = beneficiary({
    id: 'ben-untiered',
    kind: 'CATEGORY_ONLY',
    active: true,
    tabaqa: null,
    parentId: null,
    lineageLink: null,
    line: 'NA',
    branch: null,
    stipulatedWeight: '10',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-04-01',
    // Non-null: an uncaptured category is a payability WITHHOLD (CATEGORY_NOT_CAPTURED) and would mask
    // the entitlement claim this test is about.
    category: 'grandchildren not yet named',
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: 'FAKE-IBAN-UNTIERED',
  });

  /**
   * ⚠⚠ **INVERTED — the untiered member has no representable record on a ذري waqf, and this is the
   * SECOND time this case has been re-pointed. Input kept verbatim.**
   *
   * MEASURED before R6, on this exact cohort: `ben-untiered` was `PAID` with `reasonCode: null` and
   * **13,750,000 halalas** — half the distributable, equal weights with ben-A, while standing in no
   * ṭabaqa the deed ever established.
   *
   * R6 closes it on both fields, so there is no third form to re-point to:
   *   · `lineageLink: null` (as written) ⇒ `LINEAGE_LINK_MISSING`;
   *   · add the link and `parentId: null` puts them at derived depth 1, which `tabaqa: null` then
   *     contradicts ⇒ `TABAQA_MISMATCHES_LINEAGE_DEPTH`.
   *
   * ⚠ **The claim in the test's name is not refuted — it has lost its subject.** `isTiered()` still
   * exempts an untiered member from the tier test, and invariant I5 still carries the matching
   * exemption; what changed is that only a `CHARITABLE_JIHA` can now BE untiered, and a jiha cannot
   * be in a ذري cohort at all (R6-D1, pinned by the next test). Enumerated in
   * `resolver.test.ts`'s "an untiered member BESIDE a tiered one has no legal cohort".
   */
  it('INVERTED: an untiered member (null ṭabaqa) is REFUSED in an ORDERED waqf, not paid half', () => {
    const asWritten = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          entitlementOrder: 'ORDERED',
          beneficiaries: [...cohort, untieredPlaceholder],
        }),
      'SHART_INCOMPLETE',
    );
    expect(asWritten.details).toMatchObject({
      refusal: 'LINEAGE_LINK_MISSING',
      beneficiaryId: 'ben-untiered',
    });

    // The second door: supply exactly what that refusal asks for and change nothing else.
    const withEdge = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          entitlementOrder: 'ORDERED',
          beneficiaries: [...cohort, { ...untieredPlaceholder, lineageLink: 'SON' }],
        }),
      'SHART_INCOMPLETE',
    );
    expect(withEdge.details).toMatchObject({
      refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH',
      beneficiaryId: 'ben-untiered',
    });
  });

  it('and the jiha version of that cohort is now REFUSED, not silently tolerated', () => {
    const jiha = beneficiary({
      ...untieredPlaceholder,
      id: 'ben-jiha',
      kind: 'CHARITABLE_JIHA',
      branch: 'Charitable',
      category: null,
    });
    const error = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          entitlementOrder: 'ORDERED',
          // R7 · `reversion: null` is what keeps this refusal firing, and it is stated rather than
          // inherited: the deed records no مآل, so R7-c forbids reading the charity as an ultimate
          // taker. With a clause naming it, the very same cohort is LEGAL — see the re-pointed AT-15
          // below, which is that input.
          reversion: null,
          beneficiaries: [...cohort, jiha],
        }),
      'SHART_INCOMPLETE',
    );
    expect(error.details).toMatchObject({ refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY' });
  });

  /**
   * ⚠⚠ **AT-15 RE-POINTED A THIRD TIME (R7-f) — AND THIS TIME THE SUBJECT COMES BACK RATHER THAN
   * MOVING ON.**
   *
   * The history, because each version was true of a different engine:
   *  (1) originally a `CHARITABLE_JIHA` beside the tiered family cohort — the natural subject, since a
   *      jiha is the archetypal untiered beneficiary;
   *  (2) ADR-0009 R5 refused that cohort (`COHORT_MIXES_CHARITABLE_AND_FAMILY`), so it was re-pointed at
   *      a `CATEGORY_ONLY` placeholder — the other untiered kind;
   *  (3) R6 + the ṭabaqa cross-check made an untiered placeholder unrepresentable on a ذري waqf too, and
   *      the claim was left with **no reachable subject on any money-moving order**. Invariant I5's
   *      untiered exemption and this acceptance test were both vacuous in the money path, and
   *      `jiha-tier-refusal.test.ts` §REACHABILITY measured that as a loss of coverage.
   *  (4) ✓ **R7 restores version (1)'s subject with one field added.** A ذري deed MAY hold a charitable
   *      jiha when it names that jiha as its ultimate taker (مآل الوقف), and such a jiha carries no
   *      `tabaqa` and no lineage edge — because it is not a descendant. So a cohort of TIERED
   *      descendants plus an UNTIERED taker is legal, computes, and is exactly the configuration
   *      `isTiered()`'s exemption and I5's exemption are about.
   *
   * **THE CLAIM, which is the reason AT-15 exists: an untiered member is NEVER TIER-EXCLUDED.** The
   * taker is excluded here — but on `REVERSION_PENDING_LIVING_BLOODLINE`, the reversion clause's own
   * reason, and NOT on `UPPER_TABAQA_EXTANT` or `TABAQA_EXTINCT`. A tier code on this line would be
   * S3-D3's defect returning by another door: the deed's charity judged by a generational rule it does
   * not stand in, and (measured, in S3) its whole share silently redistributed to the family.
   */
  it('AT-15 re-pointed · an untiered ULTIMATE TAKER beside tiered descendants is not tier-excluded', () => {
    const taker = beneficiary({
      ...untieredPlaceholder,
      id: 'ben-jiha',
      kind: 'CHARITABLE_JIHA',
      branch: 'Charitable',
      category: null,
      // Equal to ben-A's, so if the taker were wrongly entitled it would take half — the figure the
      // pre-R6 escape actually took, which keeps the two outcomes distinguishable by money alone.
      stipulatedWeight: '10',
    });
    const maal: DistributionInputRaw = {
      ...exampleA(),
      entitlementOrder: 'ORDERED',
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-jiha'] },
      beneficiaries: [...cohort, taker],
    };

    const result = runDistribution(maal);
    const reasons = new Map(result.lines.map((line) => [line.beneficiaryId, line.reasonCode]));

    // The tier verdicts on the FAMILY are unchanged — this cohort is AT-15's original one.
    expect(reasons.get('ben-B')).toBe('BENEFICIARY_INACTIVE');
    expect(reasons.get('ben-C')).toBe('UPPER_TABAQA_EXTANT');
    // ⚠ AND THE UNTIERED TAKER: excluded by the REVERSION, never by the tier rule.
    expect(reasons.get('ben-jiha')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    expect(reasons.get('ben-jiha')).not.toBe('UPPER_TABAQA_EXTANT');
    expect(reasons.get('ben-jiha')).not.toBe('TABAQA_EXTINCT');
    // The tiered/untiered mix really is present on the run — `isTiered()`'s discriminating subject.
    const tabaqat = new Map(result.lines.map((line) => [line.beneficiaryId, line.basis.tabaqa]));
    expect(tabaqat.get('ben-A')).toBe(1);
    expect(tabaqat.get('ben-jiha')).toBeNull();

    // ben-A alone is entitled ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0. NOT 13,750,000, which is
    // what the taker would have halved it to if it had escaped the ladder (the S3/ESC-1 figure).
    expect(lineOf(result, 'ben-A').entitledMinor).toBe(27_500_000n);
    expect(lineOf(result, 'ben-jiha').entitledMinor).toBe(0n);
    // I5 is asserted on this run, and now over a cohort where its untiered exemption is not vacuous.
    expect(result.invariantsChecked).toContain('I5');
    expect(result.invariantsChecked).toContain('I-R1');

    // …and once every ṭabaqa is extinct the taker takes the pool — by the REVERSION, on its own rule
    // label, not by inheriting an extinct tier's entitlement.
    const reverted = runDistribution({
      ...maal,
      beneficiaries: [
        member('ben-A', 1, false),
        member('ben-B', 1, false),
        member('ben-C', 2, false, 'ben-A'),
        taker,
      ],
    });
    expect(lineOf(reverted, 'ben-jiha').entitledMinor).toBe(27_500_000n);
    expect(lineOf(reverted, 'ben-jiha').basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    expect(reverted.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // The extinct tiers are reported as extinct, not as having passed anything down.
    for (const id of ['ben-A', 'ben-B', 'ben-C']) {
      expect(lineOf(reverted, id).reasonCode, id).toBe('TABAQA_EXTINCT');
    }
  });

  /**
   * ⚠⚠ **INVERTED with its companion above, input verbatim.** MEASURED before R6: with every tier
   * extinct, `ben-untiered` took the **whole 27,500,000 halalas** (SAR 275,000) while ben-A and
   * ben-C sat on the run as `EXCLUDED/TABAQA_EXTINCT` — the escape at its most expensive.
   *
   * The surviving half of the claim, and the one that still matters to a Nazir, is asserted instead:
   * with every tier extinct and NO untiered member representable, the run does not invent a
   * beneficiary. It entitles nobody, flags `NO_ELIGIBLE_BENEFICIARIES`, and retains the ghallah.
   */
  it('INVERTED: ORDERED with EVERY tier extinct entitles NOBODY — nothing inherits the pool', () => {
    const refused = expectDomainError(
      () =>
        runDistribution({
          ...exampleA(),
          entitlementOrder: 'ORDERED',
          beneficiaries: [
            member('ben-A', 1, false),
            member('ben-C', 2, false, 'ben-A'),
            untieredPlaceholder,
          ],
        }),
      'SHART_INCOMPLETE',
    );
    expect(refused.details).toMatchObject({ refusal: 'LINEAGE_LINK_MISSING' });

    const result = runDistribution({
      ...exampleA(),
      entitlementOrder: 'ORDERED',
      beneficiaries: [member('ben-A', 1, false), member('ben-C', 2, false, 'ben-A')],
    });
    expect(result.totals.entitledLineCount).toBe(0);
    expect(result.totals.retainedMinor).toBe(27_500_000n);
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    for (const id of ['ben-A', 'ben-C']) {
      expect(result.lines.find((line) => line.beneficiaryId === id)?.reasonCode).toBe(
        'TABAQA_EXTINCT',
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * AT-16 · the output shape a signature covers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('AT-16 · the result is complete, ordered, and free of PII', () => {
  const result = runDistribution(exampleDCharitable());

  it('emits exactly one line per input beneficiary, ascending by id', () => {
    expect(result.lines).toHaveLength(exampleDCharitable().beneficiaries.length);
    const ids = result.lines.map((line) => line.beneficiaryId);
    expect(ids).toStrictEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders sharePercent as a 6-dp decimal STRING, never a float', () => {
    for (const line of result.lines) {
      expect(typeof line.sharePercent).toBe('string');
      expect(line.sharePercent).toMatch(/^\d+\.\d{6}$/);
    }
  });

  it('lists the invariants ACTUALLY asserted, and never claims I8', () => {
    expect(result.invariantsChecked).toStrictEqual([
      'I1',
      'I2',
      'I3',
      'I4',
      'I5',
      'I6',
      'I7',
      'I9',
      'I-C1',
      // R7 · I-R1 IS asserted here, and Example D-خ is exactly the run that shows why its universal
      // mirror is not vacuous. This waqf records NO مآل clause — it is a خيري endowment paying three
      // charitable jihas — yet the mirror still makes a live claim about it: *no charitable line is
      // paid a halala in the same run as a line the engine certified as a descendant of the waqif.*
      // Three charities are paid, no descendant is, so the claim holds and the id is reported.
      //
      // ⚠ It is reported because it CLAIMS something, not because a clause exists. The mirror is what
      // would have caught ESC-1 — measured on this same waqf type under `ORDERED`, where an untiered
      // jiha took 13,750,000 of 27,500,000 halalas beside a living certified descendant — and it holds
      // whatever a future refusal is relaxed to. A run with no clause AND no charitable line has
      // nothing for I-R1 to say and does not report it (see `engine.test.ts`'s Example A cases).
      'I-R1',
    ]);
    // Determinism is a claim about two runs and cannot be asserted from one.
    expect(result.invariantsChecked).not.toContain('I8');
  });

  it('has no undefined anywhere — every absent value is an explicit null', () => {
    const serialized = JSON.stringify(result, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serialized).not.toContain('undefined');
    // A jiha's line legitimately carries `tabaqa: null`, and a PAID line `reasonCode: null` — as
    // KEYS, not as omissions, because an absent key and a null key serialize differently and the
    // result is canonicalized and hashed for the Nazir's signature.
    const jiha = result.lines.find((line) => line.beneficiaryId === 'ben-006');
    expect(jiha && 'reasonCode' in jiha).toBe(true);
    expect(jiha?.reasonCode).toBeNull();
    expect(jiha?.basis.tabaqa).toBeNull();
  });

  it('carries no beneficiary NAME on the hashed surface — the input has no such field', () => {
    const serialized = canonicalizeResult(result);
    expect(serialized).not.toContain('Al-Rashidi');
    expect(serialized).not.toContain('Example Charitable Jiha');
    // Ids only, in the trace too.
    expect(JSON.stringify(result.computationTrace)).not.toContain('Al-Rashidi');
  });

  it('keeps PII out of DomainError.details as well', () => {
    const error = expectDomainError(
      () => runDistribution({ ...exampleA(), entitlementOrder: 'MURATTAB' }),
      'SHART_INCOMPLETE',
    );
    expect(JSON.stringify(error.details)).not.toContain('Al-Rashidi');
  });
});
