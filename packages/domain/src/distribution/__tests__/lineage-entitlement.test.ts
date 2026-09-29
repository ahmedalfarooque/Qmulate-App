/**
 * `distribution/lineage-entitlement.test.ts` — ADR-0009's rule, and only that rule.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE IS THE SPECIFICATION OF WHO GETS PAID
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It is the most fiqh-sensitive suite in the product: it decides which members of a real family
 * receive ghallah. The rules under test are the **product owner's**, a practising Nazir, recorded on
 * 2026-08-02/03 in `docs/decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md`. Nothing here
 * is engineering's reading of fiqh, and where a rule is silent the engine **refuses** rather than
 * inferring (CLAUDE.md binding rule 1) — so several tests exist purely to prove that a refusal
 * happened where a convenient default would have been easier.
 *
 * **R1 · lineage, not tier arithmetic.** A generation's death does not block the next generation: an
 * ancestor is walked *through*, and no ṭabaqa test appears on this path at all.
 *
 * ⚠⚠ **R-FRONTIER · THE CORRECTION THAT REWROTE THIS FILE (product owner, 2026-08-03).** The line
 * that used to stand here — *"the only vital status the lineage path reads is the beneficiary's OWN
 * `active`"* — is **FALSE**, and it came from ADR-0009's original wording (*"every living descendant
 * of the waqif is eligible"*), which the owner corrected in their own words:
 *
 *     *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A
 *     is dead."*
 *
 * Entitlement sits at the **nearest LIVING point on each line of descent**. The walk reads every
 * intermediate ancestor's `active` as well as their link, a living ancestor HOLDS the entitlement
 * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` — a **temporary** exclusion that reverses on their death),
 * and there is now very much an exclusion code for "someone ahead of me is still alive". Every tree
 * in this file was rebuilt around that: where a test needs the ẓuhūr/buṭūn boundary evaluated at all,
 * the intermediate ancestors are DECEASED, because otherwise the frontier rule answers first and the
 * boundary is never reached.
 *
 * **R2 · the continuation stipulation is a closed two-value deed term.** `ZUHUR_ONLY` ⇒ eligible iff
 * every ancestor **strictly between** the waqif and the person is a `SON` — *and* deceased. The
 * boundary is tested in BOTH directions and to four generations, because "the person themself may be
 * a daughter" and "an intermediate daughter ends the line" are the two halves that a plausible-looking
 * wrong implementation gets backwards.
 *
 * **R3 · per capita, equal per head, recomputed each period.** A deceased member's share does NOT pass
 * down their branch as a block. The consequence the owner explicitly accepted — a branch with six
 * eligible children collectively receives six times a branch with one — is proved **arithmetically,
 * on exact halalas**, not asserted.
 *
 * **R4 · lineage is the default; `ORDERED` is opt-in.** The same family, the same members, one field
 * different, opposite verdicts. That contrast is what proves the order is actually read.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THE FIGURES IN THIS FILE WERE OBTAINED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **By hand, from the waterfall, and never copied from output** (the fixture module's standing rule).
 * Two money shapes are used, both with `operatingCostMinor: 0` and a 10%-of-revenue Nazir fee
 * (⚠ the ʿushr rate is unverified — confirm vs primary law) on revenue of 35,000,000 halalas
 * (SAR 350,000):
 *
 *   · `LINEAGE_MONEY` — ṣiyāna FIXED 4,000,000 ⇒ net 31,000,000, fee 3,500,000,
 *     **distributable 27,500,000**. Chosen because it does NOT divide by 3, so the Hamilton residual
 *     is exercised and I-L1's "spread ≤ 1 halala" bound is a real claim rather than a trivial one.
 *   · `DIVISIBLE_MONEY` — ṣiyāna NONE ⇒ net 35,000,000, fee 3,500,000,
 *     **distributable 31,500,000 = 7 × 4,500,000**. Chosen so the six-branches-versus-one arithmetic
 *     is EXACT and the "six times" claim needs no tolerance.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import {
  SHART_REFUSALS,
  minorOf,
  parseDistributionInput,
  type DistributionInput,
  type DistributionInputRaw,
  type DistributionLine,
  type LineBasis,
  type Minor,
} from '../contract.js';
import { runDistribution } from '../engine.js';
import { assertOrderedExclusion, assertPerCapitaEquality } from '../invariants.js';
import {
  buildLineage,
  resolveEntitlement,
  type EntitlementResolution,
  type ResolvedBeneficiary,
} from '../resolver.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Builders — a family tree, stated as the deed states it
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];

const ASOF_GREGORIAN = '2026-07-14';

/** ṣiyāna 4,000,000 ⇒ distributable 27,500,000. Deliberately NOT divisible by 3. */
const LINEAGE_MONEY = {
  revenue: {
    incomeMinor: 35_000_000n,
    receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
  },
  operatingCostMinor: 0n,
  maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
  nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
} as const satisfies Partial<DistributionInputRaw>;

const LINEAGE_DISTRIBUTABLE = 27_500_000n;

/** ṣiyāna NONE ⇒ distributable 31,500,000 = 7 × 4,500,000, so the branch arithmetic is exact. */
const DIVISIBLE_MONEY = {
  revenue: {
    incomeMinor: 35_000_000n,
    receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
  },
  operatingCostMinor: 0n,
  maintenance: { kind: 'NONE' },
  nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
} as const satisfies Partial<DistributionInputRaw>;

const DIVISIBLE_DISTRIBUTABLE = 31_500_000n;

/**
 * A descendant, with the lineage facts always recorded.
 *
 * `tabaqa` must equal the derived depth or the run is refused
 * (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) — deliberately, so a fixture cannot drift from the tree it
 * describes. Payability fields are all clean and boring: if a lineage verdict ever changed because of
 * one, the entitlement/payability separation (I6) would already be broken.
 */
