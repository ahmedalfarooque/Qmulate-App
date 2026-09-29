/**
 * **Q7 · VALIDITY PRECEDES SHORT-CIRCUITS — the rule, applied to every check rather than to one.**
 *
 * **Product-owner decision, 2026-08-17 (memo Q7, ESC-2):** *"validity precedes short-circuits: a record
 * that cannot describe a real endowment halts even when nothing would be paid."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠⚠ WHY THIS FILE EXISTS: THE FIRST PASS AT Q7 IMPLEMENTED THE RULING FOR **ONE** CHECK AND
 *      SHIPPED A COMMENT CLAIMING THE GENERAL RULE. NOTHING IN THE SUITE NOTICED. ⚠⚠⚠
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * That pass moved `assertJihaNotTiered` above the `NA_DIRECT_USE` short-circuit and wrote, above the
 * short-circuit itself, *"Only **validity** outranks it."* The code did not have that property. MEASURED
 * afterwards, by driving `runDistribution` on one minimal defect record per `SHART_REFUSALS`
 * discriminator under **all four** entitlement orders — enumerated, not read off anybody's list —
 * **seven further discriminators, in eight distinct record shapes, refused on
 * `ORDERED`/`SHARED`/`LINEAGE_CONTINUATION` and RESOLVED on `NA_DIRECT_USE`**:
 *
 * | discriminator | before Q7 pass 2, on `NA_DIRECT_USE` |
 * |---|---|
 * | `LINEAGE_LINK_UNRECOGNISED` | **RESOLVED** |
 * | `LINEAGE_EDGE_ON_NON_DESCENDANT` | **RESOLVED** |
 * | `LINEAGE_PARENT_UNKNOWN` | **RESOLVED** |
 * | `LINEAGE_CYCLE` (self-parent) | **RESOLVED** |
 * | `LINEAGE_CYCLE` (two-member cycle) | **RESOLVED** |
 * | `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` | **RESOLVED** |
 * | `TABAQA_MISMATCHES_LINEAGE_DEPTH` | **RESOLVED** |
 * | `BENEFICIARY_ID_DUPLICATED` (via `resolveEntitlement`) | **RESOLVED** |
 *
 * The whole of `buildLineage` sat below the short-circuit, so a direct-use deed could record a person as
 * their own ancestor, a parent edge naming nobody, a charity inside the family tree, or a register whose
 * declared ṭabaqa contradicted its own edges — and the run was emitted as valid. The fix hoists
 * `buildLineage` above the short-circuit; this file is the pin, and its census is what a third pass would
 * have to move a number in.
 *
 * ## THE CLASSIFICATION, STATED — because "move everything" would have been the wrong fix
 * The ruling's own test is *"a record that cannot describe a real endowment"*. Three refusals fail that
 * test and are deliberately LEFT below the short-circuit, each because its own stated reason is about
 * **payment**, and direct use pays nothing by design (I7 retains the whole distributable):
 *
 *  · **`LINEAGE_LINK_MISSING`** — a `FAMILY` member with no recorded descent. Nothing contradicts
 *    anything; the endowment is real and its data entry is incomplete. R6's rationale, in the owner's
 *    words, is *"nobody the engine cannot place in the family tree may ever be paid"*, and the refusal's
 *    message ends *"will not pay someone it cannot place"* — a sentence with no subject on a run that
 *    pays nobody. And the asymmetry that decides it: a validity check refuses only records that are
 *    already wrong, so hoisting one costs nothing, whereas hoisting this one would **require every
 *    direct-use endowment to enrol its whole family tree before a nil run could be emitted** — a new
 *    product requirement on a class of deeds, which is binding rule 4's territory, not engineering's.
 *    ⚠ TODO(surface) is on the pass itself in `resolver.ts`; R6 is recorded as reaching `ORDERED`,
 *    `SHARED` and `LINEAGE_CONTINUATION`, and direct use was never put to the owner.
 *  · **`REVERSION_WITH_NO_RECORDED_BLOODLINE`** — its own doc: *"∅ is 'not yet enrolled', not 'extinct'
 *    … will not pay a charity because the data entry is incomplete."* A completeness check whose purpose
 *    is to stop a payment.
 *  · **`ULTIMATE_TAKER_WEIGHTS_UNUSABLE`** — fires only on a **triggered** reversion, about how to split
 *    **an amount**. There is no amount to split on a direct-use run.
 *
 * Their remaining below is asserted **positively** below, not left as an absence, so that a later change
 * moving them is a visible decision rather than drift — in either direction.
 *
 * ## MUTATION-VERIFIED — RUN, THEN WRITTEN DOWN. THE NUMBERS BELOW ARE WHAT THE RUNS REPORTED.
 *
 * **Mutation 1 — revert the fix.** `const lineage = buildLineage(input);` put back below the
 * `if (order === 'NA_DIRECT_USE') { … }` block, i.e. the pre-fix position. **MEASURED: 11 of this file's
 * 20 tests RED** — §1's census, all seven of §2's per-check tests, §2's `resolveEntitlement` duplicate-id
 * test, §4's trace-honesty test, and §5's money-error boundary test. The three §3 tests and §5's
 * continuation-precedence test stay GREEN, which is the correct outcome: they assert behaviour this
 * mutation does not touch. (⚠ §4's "member count of 0 for Example C" also stays green, honestly — the
 * count is `0` whether or not the graph was built, so that one is a shape check and not a guard. Said
 * here rather than letting the file look better than it is.)
 *
 * **Mutation 2 — hoist pass 4 as well**, by deleting the `order !== 'NA_DIRECT_USE'` conjunct from
 * `buildLineage`'s `LINEAGE_LINK_MISSING` pass. **MEASURED: 4 of 20 RED in this file** (the census, §3's
 * `LINEAGE_LINK_MISSING` test, §3's Example C control, §4's member-count test) and **11 failures across
 * 5 files in the whole domain suite** — and, most of all, `worked-examples.test.ts` **fails to collect at
 * all**, taking its 145 tests with it, because §08 Example C is built at module scope and
 * `runDistribution` now throws there. That measurement is the evidence behind the classification: it is
 * what "hoisting pass 4 makes §08's Examples C and C2 refused inputs" costs, in numbers rather than in
 * prose.
 *
 * Both mutations were reverted by hand and the file re-run green (20/20) before this header was written.
 */
