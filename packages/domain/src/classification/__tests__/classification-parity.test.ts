/**
 * `classification-parity.test.ts` — `CLASSIFICATION_GATES` vs `schema.prisma`'s `enum ClassificationGate`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A SECOND PARITY FILE RATHER THAN A FIFTEENTH ROW IN THE FIRST ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `distribution/__tests__/prisma-vocabulary-parity.test.ts` is pinned at **fourteen** pairings, and that
 * number is asserted in three places because it is the *distribution contract's* own list, kept verbatim
 * in step with `contract.ts`'s header. `ClassificationGate` is not part of that contract — it belongs to
 * the compliance catalogue — so adding it there would have meant breaking a deliberate pin to record an
 * unrelated fact.
 *
 * But an uncompared second spelling is exactly the defect this repo has been bitten by three times
 * (`enum Role` in `packages/auth`, `FeeBasis` in `settings.test.ts`, and the whole distribution
 * vocabulary). BR-104 makes it worse than a naming nuisance: a gate spelled `LARGE_MEDIUM` here and
 * renamed in the schema would make an audited-statement obligation **silently inapplicable to every
 * endowment**, and `obligationsForClassification` would report it in `unrecognisedGate` — visible, but
 * only to a caller that checks.
 *
 * So the comparison exists, in its own file, using the same technique and for the same reason: the schema
 * is read as **TEXT**, because `packages/domain` imports nothing internal (the eslint domain block
 * enforces it, and `database → domain` already exists so the import would be a cycle), and because a text
 * read cannot be satisfied by a stale generated client. `node:fs` is legal in this package's test files
 * only.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WAQF_CLASSIFICATIONS } from '../../distribution/contract.js';
import { CLASSIFICATION_GATES, RETIRED_GATES } from '../contract.js';

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../../../database/prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/**
 * Extract one `enum Name { … }` block's members, or `null` when the enum is absent.
 *
 * `null` rather than `[]` for the same reason as the distribution parity test's parser: "renamed or
 * deleted" must be distinguishable from "empty", or every assertion below is vacuously true.
 */
