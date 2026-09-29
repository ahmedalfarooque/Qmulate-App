-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- S11-2 · THE DISCHARGE KIND — how a statutory deadline was DISCHARGED, as a closed vocabulary
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Owner ruling 2026-09-02 (S4 memo, "S11 addendum, second batch"; record commit f797fea): a red
-- registration deadline clears because the duty was MET — recorded as a discharge — never by editing
-- the clock-start. Two engineering conditions travelled with the ruling: (1) the anchor stays TRUE
-- (this migration touches no anchor column), and (2) a THIRD state must be addable later without
-- rework — because whether an endowment registered BEFORE the regulation's effective date was ever
-- subject to the 30-business-day duty is an UNANSWERED question of Saudi law, and if it never
-- attached the honest state is NOT APPLICABLE: neither `overdue` nor `met`.
--
-- ── THE SEAM (condition 2), and why the CHECK is stated twice ──────────────────────────────
-- `satisfiedAt` (migration 38) stays THE met timestamp — the evaluator's open-row query and the
-- domain's `deriveDeadlineState` are unchanged. This migration adds ONE closed enum,
-- `DeadlineDischargeKind`, with ONE member today: `MET`. The two CHECKs below are equivalent while
-- the enum has one member and are DELIBERATELY both stated:
--   · `deadline_discharge_kind_pairs_with_met` — a kind is present exactly when `satisfiedAt` is;
--   · `deadline_discharge_met_means_satisfied` — the kind is `MET` exactly when `satisfiedAt` is set.
-- A future `NOT_APPLICABLE` member RELAXES the first (a kind without `satisfiedAt`) and KEEPS the
-- second (only `MET` means satisfied). The seam is a named constraint to drop, not a table to rebuild.
--
-- ── WRITE-ONCE, extended ──────────────────────────────────────────────────────────────────
-- Migration 38's `qmulate_deadline_lifecycle_write_once` made a recorded satisfaction and a recorded
-- waiver write-once. The kind joins them: HOW a duty was discharged cannot be rewritten after the
-- fact. The function is re-created with its two original clauses verbatim plus the third.
--
-- ── BACKFILL, and why it is not a remap ──────────────────────────────────────────────────
-- Before this migration the only writer of `satisfiedAt` was the update-filing path, and a filed
-- update IS a met discharge. So every row with `satisfiedAt` set is `MET` by definition — the kind is
-- DERIVED from a fact already on the row, not chosen for it (ADR-0004 forbids remapping a retired
-- value into a survivor; nothing is retired here). The seed writes no satisfied row, so on every
-- database this repo has seen the statement updates zero rows; it exists so the CHECK can be added
-- on a database that has filed an update.
--
-- ⚠ The ar/en statement copy for the vocabulary is engineering's rendering awaiting the owner
-- (`endowments.dischargeKindValue.*`); a NEW member arrives only with a deliberate pin edit
-- (`deadline-discharge-kind-vocabulary.test.ts`) AND its ar/en copy declared owed — the AuditAction
-- lesson (migration 46), applied while the vocabulary has one member and the pin is cheapest.

DO $qm_s11_discharge_type$
BEGIN
  IF to_regtype('"DeadlineDischargeKind"') IS NULL THEN
    CREATE TYPE "DeadlineDischargeKind" AS ENUM ('MET');
  END IF;
END
$qm_s11_discharge_type$;

ALTER TABLE "deadline"
  ADD COLUMN IF NOT EXISTS "dischargeKind" "DeadlineDischargeKind";

-- Derived backfill (see header): a satisfied row is a MET discharge. Passes migration 38's write-once
-- trigger because neither `satisfiedAt` nor `satisfiedEvidenceId` changes.
UPDATE "deadline"
   SET "dischargeKind" = 'MET'
 WHERE "satisfiedAt" IS NOT NULL
   AND "dischargeKind" IS NULL;

DO $qm_s11_discharge_checks$
BEGIN
  PERFORM qmulate_add_check(
    'deadline',
    'deadline_discharge_kind_pairs_with_met',
    '("dischargeKind" IS NULL) = ("satisfiedAt" IS NULL)'
  );
  PERFORM qmulate_add_check(
    'deadline',
    'deadline_discharge_met_means_satisfied',
    '("dischargeKind" IS NOT DISTINCT FROM ''MET'') = ("satisfiedAt" IS NOT NULL)'
  );
END
$qm_s11_discharge_checks$;

-- Migration 38's function, re-created with its two clauses VERBATIM and the kind clause appended.
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
  -- ⊕ S11-2: the kind of discharge is write-once too.
  IF OLD."dischargeKind" IS NOT NULL
     AND NEW."dischargeKind" IS DISTINCT FROM OLD."dischargeKind" THEN
    RAISE EXCEPTION
      'UPDATE on "deadline" %: a recorded discharge KIND is write-once — HOW a statutory duty was '
      'discharged cannot be rewritten after the fact. A wrong record is corrected on the record, '
      'by the audited recompute path.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_deadline_life$;

-- The trigger itself is migration 38's and is untouched; assert it still binds this function.
DO $qm_s11_discharge_assert$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'deadline_discharge_kind_pairs_with_met',
    'deadline_discharge_met_means_satisfied'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c) THEN
      RAISE EXCEPTION
        'QMULATE S11-2: CHECK constraint % was not created. A half-applied migration that admits a '
        'kind without its met fact is worse than one that stops.',
        c;
    END IF;
  END LOOP;
  IF to_regtype('"DeadlineDischargeKind"') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S11-2: enum type "DeadlineDischargeKind" is absent after creation.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgname = 'deadline_lifecycle_write_once'
       AND p.proname = 'qmulate_deadline_lifecycle_write_once'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'QMULATE S11-2: trigger deadline_lifecycle_write_once (migration 38) no longer binds '
      'qmulate_deadline_lifecycle_write_once — the kind clause would not be enforced.';
  END IF;
  IF position('dischargeKind' IN pg_get_functiondef('qmulate_deadline_lifecycle_write_once'::regproc)) = 0 THEN
    RAISE EXCEPTION
      'QMULATE S11-2: qmulate_deadline_lifecycle_write_once does not mention "dischargeKind" after '
      'replacement — the write-once clause for the kind is missing.';
  END IF;
END
$qm_s11_discharge_assert$;
