/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-4 · THE IMPORTER'S HAPPY PATH — `applyImport()` on the test cluster, BELOW the layer-3 guard
 *          (BR-1106 · V-12's other half: "every apply is auditable and repeatable")
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * The CLI cannot be driven here: it refuses anything but production+ksa (that IS G-8 layer 3, and
 * this cluster is fixture-only by construction). So this file calls the seam the CLI calls after the
 * gate — `applyImport(source, options)` — with an INVENTED source in the fixture grammar (`FAKE-`
 * references, `(بيانات وهمية)` prose; the importer's marker check is the CLI's, not this seam's), on
 * the owner connection, and measures what a run writes: the client/founder/endowment chain, the deed,
 * THREE OPEN GATES regardless of what the source says, the beneficiary and the ledger rows, the
 * document metadata, the bootstrap admin's seats, and the audit trail attributing every row to
 * `import:<runId>`. Then it re-runs the same source and shows the upserts are idempotent.
 *
 * ⚠ THE SEAM IS STATED AS SUCH: nothing here proves the CLI admits a production+ksa target — the
 * subprocess suite proves what it REFUSES, and no test can stand up a KSA-resident production host.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  closeDatabase,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-4 · applyImport() on the test cluster');

const P = 'imp-s12';
const NONCE = `${String(process.pid)}-${String(Date.now())}`;
const CLIENT = `${P}-client`;
const WAQIF = `${P}-waqif`;
const WAQF = `${P}-waqf`;
const ADMIN = `${P}-admin`;

type Raw = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};
const q = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** An invented intake file in the fixture's grammar. IDs are test-prefixed so the purge is exact. */
const SOURCE = {
  clients: [
    {
      id: CLIENT,
      name: 'Imported Family (fictional)',
      nameAr: 'أسرة مستوردة (بيانات وهمية)',
      familyBoardContact: `board-${P}@example.test`,
    },
  ],
  waqifs: [
    {
      id: WAQIF,
      clientId: CLIENT,
      name: 'Imported Founder (fictional)',
      nameAr: 'واقف مستورد (بيانات وهمية)',
    },
  ],
  waqfs: [
    {
      id: WAQF,
      waqifId: WAQIF,
      certificateNumber: `FAKE-CERT-${P}-${NONCE}`,
      certificate: null,
      deedNumber: `FAKE-DEED-${P}-${NONCE}`,
      registrationDate: '2025-06-01',
      fiscalYearEnd: '12-31',
      // The source STATES a cleared gate; the importer must ignore it — gates are born OPEN.
      onboarding: {
        gate01: { cleared: '2025-06-02' },
        gate02: { cleared: null },
        gate03: { cleared: null },
      },
      registrationAnchor: null,
      classification: 'medium',
      directUtilization: false,
      type: 'family_dhurri',
      nature: 'ayni',
      entitlementOrder: 'lineage_continuation',
      continuationStipulation: 'zuhur_and_butun',
      reversionClauseCaptured: false,
      reversionClauseCapturedDate: null,
      reversion: null,
      maintenanceRule: null,
      nazirFee: null,
      disbursementSchedule: null,
      waqifConditionSummary: 'شرط الواقف كما ورد في الصك (بيانات وهمية)',
      trusteeship: {
        primary: {
          nazir: 'QMULATE (professional Nazir) (بيانات وهمية)',
          appointedDate: '2025-06-01',
        },
        authorizedRepresentative: null,
      },
    },
  ],
  assets: [],
  expropriations: [],
  beneficiaries: [],
  financialTransactions: { revenue: [], expenses: [] },
  bankAccounts: [{ ref: `FAKE-ACCT-${P}`, waqfId: WAQF, bankNameAr: 'بنك مستورد (بيانات وهمية)' }],
  distributions: [],
  nazirFees: [],
  complianceTasks: [],
  governmentFilingStatus: [],
  documents: [
    {
      id: `${P}-doc-1`,
      waqfId: WAQF,
      type: 'DEED',
      titleAr: 'صك الوقفية (بيانات وهمية)',
      storageKey: `FAKE-VAULT-${P}-${NONCE}`,
      sha256: 'a'.repeat(64),
      retentionUntil: '2036-06-01',
    },
  ],
  bootstrapAdmin: { userId: ADMIN },
};

describe.skipIf(!hasDatabase)(
  'S12-4 · applyImport() writes an auditable, repeatable record',
  () => {
    let owner: Raw;
    let parsed: unknown;

    beforeAll(async () => {
      await assertGuardsInstalled();
      ensureSeeded();
      owner = (await privilegedPrisma()) as unknown as Raw;
      await owner.$executeRawUnsafe(
        `INSERT INTO "user" ("id","name","email","emailVerified","isActive","locale","createdAt","updatedAt")
       VALUES (${q(ADMIN)}, 'Import Admin (fictional)', ${q(`${ADMIN}@example.test`)}, false, true, 'ar', now(), now())
       ON CONFLICT ("id") DO NOTHING`,
      );
    }, 120_000);

    afterAll(async () => {
      await owner
        .$executeRawUnsafe(
          `
      DO $qm_import_purge$
      BEGIN
        ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_no_delete;
        ALTER TABLE "trusteeship_deed" DISABLE TRIGGER trusteeship_deed_no_delete;
        ALTER TABLE "onboarding_gate" DISABLE TRIGGER onboarding_gate_no_delete;
        ALTER TABLE "bank_account" DISABLE TRIGGER bank_account_no_delete;
        ALTER TABLE "document" DISABLE TRIGGER document_retention_guard;
        ALTER TABLE "waqf" DISABLE TRIGGER waqf_no_delete;
        ALTER TABLE "waqif" DISABLE TRIGGER waqif_no_delete;
        ALTER TABLE "client" DISABLE TRIGGER client_no_delete;
        DELETE FROM "waqf_access_grant" WHERE "waqfId" = ${q(WAQF)};
        DELETE FROM "document" WHERE "waqfId" = ${q(WAQF)};
        DELETE FROM "bank_account" WHERE "waqfId" = ${q(WAQF)};
        DELETE FROM "onboarding_gate" WHERE "waqfId" = ${q(WAQF)};
        DELETE FROM "trusteeship_deed" WHERE "waqfId" = ${q(WAQF)};
        DELETE FROM "waqf" WHERE "id" = ${q(WAQF)};
        DELETE FROM "waqif" WHERE "id" = ${q(WAQIF)};
        DELETE FROM "client" WHERE "id" = ${q(CLIENT)};
        DELETE FROM "user" WHERE "id" = ${q(ADMIN)};
        ALTER TABLE "client" ENABLE ALWAYS TRIGGER client_no_delete;
        ALTER TABLE "waqif" ENABLE ALWAYS TRIGGER waqif_no_delete;
        ALTER TABLE "waqf" ENABLE ALWAYS TRIGGER waqf_no_delete;
        ALTER TABLE "document" ENABLE ALWAYS TRIGGER document_retention_guard;
        ALTER TABLE "bank_account" ENABLE ALWAYS TRIGGER bank_account_no_delete;
        ALTER TABLE "onboarding_gate" ENABLE ALWAYS TRIGGER onboarding_gate_no_delete;
        ALTER TABLE "trusteeship_deed" ENABLE ALWAYS TRIGGER trusteeship_deed_no_delete;
        ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_delete;
      END
      $qm_import_purge$`,
        )
        .catch((error: unknown) => {
          console.error(
            '[import purge] FAILED —',
            String(error),
            JSON.stringify((error as { meta?: unknown }).meta ?? null),
          );
          throw error;
        });
      await closeDatabase();
    });

    it('1 · the source parses under the IMPORT schema (fixture shape, marker optional) and the plan counts it', async () => {
      const { parseImportSource, planImport } = await import('../src/import-apply.js');
      parsed = parseImportSource(SOURCE);
      const plan = planImport(parsed as never);
      expect(plan.counts.Waqf).toBe(1);
      expect(plan.counts.OnboardingGate).toBe(3);
      expect(plan.counts.BankAccount).toBe(1);
      expect(plan.counts.Document).toBe(1);
      expect(plan.counts.WaqfAccessGrant).toBe(1);
      expect(plan.ignoredOnboardingBlocks).toBe(1);
      expect(plan.bootstrapAdmin).toBe(ADMIN);
    });

    it('2 · APPLY: the chain, the deed, three OPEN gates (the source’s cleared gate IGNORED), the account, the document, the admin seat — every row attributed to import:<runId>', async () => {
      const { applyImport } = await import('../src/import-apply.js');
      const result = await applyImport(parsed as never, {
        runId: `run1-${NONCE}`,
        now: new Date('2026-01-10T00:00:00.000Z'),
      });
      expect(result.actorId).toBe(`import:run1-${NONCE}`);
      expect(result.written.Waqf).toBe(1);
      expect(result.written.OnboardingGate).toBe(3);

      const waqf = await owner.$queryRawUnsafe<{ createdBy: string; classification: string }[]>(
        `SELECT "createdBy", "classification"::text AS classification FROM "waqf" WHERE "id" = ${q(WAQF)}`,
      );
      expect(waqf[0]).toEqual({ createdBy: result.actorId, classification: 'MEDIUM' });
      const gates = await owner.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status"::text AS status FROM "onboarding_gate" WHERE "waqfId" = ${q(WAQF)} ORDER BY "gate"`,
      );
      expect(gates.map((g) => g.status)).toEqual(['OPEN', 'OPEN', 'OPEN']);
      const deed = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "trusteeship_deed" WHERE "waqfId" = ${q(WAQF)}`,
      );
      expect(deed[0]?.n).toBe(1);
      const account = await owner.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "bank_account" WHERE "waqfId" = ${q(WAQF)} AND "isDedicated"`,
      );
      expect(account[0]?.n).toBe(1);
      const doc = await owner.$queryRawUnsafe<{ retentionUntilHijri: string; createdBy: string }[]>(
        `SELECT "retentionUntilHijri", "createdBy" FROM "document" WHERE "id" = ${q(`${P}-doc-1`)}`,
      );
      expect(doc[0]?.createdBy).toBe(result.actorId);
      expect(doc[0]?.retentionUntilHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const seats = await owner.$queryRawUnsafe<
        { userId: string; role: string; permissions: string[] }[]
      >(
        `SELECT "userId", "role"::text AS role, "permissions" FROM "waqf_access_grant" WHERE "waqfId" = ${q(WAQF)}`,
      );
      expect(seats).toHaveLength(1);
      expect(seats[0]?.userId).toBe(ADMIN);
      expect(seats[0]?.role).toBe('SYSTEM_ADMIN');
      expect(seats[0]?.permissions).toEqual(
        expect.arrayContaining(['admin:access_matrix:write', 'endowment:waqf:write']),
      );
      const trail = await owner.$queryRawUnsafe<{ n: number; actors: string[] }[]>(
        `SELECT count(*)::int AS n, array_agg(DISTINCT "actorId") AS actors FROM "audit_event" WHERE "waqfId" = ${q(WAQF)}`,
      );
      expect(trail[0]?.n).toBeGreaterThanOrEqual(7);
      expect(trail[0]?.actors).toEqual([result.actorId]);
    });

    it('3 · REPEATABLE: the same source applied again upserts in place — one endowment, three gates, one seat, no duplicate', async () => {
      const { applyImport } = await import('../src/import-apply.js');
      const again = await applyImport(parsed as never, {
        runId: `run1-${NONCE}`,
        now: new Date('2026-01-11T00:00:00.000Z'),
      });
      expect(again.written.Waqf).toBe(1);
      const counts = await owner.$queryRawUnsafe<
        { waqfs: number; gates: number; seats: number; docs: number }[]
      >(
        `SELECT (SELECT count(*) FROM "waqf" WHERE "id" = ${q(WAQF)})::int AS waqfs,
              (SELECT count(*) FROM "onboarding_gate" WHERE "waqfId" = ${q(WAQF)})::int AS gates,
              (SELECT count(*) FROM "waqf_access_grant" WHERE "waqfId" = ${q(WAQF)})::int AS seats,
              (SELECT count(*) FROM "document" WHERE "waqfId" = ${q(WAQF)})::int AS docs`,
      );
      expect(counts[0]).toEqual({ waqfs: 1, gates: 3, seats: 1, docs: 1 });
    });

    it('4 · a bootstrap admin who is not an ACTIVE user is refused before any write', async () => {
      const { applyImport, parseImportSource } = await import('../src/import-apply.js');
      const bad = parseImportSource({ ...SOURCE, bootstrapAdmin: { userId: `${P}-nobody` } });
      let failure: string | null = null;
      try {
        await applyImport(bad, { runId: `run-bad-${NONCE}`, now: new Date() });
      } catch (error: unknown) {
        failure = errorText(error);
      }
      expect(failure).toMatch(/IMPORT_REFUSED: bootstrapAdmin\.userId .* names no ACTIVE user/);
    });
  },
);
