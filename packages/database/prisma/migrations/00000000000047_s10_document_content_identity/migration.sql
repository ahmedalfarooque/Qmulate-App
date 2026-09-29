-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Migration 47 · S10/T3 — the document's CONTENT IDENTITY is write-once.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠ WHAT THIS MIGRATION IS NOT, said first because the discovery reshaped the stage: it is NOT
-- the retention floor. THE FLOOR ALREADY EXISTS AND HAS SINCE E1 — `document_retention_guard`
-- (migration 1: DELETE refused inside the window; refused under a legal hold, checked FIRST so
-- the hold OUTLIVES the window — the storage interface's own word), `document_no_truncate`, and
-- `document_retention_forward_only`, whose reserved-matter hatch was ARTIFACT-BOUND in migration
-- 4 (C-14: the approval must name "document:<id>:retentionUntil" / ":legalHold", never be any
-- approval anywhere). All three ENABLE ALWAYS since migration 1. T3's floor work is therefore
-- MEASUREMENT plus this one genuinely missing piece — per the standing rule: say so rather than
-- duplicating.
--
-- THE MISSING PIECE: nothing froze `storageKey` or `sha256`. The delete/retention guards protect
-- the ROW; neither protects WHAT THE ROW POINTS AT —
--
--   · a re-pointed `storageKey` is a SWAPPED DOCUMENT wearing a retained row: every guard holds,
--     the audit trail still shows the original registration, and the vault serves different
--     bytes for the deed it claims to have kept ten years;
--   · a rewritten `sha256` is the same swap one layer up — a hash that can be made to agree with
--     substituted bytes is a decoration, not an integrity check.
--
-- So both are WRITE-ONCE, unconditionally — no reserved-matter hatch, deliberately: retention
-- length and legal holds are governance decisions with a ruled release path; WHICH BYTES a
-- retained document consists of is not a decision anyone holds. A corrected document is a NEW
-- version/row (BR-703's own model — `version` exists for exactly this), never an edit. Same
-- family as the Shart columns: the row's purpose is to be the record of what was filed.
--
-- (Both columns are NOT NULL at insert, so there is no NULL-backfill arm to reason about.)

CREATE OR REPLACE FUNCTION qmulate_document_content_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_doc_identity$
BEGIN
  IF NEW."storageKey" IS DISTINCT FROM OLD."storageKey" THEN
    RAISE EXCEPTION
      'document %: "storageKey" is write-once (S10/T3). A re-pointed key is a swapped document '
      'wearing a retained row — the >= 10-year obligation (NFR-07 / BR-702) is about the BYTES, '
      'not the row. A corrected document is a NEW version, never an edit.', OLD."id"
      USING ERRCODE = '42501';
  END IF;
  IF NEW."sha256" IS DISTINCT FROM OLD."sha256" THEN
    RAISE EXCEPTION
      'document %: "sha256" is write-once (S10/T3). A rewritable integrity hash can be made to '
      'agree with substituted bytes, which makes it a decoration. A corrected document is a NEW '
      'version, never an edit.', OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_doc_identity$;

DROP TRIGGER IF EXISTS document_content_identity ON "document";
CREATE TRIGGER document_content_identity
  BEFORE UPDATE OF "storageKey", "sha256" ON "document"
  FOR EACH ROW
  EXECUTE FUNCTION qmulate_document_content_identity();

-- The same closure every guard in this family gets (migration 1 §3.7's reasoning): fires under
-- session_replication_role = replica and for the table owner alike.
ALTER TABLE "document" ENABLE ALWAYS TRIGGER document_content_identity;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- EXECUTE IS REVOKED FROM PUBLIC ON THE FUNCTION THIS FILE CREATES — mandatory in every
-- migration that adds one (migration 12 §6's measured finding, restated by migration 18 §5:
-- `ALTER DEFAULT PRIVILEGES … REVOKE` stores nothing with no explicit pg_default_acl row, so a
-- fresh CREATE takes the built-in PUBLIC default). The first chain run of THIS migration proved
-- the trap is still armed: ADR-0008 assertion 1f went red on `qmulate_document_content_identity`
-- with proacl NULL. The trigger mechanism needs no EXECUTE grant, so revoke-only is complete.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_doc_identity_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE document content identity: qmulate_revoke_public_function_execute() is missing. '
      'It is defined by 00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at '
      'the end of every migration that creates a function.';
  END IF;
END
$qm_doc_identity_sweep$;

SELECT qmulate_revoke_public_function_execute();
