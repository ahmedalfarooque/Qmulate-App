-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 38 — S9-2 · THE DEADLINE ROW BECOMES §09 ENGINE B'S FROZEN CONTRACT
--
-- ── WHAT WAS TRUE BEFORE THIS FILE ───────────────────────────────────────────────────────────
-- `deadline` was E1 scaffolding: dual anchor/due dates, a `ruleKey`, one `businessDaysUsed`
-- snapshot column too narrow for month-based rules, no waiver, no evidence link, no recompute
-- lineage — and NOT ONE GUARD. §09's freeze rationale ("deadlines never silently move": the
-- Umm-al-Qura tabulation gets adjusted, holiday calendars get corrected after the fact, and a
-- FILED date must not shift under the user's feet) was a paragraph, not a property. No engine
-- has ever written a row here, no seed writes one, and the table is empty on every deployment —
-- which is exactly when a contract is cheapest to install.
--
-- ── THE PIECES ───────────────────────────────────────────────────────────────────────────────
--  1. `windowSnapshot` — the window AS APPLIED (basis, amount, month anchor, the `Setting` key it
--     resolved from, its ⚠ unverified flag, the roll): §09's "snapshot of the window actually
--     applied, so a later Setting change never silently rewrites history", wide enough for every
--     rule kind where `businessDaysUsed` (kept, now nullable, legacy) fit only three.
--  2. The actionable pair (pre-expiry rules: act-by = expiry − lead), the waiver pair, the
--     satisfied-evidence link, and `recomputedFromId` — §09's ONLY recompute path: a corrected
--     deadline is a NEW row linking its predecessor, never an edit (the ADR-0006 shape).
--  3. CHECKs: dual-date pairs travel together; **met ∧ waived is UNREPRESENTABLE AT REST** — the
--     same contradiction `@qmulate/domain`'s `deriveDeadlineState` refuses in flight
--     (`DEADLINE_STATE_INCOHERENT`), refused here structurally so a row the deriver would choke
--     on cannot be written in the first place.
--  4. Guards, all `ENABLE ALWAYS`: the computed identity is FROZEN once written (NULL included,
--     for the same fabricated-provenance reason as migration 36); the lifecycle facts are
--     write-once (a met deadline cannot quietly become unmet; a waiver cannot be retracted by
--     UPDATE — a wrong waiver is corrected by a recompute row, on the record). DELETE/TRUNCATE
--     protection is MIGRATION 8's, pre-existing — see the withdrawn section 6 below.
--  5. `UNIQUE ("recomputedFromId")` — the recompute lineage is a CHAIN, not a tree: two "current"
--     corrections of one deadline would both claim to be the date on file.
--
-- ⚠ NO STATUS COLUMN, DELIBERATELY. §09: "State is derived, not stored as truth — the frozen due
-- date is the source." The daily evaluator mirrors state onto the bound `ComplianceTask.status`;
-- persisting it here too would create a second authority that can disagree with the derivation.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — COLUMNS ──────────────────────────────────────────────────────────────────────
ALTER TABLE "deadline"
  ADD COLUMN IF NOT EXISTS "windowSnapshot"      JSONB,
  ADD COLUMN IF NOT EXISTS "actionableDate"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actionableDateHijri" TEXT,
  ADD COLUMN IF NOT EXISTS "waivedAt"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "waivedReason"        TEXT,
  ADD COLUMN IF NOT EXISTS "satisfiedEvidenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "recomputedFromId"    TEXT;

-- `businessDaysUsed` is legacy-narrow (three of the nine rules); `windowSnapshot` supersedes it.
ALTER TABLE "deadline" ALTER COLUMN "businessDaysUsed" DROP NOT NULL;

-- The recompute lineage is a chain: at most one successor per row.
CREATE UNIQUE INDEX IF NOT EXISTS "deadline_recomputedFromId_key"
  ON "deadline" ("recomputedFromId");

