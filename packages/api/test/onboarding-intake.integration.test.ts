/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-3b · UI INTAKE THROUGH THE REAL PROCEDURE — an endowment is BORN with its three gates OPEN, on
 *          sibling-endowment authority, and refused by name without it (BR-1101 · migration 53)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Subjects: a provisioned sibling endowment of the fixture's ONE client (`waqif-002` → client-001),
 * an INTAKING admin seated on it with BOTH verbs, a CLERK on it with the record verb only, and a
 * NAZIR user to be seated on the newborn. Everything test-prefixed and purged (the newborn's id is
 * returned by the procedure and handed to the purge).
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

warnNoDatabase('S12-3b · onboarding.intake');

const createCaller = createCallerFactory(appRouter);
const SIBLING = `${API_TEST_WAQF_PREFIX}intake-sibling`;
const REGISTRAR = `${API_TEST_PREFIX}intake-registrar`;
const CLERK = `${API_TEST_PREFIX}intake-clerk`;
const NAZIR = `${API_TEST_PREFIX}intake-nazir`;
const NONCE = `${String(process.pid)}-${String(Date.now())}`;
const born: string[] = [];

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

const nazirEmail = async (): Promise<string> => {
  const prisma = await privilegedPrisma();
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: NAZIR },
    select: { email: true },
  });
  return row.email;
};

const validInput = (suffix: string) =>
  ({
    clientId: 'client-001',
    waqif: { existingId: 'waqif-002' },
    certificateNumber: `FAKE-CERT-INTAKE-${suffix}-${NONCE}`,
    deedNumber: `FAKE-DEED-INTAKE-${suffix}-${NONCE}`,
    type: 'FAMILY_DHURRI',
    nature: 'AYNI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    shartNarrativeAr: 'شرط الواقف كما ورد في الصك (بيانات وهمية)',
    fiscalYearEnd: '12-31',
    registrationDate: '2026-01-15',
    trusteeship: {
      primaryNazir: 'QMULATE (professional Nazir) (بيانات وهمية)',
      primaryAppointedDate: '2026-01-15',
      jointlyLiable: false,
      islam: true,
      legalCapacity: true,
      noDisqualifyingRemoval: true,
      ksaResident: true,
    },
  }) as const;

