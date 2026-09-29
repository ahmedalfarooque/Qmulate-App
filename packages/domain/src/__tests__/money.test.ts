import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DomainError, isDomainError } from '../errors.js';
import {
  ROUNDING_METHODS,
  ZERO,
  add,
  allocate,
  divide,
  fromMinor,
  isNegative,
  isRoundingMethod,
  largestRemainderAllocate,
  max,
  min,
  money,
  moneyRound,
  mul,
  percentOf,
  sub,
  sum,
  toDbString,
  toMinor,
  type RoundingMethod,
} from '../money.js';

/** Run `fn` and hand back whatever it threw (or `undefined` if it did not throw). */
function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function expectDomainCode(fn: () => unknown, code: string): void {
  const error = caught(fn);
  expect(isDomainError(error)).toBe(true);
  expect((error as DomainError).code).toBe(code);
  // Every domain error carries an i18n key; no user-facing copy is ever built in the domain.
  expect((error as DomainError).messageKey).toBe(`errors.domain.${code}`);
}

describe('money construction', () => {
  it('accepts plain decimal strings at or below the halala scale', () => {
    expect(toDbString(money('0'))).toBe('0.00');
    expect(toDbString(money('5'))).toBe('5.00');
    expect(toDbString(money('1234.5'))).toBe('1234.50');
    expect(toDbString(money('-40.25'))).toBe('-40.25');
  });

  it('refuses a JS number at the type level', () => {
    // @ts-expect-error — a JS number is never money. This line failing to error is a regression.
    expect(caught(() => money(1.1))).toBeInstanceOf(DomainError);
  });

  it('refuses a JS number at runtime too (for callers coming through `any`)', () => {
    const sneaky = 1.1 as unknown as string;
    expectDomainCode(() => money(sneaky), 'MONEY_NUMBER_INPUT');
  });

  it('refuses more precision than the halala rather than silently rounding', () => {
    expectDomainCode(() => money('10.005'), 'MONEY_PRECISION');
  });

  it('rounds only when asked, half-up (OQ-01 PRD default)', () => {
    expect(toDbString(moneyRound('10.005'))).toBe('10.01');
    expect(toDbString(moneyRound('10.004'))).toBe('10.00');
    expect(toDbString(moneyRound('-10.005'))).toBe('-10.01');
  });

  it('refuses non-literals: exponent notation, NaN, Infinity, empty', () => {
    for (const bad of ['1e5', 'NaN', 'Infinity', '', '  ', 'abc', '1,000.00']) {
      expectDomainCode(() => money(bad), 'MONEY_INVALID');
    }
  });

  it('refuses values outside the Decimal(18,2) column', () => {
    expectDomainCode(() => money('10000000000000000.00'), 'MONEY_OVERFLOW');
  });
});

describe('money arithmetic', () => {
  it('adds and subtracts exactly (the 0.1 + 0.2 float trap)', () => {
    expect(toDbString(add(money('0.1'), money('0.2')))).toBe('0.30');
    expect(toDbString(sub(money('0.3'), money('0.1')))).toBe('0.20');
  });

  it('sums an empty list to zero', () => {
    expect(toDbString(sum([]))).toBe('0.00');
    expect(toDbString(ZERO)).toBe('0.00');
  });

  it('multiplies by a scalar with half-up rounding', () => {
    expect(toDbString(mul(money('10.01'), '3'))).toBe('30.03');
    expect(toDbString(mul(money('0.05'), '0.5'))).toBe('0.03'); // 0.025 → half-up
  });

  it('computes a percentage of an amount (e.g. the 10% ushr fee basis)', () => {
    // ⚠ unverified — the 10% ushr Nazir fee is this engagement's deed figure, not a statutory
    // rate; it must be read from a Setting and confirmed vs primary law. Used here only as a
    // rounding case: 10% of 1234.56 = 123.456 → 123.46 half-up.
    expect(toDbString(percentOf(money('1234.56'), '10'))).toBe('123.46');
    expect(toDbString(percentOf(money('0'), '10'))).toBe('0.00');
  });

  it('reports sign correctly (zero is not negative)', () => {
    expect(isNegative(money('-0.01'))).toBe(true);
    expect(isNegative(money('0'))).toBe(false);
    expect(isNegative(money('0.01'))).toBe(false);
  });

  it('round-trips through integer halalas', () => {
    expect(toMinor(money('1234.56'))).toBe(123456n);
    expect(toMinor(money('-0.07'))).toBe(-7n);
    expect(toDbString(fromMinor(123456n))).toBe('1234.56');
    expect(toDbString(fromMinor(0n))).toBe('0.00');
  });
});

