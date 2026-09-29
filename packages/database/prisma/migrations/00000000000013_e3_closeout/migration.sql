-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E3 CLOSE-OUT: A CLOSED ASSET VOCABULARY, THREE MORE SEALED FOUNDER'S CONDITIONS,
--                         AND THE مآل TAKER'S MISSING INSERT.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     A CONTROL THAT KEYS ON A SPELLING IS NOT A CONTROL, AND A COLUMN THE RECORD CALLS
--     UNCHANGEABLE IS NOT UNCHANGEABLE UNTIL THE DATABASE SAYS SO.
--
-- ── WHAT THIS MIGRATION LANDS, AND THE MEASUREMENT THAT JUSTIFIES EACH ────────────────────────
--
--   1.  D-A / V-E3-02 · `asset.status` becomes the CLOSED ENUM "AssetStatus", and
--       `qmulate_asset_identity_guard()` keys its BR-306 reserved set on that TYPE instead of on
--       an array of twelve Latin spellings.
--
--       MEASURED BEFORE, as the LEAST-privileged runtime role `qmulate_app`, on a pristine
--       `--reset` → `migrate deploy` → `db:seed` database, each probe inside a rolled-back
--       transaction:
--
--         COMMITS   UPDATE "asset" SET "status" = 'مستبدل'      WHERE "id" = 'asset-001'
--                   status "active" -> "مستبدل"   — no reserved-matter approval, no refusal
--         REFUSED   UPDATE "asset" SET "status" = 'substituted' WHERE "id" = 'asset-001'
--                   SQLSTATE 42501 … 'moving "status" to substituted is a RESERVED MATTER (BR-306)'
--
--       The same row, the same role, the same absent approval, the same act — refused in Latin and
--       committed in Arabic. ⚠ ARABIC IS THE AUTHORITATIVE LANGUAGE OF THIS PRODUCT (NFR-01), so
--       the spelling the guard could not see is the spelling a Saudi operator is most likely to
--       type. Two more spellings of the SAME acts also committed: 'SUBSTITUTED_ISTIBDAL' and
--       'EXPROPRIATED' (they normalise to `substituted_istibdal` / `expropriated`, neither of which
--       is on the list).
--
--       ⚠ THE FIX IS NOT A LONGER LIST. A longer list of spellings has the identical defect — it
--       is defeated by the thirteenth spelling instead of the first. The vocabulary is CLOSED, so
--       that the value the guard cannot classify is a value the DATABASE CANNOT STORE.
--
--   2.  D-B / V-E3-M6 · `waqf.entitlementOrder`, `waqf.type` and `waqf.nature` join
--       `continuationStipulation` in `qmulate_shart_guard()` — SEALED OUTRIGHT, not write-once.
--
--       MEASURED BEFORE, same connection, same rollback discipline:
--
--         COMMITS   UPDATE "waqf" SET "entitlementOrder" = 'LINEAGE_CONTINUATION',
--                                     "type"             = 'PUBLIC_CHARITABLE',
--                                     "nature"           = 'QIYAMI'  WHERE "id" = 'waqf-001'
--                   entitlementOrder ORDERED->LINEAGE_CONTINUATION,
--                   type FAMILY_DHURRI->PUBLIC_CHARITABLE, nature AYNI->QIYAMI
--         COMMITS   each of the three ALONE, as well
--         REFUSED   UPDATE "waqf" SET "shartAlWaqifVersion" = 99   (the tier-1 CONTROL)
--                   SQLSTATE 42501 … 'shart_al_waqif is immutable'
--
--       So a family endowment could be turned into a public-charitable one, and its entitlement
--       rule into a different rule, by an UPDATE — while the Shart JSON beside it was untouchable.
--
--   3.  V-E3-M2 · `waqf_reversion_taker` gains the INSERT integrity it never had. Its only trigger
--       was `BEFORE UPDATE OR DELETE`; INSERT is the RECORDING path and was unconstrained.
--
--       MEASURED BEFORE, as `qmulate_app`:
--
--         COMMITS   INSERT taker (waqf-001, ben-001) — waqf-001's deed records NO مآل
--                   ("reversionClauseCaptured" = true, "reversionKind" = NULL)
--         COMMITS   INSERT taker (waqf-001, ben-002) — ben-002 is FAMILY / SON / active,
--                   i.e. A LIVING DESCENDANT named as where the endowment goes when the family ends
--         REFUSED   INSERT taker (waqf-001, ben-004) — ben-004 belongs to waqf-002
--                   SQLSTATE 23503, constraint "waqf_reversion_taker_waqfId_beneficiaryId_fkey"
--
--       ⚠ THE THIRD PROBE IS WHY THIS FILE ADDS NO SAME-ENDOWMENT CHECK. Migration 12's COMPOSITE
--       foreign key already makes a cross-endowment taker structurally impossible, and it was
--       VERIFIED here rather than duplicated: a second implementation of one fact is how the two
--       sides come to disagree. §3 asserts the constraint EXISTS instead.
--
--   4.  The `AssetStatus` grants and the PUBLIC-execute sweep (§6). See §6 — migration 12 learned
--       that one the hard way and this file does not get to re-learn it.
--
-- ── WHAT THIS FILE DELIBERATELY DOES *NOT* DO ────────────────────────────────────────────────
--
--   ·  IT DOES NOT GATE `asset` INSERT. `asset_identity_guard` is `BEFORE UPDATE` and stays that
--      way. An endowment brought onto the system whose parcel was expropriated in 1994 must be
--      RECORDABLE — demanding a reserved-matter approval to transcribe a history would make that
--      history untranscribable, which is migration 12 tier 3's reasoning about deed terms applied
--      to the same shape of problem. What the database owns absolutely is the TRANSITION, and that
--      is what it gates. ⚠ NAMED RESIDUAL, not a claim that it is harmless: a caller who can INSERT
--      an `asset` can insert one already in a reserved state. `DOMAIN_WRITE_POLICIES` governs the
--      column at the application layer and `packages/api`'s procedure ladder governs the create.
--
--   ·  IT DOES NOT ASSERT THAT AN ULTIMATE TAKER IS A `CHARITABLE_JIHA`. Migration 12's header says
--      why and it still holds: `REVERSION_KIND_UNRECOGNISED` exists precisely because a deed may
--      revert to another waqf, to the Authority, or to the waqif's nearest relatives — none of which
--      is a charity. What §2c refuses is narrower and is keyed on the RECORDED KIND: on a
--      `CHARITABLE_ULTIMATE_TAKER` clause, a taker who is a DESCENDANT is refused. ⚠ That is
--      engineering's fail-safe reading, carried with a TODO(surface) — see §2c.
--
--   ·  IT DOES NOT RESOLVE WHETHER THE ASSET VOCABULARY'S ARABIC LABELS ARE CORRECT. There are no
--      Arabic labels in this file. The enum members are Latin identifiers; the ar/en rendering of a
--      status is UI copy, and ordinary property terms at that — but the product owner prefixed his
--      list "I'm thinking", so the vocabulary is his WORKING one and its labels are flagged for his
--      confirmation (decisions log, D-A).
--
-- ── WHAT BECOMES UNREPRESENTABLE, STATED RATHER THAN GLOSSED ─────────────────────────────────
-- `sold`, `sale`, `disposed`, `disposal`, `pledged`, `pledge`, `mortgaged`, `long_leased`,
-- `long_lease`, `istibdal`, `substitution`, `substituted` — every one of migration 12's twelve
-- spellings — can no longer be stored. That is STRICTER than today and it is the owner's decision
-- (D-A): corpus leaves a waqf by istibdal or by expropriation, not by sale, and waqf perpetuity is
-- what makes `sold` a state the model should never have been able to hold.
--
-- ⚠ CONSEQUENCE THIS FILE CANNOT FIX FROM `packages/database`, AND MUST NOT HIDE:
-- `packages/api/src/routers/reservedMatter.ts` maps four `AssetReservedAct`s onto four of those
-- now-unrepresentable spellings (`ACT_TO_ASSET_STATUS`), and `packages/api/test/reserved-matter-
-- surface.test.ts` compares them against MIGRATION 12's `reserved_acts` array READ AS TEXT — a path
-- that still resolves, so that test will keep passing while measuring a function body that no
-- longer exists. REPORTED to the api stage, loudly, because "green against a superseded definition"
-- is this repo's standing failure mode (ADR-0008 §2.4).
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase and are
-- therefore DOUBLE-QUOTED everywhere — an unquoted identifier is folded to lower case by Postgres
-- and would silently not match.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: `to_regtype` probe before `CREATE TYPE`, a column-type probe before the
-- `ALTER COLUMN … TYPE`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
-- `CREATE TRIGGER`, and a `pg_constraint` probe before every `ADD CONSTRAINT`.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- The table-dependent DDL lives in `qmulate_apply_e3_closeout()`. After any schema change that
-- recreates a guarded table, re-apply EVERY guard set, in order:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
--     SELECT qmulate_apply_e2_grant_admission();
--     SELECT qmulate_apply_e3_deed_terms();
--     SELECT qmulate_apply_e3_closeout();
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — THE CLOSED ASSET-STATUS VOCABULARY (D-A)
--
-- ── ENUM OR CHECK? THE JUSTIFICATION, BECAUSE THE BRIEF ASKS FOR ONE ─────────────────────────
-- A CHECK constraint would refuse the Arabic word too, so both close the measured hole. A NATIVE
-- ENUM is chosen, for four reasons that a CHECK does not give:
--
--   1.  The refusal happens at TYPE PARSE (22P02), before any constraint, any trigger and any
--       normalisation. There is nothing left for a spelling to slip past — `lower(btrim(replace(…)))`
--       disappears from the guard entirely, and with it the whole class of defect V-E3-02 is.
--   2.  It is EXHAUSTIBLE. §1's guard can partition the type into RESERVED and ORDINARY and RAISE on
--       a member in neither — so a seventh value added by a future migration HALTS instead of
--       quietly defaulting to "not a disposal". That is ADR-0004's refuse-don't-remap discipline
--       expressed in the strongest available form. A CHECK cannot be exhaustive over `text`.
--   3.  Prisma projects it as a TypeScript union, so `packages/api` and `apps/web` get a COMPILE
--       error for a bad status instead of a row. A `String` column with a CHECK gets neither.
--   4.  It is the house form. `WaqfType`, `EntitlementOrder`, `ContinuationStipulation`,
--       `LineageLink` and `ReversionKind` are all native enums; a closed vocabulary expressed as a
--       CHECK beside them would be a second way of saying one thing.
--
-- The cost, stated: adding a member is a migration. That is the point of "the vocabulary is CLOSED
-- to these" (D-A), not a side effect of it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3c_type$
BEGIN
  IF to_regtype('"AssetStatus"') IS NULL THEN
    -- ⚠ THE ORDER OF MEMBERS IS THE OWNER'S OWN ORDER (D-A), kept so the list is recognisable:
    -- "Active, Fully Occupied/Rented, partially rented, vacant, expropriated/substituted".
    --
    -- ⚠ AND `expropriated/substituted` IS SPLIT INTO TWO — ENGINEERING'S REFINEMENT, FLAGGED FOR
    -- OVERRULE (D-A records it as such). An expropriation is a government TAKING; an istibdal is
    -- the Nazir's OWN substitution, carrying a ≤10-business-day Authority notice (⚠ unverified —
    -- confirm vs primary law). The domain model has separated them since Sprint 1
    -- (`model Expropriation` vs `ReservedMatterKind.ASSET_SUBSTITUTION_ISTIBDAL`), and collapsing
    -- them here would make the two indistinguishable in the one column a Nazir reads.
    CREATE TYPE "AssetStatus" AS ENUM (
      'ACTIVE',
      'FULLY_RENTED',
      'PARTIALLY_RENTED',
      'VACANT',
      'EXPROPRIATED',
      'SUBSTITUTED_ISTIBDAL'
    );
  END IF;
