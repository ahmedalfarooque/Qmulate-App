import { describe, expect, it } from 'vitest';

import {
  GATE_BLOCKING,
  ONBOARDING_GATES,
  OPERATING_MODEL_GATE_CHECKLIST,
  clearOrderRefusal,
  downstreamBlock,
  gateRank,
  isGateCleared,
  nextGate,
  priorGate,
  reopenOrderRefusal,
  unattestedChecklistItems,
  unmetGatePrerequisites,
  type GateRow,
} from '../gates.js';

const rows = (...cleared: string[]): GateRow[] =>
  ONBOARDING_GATES.map((gate) => ({ gate, status: cleared.includes(gate) ? 'CLEARED' : 'OPEN' }));

const satisfied = {
  trusteeshipDeedRecorded: true,
  nazirEligibilityVerified: true,
  classificationRecorded: true,
  dedicatedBankAccounts: 1,
  beneficiaries: 3,
  directUse: false,
} as const;

describe('S12-3 · the three gates, in order', () => {
  it('names the operating model’s three gates in order, ranked 1..3', () => {
    expect(ONBOARDING_GATES).toEqual([
      'GATE_01_AUTHORITY_LEGAL',
      'GATE_02_SYSTEMS_CONTROLS',
      'GATE_03_PEOPLE_PROPERTY_CADENCE',
    ]);
    expect(ONBOARDING_GATES.map(gateRank)).toEqual([1, 2, 3]);
    expect(priorGate('GATE_01_AUTHORITY_LEGAL')).toBeNull();
    expect(priorGate('GATE_03_PEOPLE_PROPERTY_CADENCE')).toBe('GATE_02_SYSTEMS_CONTROLS');
    expect(nextGate('GATE_03_PEOPLE_PROPERTY_CADENCE')).toBeNull();
    expect(nextGate('GATE_01_AUTHORITY_LEGAL')).toBe('GATE_02_SYSTEMS_CONTROLS');
  });

  it('absence is NOT evidence — a missing row is an OPEN gate', () => {
    expect(isGateCleared([], 'GATE_01_AUTHORITY_LEGAL')).toBe(false);
    expect(downstreamBlock([], 'DISTRIBUTION_RUN')).toEqual({
      activity: 'DISTRIBUTION_RUN',
      gate: 'GATE_02_SYSTEMS_CONTROLS',
    });
  });

  it('Gate 02 blocks a distribution run and a filing submission; a cleared Gate 02 blocks neither', () => {
    expect(GATE_BLOCKING.DISTRIBUTION_RUN).toBe('GATE_02_SYSTEMS_CONTROLS');
    expect(GATE_BLOCKING.AUTHORITY_FILING_SUBMISSION).toBe('GATE_02_SYSTEMS_CONTROLS');
    const gate01Only = rows('GATE_01_AUTHORITY_LEGAL');
    expect(downstreamBlock(gate01Only, 'DISTRIBUTION_RUN')?.gate).toBe('GATE_02_SYSTEMS_CONTROLS');
    expect(downstreamBlock(gate01Only, 'AUTHORITY_FILING_SUBMISSION')?.gate).toBe(
      'GATE_02_SYSTEMS_CONTROLS',
    );
    const through02 = rows('GATE_01_AUTHORITY_LEGAL', 'GATE_02_SYSTEMS_CONTROLS');
    expect(downstreamBlock(through02, 'DISTRIBUTION_RUN')).toBeNull();
    expect(downstreamBlock(through02, 'AUTHORITY_FILING_SUBMISSION')).toBeNull();
  });

  it('the order forbids clearing Gate N while Gate N-1 is open, and reopening N-1 while N is cleared', () => {
    expect(clearOrderRefusal(rows(), 'GATE_01_AUTHORITY_LEGAL')).toBeNull();
    expect(clearOrderRefusal(rows(), 'GATE_02_SYSTEMS_CONTROLS')).toBe('PRIOR_GATE_NOT_CLEARED');
    expect(
      clearOrderRefusal(rows('GATE_01_AUTHORITY_LEGAL'), 'GATE_02_SYSTEMS_CONTROLS'),
    ).toBeNull();
    expect(
      clearOrderRefusal(rows('GATE_01_AUTHORITY_LEGAL'), 'GATE_03_PEOPLE_PROPERTY_CADENCE'),
    ).toBe('PRIOR_GATE_NOT_CLEARED');
    const all = rows(...ONBOARDING_GATES);
    expect(reopenOrderRefusal(all, 'GATE_01_AUTHORITY_LEGAL')).toBe('LATER_GATE_STILL_CLEARED');
    expect(reopenOrderRefusal(all, 'GATE_03_PEOPLE_PROPERTY_CADENCE')).toBeNull();
    expect(
      reopenOrderRefusal(
        rows('GATE_01_AUTHORITY_LEGAL', 'GATE_02_SYSTEMS_CONTROLS'),
        'GATE_02_SYSTEMS_CONTROLS',
      ),
    ).toBeNull();
  });

  it('mechanical prerequisites: Gate 01 needs a VERIFIED deed and a recorded classification', () => {
    expect(unmetGatePrerequisites('GATE_01_AUTHORITY_LEGAL', satisfied)).toEqual([]);
    expect(
      unmetGatePrerequisites('GATE_01_AUTHORITY_LEGAL', {
        ...satisfied,
        trusteeshipDeedRecorded: false,
      }),
    ).toEqual(['TRUSTEESHIP_DEED_NOT_RECORDED']);
    expect(
      unmetGatePrerequisites('GATE_01_AUTHORITY_LEGAL', {
        ...satisfied,
        nazirEligibilityVerified: false,
      }),
    ).toEqual(['NAZIR_ELIGIBILITY_NOT_VERIFIED']);
    expect(
      unmetGatePrerequisites('GATE_01_AUTHORITY_LEGAL', {
        ...satisfied,
        trusteeshipDeedRecorded: false,
        classificationRecorded: false,
      }),
    ).toEqual(['TRUSTEESHIP_DEED_NOT_RECORDED', 'CLASSIFICATION_NOT_RECORDED']);
  });

  it('mechanical prerequisites: Gate 02 needs a dedicated bank account; Gate 03 a registry unless direct-use', () => {
    expect(
      unmetGatePrerequisites('GATE_02_SYSTEMS_CONTROLS', {
        ...satisfied,
        dedicatedBankAccounts: 0,
      }),
    ).toEqual(['NO_DEDICATED_BANK_ACCOUNT']);
    expect(
      unmetGatePrerequisites('GATE_03_PEOPLE_PROPERTY_CADENCE', { ...satisfied, beneficiaries: 0 }),
    ).toEqual(['NO_BENEFICIARY_RECORDED']);
    expect(
      unmetGatePrerequisites('GATE_03_PEOPLE_PROPERTY_CADENCE', {
        ...satisfied,
        beneficiaries: 0,
        directUse: true,
      }),
    ).toEqual([]);
  });

  it('the checklist is attested item by item — a missing or false item is unattested', () => {
    const items = OPERATING_MODEL_GATE_CHECKLIST.GATE_02_SYSTEMS_CONTROLS;
    expect(items.length).toBe(5);
    expect(unattestedChecklistItems('GATE_02_SYSTEMS_CONTROLS', null)).toEqual([...items]);
    const partial = Object.fromEntries(items.slice(1).map((item) => [item, true]));
    expect(unattestedChecklistItems('GATE_02_SYSTEMS_CONTROLS', partial)).toEqual([items[0]]);
    expect(
      unattestedChecklistItems('GATE_02_SYSTEMS_CONTROLS', {
        ...partial,
        [items[0] as string]: 'yes',
      }),
    ).toEqual([items[0]]);
    expect(
      unattestedChecklistItems(
        'GATE_02_SYSTEMS_CONTROLS',
        Object.fromEntries(items.map((i) => [i, true])),
      ),
    ).toEqual([]);
  });
});