import { describe, expect, it } from 'vitest';

import { isDomainError } from '../../errors.js';
import { runDistribution } from '../engine.js';
import { resolveEntitlement } from '../resolver.js';
import {
  ENTITLEMENT_ORDERS,
  SHART_REFUSALS,
  distributionInputSchema,
  type DistributionInputRaw,
} from '../contract.js';
import { BEN_006, BEN_306, beneficiary, exampleC, patched } from './fixtures/worked-examples.js';

type Raw = DistributionInputRaw;
type BenRaw = Raw['beneficiaries'][number];

/** The three orders that move ghallah, and the one that does not. */
const MONETARY_ORDERS = ['ORDERED', 'SHARED', 'LINEAGE_CONTINUATION'] as const;

/** A legal ذري son of the waqif, alive, at ṭabaqa 1. Patch it to inject exactly one defect. */
function son(id: string, patch: Partial<BenRaw> = {}): BenRaw {
  return patched(
    beneficiary({
      id,
      kind: 'FAMILY',
      active: true,
      tabaqa: 1,
      parentId: null,
      lineageLink: 'SON',
      line: 'ZUHUR',
      branch: 'A',
      stipulatedWeight: '50',
      verificationStatus: 'VERIFIED',
      kycLastRefreshed: '2026-04-01',
      category: null,
      residency: 'DOMESTIC',
      disbursingEntity: null,
      bankingRefForProceeds: `FAKE-IBAN-${id}`,
    }),
    patch,
  );
}