function prismaEnum(name: string): readonly string[] | null {
  const block = new RegExp(String.raw`\benum\s+${name}\s*\{([^}]*)\}`).exec(SCHEMA);
  if (block === null) return null;
  return (block[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

describe('the schema read is trustworthy', () => {
  it('found schema.prisma, and a name that does not exist comes back null', () => {
    expect(SCHEMA.length).toBeGreaterThan(1000);
    expect(prismaEnum('ThisEnumDoesNotExist')).toBeNull();
  });
});

describe('CLASSIFICATION_GATES === schema.prisma enum ClassificationGate', () => {
  it('matches member for member', () => {
    const prisma = prismaEnum('ClassificationGate');
    expect(
      prisma,
      'enum ClassificationGate is not in schema.prisma. If it was renamed, CLASSIFICATION_GATES must ' +
        'follow it — a gate the catalogue can store but this module cannot read makes a regulatory ' +
        'obligation silently inapplicable to every endowment.',
    ).not.toBeNull();
    expect(new Set(CLASSIFICATION_GATES)).toEqual(new Set(prisma));
  });

  it('is the SIX gates §09 needs, in order, and `ALL` is spelled ALL', () => {
    // ⊕ WIDENED FROM FOUR IN S8, and kept EXACT rather than relaxed to a set comparison — the value of
    // this pin is that the vocabulary cannot grow or shrink without somebody writing down why.
    //
    // S8-Q3 (product owner, 2026-08-23): adopt §09's five gates. `EXCLUDE_DIRECT` and `HAS_INCOME`
    // were used by §09's own library table and existed in NO enum, which made seven of its 37
    // templates unrepresentable — including FIN-DIST-01/02, the distribution duty itself. `LARGE_ONLY`
    // is RETIRED by the same ruling but stays in the vocabulary: refused, not remapped.
    //
    // ⚠ ORDER is asserted as well as membership, because `schema.prisma`'s enum is compared with
    // `toStrictEqual` too and a Postgres enum's member ORDER is part of its type — a reordering is a
    // migration, not a rename.
    expect(CLASSIFICATION_GATES).toStrictEqual([
      'ALL',
      'LARGE_MEDIUM',
      'SMALL_DIRECT',
      'EXCLUDE_DIRECT',
      'HAS_INCOME',
      'LARGE_ONLY',
    ]);
  });

  it('the schema enum agrees on ORDER, not only on membership', () => {
    // The block above compares as a SET. A Postgres enum's member order is part of its type and
    // determines sort behaviour, so drift in order is real drift — and it is invisible to a set
    // comparison. Both directions, one assertion.
    const prisma = prismaEnum('ClassificationGate');
    expect(prisma).toStrictEqual([...CLASSIFICATION_GATES]);
  });

  it('exactly ONE gate is retired, and it is the one with no §09 row and no fixture row', () => {
    expect([...RETIRED_GATES]).toStrictEqual(['LARGE_ONLY']);
    // And the retirement is not a deletion: the member must still be in the vocabulary, or an old
    // record carrying it becomes unreadable rather than refused.
    expect(CLASSIFICATION_GATES).toContain('LARGE_ONLY');
  });

  it('is the gate the ComplianceObligation catalogue actually carries', () => {
    // The pairing above proves the enum agrees; this proves the enum is USED where this module thinks it
    // is. A gate enum nothing references would make the whole comparison ornamental.
    const model = /\bmodel\s+ComplianceObligation\s*\{([\s\S]*?)\n\}/.exec(SCHEMA);
    expect(model, 'model ComplianceObligation is not in schema.prisma').not.toBeNull();
    const body = model?.[1] ?? '';
    expect(body.length).toBeGreaterThan(100);
    // POSITIVE CONTROL — these fields exist, so the probe must find them.
    for (const present of ['code', 'section', 'titleAr', 'deadlineRuleKey']) {
      expect(new RegExp(String.raw`^\s*${present}\b`, 'm').test(body), present).toBe(true);
    }
    expect(/^\s*gate\s+ClassificationGate\b/m.test(body)).toBe(true);
    // ⚠ And the WINDOW is not stored on the obligation: the deadline is a Setting KEY, because every
    // statutory window in this repo is unverified and must stay reconfigurable (binding rule 3).
    expect(/^\s*deadlineRuleKey\s+String\?/m.test(body)).toBe(true);
  });
});

describe('the classification vocabulary is not duplicated', () => {
  it('reuses WAQF_CLASSIFICATIONS rather than declaring a second copy', () => {
    // Imported from `distribution/contract.js`, where it is already compared member-for-member against
    // the schema. Two tuples of the classes is the same two-lists-that-must-agree defect one level
    // down, so this module deliberately has none of its own.
    // ⊕ S8-Q4 (owner, 2026-08-23): `NOT_CLASSIFIED` appended — the onboarding state, never a gate-TRUE.
    // ⊕ S9-4a (owner ruling, fifth batch, 2026-08-25): `DIRECT_UTILIZATION` removed — an orthogonal
    // usage attribute, not a size. The list is spelled out rather than derived precisely so a
    // narrowing has to be written down here.
    expect(WAQF_CLASSIFICATIONS).toStrictEqual(['LARGE', 'MEDIUM', 'SMALL', 'NOT_CLASSIFIED']);
    expect(new Set(prismaEnum('WaqfClassification') ?? [])).toEqual(new Set(WAQF_CLASSIFICATIONS));
  });

  it('the classification BANDS are Setting keys in the schema, not columns', () => {
    // Binding rule 3, checked against the artefact: if a `thresholdSar` column ever appears on Waqf, the
    // unverified SAR 200M/50M figures have escaped `Setting` into the data model, and a correction stops
    // being a config change.
    const waqf = /\bmodel\s+Waqf\s*\{([\s\S]*?)\n\}/.exec(SCHEMA);
    const body = waqf?.[1] ?? '';
    expect(body.length).toBeGreaterThan(100);
    // POSITIVE CONTROL first — `classification` IS on the model.
    expect(/^\s*classification\b/m.test(body)).toBe(true);
    for (const forbidden of ['thresholdSar', 'classificationThreshold', 'bandSar']) {
      expect(new RegExp(String.raw`^\s*${forbidden}\b`, 'm').test(body), forbidden).toBe(false);
    }
  });
});
