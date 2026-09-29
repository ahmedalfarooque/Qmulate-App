-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 35 — E7 / S8-Q6 · A FILING'S "SUBMITTED" NEEDS A CHECKER (G-3, ENFORCED)
--
-- **Owner ruling, 2026-08-23, verbatim selection: "Require approval (Recommended)."**
-- Recorded in `docs/product/prd/S4-owner-decision-memo.md` (S8 addendum, second batch) and
-- committed RECORD-ONLY as `e0fafb4` before this migration cited it. The ruling's terms: *"A
-- filing status change to `submitted` needs an approved request — the same maker≠checker shape as
-- money movement; G-3's 'filings cannot be self-approved' becomes enforced rather than
-- aspirational. `ApprovalType.GOVT_FILING` finally gets a minter; the approver seat stays `nazir`
-- (already decided)."*
--
-- ── WHAT WAS TRUE BEFORE THIS FILE ───────────────────────────────────────────────────────────
-- `ApprovalType` has carried `GOVT_FILING` since `init`, and NOTHING ever minted or consumed one:
-- gate G-3's filing clause was a vocabulary with no control behind it. `government_filing.status`
-- was writeable to `SUBMITTED` by any seat holding UPDATE — one person could tell the record a
-- regulator was told something, with no second pair of eyes anywhere.
--
-- ── THE SHAPE — the distribution guard's, one table over ─────────────────────────────────────
-- `qmulate_approval_defect(...)` is migration 4's ONE implementation of the eight approval
-- conditions (exists · not deleted · right type · APPROVED · same endowment · has a checker ·
-- checker ≠ maker · names THIS subject). This trigger binds it to the transition INTO `SUBMITTED`,
-- on INSERT as well as UPDATE — a filing BORN submitted is the same act (the migration-14 V1/AV-5
-- lesson: `asset` could be born `EXPROPRIATED` with no approval, and the INSERT arm is what closed
-- it).
--
-- `p_allow_spent := false`, UNLIKE the distribution guard's `true`, and the difference is the
-- trigger TIMING: the distribution check is a DEFERRED constraint trigger that runs at COMMIT,
-- when the run and its approval have already reached their terminal states together. This one is
-- BEFORE the row change — the approval is still `APPROVED` at that instant and is marked
-- `EXECUTED` by the same transaction AFTER the filing row moves. A re-submission (REJECTED →
-- SUBMITTED again) therefore cannot reuse the spent approval: it needs a freshly APPROVED one,
-- which is one-approval-one-submission by construction.
--
-- ── WHAT IS DELIBERATELY NOT GATED ───────────────────────────────────────────────────────────
-- Every other status is manual bookkeeping (BR-603: these are MANUAL status fields, not live
-- integrations): `NOT_STARTED`, `IN_PROGRESS`, `N_A` record intent; `ACCEPTED` / `REJECTED`
-- record the AUTHORITY'S OWN decision, which no internal approval can make more or less true.
-- Gating those would put a checker between the record and reality. The one act that ASSERTS
-- something to a regulator — "we submitted this" — is the one act gated.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — THE COLUMN ───────────────────────────────────────────────────────────────────
-- The authority for the CURRENT submission. Plain text, NOT a foreign key — the same decision the
-- distribution table records in its own doc comment: the trigger below is the verifier, and an FK
-- would add delete-ordering coupling without adding any of the eight conditions.
ALTER TABLE "government_filing" ADD COLUMN IF NOT EXISTS "approvalRequestId" TEXT;


-- ── SECTION 2 — THE GUARD ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_government_filing_submission_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_filing_submit$
DECLARE
  entering_submitted boolean;
  defect text;
BEGIN
  entering_submitted :=
    NEW."status"::text = 'SUBMITTED'
    AND (TG_OP = 'INSERT' OR OLD."status"::text IS DISTINCT FROM 'SUBMITTED');

  IF entering_submitted THEN
    defect := qmulate_approval_defect(
      NEW."approvalRequestId", NEW."waqfId", 'GOVT_FILING', NEW."id", false
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        '% on "government_filing" % into SUBMITTED is refused: %. A submission asserts to a '
        'regulator that a filing was made, and G-3 says a filing cannot be self-approved '
        '(S8-Q6, product owner, 2026-08-23): it needs an APPROVED maker<>checker GOVT_FILING '
        'approval naming THIS filing row. Mint one via the filing submission path, have the '
        'approver seat approve it, and submit with its id.',
        TG_OP, NEW."id", defect
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND NEW."approvalRequestId" IS DISTINCT FROM OLD."approvalRequestId" THEN
    -- The evidence pointer may change ONLY in the statement that performs a submission. A later
    -- re-point would rewrite WHICH authority a recorded submission rests on — the same
    -- fabricated-history shape `reclassification_event_from_matches_current` exists to refuse.
    RAISE EXCEPTION
      'UPDATE on "government_filing" %: "approvalRequestId" may only change on the transition '
      'into SUBMITTED — re-pointing a recorded submission at a different approval rewrites the '
      'evidence of who authorised it (S8-Q6 / G-3).',
      NEW."id"
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_filing_submit$;

DROP TRIGGER IF EXISTS government_filing_submission_authority ON "government_filing";
CREATE TRIGGER government_filing_submission_authority
  BEFORE INSERT OR UPDATE ON "government_filing"
  FOR EACH ROW EXECUTE FUNCTION qmulate_government_filing_submission_guard();

-- One `SET session_replication_role = 'replica'` from irrelevant otherwise (the G-1 lesson).
ALTER TABLE "government_filing" ENABLE ALWAYS TRIGGER government_filing_submission_authority;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE FUNCTION-PRIVILEGE SWEEP (migration 12 §6's rule; see migration 34 §3 — both
-- files sprang the documented trap together and were caught by census assertion 1f on the same
-- fresh-cluster run).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
