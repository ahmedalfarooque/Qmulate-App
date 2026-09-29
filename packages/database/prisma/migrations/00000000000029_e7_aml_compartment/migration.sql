-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 29 — E7 / S8 · THE AML NO-TIPPING-OFF COMPARTMENT GETS A SUBJECT
--
-- BR-604 · Nazarah reg. Art. 10(10) · §09 Engine C · §10 §6 · gate G-6 · scenario V-10 / AC-3.
--
-- ── WHAT THE COMPARTMENT WAS BEFORE THIS FILE ────────────────────────────────────────────────
-- It had every access primitive and NO SUBJECT. `Confidentiality.AML_RESTRICTED`, an `AML_OFFICER`
-- role, `AuditClassification.RESTRICTED`, `waqf_access_grant.amlCompartment` +
-- `canViewAmlRestricted` with a CHECK keeping the two booleans agreeing, a mutation-verified read
-- subtraction (`amlClause`) and an audit-feed subtraction (`auditCompartmentClause`) — all of it
-- protecting `Beneficiary` and `Document` rows that happened to be labelled restricted.
-- `AML_CONFIDENTIALITY_MODELS` was literally `['Beneficiary','Document']`, and
-- `aml-compartment.integration.test.ts:20-22` said so in terms: *"there is no SAR model in
-- schema.prisma and no notification fan-out … Do not claim AC-3 green."*
--
-- This file gives it the subject: `aml_report` (the SAR) and `aml_follow_up` (the FIU loop).
--
-- ── ⚠⚠ THE COLUMN IS `confidentiality`, AND §09's OWN TS SHAPE CALLS IT `visibility` ─────────
-- Following the spec there would have silently defeated THREE controls and turned NO test red.
-- MEASURED before this file was written, not reasoned about afterwards:
--   • `deriveClassification()` (src/extensions/audit.ts) reads `row.confidentiality`, so a
--     `visibility` column leaves every SAR's audit events classified ROUTINE — sitting in the feed
--     every non-member reads;
--   • `amlClause()` (src/extensions/scoping.ts) filters on `confidentiality`, so the SAR row itself
--     stays visible to everyone holding any grant on the endowment;
--   • and the both-directions parity assertion in `grant-escalation.integration.test.ts` keys on the
--     literal regex `/^\s*confidentiality\s+Confidentiality\b/`, so a `visibility` column appears on
--     NEITHER side of the comparison and `toEqual` passes.
-- The NAME is the control. §09's vocabulary is the drifted side and is annotated there.
--
-- ── WHY THIS FILE IS HAND-WRITTEN AND NOT `prisma migrate diff`'s OUTPUT ─────────────────────
-- ⚠ **`migrate diff` IS PERMANENTLY NON-EMPTY ON THIS REPOSITORY, AND THAT IS A FINDING OF ITS
-- OWN.** Run against the migration history it proposes two constraints unrelated to this work:
-- `transaction_reversalOfId_fkey` and `transaction_correctionOfId_fkey`. Migration 20 installed
-- those two edges as COMPOSITE FKs — `(waqfId, reversalOfId) -> (waqfId, id)`, the tenancy shape
-- migration 19 introduced — and Prisma's schema language can only express the single-column form, so
-- the diff sees a difference that is really Prisma's inability to model the stronger constraint.
-- Migration 19 §3 explicitly said the single-column FKs "are not redundant: they carry the ON DELETE
-- behaviour"; migration 20 took the composite half and not that one. Practically nothing turns on it
-- (`transaction` carries a no-delete guard, so the ON DELETE path is unreachable) — but it means
-- **`migrate diff` cannot be used as a drift detector here, because it is always dirty**, and a
-- drift detector that always reports drift is one nobody reads. Recorded for E12; NOT fixed inside
-- an AML migration, because quietly adding two FKs to `transaction` under this filename is exactly
-- the kind of change nobody would ever find again.
--
-- ── WHAT THIS FILE DOES **NOT** DO, DELIBERATELY ─────────────────────────────────────────────
--  · It seeds NO compartment member. Whether the legally accountable Nazir is inside the compartment
--    by construction is with the product owner (S8-Q2) and collides with a principle already
--    hard-coded elsewhere: `ApprovalRequest` is forbidden from ever gaining a `confidentiality`
--    column because "an approval hidden by AML classification is one the legally accountable Nazir
--    cannot audit". Same person, opposite answers, and not engineering's to reconcile.
--  · It adds NO retention window guard. §09 rule 6 puts AML records under the >= 10-year floor, and
--    that figure is UNVERIFIED against primary law (binding rule 3) — as is whether the SAR's clock
--    is the same clock. The no-delete guard below is unconditional instead, which is stricter than
--    any window and needs no figure.
--  · It creates NO function, so there is no `qmulate_revoke_public_function_execute()` call. Every
--    guard here reuses a verifier that already exists.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — VOCABULARY AND TABLES
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_enums$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AmlReportStatus') THEN
    CREATE TYPE "AmlReportStatus" AS ENUM ('FILED', 'FIU_FOLLOWUP_REQUESTED', 'RESPONDED', 'CLOSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AmlFollowUpDirection') THEN
    CREATE TYPE "AmlFollowUpDirection" AS ENUM ('FIU_REQUEST', 'OUR_RESPONSE');
  END IF;
