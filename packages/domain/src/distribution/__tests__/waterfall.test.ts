/**
 * `distribution/waterfall.test.ts` — Stage 1: the ghallah waterfall and the corpus guard.
 *
 * What this suite is FOR, so a later reader does not weaken it by accident:
 *
 * 1. **I1 conservation is a TAUTOLOGY at runtime, so the tests must not restate it.**
 *    `computeWaterfall` derives `distributableMinor` AS the remainder, so
 *    `revenue == reserve + operating + fee + distributable` cannot fail unless the code is mis-typed.
 *    Every worked example is therefore checked TERM BY TERM against an INDEPENDENT recomputation of
 *    each deduction from its own basis (`percentOf(fromMinor(revenue), rate)`, the FIXED amount,
 *    `max(0, target − current)`). That is the check that catches §08's `0.10`-vs-`'10'` defect — a
 *    100× underpayment of the Nazir fee that leaves conservation perfectly intact.
 * 2. **The corpus guard is proven by REFUSALS, not by a comment near a call site.** Each of the
 *    guard's three refusal codes is driven independently, in the state that produces it, including
 *    the ordering that makes a bare income total say `RECEIPT_UNCLASSIFIED` rather than
 *    `CORPUS_NOT_DISTRIBUTABLE`.
 * 3. **The rounding DIRECTION is pinned with a discriminating case.** A percentage deduction whose
 *    exact value falls below the half-halala is asserted at the half-up figure, with the ceiling
 *    figure named in the assertion, so a silent switch to a "conservative" ceiling rule fails here
 *    instead of shifting a real statement by a halala.
 * 4. **`DISTRIBUTION_NEGATIVE` is proven to fire at the RIGHT step.** The two throws are told apart
 *    by their `details` keys, because a fee computed on a negative net income would produce a
 *    negative fee that partially "restores" a plausible-looking distributable.
 */

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import { fromMinor, percentOf, toMinor } from '../../money.js';
import {
  MAINTENANCE_RULE_KINDS,
  minorOf,
  parseDistributionInput,
  revenueInputSchema,
  type DistributionInput,
  type DistributionInputRaw,
  type MaintenanceRule,
  type NazirFee,
  type RevenueInput,
  type RunFlag,
  type Waterfall,
} from '../contract.js';
import {
  assertIncomeProvenance,
  computeMaintenanceReserve,
  computeNazirFee,
  computeWaterfall,
  type WaterfallOutcome,
} from '../waterfall.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Vitest's default `testTimeout` is 5 s. This suite's fast-check properties finish in well under a
 * second in isolation, but that is not the environment CI runs them in: measured under a full
 * `turbo run test` (nine packages' suites executing concurrently), the 2 000-run split property
 * took **5 064 ms and FAILED ON THE CLOCK, not on an assertion** — an ~11× slowdown from pure
 * contention. A 2-core GitHub runner is slower still, so the default is a latent red build, not a
 * theoretical risk.
 *
 * File-scoped, and the same budget and rationale as `distribution.property.test.ts`: generous enough
 * that contention cannot fail it, tight enough that a genuine performance regression (an accidental
 * O(n²) in the allocator, a `Decimal` blowup on 18-dp weights) still does.
 */
vi.setConfig({ testTimeout: 60_000 });

/** Assert a thrown value is a `DomainError` with an exact code, and return it for further checks. */
function expectDomainCode(run: () => unknown, code: string): DomainError {
  let caught: unknown;
  let returned: unknown;
  try {
    returned = run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected a DomainError with code ${code}, got ${
        caught === undefined
          ? `no throw (returned ${JSON.stringify(String(returned))})`
          : String(caught)
      }`,
    );
  }
  expect(caught.code).toBe(code);
  return caught;
}

/** `details` as a plain record, so a test can read the keys the throw site chose to expose. */
function detailsOf(error: DomainError): Record<string, unknown> {
  return (error.details ?? {}) as Record<string, unknown>;
}

const ASOF_GREGORIAN = '2026-07-14';
const ASOF_HIJRI = toHijri(civilDate(ASOF_GREGORIAN));

type RawReceipt = DistributionInputRaw['revenue']['receipts'][number];

interface WaterfallParts {
  readonly receipts?: readonly RawReceipt[];
  /** Defaults to Σ INCOME over `receipts`, i.e. the state the corpus guard accepts. */
  readonly incomeMinor?: bigint;
  readonly operatingCostMinor?: bigint;
  readonly maintenance?: DistributionInputRaw['maintenance'];
  readonly nazirFee?: DistributionInputRaw['nazirFee'];
  readonly entitlementOrder?: string;
  readonly beneficiaries?: DistributionInputRaw['beneficiaries'];
}

function income(id: string, amountMinor: bigint): RawReceipt {
  return { id, receiptClass: 'INCOME', amountMinor };
}

function capital(
  id: string,
  amountMinor: bigint,
  capitalSource: NonNullable<RawReceipt['capitalSource']> = 'ISTIBDAL_PROCEEDS',
): RawReceipt {
  return { id, receiptClass: 'CAPITAL', amountMinor, capitalSource };
}

function sumIncome(receipts: readonly RawReceipt[]): bigint {
  return receipts.reduce(
    (total, receipt) => (receipt.receiptClass === 'INCOME' ? total + receipt.amountMinor : total),
    0n,
  );
}

/**
 * A raw input whose non-waterfall fields are the smallest thing that parses. The waterfall reads
 * exactly five of them (`revenue`, `operatingCostMinor`, `maintenance`, `nazirFee` — and nothing
 * else), which is itself asserted below.
 */
function rawFor(parts: WaterfallParts = {}): DistributionInputRaw {
  const receipts = parts.receipts ?? [income('rev-001', 35_000_000n)];
  return {
    waqfId: 'waqf-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: parts.entitlementOrder ?? 'ORDERED',
    continuationStipulation: null,
    // R7 · no مآل clause. The waterfall runs above the cohort entirely, so the reversion cannot reach
    // it — but the field is required, and stating it null says that rather than defaulting into it.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: parts.incomeMinor ?? sumIncome(receipts),
      receipts: [...receipts],
    },
    operatingCostMinor: parts.operatingCostMinor ?? 0n,
    maintenance: parts.maintenance ?? { kind: 'NONE' },
    nazirFee:
      parts.nazirFee === undefined
        ? { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' }
        : parts.nazirFee,
    beneficiaries: parts.beneficiaries ?? [
      {
        id: 'ben-001',
        kind: 'FAMILY',
        active: true,
        tabaqa: 1,
        parentId: null,
        lineageLink: 'SON',
        line: 'ZUHUR',
        branch: 'Branch A',
        stipulatedWeight: '12.5',
        verificationStatus: 'VERIFIED',
        kycLastRefreshed: '2026-01-15',
        category: null,
        residency: 'DOMESTIC',
        disbursingEntity: null,
        bankingRefForProceeds: 'FAKE-ACCT-W1',
      },
    ],
    asOf: { gregorian: ASOF_GREGORIAN, hijri: ASOF_HIJRI },
    deadline: {
      gregorian: '2027-03-31',
      hijri: '1448-10-22',
      settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
      months: 3,
      unverified: true,
    },
    policy: {
      kycRefreshMonths: 12,
      roundingUnitMinor: 1n,
      roundingMethod: 'LARGEST_REMAINDER_HALF_UP',
      bindingCalendar: 'EARLIER_OF',
      unverifiedNote: '⚠ unverified — confirm vs primary law',
    },
  };
}

function parsed(parts: WaterfallParts = {}): DistributionInput {
  return parseDistributionInput(rawFor(parts));
}

function waterfallOf(parts: WaterfallParts = {}): Waterfall {
  return computeWaterfall(parsed(parts)).waterfall;
}

function revenueOf(incomeMinor: bigint, receipts: readonly RawReceipt[]): RevenueInput {
  return revenueInputSchema.parse({ incomeMinor, receipts: [...receipts] });
}

/** The INDEPENDENT recomputation of a percentage deduction, straight off the money engine. */
function independentPercent(baseMinor: bigint, ratePercent: string): bigint {
  return toMinor(percentOf(fromMinor(baseMinor), ratePercent));
}

/** The INDEPENDENT recomputation of a reserve from its rule — never from the engine's own answer. */
function independentReserve(revenueMinor: bigint, rule: MaintenanceRule): bigint {
  switch (rule.kind) {
    case 'FIXED':
      return rule.amountMinor;
    case 'PERCENT':
      return independentPercent(revenueMinor, rule.ratePercent);
    case 'TARGET_TOPUP': {
      const shortfall = rule.targetBalanceMinor - rule.currentBalanceMinor;
      return shortfall > 0n ? shortfall : 0n;
    }
    case 'NONE':
      return 0n;
    // OQ-06. Same arithmetic as PERCENT, different AUTHORITY — recomputed here independently
    // rather than delegating to the PERCENT arm, so a divergence between the founder's percentage
    // and the Nazir's discretionary one would show up as a failure instead of being shared away.
    case 'NAZIR_DISCRETION_PERCENT':
      return independentPercent(revenueMinor, rule.ratePercent);
    case 'UNSET':
      return 0n;
  }
}

/** The INDEPENDENT recomputation of the fee from its basis. */
function independentFee(
  revenueMinor: bigint,
  netIncomeMinor: bigint,
  fee: NazirFee | null,
): bigint {
  if (fee === null) return 0n;
  switch (fee.basis) {
    case 'PERCENT_OF_REVENUE':
      return independentPercent(revenueMinor, fee.ratePercent);
    case 'PERCENT_OF_NET_INCOME':
      return independentPercent(netIncomeMinor, fee.ratePercent);
    case 'RETAINER':
      return fee.fixedAmountMinor;
  }
}

/**
 * The check that actually bites: each deduction recomputed from its own basis, term by term, then
 * conservation. Conservation alone is a tautology (see the file header).
 */
function expectTermByTermAgreement(input: DistributionInput, waterfall: Waterfall): void {
  const expectedReserve = independentReserve(waterfall.revenueMinor, input.maintenance);
  expect(waterfall.maintenanceReserveMinor).toBe(minorOf(expectedReserve));
  expect(waterfall.operatingCostMinor).toBe(input.operatingCostMinor);

  const expectedNet = waterfall.revenueMinor - expectedReserve - input.operatingCostMinor;
  expect(waterfall.netIncomeMinor).toBe(minorOf(expectedNet));

  const expectedFee = independentFee(waterfall.revenueMinor, expectedNet, input.nazirFee);
  expect(waterfall.nazirFeeMinor).toBe(minorOf(expectedFee));
  expect(waterfall.distributableMinor).toBe(minorOf(expectedNet - expectedFee));

  // I1, both halves, in exact bigint.
  expect(
    waterfall.maintenanceReserveMinor +
      waterfall.operatingCostMinor +
      waterfall.nazirFeeMinor +
      waterfall.distributableMinor,
  ).toBe(waterfall.revenueMinor);
  expect(waterfall.netIncomeMinor).toBe(
    minorOf(
      waterfall.revenueMinor - waterfall.maintenanceReserveMinor - waterfall.operatingCostMinor,
    ),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The corpus guard (D1 · CLAUDE.md binding rule 1 · invariant I-C1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertIncomeProvenance — the corpus guard', () => {
  it('separates income (ghallah) from capital (asl) and names the excluded corpus receipts', () => {
    const provenance = assertIncomeProvenance(
      revenueOf(180_000_000n, [
        income('rev-002', 180_000_000n),
        capital('cap-001', 2_000_000_000n, 'ISTIBDAL_PROCEEDS'),
        capital('cap-002', 500n, 'SALE_PROCEEDS'),
      ]),
    );

    expect(provenance.incomeMinor).toBe(minorOf(180_000_000n));
    expect(provenance.capitalReceiptsMinor).toBe(minorOf(2_000_000_500n));
    // Input order, so an auditor can line the ids up against the ledger.
    expect(provenance.capitalReceiptIds).toStrictEqual(['cap-001', 'cap-002']);
  });

  it('accepts a genuinely nil period (no receipts, no declared income)', () => {
    const provenance = assertIncomeProvenance(revenueOf(0n, []));
    expect(provenance.incomeMinor).toBe(minorOf(0n));
    expect(provenance.capitalReceiptsMinor).toBe(minorOf(0n));
    expect(provenance.capitalReceiptIds).toStrictEqual([]);
  });

  it('accepts a corpus-only period: istibdal proceeds arrive, nothing is distributable', () => {
    const provenance = assertIncomeProvenance(
      revenueOf(0n, [capital('cap-001', 2_000_000_000n, 'ISTIBDAL_PROCEEDS')]),
    );
    expect(provenance.incomeMinor).toBe(minorOf(0n));
    expect(provenance.capitalReceiptsMinor).toBe(minorOf(2_000_000_000n));
  });

  it('AT-11 · REFUSES a caller with no receipt breakdown (RECEIPT_UNCLASSIFIED, not a corpus verdict)', () => {
    const error = expectDomainCode(
      () => assertIncomeProvenance(revenueOf(35_000_000n, [])),
      'RECEIPT_UNCLASSIFIED',
    );
    // The ordering is the point: Σ INCOME is 0 here, so a naive sum-comparison first would have
    // said CORPUS_NOT_DISTRIBUTABLE and mis-described a missing breakdown as a corpus breach.
    expect(detailsOf(error).receiptCount).toBe(0);
  });

  it.each([
    ['an empty class', ''],
    ['the lower-case spelling', 'income'],
    ['a title-case spelling', 'Income'],
    ['a padded spelling', 'CAPITAL '],
    ['an invented class', 'REVENUE'],
  ])(
    'AT-11 · REFUSES %s — the vocabulary is closed and case-significant',
    (_label, receiptClass) => {
      expectDomainCode(
        () =>
          assertIncomeProvenance(
            revenueOf(1_000n, [{ id: 'rev-x', receiptClass, amountMinor: 1_000n }]),
          ),
        'RECEIPT_UNCLASSIFIED',
      );
    },
  );

  it('AT-11 · REFUSES a CAPITAL receipt that names no capitalSource', () => {
    const error = expectDomainCode(
      () =>
        assertIncomeProvenance(
          revenueOf(0n, [
            { id: 'cap-001', receiptClass: 'CAPITAL', amountMinor: 5n, capitalSource: null },
          ]),
        ),
      'RECEIPT_UNCLASSIFIED',
    );
    expect(detailsOf(error).receiptId).toBe('cap-001');
  });

  it('REFUSES an INCOME receipt that names a capitalSource — corpus proceeds filed as ghallah', () => {
    const error = expectDomainCode(
      () =>
        assertIncomeProvenance(
          revenueOf(5n, [
            {
              id: 'rev-001',
              receiptClass: 'INCOME',
              amountMinor: 5n,
              capitalSource: 'ISTIBDAL_PROCEEDS',
            },
          ]),
        ),
      'RECEIPT_UNCLASSIFIED',
    );
    expect(detailsOf(error).capitalSource).toBe('ISTIBDAL_PROCEEDS');
  });

  it('AT-11 · REFUSES declared income ABOVE the INCOME receipts as CORPUS_NOT_DISTRIBUTABLE', () => {
    const error = expectDomainCode(
      () => assertIncomeProvenance(revenueOf(35_000_001n, [income('rev-001', 35_000_000n)])),
      'CORPUS_NOT_DISTRIBUTABLE',
    );
    expect(detailsOf(error).declaredIncomeMinor).toBe('35000001');
    expect(detailsOf(error).classifiedIncomeMinor).toBe('35000000');
  });

  it('REFUSES declared income backed only by CAPITAL receipts (a breakdown exists — so it is a corpus verdict)', () => {
    expectDomainCode(
      () => assertIncomeProvenance(revenueOf(2_000_000_000n, [capital('cap-001', 2_000_000_000n)])),
      'CORPUS_NOT_DISTRIBUTABLE',
    );
  });

  it('AT-11 · REFUSES declared income BELOW the INCOME receipts as DISTRIBUTION_INPUT_INVALID', () => {
    // ⚠ The brief's I-C1 prose maps this state to RECEIPT_UNCLASSIFIED; AT-11 maps it here, and
    // AT-11 is right — the receipts ARE classified, the two figures simply disagree.
    expectDomainCode(
      () => assertIncomeProvenance(revenueOf(34_999_999n, [income('rev-001', 35_000_000n)])),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('AT-12 · a CAPITAL receipt of any size moves no figure below revenue', () => {
    const receipts = [income('rev-001', 35_000_000n)];
    const withoutCorpus = waterfallOf({ receipts });
    const withCorpus = waterfallOf({
      receipts: [...receipts, capital('cap-001', 2_000_000_000n, 'ISTIBDAL_PROCEEDS')],
      incomeMinor: 35_000_000n,
    });

    expect(withCorpus.capitalReceiptsMinor).toBe(minorOf(2_000_000_000n));
    expect(withoutCorpus.capitalReceiptsMinor).toBe(minorOf(0n));
    // Everything else is byte-identical — istibdal proceeds move no halala of a distribution.
    expect({ ...withCorpus, capitalReceiptsMinor: minorOf(0n) }).toStrictEqual({
      ...withoutCorpus,
    });
  });

  it('flags CAPITAL_RECEIPTS_EXCLUDED on the PRESENCE of a corpus receipt, even a zero-halala one', () => {
    const zeroCorpus = computeWaterfall(
      parsed({ receipts: [income('rev-001', 100n), capital('cap-001', 0n)], incomeMinor: 100n }),
    );
    expect(zeroCorpus.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(zeroCorpus.waterfall.capitalReceiptsMinor).toBe(minorOf(0n));

    const noCorpus = computeWaterfall(parsed({ receipts: [income('rev-001', 100n)] }));
    expect(noCorpus.flags).not.toContain('CAPITAL_RECEIPTS_EXCLUDED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Step 1 · the ṣiyāna (صيانة) reserve
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('computeMaintenanceReserve — ṣiyāna, reserved first', () => {
  it('FIXED returns the stipulated amount verbatim, whatever the revenue', () => {
    expect(
      computeMaintenanceReserve(minorOf(35_000_000n), {
        kind: 'FIXED',
        amountMinor: minorOf(4_000_000n),
      }),
    ).toBe(minorOf(4_000_000n));
    expect(
      computeMaintenanceReserve(minorOf(99n), { kind: 'FIXED', amountMinor: minorOf(4_000_000n) }),
    ).toBe(minorOf(4_000_000n));
  });

  it('PERCENT takes the rate OUT OF 100 (Example B: 5% of 200,000.00 = 10,000.00)', () => {
    expect(
      computeMaintenanceReserve(minorOf(20_000_000n), { kind: 'PERCENT', ratePercent: '5' }),
    ).toBe(minorOf(1_000_000n));
    expect(
      computeMaintenanceReserve(minorOf(20_000_000n), { kind: 'PERCENT', ratePercent: '0' }),
    ).toBe(minorOf(0n));
    expect(
      computeMaintenanceReserve(minorOf(20_000_000n), { kind: 'PERCENT', ratePercent: '100' }),
    ).toBe(minorOf(20_000_000n));
  });

  it('pins the ROUNDING DIRECTION on a percentage reserve: half-up, not ceiling', () => {
    // 5% of SAR 1,234.44 is exactly 61.7220 → half-up 61.72 (6172 halalas).
    // A ceiling rule would answer 61.73 (6173). Asserting 6172 is what makes a silent switch to a
    // "conservative" ceiling fail here rather than shifting a real ṣiyāna reserve by a halala.
    expect(
      computeMaintenanceReserve(minorOf(123_444n), { kind: 'PERCENT', ratePercent: '5' }),
    ).toBe(minorOf(6_172n));
    // And a value genuinely above the half-halala still rounds up: 5% of 1,234.57 = 61.7285 → 61.73.
    expect(
      computeMaintenanceReserve(minorOf(123_457n), { kind: 'PERCENT', ratePercent: '5' }),
    ).toBe(minorOf(6_173n));
  });

  it('TARGET_TOPUP tops up the shortfall and CLAMPS AT ZERO when the reserve is already at target', () => {
    const rule = (target: bigint, current: bigint): MaintenanceRule => ({
      kind: 'TARGET_TOPUP',
      targetBalanceMinor: minorOf(target),
      currentBalanceMinor: minorOf(current),
    });
    expect(computeMaintenanceReserve(minorOf(50_000n), rule(10_000n, 4_000n))).toBe(
      minorOf(6_000n),
    );
    expect(computeMaintenanceReserve(minorOf(50_000n), rule(10_000n, 10_000n))).toBe(minorOf(0n));
    // Over-funded: a negative top-up would INFLATE distributable, so it is clamped, never applied.
    expect(computeMaintenanceReserve(minorOf(50_000n), rule(4_000n, 10_000n))).toBe(minorOf(0n));
  });

  it('NONE reserves nothing', () => {
    expect(computeMaintenanceReserve(minorOf(35_000_000n), { kind: 'NONE' })).toBe(minorOf(0n));
  });

  /* ── OQ-06 · the Nazir's discretion, and the absence of one ───────────────────────────── */

  it('NAZIR_DISCRETION_PERCENT computes the reserve the Nazir recorded, on the same arithmetic as the founder percentage', () => {
    // The point of the assertion is that the two kinds AGREE numerically while staying distinct
    // records. If they ever diverge, one of the two percentages is being computed wrongly.
    const founder = computeMaintenanceReserve(minorOf(20_000_000n), {
      kind: 'PERCENT',
      ratePercent: '5',
    });
    const trustee = computeMaintenanceReserve(minorOf(20_000_000n), {
      kind: 'NAZIR_DISCRETION_PERCENT',
      ratePercent: '5',
    });
    expect(trustee).toBe(minorOf(1_000_000n));
    expect(trustee).toBe(founder);
  });

  it('NAZIR_DISCRETION_PERCENT at "0" reserves nothing — a RECORDED zero', () => {
    expect(
      computeMaintenanceReserve(minorOf(35_000_000n), {
        kind: 'NAZIR_DISCRETION_PERCENT',
        ratePercent: '0',
      }),
    ).toBe(minorOf(0n));
  });

  it('UNSET reserves nothing — and the amount alone does NOT distinguish it from NONE', () => {
    // Recorded deliberately as an assertion rather than a comment: the amounts are identical, and
    // that is exactly why the DIFFERENCE has to live in the run flag (see runWaterfall's suite).
    // A reader who assumed the number carried the distinction would be wrong, so the test says so.
    expect(computeMaintenanceReserve(minorOf(35_000_000n), { kind: 'UNSET' })).toBe(minorOf(0n));
    expect(computeMaintenanceReserve(minorOf(35_000_000n), { kind: 'NONE' })).toBe(minorOf(0n));
  });

  it('covers every declared maintenance kind (so a new kind cannot ship untested)', () => {
    const rules: Record<(typeof MAINTENANCE_RULE_KINDS)[number], MaintenanceRule> = {
      FIXED: { kind: 'FIXED', amountMinor: minorOf(1n) },
      PERCENT: { kind: 'PERCENT', ratePercent: '1' },
      TARGET_TOPUP: {
        kind: 'TARGET_TOPUP',
        targetBalanceMinor: minorOf(2n),
        currentBalanceMinor: minorOf(1n),
      },
      NONE: { kind: 'NONE' },
      NAZIR_DISCRETION_PERCENT: { kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: '1' },
      UNSET: { kind: 'UNSET' },
    };
    for (const kind of MAINTENANCE_RULE_KINDS) {
      expect(computeMaintenanceReserve(minorOf(1_000n), rules[kind])).toBeGreaterThanOrEqual(0n);
    }
  });

  it('refuses a negative revenue base rather than computing a reserve from it', () => {
    expectDomainCode(
      () => computeMaintenanceReserve(minorOf(-1n), { kind: 'PERCENT', ratePercent: '5' }),
      'DISTRIBUTION_NEGATIVE',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Step 3 · the Nazir fee (ʿushr / عُشر) — set by the DEED, not by statute
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('computeNazirFee — basis and position are independent', () => {
  it('PERCENT_OF_REVENUE at "10" is TEN percent, not a tenth of a percent', () => {
    // §08's `0.10` fed into `percentOf` (which divides by 100) computes 0.1% — a 100×
    // UNDERPAYMENT that is arithmetically valid and invisible in every conservation check.
    // Both figures are asserted so the two spellings can never be confused for one another.
    const tenPercent = computeNazirFee({
      revenueMinor: minorOf(10_000_000n),
      netIncomeMinor: minorOf(10_000_000n),
      fee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    });
    expect(tenPercent.nazirFeeMinor).toBe(minorOf(1_000_000n));

    const tenthOfAPercent = computeNazirFee({
      revenueMinor: minorOf(10_000_000n),
      netIncomeMinor: minorOf(10_000_000n),
      fee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '0.10' },
    });
    expect(tenthOfAPercent.nazirFeeMinor).toBe(minorOf(10_000n));
    expect(tenthOfAPercent.nazirFeeMinor).not.toBe(tenPercent.nazirFeeMinor);
  });

  it('AT-01 · PERCENT_OF_NET_INCOME reads NET, not revenue', () => {
    const outcome = computeNazirFee({
      revenueMinor: minorOf(10_000_000n),
      netIncomeMinor: minorOf(8_500_000n),
      fee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    });
    expect(outcome.nazirFeeMinor).toBe(minorOf(850_000n));
    expect(outcome.basis).toBe('PERCENT_OF_NET_INCOME');
    expect(outcome.flags).toStrictEqual([]);

    // Varying the base it does NOT read changes nothing.
    const otherRevenue = computeNazirFee({
      revenueMinor: minorOf(999_999_999n),
      netIncomeMinor: minorOf(8_500_000n),
      fee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    });
    expect(otherRevenue.nazirFeeMinor).toBe(minorOf(850_000n));
  });

  it('PERCENT_OF_REVENUE does not read net income', () => {
    const a = computeNazirFee({
      revenueMinor: minorOf(35_000_000n),
      netIncomeMinor: minorOf(31_000_000n),
      fee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    });
    const b = computeNazirFee({
      revenueMinor: minorOf(35_000_000n),
      netIncomeMinor: minorOf(0n),
      fee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    });
    expect(a.nazirFeeMinor).toBe(minorOf(3_500_000n));
    expect(b.nazirFeeMinor).toBe(a.nazirFeeMinor);
  });

  it('RETAINER is period-independent and reads neither base', () => {
    const outcome = computeNazirFee({
      revenueMinor: minorOf(0n),
      netIncomeMinor: minorOf(0n),
      fee: { basis: 'RETAINER', fixedAmountMinor: minorOf(750_000n) },
    });
    expect(outcome.nazirFeeMinor).toBe(minorOf(750_000n));
    expect(outcome.basis).toBe('RETAINER');
  });

  it('AT-02 · a deed silent on the fee yields ZERO plus AUTHORITY_FEE_DETERMINATION_PENDING', () => {
    const outcome = computeNazirFee({
      revenueMinor: minorOf(35_000_000n),
      netIncomeMinor: minorOf(31_000_000n),
      fee: null,
    });
    expect(outcome.nazirFeeMinor).toBe(minorOf(0n));
    expect(outcome.basis).toBeNull();
    // The flag is the record that step 3 is HELD, not that the fee is genuinely nil — a silently
    // zero-fee run must be impossible to produce.
    expect(outcome.flags).toStrictEqual<RunFlag[]>(['AUTHORITY_FEE_DETERMINATION_PENDING']);
  });

  it('REFUSES a negative net-income base rather than returning a negative fee (a credit)', () => {
    expectDomainCode(
      () =>
        computeNazirFee({
          revenueMinor: minorOf(1_000_000n),
          netIncomeMinor: minorOf(-2_000_000n),
          fee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
        }),
      'DISTRIBUTION_NEGATIVE',
    );
  });

  it('REFUSES a negative revenue base for a PERCENT_OF_REVENUE fee', () => {
    expectDomainCode(
      () =>
        computeNazirFee({
          revenueMinor: minorOf(-1n),
          netIncomeMinor: minorOf(0n),
          fee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
        }),
      'DISTRIBUTION_NEGATIVE',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The whole waterfall — the worked examples, term by term
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('computeWaterfall — the worked examples', () => {
  it('Example A · ORDERED, medium family_dhurri (waqf-001)', () => {
    const input = parsed({
      receipts: [income('rev-001', 35_000_000n)],
      maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
      operatingCostMinor: 0n,
      nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    });
    const { waterfall, flags } = computeWaterfall(input);

    expect(waterfall).toStrictEqual<Waterfall>({
      revenueMinor: minorOf(35_000_000n),
      capitalReceiptsMinor: minorOf(0n),
      maintenanceReserveMinor: minorOf(4_000_000n),
      operatingCostMinor: minorOf(0n),
      netIncomeMinor: minorOf(31_000_000n),
      nazirFeeMinor: minorOf(3_500_000n),
      nazirFeeBasis: 'PERCENT_OF_REVENUE',
      distributableMinor: minorOf(27_500_000n),
    });
    expect(flags).toStrictEqual([]);
    expectTermByTermAgreement(input, waterfall);
  });

  it('AT-01 · fee on NET income, still deducted at step 3', () => {
    const input = parsed({
      receipts: [income('rev-001', 10_000_000n)],
      maintenance: { kind: 'FIXED', amountMinor: 1_000_000n },
      operatingCostMinor: 500_000n,
      nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    });
    const { waterfall } = computeWaterfall(input);

    expect(waterfall.netIncomeMinor).toBe(minorOf(8_500_000n));
    expect(waterfall.nazirFeeMinor).toBe(minorOf(850_000n));
    expect(waterfall.nazirFeeBasis).toBe('PERCENT_OF_NET_INCOME');
    expect(waterfall.distributableMinor).toBe(minorOf(7_650_000n));
    // Position, not basis: the fee did NOT reduce the base the reserve was taken from.
    expect(waterfall.maintenanceReserveMinor).toBe(minorOf(1_000_000n));
    expectTermByTermAgreement(input, waterfall);
  });

  it('Example B · SHARED, small family_dhurri (waqf-002) — a PERCENT reserve', () => {
    const input = parsed({
      receipts: [income('rev-003', 20_000_000n)],
      maintenance: { kind: 'PERCENT', ratePercent: '5' },
      nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    });
    const { waterfall } = computeWaterfall(input);

    expect(waterfall.maintenanceReserveMinor).toBe(minorOf(1_000_000n));
    expect(waterfall.netIncomeMinor).toBe(minorOf(19_000_000n));
    expect(waterfall.nazirFeeMinor).toBe(minorOf(2_000_000n));
    expect(waterfall.distributableMinor).toBe(minorOf(17_000_000n));
    expectTermByTermAgreement(input, waterfall);
  });

  it('Example C · nil period (waqf-004) — a valid zero run, no flags of ours', () => {
    const input = parsed({ receipts: [], incomeMinor: 0n, maintenance: { kind: 'NONE' } });
    const { waterfall, flags } = computeWaterfall(input);

    expect(waterfall).toStrictEqual<Waterfall>({
      revenueMinor: minorOf(0n),
      capitalReceiptsMinor: minorOf(0n),
      maintenanceReserveMinor: minorOf(0n),
      operatingCostMinor: minorOf(0n),
      netIncomeMinor: minorOf(0n),
      nazirFeeMinor: minorOf(0n),
      nazirFeeBasis: 'PERCENT_OF_REVENUE',
      distributableMinor: minorOf(0n),
    });
    // NIL_DISTRIBUTION belongs to the engine's short-circuit, not to Stage 1.
    expect(flags).toStrictEqual([]);
  });

  it('Example C2 · DIRECT-USE **with** period revenue — the waterfall still computes', () => {
    const input = parsed({
      receipts: [income('rev-005', 10_000_000n)],
      maintenance: { kind: 'NONE' },
      nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
      entitlementOrder: 'NA_DIRECT_USE',
    });
    const { waterfall } = computeWaterfall(input);

    expect(waterfall.netIncomeMinor).toBe(minorOf(10_000_000n));
    expect(waterfall.nazirFeeMinor).toBe(minorOf(1_000_000n));
    expect(waterfall.distributableMinor).toBe(minorOf(9_000_000n));
  });

  it('Example D · JOINT, large (waqf-003) — the fee is 10% of REVENUE, never of the corpus', () => {
    const input = parsed({
      receipts: [
        income('rev-002', 180_000_000n),
        capital('cap-001', 2_000_000_000n, 'EXPROPRIATION_COMPENSATION'),
      ],
      incomeMinor: 180_000_000n,
      maintenance: { kind: 'FIXED', amountMinor: 10_000_000n },
      operatingCostMinor: 12_000_000n,
      nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    });
    const { waterfall, flags } = computeWaterfall(input);

    expect(waterfall.revenueMinor).toBe(minorOf(180_000_000n));
    expect(waterfall.capitalReceiptsMinor).toBe(minorOf(2_000_000_000n));
    expect(waterfall.netIncomeMinor).toBe(minorOf(158_000_000n));
    expect(waterfall.nazirFeeMinor).toBe(minorOf(18_000_000n));
    // 10% of (revenue + corpus) would have been 218,000,000 halalas — the corpus leak this asserts against.
    expect(waterfall.nazirFeeMinor).not.toBe(minorOf(218_000_000n));
    expect(waterfall.distributableMinor).toBe(minorOf(140_000_000n));
    expect(flags).toStrictEqual<RunFlag[]>(['CAPITAL_RECEIPTS_EXCLUDED']);
    expectTermByTermAgreement(input, waterfall);
  });

  it('Example F · residual prover, deed silent on the fee', () => {
    const input = parsed({
      receipts: [income('rev-f', 10_000n)],
      maintenance: { kind: 'NONE' },
      nazirFee: null,
    });
    const { waterfall, flags } = computeWaterfall(input);

    expect(waterfall.nazirFeeMinor).toBe(minorOf(0n));
    expect(waterfall.nazirFeeBasis).toBeNull();
    expect(waterfall.distributableMinor).toBe(minorOf(10_000n));
    expect(flags).toStrictEqual<RunFlag[]>(['AUTHORITY_FEE_DETERMINATION_PENDING']);
  });

  it('reads only the five waterfall fields — beneficiaries and the Shart order move nothing', () => {
    const base = waterfallOf({ receipts: [income('rev-001', 35_000_000n)] });
    const variedOrder = waterfallOf({
      receipts: [income('rev-001', 35_000_000n)],
      entitlementOrder: 'SHARED',
    });
    const variedCohort = waterfallOf({
      receipts: [income('rev-001', 35_000_000n)],
      beneficiaries: [],
    });
    expect(variedOrder).toStrictEqual(base);
    expect(variedCohort).toStrictEqual(base);
  });

  it('does not mutate its input, and returns a frozen waterfall', () => {
    const input = parsed({
      receipts: [income('rev-001', 35_000_000n), capital('cap-001', 7n)],
      incomeMinor: 35_000_000n,
    });
    const before = input.revenue.receipts.map(
      (receipt) => `${receipt.id}:${receipt.receiptClass}:${receipt.amountMinor.toString()}`,
    );
    const { waterfall } = computeWaterfall(input);
    const after = input.revenue.receipts.map(
      (receipt) => `${receipt.id}:${receipt.receiptClass}:${receipt.amountMinor.toString()}`,
    );

    expect(after).toStrictEqual(before);
    expect(Object.isFrozen(waterfall)).toBe(true);
  });

  it('is deterministic: the same input twice gives the same outcome, trace included', () => {
    const input = parsed({
      receipts: [income('rev-001', 35_000_000n), capital('cap-001', 1_234n)],
      incomeMinor: 35_000_000n,
      maintenance: { kind: 'PERCENT', ratePercent: '7.5' },
      operatingCostMinor: 123n,
    });
    expect(computeWaterfall(input)).toStrictEqual(computeWaterfall(input));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 I4 · no negative run, and the throw fires at the RIGHT step
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('computeWaterfall — DISTRIBUTION_NEGATIVE (I4)', () => {
  it('AT-05 · insufficient revenue: no result is returned, not even a partial one', () => {
    const error = expectDomainCode(
      () =>
        computeWaterfall(
          parsed({
            receipts: [income('rev-001', 5_000_000n)],
            maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
            operatingCostMinor: 1_000_000n,
            nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
          }),
        ),
      'DISTRIBUTION_NEGATIVE',
    );

    const details = detailsOf(error);
    // The throw is at the DISTRIBUTABLE step: net income reached zero (not negative), so the fee was
    // computed on a non-negative base and no negative fee "restored" a plausible distributable.
    expect(details.netIncomeMinor).toBe('0');
    expect(details.nazirFeeMinor).toBe('500000');
    expect(details.distributableMinor).toBe('-500000');
  });

  it('refuses at the NET step — BEFORE the fee — when reserve + operating already exceed revenue', () => {
    const error = expectDomainCode(
      () =>
        computeWaterfall(
          parsed({
            receipts: [income('rev-001', 1_000_000n)],
            maintenance: { kind: 'FIXED', amountMinor: 3_000_000n },
            nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
          }),
        ),
      'DISTRIBUTION_NEGATIVE',
    );

    const details = detailsOf(error);
    expect(details.netIncomeMinor).toBe('-2000000');
    // The distributable step was never reached, so a −200,000 fee on a −2,000,000 base never existed.
    expect(details.distributableMinor).toBeUndefined();
    expect(details.nazirFeeMinor).toBeUndefined();
  });

  it('refuses a TARGET_TOPUP larger than the period revenue (ṣiyāna-first is NOT capped)', () => {
    // ⚠ SURFACED, NOT RESOLVED: whether "ṣiyāna first" instead means "reserve up to available income
    // and distribute nothing" is a fiqh question about the founder's condition. This pins the literal
    // §08 I4 reading — refuse — so a later change to a capping rule is a visible test change.
    expectDomainCode(
      () =>
        computeWaterfall(
          parsed({
            receipts: [income('rev-001', 100n)],
            maintenance: {
              kind: 'TARGET_TOPUP',
              targetBalanceMinor: 500_000n,
              currentBalanceMinor: 0n,
            },
            nazirFee: null,
          }),
        ),
      'DISTRIBUTION_NEGATIVE',
    );
  });

  it('refuses a RETAINER larger than net income', () => {
    expectDomainCode(
      () =>
        computeWaterfall(
          parsed({
            receipts: [income('rev-001', 1_000n)],
            nazirFee: { basis: 'RETAINER', fixedAmountMinor: 1_001n },
          }),
        ),
      'DISTRIBUTION_NEGATIVE',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The computation trace — hashed, persisted, and PII-free
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('computeWaterfall — the trace', () => {
  it('emits one step per deduction, in order, with explicit step ordinals', () => {
    const { trace } = computeWaterfall(
      parsed({
        receipts: [income('rev-001', 35_000_000n)],
        maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
      }),
    );

    expect(trace.map((step) => step.code)).toStrictEqual([
      'REVENUE_CLASSIFIED',
      'MAINTENANCE_RESERVE',
      'OPERATING_COST',
      'NET_INCOME',
      'NAZIR_FEE',
      'DISTRIBUTABLE',
    ]);
    expect(trace.every((step) => step.stage === 'WATERFALL')).toBe(true);

    // The deduction ORDER is data, so a future zakat step (OQ-05) is an ADDED step rather than a
    // reordering of these — §16's stated requirement that the ordering "accept an insertion".
    const ordinals = trace
      .filter((step) => step.data?.step !== undefined)
      .map((step) => `${step.code}=${String(step.data?.step)}`);
    expect(ordinals).toStrictEqual(['MAINTENANCE_RESERVE=1', 'OPERATING_COST=2', 'NAZIR_FEE=3']);
  });

  it('inserts the corpus-exclusion step only when a corpus receipt was held out', () => {
    const { trace } = computeWaterfall(
      parsed({
        receipts: [income('rev-002', 180_000_000n), capital('cap-001', 2_000_000_000n)],
        incomeMinor: 180_000_000n,
      }),
    );
    const exclusion = trace.find((step) => step.code === 'CAPITAL_RECEIPTS_EXCLUDED');
    expect(exclusion?.data?.receiptIds).toBe('cap-001');
    expect(exclusion?.data?.capitalReceiptsMinor).toBe('20000000.00');
  });

  it('carries money as decimal strings and survives JSON (no bigint, no PII)', () => {
    const { trace } = computeWaterfall(
      parsed({
        receipts: [income('rev-001', 35_000_000n)],
        maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
      }),
    );

    for (const step of trace) {
      for (const value of Object.values(step.data ?? {})) {
        expect(typeof value).toBe('string');
      }
    }
    // `JSON.stringify` THROWS on a bigint; the trace is persisted and hashed, so this must not.
    const serialized = JSON.stringify(trace);
    expect(serialized).toContain('"revenueMinor":"350000.00"');
    // Ids only — never a beneficiary. The trace is an audit surface.
    expect(serialized).not.toContain('ben-001');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * G-9 clause 1 · "the waterfall conserves value (no leakage)" — as a property
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * OQ-06 · the ṣiyāna reserve is the NAZIR'S DISCRETION where the deed is silent, and it is RECORDED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Product owner, 2026-08-18, verbatim: *"the law gives the nazir a discretion. at Qmulate each
 * endownment will have a % set deserve at the nazir's discretion."*
 *
 * The defect this closes is not an arithmetic one. Before the ruling, a deed the founder wrote
 * saying "no maintenance reserve" and a deed nobody had ever looked at produced BYTE-IDENTICAL
 * runs, because both were spelled `NONE`. Zero is not the absence of an answer — it is the answer
 * "reserve nothing", and the engine was giving it on the Nazir's behalf.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe("computeWaterfall — OQ-06: a zero reserve that is nobody's answer is flagged", () => {
  const RESERVE_FLAG = 'MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED';
  const RECEIPTS = [income('rec-oq06', 10_000_000n)];

  const runWith = (maintenance: MaintenanceRule): WaterfallOutcome =>
    computeWaterfall(parsed({ receipts: RECEIPTS, maintenance }));

  it('raises the flag for UNSET, and for NO OTHER declared kind (derived from MAINTENANCE_RULE_KINDS)', () => {
    // DERIVED, not transcribed. A kind added later lands in this loop automatically and has to be
    // classified deliberately — it cannot ship silently on either side of the line.
    const rules: Record<(typeof MAINTENANCE_RULE_KINDS)[number], MaintenanceRule> = {
      FIXED: { kind: 'FIXED', amountMinor: minorOf(1_000n) },
      PERCENT: { kind: 'PERCENT', ratePercent: '5' },
      TARGET_TOPUP: {
        kind: 'TARGET_TOPUP',
        targetBalanceMinor: minorOf(2_000n),
        currentBalanceMinor: minorOf(1_000n),
      },
      NONE: { kind: 'NONE' },
      NAZIR_DISCRETION_PERCENT: { kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: '5' },
      UNSET: { kind: 'UNSET' },
    };

    const flagged = MAINTENANCE_RULE_KINDS.filter((kind) =>
      runWith(rules[kind]).flags.includes(RESERVE_FLAG),
    );

    expect(flagged).toStrictEqual(['UNSET']);
  });

  it('a RECORDED zero and an UNRECORDED zero reserve the same amount and are NOT the same run', () => {
    const recordedZero = runWith({ kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: '0' });
    const nobodyDecided = runWith({ kind: 'UNSET' });

    // Identical money — which is precisely why the money cannot be what tells them apart.
    expect(recordedZero.waterfall.maintenanceReserveMinor).toBe(
      nobodyDecided.waterfall.maintenanceReserveMinor,
    );
    expect(recordedZero.waterfall.distributableMinor).toBe(
      nobodyDecided.waterfall.distributableMinor,
    );

    // Distinguished by the flag, and by nothing else.
    expect(recordedZero.flags).not.toContain(RESERVE_FLAG);
    expect(nobodyDecided.flags).toContain(RESERVE_FLAG);
  });

  it('THE SAME SILENT DEED computes differently once the Nazir records a percentage', () => {
    // The ruling's operative consequence, as an assertion: recording the discretion CHANGES THE
    // MONEY. Before, the whole yield goes past ṣiyāna; after, 5% is held back for the asset.
    const before = runWith({ kind: 'UNSET' });
    const after = runWith({ kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: '5' });

    expect(before.waterfall.maintenanceReserveMinor).toBe(minorOf(0n));
    expect(after.waterfall.maintenanceReserveMinor).toBe(minorOf(500_000n));
    expect(after.waterfall.distributableMinor).toBeLessThan(before.waterfall.distributableMinor);
    expect(before.flags).toContain(RESERVE_FLAG);
    expect(after.flags).not.toContain(RESERVE_FLAG);
  });

  it('the trace names WHOSE figure produced the reserve — founder, trustee, or nobody', () => {
    // A statement that cannot say which of the three produced the reserve cannot be defended to a
    // beneficiary who asks why their share was reduced.
    const authorityOf = (maintenance: MaintenanceRule): unknown =>
      runWith(maintenance).trace.find(
        (entry: { readonly code: string }) => entry.code === 'MAINTENANCE_RESERVE',
      )?.data?.['reserveAuthority'];

    expect(authorityOf({ kind: 'PERCENT', ratePercent: '5' })).toBe('SHART_AL_WAQIF');
    expect(authorityOf({ kind: 'NONE' })).toBe('SHART_AL_WAQIF');
    expect(authorityOf({ kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: '5' })).toBe(
      'NAZIR_DISCRETION',
    );
    expect(authorityOf({ kind: 'UNSET' })).toBe('NOBODY');
  });
});

describe('computeWaterfall — conservation over generated inputs', () => {
  const ratePercentArb = fc.oneof(
    fc.constantFrom('0', '0.01', '1', '5', '7.5', '10', '33.333333', '99.99', '100'),
    fc.integer({ min: 0, max: 100 }).map((value) => String(value)),
  );

  const maintenanceArb: fc.Arbitrary<DistributionInputRaw['maintenance']> = fc.oneof(
    fc
      .bigInt({ min: 0n, max: 10n ** 14n })
      .map((amountMinor) => ({ kind: 'FIXED' as const, amountMinor })),
    ratePercentArb.map((ratePercent) => ({ kind: 'PERCENT' as const, ratePercent })),
    fc
      .tuple(fc.bigInt({ min: 0n, max: 10n ** 14n }), fc.bigInt({ min: 0n, max: 10n ** 14n }))
      .map(([targetBalanceMinor, currentBalanceMinor]) => ({
        kind: 'TARGET_TOPUP' as const,
        targetBalanceMinor,
        currentBalanceMinor,
      })),
    fc.constant({ kind: 'NONE' as const }),
  );

  const nazirFeeArb: fc.Arbitrary<DistributionInputRaw['nazirFee']> = fc.oneof(
    ratePercentArb.map((ratePercent) => ({ basis: 'PERCENT_OF_REVENUE' as const, ratePercent })),
    ratePercentArb.map((ratePercent) => ({ basis: 'PERCENT_OF_NET_INCOME' as const, ratePercent })),
    fc
      .bigInt({ min: 0n, max: 10n ** 14n })
      .map((fixedAmountMinor) => ({ basis: 'RETAINER' as const, fixedAmountMinor })),
    fc.constant(null),
  );

  const partsArb = fc.record({
    incomeAmounts: fc.array(fc.bigInt({ min: 0n, max: 10n ** 13n }), {
      minLength: 0,
      maxLength: 6,
    }),
    capitalAmounts: fc.array(fc.bigInt({ min: 0n, max: 10n ** 14n }), {
      minLength: 0,
      maxLength: 3,
    }),
    operatingCostMinor: fc.bigInt({ min: 0n, max: 10n ** 14n }),
    maintenance: maintenanceArb,
    nazirFee: nazirFeeArb,
  });

  it('conserves value exactly, keeps every term non-negative, and NEVER returns a negative run', () => {
    let computed = 0;
    let refused = 0;

    fc.assert(
      fc.property(partsArb, (parts) => {
        const receipts = [
          ...parts.incomeAmounts.map((amount, index) => income(`rev-${String(index)}`, amount)),
          ...parts.capitalAmounts.map((amount, index) => capital(`cap-${String(index)}`, amount)),
        ];
        const input = parsed({
          receipts,
          incomeMinor: sumIncome(receipts),
          operatingCostMinor: parts.operatingCostMinor,
          maintenance: parts.maintenance,
          nazirFee: parts.nazirFee,
        });

        let outcome: ReturnType<typeof computeWaterfall>;
        try {
          outcome = computeWaterfall(input);
        } catch (error) {
          // The ONLY permitted failure is the typed I4 refusal — and no result may come with it.
          if (!isDomainError(error) || error.code !== 'DISTRIBUTION_NEGATIVE') throw error;
          refused += 1;
          return true;
        }
        computed += 1;

        const { waterfall } = outcome;
        expectTermByTermAgreement(input, waterfall);

        // I-C1: the corpus total is arithmetically absent from every figure below revenue.
        const expectedCapital = parts.capitalAmounts.reduce((total, amount) => total + amount, 0n);
        expect(waterfall.capitalReceiptsMinor).toBe(minorOf(expectedCapital));
        expect(waterfall.revenueMinor).toBe(minorOf(sumIncome(receipts)));
        expect(waterfall.distributableMinor).toBeLessThanOrEqual(waterfall.revenueMinor);

        for (const value of Object.values(waterfall)) {
          if (typeof value === 'bigint') expect(value).toBeGreaterThanOrEqual(0n);
        }
        return true;
      }),
      { numRuns: 3_000, seed: 20260730, endOnFailure: true },
    );

    // A generator that stopped producing either branch would make this suite vacuous.
    expect(computed).toBeGreaterThan(200);
    expect(refused).toBeGreaterThan(200);
  });
});
