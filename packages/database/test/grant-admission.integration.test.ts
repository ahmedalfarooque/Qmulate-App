/**
 * ADMISSION CONTROL ON THE AUTHORIZATION PLANE — the S2 round-2 headline break, closed and pinned.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE STRUCTURAL LESSON, NOW TWICE-LEARNED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every authority layer this sprint shipped asks "does this ROW say NAZIR?". Not one asked **HOW
 * THE ROW GOT THERE, AND WAS THAT PATH AUTHORIZED.** Prisma client extensions do not intercept
 * `$queryRaw` / `$executeRaw*`, so a control that lives only in an extension is bypassable **from
 * the very same scoped client that the extension just refused**.
 *
 * REPRODUCED, 2026-07-28, on a freshly migrated + seeded database, before migration 5 existed:
 *
 *   [1] scoped delegate create -> REFUSED ("WaqfAccessGrant is the AUTHORIZATION PLANE …")
 *   [2] $executeRawUnsafe on the SAME client: FORGED grant-r2-901 on waqf-001 — COMMITTED
 *   [2] $executeRawUnsafe on the SAME client: FORGED grant-r2-902 on waqf-002 — COMMITTED
 *   [4] audit events naming either forged grant: 0
 *   [5] qmulate_has_active_grant(FINANCE,'waqf-001','NAZIR') = true, ('waqf-002') = true
 *   [6] hard DELETE of the seeded FINANCE seat: ALLOWED
 *
 * `user-accountant-001` is a plain FINANCE seat: no admin verb, no approve verb, and on `waqf-002`
 * no grant at all. With [5] true, `approval_request_authority` accepts it as a checker and
 * `appRouter.approval.approve` returns `{status:'APPROVED'}` on another maker's SAR 4,500,000
 * BANK_MOVEMENT. `pg_trigger` showed **no trigger governing WHO MAY INSERT A GRANT** — the only
 * INSERT-time controls were `waqf_access_grant_permission_guard`, which POSITIVELY PERMITS an
 * approve verb when `role = 'NAZIR'`, and CHECK `waqf_access_grant_no_self_issue`, satisfied by
 * naming any third party as `grantedByUserId`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE MUTATION IS EXECUTED, NOT DESCRIBED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `MUTATION · the forgery succeeds again the moment the guard is off` disables
 * `waqf_access_grant_admission` inside a rolled-back transaction and drives the WHOLE attack chain
 * to completion — forged NAZIR seat, `qmulate_has_active_grant` true, another maker's PENDING
 * approval flipped to APPROVED by the forger. Round 1 shipped a source-shape assertion (strings
 * near a call site) that passed at full strength while the guard it described was fully bypassable;
 * nothing in this file asserts on source text.
 *
 * ⚠ AND THAT SAME TEST IS THE HONEST STATEMENT OF THE RESIDUAL. `ALTER TABLE … DISABLE TRIGGER`
 * needs table OWNERSHIP, and on Railway the runtime connects AS THE OWNER — so the demonstration
 * of the mutation is also a demonstration that the application role can switch this guard off. The
 * complete fix is privilege separation, DEFERRED TO E12 BY ADR-0008, which also places the insider
 * with application-database credentials inside the threat model. What migration 5 buys is that a
 * forgery can no longer be SILENT: the marker it must produce is an append-only, hash-chained
 * `audit_event`, so the forgery lands in the trail and breaks gate G-1's recomputation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ✅ THE RESERVED-MATTER BLOCK NEAR THE END OF THIS FILE IS NO LONGER QUALIFIED (AV4-02 CLOSED, S12-1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Until migration 50 (2026-09-08) this header said: `REFUSES an approval that names another
 * artifact` / `OPENS for a genuine approval that names this artifact` measured the GATE's
 * discrimination but NOT that the approval AUTHORITY was exercised, because `qmulate_app` could mint
 * its own `APPROVED` `RESERVED_MATTER` row and spend it in the same transaction — MEASURED in S4
 * round 4, rolled back, `audit_event` 153 → 153, "NO scaffolding is needed at all".
 *
 * Migration 50 keys the DECISION on `current_user`: a request is born PENDING and only the
 * provisioner / owner may record a checker or move a row into APPROVED | REJECTED. The runtime role
 * cannot cut the key any more — `approval-decision-plane.integration.test.ts` runs that exact script
 * and asserts the refusal, the mutation, and the restore. What this file's `authzScaffoldingSql()`
 * lays down is therefore an OWNER act that models a plane decision, and says so.
 *
 * The residual is now the same one the grant plane has carried since round 6: the holder of
 * `ACCESS_MATRIX_DATABASE_URL` is the approval plane (ADR-0008 round 7). Case C-13 below takes its
 * REJECTED decision through `decideApproval()` — the only shape a real refusal can have now.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  accessMatrixClient,
  assertGuardsInstalled,
  authzScaffoldingSql,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  guardProbeSql,
  hasDatabase,
  provisionGrants,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('E2 round 2 — grant admission control at the database layer');

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';

/** The attacker: a plain FINANCE seat on waqf-001. No admin verb, no approve verb. */
const FINANCE = 'user-accountant-001';
/** A seeded NAZIR on all four endowments — the maker whose approval the forger tries to decide. */
const NAZIR = 'user-nazir-001';

/**
 * The access-matrix administrator these tests use.
 *
 * `user-family-board` rather than a new user: `waqf_access_grant.userId` carries a real foreign key
 * to `User`, so the actor has to exist, and this seat already holds a FAMILY_BOARD grant on ALL
 * FOUR endowments — which is exactly what makes the per-endowment cases non-vacuous. Its admin seat
 * is issued on `WAQF_A` ONLY, so "holds a grant on B" and "may write B's access matrix" are
 * provably different facts.
 *
 * NOT `user-unscoped`: that seat is the V-5 negative subject and `seed.integration.test.ts` asserts
 * it holds exactly zero grants.
 */
const ADMIN = 'user-family-board';
/**
 * A SECOND administrator whose seat is revoked immediately after it is issued.
 *
 * Revocation is ONE-WAY (migration 4, C-09), so a "revoked admin" case cannot be built inside a
 * rolled-back transaction and then undone — it needs a disposable seat of its own. This one is on
 * `WAQF_B`, where it is the only admin seat, so its revocation is the only variable in the test.
 */
const REVOKED_ADMIN = 'user-approver-001';
const REVOKED_ADMIN_GRANT = 'grant-adm-9002';
/** The subject every grant these tests issue is issued TO. Never the admin (`no_self_issue`). */
const SUBJECT = FINANCE;

