-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E3 CLOSE-OUT, ROUND 2: THE مآل CAPTURE BECOMES ATOMIC AND DATED, AND AN ASSET CAN
--                                  NO LONGER BE BORN — OR QUIETLY MOVED, OR QUIETLY RETIRED —
--                                  OUT OF ITS ENDOWMENT.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     A GUARD THAT SEALS A COLUMN MUST ALSO GUARANTEE THE COLUMN WAS WRITTEN COMPLETELY BEFORE
--     IT SEALED, AND A GUARD OVER A VALUE-TRANSITION IS NOT A GUARD UNTIL IT ALSO OWNS THE BIRTH.
--
-- ── WHAT THIS MIGRATION LANDS, AND THE MEASUREMENT THAT JUSTIFIES EACH ────────────────────────
--
--   1.  AV-1 / V2 (HIGH, fail-OPEN on Binding rule 1) · THE مآل HALF-WRITE FORECLOSED A FOUNDER'S
--       CONDITION. Migration 12 sealed the whole مآل group the instant `reversionClauseCaptured`
--       became true, which is right. Nothing paired the FLAG with the ANSWER, so the flag could be
--       flipped ALONE — and the seal then closed over a row that had recorded nothing.
--
--       MEASURED BEFORE, as the LEAST-privileged runtime role `qmulate_app`, on a pristine
--       `--reset` → `migrate deploy` → `db:seed` database, each probe inside a rolled-back
--       transaction, on the intake endowment waqf-005 (`reversionClauseCaptured = false`):
--
--         COMMITS   UPDATE "waqf" SET "reversionClauseCaptured" = true WHERE "id" = 'waqf-005'
--                   -> {"reversionClauseCaptured": true, "reversionKind": null}
--         REFUSED   the follow-up that records the actual kind, in a second statement
--                   SQLSTATE 42501 … 'deed term "reversionKind" … is SEALED (NULL ->
--                   CHARITABLE_ULTIMATE_TAKER refused) … NULL is that recorded answer — the deed
--                   names NO ultimate taker'
--
--       So a save of *"I have read this deed"* that landed before *"and here is what it says"*
--       PERMANENTLY recorded that the founder named no ultimate taker, and only a superseding
--       instrument could undo it. The guard was fail-OPEN in the one direction that matters: it
--       manufactured a founder's condition out of an incomplete save.
--
--       ⚠ THE FIX MUST NOT OPEN THE OTHER DIRECTION. The seal itself is CORRECT and stays exactly
--       as strong: after a legitimate capture every later change is still refused, NULL included.
--       What changes is that the capture can no longer be legitimate while incomplete.
--
--   2.  AV-6 · THE SEAL'S MESSAGE LIED ON HALF THE ROWS IT REFUSED. It hard-coded *"and NULL is
--       that recorded answer — the deed names NO ultimate taker"* and printed that sentence even
--       on a deed that DOES name one.
--
--         MEASURED BEFORE, waqf-005 captured atomically WITH `reversionKind =
--         CHARITABLE_ULTIMATE_TAKER`, then a later edit attempted:
--           REFUSED  42501 … 'deed term "reversionRecordedAtHijri" … is SEALED (1448-01-01 ->
--                    1449-01-01 refused) … and NULL is that recorded answer — the deed names NO
--                    ultimate taker'                          ← the row's kind was NOT null
--
--       A refusal a Nazir cannot trust is a refusal a Nazir will route around. §2a now reads the
--       row and says which of the two recorded answers it is refusing to change.
--
--   3.  V1 / AV-5 (HIGH, the C-10 shape one table over) · AN ASSET COULD BE BORN IN A RESERVED
--       STATE. `asset_identity_guard` was `BEFORE UPDATE` only.
--
--         COMMITS   INSERT INTO "asset" (… "status") VALUES (…, 'EXPROPRIATED')
--         COMMITS   INSERT INTO "asset" (… "status") VALUES (…, 'SUBSTITUTED_ISTIBDAL')
--         REFUSED   UPDATE "asset" SET "status" = 'EXPROPRIATED' WHERE "id" = 'asset-001'
--                   SQLSTATE 42501 … 'is a RESERVED MATTER (BR-306)'
--
--       The identical act, refused as a transition and committed as a birth — which is C-10
--       verbatim (a distribution BORN `EXECUTED` naming an approval that did not exist).
--
--   4.  AV-4 · TWO ROUTES BY WHICH CORPUS LEFT AN ENDOWMENT UNGATED, both measured as `qmulate_app`
--       with no approval in session, both COMMITTED:
--
--         COMMITS   UPDATE "asset" SET "waqfId" = 'waqf-002' WHERE "id" = 'asset-001'
--         COMMITS   UPDATE "asset" SET "deletedAt" = now()  WHERE "id" = 'asset-001'
--
--       The first moves a parcel between two DIFFERENT founders' endowments — one endowment's
--       corpus becomes another's, in one statement, with no approval and no `Expropriation` row.
--       The second retires a corpus parcel from every list a Nazir reads.
--
-- ── WHAT THIS FILE DELIBERATELY DOES *NOT* DO ────────────────────────────────────────────────
--
--   ·  IT DOES NOT DECIDE WHETHER A SOFT-RETIREMENT IS ALWAYS A RESERVED MATTER. §2b gates it as
--      one, which is the FAIL-SAFE direction (it refuses a route; it disposes of nothing), and
--      carries a TODO(surface). Whether every retirement of a corpus parcel is reserved — or only
--      those that are disposals in substance — is the product owner's call, not engineering's.
--
--   ·  IT DOES NOT INVENT A READING DATE FOR ANY ROW IT CANNOT ACCOUNT FOR. §0c backfills the FOUR
--      seeded fixture endowments by id, with the fixture's own invented date, and RAISES on any
--      other captured-but-undated row rather than fabricating the date on which somebody read a
--      real deed. That is migration 13 §0b's discipline applied to a different column.
--
--   ·  IT DOES NOT WIDEN `waqf_shart_immutable` TO INSERT. The waqf INSERT half of the same
--      question is answered by CHECK `waqf_reversion_recorded_at_pairs_with_capture` (§0d), which
--      covers every verb by construction. A trigger would be a second implementation of one fact.
--
-- ⚠ CONSEQUENCE THIS FILE CANNOT FIX FROM `packages/database`, AND MUST NOT HIDE:
-- `packages/api/src/routers/endowment.ts` (`recordDeedTerms`, the `(ii) THE FOUNDER'S CONDITION`
-- write) sets `reversionClauseCaptured: true` and supplies `reversionRecordedAt` /
-- `reversionRecordedAtHijri` ONLY when `input.reversion !== null`. That `reversion: null` branch is
-- EXACTLY the half-write this migration now refuses, so after this change it will be rejected
-- (42501 from §2a). The fix is one line — move the two date fields out of the conditional spread and
-- write them unconditionally, since `recordedAt` is already computed in that scope. REPORTED to the
-- api stage, loudly, because "green against a superseded definition" is this repo's standing failure
-- mode (ADR-0008 §2.4).
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase and are
-- therefore DOUBLE-QUOTED everywhere — an unquoted identifier is folded to lower case by Postgres
-- and would silently not match.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP CONSTRAINT IF EXISTS`,
-- `qmulate_add_check()` (which probes `pg_constraint` first), a `WHERE` clause on the backfill that
-- matches nothing on a second run, and `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- The table-dependent DDL lives in `qmulate_apply_e3_closeout_round2()`. After any schema change
-- that recreates a guarded table, re-apply EVERY guard set, in order:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
--     SELECT qmulate_apply_e2_grant_admission();
--     SELECT qmulate_apply_e3_deed_terms();
--     SELECT qmulate_apply_e3_closeout();
--     SELECT qmulate_apply_e3_closeout_round2();
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — THE مآل CLAUSE'S COHERENCE, RESTATED: THE DATES PAIR WITH THE **CAPTURE**
--
-- ── THE THREE LEGITIMATE STATES, AFTER THIS FILE ────────────────────────────────────────────
--   captured = false, kind NULL, dates NULL              "nobody has read the deed's مآل clause"
--   captured = true,  kind NULL, dates SET               "read on this date; it names NO taker"
--   captured = true,  kind SET,  dates SET               "read on this date; here is the taker"
--
-- The state this section makes UNREPRESENTABLE — and it is the whole point — is
--   captured = true, dates NULL
-- i.e. a recorded READING with no date. Recording that a deed has been read is an ACT, performed by
-- somebody on a day, and an act with no date is an assertion with no provenance. Migration 12
-- paired the dates with the KIND, which left the flag free to move alone; that is AV-1.
--
-- ── WHY A CHECK RATHER THAN ONLY A TRIGGER ──────────────────────────────────────────────────
-- `waqf_shart_immutable` is `BEFORE UPDATE`, so a trigger arm alone would leave INSERT open — the
-- exact verb-gap shape §3's census exists to refuse. A CHECK holds on every verb, for every role,
-- including the table owner and including a session that has set
-- `session_replication_role = 'replica'`. The trigger arm in §2a is still added, because it fires
-- FIRST (a BEFORE ROW trigger precedes constraint evaluation) and gives a Nazir a sentence instead
-- of a SQLSTATE — but the CHECK is the load-bearing half.
--
-- ⚠ ORDER MATTERS AND IS DELIBERATE: DROP the superseded CHECK → BACKFILL → VERIFY → ADD. Adding
-- the constraint before the backfill would abort on the seeded rows; verifying after adding it
-- would be verifying nothing.
--
-- ⚠ THE WHOLE SECTION IS ONE `DO` BLOCK, AND THAT IS A SAFETY PROPERTY, NOT A STYLE CHOICE. It
-- disables `waqf_shart_immutable` for the duration of the backfill (the guard would otherwise
-- refuse its own repair — tier 3 seals `reversionRecordedAt` on exactly the rows that need it). A
-- `DO` block is a single statement: if anything inside it raises, the disable rolls back with
-- everything else, so there is no failure path that leaves the founder's-conditions guard off.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3r2_reversion_dates$
DECLARE
  -- ⚠ INVENTED, FIXTURE-ONLY, AND CLEARLY MARKED AS SUCH.
  --
  -- `data/fixtures/sample-waqf.json` records this as the date QMULATE read the مآل clause of the
  -- four endowments it transcribed at intake (`reversionClauseCapturedDate`). It is a FICTIONAL
  -- date about FICTIONAL deeds — every name, deed number and date in that file is invented — and it
  -- exists here so a database seeded before this migration reaches the same state a fresh seed
  -- does. The Hijri twin is the frozen Umm-al-Qura snapshot the seed computes for the same day
  -- (schema convention 2), transcribed rather than re-derived so the two cannot drift.
  fixture_read_at       CONSTANT timestamp(3) := '2025-04-20 00:00:00';
  fixture_read_at_hijri CONSTANT text          := '1446-10-22';
  -- The four endowments `sample-waqf.json` records as READ. waqf-005 is the INTAKE-STATE record
  -- (owner decision D-C) and is deliberately absent: nobody has read its clause, so it has no
  -- reading date and must not be given one.
  fixture_captured      CONSTANT text[]        := ARRAY['waqf-001','waqf-002','waqf-003','waqf-004'];
  backfilled            integer;
  orphans               text;
  violations            text;
