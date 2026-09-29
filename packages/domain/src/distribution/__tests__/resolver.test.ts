/**
 * `distribution/resolver.test.ts` — Stage 2: who is ENTITLED.
 *
 * What this suite is FOR, so a later reader does not weaken it by accident:
 *
 * 1. **It drives behaviour, never shape.** Nothing here asserts that a string appears near a call
 *    site; every test constructs a beneficiary set and checks the verdict the deed produces. Sprint 2
 *    shipped a bypassable guard because a test asserted the presence of a guard rather than its
 *    effect — that is the anti-pattern this file refuses.
 * 2. **The refusals are tested as hard as the happy paths.** `SHART_INCOMPLETE` is a *feature*: an
 *    unrecognised order, an unreadable continuation term and a joint waqf must halt rather than fall
 *    back to an equal split. Several tests exist purely to prove no fallback exists.
 * 3. **Excluded ≠ withheld is proven arithmetically, not asserted.** An excluded member's effective
 *    weight is `'0'` and is therefore absent from the denominator; the deed's own figure survives on
 *    `source`. The 37.5%-of-distributable bug (waqf-001's three `12.5` weights) is pinned twice.
 * 4. **The entitlement/payability separation is driven, not documented.** One test flips EVERY
 *    payability field on EVERY beneficiary and demands a byte-identical verdict. If the resolver ever
 *    consults KYC, category capture, licensing or residency, that test fails.
 *
 * ## ADR-0009 · what moved in this file, and why nothing was deleted
 *
 * The `ORDERED` / `SHARED` / `NA_DIRECT_USE` blocks below are **unchanged in substance**: R4 preserves
 * both tier paths as the explicitly-stipulated exception, and their behaviour is exactly what §08,
 * fixture `waqf-001`/`waqf-002` and verification scenario V-1 are built on.
 *
 * What changed is that **`JOINT` is a refused input, not a mode**. Every S3 test that exercised a
 * joint waqf is **inverted here to assert the refusal** rather than removed — the same discipline used
 * when the tiered-jiha defect was closed, and for the same reason: the inputs that used to compute
 * must be pinned as inputs that can never compute again. The one S3 test that pinned a **fiqh question
 * which has now dissolved** (whether a wholly-inactive family leg made a joint waqf "charitable-only
 * this period") is deleted along with the resolver's `TODO(surface)` about it, and this paragraph is
 * its headstone.
 *
 * The lineage path's own suite is `./lineage-entitlement.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import {
  CONTINUATION_STIPULATIONS,
  ENTITLEMENT_ORDERS,
  ENTITLEMENT_RULES,
  EXCLUSION_REASON_CODES,
  LINEAGE_LINKS,
  SHART_REFUSALS,
  WAQF_TYPES,
  parseDistributionInput,
  type DistributionInput,
  type DistributionInputRaw,
  type EntitlementOrder,
  type WaqfType,
} from '../contract.js';
import {
  assertReversionLegible,
  assertSingleWaqfNature,
  entitlementRuleFor,
  parseContinuationStipulation,
  parseEntitlementOrder,
  parseLineageLink,
  resolveEntitlement,
  type EntitlementResolution,
  type ResolvedBeneficiary,
} from '../resolver.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Builders
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];

const ASOF_GREGORIAN = '2026-07-14';

/**
 * A beneficiary whose PAYABILITY fields are all deliberately clean and boring.
 *
 * Every test that cares about entitlement varies only `tabaqa` / `parentId` / `lineageLink` / `line` /
 * `active` / `stipulatedWeight` / `kind`. If a resolver verdict ever changed because of a field this
 * builder sets, the separation this module exists to keep would already be broken.
 *
 * ⚠ **`lineageLink` DEFAULTS TO A REAL EDGE, and `parentId` defaults to `null` = "a child of the
 * waqif" (depth 1), never "unknown".**
 *
 * This block used to read "`parentId` and `lineageLink` default to `null` — outside the lineage graph
 * — because the edge is only mandatory under `LINEAGE_CONTINUATION`". **R6 retired that** (product
 * owner, 2026-08-03, ADR-0009 open question 10): eligibility comes from descent, so a
 * `FAMILY`/`CATEGORY_ONLY` member with no `lineageLink` halts `LINEAGE_LINK_MISSING` on EVERY order.
 * With the old default nearly every `ORDERED`/`SHARED` case in this file resolved a record the engine
 * refuses, and the suite could not even collect.
 *
 * The link is read off `line` so the two cannot contradict each other, and a `CHARITABLE_JIHA` gets
 * `null` because a charity is not a descendant (`LINEAGE_EDGE_ON_NON_DESCENDANT`).
 *
 * ⚠ **A call site that sets `tabaqa` above 1 MUST also set `parentId`.** The derived depth and the
 * declared ṭabaqa are cross-checked against each other (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) and neither
 * side is preferred, so a tier contrast on a family waqf now requires a real two-node graph. That is
 * the rule, not an obstacle to route around.
 */
function ben(overrides: Partial<RawBeneficiary> & { readonly id: string }): RawBeneficiary {
  const kind = overrides.kind ?? 'FAMILY';
  const line = overrides.line ?? 'ZUHUR';
  return {
    kind: 'FAMILY',
    active: true,
    tabaqa: 1,
    parentId: null,
    lineageLink: kind === 'CHARITABLE_JIHA' ? null : line === 'BUTUN' ? 'DAUGHTER' : 'SON',
    line: 'ZUHUR',
    branch: 'Branch A',
    stipulatedWeight: '10',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: 'FAKE-ACCT-W1',
    ...overrides,
  };
}

