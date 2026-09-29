/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-1 · AV4-02 IS CLOSED — THE APPROVAL DECISION LEAVES THE RUNTIME CREDENTIAL (migration 50)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * The defect, in the register's words: `qmulate_app` CAN MINT ITS OWN `APPROVED` `RESERVED_MATTER`
 * `approval_request` AND SPEND IT IN THE SAME TRANSACTION — measured in S4 round 4 against
 * `asset:asset-001:titleDeedNumber`, and qualifying every "refused 42501 as `qmulate_app`"
 * measurement of a reserved-matter gate in this repository.
 *
 * This file runs THAT SCRIPT, statement by statement, as `qmulate_app`, and asserts each statement
 * is now refused by connection role — then runs the MUTATION (the role clause neutralised) and
 * asserts the attack is admitted again, then restores and re-asserts. The positive controls run the
 * same decision on the provisioning connection (raw) and through `decideApproval()` (the door).
 *
 * ── WHAT THIS FILE PROVES, AND THE EXACT BOUND ─────────────────────────────────────────────
 *   · A caller holding ONLY `DATABASE_URL` cannot create a decided approval, cannot decide a
 *     pending one, and therefore cannot cut a key for any reserved-matter gate. Every "refused as
 *     `qmulate_app`" measurement of a gate is NO LONGER qualified by AV4-02.
 *   · It does NOT prove anything about a caller holding `ACCESS_MATRIX_DATABASE_URL` — that
 *     credential IS the approval plane (and already held approval power transitively through a
 *     forged NAZIR seat). Code inside the web process holds it. ADR-0008 round 7 records this.
 *   · Refusals are asserted on `basePrisma()` (the runtime role) and NEVER on the owner; the
 *     harness's `assertRefusalConnectionIsRestricted()` fails the run if that connection is a
 *     superuser (migration 11's lesson: a refusal observed on a superuser proves nothing).
 *
 * ── EVERY RUNTIME-ROLE STATEMENT IS ROLLED BACK ────────────────────────────────────────────
 * The two positive controls that must COMMIT use a per-run nonce in both the id and the subject,
 * so a crashed run cannot collide with the next on `approval_request_one_open_per_subject`, and
 * are retired (`VOID`, a terminal state) rather than deleted — a decided row is named by the audit
 * trail and `approval_request_no_delete` protects it, correctly.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_SUCCEEDED,
  rollbackProbeSql,
  accessMatrixClient,
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-1 · AV4-02 closure — the approval decision plane');

const WAQF = 'waqf-001';
/**
 * 3b COMMITS a decided row and a decided row cannot be deleted (trail-named), so it lands on an endowment
 * whose per-class row counts no api pin measures. `field-class-disclosure` pins waqf-001's classes;
 * waqf-002 carries the same seeded NAZIR seat for the checker.
 */
const DOOR_WAQF = 'waqf-002';
const ASSET = 'asset-001';
const MAKER = 'user-accountant-001';
/** Holds an ACTIVE `NAZIR` grant on waqf-001 in the fixture — the recorded checker of dist-001. */
const CHECKER = 'user-approver-001';
const RUN_NONCE = `${String(process.pid)}-${String(Date.now())}`;
/** 95xx — never the fixture's `appr-dist-`, never a sibling file's 90xx/94xx. */
const ID = (suffix: string): string => `appr-s12-95${suffix}`;
const PAST = `'2026-01-01T00:00:00.000Z'`;
const HASH = `'${'a'.repeat(64)}'`;

type RawClient = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

interface InsertOptions {
  readonly id: string;
  readonly waqfId?: string;
  readonly status: 'PENDING' | 'APPROVED';
  /** Present ⇒ the row is born DECIDED (checkerId + both instants + the TOTP assertion). */
  readonly decided: boolean;
  readonly subjectId?: string;
}

function insertSql(o: InsertOptions): string {
  const subject = o.subjectId ?? `asset:${ASSET}:titleDeedNumber`;
  // ⊕ S12-2 (migration 51): a KINDED reserved matter cannot be APPROVED with its BR-1102 chain
  // unrecorded, so every scaffold row here carries the two required steps as recorded facts — this
  // file is about the DECISION plane, and the chain is not what it measures.
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","reservedMatterKind","payload","status","makerId","checkerId","subjectId",
       "payloadHash","decidedAt","decidedAtHijri","checkerTotpAssertedAt",
       "counselReviewRequired","authorityNoticeRequired",
       "principalConsentRecordedAt","principalConsentRecordedAtHijri","principalConsentBy","principalConsentReference",
       "counselReviewRecordedAt","counselReviewRecordedAtHijri","counselReviewBy","counselReviewReference",
       "createdAt","updatedAt")
    VALUES ('${o.id}','${o.waqfId ?? WAQF}','RESERVED_MATTER'::"ApprovalType",'ASSET_DISPOSAL'::"ReservedMatterKind",
       '{"probe":"s12-1 av4-02 (بيانات وهمية)","nonce":"${RUN_NONCE}"}'::jsonb,
       '${o.status}'::"ApprovalStatus",'${MAKER}',${o.decided ? `'${CHECKER}'` : 'NULL'},'${subject}',
       ${HASH},${o.decided ? `${PAST}::timestamp` : 'NULL'},${o.decided ? `'1447-07-12'` : 'NULL'},
       ${o.decided ? `${PAST}::timestamp` : 'NULL'}, true, false,
       ${PAST}::timestamp, '1447-07-12', 'user-case-manager-001', 'FAKE-BOARD-LETTER-${RUN_NONCE}',
       ${PAST}::timestamp, '1447-07-12', 'user-case-manager-001', 'FAKE-COUNSEL-MEMO-${RUN_NONCE}',
       now(), now())`;
}

const decideSql = (id: string, status: 'APPROVED' | 'REJECTED' = 'APPROVED'): string =>
  `UPDATE "approval_request"
      SET "status" = '${status}'::"ApprovalStatus", "checkerId" = '${CHECKER}',
          "decidedAt" = ${PAST}::timestamp, "decidedAtHijri" = '1447-07-12',
          "checkerTotpAssertedAt" = ${PAST}::timestamp
    WHERE "id" = '${id}'`;

const spendSql = (id: string): readonly string[] => [
  `SELECT set_config('qmulate.reserved_matter_approval_id', '${id}', true)`,
  `UPDATE "asset" SET "titleDeedNumber" = 'FORGED-${RUN_NONCE}' WHERE "id" = '${ASSET}'`,
];

describe.skipIf(!hasDatabase)('S12-1 · AV4-02 — only the approval plane decides', () => {
  let app: RawClient;
  let owner: RawClient;
  let provisioner: RawClient;
  let makeSystemContext: Awaited<ReturnType<typeof databaseModule>>['makeSystemContext'];

  /**
   * ⚠ ONE STATEMENT, ONE CONNECTION (S12-5c). This used to issue `BEGIN` / statements / `ROLLBACK` as
   * separate calls on a POOLED Prisma client. S12-5b removed that shape from the gate and birth suites
   * after CI run 34231994890 hung for 25 minutes in the integration job; whether the pool split those
   * calls is a HYPOTHESIS (the S2 privilege suite uses the same shape and has passed CI for months), but
   * the hazard class is real and the harness's `rollbackProbeSql` removes it: every statement inside one
   * `DO` block that always RAISES, so no transaction can outlive its statement. `SET CONSTRAINTS ALL
   * IMMEDIATE` keeps DEFERRED constraint triggers observable in-block.
   */
  const attemptInRolledBackTx = async (
    client: RawClient,
    statements: readonly string[],
  ): Promise<string | null> => {
    try {
      // Inside a DO block a bare `SELECT set_config(…)` has no destination; PERFORM is the plpgsql form.
      const inBlock = statements.map((statement) =>
        statement.replace(/^\s*SELECT\s+set_config/i, 'PERFORM set_config'),
      );
      await client.$executeRawUnsafe(
        rollbackProbeSql(['SET CONSTRAINTS ALL IMMEDIATE', ...inBlock]),
      );
    } catch (error: unknown) {
      const text = errorText(error);
      return text.includes(PROBE_SUCCEEDED) ? null : text;
    }
    throw new Error('a rolled-back probe completed without raising — the SQL never ran as written');
  };

  const rowStatus = async (id: string): Promise<string | null> => {
    const rows = await owner.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status"::text AS status FROM "approval_request" WHERE "id" = '${id}'`,
    );
    return rows[0]?.status ?? null;
  };

  const titleDeed = async (): Promise<string | null> => {
    const rows = await app.$queryRawUnsafe<{ t: string }[]>(
      `SELECT "titleDeedNumber" AS t FROM "asset" WHERE "id" = '${ASSET}'`,
    );
    return rows[0]?.t ?? null;
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    ({ makeSystemContext } = await databaseModule());
    app = (await basePrisma()) as unknown as RawClient;
    owner = (await privilegedPrisma()) as unknown as RawClient;
    provisioner = accessMatrixClient(
      makeSystemContext({ actorId: CHECKER, requestId: `s12-1-${RUN_NONCE}` }),
    ) as unknown as RawClient;
    // Leftovers from a crashed run: only the UNdecided ones can go (a decided row is trail-named).
    await owner.$executeRawUnsafe(
      `DELETE FROM "approval_request" WHERE "id" LIKE 'appr-s12-95%' AND "checkerId" IS NULL`,
    );
  }, 300_000);

  afterAll(async () => {
    await owner.$executeRawUnsafe(
      `DELETE FROM "approval_request" WHERE "id" LIKE 'appr-s12-95%' AND "checkerId" IS NULL`,
    );
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════
  // 1 · THE AV4-02 SCRIPT, AS qmulate_app, STATEMENT BY STATEMENT
  // ═══════════════════════════════════════════════════════

  describe('1 · the AV4-02 script is refused as qmulate_app', () => {
    it('1a · step 1 — INSERT of an already-APPROVED RESERVED_MATTER row is refused: born PENDING', async () => {
      const before = await titleDeed();
      const failure = await attemptInRolledBackTx(app, [
        insertSql({ id: ID('01'), status: 'APPROVED', decided: true }),
      ]);
      expect(
        failure,
        'the runtime role inserted a decided approval — AV4-02 step 1 is OPEN',
      ).not.toBeNull();
      expect(failure).toMatch(/BORN PENDING/);
      expect(failure).toMatch(/not the approval plane/);
      expect(await titleDeed()).toBe(before);
    });

    it('1b · step 1, the whole script — mint APPROVED, set the GUC, spend it: refused at the mint', async () => {
      const before = await titleDeed();
      const failure = await attemptInRolledBackTx(app, [
        insertSql({ id: ID('02'), status: 'APPROVED', decided: true }),
        ...spendSql(ID('02')),
      ]);
      expect(failure).toMatch(/BORN PENDING/);
      expect(await titleDeed(), 'the title deed changed under a self-minted approval').toBe(before);
    });

    it('1c · step 2 — a PENDING row minted by the runtime cannot be flipped to APPROVED by it', async () => {
      const failure = await attemptInRolledBackTx(app, [
        insertSql({ id: ID('03'), status: 'PENDING', decided: false }),
        decideSql(ID('03')),
      ]);
      expect(
        failure,
        'the runtime role decided its own request — AV4-02 step 2 is OPEN',
      ).not.toBeNull();
      expect(failure).toMatch(/ONLY THE APPROVAL PLANE DECIDES/);
      expect(failure).toMatch(/qmulate_app/);
    });

    it('1d · step 3 — the unforged PENDING key does not open the title deed', async () => {
      const before = await titleDeed();
      const failure = await attemptInRolledBackTx(app, [
        insertSql({ id: ID('04'), status: 'PENDING', decided: false }),
        ...spendSql(ID('04')),
      ]);
      expect(failure).not.toBeNull();
      // `qmulate_reserved_matter_defect()`: "approval_request %L is %L, not APPROVED".
      expect(failure).toMatch(/is 'PENDING', not APPROVED|is PENDING, not APPROVED/);
      expect(await titleDeed()).toBe(before);
    });

    it('1e · each decision column alone is refused from the runtime, and so is REJECTED', async () => {
      const variants: readonly [string, string][] = [
        [
          'checkerId',
          `UPDATE "approval_request" SET "checkerId" = '${CHECKER}' WHERE "id" = '${ID('05')}'`,
        ],
        [
          'decidedAt',
          `UPDATE "approval_request" SET "decidedAt" = ${PAST}::timestamp WHERE "id" = '${ID('05')}'`,
        ],
        [
          'decidedAtHijri',
          `UPDATE "approval_request" SET "decidedAtHijri" = '1447-07-12' WHERE "id" = '${ID('05')}'`,
        ],
        [
          'checkerTotpAssertedAt',
          `UPDATE "approval_request" SET "checkerTotpAssertedAt" = ${PAST}::timestamp WHERE "id" = '${ID('05')}'`,
        ],
        ['REJECTED', decideSql(ID('05'), 'REJECTED')],
      ];
      for (const [column, sql] of variants) {
        const failure = await attemptInRolledBackTx(app, [
          insertSql({ id: ID('05'), status: 'PENDING', decided: false }),
          sql,
        ]);
        expect(failure, `runtime wrote decision column ${column}`).toMatch(
          /ONLY THE APPROVAL PLANE DECIDES/,
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 2 · WHAT STAYS ON THE RUNTIME — the matrix is not too tight
  // ═══════════════════════════════════════════════════════

  describe('2 · minting, spending and retiring stay on the runtime role', () => {
    it('2a · INSERT of a PENDING row and PENDING → VOID are PERMITTED for qmulate_app (rolled back)', async () => {
      const failure = await attemptInRolledBackTx(app, [
        insertSql({ id: ID('06'), status: 'PENDING', decided: false }),
        `UPDATE "approval_request" SET "status" = 'VOID'::"ApprovalStatus" WHERE "id" = '${ID('06')}'`,
      ]);
      expect(
        failure,
        'the runtime role can no longer mint or retire a request — migration 50 is too tight and ' +
          'the maker path is broken, not merely tested',
      ).toBeNull();
    });

    it('2b · APPROVED → EXECUTED (spending) is PERMITTED for qmulate_app (rolled back)', async () => {
      // The APPROVED row must exist COMMITTED for the runtime session to see it, so it is laid down
      // by the OWNER (the approval plane) — raw, un-audited, and therefore deletable afterwards.
      const id = `${ID('07')}-${RUN_NONCE}`;
      await owner.$executeRawUnsafe(
        insertSql({ id, status: 'APPROVED', decided: true, subjectId: `s12-1:spend:${RUN_NONCE}` }),
      );
      try {
        const failure = await attemptInRolledBackTx(app, [
          `UPDATE "approval_request" SET "status" = 'EXECUTED'::"ApprovalStatus" WHERE "id" = '${id}'`,
        ]);
        expect(
          failure,
          'the runtime role cannot SPEND an approval — every execute path is broken',
        ).toBeNull();
      } finally {
        await owner.$executeRawUnsafe(`DELETE FROM "approval_request" WHERE "id" = '${id}'`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 3 · POSITIVE CONTROLS — the plane decides
  // ═══════════════════════════════════════════════════════

  describe('3 · the approval plane decides', () => {
    it('3a · the provisioning connection flips PENDING → APPROVED (raw, rolled back)', async () => {
      const id = `${ID('08')}-${RUN_NONCE}`;
      await owner.$executeRawUnsafe(
        insertSql({ id, status: 'PENDING', decided: false, subjectId: `s12-1:prov:${RUN_NONCE}` }),
      );
      try {
        const failure = await attemptInRolledBackTx(provisioner, [decideSql(id)]);
        expect(
          failure,
          'the PROVISIONER was refused the decision — nobody can approve anything and the product is down',
        ).toBeNull();
        // A rolled-back decision leaves the row PENDING.
        expect(await rowStatus(id)).toBe('PENDING');
      } finally {
        await owner.$executeRawUnsafe(`DELETE FROM "approval_request" WHERE "id" = '${id}'`);
      }
    });

    it('3a-NEGATIVE · the provisioning connection may DECIDE but not MINT (no INSERT)', async () => {
      const failure = await attemptInRolledBackTx(provisioner, [
        insertSql({ id: ID('09'), status: 'PENDING', decided: false }),
      ]);
      expect(
        failure,
        'the provisioner minted a request — the plane is wider than "decide"',
      ).not.toBeNull();
      expect(failure).toMatch(/permission denied/i);
    });

    it('3b · decideApproval() end to end: APPROVED, the checker recorded, the APPROVE event in the trail', async () => {
      const { decideApproval } = await databaseModule();
      const id = `${ID('10')}-${RUN_NONCE}`;
      const subjectId = `s12-1:door:${RUN_NONCE}`;
      await owner.$executeRawUnsafe(
        insertSql({ id, waqfId: DOOR_WAQF, status: 'PENDING', decided: false, subjectId }),
      );

      const ctx = makeSystemContext({ actorId: CHECKER, requestId: `s12-1-door-${RUN_NONCE}` });
      // The dual-date pair is the harness's KNOWN pair (2026-01-01 ↔ 1447-07-12): `dual-date-pair`
      // sweeps every stored pair against the one Hijri implementation, and a hand-typed twin failed it.
      const decidedAt = new Date('2026-01-01T00:00:00.000Z');
      const decided = await decideApproval(ctx, {
        approvalRequestId: id,
        decision: 'APPROVED',
        checkerId: CHECKER,
        decidedAt,
        decidedAtHijri: '1447-07-12',
        checkerTotpAssertedAt: decidedAt,
        event: {
          action: 'APPROVE',
          category: 'APPROVAL',
          classification: 'SENSITIVE',
          entityType: 'ApprovalRequest',
          entityId: id,
          waqfId: DOOR_WAQF,
          extraContext: { probe: 's12-1 3b', nonce: RUN_NONCE },
        },
      });

      expect(decided.status).toBe('APPROVED');
      expect(decided.checkerId).toBe(CHECKER);
      expect(await rowStatus(id)).toBe('APPROVED');

      const events = await owner.$queryRawUnsafe<{ action: string; n: string }[]>(
        `SELECT "action"::text AS action, count(*)::text AS n FROM "audit_event"
          WHERE "entityType" = 'ApprovalRequest' AND "entityId" = '${id}'
          GROUP BY "action" ORDER BY "action"`,
      );
      // The extension projects the UPDATE as APPROVE, and the door records the explicit APPROVE:
      // two events, both APPROVE, both in the transaction that decided.
      expect(events).toEqual([{ action: 'APPROVE', n: '2' }]);

      // Retire, never delete: the row is trail-named. APPROVED → VOID is a runtime act.
      const voided = await attemptInRolledBackTx(app, []);
      expect(voided).toBeNull();
      await app.$executeRawUnsafe(
        `UPDATE "approval_request" SET "status" = 'VOID'::"ApprovalStatus" WHERE "id" = '${id}'`,
      );
      expect(await rowStatus(id)).toBe('VOID');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 4 · THE MUTATION — run, observed, restored, re-observed
  // ═══════════════════════════════════════════════════════

  describe('4 · mutation: with the role clause neutralised the attack is ADMITTED again', () => {
    it('4a · neutralise qmulate_is_approval_plane_role() → AV4-02 step 2 passes; restore → refused', async () => {
      const defs = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_is_approval_plane_role()'::regprocedure) AS def`,
      );
      const original = defs[0]?.def;
      expect(
        original,
        'qmulate_is_approval_plane_role() is missing — migration 50 did not run',
      ).toBeTruthy();
      expect(original).toMatch(/qmulate_provisioning_role\(\)/);

      let underMutation: string | null = 'not-attempted';
      let wholeScriptUnderMutation: string | null = 'not-attempted';
      const before = await titleDeed();
      try {
        await owner.$executeRawUnsafe(
          `CREATE OR REPLACE FUNCTION qmulate_is_approval_plane_role() RETURNS boolean
             LANGUAGE sql STABLE AS $qm_mut$ SELECT true $qm_mut$`,
        );
        underMutation = await attemptInRolledBackTx(app, [
          insertSql({ id: ID('11'), status: 'PENDING', decided: false }),
          decideSql(ID('11')),
        ]);
        // THE ORIGINAL AV4-02 SCRIPT, VERBATIM IN SHAPE: mint APPROVED, set the GUC, move the deed.
        wholeScriptUnderMutation = await attemptInRolledBackTx(app, [
          insertSql({ id: ID('12'), status: 'APPROVED', decided: true }),
          ...spendSql(ID('12')),
        ]);
      } finally {
        await owner.$executeRawUnsafe(original as string);
      }

      expect(
        underMutation,
        'with the role clause removed the runtime was STILL refused — so something other than this ' +
          'clause is refusing, and this file is not measuring the control it claims to',
      ).toBeNull();
      expect(
        wholeScriptUnderMutation,
        'under mutation the whole AV4-02 script should have been ADMITTED (and rolled back)',
      ).toBeNull();
      // Rolled back: the deed is unchanged even though the attack was admitted.
      expect(await titleDeed()).toBe(before);

      // Restored: the same statements are refused again.
      const restored = await attemptInRolledBackTx(app, [
        insertSql({ id: ID('13'), status: 'PENDING', decided: false }),
        decideSql(ID('13')),
      ]);
      expect(restored).toMatch(/ONLY THE APPROVAL PLANE DECIDES/);
      const defsAfter = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_is_approval_plane_role()'::regprocedure) AS def`,
      );
      expect(defsAfter[0]?.def).toBe(original);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 5 · POSTURE — read from the catalogue
  // ═══════════════════════════════════════════════════════

  describe('5 · the posture', () => {
    it('5a · the provisioner holds SELECT + UPDATE on approval_request and NO INSERT; the runtime holds SELECT, INSERT, UPDATE', async () => {
      // `information_schema` columns are domain types Prisma's raw path cannot deserialise, so
      // everything is cast to text and the list is a comma-joined string.
      const rows = await owner.$queryRawUnsafe<{ grantee: string; privs: string }[]>(
        `SELECT grantee::text AS grantee,
                string_agg(privilege_type::text, ',' ORDER BY privilege_type::text) AS privs
           FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = 'approval_request'
            AND grantee::text IN ('qmulate_app', 'qmulate_provisioner')
          GROUP BY grantee::text ORDER BY grantee::text`,
      );
      const byRole = Object.fromEntries(rows.map((r) => [r.grantee, r.privs.split(',')]));
      expect(byRole['qmulate_app']).toEqual(['INSERT', 'SELECT', 'UPDATE']);
      expect(byRole['qmulate_provisioner']).toEqual(['SELECT', 'UPDATE']);
    });

    it('5b · the CHECK approval_request_pending_has_no_checker is installed and bites (owner, rolled back)', async () => {
      const failure = await attemptInRolledBackTx(owner, [
        `INSERT INTO "approval_request"
            ("id","waqfId","type","payload","status","makerId","checkerId","subjectId","createdAt","updatedAt")
          VALUES ('${ID('14')}','${WAQF}','RESERVED_MATTER'::"ApprovalType",'{}'::jsonb,
                  'PENDING'::"ApprovalStatus",'${MAKER}','${CHECKER}','s12-1:check','now','now')`,
      ]);
      expect(failure).toMatch(/approval_request_pending_has_no_checker/);
    });

    it('5c · qmulate_is_approval_plane_role() is executable by the two application roles and not by PUBLIC', async () => {
      const rows = await owner.$queryRawUnsafe<{ app: boolean; prov: boolean; pub: boolean }[]>(
        `SELECT has_function_privilege('qmulate_app', 'qmulate_is_approval_plane_role()', 'EXECUTE') AS app,
                has_function_privilege('qmulate_provisioner', 'qmulate_is_approval_plane_role()', 'EXECUTE') AS prov,
                EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid = 'qmulate_is_approval_plane_role()'::regprocedure
                           AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub`,
      );
      expect(rows[0]).toEqual({ app: true, prov: true, pub: false });
    });
  });
});