BEGIN
  -- ── 0a. THE SUPERSEDED CHECK GOES FIRST ────────────────────────────────────────────────────
  -- `waqf_reversion_recorded_at_pairs_with_kind` says `(recordedAt IS NULL) = (kind IS NULL)`. It
  -- is not merely narrower than what replaces it — it CONTRADICTS it: the four backfilled rows
  -- carry a date with a NULL kind, which is precisely the state that constraint forbade. It is
  -- dropped rather than left standing beside its successor.
  ALTER TABLE "waqf" DROP CONSTRAINT IF EXISTS "waqf_reversion_recorded_at_pairs_with_kind";

  -- ── 0b. THE GUARD IS STOOD DOWN FOR THE REPAIR, AND ONLY FOR THE REPAIR ────────────────────
  -- Tier 3 of `qmulate_shart_guard()` seals `reversionRecordedAt` the moment
  -- `reversionClauseCaptured` is true — which is every row this backfill has to touch. The guard is
  -- therefore correct AND in the way, and the honest thing is to say so and re-arm it explicitly
  -- rather than to sneak the write past it. `ENABLE ALWAYS` is restored below, not plain `ENABLE`:
  -- a guard at `tgenabled = 'O'` is skipped by any session that has run
  -- `SET session_replication_role = 'replica'`, which is the single statement that defeated gate
  -- G-1 outright during Sprint-1 review.
  ALTER TABLE "waqf" DISABLE TRIGGER waqf_shart_immutable;

  -- ── 0c. THE BACKFILL, BY ID, WITH NO INVENTION ─────────────────────────────────────────────
  UPDATE "waqf"
     SET "reversionRecordedAt"      = fixture_read_at,
         "reversionRecordedAtHijri" = fixture_read_at_hijri
   WHERE "reversionClauseCaptured"
     AND "reversionRecordedAt" IS NULL
     AND "id" = ANY (fixture_captured);
  GET DIAGNOSTICS backfilled = ROW_COUNT;

  ALTER TABLE "waqf" ENABLE ALWAYS TRIGGER waqf_shart_immutable;

  IF backfilled > 0 THEN
    RAISE NOTICE
      'QMULATE E3 round 2: backfilled % seeded endowment(s) with the fixture reading date % (% AH). '
      'INVENTED, fixture-only — see data/fixtures/sample-waqf.json.',
      backfilled, fixture_read_at, fixture_read_at_hijri;
  END IF;

  -- ⚠ ANY OTHER CAPTURED-AND-UNDATED ROW ABORTS THIS MIGRATION, AND THE DIRECTION IS THE POINT.
  -- A row saying "somebody read this deed's مآل clause" with no date is a founder's condition with
  -- no provenance. This file cannot know WHEN a deed it has never seen was read, and inventing that
  -- date would put a fabricated fact behind an immutable record (Binding rule 1) — the same class
  -- of harm migration 13 §0b refuses when it will not coerce an unrecognised `asset.status` to
  -- ACTIVE. So the migration STOPS and names the rows.
  SELECT string_agg(format('%L', "id"), ', ' ORDER BY "id")
    INTO orphans
    FROM "waqf"
   WHERE "reversionClauseCaptured" AND "reversionRecordedAt" IS NULL;

  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2 REFUSES to backfill waqf row(s) %: each records "reversionClauseCaptured" '
      '= true with no "reversionRecordedAt", and this migration will not INVENT the date on which '
      'somebody read a deed it has never seen. Recording that a مآل clause was read is an act with a '
      'date, and a fabricated date behind an immutable founder''s condition is worse than none '
      '(Binding rule 1). Supply the real reading date and its frozen Umm-al-Qura twin for each row, '
      'then re-run. The four ids this file DOES know are the invented ones in '
      'data/fixtures/sample-waqf.json.',
      orphans;
  END IF;

  -- ── 0d. VERIFY, THEN CONSTRAIN ─────────────────────────────────────────────────────────────
  -- The predicate is evaluated against live data BEFORE `ALTER TABLE … ADD CONSTRAINT` evaluates
  -- it, so a violation is reported as the sentence below rather than as a bare 23514 naming a
  -- constraint that does not exist yet.
  SELECT string_agg(
           format('%L (captured=%s, at=%s, atHijri=%s)', "id", "reversionClauseCaptured",
                  coalesce("reversionRecordedAt"::text, 'NULL'),
                  coalesce("reversionRecordedAtHijri", 'NULL')),
           '; ' ORDER BY "id")
    INTO violations
    FROM "waqf"
   WHERE ("reversionRecordedAt" IS NOT NULL) <> "reversionClauseCaptured"
      OR ("reversionRecordedAt" IS NULL) <> ("reversionRecordedAtHijri" IS NULL)
      OR ("reversionKind" IS NOT NULL AND "reversionRecordedAt" IS NULL);

  IF violations IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2: the backfill left row(s) that the new مآل coherence CHECKs would refuse: '
      '%. The constraints are NOT added — a half-applied migration that leaves the invariant '
      'unenforced is worse than one that stops.',
      violations;
  END IF;

  -- THE RESTATED PAIRING. The dates belong to the READING, so they exist exactly when the reading
  -- is recorded. Both directions matter: `captured` without dates is AV-1's half-write, and dates
  -- without `captured` is a reading date for a reading nobody recorded.
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_reversion_recorded_at_pairs_with_capture',
    '("reversionRecordedAt" IS NOT NULL) = "reversionClauseCaptured"'
  );

  -- A NON-NULL KIND STILL REQUIRES THE DATES, SAID OUT LOUD.
  -- ⚠ It IS implied today — `waqf_reversion_kind_requires_capture` gives kind ⇒ captured, and the
  -- constraint above gives captured ⇒ dates. It is stated anyway because that is a reliance across
  -- TWO constraints, and an unasserted reliance is one this repo has already watched lapse
  -- (ADR-0008 §2.4). The named invariant survives either sibling being dropped.
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_reversion_kind_requires_recorded_at',
    '"reversionKind" IS NULL OR "reversionRecordedAt" IS NOT NULL'
  );

  -- `waqf_reversion_kind_requires_capture` and `waqf_reversion_recorded_dual_dated` are migration
  -- 12's and are UNCHANGED. They are re-`PERFORM`ed nowhere: this file does not restate what it did
  -- not alter, and §4 asserts they are still present instead.
