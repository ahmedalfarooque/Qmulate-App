/**
 * S8/E7 — the CANONICAL §09 obligation library, in the database.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SEEDING A LIBRARY IS ACTUALLY FOR, AND WHAT THIS FILE THEREFORE ASSERTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Before this stage, `compliance_obligation` held ten rows **derived backwards from fixture task
 * instances** — one obligation per task, `SEED-`-namespaced. A register that can only contain duties
 * somebody already recorded cannot tell a Nazir what they **missed**, which is the one thing a
 * compliance register exists to do. The canonical library is what makes the question askable.
 *
 * Four properties, each of which something downstream depends on and none of which a row count
 * would establish:
 *
 *   PRESENT       every storable template of `packages/domain/src/compliance/catalogue.ts` is a row,
 *                 at the published `libraryVersion` — asserted by CODE, not by count, because a
 *                 count is satisfied by the wrong 36 rows.
 *   FAITHFUL      each seeded row equals its catalogue cell, the Arabic character for character.
 *                 The catalogue is itself a byte-for-byte quote of `unified-framework.md`, verified
 *                 on every run by the domain suite — so this is the last link in a chain from the
 *                 regulation's own Arabic to a database column, and it is the only link a
 *                 *projection* could break.
 *   ALONGSIDE     the ten placeholders are UNTOUCHED and still distinguishable from the row itself.
 *                 S8-Q5 (owner, 2026-08-23) makes a template immutable within a version, so a
 *                 different library is different ROWS at a different version — never the same rows
 *                 rewritten. Migration 31 refuses the rewrite; this proves the seed never tried.
 *   COMPARTMENTED exactly ONE obligation is `AML_RESTRICTED` and it is `GOV-AML-02` — S8-Q1. Both
 *                 halves matter and the second is the one a refusal-only suite would miss.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE SECURITY ASSERTION IN THIS FILE IS "EXACTLY ONE", NOT "AT LEAST ONE"
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The owner ruled *"compartment the row"* — the GOV-AML-02 obligation and its status changes are
 * visible only inside the AML compartment. The failure mode nobody would notice is the **other**
 * direction: a classification applied too widely turns "compartment the row" into "compartment the
 * register", and thirty-five ordinary duties vanish from the compliance board. Nothing errors. The
 * board simply shows less, and a Nazir is told they owe less than they owe.
 *
 * That is this sprint's own lesson, learned twice: **Q2 and Q1 both broke by DENYING THE ENTITLED
 * PARTY** — a compartment invisible to its own members, a Nazir refused by the rung the force filter
 * would have admitted — and a suite made entirely of refusal assertions stays green through it. So
 * every negative below is paired with the positive it must still permit: the non-member is asserted
 * to see **49 of the 50**, not merely to be denied one. *(45-of-46 at library 2026-08-20.1.)*
 *
 * CONFIDENTIALITY: every value here comes from the §09 spec and QMULATE's own framework document via
 * the code catalogue. No real client data, no real deed, no real name.
 */

import {
  OBLIGATION_LIBRARY_VERSION,
  storableTemplates,
  templatesWithheldFromRegister,
} from '@qmulate/domain/compliance';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  hasDatabase,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('the canonical §09 obligation library, seeded (S8/E7)');

/** The placeholder library — ten rows derived backwards from fixture task instances. */
const FIXTURE_LIBRARY_VERSION = 'fixture-derived';

/** The one obligation the owner ruled compartmented (S8-Q1, 2026-08-23). */
const RESTRICTED_CODE = 'GOV-AML-02';

const WAQF_A = 'waqf-001';

/**
 * A seat inside the AML compartment for one endowment.
 *
 * ⚠ Membership is per-ENDOWMENT and this row is GLOBAL, which is exactly the collision S8-Q1's
 * implementation had to resolve: `amlClause()` ORs on `waqfId IN (compartments)`, and a global row
 * has no `waqfId`, so reusing it made the restricted obligation invisible to MEMBERS TOO.
 * `amlClauseGlobal()` states the rule instead — a caller inside ANY compartment may read the global
 * AML template, because the template is the REGULATION'S TEXT and belongs to no endowment.
 */
