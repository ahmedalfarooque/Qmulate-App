/**
 * `distribution/lineage-adversarial.test.ts` — ADVERSARY 1 · the eligibility rule and its arithmetic.
 *
 * This suite exists to attack ADR-0009's Stage 2 on the assumption that the fiqh was got subtly
 * wrong. Every test here either (a) pins a boundary that a plausible-looking wrong implementation
 * gets backwards, (b) proves an arithmetic claim on exact halalas rather than describing it, or
 * (c) **pins a behaviour that this reviewer believes is a live defect or an unasked fiqh question**,
 * so that the behaviour cannot change silently while the question is open. Tests of the third kind
 * are marked `⚠ PINS A DISPUTED BEHAVIOUR` and name the finding.
 *
 * Nothing here decides a fiqh question. Where this suite disagrees with the shipped rule it says so
 * in a comment and pins what the code does today.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import {
  SHART_REFUSALS,
  parseDistributionInput,
  type DistributionInput,
  type DistributionInputRaw,
  type DistributionLine,
} from '../contract.js';
import { runDistribution } from '../engine.js';
import { canonicalizeResult } from '../trace.js';
import { buildLineage, resolveEntitlement } from '../resolver.js';

type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];

const ASOF = '2026-07-14';

/**
 * Money shaped so `distributable === incomeMinor` exactly: no ṣiyāna, no operating cost, no Nazir
 * fee. Every per-capita figure in this file is then `income / n` with a `income % n` residual, which
 * is what makes the arithmetic claims checkable by hand for any cohort size.
 */
function money(
  incomeMinor: bigint,
): Required<
  Pick<DistributionInputRaw, 'revenue' | 'operatingCostMinor' | 'maintenance' | 'nazirFee'>
> {
  return {
    revenue: {
      incomeMinor,
      receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: incomeMinor }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'NONE' },
    nazirFee: null,
  };
}

function person(
  id: string,
  depth: number,
  link: 'SON' | 'DAUGHTER' | null,
  parentId: string | null,
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return {
    id,
    kind: 'FAMILY',
    active: true,
    tabaqa: depth === 0 ? null : depth,
    parentId,
    lineageLink: link,
    line: link === 'DAUGHTER' ? 'BUTUN' : 'ZUHUR',
    branch: null,
    stipulatedWeight: '10',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: 'FAKE-ACCT-ADV',
    ...overrides,
  };
}

function baseRaw(): DistributionInputRaw {
  return {
    waqfId: 'waqf-adv-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    // R7 · no مآل clause on the base. §9's jiha-alone case and §7's zero-weight case both depend on
    // it: with a clause they become different (legal, or differently-refused) inputs, and both now
    // carry siblings that supply one deliberately.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    ...money(30_000_000n),
    beneficiaries: [person('ben-001', 1, 'SON', null)],
    asOf: { gregorian: ASOF, hijri: toHijri(civilDate(ASOF)) },
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
    // ⚠ NO `as DistributionInputRaw` cast. It used to be here, and R7 is why it came out: the cast
    // silenced tsc on a MISSING required field, so every case in this file went red at RUNTIME
    // (`reversion Required`) with a clean typecheck. A test that cannot run is worse than none — a
    // cast that hides the reason it cannot run is how that happens.
  };
}

function makeInput(overrides: Partial<DistributionInputRaw> = {}): DistributionInput {
  return parseDistributionInput({ ...baseRaw(), ...overrides });
}

