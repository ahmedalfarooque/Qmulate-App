-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E3: THE LINEAGE EDGE, THE مآل CLAUSE, AND A THIRD IMMUTABILITY TIER.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     A founder's condition that lands in a plain column has NOT become editable.
--
-- ── WHAT THIS MIGRATION LANDS ────────────────────────────────────────────────────────────────
-- The whole declared ADR-0009 / R-FRONTIER / R6 / R7 delta, in ONE migration, so the engine stops
-- leading `schema.prisma` and `packages/domain`'s `prisma-vocabulary-parity.test.ts` can empty its
-- `PENDING_MIGRATION` list DELIBERATELY rather than by lapse:
--
--   ·  EntitlementOrder gains LINEAGE_CONTINUATION — the deed shape the product treats as NORMAL
--      (ADR-0009 R4). Additive; every existing row keeps its value.
--   ·  enums ContinuationStipulation (ẓuhūr/buṭūn, closed two-value), LineageLink (SON|DAUGHTER —
--      an ELIGIBILITY FACT, never a gender), ReversionKind (مآل الوقف, one member), and
--      ReservedMatterKind (what a RESERVED_MATTER approval actually approves).
--   ·  Beneficiary gains the LINEAGE EDGE (`parentId` + a COMPOSITE self-FK), `lineageLink`,
--      `active` (a required vital status with NO default), the death certification pair, and
--      `stipulatedWeight` — a field DISTINCT from `sharePercent`.
--   ·  Waqf gains `continuationStipulation` and the four مآل columns, plus the join table
--      `waqf_reversion_taker`.
--   ·  TrusteeshipDeed gains the AUTHORIZED REPRESENTATIVE's own eligibility flags and the
--      verification event BR-109 requires but the model never had.
--
-- ── THE CONTROLS ─────────────────────────────────────────────────────────────────────────────
--   1.  TIER 3   qmulate_shart_guard()                        WRITE-ONCE deed terms: NULL -> value
--                                                             once, value -> anything refused
--   2.  TRIGGER  waqf_reversion_taker_no_mutate                a taker row is write-once
--   3.  TRIGGER  waqf_reversion_taker_no_truncate
--   4.  TRIGGER  reclassification_event_no_update              the EDIT half of the model's OWN
--                                                             "append-only" claim, enforced for the
--                                                             first time. DELETE and TRUNCATE are
--                                                             migration 6's and are NOT re-created
--                                                             here — see §4.6
--   5.  TRIGGER  reclassification_event_from_matches_current   a FABRICATED transition is
--                                                             unrepresentable, not discouraged
--   6.  HARDENED qmulate_asset_identity_guard()                BR-306: a status change INTO a
--                                                             disposal/substitution/pledge/long-lease
--                                                             value is reserved-matter-only
--   7.  CHECKs   the mechanical coherence of every new column pair (see §4)
--   8.  FUNCTION qmulate_beneficiary_ancestry(text)            THE ancestor walk, one definition
--
-- ── WHAT IS DELIBERATELY *NOT* HARDENED HERE, AND WHY ────────────────────────────────────────
-- Three refusals the distribution engine performs are **Claude's own fail-safe reading of the
-- product owner's R5**, not the owner's ruling (CLAUDE.md register item #13, which says in terms:
-- "Do not cite those three as settled"):
--
--   ·  DESCENDANT_ON_CHARITABLE_WAQF   — a `lineageLink` on a خيري waqf
--   ·  TABAQA_ON_CHARITABLE_WAQF       — a `tabaqa` on a خيري waqf
--   ·  REVERSION_ON_CHARITABLE_WAQF    — may a خيري waqf record a reversion at all?
--
-- Each is expressible as a cross-row trigger here. NONE is installed. A CHECK or trigger is the
-- WRONG place for a rule whose fiqh half is unconfirmed: it would make relaxing the rule a
-- migration, and it would convert an engine refusal a Nazir can see and dispute into a SQLSTATE.
-- The engine refuses these routes today and carries a TODO(surface) on each; that is where they
-- stay until the owner answers. The same reasoning governs the ultimate taker: this file does NOT
-- assert that a `waqf_reversion_taker` names a `CHARITABLE_JIHA` with no lineage edge, because
-- `REVERSION_KIND_UNRECOGNISED` exists precisely for the deeds that revert to another waqf, to the
-- Authority, or to the waqif's nearest relatives — none of which is a charity.
--
-- What IS hardened is only what is MECHANICAL: same-endowment references (structural, via composite
-- FKs), no self-parent, a dead member cannot also be `active`, and each dual-date pair present or
-- absent together. None of those is a reading of anything.
--
-- ── AND WHAT THIS FILE DID NOT DECIDE ────────────────────────────────────────────────────────
-- `waqf.entitlementOrder`, `waqf.type` and `waqf.nature` are ALSO founder's conditions and are
-- still freely editable by anyone holding `endowment:waqf:write`. S4 makes that incoherent by
-- putting `continuationStipulation` write-once directly beside `entitlementOrder`. Bringing all
-- three into a guarded tier is the RECOMMENDATION and it is NOT DONE HERE: it changes what a LIVE
-- endowment permits, so it is the product owner's call, and a migration is exactly the wrong place
-- to take it silently. SURFACED.
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase. Every
-- column identifier is therefore DOUBLE-QUOTED — an unquoted one would be folded to lower case by
-- Postgres and would not match.
--
-- ── WHERE A NEW ENUM VALUE MAY AND MAY NOT APPEAR ────────────────────────────────────────────
-- This file adds `'LINEAGE_CONTINUATION'` to the PRE-EXISTING `EntitlementOrder`, and Postgres
-- refuses to USE a newly-added enum value in the same transaction that added it. Nothing below
-- names it — no CHECK, no index predicate, no trigger body. The four types this file CREATES are
-- unaffected by that rule (it applies only to values added to an existing type).
--
-- ⚠ AND THERE IS DELIBERATELY NO CHECK OF THE FORM
--   `entitlementOrder = 'LINEAGE_CONTINUATION' => continuationStipulation IS NOT NULL`.
-- That would make the DATABASE refuse to RECORD an incomplete deed, when the required behaviour is
-- to record it and have the ENGINE halt (`SHART_INCOMPLETE` / `CONTINUATION_STIPULATION_UNRECOGNISED`).
-- A Nazir must be able to see the halt.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: `ADD VALUE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
-- `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
-- `CREATE TRIGGER`, `CREATE ... IF NOT EXISTS`, guarded `ADD CONSTRAINT` via `qmulate_add_check()`
-- (from `00000000000001_init_append_only_audit`) and an explicit `pg_constraint` probe for the FKs.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- The table-dependent DDL lives in `qmulate_apply_e3_deed_terms()`. After any schema change that
-- recreates a guarded table, re-apply EVERY guard set:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
--     SELECT qmulate_apply_e2_grant_admission();
--     SELECT qmulate_apply_e3_deed_terms();
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — SCHEMA CHANGES (the Prisma-generated half, hand-written and made idempotent)
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- AlterEnum: ADR-0009 R4's normal deed shape becomes recordable. This is the ONE member the
-- engine led the schema by, and landing it is what lets the parity test empty its declared delta.
ALTER TYPE "EntitlementOrder" ADD VALUE IF NOT EXISTS 'LINEAGE_CONTINUATION';

