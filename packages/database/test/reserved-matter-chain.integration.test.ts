/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-2 · THE BR-1102 CHAIN IS A WALL, NOT A FLAG (migration 51)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * §10 §9: the Nazir's sign is disabled until every prior step is recorded, and the missing step is
 * named. Before migration 51 the api REPORTED the chain and `chainEnforced: false` went into the trail.
 * This file measures the three layers that now enforce it, each on its own: the row-local CHECK, the
 * transition trigger (with the sentence), and the spend-time door — then runs the MUTATION that
 * neutralises the trigger's clause AND drops the CHECK, watches the incomplete sign go through, and
 * restores both.
 *
 * Every probe runs on the OWNER (the approval plane), so what refuses is the CHAIN, never the
 * decision-plane rule of migration 50 — that rule has its own file. Every row is rolled back.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  closeDatabase,
  ensureSeeded,
  hasDatabase,
  privilegedPrisma,
  PROBE_SUCCEEDED,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-2 · the BR-1102 reserved-matter chain');

const WAQF = 'waqf-001';
const MAKER = 'user-accountant-001';
const CHECKER = 'user-approver-001';
const STAFF = 'user-case-manager-001';
const RUN_NONCE = `${String(process.pid)}-${String(Date.now())}`;
const ID = (suffix: string): string => `appr-s12-96${suffix}`;
const AT = `'2026-01-01T00:00:00.000Z'::timestamp`;
const HIJRI = `'1447-07-12'`;
const HASH = `'${'d'.repeat(64)}'`;

type RawClient = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

interface Chain {
  readonly principal?: boolean;
  readonly counsel?: boolean;
  readonly authority?: boolean;
}

