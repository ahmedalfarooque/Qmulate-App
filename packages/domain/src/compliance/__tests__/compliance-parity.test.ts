/**
 * `compliance-parity.test.ts` — E7's vocabulary vs `schema.prisma`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A THIRD PARITY FILE RATHER THAN A ROW IN EITHER EXISTING ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `distribution/__tests__/prisma-vocabulary-parity.test.ts` is pinned at **fourteen** pairings, with
 * that number asserted in several places and four labels named individually so the count cannot be
 * reached by substitution — it is the *distribution contract's* own list. `ComplianceSection` and
 * `ComplianceRecurrence` are not part of that contract, so adding them there would mean breaking a
 * deliberate pin to record an unrelated fact.
 *
 * `classification-parity.test.ts` took exactly this decision once already, for `ClassificationGate`,
 * and wrote down the reasoning. This file is the third instance of the same pattern and the same
 * technique: read `schema.prisma` as **TEXT**, because `packages/domain` imports nothing internal
 * (the eslint domain block enforces it, and `database → domain` already exists so an import would
 * cycle), and because a text read cannot be satisfied by a stale generated client.
 *
 * An uncompared second spelling is the defect this repo has been bitten by four times — `enum Role`
 * in `packages/auth`, `FeeBasis` in `settings.test.ts`, the whole distribution vocabulary, and
 * `ALL_MODELS` against the schema's model list. Compliance is the fifth candidate, and the stakes
 * are the same shape as BR-104's: a section spelled `GOVERNMENT_LEGAL` here and renamed in the
 * schema would make an entire workstream's obligations unreadable, and the failure would surface as
 * an empty board rather than as an error.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { OBLIGATION_LIBRARY, templatesWithheldFromRegister } from '../catalogue.js';
import {
  COMPLIANCE_SECTIONS,
  OBLIGATION_TEMPLATE_SCHEMA_DELTA,
  isComplianceSection,
} from '../contract.js';

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../../../database/prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/**
 * One `enum Name { … }` block's members, or `null` when the enum is absent.
 *
 * `null` rather than `[]`, for the reason the two sibling parity files give: "renamed or deleted"
 * must be distinguishable from "empty", or every assertion below is vacuously true.
 */
