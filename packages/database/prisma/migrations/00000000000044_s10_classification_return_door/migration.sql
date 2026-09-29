-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 44 — S10-2b · THE MIGRATION-34 RETURN DOOR, RESERVED-MATTER-GATED
--
-- Migration 34 closed BOTH revocation paths and left this, verbatim, at its §46-50:
--
--   "TODO(surface): whether a classification RECORDED IN ERROR may ever be returned to
--    `NOT_CLASSIFIED` … is the owner's call, not taken here. The safe default refuses … and
--    widening later is safe where narrowing a live guard is not (D-5)."
--
-- It is the owner's call and the owner has taken it, twice, and the two answers are different
-- halves of one act:
--
--   · GATE — S8 addendum, FOURTH batch, 2026-08-25 (memo:550-558), ⚠ recorded as OVERRULING the
--     orchestrator's recommendation. "Allow return, reserved-matter-gated." In terms: "An erroneous
--     real classification MAY return to NOT_CLASSIFIED via a maker≠checker reserved-matter approval
--     (e.g. a classification entered on the wrong endowment entirely). The one-way door gains
--     exactly this gated exception; THE DEFAULT REFUSAL STANDS FOR THE UNGATED PATH."
--   · DISPOSITION — S9 addendum, SECOND batch, 2026-08-27. "Retire with named reason": the act
--     retires the open tasks with reason "classification returned to NOT_CLASSIFIED", rows kept,
--     history queryable, a later correct classification runs a fresh instantiation. This
--     DISCHARGES the fourth batch's "must be DESIGNED, not defaulted".
--
-- ── ⚠ MIGRATION 34'S TWO ERROR MESSAGES ARE NOW FALSE, AND ITS FILE IS NOT EDITED ───────────
-- Both of 34's refusals say, in terms, "a recorded determination is never revoked back into
-- absence" and "NOT_CLASSIFIED is the absence of a determination, not a class". As of this file a
-- narrow gated path exists, so those sentences describe a system that no longer is. Migration 34's
-- FILE STAYS UNTOUCHED — an applied migration's checksum is its identity and editing it would make
-- `migrate deploy` refuse on every existing database — so the supersession is recorded HERE and the
-- replacement bodies below carry messages that are true. The superseded reasoning is kept visible
-- rather than erased, because a future reader hitting one of these refusals deserves to know that
-- the rule narrowed and when.
--
-- ⊕ WHICH HALF OF S8-Q4's REASONING SURVIVES, because it is not all overridden:
--   · Its SECOND clause — the return "would re-lock a register whose duties were already in force"
--     — is a LIVE concern, and the disposition ruling ANSWERS it (retire the open tasks with the
--     named reason) rather than dismissing it.
--   · Its FIRST clause — that revocation has no place in an append-only history — is the half the
--     later ruling overrides, AND IT IS OVERRIDDEN BY MAKING THE REVOCATION ITSELF A RECORDED
--     EVENT. `reclassification_event` is append-only and durable (`_no_delete` since migration 6;
--     `_no_update` / `_no_truncate` re-established at migration 12, all ENABLE ALWAYS), so a caller
--     forced to write the history first CANNOT then erase it. That is the argument for why this
--     door is safe, and it is a stronger argument than "the owner ruled it".
--
-- ── BOTH REFUSALS MOVE IN ONE FILE, AND THAT IS NOT TIDINESS ────────────────────────────────
-- 34 refuses in two places: the `reclassification_event` `to`-check AND the `waqf` UPDATE. Relaxing
-- only the UPDATE — the obvious half — would leave the history FORBIDDEN from recording the very
-- transition the UPDATE is being asked to permit. The door would then be a condition that can never
-- be satisfied, reporting "the door works; nothing has gone through it": migration 42's lesson
-- (a guard that never meets its own condition reports its silence as success) in its most
-- expensive form, because it would look shipped.
--
-- ── THE GATE IS AN ARTIFACT-BOUND APPROVAL, VERIFIED IN SQL ─────────────────────────────────
-- `qmulate_reserved_matter_defect(approval, waqfId, subject)` (migration 3 §, artifact-bound by
-- migration 4's C-14) returns NULL only when the id in `qmulate.reserved_matter_approval_id` names
-- a row that: exists · is not soft-deleted · is type RESERVED_MATTER · is status APPROVED · belongs
-- to THIS endowment · has a non-null `checkerId` · has `checkerId <> makerId` · AND names THIS
-- artifact. ⚠ The GUC is a CARRIER, not a capability: setting it by hand buys nothing, because the
-- id it carries is then verified against `approval_request` here, in the database. That is the
-- distinction ADR-0006 turned on — the Shart hatch's defect was never that a GUC existed, it was
-- that NOTHING BEHIND IT WAS CHECKED.
--
-- THE SUBJECT is `waqf:<id>:classification:NOT_CLASSIFIED` — deliberately naming the TARGET STATE,
-- not merely the column. An approval to change `classification` in general would be authority over
-- the ordinary re-classification too, which is NOT a reserved matter and never has been; binding to
-- the target state means an approval minted for this act can only ever perform this act.
--
-- ── REPLAY, AND WHY NO TIMESTAMP CARRIES A SECURITY DECISION HERE ───────────────────────────
-- An approval is spent by moving it to EXECUTED, and `approval_request_status_transition`
-- (migration 3) refuses every transition out of a terminal state — so an EXECUTED approval can
-- never return to APPROVED, and the defect function refuses anything that is not APPROVED. A second
-- cycle therefore needs a second approval. ⚠ An earlier draft of this door tried to bind the UPDATE
-- to "the LATEST reclassification_event", which would have made a CALLER-SUPPLIED ordering
-- load-bearing; that is dropped, and the standing warning it produced is kept below because the
-- next person to write a time-ordered guard on this table will need it.
--
-- ⚠⚠ STANDING WARNING FOR ANY FUTURE GUARD ON `reclassification_event`: THE TABLE HAS TWO
-- TIMESTAMPS AND THEY ARE NOT INTERCHANGEABLE. `"at"` has NO default and is CALLER-SUPPLIED — an
-- assertion about when something happened. `"createdAt"` is `DEFAULT now()` — the database's own
-- record of when the row arrived. ONLY THE SECOND CAN CARRY A SECURITY DECISION: a guard ordered by
-- `"at"` is defeated by one row inserted with a date far in the future, which would then be
-- permanently "latest". ⚠ And the model's only index is `@@index([waqfId, at])` — it indexes the
-- WRONG COLUMN for any such query, so whoever profiles a future guard here will find an index on
-- `"at"` sitting invitingly next to a sequential scan. Do not take it.
--
-- ── CONCURRENCY, STATED RATHER THAN TRUE BY ACCIDENT ────────────────────────────────────────
-- Two simultaneous returns on one endowment serialise on the `waqf` row lock, which `BEFORE UPDATE`
-- acquires before the trigger body runs. The second transaction then sees `OLD."classification" =
-- 'NOT_CLASSIFIED'` and falls out of the outer condition as a no-op, exactly as a
-- NOT_CLASSIFIED → NOT_CLASSIFIED update always has. Nothing here depends on that being lucky.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — THE HISTORY MAY NOW RECORD THE TRANSITION, IF AND ONLY IF IT IS AUTHORISED
--
-- Migration 34 §1's body, verbatim, with its final refusal turned from ABSOLUTE into GATED. The
-- three checks before it are unchanged and still run first, so a caller who both fabricated the
-- transition and aimed it at NOT_CLASSIFIED still hears about the fabrication first.
--
-- ⚠ THE EVENT INSERT IS GATED TOO, not just the column write. An ungated event would let a caller
-- with no authority write a TRUE-LOOKING revocation into an append-only history that can never be
-- corrected, while the classification never moved. That is a falsified record even though no state
-- changed, and this table's whole value is that it cannot be edited afterwards.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_reclassification_from_matches_current()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_reclass_from$
DECLARE
  current_classification text;
  defect                 text;
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

  -- ⊕ S10-2b. WAS an outright refusal (migration 34, S8-Q4). The owner has since ruled the return
  -- ALLOWED but RESERVED-MATTER-GATED (2026-08-25), so the transition is permitted here only
  -- against a verified, artifact-bound approval — and refused exactly as before without one.
  IF NEW."to"::text = 'NOT_CLASSIFIED' THEN
    defect := qmulate_reserved_matter_defect(
      current_setting('qmulate.reserved_matter_approval_id', true),
      NEW."waqfId",
      'waqf:' || NEW."waqfId" || ':classification:NOT_CLASSIFIED'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'reclassification_event %: recording a return to NOT_CLASSIFIED is a RESERVED MATTER and '
        'this one is not approved: %. The return is allowed (product owner, 2026-08-25, overruling '
        'the recommendation to keep the door shut) but ONLY through a maker <> checker '
        'RESERVED_MATTER approval naming THIS endowment and the subject '
        '"waqf:%:classification:NOT_CLASSIFIED" — the default refusal stands for the ungated path. '
        'Go through classification.returnToNotClassified. ⚠ An ORDINARY correction of a wrong class '
        'is NOT this act and needs no approval: re-classify to the correct class instead, which '
        'keeps the register open.',
        NEW."id", defect, NEW."waqfId"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_reclass_from$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — THE COLUMN WRITE, GATED THE SAME WAY
--
-- Migration 34 §2's body with the same change. INSERT stays untouched (being BORN unclassified is
-- the onboarding state) and a NOT_CLASSIFIED → NOT_CLASSIFIED no-op UPDATE stays allowed, both for
-- migration 34's original reasons.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_waqf_no_unclassify()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_waqf_no_unclassify$
DECLARE
  defect text;
BEGIN
  IF NEW."classification"::text = 'NOT_CLASSIFIED'
     AND OLD."classification"::text IS DISTINCT FROM 'NOT_CLASSIFIED' THEN
    defect := qmulate_reserved_matter_defect(
      current_setting('qmulate.reserved_matter_approval_id', true),
      OLD."id",
      'waqf:' || OLD."id" || ':classification:NOT_CLASSIFIED'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'UPDATE on "waqf" %: returning classification % to NOT_CLASSIFIED is a RESERVED MATTER and '
        'this one is not approved: %. The return is allowed (product owner, 2026-08-25) but ONLY '
        'through a maker <> checker RESERVED_MATTER approval naming THIS endowment and the subject '
        '"waqf:%:classification:NOT_CLASSIFIED"; the default refusal stands for the ungated path, '
        'which is what you have just taken. Go through classification.returnToNotClassified, which '
        'records the history event, verifies the approval, retires the register''s open tasks with '
        'the ruled reason and spends the approval. ⚠ If the class is merely WRONG, re-classify to '
        'the correct one instead — that keeps the register open and needs no approval.',
        OLD."id", OLD."classification", defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$qm_waqf_no_unclassify$;

-- The triggers themselves are migration 34's, already registered ENABLE ALWAYS; a REPLACED body
-- inherits that (migration 12 §4.7's note, and migration 34 relied on the same property).


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE FUNCTION-PRIVILEGE SWEEP (migration 12 §6's rule)
--
-- This file REPLACES two functions rather than creating any, so PostgreSQL's default EXECUTE-to-
-- PUBLIC grant on new functions does not apply — `CREATE OR REPLACE` preserves the existing ACL.
-- The sweep is called anyway, for the reason migration 34 §3 learned the hard way: it is idempotent,
-- it costs nothing, and the one time it is omitted is the time a function was actually created.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