/** A PENDING kinded ASSET_DISPOSAL request with the given steps recorded. Counsel required always; Authority per `authorityRequired`. */
function insertPending(
  id: string,
  chain: Chain,
  authorityRequired = true,
  kind: string | null = 'ASSET_DISPOSAL',
): string {
  const step = (on: boolean | undefined, by: string, ref: string): string =>
    on ? `${AT}, ${HIJRI}, '${by}', '${ref}'` : 'NULL, NULL, NULL, NULL';
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","reservedMatterKind","payload","status","makerId","subjectId","payloadHash",
       "counselReviewRequired","authorityNoticeRequired",
       "principalConsentRecordedAt","principalConsentRecordedAtHijri","principalConsentBy","principalConsentReference",
       "counselReviewRecordedAt","counselReviewRecordedAtHijri","counselReviewBy","counselReviewReference",
       "authorityNoticeRecordedAt","authorityNoticeRecordedAtHijri","authorityNoticeBy","authorityReference",
       "createdAt","updatedAt")
    VALUES ('${id}','${WAQF}','RESERVED_MATTER'::"ApprovalType",
       ${kind === null ? 'NULL' : `'${kind}'::"ReservedMatterKind"`},
       '{"probe":"s12-2 chain (بيانات وهمية)","nonce":"${RUN_NONCE}"}'::jsonb,
       'PENDING'::"ApprovalStatus",'${MAKER}','s12-2:${id}',${HASH},
       true, ${authorityRequired ? 'true' : 'false'},
       ${step(chain.principal, STAFF, 'FAKE-BOARD-' + id)},
       ${step(chain.counsel, STAFF, 'FAKE-COUNSEL-' + id)},
       ${step(chain.authority, STAFF, 'FAKE-AWQAF-' + id)},
       now(), now())`;
}

const approveSql = (id: string): string =>
  `UPDATE "approval_request"
      SET "status" = 'APPROVED'::"ApprovalStatus", "checkerId" = '${CHECKER}',
          "decidedAt" = ${AT}, "decidedAtHijri" = ${HIJRI}, "checkerTotpAssertedAt" = ${AT}
    WHERE "id" = '${id}'`;

describe.skipIf(!hasDatabase)('S12-2 · the BR-1102 chain gates the sign, three ways', () => {
  let owner: RawClient;

  /**
   * ⚠ ONE STATEMENT, ONE CONNECTION (S12-5c). This used to issue `BEGIN` / statements / `ROLLBACK` as
   * separate calls on a POOLED Prisma client. S12-5b removed that shape from the gate and birth suites
   * after CI run 34231994890 hung for 25 minutes in the integration job; whether the pool split those
   * calls is a HYPOTHESIS (the S2 privilege suite uses the same shape and has passed CI for months), but
   * the hazard class is real and the harness's `rollbackProbeSql` removes it: every statement inside one
   * `DO` block that always RAISES, so no transaction can outlive its statement. `SET CONSTRAINTS ALL
   * IMMEDIATE` keeps DEFERRED constraint triggers observable in-block.
   */
  const inRolledBackTx = async (statements: readonly string[]): Promise<string | null> => {
    const text = await runProbe(rollbackProbeSql(['SET CONSTRAINTS ALL IMMEDIATE', ...statements]));
    return text.includes(PROBE_SUCCEEDED) ? null : text;
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    owner = (await privilegedPrisma()) as unknown as RawClient;
  }, 300_000);

  afterAll(async () => {
    await closeDatabase();
  });

  describe('1 · the transition trigger names the missing step (§10 §9)', () => {
    it('1a · nothing recorded → PRINCIPAL_CONSENT is named', async () => {
      const failure = await inRolledBackTx([insertPending(ID('01'), {}), approveSql(ID('01'))]);
      expect(failure).not.toBeNull();
      expect(failure).toMatch(/sign is disabled/);
      expect(failure).toMatch(/PRINCIPAL_CONSENT is not recorded/);
      expect(failure).toMatch(/RESERVED_MATTER_CHAIN_INCOMPLETE/);
    });

    it('1b · principal recorded → COUNSEL_REVIEW is named ("every matter")', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('02'), { principal: true }),
        approveSql(ID('02')),
      ]);
      expect(failure).toMatch(/COUNSEL_REVIEW is not recorded/);
    });

    it('1c · principal + counsel recorded, Authority required → AUTHORITY_NOTICE is named', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('03'), { principal: true, counsel: true }),
        approveSql(ID('03')),
      ]);
      expect(failure).toMatch(/AUTHORITY_NOTICE is not recorded/);
    });

    it('1d · POSITIVE CONTROL · the complete chain signs (rolled back)', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('04'), { principal: true, counsel: true, authority: true }),
        approveSql(ID('04')),
      ]);
      expect(failure, 'a COMPLETE chain was refused — the gate is too tight').toBeNull();
    });

    it('1e · Authority not required → principal + counsel suffice', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('05'), { principal: true, counsel: true }, false),
        approveSql(ID('05')),
      ]);
      expect(failure).toBeNull();
    });

    it('1f · a KINDLESS reserved-matter row carries no chain and signs on maker≠checker alone', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('06'), {}, false, null),
        approveSql(ID('06')),
      ]);
      expect(failure).toBeNull();
    });
  });

  describe('2 · the row-local CHECKs', () => {
    it('2a · a kinded row cannot BE APPROVED with a step missing — by INSERT, on the owner, with no trigger sentence', async () => {
      const failure = await inRolledBackTx([
        `INSERT INTO "approval_request"
           ("id","waqfId","type","reservedMatterKind","payload","status","makerId","checkerId","subjectId",
            "payloadHash","decidedAt","decidedAtHijri","checkerTotpAssertedAt","counselReviewRequired",
            "authorityNoticeRequired","createdAt","updatedAt")
         VALUES ('${ID('07')}','${WAQF}','RESERVED_MATTER','ASSET_DISPOSAL','{}'::jsonb,'APPROVED',
                 '${MAKER}','${CHECKER}','s12-2:${ID('07')}',${HASH},${AT},${HIJRI},${AT},true,false,now(),now())`,
      ]);
      expect(failure).toMatch(/approval_request_kinded_decision_requires_chain/);
    });

    it('2b · "every matter": a kinded row with counselReviewRequired = false is refused', async () => {
      const failure = await inRolledBackTx([
        `INSERT INTO "approval_request"
           ("id","waqfId","type","reservedMatterKind","payload","status","makerId","subjectId",
            "counselReviewRequired","authorityNoticeRequired","createdAt","updatedAt")
         VALUES ('${ID('08')}','${WAQF}','RESERVED_MATTER','ASSET_DISPOSAL','{}'::jsonb,'PENDING',
                 '${MAKER}','s12-2:${ID('08')}',false,false,now(),now())`,
      ]);
      expect(failure).toMatch(/approval_request_kinded_requires_counsel_review/);
    });

    it('2c · a recorded step is dual-dated and attributed — a date without a reference is refused', async () => {
      const failure = await inRolledBackTx([
        `INSERT INTO "approval_request"
           ("id","waqfId","type","reservedMatterKind","payload","status","makerId","subjectId",
            "counselReviewRequired","authorityNoticeRequired","principalConsentRecordedAt",
            "principalConsentRecordedAtHijri","principalConsentBy","createdAt","updatedAt")
         VALUES ('${ID('09')}','${WAQF}','RESERVED_MATTER','ASSET_DISPOSAL','{}'::jsonb,'PENDING',
                 '${MAKER}','s12-2:${ID('09')}',true,false,${AT},${HIJRI},'${STAFF}',now(),now())`,
      ]);
      expect(failure).toMatch(/approval_request_principal_consent_attributed/);
    });

    it('2d · chain steps live only on a RESERVED_MATTER', async () => {
      const failure = await inRolledBackTx([
        `INSERT INTO "approval_request"
           ("id","waqfId","type","payload","status","makerId","subjectId","principalConsentRecordedAt",
            "principalConsentRecordedAtHijri","principalConsentBy","principalConsentReference","createdAt","updatedAt")
         VALUES ('${ID('10')}','${WAQF}','BANK_MOVEMENT','{}'::jsonb,'PENDING','${MAKER}','s12-2:${ID('10')}',
                 ${AT},${HIJRI},'${STAFF}','FAKE-REF',now(),now())`,
      ]);
      expect(failure).toMatch(/approval_request_chain_steps_reserved_only/);
    });
  });

  describe('3 · a recorded step is WRITE-ONCE (block 0d)', () => {
    it('3a · re-recording who consented is refused, naming the step', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('11'), { principal: true }),
        `UPDATE "approval_request" SET "principalConsentBy" = 'somebody-else' WHERE "id" = '${ID('11')}'`,
      ]);
      expect(failure).toMatch(/PRINCIPAL_CONSENT step .* already recorded and is WRITE-ONCE/);
    });

    it('3b · re-referencing the counsel review is refused', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('12'), { principal: true, counsel: true }),
        `UPDATE "approval_request" SET "counselReviewReference" = 'FAKE-OTHER' WHERE "id" = '${ID('12')}'`,
      ]);
      expect(failure).toMatch(/COUNSEL_REVIEW step .* WRITE-ONCE/);
    });

    it('3c · POSITIVE CONTROL · recording a step for the first time is PERMITTED (NULL → value)', async () => {
      const failure = await inRolledBackTx([
        insertPending(ID('13'), {}),
        `UPDATE "approval_request"
            SET "principalConsentRecordedAt" = ${AT}, "principalConsentRecordedAtHijri" = ${HIJRI},
                "principalConsentBy" = '${STAFF}', "principalConsentReference" = 'FAKE-FIRST'
          WHERE "id" = '${ID('13')}'`,
      ]);
      expect(failure).toBeNull();
    });
  });

  describe('4 · the door (spend time) and the parity of step names', () => {
    it('4a · qmulate_approval_defect() names the missing step for a kinded row', async () => {
      // A row APPROVED with the chain incomplete cannot exist (2a), so the door is reached through the
      // defect FUNCTION on a PENDING-but-complete row vs an incomplete one: complete ⇒ "is PENDING, not
      // APPROVED" (the status check comes first); incomplete PENDING ⇒ the same. The chain branch is
      // therefore observed through qmulate_reserved_matter_chain_defect() directly.
      const rows = await owner.$queryRawUnsafe<{ d: string | null }[]>(
        `SELECT qmulate_reserved_matter_chain_defect('does-not-exist') AS d`,
      );
      expect(rows[0]?.d).toBeNull();
      // ONE statement, one connection (S12-5c): both reads happen INSIDE the DO block and travel out in
      // the RAISE's message, so the rows never outlive the probe and no transaction is left open.
      const probe = await runProbe(
        [
          'DO $qm_chain_probe$',
          'DECLARE missing text; kindless text;',
          'BEGIN',
          `  ${insertPending(ID('14'), { principal: true })};`,
          `  SELECT qmulate_reserved_matter_chain_defect('${ID('14')}') INTO missing;`,
          `  ${insertPending(ID('15'), {}, false, null)};`,
          `  SELECT qmulate_reserved_matter_chain_defect('${ID('15')}') INTO kindless;`,
          `  RAISE EXCEPTION '${PROBE_SUCCEEDED} missing=<%> kindless=<%>', coalesce(missing, 'NULL'), coalesce(kindless, 'NULL') USING ERRCODE = 'P0001';`,
          'END',
          '$qm_chain_probe$;',
        ].join('\n'),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
      expect(probe).toMatch(/missing=<COUNSEL_REVIEW>/);
      expect(probe).toMatch(/kindless=<NULL>/);
    });

    it('4b · the SQL step names are the domain vocabulary, byte for byte', async () => {
      const { RESERVED_MATTER_CHAIN_STEPS } = await import('@qmulate/domain');
      const rows = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_reserved_matter_chain_defect(text)'::regprocedure) AS def`,
      );
      const def = rows[0]?.def ?? '';
      expect(RESERVED_MATTER_CHAIN_STEPS).toEqual([
        'PRINCIPAL_CONSENT',
        'COUNSEL_REVIEW',
        'AUTHORITY_NOTICE',
      ]);
      for (const step of RESERVED_MATTER_CHAIN_STEPS) {
        expect(def, `${step} missing from the SQL twin`).toContain(`'${step}'`);
      }
      // And in order: the SQL returns the FIRST missing step in the same order the domain lists them.
      const positions = RESERVED_MATTER_CHAIN_STEPS.map((step) => def.indexOf(`'${step}'`));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });
  });

  describe('5 · MUTATION — the CHECK dropped and the trigger clause neutralised', () => {
    it('5a · with both walls down the incomplete sign is ADMITTED; restored, it is refused again', async () => {
      const defs = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_approval_request_authority()'::regprocedure) AS def`,
      );
      const original = defs[0]?.def ?? '';
      const clause = `AND NEW."type"::text = 'RESERVED_MATTER' AND NEW."reservedMatterKind" IS NOT NULL THEN`;
      expect(original, 'block (0e) not found — migration 51 did not install it').toContain(clause);
      const checks = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'approval_request_kinded_decision_requires_chain'`,
      );
      const checkDef = checks[0]?.def;
      expect(checkDef, 'the load-bearing CHECK is not installed').toBeTruthy();

      let underMutation: string | null = 'not-attempted';
      try {
        await owner.$executeRawUnsafe(original.replace(clause, `AND false THEN`));
        await owner.$executeRawUnsafe(
          `ALTER TABLE "approval_request" DROP CONSTRAINT "approval_request_kinded_decision_requires_chain"`,
        );
        underMutation = await inRolledBackTx([insertPending(ID('16'), {}), approveSql(ID('16'))]);
      } finally {
        await owner.$executeRawUnsafe(original);
        await owner.$executeRawUnsafe(
          `ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_kinded_decision_requires_chain" ${checkDef as string}`,
        );
      }
      expect(
        underMutation,
        'with the trigger clause neutralised AND the CHECK dropped, the incomplete sign was STILL refused — ' +
          'so something this file does not name is the control, and the file is not measuring what it claims',
      ).toBeNull();

      // Restored: refused again, by name; function text byte-identical; constraint back.
      const restored = await inRolledBackTx([insertPending(ID('17'), {}), approveSql(ID('17'))]);
      expect(restored).toMatch(/PRINCIPAL_CONSENT is not recorded/);
      const after = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_approval_request_authority()'::regprocedure) AS def`,
      );
      expect(after[0]?.def).toBe(original);
      const checksAfter = await owner.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM pg_constraint WHERE conname = 'approval_request_kinded_decision_requires_chain'`,
      );
      expect(checksAfter[0]?.n).toBe('1');
    });

    it('5b · with ONLY the trigger clause neutralised, the CHECK alone still refuses (defence in depth, no sentence)', async () => {
      const defs = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_approval_request_authority()'::regprocedure) AS def`,
      );
      const original = defs[0]?.def ?? '';
      const clause = `AND NEW."type"::text = 'RESERVED_MATTER' AND NEW."reservedMatterKind" IS NOT NULL THEN`;
      let failure: string | null = 'not-attempted';
      try {
        await owner.$executeRawUnsafe(original.replace(clause, `AND false THEN`));
        failure = await inRolledBackTx([insertPending(ID('18'), {}), approveSql(ID('18'))]);
      } finally {
        await owner.$executeRawUnsafe(original);
      }
      expect(failure).toMatch(/approval_request_kinded_decision_requires_chain/);
    });
  });
});