function expectRefusal(run: () => unknown, refusal: string): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected SHART_INCOMPLETE / ${refusal}, got ${
        caught === undefined ? 'NO THROW — the engine resolved instead of refusing' : String(caught)
      }`,
    );
  }
  expect(caught.code).toBe('SHART_INCOMPLETE');
  const details = caught.details as { readonly refusal?: unknown } | undefined;
  expect(SHART_REFUSALS).toContain(details?.refusal);
  expect(details?.refusal).toBe(refusal);
  return caught;
}

function verdicts(input: DistributionInput): ReadonlyMap<string, string> {
  const resolution = resolveEntitlement(input);
  return new Map(
    resolution.resolved.map((entry) => [entry.beneficiaryId, entry.exclusionReason ?? 'ENTITLED']),
  );
}

function okRun(input: DistributionInput): {
  readonly lines: readonly DistributionLine[];
  readonly flags: readonly string[];
  readonly distributable: bigint;
} {
  const result = runDistribution(input);
  return {
    lines: result.lines,
    flags: result.flags as readonly string[],
    distributable: result.waterfall.distributableMinor as bigint,
  };
}

function amount(lines: readonly DistributionLine[], id: string): bigint {
  const line = lines.find((entry) => entry.beneficiaryId === id);
  if (line === undefined) throw new Error(`no line for ${id}`);
  return line.entitledMinor as bigint;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The ZUHUR_ONLY boundary — a single DAUGHTER walked through all six positions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('1 · ZUHUR_ONLY · one daughter, six positions on a six-generation chain', () => {
  /**
   * A single unbranched chain waqif → g1 → g2 → … → g6. For each `daughterAt ∈ 1..6` exactly one
   * member is a DAUGHTER and the rest are SONs.
   *
   * The rule is "eligible iff every ancestor STRICTLY BETWEEN the waqif and you is a SON", so the
   * expected verdict is mechanical and has no off-by-one freedom: everyone at depth `<= daughterAt`
   * is eligible (the daughter herself included — her own link is not read), and everyone strictly
   * BELOW her is blocked. Six separate cases, each asserted member by member, because a
   * `<` written as `<=` (or a chain that included `self`) would pass a test that only checked one
   * position.
   */
  function chain(daughterAt: number): readonly RawBeneficiary[] {
    const members: RawBeneficiary[] = [];
    for (let depth = 1; depth <= 6; depth += 1) {
      members.push(
        person(
          `g${String(depth)}`,
          depth,
          depth === daughterAt ? 'DAUGHTER' : 'SON',
          depth === 1 ? null : `g${String(depth - 1)}`,
        ),
      );
    }
    return members;
  }

  /**
   * ⚠⚠ **REBUILT FOR R-FRONTIER, AND THE SWEEP GOT SHARPER RATHER THAN WEAKER.**
   *
   * Every member of this chain is ALIVE, so under the owner's correction — *"son A's child does not
   * get since Son A is alive"* — only `g1` can be entitled and the old expectation
   * (`ENTITLED` for every depth ≤ daughterAt) is wrong at five of its six positions.
   *
   * The boundary the sweep exists to pin has not moved one bit; what changed is the code on the
   * eligible side of it. Above the daughter a member is blocked TEMPORARILY, by a living ancestor;
   * below her, PERMANENTLY, by the line break — and the engine reports the permanent reason when both
   * apply. So the six cases now sweep the **precedence** boundary as well as the ẓuhūr boundary, and
   * a `<` written as `<=` still fails exactly as it did before.
   */
  for (const daughterAt of [1, 2, 3, 4, 5, 6]) {
    it(`blocks exactly the descendants BELOW the daughter when she sits at depth ${String(daughterAt)}`, () => {
      const seen = verdicts(makeInput({ beneficiaries: [...chain(daughterAt)] }));
      for (let depth = 1; depth <= 6; depth += 1) {
        const id = `g${String(depth)}`;
        // Strictly below the daughter ⇒ she is an intermediate ancestor ⇒ line does not continue,
        // and that PERMANENT reason outranks the living ancestor also standing in the way.
        // At or above her ⇒ nothing has ended the line, but everyone except the waqif's own child
        // is waiting behind a living ancestor.
        const expected =
          depth > daughterAt
            ? 'BUTUN_LINE_NOT_CONTINUED'
            : depth === 1
              ? 'ENTITLED'
              : 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR';
        expect(`${id}=${seen.get(id) ?? 'MISSING'}`).toBe(`${id}=${expected}`);
      }
    });
  }

  /**
   * The same sweep with the frontier driven to the BOTTOM of the chain — the eligible side of the
   * ẓuhūr boundary, which the sweep above can no longer reach because everyone there is alive.
   *
   * `g1…g5` are deceased, so the line has reached `g6`. `g6` is then entitled **iff no intermediate
   * ancestor is a daughter** — i.e. iff the daughter is `g6` herself, whose own link is never read.
   * That single case is the "a line may end in a daughter" half of R2, tested six generations deep.
   */
  for (const daughterAt of [1, 2, 3, 4, 5, 6]) {
    it(`entitles the frontier member at depth 6 iff the daughter is HERSELF (daughterAt ${String(daughterAt)})`, () => {
      const members = chain(daughterAt).map((member) =>
        member.id === 'g6' ? member : { ...member, active: false },
      );
      const seen = verdicts(makeInput({ beneficiaries: members }));
      expect(seen.get('g6')).toBe(daughterAt === 6 ? 'ENTITLED' : 'BUTUN_LINE_NOT_CONTINUED');
      // …and every dead ancestor is excluded on their OWN vital status, never on their line.
      for (let depth = 1; depth <= 5; depth += 1) {
        expect(seen.get(`g${String(depth)}`)).toBe('BENEFICIARY_INACTIVE');
      }
    });
  }

  it('names the BLOCKING ancestor, and it is the NEAREST non-son, not the first one walked', () => {
    // Two daughters on one chain: g2 and g4. g5 and g6 are both blocked, but the ancestor named on
    // their exclusion must be the NEAREST one (g4), because that is the fact a beneficiary disputes.
    const members = [
      person('g1', 1, 'SON', null),
      person('g2', 2, 'DAUGHTER', 'g1'),
      person('g3', 3, 'SON', 'g2'),
      person('g4', 4, 'DAUGHTER', 'g3'),
      person('g5', 5, 'SON', 'g4'),
    ];
    const resolution = resolveEntitlement(makeInput({ beneficiaries: members }));
    const step = resolution.trace.find(
      (entry) => entry.code === 'BENEFICIARY_EXCLUDED' && entry.data?.beneficiaryId === 'g5',
    );
    expect(step?.data?.blockingAncestorId).toBe('g4');
  });

  /**
   * ⚠ **RE-POINTED FOR R-FRONTIER.** "Every member eligible" was true only under the superseded
   * reading. What `ZUHUR_AND_BUTUN` actually claims is that **no member is ever blocked by a LINK**,
   * and that is asserted here in both directions: nobody on the chain carries
   * `BUTUN_LINE_NOT_CONTINUED` even with a daughter at depth 2, and when the ancestors die the
   * buṭūn member at the bottom is ENTITLED — the identical tree that `ZUHUR_ONLY` blocks.
   */
  it('ZUHUR_AND_BUTUN applies NO line filter at all — no member is ever blocked by a LINK', () => {
    const alive = verdicts(
      makeInput({ beneficiaries: [...chain(2)], continuationStipulation: 'ZUHUR_AND_BUTUN' }),
    );
    for (const reason of alive.values()) expect(reason).not.toBe('BUTUN_LINE_NOT_CONTINUED');
    expect([...alive.values()]).toEqual([
      'ENTITLED',
      ...Array.from({ length: 5 }, () => 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'),
    ]);

    // The frontier at the bottom: g6's chain runs through the depth-2 DAUGHTER, and ZUHUR_AND_BUTUN
    // pays him anyway. Under ZUHUR_ONLY the identical input yields BUTUN_LINE_NOT_CONTINUED (above).
    const frontier = verdicts(
      makeInput({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: chain(2).map((member) =>
          member.id === 'g6' ? member : { ...member, active: false },
        ),
      }),
    );
    expect(frontier.get('g6')).toBe('ENTITLED');
  });

  it("a waqif's DAUGHTER is eligible in her own right and her SON is not (the owner's own example)", () => {
    const seen = verdicts(
      makeInput({
        beneficiaries: [
          person('dau', 1, 'DAUGHTER', null),
          person('dau-son', 2, 'SON', 'dau'),
          person('son', 1, 'SON', null),
          person('son-dau', 2, 'DAUGHTER', 'son'),
        ],
      }),
    );
    expect(seen.get('dau')).toBe('ENTITLED');
    expect(seen.get('dau-son')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(seen.get('son')).toBe('ENTITLED');
    // ⚠ `son-dau` was asserted ENTITLED here. Under R-FRONTIER her father is ALIVE and holds the
    // line — the owner's other sentence, *"son A's child only gets anything if son A is dead"* — so
    // the verdict is the TEMPORARY exclusion, not the line break. Her link is still not the reason,
    // which is the half this test exists for: a `BUTUN_LINE_NOT_CONTINUED` here would be the
    // implementation reading her own DAUGHTER link.
    expect(seen.get('son-dau')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');

    // Kill the father and she IS entitled — a son's daughter, at the frontier, under ZUHUR_ONLY.
    const afterFathersDeath = verdicts(
      makeInput({
        beneficiaries: [
          person('dau', 1, 'DAUGHTER', null),
          person('dau-son', 2, 'SON', 'dau'),
          person('son', 1, 'SON', null, { active: false }),
          person('son-dau', 2, 'DAUGHTER', 'son'),
        ],
      }),
    );
    expect(afterFathersDeath.get('son-dau')).toBe('ENTITLED');
    // …while the daughter's son stays blocked. Death moves the frontier; it does not mend a line.
    expect(afterFathersDeath.get('dau-son')).toBe('BUTUN_LINE_NOT_CONTINUED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Per-capita exactness, in bigint, at cohort sizes coprime with the pool
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('2 · per capita is EXACT — every head within one halala, residual by ascending id', () => {
  /** `n` children of the waqif, ids zero-padded so ascending-id order is unambiguous. */
  function siblings(n: number): readonly RawBeneficiary[] {
    return Array.from({ length: n }, (_unused, index) =>
      person(`ben-${String(index).padStart(4, '0')}`, 1, 'SON', null),
    );
  }

  for (const n of [7, 11, 13, 97, 300]) {
    it(`splits a pool that does NOT divide by ${String(n)} into floor/floor+1 only, residual to the ${String(n)} lowest ids`, () => {
      // 1,000,000,003 halalas is prime-ish against all five sizes, so every case has a residual.
      const pool = 1_000_000_003n;
      const run = okRun(makeInput({ ...money(pool), beneficiaries: [...siblings(n)] }));
      expect(run.distributable).toBe(pool);

      const size = BigInt(n);
      const floor = pool / size;
      const residual = pool % size;
      expect(residual).toBeGreaterThan(0n);

      const entitled = run.lines.filter((line) => line.status !== 'EXCLUDED');
      expect(entitled).toHaveLength(n);

      // Ascending-id order is the tie-break's definition (I9), so the first `residual` lines get the
      // extra halala and no other line may.
      entitled.forEach((line, index) => {
        const expected = BigInt(index) < residual ? floor + 1n : floor;
        expect(`${line.beneficiaryId}=${String(line.entitledMinor)}`).toBe(
          `${line.beneficiaryId}=${String(expected)}`,
        );
      });

      const total = entitled.reduce((sum, line) => sum + (line.entitledMinor as bigint), 0n);
      expect(total).toBe(pool);
      const amounts = entitled.map((line) => line.entitledMinor as bigint);
      const spread =
        amounts.reduce((a, b) => (a > b ? a : b)) - amounts.reduce((a, b) => (a < b ? a : b));
      expect(spread).toBe(1n);
    });
  }

  it('a death changes every survivor by exactly the recomputation and nothing else', () => {
    // Per capita means a death is not a branch event: the pool is simply re-divided over the new
    // head count. Three heads → 10,000,000 each; one dies → two heads → 15,000,000 each.
    const pool = 30_000_000n;
    const three = siblings(3);
    const before = okRun(makeInput({ ...money(pool), beneficiaries: [...three] }));
    expect(before.lines.map((line) => line.entitledMinor as bigint)).toEqual([
      10_000_000n,
      10_000_000n,
      10_000_000n,
    ]);

    const after = okRun(
      makeInput({
        ...money(pool),
        beneficiaries: three.map((member, index) =>
          index === 2 ? { ...member, active: false } : member,
        ),
      }),
    );
    expect(amount(after.lines, 'ben-0000')).toBe(15_000_000n);
    expect(amount(after.lines, 'ben-0001')).toBe(15_000_000n);
    expect(amount(after.lines, 'ben-0002')).toBe(0n);
  });

  it('a deceased head’s share does NOT pass down their branch as a block (R3, not per stirpes)', () => {
    /*
     * waqif ── A (dead) ── A1, A2, A3, A4, A5, A6   (all alive)
     *       └─ B (alive, childless)
     *
     * Per stirpes: A's branch takes 1/2 (split six ways) and B takes 1/2.
     * Per capita (R3): SEVEN living eligible heads, so B takes 1/7 and A's branch 6/7.
     * The owner chose the second, having been shown this exact consequence.
     */
    const pool = 70_000_000n;
    const members: RawBeneficiary[] = [
      person('a', 1, 'SON', null, { active: false }),
      person('b', 1, 'SON', null),
      ...Array.from({ length: 6 }, (_unused, index) =>
        person(`a${String(index + 1)}`, 2, 'SON', 'a'),
      ),
    ];
    const run = okRun(makeInput({ ...money(pool), beneficiaries: members }));
    expect(amount(run.lines, 'b')).toBe(10_000_000n);
    expect(amount(run.lines, 'a')).toBe(0n);
    const branch = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => amount(run.lines, id));
    expect(branch).toEqual(Array.from({ length: 6 }, () => 10_000_000n));
    // Six times the childless brother's share — stated as arithmetic, not as prose.
    expect(branch.reduce((sum, value) => sum + value, 0n)).toBe(6n * amount(run.lines, 'b'));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Can a dead member be paid? Can an ineligible line?
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('3 · no inactive member and no blocked line ever carries a halala', () => {
  const cases: readonly (readonly [string, readonly RawBeneficiary[], readonly string[]])[] = [
    [
      'an inactive member WITH living children',
      [
        person('p', 1, 'SON', null, { active: false }),
        person('c', 2, 'SON', 'p'),
        person('s', 1, 'SON', null),
      ],
      ['p'],
    ],
    [
      'an inactive member with NO children',
      [person('p', 1, 'SON', null, { active: false }), person('s', 1, 'SON', null)],
      ['p'],
    ],
    [
      'a whole inactive generation between two living ones',
      [
        person('g1', 1, 'SON', null),
        person('g2a', 2, 'SON', 'g1', { active: false }),
        person('g2b', 2, 'SON', 'g1', { active: false }),
        person('g3', 3, 'SON', 'g2a'),
      ],
      ['g2a', 'g2b'],
    ],
    [
      'an inactive child of the waqif whose entire subtree is eligible',
      [
        person('root', 1, 'SON', null, { active: false }),
        person('k1', 2, 'SON', 'root'),
        person('k2', 2, 'DAUGHTER', 'root'),
      ],
      ['root'],
    ],
    [
      'inactive AND down a buṭūn line at once — one code, and zero either way',
      [
        person('s', 1, 'SON', null),
        person('d', 2, 'DAUGHTER', 's'),
        person('d-son', 3, 'SON', 'd', { active: false }),
      ],
      ['d-son'],
    ],
  ];

  for (const stipulation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
    for (const [label, members, mustBeZero] of cases) {
      it(`${stipulation} · ${label}`, () => {
        const run = okRun(
          makeInput({
            ...money(30_000_003n),
            beneficiaries: [...members],
            continuationStipulation: stipulation,
          }),
        );
        for (const id of mustBeZero) {
          expect(`${id}=${String(amount(run.lines, id))}`).toBe(`${id}=0`);
        }
        // And every EXCLUDED line is zero, whatever its reason — no exception anywhere.
        for (const line of run.lines.filter((entry) => entry.status === 'EXCLUDED')) {
          expect(line.entitledMinor as bigint).toBe(0n);
        }
        const paid = run.lines
          .filter((line) => line.status !== 'EXCLUDED')
          .reduce((sum, line) => sum + (line.entitledMinor as bigint), 0n);
        expect(paid).toBe(run.distributable);
      });
    }
  }

  it('an all-inactive lineage cohort pays nobody and retains the whole distributable', () => {
    const run = okRun(
      makeInput({
        beneficiaries: [
          person('a', 1, 'SON', null, { active: false }),
          person('b', 2, 'SON', 'a', { active: false }),
        ],
      }),
    );
    expect(run.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    for (const line of run.lines) expect(line.entitledMinor as bigint).toBe(0n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Break the lineage graph — every shape must refuse
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('4 · an unusable family tree is REFUSED, never repaired', () => {
  it('the 1-cycle (own parent)', () => {
    expectRefusal(
      () => resolveEntitlement(makeInput({ beneficiaries: [person('a', 1, 'SON', 'a')] })),
      'LINEAGE_CYCLE',
    );
  });

  it('a 2-cycle', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            beneficiaries: [person('a', 1, 'SON', 'b'), person('b', 2, 'SON', 'a')],
          }),
        ),
      'LINEAGE_CYCLE',
    );
  });

  it('a long cycle terminates rather than spinning (bounded walk)', () => {
    const size = 400;
    const members = Array.from({ length: size }, (_unused, index) =>
      person(
        `c${String(index).padStart(4, '0')}`,
        index + 1,
        'SON',
        `c${String((index + size - 1) % size)
          .toString()
          .padStart(4, '0')}`,
      ),
    );
    expectRefusal(
      () => resolveEntitlement(makeInput({ beneficiaries: [...members] })),
      'LINEAGE_CYCLE',
    );
  });

  it('a parentId naming nobody', () => {
    expectRefusal(
      () => resolveEntitlement(makeInput({ beneficiaries: [person('a', 2, 'SON', 'ghost')] })),
      'LINEAGE_PARENT_UNKNOWN',
    );
  });

  it('duplicate ids', () => {
    expectRefusal(
      () =>
        buildLineage({
          ...makeInput(),
          beneficiaries: [person('a', 1, 'SON', null), person('a', 1, 'SON', null)],
        } as unknown as DistributionInput),
      'BENEFICIARY_ID_DUPLICATED',
    );
  });

  it('a parent edge on someone who records no lineage link at all', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            continuationStipulation: null,
            beneficiaries: [person('a', 1, 'SON', null), person('b', 2, null, 'a', { tabaqa: 2 })],
          }),
        ),
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    );
  });

  /**
   * ⚠ **RE-POINTED, and the re-pointing is itself a finding: this refusal is no longer reachable
   * through `resolveEntitlement` at all.**
   *
   * The old input hung the subtree off an edgeless `FAMILY` member. Under R6 that member is refused
   * `LINEAGE_LINK_MISSING` in the per-beneficiary pass, which runs BEFORE the ancestor walk — so the
   * test would have gone on passing on the wrong refusal. Enumerating what can legally sit outside
   * the graph leaves exactly one kind, a `CHARITABLE_JIHA`, and a jiha cannot be in the cohort of a
   * `FAMILY_DHURRI` waqf (R6-D1) nor beside a descendant on a `PUBLIC_CHARITABLE` one (ESC-1).
   *
   * So the check is driven at `buildLineage`, which is where it lives and which is exported for
   * exactly this. It remains a real defence — `buildLineage` is separately callable and the walk must
   * not silently root a subtree outside the waqif's line — but on the Stage-2 path the two newer
   * refusals now outrank it. Worth the product owner knowing when ESC-1/R6-D1 are reviewed.
   */
  it('an orphaned subtree hanging off a member who is not in the tree (buildLineage)', () => {
    const error = expectRefusal(
      () =>
        buildLineage(
          makeInput({
            entitlementOrder: 'ORDERED',
            continuationStipulation: null,
            beneficiaries: [
              // A jiha: the one kind that may legally record neither field and still be in a cohort.
              person('outside', 0, null, null, { kind: 'CHARITABLE_JIHA', tabaqa: null }),
              person('child', 2, 'SON', 'outside'),
            ],
          }),
        ),
      'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'child', rootedAtId: 'outside' });
  });

  /**
   * ⚠ **RE-POINTED TWICE, for the same reason as the case above.** It was moved off
   * `LINEAGE_CONTINUATION` (where `LINEAGE_ORDER_ON_CHARITABLE_WAQF` fires first) onto `ORDERED`;
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` (R6-D1) now fires first there too, on the declared type, before
   * the graph is built at all. Both halves are asserted so the precedence is on the record rather
   * than being discovered again by the next agent.
   */
  it('a CHARITABLE_JIHA carrying a lineage edge', () => {
    const cohort = [person('jiha', 0, 'SON', null, { kind: 'CHARITABLE_JIHA', tabaqa: null })];

    // The graph-integrity refusal itself, at the function that owns it.
    expectRefusal(
      () =>
        buildLineage(
          makeInput({
            entitlementOrder: 'ORDERED',
            continuationStipulation: null,
            beneficiaries: cohort,
          }),
        ),
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    );

    // …and through Stage 2, where R6-D1 refuses the same record one step earlier, on the DECLARED
    // TYPE. The record is refused either way; only the reason a reader is given differs.
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            entitlementOrder: 'ORDERED',
            continuationStipulation: null,
            beneficiaries: cohort,
          }),
        ),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
  });

  it('two roots are LEGAL — a waqif with two children is not a broken tree', () => {
    const seen = verdicts(
      makeInput({
        beneficiaries: [person('a', 1, 'SON', null), person('b', 1, 'DAUGHTER', null)],
      }),
    );
    expect([...seen.values()]).toEqual(['ENTITLED', 'ENTITLED']);
  });

  it('a missing lineage link on a FAMILY member under lineage order', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({ beneficiaries: [person('a', 0, null, null, { tabaqa: null })] }),
        ),
      'LINEAGE_LINK_MISSING',
    );
  });

  it('an unrecognised lineage link — case, padding and near-spellings all refuse', () => {
    for (const raw of ['son', ' SON', 'SON ', 'MALE', 'ابن', '']) {
      expectRefusal(
        () =>
          resolveEntitlement(makeInput({ beneficiaries: [person('a', 1, raw as 'SON', null)] })),
        'LINEAGE_LINK_UNRECOGNISED',
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · ṭabaqa is DERIVED, and the invariant recomputes the walk independently
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('5 · a declared ṭabaqa that disagrees with the parent-edge depth HALTS', () => {
  it('too deep, too shallow, and null all refuse', () => {
    for (const declared of [1, 3, 99, null]) {
      expectRefusal(
        () =>
          resolveEntitlement(
            makeInput({
              beneficiaries: [
                person('a', 1, 'SON', null),
                person('b', 2, 'SON', 'a', { tabaqa: declared }),
              ],
            }),
          ),
        'TABAQA_MISMATCHES_LINEAGE_DEPTH',
      );
    }
  });

  it('the basis reports the DERIVED depth, and it equals the walked chain length + 1', () => {
    const members = [
      person('g1', 1, 'SON', null),
      person('g2', 2, 'SON', 'g1'),
      person('g3', 3, 'SON', 'g2'),
    ];
    const input = makeInput({ beneficiaries: [...members] });
    const lineage = buildLineage(input);
    expect(lineage.ancestorsById.get('g3')).toEqual(['g2', 'g1']);
    expect(lineage.depthById.get('g3')).toBe(3);
    for (const line of okRun(input).lines) {
      expect(line.basis.lineageDepth).toBe(lineage.depthById.get(line.beneficiaryId) ?? null);
      expect(line.basis.tabaqa).toBe(line.basis.lineageDepth);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · ORDERED still behaves, and the S3-D1 hole is still open (it is DOCUMENTED, not closed)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('6 · ORDERED · the tier rule survives, and the untiered-escape hole is measured', () => {
  it('the same family, one field different, opposite verdicts (R4 — the order is really read)', () => {
    const members = [
      person('g1', 1, 'SON', null),
      person('g2', 2, 'SON', 'g1'),
      person('g3', 3, 'SON', 'g2'),
    ];
    // ⚠ Under R-FRONTIER a straight chain of LIVING members entitles only g1 — the other two wait
    // behind him. The contrast with ORDERED is undiminished and arguably clearer: the REASONS differ
    // (a temporary hold on one path, a tier verdict on the other) even where the payout agrees, so a
    // resolver that ignored `entitlementOrder` still fails.
    const lineage = verdicts(makeInput({ beneficiaries: [...members] }));
    expect([...lineage.values()]).toEqual([
      'ENTITLED',
      'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
    ]);

    // The half that makes the two orders genuinely different rather than coincidentally equal: kill
    // g1 and the LINEAGE path advances to g2, while ORDERED promotes ṭabaqa 2 for a different reason
    // and would promote g3 too if g2 also died. One field, two models.
    const afterDeath = verdicts(
      makeInput({
        beneficiaries: members.map((member) =>
          member.id === 'g1' ? { ...member, active: false } : member,
        ),
      }),
    );
    expect(afterDeath.get('g2')).toBe('ENTITLED');
    expect(afterDeath.get('g3')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');

    const orderedSeen = verdicts(
      makeInput({
        beneficiaries: [...members],
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
      }),
    );
    expect(orderedSeen.get('g1')).toBe('ENTITLED');
    expect(orderedSeen.get('g2')).toBe('UPPER_TABAQA_EXTANT');
    expect(orderedSeen.get('g3')).toBe('UPPER_TABAQA_EXTANT');
  });

  /**
   * ⚠⚠ **INVERTED — FINDING `ordered-untiered-escape` (S3-D1) IS CLOSED. Input kept verbatim.**
   *
   * This test MEASURED the cost of the hole and its finding stands as the record of it: a `FAMILY`
   * member with `tabaqa: null, lineageLink: null` was in neither the tier tree nor the lineage graph,
   * so under `ORDERED` it escaped the tier test entirely and — with every tiered member dead — was
   * PAID the whole distributable, with no flag raised and invariant I5 still reported as checked.
   *
   * `resolver.buildLineage`'s header no longer says the hole is open, because it is not: the product
   * owner answered ADR-0009's open question 10 on 2026-08-03 (**R6**) — require the descent on every
   * deed — and `LINEAGE_LINK_MISSING` stopped being gated on `LINEAGE_CONTINUATION`. The escape is
   * closed by REFUSING the record, not by ruling on whether an untiered member should be
   * tier-excluded, which remains the fiqh question this suite declined to answer.
   */
  it('INVERTED: an untiered FAMILY member under ORDERED is REFUSED, not paid the whole pool', () => {
    expectRefusal(
      () =>
        runDistribution(
          makeInput({
            entitlementOrder: 'ORDERED',
            continuationStipulation: null,
            beneficiaries: [
              person('tiered-1', 1, 'SON', null, { active: false }),
              person('tiered-2', 2, 'SON', 'tiered-1', { active: false }),
              person('untiered', 0, null, null, { tabaqa: null }),
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );
  });

  it('under LINEAGE the same escape is structurally impossible — the edge is mandatory', () => {
    expectRefusal(
      () =>
        resolveEntitlement(
          makeInput({
            beneficiaries: [
              person('tiered-1', 1, 'SON', null, { active: false }),
              person('untiered', 0, null, null, { tabaqa: null }),
            ],
          }),
        ),
      'LINEAGE_LINK_MISSING',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · The discarded stipulatedWeight — is the Shart figure really never silent?
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('7 · R3 · a deed weight that is not applied must be visibly not applied', () => {
  it('unequal recorded weights raise the flag AND reach the trace, naming the deed figure', () => {
    const input = makeInput({
      beneficiaries: [
        person('a', 1, 'SON', null, { stipulatedWeight: '75' }),
        person('b', 1, 'SON', null, { stipulatedWeight: '25' }),
      ],
    });
    const run = okRun(input);
    expect(run.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    // Per capita, NOT 75/25.
    expect(amount(run.lines, 'a')).toBe(15_000_000n);
    expect(amount(run.lines, 'b')).toBe(15_000_000n);

    const resolution = resolveEntitlement(input);
    const steps = resolution.trace.filter((step) => step.code === 'STIPULATED_WEIGHT_NOT_APPLIED');
    expect(steps.map((step) => step.data?.deedWeight)).toEqual(['75', '25']);
    expect(steps.map((step) => step.data?.appliedWeight)).toEqual(['1', '1']);
  });

  it('weights that differ only in formatting are the SAME figure — no false flag', () => {
    const run = okRun(
      makeInput({
        beneficiaries: [
          person('a', 1, 'SON', null, { stipulatedWeight: '10' }),
          person('b', 1, 'SON', null, { stipulatedWeight: '10.000' }),
          person('c', 1, 'SON', null, { stipulatedWeight: '010.0' }),
        ],
      }),
    );
    expect(run.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
  });

  it('an EXCLUDED member’s unequal weight does not raise the flag — they are owed nothing anyway', () => {
    const run = okRun(
      makeInput({
        beneficiaries: [
          person('a', 1, 'SON', null, { stipulatedWeight: '10' }),
          person('b', 1, 'SON', null, { stipulatedWeight: '10' }),
          person('dead', 1, 'SON', null, { stipulatedWeight: '999', active: false }),
        ],
      }),
    );
    expect(run.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
  });

  /**
   * FINDING `zero-weight-cohort-silent` — the case R3's flag was supposed to make impossible.
   *
   * A cohort whose recorded deed weights are ALL zero is "all equal", so the inequality-keyed flag
   * does not fire — yet per capita pays the entire distributable out to members the deed's own
   * recorded figure allocated nothing. Under `ORDERED`/`SHARED` the identical record excludes every
   * one of them (`ZERO_STIPULATED_WEIGHT`) and the distributable is retained. So the two paths
   * disagree completely about the same recorded fact, and on the lineage path the disagreement was
   * invisible: no flag, no trace step.
   */
  it('an ALL-ZERO deed-weight cohort is paid in full — and the run now SAYS the deed was overridden', () => {
    const input = makeInput({
      beneficiaries: [
        person('a', 1, 'SON', null, { stipulatedWeight: '0' }),
        person('b', 1, 'SON', null, { stipulatedWeight: '0.000' }),
      ],
    });
    const run = okRun(input);
    // The behaviour itself is ADR-0009 open question 2 and is NOT changed here.
    expect(amount(run.lines, 'a')).toBe(15_000_000n);
    expect(amount(run.lines, 'b')).toBe(15_000_000n);
    // What IS fixed: the run no longer reports this silently.
    expect(run.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    const steps = resolveEntitlement(input).trace.filter(
      (step) => step.code === 'STIPULATED_WEIGHT_NOT_APPLIED',
    );
    expect(steps.map((step) => step.data?.deedWeight)).toEqual(['0', '0.000']);
  });

  it('ORDERED excludes the same all-zero cohort outright — the contrast that makes the flag owed', () => {
    const seen = verdicts(
      makeInput({
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        beneficiaries: [
          person('a', 1, 'SON', null, { stipulatedWeight: '0' }),
          person('b', 1, 'SON', null, { stipulatedWeight: '0.000' }),
        ],
      }),
    );
    expect([...seen.values()]).toEqual(['ZERO_STIPULATED_WEIGHT', 'ZERO_STIPULATED_WEIGHT']);
  });

  /**
   * ⚠ **R7 · THE ZERO-WEIGHT REASONING HAS A THIRD CASE NOW, AND IT GOES THE OTHER WAY.**
   *
   * The finding above is that a zero deed weight is IGNORED on the lineage path (the member is paid an
   * equal share) while it EXCLUDES on `ORDERED`/`SHARED` — ADR-0009 open question 2, unresolved. A
   * recorded ultimate taker breaks that symmetry deliberately, because its share **is** its deed weight
   * (R7-e: per capita is the bloodline's rule, not a charity's). So `ZERO_STIPULATED_WEIGHT` becomes
   * reachable on `LINEAGE_CONTINUATION` for the first time — which is the correction R7 had to make to
   * `contract.ts`'s per-path code table, or that documented table would have become false.
   *
   * And an **all**-zero taker vector is REFUSED rather than either split equally or retained: falling
   * through to `NO_ELIGIBLE_BENEFICIARIES` would hide an unusable deed record behind an ordinary flag.
   */
  it('R7 · a taker`s zero weight EXCLUDES on the lineage path; an all-zero vector is refused', () => {
    const jiha = (id: string, weight: string): RawBeneficiary =>
      person(id, 0, null, null, {
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        stipulatedWeight: weight,
      });
    const deadSon = person('a', 1, 'SON', null, { active: false });

    // (a) one taker at '0' beside one at '30' ⇒ the zero one is EXCLUDED, on the lineage path.
    const partial = verdicts(
      makeInput({
        beneficiaries: [deadSon, jiha('j-zero', '0'), jiha('j-live', '30')],
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['j-zero', 'j-live'],
        },
      }),
    );
    expect(partial.get('j-zero')).toBe('ZERO_STIPULATED_WEIGHT');
    expect(partial.get('j-live')).toBe('ENTITLED');
    // ⚠ The contrast with the finding above, on the SAME order: a zero-weight FAMILY member would be
    // paid an equal share here, and a zero-weight taker is excluded. Both are the deed being read
    // literally for the entity the rule is about — and it is why the code table needed correcting.

    // (b) ALL zero ⇒ refused, never split equally and never retained under an ordinary flag.
    expectRefusal(
      () =>
        runDistribution({
          ...baseRaw(),
          beneficiaries: [deadSon, jiha('j-zero', '0'), jiha('j-zero-b', '0.000')],
          reversion: {
            kind: 'CHARITABLE_ULTIMATE_TAKER',
            ultimateTakerIds: ['j-zero', 'j-zero-b'],
          },
        }),
      'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · Determinism (I8) and purity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('8 · determinism and purity of the lineage path', () => {
  function scrambledFamily(): readonly RawBeneficiary[] {
    return [
      person('ز-3', 3, 'SON', 'ز-2'),
      person('ا-1', 1, 'DAUGHTER', null),
      person('ز-2', 2, 'DAUGHTER', 'ز-1'),
      person('ز-1', 1, 'SON', null),
      person('ا-2', 2, 'SON', 'ا-1'),
    ];
  }

  it('reversing the input cohort changes nothing at all, trace included', () => {
    const forward = runDistribution(makeInput({ beneficiaries: [...scrambledFamily()] }));
    const backward = runDistribution(
      makeInput({ beneficiaries: [...scrambledFamily()].reverse() }),
    );
    expect(backward).toEqual(forward);
  });

  it('the same input twice is byte-identical (canonical bytes included)', () => {
    const a = runDistribution(makeInput({ beneficiaries: [...scrambledFamily()] }));
    const b = runDistribution(makeInput({ beneficiaries: [...scrambledFamily()] }));
    expect(b).toEqual(a);
    expect(canonicalizeResult(b)).toBe(canonicalizeResult(a));
  });

  it('Arabic-script ids sort by UTF-16 code unit, and the residual follows that order', () => {
    const run = okRun(
      makeInput({
        ...money(10n),
        beneficiaries: [
          person('ي', 1, 'SON', null),
          person('ا', 1, 'SON', null),
          person('م', 1, 'SON', null),
        ],
      }),
    );
    // 'ا' (U+0627) < 'م' (U+0645) < 'ي' (U+064A). 10 halalas over 3 heads: 4, 3, 3.
    expect(run.lines.map((line) => line.beneficiaryId)).toEqual(['ا', 'م', 'ي']);
    expect(run.lines.map((line) => line.entitledMinor as bigint)).toEqual([4n, 3n, 3n]);
  });

  it('never mutates the caller’s input', () => {
    const input = makeInput({ beneficiaries: [...scrambledFamily()] });
    const before = JSON.stringify(input, (_key, value) =>
      typeof value === 'bigint' ? String(value) : value,
    );
    runDistribution(input);
    resolveEntitlement(input);
    buildLineage(input);
    const after = JSON.stringify(input, (_key, value) =>
      typeof value === 'bigint' ? String(value) : value,
    );
    expect(after).toBe(before);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 9 · Two findings this reviewer believes are live defects in the ELIGIBILITY RULE itself
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('9 · findings — the head count and the charity', () => {
  /**
   * ⚠⚠ **INVERTED — FINDING `living-ancestor-dilutes-own-descendants` IS RESOLVED, and this suite
   * is what surfaced it. Inputs kept verbatim; only the amounts changed.**
   *
   * The finding read: the shipped rule made a LIVING descendant and ALL of their living descendants
   * simultaneous heads, so a beneficiary's own children diluted their share and a childless sibling
   * was paid a fraction of what a sibling-with-issue's branch collectively received — *while both
   * siblings were alive*. It argued from the owner's own words (*"when a generation dies, the
   * descendants in later generations CONTINUE as beneficiaries"*) that the intended model was the
   * child taking the parent's PLACE, and recorded the disagreement as a pin rather than a change,
   * because it is a fiqh decision (CLAUDE.md binding rule 4).
   *
   * **The product owner decided it on 2026-08-03, and decided it this way** — R-FRONTIER: *"son A's
   * child does not get since Son A is alive. Son A's child only gets anything if son A is dead."*
   * Entitlement sits at the nearest LIVING point on each line, so a living ancestor holds it and
   * their descendants wait (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, temporary).
   *
   * MEASURED BEFORE the correction, on these exact inputs:
   *   · 30,000,000 over three living heads ⇒ **10,000,000 each**, the childless brother s2 taking a
   *     THIRD rather than a half and s1's branch taking two thirds;
   *   · 50,000,000 over five living heads ⇒ s2 on **10,000,000** against 40,000,000 to the
   *     four-generation line — a living branch outvoting a living sibling 4:1 on fertility alone.
   */
  it('a LIVING son HOLDS his line — his own child is not a head, and does not halve his share', () => {
    const run = okRun(
      makeInput({
        ...money(30_000_000n),
        beneficiaries: [
          person('s1', 1, 'SON', null),
          person('s1-child', 2, 'SON', 's1'),
          person('s2', 1, 'SON', null),
        ],
      }),
    );
    // TWO heads while s1 lives: 30,000,000 ÷ 2 = 15,000,000 exactly, residual 0.
    expect(amount(run.lines, 's1')).toBe(15_000_000n);
    expect(amount(run.lines, 's2')).toBe(15_000_000n);
    expect(amount(run.lines, 's1-child')).toBe(0n);
    // The childless brother now takes a HALF — the branch's fertility buys it nothing.
    expect(amount(run.lines, 's1')).toBe(amount(run.lines, 's2'));

    // …and the child enters the moment his father dies. Still two heads: 15,000,000 each.
    const afterDeath = okRun(
      makeInput({
        ...money(30_000_000n),
        beneficiaries: [
          person('s1', 1, 'SON', null, { active: false }),
          person('s1-child', 2, 'SON', 's1'),
          person('s2', 1, 'SON', null),
        ],
      }),
    );
    expect(amount(afterDeath.lines, 's1-child')).toBe(15_000_000n);
    expect(amount(afterDeath.lines, 's2')).toBe(15_000_000n);
  });

  it('depth no longer compounds — a living four-generation line is ONE head, not four', () => {
    const run = okRun(
      makeInput({
        ...money(50_000_000n),
        beneficiaries: [
          person('s1', 1, 'SON', null),
          person('s1a', 2, 'SON', 's1'),
          person('s1b', 3, 'SON', 's1a'),
          person('s1c', 4, 'SON', 's1b'),
          person('s2', 1, 'SON', null),
        ],
      }),
    );
    // Two heads: 50,000,000 ÷ 2 = 25,000,000 exactly, residual 0.
    expect(amount(run.lines, 's2')).toBe(25_000_000n);
    expect(amount(run.lines, 's1')).toBe(25_000_000n);
    expect(['s1a', 's1b', 's1c'].reduce((sum, id) => sum + amount(run.lines, id), 0n)).toBe(0n);
    // The whole line collectively receives exactly what the childless sibling does — 1:1, not 4:1.
    expect(['s1', 's1a', 's1b', 's1c'].reduce((sum, id) => sum + amount(run.lines, id), 0n)).toBe(
      amount(run.lines, 's2'),
    );
  });

  /**
   * FINDING `jiha-paid-as-a-descendant` — a charity resolved by descent.
   *
   * `assertSingleWaqfNature` refuses a cohort holding BOTH a `CHARITABLE_JIHA` and a `FAMILY`
   * member, and refuses a lineage order on a `PUBLIC_CHARITABLE` waqf. It did not refuse the
   * remaining combination: a `FAMILY_DHURRI` waqf under `LINEAGE_CONTINUATION` whose cohort is a
   * charitable jiha ALONE. `buildLineage`'s `LINEAGE_LINK_MISSING` pass covers only `FAMILY` and
   * `CATEGORY_ONLY`, so the jiha simply sat outside the graph, had no ancestors, passed the ẓuhūr
   * test vacuously, and was paid 100% of the ghallah on a line stamped
   * `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — i.e. an official Arabic statement telling a charity that its
   * line of descent from the waqif continues.
   */
  /**
   * ⚠ **THE EXPECTED REFUSAL NOW DEPENDS ON THE DECLARED TYPE, and both are the right answer.**
   *
   * `FAMILY_DHURRI` + a jiha is refused by **R6-D1** (`CHARITABLE_JIHA_ON_FAMILY_WAQF`) on the type
   * alone, before the order is consulted — a refusal that did not exist when this test was written
   * and that is strictly wider than the one it asserted. `PUBLIC_CHARITABLE` + a lineage order is
   * still `LINEAGE_ORDER_ON_CHARITABLE_WAQF`. Asserting one code for both types would now be
   * asserting that the wider rule does not exist.
   */
  it('refuses a lineage order over a charitable jiha, whatever the declared waqfType', () => {
    const jiha = [
      person('jiha', 0, null, null, {
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        category: 'orphan care',
      }),
    ];
    for (const [waqfType, refusal] of [
      ['FAMILY_DHURRI', 'CHARITABLE_JIHA_ON_FAMILY_WAQF'],
      ['PUBLIC_CHARITABLE', 'LINEAGE_ORDER_ON_CHARITABLE_WAQF'],
    ] as const) {
      // ⚠ **`reversion` is null on this file's base, and after R7 both verdicts depend on it.** Stated
      // rather than inherited: a ذري deed that NAMES this jiha as its ultimate taker no longer trips
      // either refusal — see the sibling below, which proves the payload stays closed anyway.
      expectRefusal(() => runDistribution(makeInput({ waqfType, beneficiaries: jiha })), refusal);
    }
  });

  /**
   * ⚠⚠ **R7 · THE SIBLING THAT SHOWS THE NARROWED ARM DID NOT REOPEN THE MEASURED PAYLOAD.**
   *
   * `LINEAGE_ORDER_ON_CHARITABLE_WAQF`'s jiha arm and `CHARITABLE_JIHA_ON_FAMILY_WAQF` both now exempt a
   * jiha the deed names as its مآل, so the exact input above — a charity ALONE on a ذري waqf under
   * `LINEAGE_CONTINUATION` — clears both of them with a clause added. **It is still refused**, by a
   * different rule and for a better reason: `REVERSION_WITH_NO_RECORDED_BLOODLINE`. ∅ descendants is
   * *"not yet enrolled"*, not *"extinct"*, and the engine will not pay a charity because the family
   * register is incomplete.
   *
   * MEASURED before that refusal existed, on this same cohort: the jiha sat outside the graph, had no
   * ancestors, satisfied the ẓuhūr filter **vacuously**, and was PAID 100% of the ghallah on a line
   * stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — an official Arabic statement telling a charity that its
   * line of descent from the waqif continues. So the payload is closed by TWO independent means now: the
   * taker is default-excluded until the bloodline is over, and a bloodline-less register refuses outright.
   */
  it('R7 · a jiha ALONE with a valid مآل is still refused — for the empty register, not the order', () => {
    const jiha = [
      person('jiha', 0, null, null, {
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        category: 'orphan care',
      }),
    ];
    const clause = { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha'] };

    const refusal = expectRefusal(
      () =>
        runDistribution({
          ...baseRaw(),
          waqfType: 'FAMILY_DHURRI',
          beneficiaries: jiha,
          reversion: clause,
        }),
      'REVERSION_WITH_NO_RECORDED_BLOODLINE',
    );
    expect(refusal.details).toMatchObject({ recordedBloodlineCount: 0 });

    // …and the خيري arm stays ABSOLUTE: a clause on a charitable waqf is refused before the order is
    // even consulted, so the narrowing did not leak across the type boundary.
    expectRefusal(
      () =>
        runDistribution({
          ...baseRaw(),
          waqfType: 'PUBLIC_CHARITABLE',
          beneficiaries: jiha,
          reversion: clause,
        }),
      'REVERSION_ON_CHARITABLE_WAQF',
    );

    // …and with ONE deceased descendant enrolled, the same deed computes and the charity takes the
    // pool: 30,000,000 halalas over one taker at weight 10 over Σ 10 ⇒ 30,000,000, residual 0.
    // (This file's money is 30,000,000 distributable — see `money(30_000_000n)` on the base.)
    const enrolled = runDistribution({
      ...baseRaw(),
      waqfType: 'FAMILY_DHURRI',
      beneficiaries: [person('dead-son', 1, 'SON', null, { active: false }), ...jiha],
      reversion: clause,
    });
    expect(amount(enrolled.lines, 'jiha')).toBe(30_000_000n);
    expect(amount(enrolled.lines, 'dead-son')).toBe(0n);
    expect(enrolled.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  /**
   * ⚠ **RE-POINTED ONTO A وقف خيري — and the other half is now an INVERSION.**
   *
   * "A jiha is legal on the ORDERED and SHARED paths" was driven on this file's default
   * `FAMILY_DHURRI` waqf. R6-D1 refuses that whatever the order, so the scoping claim had to be
   * restated: the refusal is scoped **by the waqf's nature**, not by the entitlement order. On a
   * charitable waqf a jiha is entitled under both non-lineage orders; on a family waqf it is refused
   * under all of them.
   */
  it('a jiha is legal on the ORDERED and SHARED paths of a خيري waqf — the refusal is scoped by TYPE', () => {
    const jiha = [
      person('jiha', 0, null, null, {
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        category: 'orphan care',
      }),
    ];
    for (const entitlementOrder of ['ORDERED', 'SHARED'] as const) {
      const seen = verdicts(
        makeInput({
          waqfType: 'PUBLIC_CHARITABLE',
          entitlementOrder,
          continuationStipulation: null,
          beneficiaries: jiha,
        }),
      );
      expect(seen.get('jiha')).toBe('ENTITLED');

      // …and the SAME cohort on a ذري waqf is refused on the type, order irrelevant (R6-D1).
      expectRefusal(
        () =>
          resolveEntitlement(
            makeInput({
              waqfType: 'FAMILY_DHURRI',
              entitlementOrder,
              continuationStipulation: null,
              beneficiaries: jiha,
            }),
          ),
        'CHARITABLE_JIHA_ON_FAMILY_WAQF',
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 10 · The statement's own internal consistency (BR-505)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('10 · the entitlement basis printed on the Arabic statement', () => {
  /**
   * ⚠ PINS A DISPUTED BEHAVIOUR — FINDING `basis-line-uncrosschecked`.
   *
   * `basis.line` (ẓuhūr / buṭūn) is carried through from the input **verbatim** and is never compared
   * with the lineage graph the exclusion on the SAME line was derived from. So one statement can say
   * `line: ZUHUR` — "you are of the son-descendants" — and, two fields later,
   * `BUTUN_LINE_NOT_CONTINUED` — "your line is a daughter's". Both are printed as the entitlement
   * basis (BR-505 / NFR-01).
   *
   * ADR-0009 open question 4 asks whether `line` is *derivable*, and leaves it a recorded fact
   * deliberately because a waqif's own DAUGHTER's classification is not determined by the owner's
   * rules. That is a good reason not to derive it; it is not a reason to let the two halves of one
   * legal statement contradict each other with nothing raised. Pinned, not changed — deciding what
   * `line` means for a waqif's daughter is a fiqh call (CLAUDE.md binding rule 4).
   */
  it('⚠ can print line: ZUHUR beside BUTUN_LINE_NOT_CONTINUED, with nothing flagged', () => {
    const input = makeInput({
      beneficiaries: [
        person('s', 1, 'SON', null),
        person('s-dau', 2, 'DAUGHTER', 's'),
        // Mis-recorded `line`, which no check consults. Its EXCLUSION is derived correctly from the
        // graph; only the printed classification disagrees.
        person('s-dau-son', 3, 'SON', 's-dau', { line: 'ZUHUR' }),
      ],
    });
    const run = okRun(input);
    const line = run.lines.find((entry) => entry.beneficiaryId === 's-dau-son');
    expect(line?.reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(line?.basis.line).toBe('ZUHUR');
    expect(run.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
  });

  it('records the whole walk — the parent edge, the fiqh link and the deed term — on every line', () => {
    const run = okRun(
      makeInput({
        beneficiaries: [person('s', 1, 'SON', null), person('s-dau', 2, 'DAUGHTER', 's')],
      }),
    );
    const daughter = run.lines.find((entry) => entry.beneficiaryId === 's-dau');
    expect(daughter?.basis).toMatchObject({
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      lineageDepth: 2,
      tabaqa: 2,
      parentId: 's',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    });
  });

  it('names the OTHER lineage rule under ZUHUR_AND_BUTUN — the two are different legal statements', () => {
    const run = okRun(
      makeInput({
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [person('s', 1, 'SON', null), person('s-dau', 2, 'DAUGHTER', 's')],
      }),
    );
    for (const line of run.lines) {
      expect(line.basis.rule).toBe('LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN');
      expect(line.basis.continuationStipulation).toBe('ZUHUR_AND_BUTUN');
    }
  });
});
