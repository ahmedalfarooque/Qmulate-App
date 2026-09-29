/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E6/S7 · V-6, RELEASE GATE G-3, ON THE DISTRIBUTION RUN ITSELF:
 *
 *     **A MAKER CANNOT APPROVE THEIR OWN DISTRIBUTION RUN.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ THE VACUOUS VERSION OF THIS SUITE, WRITTEN DOWN SO IT IS NOT WRITTEN BY ACCIDENT ───────
 * The presets already make a Nazir structurally unable to be the maker here:
 * `distribution:run:write` and `distribution:run:initiate` sit in `finance` (and `initiate` also in
 * `authorized_rep`/`case_manager`) and in **neither case** in `nazir` — `access.ts` says so in a
 * comment: *"never write/initiate: the Nazir is the checker on money movement and must never be the
 * maker."* And `approval:request:approve` sits in `nazir` and in no other preset. So a suite proving
 * "a finance seat cannot approve a run" would be **GREEN WITH SEGREGATION OF DUTIES DELETED**, because
 * the ROLE SPLIT alone would carry it. That is not the property §10 §4.2 is about, and it is included
 * below only as a labelled contrast.
 *
 * The property is **one human holding BOTH grants on one endowment** — AC-4's case, which a real
 * Nazarah engagement produces on day one because the firm is small and the same person assembles the
 * distribution and is the appointed Nazir. For that caller a role-shaped check PASSES and only an
 * IDENTITY check fails. So the red test is that caller, on the REAL procedures
 * (`distribution.create` → `distribution.submit` → `approval.approve`), and every assertion is chosen
 * to prove the identity check is what is carrying it.
 *
 * ── ⚠ WHY THIS SUBJECT CANNOT BE SEEDED, AND WHY THIS SUITE IS API-LEVEL ─────────────────────────
 * `waqf_access_grant_permission_guard` refuses `approve`/`sign` on any role but `NAZIR`, so a FINANCE
 * grant cannot be widened into an approver by any write — the database enforces the split. The only
 * construction is TWO GRANTS FOR ONE USER on one endowment, which `provisionTestSubjects` can build
 * and which no procedure can. E2E has no grant-issuing procedure by design, so a browser-level version
 * of this property is not merely inconvenient, it is unconstructible; it lives here.
 *
 * ── ⚠ EACH RUN IN THIS FILE HAS ITS OWN PERIOD, AND THAT WAS ONLY HALF TRUE ────────────────────
 * Migration 21's partial unique index `distribution_one_live_run_per_period` covers
 * `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'`, and
 * the seeded `dist-001` already holds `waqf-001` / `2026-01-01 … 2026-03-31`. Every period below
 * therefore started on a distinct day in the first week of January — chosen, in this file's own
 * former words, *"so the LEDGER WINDOW's contents are identical for all of them"*.
 *
 * ⚠ THAT SENTENCE WAS THE BREACH, WRITTEN DOWN AS A DESIGN PRINCIPLE. Identical ledger contents
 * means every window held `rev-001` — the ONE income receipt `waqf-001` has in the whole fixture —
 * inside a quarter `dist-001` had ALREADY PAID. Distinct triples, one receipt, run after run. That
 * is AV7-F2 (SAR 820,000.00 recorded as owed against SAR 410,000.00 of ghallah), and
 * `distribution_paid_periods_disjoint` (migration 26) refuses it. MEASURED: this file went 3 of its
 * tests red the moment the constraint landed, and all three were TRUE POSITIVES.
 *
 * ── WHAT CHANGED, AND WHY IT IS SMALLER THAN IT LOOKS ───────────────────────────────────────────
 * The constraint compares `EXECUTED` rows with `EXECUTED` rows ONLY, and just THREE runs in this
 * file ever reach `EXECUTED` — `g3d-happy`, `g3d-twice` and `g3d-trace`. Those three now take
 * ALLOCATED, pairwise-disjoint windows from `paidPeriod('distribution-maker-checker', n)` and book
 * their own income with {@link bookIncome}, which also verifies the window holds nothing else.
 *
 * Every OTHER run here is created, submitted, and then deliberately REFUSED at `execute` (wrong
 * approval type, wrong subject, a substituted digest, a maker approving himself). Those never
 * become `EXECUTED`, so overlapping windows are not merely tolerated for them — they are CORRECT:
 * two overlapping runs that have not paid are two COMPUTATIONS, which is exactly the positive
 * control migration 26's predicate is written around. They keep their `period(startDay)` windows,
 * and the unique index still gives each a distinct triple.
 *
 * ⚠ THE WATERFALL IS UNCHANGED AND THE FIGURES DID NOT MOVE. On `waqf-001` the maintenance reserve
 * is a deed-stipulated flat SAR 40,000.00 and the Nazir fee is 10% of revenue, and
 * `resolveOperatingCost()` sums `OPERATIONS` expenses only — so booking SAR 350,000.00 into an
 * allocated window yields 350,000 − 40,000 − 0 − 35,000 = **275,000.00**, the same distributable
 * and the same three lines the seeded quarter produced. Nothing in the assertions below was
 * rewritten to fit the new windows.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  bookIncome,
  paidPeriod,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
  warnNoDatabase,
  type TestSubjectSpec,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('the distribution maker-checker suite (E6/S7 · V-6, release gate G-3)');

