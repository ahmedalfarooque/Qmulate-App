/**
 * S4/E3 · THE API SURFACE, TESTED AGAINST THE OTHER SIDE OF EVERY FACT IT RESTATES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, IN ONE SENTENCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api` cannot import the generated Prisma client (the UNIT suite must run with no database
 * and no `prisma generate`), so a handful of vocabularies are SPELLED here — `ReservedMatterKind`,
 * `WaqfClassification`, `ContinuationStipulation`, `LineageLink`, `ReversionKind`, and `AssetStatus`.
 * Every one of those is a second copy of a fact that lives somewhere else, and this repo's recorded
 * failure mode is exactly that: **two sides that are supposed to agree with nothing comparing them.**
 *
 * So each copy is compared, HERE, against the artefact a developer actually edits:
 *  · `schema.prisma`, read as TEXT — the same discipline `packages/auth/test/roles.test.ts` uses to
 *    parse `enum Role`. A text read cannot be satisfied by a stale build artefact or by a re-declared
 *    local copy;
 *  · the SQL of the **NEWEST migration that defines** `qmulate_asset_identity_guard()`, found by
 *    scanning the migrations directory (see {@link latestMigrationDefining}), for the guard's
 *    RESERVED/ORDINARY partition of `AssetStatus` and its subject grammar. **That one is the most
 *    load-bearing assertion in the file:** if `ACT_TO_ASSET_STATUS` ever names a value the guard does
 *    not gate, the API would perform a corpus-asset DISPOSAL that the database never treated as a
 *    reserved matter at all — no refusal, no 42501, nothing in the trail saying an approval was
 *    needed. The runtime self-check in `routers/reservedMatter.ts` catches one direction (a status
 *    the guard omits); this catches the other (the guard's list changing under us).
 *
 * ⚠ THIS FILE HAS ALREADY BEEN VACUOUSLY GREEN ONCE, AND THE FIX IS THE SCAN. The path used to be
 * pinned to migration 12; migration 13 replaced the function body and the suite went on reporting
 * 27/27 against a definition that existed in no database. The scan makes staleness unrepresentable,
 * and `test/asset-status-vocabulary.integration.test.ts` closes the remaining gap by reading the LIVE
 * `pg_proc.prosrc` — a source file can still disagree with what was actually applied.
 *
 * NO DATABASE. Everything here is a pure read of committed source text plus pure functions.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SHART_REFUSALS } from '@qmulate/domain/distribution';

import {
  ACT_TO_ASSET_STATUS,
  ACT_TO_RESERVED_MATTER_KIND,
  ASSET_RESERVED_ACTS,
  ASSET_STATUSES,
  DATABASE_GATED_ASSET_STATUSES,
  MARK_RESERVED_HOLDER_ROLES,
  MARK_RESERVED_PERMISSION,
  MINT_APPROVAL_PERMISSION,
  ORDINARY_ASSET_STATUSES,
  RESERVED_ASSET_STATUSES,
  RESERVED_MATTER_KINDS,
  assetStatusSubjectId,
  chainIncompleteSteps,
  chainState,
} from '../src/routers/reservedMatter.js';
import { ROLE_KEYS, ROLE_PRESETS, hasPermission } from '../src/permissions.js';
import { deedTermSubjectId } from '../src/routers/endowment.js';
import {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  DOMAIN_ERROR_CODE_TO_API,
  DOMAIN_ERROR_CODE_TO_TRPC_STATUS,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  isDatabaseGuardRefusal,
  postgresSqlState,
} from '../src/errors.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Reading the other side
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `packages/api/test/` → the repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const SCHEMA_PATH = `${REPO_ROOT}packages/database/prisma/schema.prisma`;
const MIGRATIONS_DIR = `${REPO_ROOT}packages/database/prisma/migrations`;
const DOMAIN_ERRORS_PATH = `${REPO_ROOT}packages/domain/src/errors.ts`;

function read(path: string): string {
  const text = readFileSync(path, 'utf8');
  if (text.trim() === '') {
    throw new Error(
      `${path} is empty. Fix this reader rather than deleting the assertion: an empty read would make ` +
        `every comparison below pass over nothing, which is the failure mode these tests exist to stop.`,
    );
  }
  return text;
}

/**
 * The text of the LATEST migration that defines `functionName`, plus the directory it came from.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ WHY THIS IS A SCAN AND NOT A CONSTANT — THIS FILE'S OWN RECORDED FAILURE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It used to be `const MIGRATION_12_PATH = '…00000000000012_e3_lineage_reversion_deed_terms…'`.
 * Migration 13 then replaced `qmulate_asset_identity_guard()`'s body wholesale — new signature for
 * the gated set, a native enum instead of twelve Latin spellings — and migration 12's FILE TEXT was
 * of course untouched, because a migration is immutable once shipped. So this suite went on
 * comparing the API against a function definition that **no longer existed in any database**, and
 * reported 27/27 green while doing it. That is ADR-0008 §2.4's failure mode exactly: a claim read
 * rather than measured.
 *
 * The scan removes the class of bug rather than the instance. `CREATE OR REPLACE FUNCTION` means the
 * authority is the LAST migration that defines the function, in lexical order — which is also
 * apply order, since the directory names are zero-padded and Prisma applies them sorted. And
 * `test/asset-status-vocabulary.integration.test.ts` reads the LIVE `pg_proc.prosrc`, which cannot be
 * stale at all; this one is the layer that still works with no database.
 */
