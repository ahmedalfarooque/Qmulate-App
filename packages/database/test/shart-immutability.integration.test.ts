// QMULATE — BINDING RULE 1: the Shart al-Waqif (شرط الواقف) is immutable (assertion A11, MP-27, MP-28).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT CHANGED IN E2, AND WHY IT IS THE STRICTER DIRECTION
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Sprint 1 shipped the founder's conditions as "not without a recorded approval": the
// `waqf_shart_immutable` trigger raised unless a transaction-local GUC was set, and the GUC could
// be ANY NON-EMPTY STRING. The verification the comments described — that the id named a real
// APPROVED `RESERVED_MATTER` for that waqf with `checkerId != null && checkerId !== makerId` — was
// not implemented anywhere: not in the trigger, and not in TypeScript either, because the
// `withReservedMatter()` that was supposed to do it did not exist. Combined with the missing
// `checker != maker` CHECK, a single actor could fabricate an approval, self-approve it, and amend
// the highest reserved matter in the system.
//
// TWO changes, in opposite directions:
//
//  1. THE SHART HATCH IS NOW SHUT. User decision, 2026-07-27, verbatim: "shart al-waqif cannot be
//     changed, regardless of approvals." The four Shart columns raise WITHOUT consulting the GUC —
//     no approval id, however genuine, opens them, from the ORM or from raw SQL.
//  2. THE REMAINING RESERVED-MATTER COLUMNS ARE NOW VERIFIED. `certificateNumber` and `deedNumber`
//     stay reserved-matter-only (D-5), but the five conditions now run INSIDE the trigger, so they
//     survive a raw query.
//
// ✅ RECONCILED 2026-07-29. (1) was stricter than CLAUDE.md binding rule 1, which used to say the
// Shart is "amendable only via an explicit authority-gated reserved-matter workflow". The product
// owner restated the decision unconditionally — "the shart cant be changed" — and BINDING RULE 1 WAS
// AMENDED to match, so the rule, this test and the trigger now say the same thing. Reserved-matter
// approval governs the other reserved matters but is not a key to these columns. See ADR-0006.
//
// ── WHY THE GUARD IS IN THE DATABASE ─────────────────────────────────────────────────────────
// Application-level immutability protects against the application. It does nothing about a
// migration, a psql prompt, or an ORM call somebody adds next year. Every negative case below is
// therefore driven from a RAW connection, and the ones that need a constraint out of the way drop it
// INSIDE A ROLLED-BACK TRANSACTION — which proves the trigger's checks are independent of the CHECK
// constraints rather than merely redundant with them.
//
// Every mutating probe ends in a RAISE or is undone, so the seeded Shart is byte-identical
// afterwards — asserted at the end of the file.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  PROBE_NOT_BLOCKED,
  PROBE_SUCCEEDED,
  SQLSTATE_BY_CONDITION,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  guardProbeSql,
  hasDatabase,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('assertion A11 (Shart al-Waqif immutability) + MP-27 / MP-28');

const WAQF_ID = 'waqf-001';
const OTHER_WAQF_ID = 'waqf-002';

/** A `nazir` on every endowment — the only kind of identity that may be a `checkerId`. */
const CHECKER_ID = 'user-approver-001';
/** The maker under segregation of duties. Never the checker. */
const MAKER_ID = 'user-accountant-001';

/**
 * Test-created `approval_request` ids, in a 9xxx series so they can never collide with a fixture or
 * seed-derived id, and so cleanup can delete exactly this range.
 */
const APPROVAL = {
  genuine: 'appr-test-9001',
  pending: 'appr-test-9002',
  wrongWaqf: 'appr-test-9003',
  wrongType: 'appr-test-9004',
  softDeleted: 'appr-test-9005',
  /** Genuine in every respect EXCEPT that it names a different artifact (C-14). */
  wrongSubject: 'appr-test-9006',
  /** Genuine, and bound to `deedNumber` rather than `certificateNumber` (C-14). */
  genuineDeed: 'appr-test-9007',
  /**
   * Genuine, and bound to `deletedAt` — the endowment's RETIREMENT (memo Q8, migration 17 tier 2b).
   * One approval covers both directions, because retiring and un-retiring are the same artifact.
   */
  retirement: 'appr-test-9008',
} as const;

/**
 * THE SUBJECT AN APPROVAL MUST NAME TO OPEN A GUARDED COLUMN (C-14, migration 4).
 *
 * Migration 3 verified that a reserved-matter approval was genuine, APPROVED, of the right type,
 * on the right endowment and not self-approved — and never that it was an approval OF THE THING
 * BEING CHANGED. So any approved istibdal, and every routine settings change (`settings.ts` sets
 * `SETTING_CHANGE_APPROVAL_TYPE = 'RESERVED_MATTER'`), was a working key for silently re-pointing
 * the endowment at a different deed. Reproduced from a raw connection before the fix.
 *
 * The convention is the same shape `settingChangeSubjectId(key, waqfId)` already uses rather than
 * a second invented one.
 */
const artifactSubject = (waqfId: string, column: string): string => `waqf:${waqfId}:${column}`;

/** 64 hex characters. `approval_request_approved_binds_payload` requires one on a decided row. */
const FAKE_PAYLOAD_HASH = 'a'.repeat(64);

/**
 * Runs ONE statement with `approvalId` in session and returns what the database said.
 *
 * A sibling of the `probeWithApproval` helper inside the MP-27 block, which is bound to that block's
 * single `certificateNumber` statement. This one takes the statement, because memo Q8's tier 2b needs
 * the SAME approval-vs-artifact comparison over a DIFFERENT column — and the point of C-14 is that an
 * approval naming one column is not a key for another.
 */
async function probeWithApprovalFor(approvalId: string, statement: string): Promise<string> {
  const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
  return runProbe(
    guardProbeSql(
      `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${approvalId}', true); ${statement}`,
      'insufficient_privilege',
    ),
  );
}

/** The four write-once Shart columns, and the statement that would change each one. */
const SHART_COLUMN_STATEMENTS: readonly { column: string; statement: string }[] = [
  { column: 'shartAlWaqif', statement: `SET "shartAlWaqif" = '{}'::jsonb` },
  {
    column: 'shartAlWaqifVersion',
    statement: `SET "shartAlWaqifVersion" = "shartAlWaqifVersion" + 1`,
  },
  { column: 'shartAlWaqifSetAt', statement: `SET "shartAlWaqifSetAt" = now()` },
  { column: 'shartAlWaqifSetAtHijri', statement: `SET "shartAlWaqifSetAtHijri" = '1400-01-01'` },
];