const createCaller = createCallerFactory(appRouter);

const WAQF = 'waqf-001';

/** One fixed instant: it is also the TOTP assertion instant, so the step-up window is satisfied. */
const NOW = new Date('2026-08-18T09:00:00.000Z');

/**
 * AC-4's case, and the ONLY subject that can prove this suite's headline: one human who legitimately
 * holds the FINANCE seat and the NAZIR seat on the SAME endowment.
 */
const MAKER_AND_NAZIR = `${API_TEST_PREFIX}dist-maker-and-nazir`;
/** A distinct Nazir on the same endowment — the second authority that makes an approval possible. */
const SECOND_NAZIR = `${API_TEST_PREFIX}dist-second-nazir`;
/** A plain finance seat: may compute and submit a run, may never approve one. */
const FINANCE_ONLY = `${API_TEST_PREFIX}dist-finance-only`;

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

function subjects(): TestSubjectSpec[] {
  return [
    // ⚠ TWO grants for one user, on the SAME endowment. That is the premise, not a mistake.
    { id: MAKER_AND_NAZIR, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS },
    { id: MAKER_AND_NAZIR, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
    { id: SECOND_NAZIR, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
    { id: FINANCE_ONLY, role: 'FINANCE', waqfIds: [WAQF], permissions: FINANCE_PERMISSIONS },
  ];
}

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId, now: NOW }));

/**
 * A period nobody else in this file uses. See the header: the start day varies, the ledger window's
 * CONTENTS do not, so every run here computes the identical waterfall.
 */
const period = (startDay: number) => ({
  periodStart: `2026-01-${String(startDay).padStart(2, '0')}`,
  periodEnd: '2026-03-31',
});

/**
 * A FEBRUARY start day, for the one test the S7 adversarial close-out added — January 5…14 are all
 * spoken for in this file and days 1…4 and 15…31 belong to the four sibling suites, while
 * `distribution_one_live_run_per_period` is unique on the exact triple.
 *
 * ⚠ THE WATERFALL IS UNCHANGED, MEASURED FROM THE FIXTURE. waqf-001's only rows inside any of these
 * windows are `exp-e-001` (MAINTENANCE 40,000.00, 2026-02-10), `rev-005` (CAPITAL 4,200,000.00,
 * 2026-02-17) and `rev-001` (INCOME 350,000.00, 2026-03-31); a start day of 1…10 February keeps all
 * three inside, so the run still computes SAR 275,000.00 distributable and the same three lines.
 */
/**
 * The THREE windows whose runs actually reach `EXECUTED`, and therefore the only three the
 * period-overlap constraint can see. Allocated rather than hand-picked — see the header.
 *
 * ⚠ `februaryPeriod()` USED TO LIVE HERE and is gone. It existed because *"January 5…14 are all
 * spoken for in this file and days 1…4 and 15…31 belong to the four sibling suites"* — i.e. five
 * files were rationing start days inside ONE already-paid quarter. That is the accounting the
 * allocator replaces.
 */
const PAID = {
  happy: paidPeriod('distribution-maker-checker', 1),
  twice: paidPeriod('distribution-maker-checker', 2),
  trace: paidPeriod('distribution-maker-checker', 3),
} as const;