function person(
  id: string,
  depth: number,
  link: 'SON' | 'DAUGHTER',
  parentId: string | null,
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return {
    id,
    kind: 'FAMILY',
    active: true,
    tabaqa: depth,
    parentId,
    lineageLink: link,
    line: link === 'SON' ? 'ZUHUR' : 'BUTUN',
    branch: null,
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

/** A child of the waqif — the root of a line, depth 1, `parentId: null`. */
function child(
  id: string,
  link: 'SON' | 'DAUGHTER',
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return person(id, 1, link, null, overrides);
}

function baseRaw(): DistributionInputRaw {
  return {
    waqfId: 'waqf-lineage-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    // R7 · no مآل clause: every case in this file is about R-FRONTIER's own arithmetic over a
    // bloodline, and a reversion would add a beneficiary whose verdict comes from elsewhere.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    ...LINEAGE_MONEY,
    beneficiaries: [child('ben-001', 'SON')],
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

function makeRaw(overrides: Partial<DistributionInputRaw> = {}): DistributionInputRaw {
  return { ...baseRaw(), ...overrides };
}

function makeInput(overrides: Partial<DistributionInputRaw> = {}): DistributionInput {
  return parseDistributionInput(makeRaw(overrides));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Assertion helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A refusal, checked on the thrown code AND the closed-vocabulary discriminator. */
function expectRefusal(run: () => unknown, refusal: string): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected DomainError('SHART_INCOMPLETE') / ${refusal}, got ${
        caught === undefined ? 'no throw (the engine guessed instead of halting)' : String(caught)
      }`,
    );
  }
  expect(caught.code).toBe('SHART_INCOMPLETE');
  const details = caught.details as { readonly refusal?: unknown } | undefined;
  expect(SHART_REFUSALS).toContain(details?.refusal);
  expect(details?.refusal).toBe(refusal);
  return caught;
}

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

/** `[id, 'ENTITLED' | exclusionReason]`, in ascending-id resolution order. */
function verdictSummary(resolution: EntitlementResolution): readonly (readonly [string, string])[] {
  return resolution.resolved.map(
    (entry) => [entry.beneficiaryId, entry.exclusionReason ?? 'ENTITLED'] as const,
  );
}

function amountOf(lines: readonly DistributionLine[], id: string): bigint {
  const found = lines.find((line) => line.beneficiaryId === id);
  if (found === undefined) throw new Error(`no line for "${id}"`);
  return found.entitledMinor as bigint;
}

/** A hand-built line, for driving the invariants directly. */
function fakeLine(
  beneficiaryId: string,
  status: DistributionLine['status'],
  reasonCode: DistributionLine['reasonCode'],
  entitledMinor: bigint,
  basis: Partial<LineBasis> = {},
): DistributionLine {
  return {
    beneficiaryId,
    status,
    entitledMinor: minorOf(entitledMinor) as Minor,
    sharePercent: '0.000000',
    basis: {
      tabaqa: null,
      line: 'ZUHUR',
      branch: null,
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      lineageDepth: null,
      parentId: null,
      lineageLink: null,
      continuationStipulation: 'ZUHUR_ONLY',
      ...basis,
    },
    reasonCode,
    gateFlags: [],
    bankingRefForProceeds: null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R2 · ZUHUR_ONLY — the intermediate-ancestor test, in BOTH directions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R2 · ZUHUR_ONLY — eligible iff every ancestor STRICTLY BETWEEN the waqif and you is a son', () => {
  /**
   * The owner's four worked cases, on one tree, so no test can pass by getting the rule backwards.
   *
   * ⚠⚠ **REBUILT FOR R-FRONTIER: the intermediate ancestors are now DECEASED, and they must be.**
   *
   * This tree had every member alive, on ADR-0009's original wording — *"every living descendant of
   * the waqif is eligible"* — which the product owner **corrected** on 2026-08-03: *"son A's child
   * does not get since Son A is alive. Son A's child only gets anything if son A is dead."*
   * Entitlement sits at the **nearest living point on each line**, so with son-A alive every one of
   * his descendants is excluded `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` and the ẓuhūr/buṭūn boundary —
   * the only thing this tree exists to test — never gets evaluated at all.
   *
   * Killing the intermediate ancestors restores every one of the four boundary cases EXACTLY, and
   * adds the frontier rule underneath them for free: each surviving verdict is now "the line reached
   * this person AND the deed continues it", which is the real two-part test.
   *
   *   waqif
   *    ├── son-A ✝          (depth 1, SON, DEAD)    → excluded on his OWN status; walked THROUGH
   *    │    ├── son-A-dau   (depth 2, DAUGHTER)     → ELIGIBLE: the only intermediate is son-A, a son
   *    │    │    └── ...son (depth 3, SON)          → NOT: son-A-dau is an intermediate DAUGHTER
   *    │    └── son-A-son ✝ (depth 2, SON, DEAD)    → excluded on his own status
   *    │         └── ...dau (depth 3, DAUGHTER)     → ELIGIBLE: son-A, son-A-son are both sons
   *    │              └── ...son (depth 4, SON)     → NOT: son-A-son-dau is an intermediate DAUGHTER
   *    └── dau-B            (depth 1, DAUGHTER)     → ELIGIBLE in her own right
   *         └── dau-B-son   (depth 2, SON)          → NOT: dau-B is an intermediate DAUGHTER
   *
   * ⚠ `ben-dau-B-son` and `ben-son-A-dau-son` are each blocked by BOTH facts at once — their nearest
   * non-son ancestor is also alive — and the engine reports the **line break**, because that reason is
   * permanent under this deed while "wait for your ancestor to die" is temporary. That precedence is
   * engineering's call, not the owner's (`lineageFrontierVerdict`'s TODO(surface)); this tree is what
   * makes it visible.
   */
  function fourGenerationTree(): readonly RawBeneficiary[] {
    return [
      child('ben-son-A', 'SON', { active: false }),
      person('ben-son-A-dau', 2, 'DAUGHTER', 'ben-son-A'),
      person('ben-son-A-dau-son', 3, 'SON', 'ben-son-A-dau'),
      person('ben-son-A-son', 2, 'SON', 'ben-son-A', { active: false }),
      person('ben-son-A-son-dau', 3, 'DAUGHTER', 'ben-son-A-son'),
      person('ben-son-A-son-dau-son', 4, 'SON', 'ben-son-A-son-dau'),
      child('ben-dau-B', 'DAUGHTER'),
      person('ben-dau-B-son', 2, 'SON', 'ben-dau-B'),
    ];
  }

  it("resolves the owner's four boundary cases, and the two deeper ones, exactly", () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [...fourGenerationTree()],
      }),
    );

    expect(resolution.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
    expect(resolution.continuation).toBe('ZUHUR_ONLY');
    expect(verdictSummary(resolution)).toStrictEqual([
      // A daughter of the waqif IS a beneficiary in her own right — she has no intermediate ancestor.
      ['ben-dau-B', 'ENTITLED'],
      // Her son is NOT: the intermediate ancestor is a daughter. (She is also ALIVE and would hold
      // the line anyway — the line break is reported because it is the PERMANENT reason.)
      ['ben-dau-B-son', 'BUTUN_LINE_NOT_CONTINUED'],
      // A deceased ancestor is excluded on his OWN vital status, never on a statement about his line.
      ['ben-son-A', 'BENEFICIARY_INACTIVE'],
      // A son's daughter IS eligible: the only intermediate ancestor (son-A) is a son, and he is dead,
      // so the line has reached her. Her own DAUGHTER link is not read.
      ['ben-son-A-dau', 'ENTITLED'],
      // Her son is not — one intermediate daughter anywhere on the path ends the line.
      ['ben-son-A-dau-son', 'BUTUN_LINE_NOT_CONTINUED'],
      ['ben-son-A-son', 'BENEFICIARY_INACTIVE'],
      // A son's son's daughter IS eligible: both intermediates are sons AND both are dead …
      ['ben-son-A-son-dau', 'ENTITLED'],
      // … and HER son is not. Four generations deep, the rule is unchanged.
      ['ben-son-A-son-dau-son', 'BUTUN_LINE_NOT_CONTINUED'],
    ]);
  });

  it("reads the ANCESTORS' links, never the person's own — the half that is easiest to get backwards", () => {
    // If the implementation tested the beneficiary's OWN link, `ben-son-A-dau` (a DAUGHTER) would be
    // excluded and `ben-dau-B-son` (a SON) would be entitled. Both assertions below would flip.
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [...fourGenerationTree()],
      }),
    );
    expect(verdict(resolution, 'ben-son-A-dau').basis.lineageLink).toBe('DAUGHTER');
    expect(verdict(resolution, 'ben-son-A-dau').entitled).toBe(true);
    expect(verdict(resolution, 'ben-dau-B-son').basis.lineageLink).toBe('SON');
    expect(verdict(resolution, 'ben-dau-B-son').entitled).toBe(false);
  });

  it('names the ancestor that ended the line, so the exclusion is disputable on the record', () => {
    // The commonest lineage exclusion is "your line does not continue under this deed" — a statement
    // about a family member's descent. Telling them WHICH ancestor produced it is the difference
    // between a defensible statement and an assertion.
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [...fourGenerationTree()],
      }),
    );
    const step = resolution.trace.find(
      (entry) =>
        entry.code === 'BENEFICIARY_EXCLUDED' &&
        entry.data?.['beneficiaryId'] === 'ben-son-A-dau-son',
    );
    expect(step?.data?.['reasonCode']).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(step?.data?.['blockingAncestorId']).toBe('ben-son-A-dau');
    // The NEAREST non-son ancestor, not merely any of them.
    expect(step?.data?.['lineageDepth']).toBe('3');
  });

  it("excludes on the member's OWN vital status ahead of the line test, when both apply", () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [
          child('ben-dau', 'DAUGHTER'),
          person('ben-dau-son', 2, 'SON', 'ben-dau', { active: false }),
        ],
      }),
    );
    expect(verdict(resolution, 'ben-dau-son').exclusionReason).toBe('BENEFICIARY_INACTIVE');
  });
});

describe('R2 · ZUHUR_AND_BUTUN — both lines continue, so NO line filter applies at all', () => {
  /**
   * ⚠ **RE-POINTED FOR R-FRONTIER.** The old cohort was a three-deep chain of LIVING members and
   * asserted `excludedCount === 0`. Under the frontier rule a living ancestor holds the line, so that
   * chain now yields two `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` exclusions and the test proved the
   * opposite of its name.
   *
   * The claim is unchanged and is stated on a tree where the frontier has actually moved: a **dead**
   * daughter of the waqif with a living son AND a living daughter, beside a living son of the waqif.
   * All three living members are at the frontier, and `ZUHUR_AND_BUTUN` entitles every one of them —
   * the buṭūn path included, which is the whole content of the stipulation.
   */
  it('entitles every living descendant at the frontier, whatever the links on the path', () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [
          child('ben-dau-B', 'DAUGHTER', { active: false }),
          person('ben-dau-B-son', 2, 'SON', 'ben-dau-B'),
          person('ben-dau-B-dau', 2, 'DAUGHTER', 'ben-dau-B'),
          child('ben-son-A', 'SON'),
        ],
      }),
    );

    expect(resolution.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN');
    expect(resolution.continuation).toBe('ZUHUR_AND_BUTUN');
    // Exactly one exclusion, and it is the dead ancestor's OWN vital status — never a line verdict.
    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-dau-B', 'BENEFICIARY_INACTIVE'],
      ['ben-dau-B-dau', 'ENTITLED'],
      ['ben-dau-B-son', 'ENTITLED'],
      ['ben-son-A', 'ENTITLED'],
    ]);
    for (const entry of resolution.resolved.filter((candidate) => candidate.entitled)) {
      expect(entry.stipulatedWeight).toBe('1');
    }
  });

  it('IS the contrast that proves the stipulation is read: one field, opposite verdicts', () => {
    // The same family. A resolver that ignored `continuationStipulation` would pass one of these two
    // assertions and fail the other.
    //
    // ⚠ ben-dau is DECEASED, and that is what makes the contrast a contrast under R-FRONTIER: with
    // her alive, her son is excluded `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` under BOTH stipulations
    // and the deed term decides nothing. Her death moves the frontier to him — and then, and only
    // then, does `ZUHUR_ONLY` vs `ZUHUR_AND_BUTUN` change who is paid.
    const beneficiaries = [
      child('ben-dau', 'DAUGHTER', { active: false }),
      person('ben-dau-son', 2, 'SON', 'ben-dau'),
    ];

    expect(
      verdictSummary(
        resolveEntitlement(makeInput({ continuationStipulation: 'ZUHUR_ONLY', beneficiaries })),
      ),
    ).toStrictEqual([
      ['ben-dau', 'BENEFICIARY_INACTIVE'],
      ['ben-dau-son', 'BUTUN_LINE_NOT_CONTINUED'],
    ]);

    expect(
      verdictSummary(
        resolveEntitlement(
          makeInput({ continuationStipulation: 'ZUHUR_AND_BUTUN', beneficiaries }),
        ),
      ),
    ).toStrictEqual([
      ['ben-dau', 'BENEFICIARY_INACTIVE'],
      ['ben-dau-son', 'ENTITLED'],
    ]);
  });

  it('never emits BUTUN_LINE_NOT_CONTINUED, on any tree', () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [
          child('ben-d1', 'DAUGHTER'),
          person('ben-d2', 2, 'DAUGHTER', 'ben-d1'),
          person('ben-d3', 3, 'DAUGHTER', 'ben-d2'),
          person('ben-d4', 4, 'SON', 'ben-d3'),
        ],
      }),
    );
    for (const entry of resolution.resolved) {
      expect(entry.exclusionReason).not.toBe('BUTUN_LINE_NOT_CONTINUED');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R1 · a generation's death does NOT block the next generation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R1 · lineage substitution — the dead ancestor is walked THROUGH, and the line advances', () => {
  it("entitles a deceased son's living son (the single biggest change from the tier model)", () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [
          child('ben-son', 'SON', { active: false }),
          person('ben-grandson', 2, 'SON', 'ben-son'),
        ],
      }),
    );

    expect(verdictSummary(resolution)).toStrictEqual([
      ['ben-grandson', 'ENTITLED'],
      ['ben-son', 'BENEFICIARY_INACTIVE'],
    ]);
    // And the survivor takes the WHOLE distributable, not a share of a branch that died.
    expect(resolution.entitledIds).toStrictEqual(['ben-grandson']);
  });

  it('entitles a great-grandchild through TWO dead generations', () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [
          child('ben-g1', 'SON', { active: false }),
          person('ben-g2', 2, 'SON', 'ben-g1', { active: false }),
          person('ben-g3', 3, 'SON', 'ben-g2'),
        ],
      }),
    );
    expect(verdict(resolution, 'ben-g3').entitled).toBe(true);
    expect(resolution.entitledIds).toStrictEqual(['ben-g3']);
  });

  it('never produces a tier-based exclusion code on this path, whatever the depths', () => {
    // The absence IS the rule. Under the tier model ben-deep (ṭabaqa 3) would have been
    // UPPER_TABAQA_EXTANT while ṭabaqa 1 lived, and the ṭabaqa-1 dead branch TABAQA_EXTINCT.
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [
          child('ben-living-1', 'SON'),
          child('ben-dead-1', 'SON', { active: false }),
          person('ben-mid-2', 2, 'SON', 'ben-dead-1', { active: false }),
          person('ben-deep-3', 3, 'SON', 'ben-mid-2'),
        ],
      }),
    );
    for (const entry of resolution.resolved) {
      expect(entry.exclusionReason).not.toBe('UPPER_TABAQA_EXTANT');
      expect(entry.exclusionReason).not.toBe('TABAQA_EXTINCT');
    }
    expect(resolution.entitledIds).toStrictEqual(['ben-deep-3', 'ben-living-1']);
    // `entitledTabaqa` is null: the tier is not the key on this path.
    expect(resolution.entitledTabaqa).toBeNull();
  });

  it('R4 · the SAME family under ORDERED gives the opposite answer — the exception is opt-in', () => {
    // One field changes: `entitlementOrder`. Under al-aʿlā fa-l-aʿlā the living ṭabaqa-1 member
    // excludes the deep survivor entirely; under lineage they share. Both are legal deeds (R4), and
    // this contrast is what proves the engine reads the order rather than assuming one model.
    const beneficiaries = [
      child('ben-living-1', 'SON'),
      child('ben-dead-1', 'SON', { active: false }),
      person('ben-mid-2', 2, 'SON', 'ben-dead-1', { active: false }),
      person('ben-deep-3', 3, 'SON', 'ben-mid-2'),
    ];

    expect(
      verdictSummary(
        resolveEntitlement(
          makeInput({ continuationStipulation: 'ZUHUR_AND_BUTUN', beneficiaries }),
        ),
      ),
    ).toStrictEqual([
      ['ben-dead-1', 'BENEFICIARY_INACTIVE'],
      ['ben-deep-3', 'ENTITLED'],
      ['ben-living-1', 'ENTITLED'],
      ['ben-mid-2', 'BENEFICIARY_INACTIVE'],
    ]);

    expect(
      verdictSummary(
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            continuationStipulation: null,
            beneficiaries,
          }),
        ),
      ).map(([id, outcome]) => [id, outcome] as const),
    ).toStrictEqual([
      ['ben-dead-1', 'BENEFICIARY_INACTIVE'],
      ['ben-deep-3', 'UPPER_TABAQA_EXTANT'],
      ['ben-living-1', 'ENTITLED'],
      ['ben-mid-2', 'UPPER_TABAQA_EXTANT'],
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R3 · per capita — equal per head, and the consequence the owner accepted
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R3 · per capita — equal shares per living eligible head', () => {
  it('publishes an effective weight of exactly one head per eligible member', () => {
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [
          child('ben-a', 'SON', { stipulatedWeight: '10' }),
          child('ben-b', 'DAUGHTER', { stipulatedWeight: '10' }),
          child('ben-c', 'SON', { stipulatedWeight: '10', active: false }),
        ],
      }),
    );
    expect(resolution.resolved.map((entry) => entry.stipulatedWeight)).toStrictEqual([
      '1',
      '1',
      '0',
    ]);
  });

  it('pays a six-child branch exactly SIX TIMES a one-child branch — the accepted consequence', () => {
    // ⚠ THE ARITHMETIC THE OWNER WAS SHOWN AND CHOSE. Per stirpes would give each of the two dead
    // sons' branches half the pool (15,750,000 each); per capita gives each HEAD 1/7.
    //
    // Hand-derived: revenue 35,000,000 − ṣiyāna 0 − operating 0 − fee 3,500,000 (10% of revenue,
    // ⚠ unverified) = 31,500,000 distributable ÷ 7 living eligible heads = 4,500,000 each, exactly.
    //   branch A (6 heads) = 27,000,000     branch B (1 head) = 4,500,000     ratio = 6 : 1
    const beneficiaries: readonly RawBeneficiary[] = [
      child('ben-A', 'SON', { active: false }),
      child('ben-B', 'SON', { active: false }),
      ...['1', '2', '3', '4', '5', '6'].map((n) => person(`ben-A-${n}`, 2, 'SON', 'ben-A')),
      person('ben-B-1', 2, 'SON', 'ben-B'),
    ];

    const result = runDistribution(
      makeRaw({
        ...DIVISIBLE_MONEY,
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [...beneficiaries],
      }),
    );

    expect(result.waterfall.distributableMinor).toBe(DIVISIBLE_DISTRIBUTABLE);
    expect(result.totals.entitledLineCount).toBe(7);
    expect(result.totals.residualMinor).toBe(0n);

    const branchA = ['1', '2', '3', '4', '5', '6'].map((n) => amountOf(result.lines, `ben-A-${n}`));
    for (const amount of branchA) expect(amount).toBe(4_500_000n);
    const branchATotal = branchA.reduce((sum, amount) => sum + amount, 0n);
    const branchBTotal = amountOf(result.lines, 'ben-B-1');

    expect(branchATotal).toBe(27_000_000n);
    expect(branchBTotal).toBe(4_500_000n);
    expect(branchATotal).toBe(branchBTotal * 6n);
    // NOT per stirpes: neither branch received half the pool.
    expect(branchATotal).not.toBe(DIVISIBLE_DISTRIBUTABLE / 2n);
  });

  /**
   * ⚠ **RE-POINTED FOR R-FRONTIER — the branch now has TWO children, and that is what makes the test
   * work at all.**
   *
   * With one child per branch the frontier rule makes the head count identical before and after the
   * death (the child simply replaces the parent), so per capita and per stirpes give the SAME answer
   * and the discriminator vanishes. The old body asserted a change in ben-B's amount that no longer
   * happens, and asserted `ben-A-1` was paid while its father was alive — which R-FRONTIER refuses.
   *
   * Two children restore the discriminator, and reverse its direction in a way worth stating:
   * **a death can now LOWER a survivor in another branch**, because a death can ADD heads.
   */
  it("does NOT pass a deceased member's share down their own branch as a block", () => {
    function run(aAlive: boolean) {
      return runDistribution(
        makeRaw({
          ...DIVISIBLE_MONEY,
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          beneficiaries: [
            child('ben-A', 'SON', { active: aAlive }),
            person('ben-A-1', 2, 'SON', 'ben-A'),
            person('ben-A-2', 2, 'SON', 'ben-A'),
            child('ben-B', 'SON'),
          ],
        }),
      );
    }
    const withA = run(true);
    const withoutA = run(false);

    // ── withA · ben-A is alive and HOLDS his line, so his two children wait. Two heads.
    //    31,500,000 ÷ 2 = 15,750,000 exactly, residual 0.
    expect(amountOf(withA.lines, 'ben-A')).toBe(15_750_000n);
    expect(amountOf(withA.lines, 'ben-B')).toBe(15_750_000n);
    expect(amountOf(withA.lines, 'ben-A-1')).toBe(0n);
    expect(amountOf(withA.lines, 'ben-A-2')).toBe(0n);

    // ── withoutA · ben-A dies and BOTH children come to the frontier. Three heads.
    //    31,500,000 ÷ 3 = 10,500,000 exactly, residual 0.
    expect(amountOf(withoutA.lines, 'ben-A-1')).toBe(10_500_000n);
    expect(amountOf(withoutA.lines, 'ben-A-2')).toBe(10_500_000n);
    expect(amountOf(withoutA.lines, 'ben-B')).toBe(10_500_000n);

    // THE DISCRIMINATOR. Per stirpes, ben-A's 15,750,000 would stay in ben-A's branch and split
    // 7,875,000 / 7,875,000, leaving ben-B untouched on 15,750,000. Per capita it does not: ben-B —
    // a different branch entirely — FALLS by 5,250,000 halalas (SAR 52,500) because two heads
    // replaced one. The owner chose per capita having been shown this (ADR-0009 R3).
    expect(amountOf(withA.lines, 'ben-B') - amountOf(withoutA.lines, 'ben-B')).toBe(5_250_000n);
    expect(amountOf(withoutA.lines, 'ben-A-1')).toBe(amountOf(withoutA.lines, 'ben-B'));
    // …and the branch collectively gains, which per stirpes would not allow either:
    // 10,500,000 × 2 = 21,000,000 > 15,750,000.
    expect(amountOf(withoutA.lines, 'ben-A-1') + amountOf(withoutA.lines, 'ben-A-2')).toBe(
      21_000_000n,
    );
  });

  it('splits an indivisible pool with a spread of at most ONE halala (largest remainder, I-L1)', () => {
    // Hand-derived: 27,500,000 ÷ 3 = 9,166,666 remainder 2, so the two LOWEST ids take one extra
    // halala each (§08's ascending-beneficiaryId tie-break).
    const result = runDistribution(
      makeRaw({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [child('ben-1', 'SON'), child('ben-2', 'SON'), child('ben-3', 'SON')],
      }),
    );

    expect(result.waterfall.distributableMinor).toBe(LINEAGE_DISTRIBUTABLE);
    expect(result.totals.residualMinor).toBe(2n);
    expect(amountOf(result.lines, 'ben-1')).toBe(9_166_667n);
    expect(amountOf(result.lines, 'ben-2')).toBe(9_166_667n);
    expect(amountOf(result.lines, 'ben-3')).toBe(9_166_666n);
    expect(result.invariantsChecked).toContain('I-L1');
  });
});

describe('R3 · the deed weight is NOT applied — and never silently dropped', () => {
  function unequalWeights(): DistributionInputRaw {
    return makeRaw({
      continuationStipulation: 'ZUHUR_AND_BUTUN',
      beneficiaries: [
        child('ben-1', 'SON', { stipulatedWeight: '60' }),
        child('ben-2', 'SON', { stipulatedWeight: '30' }),
        child('ben-3', 'DAUGHTER', { stipulatedWeight: '10' }),
      ],
    });
  }

  it('pays equal shares even when the deed allocated 60/30/10', () => {
    const result = runDistribution(unequalWeights());
    // Per the deed's own figures this would be 16,500,000 / 8,250,000 / 2,750,000.
    expect(amountOf(result.lines, 'ben-1')).toBe(9_166_667n);
    expect(amountOf(result.lines, 'ben-2')).toBe(9_166_667n);
    expect(amountOf(result.lines, 'ben-3')).toBe(9_166_666n);
  });

  it('raises STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA and names every skipped figure', () => {
    const resolution = resolveEntitlement(parseDistributionInput(unequalWeights()));

    expect(resolution.flags).toStrictEqual(['STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA']);
    const skipped = resolution.trace.filter(
      (entry) => entry.code === 'STIPULATED_WEIGHT_NOT_APPLIED',
    );
    expect(skipped.map((entry) => entry.data?.['beneficiaryId'])).toStrictEqual([
      'ben-1',
      'ben-2',
      'ben-3',
    ]);
    expect(skipped.map((entry) => entry.data?.['deedWeight'])).toStrictEqual(['60', '30', '10']);
    for (const entry of skipped) {
      expect(entry.data?.['appliedWeight']).toBe('1');
      expect(entry.data?.['rule']).toBe('per capita — ADR-0009 R3');
    }
  });

  it("preserves the deed's own figure on the source record — per capita is not a rewrite of the deed", () => {
    const resolution = resolveEntitlement(parseDistributionInput(unequalWeights()));
    expect(verdict(resolution, 'ben-1').source.stipulatedWeight).toBe('60');
    expect(verdict(resolution, 'ben-1').stipulatedWeight).toBe('1');
  });

  it('does NOT raise the flag when the deed already allocated equal shares, in any spelling', () => {
    // A flag that fires on every run tells a reader nothing. '10', '10.0' and '010.00' are one figure,
    // compared by a string-only canonicaliser (no Decimal in the resolver — half of I6's proof).
    const resolution = resolveEntitlement(
      parseDistributionInput(
        makeRaw({
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          beneficiaries: [
            child('ben-1', 'SON', { stipulatedWeight: '10' }),
            child('ben-2', 'SON', { stipulatedWeight: '10.0' }),
            child('ben-3', 'SON', { stipulatedWeight: '010.00' }),
          ],
        }),
      ),
    );
    expect(resolution.flags).toStrictEqual([]);
    expect(resolution.trace.map((entry) => entry.code)).not.toContain(
      'STIPULATED_WEIGHT_NOT_APPLIED',
    );
  });

  it("ignores an EXCLUDED member's weight when deciding whether the flag is owed", () => {
    // The flag is about what per capita overrode for the people who are actually being paid.
    const resolution = resolveEntitlement(
      parseDistributionInput(
        makeRaw({
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          beneficiaries: [
            child('ben-1', 'SON', { stipulatedWeight: '10' }),
            child('ben-2', 'SON', { stipulatedWeight: '10' }),
            child('ben-3', 'SON', { stipulatedWeight: '99', active: false }),
          ],
        }),
      ),
    );
    expect(resolution.flags).toStrictEqual([]);
  });

  it('⚠ PAYS a member whose recorded deed weight is ZERO — open question 2, pinned deliberately', () => {
    // ⚠ SURFACED, NOT DECIDED (ADR-0009 open question 2, the sharpest edge of R3). Because weights
    // are not applied at all, a zero deed weight no longer excludes — so this moves money to someone
    // the deed's own recorded figure gave nothing. Under ORDERED/SHARED the identical record is
    // excluded ZERO_STIPULATED_WEIGHT, so the two paths now disagree about the same fact.
    //
    // This test exists so that changing it is a deliberate act with a recorded decision behind it.
    const beneficiaries = [
      child('ben-1', 'SON', { stipulatedWeight: '10' }),
      child('ben-2', 'SON', { stipulatedWeight: '0' }),
    ];

    const lineage = resolveEntitlement(
      parseDistributionInput(
        makeRaw({ continuationStipulation: 'ZUHUR_AND_BUTUN', beneficiaries }),
      ),
    );
    expect(verdict(lineage, 'ben-2').entitled).toBe(true);
    expect(verdict(lineage, 'ben-2').stipulatedWeight).toBe('1');
    // Half the pool, to someone the deed gave nothing: 27,500,000 ÷ 2 = 13,750,000.
    const result = runDistribution(
      makeRaw({ continuationStipulation: 'ZUHUR_AND_BUTUN', beneficiaries }),
    );
    expect(amountOf(result.lines, 'ben-2')).toBe(13_750_000n);

    const ordered = resolveEntitlement(
      parseDistributionInput(
        makeRaw({ entitlementOrder: 'ORDERED', continuationStipulation: null, beneficiaries }),
      ),
    );
    expect(verdict(ordered, 'ben-2').exclusionReason).toBe('ZERO_STIPULATED_WEIGHT');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ṭabaqa is DERIVED — two sides that must agree, each testing the other
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('ṭabaqa is derived from lineage depth and cross-checked, never trusted', () => {
  it('derives depth 1 for a child of the waqif and n+1 down the chain', () => {
    const lineage = buildLineage(
      makeInput({
        beneficiaries: [
          child('ben-1', 'SON'),
          person('ben-2', 2, 'SON', 'ben-1'),
          person('ben-3', 3, 'DAUGHTER', 'ben-2'),
        ],
      }),
    );
    expect([...lineage.depthById.entries()].sort()).toStrictEqual([
      ['ben-1', 1],
      ['ben-2', 2],
      ['ben-3', 3],
    ]);
    // Proper ancestors, nearest first, EXCLUDING the person — which is what makes the ZUHUR_ONLY test
    // "strictly between the waqif and them".
    expect(lineage.ancestorsById.get('ben-3')).toStrictEqual(['ben-2', 'ben-1']);
    expect(lineage.ancestorsById.get('ben-1')).toStrictEqual([]);
  });

  it("reports the DERIVED depth on the basis, alongside the register's ṭabaqa", () => {
    const resolution = resolveEntitlement(
      makeInput({
        beneficiaries: [child('ben-1', 'SON'), person('ben-2', 2, 'SON', 'ben-1')],
      }),
    );
    expect(verdict(resolution, 'ben-2').lineageDepth).toBe(2);
    expect(verdict(resolution, 'ben-2').basis).toStrictEqual({
      tabaqa: 2,
      line: 'ZUHUR',
      branch: null,
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      lineageDepth: 2,
      parentId: 'ben-1',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    });
  });

  it('HALTS when the declared ṭabaqa disagrees with the derived depth', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [
              child('ben-1', 'SON'),
              // Recorded as ṭabaqa 5 but the parent edge puts them at depth 2.
              person('ben-2', 5, 'SON', 'ben-1'),
            ],
          }),
        ),
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );
    expect(error.details).toMatchObject({
      beneficiaryId: 'ben-2',
      suppliedTabaqa: '5',
      derivedDepth: 2,
    });
  });

  it('HALTS on a recorded descendant with tabaqa null — a record that contradicts itself', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [child('ben-1', 'SON', { tabaqa: null } as Partial<RawBeneficiary>)],
          }),
        ),
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );
    expect(error.details).toMatchObject({ suppliedTabaqa: 'null', derivedDepth: 1 });
  });

  it('cross-checks under ORDERED and SHARED too — descent is a fact about the person', () => {
    for (const order of ['ORDERED', 'SHARED'] as const) {
      expectRefusal(
        () =>
          resolveEntitlement(
            makeInput({
              entitlementOrder: order,
              continuationStipulation: null,
              beneficiaries: [child('ben-1', 'SON'), person('ben-2', 9, 'SON', 'ben-1')],
            }),
          ),
        'TABAQA_MISMATCHES_LINEAGE_DEPTH',
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The lineage graph must be legible, integral and rooted at the waqif
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('buildLineage — every way the graph can be invalid is REFUSED, never repaired', () => {
  it('LINEAGE_LINK_UNRECOGNISED · a link outside {SON, DAUGHTER} arrives as data and halts', () => {
    // The field is a `z.string()` precisely so this halts with the refusal that names it rather than
    // as a DISTRIBUTION_INPUT_INVALID shape error naming a zod path.
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [
              child('ben-1', 'SON'),
              {
                ...child('ben-2', 'SON'),
                lineageLink: 'MALE_HEIR',
                parentId: 'ben-1',
                tabaqa: 2,
              },
            ],
          }),
        ),
      'LINEAGE_LINK_UNRECOGNISED',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'ben-2', received: 'MALE_HEIR' });
  });

  it('LINEAGE_LINK_MISSING · under lineage, a FAMILY member with no link cannot be tested', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [
              child('ben-1', 'SON'),
              { ...child('ben-2', 'SON'), lineageLink: null, tabaqa: null },
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'ben-2', kind: 'FAMILY' });
  });

  it("LINEAGE_LINK_MISSING · a CATEGORY_ONLY placeholder too — ⚠ engineering's call, not the owner's", () => {
    // ⚠ SURFACED (ADR-0009 open question 5). A per-capita denominator is exquisitely sensitive to head
    // count: one unnamed grandchild counted or not counted changes EVERY other beneficiary's amount.
    // Refusing is the safe direction, but "excluded pending identification" is equally defensible and
    // is the owner's call. Pinned so the choice is visible rather than inherited.
    expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [
              child('ben-1', 'SON'),
              {
                ...child('ben-cat', 'SON'),
                kind: 'CATEGORY_ONLY',
                lineageLink: null,
                parentId: null,
                tabaqa: null,
                line: 'NA',
                category: 'unnamed grandchildren',
              },
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );
  });

  /**
   * ⚠⚠ **INVERTED BY R6 — this test asserted the exact opposite, and the input is kept verbatim.**
   *
   * It read: *"does NOT require the link under ORDERED or SHARED — R4 keeps those deeds working
   * unchanged"*, and `buildLineage` did not throw. The product owner answered ADR-0009's open
   * question 10 on 2026-08-03: **require the parent on every deed.** Eligibility comes from descent,
   * so the descent must be on record whatever rule the deed uses, and nobody the engine cannot place
   * in the family tree may be paid. `LINEAGE_LINK_MISSING` is no longer gated on the order.
   *
   * R4 itself is untouched — `ORDERED` remains the opt-in exception and still resolves by ṭabaqa —
   * but "those deeds working unchanged" was never part of R4. It was an inference about what R6 would
   * leave alone, and it was wrong. What that inference cost is measured in `g9-adversarial.test.ts`'s
   * inverted DEFECT-A1 block: 78,000,000 of 78,000,000 halalas to an unplaceable member.
   */
  it('INVERTED: the link IS required under ORDERED and SHARED too — R6, on every deed', () => {
    for (const order of ['ORDERED', 'SHARED'] as const) {
      const error = expectRefusal(
        () =>
          buildLineage(
            makeInput({
              entitlementOrder: order,
              continuationStipulation: null,
              beneficiaries: [{ ...child('ben-1', 'SON'), lineageLink: null, tabaqa: 1 }],
            }),
          ),
        'LINEAGE_LINK_MISSING',
      );
      // The refusal names the order it was raised under, so the message is not a lineage-only one
      // leaking onto a tier deed.
      expect(error.details).toMatchObject({ beneficiaryId: 'ben-1', entitlementOrder: order });
    }
  });

  it('LINEAGE_EDGE_ON_NON_DESCENDANT · a parent edge with no link is a self-contradicting record', () => {
    // Membership in the tree is decided by the LINK, never by the parent edge — precisely so that
    // `parentId: null` has exactly one meaning ("a child of the waqif", not "unknown").
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            entitlementOrder: 'SHARED',
            continuationStipulation: null,
            beneficiaries: [
              // ⚠ ben-1 now records its OWN link. It used to be edgeless too, which under R6 makes
              // IT the first refusal (`LINEAGE_LINK_MISSING`, id-sorted order) and this test would
              // have proved the wrong rule. Only ben-2 carries the self-contradiction under test.
              child('ben-1', 'SON'),
              { ...child('ben-2', 'SON'), lineageLink: null, parentId: 'ben-1', tabaqa: 2 },
            ],
          }),
        ),
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'ben-2', parentId: 'ben-1' });
  });

  it('LINEAGE_EDGE_ON_NON_DESCENDANT · a charitable jiha cannot hold a place in the family tree', () => {
    expectRefusal(
      () =>
        buildLineage(
          makeInput({
            waqfType: 'PUBLIC_CHARITABLE',
            entitlementOrder: 'SHARED',
            continuationStipulation: null,
            beneficiaries: [
              {
                ...child('ben-jiha', 'SON'),
                kind: 'CHARITABLE_JIHA',
                line: 'NA',
                tabaqa: null,
                lineageLink: 'SON',
                parentId: null,
              },
            ],
          }),
        ),
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    );
  });

  it('LINEAGE_PARENT_UNKNOWN · a dangling parentId names both ends so it can be acted on', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [child('ben-1', 'SON'), person('ben-2', 2, 'SON', 'ben-nobody')],
          }),
        ),
      'LINEAGE_PARENT_UNKNOWN',
    );
    // A refusal nobody can act on is half a refusal.
    expect(error.details).toMatchObject({ beneficiaryId: 'ben-2', missingParentId: 'ben-nobody' });
  });

  it('LINEAGE_CYCLE · the 1-cycle (own parent)', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({ beneficiaries: [{ ...child('ben-1', 'SON'), parentId: 'ben-1' }] }),
        ),
      'LINEAGE_CYCLE',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'ben-1' });
  });

  it('LINEAGE_CYCLE · a longer cycle terminates the walk and reports the ids on it', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            beneficiaries: [
              { ...person('ben-1', 1, 'SON', 'ben-3') },
              { ...person('ben-2', 2, 'SON', 'ben-1') },
              { ...person('ben-3', 3, 'SON', 'ben-2') },
            ],
          }),
        ),
      'LINEAGE_CYCLE',
    );
    const cycle =
      (error.details as { readonly cycle?: readonly string[] } | undefined)?.cycle ?? [];
    expect(cycle.length).toBeGreaterThan(1);
    expect(cycle).toContain('ben-1');
  });

  it('LINEAGE_ROOTED_OUTSIDE_THE_WAQIF · a subtree hanging off someone not in the tree', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            entitlementOrder: 'SHARED',
            continuationStipulation: null,
            beneficiaries: [
              // Not in the graph: no lineageLink. So the chain above ben-2 does not reach the waqif.
              //
              // ⚠ It is a `CHARITABLE_JIHA`, and it has to be: under R6 an edgeless `FAMILY` member
              // is refused `LINEAGE_LINK_MISSING` first (id-sorted, `ben-root` before `ben-2`), so
              // the ROOTED_OUTSIDE case would never be reached and this test would pass on the wrong
              // refusal. A jiha is the one kind that may legally sit outside the tree — which is
              // exactly what makes hanging a subtree off it the shape this refusal exists for.
              {
                ...child('ben-root', 'SON'),
                kind: 'CHARITABLE_JIHA',
                lineageLink: null,
                tabaqa: null,
                line: 'NA',
              },
              person('ben-2', 2, 'SON', 'ben-root'),
            ],
          }),
        ),
      'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'ben-2', rootedAtId: 'ben-root' });
  });

  it('BENEFICIARY_ID_DUPLICATED · the walk is keyed on the id, so a duplicate is ambiguous', () => {
    // `assertInputConsistency` already refuses this at the contract door with
    // DISTRIBUTION_INPUT_INVALID; that behaviour is UNCHANGED and is asserted here too. This refusal
    // covers a caller reaching Stage 2 with a hand-built input, which the suite does constantly.
    const raw = makeRaw({
      beneficiaries: [child('ben-1', 'SON'), child('ben-1', 'DAUGHTER')],
    });
    let contractDoor: unknown;
    try {
      parseDistributionInput(raw);
    } catch (error) {
      contractDoor = error;
    }
    expect(isDomainError(contractDoor) && contractDoor.code).toBe('DISTRIBUTION_INPUT_INVALID');

    // Bypassing the door — the shape the resolver has to defend itself against.
    const bypassed = {
      ...parseDistributionInput(makeRaw({ beneficiaries: [child('ben-1', 'SON')] })),
      beneficiaries: parseDistributionInput(
        makeRaw({ beneficiaries: [child('ben-1', 'SON'), child('ben-2', 'DAUGHTER')] }),
      ).beneficiaries.map((beneficiary) => ({ ...beneficiary, id: 'ben-1' })),
    } as DistributionInput;
    expectRefusal(() => buildLineage(bypassed), 'BENEFICIARY_ID_DUPLICATED');
  });

  it('accepts a wide, deep, legal tree — the refusals are not simply "refuse everything"', () => {
    // Every refusal above would be worthless if the legal shape did not pass. Four generations, two
    // roots, mixed links, an inactive middle generation.
    expect(() =>
      resolveEntitlement(
        makeInput({
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          beneficiaries: [
            child('ben-a', 'SON'),
            child('ben-b', 'DAUGHTER'),
            person('ben-a-1', 2, 'SON', 'ben-a', { active: false }),
            person('ben-a-2', 2, 'DAUGHTER', 'ben-a'),
            person('ben-a-1-1', 3, 'DAUGHTER', 'ben-a-1'),
            person('ben-a-1-1-1', 4, 'SON', 'ben-a-1-1'),
            person('ben-b-1', 2, 'SON', 'ben-b'),
          ],
        }),
      ),
    ).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The continuation stipulation is required on this path, with NO default
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('LINEAGE_CONTINUATION requires the continuation stipulation', () => {
  it('halts when it is absent — the engine does not choose which lines a founder continued', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({ continuationStipulation: null, beneficiaries: [child('ben-1', 'SON')] }),
        ),
      'CONTINUATION_STIPULATION_UNRECOGNISED',
    );
  });

  it('halts through runDistribution too, emitting no run at all', () => {
    let thrown: unknown;
    try {
      runDistribution(makeRaw({ continuationStipulation: 'zuhur_only' }));
    } catch (error) {
      thrown = error;
    }
    expect(isDomainError(thrown) && thrown.code).toBe('SHART_INCOMPLETE');
    expect((thrown as DomainError).details as { readonly refusal?: unknown }).toMatchObject({
      refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED',
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The invariants that carry the rule (I5's lineage branch, I-L1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('I-L1 · per-capita equality is asserted, not merely intended', () => {
  it('is reported as checked on a lineage monetary run, and NOT on an ORDERED one', () => {
    const lineageRun = runDistribution(
      makeRaw({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [child('ben-1', 'SON'), child('ben-2', 'SON')],
      }),
    );
    expect(lineageRun.invariantsChecked).toContain('I-L1');

    const orderedRun = runDistribution(
      makeRaw({
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        beneficiaries: [child('ben-1', 'SON'), child('ben-2', 'SON')],
      }),
    );
    // An honest list: I-L1 makes no claim about a deed-weighted run, so it is not reported.
    expect(orderedRun.invariantsChecked).not.toContain('I-L1');
    const notAsserted = orderedRun.computationTrace.find(
      (entry) => entry.code === 'INVARIANTS_ASSERTED',
    )?.data?.['notChecked'];
    expect(notAsserted).toContain('I-L1');
  });

  it('THROWS on a spread of two halalas — the claim is load-bearing (mutation-verified)', () => {
    // ⚠ MUTATION-VERIFIED by hand: changing `PER_CAPITA_WEIGHT` in `resolver.ts` from '1' to '2' for
    // one member makes `runDistribution` throw DISTRIBUTION_INVARIANT_BREACH / I-L1; restoring it
    // byte-identically makes this suite green again. This test is the same failure, driven directly on
    // the assertion so it cannot be silenced by a change elsewhere.
    expect(() =>
      assertPerCapitaEquality([
        fakeLine('ben-1', 'PAID', null, 100n),
        fakeLine('ben-2', 'PAID', null, 98n),
      ]),
    ).toThrowError(/I-L1/);
  });

  it('accepts a spread of exactly one halala — the largest-remainder residual, not an error', () => {
    expect(() =>
      assertPerCapitaEquality([
        fakeLine('ben-1', 'PAID', null, 100n),
        fakeLine('ben-2', 'WITHHELD', null, 99n),
      ]),
    ).not.toThrow();
  });

  it('ignores EXCLUDED lines, which carry 0 and are not in the cohort that shares', () => {
    expect(() =>
      assertPerCapitaEquality([
        fakeLine('ben-1', 'PAID', null, 100n),
        fakeLine('ben-2', 'EXCLUDED', 'BUTUN_LINE_NOT_CONTINUED', 0n),
      ]),
    ).not.toThrow();
  });
});

describe('I5 · the lineage branch — the contrast AND the positive ẓuhūr claim', () => {
  function zuhurOnlyInput(): DistributionInput {
    return makeInput({
      continuationStipulation: 'ZUHUR_ONLY',
      beneficiaries: [
        child('ben-dau', 'DAUGHTER'),
        person('ben-dau-son', 2, 'SON', 'ben-dau'),
        child('ben-son', 'SON'),
      ],
    });
  }

  it('rejects a tier-based exclusion code on a lineage run (the contrast)', () => {
    // Without this branch, a resolver that silently kept applying the ṭabaqa test under lineage would
    // satisfy I5 — the same hole the SHARED branch exists to close.
    expect(() =>
      assertOrderedExclusion('LINEAGE_CONTINUATION', zuhurOnlyInput(), [
        fakeLine('ben-dau-son', 'EXCLUDED', 'UPPER_TABAQA_EXTANT', 0n),
      ]),
    ).toThrowError(/I5/);
  });

  it('requires the buṭūn exclusion where the deed does not continue the line (the positive claim)', () => {
    // A resolver that FORGOT the ZUHUR_ONLY filter would emit ben-dau-son as PAID. I5 recomputes the
    // parent graph from the input and refuses the run.
    expect(() =>
      assertOrderedExclusion('LINEAGE_CONTINUATION', zuhurOnlyInput(), [
        fakeLine('ben-dau-son', 'PAID', null, 10n),
      ]),
    ).toThrowError(/BUTUN_LINE_NOT_CONTINUED/);
  });

  it('refuses the code on a line whose ancestors ARE all sons — the other direction', () => {
    expect(() =>
      assertOrderedExclusion('LINEAGE_CONTINUATION', zuhurOnlyInput(), [
        fakeLine('ben-son', 'EXCLUDED', 'BUTUN_LINE_NOT_CONTINUED', 0n),
      ]),
    ).toThrowError(/I5/);
  });

  it('refuses the code anywhere under ZUHUR_AND_BUTUN, where it can never apply', () => {
    // ⚠ ben-dau is DECEASED, and must be. With her alive the recomputation blocks ben-dau-son on
    // `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` (R-FRONTIER), so I5 still throws — but for holding the
    // WRONG code rather than for holding a code that cannot exist under this stipulation, and the
    // ZUHUR_AND_BUTUN-specific message never fires. Killing her makes the chain block on NOTHING,
    // which is the state in which `BUTUN_LINE_NOT_CONTINUED` is the impossible claim under test.
    const input = makeInput({
      continuationStipulation: 'ZUHUR_AND_BUTUN',
      beneficiaries: [
        child('ben-dau', 'DAUGHTER', { active: false }),
        person('ben-dau-son', 2, 'SON', 'ben-dau'),
      ],
    });
    // ⚠ The stipulation reaches the reader as PROSE in the message ("both sons and daughters
    // continue indefinitely under this deed") and as the machine value in `details`. Matching the
    // literal string in the message was matching an implementation detail of the wording; the claim
    // is that the breach names WHICH deed term makes the code impossible, so both are asserted.
    let thrown: unknown;
    try {
      assertOrderedExclusion('LINEAGE_CONTINUATION', input, [
        fakeLine('ben-dau-son', 'EXCLUDED', 'BUTUN_LINE_NOT_CONTINUED', 0n),
      ]);
    } catch (error) {
      thrown = error;
    }
    if (!isDomainError(thrown)) throw new Error(`expected an I5 breach, got ${String(thrown)}`);
    expect(thrown.message).toMatch(/I5/);
    expect(thrown.message).toMatch(/both sons and daughters continue indefinitely/);
    expect(thrown.details).toMatchObject({
      beneficiaryId: 'ben-dau-son',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
      actualReasonCode: 'BUTUN_LINE_NOT_CONTINUED',
    });
  });

  it("does NOT consult an ancestor's vital status — an invariant that did would re-import the tier model", () => {
    // ben-son is dead; his son's chain is all-SON, so the line continues (R1). If the recomputation
    // vital-tested ancestors it would demand an exclusion here and fire on a perfectly legal run.
    const input = makeInput({
      continuationStipulation: 'ZUHUR_ONLY',
      beneficiaries: [
        child('ben-son', 'SON', { active: false }),
        person('ben-grandson', 2, 'SON', 'ben-son'),
      ],
    });
    expect(() =>
      assertOrderedExclusion('LINEAGE_CONTINUATION', input, [
        fakeLine('ben-son', 'EXCLUDED', 'BENEFICIARY_INACTIVE', 0n),
        fakeLine('ben-grandson', 'PAID', null, 10n),
      ]),
    ).not.toThrow();
  });

  it('refuses an emitted lineage run whose continuation term is not one of the two', () => {
    // The term is re-narrowed here rather than taken from the resolution, so a run that reached the
    // invariants with an unreadable term is itself a breach: the resolver should have refused it.
    const bent = {
      ...zuhurOnlyInput(),
      continuationStipulation: 'ZUHUR_MAYBE',
    } as DistributionInput;
    expect(() =>
      assertOrderedExclusion('LINEAGE_CONTINUATION', bent, [
        fakeLine('ben-son', 'PAID', null, 10n),
      ]),
    ).toThrowError(/I5/);
  });

  it('passes on the real run, end to end, with I5 reported as checked', () => {
    const result = runDistribution(
      makeRaw({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [
          child('ben-dau', 'DAUGHTER'),
          person('ben-dau-son', 2, 'SON', 'ben-dau'),
          child('ben-son', 'SON'),
        ],
      }),
    );
    expect(result.invariantsChecked).toContain('I5');
    expect(result.invariantsChecked).toContain('I-L1');
    expect(result.entitlementRule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
    // 27,500,000 ÷ 2 eligible heads = 13,750,000 each, exactly. The excluded grandson gets 0.
    expect(amountOf(result.lines, 'ben-dau')).toBe(13_750_000n);
    expect(amountOf(result.lines, 'ben-son')).toBe(13_750_000n);
    expect(amountOf(result.lines, 'ben-dau-son')).toBe(0n);
    expect(result.lines.find((line) => line.beneficiaryId === 'ben-dau-son')?.reasonCode).toBe(
      'BUTUN_LINE_NOT_CONTINUED',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Determinism (I8) and the payability separation (I6) on the lineage path
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the lineage path keeps I8 and I6', () => {
  const tree: readonly RawBeneficiary[] = [
    child('ben-a', 'SON'),
    child('ben-b', 'DAUGHTER'),
    person('ben-a-1', 2, 'DAUGHTER', 'ben-a'),
    person('ben-b-1', 2, 'SON', 'ben-b'),
    person('ben-a-1-1', 3, 'SON', 'ben-a-1'),
  ];

  it('I8 · resolves identically when the cohort is handed in REVERSED', () => {
    // The property generator reverses the cohort for half of all draws, so any dependence on input
    // order — a `Map` iteration, an unsorted ancestor walk — would make a payout host-dependent.
    const forward = resolveEntitlement(makeInput({ beneficiaries: [...tree] }));
    const reversed = resolveEntitlement(makeInput({ beneficiaries: [...tree].reverse() }));
    expect(reversed).toStrictEqual(forward);
  });

  it('I8 · the whole RUN is byte-identical under reversal, computationTrace included', () => {
    const forward = runDistribution(makeRaw({ beneficiaries: [...tree] }));
    const reversed = runDistribution(makeRaw({ beneficiaries: [...tree].reverse() }));
    expect(reversed).toStrictEqual(forward);
  });

  it('I6 · flipping every payability field leaves the entitlement verdict untouched', () => {
    // On this path the stakes are higher than under ORDERED: a gate leaking into the verdict would
    // change the HEAD COUNT, and per capita means every other beneficiary's amount moves with it.
    const clean = resolveEntitlement(makeInput({ beneficiaries: [...tree] }));
    const gated = resolveEntitlement(
      makeInput({
        beneficiaries: tree.map((beneficiary) => ({
          ...beneficiary,
          verificationStatus: 'UNVERIFIED' as const,
          kycLastRefreshed: null,
          residency: 'CROSS_BORDER' as const,
          category: null,
          disbursingEntity: { name: 'Fake Jiha', licensed: false, licenceExpiry: '2020-01-01' },
          bankingRefForProceeds: null,
        })),
      }),
    );

    expect(gated.entitledIds).toStrictEqual(clean.entitledIds);
    expect(gated.excludedCount).toBe(clean.excludedCount);
    expect(gated.trace).toStrictEqual(clean.trace);
    expect(gated.resolved.map((entry) => entry.stipulatedWeight)).toStrictEqual(
      clean.resolved.map((entry) => entry.stipulatedWeight),
    );
  });

  it('keeps the trace free of identifying labels — ids only on the hashed audit surface (AT-16)', () => {
    const branch = 'ZZ-IDENTIFYING-FAMILY-BRANCH-ZZ';
    const resolution = resolveEntitlement(
      makeInput({
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: [
          child('ben-dau', 'DAUGHTER', { branch }),
          person('ben-dau-son', 2, 'SON', 'ben-dau', { branch }),
        ],
      }),
    );
    expect(verdict(resolution, 'ben-dau-son').basis.branch).toBe(branch);
    expect(JSON.stringify(resolution.trace)).not.toContain(branch);
    // The lineage edge adds no PII: `parentId` is an id, and there is no `name` field at all.
    expect(JSON.stringify(resolution.trace)).toContain('ben-dau');
  });
});
