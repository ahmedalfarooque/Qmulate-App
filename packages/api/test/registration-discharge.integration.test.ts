/**
 * ⊕ S11-2 — the REGISTER_30BD duty recorded as DISCHARGED, on the wire and in the database.
 *
 * Owner ruling 2026-09-02 (S4 memo, S11 addendum second batch; record f797fea): *"yes, build the
 * discharge path"* — the red clears because the duty was MET, never by editing the clock-start. Two
 * engineering conditions travelled with it and are driven here as attacks: (1) the anchor stays TRUE;
 * (2) the seam for a third state is a closed, pinned vocabulary (`packages/database`'s pin).
 *
 * What this file proves:
 *
 *  1. the SEEDED discharged row (waqf-002) is already MET and a second discharge is refused BY NAME;
 *  2. record an anchor on a blank endowment → discharge → `satisfiedAt` + `dischargeKind: MET` on the
 *     head, the anchor triple BYTE-IDENTICAL before and after, the task mirror reported honestly
 *     (`taskMirrored: false` — the fixture instantiates no register), one named audit event carrying
 *     the lateness figure and the Hijri twin;
 *  3. a discharge dated BEFORE the clock-start is refused (input error or the counsel case);
 *  4. a discharge dated in the FUTURE (relative to the request's stated clock) is refused;
 *  5. an endowment with NO deadline row is refused — including the recorded-but-not-computable shape
 *     (waqf-007), the declared gap;
 *  6. correction AFTER discharge CARRIES THE DISCHARGE FORWARD (4a): the new head is born met;
 *  7. CLEARING a discharged chain is REFUSED (4b), and so is correcting it to a non-computable date;
 *  8. the SERVICE seat cannot discharge, and — one guard, both channels — cannot FILE an update either;
 *  9. a seat holding the verb on another endowment gets NOT_FOUND for this one (§10 §7.2);
 * 10. a `compliance:task:read`-only seat is refused the maker rung.
 *
 * SUBJECT: waqf-003 (blank registration anchor in the fixture; its expropriation is another file's
 * subject and untouched here). Everything this file writes on it is undone in `afterAll` by raw SQL —
 * the API itself refuses to clear a discharged chain, which is the point of test 7, so the restore
 * soft-deletes the rows first and clears the anchor columns after.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { createServiceSeatContext } from '../src/context.js';
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

const OFFICER = `${API_TEST_PREFIX}s11-discharge-officer`;
const READ_ONLY = `${API_TEST_PREFIX}s11-discharge-reader`;
const ELSEWHERE = `${API_TEST_PREFIX}s11-discharge-elsewhere`;
/** The seeded service seat — `compliance:task:write` on every endowment it sweeps, actorType SYSTEM. */
const SWEEP_SEAT = 'user-service-deadline-sweeper';

/** Blank registration anchor in the fixture — this file's record → discharge → correct subject. */
const SUBJECT = 'waqf-003';
/** Seeded DISCHARGED (MET on 2026-04-20; anchor 2026-04-05). Read-only here. */
const DISCHARGED_WAQF = 'waqf-002';
/** Seeded OPEN, overdue by construction — a seat granted only here is "elsewhere" for the subject. */
const OPEN_WAQF = 'waqf-001';
/** Recorded but NOT computable (2015 anchor, outside calendar coverage): no deadline row at all. */
const COVERAGE_WAQF = 'waqf-007';

const ANCHOR_A = '2026-04-05';
const ANCHOR_B = '2026-04-19';
const DISCHARGE_ON = '2026-05-03';
/** The request's stated clock for every call — never the wall clock. */
const NOW = new Date('2026-09-02T12:00:00.000Z');

function iso(day: string): string {
  return `${day}T00:00:00.000Z`;
}
function hijriOf(day: string): string {
  return String(toHijriSnapshot(new Date(iso(day))));
}
function dayOf(value: Date | string | null | undefined): string | null {
  return value === null || value === undefined ? null : new Date(value).toISOString().slice(0, 10);
}

async function officerCaller(requestId: string) {
  return createCaller(await contextFor({ userId: OFFICER, requestId, now: NOW }));
}

interface DeadlineRow {
  id: string;
  waqfId: string;
  anchorDate: Date;
  dueDate: Date;
  satisfiedAt: Date | null;
  satisfiedEvidenceId: string | null;
  dischargeKind: string | null;
  complianceTaskId: string | null;
  recomputedFromId: string | null;
  deletedAt: Date | null;
}