END
$qm_e3r2_reversion_dates$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — GUARD FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 1a. THE CAPTURE IS ATOMIC AND DATED, AND THE SEAL TELLS THE TRUTH (AV-1, AV-6) ───────────
-- REPLACES migration 13 §2a's body. TIER 1, TIER 1b, the one-way flag rule and TIER 2 are carried
-- over VERBATIM — they were never the defect and rewriting them would risk one. THE TIER ORDER IS
-- STILL PART OF THE CONTRACT:
--
--   TIER 1   the four Shart columns           — refused UNCONDITIONALLY, before any GUC is read.
--   TIER 1b  entitlementOrder / type / nature — refused UNCONDITIONALLY.
--   TIER 3a  the capture flip                 — NEW. false -> true must carry its dual date.
--   TIER 3   the deed-term columns            — NULL -> value ONCE; value -> anything refused.
--   TIER 2   certificateNumber / deedNumber   — reserved-matter-only, verified AND artifact-bound.
--
-- `shart-immutability.integration.test.ts` asserts, against this function's own `prosrc`, that the
-- tier-1 raise precedes the first `current_setting` call. TIER 3a is inserted well above it and
-- reads no GUC, so that ordering still holds — and it must: no approval may reach a founder's
-- condition, and the completeness of a capture is part of that condition.
--
-- ── WHY THE FLIP AND NOT THE SEAL ────────────────────────────────────────────────────────────
-- The instinct on reading AV-1 is to loosen the seal so a forgotten kind can be added later. That
-- is the wrong direction and it would re-open V-E3-01 exactly: it is what lets *"this deed names no
-- مآل"* be rewritten into *"a charity takes the whole distributable"*. The seal is right. What was
-- wrong is that a row could ENTER the sealed state having recorded nothing, so the fix constrains
-- the ENTRY and leaves the seal untouched — after a legitimate capture, every later change is still
-- refused, NULL included.
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

  RETURN NEW;