function latestMigrationDefining(functionName: string): { name: string; sql: string } {
  const needle = `CREATE OR REPLACE FUNCTION ${functionName}`;
  const directories = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (directories.length === 0) {
    throw new Error(
      `${MIGRATIONS_DIR} holds no migration directories. Fix this reader rather than deleting the ` +
        `assertion — an empty scan would make every comparison below pass over nothing.`,
    );
  }

  for (const name of [...directories].reverse()) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${name}/migration.sql`, 'utf8');
    if (sql.includes(needle)) return { name, sql };
  }

  throw new Error(
    `no migration under ${MIGRATIONS_DIR} contains "${needle}". Either the function was renamed or ` +
      `it is now created with a different DDL spelling. FIX THIS PARSER — a deleted assertion here ` +
      `means the API could move an asset to a status the guard never gates, with no refusal anywhere.`,
  );
}

/**
 * Extracts `enum Name { A B C }`'s members from `schema.prisma`.
 *
 * Doc comments (`///`) are stripped BEFORE the members are matched, because every enum in that file
 * documents its members in prose that quotes code and Arabic. The member pattern is deliberately
 * narrow — an upper-case identifier on its own — so a stray word in a comment could not be mistaken
 * for a member even if one survived.
 */
function prismaEnumMembers(schema: string, name: string): string[] {
  const declaration = `enum ${name} {`;
  const start = schema.indexOf(declaration);
  if (start === -1) {
    throw new Error(
      `could not find "${declaration}" in schema.prisma — the enum was renamed or reformatted. Fix ` +
        `this parser rather than deleting the assertion: it is the only thing keeping this package's ` +
        `hand-spelled copy of the vocabulary in step with the datamodel.`,
    );
  }
  const end = schema.indexOf('}', start);
  if (end === -1) throw new Error(`found "${declaration}" but no closing brace`);

  return schema
    .slice(start + declaration.length, end)
    .replaceAll(/\/\/[^\n]*/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

/** Extracts the `SCREAMING_SNAKE` literals of an `export const NAME = [ … ] as const;` array. */
function tsCodeList(source: string, constName: string): string[] {
  const declaration = `export const ${constName} = [`;
  const start = source.indexOf(declaration);
  if (start === -1) {
    throw new Error(
      `could not find "${declaration}" — fix this parser, do not delete the assertion`,
    );
  }
  const end = source.indexOf('] as const;', start);
  if (end === -1) throw new Error(`found "${declaration}" but no closing "] as const;"`);
  const body = source
    .slice(start + declaration.length, end)
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((match) => match[1] as string);
}

/**
 * A `<name> "AssetStatus"[] := ARRAY[ … ]` declaration from `qmulate_asset_identity_guard()`.
 *
 * Since migration 13 the guard partitions the CLOSED `"AssetStatus"` type into two arrays —
 * `reserved_statuses` and `ordinary_statuses` — and RAISES on a member in neither (ADR-0004). The
 * old `reserved_acts text[]` array of twelve lower-cased Latin spellings is gone, along with the
 * `lower(btrim(replace(…)))` normalisation that made it necessary.
 */
function guardStatusArray(migration: string, arrayName: string): string[] {
  const declaration = `${arrayName} "AssetStatus"[] := ARRAY[`;
  const start = migration.indexOf(declaration);
  if (start === -1) {
    throw new Error(
      `could not find "${declaration}" in the migration that defines qmulate_asset_identity_guard(). ` +
        `That function's RESERVED set is what makes a corpus-asset disposal a reserved matter at the ` +
        `DATABASE; if this parser breaks, FIX IT — a deleted assertion here means the API could move ` +
        `an asset to a status the guard never gates, with no refusal anywhere.`,
    );
  }
  const end = migration.indexOf(']::"AssetStatus"[]', start);
  if (end === -1) throw new Error(`found ${arrayName} but no closing ']::"AssetStatus"[]'`);
  return [...migration.slice(start + declaration.length, end).matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map(
    (match) => match[1] as string,
  );
}

const SCHEMA = read(SCHEMA_PATH);
const ASSET_GUARD = latestMigrationDefining('qmulate_asset_identity_guard');
const SHART_GUARD = latestMigrationDefining('qmulate_shart_guard');
const DOMAIN_ERRORS = read(DOMAIN_ERRORS_PATH);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Every vocabulary this package spells matches the datamodel, member for member
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the vocabularies packages/api spells match schema.prisma', () => {
  it('the parsers are not vacuous', () => {
    // A parser that matched nothing would make every comparison below pass over two empty arrays.
    // ⊕ S9-4a: FOUR, not five — `DIRECT_UTILIZATION` left the enum (owner ruling, fifth batch: it is
    // an orthogonal usage attribute, not a size). The number is pinned rather than derived precisely
    // so a narrowing has to be acknowledged here instead of quietly making the vacuity check weaker.
    expect(prismaEnumMembers(SCHEMA, 'WaqfClassification')).toHaveLength(4);
    expect(guardStatusArray(ASSET_GUARD.sql, 'reserved_statuses')).toHaveLength(2);
    expect(guardStatusArray(ASSET_GUARD.sql, 'ordinary_statuses')).toHaveLength(4);
  });

  it('the guard is read from the NEWEST migration that defines it, not a pinned one', () => {
    // ⚠ THE REGRESSION THIS FILE SHIPPED. A hardcoded `MIGRATION_12_PATH` kept this suite green at
    // 27/27 while migration 13 had already replaced the function body — the API was being compared
    // against a definition present in no database. The assertion is therefore about the SCAN, not
    // about a version number: whatever the newest defining migration is, it is the one read, and it
    // is the one whose text must carry the enum-typed arrays.
    const directories = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const later = directories.filter((name) => name > ASSET_GUARD.name);
    for (const name of later) {
      expect(
        read(`${MIGRATIONS_DIR}/${name}/migration.sql`),
        `${name} sorts after ${ASSET_GUARD.name} and also defines qmulate_asset_identity_guard() — ` +
          `the scan picked the wrong one`,
      ).not.toContain('CREATE OR REPLACE FUNCTION qmulate_asset_identity_guard');
    }
    // And the definition actually read is the enum-typed one, not the twelve-spelling text array.
    // ⚠ The DECLARATION, not the phrase: migration 13's own header names `reserved_acts text[]` in
    // prose while recording that it is gone, and a substring match on the phrase would fail on the
    // comment that documents the removal.
    expect(ASSET_GUARD.sql).not.toMatch(/reserved_acts\s+text\[\]\s*:=/);
    expect(ASSET_GUARD.sql).toContain('reserved_statuses "AssetStatus"[] :=');
  });

  it('AssetStatus — ASSET_STATUSES, member for member and in order (D-A)', () => {
    // The closed vocabulary the product owner named on 2026-08-16. `schema.prisma` is the artefact a
    // developer edits; this package spells the members because its unit suite has no generated client.
    expect([...ASSET_STATUSES]).toEqual(prismaEnumMembers(SCHEMA, 'AssetStatus'));
    // ⚠ The four old free-text spellings are UNREPRESENTABLE now, and that is intended (D-A). Pinned
    // so a later widening is a deliberate act with the owner's name on it, not a quiet re-addition.
    for (const gone of ['SOLD', 'PLEDGED', 'MORTGAGED', 'LONG_LEASED', 'UNDER_MAINTENANCE']) {
      expect(prismaEnumMembers(SCHEMA, 'AssetStatus')).not.toContain(gone);
    }
  });

  it('AssetStatus is partitioned EXHAUSTIVELY into the guard’s two halves', () => {
    // ADR-0004: a member in neither set makes the guard RAISE. The router asserts this at import; the
    // assertion here is that the router's partition is the SQL guard's partition, not merely a
    // self-consistent one of its own.
    expect([...RESERVED_ASSET_STATUSES].sort()).toEqual(
      guardStatusArray(ASSET_GUARD.sql, 'reserved_statuses').sort(),
    );
    expect([...ORDINARY_ASSET_STATUSES].sort()).toEqual(
      guardStatusArray(ASSET_GUARD.sql, 'ordinary_statuses').sort(),
    );
    expect(
      [...RESERVED_ASSET_STATUSES, ...ORDINARY_ASSET_STATUSES].sort(),
      'every AssetStatus member must be in exactly one half',
    ).toEqual([...ASSET_STATUSES].sort());
  });

  it('ReservedMatterKind — RESERVED_MATTER_KINDS, member for member and in order', () => {
    expect([...RESERVED_MATTER_KINDS]).toEqual(prismaEnumMembers(SCHEMA, 'ReservedMatterKind'));
  });

  it('WaqfClassification — classification.ts accepts EXACTLY the schema minus NOT_CLASSIFIED', () => {
    // `waqfClassificationInput` is a zod enum inside the router, so the comparison is against the
    // literal list the file declares. Read as TEXT for the same reason the i18n suite reads its code
    // lists as text: the artefact under review is the source a developer edits.
    //
    // ⊕ S8-Q4 (owner, 2026-08-23): the input is DELIBERATELY ONE MEMBER NARROWER than the schema,
    // and the delta is pinned BY NAME rather than by count. `reclassify.to` may target only a REAL
    // class — `NOT_CLASSIFIED` is the onboarding state with one exit and no entrance by transition
    // (migration 34 refuses the same move at the database). A sixth schema member that is not
    // deliberately added to the router list turns this red, which is the point.
    const routerSource = read(`${REPO_ROOT}packages/api/src/routers/classification.ts`);
    const declared = [
      ...routerSource
        .slice(routerSource.indexOf('const waqfClassificationInput = z.enum(['))
        .slice(0, 200)
        .matchAll(/'([A-Z][A-Z0-9_]*)'/g),
    ].map((match) => match[1] as string);
    const schemaMembers = prismaEnumMembers(SCHEMA, 'WaqfClassification');
    expect(schemaMembers).toContain('NOT_CLASSIFIED');
    expect(declared).not.toContain('NOT_CLASSIFIED');
    expect(declared).toEqual(schemaMembers.filter((member) => member !== 'NOT_CLASSIFIED'));
  });

  it('GovernmentPlatform — filing.ts accepts the schema member-for-member', () => {
    // ⊕ S8-Q6. The six authoritative platforms (§07 §8) — every one may carry a manual status, so
    // the input is the WHOLE enum, unlike the two deliberately-narrowed inputs on this surface.
    const routerSource = read(`${REPO_ROOT}packages/api/src/routers/filing.ts`);
    const declared = [
      ...routerSource
        .slice(routerSource.indexOf('const governmentPlatformInput = z.enum(['))
        .slice(0, 300)
        .matchAll(/'([A-Z][A-Z0-9_]*)'/g),
    ].map((match) => match[1] as string);
    expect(declared).toEqual(prismaEnumMembers(SCHEMA, 'GovernmentPlatform'));
    expect(declared).toHaveLength(6);
  });

  it('FilingStatus — filing.setStatus accepts EXACTLY the schema minus SUBMITTED', () => {
    // ⊕ S8-Q6 (owner, 2026-08-23): the omission IS the transport half of the gate — `SUBMITTED`
    // travels only through `markSubmitted`, which demands the APPROVED maker≠checker GOVT_FILING
    // approval (G-3). Pinned BY NAME, like `NOT_CLASSIFIED` above: a seventh schema status not
    // deliberately added to the manual list turns this red.
    const routerSource = read(`${REPO_ROOT}packages/api/src/routers/filing.ts`);
    const declared = [
      ...routerSource
        .slice(routerSource.indexOf('const manualFilingStatusInput = z.enum(['))
        .slice(0, 300)
        .matchAll(/'([A-Z][A-Z0-9_]*)'/g),
    ].map((match) => match[1] as string);
    const schemaMembers = prismaEnumMembers(SCHEMA, 'FilingStatus');
    expect(schemaMembers).toContain('SUBMITTED');
    expect(declared).not.toContain('SUBMITTED');
    expect(declared).toEqual(schemaMembers.filter((member) => member !== 'SUBMITTED'));
  });

  it('ContinuationStipulation — a CLOSED two-value deed term, no third member', () => {
    const members = prismaEnumMembers(SCHEMA, 'ContinuationStipulation');
    // ⚠ THE COUNT IS PART OF THE RULE (ADR-0009 R2), not a coincidence. "Unknown" is the ABSENCE of a
    // value, never a value — a third member would be code offering a default answer to which of the
    // waqif's lines continue (Binding rule 6).
    expect(members).toEqual(['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN']);
    const routerSource = read(`${REPO_ROOT}packages/api/src/routers/endowment.ts`);
    expect(routerSource).toContain("z.enum(['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'])");
  });

  it('ReversionKind — one member today, and the discriminator exists BECAUSE it is one', () => {
    // A deed may revert to another waqf, to the Authority, or to the waqif's nearest relatives; the
    // engine implements only the reading the owner gave (R7), and any other recorded مآل must halt BY
    // NAME (`REVERSION_KIND_UNRECOGNISED`) rather than be coerced into this one.
    expect(prismaEnumMembers(SCHEMA, 'ReversionKind')).toEqual(['CHARITABLE_ULTIMATE_TAKER']);
    const routerSource = read(`${REPO_ROOT}packages/api/src/routers/endowment.ts`);
    expect(routerSource).toContain("z.enum(['CHARITABLE_ULTIMATE_TAKER'])");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · THE HEADLINE — the API's asset acts and the SQL guard's gated set agree
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BR-306 · the API cannot move an asset to a status the database does not gate', () => {
  it("DATABASE_GATED_ASSET_STATUSES equals qmulate_asset_identity_guard()'s own array", () => {
    // Both directions, deliberately. A status the guard gained and this list did not is a lost
    // opportunity; a status this list claims and the guard does NOT gate is a disposal with no
    // reserved-matter check at the one layer that survives raw SQL.
    expect([...DATABASE_GATED_ASSET_STATUSES].sort()).toEqual(
      guardStatusArray(ASSET_GUARD.sql, 'reserved_statuses').sort(),
    );
  });

  it("every act's target status is gated by the guard — or the act has NO target at all (D-A)", () => {
    // ⚠ THIS ASSERTION MOVED RATHER THAN WEAKENED. Before D-A closed the vocabulary, all four acts
    // had a target status and all four had to be gated. Three of them now have NO representable end
    // state, and the correct claim is a disjunction: an act either lands on a status the guard treats
    // as reserved, or it cannot be performed at all. What must NEVER hold is the third case — a
    // target the guard does not gate.
    const gated = new Set(guardStatusArray(ASSET_GUARD.sql, 'reserved_statuses'));
    const unrepresentable: string[] = [];
    for (const act of ASSET_RESERVED_ACTS) {
      const status = ACT_TO_ASSET_STATUS[act];
      if (status === null) {
        unrepresentable.push(act);
        continue;
      }
      expect(
        gated.has(status),
        `act ${act} moves status to "${status}", which the SQL guard does not treat as reserved — ` +
          `the API would perform a corpus-asset disposal the database never treated as a reserved ` +
          `matter`,
      ).toBe(true);
    }
    // Named exactly, so re-adding a target for one of the three is a deliberate edit here too.
    expect(unrepresentable.sort()).toEqual(['DISPOSAL', 'LONG_LEASE', 'PLEDGE']);
    expect(ACT_TO_ASSET_STATUS.SUBSTITUTION_ISTIBDAL).toBe('SUBSTITUTED_ISTIBDAL');
  });

  it('an act with no representable end state is REFUSED BY NAME, never remapped', () => {
    // ADR-0004: refuse, do not remap. Choosing the nearest surviving status would execute an istibdal
    // against an approval that says DISPOSAL. Asserted on the SOURCE because the refusal happens in
    // two places (mint and execute) and both must exist — an approval minted before migration 13 is
    // still sitting in `approval_request`, APPROVED and otherwise spendable.
    const routerSource = read(`${REPO_ROOT}packages/api/src/routers/reservedMatter.ts`);
    const refusals = [...routerSource.matchAll(/throw assetEndStateUnrepresentable\(/g)];
    expect(
      refusals.length,
      'both requestReservedAct and executeReservedAct must refuse an unrepresentable end state',
    ).toBe(2);
    expect(routerSource).toContain('ASSET_END_STATE_UNREPRESENTABLE');
    // And no act is quietly pointed at the surviving one.
    const targets = Object.values(ACT_TO_ASSET_STATUS).filter((value) => value !== null);
    expect(new Set(targets).size, 'two acts sharing one end state is a remap in disguise').toBe(
      targets.length,
    );
  });

  it('every act maps to a real ReservedMatterKind, and the four asset kinds are all used', () => {
    const kinds = new Set<string>(RESERVED_MATTER_KINDS);
    const used = new Set<string>();
    for (const act of ASSET_RESERVED_ACTS) {
      const kind = ACT_TO_RESERVED_MATTER_KIND[act];
      expect(kinds.has(kind), `act ${act} maps to ${kind}, which is not a ReservedMatterKind`).toBe(
        true,
      );
      used.add(kind);
    }
    // No two acts share a kind: `executeReservedAct` COMPARES the kind against the act, and a shared
    // kind would make an approved PLEDGE a valid key for a DISPOSAL of the same asset.
    expect(used.size).toBe(ASSET_RESERVED_ACTS.length);
    expect([...used].sort()).toEqual([
      'ASSET_DISPOSAL',
      'ASSET_LONG_LEASE',
      'ASSET_PLEDGE',
      'ASSET_SUBSTITUTION_ISTIBDAL',
    ]);
  });

  it("the subject grammar is the SQL guard's own string", () => {
    // `qmulate_asset_identity_guard()` builds `'asset:' || OLD."id" || ':status'` and passes it to
    // `qmulate_reserved_matter_defect(approval, waqfId, subject)`. If the API mints an approval with a
    // different subject, `withReservedMatter()` sets a GUC the trigger then rejects — a refusal at the
    // last possible moment, inside a transaction, instead of at the boundary.
    expect(ASSET_GUARD.sql).toContain(`'asset:' || OLD."id" || ':status'`);
    expect(assetStatusSubjectId('asset-005')).toBe('asset:asset-005:status');
  });

  it("the deed-identity subject grammar matches qmulate_shart_guard()'s", () => {
    // The reserved-matter tier for `certificateNumber`/`deedNumber` uses
    // `'waqf:' || OLD."id" || ':' || gated_column`. `endowment.recordDeedTerms` is a DIFFERENT tier
    // (write-once, not GUC-gated), so its subject has no SQL counterpart — it is this layer's grammar
    // and is pinned so a later change is deliberate.
    expect(SHART_GUARD.sql).toContain(`'waqf:' || OLD."id" || ':' || gated_column`);
    expect(deedTermSubjectId('waqf-001')).toBe('waqf:waqf-001:deedTerms');
  });

  it("⚠ THE SUBJECT-BLIND OVERLOAD IS GONE — the brief's claimed gap was closed in migration 4", () => {
    // The E3 brief and `src/routers/settings.ts`'s header both say `qmulate_reserved_matter_defect`
    // "never compares subjectId" and that "an approved istibdal is already a valid key for a deedNumber
    // change". MEASURED: false since migration 4, which DROPPED the two-argument overload and made the
    // three-argument form compare the subject. Asserted here so the record cannot drift back.
    const migration4 = read(
      `${REPO_ROOT}packages/database/prisma/migrations/00000000000004_e2_guard_gaps/migration.sql`,
    );
    expect(migration4).toContain(
      'DROP FUNCTION IF EXISTS qmulate_reserved_matter_defect(text, text)',
    );
    expect(migration4).toMatch(/p_subject_id/);
    // And migration 12's guards call the THREE-argument form, never a subject-blind one.
    expect(ASSET_GUARD.sql).toMatch(/qmulate_reserved_matter_defect\(\s*\n?\s*approval,/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2b · D-D · counsel does NOT mark matters reserved, and this package no longer says otherwise
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('V-E3-M3 / D-D · who may mark a matter reserved', () => {
  it('counsel holds NEITHER verb markReserved needs — the preset and the mint path', () => {
    // Asked directly on 2026-08-16, the product owner answered "no". Both halves are asserted,
    // because removing the preset verb without noticing the second requirement is how "fixed" and
    // "still broken" look identical: `markReserved` demands `legal:reserved_matter:write` at the rung
    // AND `mintApprovalRequest` needs `approval:request:initiate`.
    expect(hasPermission(ROLE_PRESETS.counsel, MARK_RESERVED_PERMISSION)).toBe(false);
    expect(hasPermission(ROLE_PRESETS.counsel, MINT_APPROVAL_PERMISSION)).toBe(false);
    expect(MARK_RESERVED_HOLDER_ROLES).not.toContain('counsel');
  });

  it('the holder set is DERIVED from ROLE_PRESETS and is not empty', () => {
    // ⚠ NOT A HAND-WRITTEN LIST. A transcribed holder list in a docstring is precisely how the router
    // came to name counsel as a holder after the owner had said no. Recomputed here from the same
    // table the router computes from, so the assertion is that the DERIVATION is right rather than
    // that somebody remembered to edit prose.
    const expected = ROLE_KEYS.filter(
      (role) =>
        hasPermission(ROLE_PRESETS[role], MARK_RESERVED_PERMISSION) &&
        hasPermission(ROLE_PRESETS[role], MINT_APPROVAL_PERMISSION),
    );
    expect([...MARK_RESERVED_HOLDER_ROLES]).toEqual(expected);
    // Not vacuous: if the intersection were empty, "counsel is absent" would be true for the wrong
    // reason and nobody could raise a reserved matter at all.
    expect(MARK_RESERVED_HOLDER_ROLES.length).toBeGreaterThan(0);
  });

  it('no file in packages/api names counsel beside the verb or the procedure it may not reach', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // A SOURCE SCAN, BECAUSE THE DRIFT THAT PRODUCED V-E3-M3 WAS PROSE — "the router names it as a
    // holder". The pattern is deliberately NARROW rather than a general "does this sentence sound
    // permissive" heuristic: two specific co-occurrences, either of which is the stale claim.
    //   · `counsel` on the same line as the verb `legal:reserved_matter:write`;
    //   · `counsel` on the same line as `markReserved`.
    // A line that says counsel does NOT hold it is exempted by an explicit marker, and the marker is
    // a small closed set so the exemption cannot swallow the rule.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const NEGATED = /\bNOT\b|\bno\b|never|absent|D-D|removed|refus/i;
    const offenders: string[] = [];

    for (const relative of [
      'src/routers/reservedMatter.ts',
      'src/routers/endowment.ts',
      'src/routers/classification.ts',
      'src/routers/deed.ts',
      'src/routers/shart.ts',
      'src/routers/navigation.ts',
      'src/routers/settings.ts',
      'src/middleware/segregation.ts',
      'src/errors.ts',
      'src/permissions.ts',
      'src/trpc.ts',
    ]) {
      const source = read(`${REPO_ROOT}packages/api/${relative}`);
      for (const [index, line] of source.split('\n').entries()) {
        // `counselReviewRequired` is the chain STEP — a different fact, and a legitimate one. So is
        // `recordCounselReview` (S12-2): STAFF record the counsel's review against a reference (owner,
        // 2026-09-08 "staff"); the name says which letter arrived, not who holds the verb.
        const text = line.replaceAll(/counselReview\w*/gi, '');
        if (!/counsel/i.test(text)) continue;
        if (!/legal:reserved_matter:write|markReserved/.test(text)) continue;
        if (NEGATED.test(text)) continue;
        offenders.push(`${relative}:${index + 1}  ${line.trim()}`);
      }
    }

    expect(
      offenders,
      `these lines name counsel beside the verb or the procedure the owner said counsel may not ` +
        `reach (D-D, 2026-08-16 — "no"):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The BR-1102 chain is reported HONESTLY
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the reserved-matter chain reads RECORDED FACTS (S12-2 — the S4 skeleton pin is INVERTED, deliberately)', () => {
  // The S4 assertion here read, verbatim: "principal consent is ALWAYS unrecorded — there is no
  // column for it … When E11 adds the column, THIS assertion is what must be inverted — deliberately —
  // rather than the behaviour quietly changing under it." Migration 51 added the columns. Inverted.
  const AT = new Date('2026-01-01T00:00:00.000Z');
  const base = {
    reservedMatterKind: 'ASSET_DISPOSAL',
    counselReviewRequired: true,
    authorityNoticeRequired: true,
    principalConsentRecordedAt: null,
    counselReviewRecordedAt: null,
    authorityNoticeRecordedAt: null,
  };

  it('the schema now carries the three steps as columns', () => {
    for (const column of [
      'principalConsentRecordedAt',
      'principalConsentBy',
      'principalConsentReference',
      'counselReviewRecordedAt',
      'counselReviewBy',
      'counselReviewReference',
      'authorityNoticeRecordedAt',
      'authorityNoticeBy',
    ]) {
      expect(SCHEMA, `${column} is missing from schema.prisma`).toMatch(
        new RegExp(`\\b${column}\\b`),
      );
    }
  });

  it('principal consent is NOT_RECORDED until its instant is recorded, on every kinded matter', () => {
    for (const authorityNoticeRequired of [true, false]) {
      for (const counselReviewRequired of [true, false]) {
        expect(
          chainState({ ...base, counselReviewRequired, authorityNoticeRequired }).principalConsent,
        ).toBe('NOT_RECORDED');
        expect(
          chainState({
            ...base,
            counselReviewRequired,
            authorityNoticeRequired,
            principalConsentRecordedAt: AT,
          }).principalConsent,
        ).toBe('RECORDED');
      }
    }
  });

  it('counsel review is NOT_REQUIRED when not required, NOT_RECORDED until recorded, RECORDED after', () => {
    expect(chainState({ ...base, counselReviewRequired: false }).counselReview).toBe(
      'NOT_REQUIRED',
    );
    expect(chainState(base).counselReview).toBe('NOT_RECORDED');
    expect(chainState({ ...base, counselReviewRecordedAt: AT }).counselReview).toBe('RECORDED');
  });

  it('the Authority notice is RECORDED by its INSTANT, not by the presence of a reference', () => {
    expect(chainState({ ...base, authorityNoticeRequired: false }).authorityNotice).toBe(
      'NOT_REQUIRED',
    );
    expect(chainState(base).authorityNotice).toBe('NOT_RECORDED');
    expect(chainState({ ...base, authorityNoticeRecordedAt: AT }).authorityNotice).toBe('RECORDED');
  });

  it('a KINDLESS reserved-matter row carries no chain (S12 Q8 — surfaced, not decided)', () => {
    expect(chainState({ ...base, reservedMatterKind: null })).toEqual({
      principalConsent: 'NOT_REQUIRED',
      counselReview: 'NOT_REQUIRED',
      authorityNotice: 'NOT_REQUIRED',
    });
  });

  it('chainIncomplete lists exactly the unrecorded-but-required steps, in chain order, as domain codes', () => {
    expect(chainIncompleteSteps(chainState(base))).toEqual([
      'PRINCIPAL_CONSENT',
      'COUNSEL_REVIEW',
      'AUTHORITY_NOTICE',
    ]);
    expect(
      chainIncompleteSteps(
        chainState({ ...base, counselReviewRequired: false, authorityNoticeRequired: false }),
      ),
    ).toEqual(['PRINCIPAL_CONSENT']);
    expect(
      chainIncompleteSteps(
        chainState({
          ...base,
          principalConsentRecordedAt: AT,
          counselReviewRecordedAt: AT,
          authorityNoticeRecordedAt: AT,
        }),
      ),
    ).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Error translation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the E3 domain codes reach the client with the right status AND their own key', () => {
  const declaredDomainCodes = new Set(tsCodeList(DOMAIN_ERRORS, 'DOMAIN_ERROR_CODES'));

  it('the domain code list parsed', () => {
    expect(declaredDomainCodes.size).toBeGreaterThanOrEqual(17);
  });

  it('every code in the status table is a REAL DomainErrorCode', () => {
    // A code that is not in `DOMAIN_ERROR_CODES` could never be thrown, so its row would be a mapping
    // for an error that does not exist — and the real error would fall through to BAD_REQUEST silently.
    for (const code of Object.keys(DOMAIN_ERROR_CODE_TO_TRPC_STATUS)) {
      expect(declaredDomainCodes.has(code), `${code} is not in DOMAIN_ERROR_CODES`).toBe(true);
    }
  });

  it('the three E3 codes are mapped, with the statuses the contract names', () => {
    expect(DOMAIN_ERROR_CODE_TO_TRPC_STATUS['NAZIR_INELIGIBLE']).toBe('BAD_REQUEST');
    // A CONFLICT, not a BAD_REQUEST: the request was well-formed and the STATE of the record refuses
    // it. The answer is a superseding instrument, not a retry with better input (ADR-0006).
    expect(DOMAIN_ERROR_CODE_TO_TRPC_STATUS['DEED_TERM_WRITE_ONCE']).toBe('CONFLICT');
    // A FORBIDDEN, not a NOT_FOUND: the endowment's existence is already disclosed by the grant that
    // got the caller this far, so a precise refusal is better than a misleading one.
    expect(DOMAIN_ERROR_CODE_TO_TRPC_STATUS['RESERVED_MATTER_REQUIRED']).toBe('FORBIDDEN');
  });

  it('none of the three is ALSO in DOMAIN_ERROR_CODE_TO_API — one code, ONE user-facing sentence', () => {
    // A code in that table is rewrapped as an `ApiError`, whose `messageKey` is
    // `errors.access.<API_CODE>` — so the domain's own `errors.domain.<CODE>` wording would be
    // unreachable and two catalogues would carry copy for one fact.
    for (const code of ['NAZIR_INELIGIBLE', 'DEED_TERM_WRITE_ONCE', 'RESERVED_MATTER_REQUIRED']) {
      expect(DOMAIN_ERROR_CODE_TO_API[code], `${code} is in BOTH tables`).toBeUndefined();
    }
  });

  it('S4 minted NO new API_ERROR_CODES — the i18n access catalogue is untouched by this owner', () => {
    // Adding one obliges `errors.access.<CODE>` in BOTH locales, which `packages/i18n`'s suite enforces
    // and which the WEB agent owns. E3's new vocabulary is all `errors.domain.*`, so this owner needed
    // no new access key at all. Pinned so a later "convenience" code is a deliberate, coordinated act.
    expect([...API_ERROR_CODES]).toEqual([
      'UNAUTHENTICATED',
      'TOTP_ENROLMENT_REQUIRED',
      // ⊕ migration 55 · the organisation layer: an unvetted or sidelined account, and a caller
      // whose level lacks an organisation-scope permission. Both locales carry the copy.
      'ACCOUNT_PENDING',
      'ACCOUNT_DISABLED',
      'ORG_PERMISSION_DENIED',
      'TOTP_STEP_UP_REQUIRED',
      'NO_GRANT',
      'PERMISSION_DENIED',
      'SEGREGATION_OF_DUTIES',
      'APPROVAL_STALE',
      'AML_COMPARTMENT_ONLY',
      'SCOPE_REF_MISMATCH',
      'RESERVED_MATTER_CHAIN_INCOMPLETE',
      'GATE_NOT_CLEARED',
      // ⊕ S12-3 · a deliberate, coordinated addition: BR-1101's downstream block has its OWN code
      // (`GATE_NOT_CLEARED` above is the CLASSIFICATION gate and is not overloaded); both locales
      // carry `errors.access.ONBOARDING_GATE_NOT_CLEARED`.
      'ONBOARDING_GATE_NOT_CLEARED',
      // ⊕ S12-3b · UI intake: the birth refused for want of sibling authority, and an identifier
      // refused by the fixture grammar under fixture-only. Both locales carry the copy.
      'ENDOWMENT_INTAKE_NOT_AUTHORISED',
      'FIXTURE_ONLY_IDENTIFIER_REFUSED',
    ]);
    // And the security control that must never be "fixed": no grant is NOT_FOUND, never FORBIDDEN.
    expect(API_ERROR_STATUS.NO_GRANT).toBe('NOT_FOUND');
  });
});

describe("a database guard's refusal is recognised by its SQLSTATE, never by its prose", () => {
  it("reads the SQLSTATE off a raw-query error's meta.code", () => {
    expect(postgresSqlState({ code: 'P2010', meta: { code: '42501', message: 'whatever' } })).toBe(
      '42501',
    );
  });

  it("falls back to the driver's literal SQLSTATE token in the message", () => {
    // A model-delegate trigger raise arrives as a `PrismaClientUnknownRequestError` with no structured
    // field at all. The pattern matches the DRIVER's token only — never a word of the guard's wording,
    // so rewriting a guard's English cannot change how it is classified.
    expect(
      postgresSqlState({
        message: 'Invalid `prisma.waqf.update()`: ERROR: deed term is WRITE-ONCE (SQLSTATE 42501)',
      }),
    ).toBe('42501');
  });

  it('returns null for anything that is not a SQLSTATE, and never guesses', () => {
    expect(postgresSqlState(null)).toBeNull();
    expect(postgresSqlState('42501')).toBeNull();
    expect(postgresSqlState({ message: 'permission denied for table waqf' })).toBeNull();
    expect(postgresSqlState({ meta: { code: 'nope' } })).toBeNull();
  });

  it('isDatabaseGuardRefusal is true for 42501 and false for every other state', () => {
    expect(POSTGRES_INSUFFICIENT_PRIVILEGE).toBe('42501');
    expect(isDatabaseGuardRefusal({ meta: { code: '42501' } })).toBe(true);
    // 23514 is a CHECK violation and 40P01 a deadlock — neither is a guard's refusal, and treating one
    // as such would restate an unrelated failure in the domain's vocabulary.
    expect(isDatabaseGuardRefusal({ meta: { code: '23514' } })).toBe(false);
    expect(isDatabaseGuardRefusal({ meta: { code: '40P01' } })).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · `shart.completeness` reports only discriminators the ENGINE can actually raise
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('shart.completeness maps halting gaps onto REAL SHART_REFUSALS members', () => {
  it('there are still 26 discriminators — S4 changes no engine behaviour', () => {
    // The exit checklist's own clause: S4 adds no SHART_REFUSALS member and removes none. A count is a
    // hand-copied fact, so it is here ONLY as the tripwire for a silent addition, and the mapping
    // assertion below is what actually holds the two sides together.
    expect(SHART_REFUSALS).toHaveLength(26);
  });

  it("the router's mapping is checked at IMPORT, and the check is not vacuous", () => {
    // `routers/shart.ts` throws at module scope if it maps a gap onto a non-member. Importing it here
    // is the assertion; the source read proves the check exists rather than having been deleted.
    const source = read(`${REPO_ROOT}packages/api/src/routers/shart.ts`);
    expect(source).toContain('HALTING_GAP_TO_REFUSAL');
    expect(source).toContain('is not a member of');
    for (const refusal of [
      'CONTINUATION_STIPULATION_UNRECOGNISED',
      'REVERSION_ULTIMATE_TAKER_UNKNOWN',
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    ]) {
      expect(source, `${refusal} is no longer mapped`).toContain(refusal);
      expect(SHART_REFUSALS as readonly string[]).toContain(refusal);
    }
  });

  it('⚠ NO ar/en COPY IS INVENTED for any discriminator (E10/E12 owns it)', () => {
    // Every SHART_REFUSALS member is rendered as an UNTRANSLATED diagnostic code; the one user-facing
    // sentence for a halt is `errors.domain.SHART_INCOMPLETE`. So no api source may contain an
    // i18n key naming a discriminator.
    //
    // ⊕ S7 · THE WHOLE ROUTER DIRECTORY IS SCANNED, not five hand-named files.
    //
    // The hand-list was `['shart.ts','endowment.ts','classification.ts','reservedMatter.ts','deed.ts']`
    // and it did NOT include `distribution.ts` — the one router that actually surfaces the engine's
    // twenty-six discriminators, through `preview`'s non-throwing `{ refused }` shape. MEASURED: the
    // S7 router landed and this assertion did not look at it. That is the V-E3-M5 failure mode exactly
    // (a mechanism that only reaches the files someone remembered to type), so it is fixed the way
    // `packages/i18n/test/code-source-parity.test.ts` fixes it: read the directory, and floor the read
    // so a scan that silently narrows fails instead of passing over almost nothing.
    const routerFiles = readdirSync(`${REPO_ROOT}packages/api/src/routers`)
      .filter((name) => name.endsWith('.ts'))
      .sort();

    expect(
      routerFiles.length,
      'the router directory read returned almost nothing — the scan has been narrowed and a router ' +
        'could now carry an invented discriminator sentence unseen',
    ).toBeGreaterThanOrEqual(9);
    // The two whose omission would matter most: the router that RAISES the discriminators via the
    // shart surface, and the one that RETURNS them to a screen.
    expect(routerFiles).toContain('shart.ts');
    expect(routerFiles).toContain('distribution.ts');

    for (const file of routerFiles) {
      const source = read(`${REPO_ROOT}packages/api/src/routers/${file}`);
      for (const refusal of SHART_REFUSALS) {
        expect(
          source,
          `${file} contains an i18n key for the discriminator ${refusal}. That text is ` +
            `product-approved legal wording a beneficiary may dispute before the Authority; E10/E12 ` +
            `owns it and it must never be invented in a code change.`,
        ).not.toContain(`errors.domain.${refusal}`);
        expect(source).not.toContain(`errors.access.${refusal}`);
      }
    }
  });
});
