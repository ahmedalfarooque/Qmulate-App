/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * AV7 · ADVERSARY PROBE — "a maker cannot approve their own distribution run, and one approval
 *                          cannot be spent twice" (G-3 / V-6)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * This file is an ATTACK, not a confirmation. Every `it` below is an attempt to defeat the claim.
 * Where the attempt FAILS, the assertion records the guard's own message so the negative bounds the
 * claim rather than decorating it.
 *
 * Periods: start days 15..25 of 2026-01, end 2026-03-31 — distinct from the seeded `dist-001`
 * (2026-01-01…03-31) and from `distribution-maker-checker.integration.test.ts` (days 5..14), so
 * migration 21's `distribution_one_live_run_per_period` never fires by accident. The ledger window's
 * CONTENTS are identical for all of them, so every run computes the same waterfall.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  bookIncome,
  countAuditEvents,
  paidPeriod,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
  warnNoDatabase,
  type TestSubjectSpec,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AV7 · the approval-identity / approval-double-spend adversary probe');

const createCaller = createCallerFactory(appRouter);
const WAQF = 'waqf-001';
const NOW = new Date('2026-08-19T09:00:00.000Z');

/** ⚠ THE ATTACKER. Holds FINANCE **and** NAZIR on this endowment — AC-4's small-team case. */
const AUTHOR_AND_NAZIR = `${API_TEST_PREFIX}av7-author-nazir`;
/** A second seat whose ONLY job is to press `submit`, so it becomes the approval's `makerId`. */
const SUBMITTER = `${API_TEST_PREFIX}av7-submitter`;
/** The same interposed role, but as a FINANCE seat — see AV7-A0 for why CASE_MANAGER cannot submit. */
const SUBMITTER_FIN = `${API_TEST_PREFIX}av7-submitter-fin`;
/** An unrelated second Nazir — needed for the race. */
const NAZIR_B = `${API_TEST_PREFIX}av7-nazir-b`;
/** A plain finance maker. */
const FIN_ONLY = `${API_TEST_PREFIX}av7-finance`;
/** A finance seat on TWO endowments — for the cross-endowment authority attack. */
const CROSS_FIN = `${API_TEST_PREFIX}av7-cross-finance`;
/** A Nazir on the OTHER endowment only. */
const NAZIR_W2 = `${API_TEST_PREFIX}av7-nazir-w2`;
const OTHER_WAQF = 'waqf-002';

const FINANCE_PERMISSIONS = [
  'finance:transaction:read',
  'distribution:run:read',
  'distribution:run:write',
  'distribution:run:initiate',
  'distribution:line_item:read',
  'distribution:line_item:write',
  'approval:request:read',
  'approval:request:initiate',
];

const NAZIR_PERMISSIONS = [
  'distribution:run:read',
  'distribution:line_item:read',
  'approval:request:read',
  'approval:request:approve',
];

/** CASE_MANAGER holds `distribution:run:initiate` and NOT `distribution:run:write`. */
const CASE_MANAGER_PERMISSIONS = [
  'distribution:run:read',
  'distribution:run:initiate',
  'distribution:line_item:read',
  'approval:request:read',
  'approval:request:initiate',
];

function subjects(): TestSubjectSpec[] {
  return [
    { id: AUTHOR_AND_NAZIR, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS },
    { id: AUTHOR_AND_NAZIR, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
    { id: SUBMITTER, role: 'CASE_MANAGER', waqfIds: [WAQF], permissions: CASE_MANAGER_PERMISSIONS },
    { id: SUBMITTER_FIN, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS },
    { id: NAZIR_B, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
    { id: FIN_ONLY, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS },
    {
      id: CROSS_FIN,
      role: 'FINANCE',
      waqfIds: [WAQF, OTHER_WAQF],
      permissions: FINANCE_PERMISSIONS,
    },
    { id: NAZIR_W2, role: 'NAZIR', waqfIds: [OTHER_WAQF], permissions: NAZIR_PERMISSIONS },
  ];
}

const callerFor = async (userId: string, requestId: string, totpAssertedAt?: Date | null) =>
  createCaller(
    await contextFor({
      userId,
      requestId,
      now: NOW,
      ...(totpAssertedAt === undefined ? {} : { totpAssertedAt }),
    }),
  );

const period = (startDay: number) => ({
  periodStart: `2026-01-${String(startDay).padStart(2, '0')}`,
  periodEnd: '2026-03-31',
});

/**
 * ⚠ THE SEVEN WINDOWS WHOSE RUNS ACTUALLY REACH `EXECUTED` — ALLOCATED, NOT RATIONED.
 *
 * `februaryPeriod()` used to live here, and its docstring is worth quoting because it is the
 * clearest statement of the defect anywhere in this repo: *"January 1…31 are all spoken for (day 1
 * = seeded `dist-001`, 2 = `distribution-run`, 3–4 = `av7-audit-trace`, 5–14 =
 * `distribution-maker-checker`, 15–31 = this file)"*, and then — approvingly — *"A start day of
 * 1…10 February keeps all three inside, so every run in this file computes the same SAR 275,000.00
 * distributable."*
 *
 * Five suites were rationing START DAYS inside ONE quarter, precisely so that every window would
 * keep containing the SAME `rev-001` — the only income receipt `waqf-001` has — in a quarter the
 * seeded `dist-001` had ALREADY PAID. Distinct triples, one receipt, forty-four windows. That is
 * AV7-F2, and `distribution_paid_periods_disjoint` (migration 26) refuses it. MEASURED: 7 of this
 * file's 19 tests went red the moment the constraint landed, every one a TRUE POSITIVE.
 *
 * ⚠ ONLY SEVEN, THOUGH, AND THAT IS NOT AN OVERSIGHT. The constraint compares `EXECUTED` rows with
 * `EXECUTED` rows only, and most runs in this file are created and submitted precisely so that
 * `execute` REFUSES them (a stale assertion, a foreign subject, a substituted digest, a maker
 * approving himself). Those never become `EXECUTED`, so their overlapping windows are correct
 * rather than tolerated: two runs that have not paid are two COMPUTATIONS. They keep
 * `period(startDay)`, and the unique index still gives each a distinct triple.
 *
 * ⚠ THE OLD WARNING ABOUT `exp-e-002` NO LONGER APPLIES TO THESE SEVEN, and is retired rather than
 * deleted: it said moving `periodEnd` into April *"would pull in `exp-e-002` (35,000.00,
 * 2026-04-01) and change it too."* True of a hand-picked window. An allocated window is verified
 * EMPTY by {@link bookIncome} before the run computes — it throws and names any stranger it finds —
 * so the figures cannot drift by a row somebody forgot. The waterfall is unchanged: SAR 350,000.00
 * booked, less the deed's flat 40,000.00 reserve and 10% of revenue, is the same **275,000.00**.
 */
/**
 * A FEBRUARY start day, for a run that is created and submitted and then DELIBERATELY REFUSED at
 * `execute`, so it never becomes `EXECUTED` and the period-overlap constraint never sees it.
 *
 * ⚠ IT STILL OVERLAPS `dist-001`'s ALREADY-PAID QUARTER, AND THAT IS CORRECT RATHER THAN TOLERATED.
 * Migration 26's predicate is `status = 'EXECUTED'` on purpose: two runs that have not paid are two
 * COMPUTATIONS, and refusing them would remove a Nazir's ability to preview an alternative window
 * for one period. The only user left is AV7-E5, whose whole point is that the substituted input is
 * caught by the re-derived digest BEFORE anything is posted — if a change ever made that run
 * succeed, the constraint would refuse it and this comment would be how the next reader finds out
 * why. `distribution_one_live_run_per_period` still requires the distinct triple.
 */
const februaryPeriod = (startDay: number) => ({
  periodStart: `2026-02-${String(startDay).padStart(2, '0')}`,
  periodEnd: '2026-03-31',
});

const PAID = {
  a: paidPeriod('av7-approval-identity', 1),
  d1c: paidPeriod('av7-approval-identity', 2),
  e: paidPeriod('av7-approval-identity', 3),
  e2: paidPeriod('av7-approval-identity', 4),
  e3: paidPeriod('av7-approval-identity', 5),
  e4: paidPeriod('av7-approval-identity', 6),
  e6: paidPeriod('av7-approval-identity', 7),
} as const;

async function readApproval(id: string) {
  const prisma = await basePrisma();
  return prisma.approvalRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      type: true,
      makerId: true,
      checkerId: true,
      subjectId: true,
      decidedAt: true,
      deletedAt: true,
      payloadHash: true,
      payload: true,
    },
  });
}

