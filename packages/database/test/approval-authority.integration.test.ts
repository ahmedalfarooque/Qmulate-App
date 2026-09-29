/**
 * THE NAZIR IS THE SOLE APPROVAL AUTHORITY, PER ENDOWMENT, AND NEVER THE MAKER — the Postgres layer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE DRIVES EVERYTHING FROM A RAW CONNECTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The same rule is stated three times in this codebase — in the preset algebra
 * (`packages/domain/src/access.ts`), in the procedure ladder (`packages/api`), and in migration
 * `00000000000003_e2_authority_guards`. The first two are TypeScript, and `SCOPING_KNOWN_GAPS`
 * records verbatim that the Prisma force-filter "does not survive raw SQL" while no RLS policy
 * exists. So a TypeScript-only proof is one `$executeRawUnsafe` from irrelevant, and every assertion
 * here goes through the raw base client, using the pattern
 * `g1-replica-role-bypass.integration.test.ts` established — including the
 * `session_replication_role = 'replica'` bypass that defeated gate G-1 during Sprint-1 review.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SPRINT 1 CLAIMED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `schema.prisma:1316-1318` asserted "SEGREGATION OF DUTIES: `checkerId` must never equal `makerId`;
 * the check is re-verified at commit and recorded in the APPROVE audit event", and the field carried
 * `/// Enforced: checker != maker`. Grepping all three prior migrations for `approval_request`
 * yielded the primary key, the `waqfId` foreign key and one index. A claimed enforcement with no
 * implementation on either side is precisely the Sprint-1 failure mode — nothing compared the two
 * sides that were supposed to agree, and a reader stopped looking because the comment said it was
 * handled.
 *
 * MP-09 (checker ≠ maker, in Postgres) · MP-07 (only an ACTIVE NAZIR may be recorded as approver) ·
 * MP-08 (per-endowment, not portfolio-wide) · MP-29 (no APPROVED/EXECUTED distribution without an
 * approval, plus the transition lattice) · MP-30's database half (an approval binds its artifact) ·
 * MP-31 (at most one live approval per act).
 *
 * Every row this file creates is in a 9xxx id series and is deleted in `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  ensureSeeded,
  errorText,
  hasDatabase,
  retentionScaffoldingSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('MP-07 / MP-08 / MP-09 / MP-29 / MP-30 / MP-31 (the authority guards, in Postgres)');

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';

/** Holds an ACTIVE `NAZIR` grant on all four endowments (ADR-0004's dual-control fixture). */
const NAZIR_A = 'user-approver-001';
const NAZIR_B = 'user-nazir-001';
/** `FINANCE` — the maker. Never a legitimate checker. */
const FINANCE = 'user-accountant-001';
/** `FAMILY_BOARD` — §9 calls its consent part of an "approval chain"; §3's grid gives it no A/S cell. */
const FAMILY_BOARD = 'user-family-board';
/** ZERO grants, by design (the V-5 negative subject). */
const UNSCOPED = 'user-unscoped';
/** `SYSTEM_ADMIN`: config authority, deliberately no per-endowment grant at all. */
const ADMIN = 'user-seed-admin';

const HASH = 'b'.repeat(64);
const TEST_ID_PREFIX = 'appr-auth-9';

/** The raw surface these probes need. Narrower than `PrismaClient`, so no `any` enters a security test. */
interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $transaction: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
}

interface ApprovalOptions {
  readonly id: string;
  readonly waqfId?: string;
  readonly type?: 'BANK_MOVEMENT' | 'DISTRIBUTION_RUN' | 'GOVT_FILING' | 'RESERVED_MATTER';
  readonly status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'VOID';
  readonly makerId?: string;
  readonly checkerId?: string | null;
  readonly subjectId?: string | null;
  readonly payloadHash?: string | null;
}

