/**
 * S9-3c — §09's "clock starts on" column, as a DECLARATION that cannot quietly acquire a default.
 *
 * The thing under test is not really the arithmetic (there is almost none). It is the property that
 * makes the arithmetic safe: **every one of the nine rules either names a recorded home or refuses
 * by name, and nothing in between.** The S9-1 M4 mutation established the standard — a
 * `?? somethingReasonable` on a statutory input must be a defect the suite kills — and an anchor is
 * the sharpest case, because a due date computed from an invented start day is indistinguishable
 * from a real one on every screen, report and filing it ever appears on.
 *
 * Each ROUTED rule is asserted with its OWN discriminator, not merely "it refused": the routes have
 * different remedies (a column, a model, nobody-has-recorded-it-yet), and a test that accepted any
 * refusal would let them be collapsed into one — which is exactly how the sharpest finding here
 * (that `Vendor.licenseExpiry` is the only expiry in reach of `LICENSE_RENEWAL`, and belongs to a
 * subcontractor on a table that is not waqf-scoped) would stop being visible.
 *
 * ⊕ S11-1 (2026-09-02): TWO of the three routes CLEARED — the owner ruled the `REGISTER_30BD` and
 * `ISTIBDAL_10BD` clock-starts are RECORDED OPERATOR INPUT (memo, S10 addendum second batch, commit
 * 9f3d8fd), and migration 48 gave them columns. The split below moved from "five arms / four rules /
 * three routed" to "seven arms / six rules / ONE routed", and this file re-pins it in the same change
 * so the totality claim stays a measurement. `LICENSE_RENEWAL` stays routed: its remedy is a MODEL,
 * and the owner's enumeration exists but the model does not — G-5's anchor bound is NARROWED, not
 * cleared, and the owner-queue assertion below is what keeps that from being overstated.
 *
 * ⊕ The one NEW refusal, `ANCHOR_KIND_ABSENT`, is REGISTER_30BD's alone: the owner ruled the KIND
 * travels with the date ("make a drop down if that helps"), so a date offered without its kind is
 * refused even though the database CHECK already makes that row unreachable — the domain does not
 * trust the caller to have read the row through the schema.
 */

import { describe, expect, it } from 'vitest';

import {
  ANCHOR_CHAIN_REFUSALS,
  ANCHOR_DECLARATIONS,
  ANCHOR_DERIVED_RULE_KEYS,
  ANCHOR_OWNER_QUEUE_ITEMS,
  ANCHOR_ROUTED_RULE_KEYS,
  ANCHOR_ROUTING_REFUSALS,
  DEADLINE_RULE_KEYS,
  FISCAL_YEAR_END_READING,
  anchorDeclarationFor,
  anchorProvenanceOf,
  deriveAnchor,
  resolveFiscalYearEndAnchor,
  selectAnchorChainHead,
} from '../deadlines/index.js';
import { DomainError } from '../errors.js';

/** The discriminator a refusal carried, or `undefined` if it was not a `DomainError`. */
function refusalOf(fn: () => unknown): {
  code: string;
  refusal: unknown;
  details: Record<string, unknown>;
} {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) {
      const details = (error.details ?? {}) as Record<string, unknown>;
      return { code: error.code, refusal: details['refusal'], details };
    }
    throw error;
  }
  throw new Error('expected a refusal, got a value');
}