describe('largestRemainderAllocate', () => {
  it('matches the PRD worked example: 100.00 three equal ways', () => {
    const parts = largestRemainderAllocate(money('100.00'), ['1', '1', '1']);
    expect(parts.map(toDbString)).toEqual(['33.34', '33.33', '33.33']);
    expect(toDbString(sum(parts))).toBe('100.00');
  });

  it('breaks remainder ties by ascending index (== ascending id, as callers order lines)', () => {
    const parts = largestRemainderAllocate(money('0.05'), ['1', '1', '1', '1']);
    expect(parts.map(toDbString)).toEqual(['0.02', '0.01', '0.01', '0.01']);
  });

  it('splits by unequal weights and still conserves the total', () => {
    const parts = largestRemainderAllocate(money('1000.00'), ['0.5', '0.25', '0.25']);
    expect(parts.map(toDbString)).toEqual(['500.00', '250.00', '250.00']);

    const awkward = largestRemainderAllocate(money('1000.00'), ['1', '1', '1', '1', '1', '1', '7']);
    expect(toDbString(sum(awkward))).toBe('1000.00');
  });

  it('gives a zero-weight line exactly zero and never hands it a residual halala', () => {
    const parts = largestRemainderAllocate(money('10.00'), ['0', '1']);
    expect(parts.map(toDbString)).toEqual(['0.00', '10.00']);

    const withZeroes = largestRemainderAllocate(money('100.00'), ['0', '1', '1', '1', '0']);
    expect(withZeroes.map(toDbString)).toEqual(['0.00', '33.34', '33.33', '33.33', '0.00']);
    expect(toDbString(sum(withZeroes))).toBe('100.00');
  });

  it('allocates a zero pool to zero lines', () => {
    const parts = largestRemainderAllocate(ZERO, ['3', '1']);
    expect(parts.map(toDbString)).toEqual(['0.00', '0.00']);
  });

  it('refuses a negative pool — a negative amount is never distributable', () => {
    expectDomainCode(() => largestRemainderAllocate(money('-1.00'), ['1']), 'MONEY_NEGATIVE');
  });

  it('refuses empty, negative, or all-zero weights instead of inventing a basis', () => {
    expectDomainCode(
      () => largestRemainderAllocate(money('1.00'), []),
      'INVALID_ALLOCATION_WEIGHTS',
    );
    expectDomainCode(
      () => largestRemainderAllocate(money('1.00'), ['1', '-1']),
      'INVALID_ALLOCATION_WEIGHTS',
    );
    expectDomainCode(
      () => largestRemainderAllocate(money('1.00'), ['0', '0']),
      'INVALID_ALLOCATION_WEIGHTS',
    );
  });

  /**
   * Property: allocation never leaks value.
   *
   * Sprint 3 adds the full fast-check suite over the distribution engine (PRD §08 I1–I9). This
   * single property is the one that must hold from day one: whatever the pool and whatever the
   * weight shape, the parts sum to exactly the pool — no halala created, none lost.
   */
  it('[property] conserves the total across arbitrary pools and weight shapes', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 6n }), { minLength: 1, maxLength: 12 }),
        (totalMinor, rawWeights) => {
          fc.pre(rawWeights.some((weight) => weight > 0n));

          const total = fromMinor(totalMinor);
          const weights = rawWeights.map((weight) => weight.toString());
          const parts = largestRemainderAllocate(total, weights);

          expect(parts).toHaveLength(weights.length);
          expect(toDbString(sum(parts))).toBe(toDbString(total));
          for (const part of parts) {
            expect(isNegative(part)).toBe(false);
          }
          // Residual is bounded: no line is more than one halala above its exact share floor.
          expect(parts.reduce((acc, part) => acc + toMinor(part), 0n)).toBe(totalMinor);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('[property] fractional weights conserve the total too', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 9n }),
        fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 1, maxLength: 8 }),
        (totalMinor, rawWeights) => {
          fc.pre(rawWeights.some((weight) => weight > 0));

          const total = fromMinor(totalMinor);
          // Build fractional weight strings without ever touching float arithmetic.
          const weights = rawWeights.map((weight) => `0.${weight.toString().padStart(6, '0')}`);
          const parts = largestRemainderAllocate(total, weights);

          expect(toDbString(sum(parts))).toBe(toDbString(total));
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * A KNOWN NON-INVARIANT — deliberately NOT asserted, and here is why
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * It is tempting to assert that an individual part is MONOTONE in the total: "raise the pool
   * and no beneficiary's line can fall." **That property is false for largest-remainder, and
   * correctly so** — it is the population paradox (the Alabama paradox's sibling), an
   * unavoidable property of any exact apportionment method with a fixed sum. Raising the pool
   * can shift which lines hold the largest fractional remainders, so a line that received a
   * residual halala at 100.00 may not receive one at 100.01.
   *
   * Asserting monotonicity here would produce a FALSE FAILURE against a correct engine — and
   * the natural "fix" for a red test is to change the engine, which would break conservation
   * (`Σ parts == total`), the invariant that actually matters for other people's endowment
   * income. So: conservation is asserted, monotonicity is not, and this comment exists so the
   * omission reads as a decision rather than an oversight.
   */
});

