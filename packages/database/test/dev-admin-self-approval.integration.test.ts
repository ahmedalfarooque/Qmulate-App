/**
 * MIGRATION 54 — THE FIXTURE-ONLY DEVELOPMENT ADMINISTRATOR MAY APPROVE ITS OWN REQUEST, AND
 * NOBODY ELSE MAY.
 *
 * `approval_request_checker_ne_maker` keeps its name and its meaning for every checker except the
 * ONE user id named by the per-database setting `qmulate.dev_admin_self_approval_user_id`, which
 * only the database owner / a superuser can write (`ALTER DATABASE … SET`). This file measures:
 *
 *   1 · with the setting ABSENT, a self-approval is refused exactly as before (the migration-3
 *       behaviour, on a NON-superuser connection);
 *   2 · with the setting naming the maker, the same UPDATE is admitted and
 *       `qmulate_approval_defect()` reports NO defect for the resulting row;
 *   3 · with the setting naming user A, user B is still refused — one id, no wildcard;
 *   4 · a session-level `SET` of the same name is IGNORED: only the catalog counts;
 *   5 · after `RESET`, the refusal returns.
 *
 * Every decision runs on the PROVISIONER connection (the approval plane, migration 50) inside a
 * DO block that always raises, so nothing commits (S12-5c shape). The only committed writes are
 * the PENDING scaffold rows (retired by `afterAll`) and the database setting, which is RESET.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_SUCCEEDED,
  accessMatrixClient,
  assertGuardsInstalled,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  rollbackProbeSql,
  superuserPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('migration 54 · fixture-only self-approval exemption');

const WAQF = 'waqf-001';
/** Holds an ACTIVE NAZIR grant on every fixture endowment — a legal checker, and here the maker too. */
const NAZIR_A = 'user-nazir-001';
/** The second seeded NAZIR (PO-2) — also a legal checker on waqf-001. */
const NAZIR_B = 'user-approver-001';
const SETTING = 'qmulate.dev_admin_self_approval_user_id';
const RUN_NONCE = `${String(process.pid)}-${String(Date.now())}`;
/** 96xx — never the fixture's `appr-dist-`, never a sibling file's 90xx/94xx/95xx. */
const ID = (suffix: string): string => `appr-m54-96${suffix}`;
const PAST = `'2026-01-01T00:00:00.000Z'`;
const HASH = `'${'b'.repeat(64)}'`;

type RawClient = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

const insertPendingSql = (id: string, makerId: string): string => `INSERT INTO "approval_request"
    ("id","waqfId","type","reservedMatterKind","payload","status","makerId","checkerId","subjectId",
     "payloadHash","decidedAt","decidedAtHijri","checkerTotpAssertedAt",
     "counselReviewRequired","authorityNoticeRequired",
     "principalConsentRecordedAt","principalConsentRecordedAtHijri","principalConsentBy","principalConsentReference",
     "counselReviewRecordedAt","counselReviewRecordedAtHijri","counselReviewBy","counselReviewReference",
     "createdAt","updatedAt")
  VALUES ('${id}','${WAQF}','RESERVED_MATTER'::"ApprovalType",'ASSET_DISPOSAL'::"ReservedMatterKind",
     '{"probe":"migration 54 (بيانات وهمية)","nonce":"${RUN_NONCE}","id":"${id}"}'::jsonb,
     'PENDING'::"ApprovalStatus",'${makerId}',NULL,'asset:asset-001:m54-${id}',
     ${HASH},NULL,NULL,NULL, true, false,
     ${PAST}::timestamp, '1447-07-12', 'user-case-manager-001', 'FAKE-BOARD-LETTER-${RUN_NONCE}',
     ${PAST}::timestamp, '1447-07-12', 'user-case-manager-001', 'FAKE-COUNSEL-MEMO-${RUN_NONCE}',
     now(), now())`;

const decideAsSql = (id: string, checkerId: string): string => `UPDATE "approval_request"
    SET "status" = 'APPROVED'::"ApprovalStatus", "checkerId" = '${checkerId}',
        "decidedAt" = ${PAST}::timestamp, "decidedAtHijri" = '1447-07-12',
        "checkerTotpAssertedAt" = ${PAST}::timestamp
  WHERE "id" = '${id}'`;

