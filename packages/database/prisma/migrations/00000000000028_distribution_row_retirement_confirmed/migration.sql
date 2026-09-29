-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — MIGRATION 28 · MIGRATION 27's GUARD, WITH A MESSAGE THAT IS TRUE AGAIN
--
-- ⚠ THIS MIGRATION EXISTS FOR ONE REASON: **A LIVE GUARD WAS ASSERTING SOMETHING FALSE.**
--
-- Migration 27 gated `distribution."deletedAt"` as **engineering's extension** of the Q8 + AV7-F4
-- soft-delete family to a new SUBJECT, and said so inside its own refusal:
--
--     "⚠ THIS GATE IS ENGINEERING'S EXTENSION OF A RULED PATTERN TO A NEW SUBJECT, NOT A RULING
--      ABOUT DISTRIBUTION RUNS. … Whether retiring a PAID RUN is a reserved matter has NOT been
--      put to the owner; this file carries a TODO(surface) saying so."
--
-- **It has now been put to him, and he answered "confirmed."** (S4 owner-decision memo, "S7 ·
-- Migration 27", 2026-08-20 — recorded RECORD-ONLY in its own commit before this file was
-- written, the same pattern as `c00e832`.) So every sentence quoted above is now FALSE, and it is
-- false in the worst available place: the text a caller is handed when the database refuses them.
-- A Nazir or an auditor reading that refusal would conclude the control rests on an engineering
-- judgement nobody had ratified. This repo has corrected two "false-comfort comments" already;
-- a false-comfort REFUSAL is worse, because it is addressed to someone acting on it.
--
-- ── ⚠ WHY A NEW MIGRATION RATHER THAN AN EDIT TO 27 ─────────────────────────────────────────
-- **Migration 27 is APPLIED** — locally, and on CI runs `32365715932` and `32368732328`. Prisma
-- stores a CHECKSUM per applied migration in `_prisma_migrations`, so editing that file does not
-- correct the message: it makes `migrate deploy` refuse the whole history as modified. The guard
-- body is therefore replaced here with `CREATE OR REPLACE FUNCTION`, which is how this schema has
-- always changed a guard body (migrations 4 §2a, 15, 25).
--
-- ⚠ **MIGRATION 27'S TEXT IS LEFT EXACTLY AS IT SHIPPED, AND THAT IS DELIBERATE.** It is the
-- historical record of a gate that was installed flagged, and of a flag that was honoured until
-- the owner answered. Rewriting history to look as though the ruling came first would erase the
-- one property that made the flag worth carrying.
--
-- ── WHAT CHANGES, AND WHAT EMPHATICALLY DOES NOT ────────────────────────────────────────────
-- ONLY the sentence. **The strictness, the subject string, the verifier, the `IU` verbs, the
-- `ENABLE ALWAYS`, the status-specific REASON and the "an approval buys the retirement, not the
-- period" clause are all byte-identical to migration 27.** No behaviour moves — which is why the
-- census and the behavioural suites keep asserting exactly what they asserted, apart from the two
-- assertions that pinned the old wording ON PURPOSE and are updated in the same commit.
--
-- ⚠ AND THE GATE IS STILL NOT A KIND. There is no `ReservedMatterKind` naming a retirement and no
-- soft-delete PROCEDURE; the gate remains SUBJECT-bound, like its three siblings. Whoever builds
-- that procedure owes a kind AND its ar/en copy — product-approved text a code change may not
-- invent. Confirming the RULING did not settle the VOCABULARY.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION qmulate_distribution_row_retirement()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dist_retire$
DECLARE
  approval   text;
  defect     text;
  subject    text;
  row_id     text;
  row_waqf   text;
  row_status text;
  old_value  text;
  new_value  text;
  why        text;
  verb       text;