-- CreateEnum. `IF NOT EXISTS` has no form for CREATE TYPE, so each is probed.
DO $qm_e3_types$
BEGIN
  IF to_regtype('"ContinuationStipulation"') IS NULL THEN
    CREATE TYPE "ContinuationStipulation" AS ENUM ('ZUHUR_ONLY', 'ZUHUR_AND_BUTUN');
  END IF;
  IF to_regtype('"LineageLink"') IS NULL THEN
    CREATE TYPE "LineageLink" AS ENUM ('SON', 'DAUGHTER');
  END IF;
  IF to_regtype('"ReversionKind"') IS NULL THEN
    CREATE TYPE "ReversionKind" AS ENUM ('CHARITABLE_ULTIMATE_TAKER');
  END IF;
  IF to_regtype('"ReservedMatterKind"') IS NULL THEN
    CREATE TYPE "ReservedMatterKind" AS ENUM (
      'ASSET_DISPOSAL', 'ASSET_SUBSTITUTION_ISTIBDAL', 'ASSET_PLEDGE', 'ASSET_LONG_LEASE',
      'DEED_IDENTITY', 'DEED_TERM_RECORD', 'ACCESS_MATRIX_CHANGE'
    );
  END IF;
END
$qm_e3_types$;

-- AlterTable: approval_request — an approval now says WHAT reserved act it authorises.
ALTER TABLE "approval_request"
  ADD COLUMN IF NOT EXISTS "reservedMatterKind" "ReservedMatterKind";

-- AlterTable: beneficiary — the lineage edge, the vital status, the death certification, the weight.
--
-- ⚠ `active` IS `NOT NULL` WITH NO DEFAULT, so it is added nullable, backfilled EXPLICITLY in
-- section 1, and only then constrained. Prisma's own generated DDL would have written
-- `ADD COLUMN "active" BOOLEAN NOT NULL` and failed outright on any table with rows — and adding a
-- `DEFAULT true` to make it succeed is precisely the defaulted VITAL STATUS the engine refuses.
ALTER TABLE "beneficiary"
  ADD COLUMN IF NOT EXISTS "parentId"         TEXT,
  ADD COLUMN IF NOT EXISTS "lineageLink"      "LineageLink",
  ADD COLUMN IF NOT EXISTS "active"           BOOLEAN,
  ADD COLUMN IF NOT EXISTS "deceasedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deceasedAtHijri"  TEXT,
  ADD COLUMN IF NOT EXISTS "stipulatedWeight" DECIMAL(38, 18);

-- AlterTable: trusteeship_deed — BR-109 for the AUTHORIZED REPRESENTATIVE, and the verification
-- event that turns four captured flags into a verification rather than a claim.
ALTER TABLE "trusteeship_deed"
  ADD COLUMN IF NOT EXISTS "repIslam"                   BOOLEAN,
  ADD COLUMN IF NOT EXISTS "repLegalCapacity"           BOOLEAN,
  ADD COLUMN IF NOT EXISTS "repNoDisqualifyingRemoval"  BOOLEAN,
  ADD COLUMN IF NOT EXISTS "repKsaResident"             BOOLEAN,
  ADD COLUMN IF NOT EXISTS "eligibilityVerifiedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eligibilityVerifiedAtHijri" TEXT,
  ADD COLUMN IF NOT EXISTS "eligibilityVerifiedBy"      TEXT;

-- AlterTable: waqf — the continuation stipulation and the مآل clause. Same treatment for
-- `reversionClauseCaptured`: nullable, backfilled explicitly, then NOT NULL.
ALTER TABLE "waqf"
  ADD COLUMN IF NOT EXISTS "continuationStipulation" "ContinuationStipulation",
  ADD COLUMN IF NOT EXISTS "reversionClauseCaptured" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "reversionKind"           "ReversionKind",
  ADD COLUMN IF NOT EXISTS "reversionRecordedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversionRecordedAtHijri" TEXT;