END
$qm_e7_enums$;

CREATE TABLE IF NOT EXISTS "aml_report" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "filedByUserId" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "filedAtHijri" TEXT NOT NULL,
    "fiuReference" TEXT,
    "suspicionSummary" TEXT NOT NULL,
    "relatedPartyRefs" TEXT[],
    "status" "AmlReportStatus" NOT NULL DEFAULT 'FILED',
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'AML_RESTRICTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "aml_report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aml_follow_up" (
    "id" TEXT NOT NULL,
    "amlReportId" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "direction" "AmlFollowUpDirection" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "occurredAtHijri" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "documentIds" TEXT[],
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'AML_RESTRICTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "aml_follow_up_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "aml_report_waqfId_status_idx" ON "aml_report"("waqfId", "status");
CREATE INDEX IF NOT EXISTS "aml_follow_up_amlReportId_idx" ON "aml_follow_up"("amlReportId");
CREATE INDEX IF NOT EXISTS "aml_follow_up_waqfId_idx"      ON "aml_follow_up"("waqfId");

DO $qm_e7_fks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aml_report_waqfId_fkey') THEN
    ALTER TABLE "aml_report"
      ADD CONSTRAINT "aml_report_waqfId_fkey"
      FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aml_follow_up_amlReportId_fkey') THEN
    ALTER TABLE "aml_follow_up"
      ADD CONSTRAINT "aml_follow_up_amlReportId_fkey"
      FOREIGN KEY ("amlReportId") REFERENCES "aml_report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$qm_e7_fks$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — THE DEFAULT IS NOT THE CONTROL. THE CHECK IS.
--
-- `confidentiality` DEFAULTs to `AML_RESTRICTED`, and a DEFAULT governs only an INSERT that OMITS
-- the column. An INSERT naming it — which every ORM does, and which `withAudit`'s re-issue through
-- `state.rawTx` certainly does — walks straight past it. A row born `NORMAL` in either of these
-- tables is a tipped-off subject: `amlClause` would not subtract it, `deriveClassification` would
-- label its audit events ROUTINE, and both would be behaving correctly on the data they were given.
--
-- Every row this engine writes is restricted, so the column is not really a choice — it is a
-- CONSTANT the schema has to be able to state. Hence a CHECK rather than trust in the default.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aml_report_always_restricted') THEN
    ALTER TABLE "aml_report"
      ADD CONSTRAINT "aml_report_always_restricted"
      CHECK ("confidentiality" = 'AML_RESTRICTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aml_follow_up_always_restricted') THEN
    ALTER TABLE "aml_follow_up"
      ADD CONSTRAINT "aml_follow_up_always_restricted"
      CHECK ("confidentiality" = 'AML_RESTRICTED');
  END IF;