BEGIN
  -- ── (1) DOES THIS STATEMENT MOVE THE COLUMN AT ALL? ────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NULL THEN
      RETURN NEW;
    END IF;
    row_id     := NEW."id";
    row_waqf   := NEW."waqfId";
    row_status := NEW."status"::text;
    old_value  := '<no prior row: this run is BORN retired>';
    new_value  := NEW."deletedAt"::text;
    verb       := 'RECORDING A DISTRIBUTION RUN THAT IS ALREADY RETIRED';
  ELSE
    IF NEW."deletedAt" IS NOT DISTINCT FROM OLD."deletedAt" THEN
      RETURN NEW;
    END IF;
    row_id     := OLD."id";
    row_waqf   := OLD."waqfId";
    row_status := OLD."status"::text;
    old_value  := coalesce(OLD."deletedAt"::text, 'NULL');
    new_value  := coalesce(NEW."deletedAt"::text, 'NULL');
    verb       := CASE
                    WHEN OLD."deletedAt" IS NULL THEN 'RETIRING A DISTRIBUTION RUN'
                    WHEN NEW."deletedAt" IS NULL THEN 'UN-RETIRING A RETIRED DISTRIBUTION RUN'
                    ELSE 'RE-DATING A RETIREMENT'
                  END;
  END IF;

  -- ── (2) THE STATED REASON DIFFERS BY STATUS. THE STRICTNESS DOES NOT. ──────────────────
  -- Uniform, on AV7-F4's own logic (product owner, 2026-08-20, option (a)). This block chooses a
  -- SENTENCE; it chooses no test. Exactly one gate follows, for both arms.
  IF row_status = 'EXECUTED' THEN
    why := 'THIS RUN HAS PAID. Its distribution_line_item rows are intact and those halalas are '
           'still owed to named beneficiaries — retiring the run does not un-pay anybody, it only '
           'removes the evidence: get, list and lines all filter "deletedAt" IS NULL, so the Nazir '
           'loses sight of a payment that still stands. MEASURED before this guard, as qmulate_app '
           'with no approval, one UPDATE did exactly that. ⚠ AND IT IS NOT WHY '
           'distribution_paid_periods_disjoint IS SAFE: migration 26 deliberately left "deletedAt" '
           'out of that predicate, so period disjointness already survives an unapproved '
           'retirement. This gate closes the EVIDENCE gap, not a money gap.';
  ELSE
    why := format('This run is %s and has paid nothing, which is the weakest case for a gate — and '
                  'it is gated anyway, at the SAME STRICTNESS, because "deletedAt" is the ONLY '
                  'legal retirement of a run (distribution_no_delete, migration 6) and an ungated '
                  'one is an unaudited disappearance whatever the status. A status is not a '
                  'permission. Only the sentence you are reading differs from the EXECUTED arm.',
                  row_status);
  END IF;

  -- ── (3) THE ONE GATE ───────────────────────────────────────────────────────────────────
  approval := current_setting('qmulate.reserved_matter_approval_id', true);
  subject  := 'distribution:' || row_id || ':deletedAt';
  defect   := qmulate_reserved_matter_defect(approval, row_waqf, subject);

  IF defect IS NOT NULL THEN
    RAISE EXCEPTION
      '% on distribution % (status %) is a RESERVED MATTER. "deletedAt" would move % -> %. '
      '% '
      'PRODUCT OWNER, 2026-08-20 (S4 owner-decision memo, "S7 · Migration 27"), verbatim: '
      '"confirmed." Retiring a PAID DISTRIBUTION RUN is a reserved matter by his ruling. It '
      'reached that status by extension of a family he had already ruled twice — waqf."deletedAt" '
      '(memo Q8, 2026-08-17) and ANY committed receipt, uniformly (memo AV7-F4, 2026-08-20, on the '
      'logic that anything changing what is distributable gets the gate) — and the extension was '
      'shipped FLAGGED as engineering''s reading until he answered it. He has. %. Go through '
      'withReservedMatter(), which verifies an '
      'APPROVED, maker <> checker RESERVED_MATTER approval for THIS endowment AND THIS artifact '
      'before it sets qmulate.reserved_matter_approval_id; the subject an approval must name is '
      '"%". ⚠ AND NOTE WHAT AN APPROVAL BUYS: the retirement, not the period. '
      'distribution_paid_periods_disjoint (migration 26) does NOT filter "deletedAt", so a '
      'legitimately retired PAID run still blocks its period from being paid a second time — a '
      'retired run is not an unpaid one.',
      verb, row_id, row_status, old_value, new_value, why, defect, subject
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_dist_retire$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · NO TRIGGER CHANGE, AND NO RE-CREATE
--
-- `distribution_row_retirement` already points at this function name and is already
-- `ENABLE ALWAYS` (migration 27 §2). `CREATE OR REPLACE FUNCTION` rebinds the body in place, so
-- dropping and re-creating the trigger would risk a window with no guard for the sake of nothing.
-- The census (`guard-verb-coverage.integration.test.ts`, CENSUS-1 + CENSUS-3) asserts the trigger
-- is present with verbs `IU` at `tgenabled = 'A'`, and it is what would catch a regression here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · EXECUTE IS REVOKED FROM PUBLIC — the replaced body is a NEW ACL SUBJECT
--
-- ⚠ NOT REDUNDANT WITH MIGRATION 27 §3. `CREATE OR REPLACE FUNCTION` on an EXISTING function
-- PRESERVES its ACL, so this ought to be a no-op — but "ought to be" is exactly the reasoning
-- that put five functions into the world PUBLIC-executable in S4 and three more in S6, and
-- posture assertion 1f caught both times. Idempotent, and cheaper than the assumption.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
