-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 34 — E7 / S8-Q4 · `NOT_CLASSIFIED` — THE ONBOARDING STATE, STATED
--
-- **Owner ruling, 2026-08-23, verbatim selection: "NOT_CLASSIFIED enum member (Recommended)."**
-- Recorded in `docs/product/prd/S4-owner-decision-memo.md` (S8 addendum, second batch) and
-- committed RECORD-ONLY as `e0fafb4` before this migration cited it — the `b662197`/migration-30
-- pattern. The ruling's own terms: *"An explicit not-yet-classified value; the register locks (no
-- tasks instantiate) until the real classification is recorded. A real onboarding state, stated
-- rather than NULL. … `NOT_CLASSIFIED` must never gate a template TRUE — it is the absence of a
-- determination, not a class."* This unblocks E7 exit clause A2 (§09: *"Given an endowment with no
-- classification set, When the register is opened, Then it is locked … and no tasks are
-- materialised"*) as a schema change, not a fixture edit.
--
-- ── WHAT THIS FILE DOES AND WHERE THE LOCK LIVES ─────────────────────────────────────────────
-- This file adds the VALUE and closes the two database paths that could quietly turn a recorded
-- determination back into its absence. The REGISTER LOCK itself is not SQL: it lives in
-- `packages/domain/src/classification/gating.ts`, which refuses to partition the catalogue at all
-- for `NOT_CLASSIFIED` (the SHART_INCOMPLETE posture — an "excluded" verdict is a determination
-- the absence of a classification cannot make), and every gate row of
-- `CLASSIFICATION_GATE_MATRIX` carries `NOT_CLASSIFIED: false`, pinned by a test, so even a
-- caller that bypasses the lock and consults the matrix directly finds nothing gated TRUE.
--
-- ── SAFETY OF `ALTER TYPE … ADD VALUE` ──────────────────────────────────────────────────────
-- Migration 30's shape: `IF NOT EXISTS` for the concurrency guarantee, safe under
-- `migrate deploy`'s transaction on PG 12+, and the new value is never USED in this file — the
-- guard functions below compare `::text`, deliberately, because an enum literal of a value added
-- in the same transaction is refused by Postgres ("unsafe use of new value").
--
-- ⚠ ORDER: appended LAST, matching `WAQF_CLASSIFICATIONS` in `packages/domain`, whose parity test
-- compares with `toStrictEqual` — member order is the contract, not cosmetics (migration 30's
-- lesson).
--
-- ── THE ONE-WAY DOOR, AND WHY IT IS ENGINEERING'S EXTENSION OF THE RULING ────────────────────
-- The ruling reads the state as ONBOARDING: an endowment may be BORN `NOT_CLASSIFIED` (INSERT is
-- untouched) and leaves it by recording the real classification. Nothing in the ruling
-- contemplates a determination being REVOKED back into its absence, and both revocation paths are
-- refused here at the layer that survives raw SQL:
--
--   · `waqf_no_unclassify` — a raw `UPDATE waqf SET classification = 'NOT_CLASSIFIED'` on an
--     endowment that holds a real class. The API cannot reach this (its `reclassify` input schema
--     deliberately omits the member), so this trigger exists for the path guards exist for.
--   · the `to`-check widened into `qmulate_reclassification_from_matches_current` — a raw
--     `reclassification_event` INSERT recording a transition INTO `NOT_CLASSIFIED`, which would
--     put a revoked determination into an append-only history that can never be corrected.
--
-- TODO(surface): whether a classification RECORDED IN ERROR may ever be returned to
-- `NOT_CLASSIFIED` (as opposed to being re-classified to the correct class, which keeps the
-- history and stays open) is the owner's call, not taken here. The safe default refuses: the
-- remedy for a wrong class is a further reclassification event, and widening later is safe where
-- narrowing a live guard is not (D-5).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