async function readRun(id: string) {
  const prisma = await basePrisma();
  return prisma.distribution.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdBy: true,
      approvalRequestId: true,
      engineVersion: true,
      runDigest: true,
      distributableSar: true,
    },
  });
}

async function lineItems(distributionId: string) {
  const prisma = await basePrisma();
  return prisma.distributionLineItem.findMany({
    where: { distributionId },
    select: { id: true, beneficiaryId: true, status: true, amountSar: true, createdBy: true },
    orderBy: { beneficiaryId: 'asc' },
  });
}

/** One line's `entitledSar` as it currently sits in the stored `computationTrace` Json. */
async function traceLineAmount(distributionId: string, index: number): Promise<string | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<{ amount: string | null }[]>(
    `SELECT "computationTrace" #>> ARRAY['lines', $2, 'entitledSar'] AS amount
       FROM "distribution" WHERE "id" = $1`,
    distributionId,
    String(index),
  );
  return rows[0]?.amount ?? null;
}

/**
 * Run one `UPDATE "distribution" …` fragment with migration 22 §1's write-once seal SUSPENDED.
 *
 * ⚠ THIS EXISTS TO MUTATION-TEST LAYER 2, NOT TO WORK AROUND LAYER 1. The seal is dropped and
 * restored inside ONE atomic `DO` block, for exactly one id — the same idiom this file's own
 * teardown uses on the two retention guards, and the same reason: the alternative is asserting a
 * two-layer claim through one layer, which measures one layer.
 *
 * ⚠ `ENABLE ALWAYS`, not `ENABLE`, on the way back. A trigger restored at `tgenabled = 'O'` is
 * skipped by any session that sets `session_replication_role = 'replica'` — the Sprint-1 finding
 * that defeated gate G-1 — so a careless restore would leave the seal weaker than it was found.
 * `distribution-run-schema.integration.test.ts` §4 asserts all six triggers at `'A'`.
 *
 * ⚠ THREE SEPARATE STATEMENTS, NOT ONE `DO` BLOCK, AND THE REASON IS MEASURED. The teardown below
 * suspends `distribution_no_delete` inside one atomic `DO` — that works because a DELETE queues no
 * deferred event. An UPDATE does: `distribution_authority` is a DEFERRABLE INITIALLY DEFERRED
 * constraint trigger on INSERT OR UPDATE, so the re-`ALTER` inside the same transaction dies with
 * `55006 cannot ALTER TABLE "distribution" because it has pending trigger events`. Splitting the
 * statements lets each implicit transaction flush its own deferred events; the `finally` is what
 * keeps the seal from being left down if the middle statement throws.
 */
