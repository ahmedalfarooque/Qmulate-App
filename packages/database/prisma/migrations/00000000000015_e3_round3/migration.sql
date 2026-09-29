-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E3 ROUND 3: THE BIRTH ARM LEARNS THE SECOND COLUMN. A CORPUS PARCEL MAY NOT BE
--                       BORN ALREADY RETIRED.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     WIDENING A GUARD TO `BEFORE INSERT` IS NOT THE SAME AS TEACHING THE INSERT ARM EVERY
--     COLUMN THE UPDATE ARM GATES — AND A COLUMN LEFT OUT OF THE BIRTH IS THE WHOLE GATE MADE
--     OPTIONAL FOR ANYONE WHO CAN CREATE A ROW.
--
-- ── WHAT THIS MIGRATION LANDS, AND THE MEASUREMENT THAT JUSTIFIES IT ──────────────────────────
--
--   AV3-03 (MEDIUM, the AV-5 shape ONE COLUMN OVER) · A CORPUS PARCEL COULD BE **BORN** ALREADY
--   SOFT-RETIRED. Migration 14 widened `asset_identity_guard` to `BEFORE INSERT OR UPDATE` and gave
--   the new INSERT arm exactly ONE question — the `status`. `deletedAt`, which the SAME migration
--   made a reserved matter on UPDATE (§1c, AV-4), was left to the UPDATE arm alone, and its own
--   comment said so out loud: *"Nothing else on INSERT. `titleDeedNumber`, `waqfId` and `deletedAt`
--   are all questions about a CHANGE to an existing parcel."* That is true of the first two and
--   FALSE of the third: a row can be born carrying a non-NULL `deletedAt`, and the parcel is then
--   retired from every register a Nazir reads without any approval ever existing.
--
--   MEASURED BEFORE, as the LEAST-privileged runtime role `qmulate_app`, with no approval in
--   session, on a pristine `--reset` → `migrate deploy` → `db:seed` database (migration 14 applied),
--   each probe inside a `DO` block that always raises so nothing committed:
--
--     COMMITS   INSERT INTO "asset" (… "status", "deletedAt")
--               VALUES (…, 'ACTIVE', now())                       ← born retired, ungated
--     REFUSED   UPDATE "asset" SET "deletedAt" = now() WHERE "id" = 'asset-005'
--               SQLSTATE 42501 … 'changing "deletedAt" (NULL -> …) is a RESERVED MATTER'
--
--   The identical act — a corpus parcel leaving the register — refused as a transition and committed
--   as a birth. That is C-10's shape for the third time in this sprint (a distribution BORN
--   `EXECUTED`; an asset BORN `EXPROPRIATED`; now an asset BORN retired), and the reason it survived
--   round 2 is instructive: the round-2 widening was verified by a VERB census, and a verb census
--   cannot see which COLUMNS the new arm actually asks about.
--
-- ── WHAT THIS FILE DELIBERATELY DOES *NOT* DO ────────────────────────────────────────────────
--
--   ·  IT DOES NOT DECIDE WHETHER A SOFT-RETIREMENT IS ALWAYS A RESERVED MATTER. It carries
--      migration 14 §1c's `TODO(surface)` FORWARD, unchanged and now on both arms. Whether every
--      retirement of a corpus parcel is reserved — or only those that are disposals in substance
--      (a parcel fully expropriated and gone, retired as bookkeeping once the expropriation itself
--      was approved) — is the PRODUCT OWNER'S call, not engineering's. The fail-safe direction is
--      taken because engineering cannot tell the two apart from a Boolean: this gate REFUSES A
--      ROUTE, it disposes of nothing, and the approval it asks for is the same one the disposal
--      already needed.
--
--   ·  IT DOES NOT GATE `titleDeedNumber` OR `waqfId` ON INSERT, and that is not an oversight.
--      Both are questions about a CHANGE: on a birth there is no prior parcel whose identity could
--      be substituted, and demanding a reserved matter for the title deed of every asset ever
--      created is the kind of guard that gets switched off within a week (migration 14's own
--      reasoning for the `TG_OP` branch). `waqfId` is likewise the birth fact itself — the row is
--      created against an endowment, it does not MOVE to one. The route by which a NEW row could
--      replace an EXISTING parcel is DELETE + re-INSERT, and that is closed from the other side by
--      `asset_no_delete` / `asset_no_truncate` (migration 6).
--
--   ·  IT ADDS NO TABLE, NO COLUMN, NO TYPE AND NO CONSTRAINT. It replaces ONE trigger-function
--      body. The trigger itself is already `BEFORE INSERT OR UPDATE` and already `ENABLE ALWAYS`
--      (migration 14 §2.1/§2.2); §2 below ASSERTS both from the live catalogue rather than assuming
--      them, because a body that gained an INSERT arm while the trigger lost its `I` would be a
--      guard whose source reads correct and whose behaviour is not.
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase and are
-- therefore DOUBLE-QUOTED everywhere — an unquoted identifier is folded to lower case by Postgres
-- and would silently not match.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────
-- Re-runnable end to end: one `CREATE OR REPLACE FUNCTION` and one read-only verification block.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- This file registers NO trigger, so it adds no step to the re-apply sequence. After any schema
-- change that recreates a guarded table, re-apply EVERY guard set, in order:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
--     SELECT qmulate_apply_e2_grant_admission();
--     SELECT qmulate_apply_e3_deed_terms();
--     SELECT qmulate_apply_e3_closeout();
--     SELECT qmulate_apply_e3_closeout_round2();
-- …and this file's function body is carried by `CREATE OR REPLACE`, so re-running the migration is
-- the way to restore it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — qmulate_asset_identity_guard(), WITH THE BIRTH ARM'S SECOND COLUMN
--
-- REPLACES migration 14 §1b's body. EVERY existing arm is carried over VERBATIM — the INSERT status
-- gate, the ADR-0004 halt branch on both arms, `titleDeedNumber`, the outright `waqfId` refusal, the
-- UPDATE-side `deletedAt` gate and BR-306. ONE block is added, in the INSERT arm, and one comment
-- that was false is corrected.
--
-- ⚠ A REPLACEMENT IS EXACTLY WHEN A GUARD DISAPPEARS. This body has now been replaced four times
-- (migrations 5 → 12 → 13 → 14 → 15) and each replacement is a chance to drop an arm nobody is
-- watching. Every arm below is covered by a behavioural test in
-- `packages/database/test/e3-deed-term-guards.integration.test.ts`, and the ones this round added
-- are mutation-verified against THIS body rather than against the trigger's verb.
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
  -- ── (0) INSERT: AN ASSET MAY NOT BE **BORN** IN A RESERVED STATE (V1 / AV-5) ────────────────
  --
  -- MEASURED BEFORE MIGRATION 14, as `qmulate_app` with no approval in session, both COMMITTED:
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

    -- ── (0b) INSERT: NOR MAY IT BE **BORN ALREADY RETIRED** (AV3-03) ─────────────────────────
    --
    -- MEASURED BEFORE, as `qmulate_app` with no approval in session, on a database with migration
    -- 14 applied:
    --   COMMITS  INSERT INTO "asset" (… "status", "deletedAt") VALUES (…, 'ACTIVE', now())
    --   REFUSED  UPDATE "asset" SET "deletedAt" = now() WHERE "id" = 'asset-005'   (42501)
    --
    -- §1c below calls `deletedAt` "the only legal retirement of a corpus parcel" and gates it as a
    -- reserved matter, because `asset_no_delete` refuses the hard DELETE and points here. A row born
    -- with the column already set walks around that gate completely: the parcel never appears in any
    -- register the Nazir, the classification bands (BR-104's SAR 200M / 50M thresholds — ⚠ verify,
    -- may be stale, confirm vs primary law) or the Authority report read from, and no approval, no
    -- audit event and no `Expropriation` row ever existed for it. In substance the endowment is
    -- recorded as never having held a parcel it did hold.
    --
    -- ⚠ TODO(surface) — SCOPE, ENGINEERING'S FAIL-SAFE READING, NOT THE OWNER'S RULING. CARRIED
    -- FORWARD FROM MIGRATION 14 §1c, UNCHANGED, AND NOW TRUE OF BOTH ARMS. Whether EVERY retirement
    -- of a corpus parcel is a reserved matter is the PRODUCT OWNER'S call. A parcel that was fully
    -- expropriated and no longer exists is arguably retired as bookkeeping once the expropriation
    -- itself has been approved; a parcel retired for any other reason is a disposal in all but name.
    -- Engineering cannot tell those apart from a Boolean, so the FAIL-SAFE direction is taken: gate
    -- both. It refuses a route; it disposes of nothing, and the approval it asks for is the same one
    -- the disposal already needed.
    --
    -- ⚠ THE TRANSCRIPTION ROUTE IS UNCHANGED AND IS BETTER, exactly as for the status: create the
    -- parcel LIVE, then retire it as the ACT it was, through the gate that also produces the audit
    -- event. An intake of an endowment whose parcel was disposed of decades ago is still fully
    -- recordable; what is refused is recording the disposal as though it never had a moment.
    IF NEW."deletedAt" IS NOT NULL THEN
      defect := qmulate_reserved_matter_defect(
        approval, NEW."waqfId", 'asset:' || NEW."id" || ':deletedAt'
      );
      IF defect IS NOT NULL THEN
        RAISE EXCEPTION
          'asset %: an asset may not be CREATED already RETIRED ("deletedAt" = % on INSERT). '
          'Soft-retiring a corpus parcel is a RESERVED MATTER on UPDATE (migration 14 §1c) because '
          '`asset_no_delete` refuses the hard DELETE and names this column as the only legal '
          'retirement — so a row BORN with it set walks around that gate entirely, and the parcel '
          'leaves every register the Nazir and the Authority report read from with no approval, no '
          'audit event and no Expropriation row behind it (AV3-03, the AV-5 shape one column over). '
          '%. ⚠ TRANSCRIBING HISTORY IS STILL POSSIBLE AND IS THE INTENDED ROUTE: create the parcel '
          'LIVE ("deletedAt" NULL), then record the retirement as the ACT it was, through '
          'withReservedMatter(). The subject an approval must name is "asset:%:deletedAt". '
          '⚠ TODO(surface): whether EVERY retirement is reserved — as opposed to only those that are '
          'disposals in substance — is the PRODUCT OWNER''S call, not engineering''s. This gate is '
          'the fail-safe reading and refuses a route rather than disposing of anything.',
          NEW."id", NEW."deletedAt", defect, NEW."id"
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Nothing else on INSERT, and the two omissions are DELIBERATE — see this file's header.
    -- `titleDeedNumber` and `waqfId` are questions about a CHANGE to an existing parcel: on a birth
    -- there is no prior identity to substitute and no endowment the parcel MOVES from. The create
    -- itself is governed by `DOMAIN_WRITE_POLICIES` and `packages/api`'s procedure ladder, and the
    -- DELETE + re-INSERT route by which a new row could stand in for an old one is closed by
    -- `asset_no_delete` / `asset_no_truncate`.
    RETURN NEW;
  END IF;

  -- ═════════════════════════════════ UPDATE FROM HERE ═════════════════════════════════════════

  -- ── (1) THE CORPUS ASSET'S LEGAL IDENTITY — unchanged from migration 5 / 12 / 13 / 14 ───────
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
  -- MEASURED BEFORE MIGRATION 14, as `qmulate_app` with no approval in session:
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
  --
  -- ⚠ UNTESTED UNTIL ROUND 3 (AV3-04). The refusal shipped in migration 14 with no behavioural test
  -- at all: it was verified by reading the SQL. `e3-deed-term-guards.integration.test.ts` now probes
  -- it on both connections, under `session_replication_role = 'replica'`, and with a genuine
  -- reserved-matter approval in session (which must NOT open it) — and mutation-verifies that
  -- deleting this branch turns those tests red.
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
  -- MEASURED BEFORE MIGRATION 14, as `qmulate_app` with no approval in session:
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
  --
  -- ⚠ AND SINCE THIS MIGRATION THE BIRTH IS GATED TOO — see (0b). Gating a transition while leaving
  -- the birth open is the defect this whole sprint keeps re-finding.
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
    -- 12/13/14: it disposes of nothing, and gating it would make a mis-keyed status permanently
    -- un-correctable. The ledger consequences of the act itself are E5's and are not undone by a
    -- status change.
  END IF;

  RETURN NEW;
