/**
 * `eligibility.test.ts` — BR-109 / NFR-09, and the §17 E3 exit clause "an ineligible Nazir
 * (non-resident) is blocked **with a clear reason**".
 *
 * The clause has two halves and a test suite can pass while proving only the first. So this file drives
 * both, separately:
 *
 *  · **blocked** — `ksaResident: false` ⇒ `eligible: false`;
 *  · **with a clear reason** — the verdict names `KSA_RESIDENCY_REQUIRED`, and every *other* criterion is
 *    still reported with its applicability, so the surface can show what was checked rather than only
 *    what failed.
 *
 * Every single-flag-false case is driven, not just residency, because a resolver that hard-coded the
 * residency check and ignored the other five would satisfy the exit clause and be wrong.
 *
 * ⚠ Mutation-check for the exit clause: inverting the `KSA_RESIDENCY` comparison must kill tests in
 * **more than one file** — here and in `eligibility.property.test.ts`. That is why the residency
 * assertions are duplicated across the two rather than centralised into one helper.
 */

import { describe, expect, it } from 'vitest';

import { DomainError, isDomainError } from '../../errors.js';
import { UNVERIFIED_NOTE } from '../../settings.js';
import {
  CRITERION_APPLICABILITIES,
  CRITERION_AUTHORITY,
  CRITERION_REASON,
  ELIGIBILITY_CRITERIA,
  ELIGIBILITY_REASON_CODES,
  ELIGIBILITY_SUBJECTS,
  eligibilityContextSchema,
  eligibilityFlagsSchema,
  isEligibilityCriterion,
  isEligibilityReasonCode,
  isEligibilitySubject,
} from '../contract.js';
import type { EligibilityContext, EligibilityCriterion, EligibilityFlags } from '../contract.js';
import {
  applicabilityOf,
  assertDeedEligible,
  resolveDeedEligibility,
  resolveEligibility,
} from '../resolve.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fixtures — all invented; no real person, no client data
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Every criterion satisfied. The baseline a single-flag mutation is applied to. */
const ALL_TRUE: EligibilityFlags = Object.freeze({
  ISLAM: true,
  LEGAL_CAPACITY: true,
  NO_DISQUALIFYING_REMOVAL: true,
  KSA_RESIDENCY: true,
  SAUDI_NATIONALITY_WHERE_REQUIRED: true,
  AUTHORITY_LICENSED: true,
});

/** The plain case: a Saudi natural-person Nazir, a domestic endower — neither condition binds. */
const PLAIN: EligibilityContext = Object.freeze({
  endowerIsForeign: false,
  holdsRealProperty: false,
  nazirIsLegalPerson: false,
});

/** Both conditions bind: a foreign endower holding real property, with a legal-person Nazir. */
const BOTH_CONDITIONS: EligibilityContext = Object.freeze({
  endowerIsForeign: true,
  holdsRealProperty: true,
  nazirIsLegalPerson: true,
});