END
$qm_e3c_type$;


-- ── 0b. THE CONVERSION, WITH AN EXPLICIT AND ARGUABLE BACKFILL ───────────────────────────────
--
-- ⚠ AN UNMAPPABLE VALUE ABORTS THIS MIGRATION. It is NOT coerced to `ACTIVE`, and the direction
-- matters: silently mapping an unrecognised status to ACTIVE would ERASE a disposal — a corpus
-- asset recorded as disposed would come back as an ordinary, distributable, in-service asset with
-- nobody notified. Refusing loudly and naming the offending values is the only fail-safe direction
-- (Binding rule 1's non-diminution invariant, applied to a data migration).
--
-- WHAT THE MAP CONTAINS AND WHY, MEASURED RATHER THAN ASSUMED:
--   ·  `data/fixtures/sample-waqf.json` carried NO `status` key on any of its six assets, so every
--      seeded row's value came from `mapAsset()`'s `status: 'active'` — verified by querying the
--      seeded database, which held exactly one distinct value: 'active'.
--   ·  'active' -> ACTIVE is therefore the only mapping the shipped data needs.
--   ·  The six canonical spellings map to themselves so this block is re-runnable and so a database
--      already converted by hand is not rejected.
--   ·  Nothing else is here. In particular the twelve reserved spellings are ABSENT ON PURPOSE: a
--      database holding `'sold'` is holding a state D-A makes unrepresentable, and what happens to
--      such a row is the PRODUCT OWNER'S call (is it an istibdal? an expropriation? an error?), not
--      a mapping this file is entitled to invent. The migration stops and says so.
DO $qm_e3c_convert$
DECLARE
  col_type text;
  unmapped text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO col_type
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public."asset"')
     AND a.attname  = 'status'
     AND NOT a.attisdropped;

  IF col_type IS NULL THEN
    RAISE EXCEPTION 'QMULATE E3 close-out: "asset"."status" does not exist.';
  END IF;

  IF col_type = '"AssetStatus"' OR col_type = 'AssetStatus' THEN
    RAISE NOTICE 'QMULATE E3 close-out: "asset"."status" is already "AssetStatus" — nothing to convert.';
    RETURN;
  END IF;

  SELECT string_agg(DISTINCT format('%L', "status"), ', ')
    INTO unmapped
    FROM "asset"
   WHERE lower(btrim(COALESCE("status", ''))) NOT IN (
           'active', 'fully_rented', 'partially_rented', 'vacant',
           'expropriated', 'substituted_istibdal'
         );

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out REFUSES to convert "asset"."status": % value(s) are outside the closed '
      'vocabulary the product owner set on 2026-08-16 (D-A: ACTIVE, FULLY_RENTED, PARTIALLY_RENTED, '
      'VACANT, EXPROPRIATED, SUBSTITUTED_ISTIBDAL). Coercing them to ACTIVE would ERASE whatever '
      'disposal or substitution they record, so this migration stops instead. Decide each row '
      'deliberately — an istibdal and an expropriation are different acts and a mis-keyed status is '
      'a third thing — then re-run.',
      unmapped;
  END IF;

  -- The DEFAULT has to go first: Postgres cannot cast an existing `text` default through the new
  -- type, and leaving it would fail the ALTER with a far less legible error.
  ALTER TABLE "asset" ALTER COLUMN "status" DROP DEFAULT;

  ALTER TABLE "asset"
    ALTER COLUMN "status" TYPE "AssetStatus"
    USING upper(btrim("status"))::"AssetStatus";

  -- ⚠ THE DEFAULT IS RESTORED, AND IT IS A DELIBERATE CHOICE RATHER THAN A CARRY-OVER.
  -- `ACTIVE` is the base state of an endowed asset and it is the value the column already
  -- defaulted to; keeping the default means `asset.create` contracts across packages this file does
  -- not own keep working unchanged. What matters is that NO RESERVED VALUE can ever be reached by a
  -- default: `EXPROPRIATED` and `SUBSTITUTED_ISTIBDAL` are reachable only by an explicit write, and
  -- only through §1's gate.
  ALTER TABLE "asset" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"AssetStatus";

  RAISE NOTICE
    'QMULATE E3 close-out: "asset"."status" converted text -> "AssetStatus" (D-A, V-E3-02). The '
    'Arabic spelling of a disposal is now unrepresentable, not merely ungated.';
END
$qm_e3c_convert$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — BR-306, RE-KEYED ON THE TYPE INSTEAD OF ON SPELLINGS
--
-- REPLACES migration 12 §2e's body, which itself replaced migration 5's. The `titleDeedNumber` half
-- is carried over VERBATIM — it was never the defect and rewriting it would risk one.
--
-- WHAT CHANGED, PRECISELY: the `reserved_acts text[]` array of twelve lower-cased Latin spellings
-- and the `lower(btrim(replace(…, ' ', '_')))` normalisation are GONE. There is nothing to normalise
-- and nothing to spell: `NEW."status"` is an `"AssetStatus"`, and every value the column can hold is
-- one of six.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

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
  -- ── (1) THE CORPUS ASSET'S LEGAL IDENTITY — unchanged from migration 5 / 12 ─────────────────
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

  -- ── (2) BR-306: A MOVE INTO A RESERVED STATE ───────────────────────────────────────────────
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN

    -- ⚠ ADR-0004 DISCIPLINE, AND IT IS THE FIRST BRANCH ON PURPOSE. A member of "AssetStatus" that
    -- this guard has not been taught to classify HALTS. It does NOT fall through to "not a
    -- disposal", which is how a seventh enum value added by a later migration would otherwise
    -- become an ungated disposal — the same shape as the twelve-spelling list this replaces, one
    -- layer up. If you add a member to "AssetStatus", you must add it to exactly one of the two
    -- arrays above, and this branch is what forces that.
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

    -- A move BACK OUT of a reserved state is deliberately NOT gated, unchanged from migration 12:
    -- it disposes of nothing, and gating it would make a mis-keyed status permanently
    -- un-correctable. The ledger consequences of the act itself are E5's and are not undone by a
    -- status change.
  END IF;

  RETURN NEW;
END;
$qm_asset_identity$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TRIGGER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 2a. THE SHART GUARD GAINS A SEALED GROUP: THE THREE DEED FACTS (D-B / V-E3-M6) ───────────
-- REPLACES migration 12 §2a's body. Everything else in it is carried over UNCHANGED and the TIER
-- ORDER IS STILL PART OF THE CONTRACT:
--
--   TIER 1   the four Shart columns          — refused UNCONDITIONALLY, before any GUC is read.
--   TIER 1b  entitlementOrder / type / nature — NEW. Refused UNCONDITIONALLY. See below.
--   TIER 3   the deed-term columns           — NULL -> value ONCE; value -> anything refused.
--   TIER 2   certificateNumber / deedNumber  — reserved-matter-only, verified AND artifact-bound.
--
-- `shart-immutability.integration.test.ts` asserts, against this function's own `prosrc`, that the
-- tier-1 raise precedes the first `current_setting` call. TIER 1b is inserted BETWEEN them and reads
-- no GUC, so that ordering still holds — and it must: an approval must never be able to reach a
-- founder's condition.
--
-- ── WHY "SEALED", NOT "WRITE-ONCE" ───────────────────────────────────────────────────────────
-- Tier 3's columns are nullable and were added empty, so `NULL -> value once` is a real state
-- machine there. These three are `NOT NULL` and every row already carries a value, so THERE IS NO
-- NULL STATE TO WRITE ONCE. "Write-once" applied to a column that can never be unwritten is just a
-- longer way of saying SEALED, and saying it the long way would leave a reader hunting for the
-- permitted first write. The message says so explicitly.
--
-- ── WHY THEY BELONG HERE AT ALL ──────────────────────────────────────────────────────────────
-- The product owner, asked directly on 2026-08-16 whether these should become write-once:
-- *"yes they are unchangable"*. They are founder's conditions in the same sense the Shart is —
-- `type` says whether the endowment is خيري or ذري, `entitlementOrder` says which rule decides who
-- is paid, `nature` says whether the corpus is عيني or قيمي — and migration 12 made the position
-- incoherent by sealing `continuationStipulation` in the column immediately beside them. A
-- correction is a SUPERSEDING INSTRUMENT recorded as a NEW record (ADR-0006), never an edit.
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
  --
  -- MEASURED BEFORE THIS BLOCK EXISTED, as `qmulate_app` on a pristine seed: all three committed,
  -- together and individually — `ORDERED -> LINEAGE_CONTINUATION`,
  -- `FAMILY_DHURRI -> PUBLIC_CHARITABLE`, `AYNI -> QIYAMI` — while `shartAlWaqifVersion` on the same
  -- row and role was refused 42501. The adversary reached the same three from a CASE_MANAGER seat.
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

  -- ── (3) THE DEED TERMS: WRITE-ONCE (NULL -> value ONCE, then sealed) ───────────────────────
  -- Unchanged from migration 12 §2a, including the V-E3-01 fix below.
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
      RAISE EXCEPTION
        'deed term "%" on waqf % is SEALED (% -> % refused): the مآل clause has already been read '
        'and recorded ("reversionClauseCaptured" is true), and NULL is that recorded answer — the '
        'deed names NO ultimate taker. Changing it now would convert the founder''s recorded '
        'condition into a charitable reversion by an edit, which no approval opens (Binding rule 1, '
        'ADR-0006). The answer is a SUPERSEDING INSTRUMENT recorded as a NEW record.',
        write_once_col, OLD."id", coalesce(old_value, 'NULL'), coalesce(new_value, 'NULL')
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


-- ── 2b. RECORDING AN ULTIMATE TAKER: THE INSERT INTEGRITY THE TABLE NEVER HAD (V-E3-M2) ──────
--
-- `waqf_reversion_taker_no_mutate` (migration 12) refuses UPDATE and DELETE, and
-- `waqf_reversion_taker_no_truncate` refuses TRUNCATE. INSERT — the path by which a row comes to
-- exist at all — had nothing, and a row here decides where the whole endowment goes once the family
-- ends. Measured as `qmulate_app`: both of the shapes below were ACCEPTED.
--
-- ⚠ MECHANICAL FACTS ONLY. This function asserts coherence between things ALREADY RECORDED on the
-- parent waqf. It decides no fiqh question and it invents no clause.
CREATE OR REPLACE FUNCTION qmulate_reversion_taker_insert_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_taker_insert$
DECLARE
  w_captured   boolean;
  w_kind       text;
  b_kind       text;
  b_lineage    text;
  b_parent     text;
  b_tabaqa     integer;
BEGIN
  SELECT "reversionClauseCaptured", "reversionKind"::text
    INTO w_captured, w_kind
    FROM "waqf"
   WHERE "id" = NEW."waqfId";

  IF NOT FOUND THEN
    -- Belt and braces: `waqf_reversion_taker_waqfId_fkey` already says this. Kept because a NOT
    -- FOUND falling through to `w_captured IS NULL` below would produce a misleading message.
    RAISE EXCEPTION
      'waqf_reversion_taker %: waqf "%" does not exist.', NEW."id", NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;

  -- ── (1) THE DEED MUST HAVE BEEN READ ───────────────────────────────────────────────────────
  IF NOT w_captured THEN
    RAISE EXCEPTION
      'waqf_reversion_taker %: waqf % has "reversionClauseCaptured" = false — NOBODY HAS READ THIS '
      'DEED''S مآل CLAUSE YET. A named ultimate taker recorded against an unread clause is an '
      'assertion about a founder''s condition with no reading behind it (R7-c: the taker is a '
      'RECORDED DEED CLAUSE and is NEVER inferred). Record the reading first — capture the clause on '
      'the waqf — then name the taker it identifies.',
      NEW."id", NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;

  -- ── (2) THE DEED MUST ACTUALLY NAME A REVERSION ────────────────────────────────────────────
  -- MEASURED BEFORE: a taker on waqf-001 was accepted, and waqf-001's deed records
  -- `reversionClauseCaptured = true, reversionKind = NULL` — which is the deed POSITIVELY RECORDING
  -- THAT IT NAMES NO ULTIMATE TAKER. A taker row beside that reading contradicts it, and because
  -- the row is write-once and the column is sealed, NEITHER SIDE COULD LATER BE CORRECTED.
  IF w_kind IS NULL THEN
    RAISE EXCEPTION
      'waqf_reversion_taker %: waqf % records NO مآل الوقف — its clause was read and "reversionKind" '
      'is NULL, which is the deed''s own answer that it names no ultimate taker. Recording a taker '
      'against that answer contradicts a founder''s recorded condition, and both sides are '
      'unamendable afterwards (the column is sealed, the row is write-once). If the deed does name '
      'one, the reversion kind is what has to be recorded first — and if the recorded reading is '
      'wrong, the answer is a SUPERSEDING INSTRUMENT, never an edit (Binding rule 1, ADR-0006).',
      NEW."id", NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;

  -- ── (3) SAME ENDOWMENT — VERIFIED, NOT DUPLICATED ──────────────────────────────────────────
  -- `waqf_reversion_taker_waqfId_beneficiaryId_fkey` references `beneficiary("waqfId","id")`, so a
  -- cross-endowment taker is STRUCTURALLY impossible. MEASURED: naming ben-004 (waqf-002) on
  -- waqf-001 was refused 23503 by that constraint, before this trigger existed. A second check here
  -- would be a second implementation of one fact — §3 asserts the constraint exists instead.

  -- ── (4) A LIVING BLOODLINE MEMBER IS NOT A CHARITABLE ULTIMATE TAKER ───────────────────────
  --
  -- ⚠ TODO(surface) — FIQH/SCOPE, ENGINEERING'S FAIL-SAFE READING, NOT THE OWNER'S RULING.
  -- MEASURED BEFORE: a taker naming ben-002 — `kind = FAMILY`, `lineageLink = SON`, `active = true`,
  -- i.e. A LIVING DESCENDANT — was accepted on waqf-001.
  --
  -- What is refused here is NARROW and is keyed on the RECORDED KIND, never on what a taker "ought"
  -- to be: when the deed records `CHARITABLE_ULTIMATE_TAKER`, the person it names may not be a
  -- descendant of the waqif. R7 (product owner, 2026-08-10) is that the charity takes ONLY once the
  -- bloodline is over, and I-R1 asserts on every run that no charity is ever paid in the same run as
  -- a descendant — a taker who IS a descendant makes that clause self-contradictory, and R7-d
  -- (2026-08-11) turns the reversion trigger on whether a continuing line exists, which a member of
  -- that very line cannot answer.
  --
  -- ⚠ WHAT IS **NOT** ASSERTED, DELIBERATELY: that the taker IS a `CHARITABLE_JIHA`.
  -- `REVERSION_KIND_UNRECOGNISED` exists precisely because a deed may revert to another waqf, to the
  -- Authority, or to the waqif's nearest relatives, and those fiqh questions are OPEN (CLAUDE.md
  -- register item #13). Requiring a charity would pre-empt them; refusing a descendant on a clause
  -- that says "charitable" does not. When a second `ReversionKind` member lands, this branch does
  -- not apply to it and must be revisited deliberately.
  --
  -- SURFACE THIS: is "a descendant may not be the CHARITABLE ultimate taker" the owner's rule, or
  -- only ours? It refuses a route rather than paying anyone, so the fail-safe direction is to refuse.
  IF w_kind = 'CHARITABLE_ULTIMATE_TAKER' THEN
    SELECT "kind"::text, "lineageLink"::text, "parentId", "tabaqa"
      INTO b_kind, b_lineage, b_parent, b_tabaqa
      FROM "beneficiary"
     WHERE "waqfId" = NEW."waqfId" AND "id" = NEW."beneficiaryId";

    IF FOUND AND (b_kind = 'FAMILY' OR b_lineage IS NOT NULL OR b_parent IS NOT NULL
                  OR b_tabaqa IS NOT NULL) THEN
      RAISE EXCEPTION
        'waqf_reversion_taker %: beneficiary % is a DESCENDANT of the waqif (kind %, lineageLink %, '
        'parentId %, tabaqa %) and waqf %''s deed records reversionKind = CHARITABLE_ULTIMATE_TAKER. '
        'The مآل الوقف is where the endowment goes ONCE THE BLOODLINE IS OVER (R7, product owner '
        '2026-08-10; R7-d 2026-08-11 — "over" means no continuing line), so a member of that '
        'bloodline cannot be the charitable taker: the clause would name, as its successor, somebody '
        'whose own absence is its trigger. Invariant I-R1 — no charity is paid a halala in the same '
        'run as any descendant — could not hold for such a row. ⚠ TODO(surface): this refusal is '
        'ENGINEERING''S fail-safe reading of R5/R7, not the product owner''s ruling. It refuses a '
        'route; it pays nobody.',
        NEW."id", NEW."beneficiaryId", coalesce(b_kind, 'NULL'), coalesce(b_lineage, 'NULL'),
        coalesce(b_parent, 'NULL'), coalesce(b_tabaqa::text, 'NULL'), NEW."waqfId"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_taker_insert$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — qmulate_apply_e3_closeout()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e3_closeout()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_e3c$
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.1 THE COMPOSITE FK IS VERIFIED, NOT RE-IMPLEMENTED
  --
  -- §2b (3) relies on `waqf_reversion_taker_waqfId_beneficiaryId_fkey` for the same-endowment rule.
  -- A reliance that is not asserted is a reliance that silently lapses — this repo's ADR-0008 §2.4
  -- lesson exactly — so the reliance is checked here rather than trusted.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'waqf_reversion_taker_waqfId_beneficiaryId_fkey'
       AND contype = 'f'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out: the composite foreign key '
      '"waqf_reversion_taker_waqfId_beneficiaryId_fkey" is MISSING. '
      'qmulate_reversion_taker_insert_integrity() relies on it for the same-endowment rule and '
      'deliberately does not duplicate it, so without it a taker could name a beneficiary of a '
      'DIFFERENT endowment. Re-run SELECT qmulate_apply_e3_deed_terms();';
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.2 THE TRIGGER
  --
  -- Registered as its OWN trigger rather than by widening `waqf_reversion_taker_no_mutate` to
  -- `BEFORE INSERT OR UPDATE OR DELETE`: that function refuses EVERY verb it sees, so widening it
  -- would refuse the recording path outright and make the clause unrecordable. Two verbs, two
  -- functions, two messages a Nazir can act on.
  --
  -- ⚠ AND MIGRATION 12 §4.6's LESSON APPLIES: do NOT re-register a verb another guard already
  -- covers. INSERT is the one verb `waqf_reversion_taker` had nothing on — verified against
  -- pg_trigger, not assumed.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS waqf_reversion_taker_insert_integrity ON "waqf_reversion_taker";
  CREATE TRIGGER waqf_reversion_taker_insert_integrity
    BEFORE INSERT ON "waqf_reversion_taker"
    FOR EACH ROW EXECUTE FUNCTION qmulate_reversion_taker_insert_integrity();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.3 ENABLE ALWAYS
  --
  -- A trigger created normally is `tgenabled = 'O'` and Postgres SKIPS it for a session that has run
  -- `SET LOCAL session_replication_role = 'replica'` — a plain SET, not DDL, which defeated gate G-1
  -- outright during Sprint-1 adversarial review.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  ALTER TABLE "waqf_reversion_taker"
    ENABLE ALWAYS TRIGGER waqf_reversion_taker_insert_integrity;
END;
$qm_apply_e3c$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — APPLY
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['waqf', 'beneficiary', 'asset', 'waqf_reversion_taker']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out ran BEFORE the tables it guards exist. Missing table(s): %.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_reserved_matter_defect(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out ran BEFORE 00000000000004_e2_guard_gaps, which defines the '
      'artifact-bound qmulate_reserved_matter_defect(text,text,text). This migration REPLACES two '
      'trigger function bodies that call it and must run after it.';
  END IF;

  IF to_regprocedure('qmulate_apply_e3_deed_terms()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out ran BEFORE 00000000000012_e3_lineage_reversion_deed_terms, whose '
      'qmulate_shart_guard() body this migration extends and whose waqf_reversion_taker table and '
      'composite foreign keys it depends on.';
  END IF;

  PERFORM qmulate_apply_e3_closeout();

  -- The two REPLACED bodies sit on triggers registered by earlier migrations. `CREATE OR REPLACE
  -- FUNCTION` does not touch a trigger's `tgenabled`, so they should still be `ENABLE ALWAYS` — but
  -- "should" is what this repo keeps being bitten by, so it is asserted rather than assumed.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('waqf_shart_immutable', 'asset_identity_guard')
       AND NOT tgisinternal
       AND tgenabled <> 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out: waqf_shart_immutable and/or asset_identity_guard is not ENABLE ALWAYS '
      'after this migration replaced its function body. A guard at tgenabled = ''O'' is skipped by '
      'any session that has run SET session_replication_role = ''replica''.';
  END IF;
END
$qm_apply$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — GRANTS FOR THE RUNTIME ROLE
--
-- No new TABLE is created here, so no table grant is needed. The `"AssetStatus"` TYPE needs none
-- either: `USAGE` on a type in a schema the role can already use is granted to PUBLIC by default and
-- confers nothing but the ability to name the type — unlike EXECUTE on a function, which is what
-- §6 is about.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- ⚠ THIS CALL IS MANDATORY IN EVERY MIGRATION THAT ADDS A FUNCTION, AND MIGRATION 12 LEARNED IT THE
-- HARD WAY. Migration 10 §2.4 ran
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- and its claim that "the default for FUTURE functions is revoked too" WAS FALSE FROM THE DAY IT
-- SHIPPED — measured on PostgreSQL 17.10 as `qmulate_owner`: `ALTER DEFAULT PRIVILEGES … REVOKE`
-- only DELETES an explicit `pg_default_acl` row, and with no row present it stores nothing, which
-- leaves the BUILT-IN default — and the built-in default for FUNCTIONS grants EXECUTE to PUBLIC.
-- So all five functions migration 12 created landed PUBLIC-executable on a fresh database, and
-- `authorization-plane-privilege.integration.test.ts` assertion 1f caught it.
--
-- This file creates THREE functions — `qmulate_asset_identity_guard()` and `qmulate_shart_guard()`
-- are REPLACED bodies of existing ones, `qmulate_reversion_taker_insert_integrity()` and
-- `qmulate_apply_e3_closeout()` are new — and it does not get to re-learn the lesson. The sweep is
-- REUSABLE and idempotent by design (migration 12 §6): hand-listing this file's functions would
-- leave migration 14 in the same trap.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3c_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 close-out: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function — ALTER DEFAULT PRIVILEGES does not protect future '
      'functions on this Postgres (measured, 17.10). Without it this migration would leave '
      'PUBLIC-executable functions behind and assertion 1f would fail.';
  END IF;
END
$qm_e3c_sweep$;

SELECT qmulate_revoke_public_function_execute();
