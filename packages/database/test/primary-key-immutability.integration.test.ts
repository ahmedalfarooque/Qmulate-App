// QMULATE — S4/E3 ROUND 4: THE ROW'S OWN NAME.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ONE SENTENCE THIS FILE EXISTS TO FALSIFY
// ═══════════════════════════════════════════════════════════════════════════════════════════
//     "A row cannot be renamed into a different row."
//
// It was FALSE until migration 16. Every guard S4 added watches `status`, `titleDeedNumber`,
// `waqfId` or `deletedAt`; NONE watched the primary key, and the DELETE guards are irrelevant
// because a rename deletes nothing.
//
// MEASURED BEFORE, as the LEAST-privileged runtime role `qmulate_app`, no approval in session, on a
// `--reset` → `migrate deploy` → `db:seed` database at migration 15, each probe rolled back:
//
//   COMMITS  UPDATE "asset" SET "id" = 'asset-001-OLD' WHERE "id" = 'asset-001'
//   COMMITS  …then INSERT INTO "asset" (… 'asset-001', 'SUBSTITUTED-999', 1.00, 'ACTIVE' …)
//            → `asset-001` is now a DIFFERENT parcel: deed FAKE-100 → SUBSTITUTED-999, valuation
//              18,000,000.00 → 1.00, with `audit_event` 153 → 153 and `expropriation` 1 → 1.
//   COMMITS  trusteeship_deed.id, beneficiary.id (on a LEAF — and `distribution_line_item`
//            FOLLOWED it by ON UPDATE CASCADE, so dist-001's 34,875.00 line item named the new id),
//            and waqf.id on an endowment with neither assets nor grants.
//
// ⚠ AND THE TWO SEEDED "REFUSALS" WERE NOT GUARDS ANSWERING THE QUESTION. `waqf.id` on waqf-001 was
// refused by `asset_identity_guard` — a DIFFERENT table's guard about a DIFFERENT column, reached
// through one of the 21 `ON UPDATE CASCADE` foreign keys into `waqf`; on waqf-005 by the
// `waqf_access_grant` subject guard, the same way; `beneficiary.id` by the RESTRICT self-FK, which
// only fires for a member who HAS A CHILD. An incidental refusal is the most dangerous passing
// measurement available: it is indistinguishable from protection until the fixture changes.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ WHAT A "REFUSED 42501" IN THIS REPOSITORY DOES AND DOES NOT PROVE  (AV4-02, PRE-EXISTING)
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `qmulate_app` — the least-privileged runtime role — CAN MINT ITS OWN `APPROVED`
// `RESERVED_MATTER` `approval_request` AND SPEND IT IN THE SAME TRANSACTION. MEASURED this round,
// rolled back:
//
//   ⚠ COMMITS  INSERT INTO "approval_request" (… 'RESERVED_MATTER', 'APPROVED',
//                makerId = user-accountant-001, checkerId = user-approver-001,
//                subjectId = 'asset:asset-001:titleDeedNumber' …)
//   ⚠ COMMITS  SELECT set_config('qmulate.reserved_matter_approval_id', <that id>, true)
//              UPDATE "asset" SET "titleDeedNumber" = 'FORGED-999' WHERE "id" = 'asset-001'
//              → audit_event 153 → 153. The same forged key also opened `asset:asset-001:deletedAt`.
//
// So every "REFUSED 42501 as `qmulate_app`" measurement in the V-E3 register — INCLUDING the ones
// round 3 added — proves that A KEY IS REQUIRED. It does NOT prove that the AUTHORITY the key
// stands for was ever exercised: an actor holding the application's database credential can forge
// one. This is PRE-EXISTING, it is already a named open question in ADR-0008, and it is NOT an S4
// regression. It is written here rather than fixed here because closing it is a design change to
// the approval plane, not a guard.
//
// ⚠ IT DOES NOT QUALIFY THE REFUSALS IN **THIS** FILE, and that is the point of the design under
// test: `qmulate_identity_immutable()` consults NO approval, so there is no key to forge. The
// "a genuine approval does not open it" probe below deliberately mints its approval through
// AV4-02's own route, because that produces the strongest key available — and the guard still
// refuses.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVERY PROBE HERE IS ROLLED BACK
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `asset`, `waqf`, `beneficiary` and `trusteeship_deed` are retention-guarded: a row this suite
// leaves behind can never be removed. Every statement below runs inside a `DO` block that ends in
// `RAISE`, so one block = one statement = one transaction, and even a MISSING guard cannot leave a
// row or take one away.
//
// ── AND THE PROBES RUN AS THE OWNER (ADR-0008 round 6) ───────────────────────────────────────
// `runProbe()` uses the privileged connection deliberately, so that what refuses is always the
// GUARD and never the ACL. Each claim is therefore the stronger one: *even the table owner cannot
// do this.* The `session_replication_role = 'replica'` probes route to the platform superuser
// automatically, because that parameter is superuser-only — and those are the ones that prove
// `ENABLE ALWAYS`, the property one plain `SET` would otherwise defeat.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FICTIONAL_MARKER_AR,
  PROBE_BLOCKED,
  PROBE_NOT_BLOCKED,
  PROBE_SUCCEEDED,
  SQLSTATE_BY_CONDITION,
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  guardProbeSql,
  hasDatabase,
  privilegedPrisma,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('AV4-01 — primary-key immutability on the corpus, deed, endowment and beneficiary');

