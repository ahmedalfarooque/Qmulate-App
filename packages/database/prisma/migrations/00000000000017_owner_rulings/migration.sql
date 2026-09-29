-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — THE OWNER'S RULINGS, IN POSTGRES: RETIRING AN ENDOWMENT IS A RESERVED MATTER, AND A
--           RECORDED NAZIR APPOINTMENT IS WRITE-ONCE FOR EVERY SEAT.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- TWO SENTENCES THIS FILE EXISTS TO MAKE TRUE IN POSTGRES, BOTH OF THEM THE PRODUCT OWNER'S
-- (`docs/product/prd/S4-owner-decision-memo.md`, answered in session 2026-08-17):
--
--     Q8 — "SETTING (AND CLEARING) `waqf.deletedAt` ON A LIVE ENDOWMENT REQUIRES AN APPROVED
--           RESERVED-MATTER REQUEST."
--     Q10 — "THE TRUSTEESHIP DEED CAN ONLY BE EDITTED BY A COURT JUDGE." — rendered by
--           engineering, AND FLAGGED AS SUCH BELOW, as: no system seat may edit a recorded
--           `trusteeship_deed`; a court-ordered change enters as a NEW SUPERSEDING RECORD.
--
-- ── Q8 · MEASURED BEFORE, and this is what the ruling closes (V-E3 register item A3) ──────────
--
--   As the LEAST-privileged runtime role `qmulate_app`, no approval in session, on a `--reset` →
--   `migrate deploy` → `db:seed` database at migration 16, every probe inside its own transaction
--   and ROLLED BACK (cluster `q8q10db`, port 54379; `current_user` = `qmulate_app` asserted, and
--   `has_table_privilege('qmulate_app','waqf','UPDATE')` = true, so the ACL is not what answered):
--
--     ⚠ COMMITS   UPDATE "waqf" SET "deletedAt" = now()  WHERE "id" = 'waqf-001'
--     ⚠ COMMITS   …and the CLEAR immediately after it: SET "deletedAt" = NULL
--       REFUSED    the CONTROL on the same row, same role: SET "shartAlWaqifVersion" = 2  → 42501
--                  *shart_al_waqif is immutable … may NEVER be amended*
--
--   So the least-privileged role could soft-retire a PERPETUAL endowment — remove it from every
--   register the Nazir, the classification bands (BR-104 — ⚠ verify, may be stale, confirm vs
--   primary law) and the Authority report read from — and put it back, with no approval, while the
--   founder's conditions one column over were sealed. `waqf_no_delete` / `waqf_no_truncate`
--   (migration 4) refuse the HARD delete and name `deletedAt` as the only legal retirement, so this
--   is the retirement path in substance and it had nothing on it.
--
--   S4 left it open DELIBERATELY (migration 16's header: "IT DOES NOT GOVERN `waqf.deletedAt`"),
--   because whether retiring an endowment is ALWAYS a reserved matter is a scope question. It was
--   put to the product owner and answered (memo Q8(a)). **THIS GATE THEREFORE CARRIES NO
--   `TODO(surface)`** — it is the ruling, not engineering's fail-safe reading. (Contrast §1's
--   sibling on `asset`: migration 14 §1c / 15 §0b still carry theirs, because the memo asked about
--   the ENDOWMENT and never asked whether EVERY retirement of a CORPUS PARCEL is reserved. That
--   flag stays exactly where it is.)
--
-- ── Q10 · MEASURED BEFORE ─────────────────────────────────────────────────────────────────────
--
--   Same role, same session, same rollback discipline
--   (`has_table_privilege('qmulate_app','trusteeship_deed','UPDATE')` = true):
--
--     ⚠ COMMITS   UPDATE "trusteeship_deed" SET "primaryNazir" = 'REWRITTEN (بيانات وهمية)'
--                 WHERE "waqfId" = 'waqf-001'          ← WHO HOLDS THE NAZARAH
--     ⚠ COMMITS   SET "ksaResident" = false             ← a BR-109/NFR-09 eligibility flag
--     ⚠ COMMITS   SET "authorizedRepName" = 'SUBSTITUTED REP', "jointlyLiable" = false
--                                                       ← the jointly-and-severally-liable delegate
--                                                         (Nazarah Art. 11(5) — ⚠ verify, may be
--                                                         stale, confirm vs primary law)
--     ⚠ COMMITS   SET "deletedAt" = now()               ← the appointment retired
--       REFUSED    the CONTROL: SET "id" = 'trust-9901' → 42501 from `trusteeship_deed_id_immutable`
--
--   The identity guard AV4-01 installed on this table (migration 16) watched the ROW'S NAME and
--   nothing else, so every FACT the appointment records was editable by the least-privileged role.
--
-- ── ⚠ WHAT QUALIFIES BOTH MEASUREMENTS, STATED ONCE AND NOT REPEATED ──────────────────────────
--
--   AV4-02 is OPEN BY DESIGN and is ADR-0008's work, not this file's: `qmulate_app` can INSERT its
--   own APPROVED `RESERVED_MATTER` `approval_request` and spend it in the SAME transaction. So §1's
--   refusal below — which is a RESERVED-MATTER GATE — is proven against a caller who does not also
--   forge an approval, and that qualification travels with it. §2's refusal is NOT subject to it:
--   it is unconditional, so there is no key to forge (the same argument migration 16 makes).
--
-- ── WHAT THIS FILE DELIBERATELY DOES *NOT* DO ────────────────────────────────────────────────
--
--   ·  IT DOES NOT GATE `waqf` ON **INSERT**, and the route is REPORTED rather than papered over.
--      MEASURED as `qmulate_app`, rolled back, both COMMITTED:
--        ⚠ COMMITS  INSERT INTO "waqf" (… "deletedAt" = now() …)   — an endowment BORN retired
--        ⚠ COMMITS  the same INSERT with "deletedAt" = NULL        — i.e. the BIRTH ITSELF is
--                                                                    governed by nothing at all
--      Three reasons, in order of weight. (1) The ruling's subject is a LIVE endowment: a birth
--      retires nothing, because before the statement there was no endowment to remove from any
--      register. (2) A row born retired cannot BECOME a live endowment silently, because the CLEAR
--      direction is now gated — and it cannot stand in for an existing endowment either, since
--      `waqf_no_delete` refuses the hard DELETE and `waqf_id_immutable` refuses the rename. (3) The
--      birth of an endowment is UNGOVERNED WHOLESALE — nothing asks WHO may create one or that an
--      `audit_event` name it, the way `waqf_access_grant_admission` does for a seat — so gating one
--      COLUMN of an ungoverned INSERT is a fig leaf, and the honest move is to leave the real gap
--      named. `guard-verb-coverage.integration.test.ts` already reports that gap in
--      `VALUE_TRANSITION_GUARDS`, and this migration adds the `deletedAt` column to that
--      declaration so the exemption is visible rather than absent (CENSUS-2's AV3-11 lesson).
--      ⚠ IF A LATER CHANGE GOVERNS THE `waqf` INSERT, THE FIRST QUESTION TO ASK IS THIS COLUMN.
--
--   ·  IT DOES NOT TOUCH `beneficiary."deletedAt"` — measured open in the same sweep, and the memo
--      did not ask about it. Deactivating a beneficiary is `active`/vital-status territory with its
--      own entitlement consequences (R-FRONTIER), and answering it here would be engineering
--      deciding scope twice over.
--
--   ·  IT DOES NOT ADD A SUPERSESSION MODEL FOR `trusteeship_deed`, AND §2'S REFUSAL SAYS SO OUT
--      LOUD. The remedy the message names — a NEW superseding record carrying the court instrument
--      as evidence — IS NOT REACHABLE IN THIS SCHEMA: `trusteeship_deed."waqfId"` is UNIQUE
--      (`trusteeship_deed_waqfId_key`, asserted in §4), so one endowment holds exactly ONE deed
--      row, and there is no `supersedes` link, no `supersededAt` and no column naming the court
--      instrument. Inventing four columns under time pressure is how a migration ships a shape
--      nobody reviewed, so the debt is REPORTED (E4) and the refusal is honest about it. The
--      consequence, stated rather than glossed: until those columns exist, a court-ordered change to
--      a recorded appointment CANNOT BE RECORDED AT ALL. That is the fail-safe direction of the
--      owner's own sentence — nobody may edit it — and it is deliberately loud.
--
--   ·  IT DOES NOT DROP `trusteeship_deed_id_immutable`, though §2 strictly subsumes it. Migration
--      16 §2 declines to add an id guard where a blanket refusal already exists, on the ground that
--      it would put "a weaker second message in front of a stronger one". Here the order is the
--      other way round and in the caller's favour: triggers fire in NAME order, so
--      `trusteeship_deed_id_immutable` answers a re-key with its own specific message before
--      `trusteeship_deed_no_update` answers everything else. Removing it would replace a precise
--      refusal with a general one. This is EXTENDING the identity-guard family AV4-01 started, not
--      duplicating it: that guard owns the row's NAME, this one owns the row's CONTENT.
--
--   ·  IT ADDS NO TABLE, NO COLUMN, NO TYPE AND NO CHECK CONSTRAINT. Two function bodies (one
--      REPLACED, one new), one `apply` function, one trigger, and two read-only assertion blocks.
--
-- ── WHY A TRIGGER AND NOT A CHECK ────────────────────────────────────────────────────────────
-- A `CHECK` sees ONE row image and can never compare `NEW` to `OLD`, so it cannot express "this
-- value may not CHANGE" at all — the same reason `waqf_shart_immutable` is a trigger.
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase and are
-- therefore DOUBLE-QUOTED everywhere — an unquoted identifier is folded to lower case by Postgres
-- and would silently not match.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
-- `CREATE TRIGGER`, and read-only verification blocks.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- After any schema change that recreates a guarded table, re-apply EVERY guard set, in order:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
--     SELECT qmulate_apply_e2_grant_admission();
--     SELECT qmulate_apply_e3_deed_terms();
--     SELECT qmulate_apply_e3_closeout();
--     SELECT qmulate_apply_e3_closeout_round2();
--     SELECT qmulate_apply_e3_round4();
--     SELECT qmulate_apply_owner_rulings();     -- ← THIS FILE
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — qmulate_shart_guard() GAINS TIER 2b: RETIRING THE ENDOWMENT (memo Q8)
--
-- REPLACES migration 14 §1a's body. EVERY existing arm is carried over VERBATIM — tier 1 (the four
-- Shart columns), tier 1b (the three sealed deed facts), tier 3a (the atomic dated capture), tier 3
-- (the write-once deed terms), the one-way capture flag and tier 2 (certificate / deed identity).
-- ONE block is added, and it is added AFTER tier 2 on purpose.
--
--   TIER 1   the four Shart columns           — refused UNCONDITIONALLY, before any GUC is read.
--   TIER 1b  entitlementOrder / type / nature — refused UNCONDITIONALLY.
--   TIER 3a  the capture flip                 — false -> true must carry its dual date.
--   TIER 3   the deed-term columns            — NULL -> value ONCE; value -> anything refused.
--   TIER 2   certificateNumber / deedNumber   — reserved-matter-only, verified AND artifact-bound.
--   TIER 2b  deletedAt                        — NEW. reserved-matter-only, BOTH DIRECTIONS.
--
-- ⚠ THE TIER ORDER IS PART OF THE CONTRACT AND THIS PLACEMENT PRESERVES IT.
-- `shart-immutability.integration.test.ts` and `e3-deed-term-guards.integration.test.ts` both
-- assert, against this function's own source, that the tier-1 raise precedes the first
-- `current_setting` call — because no approval may ever reach a founder's condition. Tier 2b sits
-- BELOW that read and reuses the `approval` it already loaded, so the ordering is untouched.
--
-- ⚠ A REPLACEMENT IS EXACTLY WHEN A GUARD DISAPPEARS. This body has now been replaced four times
-- (migrations 1 → 3 → 13 → 14 → 17). Every arm below is covered by a behavioural test in
-- `shart-immutability.integration.test.ts` / `e3-deed-term-guards.integration.test.ts`, and tier 2b
-- is mutation-verified against THIS body (its one `IF` is turned into `IF false THEN` inside a
-- rolled-back transaction and the very same UPDATE then COMMITS).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_shart_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_shart_guard$
DECLARE
  approval        text;
  shart_changed   text := NULL;
  sealed_col      text;
  write_once_col  text;
  gated_column    text;
  defect          text;
  old_value       text;
  new_value       text;
  recorded_answer text;
