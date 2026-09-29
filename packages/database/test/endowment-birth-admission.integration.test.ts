/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-3b · THE BIRTH OF AN ENDOWMENT IS GOVERNED (migration 53 · BR-1101 · ADR-0008 round 8)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Migration 17 measured the `waqf` INSERT "ungoverned wholesale". This file measures the closure:
 *   §1  PRIVILEGE — as `qmulate_app`, INSERT on `waqf` / `waqif` is refused by the ACL (42501)
 *   §2  ADMISSION — as the PROVISIONER, a raw birth with no marker is refused by the trigger; a
 *       birth whose actor holds sibling authority on the same client is ADMITTED (positive control);
 *       an actor with the record verb only is refused; an actor with both verbs on ANOTHER client's
 *       endowment is refused; `createdBy` must be the marker's actor; nobody is BORN retired
 *   §3  THE FIRST SEAT — laid down in the birth transaction it is admitted; the SAME seat issued in a
 *       LATER transaction, by the same actor, is refused (the clause is bounded to the birth)
 *   §4  MUTATION — the sibling-authority predicate neutralised (`:= true`) admits the refused birth;
 *       restored byte-identical, it is refused again
 *
 * Subjects are constructed on the OWNER (the bootstrap — exempt by `current_user`, which is the
 * one fact a caller cannot write) and removed in `afterAll`. Every probe that expects a refusal runs
 * on the PROVISIONER connection through `intakeEndowment()` or raw SQL — never on the owner.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_SUCCEEDED,
  accessMatrixClient,
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-3b · endowment birth admission (migration 53)');

const P = 'birth-s12';
const NONCE = `${String(process.pid)}-${String(Date.now())}`;
const OTHER_CLIENT = `${P}-client-other`;
const OTHER_WAQIF = `${P}-waqif-other`;
const OTHER_WAQF = `${P}-waqf-other`;
const REGISTRAR = `${P}-registrar`; // both verbs on waqf-001 (client-001)
const CLERK = `${P}-clerk`; // record verb only on waqf-001
const FOREIGN = `${P}-foreign`; // both verbs, but on the OTHER client's endowment
const NAZIR = `${P}-nazir`;
const born: string[] = [];

type Raw = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

const q = (value: string): string => `'${value.replace(/'/g, "''")}'`;

function userCtx(actorId: string, waqfIds: readonly string[], permissions: readonly string[]) {
  return {
    actorId,
    actorType: 'USER' as const,
    authorizedWaqfIds: [...waqfIds],
    permissions: [...permissions],
    requestId: `${P}-${actorId}`,
  };
}

const BOTH = [
  'endowment:waqf:read',
  'endowment:waqf:write',
  'admin:access_matrix:read',
  'admin:access_matrix:write',
];
const RECORD_ONLY = ['endowment:waqf:read', 'endowment:waqf:write'];

const intakeInput = (suffix: string, overrides: Record<string, unknown> = {}) => ({
  id: `${P}-born-${suffix}-${NONCE}`,
  clientId: 'client-001',
  // waqif-001 OWNS waqf-001, so the registrar's grant makes this founder VISIBLE (CLIENT_REACHABLE_MODELS);
  // waqif-002 would not be, and the door refuses a founder the caller cannot see.
  waqif: { existingId: 'waqif-001' },
  certificateNumber: `FAKE-CERT-${P}-${suffix}-${NONCE}`,
  deedNumber: `FAKE-DEED-${P}-${suffix}-${NONCE}`,
  type: 'FAMILY_DHURRI' as const,
  nature: 'AYNI' as const,
  entitlementOrder: 'LINEAGE_CONTINUATION' as const,
  shartNarrativeAr: 'شرط الواقف كما ورد (بيانات وهمية)',
  fiscalYearEnd: '12-31',
  registrationDate: '2026-01-10',
  trusteeship: {
    primaryNazir: 'QMULATE (بيانات وهمية)',
    primaryAppointedDate: '2026-01-10',
    jointlyLiable: false,
    islam: true,
    legalCapacity: true,
    noDisqualifyingRemoval: true,
    ksaResident: true,
  },
  nazir: { userId: NAZIR, email: `${NAZIR}@example.test` },
  now: new Date('2026-01-10T00:00:00.000Z'),
  ...overrides,
});

