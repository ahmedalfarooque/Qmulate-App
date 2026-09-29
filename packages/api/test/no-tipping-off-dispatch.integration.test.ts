/**
 * G-6 CLAUSE 2 — THE MEASURED DISCHARGE. §09's no-tipping-off rule 1, against a dispatcher that
 * could have emitted.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS BOUNDED, AND WHAT THIS FILE CHANGES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * G-6 is *"a SAR is visible only to the compartment; no notification reaches the subject."* Clause 1
 * (visibility) has been enforced and measured since E7. Clause 2 (no notification) was claimed
 * **BOUNDED as fail-closed-by-construction** — the owner's ruling of 2026-08-25 (memo fourth batch,
 * "G-6 claim standard", verbatim selection *"(b) Bounded claim (Recommended)"*), with the bound
 * stated in terms: *"until E8's real pipeline forces the measurement. No throwaway channel is built
 * to test it."*
 *
 * **The pipeline now exists.** `deadline.evaluate` (S9-3d) writes `Notification` rows and
 * `EscalationEvent` rows, and it is the first path in this repository to write either. So the
 * measurement the owner's ruling deferred is available on its own terms — not through a throwaway
 * channel, but through the real one.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THERE IS A POSITIVE CONTROL, AND WHY IT IS THE LOAD-BEARING HALF
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * "No notification was emitted about the SAR" is satisfied by a broken evaluator, an empty database,
 * a mis-typed endowment id, a `beforeAll` that silently failed, and by the rule working. Those five
 * are indistinguishable from a bare negative — which is `no-tipping-off.test.ts`'s founding lesson
 * (*"an unasked question wearing a tick"*) and R6-C1's (*"a property whose generator cannot reach a
 * configuration reports its silence as success, at scale"*).
 *
 * So every negative here is measured **in the same run, through the same procedure, against the same
 * dispatcher**, beside a NON-AML deadline on the SAME endowment that DOES produce rows. The claim is
 * not "nothing happened"; it is **"this happened and that did not, and one call did both."**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * AND THE EGRESS IS THE ROW ITSELF
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * There is no mail, SMS or push transport in this repository (a census asserts that too). The
 * `Notification` table is an in-app inbox, and the scoping extension narrows it by `userId` — so a
 * row addressed to a user **is** an egress to that user, and the gate has to be on ROW CREATION
 * rather than on some later send. Every assertion below therefore counts ROWS, read privileged and
 * below every extension, because a compartment-filtered read would find nothing whether or not
 * anything was written.
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
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const OFFICER = `${API_TEST_PREFIX}g6-officer`;
const CASE_MANAGER = `${API_TEST_PREFIX}g6-case-manager`;
const LEADERSHIP = `${API_TEST_PREFIX}g6-leadership`;
/**
 * ⚠ AN AML COMPARTMENT MEMBER RUNNING THE SWEEP — the case that decides whether `mayDispatch` is
 * load-bearing or decorative. See the third test.
 */
const AML_MEMBER = `${API_TEST_PREFIX}g6-compliance-in-compartment`;
const WAQF = 'waqf-002';

/** Both deadlines are dated so that `asOf` puts them OVERDUE — the state that escalates. */
const DUE = '2026-05-20';
const AS_OF = '2026-06-30';
/**
 * Three business days after `AS_OF` (Tue 2026-06-30 → Wed/Thu/Sun → 2026-07-05), so the configured
 * `3`-business-day pre-alert offset fires EXACTLY on `AS_OF` and the NOTIFICATION channel is
 * exercised rather than the escalation one.
 */
const REMINDER_DUE = '2026-07-05';

/** The AML duty's own deadline, and an ordinary one beside it. Ids are stable within a run. */
const RUN = `${String(process.pid)}${Math.trunc(Date.now() / 1000).toString(36)}`;
const AML_TASK = `test-g6-amltask-${RUN}`;
const AML_DEADLINE = `test-g6-amldl-${RUN}`;
const ORDINARY_TASK = `test-g6-task-${RUN}`;
const ORDINARY_DEADLINE = `test-g6-dl-${RUN}`;
/**
 * A SECOND pair, positioned so a PRE-ALERT REMINDER fires rather than an escalation — the
 * NOTIFICATION channel, which the overdue pair above never exercises.
 */
