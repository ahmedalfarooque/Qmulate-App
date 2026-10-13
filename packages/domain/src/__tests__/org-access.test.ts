import { describe, expect, it } from 'vitest';

import {
  ACCESS_LEVEL_KEYS,
  NAV_SECTIONS,
  ORG_SCOPE_PERMISSIONS,
  assertOrgScopePermissions,
  isPermissionString,
  refuseUserAdminChange,
  resolveOrgPermissions,
  visibleSections,
} from '../access.js';

/**
 * The organisation layer (migration 55): the TypeScript twin of `qmulate_actor_holds_org_permission`.
 * The SQL function's order is: not ACTIVE → nothing; primary admin → everything; DENY beats the
 * level; ALLOW adds. These tests pin that order so the two sides cannot drift.
 */
describe('resolveOrgPermissions', () => {
  const level = ['admin:user:read', 'admin:user:write', 'audit:event:read'];

  it('an account that is not ACTIVE holds nothing, whatever its level', () => {
    for (const status of ['PENDING_APPROVAL', 'DISABLED', 'REJECTED'] as const) {
      expect(resolveOrgPermissions({ status, isPrimaryAdmin: true, levelPermissions: level, overrides: [] }).size).toBe(0);
    }
  });

  it('the primary administrator holds every organisation permission — that is what makes it un-lockable', () => {
    const set = resolveOrgPermissions({ status: 'ACTIVE', isPrimaryAdmin: true, levelPermissions: [], overrides: [{ permission: 'admin:user:read', effect: 'DENY' }] });
    expect([...set].sort()).toEqual([...ORG_SCOPE_PERMISSIONS].sort());
  });

  it('a level confers its permissions; a DENY override removes one; an ALLOW override adds one', () => {
    const set = resolveOrgPermissions({
      status: 'ACTIVE',
      isPrimaryAdmin: false,
      levelPermissions: level,
      overrides: [
        { permission: 'admin:user:write', effect: 'DENY' },
        { permission: 'admin:access_level:read', effect: 'ALLOW' },
      ],
    });
    expect([...set].sort()).toEqual(['admin:access_level:read', 'admin:user:read', 'audit:event:read']);
  });

  it('DENY beats ALLOW for the same permission', () => {
    const set = resolveOrgPermissions({
      status: 'ACTIVE',
      isPrimaryAdmin: false,
      levelPermissions: [],
      overrides: [
        { permission: 'audit:event:read', effect: 'ALLOW' },
        { permission: 'audit:event:read', effect: 'DENY' },
      ],
    });
    expect(set.size).toBe(0);
  });

  it('an endowment permission written into a level is ignored, never widened into', () => {
    const set = resolveOrgPermissions({ status: 'ACTIVE', isPrimaryAdmin: false, levelPermissions: ['distribution:run:approve', 'endowment:waqf:read'], overrides: [] });
    expect(set.size).toBe(0);
    expect(() => assertOrgScopePermissions(['distribution:run:approve'])).toThrow(/not organisation-scope/);
  });

  it('the closed list carries no approval verb and every entry is a registered permission', () => {
    for (const permission of ORG_SCOPE_PERMISSIONS) {
      expect(isPermissionString(permission)).toBe(true);
      expect(permission.endsWith(':approve') || permission.endsWith(':sign')).toBe(false);
    }
    expect(ACCESS_LEVEL_KEYS).toEqual(['ADMIN', 'OWNER', 'MANAGER', 'USER', 'CUSTOM', 'FULL']);
  });
});

describe('refuseUserAdminChange — the primary administrator and self-lockout safeguard', () => {
  const primary = { id: 'u-primary', isPrimaryAdmin: true } as const;
  const ordinary = { id: 'u-ordinary', isPrimaryAdmin: false } as const;

  it('an ordinary administrator cannot disable, demote, override, re-address or remove the primary administrator', () => {
    const actorId = 'u-other-admin';
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'status', status: 'DISABLED' } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'status', status: 'REJECTED' } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'level', levelKey: 'USER' } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'level', levelKey: null } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'overrides', count: 1 } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'email' } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'remove' } })).not.toBeNull();
  });

  it('a no-op on the primary administrator (still ACTIVE, still ADMIN, no overrides) is not refused', () => {
    const actorId = 'u-other-admin';
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'status', status: 'ACTIVE' } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'level', levelKey: 'ADMIN' } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: primary, change: { kind: 'overrides', count: 0 } })).toBeNull();
  });

  it('nobody disables, re-levels, overrides or removes themselves — the primary administrator included', () => {
    for (const target of [ordinary, primary]) {
      const actorId = target.id;
      expect(refuseUserAdminChange({ actorId, target, change: { kind: 'status', status: 'DISABLED' } })).not.toBeNull();
      expect(refuseUserAdminChange({ actorId, target, change: { kind: 'level', levelKey: 'ADMIN' } })).not.toBeNull();
      expect(refuseUserAdminChange({ actorId, target, change: { kind: 'overrides', count: 2 } })).not.toBeNull();
      expect(refuseUserAdminChange({ actorId, target, change: { kind: 'remove' } })).not.toBeNull();
    }
  });

  it('an administrator may manage an ordinary account in every way the screen offers', () => {
    const actorId = 'u-primary';
    expect(refuseUserAdminChange({ actorId, target: ordinary, change: { kind: 'status', status: 'DISABLED' } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: ordinary, change: { kind: 'status', status: 'ACTIVE' } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: ordinary, change: { kind: 'level', levelKey: 'USER' } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: ordinary, change: { kind: 'overrides', count: 3 } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: ordinary, change: { kind: 'email' } })).toBeNull();
    expect(refuseUserAdminChange({ actorId, target: ordinary, change: { kind: 'remove' } })).toBeNull();
  });

  it('a system actor (no id) is bound by the primary-administrator rules but is not "self"', () => {
    expect(refuseUserAdminChange({ actorId: null, target: primary, change: { kind: 'remove' } })).not.toBeNull();
    expect(refuseUserAdminChange({ actorId: null, target: ordinary, change: { kind: 'remove' } })).toBeNull();
  });
});

describe('visibleSections', () => {
  it('shows only the dashboard to a caller with no seat and no organisation permission', () => {
    expect(visibleSections({ seatPermissions: [], orgPermissions: [] })).toEqual(['dashboard']);
  });

  it('seat permissions open domain sections; organisation permissions open Users / Roles / Audit', () => {
    const sections = visibleSections({
      seatPermissions: ['endowment:waqf:read', 'document:document:read'],
      orgPermissions: ['admin:user:read', 'audit:event:read'],
    });
    expect(sections).toEqual(['dashboard', 'endowments', 'documents', 'auditLog', 'users']);
  });

  it('a seat permission never opens an organisation section, and vice versa', () => {
    expect(visibleSections({ seatPermissions: ['audit:event:read', 'admin:user:read'], orgPermissions: [] })).toEqual(['dashboard']);
    expect(visibleSections({ seatPermissions: [], orgPermissions: ['endowment:waqf:read'] })).toEqual(['dashboard']);
  });

  it('the primary administrator sees every section, seated or not', () => {
    expect(visibleSections({ seatPermissions: [], orgPermissions: [], isPrimaryAdmin: true })).toEqual(NAV_SECTIONS.map((s) => s.key));
    expect(visibleSections({ seatPermissions: [], orgPermissions: [], isPrimaryAdmin: false })).toEqual(['dashboard']);
  });

  it('every navigation section names a registered permission or none', () => {
    for (const section of NAV_SECTIONS) {
      if (section.permission !== null) expect(isPermissionString(section.permission)).toBe(true);
    }
  });
});
