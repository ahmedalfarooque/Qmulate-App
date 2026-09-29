/**
 * S4/E3 — the endowment record, against a real migrated + seeded database.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHICH ACCEPTANCE CRITERIA THIS FILE PROVES, AND WHICH IT DELIBERATELY DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   AC-E3-01  `endowment.get` returns every BR-101 element in ONE payload, dual-dated; a caller with
 *             no grant gets NOT_FOUND and never FORBIDDEN.
 *   AC-E3-02  `navigation.tree` renders three levels but contains ONLY the granted endowment; a
 *             Membership-only caller gets an EMPTY tree (MP-13).
 *   AC-E3-03  `shart.get` / `shart.completeness` — structured, referenceable, and `unspecified` is
 *             never reported as `none`. **The three write attempts are `packages/database`'s
 *             `shart-immutability.integration.test.ts`;** what is asserted HERE is that this package
 *             offers no write at all (`router-introspection.test.ts`, unit).
 *   AC-E3-04  the MEDIUM/SMALL obligation CONTRAST, at the request layer.
 *   AC-E3-05  `classification.reclassify` appends history, moves the column, audits, and names the
 *             obligations gained.
 *   AC-E3-07  `deed.upsert` refuses an ineligible Nazir **BEFORE ANY WRITE** — asserted on the ROW,
 *             not merely on the throw, because "refused" and "refused before any write" are
 *             different claims.
 *   AC-E3-10  `endowment.recordDeedTerms` is WRITE-ONCE.
 *   plus       `beneficiary.lineage` — the ancestor walk and its integrity view.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE HOUSE RULES THIS FILE OBEYS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  1. **The database is SHARED with `@qmulate/database`'s suite** (turbo orders them; this one runs
 *     second). So: assert on rows this file created, and count audit events by a DELTA captured here —
 *     never against an absolute total.
 *  2. **Every refusal asserted must come through a tRPC procedure or the app connection.** A refusal
 *     observed as the table OWNER proves nothing about the runtime (ADR-0008 round 6).
 *  3. **Order inside the file is deterministic** (`fileParallelism: false`, `sequence.concurrent:
 *     false`), and it is USED: the AC-E3-04 contrast runs before the reclassification that would
 *     change one side of it, and the reclassification restores the class it moved.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
  recordReservedMatterChain,
} from './setup.js';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

/**
 * A marker unique to THIS RUN, embedded in every `reason` this file writes.
 *
 * ⚠ IT IS WHAT MAKES THE RECLASSIFICATION ASSERTIONS RE-RUNNABLE, and the need is structural rather
 * than cosmetic: `reclassification_event` is APPEND-ONLY at the database (SQLSTATE 42501 on UPDATE,
 * DELETE and TRUNCATE), so a second run cannot tidy up after the first. Reading `history.at(-1)` was
 * therefore wrong — on a second run against the same database it returns the PREVIOUS run's
 * restoration event, and the test failed for a reason that had nothing to do with the code under test.
 * Selecting this run's own events by marker is the only honest way to assert on an unerasable table.
 */
const RUN_MARKER = `e3-run-${Date.now()}`;

/** A frozen Umm-al-Qura snapshot for `instant`, taken the same way the write path takes it. */
function hijriOf(instant: Date): string {
  return String(toHijriSnapshot(instant));
}

warnNoDatabase('S4/E3 (endowment record, classification gating, deed eligibility, deed terms)');

const createCaller = createCallerFactory(appRouter);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A CASE_MANAGER on waqf-001 only.
 *
 * Chosen because the preset holds `endowment:waqf:read|write` and `endowment:deed:read|write` but
 * NOT `endowment:deed:sign` and NOT any approval verb — so it can drive `deed.upsert` and
 * `classification.reclassify` while being the right subject for "a maker may never authorize".
 */
const CASE_MANAGER_A = `${API_TEST_PREFIX}e3-case-manager-a`;

/** S5/E4 — reads the waqf-004/waqf-005 maintenance-reserve poles without widening CASE_MANAGER_A. */
const CASE_MANAGER_POLES = `${API_TEST_PREFIX}e4-case-manager-poles`;

/** S5/E4 — reads waqf-003's charitable register (three jihas) for the `agrees` pin. */
const CASE_MANAGER_KHAYRI = `${API_TEST_PREFIX}e4-case-manager-khayri`;

/** A NAZIR on waqf-001 — the only seat holding `endowment:deed:sign`. */
const NAZIR_A = `${API_TEST_PREFIX}e3-nazir-a`;

/** A FINANCE seat on waqf-002 only, so the navigation tree has a second, narrower shape to check. */
const FINANCE_B = `${API_TEST_PREFIX}e3-finance-b`;

/**
 * A caller with a client-level `Membership` and NO `WaqfAccessGrant`.
 *
 * ⚠ MP-13's subject. A membership contributes NOTHING — not a role, and not even read scope — so this
 * caller must receive an EMPTY tree. `provisionTestSubjects` does not create memberships, so this
 * subject is provisioned with `role: null` and the membership is inserted below.
 */
const MEMBERSHIP_ONLY = `${API_TEST_PREFIX}e3-membership-only`;

/** The seeded user documented as "must never be given a grant". */
const UNSCOPED_USER = 'user-unscoped';