DO $qm$ BEGIN
  ALTER TABLE "deadline"
    ADD CONSTRAINT "deadline_recomputedFromId_fkey"
    FOREIGN KEY ("recomputedFromId") REFERENCES "deadline"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $qm$;


-- ── SECTION 2 — PRESENCE TIED TO STATE ───────────────────────────────────────────────────────
-- Dual-date pairs travel together (§17 schema convention 2: a Gregorian date without its frozen
-- Umm-al-Qura twin is half a fact), and the waiver facts travel together.
ALTER TABLE "deadline" DROP CONSTRAINT IF EXISTS "deadline_actionable_pair";
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_actionable_pair"
  CHECK (("actionableDate" IS NULL) = ("actionableDateHijri" IS NULL));

ALTER TABLE "deadline" DROP CONSTRAINT IF EXISTS "deadline_waiver_pair";
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_waiver_pair"
  CHECK (("waivedAt" IS NULL) = ("waivedReason" IS NULL));

-- Met ∧ waived is a contradiction (one fact satisfies the duty, the other excuses it) —
-- unrepresentable at rest, refused in flight by the domain deriver under the same name.
ALTER TABLE "deadline" DROP CONSTRAINT IF EXISTS "deadline_state_coherent";
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_state_coherent"
  CHECK ("satisfiedAt" IS NULL OR "waivedAt" IS NULL);

-- Evidence hangs off the met fact, never free-floats.
ALTER TABLE "deadline" DROP CONSTRAINT IF EXISTS "deadline_evidence_with_met";
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_evidence_with_met"
  CHECK ("satisfiedEvidenceId" IS NULL OR "satisfiedAt" IS NOT NULL);


