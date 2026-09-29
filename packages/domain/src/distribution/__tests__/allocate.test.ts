/**
 * `distribution/allocate.test.ts` — Stage 5: the exact split, the residual rule, line assembly.
 *
 * What this suite is FOR, so a later reader does not weaken it by accident:
 *
 * 1. **Value conservation is the product.** Every arithmetic assertion is in exact halalas
 *    (`bigint`), never in riyals and never through a `number`. `Σ lines + retained` must equal
 *    distributable to the halala in every state — including the three states in which §08's own I2
 *    and I3 *as written* are FALSE (nil run, no-eligible cohort, direct use with period revenue).
 * 2. **The two allocators are made to check each other.** `allocateMinor` runs a bigint Hamilton
 *    split AND `money.ts`'s Decimal `largestRemainderAllocate`; this suite drives the same inputs
 *    through `largestRemainderAllocate` DIRECTLY and asserts element-wise agreement, tie-break
 *    included. Sprint 1 and Sprint 2 both shipped holes that existed because nothing compared two
 *    sides that were supposed to agree.
 * 3. **The residual rule is pinned in both directions.** Largest remainder must beat index order (an
 *    unequal-remainder case proves it is not "first line wins"), and a full tie must fall to
 *    ascending `beneficiaryId` (an all-equal case proves the tie-break is deliberate, not
 *    accidental). A negative residual — the signature failure of half-up — is proven impossible.
 * 4. **Behaviour is driven, never source text.** No test here asserts that a string appears near a
 *    call site; that anti-pattern shipped a bypassable guard in Sprint 2. Every refusal is proven by
 *    calling the function and catching the typed `DomainError.code`.
 */

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { civilDate } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainErrorCode } from '../../errors.js';
import { fromMinor, largestRemainderAllocate, toMinor } from '../../money.js';
import { compareBeneficiaryIds, minorOf, sharePercentOf } from '../contract.js';
import type {
  BeneficiaryInput,
  DistributionLine,
  ExclusionReasonCode,
  GateReasonCode,
  LineBasis,
  Minor,
  RoundingMethod,
  TraceStep,
} from '../contract.js';
import type { GateOutcome } from '../gates.js';
import type { EntitlementResolution, ResolvedBeneficiary } from '../resolver.js';
import { allocateMinor, assembleLines, emptyTotals, entitledCohortWeights } from '../allocate.js';
import type { AllocationResult } from '../allocate.js';

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

const HALF_UP: RoundingMethod = 'LARGEST_REMAINDER_HALF_UP';

/** An allocation over an empty cohort — what the caller must pass when nobody is entitled. */
const NO_ALLOCATION: AllocationResult = { amountsMinor: [], floorsMinor: [], residualMinor: 0n };

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Generators, declared before use so nothing depends on evaluation order
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A pool up to 1e12 SAR in halalas — inside the `Decimal(18,2)` range money is stored in. */
const totalArb = fc.bigInt({ min: 0n, max: 10n ** 14n });

/** A non-negative plain decimal literal with at most 5 dp, built without ever touching a float. */
const weightArb = fc
  .record({ digits: fc.bigInt({ min: 0n, max: 99_999n }), dp: fc.integer({ min: 0, max: 5 }) })
  .map(({ digits, dp }) => {
    if (dp === 0) return digits.toString();
    const padded = digits.toString().padStart(dp + 1, '0');
    return `${padded.slice(0, padded.length - dp)}.${padded.slice(padded.length - dp)}`;
  });

/** 1–12 weights, at least one non-zero (an all-zero vector is refused by design). */
const weightVectorArb = fc
  .array(weightArb, { minLength: 1, maxLength: 12 })
  .filter((weights) => weights.some((weight) => /[1-9]/.test(weight)));

const GATE_OUTCOMES: readonly GateOutcome[] = [
  { status: 'PAID', reasonCode: null, gateFlags: [] },
  { status: 'WITHHELD', reasonCode: 'STALE_KYC', gateFlags: ['STALE_KYC'] },
  {
    status: 'CROSS_BORDER_PENDING',
    reasonCode: 'CROSS_BORDER_PENDING',
    gateFlags: ['CROSS_BORDER_PENDING'],
  },
];

const gateOutcomeArb = fc.constantFrom(...GATE_OUTCOMES);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Assert a call throws a `DomainError` with exactly this code, and hand it back for more checks. */
function expectDomainCode(call: () => unknown, code: DomainErrorCode): DomainErrorCode {
  let thrown: unknown;
  try {
    call();
  } catch (error: unknown) {
    thrown = error;
  }
  if (!isDomainError(thrown)) {
    throw new Error(
      `expected DomainError("${code}") but got ${thrown === undefined ? 'no throw at all' : String(thrown)}`,
    );
  }
  expect(thrown.code).toBe(code);
  return thrown.code;
}

function beneficiary(
  overrides: Partial<BeneficiaryInput> & { readonly id: string },
): BeneficiaryInput {
  return {
    kind: 'FAMILY',
    active: true,
    tabaqa: 1,
    // ADR-0009: the lineage edge. `null` = a child of the waqif, ṭabaqa 1 — which is what these
    // fixtures are, so the derived depth agrees with the declared `tabaqa` by construction.
    parentId: null,
    lineageLink: 'SON',
    line: 'ZUHUR',
    branch: 'Branch A',
    stipulatedWeight: '1',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: civilDate('2026-01-15'),
    category: null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: `FAKE-ACCT-${overrides.id}`,
    ...overrides,
  };
}

function basisOf(overrides: Partial<LineBasis> = {}): LineBasis {
  return {
    tabaqa: 1,
    line: 'ZUHUR',
    branch: 'Branch A',
    kind: 'FAMILY',
    rule: 'ORDERED_LOWEST_LIVING_TABAQA',
    // ADR-0009's four basis fields. `assembleLines` copies `basis` through verbatim and reads none of
    // them, which is why a fixed set is honest here — the allocator is order-agnostic.
    lineageDepth: 1,
    parentId: null,
    lineageLink: 'SON',
    continuationStipulation: null,
    ...overrides,
  };
}

function entitledMember(
  id: string,
  weight: string,
  basisOverrides: Partial<LineBasis> = {},
): ResolvedBeneficiary {
  return {
    beneficiaryId: id,
    entitled: true,
    stipulatedWeight: weight,
    exclusionReason: null,
    basis: basisOf(basisOverrides),
    source: beneficiary({ id, stipulatedWeight: weight }),
    lineageDepth: 1,
  };
}

function excludedMember(
  id: string,
  reason: ExclusionReasonCode,
  basisOverrides: Partial<LineBasis> = {},
): ResolvedBeneficiary {
  return {
    beneficiaryId: id,
    entitled: false,
    // The resolver publishes the EFFECTIVE weight, which is '0' once a member is excluded.
    stipulatedWeight: '0',
    exclusionReason: reason,
    basis: basisOf(basisOverrides),
    source: beneficiary({ id }),
    lineageDepth: 1,
  };
}