async function registerRows(waqfId: string, liveOnly = true): Promise<DeadlineRow[]> {
  const raw = await privilegedPrisma();
  return raw.$queryRawUnsafe<DeadlineRow[]>(
    `SELECT "id","waqfId","anchorDate","dueDate","satisfiedAt","satisfiedEvidenceId","dischargeKind",
            "complianceTaskId","recomputedFromId","deletedAt"
       FROM "deadline" WHERE "waqfId" = '${waqfId}' AND "ruleKey" = 'REGISTER_30BD'
       ${liveOnly ? 'AND "deletedAt" IS NULL' : ''} ORDER BY "createdAt" ASC`,
  );
}

/** The chain head: the live row no other live row supersedes. */
async function head(waqfId: string): Promise<DeadlineRow> {
  const rows = await registerRows(waqfId);
  const superseded = new Set(rows.map((r) => r.recomputedFromId).filter((x) => x !== null));
  const heads = rows.filter((r) => !superseded.has(r.id));
  expect(heads, `exactly one live head expected on ${waqfId}`).toHaveLength(1);
  const only = heads[0];
  if (only === undefined) throw new Error('unreachable');
  return only;
}

async function anchorTriple(waqfId: string): Promise<string> {
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
  return JSON.stringify(rows[0] ?? null);
}

async function restoreSubject(): Promise<void> {
  const raw = await privilegedPrisma();
  // Soft-delete FIRST (the lifecycle guards leave `deletedAt` movable), then clear the anchor — the
  // API refuses the second step on a discharged chain, which is exactly what test 7 proves.
  await raw.$executeRawUnsafe(
    `UPDATE "deadline" SET "deletedAt" = now()
       WHERE "waqfId" = '${SUBJECT}' AND "ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL`,
  );
  await raw.$executeRawUnsafe(
    `UPDATE "waqf" SET "registrationAnchorDate" = NULL, "registrationAnchorDateHijri" = NULL,
       "registrationAnchorKind" = NULL WHERE "id" = '${SUBJECT}'`,
  );
}