END;
$qm_asset_identity$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — WHAT THIS BODY RELIES ON IS ASSERTED, NOT ASSUMED (ADR-0008 §2.4)
--
-- This file adds an INSERT arm to a FUNCTION. That arm is dead code unless the TRIGGER still fires
-- on INSERT and is still `ENABLE ALWAYS` — two facts owned by migration 14, in another file, which
-- `CREATE OR REPLACE FUNCTION` does not touch and therefore cannot guarantee. A reliance that is
-- not asserted is a reliance that silently lapses, and "the source reads correct while the
-- behaviour is not" is precisely the failure this sprint keeps paying for.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3r3_verify$
BEGIN
  IF to_regclass('public."asset"') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3 ran BEFORE the "asset" table exists.';
  END IF;

  IF to_regprocedure('qmulate_apply_e3_closeout_round2()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3 ran BEFORE 00000000000014_e3_closeout_round2, which is what widened '
      'asset_identity_guard to BEFORE INSERT OR UPDATE. Without that widening the INSERT arm this '
      'file adds would never fire.';
  END IF;

  -- `tgtype` bit 2 (value 4) = INSERT, bit 4 (value 16) = UPDATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'asset_identity_guard' AND NOT tgisinternal
       AND (tgtype & 4) > 0 AND (tgtype & 16) > 0
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3: asset_identity_guard does not fire on BOTH INSERT and UPDATE. The '
      '"deletedAt" birth gate this migration adds lives in the INSERT arm of the function body, so '
      'without the I it is unreachable code and a corpus parcel can still be BORN already retired '
      '(AV3-03) — which is the whole reason this file exists.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'asset_identity_guard' AND NOT tgisinternal AND tgenabled <> 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3: asset_identity_guard is not ENABLE ALWAYS. A guard at tgenabled = ''O'' '
      'is skipped by any session that has run SET session_replication_role = ''replica'' — one plain '
      'SET, not DDL, and the Sprint-1 finding that defeated gate G-1 outright.';
  END IF;

  -- The hard-DELETE side of the same column's story. `deletedAt` is only "the ONLY legal retirement"
  -- while the hard DELETE is refused; if `asset_no_delete` ever went away, gating `deletedAt` would
  -- be guarding the front door of a building with no back wall.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('asset_no_delete', 'asset_no_truncate') AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3: asset_no_delete / asset_no_truncate are missing. This migration gates the '
      'SOFT retirement on the express premise that the HARD one is refused (migration 6).';
  END IF;

  IF to_regprocedure('qmulate_reserved_matter_defect(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3: qmulate_reserved_matter_defect(text,text,text) is missing. Both birth '
      'gates in §1 call it to decide whether an approval is APPROVED, maker <> checker, for THIS '
      'endowment AND for THIS artifact.';
  END IF;
END
$qm_e3r3_verify$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — GRANTS FOR THE RUNTIME ROLE
--
-- None. This file creates no TABLE, no TYPE and no column; it replaces ONE trigger-function body.
-- Trigger functions need no EXECUTE grant — Postgres invokes those through the trigger, never
-- through the caller's privileges.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- ⚠ MANDATORY IN EVERY MIGRATION THAT ADDS A FUNCTION, AND A **REPLACED** BODY IS NOT EXEMPT.
-- Migration 10 §2.4 ran
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- and its claim that "the default for FUTURE functions is revoked too" WAS FALSE FROM THE DAY IT
-- SHIPPED — measured on PostgreSQL 17.10 as `qmulate_owner`: `ALTER DEFAULT PRIVILEGES … REVOKE`
-- only DELETES an explicit `pg_default_acl` row, and with no row present it stores nothing, which
-- leaves the BUILT-IN default — and the built-in default for FUNCTIONS grants EXECUTE to PUBLIC.
--
-- `CREATE OR REPLACE FUNCTION` preserves an existing `proacl`, but on a database where the function
-- is being created for the first time (a fresh `--reset`, which is what CI runs) it is a CREATE, and
-- a CREATE takes the PUBLIC default. The sweep is REUSABLE and idempotent by design (migration 12
-- §6); hand-listing this file's function would leave migration 16 in the same trap.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e3r3_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E3 round 3: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function — ALTER DEFAULT PRIVILEGES does not protect future '
      'functions on this Postgres (measured, 17.10). Without it this migration would leave a '
      'PUBLIC-executable function behind and assertion 1f would fail.';
  END IF;
END
$qm_e3r3_sweep$;

SELECT qmulate_revoke_public_function_execute();