async function withTraceSealSuspended(distributionId: string, setFragment: string): Promise<void> {
  // The id is a cuid produced by our own `create`; asserted rather than trusted, because it is
  // interpolated where a bind parameter cannot reach.
  if (!/^[a-z0-9]+$/.test(distributionId)) {
    throw new Error(`refusing to interpolate a non-cuid distribution id: ${distributionId}`);
  }
  const prisma = await privilegedPrisma();
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "distribution" DISABLE TRIGGER distribution_status_transition`,
  );
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "distribution" ${setFragment} WHERE "id" = '${distributionId}'`,
    );
  } finally {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "distribution" ENABLE ALWAYS TRIGGER distribution_status_transition`,
    );
  }
}

/** A 2-dp SAR string (or a Prisma `Decimal`'s `toString()`) as integer halalas. */
function halalasOf(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

/** Σ of the committed line amounts, in integer halalas. Never through a float. */
function sumLineHalalas(lines: readonly { readonly amountSar: unknown }[]): bigint {
  return lines.reduce((total, line) => total + halalasOf(String(line.amountSar)), 0n);
}

/** Report a rejection's real shape rather than a boolean. */
function shapeOf(error: unknown): {
  code?: string;
  cause?: string;
  message: string;
} {
  const e = error as { code?: string; cause?: { code?: string }; message?: string };
  return {
    ...(e.code === undefined ? {} : { code: e.code }),
    ...(e.cause?.code === undefined ? {} : { cause: e.cause.code }),
    message: String(e.message ?? error),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.runIf(hasDatabase)('AV7 · approve-your-own-run / spend-one-approval-twice', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());
    // An allocated window cannot inherit `rev-001`, which is the whole point, so every run that
    // will PAY needs its own pool. `countAuditEvents` below is always scoped by `entityId` (an
    // approval request id), so these audited bookings cannot perturb any count this file asserts.
    for (const [tag, period] of Object.entries(PAID)) {
      await bookIncome({ waqfId: WAQF, period, tag: `av7ai-${tag}` });
    }
  });

  afterAll(async () => {
    const prisma = await privilegedPrisma();
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "distribution_line_item" DISABLE TRIGGER distribution_line_item_no_delete;
        DELETE FROM "distribution_line_item" WHERE "createdBy" LIKE 'user-test-api-%';
        ALTER TABLE "distribution_line_item" ENABLE ALWAYS TRIGGER distribution_line_item_no_delete;
        ALTER TABLE "distribution" DISABLE TRIGGER distribution_no_delete;
        DELETE FROM "distribution" WHERE "createdBy" LIKE 'user-test-api-%';
        ALTER TABLE "distribution" ENABLE ALWAYS TRIGGER distribution_no_delete;
      END
      $$;
    `);
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-A · THE HEADLINE ATTACK — the run's AUTHOR approves it, because the identity compared is
   *          the SUBMITTER, not the person whose figures are on the row.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-A0 · a CASE_MANAGER holding `distribution:run:initiate` CANNOT submit at all', async () => {
    // Not part of the exploit — a defect found while building it. `distribution.submit` declares
    // `distribution:run:initiate` (authorized_rep, case_manager, finance) but its `Distribution.status`
    // UPDATE is gated by the write extension on `distribution:run:write` (finance ONLY). So two of the
    // three presets the router advertises can never reach it.
    const created = await (
      await callerFor(AUTHOR_AND_NAZIR, 'av7a0-create')
    ).distribution.create({ waqfId: WAQF, ...period(25) });
    let thrown: unknown;
    try {
      await (
        await callerFor(SUBMITTER, 'av7a0-submit')
      ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    } catch (error) {
      thrown = error;
    }
    console.log('AV7-A0 RESULT', {
      caseManagerHasInitiate: true,
      submitOutcome: thrown === undefined ? 'SUCCEEDED' : shapeOf(thrown),
      runStatus: (await readRun(created.distributionId))?.status,
    });
    expect(thrown).toBeDefined();
  });

  it('AV7-A · the run AUTHOR approves and posts their own run (a submitter is interposed)', async () => {
    // 1. The attacker COMPUTES and PERSISTS the run. `createdBy` is theirs; the period (which decides
    //    which receipts fall inside the waterfall) is theirs; the digest is over their choice.
    const author = await callerFor(AUTHOR_AND_NAZIR, 'av7a-create');
    const created = await author.distribution.create({ waqfId: WAQF, ...PAID.a });

    // 2. A DIFFERENT seat presses submit. That, and only that, decides the approval's `makerId`.
    const submitted = await (
      await callerFor(SUBMITTER_FIN, 'av7a-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });

    const beforeApprove = await countAuditEvents({
      action: 'APPROVE',
      entityId: submitted.approvalRequestId,
    });

    // 3. The ATTACKER approves — the same identity that authored the run.
    const decided = await (
      await callerFor(AUTHOR_AND_NAZIR, 'av7a-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    // 4. …and executes it (FINANCE holds `distribution:line_item:write`).
    const posted = await (
      await callerFor(AUTHOR_AND_NAZIR, 'av7a-execute')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });

    const run = await readRun(created.distributionId);
    const lines = await lineItems(created.distributionId);

    // ⚠ WHAT THE TRAIL OF THE PAYMENT SAYS. If `createdBy` never reaches the DISTRIBUTION_POST
    // event, this exploit is INDISTINGUISHABLE from a legitimate two-person post in the record.
    const prisma = await basePrisma();
    const postEvent = await prisma.$queryRawUnsafe<{ actorId: string; context: unknown }[]>(
      `SELECT "actorId", "context" FROM "audit_event"
        WHERE "action" = 'DISTRIBUTION_POST' AND "entityId" = $1`,
      created.distributionId,
    );
    console.log('AV7-A TRAIL', {
      postEventCount: postEvent.length,
      events: postEvent.map((e) => ({
        actorId: e.actorId,
        contextKeys: Object.keys((e.context ?? {}) as object).sort(),
      })),
      anyEventNamesTheRunAuthorAsAuthor: postEvent.some((e) =>
        JSON.stringify(e.context ?? {}).includes('createdBy'),
      ),
    });

    console.log('AV7-A RESULT', {
      runCreatedBy: run?.createdBy,
      approvalMakerId: posted.makerId,
      approvalCheckerId: posted.checkerId,
      decidedCheckerId: decided.checkerId,
      runStatus: run?.status,
      distributableSar: String(run?.distributableSar),
      lineCount: lines.length,
      lineCreatedBy: [...new Set(lines.map((l) => l.createdBy))],
      amounts: lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`),
      approveEventsDelta:
        (await countAuditEvents({ action: 'APPROVE', entityId: submitted.approvalRequestId })) -
        beforeApprove,
    });

    // ⚠ THE EXPLOIT, ASSERTED: one identity authored the run, approved it, and posted it.
    expect(run?.createdBy).toBe(AUTHOR_AND_NAZIR);
    expect(posted.checkerId).toBe(AUTHOR_AND_NAZIR);
    expect(posted.makerId).toBe(SUBMITTER_FIN);
    expect(run?.status).toBe('EXECUTED');
    expect(lines.length).toBeGreaterThan(0);
    // Every line item is stamped with the ATTACKER as its writer, on a run the ATTACKER approved.
    expect([...new Set(lines.map((l) => l.createdBy))]).toEqual([AUTHOR_AND_NAZIR]);
  });

  it('AV7-A control · the SAME identity IS refused when it is also the submitter', async () => {
    const author = await callerFor(AUTHOR_AND_NAZIR, 'av7a2-create');
    const created = await author.distribution.create({ waqfId: WAQF, ...period(16) });
    const submitted = await (
      await callerFor(AUTHOR_AND_NAZIR, 'av7a2-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });

    let thrown: unknown;
    try {
      await (
        await callerFor(AUTHOR_AND_NAZIR, 'av7a2-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });
    } catch (error) {
      thrown = error;
    }
    console.log('AV7-A CONTROL', shapeOf(thrown));
    expect(shapeOf(thrown).cause).toBe('SEGREGATION_OF_DUTIES');
    expect((await readApproval(submitted.approvalRequestId))?.checkerId).toBeNull();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-B · ONE APPROVAL, DECIDED TWICE — INVERTED.
   *
   * `resolveApprover` reads the row OUTSIDE the write transaction and takes no lock, and the
   * `approval_request_authority` lattice only fires when the STATUS CHANGES. So two checkers who
   * both observed PENDING both wrote APPROVED, and the second overwrote `checkerId`.
   *
   * MEASURED BEFORE THE FIX (HEAD `afeac89`, this file 16/16 green):
   *   outcomes: [{ ok: 'author-nazir' }, { ok: 'nazir-b' }]   ← BOTH callers got a success carrying
   *   approveEventsWritten: 3                                    their OWN id
   *   finalCheckerId: whichever transaction committed last — 'nazir-b' once, 'author-nazir' twice
   *                   across runs, i.e. NONDETERMINISTIC: a real race, not a fixed order.
   *
   * ⚠ THE FIX IS AT THE DATABASE, NOT IN THE PROCEDURE — migration 22 §2 makes the four DECISION
   * columns write-once ONCE SET. A second read-then-check in application code is the control that
   * already failed here (it is a TOCTOU by construction). Under `READ COMMITTED` the losing
   * transaction blocks on the row lock, re-reads `OLD` as already-decided, and is refused 42501.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-B · two Nazirs decide ONE approval concurrently — exactly ONE decision survives', async () => {
    const created = await (
      await callerFor(FIN_ONLY, 'av7b-create')
    ).distribution.create({ waqfId: WAQF, ...period(17) });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7b-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });

    const before = await countAuditEvents({
      action: 'APPROVE',
      entityId: submitted.approvalRequestId,
    });

    const a = await callerFor(AUTHOR_AND_NAZIR, 'av7b-approve-a');
    const b = await callerFor(NAZIR_B, 'av7b-approve-b');
    const results = await Promise.allSettled([
      a.approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId }),
      b.approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId }),
    ]);

    const row = await readApproval(submitted.approvalRequestId);
    const after = await countAuditEvents({
      action: 'APPROVE',
      entityId: submitted.approvalRequestId,
    });
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    console.log('AV7-B RESULT', {
      outcomes: results.map((r) =>
        r.status === 'fulfilled'
          ? { ok: (r.value as { checkerId?: string | null }).checkerId }
          : { rejected: shapeOf(r.reason).message.replace(/\s+/g, ' ').slice(0, 260) },
      ),
      finalStatus: row?.status,
      finalCheckerId: row?.checkerId,
      approveEventsWritten: after - before,
      fulfilledCount: fulfilled.length,
    });

    // ⚠ EXACTLY ONE CALLER SUCCEEDS. This is the inversion: the old assertion only required that
    // SOMEBODY was recorded, which two successes also satisfy.
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(row?.status).toBe('APPROVED');

    // THE REFUSAL CARRIES THE GUARD'S OWN SENTENCE. A bare rejection would also be produced by a
    // deadlock, a serialization failure or a typo — none of which is this guard.
    const loser = rejected[0] as PromiseRejectedResult;
    expect(String(shapeOf(loser.reason).message)).toMatch(/WRITE-ONCE DECISION/);
    expect(String(shapeOf(loser.reason).message)).toMatch(/ONE APPROVAL, ONE DECISION/);

    // …AND THE WINNER IS THE ONE THE ROW RECORDS. Before the fix these could differ, because both
    // callers returned their own id while the row kept whichever committed last.
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ checkerId?: string | null }>).value;
    expect(row?.checkerId).toBe(winner.checkerId);

    // WHAT THE APPEND-ONLY TRAIL NOW SAYS about this one approval. The losing transaction's own
    // APPROVE event rolls back with its refused UPDATE, so the trail and the row must AGREE — the
    // fact AV7-B disproved (`trailAndRowAgree: false`, three events, two actors).
    const prisma = await basePrisma();
    const events = await prisma.$queryRawUnsafe<
      { actorId: string | null; action: string; occurredAt: Date; context: unknown }[]
    >(
      `SELECT "actorId", "action", "occurredAt", "context"
         FROM "audit_event"
        WHERE "entityId" = $1 AND "action" = 'APPROVE'
        ORDER BY "occurredAt" ASC`,
      submitted.approvalRequestId,
    );
    console.log('AV7-B TRAIL', {
      approveEventActors: events.map((e) => e.actorId),
      rowSaysCheckerIs: row?.checkerId,
      trailAndRowAgree: events.every((e) => e.actorId === row?.checkerId),
    });
    // ⚠ EVERY `APPROVE` EVENT NAMES THE SAME ACTOR, AND IT IS THE ONE THE ROW RECORDS. That is the
    // property AV7-B disproved: it measured `approveEventActors: ['nazir-b','nazir-b',
    // 'author-nazir']` against `rowSaysCheckerIs: 'author-nazir'`, i.e. `trailAndRowAgree: false`.
    expect(new Set(events.map((e) => e.actorId))).toEqual(new Set([row?.checkerId]));

    // ⚠ TWO EVENTS, NOT ONE — MEASURED, AND IT IS AV7-AUD-F7's KNOWN DUPLICATION, NOT A SECOND
    // AUTHORITY. `deriveAction` maps the PENDING→APPROVED status move onto `APPROVE`, and
    // `approval.approve` also writes an explicit `recordEvent`, so one decision leaves two rows and
    // only one of them carries an after-image. Pinned at 2 rather than waved at: before the fix it
    // was THREE, from two different actors, which is the fact that mattered. If AUD-F7 is ever
    // fixed this drops to 1 and this line says so instead of passing for a new reason.
    expect(after - before).toBe(2);
  });

  it('AV7-B2 · can the MAKER win that race? (bounds the identity check)', async () => {
    const created = await (
      await callerFor(AUTHOR_AND_NAZIR, 'av7b2-create')
    ).distribution.create({ waqfId: WAQF, ...period(18) });
    const submitted = await (
      await callerFor(AUTHOR_AND_NAZIR, 'av7b2-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });

    const maker = await callerFor(AUTHOR_AND_NAZIR, 'av7b2-maker-approve');
    const other = await callerFor(NAZIR_B, 'av7b2-other-approve');
    const results = await Promise.allSettled([
      maker.approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId }),
      other.approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId }),
    ]);
    const row = await readApproval(submitted.approvalRequestId);
    console.log('AV7-B2 RESULT', {
      outcomes: results.map((r) =>
        r.status === 'fulfilled' ? { ok: r.value } : { rejected: shapeOf(r.reason) },
      ),
      finalCheckerId: row?.checkerId,
    });
    // The maker must NEVER be the recorded checker, whatever the interleaving.
    expect(row?.checkerId).not.toBe(AUTHOR_AND_NAZIR);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-C · SPEND ONE APPROVAL TWICE — concurrent `execute`.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-C · two concurrent `execute` calls on one approval — are the lines written twice?', async () => {
    const created = await (
      await callerFor(FIN_ONLY, 'av7c-create')
    ).distribution.create({ waqfId: WAQF, ...period(19) });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7c-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7c-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const x = await callerFor(FIN_ONLY, 'av7c-exec-1');
    const y = await callerFor(FIN_ONLY, 'av7c-exec-2');
    const args = {
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    };
    const results = await Promise.allSettled([
      x.distribution.execute(args),
      y.distribution.execute(args),
    ]);

    const lines = await lineItems(created.distributionId);
    console.log('AV7-C RESULT', {
      outcomes: results.map((r) =>
        r.status === 'fulfilled'
          ? { ok: (r.value as { lineItemIds: string[] }).lineItemIds.length }
          : { rejected: shapeOf(r.reason).message.slice(0, 240) },
      ),
      committedLineCount: lines.length,
      amounts: lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}`),
      runStatus: (await readRun(created.distributionId))?.status,
      approvalStatus: (await readApproval(submitted.approvalRequestId))?.status,
    });

    // A beneficiary must not be owed twice for one approval.
    const perBeneficiary = new Map<string, number>();
    for (const line of lines) {
      perBeneficiary.set(line.beneficiaryId, (perBeneficiary.get(line.beneficiaryId) ?? 0) + 1);
    }
    expect([...perBeneficiary.values()].every((n) => n === 1)).toBe(true);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-D · THE DATABASE-SIDE HOLES the application race rides on.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-D1 · `checkerId` IS write-once — APPROVED → APPROVED with a different Nazir is refused', async () => {
    const created = await (
      await callerFor(FIN_ONLY, 'av7d1-create')
    ).distribution.create({ waqfId: WAQF, ...period(20) });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7d1-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7d1-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const prisma = await privilegedPrisma();
    let swapError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "approval_request" SET "checkerId" = $1 WHERE "id" = $2`,
        AUTHOR_AND_NAZIR,
        submitted.approvalRequestId,
      );
    } catch (error) {
      swapError = error;
    }
    const swapped = await readApproval(submitted.approvalRequestId);

    // POSITIVE CONTROL: a status walk-back on the same row must be refused with the trigger's name.
    let latticeError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "approval_request" SET "status" = 'PENDING' WHERE "id" = $1`,
        submitted.approvalRequestId,
      );
    } catch (error) {
      latticeError = error;
    }

    console.log('AV7-D1 RESULT', {
      checkerSwapRefused: swapError !== undefined,
      checkerSwapError: swapError === undefined ? null : shapeOf(swapError).message.slice(0, 400),
      recordedCheckerAfterSwap: swapped?.checkerId,
      approvedByAudit: 'see APPROVE event context (grantId/role) — it still names the ORIGINAL',
      latticeWalkBackRefused: latticeError !== undefined,
      latticeError: latticeError === undefined ? null : shapeOf(latticeError).message.slice(0, 300),
    });

    // ⚠ THE INVERSION. Before migration 22 §2 this UPDATE COMMITTED and `recordedCheckerAfterSwap`
    // came back as the swapped-in Nazir. Asserted on the guard's own sentence, and on the id that
    // did NOT move — a refusal that left the row changed would be no refusal at all.
    expect(swapError).toBeDefined();
    expect(String(shapeOf(swapError).message)).toMatch(/"checkerId" is part of the WRITE-ONCE/);
    expect(String(shapeOf(swapError).message)).toMatch(/42501/);
    expect(swapped?.checkerId).toBe(NAZIR_B);

    // POSITIVE CONTROL (pre-existing, and it still matters): a status walk-back on the same row is
    // refused by the LATTICE, with the lattice's own words. If this ever stops firing, the refusal
    // above would prove nothing about this cluster — a disabled trigger refuses nothing.
    expect(latticeError).toBeDefined();
    expect(String(shapeOf(latticeError).message)).toMatch(/terminal|illegal status transition/);
  });

  it('AV7-D1b · how far does the checkerId swap reach? (the maker, and a non-Nazir)', async () => {
    const created = await (
      await callerFor(SUBMITTER_FIN, 'av7d1b-create')
    ).distribution.create({ waqfId: WAQF, ...period(26) });
    const submitted = await (
      await callerFor(SUBMITTER_FIN, 'av7d1b-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7d1b-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const prisma = await privilegedPrisma();
    const attempt = async (checker: string) => {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "approval_request" SET "checkerId" = $1 WHERE "id" = $2`,
          checker,
          submitted.approvalRequestId,
        );
        return 'COMMITTED';
      } catch (error) {
        return shapeOf(error).message.replace(/\s+/g, ' ').slice(0, 200);
      }
    };

    const toMaker = await attempt(SUBMITTER_FIN); // = makerId
    const toNonNazir = await attempt(FIN_ONLY); // holds FINANCE only
    const toOtherNazir = await attempt(AUTHOR_AND_NAZIR); // holds an ACTIVE NAZIR grant

    console.log('AV7-D1b RESULT', {
      swapToMaker: toMaker,
      swapToNonNazir: toNonNazir,
      swapToAnotherNazir: toOtherNazir,
      finalCheckerId: (await readApproval(submitted.approvalRequestId))?.checkerId,
    });
    expect(toMaker).not.toBe('COMMITTED');
    expect(toNonNazir).not.toBe('COMMITTED');
    // ⚠ THE REACHABLE SET IS NOW EMPTY. Before the fix this third case was the ONE that committed —
    // "any other ACTIVE Nazir on that endowment", which is exactly the set AV7-B's race draws from.
    // That is why one guard closes both, and it is asserted here rather than reasoned about.
    expect(toOtherNazir).not.toBe('COMMITTED');
    expect(toOtherNazir).toMatch(/WRITE-ONCE DECISION/);
    // The row is untouched by all three attempts.
    expect((await readApproval(submitted.approvalRequestId))?.checkerId).toBe(NAZIR_B);
  });

  it('AV7-D1c · on an EXECUTED approval — the approver of an ALREADY-PAID run cannot be rewritten', async () => {
    const created = await (
      await callerFor(SUBMITTER_FIN, 'av7d1c-create')
    ).distribution.create({ waqfId: WAQF, ...PAID.d1c });
    const submitted = await (
      await callerFor(SUBMITTER_FIN, 'av7d1c-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7d1c-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });
    const posted = await (
      await callerFor(SUBMITTER_FIN, 'av7d1c-exec')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });

    const prisma = await privilegedPrisma();
    let swapError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "approval_request" SET "checkerId" = $1 WHERE "id" = $2`,
        AUTHOR_AND_NAZIR,
        submitted.approvalRequestId,
      );
    } catch (error) {
      swapError = error;
    }
    const after = await readApproval(submitted.approvalRequestId);
    console.log('AV7-D1c RESULT', {
      paidTo: (await lineItems(created.distributionId)).map(
        (l) => `${l.beneficiaryId}=${String(l.amountSar)}`,
      ),
      approvalStatus: after?.status,
      checkerAtPostTime: posted.checkerId,
      checkerNow: after?.checkerId,
      swapRefused: swapError !== undefined,
      swapError:
        swapError === undefined
          ? null
          : shapeOf(swapError).message.replace(/\s+/g, ' ').slice(0, 300),
    });
    expect(after?.status).toBe('EXECUTED');

    // ⚠ THE INVERSION, AND THE GRAVEST OF THE THREE. Before the fix this UPDATE committed on a run
    // whose lines were already written: `checkerAtPostTime` was `nazir-b`, `checkerNow` was somebody
    // else, and the APPROVE audit event went on naming `nazir-b`. The row and the evidence of last
    // resort disagreed about who authorised a payment that had already happened.
    expect(swapError).toBeDefined();
    expect(String(shapeOf(swapError).message)).toMatch(/WRITE-ONCE DECISION/);
    expect(after?.checkerId).toBe(NAZIR_B);
    expect(after?.checkerId).toBe(posted.checkerId);

    // POSITIVE CONTROL: the payment itself is intact and is the one that was approved — so the seal
    // did not achieve its refusal by breaking the run.
    const paid = await lineItems(created.distributionId);
    expect(paid.map((l) => String(l.amountSar))).toEqual(['137500', '0', '137500']);
  });

  it('AV7-D2 · is the approval PAYLOAD write-once? (the crafted-artifact route)', async () => {
    const created = await (
      await callerFor(FIN_ONLY, 'av7d2-create')
    ).distribution.create({ waqfId: WAQF, ...period(21) });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7d2-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });

    const prisma = await privilegedPrisma();
    let payloadError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "approval_request"
            SET "payload" = jsonb_set("payload", '{distributableSar}', '"1.00"')
          WHERE "id" = $1`,
        submitted.approvalRequestId,
      );
    } catch (error) {
      payloadError = error;
    }

    let softDeleteError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "approval_request" SET "deletedAt" = now() WHERE "id" = $1`,
        submitted.approvalRequestId,
      );
    } catch (error) {
      softDeleteError = error;
    }

    // Can a maker hand-mint a SECOND DISTRIBUTION_RUN approval for the same run?
    let mintError: unknown;
    try {
      await (
        await callerFor(FIN_ONLY, 'av7d2-craft')
      ).approval.initiate({
        waqfId: WAQF,
        type: 'DISTRIBUTION_RUN',
        subjectId: created.distributionId,
        payload: {
          kind: 'distribution.run',
          distributionId: created.distributionId,
          waqfId: WAQF,
          engineVersion: 'e6-distribution/4.0.0',
          runDigest: 'a'.repeat(64),
          distributableSar: '1.00',
          flags: [],
          invariantsChecked: [],
        },
      });
    } catch (error) {
      mintError = error;
    }

    console.log('AV7-D2 RESULT', {
      payloadEditRefused: payloadError !== undefined,
      payloadError: payloadError === undefined ? null : shapeOf(payloadError).message.slice(0, 260),
      softDeleteRefused: softDeleteError !== undefined,
      softDeleteError:
        softDeleteError === undefined ? null : shapeOf(softDeleteError).message.slice(0, 260),
      secondMintRefused: mintError !== undefined,
      mintError: mintError === undefined ? null : shapeOf(mintError),
    });

    expect(payloadError).toBeDefined();
    expect(softDeleteError).toBeDefined();
    expect(mintError).toBeDefined();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-E · SPEND THE APPROVAL ON A DIFFERENT ARTIFACT — INVERTED.
   *
   * ⚠ THESE SIX TESTS WERE THE EXPLOIT AND ARE NOW THE REGRESSION. They are INVERTED, not deleted:
   * the attack sequence is unchanged to the byte, and only the assertion moved — from "print what
   * committed" to "the refusal arrives, carrying the guard's own sentence, and nothing was written".
   * The exploit's shape IS the regression test (this repo rebuilt a destroyed test layer by
   * inverting rather than deleting; that is the standing convention).
   *
   * WHAT WAS MEASURED BEFORE THE FIX, on this file at HEAD `afeac89`, 16/16 green:
   *   AV7-E   `{lines,0,entitledSar}` -> "999999.00" after a real Nazir approved SAR 275,000.00
   *           posted `ben-001=999999:PAID`, committedSum SAR 1,137,499.00, run EXECUTED.
   *   AV7-E2  `lines[1]` EXCLUDED/0.00 -> PAID/50000.00 posted `ben-002=50000:PAID`.
   *   AV7-E3  the same substitution issued on `qmulate_app` — the role the API process itself holds
   *           — committed, so the write needed no DBA.
   *
   * TWO LAYERS NOW STAND BETWEEN THAT AND A PAYMENT, and the tests below prove each SEPARATELY,
   * because a two-layer claim measured through one layer is one layer:
   *   L1 (database, migration 22 §1) `distribution."computationTrace"` is WRITE-ONCE. Proved by
   *      AV7-E / E2 / E3, which now never reach `execute` at all.
   *   L2 (procedure, `authorisedLines`) `execute` REPLAYS the run's stored input, re-derives the
   *      digest, and asserts invariant I2 against the persisted `distributableSar`. Proved by
   *      AV7-E4 / E5 with L1 DELIBERATELY SUSPENDED, and by AV7-E6 through a column L1 does not
   *      cover at all.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-E · substituted LINES inside computationTrace are REFUSED BY THE DATABASE (was: posted)', async () => {
    const created = await (
      await callerFor(FIN_ONLY, 'av7e-create')
    ).distribution.create({ waqfId: WAQF, ...PAID.e });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7e-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7e-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const signed = await readApproval(submitted.approvalRequestId);
    const runBefore = await readRun(created.distributionId);

    // THE ATTACK, unchanged: rewrite the FIRST line's amount, leaving `runDigest`, `engineVersion`
    // and every SAR COLUMN untouched — so `execute`'s step-7 digest comparison would still pass.
    const prisma = await privilegedPrisma();
    let traceError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution"
            SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,entitledSar}', '"999999.00"')
          WHERE "id" = $1`,
        created.distributionId,
      );
    } catch (error) {
      traceError = error;
    }

    console.log('AV7-E RESULT', {
      approvedPayloadDistributable: (signed?.payload as { distributableSar?: string } | null)
        ?.distributableSar,
      approvedPayloadDigest: (signed?.payload as { runDigest?: string } | null)?.runDigest,
      traceWriteRefused: traceError !== undefined,
      traceError: traceError === undefined ? null : shapeOf(traceError).message.slice(0, 400),
    });

    // ⚠ ASSERTED ON THE GUARD'S OWN SENTENCE, NEVER ON A BARE REJECTION. A probe with a mistyped
    // column name also "fails"; only the guard's own words prove the code under test was reached.
    expect(traceError).toBeDefined();
    expect(String(shapeOf(traceError).message)).toMatch(/"computationTrace" is WRITE-ONCE/);
    // The migrator connection is the STRONGEST attacker this harness has, and it is refused.
    expect(String(shapeOf(traceError).message)).toMatch(/42501/);

    // Nothing moved: the trace is byte-identical and the digest never had to catch anything.
    const after = await readRun(created.distributionId);
    expect(after?.runDigest).toBe(runBefore?.runDigest);
    expect(await traceLineAmount(created.distributionId, 0)).not.toBe('999999.00');

    // ── POSITIVE CONTROL, ON THE SAME RUN AND THE SAME APPROVAL ──────────────────────────────
    // A guard that refuses everything is not a fix. The legitimate post must still succeed, and the
    // amounts must be the ones the Nazir approved.
    const posted = await (
      await callerFor(FIN_ONLY, 'av7e-exec')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });
    const lines = await lineItems(created.distributionId);
    console.log('AV7-E CONTROL', {
      posted: posted.lineItemIds.length,
      committedAmounts: lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`),
      runStatus: (await readRun(created.distributionId))?.status,
    });
    expect(posted.lineItemIds.length).toBe(3);
    expect(lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`)).toEqual([
      'ben-001=137500:PAID',
      'ben-002=0:EXCLUDED',
      'ben-003=137500:WITHHELD',
    ]);
    // I2 as integer halalas, against the pool the run records — the belt, from the outside.
    expect(sumLineHalalas(lines)).toBe(halalasOf(String(after?.distributableSar)));
  });

  it('AV7-E2 · an EXCLUDED line flipped to PAID after approval is REFUSED BY THE DATABASE', async () => {
    const created = await (
      await callerFor(SUBMITTER_FIN, 'av7e2-create')
    ).distribution.create({ waqfId: WAQF, ...PAID.e2 });
    const submitted = await (
      await callerFor(SUBMITTER_FIN, 'av7e2-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7e2-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const prisma = await privilegedPrisma();
    // lines[1] is `ben-002`, EXCLUDED, 0.00 in the approved artifact. Flip it to a paid line.
    let traceError: unknown;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution"
            SET "computationTrace" = jsonb_set(
                  jsonb_set(
                    jsonb_set("computationTrace", '{lines,1,status}', '"PAID"'),
                    '{lines,1,entitledSar}', '"50000.00"'),
                  '{lines,1,reasonCode}', 'null')
          WHERE "id" = $1`,
        created.distributionId,
      );
    } catch (error) {
      traceError = error;
    }
    console.log('AV7-E2 RESULT', {
      traceWriteRefused: traceError !== undefined,
      traceError: traceError === undefined ? null : shapeOf(traceError).message.slice(0, 300),
    });
    expect(traceError).toBeDefined();
    expect(String(shapeOf(traceError).message)).toMatch(/"computationTrace" is WRITE-ONCE/);

    // POSITIVE CONTROL: the run still posts, and `ben-002` is still EXCLUDED at 0.00 — the gate the
    // engine applied survives to the ledger, which is the fact AV7-E2 defeated.
    await (
      await callerFor(SUBMITTER_FIN, 'av7e2-exec')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });
    const lines = await lineItems(created.distributionId);
    console.log('AV7-E2 CONTROL', {
      committed: lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`),
    });
    expect(lines.find((l) => l.beneficiaryId === 'ben-002')?.status).toBe('EXCLUDED');
    expect(String(lines.find((l) => l.beneficiaryId === 'ben-002')?.amountSar)).toBe('0');
  });

  it('AV7-E3 · the RUNTIME role (qmulate_app) is refused the same write — the grading case', async () => {
    // ⚠ THE ATTACKER CLASS IS THE POINT. AV7-E used the OWNER connection. This one uses
    // `basePrisma()` — `DATABASE_URL`, the same role the API process itself holds — so before the
    // fix the substitution needed no DBA: any raw-SQL seam inside the app reached it. The trigger is
    // `ENABLE ALWAYS`, so it binds this role exactly as it binds the owner.
    const created = await (
      await callerFor(CROSS_FIN, 'av7e3-create')
    ).distribution.create({ waqfId: WAQF, ...PAID.e3 });
    const submitted = await (
      await callerFor(CROSS_FIN, 'av7e3-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7e3-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const app = await basePrisma();
    let appWriteError: unknown;
    try {
      await app.$executeRawUnsafe(
        `UPDATE "distribution"
            SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,entitledSar}', '"777777.00"')
          WHERE "id" = $1`,
        created.distributionId,
      );
    } catch (error) {
      appWriteError = error;
    }

    console.log('AV7-E3 RESULT', {
      appRoleTraceWriteRefused: appWriteError !== undefined,
      appRoleError:
        appWriteError === undefined
          ? null
          : shapeOf(appWriteError).message.replace(/\s+/g, ' ').slice(0, 300),
    });
    expect(appWriteError).toBeDefined();
    expect(String(shapeOf(appWriteError).message)).toMatch(/"computationTrace" is WRITE-ONCE/);

    // NOT-A-SEAL CONTROL: the runtime role must still be able to move the columns it legitimately
    // owns on a live run, or the app could not post at all. Proved by executing through the router
    // (which UPDATEs `status`, `approvalRequestId`, `executedAt` on this row) rather than by a raw
    // statement, so the control exercises the real path.
    const posted = await (
      await callerFor(CROSS_FIN, 'av7e3-exec')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });
    const lines = await lineItems(created.distributionId);
    console.log('AV7-E3 CONTROL', {
      posted: posted.lineItemIds.length,
      committed: lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`),
      runStatus: (await readRun(created.distributionId))?.status,
    });
    expect(lines.map((l) => String(l.amountSar))).toEqual(['137500', '0', '137500']);
    expect((await readRun(created.distributionId))?.status).toBe('EXECUTED');
  });

  it('AV7-E4 · with the DATABASE seal SUSPENDED, the PROCEDURE refuses the substituted lines', async () => {
    // ⚠ THIS IS THE MUTATION TEST FOR LAYER 2, AND IT IS WHY THE FIX IS NOT ONE LAYER. Migration
    // 22 §1's trigger covers UPDATE and not INSERT, so a fabricated run row inserted by the runtime
    // role would never meet it. Suspending the trigger for exactly two prefix-scoped statements
    // reproduces that class without hand-building a whole fake run and approval, and shows that
    // `authorisedLines` refuses on its own.
    const created = await (
      await callerFor(FIN_ONLY, 'av7e4-create')
    ).distribution.create({ waqfId: WAQF, ...PAID.e4 });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7e4-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7e4-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    // Substitute `lines[0].entitledSar` with L1 suspended. `trace.input` is UNTOUCHED, so the
    // replay still reproduces the approved digest — which is exactly why the discriminator is
    // "the stored copy disagrees with the replay" and not "the digest moved".
    await withTraceSealSuspended(
      created.distributionId,
      `SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,entitledSar}', '"999999.00"')`,
    );
    expect(await traceLineAmount(created.distributionId, 0)).toBe('999999.00');

    let execError: unknown;
    try {
      await (
        await callerFor(FIN_ONLY, 'av7e4-exec')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      });
    } catch (error) {
      execError = error;
    }
    const lines = await lineItems(created.distributionId);
    console.log('AV7-E4 RESULT', {
      sealSuspended: true,
      traceLine0: await traceLineAmount(created.distributionId, 0),
      executeRefused: execError !== undefined,
      executeError: execError === undefined ? null : shapeOf(execError).message.slice(0, 400),
      committedLines: lines.length,
      runStatus: (await readRun(created.distributionId))?.status,
    });
    expect(execError).toBeDefined();
    // `GATE_NOT_CLEARED` crosses tRPC as FORBIDDEN — the same code every other rung of this ladder
    // uses, deliberately: a caller must not be able to tell "no approval" from "wrong endowment"
    // from "substituted artifact" by status code, because the endowment-disclosure rules apply here.
    expect(shapeOf(execError).code).toBe('FORBIDDEN');
    expect(String(shapeOf(execError).message)).toMatch(
      /DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*STORED_LINES_DISAGREE_WITH_REPLAY/,
    );
    // NOTHING WAS WRITTEN — the ladder refuses before the transaction opens.
    expect(lines.length).toBe(0);
    expect((await readRun(created.distributionId))?.status).toBe('PENDING_APPROVAL');

    // ── POSITIVE CONTROL: restore the artifact and the SAME approval posts ────────────────────
    await withTraceSealSuspended(
      created.distributionId,
      `SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,entitledSar}', '"137500.00"')`,
    );
    const posted = await (
      await callerFor(FIN_ONLY, 'av7e4-exec-ok')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });
    console.log('AV7-E4 CONTROL', {
      posted: posted.lineItemIds.length,
      committed: (await lineItems(created.distributionId)).map(
        (l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`,
      ),
    });
    expect(posted.lineItemIds.length).toBe(3);
  });

  it('AV7-E5 · with the seal SUSPENDED, a substituted INPUT is caught by the RE-DERIVED digest', async () => {
    // The other half of layer 2. Editing `trace.input` moves the bytes the digest is a function of,
    // so the replay produces a different hash than the one step 7 matched to the approval. Before
    // `authorisedLines`, nothing ever re-derived it: the register's words were *"nothing
    // re-derives the digest from the trace"*.
    const created = await (
      await callerFor(FIN_ONLY, 'av7e5-create')
    ).distribution.create({ waqfId: WAQF, ...februaryPeriod(2) });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7e5-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7e5-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    // ONE HALALA on the input's operating cost. The smallest possible move, so nothing about the
    // refusal can be attributed to a malformed blob.
    //
    // ⚠ NOT `revenue.incomeMinor`, AND THE REASON IS A MEASUREMENT. Moving that alone makes the
    // ENGINE refuse (`incomeMinor` must equal Σ of the INCOME receipts — its own two-sided input
    // check), so the replay throws and the discriminator becomes `STORED_RUN_UNREPLAYABLE`. That is
    // also fail-closed and also correct, but it would test a different clause than the one named in
    // this test's title. `operatingCostMinor` is valid input at any non-negative value, so the
    // replay COMPUTES and the refusal can only come from the re-derived digest.
    const before = await readRun(created.distributionId);
    await withTraceSealSuspended(
      created.distributionId,
      `SET "computationTrace" = jsonb_set(
             "computationTrace", '{input,operatingCostMinor}',
             to_jsonb((("computationTrace" #>> '{input,operatingCostMinor}')::bigint + 1)::text))`,
    );

    let execError: unknown;
    try {
      await (
        await callerFor(FIN_ONLY, 'av7e5-exec')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      });
    } catch (error) {
      execError = error;
    }
    const lines = await lineItems(created.distributionId);
    console.log('AV7-E5 RESULT', {
      runDigestUnchanged: (await readRun(created.distributionId))?.runDigest === before?.runDigest,
      executeRefused: execError !== undefined,
      executeError: execError === undefined ? null : shapeOf(execError).message.slice(0, 400),
      committedLines: lines.length,
    });
    expect(execError).toBeDefined();
    expect(String(shapeOf(execError).message)).toMatch(
      /DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*STORED_RUN_DIGEST_NOT_REPRODUCIBLE/,
    );
    expect(lines.length).toBe(0);
  });

  it('AV7-E6 · a moved `distributableSar` — the pool no guard seals — is caught by the Σ belt', async () => {
    // ⚠ REACHABLE WITHOUT SUSPENDING ANYTHING, and that is the finding. `distributableSar` is not
    // write-once (migration 21's `TODO(surface)` is about `runDigest`/`engineVersion`, and
    // AV7-AUD-F4 is about them plus `distribution_line_item."amountSar"`; the pool column is in
    // neither). It is also OUTSIDE the digest — a `Decimal` column is not inside
    // `canonicalizeResult`'s bytes — so step 7 cannot see it. Before the belt, moving it left the
    // run claiming a pool it never paid: `distribution.get` said one figure for ever and
    // `distribution.lines` said another.
    const created = await (
      await callerFor(FIN_ONLY, 'av7e6-create')
    ).distribution.create({ waqfId: WAQF, ...PAID.e6 });
    const submitted = await (
      await callerFor(FIN_ONLY, 'av7e6-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    await (
      await callerFor(NAZIR_B, 'av7e6-approve')
    ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });

    const app = await basePrisma();
    let poolWriteError: unknown;
    try {
      await app.$executeRawUnsafe(
        `UPDATE "distribution" SET "distributableSar" = 999999.00 WHERE "id" = $1`,
        created.distributionId,
      );
    } catch (error) {
      poolWriteError = error;
    }

    let execError: unknown;
    try {
      await (
        await callerFor(FIN_ONLY, 'av7e6-exec')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: submitted.approvalRequestId,
      });
    } catch (error) {
      execError = error;
    }
    const lines = await lineItems(created.distributionId);
    console.log('AV7-E6 RESULT', {
      poolWriteRefused: poolWriteError !== undefined,
      poolNow: String((await readRun(created.distributionId))?.distributableSar),
      executeRefused: execError !== undefined,
      executeError: execError === undefined ? null : shapeOf(execError).message.slice(0, 400),
      committedLines: lines.length,
    });
    // The column really is unsealed — recorded, not asserted away. If a later migration seals it,
    // this branch flips and the test says so instead of silently passing for a new reason.
    if (poolWriteError === undefined) {
      expect(execError).toBeDefined();
      expect(String(shapeOf(execError).message)).toMatch(
        /DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*LINE_TOTAL_IS_NOT_THE_DISTRIBUTABLE/,
      );
      expect(String(shapeOf(execError).message)).toMatch(/999999\.00/);
      expect(lines.length).toBe(0);
    } else {
      expect(String(shapeOf(poolWriteError).message)).toMatch(/42501/);
    }

    // POSITIVE CONTROL: restore the pool and the same approval posts the approved amounts.
    await app.$executeRawUnsafe(
      `UPDATE "distribution" SET "distributableSar" = 275000.00 WHERE "id" = $1`,
      created.distributionId,
    );
    const posted = await (
      await callerFor(FIN_ONLY, 'av7e6-exec-ok')
    ).distribution.execute({
      waqfId: WAQF,
      distributionId: created.distributionId,
      approvalRequestId: submitted.approvalRequestId,
    });
    console.log('AV7-E6 CONTROL', {
      posted: posted.lineItemIds.length,
      committed: (await lineItems(created.distributionId)).map(
        (l) => `${l.beneficiaryId}=${String(l.amountSar)}`,
      ),
    });
    expect(posted.lineItemIds.length).toBe(3);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-G · CROSS-ENDOWMENT AUTHORITY — can waqf-002's Nazir authorise waqf-001's payment?
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-G · an approval raised and approved on waqf-002, aimed at a waqf-001 run', async () => {
    const created = await (
      await callerFor(CROSS_FIN, 'av7g-create')
    ).distribution.create({ waqfId: WAQF, ...period(28) });
    await (
      await callerFor(CROSS_FIN, 'av7g-submit')
    ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });

    const run = await readRun(created.distributionId);
    // A DISTRIBUTION_RUN approval on the OTHER endowment, naming THIS run as its subject. The
    // one-open-per-subject index is keyed on (waqfId, type, subjectId), so this is a free slot.
    const foreign = await (
      await callerFor(CROSS_FIN, 'av7g-mint')
    ).approval.initiate({
      waqfId: OTHER_WAQF,
      type: 'DISTRIBUTION_RUN',
      subjectId: created.distributionId,
      payload: {
        kind: 'distribution.run',
        distributionId: created.distributionId,
        waqfId: WAQF,
        engineVersion: String(run?.engineVersion),
        runDigest: String(run?.runDigest),
      },
    });
    const decided = await (
      await callerFor(NAZIR_W2, 'av7g-approve')
    ).approval.approve({ waqfId: OTHER_WAQF, approvalRequestId: foreign.approvalRequestId });

    let execError: unknown;
    try {
      await (
        await callerFor(CROSS_FIN, 'av7g-exec')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: created.distributionId,
        approvalRequestId: foreign.approvalRequestId,
      });
    } catch (error) {
      execError = error;
    }
    const lines = await lineItems(created.distributionId);
    console.log('AV7-G RESULT', {
      foreignApprovalApproved: decided.status,
      foreignCheckerId: decided.checkerId,
      executeRefused: execError !== undefined,
      executeError: execError === undefined ? null : shapeOf(execError).message.slice(0, 320),
      committedLines: lines.length,
      runStatus: (await readRun(created.distributionId))?.status,
    });
    expect(lines.length).toBe(0);
  });

  it('AV7-H · the remedy `submit` names — "recompute the period" — is unreachable', async () => {
    // `submit` refuses a run whose `engineVersion` is not this build and tells the operator to
    // recompute, "leaving the old run to be cancelled". There is NO cancel procedure, `distribution`
    // refuses DELETE, and migration 21's unique index covers every status except CANCELLED. So the
    // period is WEDGED: it can never be recomputed and therefore never paid.
    const created = await (
      await callerFor(FIN_ONLY, 'av7h-create')
    ).distribution.create({ waqfId: WAQF, ...period(30) });

    const owner = await privilegedPrisma();
    await owner.$executeRawUnsafe(
      `UPDATE "distribution" SET "engineVersion" = 'e6-distribution/3.0.0' WHERE "id" = $1`,
      created.distributionId,
    );

    let submitError: unknown;
    try {
      await (
        await callerFor(FIN_ONLY, 'av7h-submit')
      ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
    } catch (error) {
      submitError = error;
    }

    // The advertised remedy.
    let recomputeError: unknown;
    try {
      await (
        await callerFor(FIN_ONLY, 'av7h-recompute')
      ).distribution.create({ waqfId: WAQF, ...period(30) });
    } catch (error) {
      recomputeError = error;
    }

    // Is there any procedure that can retire the wedged run?
    const cancelVerbs = Object.keys(
      (appRouter._def.procedures as Record<string, unknown>) ?? {},
    ).filter((name) => /distribution\.(cancel|void|delete|discard)/i.test(name));

    console.log('AV7-H RESULT', {
      submitRefused: submitError !== undefined,
      submitReason: submitError === undefined ? null : shapeOf(submitError).cause,
      recomputeRefused: recomputeError !== undefined,
      recomputeError:
        recomputeError === undefined
          ? null
          : shapeOf(recomputeError).message.replace(/\s+/g, ' ').slice(0, 220),
      cancelProceduresAvailable: cancelVerbs,
      wedgedRunStatus: (await readRun(created.distributionId))?.status,
    });
    expect(submitError).toBeDefined();
    expect(cancelVerbs).toEqual([]);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AV7-F · THE STEP-UP ASSERTION — stale, and re-spent.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AV7-F · a stale assertion is refused; ONE assertion approves MANY requests', async () => {
    const runA = await (
      await callerFor(FIN_ONLY, 'av7f-create-a')
    ).distribution.create({ waqfId: WAQF, ...period(23) });
    const subA = await (
      await callerFor(FIN_ONLY, 'av7f-submit-a')
    ).distribution.submit({ waqfId: WAQF, distributionId: runA.distributionId });
    const runB = await (
      await callerFor(FIN_ONLY, 'av7f-create-b')
    ).distribution.create({ waqfId: WAQF, ...period(24) });
    const subB = await (
      await callerFor(FIN_ONLY, 'av7f-submit-b')
    ).distribution.submit({ waqfId: WAQF, distributionId: runB.distributionId });

    // (a) an assertion far outside any sane window
    const stale = new Date(NOW.getTime() - 30 * 24 * 3600 * 1000);
    let staleError: unknown;
    try {
      await (
        await callerFor(NAZIR_B, 'av7f-stale', stale)
      ).approval.approve({ waqfId: WAQF, approvalRequestId: subA.approvalRequestId });
    } catch (error) {
      staleError = error;
    }

    // (b) ONE assertion instant, used to approve TWO separate money-moving requests
    const oneAssertion = new Date(NOW.getTime() - 60 * 1000);
    const first = await (
      await callerFor(NAZIR_B, 'av7f-reuse-1', oneAssertion)
    ).approval.approve({ waqfId: WAQF, approvalRequestId: subA.approvalRequestId });
    const second = await (
      await callerFor(NAZIR_B, 'av7f-reuse-2', oneAssertion)
    ).approval.approve({ waqfId: WAQF, approvalRequestId: subB.approvalRequestId });

    console.log('AV7-F RESULT', {
      staleRefused: staleError !== undefined,
      staleError: staleError === undefined ? null : shapeOf(staleError),
      oneAssertionApprovedBoth: first.status === 'APPROVED' && second.status === 'APPROVED',
      assertionInstant: oneAssertion.toISOString(),
    });

    expect(staleError).toBeDefined();
    expect(shapeOf(staleError).cause).toBe('TOTP_STEP_UP_REQUIRED');
    expect(first.status).toBe('APPROVED');
    expect(second.status).toBe('APPROVED');
  });
});