/** An untiered `CHARITABLE_JIHA` — legal on a ذري deed only as a named ultimate taker (R7). */
const JIHA = patched(BEN_006, { tabaqa: null });
const MAAL = Object.freeze({ kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-006'] });

/**
 * A ذري deed with a **legal, computable** cohort and real period revenue, built on `exampleC`'s
 * direct-use classification so that flipping `entitlementOrder` is the ONLY axis under test. Every case
 * below injects exactly one defect into it, so a refusal can only be that defect's.
 */
function base(): Raw {
  return {
    ...exampleC(),
    waqfType: 'FAMILY_DHURRI',
    continuationStipulation: 'ZUHUR_ONLY',
    revenue: {
      incomeMinor: 100_000_000n,
      receipts: [{ id: 'rev-1', receiptClass: 'INCOME', amountMinor: 100_000_000n }],
    },
    beneficiaries: [son('ben-a'), son('ben-b')],
  };
}

/** The refusal discriminator a run produced, or `'RESOLVED'`. Never a bare `SHART_INCOMPLETE`. */
function outcomeOf(raw: Raw): string {
  try {
    runDistribution(raw);
    return 'RESOLVED';
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const details = error.details as { readonly refusal?: unknown } | undefined;
    if (details?.refusal === undefined) return `CODE:${error.code}`;
    expect(SHART_REFUSALS).toContain(details.refusal);
    return String(details.refusal);
  }
}

/** The same, through the exported Stage-2 function, which skips the contract door's own guards. */
function stage2OutcomeOf(raw: Raw): string {
  try {
    resolveEntitlement(distributionInputSchema.parse(raw));
    return 'RESOLVED';
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const details = error.details as { readonly refusal?: unknown } | undefined;
    if (details?.refusal === undefined) return `CODE:${error.code}`;
    return String(details.refusal);
  }
}

/**
 * Every defect shape, the discriminator it must produce, and whether direct use is expected to refuse
 * it. `paysNothingSoSkipped: true` marks the three payment-side checks the short-circuit still outranks.
 */
interface Shape {
  readonly name: string;
  readonly refusal: string;
  readonly raw: Raw;
  /** `false` for the three checks classified as payment rather than validity. */
  readonly refusedOnDirectUse: boolean;
}

/* ── the VALIDITY shapes: a record that cannot describe a real endowment ────────────────────── */

const VALIDITY_SHAPES: readonly Shape[] = [
  {
    name: 'a jiha carrying a generational ṭabaqa (ESC-2, closed by Q7 pass 1)',
    refusal: 'JIHA_TIERED',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: MAAL,
      beneficiaries: [son('ben-a'), patched(BEN_006, { tabaqa: 2 })],
    },
  },
  {
    name: 'waqfType JOINT — not a waqf at all (refused since S3)',
    refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    refusedOnDirectUse: true,
    raw: { ...base(), waqfType: 'JOINT' },
  },
  {
    name: 'a charity beside a bloodline with no مآل clause',
    refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    refusedOnDirectUse: true,
    raw: { ...base(), beneficiaries: [son('ben-a'), JIHA] },
  },
  {
    name: 'a charity on a ذري deed the reversion does not name',
    refusal: 'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      beneficiaries: [
        patched(BEN_306, {
          id: 'ben-cat',
          kind: 'CATEGORY_ONLY',
          category: 'not yet enrolled',
          tabaqa: 1,
          parentId: null,
          lineageLink: 'SON',
        }),
        JIHA,
      ],
    },
  },
  {
    name: 'a bloodline fact (lineageLink) on a خيري deed',
    refusal: 'DESCENDANT_ON_CHARITABLE_WAQF',
    refusedOnDirectUse: true,
    // ṭabaqa nulled so `TABAQA_ON_CHARITABLE_WAQF` — which is checked first — does not absorb the case.
    raw: {
      ...base(),
      waqfType: 'PUBLIC_CHARITABLE',
      beneficiaries: [son('ben-a', { tabaqa: null })],
    },
  },
  {
    name: 'a generation (ṭabaqa) on a خيري deed, which has none',
    refusal: 'TABAQA_ON_CHARITABLE_WAQF',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      waqfType: 'PUBLIC_CHARITABLE',
      beneficiaries: [
        patched(BEN_306, {
          id: 'ben-cat',
          kind: 'CATEGORY_ONLY',
          category: 'the poor of the district',
          tabaqa: 2,
          parentId: null,
          lineageLink: null,
        }),
      ],
    },
  },

  /* ── ⊕ THE SEVEN Q7 PASS 2 MOVED, all inside `buildLineage` ──────────────────────────────── */
  {
    name: '⊕ MOVED · a descent link outside {SON, DAUGHTER}',
    refusal: 'LINEAGE_LINK_UNRECOGNISED',
    refusedOnDirectUse: true,
    raw: { ...base(), beneficiaries: [son('ben-a', { lineageLink: 'COUSIN' }), son('ben-b')] },
  },
  {
    name: '⊕ MOVED · a parent edge on someone recorded as no descendant at all',
    refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      beneficiaries: [son('ben-a'), son('ben-b', { lineageLink: null, parentId: 'ben-a' })],
    },
  },
  {
    name: '⊕ MOVED · a parent edge naming nobody in the register',
    refusal: 'LINEAGE_PARENT_UNKNOWN',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      beneficiaries: [son('ben-a'), son('ben-b', { parentId: 'ben-nobody', tabaqa: 2 })],
    },
  },
  {
    name: '⊕ MOVED · a person recorded as their own parent (the 1-cycle)',
    refusal: 'LINEAGE_CYCLE',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      beneficiaries: [son('ben-a'), son('ben-b', { parentId: 'ben-b', tabaqa: 2 })],
    },
  },
  {
    name: '⊕ MOVED · two people each recorded as the other’s parent (a 2-cycle)',
    refusal: 'LINEAGE_CYCLE',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      beneficiaries: [
        son('ben-a', { parentId: 'ben-b', tabaqa: 2 }),
        son('ben-b', { parentId: 'ben-a', tabaqa: 2 }),
      ],
    },
  },
  {
    name: '⊕ MOVED · a subtree hanging off a charity instead of the waqif',
    refusal: 'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: MAAL,
      beneficiaries: [son('ben-a', { parentId: 'ben-006', tabaqa: 2 }), JIHA],
    },
  },
  {
    name: '⊕ MOVED · a declared ṭabaqa that disagrees with its own derived depth',
    refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      beneficiaries: [son('ben-a'), son('ben-b', { parentId: 'ben-a', tabaqa: 7 })],
    },
  },

  /* ── R7 · the مآل clause's own legibility, above the short-circuit since R7 ───────────────── */
  {
    name: 'a مآل reading this engine does not implement',
    refusal: 'REVERSION_KIND_UNRECOGNISED',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: { kind: 'TO_THE_AUTHORITY', ultimateTakerIds: ['ben-006'] },
      beneficiaries: [son('ben-a'), JIHA],
    },
  },
  {
    name: 'a مآل clause naming nobody',
    refusal: 'REVERSION_WITH_NO_ULTIMATE_TAKER',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [] },
      beneficiaries: [son('ben-a')],
    },
  },
  {
    name: 'a مآل clause naming an id not in the register',
    refusal: 'REVERSION_ULTIMATE_TAKER_UNKNOWN',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-nobody'] },
      beneficiaries: [son('ben-a')],
    },
  },
  {
    name: 'a مآل clause naming a DESCENDANT as the ultimate taker',
    refusal: 'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-a'] },
      beneficiaries: [son('ben-a')],
    },
  },
  {
    name: 'a مآل clause naming one taker twice (it would double-count in the weight vector)',
    refusal: 'REVERSION_ULTIMATE_TAKER_DUPLICATED',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['ben-006', 'ben-006'] },
      beneficiaries: [son('ben-a'), JIHA],
    },
  },
  {
    name: 'a مآل clause on a خيري deed, which has no bloodline to end',
    refusal: 'REVERSION_ON_CHARITABLE_WAQF',
    refusedOnDirectUse: true,
    raw: {
      ...base(),
      waqfType: 'PUBLIC_CHARITABLE',
      reversion: MAAL,
      beneficiaries: [
        patched(BEN_306, {
          id: 'ben-cat',
          kind: 'CATEGORY_ONLY',
          category: 'the poor of the district',
          tabaqa: null,
          parentId: null,
          lineageLink: null,
        }),
        JIHA,
      ],
    },
  },
];

