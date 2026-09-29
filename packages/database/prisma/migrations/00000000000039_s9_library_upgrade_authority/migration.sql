-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 39 — S9-3b · THE LIBRARY-UPGRADE ACT'S AUTHORITY (owner ruling, S9 first batch)
--
-- **Owner's answer (2026-08-25), verbatim selection: "Explicit act, maker≠checker (Recommended)."**
-- Recorded in `docs/product/prd/S4-owner-decision-memo.md` ("S9 addendum, first batch") and
-- committed `e808bb6` BEFORE this implementation. The ruling's terms: *"A library version bump
-- changes only future instantiations by itself. Attaching newly-in-scope templates to an
-- ALREADY-instantiated register is a new audited act — 'apply library vN to this register' — per
-- endowment, maker≠checker, reusing the reclassify diff shape: newly-in-scope templates
-- instantiate with a new reason (LIBRARY_UPGRADE), nothing retires implicitly."*
--
-- ── THE PIECES ───────────────────────────────────────────────────────────────────────────────
--  1. `TaskInstantiationReason` gains `LIBRARY_UPGRADE`; `ApprovalType` gains `LIBRARY_UPGRADE`
--     (the act needs its own approval type — it is NOT a reserved matter: S8-Q12's precedent,
--     catalogue upkeep is not retiring an endowment's record; and it is not GOVT_FILING's shape).
--  2. `compliance_task.instantiatedByApprovalId` — the EVIDENCE POINTER: which approval THIS
--     task's attachment rests on. CHECK ties it to the reason both ways (an upgrade task without
--     its authority, or a pointer on a non-upgrade task, is unrepresentable). `::text`
--     comparison, deliberately: a same-transaction enum-literal cast of a value added by this
--     file is the ALTER TYPE trap migrations 30/34 document.
--  3. `compliance_task_library_upgrade_authority` (BEFORE INSERT, `ENABLE ALWAYS`) — the
--     deciding side, migration 35's shape: `qmulate_approval_defect()` re-verifies at the row
--     itself that the named approval is a genuine APPROVED, maker≠checker `LIBRARY_UPGRADE` for
--     THIS endowment and THIS subject (`library:<templateVersion>`). `allow_spent = false`: a
--     spent upgrade approval is not a standing licence — the apply path inserts its tasks FIRST
--     and marks the approval `EXECUTED` last, in one transaction.
--  4. The migration-36 frozen-identity guard WIDENS to cover the pointer (the migration-33
--     shape: a column set widened, no trigger added) — re-pointing a task at a different
--     approval rewrites WHICH authority its attachment rests on, migration 35's own lesson.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — VOCABULARY ───────────────────────────────────────────────────────────────────
ALTER TYPE "TaskInstantiationReason" ADD VALUE IF NOT EXISTS 'LIBRARY_UPGRADE';
ALTER TYPE "ApprovalType" ADD VALUE IF NOT EXISTS 'LIBRARY_UPGRADE';


-- ── SECTION 2 — THE EVIDENCE POINTER, TIED TO ITS REASON BOTH WAYS ──────────────────────────
ALTER TABLE "compliance_task"
  ADD COLUMN IF NOT EXISTS "instantiatedByApprovalId" TEXT;

ALTER TABLE "compliance_task" DROP CONSTRAINT IF EXISTS "compliance_task_upgrade_authority_pair";
ALTER TABLE "compliance_task" ADD CONSTRAINT "compliance_task_upgrade_authority_pair"
  CHECK (
    ("instantiatedByApprovalId" IS NOT NULL) = ("instantiatedReason"::text = 'LIBRARY_UPGRADE')
  );


-- ── SECTION 3 — THE DECIDING SIDE: THE DATABASE RE-VERIFIES THE AUTHORITY AT THE ROW ─────────
CREATE OR REPLACE FUNCTION qmulate_compliance_task_library_upgrade_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_task_upgrade$
DECLARE
  defect text;
BEGIN
  IF NEW."instantiatedReason"::text = 'LIBRARY_UPGRADE' THEN
    defect := qmulate_approval_defect(
      NEW."instantiatedByApprovalId",
      NEW."waqfId",
      'LIBRARY_UPGRADE',
      'library:' || NEW."templateVersion",
      false
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'INSERT on "compliance_task" % with reason LIBRARY_UPGRADE is refused: %. Attaching a '
        'NEW statutory duty to an already-instantiated register is an explicit maker<>checker '
        'act (owner ruling 2026-08-25, S9 first batch): it needs an APPROVED LIBRARY_UPGRADE '
        'approval for THIS endowment naming the target library version. A version bump alone '
        'changes only future instantiations.',
        NEW."id", defect
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$qm_task_upgrade$;

DROP TRIGGER IF EXISTS compliance_task_library_upgrade_authority ON "compliance_task";
CREATE TRIGGER compliance_task_library_upgrade_authority
  BEFORE INSERT ON "compliance_task"
  FOR EACH ROW EXECUTE FUNCTION qmulate_compliance_task_library_upgrade_guard();
ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_library_upgrade_authority;


-- ── SECTION 4 — THE FROZEN IDENTITY WIDENS TO THE POINTER (the migration-33 shape) ──────────
-- CREATE OR REPLACE of migration 36's function, WIDENING its column set and changing nothing
-- else — declared here exactly the way migration 33 declared its widening of 31's guard. The
-- guard-verb census is deliberately unchanged by this section (same trigger, same verb); what
-- would have been a silent replacement is a stated widening with its reason: re-pointing
-- `instantiatedByApprovalId` rewrites WHICH authority an attached duty rests on (migration 35's
-- re-point lesson, one table over).
CREATE OR REPLACE FUNCTION qmulate_compliance_task_instantiation_identity_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_task_identity$
BEGIN
  IF NEW."classificationAtInstantiation" IS DISTINCT FROM OLD."classificationAtInstantiation"
     OR NEW."instantiatedReason" IS DISTINCT FROM OLD."instantiatedReason"
     OR NEW."instantiatedByApprovalId" IS DISTINCT FROM OLD."instantiatedByApprovalId" THEN
    RAISE EXCEPTION
      'UPDATE on "compliance_task" %: the instantiation identity '
      '("classificationAtInstantiation", "instantiatedReason", "instantiatedByApprovalId") is '
      'set at creation and never changes — NULL included: a NULL pair means "pre-engine row, '
      'hand-seeded", back-filling an occasion onto it fabricates provenance, and re-pointing an '
      'upgrade task at a different approval rewrites WHICH authority its attachment rests on '
      '(§09 Engine A; migrations 36 + 39).',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_task_identity$;


-- ── SECTION 5 — CLOSE THE PUBLIC-EXECUTE DEFAULT (migration 12 §6; mandatory) ────────────────
DO $qm_s93b_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3b: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function.';
  END IF;
END
$qm_s93b_sweep$;

SELECT qmulate_revoke_public_function_execute();