/**
 * The four tables migration 16 seals, each with the subject the "before" measurement used and a
 * fragment of the reason its `CASE` arm gives. The fragment is asserted so that a future edit
 * cannot swap a table's message for another table's and still pass.
 */
const SEALED = [
  {
    table: 'asset',
    id: 'asset-001',
    renamed: 'asset-001-OLD',
    fragment: "A corpus parcel's identity is not an editable attribute",
  },
  {
    table: 'waqf',
    id: 'waqf-005',
    renamed: 'waqf-005-X',
    fragment: 'All 21 inbound foreign keys',
  },
  {
    table: 'beneficiary',
    // ⚠ A LEAF, ON PURPOSE. ben-001 has a child, so the RESTRICT self-FK would refuse it with
    // 23503 and the probe would pass without the guard existing at all — which is exactly how this
    // hole survived. ben-003 has no children (MEASURED) and was one of the rows that COMMITTED.
    id: 'ben-003',
    renamed: 'ben-003-X',
    fragment: 'WHO A PAST DISTRIBUTION PAID',
  },
  {
    table: 'trusteeship_deed',
    id: 'trust-waqf-001',
    renamed: 'trust-waqf-001-X',
    fragment: 'The Nazir appointment',
  },
] as const;

/** The exact set of triggers migration 16 installs. Pinned so the claim's boundary is explicit. */
const EXPECTED_ID_TRIGGERS = [
  'asset_id_immutable',
  'beneficiary_id_immutable',
  // ⊕ WIDENED TO SIX IN S8 (migration 31, owner ruling S8-Q5). The comment on the census test below
  // said it in terms — "If you widen the family, you must widen this list and the migration together,
  // which is what makes the widening visible in review" — so this is that widening, visible.
  //
  // WHY THESE TWO. `compliance_obligation`'s content is now immutable within a library version, and a
  // content guard is worth nothing while the row's IDENTITY can move: leave every column alone and
  // renumber the row onto another obligation's id, and every task pointing at the old id records a
  // different duty. Migration 16's own census MEASURED that UPDATE committing as `qmulate_app`.
  // `compliance_task` is the same exposure one level down — its frozen (code, version) snapshot is
  // meaningless if the row it sits on can be renamed onto another task's identity.
  'compliance_obligation_id_immutable',
  'compliance_task_id_immutable',
  'trusteeship_deed_id_immutable',
  'waqf_id_immutable',
] as const;

/**
 * A probe of a SEQUENCE whose FIRST refused statement is the assertion. `guardProbeSql` wraps one
 * statement; the substitution route is two, and running only the first would not show that the
 * route is closed at its head. A sibling copy of this shape lives in
 * `e3-deed-term-guards.integration.test.ts` (`probeWithSetupSql`); it is deliberately not shared,
 * because moving it into `setup.ts` would edit a file four other suites depend on.
 */