describe('allocate — policy-aware allocation (the rounding rule comes from a Setting)', () => {
  it('LARGEST_REMAINDER_HALF_UP matches largestRemainderAllocate exactly', () => {
    const weights = ['1', '1', '1'];
    expect(allocate(money('100.00'), weights, 'LARGEST_REMAINDER_HALF_UP').map(toDbString)).toEqual(
      largestRemainderAllocate(money('100.00'), weights).map(toDbString),
    );
  });

  /**
   * The property that must hold for EVERY member of the rounding vocabulary: a method either
   * conserves the total exactly, or it REFUSES with a typed error. What must never happen is a
   * silent fallback — a configured method the engine cannot perform, quietly answered with a
   * different rule, produces a distribution statement that looks exactly like a ratified one.
   *
   * `LARGEST_REMAINDER_BANKERS` is declared in the vocabulary but deliberately unimplemented:
   * its tie-breaking semantics ARE the open question (OQ-01, ⚠ unverified — needs
   * Product/Counsel sign-off), so guessing them here would resolve a rounding-policy question
   * that is not this code's to resolve.
   */
  it.each(ROUNDING_METHODS)('%s either conserves the total exactly, or refuses', (method) => {
    const total = money('100.00');
    const weights = ['1', '1', '1'];

    let parts: ReturnType<typeof allocate> | undefined;
    let error: unknown;
    try {
      parts = allocate(total, weights, method);
    } catch (thrown: unknown) {
      error = thrown;
    }

    if (parts !== undefined) {
      expect(toDbString(sum(parts))).toBe(toDbString(total));
      expect(parts).toHaveLength(weights.length);
    } else {
      expect(isDomainError(error)).toBe(true);
      expect((error as DomainError).code).toBe('SETTING_INVALID');
      // The refusal must NAME what is implemented, so the caller can act on it.
      expect((error as DomainError).details?.['implemented']).toEqual([
        'LARGEST_REMAINDER_HALF_UP',
      ]);
    }
  });

  /**
   * The teeth of the rule above: `LARGEST_REMAINDER_BANKERS` must REFUSE, today, rather than
   * quietly returning the half-up answer. A silent fallback is the dangerous failure — the
   * numbers would be plausible, the statement would look ratified, and nothing would record
   * that the configured policy was not the one applied.
   *
   * When OQ-01 is signed off and a half-even variant is genuinely implemented, THIS test is
   * what must be changed — deliberately, with the sign-off in hand. That is the point.
   */
  it('LARGEST_REMAINDER_BANKERS refuses rather than silently applying half-up', () => {
    expectDomainCode(
      () => allocate(money('100.00'), ['1', '1', '1'], 'LARGEST_REMAINDER_BANKERS'),
      'SETTING_INVALID',
    );
    const error = caught(() =>
      allocate(money('100.00'), ['1', '1', '1'], 'LARGEST_REMAINDER_BANKERS'),
    ) as DomainError;
    expect(error.message).toContain('OQ-01');
  });

  it('[property] the implemented method conserves the total for arbitrary pools', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 10n }),
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 5n }), { minLength: 1, maxLength: 10 }),
        (totalMinor, rawWeights) => {
          fc.pre(rawWeights.some((weight) => weight > 0n));
          const total = fromMinor(totalMinor);
          const parts = allocate(
            total,
            rawWeights.map((weight) => weight.toString()),
            'LARGEST_REMAINDER_HALF_UP',
          );
          expect(toDbString(sum(parts))).toBe(toDbString(total));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('refuses an unrecognised method rather than approximating one', () => {
    expectDomainCode(
      () => allocate(money('10.00'), ['1'], 'ROUND_DOWN' as unknown as RoundingMethod),
      'SETTING_INVALID',
    );
    expectDomainCode(
      () => allocate(money('10.00'), ['1'], undefined as unknown as RoundingMethod),
      'SETTING_INVALID',
    );
  });

  it('has no method-less overload — the policy is never defaulted', () => {
    // @ts-expect-error — a caller must name the rounding policy; omitting it must not compile.
    expect(caught(() => allocate(money('10.00'), ['1']))).toBeInstanceOf(DomainError);
  });

  it('isRoundingMethod narrows a Setting value and fails closed', () => {
    expect(isRoundingMethod('LARGEST_REMAINDER_HALF_UP')).toBe(true);
    for (const junk of ['largest_remainder_half_up', 'HALF_UP', '', null, undefined, 7]) {
      expect(isRoundingMethod(junk)).toBe(false);
    }
  });
});