function prismaEnum(name: string): readonly string[] | null {
  const block = new RegExp(String.raw`\benum\s+${name}\s*\{([^}]*)\}`).exec(SCHEMA);
  if (block === null) return null;
  return (block[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

/** One `model Name { … }` block, or `null`. Used to prove the DECLARED DELTA is really absent. */
function prismaModel(name: string): string | null {
  const block = new RegExp(String.raw`\bmodel\s+${name}\s*\{([\s\S]*?)\n\}`).exec(SCHEMA);
  return block === null ? null : (block[1] ?? '');
}

describe('the schema read is trustworthy', () => {
  it('found schema.prisma, and a name that does not exist comes back null', () => {
    expect(SCHEMA.length).toBeGreaterThan(1000);
    expect(prismaEnum('ThisEnumDoesNotExist')).toBeNull();
    expect(prismaModel('ThisModelDoesNotExist')).toBeNull();
  });

  it('POSITIVE CONTROL — the parsers find things this test names by hand', () => {
    expect(prismaEnum('ComplianceSection')).not.toBeNull();
    expect(prismaModel('ComplianceObligation')).not.toBeNull();
    expect(prismaModel('ComplianceObligation')).toContain('titleAr');
  });
});

describe('ComplianceSection — E7 taking the vocabulary the classification contract left open', () => {
  it('matches schema.prisma member for member, and in the same order', () => {
    // Order as well as membership: `classification-parity.test.ts` pins its gates with
    // `toStrictEqual` for the same reason — a reordering is invisible to a set comparison and
    // visible to anything that renders the vocabulary as a list.
    expect(prismaEnum('ComplianceSection')).toStrictEqual([...COMPLIANCE_SECTIONS]);
  });

  it('the guard accepts every schema member and nothing else', () => {
    for (const member of prismaEnum('ComplianceSection') ?? [])
      expect(
        isComplianceSection(member),
        `${member} is in the schema but the guard rejects it`,
      ).toBe(true);
    expect(isComplianceSection('FINANCIAL_LEGAL')).toBe(false);
    expect(isComplianceSection('financial')).toBe(false);
  });

  it('every catalogue row carries a section the schema knows', () => {
    const members = new Set(prismaEnum('ComplianceSection') ?? []);
    for (const entry of OBLIGATION_LIBRARY)
      expect(members, `${entry.code} carries section ${entry.section}`).toContain(entry.section);
  });
});

describe('THE DECLARED DELTA — the engine leads the schema, and the lead is written down', () => {
  it('every field in the delta is genuinely ABSENT from compliance_obligation', () => {
    // The sanctioned mechanism for an engine leading the schema is a DECLARED delta
    // (`prisma-vocabulary-parity.test.ts`'s PENDING_MIGRATION). This is its compliance-side twin,
    // and it is asserted in the direction that matters: the day a migration adds one of these
    // columns, this test fails and the entry has to come out. A stale "we still owe this" is as
    // misleading as an undeclared one — that is the whole lesson of the five premature closures on
    // this project's record.
    const model = prismaModel('ComplianceObligation');
    expect(model, 'compliance_obligation is gone from the schema').not.toBeNull();
    const present = OBLIGATION_TEMPLATE_SCHEMA_DELTA.filter((field) =>
      new RegExp(String.raw`^\s*${field}\s`, 'm').test(model ?? ''),
    );
    expect(
      present,
      `${present.join(', ')} now EXIST on compliance_obligation — remove them from ` +
        'OBLIGATION_TEMPLATE_SCHEMA_DELTA, because a delta that lists a shipped column is a lie ' +
        'about what is still owed.',
    ).toEqual([]);
  });

  it('the columns the catalogue DOES share with the schema are all present', () => {
    // The other half, so the delta cannot be padded: everything not declared as owed must exist.
    const model = prismaModel('ComplianceObligation') ?? '';
    for (const field of [
      'code',
      'section',
      'workstreamAr',
      'workstreamEn',
      'titleAr',
      'titleEn',
      'gate',
      'deadlineRuleKey',
    ])
      expect(
        new RegExp(String.raw`^\s*${field}\s`, 'm').test(model),
        `${field} is missing from compliance_obligation, so the catalogue cannot be seeded`,
      ).toBe(true);
  });

  it('⚠ titleAr is NOT NULL in the schema, which is WHY one template cannot be seeded', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // THE SECOND HALF OF THE WITHHELD SET'S REASON, PINNED WHERE IT CAN BE READ.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // `templatesWithheldFromRegister()` derives its members from `titleAr === null`. That
    // derivation is only CORRECT while the column refuses nulls — the day a migration relaxes it,
    // the right answer becomes "seed all 37" and the withheld set must empty. Nothing else in this
    // repository would notice: the seed would keep withholding a row it could now store, and the
    // register would keep missing Nazarah Art. 18's conflict-of-interest duty for no reason at all.
    //
    // So the schema text is read directly. `titleAr String` is NOT NULL; `titleAr String?` is
    // nullable. Asserted as a REGEX over the model block rather than a `toContain('titleAr')`,
    // because the loose check passes for both spellings — which is exactly how a relaxed constraint
    // would slip past a suite that thought it was checking one.
    const model = prismaModel('ComplianceObligation') ?? '';
    expect(model, 'compliance_obligation is gone from the schema').not.toBe('');
    expect(
      /^\s*titleAr\s+String\s*$/m.test(model),
      'ComplianceObligation.titleAr is no longer a NOT NULL String. If it is now nullable, ' +
        'templatesWithheldFromRegister() must stop withholding GOV-COI-01 and the seed count in ' +
        'packages/database/test/seed.integration.test.ts must move 46 -> 47 — deliberately, ' +
        'citing whoever ruled it, and with the product-copy question answered (an Arabic screen ' +
        'rendering a duty whose Arabic does not exist).',
    ).toBe(true);

    // And the consequence, stated here so the two facts are never separated: given the column, the
    // catalogue's one null row is unstorable, and the withheld set says so by name.
    expect(templatesWithheldFromRegister().map((entry) => entry.code)).toStrictEqual([
      'GOV-COI-01',
    ]);
    expect(OBLIGATION_LIBRARY.filter((entry) => entry.titleAr === null)).toHaveLength(1);
  });

  it('⊕ S8-Q3 LANDED — ClassificationGate now expresses every gate the library uses', () => {
    // ⚠ THIS ASSERTION REPLACES ONE WRITTEN TO FAIL THE DAY THE MIGRATION LANDED, and it failed
    // exactly then. Its own comment said: "whoever lands it must come back and delete this assertion
    // along with the 'not yet in the database' note in catalogue.ts's header." The owner ruled S8-Q3
    // on 2026-08-23 ("Adopt §09's five gates"), `EXCLUDE_DIRECT` and `HAS_INCOME` are in the enum, and
    // the seven previously unrepresentable templates — FIN-DIST-01/02 among them — are representable.
    //
    // The INVERSE is asserted now, so a revert is caught: every gate the library carries must be a
    // schema member, and the two new members must be present by name.
    const gates = new Set(prismaEnum('ClassificationGate') ?? []);
    const unexpressible = [...new Set(OBLIGATION_LIBRARY.map((entry) => entry.gate))].filter(
      (gate) => !gates.has(gate),
    );
    expect(
      unexpressible,
      `the schema lost a gate the library uses: ${unexpressible.join(', ')}`,
    ).toEqual([]);
    expect(gates.has('EXCLUDE_DIRECT')).toBe(true);
    expect(gates.has('HAS_INCOME')).toBe(true);

    // And the retired one is still THERE — refused-not-remapped means the member survives so an old
    // record reads and the engine can refuse it by name.
    expect(gates.has('LARGE_ONLY')).toBe(true);
    expect(
      [...new Set(OBLIGATION_LIBRARY.map((entry) => entry.gate))],
      'a library row started using the retired gate',
    ).not.toContain('LARGE_ONLY');
  });
});
