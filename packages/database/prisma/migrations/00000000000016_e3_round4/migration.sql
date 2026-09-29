-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E3 ROUND 4: THE ROW'S OWN NAME. A CORPUS PARCEL'S PRIMARY KEY IS AN IDENTITY,
--                       NOT AN ATTRIBUTE.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     A ROW MAY NOT BE RENAMED INTO A DIFFERENT ROW. EVERY GUARD THIS SPRINT ADDED WATCHES A
--     COLUMN **OTHER THAN** THE PRIMARY KEY — AND THE PRIMARY KEY IS THE ONE COLUMN THAT DECIDES
--     WHICH THING THE ROW IS.
--
-- ── AV4-01 (HIGH) · THE CORPUS PARCEL'S PRIMARY KEY WAS GOVERNED BY NOTHING ───────────────────
--
--   Every asset guard written in S4 watches `status` (BR-306), `titleDeedNumber` (Binding rule 1),
--   `waqfId` (AV-4, refused outright) or `deletedAt` (AV-4/AV3-03). NONE watches `id`. And the
--   DELETE side is irrelevant here — `asset_no_delete` / `asset_no_truncate` (migration 6) refuse a
--   removal, but a rename REMOVES NOTHING: the row keeps living, under a new name, while a fresh row
--   takes the old name.
--
--   MEASURED BEFORE, as the LEAST-privileged runtime role `qmulate_app`, with no approval in
--   session, on a `--reset` → `migrate deploy` → `db:seed` database at migration 15, every probe
--   inside its own transaction and ROLLED BACK:
--
--     COMMITS   UPDATE "asset" SET "id" = 'asset-001-OLD' WHERE "id" = 'asset-001'
--     COMMITS   …then INSERT INTO "asset" (… "id" = 'asset-001', "titleDeedNumber" =
--               'SUBSTITUTED-999', "valuationSar" = 1.00, "status" = 'ACTIVE' …)
--
--   Two statements. Afterwards `asset-001` — the id every register, report, approval subject
--   (`asset:asset-001:*`) and audit row names — IS A DIFFERENT PARCEL: title deed `FAKE-100` →
--   `SUBSTITUTED-999`, valuation 18,000,000.00 → 1.00. And the trail: **`audit_event` 153 → 153,
--   `expropriation` 1 → 1.** No approval, no audit event, no `Expropriation` row, no DELETE.
--
--   That is an ISTIBDAL performed as a rename. It also FALSIFIES A CLAIM MIGRATION 15 SHIPS, in its
--   own header: *"The route by which a NEW row could replace an EXISTING parcel is DELETE +
--   re-INSERT, and that is closed from the other side by `asset_no_delete` / `asset_no_truncate`."*
--   There is a second route, it needs no DELETE, and migration 15's §1 comment reasoned from the
--   first one to leave `titleDeedNumber` ungated on INSERT. (The reasoning about the INSERT arm is
--   still sound; the premise that the ONLY substitution route was DELETE + re-INSERT was not.)
--
--   For completeness, the one-statement variant of the same act:
--     COMMITS   UPDATE "asset" SET "id" = 'asset-9001', "valuationSar" = 1.00
--               WHERE "id" = 'asset-001'
--   …and the CONTROLS on the same row, same role, same session, all REFUSED 42501:
--   `titleDeedNumber`, `waqfId`, `deletedAt`. The guard family had a hole exactly where nobody was
--   looking: in the column that names the row.
--
-- ── AND THE SAME QUESTION ASKED OF EVERY OTHER TABLE THIS SPRINT GUARDED ──────────────────────
--
--   A hole in the same place on five tables is worth ONE migration, not five. Measured the same
--   way, as `qmulate_app`, rolled back:
--
--     TABLE                     `id` UPDATE          WHAT ACTUALLY ANSWERED
--     asset                     ⚠ COMMITS            nothing
--     waqf                      ⚠ COMMITS            nothing — see below, the seeded refusals are
--                                                    INCIDENTAL
--     beneficiary               ⚠ COMMITS            nothing — on a LEAF (ben-002, ben-003)
--     trusteeship_deed          ⚠ COMMITS            nothing
--     waqf_reversion_taker        REFUSED 42501      `waqf_reversion_taker_no_mutate` (migration 12)
--     reclassification_event      REFUSED 42501      `reclassification_event_no_update` (migration 12)
--
--   ⚠ THE TWO "REFUSALS" ON THE SEEDED `waqf` AND `beneficiary` ROWS WERE NOT GUARDS ANSWERING THE
--   QUESTION — they were OTHER guards tripping over a CASCADE, which is the most dangerous kind of
--   passing measurement because it looks exactly like protection:
--
--     ·  `UPDATE "waqf" SET "id" = 'waqf-001-X'` → 42501, raised by **`asset_identity_guard`**:
--        *asset asset-001: "waqfId" (waqf-001 -> waqf-001-X) may NEVER be changed.* All **21**
--        inbound foreign keys to `waqf` are `ON UPDATE CASCADE` (MEASURED: 21 of 21), so the rename
--        propagated into `asset.waqfId` and migration 14 §1b caught it there — on a DIFFERENT table,
--        about a DIFFERENT column.
--     ·  `UPDATE "waqf" SET "id" = 'waqf-005-X'` (the intake endowment, no assets) → 42501, raised by
--        the `waqf_access_grant` subject write-once guard, again through a cascade.
--     ·  On an endowment with NEITHER assets NOR grants — constructed in-transaction — the rename
--        **COMMITS**, and its `trusteeship_deed` follows it onto the new key by cascade. So the
--        protection was an accident of the fixture, not a property of the schema.
--     ·  `UPDATE "beneficiary" SET "id" = 'ben-001-X'` → 23503 from the RESTRICT self-FK
--        `beneficiary_waqfId_parentId_fkey`, i.e. only because ben-001 HAS A CHILD. A LEAF renames:
--        MEASURED on ben-002, and `distribution_line_item.beneficiaryId` (ON UPDATE CASCADE) FOLLOWED
--        IT — the 34,875.00 line item of `dist-001` now names `ben-002-X`. Re-keying a beneficiary
--        rewrites WHO A PAST DISTRIBUTION PAID, in the append-only-by-intent payout record.
--
-- ── WHY THIS IS REFUSED OUTRIGHT AND NOT GATED BEHIND A RESERVED MATTER ───────────────────────
--
--   ⚠ THIS IS MECHANICAL, NOT A READING OF ANY DEED, AND CARRIES NO `TODO(surface)`.
--   A row's primary key is not an attribute of the thing; it is the name by which every other row,
--   every approval subject string, every audit event and every report refers to it. There is no ACT
--   that a re-key records:
--     ·  corpus leaves an endowment by EXPROPRIATION or ISTIBDAL — each a reserved matter with its
--        own `Expropriation` row and its own approved subject (`asset:<id>:status`) — and arrives by
--        ACQUISITION, which is a new row;
--     ·  a substitution is therefore recorded as A REPLACEMENT ASSET PLUS AN `Expropriation` ROW,
--        never as an edit to the original, whose parcel remains part of a ≥ 10-year retained record
--        (NFR-07 — ⚠ verify, may be stale, confirm vs primary law);
--     ·  and a row created under the wrong id is corrected by a NEW, correct row, exactly as
--        migration 14 §1b already says for `waqfId`.
--   So no approval, no GUC value and no migration opens this — the same posture, for the same
--   reason, as `waqfId`. A gate would imply that some approver could legitimately answer *"yes,
--   rename this parcel into a different parcel"*, and no one can.
--
-- ── WHAT THIS FILE DELIBERATELY DOES *NOT* DO ────────────────────────────────────────────────
--
--   ·  IT DOES NOT TOUCH THE OTHER 15 TABLES WHOSE TEXT PRIMARY KEY IS ALSO UNGOVERNED. A full
--      census over every `text` `id` in schema `public`, run the same way, found `⚠ COMMITS` on:
--        account, approval_request, bank_account, client, compliance_obligation, compliance_task,
--        distribution, distribution_line_item, expropriation, government_filing, holiday_calendar,
--        nazir_fee, setting, transaction, waqif
--      (`membership`, `waqf_access_grant` refused by ACL only; `user` refused incidentally through a
--      grant cascade; 13 tables were EMPTY in the fixture and were NOT probed, so their silence
--      proves nothing — R6-C1's lesson.) Widening the family to `approval_request`, `distribution`,
--      `expropriation` and `transaction` is the obvious next step and it is REPORTED rather than
--      taken here, because this round's brief named six tables and a guard added outside a measured
--      brief is a guard nobody reviewed. **The list above is the report; §1's `CASE` is one arm per
--      table, so extending it is one arm and one `apply` entry.**
--
--   ·  IT DOES NOT GOVERN `waqf."deletedAt"`. MEASURED as `qmulate_app`, no approval, both
--      COMMITTED: `UPDATE "waqf" SET "deletedAt" = now() WHERE "id" = 'waqf-001'`, and an endowment
--      INSERTed already carrying `deletedAt`. Migration 14 §1c/15 §0b closed exactly this on `asset`
--      and carried a `TODO(surface)` asking the PRODUCT OWNER whether every soft retirement of a
--      corpus parcel is a reserved matter. THAT QUESTION IS STILL UNANSWERED, and answering the same
--      question for the ENDOWMENT RECORD by shipping a guard would be engineering deciding scope
--      twice over. Reported, not taken. (See also `scoping.ts`, whose comment about this is
--      corrected in the same change.)
--
--   ·  IT DOES NOT CLOSE AV4-02, AND NOTHING HERE SHOULD BE READ AS IF IT DID. `qmulate_app` can
--      INSERT its own `APPROVED` `RESERVED_MATTER` `approval_request` and spend it in the SAME
--      transaction — MEASURED this round: the forged approval opened both
--      `asset:asset-001:titleDeedNumber` and `asset:asset-001:deletedAt`, with `audit_event`
--      153 → 153. That is PRE-EXISTING (an open question in ADR-0008), it is NOT an S4 regression,
--      and it QUALIFIES every "REFUSED 42501 as qmulate_app" measurement in the V-E3 register.
--      ⚠ IT DOES **NOT** QUALIFY THIS MIGRATION'S REFUSALS: the guard below is unconditional, so
--      there is no key to forge. That is the strongest argument for refusing outright rather than
--      gating.
--
--   ·  IT ADDS NO TABLE, NO COLUMN, NO TYPE AND NO CHECK CONSTRAINT. One trigger function, one
--      `apply` function, four triggers, and two read-only assertion blocks.
--
-- ── WHY A TRIGGER AND NOT A CHECK ────────────────────────────────────────────────────────────
-- A `CHECK` sees ONE row image and can never compare `NEW` to `OLD`, so it cannot express "this
-- value may not CHANGE" at all. This is the same reason `waqf_shart_immutable` is a trigger.
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase and are
-- therefore DOUBLE-QUOTED everywhere — an unquoted identifier is folded to lower case by Postgres
-- and would silently not match. (`id` is lower case either way; it is quoted for consistency.)
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
-- `CREATE TRIGGER`, and read-only verification blocks.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- After any schema change that recreates a guarded table, re-apply EVERY guard set, in order:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
--     SELECT qmulate_apply_e2_grant_admission();
--     SELECT qmulate_apply_e3_deed_terms();
--     SELECT qmulate_apply_e3_closeout();
--     SELECT qmulate_apply_e3_closeout_round2();
--     SELECT qmulate_apply_e3_round4();      -- ← THIS FILE
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — qmulate_identity_immutable()
--
-- ONE body for the whole family. `OLD` / `NEW` are `RECORD` in plpgsql, so `OLD."id"` resolves at
-- run time and the same function serves every table with a text primary key.
--
-- ⚠ ADR-0004 DISCIPLINE APPLIES TO THE TABLE LIST, NOT ONLY TO ENUMS. A table this function has
-- not been taught a REASON for still REFUSES — it does not fall through to "probably fine". The
-- consequence a reader should expect: installing this trigger on a new table works immediately and
-- produces a deliberately blunt message, which is the prompt to come back here and write the one
-- sentence that says what re-keying THAT row would destroy.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_identity_immutable$
DECLARE
  reason text;
BEGIN
  IF NEW."id" IS NOT DISTINCT FROM OLD."id" THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'asset' THEN
      reason :=
        'A corpus parcel''s identity is not an editable attribute. Re-keying it SUBSTITUTES which '
        'parcel the endowment is recorded as holding — MEASURED: rename `asset-001` away, INSERT a '
        'new `asset-001` with another title deed and another valuation, and every register, report '
        'and approval subject (`asset:asset-001:*`) now names a different parcel, with audit_event '
        'unchanged and no Expropriation row. Nothing is DELETED, so `asset_no_delete` never fires. '
        'An istibdal or an expropriation is recorded as a SUBSTITUTION — a replacement asset plus an '
        'Expropriation row, each through its own reserved-matter gate (BR-306) — and NEVER as an edit '
        'to the original, whose row stays part of a >= 10-year retained record (NFR-07). Proceeds of '
        'either act are CORPUS (asl) and must be entered as receiptClass = CAPITAL (Binding rule 1).';
    WHEN 'waqf' THEN
      reason :=
        'The endowment''s identity. All 21 inbound foreign keys to "waqf" are ON UPDATE CASCADE '
        '(MEASURED), so ONE statement re-keys the endowment across the entire database — its deed, '
        'its corpus, its beneficiaries, its ledger, its approvals and its access grants all follow '
        'the new key. The Shart al-Waqif seal, the maal (مآل) clause seal and the write-once deed '
        'terms are all COLUMN guards on this row: they are carried onto the new identity without '
        'ever being touched, which is how an endowment could be re-keyed out from under every '
        'immutability claim ADR-0006 makes about it.';
    WHEN 'beneficiary' THEN
      reason :=
        'A beneficiary''s identity, and it is an ENTITLEMENT fact. `distribution_line_item."beneficiaryId"` '
        'is ON UPDATE CASCADE — MEASURED: renaming a LEAF beneficiary moved dist-001''s 34,875.00 line '
        'item onto the new id — so re-keying rewrites WHO A PAST DISTRIBUTION PAID. The composite key '
        '`beneficiary(waqfId, id)` is also what makes the maal clause''s ultimate taker and the lineage '
        'edge structural rather than editable; re-keying walks around both. Note the RESTRICT self-FK '
        '`beneficiary_waqfId_parentId_fkey` refuses this ONLY for a member who has a child — a leaf was '
        'entirely unprotected, which is why this guard exists rather than the FK being relied on.';
    WHEN 'trusteeship_deed' THEN
      reason :=
        'The Nazir appointment''s identity. The deed records WHO holds the nazarah, the '
        'authorized representative who is jointly and severally liable for their acts (Nazarah reg. '
        'Art. 11(5) — ⚠ verify, may be stale, confirm vs primary law) and the BR-109/NFR-09 '
        'eligibility flags. Re-keying it substitutes one appointment record for another with no '
        'supersession recorded; a changed appointment is a NEW deed row, never an edited one.';
    ELSE
      reason :=
        'This table is NOT classified by qmulate_identity_immutable(). The guard REFUSES rather than '
        'assuming a re-key is harmless (ADR-0004 discipline): whoever installed this trigger here '
        'must add an arm to the CASE in 00000000000016_e3_round4 saying, in one sentence, what '
        're-keying this row would destroy.';
  END CASE;

  RAISE EXCEPTION
    '%.%: the primary key "id" (% -> %) may NEVER be changed. %  No approval, GUC value or '
    'migration opens this — a row''s primary key is the name every other row, every approval '
    'subject string, every audit event and every report refers to it by, and there is no ACT that '
    'a re-key records. If this row is genuinely superseded, record a NEW row; if it was created '
    'under the wrong id, the answer is a new, correct row (AV4-01).',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD."id", NEW."id", reason
    USING ERRCODE = '42501';

  RETURN NULL;
END;
$qm_identity_immutable$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — INSTALL THE FAMILY  (qmulate_apply_e3_round4)
--
-- Four triggers, one per table with a measured hole. `waqf_reversion_taker` and
-- `reclassification_event` are DELIBERATELY ABSENT: both already refuse EVERY update outright
-- (migration 12 §2b / §2c), so a second trigger there would add a weaker second message in front of
-- a stronger one — the same reasoning `scoping.ts` uses for the Shart columns. §3 ASSERTS that
-- premise from the live catalogue rather than trusting this comment.
--
-- ⚠ NO `WHEN` CLAUSE ON THE TRIGGER, ON PURPOSE. `WHEN (OLD."id" IS DISTINCT FROM NEW."id")` would
-- be marginally cheaper and would move the ONE condition that matters out of the function body and
-- into four separate `CREATE TRIGGER` statements — i.e. into the place a later `CREATE OR REPLACE
-- FUNCTION` cannot see and a reviewer reading the function would not check. The body decides.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e3_round4()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_e3r4$
DECLARE
  tbl text;
  guarded_tables text[] := ARRAY['asset', 'waqf', 'beneficiary', 'trusteeship_deed'];
BEGIN
  FOREACH tbl IN ARRAY guarded_tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE EXCEPTION
        'QMULATE E3 round 4: table %I does not exist, so its primary key cannot be sealed. Migration '
        '16 must run AFTER the table it guards.', tbl;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_id_immutable', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW '
      'EXECUTE FUNCTION qmulate_identity_immutable()',
      tbl || '_id_immutable', tbl
    );

    -- `ENABLE ALWAYS` (tgenabled = 'A'), never plain ENABLE. A trigger at 'O' is skipped by any
    -- session that has run `SET session_replication_role = 'replica'` — one plain SET, not DDL, and
    -- the Sprint-1 finding that defeated gate G-1 outright.
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_id_immutable');
  END LOOP;
