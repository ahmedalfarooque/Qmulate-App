/**
 * S10-2b — THE MIGRATION-34 RETURN DOOR, and its two arms.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO RULINGS THIS FILE PROVES ARE IMPLEMENTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · GATE — product owner, 2026-08-25 (S8 addendum, FOURTH batch, ⚠ recorded as OVERRULING the
 *    orchestrator's recommendation): *"Allow return, reserved-matter-gated."* An erroneous real
 *    classification may return to `NOT_CLASSIFIED` *"via a maker≠checker reserved-matter approval
 *    … The one-way door gains exactly this gated exception; the default refusal stands for the
 *    ungated path."*
 *  · DISPOSITION — product owner, 2026-08-27 (S9 addendum, second batch): *"The return-to-
 *    NOT_CLASSIFIED act retires **the open tasks** with reason **'classification returned to
 *    NOT_CLASSIFIED'** — rows kept, history queryable, the reclassification-retirement shape
 *    reused. A later correct classification runs a fresh instantiation."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY BOTH ARMS ARE MANDATORY AND NEITHER IS DECORATIVE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A door proven only on the arm that OPENS is a hole proven only on the arm that opens. Migration
 * 42's control is the precedent: a guard that never meets its own condition reports its silence as
 * success. So:
 *   ARM 1 — the authorised path goes through, and does everything the disposition ruling names.
 *   ARM 2 — the UNGATED path still refuses, at the layer that survives raw SQL, on the APP role.
 *
 * ⚠ ARM 2 IS DRIVEN ON THE `qmulate_app` CONNECTION DELIBERATELY (ADR-0008): a refusal observed as
 * the table owner proves nothing about the runtime, which is the only role production uses.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON } from '@qmulate/domain/compliance';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  deleteProvisionedEndowments,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
  recordReservedMatterChain,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const DOOR_WAQF = `${API_TEST_WAQF_PREFIX}return-door`;
/** The MAKER, who both raises the request and later spends it. Never the checker. */
const MAKER = `${API_TEST_PREFIX}door-maker`;
/** The CHECKER. `approval:request:approve` resolves only against an ACTIVE NAZIR grant. */
const CHECKER = `${API_TEST_PREFIX}door-nazir`;

const subjectFor = (waqfId: string): string => `waqf:${waqfId}:classification:NOT_CLASSIFIED`;

interface WaqfRow {
  readonly classification: string;
}
interface ApprovalRow {
  readonly status: string;
}

/** Mints a RESERVED_MATTER request of the given kind and has the Nazir approve it. */
async function mintAndApprove(kind: string, requestId: string): Promise<string> {
  const maker = createCaller(await contextFor({ userId: MAKER, requestId: `${requestId}-mint` }));
  const minted = await maker.approval.initiate({
    waqfId: DOOR_WAQF,
    type: 'RESERVED_MATTER',
    reservedMatterKind: kind as never,
    subjectId: subjectFor(DOOR_WAQF),
    payload: { waqfId: DOOR_WAQF, to: 'NOT_CLASSIFIED' },
  });
  expect(minted.status).toBe('PENDING');

  const checker = createCaller(
    await contextFor({ userId: CHECKER, requestId: `${requestId}-approve` }),
  );
  // ⊕ S12-2: a kinded reserved matter cannot be signed with its BR-1102 chain unrecorded.
  await recordReservedMatterChain(checker, {
    waqfId: DOOR_WAQF,
    approvalRequestId: minted.approvalRequestId,
  });
  await checker.approval.approve({
    waqfId: DOOR_WAQF,
    approvalRequestId: minted.approvalRequestId,
  });
  return minted.approvalRequestId;
}

async function classificationOf(waqfId: string): Promise<string> {
  const prisma = await privilegedPrisma();
  const rows = await prisma.$queryRawUnsafe<WaqfRow[]>(
    `SELECT "classification"::text AS classification FROM "waqf" WHERE "id" = '${waqfId}'`,
  );
  return String(rows[0]?.classification);
}

