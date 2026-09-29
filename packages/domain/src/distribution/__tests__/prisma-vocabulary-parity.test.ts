/**
 * `prisma-vocabulary-parity.test.ts` — the engine's closed vocabularies vs `schema.prisma`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `contract.ts`'s header makes a load-bearing claim: that the engine adopts the DATABASE spelling
 * for its inputs as well as its outputs, so **E5/S6 can feed `runDistribution` straight from a
 * Prisma row with no case-mapping layer in between** — because that mapping layer is exactly where
 * `direct-utilization` silently fails to equal `DIRECT_UTILIZATION` and a whole endowment is
 * mis-classified without an error.
 *
 * That claim was TRUE when it was written and **nothing kept it true.** Two lists that must agree,
 * with no test comparing them, is the failure mode this repo has already been bitten by twice:
 * `packages/auth/test/roles.test.ts` parses `enum Role` out of `schema.prisma` for the role model,
 * and `packages/domain/src/__tests__/settings.test.ts` does the same for `FeeBasis`. The
 * distribution vocabulary — eleven enums that decide who is entitled, who is payable and whether a
 * receipt is corpus — had no such comparison. This is it.
 *
 * A drift here does not throw. `beneficiaryInputSchema` would reject the unknown member, so the
 * *visible* symptom is a whole endowment that cannot be computed at all — and for `receiptClass`,
 * which is deliberately a `z.string()` so an unrecognised value reaches the corpus guard as data,
 * a renamed Prisma member would surface as `RECEIPT_UNCLASSIFIED` on legitimate rows.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THREE CATEGORIES, BECAUSE "EQUAL" STOPPED BEING THE ONLY HONEST RELATION (ADR-0009)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 changed the engine's entitlement model and deliberately wrote **no migration**, so between
 * 2026-08-02 and 2026-08-13 the engine led `schema.prisma` on one enum and carried four vocabularies
 * the schema had never had. Rather than weaken the comparison, the relations were named:
 *
 *  · {@link MUST_MATCH} — member-for-member **equal** (**14** pairings since S4/E3).
 *  · {@link PENDING_MIGRATION} — engine is a strict **superset by a declared delta**. **EMPTY since
 *    S4/E3**: migration `00000000000012_e3_lineage_reversion_deed_terms` landed the whole declared
 *    delta, and the emptying is asserted as a *value* rather than left as a missing test — see
 *    "the declared delta is EMPTY, and that emptiness is asserted" below.
 *  · the engine-only block — pinned **absent** (**2** vocabularies since S4/E3), so adding the enum
 *    forces a pairing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT S4/E3 MOVED, AND WHY THE FILE GOT *STRONGER* RATHER THAN SHORTER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Migration 12 landed `EntitlementOrder.LINEAGE_CONTINUATION`, `enum ContinuationStipulation`,
 * `enum LineageLink`, `enum ReversionKind`, `Beneficiary.parentId` / `.lineageLink` / `.active` and
 * `Waqf.continuationStipulation` + the four مآل columns. So four relations that were "declared gap" or
 * "pinned absent" became **comparable**, and every one of them moved INTO the strongest category this
 * file has:
 *
 *   · `ENTITLEMENT_ORDERS` — was `PENDING_MIGRATION` with delta `['LINEAGE_CONTINUATION']`, now a
 *     plain equality pairing. The delta list is empty and its emptiness is pinned.
 *   · `CONTINUATION_STIPULATIONS`, `LINEAGE_LINKS`, `REVERSION_KINDS` — were pinned *absent*, now
 *     equality pairings, so the two spellings of each fact are compared member-for-member.
 *   · the `Beneficiary` and `Waqf` field probes — were pinned *absent*, now **inverted** to assert
 *     PRESENCE, keeping their positive controls (without a control, a typo in a probe makes the
 *     assertion vacuous — which is the whole reason the controls exist) and *keeping the rejected
 *     spellings pinned absent*, so one fact keeps one spelling.
 *
 * `DisbursementSchedule` and `MaintenanceRuleKind` **stay pinned absent on purpose**: they live inside
 * the Shart JSON, not in a Prisma enum, and promoting them is E5's decision, not a tidy-up.
 *
 * A category boundary is where a "temporary" gap turns permanent, so the disjointness of the first two
 * is asserted as well: a vocabulary in both lists would have one assertion passing vacuously.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * READ AS TEXT, NOT IMPORTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/domain` imports nothing internal (the eslint domain block enforces it) and
 * `database → domain` already exists, so importing `@qmulate/database` here would be a cycle. The
 * schema is read as text — the same technique, and for the same reason, as the two tests named
 * above. A text read also cannot be satisfied by a stale generated client: the artefact under
 * review is the file a developer edits.
 *
 * `node:fs` is legal here and only here: the eslint domain block permits it in test files, and the
 * *engine* still performs no I/O of any kind.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BENEFICIARY_KINDS,
  BENEFICIARY_LINES,
  CAPITAL_SOURCES,
  CONTINUATION_STIPULATIONS,
  DISBURSEMENT_SCHEDULES,
  ENTITLEMENT_ORDERS,
  FEE_BASES,
  LINEAGE_LINKS,
  LINE_STATUSES,
  MAINTENANCE_RULE_KINDS,
  RECEIPT_CLASSES,
  RESIDENCIES,
  REVERSION_KINDS,
  VERIFICATION_STATUSES,
  WAQF_CLASSIFICATIONS,
  WAQF_TYPES,
} from '../contract.js';

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../../../database/prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/**
 * Extract one `enum Name { … }` block's members.
 *
 * Returns `null` when the enum is absent, so "the enum was renamed or deleted" is distinguishable
 * from "the enum is empty" — a parser that silently returned `[]` would make every assertion below
 * vacuously true, which is the one way this test could go green while proving nothing.
 */