END
$qm_e7_checks$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — TENANCY: A FOLLOW-UP CANNOT BELONG TO A DIFFERENT ENDOWMENT THAN ITS REPORT
--
-- `aml_follow_up.waqfId` is DENORMALISED, on purpose: a child whose visibility depends on a join is
-- a child one `include` away from being readable, and the nested-`include` bypass of `amlClause` is a
-- RECORDED gap in `SCOPING_KNOWN_GAPS`, not a closed one. So the follow-up carries its own `waqfId`
-- and its own `confidentiality`, and is scopable without touching its parent.
--
-- Denormalising creates the obligation to keep the two in step, which is migration 19 §3's whole
-- subject: a composite FK `(waqfId, amlReportId) -> aml_report(waqfId, id)` makes a cross-endowment
-- follow-up STRUCTURALLY IMPOSSIBLE rather than merely refused by a trigger somebody can disable.
-- It needs a UNIQUE on exactly the referenced columns, which is what the index below is for — `id`
-- is already the primary key, so the pair adds nothing to uniqueness and everything to the FK.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "aml_report_waqfId_id_key" ON "aml_report"("waqfId", "id");

DO $qm_e7_tenancy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aml_follow_up_of_same_waqf') THEN
    ALTER TABLE "aml_follow_up"
      ADD CONSTRAINT "aml_follow_up_of_same_waqf"
      FOREIGN KEY ("waqfId", "amlReportId") REFERENCES "aml_report" ("waqfId", "id");
  END IF;
END
$qm_e7_tenancy$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — RETENTION: HARD DELETE AND TRUNCATE ARE REFUSED, UNCONDITIONALLY
--
-- §09 rule 6: AML records inherit the >= 10-year retention floor and are non-purgeable within it;
-- confidentiality survives the engagement (Art. 22). This guard is UNCONDITIONAL rather than
-- window-based, and that is the stricter and the more honest choice: the >= 10-year figure is
-- UNVERIFIED against primary law (binding rule 3), and whether the SAR's clock is even the same
-- clock is unasked. A guard keyed on a figure nobody has confirmed would encode the figure; a guard
-- keyed on nothing encodes only the rule that this evidence does not get erased.
--
-- Reuses `qmulate_remainder_reject_delete(<hint>)` and `qmulate_reject_truncate()` — both already
-- installed, both `ENABLE ALWAYS` so they survive `session_replication_role = 'replica'`, and the
-- truncate message NAMES `TG_TABLE_NAME`, which is what lets a test tell "this table is guarded"
-- apart from "the statement cascaded into a guarded neighbour" (migration 4's false negative,
-- measured again on `TRUNCATE "client" CASCADE` in migration 8).
--
-- ⚠ The trigger carries **D and T only, never I or U**. This is CENSUS-1's founding incident, in
-- reverse: migration 12 added a DELETE verb to a trigger whose sibling already covered it, the
-- retention mutation control suspended the named guard, and 24 retention tests reported as SKIPPED —
-- including the asl/أصل refusal that Binding rule 1's non-diminution invariant turns on. A verb
-- census cannot see a trigger that guards too much; it can only see one that guards too little.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_retention$
DECLARE
  spec text[];
  tbl  text;
  hint text;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ['aml_report',    'Set "deletedAt" instead — and note that even a SOFT delete here is a reserved matter''s business, not an operational one: a retired SAR is the evidence that a report WAS made to the Financial Intelligence unit, and its absence is indistinguishable from a suspicion nobody reported. §09 rule 6 puts AML records under the retention floor and Art. 22 makes confidentiality survive the engagement, so the row outlives the mandate.'],
    ['aml_follow_up', 'Set "deletedAt" instead. This row is one leg of the FIU correspondence loop; erasing one turns "reported and fully responded" into "reported", which is the difference between discharging Art. 10(10) and breaching it.']
  ]
  LOOP
    tbl  := spec[1];
    hint := spec[2];

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_no_delete', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW '
      'EXECUTE FUNCTION qmulate_remainder_reject_delete(%L)',
      tbl || '_no_delete', tbl, hint
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_no_delete');

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_no_truncate', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT '
      'EXECUTE FUNCTION qmulate_reject_truncate()',
      tbl || '_no_truncate', tbl
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_no_truncate');
  END LOOP;