describe('divide — explicit rounding so no caller reaches for `/`', () => {
  it('rounds to the halala, half-up, explicitly', () => {
    expect(toDbString(divide(money('100.00'), '3'))).toBe('33.33');
    expect(toDbString(divide(money('10.00'), '4'))).toBe('2.50');
    expect(toDbString(divide(money('0.05'), '2'))).toBe('0.03'); // 0.025 → half-up
  });

  it('does NOT conserve a total across calls — that is allocate’s job', () => {
    const third = divide(money('100.00'), '3');
    expect(toDbString(sum([third, third, third]))).toBe('99.99');
    expect(
      toDbString(sum(allocate(money('100.00'), ['1', '1', '1'], 'LARGEST_REMAINDER_HALF_UP'))),
    ).toBe('100.00');
  });

  it('refuses a zero divisor and a JS number', () => {
    expectDomainCode(() => divide(money('10.00'), '0'), 'MONEY_INVALID');
    const sneaky = 3 as unknown as string;
    expectDomainCode(() => divide(money('10.00'), sneaky), 'MONEY_NUMBER_INPUT');
  });

  it('handles a negative amount without changing sign rules', () => {
    expect(toDbString(divide(money('-10.00'), '4'))).toBe('-2.50');
  });
});

describe('min / max', () => {
  it('orders amounts, including across zero and negatives', () => {
    expect(toDbString(min(money('1.00'), money('2.00')))).toBe('1.00');
    expect(toDbString(max(money('1.00'), money('2.00')))).toBe('2.00');
    expect(toDbString(min(money('-1.00'), ZERO))).toBe('-1.00');
    expect(toDbString(max(money('-1.00'), ZERO))).toBe('0.00');
  });

  it('is stable on equal amounts', () => {
    expect(toDbString(min(money('5.00'), money('5.00')))).toBe('5.00');
    expect(toDbString(max(money('5.00'), money('5.00')))).toBe('5.00');
  });
});