async function approvalStatus(id: string): Promise<string> {
  const prisma = await privilegedPrisma();
  const rows = await prisma.$queryRawUnsafe<ApprovalRow[]>(
    `SELECT "status"::text AS status FROM "approval_request" WHERE "id" = '${id}'`,
  );
  return String(rows[0]?.status);
}

describe.skipIf(!hasDatabase)(
  'classification.returnToNotClassified — the migration-34 door',
  () => {
    beforeAll(async () => {
      if (!hasDatabase) {
        warnNoDatabase('classification return door');
        return;
      }
      await assertSeeded();
      await provisionIntakeEndowment({ id: DOOR_WAQF, classification: 'MEDIUM' });
      await provisionTestSubjects([
        {
          id: MAKER,
          role: 'CASE_MANAGER',
          waqfIds: [DOOR_WAQF],
          permissions: [
            'endowment:waqf:read',
            'endowment:waqf:write',
            'compliance:task:read',
            'compliance:task:write',
            'legal:reserved_matter:read',
            'approval:request:read',
            'approval:request:initiate',
          ],
        },
        {
          id: CHECKER,
          role: 'NAZIR',
          waqfIds: [DOOR_WAQF],
          permissions: [
            'endowment:waqf:read',
            'endowment:waqf:write',
            'legal:reserved_matter:read',
            'legal:reserved_matter:write',
            'legal:reserved_matter:approve',
            'approval:request:read',
            'approval:request:approve',
          ],
        },
      ]);
    }, 300_000);

    afterAll(async () => {
      if (hasDatabase) {
        await cleanupApiTestRows();
        await deleteProvisionedEndowments([DOOR_WAQF]);
      }
      await closeDatabase();
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * ARM 2 FIRST — the ungated path, on a subject that still holds a REAL class.
     *
     * Deliberately BEFORE arm 1: once the door has been walked the endowment is NOT_CLASSIFIED and
     * a NOT_CLASSIFIED → NOT_CLASSIFIED no-op is allowed by design, so the refusal under test would
     * never be reached. A guard test whose verdict depends on which sibling ran first is measuring
     * the runner (the lesson `endowment-record.integration.test.ts` records at its own Q4 guard).
     * ═════════════════════════════════════════════════════════════════════════════════════════ */
    describe('ARM 2 · the UNGATED path still refuses, at the database, on the app role', () => {
      it('a bare UPDATE of the column is refused 42501 with no approval in scope', async () => {
        const prisma = await basePrisma();
        await expect(
          prisma.$executeRawUnsafe(
            `UPDATE "waqf" SET "classification" = 'NOT_CLASSIFIED' WHERE "id" = $1`,
            DOOR_WAQF,
          ),
        ).rejects.toThrow(/RESERVED MATTER|not approved/);
        expect(await classificationOf(DOOR_WAQF)).toBe('MEDIUM');
      });

      it('a bare history INSERT recording the transition is ALSO refused — the half a maintainer would leave open', async () => {
        // ⚠ THE ENTANGLEMENT. Relaxing only the column guard would leave the history FORBIDDEN from
        // recording the transition the column guard now demands — a condition that can never be
        // satisfied, reporting "the door works; nothing has gone through it". Both refusals moved in
        // migration 44 and both are proven here.
        //
        // `from` is the subject's REAL current class, so migration 12's fabricated-transition check
        // passes and what is proven is specifically the gated `to`-check.
        const prisma = await basePrisma();
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "reclassification_event" ("id","waqfId","from","to","at","atHijri","reason","createdAt")
             VALUES ('door-ungated-event', $1, 'MEDIUM', 'NOT_CLASSIFIED', now(), '1448-03-01', 'ungated', now())`,
            DOOR_WAQF,
          ),
        ).rejects.toThrow(/RESERVED MATTER|not approved/);
      });

      it('an approval of the WRONG KIND on the right subject is refused by the procedure', async () => {
        // The database cannot make this comparison — `ReservedMatterKind` is a Prisma enum and the
        // guard's subject is a free-text string — so this is the procedure's half of the gate, and
        // it is why the kind exists separately at all: an approved istibdal is not a licence to
        // revoke a classification.
        const wrongKind = await mintAndApprove('DEED_IDENTITY', 'door-wrongkind');
        const caller = createCaller(
          await contextFor({ userId: MAKER, requestId: 'door-wrongkind' }),
        );
        await expect(
          caller.classification.returnToNotClassified({
            waqfId: DOOR_WAQF,
            approvalRequestId: wrongKind,
            at: '2026-08-30T00:00:00.000Z',
            atHijri: '1448-03-17',
            reason: 'wrong kind must not open the door',
          }),
        ).rejects.toThrow(/CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED/);
        expect(await classificationOf(DOOR_WAQF)).toBe('MEDIUM');

        // ⚠ VOID IT, or the next test cannot run. `approval_request_one_open_per_subject` allows ONE
        // non-terminal row per (waqfId, type, subject) — "two simultaneously-valid approvals for one
        // act is a second authority by arithmetic (MP-31)" — and this wrong-kind row is APPROVED on
        // the SAME subject the real one needs. That constraint is correct and is why this cleanup
        // exists: the test must leave the slot as it found it. APPROVED → VOID is a legal edge.
        const prisma = await privilegedPrisma();
        await prisma.$executeRawUnsafe(
          `UPDATE "approval_request" SET "status" = 'VOID' WHERE "id" = '${wrongKind}'`,
        );
        expect(await approvalStatus(wrongKind)).toBe('VOID');
      });
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * ARM 1 — the authorised path, and everything the disposition ruling names.
     * ═════════════════════════════════════════════════════════════════════════════════════════ */
    describe('ARM 1 · the gated path opens and does what the ruling says', () => {
      let spentApprovalId = '';

      it('returns the endowment, retires the OPEN tasks with the ruled reason, and spends the approval', async () => {
        const prisma = await privilegedPrisma();
        // A register to retire: two open rows and one COMPLETED, planted raw. The COMPLETED row is
        // the subject of the "the open tasks" clause — it must survive untouched.
        const obligation = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT "id" FROM "compliance_obligation" WHERE "deletedAt" IS NULL ORDER BY "code" LIMIT 1`,
        );
        const obligationId = String(obligation[0]?.id);
        for (const [id, status] of [
          ['door-t-open1', 'NOT_STARTED'],
          ['door-t-open2', 'IN_PROGRESS'],
          ['door-t-done', 'COMPLETED'],
        ] as const) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "compliance_task"
             ("id","waqfId","obligationId","templateCode","templateVersion","status",
              "classificationAtInstantiation","instantiatedReason","createdAt","updatedAt")
           VALUES ('${id}', '${DOOR_WAQF}', '${obligationId}', 'CODE-${id}', '2026-08-26.1',
                   '${status}'::"ComplianceTaskStatus", 'MEDIUM'::"WaqfClassification",
                   'INITIAL_SETUP'::"TaskInstantiationReason", now(), now())`,
          );
        }

        spentApprovalId = await mintAndApprove(
          'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED',
          'door-arm1',
        );
        expect(await approvalStatus(spentApprovalId)).toBe('APPROVED');

        const caller = createCaller(
          await contextFor({ userId: MAKER, requestId: 'door-arm1-exec' }),
        );
        const result = await caller.classification.returnToNotClassified({
          waqfId: DOOR_WAQF,
          approvalRequestId: spentApprovalId,
          at: '2026-08-30T00:00:00.000Z',
          atHijri: '1448-03-17',
          reason: 'classification was entered on the wrong endowment',
        });

        expect(result.from).toBe('MEDIUM');
        expect(result.to).toBe('NOT_CLASSIFIED');
        expect(result.registerRelocked).toBe(true);
        expect(await classificationOf(DOOR_WAQF)).toBe('NOT_CLASSIFIED');

        // THE RULING'S OWN CLAUSE: "retires THE OPEN TASKS with reason 'classification returned to
        // NOT_CLASSIFIED'". Both halves asserted — which rows, and the phrase, verbatim.
        expect(result.tasksRetired.map((t) => t.id).sort()).toEqual([
          'door-t-open1',
          'door-t-open2',
        ]);
        for (const retired of result.tasksRetired) {
          expect(retired.retiredReason).toBe('classification returned to NOT_CLASSIFIED');
        }
        expect(RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON).toBe(
          'classification returned to NOT_CLASSIFIED',
        );
        expect(result.tasksUntouched.map((t) => t.id)).toEqual(['door-t-done']);

        // "rows kept, history queryable" — the retired rows are still there, and the event exists.
        const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM "compliance_task" WHERE "waqfId" = '${DOOR_WAQF}'`,
        );
        expect(Number(rows[0]?.n)).toBe(3);
        const events = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM "reclassification_event"
          WHERE "waqfId" = '${DOOR_WAQF}' AND "to"::text = 'NOT_CLASSIFIED'`,
        );
        expect(Number(events[0]?.n)).toBe(1);
      });

      it('⚠ THE APPROVAL IS SPENT — status EXECUTED, asserted on the ROW, not inferred from siblings', async () => {
        // THE MIDDLE ASSERTION. Everything about replay rests on this being a measurement rather than
        // two chained inferences ("the lattice is enforced" + "my procedure resembles its siblings").
        // If this is APPROVED, the id below is a reusable key and the door has no replay protection.
        expect(await approvalStatus(spentApprovalId)).toBe('EXECUTED');
      });

      it('the SAME approval id cannot open the door a second time — the two-cycle case', async () => {
        // Put the endowment back on a real class through the ORDINARY, ungated path (which is what
        // the ruling says to use for a merely-wrong class), then retry the spent approval.
        const nazir = createCaller(
          await contextFor({ userId: CHECKER, requestId: 'door-recycle' }),
        );
        await nazir.classification.reclassify({
          waqfId: DOOR_WAQF,
          to: 'SMALL',
          at: '2026-08-30T01:00:00.000Z',
          atHijri: '1448-03-17',
          reason: 'correct valuation recorded',
        });
        expect(await classificationOf(DOOR_WAQF)).toBe('SMALL');

        const caller = createCaller(await contextFor({ userId: MAKER, requestId: 'door-replay' }));
        await expect(
          caller.classification.returnToNotClassified({
            waqfId: DOOR_WAQF,
            approvalRequestId: spentApprovalId,
            at: '2026-08-30T02:00:00.000Z',
            atHijri: '1448-03-17',
            reason: 'replay of a spent approval',
          }),
        ).rejects.toThrow();
        expect(await classificationOf(DOOR_WAQF)).toBe('SMALL');
      });

      it('and the RAW path is still refused on the second cycle — the stale-event hole, closed', async () => {
        // ⚠ THE CASE A REVIEWER WOULD NOT THINK OF. A qualifying `to = NOT_CLASSIFIED` event now
        // EXISTS on this endowment from cycle 1. Any guard shaped as "an event recording this
        // transition exists" would permit this bare UPDATE with no new history and no authority.
        // The gate is an APPROVAL, not an event lookup, so the stale row buys nothing.
        const prisma = await basePrisma();
        await expect(
          prisma.$executeRawUnsafe(
            `UPDATE "waqf" SET "classification" = 'NOT_CLASSIFIED' WHERE "id" = $1`,
            DOOR_WAQF,
          ),
        ).rejects.toThrow(/RESERVED MATTER|not approved/);
        expect(await classificationOf(DOOR_WAQF)).toBe('SMALL');
      });

      it('a FRESH approval opens it again — the door is single-use, not one-shot', async () => {
        const fresh = await mintAndApprove(
          'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED',
          'door-cycle2',
        );
        const caller = createCaller(
          await contextFor({ userId: MAKER, requestId: 'door-cycle2-exec' }),
        );
        const result = await caller.classification.returnToNotClassified({
          waqfId: DOOR_WAQF,
          approvalRequestId: fresh,
          at: '2026-08-30T03:00:00.000Z',
          atHijri: '1448-03-17',
          reason: 'second erroneous classification, second approval',
        });
        expect(result.from).toBe('SMALL');
        expect(await classificationOf(DOOR_WAQF)).toBe('NOT_CLASSIFIED');
        expect(await approvalStatus(fresh)).toBe('EXECUTED');
      });
    });
  },
);