/** A resolution whose roll-ups are DERIVED from its rows, so a fixture cannot self-contradict. */
function resolutionOf(
  members: readonly ResolvedBeneficiary[],
  overrides: Partial<EntitlementResolution> = {},
): EntitlementResolution {
  const ordered = [...members].sort((a, b) =>
    compareBeneficiaryIds(a.beneficiaryId, b.beneficiaryId),
  );
  return {
    order: 'ORDERED',
    rule: 'ORDERED_LOWEST_LIVING_TABAQA',
    continuation: null,
    flags: [],
    entitledTabaqa: 1,
    resolved: ordered,
    entitledIds: ordered.filter((member) => member.entitled).map((member) => member.beneficiaryId),
    excludedCount: ordered.filter((member) => !member.entitled).length,
    trace: [],
    ...overrides,
  };
}

function paid(): GateOutcome {
  return { status: 'PAID', reasonCode: null, gateFlags: [] };
}

function withheld(
  reasonCode: GateReasonCode,
  gateFlags: readonly GateReasonCode[] = [reasonCode],
): GateOutcome {
  return { status: 'WITHHELD', reasonCode, gateFlags };
}

function crossBorder(): GateOutcome {
  return {
    status: 'CROSS_BORDER_PENDING',
    reasonCode: 'CROSS_BORDER_PENDING',
    gateFlags: ['CROSS_BORDER_PENDING'],
  };
}

function gatesFor(
  entries: readonly (readonly [string, GateOutcome])[],
): ReadonlyMap<string, GateOutcome> {
  return new Map(entries);
}

/** Allocate over the resolution's own cohort, the way `engine.ts` is required to. */
function allocateForCohort(
  resolution: EntitlementResolution,
  distributableMinor: Minor,
): AllocationResult {
  return allocateMinor(distributableMinor, entitledCohortWeights(resolution).weights, HALF_UP);
}

function lineFor(lines: readonly DistributionLine[], id: string): DistributionLine {
  const found = lines.find((line) => line.beneficiaryId === id);
  if (found === undefined) throw new Error(`no line for "${id}"`);
  return found;
}

