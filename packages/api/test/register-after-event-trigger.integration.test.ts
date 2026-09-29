/**
 * ⊕ S11 — THE E11 DEFECT, driven on the real path: an endowment whose duty was RAISED BY ITS TRIGGER
 * before its register existed can still receive its register — and a SECOND setup is still refused.
 *
 * Found by item 2a (the seeded sweep-raised GOV-REG-02 on waqf-003), fixed at the root: three API
 * predicates read `instantiatedReason IS NOT NULL` as "a register exists". Before this fix the
 * endowment below was refused initial setup forever with a message that was false ("already has an
 * engine-instantiated register" — it had one sweep-raised duty and no register), and a library
 * upgrade on it would have passed a gate meant for registers.
 *
 * The subject is PROVISIONED by this file, not waqf-003 — giving the fixture endowment a register
 * would couple 2b's red-board suite to this fix and make it a second setup subject elsewhere.
 *
 * Sequence, each step asserted:
 *   1. a material change raises GOV-REG-02 through the coalescer → ONE task, reason EVENT_TRIGGER;
 *   2. a library upgrade REQUEST is refused — no register yet (the upgrade predicate, fixed);
 *   3. initial setup SUCCEEDS (the setup predicate, fixed) and leaves the trigger duty untouched;
 *   4. a SECOND initial setup is REFUSED, and the message names a REGISTER task and its reason — the
 *      load-bearing "would fabricate an occasion that did not occur" guard stays;
 *   5. the trigger duty is still exactly one, still EVENT_TRIGGER, still bound to its deadline.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  contextFor,
  deleteProvisionedEndowments,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const OFFICER = `${API_TEST_PREFIX}s11-e11-officer`;
const WAQF = `${API_TEST_WAQF_PREFIX}s11-e11-triggered`;
const NOW = new Date('2026-09-02T09:00:00.000Z');

function hijriOf(day: string): string {
  return String(toHijriSnapshot(new Date(`${day}T00:00:00.000Z`)));
}

async function officer(requestId: string) {
  return createCaller(await contextFor({ userId: OFFICER, requestId, now: NOW }));
}

async function tasksByReason(): Promise<Record<string, number>> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<{ reason: string | null; n: bigint }[]>(
    `SELECT "instantiatedReason"::text AS reason, count(*)::bigint AS n FROM "compliance_task"
       WHERE "waqfId" = '${WAQF}' AND "deletedAt" IS NULL GROUP BY 1`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.reason ?? 'NULL'] = Number(row.n);
  return out;
}

describe.runIf(hasDatabase)('S11 · E11 defect — a trigger-raised duty is not a register', () => {
  beforeAll(async () => {
    await assertSeeded();
    await deleteProvisionedEndowments([WAQF]); // self-heal a crashed run
    await provisionIntakeEndowment({ id: WAQF, classification: 'SMALL', directUtilization: false });
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [WAQF],
        permissions: ['endowment:waqf:read', 'compliance:task:read', 'compliance:task:write'],
      },
    ]);
  });

  afterAll(async () => {
    await deleteProvisionedEndowments([WAQF]);
    await cleanupApiTestRows();
  });

  it('1 · a material change RAISES GOV-REG-02 on an endowment with no register — exactly one EVENT_TRIGGER task', async () => {
    const raised = await (
      await officer('s11-e11-raise')
    ).deadline.recordMaterialChange({
      waqfId: WAQF,
      kind: 'ASSET',
      effectiveDate: '2026-05-10T00:00:00.000Z',
      effectiveDateHijri: hijriOf('2026-05-10'),
      sourceRef: 'test — invented material change before any register',
      triggerEvent: 'test — the trigger fires before initial setup',
    });
    expect(raised.action).toBe('RAISE');
    expect(await tasksByReason()).toStrictEqual({ EVENT_TRIGGER: 1 });
  });

  it('2 · a library UPGRADE request is refused — a trigger duty is not a register to attach to', async () => {
    await expect(
      (await officer('s11-e11-upgrade')).compliance.requestLibraryUpgrade({ waqfId: WAQF }),
    ).rejects.toThrow(/no engine-instantiated register|GATE_NOT_CLEARED/i);
  });

  it('3 · initial setup SUCCEEDS on that endowment (it was refused forever before the fix) and leaves the trigger duty alone', async () => {
    const result = await (
      await officer('s11-e11-setup')
    ).compliance.instantiateRegister({ waqfId: WAQF });
    expect(result.classification).toBe('SMALL');
    expect(result.instantiated.length).toBeGreaterThan(0);
    const byReason = await tasksByReason();
    expect(byReason['INITIAL_SETUP']).toBe(result.instantiated.length);
    expect(byReason['EVENT_TRIGGER']).toBe(1);
  });

  it('4 · a SECOND initial setup is REFUSED — the load-bearing guard stays — and the message names a REGISTER task, never the trigger duty', async () => {
    let message = '';
    let code: string | null = null;
    try {
      await (await officer('s11-e11-second')).compliance.instantiateRegister({ waqfId: WAQF });
    } catch (error) {
      message = (error as Error).message;
      code = (error as { code?: string }).code ?? null;
    }
    expect(code).toBe('FORBIDDEN');
    expect(message).toMatch(/already has an engine-instantiated register/);
    expect(message).toMatch(/reason INITIAL_SETUP/);
    expect(message).not.toMatch(/EVENT_TRIGGER/);
  });

  it('5 · the trigger duty is still exactly one, still EVENT_TRIGGER, still bound to its own deadline', async () => {
    const raw = await privilegedPrisma();
    const rows = await raw.$queryRawUnsafe<{ id: string; bound: bigint }[]>(
      `SELECT t."id", (SELECT count(*) FROM "deadline" d WHERE d."complianceTaskId" = t."id" AND d."deletedAt" IS NULL)::bigint AS bound
         FROM "compliance_task" t WHERE t."waqfId" = '${WAQF}' AND t."instantiatedReason" = 'EVENT_TRIGGER' AND t."deletedAt" IS NULL`,
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.bound)).toBe(1);
  });
});