/* ── the PAYMENT shapes: deliberately still outranked by the short-circuit ──────────────────── */

const PAYMENT_SHAPES: readonly Shape[] = [
  {
    name: 'LEFT · a FAMILY member whose descent is simply unrecorded (completeness, not contradiction)',
    refusal: 'LINEAGE_LINK_MISSING',
    refusedOnDirectUse: false,
    raw: {
      ...base(),
      beneficiaries: [son('ben-a', { lineageLink: null, parentId: null, tabaqa: 1 }), son('ben-b')],
    },
  },
  {
    name: 'LEFT · a مآل clause over an empty family register ("not yet enrolled", not "extinct")',
    refusal: 'REVERSION_WITH_NO_RECORDED_BLOODLINE',
    refusedOnDirectUse: false,
    raw: { ...base(), reversion: MAAL, beneficiaries: [JIHA] },
  },
  {
    name: 'LEFT · a TRIGGERED reversion whose taker weights are all zero (an amount, not a record)',
    refusal: 'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
    refusedOnDirectUse: false,
    raw: {
      ...base(),
      reversion: MAAL,
      beneficiaries: [son('ben-a', { active: false }), patched(JIHA, { stipulatedWeight: '0' })],
    },
  },
];

const ALL_SHAPES = [...VALIDITY_SHAPES, ...PAYMENT_SHAPES];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · THE CENSUS — one rule, enumerated per discriminator rather than asserted
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('1 · the direct-use reachability census', () => {
  /**
   * The census as a single closed object: shape name → the outcome on each of the four orders. Any
   * change to precedence, in either direction, moves a string here. Asserted whole rather than
   * per-row so a NEW discriminator appearing on some route cannot hide between two passing rows.
   */
  it('every validity check answers the same on ALL FOUR orders — and the three payment checks do not', () => {
    const census: Record<string, string> = {};
    for (const shape of ALL_SHAPES) {
      const outcomes = ENTITLEMENT_ORDERS.map((entitlementOrder) =>
        outcomeOf({ ...shape.raw, entitlementOrder }),
      );
      census[shape.name] = outcomes.join(' | ');
    }

    const uniform = (refusal: string): string =>
      // `ENTITLEMENT_ORDERS`' own order, so this string is built the same way the loop is.
      ENTITLEMENT_ORDERS.map(() => refusal).join(' | ');
    /** Refused wherever ghallah could move; RESOLVED on direct use, which moves none. */
    const paymentOnly = (refusal: string): string =>
      ENTITLEMENT_ORDERS.map((order) => (order === 'NA_DIRECT_USE' ? 'RESOLVED' : refusal)).join(
        ' | ',
      );

    const expected: Record<string, string> = {};
    for (const shape of VALIDITY_SHAPES) expected[shape.name] = uniform(shape.refusal);
    for (const shape of PAYMENT_SHAPES) expected[shape.name] = paymentOnly(shape.refusal);

    expect(census).toStrictEqual(expected);
  });

  /**
   * The count, so "seven moved" is a pinned number rather than whatever the loop happened to find,
   * and so a future pass cannot quietly reclassify one of the three as validity (or one of the
   * nineteen back to payment) without a number changing.
   */
  it('counts the partition: 19 uniform validity shapes, 3 payment checks the short-circuit outranks', () => {
    expect(VALIDITY_SHAPES).toHaveLength(19);
    expect(PAYMENT_SHAPES).toHaveLength(3);

    // ⊕ The six this pass moved that are reachable through `runDistribution`, named. `LINEAGE_CYCLE`
    // covers TWO distinct record shapes — the self-parent and the two-member cycle — so seven shapes
    // carry six discriminators here. The seventh moved discriminator, `BENEFICIARY_ID_DUPLICATED`, is
    // reachable only through `resolveEntitlement` and is counted in §2's own test, not here.
    const moved = VALIDITY_SHAPES.filter((shape) => shape.name.startsWith('⊕ MOVED'));
    expect(moved).toHaveLength(7);
    expect([...new Set(moved.map((shape) => shape.refusal))].sort()).toStrictEqual([
      'LINEAGE_CYCLE',
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
      'LINEAGE_LINK_UNRECOGNISED',
      'LINEAGE_PARENT_UNKNOWN',
      'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    ]);
  });

  /**
   * ⚠ The census's own control: every shape must actually produce the discriminator it claims to
   * target on a monetary order. Without this, a typo'd fixture could make a row "uniform" by
   * refusing for the wrong reason on all four orders, and the census would report that as success —
   * R6-C1's lesson (*a property whose generator cannot reach a configuration reports its silence as
   * success, at scale*) applied to a hand-built table.
   */
  it('control · every shape really does produce its target discriminator where ghallah moves', () => {
    for (const shape of ALL_SHAPES) {
      for (const entitlementOrder of MONETARY_ORDERS) {
        expect(
          outcomeOf({ ...shape.raw, entitlementOrder }),
          `${shape.name} / ${entitlementOrder}`,
        ).toBe(shape.refusal);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · A TEST PER MOVED CHECK — driven through the front door, one at a time
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('2 · each moved check, on a DIRECT-USE deed, named individually', () => {
  for (const shape of VALIDITY_SHAPES.filter((candidate) => candidate.name.startsWith('⊕ MOVED'))) {
    it(`runDistribution refuses ${shape.refusal} on NA_DIRECT_USE · ${shape.name}`, () => {
      let caught: unknown;
      try {
        runDistribution({ ...shape.raw, entitlementOrder: 'NA_DIRECT_USE' });
        expect.unreachable(`a direct-use deed must still refuse ${shape.refusal}`);
      } catch (error) {
        caught = error;
      }
      if (!isDomainError(caught)) throw caught;
      expect(caught.code).toBe('SHART_INCOMPLETE');
      // The DISCRIMINATOR, never a bare `SHART_INCOMPLETE` — twenty-six refusals share that code.
      expect(caught.details).toMatchObject({ refusal: shape.refusal });
    });
  }

  /**
   * `BENEFICIARY_ID_DUPLICATED` is reachable **only** through the exported Stage-2 function: the
   * contract door refuses a duplicate id first with `DISTRIBUTION_INPUT_INVALID`, on every order. It
   * moved with `buildLineage` all the same, and it is measured here rather than assumed, because
   * "unreachable through the front door" is exactly the claim this repo has been wrong about before.
   */
  it('resolveEntitlement · BENEFICIARY_ID_DUPLICATED now refuses on NA_DIRECT_USE too', () => {
    const duplicated = { ...base(), beneficiaries: [son('ben-a'), son('ben-a')] };
    for (const entitlementOrder of ENTITLEMENT_ORDERS) {
      expect(stage2OutcomeOf({ ...duplicated, entitlementOrder }), entitlementOrder).toBe(
        'BENEFICIARY_ID_DUPLICATED',
      );
    }
    // …and the contract door's own behaviour is UNCHANGED by this work: it still wins first.
    expect(outcomeOf({ ...duplicated, entitlementOrder: 'NA_DIRECT_USE' })).toBe(
      'CODE:DISTRIBUTION_INPUT_INVALID',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · THE THREE LEFT BELOW — asserted positively, so moving them is a decision and not drift
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('3 · the payment-side checks the short-circuit still outranks', () => {
  for (const shape of PAYMENT_SHAPES) {
    it(`NA_DIRECT_USE computes over ${shape.refusal}, and pays nobody · ${shape.name}`, () => {
      const result = runDistribution({ ...shape.raw, entitlementOrder: 'NA_DIRECT_USE' });
      // The whole reason leaving it below is safe: no line, no halala, everything retained (I7).
      expect(result.lines).toStrictEqual([]);
      expect(result.totals.paidMinor).toBe(0n);
      expect(result.totals.withheldMinor).toBe(0n);
      expect(result.totals.retainedMinor).toBe(result.waterfall.distributableMinor);
      // …and the identical record halts the moment the deed is computed on an order that pays.
      expect(outcomeOf({ ...shape.raw, entitlementOrder: 'ORDERED' })).toBe(shape.refusal);
    });
  }

  /**
   * §08 worked Example C, which is why `LINEAGE_LINK_MISSING` was classified rather than hoisted.
   * `waqf-004`'s cohort is deliberately edgeless (see `BEN_DIRECT_USE_A`), so hoisting that pass
   * would make a documented spec example a REFUSED input. Pinned here as the cost, measured.
   */
  it('§08 Example C still computes — the cost of hoisting pass 4, made concrete', () => {
    expect(exampleC().beneficiaries.every((member) => member.lineageLink === null)).toBe(true);
    expect(runDistribution(exampleC()).lines).toStrictEqual([]);
    expect(outcomeOf({ ...exampleC(), entitlementOrder: 'ORDERED' })).toBe('LINEAGE_LINK_MISSING');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · TRACE HONESTY — the run must not claim it skipped what it just did
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('4 · the short-circuit trace step states what WAS validated', () => {
  /**
   * The step's message used to say the lineage graph was *"not read at all"*. After the move that is
   * false, and a false statement on a run's own audit trace is the same defect class as a false
   * comment — worse, because a Nazir may read it. Pinned so the sentence cannot drift back.
   */
  it('publishes lineageGraphValidated and the member count, and no longer claims the graph was unread', () => {
    const resolution = resolveEntitlement(
      distributionInputSchema.parse({
        ...base(),
        entitlementOrder: 'NA_DIRECT_USE',
        beneficiaries: [son('ben-a'), son('ben-b', { parentId: 'ben-a', tabaqa: 2 })],
      }),
    );
    const shortCircuit = resolution.trace.find(
      (entry) => entry.code === 'NA_DIRECT_USE_SHORT_CIRCUIT',
    );
    expect(shortCircuit?.data).toMatchObject({
      lineageGraphValidated: 'true',
      lineageGraphMemberCount: '2',
    });
    expect(shortCircuit?.message).not.toContain('the lineage graph and');
    expect(shortCircuit?.message).toContain('validated for integrity');

    // …and NO `LINEAGE_GRAPH_RESOLVED` step: the graph's integrity was checked, but no entitlement was
    // resolved from it, and a code saying otherwise would over-claim in the other direction.
    expect(resolution.trace.some((entry) => entry.code === 'LINEAGE_GRAPH_RESOLVED')).toBe(false);
    expect(resolution.resolved).toStrictEqual([]);
  });

  /** A cohort recording no descent at all reports 0 members — Example C's ordinary state, not a fault. */
  it('reports a member count of 0 for a register that records no descent (Example C)', () => {
    const resolution = resolveEntitlement(distributionInputSchema.parse(exampleC()));
    const shortCircuit = resolution.trace.find(
      (entry) => entry.code === 'NA_DIRECT_USE_SHORT_CIRCUIT',
    );
    expect(shortCircuit?.data).toMatchObject({
      lineageGraphValidated: 'true',
      lineageGraphMemberCount: '0',
    });
  });

  /** The monetary path's trace is UNCHANGED by the move — the build was hoisted, the step was not. */
  it('leaves the monetary trace order untouched: ORDER_RESOLVED then LINEAGE_GRAPH_RESOLVED', () => {
    const resolution = resolveEntitlement(
      distributionInputSchema.parse({ ...base(), entitlementOrder: 'ORDERED' }),
    );
    const codes = resolution.trace.map((entry) => entry.code);
    expect(codes.indexOf('ENTITLEMENT_ORDER_RESOLVED')).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf('LINEAGE_GRAPH_RESOLVED')).toBeGreaterThan(
      codes.indexOf('ENTITLEMENT_ORDER_RESOLVED'),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · THE PRECEDENCE THIS CHANGE MUST **NOT** HAVE MOVED
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('5 · the continuation parse still outranks a lineage-graph refusal on a paying deed', () => {
  /**
   * ⚠ MEASURED REGRESSION, then undone. The first attempt hoisted `buildLineage` alone, and a
   * `LINEAGE_CONTINUATION` deed with a null continuation term **and** an edgeless member flipped from
   * `CONTINUATION_STIPULATION_UNRECOGNISED` to `LINEAGE_LINK_MISSING` — a different precedence
   * question, on the money-moving path, changed as a side effect of answering Q7. The continuation
   * parse is hoisted with `buildLineage` for exactly this reason, and this test is why it stays.
   */
  it('a lineage deed with no continuation term reports R2, not whatever its register also lacks', () => {
    expect(outcomeOf({ ...exampleC(), entitlementOrder: 'LINEAGE_CONTINUATION' })).toBe(
      'CONTINUATION_STIPULATION_UNRECOGNISED',
    );
    // The same deed with a legible term falls through to the register's own defect, as it always did.
    expect(
      outcomeOf({
        ...exampleC(),
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_ONLY',
      }),
    ).toBe('LINEAGE_LINK_MISSING');
  });

  /**
   * ⚠ **THE HONEST BOUNDARY OF THIS WHOLE FILE'S CLAIM, MEASURED AND PINNED RATHER THAN LEFT IMPLICIT.**
   *
   * *"Validity precedes short-circuits"* is not *"validity precedes everything"*. Stage 1 (the waterfall)
   * runs before Stage 2 (the resolver), so a **money error outranks every Stage-2 refusal** — a
   * direct-use deed whose register contains a cycle AND whose costs exceed its revenue reports
   * `DISTRIBUTION_NEGATIVE`, not `LINEAGE_CYCLE`. Only `assertSingleWaqfNature` is hoisted into Stage 0
   * to outrank a money error, and that hoist was ADR-0009's decision about a waqf that cannot exist, not
   * Q7's.
   *
   * What matters for Q7 is that this is **the same on all four orders**, which is asserted below: the
   * engine answers *one* precedence question one way. Whether a Stage-2 validity refusal should also
   * outrank a money error is a **different** question, pre-existing, and nobody has been asked it.
   *
   * // TODO(surface) — should a self-contradicting register outrank `DISTRIBUTION_NEGATIVE`, the way a
   * // JOINT waqf already does? The argument for yes is exactly memo Q7's (*a record that cannot
   * // describe a real endowment is void whatever its figures say*); the argument for no is that a
   * // negative distributable is itself a refusal an operator must fix first, and reordering it would
   * // change which error every existing broken run reports. NOT changed here: widening it would be a
   * // second unasked-for precedence change, which is the defect this pass exists to repair.
   */
  it('a money error still outranks a Stage-2 refusal — identically on direct use and on ORDERED', () => {
    const cyclic = (order: 'NA_DIRECT_USE' | 'ORDERED', operatingCostMinor: bigint): Raw => ({
      ...base(),
      entitlementOrder: order,
      operatingCostMinor,
      beneficiaries: [son('ben-a'), son('ben-b', { parentId: 'ben-b', tabaqa: 2 })],
    });

    for (const order of ['NA_DIRECT_USE', 'ORDERED'] as const) {
      // Solvent: the register's contradiction is what the run reports — Q7's rule, on both orders.
      expect(outcomeOf(cyclic(order, 0n)), order).toBe('LINEAGE_CYCLE');
      // Insolvent: Stage 1 refuses first, on both orders. Uniform, which is the assertion.
      expect(outcomeOf(cyclic(order, 900_000_000n)), order).toBe('CODE:DISTRIBUTION_NEGATIVE');
    }
  });
});
