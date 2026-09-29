/**
 * ⊕ S11-1 — the clock-start dates as RECORDED OPERATOR INPUT, on the wire and in the database.
 *
 * Owner ruling 2026-08-31 (`9f3d8fd`): the `REGISTER_30BD` and `ISTIBDAL_10BD` anchors are an input
 * field, with the KIND as a dropdown, and BLANK MEANS "CANNOT COMPUTE", NEVER "NO DEADLINE". Owner
 * ruling 2026-09-02 (`f57e13d`): the dates are EDITABLE and the audit log is the history.
 *
 * What this file proves, each as a driven attack rather than a shape assertion:
 *
 *  1. the SEEDED state — three `REGISTER_30BD` rows (waqf-001 open, waqf-002 DISCHARGED, waqf-004 open —
 *     ⊕ S11-2; was exactly one), none for `ISTIBDAL_10BD`, none
 *     for `LICENSE_RENEWAL`; waqf-007's anchor recorded but uncomputed (calendar coverage);
 *  2. record → a frozen Deadline computed from the recorded anchor, provenance in the snapshot, the
 *     source row updated, the audit trail carrying the PRIOR value ("audit log maintain record");
 *  3. correction → a NEW row chained by `recomputedFromId`, the first row untouched, and a SECOND
 *     correction chaining from the NEWEST row (the UNIQUE index is what would refuse a tree);
 *  4. the compute is NOT all-or-nothing — an out-of-coverage anchor is PERSISTED, the refusal
 *     recorded by name, no Deadline row, the standing head WITHDRAWN;
 *  5. clearing → columns NULL, the head withdrawn, audited;
 *  6. a date without its kind is refused before anything is written;
 *  7. a seat holding `compliance:task:write` ALONE (the sweep seat's shape) cannot record an anchor —
 *     the machine cannot invent a clock-start;
 *  8. istibdal completion on exp-001, its chain, a cross-endowment id refused as NOT_FOUND, and the
 *     head-per-expropriation invariant with TWO takings on one endowment (no cross-talk).
 *
 * Every anchor this file records is RESTORED to the fixture's value in `afterAll`, and every Deadline
 * row it creates is soft-deleted, so the seeded state above is what the next file finds.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  contextFor,
  countAuditEvents,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const OFFICER = `${API_TEST_PREFIX}s11-anchor-officer`;
const TASK_ONLY_SEAT = `${API_TEST_PREFIX}s11-anchor-task-only`;
/** Blank registration anchor in the fixture — the record/correct/clear subject. */
const BLANK_WAQF = 'waqf-005';
/** The fixture's in-coverage anchor (2026-03-01, REGULATION_EFFECTIVE_DATE) with its seeded OPEN row. */
const SEEDED_WAQF = 'waqf-001';
/** The fixture's out-of-coverage anchor (2015-08-13, WAQF_DOCUMENTATION_DATE), no row. */
const COVERAGE_WAQF = 'waqf-007';
/** ⊕ S11-2 — seeded DISCHARGED (MET on 2026-04-20; anchor 2026-04-05) and seeded OPEN (anchor 2026-04-19). */
const DISCHARGED_WAQF = 'waqf-002';
const WRITE_JOURNEY_WAQF = 'waqf-004';
/** The fixture's one expropriation, istibdal pending. */
const EXP_WAQF = 'waqf-003';
const EXP = 'exp-001';
const SECOND_EXP = `${API_TEST_PREFIX}s11-exp-second`;

const IN_COVERAGE_A = '2026-03-01';
const IN_COVERAGE_B = '2026-04-05';
const IN_COVERAGE_C = '2026-04-19';
const OUT_OF_COVERAGE = '2015-08-13';

function hijriOf(day: string): string {
  return String(toHijriSnapshot(new Date(`${day}T00:00:00.000Z`)));
}
function iso(day: string): string {
  return `${day}T00:00:00.000Z`;
}

async function officerCaller(requestId: string) {
  return createCaller(await contextFor({ userId: OFFICER, requestId }));
}

async function deadlineRows(where: string): Promise<
  {
    id: string;
    waqfId: string;
    ruleKey: string;
    anchorDate: Date;
    recomputedFromId: string | null;
    deletedAt: Date | null;
    satisfiedAt: Date | null;
    dischargeKind: string | null;
    windowSnapshot: Record<string, unknown>;
  }[]
