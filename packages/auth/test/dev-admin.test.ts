// The local development administrator: its fixture-only exemption FAILS CLOSED, names ONE
// account, and its seats are the widest shape the access matrix can express — all pure.

import { describe, expect, it } from 'vitest';

import { ROLE_PRESETS } from '@qmulate/domain/access';

import { DEV_ADMIN_ROLES, dbRoleFor, devAdminGrantPlan, isDevAdminExempt } from '../src/dev-admin';
import {
  INTERNAL_OPS_ROLES,
  PORTAL_ROLES,
  ROLES,
  THIRD_PARTY_ROLES,
  roleKeyFromDbRole,
} from '../src/roles';

const ADMIN = 'arshad@alfarooque.com';
const FIXTURE = { DATA_CLASSIFICATION: 'fixture-only', DEV_ADMIN_EMAIL: ADMIN } as const;

describe('isDevAdminExempt — fail-closed, one account, fixture-only', () => {
  it('grants the exemption to the configured account under fixture-only', () => {
    expect(isDevAdminExempt(ADMIN, FIXTURE)).toBe(true);
  });

  it('refuses every other classification, including production and staging-shaped values', () => {
    for (const classification of [
      'production',
      'staging',
      'Fixture-Only',
      'fixture-only ',
      '',
      undefined,
    ]) {
      expect(isDevAdminExempt(ADMIN, { ...FIXTURE, DATA_CLASSIFICATION: classification })).toBe(
        false,
      );
    }
  });

  it('refuses when DEV_ADMIN_EMAIL is absent or blank — there is no default account', () => {
    expect(isDevAdminExempt(ADMIN, { DATA_CLASSIFICATION: 'fixture-only' })).toBe(false);
    expect(isDevAdminExempt(ADMIN, { ...FIXTURE, DEV_ADMIN_EMAIL: '   ' })).toBe(false);
  });

  it('refuses every other account — the seeded operators keep their gate', () => {
    for (const other of [
      'nazir@example.test',
      'admin@example.test',
      'matrix-admin@example.test',
      'Arshad@alfarooque.com',
      ` ${ADMIN}`,
      `${ADMIN}x`,
    ]) {
      expect(isDevAdminExempt(other, FIXTURE)).toBe(false);
    }
  });

  it('is never a wildcard', () => {
    for (const value of ['*', '', null, undefined, 42, {}]) {
      expect(isDevAdminExempt(value, FIXTURE)).toBe(false);
      expect(isDevAdminExempt(ADMIN, { ...FIXTURE, DEV_ADMIN_EMAIL: '*' })).toBe(false);
    }
  });
});

describe('devAdminGrantPlan — every internal ops seat, on every endowment, at its full preset', () => {
  const waqfIds = ['waqf-001', 'waqf-002', 'waqf-003'];
  const plan = devAdminGrantPlan(waqfIds);

  it('covers exactly the eight internal ops roles (§10 §2.1) and no portal or third-party seat', () => {
    expect([...DEV_ADMIN_ROLES]).toEqual([...INTERNAL_OPS_ROLES]);
    const roles = new Set(plan.map((grant) => roleKeyFromDbRole(grant.role)));
    for (const role of INTERNAL_OPS_ROLES) expect(roles.has(role)).toBe(true);
    for (const role of [...PORTAL_ROLES, ...THIRD_PARTY_ROLES]) expect(roles.has(role)).toBe(false);
  });

  it('issues one grant per (role × endowment), keyed on the table’s natural unique key', () => {
    expect(plan).toHaveLength(waqfIds.length * INTERNAL_OPS_ROLES.length);
    const keys = new Set(plan.map((grant) => `${grant.waqfId}|${grant.role}`));
    expect(keys.size).toBe(plan.length);
    for (const waqfId of waqfIds) expect(plan.some((grant) => grant.waqfId === waqfId)).toBe(true);
  });

  it('stores each role’s FULL preset, so stored ∩ preset is the preset — never wider', () => {
    for (const grant of plan) {
      const role = roleKeyFromDbRole(grant.role);
      if (role === undefined) throw new Error(`unmapped DB role ${grant.role}`);
      expect([...grant.permissions]).toEqual([...ROLE_PRESETS[role]]);
    }
  });

  it('reaches approve/sign only through the NAZIR seat, as the permission guard requires', () => {
    for (const grant of plan) {
      const governance = grant.permissions.filter(
        (p) => p.endsWith(':approve') || p.endsWith(':sign'),
      );
      if (grant.role === 'NAZIR') expect(governance.length).toBeGreaterThan(0);
      else expect(governance).toEqual([]);
    }
  });

  it('keeps the AML flags consistent (compartment ⇔ restricted view) and only on the AML seat', () => {
    for (const grant of plan) {
      expect(grant.canViewAmlRestricted).toBe(grant.amlCompartment);
      expect(grant.amlCompartment).toBe(grant.role === 'AML_OFFICER');
    }
  });

  it('spells every DB role as the inverse of DB_ROLE_TO_ROLE_KEY', () => {
    for (const role of ROLES) expect(roleKeyFromDbRole(dbRoleFor(role))).toBe(role);
    expect(dbRoleFor('admin')).toBe('SYSTEM_ADMIN');
  });
});
