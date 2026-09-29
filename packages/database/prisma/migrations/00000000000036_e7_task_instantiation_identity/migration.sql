-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 36 — E7-COMPLETION · THE TASK-INSTANTIATION IDENTITY (§09 Engine A, second half)
--
-- **Owner ruling, 2026-08-24, verbatim selection: "Instantiation first (Recommended)."**
-- Recorded in `docs/product/prd/S4-owner-decision-memo.md` ("S8 addendum, sequencing") and
-- committed `804194d` before this migration cited it. The ruling's terms: *"The session after
-- M1-b builds the per-endowment task-instantiation engine (the missing half of Engine A), claims
-- E7's exit and G-6 properly on measured evidence, and only THEN does S9 = E8 open."*
--
-- ── WHAT WAS TRUE BEFORE THIS FILE ───────────────────────────────────────────────────────────
-- `ComplianceTask` carried the S8-Q5 frozen snapshot (`templateCode`+`templateVersion`) but had
-- NOWHERE to record §09's instantiation facts: which classification a task was materialised
-- under, why the row exists (`initial_setup` | `reclassification` | `event_trigger`), or — for a
-- retired row — why and when it was retired. A3's *"reason recorded, rows kept"* was unstorable,
-- and nothing made `RETIRED` terminal: an UPDATE could quietly return a retired task to
-- `NOT_STARTED`, erasing a reclassification's history without deleting a row (the DELETE guard
-- from migration 8 never sees it).
--
-- ── THE FOUR PIECES ──────────────────────────────────────────────────────────────────────────
--  1. The enum + four columns (§09's `classificationAtInstantiation`, `instantiatedReason`,
--     `retiredReason`, `retiredAt`).
--  2. CHECKs tying presence to state: retirement facts exist iff the row is RETIRED; the two
--     instantiation facts travel together.
--  3. `compliance_task_retirement_terminal` — RETIRED is terminal, and the retirement facts are
--     write-once with the transition.
--  4. `compliance_task_instantiation_identity_frozen` — the instantiation facts never change,
--     INCLUDING from NULL: the ten fixture rows predate the engine, and back-filling an
--     instantiation occasion onto a row that never had one fabricates provenance (the same shape
--     as re-pointing a filing's `approvalRequestId`, migration 35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — THE VOCABULARY AND THE COLUMNS ───────────────────────────────────────────────
DO $qm$ BEGIN
  CREATE TYPE "TaskInstantiationReason" AS ENUM (
    'INITIAL_SETUP', 'RECLASSIFICATION', 'EVENT_TRIGGER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $qm$;

ALTER TABLE "compliance_task"
  ADD COLUMN IF NOT EXISTS "classificationAtInstantiation" "WaqfClassification",
  ADD COLUMN IF NOT EXISTS "instantiatedReason"            "TaskInstantiationReason",
  ADD COLUMN IF NOT EXISTS "retiredReason"                 TEXT,
  ADD COLUMN IF NOT EXISTS "retiredAt"                     TIMESTAMP(3);


-- ── SECTION 2 — PRESENCE IS TIED TO STATE ────────────────────────────────────────────────────
-- Retirement facts travel together and only on a RETIRED row. ⚠ The CHECK is deliberately
-- ONE-DIRECTIONAL: a RETIRED row MAY lack the facts. This file's first draft demanded them
-- (`(status = 'RETIRED') = (retiredAt IS NOT NULL)`), which reads as A3 enforced — and would have
-- REFUSED TO APPLY on any database holding a pre-engine RETIRED row, because `RETIRED` has been a
-- legal status since `init` and the columns did not exist to be filled. The incremental-upgrade
-- leg this stage owed (the S8 close-out's carried debt: "every run starts from --reset") found
-- that by REASONING BEFORE RUNNING; backfilling a reason instead would fabricate history, which
-- is this same migration's own §4 rule. A3 for every ENGINE-ERA retirement is enforced by the
-- trigger below (a NEW transition into RETIRED must carry both facts) — the CHECK admits only the
-- legacy shape, which no new write can produce.
ALTER TABLE "compliance_task" DROP CONSTRAINT IF EXISTS "compliance_task_retirement_facts";
ALTER TABLE "compliance_task" ADD CONSTRAINT "compliance_task_retirement_facts"
  CHECK (
    (("retiredAt" IS NULL) = ("retiredReason" IS NULL))
    AND ("retiredAt" IS NULL OR "status"::text = 'RETIRED')
  );

ALTER TABLE "compliance_task" DROP CONSTRAINT IF EXISTS "compliance_task_instantiation_pair";
ALTER TABLE "compliance_task" ADD CONSTRAINT "compliance_task_instantiation_pair"
  CHECK (("classificationAtInstantiation" IS NULL) = ("instantiatedReason" IS NULL));


-- ── SECTION 3 — RETIRED IS TERMINAL, AND ITS FACTS ARE WRITE-ONCE ────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_compliance_task_retirement_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_task_retire$
BEGIN
  -- A NEW retirement must carry its facts (§09 A3: "reason recorded, rows kept"). The CHECK above
  -- cannot demand this — it must admit pre-engine RETIRED rows whose facts never existed — so the
  -- TRANSITION is where the demand lives, and no engine-era retirement can be reason-less.
  IF NEW."status"::text = 'RETIRED' AND OLD."status"::text IS DISTINCT FROM 'RETIRED'
     AND (NEW."retiredReason" IS NULL OR NEW."retiredAt" IS NULL) THEN
    RAISE EXCEPTION
      'UPDATE on "compliance_task" %: a transition into RETIRED must record "retiredReason" and '
      '"retiredAt" in the same statement (§09 A3 — a task that stops applying is retired WITH the '
      'reason, never silently).',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;

  IF OLD."status"::text = 'RETIRED' THEN
    IF NEW."status"::text IS DISTINCT FROM 'RETIRED' THEN
      RAISE EXCEPTION
        'UPDATE on "compliance_task" %: RETIRED is terminal (§09 Engine A — a retired task is the '
        'HISTORY of a reclassification, A3/A4). Un-retiring it erases that history without '
        'deleting a row. If the duty applies again, instantiate a NEW task; the retired row '
        'remains queryable as history.',
        OLD."id"
        USING ERRCODE = '42501';
    END IF;
    IF NEW."retiredReason" IS DISTINCT FROM OLD."retiredReason"
       OR NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt" THEN
      RAISE EXCEPTION
        'UPDATE on "compliance_task" %: "retiredReason"/"retiredAt" are write-once with the '
        'retirement (§09 A3 — "reason recorded, rows kept"). Rewriting them rewrites WHY a duty '
        'stopped applying.',
        OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$qm_task_retire$;

DROP TRIGGER IF EXISTS compliance_task_retirement_terminal ON "compliance_task";
CREATE TRIGGER compliance_task_retirement_terminal
  BEFORE UPDATE ON "compliance_task"
  FOR EACH ROW EXECUTE FUNCTION qmulate_compliance_task_retirement_terminal();

-- One `SET session_replication_role = 'replica'` from irrelevant otherwise (the G-1 lesson).
ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_retirement_terminal;


-- ── SECTION 4 — THE INSTANTIATION IDENTITY IS FROZEN, NULL INCLUDED ──────────────────────────
CREATE OR REPLACE FUNCTION qmulate_compliance_task_instantiation_identity_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_task_identity$
BEGIN
  IF NEW."classificationAtInstantiation" IS DISTINCT FROM OLD."classificationAtInstantiation"
     OR NEW."instantiatedReason" IS DISTINCT FROM OLD."instantiatedReason" THEN
    RAISE EXCEPTION
      'UPDATE on "compliance_task" %: the instantiation identity '
      '("classificationAtInstantiation", "instantiatedReason") is set at creation and never '
      'changes — NULL included: a NULL pair means "pre-engine row, hand-seeded", and back-filling '
      'an occasion onto it fabricates provenance (§09 Engine A; E7-completion, migration 36).',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_task_identity$;

DROP TRIGGER IF EXISTS compliance_task_instantiation_identity_frozen ON "compliance_task";
CREATE TRIGGER compliance_task_instantiation_identity_frozen
  BEFORE UPDATE ON "compliance_task"
  FOR EACH ROW EXECUTE FUNCTION qmulate_compliance_task_instantiation_identity_frozen();

ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_instantiation_identity_frozen;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — THE FUNCTION-PRIVILEGE SWEEP (migration 12 §6's rule; migrations 34 and 35 both
-- sprang the documented trap and were caught by census assertion 1f — this file does not).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