describe.skipIf(!hasDatabase)('S12-3b · the birth of an endowment is governed', () => {
  let owner: Raw;

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    owner = (await privilegedPrisma()) as unknown as Raw;
    const db = await databaseModule();

    // Users (the identity plane is unguarded on the owner; the seed writes it the same way).
    for (const id of [REGISTRAR, CLERK, FOREIGN, NAZIR]) {
      await owner.$executeRawUnsafe(
        `INSERT INTO "user" ("id","name","email","emailVerified","isActive","locale","createdAt","updatedAt")
         VALUES (${q(id)}, ${q(`${id} (fictional)`)}, ${q(`${id}@example.test`)}, false, true, 'ar', now(), now())
         ON CONFLICT ("id") DO NOTHING`,
      );
    }
    // Another family, with one endowment, so "both verbs on the WRONG client" is constructible.
    await owner.$executeRawUnsafe(
      `INSERT INTO "client" ("id","nameAr","createdAt","updatedAt") VALUES (${q(OTHER_CLIENT)}, 'أسرة أخرى (بيانات وهمية)', now(), now()) ON CONFLICT DO NOTHING`,
    );
    await owner.$executeRawUnsafe(
      `INSERT INTO "waqif" ("id","clientId","nameAr","createdAt","updatedAt") VALUES (${q(OTHER_WAQIF)}, ${q(OTHER_CLIENT)}, 'واقف آخر (بيانات وهمية)', now(), now()) ON CONFLICT DO NOTHING`,
    );
    await owner.$executeRawUnsafe(
      `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification","type","nature",
          "entitlementOrder","shartAlWaqif","shartAlWaqifVersion","shartAlWaqifSetAt","shartAlWaqifSetAtHijri",
          "reversionClauseCaptured","continuationStipulation","fiscalYearEnd","registrationDate","registrationDateHijri","createdAt","updatedAt")
       VALUES (${q(OTHER_WAQF)}, ${q(OTHER_WAQIF)}, ${q(`FAKE-CERT-${OTHER_WAQF}`)}, ${q(`FAKE-DEED-${OTHER_WAQF}`)},
          'SMALL', 'FAMILY_DHURRI', 'AYNI', 'LINEAGE_CONTINUATION', '{"note":"probe (بيانات وهمية)"}'::jsonb, 1,
          '2026-01-01', '1447-07-12', false, 'ZUHUR_AND_BUTUN', '12-31', '2026-01-01', '1447-07-12', now(), now())
       ON CONFLICT DO NOTHING`,
    );

    // Seats, ESTABLISHED in the trail (audited, admission suspended — the bootstrap, as the seed does it).
    const privileged = db.createPrivilegedPrismaClient(
      db.makeSystemContext({ actorId: `${P}-bootstrap`, requestId: `${P}-bootstrap` }),
    );
    await db.withAudit(privileged, async (tx) => {
      await db.withAccessMatrixBootstrap(tx as never, async () => {
        const seat = async (
          id: string,
          userId: string,
          waqfId: string,
          role: string,
          permissions: readonly string[],
        ) =>
          tx.waqfAccessGrant.upsert({
            where: { id },
            create: {
              id,
              userId,
              waqfId,
              role: role as never,
              permissions: [...permissions],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: `${P}-bootstrap`,
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
            update: { permissions: [...permissions], revokedAt: null, deletedAt: null },
          });
        await seat(`${P}-g-registrar`, REGISTRAR, 'waqf-001', 'SYSTEM_ADMIN', BOTH);
        await seat(`${P}-g-clerk`, CLERK, 'waqf-001', 'CASE_MANAGER', RECORD_ONLY);
        await seat(`${P}-g-foreign`, FOREIGN, OTHER_WAQF, 'SYSTEM_ADMIN', BOTH);
      });
    });
  }, 300_000);

  afterAll(async () => {
    // The newborn endowments and the constructed family go, guards suspended in ONE transaction, on the owner.
    const ids = [...born, OTHER_WAQF].map(q).join(', ');
    await owner
      .$executeRawUnsafe(
        `
      DO $qm_birth_purge$
      BEGIN
        ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_no_delete;
        ALTER TABLE "trusteeship_deed" DISABLE TRIGGER trusteeship_deed_no_delete;
        ALTER TABLE "onboarding_gate" DISABLE TRIGGER onboarding_gate_no_delete;
        ALTER TABLE "waqf" DISABLE TRIGGER waqf_no_delete;
        ALTER TABLE "waqif" DISABLE TRIGGER waqif_no_delete;
        ALTER TABLE "client" DISABLE TRIGGER client_no_delete;
        DELETE FROM "waqf_access_grant" WHERE "waqfId" IN (${ids}) OR "id" LIKE '${P}-g-%';
        DELETE FROM "onboarding_gate" WHERE "waqfId" IN (${ids});
        DELETE FROM "trusteeship_deed" WHERE "waqfId" IN (${ids});
        CREATE TEMP TABLE qm_birth_founders ON COMMIT DROP AS
          SELECT DISTINCT w."waqifId" AS id FROM "waqf" w WHERE w."id" IN (${ids}) AND w."waqifId" NOT LIKE 'waqif-%';
        DELETE FROM "waqf" WHERE "id" IN (${ids});
        DELETE FROM "waqif" WHERE "id" = ${q(OTHER_WAQIF)} OR "id" IN (SELECT id FROM qm_birth_founders);
        DELETE FROM "client" WHERE "id" = ${q(OTHER_CLIENT)};
        DELETE FROM "user" WHERE "id" LIKE '${P}-%';
        ALTER TABLE "client" ENABLE ALWAYS TRIGGER client_no_delete;
        ALTER TABLE "waqif" ENABLE ALWAYS TRIGGER waqif_no_delete;
        ALTER TABLE "waqf" ENABLE ALWAYS TRIGGER waqf_no_delete;
        ALTER TABLE "onboarding_gate" ENABLE ALWAYS TRIGGER onboarding_gate_no_delete;
        ALTER TABLE "trusteeship_deed" ENABLE ALWAYS TRIGGER trusteeship_deed_no_delete;
        ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_delete;
      END
      $qm_birth_purge$`,
      )
      .catch((error: unknown) => {
        console.error(
          '[birth purge] FAILED —',
          String(error),
          JSON.stringify((error as { meta?: unknown }).meta ?? null),
        );
        throw error;
      });
    await closeDatabase();
  });

  const refusal = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  describe('§1 · PRIVILEGE — the runtime role cannot INSERT an endowment or a founder', () => {
    it('1a · as qmulate_app, INSERT INTO waqf is refused by the ACL', async () => {
      const app = (await basePrisma()) as unknown as Raw;
      const failure = await refusal(() =>
        app.$executeRawUnsafe(
          `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification","type","nature",
              "entitlementOrder","shartAlWaqif","shartAlWaqifVersion","shartAlWaqifSetAt","shartAlWaqifSetAtHijri",
              "reversionClauseCaptured","fiscalYearEnd","registrationDate","registrationDateHijri","createdAt","updatedAt")
           VALUES (${q(`${P}-app-${NONCE}`)}, 'waqif-002', ${q(`FAKE-CERT-app-${NONCE}`)}, 'FAKE-DEED-app', 'SMALL',
              'FAMILY_DHURRI', 'AYNI', 'LINEAGE_CONTINUATION', '{}'::jsonb, 1, now(), '1447-07-12', false, '12-31',
              now(), '1447-07-12', now(), now())`,
        ),
      );
      expect(failure).toMatch(/42501/);
      expect(failure).toMatch(/permission denied for table waqf/);
    });

    it('1b · as qmulate_app, INSERT INTO waqif is refused by the ACL; UPDATE on waqf is NOT (the record stays writable)', async () => {
      const app = (await basePrisma()) as unknown as Raw;
      const failure = await refusal(() =>
        app.$executeRawUnsafe(
          `INSERT INTO "waqif" ("id","clientId","nameAr","createdAt","updatedAt") VALUES (${q(`${P}-appwaqif-${NONCE}`)}, 'client-001', 'x', now(), now())`,
        ),
      );
      expect(failure).toMatch(/permission denied for table waqif/);
      // POSITIVE CONTROL for the privilege: a no-op UPDATE on an existing endowment is admitted — inside
      // ONE `DO` block that always raises (one statement, one pooled connection; see the gate suite's note
      // on why separate BEGIN/ROLLBACK calls hung CI). PROBE_SUCCEEDED in the text = the UPDATE ran.
      let probe = '';
      try {
        await app.$executeRawUnsafe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "fiscalYearEnd" = "fiscalYearEnd" WHERE "id" = 'waqf-001'`,
          ]),
        );
      } catch (error: unknown) {
        probe = errorText(error);
      }
      expect(probe).toContain(PROBE_SUCCEEDED);
    });
  });

  describe('§2 · ADMISSION — a birth needs a marker, a bound registrar and sibling authority', () => {
    it('2a · a raw birth on the PROVISIONER with no marker is refused by the trigger, naming the path', async () => {
      const prov = accessMatrixClient(userCtx(REGISTRAR, ['waqf-001'], BOTH)) as unknown as Raw;
      const failure = await refusal(() =>
        prov.$executeRawUnsafe(
          `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification","type","nature",
              "entitlementOrder","shartAlWaqif","shartAlWaqifVersion","shartAlWaqifSetAt","shartAlWaqifSetAtHijri",
              "reversionClauseCaptured","fiscalYearEnd","registrationDate","registrationDateHijri","createdBy","createdAt","updatedAt")
           VALUES (${q(`${P}-raw-${NONCE}`)}, 'waqif-002', ${q(`FAKE-CERT-raw-${NONCE}`)}, 'FAKE-DEED-raw', 'NOT_CLASSIFIED',
              'FAMILY_DHURRI', 'AYNI', 'LINEAGE_CONTINUATION', '{}'::jsonb, 1, now(), '1447-07-12', false, '12-31',
              now(), '1447-07-12', ${q(REGISTRAR)}, now(), now())`,
        ),
      );
      expect(failure).toMatch(/WAQF_BIRTH_NOT_ADMITTED/);
      expect(failure).toMatch(/appended no audit_event naming it/);
      const rows = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "waqf" WHERE "id" = ${q(`${P}-raw-${NONCE}`)}`,
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('2b · POSITIVE CONTROL · the registrar (both verbs on waqf-001) BIRTHS an endowment for client-001 through the door', async () => {
      const db = await databaseModule();
      const input = intakeInput('ok');
      const result = await db.intakeEndowment(
        userCtx(REGISTRAR, ['waqf-001'], BOTH) as never,
        input as never,
      );
      born.push(result.waqfId);
      expect(result.waqfId).toBe(input.id);
      const row = await owner.$queryRawUnsafe<
        { createdBy: string; classification: string; deletedAt: Date | null }[]
      >(
        `SELECT "createdBy", "classification"::text AS classification, "deletedAt" FROM "waqf" WHERE "id" = ${q(result.waqfId)}`,
      );
      expect(row[0]).toEqual({
        createdBy: REGISTRAR,
        classification: 'NOT_CLASSIFIED',
        deletedAt: null,
      });
      const gates = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "onboarding_gate" WHERE "waqfId" = ${q(result.waqfId)} AND "status" = 'OPEN'`,
      );
      expect(gates[0]?.n).toBe(3);
      const seat = await owner.$queryRawUnsafe<{ userId: string; grantedByUserId: string }[]>(
        `SELECT "userId", "grantedByUserId" FROM "waqf_access_grant" WHERE "waqfId" = ${q(result.waqfId)}`,
      );
      expect(seat).toEqual([{ userId: NAZIR, grantedByUserId: REGISTRAR }]);
    });

    it('2c · the clerk (record verb only) is refused — the marker is there, the authority is not', async () => {
      const db = await databaseModule();
      const failure = await refusal(() =>
        db.intakeEndowment(
          userCtx(CLERK, ['waqf-001'], RECORD_ONLY) as never,
          intakeInput('clerk') as never,
        ),
      );
      // The scoping extension speaks FIRST for the seat (no admin:access_matrix:write) or the trigger
      // speaks for the birth — either way nothing stands, and the sentence names an authority defect.
      expect(failure).toMatch(
        /WAQF_BIRTH_NOT_ADMITTED|AUTHORIZATION PLANE|admin:access_matrix:write/,
      );
      const rows = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "waqf" WHERE "id" = ${q(intakeInput('clerk').id)}`,
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('2d · both verbs on ANOTHER client’s endowment lend nothing: refused, naming the sibling rule', async () => {
      const db = await databaseModule();
      const failure = await refusal(() =>
        db.intakeEndowment(
          userCtx(FOREIGN, [OTHER_WAQF], BOTH) as never,
          // A NEW founder: the foreign seat cannot SEE waqif-001, and a refusal on visibility would never
          // reach the trigger. Founder creation is unscoped; the BIRTH is what the trigger judges.
          intakeInput('foreign', { waqif: { nameAr: 'واقف جديد (بيانات وهمية)' } }) as never,
        ),
      );
      expect(failure).toMatch(/WAQF_BIRTH_NOT_ADMITTED/);
      expect(failure).toMatch(/SIBLING endowment of the same client/);
      const rows = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "waqf" WHERE "id" = ${q(intakeInput('foreign').id)}`,
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('2e · nobody is BORN retired — not even the owner', async () => {
      // The trigger is DEFERRED; `SET CONSTRAINTS ALL IMMEDIATE` inside the probe makes it fire at the
      // INSERT itself, so the refusal is observable in ONE statement (see the gate suite's note).
      const failure = await runProbe(
        rollbackProbeSql([
          'SET CONSTRAINTS ALL IMMEDIATE',
          `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification","type","nature",
                "entitlementOrder","shartAlWaqif","shartAlWaqifVersion","shartAlWaqifSetAt","shartAlWaqifSetAtHijri",
                "reversionClauseCaptured","fiscalYearEnd","registrationDate","registrationDateHijri","deletedAt","createdAt","updatedAt")
             VALUES (${q(`${P}-retired-${NONCE}`)}, 'waqif-002', ${q(`FAKE-CERT-ret-${NONCE}`)}, 'FAKE-DEED-ret', 'SMALL',
                'FAMILY_DHURRI', 'AYNI', 'LINEAGE_CONTINUATION', '{}'::jsonb, 1, now(), '1447-07-12', false, '12-31',
                now(), '1447-07-12', now(), now(), now())`,
        ]),
      );
      expect(failure).toMatch(/WAQF_BORN_RETIRED/);
    });
  });

  describe('§3 · THE FIRST SEAT — admitted with the birth, and only with the birth', () => {
    it('3a · the same registrar cannot issue a SECOND seat on the newborn in a later transaction (no on-endowment authority)', async () => {
      const db = await databaseModule();
      const newborn = born[0];
      expect(newborn).toBeDefined();
      if (newborn === undefined) return;
      const failure = await refusal(() =>
        db.provisionAccessGrant(userCtx(REGISTRAR, ['waqf-001', newborn], BOTH) as never, {
          userId: CLERK,
          waqfId: newborn,
          role: 'CASE_MANAGER',
          permissions: RECORD_ONLY,
          validFrom: new Date('2026-01-11T00:00:00.000Z'),
        }),
      );
      expect(failure).toMatch(/holds no ACTIVE grant carrying "admin:access_matrix:write"/);
      expect(failure).toMatch(/SAME transaction as the endowment/);
      const seats = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "waqf_access_grant" WHERE "waqfId" = ${q(newborn)}`,
      );
      expect(seats[0]?.n).toBe(1);
    });
  });

  describe('§4 · MUTATION — the sibling-authority predicate neutralised, observed, restored', () => {
    it('4a · with qmulate_sibling_endowment_authority() := true the FOREIGN birth is ADMITTED; restored byte-identical, refused', async () => {
      const db = await databaseModule();
      const defs = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_sibling_endowment_authority(text,text,bigint)'::regprocedure) AS def`,
      );
      const original = defs[0]?.def ?? '';
      expect(original).toContain('sib."deletedAt" IS NULL');
      let underMutation: string | null = 'not-attempted';
      const mutantInput = intakeInput('mutant', {
        waqif: { nameAr: 'واقف الطفرة (بيانات وهمية)' },
      });
      try {
        await owner.$executeRawUnsafe(
          `CREATE OR REPLACE FUNCTION qmulate_sibling_endowment_authority(p_actor_id text, p_waqf_id text, p_before_event_id bigint)
             RETURNS boolean LANGUAGE sql STABLE AS $qm_mut$ SELECT true $qm_mut$`,
        );
        underMutation = await refusal(() =>
          db.intakeEndowment(userCtx(FOREIGN, [OTHER_WAQF], BOTH) as never, mutantInput as never),
        );
      } finally {
        await owner.$executeRawUnsafe(original);
      }
      expect(
        underMutation,
        'with the predicate neutralised the foreign birth must be ADMITTED',
      ).toBeNull();
      born.push(mutantInput.id);
      const restored = await refusal(() =>
        db.intakeEndowment(
          userCtx(FOREIGN, [OTHER_WAQF], BOTH) as never,
          intakeInput('restored', {
            waqif: { nameAr: 'واقف بعد الاستعادة (بيانات وهمية)' },
          }) as never,
        ),
      );
      expect(restored).toMatch(/WAQF_BIRTH_NOT_ADMITTED/);
      const after = await owner.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_sibling_endowment_authority(text,text,bigint)'::regprocedure) AS def`,
      );
      expect(after[0]?.def).toBe(original);
    });
  });
});
