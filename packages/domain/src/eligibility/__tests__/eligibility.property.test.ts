/**
 * `eligibility.property.test.ts` — the eligibility resolver's property suite (BR-109, NFR-09).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY PROPERTIES, WHEN THE INPUT SPACE IS FINITE AND SMALL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It genuinely is: `3⁶ × 2³ × 2 = 11 664` distinct inputs (six tri-state flags, three context booleans,
 * two subjects). So this file does something the distribution property suite cannot — it **enumerates
 * the entire space** for the laws that must hold universally, and uses fast-check for the *paired*
 * properties (monotonicity, context-independence) where the space is the space of input **pairs** and
 * enumeration would be 136 million cases.
 *
 * That split matters for honesty. An exhaustive law proven over 11 664 inputs is not "a property test
 * that passed"; it is a proof for this vocabulary. Where a property is sampled instead, the run count is
 * a named constant with its reason beside it, the same discipline as
 * `distribution.property.test.ts` — and the seed is pinned there and here, so a failure is reproducible
 * from the seed alone and this suite can never flake.
 *
 * ⚠ **`RUNS_LEAKAGE` and the E6 numbers are not touched by this file.** Nothing here changes the
 * distribution suite's budget; these are its own, smaller, and justified below.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RE-DERIVATION IS THE POINT (or the properties are tautologies)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `eligible === reasons.length === 0` is how the resolver computes `eligible`, so asserting it here
 * would prove nothing. {@link independentEligible} therefore re-derives the verdict from the FLAGS and
 * the CONTEXT directly — its own applicability table, written out longhand — so the two implementations
 * cross-check. If someone inverts the residency comparison in `resolve.ts`, this file's expectation does
 * not move with it.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CRITERION_REASON,
  ELIGIBILITY_CRITERIA,
  ELIGIBILITY_REASON_CODES,
  ELIGIBILITY_SUBJECTS,
} from '../contract.js';
import type {
  EligibilityContext,
  EligibilityCriterion,
  EligibilityFlags,
  EligibilityReasonCode,
  EligibilitySubject,
} from '../contract.js';
import { applicabilityOf, resolveDeedEligibility, resolveEligibility } from '../resolve.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Budget
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Pinned, same value as the distribution suite's, so a failure here is reproducible too. */
const SEED = 0x51_4d_55_4c; // "QMUL"

/**
 * Paired properties (monotonicity, context-independence) compare TWO verdicts per case, and the space
 * of pairs is ~1.4×10⁸ — far past enumeration. 2 000 is generous for a resolver whose branching factor
 * is six criteria wide: the space of *interesting* pairs (one flag differing) is only ~35 000, so this
 * samples several percent of it while the whole file still runs in milliseconds.
 */
const RUNS_PAIRED = 2_000;

/** Single-verdict sampled properties. Cheaper still; used where an exhaustive loop would be noise. */
const RUNS_SINGLE = 3_000;

