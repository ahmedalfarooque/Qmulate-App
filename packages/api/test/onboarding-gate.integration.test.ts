/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-3 · V-11 THROUGH THE REAL PROCEDURES — a distribution run and an Authority filing are BLOCKED
 *         while Gate 02 is incomplete, and completing the gate unblocks them (BR-1101, §17 E11 exit)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * On a provisioned intake endowment born with all three gates OPEN:
 *   · `distribution.create` and `filing.requestSubmission` are refused ONBOARDING_GATE_NOT_CLEARED,
 *     naming Gate 02, with nothing written;
 *   · Gate 02 cannot be cleared before Gate 01 (the order), Gate 01 cannot be cleared before the
 *     record carries a VERIFIED deed and a classification (the facts), and no gate is cleared over an
 *     incomplete attestation (the checklist);
 *   · once the facts are on record and the checklist attested, Gate 01 then Gate 02 clear, and the
 *     filing attempt goes through — the block was the gate and nothing else;
 *   · only the NAZIR may reopen, and reopening blocks again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  deleteProvisionedEndowments,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S12-3 · V-11 — the onboarding gate blocks downstream');

const createCaller = createCallerFactory(appRouter);
const WAQF = `${API_TEST_WAQF_PREFIX}gates`;
const STAFF = `${API_TEST_PREFIX}gates-staff`;
const NAZIR = `${API_TEST_PREFIX}gates-nazir`;
const FINANCE = `${API_TEST_PREFIX}gates-finance`;
const NONCE = `${String(process.pid)}-${String(Date.now())}`;

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId }));

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { cause?: unknown }).cause ?? '')}`
      : String(error);
  }
  throw new Error('expected a rejection');
};

const GATE02_CHECKLIST = {
  identityAndEmailStoodUp: true,
  cloudAccountingOnSocpaChart: true,
  dedicatedBankAccountsOpened: true,
  opsWorkspaceAndComplianceCalendar: true,
  vaultAndDashboardStoodUp: true,
};
const GATE01_CHECKLIST = {
  classificationConfirmed: true,
  waqfAndAssetsRegistered: true,
  deedCertificateTitleDeedsInVault: true,
  counselReviewOfReservedMattersAndLicensing: true,
};

describe.skipIf(!hasDatabase)(
  'S12-3 · V-11 · the onboarding gate blocks a run and a filing',
  () => {
    beforeAll(async () => {
      await assertSeeded();
      await provisionIntakeEndowment({ id: WAQF, classification: 'SMALL', gates: 'open' });
      await provisionTestSubjects([
        {
          id: STAFF,
          role: 'CASE_MANAGER',
          waqfIds: [WAQF],
          // The filing's request MINTS an approval (one minting path), so the maker carries the two
          // approval verbs the precedent seat carries — and still no approve, no sign.
          permissions: [
            'endowment:waqf:read',
            'endowment:waqf:write',
            'compliance:filing:read',
            'compliance:filing:write',
            'approval:request:read',
            'approval:request:initiate',
          ],
        },
        {
          id: NAZIR,
          role: 'NAZIR',
          waqfIds: [WAQF],
          permissions: ['endowment:waqf:read', 'endowment:waqf:write'],
        },
        {
          id: FINANCE,
          role: 'FINANCE',
          waqfIds: [WAQF],
          permissions: [
            'distribution:run:read',
            'distribution:run:write',
            'finance:transaction:read',
          ],
        },
      ]);
    }, 300_000);

    afterAll(async () => {
      await deleteProvisionedEndowments([WAQF]);
      await cleanupApiTestRows();
      await closeDatabase();
    });

    it('1 · status: three OPEN gates, both downstream activities blocked by Gate 02, the reader’s verbs', async () => {
      const status = await (
        await callerFor(STAFF, 'gates-status')
      ).onboarding.status({ waqfId: WAQF });
      expect(status.gates.map((g) => [g.gate, g.status, g.recorded])).toEqual([
        ['GATE_01_AUTHORITY_LEGAL', 'OPEN', true],
        ['GATE_02_SYSTEMS_CONTROLS', 'OPEN', true],
        ['GATE_03_PEOPLE_PROPERTY_CADENCE', 'OPEN', true],
      ]);
      expect(status.blocked).toEqual([
        { activity: 'DISTRIBUTION_RUN', by: 'GATE_02_SYSTEMS_CONTROLS' },
        { activity: 'AUTHORITY_FILING_SUBMISSION', by: 'GATE_02_SYSTEMS_CONTROLS' },
      ]);
      expect(status.writable).toEqual({ clear: true, reopen: false });
      // Gate 01's facts are not yet on record: no deed, and the harness endowment is classified SMALL.
      expect(status.gates[0]?.unmetPrerequisites).toEqual(['TRUSTEESHIP_DEED_NOT_RECORDED']);
      expect(status.gates[1]?.orderRefusal).toBe('PRIOR_GATE_NOT_CLEARED');
    });

    it('2 · a distribution run is BLOCKED with the gate named, and nothing is written', async () => {
      const prisma = await privilegedPrisma();
      const before = await prisma.distribution.count({ where: { waqfId: WAQF } });
      const refused = await rejection(
        (await callerFor(FINANCE, 'gates-run')).distribution.create({
          waqfId: WAQF,
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
        }),
      );
      expect(refused).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      expect(refused).toMatch(/GATE_02_SYSTEMS_CONTROLS/);
      expect(await prisma.distribution.count({ where: { waqfId: WAQF } })).toBe(before);
    });

    it('3 · an Authority filing is BLOCKED with the gate named, and nothing is written', async () => {
      const prisma = await privilegedPrisma();
      const refused = await rejection(
        (await callerFor(STAFF, 'gates-filing')).filing.requestSubmission({
          waqfId: WAQF,
          platform: 'AWQAF_DIGITAL',
        }),
      );
      expect(refused).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      expect(await prisma.governmentFiling.count({ where: { waqfId: WAQF } })).toBe(0);
    });

    it('4 · the order: Gate 02 cannot be cleared before Gate 01', async () => {
      const refused = await rejection(
        (await callerFor(STAFF, 'gates-order')).onboarding.clearGate({
          waqfId: WAQF,
          gate: 'GATE_02_SYSTEMS_CONTROLS',
          attestation: GATE02_CHECKLIST,
        }),
      );
      expect(refused).toMatch(/PRIOR_GATE_NOT_CLEARED/);
    });

    it('5 · the facts: Gate 01 cannot be cleared over a missing deed — an attestation is not a deed', async () => {
      const refused = await rejection(
        (await callerFor(STAFF, 'gates-facts')).onboarding.clearGate({
          waqfId: WAQF,
          gate: 'GATE_01_AUTHORITY_LEGAL',
          attestation: GATE01_CHECKLIST,
        }),
      );
      expect(refused).toMatch(/PREREQUISITES_UNMET|TRUSTEESHIP_DEED_NOT_RECORDED/);
    });

    it('6 · with a VERIFIED deed on record, Gate 01 clears — but not over an incomplete checklist', async () => {
      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "trusteeship_deed" ("id","waqfId","primaryNazir","primaryAppointedDate","primaryAppointedDateHijri",
          "jointlyLiable","islam","legalCapacity","noDisqualifyingRemoval","ksaResident",
          "eligibilityVerifiedAt","eligibilityVerifiedAtHijri","eligibilityVerifiedBy","createdAt","updatedAt")
       VALUES ('trust-${WAQF}','${WAQF}','QMULATE (professional Nazir) (بيانات وهمية)',now(),'1447-07-12',
          false,true,true,true,true,'2026-01-01'::timestamp,'1447-07-12','${NAZIR}',now(),now())`,
      );
      const partial = await rejection(
        (await callerFor(STAFF, 'gates-partial')).onboarding.clearGate({
          waqfId: WAQF,
          gate: 'GATE_01_AUTHORITY_LEGAL',
          attestation: { ...GATE01_CHECKLIST, counselReviewOfReservedMattersAndLicensing: false },
        }),
      );
      expect(partial).toMatch(/CHECKLIST_UNATTESTED/);
      expect(partial).toMatch(/counselReviewOfReservedMattersAndLicensing/);

      const cleared = await (
        await callerFor(STAFF, 'gates-clear-01')
      ).onboarding.clearGate({
        waqfId: WAQF,
        gate: 'GATE_01_AUTHORITY_LEGAL',
        attestation: GATE01_CHECKLIST,
        note: 'S12-3 api test (بيانات وهمية)',
      });
      expect(cleared.status).toBe('CLEARED');
      expect(cleared.unblocks).toEqual([]);
    });

    it('7 · Gate 02 needs a dedicated account on record; with one, it clears and UNBLOCKS both activities', async () => {
      const noAccount = await rejection(
        (await callerFor(STAFF, 'gates-no-acct')).onboarding.clearGate({
          waqfId: WAQF,
          gate: 'GATE_02_SYSTEMS_CONTROLS',
          attestation: GATE02_CHECKLIST,
        }),
      );
      expect(noAccount).toMatch(/NO_DEDICATED_BANK_ACCOUNT/);

      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "bank_account" ("id","waqfId","accountRef","ibanEnc","ibanHmac","bankNameAr","purpose","currency","isDedicated","createdAt","updatedAt")
       VALUES ('bankacct-${WAQF}','${WAQF}','FAKE-ACCT-GATES','FAKE-IBAN-GATES-${NONCE}','hmac-${NONCE}','بنك وهمي (بيانات وهمية)','ghallah_operating','SAR',true,now(),now())`,
      );
      const cleared = await (
        await callerFor(STAFF, 'gates-clear-02')
      ).onboarding.clearGate({
        waqfId: WAQF,
        gate: 'GATE_02_SYSTEMS_CONTROLS',
        attestation: GATE02_CHECKLIST,
      });
      expect(cleared.status).toBe('CLEARED');
      expect(cleared.unblocks).toEqual(['DISTRIBUTION_RUN', 'AUTHORITY_FILING_SUBMISSION']);

      // V-11's second half: completing the gate UNBLOCKS the filing — the block was the gate.
      const filing = await (
        await callerFor(STAFF, 'gates-filing-2')
      ).filing.requestSubmission({
        waqfId: WAQF,
        platform: 'AWQAF_DIGITAL',
      });
      // The result carries the MINTED approval's status — the filing exists and awaits the Nazir.
      expect(filing.filingId).toMatch(/\S/);
      expect(filing.approvalRequestId).toMatch(/\S/);
      expect(String(filing.status)).toBe('PENDING');
      expect(await prisma.governmentFiling.count({ where: { waqfId: WAQF } })).toBe(1);

      // …and the run is no longer refused BY THE GATE (the engine may refuse it for its own reasons).
      let runError: string | null = null;
      try {
        await (
          await callerFor(FINANCE, 'gates-run-2')
        ).distribution.create({
          waqfId: WAQF,
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
        });
      } catch (error: unknown) {
        runError = error instanceof Error ? error.message : String(error);
      }
      expect(runError ?? '').not.toMatch(/ONBOARDING_GATE_NOT_CLEARED/);

      const status = await (
        await callerFor(STAFF, 'gates-status-2')
      ).onboarding.status({ waqfId: WAQF });
      expect(status.blocked.every((b) => b.by === null)).toBe(true);
      const events = await prisma.auditEvent.count({
        where: { entityType: 'OnboardingGate', waqfId: WAQF, action: 'UPDATE' },
      });
      expect(events).toBeGreaterThanOrEqual(2);
    });

    it('8 · only the NAZIR may reopen (owner ruling), and reopening blocks again', async () => {
      const staffRefused = await rejection(
        (await callerFor(STAFF, 'gates-reopen-staff')).onboarding.reopenGate({
          waqfId: WAQF,
          gate: 'GATE_02_SYSTEMS_CONTROLS',
          reason: 'staff may not',
        }),
      );
      expect(staffRefused).toMatch(/NAZIR_ONLY|PERMISSION_DENIED/);

      const reopened = await (
        await callerFor(NAZIR, 'gates-reopen')
      ).onboarding.reopenGate({
        waqfId: WAQF,
        gate: 'GATE_02_SYSTEMS_CONTROLS',
        reason: 'the accounting system was not, in fact, stood up (بيانات وهمية)',
      });
      expect(reopened.status).toBe('OPEN');
      expect(reopened.blocks).toEqual(['DISTRIBUTION_RUN', 'AUTHORITY_FILING_SUBMISSION']);

      const refusedAgain = await rejection(
        (await callerFor(STAFF, 'gates-filing-3')).filing.requestSubmission({
          waqfId: WAQF,
          platform: 'BALADI',
        }),
      );
      expect(refusedAgain).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);

      // The order holds in reverse: Gate 01 cannot be reopened while… nothing later is cleared now, so it CAN;
      // but Gate 02 is OPEN, so a second reopen of Gate 02 has nothing to reopen.
      const nothing = await rejection(
        (await callerFor(NAZIR, 'gates-reopen-again')).onboarding.reopenGate({
          waqfId: WAQF,
          gate: 'GATE_02_SYSTEMS_CONTROLS',
          reason: 'again',
        }),
      );
      expect(nothing).toMatch(/GATE_NOT_CLEARED_TO_REOPEN/);
    });
  },
);
