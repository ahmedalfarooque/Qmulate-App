/**
 * Money — exact decimal arithmetic for QMULATE.
 *
 * ## The one rule
 * **A JS `number` is never money.** Every function here accepts `string | Decimal` and returns
 * `Money`; passing a `number` is a *type* error (and a runtime error if it slips past `any`).
 * Binary floats cannot represent halalas exactly, and this system distributes other people's
 * endowment income.
 *
 * ## Representation
 * - `Money` is a branded `decimal.js` `Decimal` held at exactly **2 decimal places** — the
 *   halala scale (1 SAR = 100 halalas) — matching the Prisma `Decimal @db.Decimal(18,2)` column.
 * - Construction (`money`) **rejects** more than 2 dp rather than silently rounding. Rounding is
 *   always an explicit call (`moneyRound`) or an operation documented to round (`mul`,
 *   `percentOf`, `largestRemainderAllocate`).
 * - Splitting works in **integer minor units (halalas, `bigint`)** so allocation arithmetic is
 *   exact and conservation is provable, not approximate. See PRD §08 stage 5.
 *
 * ## Rounding policy
 * // TODO(surface): OQ-01 rounding policy — PRD default (largest-remainder + half-up); needs
 * // Product/Counsel sign-off before real data. Open sub-questions: (1) half-up vs half-even vs
 * // truncate at the halala; (2) where the residual goes — this module hands it to the largest
 * // fractional remainders (tie-broken by ascending index, i.e. ascending id when the caller
 * // orders lines by id), which keeps `Σ parts == total` exactly. If Counsel chooses
 * // carry-forward-to-next-period instead, that is a *caller* concern: this function still
 * // conserves the total, and the caller decides whether the last halala is paid or carried.
 */

import Decimal from 'decimal.js';
import { DomainError } from './errors.js';

/**
 * A private `Decimal` constructor. Cloned rather than configured globally so this package can
 * never change decimal.js behaviour for anything else in the monorepo.
 *
 * - `precision: 40` — far beyond `Decimal(18,2)`, so intermediate products/quotients are exact
 *   for every realistic waqf figure.
 * - `rounding: ROUND_HALF_UP` — the PRD default (OQ-01, unresolved; see the TODO above).
 * - `toExpNeg`/`toExpPos` pushed out so `toString()`/`toFixed()` never emit exponent notation
 *   (a `1e+21` reaching a Prisma `Decimal` column would be a silent corruption).
 */
const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
  modulo: Decimal.ROUND_DOWN,
});

/** Decimal places money is held at: halalas. */
export const MONEY_SCALE = 2;

/** Minor units per major unit: 100 halalas = 1 SAR. */
export const MINOR_UNITS_PER_MAJOR = 100n;

/** Largest magnitude representable in the `Decimal(18,2)` column money is stored in. */
const MAX_DB_MAGNITUDE = new MoneyDecimal('9999999999999999.99');

/** Ceiling on weight precision in `largestRemainderAllocate`, to bound bigint growth. */
const MAX_WEIGHT_DECIMAL_PLACES = 18;

/** Decimal literal: optional sign, digits, optional fraction. Exponent notation is rejected. */
const DECIMAL_LITERAL = /^[+-]?\d+(\.\d+)?$/;

declare const MONEY_BRAND: unique symbol;

/**
 * An exact monetary amount at the halala (2 dp) scale.
 *
 * Structurally a `decimal.js` `Decimal`, so every read-only `Decimal` method is available; the
 * brand stops an arbitrary `Decimal` (an unrounded intermediate, a share fraction, a percentage)
 * being passed where a settled amount is required.
 */
export type Money = Decimal & { readonly [MONEY_BRAND]: 'Money' };

/**
 * What may be turned into `Money`. **`number` is deliberately absent** — that omission is the
 * type-level ban on floats in money paths.
 */
export type MoneyInput = string | Decimal;

/** A non-negative allocation weight (a share, a ratio, a headcount). Same float ban applies. */
export type AllocationWeight = string | Decimal;

function rejectNumber(value: unknown, context: string): void {
  if (typeof value === 'number') {
    throw new DomainError(
      'MONEY_NUMBER_INPUT',
      `${context}: a JS number is not money (binary floats cannot hold halalas exactly). Pass a decimal string or a Decimal.`,
      { details: { context } },
    );
  }
}