function prismaEnum(name: string): readonly string[] | null {
  const block = new RegExp(String.raw`\benum\s+${name}\s*\{([^}]*)\}`).exec(SCHEMA);
  if (block === null) return null;
  return (block[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

/**
 * Every engine vocabulary that `contract.ts`'s header names as a Prisma enum, paired with it.
 *
 * The list is the header's list, verbatim — if a pair is removed from here, the header's claim about
 * it stops being tested, so removing one is a deliberate act and shows up in review.
 */
const MUST_MATCH: readonly (readonly [string, readonly string[], string])[] = [
  ['RECEIPT_CLASSES', RECEIPT_CLASSES, 'ReceiptClass'],
  ['CAPITAL_SOURCES', CAPITAL_SOURCES, 'CapitalSource'],
  ['WAQF_CLASSIFICATIONS', WAQF_CLASSIFICATIONS, 'WaqfClassification'],
  // WAQF_TYPES stays a plain EQUALITY pairing, `JOINT` included on both sides. ADR-0009 makes the
  // engine refuse the *value*; it does not narrow the *vocabulary*, and no migration is written. That
  // distinction is the whole of ADR-0009 decision 3, and this row is where it stays visible: if
  // someone "tidies" JOINT out of contract.ts, this goes red and the reconciliation with
  // awqaf-law.md Art. 4 has to be had with counsel rather than in a code change.
  ['WAQF_TYPES', WAQF_TYPES, 'WaqfType'],
  ['BENEFICIARY_LINES', BENEFICIARY_LINES, 'BeneficiaryLine'],
  ['BENEFICIARY_KINDS', BENEFICIARY_KINDS, 'BeneficiaryKind'],
  ['VERIFICATION_STATUSES', VERIFICATION_STATUSES, 'VerificationStatus'],
  ['RESIDENCIES', RESIDENCIES, 'BeneficiaryResidency'],
  ['FEE_BASES', FEE_BASES, 'FeeBasis'],
  ['LINE_STATUSES', LINE_STATUSES, 'DistributionLineStatus'],
  // ── S4/E3 · the four ADR-0009 / R7 relations migration 12 made COMPARABLE ────────────────────
  // `ENTITLEMENT_ORDERS` was the single `PENDING_MIGRATION` row (declared delta
  // `['LINEAGE_CONTINUATION']`). The migration is additive — existing rows keep their value — so the
  // honest relation is now plain equality, and the delta list below is empty *and asserted empty*.
  ['ENTITLEMENT_ORDERS', ENTITLEMENT_ORDERS, 'EntitlementOrder'],
  // …and the three that were pinned ABSENT. Each is a deed fact with two spellings; comparing them
  // member-for-member is the whole point of promoting them rather than deleting their pins.
  ['CONTINUATION_STIPULATIONS', CONTINUATION_STIPULATIONS, 'ContinuationStipulation'],
  ['LINEAGE_LINKS', LINEAGE_LINKS, 'LineageLink'],
  ['REVERSION_KINDS', REVERSION_KINDS, 'ReversionKind'],
];

/**
 * Engine vocabularies that are a strict **SUPERSET** of their Prisma enum, **with the delta declared**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EMPTY SINCE S4/E3 — AND KEPT, NOT DELETED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 added `LINEAGE_CONTINUATION` to `ENTITLEMENT_ORDERS` and deliberately wrote no migration,
 * so for eleven days the engine led `schema.prisma` on the one enum that decides who is entitled. The
 * relation was recorded here as DATA — a declared delta, asserted in both directions — rather than by
 * deleting the pairing, because deleting it would have silently un-tested `contract.ts`'s "no
 * case-mapping layer" claim for exactly that enum.
 *
 * **Migration `00000000000012_e3_lineage_reversion_deed_terms` closed it**, so the row moved up into
 * {@link MUST_MATCH} and this list is empty. Three things about that, all deliberate:
 *
 *  1. **The list, its type and its machinery stay.** The next vocabulary the engine has to lead — and
 *     there will be one, because the engine is where a deed fact is discovered — records the gap here
 *     instead of re-inventing the category under deadline pressure.
 *  2. **The emptiness is ASSERTED, not merely reflected.** `it.each([])` in Vitest registers zero
 *     tests and passes silently (measured), so an empty list on its own would prove nothing at all.
 *     See `'the declared delta is EMPTY, and migration 12 is what emptied it'` below, which is the
 *     INVERSION of the old `records the reason the delta exists` test — inverted rather than deleted,
 *     per the S4 rule that a pin for a closed gap becomes a pin on the closure.
 *  3. **The both-directions assertion is still wired.** Re-declaring a row here re-arms it with no
 *     archaeology; it does not have to be rewritten from the git history.
 *
 * The tuple is `[label, engineVocabulary, prismaEnumName, declaredDelta]`.
 */
const PENDING_MIGRATION: readonly (readonly [
  string,
  readonly string[],
  string,
  readonly string[],
])[] = [
  // ── EMPTY ON PURPOSE (S4/E3, migration 12). ───────────────────────────────────────────────────
  // Was: ['ENTITLEMENT_ORDERS', ENTITLEMENT_ORDERS, 'EntitlementOrder', ['LINEAGE_CONTINUATION']]
  // `EntitlementOrder` now declares LINEAGE_CONTINUATION, so that row is an equality pairing in
  // MUST_MATCH above. Adding a row here again is how a NEW deliberate gap is declared; adding an
  // engine member without either a migration or a row here goes red in MUST_MATCH.
];

describe('the schema read itself is trustworthy', () => {
  // A silently-empty read would make every parity assertion below vacuous.
  it('found schema.prisma and can parse an enum out of it', () => {
    expect(SCHEMA.length).toBeGreaterThan(1000);
    expect(prismaEnum('ReceiptClass')).toEqual(['INCOME', 'CAPITAL']);
    // The negative control: a name that does not exist must come back null, not empty.
    expect(prismaEnum('ThisEnumDoesNotExist')).toBeNull();
  });

  it('covers every pairing contract.ts claims', () => {
    // 14 equal + 0 declared-delta = the fourteen pairings contract.ts's header names since S4/E3
    // (was 10 + 1 before migration 12). The split is the header's split; changing one without the
    // other makes this test's own rationale false.
    expect(MUST_MATCH).toHaveLength(14);
    expect(PENDING_MIGRATION).toHaveLength(0);
    // The four S4 arrivals are named individually, so "14" cannot be reached by adding some OTHER
    // pairing while one of these quietly drops out of the comparison.
    const labels = MUST_MATCH.map(([label]) => label);
    for (const label of [
      'ENTITLEMENT_ORDERS',
      'CONTINUATION_STIPULATIONS',
      'LINEAGE_LINKS',
      'REVERSION_KINDS',
    ]) {
      expect(labels, `${label} must be compared member-for-member since migration 12`).toContain(
        label,
      );
    }
  });

  it('keeps the two categories disjoint — no vocabulary is asserted both equal and ahead', () => {
    const equal = new Set(MUST_MATCH.map(([label]) => label));
    for (const [label] of PENDING_MIGRATION) {
      expect(
        equal.has(label),
        `${label} is in both MUST_MATCH and PENDING_MIGRATION. One of them would pass vacuously ` +
          `and the other would decide the outcome — pick the category that states the truth.`,
      ).toBe(false);
    }
  });
});

describe('engine vocabulary === schema.prisma enum, member for member', () => {
  it.each(MUST_MATCH.map(([label, engine, prisma]) => [label, engine, prisma] as const))(
    '%s matches Prisma %s',
    (label, engine, prismaName) => {
      const prisma = prismaEnum(prismaName);
      expect(
        prisma,
        `enum ${prismaName} is not in schema.prisma. Either it was renamed — in which case ` +
          `${label} must follow it and contract.ts's "no case-mapping layer" claim is currently ` +
          `false — or this pairing is obsolete and should be deleted from MUST_MATCH deliberately.`,
      ).not.toBeNull();

      // Sets, not arrays: declaration ORDER is not part of the contract (GATE_PRECEDENCE is the one
      // place order matters, and it is asserted in gates.test.ts). Membership is.
      expect(new Set(engine), `${label} vs Prisma ${prismaName}`).toEqual(new Set(prisma));
    },
  );

  it('⊕ S9-4a · DIRECT_UTILIZATION is GONE from BOTH sides — the narrowing is symmetric', () => {
    // This test used to prove the SPELLING: `DIRECT_UTILIZATION`, not §08's sketch of
    // `direct-utilization` — a difference a mapping layer would have to TRANSFORM rather than merely
    // upper-case, which is how it would get that one wrong.
    //
    // ⊕ The owner removed the value entirely (fifth batch, 2026-08-25: it is an orthogonal usage
    // attribute, not a size). So the spelling question is moot and the assertion becomes the more
    // useful one: **it is absent from BOTH the engine list and the Prisma enum.** A narrowing that
    // landed on one side only is exactly the drift this whole file exists to catch — and it very
    // nearly happened here: `packages/database`'s own hand-written `WaqfClassificationValue` alias
    // still said four when the other two said three, and it was the seed's type-check that found it.
    expect(WAQF_CLASSIFICATIONS as readonly string[]).not.toContain('DIRECT_UTILIZATION');
    expect(prismaEnum('WaqfClassification')).not.toContain('DIRECT_UTILIZATION');
    // …and the lower-snake sketch spelling never appears either, which was the original point.
    expect(WAQF_CLASSIFICATIONS as readonly string[]).not.toContain('direct-utilization');
    // The three surviving size bands ARE on both sides, so the test cannot pass by both being empty.
    for (const band of ['LARGE', 'MEDIUM', 'SMALL']) {
      expect(WAQF_CLASSIFICATIONS as readonly string[]).toContain(band);
      expect(prismaEnum('WaqfClassification')).toContain(band);
    }
  });
});

describe('engine leads schema.prisma by a DECLARED delta, not by an accident', () => {
  it.each(
    PENDING_MIGRATION.map(
      ([label, engine, prismaName, delta]) => [label, engine, prismaName, delta] as const,
    ),
  )(
    '%s is a superset of Prisma %s by exactly the declared delta',
    (label, engine, prismaName, declaredDelta) => {
      const prisma = prismaEnum(prismaName);
      expect(
        prisma,
        `enum ${prismaName} is not in schema.prisma at all. This pairing claims the engine is ` +
          `AHEAD of it by a known delta, which presupposes the enum exists — so either it was ` +
          `renamed (and ${label} must follow) or this row belongs somewhere else.`,
      ).not.toBeNull();
      const prismaMembers = new Set(prisma ?? []);
      const engineMembers = new Set(engine);

      // Direction 1 — nothing in the database is missing from the engine. This is the half that a
      // deleted pairing would have stopped testing: a renamed Prisma member would otherwise reach
      // `beneficiaryInputSchema`/`parseEntitlementOrder` as an unrecognised value and refuse a whole
      // legitimate endowment.
      for (const member of prismaMembers) {
        expect(
          engineMembers.has(member),
          `Prisma ${prismaName}.${member} is not in ${label}. The engine may lead the schema; it ` +
            `may never fall behind it, or a row the database can store cannot be computed.`,
        ).toBe(true);
      }

      // Direction 2 — the engine's excess is EXACTLY what was declared. Not a subset, not "at most":
      // if E3/E4 lands the migration the delta must be emptied deliberately, and a new member added
      // without declaring it here goes red rather than quietly widening the gap.
      const ahead = [...engineMembers].filter((member) => !prismaMembers.has(member)).sort();
      expect(
        ahead,
        `${label} leads Prisma ${prismaName} by [${ahead.join(', ')}] but declares ` +
          `[${[...declaredDelta].sort().join(', ')}]. Either the migration landed (empty the delta) ` +
          `or a member was added without recording that the database cannot store it yet.`,
      ).toEqual([...declaredDelta].sort());
    },
  );

  /**
   * ⚠ **THE INVERSION OF `records the reason the delta exists`, not its deletion (S4/E3).**
   *
   * The old test pinned `PENDING_MIGRATION`'s one row as a value — `['EntitlementOrder']` — so that a
   * "temporary" gap could not become permanent silently. Migration 12 closed the gap, so the same
   * sentence now has to be asserted from the other side: the delta is EMPTY, and the thing that
   * emptied it is NAMED. Deleting the test instead would have removed the only place the closure is
   * recorded as a fact, which is the failure mode the original test existed to prevent.
   *
   * The migration is asserted by reading the migrations directory as TEXT — the same technique, and
   * for the same reason, as the schema read at the top of this file: the artefact under review is the
   * file a developer edits, and a name in a comment is not a name a test can check.
   */
  it('the declared delta is EMPTY, and migration 12 is what emptied it', () => {
    expect(
      PENDING_MIGRATION,
      'PENDING_MIGRATION is non-empty. Adding a declared gap is legitimate — but then this test ' +
        'must be re-inverted to name the NEW gap and what will close it, exactly as it named ' +
        'EntitlementOrder before migration 12.',
    ).toStrictEqual([]);

    // The migration that closed it exists, is the twelfth, and is HAND-AUTHORED (every guard
    // migration in this repo carries that warning). Named so the closure is traceable from the test
    // that used to record the gap.
    const migration = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../database/prisma/migrations/00000000000012_e3_lineage_reversion_deed_terms/migration.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    expect(migration.length).toBeGreaterThan(1000);
    // The one member that WAS the delta, added by that migration. `ALTER TYPE … ADD VALUE` is the
    // additive form: existing rows keep their value, which is why no data migration was owed.
    expect(migration).toContain('LINEAGE_CONTINUATION');
    // …and the three enums that were pinned absent are created by the same migration, so "the whole
    // declared delta landed in ONE migration" is checked rather than asserted in prose.
    for (const created of ['ContinuationStipulation', 'LineageLink', 'ReversionKind']) {
      expect(migration, `${created} must be created by migration 12`).toContain(created);
    }
  });
});

describe('the two remaining engine-only vocabularies are engine-only ON PURPOSE', () => {
  /**
   * These two have no Prisma counterpart, and `contract.ts`'s header correctly does not claim they do.
   * Pinned so the absence stays a *recorded fact* rather than an oversight: if E5 later adds either
   * enum to `schema.prisma`, this test fails and forces the pairing to be added to `MUST_MATCH` above
   * instead of two spellings drifting apart unnoticed.
   *
   * · `DISBURSEMENT_SCHEDULES` / `MAINTENANCE_RULE_KINDS` — S3, and **still absent after S4/E3 on
   *   purpose.** Both are terms of the Shart, and the Shart is stored as `shartAlWaqif Json`, written
   *   once and sealed by `qmulate_shart_guard()` — so their home is a key inside that JSON, not a
   *   column with an enum. Promoting either to a Prisma enum is E5's decision about where the
   *   maintenance rule and the disbursement channel live; it is not a tidy-up, and S4 did not make it.
   *   Both are also still on `FIXTURE_DELTA_REQUIRED`: `sample-waqf.json` records neither.
   *
   * ⚠ **THREE VOCABULARIES LEFT THIS BLOCK IN S4/E3** — `ContinuationStipulation`, `LineageLink` and
   * `ReversionKind`, all created by migration 12. They were not deleted from the file: they are
   * equality pairings in {@link MUST_MATCH} now, which is a strictly stronger assertion than "absent".
   * Do not re-add them here.
   */
  it.each([
    ['DisbursementSchedule', DISBURSEMENT_SCHEDULES] as const,
    ['MaintenanceRuleKind', MAINTENANCE_RULE_KINDS] as const,
  ])('%s has no Prisma enum yet — add the pairing above when it gains one', (name, engine) => {
    expect(engine.length).toBeGreaterThan(0);
    expect(
      prismaEnum(name),
      `schema.prisma now declares enum ${name}. Move it into MUST_MATCH so the two spellings are ` +
        `compared, rather than leaving the engine and the database free to disagree.`,
    ).toBeNull();
  });

  /**
   * The negative control for the block above, and it is not decoration.
   *
   * Both remaining rows assert `prismaEnum(name) === null`, and `prismaEnum` returns `null` for a name
   * that is absent **or misspelled**. So if the parser or the schema path ever broke, both rows would
   * pass — and so would the two rows that were removed in S4, which is precisely how "we tidied the
   * pins away" would look green. The three enums migration 12 created are the control: the same parser,
   * against the same file, must FIND them.
   */
  it('…and the probe can still find an enum that IS there (control for the two pins above)', () => {
    expect(prismaEnum('ContinuationStipulation')).not.toBeNull();
    expect(prismaEnum('LineageLink')).not.toBeNull();
    expect(prismaEnum('ReversionKind')).not.toBeNull();
  });

  /**
   * ⚠ **INVERTED IN S4/E3 — was `does not claim a Beneficiary.parentId / lineage column exists either`.**
   *
   * The lineage EDGE is not an enum, so the enum checks cannot see it. Before migration 12 this test
   * pinned `parentId` and `lineageLink` as ABSENT, because `Beneficiary` carried only `branch`,
   * `relationshipAr` and `tabaqa Int?` and had no self-relation — which is what made per-capita lineage
   * eligibility structurally inexpressible in the model. Migration 12 added the edge, so the assertion
   * is inverted rather than deleted: the same three fields are now asserted PRESENT, and the vital
   * status the frontier rule reads (`active`) is asserted with them, because ADR-0009's whole
   * entitlement model is unrunnable from a row without all three.
   *
   * **The positive controls are kept**, even though every probe below is now a presence probe. They are
   * doing different work in each direction: as absence controls they proved the probe could match at
   * all; as presence controls they prove the probe is reading THIS model's body and not, say, an empty
   * string from a regex that stopped matching `model Beneficiary`. Keep them.
   */
  it('pairs the lineage EDGE: Beneficiary.parentId / lineageLink / active are PRESENT (migration 12)', () => {
    const beneficiaryModel = /\bmodel\s+Beneficiary\s*\{([\s\S]*?)\n\}/.exec(SCHEMA);
    expect(beneficiaryModel, 'model Beneficiary is not in schema.prisma').not.toBeNull();
    const body = beneficiaryModel?.[1] ?? '';
    expect(body.length).toBeGreaterThan(100);
    // POSITIVE CONTROL, retained from the absence era — see the doc comment. `tabaqa` and `branch`
    // pre-date S4 and must still be found, or the model body being probed is not the right one.
    for (const present of ['tabaqa', 'branch']) {
      expect(
        new RegExp(String.raw`^\s*${present}\b`, 'm').test(body),
        `the field probe cannot find Beneficiary.${present}, which does exist — so the assertions ` +
          `below prove nothing. Fix the probe, not the expectation.`,
      ).toBe(true);
    }
    for (const field of ['parentId', 'lineageLink', 'active']) {
      expect(
        new RegExp(String.raw`^\s*${field}\b`, 'm').test(body),
        `model Beneficiary no longer declares ${field}. Migration 12 landed the lineage edge and the ` +
          `vital status the LIVING-FRONTIER rule reads; removing either makes ADR-0009's entitlement ` +
          `model inexpressible from a row again. This is a REGRESSION, not a pin to update.`,
      ).toBe(true);
    }
    // ⚠ NO `@default` ON THE VITAL STATUS. §08 defaults `active` to true and the engine deliberately
    // refuses to: a defaulted `active` is a defaulted VITAL STATUS, and it is the sole input to the
    // ORDERED extinction test and one of three inputs to R7-d's continuing-line predicate. Asserted
    // here because it is the one property of these columns that a later "convenience" edit would take.
    const activeLine = /^\s*active\b.*$/m.exec(body)?.[0] ?? '';
    expect(activeLine).not.toBe('');
    expect(
      activeLine,
      'Beneficiary.active must not carry an @default. A defaulted vital status is a defaulted answer ' +
        'to "is this person alive?", and it decides who the living frontier pays.',
    ).not.toContain('@default');
    for (const field of ['parentId', 'lineageLink']) {
      const line = new RegExp(String.raw`^\s*${field}\b.*$`, 'm').exec(body)?.[0] ?? '';
      expect(line).not.toBe('');
      expect(
        line,
        `Beneficiary.${field} must not carry an @default — a defaulted edge is a defaulted family tree.`,
      ).not.toContain('@default');
    }
  });

  /**
   * ⚠ **INVERTED IN S4/E3 — was `does not claim a Waqf.reversion column exists either (R7)`.**
   *
   * **R7** · the deed's مآل clause is **waqf-level** by design — مآل الوقف is what the *deed* says about
   * the endowment's destination, exactly like `waqfType` and `entitlementOrder`. Before migration 12
   * `model Waqf` had nowhere to record it and there was no `ReversionKind` enum, so a real run could
   * only be fed the clause by a caller holding it outside the database. Migration 12 landed
   * `reversionKind`, `reversionClauseCaptured`, the dual `reversionRecordedAt`/`…Hijri` pair and the
   * `waqf_reversion_taker` join table, so the assertion is inverted to PRESENCE.
   *
   * **THE REJECTED SPELLINGS ARE STILL PINNED ABSENT, and that half is the point of the inversion.**
   * One fact keeps one spelling: an `ultimateTakerIds` array column or a `maalAlWaqf` blob would be a
   * SECOND way to say where the endowment goes, and two sides that can disagree about a founder's
   * condition is the defect class this whole file exists for. R7 records four reasons for the join
   * table; the strongest is that a clause naming ids gives the engine two sides that must agree, while
   * a column of ids on the waqf has one trusted side — which is how S3-D1 shipped.
   *
   * ⚠ **The positive control is not optional**, in either direction — see the `Beneficiary` probe.
   */
  it('pairs R7’s مآل clause: Waqf.reversion* PRESENT, the rejected spellings still ABSENT', () => {
    const waqfModel = /\bmodel\s+Waqf\s*\{([\s\S]*?)\n\}/.exec(SCHEMA);
    expect(waqfModel, 'model Waqf is not in schema.prisma').not.toBeNull();
    const body = waqfModel?.[1] ?? '';
    expect(body.length).toBeGreaterThan(100);

    // POSITIVE CONTROL — these fields pre-date S4, so the probe must find them. If it cannot, every
    // assertion below is meaningless. Fix the probe, not the expectation.
    // ⚠ Note the spellings: `Waqf` names them `type` and `entitlementOrder`, NOT `waqfType` — which
    // is itself a small instance of why this file exists (the engine's `waqfType` and the column's
    // `type` are one fact under two names, joined by a mapping nobody tests).
    for (const present of ['type', 'classification', 'shartAlWaqif', 'entitlementOrder']) {
      expect(
        new RegExp(String.raw`^\s*${present}\b`, 'm').test(body),
        `the field probe cannot find Waqf.${present}, which does exist — so the assertions below ` +
          `prove nothing.`,
      ).toBe(true);
    }

    // ── PRESENT: the clause as migration 12 records it, plus the waqf-level continuation term. ──
    for (const field of [
      'reversionKind',
      'reversionClauseCaptured',
      'reversionRecordedAt',
      'reversionRecordedAtHijri',
      'continuationStipulation',
    ]) {
      expect(
        new RegExp(String.raw`^\s*${field}\b`, 'm').test(body),
        `model Waqf no longer declares ${field}. Migration 12 landed R7's مآل clause and ADR-0009's ` +
          `continuation term as write-once deed columns; losing one is a REGRESSION, not a pin to ` +
          `update — the engine would be back to being fed a founder's condition from outside the ` +
          `database.`,
      ).toBe(true);
    }

    // ── NO DEFAULTS. Binding rule 6: a defaulted reversion is a defaulted answer to "where does this
    //    endowment go when the family ends?", and a defaulted continuation term is code choosing which
    //    lines a founder continued. `reversionClauseCaptured` is REQUIRED and also carries no default,
    //    so every insert has to state whether anyone has read the clause at all.
    for (const field of [
      'continuationStipulation',
      'reversionKind',
      'reversionClauseCaptured',
      'reversionRecordedAt',
      'reversionRecordedAtHijri',
    ]) {
      const line = new RegExp(String.raw`^\s*${field}\b.*$`, 'm').exec(body)?.[0] ?? '';
      expect(line).not.toBe('');
      expect(
        line,
        `Waqf.${field} must not carry an @default (CLAUDE.md binding rule 6). Absent must keep ` +
          `HALTING at the engine, not resolve to a value the database invented.`,
      ).not.toContain('@default');
    }

    // ── STILL ABSENT: the spellings R7 rejected. Naming several is the point — a column called
    //    `maalAlWaqf` would satisfy a probe that only looked for `reversionKind`.
    for (const field of [
      'reversion',
      'reversionUltimateTakerIds',
      'ultimateTakerIds',
      'maalAlWaqf',
    ]) {
      expect(
        new RegExp(String.raw`^\s*${field}\b`, 'm').test(body),
        `model Waqf now declares ${field}, a SECOND spelling of مآل الوقف. R7 records the takers in ` +
          `the waqf_reversion_taker join table precisely so the clause has two sides that must agree; ` +
          `a list of ids on the waqf row has one trusted side, which is how S3-D1 shipped. Remove the ` +
          `column, or re-argue R7's four reasons in an ADR — not in a schema edit.`,
      ).toBe(false);
    }

    // …and the join table IS where the ids live, so the absence above is a redirection rather than a
    // gap. Read from the whole schema, not the Waqf body: it is its own model.
    expect(/\bmodel\s+WaqfReversionTaker\s*\{/.test(SCHEMA)).toBe(true);
  });

  /**
   * ⚠ **THE PAYOFF OF NOT MINTING A `BeneficiaryKind`, asserted as a number — and DISCHARGED in S4.**
   *
   * R7's ultimate taker could have been a per-beneficiary marker — an `ultimateTaker: boolean` or a
   * fourth `BENEFICIARY_KINDS` member. Either would have moved `BENEFICIARY_KINDS` out of the
   * `MUST_MATCH` pairings into `PENDING_MIGRATION` and owed E3/E4 a **second** migration, to split one
   * domain entity in two along a line the DEED draws rather than the register.
   *
   * The claim was "no second migration is owed". S4/E3 is where it was paid: migration 12 carried the
   * **whole** declared delta and `BeneficiaryKind` was not touched. So the numbers move — 10 → 14
   * equalities, 1 → 0 declared deltas — while the substance of this test does not: `BENEFICIARY_KINDS`
   * is still an equality pairing, still three members, and still not a declared gap.
   */
  it('R7 · MUST_MATCH is 14 and PENDING_MIGRATION 0 — and no SECOND migration was owed', () => {
    expect(MUST_MATCH).toHaveLength(14);
    expect(PENDING_MIGRATION).toHaveLength(0);
    expect(MUST_MATCH.map(([label]) => label)).toContain('BENEFICIARY_KINDS');
    expect(PENDING_MIGRATION.map(([label]) => label)).not.toContain('BENEFICIARY_KINDS');
    expect(BENEFICIARY_KINDS).toHaveLength(3);
    // The register never learned about the deed's مآل: the taker is named at WAQF level, so
    // `BeneficiaryKind` gained no member and needs no migration of its own.
    expect(new Set(prismaEnum('BeneficiaryKind') ?? [])).toEqual(new Set(BENEFICIARY_KINDS));
  });

  /**
   * `WaqfType` still contains `JOINT` **on both sides** — the engine refuses the VALUE, it does not
   * narrow the VOCABULARY (ADR-0009 decision 3, register item #11).
   *
   * Asserted here, in the file S4 edited, because S4 is the migration that could most plausibly have
   * "tidied" it: the sprint that adds `LINEAGE_CONTINUATION` and creates three enums is exactly when
   * someone would delete a member the engine refuses anyway. Removing `JOINT` is a migration owed to a
   * later epic AND a reconciliation with `awqaf-law.md` Art. 4 and `glossary.md`'s الوقف المشترك — a
   * conversation with counsel, not a code change (CLAUDE.md binding rule 4).
   */
  it('keeps JOINT in WaqfType on BOTH sides — the engine refuses the value, not the vocabulary', () => {
    expect(WAQF_TYPES as readonly string[]).toContain('JOINT');
    expect(prismaEnum('WaqfType')).toContain('JOINT');
  });
});
