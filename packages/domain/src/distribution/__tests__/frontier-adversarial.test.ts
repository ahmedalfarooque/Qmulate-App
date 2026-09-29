/**
 * `distribution/frontier-adversarial.test.ts` — an attack on R-FRONTIER and its per-capita arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `lineage-entitlement.test.ts` is the *specification* of R-FRONTIER: one named test per row of the
 * owner's worked-consequences table. This file assumes that specification is implemented **subtly
 * wrong** and goes looking for the seam — the walk's two boundaries, the interaction with
 * `ZUHUR_ONLY`, the full truth table of vital status, the residual after the cohort shrank, the
 * blast radius of one death, and the purity of the whole path.
 *
 * Everything here **drives behaviour**. There is no assertion about the shape of the source, and no
 * assertion that stays green when the rule it names is deleted — every claim listed in the
 * "mutation-verified" block below was checked by breaking `resolver.ts` and watching a *named* test
 * in this file go red.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE UNDER ATTACK (product owner, 2026-08-03)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Under `LINEAGE_CONTINUATION`, **b** is entitled iff
 *
 *   1. `b.active === true`, **and**
 *   2. every ancestor **strictly between** b and the waqif is deceased, **and**
 *   3. under `ZUHUR_ONLY` only: every such ancestor is a `SON`.
 *
 * The owner's sentence: *"son A's child does not get since Son A is alive. Son A's child only gets
 * anything if son A is dead."*
 *
 * "Strictly between" is doing two jobs at once and each is an off-by-one waiting to happen:
 *
 *  · **At the bottom** — b's OWN vital status is condition 1, never condition 2. A living b whose
 *    ancestors are all dead must be ENTITLED, not "blocked by themself".
 *  · **At the top** — the waqif is not an ancestor in this sense. A living child of the waqif has an
 *    EMPTY proper-ancestor chain and is entitled unconditionally (under both stipulations, whatever
 *    their own `lineageLink` is).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THE MONEY FIGURES HERE WERE OBTAINED — BY HAND, NEVER COPIED FROM OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * One money shape throughout (`FRONTIER_MONEY`): revenue **10,000,000** halalas (SAR 100,000),
 * ṣiyāna `NONE` ⇒ 0, operating 0, Nazir fee 10% **of revenue** = 1,000,000
 * (⚠ the ʿushr rate is unverified — confirm vs primary law), so
 *
 *     distributable = 10,000,000 − 0 − 0 − 1,000,000 = **9,000,000 halalas**.
 *
 * 9,000,000 was chosen because its remainder against the cohort sizes below is non-zero for four of
 * the five, so the Hamilton residual is a live claim rather than a trivial one:
 *
 *   | heads | 9,000,000 ÷ n | residual |
 *   |---|---|---|
 *   | 7   | 1,285,714 | **2**  |
 *   | 11  |   818,181 | **9**  |
 *   | 13  |   692,307 | **9**  |
 *   | 97  |    92,783 | **49** |
 *   | 300 |    30,000 | **0**  |
 *
 * (Each verified as `n × floor + residual = 9,000,000` inside the test, so a typo in this table
 * cannot pass silently.)
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED (each mutation applied to `resolver.ts`, the named test observed RED, the file
 * restored byte-identically and `git diff --stat` re-checked)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · `lineage.activeById.get(ancestorId) === true` → `=== false` (invert the frontier)
 *      ⇒ §1 "names the ONLY living ancestor", §3 truth table, §6 all-alive.
 *  · drop the `livingAncestorId === null` guard (report the FURTHEST living ancestor, not the nearest)
 *      ⇒ §1 "names the NEAREST of several living ancestors".
 *  · drop the `lineBreakAncestorId === null` guard (report the furthest non-SON ancestor)
 *      ⇒ §2 "names the NEAREST non-SON ancestor when two daughters sit in one chain".
 *  · swap the two `if` returns (living-ancestor code outranks the buṭūn break)
 *      ⇒ §2 "precedence · a living DAUGHTER reports the permanent reason".
 *  · `if (!beneficiary.active) return EXCLUDED_INACTIVE;` → `if (false) …` (read own status as an
 *    ancestor fact / not at all) ⇒ §3 truth table, §6 all-dead.
 *  · prepend `beneficiary.id` to the walked chain (off-by-one at the bottom)
 *      ⇒ §1 "a living child of the waqif is entitled", §3 truth table.
 *  · `PER_CAPITA_WEIGHT` → `beneficiary.stipulatedWeight` (apply the deed vector after all)
 *      ⇒ §4 "UNEQUAL deed weights … still pay equally". ⚠ **Nothing else in this file caught it**,
 *        because every other fixture records the same weight `'10'` — which is exactly how a
 *        per-capita regression hides.
 *  · let a payability field into the frontier verdict (`|| verificationStatus === 'UNVERIFIED'`)
 *      ⇒ §9 "flipping every payability field … byte-identical".
 *  · **and the reverse direction**: ADD the missing `line`/`lineageLink` cross-check to
 *    `buildLineage` ⇒ §10 goes red, which is what makes it a tripwire rather than a comment.
 *
 * Mutations applied to `invariants.ts`:
 *  · I5's `chain.find(… .active === true)` → `null` (stop vital-testing ancestors, i.e. restore the
 *    invariant that would certify the corrected defect) ⇒ §8 "I5 REFUSES a hand-built run…".
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import {
  parseDistributionInput,
  type DistributionInputRaw,
  type DistributionLine,
  type DistributionResult,
} from '../contract.js';
import { runDistribution } from '../engine.js';
import { assertOrderedExclusion } from '../invariants.js';
import { resolveEntitlement } from '../resolver.js';
import { canonicalizeResult } from '../trace.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Builders
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];
type Continuation = 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN';

const ASOF_GREGORIAN = '2026-07-14';

/** ṣiyāna NONE, operating 0, ʿushr 10% of revenue ⇒ distributable 9,000,000. */
const FRONTIER_MONEY = {
  revenue: {
    incomeMinor: 10_000_000n,
    receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 10_000_000n }],
  },
  operatingCostMinor: 0n,
  maintenance: { kind: 'NONE' },
  nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
} as const satisfies Partial<DistributionInputRaw>;

const DISTRIBUTABLE = 9_000_000n;

/**
 * A recorded descendant.
 *
 * `tabaqa` MUST equal the derived depth or `buildLineage` refuses the run
 * (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) — so every tree below states its own depths and a tree that
 * drifts from its description cannot silently pass. Every payability field is clean and identical
 * across members: if a frontier verdict ever moved because of one, I6 would already be broken.
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
    bankingRefForProceeds: 'FAKE-ACCT-F1',
    ...overrides,
  };
}

/** A child of the waqif: depth 1, `parentId: null`, an EMPTY proper-ancestor chain. */
function child(
  id: string,
  link: 'SON' | 'DAUGHTER' = 'SON',
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return person(id, 1, link, null, overrides);
}