const withFlag = (
  criterion: EligibilityCriterion,
  value: boolean | null,
  base: EligibilityFlags = ALL_TRUE,
): EligibilityFlags => Object.freeze({ ...base, [criterion]: value });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The vocabulary itself
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the vocabulary is closed and internally consistent', () => {
  it('has six criteria, seven reason codes and two subjects', () => {
    expect(ELIGIBILITY_CRITERIA).toHaveLength(6);
    expect(ELIGIBILITY_REASON_CODES).toHaveLength(7);
    expect(ELIGIBILITY_SUBJECTS).toStrictEqual(['PRIMARY_NAZIR', 'AUTHORIZED_REPRESENTATIVE']);
    expect(CRITERION_APPLICABILITIES).toStrictEqual([
      'REQUIRED',
      'NOT_APPLICABLE',
      'UNDECIDED_SURFACED',
    ]);
  });

  it('maps every criterion to a distinct reason code, and names an authority for each', () => {
    // `CRITERION_REASON` is exhaustive by type, so this checks the *values*: two criteria sharing a code
    // would give two different regulatory conditions one ar/en sentence, which is how a beneficiary or a
    // Nazir is told the wrong thing about why a seat was refused.
    const codes = ELIGIBILITY_CRITERIA.map((criterion) => CRITERION_REASON[criterion]);
    expect(new Set(codes).size).toBe(ELIGIBILITY_CRITERIA.length);
    for (const code of codes) expect(isEligibilityReasonCode(code)).toBe(true);
    // …and `ELIGIBILITY_NOT_ASSESSED` is NOT any criterion's own code — it is the shared one.
    expect(codes).not.toContain('ELIGIBILITY_NOT_ASSESSED');
    for (const criterion of ELIGIBILITY_CRITERIA) {
      expect(CRITERION_AUTHORITY[criterion].length).toBeGreaterThan(20);
    }
  });

  it('⚠ marks every authority line as unverified (binding rule 3)', () => {
    // Not decoration. These are readings of Nazarah Art. 5 and the BO Standards as summarised in docs/,
    // not confirmed against the Arabic originals — and the residency block is the most consequential
    // thing this module does.
    for (const criterion of ELIGIBILITY_CRITERIA) {
      expect(CRITERION_AUTHORITY[criterion], criterion).toContain('⚠ unverified');
    }
  });

  it('guards recognise their own members and reject near-misses', () => {
    expect(isEligibilityCriterion('KSA_RESIDENCY')).toBe(true);
    expect(isEligibilityCriterion('ksa_residency')).toBe(false);
    expect(isEligibilityCriterion('KSA_RESIDENT')).toBe(false);
    expect(isEligibilityReasonCode('KSA_RESIDENCY_REQUIRED')).toBe(true);
    expect(isEligibilityReasonCode('NAZIR_INELIGIBLE')).toBe(false);
    expect(isEligibilitySubject('PRIMARY_NAZIR')).toBe(true);
    expect(isEligibilitySubject('NAZIR')).toBe(false);
  });

  it('has no zod .default() anywhere — a missing key does not parse', () => {
    // The distinction the whole module turns on: "the caller forgot to send residency" and "the caller
    // says residency is unassessed" must be DIFFERENT inputs. A `.default()` collapses them, and the
    // collapsed form is a granted seat.
    const partial = { ISLAM: true, LEGAL_CAPACITY: true, NO_DISQUALIFYING_REMOVAL: true };
    expect(eligibilityFlagsSchema.safeParse(partial).success).toBe(false);
    expect(eligibilityFlagsSchema.safeParse({ ...ALL_TRUE }).success).toBe(true);
    expect(eligibilityFlagsSchema.safeParse({ ...ALL_TRUE, KSA_RESIDENCY: null }).success).toBe(
      true,
    );
    // …and a nullable key may not be omitted either.
    const { KSA_RESIDENCY: _omitted, ...missingResidency } = ALL_TRUE;
    expect(eligibilityFlagsSchema.safeParse(missingResidency).success).toBe(false);

    expect(eligibilityContextSchema.safeParse({ endowerIsForeign: true }).success).toBe(false);
    expect(eligibilityContextSchema.safeParse(PLAIN).success).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE EXIT CLAUSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§17 E3 exit · a non-resident Nazir is blocked WITH A CLEAR REASON', () => {
  const flags = withFlag('KSA_RESIDENCY', false);
  const verdict = resolveEligibility({ subject: 'PRIMARY_NAZIR', flags, context: PLAIN });

  it('blocks', () => {
    expect(verdict.eligible).toBe(false);
  });

  it('names KSA_RESIDENCY_REQUIRED, and nothing else', () => {
    // "and nothing else" is the half that makes the reason CLEAR: a refusal listing six codes because
    // the resolver failed open on the unassessed ones tells a Nazir nothing actionable.
    expect(verdict.reasons).toStrictEqual(['KSA_RESIDENCY_REQUIRED']);
  });

  it('still reports what WAS checked, criterion by criterion', () => {
    // A screen that can only say "refused: residency" cannot show that religion, capacity and removal
    // history were assessed and passed — which is what a Nazir disputing a refusal will ask for.
    expect(verdict.criteria).toHaveLength(6);
    expect(verdict.criteria.map((outcome) => outcome.criterion)).toStrictEqual([
      ...ELIGIBILITY_CRITERIA,
    ]);
    const residency = verdict.criteria.find((outcome) => outcome.criterion === 'KSA_RESIDENCY');
    expect(residency).toMatchObject({
      applicability: 'REQUIRED',
      satisfied: false,
      reasonCode: 'KSA_RESIDENCY_REQUIRED',
      unverified: true,
    });
    for (const criterion of ['ISLAM', 'LEGAL_CAPACITY', 'NO_DISQUALIFYING_REMOVAL'] as const) {
      expect(
        verdict.criteria.find((outcome) => outcome.criterion === criterion),
        criterion,
      ).toMatchObject({ applicability: 'REQUIRED', satisfied: true, reasonCode: null });
    }
  });

  it('carries the ⚠ unverified marker with the verdict, byte-identical to the Setting marker', () => {
    expect(verdict.unverifiedNotes).toStrictEqual([UNVERIFIED_NOTE]);
  });

  it('refuses the whole DEED, before any write, as a typed NAZIR_INELIGIBLE', () => {
    const deed = resolveDeedEligibility({ primary: flags, representative: null, context: PLAIN });
    expect(deed.eligible).toBe(false);
    expect(deed.reasons).toStrictEqual(['KSA_RESIDENCY_REQUIRED']);

    let thrown: unknown;
    try {
      assertDeedEligible(deed);
    } catch (error) {
      thrown = error;
    }
    expect(isDomainError(thrown)).toBe(true);
    const error = thrown as DomainError;
    expect(error.code).toBe('NAZIR_INELIGIBLE');
    // The api maps this to BAD_REQUEST; the surface renders `errors.domain.NAZIR_INELIGIBLE` and shows
    // the reason list. Both need the codes to be here, in `details`.
    expect(error.messageKey).toBe('errors.domain.NAZIR_INELIGIBLE');
    expect(error.details?.reasons).toStrictEqual(['KSA_RESIDENCY_REQUIRED']);
  });

  it('carries NO personal fact in the error — not a name, not an id', () => {
    // An eligibility refusal is about a named individual's religion, capacity and criminal record. The
    // resolver never takes a name, so this is structural; asserted anyway, because the first "helpful"
    // addition to `details` would be the candidate's name.
    const deed = resolveDeedEligibility({ primary: flags, representative: null, context: PLAIN });
    let thrown: unknown;
    try {
      assertDeedEligible(deed);
    } catch (error) {
      thrown = error;
    }
    const serialized = JSON.stringify((thrown as DomainError).toJSON());
    for (const token of ELIGIBILITY_REASON_CODES) {
      // sanity: the serialized form is made of vocabulary
      expect(typeof token).toBe('string');
    }
    // Anything that is not a vocabulary member, a key name, the unverified note or English prose from
    // the message would show up as an unexpected quoted string. The cheap, durable check is that the
    // reason payload is a subset of the closed vocabulary.
    const reasons = (thrown as DomainError).details?.reasons as readonly string[];
    for (const reason of reasons) expect(isEligibilityReasonCode(reason)).toBe(true);
    expect(serialized).not.toContain('@');
  });

  it('does NOT throw when the deed is eligible', () => {
    const ok = resolveDeedEligibility({ primary: ALL_TRUE, representative: null, context: PLAIN });
    expect(ok.eligible).toBe(true);
    expect(() => {
      assertDeedEligible(ok);
    }).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every single-flag failure, and every single-flag omission
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('every criterion is actually evaluated, one flag at a time', () => {
  // Driven under BOTH_CONDITIONS so all six criteria bind — otherwise the two conditional rows would
  // pass vacuously and the suite would be silent about them, which is the R6-C1 lesson: a property whose
  // generator cannot reach a configuration reports its silence as success.
  it.each(ELIGIBILITY_CRITERIA.map((criterion) => [criterion] as const))(
    '%s recorded FALSE blocks the seat with its own code',
    (criterion) => {
      const verdict = resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags: withFlag(criterion, false),
        context: BOTH_CONDITIONS,
      });
      expect(verdict.eligible).toBe(false);
      expect(verdict.reasons).toStrictEqual([CRITERION_REASON[criterion]]);
      expect(verdict.notAssessed).toStrictEqual([]);
    },
  );

  it.each(ELIGIBILITY_CRITERIA.map((criterion) => [criterion] as const))(
    '%s recorded NULL blocks with ELIGIBILITY_NOT_ASSESSED — never a pass',
    (criterion) => {
      const verdict = resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags: withFlag(criterion, null),
        context: BOTH_CONDITIONS,
      });
      expect(verdict.eligible).toBe(false);
      expect(verdict.reasons).toStrictEqual(['ELIGIBILITY_NOT_ASSESSED']);
      // The code is shared; WHICH criterion was not assessed is data, so the caller can say what to go
      // and check without needing six ar/en messages for one operational condition.
      expect(verdict.notAssessed).toStrictEqual([criterion]);
    },
  );

  it('all six satisfied under both conditions ⇒ eligible, with no reasons', () => {
    const verdict = resolveEligibility({
      subject: 'PRIMARY_NAZIR',
      flags: ALL_TRUE,
      context: BOTH_CONDITIONS,
    });
    expect(verdict.eligible).toBe(true);
    expect(verdict.reasons).toStrictEqual([]);
    expect(verdict.notAssessed).toStrictEqual([]);
  });

  it('reports several failures in vocabulary order, with NOT_ASSESSED deduped to one', () => {
    const flags: EligibilityFlags = Object.freeze({
      ISLAM: null,
      LEGAL_CAPACITY: null,
      NO_DISQUALIFYING_REMOVAL: false,
      KSA_RESIDENCY: false,
      SAUDI_NATIONALITY_WHERE_REQUIRED: true,
      AUTHORITY_LICENSED: true,
    });
    const verdict = resolveEligibility({
      subject: 'PRIMARY_NAZIR',
      flags,
      context: BOTH_CONDITIONS,
    });
    // Order is ELIGIBILITY_CRITERIA order: ISLAM (null → NOT_ASSESSED, first), LEGAL_CAPACITY (null,
    // deduped away), NO_DISQUALIFYING_REMOVAL, KSA_RESIDENCY.
    expect(verdict.reasons).toStrictEqual([
      'ELIGIBILITY_NOT_ASSESSED',
      'DISQUALIFYING_REMOVAL_RECORDED',
      'KSA_RESIDENCY_REQUIRED',
    ]);
    expect(verdict.notAssessed).toStrictEqual(['ISLAM', 'LEGAL_CAPACITY']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The two conditional criteria bind ONLY on their context
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the conditional criteria bind on their CONTEXT, and are irrelevant otherwise', () => {
  /** All four (endowerIsForeign × holdsRealProperty) combinations, with the expected binding. */
  const NATIONALITY_CASES = [
    [false, false, 'NOT_APPLICABLE'],
    [true, false, 'NOT_APPLICABLE'],
    [false, true, 'NOT_APPLICABLE'],
    [true, true, 'REQUIRED'],
  ] as const;

  it.each(NATIONALITY_CASES)(
    'endowerIsForeign=%s holdsRealProperty=%s ⇒ nationality is %s',
    (endowerIsForeign, holdsRealProperty, expected) => {
      const context: EligibilityContext = {
        endowerIsForeign,
        holdsRealProperty,
        nazirIsLegalPerson: false,
      };
      // `&&` not `||` — either half alone is NOT the rule, and widening it would block seats the
      // regulation does not block. This table is the only place that distinction is provable.
      expect(applicabilityOf('SAUDI_NATIONALITY_WHERE_REQUIRED', 'PRIMARY_NAZIR', context)).toBe(
        expected,
      );

      const verdict = resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags: withFlag('SAUDI_NATIONALITY_WHERE_REQUIRED', false),
        context,
      });
      expect(verdict.eligible).toBe(expected !== 'REQUIRED');
    },
  );

  it('a NULL nationality flag is a refusal only where the rule binds', () => {
    const bindingContext: EligibilityContext = {
      endowerIsForeign: true,
      holdsRealProperty: true,
      nazirIsLegalPerson: false,
    };
    expect(
      resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags: withFlag('SAUDI_NATIONALITY_WHERE_REQUIRED', null),
        context: bindingContext,
      }).reasons,
    ).toStrictEqual(['ELIGIBILITY_NOT_ASSESSED']);
    expect(
      resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags: withFlag('SAUDI_NATIONALITY_WHERE_REQUIRED', null),
        context: PLAIN,
      }).eligible,
    ).toBe(true);
  });

  it('licensing binds iff the Nazir is a LEGAL PERSON', () => {
    for (const nazirIsLegalPerson of [true, false]) {
      const context: EligibilityContext = {
        endowerIsForeign: false,
        holdsRealProperty: false,
        nazirIsLegalPerson,
      };
      expect(applicabilityOf('AUTHORITY_LICENSED', 'PRIMARY_NAZIR', context)).toBe(
        nazirIsLegalPerson ? 'REQUIRED' : 'NOT_APPLICABLE',
      );
      const verdict = resolveEligibility({
        subject: 'PRIMARY_NAZIR',
        flags: withFlag('AUTHORITY_LICENSED', null),
        context,
      });
      expect(verdict.eligible).toBe(!nazirIsLegalPerson);
    }
  });

  it('a recorded FALSE on a non-binding criterion is reported, not erased', () => {
    // The fact is not deleted because it does not bind here. A reader can see the endowment recorded a
    // negative answer to a question it did not have to ask — and if the context is later corrected to
    // "foreign endower, real property", that recorded `false` becomes a refusal without any new data.
    const verdict = resolveEligibility({
      subject: 'PRIMARY_NAZIR',
      flags: withFlag('SAUDI_NATIONALITY_WHERE_REQUIRED', false),
      context: PLAIN,
    });
    expect(verdict.eligible).toBe(true);
    expect(
      verdict.criteria.find((outcome) => outcome.criterion === 'SAUDI_NATIONALITY_WHERE_REQUIRED'),
    ).toMatchObject({ applicability: 'NOT_APPLICABLE', satisfied: false, reasonCode: null });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The authorized representative (BR-109's other half)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the authorized representative is assessed too — BR-109 says "Nazir AND representative"', () => {
  it('blocks a NON-RESIDENT representative, which passed unchecked before S4', () => {
    // The whole reason migration 12 added the four `rep*` columns: a representative jointly and severally
    // liable under Nazarah Art. 11(5) was previously not assessed at all. ⚠ Fail-safe reading of BO
    // Standards Art. 8(1); whether it blocks or merely flags is surfaced, not resolved.
    const deed = resolveDeedEligibility({
      primary: ALL_TRUE,
      representative: withFlag('KSA_RESIDENCY', false),
      context: PLAIN,
    });
    expect(deed.primary.eligible).toBe(true);
    expect(deed.representative?.eligible).toBe(false);
    // …and the DEED is refused, because the conjunction is what "seatable" means.
    expect(deed.eligible).toBe(false);
    expect(deed.reasons).toStrictEqual(['KSA_RESIDENCY_REQUIRED']);
    expect(() => {
      assertDeedEligible(deed);
    }).toThrow(DomainError);
  });

  it('`representative: null` means NONE RECORDED and is not a failure', () => {
    const deed = resolveDeedEligibility({
      primary: ALL_TRUE,
      representative: null,
      context: BOTH_CONDITIONS,
    });
    expect(deed.representative).toBeNull();
    expect(deed.eligible).toBe(true);
  });

  it('⚠ SURFACED · reports the two conditional criteria as UNDECIDED on a representative, never as a pass', () => {
    // Refusing here would be a PERMANENT block — `TrusteeshipDeed` has no column for a representative's
    // nationality or licence, so the criterion could only ever read `null`. Treating them as
    // NOT_APPLICABLE would be Claude answering a legal question by omission. So: undecided, reported.
    const verdict = resolveEligibility({
      subject: 'AUTHORIZED_REPRESENTATIVE',
      flags: withFlag(
        'SAUDI_NATIONALITY_WHERE_REQUIRED',
        null,
        withFlag('AUTHORITY_LICENSED', null),
      ),
      context: BOTH_CONDITIONS,
    });
    for (const criterion of ['SAUDI_NATIONALITY_WHERE_REQUIRED', 'AUTHORITY_LICENSED'] as const) {
      expect(
        verdict.criteria.find((outcome) => outcome.criterion === criterion),
        criterion,
      ).toMatchObject({ applicability: 'UNDECIDED_SURFACED', reasonCode: null });
      // …and it is UNDECIDED in EVERY context, not merely in this one.
      for (const context of [PLAIN, BOTH_CONDITIONS]) {
        expect(applicabilityOf(criterion, 'AUTHORIZED_REPRESENTATIVE', context)).toBe(
          'UNDECIDED_SURFACED',
        );
      }
    }
    // Neither blocks…
    expect(verdict.eligible).toBe(true);
    // …and the open question travels with the verdict rather than living only in a comment.
    expect(verdict.surfacedQuestions).toHaveLength(1);
    expect(verdict.surfacedQuestions[0]).toContain('Saudi counsel');
  });

  it('the four unconditional criteria DO bind on a representative', () => {
    for (const criterion of [
      'ISLAM',
      'LEGAL_CAPACITY',
      'NO_DISQUALIFYING_REMOVAL',
      'KSA_RESIDENCY',
    ] as const) {
      expect(applicabilityOf(criterion, 'AUTHORIZED_REPRESENTATIVE', PLAIN)).toBe('REQUIRED');
      const verdict = resolveEligibility({
        subject: 'AUTHORIZED_REPRESENTATIVE',
        flags: withFlag(criterion, false),
        context: PLAIN,
      });
      expect(verdict.eligible, criterion).toBe(false);
      expect(verdict.reasons, criterion).toStrictEqual([CRITERION_REASON[criterion]]);
    }
  });

  it('merges both subjects’ reasons on the deed, deduped and primary-first', () => {
    const deed = resolveDeedEligibility({
      primary: withFlag('ISLAM', false),
      representative: withFlag('KSA_RESIDENCY', false, withFlag('ISLAM', false)),
      context: PLAIN,
    });
    expect(deed.reasons).toStrictEqual(['ISLAM_REQUIRED', 'KSA_RESIDENCY_REQUIRED']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Purity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the resolver is pure', () => {
  it('does not mutate its inputs and returns a frozen verdict', () => {
    const flags = { ...ALL_TRUE, KSA_RESIDENCY: false };
    const context = { ...BOTH_CONDITIONS };
    const before = JSON.stringify({ flags, context });
    const verdict = resolveEligibility({ subject: 'PRIMARY_NAZIR', flags, context });
    expect(JSON.stringify({ flags, context })).toBe(before);
    expect(Object.isFrozen(verdict)).toBe(true);
    expect(Object.isFrozen(verdict.reasons)).toBe(true);
  });

  it('is deterministic — same input, deep-equal output', () => {
    const args = { subject: 'PRIMARY_NAZIR', flags: ALL_TRUE, context: BOTH_CONDITIONS } as const;
    expect(resolveEligibility(args)).toStrictEqual(resolveEligibility(args));
  });
});
