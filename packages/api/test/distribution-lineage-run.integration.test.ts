/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * M1-b · V-1's LINEAGE HALF — THE DEFAULT DEED SHAPE, WIRED AND COMPUTING (Milestone 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * The S7 close-out refused to claim Milestone 1 for one reason, stated five times: `waqf-005` is
 * the fixture's only `LINEAGE_CONTINUATION` deed and every wired use of it is a HALTING case, so
 * no wired run over the DEFAULT deed shape (ADR-0009 R4 — lineage continuation is the normal
 * rule; `ORDERED` is the opt-in exception) had ever COMPUTED. This file is the missing sibling:
 * a full lifecycle (preview → create → submit → approval.approve → execute) on **`waqf-007`**,
 * the seeded lineage endowment whose deed is recorded COMPLETE, paying real amounts over the
 * fixture's own receipt.
 *
 * ── WHAT THE SUBJECT PROVES, LINE BY LINE ───────────────────────────────────────────────────
 *   · ben-701 (living son of the waqif)        → PAID, per capita over the living frontier;
 *   · ben-702 (living daughter of the waqif)   → PAID — under `ZUHUR_ONLY` the continuation rule
 *     tests the ancestors BETWEEN a member and the waqif, of which she has none; a daughter is a
 *     beneficiary in her own right even where her children's lines do not continue;
 *   · ben-703 (living son of the LIVING ben-701) → EXCLUDED `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`
 *     — R-FRONTIER's temporary hold, the register-#12 sentence, on the wire for the first time;
 *   · ben-704 (living son of the LIVING daughter ben-702) → EXCLUDED `BUTUN_LINE_NOT_CONTINUED`.
 *     ben-704 is blocked BOTH ways (a line the deed does not continue AND a living ancestor),
 *     and the engine reports the line break over the hold. ✓ That precedence is RATIFIED — the
 *     OWNER'S ruling since 2026-08-25 (memo, S8 addendum FOURTH batch, "Register #12": verbatim
 *     "Ratify permanent-over-temporary") — the permanent reason outranks the temporary one so a
 *     statement never says "wait for your mother to die" to someone whose line never continues
 *     under this deed. *(This block read "ENGINEERING'S CALL … NOT ratified" from M1-b until that
 *     ruling; ben-704's expected code below now rests on the memo entry, not on a TODO.)*
 *
 * ── ⚠ THE HELD-ANCESTOR EXCLUSION IS TEMPORARY IN SHAPE, AND THIS FILE ASSERTS THE SHAPE ────
 * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` reverses on the blocking ancestor's death and nothing may
 * cache or persist it as durable (R-FRONTIER). Asserted three ways: `preview` is a QUERY and
 * writes nothing; the ONLY persisted artifact of the verdict is the executed run's own line row
 * (`blockedReason` — a fact about THIS period's run, beside its period columns, never a
 * beneficiary attribute); and the `beneficiary` table itself carries NO verdict-shaped column
 * (asserted from information_schema — the schema's standing rule that entitlement verdicts are
 * never persisted as columns, Q-E4-1's premise).
 *
 * ── ⚠ ONE WINDOW, AND IT IS THE FIXTURE'S OWN (unlike the ORDERED sibling's three) ──────────
 * `waqf-007` has NO seeded distribution, so Q1-2026 — the quarter holding `rev-006`, its one
 * income receipt — is free for the whole lifecycle. That is deliberate and it is the stronger
 * statement: the run below computes over the SEEDED ledger, not over a pool this suite booked
 * for itself, so the milestone evidence is about the fixture the way V-1's corpus proof is.
 * (The ORDERED sibling needed an allocated window because `dist-001` had already paid its
 * quarter; nothing has ever paid waqf-007's.)
 *
 * ── WHAT THIS FILE DOES **NOT** RE-PROVE ────────────────────────────────────────────────────
 * The corpus wall (V-1's rev-005 proof on `waqf-001`), V-6, V-7 and G-1 are claimed on the
 * ORDERED sibling (`distribution-run.integration.test.ts`) and are NOT re-proven here — waqf-007
 * carries no capital receipt, so a corpus assertion on this run would be vacuous (the R6-C1
 * lesson: a wall proven over a set with nothing to leak proves scoping, not the wall). What IS
 * asserted is the negative control that says so: `capitalReceiptsSar` is '0.00' and no
 * CAPITAL_RECEIPTS_EXCLUDED flag is raised, so nobody can quote this run as a corpus proof.
 *
 * ── HARNESS FACTS (same as the sibling) ─────────────────────────────────────────────────────
 * Integration mode is `singleFork`, the database is SHARED with `@qmulate/database`'s suite and
 * its ABSOLUTE row-count pins, so every run and line item created here is HARD-DELETED in
 * `afterAll` with the two retention guards suspended for exactly those prefix-scoped statements,
 * inside one atomic `DO` block. No `rowHash` literal is pinned (the chain is not byte-reproducible
 * across seeds — measured in the database suite).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
  warnNoDatabase,
  type TestSubjectSpec,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('the lineage distribution run suite (M1-b — V-1 lineage half, Milestone 1)');

const createCaller = createCallerFactory(appRouter);

/** The computing lineage sibling (M1-b). Its halting counterpart is `waqf-005`, asserted below. */
const WAQF = 'waqf-007';
/** The intake-state lineage deed — the SAME entitlement order, refused for incompleteness. */
const HALTING_WAQF = 'waqf-005';

/** One fixed instant, same discipline (and value) as the ORDERED sibling: `asOf`, timing and the
 *  digest are deterministic, and the TOTP step-up window is satisfied by construction. */
const NOW = new Date('2026-08-18T09:00:00.000Z');

/**
 * Q1-2026 — the quarter the SEEDED `rev-006` (rent, 400,000.00, 2026-03-31) falls in. waqf-007
 * has no seeded distribution, so the same window carries the preview AND the executed lifecycle;
 * see the header for why computing over the fixture's own receipt is the point.
 */
const PERIOD = { periodStart: '2026-01-01', periodEnd: '2026-03-31' } as const;

const RUN_MAKER = `${API_TEST_PREFIX}lineage-run-maker`;
const RUN_CHECKER = `${API_TEST_PREFIX}lineage-run-checker`;

/** The `finance` preset's distribution verbs — identical to the ORDERED sibling's list. */
const FINANCE_PERMISSIONS = [
  'finance:transaction:read',
  'finance:transaction:write',
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
    // TWO endowments for the maker: waqf-007 for the computing run, waqf-005 for the contrast.
    {
      id: RUN_MAKER,
      role: 'FINANCE',
      waqfIds: [WAQF, HALTING_WAQF],
      permissions: FINANCE_PERMISSIONS,
    },
    { id: RUN_CHECKER, role: 'NAZIR', waqfIds: [WAQF], permissions: NAZIR_PERMISSIONS },
  ];
}

const callerFor = async (userId: string, requestId: string) =>
  createCaller(await contextFor({ userId, requestId, now: NOW }));

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.runIf(hasDatabase)(
  'distribution · the LINEAGE run lifecycle (M1-b, V-1 lineage half)',
  () => {
    /** Filled by the lifecycle test and read by the tests after it. */
    let posted: {
      distributionId: string;
      approvalRequestId: string;
      makerId: string;
      checkerId: string | null;
      lineItemIds: readonly string[];
    } | null = null;

    beforeAll(async () => {
      await assertSeeded();
      await provisionTestSubjects(subjects());
    });

    afterAll(async () => {
      // Same teardown contract as the ORDERED sibling, same paragraph of reasons (see its header):
      // retention guards refuse DELETE for every role, soft-delete would poison the database suite's
      // absolute pins on the second pass, so the guards are suspended for exactly these prefix-scoped
      // statements and re-armed ENABLE ALWAYS inside ONE atomic DO block.
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
     * 0 · The premises, asserted rather than assumed
     * ─────────────────────────────────────────────────────────────────────────────────────── */

    describe('the premises this suite rests on', () => {
      it('waqf-007 is the LINEAGE_CONTINUATION / ZUHUR_ONLY deed whose مآل clause IS read', async () => {
        const prisma = await basePrisma();
        const waqf = await prisma.waqf.findUniqueOrThrow({
          where: { id: WAQF },
          select: {
            type: true,
            classification: true,
            entitlementOrder: true,
            continuationStipulation: true,
            fiscalYearEnd: true,
            reversionClauseCaptured: true,
            reversionKind: true,
            reversionRecordedAt: true,
          },
        });
        expect(waqf.type).toBe('FAMILY_DHURRI');
        expect(waqf.classification).toBe('SMALL');
        // ⚠ THE DEFAULT DEED SHAPE — the one the S7 close-out said had never computed on the wire.
        expect(waqf.entitlementOrder).toBe('LINEAGE_CONTINUATION');
        expect(waqf.continuationStipulation).toBe('ZUHUR_ONLY');
        expect(waqf.fiscalYearEnd).toBe('12-31');
        // ⚠ THE REVERSION IS RECORDED AS EXPLICITLY ABSENT, NOT NULL-BY-OMISSION (R7-c): the clause
        // was READ (captured, on a recorded day) and the deed positively names no ultimate taker
        // (kind null) — and there are ZERO taker rows to contradict that. This is the trio that
        // separates this deed from waqf-005, where nobody has looked.
        expect(waqf.reversionClauseCaptured).toBe(true);
        expect(waqf.reversionKind).toBeNull();
        expect(waqf.reversionRecordedAt).not.toBeNull();
        expect(await prisma.waqfReversionTaker.count({ where: { waqfId: WAQF } })).toBe(0);
      });

      it('the four-member tree carries the edges R6 demands, all living, equal weights', async () => {
        const prisma = await basePrisma();
        const members = await prisma.beneficiary.findMany({
          where: { waqfId: WAQF },
          select: {
            id: true,
            kind: true,
            active: true,
            tabaqa: true,
            parentId: true,
            lineageLink: true,
            stipulatedWeight: true,
            verificationStatus: true,
          },
          orderBy: { id: 'asc' },
        });
        expect(members.map((m) => [m.id, m.parentId, m.lineageLink, m.tabaqa, m.active])).toEqual([
          ['ben-701', null, 'SON', 1, true],
          ['ben-702', null, 'DAUGHTER', 1, true],
          ['ben-703', 'ben-701', 'SON', 2, true],
          ['ben-704', 'ben-702', 'SON', 2, true],
        ]);
        // Equal weights on purpose: per capita then changes nothing, so the run below raises no
        // STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA flag and the milestone evidence reads clean.
        expect(members.every((m) => m.stipulatedWeight?.equals(25) === true)).toBe(true);
        expect(members.every((m) => m.kind === 'FAMILY')).toBe(true);
        expect(members.every((m) => m.verificationStatus === 'VERIFIED')).toBe(true);
      });

      it('rev-006 is the one income receipt, in-period, on the dedicated account', async () => {
        const prisma = await basePrisma();
        const receipt = await prisma.transaction.findUniqueOrThrow({
          where: { id: 'rev-006' },
          select: { waqfId: true, type: true, receiptClass: true, amountSar: true, date: true },
        });
        expect(receipt.waqfId).toBe(WAQF);
        expect(receipt.type).toBe('REVENUE');
        expect(receipt.receiptClass).toBe('INCOME');
        expect(receipt.amountSar.toString()).toBe('400000');
        expect(receipt.date.toISOString()).toBe('2026-03-31T00:00:00.000Z');
        // …and it is the ONLY ledger row on this endowment, so no figure below can drift by a row.
        expect(await prisma.transaction.count({ where: { waqfId: WAQF } })).toBe(1);
      });

      it('the beneficiary table persists NO verdict-shaped column (the exclusion cannot be cached)', async () => {
        // R-FRONTIER's data rule, asserted at the schema: `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is
        // TEMPORARY, so no column on `beneficiary` may store an entitlement verdict for it to go
        // stale in. (Q-E4-1's premise — "the schema forbids persisting entitlement verdicts as
        // columns" — as an information_schema probe rather than folklore.)
        const prisma = await privilegedPrisma();
        const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'beneficiary'`,
        );
        const suspicious = columns
          .map((c) => c.column_name)
          .filter((name) => /entitl|exclusi|verdict|eligib/i.test(name));
        expect(suspicious).toEqual([]);
      });
    });

    /* ───────────────────────────────────────────────────────────────────────────────────────────
     * 1 · The contrast: the SAME query computes here and refuses on waqf-005
     * ─────────────────────────────────────────────────────────────────────────────────────── */

    describe('the halting counterpart stays halting', () => {
      it('waqf-005 still refuses REVERSION_CLAUSE_UNREAD — this file did not repair it', async () => {
        // The M1-b brief's hard rule: the sibling is ADDED, never made by un-halting waqf-005,
        // whose intake state is itself a load-bearing subject. Assert the premise from the DB
        // first, so this test cannot pass vacuously.
        const prisma = await basePrisma();
        const intake = await prisma.waqf.findUniqueOrThrow({
          where: { id: HALTING_WAQF },
          select: { reversionClauseCaptured: true, entitlementOrder: true },
        });
        expect(intake.reversionClauseCaptured).toBe(false);
        expect(intake.entitlementOrder).toBe('LINEAGE_CONTINUATION');

        const caller = await callerFor(RUN_MAKER, 'm1b-contrast');
        const answer = await caller.distribution.preview({ waqfId: HALTING_WAQF, ...PERIOD });
        expect(answer.status).toBe('refused');
        if (answer.status !== 'refused') throw new Error('unreachable — narrowing for TypeScript');
        expect(answer.code).toBe('SHART_INCOMPLETE');
        expect(answer.refusal).toBe('REVERSION_CLAUSE_UNREAD');
        expect(answer.refusalSource).toBe('mapper');
      });
    });

    /* ───────────────────────────────────────────────────────────────────────────────────────────
     * 2 · V-1 (lineage half) · preview — the frontier, both exclusions, the waterfall
     * ─────────────────────────────────────────────────────────────────────────────────────── */

    describe('preview computes the DEFAULT deed shape over the seeded ledger', () => {
      it('the whole run, figure by figure', async () => {
        const caller = await callerFor(RUN_MAKER, 'm1b-preview');
        const answer = await caller.distribution.preview({ waqfId: WAQF, ...PERIOD });

        expect(answer.status).toBe('computed');
        if (answer.status !== 'computed') throw new Error('unreachable — narrowing for TypeScript');
        const run = answer.run;

        // ── THE WATERFALL, ṢIYĀNA FIRST — the deed's own 10% / 10% on the seeded 400,000 ─────
        expect(run.waterfall).toEqual({
          revenueSar: '400000.00',
          // ⚠ ZERO, and that is the declared negative control: this run proves the LINEAGE half of
          // V-1 and must never be quoted as a corpus proof — waqf-007 has nothing to leak, which is
          // exactly why the corpus wall stays claimed on waqf-001's run (rev-005) alone.
          capitalReceiptsSar: '0.00',
          maintenanceReserveSar: '40000.00',
          operatingSar: '0.00',
          netIncomeSar: '360000.00',
          nazirFeeSar: '40000.00',
          nazirFeeBasis: 'PERCENT_OF_REVENUE',
          distributableSar: '320000.00',
        });
        expect(run.flags).not.toContain('CAPITAL_RECEIPTS_EXCLUDED');

        // ── THE ORDER, FROM THE TRACE'S OWN `seq` ────────────────────────────────────────────
        const waterfallCodes = run.computationTrace
          .filter((entry) => entry.stage === 'WATERFALL')
          .sort((a, b) => a.seq - b.seq)
          .map((entry) => entry.code);
        expect(waterfallCodes.indexOf('MAINTENANCE_RESERVE')).toBeGreaterThan(-1);
        expect(waterfallCodes.indexOf('MAINTENANCE_RESERVE')).toBeLessThan(
          waterfallCodes.indexOf('NAZIR_FEE'),
        );
        const reserveStep = run.computationTrace.find(
          (entry) => entry.code === 'MAINTENANCE_RESERVE',
        );
        expect(reserveStep?.data?.['step']).toBe('1');
        expect(reserveStep?.data?.['reserveAuthority']).toBe('SHART_AL_WAQIF');

        // ── THE LINES — the frontier pays two heads, and both wired exclusions appear ────────
        expect(run.entitlementRule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
        expect(
          run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledSar]),
        ).toEqual([
          ['ben-701', 'PAID', '160000.00'],
          // A daughter of the waqif is entitled in her own right under ZUHUR_ONLY — the
          // continuation rule tests the ancestors BETWEEN her and the waqif (none).
          ['ben-702', 'PAID', '160000.00'],
          // ⚠ Held behind his LIVING father — R-FRONTIER's temporary exclusion, on the wire.
          ['ben-703', 'EXCLUDED', '0.00'],
          // ✓ A son of a LIVING daughter: dual-blocked, and the PERMANENT reason (the line this
          // deed does not continue) is reported over the temporary hold — OWNER-RATIFIED
          // 2026-08-25 (memo, fourth batch, "Register #12"). See the file header.
          ['ben-704', 'EXCLUDED', '0.00'],
        ]);
        expect(run.lines.map((line) => line.sharePercent)).toEqual([
          '50.000000',
          '50.000000',
          '0.000000',
          '0.000000',
        ]);
        expect(run.lines.map((line) => line.reasonCode)).toEqual([
          null,
          null,
          'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
          'BUTUN_LINE_NOT_CONTINUED',
        ]);
        expect(run.lines.every((line) => line.gateFlags.length === 0)).toBe(true);

        // ── THE BASIS — the lineage path CONSUMED the deed term (contrast the ORDERED run,
        //    where basis.continuationStipulation is null and a NOT_APPLIED flag is raised) ─────
        expect(run.lines.every((line) => line.basis.rule === 'LINEAGE_PER_CAPITA_ZUHUR_ONLY')).toBe(
          true,
        );
        expect(run.lines.every((line) => line.basis.continuationStipulation === 'ZUHUR_ONLY')).toBe(
          true,
        );
        expect(run.flags).not.toContain('CONTINUATION_STIPULATION_NOT_APPLIED');
        expect(run.lines.map((line) => [line.basis.lineageDepth, line.basis.parentId])).toEqual([
          [1, null],
          [1, null],
          [2, 'ben-701'],
          [2, 'ben-702'],
        ]);

        // ── THE TRACE NAMES THE BLOCKING ANCESTOR, PER EXCLUSION — what a beneficiary disputing
        //    "your father holds this" is entitled to be told ─────────────────────────────────
        const exclusions = run.computationTrace
          .filter((entry) => entry.code === 'BENEFICIARY_EXCLUDED')
          .map((entry) => [
            entry.data?.['beneficiaryId'],
            entry.data?.['reasonCode'],
            entry.data?.['blockingAncestorId'],
          ]);
        expect(exclusions).toEqual([
          ['ben-703', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR', 'ben-701'],
          ['ben-704', 'BUTUN_LINE_NOT_CONTINUED', 'ben-702'],
        ]);

        // ── EQUAL WEIGHTS ⇒ PER CAPITA OVERRODE NOTHING, so no honesty flag is owed ──────────
        expect(run.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');

        // ── TOTALS, AND THE CLOSING IDENTITY AS AN IDENTITY ──────────────────────────────────
        expect(run.totals).toEqual({
          paidSar: '320000.00',
          withheldSar: '0.00',
          crossBorderSar: '0.00',
          retainedSar: '0.00',
          entitledSar: '320000.00',
          excludedCount: 2,
          entitledLineCount: 2,
          residualSar: '0.00',
        });
        const halalas = (decimal: string): bigint => BigInt(decimal.replace('.', ''));
        expect(
          halalas(run.waterfall.maintenanceReserveSar) +
            halalas(run.waterfall.operatingSar) +
            halalas(run.waterfall.nazirFeeSar) +
            halalas(run.totals.paidSar) +
            halalas(run.totals.withheldSar) +
            halalas(run.totals.crossBorderSar) +
            halalas(run.totals.retainedSar),
        ).toBe(halalas(run.waterfall.revenueSar));

        // ── WHAT THE ENGINE CHECKED — the lineage run's own invariant set, incl. I-L1 ────────
        expect(run.invariantsChecked).toEqual([
          'I1',
          'I2',
          'I3',
          'I4',
          'I5',
          'I6',
          'I7',
          'I9',
          'I-C1',
          'I-L1',
        ]);
        expect(run.engineVersion).toBe('e6-distribution/4.0.0');
        expect(run.runDigest).toMatch(/^[0-9a-f]{64}$/);

        // ── ⚠ EVERY FIGURE IS UNVERIFIED, AND THE RUN SAYS SO (binding rule 3) ───────────────
        expect(run.flags).toContain('UNVERIFIED_FIGURES_APPLIED');
        expect(run.unverifiedNotes).toEqual(['⚠ unverified — confirm vs primary law']);
      });

      it('preview is a QUERY and writes nothing — the temporary exclusion is not persisted', async () => {
        const prisma = await basePrisma();
        const before = await prisma.distribution.count({ where: { waqfId: WAQF } });
        const caller = await callerFor(RUN_MAKER, 'm1b-preview-pure');
        const answer = await caller.distribution.preview({ waqfId: WAQF, ...PERIOD });
        expect(answer.status).toBe('computed');
        expect(await prisma.distribution.count({ where: { waqfId: WAQF } })).toBe(before);
        expect(
          await prisma.distributionLineItem.count({ where: { beneficiaryId: 'ben-703' } }),
        ).toBe(0);
      });

      it('two previews of one input give one digest (the artifact a Nazir signs is stable)', async () => {
        const caller = await callerFor(RUN_MAKER, 'm1b-preview-digest');
        const first = await caller.distribution.preview({ waqfId: WAQF, ...PERIOD });
        const second = await caller.distribution.preview({ waqfId: WAQF, ...PERIOD });
        if (first.status !== 'computed' || second.status !== 'computed') {
          throw new Error('both previews must compute');
        }
        expect(second.run.runDigest).toBe(first.run.runDigest);
      });
    });

    /* ───────────────────────────────────────────────────────────────────────────────────────────
     * 3 · The lifecycle — compute → review → sign → execute, on the DEFAULT deed shape
     * ─────────────────────────────────────────────────────────────────────────────────────── */

    describe('create → submit → approval.approve → execute', () => {
      it('posts four line items only after a genuine second authority', async () => {
        const created = await (
          await callerFor(RUN_MAKER, 'm1b-create')
        ).distribution.create({ waqfId: WAQF, ...PERIOD });
        expect(created.status).toBe('COMPUTED');
        expect(created.lineItemsWritten).toBe(false);
        expect(created.run.waterfall.distributableSar).toBe('320000.00');

        const prisma = await basePrisma();
        const stored = await prisma.distribution.findUniqueOrThrow({
          where: { id: created.distributionId },
          select: {
            waqfId: true,
            status: true,
            periodStart: true,
            periodEnd: true,
            periodStartHijri: true,
            periodEndHijri: true,
            grossRevenueSar: true,
            reserveSar: true,
            operatingSar: true,
            nazirFeeSar: true,
            distributableSar: true,
            engineVersion: true,
            runDigest: true,
            approvalRequestId: true,
            createdBy: true,
          },
        });
        expect(stored.waqfId).toBe(WAQF);
        expect(stored.status).toBe('COMPUTED');
        expect(stored.grossRevenueSar.toString()).toBe('400000');
        expect(stored.reserveSar.toString()).toBe('40000');
        expect(stored.operatingSar.toString()).toBe('0');
        expect(stored.nazirFeeSar.toString()).toBe('40000');
        expect(stored.distributableSar.toString()).toBe('320000');
        expect(stored.engineVersion).toBe('e6-distribution/4.0.0');
        expect(stored.runDigest).toBe(created.run.runDigest);
        expect(stored.approvalRequestId).toBeNull();
        expect(stored.createdBy).toBe(RUN_MAKER);
        // The dual date, FROZEN at write time. Both Hijri halves come from the repo's own
        // `toHijriSnapshot()` (Umm al-Qura) and stay as literals — the property under test is that
        // the stored pair never recomputes on read (see the ORDERED sibling's paragraph).
        expect(stored.periodStart.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(stored.periodEnd.toISOString()).toBe('2026-03-31T00:00:00.000Z');
        expect(stored.periodStartHijri).toBe('1447-07-12');
        expect(stored.periodEndHijri).toBe('1447-10-12');

        // ── SUBMIT · mints the DISTRIBUTION_RUN approval over the digest ─────────────────────
        const submitted = await (
          await callerFor(RUN_MAKER, 'm1b-submit')
        ).distribution.submit({ waqfId: WAQF, distributionId: created.distributionId });
        expect(submitted.status).toBe('PENDING_APPROVAL');
        expect(submitted.approvalStatus).toBe('PENDING');
        expect(submitted.lineItemsWritten).toBe(false);

        const approval = await prisma.approvalRequest.findUniqueOrThrow({
          where: { id: submitted.approvalRequestId },
          select: {
            type: true,
            status: true,
            makerId: true,
            checkerId: true,
            subjectId: true,
            payloadHash: true,
            payload: true,
          },
        });
        expect(approval.type).toBe('DISTRIBUTION_RUN');
        expect(approval.status).toBe('PENDING');
        expect(approval.makerId).toBe(RUN_MAKER);
        expect(approval.checkerId).toBeNull();
        expect(approval.subjectId).toBe(created.distributionId);
        expect(approval.payloadHash).toMatch(/^[0-9a-f]{64}$/);
        const payload = approval.payload as Record<string, unknown>;
        expect(payload['engineVersion']).toBe('e6-distribution/4.0.0');
        expect(payload['runDigest']).toBe(created.run.runDigest);
        expect(payload['distributableSar']).toBe('320000.00');

        // ── the maker may NOT post before the checker has decided ────────────────────────────
        await expect(
          (await callerFor(RUN_MAKER, 'm1b-early-execute')).distribution.execute({
            waqfId: WAQF,
            distributionId: created.distributionId,
            approvalRequestId: submitted.approvalRequestId,
          }),
        ).rejects.toThrow(/DISTRIBUTION_RUN_NOT_AUTHORISED[\s\S]*APPROVAL_NOT_USABLE/);
        expect(
          await prisma.distributionLineItem.count({
            where: { distributionId: created.distributionId },
          }),
        ).toBe(0);

        // ── APPROVE · the checker rung — the SIGN step of the milestone's lifecycle ──────────
        const decided = await (
          await callerFor(RUN_CHECKER, 'm1b-approve')
        ).approval.approve({ waqfId: WAQF, approvalRequestId: submitted.approvalRequestId });
        expect(decided.status).toBe('APPROVED');
        expect(decided.checkerId).toBe(RUN_CHECKER);

        // ── EXECUTE · the lines ──────────────────────────────────────────────────────────────
        const result = await (
          await callerFor(RUN_MAKER, 'm1b-execute')
        ).distribution.execute({
          waqfId: WAQF,
          distributionId: created.distributionId,
          approvalRequestId: submitted.approvalRequestId,
        });
        expect(result.status).toBe('EXECUTED');
        expect(result.makerId).toBe(RUN_MAKER);
        expect(result.checkerId).toBe(RUN_CHECKER);
        expect(result.makerId).not.toBe(result.checkerId);
        expect(result.lineItemIds).toHaveLength(4);
        posted = {
          distributionId: created.distributionId,
          approvalRequestId: submitted.approvalRequestId,
          makerId: result.makerId,
          checkerId: result.checkerId,
          lineItemIds: result.lineItemIds,
        };

        // ── the persisted lines: the verdicts of THIS run, on THIS run's row — the only place
        //    the temporary exclusion is ever written down ─────────────────────────────────────
        const lines = await prisma.distributionLineItem.findMany({
          where: { distributionId: created.distributionId },
          select: {
            waqfId: true,
            beneficiaryId: true,
            status: true,
            sharePercent: true,
            amountSar: true,
            blockedReason: true,
            createdBy: true,
          },
          orderBy: { beneficiaryId: 'asc' },
        });
        expect(
          lines.map((line) => [
            line.beneficiaryId,
            line.status,
            line.amountSar.toString(),
            line.sharePercent.toString(),
            line.blockedReason,
          ]),
        ).toEqual([
          ['ben-701', 'PAID', '160000', '50', null],
          ['ben-702', 'PAID', '160000', '50', null],
          // ⚠ TEMPORARY in shape: this row records the verdict OF THIS PERIOD'S RUN. The period
          // after ben-701's death, a fresh run computes a fresh verdict — nothing here is read
          // back into eligibility, and the beneficiary row itself carries no verdict column
          // (asserted in the premises).
          ['ben-703', 'EXCLUDED', '0', '0', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'],
          // ✓ Rung-2-over-rung-3 precedence, owner-ratified 2026-08-25 — see the file header.
          ['ben-704', 'EXCLUDED', '0', '0', 'BUTUN_LINE_NOT_CONTINUED'],
        ]);
        expect(lines.every((line) => line.waqfId === stored.waqfId)).toBe(true);
        expect(lines.every((line) => line.createdBy === RUN_MAKER)).toBe(true);

        // ── terminal states ──────────────────────────────────────────────────────────────────
        const finalRun = await prisma.distribution.findUniqueOrThrow({
          where: { id: created.distributionId },
          select: {
            status: true,
            approvalRequestId: true,
            executedAt: true,
            executedAtHijri: true,
          },
        });
        expect(finalRun.status).toBe('EXECUTED');
        expect(finalRun.approvalRequestId).toBe(submitted.approvalRequestId);
        expect(finalRun.executedAt?.toISOString()).toBe(NOW.toISOString());
        expect(finalRun.executedAtHijri).toBe('1448-03-05');
        expect(
          (
            await prisma.approvalRequest.findUniqueOrThrow({
              where: { id: submitted.approvalRequestId },
              select: { status: true },
            })
          ).status,
        ).toBe('EXECUTED');
      });

      it('one approval cannot be spent twice', async () => {
        if (posted === null) throw new Error('the lifecycle test must run first');
        await expect(
          (await callerFor(RUN_MAKER, 'm1b-spend-twice')).distribution.execute({
            waqfId: WAQF,
            distributionId: posted.distributionId,
            approvalRequestId: posted.approvalRequestId,
          }),
        ).rejects.toThrow(/DISTRIBUTION_RUN_STATE_REFUSED/);
        const prisma = await basePrisma();
        expect(
          await prisma.distributionLineItem.count({
            where: { distributionId: posted.distributionId },
          }),
        ).toBe(4);
      });

      it('`lines` reads the posted lines back at SIX decimals and 2-dp money', async () => {
        if (posted === null) throw new Error('the lifecycle test must run first');
        const rows = await (
          await callerFor(RUN_MAKER, 'm1b-lines')
        ).distribution.lines({ waqfId: WAQF, distributionId: posted.distributionId });
        expect(rows.map((row) => [row.beneficiaryId, row.sharePercent, row.amountSar])).toEqual([
          ['ben-701', '50.000000', '160000.00'],
          ['ben-702', '50.000000', '160000.00'],
          ['ben-703', '0.000000', '0.00'],
          ['ben-704', '0.000000', '0.00'],
        ]);
      });
    });
  },
);