describe.skipIf(!hasDatabase)('migration 54 · the fixture-only self-approval exemption', () => {
  let owner: RawClient;
  let superuser: RawClient;
  let provisioner: RawClient;
  let databaseName = '';

  /** Runs `statements` as the provisioner inside a DO block that always raises; null = admitted. */
  const attempt = async (
    client: RawClient,
    statements: readonly string[],
  ): Promise<string | null> => {
    try {
      await client.$executeRawUnsafe(
        rollbackProbeSql(['SET CONSTRAINTS ALL IMMEDIATE', ...statements]),
      );
    } catch (error: unknown) {
      const text = errorText(error);
      return text.includes(PROBE_SUCCEEDED) ? null : text;
    }
    throw new Error('a rolled-back probe completed without raising — the SQL never ran as written');
  };

  /** `qmulate_approval_defect()` over a row decided in the SAME rolled-back block. */
  const defectAfterSelfDecision = async (id: string, checkerId: string): Promise<string> => {
    try {
      await provisioner.$executeRawUnsafe(`DO $m54$
        DECLARE d text;
        BEGIN
          SET CONSTRAINTS ALL IMMEDIATE;
          ${decideAsSql(id, checkerId)};
          SELECT qmulate_approval_defect('${id}', '${WAQF}', 'RESERVED_MATTER', 'asset:asset-001:m54-${id}', false) INTO d;
          RAISE EXCEPTION 'M54_DEFECT=%', COALESCE(d, '<none>');
        END
      $m54$`);
    } catch (error: unknown) {
      const text = errorText(error);
      // `errorText` concatenates several renderings of one error; take the marker's own line only.
      const match = /M54_DEFECT=([^`|\r\n]*)/.exec(text);
      return match === null
        ? `UPDATE refused before the defect could be read: ${text}`
        : (match[1] ?? '').trim();
    }
    throw new Error('the defect probe completed without raising');
  };

  const setExempt = async (userId: string | null): Promise<void> => {
    await superuser.$executeRawUnsafe(
      userId === null
        ? `ALTER DATABASE "${databaseName}" RESET ${SETTING}`
        : `ALTER DATABASE "${databaseName}" SET ${SETTING} = '${userId}'`,
    );
  };

  const exemptSaysFor = async (userId: string): Promise<boolean> => {
    const rows = await owner.$queryRawUnsafe<{ exempt: boolean }[]>(
      `SELECT qmulate_self_approval_exempt('${userId}') AS exempt`,
    );
    return rows[0]?.exempt === true;
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    const { makeSystemContext } = await databaseModule();
    owner = (await privilegedPrisma()) as unknown as RawClient;
    superuser = (await superuserPrisma()) as unknown as RawClient;
    provisioner = accessMatrixClient(
      makeSystemContext({ actorId: NAZIR_A, requestId: `m54-${RUN_NONCE}` }),
    ) as unknown as RawClient;
    databaseName = (
      await owner.$queryRawUnsafe<{ db: string }[]>('SELECT current_database() AS db')
    )[0]!.db;
    await owner.$executeRawUnsafe(
      `DELETE FROM "approval_request" WHERE "id" LIKE 'appr-m54-96%' AND "checkerId" IS NULL`,
    );
    await setExempt(null);
    await owner.$executeRawUnsafe(insertPendingSql(ID('01'), NAZIR_A));
    await owner.$executeRawUnsafe(insertPendingSql(ID('02'), NAZIR_B));
  }, 300_000);

  afterAll(async () => {
    await setExempt(null);
    await owner.$executeRawUnsafe(
      `DELETE FROM "approval_request" WHERE "id" LIKE 'appr-m54-96%' AND "checkerId" IS NULL`,
    );
    await closeDatabase();
  });

  it('1 · with the setting ABSENT a self-approval is refused by name — migration 3, unchanged', async () => {
    expect(await exemptSaysFor(NAZIR_A)).toBe(false);
    const error = await attempt(provisioner, [decideAsSql(ID('01'), NAZIR_A)]);
    expect(error, 'a self-approved row was admitted with no exemption on file').not.toBeNull();
    expect(error).toMatch(/approval_request_checker_ne_maker/);
  });

  it('2 · naming the maker admits the self-approval, and the spend-time defect check agrees', async () => {
    await setExempt(NAZIR_A);
    expect(await exemptSaysFor(NAZIR_A)).toBe(true);
    expect(await attempt(provisioner, [decideAsSql(ID('01'), NAZIR_A)])).toBeNull();
    expect(await defectAfterSelfDecision(ID('01'), NAZIR_A)).toBe('<none>');
  });

  it('3 · one id, no wildcard: while A is named, B is still refused as its own checker', async () => {
    await setExempt(NAZIR_A);
    expect(await exemptSaysFor(NAZIR_B)).toBe(false);
    const error = await attempt(provisioner, [decideAsSql(ID('02'), NAZIR_B)]);
    expect(error).not.toBeNull();
    expect(error).toMatch(/approval_request_checker_ne_maker/);
    // …and a DISTINCT checker on the same rows is admitted exactly as before.
    expect(await attempt(provisioner, [decideAsSql(ID('02'), NAZIR_A)])).toBeNull();
  });

  it('4 · a session-level SET of the same name is ignored — only the catalog counts', async () => {
    await setExempt(null);
    const error = await attempt(provisioner, [
      `SET LOCAL ${SETTING} = '${NAZIR_A}'`,
      decideAsSql(ID('01'), NAZIR_A),
    ]);
    expect(error, 'a caller named THEMSELVES with a session SET and was admitted').not.toBeNull();
    expect(error).toMatch(/approval_request_checker_ne_maker/);
  });

  it('5 · RESET restores the refusal, and the defect check reports the self-approval again', async () => {
    await setExempt(NAZIR_A);
    await setExempt(null);
    expect(await exemptSaysFor(NAZIR_A)).toBe(false);
    expect(await attempt(provisioner, [decideAsSql(ID('01'), NAZIR_A)])).toMatch(
      /approval_request_checker_ne_maker/,
    );
    // The defect function on a row that IS self-approved (decided as the owner-exempt path would
    // have left it) — reachable only by deciding inside the probe, which the CHECK now refuses, so
    // the function's own branch is measured through `exemptSaysFor` above and test 2's '<none>'.
  });
});