function makeRaw(
  beneficiaries: readonly RawBeneficiary[],
  continuation: Continuation = 'ZUHUR_ONLY',
  overrides: Partial<DistributionInputRaw> = {},
): DistributionInputRaw {
  return {
    waqfId: 'waqf-frontier-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: continuation,
    // R7 · every R-FRONTIER case here carries NO مآل clause, so each of them proves the frontier rule
    // on its own. `overrides` can supply one, and §11 below does exactly that.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    ...FRONTIER_MONEY,
    beneficiaries: [...beneficiaries],
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
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Observers — always the ENGINE's own output, never a re-implementation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `id → 'ENTITLED' | exclusionReason`, straight from Stage 2. */
function verdicts(
  beneficiaries: readonly RawBeneficiary[],
  continuation: Continuation = 'ZUHUR_ONLY',
): ReadonlyMap<string, string> {
  const resolution = resolveEntitlement(
    parseDistributionInput(makeRaw(beneficiaries, continuation)),
  );
  return new Map(
    resolution.resolved.map((entry) => [entry.beneficiaryId, entry.exclusionReason ?? 'ENTITLED']),
  );
}

/** `id → blockingAncestorId` as the trace publishes it, for every excluded line. */
function blockingAncestors(
  beneficiaries: readonly RawBeneficiary[],
  continuation: Continuation = 'ZUHUR_ONLY',
): ReadonlyMap<string, string> {
  const result = runDistribution(makeRaw(beneficiaries, continuation));
  return new Map(
    result.computationTrace
      .filter((entry) => entry.code === 'BENEFICIARY_EXCLUDED')
      .map((entry) => [
        String(entry.data?.['beneficiaryId'] ?? ''),
        String(entry.data?.['blockingAncestorId'] ?? ''),
      ]),
  );
}

function entitledIdsOf(result: DistributionResult): readonly string[] {
  return result.lines
    .filter((line) => line.status !== 'EXCLUDED')
    .map((line) => line.beneficiaryId);
}

function amountsOf(result: DistributionResult): ReadonlyMap<string, bigint> {
  return new Map(result.lines.map((line) => [line.beneficiaryId, line.entitledMinor as bigint]));
}

/** A straight chain of `depth` generations: `c1` (child of the waqif) → `c2` → … → `cN`. */
function chainOf(depth: number, links: readonly ('SON' | 'DAUGHTER')[] = []): RawBeneficiary[] {
  const members: RawBeneficiary[] = [];
  for (let i = 1; i <= depth; i += 1) {
    members.push(
      person(`c${String(i)}`, i, links[i - 1] ?? 'SON', i === 1 ? null : `c${String(i - 1)}`),
    );
  }
  return members;
}

function withActive(
  members: readonly RawBeneficiary[],
  aliveIds: readonly string[],
): RawBeneficiary[] {
  const alive = new Set(aliveIds);
  return members.map((member) => ({ ...member, active: alive.has(member.id) }));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §1 · The walk's two boundaries — chains of depth 1..6, one living ancestor at a time
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§1 · the ancestor walk reads STRICTLY-BETWEEN and nothing else', () => {
  it('a living child of the waqif is entitled at every stipulation — an EMPTY chain blocks nobody', () => {
    // Off-by-one AT THE TOP: if the waqif were modelled as an ancestor, or if the member's own
    // record were read as the first link of the chain, a lone living child would be blocked.
    for (const continuation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
      for (const link of ['SON', 'DAUGHTER'] as const) {
        const seen = verdicts([child('c1', link)], continuation);
        expect(`${continuation}/${link}: ${seen.get('c1') ?? 'MISSING'}`).toBe(
          `${continuation}/${link}: ENTITLED`,
        );
      }
    }
  });

  it('a living leaf under an ALL-DEAD chain is entitled at every depth 1..6 — own status is not an ancestor fact', () => {
    // Off-by-one AT THE BOTTOM: `b.active` is condition 1. If the walk started at `b` instead of at
    // `b.parentId`, a living leaf would report itself as its own blocking ancestor.
    for (let depth = 1; depth <= 6; depth += 1) {
      const leaf = `c${String(depth)}`;
      const seen = verdicts(withActive(chainOf(depth), [leaf]));
      expect(`depth ${String(depth)}: ${seen.get(leaf) ?? 'MISSING'}`).toBe(
        `depth ${String(depth)}: ENTITLED`,
      );
      // …and every dead ancestor above them is excluded for their OWN status, never for the leaf's.
      for (let i = 1; i < depth; i += 1) {
        expect(
          `depth ${String(depth)} c${String(i)}: ${seen.get(`c${String(i)}`) ?? 'MISSING'}`,
        ).toBe(`depth ${String(depth)} c${String(i)}: BENEFICIARY_INACTIVE`);
      }
    }
  });

  it('names the ONLY living ancestor, at every position of a depth-6 chain', () => {
    const depth = 6;
    const leaf = 'c6';
    for (let k = 1; k < depth; k += 1) {
      const holder = `c${String(k)}`;
      const members = withActive(chainOf(depth), [holder, leaf]);

      const seen = verdicts(members);
      expect(`holder ${holder}: ${seen.get(leaf) ?? 'MISSING'}`).toBe(
        `holder ${holder}: ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`,
      );
      // The holder is themself entitled: everything strictly above THEM is dead.
      expect(`holder ${holder}: ${seen.get(holder) ?? 'MISSING'}`).toBe(
        `holder ${holder}: ENTITLED`,
      );

      // And the exclusion NAMES them — the fact a beneficiary would dispute.
      expect(`holder ${holder}: ${blockingAncestors(members).get(leaf) ?? 'MISSING'}`).toBe(
        `holder ${holder}: ${holder}`,
      );
    }
  });

  it('names the NEAREST of several living ancestors, not the furthest', () => {
    // c2 and c4 alive, c6 alive, c1/c3/c5 dead. c6's proper-ancestor chain is nearest-first
    // [c5, c4, c3, c2, c1]; the holder is c4, and only c4.
    const members = withActive(chainOf(6), ['c2', 'c4', 'c6']);
    const seen = verdicts(members);

    expect(seen.get('c6')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(blockingAncestors(members).get('c6')).toBe('c4');
    // c4 is blocked in turn by c2 — the nearest living ancestor on ITS chain [c3, c2, c1].
    expect(seen.get('c4')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(blockingAncestors(members).get('c4')).toBe('c2');
    // c2's chain is [c1], dead ⇒ c2 holds the line and is the sole entitled member.
    expect(seen.get('c2')).toBe('ENTITLED');
    expect([...seen].filter(([, verdict]) => verdict === 'ENTITLED').map(([id]) => id)).toEqual([
      'c2',
    ]);
  });

  it('releases the next generation the moment the holder dies — the exclusion is TEMPORARY', () => {
    // The property the reason code's doc comment claims, driven rather than described: the SAME
    // register, one field flipped, and the excluded member becomes the entitled one.
    const beforeMembers = withActive(chainOf(3), ['c1', 'c2', 'c3']);
    const afterMembers = withActive(chainOf(3), ['c2', 'c3']);

    expect(verdicts(beforeMembers).get('c2')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(verdicts(afterMembers).get('c2')).toBe('ENTITLED');
    // c3 waits on c2 in BOTH periods — c2 is the nearest living ancestor either way. The point of
    // this pair is that the exclusion is not durable state: nothing was cached, and the reversal
    // needed no event beyond the register's own `active` flag.
    expect(blockingAncestors(beforeMembers).get('c3')).toBe('c2');
    expect(blockingAncestors(afterMembers).get('c3')).toBe('c2');

    // The same reversal one rung deeper, where the released member is NOT the blocker's child:
    // c2 is already dead, so killing c1 hands the line straight to the grandchild c3.
    const gapBefore = withActive(chainOf(3), ['c1', 'c3']);
    const gapAfter = withActive(chainOf(3), ['c3']);
    expect(verdicts(gapBefore).get('c3')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(blockingAncestors(gapBefore).get('c3')).toBe('c1');
    expect(verdicts(gapAfter).get('c3')).toBe('ENTITLED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §2 · Interaction with ZUHUR_ONLY, and the documented precedence
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§2 · ZUHUR_ONLY layers ON TOP of the frontier test, and never replaces it', () => {
  it('precedence · a LIVING intermediate daughter reports the permanent reason, not the temporary one', () => {
    // Both facts block: the daughter is alive (frontier) AND she is not a SON (line break). The
    // documented choice is the buṭūn break, because it is permanent under this deed and the
    // beneficiary's statement must not read "wait for your mother to die" when the line never
    // continues at all. ⚠ TODO(surface) in resolver.ts: engineering's call, not the owner's.
    const members = [child('dau', 'DAUGHTER'), person('gson', 2, 'SON', 'dau')];

    expect(verdicts(members, 'ZUHUR_ONLY').get('gson')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(blockingAncestors(members, 'ZUHUR_ONLY').get('gson')).toBe('dau');

    // The SAME register under the other stipulation: no line filter, so the frontier reason stands
    // alone. That contrast is what proves rung 2 is a filter and not the whole test.
    expect(verdicts(members, 'ZUHUR_AND_BUTUN').get('gson')).toBe(
      'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
    );
    expect(blockingAncestors(members, 'ZUHUR_AND_BUTUN').get('gson')).toBe('dau');
  });

  it('a DEAD intermediate daughter still ends the line under ZUHUR_ONLY, and still releases it under ZUHUR_AND_BUTUN', () => {
    // Removing the frontier block entirely isolates the buṭūn half: nothing alive is in the chain.
    const members = withActive(
      [child('dau', 'DAUGHTER'), person('gson', 2, 'SON', 'dau')],
      ['gson'],
    );

    expect(verdicts(members, 'ZUHUR_ONLY').get('gson')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(blockingAncestors(members, 'ZUHUR_ONLY').get('gson')).toBe('dau');
    expect(verdicts(members, 'ZUHUR_AND_BUTUN').get('gson')).toBe('ENTITLED');
  });

  it('a dead daughter ABOVE a dead son still ends the line — the filter is over the WHOLE chain', () => {
    // W → dau(dead, DAUGHTER) → son(dead, SON) → g(alive). A filter that only inspected the parent
    // would pass `g` (their parent IS a son) and pay a buṭūn descendant on a ẓuhūr-only deed.
    const members = withActive(
      [child('dau', 'DAUGHTER'), person('son', 2, 'SON', 'dau'), person('g', 3, 'SON', 'son')],
      ['g'],
    );

    expect(verdicts(members, 'ZUHUR_ONLY').get('g')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(blockingAncestors(members, 'ZUHUR_ONLY').get('g')).toBe('dau');
    expect(verdicts(members, 'ZUHUR_AND_BUTUN').get('g')).toBe('ENTITLED');
  });

  it('names the NEAREST non-SON ancestor when two daughters sit in one chain', () => {
    // W → d1(DAUGHTER) → s(SON) → d2(DAUGHTER) → leaf. Chain nearest-first is [d2, s, d1]; the
    // ancestor to name is d2. All ancestors dead so the frontier fact cannot supply the name.
    const members = withActive(
      [
        child('d1', 'DAUGHTER'),
        person('s', 2, 'SON', 'd1'),
        person('d2', 3, 'DAUGHTER', 's'),
        person('leaf', 4, 'SON', 'd2'),
      ],
      ['leaf'],
    );

    expect(verdicts(members, 'ZUHUR_ONLY').get('leaf')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(blockingAncestors(members, 'ZUHUR_ONLY').get('leaf')).toBe('d2');
  });

  it("never reads the member's OWN lineageLink — a son's DAUGHTER is entitled under ZUHUR_ONLY", () => {
    // The half of ADR-0009 R2 the correction did not touch, re-driven here because the frontier
    // rewrite walks the same chain and could plausibly have picked up the member's own link.
    const members = withActive(
      [child('son', 'SON'), person('gdau', 2, 'DAUGHTER', 'son')],
      ['gdau'],
    );
    expect(verdicts(members, 'ZUHUR_ONLY').get('gdau')).toBe('ENTITLED');

    // …and her son is not, because SHE is the intermediate non-SON for him.
    const deeper = withActive(
      [child('son', 'SON'), person('gdau', 2, 'DAUGHTER', 'son'), person('ggs', 3, 'SON', 'gdau')],
      ['ggs'],
    );
    expect(verdicts(deeper, 'ZUHUR_ONLY').get('ggs')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(blockingAncestors(deeper, 'ZUHUR_ONLY').get('ggs')).toBe('gdau');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §3 · Can a dead person be paid? Can a blocked person be paid? — the full truth table
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§3 · every combination of vital status across a 3-generation chain', () => {
  /**
   * W → A → B → C, all `SON`, so `ZUHUR_ONLY` adds nothing and the table isolates the frontier.
   *
   * Expected, from the rule alone: A entitled iff `a`; B iff `b && !a`; C iff `c && !a && !b`.
   * Exactly ONE line of the chain can be entitled, and it is the highest living one.
   */
  const CHAIN = [child('a'), person('b', 2, 'SON', 'a'), person('c', 3, 'SON', 'b')] as const;

  const TABLE: readonly (readonly [boolean, boolean, boolean, readonly string[]])[] = [
    [true, true, true, ['a']],
    [true, true, false, ['a']],
    [true, false, true, ['a']],
    [true, false, false, ['a']],
    [false, true, true, ['b']],
    [false, true, false, ['b']],
    [false, false, true, ['c']],
    [false, false, false, []],
  ];

  for (const [a, b, c, expected] of TABLE) {
    const label = `a=${a ? '1' : '0'} b=${b ? '1' : '0'} c=${c ? '1' : '0'}`;

    it(`${label} ⇒ entitled [${expected.join(', ')}] — and nobody else holds a halala`, () => {
      const alive = [...(a ? ['a'] : []), ...(b ? ['b'] : []), ...(c ? ['c'] : [])];
      const members = withActive([...CHAIN], alive);

      for (const continuation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
        const result = runDistribution(makeRaw(members, continuation));
        expect(`${label}/${continuation}: ${entitledIdsOf(result).join(',')}`).toBe(
          `${label}/${continuation}: ${expected.join(',')}`,
        );

        // A dead or blocked member must hold ZERO. This is the money half of the claim: an
        // exclusion that left an amount attached would be a payment to a dead beneficiary.
        const amounts = amountsOf(result);
        for (const line of result.lines) {
          if (expected.includes(line.beneficiaryId)) continue;
          expect(`${label}/${continuation}/${line.beneficiaryId}`).toBe(
            `${label}/${continuation}/${line.beneficiaryId}`,
          );
          expect(amounts.get(line.beneficiaryId)).toBe(0n);
          expect(line.status).toBe('EXCLUDED');
        }

        // Conservation, on every one of the eight states.
        expect(
          (result.totals.entitledMinor as bigint) + (result.totals.retainedMinor as bigint),
        ).toBe(DISTRIBUTABLE);

        if (expected.length === 0) {
          expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
          expect(result.totals.retainedMinor as bigint).toBe(DISTRIBUTABLE);
        } else {
          // Exactly one entitled head ⇒ that head takes the whole pool.
          expect(amounts.get(expected[0] ?? '')).toBe(DISTRIBUTABLE);
        }
      }
    });
  }

  it('a DEAD member is reported for their own status even when their line is also broken', () => {
    // Rung 1 outranks rung 2. Documented, and the only reason I5 tolerates a second code — so if
    // the precedence ever silently flipped, the invariant's tolerance would start hiding it.
    const members = withActive(
      [child('dau', 'DAUGHTER'), person('gson', 2, 'SON', 'dau')],
      [], // nobody alive
    );
    expect(verdicts(members, 'ZUHUR_ONLY').get('gson')).toBe('BENEFICIARY_INACTIVE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §4 · Per-capita arithmetic AFTER the cohort became the frontier
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§4 · per capita over a frontier cohort — exact halalas, coprime head counts', () => {
  /**
   * `n` dead children of the waqif, each with exactly one living child ⇒ a cohort of `n` heads that
   * is NOT the root set. That shape matters: a cohort equal to the roots would be reachable without
   * the frontier rule ever firing, and this section would then be testing the old engine.
   */
  function frontierCohort(n: number): RawBeneficiary[] {
    const members: RawBeneficiary[] = [];
    for (let i = 0; i < n; i += 1) {
      const tag = String(i).padStart(3, '0');
      members.push(child(`p-${tag}`, 'SON', { active: false }));
      members.push(person(`q-${tag}`, 2, 'SON', `p-${tag}`));
    }
    return members;
  }

  for (const [heads, floor, residual] of [
    [7, 1_285_714n, 2n],
    [11, 818_181n, 9n],
    [13, 692_307n, 9n],
    [97, 92_783n, 49n],
    [300, 30_000n, 0n],
  ] as const) {
    it(`${String(heads)} heads · ${String(floor)} each, residual ${String(residual)} to the lowest ids`, () => {
      // The hand-computed table is checked against itself before it is used as an oracle.
      expect(BigInt(heads) * floor + residual).toBe(DISTRIBUTABLE);

      const members = frontierCohort(heads);
      const result = runDistribution(makeRaw(members));

      const entitled = entitledIdsOf(result);
      expect(entitled.length).toBe(heads);
      // The frontier really is what selected them: not one root is in the cohort.
      expect(entitled.every((id) => id.startsWith('q-'))).toBe(true);

      expect(result.totals.entitledLineCount).toBe(heads);
      expect(result.totals.residualMinor as bigint).toBe(residual);
      expect(result.totals.entitledMinor as bigint).toBe(DISTRIBUTABLE);
      expect(result.totals.retainedMinor as bigint).toBe(0n);

      // The documented tie-break: the `r` LOWEST entitled ids take one extra halala, the rest the
      // floor. `entitled` is already ascending by `compareBeneficiaryIds` (I8).
      const amounts = amountsOf(result);
      entitled.forEach((id, index) => {
        expect(`${id}=${String(amounts.get(id))}`).toBe(
          `${id}=${String(BigInt(index) < residual ? floor + 1n : floor)}`,
        );
      });

      // I2 restated, on the run's own figures.
      const summed = result.lines.reduce(
        (total, line) => total + (line.entitledMinor as bigint),
        0n,
      );
      expect(summed + (result.totals.retainedMinor as bigint)).toBe(DISTRIBUTABLE);
    });
  }

  it('the residual follows the lowest ENTITLED id, not the lowest recorded id', () => {
    // `a-dead` sorts first and is dead; `a-kid` is their living child. If the tie-break were computed
    // over the whole register rather than over the entitled cohort, the extra halala would land on a
    // line that holds nothing.
    const members = [
      child('a-dead', 'SON', { active: false }),
      person('a-kid', 2, 'SON', 'a-dead'),
      child('m-live'),
      child('z-live'),
    ];
    const result = runDistribution(makeRaw(members));

    // 9,000,000 ÷ 3 = 3,000,000 exactly — so use a pool that does NOT divide, by adding a fourth
    // head and checking the residual explicitly below.
    expect(entitledIdsOf(result)).toEqual(['a-kid', 'm-live', 'z-live']);
    const amounts = amountsOf(result);
    expect(amounts.get('a-dead')).toBe(0n);
    expect(amounts.get('a-kid')).toBe(3_000_000n);
    expect(amounts.get('m-live')).toBe(3_000_000n);
    expect(amounts.get('z-live')).toBe(3_000_000n);

    // Now four heads: 9,000,000 ÷ 4 = 2,250,000 exactly. Seven heads is the coprime case, and it is
    // covered above; here the point is only WHICH ids are in the divisor.
    const wider = runDistribution(
      makeRaw([...members, child('b-live'), child('c-live'), child('d-live')]),
    );
    // Six heads: 9,000,000 ÷ 6 = 1,500,000 exactly.
    expect(entitledIdsOf(wider)).toEqual([
      'a-kid',
      'b-live',
      'c-live',
      'd-live',
      'm-live',
      'z-live',
    ]);
    for (const id of entitledIdsOf(wider)) {
      expect(`${id}=${String(amountsOf(wider).get(id))}`).toBe(`${id}=1500000`);
    }
  });

  it('id ordering is UTF-16 code units, so `b-10` outranks `b-9` for the residual', () => {
    // Eleven living children of the waqif named b-1 … b-11: ASCENDING UTF-16 order is
    // b-1, b-10, b-11, b-2, … b-9. Residual 9 ⇒ the first NINE of THAT order take 818,182.
    const members = Array.from({ length: 11 }, (_, index) => child(`b-${String(index + 1)}`));
    const result = runDistribution(makeRaw(members));

    const entitled = entitledIdsOf(result);
    expect(entitled).toEqual([
      'b-1',
      'b-10',
      'b-11',
      'b-2',
      'b-3',
      'b-4',
      'b-5',
      'b-6',
      'b-7',
      'b-8',
      'b-9',
    ]);
    expect(result.totals.residualMinor as bigint).toBe(9n);

    const amounts = amountsOf(result);
    // b-9 sorts LAST and therefore takes the floor; b-10 sorts second and takes the extra halala.
    expect(amounts.get('b-10')).toBe(818_182n);
    expect(amounts.get('b-9')).toBe(818_181n);
    expect(entitled.reduce((total, id) => total + (amounts.get(id) ?? 0n), 0n)).toBe(DISTRIBUTABLE);
  });

  it('UNEQUAL deed weights on a frontier cohort still pay equally — and the run says so', () => {
    // ⚠ Every other fixture in this file carries the same `stipulatedWeight` ('10'), where per capita
    // and a normalised deed vector agree to the halala — so none of them can tell the two apart. This
    // one can: 90 : 9 : 1 would pay 8,100,000 / 810,000 / 90,000 if the deed vector were applied.
    const members = withActive(
      [
        child('w-a', 'SON', { active: false, stipulatedWeight: '90' }),
        person('w-a-1', 2, 'SON', 'w-a', { stipulatedWeight: '90' }),
        child('w-b', 'SON', { stipulatedWeight: '9' }),
        child('w-c', 'SON', { stipulatedWeight: '1' }),
      ],
      ['w-a-1', 'w-b', 'w-c'],
    );
    const result = runDistribution(makeRaw(members));
    const amounts = amountsOf(result);

    expect(entitledIdsOf(result)).toEqual(['w-a-1', 'w-b', 'w-c']);
    for (const id of ['w-a-1', 'w-b', 'w-c']) {
      expect(`${id}=${String(amounts.get(id))}`).toBe(`${id}=3000000`);
    }
    // R3's honesty obligation: a recorded Shart figure that is not applied must be VISIBLY not
    // applied on the run, not merely absent from the arithmetic.
    expect(result.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    const notApplied = result.computationTrace
      .filter((entry) => entry.code === 'STIPULATED_WEIGHT_NOT_APPLIED')
      .map((entry) => [entry.data?.['beneficiaryId'], entry.data?.['deedWeight']]);
    expect(notApplied).toEqual([
      ['w-a-1', '90'],
      ['w-b', '9'],
      ['w-c', '1'],
    ]);
  });

  it('the head count is per capita, NOT per branch — six eligible cousins beat one, six to one', () => {
    // The consequence the owner explicitly accepted, re-driven on a FRONTIER cohort (both fathers
    // dead) rather than on a flat register.
    const members = withActive(
      [
        child('f1'),
        ...Array.from({ length: 6 }, (_, i) => person(`f1-k${String(i)}`, 2, 'SON', 'f1')),
        child('f2'),
        person('f2-k0', 2, 'SON', 'f2'),
      ],
      ['f1-k0', 'f1-k1', 'f1-k2', 'f1-k3', 'f1-k4', 'f1-k5', 'f2-k0'],
    );
    const result = runDistribution(makeRaw(members));
    const amounts = amountsOf(result);

    // Seven heads, 9,000,000 ÷ 7 = 1,285,714 r 2.
    expect(result.totals.entitledLineCount).toBe(7);
    const branchOne = Array.from(
      { length: 6 },
      (_, i) => amounts.get(`f1-k${String(i)}`) ?? 0n,
    ).reduce((total, amount) => total + amount, 0n);
    const branchTwo = amounts.get('f2-k0') ?? 0n;
    // 6 × 1,285,714 + 2 residual halalas landing on the two lowest ids (f1-k0, f1-k1) = 7,714,286.
    expect(branchOne).toBe(7_714_286n);
    expect(branchTwo).toBe(1_285_714n);
    expect(branchOne + branchTwo).toBe(DISTRIBUTABLE);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §5 · A death moves entitlement DOWN ITS OWN BRANCH and nowhere else
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§5 · the blast radius of one death', () => {
  /** Four roots, two children each, two grandchildren per child — 28 members, everyone alive. */
  function wideTree(): RawBeneficiary[] {
    const members: RawBeneficiary[] = [];
    for (let r = 0; r < 4; r += 1) {
      const root = `r${String(r)}`;
      members.push(child(root));
      for (let k = 0; k < 2; k += 1) {
        const kid = `${root}-k${String(k)}`;
        members.push(person(kid, 2, 'SON', root));
        for (let g = 0; g < 2; g += 1) {
          members.push(person(`${kid}-g${String(g)}`, 3, 'SON', kid));
        }
      }
    }
    return members;
  }

  it('killing one root entitles only that root’s own children — every other line is byte-identical in verdict', () => {
    const before = wideTree();
    const beforeVerdicts = verdicts(before);
    // Everyone alive ⇒ the frontier IS the root set.
    expect([...beforeVerdicts].filter(([, v]) => v === 'ENTITLED').map(([id]) => id)).toEqual([
      'r0',
      'r1',
      'r2',
      'r3',
    ]);

    for (const victim of ['r0', 'r1', 'r2', 'r3']) {
      const after = before.map((member) =>
        member.id === victim ? { ...member, active: false } : member,
      );
      const afterVerdicts = verdicts(after);

      for (const [id, verdictBefore] of beforeVerdicts) {
        const verdictAfter = afterVerdicts.get(id) ?? 'MISSING';
        const isVictim = id === victim;
        const isVictimChild = id === `${victim}-k0` || id === `${victim}-k1`;

        if (isVictim) {
          expect(`${victim} kills ${id}: ${verdictAfter}`).toBe(
            `${victim} kills ${id}: BENEFICIARY_INACTIVE`,
          );
        } else if (isVictimChild) {
          expect(`${victim} kills ${id}: ${verdictAfter}`).toBe(`${victim} kills ${id}: ENTITLED`);
        } else {
          // EVERY other line — other branches AND the victim's own grandchildren — keeps the exact
          // verdict it had. A frontier rule that leaked across branches shows up here.
          expect(`${victim} kills ${id}: ${verdictAfter}`).toBe(
            `${victim} kills ${id}: ${verdictBefore}`,
          );
        }
      }

      // Head count 4 → 5, and the pool is untouched: a death moves money between people, never out
      // of the waqf.
      const result = runDistribution(makeRaw(after));
      expect(result.totals.entitledLineCount).toBe(5);
      expect(result.totals.entitledMinor as bigint).toBe(DISTRIBUTABLE);
      expect(result.waterfall.distributableMinor as bigint).toBe(DISTRIBUTABLE);
    }
  });

  it('killing a DEEP member cannot resurrect a line its own ancestors still block', () => {
    // Kill r0-k0 while r0 is alive: nothing changes for r0-k0's children, because r0 still holds it.
    // A rule that only tested the PARENT would have released the grandchildren here.
    const before = wideTree();
    const after = before.map((member) =>
      member.id === 'r0-k0' ? { ...member, active: false } : member,
    );
    const afterVerdicts = verdicts(after);

    expect(afterVerdicts.get('r0-k0')).toBe('BENEFICIARY_INACTIVE');
    expect(afterVerdicts.get('r0-k0-g0')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(blockingAncestors(after).get('r0-k0-g0')).toBe('r0');
    // The cohort is unchanged — still exactly the four roots.
    expect([...afterVerdicts].filter(([, v]) => v === 'ENTITLED').map(([id]) => id)).toEqual([
      'r0',
      'r1',
      'r2',
      'r3',
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §6 · The two family-wide edges
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§6 · whole family alive, whole family dead', () => {
  it('all-alive · the entitled cohort is EXACTLY the children of the waqif, to depth 5', () => {
    const members = chainOf(5);
    // …plus a second, sibling line so "the roots" is not a singleton.
    members.push(child('z1'), person('z2', 2, 'SON', 'z1'));

    const seen = verdicts(members);
    expect(
      [...seen]
        .filter(([, v]) => v === 'ENTITLED')
        .map(([id]) => id)
        .sort(),
    ).toEqual(['c1', 'z1']);
    for (const id of ['c2', 'c3', 'c4', 'c5']) {
      expect(`${id}: ${seen.get(id) ?? 'MISSING'}`).toBe(
        `${id}: ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`,
      );
    }
    // On an all-alive chain the NEAREST living ancestor is the parent, so each blocked member names
    // their own father — never the root, and never anyone on the sibling line. (Naming c1 for all
    // of them would be the "furthest living ancestor" bug; naming z1 would be a cross-branch leak.)
    const named = blockingAncestors(members);
    for (const depth of [2, 3, 4, 5]) {
      expect(`c${String(depth)}→${named.get(`c${String(depth)}`) ?? 'MISSING'}`).toBe(
        `c${String(depth)}→c${String(depth - 1)}`,
      );
    }
    expect(named.get('z2')).toBe('z1');
  });

  it('all-dead · NO_ELIGIBLE_BENEFICIARIES, the whole pool retained, invariants still asserted', () => {
    const members = withActive([...chainOf(4), child('z1')], []);
    const result = runDistribution(makeRaw(members));

    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(result.totals.entitledLineCount).toBe(0);
    expect(result.totals.entitledMinor as bigint).toBe(0n);
    expect(result.totals.retainedMinor as bigint).toBe(DISTRIBUTABLE);
    expect(result.totals.residualMinor as bigint).toBe(0n);
    for (const line of result.lines) {
      expect(line.status).toBe('EXCLUDED');
      expect(line.reasonCode).toBe('BENEFICIARY_INACTIVE');
      expect(line.entitledMinor as bigint).toBe(0n);
    }
    // The corpus invariant and I5 are still real claims on a nil-cohort run.
    expect(result.invariantsChecked).toContain('I-C1');
    expect(result.invariantsChecked).toContain('I5');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §7 · Determinism and purity (I8)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§7 · the frontier path is order-independent and does not touch its input', () => {
  /** A tree whose entitled cohort spans three depths, so the walk really runs on every ordering. */
  function mixedTree(): RawBeneficiary[] {
    return withActive(
      [
        child('m-a'),
        person('m-a-1', 2, 'SON', 'm-a'),
        child('m-b', 'DAUGHTER'),
        person('m-b-1', 2, 'SON', 'm-b'),
        person('m-b-1-1', 3, 'SON', 'm-b-1'),
        child('m-c'),
        person('m-c-1', 2, 'DAUGHTER', 'm-c'),
        person('m-c-1-1', 3, 'SON', 'm-c-1'),
      ],
      ['m-a', 'm-a-1', 'm-b-1', 'm-b-1-1', 'm-c-1', 'm-c-1-1'],
    );
  }

  it('produces byte-identical canonical bytes under forward, reversed and rotated input order', () => {
    for (const continuation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
      const members = mixedTree();
      const forward = canonicalizeResult(runDistribution(makeRaw(members, continuation)));
      const reversed = canonicalizeResult(
        runDistribution(makeRaw([...members].reverse(), continuation)),
      );
      const rotated = canonicalizeResult(
        runDistribution(makeRaw([...members.slice(3), ...members.slice(0, 3)], continuation)),
      );

      expect(reversed).toBe(forward);
      expect(rotated).toBe(forward);
    }
  });

  it('Arabic-script ids order by UTF-16 code units and are equally deterministic', () => {
    // ⚠ No `localeCompare` anywhere on this path: an ICU-dependent ordering would make the residual
    // tie-break — and therefore a payout — host-dependent.
    const members = withActive(
      [
        child('ب-أب'),
        person('ب-ابن', 2, 'SON', 'ب-أب'),
        child('أ-أب'),
        person('أ-ابن', 2, 'SON', 'أ-أب'),
        child('ج-حي'),
      ],
      ['ب-ابن', 'أ-ابن', 'ج-حي'],
    );

    const forward = runDistribution(makeRaw(members));
    const reversed = runDistribution(makeRaw([...members].reverse()));
    expect(canonicalizeResult(reversed)).toBe(canonicalizeResult(forward));

    // Three heads, 9,000,000 ÷ 3 = 3,000,000 exactly.
    expect(entitledIdsOf(forward).length).toBe(3);
    expect(forward.totals.entitledMinor as bigint).toBe(DISTRIBUTABLE);
    // Ascending UTF-16: أ (U+0623) < ب (U+0628) < ج (U+062C).
    expect(entitledIdsOf(forward)).toEqual(['أ-ابن', 'ب-ابن', 'ج-حي']);
  });

  it('mutates nothing the caller handed in', () => {
    const raw = makeRaw(mixedTree());
    const snapshot = JSON.stringify(raw, (_key, value: unknown) =>
      typeof value === 'bigint' ? `${value.toString()}n` : value,
    );

    runDistribution(raw);
    resolveEntitlement(parseDistributionInput(raw));

    expect(
      JSON.stringify(raw, (_key, value: unknown) =>
        typeof value === 'bigint' ? `${value.toString()}n` : value,
      ),
    ).toBe(snapshot);
  });

  it('repeats identically across ten runs of the same input', () => {
    const raw = makeRaw(mixedTree());
    const first = canonicalizeResult(runDistribution(raw));
    for (let i = 0; i < 9; i += 1) {
      expect(canonicalizeResult(runDistribution(makeRaw(mixedTree())))).toBe(first);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §8 · `invariantsChecked` is honest about the frontier
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§8 · the invariants a frontier run reports are genuinely asserted', () => {
  const MEMBERS = withActive(
    [child('h-a'), person('h-a-1', 2, 'SON', 'h-a'), child('h-b'), child('h-c')],
    ['h-a-1', 'h-b', 'h-c'],
  );

  it('reports I1–I7, I9, I-C1 and I-L1 on a monetary frontier run', () => {
    const result = runDistribution(makeRaw(MEMBERS));
    expect([...result.invariantsChecked]).toEqual([
      'I1',
      'I2',
      'I3',
      'I4',
      'I5',
      'I6',
      'I7',
      'I9',
      'I-C1',
      'I-L1',
    ]);
    // I8 is a statement about two runs; §7 above is what proves it, and it is deliberately never
    // reported as checked.
    expect(result.invariantsChecked).not.toContain('I8');
  });

  it('I5 REFUSES a hand-built run that pays a grandchild whose father is alive', () => {
    // The exact defect the owner corrected, fed to the invariant directly. If I5's recomputation
    // ever stopped reading an ancestor's `active`, this would go green and the invariant would be
    // certifying the bug.
    const input = parseDistributionInput(makeRaw([child('h-a'), person('h-a-1', 2, 'SON', 'h-a')]));
    const lines: readonly DistributionLine[] = [
      fakeLine('h-a', 'PAID', null, 4_500_000n),
      fakeLine('h-a-1', 'PAID', null, 4_500_000n), // ← should be EXCLUDED: h-a is alive
    ];

    let caught: unknown;
    try {
      assertOrderedExclusion('LINEAGE_CONTINUATION', input, lines);
    } catch (error) {
      caught = error;
    }
    expect(isDomainError(caught)).toBe(true);
    if (!isDomainError(caught)) return;
    expect(caught.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
    expect(caught.details).toMatchObject({
      beneficiaryId: 'h-a-1',
      expectedReasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      blockingAncestorId: 'h-a',
    });
  });

  it('I5 REFUSES the false-positive direction too — an entitled member told their line is blocked', () => {
    // Both directions matter: telling a family member "someone ahead of you holds it" when the
    // register says otherwise is as wrong as paying them by mistake.
    const input = parseDistributionInput(
      makeRaw(withActive([child('h-a'), person('h-a-1', 2, 'SON', 'h-a')], ['h-a-1'])),
    );
    const lines: readonly DistributionLine[] = [
      fakeLine('h-a', 'EXCLUDED', 'BENEFICIARY_INACTIVE', 0n),
      fakeLine('h-a-1', 'EXCLUDED', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR', 0n),
    ];

    let caught: unknown;
    try {
      assertOrderedExclusion('LINEAGE_CONTINUATION', input, lines);
    } catch (error) {
      caught = error;
    }
    expect(isDomainError(caught)).toBe(true);
    if (!isDomainError(caught)) return;
    expect(caught.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
    expect(caught.details).toMatchObject({
      beneficiaryId: 'h-a-1',
      actualReasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
    });
  });

  it('I-L1 is a live claim: every entitled head is within one halala of every other', () => {
    const result = runDistribution(makeRaw(MEMBERS));
    const amounts = entitledIdsOf(result).map((id) => amountsOf(result).get(id) ?? 0n);
    const lowest = amounts.reduce((a, b) => (b < a ? b : a));
    const highest = amounts.reduce((a, b) => (b > a ? b : a));
    expect(highest - lowest <= 1n).toBe(true);
    expect(amounts.reduce((total, amount) => total + amount, 0n)).toBe(DISTRIBUTABLE);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §9 · A gate cannot undo a frontier verdict, in either direction (I6, on a frontier shape)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§9 · payability never reaches back into the frontier cohort', () => {
  it('a blocked or dead member with PERFECT payability still holds nothing', () => {
    // The excluded members are the *only* ones with clean gate inputs; the entitled ones all fail.
    // If a gate could reach entitlement, this is the shape where it would show: the tidy records are
    // exactly the ones the frontier rule refuses.
    const members = [
      // dead root — immaculate banking, verification and residency
      child('g-a', 'SON', { active: false }),
      // living head of that line — every gate input broken
      person('g-a-1', 2, 'SON', 'g-a', {
        verificationStatus: 'UNVERIFIED',
        kycLastRefreshed: '2010-01-01',
        bankingRefForProceeds: null,
        residency: 'CROSS_BORDER',
      }),
      // living root, blocking their own child, also broken
      child('g-b', 'SON', {
        verificationStatus: 'PENDING',
        kycLastRefreshed: '2010-01-01',
        bankingRefForProceeds: null,
      }),
      // held-by-living-ancestor, immaculate
      person('g-b-1', 2, 'SON', 'g-b'),
    ];
    const result = runDistribution(makeRaw(members));
    const amounts = amountsOf(result);

    // The frontier decided this, and no gate moved it.
    expect(entitledIdsOf(result)).toEqual(['g-a-1', 'g-b']);
    expect(amounts.get('g-a')).toBe(0n);
    expect(amounts.get('g-b-1')).toBe(0n);
    // Two heads, 9,000,000 ÷ 2 = 4,500,000 exactly — the FULL entitlement, merely unpayable.
    expect(amounts.get('g-a-1')).toBe(4_500_000n);
    expect(amounts.get('g-b')).toBe(4_500_000n);
    for (const id of ['g-a-1', 'g-b']) {
      expect(
        `${id}: ${result.lines.find((line) => line.beneficiaryId === id)?.status ?? '?'}`,
      ).toBe(`${id}: WITHHELD`);
    }
    // Nothing leaked to the two well-behaved excluded records.
    expect(result.totals.entitledMinor as bigint).toBe(DISTRIBUTABLE);
  });

  it('flipping every payability field on every member leaves the frontier verdicts byte-identical', () => {
    const clean = withActive(
      [
        child('n-a'),
        person('n-a-1', 2, 'SON', 'n-a'),
        child('n-b', 'DAUGHTER'),
        person('n-b-1', 2, 'SON', 'n-b'),
      ],
      ['n-a', 'n-a-1', 'n-b-1'],
    );
    const dirty = clean.map((member) => ({
      ...member,
      verificationStatus: 'UNVERIFIED' as const,
      kycLastRefreshed: null,
      residency: 'CROSS_BORDER' as const,
      bankingRefForProceeds: null,
      category: 'anything',
    }));

    const before = verdicts(clean);
    const after = verdicts(dirty);
    expect([...after.entries()]).toEqual([...before.entries()]);
    expect([...blockingAncestors(dirty).entries()]).toEqual([
      ...blockingAncestors(clean).entries(),
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §10 · ⚠ SURFACED, NOT DECIDED — `line` and `lineageLink` may contradict each other
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§10 · the register may record ẓuhūr/buṭūn twice and disagree with itself', () => {
  /**
   * ⚠ **THIS TEST PINS BEHAVIOUR THAT IS PROBABLY WRONG, AND IT IS HERE TO BE TRIPPED.**
   *
   * A beneficiary carries the ẓuhūr/buṭūn fact **twice**: `lineageLink` (`SON` | `DAUGHTER`), which
   * is what the `ZUHUR_ONLY` frontier filter reads, and `line` (`ZUHUR` | `BUTUN` | `NA`), which is
   * what lands on `DistributionLine.basis.line` and therefore on the beneficiary's statement.
   * **Nothing cross-checks the two.**
   *
   * That is the exact discipline `buildLineage` applies to the OTHER duplicated fact — a supplied
   * `tabaqa` that disagrees with the derived depth halts with `TABAQA_MISMATCHES_LINEAGE_DEPTH`, on
   * the stated reasoning that *"two sides that must agree, each testing the other"* is what stops the
   * defect class this repo keeps paying for. `line` vs `lineageLink` is the same shape and gets
   * nothing.
   *
   * MEASURED consequence, below: an ancestor recorded `lineageLink: 'DAUGHTER'` **and**
   * `line: 'ZUHUR'` ends their descendant's line. The descendant is excluded
   * `BUTUN_LINE_NOT_CONTINUED` naming that ancestor — while every `basis.line` on the run, the
   * ancestor's included, says `ZUHUR`. The statement contradicts its own reason, on the single most
   * disputable sentence this engine emits, and R-FRONTIER made it worse rather than better: the
   * reason now names a specific relative, so a family member can check it against the register and
   * find the register agreeing with them.
   *
   * **No halala moves** — eligibility keys on `lineageLink` alone and the arithmetic is untouched —
   * which is why this is surfaced rather than fixed here. Whether the engine should REFUSE the
   * contradiction (a new `SHART_REFUSALS` member), prefer one side, or derive `line` from
   * `lineageLink` and stop storing it twice is a **scope/data-model decision**, and the repo's own
   * precedent (`buildLineage` pass 4's `CATEGORY_ONLY` note) is that a new refusal is the product
   * owner's call, not engineering's.
   *
   * // TODO(surface) — put to the product owner. When it is answered and the engine starts refusing,
   * // THIS TEST GOES RED. That is intended: it is the marker, not an endorsement.
   */
  it('does NOT refuse a lineageLink/line contradiction — and the statement then argues with itself', () => {
    const members = withActive(
      [
        // The deed fact says DAUGHTER (so `ZUHUR_ONLY` ends the line here); the statement fact says ZUHUR.
        child('anc', 'DAUGHTER', { line: 'ZUHUR' }),
        person('kid', 2, 'SON', 'anc'),
      ],
      ['kid'],
    );

    // Accepted without a murmur — no SHART_INCOMPLETE, no flag.
    const result = runDistribution(makeRaw(members, 'ZUHUR_ONLY'));
    expect(result.flags).not.toContain('SHART_INCOMPLETE');

    const kid = result.lines.find((line) => line.beneficiaryId === 'kid');
    const anc = result.lines.find((line) => line.beneficiaryId === 'anc');

    // The reason says the line is buṭūn…
    expect(kid?.reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(blockingAncestors(members, 'ZUHUR_ONLY').get('kid')).toBe('anc');
    // …and every statement field on the same run says it is ẓuhūr.
    expect(anc?.basis.line).toBe('ZUHUR');
    expect(anc?.basis.lineageLink).toBe('DAUGHTER');
    expect(kid?.basis.line).toBe('ZUHUR');

    // For contrast, the fact that IS cross-checked halts on the identical kind of disagreement.
    let caught: unknown;
    try {
      runDistribution(
        makeRaw([child('anc', 'SON'), person('kid', 2, 'SON', 'anc', { tabaqa: 7 })]),
      );
    } catch (error) {
      caught = error;
    }
    expect(isDomainError(caught)).toBe(true);
    if (!isDomainError(caught)) return;
    expect(caught.code).toBe('SHART_INCOMPLETE');
    expect(caught.details).toMatchObject({ refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH' });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §11 · R7 · مآل الوقف — the frontier rule meets the reversion clause
 *
 * The frontier decides WHO among the bloodline is entitled; the reversion decides what happens when
 * there is no bloodline left. The two meet in exactly one place: **under `ZUHUR_ONLY` a waqif with only
 * daughters has living blood descendants whose line the deed does not continue — the ẓuhūr line is over
 * while the family is not.**
 *
 * ⚠ **ANSWERED 2026-08-11 (R7-d): *"bloodline is over means no continuing line."*** So that register
 * TRIGGERS the reversion and the deed's مآل takes. This section used to pin the opposite (the STRICT
 * reading, *"once ALL descendants are dead"*) and is inverted below with the inputs verbatim.
 *
 * ⚠ **And the frontier rule itself is UNCHANGED by that answer, which is the second half of this
 * section.** R-FRONTIER decides which living member of a line holds the entitlement *this period*;
 * whether the line exists at all is a different question, and a descendant waiting behind a living
 * ancestor is proof the line is alive rather than evidence against it. The two must not be implemented
 * as one test — the third case below is what holds them apart.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§11 · R7 · the reversion clause over a frontier cohort', () => {
  /** The deed's مآل, naming one charity. Weight 10 — the only entitled head once it triggers. */
  const MAAL = { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['maal-jiha'] };
  const TAKER: RawBeneficiary = {
    ...person('maal-jiha', 1, 'SON', null),
    kind: 'CHARITABLE_JIHA',
    tabaqa: null,
    parentId: null,
    lineageLink: null,
    line: 'NA',
    branch: 'Charitable',
    bankingRefForProceeds: 'FAKE-ACCT-MAAL',
  };

  function reverted(
    members: readonly RawBeneficiary[],
    continuation: Continuation = 'ZUHUR_ONLY',
  ): DistributionResult {
    return runDistribution(makeRaw([...members, TAKER], continuation, { reversion: MAAL }));
  }

  /**
   * ⚠ **INVERTED 2026-08-11 · THE CASE THE OWNER'S ANSWER TURNS ON, in halalas.**
   *
   * `c1` is the waqif's daughter and DECEASED, so the walk goes THROUGH her; `c2` is her living son. His
   * chain contains one proper ancestor and she is a `DAUGHTER`, so under `ZUHUR_ONLY` his line does not
   * continue and he is excluded **permanently under this deed**. A living blood descendant of the waqif
   * is on record — and no line this deed carries is still going, so **the reversion TRIGGERS** and the
   * charity takes the whole 9,000,000.
   *
   * MEASURED BEFORE 2026-08-11 on this exact input: `maal-jiha` 0, `retainedMinor` 9,000,000, flags
   * `NO_ELIGIBLE_BENEFICIARIES` + `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, and the taker's line
   * `REVERSION_PENDING_LIVING_BLOODLINE`. The owner then answered that *"the bloodline is over"* means
   * *no continuing line*, and every one of those became its opposite.
   *
   * ⚠ What keeps R5 intact on a run that pays a charity while the waqif's grandson is alive: `c2` is
   * `EXCLUDED` holding `0n`, so no descendant is *paid* and I-R1's universal mirror has nothing to fire
   * on. That is asserted here, not assumed.
   */
  it('R7-d · INVERTED · a living descendant on a broken buṭūn line TRIGGERS the reversion — was RETAINED', () => {
    const result = reverted([
      person('c1', 1, 'DAUGHTER', null, { active: false }),
      person('c2', 2, 'SON', 'c1'),
    ]);
    const amounts = amountsOf(result);

    // 9,000,000 × 10/10 = 9,000,000 to the single taker, residual 0. I2: 9,000,000 + 0 = 9,000,000 ✓
    expect(entitledIdsOf(result)).toStrictEqual(['maal-jiha']);
    expect(amounts.get('c2')).toBe(0n);
    expect(amounts.get('maal-jiha')).toBe(DISTRIBUTABLE);
    expect(result.totals.retainedMinor).toBe(0n);

    const reasons = new Map(result.lines.map((line) => [line.beneficiaryId, line.reasonCode]));
    // The PERMANENT code, and it is what makes the pairing coherent: `c2` is not waiting for anything,
    // his line simply is not one this deed continues — which is the same fact the trigger read.
    expect(reasons.get('c2')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(reasons.get('maal-jiha')).toBeNull();

    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(result.flags).not.toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(result.invariantsChecked).toContain('I-R1');

    // …and the trace NAMES the living survivor it decided the bloodline was over despite. Before the
    // inversion this step was `REVERSION_NOT_TRIGGERED` carrying `openQuestion: 'R7-d — no living
    // descendant vs no continuing line'`; the question is answered, so the field is gone.
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_TRIGGERED');
    expect(step?.data).toMatchObject({
      livingNonContinuingBloodlineIds: 'c2',
      livingBloodlineCount: '1',
      continuationStipulation: 'ZUHUR_ONLY',
    });
    expect(JSON.stringify(result.computationTrace)).not.toContain(
      'no living descendant vs no continuing line',
    );
  });

  /**
   * ⚠ **INVERTED · THE CONTROL IS NOW THE DEED TERM, NOT A DEATH.**
   *
   * This case used to show that *no living descendant* and *no continuing line* differ by ONE death and
   * 9,000,000 halalas of destination. The owner picked the second reading, so a death no longer
   * discriminates on this register — both halves now trigger, which is exactly what the assertion below
   * says. What discriminates instead is the **founder's condition**: the same three people under
   * `ZUHUR_AND_BUTUN` keep the bloodline going through the daughter, and the family takes the pool.
   *
   * That is the sharpest available proof the stipulation is being read: if `continuesTheLine` ever
   * stopped consuming it — collapsing to `active` — the widening would silently become universal, and
   * this pair would be the only thing to catch it.
   */
  it('R7-d · INVERTED · a death no longer discriminates; the CONTINUATION TERM does', () => {
    const living = reverted([
      person('c1', 1, 'DAUGHTER', null, { active: false }),
      person('c2', 2, 'SON', 'c1'),
    ]);
    const gone = reverted([
      person('c1', 1, 'DAUGHTER', null, { active: false }),
      person('c2', 2, 'SON', 'c1', { active: false }),
    ]);

    // ⚠ THE INVERSION: `c2`'s death used to move 9,000,000. It now moves nothing — both registers have
    // no continuing line, so both pay the charity the whole pool. Measured before: `living` retained
    // 9,000,000 and `gone` paid it.
    for (const [label, result] of [
      ['living', living],
      ['gone', gone],
    ] as const) {
      expect(`${label}: ${String(amountsOf(result).get('maal-jiha'))}`).toBe(
        `${label}: ${String(DISTRIBUTABLE)}`,
      );
      expect(`${label}: ${String(result.totals.retainedMinor)}`).toBe(`${label}: 0`);
      expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
      expect(result.computationTrace.some((entry) => entry.code === 'REVERSION_TRIGGERED')).toBe(
        true,
      );
    }
    // …and the two runs differ ONLY in whether the trace names a survivor, which is the honest report of
    // a register that still holds one.
    const nameIn = (result: DistributionResult): unknown =>
      result.computationTrace.find((entry) => entry.code === 'REVERSION_TRIGGERED')?.data?.[
        'livingNonContinuingBloodlineIds'
      ];
    expect(nameIn(living)).toBe('c2');
    expect(nameIn(gone)).toBe('none');

    // ⚠ THE REAL DISCRIMINATOR · one deed term, same three people, 9,000,000 to opposite parties. Under
    // ZUHUR_AND_BUTUN `c2` is the living frontier (his only ancestor is deceased) and takes 9,000,000 ×
    // 1/1; the charity waits, temporarily, on the code that reverses.
    const continued = reverted(
      [person('c1', 1, 'DAUGHTER', null, { active: false }), person('c2', 2, 'SON', 'c1')],
      'ZUHUR_AND_BUTUN',
    );
    expect(amountsOf(continued).get('c2')).toBe(DISTRIBUTABLE);
    expect(amountsOf(continued).get('maal-jiha')).toBe(0n);
    expect(continued.totals.retainedMinor).toBe(0n);
    expect(continued.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    const reasons = new Map(continued.lines.map((line) => [line.beneficiaryId, line.reasonCode]));
    expect(reasons.get('maal-jiha')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
  });

  /**
   * ⚠ **BOUNDARY 2 · THE FRONTIER RULE IS IRRELEVANT TO THE TRIGGER, and this is where that is pinned.**
   *
   * The register the widening most easily gets wrong in the other direction: `c1` is a LIVING daughter of
   * the waqif and `c2` her living son, under `ZUHUR_ONLY`.
   *
   *  · `c1` is entitled — a member's OWN `lineageLink` is never read, so a living `DAUGHTER` root is on
   *    the frontier at either term — and takes 9,000,000 × 1/1;
   *  · `c2` is excluded, and on the PERMANENT code, because the walk from him passes through a
   *    `DAUGHTER`. So the deepest recorded head on this branch is written off for good.
   *
   * ⚠ A trigger that reasoned *"every survivor below the roots is permanently excluded, so the line has
   * stopped"* would pay the charity here **while the waqif's own daughter was collecting**. It must not,
   * and the reason it does not is that `continuesTheLine` counts `c1` as continuing her line: liveness
   * and links, from either end of the chain, never a line's status. `c1`'s own `DAUGHTER` link is not an
   * ancestor fact about herself.
   */
  it('R7-d · BOUNDARY · a LIVING root on a line the deed does not extend still holds the reversion', () => {
    const result = reverted([person('c1', 1, 'DAUGHTER', null), person('c2', 2, 'SON', 'c1')]);
    expect(amountsOf(result).get('c1')).toBe(DISTRIBUTABLE);
    expect(amountsOf(result).get('c2')).toBe(0n);
    expect(amountsOf(result).get('maal-jiha')).toBe(0n);
    expect(result.totals.retainedMinor).toBe(0n);
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    const reasons = new Map(result.lines.map((line) => [line.beneficiaryId, line.reasonCode]));
    expect(reasons.get('c2')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(reasons.get('maal-jiha')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    // The trigger counted `c1` and not `c2` — which is the whole distinction between *this line is
    // alive* and *this head is entitled*.
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED');
    expect(step?.data).toMatchObject({ continuingBloodlineIds: 'c1', livingBloodlineIds: 'c1,c2' });

    // ⚠ ONE DEATH, and the same register becomes §11's first case: `c1` dies, nothing on the branch
    // continues, and the charity takes 9,000,000. The frontier's rule and the trigger's rule are read
    // off the SAME register and give different answers, which is what makes them different rules.
    const rootGone = reverted([
      person('c1', 1, 'DAUGHTER', null, { active: false }),
      person('c2', 2, 'SON', 'c1'),
    ]);
    expect(amountsOf(rootGone).get('maal-jiha')).toBe(DISTRIBUTABLE);
  });

  /**
   * ⚠ **THE REVERSAL PROPERTY, AND WHAT NOTHING DOWNSTREAM MAY DO.**
   *
   * `REVERSION_PENDING_LIVING_BLOODLINE` reverses on an event nobody controls, exactly like
   * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` and unlike `BUTUN_LINE_NOT_CONTINUED`. The exclusion is
   * recomputed from the register every period, so no consumer may cache or persist it as durable, and
   * its Arabic (E10/E12, product-approved) must not read as a permanent disinheritance.
   *
   * ⚠ It reverses in BOTH directions, which is the part with an open question attached: a later-recorded
   * birth turns APPLIED back into PENDING and the charity stops being paid — while halalas already paid
   * out cannot be recovered. Whether a مآل clause should be final once the family leg is extinguished is
   * a fiqh question nobody has asked; the per-period recomputation is a choice, not a finding.
   */
  it('R7 · one death flips PENDING → APPLIED, and one birth flips it back — no state is carried', () => {
    const chain = [child('c1'), person('c2', 2, 'SON', 'c1')];

    // Period 1 · c1 lives ⇒ he is the frontier, c2 waits behind him, the charity waits behind both.
    const period1 = reverted(withActive(chain, ['c1', 'c2']));
    expect(amountsOf(period1).get('c1')).toBe(DISTRIBUTABLE);
    expect(amountsOf(period1).get('maal-jiha')).toBe(0n);
    const reasons1 = new Map(period1.lines.map((line) => [line.beneficiaryId, line.reasonCode]));
    expect(reasons1.get('c2')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(reasons1.get('maal-jiha')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');

    // Period 2 · c1 dies. c2 is RELEASED — the frontier moves down, and the charity still waits. This is
    // the case that would break if "no living descendant" had been implemented as "nobody entitled".
    const period2 = reverted(withActive(chain, ['c2']));
    expect(amountsOf(period2).get('c2')).toBe(DISTRIBUTABLE);
    expect(amountsOf(period2).get('maal-jiha')).toBe(0n);
    expect(period2.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // Period 3 · c2 dies too ⇒ the recorded bloodline is over and the charity takes 9,000,000.
    const period3 = reverted(withActive(chain, []));
    expect(amountsOf(period3).get('maal-jiha')).toBe(DISTRIBUTABLE);
    expect(period3.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // Period 4 · a grandchild is enrolled ⇒ APPLIED reverses. The charity is excluded on the SAME code
    // as in period 1, and the newly-enrolled descendant is the frontier (both ancestors deceased).
    const period4 = reverted([...withActive(chain, []), person('c3', 3, 'SON', 'c2')]);
    expect(amountsOf(period4).get('c3')).toBe(DISTRIBUTABLE);
    expect(amountsOf(period4).get('maal-jiha')).toBe(0n);
    const reasons4 = new Map(period4.lines.map((line) => [line.beneficiaryId, line.reasonCode]));
    expect(reasons4.get('maal-jiha')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    expect(period4.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // ⚠ NOTHING IS CARRIED between the four runs: the same clause and the same three registers, driven
    // in a scrambled order, produce the same four answers. A cached cohort would show up here.
    for (const [members, expectedTaker] of [
      [withActive(chain, []), DISTRIBUTABLE],
      [withActive(chain, ['c1', 'c2']), 0n],
      [withActive(chain, []), DISTRIBUTABLE],
    ] as const) {
      expect(amountsOf(reverted(members)).get('maal-jiha')).toBe(expectedTaker);
    }
  });

  /**
   * The frontier rule is untouched BY the clause: a reverted deed's living family is resolved exactly as
   * the same family would be with no clause at all. Asserted by driving both and comparing the amounts,
   * so "the reversion does not disturb the frontier" is a measurement rather than a claim.
   */
  it('R7 · the frontier cohort`s own arithmetic is byte-identical with and without a clause', () => {
    // Three heads on the living frontier: 9,000,000 ÷ 3 = 3,000,000 each, residual 0.
    const family = [
      child('c1', 'SON', { active: false }),
      person('c2', 2, 'SON', 'c1'),
      person('c3', 2, 'SON', 'c1'),
      child('c4'),
    ];
    const withClause = amountsOf(reverted(family));
    const without = amountsOf(runDistribution(makeRaw(family)));
    for (const id of ['c1', 'c2', 'c3', 'c4']) {
      expect(withClause.get(id), id).toBe(without.get(id));
    }
    expect(withClause.get('c2')).toBe(3_000_000n);
    expect(withClause.get('c4')).toBe(3_000_000n);
    // …and the per-capita invariant is still asserted, because the reversion has NOT triggered.
    expect(reverted(family).invariantsChecked).toContain('I-L1');
  });
});

/** A hand-built line, for driving the invariants directly (never produced by the engine). */
function fakeLine(
  beneficiaryId: string,
  status: DistributionLine['status'],
  reasonCode: DistributionLine['reasonCode'],
  entitledMinor: bigint,
): DistributionLine {
  return {
    beneficiaryId,
    status,
    entitledMinor: entitledMinor as unknown as DistributionLine['entitledMinor'],
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
    },
    reasonCode,
    gateFlags: [],
    bankingRefForProceeds: null,
  };
}
