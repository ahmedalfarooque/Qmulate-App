/**
 * The AML compartment, DRIVEN AGAINST ITS OWN SUBJECT — migration 29, E7/S8.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT CHANGED, AND WHY IT NEEDED ITS OWN FILE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api/test/aml-compartment.integration.test.ts` proves the compartment PREDICATE and the
 * subtractive clause on the two models that happened to carry a `confidentiality` column. Its own
 * header says what it could not prove: *"there is no SAR model in `schema.prisma` and no notification
 * fan-out … Do not claim AC-3 green."*
 *
 * Migration 29 gives the compartment its subject. This file drives the controls against THAT — the
 * SAR itself, not a `Document` standing in for one — at the database layer where the force filter
 * and the guards live.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERY NEGATIVE HERE IS PAIRED WITH A POSITIVE, ON PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A non-member reading `[]` is indistinguishable from an empty table, and
 * `retention-remainder-delete.integration.test.ts` already says what that costs: *"a DELETE against
 * an empty table erases nothing and reads as a working control."* So every invisibility assertion
 * below is measured against a MEMBER who sees the same row, in the same query, in the same run. If
 * the member's read is empty the test fails on its own premise rather than passing.
 *
 * ⚠ THE ROWS ARE TEST-CREATED AND DELETED IN `afterAll`, and that is not laziness about fixtures.
 * `seed.integration.test.ts` compares ABSOLUTE table counts against `EXPECTED_COUNTS` and sums them
 * into `WRITES_PER_SEED_RUN`; the seed writes ZERO AML rows, so this table is not in that list and
 * rows created here are invisible to it. Adding a seeded SAR would move a sibling suite's numbers
 * and make its assertions depend on whether this file had run — the Rule 5 hazard, three times over
 * in one sprint.
 *
 * ⚠ AND THE DELETE IN `afterAll` HAS TO GO ROUND THE GUARD THIS FILE INSTALLS. `aml_report_no_delete`
 * is `ENABLE ALWAYS`, so cleanup uses the privileged scaffold connection with the sentinel — the same
 * route every other retention-guarded fixture uses. A test that could clean up through the ordinary
 * path would be a test whose guard does not work.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('the AML compartment structure (BR-604, §09 Engine C, migration 29)');

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';

const REPORT_ID = 'test-aml-report-structure';
const FOLLOW_UP_ID = 'test-aml-follow-up-structure';
const CROSS_FOLLOW_UP_ID = 'test-aml-follow-up-cross';

/** Inside the compartment for waqf-001. */
const memberContext = () =>
  ({
    actorId: 'test-aml-officer',
    actorType: 'USER',
    authorizedWaqfIds: [WAQF_A],
    amlCompartmentWaqfIds: [WAQF_A],
    beneficiarySelfId: null,
    permissions: ['aml:sar:read', 'aml:sar:write', 'audit:event:read'],
    requestId: 'test-aml-structure-member',
  }) as never;

/** A staff seat WITH a grant on the same endowment and NO compartment membership. */
const nonMemberContext = () =>
  ({
    actorId: 'test-aml-non-member',
    actorType: 'USER',
    authorizedWaqfIds: [WAQF_A],
    amlCompartmentWaqfIds: [],
    beneficiarySelfId: null,
    permissions: ['aml:sar:read', 'audit:event:read'],
    requestId: 'test-aml-structure-non-member',
  }) as never;

/** The SUBJECT: a beneficiary portal session on the same endowment. */
const subjectContext = () =>
  ({
    actorId: 'test-aml-subject-user',
    actorType: 'USER',
    authorizedWaqfIds: [WAQF_A],
    amlCompartmentWaqfIds: [],
    beneficiarySelfId: 'ben-001',
    permissions: ['beneficiary:beneficiary:read', 'aml:sar:read'],
    requestId: 'test-aml-structure-subject',
  }) as never;