-- CreateTable: the deed clause NAMES ids, at WAQF level (R7's four recorded reasons for rejecting a
-- per-beneficiary flag). NO `updatedAt`, NO `deletedAt` — a row here is write-once with the clause.
CREATE TABLE IF NOT EXISTS "waqf_reversion_taker" (
    "id"            TEXT NOT NULL,
    "waqfId"        TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"     TEXT,

    CONSTRAINT "waqf_reversion_taker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "waqf_reversion_taker_waqfId_idx"
  ON "waqf_reversion_taker" ("waqfId");
-- The second side of the resolver's "repeated id" refusal
-- (`REVERSION_ULTIMATE_TAKER_DUPLICATED`): a repeat is never deduplicated, because it would
-- double-count in the weight vector and MOVE MONEY.
CREATE UNIQUE INDEX IF NOT EXISTS "waqf_reversion_taker_waqfId_beneficiaryId_key"
  ON "waqf_reversion_taker" ("waqfId", "beneficiaryId");

-- CreateIndex: the recursive CTE's join key — `child.[waqfId, parentId] -> parent.[waqfId, id]`.
-- ⚠ STATED HONESTLY: no measurement exists for this index or for `beneficiary_waqfId_tabaqa_idx` on
-- this schema. `@@index([waqfId, tabaqa])` is KEPT rather than dropped: it still serves the ORDERED
-- tier query and the ṭabaqa-vs-derived-depth cross-check, and dropping a live index to chase a walk
-- nobody has benchmarked is a guess.
CREATE INDEX IF NOT EXISTS "beneficiary_waqfId_parentId_idx"
  ON "beneficiary" ("waqfId", "parentId");

-- CreateIndex: NOT an optimisation. This unique key is REQUIRED as the target of the two composite
-- foreign keys below, and those are what make a cross-endowment parent edge and a cross-endowment
-- ultimate taker STRUCTURALLY IMPOSSIBLE rather than merely refused by application code.
CREATE UNIQUE INDEX IF NOT EXISTS "beneficiary_waqfId_id_key"
  ON "beneficiary" ("waqfId", "id");


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — THE TWO EXPLICIT BACKFILLS
--
-- Both columns are REQUIRED with NO DEFAULT, so existing rows have to be given a value by a
-- statement somebody can read and argue with, rather than by a `DEFAULT` clause nobody sees again.
-- Every row either column touches is a FIXTURE row seeded from `data/fixtures/sample-waqf.json`.
--
--   `beneficiary.active`          -> TRUE.  The fixture records no death and no scope exit for any
--                                   of its beneficiaries; every one of them is a live registered
--                                   mustahiq. TRUE is therefore the value the DATA states, not a
--                                   convenient default — and the seed now writes it EXPLICITLY per
--                                   record, so this backfill only matters for a database migrated
--                                   before the next `db:seed`.
--   `waqf.reversionClauseCaptured` -> FALSE.  THE FAIL-SAFE, and the direction is the whole point of
--                                   the column: `false` means "nobody has read this deed's مآل
--                                   clause yet", which is the truth about every row that existed
--                                   before this migration. `true` would assert that somebody read
--                                   the clause and found none — a claim about a founder's
--                                   conditions that no migration is entitled to make. A `false` row
--                                   makes the mapper REFUSE to build a distribution run input at
--                                   all, which is the correct consequence.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3_backfill$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public."beneficiary"') IS NOT NULL THEN
    UPDATE "beneficiary" SET "active" = TRUE WHERE "active" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE
        'QMULATE E3: set beneficiary."active" = true on % pre-existing row(s). The fixture records '
        'no death and no scope exit for any beneficiary; the seed now writes the flag explicitly '
        'per record. ⚠ A REAL register must never be backfilled this way — an ancestor''s vital '
        'status decides whether a whole branch is entitled (R-FRONTIER).', n;
    END IF;
    ALTER TABLE "beneficiary" ALTER COLUMN "active" SET NOT NULL;
  END IF;

  IF to_regclass('public."waqf"') IS NOT NULL THEN
    UPDATE "waqf" SET "reversionClauseCaptured" = FALSE WHERE "reversionClauseCaptured" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE
        'QMULATE E3: set waqf."reversionClauseCaptured" = false on % pre-existing row(s) — the '
        'fail-safe. "false" says nobody has read the deed''s مآل clause yet, which is true of every '
        'row that predates this migration; "true" would assert a reading of a founder''s condition '
        'that a migration may not make.', n;
    END IF;
    ALTER TABLE "waqf" ALTER COLUMN "reversionClauseCaptured" SET NOT NULL;
  END IF;
END
$qm_e3_backfill$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TRIGGER FUNCTIONS
--
-- plpgsql function BODIES are only syntax-checked at creation time and their tables resolve at call
-- time, so this section is safe even before the tables exist.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 2a. THE SHART GUARD GAINS A THIRD TIER: WRITE-ONCE ───────────────────────────────────────
-- REPLACES migration 4's body. THE MOST LOAD-BEARING ITEM IN THIS FILE.
--
-- `continuationStipulation` and the مآل clause ARE FOUNDER'S CONDITIONS. Landed as plain columns
-- they would be editable by anyone holding `endowment:waqf:write` — ADR-0006's hole reopened
-- through a new column, which is exactly the failure this repo has already had twice (a claimed
-- enforcement with nothing implementing it).
--
-- They cannot join TIER 1 (never-writable): a deed term that is illegible at intake would then be
-- unrecordable for ever, and an endowment could never be brought onto the system after the fact.
-- So there are now three tiers, and the ORDER INSIDE THIS FUNCTION IS PART OF THE CONTRACT:
--
--   TIER 1  the four Shart columns          — refused UNCONDITIONALLY, before any GUC is read.
--                                             `shart-immutability.integration.test.ts` asserts that
--                                             the Shart raise precedes the first `current_setting`
--                                             call in this function's own source text, so tier 1
--                                             must stay first and tier 3 must not read the GUC.
--   TIER 3  the deed-term columns           — NULL -> value permitted ONCE; value -> ANYTHING
--                                             (including back to NULL) refused with 42501.
--                                             `reversionClauseCaptured` is false -> true only.
--   TIER 2  certificateNumber / deedNumber  — reserved-matter-only, verified AND artifact-bound
--                                             (migration 4's C-14 subject bind, unchanged).
--
-- ⚠ WHAT TIER 3 DELIBERATELY DOES NOT DO: it does not require an approval for the FIRST write. The
-- database cannot tell a Nazir's deed act from any other caller's UPDATE, and demanding a
-- reserved-matter approval to record a term for the first time would make an un-transcribed deed
-- permanently un-transcribable. The authority for the first write is the PROCEDURE LADDER's
-- (`endowment.recordDeedTerms` is a signer rung: maker ≠ checker on the persisted makerId, a fresh
-- TOTP, and `endowment:deed:sign`, which only `nazir` holds) plus the column gate in
-- `src/extensions/scoping.ts`, which requires `endowment:deed:sign` for these five columns
-- specifically. What the database owns absolutely is the SECOND write, and that is what it refuses.
CREATE OR REPLACE FUNCTION qmulate_shart_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_shart_guard$
DECLARE
  approval        text;
  shart_changed   text := NULL;
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

  -- ── (3) THE DEED TERMS: WRITE-ONCE (NULL -> value ONCE, then sealed) ───────────────────────
  -- Compared through `to_jsonb` so each column is NAMED ONCE. Writing the comparison out per column
  -- is how migration 3 ended up with an ELSIF that checked only the first of two.
  FOREACH write_once_col IN ARRAY ARRAY[
    'continuationStipulation', 'reversionKind', 'reversionRecordedAt', 'reversionRecordedAtHijri'
  ]
  LOOP
    old_value := to_jsonb(OLD) ->> write_once_col;
    new_value := to_jsonb(NEW) ->> write_once_col;
    CONTINUE WHEN new_value IS NOT DISTINCT FROM old_value;  -- unchanged

    -- ⚠ NULL DOES NOT MEAN "UNWRITTEN" FOR THE مآل COLUMNS, AND ASSUMING IT DID WAS A REAL DEFECT.
    --
    -- MEASURED (S4 adversarial verification, finding V-E3-01, on a pristine seed as the LEAST-
    -- privileged runtime role `qmulate_app`): every seeded waqf carries
    -- `reversionClauseCaptured = true, reversionKind = NULL` — which is the deed POSITIVELY RECORDING
    -- THAT IT NAMES NO ULTIMATE TAKER. With the loop keyed only on `old_value IS NULL`, a raw
    -- `UPDATE` setting reversionKind = 'CHARITABLE_ULTIMATE_TAKER' with its date pair was PERMITTED
    -- and committed. So "this endowment names no مآل" could be silently rewritten into "a charity
    -- takes the whole distributable once the bloodline ends" — a founder's condition changed by an
    -- edit, with no approval, which is precisely what Binding rule 1 and ADR-0006 forbid. The
    -- control in the same run: `shartAlWaqif` on the same row and role was refused 42501, so the
    -- guard worked everywhere the state was unambiguous and failed on the one column where NULL
    -- carries two meanings.
    --
    -- `reversionClauseCaptured` was added to THIS migration precisely to separate "nobody has read
    -- the clause yet" (false) from "the deed names no taker" (true, kind NULL). The loop simply did
    -- not consult it. Once the clause is captured, the whole مآل group is SEALED — including at NULL.
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
  -- Un-capturing would turn "the deed records no مآل" back into "nobody has looked", which is how a
  -- recorded reading of a founder's condition gets quietly withdrawn.
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
  -- Unchanged from migration 4. Note this is the FIRST GUC read in the function, which is what the
  -- parity assertion in `shart-immutability.integration.test.ts` measures against tier 1's raise.
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


-- ── 2b. A RECORDED ULTIMATE TAKER IS WRITE-ONCE ──────────────────────────────────────────────
-- A row in `waqf_reversion_taker` decides where the endowment goes when the family ends. Editing
-- one in place would redirect the whole corpus to a different jiha with no superseding instrument
-- and no second side to disagree; deleting one would silently restore "this deed names no ultimate
-- taker". Both are refused outright rather than gated, for the reason `qmulate_waqf_reject_delete()`
-- gives about `waqf`: soft retirement plus a superseding record is the posture the rest of the
-- schema takes, and this table has no `deletedAt` because a clause is not retired, it is superseded.
CREATE OR REPLACE FUNCTION qmulate_reversion_taker_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_taker_no_mutate$
BEGIN
  RAISE EXCEPTION
    '% on "waqf_reversion_taker" is refused (row %). A recorded ultimate taker (مآل الوقف) is '
    'write-once: it names where the endowment goes once the bloodline is over, so re-pointing it '
    'redirects the corpus and removing it silently restores "this deed names no taker". Record a '
    'superseding instrument as a NEW clause instead (Binding rule 1, ADR-0006, R7).',
    TG_OP, COALESCE(OLD."id", '<unknown>')
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_taker_no_mutate$;


-- ── 2c. RECLASSIFICATION HISTORY IS APPEND-ONLY — FOR THE FIRST TIME ─────────────────────────
-- `model ReclassificationEvent`'s doc comment has said "event-sourced — append-only, never edited"
-- since Sprint 1, and NOTHING ENFORCED IT: the live trigger census carried 25 triggers and not one
-- was on this table. BR-104 requires re-classification WITH HISTORY, and a history that can be
-- rewritten is not one — an endowment could be shown as always having been LARGE, or a period of
-- SMALL classification (with its lighter obligations) could be erased after the fact.
--
-- A claimed control with no implementation is worse than an admitted gap, because a reader stops
-- looking. This is the same finding shape as the `ApprovalRequest` "checker != maker" claim that
-- migration 3 had to make true.
CREATE OR REPLACE FUNCTION qmulate_reclassification_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_reclass_append$
BEGIN
  RAISE EXCEPTION
    '% on "reclassification_event" is refused (row %). The classification history is APPEND-ONLY '
    '(BR-104): it is the evidence of which regulatory obligations applied to this endowment and '
    'when, so an edited or deleted transition rewrites the compliance position retrospectively. '
    'A correction is a NEW event, never an edit — the model has no "updatedAt" and no "deletedAt" '
    'for exactly this reason.',
    TG_OP, COALESCE(OLD."id", '<unknown>')
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_reclass_append$;


-- ── 2d. A FABRICATED TRANSITION IS UNREPRESENTABLE, NOT MERELY DISCOURAGED ───────────────────
-- Append-only is only half of BR-104. Without this, an append-only history still accepts
-- `from: 'SMALL', to: 'LARGE'` on an endowment that was MEDIUM — a transition that never happened,
-- permanently un-editable, and indistinguishable from a real one. `NEW."from"` must be the
-- PRE-IMAGE.
--
-- ⚠ ORDERING REQUIREMENT THIS IMPOSES ON EVERY CALLER: inside the one transaction, INSERT THE EVENT
-- FIRST, then UPDATE `waqf.classification`. Updating the waqf first makes `from` the post-image and
-- the insert is refused, naming both values.
--
-- ⚠ WHY NOT A DEFERRED CONSTRAINT TRIGGER (the shape migration 4 used for `distribution_authority`):
-- at COMMIT the waqf already holds `to`, so `from` could never equal the current value and the check
-- would have to be deleted rather than deferred. The ordering requirement is the cost of checking
-- the thing that matters.
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

  RETURN NEW;
END;
$qm_reclass_from$;


-- ── 2e. BR-306: A DISPOSAL / SUBSTITUTION / PLEDGE / LONG LEASE IS A RESERVED MATTER ─────────
-- REPLACES migration 5's body, keeping its `titleDeedNumber` half verbatim and adding the `status`
-- half beside it.
--
-- `src/extensions/scoping.ts` names `asset.status` as A NAMED RESIDUAL rather than a judgement that
-- it is harmless, in its own words: "`active` -> `disposed` on a corpus asset is a material act".
-- E3 is the epic that flags disposal and substitution as reserved (BR-306), so this is where the
-- residual closes — at the DATABASE, which is the layer that survives raw SQL.
--
-- ⚠ `asset.status` IS A FREE-TEXT COLUMN, not an enum, so the gated set has to be named explicitly.
-- Only transitions INTO a reserved value are gated; the value it comes FROM is irrelevant, and a
-- move BACK OUT of a reserved value is deliberately not gated here (it does not dispose of
-- anything, and gating it would make a mis-keyed status permanently un-correctable). Normalised
-- with `lower(btrim(...))` and matched with underscores or spaces, because a free-text column will
-- eventually be written both ways and a guard defeated by a capital letter is not a guard.
--
-- ⚠ ISTIBDAL PROCEEDS ARE CORPUS (aṣl). This guard records the RESERVED ACT only. It writes no
-- receipt and creates no `Transaction`: the ledger path is E5's, and a capital receipt stays blocked
-- from the distribution waterfall by `Transaction.receiptClass` and its CHECKs (Binding rule 1).
CREATE OR REPLACE FUNCTION qmulate_asset_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_asset_identity$
DECLARE
  approval      text := current_setting('qmulate.reserved_matter_approval_id', true);
  defect        text;
  new_status    text := lower(btrim(replace(COALESCE(NEW."status", ''), ' ', '_')));
  old_status    text := lower(btrim(replace(COALESCE(OLD."status", ''), ' ', '_')));
  reserved_acts text[] := ARRAY[
    'disposed', 'disposal', 'sold', 'sale',
    'substituted', 'istibdal', 'substitution',
    'pledged', 'pledge', 'mortgaged',
    'long_leased', 'long_lease'
  ];
BEGIN
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

  IF new_status IS DISTINCT FROM old_status AND new_status = ANY (reserved_acts) THEN
    defect := qmulate_reserved_matter_defect(
      approval, OLD."waqfId", 'asset:' || OLD."id" || ':status'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'asset %: moving "status" to % is a RESERVED MATTER (BR-306) — disposal, substitution '
        '(istibdal), pledge and long lease of a corpus asset all require an approved reserved '
        'matter before the state changes. %. Go through withReservedMatter(); the subject an '
        'approval must name is "asset:%:status". ⚠ Istibdal proceeds are CORPUS (aṣl): recording the '
        'act writes no receipt, and any proceeds must be entered as receiptClass = CAPITAL, which '
        'the distribution waterfall excludes by construction (Binding rule 1).',
        OLD."id", NEW."status", defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_asset_identity$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE ANCESTOR WALK, ONE DEFINITION
--
-- R-FRONTIER makes entitlement a property of a CHAIN, not of a row: a member is entitled only if
-- every ancestor strictly between them and the waqif is deceased. So the hot read is an ancestor
-- walk, and it needs to exist exactly once — a second hand-written `WITH RECURSIVE` somewhere in
-- TypeScript is two definitions of one fact, which is the drift this repo has been bitten by twice.
--
-- ⚠ `p_waqf_id` IS REQUIRED AND IS THE WHOLE POINT. Raw SQL BYPASSES the Prisma force filter, so
-- this function performs NO authorization of any kind: it must be called only by an
-- already-grant-verified caller, and the endowment must be named rather than inferred. Anchoring
-- the recursion at one endowment also keeps the walk off a full-table scan.
--
-- ⚠ THE CYCLE GUARD IS NOT OPTIONAL. The composite FK and CHECK `beneficiary_no_self_parent` make a
-- one-row cycle impossible, but A -> B -> A across two rows is perfectly representable and would
-- recurse for ever. The path array breaks it and `p_max_depth` caps it, so malformed data yields a
-- truncated result rather than a hung connection; the ENGINE still refuses such a graph
-- (`LINEAGE_CYCLE`), which is where the refusal belongs.
--
-- Returns one row per (beneficiary, ancestor) pair — NOT one per beneficiary — because the caller
-- needs every ancestor's vital status, not just the nearest. `depth` is 1 for the direct parent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_beneficiary_ancestry(
  p_waqf_id   text,
  p_max_depth integer DEFAULT 64
)
RETURNS TABLE (
  "waqfId"              text,
  "beneficiaryId"       text,
  "ancestorId"          text,
  "depth"               integer,
  "ancestorActive"      boolean,
  "ancestorLineageLink" text,
  "ancestorDeletedAt"   timestamp(3)
)
LANGUAGE sql
STABLE
AS $qm_ancestry$
  WITH RECURSIVE walk AS (
    SELECT b."waqfId"                AS "waqfId",
           b."id"                    AS "beneficiaryId",
           b."parentId"              AS "ancestorId",
           1                         AS "depth",
           ARRAY[b."id", b."parentId"] AS path
      FROM "beneficiary" b
     WHERE b."waqfId"   = p_waqf_id
       AND b."parentId" IS NOT NULL
    UNION ALL
    SELECT w."waqfId",
           w."beneficiaryId",
           p."parentId",
           w."depth" + 1,
           w.path || p."parentId"
      FROM walk w
      JOIN "beneficiary" p
        ON p."waqfId" = w."waqfId" AND p."id" = w."ancestorId"
     WHERE p."parentId" IS NOT NULL
       AND w."depth" < p_max_depth
       -- the cycle break: never revisit an id already on this chain
       AND NOT (p."parentId" = ANY (w.path))
  )
  SELECT w."waqfId",
         w."beneficiaryId",
         w."ancestorId",
         w."depth",
         a."active",
         a."lineageLink"::text,
         a."deletedAt"
    FROM walk w
    JOIN "beneficiary" a
      ON a."waqfId" = w."waqfId" AND a."id" = w."ancestorId"
   ORDER BY w."beneficiaryId", w."depth";
$qm_ancestry$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — qmulate_apply_e3_deed_terms()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e3_deed_terms()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_e3$
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.1 THE TWO COMPOSITE FOREIGN KEYS
  --
  -- Both reference `beneficiary("waqfId", "id")` rather than `beneficiary("id")`, which is what
  -- makes a cross-endowment parent edge and a cross-endowment ultimate taker STRUCTURALLY
  -- IMPOSSIBLE. Postgres FK matching is MATCH SIMPLE: with `parentId` NULL the constraint is not
  -- checked at all, which is exactly what "a child of the waqif" needs.
  --
  -- ⚠ SURFACED (fiqh/scope, delivered by a foreign key and therefore worth naming): this
  -- structurally answers ADR-0009 open question 9 — does the family tree belong to the WAQF or to
  -- the WAQIF? — as WAQF-SCOPED. It matches the engine's current behaviour and it is the fail-safe
  -- direction, but the same person who is a beneficiary of two endowments remains two records with
  -- two edges, and nothing keeps them consistent. The TODO(surface) in `contract.ts` stays.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'beneficiary_waqfId_parentId_fkey'
  ) THEN
    ALTER TABLE "beneficiary"
      ADD CONSTRAINT "beneficiary_waqfId_parentId_fkey"
      FOREIGN KEY ("waqfId", "parentId") REFERENCES "beneficiary" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waqf_reversion_taker_waqfId_fkey'
  ) THEN
    ALTER TABLE "waqf_reversion_taker"
      ADD CONSTRAINT "waqf_reversion_taker_waqfId_fkey"
      FOREIGN KEY ("waqfId") REFERENCES "waqf" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waqf_reversion_taker_waqfId_beneficiaryId_fkey'
  ) THEN
    ALTER TABLE "waqf_reversion_taker"
      ADD CONSTRAINT "waqf_reversion_taker_waqfId_beneficiaryId_fkey"
      FOREIGN KEY ("waqfId", "beneficiaryId") REFERENCES "beneficiary" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.2 beneficiary — the MECHANICAL coherence of the lineage edge and the vital status
  --
  -- Every CHECK here is a rule about the SHAPE of a row, not a reading of a deed. The fiqh-adjacent
  -- rules (a خيري cohort's members, an ultimate taker's kind) are the ENGINE's and are deliberately
  -- absent — see this file's header.
  -- ─────────────────────────────────────────────────────────────────────────────────────────

  -- The engine's `LINEAGE_CYCLE`, closed at the row level. A one-row cycle is the only cycle a row
  -- CHECK can see; longer ones stay the engine's to refuse.
  PERFORM qmulate_add_check(
    'beneficiary',
    'beneficiary_no_self_parent',
    '"parentId" IS NULL OR "parentId" <> "id"'
  );

  -- A death is CERTIFIED by `deceasedAt`, and `active` is the flag the engine reads. A row asserting
  -- both is asserting that a living person died: R7-D1 turns on exactly this distinction, because an
  -- `active: false` placeholder is a SCOPE EXIT and cannot certify that a family died out.
  PERFORM qmulate_add_check(
    'beneficiary',
    'beneficiary_active_not_deceased',
    'NOT ("active" AND "deceasedAt" IS NOT NULL)'
  );

  -- Schema convention 2: a legally-significant date is DUAL, and half a pair is worse than neither
  -- (the frozen Hijri snapshot is what stops a display date shifting under a calendar-library
  -- update, so a missing twin silently re-derives it).
  PERFORM qmulate_add_check(
    'beneficiary',
    'beneficiary_deceased_dual_dated',
    '("deceasedAt" IS NULL) = ("deceasedAtHijri" IS NULL)'
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.3 waqf — the مآل clause's capture state must be internally coherent
  --
  -- The clause has three legitimate states and no fourth:
  --   captured = false, kind NULL            "nobody has read the deed's مآل clause yet"
  --   captured = true,  kind NULL            "the deed POSITIVELY records no ultimate taker"
  --   captured = true,  kind NOT NULL + date "the deed names an ultimate taker"
  -- The state these CHECKs make unrepresentable is "a kind recorded by nobody" — which would be a
  -- founder's condition with no reading behind it.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_reversion_kind_requires_capture',
    '"reversionKind" IS NULL OR "reversionClauseCaptured"'
  );
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_reversion_recorded_at_pairs_with_kind',
    '("reversionRecordedAt" IS NULL) = ("reversionKind" IS NULL)'
  );
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_reversion_recorded_dual_dated',
    '("reversionRecordedAt" IS NULL) = ("reversionRecordedAtHijri" IS NULL)'
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.4 trusteeship_deed — an eligibility record about NOBODY is unrepresentable
  --
  -- ⚠ THIS IS THE ONE-DIRECTIONAL RULE, AND THE BICONDITIONAL WAS WRONG. The first version of this
  -- constraint read `("authorizedRepName" IS NULL) = ("repIslam" IS NULL)` and so on for all four —
  -- i.e. a recorded representative MUST carry four booleans. It failed on the fixture (23514,
  -- measured: `trusteeship_deed` rows for waqf-001 and waqf-003 name a representative and carry no
  -- flags), and the failure was the constraint being wrong rather than the data:
  --
  --   ·  it would have forced this migration to INVENT four assertions about a representative's
  --      religion, capacity, removal history and residency — for a fictional person here, and for a
  --      real one on any database migrated later;
  --   ·  it would have made `ELIGIBILITY_NOT_ASSESSED` UNREACHABLE. The resolver's contract is that
  --      a required criterion arriving as `null` is a REFUSAL, never a pass — so "recorded rep,
  --      unassessed criterion" is a state the database must be able to hold and the engine must be
  --      able to refuse. A CHECK that forbids it does not improve the data; it pushes whoever is
  --      doing intake into typing a value they do not have.
  --
  -- What remains is the defect that was actually there: FOUR FLAGS ABOUT A REPRESENTATIVE WHO DOES
  -- NOT EXIST. Partial assessment stays legal, deliberately — intake learns these one at a time.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'trusteeship_deed',
    'trusteeship_deed_rep_eligibility_needs_a_rep',
    '"authorizedRepName" IS NOT NULL
       OR ("repIslam" IS NULL AND "repLegalCapacity" IS NULL
           AND "repNoDisqualifyingRemoval" IS NULL AND "repKsaResident" IS NULL)'
  );

  -- A verification event is a date AND an actor, dual-dated per convention 2. A verifiedAt with no
  -- verifiedBy is an unattributed verification, which is a claim again.
  PERFORM qmulate_add_check(
    'trusteeship_deed',
    'trusteeship_deed_eligibility_verification_complete',
    '("eligibilityVerifiedAt" IS NULL) = ("eligibilityVerifiedAtHijri" IS NULL)
       AND ("eligibilityVerifiedAt" IS NULL) = ("eligibilityVerifiedBy" IS NULL)'
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.5 approval_request — a reserved-matter KIND belongs only on a reserved matter
  --
  -- ⚠ THIS IS THE SAFE HALF, AND THE OTHER HALF IS DELIBERATELY NOT HERE. The CHECK this column
  -- wants is the BICONDITIONAL — `("type" = 'RESERVED_MATTER') = ("reservedMatterKind" IS NOT NULL)`
  -- — so that a reserved matter always says what it approves. It is NOT installed, because
  -- `packages/api`'s `approval.initiate` mints `RESERVED_MATTER` rows with no kind today,
  -- `settings.ts` sets `SETTING_CHANGE_APPROVAL_TYPE = 'RESERVED_MATTER'` for every routine settings
  -- change, and three integration files insert such rows raw. Landing the biconditional from
  -- `packages/database` alone would redden files this change does not own — the same reasoning
  -- migration 4 §3.4 gives for the `approval_request` hard-delete residue. REPORTED AS OWED; add it
  -- in one coordinated change once every minting path sets the field.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'approval_request',
    'approval_request_kind_only_on_reserved_matter',
    '"reservedMatterKind" IS NULL OR "type" = ''RESERVED_MATTER'''
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.6 THE TRIGGERS
  -- ─────────────────────────────────────────────────────────────────────────────────────────

  DROP TRIGGER IF EXISTS waqf_reversion_taker_no_mutate ON "waqf_reversion_taker";
  CREATE TRIGGER waqf_reversion_taker_no_mutate
    BEFORE UPDATE OR DELETE ON "waqf_reversion_taker"
    FOR EACH ROW EXECUTE FUNCTION qmulate_reversion_taker_no_mutate();

  -- TRUNCATE fires NO row triggers, so it walks past the guard above. Registered per table because
  -- that is the portable form, mirroring `document_no_truncate` and `waqf_no_truncate`.
  DROP TRIGGER IF EXISTS waqf_reversion_taker_no_truncate ON "waqf_reversion_taker";
  CREATE TRIGGER waqf_reversion_taker_no_truncate
    BEFORE TRUNCATE ON "waqf_reversion_taker"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();

  -- ⚠ UPDATE ONLY, AND THE VERB IS THE WHOLE POINT — narrowed after this file was measured.
  --
  -- The first version of this trigger was `reclassification_event_no_mutate` on
  -- `BEFORE UPDATE OR DELETE`, and it broke two things by covering a verb that was ALREADY covered:
  -- `reclassification_event_no_delete` has refused DELETE since **migration 6** (S2's per-table
  -- retention loop, `ENABLE ALWAYS`, carrying the hint a Nazir actually reads — "record a FURTHER
  -- reclassification event instead"). With DELETE guarded twice, `corpus-retention`'s MUTATION
  -- control — which suspends the ONE guard `RETENTION_SCAFFOLDING_GUARDS` names per table and then
  -- proves the delete succeeds — could no longer complete, and its constructed row could no longer
  -- be torn down, so the row LEAKED into the next file and broke `seed.integration`'s "history is
  -- empty" assertion. Two failures, one duplicated verb.
  --
  -- ⚠ And the harness could not have caught it: that census asserts every governed TABLE appears in
  -- the scaffolding list, not that every guarded VERB does — so a second guard on an already-guarded
  -- verb is invisible to it. Recorded rather than papered over; widening the census is a separate
  -- change and is NOT made here.
  --
  -- So DELETE stays migration 6's, TRUNCATE stays migration 6's (the earlier version of this file
  -- DROPped and re-CREATEd `reclassification_event_no_truncate`, silently replacing an S2 guard's
  -- body — and its hint — with the generic `qmulate_reject_truncate()`), and what E3 adds is the
  -- half that genuinely had nothing: UPDATE. The model has claimed "append-only, never edited"
  -- since Sprint 1 with NOTHING enforcing the edit half.
  DROP TRIGGER IF EXISTS reclassification_event_no_mutate ON "reclassification_event";
  DROP TRIGGER IF EXISTS reclassification_event_no_update ON "reclassification_event";
  CREATE TRIGGER reclassification_event_no_update
    BEFORE UPDATE ON "reclassification_event"
    FOR EACH ROW EXECUTE FUNCTION qmulate_reclassification_append_only();

  DROP TRIGGER IF EXISTS reclassification_event_from_matches_current ON "reclassification_event";
  CREATE TRIGGER reclassification_event_from_matches_current
    BEFORE INSERT ON "reclassification_event"
    FOR EACH ROW EXECUTE FUNCTION qmulate_reclassification_from_matches_current();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.7 ENABLE ALWAYS on every guard added here
  --
  -- A trigger created normally is `tgenabled = 'O'` and Postgres SKIPS it for a session that has
  -- done `SET LOCAL session_replication_role = 'replica'` — a plain `SET`, not DDL, which defeated
  -- gate G-1 outright during Sprint-1 adversarial review. Every guard in this repo gets
  -- `ENABLE ALWAYS` for that reason, and a new one that forgot it would be one `SET` from
  -- irrelevant. (`qmulate_shart_guard()` and `qmulate_asset_identity_guard()` are REPLACED bodies
  -- on triggers migrations 3/4/5 already registered `ENABLE ALWAYS`, so they inherit it — the
  -- assertion in section 5 proves that rather than assuming it.)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  ALTER TABLE "waqf_reversion_taker"   ENABLE ALWAYS TRIGGER waqf_reversion_taker_no_mutate;
  ALTER TABLE "waqf_reversion_taker"   ENABLE ALWAYS TRIGGER waqf_reversion_taker_no_truncate;
  ALTER TABLE "reclassification_event" ENABLE ALWAYS TRIGGER reclassification_event_no_update;
  ALTER TABLE "reclassification_event" ENABLE ALWAYS TRIGGER reclassification_event_from_matches_current;
  -- `reclassification_event_no_delete` and `_no_truncate` are migration 6's and were already
  -- `ENABLE ALWAYS` there; this file no longer touches either.
END;
$qm_apply_e3$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — GRANTS FOR THE RUNTIME ROLE
--
-- Since ADR-0008 round 6 the runtime role (`qmulate_app`) owns no table and is granted privileges
-- table by table. A NEW table with no grant is invisible to the application — which fails closed,
-- but as an outage. The privilege SHAPE mirrors `reclassification_event`'s: SELECT + INSERT and no
-- UPDATE/DELETE, because `waqf_reversion_taker` is append-only by design and the trigger above says
-- so independently. Guarded on the role existing, so this migration still applies to a legacy
-- database that predates privilege separation.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_app') THEN
    GRANT SELECT, INSERT ON TABLE "waqf_reversion_taker" TO qmulate_app;
    -- The ancestor walk is a READ. It is executable by the runtime role because
    -- `src/lineage.ts` is the sanctioned caller; it performs no authorization of its own, which is
    -- why that module's header requires an already-grant-verified caller and a named endowment.
    GRANT EXECUTE ON FUNCTION qmulate_beneficiary_ancestry(text, integer) TO qmulate_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_provisioner') THEN
    GRANT SELECT ON TABLE "waqf_reversion_taker" TO qmulate_provisioner;
  END IF;
END
$qm_e3_grants$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — APPLY
--
-- ⚠ ORDERING. This migration ALTERs tables it does not create and REPLACES two trigger function
-- bodies defined by migrations 4 and 5, so it must run after them. Prisma applies migration
-- directories in lexicographic order and `00000000000012_…` sorts last. A missing prerequisite
-- fails LOUDLY rather than skipping the guards: a database whose founder's conditions are editable
-- must never be mistaken for a healthy one.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'waqf', 'beneficiary', 'trusteeship_deed', 'approval_request', 'reclassification_event',
    'asset', 'waqf_reversion_taker'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 deed-terms migration ran BEFORE the tables it guards exist. Missing table(s): %.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_add_check(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 deed-terms migration ran BEFORE 00000000000001_init_append_only_audit, which '
      'defines qmulate_add_check().';
  END IF;

  -- The 3-ARGUMENT (artifact-bound) reserved-matter helper, from migration 4. The 2-argument
  -- overload was REMOVED there on purpose, so reaching for it here would resurrect the C-14 hole
  -- under a new name.
  IF to_regprocedure('qmulate_reserved_matter_defect(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 deed-terms migration ran BEFORE 00000000000004_e2_guard_gaps, which defines the '
      'artifact-bound qmulate_reserved_matter_defect(text,text,text). This migration REPLACES two '
      'of that migration''s trigger function bodies and must run after it.';
  END IF;

  IF to_regprocedure('qmulate_reject_truncate()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 deed-terms migration ran BEFORE 00000000000004_e2_guard_gaps, which defines '
      'qmulate_reject_truncate().';
  END IF;

  PERFORM qmulate_apply_e3_deed_terms();

  -- The two REPLACED bodies sit on triggers registered by earlier migrations. `CREATE OR REPLACE
  -- FUNCTION` does not touch a trigger's `tgenabled`, so they should still be `ENABLE ALWAYS` — but
  -- "should" is what this repo keeps being bitten by, so it is asserted rather than assumed. A
  -- trigger at `tgenabled = 'O'` is one `SET session_replication_role = 'replica'` from irrelevant.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('waqf_shart_immutable', 'asset_identity_guard')
       AND NOT tgisinternal
       AND tgenabled <> 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3: waqf_shart_immutable and/or asset_identity_guard is not ENABLE ALWAYS after this '
      'migration replaced its function body. A guard at tgenabled = ''O'' is skipped by any session '
      'that has run SET session_replication_role = ''replica'', which is a plain SET, not DDL.';
  END IF;
END
$qm_apply$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6 · EXECUTE IS REVOKED FROM PUBLIC ON THE FIVE FUNCTIONS THIS FILE CREATES
--
-- ⚠ THIS SECTION EXISTS BECAUSE THE ASSERTION CAUGHT IT, ON A FRESH DATABASE, DETERMINISTICALLY.
-- MEASURED before this block existed — `qmulate_assert_privilege_separation()` reported five
-- functions granting EXECUTE to PUBLIC immediately after `migrate deploy` on an empty cluster:
--
--     qmulate_apply_e3_deed_terms, qmulate_beneficiary_ancestry,
--     qmulate_reclassification_append_only, qmulate_reclassification_from_matches_current,
--     qmulate_reversion_taker_no_mutate
--
-- so `authorization-plane-privilege.integration.test.ts` assertion **1f** failed — the assertion
-- migration 10 §2.4 wrote and said in terms must exist "BEFORE the first SECURITY DEFINER function
-- does, not after". It worked exactly as designed: a new migration created functions and the
-- posture census refused to call the database healthy.
--
-- ⚠ WHY MIGRATION 10's `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM
-- PUBLIC` DID NOT COVER THEM IS **NOT ESTABLISHED**. That statement carries no `FOR ROLE`, so it
-- binds objects created by the role that ran it, and both migrations are applied through
-- `MIGRATOR_DATABASE_URL` — which should have been the same role. It was not, in effect, and the
-- reason is an open question rather than a diagnosis dressed up as one. It is recorded here because
-- the NEXT migration to add a function will inherit the same surprise, and because a subsequent
-- `scripts/provision-db-roles.ts` run masks it (its blanket revoke cleans the posture, which is why
-- this failed only on the FIRST suite run after a fresh migrate and looked intermittent for hours).
--
-- The remedy is migration 10's own idiom, applied explicitly rather than trusted to a default:
-- revoke from PUBLIC, then grant EXECUTE back only where a role actually calls the function. None of
-- the five is `SECURITY DEFINER`, so nothing here is a live escalation today — the point is that the
-- INVARIANT is "PUBLIC executes nothing in schema public", and an exception kept for being currently
-- harmless is how the first SECURITY DEFINER function slips through.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠ ROOT CAUSE, MEASURED ON POSTGRESQL 17.10 — and it is NOT "migration 10 forgot a line".
-- Migration 10 §2.4 ran BOTH of these, in this order:
--
--     REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;          -- worked, one-time
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--
-- The second statement DOES NOTHING HERE, and the experiment is reproducible in four lines as
-- `qmulate_owner` (the role that applies every migration):
--
--     pg_default_acl rows before                                        = 0
--     after `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC`    = 0   ← no row stored
--     a function created next                                           = proacl NULL (PUBLIC!)
--     after `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE … TO PUBLIC`       = 1   ← a row appears
--
-- `ALTER DEFAULT PRIVILEGES … REVOKE` only DELETES an explicit `pg_default_acl` row. With no row
-- present it stores nothing, and "no row" means the BUILT-IN default — which for FUNCTIONS grants
-- EXECUTE to PUBLIC. Identical behaviour whether the statement is bare or inside a plpgsql `DO`
-- block, so plpgsql is not involved. Consequence, stated plainly: **migration 10's protection for
-- FUTURE functions never held from the day it shipped.** Its one-time sweep is why the 39 functions
-- that existed then are clean, and every function added by any migration since would have been
-- PUBLIC-executable. E3 is simply the first migration since to add one.
--
-- So the remedy is NOT to hand-list this file's five functions — that leaves the NEXT migration with
-- the same trap. It is a REUSABLE SWEEP, called at the end of every migration that adds a function,
-- plus a test that pins the environment fact so nobody re-introduces a reliance on the default.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_revoke_public_function_execute()
RETURNS text
LANGUAGE plpgsql
AS $qm_revoke_public$
DECLARE
  rec       record;
  swept     int := 0;
  has_app   boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_app');
  has_prov  boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_provisioner');
BEGIN
  -- ⚠ CALL THIS AT THE END OF ANY MIGRATION THAT CREATES A FUNCTION IN SCHEMA public.
  -- `ALTER DEFAULT PRIVILEGES` cannot do it (see the block above), so this is the only mechanism
  -- that holds. It is idempotent and safe to call when nothing needs sweeping.
  --
  -- Policy, unchanged from migration 10 §2.4: PUBLIC executes NOTHING; EXECUTE is granted back only
  -- on `SECURITY INVOKER` functions (`prosecdef = false`), which run as the caller and therefore
  -- confer nothing. A `SECURITY DEFINER` function is left with NO grant at all — if one is ever
  -- needed, it must be granted deliberately, by name, in the migration that introduces it, and the
  -- posture assertion (1f) will be what forces that conversation.
  FOR rec IN
    SELECT p.oid::regprocedure AS sig, p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proacl IS NULL OR array_to_string(p.proacl, ',') ~ '(^|,)=X')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', rec.sig);
    IF NOT rec.prosecdef THEN
      IF has_app  THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO qmulate_app', rec.sig); END IF;
      IF has_prov THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO qmulate_provisioner', rec.sig); END IF;
    END IF;
    swept := swept + 1;
  END LOOP;

  RETURN format('qmulate_revoke_public_function_execute: %s function(s) swept', swept);
END
$qm_revoke_public$;

SELECT qmulate_revoke_public_function_execute();

-- And the sweep function itself was PUBLIC-executable for the instant between its CREATE and the
-- SELECT above — it sweeps itself, but only because it happens to run after itself. Belt and braces,
-- explicit, and it also documents that the sweep is not magic:
REVOKE EXECUTE ON FUNCTION qmulate_revoke_public_function_execute() FROM PUBLIC;

DO $qm_e3_grant$
BEGIN
  -- The ancestor walk is queried BY THE APP ROLE (the R-FRONTIER / R7-d entitlement path reads it),
  -- so it needs an explicit grant that survives the sweep. Trigger functions do not: Postgres
  -- invokes those through the trigger, never through the caller's privileges.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_app') THEN
    GRANT EXECUTE ON FUNCTION qmulate_beneficiary_ancestry(text, integer) TO qmulate_app;
  END IF;
END
$qm_e3_grant$;
