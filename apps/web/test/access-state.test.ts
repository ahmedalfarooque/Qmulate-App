import { describe, expect, it } from 'vitest';

import { shellDecision } from '../src/lib/access-state';

const base = { grants: [], org: { permissions: [], accessLevel: null, isPrimaryAdmin: false } } as const;

describe('shellDecision — approved accounts, one state each', () => {
  it('approved with nothing assigned → the no-seat notice (authorization state, never a login failure)', () => {
    expect(shellDecision(base)).toBe('no-seat');
  });
  it('the primary administrator enters without a seat', () => {
    expect(shellDecision({ ...base, org: { ...base.org, isPrimaryAdmin: true } })).toBe('shell');
  });
  it('an organisation permission (ADMIN / OWNER / MANAGER levels, or an ALLOW override) enters', () => {
    expect(shellDecision({ ...base, org: { ...base.org, permissions: ['audit:event:read'] } })).toBe('shell');
  });
  it('a level with NO organisation permission (USER, CUSTOM) still enters — with empty states, even when no endowment exists', () => {
    expect(shellDecision({ ...base, org: { ...base.org, accessLevel: { key: 'USER' } } })).toBe('shell');
    expect(shellDecision({ ...base, org: { ...base.org, accessLevel: { key: 'CUSTOM' } } })).toBe('shell');
  });
  it('a seat enters', () => {
    expect(shellDecision({ ...base, grants: [{}] })).toBe('shell');
  });
});
