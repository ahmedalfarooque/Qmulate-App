-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — THE DEED'S OWN FACTS STAY SEALED; QMULATE'S ASSESSMENT **OF THE APPOINTEE** GETS A PATH.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── THE REGRESSION THIS FILE CLOSES (AV5-02, HIGH — created by migration 17) ──────────────────
--
-- Migration 17 §2 rendered the owner's Q10 ruling (*"the trusteeship deed can only be editted by a
-- court judge"*) as: no seat may UPDATE **any** column of a recorded `trusteeship_deed`. It compared
-- the WHOLE ROW minus `updatedAt`, on the stated ground that "there is no column here that is not
-- part of the appointment". That sentence was wrong about thirteen columns, and the cost is a
-- REGULATORY OBLIGATION THAT BECAME UNRECORDABLE.
--
-- MEASURED, through the real procedure (`appRouter.createCaller` → `deed.upsert`), on a `--reset` →
-- `migrate deploy` → `db:seed` database at migration 17 (cluster `deedav502`, port 54383), as
-- `user-nazir-001` (NAZIR, holds `endowment:deed:write` on all five endowments):
--
--     ── seeded deeds: the BR-109 eligibility VERIFICATION event ──
--      waqf-001 trust-waqf-001 verifiedAt=null verifiedAtHijri=null verifiedBy=null
--      waqf-002 trust-waqf-002 verifiedAt=null verifiedAtHijri=null verifiedBy=null
--      waqf-003 trust-waqf-003 verifiedAt=null verifiedAtHijri=null verifiedBy=null
--      waqf-004 trust-waqf-004 verifiedAt=null verifiedAtHijri=null verifiedBy=null
--      waqf-005 trust-waqf-005 verifiedAt=null verifiedAtHijri=null verifiedBy=null
--
--     ── deed.upsert, UPDATE branch: every deed FACT restated byte-for-byte, and the
--        representative's four BR-109 criteria supplied as the assessment being recorded ──
--       code    : INTERNAL_SERVER_ERROR
--       after   : eligibilityVerifiedAt = null
--
-- ⚠ AND THE CAUSE IS MEASURED, NOT INFERRED FROM THAT 500 — because the first repro's inner message
-- was `withAudit() was given a client it does not recognize`, which is a DUPLICATE MODULE INSTANCE in
-- a scratch harness and not this guard at all. Attributing the 500 to the seal on that evidence would
-- have been a false attribution of exactly the ADR-0008 §2.4 kind. Re-measured IN-HARNESS, with this
-- migration held aside and `packages/api/test/deed-eligibility-verification.integration.test.ts` run
-- against a migration-17 database (`--reset` → `migrate deploy` → `db:seed`): **2 failed | 8 passed
-- (10)**, and the failure under the UPDATE-branch test names the guard itself —
--
--     TRPCError: Invalid `prisma.trusteeshipDeed.update()` invocation … 42501
--     "trusteeship_deed …: a recorded Nazir appointment is WRITE-ONCE FOR EVERY SEAT —
--      column(s) authorityLicensed, eligibilit…"
--
-- …i.e. a 500 for a caller doing the one thing BR-109 requires.
--
-- `deed.upsert` is the ONLY procedure that writes `eligibilityVerifiedAt/AtHijri/By`. BR-109/NFR-09
-- says CAPTURE **AND VERIFY** — Islam, legal capacity, no disqualifying removal, KSA residency,
-- nationality where required, licensing for a legal person — and `TrusteeshipDeed`'s own schema
-- comment states the intake reality: *"Partial assessment is legal; intake learns these one at a
-- time."* Learning a criterion one at a time is an UPDATE. So migration 17 made an assessment
-- recordable only in the same statement that first creates the appointment, and never afterwards:
-- five appointments already exist with the verification unrecorded and no path to record it.
--
-- ── THE DISTINCTION THIS FILE DRAWS, AND ⚠ IT IS ENGINEERING'S READING OF THE OWNER'S SENTENCE ──
--
-- The owner's ruling is about the DEED: the appointment, the parties, the joint-and-several liability
-- position, the identity facts. An eligibility VERIFICATION is not deed content — it is QMULATE's own
-- assessment OF the appointee, recorded at a point in time, and it is QMULATE (as professional Nazir)
-- that owes it to the Authority, not the court that appointed anybody. Sealing it together with the
-- deed text makes a regulatory obligation unrecordable, which cannot be what the ruling intended.
--
-- ⚠ TODO(surface) — THE SPLIT BETWEEN "DEED FACT" AND "OUR ASSESSMENT OF THE APPOINTEE" IS
-- ENGINEERING'S, EXACTLY LIKE THE SUPERSEDE RENDERING IT SITS BESIDE, AND IT IS REPORTED FOR THE
-- OWNER TO CONFIRM OR OVERRULE. If he rules that the eligibility criteria are part of the appointment
-- too, the answer is NOT to re-seal them and leave BR-109 unrecordable — it is to give the
-- verification its own append-only row (option (b) below). Nothing here retires migration 17's flag
-- on the supersede rendering: that flag stands, and its refusal text is preserved word for word.
--
-- ── WHY THE SEAL IS NARROWED RATHER THAN A VERIFICATION TABLE ADDED (the choice, justified) ────
-- Two designs were on the table.
--   (a) NARROW THE SEAL so the assessment columns stay writable while every deed fact stays sealed.
--   (b) RECORD THE VERIFICATION AS ITS OWN APPEND-ONLY ROW referencing the deed, leaving the deed row
--       wholly sealed.
-- (b) is the cleaner end state and this file does not foreclose it. It is NOT what ships today, for
-- one reason that is about correctness rather than effort: the thirteen columns ALREADY EXIST ON THIS
-- ROW and `deed.get` resolves the live verdict from them. Adding a second home for the same facts
-- would leave the deed's own copy frozen at whatever INSERT captured, and every reader would then
-- have to know which of two places is authoritative — the "screen looks healthier than the mutation"
-- drift `packages/api/src/routers/deed.ts` is built to prevent (one resolver, no second copy). Doing
-- (b) properly means MOVING those columns, i.e. a data migration and a re-plumb of every reader, and
-- that is E4's work with the owner's answer in hand, not a HIGH-blocker fix authored under a seal.
--
-- ⚠ AND (a) HAS A COST, STATED RATHER THAN GLOSSED. Migration 17's own "MEASURED BEFORE" list
-- included `⚠ COMMITS SET "ksaResident" = false ← a BR-109/NFR-09 eligibility flag` as `qmulate_app`.
-- After this file, an assessment column IS writable by the least-privileged role again — but never
-- silently: §1 refuses ANY assessment change that does not arrive AS A RECORDED VERIFICATION EVENT
-- (all three stamp columns present, `eligibilityVerifiedAt` ADVANCED, never moved backwards). So the
-- flag cannot move without saying who verified it and when, which is BR-109's own sentence turned
-- into a database rule, and is strictly more than the app layer alone was giving it. What the app
-- layer contributes on top: `DOMAIN_WRITE_POLICIES.TrusteeshipDeed` gates these columns at
-- `endowment:deed:write` through the ORM, and `deed.upsert`'s UPDATE branch refuses on the pure
-- resolver's verdict BEFORE any write AND refuses any change to a deed FACT before it writes at all
-- (so the api's refusal, not a 500 from this trigger, is what a caller with a stale form sees).
--
-- ⚠ AND ON THAT ONE PATH THE API CHECK IS NOT BELT-AND-BRACES — IT IS THE ONLY GUARD, MEASURED. The
-- procedure's UPDATE sends the ASSESSMENT COLUMNS ALONE, so a rewritten `primaryNazir` never reaches
-- Postgres and this trigger has nothing to refuse. With that check neutralised the submission
-- COMMITTED: the deed facts were silently dropped and the verification stamp advanced as though the
-- whole thing had been accepted. This guard remains the backstop for every statement that DOES carry
-- a deed fact — raw SQL, any other ORM caller, a job, a migration — which is the case it exists for.
--
-- ── WHAT IS SEALED AND WHAT IS NOT (the classification, and it is EXPLICIT on purpose) ─────────
-- SEALED — every column of the row except the two sets below. Named the fail-shut way: the guard
-- computes the sealed set as "everything that is not on the allow-list", so A COLUMN ADDED BY A LATER
-- MIGRATION IS SEALED BY DEFAULT. That property is migration 17's and it is kept exactly.
--   · `id`, `waqfId` — identity (`trusteeship_deed_id_immutable`, AV4-01, answers `id` first);
--   · `primaryNazir`, `primaryAppointedDate`, `primaryAppointedDateHijri` — WHO holds the nazarah;
--   · `authorizedRepName/Scope/AppointedDate/AppointedDateHijri`, `jointlyLiable` — the delegate who
--     is JOINTLY AND SEVERALLY liable (Nazarah Art. 11(5) — ⚠ verify, may be stale, confirm vs
--     primary law), and the liability position itself;
--   · `successorNazir`; `createdAt`, `createdBy`; `deletedAt` (retiring an appointment is not an
--     assessment — it stays refused outright, and the memo did not ask about it).
-- BOOKKEEPING — `updatedAt` only, for migration 17's measured reason: Prisma rewrites it on every
--   update, and the fixture seed re-states all five deeds byte-for-byte on every run. An UPDATE that
--   changes nothing else is not an edit. Both directions stay pinned.
-- ASSESSMENT — the thirteen columns of `qmulate_trusteeship_deed_assessment_columns()`: the six
--   primary criteria, the representative's four, and the three-column verification event. They are
--   listed in ONE function so the api and the tests can READ the classification instead of restating
--   it — a second copy of this list is how a column quietly changes class.
--
-- ── WHAT THIS FILE DELIBERATELY DOES *NOT* DO ────────────────────────────────────────────────
--   ·  IT DOES NOT RE-OPEN THE DEED TO ORDINARY EDITS. Every sealed column is refused for every
--      seat — nazir, table owner, replica session, and a caller holding a genuine APPROVED
--      artifact-bound reserved-matter approval — with migration 17's message preserved verbatim,
--      including its two honesty clauses (the rendering is engineering's; the superseding-record
--      remedy is NOT REACHABLE because `waqfId` is UNIQUE).
--   ·  IT DOES NOT ADD THE SUPERSESSION MODEL. Still owed to E4, still stated in the refusal.
--   ·  IT DOES NOT ADD A TABLE, A COLUMN, A TYPE OR A CHECK. Two function bodies (one REPLACED, one
--      new), one `apply` function, one trigger re-asserted, one read-only verification block.
--   ·  IT DOES NOT TOUCH `trusteeship_deed`'s INSERT, DELETE or TRUNCATE posture. The initial
--      recording stays the `nazir` seat's; DELETE/TRUNCATE stay refused outright (migration 6), which
--      is what keeps a write-once row from being replaced wholesale (C-03).
--   ·  IT DOES NOT WEAKEN `trusteeship_deed_eligibility_verification_complete` (migration 12): that
--      CHECK still requires the three stamp columns to be all-present or all-absent, and §1's rule
--      is strictly on top of it.
--
-- ── WHAT QUALIFIES THE MEASUREMENTS ──────────────────────────────────────────────────────────
-- AV4-02 is OPEN BY DESIGN (ADR-0008's work, not this file's): `qmulate_app` can INSERT its own
-- APPROVED `RESERVED_MATTER` `approval_request` and spend it in the same transaction. §1's refusals
-- are NOT subject to it — they are unconditional, so there is no key to forge — and the one probe
-- that supplies a genuine approval proves exactly that.
--
-- ── WHY A TRIGGER AND NOT A CHECK ────────────────────────────────────────────────────────────
-- A `CHECK` sees ONE row image and can never compare `NEW` to `OLD`, so it cannot express "this value
-- may not CHANGE", and it cannot express "it may change only together with an advancing stamp".
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase and are
-- therefore DOUBLE-QUOTED everywhere — an unquoted identifier is folded to lower case by Postgres.
-- The trigger keeps the name `trusteeship_deed_no_update` and the function keeps
-- `qmulate_trusteeship_deed_immutable()`: the census (`guard-verb-coverage.integration.test.ts`),
-- migration 17 §4.4 and `primary-key-immutability` all name them, and a rename buys nothing. What the
-- names mean is unchanged — THE APPOINTMENT is immutable; an assessment of the appointee was never
-- part of the appointment.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
-- `CREATE TRIGGER`, and a read-only verification block.
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
--     SELECT qmulate_apply_owner_rulings();
--     SELECT qmulate_apply_deed_assessment_path();   -- ← THIS FILE
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — THE CLASSIFICATION, IN ONE PLACE, READABLE BY EVERY LAYER
--
-- ⚠ ONE LIST, NOT THREE. The guard needs it, `packages/api` needs it (its
-- `DEED_ELIGIBILITY_ASSESSMENT_COLUMNS` is asserted EQUAL to this function's output in
-- `deed-eligibility-verification.integration.test.ts`), and the test that proves the sealed
-- complement needs it. A hand-copied second list is how a column changes class without anyone
-- deciding that it should.
--
-- `IMMUTABLE` and `LANGUAGE sql`: a constant. It reads no table, so it is safe to call per row.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_trusteeship_deed_assessment_columns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $qm_deed_assessment_columns$
  -- The six BR-109/NFR-09 criteria about the PRIMARY Nazir…
  SELECT ARRAY[
    'islam',
    'legalCapacity',
    'noDisqualifyingRemoval',
    'ksaResident',
    'saudiNationalWhereRequired',
    'authorityLicensed',
    -- …the four about the AUTHORIZED REPRESENTATIVE (BR-109 says "Nazir AND
    -- authorized-representative"; migration 12 added these and ties them to a recorded rep with a
    -- ONE-DIRECTIONAL CHECK, so "recorded rep, criterion not yet assessed" stays representable)…
    'repIslam',
    'repLegalCapacity',
    'repNoDisqualifyingRemoval',
    'repKsaResident',
    -- …and the verification EVENT itself: when, in both calendars, and by whom. Flags with no
    -- verification event record a CLAIM, not a verification.
    'eligibilityVerifiedAt',
    'eligibilityVerifiedAtHijri',
    'eligibilityVerifiedBy'
  ]::text[];
$qm_deed_assessment_columns$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — qmulate_trusteeship_deed_immutable(), NOW COLUMN-CLASSIFIED
--
-- THREE ARMS, IN THIS ORDER, AND THE ORDER IS THE WHOLE DESIGN:
--
--   1. NOTHING BUT `updatedAt` MOVED → permitted. Migration 17's arm, unchanged and still
--      load-bearing: the fixture seed re-states all five deeds identically on every run, and a suite
--      green on a fresh database and red on a used one is the V-E3-04 class this sprint paid for four
--      times.
--   2. A **SEALED** COLUMN MOVED → refused, 42501, for every seat. Migration 17's message, verbatim,
--      because it is the owner's ruling and its two honesty clauses are pinned by tests. One clause
--      is APPENDED: that the assessment columns are not deed facts and have their own path, so a
--      caller who hits this refusal while trying to record a verification is told where to go.
--      ⚠ THE MESSAGE NAMES THE CHANGED COLUMNS AND NOTHING ELSE — never a value. This row carries a
--      named individual's name and the BR-109 criteria (religion, capacity, removal history,
--      residency); `packages/api`'s eligibility refusal throws with no name and no id for exactly
--      that reason, and a refusal naming COLUMNS is fully actionable while disclosing nothing.
--   3. ONLY **ASSESSMENT** COLUMNS MOVED → permitted IF AND ONLY IF the write arrives AS A RECORDED
--      VERIFICATION EVENT:
--        · all three stamp columns non-null — an assessment nobody signed is a claim (BR-109 says
--          capture AND VERIFY), and `eligibilityVerifiedBy` is the acting identity;
--        · `eligibilityVerifiedAt` DISTINCT from the stored one — so a flag can never move under a
--          stamp that still describes the previous assessment;
--        · and never EARLIER than the stored one — a re-verification is a later act; back-dating one
--          behind the assessment it replaces would make the record read as though the older
--          assessment were the current one.
--      Clearing a stamp back to NULL fails the first condition, which is deliberate: "un-verifying"
--      an appointment is not an act BR-109 contemplates, and it would erase an obligation's evidence.
--
-- ⚠ WHY ARM 2 BEFORE ARM 3. A statement that bundles a deed fact INTO a verification write must hear
-- the deed objection: the appointment is what may not change, and answering "your stamp is fine"
-- while silently accepting a rewritten `primaryNazir` is the failure this whole guard exists to
-- prevent. So the sealed set is computed first and, if non-empty, nothing else is considered.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_trusteeship_deed_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_deed_immutable$
DECLARE
  assessment text[] := qmulate_trusteeship_deed_assessment_columns();
  changed text[];
  sealed_changed text[];
  assessment_changed text[];
  -- ⚠ THE TWO CONDITIONS OF ARM 3 ARE NAMED BOOLEANS, NOT INLINE `IF` EXPRESSIONS, AND THAT IS FOR
  -- THE MUTATION TESTS. `e3-deed-term-guards.integration.test.ts` proves each arm is load-bearing by
  -- replacing ONE token of the LIVE function body with `IF false THEN` and re-running the same
  -- statement; a multi-line `IF a OR b OR c THEN` cannot be neutralised that way without leaving
  -- syntactically broken plpgsql, and a mutation that fails to compile proves nothing (R6-C1).
  event_recorded boolean;
  back_dated boolean;
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

  -- ── ARM 1 ──────────────────────────────────────────────────────────────────────────────────
  -- Nothing but the bookkeeping stamp moved: no fact about the appointment changed and no assessment
  -- was recorded, so there is nothing to refuse. This arm is what keeps the fixture seed's write
  -- count identical on every run, and it is asserted from both sides, not assumed.
  IF cardinality(changed) = 0 THEN
    RETURN NEW;
  END IF;

  -- THE SEALED SET IS THE COMPLEMENT OF THE ALLOW-LIST — fail-shut, so a column added by a later
  -- migration is sealed by default rather than arriving unguarded because nobody remembered this file
  -- (ADR-0004's discipline, applied to columns instead of enum members).
  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
    INTO sealed_changed
    FROM unnest(changed) AS c
   WHERE NOT (c = ANY (assessment));

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
    INTO assessment_changed
    FROM unnest(changed) AS c
   WHERE c = ANY (assessment);

  -- ── ARM 2 — A DEED FACT MOVED ──────────────────────────────────────────────────────────────
  IF cardinality(sealed_changed) > 0 THEN
    RAISE EXCEPTION
      'trusteeship_deed %: a recorded Nazir appointment is WRITE-ONCE FOR EVERY SEAT — column(s) % '
      'may not be edited. THE OWNER''S RULING (2026-08-17, S4 owner-decision memo Q10): "the '
      'trusteeship deed can only be editted by a court judge." A judge is not a system user, so NO '
      'seat may edit this record: not nazir, not the table owner, not a replica session, and not a '
      'caller holding a genuine reserved-matter approval — there is no key because there is no lock. '
      'THE REMEDY IS A NEW SUPERSEDING RECORD carrying the court instrument as evidence, never an edit '
      '(the same convention Binding rule 1 / ADR-0006 use for the Shart al-Waqif). The deed records '
      'WHO holds the nazarah, the jointly-and-severally-liable authorized representative (Nazarah '
      'Art. 11(5) — verify, may be stale, confirm vs primary law) and it is part of a >= 10-year '
      'retained record (NFR-07). Recording the appointment in the FIRST place is unaffected: INSERT '
      'is not guarded, and endowment:deed:write on the nazir seat is the path. ⚠ WHAT IS **NOT** '
      'SEALED, because it is not deed content: the BR-109/NFR-09 ELIGIBILITY ASSESSMENT columns '
      '(qmulate_trusteeship_deed_assessment_columns() — the ten criteria and the three-column '
      'verification event). An assessment OF the appointee is QMULATE''s own, recorded at a point in '
      'time, and it has a path: deed.upsert on an appointment that already exists writes those '
      'columns ONLY (every deed fact must arrive identical) and must carry the verification stamp. ⚠ THREE THINGS THIS REFUSAL IS HONEST ABOUT. '
      '(1) The rendering of "edited by a court judge" as "recorded as a superseding instrument" is '
      'ENGINEERING''S, flagged for the owner''s confirmation. (2) So is the line drawn between a DEED '
      'FACT and OUR ASSESSMENT of the appointee (migration 18) — also flagged, also his to overrule. '
      '(3) THAT REMEDY IS NOT YET REACHABLE IN THIS SCHEMA: "waqfId" is UNIQUE, so one endowment can '
      'hold exactly one deed row, and there is no supersession link and no column naming the court '
      'instrument. Until E4 adds them, a court-ordered change cannot be recorded at all — which is '
      'the fail-safe direction of the ruling and is deliberately loud rather than quietly worked '
      'around.',
      OLD."id", array_to_string(sealed_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  -- ── ARM 3 — ONLY ASSESSMENT COLUMNS MOVED ──────────────────────────────────────────────────
  -- A VERIFICATION EVENT is a date, its Hijri pair, an actor, AND a date that is NOT the one already
  -- stored. Clearing the stamp fails the first three conditions, which is deliberate.
  event_recorded := NEW."eligibilityVerifiedAt" IS NOT NULL
                AND NEW."eligibilityVerifiedAtHijri" IS NOT NULL
                AND NEW."eligibilityVerifiedBy" IS NOT NULL
                AND NEW."eligibilityVerifiedAt" IS DISTINCT FROM OLD."eligibilityVerifiedAt";

  -- A re-verification is a LATER act. `OLD IS NULL` (no verification yet) is not back-dating.
  back_dated := OLD."eligibilityVerifiedAt" IS NOT NULL
            AND NEW."eligibilityVerifiedAt" < OLD."eligibilityVerifiedAt";

  IF NOT event_recorded THEN
    RAISE EXCEPTION
      'trusteeship_deed %: the BR-109/NFR-09 eligibility assessment column(s) % may only change AS A '
      'RECORDED VERIFICATION EVENT. Supply "eligibilityVerifiedAt" (ADVANCED — a value distinct from '
      'the stored one), "eligibilityVerifiedAtHijri" and "eligibilityVerifiedBy" IN THE SAME '
      'STATEMENT. BR-109 says CAPTURE **AND VERIFY**: a criterion that moves with no event records a '
      'CLAIM about a person''s legal standing, not a verification, and an unattributed one cannot be '
      'shown to the Authority. Clearing the stamp back to NULL is refused by the same rule — '
      'un-verifying an appointment is not an act this obligation contemplates. THE PATH IS '
      'deed.upsert (endowment:deed:write) on an appointment that already exists: it refuses on the '
      'pure resolver''s verdict BEFORE any write, refuses any change to a deed FACT, and stamps the '
      -- ⚠ THE DEED-FACT ARM'S PINNED PHRASE IS DELIBERATELY *NOT* REPEATED IN THIS MESSAGE. Three
      -- suites match on it to say "this is the deed-fact refusal", so a copy of it here makes the two
      -- arms indistinguishable to every matcher — MEASURED: the first draft carried it and turned
      -- `e3-deed-term-guards`'s "an assessment is not deed content" assertion red.
      'event from the session. ⚠ THE DEED''S OWN FACTS ARE A DIFFERENT MATTER and are refused '
      'outright for every seat (memo Q10, migration 17); this path cannot touch them, and a statement '
      'that bundles one in hears that refusal instead of this one. The line drawn between them and '
      'this assessment is ENGINEERING''S reading of the owner''s ruling, flagged for his confirmation '
      '(migration 18).',
      OLD."id", array_to_string(assessment_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  IF back_dated THEN
    RAISE EXCEPTION
      'trusteeship_deed %: an eligibility verification may not be BACK-DATED behind the one it '
      'replaces (stored stamp is later than the supplied one). A re-verification is a later act; '
      'recording one as earlier would leave the trail reading as though the superseded assessment '
      'were the current one, on a >= 10-year retained record (NFR-07). Column(s) offered: %. If the '
      'stored stamp is wrong, that is a correction to a recorded verification and there is no path '
      'for it — say so rather than back-dating (E4).',
      OLD."id", array_to_string(assessment_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_deed_immutable$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — INSTALL  (qmulate_apply_deed_assessment_path)
--
-- The trigger already exists (migration 17) and `CREATE OR REPLACE FUNCTION` above is enough to
-- change its behaviour. It is re-created ANYWAY, for one reason that is not tidiness: `ENABLE ALWAYS`
-- is a property of the TRIGGER, not of the function, and a re-entry into this file after some other
-- change dropped or re-created the table must leave the guard at `tgenabled = 'A'`. Re-asserting is
-- idempotent; assuming is how a guard ends up at 'O' and is skipped by any session that has run
-- `SET session_replication_role = 'replica'` (the Sprint-1 finding that defeated gate G-1 outright).
--
-- ⚠ `BEFORE UPDATE` ONLY, ON PURPOSE, and identical to migration 17: INSERT is the initial recording
-- and stays with the `nazir` seat; DELETE and TRUNCATE are refused outright by
-- `trusteeship_deed_no_delete` / `trusteeship_deed_no_truncate` (migration 6), which is what closes
-- the DELETE + re-INSERT route that defeated the Shart guard in S2 (C-03). Both are asserted in §3.
--
-- ⚠ NO `WHEN` CLAUSE, for migration 16's reason: the conditions that matter belong in the function
-- body, where a reviewer reading the function can see them and a later `CREATE OR REPLACE FUNCTION`
-- cannot silently lose them.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_deed_assessment_path()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_deed_assessment_path$
BEGIN
  IF to_regclass('public."trusteeship_deed"') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: table "trusteeship_deed" does not exist, so an appointment '
      'cannot be sealed and an assessment cannot be given a path. This migration must run AFTER the '
      'table it guards.';
  END IF;

  DROP TRIGGER IF EXISTS trusteeship_deed_no_update ON "trusteeship_deed";
  CREATE TRIGGER trusteeship_deed_no_update
    BEFORE UPDATE ON "trusteeship_deed"
    FOR EACH ROW EXECUTE FUNCTION qmulate_trusteeship_deed_immutable();

  ALTER TABLE "trusteeship_deed" ENABLE ALWAYS TRIGGER trusteeship_deed_no_update;
END;
$qm_apply_deed_assessment_path$;

SELECT qmulate_apply_deed_assessment_path();


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — WHAT THIS FILE RELIES ON IS ASSERTED, NOT ASSUMED (ADR-0008 §2.4)
--
-- Every claim below is about ANOTHER file, or about a NAME this guard's behaviour turns on. A
-- reliance that is not asserted is a reliance that silently lapses.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_deed_assessment_verify$
DECLARE
  trg text;
  col text;
  missing text[];
BEGIN
  -- 3.1 EVERY NAME ON THE ALLOW-LIST IS A REAL COLUMN OF THIS TABLE. This is the assertion that
  --     matters most in the whole file: the classification is a set of STRINGS compared against
  --     `to_jsonb(NEW)` keys, so a typo or a later rename does not fail loudly — it silently moves a
  --     column into the SEALED class (BR-109 unrecordable again, i.e. AV5-02 restored) or, for the
  --     three stamp columns, breaks arm 3's own condition. Checked here, once, at migration time.
  SELECT coalesce(array_agg(c), ARRAY[]::text[])
    INTO missing
    FROM unnest(qmulate_trusteeship_deed_assessment_columns()) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trusteeship_deed' AND column_name = c
   );
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: qmulate_trusteeship_deed_assessment_columns() names column(s) '
      '% that do not exist on "trusteeship_deed". A name that matches nothing does not fail loudly at '
      'runtime — it silently SEALS the real column, which is exactly the AV5-02 regression this '
      'migration exists to close.', array_to_string(missing, ', ');
  END IF;

  -- 3.2 The list is the expected THIRTEEN, and it is spelled out here rather than counted, so that
  --     ADDING a column to the assessment class is a deliberate edit in two places instead of a
  --     one-line widening of a seal. Removing one is likewise loud.
  IF NOT (
    qmulate_trusteeship_deed_assessment_columns()::text[] @>
      ARRAY['islam','legalCapacity','noDisqualifyingRemoval','ksaResident',
            'saudiNationalWhereRequired','authorityLicensed','repIslam','repLegalCapacity',
            'repNoDisqualifyingRemoval','repKsaResident','eligibilityVerifiedAt',
            'eligibilityVerifiedAtHijri','eligibilityVerifiedBy']::text[]
    AND cardinality(qmulate_trusteeship_deed_assessment_columns()) = 13
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: the assessment classification is not the expected thirteen '
      'columns (six primary BR-109 criteria, four representative criteria, three verification-event '
      'columns). Whatever changed it also changed WHICH FACTS OF A RECORDED APPOINTMENT ARE '
      'EDITABLE — say so in the migration that does it.';
  END IF;

  -- 3.3 The columns that must NOT be on the list. Named individually because each one is a fact the
  --     owner's Q10 ruling is about, and an allow-list that quietly grew one of them would be this
  --     file re-opening the deed while claiming not to.
  FOREACH col IN ARRAY ARRAY['id', 'waqfId', 'primaryNazir', 'primaryAppointedDate',
                             'primaryAppointedDateHijri', 'authorizedRepName', 'authorizedRepScope',
                             'authorizedRepAppointedDate', 'authorizedRepAppointedDateHijri',
                             'jointlyLiable', 'successorNazir', 'createdBy', 'deletedAt'] LOOP
    IF col = ANY (qmulate_trusteeship_deed_assessment_columns()) THEN
      RAISE EXCEPTION
        'QMULATE deed assessment path: "%" is on the ASSESSMENT allow-list. It is a fact of the '
        'appointment (or its retirement), and the owner ruled that a recorded trusteeship deed is '
        'not editable by any system seat (memo Q10). The allow-list carries QMULATE''s ASSESSMENT OF '
        'THE APPOINTEE and nothing else.', col;
    END IF;
  END LOOP;

  -- 3.4 §1's own trigger: present, UPDATE-only, ENABLE ALWAYS. (Migration 17 §4.4's assertion, made
  --     again because §2 re-created the trigger and a re-creation that lost `ENABLE ALWAYS` would be
  --     a guard whose source reads correct and whose behaviour is not.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trusteeship_deed_no_update' AND NOT tgisinternal
       AND (tgtype & 16) > 0 AND tgenabled = 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: trusteeship_deed_no_update is missing, does not fire on UPDATE, '
      'or is not ENABLE ALWAYS. Without it every FACT a recorded Nazir appointment carries is '
      'editable by the least-privileged role — MEASURED before migration 17: primaryNazir, '
      'ksaResident, the authorized representative and jointlyLiable, and deletedAt, all COMMITTED as '
      'qmulate_app.';
  END IF;

  -- `tgtype` bit 2 (value 4) = INSERT, bit 3 (value 8) = DELETE. Both deliberately absent.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trusteeship_deed_no_update' AND NOT tgisinternal
       AND ((tgtype & 4) > 0 OR (tgtype & 8) > 0)
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: trusteeship_deed_no_update fires on INSERT or DELETE. It is '
      'UPDATE-ONLY by design — the initial recording belongs to the nazir seat, and DELETE is already '
      'refused outright by trusteeship_deed_no_delete.';
  END IF;

  -- 3.5 The DELETE + re-INSERT route (C-03): a write-once row is only write-once while it cannot be
  --     replaced wholesale, and arm 2's claim to seal the appointment rests on that.
  FOREACH trg IN ARRAY ARRAY['trusteeship_deed_no_delete', 'trusteeship_deed_no_truncate'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trg AND NOT tgisinternal) THEN
      RAISE EXCEPTION
        'QMULATE deed assessment path: % is missing (migration 6). Arm 2 makes the appointment '
        'write-once on the express premise that the row cannot be DELETED and re-INSERTED — which is '
        'how C-03 substituted a founder''s Shart al-Waqif with audit_event 131 -> 131.', trg;
    END IF;
  END LOOP;

  -- 3.6 The row's NAME stays governed by AV4-01's guard, which fires FIRST (triggers fire in name
  --     order) and answers a re-key with its own specific message.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trusteeship_deed_id_immutable' AND NOT tgisinternal AND (tgtype & 16) > 0
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: trusteeship_deed_id_immutable is missing (migration 16, '
      'AV4-01). This file EXTENDS that family — that guard owns the row''s NAME, arm 2 owns the '
      'appointment''s CONTENT.';
  END IF;

  -- 3.7 The ONE bookkeeping exclusion exists under exactly that name. If `updatedAt` were renamed or
  --     dropped, arm 1 would stop excluding anything and the fixture seed's identical re-statement
  --     would be REFUSED — green on a fresh database, red on a used one (the V-E3-04 class).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'trusteeship_deed' AND column_name = 'updatedAt'
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: trusteeship_deed has no "updatedAt" column. Arm 1 excludes '
      'exactly that one bookkeeping stamp so an identical re-statement (the fixture seed''s upsert) '
      'is not read as an edit.';
  END IF;

  -- 3.8 The UNIQUE-ness that makes arm 2's named remedy unreachable, asserted so the refusal's own
  --     honesty clause cannot rot into a false promise. Read from `pg_index`, not `pg_constraint`:
  --     Prisma expresses a scalar `@unique` as a bare UNIQUE INDEX and stores no `pg_constraint` row
  --     (migration 17 learned this by failing a correct database).
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
      'QMULATE deed assessment path: trusteeship_deed has no single-column UNIQUE index on "waqfId" '
      'any more. Arm 2''s refusal states, as a fact about this schema, that a superseding deed row is '
      'structurally impossible. If that has changed, the remedy may now be reachable — rewrite that '
      'clause instead of leaving a false statement in shipped source (ADR-0008 §2.4).';
  END IF;

  -- 3.9 Arm 3 sits strictly ON TOP of migration 12's all-or-none CHECK, and says so. If that CHECK
  --     went away, "all three stamp columns present" would be enforced only by arm 3's own condition
  --     on UPDATE and by nothing at all on INSERT — i.e. an appointment could be BORN with a
  --     verification date and no verifier.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'trusteeship_deed_eligibility_verification_complete'
       AND conrelid = 'public."trusteeship_deed"'::regclass
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: CHECK trusteeship_deed_eligibility_verification_complete is '
      'missing (migration 12 §4.4). Arm 3 requires the three stamp columns on UPDATE; that CHECK is '
      'what requires them to be all-present-or-all-absent on INSERT too.';
  END IF;

  -- 3.10 And the rep-flag CHECK, for the same reason: arm 3 permits a rep criterion to be recorded,
  --      and what keeps four flags from describing a representative who does not exist is migration
  --      12's one-directional CHECK — not this guard.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'trusteeship_deed_rep_eligibility_needs_a_rep'
       AND conrelid = 'public."trusteeship_deed"'::regclass
  ) THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: CHECK trusteeship_deed_rep_eligibility_needs_a_rep is missing '
      '(migration 12 §4.4). Arm 3 lets the four representative criteria be recorded on an existing '
      'appointment; that CHECK is what stops them describing nobody.';
  END IF;
END
$qm_deed_assessment_verify$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — GRANTS FOR THE RUNTIME ROLE
--
-- None to write, and the reason is the MEASURED one rather than the obvious one. This file creates no
-- TABLE, no TYPE and no column. `qmulate_trusteeship_deed_immutable()` is invoked by the trigger, not
-- through the caller's privileges, so it needs no EXECUTE grant;
-- `qmulate_trusteeship_deed_assessment_columns()` IS callable by the runtime role after §5's sweep
-- (which grants EXECUTE to the three named roles on every function in the schema) and that is
-- intended: the classification is not a secret, and `packages/api`'s test READS it to prove the api's
-- copy of the list agrees with the database's. What stops the app role from re-installing a guard is
-- OWNERSHIP, not the function ACL: `SELECT qmulate_apply_deed_assessment_path()` as `qmulate_app`
-- raises 42501 (`must be owner of relation trusteeship_deed`) because the body issues DDL.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- ⚠ MANDATORY IN EVERY MIGRATION THAT ADDS A FUNCTION, AND A **REPLACED** BODY IS NOT EXEMPT.
-- Migration 10 §2.4's `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` was FALSE
-- FROM THE DAY IT SHIPPED — measured on PostgreSQL 17.10: with no explicit `pg_default_acl` row the
-- REVOKE stores nothing, and the BUILT-IN default for FUNCTIONS grants EXECUTE to PUBLIC. Migration
-- 12 shipped FIVE PUBLIC-executable functions by forgetting exactly this call. `CREATE OR REPLACE
-- FUNCTION` preserves an existing `proacl`, but on a fresh `--reset` (which is what CI runs) it is a
-- CREATE, and a CREATE takes the PUBLIC default.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_deed_assessment_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE deed assessment path: qmulate_revoke_public_function_execute() is missing. It is '
      'defined by 00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of '
      'every migration that creates a function — ALTER DEFAULT PRIVILEGES does not protect future '
      'functions on this Postgres (measured, 17.10).';
  END IF;
END
$qm_deed_assessment_sweep$;

SELECT qmulate_revoke_public_function_execute();