END;
$qm_shart_guard$;


-- ── 1b. THE ASSET GUARD OWNS THE BIRTH, THE ENDOWMENT AND THE RETIREMENT (V1/AV-5, AV-4) ─────
-- REPLACES migration 13 §1's body. The `titleDeedNumber` half and the BR-306 status half are
-- carried over VERBATIM; three things are added.
--
-- ⚠ THE FUNCTION IS NOW `TG_OP`-AWARE AND THAT IS LOAD-BEARING. On INSERT there is no `OLD`, so
-- every `OLD."col"` reads NULL and every `IS DISTINCT FROM` comparison against it is TRUE. Widening
-- the trigger to `BEFORE INSERT OR UPDATE` WITHOUT this branch would demand a reserved-matter
-- approval for the `titleDeedNumber` of every asset ever created — a guard so wrong it would be
-- switched off within a week. The INSERT arm therefore returns early and asks exactly one question.
--
-- ── WHY MIGRATION 13'S "DO NOT GATE INSERT" REASONING NO LONGER HOLDS ────────────────────────
-- It argued that "an endowment brought onto the system whose parcel was expropriated in 1994 must be
-- RECORDABLE", and that is still true — the transcription route is unchanged and is BETTER: insert
-- the parcel in its ORDINARY state (the four occupancy values are ungated, as they were), then
-- record the disposal as the TRANSITION it historically was, through the BR-306 gate that also
-- produces the audit event and the `Expropriation` row. What migration 13 actually shipped was not a
-- transcription affordance but C-10 one table over: the identical act refused as an UPDATE and
-- committed as an INSERT, which makes the whole gate optional for anyone who can create a row.
CREATE OR REPLACE FUNCTION qmulate_asset_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_asset_identity$
DECLARE
  approval text := current_setting('qmulate.reserved_matter_approval_id', true);
  defect   text;

  -- ── THE TWO HALVES OF THE CLOSED TYPE ──────────────────────────────────────────────────────
  -- RESERVED: the two acts by which corpus leaves an endowment (D-A). Both need an APPROVED,
  -- maker <> checker, artifact-bound RESERVED_MATTER approval before the state changes (BR-306).
  reserved_statuses "AssetStatus"[] := ARRAY[
    'EXPROPRIATED', 'SUBSTITUTED_ISTIBDAL'
  ]::"AssetStatus"[];
  -- ORDINARY: the four occupancy states. A move between them is property management, not a
  -- reserved matter, and gating them would make routine leasing need the Nazir's approval.
  ordinary_statuses "AssetStatus"[] := ARRAY[
    'ACTIVE', 'FULLY_RENTED', 'PARTIALLY_RENTED', 'VACANT'
  ]::"AssetStatus"[];