describe('§09 anchor declarations — total over the nine rules, with no third option', () => {
  it('declares every rule key, and only rule keys', () => {
    expect(Object.keys(ANCHOR_DECLARATIONS).sort()).toStrictEqual([...DEADLINE_RULE_KEYS].sort());
    for (const key of DEADLINE_RULE_KEYS) {
      expect(ANCHOR_DECLARATIONS[key].key).toBe(key);
    }
  });

  it('every declaration is EITHER derived-with-sources OR routed-with-a-reason — never both, never neither', () => {
    for (const key of DEADLINE_RULE_KEYS) {
      const declaration = ANCHOR_DECLARATIONS[key];
      if (declaration.mode === 'derived') {
        expect(declaration.sources.length).toBeGreaterThan(0);
        expect(declaration.routing).toBeNull();
      } else {
        // routed | not_a_clock
        expect(declaration.sources).toStrictEqual([]);
        expect(declaration.routing).not.toBeNull();
        // A route that does not say what would fix it is a route nobody acts on.
        expect(declaration.routing?.remedy.length ?? 0).toBeGreaterThan(20);
        expect((declaration.routing?.examined ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it('the measured split is SEVEN derived arms across SIX rules, ONE routed, one non-clock (S11-1)', () => {
    expect([...ANCHOR_DERIVED_RULE_KEYS]).toStrictEqual([
      'REGISTER_30BD',
      'UPDATE_15BD',
      'ISTIBDAL_10BD',
      'DISTRIBUTE_3M_FYE',
      'KYC_REFRESH',
      'CONTRACT_RENEWAL',
      'HEARING',
    ]);
    // ⚠ ONE route stands, and it is the one whose remedy is a MODEL. This assertion is what keeps
    // "the anchor field landed" from being read as "G-5's anchor bound is gone".
    expect([...ANCHOR_ROUTED_RULE_KEYS]).toStrictEqual(['LICENSE_RENEWAL']);
    expect(ANCHOR_DECLARATIONS.RETENTION_10Y.mode).toBe('not_a_clock');
    // UPDATE_15BD is the only rule §09 gives TWO anchors, and both are declared.
    expect(ANCHOR_DECLARATIONS.UPDATE_15BD.sources.map((arm) => arm.subject)).toStrictEqual([
      'waqf',
      'material_change',
    ]);
    // The two S11-1 arms: one on the endowment, one on the taking's own row.
    expect(ANCHOR_DECLARATIONS.REGISTER_30BD.sources.map((arm) => arm.subject)).toStrictEqual([
      'waqf',
    ]);
    expect(ANCHOR_DECLARATIONS.ISTIBDAL_10BD.sources.map((arm) => arm.subject)).toStrictEqual([
      'expropriation',
    ]);
  });

  it('names the exact schema columns it claims — the declaration IS the contract with the router', () => {
    const homes = ANCHOR_DERIVED_RULE_KEYS.flatMap((key) =>
      ANCHOR_DECLARATIONS[key].sources.map((arm) => `${arm.model}.${arm.dateField}`),
    );
    expect(homes).toStrictEqual([
      'Waqf.registrationAnchorDate',
      'Waqf.certificateExpiry',
      'MaterialChange.effectiveDate',
      'Expropriation.istibdalCompletedDate',
      'Waqf.fiscalYearEnd',
      'Beneficiary.kycLastRefreshed',
      'Lease.endDate',
      'LegalCase.nextHearing',
    ]);
    // ⚠ And NOT `Waqf.registrationDate` — the registration ITSELF. If this list ever names it, a
    // 30-business-day window is being counted from the completion of the act it governs.
    expect(homes).not.toContain('Waqf.registrationDate');
  });

  it('exactly ONE arm names a kind column — REGISTER_30BD, whose §09 anchor is two different facts', () => {
    const withKind = ANCHOR_DERIVED_RULE_KEYS.flatMap((key) =>
      ANCHOR_DECLARATIONS[key].sources
        .filter((arm) => arm.kindField !== null)
        .map((arm) => `${arm.model}.${arm.kindField ?? ''}`),
    );
    expect(withKind).toStrictEqual(['Waqf.registrationAnchorKind']);
  });

  it('only the fiscal-year arm carries a DECLARED READING; every other arm reads a stored date', () => {
    const withReadings = ANCHOR_DERIVED_RULE_KEYS.flatMap((key) =>
      ANCHOR_DECLARATIONS[key].sources
        .filter((arm) => arm.reading !== null)
        .map((arm) => `${arm.model}.${arm.dateField}`),
    );
    expect(withReadings).toStrictEqual(['Waqf.fiscalYearEnd']);
    expect(ANCHOR_DECLARATIONS.DISTRIBUTE_3M_FYE.sources[0]?.reading).toBe(FISCAL_YEAR_END_READING);
  });

  it('the owner queue holds exactly the ONE route whose remedy is still a product decision — and NOT the non-clock', () => {
    // S11-1 cleared REGISTER_30BD and ISTIBDAL_10BD by the owner's ruling (9f3d8fd). LICENSE_RENEWAL
    // needs a MODEL; the owner's enumeration exists (docs/domain/licences-and-permits.md), the model
    // does not — so the queue is not empty, and neither is G-5's anchor bound.
    expect(ANCHOR_OWNER_QUEUE_ITEMS.map((item) => item.key)).toStrictEqual(['LICENSE_RENEWAL']);
    // A retention floor has no anchor and never will — a settled route, not an open question.
    expect(ANCHOR_DECLARATIONS.RETENTION_10Y.routing?.ownerQueueItem).toBe(false);
    // ⚠ The point of this assertion: "we derived everything" is unclaimable while a route stands.
    expect(ANCHOR_OWNER_QUEUE_ITEMS.length).toBeGreaterThan(0);
  });
});

describe('the S11-1 arms — RECORDED OPERATOR INPUT, with the kind travelling with the date', () => {
  it('REGISTER_30BD derives from Waqf.registrationAnchorDate WITH its declared kind', () => {
    const derived = deriveAnchor('REGISTER_30BD', {
      subject: 'waqf',
      date: '2026-01-15',
      hijri: '1447-07-25',
      declaredKind: 'REGULATION_EFFECTIVE_DATE',
      sourceId: 'waqf-001',
    });
    expect(String(derived.anchor)).toBe('2026-01-15');
    expect(derived.anchorHijri).toBe('1447-07-25');
    expect(derived.anchorKind).toBe('REGULATION_EFFECTIVE_DATE');
    expect(derived.source.model).toBe('Waqf');
    expect(derived.source.dateField).toBe('registrationAnchorDate');
    expect(derived.source.kindField).toBe('registrationAnchorKind');
    // The semantics carry the two kinds and the rule-3 flag, so a stored deadline explains itself.
    expect(derived.source.semantics).toContain('WAQF_DOCUMENTATION_DATE');
    expect(derived.source.semantics).toContain('REGULATION_EFFECTIVE_DATE');
    expect(derived.source.semantics).toContain('unverified');
  });

  it('REGISTER_30BD REFUSES a date offered WITHOUT its kind — ANCHOR_KIND_ABSENT, by name', () => {
    const refused = refusalOf(() =>
      deriveAnchor('REGISTER_30BD', {
        subject: 'waqf',
        date: '2026-01-15',
        hijri: '1447-07-25',
        declaredKind: null,
        sourceId: 'waqf-001',
      }),
    );
    expect(refused.code).toBe('DEADLINE_ANCHOR_NOT_DERIVABLE');
    expect(refused.refusal).toBe('ANCHOR_KIND_ABSENT');
    expect(refused.details['kindField']).toBe('registrationAnchorKind');
    // ⚠ THE LOAD-BEARING ASSERTION: a perfectly good date was offered and it is STILL refused. The
    // owner ruled the kind is part of the record ("make a drop down if that helps"); inferring it
    // from whether the date precedes the regulation would be the guess this module exists to refuse.
  });

  it('REGISTER_30BD with a NULL anchor refuses ANCHOR_SOURCE_VALUE_ABSENT — blank means CANNOT COMPUTE, never "no deadline"', () => {
    const refused = refusalOf(() =>
      deriveAnchor('REGISTER_30BD', {
        subject: 'waqf',
        date: null,
        hijri: null,
        declaredKind: null,
        sourceId: 'waqf-002',
      }),
    );
    expect(refused.refusal).toBe('ANCHOR_SOURCE_VALUE_ABSENT');
    expect(refused.details['dateField']).toBe('registrationAnchorDate');
    // The condition attached to the ruling: an unrecorded anchor is a refusal BY NAME for this
    // endowment. Nothing downstream may render it as "nothing due".
  });

  it('ISTIBDAL_10BD derives from Expropriation.istibdalCompletedDate — subject `expropriation`, one kind', () => {
    const derived = deriveAnchor('ISTIBDAL_10BD', {
      subject: 'expropriation',
      date: '2026-05-10',
      hijri: '1447-11-23',
      declaredKind: null,
      sourceId: 'exp-001',
    });
    expect(String(derived.anchor)).toBe('2026-05-10');
    expect(derived.anchorKind).toBeNull();
    expect(derived.source.model).toBe('Expropriation');
    expect(derived.source.dateField).toBe('istibdalCompletedDate');
    expect(derived.source.kindField).toBeNull();
    expect(derived.sourceId).toBe('exp-001');
  });

  it('ISTIBDAL_10BD REFUSES the endowment as its subject — the completion is a fact about the taking', () => {
    const refused = refusalOf(() =>
      deriveAnchor('ISTIBDAL_10BD', {
        subject: 'waqf',
        date: '2026-05-10',
        hijri: '1447-11-23',
        declaredKind: null,
        sourceId: 'waqf-003',
      }),
    );
    expect(refused.details['offeredSubject']).toBe('waqf');
    expect(refused.details['declaredSubjects']).toStrictEqual(['expropriation']);
  });

  it('ISTIBDAL_10BD with a NULL completion refuses ANCHOR_SOURCE_VALUE_ABSENT — exp-001 is pending, not "nothing due"', () => {
    const refused = refusalOf(() =>
      deriveAnchor('ISTIBDAL_10BD', {
        subject: 'expropriation',
        date: null,
        hijri: null,
        declaredKind: null,
        sourceId: 'exp-001',
      }),
    );
    expect(refused.refusal).toBe('ANCHOR_SOURCE_VALUE_ABSENT');
    expect(refused.details['dateField']).toBe('istibdalCompletedDate');
  });

  it("a single-kind arm ignores a kind the caller happens to pass — the kind is the ARM's property", () => {
    const derived = deriveAnchor('ISTIBDAL_10BD', {
      subject: 'expropriation',
      date: '2026-05-10',
      hijri: '1447-11-23',
      declaredKind: 'REGULATION_EFFECTIVE_DATE',
      sourceId: 'exp-001',
    });
    // No arm declares a kind here, so none is reported: a kind is not a free-text annotation.
    expect(derived.anchorKind).toBeNull();
  });
});

describe('the ONE remaining route refuses with its OWN discriminator, because the remedy is a MODEL', () => {
  it('LICENSE_RENEWAL — a WRONG-SCOPE home, and its own discriminator', () => {
    const refused = refusalOf(() =>
      deriveAnchor('LICENSE_RENEWAL', {
        subject: 'waqf',
        date: '2027-06-30',
        hijri: '1448-12-25',
        declaredKind: null,
        sourceId: 'vendor-001',
      }),
    );
    expect(refused.refusal).toBe('ANCHOR_HOME_IS_WRONG_SCOPE');
    // ⚠ NOT interchangeable with the no-home case: this one needs a MODEL, and the examined list
    // must name the near-miss so a future "helpful" wiring of a subcontractor's licence is a
    // caught mistake rather than a quiet one.
    expect(String(refused.details['examined'])).toContain('Vendor.licenseExpiry');
    expect(String(refused.details['remedy'])).toContain('MODEL');
    // It is STILL an owner-queue item after S11-1: the enumeration arrived, the model did not.
    expect(refused.details['ownerQueueItem']).toBe(true);
  });

  it('RETENTION_10Y — no anchor to derive, because it is not a clock', () => {
    const refused = refusalOf(() =>
      deriveAnchor('RETENTION_10Y', {
        subject: 'waqf',
        date: '2016-01-01',
        hijri: '1437-03-20',
        declaredKind: null,
        sourceId: 'doc-001',
      }),
    );
    expect(refused.refusal).toBe('ANCHOR_RULE_NOT_A_CLOCK');
  });

  it('an unknown key resolves to nothing, never to something plausible', () => {
    expect(refusalOf(() => anchorDeclarationFor('UPDATE_20BD')).refusal).toBe(
      'ANCHOR_RULE_KEY_UNKNOWN',
    );
    expect(refusalOf(() => anchorDeclarationFor('AML_IMMEDIATE')).refusal).toBe(
      'ANCHOR_RULE_KEY_UNKNOWN',
    );
  });

  it('the routing vocabulary is closed and every member is reachable', () => {
    // Reachability, member by member, in this file: NO_RECORDED_HOME — the wrong-subject refusal
    // below; WRONG_SCOPE — LICENSE_RENEWAL above; SOURCE_VALUE_ABSENT — the NULL KYC and NULL
    // anchor cases; KIND_ABSENT — REGISTER_30BD without its kind (S11-1); NOT_A_CLOCK —
    // RETENTION_10Y; KEY_UNKNOWN — the unknown-key case.
    expect([...ANCHOR_ROUTING_REFUSALS]).toStrictEqual([
      'ANCHOR_HAS_NO_RECORDED_HOME',
      'ANCHOR_HOME_IS_WRONG_SCOPE',
      'ANCHOR_SOURCE_VALUE_ABSENT',
      'ANCHOR_KIND_ABSENT',
      'ANCHOR_RULE_NOT_A_CLOCK',
      'ANCHOR_RULE_KEY_UNKNOWN',
    ]);
  });
});

describe('deriving from a declared home', () => {
  it('reads the certificate arm and echoes the semantics into the result', () => {
    const derived = deriveAnchor('UPDATE_15BD', {
      subject: 'waqf',
      date: new Date('2026-09-30T00:00:00.000Z'),
      hijri: '1448-04-09',
      declaredKind: null,
      sourceId: 'waqf-001',
    });
    expect(String(derived.anchor)).toBe('2026-09-30');
    expect(derived.anchorHijri).toBe('1448-04-09');
    expect(derived.anchorKind).toBeNull();
    expect(derived.source.model).toBe('Waqf');
    expect(derived.source.dateField).toBe('certificateExpiry');
    expect(derived.sourceId).toBe('waqf-001');
  });

  it('reads the material-change arm of the SAME rule — two arms, one duty', () => {
    const derived = deriveAnchor('UPDATE_15BD', {
      subject: 'material_change',
      date: '2026-05-10',
      hijri: '1447-11-23',
      declaredKind: null,
      sourceId: 'mc-1',
    });
    expect(derived.source.model).toBe('MaterialChange');
    // CDE-Q2 is quoted in the semantics, so a stored deadline explains its own clock.
    expect(derived.source.semantics).toContain('EFFECTIVE');
    expect(derived.source.semantics).toContain('CDE-Q2');
  });

  it('REFUSES a date offered from a subject the rule does not declare', () => {
    // A lease's end date is a real date on a real row related to this endowment. It is not the
    // certificate expiry, and nothing about being "a date nearby" makes it this rule's anchor.
    const refused = refusalOf(() =>
      deriveAnchor('UPDATE_15BD', {
        subject: 'lease',
        date: '2026-05-10',
        hijri: '1447-11-23',
        declaredKind: null,
        sourceId: 'lease-001',
      }),
    );
    expect(refused.code).toBe('DEADLINE_ANCHOR_NOT_DERIVABLE');
    expect(refused.details['offeredSubject']).toBe('lease');
    expect(refused.details['declaredSubjects']).toStrictEqual(['waqf', 'material_change']);
  });

  it('a NULL recorded value refuses with no substitute — the KYC never-verified case', () => {
    const refused = refusalOf(() =>
      deriveAnchor('KYC_REFRESH', {
        subject: 'beneficiary',
        date: null,
        hijri: null,
        declaredKind: null,
        sourceId: 'ben-003',
      }),
    );
    expect(refused.refusal).toBe('ANCHOR_SOURCE_VALUE_ABSENT');
    expect(refused.details['dateField']).toBe('kycLastRefreshed');
    // ⚠ THE LOAD-BEARING ASSERTION. A never-verified beneficiary (fixture `ben-003`,
    // `kycLastRefreshed: null`) has no last-verification date to count twelve months from.
    // Substituting "today" would compute a statutory refresh date from a fact nobody attested —
    // and it would silently convert `KYC_NEVER_VERIFIED` (a gate condition) into a satisfied clock.
    expect(refused.code).toBe('DEADLINE_ANCHOR_NOT_DERIVABLE');
  });

  it('a HALF dual pair refuses rather than re-deriving the missing frozen twin', () => {
    const refused = refusalOf(() =>
      deriveAnchor('HEARING', {
        subject: 'legal_case',
        date: '2026-11-02',
        hijri: null,
        declaredKind: null,
        sourceId: 'case-001',
      }),
    );
    expect(refused.refusal).toBe('ANCHOR_SOURCE_VALUE_ABSENT');
    // §09 freezes both halves together. Re-converting the missing half here would substitute
    // today's Umm-al-Qura tables for the ones in force when the fact was recorded — the exact
    // coupling the freeze exists to remove.
    expect(refused.details['hijriField']).toBe('nextHearingHijri');
  });
});

describe("the ONE declared reading — Waqf.fiscalYearEnd's MM-DD, resolved", () => {
  it('picks the most recently ENDED fiscal-year end BEFORE the reference date', () => {
    // Fixture: every endowment is fiscalYearEnd "12-31".
    expect(String(resolveFiscalYearEndAnchor('12-31', '2026-08-27'))).toBe('2025-12-31');
  });

  it('is INCLUSIVE — a reference date that IS the year end anchors on that day', () => {
    // The boundary is the whole reading: on 2026-12-31 the year has ended, so its income is
    // distributable and the 3-month clock has started. Rolling back a year would give the Nazir
    // twelve extra months on the wrong period.
    expect(String(resolveFiscalYearEndAnchor('12-31', '2026-12-31'))).toBe('2026-12-31');
    expect(String(resolveFiscalYearEndAnchor('12-31', '2026-12-30'))).toBe('2025-12-31');
  });

  it('handles a non-December fiscal year on both sides of its own boundary', () => {
    expect(String(resolveFiscalYearEndAnchor('06-30', '2026-07-01'))).toBe('2026-06-30');
    expect(String(resolveFiscalYearEndAnchor('06-30', '2026-06-29'))).toBe('2025-06-30');
  });

  it('refuses a fiscalYearEnd that is not an MM-DD day, rather than guessing', () => {
    expect(refusalOf(() => resolveFiscalYearEndAnchor('2026-12-31', '2026-08-27')).code).toBe(
      'DATE_INVALID',
    );
    expect(refusalOf(() => resolveFiscalYearEndAnchor('December 31', '2026-08-27')).code).toBe(
      'DATE_INVALID',
    );
    // An MM-DD that is not a real day fails at `civilDate` rather than rolling into March.
    expect(() => resolveFiscalYearEndAnchor('02-30', '2026-08-27')).toThrow();
  });
});

describe('⊕ S11-1 · provenance frozen into the snapshot, and the correction chain it makes findable', () => {
  it('reads the provenance this module writes, and nothing looser', () => {
    expect(
      anchorProvenanceOf({
        settingKey: 'deadline.REGISTER_30BD.businessDays',
        anchorSource: { subject: 'waqf', sourceId: 'waqf-001', kind: 'REGULATION_EFFECTIVE_DATE' },
      }),
    ).toStrictEqual({ subject: 'waqf', sourceId: 'waqf-001', kind: 'REGULATION_EFFECTIVE_DATE' });
    expect(
      anchorProvenanceOf({
        anchorSource: { subject: 'expropriation', sourceId: 'exp-001', kind: null },
      }),
    ).toStrictEqual({ subject: 'expropriation', sourceId: 'exp-001', kind: null });
  });

  it('a snapshot with NO anchorSource is "no declared home" — null, not a guess', () => {
    // The coalescing path's rows look like this: their provenance is the governing cause in the
    // audit event, and they never take part in an anchor chain.
    expect(anchorProvenanceOf({ settingKey: 'deadline.UPDATE_15BD.businessDays' })).toBeNull();
    expect(anchorProvenanceOf(null)).toBeNull();
    expect(anchorProvenanceOf('not an object')).toBeNull();
  });

  it('a HALF-FORMED anchorSource is not provenance — strict, so a malformed row cannot claim a chain', () => {
    expect(
      anchorProvenanceOf({ anchorSource: { subject: 'waqf', sourceId: '', kind: null } }),
    ).toBeNull();
    expect(
      anchorProvenanceOf({ anchorSource: { subject: 'vendor', sourceId: 'v-1', kind: null } }),
    ).toBeNull();
    expect(
      anchorProvenanceOf({ anchorSource: { subject: 'waqf', sourceId: 'waqf-001' } }),
    ).toBeNull();
    expect(
      anchorProvenanceOf({ anchorSource: { subject: 'waqf', sourceId: 'waqf-001', kind: 7 } }),
    ).toBeNull();
  });

  const prov = (sourceId: string): { subject: 'expropriation'; sourceId: string; kind: null } => ({
    subject: 'expropriation',
    sourceId,
    kind: null,
  });

  it('selects the ONE live head for THIS source — and ignores the other source on the same endowment', () => {
    const head = selectAnchorChainHead('ISTIBDAL_10BD', 'exp-A', [
      { id: 'a1', provenance: prov('exp-A'), supersededById: 'a2' },
      { id: 'a2', provenance: prov('exp-A'), supersededById: null },
      { id: 'b1', provenance: prov('exp-B'), supersededById: null },
    ]);
    expect(head).toBe('a2');
    expect(
      selectAnchorChainHead('ISTIBDAL_10BD', 'exp-B', [
        { id: 'a2', provenance: prov('exp-A'), supersededById: null },
        { id: 'b1', provenance: prov('exp-B'), supersededById: null },
      ]),
    ).toBe('b1');
  });

  it('returns null where no live row names the source — a fresh chain starts, not a borrowed one', () => {
    expect(
      selectAnchorChainHead('ISTIBDAL_10BD', 'exp-C', [
        { id: 'a2', provenance: prov('exp-A'), supersededById: null },
        // A row with NO provenance belongs to nobody's chain, whatever its source might have been.
        { id: 'x', provenance: null, supersededById: null },
      ]),
    ).toBeNull();
  });

  it('REFUSES two live heads for one source — ANCHOR_CHAIN_MULTIPLE_HEADS, never "the newest wins"', () => {
    const refused = refusalOf(() =>
      selectAnchorChainHead('REGISTER_30BD', 'waqf-001', [
        {
          id: 'r1',
          provenance: { subject: 'waqf', sourceId: 'waqf-001', kind: 'WAQF_DOCUMENTATION_DATE' },
          supersededById: null,
        },
        {
          id: 'r2',
          provenance: { subject: 'waqf', sourceId: 'waqf-001', kind: 'WAQF_DOCUMENTATION_DATE' },
          supersededById: null,
        },
      ]),
    );
    expect(refused.code).toBe('DEADLINE_STATE_INCOHERENT');
    expect(refused.refusal).toBe('ANCHOR_CHAIN_MULTIPLE_HEADS');
    expect(refused.details['headIds']).toStrictEqual(['r1', 'r2']);
  });

  it('the chain vocabulary is closed and its one member is reachable', () => {
    expect([...ANCHOR_CHAIN_REFUSALS]).toStrictEqual(['ANCHOR_CHAIN_MULTIPLE_HEADS']);
  });
});