const memberContext = () =>
  ({
    actorId: 'test-lib-aml-officer',
    actorType: 'USER',
    authorizedWaqfIds: [WAQF_A],
    amlCompartmentWaqfIds: [WAQF_A],
    beneficiarySelfId: null,
    permissions: ['aml:sar:read', 'compliance:obligation:read'],
    requestId: 'test-lib-member',
  }) as never;

/** A staff seat with a grant on the endowment and NO compartment membership. */
const nonMemberContext = () =>
  ({
    actorId: 'test-lib-compliance-officer',
    actorType: 'USER',
    authorizedWaqfIds: [WAQF_A],
    amlCompartmentWaqfIds: [],
    beneficiarySelfId: null,
    permissions: ['compliance:obligation:read', 'compliance:task:read'],
    requestId: 'test-lib-non-member',
  }) as never;

describe.skipIf(!hasDatabase)('the canonical obligation library is in the database', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * PRESENT — by code, at the published version
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('holds EVERY storable template, named — not "36 rows"', async () => {
    const prisma = await basePrisma();
    const seeded = await prisma.complianceObligation.findMany({
      where: { libraryVersion: OBLIGATION_LIBRARY_VERSION },
      orderBy: { code: 'asc' },
    });

    const expected = [...storableTemplates()].map((entry) => entry.code).sort();
    expect(seeded.map((row) => row.code)).toStrictEqual(expected);
    // The count is asserted TOO, and only after the membership — so a failure says which row is
    // missing rather than only that one is.
    // 36 at 2026-08-20.1; 40 at 2026-08-26.1 (the S8-Q9/S8-Q8a additions).
    expect(seeded).toHaveLength(40);
  });

  it('withholds exactly the row the NOT NULL column cannot hold, and says which', async () => {
    // ⚠ NOT a tidy 37. `compliance_obligation.titleAr` is NOT NULL (`init:377`) and `GOV-COI-01`
    // (Nazarah Art. 18 — conflict of interest, ≤2nd-degree self-dealing) has no Arabic anywhere in
    // `docs/domain/unified-framework.md` to put in it. Composing one would be inventing the wording
    // of a self-dealing prohibition on a legal-facing screen, so the row is withheld — and the
    // withholding is derived, reported by the seed, and pinned here rather than absorbed into a
    // count nobody reconciles.
    const withheld = templatesWithheldFromRegister().map((entry) => entry.code);
    expect(withheld).toStrictEqual(['GOV-COI-01']);

    const prisma = await basePrisma();
    for (const code of withheld)
      expect(
        await prisma.complianceObligation.count({ where: { code } }),
        `${code} was seeded despite having no Arabic — check templatesWithheldFromRegister()`,
      ).toBe(0);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * FAITHFUL — the projection did not mangle the last link in the chain
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('every seeded cell equals its catalogue cell, the Arabic character for character', async () => {
    const prisma = await basePrisma();
    const byCode = new Map(
      (
        await prisma.complianceObligation.findMany({
          where: { libraryVersion: OBLIGATION_LIBRARY_VERSION },
        })
      ).map((row) => [row.code, row] as const),
    );

    for (const template of storableTemplates()) {
      const row = byCode.get(template.code);
      expect(row, `${template.code} is not in the database`).toBeDefined();
      if (row === undefined) continue;
      expect(row.section).toBe(template.section);
      expect(row.workstreamAr).toBe(template.workstreamAr);
      expect(row.workstreamEn).toBe(template.workstreamEn);
      // ⚠ THE LINK THIS FILE EXISTS TO CHECK. The catalogue's Arabic is a byte-for-byte quote of
      // `unified-framework.md`, re-verified character by character by the domain suite on every run.
      // A projection is the one place that chain could break silently — an encoding round-trip, a
      // trim, an entity escape — and the failure would be invisible to a Latin-script reader.
      expect(row.titleAr).toBe(template.titleAr);
      expect(row.titleEn).toBe(template.titleEn);
      expect(row.gate).toBe(template.gate);
      expect(row.deadlineRuleKey).toBe(template.deadlineRuleKey);
      expect(row.libraryVersion).toBe(template.libraryVersion);
      expect(row.deletedAt).toBeNull();
    }
  });

  it('every seeded Arabic title is real Arabic — the guard against an empty-string "fix"', async () => {
    // The tempting repair for a NOT NULL column meeting a null source is `''`. It would satisfy the
    // column, pass a `toBeDefined`, and put a blank legal-facing obligation on an Arabic-first
    // register. This is what makes that repair impossible to land quietly.
    const prisma = await basePrisma();
    const rows = await prisma.complianceObligation.findMany({
      where: { libraryVersion: OBLIGATION_LIBRARY_VERSION },
    });
    for (const row of rows) {
      expect(row.titleAr.trim(), `${row.code} has a blank Arabic title`).not.toBe('');
      expect(row.titleAr, `${row.code} carries no Arabic script`).toMatch(/[؀-ۿ]/);
      expect(row.workstreamAr, `${row.code} workstream carries no Arabic script`).toMatch(/[؀-ۿ]/);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * ALONGSIDE — the placeholders are untouched, and the two libraries stay distinguishable
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('leaves the ten SEED- placeholders exactly as they were, at their own version', async () => {
    const prisma = await basePrisma();
    const placeholders = await prisma.complianceObligation.findMany({
      where: { libraryVersion: FIXTURE_LIBRARY_VERSION },
      orderBy: { code: 'asc' },
    });

    expect(placeholders).toHaveLength(10);
    for (const row of placeholders) {
      expect(row.code.startsWith('SEED-'), `${row.code} lost its namespace`).toBe(true);
      // The ids are the OLD unversioned shape and must stay that way: migration 31's
      // `compliance_obligation_id_immutable` refuses a change, and an id change in an upsert keyed
      // on id would not rewrite them anyway — it would insert ten more rows and orphan the tasks
      // snapshotted against the old ones.
      expect(row.id).toBe(`oblig-${row.code}`);
      expect(row.confidentiality).toBe('NORMAL');
    }
  });

  it('the two libraries share NO code, so `UNIQUE (code, libraryVersion)` is not doing the work', async () => {
    // Measured rather than assumed. If a canonical code ever collided with a `SEED-` code, the rows
    // would still both store — the unique key is on the PAIR — and the register would show one duty
    // twice under two versions with no test complaining. The namespaces are what keep them apart,
    // and that is a property of the code, not of the constraint.
    const prisma = await basePrisma();
    const all = await prisma.complianceObligation.findMany();
    const canonical = new Set(
      all.filter((row) => row.libraryVersion === OBLIGATION_LIBRARY_VERSION).map((row) => row.code),
    );
    const placeholder = new Set(
      all.filter((row) => row.libraryVersion === FIXTURE_LIBRARY_VERSION).map((row) => row.code),
    );
    expect([...canonical].filter((code) => placeholder.has(code))).toStrictEqual([]);
    expect(canonical.size + placeholder.size).toBe(all.length);
  });

  it('holds 50 obligations and exactly 11 TASKS, none of them instantiated BY the library — a library instantiates nothing', async () => {
    // The distinction the whole epic turns on: a template is what an endowment MIGHT owe; a task is
    // what one DOES owe. Seeding 36 templates must not conjure a single duty against a single
    // endowment — instantiation is E7's engine, and it runs when somebody asks it to.
    const prisma = await basePrisma();
    expect(await prisma.complianceObligation.count()).toBe(50);
    // ⊕ S11 item 2a: 11 — the ten SEED- placeholders plus ONE task the FIXTURE records the daily SWEEP as
    // having raised (GOV-REG-02, EVENT_TRIGGER, waqf-003's expired certificate). That is a trigger firing,
    // not the library instantiating: the property this test pins is sharpened below, not loosened.
    expect(await prisma.complianceTask.count()).toBe(11);
    expect(
      await prisma.complianceTask.count({
        where: {
          instantiatedReason: {
            in: ['INITIAL_SETUP', 'RECLASSIFICATION', 'LIBRARY_UPGRADE'] as never,
          },
        },
      }),
      'the library must instantiate nothing — no INITIAL_SETUP, RECLASSIFICATION or LIBRARY_UPGRADE task is seeded',
    ).toBe(0);
    expect(
      await prisma.complianceTask.count({
        where: { templateCode: 'GOV-REG-02', instantiatedReason: 'EVENT_TRIGGER' as never },
      }),
    ).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * COMPARTMENTED — S8-Q1, over the first REAL restricted row this database has ever held
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('S8-Q1 · exactly one obligation is compartmented', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('EXACTLY ONE row in the whole table is AML_RESTRICTED, and it is GOV-AML-02', async () => {
    // ⚠ THE STAGE'S SECURITY ASSERTION. Named AND counted, table-wide rather than scoped to the
    // canonical version — because "compartment the row" failing open (a second restricted row) hides
    // an ordinary duty from the compliance board, and scoping the query to one version would let a
    // stray restricted placeholder pass unseen.
    const prisma = await basePrisma();
    const restricted = await prisma.complianceObligation.findMany({
      where: { confidentiality: 'AML_RESTRICTED' },
      orderBy: { code: 'asc' },
    });
    expect(restricted.map((row) => row.code)).toStrictEqual([RESTRICTED_CODE]);
    expect(restricted[0]?.libraryVersion).toBe(OBLIGATION_LIBRARY_VERSION);
  });

  it('THE LIVENESS HALF — every other obligation is NORMAL and still stored', async () => {
    // Without this, "compartment the row" and "compartment the register" are the same passing test.
    const prisma = await basePrisma();
    expect(await prisma.complianceObligation.count({ where: { confidentiality: 'NORMAL' } })).toBe(
      49,
    );
    expect(
      await prisma.complianceObligation.count({ where: { confidentiality: 'SENSITIVE_PII' } }),
      'an obligation template acquired a PII classification, which is not a thing it can carry',
    ).toBe(0);
  });

  it('a NON-MEMBER reads 49 of the 50 — the duty to report is the only thing missing', async () => {
    const db = await databaseModule();
    const outsider = db.createPrismaClient(nonMemberContext());

    const codes = (await outsider.complianceObligation.findMany({ orderBy: { code: 'asc' } })).map(
      (row) => row.code,
    );
    expect(codes).not.toContain(RESTRICTED_CODE);
    expect(codes).toHaveLength(49);
    // …and the COUNT does not leak it either. "50 obligations, 49 visible" is the tip-off with the
    // content removed — §09's `DASHBOARD_AGGREGATE` channel exists for exactly this shape.
    expect(await outsider.complianceObligation.count()).toBe(49);
    // THE LIVENESS HALF AGAIN, at the wire: the non-member must still see the ordinary AML duty
    // (KYC/CDD refresh), or the compartment has swallowed the neighbouring row and the register is
    // lying to a compliance officer about what the endowment owes.
    expect(codes).toContain('GOV-AML-01');
  });

  it('a COMPARTMENT MEMBER reads all 50, including the duty to report', async () => {
    // ⚠ THE ASSERTION THAT WOULD HAVE CAUGHT S8-Q1's OWN BUG. Reusing `amlClause()` on a global
    // model keyed membership on a `waqfId` a global row does not have, so the restricted obligation
    // came back empty FOR MEMBERS TOO — no error, nothing to see, a compartment that is an outage.
    // Membership on ANY endowment is what admits the global template; this seat holds waqf-001.
    const db = await databaseModule();
    const member = db.createPrismaClient(memberContext());

    const codes = (await member.complianceObligation.findMany({ orderBy: { code: 'asc' } })).map(
      (row) => row.code,
    );
    expect(codes, 'the compartment is invisible to its own member — this is an outage').toContain(
      RESTRICTED_CODE,
    );
    expect(codes).toHaveLength(50);
    expect(await member.complianceObligation.count()).toBe(50);
  });
});