END;
$qm_apply_e3r4$;

SELECT qmulate_apply_e3_round4();


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — WHAT THIS FILE RELIES ON IS ASSERTED, NOT ASSUMED (ADR-0008 §2.4)
--
-- Two of the six tables in this round's brief are covered by OTHER migrations' blanket refusals.
-- "Already covered" is a claim about another file, and a reliance that is not asserted is a
-- reliance that silently lapses — which is the failure this sprint has now paid for five times.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3r4_verify$
DECLARE
  tbl text;
  trg text;
BEGIN
  -- 3.1 The four triggers this file installs exist, fire on UPDATE, and are ENABLE ALWAYS.
  FOREACH tbl IN ARRAY ARRAY['asset', 'waqf', 'beneficiary', 'trusteeship_deed'] LOOP
    trg := tbl || '_id_immutable';

    -- `tgtype` bit 4 (value 16) = UPDATE.
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = trg AND NOT tgisinternal AND (tgtype & 16) > 0
    ) THEN
      RAISE EXCEPTION
        'QMULATE E3 round 4: % is missing or does not fire on UPDATE. Without it the primary key of '
        '"%" is governed by NOTHING and a row can be renamed into a different row (AV4-01).', trg, tbl;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = trg AND NOT tgisinternal AND tgenabled <> 'A'
    ) THEN
      RAISE EXCEPTION
        'QMULATE E3 round 4: % is not ENABLE ALWAYS. A guard at tgenabled = ''O'' is skipped by any '
        'session that has run SET session_replication_role = ''replica''.', trg;
    END IF;
  END LOOP;

  -- 3.2 The two tables this file deliberately SKIPS are covered by migration 12's blanket refusals.
  --     MEASURED this round on both: an `id` re-key raises 42501 from these two triggers.
  FOREACH trg IN ARRAY ARRAY['waqf_reversion_taker_no_mutate', 'reclassification_event_no_update'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = trg AND NOT tgisinternal AND (tgtype & 16) > 0 AND tgenabled = 'A'
    ) THEN
      RAISE EXCEPTION
        'QMULATE E3 round 4: % is missing, does not fire on UPDATE, or is not ENABLE ALWAYS. This '
        'migration deliberately installs NO id guard on waqf_reversion_taker / '
        'reclassification_event, on the express premise that these two already refuse EVERY update '
        '(migration 12 §2b/§2c). With that premise gone, the maal-clause taker and the BR-104 '
        'classification history are re-keyable by anyone who can UPDATE them — add the table to '
        'qmulate_apply_e3_round4() and an arm to qmulate_identity_immutable().', trg;
    END IF;
  END LOOP;

  -- 3.3 The DELETE side of the same story. A re-key needs no DELETE, which is exactly why this
  --     migration exists — but if the DELETE guards ever went away, a rename would stop being the
  --     ONLY quiet substitution route and the reasoning in §1's `asset` arm would need rewriting.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('asset_no_delete', 'asset_no_truncate') AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 4: asset_no_delete / asset_no_truncate are missing (migration 6).';
  END IF;
END
$qm_e3r4_verify$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — GRANTS FOR THE RUNTIME ROLE
--
-- None. This file creates no TABLE, no TYPE and no column. Trigger functions need no EXECUTE grant —
-- Postgres invokes those through the trigger, never through the caller's privileges.
-- `qmulate_apply_e3_round4()` is a MIGRATION helper and is deliberately NOT granted to the runtime
-- role: it issues DDL, which `qmulate_app` may not do in any case (ADR-0008 round 6).
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- ⚠ MANDATORY IN EVERY MIGRATION THAT ADDS A FUNCTION. Migration 10 §2.4's
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- WAS FALSE FROM THE DAY IT SHIPPED — measured on PostgreSQL 17.10: with no explicit
-- `pg_default_acl` row present, the REVOKE stores nothing and the BUILT-IN default (EXECUTE to
-- PUBLIC) stands. The sweep is reusable and idempotent by design (migration 12 §6).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3r4_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 4: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function — ALTER DEFAULT PRIVILEGES does not protect future '
      'functions on this Postgres (measured, 17.10).';
  END IF;
END
$qm_e3r4_sweep$;

SELECT qmulate_revoke_public_function_execute();