const AML_SOON = `test-g6-amlsoon-${RUN}`;
const ORD_SOON = `test-g6-ordsoon-${RUN}`;
/**
 * A task whose OWN `confidentiality` is NORMAL while its OBLIGATION is AML_RESTRICTED — the
 * disagreement `readDispatchSubject`'s stricter-of-two rule exists for.
 */
const DISAGREE_TASK = `test-g6-disagree-${RUN}`;
const DISAGREE_DEADLINE = `test-g6-disagreedl-${RUN}`;
/** A deadline bound to NO task at all — no subject row to classify. */
const UNBOUND_DEADLINE = `test-g6-unbound-${RUN}`;

function hijriOf(day: string): string {
  return String(toHijriSnapshot(new Date(`${day}T00:00:00.000Z`)));
}

/** The §09 window-as-applied shape migration 38's provenance trigger demands on every insert. */
const SNAPSHOT = {
  settingKey: 'deadline.ISTIBDAL_10BD.businessDays',
  basis: 'business_days',
  businessDays: 10,
  calendarMonths: null,
  calendarDays: null,
  monthAnchor: null,
  roll: 'following',
  unverified: true,
  leadSettingKey: null,
  preExpiryLeadBd: null,
};

async function plantTaskAndDeadline(args: {
  taskId: string;
  deadlineId: string;
  obligationCode: string;
  /** Override the task's OWN confidentiality, to create a disagreement with its template. */
  ownConfidentiality?: string;
  /** Override the due date (the default puts the row OVERDUE at `asOf`). */
  due?: string;
}): Promise<void> {
  const raw = await privilegedPrisma();
  const obligation = await raw.$queryRawUnsafe<{ id: string; libraryVersion: string }[]>(
    `SELECT "id","libraryVersion" FROM "compliance_obligation"
       WHERE "code" = '${args.obligationCode}' AND "deletedAt" IS NULL LIMIT 1`,
  );
  const row = obligation[0];
  expect(row, `the canonical ${args.obligationCode} obligation must be seeded`).toBeDefined();

  // The task INHERITS the template's confidentiality — which for GOV-AML-02 is AML_RESTRICTED
  // (S8-Q1, owner ruling 2026-08-23: "compartment the row"). That inheritance is the whole subject
  // of this test: it is what `readDispatchSubject` reads and hands to `mayDispatch`.
  await raw.$executeRawUnsafe(
    `INSERT INTO "compliance_task"
       ("id","waqfId","obligationId","templateCode","templateVersion","status","updatedAt",
        "confidentiality","classificationAtInstantiation","instantiatedReason")
     SELECT '${args.taskId}', '${WAQF}', o."id", o."code", o."libraryVersion",
            'NOT_STARTED'::"ComplianceTaskStatus", now(),
            ${args.ownConfidentiality === undefined ? 'o."confidentiality"' : `'${args.ownConfidentiality}'::"Confidentiality"`},
            'SMALL'::"WaqfClassification", 'EVENT_TRIGGER'::"TaskInstantiationReason"
       FROM "compliance_obligation" o WHERE o."id" = '${String(row?.id)}'
     ON CONFLICT ("id") DO NOTHING`,
  );

  // ⚠ `ISTIBDAL_10BD`, not `UPDATE_15BD`: the update rule is ZERO-TOLERANCE, and migration 41
  // refuses a waiver on those — irrelevant here — but more importantly a second open GOV-REG-02 on
  // one endowment is refused by migration 40's partial index, which would make this planting
  // order-dependent against the trigger suite. A non-zero-tolerance clock keeps this file
  // independent of both.
  await raw.$executeRawUnsafe(
    `INSERT INTO "deadline"
       ("id","waqfId","complianceTaskId","ruleKey","anchorDate","anchorDateHijri",
        "dueDate","dueDateHijri","windowSnapshot","updatedAt","createdBy")
     VALUES ('${args.deadlineId}', '${WAQF}', '${args.taskId}', 'ISTIBDAL_10BD',
             '2026-05-06T00:00:00.000Z', '${hijriOf('2026-05-06')}',
             '${args.due ?? DUE}T00:00:00.000Z', '${hijriOf(args.due ?? DUE)}',
             '${JSON.stringify(SNAPSHOT)}'::jsonb, now(), '${OFFICER}')
     ON CONFLICT ("id") DO NOTHING`,
  );
}

async function countRows(sql: string): Promise<number> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<{ n: bigint }[]>(sql);
  return Number(rows[0]?.n ?? 0);
}