BEGIN
  -- ── (1) THE FOUNDER'S CONDITIONS: WRITE-ONCE, FULL STOP ────────────────────────────────────
  IF NEW."shartAlWaqif" IS DISTINCT FROM OLD."shartAlWaqif" THEN
    shart_changed := 'shartAlWaqif';
  ELSIF NEW."shartAlWaqifVersion" IS DISTINCT FROM OLD."shartAlWaqifVersion" THEN
    shart_changed := 'shartAlWaqifVersion';
  ELSIF NEW."shartAlWaqifSetAt" IS DISTINCT FROM OLD."shartAlWaqifSetAt" THEN
    shart_changed := 'shartAlWaqifSetAt';
  ELSIF NEW."shartAlWaqifSetAtHijri" IS DISTINCT FROM OLD."shartAlWaqifSetAtHijri" THEN
    shart_changed := 'shartAlWaqifSetAtHijri';
  END IF;

  IF shart_changed IS NOT NULL THEN
    RAISE EXCEPTION
      'shart_al_waqif is immutable: column "%" on waqf % may NEVER be amended (Binding rule 1; '
      'user decision 2026-07-27 — the Shart cannot be changed regardless of approvals). There is '
      'no reserved-matter approval, GUC value or migration that opens this. Record a superseding '
      'instrument instead of editing the founder''s conditions.',
      shart_changed, OLD."id"
      USING ERRCODE = '42501';
  END IF;

  -- ── (1b) THE THREE DEED FACTS: SEALED OUTRIGHT (D-B, 2026-08-16) ───────────────────────────
  -- Compared through `to_jsonb` so each column is NAMED ONCE — migration 3's ELSIF chain checked
  -- only the first of two columns and that is the mistake this idiom exists to prevent. Enums render
  -- as their label text through `->>`, which is exactly what the message should print.
  FOREACH sealed_col IN ARRAY ARRAY['entitlementOrder', 'type', 'nature']
  LOOP
    old_value := to_jsonb(OLD) ->> sealed_col;
    new_value := to_jsonb(NEW) ->> sealed_col;
    CONTINUE WHEN new_value IS NOT DISTINCT FROM old_value;  -- unchanged

    RAISE EXCEPTION
      'deed fact "%" on waqf % is SEALED (% -> % refused). It is a condition of the founder, not a '
      'row value: "type" says whether this endowment is خيري or ذري, "entitlementOrder" says which '
      'rule decides who is paid, and "nature" says whether the corpus is عيني or قيمي. ⚠ SEALED '
      'OUTRIGHT, NOT WRITE-ONCE — the column is NOT NULL and already carries the founder''s answer, '
      'so there is no unwritten state and no first write to spend. No reserved-matter approval, GUC '
      'value, migration or backfill opens this (Binding rule 1, ADR-0006; product owner 2026-08-16: '
      '"yes they are unchangable"). If a competent authority or a court directs a change, the answer '
      'is a SUPERSEDING INSTRUMENT recorded as a NEW record, never an edit to this one.',
      sealed_col, OLD."id", coalesce(old_value, 'NULL'), coalesce(new_value, 'NULL')
      USING ERRCODE = '42501';
  END LOOP;

  -- ── (3a) THE CAPTURE IS ONE ACT: THE FLAG AND ITS DATE MOVE TOGETHER (AV-1) ────────────────
  --
  -- MEASURED BEFORE THIS BLOCK EXISTED, as `qmulate_app` on the pristine intake endowment
  -- waqf-005: `UPDATE "waqf" SET "reversionClauseCaptured" = true` ALONE **committed**, leaving
  -- `{captured: true, kind: NULL}` — and the follow-up recording the actual kind was then refused
  -- 42501 by tier 3 below. A half-saved intake form thereby recorded, permanently, that the founder
  -- named no ultimate taker.
  --
  -- Recording that a deed's مآل clause has been READ is an act performed by somebody on a day. The
  -- flip therefore has to arrive with its provenance, in ONE statement, and what the caller then
  -- says about the clause is free: `reversionKind` NULL is the complete answer *"it names no
  -- taker"*, and a non-null kind is the complete answer *"here is the taker"*. Both are permitted;
  -- neither can be added afterwards, which is why neither may be OMITTED now.
  --
  -- ⚠ THIS IS NOT THE SEAL AND MUST NOT BE CONFUSED WITH IT. It fires only on the false -> true
  -- transition. It refuses an INCOMPLETE entry into the sealed state; it never permits an exit.
  IF NOT OLD."reversionClauseCaptured" AND NEW."reversionClauseCaptured"
     AND (NEW."reversionRecordedAt" IS NULL OR NEW."reversionRecordedAtHijri" IS NULL) THEN
    RAISE EXCEPTION
      'waqf %: recording that the مآل clause has been READ ("reversionClauseCaptured" false -> true) '
      'must supply "reversionRecordedAt" AND "reversionRecordedAtHijri" IN THE SAME STATEMENT — got '
      '% / %. This flip is IRREVERSIBLE and it SEALS the whole مآل group, so a statement that flips '
      'it without saying what the clause records would permanently register that this deed names NO '
      'ultimate taker (Binding rule 1, R7-c). Record the reading and its answer as ONE write: '
      '"reversionClauseCaptured" = true with the dual date, plus "reversionKind" if the deed names a '
      'taker and NOTHING if it names none. Every legally-significant date in this schema is DUAL '
      '(schema convention 2) — the frozen Umm-al-Qura snapshot is what stops the displayed date '
      'shifting under a calendar-library update, so half a pair is worse than neither.',
      OLD."id",
      coalesce(NEW."reversionRecordedAt"::text, 'NULL'),
      coalesce(NEW."reversionRecordedAtHijri", 'NULL')
      USING ERRCODE = '42501';
  END IF;

  -- ── (3) THE DEED TERMS: WRITE-ONCE (NULL -> value ONCE, then sealed) ───────────────────────
  FOREACH write_once_col IN ARRAY ARRAY[
    'continuationStipulation', 'reversionKind', 'reversionRecordedAt', 'reversionRecordedAtHijri'
  ]
  LOOP
    old_value := to_jsonb(OLD) ->> write_once_col;
    new_value := to_jsonb(NEW) ->> write_once_col;
    CONTINUE WHEN new_value IS NOT DISTINCT FROM old_value;  -- unchanged

    -- ⚠ NULL DOES NOT MEAN "UNWRITTEN" FOR THE مآل COLUMNS (V-E3-01). Once the clause is captured,
    -- the whole group is SEALED — including at NULL, because NULL is then the RECORDED answer
    -- "this deed names no ultimate taker".
    IF write_once_col LIKE 'reversion%' AND OLD."reversionClauseCaptured" THEN
      -- ⚠ AV-6: THE MESSAGE MUST DESCRIBE **THIS** ROW. It used to hard-code "NULL is that recorded
      -- answer — the deed names NO ultimate taker" and print it on deeds that DO name one, which is
      -- a refusal telling a Nazir something false about his own record. Both recorded answers are
      -- sealed equally; only the sentence differs.
      recorded_answer := CASE
        WHEN OLD."reversionKind" IS NULL
          THEN 'and NULL is that recorded answer — the deed names NO ultimate taker'
        ELSE format('and the recorded answer is "reversionKind" = %s — the deed NAMES an ultimate '
                    'taker, recorded on %s (%s AH)',
                    OLD."reversionKind"::text,
                    coalesce(OLD."reversionRecordedAt"::text, 'an unrecorded date'),
                    coalesce(OLD."reversionRecordedAtHijri", 'unrecorded'))
      END;

      RAISE EXCEPTION
        'deed term "%" on waqf % is SEALED (% -> % refused): the مآل clause has already been read '
        'and recorded ("reversionClauseCaptured" is true), %. Changing it now would rewrite the '
        'founder''s recorded condition by an edit, which no approval opens (Binding rule 1, '
        'ADR-0006). The answer is a SUPERSEDING INSTRUMENT recorded as a NEW record.',
        write_once_col, OLD."id", coalesce(old_value, 'NULL'), coalesce(new_value, 'NULL'),
        recorded_answer
        USING ERRCODE = '42501';
    END IF;

    CONTINUE WHEN old_value IS NULL;                          -- the ONE permitted write

    RAISE EXCEPTION
      'deed term "%" on waqf % is WRITE-ONCE (% -> % refused). It is a condition of the founder, '
      'not a row value: once recorded it may not be changed, cleared or re-stated — not by an '
      'edit, a migration, a backfill, a "correction", and not by any reserved-matter approval '
      '(Binding rule 1, ADR-0006). If a competent authority or a court directs a change, the answer '
      'is a SUPERSEDING INSTRUMENT recorded as a NEW record, never an edit to this one.',
      write_once_col, OLD."id", coalesce(old_value, 'NULL'), coalesce(new_value, 'NULL')
      USING ERRCODE = '42501';
  END LOOP;

  -- `reversionClauseCaptured` is a Boolean, so "write-once" means ONE-WAY: false -> true, never back.
  IF OLD."reversionClauseCaptured" AND NOT NEW."reversionClauseCaptured" THEN
    RAISE EXCEPTION
      'waqf %: "reversionClauseCaptured" is one-way (true -> false refused). Once the deed''s مآل '
      'clause has been read, un-recording that reading would restore the "nobody has looked yet" '
      'state and let an unread deed masquerade as a deed that names no ultimate taker (R7-c, '
      'Binding rule 1). Record a superseding instrument instead.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;

  -- ── (2) DEED / CERTIFICATE IDENTITY: reserved-matter-only, verified, and ARTIFACT-BOUND ─────
  -- Unchanged. Note this is the FIRST GUC read in the function, which is what the parity assertion
  -- in `shart-immutability.integration.test.ts` measures tier 1's raise against.
  approval := current_setting('qmulate.reserved_matter_approval_id', true);

  FOREACH gated_column IN ARRAY ARRAY['certificateNumber', 'deedNumber']
  LOOP
    CONTINUE WHEN (to_jsonb(NEW) ->> gated_column) IS NOT DISTINCT FROM (to_jsonb(OLD) ->> gated_column);

    defect := qmulate_reserved_matter_defect(
      approval, OLD."id", 'waqf:' || OLD."id" || ':' || gated_column
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'column "%" on waqf % is reserved-matter-only: %. Go through withReservedMatter(), which '
        'verifies an APPROVED, maker <> checker RESERVED_MATTER approval for THIS endowment AND '
        'THIS artifact before it sets qmulate.reserved_matter_approval_id (Binding rule 1). The '
        'subject an approval must name for this column is "waqf:%:%".',
        gated_column, OLD."id", defect, OLD."id", gated_column
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- ── (2b) SOFT-RETIRING THE ENDOWMENT IS A RESERVED MATTER — BOTH DIRECTIONS (memo Q8) ───────
  --
  -- MEASURED BEFORE THIS BLOCK, as `qmulate_app` with no approval in session, both COMMITTED:
  --   UPDATE "waqf" SET "deletedAt" = now()  WHERE "id" = 'waqf-001'      ← retire
  --   UPDATE "waqf" SET "deletedAt" = NULL   WHERE "id" = 'waqf-001'      ← un-retire
  -- …while the Shart on the same row, in the same session, was refused 42501.
  --
  -- ⚠ THIS IS THE PRODUCT OWNER'S RULING, NOT ENGINEERING'S FAIL-SAFE READING, AND IT THEREFORE
  -- CARRIES NO `TODO(surface)`. Asked directly whether soft-retiring an endowment is a reserved
  -- matter, he answered option (a) — S4 owner-decision memo Q8, 2026-08-17: *"Setting (and
  -- clearing) `waqf.deletedAt` on a live endowment requires an approved reserved-matter request."*
  -- The recommendation he was given, and accepted, was that an endowment is PERPETUAL and making it
  -- disappear from operations is at least as grave as renaming its certificate — which is tier 2,
  -- one block up, and is why this gate is the same mechanism rather than a new one.
  --
  -- BOTH DIRECTIONS, AND THE CLEAR IS NOT THE LESSER HALF. Retiring removes the endowment from every
  -- register the Nazir, the BR-104 classification bands (⚠ verify, may be stale, confirm vs primary
  -- law) and the Authority report read from. CLEARING restores it — an endowment reappearing in
  -- those registers with no act behind it — and RE-DATING a retirement rewrites when the record says
  -- operations over a perpetual endowment stopped. `waqf_no_delete` / `waqf_no_truncate`
  -- (migration 4) refuse the HARD delete and name this column as the only legal retirement, so this
  -- is the retirement path in substance: with `deletedAt` ungated, migration 4's refusal was a
  -- front door beside an open window.
  --
  -- ⚠ THE BIRTH IS **NOT** GATED, AND THAT IS DELIBERATE AND REPORTED — see this file's header. A
  -- `waqf` INSERT is ungoverned wholesale (MEASURED: `qmulate_app` can INSERT an endowment, with or
  -- without `deletedAt` set), the ruling's subject is a LIVE endowment, and a row born retired
  -- cannot become live without passing THIS gate.
  IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN
    defect := qmulate_reserved_matter_defect(
      approval, OLD."id", 'waqf:' || OLD."id" || ':deletedAt'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'waqf %: changing "deletedAt" (% -> %) is a RESERVED MATTER — soft-retiring an endowment, '
        'and un-retiring it, both require an approved reserved-matter request (PRODUCT OWNER, '
        '2026-08-17, S4 owner-decision memo Q8: "Setting (and clearing) waqf.deletedAt on a live '
        'endowment requires an approved reserved-matter request"). An endowment is PERPETUAL: '
        'retiring it removes it from every register the Nazir, the classification bands (BR-104) and '
        'the Authority report read from, and clearing the column puts it back with no act behind it. '
        '`waqf_no_delete` refuses the hard DELETE and names this column as the only legal retirement '
        '(migration 4), so this is the retirement path in substance. %. Go through '
        'withReservedMatter(), which verifies an APPROVED, maker <> checker RESERVED_MATTER approval '
        'for THIS endowment AND THIS artifact; the subject an approval must name is '
        '"waqf:%:deletedAt".',
        OLD."id", coalesce(OLD."deletedAt"::text, 'NULL'), coalesce(NEW."deletedAt"::text, 'NULL'),
        defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_shart_guard$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — qmulate_trusteeship_deed_immutable(): A RECORDED APPOINTMENT IS WRITE-ONCE (memo Q10)
--
-- ── THE OWNER'S WORDS, AND ENGINEERING'S RENDERING OF THEM — ⚠ FLAGGED, NOT SETTLED ──────────
--
-- Asked who may record or change the trusteeship deed, the product owner first answered about the
-- WAQF deed (*"the deed cannot be changed by anyone after written by the waqif"* — already immutable,
-- Binding rule 1). On clarification that the question was the TRUSTEESHIP deed, he answered, verbatim:
--
--        "oh my bad, the trusteeship deed can only be editted by a court judge."
--        — product owner, 2026-08-17, S4 owner-decision memo Q10
--
-- ⚠ WHAT FOLLOWS IS ENGINEERING'S RENDERING OF THAT SENTENCE AND IT IS FLAGGED FOR HIS
-- CONFIRMATION, because it converts "edit" into "supersede". A judge is not a system user and never
-- will be: there is no seat, no grant and no preset for a court, so "editable by a court judge"
-- cannot be implemented as a permission. It is therefore rendered as:
--
--     · NO SYSTEM SEAT MAY EDIT A RECORDED `trusteeship_deed` — UPDATE is refused for ALL seats,
--       including `nazir`, including the table OWNER, including a session at
--       `session_replication_role = 'replica'`, and including a caller holding a genuine, APPROVED,
--       artifact-bound RESERVED-MATTER approval. There is no key, because there is no lock.
--     · A COURT-ORDERED CHANGE ENTERS AS A NEW SUPERSEDING RECORD carrying the court instrument as
--       evidence — the same superseding-instrument convention Binding rule 1 and ADR-0006 use for
--       the Shart al-Waqif, whose guard names its own remedy in exactly this way.
--     · THE INITIAL RECORDING IS UNAFFECTED: INSERT is not guarded here, so the `nazir` seat still
--       records the appointment once (`endowment:deed:write`, `DOMAIN_WRITE_POLICIES.TrusteeshipDeed`).
--
-- ⚠ AND THE REMEDY IS NOT YET REACHABLE — see the header. `waqfId` is UNIQUE, so a second deed row
-- for the same endowment is structurally impossible, and no column links a superseding record to the
-- one it supersedes or names the court instrument. The refusal SAYS so instead of pointing at a door
-- that is not there. Owed to E4; not invented here.
--
-- ── WHY THE WHOLE ROW AND NOT A COLUMN LIST ──────────────────────────────────────────────────
-- A column list is a decision about which facts matter, taken by whoever writes the list, and this
-- deed records: WHO holds the nazarah, when they were appointed (dual-dated), the authorized
-- representative who is JOINTLY AND SEVERALLY LIABLE for their acts (Nazarah Art. 11(5) — ⚠ verify,
-- may be stale, confirm vs primary law), the successor, and the seven BR-109/NFR-09 eligibility
-- criteria with their verification event. There is no column here that is not part of the
-- appointment. Comparing the whole row through `to_jsonb` also means A COLUMN ADDED BY A LATER
-- MIGRATION IS SEALED BY DEFAULT — fail-shut, ADR-0004's discipline applied to columns rather than
-- enum members — instead of arriving unguarded because nobody remembered this file.
--
-- ── THE ONE EXCLUSION, AND IT IS MEASURED RATHER THAN ASSUMED ────────────────────────────────
-- `updatedAt` is excluded, and ONLY `updatedAt`. It is Prisma's `@updatedAt` bookkeeping stamp: the
-- ORM rewrites it on every update, so an UPDATE that restates the row byte-for-byte still arrives
-- with a new `updatedAt`. AN UPDATE THAT CHANGES NOTHING ELSE IS NOT AN EDIT — it records no new
-- fact about the appointment — and refusing it would break the fixture seed, which is `upsert`-based
-- and re-states all five deeds identically on every run. That is not a convenience: the seed's
-- audited-write count must be IDENTICAL on every run (`seed.integration.test.ts` asserts the
-- `audit_event` total is an exact MULTIPLE of `WRITES_PER_SEED_RUN`, and that a re-run adds exactly
-- one run's worth), so a seed whose deed step wrote on the first run and skipped on later ones would
-- be green on a fresh database and red on a used one — the V-E3-04 class this sprint has now paid for
-- four times. The exclusion is the minimum that keeps the invariant true, and it is pinned from both
-- sides in `e3-deed-term-guards.integration.test.ts`: the identical re-statement COMMITS, and a
-- change to ANY other column — including one bundled INTO an otherwise identical restatement — is
-- REFUSED.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_trusteeship_deed_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_deed_immutable$
DECLARE
  changed text[];
BEGIN
  -- The whole row, minus the ORM's bookkeeping stamp. `jsonb_each` over both images and a join on
  -- the key: the two images always carry the identical key set, so nothing can fall out of the
  -- comparison by being absent from one side.
  SELECT coalesce(array_agg(n.key ORDER BY n.key), ARRAY[]::text[])
    INTO changed
    FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
    JOIN jsonb_each(to_jsonb(OLD)) AS o(key, value) ON o.key = n.key
   WHERE n.key <> 'updatedAt'
     AND n.value IS DISTINCT FROM o.value;

  -- Nothing but the bookkeeping stamp moved: no fact about the appointment changed, so there is
  -- nothing to refuse. See the section header — this arm is what keeps the fixture seed's write
  -- count identical on every run, and it is asserted, not assumed.
  IF cardinality(changed) = 0 THEN
    RETURN NEW;
  END IF;

  -- ⚠ COLUMN NAMES ONLY — NEVER THE VALUES. This row carries a named individual's name and the
  -- BR-109 eligibility criteria (religion, legal capacity, disqualifying-removal history,
  -- residency). `packages/api`'s `assertDeedEligible` deliberately throws with NO name and NO id for
  -- exactly this reason: an eligibility refusal about a person is the last thing that should reach a
  -- log line, an audit payload or a developer's terminal. A refusal naming the COLUMNS is fully
  -- actionable and discloses nothing.
  RAISE EXCEPTION
    'trusteeship_deed %: a recorded Nazir appointment is WRITE-ONCE FOR EVERY SEAT — column(s) % '
    'may not be edited. THE OWNER''S RULING (2026-08-17, S4 owner-decision memo Q10): "the '
    'trusteeship deed can only be editted by a court judge." A judge is not a system user, so NO '
    'seat may edit this record: not nazir, not the table owner, not a replica session, and not a '
    'caller holding a genuine reserved-matter approval — there is no key because there is no lock. '
    'THE REMEDY IS A NEW SUPERSEDING RECORD carrying the court instrument as evidence, never an edit '
    '(the same convention Binding rule 1 / ADR-0006 use for the Shart al-Waqif). The deed records '
    'WHO holds the nazarah, the jointly-and-severally-liable authorized representative (Nazarah '
    'Art. 11(5) — verify, may be stale, confirm vs primary law) and the BR-109/NFR-09 eligibility '
    'criteria; it is also part of a >= 10-year retained record (NFR-07). Recording the appointment '
    'in the FIRST place is unaffected: INSERT is not guarded, and endowment:deed:write on the nazir '
    'seat is the path. ⚠ TWO THINGS THIS REFUSAL IS HONEST ABOUT. (1) The rendering of "edited by a '
    'court judge" as "recorded as a superseding instrument" is ENGINEERING''S, flagged for the '
    'owner''s confirmation. (2) THAT REMEDY IS NOT YET REACHABLE IN THIS SCHEMA: '
    '"waqfId" is UNIQUE, so one endowment can hold exactly one deed row, and there is no '
    'supersession link and no column naming the court instrument. Until E4 adds them, a '
    'court-ordered change cannot be recorded at all — which is the fail-safe direction of the ruling '
    'and is deliberately loud rather than quietly worked around.',
    OLD."id", array_to_string(changed, ', ')
    USING ERRCODE = '42501';

  RETURN NULL;
END;
$qm_deed_immutable$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — INSTALL  (qmulate_apply_owner_rulings)
--
-- ONE trigger. §1 needs none: `waqf_shart_immutable` already carries `qmulate_shart_guard()` on
-- `BEFORE UPDATE` and §4 ASSERTS that rather than trusting this sentence — a body that gained a tier
-- while its trigger lost the verb would be a guard whose source reads correct and whose behaviour is
-- not (ADR-0008 §2.4).
--
-- ⚠ `BEFORE UPDATE` ONLY, ON PURPOSE. INSERT is the initial recording and stays with the `nazir`
-- seat; DELETE and TRUNCATE are already refused outright by `trusteeship_deed_no_delete` /
-- `trusteeship_deed_no_truncate` (migration 6), which is what closes the DELETE + re-INSERT route
-- that defeated the Shart guard in S2 (C-03). Both are asserted in §4.
--
-- ⚠ NO `WHEN` CLAUSE, for migration 16's reason: the one condition that matters belongs in the
-- function body, where a reviewer reading the function can see it and a later
-- `CREATE OR REPLACE FUNCTION` cannot silently lose it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_owner_rulings()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_owner_rulings$
BEGIN
  IF to_regclass('public."trusteeship_deed"') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: table "trusteeship_deed" does not exist, so a recorded appointment '
      'cannot be sealed. This migration must run AFTER the table it guards.';
  END IF;

  DROP TRIGGER IF EXISTS trusteeship_deed_no_update ON "trusteeship_deed";
  CREATE TRIGGER trusteeship_deed_no_update
    BEFORE UPDATE ON "trusteeship_deed"
    FOR EACH ROW EXECUTE FUNCTION qmulate_trusteeship_deed_immutable();

  -- `ENABLE ALWAYS` (tgenabled = 'A'), never plain ENABLE. A trigger at 'O' is skipped by any
  -- session that has run `SET session_replication_role = 'replica'` — one plain SET, not DDL, and
  -- the Sprint-1 finding that defeated gate G-1 outright.
  ALTER TABLE "trusteeship_deed" ENABLE ALWAYS TRIGGER trusteeship_deed_no_update;
END;
$qm_apply_owner_rulings$;

SELECT qmulate_apply_owner_rulings();


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — WHAT THIS FILE RELIES ON IS ASSERTED, NOT ASSUMED (ADR-0008 §2.4)
--
-- Every claim below is about ANOTHER file. A reliance that is not asserted is a reliance that
-- silently lapses, which is the failure this sprint has now paid for five times.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_owner_rulings_verify$
DECLARE
  trg text;
BEGIN
  -- 4.1 §1's tier 2b is dead code unless `waqf_shart_immutable` still fires on UPDATE and is still
  --     ENABLE ALWAYS. `CREATE OR REPLACE FUNCTION` cannot guarantee either — they belong to
  --     migrations 1/3/4, in other files.
  -- `tgtype` bit 4 (value 16) = UPDATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'waqf_shart_immutable' AND NOT tgisinternal AND (tgtype & 16) > 0
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: waqf_shart_immutable is missing or does not fire on UPDATE. Tier 2b '
      '(the memo-Q8 reserved-matter gate on waqf."deletedAt") lives in the body of '
      'qmulate_shart_guard(), so without that trigger the endowment can be soft-retired by the '
      'least-privileged role with no approval — which is exactly the state MEASURED before this '
      'migration.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'waqf_shart_immutable' AND NOT tgisinternal AND tgenabled <> 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: waqf_shart_immutable is not ENABLE ALWAYS. A guard at '
      'tgenabled = ''O'' is skipped by any session that has run '
      'SET session_replication_role = ''replica''.';
  END IF;

  -- 4.2 Tier 2b gates the SOFT retirement on the express premise that the HARD one is refused. If
  --     `waqf_no_delete` ever went away, gating `deletedAt` would be guarding the front door of a
  --     building with no back wall — and the message in §1 that names it would become false.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('waqf_no_delete', 'waqf_no_truncate') AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: waqf_no_delete / waqf_no_truncate are missing (migration 4). Tier 2b '
      'calls "deletedAt" the only legal retirement of an endowment on that premise.';
  END IF;

  -- 4.3 Both gated columns of tier 2 and 2b are verified through ONE implementation of the eight
  --     approval conditions. A missing overload would silently un-bind the artifact (C-14).
  IF to_regprocedure('qmulate_reserved_matter_defect(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: qmulate_reserved_matter_defect(text,text,text) is missing. Tier 2b '
      'calls it to decide whether an approval is APPROVED, maker <> checker, for THIS endowment AND '
      'for THIS artifact ("waqf:<id>:deletedAt").';
  END IF;

  -- 4.4 §2's own trigger: present, UPDATE-only, ENABLE ALWAYS.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trusteeship_deed_no_update' AND NOT tgisinternal
       AND (tgtype & 16) > 0 AND tgenabled = 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: trusteeship_deed_no_update is missing, does not fire on UPDATE, or is '
      'not ENABLE ALWAYS. Without it every FACT a recorded Nazir appointment carries is editable by '
      'the least-privileged role — MEASURED before this migration: primaryNazir, ksaResident, the '
      'authorized representative and jointlyLiable, and deletedAt, all COMMITTED as qmulate_app.';
  END IF;

  -- `tgtype` bit 2 (value 4) = INSERT, bit 3 (value 8) = DELETE. The INSERT half is deliberately
  -- absent (the initial recording is the nazir seat's), so an ARRIVING one means somebody decided
  -- the birth needs an authority — a decision, not a widening. It must not arrive silently.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trusteeship_deed_no_update' AND NOT tgisinternal
       AND ((tgtype & 4) > 0 OR (tgtype & 8) > 0)
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: trusteeship_deed_no_update fires on INSERT or DELETE. It is UPDATE-ONLY '
      'by design — the initial recording belongs to the nazir seat, and DELETE is already refused '
      'outright by trusteeship_deed_no_delete. Widening it here would refuse the ONLY path by which '
      'an appointment can ever be recorded.';
  END IF;

  -- 4.5 The DELETE + re-INSERT route, which is C-03 itself: it is what defeated the Shart guard in
  --     S2, and a write-once row is only write-once while it cannot be replaced wholesale.
  FOREACH trg IN ARRAY ARRAY['trusteeship_deed_no_delete', 'trusteeship_deed_no_truncate'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trg AND NOT tgisinternal) THEN
      RAISE EXCEPTION
        'QMULATE owner rulings: % is missing (migration 6). §2 makes a recorded appointment '
        'write-once on the express premise that the row cannot be DELETED and re-INSERTED — which '
        'is how C-03 substituted a founder''s Shart al-Waqif with audit_event 131 -> 131.', trg;
    END IF;
  END LOOP;

  -- 4.6 The row's NAME stays governed by AV4-01's guard. §2 subsumes it, and §2's header explains
  --     why it is kept rather than dropped: it fires FIRST (triggers fire in name order) and its
  --     message is the specific one.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trusteeship_deed_id_immutable' AND NOT tgisinternal AND (tgtype & 16) > 0
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: trusteeship_deed_id_immutable is missing (migration 16, AV4-01). This '
      'migration EXTENDS that identity-guard family rather than duplicating it — that guard owns the '
      'row''s NAME and its precise message, this one owns the row''s CONTENT.';
  END IF;

  -- 4.7 The ONE excluded column exists under exactly that name. If `updatedAt` were ever renamed or
  --     dropped, §2's `WHERE n.key <> 'updatedAt'` would silently stop excluding anything (harmless,
  --     it would only refuse more) — but the fixture seed's identical re-statement would then be
  --     REFUSED, and the suite would be green on a fresh database and red on a used one. That is the
  --     V-E3-04 class, so the reliance is asserted.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'trusteeship_deed' AND column_name = 'updatedAt'
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: trusteeship_deed has no "updatedAt" column. §2 excludes exactly that '
      'one bookkeeping stamp from the seal so an identical re-statement (the fixture seed''s upsert) '
      'is not read as an edit.';
  END IF;

  -- 4.8 The UNIQUE-ness that makes §2's named remedy unreachable. It is asserted so the refusal's own
  --     honesty clause cannot rot: if a later migration DROPS it (i.e. supersession becomes
  --     possible), whoever did that must come back here and rewrite that clause.
  --
  -- ⚠ READ FROM `pg_index`, NOT `pg_constraint`, AND THE FIRST VERSION OF THIS ASSERTION WAS WRONG.
  -- It looked for `contype = 'u'` and FAILED THE MIGRATION on a correct database, because Prisma
  -- expresses a scalar `@unique` as a bare UNIQUE INDEX (`trusteeship_deed_waqfId_key`) and stores no
  -- `pg_constraint` row for it. Recorded rather than quietly corrected: the assertion did its job in
  -- the wrong direction — it refused to let the migration ship on a premise it could not verify.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
     WHERE c.relname = 'trusteeship_deed'
       AND i.indisunique
       AND i.indnatts = 1
       AND a.attname = 'waqfId'
  ) THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: trusteeship_deed has no single-column UNIQUE index on "waqfId" any '
      'more (Prisma spells it trusteeship_deed_waqfId_key). §2''s '
      'refusal message states, as a fact about this schema, that a superseding deed row is '
      'structurally impossible because one endowment holds exactly one deed. If that has changed, '
      'the remedy may now be reachable — rewrite that clause instead of leaving a false statement in '
      'shipped source (ADR-0008 §2.4).';
  END IF;
END
$qm_owner_rulings_verify$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — GRANTS FOR THE RUNTIME ROLE
--
-- None to write. This file creates no TABLE, no TYPE and no column, and trigger functions need no
-- EXECUTE grant — Postgres invokes those through the trigger, never through the caller's privileges.
--
-- ⚠ ONE THING STATED AS MEASURED RATHER THAN AS INTENT, BECAUSE THE OBVIOUS SENTENCE WOULD BE FALSE.
-- The natural comment here — and the one migration 16 §4 makes — is that the `apply` helper "is
-- deliberately NOT granted to the runtime role". IT IS GRANTED: §6's reusable sweep grants EXECUTE to
-- the three named roles on every function in the schema, and MEASURED afterwards
-- `qmulate_apply_owner_rulings()` carries `qmulate_app=X/qmulate_owner`. What actually stops the app
-- role is OWNERSHIP, not the function ACL — MEASURED as `qmulate_app`:
--     SELECT qmulate_apply_owner_rulings();   →  42501  must be owner of relation trusteeship_deed
-- …because the body issues DDL. The posture is the intended one; the reason is different from the one
-- a reader would assume, and an unmeasured reason is how a false comment ships (ADR-0008 §2.4).
-- Also MEASURED on a fresh database after this migration: ZERO functions in schema `public` are
-- PUBLIC-executable, and both functions this file creates carry an explicit ACL — i.e. §6 did its job.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- ⚠ MANDATORY IN EVERY MIGRATION THAT ADDS A FUNCTION, AND A **REPLACED** BODY IS NOT EXEMPT.
-- Migration 10 §2.4's `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` was
-- FALSE FROM THE DAY IT SHIPPED — measured on PostgreSQL 17.10: with no explicit `pg_default_acl`
-- row present the REVOKE stores nothing, and the BUILT-IN default for FUNCTIONS grants EXECUTE to
-- PUBLIC. Migration 12 shipped FIVE PUBLIC-executable functions by forgetting exactly this call.
-- `CREATE OR REPLACE FUNCTION` preserves an existing `proacl`, but on a fresh `--reset` (which is
-- what CI runs) it is a CREATE, and a CREATE takes the PUBLIC default.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_owner_rulings_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE owner rulings: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function — ALTER DEFAULT PRIVILEGES does not protect future '
      'functions on this Postgres (measured, 17.10). Without it this migration would leave a '
      'PUBLIC-executable function behind and assertion 1f would fail.';
  END IF;
END
$qm_owner_rulings_sweep$;

SELECT qmulate_revoke_public_function_execute();