/** Test-created rows live in a 9xxx series so cleanup deletes exactly this range. */
const ADMIN_GRANT = 'grant-adm-9001';
const GRANT_PREFIX = 'grant-adm-9';
const APPROVAL_PREFIX = 'appr-adm-9';
const FAKE_HASH = 'a'.repeat(64);

/**
 * The actor every SYSTEM bootstrap write in this file is attributed to.
 *
 * ⚠ NOT `user-seed-admin`. `seed.integration.test.ts` asserts that the count of `audit_event` rows
 * with that actorId is a WHOLE MULTIPLE of one seed run — "one event per write, so the total is
 * always a whole number of runs; a partial multiple would mean some writes escaped the audit
 * spine" — so a single extra event attributed to the seed actor turns E1-4 red from this file.
 * Measured, not guessed: it did.
 *
 * It needs no `User` row: `audit_event.actorId` and `waqf_access_grant.grantedByUserId` are plain
 * columns, and only `waqf_access_grant.userId` carries the FK.
 */
const PROVISIONER = 'user-test-round2-provisioner';

/** Just enough of the base client to drive raw SQL. The suite's existing convention. */
interface RawTx {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

interface PrismaLike extends RawTx {
  $transaction: <T>(fn: (tx: RawTx) => Promise<T>) => Promise<T>;
}

/**
 * A definitely-past `validFrom`, and NOT `now()`. This is not fussiness — it is a 50/50 flake.
 *
 * `WaqfAccessGrant.validFrom` is a Prisma `DateTime`, i.e. `timestamp(3)`, and storing `now()`
 * ROUNDS the transaction timestamp to milliseconds. Whenever the sub-millisecond part is >= 0.5 the
 * stored value lands UP TO ONE MILLISECOND IN THE FUTURE, and
 * `qmulate_has_active_grant()`'s `g."validFrom" <= now()` is then FALSE. Measured on this fixture:
 * `validFrom = 18:35:58.419` (local, +03) against `now() = 15:35:58.418` UTC — `from_ok = false` —
 * so the forged seat existed with `role = 'NAZIR'` and conferred nothing, and the MUTATION test
 * below failed to drive its own attack about half the time. A test that flakes at the step where it
 * is supposed to demonstrate a break is worse than no test: it reads as the guard working.
 *
 * ⚠ WORTH REPORTING BEYOND THIS FILE: any production caller writing `validFrom: new Date()` inherits
 * the same up-to-1 ms dead window. Immaterial in practice; a trap for anyone writing a seat and
 * immediately asserting it is live.
 */
const PAST = `'2026-01-01T00:00:00.000Z'`;

/** A raw `waqf_access_grant` INSERT. The attack payload, and the scaffolding, are the same shape. */
function insertGrantSql(options: {
  readonly id: string;
  readonly userId: string;
  readonly waqfId?: string;
  readonly role?: string;
  readonly permissions?: readonly string[];
  readonly grantedByUserId?: string;
}): string {
  const {
    id,
    userId,
    waqfId = WAQF_A,
    role = 'NAZIR',
    permissions = ['approval:request:read', 'approval:request:approve'],
    grantedByUserId = 'user-seed-admin',
  } = options;
  return `INSERT INTO "waqf_access_grant"
      ("id","userId","waqfId","role","permissions","dataScopes","canViewAmlRestricted",
       "amlCompartment","beneficiarySelfId","scopeRefs","grantedByUserId","validFrom","validUntil",
       "revokedAt","createdAt","updatedAt")
    VALUES ('${id}','${userId}','${waqfId}','${role}'::"Role",
            ARRAY[${permissions.map((p) => `'${p}'`).join(',')}]::text[], ARRAY[]::text[],
            false, false, NULL, ARRAY[]::text[],
            '${grantedByUserId}', ${PAST}, NULL, NULL, now(), now())`;
}

function insertApprovalSql(options: {
  readonly id: string;
  readonly waqfId?: string;
  readonly type?: string;
  readonly status?: string;
  readonly makerId?: string;
  readonly checkerId?: string | null;
  readonly subjectId?: string;
}): string {
  const {
    id,
    waqfId = WAQF_A,
    type = 'BANK_MOVEMENT',
    status = 'PENDING',
    makerId = NAZIR,
    checkerId = null,
    subjectId = id,
  } = options;
  const decided = status === 'APPROVED' || status === 'EXECUTED' || status === 'REJECTED';
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","status","makerId","checkerId","subjectId","payloadHash","payload",
       "decidedAt","createdAt","updatedAt")
    VALUES ('${id}','${waqfId}','${type}'::"ApprovalType",'${status}'::"ApprovalStatus",
            '${makerId}', ${checkerId === null ? 'NULL' : `'${checkerId}'`}, '${subjectId}',
            ${status === 'APPROVED' || status === 'EXECUTED' ? `'${FAKE_HASH}'` : 'NULL'},
            '{"fixture":"e2 round-2 test row (بيانات وهمية)"}'::jsonb,
            ${decided ? 'now()' : 'NULL'}, now(), now())`;
}

describe.skipIf(!hasDatabase)('E2 round 2 · grant admission control', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  /** The FINANCE attacker's own scoped client — the one whose delegate correctly refuses. */
  const financeClient = (waqfIds: readonly string[]) =>
    db.createPrismaClient({
      actorId: FINANCE,
      actorType: 'USER',
      authorizedWaqfIds: [...waqfIds],
      permissions: ['finance:transaction:read', 'finance:transaction:write'],
      requestId: 'round2-forgery',
    } as never);

  /** The access-matrix administrator's client. Its permission claim is BACKED BY `ADMIN_GRANT`. */
  const adminClient = (waqfIds: readonly string[] = [WAQF_A]) =>
    // ⚠ THE PROVISIONING CONNECTION (ADR-0008 round 6). Every case in this file that admits or
    // refuses a `waqf_access_grant` write has to run on a role that HOLDS INSERT on it, or the ACL
    // refuses first and the guard under test never runs. `accessMatrixClient()` is what the shipped
    // `provisionAccessGrant()` uses; the admission trigger, the permission guard and every CHECK are
    // fully live on it, because the provisioner owns nothing and cannot suspend them.
    accessMatrixClient({
      actorId: ADMIN,
      actorType: 'USER',
      authorizedWaqfIds: [...waqfIds],
      permissions: ['admin:access_matrix:read', 'admin:access_matrix:write'],
      requestId: 'round2-admin',
    } as never);

  const attempt = async (sql: string): Promise<string | null> => {
    try {
      await prisma.$executeRawUnsafe(sql);
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  const grantExists = async (id: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "waqf_access_grant" WHERE "id" = '${id}'`,
    );
    return rows[0]?.n !== '0';
  };

  const hasActiveNazir = async (userId: string, waqfId: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<{ active: boolean }[]>(
      `SELECT qmulate_has_active_grant('${userId}','${waqfId}','NAZIR') AS active`,
    );
    return rows[0]?.active === true;
  };

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      authzScaffoldingSql([
        `DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${GRANT_PREFIX}%'`,
        `DELETE FROM "approval_request" WHERE "id" LIKE '${APPROVAL_PREFIX}%'`,
      ]),
    );
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    db = await databaseModule();
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

    // THE BOOTSTRAP SEAT — and since migration 9 it is provisioned through a PRIVILEGE rather than
    // through a claim.
    //
    // It has to be bootstrapped, and that is the point rather than a workaround: this file's subject
    // seats need an existing holder of `admin:access_matrix:write` to issue them, and on a seeded
    // database only PO-1's `user-admin-001` holds it (on `waqf-001` alone), never `PROVISIONER`.
    //
    // ⚠ WHAT CHANGED IN ROUND 5. This used to be written on a `makeSystemContext()` and admitted by
    // the `actorType = 'SYSTEM'` disjunct — "so it satisfies admission the way a real provisioning run
    // does, rather than by disabling anything". `00000000000009_e2_close_system_marker` deleted that
    // disjunct, because a caller who writes the marker row chooses `actorType`, and a FINANCE seat
    // used exactly that claim (with an `actorId` that was not even a `User` row) to mint itself an
    // ACTIVE NAZIR seat and approve another maker's SAR 4.5m bank movement. `provisionGrants()`
    // suspends admission explicitly — an OWNER-only operation — and keeps the write audited, which is
    // what makes the resulting seat "established" authority for the rest of this file.
    const systemCtx = db.makeSystemContext({
      actorId: PROVISIONER,
      authorizedWaqfIds: [WAQF_A, WAQF_B],
      requestId: 'round2-bootstrap',
      reason: 'test bootstrap of the first access-matrix administrator',
    });
    await provisionGrants(systemCtx, async (tx) => {
      await tx.waqfAccessGrant.create({
        data: {
          id: ADMIN_GRANT,
          userId: ADMIN,
          waqfId: WAQF_A, // WAQF_A ONLY — see the note on `ADMIN`.
          role: 'SYSTEM_ADMIN' as never,
          permissions: ['admin:access_matrix:read', 'admin:access_matrix:write'],
          dataScopes: [],
          scopeRefs: [],
          grantedByUserId: PROVISIONER,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    });
    // The disposable, immediately-revoked administrator on WAQF_B. Revoking is a pure NARROWING, so
    // it needs no admission of its own — which is itself the documented rule (see §4 below).
    await provisionGrants(systemCtx, async (tx) => {
      await tx.waqfAccessGrant.create({
        data: {
          id: REVOKED_ADMIN_GRANT,
          userId: REVOKED_ADMIN,
          waqfId: WAQF_B,
          role: 'SYSTEM_ADMIN' as never,
          permissions: ['admin:access_matrix:read', 'admin:access_matrix:write'],
          dataScopes: [],
          scopeRefs: [],
          grantedByUserId: PROVISIONER,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "waqf_access_grant" SET "revokedAt" = now() WHERE "id" = '${REVOKED_ADMIN_GRANT}'`,
    );

    expect(await grantExists(ADMIN_GRANT), 'the bootstrap admin seat was not written').toBe(true);
    const [revoked] = await prisma.$queryRawUnsafe<{ revokedAt: Date | null }[]>(
      `SELECT "revokedAt" FROM "waqf_access_grant" WHERE "id" = '${REVOKED_ADMIN_GRANT}'`,
    );
    expect(revoked?.revokedAt, 'the disposable admin seat was not revoked').not.toBeNull();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE HEADLINE — the exact reproduction, refused
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the raw-SQL grant forgery, from the very client that refused it', () => {
    it('step 1 · the scoped delegate REFUSES the FINANCE seat, as it always did', async () => {
      // The baseline, asserted rather than assumed: if this ever stops refusing, the raw-SQL
      // assertions below stop being about a bypass and start being about a permitted write.
      await expect(
        financeClient([WAQF_A]).waqfAccessGrant.create({
          data: {
            id: `${GRANT_PREFIX}101`,
            userId: FINANCE,
            waqfId: WAQF_A,
            role: 'NAZIR' as never,
            permissions: ['approval:request:approve'],
            dataScopes: [],
            scopeRefs: [],
            grantedByUserId: PROVISIONER,
            validFrom: new Date(),
          },
        }),
      ).rejects.toThrow(/AUTHORIZATION PLANE/);
      expect(await grantExists(`${GRANT_PREFIX}101`)).toBe(false);
    });

    it('step 2 · the SAME scoped client cannot re-issue it through $executeRawUnsafe', async () => {
      // THE BREAK. Prisma extensions do not see `$executeRawUnsafe`, so this statement reached
      // Postgres with every TypeScript control already behind it.
      const client = financeClient([WAQF_A]) as unknown as PrismaLike;
      const error = await (async () => {
        try {
          await client.$executeRawUnsafe(
            insertGrantSql({ id: `${GRANT_PREFIX}102`, userId: FINANCE }),
          );
          return null;
        } catch (e: unknown) {
          return errorText(e);
        }
      })();

      expect(error, 'a FINANCE seat minted itself a NAZIR grant from raw SQL').not.toBeNull();
      // ⚠ THE REFUSAL MOVED LAYERS IN ADR-0008 ROUND 6, AND THAT IS THE FINDING, NOT A TEST BREAKAGE.
      // Before: the statement reached Postgres and `waqf_access_grant_admission` refused it — a
      // TRIGGER reading the row, which is why route 2 (a forged marker naming a real admin) satisfied
      // it and could not be closed. Now the runtime role holds NO INSERT on `waqf_access_grant` at
      // all, so the statement is refused by the ACL and never reaches the trigger:
      // `42501 permission denied for table waqf_access_grant`. Strictly stronger — it does not depend
      // on the content of any row the caller can write.
      //
      // BOTH are accepted below, deliberately: the trigger message must stay matchable so this case
      // keeps passing on a database where the privilege matrix has not been applied (migration 10
      // degrades to a NOTICE when the roles are absent), rather than going red for the wrong reason.
      // The PRIVILEGE claim is asserted unconditionally, on the restricted connection, in
      // `authorization-plane-privilege.integration.test.ts` — that is the file that fails when the
      // matrix is missing.
      expect(error).toMatch(
        /authorization plane is not writable outside the AUDITED|permission denied for table waqf_access_grant/,
      );
      expect(error).toContain('42501');
      expect(await grantExists(`${GRANT_PREFIX}102`)).toBe(false);
    });

    it('step 2b · nor on an endowment the caller holds NOTHING on', async () => {
      // `waqf-002`: the FINANCE seat has no grant of any kind there, and its own client is scoped
      // to `waqf-001`. Both forgeries committed before migration 5.
      const client = financeClient([WAQF_A]) as unknown as PrismaLike;
      const error = await (async () => {
        try {
          await client.$executeRawUnsafe(
            insertGrantSql({ id: `${GRANT_PREFIX}103`, userId: FINANCE, waqfId: WAQF_B }),
          );
          return null;
        } catch (e: unknown) {
          return errorText(e);
        }
      })();
      expect(
        error,
        'a grant was forged on an endowment the caller holds nothing on',
      ).not.toBeNull();
      // Same two-layer note as step 2 above.
      expect(error).toMatch(
        /authorization plane is not writable outside the AUDITED|permission denied for table waqf_access_grant/,
      );
      expect(await grantExists(`${GRANT_PREFIX}103`)).toBe(false);
    });

    it('step 3 · the forger therefore never becomes an approval authority', async () => {
      // What the forged seat was FOR. `qmulate_has_active_grant(..., 'NAZIR')` returned TRUE on
      // both endowments once the forgery committed, and that predicate is the whole of
      // `approval_request_authority`'s check on who may be recorded as the checker.
      expect(await hasActiveNazir(FINANCE, WAQF_A)).toBe(false);
      expect(await hasActiveNazir(FINANCE, WAQF_B)).toBe(false);

      // And the end of the chain: another maker's PENDING approval cannot be decided by the forger.
      const id = `${APPROVAL_PREFIX}301`;
      await prisma.$executeRawUnsafe(authzScaffoldingSql([insertApprovalSql({ id })]));
      const error = await attempt(
        `UPDATE "approval_request"
            SET "status" = 'APPROVED', "checkerId" = '${FINANCE}', "decidedAt" = now(),
                "payloadHash" = '${FAKE_HASH}'
          WHERE "id" = '${id}'`,
      );
      expect(error, 'a FINANCE seat approved another maker’s request').not.toBeNull();
      expect(error).toMatch(/holds no ACTIVE NAZIR waqf_access_grant/);
    });

    it("a blank grantedByUserId is unrepresentable — `no_self_issue` accepted `''`", async () => {
      // `waqf_access_grant_no_self_issue` is `grantedByUserId <> userId`, which the empty string
      // satisfies: the same shape as C-10 case #4, where `''` satisfied `IS NOT NULL`. A CHECK,
      // deliberately — CHECKs are not skipped by `session_replication_role = 'replica'` at all.
      const error = await runProbe(
        guardProbeSql(
          insertGrantSql({ id: `${GRANT_PREFIX}104`, userId: FINANCE, grantedByUserId: '' }),
          'check_violation',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[23514]`);
      expect(error).toMatch(/waqf_access_grant_granted_by_not_blank/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. THE MUTATION, EXECUTED — and the residual, demonstrated rather than claimed
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('MUTATION · the whole attack chain completes again the moment the guard is off', async () => {
    // Removing `waqf_access_grant_admission` is the mutation that re-breaks this file. It is RUN
    // here — inside a transaction that is rolled back — rather than described, because round 1
    // shipped a source-shape assertion that passed at full strength while the guard it described
    // was fully bypassable.
    //
    // ⚠ IT IS SIMULTANEOUSLY THE RESIDUAL. `ALTER TABLE … DISABLE TRIGGER` needs OWNERSHIP of the
    // table, and on Railway the runtime connects AS THE OWNER. So this test also proves that the
    // application role can switch the guard off — see ADR-0008 and the migration header. What is
    // closed is the SILENT path; what is not closed is a caller who already has owner rights.
    const ROLLBACK = '__qmulate_round2_rollback__';
    const observed: Record<string, unknown> = {};

    // PRECONDITIONS, asserted rather than assumed. This file shares one database with every sibling
    // integration file, and a sibling that leaves a NAZIR seat for the attacker — or leaves the
    // seeded FINANCE seat retired — would make the chain below prove something else entirely. Naming
    // the precondition means such a failure says WHICH assumption broke.
    expect(await hasActiveNazir(FINANCE, WAQF_A), 'the attacker already holds NAZIR here').toBe(
      false,
    );
    expect(await grantExists(`${GRANT_PREFIX}201`), 'a previous run left the forged seat').toBe(
      false,
    );

    // The step that actually failed is recorded, so a break says WHICH link of the chain broke
    // instead of only "the wrong error came out of the transaction".
    let unexpected: unknown;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_admission`,
        );
        await tx.$executeRawUnsafe(insertGrantSql({ id: `${GRANT_PREFIX}201`, userId: FINANCE }));

        const seat = await tx.$queryRawUnsafe<{ role: string; revokedAt: Date | null }[]>(
          `SELECT "role"::text AS role, "revokedAt" FROM "waqf_access_grant"
            WHERE "id" = '${GRANT_PREFIX}201'`,
        );
        observed.forgedSeatRole = seat[0]?.role;

        const active = await tx.$queryRawUnsafe<{ active: boolean }[]>(
          `SELECT qmulate_has_active_grant('${FINANCE}','${WAQF_A}','NAZIR') AS active`,
        );
        observed.forgedSeatIsActiveNazir = active[0]?.active;

        const id = `${APPROVAL_PREFIX}201`;
        await tx.$executeRawUnsafe(insertApprovalSql({ id }));
        await tx.$executeRawUnsafe(
          `UPDATE "approval_request"
              SET "status" = 'APPROVED', "checkerId" = '${FINANCE}', "decidedAt" = now(),
                  "payloadHash" = '${FAKE_HASH}'
            WHERE "id" = '${id}'`,
        );
        const decided = await tx.$queryRawUnsafe<{ status: string; checkerId: string }[]>(
          `SELECT "status"::text AS status, "checkerId" FROM "approval_request" WHERE "id" = '${id}'`,
        );
        observed.approvalStatus = decided[0]?.status;
        observed.approvalChecker = decided[0]?.checkerId;

        throw new Error(ROLLBACK);
      });
    } catch (error: unknown) {
      if (!errorText(error).includes(ROLLBACK)) unexpected = error;
    }

    // Without the trigger, every link of the chain closes: forged seat → active NAZIR → another
    // maker's request APPROVED by the forger. That is what migration 5 is standing in the way of.
    expect(
      unexpected === undefined
        ? null
        : `${errorText(unexpected)} | observed: ${JSON.stringify(observed)}`,
      'the mutation could not be driven to completion, so it proves nothing about the guard',
    ).toBeNull();
    expect(observed.forgedSeatRole).toBe('NAZIR');
    expect(observed.forgedSeatIsActiveNazir).toBe(true);
    expect(observed.approvalStatus).toBe('APPROVED');
    expect(observed.approvalChecker).toBe(FINANCE);

    // The rollback restored the guard AND left nothing behind.
    expect(await grantExists(`${GRANT_PREFIX}201`)).toBe(false);
    const [trigger] = await prisma.$queryRawUnsafe<{ tgenabled: string }[]>(
      `SELECT tgenabled::text AS tgenabled FROM pg_trigger
        WHERE tgname = 'waqf_access_grant_admission' AND NOT tgisinternal`,
    );
    expect(trigger?.tgenabled, 'the guard was left disabled').toBe('A');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. `grantedByUserId` IS NOT CALLER-SUPPLIED — and the ordinary Prisma delegate is covered
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the issuer is bound to the acting identity, not to the caller’s input', () => {
    it('ALLOWS the legitimate audited issue, and it lands in the trail', async () => {
      // The positive control. A guard that refuses everything is not a guard, it is an outage.
      const id = `${GRANT_PREFIX}401`;
      // A DELTA, never an absolute count. `audit_event` is append-only, so a previous run of this
      // very test has already left an event naming this id — the row was purged by `cleanup()`, the
      // event was not, and that asymmetry is gate G-1 working as designed.
      const eventsNamingGrant = async (): Promise<number> => {
        const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM "audit_event"
            WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${id}'`,
        );
        return Number(rows[0]?.n ?? '0');
      };
      const before = await eventsNamingGrant();

      await db.withAudit(adminClient(), async (tx) => {
        await tx.waqfAccessGrant.create({
          data: {
            id,
            userId: SUBJECT,
            waqfId: WAQF_A,
            role: 'COUNSEL' as never,
            permissions: ['endowment:waqf:read'],
            dataScopes: [],
            scopeRefs: [],
            grantedByUserId: ADMIN, // = the acting identity
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
        });
      });

      expect(await grantExists(id)).toBe(true);
      expect(
        (await eventsNamingGrant()) - before,
        'the admitted grant produced no audit event — or more than one',
      ).toBe(1);

      // …and the event names the ACTOR, which is the whole point of the marker: an access-matrix
      // change nobody can attribute is not an access-matrix change anybody should be able to make.
      const [event] = await prisma.$queryRawUnsafe<{ actorId: string; action: string }[]>(
        `SELECT "actorId", "action"::text AS action FROM "audit_event"
          WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${id}'
          ORDER BY "id" DESC LIMIT 1`,
      );
      expect(event?.actorId).toBe(ADMIN);
      expect(event?.action).toBe('CREATE');
    });

    it('REFUSES an audited issue that names somebody else as the issuer', async () => {
      // Not raw SQL — the ORDINARY Prisma delegate, by a caller who genuinely holds
      // `admin:access_matrix:write`. Naming a third party as `grantedByUserId` is what made
      // `waqf_access_grant_no_self_issue` (`grantedByUserId <> userId`) meaningless.
      const id = `${GRANT_PREFIX}402`;
      await expect(
        db.withAudit(adminClient(), async (tx) => {
          await tx.waqfAccessGrant.create({
            data: {
              id,
              userId: SUBJECT,
              waqfId: WAQF_A,
              role: 'AUDITOR' as never,
              permissions: ['endowment:waqf:read'],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: 'user-seed-admin', // NOT the acting identity
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
          });
        }),
      ).rejects.toThrow(/bound to the acting identity/);
      expect(await grantExists(id)).toBe(false);
    });

    it('makes SELF-PROMOTION unrepresentable through the ordinary delegate', async () => {
      // The second half of the finding, and it needs no raw SQL at all: an admin issuing themselves
      // a NAZIR seat while naming somebody else as issuer satisfied `no_self_issue` and committed.
      // Now the issuer is pinned to the actor, so the pair collapses to `grantedByUserId = userId`
      // and the CHECK — or the attribution guard, whichever the caller trips first — refuses.
      const id = `${GRANT_PREFIX}403`;
      let thrown: unknown;
      try {
        await db.withAudit(adminClient(), async (tx) => {
          await tx.waqfAccessGrant.create({
            data: {
              id,
              userId: ADMIN, // themselves
              waqfId: WAQF_A,
              role: 'NAZIR' as never,
              permissions: ['approval:request:approve'],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: 'user-seed-admin', // a third party, to dodge `no_self_issue`
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
          });
        });
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown, 'an admin self-promoted to NAZIR through the ordinary delegate').toBeDefined();
      expect(errorText(thrown)).toMatch(/bound to the acting identity|no_self_issue/);
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazir(ADMIN, WAQF_A)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. AUTHORITY IS PER ENDOWMENT, AND A CONTEXT CLAIM IS NOT AUTHORITY
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the admin verb is checked against an ACTIVE grant on THAT endowment', () => {
    it('REFUSES the same admin on an endowment where it holds no admin seat', async () => {
      // `ADMIN` holds a FAMILY_BOARD grant on waqf-002 and an admin seat on waqf-001 only. "Holds
      // a grant on B" and "may write B's access matrix" are different facts, and MP-08's mutation
      // is exactly dropping the `waqfId` clause from the lookup.
      const id = `${GRANT_PREFIX}404`;
      await expect(
        db.withAudit(adminClient([WAQF_A, WAQF_B]), async (tx) => {
          await tx.waqfAccessGrant.create({
            data: {
              id,
              userId: SUBJECT,
              waqfId: WAQF_B,
              role: 'COUNSEL' as never,
              permissions: ['endowment:waqf:read'],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: ADMIN,
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
          });
        }),
      ).rejects.toThrow(/holds no ACTIVE grant carrying "admin:access_matrix:write" on waqf/);
      expect(await grantExists(id)).toBe(false);
    });

    it('REFUSES an actor whose admin seat has been REVOKED', async () => {
      // The validity window is load-bearing: a revoked administrator is not an administrator, and
      // `qmulate_actor_holds_permission()` has to mirror `activeGrantWhere()`'s four clauses rather
      // than merely find a row. `REVOKED_ADMIN` holds the ONLY admin seat on WAQF_B and it was
      // revoked in `beforeAll`, so the revocation is the only variable here.
      const id = `${GRANT_PREFIX}405`;
      await expect(
        db.withAudit(
          // The PROVISIONING connection: the refusal under test is admission's authority clause, and
          // on the app connection the ACL refuses first (ADR-0008 round 6).
          accessMatrixClient({
            actorId: REVOKED_ADMIN,
            actorType: 'USER',
            authorizedWaqfIds: [WAQF_B],
            permissions: ['admin:access_matrix:read', 'admin:access_matrix:write'],
            requestId: 'round2-revoked-admin',
          } as never),
          async (tx) => {
            await tx.waqfAccessGrant.create({
              data: {
                id,
                userId: SUBJECT,
                waqfId: WAQF_B,
                role: 'COUNSEL' as never,
                permissions: ['endowment:waqf:read'],
                dataScopes: [],
                scopeRefs: [],
                grantedByUserId: REVOKED_ADMIN,
                validFrom: new Date('2026-01-01T00:00:00.000Z'),
              },
            });
          },
        ),
      ).rejects.toThrow(/holds no ACTIVE grant carrying "admin:access_matrix:write" on waqf/);
      expect(await grantExists(id)).toBe(false);
    });

    it('REFUSES a raw UPDATE that WIDENS a seat, and PERMITS one that narrows it', async () => {
      // Coverage matters as much here as it did for C-03. If only INSERT were governed, a caller
      // would raw-UPDATE `admin:access_matrix:write` onto their own existing seat — the
      // `permission_guard` allows a `write` verb on any role — and then issue a NAZIR grant through
      // the perfectly ordinary audited path, which would now find the permission present.
      const own = `grant-${FINANCE}-${WAQF_A}`;
      const widen = await attempt(
        `UPDATE "waqf_access_grant"
            SET "permissions" = "permissions" || ARRAY['admin:access_matrix:write']::text[]
          WHERE "id" = '${own}'`,
      );
      expect(widen, 'a seat granted itself the admin verb from raw SQL').not.toBeNull();
      expect(widen).toMatch(/widened "permissions"/);

      const [after] = await prisma.$queryRawUnsafe<{ has: boolean }[]>(
        `SELECT 'admin:access_matrix:write' = ANY("permissions") AS has
           FROM "waqf_access_grant" WHERE "id" = '${own}'`,
      );
      expect(after?.has).toBe(false);

      // ⚠ AND THE OTHER HALF, ASSERTED SO IT IS NOT MISTAKEN FOR CLOSED: a pure NARROWING is
      // deliberately NOT governed, so a raw revoke still leaves NO audit event. Break-glass
      // revocation of a compromised Nazir seat must not require the access-matrix path that is
      // itself under suspicion — but §12 wants an event for the suppression and there is none.
      // Rolled back; see the `it.todo` at the end of this file.
      const ROLLBACK = '__qmulate_round2_narrow__';
      let narrowed: string | undefined;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "revokedAt" = now() WHERE "id" = '${own}'`,
          );
          const rows = await tx.$queryRawUnsafe<{ revokedAt: Date | null }[]>(
            `SELECT "revokedAt" FROM "waqf_access_grant" WHERE "id" = '${own}'`,
          );
          narrowed = rows[0]?.revokedAt === null ? undefined : 'revoked';
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }
      expect(narrowed, 'a pure narrowing was refused — that is not the documented rule').toBe(
        'revoked',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 5. THE HARD-DELETE VERB — C-09 and C-13, the residues migration 4 §3.4 recorded
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-09 · a grant row is never hard-deleted', () => {
    it('refuses DELETE on a seeded seat', async () => {
      const error = await runProbe(
        guardProbeSql(
          `DELETE FROM "waqf_access_grant" WHERE "id" = 'grant-${NAZIR}-${WAQF_A}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "waqf_access_grant" is refused/);
    });

    it('refuses DELETE under session_replication_role = replica', async () => {
      // `ENABLE ALWAYS`, asserted behaviourally. A trigger created with a plain `CREATE TRIGGER` is
      // `tgenabled = 'O'` and one `SET` skips it — the Sprint-1 finding that defeated gate G-1.
      const error = await runProbe(
        guardProbeSql(
          `SET LOCAL session_replication_role = 'replica'; ` +
            `DELETE FROM "waqf_access_grant" WHERE "id" = 'grant-${NAZIR}-${WAQF_A}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "waqf_access_grant" is refused/);
    });

    it('closes DELETE + re-INSERT, the move that defeated the Shart guard as C-03', async () => {
      // Reproduced before migration 5: the seeded FINANCE seat was hard-deleted and re-inserted
      // with `role = 'NAZIR'`, defeating MP-15's write-once role — and, with it, both one-way
      // off-switches, because a re-INSERT has no OLD row to compare against.
      // A `DO` block, because two statements in one `$executeRawUnsafe` is a SYNTAX error under
      // Prisma's extended protocol — which would make this test pass for entirely the wrong reason.
      const own = `grant-${FINANCE}-${WAQF_A}`;
      const error = await attempt(
        [
          'DO $qm_reinsert$',
          'BEGIN',
          `  DELETE FROM "waqf_access_grant" WHERE "id" = '${own}';`,
          `  ${insertGrantSql({ id: own, userId: FINANCE, role: 'NAZIR' })};`,
          'END',
          '$qm_reinsert$;',
        ].join('\n'),
      );
      expect(error, 'delete + re-INSERT rewrote a seat’s role').not.toBeNull();
      expect(error).toMatch(/DELETE on "waqf_access_grant" is refused/);

      const [row] = await prisma.$queryRawUnsafe<{ role: string }[]>(
        `SELECT "role"::text AS role FROM "waqf_access_grant" WHERE "id" = '${own}'`,
      );
      expect(row?.role, 'the seeded FINANCE seat changed role').toBe('FINANCE');
    });
  });

  describe('C-13 · an approval request is never hard-deleted', () => {
    it('refuses DELETE on the seeded distribution approval', async () => {
      const error = await runProbe(
        guardProbeSql(
          `DELETE FROM "approval_request" WHERE "id" = 'appr-dist-001'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "approval_request" is refused/);
    });

    it('a maker cannot erase the REFUSAL they were given', async () => {
      // C-13's shape. Migration 4 closed SOFT-deleting a live request; the hard DELETE stayed open,
      // which is strictly worse — soft-delete at least leaves the row. A REJECTED approval is the
      // evidence that the maker-checker gate RAN and said no.
      // Written through the AUDITED path, deliberately: the guard's predicate is "the trail records
      // this row", so a raw-inserted scaffolding row would be purgeable and the assertion would be
      // about nothing. This is the shape a real refusal has.
      const id = `${APPROVAL_PREFIX}501`;
      // ⊕ S12-1 / AV4-02 (migration 50): a request is BORN PENDING, and the REFUSAL is a DECISION —
      // writable only on the approval plane. So the row is minted PENDING through the audited runtime
      // path (the maker's act) and REJECTED through `decideApproval()` (the Nazir's act, on the
      // provisioning connection). Two transactions, two actors, both in the trail — which is now the
      // ONLY shape a real refusal can have, and therefore the shape this assertion is about.
      const makerCtx = db.makeSystemContext({
        actorId: PROVISIONER,
        authorizedWaqfIds: [WAQF_A],
        requestId: 'round2-rejected-approval',
      });
      await db.withAudit(db.createPrismaClient(makerCtx), async (tx) => {
        await tx.approvalRequest.create({
          data: {
            id,
            waqfId: WAQF_A,
            type: 'BANK_MOVEMENT' as never,
            status: 'PENDING' as never,
            makerId: FINANCE,
            subjectId: id,
            payload: { fixture: 'e2 round-2 test row (بيانات وهمية)' } as never,
          },
        });
      });
      const decidedAt = new Date('2026-02-01T00:00:00.000Z');
      await db.decideApproval(
        db.makeSystemContext({
          actorId: NAZIR,
          authorizedWaqfIds: [WAQF_A],
          requestId: 'round2-rejected-approval-decision',
        }),
        {
          approvalRequestId: id,
          decision: 'REJECTED',
          checkerId: NAZIR,
          decidedAt,
          decidedAtHijri: '1447-08-13',
          checkerTotpAssertedAt: decidedAt,
        },
      );
      const error = await attempt(`DELETE FROM "approval_request" WHERE "id" = '${id}'`);
      expect(error, 'a maker erased a Nazir’s refusal').not.toBeNull();
      expect(error).toMatch(/DELETE on "approval_request" is refused/);

      const [row] = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status"::text AS status FROM "approval_request" WHERE "id" = '${id}'`,
      );
      expect(row?.status).toBe('REJECTED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 6. C-10 — the authority under a committed run cannot be pulled out afterwards
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-10 · a distribution’s authority survives the commit that verified it', () => {
    it('refuses to VOID an approval an APPROVED run is standing on', async () => {
      // `distribution_authority` is DEFERRED: it verifies the approval once, at the commit that
      // wrote the run, and never re-fires. Every other post-hoc invalidation is already shut
      // (`waqfId`/`type`/`subjectId`/`payload` are write-once; soft-deleting a live row is refused;
      // terminal states cannot be re-decided) — except VOIDing it, and except deleting it.
      //
      // Built and torn down inside ONE rolled-back transaction: `seed.integration.test.ts` counts
      // `distribution` rows absolutely, and the deferred authority check never fires because the
      // transaction never commits.
      const ROLLBACK = '__qmulate_round2_void__';
      const approval = `${APPROVAL_PREFIX}601`;
      const run = 'dist-adm-9601';
      let refusal: string | null = null;
      let voidAfterCancel: string | null = 'not attempted';

      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            insertApprovalSql({
              id: approval,
              type: 'DISTRIBUTION_RUN',
              status: 'APPROVED',
              makerId: FINANCE,
              checkerId: NAZIR,
              subjectId: run,
            }),
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "distribution"
               ("id","waqfId","periodStart","periodStartHijri","periodEnd","periodEndHijri",
                "grossRevenueSar","reserveSar","operatingSar","nazirFeeSar","distributableSar",
                "status","approvalRequestId","computationTrace","createdAt","updatedAt")
             VALUES ('${run}','${WAQF_A}','2026-01-01','1447-07-12','2026-12-31','1448-07-05',
                     100.00, 10.00, 10.00, 10.00, 70.00,
                     'APPROVED'::"DistributionStatus",'${approval}',
                     '{"fixture":"e2 round-2 test row (بيانات وهمية)"}'::jsonb, now(), now())`,
          );

          try {
            await tx.$executeRawUnsafe(
              `UPDATE "approval_request" SET "status" = 'VOID' WHERE "id" = '${approval}'`,
            );
          } catch (error: unknown) {
            refusal = errorText(error);
          }
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }

      expect(refusal, 'an approval a paid run stands on was VOIDed').not.toBeNull();
      expect(refusal).toMatch(/names this approval as its authority, so it may not be VOIDed/);

      // …and the escape is the documented one: retire the RUN, then the approval is free. Asserted
      // so the guard is a sequencing rule and not a dead end.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            insertApprovalSql({
              id: approval,
              type: 'DISTRIBUTION_RUN',
              status: 'APPROVED',
              makerId: FINANCE,
              checkerId: NAZIR,
              subjectId: run,
            }),
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "distribution"
               ("id","waqfId","periodStart","periodStartHijri","periodEnd","periodEndHijri",
                "grossRevenueSar","reserveSar","operatingSar","nazirFeeSar","distributableSar",
                "status","approvalRequestId","computationTrace","createdAt","updatedAt")
             VALUES ('${run}','${WAQF_A}','2026-01-01','1447-07-12','2026-12-31','1448-07-05',
                     100.00, 10.00, 10.00, 10.00, 70.00,
                     'APPROVED'::"DistributionStatus",'${approval}',
                     '{"fixture":"e2 round-2 test row (بيانات وهمية)"}'::jsonb, now(), now())`,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "distribution" SET "status" = 'CANCELLED' WHERE "id" = '${run}'`,
          );
          try {
            await tx.$executeRawUnsafe(
              `UPDATE "approval_request" SET "status" = 'VOID' WHERE "id" = '${approval}'`,
            );
            voidAfterCancel = null;
          } catch (error: unknown) {
            voidAfterCancel = errorText(error);
          }
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }
      expect(voidAfterCancel, 'VOID was refused even after the run was cancelled').toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 7. THE SUBCONTRACTOR / TITLE-DEED FINDING
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('an asset’s title-deed number is reserved-matter-only', () => {
    const SUB_GRANT = `${GRANT_PREFIX}701`;
    const ASSET = 'asset-001';
    let originalDeed: string;

    beforeAll(async () => {
      const [row] = await prisma.$queryRawUnsafe<{ titleDeedNumber: string }[]>(
        `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = '${ASSET}'`,
      );
      originalDeed = row?.titleDeedNumber ?? '';
      expect(originalDeed).not.toBe('');

      // A real SUBCONTRACTOR seat, issued through the audited admin path — the seat the re-attack
      // used. It holds compliance/document write permissions and NOTHING about endowment identity.
      await db.withAudit(adminClient(), async (tx) => {
        await tx.waqfAccessGrant.create({
          data: {
            id: SUB_GRANT,
            userId: SUBJECT,
            waqfId: WAQF_A,
            role: 'SUBCONTRACTOR' as never,
            permissions: ['compliance:task:write', 'document:document:write'],
            dataScopes: ['compliance', 'documents'],
            scopeRefs: [],
            grantedByUserId: ADMIN,
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
        });
      });
    });

    it('refuses the subcontractor seat that rewrote it, at the database', async () => {
      // FOUND IN THE FINAL RE-ATTACK, pre-existing: a subcontractor seat holding only
      // compliance/document write permissions rewrote `asset-001`'s title-deed number.
      const subClient = db.createPrismaClient({
        actorId: SUBJECT,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        permissions: ['compliance:task:write', 'document:document:write'],
        requestId: 'round2-subcontractor',
      } as never);

      let thrown: unknown;
      try {
        await subClient.asset.update({
          where: { id: ASSET },
          data: { titleDeedNumber: 'FORGED-BY-SUBCONTRACTOR' },
        });
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown, 'a subcontractor rewrote a corpus asset’s title deed').toBeDefined();
      expect(errorText(thrown)).toMatch(/is reserved-matter-only/);

      const [row] = await prisma.$queryRawUnsafe<{ titleDeedNumber: string }[]>(
        `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = '${ASSET}'`,
      );
      expect(row?.titleDeedNumber).toBe(originalDeed);
    });

    it('refuses raw SQL too, and refuses an approval for the WRONG artifact (C-14)', async () => {
      const raw = await attempt(
        `UPDATE "asset" SET "titleDeedNumber" = 'FORGED-RAW' WHERE "id" = '${ASSET}'`,
      );
      expect(raw, 'a raw UPDATE rewrote a corpus asset’s title deed').not.toBeNull();
      expect(raw).toMatch(/is reserved-matter-only/);

      // A GENUINE approval — APPROVED, RESERVED_MATTER, right endowment, maker <> checker — but for
      // a DIFFERENT artifact. C-14's lesson: an approval binds to the thing it approved.
      const wrong = `${APPROVAL_PREFIX}702`;
      await prisma.$executeRawUnsafe(
        authzScaffoldingSql([
          insertApprovalSql({
            id: wrong,
            type: 'RESERVED_MATTER',
            status: 'APPROVED',
            makerId: FINANCE,
            checkerId: NAZIR,
            subjectId: `waqf:${WAQF_A}:deedNumber`, // a different artifact entirely
          }),
        ]),
      );
      const misaddressed = await attempt(
        [
          'DO $qm_wrong_subject$',
          'BEGIN',
          `  PERFORM set_config('qmulate.reserved_matter_approval_id', '${wrong}', true);`,
          `  UPDATE "asset" SET "titleDeedNumber" = 'FORGED-WRONG-SUBJECT' WHERE "id" = '${ASSET}';`,
          'END',
          '$qm_wrong_subject$;',
        ].join('\n'),
      );
      expect(misaddressed, 'an approval for another artifact opened the title deed').not.toBeNull();
      expect(misaddressed).toMatch(/was approved for subject/);
    });

    it('OPENS for a genuine approval that names this artifact', async () => {
      // The positive control, rolled back. The subject grammar is `asset:<id>:titleDeedNumber`,
      // the same shape `waqf:<id>:deedNumber` already uses.
      const right = `${APPROVAL_PREFIX}703`;
      await prisma.$executeRawUnsafe(
        authzScaffoldingSql([
          insertApprovalSql({
            id: right,
            type: 'RESERVED_MATTER',
            status: 'APPROVED',
            makerId: FINANCE,
            checkerId: NAZIR,
            subjectId: `asset:${ASSET}:titleDeedNumber`,
          }),
        ]),
      );

      const ROLLBACK = '__qmulate_round2_deed__';
      let written: string | undefined;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('qmulate.reserved_matter_approval_id', '${right}', true)`,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "asset" SET "titleDeedNumber" = 'FAKE-CORRECTED-9001' WHERE "id" = '${ASSET}'`,
          );
          const rows = await tx.$queryRawUnsafe<{ titleDeedNumber: string }[]>(
            `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = '${ASSET}'`,
          );
          written = rows[0]?.titleDeedNumber;
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }
      expect(written, 'a genuine, artifact-bound approval did not open the column').toBe(
        'FAKE-CORRECTED-9001',
      );

      const [row] = await prisma.$queryRawUnsafe<{ titleDeedNumber: string }[]>(
        `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = '${ASSET}'`,
      );
      expect(row?.titleDeedNumber).toBe(originalDeed);
    });

    it.todo(
      'SURFACED, NOT RESOLVED — this closes the DAMAGE, not the CAUSE. A SUBCONTRACTOR seat holding ' +
        'only compliance/document write permissions can still WRITE `asset` at all: it reaches ' +
        '`asset.update` and is stopped by a column guard, not by the permission ladder. The ' +
        'permission-to-model mapping is the force filter in ' +
        'packages/database/src/extensions/scoping.ts, which this migration does not own. Also ' +
        'unclosed: `asset` has no DELETE guard, so DELETE + re-INSERT still walks around the column ' +
        'guard exactly as C-03 walked around the Shart guard, and only `titleDeedNumber` is gated ' +
        '(`addressAr`, `valuationSar`, `type` are not).',
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 8. WHAT IS STILL OPEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.todo(
    'NOT CLOSED, DEFERRED TO E12 BY ADR-0008 — privilege separation. Every guard in migration 5 is ' +
      'DDL-droppable and `ALTER TABLE … DISABLE TRIGGER`-able by the table OWNER, and on Railway ' +
      'the runtime connects AS THE OWNER, so the application role can switch off its own admission ' +
      'control (the MUTATION test above does exactly that, on purpose). The complete fix is that ' +
      'the runtime role must not own — and must hold no INSERT/UPDATE/DELETE on — ' +
      '`waqf_access_grant` / `approval_request` / `membership`, with issuance behind a SECURITY ' +
      'DEFINER procedure owned by the migrator. Until that lands, the admission marker is a ' +
      'DETECTION property (a forgery must appear in the append-only trail and breaks G-1), never a ' +
      'PREVENTION one, and no real client data may reach this system.',
  );

  it.todo(
    'NOT CLOSED — a raw NARROWING of a grant (revoke, soft-delete, shorten the window) is ' +
      'deliberately outside admission, so it still produces NO audit event: a live NAZIR seat can ' +
      'be silently suppressed from raw SQL, which §12 wants recorded as an `AuditEvent ' +
      'action = delete_soft`. Governing it means deciding whether break-glass revocation of a ' +
      'compromised seat may require the very access-matrix path under suspicion — a product ' +
      'decision, not a mechanical one. Surfaced, not resolved.',
  );

  it.todo(
    'COSMETIC FOLLOW-UP, NOT OWNED HERE — `activateGrant()` in packages/api/src/context.ts already ' +
      'writes `grantedByUserId: ctx.actor.actorId` and marks its `input.grantedByUserId` ' +
      '`@deprecated ACCEPTED AND IGNORED`, so the two layers agree; the database check is the half ' +
      'that survives raw SQL. What is left is deleting the ignored parameter, because a parameter ' +
      'nothing reads is a trap for the next caller.',
  );
});