function sequenceProbeSql(
  statements: readonly string[],
  condition: 'insufficient_privilege',
): string {
  return [
    'DO $qm_probe$',
    'BEGIN',
    ...statements.map((statement) => `  ${statement};`),
    `  RAISE EXCEPTION '${PROBE_NOT_BLOCKED}' USING ERRCODE = 'P0001';`,
    'EXCEPTION',
    `  WHEN ${condition} THEN`,
    `    RAISE EXCEPTION '${PROBE_BLOCKED}[${SQLSTATE_BY_CONDITION[condition]}]: %', SQLERRM USING ERRCODE = 'P0001';`,
    'END',
    '$qm_probe$;',
  ].join('\n');
}

/** Mints an APPROVED, artifact-bound RESERVED_MATTER approval. See the AV4-02 block above. */
function mintApprovalSql(approvalId: string, waqfId: string, subjectId: string): string {
  // ⊕ S12-2 (migration 51): a KINDED reserved matter requires counsel review ("every matter") and
  // cannot be APPROVED with its chain unrecorded — so the probe row carries both steps as recorded
  // facts. This file measures the primary-key seal, not the chain.
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","payload","status","makerId","checkerId","counselReviewRequired",
       "authorityNoticeRequired","subjectId","payloadHash","checkerTotpAssertedAt","decidedAt",
       "decidedAtHijri","reservedMatterKind",
       "principalConsentRecordedAt","principalConsentRecordedAtHijri","principalConsentBy","principalConsentReference",
       "counselReviewRecordedAt","counselReviewRecordedAtHijri","counselReviewBy","counselReviewReference",
       "createdAt","updatedAt")
    VALUES ('${approvalId}', '${waqfId}', 'RESERVED_MATTER', '{"kind":"probe"}'::jsonb, 'APPROVED',
            'user-accountant-001', 'user-approver-001', true, false, '${subjectId}',
            '${'c'.repeat(64)}', now(), now(), '1447-08-13', 'ASSET_DISPOSAL',
            '2026-02-01T00:00:00.000Z'::timestamp, '1447-08-13', 'user-case-manager-001', 'FAKE-BOARD-LETTER-AV4-01',
            '2026-02-01T00:00:00.000Z'::timestamp, '1447-08-13', 'user-case-manager-001', 'FAKE-COUNSEL-MEMO-AV4-01',
            now(), now())`;
}

describe.skipIf(!hasDatabase)('AV4-01 — a row may not be renamed into a different row', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    await ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE FOUR TABLES WHOSE PRIMARY KEY WAS MEASURED UNGOVERNED
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the four tables migration 16 seals', () => {
    it.each(SEALED)(
      '$table: re-keying $id is refused 42501, and the message says what it would destroy',
      async ({ table, id, renamed, fragment }) => {
        const text = await runProbe(
          guardProbeSql(
            `UPDATE "${table}" SET "id" = '${renamed}' WHERE "id" = '${id}'`,
            'insufficient_privilege',
          ),
        );
        expect(text).toContain(PROBE_BLOCKED);
        expect(text).toContain('may NEVER be changed');
        expect(text).toContain(fragment);
        // The guard must name BOTH images. A refusal that does not say what it refused to become
        // is unusable in an incident.
        expect(text).toContain(id);
        expect(text).toContain(renamed);
      },
    );

    it('an ORDINARY column on the same row is still writable — the guard refuses a route, not a table', async () => {
      // A guard that refuses everything is an outage, not a control. `addressEn` gates nothing:
      // it is not a founder's condition, not a corpus identity and not an entitlement fact.
      const text = await runProbe(
        rollbackProbeSql([
          `UPDATE "asset" SET "addressEn" = 'probe address' WHERE "id" = 'asset-001'`,
        ]),
      );
      expect(text).toContain(PROBE_SUCCEEDED);
    });

    it('a NO-OP write of the same id is not refused — `IS DISTINCT FROM`, not "id was in the payload"', async () => {
      // Prisma's `upsert` sends `id` in its update payload. A guard keyed on "the column appears
      // in the statement" rather than on "the value changed" would break `db:seed` on its second
      // run, which is exactly the kind of guard that gets switched off within a week.
      const text = await runProbe(
        rollbackProbeSql([
          `UPDATE "asset" SET "id" = 'asset-001', "addressEn" = 'probe address' WHERE "id" = 'asset-001'`,
        ]),
      );
      expect(text).toContain(PROBE_SUCCEEDED);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. THE SUBSTITUTION ROUTE ITSELF — the act the rename made possible
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the istibdal-by-rename route is closed at its head', () => {
    it('rename the parcel away, then INSERT a new one under the old id — refused at the rename', async () => {
      const text = await runProbe(
        sequenceProbeSql(
          [
            `UPDATE "asset" SET "id" = 'asset-001-OLD' WHERE "id" = 'asset-001'`,
            `INSERT INTO "asset"
                 ("id","waqfId","type","titleDeedNumber","addressAr","acquiredDate",
                  "acquiredDateHijri","valuationSar","status","createdAt","updatedAt")
               VALUES ('asset-001','waqf-001','land_parcel','SUBSTITUTED-999',
                       'قطعة بديلة ${FICTIONAL_MARKER_AR}','2020-01-01','1441-05-06',
                       1.00,'ACTIVE', now(), now())`,
          ],
          'insufficient_privilege',
        ),
      );
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('may NEVER be changed');
      // The remedy a Nazir needs, not just a refusal.
      expect(text).toContain('Expropriation row');
    });

    it('the ONE-statement variant — a new identity and a new valuation together — is refused', async () => {
      const text = await runProbe(
        guardProbeSql(
          `UPDATE "asset" SET "id" = 'asset-9001', "valuationSar" = 1.00 WHERE "id" = 'asset-001'`,
          'insufficient_privilege',
        ),
      );
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('asset-9001');
    });

    it('the corpus parcel and the audit trail are untouched afterwards', async () => {
      // The probes above all roll back, but "rolled back" is a property of the harness and this
      // is a property of the database. Read it, do not assume it.
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ id: string; titleDeedNumber: string }[]>(
        `SELECT "id", "titleDeedNumber" FROM "asset" WHERE "id" LIKE 'asset-001%' ORDER BY "id"`,
      );
      expect(rows).toEqual([{ id: 'asset-001', titleDeedNumber: 'FAKE-100' }]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. NO KEY OPENS IT
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('nothing opens the identity guard', () => {
    it('a genuine, APPROVED, artifact-bound RESERVED_MATTER approval does NOT open asset.id', async () => {
      // ⚠ The approval is minted inside the probe, through AV4-02's own route (see the header).
      // That is deliberate: it produces the STRONGEST key obtainable in this schema — genuine
      // row, APPROVED, maker ≠ checker, on the right endowment, naming the right artifact — with
      // no scaffolding and no committed side effect. If a key like that does not open the gate,
      // no key does.
      const text = await runProbe(
        sequenceProbeSql(
          [
            mintApprovalSql('appr-probe-9601', 'waqf-001', 'asset:asset-001:id'),
            // `PERFORM`, not `SELECT` — inside a plpgsql block a bare SELECT has no destination.
            `PERFORM set_config('qmulate.reserved_matter_approval_id','appr-probe-9601',true)`,
            `UPDATE "asset" SET "id" = 'asset-001-OLD' WHERE "id" = 'asset-001'`,
          ],
          'insufficient_privilege',
        ),
      );
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('No approval, GUC value or migration opens this');
    });

    it("`session_replication_role = 'replica'` does not skip it — ENABLE ALWAYS", async () => {
      // Routed to the platform superuser by `runProbe`, because the parameter is superuser-only.
      // This is the Sprint-1 bypass that defeated gate G-1: one plain SET, not DDL.
      const text = await runProbe(
        guardProbeSql(
          `SET LOCAL session_replication_role = 'replica';
             UPDATE "asset" SET "id" = 'asset-001-OLD' WHERE "id" = 'asset-001'`,
          'insufficient_privilege',
        ),
      );
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('may NEVER be changed');
    });

    it('the least-privileged runtime role gets the same refusal, not an ACL error', async () => {
      // Everything above runs as the OWNER, which is the stronger claim but not the deployed one.
      // `qmulate_app` is the role the application actually holds, and it is the role that
      // COMMITTED this rename before migration 16. It must now meet the GUARD — not
      // `permission denied for table asset`, which would mean the ACL is doing the work and the
      // guard is untested on the only connection that matters.
      const prisma = await basePrisma();
      let caught: unknown = null;
      try {
        await prisma.$executeRawUnsafe(
          guardProbeSql(
            `UPDATE "asset" SET "id" = 'asset-001-OLD' WHERE "id" = 'asset-001'`,
            'insufficient_privilege',
          ),
        );
      } catch (error: unknown) {
        caught = error;
      }
      const text = errorText(caught);
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('may NEVER be changed');
      expect(text).not.toContain('permission denied for table');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. THE TWO TABLES MIGRATION 16 DELIBERATELY SKIPS — "already covered" is a claim, so it is
  //    MEASURED, not read off migration 12's source.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the two tables already covered by a blanket refusal', () => {
    it('waqf_reversion_taker: re-keying a recorded ultimate taker is refused', async () => {
      // waqf_reversion_taker is EMPTY in the fixture, so the row has to be constructed. A property
      // whose subject cannot be reached reports its silence as success (R6-C1) — an "EMPTY, not
      // probed" row in a census is not a pass.
      const text = await runProbe(
        sequenceProbeSql(
          [
            `UPDATE "waqf" SET "reversionClauseCaptured" = true,
                 "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER',
                 "reversionRecordedAt" = '2026-02-01'::timestamp,
                 "reversionRecordedAtHijri" = '1447-08-13' WHERE "id" = 'waqf-005'`,
            `INSERT INTO "beneficiary"
                 ("id","waqfId","branch","relationshipAr","kind","residency","line","active",
                  "verificationStatus","isUbo","confidentiality","createdAt","updatedAt")
               VALUES ('ben-9601','waqf-005','Charitable','جهة خيرية ${FICTIONAL_MARKER_AR}',
                       'CHARITABLE_JIHA','DOMESTIC','NA',true,'VERIFIED',false,'NORMAL',now(),now())`,
            `INSERT INTO "waqf_reversion_taker" ("id","waqfId","beneficiaryId","createdAt")
               VALUES ('rev-9601','waqf-005','ben-9601', now())`,
            `UPDATE "waqf_reversion_taker" SET "id" = 'rev-9602' WHERE "id" = 'rev-9601'`,
          ],
          'insufficient_privilege',
        ),
      );
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('waqf_reversion_taker');
      expect(text).toContain('write-once');
    });

    it('reclassification_event: re-keying a BR-104 history row is refused', async () => {
      const text = await runProbe(
        sequenceProbeSql(
          [
            `INSERT INTO "reclassification_event" ("id","waqfId","from","to","at","atHijri","reason","createdAt")
               VALUES ('recl-9601','waqf-001',
                       (SELECT "classification" FROM "waqf" WHERE "id" = 'waqf-001'),
                       'LARGE', now(), '1447-08-13', 'probe ${FICTIONAL_MARKER_AR}', now())`,
            `UPDATE "reclassification_event" SET "id" = 'recl-9602' WHERE "id" = 'recl-9601'`,
          ],
          'insufficient_privilege',
        ),
      );
      expect(text).toContain(PROBE_BLOCKED);
      expect(text).toContain('APPEND-ONLY');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 5. THE BOUNDARY OF THE CLAIM, READ FROM THE LIVE CATALOGUE
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the installed guard family', () => {
    it('is EXACTLY the four tables named — no more, no fewer', async () => {
      // ⚠ THIS TEST IS THE HONEST EDGE OF THE CLAIM, NOT A CEILING. A full census of every `text`
      // primary key in schema `public`, run the same way as the "before" measurement, still finds
      // `⚠ COMMITS` on THIRTEEN other tables: account, approval_request, bank_account, client,
      // distribution, distribution_line_item, expropriation, government_filing, holiday_calendar,
      // nazir_fee, setting, transaction, waqif. That residue is REPORTED, not silently absorbed —
      // this round's brief named six tables.
      //
      // ⊖ `compliance_obligation` and `compliance_task` LEFT that residue list in S8 (migration 31):
      // they are now IN the family. Two of fifteen closed, thirteen still open — and the count is
      // updated here rather than left at fifteen, because a residue list that overstates itself is
      // just as misleading as one that understates. If you widen the family, you must widen this list and
      // `qmulate_apply_e3_round4()` together, which is what makes the widening visible in review.
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
        `SELECT t.tgname, t.tgenabled::text AS tgenabled
             FROM pg_trigger t
             JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname = 'public'
              AND t.tgname LIKE '%\\_id\\_immutable'
            ORDER BY t.tgname`,
      );
      expect(rows.map((r) => r.tgname)).toEqual([...EXPECTED_ID_TRIGGERS]);
    });

    it('every one of them is ENABLE ALWAYS and fires on UPDATE', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        { tgname: string; tgenabled: string; fires_on_update: boolean }[]
      >(
        `SELECT tgname, tgenabled::text AS tgenabled, (tgtype & 16) > 0 AS fires_on_update
             FROM pg_trigger
            WHERE NOT tgisinternal AND tgname LIKE '%\\_id\\_immutable'
            ORDER BY tgname`,
      );
      expect(rows).toHaveLength(EXPECTED_ID_TRIGGERS.length);
      for (const row of rows) {
        // 'A' = ALWAYS. 'O' = origin-only, which one `SET session_replication_role = 'replica'`
        // skips — the Sprint-1 finding that defeated gate G-1 outright.
        expect(row.tgenabled, `${row.tgname} must be ENABLE ALWAYS`).toBe('A');
        expect(row.fires_on_update, `${row.tgname} must fire on UPDATE`).toBe(true);
      }
    });

    it('the two blanket guards migration 16 relies on are still installed and ENABLE ALWAYS', async () => {
      // Migration 16 installs NO id guard on these two tables, on the express premise that they
      // already refuse EVERY update. A reliance that is not asserted is a reliance that silently
      // lapses (ADR-0008 §2.4). The migration asserts this at apply time; this asserts it at every
      // run, which is the difference between "it was true when we deployed" and "it is true".
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
        `SELECT tgname, tgenabled::text AS tgenabled FROM pg_trigger
            WHERE NOT tgisinternal AND (tgtype & 16) > 0
              AND tgname IN ('waqf_reversion_taker_no_mutate','reclassification_event_no_update')
            ORDER BY tgname`,
      );
      expect(rows.map((r) => r.tgname)).toEqual([
        'reclassification_event_no_update',
        'waqf_reversion_taker_no_mutate',
      ]);
      for (const row of rows) expect(row.tgenabled).toBe('A');
    });

    it('the trigger function exists and is not PUBLIC-executable', async () => {
      // Migration 10 §2.4's `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
      // never protected a future function (measured, PostgreSQL 17.10). Every migration that adds
      // one must end in `qmulate_revoke_public_function_execute()`; this checks that it did.
      const { Prisma } = await databaseModule();
      void Prisma;
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ proname: string; public_execute: boolean }[]>(
        `SELECT p.proname,
                  has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
             FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('qmulate_identity_immutable','qmulate_apply_e3_round4')
            ORDER BY p.proname`,
      );
      expect(rows.map((r) => r.proname)).toEqual([
        'qmulate_apply_e3_round4',
        'qmulate_identity_immutable',
      ]);
      for (const row of rows) {
        expect(row.public_execute, `${row.proname} must not be PUBLIC-executable`).toBe(false);
      }
    });
  });
});