/**
 * A probe that runs `setup` (which MUST succeed) and then a `forbidden` statement that must be
 * refused with `insufficient_privilege`. Everything, including any DDL in `setup`, is rolled back:
 * the handler re-raises, which aborts the whole `DO` block's transaction.
 *
 * This is what makes the "checkerId = makerId" and "checkerId IS NULL" cases testable AT ALL. Both
 * are unrepresentable while the E2 CHECK constraints are in place, so the only way to exercise the
 * TRIGGER's own copy of those conditions is to remove the constraint for the duration of one
 * transaction — which is also the exact scenario the trigger exists for: a future migration, or an
 * operator, dropping a CHECK.
 */
function probeWithSetupSql(setup: readonly string[], forbidden: string): string {
  return [
    'DO $qm_probe$',
    'BEGIN',
    ...setup.map((statement) => `  ${statement};`),
    '  BEGIN',
    `    ${forbidden};`,
    `    RAISE EXCEPTION '${PROBE_NOT_BLOCKED}' USING ERRCODE = 'P0001';`,
    '  EXCEPTION',
    '    WHEN insufficient_privilege THEN',
    `      RAISE EXCEPTION '${PROBE_BLOCKED}[${SQLSTATE_BY_CONDITION.insufficient_privilege}]: %', SQLERRM USING ERRCODE = 'P0001';`,
    '  END;',
    'END',
    '$qm_probe$;',
  ].join('\n');
}

