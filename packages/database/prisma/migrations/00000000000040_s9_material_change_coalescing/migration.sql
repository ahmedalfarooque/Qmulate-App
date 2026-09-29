-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 40 — S9-3c · §09's CHANGE-SET, AND "ONE OPEN UPDATE OBLIGATION PER WAQF" MADE
--                UNREPRESENTABLE
--
-- §09 Engine B, "Triggers → auto-raise the 15-bd update", verbatim on both halves:
--
--   > **Material change.** Other modules emit a domain event `MaterialChange { waqfId, kind:
--   > "asset" | "beneficiary" | "nazarah", effectiveDate, sourceRef }` … On receipt the engine
--   > raises `GOV-REG-02` clocked from `effectiveDate`.
--
--   > **Coalescing.** There is **one open update obligation per waqf** at a time. Concurrent
--   > material changes append to its change-set rather than spawning parallel clocks; the due
--   > date is driven by the **earliest un-filed** change's effective date (the tightest deadline
--   > governs). Filing the update closes the task and clears the change-set; a subsequent change
--   > opens a fresh clock.
--
-- ── WHY A TABLE AND NOT JUST AN EVENT ───────────────────────────────────────────────────────
-- A domain event with nowhere to land cannot support either clause. "The earliest un-filed
-- change" is a QUERY over recorded changes; "a subsequent change opens a fresh clock" requires
-- knowing which changes were already filed. Emitting `MaterialChange` into a queue and raising a
-- task would satisfy the trigger sentence and quietly drop the coalescing sentence — which is the
-- half that stops three asset disposals in one week becoming three parallel statutory clocks, and
-- (in the other direction) stops a batch of changes buying more time than the tightest of them
-- allowed.
--
-- ── THE PIECES ───────────────────────────────────────────────────────────────────────────────
--  1. `MaterialChangeKind` — §09's three names, CLOSED. No `OTHER`.
--  2. `material_change` — the change-set: the cause tuple, `sourceRef`, change-set membership,
--     and the filed pair. CHECKs tie every dual-date pair and the filed pair together.
--  3. `material_change_cause_frozen` (BEFORE UPDATE, ENABLE ALWAYS) — `effectiveDate` IS the
--     statutory clock (CDE-Q2, owner-provisional 2026-08-25: *"the clock runs from the change's
--     effective date … a late discovery does not extend the deadline"*). Editing it moves a
--     deadline without recomputing it — exactly what `deadline_frozen_identity` (migration 38)
--     prevents one table over. A correction is a NEW change row.
--  4. `material_change_filing_write_once` (BEFORE UPDATE, ENABLE ALWAYS) — un-filing a change
--     resurrects a discharged clock; and re-pointing `complianceTaskId` after it is bound moves a
--     cause between duties (migration 35's re-point lesson, third table now).
--  5. `material_change_no_delete` / `_no_truncate` — this table JOINS migration 8's retention
--     family, reusing ITS function and ITS hint mechanism. ⚠ Deliberately NOT a re-declaration of
--     anything: `material_change` does not exist before this file, so there is nothing here to
--     silently replace. (Migration 38's first draft re-created `deadline_no_delete` and would
--     have replaced migration 8's; the guard-verb census caught it. That is why this section says
--     out loud which function it reuses and why it is additive.)
--  6. **`compliance_task_one_open_update_per_waqf`** — a PARTIAL UNIQUE INDEX making §09's
--     "one open update obligation per waqf" UNREPRESENTABLE rather than merely enforced in code.
--     The application coalesces; this is what happens when it forgets.
--
-- NO new function is created for §5 (migration 8's `qmulate_remainder_reject_delete()` and
-- migration 4's `qmulate_reject_truncate()` are reused as-is — both NO-ARG, because a PL/pgSQL
-- trigger function declares no parameters and takes its hint via `TG_ARGV`) — but §3 and §4 do create two, so
-- the migration-12 §6 sweep is mandatory and is called at the end.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — VOCABULARY ───────────────────────────────────────────────────────────────────
DO $qm_mc_kind$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaterialChangeKind') THEN
    CREATE TYPE "MaterialChangeKind" AS ENUM ('ASSET', 'BENEFICIARY', 'NAZARAH');
  END IF;
END
$qm_mc_kind$;


-- ── SECTION 2 — THE CHANGE-SET TABLE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "material_change" (
  "id"                 TEXT NOT NULL,
  "waqfId"             TEXT NOT NULL,
  "kind"               "MaterialChangeKind" NOT NULL,
  "effectiveDate"      TIMESTAMP(3) NOT NULL,
  "effectiveDateHijri" TEXT NOT NULL,
  "sourceRef"          TEXT NOT NULL,
  "complianceTaskId"   TEXT,
  "filedAt"            TIMESTAMP(3),
  "filedAtHijri"       TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "createdBy"          TEXT,
  "deletedAt"          TIMESTAMP(3),
  CONSTRAINT "material_change_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "material_change" DROP CONSTRAINT IF EXISTS "material_change_waqfId_fkey";
ALTER TABLE "material_change" ADD CONSTRAINT "material_change_waqfId_fkey"
  FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The coalescing hot query: this endowment's UN-FILED members, earliest effective date first.
CREATE INDEX IF NOT EXISTS "material_change_waqfId_filedAt_effectiveDate_idx"
  ON "material_change" ("waqfId", "filedAt", "effectiveDate");
CREATE INDEX IF NOT EXISTS "material_change_complianceTaskId_idx"
  ON "material_change" ("complianceTaskId");

-- The FILED pair travels together. "Cleared the change-set" is recorded as a FACT (a date and its
-- frozen twin), never as an absence — half of it is a row nobody can date the discharge from.
ALTER TABLE "material_change" DROP CONSTRAINT IF EXISTS "material_change_filed_dual_dated";
ALTER TABLE "material_change" ADD CONSTRAINT "material_change_filed_dual_dated"
  CHECK (("filedAt" IS NULL) = ("filedAtHijri" IS NULL));

-- A filed change must be BOUND to the duty it was filed under. The converse is deliberately NOT
-- asserted: a change may be recorded before (or in the same transaction as) the raise that binds
-- it, so `complianceTaskId IS NULL` with `filedAt IS NULL` is a legitimate transient state.
ALTER TABLE "material_change" DROP CONSTRAINT IF EXISTS "material_change_filed_implies_bound";
ALTER TABLE "material_change" ADD CONSTRAINT "material_change_filed_implies_bound"
  CHECK ("filedAt" IS NULL OR "complianceTaskId" IS NOT NULL);


-- ── SECTION 3 — THE CAUSE TUPLE IS FROZEN (the statutory clock does not move) ────────────────
CREATE OR REPLACE FUNCTION qmulate_material_change_cause_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_mc_frozen$
BEGIN
  IF NEW."waqfId" IS DISTINCT FROM OLD."waqfId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."effectiveDate" IS DISTINCT FROM OLD."effectiveDate"
     OR NEW."effectiveDateHijri" IS DISTINCT FROM OLD."effectiveDateHijri"
     OR NEW."sourceRef" IS DISTINCT FROM OLD."sourceRef" THEN
    RAISE EXCEPTION
      'UPDATE on "material_change" %: the CAUSE tuple ("waqfId", "kind", "effectiveDate", '
      '"effectiveDateHijri", "sourceRef") is set at creation and never changes. The effective '
      'date IS the statutory clock for the 15-business-day update duty (CDE-Q2, owner-provisional '
      '2026-08-25: the clock runs from the effective date, and a late discovery does not extend '
      'the deadline) — editing it moves a deadline WITHOUT recomputing it, which is the exact '
      'thing deadline_frozen_identity refuses one table over. A correction is a NEW change row; '
      'this one stays as the record of what was believed, and the coalescer will re-derive the '
      'governing anchor from the un-filed set.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_mc_frozen$;

DROP TRIGGER IF EXISTS material_change_cause_frozen ON "material_change";
CREATE TRIGGER material_change_cause_frozen
  BEFORE UPDATE ON "material_change"
  FOR EACH ROW EXECUTE FUNCTION qmulate_material_change_cause_frozen();
ALTER TABLE "material_change" ENABLE ALWAYS TRIGGER material_change_cause_frozen;


-- ── SECTION 4 — FILING IS WRITE-ONCE, AND A BOUND CAUSE DOES NOT MOVE DUTY ──────────────────
CREATE OR REPLACE FUNCTION qmulate_material_change_filing_write_once()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_mc_filed$
BEGIN
  IF OLD."filedAt" IS NOT NULL
     AND (NEW."filedAt" IS DISTINCT FROM OLD."filedAt"
          OR NEW."filedAtHijri" IS DISTINCT FROM OLD."filedAtHijri") THEN
    RAISE EXCEPTION
      'UPDATE on "material_change" %: "filedAt" is write-once. §09 clears the change-set by '
      'MARKING its members filed, and un-filing (or re-dating) a filed change resurrects a '
      'statutory clock that was discharged — a subsequent change is supposed to open a FRESH '
      'clock, not reopen a closed one.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;

  IF OLD."complianceTaskId" IS NOT NULL
     AND NEW."complianceTaskId" IS DISTINCT FROM OLD."complianceTaskId" THEN
    RAISE EXCEPTION
      'UPDATE on "material_change" %: "complianceTaskId" is set once. Re-pointing a cause at a '
      'different update duty rewrites WHICH duty this change was coalesced into — and therefore '
      'which deadline it drove (migration 35''s re-point lesson). Record a new change instead.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_mc_filed$;

DROP TRIGGER IF EXISTS material_change_filing_write_once ON "material_change";
CREATE TRIGGER material_change_filing_write_once
  BEFORE UPDATE ON "material_change"
  FOR EACH ROW EXECUTE FUNCTION qmulate_material_change_filing_write_once();
ALTER TABLE "material_change" ENABLE ALWAYS TRIGGER material_change_filing_write_once;


-- ── SECTION 5 — JOIN MIGRATION 8's RETENTION FAMILY (additive; NOTHING REDECLARED) ───────────
-- ⚠ READ THIS BEFORE EDITING. Migration 38's first draft re-created `deadline_no_delete` /
-- `deadline_no_truncate` and would have SILENTLY REPLACED migration 8's guards on a table that
-- already had them; the guard-verb census's floor assertion caught the duplicate declaration and
-- the section was withdrawn. This section is the OTHER case and is safe for a stated reason:
-- `material_change` does not exist until §2 of this very file, so there is no prior declaration
-- to replace. It REUSES migration 8's `qmulate_remainder_reject_delete(text)` (whose `TG_ARGV[0]`
-- is the per-table "what to do instead" hint) and migration 4's `qmulate_reject_truncate()`
-- (whose message NAMES `TG_TABLE_NAME`, so a cascade into a guarded neighbour is distinguishable
-- from this table being guarded on its own account). No new function; nothing overwritten.
--
-- WHY GUARDED AT ALL: a change row is the EVIDENCE of why a statutory clock started, and its
-- effective date is the clock itself. Erasing one makes a computed deadline unexplainable and —
-- because "un-filed" is a query over surviving rows — silently loosens or removes an obligation.
-- The soft-delete route (`deletedAt`) exists, and the table has no unique key, so
-- soft-delete-and-supersede genuinely works here (migration 8 §2's own test for whether a refusal
-- is satisfiable).
DO $qm_mc_retention$
BEGIN
  -- ⚠ NO-ARG SIGNATURE, AND THAT IS NOT A TYPO. A PL/pgSQL TRIGGER function declares no
  -- parameters: migration 8 defines `qmulate_remainder_reject_delete()` and passes the per-table
  -- hint as a TRIGGER ARGUMENT (`EXECUTE FUNCTION qmulate_remainder_reject_delete(%L)`), read
  -- inside as `TG_ARGV[0]`. This file's first draft probed for `(text)` and the assertion FAILED
  -- THE MIGRATION — a true positive of its own control: the probe exists precisely so a wrong
  -- assumption about the reused mechanism halts here instead of silently skipping the guard and
  -- leaving `material_change` deletable.
  IF to_regprocedure('qmulate_remainder_reject_delete()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3c: qmulate_remainder_reject_delete() is missing. It is defined by '
      '00000000000008_e2_retention_remainder and this migration joins that family rather than '
      'declaring a second mechanism.';
  END IF;
  IF to_regprocedure('qmulate_reject_truncate()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3c: qmulate_reject_truncate() is missing. It is defined by '
      '00000000000004_e2_waqf_delete_guards.';
  END IF;

  DROP TRIGGER IF EXISTS material_change_no_delete ON "material_change";
  EXECUTE format(
    'CREATE TRIGGER material_change_no_delete BEFORE DELETE ON "material_change" '
    'FOR EACH ROW EXECUTE FUNCTION qmulate_remainder_reject_delete(%L)',
    'This row records WHY a 15-business-day update clock started, and its effective date IS that '
    'clock (CDE-Q2). Deleting it makes the computed deadline unexplainable and — because '
    '"un-filed" is a query over surviving rows — can silently loosen or remove the obligation. '
    'Set "deletedAt" and record a superseding change row instead; this table has no unique key, '
    'so the identity is not held hostage.'
  );
  ALTER TABLE "material_change" ENABLE ALWAYS TRIGGER material_change_no_delete;

  DROP TRIGGER IF EXISTS material_change_no_truncate ON "material_change";
  CREATE TRIGGER material_change_no_truncate
    BEFORE TRUNCATE ON "material_change"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();
  ALTER TABLE "material_change" ENABLE ALWAYS TRIGGER material_change_no_truncate;
END
$qm_mc_retention$;


-- ── SECTION 6 — "ONE OPEN UPDATE OBLIGATION PER WAQF", MADE UNREPRESENTABLE ──────────────────
-- §09's coalescing clause, as a constraint rather than as a convention. The application coalesces
-- (`coalesceUpdateObligation`, `deadlines/coalescing.ts`); this index is what happens when it
-- forgets — a second concurrent raise fails with 23505 instead of quietly creating a parallel
-- statutory clock that somebody later files twice.
--
-- THE PREDICATE, CLAUSE BY CLAUSE, because each one is a decision:
--   • `"templateCode" = 'GOV-REG-02'` — the CANONICAL template code, and only it. ⚠ DECLARED
--     BOUNDARY: the ten hand-seeded fixture tasks carry `SEED-`-namespaced codes (their
--     obligations are `SEED-<section>-NN` placeholders), so a pre-engine placeholder for the same
--     DUTY is outside this index. That is deliberate — keying on the obligation's
--     `deadlineRuleKey` instead would require a JOIN, and a constraint that depends on a joined
--     column is the same "one `include` away" fragility S8-Q1 refused for `confidentiality`.
--     Measured: no seeded row carries `templateCode = 'GOV-REG-02'`, and the one fixture task
--     that IS this duty (`task-005`, whose obligation carries `deadlineRuleKey = 'UPDATE_15BD'`)
--     is `completed`, so it is outside the predicate on the status clause too.
--   • `"status" IN ('NOT_STARTED', 'IN_PROGRESS')` — pinned against the domain's ONE definition
--     of open (`OPEN_TASK_STATUSES`, `compliance/instantiation.ts`, already proven a strict subset
--     of the enum). `RETIRED` must NOT block a fresh clock — §09: "a subsequent change opens a
--     fresh clock" — and `NOT_APPLICABLE` was never a duty.
--   • `"deletedAt" IS NULL` — a soft-retired row must not hold the slot, or the endowment could
--     never have another update duty.
-- The KEY is `("waqfId")` alone, which is §09's identity key ("one open update obligation **per
-- waqf**") and NOT a choice made here. Anything finer — per government platform, per change kind
-- — is unruled anywhere in §09, the BRD or the owner memo, and is carried as an open question
-- rather than settled by an index.
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_task_one_open_update_per_waqf"
  ON "compliance_task" ("waqfId")
  WHERE "templateCode" = 'GOV-REG-02'
    AND "status" IN ('NOT_STARTED', 'IN_PROGRESS')
    AND "deletedAt" IS NULL;


-- ── SECTION 7 — CLOSE THE PUBLIC-EXECUTE DEFAULT (migration 12 §6; mandatory) ────────────────
-- §3 and §4 each create a function, so this call is not optional. `ALTER DEFAULT PRIVILEGES …
-- REVOKE` stores nothing on this Postgres, so a first-time CREATE takes the built-in
-- PUBLIC-executable default; assertion 1f is what caught migration 38's first draft omitting this
-- (three functions flagged by name on the first counted run).
DO $qm_s93c_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3c: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function.';
  END IF;
END
$qm_s93c_sweep$;

SELECT qmulate_revoke_public_function_execute();


-- ── SECTION 8 — RE-APPLY THE PRIVILEGE MATRIX (mandatory: this file CREATES A TABLE) ────────
-- ⚠ CAUGHT BY A TEST, NOT BY REVIEW, AND RECORDED AS SUCH. §2 creates `material_change`, and
-- migration 10's `qmulate_apply_privilege_matrix()` grants per-table privileges by ITERATING
-- `pg_tables` — so a table born after the last application has NO GRANTS AT ALL for the runtime
-- role. Migration 11's header says it in terms: a migration that adds a table must end with this
-- call. This file's first draft did not, and the api suite failed with
-- `42501 permission denied for table material_change` on the very first `recordMaterialChange` —
-- the trigger path was structurally correct and completely unusable.
--
-- Note what the failure mode would have been WITHOUT a wire-level test: every guard probe in
-- `packages/database` passes (they run as the privileged/migrator role), the migration applies
-- cleanly, the census is green, and the feature is dead only for the least-privileged role — which
-- is the only role production uses.
DO $qm_s93c_matrix$
BEGIN
  IF to_regprocedure('qmulate_apply_privilege_matrix()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3c: qmulate_apply_privilege_matrix() is missing. It is defined by '
      '00000000000010_privilege_separation_matrix and MUST be re-applied by every migration that '
      'creates a table — the matrix grants by iterating pg_tables, so a new table has no grants '
      'until it runs again.';
  END IF;
END
$qm_s93c_matrix$;

SELECT qmulate_apply_privilege_matrix();
