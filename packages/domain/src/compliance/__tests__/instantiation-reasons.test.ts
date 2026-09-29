/**
 * ⊕ S11 (2026-09-02) — the register-instantiation reasons vs `schema.prisma`, member for member.
 *
 * The E11 defect (found by item 2a): the API decided "a register exists" by `instantiatedReason IS
 * NOT NULL`, which counts a sweep-raised `EVENT_TRIGGER` duty as a register — so an endowment whose
 * certificate expired before its register was generated could never run initial setup. The fix names
 * the register reasons explicitly. THIS PIN is what carries the safety: the named set plus the one
 * trigger reason must equal the Prisma enum exactly, so a fifth `TaskInstantiationReason` cannot
 * arrive and silently fall on either side of "is this a register?". Classify it deliberately, in
 * `catalogue.ts`, in the same change as the migration.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EVENT_TRIGGER_REASON,
  REGISTER_INSTANTIATION_REASONS,
  isRegisterInstantiationReason,
} from '../catalogue.js';

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../../../database/prisma/schema.prisma', import.meta.url)),
  'utf8',
);

function prismaEnum(name: string): readonly string[] {
  const match = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(SCHEMA);
  if (match === null) throw new Error(`enum ${name} not found in schema.prisma`);
  return (match[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

describe('register-instantiation reasons vs TaskInstantiationReason (S11 pin)', () => {
  it('the named register reasons ∪ {EVENT_TRIGGER} is EXACTLY the Prisma enum — a fifth member must be classified deliberately', () => {
    const members = prismaEnum('TaskInstantiationReason');
    const classified = [...REGISTER_INSTANTIATION_REASONS, EVENT_TRIGGER_REASON];
    expect(
      [...members].sort(),
      'TaskInstantiationReason changed. Decide whether the new member PROVES A REGISTER (add it to ' +
        'REGISTER_INSTANTIATION_REASONS) or is a DUTY RAISED BY ITS TRIGGER (a second trigger reason: ' +
        'extend the trigger side and the API predicates). Never let it default to either.',
    ).toStrictEqual([...classified].sort());
    expect(new Set(classified).size).toBe(classified.length);
  });

  it('EVENT_TRIGGER is the ONE reason that can exist without a register — the other three presuppose one', () => {
    expect(REGISTER_INSTANTIATION_REASONS).toContain('INITIAL_SETUP');
    expect(REGISTER_INSTANTIATION_REASONS).toContain('RECLASSIFICATION');
    expect(REGISTER_INSTANTIATION_REASONS).toContain('LIBRARY_UPGRADE');
    expect(
      (REGISTER_INSTANTIATION_REASONS as readonly string[]).includes(EVENT_TRIGGER_REASON),
    ).toBe(false);
  });

  it('isRegisterInstantiationReason: register reasons yes, the trigger reason no, null/undefined no', () => {
    for (const reason of REGISTER_INSTANTIATION_REASONS) {
      expect(isRegisterInstantiationReason(reason)).toBe(true);
    }
    expect(isRegisterInstantiationReason(EVENT_TRIGGER_REASON)).toBe(false);
    expect(isRegisterInstantiationReason(null)).toBe(false);
    expect(isRegisterInstantiationReason(undefined)).toBe(false);
    expect(isRegisterInstantiationReason('SOMETHING_ELSE')).toBe(false);
  });
});