/** The non-beneficiary half of a valid input. None of it is read by Stage 2; all of it must parse. */
function baseRaw(): DistributionInputRaw {
  return {
    waqfId: 'waqf-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'ORDERED',
    continuationStipulation: null,
    // R7 · stated EXPLICITLY, and every case that does not override it depends on the value. `null`
    // means "the deed records no مآل clause", which is what keeps `CHARITABLE_JIHA_ON_FAMILY_WAQF`
    // and `COHORT_MIXES_CHARITABLE_AND_FAMILY` firing in the cases below: a base that carried a
    // reversion would have exempted them and every such test would pass for the wrong reason.
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
    beneficiaries: [ben({ id: 'ben-001' })],
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

/** Parse a bent input through the one door in, so every test runs against branded, checked data. */
function makeInput(overrides: Partial<DistributionInputRaw> = {}): DistributionInput {
  return parseDistributionInput({ ...baseRaw(), ...overrides });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Assertion helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

function expectShartIncomplete(run: () => unknown): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected DomainError('SHART_INCOMPLETE'), got ${
        caught === undefined ? 'no throw (the engine guessed instead of halting)' : String(caught)
      }`,
    );
  }
  expect(caught.code).toBe('SHART_INCOMPLETE');
  return caught;
}

/**
 * A refusal, checked on BOTH halves of the contract: the thrown code and the discriminator.
 *
 * The code is `SHART_INCOMPLETE` for all twenty-six refusals, so a test that checked only the code would
 * pass against the wrong refusal — which is exactly how an inverted test ends up proving the previous
 * behaviour. Every refusal assertion in this suite and in `./lineage-entitlement.test.ts` goes through
 * here, and the discriminator is asserted to be a member of the closed vocabulary.
 */
function expectRefusal(run: () => unknown, refusal: string): DomainError {
  const error = expectShartIncomplete(run);
  const details = error.details as { readonly refusal?: unknown } | undefined;
  expect(SHART_REFUSALS).toContain(details?.refusal);
  expect(details?.refusal).toBe(refusal);
  return error;
}

/** The verdict for one id, or a failing assertion naming what was resolved instead. */
function verdict(resolution: EntitlementResolution, id: string): ResolvedBeneficiary {
  const found = resolution.resolved.find((entry) => entry.beneficiaryId === id);
  if (found === undefined) {
    throw new Error(
      `no verdict for "${id}"; resolved ids were [${resolution.resolved
        .map((entry) => entry.beneficiaryId)
        .join(', ')}]`,
    );
  }
  return found;
}

/** `[id, entitled | exclusionReason]` for every resolved member, in resolution order. */
function verdictSummary(resolution: EntitlementResolution): readonly (readonly [string, string])[] {
  return resolution.resolved.map(
    (entry) => [entry.beneficiaryId, entry.exclusionReason ?? 'ENTITLED'] as const,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * parseEntitlementOrder — the engine never guesses the Shart
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('parseEntitlementOrder', () => {
  it('accepts every member of the closed vocabulary and returns it unchanged', () => {
    for (const order of ENTITLEMENT_ORDERS) {
      expect(parseEntitlementOrder(order)).toBe(order);
    }
  });

  it('halts with SHART_INCOMPLETE on an unrecognised order, naming the value and the closed set', () => {
    // AT-08(a): 'MURATTAB' is a real fiqh term, which is exactly why it must not be guessed at.
    const error = expectRefusal(
      () => parseEntitlementOrder('MURATTAB'),
      'ENTITLEMENT_ORDER_UNRECOGNISED',
    );
    expect(error.message).toContain('MURATTAB');
    expect(error.details).toMatchObject({
      field: 'entitlementOrder',
      received: 'MURATTAB',
      recognised: [...ENTITLEMENT_ORDERS],
    });
  });

  it('does NOT normalise case, whitespace or emptiness — normalising is inferring intent', () => {
    // A mapper (packages/database/src/seed/map.ts) normalises the deed's free text. If the ENGINE
    // did it, a mis-transcribed condition would become a payout instead of a question.
    for (const raw of ['ordered', 'Ordered', ' ORDERED ', 'ORDERED\n', 'shared', '', '  ']) {
      expectShartIncomplete(() => parseEntitlementOrder(raw));
    }
  });

  it('has NO default for the normal deed shape either — LINEAGE_CONTINUATION is not a fallback', () => {
    // ADR-0009 R4 calls lineage the deed shape the product treats as normal. "Normal" is the value a
    // deed is RECORDED as, never the value code supplies when the record is silent (binding rule 1).
    for (const raw of ['', 'lineage', 'LINEAGE', 'LINEAGE_CONTINUATION ']) {
      expectRefusal(() => parseEntitlementOrder(raw), 'ENTITLEMENT_ORDER_UNRECOGNISED');
    }
    expect(parseEntitlementOrder('LINEAGE_CONTINUATION')).toBe('LINEAGE_CONTINUATION');
  });

  it("halts on the fixture's free-text direct-use spelling — mapping it is the seed's job", () => {
    const error = expectShartIncomplete(() =>
      parseEntitlementOrder('n/a (direct use of the asset)'),
    );
    expect(error.details).toMatchObject({ received: 'n/a (direct use of the asset)' });
  });

  it('halts on a non-string, rather than coercing "undefined" into a recorded condition', () => {
    const error = expectShartIncomplete(() =>
      parseEntitlementOrder(undefined as unknown as string),
    );
    expect(error.details).toMatchObject({ receivedType: 'undefined' });
    expect(
      expectShartIncomplete(() => parseEntitlementOrder(null as unknown as string)).details,
    ).toMatchObject({ receivedType: 'object' });
  });

  it('bounds the echoed deed text so a persisted trace cannot carry a whole paragraph', () => {
    const paragraph = 'ش'.repeat(400);
    const error = expectShartIncomplete(() => parseEntitlementOrder(paragraph));
    const received = (error.details as { readonly received?: unknown } | undefined)?.received;
    expect(typeof received).toBe('string');
    expect(String(received).length).toBeLessThan(paragraph.length);
    // Bounded, but still diagnostic: enough of the value to find the condition in the deed.
    expect(String(received)).toContain('ش');
  });

  it('never returns a fallback value for an unrecognised order', () => {
    let returned: EntitlementOrder | 'threw' = 'threw';
    try {
      returned = parseEntitlementOrder('EQUAL_SPLIT');
    } catch {
      returned = 'threw';
    }
    expect(returned).toBe('threw');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * parseContinuationStipulation — a closed TWO-value deed term with no default (R2)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('parseContinuationStipulation', () => {
  it('accepts exactly the two recognised terms and returns them unchanged', () => {
    expect(CONTINUATION_STIPULATIONS).toHaveLength(2);
    for (const term of CONTINUATION_STIPULATIONS) {
      expect(parseContinuationStipulation(term)).toBe(term);
    }
  });

  it('halts on null — which lines a founder continued is not something code may choose', () => {
    const error = expectRefusal(
      () => parseContinuationStipulation(null),
      'CONTINUATION_STIPULATION_UNRECOGNISED',
    );
    expect(error.details).toMatchObject({
      field: 'continuationStipulation',
      received: 'null',
      recognised: [...CONTINUATION_STIPULATIONS],
    });
  });

  it('does NOT normalise case, whitespace, emptiness or a near-spelling', () => {
    // Each of these is a deed term a human transcribed. Normalising here is where a mis-transcribed
    // condition silently becomes a payout to (or a refusal of) a daughter's children.
    for (const raw of [
      '',
      '  ',
      'zuhur_only',
      'ZUHUR_ONLY ',
      ' ZUHUR_ONLY',
      'ZUHUR-ONLY',
      'ZUHUR',
      'BUTUN',
      'ZUHUR_AND_BUTUN\n',
      'ظهور فقط',
    ]) {
      expectRefusal(
        () => parseContinuationStipulation(raw),
        'CONTINUATION_STIPULATION_UNRECOGNISED',
      );
    }
  });

  it('never returns a third value, and never picks one of the two', () => {
    let returned: string = 'threw';
    try {
      returned = parseContinuationStipulation('BOTH_LINES');
    } catch {
      returned = 'threw';
    }
    expect(returned).toBe('threw');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * parseLineageLink — the fiqh fact, not a demographic
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('parseLineageLink', () => {
  it('accepts exactly SON and DAUGHTER', () => {
    expect(LINEAGE_LINKS).toStrictEqual(['SON', 'DAUGHTER']);
    for (const link of LINEAGE_LINKS) {
      expect(parseLineageLink(link, 'ben-001')).toBe(link);
    }
  });

  it('halts on anything else, naming the beneficiary so the deed entry can be found', () => {
    for (const raw of ['son', 'Son', 'SON ', 'MALE', 'CHILD', 'ابن', '']) {
      const error = expectRefusal(
        () => parseLineageLink(raw, 'ben-042'),
        'LINEAGE_LINK_UNRECOGNISED',
      );
      expect(error.details).toMatchObject({
        field: 'beneficiaries[].lineageLink',
        beneficiaryId: 'ben-042',
        recognised: [...LINEAGE_LINKS],
      });
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * entitlementRuleFor
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('entitlementRuleFor', () => {
  it('maps the declared order to its rule for a non-joint waqf', () => {
    expect(entitlementRuleFor('ORDERED', 'FAMILY_DHURRI', null)).toBe(
      'ORDERED_LOWEST_LIVING_TABAQA',
    );
    expect(entitlementRuleFor('SHARED', 'FAMILY_DHURRI', null)).toBe('SHARED_ALL_LIVING_TABAQAT');
    expect(entitlementRuleFor('ORDERED', 'PUBLIC_CHARITABLE', null)).toBe(
      'ORDERED_LOWEST_LIVING_TABAQA',
    );
  });

  it('gives the two lineage paths DIFFERENT labels — the statement says different things (BR-505)', () => {
    // "your line continues" and "your line does not continue under this deed" are different legal
    // statements to make to a family member, and the reason must be legible from the statement.
    expect(entitlementRuleFor('LINEAGE_CONTINUATION', 'FAMILY_DHURRI', 'ZUHUR_ONLY')).toBe(
      'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
    );
    expect(entitlementRuleFor('LINEAGE_CONTINUATION', 'FAMILY_DHURRI', 'ZUHUR_AND_BUTUN')).toBe(
      'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
    );
  });

  it('refuses a lineage order with no narrowed continuation term rather than picking a label', () => {
    expectRefusal(
      () => entitlementRuleFor('LINEAGE_CONTINUATION', 'FAMILY_DHURRI', null),
      'ENTITLEMENT_RULE_UNMAPPED',
    );
  });

  it('HALTS on a JOINT waqf — INVERTED by ADR-0009 R5, it used to be labelled', () => {
    // S3 stamped every joint run `JOINT_FIXED_DEED_SHARES` "whatever the declared order (§08 Example
    // D)". A waqf is either خيري or ذري and never both, so there is no fixed deed split to label; the
    // input is refused. The discriminator is ENTITLEMENT_RULE_UNMAPPED rather than
    // WAQF_TYPE_JOINT_NOT_SUPPORTED on purpose: reaching this arm means the Stage-0 refusal was
    // BYPASSED, and a reader needs to know it was the rule map that stopped the run.
    for (const order of ['ORDERED', 'SHARED', 'LINEAGE_CONTINUATION'] as const) {
      expectRefusal(
        () => entitlementRuleFor(order, 'JOINT', 'ZUHUR_ONLY'),
        'ENTITLEMENT_RULE_UNMAPPED',
      );
    }
  });

  it('no longer lets NA_DIRECT_USE outrank JOINT for the two OTHER types — but still wins for them', () => {
    // INVERTED HALF: S3 asserted `entitlementRuleFor('NA_DIRECT_USE', 'JOINT')` returned
    // NA_DIRECT_USE, on the reasoning that a run with no monetary line cannot carry a split rule.
    // That reasoning survives — direct use still outranks the ORDER — but it can no longer be
    // demonstrated on a JOINT waqf, because `assertSingleWaqfNature` refuses one before Stage 2 reads
    // the order at all. Here the function is called directly, so the precedence is still visible.
    expect(entitlementRuleFor('NA_DIRECT_USE', 'JOINT', null)).toBe('NA_DIRECT_USE');
    for (const waqfType of ['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const) {
      expect(entitlementRuleFor('NA_DIRECT_USE', waqfType, null)).toBe('NA_DIRECT_USE');
    }
  });

  it('maps every legal (order, waqfType, continuation) triple to a member of the closed vocabulary', () => {
    for (const order of ENTITLEMENT_ORDERS) {
      for (const waqfType of ['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const) {
        const continuation = order === 'LINEAGE_CONTINUATION' ? 'ZUHUR_AND_BUTUN' : null;
        expect(ENTITLEMENT_RULES).toContain(entitlementRuleFor(order, waqfType, continuation));
      }
    }
  });

  it('can never produce JOINT_FIXED_DEED_SHARES — the value survives, unreachable', () => {
    // The vocabulary keeps the member so the record that this repo once modelled joint deeds survives
    // the reversal-if-counsel-disagrees path. Its unreachability is carried HERE, by a test, never by
    // the comment beside it.
    expect(ENTITLEMENT_RULES).toContain('JOINT_FIXED_DEED_SHARES');
    for (const order of ENTITLEMENT_ORDERS) {
      for (const waqfType of WAQF_TYPES) {
        for (const continuation of [null, ...CONTINUATION_STIPULATIONS] as const) {
          let produced: string | null = null;
          try {
            produced = entitlementRuleFor(order, waqfType, continuation);
          } catch {
            produced = null;
          }
          expect(produced).not.toBe('JOINT_FIXED_DEED_SHARES');
        }
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * assertSingleWaqfNature — R5, and it REPLACES assertJointLegsPresent
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertSingleWaqfNature', () => {
  /**
   * ⚠ Every test in this block is an INVERSION of a passing S3 test. The function it replaces,
   * `assertJointLegsPresent`, existed to locate the two legs of a joint split; ADR-0009 R5 says a
   * waqf is either خيري (charitable, for a segment the waqif chooses) or ذري
   * (ancestral/generational) and never both, so there are no legs to locate.
   *
   * Deleted rather than inverted, and named here so the deletion is deliberate:
   * *"counts an INACTIVE family member as a declared leg — surfaced fiqh question, pinned here"*.
   * The question it pinned — is a joint waqf whose family leg is wholly inactive this period
   * "malformed" or legitimately "charitable-only"? — **dissolves**, because the joint waqf itself is
   * refused whatever the vital status of its members. The resolver's matching `TODO(surface)` is gone
   * with it.
   */
  /**
   * ⚠ **RE-POINTED: the cohort now DEPENDS on the waqf's nature, because ESC-1 says it must.**
   *
   * This ran one `FAMILY` member under both types. `DESCENDANT_ON_CHARITABLE_WAQF` now refuses any
   * beneficiary carrying a `lineageLink` on a `PUBLIC_CHARITABLE` waqf — and R6 requires that link on
   * every `FAMILY` member — so "a family member on a خيري waqf" is not a single-natured waqf at all;
   * it is exactly the two-natured record R5 forbids, read from the other end.
   *
   * The claim survives with the right subject on each side: a bloodline on the ذري waqf, a jiha on the
   * خيري one. If ESC-1 ever comes out, the خيري case here is the first thing that should change.
   *
   * ⚠ **INVERTED AGAIN (product-owner decision, 2026-08-03 · `TABAQA_ON_CHARITABLE_WAQF`).** The
   * mirror half's INPUT is unchanged — `ben({ id: 'ben-001' })`, which is `tabaqa: 1` +
   * `lineageLink: 'SON'` by builder default — but the refusal that answers it moved.
   * MEASURED BEFORE the new rule: `DESCENDANT_ON_CHARITABLE_WAQF`. MEASURED AFTER:
   * `TABAQA_ON_CHARITABLE_WAQF`, because the ṭabaqa check now precedes the lineage-link check inside
   * `assertSingleWaqfNature` and this record trips both. The old discriminator is NOT abandoned — the
   * second half below drives it on the one record that carries descent without a tier, which is the
   * only shape that still reaches it. Two records, one field apart, one refusal each: that is what
   * keeps either rule from silently absorbing the other's coverage.
   */
  it('is a no-op for a single-natured waqf, however its beneficiaries are composed', () => {
    expect(() =>
      assertSingleWaqfNature(
        makeInput({ waqfType: 'FAMILY_DHURRI', beneficiaries: [ben({ id: 'ben-001' })] }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSingleWaqfNature(
        makeInput({
          waqfType: 'PUBLIC_CHARITABLE',
          beneficiaries: [
            ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
          ],
        }),
      ),
    ).not.toThrow();

    // …and the mirror, pinned rather than left implicit: a bloodline on a خيري waqf is REFUSED.
    // Same input as before the new rule; the winning refusal is the thing that changed.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({ waqfType: 'PUBLIC_CHARITABLE', beneficiaries: [ben({ id: 'ben-001' })] }),
        ),
      'TABAQA_ON_CHARITABLE_WAQF',
    );

    // …and ESC-1's own discriminator, still reachable and still doing work: descent recorded WITHOUT
    // a tier. `tabaqa: null` is what clears the new rule, so this is the residue ESC-1 still owns.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            beneficiaries: [ben({ id: 'ben-001', tabaqa: null, lineageLink: 'SON' })],
          }),
        ),
      'DESCENDANT_ON_CHARITABLE_WAQF',
    );
  });

  it('REFUSES what S3 accepted: a JOINT waqf with both legs declared', () => {
    // S3: "passes when both legs are declared".
    const error = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'JOINT',
            beneficiaries: [
              ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
              ben({ id: 'ben-007' }),
            ],
          }),
        ),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
    // The message must explain the fiqh AND name the open reconciliation item, so a reader knows the
    // refusal is a product rule under counsel review rather than a settled legal finding.
    expect(error.message).toContain('خيري');
    expect(error.message).toContain('ذري');
    expect(error.message).toContain('Art. 4');
    expect(error.details).toMatchObject({ field: 'waqfType', waqfType: 'JOINT' });
  });

  it('refuses a JOINT waqf for the NEW reason whatever its legs — one, none, or both', () => {
    // S3 halted these three too, but for `missingLegs`. Same code, new reason: it is no longer a
    // joint waqf MISSING a leg that halts, it is EVERY joint waqf.
    const cohorts: readonly (readonly RawBeneficiary[])[] = [
      [ben({ id: 'ben-007' })],
      [ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' })],
      [ben({ id: 'ben-009', kind: 'CATEGORY_ONLY', tabaqa: null, line: 'NA', category: null })],
      [],
    ];
    for (const beneficiaries of cohorts) {
      const error = expectRefusal(
        () =>
          assertSingleWaqfNature(
            makeInput({ waqfType: 'JOINT', beneficiaries: [...beneficiaries] }),
          ),
        'WAQF_TYPE_JOINT_NOT_SUPPORTED',
      );
      // `missingLegs` is gone: there are no legs.
      expect(error.details).not.toHaveProperty('missingLegs');
    }
  });

  it('refuses a MIXED COHORT under FAMILY_DHURRI — the re-entry route the cohort key exists to close', () => {
    // The substantive half of R5. If the refusal were keyed on `waqfType` alone, the very same
    // charitable-plus-family cohort would simply re-enter declared as FAMILY_DHURRI and nothing would
    // have been prevented.
    for (const waqfType of ['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const) {
      const error = expectRefusal(
        () =>
          assertSingleWaqfNature(
            makeInput({
              waqfType,
              entitlementOrder: 'SHARED',
              beneficiaries: [
                ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
                ben({ id: 'ben-007' }),
              ],
            }),
          ),
        'COHORT_MIXES_CHARITABLE_AND_FAMILY',
      );
      expect(error.details).toMatchObject({
        field: 'beneficiaries[].kind',
        charitableJihaCount: 1,
        familyCount: 1,
      });
    }
  });

  /**
   * ⚠ **The placeholder's SHAPE now differs by the waqf's nature, and the difference is the finding.**
   *
   * One `placeholder` constant used to serve both pairings. It cannot any more: R6 requires a
   * `lineageLink` on a `CATEGORY_ONLY` member and ESC-1 refuses one on a خيري waqf, so the charitable
   * placeholder must be edgeless and the family placeholder must carry the edge.
   *
   * ⚠ That means the charitable pairing below passes `assertSingleWaqfNature` and is then refused by
   * `buildLineage` (`LINEAGE_LINK_MISSING`) a few steps later, whichever value the field takes — the
   * R6-F1 squeeze, driven end to end in `r6-adversarial.test.ts` §5 and NOT resolved here. This is a
   * unit test of the leg logic and its claim is unchanged: neither pairing MIXES TWO NATURES.
   */
  it('does NOT treat a CATEGORY_ONLY placeholder as a leg — both pairings stay legal', () => {
    // jiha + placeholder = a charitable waqf whose segment is not yet individually identified.
    // family + placeholder = a family waqf with an unnamed descendant. Neither mixes two natures.
    const charitablePlaceholder = ben({
      id: 'ben-009',
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      // Edgeless — a خيري waqf's segment does not descend from the waqif (ESC-1).
      lineageLink: null,
      category: 'orphans of the district',
    });
    const familyPlaceholder = ben({
      id: 'ben-009',
      kind: 'CATEGORY_ONLY',
      // Carries the edge R6 requires: an unnamed child of the waqif, depth 1.
      tabaqa: 1,
      parentId: null,
      lineageLink: 'SON',
      category: 'a grandchild not yet named',
    });
    expect(() =>
      assertSingleWaqfNature(
        makeInput({
          waqfType: 'PUBLIC_CHARITABLE',
          beneficiaries: [
            ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
            charitablePlaceholder,
          ],
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSingleWaqfNature(
        makeInput({
          waqfType: 'FAMILY_DHURRI',
          beneficiaries: [ben({ id: 'ben-007' }), familyPlaceholder],
        }),
      ),
    ).not.toThrow();
  });

  it('counts an INACTIVE member on either side — a mixed cohort is mixed however it is composed', () => {
    // The vital status of the members cannot make two natures into one. (This is the surviving,
    // *reversed* half of the S3 test whose fiqh question dissolved: there, inactivity was read as
    // possibly making a joint waqf single-natured; here it cannot.)
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [
              ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
              ben({ id: 'ben-007', active: false }),
            ],
          }),
        ),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
  });

  it('refuses a lineage order on a PUBLIC_CHARITABLE waqf — a charity has no descendants', () => {
    const error = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            beneficiaries: [
              ben({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
            ],
          }),
        ),
      'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
    );
    expect(error.details).toMatchObject({ waqfType: 'PUBLIC_CHARITABLE' });
    // The same order on a family waqf is the NORMAL case — the refusal is about the pairing.
    expect(() =>
      assertSingleWaqfNature(
        makeInput({
          waqfType: 'FAMILY_DHURRI',
          entitlementOrder: 'LINEAGE_CONTINUATION',
          continuationStipulation: 'ZUHUR_ONLY',
          beneficiaries: [ben({ id: 'ben-001', lineageLink: 'SON' })],
        }),
      ),
    ).not.toThrow();
  });

  /* ── R7 · the three refusals the مآل clause NARROWED, each inverted with its input verbatim ─── */

  /**
   * ⚠ **INVERTED (product owner, 2026-08-10 · R7). The inputs are kept VERBATIM and split by one
   * field**, so the same record proves the old refusal and the new permission depending on the deed.
   *
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` used to be unconditional on a ذري waqf, on the reasoning that
   * *"an ancestral waqf's beneficiaries are the waqif's descendants and a charity is not one"* — full
   * stop. The owner was asked and answered that a وقف ذري **may** end up at a charity, *"once ALL
   * descendants are dead and the bloodline is over"*. So the refusal is CONFIRMED for the case R5 still
   * forbids (a charity paid **concurrently** with the family) and REVERSED for the ultimate-taker case.
   *
   * MEASURED history of this exact cohort shape, kept because each outcome was true of a different
   * engine: **(1)** pre-amendment-D it COMPUTED and paid the charity 27,500,000 of 27,500,000 halalas
   * unflagged, with invariant I5 still reported as checked; **(2)** amendment D refused it
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` unconditionally; **(3)** R7 refuses it when the deed records no
   * مآل clause, and RESOLVES it when the deed names that jiha — with the charity's share computed as
   * **zero** while any descendant lives. The diversion is not merely refused, it is priced at nothing.
   */
  it('R7 · a jiha on a ذري waqf: refused with no clause, PERMITTED as the recorded ultimate taker', () => {
    const jiha = ben({
      id: 'jiha-001',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      lineageLink: null,
      stipulatedWeight: '10',
    });
    const cohort = [jiha, ben({ id: 'ben-001', tabaqa: 1, lineageLink: 'SON' })];

    // (a) `reversion: null` — the deed records no مآل, and R7-c forbids inferring one from the
    //     charity's mere presence. Still refused, and the details now separate the two arms.
    const error = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({ waqfType: 'FAMILY_DHURRI', beneficiaries: cohort, reversion: null }),
        ),
      // With a FAMILY member present the cohort refusal fires first — both would apply, and asserting
      // the SPECIFIC one is the discipline: a bare SHART_INCOMPLETE would not have noticed the move.
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expect(error.details).toMatchObject({ reversionRecorded: false, unnamedJihaIds: ['jiha-001'] });
    expect(error.message).toContain('مآل الوقف');

    // (b) a clause that names a DIFFERENT charity — refused, and the message NAMES the unnamed id, so
    //     an operator fixes the record rather than guessing which charity is unaccounted for.
    const other = ben({
      id: 'jiha-002',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      lineageLink: null,
      stipulatedWeight: '10',
    });
    const wrongName = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [...cohort, other],
            reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-002'] },
          }),
        ),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expect(wrongName.details).toMatchObject({
      reversionRecorded: true,
      unnamedJihaIds: ['jiha-001'],
    });

    // (c) the clause names EVERY jiha in the cohort ⇒ permitted. This is R7-a's primary deed shape and
    //     it must pass Stage 0, or a ذري deed with a properly recorded مآل is uncomputable.
    expect(() =>
      assertSingleWaqfNature(
        makeInput({
          waqfType: 'FAMILY_DHURRI',
          beneficiaries: cohort,
          reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] },
        }),
      ),
    ).not.toThrow();
  });

  it('R7 · `every`, not `some`: ONE unnamed jiha beside named ones still refuses', () => {
    // The exemption predicate is `jihaIds.every(id => takerIds.has(id))`. An unnamed charity standing
    // beside named ones is still a charity that would be paid concurrently with the family, and a
    // `some(...)` reading would have let the whole cohort through on the strength of one named id.
    const jihaAt = (id: string): RawBeneficiary =>
      ben({ id, kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA', lineageLink: null });
    const error = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [
              jihaAt('jiha-001'),
              jihaAt('jiha-002'),
              jihaAt('jiha-003'),
              ben({ id: 'ben-001', tabaqa: 1, lineageLink: 'SON' }),
            ],
            reversion: {
              kind: 'CHARITABLE_ULTIMATE_TAKER',
              ultimateTakerIds: ['jiha-001', 'jiha-003'],
            },
          }),
        ),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expect(error.details).toMatchObject({ unnamedJihaIds: ['jiha-002'] });
  });

  /**
   * ⚠ **The `PUBLIC_CHARITABLE` arm of every narrowed refusal stays ABSOLUTE, and this is the test that
   * proves the narrowing did not leak across the type boundary.** R7 is a rule about ذري deeds; a خيري
   * waqf has no bloodline to end, so it can have no مآل in this sense and no exemption from anything.
   */
  it('R7 · the narrowing does NOT reach a PUBLIC_CHARITABLE waqf — no exemption exists there', () => {
    const jiha = ben({
      id: 'jiha-001',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      lineageLink: null,
    });
    // A خيري waqf may not record a reversion AT ALL, so the attempted exemption is refused before the
    // cohort is even examined. ⚠ Claude's fail-safe reading of R5 (TODO(surface) in `resolver.ts`) —
    // if the owner rules that a خيري deed may record one, this case is the first to change.
    const onCharitable = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            entitlementOrder: 'SHARED',
            beneficiaries: [jiha, ben({ id: 'ben-001', tabaqa: null, lineageLink: 'SON' })],
            reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] },
          }),
        ),
      'REVERSION_ON_CHARITABLE_WAQF',
    );
    expect(onCharitable.details).toMatchObject({ waqfType: 'PUBLIC_CHARITABLE' });

    // …and with the clause removed the pre-R7 verdict is unchanged: a خيري cohort mixing a charity
    // and a bloodline is still refused, on the descendant's recorded claim of descent.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            entitlementOrder: 'SHARED',
            beneficiaries: [jiha, ben({ id: 'ben-001', tabaqa: null, lineageLink: 'SON' })],
            reversion: null,
          }),
        ),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );

    // …and the lineage arm too: `LINEAGE_ORDER_ON_CHARITABLE_WAQF` on a خيري waqf is unconditional, so
    // a reversion cannot buy its way past it either.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            beneficiaries: [jiha],
            reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] },
          }),
        ),
      'REVERSION_ON_CHARITABLE_WAQF',
    );
  });

  /**
   * ⚠ **INVERTED (R7) — and this narrowing is the one that would have silently killed R7-a on the
   * PRIMARY deed shape.** `LINEAGE_ORDER_ON_CHARITABLE_WAQF` fired on
   * `LINEAGE_CONTINUATION && (waqfType === 'PUBLIC_CHARITABLE' || jihaCount > 0)`, so a ذري deed under
   * `LINEAGE_CONTINUATION` — the *normal* order (ADR-0009 R4) — with an ultimate-taker jiha would have
   * refused, and every real family endowment with a recorded مآل would have been uncomputable.
   *
   * The jiha arm now reads `unnamedJihaIds.length > 0`. The reasoning is not convenience: the lineage
   * order resolves entitlement BY DESCENT, and a recorded ultimate taker is not inside that descent —
   * its entitlement comes from the reversion clause, evaluated after and outside the frontier test — so
   * the record no longer contradicts itself.
   *
   * ⚠ **MEASURED PRECEDENCE, and it is worth stating because it makes the narrowing look redundant
   * when it is not.** The jiha half of this refusal is **shadowed on every reachable input**:
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` tests the same `unnamedJihaIds.length > 0` predicate one step
   * earlier and wins on `FAMILY_DHURRI`, while `PUBLIC_CHARITABLE` takes this refusal's *other* arm and
   * `JOINT` is refused first of all. (That shadowing predates R7 — `lineage-adversarial.test.ts` §9
   * already pins it.) The narrowing therefore matters **only for the inputs it lets THROUGH**: without
   * it, a ذري deed under `LINEAGE_CONTINUATION` — the *normal* order — with a properly recorded مآل
   * would have refused here after clearing every earlier check, and R7-a would have been unimplementable
   * on the primary deed shape. Both halves are asserted below so neither can quietly change.
   */
  it('R7 · a lineage order over an ULTIMATE-TAKER jiha is legal; over an unnamed one it still refuses', () => {
    const jiha = ben({
      id: 'jiha-001',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      lineageLink: null,
    });
    const lineageCohort = [jiha, ben({ id: 'ben-001', tabaqa: 1, lineageLink: 'SON' })];

    // Named ⇒ legal. THIS is R7-a's primary shape and the case that had to stop refusing.
    expect(() =>
      assertSingleWaqfNature(
        makeInput({
          waqfType: 'FAMILY_DHURRI',
          entitlementOrder: 'LINEAGE_CONTINUATION',
          continuationStipulation: 'ZUHUR_ONLY',
          beneficiaries: lineageCohort,
          reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] },
        }),
      ),
    ).not.toThrow();

    // Unnamed ⇒ still refused, and MEASURED to be refused by the earlier, wider rule rather than by
    // this one. Asserting `LINEAGE_ORDER_ON_CHARITABLE_WAQF` here would be asserting that the wider
    // rule does not exist — the mistake `lineage-adversarial.test.ts` §9 records having made once.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            beneficiaries: [jiha],
            reversion: null,
          }),
        ),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
    // …and one unnamed jiha beside a named one: same rule, and it NAMES the offender rather than
    // reporting that "a charity is present", which an operator cannot act on.
    const unnamed = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            beneficiaries: [
              jiha,
              ben({
                id: 'jiha-002',
                kind: 'CHARITABLE_JIHA',
                tabaqa: null,
                line: 'NA',
                lineageLink: null,
              }),
            ],
            reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] },
          }),
        ),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
    expect(unnamed.details).toMatchObject({ unnamedJihaIds: ['jiha-002'] });

    // The `PUBLIC_CHARITABLE` arm, unnarrowed and absolute — the one arm of this refusal that is still
    // reachable. It fires with NO jiha in the cohort at all, which is what makes it about the TYPE.
    const onCharitable = expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            beneficiaries: [
              ben({ id: 'ben-cat', kind: 'CATEGORY_ONLY', tabaqa: null, lineageLink: null }),
            ],
            reversion: null,
          }),
        ),
      'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
    );
    expect(onCharitable.details).toMatchObject({
      field: 'entitlementOrder',
      charitableJihaCount: 0,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · assertReversionLegible — the مآل clause is narrowed BEFORE any exemption depends on it
 *
 * Why this block exists as its own unit rather than only end to end: three of
 * `assertSingleWaqfNature`'s refusals grant an exemption on the strength of this clause, and **an
 * exemption granted on an unreadable clause is how a refusal becomes a payout.** The ORDER of these
 * six checks is therefore itself behaviour, and it is asserted, not assumed.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R7 · assertReversionLegible', () => {
  /** The reversion cases all use ذري + a real two-node bloodline, so only the clause varies. */
  function reversionInput(
    reversion: DistributionInputRaw['reversion'],
    extra: readonly RawBeneficiary[] = [],
  ): DistributionInput {
    return makeInput({
      waqfType: 'FAMILY_DHURRI',
      entitlementOrder: 'ORDERED',
      reversion,
      beneficiaries: [
        ben({ id: 'ben-001', tabaqa: 1, lineageLink: 'SON' }),
        ben({
          id: 'jiha-001',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          lineageLink: null,
        }),
        ...extra,
      ],
    });
  }

  it('returns an EMPTY set for a deed with no clause — "absent" is a value, not a maybe (R7-c)', () => {
    // The empty set is what lets every caller write `takerIds.has(id)` without re-testing the clause,
    // and it is why "no clause" and "a clause naming nobody" cannot be confused: the second throws.
    expect(assertReversionLegible(makeInput({ reversion: null }))).toEqual(new Set());
  });

  it('returns the named ids for a legible clause, deduplicated by construction', () => {
    const takers = assertReversionLegible(
      reversionInput({ kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] }),
    );
    expect([...takers]).toEqual(['jiha-001']);
  });

  it('refuses an unrecognised `kind` BY NAME rather than coercing it into the one reading', () => {
    // A deed may revert to the poor of a city, to another waqf, to the Authority, or to the waqif's
    // nearest relatives. Every one of those is a real مآل this engine does not implement, and treating
    // any of them as the charitable reading would be the engine deciding a fiqh question (binding
    // rule 1). The recorded value is ECHOED, so an operator can see exactly what was transcribed.
    for (const bad of [
      'REVERT_TO_THE_POOR_OF_THE_CITY',
      'NEAREST_RELATIVES_OF_THE_WAQIF',
      'charitable_ultimate_taker',
      '  CHARITABLE_ULTIMATE_TAKER  ',
    ]) {
      const error = expectRefusal(
        () => assertReversionLegible(reversionInput({ kind: bad, ultimateTakerIds: ['jiha-001'] })),
        'REVERSION_KIND_UNRECOGNISED',
      );
      expect(error.details).toMatchObject({
        field: 'reversion.kind',
        received: bad,
        recognised: ['CHARITABLE_ULTIMATE_TAKER'],
      });
    }
  });

  it('refuses a clause naming NOBODY — SHART_INCOMPLETE, not a zod shape error', () => {
    // The schema deliberately allows an empty array so this halt carries `SHART_INCOMPLETE` and its
    // discriminator: "the deed names a reversion but nobody to take it" is a statement about the DEED,
    // and reporting it as `DISTRIBUTION_INPUT_INVALID` would tell an operator their JSON is malformed.
    expectRefusal(
      () =>
        assertReversionLegible(
          reversionInput({ kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [] }),
        ),
      'REVERSION_WITH_NO_ULTIMATE_TAKER',
    );
  });

  it('refuses a DUPLICATED id — never deduplicates, because deduplicating changes an amount', () => {
    // A repeated id would appear twice in the reversion's weight vector and take twice its recorded
    // share. This engine does not repair a record whose repair moves money.
    const error = expectRefusal(
      () =>
        assertReversionLegible(
          reversionInput({
            kind: 'CHARITABLE_ULTIMATE_TAKER',
            ultimateTakerIds: ['jiha-001', 'jiha-001'],
          }),
        ),
      'REVERSION_ULTIMATE_TAKER_DUPLICATED',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'jiha-001' });
  });

  it('refuses an UNKNOWN id — the endowment`s destination resolves to nobody', () => {
    const error = expectRefusal(
      () =>
        assertReversionLegible(
          reversionInput({ kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-404'] }),
        ),
      'REVERSION_ULTIMATE_TAKER_UNKNOWN',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'jiha-404' });
  });

  /**
   * ⚠ The check that stops a **NEW** escape rather than a variant of an old one.
   *
   * A descendant named as the ultimate taker would have their verdict taken from the reversion ladder
   * instead of from their own line — entitled whenever the clause triggered, **outside the frontier
   * test altogether**, with `stipulatedWeight` applied instead of per capita. Neither
   * `BUTUN_LINE_NOT_CONTINUED` nor `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` could ever reach them.
   */
  it('refuses a DESCENDANT named as the ultimate taker — a bloodline member is not a destination', () => {
    for (const [id, kind] of [
      ['ben-001', 'FAMILY'],
      ['ben-cat', 'CATEGORY_ONLY'],
    ] as const) {
      const error = expectRefusal(
        () =>
          assertReversionLegible(
            reversionInput({ kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [id] }, [
              ben({
                id: 'ben-cat',
                kind: 'CATEGORY_ONLY',
                tabaqa: 1,
                lineageLink: 'SON',
                category: 'a grandchild not yet named',
              }),
            ]),
          ),
        'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
      );
      expect(error.details).toMatchObject({ beneficiaryId: id, kind });
    }
  });

  /**
   * ⚠ **The check ORDER is behaviour, and each pairing below is chosen so exactly one precedence
   * question is answered.** A refusal that reports the wrong one of two simultaneous defects sends an
   * operator to fix the wrong field.
   */
  it('reports the precedence that MATTERS when two defects coexist', () => {
    // 1 · duplicate BEFORE unknown, **when the repeated id is a real beneficiary**. A repeat
    //     double-counts in the weight vector, so it would have moved money; a defect that merely fails
    //     to resolve is the less urgent report.
    expectRefusal(
      () =>
        assertReversionLegible(
          reversionInput({
            kind: 'CHARITABLE_ULTIMATE_TAKER',
            ultimateTakerIds: ['jiha-001', 'jiha-001'],
          }),
        ),
      'REVERSION_ULTIMATE_TAKER_DUPLICATED',
    );

    // 2 · the waqf's NATURE before the clause's contents. A خيري waqf has no bloodline to end, so
    //     nothing about the clause's ids matters — and this is also what closes the VACUOUS trigger.
    expectRefusal(
      () =>
        assertReversionLegible(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            beneficiaries: [
              ben({ id: 'jiha-001', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
            ],
            reversion: { kind: 'NOT_A_KIND', ultimateTakerIds: [] },
          }),
        ),
      'REVERSION_ON_CHARITABLE_WAQF',
    );

    // 3 · `kind` before the id list, because an unrecognised مآل means the id list has no known
    //     meaning at all — there is no point telling an operator to fix a list the engine cannot read.
    expectRefusal(
      () => assertReversionLegible(reversionInput({ kind: 'NOT_A_KIND', ultimateTakerIds: [] })),
      'REVERSION_KIND_UNRECOGNISED',
    );

    // 4 · and `JOINT` outranks the whole clause, so a reversion on a JOINT waqf is unreachable through
    //     `assertSingleWaqfNature`. Asserted through the composed function, since that is where the
    //     precedence lives.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'JOINT',
            beneficiaries: [
              ben({ id: 'jiha-001', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
            ],
            reversion: { kind: 'NOT_A_KIND', ultimateTakerIds: ['nobody'] },
          }),
        ),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
  });

  /**
   * ⚠ **ENGINE PROSE DEFECT, PINNED RATHER THAN PAPERED OVER — `resolver.ts`'s check table is FALSE for
   * this one input.** Its doc says: *"Check 4 precedes 5 deliberately: a duplicate that also happens to
   * be unknown must report the fact that would have MOVED MONEY … not the one that would merely have
   * failed to resolve."* The loop does not implement that. It runs the unknown test on the **first**
   * occurrence of an id before the duplicate test can ever see the second, so:
   *
   *   MEASURED, `ultimateTakerIds: ['jiha-404','jiha-404']` ⇒ `REVERSION_ULTIMATE_TAKER_UNKNOWN`.
   *
   * The claimed precedence holds only when the repeated id is a **real** beneficiary (asserted above).
   *
   * This is recorded here rather than adjusted away because a comment claiming a property the code
   * lacks is a defect in this repo's own taxonomy, and because the honest read is that the *behaviour*
   * is fine — "that id is not among this waqf's beneficiaries" is the more actionable message for an id
   * that does not exist at all — while the *prose* is wrong. **No money is at stake either way: both
   * outcomes are Stage-0 refusals of the same run.** The fix is one comment in `resolver.ts`, which is
   * not this suite's to make; the test drives the real behaviour so the deviation cannot be forgotten.
   */
  it('⚠ reports UNKNOWN, not DUPLICATED, for a repeated id that does not exist (prose defect)', () => {
    expectRefusal(
      () =>
        assertReversionLegible(
          reversionInput({
            kind: 'CHARITABLE_ULTIMATE_TAKER',
            ultimateTakerIds: ['jiha-404', 'jiha-404'],
          }),
        ),
      'REVERSION_ULTIMATE_TAKER_UNKNOWN',
    );
  });

  it('runs BEFORE every cohort refusal — no exemption is granted on an unreadable clause', () => {
    // The load-bearing ordering claim of the whole design. This cohort trips
    // `COHORT_MIXES_CHARITABLE_AND_FAMILY`; its clause would have exempted it, and the clause is
    // illegible. If the cohort check ran first the run would be refused for the *wrong* reason, and —
    // worse — a later relaxation of that ordering would let the exemption through on a clause nobody
    // validated. The reversion refusal must win.
    expectRefusal(
      () =>
        assertSingleWaqfNature(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            entitlementOrder: 'SHARED',
            beneficiaries: [
              ben({
                id: 'jiha-001',
                kind: 'CHARITABLE_JIHA',
                tabaqa: null,
                line: 'NA',
                lineageLink: null,
              }),
              ben({ id: 'ben-001', tabaqa: 1, lineageLink: 'SON' }),
            ],
            // Names the jiha — so the cohort WOULD be exempt — but the kind is unreadable.
            reversion: { kind: 'A KIND NOBODY RECORDED', ultimateTakerIds: ['jiha-001'] },
          }),
        ),
      'REVERSION_KIND_UNRECOGNISED',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * JOINT reaches Stage 2 as a refusal, not as a mode
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — JOINT is refused (every S3 case in this block is inverted)', () => {
  /** Worked example D's shape: a 40% jiha plus two family branches, declared order SHARED. */
  function exampleDShape(): DistributionInputRaw {
    return {
      ...baseRaw(),
      waqfType: 'JOINT',
      classification: 'LARGE',
      entitlementOrder: 'SHARED',
      beneficiaries: [
        ben({
          id: 'ben-006',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          branch: 'Charitable',
          stipulatedWeight: '40',
          disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: '2027-06-30' },
        }),
        ben({
          id: 'ben-007',
          tabaqa: 1,
          line: 'ZUHUR',
          branch: 'Branch A',
          stipulatedWeight: '30',
        }),
        ben({
          id: 'ben-008',
          tabaqa: 1,
          line: 'BUTUN',
          branch: 'Branch B',
          stipulatedWeight: '30',
          residency: 'CROSS_BORDER',
        }),
      ],
    };
  }

  it('refuses §08 worked example D outright — it used to entitle the jiha and both family legs', () => {
    // S3: "entitles the jiha and both family legs on their fixed deed shares", 40/30/30.
    expectRefusal(
      () => resolveEntitlement(parseDistributionInput(exampleDShape())),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
  });

  it('refuses it under a declared ORDERED order too — no tier test runs inside a family sub-tree', () => {
    // S3: "applies the declared ORDERED tier test inside the family sub-tree, never to the jiha".
    // §08's two-level normalisation was never implemented (S3-D2) and now never needs to be.
    expectRefusal(
      () =>
        resolveEntitlement(
          parseDistributionInput({ ...exampleDShape(), entitlementOrder: 'ORDERED' }),
        ),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
  });

  it('refuses a one-legged joint waqf for the NEW reason (AT-08b, re-pointed)', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            waqfType: 'JOINT',
            entitlementOrder: 'SHARED',
            beneficiaries: [ben({ id: 'ben-007' })],
          }),
        ),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
  });

  it('refuses a DIRECT-USE joint waqf — I7 no longer outranks the joint refusal', () => {
    // S3: "short-circuits BEFORE the joint-legs check, so a direct-use waqf is not refused for a
    // leg". That reasoning does not survive R5: a JOINT waqf is not a waqf with an incomplete record,
    // it is NOT A WAQF. I7's substance is unchanged — see the next block for the surviving half.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            waqfType: 'JOINT',
            entitlementOrder: 'NA_DIRECT_USE',
            classification: 'SMALL',
            beneficiaries: [ben({ id: 'ben-007' })],
          }),
        ),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
  });

  it('refuses a mixed cohort declared FAMILY_DHURRI through resolveEntitlement, not only the assert', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          parseDistributionInput({ ...exampleDShape(), waqfType: 'FAMILY_DHURRI' }),
        ),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
  });

  it('emits NO trace, no partial cohort and no rule label when it refuses', () => {
    // A refusal means no run at all. If a caller could catch the throw and still read a partially
    // resolved cohort, "the engine halts" would be a comment rather than a behaviour.
    let resolution: EntitlementResolution | undefined;
    try {
      resolution = resolveEntitlement(parseDistributionInput(exampleDShape()));
    } catch {
      resolution = undefined;
    }
    expect(resolution).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ORDERED — al-aʿlā fa-l-aʿlā (R4: the explicitly stipulated EXCEPTION, unchanged in substance)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — ORDERED', () => {
  /** Worked example A's tier shape: ṭabaqa 1 = {ben-001, ben-003}, ṭabaqa 2 = {ben-002}. */
  function exampleA(): DistributionInput {
    return makeInput({
      entitlementOrder: 'ORDERED',
      beneficiaries: [
        ben({
          id: 'ben-001',
          tabaqa: 1,
          line: 'ZUHUR',
          branch: 'Branch A',
          stipulatedWeight: '12.5',
        }),
        ben({
          id: 'ben-002',
          tabaqa: 2,
          // R6: ṭabaqa 2 must be REACHED through a recorded edge — ben-002 is ben-001's son. The
          // ORDERED verdicts are unchanged by it; the tier test still keys on `tabaqa`.
          parentId: 'ben-001',
          line: 'ZUHUR',
          branch: 'Branch A',
          stipulatedWeight: '12.5',
        }),
        ben({
          id: 'ben-003',
          tabaqa: 1,
          line: 'BUTUN',
          branch: 'Branch B',
          stipulatedWeight: '12.5',
        }),
      ],
    });
  }

  it('entitles the lowest-numbered living ṭabaqa and makes the upper tier wait', () => {
    const resolution = resolveEntitlement(exampleA());

    expect(resolution.order).toBe('ORDERED');
    expect(resolution.rule).toBe('ORDERED_LOWEST_LIVING_TABAQA');
    expect(resolution.entitledTabaqa).toBe(1);
    expect(resolution.entitledIds).toStrictEqual(['ben-001', 'ben-003']);
    expect(resolution.excludedCount).toBe(1);
    expect(verdict(resolution, 'ben-002').exclusionReason).toBe('UPPER_TABAQA_EXTANT');
  });

  it("removes the excluded member's weight from the denominator, and keeps the deed's own figure", () => {
    // THE 37.5% BUG. waqf-001's three deed weights are 12.5 each. If ben-002 stayed in the divisor
    // the two entitled members would get 33.33% instead of 50%, and the waqf would under-distribute
    // by a quarter. The effective vector is what `./allocate.ts` splits on.
    const resolution = resolveEntitlement(exampleA());

    expect(resolution.resolved.map((entry) => entry.stipulatedWeight)).toStrictEqual([
      '12.5',
      '0',
      '12.5',
    ]);
    // The deed said 12.5 and the record still says so — exclusion is not a rewrite of the deed.
    expect(verdict(resolution, 'ben-002').source.stipulatedWeight).toBe('12.5');
    expect(verdict(resolution, 'ben-002').entitled).toBe(false);
  });

  it('APPLIES the deed weights — this is what makes ORDERED different from per capita (R3/R4)', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, stipulatedWeight: '60' }),
          ben({ id: 'ben-002', tabaqa: 1, stipulatedWeight: '20' }),
        ],
      }),
    );
    expect(resolution.resolved.map((entry) => entry.stipulatedWeight)).toStrictEqual(['60', '20']);
    expect(resolution.flags).toStrictEqual([]);
  });

  it('promotes the next ṭabaqa when the whole upper tier is extinct (AT-03)', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, active: false }),
          ben({ id: 'ben-003', tabaqa: 1, active: false }),
          ben({
            id: 'ben-002',
            tabaqa: 2,
            parentId: 'ben-001',
            active: true,
            stipulatedWeight: '7',
          }),
        ],
      }),
    );

    expect(resolution.entitledTabaqa).toBe(2);
    expect(resolution.entitledIds).toStrictEqual(['ben-002']);
    // TABAQA_EXTINCT, not BENEFICIARY_INACTIVE: the operative fact is that the generation ended.
    expect(verdict(resolution, 'ben-001').exclusionReason).toBe('TABAQA_EXTINCT');
    expect(verdict(resolution, 'ben-003').exclusionReason).toBe('TABAQA_EXTINCT');
  });

  it('distinguishes all three tier reason codes on one input (AT-15)', () => {
    const input = makeInput({
      entitlementOrder: 'ORDERED',
      beneficiaries: [
        ben({ id: 'ben-A', tabaqa: 1, active: true }),
        ben({ id: 'ben-B', tabaqa: 1, active: false }),
        ben({ id: 'ben-C', tabaqa: 2, parentId: 'ben-A', active: true }),
      ],
    });

    expect(verdictSummary(resolveEntitlement(input))).toStrictEqual([
      ['ben-A', 'ENTITLED'],
      // NOT UPPER_TABAQA_EXTANT (there is no upper tier) and NOT TABAQA_EXTINCT (ben-A lives).
      ['ben-B', 'BENEFICIARY_INACTIVE'],
      ['ben-C', 'UPPER_TABAQA_EXTANT'],
    ]);
  });

  it('excludes an INACTIVE upper-tier member as UPPER_TABAQA_EXTANT, keeping I5 assertable', () => {
    // I5 asserts UPPER_TABAQA_EXTANT for EVERY member of a higher-numbered tier. Reporting
    // BENEFICIARY_INACTIVE here instead would make `invariants.assertOrderedExclusion` fire on
    // perfectly legal data — and the deed's reason really is "an upper tier still lives".
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-A', tabaqa: 1, active: true }),
          ben({ id: 'ben-D', tabaqa: 2, parentId: 'ben-A', active: false }),
        ],
      }),
    );
    expect(verdict(resolution, 'ben-D').exclusionReason).toBe('UPPER_TABAQA_EXTANT');
  });

  it('handles three tiers: below the entitled tier is extinct, above it waits', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-t1', tabaqa: 1, active: false }),
          ben({ id: 'ben-t2', tabaqa: 2, parentId: 'ben-t1', active: true }),
          ben({ id: 'ben-t3', tabaqa: 3, parentId: 'ben-t2', active: true }),
        ],
      }),
    );

    expect(resolution.entitledTabaqa).toBe(2);
    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-t1', 'TABAQA_EXTINCT'],
      ['ben-t2', 'ENTITLED'],
      ['ben-t3', 'UPPER_TABAQA_EXTANT'],
    ]);
  });

  /**
   * ⚠⚠ **RE-POINTED TWICE, THEN PARTLY INVERTED BACK — AND THE INVERSION IS THE FINDING NOW.**
   *
   * S3 drove this from a `FAMILY_DHURRI` waqf holding a jiha (a refused MIXED COHORT since R5), and
   * it was then re-pointed onto a `PUBLIC_CHARITABLE` waqf with two tiered `CATEGORY_ONLY`
   * placeholders beside an untiered jiha — which ESC-1 also refused.
   *
   * ── MEASURED AT THAT POINT, and this is the claim that has now fallen ────────────────────────
   * *"Enumerated over the three `WAQF_TYPES`, there is no legal cohort left in which an untiered
   * member stands beside a tiered one… So `orderedExclusionReason`'s untiered exemption —
   * `isTiered()` returning false — is now unreachable from any valid input."* Route 3 below asserted
   * `LINEAGE_LINK_MISSING` on the edgeless خيري cohort, and that was the last route closed.
   *
   * ── ✓ THAT IS NO LONGER TRUE, AND THE EXEMPTION IS REACHABLE AGAIN ───────────────────────────
   * `buildLineage` pass 4 now requires the lineage edge from a `CATEGORY_ONLY` member **only on a
   * `FAMILY_DHURRI` waqf** (R6-F1's correction). So exactly one legal cohort of this shape is back:
   *
   *     a وقف خيري whose cohort is an untiered `CHARITABLE_JIHA` beside an EDGE-FREE `CATEGORY_ONLY`
   *     placeholder that declares a ṭabaqa.
   *
   * The placeholder is tiered (its `tabaqa` is non-null, which is all `isTiered` reads) and the jiha
   * is not, so `orderedExclusionReason`'s untiered exemption is exercised on a real input again —
   * which restores AT-15's original subject end to end: *a charitable jiha must not lose its deed
   * share to the tier contest*, proven by it not losing it rather than by the cohort being refused.
   * Route 3 is inverted onto that computation; routes 1, 2 and 4 are unchanged, inputs verbatim.
   *
   * ⚠ **SURFACED, NOT DECIDED (binding rule 4).** The placeholder's ṭabaqa here is a **declared**
   * number with no lineage edge behind it, so nothing cross-checks it — `buildLineage`'s depth
   * cross-check skips members outside the graph, and `resolver.ts` already carries a `TODO(surface)`
   * recording that a `CATEGORY_ONLY` placeholder carrying a ṭabaqa is *permitted and undecided*. On a
   * charitable waqf that number now decides a tier contest. Whether a segment placeholder should be
   * able to declare a generation at all on a خيري deed is a product question, and this test is where
   * it becomes visible.
   *
   * What survives unchanged, and is asserted first: an untiered jiha on the legal خيري shape keeps its
   * whole deed weight and carries no exclusion reason.
   */
  it('never tier-excludes an untiered member — a charitable jiha keeps its deed share (AT-15)', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        waqfType: 'PUBLIC_CHARITABLE',
        beneficiaries: [
          ben({
            id: 'ben-jiha',
            kind: 'CHARITABLE_JIHA',
            tabaqa: null,
            line: 'NA',
            branch: 'Charitable',
            stipulatedWeight: '40',
          }),
          ben({
            id: 'ben-jiha2',
            kind: 'CHARITABLE_JIHA',
            tabaqa: null,
            line: 'NA',
            branch: 'Charitable',
            stipulatedWeight: '60',
          }),
        ],
      }),
    );
    // No member is tiered, so there is no entitled ṭabaqa — and no untiered member is excluded for it.
    expect(resolution.entitledTabaqa).toBeNull();
    expect(resolution.entitledIds).toStrictEqual(['ben-jiha', 'ben-jiha2']);
    expect(verdict(resolution, 'ben-jiha').exclusionReason).toBeNull();
    // The deed's own figure, unchanged — ORDERED applies weights (R3 exempts only a lineage cohort).
    expect(verdict(resolution, 'ben-jiha').stipulatedWeight).toBe('40');
  });

  it('an untiered member beside a tiered one · ONE legal cohort survives, every other route refuses', () => {
    const untieredJiha = ben({
      id: 'ben-jiha',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      stipulatedWeight: '40',
    });

    // Route 1 · put the tiered descendant on a ذري waqf ⇒ the jiha may not be there. Which refusal
    // fires depends on the descendant's `kind`, and BOTH are asserted because they are different
    // rules: `COHORT_MIXES_CHARITABLE_AND_FAMILY` needs a `FAMILY` member present, and R6-D1 exists
    // precisely because recording the descendants as `CATEGORY_ONLY` placeholders evaded it.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [untieredJiha, ben({ id: 'ben-t1', tabaqa: 1 })],
          }),
        ),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [
              untieredJiha,
              ben({ id: 'ben-t1', kind: 'CATEGORY_ONLY', tabaqa: 1, category: 'orphans' }),
            ],
          }),
        ),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );

    // Route 2 · put them on a خيري waqf with the edge R6 demands ⇒ the descendant may not be there.
    // ⚠ INVERTED (2026-08-03). Input verbatim — the builder gives `ben-cat` `lineageLink: 'SON'` AND
    // `tabaqa: 1`, so the record trips both خيري rules. MEASURED BEFORE:
    // `DESCENDANT_ON_CHARITABLE_WAQF`. MEASURED AFTER: `TABAQA_ON_CHARITABLE_WAQF`, which runs first.
    // ESC-1's own discriminator is still driven, on the descent-without-a-tier record, in
    // `assertSingleWaqfNature`'s block above.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            waqfType: 'PUBLIC_CHARITABLE',
            beneficiaries: [
              untieredJiha,
              ben({ id: 'ben-cat', kind: 'CATEGORY_ONLY', tabaqa: 1, category: 'orphans' }),
            ],
          }),
        ),
      'TABAQA_ON_CHARITABLE_WAQF',
    );

    // ⚠⚠ Route 3 · INVERTED A SECOND TIME, and this one is the whole point of the new rule.
    //
    // ── The history, kept because each version was true of a different engine ──────────────────
    // (1) Before R6-F1: `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` — an edgeless placeholder was
    //     refused on every waqf type, which is what made "no legal cohort survives" true.
    // (2) After R6-F1: it COMPUTED. MEASURED on this exact input — `entitledTabaqa: 1`,
    //     verdicts `[['ben-cat','ENTITLED'], ['ben-jiha','ENTITLED']]`, weights `'40'` / `'10'`,
    //     `excludedCount: 0`, `lineageDepth: null`, `basis.lineageLink: null`. The placeholder's
    //     ṭabaqa DECIDED the entitled tier and its line was stamped `ORDERED_LOWEST_LIVING_TABAQA`.
    // (3) ✓ Now REFUSED `TABAQA_ON_CHARITABLE_WAQF` (product owner, 2026-08-03). Outcome (2) was the
    //     defect: a وقف خيري has no generations, so a ṭabaqa deciding money on one is a generational
    //     rule applied to a segment that is not a bloodline.
    //
    // ⚠ AND THE CONSEQUENCE, STATED HERE BECAUSE IT IS A LOSS OF COVERAGE, NOT A WIN: the untiered
    // exemption AT-15/I5 is about — `isTiered()` false for one member while true for another in the
    // SAME cohort — no longer has ANY reachable cohort. A خيري waqf may hold no ṭabaqa at all; on a
    // ذري waqf `buildLineage`'s depth cross-check makes a ṭabaqa MANDATORY on every member. The
    // enumeration that proves it is `jiha-tier-refusal.test.ts` §"REACHABILITY".
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            waqfType: 'PUBLIC_CHARITABLE',
            beneficiaries: [
              untieredJiha,
              ben({
                id: 'ben-cat',
                kind: 'CATEGORY_ONLY',
                tabaqa: 1,
                lineageLink: null,
                category: 'orphans',
              }),
            ],
          }),
        ),
      'TABAQA_ON_CHARITABLE_WAQF',
    );

    // …and the surviving half of (2): drop the ṭabaqa and the same cohort still computes, so R6-F1's
    // correction (an edgeless خيري placeholder is representable) is NOT what was reversed. Only the
    // generational claim was.
    const legal = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        waqfType: 'PUBLIC_CHARITABLE',
        beneficiaries: [
          untieredJiha,
          ben({
            id: 'ben-cat',
            kind: 'CATEGORY_ONLY',
            tabaqa: null,
            lineageLink: null,
            category: 'orphans',
          }),
        ],
      }),
    );
    // Nobody is tiered now, so there is no entitled tier and no tier contest to lose.
    expect(legal.entitledTabaqa).toBeNull();
    expect(verdictSummary(legal)).toStrictEqual([
      ['ben-cat', 'ENTITLED'],
      ['ben-jiha', 'ENTITLED'],
    ]);
    // AT-15's substance where it is still reachable: the jiha keeps its whole deed figure. `ORDERED`
    // applies deed weights (R3 exempts only a lineage cohort), so nothing was rewritten.
    expect(verdict(legal, 'ben-jiha').stipulatedWeight).toBe('40');
    expect(verdict(legal, 'ben-cat').stipulatedWeight).toBe('10');
    expect(legal.excludedCount).toBe(0);
    // The placeholder is NOT in the lineage graph — it records no descent at all, which is the
    // TODO(surface) the header flags.
    expect(verdict(legal, 'ben-cat').lineageDepth).toBeNull();
    expect(verdict(legal, 'ben-cat').basis.lineageLink).toBeNull();

    // …and the boundary: the SAME cohort on a ذري waqf is still refused, because there descent IS
    // the eligibility. Two refusals apply and Stage 0's wins, so the jiha is dropped to reach R6.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [
              ben({
                id: 'ben-cat',
                kind: 'CATEGORY_ONLY',
                tabaqa: 1,
                lineageLink: null,
                category: 'orphans',
              }),
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );

    // Route 4 · make the UNTIERED member a descendant instead ⇒ its own ṭabaqa contradicts its depth.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            waqfType: 'FAMILY_DHURRI',
            beneficiaries: [
              ben({ id: 'ben-t1', tabaqa: 1 }),
              ben({ id: 'ben-untiered', tabaqa: null }),
            ],
          }),
        ),
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );
  });

  /**
   * ⚠ **RE-POINTED: the "leaving untiered members entitled" half is gone with its subject.**
   *
   * The cohort was two tiered `CATEGORY_ONLY` placeholders plus an untiered jiha on a خيري waqf,
   * which ESC-1 now refuses (see the enumeration above). `entitledTabaqa === null` when every
   * recorded tier is extinct is still a real and separate claim, and it is asserted here on the ذري
   * shape where tiers actually exist — with the consequence that the run then entitles NOBODY, which
   * is `NO_ELIGIBLE_BENEFICIARIES` territory rather than a windfall for an untiered member.
   */
  it('reports entitledTabaqa null when every tier is extinct — and nobody inherits the pool', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        waqfType: 'FAMILY_DHURRI',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, active: false }),
          ben({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', active: false }),
        ],
      }),
    );

    expect(resolution.entitledTabaqa).toBeNull();
    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-001', 'TABAQA_EXTINCT'],
      ['ben-002', 'TABAQA_EXTINCT'],
    ]);
    expect(resolution.entitledIds).toStrictEqual([]);
  });

  it('resolves an empty cohort without dividing by zero or inventing a member', () => {
    const resolution = resolveEntitlement(
      makeInput({ entitlementOrder: 'ORDERED', beneficiaries: [] }),
    );
    expect(resolution.entitledTabaqa).toBeNull();
    expect(resolution.resolved).toStrictEqual([]);
    expect(resolution.entitledIds).toStrictEqual([]);
    expect(resolution.excludedCount).toBe(0);
  });

  /**
   * ⚠⚠ **THE HONEST NEGATIVE TEST DID ITS JOB — AND THIS IS THE INVERSION IT PREDICTED, VERBATIM.**
   *
   * Its own words: *"When the product owner answers open question 10 in the affirmative, this test
   * inverts to a `LINEAGE_LINK_MISSING` refusal — and it will fail loudly the moment anyone makes
   * that change without recording the decision."* The owner answered **yes** on 2026-08-03 (R6), the
   * test failed loudly, and the decision is recorded here.
   *
   * The original body, for the record: `ben-untiered` was ENTITLED alongside the living ṭabaqa-1
   * member (`entitledIds` = `['ben-t1', 'ben-untiered']`, `exclusionReason` null) and would have
   * taken a full share of an ORDERED deed's ghallah while standing in no ṭabaqa the deed established.
   * That is S3-D1, and it is now refused — as the ADR's rationale claimed, though not for the reason
   * it gave: the rationale said `buildLineage` running on every order was enough, and it was not
   * until pass 4 stopped being gated on `LINEAGE_CONTINUATION`.
   *
   * The input is kept EXACTLY as written. Only the assertion changed.
   */
  it('INVERTED: an untiered FAMILY member no longer escapes the tier test — S3-D1 IS closed', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            beneficiaries: [
              ben({ id: 'ben-t1', tabaqa: 1, active: true, stipulatedWeight: '10' }),
              ben({
                id: 'ben-t2',
                tabaqa: 2,
                parentId: 'ben-t1',
                active: true,
                stipulatedWeight: '10',
              }),
              ben({
                id: 'ben-untiered',
                tabaqa: null,
                active: true,
                stipulatedWeight: '10',
                // As S3 wrote it: no descent recorded at all. THIS is the field R6 made mandatory.
                lineageLink: null,
              }),
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Zero deed shares (ORDERED / SHARED only — a lineage cohort applies no weights at all)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — zero stipulated weight', () => {
  it('excludes a zero-weight member so the allocator never sees an all-zero vector (AT-06)', () => {
    // `largestRemainderAllocate` throws INVALID_ALLOCATION_WEIGHTS on an all-zero vector, which
    // would turn §08's explicitly NON-throwing NO_ELIGIBLE_BENEFICIARIES state into an exception.
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        beneficiaries: [
          ben({ id: 'ben-001', stipulatedWeight: '0' }),
          ben({ id: 'ben-002', stipulatedWeight: '0' }),
        ],
      }),
    );

    expect(resolution.entitledIds).toStrictEqual([]);
    expect(resolution.excludedCount).toBe(2);
    for (const entry of resolution.resolved) {
      expect(entry.exclusionReason).toBe('ZERO_STIPULATED_WEIGHT');
    }
  });

  it('reads 0, 0.0 and 00.000 as zero, and an 18-dp dust weight as NON-zero', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        beneficiaries: [
          ben({ id: 'ben-a', stipulatedWeight: '0' }),
          ben({ id: 'ben-b', stipulatedWeight: '0.0' }),
          ben({ id: 'ben-c', stipulatedWeight: '00.000' }),
          ben({ id: 'ben-d', stipulatedWeight: '0.000000000000000001' }),
        ],
      }),
    );

    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-a', 'ZERO_STIPULATED_WEIGHT'],
      ['ben-b', 'ZERO_STIPULATED_WEIGHT'],
      ['ben-c', 'ZERO_STIPULATED_WEIGHT'],
      ['ben-d', 'ENTITLED'],
    ]);
    // A dust weight passes through verbatim — the allocator, not this stage, decides what it earns.
    expect(verdict(resolution, 'ben-d').stipulatedWeight).toBe('0.000000000000000001');
  });

  it('does NOT let a zero weight promote the tier below it (surfaced reading, pinned here)', () => {
    // ⚠ SURFACED, NOT DECIDED (S3's open DEFECT-A3): `active` is the sole recorded vital status, so a
    // living member with a zero deed share still keeps their tier alive and still blocks the tier
    // below. The run then ends with an empty entitled cohort and the distributable RETAINED.
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-t1', tabaqa: 1, active: true, stipulatedWeight: '0' }),
          ben({ id: 'ben-t2', tabaqa: 2, parentId: 'ben-t1', active: true, stipulatedWeight: '5' }),
        ],
      }),
    );

    expect(resolution.entitledTabaqa).toBe(1);
    expect(resolution.entitledIds).toStrictEqual([]);
    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-t1', 'ZERO_STIPULATED_WEIGHT'],
      ['ben-t2', 'UPPER_TABAQA_EXTANT'],
    ]);
  });

  it('reports BENEFICIARY_INACTIVE over ZERO_STIPULATED_WEIGHT when both apply', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        beneficiaries: [ben({ id: 'ben-001', active: false, stipulatedWeight: '0' })],
      }),
    );
    expect(verdict(resolution, 'ben-001').exclusionReason).toBe('BENEFICIARY_INACTIVE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * SHARED — tashrik (deliberately NOT collapsed into lineage)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — SHARED', () => {
  it('lets every living tier share, with no tier excluding another (worked example B)', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        beneficiaries: [
          ben({ id: 'ben-004', tabaqa: 1, line: 'ZUHUR', stipulatedWeight: '25' }),
          ben({
            id: 'ben-005',
            tabaqa: 2,
            parentId: 'ben-004',
            line: 'BUTUN',
            stipulatedWeight: '25',
          }),
        ],
      }),
    );

    expect(resolution.rule).toBe('SHARED_ALL_LIVING_TABAQAT');
    expect(resolution.entitledTabaqa).toBeNull();
    expect(resolution.entitledIds).toStrictEqual(['ben-004', 'ben-005']);
    expect(resolution.excludedCount).toBe(0);
  });

  it('IS the contrast that proves the order is read: the same tiers, the opposite verdict', () => {
    // Same three members, only `entitlementOrder` differs. A resolver that ignored the order would
    // pass one of these two assertions and fail the other.
    const beneficiaries = [
      ben({ id: 'ben-A', tabaqa: 1, active: true }),
      ben({ id: 'ben-B', tabaqa: 1, active: false }),
      ben({ id: 'ben-C', tabaqa: 2, parentId: 'ben-A', active: true }),
    ];

    expect(
      verdictSummary(resolveEntitlement(makeInput({ entitlementOrder: 'ORDERED', beneficiaries }))),
    ).toStrictEqual([
      ['ben-A', 'ENTITLED'],
      ['ben-B', 'BENEFICIARY_INACTIVE'],
      ['ben-C', 'UPPER_TABAQA_EXTANT'],
    ]);

    expect(
      verdictSummary(resolveEntitlement(makeInput({ entitlementOrder: 'SHARED', beneficiaries }))),
    ).toStrictEqual([
      ['ben-A', 'ENTITLED'],
      ['ben-B', 'BENEFICIARY_INACTIVE'],
      // ṭabaqa 2 is ENTITLED here. The block on ben-C under ORDERED was an entitlement EXCLUSION;
      // nothing about tashrik excludes a lower generation.
      ['ben-C', 'ENTITLED'],
    ]);
  });

  it('applies deed weights and NO ẓuhūr/buṭūn filter — the two reasons it is not lineage', () => {
    // If SHARED were collapsed into LINEAGE_CONTINUATION, every tashrik deed would silently become
    // per capita and every buṭūn line would be re-tested against a continuation term it never had.
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        continuationStipulation: null,
        beneficiaries: [
          ben({ id: 'ben-son', line: 'ZUHUR', lineageLink: 'SON', stipulatedWeight: '70' }),
          ben({
            id: 'ben-dau-child',
            line: 'BUTUN',
            tabaqa: 2,
            parentId: 'ben-son',
            lineageLink: 'DAUGHTER',
            stipulatedWeight: '30',
          }),
        ],
      }),
    );
    expect(resolution.rule).toBe('SHARED_ALL_LIVING_TABAQAT');
    expect(resolution.continuation).toBeNull();
    expect(resolution.entitledIds).toStrictEqual(['ben-dau-child', 'ben-son']);
    expect(resolution.resolved.map((entry) => entry.stipulatedWeight)).toStrictEqual(['30', '70']);
    for (const entry of resolution.resolved) {
      expect(entry.exclusionReason).not.toBe('BUTUN_LINE_NOT_CONTINUED');
    }
  });

  it('carries a recorded continuation stipulation WITHOUT applying it, and flags that visibly', () => {
    // A recorded Shart term that this path does not consume must be VISIBLY not-applied. Whether it
    // SHOULD filter ORDERED/SHARED is ADR-0009 open question 3 — if the answer is yes, this flag is
    // marking a defect rather than a design choice, which is exactly why it is not silent.
    for (const order of ['ORDERED', 'SHARED'] as const) {
      const resolution = resolveEntitlement(
        makeInput({
          entitlementOrder: order,
          continuationStipulation: 'ZUHUR_ONLY',
          beneficiaries: [ben({ id: 'ben-001' })],
        }),
      );
      expect(resolution.flags).toStrictEqual(['CONTINUATION_STIPULATION_NOT_APPLIED']);
      expect(resolution.continuation).toBeNull();
      expect(verdict(resolution, 'ben-001').basis.continuationStipulation).toBeNull();
      const flagged = resolution.trace.find(
        (entry) => entry.code === 'CONTINUATION_STIPULATION_NOT_APPLIED',
      );
      expect(flagged?.data?.['recordedStipulation']).toBe('ZUHUR_ONLY');
    }
  });

  it('raises no such flag when nothing was recorded, so the flag stays informative', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        continuationStipulation: null,
        beneficiaries: [ben({ id: 'ben-001' })],
      }),
    );
    expect(resolution.flags).toStrictEqual([]);
    expect(resolution.trace.map((entry) => entry.code)).not.toContain(
      'CONTINUATION_STIPULATION_NOT_APPLIED',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * NA_DIRECT_USE — intifāʿ mubāshir (I7)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — NA_DIRECT_USE', () => {
  it('short-circuits to no cohort at all, even with a live beneficiary set (I7)', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'NA_DIRECT_USE',
        classification: 'SMALL',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, active: true, stipulatedWeight: '50' }),
          ben({
            id: 'ben-002',
            tabaqa: 2,
            parentId: 'ben-001',
            active: true,
            stipulatedWeight: '50',
          }),
        ],
      }),
    );

    expect(resolution.rule).toBe('NA_DIRECT_USE');
    expect(resolution.entitledTabaqa).toBeNull();
    expect(resolution.continuation).toBeNull();
    // No lines at all — not "lines with zero" (I7). Beneficiaries use the asset, not the ghallah.
    expect(resolution.resolved).toStrictEqual([]);
    expect(resolution.entitledIds).toStrictEqual([]);
    expect(resolution.excludedCount).toBe(0);
  });

  /**
   * ⚠ **INVERTED (product-owner decision, 2026-08-03 · `TABAQA_ON_CHARITABLE_WAQF`), and the split it
   * forces is the interesting part.**
   *
   * The INPUT is unchanged: `NA_DIRECT_USE` on a `PUBLIC_CHARITABLE` waqf, an unreadable continuation
   * term, and one `CHARITABLE_JIHA` at `tabaqa: 2`. MEASURED BEFORE the new rule it RESOLVED —
   * `rule: 'NA_DIRECT_USE'`, `resolved: []`, `flags: []` — because the short-circuit ran ahead of both
   * `assertJihaNotTiered` and `parseContinuationStipulation`, and neither fact was read.
   *
   * MEASURED AFTER: `SHART_INCOMPLETE` / `TABAQA_ON_CHARITABLE_WAQF`. That is not a precedence
   * accident, it is the same call the I7 note in `resolveEntitlement` already made for `JOINT`: a
   * ṭabaqa on a وقف خيري is a fact about **the waqf's nature**, and `assertSingleWaqfNature` runs
   * BEFORE the direct-use short-circuit, so a record claiming generations on a waqf that has none is
   * void whether or not the period moves any ghallah.
   *
   * The half that genuinely survives is the continuation parse, and it is kept below on the same input
   * with the ṭabaqa dropped — otherwise the surviving claim would be untested and only asserted.
   *
   * ⚠ **Still true after memo Q7 (2026-08-17), but for a narrower reason than the sentence above
   * implies, so it is said out loud.** `assertJihaNotTiered` and `buildLineage` are both hoisted above
   * the short-circuit now, and the `continuation` expression with them. The continuation term survives
   * unparsed on this route only because `parseContinuationStipulation` is reached under
   * `LINEAGE_CONTINUATION` alone — not because the short-circuit returns before that statement.
   */
  it('still short-circuits BEFORE the continuation parse — but NOT before the waqf-nature rules', () => {
    // ── The INVERTED half. Same input as the S3-era test; the ṭabaqa is now fatal on a خيري waqf,
    //    direct use or not.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'NA_DIRECT_USE',
            classification: 'SMALL',
            waqfType: 'PUBLIC_CHARITABLE',
            continuationStipulation: 'not a recognised term at all',
            beneficiaries: [
              ben({ id: 'ben-jiha', kind: 'CHARITABLE_JIHA', tabaqa: 2, line: 'NA' }),
            ],
          }),
        ),
      'TABAQA_ON_CHARITABLE_WAQF',
    );

    // ── The SURVIVING half, DRIVEN rather than asserted: one field apart, the same run short-circuits
    //    with the unreadable continuation term still unread.
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'NA_DIRECT_USE',
        classification: 'SMALL',
        waqfType: 'PUBLIC_CHARITABLE',
        continuationStipulation: 'not a recognised term at all',
        beneficiaries: [ben({ id: 'ben-jiha', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' })],
      }),
    );
    expect(resolution.rule).toBe('NA_DIRECT_USE');
    expect(resolution.resolved).toStrictEqual([]);
    // No CONTINUATION_STIPULATION_NOT_APPLIED either: Stage 2 never read the field.
    expect(resolution.flags).toStrictEqual([]);
    // And that same unreadable term DOES refuse once the order is one that reads it — proof the
    // short-circuit is what spared it, not an absent check.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'LINEAGE_CONTINUATION',
            waqfType: 'FAMILY_DHURRI',
            continuationStipulation: 'not a recognised term at all',
            beneficiaries: [ben({ id: 'ben-001' })],
          }),
        ),
      'CONTINUATION_STIPULATION_UNRECOGNISED',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Entitlement is orthogonal to payability (half of I6, structurally)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — payability is not entitlement', () => {
  function withoutSource(
    resolution: EntitlementResolution,
  ): readonly Omit<ResolvedBeneficiary, 'source'>[] {
    return resolution.resolved.map(({ source: _source, ...rest }) => rest);
  }

  it('returns a byte-identical verdict when EVERY payability field is made maximally bad', () => {
    // Stage 3's five gates all trip on the second input: category not captured, entity unlicensed
    // AND expired, KYC never verified, KYC undated, cross-border. If any of them changed a verdict
    // here, a compliance BLOCK would have silently become a loss of ENTITLEMENT — and the blocked
    // member's share would be redistributed to their relatives (exactly what I6 forbids).
    const clean = makeInput({
      entitlementOrder: 'ORDERED',
      beneficiaries: [
        ben({ id: 'ben-001', tabaqa: 1, stipulatedWeight: '12.5' }),
        ben({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', stipulatedWeight: '12.5' }),
        ben({ id: 'ben-003', tabaqa: 1, stipulatedWeight: '12.5', line: 'BUTUN' }),
      ],
    });
    const gated = makeInput({
      entitlementOrder: 'ORDERED',
      beneficiaries: [
        ben({
          id: 'ben-001',
          tabaqa: 1,
          stipulatedWeight: '12.5',
          kind: 'CATEGORY_ONLY',
          category: null,
          verificationStatus: 'UNVERIFIED',
          kycLastRefreshed: null,
          residency: 'CROSS_BORDER',
          disbursingEntity: { name: 'Fake Jiha', licensed: false, licenceExpiry: '2020-01-01' },
          bankingRefForProceeds: null,
        }),
        ben({
          id: 'ben-002',
          tabaqa: 2,
          parentId: 'ben-001',
          stipulatedWeight: '12.5',
          verificationStatus: 'PENDING',
          kycLastRefreshed: '2001-01-01',
          residency: 'CROSS_BORDER',
          bankingRefForProceeds: null,
        }),
        ben({
          id: 'ben-003',
          tabaqa: 1,
          stipulatedWeight: '12.5',
          line: 'BUTUN',
          verificationStatus: 'UNVERIFIED',
          kycLastRefreshed: null,
          residency: 'CROSS_BORDER',
        }),
      ],
    });

    const cleanResolution = resolveEntitlement(clean);
    const gatedResolution = resolveEntitlement(gated);

    expect(gatedResolution.entitledIds).toStrictEqual(cleanResolution.entitledIds);
    expect(gatedResolution.entitledTabaqa).toStrictEqual(cleanResolution.entitledTabaqa);
    expect(gatedResolution.excludedCount).toStrictEqual(cleanResolution.excludedCount);
    expect(gatedResolution.trace).toStrictEqual(cleanResolution.trace);
    expect(gatedResolution.flags).toStrictEqual(cleanResolution.flags);
    // `kind` legitimately differs (it is on the basis), so compare everything else field by field.
    expect(withoutSource(gatedResolution).map((entry) => entry.stipulatedWeight)).toStrictEqual(
      withoutSource(cleanResolution).map((entry) => entry.stipulatedWeight),
    );
    expect(withoutSource(gatedResolution).map((entry) => entry.exclusionReason)).toStrictEqual(
      withoutSource(cleanResolution).map((entry) => entry.exclusionReason),
    );
  });

  it('leaves the excluded member owed nothing while the withheld-to-be member keeps a full weight', () => {
    // The two halves of "excluded ≠ withheld" on one input: ben-002 is EXCLUDED (weight out of the
    // denominator) while ben-003 — whose KYC has never been verified — stays fully entitled and will
    // be WITHHELD by Stage 3 with its whole share intact.
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, stipulatedWeight: '12.5' }),
          ben({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', stipulatedWeight: '12.5' }),
          ben({
            id: 'ben-003',
            tabaqa: 1,
            stipulatedWeight: '12.5',
            verificationStatus: 'PENDING',
            kycLastRefreshed: null,
          }),
        ],
      }),
    );

    expect(verdict(resolution, 'ben-002').stipulatedWeight).toBe('0');
    expect(verdict(resolution, 'ben-003').stipulatedWeight).toBe('12.5');
    expect(verdict(resolution, 'ben-003').entitled).toBe(true);
    expect(verdict(resolution, 'ben-003').exclusionReason).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · resolveEntitlement — the reversion PATH: two periods of one deed
 *
 * The feature is a CONTRAST, and the contrast is what is asserted: the same ذري deed, with the same
 * مآل clause, resolves the family per capita while it lives and the charity alone once it does not.
 * A test that only drove the triggered state would not distinguish R7 from "pay whoever is left".
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R7 · resolveEntitlement — مآل الوقف, the same deed in two periods', () => {
  /** The deed's مآل clause, naming one charity. */
  const MAAL_ONE = {
    kind: 'CHARITABLE_ULTIMATE_TAKER',
    ultimateTakerIds: ['jiha-001'],
  };

  function jiha(id: string, weight = '10'): RawBeneficiary {
    return ben({
      id,
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      lineageLink: null,
      branch: 'Charitable',
      stipulatedWeight: weight,
    });
  }

  /**
   * The two-generation bloodline every case below shares: `ben-001` (a son of the waqif, depth 1) and
   * `ben-002` (his son, depth 2). `parentId: null` is the VALUE "the waqif is my parent", never
   * "unknown", so the declared ṭabaqāt and the derived depths agree and `buildLineage` certifies both.
   */
  function bloodline(aliveFlags: readonly [boolean, boolean]): RawBeneficiary[] {
    return [
      ben({ id: 'ben-001', tabaqa: 1, parentId: null, lineageLink: 'SON', active: aliveFlags[0] }),
      ben({
        id: 'ben-002',
        tabaqa: 2,
        parentId: 'ben-001',
        lineageLink: 'SON',
        active: aliveFlags[1],
      }),
    ];
  }

  function lineageInput(
    aliveFlags: readonly [boolean, boolean],
    overrides: Partial<DistributionInputRaw> = {},
  ): DistributionInput {
    return makeInput({
      waqfType: 'FAMILY_DHURRI',
      entitlementOrder: 'LINEAGE_CONTINUATION',
      continuationStipulation: 'ZUHUR_ONLY',
      reversion: MAAL_ONE,
      beneficiaries: [...bloodline(aliveFlags), jiha('jiha-001')],
      ...overrides,
    });
  }

  /**
   * ⚠ **PERIOD ONE — the family lives, and the charity is worth ZERO. This is the measurement that
   * matters most in the whole change.**
   *
   * MEASURED on this exact cohort before amendment D: the charity was **PAID 13,750,000 of 27,500,000
   * halalas**, halving the living ṭabaqa-1 descendant, with no flag raised and invariant I5 still
   * reported as checked (R6-D1 / ESC-1's payload). Amendment D then **refused** the input outright.
   * R7 makes the input LEGAL again and computes the charity's share as **zero** — so the diversion is
   * not merely refused, it is priced at nothing, which is a stronger guarantee than a refusal: it
   * survives every future relaxation of the refusals.
   */
  it('PENDING · the bloodline lives ⇒ the taker is EXCLUDED and the family takes everything', () => {
    const resolution = resolveEntitlement(lineageInput([true, true]));

    expect(verdictSummary(resolution)).toStrictEqual([
      // The living frontier: ben-001 is entitled, ben-002 waits behind his living father.
      ['ben-001', 'ENTITLED'],
      ['ben-002', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'],
      // …and the charity waits behind the whole family. TEMPORARY, like the code above it.
      ['jiha-001', 'REVERSION_PENDING_LIVING_BLOODLINE'],
    ]);
    expect(resolution.entitledIds).toStrictEqual(['ben-001']);

    // ONE head, and the head's weight is per capita — not the deed's '10', and not the charity's.
    expect(verdict(resolution, 'ben-001').stipulatedWeight).toBe('1');
    // An excluded member contributes 0 to the denominator, so a consumer that forgets to filter on
    // `entitled` still splits over the right total.
    expect(verdict(resolution, 'jiha-001').stipulatedWeight).toBe('0');
    // The deed's own figure is PRESERVED on `source` — exclusion is not a rewrite of the deed.
    expect(verdict(resolution, 'jiha-001').source.stipulatedWeight).toBe('10');

    // The taker is not in the family tree, and its line says so rather than inventing a depth.
    expect(verdict(resolution, 'jiha-001').lineageDepth).toBeNull();
    expect(verdict(resolution, 'jiha-001').basis.lineageLink).toBeNull();

    // ⚠ Neither reversion flag: the clause exists but this is an ORDINARY run — a descendant IS
    // entitled — and a flag that fires on every run tells a reader nothing.
    expect(resolution.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(resolution.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
  });

  /**
   * ⚠ **PERIOD TWO — the same deed, the same clause, one field per person changed.** This is the
   * single most consequential state change in a family endowment's life, and the assertion that it is
   * reached by nothing more than the register is what makes the feature checkable.
   */
  it('APPLIED · the recorded bloodline is over ⇒ the taker takes it, on its OWN rule label', () => {
    const resolution = resolveEntitlement(lineageInput([false, false]));

    expect(verdictSummary(resolution)).toStrictEqual([
      // Under the lineage order a dead member is excluded on their own vital status — the frontier
      // rule reads `active` first and never reaches the ancestor walk.
      ['ben-001', 'BENEFICIARY_INACTIVE'],
      ['ben-002', 'BENEFICIARY_INACTIVE'],
      ['jiha-001', 'ENTITLED'],
    ]);
    expect(resolution.entitledIds).toStrictEqual(['jiha-001']);

    // ⚠ R7-e · the taker takes its DEED WEIGHT, never per capita. A charity is not a head of a
    // bloodline, and `PER_CAPITA_WEIGHT` here would be a silent claim that it is one.
    expect(verdict(resolution, 'jiha-001').stipulatedWeight).toBe('10');

    // The BR-505 basis names the rule that actually decided the line. A charity paid a family
    // endowment's whole ghallah on a line stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — an Arabic
    // statement telling a charity that its descent from the waqif continues — is the exact
    // mis-statement ADR-0009 records as a defect.
    expect(verdict(resolution, 'jiha-001').basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    // …while the RUN keeps the order's rule: the deed's standing entitlement order did not change,
    // its reversion clause took effect. So `basis.rule` varies WITHIN one run, for the first time.
    expect(resolution.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
    expect(verdict(resolution, 'ben-001').basis.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');

    expect(resolution.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(resolution.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
  });

  /**
   * ⚠ **The reversal, and the property nothing downstream may break.**
   *
   * `REVERSION_PENDING_LIVING_BLOODLINE` reverses on an event nobody controls, exactly like
   * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`. One death later the identical register makes the identical
   * charity entitled to the whole distributable — so no consumer may cache the pending exclusion, and
   * its Arabic (E10/E12, product-approved) must not read as a permanent disinheritance.
   *
   * ⚠ And it reverses in BOTH directions: a later-recorded birth or a discovered heir turns APPLIED
   * back into PENDING and the charity stops being paid — while the halalas already paid out cannot be
   * recovered. Whether a مآل clause SHOULD be revocable once the family leg is extinguished is an open
   * question nobody has put to the owner; the per-period recomputation is a choice, not a finding.
   */
  it('reverses on the register alone — one death flips PENDING to APPLIED, and a birth flips it back', () => {
    const pending = resolveEntitlement(lineageInput([true, false]));
    expect(verdict(pending, 'jiha-001').exclusionReason).toBe('REVERSION_PENDING_LIVING_BLOODLINE');

    // ben-001 dies. Nothing else about the deed or the clause moves.
    const applied = resolveEntitlement(lineageInput([false, false]));
    expect(verdict(applied, 'jiha-001').entitled).toBe(true);

    // …and a grandchild is enrolled. The charity is excluded again, on the same code as before.
    const reversed = resolveEntitlement(
      lineageInput([false, false], {
        beneficiaries: [
          ...bloodline([false, false]),
          ben({ id: 'ben-003', tabaqa: 3, parentId: 'ben-002', lineageLink: 'SON', active: true }),
          jiha('jiha-001'),
        ],
      }),
    );
    expect(verdict(reversed, 'jiha-001').exclusionReason).toBe(
      'REVERSION_PENDING_LIVING_BLOODLINE',
    );
    // …and the newly-enrolled grandchild is now the living frontier: both his ancestors are deceased,
    // so he is entitled and the pool goes to the family, not to the charity.
    expect(reversed.entitledIds).toStrictEqual(['ben-003']);
  });

  /**
   * ⚠ **INVERTED 2026-08-11 · R7-d ANSWERED BY THE PRODUCT OWNER.**
   *
   * Under `ZUHUR_ONLY` a living descendant can sit on a broken daughter line: the ẓuhūr line is over
   * while the family is not. Asked whether *"the bloodline is over"* meant **no living descendant** or
   * **no continuing line**, the owner answered the second — so the trigger **FIRES** on this register and
   * the deed's مآل becomes entitled to the whole distributable.
   *
   * MEASURED BEFORE THE ANSWER, on this exact input: `jiha-001` excluded
   * `REVERSION_PENDING_LIVING_BLOODLINE`, `entitledIds` empty, flags carrying
   * `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` and not `REVERSION_TO_ULTIMATE_TAKER_APPLIED`, and a
   * `REVERSION_NOT_TRIGGERED` trace step carrying `openQuestion: 'R7-d — no living descendant vs no
   * continuing line'`. All four are now the opposite, and the trace field is gone because the question
   * is answered.
   *
   * ⚠ The living grandson's own verdict did NOT move, and that is what keeps R5 intact: he stays
   * `BUTUN_LINE_NOT_CONTINUED` — the PERMANENT code — and holds nothing, so no descendant is paid in the
   * same run as the charity.
   */
  it('R7-d · INVERTED · living descendants on a BROKEN line ⇒ the reversion TRIGGERS — was held', () => {
    const resolution = resolveEntitlement(
      makeInput({
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_ONLY',
        reversion: MAAL_ONE,
        beneficiaries: [
          // The waqif's daughter, DECEASED — so her son's ancestor chain is walked THROUGH rather
          // than blocked, and the only thing that excludes him is the deed's ẓuhūr-only stipulation.
          ben({
            id: 'dau-001',
            tabaqa: 1,
            parentId: null,
            lineageLink: 'DAUGHTER',
            line: 'BUTUN',
            active: false,
          }),
          // Her living son. A blood descendant of the waqif — and under ZUHUR_ONLY his line does not
          // continue, so he is excluded PERMANENTLY under this deed.
          ben({
            id: 'dau-002',
            tabaqa: 2,
            parentId: 'dau-001',
            lineageLink: 'SON',
            active: true,
          }),
          jiha('jiha-001'),
        ],
      }),
    );

    expect(verdictSummary(resolution)).toStrictEqual([
      ['dau-001', 'BENEFICIARY_INACTIVE'],
      // ⚠ UNCHANGED BY THE INVERSION, and load-bearing. The precedence — OWNER-RATIFIED 2026-08-25
      // (memo, fourth batch, "Register #12"; it was engineering's `TODO(surface)` until then):
      // blocked by BOTH a deceased-ancestor walk and a buṭūn break, the run reports the break —
      // the permanent reason — rather than telling someone whose line never continues to wait for
      // a relative to die. It is also the reason the charity may be paid beside him without
      // breaching R5: this exclusion is not a hold, and he carries no halala.
      ['dau-002', 'BUTUN_LINE_NOT_CONTINUED'],
      // ⚠ INVERTED · was `REVERSION_PENDING_LIVING_BLOODLINE`. A reverted taker is ENTITLED, so it
      // carries no exclusion reason at all.
      ['jiha-001', 'ENTITLED'],
    ]);
    // ⚠ INVERTED · was `[]`. The charity is now the whole entitled cohort, and the family is out.
    expect(resolution.entitledIds).toStrictEqual(['jiha-001']);

    // ⚠ THE TRIGGER, as the owner defined it: no line this deed continues is still going, even though a
    // blood descendant of the waqif is alive on the register.
    expect(resolution.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(resolution.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(resolution.flags).not.toContain('REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED');

    // …and the trace NAMES the living survivor it decided the bloodline was over despite — "the
    // bloodline is over" printed against a register with living issue must be auditable, not bare.
    const triggered = resolution.trace.find((entry) => entry.code === 'REVERSION_TRIGGERED');
    expect(triggered?.data).toMatchObject({
      livingNonContinuingBloodlineIds: 'dau-002',
      // Was hardcoded `'0'` before the widening made a triggered run able to hold survivors.
      livingBloodlineCount: '1',
      recordedBloodlineCount: '2',
      continuationStipulation: 'ZUHUR_ONLY',
    });
    // The branches must stay tellable apart from the trace alone.
    expect(resolution.trace.some((entry) => entry.code === 'REVERSION_NOT_TRIGGERED')).toBe(false);
    expect(JSON.stringify(resolution.trace)).not.toContain(
      'no living descendant vs no continuing line',
    );
  });

  /**
   * ⚠ **THE CONTROL FOR THE TEST ABOVE — one deed term, the same three records, opposite destinations.**
   *
   * `ZUHUR_AND_BUTUN` continues the daughter's line, so `dau-002` keeps the bloodline going: he is the
   * living frontier (his only proper ancestor is deceased) and takes the pool, while the charity waits on
   * the temporary code. Under `ZUHUR_ONLY` no line continues and the charity takes it.
   *
   * This pair is the sharpest proof the continuation stipulation is actually being READ by the trigger
   * rather than the trigger having quietly collapsed to `active`: if it ever did, the two runs would
   * become identical and the widening would have silently become universal.
   */
  it('R7-d · CONTROL · ZUHUR_AND_BUTUN on the SAME register does NOT trigger — the term is read', () => {
    const register = (continuation: 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN'): DistributionInput =>
      makeInput({
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: continuation,
        reversion: MAAL_ONE,
        beneficiaries: [
          ben({
            id: 'dau-001',
            tabaqa: 1,
            parentId: null,
            lineageLink: 'DAUGHTER',
            line: 'BUTUN',
            active: false,
          }),
          ben({ id: 'dau-002', tabaqa: 2, parentId: 'dau-001', lineageLink: 'SON', active: true }),
          jiha('jiha-001'),
        ],
      });

    const continued = resolveEntitlement(register('ZUHUR_AND_BUTUN'));
    expect(verdictSummary(continued)).toStrictEqual([
      ['dau-001', 'BENEFICIARY_INACTIVE'],
      ['dau-002', 'ENTITLED'],
      ['jiha-001', 'REVERSION_PENDING_LIVING_BLOODLINE'],
    ]);
    expect(continued.entitledIds).toStrictEqual(['dau-002']);
    expect(continued.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // …and the widened term hands the identical register to the charity instead. Nothing but the
    // founder's condition separates the two answers.
    const widened = resolveEntitlement(register('ZUHUR_ONLY'));
    expect(widened.entitledIds).toStrictEqual(['jiha-001']);
    expect(widened.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  /**
   * ⚠ **BOUNDARY 1 · the trigger is NOT the entitled-cohort test, and this is the case that proves it.**
   *
   * `ORDERED`, one LIVING ṭabaqa-1 son of the waqif, deed weight `'0'`. He is excluded
   * `ZERO_STIPULATED_WEIGHT`, so the entitled cohort is EMPTY — and his line continues perfectly well,
   * because a deed weight is not a fact about descent. The reversion must NOT trigger.
   *
   * An implementation that computed *"the bloodline is over"* from the exclusion codes, or from
   * `entitledBloodlineCount`, would agree with the correct one on the inverted case above and pay a
   * charity the whole distributable here — on the strength of a data-entry figure. Boundary 2 (a head
   * behind a living ancestor) and boundary 3 (a gate) are driven in
   * `reversion-adversarial.test.ts` §3b, where the money is asserted end to end.
   */
  it('R7-d · BOUNDARY · a zero-weight living head on a CONTINUING line holds the reversion', () => {
    const resolution = resolveEntitlement(
      makeInput({
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        reversion: MAAL_ONE,
        beneficiaries: [
          ben({
            id: 'ben-001',
            tabaqa: 1,
            parentId: null,
            lineageLink: 'SON',
            active: true,
            stipulatedWeight: '0',
          }),
          jiha('jiha-001'),
        ],
      }),
    );
    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-001', 'ZERO_STIPULATED_WEIGHT'],
      ['jiha-001', 'REVERSION_PENDING_LIVING_BLOODLINE'],
    ]);
    // NOBODY is entitled — and the charity is still held, because a line the deed continues is alive.
    expect(resolution.entitledIds).toStrictEqual([]);
    expect(resolution.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(resolution.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // The trigger counted him from descent + liveness alone, with his exclusion code in plain sight.
    const notTriggered = resolution.trace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED');
    expect(notTriggered?.data).toMatchObject({
      livingBloodlineIds: 'ben-001',
      continuingBloodlineIds: 'ben-001',
      continuingBloodlineCount: '1',
    });
  });

  it('R7-d · the ORDERED path reaches the same two states — the trigger is not lineage-specific', () => {
    // A recorded taker's verdict comes from the reversion clause, so it must behave identically under
    // every money-moving order. Under ORDERED the dead bloodline is excluded `TABAQA_EXTINCT` rather
    // than `BENEFICIARY_INACTIVE`, which is the only difference and is the order's own rule.
    const pending = resolveEntitlement(
      lineageInput([true, true], { entitlementOrder: 'ORDERED', continuationStipulation: null }),
    );
    expect(verdictSummary(pending)).toStrictEqual([
      ['ben-001', 'ENTITLED'],
      ['ben-002', 'UPPER_TABAQA_EXTANT'],
      ['jiha-001', 'REVERSION_PENDING_LIVING_BLOODLINE'],
    ]);
    // ⚠ ORDERED applies DEED weights (R3 exempts only a lineage cohort), so ben-001 keeps its '10'.
    expect(verdict(pending, 'ben-001').stipulatedWeight).toBe('10');

    const applied = resolveEntitlement(
      lineageInput([false, false], { entitlementOrder: 'ORDERED', continuationStipulation: null }),
    );
    expect(verdictSummary(applied)).toStrictEqual([
      ['ben-001', 'TABAQA_EXTINCT'],
      ['ben-002', 'TABAQA_EXTINCT'],
      ['jiha-001', 'ENTITLED'],
    ]);
    expect(applied.entitledTabaqa).toBeNull();
    expect(applied.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(verdict(applied, 'jiha-001').basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
  });

  it('R7-d · and SHARED, so all three money-moving orders are driven, not two', () => {
    const applied = resolveEntitlement(
      lineageInput([false, false], { entitlementOrder: 'SHARED', continuationStipulation: null }),
    );
    expect(verdictSummary(applied)).toStrictEqual([
      ['ben-001', 'BENEFICIARY_INACTIVE'],
      ['ben-002', 'BENEFICIARY_INACTIVE'],
      ['jiha-001', 'ENTITLED'],
    ]);
    expect(applied.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  /**
   * ⚠ **∅ is "not yet enrolled", not "extinct".** The engine cannot certify the extinction of a family
   * it has never been shown, and will not pay a charity because the data entry is incomplete. This also
   * keeps the pre-R7 measured payload closed by a SECOND independent means: a jiha-alone cohort under
   * `LINEAGE_CONTINUATION` — which once took 100% of the ghallah on a line stamped
   * `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — now refuses here even with a perfectly legible مآل clause.
   *
   * ⚠ The operational cost is real and is engineering's call, not the owner's: an old endowment taken
   * on after its family died out must have its DECEASED descendants enrolled before it can be computed
   * at all. `TODO(surface)`.
   */
  it('refuses a clause over an EMPTY family register — the bloodline must be on record to be over', () => {
    const error = expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            reversion: MAAL_ONE,
            beneficiaries: [jiha('jiha-001')],
          }),
        ),
      'REVERSION_WITH_NO_RECORDED_BLOODLINE',
    );
    expect(error.details).toMatchObject({ recordedBloodlineCount: 0 });
  });

  /**
   * ⚠ **Measured over the CERTIFIED graph, never over a `kind` filter** — keying an eligibility fact on
   * `kind` is the unrepaired proxy behind the whole escape class, and a bloodline the engine could not
   * certify must not be able to declare itself over.
   */
  it('measures extinction over the certified graph — an uncertifiable member refuses first', () => {
    // A `FAMILY` member with no lineage edge cannot be placed in the tree at all (R6), so this cohort
    // never reaches the extinction test: `buildLineage` refuses it. If the trigger had counted `kind`
    // instead, this input would have declared the bloodline "over" on an unplaceable member's absence.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            waqfType: 'FAMILY_DHURRI',
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY',
            reversion: MAAL_ONE,
            beneficiaries: [
              ben({
                id: 'ben-001',
                tabaqa: null,
                parentId: null,
                lineageLink: null,
                active: false,
              }),
              jiha('jiha-001'),
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );
  });

  /**
   * ⚠ **R7-e · refused rather than split equally, and refused rather than retained.**
   *
   * Falling through to `NO_ELIGIBLE_BENEFICIARIES` would hide an unusable deed record behind an
   * ordinary flag and retain the pool as though the deed were fine; inventing an equal split would
   * override figures the waqif may have weighted deliberately. Both are refusals of the engine's
   * standing rule that it does not choose a reading of the Shart.
   */
  it('refuses an ALL-zero taker weight vector on a triggered run — no equal-split fallback', () => {
    const error = expectRefusal(
      () =>
        resolveEntitlement(
          lineageInput([false, false], {
            beneficiaries: [...bloodline([false, false]), jiha('jiha-001', '0')],
          }),
        ),
      'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
    );
    expect(error.details).toMatchObject({ ultimateTakerIds: ['jiha-001'] });
  });

  /**
   * ⚠ **The `ZERO_STIPULATED_WEIGHT` row of `contract.ts`'s per-path code table became TRUE of the
   * lineage path for the first time at R7, and this is the test that makes the documented table honest.**
   * A taker's share IS its deed weight, so a taker recorded at zero is excluded — on `LINEAGE_CONTINUATION`
   * too, where no other member can be excluded for that reason (a zero-weight family member is paid an
   * equal share, ADR-0009 open question 2).
   */
  it('excludes ONE zero-weight taker while the others take — a partial vector is usable', () => {
    const resolution = resolveEntitlement(
      lineageInput([false, false], {
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['jiha-001', 'jiha-002'],
        },
        beneficiaries: [
          ...bloodline([false, false]),
          jiha('jiha-001', '0'),
          jiha('jiha-002', '30'),
        ],
      }),
    );
    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-001', 'BENEFICIARY_INACTIVE'],
      ['ben-002', 'BENEFICIARY_INACTIVE'],
      ['jiha-001', 'ZERO_STIPULATED_WEIGHT'],
      ['jiha-002', 'ENTITLED'],
    ]);
    expect(verdict(resolution, 'jiha-002').stipulatedWeight).toBe('30');
    // …and the excluded taker's own deed figure survives on `source`, unrewritten.
    expect(verdict(resolution, 'jiha-001').source.stipulatedWeight).toBe('0');
  });

  it('excludes an INACTIVE taker even on a triggered run, and does not redistribute its share', () => {
    // Rung 1 of the taker ladder: a dissolved or out-of-scope jiha receives nothing, and its share is
    // RETAINED rather than handed to the other takers — the engine does not reassign a destination the
    // deed chose. The retained figure is Stage 5's to report; here the verdict is the claim.
    const resolution = resolveEntitlement(
      lineageInput([false, false], {
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['jiha-001', 'jiha-002'],
        },
        beneficiaries: [
          ...bloodline([false, false]),
          ben({
            id: 'jiha-001',
            kind: 'CHARITABLE_JIHA',
            tabaqa: null,
            line: 'NA',
            lineageLink: null,
            active: false,
          }),
          jiha('jiha-002', '30'),
        ],
      }),
    );
    expect(verdict(resolution, 'jiha-001').exclusionReason).toBe('BENEFICIARY_INACTIVE');
    expect(verdict(resolution, 'jiha-002').entitled).toBe(true);
  });

  /**
   * ⚠ **The per-capita honesty flag must be computed over the entitled BLOODLINE, takers excluded.**
   * Otherwise a reverted run with 70/30 takers raises `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` — a
   * flag stating that deed weights were NOT applied — on a run where they were the only thing applied.
   */
  it('does NOT flag "weights not applied per capita" on a reverted run with unequal takers', () => {
    const resolution = resolveEntitlement(
      lineageInput([false, false], {
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['jiha-001', 'jiha-002'],
        },
        beneficiaries: [
          ...bloodline([false, false]),
          jiha('jiha-001', '70'),
          jiha('jiha-002', '30'),
        ],
      }),
    );
    expect(resolution.entitledIds).toStrictEqual(['jiha-001', 'jiha-002']);
    expect(verdict(resolution, 'jiha-001').stipulatedWeight).toBe('70');
    expect(verdict(resolution, 'jiha-002').stipulatedWeight).toBe('30');
    expect(resolution.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    // …and no per-line trace step claiming a weight was overridden, either.
    expect(resolution.trace.some((entry) => entry.code === 'STIPULATED_WEIGHT_NOT_APPLIED')).toBe(
      false,
    );
  });

  it('still flags it on a PENDING run whose living family carries unequal weights', () => {
    // The control for the case above: the flag is not switched off by the clause's presence, only by
    // the takers being excluded from the basis it is computed over.
    const resolution = resolveEntitlement(
      lineageInput([true, true], {
        beneficiaries: [
          ben({
            id: 'ben-001',
            tabaqa: 1,
            parentId: null,
            lineageLink: 'SON',
            stipulatedWeight: '70',
          }),
          ben({
            id: 'ben-00b',
            tabaqa: 1,
            parentId: null,
            lineageLink: 'SON',
            stipulatedWeight: '30',
          }),
          jiha('jiha-001'),
        ],
      }),
    );
    expect(resolution.entitledIds).toStrictEqual(['ben-001', 'ben-00b']);
    expect(resolution.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
  });

  /**
   * ⚠ **NA_DIRECT_USE carries the clause and does not apply it, and raises NO flag** —
   * `CONTINUATION_STIPULATION_NOT_APPLIED`'s precedent inverted: that term gets a flag because a run
   * still happens; a direct-use run moves no ghallah at all, so a flag would fire where nothing could
   * have moved. The recorded fact is named on the short-circuit trace step instead of being dropped.
   */
  it('NA_DIRECT_USE · the clause is CARRIED, not applied, and named in the trace rather than dropped', () => {
    const resolution = resolveEntitlement(
      lineageInput([true, true], {
        entitlementOrder: 'NA_DIRECT_USE',
        continuationStipulation: null,
      }),
    );
    expect(resolution.resolved).toStrictEqual([]);
    expect(resolution.flags).toStrictEqual([]);
    const shortCircuit = resolution.trace.find(
      (entry) => entry.code === 'NA_DIRECT_USE_SHORT_CIRCUIT',
    );
    expect(shortCircuit?.data).toMatchObject({
      reversionRecorded: 'true',
      reversionUltimateTakerCount: '1',
    });
    // And no "resolved" step for a clause nothing read — a trace code claiming the clause was resolved
    // on a run that never looked at it would be the same defect class as a false comment.
    expect(resolution.trace.some((entry) => entry.code === 'REVERSION_CLAUSE_RESOLVED')).toBe(
      false,
    );
  });

  it('emits REVERSION_CLAUSE_RESOLVED on every run that HAS a clause, and none that does not', () => {
    for (const [aliveFlags, triggered] of [
      [[true, true], 'false'],
      [[false, false], 'true'],
    ] as const) {
      const step = resolveEntitlement(lineageInput(aliveFlags)).trace.find(
        (entry) => entry.code === 'REVERSION_CLAUSE_RESOLVED',
      );
      expect(step?.data).toMatchObject({
        reversionKind: 'CHARITABLE_ULTIMATE_TAKER',
        ultimateTakerIds: 'jiha-001',
        recordedBloodlineCount: '2',
        triggered,
      });
    }
    // A deed with no clause emits none of the three codes — the trace does not narrate an absence. The
    // jiha is DROPPED from this cohort and must be: a charity beside the family with no مآل clause is
    // refused (`COHORT_MIXES_CHARITABLE_AND_FAMILY`), so keeping it would test the refusal, not silence.
    const none = resolveEntitlement(
      lineageInput([true, true], { reversion: null, beneficiaries: bloodline([true, true]) }),
    );
    for (const code of [
      'REVERSION_CLAUSE_RESOLVED',
      'REVERSION_TRIGGERED',
      'REVERSION_NOT_TRIGGERED',
    ]) {
      expect(none.trace.some((entry) => entry.code === code)).toBe(false);
    }
  });

  it('reports the reversion on ENTITLED_COHORT_RESOLVED, so a summary reader sees it', () => {
    const applied = resolveEntitlement(lineageInput([false, false])).trace.find(
      (entry) => entry.code === 'ENTITLED_COHORT_RESOLVED',
    );
    expect(applied?.data).toMatchObject({
      reversionApplied: 'true',
      // ⚠ ZERO entitled bloodline members even though one line was paid: the count is about the FAMILY,
      // which is what makes the per-capita flag's basis and this figure the same fact.
      entitledBloodlineCount: '0',
      entitledCount: '1',
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Determinism, ordering, purity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — determinism and ordering (I8, I9)', () => {
  it('returns resolved and entitledIds in ascending UTF-16 code-unit order, not locale order', () => {
    // The residual tie-break is DEFINED as ascending beneficiaryId, so this ordering decides who
    // gets the leftover halala. Under a locale collation 'ben-a' would sort before 'ben-B'; under
    // code units it does not. Pinning the code-unit answer keeps a payout host-independent.
    const ids = ['ben-a', 'ben-B', 'ben-2', 'ben-10'];
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'SHARED',
        beneficiaries: ids.map((id) => ben({ id, tabaqa: 1 })),
      }),
    );

    expect(resolution.resolved.map((entry) => entry.beneficiaryId)).toStrictEqual([
      'ben-10',
      'ben-2',
      'ben-B',
      'ben-a',
    ]);
    expect(resolution.entitledIds).toStrictEqual(['ben-10', 'ben-2', 'ben-B', 'ben-a']);
  });

  it('is deterministic: the same input resolves identically every time', () => {
    const input = makeInput({
      entitlementOrder: 'ORDERED',
      beneficiaries: [
        ben({ id: 'ben-003', tabaqa: 2, parentId: 'ben-001' }),
        ben({ id: 'ben-001', tabaqa: 1 }),
        ben({ id: 'ben-002', tabaqa: 1, active: false }),
      ],
    });

    const first = resolveEntitlement(input);
    for (let run = 0; run < 25; run += 1) {
      expect(resolveEntitlement(input)).toStrictEqual(first);
    }
  });

  it('does not mutate the caller’s beneficiary array while sorting', () => {
    const input = makeInput({
      entitlementOrder: 'SHARED',
      beneficiaries: [ben({ id: 'ben-z' }), ben({ id: 'ben-a' })],
    });
    const before = input.beneficiaries.map((beneficiary) => beneficiary.id);

    resolveEntitlement(input);

    expect(input.beneficiaries.map((beneficiary) => beneficiary.id)).toStrictEqual(before);
    expect(before).toStrictEqual(['ben-z', 'ben-a']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The basis and the trace
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — basis and trace', () => {
  it('records a full entitlement basis on every line, excluded ones included (BR-505)', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, line: 'ZUHUR', branch: 'Branch A' }),
          ben({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', line: 'BUTUN', branch: 'Branch B' }),
        ],
      }),
    );

    expect(verdict(resolution, 'ben-001').basis).toStrictEqual({
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      // ⚠ **RE-POINTED BY R6.** Three of these four used to be null, because an `ORDERED` deed's
      // members sat outside the lineage graph. They cannot now: descent is recorded on every deed, so
      // the derived facts reach the basis — and therefore the Arabic statement (BR-505) — on an
      // `ORDERED` run too. `lineageDepth: 1` is DERIVED (`parentId: null` = a child of the waqif) and
      // independently agrees with the declared `tabaqa: 1`.
      //
      // `continuationStipulation` stays null and MUST: `ORDERED` consumes no continuation term, and a
      // value here would tell this beneficiary their line was tested for continuation when it was not.
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    });
    // An excluded member still gets a defensible explanation, not a blank.
    expect(verdict(resolution, 'ben-002').basis).toStrictEqual({
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      lineageDepth: 2,
      parentId: 'ben-001',
      // Read off `line: 'BUTUN'` by the builder — the two record the same fact and must not disagree.
      lineageLink: 'DAUGHTER',
      continuationStipulation: null,
    });
  });

  it('emits one RESOLVER exclusion step per excluded member, carrying the machine reason code', () => {
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-A', tabaqa: 1, active: true }),
          ben({ id: 'ben-B', tabaqa: 1, active: false }),
          ben({ id: 'ben-C', tabaqa: 2, parentId: 'ben-A', active: true }),
        ],
      }),
    );

    const exclusions = resolution.trace.filter((entry) => entry.code === 'BENEFICIARY_EXCLUDED');
    expect(exclusions).toHaveLength(2);
    expect(exclusions.map((entry) => entry.data?.['beneficiaryId'])).toStrictEqual([
      'ben-B',
      'ben-C',
    ]);
    expect(exclusions.map((entry) => entry.data?.['reasonCode'])).toStrictEqual([
      'BENEFICIARY_INACTIVE',
      'UPPER_TABAQA_EXTANT',
    ]);
    for (const entry of exclusions) {
      expect(EXCLUSION_REASON_CODES).toContain(entry.data?.['reasonCode']);
    }
  });

  it('records which ṭabaqa was entitled, and records the extinct-everywhere case distinctly', () => {
    // ṭabaqa 2 is the entitled tier because ṭabaqa 1 is extinct — the only way a depth-2 member can
    // be the lowest LIVING tier now that its depth-1 parent must be on record (R6).
    const living = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-000', tabaqa: 1, active: false }),
          ben({ id: 'ben-001', tabaqa: 2, parentId: 'ben-000' }),
        ],
      }),
    );
    expect(
      living.trace.find((entry) => entry.code === 'ORDERED_ENTITLED_TABAQA')?.data?.[
        'entitledTabaqa'
      ],
    ).toBe('2');

    // ⚠ The lone `tabaqa: 2` member this used to run has no representable record under R6 — a
    // declared ṭabaqa must be REACHED through recorded edges, and a depth-2 descendant needs a
    // depth-1 parent in the register. The parent is therefore present and also dead, which is the
    // same claim (no ṭabaqa holds a living member) over a cohort that can actually exist.
    const extinct = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-000', tabaqa: 1, active: false }),
          ben({ id: 'ben-001', tabaqa: 2, parentId: 'ben-000', active: false }),
        ],
      }),
    );
    expect(extinct.trace.map((entry) => entry.code)).toContain('ORDERED_NO_LIVING_TABAQA');
    expect(extinct.trace.map((entry) => entry.code)).not.toContain('ORDERED_ENTITLED_TABAQA');
  });

  it('does not emit a tier step for SHARED (the surviving half of the S3 joint-step test)', () => {
    // The other half of the S3 test — "does emit the joint-legs step for JOINT" — is gone with the
    // `JOINT_LEGS_PRESENT` trace code, which no run can now produce because no joint run exists.
    const shared = resolveEntitlement(
      makeInput({ entitlementOrder: 'SHARED', beneficiaries: [ben({ id: 'ben-001' })] }),
    );
    expect(shared.trace.map((entry) => entry.code)).not.toContain('ORDERED_ENTITLED_TABAQA');
    expect(shared.trace.map((entry) => entry.code)).not.toContain('JOINT_LEGS_PRESENT');
  });

  it('emits a LINEAGE_GRAPH_RESOLVED step on EVERY order — descent is a fact about the person', () => {
    for (const order of ['ORDERED', 'SHARED'] as const) {
      const resolution = resolveEntitlement(
        makeInput({ entitlementOrder: order, beneficiaries: [ben({ id: 'ben-001' })] }),
      );
      const graph = resolution.trace.find((entry) => entry.code === 'LINEAGE_GRAPH_RESOLVED');
      // ⚠ **`graphMemberCount` is now '1', not '0', and the change IS the point of the test.** Under
      // R6 a `FAMILY` member records descent whatever the order, so on an `ORDERED` or `SHARED` deed
      // the graph is populated rather than legitimately empty. The step must still be EMITTED on
      // every order — descent is a fact about the person, not about the deed's rule — and it must
      // report a real derived tree: one member, one root, max depth 1.
      expect(graph?.data?.['graphMemberCount']).toBe('1');
      expect(graph?.data?.['rootCount']).toBe('1');
      expect(graph?.data?.['maxDepth']).toBe('1');
      // …and no continuation term is claimed on a path that consumes none.
      expect(graph?.data?.['continuationStipulation']).toBe('null');
    }
  });

  it('emits only RESOLVER-stage steps whose data is JSON-safe strings', () => {
    // The trace is persisted and HASHED. A bigint would make `JSON.stringify` throw, and a raw
    // number would serialize differently across surfaces.
    const resolution = resolveEntitlement(
      // ⚠ RE-POINTED: this drove two `CATEGORY_ONLY` placeholders beside a jiha on a خيري waqf, which
      // R6 + ESC-1 now refuse from both sides (see the ORDERED block's enumeration). The subject is a
      // ذري cohort spanning two ṭabaqāt — which emits MORE trace-step kinds than the old input did
      // (an exclusion step and a tier step), so the JSON-safety claim is exercised harder, not less.
      makeInput({
        entitlementOrder: 'ORDERED',
        waqfType: 'FAMILY_DHURRI',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1 }),
          ben({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001' }),
          ben({ id: 'ben-003', tabaqa: 1, line: 'BUTUN', active: false }),
        ],
      }),
    );

    expect(resolution.trace.length).toBeGreaterThan(0);
    // The step kinds this input is chosen to reach, so a future narrowing of the trace is visible.
    expect(resolution.trace.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'ENTITLEMENT_ORDER_RESOLVED',
        'LINEAGE_GRAPH_RESOLVED',
        'ORDERED_ENTITLED_TABAQA',
        'BENEFICIARY_EXCLUDED',
        'ENTITLED_COHORT_RESOLVED',
      ]),
    );
    for (const entry of resolution.trace) {
      expect(entry.stage).toBe('RESOLVER');
      expect(typeof entry.code).toBe('string');
      expect(entry.code.length).toBeGreaterThan(0);
      expect(typeof entry.message).toBe('string');
      for (const value of Object.values(entry.data ?? {})) {
        expect(typeof value).toBe('string');
      }
    }
    expect(() => JSON.stringify(resolution.trace)).not.toThrow();
  });

  it('keeps identifying branch labels OUT of the trace — ids only on the hashed audit surface', () => {
    // AT-16: the trace is persisted and hashed, so anything human-identifying in it is an audit-
    // surface leak. A branch label is a family name in practice; it belongs on the statement's
    // basis, not in the trace.
    const branch = 'ZZ-IDENTIFYING-FAMILY-BRANCH-ZZ';
    const resolution = resolveEntitlement(
      makeInput({
        entitlementOrder: 'ORDERED',
        beneficiaries: [
          ben({ id: 'ben-001', tabaqa: 1, branch }),
          ben({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', branch }),
        ],
      }),
    );

    expect(verdict(resolution, 'ben-002').basis.branch).toBe(branch);
    expect(JSON.stringify(resolution.trace)).not.toContain(branch);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Cross-mode coherence
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveEntitlement — invariants of its own output', () => {
  /**
   * Every (order, type) shape that can still COMPUTE.
   *
   * `JOINT` is gone from the matrix and is covered by its own refusal block above; the
   * `LINEAGE_CONTINUATION` × `PUBLIC_CHARITABLE` pairing is likewise refused
   * (`LINEAGE_ORDER_ON_CHARITABLE_WAQF`).
   */
  const shapes: readonly (readonly [EntitlementOrder, WaqfType])[] = ENTITLEMENT_ORDERS.flatMap(
    (order) =>
      (['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const)
        .filter(
          (waqfType) => !(order === 'LINEAGE_CONTINUATION' && waqfType === 'PUBLIC_CHARITABLE'),
        )
        .map((waqfType) => [order, waqfType] as const),
  );

  /**
   * ⚠ **THE COHORT NOW DEPENDS ON THE WAQF'S NATURE — one cohort can no longer serve both types.**
   *
   * A single bloodline cohort used to be run under both `FAMILY_DHURRI` and `PUBLIC_CHARITABLE`.
   * ESC-1 refuses that: on a خيري waqf **no beneficiary may carry a `lineageLink`**, and R6 requires
   * one on every `FAMILY`/`CATEGORY_ONLY` member — so a خيري cohort can hold jihas and nothing else.
   * Running the bloodline under both types was, after ESC-1, running a refused input half the time.
   *
   * Both cohorts keep the same four ids, the same four deed weights (40/30/30/0) and the same one
   * inactive member, so the cross-mode consistency claim is compared like with like.
   */
  function cohortFor(waqfType: WaqfType): readonly RawBeneficiary[] {
    if (waqfType === 'PUBLIC_CHARITABLE') {
      // Jihas only, all untiered, all outside the lineage graph. A tiered jiha is `JIHA_TIERED`.
      return [
        ben({
          id: 'ben-006',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          stipulatedWeight: '40',
        }),
        ben({
          id: 'ben-007',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          stipulatedWeight: '30',
        }),
        ben({
          id: 'ben-008',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          stipulatedWeight: '30',
          active: false,
        }),
        ben({
          id: 'ben-009',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          stipulatedWeight: '0',
        }),
      ];
    }
    // A bloodline, with the lineage facts recorded so the same cohort is legal under all four orders.
    // ben-009's zero weight is the interesting one: it is EXCLUDED under ORDERED/SHARED and ENTITLED
    // under lineage (ADR-0009 open question 2).
    return [
      ben({ id: 'ben-006', tabaqa: 1, lineageLink: 'SON', stipulatedWeight: '40' }),
      ben({ id: 'ben-007', tabaqa: 1, lineageLink: 'DAUGHTER', stipulatedWeight: '30' }),
      ben({
        id: 'ben-008',
        tabaqa: 2,
        parentId: 'ben-006',
        lineageLink: 'SON',
        stipulatedWeight: '30',
        active: false,
      }),
      ben({
        id: 'ben-009',
        tabaqa: 2,
        parentId: 'ben-007',
        lineageLink: 'SON',
        stipulatedWeight: '0',
      }),
    ];
  }

  it('keeps entitledIds, excludedCount and resolved mutually consistent in every computable mode', () => {
    for (const [order, waqfType] of shapes) {
      const resolution = resolveEntitlement(
        makeInput({
          waqfType,
          entitlementOrder: order,
          continuationStipulation: order === 'LINEAGE_CONTINUATION' ? 'ZUHUR_AND_BUTUN' : null,
          beneficiaries: [...cohortFor(waqfType)],
        }),
      );

      const entitled = resolution.resolved.filter((entry) => entry.entitled);
      const excluded = resolution.resolved.filter((entry) => !entry.entitled);

      expect(resolution.entitledIds).toStrictEqual(entitled.map((entry) => entry.beneficiaryId));
      expect(resolution.excludedCount).toBe(excluded.length);
      for (const entry of entitled) {
        expect(entry.exclusionReason).toBeNull();
        // Under lineage the effective weight is one head; otherwise it is the deed's own figure.
        expect(entry.stipulatedWeight).toBe(
          order === 'LINEAGE_CONTINUATION' ? '1' : entry.source.stipulatedWeight,
        );
      }
      for (const entry of excluded) {
        expect(entry.exclusionReason).not.toBeNull();
        expect(EXCLUSION_REASON_CODES).toContain(entry.exclusionReason);
        expect(entry.stipulatedWeight).toBe('0');
      }
      // `entitledTabaqa` is meaningful only under ORDERED — under lineage the tier is NOT the key.
      if (order !== 'ORDERED') expect(resolution.entitledTabaqa).toBeNull();
      // Every flag this stage can raise is one of the two ADR-0009 additions.
      for (const flag of resolution.flags) {
        expect([
          'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
          'CONTINUATION_STIPULATION_NOT_APPLIED',
        ]).toContain(flag);
      }
    }
  });
});