function toDecimal(value: MoneyInput, context: string): Decimal {
  rejectNumber(value, context);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!DECIMAL_LITERAL.test(trimmed)) {
      throw new DomainError(
        'MONEY_INVALID',
        `${context}: "${trimmed}" is not a plain decimal literal (exponent notation, NaN, Infinity and empty strings are rejected).`,
        { details: { context } },
      );
    }
    return new MoneyDecimal(trimmed);
  }

  if (!Decimal.isDecimal(value)) {
    throw new DomainError(
      'MONEY_INVALID',
      `${context}: expected a decimal string or a Decimal instance.`,
      { details: { context } },
    );
  }

  const asDecimal = new MoneyDecimal(value);
  if (!asDecimal.isFinite()) {
    throw new DomainError('MONEY_INVALID', `${context}: value is not finite.`, {
      details: { context },
    });
  }
  return asDecimal;
}

function assertInRange(value: Decimal, context: string): void {
  if (value.abs().greaterThan(MAX_DB_MAGNITUDE)) {
    throw new DomainError(
      'MONEY_OVERFLOW',
      `${context}: value exceeds the Decimal(18,2) range money is stored in.`,
      { details: { context } },
    );
  }
}

/**
 * Build a `Money` from a decimal string or a `Decimal`.
 *
 * Throws `MONEY_PRECISION` if the value carries more than 2 dp — rounding money is never
 * implicit. Use {@link moneyRound} when rounding is intended.
 */
export function money(value: MoneyInput): Money {
  const decimal = toDecimal(value, 'money');

  if (decimal.decimalPlaces() > MONEY_SCALE) {
    throw new DomainError(
      'MONEY_PRECISION',
      `money: "${decimal.toString()}" has more than ${String(MONEY_SCALE)} decimal places. Money is held at the halala; round explicitly with moneyRound().`,
      { details: { decimalPlaces: decimal.decimalPlaces() } },
    );
  }

  assertInRange(decimal, 'money');
  return decimal as Money;
}

/**
 * Build a `Money` by rounding to the halala.
 *
 * Rounds **half-up** (PRD default — see the OQ-01 TODO at the top of this file). Use this only
 * where rounding is a deliberate, explainable step: it is a value judgement, not plumbing.
 */
export function moneyRound(value: MoneyInput): Money {
  const decimal = toDecimal(value, 'moneyRound');
  const rounded = decimal.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
  assertInRange(rounded, 'moneyRound');
  return rounded as Money;
}

/** Zero riyals. */
export const ZERO: Money = money('0');

/** `a + b`. Exact — no rounding is possible at the halala scale. */
export function add(a: Money, b: Money): Money {
  return money(a.plus(b));
}

/** `a - b`. Exact. May be negative (an expense line, a reversal). */
export function sub(a: Money, b: Money): Money {
  return money(a.minus(b));
}

/** Sum of a list; the empty list sums to zero. Exact. */
export function sum(values: readonly Money[]): Money {
  let total: Money = ZERO;
  for (const value of values) {
    total = add(total, value);
  }
  return total;
}

/**
 * `amount × factor`, rounded half-up to the halala.
 *
 * `factor` is a dimensionless scalar (a share fraction, a unit count) — never another `Money`;
 * money times money is dimensionally meaningless.
 */
export function mul(amount: Money, factor: MoneyInput): Money {
  const scalar = toDecimal(factor, 'mul');
  return moneyRound(amount.times(scalar));
}

/**
 * `percent`% of `amount`, rounded half-up to the halala.
 *
 * `percent` is expressed out of 100 (`'10'` = 10%). Callers must read the rate from a `Setting`,
 * never a literal: the ʿushr Nazir fee (10% of revenue, per this engagement's deed) and the
 * Authority's ≤10%-of-net-income fee are both **⚠ unverified — confirm vs primary law**.
 */
export function percentOf(amount: Money, percent: MoneyInput): Money {
  const rate = toDecimal(percent, 'percentOf');
  return moneyRound(amount.times(rate).dividedBy(100));
}

/** True when the amount is strictly less than zero. */
export function isNegative(value: Money): boolean {
  return value.lessThan(0);
}

/** True when the amount is exactly zero. */
export function isZero(value: Money): boolean {
  return value.isZero();
}

/** True when the amount is strictly greater than zero. */
export function isPositive(value: Money): boolean {
  return value.greaterThan(0);
}

/** Exact equality at the halala scale. */
export function equals(a: Money, b: Money): boolean {
  return a.equals(b);
}

/** `-1` when `a < b`, `0` when equal, `1` when `a > b`. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  return a.comparedTo(b) as -1 | 0 | 1;
}

/** Absolute value. */
export function abs(value: Money): Money {
  return money(value.abs());
}

/** Sign-flipped value. */
export function negate(value: Money): Money {
  return money(value.negated());
}

/**
 * The exact 2-dp fixed string for a Prisma `Decimal(18,2)` column.
 *
 * Always the DB boundary format: never `toString()` (may drop trailing zeros) and never
 * `toNumber()` (reintroduces a float).
 */
export function toDbString(value: Money): string {
  return value.toFixed(MONEY_SCALE);
}

