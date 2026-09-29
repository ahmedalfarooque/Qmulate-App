/**
 * ⊕ S11-2 — the `DeadlineDischargeKind` vocabulary, PINNED while it has one member.
 *
 * The AuditAction lesson (S10/T1, `audit-action-vocabulary.test.ts`), applied on schedule: a closed
 * vocabulary with no pin lands a future member SILENTLY — no migration is demanded, no ar/en copy is
 * demanded, and the parity suites' silence reads as success. This enum exists to carry a seam (memo,
 * S11 addendum second batch: whether an endowment registered BEFORE the regulation's effective date
 * was ever subject to the 30-business-day duty is an open question of Saudi law, and if it never
 * attached the honest state is NOT APPLICABLE — neither `overdue` nor `met`). The seam is the point;
 * the pin is what keeps it from being crossed quietly.
 *
 * THE DISCIPLINE THIS PIN ENFORCES when it goes red on a deliberate widening:
 *   1. Extend PINNED_DISCHARGE_KINDS in the SAME change as the `ALTER TYPE … ADD VALUE` migration
 *      (ADR-0004: refuse, never remap — a member is added, never renamed into).
 *   2. Relax `deadline_discharge_kind_pairs_with_met` in that migration (a NOT-APPLICABLE kind has no
 *      `satisfiedAt`) and KEEP `deadline_discharge_met_means_satisfied` (only `MET` means satisfied).
 *   3. Add the member's ar/en copy under `endowments.dischargeKindValue` in BOTH catalogues — the
 *      i18n parity suite reads this enum from `schema.prisma` and will demand it.
 *   4. Say in the change record which owner ruling the new state rests on. A discharge state is a
 *      statement about a statutory duty; engineering does not add one on its own reading.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SCHEMA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'prisma',
  'schema.prisma',
);

/** The vocabulary as of S11-2. `MET` pairs with `Deadline.satisfiedAt`, both directions, write-once. */
export const PINNED_DISCHARGE_KINDS = ['MET'] as const;

describe('DeadlineDischargeKind vocabulary (S11-2 pin)', () => {
  it('holds exactly the PINNED members, in order — a widening must be deliberate, relax the named CHECK, and declare its ar/en copy owed', () => {
    const source = readFileSync(SCHEMA, 'utf8');
    const match = /enum DeadlineDischargeKind \{([^}]*)\}/.exec(source);
    expect(match, 'enum DeadlineDischargeKind not found in schema.prisma').not.toBeNull();

    const members = (match?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));

    expect(
      members,
      'DeadlineDischargeKind changed. If this is deliberate: extend PINNED_DISCHARGE_KINDS in this ' +
        'same change, add the ALTER TYPE migration that ALSO relaxes ' +
        'deadline_discharge_kind_pairs_with_met (and keeps deadline_discharge_met_means_satisfied), ' +
        'add the member to endowments.dischargeKindValue in BOTH catalogues, and name the owner ' +
        'ruling the new state rests on. A silent vocabulary addition is the failure this file exists to end.',
    ).toStrictEqual([...PINNED_DISCHARGE_KINDS]);
  });

  it('the column is nullable and the field is documented as write-once beside satisfiedAt — the seam is stated where the next reader will look', () => {
    const source = readFileSync(SCHEMA, 'utf8');
    expect(source).toMatch(/dischargeKind\s+DeadlineDischargeKind\?/);
    // The doc comment names both CHECKs; a reader of the model must not have to open migration 49.
    expect(source).toContain('deadline_discharge_kind_pairs_with_met');
    expect(source).toContain('deadline_discharge_met_means_satisfied');
  });
});