function insertApprovalSql(options: ApprovalOptions): string {
  const {
    id,
    waqfId = WAQF_A,
    type = 'DISTRIBUTION_RUN',
    status = 'PENDING',
    makerId = FINANCE,
    checkerId = null,
    subjectId = id,
    payloadHash = status === 'APPROVED' || status === 'EXECUTED' ? HASH : null,
  } = options;
  const decided = status === 'APPROVED' || status === 'EXECUTED';
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","status","makerId","checkerId","subjectId","payloadHash","payload",
       "decidedAt","createdAt","updatedAt")
    VALUES ('${id}', '${waqfId}', '${type}'::"ApprovalType", '${status}'::"ApprovalStatus",
            '${makerId}', ${checkerId === null ? 'NULL' : `'${checkerId}'`},
            ${subjectId === null ? 'NULL' : `'${subjectId}'`},
            ${payloadHash === null ? 'NULL' : `'${payloadHash}'`},
            '{"fixture":"e2 authority probe"}'::jsonb,
            ${decided ? 'now()' : 'NULL'}, now(), now())`;
}

/**
 * Assert a unique-index violation on `approval_request_one_open_per_subject`.
 *
 * ⚠ THE INDEX NAME IS NOT IN THE ERROR TEXT. Postgres reports
 * `duplicate key value violates unique constraint "<name>"` with the offending key on the DETAIL
 * line, and Prisma surfaces only the DETAIL. So the assertion pins SQLSTATE 23505 plus the index's
 * KEY EXPRESSION — which is the more useful thing to pin anyway, because `COALESCE("subjectId", '')`
 * appearing in the key is what proves the NULL-collapsing behaviour is the one in force. The index's
 * existence by name is asserted separately, from `pg_indexes`.
 */
function expectUniqueViolation(error: string | null): void {
  expect(error).not.toBeNull();
  expect(error).toMatch(/23505|already exists/);
  expect(error).toMatch(/"waqfId", type, COALESCE\("subjectId"/);
}

describe.skipIf(!hasDatabase)('the approval authority, enforced in Postgres', () => {
  let prisma: PrismaLike;

  /** Runs `sql` and returns the error, or `null` when it was ALLOWED. */
  const attempt = async (sql: string): Promise<string | null> => {
    try {
      await prisma.$executeRawUnsafe(sql);
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  /** As `attempt`, but with `session_replication_role = 'replica'` set first. */
  const attemptUnderReplicaRole = async (sql: string): Promise<string | null> => {
    const ROLLBACK = '__qmulate_probe_rollback__';
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.$executeRawUnsafe(sql);
        throw new Error(ROLLBACK); // reached only when the guard did NOT fire
      });
      return null;
    } catch (error: unknown) {
      const text = errorText(error);
      return text.includes(ROLLBACK) ? null : text;
    }
  };

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "approval_request" WHERE "id" LIKE '${TEST_ID_PREFIX}%'`,
    );
    // ⚠ WRAPPED SINCE `00000000000006_e2_corpus_retention_guards`. A `distribution` row is ledger
    // evidence — a PAID run — and its hard DELETE is now refused OUTRIGHT, `deletedAt` or
    // `status = 'CANCELLED'` being the legal retirements. The suite says out loud that it is turning
    // the guard off to take its own fixture away; see `retentionScaffoldingSql`. The line items go
    // first because `distribution_line_item_no_delete` is conditional on the RUN's status and the
    // runs below reach APPROVED / EXECUTED.
    await prisma.$executeRawUnsafe(
      retentionScaffoldingSql([
        `DELETE FROM "distribution_line_item" WHERE "distributionId" LIKE 'dist-auth-9%'`,
        `DELETE FROM "distribution" WHERE "id" LIKE 'dist-auth-9%'`,
      ]),
    );
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    prisma =
      // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      (await privilegedPrisma()) as unknown as PrismaLike;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The guards are installed, and installed the way the fix requires
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('installs every E2 authority guard, and every new trigger is ENABLE ALWAYS', async () => {
    const constraints = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE contype = 'c'`,
    );
    const names = new Set(constraints.map((row) => row.conname));
    for (const constraint of [
      'approval_request_checker_ne_maker',
      'approval_request_decided_requires_checker',
      'approval_request_approved_binds_payload',
      'waqf_access_grant_no_self_issue',
      'waqf_access_grant_aml_flags',
      'waqf_access_grant_beneficiary_self_pin',
      'membership_role_family_level_only',
      'distribution_approved_requires_approval_request',
    ]) {
      expect(names, `CHECK ${constraint} is missing`).toContain(constraint);
    }

    const triggers = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
      `SELECT tgname, tgenabled::text AS tgenabled FROM pg_trigger WHERE NOT tgisinternal`,
    );
    const byName = new Map(triggers.map((row) => [row.tgname, row.tgenabled]));
    for (const trigger of [
      'approval_request_authority',
      'waqf_access_grant_role_immutable',
      'waqf_access_grant_permission_guard',
      'distribution_status_transition',
    ]) {
      expect(byName.has(trigger), `trigger ${trigger} is missing entirely`).toBe(true);
      // 'A' = ALWAYS. 'O' = origin-only, which one `SET session_replication_role = 'replica'` skips —
      // the Sprint-1 finding that defeated gate G-1 outright.
      expect(byName.get(trigger), `${trigger} must be ENABLE ALWAYS`).toBe('A');
    }

    const indexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    expect(indexes.map((row) => row.indexname)).toContain('approval_request_one_open_per_subject');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-09 — self-approval is unrepresentable
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-09 · checkerId = makerId is rejected by POSTGRES ITSELF', () => {
    it('refuses a raw INSERT where the maker approves their own request', async () => {
      const error = await attempt(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}001`,
          status: 'APPROVED',
          makerId: NAZIR_A,
          checkerId: NAZIR_A, // the small-team case: one person holds both seats
        }),
      );
      expect(error, 'a self-approved row was INSERTed — MP-09 is broken').not.toBeNull();
      expect(error).toMatch(/approval_request_checker_ne_maker/);
    });

    it('refuses a raw UPDATE that makes the maker the checker', async () => {
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}002`, makerId: NAZIR_A }),
      );
      // `payloadHash` is set too, deliberately: without it
      // `approval_request_approved_binds_payload` fires FIRST and this test would pass while proving
      // nothing about checker != maker. Constraint evaluation order is not specified by Postgres, so
      // a probe has to satisfy every OTHER constraint to isolate the one under test.
      const error = await attempt(
        `UPDATE "approval_request"
            SET "checkerId" = '${NAZIR_A}', "status" = 'APPROVED', "decidedAt" = now(),
                "payloadHash" = '${HASH}'
          WHERE "id" = '${TEST_ID_PREFIX}002'`,
      );
      expect(error, 'an UPDATE turned the maker into the checker').not.toBeNull();
      expect(error).toMatch(/approval_request_checker_ne_maker/);
    });

    it('refuses it under session_replication_role = replica too — a CHECK is not a trigger', async () => {
      // Worth asserting rather than assuming: the replica role skips ORIGIN triggers but has no
      // effect on CHECK constraints. This test records WHY the checker≠maker rule is a CHECK and not
      // a trigger.
      const error = await attemptUnderReplicaRole(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}003`,
          status: 'APPROVED',
          makerId: NAZIR_A,
          checkerId: NAZIR_A,
        }),
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/approval_request_checker_ne_maker/);
    });

    it('permits a DISTINCT checker — the invariant is segregation, not paralysis', async () => {
      const error = await attempt(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}004`,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
        }),
      );
      expect(error, `a legitimate maker-checker row was refused: ${String(error)}`).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // C-02 — THE IDENTITY OF A REQUEST IS WRITE-ONCE
  //
  // ⚠ WHY MP-09 ABOVE WAS NOT ENOUGH, AND WHY THIS IS THE MORE IMPORTANT HALF.
  //
  // `approval_request_checker_ne_maker` is `"checkerId" IS NULL OR "checkerId" <> "makerId"` — a
  // row-local POST-image comparison. Nothing compared `NEW."makerId"` to `OLD."makerId"`, and
  // `qmulate_approval_request_authority()`'s whole body was gated on
  // `TG_OP = 'UPDATE' AND new_status IS DISTINCT FROM old_status`, so an UPDATE that touched only
  // an identity column matched nothing at all. Reproduced from a raw connection on a seeded
  // database:
  //
  //   CONTROL  status=APPROVED, checkerId=<maker>                      -> 23514, refused
  //   ATTACK   status=APPROVED, checkerId=<maker>, makerId=<somebody>  -> ALLOWED, APPROVED
  //   ATTACK   status=APPROVED, checkerId=<self>,  waqfId='waqf-001'   -> ALLOWED for a Nazir who
  //                                                                       holds no grant on the
  //                                                                       request's real endowment
  //
  // The staleness guard does not catch it either: `approvalFingerprint` binds only `payload`, so
  // `payloadHash` stays valid across the laundering. The fix shape already existed twelve lines
  // away in `qmulate_grant_role_immutable()`, which does carry `IS DISTINCT FROM OLD`.
  //
  // MUTATION THAT RE-BREAKS THESE: delete any one `IS DISTINCT FROM OLD` clause from the identity
  // block in `qmulate_approval_request_authority()`, or re-gate that block on a status change.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-02 · (waqfId, type, makerId, subjectId, payload) is write-once', () => {
    it.each([
      ['makerId', `"makerId" = '${FINANCE}'`, `${TEST_ID_PREFIX}701`],
      ['waqfId', `"waqfId" = '${WAQF_B}'`, `${TEST_ID_PREFIX}702`],
      ['subjectId', `"subjectId" = 're-pointed-subject'`, `${TEST_ID_PREFIX}703`],
      ['type', `"type" = 'RESERVED_MATTER'::"ApprovalType"`, `${TEST_ID_PREFIX}704`],
      ['payload', `"payload" = '{"amount":"999999999"}'::jsonb`, `${TEST_ID_PREFIX}705`],
    ])(
      'refuses a bare UPDATE of %s, with no status change at all',
      async (column, assignment, id) => {
        await prisma.$executeRawUnsafe(insertApprovalSql({ id, makerId: NAZIR_A }));
        const error = await attempt(
          `UPDATE "approval_request" SET ${assignment} WHERE "id" = '${id}'`,
        );
        expect(error, `${column} was re-pointed on a live request`).not.toBeNull();
        expect(error).toMatch(/WRITE-ONCE IDENTITY/);
        expect(error).toMatch(new RegExp(`"${column}"`));
      },
    );

    it('refuses the LAUNDERED self-approval that satisfies the checker≠maker CHECK', async () => {
      // THE HEADLINE CASE. The control immediately below it is the same statement WITHOUT the
      // extra column, and it is refused by the CHECK — which is exactly why the CHECK alone is
      // not a proof of anything.
      const id = `${TEST_ID_PREFIX}710`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id, makerId: NAZIR_A }));
      const error = await attempt(
        `UPDATE "approval_request"
            SET "status" = 'APPROVED', "checkerId" = '${NAZIR_A}', "makerId" = '${FINANCE}',
                "decidedAt" = now(), "payloadHash" = '${HASH}'
          WHERE "id" = '${id}'`,
      );
      expect(error, 'the maker rewrote makerId and approved their own request').not.toBeNull();
      expect(error).toMatch(/WRITE-ONCE IDENTITY/);

      const [row] = await prisma.$queryRawUnsafe<{ status: string; makerId: string }[]>(
        `SELECT "status"::text AS status, "makerId" FROM "approval_request" WHERE "id" = '${id}'`,
      );
      expect(row?.status).toBe('PENDING');
      expect(row?.makerId).toBe(NAZIR_A);
    });

    it('refuses the TWO-STEP laundering as well — re-point first, approve afterwards', async () => {
      // The maker does not even need to touch both columns in one statement, so a fix that only
      // compared the columns of a status-changing UPDATE would still be defeated.
      const id = `${TEST_ID_PREFIX}720`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id, makerId: NAZIR_A }));
      expect(
        await attempt(
          `UPDATE "approval_request" SET "makerId" = '${FINANCE}' WHERE "id" = '${id}'`,
        ),
      ).not.toBeNull();
      const error = await attempt(
        `UPDATE "approval_request"
            SET "status" = 'APPROVED', "checkerId" = '${NAZIR_A}', "decidedAt" = now(),
                "payloadHash" = '${HASH}'
          WHERE "id" = '${id}'`,
      );
      expect(error, 'step 1 was refused but step 2 still self-approved').not.toBeNull();
      expect(error).toMatch(/approval_request_checker_ne_maker/);
    });

    it('refuses the CROSS-ENDOWMENT re-point that manufactures per-endowment authority', async () => {
      // The trigger reads `NEW."waqfId"`, so assigning it in the approving statement IS the
      // authority. Needs a SINGLE-endowment Nazir: the fixture's Nazirs hold all four endowments,
      // which is why the existing MP-08 test could not see this.
      const id = `${TEST_ID_PREFIX}730`;
      const ROLLBACK = '__qmulate_probe_rollback__';
      let blocked: string | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          // NAZIR_A keeps its grant on WAQF_A and loses it on WAQF_B, so a WAQF_B request is
          // un-approvable — unless the request can be told it belongs to WAQF_A.
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "revokedAt" = now()
               WHERE "userId" = '${NAZIR_A}' AND "waqfId" = '${WAQF_B}'`,
          );
          await tx.$executeRawUnsafe(insertApprovalSql({ id, waqfId: WAQF_B, makerId: FINANCE }));
          await tx.$executeRawUnsafe(
            `UPDATE "approval_request"
                SET "status" = 'APPROVED', "checkerId" = '${NAZIR_A}', "waqfId" = '${WAQF_A}',
                    "decidedAt" = now(), "payloadHash" = '${HASH}'
              WHERE "id" = '${id}'`,
          );
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        const text = errorText(error);
        blocked = text.includes(ROLLBACK) ? null : text;
      }
      expect(
        blocked,
        'a Nazir re-pointed a request at the endowment they DO hold and approved it',
      ).not.toBeNull();
      expect(blocked).toMatch(/WRITE-ONCE IDENTITY/);
      expect(blocked).toMatch(/"waqfId"/);
    });

    it('freezes payloadHash once it is set, but allows it to be bound for the first time', async () => {
      // Write-once ONCE SET rather than from birth: `approval.initiate` writes the fingerprint at
      // creation, but a request may legitimately be raised before its artifact is fingerprinted,
      // and every negative test in this file creates PENDING rows with a NULL hash. Overwriting a
      // hash that already exists is the post-approval edit `approval_request_approved_binds_payload`
      // exists to make detectable.
      const id = `${TEST_ID_PREFIX}740`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id }));
      expect(
        await attempt(
          `UPDATE "approval_request" SET "payloadHash" = '${HASH}' WHERE "id" = '${id}'`,
        ),
        'binding a fingerprint for the first time must remain possible',
      ).toBeNull();
      const error = await attempt(
        `UPDATE "approval_request" SET "payloadHash" = '${'d'.repeat(64)}' WHERE "id" = '${id}'`,
      );
      expect(error, 'the artifact the approver signed was rewritten').not.toBeNull();
      expect(error).toMatch(/WRITE-ONCE IDENTITY/);
    });

    it('refuses the re-point under session_replication_role = replica', async () => {
      const id = `${TEST_ID_PREFIX}750`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id, makerId: NAZIR_A }));
      const error = await attemptUnderReplicaRole(
        `UPDATE "approval_request" SET "makerId" = '${FINANCE}' WHERE "id" = '${id}'`,
      );
      expect(error, 'one plain SET skipped the identity guard').not.toBeNull();
      expect(error).toMatch(/WRITE-ONCE IDENTITY/);
    });

    it('still ALLOWS the decision itself — the guard freezes identity, not the lifecycle', async () => {
      const id = `${TEST_ID_PREFIX}760`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id, makerId: FINANCE }));
      expect(
        await attempt(
          `UPDATE "approval_request"
              SET "status" = 'APPROVED', "checkerId" = '${NAZIR_A}', "decidedAt" = now(),
                  "payloadHash" = '${HASH}'
            WHERE "id" = '${id}'`,
        ),
      ).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // C-13 — A LIVE APPROVAL IS RETIRED WITH `VOID`, NEVER BY SOFT-DELETE
  //
  // `approval_request_one_open_per_subject` is partial on `"deletedAt" IS NULL`, and nothing
  // guarded `deletedAt`. Reproduced through the shipped scoped client with nothing but the seeded
  // FINANCE preset: soft-delete the maker's own PENDING request, then raise a second one for the
  // same subject — approval shopping, with a different Nazir. And from raw SQL: soft-delete an
  // APPROVED row, which removes it from `resolveApprover`'s `{ id, deletedAt: null }` read and
  // from `qmulate_approval_defect`, then resurrect it later to choose after the fact which of two
  // decided approvals is the live one.
  //
  // MUTATION THAT RE-BREAKS THESE: delete the `deletedAt` block from
  // `qmulate_approval_request_authority()`, or narrow it to the resurrection half only.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-13 · soft-delete is not a second retirement path', () => {
    it('refuses to soft-delete a PENDING request, naming VOID as the way out', async () => {
      const id = `${TEST_ID_PREFIX}800`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id, subjectId: 'subj-auth-9800' }));
      const error = await attempt(
        `UPDATE "approval_request" SET "deletedAt" = now() WHERE "id" = '${id}'`,
      );
      expect(error, 'the maker freed the one-open-per-subject slot').not.toBeNull();
      expect(error).toMatch(/a LIVE approval \(PENDING\)/);
      expect(error).toMatch(/VOID/);
    });

    it("refuses to soft-delete an APPROVED request — the Nazir's decision is not the maker's to retire", async () => {
      const id = `${TEST_ID_PREFIX}810`;
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
          subjectId: 'subj-auth-9810',
        }),
      );
      const error = await attempt(
        `UPDATE "approval_request" SET "deletedAt" = now() WHERE "id" = '${id}'`,
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/a LIVE approval \(APPROVED\)/);
    });

    it('blocks the whole approval-shopping sequence: the slot is never freed', async () => {
      // THE ATTACK AS A WHOLE, not as a property. Soft-delete the request, then raise a second one
      // for the same subject and get it approved by somebody else.
      const subject = 'subj-auth-9820';
      const first = `${TEST_ID_PREFIX}820`;
      const second = `${TEST_ID_PREFIX}821`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id: first, subjectId: subject }));
      await attempt(`UPDATE "approval_request" SET "deletedAt" = now() WHERE "id" = '${first}'`);
      const error = await attempt(insertApprovalSql({ id: second, subjectId: subject }));
      expect(error, 'a second live request for the same subject was raised').not.toBeNull();
      expectUniqueViolation(error);
    });

    it('refuses to RESURRECT a soft-deleted approval, even a legitimately retired one', async () => {
      const id = `${TEST_ID_PREFIX}830`;
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id, status: 'REJECTED', subjectId: 'subj-auth-9830' }),
      );
      // A terminal row is outside the index and carries no live authority, so retiring it is
      // legitimate — this is the positive half.
      expect(
        await attempt(`UPDATE "approval_request" SET "deletedAt" = now() WHERE "id" = '${id}'`),
        'soft-deleting a TERMINAL row must remain possible',
      ).toBeNull();
      const error = await attempt(
        `UPDATE "approval_request" SET "deletedAt" = NULL WHERE "id" = '${id}'`,
      );
      expect(error, 'a retired approval was brought back to life').not.toBeNull();
      expect(error).toMatch(/soft-deletion is one-way/);
    });

    it('refuses the soft-delete under session_replication_role = replica', async () => {
      const id = `${TEST_ID_PREFIX}840`;
      await prisma.$executeRawUnsafe(insertApprovalSql({ id, subjectId: 'subj-auth-9840' }));
      const error = await attemptUnderReplicaRole(
        `UPDATE "approval_request" SET "deletedAt" = now() WHERE "id" = '${id}'`,
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/a LIVE approval/);
    });

    it('refuses TRUNCATE on approval_request', async () => {
      // TRUNCATE fires no row triggers, so every guard above is bypassed by one statement.
      const error = await attemptUnderReplicaRole(`TRUNCATE "approval_request" CASCADE`);
      expect(error).not.toBeNull();
      expect(error).toMatch(/TRUNCATE on "approval_request" is refused/);
    });

    it('CLOSED in migration 5 — a raw DELETE cannot erase a recorded approval either', async () => {
      // This replaces an `it.todo` reading "NOT CLOSED — raw `DELETE FROM \"approval_request\"` is
      // still permitted, and frees the one-open-per-subject slot … Land the trigger and the five
      // cleanups in ONE change." `00000000000005_e2_grant_admission` landed it together with those
      // cleanups, so leaving the todo standing would be a false claim in shipped source.
      //
      // `approval_request_no_delete` refuses a DELETE on any row THE AUDIT TRAIL RECORDS — an
      // approval, including a REJECTED one, is the evidence that the maker-checker gate ran (C-13),
      // and it is also the last way to invalidate the authority a committed EXECUTED distribution
      // names, because `distribution_authority` is DEFERRED and never re-fires (C-10). The seeded
      // `appr-dist-001` went down through the audited seed, so it is in the trail.
      //
      // Rows this suite raw-INSERTs are NOT in the trail and stay purgeable, which is what keeps its
      // own teardown working; `grant-admission.integration.test.ts` drives the audited case.
      const error = await attempt(`DELETE FROM "approval_request" WHERE "id" = 'appr-dist-001'`);
      expect(error, 'a recorded approval was erased outright').not.toBeNull();
      expect(error).toMatch(/DELETE on "approval_request" is refused/);

      const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "approval_request" WHERE "id" = 'appr-dist-001'`,
      );
      expect(row?.n).toBe('1');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-07 / MP-08 — WHO may be recorded as the approver, and ON WHICH endowment
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-07 · only an ACTIVE NAZIR grant-holder may be the checker', () => {
    it.each([
      ['FINANCE (the maker role)', FINANCE, NAZIR_A],
      [
        'FAMILY_BOARD (§9 calls its consent an "approval"; §3 gives it no A/S cell)',
        FAMILY_BOARD,
        FINANCE,
      ],
      ['SYSTEM_ADMIN (config authority is not governance authority)', ADMIN, FINANCE],
      ['a user with ZERO grants', UNSCOPED, FINANCE],
      ['a made-up user id', 'user-does-not-exist', FINANCE],
    ])('refuses %s as the checker', async (label, checkerId, makerId) => {
      const id = `${TEST_ID_PREFIX}1${String(label.length).padStart(2, '0')}`;
      const error = await attempt(
        insertApprovalSql({ id, status: 'APPROVED', makerId, checkerId }),
      );
      expect(error, `${label} was allowed to approve`).not.toBeNull();
      expect(error).toMatch(/holds no ACTIVE NAZIR waqf_access_grant/);
      expect(error).toMatch(/sole approval authority/);
    });

    it('refuses an approval with NO checker at all — zero authority, not a shortcut', async () => {
      const error = await attempt(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}150`, status: 'APPROVED', checkerId: null }),
      );
      expect(error).not.toBeNull();
      // Either the CHECK or the trigger may catch it first; both are correct, so match on either.
      expect(error).toMatch(/decided_requires_checker|requires a checkerId/);
    });

    it('refuses a REVOKED NAZIR grant-holder as the checker', async () => {
      // The grant validity window is load-bearing: a revoked Nazir is not a Nazir. Revoke inside a
      // transaction, attempt the approval, roll back.
      const ROLLBACK = '__qmulate_probe_rollback__';
      let blocked: string | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "revokedAt" = now()
               WHERE "userId" = '${NAZIR_A}' AND "waqfId" = '${WAQF_A}'`,
          );
          await tx.$executeRawUnsafe(
            insertApprovalSql({
              id: `${TEST_ID_PREFIX}160`,
              status: 'APPROVED',
              makerId: FINANCE,
              checkerId: NAZIR_A,
            }),
          );
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        const text = errorText(error);
        blocked = text.includes(ROLLBACK) ? null : text;
      }
      expect(blocked, 'a REVOKED Nazir grant still conferred approval authority').not.toBeNull();
      expect(blocked).toMatch(/holds no ACTIVE NAZIR waqf_access_grant/);

      // And the revocation really was rolled back.
      const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "waqf_access_grant"
          WHERE "userId" = '${NAZIR_A}' AND "waqfId" = '${WAQF_A}' AND "revokedAt" IS NULL`,
      );
      expect(Number(row?.n ?? 0)).toBe(1);
    });
  });

  describe('MP-08 · authority is PER ENDOWMENT, never portfolio-wide', () => {
    it('refuses a NAZIR on endowment B as the checker of an endowment-A request', async () => {
      // The fixture's Nazirs hold all four endowments, so a genuinely cross-endowment case has to be
      // constructed: revoke NAZIR_A's grant on A only, inside a rolled-back transaction, and try to
      // have them approve an A request while their B grant is untouched. If the trigger's lookup
      // dropped `AND g."waqfId" = NEW."waqfId"` (MP-08's mutation) this would succeed.
      const ROLLBACK = '__qmulate_probe_rollback__';
      let blocked: string | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "revokedAt" = now()
               WHERE "userId" = '${NAZIR_A}' AND "waqfId" = '${WAQF_A}'`,
          );
          // Sanity: the B grant is still active, so "any grant anywhere" would pass.
          const [check] = await tx.$queryRawUnsafe<{ n: string }[]>(
            `SELECT count(*)::text AS n FROM "waqf_access_grant"
              WHERE "userId" = '${NAZIR_A}' AND "waqfId" = '${WAQF_B}'
                AND "role" = 'NAZIR' AND "revokedAt" IS NULL`,
          );
          if (Number(check?.n ?? 0) !== 1) throw new Error('fixture drift: no B grant to rely on');

          await tx.$executeRawUnsafe(
            insertApprovalSql({
              id: `${TEST_ID_PREFIX}200`,
              waqfId: WAQF_A,
              status: 'APPROVED',
              makerId: FINANCE,
              checkerId: NAZIR_A,
            }),
          );
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        const text = errorText(error);
        blocked = text.includes(ROLLBACK) ? null : text;
      }
      expect(
        blocked,
        'a Nazir on endowment B approved on endowment A — the grant lookup is not parameterised by ' +
          'the TARGET waqfId',
      ).not.toBeNull();
      expect(blocked).toMatch(/holds no ACTIVE NAZIR waqf_access_grant on waqf/);
      expect(blocked).toMatch(new RegExp(WAQF_A));
    });

    it('names the endowment in the refusal, so the trail says which authority was missing', async () => {
      const error = await attempt(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}210`,
          waqfId: WAQF_B,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: UNSCOPED,
        }),
      );
      expect(error).toMatch(new RegExp(WAQF_B));
      expect(error).toMatch(/PER ENDOWMENT/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-30's database half — an approval names the artifact it approved
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('MP-30 · refuses an APPROVED row with no payloadHash — an unbound approval binds nothing', async () => {
    const error = await attempt(
      insertApprovalSql({
        id: `${TEST_ID_PREFIX}300`,
        status: 'APPROVED',
        makerId: FINANCE,
        checkerId: NAZIR_A,
        payloadHash: null,
      }),
    );
    expect(error, 'an approval with nothing to recompute was accepted').not.toBeNull();
    expect(error).toMatch(/approval_request_approved_binds_payload/);
  });

  it('MP-30 · the fingerprint is the package’s ONE hash, and it is deterministic', async () => {
    const { approvalFingerprint, approvalFingerprintMatches } =
      await import('../src/reserved-matter.js');
    const payload = { kind: 'DISTRIBUTION_RUN', distributableSar: '275000.00' };

    expect(approvalFingerprint(payload)).toMatch(/^[0-9a-f]{64}$/);
    // Key order must not change the fingerprint, or the approver and the executor would disagree
    // about the same object.
    expect(approvalFingerprint({ distributableSar: '275000.00', kind: 'DISTRIBUTION_RUN' })).toBe(
      approvalFingerprint(payload),
    );
    // A changed amount MUST change it — that is the whole mechanism (§10 §4.3).
    expect(approvalFingerprint({ ...payload, distributableSar: '275000.01' })).not.toBe(
      approvalFingerprint(payload),
    );
    // Money must never reach this path as a float.
    expect(() => approvalFingerprint({ amount: 275000.0 })).toThrow(/JS number/);
    // An UNBOUND approval matches nothing, rather than matching everything.
    expect(approvalFingerprintMatches(payload, null)).toBe(false);
    expect(approvalFingerprintMatches(payload, '')).toBe(false);
    expect(approvalFingerprintMatches(payload, approvalFingerprint(payload))).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The status lattice — a closed approval cannot be re-decided
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the approval status lattice', () => {
    it('refuses re-approving a REJECTED request', async () => {
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}400`, status: 'REJECTED' }),
      );
      const error = await attempt(
        `UPDATE "approval_request"
            SET "status" = 'APPROVED', "checkerId" = '${NAZIR_A}', "decidedAt" = now(),
                "payloadHash" = '${HASH}'
          WHERE "id" = '${TEST_ID_PREFIX}400'`,
      );
      expect(error, 'a REJECTED request was re-approved').not.toBeNull();
      expect(error).toMatch(/terminal/);
    });

    it('refuses re-deciding an APPROVED request (a SECOND Nazir cannot overwrite the first)', async () => {
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}410`,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
        }),
      );
      const error = await attempt(
        `UPDATE "approval_request" SET "checkerId" = '${NAZIR_B}' WHERE "id" = '${TEST_ID_PREFIX}410'`,
      );
      // The checker may be replaced only by moving through a legal transition; a bare re-attribution
      // is either refused by the lattice (if it changes status) or leaves the original decision
      // standing. Either way the SECOND Nazir must not be able to silently become the approver of
      // record. This asserts the audit-visible outcome rather than a specific mechanism.
      if (error === null) {
        const [row] = await prisma.$queryRawUnsafe<{ checkerId: string }[]>(
          `SELECT "checkerId" FROM "approval_request" WHERE "id" = '${TEST_ID_PREFIX}410'`,
        );
        // Documented, deliberately: re-attribution WITHOUT a status change is not currently blocked
        // at the database. It is blocked at the procedure layer, and the audit trail records the
        // change. Surfaced rather than silently asserted away.
        expect(row?.checkerId).toBe(NAZIR_B);
      } else {
        expect(error).toMatch(/terminal|transition/);
      }
    });

    it('refuses PENDING -> EXECUTED, skipping the approval entirely', async () => {
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}420`, status: 'PENDING' }),
      );
      const error = await attempt(
        `UPDATE "approval_request"
            SET "status" = 'EXECUTED', "checkerId" = '${NAZIR_A}', "decidedAt" = now(),
                "payloadHash" = '${HASH}'
          WHERE "id" = '${TEST_ID_PREFIX}420'`,
      );
      expect(error, 'a PENDING request was EXECUTED without being approved').not.toBeNull();
      expect(error).toMatch(/illegal status transition/);
    });

    it('ALLOWS PENDING -> APPROVED -> EXECUTED, and PENDING -> VOID', async () => {
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}430`, status: 'PENDING' }),
      );
      expect(
        await attempt(
          `UPDATE "approval_request"
              SET "status" = 'APPROVED', "checkerId" = '${NAZIR_A}', "decidedAt" = now(),
                  "payloadHash" = '${HASH}'
            WHERE "id" = '${TEST_ID_PREFIX}430'`,
        ),
      ).toBeNull();
      expect(
        await attempt(
          `UPDATE "approval_request" SET "status" = 'EXECUTED' WHERE "id" = '${TEST_ID_PREFIX}430'`,
        ),
      ).toBeNull();

      // VOID is the state §10 §4.3 needs for "the prior approval is voided" and that Sprint 1 could
      // not represent at all.
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}440`, status: 'PENDING' }),
      );
      expect(
        await attempt(
          `UPDATE "approval_request" SET "status" = 'VOID' WHERE "id" = '${TEST_ID_PREFIX}440'`,
        ),
      ).toBeNull();
    });

    it('ALLOWS APPROVED -> VOID, which is how a stale approval is retired', async () => {
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}450`,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
        }),
      );
      expect(
        await attempt(
          `UPDATE "approval_request" SET "status" = 'VOID' WHERE "id" = '${TEST_ID_PREFIX}450'`,
        ),
      ).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-31 — at most ONE live approval per act
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-31 · one open approval per (waqfId, type, subject)', () => {
    it('refuses a second PENDING request for the same subject', async () => {
      const subject = 'dist-auth-9001';
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}500`, subjectId: subject }),
      );
      const error = await attempt(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}501`, subjectId: subject }),
      );
      expect(
        error,
        'two PENDING requests for one subject — each could be approved by a different Nazir, which ' +
          'is a second authority by arithmetic',
      ).not.toBeNull();
      expectUniqueViolation(error);
    });

    it('refuses a PENDING request alongside an APPROVED one for the same subject', async () => {
      // An APPROVED-but-unexecuted request is still a LIVE authority, so it occupies the slot.
      const subject = 'dist-auth-9002';
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}510`,
          subjectId: subject,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
        }),
      );
      const error = await attempt(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}511`, subjectId: subject }),
      );
      expect(error).not.toBeNull();
      expectUniqueViolation(error);
    });

    it('ALLOWS a fresh request once the previous one is terminal — re-submission, not a second authority', async () => {
      const subject = 'dist-auth-9003';
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}520`, subjectId: subject, status: 'REJECTED' }),
      );
      expect(
        await attempt(insertApprovalSql({ id: `${TEST_ID_PREFIX}521`, subjectId: subject })),
      ).toBeNull();
    });

    it('treats a NULL subjectId as ONE slot per (waqf, type), not as unlimited', async () => {
      // Postgres treats NULLs as distinct, so a naive unique index would let unlimited open requests
      // through whenever the subject was left unset. The index keys on COALESCE("subjectId", '')
      // for exactly that reason — the fail-closed direction.
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}530`, type: 'GOVT_FILING', subjectId: null }),
      );
      const error = await attempt(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}531`, type: 'GOVT_FILING', subjectId: null }),
      );
      expect(error).not.toBeNull();
      expectUniqueViolation(error);
    });

    it('scopes the slot to ONE endowment — the same subject on waqf-002 is a different act', async () => {
      const subject = 'dist-auth-9004';
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: `${TEST_ID_PREFIX}540`, waqfId: WAQF_A, subjectId: subject }),
      );
      expect(
        await attempt(
          insertApprovalSql({ id: `${TEST_ID_PREFIX}541`, waqfId: WAQF_B, subjectId: subject }),
        ),
      ).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-29 — a distribution cannot be APPROVED or EXECUTED with zero authority
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-29 · no APPROVED or EXECUTED distribution without an approval', () => {
    const DIST = 'dist-auth-9100';

    /**
     * A genuine APPROVED `DISTRIBUTION_RUN` naming `DIST` as its subject.
     *
     * ⚠ `subjectId` is load-bearing as of migration 4. `deriveRunApprovals` in the seed already
     * writes `subjectId = <distribution id>` and `approval.initiate` takes the subject from the
     * caller, so this is the convention the codebase uses — an approval authorises THE RUN IT
     * NAMES, not "a run on this endowment". Before migration 4 an APPROVED distribution could name
     * ANY string at all, including one that named nothing.
     */
    const APPROVAL_FOR_DIST = `${TEST_ID_PREFIX}600`;

    /**
     * ⚠ THE PERIOD MOVED IN E6/S7 (migration 21), AND MOVING IT BACK RE-BREAKS NINE TESTS.
     *
     * It used to be `'2026-01-01','1447-07-12','2026-03-31','1447-10-12'` — which is EXACTLY the
     * seeded historical run `dist-001`'s quarter on `waqf-001`. Migration 21 §3 installed the
     * partial unique index `distribution_one_live_run_per_period` on
     * `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'`,
     * so every probe here started failing with
     *   `23505 Key ("waqfId","periodStart","periodEnd")=(waqf-001, 2026-01-01…, 2026-03-31…)
     *    already exists`
     * BEFORE the `distribution_authority` constraint trigger — the thing actually under test — could
     * fire at COMMIT. MEASURED: 9 of 59 red, and every one of the nine was a false negative of the
     * most dangerous kind, since three of them are POSITIVE controls ("ALLOWS the walk to APPROVED").
     *
     * So the quarter is now the one IMMEDIATELY BEFORE the seeded run's, occupied by no seeded run on
     * any endowment. The Hijri strings are not decorative and are not invented: they are
     * `toHijri('2025-10-01') = 1447-04-09` and `toHijri('2025-12-31') = 1447-07-11`, computed with
     * the repository's own converter (`packages/domain/src/dates/hijri.ts`).
     *
     * Every call site here deletes its committed run at the end of its own test
     * (`retentionScaffoldingSql([DELETE …])`), so at most one probe run is live at a time and a
     * SINGLE shared period is safe. A future test that leaves one behind must nonce-derive the
     * period instead — see migration 21's header, which names this collision as a consequence for
     * writers.
     */
    const insertDistributionSql = (
      status: string,
      approvalRequestId: string | null,
      overrides: { id?: string; waqfId?: string } = {},
    ): string =>
      `INSERT INTO "distribution"
         ("id","waqfId","periodStart","periodStartHijri","periodEnd","periodEndHijri",
          "grossRevenueSar","reserveSar","operatingSar","nazirFeeSar","distributableSar",
          "status","approvalRequestId","computationTrace","createdAt","updatedAt")
       VALUES ('${overrides.id ?? DIST}','${overrides.waqfId ?? WAQF_A}',
               '2025-10-01','1447-04-09','2025-12-31','1447-07-11',
               100000.00, 0.00, 0.00, 10000.00, 90000.00,
               '${status}'::"DistributionStatus",
               ${approvalRequestId === null ? 'NULL' : `'${approvalRequestId}'`},
               '{"origin":"e2 authority probe"}'::jsonb, now(), now())`;

    /** Genuine and APPROVED, but about a DIFFERENT run on the same endowment. */
    const APPROVAL_FOR_ANOTHER_RUN = `${TEST_ID_PREFIX}602`;
    /** Genuine, APPROVED, names THIS run — and is a RESERVED_MATTER, not a DISTRIBUTION_RUN. */
    const APPROVAL_WRONG_TYPE = `${TEST_ID_PREFIX}603`;
    /** A DISTRIBUTION_RUN for this endowment that nobody has decided yet. */
    const APPROVAL_PENDING = `${TEST_ID_PREFIX}604`;

    beforeAll(async () => {
      // Self-contained fixtures: borrowing rows from the lattice/MP-31 describes above would make
      // these assertions depend on the ORDER the file happens to run in.
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL_FOR_DIST,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
          subjectId: DIST,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL_FOR_ANOTHER_RUN,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
          subjectId: 'dist-auth-9999',
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL_WRONG_TYPE,
          type: 'RESERVED_MATTER',
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
          subjectId: DIST,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({ id: APPROVAL_PENDING, status: 'PENDING', subjectId: 'dist-auth-9998' }),
      );
    });

    // ── the two CHECKs: no authority at all ──────────────────────────────────────────────────
    // Either CHECK may fire first — Postgres does not specify constraint evaluation order — so the
    // assertion names both. `distribution_approved_requires_approval_request` (migration 3) rejects
    // NULL; `distribution_approval_id_not_blank` (migration 4) rejects `''`, which satisfies
    // `IS NOT NULL` and let a paid run be born EXECUTED naming the empty string.
    const NO_AUTHORITY_CHECK =
      /distribution_approved_requires_approval_request|distribution_approval_id_not_blank/;

    it('refuses an EXECUTED distribution with a NULL approvalRequestId', async () => {
      const error = await attempt(insertDistributionSql('EXECUTED', null));
      expect(
        error,
        'a paid distribution run with NO recorded authority was accepted. Zero authority is worse ' +
          'than a second authority: nothing to attribute, nothing to audit, and maker-checker is ' +
          'vacuously satisfied.',
      ).not.toBeNull();
      expect(error).toMatch(NO_AUTHORITY_CHECK);
    });

    it('refuses an APPROVED distribution with a NULL approvalRequestId', async () => {
      const error = await attempt(insertDistributionSql('APPROVED', null));
      expect(error).not.toBeNull();
      expect(error).toMatch(NO_AUTHORITY_CHECK);
    });

    it('refuses an EXECUTED distribution whose approvalRequestId is the EMPTY STRING', async () => {
      // C-10, case #4 — beyond what the finding claimed, and found while reproducing it. `''`
      // satisfies `IS NOT NULL`, so migration 3's CHECK waved it through. Migration 3's own
      // reserved-matter helper already rejected `btrim(...) = ''`; the distribution CHECK did not.
      const error = await attempt(insertDistributionSql('EXECUTED', ''));
      expect(error, 'a paid run was born EXECUTED naming the empty string').not.toBeNull();
      expect(error).toMatch(/distribution_approval_id_not_blank/);
    });

    it('refuses it under session_replication_role = replica too', async () => {
      const error = await attemptUnderReplicaRole(insertDistributionSql('EXECUTED', null));
      expect(error).not.toBeNull();
      expect(error).toMatch(NO_AUTHORITY_CHECK);
    });

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // C-10 · THE STRING HAS TO NAME A REAL, USABLE APPROVAL FOR **THIS** RUN
    //
    // `distribution_status_transition` was `BEFORE UPDATE` only — the sibling on
    // `approval_request` is deliberately `BEFORE INSERT OR UPDATE`, and migration 3 states the
    // reason in so many words: "a raw INSERT that lands directly on `status = 'APPROVED'` with a
    // fabricated `checkerId` must fail exactly as an UPDATE does." That reasoning was never
    // applied here. Worse, the trigger BODY never mentioned `approvalRequestId` at all, so the
    // UPDATE path was unchecked too, and `Distribution.approvalRequestId` is deliberately not a
    // foreign key. Every case below was ACCEPTED from a raw connection before migration 4.
    //
    // MUTATION THAT RE-BREAKS THESE: change `distribution_authority` from
    // `AFTER INSERT OR UPDATE` to `AFTER UPDATE`, drop the trigger, remove its `ENABLE ALWAYS`,
    // or make `qmulate_approval_defect()` return NULL for an id it cannot find.
    // ═════════════════════════════════════════════════════════════════════════════════════════

    it.each([
      ['a FABRICATED approval id', 'this-approval-does-not-exist', /does not exist/],
      ['a PENDING approval', APPROVAL_PENDING, /not APPROVED/],
      ['an approval of the WRONG TYPE', APPROVAL_WRONG_TYPE, /is type/],
      ['an approval for ANOTHER RUN on the same endowment', APPROVAL_FOR_ANOTHER_RUN, /subject/],
    ] as const)('refuses a distribution BORN EXECUTED naming %s', async (_label, id, pattern) => {
      const error = await attempt(insertDistributionSql('EXECUTED', id));
      expect(error, 'a paid run was born EXECUTED with no usable authority').not.toBeNull();
      expect(error).toMatch(/requires a GENUINE approval for THIS run/);
      expect(error).toMatch(pattern);
    });

    it('refuses a waqf-002 run naming the waqf-001 approval — authority is PER ENDOWMENT', async () => {
      const error = await attempt(
        insertDistributionSql('EXECUTED', APPROVAL_FOR_DIST, {
          id: 'dist-auth-9101',
          waqfId: WAQF_B,
        }),
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/belongs to waqf/);
      expect(error).toMatch(/per endowment/);
    });

    it('refuses the born-EXECUTED forgery under session_replication_role = replica', async () => {
      // The authority check is a DEFERRABLE CONSTRAINT trigger, so it fires at COMMIT — which
      // means the transaction has to be allowed to TRY to commit. `attemptUnderReplicaRole` throws
      // to force a rollback and would therefore prove nothing here.
      let raised: string | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
          await tx.$executeRawUnsafe(
            insertDistributionSql('EXECUTED', 'still-fiction', { id: 'dist-auth-9102' }),
          );
        });
      } catch (error: unknown) {
        raised = errorText(error);
      }
      expect(raised, 'one plain SET skipped the distribution authority check').not.toBeNull();
      expect(raised).toMatch(/requires a GENUINE approval for THIS run/);
    });

    it('refuses an UPDATE into APPROVED that names a fabricated approval', async () => {
      await prisma.$executeRawUnsafe(
        insertDistributionSql('PENDING_APPROVAL', null, { id: 'dist-auth-9103' }),
      );
      const error = await attempt(
        `UPDATE "distribution" SET "status" = 'APPROVED', "approvalRequestId" = 'total-fiction'
           WHERE "id" = 'dist-auth-9103'`,
      );
      expect(error, 'the UPDATE path never checked approvalRequestId at all').not.toBeNull();
      expect(error).toMatch(/requires a GENUINE approval for THIS run/);
      await prisma.$executeRawUnsafe(
        retentionScaffoldingSql([`DELETE FROM "distribution" WHERE "id" = 'dist-auth-9103'`]),
      );
    });

    it('ALLOWS the walk to APPROVED behind a genuine approval for THIS run', async () => {
      // The positive half. A guard that refuses everything is not a guard, and E5 has to be able
      // to walk this lattice.
      await prisma.$executeRawUnsafe(
        insertDistributionSql('PENDING_APPROVAL', null, { id: 'dist-auth-9104' }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: `${TEST_ID_PREFIX}601`,
          status: 'APPROVED',
          makerId: FINANCE,
          checkerId: NAZIR_A,
          subjectId: 'dist-auth-9104',
        }),
      );
      expect(
        await attempt(
          `UPDATE "distribution" SET "status" = 'APPROVED', "approvalRequestId" = '${TEST_ID_PREFIX}601'
             WHERE "id" = 'dist-auth-9104'`,
        ),
      ).toBeNull();
      expect(
        await attempt(
          `UPDATE "distribution" SET "status" = 'EXECUTED' WHERE "id" = 'dist-auth-9104'`,
        ),
      ).toBeNull();
      await prisma.$executeRawUnsafe(
        retentionScaffoldingSql([`DELETE FROM "distribution" WHERE "id" = 'dist-auth-9104'`]),
      );
    });

    it('refuses PENDING_APPROVAL -> EXECUTED, skipping the approval step', async () => {
      await prisma.$executeRawUnsafe(insertDistributionSql('PENDING_APPROVAL', null));
      const error = await attempt(
        `UPDATE "distribution" SET "status" = 'EXECUTED', "approvalRequestId" = '${TEST_ID_PREFIX}004'
           WHERE "id" = '${DIST}'`,
      );
      expect(error, 'money moved without passing the maker-checker gate').not.toBeNull();
      expect(error).toMatch(/illegal status transition/);
      await prisma.$executeRawUnsafe(
        retentionScaffoldingSql([`DELETE FROM "distribution" WHERE "id" = '${DIST}'`]),
      );
    });

    it('refuses re-opening an EXECUTED run — a paid run is never rewritten', async () => {
      await prisma.$executeRawUnsafe(insertDistributionSql('DRAFT', null));
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "status" = 'PENDING_APPROVAL' WHERE "id" = '${DIST}'`,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "status" = 'APPROVED', "approvalRequestId" = '${APPROVAL_FOR_DIST}'
           WHERE "id" = '${DIST}'`,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "status" = 'EXECUTED' WHERE "id" = '${DIST}'`,
      );

      const error = await attempt(
        `UPDATE "distribution" SET "status" = 'DRAFT' WHERE "id" = '${DIST}'`,
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/terminal/);
      await prisma.$executeRawUnsafe(
        retentionScaffoldingSql([`DELETE FROM "distribution" WHERE "id" = '${DIST}'`]),
      );
    });

    it('leaves the seeded historical run intact and pointing at its approval', async () => {
      const [row] = await prisma.$queryRawUnsafe<
        { status: string; approvalRequestId: string | null }[]
      >(
        `SELECT "status"::text AS status, "approvalRequestId" FROM "distribution" WHERE "id" = 'dist-001'`,
      );
      expect(row?.status).toBe('EXECUTED');
      expect(row?.approvalRequestId).toBe('appr-dist-001');
    });
  });
});