-- ── SECTION 3 — A NEW ROW CARRIES ITS PROVENANCE ─────────────────────────────────────────────
-- The CHECKs above must admit the (empty-table today, hypothetical elsewhere) legacy shape, so
-- the DEMAND lives on the transition: an ENGINE-ERA insert must carry the window snapshot. A
-- deadline with no recorded window is a date nobody can defend later (§09's whole point).
CREATE OR REPLACE FUNCTION qmulate_deadline_insert_provenance()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_deadline_ins$
BEGIN
  IF NEW."windowSnapshot" IS NULL THEN
    RAISE EXCEPTION
      'INSERT on "deadline" %: a deadline must record the window AS APPLIED ("windowSnapshot" — '
      'basis, amount, the Setting key it resolved from, its unverified flag, the roll). A due '
      'date with no recorded window cannot be defended, or contested, later (§09 Engine B).',
      NEW."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_deadline_ins$;

DROP TRIGGER IF EXISTS deadline_insert_provenance ON "deadline";
CREATE TRIGGER deadline_insert_provenance
  BEFORE INSERT ON "deadline"
  FOR EACH ROW EXECUTE FUNCTION qmulate_deadline_insert_provenance();
ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_insert_provenance;


-- ── SECTION 4 — THE COMPUTED IDENTITY IS FROZEN, NULL INCLUDED ───────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_deadline_frozen_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_deadline_frozen$
BEGIN
  IF NEW."ruleKey"             IS DISTINCT FROM OLD."ruleKey"
     OR NEW."waqfId"           IS DISTINCT FROM OLD."waqfId"
     OR NEW."anchorDate"       IS DISTINCT FROM OLD."anchorDate"
     OR NEW."anchorDateHijri"  IS DISTINCT FROM OLD."anchorDateHijri"
     OR NEW."dueDate"          IS DISTINCT FROM OLD."dueDate"
     OR NEW."dueDateHijri"     IS DISTINCT FROM OLD."dueDateHijri"
     OR NEW."actionableDate"   IS DISTINCT FROM OLD."actionableDate"
     OR NEW."actionableDateHijri" IS DISTINCT FROM OLD."actionableDateHijri"
     OR NEW."windowSnapshot"   IS DISTINCT FROM OLD."windowSnapshot"
     OR NEW."businessDaysUsed" IS DISTINCT FROM OLD."businessDaysUsed"
     OR NEW."recomputedFromId" IS DISTINCT FROM OLD."recomputedFromId" THEN
    RAISE EXCEPTION
      'UPDATE on "deadline" %: the computed identity (rule, endowment, anchor, due date, '
      'actionable date, window snapshot, recompute lineage) is FROZEN once written — a deadline '
      'that has been displayed, and possibly FILED, must not shift under the user''s feet when a '
      'calendar or a library changes (§09 Engine B, freeze rationale). NULL included: '
      'back-filling lineage onto a row fabricates provenance. A correction is a NEW row linking '
      '"recomputedFromId", written through the explicit, audited recompute path.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_deadline_frozen$;

DROP TRIGGER IF EXISTS deadline_frozen_identity ON "deadline";
CREATE TRIGGER deadline_frozen_identity
  BEFORE UPDATE ON "deadline"
  FOR EACH ROW EXECUTE FUNCTION qmulate_deadline_frozen_identity();
ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_frozen_identity;


-- ── SECTION 5 — THE LIFECYCLE FACTS ARE WRITE-ONCE ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_deadline_lifecycle_write_once()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_deadline_life$
BEGIN
  IF OLD."satisfiedAt" IS NOT NULL
     AND (NEW."satisfiedAt" IS DISTINCT FROM OLD."satisfiedAt"
          OR NEW."satisfiedEvidenceId" IS DISTINCT FROM OLD."satisfiedEvidenceId") THEN
    RAISE EXCEPTION
      'UPDATE on "deadline" %: a recorded satisfaction is write-once — a met statutory deadline '
      'cannot quietly become unmet, or met on a different day, or met by different evidence. A '
      'wrong record is corrected on the record, by the audited recompute path.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  IF OLD."waivedAt" IS NOT NULL
     AND (NEW."waivedAt" IS DISTINCT FROM OLD."waivedAt"
          OR NEW."waivedReason" IS DISTINCT FROM OLD."waivedReason") THEN
    RAISE EXCEPTION
      'UPDATE on "deadline" %: a recorded waiver is write-once — rewriting WHY a statutory duty '
      'was excused rewrites the excuse. A wrong waiver is corrected on the record, by the '
      'audited recompute path.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_deadline_life$;

DROP TRIGGER IF EXISTS deadline_lifecycle_write_once ON "deadline";
CREATE TRIGGER deadline_lifecycle_write_once
  BEFORE UPDATE ON "deadline"
  FOR EACH ROW EXECUTE FUNCTION qmulate_deadline_lifecycle_write_once();
ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_lifecycle_write_once;


-- ── SECTION 6 — (WITHDRAWN BEFORE SHIPPING) ─────────────────────────────────────────────────
-- This file's first draft re-created `deadline_no_delete`/`deadline_no_truncate` here — and would
-- have SILENTLY REPLACED migration 8's retention-remainder guards, which have carried both verbs
-- on this table (with the audited-erasure rationale and the soft-delete-and-supersede hint) since
-- E2. The guard-verb census caught the duplicate declaration before the replacement shipped.
-- DELETE/TRUNCATE protection on `deadline` is migration 8's, unchanged; this migration adds the
-- freeze, the provenance demand and the lifecycle write-once beside it, never over it.


-- ── SECTION 7 — CLOSE THE PUBLIC-EXECUTE DEFAULT ON THIS FILE'S FUNCTIONS ────────────────────
-- Mandatory in every migration that adds a function (migration 12 §6; the trap is measured in
-- migration 13/14/15's identical blocks): `ALTER DEFAULT PRIVILEGES … REVOKE` stores NOTHING on
-- this Postgres, so a first-time CREATE takes the built-in PUBLIC-executable default. Assertion
-- 1f (authorization-plane-privilege) is what caught THIS file's first draft omitting it — three
-- functions flagged by name on the first counted run.
DO $qm_s92_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-2: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function.';
  END IF;
END
$qm_s92_sweep$;

SELECT qmulate_revoke_public_function_execute();