function config(numRuns: number): fc.Parameters<unknown> {
  return { numRuns, seed: SEED };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Generators
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `true` | `false` | `null` — the three states a recorded eligibility fact can be in. */
const triState = fc.constantFrom<boolean | null>(true, false, null);

const flagsArb: fc.Arbitrary<EligibilityFlags> = fc.record({
  ISLAM: triState,
  LEGAL_CAPACITY: triState,
  NO_DISQUALIFYING_REMOVAL: triState,
  KSA_RESIDENCY: triState,
  SAUDI_NATIONALITY_WHERE_REQUIRED: triState,
  AUTHORITY_LICENSED: triState,
});

const contextArb: fc.Arbitrary<EligibilityContext> = fc.record({
  endowerIsForeign: fc.boolean(),
  holdsRealProperty: fc.boolean(),
  nazirIsLegalPerson: fc.boolean(),
});

const subjectArb: fc.Arbitrary<EligibilitySubject> = fc.constantFrom(...ELIGIBILITY_SUBJECTS);

const criterionArb: fc.Arbitrary<EligibilityCriterion> = fc.constantFrom(...ELIGIBILITY_CRITERIA);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The independent re-derivation — deliberately written LONGHAND
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Does this criterion bind, re-derived from BR-109's sentences rather than from `applicabilityOf`?
 *
 * Written out as a flat table on purpose. Calling `applicabilityOf` here would make every property below
 * a tautology, and a shared helper would let one edit move both sides at once — which is exactly how a
 * mutation survives a property suite.
 */
function independentlyBinds(
  criterion: EligibilityCriterion,
  subject: EligibilitySubject,
  context: EligibilityContext,
): boolean {
  const isRep = subject === 'AUTHORIZED_REPRESENTATIVE';
  if (criterion === 'ISLAM') return true;
  if (criterion === 'LEGAL_CAPACITY') return true;
  if (criterion === 'NO_DISQUALIFYING_REMOVAL') return true;
  if (criterion === 'KSA_RESIDENCY') return true;
  if (criterion === 'SAUDI_NATIONALITY_WHERE_REQUIRED') {
    // BR-109: "Saudi nationality where the endower is foreign AND the asset is real property".
    // Undecided — and therefore non-binding — on a representative (surfaced, not resolved).
    return isRep ? false : context.endowerIsForeign && context.holdsRealProperty;
  }
  // AUTHORITY_LICENSED — "(for a legal-person Nazir) Authority licensing".
  return isRep ? false : context.nazirIsLegalPerson;
}

/** The verdict, re-derived. `null` is never a pass; a binding criterion must be exactly `true`. */
function independentEligible(
  flags: EligibilityFlags,
  subject: EligibilitySubject,
  context: EligibilityContext,
): boolean {
  return ELIGIBILITY_CRITERIA.every(
    (criterion) => !independentlyBinds(criterion, subject, context) || flags[criterion] === true,
  );
}

/** The expected reason list, re-derived: vocabulary order, `ELIGIBILITY_NOT_ASSESSED` deduped. */
function independentReasons(
  flags: EligibilityFlags,
  subject: EligibilitySubject,
  context: EligibilityContext,
): EligibilityReasonCode[] {
  const reasons: EligibilityReasonCode[] = [];
  for (const criterion of ELIGIBILITY_CRITERIA) {
    if (!independentlyBinds(criterion, subject, context)) continue;
    const recorded = flags[criterion];
    if (recorded === true) continue;
    const code = recorded === null ? 'ELIGIBILITY_NOT_ASSESSED' : CRITERION_REASON[criterion];
    if (!reasons.includes(code)) reasons.push(code);
  }
  return reasons;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Exhaustive enumeration of the WHOLE input space
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const TRI: readonly (boolean | null)[] = [true, false, null];

/** Every flag combination: 3⁶ = 729. */
function* allFlags(): Generator<EligibilityFlags> {
  for (const islam of TRI)
    for (const capacity of TRI)
      for (const removal of TRI)
        for (const residency of TRI)
          for (const nationality of TRI)
            for (const licensed of TRI)
              yield {
                ISLAM: islam,
                LEGAL_CAPACITY: capacity,
                NO_DISQUALIFYING_REMOVAL: removal,
                KSA_RESIDENCY: residency,
                SAUDI_NATIONALITY_WHERE_REQUIRED: nationality,
                AUTHORITY_LICENSED: licensed,
              };
}

/** Every context: 2³ = 8. */
function* allContexts(): Generator<EligibilityContext> {
  for (const endowerIsForeign of [true, false])
    for (const holdsRealProperty of [true, false])
      for (const nazirIsLegalPerson of [true, false])
        yield { endowerIsForeign, holdsRealProperty, nazirIsLegalPerson };
}

describe('P0 · the ENTIRE input space, enumerated (729 × 8 × 2 = 11 664 verdicts)', () => {
  it('agrees with an independent re-derivation on eligibility AND on the reason list', () => {
    let cases = 0;
    let eligibleCount = 0;
    let residencyBlocks = 0;
    let notAssessedBlocks = 0;

    for (const flags of allFlags()) {
      for (const context of allContexts()) {
        for (const subject of ELIGIBILITY_SUBJECTS) {
          const verdict = resolveEligibility({ subject, flags, context });
          cases += 1;

          expect(verdict.eligible, JSON.stringify({ subject, flags, context })).toBe(
            independentEligible(flags, subject, context),
          );
          expect(verdict.reasons, JSON.stringify({ subject, flags, context })).toStrictEqual(
            independentReasons(flags, subject, context),
          );

          // The law the exit clause rests on: empty reasons iff eligible. Asserted over the whole
          // space, so "blocked with no reason" and "a reason with no block" are both impossible.
          expect(verdict.eligible).toBe(verdict.reasons.length === 0);

          if (verdict.eligible) eligibleCount += 1;
          if (verdict.reasons.includes('KSA_RESIDENCY_REQUIRED')) residencyBlocks += 1;
          if (verdict.reasons.includes('ELIGIBILITY_NOT_ASSESSED')) notAssessedBlocks += 1;
        }
      }
    }

    // ⚠ COVERAGE, ASSERTED. The R6-C1 lesson, in one paragraph: a property whose generator cannot reach
    // a configuration reports its silence as success, at scale. An enumeration that produced only
    // ineligible verdicts, or never reached the residency block, would satisfy every assertion above.
    expect(cases).toBe(729 * 8 * 2);
    expect(eligibleCount).toBeGreaterThan(0);
    expect(eligibleCount).toBeLessThan(cases);
    expect(residencyBlocks).toBeGreaterThan(0);
    expect(notAssessedBlocks).toBeGreaterThan(0);
  });

  it('reports all six criteria, in vocabulary order, on every one of them', () => {
    for (const flags of allFlags()) {
      for (const context of allContexts()) {
        for (const subject of ELIGIBILITY_SUBJECTS) {
          const verdict = resolveEligibility({ subject, flags, context });
          expect(verdict.criteria.map((outcome) => outcome.criterion)).toStrictEqual([
            ...ELIGIBILITY_CRITERIA,
          ]);
          // A reason code is set iff the criterion binds and is not satisfied — the invariant that keeps
          // `reasons` and `criteria` from telling two different stories.
          for (const outcome of verdict.criteria) {
            const binds = outcome.applicability === 'REQUIRED';
            expect(outcome.reasonCode !== null).toBe(binds && outcome.satisfied !== true);
            expect(outcome.unverified).toBe(true);
          }
        }
      }
    }
  });

  it('never emits a code outside the closed vocabulary, and never a bare boolean verdict', () => {
    for (const flags of allFlags()) {
      const verdict = resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags,
        context: { endowerIsForeign: true, holdsRealProperty: true, nazirIsLegalPerson: true },
      });
      for (const reason of verdict.reasons) {
        expect(ELIGIBILITY_REASON_CODES as readonly string[]).toContain(reason);
      }
      // The verdict is a structure, always — the exit clause's "with a clear reason" is not satisfiable
      // by a boolean, and a caller must not be able to receive one by accident.
      expect(Array.isArray(verdict.criteria)).toBe(true);
      expect(verdict.unverifiedNotes).toHaveLength(1);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Sampled properties over PAIRS of inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('P1 · monotonicity — weakening a fact can never GAIN a seat', () => {
  it('true → false and true → null are one-way: eligibility may be lost, never won', () => {
    fc.assert(
      fc.property(
        flagsArb,
        contextArb,
        subjectArb,
        criterionArb,
        (flags, context, subject, criterion) => {
          const strong: EligibilityFlags = { ...flags, [criterion]: true };
          const before = resolveEligibility({ subject, flags: strong, context }).eligible;

          for (const weaker of [false, null] as const) {
            const after = resolveEligibility({
              subject,
              flags: { ...strong, [criterion]: weaker },
              context,
            }).eligible;
            // `after ⇒ before`. The fail-safe direction, as an implication: no weakening of a recorded
            // fact may ever turn a refusal into a seat.
            expect(!after || before).toBe(true);
          }
          return true;
        },
      ),
      config(RUNS_PAIRED),
    );
  });

  it('and STRENGTHENING a fact can never lose a seat', () => {
    fc.assert(
      fc.property(
        flagsArb,
        contextArb,
        subjectArb,
        criterionArb,
        (flags, context, subject, criterion) => {
          const before = resolveEligibility({ subject, flags, context }).eligible;
          const after = resolveEligibility({
            subject,
            flags: { ...flags, [criterion]: true },
            context,
          }).eligible;
          expect(!before || after).toBe(true);
          return true;
        },
      ),
      config(RUNS_PAIRED),
    );
  });
});

describe('P2 · the four unconditional criteria are CONTEXT-BLIND', () => {
  it('changing the context never changes their applicability or their reason', () => {
    // Stated because the two conditional criteria are the only ones the context may touch. A refactor
    // that made, say, residency depend on `nazirIsLegalPerson` would pass every table-driven test that
    // happened to use one context.
    fc.assert(
      fc.property(flagsArb, contextArb, contextArb, subjectArb, (flags, a, b, subject) => {
        for (const criterion of [
          'ISLAM',
          'LEGAL_CAPACITY',
          'NO_DISQUALIFYING_REMOVAL',
          'KSA_RESIDENCY',
        ] as const) {
          expect(applicabilityOf(criterion, subject, a)).toBe('REQUIRED');
          expect(applicabilityOf(criterion, subject, b)).toBe('REQUIRED');

          const inA = resolveEligibility({ subject, flags, context: a }).criteria.find(
            (outcome) => outcome.criterion === criterion,
          );
          const inB = resolveEligibility({ subject, flags, context: b }).criteria.find(
            (outcome) => outcome.criterion === criterion,
          );
          expect(inA).toStrictEqual(inB);
        }
        return true;
      }),
      config(RUNS_PAIRED),
    );
  });
});

describe('P3 · `null` is never a pass, sampled independently of the enumeration', () => {
  it('any binding criterion recorded null ⇒ refused, and ELIGIBILITY_NOT_ASSESSED is named', () => {
    fc.assert(
      fc.property(flagsArb, contextArb, subjectArb, (flags, context, subject) => {
        const verdict = resolveEligibility({ subject, flags, context });
        const bindingNulls = ELIGIBILITY_CRITERIA.filter(
          (criterion) =>
            applicabilityOf(criterion, subject, context) === 'REQUIRED' &&
            flags[criterion] === null,
        );
        if (bindingNulls.length > 0) {
          expect(verdict.eligible).toBe(false);
          expect(verdict.reasons).toContain('ELIGIBILITY_NOT_ASSESSED');
          expect([...verdict.notAssessed]).toStrictEqual(bindingNulls);
        } else {
          expect(verdict.reasons).not.toContain('ELIGIBILITY_NOT_ASSESSED');
          expect(verdict.notAssessed).toStrictEqual([]);
        }
        return true;
      }),
      config(RUNS_SINGLE),
    );
  });
});

describe('P4 · KSA residency is the hard rule (BO Standards Art. 8(1), ⚠ unverified)', () => {
  it('residency FALSE always refuses — every context, every subject, every other flag', () => {
    // ⚠ THE MUTATION TARGET. Inverting the `KSA_RESIDENCY` comparison in `resolve.ts` must kill tests in
    // MORE THAN ONE FILE; this is the second file, and this property is the reason. It is written to be
    // independent of the reason-list assertions above — it asserts only the block.
    fc.assert(
      fc.property(flagsArb, contextArb, subjectArb, (flags, context, subject) => {
        const verdict = resolveEligibility({
          subject,
          flags: { ...flags, KSA_RESIDENCY: false },
          context,
        });
        expect(verdict.eligible).toBe(false);
        expect(verdict.reasons).toContain('KSA_RESIDENCY_REQUIRED');
        return true;
      }),
      config(RUNS_SINGLE),
    );
  });

  it('and a deed is refused whenever EITHER subject is non-resident', () => {
    fc.assert(
      fc.property(
        flagsArb,
        flagsArb,
        contextArb,
        fc.boolean(),
        (primary, rep, context, repFails) => {
          const deed = resolveDeedEligibility({
            primary: { ...primary, KSA_RESIDENCY: repFails ? true : false },
            representative: { ...rep, KSA_RESIDENCY: repFails ? false : true },
            context,
          });
          expect(deed.eligible).toBe(false);
          expect(deed.reasons).toContain('KSA_RESIDENCY_REQUIRED');
          return true;
        },
      ),
      config(RUNS_SINGLE),
    );
  });
});

describe('P5 · a deed is seatable iff BOTH subjects are', () => {
  it('the conjunction holds, and a missing representative is not a failure', () => {
    fc.assert(
      fc.property(flagsArb, flagsArb, contextArb, fc.boolean(), (primary, rep, context, hasRep) => {
        const deed = resolveDeedEligibility({
          primary,
          representative: hasRep ? rep : null,
          context,
        });
        const primaryOk = independentEligible(primary, 'PRIMARY_NAZIR', context);
        const repOk = hasRep
          ? independentEligible(rep, 'AUTHORIZED_REPRESENTATIVE', context)
          : true;
        expect(deed.eligible).toBe(primaryOk && repOk);
        // Every reason on the deed came from one of the two subjects — the deed mints none of its own.
        const fromSubjects = new Set<string>([
          ...deed.primary.reasons,
          ...(deed.representative?.reasons ?? []),
        ]);
        for (const reason of deed.reasons) expect(fromSubjects.has(reason)).toBe(true);
        return true;
      }),
      config(RUNS_PAIRED),
    );
  });
});

describe('P6 · purity', () => {
  it('never mutates its arguments and is idempotent', () => {
    fc.assert(
      fc.property(flagsArb, contextArb, subjectArb, (flags, context, subject) => {
        const snapshot = JSON.stringify({ flags, context });
        const first = resolveEligibility({ subject, flags, context });
        const second = resolveEligibility({ subject, flags, context });
        expect(JSON.stringify({ flags, context })).toBe(snapshot);
        expect(first).toStrictEqual(second);
        return true;
      }),
      config(RUNS_SINGLE),
    );
  });
});