async function purge(): Promise<void> {
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    [
      'DO $qm_g6_purge$',
      'BEGIN',
      '  ALTER TABLE "compliance_task" DISABLE TRIGGER compliance_task_no_delete;',
      '  ALTER TABLE "deadline" DISABLE TRIGGER deadline_no_delete;',
      '  ALTER TABLE "escalation_event" DISABLE TRIGGER escalation_event_no_delete;',
      `  DELETE FROM "notification" WHERE "waqfId" = '${WAQF}' AND "kind" LIKE 'deadline.%';`,
      `  DELETE FROM "escalation_event" WHERE "waqfId" = '${WAQF}';`,
      `  DELETE FROM "deadline" WHERE "id" LIKE 'test-g6-%';`,
      `  DELETE FROM "compliance_task" WHERE "id" LIKE 'test-g6-%';`,
      '  ALTER TABLE "escalation_event" ENABLE ALWAYS TRIGGER escalation_event_no_delete;',
      '  ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_no_delete;',
      '  ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_no_delete;',
      'END',
      '$qm_g6_purge$;',
    ].join('\n'),
  );
}

describe.runIf(hasDatabase)(
  'G-6 clause 2 · the measured non-dispatch, with its positive control',
  () => {
    beforeAll(async () => {
      await assertSeeded();
      await provisionTestSubjects([
        {
          id: OFFICER,
          role: 'COMPLIANCE_OFFICER',
          waqfIds: [WAQF],
          permissions: ['endowment:waqf:read', 'compliance:task:read', 'compliance:task:write'],
        },
        // ⚠ A REAL RECIPIENT MUST EXIST, or every negative below is vacuous for the wrong reason.
        // The evaluator sends reminders to the CASE_MANAGER and NAZIR grant holders on the endowment;
        // with no such grant, nothing is emitted about ANYTHING and the positive control would be as
        // silent as the subject. This seat is what makes the control a control.
        {
          id: CASE_MANAGER,
          role: 'CASE_MANAGER',
          waqfIds: [WAQF],
          permissions: ['endowment:waqf:read', 'compliance:task:read'],
        },
        // ⚠ AND A LEADERSHIP SEAT, because the RUNG THAT ENGAGES decides who is written to — and this
        // test's first run found that out the hard way. At `asOf` the control deadline is ~29 business
        // days overdue, which is past the ordinary ladder's leadership threshold (10), so the rung is
        // LEADERSHIP and `waqf-002` held no such grant: the evaluator wrote the escalation_event,
        // found nobody, reported `escalatedToNobody`, and emitted no notification. That is the
        // behaviour I want (an unread escalation must not look like a sent one) — but it made the
        // POSITIVE CONTROL silent, which would have left the AML negative measured against a
        // dispatcher that dispatches to nobody. The seat is what makes the control able to fail.
        {
          id: LEADERSHIP,
          role: 'LEADERSHIP',
          waqfIds: [WAQF],
          permissions: ['endowment:waqf:read', 'compliance:task:read'],
        },
        // ⚠ A COMPLIANCE_OFFICER **IN THE COMPARTMENT**, not an AML_OFFICER — and the difference is a
        // MEASURED FINDING, recorded because it is a third latch nobody wrote down.
        //
        // The first attempt made this seat an `AML_OFFICER` with `compliance:task:write`, and the
        // ladder refused it before any of this test ran: *"role AML_OFFICER holds an active grant on
        // waqf waqf-002 but not compliance:task:write. The resolved permission set is
        // grant.permissions ∩ preset(role) — a grant may narrow its role preset, never widen it (§10
        // principle 3)."* So **the AML_OFFICER seat cannot run the evaluator at all** — a third,
        // independent reason §09 rule 1 holds on that path, and one that costs nothing because it
        // falls out of the preset intersection.
        //
        // The REACHABLE dangerous shape is this one: a seat that legitimately writes compliance tasks
        // AND has been added to the compartment ("the compliance officer needs to see AML matters" is
        // not a strange sentence). Compartment membership is a GRANT FLAG, not a role — §10 §6: the
        // default is EMPTY, including for the Nazir — so this combination is representable, and it is
        // the one where `mayDispatch` is genuinely the last thing standing.
        {
          id: AML_MEMBER,
          role: 'COMPLIANCE_OFFICER',
          waqfIds: [WAQF],
          permissions: ['endowment:waqf:read', 'compliance:task:read', 'compliance:task:write'],
          amlCompartment: true,
        },
      ]);
      await purge();
      // GOV-AML-02 is the ONE compartmented template in the library (S8-Q1). GOV-REG-01 is an
      // ordinary registration duty on the same endowment — the control.
      await plantTaskAndDeadline({
        taskId: AML_TASK,
        deadlineId: AML_DEADLINE,
        obligationCode: 'GOV-AML-02',
      });
      await plantTaskAndDeadline({
        taskId: ORDINARY_TASK,
        deadlineId: ORDINARY_DEADLINE,
        obligationCode: 'GOV-REG-01',
      });

      // ── THE THREE SHAPES THE FIRST DRAFT DID NOT REACH, each found by a SURVIVING MUTATION ────
      // W10 survived (the NOTIFICATION gate removed and nothing went red) because every deadline
      // above is OVERDUE at `asOf`, so no pre-alert ever fires and the reminder channel was never
      // exercised. `REMINDER_DUE` is three business days after `asOf`, which is one of the configured
      // offsets — so both of these emit through the NOTIFICATION channel rather than ESCALATION.
      await plantTaskAndDeadline({
        taskId: `${AML_SOON}-task`,
        deadlineId: AML_SOON,
        obligationCode: 'GOV-AML-02',
        due: REMINDER_DUE,
      });
      await plantTaskAndDeadline({
        taskId: `${ORD_SOON}-task`,
        deadlineId: ORD_SOON,
        obligationCode: 'GOV-REG-01',
        due: REMINDER_DUE,
      });

      // W8 survived (the stricter-of-two rule dropped) because the AML task's OWN confidentiality is
      // already AML_RESTRICTED, so the template arm was never needed. This row makes them DISAGREE:
      // the task says NORMAL, its obligation says AML_RESTRICTED. "They should agree" is not a
      // control, and this is the row that proves the stricter one wins.
      await plantTaskAndDeadline({
        taskId: DISAGREE_TASK,
        deadlineId: DISAGREE_DEADLINE,
        obligationCode: 'GOV-AML-02',
        ownConfidentiality: 'NORMAL',
      });

      // W7 survived (an unbound deadline classified NORMAL) because every deadline above is BOUND.
      // A deadline with no task has no subject row to classify at all.
      const raw2 = await privilegedPrisma();
      await raw2.$executeRawUnsafe(
        `INSERT INTO "deadline"
         ("id","waqfId","complianceTaskId","ruleKey","anchorDate","anchorDateHijri",
          "dueDate","dueDateHijri","windowSnapshot","updatedAt","createdBy")
       VALUES ('${UNBOUND_DEADLINE}', '${WAQF}', NULL, 'ISTIBDAL_10BD',
               '2026-05-06T00:00:00.000Z', '${hijriOf('2026-05-06')}',
               '${REMINDER_DUE}T00:00:00.000Z', '${hijriOf(REMINDER_DUE)}',
               '${JSON.stringify(SNAPSHOT)}'::jsonb, now(), '${OFFICER}')
       ON CONFLICT ("id") DO NOTHING`,
      );
    });

    afterAll(async () => {
      await purge();
      await cleanupApiTestRows();
    });

    it('the premise holds: the AML task IS compartmented and the control is NOT', async () => {
      // Measured before anything is claimed. If GOV-AML-02 ever stopped being AML_RESTRICTED, every
      // assertion below would pass while proving nothing — this is the assertion that notices.
      const restricted = await countRows(
        `SELECT count(*) AS n FROM "compliance_task"
         WHERE "id" = '${AML_TASK}' AND "confidentiality" = 'AML_RESTRICTED'`,
      );
      expect(restricted, 'GOV-AML-02 must be AML_RESTRICTED (S8-Q1)').toBe(1);
      const ordinary = await countRows(
        `SELECT count(*) AS n FROM "compliance_task"
         WHERE "id" = '${ORDINARY_TASK}' AND "confidentiality" = 'NORMAL'`,
      );
      expect(ordinary, 'the control duty must NOT be compartmented').toBe(1);
    });

    it('ONE evaluator call: the ordinary duty EMITS, the AML duty emits NOTHING', async () => {
      const caller = createCaller(await contextFor({ userId: OFFICER, requestId: 'g6-discharge' }));

      const result = await caller.deadline.evaluate({
        waqfId: WAQF,
        asOf: `${AS_OF}T00:00:00.000Z`,
        asOfHijri: hijriOf(AS_OF),
        triggerEvent: 'G-6 clause 2 discharge — the measured non-dispatch',
      });

      /* ── THE POSITIVE CONTROL: the dispatcher DID emit, in this run ────────────────────────── */
      // Both deadlines are overdue at `asOf`, both are bound to a task, both went through the same
      // `mayDispatch` call in the same loop. If this is zero, the negative below means nothing.
      expect(
        result.escalations,
        'POSITIVE CONTROL FAILED: the evaluator emitted no escalation at all, so the AML negative ' +
          'below is vacuous — it would be satisfied by a broken evaluator just as well as by the rule',
      ).toBeGreaterThan(0);

      const controlEscalations = await countRows(
        `SELECT count(*) AS n FROM "escalation_event"
         WHERE "deadlineId" = '${ORDINARY_DEADLINE}' AND "deletedAt" IS NULL`,
      );
      expect(controlEscalations, 'the ordinary duty must have escalated').toBeGreaterThan(0);

      const controlNotices = await countRows(
        `SELECT count(*) AS n FROM "notification"
         WHERE "waqfId" = '${WAQF}' AND "kind" = 'deadline.escalation'
           AND "payload"->>'deadlineId' = '${ORDINARY_DEADLINE}'`,
      );
      expect(
        controlNotices,
        'the ordinary duty must have produced at least one in-app notification row — the row IS the ' +
          'egress, and without one the negative is measured against a dispatcher that never dispatches',
      ).toBeGreaterThan(0);

      // …and the recipients were genuinely resolved rather than the rung silently reaching nobody.
      // `escalatedToNobody` is the evaluator's own report of that case; it must be EMPTY here, which
      // is what upgrades "a row exists" to "somebody was actually addressed".
      expect(
        result.escalatedToNobody.filter((entry) => entry.deadlineId === ORDINARY_DEADLINE),
        'the control escalated to a rung nobody holds, so the notification count above cannot ' +
          'distinguish a working dispatcher from an unmanned seat',
      ).toStrictEqual([]);
      expect(result.escalationNotices).toBeGreaterThan(0);

      /* ── THE NEGATIVE: nothing about the SAR-adjacent duty left the compartment ────────────── */
      const amlEscalations = await countRows(
        `SELECT count(*) AS n FROM "escalation_event" WHERE "deadlineId" = '${AML_DEADLINE}'`,
      );
      expect(
        amlEscalations,
        '§09 rule 1 BREACHED: an escalation_event was written for the AML duty. That row names the ' +
          'deadline and its lateness, and escalation_event is scoped by ENDOWMENT rather than by ' +
          'compartment — so every non-member seat on this endowment could read it',
      ).toBe(0);

      const amlNotices = await countRows(
        `SELECT count(*) AS n FROM "notification"
         WHERE "payload"->>'deadlineId' = '${AML_DEADLINE}'`,
      );
      expect(
        amlNotices,
        '§09 rule 1 BREACHED: a notification row referencing the AML duty exists. The scoping ' +
          'extension narrows Notification by userId, so an in-app row addressed to a user IS an ' +
          'egress to that user',
      ).toBe(0);

      /* ── AND THE REFUSAL IS ON THE RECORD, not merely absent ──────────────────────────────── */
      // §09 rule 3: the AML action is LOGGED (carrying RESTRICTED) rather than suppressed. A silent
      // skip and a recorded refusal look identical in the database and completely different in an
      // audit — so the run REPORTS what it declined to send.
      const refusedForAml = result.dispatchRefused.filter(
        (entry) => entry.deadlineId === AML_DEADLINE,
      );
      expect(
        refusedForAml.length,
        'the evaluator must REPORT the refusal, not just fail to emit: a silent skip is ' +
          'indistinguishable from a code path that was never reached',
      ).toBeGreaterThan(0);
      expect(refusedForAml.map((entry) => entry.channel)).toContain('ESCALATION');

      // ⚠ MEASURED, AND NOT WHAT THIS TEST FIRST ASSERTED. The discriminator here is
      // `UNRECOGNISED_CONFIDENTIALITY`, not `AML_RESTRICTED_PAYLOAD` — because the evaluator is
      // running as a NON-MEMBER, so `amlClause` had already subtracted the AML task from its own
      // read of the subject row, and `readDispatchSubject` returned "<unreadable subject row>" for a
      // classification it could not see. `mayDispatch` then fails closed on the unknown.
      //
      // That is TWO INDEPENDENT LATCHES, and it is worth being precise about which one fired: the
      // compartment's read subtraction hid the subject, and the dispatch gate refused what it could
      // not classify. Neither was relied upon alone. But it also means the `AML_RESTRICTED_PAYLOAD`
      // branch is NOT exercised on this path — so the next test exercises it, because a gate that is
      // only ever reached after another control already worked is a gate nobody has tested.
      expect(refusedForAml.map((entry) => entry.refusal)).toContain('UNRECOGNISED_CONFIDENTIALITY');
    });

    it('⚠ THE DANGEROUS CASE: an AML COMPARTMENT MEMBER runs the sweep, and mayDispatch is the ONLY thing left', async () => {
      // WHY THIS IS THE TEST THAT MATTERS. In the run above, the compartment's read filter hid the
      // subject before the gate was consulted — so §09 rule 1 held, but the gate was not what held it.
      // A member's sweep removes that first latch entirely: the task IS visible, its
      // `AML_RESTRICTED` classification IS readable, and the only thing between an overdue SAR duty
      // and an escalation to Leadership is `mayDispatch`.
      //
      // This is not a hypothetical seat. "The compliance sweep must see everything" is exactly the
      // sentence that would make the evaluator a member, and it is the sentence
      // `ABSENT_OUTBOUND_PATHS` predicted: *"an overdue GOV-AML-02 obligation escalating to
      // Leadership is a tip-off delivered by a cron job."*
      const member = createCaller(
        await contextFor({ userId: AML_MEMBER, requestId: 'g6-discharge-member' }),
      );

      const beforeEvents = await countRows(
        `SELECT count(*) AS n FROM "escalation_event" WHERE "deadlineId" = '${AML_DEADLINE}'`,
      );
      const beforeNotices = await countRows(
        `SELECT count(*) AS n FROM "notification" WHERE "payload"->>'deadlineId' = '${AML_DEADLINE}'`,
      );

      const result = await member.deadline.evaluate({
        waqfId: WAQF,
        asOf: '2026-07-02T00:00:00.000Z',
        asOfHijri: hijriOf('2026-07-02'),
        triggerEvent: 'G-6 clause 2 — a compartment member sweeps; the gate is the only latch',
      });

      // The POSITIVE CONTROL again, in this run, through this caller: the member's sweep DID emit for
      // the ordinary duty. Without it, "the AML duty stayed silent" would be satisfied by a member
      // whose sweep did nothing at all.
      expect(
        result.escalations,
        "POSITIVE CONTROL FAILED for the member's sweep — the negative below would be vacuous",
      ).toBeGreaterThan(0);

      // THE REFUSAL IS NOW THE AML ONE, which is the proof that the gate itself read the
      // classification and refused on it rather than on an absence.
      const refused = result.dispatchRefused.filter((entry) => entry.deadlineId === AML_DEADLINE);
      expect(
        refused.map((entry) => entry.refusal),
        'a compartment member CAN see the AML_RESTRICTED classification, so the gate must refuse on ' +
          'the classification itself — if this reads UNRECOGNISED_CONFIDENTIALITY the member still ' +
          'cannot see the row and this test is not exercising what it claims',
      ).toContain('AML_RESTRICTED_PAYLOAD');

      // AND STILL NOTHING WAS WRITTEN.
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "escalation_event" WHERE "deadlineId" = '${AML_DEADLINE}'`,
        ),
        '§09 rule 1 BREACHED BY A COMPARTMENT MEMBER: the escalation record is scoped by ENDOWMENT, ' +
          'not by compartment, so a row written here is readable by every non-member seat on this ' +
          'endowment — the compartment emitting into the general plane, which is the exact thing ' +
          'rule 1 forbids',
      ).toBe(beforeEvents);
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "notification" WHERE "payload"->>'deadlineId' = '${AML_DEADLINE}'`,
        ),
        '§09 rule 1 BREACHED BY A COMPARTMENT MEMBER: a notification row referencing the AML duty ' +
          'exists, and an in-app row addressed to a user IS an egress to that user',
      ).toBe(beforeNotices);
    });

    it('the REMINDER channel is gated too — the AML duty gets no pre-alert, the control does', async () => {
      // ⚠ THIS TEST EXISTS BECAUSE A MUTATION SURVIVED. Removing the NOTIFICATION channel's
      // `mayDispatch` check left the whole suite green, because every deadline in the original draft
      // was already overdue and no pre-alert could fire. A gate that is never exercised is a gate
      // nobody has tested — and the reminder channel is the one with the most rows behind it.
      const caller = createCaller(
        await contextFor({ userId: OFFICER, requestId: 'g6-reminder-channel' }),
      );
      const result = await caller.deadline.evaluate({
        waqfId: WAQF,
        asOf: `${AS_OF}T00:00:00.000Z`,
        asOfHijri: hijriOf(AS_OF),
        triggerEvent: 'G-6 clause 2 — the NOTIFICATION channel, exercised',
      });

      // POSITIVE CONTROL: a reminder for the ordinary duty EXISTS for this exact day — fired by
      // this call, or already on record from an earlier evaluate in this suite.
      //
      // ⊕ S10/T2 — THE SAME SURGERY THE ESCALATION CONTROL BELOW ALREADY HAD, for the same
      // reason, one migration later: this used to assert `result.reminders > 0` on every call,
      // and it PASSED only because the reminder dedupe was BLIND — `Notification` reads are
      // user-scoped, the evaluating officer is never the recipient, so each repeat evaluate
      // silently DOUBLE-SENT and this control counted the duplicates as fresh fires. Migration
      // 45's floor turned that into a loud 23505, the evaluator's check now reads raw (see
      // deadline.ts's reminder block), and a repeat evaluate honestly reports
      // `remindersAlreadySent`. The control's question was always "did the ordinary duty get a
      // pre-alert while the AML duty got none" — fired-now and already-on-record both answer it.
      expect(
        result.reminders + result.remindersAlreadySent,
        'POSITIVE CONTROL FAILED: no reminder fired OR was already on record, so the AML reminder ' +
          'negative is vacuous — check that REMINDER_DUE is still exactly one configured ' +
          'pre-alert offset from AS_OF',
      ).toBeGreaterThan(0);
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "notification"
           WHERE "kind" = 'deadline.reminder' AND "payload"->>'deadlineId' = '${ORD_SOON}'`,
        ),
      ).toBeGreaterThan(0);

      // THE NEGATIVE, on the reminder channel this time.
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "notification" WHERE "payload"->>'deadlineId' = '${AML_SOON}'`,
        ),
        '§09 rule 1 BREACHED on the REMINDER channel: a pre-alert about the AML duty reached an inbox',
      ).toBe(0);
      expect(
        result.dispatchRefused
          .filter((entry) => entry.deadlineId === AML_SOON)
          .map((e) => e.channel),
      ).toContain('NOTIFICATION');
    });

    it('a task whose OWN class DISAGREES with its template is treated as the STRICTER of the two', async () => {
      // ⚠ ALSO WRITTEN BECAUSE A MUTATION SURVIVED. Dropping the template arm of the stricter-of-two
      // rule changed nothing, because the AML task's own confidentiality already said
      // AML_RESTRICTED. This row is the disagreement: task NORMAL, obligation AML_RESTRICTED. The
      // instantiation path copies one to the other, so they *should* agree — and "should agree" is
      // exactly the kind of assumption this repository has been bitten by, so the safe reading wins.
      const caller = createCaller(await contextFor({ userId: OFFICER, requestId: 'g6-disagree' }));
      const result = await caller.deadline.evaluate({
        waqfId: WAQF,
        asOf: `${AS_OF}T00:00:00.000Z`,
        asOfHijri: hijriOf(AS_OF),
        triggerEvent: 'G-6 clause 2 — a task whose class disagrees with its template',
      });
      // ⚠ THE POSITIVE CONTROL HERE IS ON THE REFUSAL AXIS, NOT THE EMISSION AXIS — deliberately.
      // Asserting `result.escalations > 0` failed once the evaluator became idempotent: by this
      // point the ordinary duty's escalation for `asOf` is already on record, so this call reports
      // `escalationsAlreadyRecorded` and emits nothing new. That is the idempotence working, not a
      // broken dispatcher. So the control asserts the DISCRIMINATION this test is about: the run
      // refused the disagreeing duty and did NOT refuse the ordinary one.
      expect(result.evaluated, 'the run must have evaluated something').toBeGreaterThan(0);
      const refusedIds = result.dispatchRefused.map((entry) => entry.deadlineId);
      expect(
        refusedIds,
        'POSITIVE CONTROL FAILED: this run refused the ordinary duty too, so "the disagreeing duty ' +
          'was refused" says nothing about the classification and everything about a broken gate',
      ).not.toContain(ORDINARY_DEADLINE);
      expect(refusedIds).toContain(DISAGREE_DEADLINE);
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "notification"
           WHERE "payload"->>'deadlineId' = '${DISAGREE_DEADLINE}'`,
        ),
        'the task said NORMAL and its obligation said AML_RESTRICTED — the STRICTER must win, or a ' +
          'single mis-copied column silently re-opens the whole compartment to the notification plane',
      ).toBe(0);
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "escalation_event" WHERE "deadlineId" = '${DISAGREE_DEADLINE}'`,
        ),
      ).toBe(0);
    });

    it('an UNBOUND deadline is UNCLASSIFIABLE, not ordinary — nothing goes out about it', async () => {
      // ⚠ THE THIRD SURVIVING MUTATION. Returning `'NORMAL'` for a deadline with no subject row left
      // the suite green because every other row was bound. The fail-closed choice is deliberate and
      // is the single most dangerous line in the writer if it goes the other way: a signal about a
      // duty nobody can classify must not go out because the classification lookup came back empty.
      const caller = createCaller(await contextFor({ userId: OFFICER, requestId: 'g6-unbound' }));
      const result = await caller.deadline.evaluate({
        waqfId: WAQF,
        asOf: `${AS_OF}T00:00:00.000Z`,
        asOfHijri: hijriOf(AS_OF),
        triggerEvent: 'G-6 clause 2 — an unbound deadline has no subject to classify',
      });
      // ⊕ S10/T2 — same surgery as the reminder-channel control above (and the escalation one
      // before it): fired-now OR already-on-record both prove the ordinary duty got its
      // pre-alert; `reminders` alone was only ever >0 on repeat calls because the blind dedupe
      // double-sent (see deadline.ts's reminder block for the measured story).
      expect(result.reminders + result.remindersAlreadySent, 'positive control').toBeGreaterThan(0);
      expect(
        await countRows(
          `SELECT count(*) AS n FROM "notification"
           WHERE "payload"->>'deadlineId' = '${UNBOUND_DEADLINE}'`,
        ),
        'a deadline with no subject row was classified well enough to notify about — which means the ' +
          'classification lookup failing OPEN rather than closed',
      ).toBe(0);
      expect(
        result.dispatchRefused.filter((entry) => entry.deadlineId === UNBOUND_DEADLINE).length,
        'and the refusal must be REPORTED, so an unbound deadline is visible as a problem rather ' +
          'than merely silent',
      ).toBeGreaterThan(0);
    });

    it('a SECOND evaluator run changes neither answer — the rule is not a first-run accident', async () => {
      const caller = createCaller(
        await contextFor({ userId: OFFICER, requestId: 'g6-discharge-2' }),
      );
      const before = await countRows(
        `SELECT count(*) AS n FROM "notification" WHERE "payload"->>'deadlineId' = '${AML_DEADLINE}'`,
      );
      await caller.deadline.evaluate({
        waqfId: WAQF,
        // A DIFFERENT day, so the derivation genuinely re-runs rather than being short-circuited.
        asOf: '2026-07-01T00:00:00.000Z',
        asOfHijri: hijriOf('2026-07-01'),
        triggerEvent: 'G-6 clause 2 discharge — second run, different day',
      });
      const after = await countRows(
        `SELECT count(*) AS n FROM "notification" WHERE "payload"->>'deadlineId' = '${AML_DEADLINE}'`,
      );
      expect(before).toBe(0);
      expect(after, 'the AML duty must stay silent on every run, not only the first').toBe(0);

      // …and the control kept working on the second day too, which is what stops "after === 0" being
      // read as "the second call did nothing at all".
      const controlAfter = await countRows(
        `SELECT count(*) AS n FROM "escalation_event"
         WHERE "deadlineId" = '${ORDINARY_DEADLINE}' AND "deletedAt" IS NULL`,
      );
      expect(
        controlAfter,
        'the control must have escalated on the second day as well — otherwise the second run proves ' +
          'nothing about the subject',
      ).toBeGreaterThan(1);
    });
  },
);