ALTER TYPE "WaqfClassification" ADD VALUE IF NOT EXISTS 'NOT_CLASSIFIED';


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — THE TRANSITION GUARD LEARNS THE ONE-WAY DOOR (widened, not a sibling)
--
-- Migration 14's precedent: the SAME trigger function widened rather than a second trigger on the
-- same verb, so the guard-verb census is unchanged for this table and the scaffolding wrappers
-- that suspend "the ONE guard per table" keep working (migration 12 §4.6's lesson). The body below
-- is migration 12 §2d's, verbatim, plus the one new check — placed AFTER the from/current check so
-- a caller who both fabricated the transition and aimed it at `NOT_CLASSIFIED` hears about the
-- fabrication first (the message that names the ordering requirement is the one that unblocks
-- them).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_reclassification_from_matches_current()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_reclass_from$
DECLARE
  current_classification text;
BEGIN
  SELECT "classification"::text INTO current_classification
    FROM "waqf" WHERE "id" = NEW."waqfId";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'reclassification_event %: waqf "%" does not exist. A classification history for an endowment '
      'that is not on record is not a history.', NEW."id", NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;

  IF NEW."from"::text IS DISTINCT FROM current_classification THEN
    RAISE EXCEPTION
      'reclassification_event %: "from" is % but waqf % is currently %. An append-only history that '
      'accepts a fabricated transition records a compliance position that never existed and can '
      'never be corrected (BR-104). INSERT THE EVENT FIRST, then UPDATE waqf."classification", in '
      'one transaction — if you updated the waqf first, that is why this failed.',
      NEW."id", NEW."from", NEW."waqfId", current_classification
      USING ERRCODE = '42501';
  END IF;

  IF NEW."from" = NEW."to" THEN
    RAISE EXCEPTION
      'reclassification_event %: "from" and "to" are both % — that is not a re-classification. An '
      'event with no transition in it dilutes the history it is supposed to be evidence of.',
      NEW."id", NEW."to"
      USING ERRCODE = '42501';
  END IF;

  -- ⊕ S8-Q4 (owner, 2026-08-23). `NOT_CLASSIFIED` is "the absence of a determination, not a
  -- class": an endowment may be BORN in it and LEAVES it by recording the real classification.
  -- A transition INTO it would record the REVOCATION of a determination in an append-only history
  -- that can never be corrected — and would re-lock a register whose duties were already in force.
  -- ::text comparison, deliberately: the member is added in this same transaction and an enum
  -- literal of it here would be refused by Postgres.
  IF NEW."to"::text = 'NOT_CLASSIFIED' THEN
    RAISE EXCEPTION
      'reclassification_event %: "to" = NOT_CLASSIFIED is refused. NOT_CLASSIFIED is the absence '
      'of a determination, not a class (S8-Q4, product owner, 2026-08-23): an endowment may be '
      'born unclassified and leaves that state by recording its real classification — a recorded '
      'determination is never revoked back into absence. If this classification was recorded in '
      'error, record a FURTHER reclassification event to the correct class; the history keeps '
      'both, which is what makes it evidence (BR-104).',
      NEW."id"
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_reclass_from$;

-- The trigger itself is migration 12's, already registered `ENABLE ALWAYS`; a REPLACED body
-- inherits that (the same shape as `qmulate_shart_guard()` in migration 12 §4.7's note).


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — THE RAW-UPDATE HALF OF THE SAME DOOR
--
-- `reclassify` goes event-first, so the trigger above covers every API write. What it does NOT
-- cover is a bare `UPDATE "waqf" SET "classification" = 'NOT_CLASSIFIED'` with no event at all —
-- the exact path migration 33 measured on `confidentiality` (a guard is only real at the layer
-- that survives raw SQL). Refused for UPDATE only: INSERT stays free because being BORN
-- unclassified is the ruling's onboarding state, and a no-op `NOT_CLASSIFIED → NOT_CLASSIFIED`
-- UPDATE is left alone (refusing it would make an unrelated column edit on an unclassified
-- endowment impossible).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_waqf_no_unclassify()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_waqf_no_unclassify$
BEGIN
  IF NEW."classification"::text = 'NOT_CLASSIFIED'
     AND OLD."classification"::text IS DISTINCT FROM 'NOT_CLASSIFIED' THEN
    RAISE EXCEPTION
      'UPDATE on "waqf" %: classification % -> NOT_CLASSIFIED is refused. NOT_CLASSIFIED is the '
      'absence of a determination, not a class (S8-Q4, product owner, 2026-08-23), and a recorded '
      'determination is never revoked back into absence — the duties it gated were already in '
      'force. If the classification was recorded in error, re-classify to the correct class '
      'through classification.reclassify, which appends the BR-104 history event.',
      OLD."id", OLD."classification"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_waqf_no_unclassify$;

DROP TRIGGER IF EXISTS waqf_no_unclassify ON "waqf";
CREATE TRIGGER waqf_no_unclassify
  BEFORE UPDATE ON "waqf"
  FOR EACH ROW EXECUTE FUNCTION qmulate_waqf_no_unclassify();

-- A trigger created normally is skipped under `session_replication_role = 'replica'` — one `SET`,
-- not DDL, from irrelevant (the G-1 lesson). Every guard in this repo is `ENABLE ALWAYS`.
ALTER TABLE "waqf" ENABLE ALWAYS TRIGGER waqf_no_unclassify;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE FUNCTION-PRIVILEGE SWEEP (migration 12 §6's rule, and its trap sprung AGAIN)
--
-- This file creates one function and replaces another, and its first draft ended here — without
-- this call. `authorization-plane-privilege.integration.test.ts` assertion 1f went red on the
-- first fresh-cluster run, exactly as migration 12 §6 predicted for "the NEXT migration to add a
-- function": PostgreSQL's built-in default grants EXECUTE to PUBLIC on every new function, and
-- `ALTER DEFAULT PRIVILEGES … REVOKE` never protected future objects (the pg_default_acl finding,
-- measured there). The sweep is the remedy that scales; caught by the census, not by review.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