/** Compute, persist and submit one run as `who`. Returns the ids the assertions need. */
async function raiseRun(
  who: string,
  label: string,
  startDay: number | { readonly periodStart: string; readonly periodEnd: string },
): Promise<{ readonly distributionId: string; readonly approvalRequestId: string }> {
  const maker = await callerFor(who, `${label}-create`);
  const window = typeof startDay === 'number' ? period(startDay) : startDay;
  const created = await maker.distribution.create({ waqfId: WAQF, ...window });
  const submitted = await (
    await callerFor(who, `${label}-submit`)
  ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
  return {
    distributionId: created.distributionId,
    approvalRequestId: submitted.approvalRequestId,
  };
}

async function readApproval(id: string) {
  const prisma = await basePrisma();
  return prisma.approvalRequest.findUnique({
    where: { id },
    select: { id: true, status: true, type: true, makerId: true, checkerId: true, subjectId: true },
  });
}

async function readRun(id: string) {
  const prisma = await basePrisma();
  return prisma.distribution.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      approvalRequestId: true,
      engineVersion: true,
      runDigest: true,
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.runIf(hasDatabase)('distribution · maker-checker on the run (G-3)', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects(subjects());
    // An allocated window starts EMPTY by construction — that is the point, since it cannot inherit
    // `rev-001`. Each paying run therefore needs its own pool, booked through the real procedure.
    for (const [tag, period] of Object.entries(PAID)) {
      await bookIncome({ waqfId: WAQF, period, tag: `g3d-${tag}` });
    }
  });

  afterAll(async () => {
    // ⚠ HARD DELETE, IN TEARDOWN ONLY, AS THE MIGRATOR. Both tables carry a retention DELETE guard
    // that refuses every role including the migrator, and soft-deleting is NOT sufficient:
    // `@qmulate/database`'s seed suite pins ABSOLUTE counts (`Distribution: 1`,
    // `DistributionLineItem: 2`) with no `deletedAt` filter, so a left-behind run turns that suite red
    // on the SECOND consecutive pass over one cluster. The guards are suspended for exactly these two
    // prefix-scoped statements and restored inside the same atomic `DO` block.
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
   * THE HEADLINE — AC-4, on the real procedures
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('a maker cannot approve their own distribution run', () => {
    it('holds BOTH seats on this endowment — the premise, asserted rather than assumed', async () => {
      // If this ever stops being true, the headline test below silently becomes a role-split test and
      // passes for the wrong reason. Asserted first, and separately, so the failure names itself.
      const ctx = await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'g3d-premise', now: NOW });
      const roles = ctx.grants
        .filter((grant: { waqfId: string }) => grant.waqfId === WAQF)
        .map((grant: { role: string }) => grant.role)
        .sort();
      expect(roles).toEqual(['FINANCE', 'NAZIR']);
    });

    it('the ROLE SPLIT is real too — and it is NOT the property above', async () => {
      // Stated so the contrast is explicit: `nazir` holds neither `distribution:run:write` nor
      // `distribution:run:initiate`, so a Nazir-only seat cannot even raise a run. That is a good
      // property and it is not segregation of duties — it would hold with the identity check deleted.
      const { ROLE_PRESETS } = await import('../src/index.js');
      const nazir = ROLE_PRESETS.nazir as readonly string[];
      expect(nazir).not.toContain('distribution:run:write');
      expect(nazir).not.toContain('distribution:run:initiate');
      expect(nazir).toContain('approval:request:approve');
      const finance = ROLE_PRESETS.finance as readonly string[];
      expect(finance).toContain('distribution:run:write');
      expect(finance).not.toContain('approval:request:approve');
    });

    it('⚠ THE RED TEST · the maker is refused, by IDENTITY, before any state change', async () => {
      const raised = await raiseRun(MAKER_AND_NAZIR, 'g3d-self', 5);

      // The premise of the refusal: the run really is awaiting a decision, and the maker really is
      // this identity. Without these two, "it was refused" could be about the wrong thing.
      expect((await readRun(raised.distributionId))?.status).toBe('PENDING_APPROVAL');
      const openApproval = await readApproval(raised.approvalRequestId);
      expect(openApproval?.type).toBe('DISTRIBUTION_RUN');
      expect(openApproval?.status).toBe('PENDING');
      expect(openApproval?.makerId).toBe(MAKER_AND_NAZIR);
      // ⚠ THE SUBJECT BIND: the approval names THIS run, which is what
      // `qmulate_distribution_authority` compares against `NEW."id"`.
      expect(openApproval?.subjectId).toBe(raised.distributionId);

      const beforeApprove = await countAuditEvents({
        action: 'APPROVE',
        entityId: raised.approvalRequestId,
      });

      let thrown: unknown;
      try {
        await (
          await callerFor(MAKER_AND_NAZIR, 'g3d-self-approve')
        ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });
      } catch (error) {
        thrown = error;
      }

      // ⚠ ASSERT THE GUARD'S OWN NAME, never a bare rejection: a refusal is only evidence when it
      // carries the reason, and a typo in the input would also "throw".
      expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
      expect((thrown as { cause?: { code?: string } }).cause?.code).toBe('SEGREGATION_OF_DUTIES');
      expect((thrown as { cause?: { messageKey?: string } }).cause?.messageKey).toBe(
        'errors.access.SEGREGATION_OF_DUTIES',
      );
      expect(String((thrown as { message?: string }).message)).toContain('SEGREGATION_OF_DUTIES');

      // ── BEFORE ANY STATE CHANGE (§10 §4.2) — not merely "the end state is unchanged" ─────
      const row = await readApproval(raised.approvalRequestId);
      expect(row?.status).toBe('PENDING');
      expect(row?.checkerId).toBeNull();
      const run = await readRun(raised.distributionId);
      expect(run?.status).toBe('PENDING_APPROVAL');
      expect(run?.approvalRequestId).toBeNull();
      expect(
        await countAuditEvents({ action: 'APPROVE', entityId: raised.approvalRequestId }),
      ).toBe(beforeApprove);

      // ── AND THE REFUSAL IS BY IDENTITY, NOT BY ROLE ─────────────────────────────────────
      // `resolveApprover` step 3 (maker ≠ checker) runs BEFORE step 4's NAZIR-grant lookup, so this
      // caller is refused even though they ARE the Nazir on this endowment. The proof that the NAZIR
      // authority is genuinely present is the positive control below, where the SAME identity approves
      // somebody else's run: if the refusal were about the role, that would fail too.
      expect(
        (thrown as { cause?: { code?: string } }).cause?.code,
        'a role-shaped refusal would be PERMISSION_DENIED (step 4), not SEGREGATION_OF_DUTIES (step 3)',
      ).not.toBe('PERMISSION_DENIED');

      // ── POSITIVE CONTROL 2 · and no line item was written, then or after ────────────────
      const prisma = await basePrisma();
      expect(
        await prisma.distributionLineItem.count({
          where: { distributionId: raised.distributionId },
        }),
      ).toBe(0);
      // The half that makes the refusal mean something: `execute` must ALSO refuse, because the
      // approval never became APPROVED. Without this, a broken `execute` could post anyway.
      await expect(
        (await callerFor(MAKER_AND_NAZIR, 'g3d-self-execute')).distribution.execute({
          waqfId: WAQF,
          distributionId: raised.distributionId,
          approvalRequestId: raised.approvalRequestId,
        }),
      ).rejects.toThrow(/DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*APPROVAL_NOT_USABLE/);
      expect(
        await prisma.distributionLineItem.count({
          where: { distributionId: raised.distributionId },
        }),
      ).toBe(0);
      expect((await readRun(raised.distributionId))?.status).toBe('PENDING_APPROVAL');
    });

    it('POSITIVE CONTROL 1 · the SAME caller CAN approve a run raised by someone else', async () => {
      // This is what makes the refusal above about WHO INITIATED rather than about who is asking, and
      // it is what proves the NAZIR authority was present all along. Without it, "approval always
      // fails for this subject" would satisfy the red test.
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-other', 6);
      await expect(
        (await callerFor(MAKER_AND_NAZIR, 'g3d-other-approve')).approval.approve({
          waqfId: WAQF,
          approvalRequestId: raised.approvalRequestId,
        }),
      ).resolves.toMatchObject({ status: 'APPROVED', checkerId: MAKER_AND_NAZIR });
    });

    it('a FINANCE-only seat cannot approve at all — the role split, which is NOT the property above', async () => {
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-finance', 7);
      let thrown: unknown;
      try {
        await (
          await callerFor(FINANCE_ONLY, 'g3d-finance-approve')
        ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });
      } catch (error) {
        thrown = error;
      }
      // ⚠ AND THE CODE IS DIFFERENT, WHICH IS THE WHOLE POINT OF SEPARATING THE TWO TESTS. This seat
      // never reaches the identity comparison: it is refused by the SCOPE guard for lacking the
      // permission at all. A suite that asserted only "it throws" could not tell these apart, and
      // would report the role split as if it were segregation of duties.
      expect((thrown as { cause?: { code?: string } }).cause?.code).toBe('PERMISSION_DENIED');
      expect((thrown as { cause?: { code?: string } }).cause?.code).not.toBe(
        'SEGREGATION_OF_DUTIES',
      );
      expect((await readApproval(raised.approvalRequestId))?.checkerId).toBeNull();
    });
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * POSITIVE CONTROL 3 — the whole path, end to end, with two people
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  describe('create → submit → approve → execute, with a genuine second authority', () => {
    it('posts the lines and records BOTH identities', async () => {
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-happy', PAID.happy);

      await (
        await callerFor(SECOND_NAZIR, 'g3d-happy-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });

      const posted = await (
        await callerFor(FINANCE_ONLY, 'g3d-happy-execute')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: raised.distributionId,
        approvalRequestId: raised.approvalRequestId,
      });

      expect(posted.makerId).toBe(FINANCE_ONLY);
      expect(posted.checkerId).toBe(SECOND_NAZIR);
      expect(posted.makerId).not.toBe(posted.checkerId);
      expect(posted.status).toBe('EXECUTED');
      expect(posted.lineItemIds).toHaveLength(3);

      const run = await readRun(raised.distributionId);
      expect(run?.status).toBe('EXECUTED');
      expect(run?.approvalRequestId).toBe(raised.approvalRequestId);
      expect(run?.engineVersion).toBe('e6-distribution/4.0.0');
      // The approval is SPENT, not left standing as a second live authority — a non-terminal status
      // would keep the one-open-per-subject slot occupied.
      expect((await readApproval(raised.approvalRequestId))?.status).toBe('EXECUTED');
    });

    it('one approval cannot be spent twice', async () => {
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-twice', PAID.twice);
      await (
        await callerFor(SECOND_NAZIR, 'g3d-twice-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });
      await (
        await callerFor(FINANCE_ONLY, 'g3d-twice-exec')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: raised.distributionId,
        approvalRequestId: raised.approvalRequestId,
      });

      await expect(
        (await callerFor(FINANCE_ONLY, 'g3d-twice-exec2')).distribution.execute({
          waqfId: WAQF,
          distributionId: raised.distributionId,
          approvalRequestId: raised.approvalRequestId,
        }),
      ).rejects.toThrow(/DISTRIBUTION_RUN_STATE_REFUSED/);

      const prisma = await basePrisma();
      // Three lines, not six: the second attempt wrote nothing.
      expect(
        await prisma.distributionLineItem.count({
          where: { distributionId: raised.distributionId },
        }),
      ).toBe(3);
    });

    it('an approval raised for another ACT cannot be spent on a run — the TYPE is checked first', async () => {
      // An approval whose `payloadHash` still matches its OWN payload passes every downstream check,
      // so the type is the only thing that catches it. Postgres would also raise 42501 at COMMIT
      // (`qmulate_distribution_authority` demands `DISTRIBUTION_RUN`), but refusing here means nothing
      // is written and rolled back — and the caller gets a sentence instead of a SQLSTATE.
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-wrongtype', 10);
      const other = await (
        await callerFor(FINANCE_ONLY, 'g3d-wrongtype-mint')
      ).approval.initiate({
        waqfId: WAQF,
        type: 'GOVT_FILING',
        subjectId: `filing:${API_TEST_PREFIX}g3d-wrongtype`,
        payload: { kind: 'test.govt-filing', waqfId: WAQF },
      });
      await (
        await callerFor(SECOND_NAZIR, 'g3d-wrongtype-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: other.approvalRequestId });

      await expect(
        (await callerFor(FINANCE_ONLY, 'g3d-wrongtype-exec')).distribution.execute({
          waqfId: WAQF,
          distributionId: raised.distributionId,
          approvalRequestId: other.approvalRequestId,
        }),
      ).rejects.toThrow(/WRONG_APPROVAL_TYPE[\s\S]*GOVT_FILING/);

      const prisma = await basePrisma();
      expect(
        await prisma.distributionLineItem.count({
          where: { distributionId: raised.distributionId },
        }),
      ).toBe(0);
      expect((await readRun(raised.distributionId))?.status).toBe('PENDING_APPROVAL');
    });

    it('an approval bound to ANOTHER run cannot post this one — the SUBJECT is checked', async () => {
      // Two live runs, each with its own approval; the approval for run B is approved and then aimed
      // at run A. `subjectId` is what makes an approval an approval of SOMETHING.
      const runA = await raiseRun(FINANCE_ONLY, 'g3d-subject-a', 11);
      const runB = await raiseRun(FINANCE_ONLY, 'g3d-subject-b', 12);
      await (
        await callerFor(SECOND_NAZIR, 'g3d-subject-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: runB.approvalRequestId });

      await expect(
        (await callerFor(FINANCE_ONLY, 'g3d-subject-exec')).distribution.execute({
          waqfId: WAQF,
          distributionId: runA.distributionId,
          approvalRequestId: runB.approvalRequestId,
        }),
      ).rejects.toThrow(/WRONG_SUBJECT/);

      const prisma = await basePrisma();
      expect(
        await prisma.distributionLineItem.count({ where: { distributionId: runA.distributionId } }),
      ).toBe(0);
      expect(
        await prisma.distributionLineItem.count({ where: { distributionId: runB.distributionId } }),
      ).toBe(0);
    });

    it('⚠ a run computed by ANOTHER engine build cannot be submitted for approval', async () => {
      // The engine version is a BYTE inside the digest, and register item #13 records that a v3 run
      // and a v4 run of one register are not comparable (memo Q5 changed amounts, Q7 turned a
      // computing run into a refusal). So a stored run whose build is not this build is refused at
      // `submit` rather than being minted into an approval nobody can reproduce.
      //
      // ⚠ THIS IS ENGINEERING'S FAIL-SAFE READING, and the router says so. The alternative — submit it
      // and let the digest speak — is a product call. The refusal is reversible: recompute the period.
      const maker = await callerFor(FINANCE_ONLY, 'g3d-stale-create');
      const created = await maker.distribution.create({ waqfId: WAQF, ...period(14) });

      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "engineVersion" = $1 WHERE "id" = $2`,
        'e6-distribution/3.0.0',
        created.distributionId,
      );

      await expect(
        (await callerFor(FINANCE_ONLY, 'g3d-stale-submit')).distribution.submit({
          waqfId: WAQF,
          distributionId: created.distributionId,
        }),
      ).rejects.toThrow(/DISTRIBUTION_RUN_STATE_REFUSED[\s\S]*e6-distribution\/3\.0\.0/);

      // Nothing moved: no approval was minted and the run is still COMPUTED.
      const base = await basePrisma();
      expect(
        await base.approvalRequest.count({
          where: { subjectId: created.distributionId, deletedAt: null },
        }),
      ).toBe(0);
      expect((await readRun(created.distributionId))?.status).toBe('COMPUTED');
    });

    it('⚠ a substituted runDigest voids the approval instead of executing', async () => {
      // Neither `engineVersion` nor `runDigest` is write-once at the database (measured: the status
      // trigger fires only when the STATUS changes — migration 21's own `TODO(surface)`, still owed
      // and tracked as AV7-AUD-F4), so the artifact comparison in `execute` is the only thing
      // standing between an approved digest and a substituted one. The substitution is performed
      // with raw SQL as the migrator, i.e. the strongest attacker this harness has.
      //
      // ⚠ THIS TEST WAS MEASURING THE GUARD ON THE ONE FIELD THAT WAS ALREADY PROTECTED, and the
      // V-S7 adversarial register said so in those words. `runDigest` is a COLUMN and step 7 compares
      // it; the money came from `computationTrace`, a Json nothing on that ladder touched. So the
      // substitution below was caught and the one that mattered was never tried. The companion case
      // is now the test underneath this one — read them as a pair.
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-digest', 13);
      await (
        await callerFor(SECOND_NAZIR, 'g3d-digest-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });

      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `UPDATE "distribution" SET "runDigest" = $1 WHERE "id" = $2`,
        'f'.repeat(64),
        raised.distributionId,
      );

      await expect(
        (await callerFor(FINANCE_ONLY, 'g3d-digest-exec')).distribution.execute({
          waqfId: WAQF,
          distributionId: raised.distributionId,
          approvalRequestId: raised.approvalRequestId,
        }),
      ).rejects.toThrow(/ARTIFACT_DIGEST_MISMATCH/);

      const base = await basePrisma();
      expect(
        await base.distributionLineItem.count({ where: { distributionId: raised.distributionId } }),
      ).toBe(0);
      expect((await readRun(raised.distributionId))?.status).toBe('PENDING_APPROVAL');
    });

    it('⚠ …and the substitution the test above never tried: the LINES, inside computationTrace', async () => {
      // THE GAP THE PAIR ABOVE LEFT, closed and pinned. `execute` used to write the line items from
      // `readStoredLines(run.computationTrace)` — a Json the digest comparison never touched — so
      // moving one line's amount after a real Nazir approved the run posted it. MEASURED before the
      // fix (AV7-E): paid lines of SAR 1,137,499.00 against a `distributableSar` of SAR 275,000.00,
      // `runDigest` unchanged, the approval still verifying against its own payload, run EXECUTED.
      //
      // Two layers now refuse it, and this test asserts the FIRST one by its own sentence:
      // migration 22 §1 makes `computationTrace` write-once, so the substitution never reaches
      // `execute` at all. The second layer (`authorisedLines` re-deriving the digest from the stored
      // input) is mutation-tested in `av7-approval-identity.integration.test.ts` AV7-E4/E5, with this
      // trigger deliberately suspended — because a two-layer claim measured through one layer is one
      // layer.
      const raised = await raiseRun(FINANCE_ONLY, 'g3d-trace', PAID.trace);
      await (
        await callerFor(SECOND_NAZIR, 'g3d-trace-approve')
      ).approval.approve({ waqfId: WAQF, approvalRequestId: raised.approvalRequestId });

      const prisma = await privilegedPrisma();
      let traceError: unknown;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "distribution"
              SET "computationTrace" = jsonb_set("computationTrace", '{lines,0,entitledSar}', '"999999.00"')
            WHERE "id" = $1`,
          raised.distributionId,
        );
      } catch (error) {
        traceError = error;
      }

      // The guard's OWN words, and the SQLSTATE beside them. Asserting on a bare rejection would be
      // satisfied by a mistyped column name, which is how two vacuous negatives were nearly banked
      // in this repository (V-S7 register, E5 baseline).
      expect(traceError).toBeDefined();
      expect(String((traceError as { message?: string }).message)).toMatch(
        /"computationTrace" is WRITE-ONCE/,
      );
      expect(String((traceError as { message?: string }).message)).toMatch(/42501/);

      // POSITIVE CONTROL, SAME RUN AND SAME APPROVAL: the legitimate post still succeeds and pays
      // the approved figures. A seal that also stopped the payment would be a broken run, not a fix.
      const posted = await (
        await callerFor(FINANCE_ONLY, 'g3d-trace-exec')
      ).distribution.execute({
        waqfId: WAQF,
        distributionId: raised.distributionId,
        approvalRequestId: raised.approvalRequestId,
      });
      expect(posted.lineItemIds.length).toBe(3);

      const base = await basePrisma();
      const lines = await base.distributionLineItem.findMany({
        where: { distributionId: raised.distributionId },
        select: { beneficiaryId: true, status: true, amountSar: true },
        orderBy: { beneficiaryId: 'asc' },
      });
      expect(lines.map((l) => `${l.beneficiaryId}=${String(l.amountSar)}:${l.status}`)).toEqual([
        'ben-001=137500:PAID',
        'ben-002=0:EXCLUDED',
        'ben-003=137500:WITHHELD',
      ]);
      expect((await readRun(raised.distributionId))?.status).toBe('EXECUTED');
    });
  });
});