describe.runIf(hasDatabase)('S11-2 · the registration duty recorded as discharged', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [SUBJECT, DISCHARGED_WAQF, COVERAGE_WAQF],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'compliance:task:read',
          'compliance:task:write',
        ],
      },
      {
        id: READ_ONLY,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [SUBJECT],
        permissions: ['endowment:waqf:read', 'compliance:task:read'],
      },
      {
        id: ELSEWHERE,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [OPEN_WAQF],
        permissions: ['endowment:waqf:read', 'compliance:task:read', 'compliance:task:write'],
      },
    ]);
    // Self-healing: a previous process killed mid-file leaves a discharged chain on the subject.
    await restoreSubject();
  });

  afterAll(async () => {
    await restoreSubject();
    await cleanupApiTestRows();
  });

  /* ── 1 · the seeded discharged row, and the write-once refusal by name ─────────────────── */

  it('the seed carries waqf-002 DISCHARGED (MET on 2026-04-20) and a second discharge is refused BY NAME', async () => {
    const seeded = await head(DISCHARGED_WAQF);
    expect(dayOf(seeded.satisfiedAt)).toBe('2026-04-20');
    expect(seeded.dischargeKind).toBe('MET');

    const caller = await officerCaller('s112-already');
    await expect(
      caller.deadline.dischargeRegistrationDuty({
        waqfId: DISCHARGED_WAQF,
        dischargedOn: iso('2026-04-21'),
        triggerEvent: 'test — a second discharge',
      }),
    ).rejects.toThrow(/REGISTRATION_ALREADY_DISCHARGED|already recorded as discharged/i);
    // Nothing moved: same date, same kind.
    const after = await head(DISCHARGED_WAQF);
    expect(dayOf(after.satisfiedAt)).toBe('2026-04-20');
    expect(after.dischargeKind).toBe('MET');
  });

  /* ── 2 · record → discharge: the head is met, the anchor untouched, the event named ───────── */

  it('discharging a computed duty marks the head MET, leaves the anchor triple BYTE-IDENTICAL, reports the unbound task honestly, and records ONE named event with the lateness figure', async () => {
    const caller = await officerCaller('s112-record');
    const recorded = await caller.deadline.recordRegistrationAnchor({
      waqfId: SUBJECT,
      date: iso(ANCHOR_A),
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — clock-start recorded',
    });
    expect(recorded.computeRefusal).toBeNull();
    const before = await head(SUBJECT);
    expect(before.satisfiedAt).toBeNull();
    expect(before.dischargeKind).toBeNull();
    expect(before.complianceTaskId, 'the fixture instantiates no register — unbound').toBeNull();
    const tripleBefore = await anchorTriple(SUBJECT);
    const eventsBefore = await countAuditEvents({
      action: 'UPDATE',
      entityId: before.id,
    });

    const result = await (
      await officerCaller('s112-discharge')
    ).deadline.dischargeRegistrationDuty({
      waqfId: SUBJECT,
      dischargedOn: iso(DISCHARGE_ON),
      triggerEvent: 'test — registration completed with the Authority',
    });
    expect(result.deadlineId).toBe(before.id);
    expect(result.dischargedOn).toBe(DISCHARGE_ON);
    // The server DERIVES the twin (ADR-0007) — proven against the one implementation.
    expect(result.dischargedOnHijri).toBe(hijriOf(DISCHARGE_ON));
    expect(result.taskMirrored).toBe(false);
    expect(result.taskId).toBeNull();
    // Due (ANCHOR_A + 30 bd, mid-May) is AFTER the discharge date → negative lateness = early.
    expect(result.lateByBusinessDays).not.toBeNull();
    expect(Number(result.lateByBusinessDays)).toBeLessThan(0);
    expect(result.latenessUnavailableBecause).toBeNull();

    const after = await head(SUBJECT);
    expect(after.id).toBe(before.id);
    expect(dayOf(after.satisfiedAt)).toBe(DISCHARGE_ON);
    expect(after.dischargeKind).toBe('MET');
    expect(after.satisfiedEvidenceId).toBeNull();
    // CONDITION 1 — the anchor stays TRUE.
    expect(await anchorTriple(SUBJECT)).toBe(tripleBefore);

    // ONE named event on the Deadline: the extension records the row diff as its own UPDATE too, so
    // the count moves by two (S9-3c precedent: extension row event + the named event).
    const eventsAfter = await countAuditEvents({
      action: 'UPDATE',
      entityId: before.id,
    });
    expect(eventsAfter - eventsBefore).toBe(2);
    const raw = await privilegedPrisma();
    const named = await raw.$queryRawUnsafe<{ context: Record<string, unknown> }[]>(
      `SELECT "context" FROM "audit_event"
         WHERE "entityType" = 'Deadline' AND "entityId" = '${before.id}' AND "action" = 'UPDATE'
           AND "context"->>'dischargeKind' = 'MET'`,
    );
    expect(named).toHaveLength(1);
    const context = named[0]?.context ?? {};
    expect(context['dischargedOn']).toBe(DISCHARGE_ON);
    expect(context['dischargedOnHijri']).toBe(hijriOf(DISCHARGE_ON));
    expect(context['taskMirrored']).toBe(false);
    // MEASURED (chain #2), then CITED: the audit context is NUMBER-FREE BY DESIGN — `serializeForAudit`
    // (packages/database/src/hash-chain.ts, "numerics and dates become strings"; `JsonSafe` = "a value
    // tree containing no numbers") turns every numeric into its canonical string so float representation
    // never forks the hash, while booleans and strings pass through natively. So `taskMirrored` arrives as
    // a boolean beside `lateByBusinessDays` as a string, and that is correct. Any reader of a numeric out
    // of an audit context — item 2's "days late", say — must parse it DELIBERATELY (and the money lint
    // ban forbids a reflexive `Number(...)` on a money-shaped name). Assert the VALUE, not the type.
    expect(String(context['lateByBusinessDays'])).toBe(String(result.lateByBusinessDays));
    expect(String(context['lateByBusinessDays'])).toMatch(/^-\d+$/);
  });

  /* ── 3–5 · the refusals, each by name ────────────────────────────────────────────────── */

  it('a discharge dated BEFORE the clock-start is refused (input error, or the counsel case wearing a date)', async () => {
    // The subject is discharged from test 2; use a fresh chain on it? No — a discharged head refuses
    // by "already", which would mask this. Drive it on the seeded OPEN row's sibling instead: record
    // a second computable anchor on the subject is refused too (discharged chain carries forward).
    // So: the precedence refusal is driven BEFORE any discharge, on a fresh subject state.
    await restoreSubject();
    const caller = await officerCaller('s112-precedes');
    await caller.deadline.recordRegistrationAnchor({
      waqfId: SUBJECT,
      date: iso(ANCHOR_B),
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — clock-start for the precedence refusal',
    });
    await expect(
      caller.deadline.dischargeRegistrationDuty({
        waqfId: SUBJECT,
        dischargedOn: iso('2026-04-10'), // before ANCHOR_B
        triggerEvent: 'test — completed before the clock started',
      }),
    ).rejects.toThrow(/DISCHARGE_PRECEDES_CLOCK_START|before the recorded/i);
    expect((await head(SUBJECT)).satisfiedAt).toBeNull();
  });

  it('a discharge dated in the FUTURE of the stated clock is refused', async () => {
    const caller = await officerCaller('s112-future');
    await expect(
      caller.deadline.dischargeRegistrationDuty({
        waqfId: SUBJECT,
        dischargedOn: iso('2026-09-03'), // NOW is 2026-09-02
        triggerEvent: 'test — completed tomorrow',
      }),
    ).rejects.toThrow(/DISCHARGE_IN_FUTURE|after today/i);
    expect((await head(SUBJECT)).satisfiedAt).toBeNull();
  });

  it('an endowment with NO deadline row is refused by name — including the recorded-but-not-computable shape (the declared gap)', async () => {
    const caller = await officerCaller('s112-no-row');
    expect(await registerRows(COVERAGE_WAQF)).toHaveLength(0);
    await expect(
      caller.deadline.dischargeRegistrationDuty({
        waqfId: COVERAGE_WAQF,
        dischargedOn: iso('2026-05-03'),
        triggerEvent: 'test — nothing to discharge against',
      }),
    ).rejects.toThrow(/NO_REGISTRATION_DEADLINE_ON_RECORD|no REGISTER_30BD deadline on record/i);
  });

  /* ── 6–7 · the two anchor-path interactions (4a carry-forward · 4b clear refused) ────────── */

  it('4a — correcting the clock-start AFTER discharge supersedes the head with a row BORN MET (the discharge carries forward)', async () => {
    const caller = await officerCaller('s112-carry');
    // Discharge the open ANCHOR_B chain from test 3.
    await caller.deadline.dischargeRegistrationDuty({
      waqfId: SUBJECT,
      dischargedOn: iso(DISCHARGE_ON),
      triggerEvent: 'test — discharge before correction',
    });
    const met = await head(SUBJECT);
    expect(dayOf(met.satisfiedAt)).toBe(DISCHARGE_ON);

    const corrected = await caller.deadline.recordRegistrationAnchor({
      waqfId: SUBJECT,
      date: iso(ANCHOR_A), // an input error corrected: the clock started earlier
      kind: 'REGULATION_EFFECTIVE_DATE',
      triggerEvent: 'test — clock-start corrected after discharge',
    });
    expect(corrected.computeRefusal).toBeNull();
    expect(corrected.supersededDeadlineId).toBe(met.id);

    const newHead = await head(SUBJECT);
    expect(newHead.id).not.toBe(met.id);
    expect(newHead.recomputedFromId).toBe(met.id);
    expect(dayOf(newHead.anchorDate)).toBe(ANCHOR_A);
    // BORN MET — same date, same kind; the window moved, the fact did not.
    expect(dayOf(newHead.satisfiedAt)).toBe(DISCHARGE_ON);
    expect(newHead.dischargeKind).toBe('MET');
    // The predecessor keeps its own record, untouched.
    const all = await registerRows(SUBJECT);
    const predecessor = all.find((r) => r.id === met.id);
    expect(dayOf(predecessor?.satisfiedAt)).toBe(DISCHARGE_ON);
    // The event names the carry-forward.
    const raw = await privilegedPrisma();
    const created = await raw.$queryRawUnsafe<{ context: Record<string, unknown> }[]>(
      `SELECT "context" FROM "audit_event"
         WHERE "entityType" = 'Deadline' AND "entityId" = '${newHead.id}' AND "action" = 'CREATE'
           AND "context"->>'triggerEvent' = 'test — clock-start corrected after discharge'`,
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.context['dischargeCarriedForwardFrom']).toBe(met.id);
  });

  it('4b — CLEARING a discharged chain is refused by name, and so is moving it to a non-computable date; the met fact stays', async () => {
    const caller = await officerCaller('s112-clear');
    const before = await head(SUBJECT);
    expect(before.satisfiedAt).not.toBeNull();
    const tripleBefore = await anchorTriple(SUBJECT);

    await expect(
      caller.deadline.recordRegistrationAnchor({
        waqfId: SUBJECT,
        date: null,
        kind: null,
        triggerEvent: 'test — clearing a discharged chain',
      }),
    ).rejects.toThrow(/ANCHOR_CLEAR_REFUSED_DUTY_DISCHARGED|recorded as DISCHARGED/i);

    await expect(
      caller.deadline.recordRegistrationAnchor({
        waqfId: SUBJECT,
        date: iso('2015-08-13'), // outside calendar coverage: would withdraw the head
        kind: 'WAQF_DOCUMENTATION_DATE',
        triggerEvent: 'test — moving a discharged chain out of coverage',
      }),
    ).rejects.toThrow(/ANCHOR_CLEAR_REFUSED_DUTY_DISCHARGED|recorded as DISCHARGED/i);

    // Nothing moved: the transaction rolled the anchor write back with the refusal.
    expect(await anchorTriple(SUBJECT)).toBe(tripleBefore);
    const after = await head(SUBJECT);
    expect(after.id).toBe(before.id);
    expect(dayOf(after.satisfiedAt)).toBe(DISCHARGE_ON);
    expect(after.deletedAt).toBeNull();
  });

  /* ── 8 · one guard, both channels: the SERVICE seat can neither discharge nor file ──────── */

  it('the SERVICE seat (actorType SYSTEM, holds compliance:task:write) cannot discharge — and cannot FILE an update either', async () => {
    const seat = createCaller(
      await createServiceSeatContext(SWEEP_SEAT, { requestId: 's112-service', now: NOW }),
    );
    await expect(
      seat.deadline.dischargeRegistrationDuty({
        waqfId: OPEN_WAQF,
        dischargedOn: iso('2026-05-03'),
        triggerEvent: 'test — a machine asserting a duty met',
      }),
    ).rejects.toThrow(/DISCHARGE_REQUIRES_HUMAN_ACTOR|human assertion/i);
    // The seeded open row on waqf-001 is untouched.
    const open = await head(OPEN_WAQF);
    expect(open.satisfiedAt).toBeNull();

    // The sibling channel. The guard fires BEFORE the "no open obligation" read, so the refusal is
    // the human-actor one whatever the endowment's state — deterministic on any fixture.
    await expect(
      seat.deadline.fileUpdateObligation({
        waqfId: OPEN_WAQF,
        filedAt: iso('2026-05-03'),
        filedAtHijri: hijriOf('2026-05-03'),
        triggerEvent: 'test — a machine filing an update',
      }),
    ).rejects.toThrow(/DISCHARGE_REQUIRES_HUMAN_ACTOR|human assertion/i);
  });

  /* ── 9–10 · scope and rung ─────────────────────────────────────────────────────────────── */

  it('a seat holding the verb ELSEWHERE reads NOT_FOUND for this endowment — never FORBIDDEN (§10 §7.2)', async () => {
    const elsewhere = createCaller(
      await contextFor({ userId: ELSEWHERE, requestId: 's112-elsewhere', now: NOW }),
    );
    let code: string | null = null;
    try {
      await elsewhere.deadline.dischargeRegistrationDuty({
        waqfId: SUBJECT,
        dischargedOn: iso('2026-05-03'),
        triggerEvent: 'test — cross-endowment discharge',
      });
    } catch (error) {
      code = (error as { code?: string }).code ?? null;
    }
    expect(code).toBe('NOT_FOUND');
    expect(code).not.toBe('FORBIDDEN');
  });

  it('a compliance:task:READ-only seat is refused the maker rung', async () => {
    const reader = createCaller(
      await contextFor({ userId: READ_ONLY, requestId: 's112-reader', now: NOW }),
    );
    await expect(
      reader.deadline.dischargeRegistrationDuty({
        waqfId: SUBJECT,
        dischargedOn: iso('2026-05-03'),
        triggerEvent: 'test — a reader discharging',
      }),
    ).rejects.toThrow();
    // And the read it DOES hold now carries the kind on the wire, with the met date's derived twin.
    const listed = await reader.deadline.list({ waqfId: SUBJECT });
    const wireHead = listed.deadlines.find((row) => row.satisfiedAt !== null);
    expect(wireHead?.dischargeKind).toBe('MET');
    expect(wireHead?.satisfiedAtHijri).toBe(hijriOf(DISCHARGE_ON));
  });
});