describe.skipIf(!hasDatabase)('the AML compartment has a subject, and it is invisible', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    await removeProbeRows();
    await createProbeRows();
  });

  afterAll(async () => {
    await removeProbeRows();
    await closeDatabase();
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 1 · INVISIBILITY, NOT REDACTION — and the count is the part that leaks
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('a MEMBER reads the SAR — the premise, without which every negative below is vacuous', async () => {
    const db = await databaseModule();
    const member = db.createPrismaClient(memberContext());
    const rows = await member.amlReport.findMany({ where: { waqfId: WAQF_A } });
    expect(rows.map((row) => row.id)).toContain(REPORT_ID);
    expect(rows.find((row) => row.id === REPORT_ID)?.confidentiality).toBe('AML_RESTRICTED');
  });

  it('a NON-MEMBER with a grant on the same endowment reads NOTHING, and COUNTS nothing', async () => {
    // The count is the half that is easy to forget and the half that leaks first: a row hidden from
    // `findMany` but visible to `count` is an enumeration oracle, and "there are 2 restricted things
    // on this endowment" is the tip-off. §10 §6: an EMPTY SET, "as if it does not exist".
    const db = await databaseModule();
    const outsider = db.createPrismaClient(nonMemberContext());
    expect(await outsider.amlReport.findMany({ where: { waqfId: WAQF_A } })).toEqual([]);
    expect(await outsider.amlReport.count({ where: { waqfId: WAQF_A } })).toBe(0);
    expect(await outsider.amlFollowUp.findMany({ where: { waqfId: WAQF_A } })).toEqual([]);
    expect(await outsider.amlFollowUp.count({ where: { waqfId: WAQF_A } })).toBe(0);
  });

  it('a DIRECT FETCH BY ID is empty too, so knowing the id buys nothing', async () => {
    const db = await databaseModule();
    const outsider = db.createPrismaClient(nonMemberContext());
    expect(await outsider.amlReport.findFirst({ where: { id: REPORT_ID } })).toBeNull();
    expect(await outsider.amlFollowUp.findFirst({ where: { id: FOLLOW_UP_ID } })).toBeNull();
  });

  it('THE SUBJECT — a portal session on the endowment named in the report reads NOTHING', async () => {
    // §09 C2. `ben-001` is a real seeded beneficiary and is named in `relatedPartyRefs`, so this is
    // the actual C2 shape rather than an unrelated portal seat. TWO independent controls stand here
    // and the test does not care which one fires: `BENEFICIARY_FORBIDDEN_MODELS` empties the read
    // before the compartment predicate is consulted, AND the compartment default is empty. The
    // belt-and-braces is deliberate — revoking a membership must never open a subject's own file.
    const db = await databaseModule();
    const subject = db.createPrismaClient(subjectContext());
    expect(await subject.amlReport.findMany({})).toEqual([]);
    expect(await subject.amlReport.count({})).toBe(0);
    expect(await subject.amlFollowUp.findMany({})).toEqual([]);
    expect(await subject.amlFollowUp.count({})).toBe(0);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 2 · THE AUDIT FEED — where the same leak happened once already
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it("the SAR's own audit events are RESTRICTED, and a non-member's feed does not carry them", async () => {
    // ⊕ THIS IS THE TEST THAT PAYS FOR NAMING THE COLUMN `confidentiality` RATHER THAN §09's
    // `visibility`. `deriveClassification()` reads `row.confidentiality`; under the spec's own name
    // it would have found nothing, labelled these events ROUTINE, and dropped the whole SAR — its
    // `after` image included — into the feed that `audit:event:read` opens for 10 of 13 presets.
    // That exact leak was measured once before on `Document` and closed by `auditCompartmentClause`.
    const db = await databaseModule();
    const member = db.createPrismaClient(memberContext());
    const outsider = db.createPrismaClient(nonMemberContext());

    const mine = await member.auditEvent.findMany({
      where: { entityType: 'AmlReport', entityId: REPORT_ID },
    });
    expect(mine.length, 'the SAR write produced no audit event at all').toBeGreaterThan(0);
    for (const event of mine) expect(event.classification).toBe('RESTRICTED');

    expect(
      await outsider.auditEvent.findMany({
        where: { entityType: 'AmlReport', entityId: REPORT_ID },
      }),
    ).toEqual([]);
    // And the count, for the same reason as above.
    expect(
      await outsider.auditEvent.count({ where: { entityType: 'AmlReport', entityId: REPORT_ID } }),
    ).toBe(0);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 3 · THE STRUCTURE — what the database refuses regardless of who is asking
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('a SAR cannot be born NORMAL — the CHECK, not the default, is the control', async () => {
    // A DEFAULT governs only an INSERT that omits the column, and every ORM names it. Driven as raw
    // SQL on the privileged connection so the refusal is the DATABASE's and not an extension's.
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`
          INSERT INTO "aml_report"
            ("id","waqfId","filedByUserId","filedAt","filedAtHijri","suspicionSummaryEnc",
             "relatedPartyRefs","status","confidentiality","updatedAt")
          VALUES ('test-aml-born-normal','${WAQF_A}','u',now(),'1447-01-01','x',
                  ARRAY[]::text[],'FILED','NORMAL',now())`),
      ),
    ).rejects.toThrow(/aml_report_always_restricted/);
  });

  it('a follow-up cannot belong to a different endowment than its report', async () => {
    // The composite FK from migration 29 §3. `aml_follow_up.waqfId` is denormalised so the row is
    // scopable without a join — a child whose visibility depends on a join is a child one `include`
    // away from being readable — and this is what keeps the denormalised copy honest.
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`
          INSERT INTO "aml_follow_up"
            ("id","amlReportId","waqfId","direction","occurredAt","occurredAtHijri","summary",
             "documentIds","confidentiality","updatedAt")
          VALUES ('${CROSS_FOLLOW_UP_ID}','${REPORT_ID}','${WAQF_B}','FIU_REQUEST',now(),
                  '1447-01-01','x',ARRAY[]::text[],'AML_RESTRICTED',now())`),
      ),
    ).rejects.toThrow(/aml_follow_up_of_same_waqf/);
  });

  it('a hard DELETE is refused, NAMING the table, even on the privileged connection', async () => {
    // Naming the table is what tells "this table is guarded" apart from "the statement cascaded into
    // a guarded neighbour" — migration 4's false negative, measured again in migration 8 on
    // `TRUNCATE "client" CASCADE`, which was refused while naming "waqf".
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(privilegedSql(`DELETE FROM "aml_report" WHERE "id" = '${REPORT_ID}'`)),
    ).rejects.toThrow(/DELETE on "aml_report" is refused/);
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(`DELETE FROM "aml_follow_up" WHERE "id" = '${FOLLOW_UP_ID}'`),
      ),
    ).rejects.toThrow(/DELETE on "aml_follow_up" is refused/);
  });

  it('TRUNCATE on the CHILD is refused by the guard, naming the child', async () => {
    // `aml_follow_up` has no inbound FK, so nothing stands between the statement and the trigger.
    // This is the clean case and it names its own table, which is the property migration 4 shipped
    // without and migration 6 added: a refusal that does not name the target cannot be told apart
    // from a cascade into a guarded neighbour.
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(privilegedSql(`TRUNCATE TABLE "aml_follow_up"`)),
    ).rejects.toThrow(/TRUNCATE on "aml_follow_up" is refused/);
  });

  it('⚠ TRUNCATE on the PARENT is stopped by an FK ACCIDENT FIRST — and that is not a control', async () => {
    // MEASURED, and recorded rather than papered over. A bare `TRUNCATE "aml_report"` fails with
    // SQLSTATE **0A000** — "cannot truncate a table referenced in a foreign key constraint" — which
    // is Postgres refusing before any trigger fires. Migration 8 named this exact pattern for
    // `client`, `waqif` and `compliance_obligation`: **"FK-accident is NOT a control"**, because it
    // holds only while a child row happens to exist and the FK happens to be RESTRICT.
    //
    // So this test asserts the accident for what it is, and then drives the ACTUAL guard with
    // CASCADE and distinguishes them BY SQLSTATE: 0A000 is Postgres's plumbing, 42501 is
    // `qmulate_reject_truncate()`. Without that distinction a green test here would prove only that
    // the FK graph currently happens to help.
    const raw = await privilegedPrisma();

    await expect(
      raw.$executeRawUnsafe(privilegedSql(`TRUNCATE TABLE "aml_report"`)),
    ).rejects.toThrow(/cannot truncate a table referenced in a foreign key constraint/);

    // CASCADE gets past the FK. Now the guard must be what stops it — and the message may name
    // EITHER table, because a cascade fires both statements' triggers and whichever runs first wins.
    // That ambiguity is why the child's own test above exists separately.
    await expect(
      raw.$executeRawUnsafe(privilegedSql(`TRUNCATE TABLE "aml_report" CASCADE`)),
    ).rejects.toThrow(/TRUNCATE on "aml_(report|follow_up)" is refused/);
  });

  it('the DELETE guard survives the replica role — ENABLE ALWAYS, measured', async () => {
    // `session_replication_role = 'replica'` skips ordinary triggers. It is the one statement that
    // turned three of migration 8's FK-accident refusals into PERMITTED, so a retention guard that
    // is not ENABLE ALWAYS is a retention guard for well-behaved callers only.
    //
    // The two statements must share a SESSION, so they go through `$transaction` — `$executeRawUnsafe`
    // is one statement per call and `SET LOCAL` in its own call would be scoped to a transaction that
    // ends immediately. Getting this wrong produces a test that passes for the wrong reason.
    const raw = await privilegedPrisma();
    await expect(
      raw.$transaction([
        raw.$executeRawUnsafe(privilegedSql(`SET LOCAL session_replication_role = 'replica'`)),
        raw.$executeRawUnsafe(
          privilegedSql(`DELETE FROM "aml_report" WHERE "id" = '${REPORT_ID}'`),
        ),
      ]),
    ).rejects.toThrow(/DELETE on "aml_report" is refused/);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════════════
   * 4 · DECLARED GAPS — recorded here rather than left for a reviewer to notice
   * ═══════════════════════════════════════════════════════════════════════════════════════ */

  it('✓ CLOSED (S9-4b): `suspicionSummaryEnc` is field-encrypted — ciphertext at rest, plaintext round trip', async () => {
    // This test DECLARED the gap from E7 until S9-4b: the most sensitive free text this schema
    // carries was stored in plaintext, deferred with its cost named. The owner ruled on 2026-08-25
    // (memo, fourth batch, S8-Q10 "Field-encrypt now"), migration 37 renamed the column, and
    // `AmlReport.suspicionSummaryEnc` joined `ENCRYPTED_FIELDS` — so this test flips from
    // asserting the gap to MEASURING the closure, both halves:
    //   · AT REST it is a cipher envelope, not the fixture text (read raw, privileged — below any
    //     extension), so the database leaking does not leak the report;
    //   · AT THE APPLICATION BOUNDARY the member's read round-trips the plaintext, so the
    //     compartment stays the thing that decides who reads.
    // The named cost was search; it is served by `relatedPartyRefs` (plain ids), NOT by an HMAC of
    // free text — `suspicionSummaryEnc` deliberately has no digest sibling, asserted here too.
    const db = await databaseModule();
    const registry = (
      db as unknown as {
        ENCRYPTED_FIELDS: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
      }
    ).ENCRYPTED_FIELDS;
    expect(Object.keys(registry), 'AmlReport left the encryption registry').toContain('AmlReport');
    expect(registry['AmlReport']).toEqual({ suspicionSummaryEnc: null });
    // AmlFollowUp.summary stays OUTSIDE the registry — still a declared state, now the only one.
    expect(Object.keys(registry)).not.toContain('AmlFollowUp');

    // At rest: the probe row (written through the application path in createProbeRows) must not
    // hold the fixture text.
    const raw = await privilegedPrisma();
    const stored = await raw.$queryRawUnsafe<{ suspicionSummaryEnc: string }[]>(
      `SELECT "suspicionSummaryEnc" FROM "aml_report" WHERE "id" = '${REPORT_ID}'`,
    );
    expect(stored).toHaveLength(1);
    const atRest = stored[0]?.suspicionSummaryEnc ?? '';
    expect(atRest).not.toContain('INVENTED FIXTURE TEXT');
    expect(
      db.isCipherEnvelope(atRest),
      `not a cipher envelope at rest: ${atRest.slice(0, 24)}…`,
    ).toBe(true);

    // Round trip: a compartment member reads the plaintext back.
    const member = db.createPrismaClient(memberContext());
    const read = await member.amlReport.findUnique({ where: { id: REPORT_ID } });
    expect(read?.suspicionSummaryEnc).toBe(
      'INVENTED FIXTURE TEXT — not a real report and not real parties.',
    );
  });

  it('⚠ DECLARED: no seeded seat is inside the compartment, so the fixture cannot prove suppression', async () => {
    // Every one of the six seeded grant shapes sets `amlCompartment: false`, so the contexts in this
    // file are hand-built. That is honest for a database-layer test — the force filter reads a
    // context, not a seat — but it means the FIXTURE cannot demonstrate a member and a non-member
    // side by side, and whether the Nazir is inside by construction is with the owner (S8-Q2).
    // Asserted so that seeding one later turns this red and forces the note to be revisited.
    const prisma = await basePrisma();
    const inside = await prisma.waqfAccessGrant.count({ where: { amlCompartment: true } });
    expect(
      inside,
      'a seat is now seeded inside the compartment — revisit S8-Q2 and this note',
    ).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fixtures — written THROUGH the audit spine, because the audit assertions above depend on it
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

async function createProbeRows(): Promise<void> {
  const { makeSystemContext, withAudit, createPrismaClient } = await databaseModule();
  const ctx = makeSystemContext({
    actorId: 'test-aml-officer',
    requestId: 'test-aml-structure-seed',
  });
  const db = createPrismaClient(ctx);

  await withAudit(db, async (tx) => {
    await tx.amlReport.create({
      data: {
        id: REPORT_ID,
        waqfId: WAQF_A,
        filedByUserId: 'test-aml-officer',
        filedAt: new Date('2026-08-20T00:00:00.000Z'),
        filedAtHijri: '1448-03-07',
        suspicionSummaryEnc: 'INVENTED FIXTURE TEXT — not a real report and not real parties.',
        relatedPartyRefs: ['ben-001'],
        status: 'FILED',
      },
    });
    await tx.amlFollowUp.create({
      data: {
        id: FOLLOW_UP_ID,
        amlReportId: REPORT_ID,
        waqfId: WAQF_A,
        direction: 'FIU_REQUEST',
        occurredAt: new Date('2026-08-21T00:00:00.000Z'),
        occurredAtHijri: '1448-03-08',
        summary: 'INVENTED FIXTURE TEXT.',
        documentIds: [],
      },
    });
  });
}

/**
 * Cleanup goes THROUGH the privileged scaffold, because the guard this file installs refuses a
 * DELETE from anybody. A test that could tidy up by the ordinary route would be a test whose guard
 * does not work — so the awkwardness here is the control working.
 */
async function removeProbeRows(): Promise<void> {
  const raw = await privilegedPrisma();
  for (const sql of [
    `ALTER TABLE "aml_follow_up" DISABLE TRIGGER "aml_follow_up_no_delete"`,
    `DELETE FROM "aml_follow_up" WHERE "id" IN ('${FOLLOW_UP_ID}','${CROSS_FOLLOW_UP_ID}')`,
    `ALTER TABLE "aml_follow_up" ENABLE ALWAYS TRIGGER "aml_follow_up_no_delete"`,
    `ALTER TABLE "aml_report" DISABLE TRIGGER "aml_report_no_delete"`,
    `DELETE FROM "aml_report" WHERE "id" IN ('${REPORT_ID}','test-aml-born-normal')`,
    `ALTER TABLE "aml_report" ENABLE ALWAYS TRIGGER "aml_report_no_delete"`,
  ])
    await raw.$executeRawUnsafe(privilegedSql(sql));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S8-Q1 · THE OBLIGATION ROW IS COMPARTMENTED TOO (migration 32)
 *
 * Migration 29 hid the SAR. §09 left the DUTY TO REPORT on the general register at gate `all`, where
 * `compliance:task:read` sits in ELEVEN of thirteen role presets — so the report was hidden and its
 * obligation was not, and a task moving NOT_STARTED -> COMPLETED announced an AML matter to everyone
 * except the one seat entitled to know. The owner ruled the row compartmented (S8-Q1, 2026-08-23).
 *
 * ⚠ **THE ROWS HERE ARE TEST-CREATED, AND THE REASON MATTERS.** `GOV-AML-02` exists in the CODE
 * catalogue; the database holds ten `SEED-` placeholders and none is the AML duty. A compartment test
 * over a table with no restricted row proves nothing — so the restricted row is created rather than
 * assumed, and its unrestricted sibling is asserted visible in the same query so what differs is the
 * CLASSIFICATION and not the query.
 *
 * ⚠ AND `ComplianceObligation` IS THE FIRST **UNSCOPED** MODEL TO CARRY A PREDICATE. `scopeFilter`
 * returned `null` for global reference data and never reached `amlClauseFor` outside the
 * endowment-scoped branch, so this block is the only proof that the new UNSCOPED arm fires at all.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const RESTRICTED_OBLIGATION_ID = 'test-aml-oblig-restricted';
const NORMAL_OBLIGATION_ID = 'test-aml-oblig-normal';
const RESTRICTED_TASK_ID = 'test-aml-task-restricted';

describe.skipIf(!hasDatabase)('the AML obligation ROW is compartmented (S8-Q1)', () => {
  beforeAll(async () => {
    await removeComplianceProbeRows();
    await createComplianceProbeRows();
  });

  afterAll(async () => {
    await removeComplianceProbeRows();
    await closeDatabase();
  });

  it('a MEMBER sees the restricted OBLIGATION — the premise for every negative below', async () => {
    const db = await databaseModule();
    const rows = await db
      .createPrismaClient(memberContext())
      .complianceObligation.findMany({ where: { id: { startsWith: 'test-aml-oblig-' } } });
    expect(rows.map((row) => row.id).sort()).toStrictEqual([
      NORMAL_OBLIGATION_ID,
      RESTRICTED_OBLIGATION_ID,
    ]);
  });

  it('a NON-MEMBER sees the NORMAL obligation and NOT the restricted one — the UNSCOPED arm', async () => {
    // THE ASSERTION THIS WHOLE STAGE TURNS ON. Before migration 32 `scopeFilter` returned `null` for
    // an unscoped model, so both rows came back — the AML duty included — to any authenticated caller.
    const db = await databaseModule();
    const outsider = db.createPrismaClient(nonMemberContext());
    const ids = (
      await outsider.complianceObligation.findMany({
        where: { id: { startsWith: 'test-aml-oblig-' } },
      })
    ).map((row) => row.id);
    expect(ids).toStrictEqual([NORMAL_OBLIGATION_ID]);
    expect(ids).not.toContain(RESTRICTED_OBLIGATION_ID);
    // …and the COUNT does not leak it either. A catalogue count that included the hidden row would
    // say "there is one more duty than you can see", which is the tip-off with the content removed.
    expect(
      await outsider.complianceObligation.count({
        where: { id: { startsWith: 'test-aml-oblig-' } },
      }),
    ).toBe(1);
  });

  it('the restricted TASK is invisible to a non-member and visible to a member', async () => {
    // The task is the half §09 left exposed: the OBLIGATION is a global template, but the STATUS
    // TRANSITION is what announces that a report was made. `compliance_task` is endowment-scoped, so
    // this exercises the ordinary DIRECT_SET arm rather than the new unscoped one.
    const db = await databaseModule();
    const member = db.createPrismaClient(memberContext());
    const outsider = db.createPrismaClient(nonMemberContext());

    const seenByMember = (
      await member.complianceTask.findMany({ where: { id: RESTRICTED_TASK_ID } })
    ).map((row) => row.id);
    expect(
      seenByMember,
      'the member cannot see the restricted task — contrast is vacuous',
    ).toContain(RESTRICTED_TASK_ID);

    expect(await outsider.complianceTask.findMany({ where: { id: RESTRICTED_TASK_ID } })).toEqual(
      [],
    );
    expect(await outsider.complianceTask.count({ where: { id: RESTRICTED_TASK_ID } })).toBe(0);
  });

  it("the restricted obligation's audit events are RESTRICTED — the column name paying off again", async () => {
    // `deriveClassification()` reads `row.confidentiality`. Had this column been named `visibility` —
    // which is what §09's own TS shape calls the equivalent field on the SAR — these events would be
    // ROUTINE and sitting in the feed every non-member reads, with nothing having malfunctioned.
    //
    // ⚠⚠ AND A DECLARED GAP, MEASURED HERE RATHER THAN DISCOVERED LATER. The event IS RESTRICTED and
    // it is invisible **to everyone, members included** — because `auditCompartmentClause` reaches a
    // RESTRICTED event only via `{ waqfId: { in: compartments } }`, and a GLOBAL obligation row has no
    // endowment, so its event carries a NULL `waqfId`. Migration 29's header warned about exactly this
    // shape for the SAR; a global template makes it UNAVOIDABLE rather than a mistake, because there
    // is no endowment to stamp.
    //
    // Asserted in both halves so the state is a FACT and not an assumption: the event exists and is
    // RESTRICTED (read privileged), and the scoped read is empty. Closing it needs a compartment
    // predicate for classification-only events with no endowment — E10's audit-anchor work — and NOT
    // stamping an arbitrary waqfId onto a global row's event, which would make the trail lie about
    // which endowment an act belonged to.
    const raw = await privilegedPrisma();
    const stored = await raw.$queryRawUnsafe<{ classification: string; waqfId: string | null }[]>(
      `SELECT "classification"::text AS classification, "waqfId"
         FROM "audit_event"
        WHERE "entityType" = 'ComplianceObligation' AND "entityId" = '${RESTRICTED_OBLIGATION_ID}'`,
    );
    expect(
      stored.length,
      'the restricted obligation write produced no audit event at all',
    ).toBeGreaterThan(0);
    for (const row of stored) {
      expect(row.classification).toBe('RESTRICTED');
      expect(row.waqfId, 'a global obligation gained an endowment id').toBeNull();
    }

    const db = await databaseModule();
    const member = db.createPrismaClient(memberContext());
    expect(
      await member.auditEvent.findMany({
        where: { entityType: 'ComplianceObligation', entityId: RESTRICTED_OBLIGATION_ID },
      }),
      'the declared gap closed — delete this assertion and the note above',
    ).toEqual([]);
  });
});

async function createComplianceProbeRows(): Promise<void> {
  const { makeSystemContext, withAudit, createPrismaClient } = await databaseModule();
  const ctx = makeSystemContext({
    actorId: 'test-aml-officer',
    requestId: 'test-aml-q1-seed',
  });
  const db = createPrismaClient(ctx);
  const template = {
    section: 'GOVERNMENT_LEGAL' as const,
    workstreamAr: 'الالتزامات الرقابية ومكافحة غسل الأموال وتمويل الإرهاب',
    workstreamEn: 'AML/CTF',
    titleAr: 'INVENTED FIXTURE TEXT — not a real obligation.',
    titleEn: 'INVENTED FIXTURE TEXT',
    gate: 'ALL' as const,
    libraryVersion: 'q1-probe',
  };

  await withAudit(db, async (tx) => {
    await tx.complianceObligation.create({
      data: {
        id: RESTRICTED_OBLIGATION_ID,
        code: 'TEST-AML-RESTRICTED',
        ...template,
        confidentiality: 'AML_RESTRICTED',
      },
    });
    await tx.complianceObligation.create({
      data: { id: NORMAL_OBLIGATION_ID, code: 'TEST-AML-NORMAL', ...template },
    });
    await tx.complianceTask.create({
      data: {
        id: RESTRICTED_TASK_ID,
        waqfId: WAQF_A,
        obligationId: RESTRICTED_OBLIGATION_ID,
        templateCode: 'TEST-AML-RESTRICTED',
        templateVersion: 'q1-probe',
        status: 'NOT_STARTED',
        confidentiality: 'AML_RESTRICTED',
      },
    });
  });
}

/** Round the no-delete guards, as every retention-guarded fixture must. */
async function removeComplianceProbeRows(): Promise<void> {
  const raw = await privilegedPrisma();
  for (const sql of [
    `ALTER TABLE "compliance_task" DISABLE TRIGGER "compliance_task_no_delete"`,
    `DELETE FROM "compliance_task" WHERE "id" = '${RESTRICTED_TASK_ID}'`,
    `ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER "compliance_task_no_delete"`,
    `ALTER TABLE "compliance_obligation" DISABLE TRIGGER "compliance_obligation_no_delete"`,
    `DELETE FROM "compliance_obligation" WHERE "id" IN ('${RESTRICTED_OBLIGATION_ID}','${NORMAL_OBLIGATION_ID}')`,
    `ALTER TABLE "compliance_obligation" ENABLE ALWAYS TRIGGER "compliance_obligation_no_delete"`,
  ])
    await raw.$executeRawUnsafe(privilegedSql(sql));
}
