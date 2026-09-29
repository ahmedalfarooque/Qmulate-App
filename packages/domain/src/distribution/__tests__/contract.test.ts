/**
 * `distribution/contract.test.ts` — the §08 input/output contract.
 *
 * What this suite is FOR, so a later reader does not weaken it by accident:
 *
 * 1. **The strictness rules are the product.** A silently-ignored field in a distribution input is
 *    a defect, not a nit — an unknown key is how `stipulatedWeigth` typos its way into a payout of
 *    zero. Every `.strict()` boundary gets a rejection test.
 * 2. **Money round-trips exactly, or not at all.** The Decimal↔`Minor` boundary is the only place
 *    the representation changes, so it is pinned at 0, one halala, one riyal, a large valuation and
 *    a value with trailing zeros — and a JS `number` is proven to be refused at every door.
 * 3. **The corpus guard is contract-level (D1 / CLAUDE.md binding rule 1).** The *shape* obligations
 *    are asserted here: a caller MUST be able to present receipt-level provenance, and the
 *    classification must survive parsing untouched so `assertIncomeProvenance` can refuse it. The
 *    refusal codes themselves (`RECEIPT_UNCLASSIFIED` / `CORPUS_NOT_DISTRIBUTABLE`) are
 *    `waterfall.ts`'s to raise and are asserted there; what this file proves is that the contract
 *    cannot be satisfied by a caller with no breakdown, and that a bad class reaches the guard as
 *    DATA rather than dying as a shape error with the wrong code.
 */

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { DOMAIN_ERROR_CODES, isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import { MINOR_UNITS_PER_MAJOR, fromMinor, money, toDbString, toMinor } from '../../money.js';
import {
  BENEFICIARY_KINDS,
  BINDING_CALENDARS,
  CAPITAL_SOURCES,
  CONTINUATION_STIPULATIONS,
  DEADLINE_BASES,
  ENTITLEMENT_ORDERS,
  ENTITLEMENT_RULES,
  EXCLUSION_REASON_CODES,
  GATE_REASON_CODES,
  INVARIANT_IDS,
  LINEAGE_LINKS,
  LINE_STATUSES,
  MAX_WEIGHT_DECIMAL_PLACES,
  RECEIPT_CLASSES,
  REVERSION_KINDS,
  RUN_FLAGS,
  SHARE_PERCENT_SCALE,
  SHART_REFUSALS,
  WAQF_TYPES,
  assertInputConsistency,
  assertResultShape,
  beneficiaryInputSchema,
  compareBeneficiaryIds,
  dualDateSchema,
  isRunFlag,
  maintenanceRuleSchema,
  minorOf,
  minorToDecimalString,
  minorToMoney,
  moneyToMinor,
  nazirFeeSchema,
  nonNegativeMinorSchema,
  parseDistributionInput,
  policyInputSchema,
  ratePercentSchema,
  receiptInputSchema,
  sharePercentOf,
  stipulatedWeightSchema,
  toMinorFromDecimalString,
  type DistributionInputRaw,
  type DistributionResult,
  type Minor,
} from '../contract.js';

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
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected a DomainError with code ${code}, got ${
        caught === undefined ? 'no throw' : String(caught)
      }`,
    );
  }
  expect(caught.code).toBe(code);
  return caught;
}

/**
 * A minimal VALID raw input. Worked-example data belongs in `./fixtures/worked-examples.ts`
 * (S3 decision D3); this is the smallest thing that parses, so each test can bend exactly one
 * field and prove that field is what the contract refuses.
 *
 * `asOf` is a real dual date: 2026-07-14 → 1448-01-29 through the one Umm al-Qura implementation.
 */
const ASOF_GREGORIAN = '2026-07-14';

function validRaw(): DistributionInputRaw {
  return {
    waqfId: 'waqf-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'ORDERED',
    // ADR-0009: recorded but NOT applied on an ORDERED deed. Carried here rather than left null so
    // the minimal input exercises the "carried, not applied, flagged" path the design specifies
    // (`CONTINUATION_STIPULATION_NOT_APPLIED`) instead of the quieter null case.
    continuationStipulation: 'ZUHUR_ONLY',
    // R7 · `null` = the deed records no reversion (مآل الوقف). Present-and-null, never absent: the
    // key is required and un-defaulted, and the §"required-nullable" cases below pin that.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 35_000_000n,
      receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [
      {
        id: 'ben-001',
        kind: 'FAMILY',
        active: true,
        tabaqa: 1,
        // `parentId: null` = a child of the waqif (derived depth 1, which `tabaqa` mirrors), NOT
        // "unknown parent" — the two meanings are separated by `lineageLink`, which is what decides
        // membership in the lineage graph. ADR-0009.
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
    asOf: { gregorian: ASOF_GREGORIAN, hijri: toHijri(civilDate(ASOF_GREGORIAN)) },
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

/**
 * Bend one top-level field of the valid input.
 *
 * The patch is `Record<string, unknown>` and the return is `unknown` **on purpose**: half these
 * tests exist to prove the schema REFUSES a shape, and TypeScript's excess-property check would
 * reject the malformed literal at compile time before the runtime assertion could run. The
 * compile-time surface is asserted separately (see the `name` and `policy` tests).
 */
function withRaw(patch: Record<string, unknown>): unknown {
  return { ...validRaw(), ...patch };
}

/** The single valid beneficiary, non-optional so tests can spread it without a guard. */
function firstBeneficiary(): DistributionInputRaw['beneficiaries'][number] {
  const beneficiary = validRaw().beneficiaries[0];
  if (beneficiary === undefined) throw new Error('validRaw() must carry one beneficiary');
  return beneficiary;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Parse success
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('parseDistributionInput — the happy path', () => {
  it('parses a valid input and brands every monetary field as Minor', () => {
    const input = parseDistributionInput(validRaw());

    expect(input.revenue.incomeMinor).toBe(35_000_000n);
    expect(input.operatingCostMinor).toBe(0n);
    expect(input.policy.roundingUnitMinor).toBe(1n);
    // Branded dates come back canonical and comparable as plain strings.
    expect(input.period.start).toBe('2026-01-01');
    expect(input.asOf.hijri).toBe('1448-01-29');
  });

  it('defaults only ONE field — capitalSource — and defaults it to null, never to a class', () => {
    const input = parseDistributionInput(validRaw());
    expect(input.revenue.receipts[0]?.capitalSource).toBeNull();
    // The receipt class itself is NEVER defaulted: an absent class must be refused by the guard,
    // and a default of 'INCOME' would be exactly the silent trust D1 exists to close.
    expect(input.revenue.receipts[0]?.receiptClass).toBe('INCOME');
  });

  it('keeps an unrecognised receiptClass as DATA so the corpus guard can refuse it', () => {
    // Header rule 4 applied to receipts: `receiptClass` is z.string(), so 'income' (wrong case),
    // '' and 'GIFT' all PARSE and reach `assertIncomeProvenance`, which raises
    // RECEIPT_UNCLASSIFIED. A zod enum here would raise DISTRIBUTION_INPUT_INVALID instead —
    // the wrong code for a corpus-classification failure, and the one CLAUDE.md does not name.
    for (const bad of ['income', '', 'GIFT', 'Capital']) {
      const input = parseDistributionInput(
        withRaw({
          revenue: {
            incomeMinor: 0n,
            receipts: [{ id: 'r1', receiptClass: bad, amountMinor: 0n }],
          },
        }),
      );
      expect(input.revenue.receipts[0]?.receiptClass).toBe(bad);
    }
  });

  it('keeps an unrecognised entitlementOrder as DATA so the resolver can halt SHART_INCOMPLETE', () => {
    const input = parseDistributionInput(withRaw({ entitlementOrder: 'MURATTAB' }));
    expect(input.entitlementOrder).toBe('MURATTAB');
    expect((ENTITLEMENT_ORDERS as readonly string[]).includes('MURATTAB')).toBe(false);
  });

  it('accepts an empty beneficiary set (a direct-use waqf has none)', () => {
    expect(() => parseDistributionInput(withRaw({ beneficiaries: [] }))).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Parse failure — one test per strictness rule
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('parseDistributionInput — strictness', () => {
  it('rejects an unknown key at the top level', () => {
    const error = expectDomainCode(
      () => parseDistributionInput({ ...validRaw(), notARealField: 1 }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toMatch(/unrecognized|unrecognised/i);
  });

  it.each([
    ['period', () => withRaw({ period: { start: '2026-01-01', end: '2026-12-31', tz: 'UTC' } })],
    [
      'revenue',
      () =>
        withRaw({
          revenue: { incomeMinor: 0n, receipts: [], grossMinor: 1n },
        }),
    ],
    [
      'revenue.receipts[]',
      () =>
        withRaw({
          revenue: {
            incomeMinor: 0n,
            receipts: [{ id: 'r1', receiptClass: 'INCOME', amountMinor: 0n, note: 'x' }],
          },
        }),
    ],
    ['maintenance', () => withRaw({ maintenance: { kind: 'NONE', amountMinor: 1n } })],
    [
      'nazirFee',
      () => withRaw({ nazirFee: { basis: 'RETAINER', fixedAmountMinor: 1n, ratePercent: '1' } }),
    ],
    [
      'beneficiaries[]',
      () => withRaw({ beneficiaries: [{ ...firstBeneficiary(), name: 'Real Person' }] }),
    ],
    [
      'asOf',
      () => withRaw({ asOf: { gregorian: ASOF_GREGORIAN, hijri: '1448-01-29', tz: 'UTC' } }),
    ],
    [
      'deadline',
      () => withRaw({ deadline: { ...validRaw().deadline, monthAnchor: 'end_of_month' } }),
    ],
    ['policy', () => withRaw({ policy: { ...validRaw().policy, roundingUnitMinor2: 1n } })],
  ])('rejects an unknown key inside %s', (_label, build) => {
    expectDomainCode(() => parseDistributionInput(build()), 'DISTRIBUTION_INPUT_INVALID');
  });

  it('rejects a beneficiary `name` — PII must not be able to enter the engine at all', () => {
    // The result and its trace are persisted and HASHED (AT-16). If a name could be parsed in, a
    // future line-assembly change could copy it out; the contract makes that impossible.
    const raw = beneficiaryInputSchema.safeParse({ ...firstBeneficiary(), name: 'Real Person' });
    expect(raw.success).toBe(false);
  });

  it('rejects a missing policy field rather than substituting a default (binding rule 3)', () => {
    const policy = { ...validRaw().policy } as Record<string, unknown>;
    delete policy['kycRefreshMonths'];
    const error = expectDomainCode(
      () => parseDistributionInput(withRaw({ policy })),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('kycRefreshMonths');

    // Proven directly on the schema too: there is no `.default()` anywhere in `policy`.
    for (const key of Object.keys(validRaw().policy)) {
      const partial = { ...validRaw().policy } as Record<string, unknown>;
      delete partial[key];
      expect(policyInputSchema.safeParse(partial).success, `policy.${key} must be required`).toBe(
        false,
      );
    }
  });

  it('rejects a negative amount on every non-negative money field', () => {
    expect(nonNegativeMinorSchema.safeParse(-1n).success).toBe(false);
    expect(nonNegativeMinorSchema.safeParse(0n).success).toBe(true);
    expectDomainCode(
      () => parseDistributionInput(withRaw({ operatingCostMinor: -1n })),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('rejects a JS number where halalas are expected', () => {
    expect(nonNegativeMinorSchema.safeParse(100).success).toBe(false);
    expectDomainCode(
      () => parseDistributionInput(withRaw({ operatingCostMinor: 100 })),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('rejects a half-formed maintenance rule (the discriminated union is why)', () => {
    expect(maintenanceRuleSchema.safeParse({ kind: 'FIXED' }).success).toBe(false);
    expect(maintenanceRuleSchema.safeParse({ kind: 'PERCENT' }).success).toBe(false);
    expect(
      maintenanceRuleSchema.safeParse({ kind: 'TARGET_TOPUP', targetBalanceMinor: 1n }).success,
    ).toBe(false);
    expect(maintenanceRuleSchema.safeParse({ kind: 'NONE' }).success).toBe(true);
  });

  it('rejects a fee with the wrong field for its basis', () => {
    expect(
      nazirFeeSchema.safeParse({ basis: 'PERCENT_OF_REVENUE', fixedAmountMinor: 1n }).success,
    ).toBe(false);
    expect(nazirFeeSchema.safeParse({ basis: 'RETAINER', ratePercent: '10' }).success).toBe(false);
    expect(nazirFeeSchema.safeParse({ basis: 'NOT_A_BASIS', ratePercent: '10' }).success).toBe(
      false,
    );
  });

  it.each([
    ['13-01', 'month 13'],
    ['00-10', 'month 0'],
    ['02-30', 'a day February never has'],
    ['12-32', 'day 32'],
    ['1-01', 'unpadded'],
  ])('rejects fiscalYearEnd "%s" (%s)', (value) => {
    expectDomainCode(
      () => parseDistributionInput(withRaw({ fiscalYearEnd: value })),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('accepts fiscalYearEnd "02-29" — an awkward but real fiscal year end', () => {
    expect(() => parseDistributionInput(withRaw({ fiscalYearEnd: '02-29' }))).not.toThrow();
  });

  it('rejects a non-existent or non-canonical date on any date field', () => {
    for (const bad of ['2026-02-30', '2026-2-1', '2026-01-01T00:00:00Z', '2026-01-01 ', '']) {
      expectDomainCode(
        () => parseDistributionInput(withRaw({ period: { start: bad, end: '2026-12-31' } })),
        'DISTRIBUTION_INPUT_INVALID',
      );
    }
  });

  it('rejects a Hijri date outside the Umm al-Qura table rather than extrapolating', () => {
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({ deadline: { ...validRaw().deadline, hijri: '1200-01-01' } }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('never lets a raw ZodError escape — every shape failure is a typed DomainError', () => {
    const error = expectDomainCode(
      () => parseDistributionInput(null),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.name).toBe('DomainError');
    expect(error.messageKey).toBe('errors.domain.DISTRIBUTION_INPUT_INVALID');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Weights and rates — decimal strings, out of 100
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('weights and rates are decimal strings, and a rate is out of 100', () => {
  it('accepts a plain non-negative decimal literal', () => {
    for (const value of ['0', '1', '12.5', '0.000000000000000001', '100']) {
      expect(stipulatedWeightSchema.safeParse(value).success, value).toBe(true);
    }
  });

  it('rejects a JS number, a sign, an exponent, and blank/NaN/Infinity', () => {
    for (const value of [12.5, '+1', '-1', '1e3', '1E3', '', ' 1', 'NaN', 'Infinity', '.5', '1.']) {
      expect(stipulatedWeightSchema.safeParse(value).success, String(value)).toBe(false);
    }
  });

  it('caps weight precision at MAX_WEIGHT_DECIMAL_PLACES so the allocator cannot overflow', () => {
    const ok = `0.${'1'.repeat(MAX_WEIGHT_DECIMAL_PLACES)}`;
    const tooPrecise = `0.${'1'.repeat(MAX_WEIGHT_DECIMAL_PLACES + 1)}`;
    expect(stipulatedWeightSchema.safeParse(ok).success).toBe(true);
    expect(stipulatedWeightSchema.safeParse(tooPrecise).success).toBe(false);
  });

  it("a rate is out of 100 — '10' means 10%, and 0.10 would be a 100x underpayment", () => {
    expect(ratePercentSchema.safeParse('10').success).toBe(true);
    expect(ratePercentSchema.safeParse('100').success).toBe(true);
    expect(ratePercentSchema.safeParse('100.01').success).toBe(false);
    expect(ratePercentSchema.safeParse('101').success).toBe(false);
    // '0.10' is a LEGAL rate string (a tenth of a percent) — the defence against §08's fraction
    // convention is the FIELD NAME (`ratePercent`), not a validator. Pinned so a later reader does
    // not "fix" this by rejecting small rates, which would ban a genuine 0.1% retainer rate.
    expect(ratePercentSchema.safeParse('0.10').success).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The Decimal ↔ Minor boundary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the Decimal ↔ Minor boundary is the only place the representation changes', () => {
  it.each([
    ['zero', '0.00', 0n],
    ['one halala', '0.01', 1n],
    ['one riyal', '1.00', 100n],
    ['the ushr fee on 350,000', '35000.00', 3_500_000n],
    ['a large valuation', '9999999999999999.99', 999_999_999_999_999_999n],
    ['trailing zeros', '1000.10', 100_010n],
    ['a two-dp value that is not a round riyal', '12.34', 1_234n],
  ])('round-trips %s exactly in both directions', (_label, decimalString, expectedMinor) => {
    const minor = toMinorFromDecimalString(decimalString);
    expect(minor).toBe(expectedMinor);
    expect(minorToDecimalString(minor)).toBe(decimalString);
    expect(toDbString(minorToMoney(minor))).toBe(decimalString);
    expect(moneyToMinor(money(decimalString))).toBe(expectedMinor);
  });

  it('1 SAR is exactly MINOR_UNITS_PER_MAJOR halalas', () => {
    expect(toMinorFromDecimalString('1.00')).toBe(MINOR_UNITS_PER_MAJOR);
  });

  it('round-trips every bigint halala amount (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 999_999_999_999_999_999n }), (halalas) => {
        const branded = minorOf(halalas);
        expect(toMinorFromDecimalString(minorToDecimalString(branded))).toBe(halalas);
        expect(moneyToMinor(minorToMoney(branded))).toBe(halalas);
        // Never exponent notation: a `1e+21` reaching a Decimal(18,2) column is silent corruption.
        expect(minorToDecimalString(branded)).toMatch(/^\d+\.\d{2}$/);
      }),
      { numRuns: 500, seed: 20260730 },
    );
  });

  it('refuses to brand a JS number as halalas (money.ts rejectNumber discipline)', () => {
    expectDomainCode(() => minorOf(100 as unknown as bigint), 'MONEY_NUMBER_INPUT');
    expectDomainCode(() => minorOf(0.5 as unknown as bigint), 'MONEY_NUMBER_INPUT');
    expectDomainCode(() => minorOf('100' as unknown as bigint), 'MONEY_INVALID');
    expectDomainCode(() => minorOf(undefined as unknown as bigint), 'MONEY_INVALID');
  });

  it('refuses a decimal string carrying sub-halala precision rather than rounding it', () => {
    expectDomainCode(() => toMinorFromDecimalString('1.005'), 'MONEY_PRECISION');
  });

  it('refuses a JS number at the decimal-string door too', () => {
    expectDomainCode(
      () => toMinorFromDecimalString(1.5 as unknown as string),
      'MONEY_NUMBER_INPUT',
    );
  });

  it('refuses a Money value that is not a whole halala', () => {
    // `fromMinor` always yields whole halalas, so construct the odd case explicitly.
    expectDomainCode(() => moneyToMinor(money('0.001')), 'MONEY_PRECISION');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * sharePercentOf
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('sharePercentOf', () => {
  it('is a 6-dp decimal STRING, never a float', () => {
    expect(sharePercentOf(minorOf(13_750_000n), minorOf(27_500_000n))).toBe('50.000000');
    expect(sharePercentOf(minorOf(3_334n), minorOf(10_000n))).toBe('33.340000');
    expect(sharePercentOf(minorOf(3_333n), minorOf(10_000n))).toBe('33.330000');
    // A third of 100% is where a float prints 33.333333333333336.
    expect(sharePercentOf(minorOf(1n), minorOf(3n))).toBe('33.333333');
  });

  it('is 0.000000 on a nil distribution rather than dividing by zero', () => {
    expect(sharePercentOf(minorOf(0n), minorOf(0n))).toBe('0.000000');
    expect(sharePercentOf(minorOf(5n), minorOf(0n))).toBe('0.000000');
  });

  it('always carries exactly SHARE_PERCENT_SCALE decimal places (property)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 14n }),
        fc.bigInt({ min: 1n, max: 10n ** 14n }),
        (entitled, distributable) => {
          const percent = sharePercentOf(minorOf(entitled), minorOf(distributable));
          expect(percent).toMatch(new RegExp(`^\\d+\\.\\d{${String(SHARE_PERCENT_SCALE)}}$`));
        },
      ),
      { numRuns: 500, seed: 20260730 },
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assertInputConsistency
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertInputConsistency — the checks zod cannot express', () => {
  it('refuses an asOf whose two halves are not the same day, naming both values', () => {
    // 2026-07-14 is 1448-01-29. A mismatch means a SECOND Hijri implementation is in play.
    //
    // ⚠ The counterexample is 1448-01-28, NOT §08/AT-14's `1448-01-30`: Muḥarram 1448 has 29
    // days, so 1448-01-30 does not exist and is refused one layer earlier, by `hijriDateSchema`,
    // with a message about the Umm al-Qura table rather than about the dual date. AT-14 as written
    // therefore proves the wrong thing — it passes on the right CODE for the wrong REASON, and
    // would keep passing if `assertInputConsistency`'s cross-check were deleted entirely.
    const error = expectDomainCode(
      () =>
        parseDistributionInput(withRaw({ asOf: { gregorian: '2026-07-14', hijri: '1448-01-28' } })),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('1448-01-29');
    expect(error.message).toContain('1448-01-28');
    expect(error.message).toContain('two calendars');
  });

  it("AT-14's stated counterexample 1448-01-30 is not a real day — it fails one layer earlier", () => {
    const error = expectDomainCode(
      () =>
        parseDistributionInput(withRaw({ asOf: { gregorian: '2026-07-14', hijri: '1448-01-30' } })),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('Umm al-Qura');
    expect(error.message).not.toContain('two calendars');
  });

  it('does NOT cross-check the deadline pair — its halves are different days on purpose', () => {
    // FYE 2026-12-31: Gregorian + 3 months = 2027-03-31; Hijri + 3 Hijri months = 1448-10-22,
    // which is 2027-03-30. One day apart, and that divergence IS decision D2.
    expect(toHijri(civilDate('2027-03-31'))).not.toBe('1448-10-22');
    expect(() => parseDistributionInput(validRaw())).not.toThrow();
  });

  it('refuses a duplicate beneficiaryId', () => {
    const first = firstBeneficiary();
    const error = expectDomainCode(
      () => parseDistributionInput(withRaw({ beneficiaries: [first, first] })),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('ben-001');
  });

  it('refuses a duplicate receipt id (the corpus guard reports the ids it excluded)', () => {
    const error = expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({
            revenue: {
              incomeMinor: 200n,
              receipts: [
                { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 100n },
                { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 100n },
              ],
            },
          }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expect(error.message).toContain('rev-001');
  });

  it('refuses any rounding granularity other than the halala, rather than ignoring it', () => {
    for (const unit of [0n, 5n, 100n]) {
      expectDomainCode(
        () =>
          parseDistributionInput(
            withRaw({ policy: { ...validRaw().policy, roundingUnitMinor: unit } }),
          ),
        'SETTING_INVALID',
      );
    }
  });

  it('refuses a period whose start is after its end', () => {
    expectDomainCode(
      () => parseDistributionInput(withRaw({ period: { start: '2026-12-31', end: '2026-01-01' } })),
      'DISTRIBUTION_INPUT_INVALID',
    );
    // A single-day period is legal.
    expect(() =>
      parseDistributionInput(withRaw({ period: { start: '2026-01-01', end: '2026-01-01' } })),
    ).not.toThrow();
  });

  it('is callable on its own — it is not only reachable through parseDistributionInput', () => {
    const input = parseDistributionInput(validRaw());
    expect(() => assertInputConsistency(input)).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The corpus guard, at the SHAPE level (D1 / CLAUDE.md binding rule 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the corpus guard is structural: the contract demands provenance, not a bare total', () => {
  it('has no bare `revenueMinor` field — a caller cannot declare revenue without receipts', () => {
    // §08's sketch took a bare total, which is indistinguishable from sale or istibdal proceeds.
    // The schema is strict, so the old shape does not parse at all.
    expectDomainCode(
      () =>
        parseDistributionInput({ ...validRaw(), revenue: undefined, revenueMinor: 35_000_000n }),
      'DISTRIBUTION_INPUT_INVALID',
    );
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({
            revenue: { revenueMinor: 35_000_000n } as unknown as DistributionInputRaw['revenue'],
          }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('requires `receipts` to be present — an omitted array is refused, not treated as empty', () => {
    // The distinction matters: `receipts: []` with `incomeMinor > 0` is a caller with NO
    // breakdown, which `assertIncomeProvenance` refuses as RECEIPT_UNCLASSIFIED (AT-11). An
    // omitted key must not quietly become that state — it is a malformed input.
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({
            revenue: { incomeMinor: 35_000_000n } as unknown as DistributionInputRaw['revenue'],
          }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('lets `receipts: []` with positive income PARSE, so the guard (not zod) refuses it', () => {
    // AT-11's headline case. It must reach `assertIncomeProvenance` to get the code CLAUDE.md
    // names (RECEIPT_UNCLASSIFIED); a schema-level refusal would report the wrong code.
    const input = parseDistributionInput(
      withRaw({ revenue: { incomeMinor: 35_000_000n, receipts: [] } }),
    );
    expect(input.revenue.receipts).toEqual([]);
    expect(input.revenue.incomeMinor).toBe(35_000_000n);
  });

  it('carries a CAPITAL receipt and its source through untouched, for I-C1 to report', () => {
    const input = parseDistributionInput(
      withRaw({
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
      }),
    );
    expect(input.revenue.receipts[1]).toEqual({
      id: 'cap-001',
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
      amountMinor: 2_000_000_000n,
    });
  });

  it('lets a CAPITAL receipt with a null source PARSE, so the guard refuses it with the right code', () => {
    const input = parseDistributionInput(
      withRaw({
        revenue: {
          incomeMinor: 0n,
          receipts: [{ id: 'cap-001', receiptClass: 'CAPITAL', amountMinor: 1n }],
        },
      }),
    );
    expect(input.revenue.receipts[0]?.capitalSource).toBeNull();
  });

  it('lets an INCOME receipt carrying a capitalSource PARSE — the guard must refuse that too', () => {
    // An INCOME receipt tagged ISTIBDAL_PROCEEDS is corpus filed as ghallah. It cannot be a
    // discriminated union here (receiptClass must stay z.string()), so this test PINS the shape
    // obligation on `assertIncomeProvenance`: if it ever stops refusing this, the pairing test in
    // waterfall's suite is the one that fails — but this test documents that the contract lets it
    // through DELIBERATELY, so nobody "fixes" it here with the wrong error code.
    const input = parseDistributionInput(
      withRaw({
        revenue: {
          incomeMinor: 1n,
          receipts: [
            {
              id: 'rev-001',
              receiptClass: 'INCOME',
              capitalSource: 'ISTIBDAL_PROCEEDS',
              amountMinor: 1n,
            },
          ],
        },
      }),
    );
    expect(input.revenue.receipts[0]?.capitalSource).toBe('ISTIBDAL_PROCEEDS');
  });

  it('rejects an unrecognised capitalSource — that vocabulary IS closed', () => {
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({
            revenue: {
              incomeMinor: 0n,
              receipts: [
                {
                  id: 'cap-001',
                  receiptClass: 'CAPITAL',
                  capitalSource: 'MYSTERY' as unknown as (typeof CAPITAL_SOURCES)[number],
                  amountMinor: 1n,
                },
              ],
            },
          }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Vocabularies and small helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the vocabularies', () => {
  it('spell every gate reason exactly as its DOMAIN_ERROR_CODES twin', () => {
    // Four of the five reuse the shipped ar/en `errors.domain.*` copy. If one drifts (§08's
    // `KYC_STALE` vs the shipped `STALE_KYC`), one condition ends up with two codes and one of
    // them has no Arabic string — which next-intl renders as the raw key path on screen.
    const codes = new Set<string>(DOMAIN_ERROR_CODES);
    for (const reason of GATE_REASON_CODES) {
      expect(codes.has(reason), `${reason} must exist in DOMAIN_ERROR_CODES`).toBe(true);
    }
    expect(codes.has('KYC_STALE')).toBe(false);
  });

  it('keeps the exclusion reasons OUT of DOMAIN_ERROR_CODES — they are the deed working normally', () => {
    const codes = new Set<string>(DOMAIN_ERROR_CODES);
    for (const reason of EXCLUSION_REASON_CODES) {
      expect(codes.has(reason), `${reason} must NOT be a domain error code`).toBe(false);
    }
    // Same for the run flag §08 names like an error: it never throws.
    expect(codes.has('NO_ELIGIBLE_BENEFICIARIES')).toBe(false);
    expect(isRunFlag('NO_ELIGIBLE_BENEFICIARIES')).toBe(true);
  });

  it('are SCREAMING_SNAKE throughout, inputs as well as outputs (Prisma spelling)', () => {
    const all = [
      ...RECEIPT_CLASSES,
      ...CAPITAL_SOURCES,
      ...ENTITLEMENT_ORDERS,
      ...LINE_STATUSES,
      ...BINDING_CALENDARS,
      ...DEADLINE_BASES,
      ...RUN_FLAGS,
    ];
    for (const value of all) {
      expect(value, `${value} must be SCREAMING_SNAKE`).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
    // §08's own lower-case / hyphenated input spellings must not have survived.
    expect((ENTITLEMENT_ORDERS as readonly string[]).includes('ordered')).toBe(false);
    expect((RECEIPT_CLASSES as readonly string[]).includes('income')).toBe(false);
  });

  it('name the corpus, per-capita and reversion invariants alongside §08 I1–I9', () => {
    // I-L1 (ADR-0009) is the only load-bearing proof that per capita was APPLIED, so it has to be a
    // reportable id — an invariant absent from this list cannot appear in `invariantsChecked` and a
    // reader could not tell whether it ran.
    //
    // I-R1 (R7) is the same argument for the reversion, plus one more: it is the id that STANDS IN for
    // I-L1 on a reverted run (per capita is the bloodline's rule, and a reverted run's paid lines are
    // charities splitting by deed weight). If I-R1 were not reportable, a reverted run would report one
    // fewer invariant than an ordinary one with nothing naming what replaced it — which is precisely
    // the R6-I5 defect of reporting an invariant that makes no claim about the line that took the money.
    expect(INVARIANT_IDS).toEqual([
      'I1',
      'I2',
      'I3',
      'I4',
      'I5',
      'I6',
      'I7',
      'I8',
      'I9',
      'I-C1',
      'I-L1',
      'I-R1',
    ]);
  });

  it('narrows an untrusted run flag and refuses anything else', () => {
    expect(isRunFlag('NIL_DISTRIBUTION')).toBe(true);
    expect(isRunFlag('nil_distribution')).toBe(false);
    expect(isRunFlag(undefined)).toBe(false);
    expect(isRunFlag(3)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 — the lineage model, the closed continuation term, and the JOINT reversal
 *
 * What this section is FOR: the contract half of ADR-0009. It proves the *vocabulary and the input
 * shape* can express the owner's rules and cannot express a guess. The behaviour — who is eligible,
 * what per capita pays, which inputs are refused — is `resolver`/`engine`/`invariants`' to prove,
 * and is asserted there. What is asserted here is exactly what a contract can be responsible for:
 *
 *  1. **The new deed facts are REQUIRED and have NO zod `.default()`.** A defaulted `lineageLink` or
 *     `continuationStipulation` is a defaulted answer to a fiqh question (binding rule 1).
 *  2. **They arrive as DATA, not as shape errors** (header rule 4), so a mis-transcribed deed term
 *     halts with `SHART_INCOMPLETE` + the refusal that names it — never with
 *     `DISTRIBUTION_INPUT_INVALID`, which is the code for "the caller sent the wrong shape".
 *  3. **`JOINT` is still in the vocabulary.** The engine refuses the *value*; the enum member stays,
 *     because the Awqaf Law Art. 4 contradiction is counsel's to resolve (ADR-0009 decision 3).
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('ADR-0009 · the lineage vocabularies', () => {
  it('keeps the continuation stipulation a CLOSED TWO-VALUE term with no third member', () => {
    // R2. A third value would be a fiqh reading nobody gave; the engine refuses instead.
    expect(CONTINUATION_STIPULATIONS).toEqual(['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN']);
  });

  it('records the lineage link as the FACT (SON/DAUGHTER), not a pre-interpreted eligibility', () => {
    // Pre-interpreting as NAME_CARRYING / NOT_NAME_CARRYING would bake ZUHUR_ONLY's reading into
    // every deed's data — and under ZUHUR_AND_BUTUN the interpreted form carries no information at
    // all. The stipulation decides what the fact means; the fact stays deed-neutral.
    expect(LINEAGE_LINKS).toEqual(['SON', 'DAUGHTER']);
    for (const forbidden of ['NAME_CARRYING', 'NOT_NAME_CARRYING', 'MALE', 'FEMALE']) {
      expect((LINEAGE_LINKS as readonly string[]).includes(forbidden)).toBe(false);
    }
  });

  it('adds LINEAGE_CONTINUATION as a fourth order WITHOUT retiring ORDERED or SHARED (R4)', () => {
    expect(ENTITLEMENT_ORDERS).toEqual([
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
      'NA_DIRECT_USE',
    ]);
    // ORDERED is demoted to the explicitly stipulated exception, not deleted: §08, the glossary,
    // fixture waqf-001 and verification scenario V-1 are all built on it, and the owner chose to
    // preserve the deed's authority. SHARED (tashrik) is retained too — it applies no ẓuhūr filter
    // and it DOES apply deed weights, so collapsing it into lineage would silently make every
    // tashrik deed per capita.
    for (const preserved of ['ORDERED', 'SHARED', 'NA_DIRECT_USE'] as const) {
      expect((ENTITLEMENT_ORDERS as readonly string[]).includes(preserved)).toBe(true);
    }
    // Not the locked glossary's word for istibdal (استبدال). A second meaning for a locked domain
    // word is how a corpus rule and an entitlement rule end up read as the same thing.
    expect((ENTITLEMENT_ORDERS as readonly string[]).includes('LINEAGE_SUBSTITUTION')).toBe(false);
  });

  it('gives the lineage path TWO rule labels, because the statement says different things', () => {
    // BR-505 / NFR-01: `basis.rule` is printed on the beneficiary's official Arabic statement.
    // "your line continues" and "your line does not continue under this deed" are different legal
    // statements to a family member and must be legible without re-reading the deed.
    expect(ENTITLEMENT_RULES as readonly string[]).toContain('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
    expect(ENTITLEMENT_RULES as readonly string[]).toContain('LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN');
    // One label per (order, stipulation) pair — the two lineage labels must not collide.
    expect(new Set(ENTITLEMENT_RULES).size).toBe(ENTITLEMENT_RULES.length);
  });

  it('KEEPS JOINT in WAQF_TYPES and JOINT_FIXED_DEED_SHARES in ENTITLEMENT_RULES', () => {
    // ADR-0009 decision 3, and the distinction the whole decision rests on: the engine refuses the
    // VALUE, it does not narrow the VOCABULARY. `awqaf-law.md` Art. 4 and `glossary.md`'s الوقف
    // المشترك both record a joint endowment as real, that contradiction is open with Saudi counsel,
    // and ADR-0004 established that this repo's enum narrowings refuse rather than remap. Deleting
    // either member here would erase the record and pre-empt counsel.
    expect(WAQF_TYPES as readonly string[]).toContain('JOINT');
    expect(ENTITLEMENT_RULES as readonly string[]).toContain('JOINT_FIXED_DEED_SHARES');
    // NB: that no RUN can produce `JOINT_FIXED_DEED_SHARES` is a claim about behaviour and is
    // asserted by the engine suite, never by this file and never by a comment.
  });

  it('adds BUTUN_LINE_NOT_CONTINUED and adds NO code for "my parent died" (R1)', () => {
    expect(EXCLUSION_REASON_CODES as readonly string[]).toContain('BUTUN_LINE_NOT_CONTINUED');
    // The absence IS the rule. A generation's death does not block the next generation, so there is
    // nothing to name: the lineage path reads only the beneficiary's own `active`. A code like
    // PARENT_DECEASED existing at all would invite a resolver to use it.
    for (const forbidden of [
      'PARENT_DECEASED',
      'PARENT_INACTIVE',
      'ANCESTOR_INACTIVE',
      'LINE_EXTINCT',
    ]) {
      expect((EXCLUSION_REASON_CODES as readonly string[]).includes(forbidden)).toBe(false);
    }
  });

  it('flags both Shart terms the lineage path does not apply, and narrows them as run flags', () => {
    // A recorded Shart figure or term that vanishes without trace is the defect class this project
    // keeps paying for (R3). Both are FLAGS, not errors: the run still computes.
    for (const flag of [
      'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
      'CONTINUATION_STIPULATION_NOT_APPLIED',
    ] as const) {
      expect(RUN_FLAGS as readonly string[]).toContain(flag);
      expect(isRunFlag(flag)).toBe(true);
      expect(new Set<string>(DOMAIN_ERROR_CODES).has(flag)).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف — the reversion clause's CONTRACT half
 *
 * What this section is FOR, and where its boundary is. It proves the *input shape* can express the
 * owner's 2026-08-10 rule and cannot express a guess, and that the *output vocabulary* has somewhere
 * to say what happened. Who is entitled, what the taker is paid, and which cohorts are refused are
 * behaviour and belong to `resolver`/`engine`/`invariants` — asserted there, driven, never inferred
 * from a vocabulary's membership (lesson 1: a source-shape assertion is not a test).
 *
 * The one thing this file uniquely CAN prove is the absence of a default. A `.default()` on
 * `reversion` would be a defaulted answer to *"where does this endowment go when the family ends?"*,
 * and no behavioural test can see it — the run would simply compute, plausibly, on a fiqh reading
 * nobody recorded.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R7 · the مآل clause is a required, undefaulted, closed-vocabulary deed fact', () => {
  it('rejects an input with no `reversion` key — nullable is NOT optional', () => {
    // The same rule ADR-0009 applied to `parentId`/`lineageLink`: the key must be PRESENT and the
    // caller must state the fact. Absent ⇒ a shape error, because the engine cannot tell "this deed
    // records no مآل" from "nobody looked".
    const { reversion: _dropped, ...withoutReversion } = validRaw();
    expectDomainCode(() => parseDistributionInput(withoutReversion), 'DISTRIBUTION_INPUT_INVALID');
  });

  it('has NO zod default — an explicit null survives as null and nothing is invented', () => {
    const input = parseDistributionInput(withRaw({ reversion: null }));
    expect(input.reversion).toBeNull();
  });

  it('carries a recorded clause through verbatim — kind and ids, in the recorded order', () => {
    const input = parseDistributionInput(
      withRaw({
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['jiha-002', 'jiha-001'],
        },
      }),
    );
    // Order preserved, NOT sorted: the contract's job is to transport the deed's own record. The
    // resolver sorts where it needs a canonical order, and refuses a duplicate rather than tidying.
    expect(input.reversion?.ultimateTakerIds).toEqual(['jiha-002', 'jiha-001']);
    expect(input.reversion?.kind).toBe('CHARITABLE_ULTIMATE_TAKER');
  });

  it('keeps an unrecognised `kind` as DATA — padding and case included (header rule 4)', () => {
    // A mis-transcribed مآل is an unreadable FOUNDER'S CONDITION and must halt with
    // `SHART_INCOMPLETE` / `REVERSION_KIND_UNRECOGNISED` at Stage 0, not die here as a shape error.
    // `z.enum(REVERSION_KINDS)` would have made that impossible, so `kind` is a `z.string()`.
    for (const bad of [
      'REVERT_TO_THE_POOR_OF_THE_CITY',
      'charitable_ultimate_taker',
      '  CHARITABLE_ULTIMATE_TAKER  ',
      'NEAREST_RELATIVES_OF_THE_WAQIF',
      '',
    ]) {
      const input = parseDistributionInput(
        withRaw({ reversion: { kind: bad, ultimateTakerIds: ['jiha-001'] } }),
      );
      expect(input.reversion?.kind).toBe(bad);
    }
  });

  it('accepts an EMPTY ultimateTakerIds — a deed incompleteness, refused by name at Stage 0', () => {
    // Deliberately not `.min(1)`. "The deed names a reversion but nobody to take it" is a statement
    // about the deed, so it must reach the caller as `SHART_INCOMPLETE` /
    // `REVERSION_WITH_NO_ULTIMATE_TAKER` rather than as `DISTRIBUTION_INPUT_INVALID`, which tells an
    // operator their JSON is malformed when in fact their DEED RECORD is.
    const input = parseDistributionInput(
      withRaw({ reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [] } }),
    );
    expect(input.reversion?.ultimateTakerIds).toEqual([]);
  });

  it('rejects an unknown key inside the clause, and a non-string id', () => {
    // `.strict()`: a `weights: [...]` field smuggled into the clause would be a SECOND copy of a
    // figure that already lives on the beneficiary, with money between the two.
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({
            reversion: {
              kind: 'CHARITABLE_ULTIMATE_TAKER',
              ultimateTakerIds: ['jiha-001'],
              weights: ['70'],
            },
          }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
    // An empty id is a shape error and not a deed fact: there is no deed that names "" as anything.
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({ reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [''] } }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('REVERSION_KINDS is a one-member closed vocabulary, and that is why `kind` exists', () => {
    // A deed may revert to the poor of a city, to another waqf, to the Authority, or to the waqif's
    // nearest relatives. The engine implements ONE reading, so the discriminator is what makes a
    // second reading a REFUSAL rather than a silent reinterpretation of the first.
    expect(REVERSION_KINDS).toEqual(['CHARITABLE_ULTIMATE_TAKER']);
    for (const kind of REVERSION_KINDS) {
      expect(kind, `${kind} must be SCREAMING_SNAKE`).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('adds the taker`s own exclusion reason, rule label, flags and invariant id', () => {
    // Each of these is the only place the engine CAN say what happened, so their absence would be
    // silence on the most consequential state change in a family endowment's life. The behaviour is
    // asserted elsewhere; what is pinned here is that the vocabulary exists to carry it.
    expect(EXCLUSION_REASON_CODES as readonly string[]).toContain(
      'REVERSION_PENDING_LIVING_BLOODLINE',
    );
    // ⚠ TEMPORARY, like `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` and unlike `BUTUN_LINE_NOT_CONTINUED`:
    // the identical register one death later makes this same beneficiary entitled to everything. Its
    // ar/en copy is E10/E12's and product-approved — it must not read as a permanent disinheritance
    // of the charity, and it must not read as an expectation of the family's extinction either.
    expect(new Set<string>(DOMAIN_ERROR_CODES).has('REVERSION_PENDING_LIVING_BLOODLINE')).toBe(
      false,
    );

    // The taker's BR-505 basis label. A charity paid a family endowment's whole ghallah on a line
    // stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — an Arabic statement telling a charity its descent
    // from the waqif continues — is the exact mis-statement ADR-0009 records as a defect.
    expect(ENTITLEMENT_RULES as readonly string[]).toContain('ULTIMATE_TAKER_MAAL_AL_WAQF');

    for (const flag of [
      'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
      'REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING',
    ] as const) {
      expect(RUN_FLAGS as readonly string[]).toContain(flag);
      expect(isRunFlag(flag)).toBe(true);
      expect(new Set<string>(DOMAIN_ERROR_CODES).has(flag)).toBe(false);
    }

    expect(INVARIANT_IDS as readonly string[]).toContain('I-R1');
  });

  it('keeps BENEFICIARY_KINDS at THREE — the taker is a deed clause, not a fourth kind', () => {
    // The design's central shape decision, and its cost is what is pinned here: a per-beneficiary
    // marker (`ultimateTaker: boolean`, or a 4th `BeneficiaryKind`) would have moved `BENEFICIARY_KINDS`
    // out of `prisma-vocabulary-parity.test.ts`'s ten MUST_MATCH pairings and owed E3/E4 a second
    // migration — all to split one domain entity in two along a line the DEED draws. It would also
    // have given the engine ONE trusted side (set the boolean and you are the taker), which is exactly
    // how S3-D1 shipped. Naming ids gives two sides that must agree.
    expect(BENEFICIARY_KINDS).toEqual(['FAMILY', 'CHARITABLE_JIHA', 'CATEGORY_ONLY']);
    expect((BENEFICIARY_KINDS as readonly string[]).includes('ULTIMATE_TAKER')).toBe(false);
  });
});

