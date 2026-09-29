import { describe, expect, it } from 'vitest';

import { ROLE_KEYS } from '../../access.js';
import {
  RESERVED_MATTER_CHAIN_STEPS,
  firstMissingReservedMatterChainStep,
  missingReservedMatterChainSteps,
  reservedMatterChainState,
} from '../chain.js';
import {
  RACI_PARTIES,
  RACI_ROLES_BY_PARTY,
  RACI_STEP_ROUTING,
  routeReservedMatter,
} from '../raci.js';

const kinded = {
  reservedMatterKind: 'ASSET_DISPOSAL',
  counselReviewRequired: true,
  authorityNoticeRequired: true,
  principalConsentRecordedAt: null,
  counselReviewRecordedAt: null,
  authorityNoticeRecordedAt: null,
} as const;

describe('S12-2 · the BR-1102 chain, read off recorded facts', () => {
  it('names the three steps in chain order, and nothing else', () => {
    expect(RESERVED_MATTER_CHAIN_STEPS).toEqual([
      'PRINCIPAL_CONSENT',
      'COUNSEL_REVIEW',
      'AUTHORITY_NOTICE',
    ]);
  });

  it('a kinded matter with nothing recorded is missing every required step, in order', () => {
    const state = reservedMatterChainState(kinded);
    expect(state).toEqual({
      principalConsent: 'NOT_RECORDED',
      counselReview: 'NOT_RECORDED',
      authorityNotice: 'NOT_RECORDED',
    });
    expect(missingReservedMatterChainSteps(state)).toEqual([
      'PRINCIPAL_CONSENT',
      'COUNSEL_REVIEW',
      'AUTHORITY_NOTICE',
    ]);
    expect(firstMissingReservedMatterChainStep(kinded)).toBe('PRINCIPAL_CONSENT');
  });

  it('principal consent is required UNCONDITIONALLY on a kinded matter', () => {
    const row = { ...kinded, counselReviewRequired: false, authorityNoticeRequired: false };
    expect(reservedMatterChainState(row)).toEqual({
      principalConsent: 'NOT_RECORDED',
      counselReview: 'NOT_REQUIRED',
      authorityNotice: 'NOT_REQUIRED',
    });
    expect(firstMissingReservedMatterChainStep(row)).toBe('PRINCIPAL_CONSENT');
  });

  it('the Authority step is conditional; a recorded step is RECORDED whatever the others say', () => {
    const row = {
      ...kinded,
      authorityNoticeRequired: false,
      counselReviewRecordedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expect(reservedMatterChainState(row)).toEqual({
      principalConsent: 'NOT_RECORDED',
      counselReview: 'RECORDED',
      authorityNotice: 'NOT_REQUIRED',
    });
    expect(missingReservedMatterChainSteps(reservedMatterChainState(row))).toEqual([
      'PRINCIPAL_CONSENT',
    ]);
  });

  it('a complete chain is missing nothing — the sign may proceed', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const row = {
      ...kinded,
      principalConsentRecordedAt: at,
      counselReviewRecordedAt: at,
      authorityNoticeRecordedAt: at,
    };
    expect(missingReservedMatterChainSteps(reservedMatterChainState(row))).toEqual([]);
    expect(firstMissingReservedMatterChainStep(row)).toBeNull();
  });

  it('a KINDLESS reserved-matter row carries no chain (S12 Q8 — surfaced, not decided)', () => {
    const row = { ...kinded, reservedMatterKind: null };
    expect(reservedMatterChainState(row)).toEqual({
      principalConsent: 'NOT_REQUIRED',
      counselReview: 'NOT_REQUIRED',
      authorityNotice: 'NOT_REQUIRED',
    });
    expect(firstMissingReservedMatterChainStep(row)).toBeNull();
  });

  it('an empty string is NOT a recorded instant', () => {
    expect(firstMissingReservedMatterChainStep({ ...kinded, principalConsentRecordedAt: '' })).toBe(
      'PRINCIPAL_CONSENT',
    );
  });
});

describe('S12-2 · RACI routing (BR-1103)', () => {
  it('every party maps to real role keys, and every role key belongs to at most one party', () => {
    const seen = new Map<string, string>();
    for (const party of RACI_PARTIES) {
      for (const role of RACI_ROLES_BY_PARTY[party]) {
        expect(ROLE_KEYS, `${party} names an unknown role ${role}`).toContain(role);
        expect(seen.has(role), `${role} is claimed by ${seen.get(role) ?? '?'} and ${party}`).toBe(
          false,
        );
        seen.set(role, party);
      }
    }
    // Every one of the thirteen roles except the beneficiary (no RACI party) is placed.
    const unplaced = ROLE_KEYS.filter((role) => !seen.has(role));
    expect(unplaced).toEqual(['beneficiary']);
  });

  it('routes every missing step at once — the letters arrive in any order', () => {
    expect(routeReservedMatter(kinded).map((r) => [r.step, r.party, [...r.notifyRoles]])).toEqual([
      ['PRINCIPAL_CONSENT', 'PRINCIPAL', ['family_board']],
      ['COUNSEL_REVIEW', 'LEGAL_REVIEW', ['counsel']],
      ['AUTHORITY_NOTICE', 'REGULATOR', ['compliance_officer', 'case_manager']],
    ]);
  });

  it('routes the sign to the Nazir ALONE once the chain is complete — accountability never routes away', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const routes = routeReservedMatter({
      ...kinded,
      principalConsentRecordedAt: at,
      counselReviewRecordedAt: at,
      authorityNoticeRecordedAt: at,
    });
    expect(routes).toEqual([
      { step: 'NAZIR_SIGN', party: 'ACCOUNTABLE_GOVERNOR', notifyRoles: ['nazir'] },
    ]);
  });

  it('a kindless row routes nowhere', () => {
    expect(routeReservedMatter({ ...kinded, reservedMatterKind: null })).toEqual([]);
  });

  it('the regulator has no seat, so its step is carried by the compliance function', () => {
    expect(RACI_ROLES_BY_PARTY.REGULATOR).toEqual([]);
    expect(RACI_STEP_ROUTING.AUTHORITY_NOTICE.notifyRoles).toEqual([
      'compliance_officer',
      'case_manager',
    ]);
  });
});