/** Integer halalas. Exact by construction — `Money` is always at the halala scale. */
export function toMinor(value: Money): bigint {
  const scaled = value.times(Number(MINOR_UNITS_PER_MAJOR));
  if (!scaled.isInteger()) {
    throw new DomainError(
      'MONEY_PRECISION',
      `toMinor: "${value.toString()}" is not a whole number of halalas.`,
    );
  }
  return BigInt(scaled.toFixed(0));
}

/** `Money` from integer halalas. */
export function fromMinor(minor: bigint): Money {
  const asDecimal = new MoneyDecimal(minor.toString()).dividedBy(Number(MINOR_UNITS_PER_MAJOR));
  return money(asDecimal);
}

/**
 * Split `total` across `weights` so the parts sum to **exactly** `total`.
 *
 * Method: **largest remainder (Hamilton)** on integer halalas.
 * 1. Weights are scaled to integers, so every quotient and remainder below is exact bigint
 *    arithmetic — no float, no accumulated drift.
 * 2. Each line takes the floor of `total × wᵢ / Σw` halalas.
 * 3. The leftover halalas (strictly fewer than the number of lines) go one each to the lines
 *    with the largest fractional remainders, ties broken by **ascending index** — so a caller
 *    that orders lines by ascending id gets the deterministic result the PRD specifies
 *    (100.00 three ways → 33.34 / 33.33 / 33.33).
 * 4. Conservation is asserted before returning: `Σ parts == total`, or it throws
 *    `ALLOCATION_IMBALANCE` rather than returning money that does not add up.
 *
 * Zero-weight lines receive exactly zero and are never handed a residual halala.
 *
 * // TODO(surface): OQ-01 — rounding direction and residual destination are still
 * // [Product] + [Counsel] decisions; this implements the PRD's proposed default only.
 */