function sumBigints(values: readonly bigint[]): bigint {
  return values.reduce<bigint>((running, value) => running + value, 0n);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * allocateMinor — the split
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('allocateMinor — largest remainder over exact halalas', () => {
  it('splits 100.00 three equal ways as 33.34 / 33.33 / 33.33 (§08 worked example F)', () => {
    const result = allocateMinor(minorOf(10_000n), ['1', '1', '1'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([3_334n, 3_333n, 3_333n]);
    expect(result.floorsMinor).toStrictEqual([3_333n, 3_333n, 3_333n]);
    expect(result.residualMinor).toBe(1n);
    expect(sumBigints([...result.amountsMinor])).toBe(10_000n);
  });

  it('hands a two-halala residual to the two lowest indices when every remainder ties', () => {
    // 10_001 / 3 → floors 3_333 each (Σ 9_999), residual 2, all three remainders equal. The
    // tie-break is ascending index, and the caller orders the cohort by ascending beneficiaryId —
    // so the two extra halalas belong to the first two ids, deterministically, on every host.
    const result = allocateMinor(minorOf(10_001n), ['1', '1', '1'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([3_334n, 3_334n, 3_333n]);
    expect(result.residualMinor).toBe(2n);
  });

  it('gives the leftover halala to the LARGEST remainder, not to the lowest index', () => {
    // Weights 1 : 2 over 100 halalas → floors 33 and 66 (Σ 99), remainders 1 and 2. A "first line
    // wins" implementation returns [34, 66]; largest-remainder returns [33, 67]. This is the test
    // that distinguishes them, and it is why ascending id is only a TIE-break.
    const result = allocateMinor(minorOf(100n), ['1', '2'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([33n, 67n]);
    expect(result.floorsMinor).toStrictEqual([33n, 66n]);
    expect(result.residualMinor).toBe(1n);
  });

  it('splits an exactly divisible pool with no residual (worked example A cohort)', () => {
    const result = allocateMinor(minorOf(27_500_000n), ['12.5', '12.5'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([13_750_000n, 13_750_000n]);
    expect(result.residualMinor).toBe(0n);
  });

  it('is unaffected by trailing zeros in a deed weight', () => {
    // '1.50' and '1.5' are the same share. The two allocators normalise trailing zeros through
    // different code (Decimal vs. string), so this pins that they pick the same common scale.
    const padded = allocateMinor(minorOf(10_000n), ['1.50', '1.500', '1.5'], HALF_UP);
    const plain = allocateMinor(minorOf(10_000n), ['1.5', '1.5', '1.5'], HALF_UP);

    expect(padded).toStrictEqual(plain);
    expect(padded.amountsMinor).toStrictEqual([3_334n, 3_333n, 3_333n]);
  });

  it('gives a zero-weight line exactly zero and never a leftover halala', () => {
    const result = allocateMinor(minorOf(10_000n), ['1', '1', '1', '0'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([3_334n, 3_333n, 3_333n, 0n]);
    expect(result.floorsMinor[3]).toBe(0n);
    expect(result.residualMinor).toBe(1n);
  });

  it('allocates the whole pool to a single line', () => {
    const result = allocateMinor(minorOf(12_345n), ['7'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([12_345n]);
    expect(result.residualMinor).toBe(0n);
  });

  it('splits a nil pool into nil lines', () => {
    const result = allocateMinor(minorOf(0n), ['1', '2'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([0n, 0n]);
    expect(result.floorsMinor).toStrictEqual([0n, 0n]);
    expect(result.residualMinor).toBe(0n);
  });

  it('stays exact at a scale where a double would already have lost the halala', () => {
    // 1_000_000_000_000.01 SAR split 1 : 3. Once 100_000_000_000_001 is multiplied by a weight it
    // is past float64's exact-integer range, so any path through `number` drifts here.
    const result = allocateMinor(minorOf(100_000_000_000_001n), ['1', '3'], HALF_UP);

    expect(result.amountsMinor).toStrictEqual([25_000_000_000_000n, 75_000_000_000_001n]);
    expect(result.floorsMinor).toStrictEqual([25_000_000_000_000n, 75_000_000_000_000n]);
    expect(result.residualMinor).toBe(1n);
    expect(sumBigints([...result.amountsMinor])).toBe(100_000_000_000_001n);
  });

  it('is deterministic — the same input yields an identical result (I8)', () => {
    const weights = ['3', '1.25', '1.25', '0.5', '7'];

    expect(allocateMinor(minorOf(1_234_567n), weights, HALF_UP)).toStrictEqual(
      allocateMinor(minorOf(1_234_567n), weights, HALF_UP),
    );
  });
});

describe('allocateMinor — refusals (it never guesses, never approximates)', () => {
  it('refuses an empty weight vector', () => {
    expectDomainCode(() => allocateMinor(minorOf(100n), [], HALF_UP), 'INVALID_ALLOCATION_WEIGHTS');
  });

  it('refuses an all-zero weight vector rather than dividing by zero', () => {
    // AT-06: a cohort whose every deed weight is zero must be EXCLUDED upstream
    // (ZERO_STIPULATED_WEIGHT), not handed to the allocator.
    expectDomainCode(
      () => allocateMinor(minorOf(100n), ['0', '0.0', '0'], HALF_UP),
      'INVALID_ALLOCATION_WEIGHTS',
    );
  });

  it('refuses a negative pool', () => {
    expectDomainCode(() => allocateMinor(minorOf(-1n), ['1'], HALF_UP), 'MONEY_NEGATIVE');
  });

  it('refuses the declared-but-unimplemented bankers method instead of falling back to half-up', () => {
    // The dangerous failure would be a silent fall back: the resulting statement would look exactly
    // like a ratified one. OQ-01 is unsigned, so the engine refuses.
    expectDomainCode(
      () => allocateMinor(minorOf(10_000n), ['1', '1', '1'], 'LARGEST_REMAINDER_BANKERS'),
      'SETTING_INVALID',
    );
  });

  it('refuses an unrecognised rounding method', () => {
    expectDomainCode(
      () => allocateMinor(minorOf(10_000n), ['1'], 'HALF_EVEN_SOMETHING' as RoundingMethod),
      'SETTING_INVALID',
    );
  });

  it('refuses a JS number as a weight (a float is never a deed share)', () => {
    expectDomainCode(
      () => allocateMinor(minorOf(10_000n), [0.5 as unknown as string], HALF_UP),
      'MONEY_NUMBER_INPUT',
    );
  });

  it('refuses a negative weight', () => {
    expectDomainCode(
      () => allocateMinor(minorOf(10_000n), ['1', '-1'], HALF_UP),
      'INVALID_ALLOCATION_WEIGHTS',
    );
  });

  it('refuses a weight beyond the 18-dp precision bound', () => {
    expectDomainCode(
      () => allocateMinor(minorOf(10_000n), ['1.0000000000000000001'], HALF_UP),
      'INVALID_ALLOCATION_WEIGHTS',
    );
  });

  it.each([
    { label: 'exponent notation', weight: '1e3' },
    { label: 'a blank string', weight: '' },
    { label: 'NaN', weight: 'NaN' },
    { label: 'Infinity', weight: 'Infinity' },
    { label: 'a bare decimal point', weight: '.5' },
  ])('refuses $label as a weight', ({ weight }) => {
    expectDomainCode(() => allocateMinor(minorOf(10_000n), [weight], HALF_UP), 'MONEY_INVALID');
  });
});

describe('allocateMinor — the bigint split and money.ts’s Decimal allocator must agree', () => {
  const cases: readonly { readonly total: bigint; readonly weights: readonly string[] }[] = [
    { total: 10_000n, weights: ['1', '1', '1'] },
    { total: 10_001n, weights: ['1', '1', '1'] },
    { total: 100n, weights: ['1', '2'] },
    { total: 27_500_000n, weights: ['12.5', '12.5'] },
    { total: 140_000_000n, weights: ['40', '30', '30'] },
    { total: 7n, weights: ['1', '1', '1', '1', '1', '1', '1', '1'] },
    { total: 999n, weights: ['0.000001', '2', '3.5', '0'] },
    { total: 100_000_000_000_001n, weights: ['1', '3'] },
  ];

  it.each(cases)('agrees halala for halala on $total across $weights', ({ total, weights }) => {
    const mine = allocateMinor(minorOf(total), weights, HALF_UP);
    const theirs = largestRemainderAllocate(fromMinor(total), weights).map((part) => toMinor(part));

    // Element-wise, not just the sum: a different tie-break still conserves the total but pays a
    // DIFFERENT person, so only positional equality proves the residual rule agrees.
    expect([...mine.amountsMinor]).toStrictEqual(theirs);
  });

  it('agrees over 2000 generated pools and weight vectors, tie-break included', () => {
    fc.assert(
      fc.property(totalArb, weightVectorArb, (total, weights) => {
        const mine = allocateMinor(minorOf(total), weights, HALF_UP);
        const theirs = largestRemainderAllocate(fromMinor(total), weights).map((part) =>
          toMinor(part),
        );
        expect([...mine.amountsMinor]).toStrictEqual(theirs);
      }),
      { numRuns: 2_000, seed: 20_260_730 },
    );
  });
});

describe('allocateMinor — properties (G-9 clause 2: shares sum correctly)', () => {
  it('conserves the pool exactly, bounds the residual, and bumps by at most one halala', () => {
    fc.assert(
      fc.property(totalArb, weightVectorArb, (total, weights) => {
        const { amountsMinor, floorsMinor, residualMinor } = allocateMinor(
          minorOf(total),
          weights,
          HALF_UP,
        );

        expect(amountsMinor).toHaveLength(weights.length);
        expect(floorsMinor).toHaveLength(weights.length);

        // (i) Σ == total, exactly.
        expect(sumBigints([...amountsMinor])).toBe(total);

        // (ii) I9: 0 ≤ residual < lineCount, and the residual is exactly what the floors left over.
        // NEVER negative — that is precisely why the method is floor-then-distribute, not half-up.
        expect(residualMinor >= 0n).toBe(true);
        expect(residualMinor < BigInt(weights.length)).toBe(true);
        expect(total - sumBigints([...floorsMinor])).toBe(residualMinor);

        // (iii) every amount is its floor or its floor + 1 — the cross-check that makes the
        // independent floor derivation load-bearing rather than dead code.
        let bumped = 0n;
        for (const [index, amount] of amountsMinor.entries()) {
          const floorMinor = floorsMinor[index];
          expect(floorMinor).toBeDefined();
          const floorValue = floorMinor ?? -1n;
          expect(amount === floorValue || amount === floorValue + 1n).toBe(true);
          expect(amount >= 0n).toBe(true);
          if (amount !== floorValue) bumped += 1n;
        }
        expect(bumped).toBe(residualMinor);
      }),
      { numRuns: 2_000, seed: 20_260_730 },
    );
  });

  it('never hands a leftover halala to a zero-weight line', () => {
    fc.assert(
      fc.property(totalArb, weightVectorArb, (total, weights) => {
        const padded = [...weights, '0'];
        expect(allocateMinor(minorOf(total), padded, HALF_UP).amountsMinor[padded.length - 1]).toBe(
          0n,
        );
      }),
      { numRuns: 500, seed: 20_260_730 },
    );
  });

  it('is invariant under an added trailing zero on every weight', () => {
    fc.assert(
      fc.property(totalArb, weightVectorArb, (total, weights) => {
        const padded = weights.map((weight) =>
          weight.includes('.') ? `${weight}0` : `${weight}.0`,
        );

        expect(allocateMinor(minorOf(total), padded, HALF_UP).amountsMinor).toStrictEqual(
          allocateMinor(minorOf(total), weights, HALF_UP).amountsMinor,
        );
      }),
      { numRuns: 500, seed: 20_260_730 },
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * emptyTotals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('emptyTotals — the totals of a run with no entitled line', () => {
  it('puts the whole distributable in retained and nothing anywhere else', () => {
    expect(emptyTotals(minorOf(9_000_000n), 3)).toStrictEqual({
      paidMinor: 0n,
      withheldMinor: 0n,
      crossBorderMinor: 0n,
      retainedMinor: 9_000_000n,
      entitledMinor: 0n,
      excludedCount: 3,
      entitledLineCount: 0,
      residualMinor: 0n,
    });
  });

  it('refuses a negative retained amount', () => {
    expectDomainCode(() => emptyTotals(minorOf(-1n), 0), 'DISTRIBUTION_INVARIANT_BREACH');
  });

  it.each([{ count: -1 }, { count: 1.5 }, { count: Number.NaN }])(
    'refuses excludedCount $count',
    ({ count }) => {
      expectDomainCode(() => emptyTotals(minorOf(0n), count), 'DISTRIBUTION_INVARIANT_BREACH');
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * entitledCohortWeights
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('entitledCohortWeights — the single definition of the split order', () => {
  it('returns the entitled cohort ascending by id, with weights index-aligned', () => {
    const resolution = resolutionOf([
      entitledMember('ben-003', '5'),
      excludedMember('ben-002', 'UPPER_TABAQA_EXTANT'),
      entitledMember('ben-001', '12.5'),
    ]);

    expect(entitledCohortWeights(resolution)).toStrictEqual({
      beneficiaryIds: ['ben-001', 'ben-003'],
      weights: ['12.5', '5'],
    });
  });

  it('is empty when nobody is entitled', () => {
    expect(
      entitledCohortWeights(resolutionOf([excludedMember('ben-001', 'TABAQA_EXTINCT')])),
    ).toStrictEqual({ beneficiaryIds: [], weights: [] });
  });

  it('orders by UTF-16 code units, not by locale', () => {
    // 'ben-10' sorts BEFORE 'ben-9' in code-unit order. A locale collator may disagree, and a
    // locale-dependent tie-break would make a payout host-dependent (I8).
    const resolution = resolutionOf([entitledMember('ben-9', '1'), entitledMember('ben-10', '1')]);

    expect(entitledCohortWeights(resolution).beneficiaryIds).toStrictEqual(['ben-10', 'ben-9']);
  });

  it('sorts a resolved array that arrives OUT of order rather than trusting the resolver', () => {
    // Built WITHOUT `resolutionOf`, which sorts. `resolver.ts` promises ascending order, and this is
    // the check that the promise is not load-bearing here: if the two modules ever disagree, the
    // split must still attach the right halalas to the right people.
    const unsorted: EntitlementResolution = {
      order: 'SHARED',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      continuation: null,
      flags: [],
      entitledTabaqa: null,
      resolved: [
        entitledMember('ben-b', '3'),
        excludedMember('ben-z', 'BENEFICIARY_INACTIVE'),
        entitledMember('ben-a', '1'),
      ],
      entitledIds: ['ben-b', 'ben-a'],
      excludedCount: 1,
      trace: [],
    };

    expect(entitledCohortWeights(unsorted)).toStrictEqual({
      beneficiaryIds: ['ben-a', 'ben-b'],
      weights: ['1', '3'],
    });
  });

  it('assembles an out-of-order resolution onto the right beneficiaries', () => {
    const unsorted: EntitlementResolution = {
      order: 'SHARED',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      continuation: null,
      flags: [],
      entitledTabaqa: null,
      resolved: [entitledMember('ben-b', '3'), entitledMember('ben-a', '1')],
      entitledIds: ['ben-b', 'ben-a'],
      excludedCount: 0,
      trace: [],
    };
    const distributableMinor = minorOf(100n);

    const { lines } = assembleLines({
      resolution: unsorted,
      gateOutcomes: gatesFor([
        ['ben-a', paid()],
        ['ben-b', paid()],
      ]),
      allocation: allocateForCohort(unsorted, distributableMinor),
      distributableMinor,
    });

    // ben-a holds 1 of the 4 deed parts. If the cohort order and the weight vector ever came apart,
    // ben-a would be paid 75 instead of 25 — the totals would still balance and nothing else would
    // notice.
    expect(lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toStrictEqual([
      ['ben-a', 25n],
      ['ben-b', 75n],
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — worked example A
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assembleLines — worked example A (ORDERED, one withheld, one tier-excluded)', () => {
  const DISTRIBUTABLE = minorOf(27_500_000n);

  const resolution = resolutionOf([
    entitledMember('ben-001', '12.5', { tabaqa: 1, line: 'ZUHUR', branch: 'Branch A' }),
    excludedMember('ben-002', 'UPPER_TABAQA_EXTANT', {
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
    }),
    entitledMember('ben-003', '12.5', { tabaqa: 1, line: 'BUTUN', branch: 'Branch B' }),
  ]);

  function assemble(overrideGates?: ReadonlyMap<string, GateOutcome>) {
    return assembleLines({
      resolution,
      gateOutcomes:
        overrideGates ??
        gatesFor([
          ['ben-001', paid()],
          ['ben-003', withheld('KYC_UNVERIFIED')],
        ]),
      allocation: allocateForCohort(resolution, DISTRIBUTABLE),
      distributableMinor: DISTRIBUTABLE,
    });
  }

  it('splits 50/50 across the entitled ṭabaqa and zeroes the excluded upper tier', () => {
    const { lines } = assemble();

    expect(lines.map((line) => line.beneficiaryId)).toStrictEqual([
      'ben-001',
      'ben-002',
      'ben-003',
    ]);
    expect(lineFor(lines, 'ben-001')).toMatchObject({
      status: 'PAID',
      entitledMinor: 13_750_000n,
      sharePercent: '50.000000',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-ACCT-ben-001',
    });
    expect(lineFor(lines, 'ben-003')).toMatchObject({
      status: 'WITHHELD',
      entitledMinor: 13_750_000n,
      sharePercent: '50.000000',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
    });
  });

  it('emits the excluded line for the record: owed nothing, reason stated, no gate flags', () => {
    const excluded = lineFor(assemble().lines, 'ben-002');

    expect(excluded).toMatchObject({
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      reasonCode: 'UPPER_TABAQA_EXTANT',
      gateFlags: [],
    });
    // The excluded member's basis still reaches the statement (BR-505): it says WHY they are out.
    // ADR-0009's four fields are copied through by `assembleLines` verbatim — it reads none of them —
    // and are asserted whole here so a field silently dropped in assembly fails.
    expect(excluded.basis).toStrictEqual({
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    });
  });

  it('rolls up totals that balance to the halala (restated I2 + I3)', () => {
    const { totals } = assemble();

    expect(totals).toStrictEqual({
      paidMinor: 13_750_000n,
      withheldMinor: 13_750_000n,
      crossBorderMinor: 0n,
      retainedMinor: 0n,
      entitledMinor: 27_500_000n,
      excludedCount: 1,
      entitledLineCount: 2,
      residualMinor: 0n,
    });
    expect(
      totals.paidMinor + totals.withheldMinor + totals.crossBorderMinor + totals.retainedMinor,
    ).toBe(27_500_000n);
  });

  it('queues no Authority notice when nothing is cross-border', () => {
    expect(assemble().authorityNotices).toStrictEqual([]);
  });

  it('leaves every OTHER line untouched when one line’s gate verdict changes (I6)', () => {
    // The whole point of the gate/split separation: withholding ben-003 does NOT hand their share
    // to ben-001. `entitledMinor` is identical in both runs; only `status` and `reasonCode` move.
    const gated = assemble();
    const allPaid = assemble(
      gatesFor([
        ['ben-001', paid()],
        ['ben-003', paid()],
      ]),
    );

    expect(gated.lines.map((line) => line.entitledMinor)).toStrictEqual(
      allPaid.lines.map((line) => line.entitledMinor),
    );
    expect(lineFor(allPaid.lines, 'ben-003').status).toBe('PAID');
    expect(allPaid.totals.paidMinor).toBe(27_500_000n);
    expect(allPaid.totals.withheldMinor).toBe(0n);
    expect(allPaid.totals.entitledMinor).toBe(gated.totals.entitledMinor);
  });

  it('still balances when EVERY entitled line is gated out (worked example E)', () => {
    const allGated = assemble(
      gatesFor([
        ['ben-001', withheld('STALE_KYC')],
        ['ben-003', withheld('KYC_UNVERIFIED')],
      ]),
    );

    expect(allGated.totals.paidMinor).toBe(0n);
    expect(allGated.totals.withheldMinor).toBe(27_500_000n);
    // The withheld money belongs to NAMED people, so it is never reported as `retained`.
    expect(allGated.totals.retainedMinor).toBe(0n);
    expect(allGated.totals.entitledMinor).toBe(27_500_000n);
  });

  it('is deterministic', () => {
    expect(assemble()).toStrictEqual(assemble());
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — worked example D
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assembleLines — worked example D (JOINT, a cross-border leg)', () => {
  const DISTRIBUTABLE = minorOf(140_000_000n);

  const resolution = resolutionOf(
    [
      entitledMember('ben-006', '40', {
        tabaqa: null,
        line: 'NA',
        branch: 'Charitable',
        kind: 'CHARITABLE_JIHA',
        rule: 'JOINT_FIXED_DEED_SHARES',
      }),
      entitledMember('ben-007', '30', { rule: 'JOINT_FIXED_DEED_SHARES' }),
      entitledMember('ben-008', '30', {
        line: 'BUTUN',
        branch: 'Branch B',
        rule: 'JOINT_FIXED_DEED_SHARES',
      }),
    ],
    { order: 'SHARED', rule: 'JOINT_FIXED_DEED_SHARES', entitledTabaqa: null },
  );

  function assemble(entries: readonly (readonly [string, GateOutcome])[]) {
    return assembleLines({
      resolution,
      gateOutcomes: gatesFor(entries),
      allocation: allocateForCohort(resolution, DISTRIBUTABLE),
      distributableMinor: DISTRIBUTABLE,
    });
  }

  it('splits 40/30/30 and routes — not blocks — the cross-border line', () => {
    const { lines, totals, authorityNotices } = assemble([
      ['ben-006', paid()],
      ['ben-007', paid()],
      ['ben-008', crossBorder()],
    ]);

    expect(lineFor(lines, 'ben-006')).toMatchObject({
      entitledMinor: 56_000_000n,
      sharePercent: '40.000000',
      status: 'PAID',
    });
    expect(lineFor(lines, 'ben-007')).toMatchObject({ entitledMinor: 42_000_000n, status: 'PAID' });
    expect(lineFor(lines, 'ben-008')).toMatchObject({
      entitledMinor: 42_000_000n,
      sharePercent: '30.000000',
      status: 'CROSS_BORDER_PENDING',
      reasonCode: 'CROSS_BORDER_PENDING',
    });

    expect(totals.paidMinor).toBe(98_000_000n);
    expect(totals.crossBorderMinor).toBe(42_000_000n);
    expect(totals.retainedMinor).toBe(0n);
    expect(totals.entitledMinor).toBe(140_000_000n);

    expect(authorityNotices).toHaveLength(1);
    expect(authorityNotices[0]).toMatchObject({
      type: 'CROSS_BORDER_DISBURSEMENT',
      beneficiaryId: 'ben-008',
      reasonCode: 'CROSS_BORDER_PENDING',
    });
    // The notice carries the staleness marker, so no surface can quote the obligation uncaveated.
    expect(authorityNotices[0]?.reason).toContain('⚠');
  });

  it('queues NO notice for a cross-border line withheld for KYC, but keeps the flag', () => {
    // SURFACED, not resolved: whether Nazarah Art. 10(7) requires notice at ENTITLEMENT or at
    // PAYMENT is a question of Saudi law. The engine notifies only when cross-border is the BINDING
    // status, so the Authority is not told of a disbursement that is not happening — while the
    // routing requirement survives in `gateFlags`.
    const { lines, authorityNotices } = assemble([
      ['ben-006', paid()],
      ['ben-007', paid()],
      ['ben-008', withheld('STALE_KYC', ['STALE_KYC', 'CROSS_BORDER_PENDING'])],
    ]);

    expect(authorityNotices).toStrictEqual([]);
    expect(lineFor(lines, 'ben-008')).toMatchObject({
      status: 'WITHHELD',
      reasonCode: 'STALE_KYC',
      gateFlags: ['STALE_KYC', 'CROSS_BORDER_PENDING'],
      entitledMinor: 42_000_000n,
    });
  });

  it('unlicensing the jiha moves its money to withheld, never to the family legs', () => {
    const licensed = assemble([
      ['ben-006', paid()],
      ['ben-007', paid()],
      ['ben-008', paid()],
    ]);
    const unlicensed = assemble([
      ['ben-006', withheld('ENTITY_UNLICENSED')],
      ['ben-007', paid()],
      ['ben-008', paid()],
    ]);

    expect(unlicensed.lines.map((line) => line.entitledMinor)).toStrictEqual(
      licensed.lines.map((line) => line.entitledMinor),
    );
    expect(unlicensed.totals.paidMinor).toBe(84_000_000n);
    expect(unlicensed.totals.withheldMinor).toBe(56_000_000n);
    expect(
      unlicensed.totals.paidMinor +
        unlicensed.totals.withheldMinor +
        unlicensed.totals.crossBorderMinor +
        unlicensed.totals.retainedMinor,
    ).toBe(140_000_000n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — the residual reaches a named beneficiary (AT-04)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assembleLines — the residual reaches a named beneficiary (AT-04)', () => {
  const DISTRIBUTABLE = minorOf(10_000n);
  const resolution = resolutionOf(
    [entitledMember('ben-a', '1'), entitledMember('ben-b', '1'), entitledMember('ben-c', '1')],
    { order: 'SHARED', rule: 'SHARED_ALL_LIVING_TABAQAT', entitledTabaqa: null },
  );

  const assembled = assembleLines({
    resolution,
    gateOutcomes: gatesFor([
      ['ben-a', paid()],
      ['ben-b', paid()],
      ['ben-c', paid()],
    ]),
    allocation: allocateForCohort(resolution, DISTRIBUTABLE),
    distributableMinor: DISTRIBUTABLE,
  });

  it('gives the leftover halala to the lowest id and conserves the pool', () => {
    expect(assembled.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toStrictEqual([
      ['ben-a', 3_334n],
      ['ben-b', 3_333n],
      ['ben-c', 3_333n],
    ]);
    expect(assembled.totals.entitledMinor).toBe(10_000n);
    expect(assembled.totals.residualMinor).toBe(1n);
    expect(assembled.totals.retainedMinor).toBe(0n);
  });

  it('reports sharePercent derived from the allocated amount, which need NOT sum to 100', () => {
    expect(assembled.lines.map((line) => line.sharePercent)).toStrictEqual([
      '33.340000',
      '33.330000',
      '33.330000',
    ]);
    // A deliberate NON-assertion, recorded so nobody "fixes" it: `sharePercent` is display-only and
    // does not sum to 100.000000 in general (a three-way split of 100.01 does not). Making it sum
    // would mean stopping deriving it from the money, which is the one property that matters.
    expect(sharePercentOf(minorOf(3_334n), DISTRIBUTABLE)).toBe('33.340000');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — the states that break §08's I2/I3 as written (DEFECT-1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assembleLines — retainedMinor is what makes I2/I3 satisfiable (DEFECT-1)', () => {
  it('AT-06 — no eligible beneficiary: excluded lines survive, the pool is reported as retained', () => {
    const DISTRIBUTABLE = minorOf(27_500_000n);
    const resolution = resolutionOf([
      excludedMember('ben-001', 'BENEFICIARY_INACTIVE'),
      excludedMember('ben-002', 'ZERO_STIPULATED_WEIGHT'),
    ]);

    const { lines, totals, authorityNotices } = assembleLines({
      resolution,
      gateOutcomes: gatesFor([]),
      allocation: NO_ALLOCATION,
      distributableMinor: DISTRIBUTABLE,
    });

    // §08 says "zero PAYOUT lines", not zero lines: the record must show who was excluded and why.
    expect(lines.map((line) => [line.beneficiaryId, line.status, line.reasonCode])).toStrictEqual([
      ['ben-001', 'EXCLUDED', 'BENEFICIARY_INACTIVE'],
      ['ben-002', 'EXCLUDED', 'ZERO_STIPULATED_WEIGHT'],
    ]);
    expect(lines.every((line) => line.entitledMinor === 0n)).toBe(true);
    expect(authorityNotices).toStrictEqual([]);

    expect(totals.retainedMinor).toBe(27_500_000n);
    expect(totals.excludedCount).toBe(2);
    expect(totals.entitledLineCount).toBe(0);

    // §08's I3 AS WRITTEN is false here; the restated I3 holds. This is the regression test for the
    // correction, so it asserts BOTH halves.
    expect(totals.paidMinor + totals.withheldMinor + totals.crossBorderMinor).not.toBe(27_500_000n);
    expect(
      totals.paidMinor + totals.withheldMinor + totals.crossBorderMinor + totals.retainedMinor,
    ).toBe(27_500_000n);
  });

  it('worked example C2 — direct use WITH period revenue: no lines, everything retained', () => {
    // The resolver returns an empty cohort for NA_DIRECT_USE (I7), yet the waterfall still computed
    // a positive distributable (§08 line 54). This is the single case in which §08's I3 as written
    // reads `0 == 9_000_000`.
    const DISTRIBUTABLE = minorOf(9_000_000n);
    const resolution = resolutionOf([], {
      order: 'NA_DIRECT_USE',
      rule: 'NA_DIRECT_USE',
      entitledTabaqa: null,
    });

    const { lines, totals } = assembleLines({
      resolution,
      gateOutcomes: gatesFor([]),
      allocation: NO_ALLOCATION,
      distributableMinor: DISTRIBUTABLE,
    });

    expect(lines).toStrictEqual([]);
    expect(totals).toStrictEqual({
      paidMinor: 0n,
      withheldMinor: 0n,
      crossBorderMinor: 0n,
      retainedMinor: 9_000_000n,
      entitledMinor: 0n,
      excludedCount: 0,
      entitledLineCount: 0,
      residualMinor: 0n,
    });
  });

  it('the nil run: zero distributable, zero lines, every total zero', () => {
    const resolution = resolutionOf([], {
      order: 'NA_DIRECT_USE',
      rule: 'NA_DIRECT_USE',
      entitledTabaqa: null,
    });

    const { lines, totals } = assembleLines({
      resolution,
      gateOutcomes: gatesFor([]),
      allocation: NO_ALLOCATION,
      distributableMinor: minorOf(0n),
    });

    expect(lines).toStrictEqual([]);
    expect(totals.retainedMinor).toBe(0n);
    expect(totals.entitledMinor).toBe(0n);
  });

  it('refuses a nil cohort that arrives with a non-empty allocation', () => {
    const resolution = resolutionOf([excludedMember('ben-001', 'TABAQA_EXTINCT')]);

    expectDomainCode(
      () =>
        assembleLines({
          resolution,
          gateOutcomes: gatesFor([]),
          allocation: { amountsMinor: [minorOf(5n)], floorsMinor: [5n], residualMinor: 0n },
          distributableMinor: minorOf(100n),
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — refusals: a stage disagreement never becomes a payout
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assembleLines — cross-stage disagreements are refused, never smoothed over', () => {
  const DISTRIBUTABLE = minorOf(100n);

  /** ben-a : ben-b = 1 : 3 over 100 halalas → [25, 75]. Unequal, so order is detectable. */
  function twoEntitled(): EntitlementResolution {
    return resolutionOf([entitledMember('ben-a', '1'), entitledMember('ben-b', '3')]);
  }

  const bothPaid: readonly (readonly [string, GateOutcome])[] = [
    ['ben-a', paid()],
    ['ben-b', paid()],
  ];

  it('refuses an entitled beneficiary with no gate verdict rather than defaulting to PAID', () => {
    const resolution = twoEntitled();

    expectDomainCode(
      () =>
        assembleLines({
          resolution,
          gateOutcomes: gatesFor([['ben-a', paid()]]),
          allocation: allocateForCohort(resolution, DISTRIBUTABLE),
          distributableMinor: DISTRIBUTABLE,
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('refuses an allocation whose weight vector was NOT in ascending-id order', () => {
    // The failure this catches is silent: reversing an unequal weight vector conserves the total,
    // balances every total, and pays ben-a 0.75 of the pool instead of 0.25.
    const resolution = twoEntitled();
    const correct = allocateForCohort(resolution, DISTRIBUTABLE);
    const reversed = allocateMinor(DISTRIBUTABLE, ['3', '1'], HALF_UP);

    expect([...correct.amountsMinor]).toStrictEqual([25n, 75n]);
    expect([...reversed.amountsMinor]).toStrictEqual([75n, 25n]);

    expectDomainCode(
      () =>
        assembleLines({
          resolution,
          gateOutcomes: gatesFor(bothPaid),
          allocation: reversed,
          distributableMinor: DISTRIBUTABLE,
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('refuses an allocation with the wrong number of lines', () => {
    const resolution = twoEntitled();

    expectDomainCode(
      () =>
        assembleLines({
          resolution,
          gateOutcomes: gatesFor(bothPaid),
          allocation: allocateMinor(DISTRIBUTABLE, ['1', '3', '1'], HALF_UP),
          distributableMinor: DISTRIBUTABLE,
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('refuses an allocation computed against a DIFFERENT distributable pool', () => {
    const resolution = twoEntitled();

    expectDomainCode(
      () =>
        assembleLines({
          resolution,
          gateOutcomes: gatesFor(bothPaid),
          allocation: allocateForCohort(resolution, minorOf(101n)),
          distributableMinor: DISTRIBUTABLE,
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('refuses a negative distributable pool', () => {
    expectDomainCode(
      () =>
        assembleLines({
          resolution: twoEntitled(),
          gateOutcomes: gatesFor(bothPaid),
          allocation: NO_ALLOCATION,
          distributableMinor: minorOf(-1n),
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('refuses an entitled cohort whose deed weights are all zero', () => {
    // AT-06: a zero deed share is an EXCLUSION (ZERO_STIPULATED_WEIGHT) the resolver decides. If
    // such a member reaches Stage 5 still marked entitled, there is no basis on which to split.
    const resolution = resolutionOf([entitledMember('ben-a', '0'), entitledMember('ben-b', '0')]);

    expectDomainCode(
      () =>
        assembleLines({
          resolution,
          gateOutcomes: gatesFor(bothPaid),
          allocation: {
            amountsMinor: [minorOf(0n), minorOf(0n)],
            floorsMinor: [0n, 0n],
            residualMinor: 0n,
          },
          distributableMinor: DISTRIBUTABLE,
        }),
      'INVALID_ALLOCATION_WEIGHTS',
    );
  });

  const inconsistentResolutions: readonly {
    readonly label: string;
    readonly build: () => EntitlementResolution;
  }[] = [
    {
      label: 'an entitled row that also carries an exclusion reason',
      build: () => {
        const resolution = twoEntitled();
        const [first, ...rest] = resolution.resolved;
        if (first === undefined) throw new Error('fixture');
        return {
          ...resolution,
          resolved: [{ ...first, exclusionReason: 'TABAQA_EXTINCT' }, ...rest],
        };
      },
    },
    {
      label: 'an excluded row with no reason code',
      build: () => {
        const resolution = resolutionOf([
          entitledMember('ben-a', '1'),
          excludedMember('ben-b', 'TABAQA_EXTINCT'),
        ]);
        return {
          ...resolution,
          resolved: resolution.resolved.map((member) =>
            member.entitled ? member : { ...member, exclusionReason: null },
          ),
        };
      },
    },
    {
      label: 'entitledIds that disagree with the rows',
      build: () => ({ ...twoEntitled(), entitledIds: ['ben-a'] }),
    },
    {
      label: 'a duplicated entitledId',
      build: () => ({ ...twoEntitled(), entitledIds: ['ben-a', 'ben-a'] }),
    },
    {
      label: 'an excludedCount that disagrees with the rows',
      build: () => ({ ...twoEntitled(), excludedCount: 4 }),
    },
    {
      label: 'two rows for one beneficiary',
      build: () => {
        const resolution = twoEntitled();
        return {
          ...resolution,
          resolved: [...resolution.resolved, entitledMember('ben-a', '1')],
          entitledIds: ['ben-a', 'ben-a', 'ben-b'],
        };
      },
    },
  ];

  it.each(inconsistentResolutions)('refuses $label', ({ build }) => {
    expectDomainCode(
      () =>
        assembleLines({
          resolution: build(),
          gateOutcomes: gatesFor(bothPaid),
          allocation: {
            amountsMinor: [minorOf(25n), minorOf(75n)],
            floorsMinor: [25n, 75n],
            residualMinor: 0n,
          },
          distributableMinor: DISTRIBUTABLE,
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — output discipline (AT-16)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assembleLines — output discipline (AT-16)', () => {
  const DISTRIBUTABLE = minorOf(1_000_003n);
  const resolution = resolutionOf([
    entitledMember('ben-10', '1'),
    entitledMember('ben-2', '1'),
    entitledMember('ben-9', '1'),
    excludedMember('ben-1', 'UPPER_TABAQA_EXTANT'),
  ]);
  const assembled = assembleLines({
    resolution,
    gateOutcomes: gatesFor([
      ['ben-10', paid()],
      ['ben-2', crossBorder()],
      ['ben-9', withheld('CATEGORY_NOT_CAPTURED')],
    ]),
    allocation: allocateForCohort(resolution, DISTRIBUTABLE),
    distributableMinor: DISTRIBUTABLE,
  });

  it('emits exactly one line per resolved beneficiary, strictly ascending by id', () => {
    expect(assembled.lines.map((line) => line.beneficiaryId)).toStrictEqual([
      'ben-1',
      'ben-10',
      'ben-2',
      'ben-9',
    ]);
    for (let index = 1; index < assembled.lines.length; index += 1) {
      const previous = assembled.lines[index - 1]?.beneficiaryId ?? '';
      const current = assembled.lines[index]?.beneficiaryId ?? '';
      expect(compareBeneficiaryIds(previous, current)).toBe(-1);
    }
  });

  it('leaves no field undefined and no key absent — an absent value is an explicit null', () => {
    for (const line of assembled.lines) {
      expect(Object.keys(line).sort()).toStrictEqual([
        'bankingRefForProceeds',
        'basis',
        'beneficiaryId',
        'entitledMinor',
        'gateFlags',
        'reasonCode',
        'sharePercent',
        'status',
      ]);
      for (const [key, value] of Object.entries(line)) {
        expect(value, `lines[].${key}`).not.toBeUndefined();
      }
      expect(line.sharePercent.split('.')[1]).toHaveLength(6);
    }
  });

  it('conserves the pool with the residual placed by code-unit order, not numeric order', () => {
    // 1_000_003 / 3 → floors 333_334 each (Σ 1_000_002), residual 1, a three-way tie. The lowest id
    // in code-unit order is 'ben-10', NOT 'ben-2' — which is exactly why `localeCompare` is banned.
    expect(assembled.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toStrictEqual([
      ['ben-1', 0n],
      ['ben-10', 333_335n],
      ['ben-2', 333_334n],
      ['ben-9', 333_334n],
    ]);
    expect(assembled.totals.residualMinor).toBe(1n);
    expect(assembled.totals.entitledMinor + assembled.totals.retainedMinor).toBe(DISTRIBUTABLE);
  });

  it('produces a trace that is structured, stringly typed and free of PII', () => {
    const trace: readonly TraceStep[] = assembled.trace;

    expect(trace.length).toBeGreaterThan(0);
    for (const entry of trace) {
      expect(entry.stage).toBe('ALLOCATE');
      expect(entry.code).toMatch(/^ALLOCATE_[A-Z_]+$/);
      expect(entry.message.length).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(entry.data ?? {})) {
        // The trace is persisted and HASHED, so every datum must survive JSON as a string: a bigint
        // throws in `JSON.stringify`, and a name would put PII on the audit surface.
        expect(typeof value, `data.${key}`).toBe('string');
      }
    }

    // Ids are the only identifiers the trace may carry. `BeneficiaryInput` has no name field at
    // all, so the remaining leak risk is the banking reference — asserted absent.
    const serialized = JSON.stringify(trace);
    expect(serialized).toContain('ben-10');
    expect(serialized).not.toContain('FAKE-ACCT');
  });

  it('names an Authority notice by id only', () => {
    expect(assembled.authorityNotices).toHaveLength(1);
    expect(assembled.authorityNotices[0]).toMatchObject({
      type: 'CROSS_BORDER_DISBURSEMENT',
      beneficiaryId: 'ben-2',
      reasonCode: 'CROSS_BORDER_PENDING',
    });
    expect(Object.keys(assembled.authorityNotices[0] ?? {}).sort()).toStrictEqual([
      'beneficiaryId',
      'reason',
      'reasonCode',
      'type',
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assembleLines — properties over generated cohorts
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface GeneratedCohort {
  readonly resolution: EntitlementResolution;
  readonly gateOutcomes: ReadonlyMap<string, GateOutcome>;
  readonly distributableMinor: Minor;
}

const cohortArb: fc.Arbitrary<GeneratedCohort> = fc
  .record({
    total: totalArb,
    members: fc
      .array(
        fc.record({
          index: fc.integer({ min: 0, max: 400 }),
          weight: weightArb,
          entitled: fc.boolean(),
          outcome: gateOutcomeArb,
        }),
        { minLength: 1, maxLength: 14 },
      )
      .map((rows) => {
        // Unique ids — `assertInputConsistency` guarantees this upstream, and the split keys on it.
        const seen = new Set<number>();
        return rows.filter((row) => {
          if (seen.has(row.index)) return false;
          seen.add(row.index);
          return true;
        });
      })
      // At least one entitled member with a non-zero weight, so the split has a basis at all.
      .filter((rows) => rows.some((row) => row.entitled && /[1-9]/.test(row.weight))),
  })
  .map(({ total, members }) => {
    const idOf = (index: number): string => `ben-${String(index).padStart(3, '0')}`;
    const resolution = resolutionOf(
      members.map((row) =>
        row.entitled
          ? entitledMember(idOf(row.index), row.weight)
          : excludedMember(idOf(row.index), 'BENEFICIARY_INACTIVE'),
      ),
      { order: 'SHARED', rule: 'SHARED_ALL_LIVING_TABAQAT', entitledTabaqa: null },
    );
    const gateOutcomes = new Map<string, GateOutcome>();
    for (const row of members) {
      if (row.entitled) gateOutcomes.set(idOf(row.index), row.outcome);
    }
    return { resolution, gateOutcomes, distributableMinor: minorOf(total) };
  });

describe('assembleLines — properties over generated cohorts', () => {
  it('conserves distributable in every state (restated I2 + I3), with no negative total', () => {
    fc.assert(
      fc.property(cohortArb, ({ resolution, gateOutcomes, distributableMinor }) => {
        const { lines, totals } = assembleLines({
          resolution,
          gateOutcomes,
          allocation: allocateForCohort(resolution, distributableMinor),
          distributableMinor,
        });

        const fromLines = sumBigints(
          lines.filter((line) => line.status !== 'EXCLUDED').map((line) => line.entitledMinor),
        );

        expect(fromLines).toBe(totals.entitledMinor);
        expect(totals.entitledMinor + totals.retainedMinor).toBe(distributableMinor);
        expect(
          totals.paidMinor + totals.withheldMinor + totals.crossBorderMinor + totals.retainedMinor,
        ).toBe(distributableMinor);

        for (const line of lines) {
          expect(line.entitledMinor >= 0n).toBe(true);
          if (line.status === 'EXCLUDED') expect(line.entitledMinor).toBe(0n);
        }
        expect(totals.residualMinor >= 0n).toBe(true);
        expect(
          totals.entitledLineCount === 0 || totals.residualMinor < BigInt(totals.entitledLineCount),
        ).toBe(true);
        expect(lines).toHaveLength(resolution.resolved.length);
      }),
      { numRuns: 1_000, seed: 20_260_730 },
    );
  });

  it('withhold isolation: changing one gate verdict changes no line’s amount (I6)', () => {
    fc.assert(
      fc.property(
        cohortArb,
        gateOutcomeArb,
        ({ resolution, gateOutcomes, distributableMinor }, replacement) => {
          const allocation = allocateForCohort(resolution, distributableMinor);
          const baseline = assembleLines({
            resolution,
            gateOutcomes,
            allocation,
            distributableMinor,
          });

          const firstEntitled = resolution.entitledIds[0];
          if (firstEntitled === undefined) return;

          const flipped = new Map(gateOutcomes);
          flipped.set(firstEntitled, replacement);
          const after = assembleLines({
            resolution,
            gateOutcomes: flipped,
            allocation,
            distributableMinor,
          });

          const amountsOf = (
            lines: readonly DistributionLine[],
          ): readonly (readonly [string, bigint])[] =>
            lines.map((line) => [line.beneficiaryId, line.entitledMinor] as const);

          expect(amountsOf(after.lines)).toStrictEqual(amountsOf(baseline.lines));
          expect(after.totals.entitledMinor).toBe(baseline.totals.entitledMinor);
          expect(after.totals.retainedMinor).toBe(baseline.totals.retainedMinor);
        },
      ),
      { numRuns: 500, seed: 20_260_730 },
    );
  });

  it('is deterministic across repeated runs (I8)', () => {
    fc.assert(
      fc.property(cohortArb, ({ resolution, gateOutcomes, distributableMinor }) => {
        const args = {
          resolution,
          gateOutcomes,
          allocation: allocateForCohort(resolution, distributableMinor),
          distributableMinor,
        };
        expect(assembleLines(args)).toStrictEqual(assembleLines(args));
      }),
      { numRuns: 300, seed: 20_260_730 },
    );
  });
});