/** `INSERT` for one test approval row, as raw SQL. */
function insertApprovalSql(options: {
  id: string;
  waqfId?: string;
  type?: string;
  status?: string;
  makerId?: string;
  checkerId?: string | null;
  subjectId?: string;
  deletedAt?: boolean;
}): string {
  const {
    id,
    waqfId = WAQF_ID,
    type = 'RESERVED_MATTER',
    status = 'APPROVED',
    makerId = MAKER_ID,
    checkerId = CHECKER_ID,
    subjectId = id,
    deletedAt = false,
  } = options;
  const decided = status === 'APPROVED' || status === 'EXECUTED';
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","status","makerId","checkerId","subjectId","payloadHash","payload",
       "decidedAt","createdAt","updatedAt","deletedAt")
    VALUES (
      '${id}', '${waqfId}', '${type}'::"ApprovalType", '${status}'::"ApprovalStatus",
      '${makerId}', ${checkerId === null ? 'NULL' : `'${checkerId}'`}, '${subjectId}',
      ${decided ? `'${FAKE_PAYLOAD_HASH}'` : 'NULL'},
      '{"fixture":"e2 test row"}'::jsonb,
      ${decided ? 'now()' : 'NULL'}, now(), now(),
      ${deletedAt ? 'now()' : 'NULL'})`;
}

describe.skipIf(!hasDatabase)('Binding rule 1 · the Shart al-Waqif is immutable (A11)', () => {
  let originalShart: string;
  let originalVersion: number;
  /**
   * ⚠ `string`, NOT `string | null` (V3). `waqf.certificateNumber` is a NOT NULL column, so
   * `findUniqueOrThrow` already returns `string`; the wider annotation was never accurate and it
   * made the RESTORE below un-typecheckable — `data: { certificateNumber: originalCertificate }`
   * against a non-nullable field. Not merely a nit: if the value ever were null, the restore would
   * fail at runtime and leave the SHARED seeded fixture holding `FAKE-1000001-AMENDED`, which
   * `seed.integration.test.ts` asserts absolutely. Nothing reported it because `tsconfig.json`
   * included `tests/**` and this directory is `test/`.
   */
  let originalCertificate: string;

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();

    const prisma = // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      await privilegedPrisma();
    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: WAQF_ID } });
    originalShart = JSON.stringify(waqf.shartAlWaqif);
    originalVersion = waqf.shartAlWaqifVersion;
    originalCertificate = waqf.certificateNumber;
    expect(originalVersion).toBe(1);

    // Committed test approval rows for the `withReservedMatter()` cases. Raw SQL: these are test
    // scaffolding, not domain acts, and routing them through the audited path would put fixture
    // scaffolding into a ten-year retention table.
    await prisma.$executeRawUnsafe(`DELETE FROM "approval_request" WHERE "id" LIKE 'appr-test-9%'`);
    // ⚠ `subjectId` is load-bearing as of migration 4: an approval opens the column it NAMES.
    // `APPROVAL.genuine` is therefore bound to `certificateNumber`, which is the column every
    // "the door opens" case below writes.
    await prisma.$executeRawUnsafe(
      insertApprovalSql({
        id: APPROVAL.genuine,
        subjectId: artifactSubject(WAQF_ID, 'certificateNumber'),
      }),
    );
    await prisma.$executeRawUnsafe(
      insertApprovalSql({
        id: APPROVAL.genuineDeed,
        subjectId: artifactSubject(WAQF_ID, 'deedNumber'),
      }),
    );
    // memo Q8 — the endowment's own retirement. Same artifact grammar as every other gated column.
    await prisma.$executeRawUnsafe(
      insertApprovalSql({
        id: APPROVAL.retirement,
        subjectId: artifactSubject(WAQF_ID, 'deletedAt'),
      }),
    );
    await prisma.$executeRawUnsafe(
      insertApprovalSql({
        id: APPROVAL.pending,
        status: 'PENDING',
        checkerId: null,
        subjectId: artifactSubject(WAQF_ID, 'certificateNumber') + ':pending',
      }),
    );
    await prisma.$executeRawUnsafe(
      insertApprovalSql({
        id: APPROVAL.wrongWaqf,
        waqfId: OTHER_WAQF_ID,
        subjectId: artifactSubject(OTHER_WAQF_ID, 'certificateNumber'),
      }),
    );
    await prisma.$executeRawUnsafe(
      insertApprovalSql({ id: APPROVAL.wrongType, type: 'DISTRIBUTION_RUN' }),
    );
    await prisma.$executeRawUnsafe(
      insertApprovalSql({ id: APPROVAL.softDeleted, deletedAt: true }),
    );
    // Genuine, APPROVED, right type, right endowment, maker ≠ checker — and about something else.
    await prisma.$executeRawUnsafe(
      insertApprovalSql({
        id: APPROVAL.wrongSubject,
        subjectId: 'istibdal-of-parcel-9 (بيانات وهمية)',
      }),
    );
  });

  afterAll(async () => {
    const prisma = await privilegedPrisma();
    await prisma.$executeRawUnsafe(`DELETE FROM "approval_request" WHERE "id" LIKE 'appr-test-9%'`);
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE SHART COLUMNS: REFUSED UNCONDITIONALLY (D-3)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('refuses a raw UPDATE of every write-once Shart column, with SQLSTATE 42501', async () => {
    for (const { column, statement } of SHART_COLUMN_STATEMENTS) {
      const error = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" ${statement} WHERE "id" = '${WAQF_ID}'`,
          'insufficient_privilege',
        ),
      );
      expect(error, `column ${column} was not guarded`).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).not.toContain(PROBE_NOT_BLOCKED);
      expect(error).toMatch(/immutable/);
      // The refusal must say "never", not "get an approval": the message is the only place a future
      // engineer learns that there is no approval to go and get.
      expect(error).toMatch(/may NEVER be amended|regardless of approvals/);
    }
  });

  it('names the offending column and the waqf in the refusal', async () => {
    const error = await runProbe(
      guardProbeSql(
        `UPDATE "waqf" SET "shartAlWaqif" = '{}'::jsonb WHERE "id" = '${WAQF_ID}'`,
        'insufficient_privilege',
      ),
    );
    expect(error).toMatch(/shartAlWaqif/);
    expect(error).toMatch(new RegExp(WAQF_ID));
  });

  it('refuses the same amendment through the Prisma client — the guard is not app politeness', async () => {
    const { makeSystemContext, withAudit } = await databaseModule();
    const ctx = makeSystemContext({
      actorId: 'user-test-harness',
      authorizedWaqfIds: [WAQF_ID],
      requestId: 'test-shart-orm',
    });

    // Not even a SYSTEM context that bypasses the scoping force-filter can get through: the
    // control is in the database, one layer below anything the application can decide.
    let raised: unknown = null;
    try {
      await withAudit(ctx, async (tx) => {
        await tx.waqf.update({ where: { id: WAQF_ID }, data: { shartAlWaqifVersion: 99 } });
      });
    } catch (error: unknown) {
      raised = error;
    }
    expect(raised, 'the ORM path was allowed to amend the Shart al-Waqif').not.toBeNull();
    expect(errorText(raised)).toMatch(/immutable/);
  });

  it('refuses when the GUC is present but empty — a blank approval is not an approval', async () => {
    const error = await runProbe(
      guardProbeSql(
        `PERFORM set_config('qmulate.reserved_matter_approval_id', '   ', true); ` +
          `UPDATE "waqf" SET "shartAlWaqifVersion" = 42 WHERE "id" = '${WAQF_ID}'`,
        'insufficient_privilege',
      ),
    );
    expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
  });

  /**
   * ⚠ THE HEADLINE ASSERTION OF D-3, AND THE ONE THAT CHANGED.
   *
   * Sprint 1 had a passing test named "ALLOWS the amendment when a reserved-matter approval id is
   * set in the same transaction". A GENUINE approval now fails too. There is no approval, and no
   * combination of approvals, that opens these four columns.
   */
  it.each(SHART_COLUMN_STATEMENTS)(
    'refuses $column even with a GENUINE APPROVED RESERVED_MATTER approval in force',
    async ({ statement }) => {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const error = await runProbe(
        guardProbeSql(
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.genuine}', true); ` +
            `UPDATE "waqf" ${statement} WHERE "id" = '${WAQF_ID}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/regardless of approvals|may NEVER be amended/);
    },
  );

  it('refuses a Shart amendment under session_replication_role = replica, WITH a genuine approval', async () => {
    // The Sprint-1 adversarial finding, combined with the strongest possible authority. One plain
    // `SET` used to skip every `tgenabled = 'O'` trigger; `ENABLE ALWAYS` closed that, and this
    // pins the combination rather than either half.
    const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
    const error = await runProbe(
      guardProbeSql(
        `SET LOCAL session_replication_role = 'replica'; ` +
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.genuine}', true); ` +
          `UPDATE "waqf" SET "shartAlWaqif" = '{"tampered":true}'::jsonb WHERE "id" = '${WAQF_ID}'`,
        'insufficient_privilege',
      ),
    );
    expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
  });

  it('keeps SHART_COLUMNS in parity with the columns the trigger actually guards', async () => {
    // TWO SIDES THAT MUST AGREE, WITH ONE READING THE OTHER. `SHART_COLUMNS` in
    // `src/reserved-matter.ts` refuses the write before the transaction opens; `qmulate_shart_guard()`
    // refuses it in the database. A column present in one and absent from the other is a hole in
    // whichever layer forgot it, so the test reads the trigger's SOURCE out of `pg_proc`.
    const prisma = await privilegedPrisma();
    const { SHART_COLUMNS } = await databaseModule();
    const [row] = await prisma.$queryRawUnsafe<{ src: string }[]>(
      `SELECT prosrc AS src FROM pg_proc WHERE proname = 'qmulate_shart_guard'`,
    );
    const source = row?.src ?? '';
    expect(source, 'qmulate_shart_guard() is not installed').not.toBe('');

    for (const column of SHART_COLUMNS) {
      expect(source, `${column} is in SHART_COLUMNS but the trigger does not guard it`).toContain(
        `"${column}"`,
      );
    }
    // And the trigger must not consult the GUC before raising on a Shart column: the unconditional
    // raise has to come FIRST in the function body.
    const shartRaise = source.indexOf('shart_al_waqif is immutable');
    const gucRead = source.indexOf('current_setting');
    expect(shartRaise).toBeGreaterThan(-1);
    expect(
      shartRaise,
      'the Shart raise must precede any GUC read, or an approval could reach it',
    ).toBeLessThan(gucRead);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1b. THE VERBS THE UPDATE TRIGGER NEVER SAW (C-03)
  //
  // ⚠ THIS SECTION EXISTS BECAUSE D-3 WAS FALSIFIED IN THE SHIPPED CODE, AND THE PROOF THAT IT
  // HELD HAD ALREADY BEEN REPORTED ONCE.
  //
  // `waqf_shart_immutable` is registered `BEFORE UPDATE` and nothing else, so the whole of
  // section 1 above was a proof about ONE VERB. A live `pg_trigger` census showed `waqf` was the
  // only guarded table with no DELETE coverage, while its siblings covered exactly the verbs it
  // missed (`document_retention_guard` DELETE, `document_no_truncate` TRUNCATE,
  // `audit_event_no_mutate` UPDATE OR DELETE). Reproduced on a seeded database from a raw
  // connection: `DELETE FROM "waqf" WHERE id = 'waqf-004'` succeeded, the row was re-INSERTed with
  // `shartAlWaqif = {"substituted": "ADVERSARY WROTE THIS"}` and `shartAlWaqifVersion = 99`,
  // `audit_event` moved 131 -> 131, and the whole G-1 chain still verified.
  //
  // MUTATION THAT RE-BREAKS THIS: drop `waqf_no_delete` (or `waqf_no_truncate`) from
  // `qmulate_apply_e2_guard_gaps()`, or create either without `ENABLE ALWAYS`.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-03 · the Shart survives DELETE and TRUNCATE, not only UPDATE', () => {
    it('refuses a raw DELETE of a seeded waqf, naming the retention rule and ADR-0006', async () => {
      const error = await runProbe(
        guardProbeSql(`DELETE FROM "waqf" WHERE "id" = '${WAQF_ID}'`, 'insufficient_privilege'),
      );
      expect(error, 'DELETE on "waqf" is the DELETE + re-INSERT Shart substitution').toContain(
        `${PROBE_BLOCKED}[42501]`,
      );
      expect(error).toMatch(/DELETE on "waqf" is refused/);
      expect(error).toMatch(/ADR-0006/);
      expect(error).toMatch(/deletedAt/);
    });

    it('refuses the DELETE even for a CHILDLESS waqf — the bare two-statement substitution', async () => {
      // On a waqf with children the attacker has to peel them first; on a childless one it is two
      // statements. The guard must not depend on the FK graph, so this creates a waqf with no
      // dependants inside a rolled-back transaction and proves the DELETE is still refused.
      const error = await runProbe(
        probeWithSetupSql(
          [
            `INSERT INTO "waqf" SELECT * FROM jsonb_populate_record(
               NULL::"waqf",
               (SELECT to_jsonb(w) || '{"id":"waqf-901","certificateNumber":"FAKE-9000901",
                                        "deedNumber":"FAKE-DEED-901"}'::jsonb
                  FROM "waqf" w WHERE w."id" = '${WAQF_ID}'))`,
          ],
          `DELETE FROM "waqf" WHERE "id" = 'waqf-901'`,
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "waqf" is refused/);
    });

    it('refuses TRUNCATE "waqf" CASCADE on its OWN account, not by accident of a cascade', async () => {
      // Before migration 4 this statement failed too — but with
      // `TRUNCATE on "document" is refused`, because it cascaded into the one table downstream
      // that happened to have a TRUNCATE guard. That is a property of the FK graph, not a control:
      // it stops being true the moment `document` loses its FK to `waqf`. The refusal must now
      // name `waqf` itself.
      const error = await runProbe(
        guardProbeSql(`TRUNCATE "waqf" CASCADE`, 'insufficient_privilege'),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error, 'the refusal came from a cascaded table, not from waqf').toMatch(
        /TRUNCATE on "waqf" is refused/,
      );
    });

    it('refuses TRUNCATE "waqf" without CASCADE as well — by whichever check gets there first', async () => {
      // Postgres validates the FK-referenced-tables rule BEFORE it fires `BEFORE TRUNCATE`
      // triggers, so the bare form dies at 0A000 rather than at the guard. Documented rather than
      // asserted away: the outcome that matters is that no form of TRUNCATE empties the table, and
      // the CASCADE form — the one an attacker would actually reach for — is refused by the guard.
      const prisma = await privilegedPrisma();
      let raised: unknown = null;
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE "waqf"`);
      } catch (error: unknown) {
        raised = error;
      }
      expect(raised, 'TRUNCATE "waqf" succeeded').not.toBeNull();
      expect(errorText(raised)).toMatch(/0A000|42501/);

      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "waqf"`,
      );
      expect(Number(row?.n ?? 0)).toBeGreaterThan(0);
    });

    it('refuses the whole DELETE-then-re-INSERT substitution, and the seeded Shart still stands', async () => {
      // THE ATTACK, END TO END, as one transaction: peel the children, delete the row, put it back
      // with a substituted Shart. The `DO` block aborts at the first refusal, so nothing is
      // rolled back that was not also refused — and the assertion afterwards reads the real row.
      //
      // ⚠ SINCE `00000000000006_e2_corpus_retention_guards` THE REFUSAL COMES ONE STATEMENT EARLIER,
      // and that is deliberate rather than a weakened test. The peel now dies on
      // `distribution_line_item_no_delete` (waqf-001's `dist-001` is EXECUTED), so the attacker
      // cannot even reach `DELETE FROM "waqf"`. The assertions are unchanged on purpose: what this
      // test claims is that the whole substitution is refused with 42501 and the seeded Shart still
      // stands — not WHICH guard says no first. `waqf_no_delete` is proven on its own account by the
      // two tests above, including on a CHILDLESS waqf where no peel is needed at all.
      const before = await (
        await privilegedPrisma()
      ).waqf.findUniqueOrThrow({ where: { id: WAQF_ID } });
      const error = await runProbe(
        guardProbeSql(
          [
            `DELETE FROM "distribution_line_item" WHERE "distributionId" IN`,
            `  (SELECT "id" FROM "distribution" WHERE "waqfId" = '${WAQF_ID}')`,
            `; DELETE FROM "distribution" WHERE "waqfId" = '${WAQF_ID}'`,
            `; DELETE FROM "waqf" WHERE "id" = '${WAQF_ID}'`,
            `; INSERT INTO "waqf" SELECT * FROM jsonb_populate_record(NULL::"waqf",`,
            `    '${JSON.stringify({ id: WAQF_ID }).replaceAll("'", "''")}'::jsonb)`,
          ].join('\n'),
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);

      const after = await (
        await privilegedPrisma()
      ).waqf.findUniqueOrThrow({ where: { id: WAQF_ID } });
      expect(JSON.stringify(after.shartAlWaqif)).toBe(JSON.stringify(before.shartAlWaqif));
      expect(after.shartAlWaqifVersion).toBe(before.shartAlWaqifVersion);
    });

    it('refuses DELETE and TRUNCATE under session_replication_role = replica', async () => {
      // `ENABLE ALWAYS`, pinned. A guard added without it is one plain `SET` from irrelevant, which
      // is exactly how gate G-1 fell during Sprint-1 review.
      for (const statement of [
        `DELETE FROM "waqf" WHERE "id" = '${WAQF_ID}'`,
        `TRUNCATE "waqf" CASCADE`,
      ]) {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ${statement}`,
            'insufficient_privilege',
          ),
        );
        expect(error, `${statement} was skipped under the replica role`).toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
      }
    });

    it('makes the SOFT retirement the refusal points at a RESERVED MATTER (memo Q8)', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ INVERTED, NOT DELETED — the `asset` precedent (S4/E3 round 2, AV-4) one table over. This
      // test used to read "still allows the SOFT retirement the refusal points at" and PASS, and
      // that passing was the defect the V-E3 register carried as A3: `waqf_no_delete` refuses the
      // hard DELETE and names `deletedAt` as the only legal retirement — and that path had NOTHING
      // on it. MEASURED as `qmulate_app`, no approval in session, rolled back:
      //
      //   BEFORE  ⚠ COMMITS  UPDATE "waqf" SET "deletedAt" = now()   (and the CLEAR right after it)
      //   AFTER     REFUSED  42501 … 'changing "deletedAt" (…) is a RESERVED MATTER'
      //
      // S4 deliberately did NOT ship this guard (migration 16's header says so out loud), because
      // whether retiring a PERPETUAL endowment is always a reserved matter is a scope question. It
      // was put to the product owner and ANSWERED — S4 owner-decision memo Q8, 2026-08-17: *"Setting
      // (and clearing) `waqf.deletedAt` on a live endowment requires an approved reserved-matter
      // request."* So unlike the `asset` sibling, this one carries NO `TODO(surface)`: it is the
      // ruling, not engineering's fail-safe reading.
      //
      // ⚠ THE LEGAL PATH IS STILL OPEN AND IS ASSERTED BELOW, because a guard that leaves no way to
      // retire an endowment would be an outage. And `waqf_no_delete`'s own message still says "Set
      // `deletedAt` instead" without mentioning the approval — that wording is migration 4's and is
      // left as it is, exactly as migrations 14/15 left `asset_no_delete`'s: the second refusal is
      // the one that explains what the caller now needs, and re-defining a shared retention function
      // from a later migration to fix a sentence is a wider blast radius than the sentence is worth.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const refused = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" SET "deletedAt" = now() WHERE "id" = '${WAQF_ID}'`,
          'insufficient_privilege',
        ),
      );
      expect(refused, 'an endowment was soft-retired with no reserved matter').toContain(
        `${PROBE_BLOCKED}[42501]`,
      );
      expect(refused).toMatch(/RESERVED MATTER/);
      expect(refused).toMatch(new RegExp(`waqf:${WAQF_ID}:deletedAt`));
      expect(refused).toMatch(/PRODUCT OWNER, 2026-08-17/);
      // It is a RULING, so the refusal must NOT hedge the way the asset sibling does.
      expect(refused).not.toMatch(/TODO\(surface\)/);

      // …and the retirement with an approval that names it COMMITS. `APPROVAL.genuine` names
      // `certificateNumber`, so it must NOT be a key for this act — that is the C-14 bind — while a
      // purpose-built one is. Both are asserted, in one place, so "refused" cannot silently mean
      // "refused for everybody".
      const wrongArtifact = await probeWithApprovalFor(
        APPROVAL.genuine,
        `UPDATE "waqf" SET "deletedAt" = now() WHERE "id" = '${WAQF_ID}'`,
      );
      expect(wrongArtifact).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(wrongArtifact).toMatch(/was approved for subject/);

      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const permitted = await runProbe(
        rollbackProbeSql([
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.retirement}', true)`,
          `UPDATE "waqf" SET "deletedAt" = now() WHERE "id" = '${WAQF_ID}'`,
        ]),
      );
      expect(
        permitted,
        'the retirement is refused even WITH the approval that names it — that is an outage',
      ).toContain(PROBE_SUCCEEDED);

      // Nothing committed: the endowment is still live.
      const after = await (
        await privilegedPrisma()
      ).waqf.findUniqueOrThrow({
        where: { id: WAQF_ID },
      });
      expect(after.deletedAt).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. THE OTHER RESERVED-MATTER COLUMNS: GATED, AND THE GATE IS NOW VERIFIED (MP-27)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-27 · qmulate_shart_guard() verifies the approval, driven raw', () => {
    const guardedColumnUpdate = `UPDATE "waqf" SET "certificateNumber" = 'FAKE-9999999' WHERE "id" = '${WAQF_ID}'`;

    async function probeWithApproval(approvalId: string): Promise<string> {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      return runProbe(
        guardProbeSql(
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${approvalId}', true); ` +
            guardedColumnUpdate,
          'insufficient_privilege',
        ),
      );
    }

    it('refuses a FABRICATED approval id — the Sprint-1 behaviour, now closed', async () => {
      // This is the case that mattered most: Sprint 1's guard tested only
      // `IF approval IS NULL OR btrim(approval) = ''`, so literally any string opened the door.
      const error = await probeWithApproval('appr-does-not-exist-at-all');
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/does not exist/);
      expect(error).toMatch(/fabricated id is not an approval/);
    });

    it('refuses a PENDING approval', async () => {
      const error = await probeWithApproval(APPROVAL.pending);
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/is "PENDING", not "APPROVED"|PENDING/);
    });

    it('refuses an approval of the WRONG TYPE', async () => {
      const error = await probeWithApproval(APPROVAL.wrongType);
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/not RESERVED_MATTER|DISTRIBUTION_RUN/);
    });

    it('refuses an approval for a DIFFERENT ENDOWMENT — authority is per waqf', async () => {
      const error = await probeWithApproval(APPROVAL.wrongWaqf);
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/belongs to waqf/);
      expect(error).toMatch(/per endowment/);
    });

    it('refuses a SOFT-DELETED approval', async () => {
      const error = await probeWithApproval(APPROVAL.softDeleted);
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/soft-deleted/);
    });

    /**
     * checkerId = makerId, and checkerId IS NULL.
     *
     * Both are UNREPRESENTABLE while the E2 CHECK constraints stand, so the only way to reach the
     * trigger's own copy of these conditions is to drop the constraint for the duration of one
     * transaction — which is also precisely the scenario the duplication exists for: a future
     * migration, or an operator with a psql prompt, removing a CHECK. Postgres DDL is transactional,
     * so the drop is rolled back with everything else.
     */
    it('refuses a SELF-APPROVED approval even with the checker≠maker CHECK removed', async () => {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const selfApprovedId = 'appr-test-9101';
      // THE SMALL-TEAM CASE §10 §4.2 NAMES EXPLICITLY: one person holding both seats. The maker AND
      // checker is `CHECKER_ID` — a genuine NAZIR — so the `approval_request_authority` trigger is
      // satisfied and the ONLY thing standing between this row and the Shart guard is the dropped
      // CHECK. That is what isolates the guard's own copy of the condition.
      const error = await runProbe(
        probeWithSetupSql(
          [
            `ALTER TABLE "approval_request" DROP CONSTRAINT "approval_request_checker_ne_maker"`,
            insertApprovalSql({ id: selfApprovedId, makerId: CHECKER_ID, checkerId: CHECKER_ID }),
            `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${selfApprovedId}', true)`,
          ],
          guardedColumnUpdate,
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/self-approved/);
    });

    it('refuses an approval with NO CHECKER even with the decided-requires-checker CHECK removed', async () => {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const noCheckerId = 'appr-test-9102';
      const error = await runProbe(
        probeWithSetupSql(
          [
            `ALTER TABLE "approval_request" DROP CONSTRAINT "approval_request_decided_requires_checker"`,
            `ALTER TABLE "approval_request" DISABLE TRIGGER approval_request_authority`,
            insertApprovalSql({ id: noCheckerId, checkerId: null }),
            `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${noCheckerId}', true)`,
          ],
          guardedColumnUpdate,
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/no checkerId/);
    });

    it('ALLOWS the guarded column against a GENUINE approval — the door is not welded shut', async () => {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      // `PROBE_SUCCEEDED` is only reachable if the UPDATE did not raise, and the probe then rolls
      // back — so this proves the hatch opens AND leaves the certificate number untouched.
      const error = await runProbe(
        rollbackProbeSql([
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.genuine}', true)`,
          guardedColumnUpdate,
        ]),
      );
      expect(error).toContain(PROBE_SUCCEEDED);
      expect(error).not.toMatch(/immutable|reserved-matter-only/);
    });

    it('refuses the guarded column with NO approval at all (D-5: still reserved-matter-only)', async () => {
      for (const column of ['certificateNumber', 'deedNumber']) {
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "${column}" = 'FAKE-9999999' WHERE "id" = '${WAQF_ID}'`,
            'insufficient_privilege',
          ),
        );
        expect(error, `${column} is no longer guarded`).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(new RegExp(column));
        expect(error).toMatch(/no approval id was supplied/);
      }
    });

    // ═════════════════════════════════════════════════════════════════════════════════════
    // C-14 · AN APPROVAL BINDS TO ITS ARTIFACT, NOT MERELY TO ITS ENDOWMENT
    //
    // MP-27 verified six things about a reserved-matter approval and never that it was an
    // approval OF THE THING BEING CHANGED. Reproduced from a raw connection on a seeded
    // database: a genuine APPROVED RESERVED_MATTER on waqf-001 with
    // `subjectId = 'SOME-UNRELATED-SUBJECT-istibdal-of-parcel-9'` and a real NAZIR checker
    // permitted `UPDATE "waqf" SET "deedNumber" = 'PROBE-REPOINTED-DEED'`. The pool of usable
    // keys is not exotic: `packages/api/src/routers/settings.ts` sets
    // `SETTING_CHANGE_APPROVAL_TYPE = 'RESERVED_MATTER'`, so every routine settings-change
    // approval was one. The approver signed one artifact and authorised another.
    //
    // MUTATION THAT RE-BREAKS THIS: drop the `subjectId` branch from
    // `qmulate_approval_defect()`, or pass a constant instead of
    // `'waqf:' || OLD."id" || ':' || gated_column` from `qmulate_shart_guard()`.
    // ═════════════════════════════════════════════════════════════════════════════════════

    it('refuses an approval that is genuine in every way EXCEPT its subject', async () => {
      const error = await probeWithApproval(APPROVAL.wrongSubject);
      expect(
        error,
        'an approved istibdal is a working key for re-pointing the endowment at another deed',
      ).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/was approved for subject/);
      expect(error).toMatch(/binds to its artifact/);
      // The refusal must say what subject WOULD work, or the next engineer widens the matcher.
      expect(error).toMatch(/waqf:waqf-001:certificateNumber/);
    });

    it('refuses an approval bound to the OTHER guarded column of the SAME waqf', async () => {
      // The finest-grained version of the same defect, and the one a coarser fix would miss: this
      // approval is genuine, APPROVED, RESERVED_MATTER, on waqf-001 — and it is about `deedNumber`.
      const error = await probeWithApproval(APPROVAL.genuineDeed);
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/was approved for subject/);
    });

    it('ALLOWS the column its OWN approval names — the binding is not paralysis', async () => {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const error = await runProbe(
        rollbackProbeSql([
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.genuineDeed}', true)`,
          `UPDATE "waqf" SET "deedNumber" = 'FAKE-DEED-AMENDED' WHERE "id" = '${WAQF_ID}'`,
        ]),
      );
      expect(error).toContain(PROBE_SUCCEEDED);
    });

    it('does not let ONE approval carry a SECOND column through with it', async () => {
      // Migration 3 used `ELSIF`, so a statement changing certificateNumber AND deedNumber was
      // verified against the certificate's approval only and the deed change rode along. Both
      // columns are now checked independently, so this must be refused for the UNAPPROVED one.
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const error = await runProbe(
        guardProbeSql(
          `PERFORM set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.genuine}', true); ` +
            `UPDATE "waqf" SET "certificateNumber" = 'FAKE-9999998', "deedNumber" = 'FAKE-RIDE-ALONG' ` +
            `WHERE "id" = '${WAQF_ID}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/deedNumber/);
    });

    it('leaves NO subject-blind overload of the helper installed', async () => {
      // TWO SIDES THAT MUST AGREE, WITH ONE READING THE OTHER. Leaving migration 3's
      // `qmulate_reserved_matter_defect(text, text)` beside the three-argument version would leave
      // a second door with the old lock: the next guard written would reach for the shorter
      // signature and C-14 would come back under a new name.
      const prisma = await privilegedPrisma();
      const [row] = await prisma.$queryRawUnsafe<
        { subject_blind: boolean; subject_bound: boolean }[]
      >(
        `SELECT to_regprocedure('qmulate_reserved_matter_defect(text,text)')      IS NOT NULL AS subject_blind,
                to_regprocedure('qmulate_reserved_matter_defect(text,text,text)') IS NOT NULL AS subject_bound`,
      );
      expect(row?.subject_bound, 'the subject-bound helper is not installed').toBe(true);
      expect(row?.subject_blind, 'the subject-BLIND overload is still callable').toBe(false);
    });

    it('does not let the approval leak out of its transaction', async () => {
      const { RESERVED_MATTER_APPROVAL_GUC } = await databaseModule();
      const prisma = await privilegedPrisma();

      // Two separate statements are two separate implicit transactions — and `set_config(..., true)`
      // is transaction-local, so the second one starts locked again. This is what stops a pooled
      // connection from carrying one request's approval into the next request's write.
      await prisma.$executeRawUnsafe(
        `SELECT set_config('${RESERVED_MATTER_APPROVAL_GUC}', '${APPROVAL.genuine}', true)`,
      );
      const error = await runProbe(guardProbeSql(guardedColumnUpdate, 'insufficient_privilege'));
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. withReservedMatter() — the authorization leg of A11 (MP-28)
  //
  // Sprint 1 asserted `'withReservedMatter' in database === false` with a note to delete the
  // assertion once the helper shipped. It has shipped; these are the tests that replace it.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-28 · withReservedMatter()', () => {
    /** A real USER caller with a grant on waqf-001 — not a bypassed system context. */
    async function callerContext(waqfIds: readonly string[] = [WAQF_ID]) {
      return {
        actorId: 'user-nazir-001',
        actorType: 'USER' as const,
        authorizedWaqfIds: [...waqfIds],
        requestId: `test-reserved-matter-${waqfIds.join('-')}`,
        reason: 'MP-28 reserved-matter probe',
      };
    }

    it('exists, and is reachable both from the barrel and from ./reserved-matter', async () => {
      const database = await databaseModule();
      expect('withReservedMatter' in database).toBe(true);
      expect('setReservedMatterApproval' in database).toBe(true);
      // The exports-map entry `client.ts` used to CLAIM existed. Now it does, so this import works.
      const direct = await import('../src/reserved-matter.js');
      expect(direct.withReservedMatter).toBe(database.withReservedMatter);
      expect(direct.approvalFingerprint).toBe(database.approvalFingerprint);
    });

    // ⚠ EVERY ROW IS A 4-TUPLE, `undefined` INCLUDED, AND THAT IS NOT COSMETIC (V3). Five rows had
    // three elements and one had four, so `as const` produced a UNION of tuple arities and the
    // four-parameter callback was not assignable to it (TS2345). It happened to run — vitest spreads
    // whatever the row holds — but the compiler could not check a single one of these tuples, and
    // `tsconfig.json` typechecked `tests/**` while the directory is `test/`, so nobody was told.
    it.each([
      ['a PENDING approval', APPROVAL.pending, /not "APPROVED"|PENDING/, undefined],
      [
        'an approval of the wrong type',
        APPROVAL.wrongType,
        /not RESERVED_MATTER|DISTRIBUTION_RUN/,
        undefined,
      ],
      // The caller is given a grant on BOTH endowments for this one, so the approval is VISIBLE and
      // the wrong-endowment branch is the thing that refuses it. With a waqf-001-only context the
      // scoped read returns nothing and the refusal would be "does not exist" — correct, but a
      // different branch, and it would leave the per-endowment check untested. (That narrower case is
      // its own test below.)
      [
        'an approval for another endowment',
        APPROVAL.wrongWaqf,
        /belongs to waqf/,
        [WAQF_ID, OTHER_WAQF_ID],
      ],
      ['a soft-deleted approval', APPROVAL.softDeleted, /soft-deleted/, undefined],
      ['a fabricated id', 'appr-nope-9999', /does not exist/, undefined],
      ['an empty id', '', /empty approval id/, undefined],
    ] as const)('refuses %s and writes nothing', async (_label, approvalId, pattern, waqfIds) => {
      const { ReservedMatterNotApprovedError, createPrismaClient } = await databaseModule();
      const { withReservedMatter } = await import('../src/reserved-matter.js');
      const ctx = await callerContext(waqfIds ?? [WAQF_ID]);
      const db = createPrismaClient(ctx);

      let ran = false;
      const raised = await captureError(() =>
        withReservedMatter(db, ctx, approvalId, WAQF_ID, async (tx) => {
          ran = true;
          await tx.waqf.update({
            where: { id: WAQF_ID },
            data: { certificateNumber: 'FAKE-SHOULD-NEVER-LAND' },
          });
        }),
      );

      expect(raised).toBeInstanceOf(ReservedMatterNotApprovedError);
      expect(errorText(raised), 'the refusal does not say WHICH condition failed').toMatch(pattern);
      // The callback never running is the property that makes a refusal free: no transaction was
      // opened, so there is no rolled-back audit event and no partial write to reason about.
      expect(ran, 'the callback ran despite the approval being refused').toBe(false);

      const prisma = await privilegedPrisma();
      const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: WAQF_ID } });
      expect(waqf.certificateNumber).toBe(originalCertificate);
    });

    it('refuses an approval the caller cannot SEE — the force-filter applies to the door too', async () => {
      // The approval genuinely exists and is genuinely APPROVED, but it belongs to waqf-002 and this
      // caller holds no grant there, so the scoped read returns nothing. "Not yours" and "does not
      // exist" are the same refusal, deliberately: distinguishing them is an existence oracle.
      const { ReservedMatterNotApprovedError, createPrismaClient } = await databaseModule();
      const { withReservedMatter } = await import('../src/reserved-matter.js');
      const ctx = await callerContext([WAQF_ID]);
      const db = createPrismaClient(ctx);

      await expect(
        withReservedMatter(db, ctx, APPROVAL.wrongWaqf, OTHER_WAQF_ID, async () => undefined),
      ).rejects.toBeInstanceOf(ReservedMatterNotApprovedError);
    });

    /** D-3, THE CODE-PATH HALF: no `data` payload naming a Shart column ever reaches Postgres. */
    it.each(['shartAlWaqif', 'shartAlWaqifVersion', 'shartAlWaqifSetAt', 'shartAlWaqifSetAtHijri'])(
      'ALWAYS throws for %s, even with the genuine approval (D-3)',
      async (column) => {
        const { ShartAmendmentForbiddenError, createPrismaClient } = await databaseModule();
        const { withReservedMatter } = await import('../src/reserved-matter.js');
        const ctx = await callerContext();
        const db = createPrismaClient(ctx);

        const raised = await captureError(() =>
          withReservedMatter(db, ctx, APPROVAL.genuine, WAQF_ID, async (tx) => {
            await tx.waqf.update({
              where: { id: WAQF_ID },
              data: { [column]: column === 'shartAlWaqifVersion' ? 99 : new Date() } as never,
            });
          }),
        );
        expect(raised).toBeInstanceOf(ShartAmendmentForbiddenError);
        expect(errorText(raised)).toMatch(/regardless of approvals/);
        expect(errorText(raised)).toMatch(new RegExp(column));
      },
    );

    it('SUCCEEDS on a guarded non-Shart column, and stamps the approval into the audit event', async () => {
      const { createPrismaClient } = await databaseModule();
      const { withReservedMatter } = await import('../src/reserved-matter.js');
      const prisma = await privilegedPrisma();
      const ctx = await callerContext();
      const db = createPrismaClient(ctx);

      const amended = 'FAKE-1000001-AMENDED';
      const result = await withReservedMatter(db, ctx, APPROVAL.genuine, WAQF_ID, async (tx) => {
        const row = await tx.waqf.update({
          where: { id: WAQF_ID },
          data: { certificateNumber: amended },
        });
        return row.certificateNumber;
      });
      expect(result).toBe(amended);

      // THE AUTHORITY IS IN THE TRAIL. An authority-gated write whose authority is not recorded is
      // not auditable, which is the whole point of gating it.
      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { entityType: 'Waqf', entityId: WAQF_ID, actorId: 'user-nazir-001' },
        orderBy: { id: 'desc' },
      });
      const context = event.context as Record<string, unknown>;
      expect(context.reservedMatterApprovalId).toBe(APPROVAL.genuine);
      expect(event.action).toBe('UPDATE');
      expect((event.after as Record<string, unknown>).certificateNumber).toBe(amended);

      // Restore, through the same door — which also proves the door is re-usable and that the
      // restoration is itself an audited, authority-gated act rather than a quiet fix-up.
      await withReservedMatter(db, ctx, APPROVAL.genuine, WAQF_ID, async (tx) => {
        await tx.waqf.update({
          where: { id: WAQF_ID },
          data: { certificateNumber: originalCertificate },
        });
      });
      const restored = await prisma.waqf.findUniqueOrThrow({ where: { id: WAQF_ID } });
      expect(restored.certificateNumber).toBe(originalCertificate);
    });

    it('does not leave the GUC set after the transaction', async () => {
      const { createPrismaClient } = await databaseModule();
      const { withReservedMatter } = await import('../src/reserved-matter.js');
      const ctx = await callerContext();
      const db = createPrismaClient(ctx);

      await withReservedMatter(db, ctx, APPROVAL.genuine, WAQF_ID, async () => undefined);

      // A pooled connection must not carry one request's approval into the next request's write.
      const error = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" SET "deedNumber" = 'FAKE-LEAKED' WHERE "id" = '${WAQF_ID}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. The guard is narrow: ordinary corrections still work
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('leaves ordinary columns editable', async () => {
    const error = await runProbe(
      rollbackProbeSql([`UPDATE "waqf" SET "fiscalYearEnd" = '06-30' WHERE "id" = '${WAQF_ID}'`]),
    );
    expect(error).toContain(PROBE_SUCCEEDED);
  });

  it.todo(
    'The reserved-matter WORKFLOW (maker-checker request lifecycle, competent-authority approval ' +
      'recorded, notice obligations) is E11/S12. E2 ships the door, the verification and the ' +
      'database gate — not the workflow that produces an APPROVED RESERVED_MATTER in the first place.',
  );

  it.todo(
    'CLOSED 2026-07-29 (BINDING RULE 1 vs D-3): the product owner restated the decision without ' +
      'hedging — "the shart cant be changed" — and CLAUDE.md binding rule 1 was AMENDED to match, so ' +
      'the rule no longer contemplates an amendment and nothing here is stricter than it. E11/S12 ' +
      'must NOT build a Shart-amendment path: not a disabled one, not a configurable one, not one ' +
      'behind more approvals. A change directed by an authority or a court is a SUPERSEDING ' +
      'INSTRUMENT recorded as a new record. What remains for counsel, not for code: whether Saudi ' +
      'law permits any modification in narrow cases — which cannot loosen this without a new ' +
      'product decision. See ADR-0006.',
  );

  // ── nothing above changed anything ─────────────────────────────────────────────────────────

  it('leaves the seeded Shart al-Waqif byte-identical', async () => {
    const prisma = await privilegedPrisma();
    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: WAQF_ID } });
    expect(JSON.stringify(waqf.shartAlWaqif)).toBe(originalShart);
    expect(waqf.shartAlWaqifVersion).toBe(originalVersion);
    expect(waqf.fiscalYearEnd).toBe('12-31');
    expect(waqf.certificateNumber).toBe('FAKE-1000001');
  });
});

/** Runs `fn` and returns whatever it threw, or `null`. Keeps the `try` out of every assertion. */
async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error: unknown) {
    return error;
  }
}