END
$qm_e7_retention$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — GRANTS FOR THE RUNTIME ROLE
--
-- Since ADR-0008 round 6 the runtime role owns no table and is granted privileges table by table. A
-- NEW table with no grant is invisible to the application — fail-closed, but as an OUTAGE.
--
-- ⚠ `qmulate_apply_privilege_matrix()` is NOT called here, and that is deliberate even though
-- migration 11 declared it "THE RULE FOR EVERY FUTURE MIGRATION". Measured: across migrations 12-28
-- it is called ZERO times, and the actually-practised pattern is migration 12 §5's role-guarded
-- GRANTs whose SHAPE matches the table's mutability. The matrix's DEFAULT arm grants
-- SELECT, INSERT, UPDATE — which is the WRONG shape for an append-only table, so re-running it would
-- be a widening dressed as a convention.
--
-- THE SHAPES, and why they differ:
--   · `aml_report`     SELECT, INSERT, UPDATE — `status` legitimately moves along the FIU loop
--                      (FILED -> FIU_FOLLOWUP_REQUESTED -> RESPONDED -> CLOSED) and `fiuReference`
--                      arrives later than the filing. No DELETE: §4 refuses it anyway, and a grant
--                      that permits what a trigger refuses is a confusing pair to read.
--   · `aml_follow_up`  SELECT, INSERT only. A piece of correspondence that already happened does not
--                      change; correcting one is a new leg, which is also how the record stays
--                      readable as a sequence.
-- ⚠ NEITHER GRANT IS A READ PERMISSION. The application role holding SELECT is what makes the rows
-- reachable at all; whether a given CALLER may see them is `amlClause` + `requireAmlMember`, and the
-- compartment default is EMPTY. A grant here is not a widening of the compartment.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "aml_report"    TO qmulate_app;
    GRANT SELECT, INSERT         ON TABLE "aml_follow_up" TO qmulate_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_provisioner') THEN
    -- The provisioner mints and widens SEATS. It has no business reading a SAR, and §10 §6's
    -- compartment is not a seat-level fact — so it gets nothing here at all.
    NULL;
  END IF;
END
$qm_e7_grants$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — APPLY-TIME VERIFICATION
--
-- Fails LOUDLY rather than silently degrading. A database where the SAR tables exist WITHOUT their
-- restriction CHECK, their tenancy FK or their retention guards is worse than one without the tables:
-- it looks like a compartment and behaves like a table.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_verify$
DECLARE
  missing text[] := ARRAY[]::text[];
  needed  text;
BEGIN
  FOREACH needed IN ARRAY ARRAY['aml_report', 'aml_follow_up'] LOOP
    IF to_regclass(format('public.%I', needed)) IS NULL THEN
      missing := missing || ('table ' || needed);
    END IF;
  END LOOP;

  FOREACH needed IN ARRAY ARRAY[
    'aml_report_always_restricted', 'aml_follow_up_always_restricted',
    'aml_follow_up_of_same_waqf', 'aml_report_waqfId_fkey', 'aml_follow_up_amlReportId_fkey'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = needed) THEN
      missing := missing || ('constraint ' || needed);
    END IF;
  END LOOP;

  FOREACH needed IN ARRAY ARRAY[
    'aml_report_no_delete', 'aml_report_no_truncate',
    'aml_follow_up_no_delete', 'aml_follow_up_no_truncate'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
       WHERE t.tgname = needed AND NOT t.tgisinternal
         AND t.tgenabled = 'A'  -- ENABLE ALWAYS, or it does not survive the replica role
    ) THEN
      missing := missing || ('ENABLE ALWAYS trigger ' || needed);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E7 AML compartment: % control(s) did not install: %. The SAR tables must never exist '
      'without their restriction CHECK, their same-endowment FK and their ENABLE ALWAYS retention '
      'guards — a compartment missing any of those looks like a compartment and behaves like a '
      'table (BR-604, §09 Engine C rule 6, §10 §6).',
      array_length(missing, 1), array_to_string(missing, ', ');
  END IF;
END
$qm_e7_verify$;
