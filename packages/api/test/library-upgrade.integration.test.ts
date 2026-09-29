/**
 * S9-3b — the LIBRARY_UPGRADE act on the wire (owner ruling 2026-08-25, S9 first batch,
 * recorded `e808bb6`): *"a library version bump changes only future instantiations by itself;
 * attaching newly-in-scope templates to an ALREADY-instantiated register is a new audited act —
 * per endowment, maker≠checker, reason LIBRARY_UPGRADE — and nothing retires implicitly."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE SUBJECTS — three provisioned endowments, one per property
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · UP_WAQF   — a PLANTED prior-version register (the 2026-08-20.1 MEDIUM shape: exactly the
 *    current MEDIUM-applicable codes MINUS the bump's two non-EVENT additions), plus one open
 *    out-of-scope task (`FIN-MGT-04`, small_direct — never applicable at MEDIUM). The upgrade
 *    must attach EXACTLY {FIN-MGT-05, GOV-SHART-03} and retire NOTHING.
 *  · NOOP_WAQF — engine-instantiated at the CURRENT version: requesting an upgrade REFUSES
 *    (an approval for a no-op fabricates an occasion).
 *  · STALE_WAQF — approved, then the register MOVES before apply: the fingerprint refuses.
 *
 * ⚠ THE PLANTED ROWS ARE AN APPROXIMATION, DECLARED: a real pre-bump deployment would hold
 * 2026-08-20.1 OBLIGATION rows too; a fresh cluster seeds only 2026-08-26.1, so the planted
 * tasks carry the OLD snapshot (`templateVersion`) while their live `obligationId` pointer names
 * the CURRENT row. The snapshot columns are the frozen truth the planner reads (code + version +
 * status); the pointer is a live FK the planner never consults. Stated here rather than hidden.
 *
 * ⚠ CLEANUP: planted/created tasks are hard-deletable? NO — compliance_task carries migration
 * 8's no-delete? (It does not: compliance_task allows soft-delete-and-supersede via its own
 * guards; `cleanupApiTestRows` owns test-prefixed rows.) The provisioned endowments and their
 * children are `cleanupApiTestRows()`'s, the house convention this package learned by
 * measurement (the E7 cleanup-ghost).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EVENT_TEMPLATE_CODES_PER_SPEC,
  OBLIGATION_LIBRARY,
  OBLIGATION_LIBRARY_VERSION,
} from '@qmulate/domain/compliance';
import { obligationsForClassification } from '@qmulate/domain/classification';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const UP_WAQF = `${API_TEST_WAQF_PREFIX}s93b-upgrade`;
const NOOP_WAQF = `${API_TEST_WAQF_PREFIX}s93b-noop`;
const STALE_WAQF = `${API_TEST_WAQF_PREFIX}s93b-stale`;
const NEVER_WAQF = `${API_TEST_WAQF_PREFIX}s93b-never`;
const MAKER = `${API_TEST_PREFIX}s93b-officer`;
const NAZIR = `${API_TEST_PREFIX}s93b-nazir`;

const PRIOR_VERSION = '2026-08-20.1';
/** The bump's two non-EVENT additions — what a MEDIUM register gains through the act. */
const BUMP_ADDITIONS = ['FIN-MGT-05', 'GOV-SHART-03'] as const;

async function makerCaller(requestId: string) {
  return createCaller(await contextFor({ userId: MAKER, requestId }));
}
async function nazirCaller(requestId: string) {
  return createCaller(await contextFor({ userId: NAZIR, requestId }));
}

/**
 * The 2026-08-20.1 MEDIUM register's non-EVENT codes, DERIVED: current MEDIUM-applicable codes
 * (through the real resolver, income=true) minus EVENT recurrences minus the bump's additions.
 * A hand list would rot; this derivation is pinned by the count below (28 — E7's own exit
 * number AT that version, which the E7 log records as that version's measurement).
 */
function priorMediumCodes(): string[] {
  // hasIncomeInPeriod FALSE, deliberately: the provisioned endowments hold no ledger rows, so the
  // ACT's own income fact is false — a planted register computed with income=true would hold
  // has_income tasks the live plan reads as out-of-scope, a fixture lying about its era.
  const partition = obligationsForClassification({
    classification: 'MEDIUM',
    catalogue: OBLIGATION_LIBRARY.filter((row) => row.titleAr !== null).map((row) => ({
      code: row.code,
      gate: row.gate,
      section: row.section,
      workstreamAr: row.workstreamAr,
      workstreamEn: row.workstreamEn,
      titleAr: row.titleAr ?? '',
      titleEn: row.titleEn,
      deadlineRuleKey: row.deadlineRuleKey,
    })),
    hasIncomeInPeriod: false,
    // ⊕ S9-4a — `false`, matching `provisionIntakeEndowment`'s own default for these endowments. ⚠
    // Omitting it would leave the usage-sensitive rows in `directUseFactMissing`, so the planted
    // "prior" register would be MISSING duties the live plan then reads as newly applicable — the
    // same "fixture lying about its era" the income note above guards against, one axis over.
    directUtilization: false,
  });
  const byCode = new Map(OBLIGATION_LIBRARY.map((row) => [row.code, row]));
  return partition.obligations
    .map((row) => row.code)
    .filter((code) => byCode.get(code)?.recurrence !== 'EVENT')
    .filter((code) => !(BUMP_ADDITIONS as readonly string[]).includes(code));
}