BEGIN
  -- ── (0) INSERT: AN ASSET MAY NOT BE **BORN** IN A RESERVED STATE (V1 / AV-5) ────────────────
  --
  -- MEASURED BEFORE, as `qmulate_app` with no approval in session, both COMMITTED:
  --   INSERT INTO "asset" (… "status") VALUES (…, 'EXPROPRIATED')
  --   INSERT INTO "asset" (… "status") VALUES (…, 'SUBSTITUTED_ISTIBDAL')
  -- …while the UPDATE into either was refused 42501. That is C-10's shape exactly (a distribution
  -- BORN `EXECUTED` naming an approval that did not exist), and a gate a caller can walk around by
  -- choosing INSERT is not a gate.
  IF TG_OP = 'INSERT' THEN
    -- ADR-0004 discipline, first, for the same reason as the UPDATE arm: an enum member this guard
    -- has not been taught to classify HALTS rather than falling through to "not a disposal".
    IF NOT (NEW."status" = ANY (reserved_statuses) OR NEW."status" = ANY (ordinary_statuses)) THEN
      RAISE EXCEPTION
        'asset %: "AssetStatus" value % is UNCLASSIFIED by qmulate_asset_identity_guard() — it is in '
        'neither the RESERVED set (EXPROPRIATED, SUBSTITUTED_ISTIBDAL) nor the ORDINARY set (ACTIVE, '
        'FULLY_RENTED, PARTIALLY_RENTED, VACANT). The guard REFUSES rather than assuming the value is '
        'harmless: an unrecognised status must halt, never fall through to "not disposable" '
        '(ADR-0004). Whoever added the enum member must classify it in this function.',
        NEW."id", NEW."status"
        USING ERRCODE = '42501';
    END IF;

    IF NEW."status" = ANY (reserved_statuses) THEN
      defect := qmulate_reserved_matter_defect(
        approval, NEW."waqfId", 'asset:' || NEW."id" || ':status'
      );
      IF defect IS NOT NULL THEN
        RAISE EXCEPTION
          'asset %: an asset may not be CREATED already in status % — that is the same disposal '
          'BR-306 gates on the way in, and refusing it only as a transition would make the gate '
          'optional for anyone who can INSERT a row (V1/AV-5, the C-10 shape). %. ⚠ TRANSCRIBING '
          'HISTORY IS STILL POSSIBLE AND IS THE INTENDED ROUTE: create the parcel in an ORDINARY '
          'status (ACTIVE, FULLY_RENTED, PARTIALLY_RENTED, VACANT — all ungated), then record the '
          'expropriation or istibdal as the TRANSITION it was, through withReservedMatter(), which '
          'also produces the audit event and lets an Expropriation row name the taking. The subject '
          'an approval must name is "asset:%:status". ⚠ Proceeds of either act are CORPUS (aṣl): any '
          'proceeds must be entered as receiptClass = CAPITAL, which the distribution waterfall '
          'excludes by construction (Binding rule 1).',
          NEW."id", NEW."status", defect, NEW."id"
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Nothing else on INSERT. `titleDeedNumber`, `waqfId` and `deletedAt` are all questions about a
    -- CHANGE to an existing parcel; on a birth there is nothing to compare them against, and the
    -- create itself is governed by `DOMAIN_WRITE_POLICIES` and `packages/api`'s procedure ladder.
    RETURN NEW;
  END IF;

  -- ═════════════════════════════════ UPDATE FROM HERE ═════════════════════════════════════════

  -- ── (1) THE CORPUS ASSET'S LEGAL IDENTITY — unchanged from migration 5 / 12 / 13 ────────────
  IF NEW."titleDeedNumber" IS DISTINCT FROM OLD."titleDeedNumber" THEN
    defect := qmulate_reserved_matter_defect(
      approval, OLD."waqfId", 'asset:' || OLD."id" || ':titleDeedNumber'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'asset %: "titleDeedNumber" (% -> %) is reserved-matter-only. It is the corpus asset''s legal '
        'identity — re-pointing it silently substitutes which parcel the endowment is proved to own '
        '(Binding rule 1, D-5). %. Go through withReservedMatter(); the subject an approval must name '
        'is "asset:%:titleDeedNumber".',
        OLD."id", OLD."titleDeedNumber", NEW."titleDeedNumber", defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── (1b) WHICH ENDOWMENT OWNS THE PARCEL IS NOT EDITABLE — AT ALL (AV-4) ────────────────────
  --
  -- MEASURED BEFORE, as `qmulate_app` with no approval in session:
  --   COMMITS  UPDATE "asset" SET "waqfId" = 'waqf-002' WHERE "id" = 'asset-001'
  --
  -- One statement moved a parcel out of waqf-001's corpus and into waqf-002's. Both are endowments
  -- of DIFFERENT waqifs in the fixture, so that is one founder's corpus becoming another's, with no
  -- approval, no `Expropriation` row, and no trace on either endowment's asset register.
  --
  -- ⚠ REFUSED OUTRIGHT RATHER THAN GATED, AND THIS IS MECHANICAL — NOT A READING OF ANY DEED. An
  -- asset's endowment is part of its identity, in the same sense a beneficiary's endowment is: every
  -- composite foreign key in this schema (`beneficiary(waqfId, id)`, `waqf_reversion_taker`) exists
  -- to make "belongs to endowment X" structural rather than editable. There is also no ACT this
  -- would record: corpus leaves an endowment by expropriation or istibdal — each a reserved matter
  -- with its own row — and arrives at another by acquisition. A `waqfId` UPDATE is neither; it is the
  -- two acts performed with neither recorded. A genuine substitution is recorded as a disposal on one
  -- side and an acquisition on the other, each through its own gate.
  IF NEW."waqfId" IS DISTINCT FROM OLD."waqfId" THEN
    RAISE EXCEPTION
      'asset %: "waqfId" (% -> %) may NEVER be changed. Which endowment owns a corpus parcel is part '
      'of the parcel''s identity, not a row value, and re-pointing it moves corpus between two '
      'endowments — possibly two different waqifs — in one statement, with no reserved matter, no '
      'Expropriation row and no trace on either asset register (Binding rule 1: no operation may '
      'distribute, erode or reclassify corpus). No approval, GUC value or migration opens this. If a '
      'parcel genuinely left one endowment for another, that is a DISPOSAL on one side (expropriation '
      'or istibdal, each a reserved matter under BR-306) and an ACQUISITION on the other: record both '
      'acts. If the row was simply created against the wrong endowment, the answer is a new, correct '
      'row — this one is part of a >= 10-year retained record (NFR-07).',
      OLD."id", OLD."waqfId", NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;

  -- ── (1c) SOFT-RETIRING A CORPUS PARCEL IS A RESERVED MATTER (AV-4) ──────────────────────────
  --
  -- MEASURED BEFORE, as `qmulate_app` with no approval in session:
  --   COMMITS  UPDATE "asset" SET "deletedAt" = now() WHERE "id" = 'asset-001'
  --
  -- `asset_no_delete` (migration 6) refuses the HARD delete and names `deletedAt` as the legal
  -- retirement path — and that path had nothing on it. `scoping.ts` documents the same hole from the
  -- other side: "`deletedAt` is deliberately ungoverned, so a SOFT DELETE of a corpus asset … is
  -- still membership-only". In substance, retiring a parcel from every register a Nazir reads is a
  -- disposal: the corpus is gone from the endowment's own view of itself, whatever the row still
  -- says.
  --
  -- ⚠ TODO(surface) — SCOPE, ENGINEERING'S FAIL-SAFE READING, NOT THE OWNER'S RULING.
  -- Whether EVERY retirement of a corpus parcel is a reserved matter is the product owner's call. A
  -- parcel that was fully expropriated and no longer exists is arguably retired as bookkeeping once
  -- the expropriation itself has been approved; a parcel retired for any other reason is a disposal
  -- in all but name. Engineering cannot tell those apart from a Boolean, so the FAIL-SAFE direction
  -- is taken: gate both. It refuses a route; it disposes of nothing, and the approval it asks for is
  -- the same one the expropriation already needed.
  --
  -- ANY change is gated, including value -> NULL. An un-retirement restores a parcel to every
  -- register without the acquisition that would justify it, and re-dating a retirement rewrites when
  -- the endowment is recorded as having lost the parcel.
  IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN
    defect := qmulate_reserved_matter_defect(
      approval, OLD."waqfId", 'asset:' || OLD."id" || ':deletedAt'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'asset %: changing "deletedAt" (% -> %) is a RESERVED MATTER. `asset_no_delete` refuses the '
        'hard DELETE and names this column as the only legal retirement of a corpus parcel, so this '
        'is the disposal path in substance: a retired parcel leaves every register the Nazir, the '
        'classification bands and the Authority report read from, whatever the row still says. %. Go '
        'through withReservedMatter(); the subject an approval must name is "asset:%:deletedAt". '
        '⚠ TODO(surface): whether EVERY retirement is reserved — as opposed to only those that are '
        'disposals in substance — is the PRODUCT OWNER''S call, not engineering''s. This gate is the '
        'fail-safe reading and refuses a route rather than disposing of anything.',
        OLD."id", coalesce(OLD."deletedAt"::text, 'NULL'), coalesce(NEW."deletedAt"::text, 'NULL'),
        defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── (2) BR-306: A MOVE INTO A RESERVED STATE ───────────────────────────────────────────────
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN

    -- ⚠ ADR-0004 DISCIPLINE, AND IT IS THE FIRST BRANCH ON PURPOSE. A member of "AssetStatus" that
    -- this guard has not been taught to classify HALTS. It does NOT fall through to "not a
    -- disposal", which is how a seventh enum value added by a later migration would otherwise
    -- become an ungated disposal. If you add a member to "AssetStatus", you must add it to exactly
    -- one of the two arrays above, and this branch is what forces that.
    IF NOT (NEW."status" = ANY (reserved_statuses) OR NEW."status" = ANY (ordinary_statuses)) THEN
      RAISE EXCEPTION
        'asset %: "AssetStatus" value % is UNCLASSIFIED by qmulate_asset_identity_guard() — it is in '
        'neither the RESERVED set (EXPROPRIATED, SUBSTITUTED_ISTIBDAL) nor the ORDINARY set (ACTIVE, '
        'FULLY_RENTED, PARTIALLY_RENTED, VACANT). The guard REFUSES rather than assuming the value is '
        'harmless: an unrecognised status must halt, never fall through to "not disposable" '
        '(ADR-0004). Whoever added the enum member must classify it in this function.',
        OLD."id", NEW."status"
        USING ERRCODE = '42501';
    END IF;

    IF NEW."status" = ANY (reserved_statuses) THEN
      defect := qmulate_reserved_matter_defect(
        approval, OLD."waqfId", 'asset:' || OLD."id" || ':status'
      );
      IF defect IS NOT NULL THEN
        RAISE EXCEPTION
          'asset %: moving "status" from % to % is a RESERVED MATTER (BR-306) — an expropriation is a '
          'government taking of endowed land and an istibdal is the Nazir''s own substitution of a '
          'corpus asset; both require an approved reserved matter BEFORE the state changes. %. Go '
          'through withReservedMatter(); the subject an approval must name is "asset:%:status". '
          '⚠ Proceeds of either are CORPUS (aṣl): recording the act writes no receipt, and any '
          'proceeds must be entered as receiptClass = CAPITAL, which the distribution waterfall '
          'excludes by construction (Binding rule 1).',
          OLD."id", OLD."status", NEW."status", defect, OLD."id"
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- A move BACK OUT of a reserved state is deliberately NOT gated, unchanged from migrations
    -- 12/13: it disposes of nothing, and gating it would make a mis-keyed status permanently
    -- un-correctable. The ledger consequences of the act itself are E5's and are not undone by a
    -- status change.
  END IF;

  RETURN NEW;
END;
$qm_asset_identity$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — qmulate_apply_e3_closeout_round2()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e3_closeout_round2()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_e3r2$
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 2.1 `asset_identity_guard` IS WIDENED FROM `U` TO `IU`
  --
  -- The SAME trigger and the SAME function, not a second one beside it. Migration 12 §4.6's lesson
  -- is that a duplicate guard on an already-guarded verb breaks the scaffolding wrappers that
  -- suspend "the ONE guard per table" — INSERT is the verb `asset` had nothing on, and it is added
  -- to the trigger that already owns the column's meaning rather than to a sibling that would have
  -- to be kept in step with it forever.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS asset_identity_guard ON "asset";
  CREATE TRIGGER asset_identity_guard
    BEFORE INSERT OR UPDATE ON "asset"
    FOR EACH ROW EXECUTE FUNCTION qmulate_asset_identity_guard();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 2.2 ENABLE ALWAYS
  --
  -- A trigger created normally is `tgenabled = 'O'` and Postgres SKIPS it for a session that has run
  -- `SET LOCAL session_replication_role = 'replica'` — a plain SET, not DDL, which defeated gate G-1
  -- outright during Sprint-1 adversarial review. Re-creating the trigger above RESET its state, so
  -- this line is not decoration: without it the guard would come back weaker than it went in.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  ALTER TABLE "asset" ENABLE ALWAYS TRIGGER asset_identity_guard;
END;
$qm_apply_e3r2$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — APPLY
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
  c       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['waqf', 'asset']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2 ran BEFORE the tables it guards exist. Missing table(s): %.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_apply_e3_closeout()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2 ran BEFORE 00000000000013_e3_closeout, whose qmulate_shart_guard() and '
      'qmulate_asset_identity_guard() bodies this migration extends and whose "AssetStatus" enum '
      'both of them depend on.';
  END IF;

  PERFORM qmulate_apply_e3_closeout_round2();

  -- ── THE SIBLING CHECKS THIS FILE RELIES ON ARE ASSERTED, NOT ASSUMED ───────────────────────
  -- §0d states `waqf_reversion_kind_requires_recorded_at` explicitly rather than leaning on the
  -- chain kind ⇒ captured ⇒ dates, but the chain still carries the OTHER half (a kind on an unread
  -- deed) and the dual-date rule is migration 12's alone. A reliance that is not asserted is a
  -- reliance that silently lapses — ADR-0008 §2.4.
  FOREACH c IN ARRAY ARRAY[
    'waqf_reversion_kind_requires_capture',
    'waqf_reversion_recorded_dual_dated',
    'waqf_reversion_recorded_at_pairs_with_capture',
    'waqf_reversion_kind_requires_recorded_at'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = c AND conrelid = to_regclass('public."waqf"') AND contype = 'c'
    ) THEN
      RAISE EXCEPTION
        'QMULATE E3 round 2: CHECK "%" is missing from "waqf". The مآل clause''s three legitimate '
        'states are enforced by these four constraints together; without this one a fourth state '
        'becomes representable.', c;
    END IF;
  END LOOP;

  -- The superseded one must be GONE, not merely superseded on paper: it contradicts the backfill
  -- (a date with a NULL kind) and would refuse every legitimate "read, names none" recording.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waqf_reversion_recorded_at_pairs_with_kind'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2: CHECK "waqf_reversion_recorded_at_pairs_with_kind" is still installed. It '
      'pairs the recording DATES with the KIND, which is exactly the pairing AV-1 turned on, and it '
      'refuses the "read on this date, names no ultimate taker" state this migration makes '
      'recordable.';
  END IF;

  -- The two REPLACED bodies sit on triggers registered by earlier migrations. `CREATE OR REPLACE
  -- FUNCTION` does not touch a trigger's `tgenabled`, and §2.1 re-creates `asset_identity_guard`
  -- outright — so "should still be ENABLE ALWAYS" is exactly the kind of "should" this repo keeps
  -- being bitten by, and it is asserted rather than assumed.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('waqf_shart_immutable', 'asset_identity_guard')
       AND NOT tgisinternal
       AND tgenabled <> 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2: waqf_shart_immutable and/or asset_identity_guard is not ENABLE ALWAYS. A '
      'guard at tgenabled = ''O'' is skipped by any session that has run '
      'SET session_replication_role = ''replica''. ⚠ §0b DISABLES waqf_shart_immutable for the '
      'duration of the مآل backfill and re-arms it in the same DO block; if this fires, that re-arm '
      'did not happen.';
  END IF;

  -- And the INSERT arm itself, read from the live catalogue rather than from this file's intent.
  -- `tgtype` bit 2 (value 4) = INSERT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'asset_identity_guard' AND NOT tgisinternal AND (tgtype & 4) > 0
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2: asset_identity_guard does not fire on INSERT. An asset could still be '
      'BORN in a RESERVED status with no reserved-matter approval (V1/AV-5), which is the whole '
      'reason this migration exists.';
  END IF;
END
$qm_apply$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — GRANTS FOR THE RUNTIME ROLE
--
-- None. This file creates no TABLE, no TYPE and no column; it replaces two trigger-function bodies,
-- adds one apply function, drops one CHECK and adds two. Trigger functions need no EXECUTE grant —
-- Postgres invokes those through the trigger, never through the caller's privileges — and §5's
-- sweep grants EXECUTE on the SECURITY INVOKER apply function to the runtime roles anyway.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- ⚠ MANDATORY IN EVERY MIGRATION THAT ADDS A FUNCTION. Migration 10 §2.4 ran
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- and its claim that "the default for FUTURE functions is revoked too" WAS FALSE FROM THE DAY IT
-- SHIPPED — measured on PostgreSQL 17.10 as `qmulate_owner`: `ALTER DEFAULT PRIVILEGES … REVOKE`
-- only DELETES an explicit `pg_default_acl` row, and with no row present it stores nothing, which
-- leaves the BUILT-IN default — and the built-in default for FUNCTIONS grants EXECUTE to PUBLIC. All
-- five functions migration 12 created landed PUBLIC-executable on a fresh database because it
-- forgot this call, and `authorization-plane-privilege.integration.test.ts` assertion 1f caught it.
--
-- This file creates THREE — `qmulate_shart_guard()` and `qmulate_asset_identity_guard()` are
-- REPLACED bodies of existing ones, `qmulate_apply_e3_closeout_round2()` is new. ⚠ A REPLACED body
-- IS NOT EXEMPT: `CREATE OR REPLACE FUNCTION` preserves an existing `proacl`, but on a database
-- where the function is being created for the first time (a fresh `--reset`, which is what CI runs)
-- it is a CREATE, and a CREATE takes the PUBLIC default. The sweep is REUSABLE and idempotent by
-- design (migration 12 §6); hand-listing this file's functions would leave migration 15 in the same
-- trap.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3r2_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 2: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function — ALTER DEFAULT PRIVILEGES does not protect future '
      'functions on this Postgres (measured, 17.10). Without it this migration would leave '
      'PUBLIC-executable functions behind and assertion 1f would fail.';
  END IF;
END
$qm_e3r2_sweep$;

SELECT qmulate_revoke_public_function_execute();