describe.skipIf(!hasDatabase)('S12-3b · onboarding.intake — an endowment is born governed', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionIntakeEndowment({ id: SIBLING, classification: 'SMALL', waqifId: 'waqif-002' });
    await provisionTestSubjects([
      {
        id: REGISTRAR,
        role: 'SYSTEM_ADMIN',
        waqfIds: [SIBLING],
        permissions: [
          'admin:access_matrix:read',
          'admin:access_matrix:write',
          'endowment:waqf:read',
          'endowment:waqf:write',
        ],
      },
      {
        id: CLERK,
        role: 'CASE_MANAGER',
        waqfIds: [SIBLING],
        permissions: ['endowment:waqf:read', 'endowment:waqf:write'],
      },
      // The Nazir-to-be: a user with a seat elsewhere (so the row exists and is active). Its seat on
      // the NEWBORN is what the intake issues.
      { id: NAZIR, role: 'NAZIR', waqfIds: [SIBLING], permissions: ['endowment:waqf:read'] },
    ]);
  }, 300_000);

  afterAll(async () => {
    await deleteProvisionedEndowments([...born, SIBLING]);
    await cleanupApiTestRows();
    await closeDatabase();
  });

  it('1 · intakeAuthority names the client the registrar may register for; the clerk may register for none', async () => {
    const registrar = await (
      await callerFor(REGISTRAR, 'intake-auth-1')
    ).onboarding.intakeAuthority();
    expect(registrar.clients.map((c) => c.id)).toEqual(['client-001']);
    expect(registrar.clients[0]?.siblingWaqfIds).toEqual([SIBLING]);
    // Founders are FORCE-FILTERED to those owning an endowment the caller can see (CLIENT_REACHABLE_MODELS):
    // the registrar sees waqif-002 through the sibling, not the whole family. Honest, and asserted.
    expect(registrar.clients[0]?.waqifs.map((w) => w.id)).toEqual(['waqif-002']);
    const clerk = await (await callerFor(CLERK, 'intake-auth-2')).onboarding.intakeAuthority();
    expect(clerk.clients).toEqual([]);
  });

  it('2 · the clerk (record verb only) is refused ENDOWMENT_INTAKE_NOT_AUTHORISED and nothing is written', async () => {
    const prisma = await privilegedPrisma();
    const before = await prisma.waqf.count();
    const input = validInput('clerk');
    const refused = await rejection(
      (await callerFor(CLERK, 'intake-clerk')).onboarding.intake({
        ...input,
        nazirEmail: await nazirEmail(),
      }),
    );
    expect(refused).toMatch(/ENDOWMENT_INTAKE_NOT_AUTHORISED/);
    expect(await prisma.waqf.count()).toBe(before);
    expect(
      await prisma.waqf.findFirst({ where: { certificateNumber: input.certificateNumber } }),
    ).toBeNull();
  });

  it('3 · under fixture-only, a real-looking certificate number is refused FIXTURE_ONLY_IDENTIFIER_REFUSED', async () => {
    expect(process.env.DATA_CLASSIFICATION).toBe('fixture-only');
    const input = { ...validInput('grammar'), certificateNumber: `CERT-${NONCE}` };
    const refused = await rejection(
      (await callerFor(REGISTRAR, 'intake-grammar')).onboarding.intake({
        ...input,
        nazirEmail: await nazirEmail(),
      }),
    );
    expect(refused).toMatch(/FIXTURE_ONLY_IDENTIFIER_REFUSED/);
    expect(refused).toMatch(/certificateNumber/);
    const prisma = await privilegedPrisma();
    expect(
      await prisma.waqf.findFirst({ where: { certificateNumber: input.certificateNumber } }),
    ).toBeNull();
  });

  it('4 · the registrar may not seat THEMSELVES as the Nazir', async () => {
    const prisma = await privilegedPrisma();
    const self = await prisma.user.findUniqueOrThrow({
      where: { id: REGISTRAR },
      select: { email: true },
    });
    const refused = await rejection(
      (await callerFor(REGISTRAR, 'intake-self')).onboarding.intake({
        ...validInput('self'),
        nazirEmail: self.email,
      }),
    );
    expect(refused).toMatch(/SEGREGATION_OF_DUTIES|SELF_ISSUE/);
  });

  it('5 · the registrar BIRTHS the endowment: NOT_CLASSIFIED, Shart INCOMPLETE, deed recorded, three gates OPEN, the Nazir seated, the trail names it', async () => {
    const prisma = await privilegedPrisma();
    const input = validInput('ok');
    const result = await (
      await callerFor(REGISTRAR, 'intake-ok')
    ).onboarding.intake({
      ...input,
      nazirEmail: await nazirEmail(),
    });
    born.push(result.waqfId);
    expect(result.gates).toBe('ALL_OPEN');
    expect(result.waqifCreated).toBe(false);
    expect(result.waqifId).toBe('waqif-002');

    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: result.waqfId } });
    expect(String(waqf.classification)).toBe('NOT_CLASSIFIED');
    expect(waqf.createdBy).toBe(REGISTRAR);
    expect(waqf.deletedAt).toBeNull();
    expect(waqf.reversionClauseCaptured).toBe(false);
    expect(waqf.directUtilization).toBeNull();
    const shart = waqf.shartAlWaqif as {
      completeness: { status: string; missing: string[] };
      narrativeAr: string;
    };
    expect(shart.completeness.status).toBe('INCOMPLETE');
    expect(shart.completeness.missing).toContain('REVERSION_CLAUSE_UNREAD');
    expect(shart.narrativeAr).toBe(input.shartNarrativeAr);

    const deed = await prisma.trusteeshipDeed.findUniqueOrThrow({
      where: { waqfId: result.waqfId },
    });
    expect(deed.eligibilityVerifiedAt).toBeNull(); // stated, NOT verified — deed.upsert verifies
    expect(deed.ksaResident).toBe(true);

    const gates = await prisma.onboardingGate.findMany({
      where: { waqfId: result.waqfId },
      orderBy: { gate: 'asc' },
      select: { gate: true, status: true },
    });
    expect(gates.map((g) => [String(g.gate), String(g.status)])).toEqual([
      ['GATE_01_AUTHORITY_LEGAL', 'OPEN'],
      ['GATE_02_SYSTEMS_CONTROLS', 'OPEN'],
      ['GATE_03_PEOPLE_PROPERTY_CADENCE', 'OPEN'],
    ]);

    const seats = await prisma.waqfAccessGrant.findMany({
      where: { waqfId: result.waqfId },
      select: { userId: true, role: true, grantedByUserId: true, permissions: true },
    });
    expect(seats).toHaveLength(1);
    expect(seats[0]?.userId).toBe(NAZIR);
    expect(String(seats[0]?.role)).toBe('NAZIR');
    expect(seats[0]?.grantedByUserId).toBe(REGISTRAR);
    expect(seats[0]?.permissions).toContain('approval:request:approve');

    const trail = await prisma.auditEvent.findMany({
      where: { entityType: 'Waqf', entityId: result.waqfId },
      select: { action: true, actorId: true },
      orderBy: { id: 'asc' },
    });
    // The extension's own CREATE, then the explicit INTAKE-kind CREATE (the enum has no INTAKE member).
    expect(trail.map((e) => e.action)).toEqual(['CREATE', 'CREATE']);
    expect(trail.every((e) => e.actorId === REGISTRAR)).toBe(true);
  });

  it('6 · the newborn is GATED: its seated Nazir cannot request an Authority filing (ONBOARDING_GATE_NOT_CLEARED), and its status shows every gate OPEN', async () => {
    const waqfId = born[0];
    expect(waqfId).toBeDefined();
    if (waqfId === undefined) return;
    const nazir = await callerFor(NAZIR, 'intake-newborn');
    const status = await nazir.onboarding.status({ waqfId });
    expect(status.gates.every((g) => g.status === 'OPEN' && g.recorded)).toBe(true);
    expect(status.blocked.every((b) => b.by === 'GATE_02_SYSTEMS_CONTROLS')).toBe(true);
    const refused = await rejection(
      nazir.filing.requestSubmission({ waqfId, platform: 'AWQAF_DIGITAL' }),
    );
    expect(refused).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
  });

  it('7 · a NEW founder is recorded with the birth when none is named', async () => {
    const input = {
      ...validInput('newfounder'),
      waqif: { nameAr: 'واقف جديد (بيانات وهمية)', nameEn: 'New Founder (fictional)' },
    };
    const result = await (
      await callerFor(REGISTRAR, 'intake-newfounder')
    ).onboarding.intake({
      ...input,
      nazirEmail: await nazirEmail(),
    });
    born.push(result.waqfId);
    expect(result.waqifCreated).toBe(true);
    const prisma = await privilegedPrisma();
    const founder = await prisma.waqif.findUniqueOrThrow({ where: { id: result.waqifId } });
    expect(founder.clientId).toBe('client-001');
    expect(founder.nameAr).toBe(input.waqif.nameAr);
  });
});