> {
  const raw = await privilegedPrisma();
  return raw.$queryRawUnsafe(
    `SELECT "id","waqfId","ruleKey","anchorDate","recomputedFromId","deletedAt","satisfiedAt","dischargeKind","windowSnapshot"
       FROM "deadline" WHERE ${where} ORDER BY "createdAt" ASC`,
  );
}

async function waqfAnchor(waqfId: string): Promise<{
  registrationAnchorDate: Date | null;
  registrationAnchorDateHijri: string | null;
  registrationAnchorKind: string | null;
}> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<
    {
      registrationAnchorDate: Date | null;
      registrationAnchorDateHijri: string | null;
      registrationAnchorKind: string | null;
    }[]
  >(
    `SELECT "registrationAnchorDate","registrationAnchorDateHijri","registrationAnchorKind"
       FROM "waqf" WHERE "id" = '${waqfId}'`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`${waqfId} is not seeded`);
  return row;
}

async function softDeleteLiveDeadlines(waqfId: string, ruleKey: string): Promise<void> {
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    `UPDATE "deadline" SET "deletedAt" = now()
       WHERE "waqfId" = '${waqfId}' AND "ruleKey" = '${ruleKey}' AND "deletedAt" IS NULL
         AND "id" NOT LIKE 'deadline-register-30bd-%'`,
  );
}