async function plantPriorRegister(waqfId: string, codes: readonly string[]): Promise<void> {
  const raw = await privilegedPrisma();
  const obligations = await raw.$queryRawUnsafe<{ id: string; code: string }[]>(
    `SELECT "id","code" FROM "compliance_obligation"
      WHERE "libraryVersion" = '${OBLIGATION_LIBRARY_VERSION}' AND "deletedAt" IS NULL`,
  );
  const idByCode = new Map(obligations.map((row) => [row.code, row.id]));
  for (const code of codes) {
    const obligationId = idByCode.get(code);
    expect(obligationId, `no seeded obligation row for ${code}`).toBeDefined();
    await raw.$executeRawUnsafe(
      `INSERT INTO "compliance_task"
           ("id","waqfId","obligationId","templateCode","templateVersion","status",
            "classificationAtInstantiation","instantiatedReason","updatedAt")
         VALUES ('task-${waqfId}-${code}','${waqfId}','${String(obligationId)}','${code}',
                 '${PRIOR_VERSION}','NOT_STARTED','MEDIUM','INITIAL_SETUP',now())`,
    );
  }
}

if (!hasDatabase) warnNoDatabase('S9-3b library-upgrade act');

describe.skipIf(!hasDatabase)(
  'S9-3b · the LIBRARY_UPGRADE act (maker≠checker, nothing retires)',
  () => {
    beforeAll(async () => {
      await assertSeeded();
      await provisionIntakeEndowment({ id: UP_WAQF, classification: 'MEDIUM' });
      await provisionIntakeEndowment({ id: NOOP_WAQF, classification: 'MEDIUM' });
      await provisionIntakeEndowment({ id: STALE_WAQF, classification: 'MEDIUM' });
      await provisionIntakeEndowment({ id: NEVER_WAQF, classification: 'MEDIUM' });
      await provisionTestSubjects([
        {
          id: MAKER,
          role: 'COMPLIANCE_OFFICER',
          waqfIds: [UP_WAQF, NOOP_WAQF, STALE_WAQF, NEVER_WAQF],
          permissions: [
            'endowment:waqf:read',
            'compliance:task:read',
            'compliance:task:write',
            'approval:request:read',
            'approval:request:initiate',
          ],
        },
        {
          id: NAZIR,
          role: 'NAZIR',
          waqfIds: [UP_WAQF, NOOP_WAQF, STALE_WAQF],
          permissions: [
            'compliance:task:read',
            'approval:request:read',
            'approval:request:approve',
          ],
        },
      ]);

      const prior = priorMediumCodes();
      // THE VERSION-SCOPED PREMISE: 24 is the MONEYLESS arithmetic at 2026-08-20.1 — 36 storable
      // − 7 EVENT − 1 small_direct − 4 has_income, the same formula the E7 suite pinned for its
      // moneyless case (MEDIUM and LARGE share every gate involved). The income-bearing number at
      // that version was 28 (E7's exit measurement); these endowments are moneyless, so 24 is the
      // faithful prior shape here.
      expect(prior).toHaveLength(24);
      await plantPriorRegister(UP_WAQF, prior);
      await plantPriorRegister(STALE_WAQF, prior);
      // The out-of-scope open task the act must REPORT and never retire: small_direct's simplified
      // statement, never applicable at MEDIUM.
      await plantPriorRegister(UP_WAQF, ['FIN-MGT-04']);
    });

    afterAll(async () => {
      await cleanupApiTestRows();
      await closeDatabase();
    });

    /* ── 1 · the act, end to end: request → nazir approves → apply ──────────────────────────── */

    it('attaches EXACTLY the bump additions with reason LIBRARY_UPGRADE + the evidence pointer, and retires NOTHING', async () => {
      const maker = await makerCaller('s93b-request');
      const requested = await maker.compliance.requestLibraryUpgrade({ waqfId: UP_WAQF });
      expect(requested.toVersion).toBe(OBLIGATION_LIBRARY_VERSION);
      expect([...requested.willInstantiate].sort()).toEqual([...BUMP_ADDITIONS]);
      // Nothing retires implicitly — the out-of-scope open task is REPORTED, exactly as ruled.
      expect(requested.outOfScopeOpen.map((task) => task.templateCode)).toEqual(['FIN-MGT-04']);

      // maker ≠ checker: the maker cannot approve their own request.
      await expect(
        maker.approval.approve({ waqfId: UP_WAQF, approvalRequestId: requested.approvalRequestId }),
      ).rejects.toThrow(/PERMISSION|FORBIDDEN|SEGREGATION|approve/i);

      const nazir = await nazirCaller('s93b-approve');
      await nazir.approval.approve({
        waqfId: UP_WAQF,
        approvalRequestId: requested.approvalRequestId,
      });

      const applied = await maker.compliance.applyLibraryUpgrade({
        waqfId: UP_WAQF,
        approvalRequestId: requested.approvalRequestId,
      });
      expect(applied.approvalStatus).toBe('EXECUTED');
      expect(applied.instantiated.map((row) => row.templateCode).sort()).toEqual([
        ...BUMP_ADDITIONS,
      ]);

      // At rest: reason LIBRARY_UPGRADE, the evidence pointer, the NEW version's snapshot — and
      // the out-of-scope task still OPEN (nothing retired).
      const raw = await privilegedPrisma();
      const upgraded = await raw.$queryRawUnsafe<
        {
          templateCode: string;
          templateVersion: string;
          instantiatedReason: string;
          instantiatedByApprovalId: string | null;
          status: string;
        }[]
      >(
        `SELECT "templateCode","templateVersion","instantiatedReason"::text AS "instantiatedReason",
              "instantiatedByApprovalId","status"::text AS status
         FROM "compliance_task"
        WHERE "waqfId" = '${UP_WAQF}' AND "instantiatedReason"::text = 'LIBRARY_UPGRADE'
        ORDER BY "templateCode" ASC`,
      );
      expect(upgraded.map((row) => row.templateCode)).toEqual([...BUMP_ADDITIONS]);
      for (const row of upgraded) {
        expect(row.templateVersion).toBe(OBLIGATION_LIBRARY_VERSION);
        expect(row.instantiatedByApprovalId).toBe(requested.approvalRequestId);
        expect(row.status).toBe('NOT_STARTED');
      }
      const outOfScope = await raw.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status"::text AS status FROM "compliance_task"
        WHERE "waqfId" = '${UP_WAQF}' AND "templateCode" = 'FIN-MGT-04'`,
      );
      expect(outOfScope[0]?.status).toBe('NOT_STARTED');

      // A spent approval is not a standing licence: the same approval cannot attach twice.
      await expect(
        maker.compliance.applyLibraryUpgrade({
          waqfId: UP_WAQF,
          approvalRequestId: requested.approvalRequestId,
        }),
      ).rejects.toThrow(/stale|APPROVED|no act to approve|newly in scope/i);
    });

    /* ── 2 · AML-silence on the act's own wire shape (the S8-Q1 property, inherited) ─────────── */

    it('the request/apply wire shapes never name GOV-AML-02 to a non-member — even in a skip list', async () => {
      // GOV-AML-02 is EVENT and AML_RESTRICTED: it can only ever appear in skippedEventTemplates,
      // and for this non-member officer the compartment filter drops the row before planning.
      expect(EVENT_TEMPLATE_CODES_PER_SPEC).toContain('GOV-AML-02');
      const maker = await makerCaller('s93b-aml-silence');
      // NOOP_WAQF: instantiate at current version first (a real register), then the no-op refusal
      // below carries a wire shape too — both must be AML-silent.
      const setup = await maker.compliance.instantiateRegister({ waqfId: NOOP_WAQF });
      expect(JSON.stringify(setup)).not.toContain('GOV-AML-02');
      await expect(maker.compliance.requestLibraryUpgrade({ waqfId: NOOP_WAQF })).rejects.toSatisfy(
        (error: unknown) => !JSON.stringify(String(error)).includes('GOV-AML-02'),
      );
    });

    /* ── 3 · the no-op refusal: an approval for nothing fabricates an occasion ───────────────── */

    it('a register already at the current version refuses the request — nothing newly in scope', async () => {
      const maker = await makerCaller('s93b-noop');
      await expect(maker.compliance.requestLibraryUpgrade({ waqfId: NOOP_WAQF })).rejects.toThrow(
        /nothing is newly in scope|no act to approve/i,
      );
    });

    it('a NEVER-instantiated register refuses — an upgrade attaches to an existing register', async () => {
      const maker = await makerCaller('s93b-never');
      await expect(maker.compliance.requestLibraryUpgrade({ waqfId: NEVER_WAQF })).rejects.toThrow(
        /no engine-instantiated register/i,
      );
    });

    /* ── 4 · the fingerprint: a register that moved since approval refuses as stale ──────────── */

    it('apply refuses FINGERPRINT_MISMATCH when the register moved after the checker signed', async () => {
      // STALE_WAQF's planted rows carry INITIAL_SETUP, so the engine-instantiated gate passes.
      const maker = await makerCaller('s93b-stale-request');
      const requested = await maker.compliance.requestLibraryUpgrade({ waqfId: STALE_WAQF });
      expect([...requested.willInstantiate].sort()).toEqual([...BUMP_ADDITIONS]);
      const nazir = await nazirCaller('s93b-stale-approve');
      await nazir.approval.approve({
        waqfId: STALE_WAQF,
        approvalRequestId: requested.approvalRequestId,
      });
      // The register MOVES: one of the two planned codes gains an open task out-of-band.
      await plantPriorRegister(STALE_WAQF, ['FIN-MGT-05']);
      await expect(
        maker.compliance.applyLibraryUpgrade({
          waqfId: STALE_WAQF,
          approvalRequestId: requested.approvalRequestId,
        }),
      ).rejects.toThrow(/moved since approval|FINGERPRINT/i);
    });

    /* ── 5 · the deciding side: the DATABASE refuses an unauthorised attachment ──────────────── */

    it('a raw INSERT with reason LIBRARY_UPGRADE and a fabricated approval id is refused BY THE TRIGGER — migrator included', async () => {
      const raw = await privilegedPrisma();
      const obligation = await raw.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "compliance_obligation"
        WHERE "code" = 'FIN-MGT-05' AND "libraryVersion" = '${OBLIGATION_LIBRARY_VERSION}'`,
      );
      await expect(
        raw.$executeRawUnsafe(
          `INSERT INTO "compliance_task"
             ("id","waqfId","obligationId","templateCode","templateVersion","status",
              "classificationAtInstantiation","instantiatedReason","instantiatedByApprovalId","updatedAt")
           VALUES ('task-s93b-forged','${NOOP_WAQF}','${obligation[0]?.id ?? 'missing'}','FIN-MGT-05',
                   '${OBLIGATION_LIBRARY_VERSION}','NOT_STARTED','MEDIUM','LIBRARY_UPGRADE',
                   'appr-fabricated-000',now())`,
        ),
      ).rejects.toThrow(/does not exist — a fabricated id is not an approval/);
      // With NO approval at all the TRIGGER refuses first (BEFORE-triggers precede CHECKs) — the
      // defect names the missing authority.
      await expect(
        raw.$executeRawUnsafe(
          `INSERT INTO "compliance_task"
             ("id","waqfId","obligationId","templateCode","templateVersion","status",
              "classificationAtInstantiation","instantiatedReason","updatedAt")
           VALUES ('task-s93b-unnamed','${NOOP_WAQF}','${obligation[0]?.id ?? 'missing'}','FIN-MGT-05',
                   '${OBLIGATION_LIBRARY_VERSION}','NOT_STARTED','MEDIUM','LIBRARY_UPGRADE',now())`,
        ),
      ).rejects.toThrow(/no approval id was supplied/);
      // The CHECK guards the OTHER direction: an evidence pointer on a NON-upgrade row.
      await expect(
        raw.$executeRawUnsafe(
          `INSERT INTO "compliance_task"
             ("id","waqfId","obligationId","templateCode","templateVersion","status",
              "classificationAtInstantiation","instantiatedReason","instantiatedByApprovalId","updatedAt")
           VALUES ('task-s93b-mispointed','${NOOP_WAQF}','${obligation[0]?.id ?? 'missing'}','FIN-MGT-05',
                   '${OBLIGATION_LIBRARY_VERSION}','NOT_STARTED','MEDIUM','INITIAL_SETUP',
                   'appr-fabricated-000',now())`,
        ),
      ).rejects.toThrow(/compliance_task_upgrade_authority_pair/);
    });

    /* ── 6 · the evidence pointer is frozen with the identity ────────────────────────────────── */

    it('re-pointing instantiatedByApprovalId is refused — which authority a duty rests on never changes', async () => {
      const raw = await privilegedPrisma();
      await expect(
        raw.$executeRawUnsafe(
          `UPDATE "compliance_task" SET "instantiatedByApprovalId" = 'appr-other'
            WHERE "waqfId" = '${UP_WAQF}' AND "templateCode" = 'FIN-MGT-05'`,
        ),
      ).rejects.toThrow(/instantiation identity/);
    });
  },
);