describe('ADR-0009 · SHART_REFUSALS is the closed set of `details.refusal` discriminators', () => {
  it('S9-4a · the OLD joint-refusal name is GONE, not aliased — ADR-0004 discipline', () => {
    // ⊕ The owner reversed register item #11 on 2026-08-25 (*"a joint waqf is described as partially
    // ذري and partially خيري"*) and then ruled the consequence: rename the discriminators to say NOT
    // SUPPORTED rather than NOT POSSIBLE, because the behaviour is scope and no longer doctrine.
    //
    // ⚠ THE POINT OF THIS ASSERTION IS THE ABSENCE, NOT THE PRESENCE. ADR-0004's rule is *refuse the
    // old name, never remap silently* — and a rename is only honest if the withdrawn LEGAL CLAIM
    // stops circulating. An alias, a back-compat mapping, or a second member spelling the old name
    // would leave "a joint waqf is not possible" in a Nazir's error detail under a new label.
    expect(
      (SHART_REFUSALS as readonly string[]).filter((code) => code.includes('NOT_POSSIBLE')),
      'the impossibility language is back in the closed vocabulary',
    ).toStrictEqual([]);
    expect(SHART_REFUSALS as readonly string[]).toContain('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    // And the count is unchanged: this was a RENAME, not an addition. A vocabulary that grew by one
    // here would mean the old member is still present somewhere alongside the new one.
    expect(new Set(SHART_REFUSALS).size).toBe(SHART_REFUSALS.length);
  });

  it('lists every refusal the design specifies, and nothing else', () => {
    // The pin is deliberate and is the sibling modules' contract: `resolver.ts` and `engine.ts` write
    // these exact strings into `DomainError.details.refusal`, and the acceptance suite matches on
    // them. Matching on prose in one place and on a typo in another is what this closes.
    expect([...SHART_REFUSALS].sort()).toEqual(
      [
        'BENEFICIARY_ID_DUPLICATED',
        // ⚠ R6-D1 (S4 adversarial review). A charity recorded on a وقف ذري, whatever the order and
        // whatever else the cohort holds. It is NOT covered by `COHORT_MIXES_CHARITABLE_AND_FAMILY`,
        // which needs a `FAMILY` member present: a family waqf recording its descendants as
        // `CATEGORY_ONLY` placeholders plus one jiha slipped past every other check and the charity
        // was PAID 27,500,000 of 27,500,000 halalas, unflagged.
        //
        // ⚠ **CONDITIONAL SINCE R7 (product owner, 2026-08-10), and it is still HERE.** A وقف ذري may
        // name a charity as its ultimate taker (مآل الوقف); the refusal now fires only on a jiha the
        // deed does NOT so name. The member's presence in this set is therefore no longer evidence
        // that "a charity on a ذري waqf is refused" — assert the CONDITION, in `resolver.test.ts`.
        'CHARITABLE_JIHA_ON_FAMILY_WAQF',
        'COHORT_MIXES_CHARITABLE_AND_FAMILY',
        'CONTINUATION_STIPULATION_UNRECOGNISED',
        // ⚠ ESC-1, the mirror of the above: a beneficiary carrying a `lineageLink` — the recorded
        // claim of descent from the waqif — on a وقف خيري, whatever the order.
        // `LINEAGE_ORDER_ON_CHARITABLE_WAQF` says nearly this but fires only under
        // `LINEAGE_CONTINUATION`; ESC-1 lived under `ORDERED`/`SHARED`, where an untiered jiha took
        // 13,750,000 of 27,500,000 halalas beside a living certified descendant.
        'DESCENDANT_ON_CHARITABLE_WAQF',
        'ENTITLEMENT_ORDER_UNRECOGNISED',
        'ENTITLEMENT_RULE_UNMAPPED',
        // ⚠ **`JIHA_TIERED` IS REACHABLE AGAIN THROUGH `runDistribution` — R7 REVIVED IT.** The comment
        // that stood here said it was unreachable, which was true of the pre-R7 engine and is false of
        // this one: `TABAQA_ON_CHARITABLE_WAQF` is خيري-only, and `CHARITABLE_JIHA_ON_FAMILY_WAQF` now
        // exempts a jiha the deed names as its ultimate taker — so a ذري deed with a valid مآل clause
        // and a TIERED taker jiha passes Stage 0 and lands on this refusal at Stage 2. Measured and
        // driven front-door in `jiha-tier-refusal.test.ts`, whose reachability census R7 re-derived.
        'JIHA_TIERED',
        'LINEAGE_CYCLE',
        'LINEAGE_EDGE_ON_NON_DESCENDANT',
        'LINEAGE_LINK_MISSING',
        'LINEAGE_LINK_UNRECOGNISED',
        'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
        'LINEAGE_PARENT_UNKNOWN',
        'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
        'TABAQA_MISMATCHES_LINEAGE_DEPTH',
        // ⚠ NEW (product-owner decision, 2026-08-03). A وقف خيري has no generations, so no
        // beneficiary of one may carry a `tabaqa` — a charitable endowment's beneficiaries are the
        // segment the waqif chose, not descendants. It closes the hole R6-F1 opened: an edgeless
        // `CATEGORY_ONLY` placeholder on a خيري waqf could carry a ṭabaqa, reach an `ORDERED` run and
        // be decided by the GENERATIONAL rule, while `assertOrderedExclusion` never tested it, I5 was
        // still certified in `invariantsChecked`, and the BR-505 statement read
        // `ORDERED_LOWEST_LIVING_TABAQA`.
        'TABAQA_ON_CHARITABLE_WAQF',
        'WAQF_TYPE_JOINT_NOT_SUPPORTED',

        /* ── R7 · مآل الوقف · the eight the reversion clause added ─────────────────────────────
         * Six are `assertReversionLegible`'s, raised at Stage 0 before any cohort refusal can grant
         * an exemption on the strength of an unreadable clause; two need the CERTIFIED lineage graph
         * and are therefore raised at Stage 2. Every one of them is a REFUSAL and never a repair —
         * a duplicated taker id is not deduplicated because deduplicating it changes an amount.
         */
        // The recognised مآل readings are a ONE-member vocabulary, so a deed reverting to another
        // waqf, to the Authority or to the waqif's nearest relatives halts BY NAME instead of being
        // coerced into the charitable reading. Arrives as `z.string()` for exactly this.
        'REVERSION_KIND_UNRECOGNISED',
        // ⚠ Claude's fail-safe reading of R5, not the owner's ruling (TODO(surface) in `resolver.ts`):
        // a خيري waqf has no bloodline to end. It also closes the VACUOUS trigger — an all-inactive
        // `CATEGORY_ONLY` cohort on a خيري waqf would otherwise satisfy "no living descendant".
        'REVERSION_ON_CHARITABLE_WAQF',
        // Not zod's `.min(1)`: "the deed names a reversion but nobody to take it" is a statement about
        // the DEED, so it must carry `SHART_INCOMPLETE`, not `DISTRIBUTION_INPUT_INVALID`.
        'REVERSION_WITH_NO_ULTIMATE_TAKER',
        'REVERSION_ULTIMATE_TAKER_UNKNOWN',
        // ⚠ The one that stops a NEW escape rather than a variant of an old one: a DESCENDANT named as
        // the ultimate taker would have their verdict taken from the reversion ladder instead of from
        // their own line — entitled whenever the clause triggered, outside the frontier test entirely.
        'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
        // Refused, never deduplicated: a repeated id counts twice in the weight vector, so it MOVES
        // MONEY, and this engine does not repair a record whose repair changes an amount.
        'REVERSION_ULTIMATE_TAKER_DUPLICATED',
        // Stage 2 (needs the certified graph). ∅ descendants is "not yet enrolled", not "extinct":
        // the engine will not pay a charity because the family register is incomplete.
        'REVERSION_WITH_NO_RECORDED_BLOODLINE',
        // Stage 2. The reversion triggered and every named taker's weight canonicalises to '0'.
        // Refused rather than split equally (R7-e) and rather than falling through to
        // `NO_ELIGIBLE_BENEFICIARIES`, which would hide an unusable deed record behind a normal flag.
        'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
      ].sort(),
    );
    // Pinned as a COUNT as well as a list, so a member added to `contract.ts` and to the literal
    // above in the same careless edit still moves a number a reviewer reads. 18 → 26 at R7.
    expect(SHART_REFUSALS.length).toBe(26);
  });

  it('has no duplicates and is SCREAMING_SNAKE throughout', () => {
    expect(new Set(SHART_REFUSALS).size).toBe(SHART_REFUSALS.length);
    for (const refusal of SHART_REFUSALS) {
      expect(refusal, `${refusal} must be SCREAMING_SNAKE`).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('is DISJOINT from DOMAIN_ERROR_CODES — a discriminator is not a second error code', () => {
    // Every one of these is thrown as `SHART_INCOMPLETE`. Promoting them to error codes would give
    // one user-facing condition twenty-six `errors.domain.*` messages, and CLAUDE.md's own rule is that
    // one condition never gets two codes. `packages/{auth,api,database,i18n}` all consume the
    // `DomainErrorCode` union and would inherit the engine's Stage-2 vocabulary.
    const codes = new Set<string>(DOMAIN_ERROR_CODES);
    for (const refusal of SHART_REFUSALS) {
      expect(codes.has(refusal), `${refusal} must NOT be a DOMAIN_ERROR_CODE`).toBe(false);
    }
    expect(codes.has('SHART_INCOMPLETE')).toBe(true);
  });

  it('does not collide with the exclusion reasons or the gate reasons', () => {
    // Three different vocabularies reach an operations screen together: a REFUSAL (no run exists), an
    // EXCLUSION (the deed owes nothing) and a GATE (owed but unpayable). One string meaning two of
    // those is how "you were refused" gets rendered as "you were excluded".
    const others = new Set<string>([...EXCLUSION_REASON_CODES, ...GATE_REASON_CODES, ...RUN_FLAGS]);
    for (const refusal of SHART_REFUSALS) {
      expect(others.has(refusal), `${refusal} is also an exclusion/gate/flag code`).toBe(false);
    }
  });
});

describe('ADR-0009 · the lineage input fields are REQUIRED, undefaulted, and arrive as DATA', () => {
  it('rejects a beneficiary with no parentId key — there is no default (a lineage guess)', () => {
    const { parentId: _dropped, ...withoutParent } = firstBeneficiary();
    expectDomainCode(
      () => parseDistributionInput(withRaw({ beneficiaries: [withoutParent] })),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('rejects a beneficiary with no lineageLink key — there is no default (a fiqh guess)', () => {
    const { lineageLink: _dropped, ...withoutLink } = firstBeneficiary();
    expectDomainCode(
      () => parseDistributionInput(withRaw({ beneficiaries: [withoutLink] })),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('rejects an input with no continuationStipulation key — no default, ever (R2)', () => {
    const { continuationStipulation: _dropped, ...withoutTerm } = validRaw();
    expectDomainCode(() => parseDistributionInput(withoutTerm), 'DISTRIBUTION_INPUT_INVALID');
  });

  it('keeps an explicit null as null on all three — never coerced to a value', () => {
    const input = parseDistributionInput(
      withRaw({
        continuationStipulation: null,
        beneficiaries: [{ ...firstBeneficiary(), parentId: null, lineageLink: null }],
      }),
    );
    expect(input.continuationStipulation).toBeNull();
    expect(input.beneficiaries[0]?.parentId).toBeNull();
    expect(input.beneficiaries[0]?.lineageLink).toBeNull();
  });

  it('keeps an unrecognised lineageLink as DATA so the resolver halts SHART_INCOMPLETE', () => {
    // Header rule 4 applied to the lineage fact. A `z.enum(LINEAGE_LINKS)` here would raise
    // DISTRIBUTION_INPUT_INVALID — "the caller sent the wrong shape" — for what is actually a
    // mis-transcribed deed fact, and would carry the one code CLAUDE.md does not name for it.
    // No trimming, no case folding: normalising a deed's free text is the seed mapper's job.
    for (const bad of ['son', 'SONS', '', ' SON ', 'NEPHEW', 'MALE']) {
      const input = parseDistributionInput(
        withRaw({ beneficiaries: [{ ...firstBeneficiary(), lineageLink: bad }] }),
      );
      expect(input.beneficiaries[0]?.lineageLink).toBe(bad);
      expect((LINEAGE_LINKS as readonly string[]).includes(bad)).toBe(false);
    }
  });

  it('keeps an unrecognised continuationStipulation as DATA, padding and case included', () => {
    for (const bad of ['zuhur_only', ' ZUHUR_ONLY ', '', 'ZUHUR', 'BUTUN_ONLY']) {
      const input = parseDistributionInput(withRaw({ continuationStipulation: bad }));
      expect(input.continuationStipulation).toBe(bad);
      expect((CONTINUATION_STIPULATIONS as readonly string[]).includes(bad)).toBe(false);
    }
  });

  it('rejects an EMPTY parentId string — a blank id is not "a child of the waqif"', () => {
    // `null` is the recorded fact "root of a line"; `''` is a data failure that would otherwise
    // dangle in the ancestor walk and be reported as LINEAGE_PARENT_UNKNOWN with an unprintable id.
    expectDomainCode(
      () =>
        parseDistributionInput(
          withRaw({ beneficiaries: [{ ...firstBeneficiary(), parentId: '' }] }),
        ),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('parses a self-parent and a dangling parentId — cross-field integrity is the resolver’s', () => {
    // Zod cannot express a cross-field reference, so both reach the resolver as data and halt there
    // with LINEAGE_CYCLE / LINEAGE_PARENT_UNKNOWN. Pinned so nobody "fixes" it into a shape error
    // and silently changes the code an operator sees.
    const selfParent = parseDistributionInput(
      withRaw({ beneficiaries: [{ ...firstBeneficiary(), parentId: 'ben-001' }] }),
    );
    expect(selfParent.beneficiaries[0]?.parentId).toBe('ben-001');
    const dangling = parseDistributionInput(
      withRaw({ beneficiaries: [{ ...firstBeneficiary(), parentId: 'ben-nope' }] }),
    );
    expect(dangling.beneficiaries[0]?.parentId).toBe('ben-nope');
  });

  it('parses waqfType JOINT — the REFUSAL is Stage 0’s, not the schema’s (ADR-0009 R5)', () => {
    // If the schema rejected it, the halt would carry DISTRIBUTION_INPUT_INVALID rather than
    // SHART_INCOMPLETE / WAQF_TYPE_JOINT_NOT_SUPPORTED, and the message could not explain that a waqf
    // is either خيري or ذري and never both, nor name the Art. 4 open item.
    const input = parseDistributionInput(withRaw({ waqfType: 'JOINT' }));
    expect(input.waqfType).toBe('JOINT');
  });

  it('rejects a misspelled lineage key rather than ignoring it (.strict())', () => {
    // `parentID` / `lineage_link` typing their way in silently is how a whole branch of the family
    // tree goes unrecorded and every survivor's per-capita share changes.
    for (const typo of ['parentID', 'lineage_link', 'lineageLinks', 'continuation']) {
      expectDomainCode(
        () =>
          parseDistributionInput(
            withRaw({ beneficiaries: [{ ...firstBeneficiary(), [typo]: 'SON' }] }),
          ),
        'DISTRIBUTION_INPUT_INVALID',
      );
    }
    expectDomainCode(
      () => parseDistributionInput(withRaw({ continuationStipulaton: 'ZUHUR_ONLY' })),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('adds NO PII to the hashed surface — the lineage edge is an id, not a name (AT-16)', () => {
    // The result and its computationTrace are canonicalized and hashed for the Nazir's signature.
    // `parentId` being an id is what lets the family tree be recorded without putting a relative's
    // name on the audit surface.
    const shape = beneficiaryInputSchema.parse(firstBeneficiary());
    expect(Object.keys(shape)).not.toContain('name');
    expect(Object.keys(shape)).not.toContain('parentName');
    expect(Object.keys(shape)).toContain('parentId');
  });
});

describe('compareBeneficiaryIds', () => {
  it('is a total order on UTF-16 code units, never localeCompare', () => {
    expect(compareBeneficiaryIds('ben-a', 'ben-b')).toBe(-1);
    expect(compareBeneficiaryIds('ben-b', 'ben-a')).toBe(1);
    expect(compareBeneficiaryIds('ben-a', 'ben-a')).toBe(0);
    // The case that proves it is not ICU collation: 'B' < 'a' in code units, but most locales
    // collate 'a' before 'B'. A host-dependent order here would make the residual tie-break —
    // and therefore a payout — depend on the machine that ran it.
    expect(compareBeneficiaryIds('B', 'a')).toBe(-1);
    expect('B'.localeCompare('a')).toBeGreaterThan(0);
  });

  it('is antisymmetric over generated ids (property)', () => {
    const id = fc.string({ minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(id, id, (a, b) => {
        // Summed rather than negated: `-0 !== +0` under `Object.is`, which `toBe` uses, so the
        // negated form fails on every equal pair for a reason that has nothing to do with ordering.
        expect(compareBeneficiaryIds(a, b) + compareBeneficiaryIds(b, a)).toBe(0);
        expect(compareBeneficiaryIds(a, a)).toBe(0);
      }),
      { numRuns: 300, seed: 20260730 },
    );
  });

  it('is transitive over generated ids (property)', () => {
    const id = fc.string({ minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(id, id, id, (a, b, c) => {
        const sorted = [a, b, c].sort(compareBeneficiaryIds);
        const [x, y, z] = sorted;
        if (x === undefined || y === undefined || z === undefined) return;
        expect(compareBeneficiaryIds(x, y)).toBeLessThanOrEqual(0);
        expect(compareBeneficiaryIds(y, z)).toBeLessThanOrEqual(0);
        expect(compareBeneficiaryIds(x, z)).toBeLessThanOrEqual(0);
      }),
      { numRuns: 300, seed: 20260730 },
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assertResultShape
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertResultShape', () => {
  function line(id: string, entitled: Minor) {
    return {
      beneficiaryId: id,
      status: 'PAID' as const,
      entitledMinor: entitled,
      sharePercent: '50.000000',
      basis: {
        tabaqa: 1,
        line: 'ZUHUR' as const,
        branch: 'Branch A',
        kind: 'FAMILY' as const,
        rule: 'ORDERED_LOWEST_LIVING_TABAQA' as const,
        // ADR-0009's four additions. Present here so the helper keeps documenting the real output
        // shape — `LineBasis` has no optional fields, and an absent key and a `null` key serialize
        // differently in the bytes the Nazir's signature covers.
        lineageDepth: 1,
        parentId: null,
        lineageLink: 'SON' as const,
        continuationStipulation: null,
      },
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: null,
    };
  }

  function resultWith(lines: ReturnType<typeof line>[]): DistributionResult {
    return { lines } as unknown as DistributionResult;
  }

  it('accepts a well-formed, ascending line set', () => {
    const result = resultWith([line('ben-001', minorOf(1n)), line('ben-002', minorOf(1n))]);
    expect(assertResultShape(result)).toBe(result);
  });

  it('refuses two lines for one beneficiary', () => {
    expectDomainCode(
      () =>
        assertResultShape(resultWith([line('ben-001', minorOf(1n)), line('ben-001', minorOf(1n))])),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('refuses lines that are not in ascending beneficiaryId order (I8 / I9 depend on it)', () => {
    expectDomainCode(
      () =>
        assertResultShape(resultWith([line('ben-002', minorOf(1n)), line('ben-001', minorOf(1n))])),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('accepts an empty line set (the nil and direct-use runs)', () => {
    expect(() => assertResultShape(resultWith([]))).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Purity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('purity', () => {
  it('reads no clock: the same raw input parses to a deep-equal value every time', () => {
    const a = parseDistributionInput(validRaw());
    const b = parseDistributionInput(validRaw());
    expect(a).toStrictEqual(b);
  });

  it('does not mutate the caller`s object', () => {
    const raw = validRaw();
    const snapshot = JSON.stringify(raw, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    parseDistributionInput(raw);
    expect(
      JSON.stringify(raw, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
    ).toBe(snapshot);
  });

  it('keeps the dual-date schema usable on its own (the caller builds asOf with ../dates)', () => {
    const gregorian = '2026-07-14';
    const parsed = dualDateSchema.parse({ gregorian, hijri: toHijri(civilDate(gregorian)) });
    expect(parsed.hijri).toBe('1448-01-29');
  });

  it('exposes receiptInputSchema for the stage modules without re-deriving it', () => {
    expect(
      receiptInputSchema.safeParse({ id: 'r', receiptClass: 'INCOME', amountMinor: 0n }).success,
    ).toBe(true);
  });

  it('keeps fromMinor/toMinor as the ONLY conversion path (no second implementation here)', () => {
    // If a future edit hand-rolls `Number(minor) / 100`, this equality is what breaks.
    expect(minorToMoney(minorOf(12_345n)).equals(fromMinor(12_345n))).toBe(true);
    expect(moneyToMinor(money('123.45'))).toBe(toMinor(money('123.45')));
  });
});