describe.runIf(hasDatabase)('S11-1 · the clock-start dates as recorded operator input', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [BLANK_WAQF, SEEDED_WAQF, COVERAGE_WAQF, EXP_WAQF],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'endowment:asset:read',
          'endowment:asset:write',
          'compliance:task:read',
          'compliance:task:write',
        ],
      },
      {
        // The deadline-sweep SERVICE seat's shape: the one write verb that lets it write a deadline,
        // and nothing that lets it say when a clock started.
        id: TASK_ONLY_SEAT,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [BLANK_WAQF, EXP_WAQF],
        permissions: ['compliance:task:read', 'compliance:task:write'],
      },
    ]);
    // Self-healing: a previous process killed mid-file leaves a recorded anchor on the blank subject.
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      `UPDATE "waqf" SET "registrationAnchorDate" = NULL, "registrationAnchorDateHijri" = NULL,
         "registrationAnchorKind" = NULL WHERE "id" = '${BLANK_WAQF}'`,
    );
    await raw.$executeRawUnsafe(
      `UPDATE "expropriation" SET "istibdalCompletedDate" = NULL, "istibdalCompletedDateHijri" = NULL
         WHERE "id" = '${EXP}'`,
    );
    await softDeleteLiveDeadlines(BLANK_WAQF, 'REGISTER_30BD');
    await softDeleteLiveDeadlines(EXP_WAQF, 'ISTIBDAL_10BD');
  });

  afterAll(async () => {
    const raw = await privilegedPrisma();
    // Restore the fixture's recorded state EXACTLY, so the seeded pins below hold for the next file.
    await raw.$executeRawUnsafe(
      `UPDATE "waqf" SET "registrationAnchorDate" = NULL, "registrationAnchorDateHijri" = NULL,
         "registrationAnchorKind" = NULL WHERE "id" = '${BLANK_WAQF}'`,
    );
    await raw.$executeRawUnsafe(
      `UPDATE "expropriation" SET "istibdalCompletedDate" = NULL, "istibdalCompletedDateHijri" = NULL
         WHERE "id" IN ('${EXP}', '${SECOND_EXP}')`,
    );
    await softDeleteLiveDeadlines(BLANK_WAQF, 'REGISTER_30BD');
    await softDeleteLiveDeadlines(EXP_WAQF, 'ISTIBDAL_10BD');
    await raw.$executeRawUnsafe(
      `UPDATE "expropriation" SET "deletedAt" = now() WHERE "id" = '${SECOND_EXP}' AND "deletedAt" IS NULL`,
    );
    await cleanupApiTestRows();
  });

  /* ── 1 · the seeded state, measured ──────────────────────────────────────────────────────── */

  it('the seed holds EXACTLY three REGISTER_30BD rows — waqf-001 OPEN, waqf-002 DISCHARGED (MET), waqf-004 OPEN — none for ISTIBDAL_10BD, none for LICENSE_RENEWAL', async () => {
    const register = await deadlineRows(
      `"ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL AND "id" LIKE 'deadline-register-30bd-%'`,
    );
    expect([...register.map((row) => row.waqfId)].sort()).toStrictEqual([
      SEEDED_WAQF,
      DISCHARGED_WAQF,
      WRITE_JOURNEY_WAQF,
    ]);
    const seeded = register.find((row) => row.waqfId === SEEDED_WAQF);
    expect(new Date(String(seeded?.anchorDate)).toISOString().slice(0, 10)).toBe(IN_COVERAGE_A);
    // ⊕ S11-2 — the seed writes the discharge exactly as the API does: satisfiedAt + kind MET, and
    // ONLY on the endowment the fixture records as discharged. The other two stand open.
    expect(seeded?.satisfiedAt).toBeNull();
    expect(seeded?.dischargeKind).toBeNull();
    const discharged = register.find((row) => row.waqfId === DISCHARGED_WAQF);
    expect(new Date(String(discharged?.satisfiedAt)).toISOString().slice(0, 10)).toBe('2026-04-20');
    expect(discharged?.dischargeKind).toBe('MET');
    const open = register.find((row) => row.waqfId === WRITE_JOURNEY_WAQF);
    expect(open?.satisfiedAt).toBeNull();
    // Provenance frozen INTO the seeded row, exactly as the router writes it.
    expect(seeded?.windowSnapshot['anchorSource']).toStrictEqual({
      subject: 'waqf',
      sourceId: SEEDED_WAQF,
      kind: 'REGULATION_EFFECTIVE_DATE',
    });
    expect(await deadlineRows(`"ruleKey" = 'ISTIBDAL_10BD' AND "deletedAt" IS NULL`)).toHaveLength(
      0,
    );
    expect(
      await deadlineRows(`"ruleKey" = 'LICENSE_RENEWAL' AND "deletedAt" IS NULL`),
    ).toHaveLength(0);
  });

  it('waqf-007: anchor RECORDED, no row — the seed refused to compute outside coverage rather than guess', async () => {
    const anchor = await waqfAnchor(COVERAGE_WAQF);
    expect(new Date(String(anchor.registrationAnchorDate)).toISOString().slice(0, 10)).toBe(
      OUT_OF_COVERAGE,
    );
    expect(anchor.registrationAnchorKind).toBe('WAQF_DOCUMENTATION_DATE');
    expect(
      await deadlineRows(
        `"waqfId" = '${COVERAGE_WAQF}' AND "ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL`,
      ),
    ).toHaveLength(0);
  });

  /* ── 2 · record → compute, in one transaction ────────────────────────────────────────────── */

  it('records the anchor WITH its kind and computes the frozen deadline from it — provenance in the snapshot', async () => {
    const caller = await officerCaller('s11-anchor-record');
    const before = await countAuditEvents({ action: 'CREATE', waqfId: BLANK_WAQF });
    const result = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: iso(IN_COVERAGE_A),
      dateHijri: hijriOf(IN_COVERAGE_A),
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — record the clock-start',
    });
    expect(result.recorded).toStrictEqual({
      date: IN_COVERAGE_A,
      dateHijri: hijriOf(IN_COVERAGE_A),
      kind: 'REGULATION_EFFECTIVE_DATE',
    });
    expect(result.computeRefusal).toBeNull();
    expect(result.supersededDeadlineId).toBeNull();
    expect(result.deadline).not.toBeNull();

    const anchor = await waqfAnchor(BLANK_WAQF);
    expect(new Date(String(anchor.registrationAnchorDate)).toISOString().slice(0, 10)).toBe(
      IN_COVERAGE_A,
    );
    expect(anchor.registrationAnchorKind).toBe('REGULATION_EFFECTIVE_DATE');

    const rows = await deadlineRows(
      `"waqfId" = '${BLANK_WAQF}' AND "ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL`,
    );
    expect(rows).toHaveLength(1);
    expect(new Date(String(rows[0]?.anchorDate)).toISOString().slice(0, 10)).toBe(IN_COVERAGE_A);
    expect(rows[0]?.recomputedFromId).toBeNull();
    expect(rows[0]?.windowSnapshot['anchorSource']).toStrictEqual({
      subject: 'waqf',
      sourceId: BLANK_WAQF,
      kind: 'REGULATION_EFFECTIVE_DATE',
    });
    // TWO CREATE events for one computed deadline, and both are wanted: the audit extension's own
    // row event (`audit.ts` records every `create`) and the procedure's NAMED event carrying the
    // provenance and the trigger — the S9-3c precedent `computeFromDerivedAnchor` set. The waqf
    // UPDATE has its own event, counted in the next test.
    // ⚠ The named event is identified by its `triggerEvent`, NOT by `context.procedure`: MEASURED on
    // 2026-09-02, an event recorded through `recordEvent(toActorContext(ctx, { procedure }))` INSIDE
    // an `auditedWrite` transaction is stored with the TRANSACTION's context, and `procedure` is
    // absent from it — for this path and for S9-3c's `computeFromDerivedAnchor` alike (the
    // `s93c-derive-kyc` events carry no procedure either). `distribution.execute`, which records
    // AFTER its transaction, does carry one. Recorded as a finding for the audit spine, not fixed here.
    expect(await countAuditEvents({ action: 'CREATE', waqfId: BLANK_WAQF })).toBe(before + 2);
    const createdId = (result.deadline as { id: string }).id;
    const raw = await privilegedPrisma();
    const named = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "audit_event"
         WHERE "entityType" = 'Deadline' AND "entityId" = '${createdId}' AND "action" = 'CREATE'
           AND "context"->>'triggerEvent' = 'test — record the clock-start'`,
    );
    expect(Number(named[0]?.n ?? 0)).toBe(1);
  });

  it('the anchor UPDATE is audited with its PRIOR value — "audit log maintain record" (f57e13d)', async () => {
    const raw = await privilegedPrisma();
    const events = await raw.$queryRawUnsafe<
      { before: Record<string, unknown> | null; after: Record<string, unknown> | null }[]
    >(
      `SELECT "before","after" FROM "audit_event"
         WHERE "entityType" = 'Waqf' AND "entityId" = '${BLANK_WAQF}' AND "action" = 'UPDATE'
         ORDER BY "id" DESC LIMIT 1`,
    );
    const event = events[0];
    expect(event, 'no UPDATE event for the anchor write').toBeDefined();
    // The extension diffs a FULL-ROW pre-image: the prior value (NULL) is on the record beside the new.
    expect(event?.before?.['registrationAnchorKind'] ?? null).toBeNull();
    expect(event?.after?.['registrationAnchorKind']).toBe('REGULATION_EFFECTIVE_DATE');
  });

  it('derives the Hijri twin SERVER-SIDE when the caller (the web app) supplies none — and stores no half pair', async () => {
    const caller = await officerCaller('s11-anchor-no-hijri');
    const result = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: iso(IN_COVERAGE_A),
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — a caller with no calendar implementation',
    });
    expect(result.recorded?.dateHijri).toBe(hijriOf(IN_COVERAGE_A));
    const anchor = await waqfAnchor(BLANK_WAQF);
    expect(anchor.registrationAnchorDateHijri).toBe(hijriOf(IN_COVERAGE_A));
  });

  /* ── 3 · a correction is a CHAIN, not an edit ────────────────────────────────────────────── */

  it('a correction INSERTs a new row chained from the head; a second correction chains from the NEWEST row', async () => {
    const caller = await officerCaller('s11-anchor-correct');
    const liveBefore = await deadlineRows(
      `"waqfId" = '${BLANK_WAQF}' AND "ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL`,
    );
    // The record + no-hijri tests above each superseded the previous head; exactly one live head now.
    const heads = liveBefore.filter(
      (row) => !liveBefore.some((other) => other.recomputedFromId === row.id),
    );
    expect(heads).toHaveLength(1);
    const headId = heads[0]?.id ?? '';

    const first = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: iso(IN_COVERAGE_B),
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — first correction',
    });
    expect(first.supersededDeadlineId).toBe(headId);
    const firstRow = first.deadline as { id: string; recomputedFromId: string | null };
    expect(firstRow.recomputedFromId).toBe(headId);

    const second = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: iso(IN_COVERAGE_C),
      kind: 'WAQF_DOCUMENTATION_DATE',
      triggerEvent: 'test — second correction',
    });
    // ⚠ From the NEWEST row, not the original — `UNIQUE("recomputedFromId")` refuses a tree.
    expect(second.supersededDeadlineId).toBe(firstRow.id);
    const secondRow = second.deadline as { id: string; recomputedFromId: string | null };
    expect(secondRow.recomputedFromId).toBe(firstRow.id);

    // The superseded rows are UNTOUCHED — frozen, not edited, not deleted.
    const all = await deadlineRows(`"waqfId" = '${BLANK_WAQF}' AND "ruleKey" = 'REGISTER_30BD'`);
    const original = all.find((row) => row.id === headId);
    expect(original?.deletedAt).toBeNull();
    expect(new Date(String(original?.anchorDate)).toISOString().slice(0, 10)).toBe(IN_COVERAGE_A);
    // And the kind travelled with the correction into the new row's provenance.
    expect(
      all.find((row) => row.id === secondRow.id)?.windowSnapshot['anchorSource'],
    ).toStrictEqual({
      subject: 'waqf',
      sourceId: BLANK_WAQF,
      kind: 'WAQF_DOCUMENTATION_DATE',
    });
  });

  /* ── 4 · the compute is NOT all-or-nothing ───────────────────────────────────────────────── */

  it('an anchor OUTSIDE calendar coverage is PERSISTED, its refusal recorded by name, no row written, the head WITHDRAWN', async () => {
    const caller = await officerCaller('s11-anchor-coverage');
    const liveBefore = await deadlineRows(
      `"waqfId" = '${BLANK_WAQF}' AND "ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL`,
    );
    const headBefore = liveBefore.find(
      (row) => !liveBefore.some((o) => o.recomputedFromId === row.id),
    );
    expect(headBefore).toBeDefined();

    const result = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: iso(OUT_OF_COVERAGE),
      kind: 'WAQF_DOCUMENTATION_DATE',
      triggerEvent: 'test — a valid date the calendar cannot reach',
    });
    // THE OPERATOR'S INPUT STANDS.
    expect(result.recorded?.date).toBe(OUT_OF_COVERAGE);
    const anchor = await waqfAnchor(BLANK_WAQF);
    expect(new Date(String(anchor.registrationAnchorDate)).toISOString().slice(0, 10)).toBe(
      OUT_OF_COVERAGE,
    );
    // THE REFUSAL IS A VALUE, BY NAME.
    expect(result.deadline).toBeNull();
    expect(result.computeRefusal?.code).toBe('CALENDAR_UNAVAILABLE');
    // The head computed from the superseded anchor no longer stands — WITHDRAWN (soft-deleted), while
    // the superseded rows behind it stay live as frozen history (each one names the row that replaced
    // it). So after the withdrawal there is NO live head: every live row is superseded by another.
    expect(result.withdrawnDeadlineId).toBe(headBefore?.id);
    const all = await deadlineRows(`"waqfId" = '${BLANK_WAQF}' AND "ruleKey" = 'REGISTER_30BD'`);
    const withdrawn = all.find((row) => row.id === headBefore?.id);
    expect(withdrawn?.deletedAt).not.toBeNull();
    const liveAfter = all.filter((row) => row.deletedAt === null);
    expect(liveAfter).toHaveLength(liveBefore.length - 1);
    // ⚠ A WITHDRAWN SUCCESSOR STILL SUPERSEDES. The row the withdrawn head replaced does NOT revive
    // as "current" — its computation was for an anchor that has since been corrected away. So the
    // successor check runs over ALL rows (soft-deleted included), exactly as `selectAnchorChainHead`
    // reads `recomputedTo`; a later computable anchor starts a FRESH chain, and the trail links them.
    const liveHeads = liveAfter.filter((row) => !all.some((o) => o.recomputedFromId === row.id));
    expect(liveHeads).toHaveLength(0);
    // And the refusal is on the trail, so a screen can say "recorded — not computable".
    const raw = await privilegedPrisma();
    const refusals = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "audit_event"
         WHERE "entityType" = 'DeadlineComputation' AND "entityId" = 'REGISTER_30BD:${BLANK_WAQF}'
           AND "context"::text LIKE '%CALENDAR_UNAVAILABLE%'`,
    );
    expect(Number(refusals[0]?.n ?? 0)).toBeGreaterThan(0);
  });

  /* ── 5 · clearing ─────────────────────────────────────────────────────────────────────────── */

  it('clearing sets all three columns NULL; a later record starts a FRESH chain', async () => {
    const caller = await officerCaller('s11-anchor-clear');
    const cleared = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: null,
      kind: null,
      triggerEvent: 'test — clear the anchor',
    });
    expect(cleared.recorded).toBeNull();
    expect(cleared.deadline).toBeNull();
    const anchor = await waqfAnchor(BLANK_WAQF);
    expect(anchor.registrationAnchorDate).toBeNull();
    expect(anchor.registrationAnchorDateHijri).toBeNull();
    expect(anchor.registrationAnchorKind).toBeNull();

    const again = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: iso(IN_COVERAGE_A),
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — record after clearing',
    });
    expect(again.supersededDeadlineId).toBeNull();
    expect((again.deadline as { recomputedFromId: string | null }).recomputedFromId).toBeNull();
    // Then withdraw it so the next test starts clean.
    const clearedAgain = await caller.deadline.recordRegistrationAnchor({
      waqfId: BLANK_WAQF,
      date: null,
      kind: null,
      triggerEvent: 'test — clear again',
    });
    expect(clearedAgain.withdrawnDeadlineId).toBe((again.deadline as { id: string }).id);
  });

  /* ── 6 · the kind is part of the record ──────────────────────────────────────────────────── */

  it('REFUSES a date without its kind before anything is written — a bare date is not the record', async () => {
    const caller = await officerCaller('s11-anchor-no-kind');
    await expect(
      caller.deadline.recordRegistrationAnchor({
        waqfId: BLANK_WAQF,
        date: iso(IN_COVERAGE_A),
        kind: null,
        triggerEvent: 'test — a bare date',
      }),
    ).rejects.toThrow();
    const anchor = await waqfAnchor(BLANK_WAQF);
    expect(anchor.registrationAnchorDate).toBeNull();
  });

  /* ── 7 · the machine cannot invent a clock-start ─────────────────────────────────────────── */

  it('a seat holding compliance:task:write ALONE (the sweep seat shape) is refused — it can write a deadline, never an anchor', async () => {
    const seat = createCaller(
      await contextFor({ userId: TASK_ONLY_SEAT, requestId: 's11-anchor-seat' }),
    );
    let message = '';
    try {
      await seat.deadline.recordRegistrationAnchor({
        waqfId: BLANK_WAQF,
        date: iso(IN_COVERAGE_A),
        kind: 'REGULATION_EFFECTIVE_DATE',
        triggerEvent: 'test — the sweep seat tries to say when the clock started',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/endowment:waqf:write|PERMISSION_DENIED/);
    const anchor = await waqfAnchor(BLANK_WAQF);
    expect(anchor.registrationAnchorDate).toBeNull();
  });

  /* ── 8 · istibdal completion — per taking, chained, non-disclosing ────────────────────────── */

  it("records exp-001's completion and computes ISTIBDAL_10BD with the expropriation as its source", async () => {
    const caller = await officerCaller('s11-istibdal-record');
    const result = await caller.deadline.recordIstibdalCompletion({
      waqfId: EXP_WAQF,
      expropriationId: EXP,
      date: iso(IN_COVERAGE_A),
      triggerEvent: 'test — the substitution completed',
    });
    expect(result.recorded?.kind).toBeNull();
    expect(result.deadline).not.toBeNull();
    const rows = await deadlineRows(
      `"waqfId" = '${EXP_WAQF}' AND "ruleKey" = 'ISTIBDAL_10BD' AND "deletedAt" IS NULL`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.windowSnapshot['anchorSource']).toStrictEqual({
      subject: 'expropriation',
      sourceId: EXP,
      kind: null,
    });
  });

  it('a cross-endowment expropriation id reads exactly like a nonexistent one — nothing written', async () => {
    const caller = await officerCaller('s11-istibdal-cross');
    const raw = await privilegedPrisma();
    const before = await raw.$queryRawUnsafe<{ d: Date | null }[]>(
      `SELECT "istibdalCompletedDate" AS d FROM "expropriation" WHERE "id" = '${EXP}'`,
    );
    const rowsBefore = await deadlineRows(`"ruleKey" = 'ISTIBDAL_10BD' AND "deletedAt" IS NULL`);
    let message = '';
    try {
      await caller.deadline.recordIstibdalCompletion({
        waqfId: BLANK_WAQF, // exp-001 belongs to waqf-003
        expropriationId: EXP,
        date: iso(IN_COVERAGE_B),
        triggerEvent: "test — another endowment's taking",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    // §10 §7.2's non-disclosure shape on the wire: `NO_GRANT` surfaces as NOT_FOUND with the developer
    // sentence WITHHELD — the caller learns nothing about whether the taking exists.
    expect(message).toMatch(/NOT_FOUND/);
    expect(message).not.toMatch(/expropriation/);
    // And nothing moved: the other endowment's row and the deadline table are as they were.
    const after = await raw.$queryRawUnsafe<{ d: Date | null }[]>(
      `SELECT "istibdalCompletedDate" AS d FROM "expropriation" WHERE "id" = '${EXP}'`,
    );
    expect(String(after[0]?.d)).toBe(String(before[0]?.d));
    expect(await deadlineRows(`"ruleKey" = 'ISTIBDAL_10BD' AND "deletedAt" IS NULL`)).toHaveLength(
      rowsBefore.length,
    );
  });

  it('TWO takings on one endowment keep separate chains — one head each, corrections do not cross-talk', async () => {
    const raw = await privilegedPrisma();
    // A second expropriation on waqf-003's other asset, test-prefixed, soft-deleted in afterAll.
    await raw.$executeRawUnsafe(
      `INSERT INTO "expropriation" ("id","assetId","waqfId","authorityAr","scope","announcedDate",
         "announcedDateHijri","compensationStatus","istibdalStatus","createdAt","updatedAt")
       VALUES ('${SECOND_EXP}','asset-004','${EXP_WAQF}','جهة وهمية (بيانات وهمية)','partial',
         '2026-03-01T00:00:00.000Z','${hijriOf('2026-03-01')}','assessed','pending_authority_permission',
         now(), now())
       ON CONFLICT ("id") DO UPDATE SET "deletedAt" = NULL`,
    );
    const caller = await officerCaller('s11-istibdal-two');

    const second = await caller.deadline.recordIstibdalCompletion({
      waqfId: EXP_WAQF,
      expropriationId: SECOND_EXP,
      date: iso(IN_COVERAGE_B),
      triggerEvent: 'test — second taking completed',
    });
    expect(second.supersededDeadlineId).toBeNull(); // its OWN chain, not exp-001's

    // Correct BOTH once.
    const firstCorrected = await caller.deadline.recordIstibdalCompletion({
      waqfId: EXP_WAQF,
      expropriationId: EXP,
      date: iso(IN_COVERAGE_B),
      triggerEvent: 'test — correct the first',
    });
    const secondCorrected = await caller.deadline.recordIstibdalCompletion({
      waqfId: EXP_WAQF,
      expropriationId: SECOND_EXP,
      date: iso(IN_COVERAGE_C),
      triggerEvent: 'test — correct the second',
    });

    const live = await deadlineRows(
      `"waqfId" = '${EXP_WAQF}' AND "ruleKey" = 'ISTIBDAL_10BD' AND "deletedAt" IS NULL`,
    );
    const bySource = (sourceId: string) =>
      live.filter(
        (row) => (row.windowSnapshot['anchorSource'] as { sourceId: string }).sourceId === sourceId,
      );
    const headsOf = (rows: typeof live) =>
      rows.filter((row) => !rows.some((o) => o.recomputedFromId === row.id));

    expect(bySource(EXP)).toHaveLength(2);
    expect(bySource(SECOND_EXP)).toHaveLength(2);
    expect(headsOf(bySource(EXP)).map((r) => r.id)).toStrictEqual([
      (firstCorrected.deadline as { id: string }).id,
    ]);
    expect(headsOf(bySource(SECOND_EXP)).map((r) => r.id)).toStrictEqual([
      (secondCorrected.deadline as { id: string }).id,
    ]);
    // No cross-talk: each correction superseded ITS OWN taking's head.
    expect(firstCorrected.supersededDeadlineId).not.toBe(
      second.deadline === null ? '' : (second.deadline as { id: string }).id,
    );
    expect(secondCorrected.supersededDeadlineId).toBe((second.deadline as { id: string }).id);
  });
});