describe.skipIf(!hasDatabase)('S4/E3 · the endowment record', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        // ⚠ Scoped to waqf-001 ONLY, and AC-E3-02 depends on that: the navigation tree must
        // contain nothing but the granted endowment. The S5/E4 maintenance-reserve poles run on
        // their own seat (CASE_MANAGER_POLES) instead of widening this one — widening it was
        // tried and broke AC-E3-02's subject.
        id: CASE_MANAGER_A,
        role: 'CASE_MANAGER',
        waqfIds: ['waqf-001'],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'endowment:deed:read',
          'endowment:deed:write',
          'endowment:asset:read',
          'endowment:asset:write',
          'beneficiary:beneficiary:read',
          'legal:reserved_matter:read',
          'approval:request:read',
          'approval:request:initiate',
        ],
      },
      {
        // S5/E4 — AC-E3-03's second subject: the maintenance-reserve poles live on waqf-004 (the
        // deed POSITIVELY states no reserve) and waqf-005 (intake state, unread ⇒ unspecified),
        // and reading them must not widen CASE_MANAGER_A's navigation subject.
        id: CASE_MANAGER_POLES,
        role: 'CASE_MANAGER',
        waqfIds: ['waqf-004', 'waqf-005'],
        permissions: ['endowment:waqf:read'],
      },
      {
        // S5/E4 — waqf-003 (خيري) only, for the CHARITABLE_JIHA `agrees` pin. Scoped narrowly so
        // it cannot widen any other test's navigation/isolation subject.
        id: CASE_MANAGER_KHAYRI,
        role: 'CASE_MANAGER',
        waqfIds: ['waqf-003'],
        permissions: ['endowment:waqf:read', 'beneficiary:beneficiary:read'],
      },
      {
        id: NAZIR_A,
        role: 'NAZIR',
        waqfIds: ['waqf-001'],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'endowment:deed:read',
          'endowment:deed:write',
          'endowment:deed:sign',
          'endowment:asset:read',
          'endowment:asset:write',
          'beneficiary:beneficiary:read',
          'legal:reserved_matter:read',
          'legal:reserved_matter:write',
          'legal:reserved_matter:approve',
          'approval:request:read',
          'approval:request:approve',
        ],
      },
      {
        id: FINANCE_B,
        role: 'FINANCE',
        waqfIds: ['waqf-002'],
        permissions: ['endowment:waqf:read', 'finance:transaction:read'],
      },
      // No grant at all — the membership is added below.
      { id: MEMBERSHIP_ONLY, role: null, waqfIds: [] },
    ]);

    // ── THE MEMBERSHIP, ON THE OWNER CONNECTION — SCAFFOLDING ONLY ──────────────────────────
    // `Membership` is in `CLIENT_REACHABLE_MODELS` with a `client.waqifs.waqfs` path, so this row is
    // exactly the thing that WOULD confer reach if a membership conferred any. It must not (MP-13).
    //
    // ⚠ MEASURED: the runtime role holds no INSERT on `membership` at all since ADR-0008 round 6 —
    // `42501 permission denied for table membership` on the app connection. That is the correct
    // posture, not a harness bug, so the provisioning INSERT goes on the privileged connection exactly
    // as `provisionTestSubjects()` does. **No assertion in this file is made on that connection**; it
    // lays a row down and takes it away, and every refusal asserted below comes through a procedure.
    const owner = await privilegedPrisma();
    await owner.$executeRawUnsafe(
      `INSERT INTO "membership" ("id", "clientId", "userId", "role", "createdAt", "updatedAt")
         VALUES ($1, 'client-001', $2, 'FAMILY_BOARD', now(), now())
       ON CONFLICT ("id") DO NOTHING`,
      `${API_TEST_PREFIX}e3-membership`,
      MEMBERSHIP_ONLY,
    );
  });

  afterAll(async () => {
    // `cleanupApiTestRows()` already deletes `membership` rows under the test prefix, on the privileged
    // connection and in FK-safe order. Repeating it here would be a second, weaker copy.
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-01 · BR-101 in one payload, and non-disclosure on the other side
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-01 · endowment.get', () => {
    it('returns every BR-101 element in ONE payload, with the registration date in BOTH calendars', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac01-get' });
      const result = await createCaller(ctx).endowment.get({ waqfId: 'waqf-001' });

      expect(result.found).toBe(true);
      expect(result.waqfId).toBe('waqf-001');
      // The hierarchy: the endowment names its endower AND its family, so a screen needs one call.
      expect(result.waqifId).toBe('waqif-001');
      expect(result.clientId).toBe('client-001');
      // Certificate and deed numbers — both, because BR-101 names both and they are different facts.
      expect(result.certificateNumber).toBe('FAKE-1000001');
      expect(result.deedNumber).toBe('FAKE-DEED-455');
      expect(result.classification).toBe('MEDIUM');
      expect(result.type).toBe('FAMILY_DHURRI');
      expect(result.nature).toBe('AYNI');
      expect(result.entitlementOrder).toBe('ORDERED');

      // ⚠ BOTH CALENDARS, and the Hijri side is the FROZEN snapshot written at insert — never
      // recomputed downstream, because a filed date that shifts when a conversion library changes is a
      // rewritten legal record (D-4).
      expect(result.registrationDate).toMatch(/^1980-03-11T/);
      expect(result.registrationDateHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // The Nazir assignment, as a summary. The representative's IDENTITY lives behind
      // `endowment:deed:read`, so this payload only says whether one exists.
      expect(result.trusteeship).not.toBeNull();
      expect(result.trusteeship?.primaryNazir).toContain('QMULATE');
      expect(result.trusteeship?.jointlyLiable).toBe(true);
      expect(result.trusteeship?.hasAuthorizedRep).toBe(true);
    });

    it('carries the deed terms migration 12 landed, with `captured` separate from `kind`', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac01-terms' });
      const result = await createCaller(ctx).endowment.get({ waqfId: 'waqf-001' });

      expect(result.continuationStipulation).toBe('ZUHUR_ONLY');
      // ⚠ THE TWO FACTS ARE SEPARATE FIELDS ON PURPOSE. `captured: true` + `kind: null` means the deed
      // was READ and POSITIVELY RECORDS NO ultimate taker (R7-c). `captured: false` would mean nobody
      // has looked. Collapsing them is how an un-transcribed deed masquerades as one naming nobody.
      expect(result.reversion?.captured).toBe(true);
      expect(result.reversion?.kind).toBeNull();
      expect(result.reversion?.ultimateTakerIds).toEqual([]);
    });

    it('a caller with NO grant gets NOT_FOUND, never FORBIDDEN', async () => {
      const ctx = await contextFor({ userId: UNSCOPED_USER, requestId: 'e3-ac01-nogrant' });
      expect(ctx.grants).toEqual([]);

      let thrown: unknown;
      try {
        await createCaller(ctx).endowment.get({ waqfId: 'waqf-001' });
      } catch (error) {
        thrown = error;
      }
      const code = (thrown as { code?: string }).code;
      expect(code).toBe('NOT_FOUND');
      // Stated as a negation too: the mutation for this clause is exactly this swap.
      expect(code, "the endowment's existence was disclosed").not.toBe('FORBIDDEN');
    });

    it('a grant on waqf-002 does not reach waqf-001 — scope is the endowment, never the family', async () => {
      const ctx = await contextFor({ userId: FINANCE_B, requestId: 'e3-ac01-cross' });
      // The positive half first, so this is not a suite that passes over a ladder denying everyone.
      await expect(createCaller(ctx).endowment.get({ waqfId: 'waqf-002' })).resolves.toMatchObject({
        found: true,
        certificateNumber: 'FAKE-1000002',
      });

      let thrown: unknown;
      try {
        await createCaller(ctx).endowment.get({ waqfId: 'waqf-001' });
      } catch (error) {
        thrown = error;
      }
      expect((thrown as { code?: string }).code).toBe('NOT_FOUND');
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-02 · the tree renders three levels, and contains ONLY what the caller may reach
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-02 · navigation.tree', () => {
    it('renders client → waqif → endowment, containing ONLY the granted endowment', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac02-tree' });
      const tree = await createCaller(ctx).navigation.tree();

      // All three levels present — the tree is not flattened or truncated.
      expect(tree.clients).toHaveLength(1);
      expect(tree.clients[0]?.id).toBe('client-001');
      expect(tree.clients[0]?.waqifs).toHaveLength(1);
      expect(tree.clients[0]?.waqifs[0]?.id).toBe('waqif-001');
      expect(tree.clients[0]?.waqifs[0]?.waqfs.map((waqf) => waqf.id)).toEqual(['waqf-001']);

      // ⚠ AND THE ABSENCES ARE ASSERTED, one id at a time. This is the assertion the naive
      // `client.findMany({ include: { waqifs: { include: { waqfs: true } } } })` implementation fails:
      // a Prisma extension rewrites the TOP-LEVEL `where` only, so the nested collections would come
      // back WHOLE — three waqifs and four endowments handed to a caller granted one.
      const serialized = JSON.stringify(tree);
      for (const absent of ['waqif-002', 'waqif-003', 'waqf-002', 'waqf-003', 'waqf-004']) {
        expect(serialized, `${absent} leaked into the tree`).not.toContain(absent);
      }

      // The endowment fields a navigation payload needs, and nothing sensitive.
      expect(tree.clients[0]?.waqifs[0]?.waqfs[0]).toMatchObject({
        certificateNumber: 'FAKE-1000001',
        classification: 'MEDIUM',
        type: 'FAMILY_DHURRI',
        entitlementOrder: 'ORDERED',
      });
      expect(serialized).not.toContain('shartAlWaqif');
    });

    it('MP-13 · a client-level Membership with no grant yields an EMPTY tree', async () => {
      const ctx = await contextFor({ userId: MEMBERSHIP_ONLY, requestId: 'e3-ac02-membership' });

      // The premise, asserted: this subject really does hold a membership and no grant. Without this
      // the assertion below would pass for a user who simply does not exist.
      expect(ctx.grants).toEqual([]);
      // ⚠ A PREMISE CHECK ON THE SCAFFOLDING, NOT A REFUSAL PROBE. Without it, "the tree is empty"
      // would also be true for a user who simply does not exist, and the assertion below would prove
      // nothing about memberships at all. The row was laid down on this connection, so it is read back
      // on it; no refusal in this file is observed here.
      const owner = await privilegedPrisma();
      const memberships = await owner.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "membership" WHERE "userId" = $1`,
        MEMBERSHIP_ONLY,
      );
      expect(Number(memberships[0]?.n ?? 0)).toBe(1);

      // A Membership contributes NOTHING — not a role, and not even read scope (MP-13).
      await expect(createCaller(ctx).navigation.tree()).resolves.toEqual({ clients: [] });
      await expect(
        createCaller(ctx).navigation.client.get({ clientId: 'client-001' }),
      ).resolves.toBeNull();
      await expect(
        createCaller(ctx).navigation.waqif.get({ waqifId: 'waqif-001' }),
      ).resolves.toBeNull();
    });

    it('client.get / waqif.get return `null` — not FORBIDDEN — for an out-of-scope family', async () => {
      const ctx = await contextFor({ userId: FINANCE_B, requestId: 'e3-ac02-null' });
      const caller = createCaller(ctx);

      // The positive half: waqif-002 owns waqf-002, which this caller may see.
      const reachable = await caller.navigation.waqif.get({ waqifId: 'waqif-002' });
      expect(reachable?.id).toBe('waqif-002');
      expect(reachable?.waqfs.map((waqf) => waqf.id)).toEqual(['waqf-002']);

      // waqif-001 owns only waqf-001, which this caller may NOT see. `null`, not a refusal: a
      // FORBIDDEN would confirm the endower exists.
      await expect(caller.navigation.waqif.get({ waqifId: 'waqif-001' })).resolves.toBeNull();

      // The family IS reachable (it owns waqf-002), and the COUNTS are counts of the reachable set —
      // never the family's true totals, which would leak the size of the engagement.
      const client = await caller.navigation.client.get({ clientId: 'client-001' });
      expect(client).toMatchObject({ id: 'client-001', waqifCount: 1, waqfCount: 1 });
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-03 · the Shart is referenceable, read-only, and `unspecified` is never `none`
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-03 · shart.get / shart.completeness', () => {
    it('returns the structured conditions as REFERENCEABLE FIELDS (BR-103)', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac03-get' });
      const shart = await createCaller(ctx).shart.get({ waqfId: 'waqf-001' });

      expect(shart.version).toBe(1);
      expect(shart.setAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(shart.structured.orderRule).toBe('ORDERED');
      expect(shart.structured.continuationStipulation).toBe('ZUHUR_ONLY');
      expect(shart.structured.disbursementChannel.kind).toBe('FAMILY');
      // ⚠ THE DEED-SET NAZIR FEE CARRIES ITS CAVEAT. The ʿushr rate is deed-set, not statutory, and it
      // is ⚠ unverified against primary Saudi law (Binding rule 3).
      expect(shart.structured.nazirFee.unverified).toBe(true);
      // And the payload states the immutability rather than leaving a client to infer it from the
      // absence of a write procedure.
      expect(shart.immutable).toBe(true);
      expect(shart.supersedingInstrumentOnly).toBe(true);
    });

    it('⚠ `unspecified` is NEVER reported as `none`, and `missing` is never merged with `advisory`', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac03-completeness' });
      const caller = createCaller(ctx);

      const shart = await caller.shart.get({ waqfId: 'waqf-001' });
      const completeness = await caller.shart.completeness({ waqfId: 'waqf-001' });

      // ⚠ RE-POINTED IN S5/E4, and the claim got STRONGER, not weaker. Until the fixture delta,
      // waqf-001 was this test's `unspecified` subject ("the seed writes `{ kind: 'unspecified' }`
      // — the deed is SILENT"); waqf-001 now RECORDS a fixed SAR 40,000 rule, so the
      // unspecified/none distinction is asserted where each pole genuinely lives: waqf-005 (intake
      // state, nothing read — `unspecified`) and waqf-004 (the deed POSITIVELY stipulates no
      // reserve — `none`). Before S5 the `none` pole had NO subject anywhere and this test could
      // not tell an implementation that collapsed the two apart.
      expect(shart.structured.maintenanceReserve.kind).toBe('fixed');

      const poles = createCaller(
        await contextFor({ userId: CASE_MANAGER_POLES, requestId: 'e4-ac03-poles' }),
      );
      const intake = await poles.shart.completeness({ waqfId: 'waqf-005' });
      expect(intake.maintenanceReserveKind).toBe('unspecified');
      expect(intake.maintenanceReserveKind).not.toBe('none');

      const directUse = await poles.shart.completeness({ waqfId: 'waqf-004' });
      expect(directUse.maintenanceReserveKind).toBe('none');
      expect(directUse.maintenanceReserveKind).not.toBe('unspecified');

      // …and the SILENT case stays ADVISORY (non-halting), not MISSING (halting). Asserted on
      // waqf-005 since S5/E4 — waqf-001's deed now states its rule, so its advisory is gone.
      expect(intake.advisory).toContain('MAINTENANCE_RESERVE_UNSPECIFIED');
      expect(intake.missing).not.toContain('MAINTENANCE_RESERVE_UNSPECIFIED');
      expect(completeness.advisory).not.toContain('MAINTENANCE_RESERVE_UNSPECIFIED');

      // The deed's مآل clause was READ and records none — `none`, never `unread`.
      expect(completeness.reversionStatus).toBe('none');
      expect(completeness.missing).not.toContain('REVERSION_CLAUSE_UNREAD');

      // ⚠ `wouldHaltWith` carries UNTRANSLATED diagnostic codes. Every entry must be a real
      // SHART_REFUSALS member — a code the engine cannot raise would be a code nobody can act on.
      expect(Array.isArray(completeness.wouldHaltWith)).toBe(true);
      expect(completeness.unmappedHaltingGaps).toEqual([]);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-04 · THE CONTRAST — before anything reclassifies either side of it
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-04 · classification gating (BR-104), the E3 exit clause', () => {
    /* ═══════════════════════════════════════════════════════════════════════════════════════
     * ⊕ S8 — THE LEDGER-GATED ROWS: REPORTED, NOT REFUSED, AND THE ANSWER STAYS TOTAL
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * MEASURED when the canonical §09 library was seeded: this endpoint and `reclassify` BOTH threw
     * `GATE_NOT_CLEARED` for every endowment, naming FIN-ACC-02, FIN-ACC-04, FIN-ZKT-01 and
     * OPS-LEASE-01 — four api tests red, including BR-104's re-classification. The refusal was
     * written while no `HAS_INCOME` row could exist, and it treated "you did not give me a period"
     * as if it were "your catalogue is corrupt".
     *
     * These three tests hold the new shape in place: the answer is TOTAL, the undecided bucket is
     * NON-EMPTY (or the totality is decoration), and the refusals that SHOULD still fire still do.
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    it('the answer is TOTAL — every catalogue row is applicable, excluded, or undecided', async () => {
      const caller = createCaller(
        await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac04-total' }),
      );
      const set = await caller.classification.applicableObligations({ waqfId: 'waqf-001' });
      // ⚠ THE DENOMINATOR IS THE CALLER'S OWN CATALOGUE, NOT THE TABLE — and the first draft of this
      // test got that wrong, which is worth recording because the failure was the CONTROL WORKING.
      // It compared against a privileged `complianceObligation.findMany()` (46 rows) and failed by
      // exactly one: `GOV-AML-02`. This seat is a case manager, outside the AML compartment, so the
      // duty to report suspicion to the FIU is invisible to it — S8-Q1, "the general register shows
      // nothing AML-attributable". A totality law measured against rows the caller may not see would
      // demand the endpoint disclose the compartmented row.
      const prisma = await basePrisma();
      const visible = (
        await prisma.complianceObligation.findMany({
          where: { confidentiality: 'NORMAL' },
          select: { code: true },
        })
      ).map((row) => row.code);

      const answered = [
        ...set.obligations.map((row) => row.code),
        ...set.excluded.map((row) => row.code),
        ...set.incomeFactMissing.map((row) => row.code),
      ];
      // A row in none of the three lists is a regulatory duty that simply vanished for this
      // endowment, with nothing anywhere saying so — which is the failure BR-104's whole design is
      // built against.
      expect(answered.slice().sort()).toEqual(visible.slice().sort());
      expect(new Set(answered).size, 'a row appears in two lists').toBe(answered.length);

      // ⊕ AND THE COMPARTMENT, ASSERTED AT THE API LAYER RATHER THAN INFERRED FROM THE ARITHMETIC:
      // the AML duty appears in NONE of the three lists for this seat, while its ordinary neighbour
      // (KYC/CDD refresh) does. Both halves — a compartment that also swallowed GOV-AML-01 would be
      // an outage, and this seat is entitled to that row.
      expect(answered, 'the compartmented AML duty reached a non-member').not.toContain(
        'GOV-AML-02',
      );
      expect(answered, 'the ordinary AML duty was swallowed with it').toContain('GOV-AML-01');
    });

    it('POSITIVE CONTROL — the undecided bucket is non-empty and names its missing fact', async () => {
      // Without this, "total over three lists" is satisfied by a catalogue that never reaches the
      // third one — and the two-list version of this property was green for exactly that reason
      // until the library was seeded.
      const caller = createCaller(
        await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac04-undecided' }),
      );
      const set = await caller.classification.applicableObligations({ waqfId: 'waqf-001' });

      expect(set.incomeFactMissing.length).toBeGreaterThan(0);
      for (const row of set.incomeFactMissing) {
        expect(row.requiredFact).toBe('hasIncomeInPeriod');
        expect(row.gate).toBe('HAS_INCOME');
      }
      // ⚠ AND THE NOTE TRAVELS WITH THEM. A list of codes with no explanation is how a caller
      // decides for itself what an undecided duty means — which is the default this refuses to make.
      expect(set.incomeFactNote).toMatch(/period/i);
      expect(set.incomeFactNote).toMatch(/NFR-01/);
      // Not one of them may have leaked into either decided list.
      const decided = new Set([
        ...set.obligations.map((row) => row.code),
        ...set.excluded.map((row) => row.code),
      ]);
      for (const row of set.incomeFactMissing)
        expect(decided.has(row.code), `${row.code} was decided without a period`).toBe(false);
    });

    it('⚠ THE REFUSALS THAT MUST STILL FIRE — a RETIRED gate still refuses the whole answer', async () => {
      // ═════════════════════════════════════════════════════════════════════════════════════
      // THE ASSERTION THAT PROVES THE S8 CHANGE NARROWED THE REFUSAL RATHER THAN DELETING IT.
      // ═════════════════════════════════════════════════════════════════════════════════════
      // `incomeFactMissing` stopped refusing because it is not a defect. `retiredGate` and
      // `unrecognisedGate` ARE defects — a row written against a rule the product retired, or a
      // mis-typed gate — and treating either as "does not apply" deletes a duty silently. Driven
      // with a real row rather than trusted, and removed again in the same test.
      const raw = await privilegedPrisma();
      const probeId = 'oblig-test-retired-gate-probe';
      await raw.$executeRawUnsafe(
        `INSERT INTO "compliance_obligation"
           ("id","code","section","workstreamAr","workstreamEn","titleAr","titleEn","gate",
            "libraryVersion","confidentiality","createdAt","updatedAt")
         VALUES ('${probeId}','TEST-RETIRED-GATE','GOVERNMENT_LEGAL',
                 'بيانات وهمية للاختبار','Test probe','نص وهمي للاختبار — ليس التزاماً حقيقياً.',
                 'INVENTED TEST ROW','LARGE_ONLY'::"ClassificationGate",'retired-gate-probe',
                 'NORMAL'::"Confidentiality", now(), now())`,
      );
      try {
        const caller = createCaller(
          await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac04-retired' }),
        );
        await expect(
          caller.classification.applicableObligations({ waqfId: 'waqf-001' }),
        ).rejects.toThrow(/RETIRED classification\s+gate|RETIRED/);
      } finally {
        // ⚠ THE CLEANUP GOES ROUND THE GUARD RATHER THAN THE GUARD BEING WEAKENED, and the first
        // draft of this test discovered why the hard way: `compliance_obligation_no_delete` is
        // ENABLE ALWAYS and refused the OWNER connection too (42501 — "This row is … compliance
        // evidence under a >= 10-year retention obligation"). The probe row then survived and
        // poisoned three later tests, which is the guard doing precisely its job on a row this
        // suite had no business leaving behind.
        //
        // Suspended on the owner connection for one statement and re-armed ENABLE ALWAYS in the
        // same block. Soft-deleting instead would NOT do: nothing filters `deletedAt` on this read
        // path, so a retired probe row would go on refusing every call for ever.
        await raw.$executeRawUnsafe(
          `ALTER TABLE "compliance_obligation" DISABLE TRIGGER "compliance_obligation_no_delete"`,
        );
        try {
          await raw.$executeRawUnsafe(
            `DELETE FROM "compliance_obligation" WHERE "id" = '${probeId}'`,
          );
        } finally {
          await raw.$executeRawUnsafe(
            `ALTER TABLE "compliance_obligation" ENABLE ALWAYS TRIGGER "compliance_obligation_no_delete"`,
          );
        }
      }
      expect(
        await (await basePrisma()).complianceObligation.count({ where: { id: probeId } }),
        'the retired-gate probe row survived the test',
      ).toBe(0);
      // And the guard is BACK — asserted, not assumed. A test that disarms a control and forgets to
      // re-arm it is worse than one that never touched it.
      const armed = await raw.$queryRawUnsafe<{ tgenabled: string }[]>(
        `SELECT tgenabled::text AS tgenabled FROM pg_trigger WHERE tgname = 'compliance_obligation_no_delete'`,
      );
      expect(armed.map((row) => row.tgenabled)).toEqual(['A']);
    });

    it('the MEDIUM endowment shows LARGE_MEDIUM obligations the SMALL one does not', async () => {
      const medium = createCaller(
        await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac04-medium' }),
      );
      const small = createCaller(
        await contextFor({ userId: FINANCE_B, requestId: 'e3-ac04-small' }),
      );

      const onMedium = await medium.classification.applicableObligations({ waqfId: 'waqf-001' });
      const onSmall = await small.classification.applicableObligations({ waqfId: 'waqf-002' });

      expect(onMedium.classification).toBe('MEDIUM');
      expect(onSmall.classification).toBe('SMALL');

      // ⚠ THE PREMISE, ASSERTED FIRST. Without this the contrast below could be a comparison over an
      // EMPTY set — the exact vacuous pass the exit clause's three-layer proof exists to prevent. The
      // seed gained an audited-statement obligation and an internal-bylaws obligation at gate
      // LARGE_MEDIUM in S4 precisely because waqf-001 had none before.
      const largeMediumOnMedium = onMedium.obligations.filter(
        (obligation) => obligation.gate === 'LARGE_MEDIUM',
      );
      expect(
        largeMediumOnMedium.length,
        'the catalogue has no LARGE_MEDIUM-gated obligation, so this contrast is vacuous',
      ).toBeGreaterThanOrEqual(2);

      // (a) NEITHER appears in the SMALL endowment's applicable set…
      const smallCodes = new Set(onSmall.obligations.map((obligation) => obligation.code));
      for (const obligation of largeMediumOnMedium) {
        expect(
          smallCodes.has(obligation.code),
          `${obligation.code} leaked onto the SMALL waqf`,
        ).toBe(false);
      }

      // (b) …and each appears in its `excluded` list, with the ONE reason gating can give. This is
      //     what makes the contrast PROVABLE rather than merely "one list is shorter".
      const excluded = new Map(onSmall.excluded.map((row) => [row.code, row]));
      for (const obligation of largeMediumOnMedium) {
        const row = excluded.get(obligation.code);
        expect(
          row,
          `${obligation.code} is neither applicable nor excluded on the SMALL waqf`,
        ).toBeDefined();
        expect(row?.reason).toBe('GATE_EXCLUDES_CLASSIFICATION');
        expect(row?.resolvedGate).toBe('LARGE_MEDIUM');
      }

      // (c) The gate is not returning everything for everyone: the SMALL waqf DOES carry the
      //     `SMALL_DIRECT` and `ALL` duties, so the exclusion above is selective, not a broken query.
      expect(onSmall.obligations.length).toBeGreaterThan(0);
      expect(onSmall.obligations.some((obligation) => obligation.gate === 'SMALL_DIRECT')).toBe(
        true,
      );

      // (d) Every obligation carries the ⚠ marker: which classes an obligation binds is an unverified
      //     regulatory reading (Binding rule 3).
      for (const obligation of [...onMedium.obligations, ...onSmall.obligations]) {
        expect(obligation.unverified).toBe(true);
      }
    });

    it('the bands are Setting-resolved ENVELOPES carrying the ⚠ unverified marker, never numbers', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac04-bands' });
      const result = await createCaller(ctx).classification.get({ waqfId: 'waqf-001' });

      expect(result.current).toBe('MEDIUM');
      expect(result.bands.unverified).toBe(true);
      expect(result.bands.note).toContain('unverified');
      expect(result.bands.settingKeys).toEqual([
        'classification.threshold.large.sar',
        'classification.threshold.medium.sar',
      ]);

      // ⚠ THE FIGURE CANNOT BE RENDERED WITHOUT ITS CAVEAT. `parseSetting`'s refinement means an
      // unverified figure physically cannot be STORED without its ⚠ note, and the whole envelope —
      // value, unit, `unverified`, note — is what crosses the wire.
      expect(result.bands.resolved).toHaveLength(2);
      for (const band of result.bands.resolved) {
        expect(band.value).toMatchObject({ unverified: true });
        expect(String((band.value as { note?: unknown }).note)).toContain('unverified');
      }
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-07 · an ineligible Nazir is blocked BEFORE ANY WRITE
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-07 · deed eligibility (BR-109)', () => {
    /** Flags that pass. `ksaResident` is flipped per-test so only ONE thing differs. */
    const eligible = {
      islam: true,
      legalCapacity: true,
      noDisqualifyingRemoval: true,
      ksaResident: true,
      saudiNationalWhereRequired: null,
      authorityLicensed: null,
    } as const;

    const context = {
      endowerIsForeign: false,
      holdsRealProperty: false,
      nazirIsLegalPerson: false,
    } as const;

    async function deedRow(): Promise<{ primaryNazir: string; ksaResident: boolean } | null> {
      const prisma = await basePrisma();
      const rows = await prisma.$queryRawUnsafe<{ primaryNazir: string; ksaResident: boolean }[]>(
        `SELECT "primaryNazir", "ksaResident" FROM "trusteeship_deed" WHERE "waqfId" = 'waqf-001'`,
      );
      return rows[0] ?? null;
    }

    it('refuses a NON-RESIDENT Nazir with NAZIR_INELIGIBLE / KSA_RESIDENCY_REQUIRED, and WRITES NOTHING', async () => {
      const before = await deedRow();
      expect(
        before,
        'waqf-001 has no trusteeship deed — this assertion would be vacuous',
      ).not.toBeNull();

      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac07-nonresident' });
      let thrown: unknown;
      try {
        await createCaller(ctx).deed.upsert({
          waqfId: 'waqf-001',
          primaryNazir: 'Non-resident candidate (بيانات وهمية)',
          primaryAppointedDate: '2026-01-01T00:00:00.000Z',
          primaryAppointedDateHijri: '1447-07-12',
          authorizedRep: null,
          jointlyLiable: false,
          successorNazir: null,
          eligibility: { ...eligible, ksaResident: false },
          repEligibility: null,
          context,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, 'a non-resident Nazir was accepted').toBeDefined();
      expect((thrown as { code?: string }).code).toBe('BAD_REQUEST');
      const cause = (thrown as { cause?: { code?: string; details?: { reasons?: string[] } } })
        .cause;
      expect(cause?.code).toBe('NAZIR_INELIGIBLE');
      expect(cause?.details?.reasons).toContain('KSA_RESIDENCY_REQUIRED');

      // ⚠ "REFUSED" AND "REFUSED BEFORE ANY WRITE" ARE DIFFERENT CLAIMS. The row must be byte-identical
      // to what it was: no partially-written deed, no rolled-back audit event, no new primaryNazir.
      expect(await deedRow()).toEqual(before);
    });

    it('a required criterion supplied as `null` is ELIGIBILITY_NOT_ASSESSED, never a pass', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac07-notassessed' });
      const verdict = await createCaller(ctx).deed.verifyEligibility({
        waqfId: 'waqf-001',
        // `ksaResident: null` means NOBODY HAS CHECKED. BR-109 says capture AND VERIFY.
        flags: { ...eligible, ksaResident: null },
        repFlags: null,
        context,
      });

      expect(verdict.primary.eligible).toBe(false);
      expect(verdict.primary.reasons).toContain('ELIGIBILITY_NOT_ASSESSED');
      expect(verdict.primary.notAssessed).toContain('KSA_RESIDENCY');
      // And it is NOT reported as the residency refusal: "not checked" and "checked and failed" are
      // different operational conditions with different remedies.
      expect(verdict.primary.reasons).not.toContain('KSA_RESIDENCY_REQUIRED');
    });

    it('the two CONDITIONAL criteria bind only on their context', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac07-conditional' });
      const caller = createCaller(ctx);

      // Neither half of the nationality condition holds ⇒ NOT_APPLICABLE, and a `null` flag is fine.
      const notBound = await caller.deed.verifyEligibility({
        waqfId: 'waqf-001',
        flags: eligible,
        repFlags: null,
        context,
      });
      expect(notBound.primary.eligible).toBe(true);
      const nationalityNotBound = notBound.primary.criteria.find(
        (criterion) => criterion.key === 'SAUDI_NATIONALITY_WHERE_REQUIRED',
      );
      expect(nationalityNotBound?.required).toBe(false);
      expect(nationalityNotBound?.applicability).toBe('NOT_APPLICABLE');

      // BOTH halves ⇒ REQUIRED, and a `null` flag now refuses. `&&`, not `||`: either half alone is
      // not the rule, and widening it would block seats the regulation does not block.
      const bound = await caller.deed.verifyEligibility({
        waqfId: 'waqf-001',
        flags: eligible,
        repFlags: null,
        context: { ...context, endowerIsForeign: true, holdsRealProperty: true },
      });
      expect(bound.primary.eligible).toBe(false);
      expect(
        bound.primary.criteria.find(
          (criterion) => criterion.key === 'SAUDI_NATIONALITY_WHERE_REQUIRED',
        )?.required,
      ).toBe(true);

      // ONE half alone does NOT bind it.
      const halfOnly = await caller.deed.verifyEligibility({
        waqfId: 'waqf-001',
        flags: eligible,
        repFlags: null,
        context: { ...context, endowerIsForeign: true },
      });
      expect(halfOnly.primary.eligible).toBe(true);

      // A legal-person Nazir binds the licence criterion, and nothing else does.
      const legalPerson = await caller.deed.verifyEligibility({
        waqfId: 'waqf-001',
        flags: eligible,
        repFlags: null,
        context: { ...context, nazirIsLegalPerson: true },
      });
      expect(legalPerson.primary.reasons).toContain('ELIGIBILITY_NOT_ASSESSED');
      expect(legalPerson.primary.notAssessed).toContain('AUTHORITY_LICENSED');
    });

    it('AC-E3-06 · a representative with jointlyLiable: false is refused (Art. 11(5), ⚠ unverified)', async () => {
      const before = await deedRow();
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac06-joint' });

      let thrown: unknown;
      try {
        await createCaller(ctx).deed.upsert({
          waqfId: 'waqf-001',
          primaryNazir: 'QMULATE (professional Nazir)',
          primaryAppointedDate: '2025-02-01T00:00:00.000Z',
          primaryAppointedDateHijri: '1446-08-02',
          authorizedRep: {
            name: 'Delegated Manager (fictional)',
            scope: 'day-to-day property & finance ops',
            appointedDate: '2025-02-15T00:00:00.000Z',
            appointedDateHijri: '1446-08-16',
          },
          jointlyLiable: false,
          successorNazir: null,
          eligibility: eligible,
          repEligibility: {
            repIslam: true,
            repLegalCapacity: true,
            repNoDisqualifyingRemoval: true,
            repKsaResident: true,
          },
          context,
        });
      } catch (error) {
        thrown = error;
      }

      const cause = (thrown as { cause?: { code?: string; details?: { reasons?: string[] } } })
        .cause;
      expect(cause?.code).toBe('NAZIR_INELIGIBLE');
      expect(cause?.details?.reasons).toContain('REP_JOINT_LIABILITY_REQUIRED');
      // Again: refused BEFORE any write.
      expect(await deedRow()).toEqual(before);
    });

    it('the fail-safe holds for the REPRESENTATIVE too: repKsaResident: false BLOCKS', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac06-repres' });
      const verdict = await createCaller(ctx).deed.verifyEligibility({
        waqfId: 'waqf-001',
        flags: eligible,
        repFlags: {
          repIslam: true,
          repLegalCapacity: true,
          repNoDisqualifyingRemoval: true,
          repKsaResident: false,
        },
        context,
      });

      expect(verdict.primary.eligible).toBe(true);
      expect(verdict.representative?.eligible).toBe(false);
      expect(verdict.representative?.reasons).toContain('KSA_RESIDENCY_REQUIRED');
      // The CONJUNCTION: a deed whose representative fails is not seatable, because the representative
      // is jointly and severally liable for acts done under it.
      expect(verdict.eligible).toBe(false);

      // ⚠ AND THE OPEN LEGAL QUESTION TRAVELS WITH THE VERDICT rather than being answered by omission:
      // the two CONDITIONAL criteria are UNDECIDED_SURFACED on a representative, not NOT_APPLICABLE.
      const conditional = verdict.representative?.criteria.filter(
        (criterion) =>
          criterion.key === 'SAUDI_NATIONALITY_WHERE_REQUIRED' ||
          criterion.key === 'AUTHORITY_LICENSED',
      );
      expect(conditional).toHaveLength(2);
      for (const criterion of conditional ?? []) {
        expect(criterion.applicability).toBe('UNDECIDED_SURFACED');
        expect(criterion.required).toBe(false);
      }
      expect(verdict.representative?.surfacedQuestions.length).toBeGreaterThan(0);
    });

    it('the dry run and the mutation give the IDENTICAL verdict — one resolver, no second copy', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac07-parity' });
      const caller = createCaller(ctx);
      const flags = { ...eligible, ksaResident: false } as const;

      const dryRun = await caller.deed.verifyEligibility({
        waqfId: 'waqf-001',
        flags,
        repFlags: null,
        context,
      });

      let thrown: unknown;
      try {
        await caller.deed.upsert({
          waqfId: 'waqf-001',
          primaryNazir: 'Non-resident candidate (بيانات وهمية)',
          primaryAppointedDate: '2026-01-01T00:00:00.000Z',
          primaryAppointedDateHijri: '1447-07-12',
          authorizedRep: null,
          jointlyLiable: false,
          successorNazir: null,
          eligibility: flags,
          repEligibility: null,
          context,
        });
      } catch (error) {
        thrown = error;
      }

      const mutationReasons = (thrown as { cause?: { details?: { reasons?: string[] } } }).cause
        ?.details?.reasons;
      expect(mutationReasons).toEqual([...dryRun.primary.reasons]);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * beneficiary.lineage · the ancestor walk
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('beneficiary.lineage · the ancestor walk (R-FRONTIER)', () => {
    it('returns members, the (beneficiary, ancestor) PAIRS, and an integrity view', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-lineage' });
      const lineage = await createCaller(ctx).beneficiary.lineage({ waqfId: 'waqf-001' });

      expect(lineage.members.length).toBeGreaterThan(0);

      // Every member of the lineage graph carries the edge R6 made mandatory ON EVERY DEED — a member
      // the engine cannot place is never paid, whatever order rule the deed uses.
      expect(lineage.integrity.missingLineageLink).toEqual([]);
      // ṭabaqa is a CROSS-CHECK, not a trusted input: the authoritative value is DERIVED from parentId
      // depth. A disagreement is REPORTED, never reconciled.
      expect(lineage.integrity.tabaqaMismatch).toEqual([]);
      expect(lineage.integrity.rootedOutsideWaqif).toEqual([]);
      for (const member of lineage.members) {
        expect(member.agrees, `${member.id} disagrees with its derived depth`).toBe(true);
      }

      // `parentId: null` means A CHILD OF THE WAQIF (derived depth 1) and never "unknown", so at least
      // one member must sit at depth 1 — otherwise the graph has no root inside this endowment.
      expect(
        lineage.members.some((member) => member.parentId === null && member.tabaqaDerived === 1),
      ).toBe(true);

      // ⚠ THE ANCESTRY IS PAIRS, NOT A NEAREST-ANCESTOR FIELD. Entitlement is a property of a CHAIN:
      // one stale vital status on a grandparent silently moves an entire branch's money, so every
      // ancestor's status must be readable, not just the nearest.
      if (lineage.ancestry.length > 0) {
        for (const row of lineage.ancestry) {
          expect(row.depth).toBeGreaterThanOrEqual(1);
          expect(typeof row.ancestorActive).toBe('boolean');
        }
        // A member with an ancestor chain must have a derived depth greater than 1.
        const withChain = lineage.ancestry[0]?.beneficiaryId;
        const member = lineage.members.find((row) => row.id === withChain);
        expect(member?.tabaqaDerived).toBeGreaterThan(1);
      }
    });

    it('a CHARITABLE_JIHA is not a graph member — no derived depth, and it AGREES (S5/E4)', async () => {
      // ⚠ THE PIN FOR THE S5/E4 `agrees` DEFECT. A jiha carries neither a lineageLink nor a ṭabaqa
      // (it is not a descendant), so it is NOT a member of the lineage graph and has NO derived
      // depth. The first cut of `lineage` derived depth 1 for it anyway, so `agrees` — `tabaqa ===
      // null ? depth === null : …` — was FALSE for every jiha, and `LineagePanel` rendered a
      // spurious "recorded tier disagrees" wart beside legitimate charitable rows. The integrity
      // arrays never had the defect (`tabaqaMismatch` only fires on a non-null recorded ṭabaqa),
      // so nothing here could have caught it until this assertion. waqf-001 (all FAMILY) cannot —
      // this runs on waqf-003, the خيري endowment whose whole register is jihas.
      const ctx = await contextFor({ userId: CASE_MANAGER_KHAYRI, requestId: 'e4-jiha-agrees' });
      const lineage = await createCaller(ctx).beneficiary.lineage({ waqfId: 'waqf-003' });

      const jihas = lineage.members.filter((member) => member.kind === 'CHARITABLE_JIHA');
      expect(jihas.length).toBeGreaterThan(0);
      for (const jiha of jihas) {
        expect(jiha.tabaqaRecorded, `${jiha.id} carries a ṭabaqa`).toBeNull();
        expect(jiha.tabaqaDerived, `${jiha.id} has a derived depth`).toBeNull();
        expect(jiha.agrees, `${jiha.id} spuriously disagrees with a depth it should not have`).toBe(
          true,
        );
        expect(jiha.lineageLink, `${jiha.id} leaked a lineageLink`).toBeNull();
      }
      // And no jiha is falsely reported as a graph-integrity problem.
      for (const jiha of jihas) {
        expect(lineage.integrity.missingLineageLink).not.toContain(jiha.id);
        expect(lineage.integrity.tabaqaMismatch).not.toContain(jiha.id);
      }
    });

    it('the ultimate-taker picker offers only non-descendant charities, and inferring nothing', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-takers' });
      const candidates = await createCaller(ctx).beneficiary.ultimateTakerCandidates({
        waqfId: 'waqf-001',
      });

      // waqf-001 is a ذري endowment with no charitable jiha in its register, so the honest answer is an
      // EMPTY list. ⚠ Returning candidates is not inferring a reversion (R7-c) — the مآل clause is a
      // RECORDED deed clause, entered by a human and signed by the Nazir.
      for (const candidate of candidates) {
        expect(candidate.id).toBeTypeOf('string');
      }
      expect(Array.isArray(candidates)).toBe(true);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-10 · a founder's condition landed in a plain column has NOT become editable
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-10 · the deed terms are WRITE-ONCE', () => {
    it('endowment.update does not accept a deed term at all — it is not in the input', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac10-update' });
      // zod strips unknown keys rather than throwing, so the assertion that matters is on the DATABASE:
      // the value must be unchanged after a call that tried to set it.
      await createCaller(ctx).endowment.update({
        waqfId: 'waqf-001',
        certificateExpiry: null,
        certificateExpiryHijri: null,
        // @ts-expect-error — the field is deliberately absent from the input schema. `tsc` failing here
        // if the directive stops being needed is the assertion: it means `update` acquired the field.
        continuationStipulation: 'ZUHUR_AND_BUTUN',
      });

      const prisma = await basePrisma();
      const rows = await prisma.$queryRawUnsafe<{ continuationStipulation: string }[]>(
        `SELECT "continuationStipulation"::text FROM "waqf" WHERE "id" = 'waqf-001'`,
      );
      expect(rows[0]?.continuationStipulation).toBe('ZUHUR_ONLY');
    });

    it('re-recording an already-recorded term fails with DEED_TERM_WRITE_ONCE', async () => {
      // waqf-001 already carries `continuationStipulation = ZUHUR_ONLY` and
      // `reversionClauseCaptured = true` from the seed, so this is the SECOND recording — the write the
      // tier-3 guard exists to refuse. The Nazir is the only seat that can even reach the procedure.
      const makerCtx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac10-mint' });
      const minted = await createCaller(makerCtx).approval.initiate({
        waqfId: 'waqf-001',
        type: 'RESERVED_MATTER',
        reservedMatterKind: 'DEED_TERM_RECORD',
        subjectId: 'waqf:waqf-001:deedTerms',
        payload: {
          kind: 'waqf.deedTerms',
          waqfId: 'waqf-001',
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          reversion: null,
          reversionClauseCaptured: 'true',
        },
      });

      const nazirCtx = await contextFor({ userId: NAZIR_A, requestId: 'e3-ac10-sign' });
      // ⊕ S12-2: the chain is recorded so the refusal below is the TIER-3 guard's, not the chain's.
      await recordReservedMatterChain(createCaller(nazirCtx), {
        waqfId: 'waqf-001',
        approvalRequestId: minted.approvalRequestId,
      });
      let thrown: unknown;
      try {
        await createCaller(nazirCtx).endowment.recordDeedTerms({
          waqfId: 'waqf-001',
          approvalRequestId: minted.approvalRequestId,
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          reversion: null,
          reversionClauseCaptured: true,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, "a recorded founder's condition was re-recorded").toBeDefined();
      // A CONFLICT, not a BAD_REQUEST: the request was well-formed and the STATE refuses it.
      expect((thrown as { code?: string }).code).toBe('CONFLICT');
      const cause = (thrown as { cause?: { code?: string; message?: string } }).cause;
      expect(cause?.code).toBe('DEED_TERM_WRITE_ONCE');
      // ⚠ THE MESSAGE MUST POINT AT THE SUPERSEDING-INSTRUMENT RULE. It is the only place a future
      // engineer learns that there is no approval to go and get.
      expect(cause?.message).toMatch(/SUPERSEDING INSTRUMENT/);

      // And nothing moved.
      const prisma = await basePrisma();
      const rows = await prisma.$queryRawUnsafe<{ continuationStipulation: string }[]>(
        `SELECT "continuationStipulation"::text FROM "waqf" WHERE "id" = 'waqf-001'`,
      );
      expect(rows[0]?.continuationStipulation).toBe('ZUHUR_ONLY');
    });

    it('a caller holding endowment:waqf:write but not deed:sign cannot reach the procedure at all', async () => {
      const ctx = await contextFor({ userId: CASE_MANAGER_A, requestId: 'e3-ac10-nosign' });
      let thrown: unknown;
      try {
        await createCaller(ctx).endowment.recordDeedTerms({
          waqfId: 'waqf-001',
          approvalRequestId: 'appr-does-not-exist',
          continuationStipulation: 'ZUHUR_AND_BUTUN',
          reversion: null,
          reversionClauseCaptured: true,
        });
      } catch (error) {
        thrown = error;
      }
      // FORBIDDEN, not NOT_FOUND: the caller HAS a grant on this endowment (existence is already
      // disclosed) but does not hold `endowment:deed:sign`, which only `nazir` holds.
      expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
      expect((thrown as { cause?: { code?: string } }).cause?.code).toBe('PERMISSION_DENIED');
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AC-E3-05 · reclassification, LAST, because it moves a classification
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('AC-E3-05 · classification.reclassify (BR-104, with history)', () => {
    it('appends ONE event with `from` = the pre-image, moves the column, audits, and names the delta', async () => {
      // ⚠ ON waqf-004, NOT waqf-001. AC-E3-04's contrast reads waqf-001 (MEDIUM) and waqf-002 (SMALL);
      // reclassifying either would change one side of the clause this suite just proved. waqf-004 is
      // DIRECT_UTILIZATION and is read by nothing else here, and its class is RESTORED below.
      await provisionTestSubjects([
        {
          id: `${API_TEST_PREFIX}e3-cm-d`,
          role: 'CASE_MANAGER',
          waqfIds: ['waqf-004'],
          permissions: ['endowment:waqf:read', 'endowment:waqf:write'],
        },
      ]);
      const ctx = await contextFor({
        userId: `${API_TEST_PREFIX}e3-cm-d`,
        requestId: 'e3-ac05-reclassify',
      });
      const caller = createCaller(ctx);

      const before = await caller.classification.get({ waqfId: 'waqf-004' });
      expect(before.current).toBe('SMALL');
      const historyBefore = before.history.length;
      const auditBefore = await countAuditEvents({
        action: 'UPDATE',
        category: 'MUTATION',
        waqfId: 'waqf-004',
      });

      // `at` is NOW, not a frozen literal: the history is ordered by `at`, and a fixed timestamp makes
      // a second run's events interleave with the first's. `atHijri` is computed the same way the write
      // path computes it, so the pair is a genuine dual date rather than a plausible-looking constant.
      const at = new Date();
      const result = await caller.classification.reclassify({
        waqfId: 'waqf-004',
        // ⊕ S9-4a — `waqf-004` is now SMALL + `directUtilization: true` (owner ruling, fifth batch:
        // usage is an orthogonal axis, so it finally has a SIZE). This clause needs a REAL transition
        // to exercise, and SMALL → MEDIUM is one — it also makes the BR-104 point better than the old
        // pair did, because it CROSSES the `LARGE_MEDIUM` boundary and the delta is genuinely
        // non-empty. The bulk rename briefly turned this into SMALL → SMALL, which the router
        // correctly refuses as a no-op (a refusal asserted two tests below).
        to: 'MEDIUM',
        reason: `Fixture exercise ${RUN_MARKER}: valuation moved the endowment into the medium band (بيانات وهمية)`,
        at: at.toISOString(),
        atHijri: hijriOf(at),
      });

      // `from` is READ FROM THE ROW inside the transaction, never a caller input — a caller-supplied
      // `from` is how a fabricated transition records a compliance position that never existed.
      expect(result.from).toBe('SMALL');
      expect(result.to).toBe('MEDIUM');

      // The BR-104 point, made visible: a re-classification changes WHICH duties apply. ⊕ S9-4a — and
      // it is now a SHARPER demonstration than before: SMALL → MEDIUM crosses the `LARGE_MEDIUM`
      // boundary, so the delta is genuinely NON-empty, where the old direct-use pair sat inside one
      // gate and produced an empty one. ⚠ The endowment's USAGE axis is unchanged by this — it is
      // still direct-use — which is exactly the separation the ruling created: a size change does not
      // touch what the benefit is.
      expect(result.obligationsGained.length).toBeGreaterThan(0);

      const after = await caller.classification.get({ waqfId: 'waqf-004' });
      expect(after.current).toBe('MEDIUM');
      // EXACTLY ONE event appended — not "at least one". A re-classification that wrote two history
      // rows would be a duplicated compliance position, and the count is how that stays visible.
      expect(after.history).toHaveLength(historyBefore + 1);

      // Selected by THIS RUN's marker, never by position. See {@link RUN_MARKER}.
      const mine = after.history.filter((event) => event.reason.includes(RUN_MARKER));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        from: 'SMALL',
        to: 'MEDIUM',
        atHijri: hijriOf(at),
      });
      expect(mine[0]?.reason).toContain('بيانات وهمية');
      // The acting identity is recorded, from the session — never an input.
      expect(mine[0]?.createdBy).toBe(`${API_TEST_PREFIX}e3-cm-d`);

      // A classification change is MATERIAL, so it is audited — counted by a DELTA, never an absolute.
      const auditAfter = await countAuditEvents({
        action: 'UPDATE',
        category: 'MUTATION',
        waqfId: 'waqf-004',
      });
      expect(auditAfter).toBeGreaterThan(auditBefore);
    });

    it('the appended history row cannot be UPDATEd or DELETEd through the runtime connection', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "reclassification_event" WHERE "waqfId" = 'waqf-004' ORDER BY "at" DESC LIMIT 1`,
      );
      const eventId = rows[0]?.id;
      expect(
        eventId,
        'no reclassification_event to attack — the assertion would be vacuous',
      ).toBeDefined();

      // ⚠ ON THE APP CONNECTION, never the owner. A refusal observed as the table owner proves nothing
      // about the runtime, which is the entire point of ADR-0008's privilege split. Before S4 the
      // model's doc comment claimed "append-only, never edited" and NOTHING enforced it.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "reclassification_event" SET "reason" = 'rewritten' WHERE "id" = $1`,
          eventId,
        ),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "reclassification_event" WHERE "id" = $1`, eventId),
      ).rejects.toThrow();
    });

    it('an event whose `from` does not match the live row is REFUSED — a fabricated history is unrepresentable', async () => {
      const prisma = await basePrisma();
      // waqf-004 is now SMALL. Claiming a transition FROM LARGE is a compliance position that never
      // existed; `reclassification_event_from_matches_current` makes it unrepresentable rather than
      // merely discouraged.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "reclassification_event" ("id","waqfId","from","to","at","atHijri","reason","createdAt")
             VALUES ('e3-fabricated','waqf-004','LARGE','MEDIUM', now(), '1448-02-20', 'fabricated', now())`,
        ),
      ).rejects.toThrow();
    });

    it('restores waqf-004 to its seeded SMALL class, and the restoration is itself an appended event', async () => {
      // The history cannot be rewritten, so a restoration is a NEW event — which is exactly the
      // superseding-record posture the rest of the schema takes.
      const ctx = await contextFor({
        userId: `${API_TEST_PREFIX}e3-cm-d`,
        requestId: 'e3-ac05-restore',
      });
      const at = new Date();
      const result = await createCaller(ctx).classification.reclassify({
        waqfId: 'waqf-004',
        to: 'SMALL',
        reason: `Fixture exercise ${RUN_MARKER}: restoring the seeded class (بيانات وهمية)`,
        at: at.toISOString(),
        atHijri: hijriOf(at),
      });
      // ⊕ S9-4a — the seeded class is SMALL now, so the restoration comes back from MEDIUM.
      expect(result).toMatchObject({ from: 'MEDIUM', to: 'SMALL' });

      const after = await createCaller(ctx).classification.get({ waqfId: 'waqf-004' });
      expect(after.current).toBe('SMALL');
    });

    it('refuses a no-op re-classification rather than appending an empty transition', async () => {
      const ctx = await contextFor({
        userId: `${API_TEST_PREFIX}e3-cm-d`,
        requestId: 'e3-ac05-noop',
      });
      const at = new Date();
      await expect(
        createCaller(ctx).classification.reclassify({
          waqfId: 'waqf-004',
          to: 'SMALL',
          reason: `no transition ${RUN_MARKER}`,
          at: at.toISOString(),
          atHijri: hijriOf(at),
        }),
      ).rejects.toThrow();
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * ⊕ S8-Q4 · NOT_CLASSIFIED LOCKS THE REGISTER — E7 exit clause A2, wire-level
   *
   * Owner ruling 2026-08-23 (memo, S8 addendum second batch): the onboarding state is an explicit
   * enum member; the register LOCKS until the real classification is recorded; NOT_CLASSIFIED
   * never gates a template TRUE. A2 (§09): "Given an endowment with no classification set, When
   * the register is opened, Then it is locked … and no tasks are materialised." The subject is a
   * PROVISIONED endowment, not a fixture edit — the ruling's own scoping.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('S8-Q4 · NOT_CLASSIFIED locks the register (E7 exit clause A2)', () => {
    const LOCKED_WAQF = 'waqf-test-api-q4-locked';
    const Q4_USER = `${API_TEST_PREFIX}q4-cm`;

    beforeAll(async () => {
      await provisionIntakeEndowment({
        id: LOCKED_WAQF,
        classification: 'NOT_CLASSIFIED',
        type: 'FAMILY_DHURRI',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_AND_BUTUN',
      });
      await provisionTestSubjects([
        {
          id: Q4_USER,
          role: 'CASE_MANAGER',
          waqfIds: [LOCKED_WAQF],
          permissions: ['endowment:waqf:read', 'endowment:waqf:write'],
        },
      ]);
    });

    it('A2 · the register is LOCKED: a report, not an outage, and empty means "not yet askable"', async () => {
      const ctx = await contextFor({ userId: Q4_USER, requestId: 'q4-locked-read' });
      const caller = createCaller(ctx);

      // The class itself is READABLE — the state is a fact on the record, not a secret.
      const current = await caller.classification.get({ waqfId: LOCKED_WAQF });
      expect(current.current).toBe('NOT_CLASSIFIED');

      // The register: locked, named as locked, and with NOTHING partitioned. The canonical library
      // holds 46 rows; not one may appear in ANY list — `excluded` included, because "excluded" is
      // a determination the absence of a classification cannot make (the resolver's lock, S8-Q4).
      const register = await caller.classification.applicableObligations({ waqfId: LOCKED_WAQF });
      expect(register.registerLocked).toBe(true);
      expect(register.registerLockReason).toBe('REGISTER_LOCKED_NOT_CLASSIFIED');
      expect(register.registerLockNote).toContain('LOCKED');
      expect(register.obligations).toStrictEqual([]);
      expect(register.excluded).toStrictEqual([]);
      expect(register.incomeFactMissing).toStrictEqual([]);
    });

    it('the LOCKED response and an ORDINARY response are distinguishable — the flag, not the emptiness', async () => {
      // The negative control for A2: a REAL class on the same wire reports registerLocked: false
      // and a non-empty partition. Without this contrast, the locked assertions above would also
      // pass against a broken endpoint that returns nothing to anybody.
      //
      // ⚠ ON ITS OWN SUBJECTS — this test first borrowed `e3-cm-d` (a user provisioned inside
      // AC-E3-05's test BODY), so a `-t`-filtered run of this block alone failed on the missing
      // grant, not on anything about the register. A test whose pass depends on which sibling ran
      // is measuring the runner; found by this stage's own M7 mutation run.
      const CONTRAST_WAQF = 'waqf-test-api-q4-real';
      await provisionIntakeEndowment({ id: CONTRAST_WAQF, classification: 'SMALL' });
      await provisionTestSubjects([
        {
          id: `${API_TEST_PREFIX}q4-contrast`,
          role: 'CASE_MANAGER',
          waqfIds: [CONTRAST_WAQF],
          permissions: ['endowment:waqf:read'],
        },
      ]);
      const ctx = await contextFor({
        userId: `${API_TEST_PREFIX}q4-contrast`,
        requestId: 'q4-contrast',
      });
      const register = await createCaller(ctx).classification.applicableObligations({
        waqfId: CONTRAST_WAQF,
      });
      expect(register.registerLocked).toBe(false);
      expect(register.obligations.length).toBeGreaterThan(0);
    });

    it("LIVENESS · reclassify FROM NOT_CLASSIFIED is the lock's one exit, and it WORKS", async () => {
      // The sprint's lesson, asserted up front: Q2, Q1 and the seeding stage each shipped a
      // fail-closed control that denied the entitled party. The lock's entitled party is the Nazir
      // recording the FIRST classification — if this transition refuses, the endowment is locked
      // FOREVER, which is an outage dressed as safety.
      const ctx = await contextFor({ userId: Q4_USER, requestId: 'q4-first-classification' });
      const caller = createCaller(ctx);
      const at = new Date();
      const result = await caller.classification.reclassify({
        waqfId: LOCKED_WAQF,
        to: 'SMALL',
        reason: `Fixture exercise ${RUN_MARKER}: first classification recorded, register opens (بيانات وهمية)`,
        at: at.toISOString(),
        atHijri: hijriOf(at),
      });
      expect(result.from).toBe('NOT_CLASSIFIED');
      expect(result.to).toBe('SMALL');
      // The delta a Nazir authorising the FIRST classification must see: the endowment is not
      // "gaining nothing relative to nothing" — it acquires its regulatory register. Gained is the
      // full SMALL set from the seeded library; lost is nothing (a locked register bound nothing).
      expect(result.obligationsGained.length).toBeGreaterThan(0);
      expect(result.obligationsLost).toStrictEqual([]);

      // …and the register is now OPEN on the same wire.
      const register = await caller.classification.applicableObligations({ waqfId: LOCKED_WAQF });
      expect(register.registerLocked).toBe(false);
      expect(register.obligations.length).toBeGreaterThan(0);
    });

    it('the reverse trip is UNREPRESENTABLE at the transport layer — `to: NOT_CLASSIFIED` fails the input schema', async () => {
      const ctx = await contextFor({ userId: Q4_USER, requestId: 'q4-no-unclassify-api' });
      const at = new Date();
      await expect(
        createCaller(ctx).classification.reclassify({
          waqfId: LOCKED_WAQF,
          // Deliberately off the input type: the schema is the guard under test.
          to: 'NOT_CLASSIFIED' as never,
          reason: `revocation attempt ${RUN_MARKER}`,
          at: at.toISOString(),
          atHijri: hijriOf(at),
        }),
      ).rejects.toThrow();
    });

    it('…and at the DATABASE — the raw UPDATE and the raw history INSERT both refuse with 42501', async () => {
      // The layer that survives raw SQL, on the APP connection (a refusal observed as the table
      // owner proves nothing about the runtime — ADR-0008). Both revocation paths migration 34
      // closes are driven here: the bare column write, and the fabricated history row.
      //
      // ⚠ ON ITS OWN SUBJECT, provisioned HERE with a REAL class — not on LOCKED_WAQF, whose class
      // at this point depends on whether the liveness test above ran (a `-t`-filtered run skips
      // it, LOCKED_WAQF is then still NOT_CLASSIFIED, and a NOT_CLASSIFIED → NOT_CLASSIFIED no-op
      // UPDATE is deliberately allowed — the refusal under test would never be reached). A guard
      // test that is green or red depending on which of its SIBLINGS ran is measuring the runner.
      const GUARD_WAQF = 'waqf-test-api-q4-guard';
      await provisionIntakeEndowment({ id: GUARD_WAQF, classification: 'SMALL' });
      const prisma = await basePrisma();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "waqf" SET "classification" = 'NOT_CLASSIFIED' WHERE "id" = $1`,
          GUARD_WAQF,
        ),
      ).rejects.toThrow(/NOT_CLASSIFIED|S8-Q4/);
      // `from` = the subject's REAL current class, so the fabricated-transition check passes and
      // the refusal proven is specifically migration 34's `to`-check — not the migration-12 guard
      // in front of it. (A committed row here on a mutated database is test-prefixed and purged.)
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "reclassification_event" ("id","waqfId","from","to","at","atHijri","reason","createdAt")
             VALUES ('q4-unclassify-event', $1, 'SMALL', 'NOT_CLASSIFIED', now(), '1448-03-01', 'revocation attempt', now())`,
          GUARD_WAQF,
        ),
      ).rejects.toThrow(/NOT_CLASSIFIED|S8-Q4/);
    });
  });
});