export function largestRemainderAllocate(
  total: Money,
  weights: readonly AllocationWeight[],
): Money[] {
  if (weights.length === 0) {
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      'largestRemainderAllocate: at least one weight is required.',
    );
  }

  if (isNegative(total)) {
    throw new DomainError(
      'MONEY_NEGATIVE',
      'largestRemainderAllocate: the total to allocate must be zero or positive. A negative pool is never distributable.',
    );
  }

  const weightDecimals = weights.map((weight) => {
    const decimal = toDecimal(weight, 'largestRemainderAllocate');
    if (decimal.isNegative()) {
      throw new DomainError(
        'INVALID_ALLOCATION_WEIGHTS',
        'largestRemainderAllocate: weights must be non-negative.',
      );
    }
    if (decimal.decimalPlaces() > MAX_WEIGHT_DECIMAL_PLACES) {
      throw new DomainError(
        'INVALID_ALLOCATION_WEIGHTS',
        `largestRemainderAllocate: weights may carry at most ${String(MAX_WEIGHT_DECIMAL_PLACES)} decimal places.`,
        { details: { decimalPlaces: decimal.decimalPlaces() } },
      );
    }
    return decimal;
  });

  // Common scale → exact integer weights.
  const weightScale = weightDecimals.reduce(
    (max, decimal) => Math.max(max, decimal.decimalPlaces()),
    0,
  );
  const scaleFactor = new MoneyDecimal(10).pow(weightScale);
  const weightIntegers = weightDecimals.map((decimal) =>
    BigInt(decimal.times(scaleFactor).toFixed(0)),
  );
  const weightTotal = weightIntegers.reduce((acc, value) => acc + value, 0n);

  if (weightTotal === 0n) {
    throw new DomainError(
      'INVALID_ALLOCATION_WEIGHTS',
      'largestRemainderAllocate: weights sum to zero — there is no basis on which to split.',
    );
  }

  const totalMinor = toMinor(total);

  const lines = weightIntegers.map((weightInteger, index) => {
    const numerator = totalMinor * weightInteger;
    const floorMinor = numerator / weightTotal; // both operands non-negative → truncation is floor
    return { index, floorMinor, remainder: numerator - floorMinor * weightTotal };
  });

  const allocatedMinor = lines.reduce((acc, line) => acc + line.floorMinor, 0n);
  let residualMinor = totalMinor - allocatedMinor;

  // Largest remainder first; ties by ascending index (== ascending id, when callers order by id).
  const byRemainder = [...lines].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return b.remainder > a.remainder ? 1 : -1;
  });

  const bumped = new Set<number>();
  for (const line of byRemainder) {
    if (residualMinor <= 0n) break;
    bumped.add(line.index);
    residualMinor -= 1n;
  }

  const parts = lines.map((line) =>
    fromMinor(line.floorMinor + (bumped.has(line.index) ? 1n : 0n)),
  );

  // Conservation invariant (PRD §08 I2/I9). A failure here is a bug, never a data problem.
  if (!equals(sum(parts), total)) {
    throw new DomainError(
      'ALLOCATION_IMBALANCE',
      'largestRemainderAllocate: allocated parts do not sum to the total. Refusing to return money that does not add up.',
      { details: { totalMinor: totalMinor.toString(), lineCount: lines.length } },
    );
  }

  return parts;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Policy-aware allocation, division, and ordering (E2 additions)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The rounding-policy vocabulary — **the same list the `distribution.rounding.method` Setting
 * accepts** (`./settings.ts` derives its enum from this constant, so the config vocabulary and
 * the engine's capability cannot drift into disagreement).
 *
 * ⚠ **unverified — needs Product/Counsel sign-off before real data.** OQ-01 is open. The PRD's
 * proposed default is largest-remainder + half-up, and that is the only method with settled
 * semantics; see {@link allocate}.
 */
export const ROUNDING_METHODS = ['LARGEST_REMAINDER_HALF_UP', 'LARGEST_REMAINDER_BANKERS'] as const;

/** A distribution rounding policy. Always read from a `Setting`; never a literal at a call site. */
export type RoundingMethod = (typeof ROUNDING_METHODS)[number];

/** Narrow an untrusted string (a `Setting` value off a database row) to a rounding method. */
export function isRoundingMethod(value: unknown): value is RoundingMethod {
  return typeof value === 'string' && (ROUNDING_METHODS as readonly string[]).includes(value);
}

/**
 * Split `total` across `weights` under an explicitly-named rounding policy.
 *
 * The policy is a **parameter, never a default**: callers read it from the
 * `distribution.rounding.method` Setting so a change to the rule is a config change, not a
 * deploy (binding rule 3). There is deliberately no overload without `method` — a silent
 * default is how an unratified rounding rule ends up in a filed distribution statement.
 *
 * - `LARGEST_REMAINDER_HALF_UP` — implemented; delegates to {@link largestRemainderAllocate}
 *   (integer halalas, residual to the largest fractional remainders, ties by ascending index).
 * - `LARGEST_REMAINDER_BANKERS` — **declared but NOT implemented: it THROWS.** Its semantics
 *   *are* the open question — where a tied remainder goes under half-even is precisely what
 *   OQ-01 asks — so implementing a plausible guess here would resolve a rounding-policy
 *   question that belongs to Product + Counsel (CLAUDE.md binding rule 4). Refusing is the
 *   fail-closed answer; quietly falling back to half-up would be the dangerous one, because
 *   the resulting statement would look exactly like a ratified one.
 *
 * An unrecognised method throws for the same reason.
 *
 * // TODO(surface): OQ-01 — the rounding direction, the residual destination, AND the
 * // semantics of a half-even variant are all still [Product] + [Counsel] decisions.
 */
export function allocate(
  total: Money,
  weights: readonly AllocationWeight[],
  method: RoundingMethod,
): Money[] {
  if (method === 'LARGEST_REMAINDER_HALF_UP') {
    return largestRemainderAllocate(total, weights);
  }

  if (method === 'LARGEST_REMAINDER_BANKERS') {
    throw new DomainError(
      'SETTING_INVALID',
      'allocate: rounding method "LARGEST_REMAINDER_BANKERS" is declared but not implemented — its tie-breaking semantics are OQ-01 and are unresolved (⚠ unverified: needs Product/Counsel sign-off). Refusing rather than silently applying half-up.',
      { details: { method, implemented: ['LARGEST_REMAINDER_HALF_UP'] } },
    );
  }

  throw new DomainError(
    'SETTING_INVALID',
    `allocate: "${String(method)}" is not a recognised rounding method. The vocabulary is closed; an unknown policy is never approximated.`,
    { details: { method: String(method), recognised: [...ROUNDING_METHODS] } },
  );
}

/**
 * `amount ÷ divisor`, rounded **explicitly** half-up to the halala.
 *
 * Exists so no caller ever reaches for `/` on a `Decimal` and keeps an unrounded intermediate
 * that later fails `money()`'s 2-dp check somewhere far away. `divisor` is a dimensionless
 * scalar (a headcount, a number of periods) — never another `Money`.
 *
 * Note this does NOT conserve a total across several calls: dividing 100.00 by 3 three times
 * gives 33.33 × 3 = 99.99. Splitting a pool is {@link allocate}'s job, and it conserves exactly.
 */
export function divide(amount: Money, divisor: MoneyInput): Money {
  const scalar = toDecimal(divisor, 'divide');
  if (scalar.isZero()) {
    throw new DomainError('MONEY_INVALID', 'divide: the divisor must not be zero.');
  }
  return moneyRound(amount.dividedBy(scalar));
}

/** The smaller of two amounts. */
export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b;
}

/** The larger of two amounts. */
export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}
