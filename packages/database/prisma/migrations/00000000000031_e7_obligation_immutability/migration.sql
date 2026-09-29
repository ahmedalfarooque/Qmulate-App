-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 31 — E7 / S8-Q5 · THE OBLIGATION LIBRARY BECOMES EVIDENCE
--
-- **Owner ruling, 2026-08-23, verbatim selection: "Ship it in E7 (Recommended)."**
-- Recorded in the memo's S8 addendum, committed RECORD-ONLY as `b662197` before this file cites it.
--
-- ── THE CLAIM §09 MAKES AND THE DATABASE DID NOT KEEP ────────────────────────────────────────
-- §09 Engine A: *"Each `ObligationTemplate` is immutable within a library version; changing an
-- obligation means publishing a new version, never mutating a shipped row (so historical tasks always
-- trace to the exact text that governed them)."*
--
-- Nothing implemented any part of that. Measured before this file:
--   · no `libraryVersion` column at all, so "within a version" had nowhere to live;
--   · NO UPDATE GUARD on `compliance_obligation` — every content column was freely rewritable by the
--     application role, so the text governing a duty could change under the tasks recording it;
--   · `ComplianceTask` carried only a cuid FK, so the code and version that governed a task were not
--     ON the task — they were wherever the parent row had drifted to;
--   · and migration 16's own census measured `UPDATE "compliance_obligation" SET "id" = …` COMMITTING
--     as `qmulate_app`. An obligation could be RENAMED ONTO ANOTHER OBLIGATION'S IDENTITY, silently
--     re-writing what every task pointing at it recorded.
--
-- A compliance register whose obligations are mutable is not evidence of what was owed. It is a
-- current opinion about what is owed, with a history-shaped table.
--
-- ── WHAT "IMMUTABLE WITHIN A VERSION" MEANS AS A CONSTRAINT ──────────────────────────────────
-- A version is a ROW, not a column value that gets bumped in place. So:
--   · `UNIQUE (code)` becomes `UNIQUE (code, libraryVersion)` — the same obligation at two versions
--     is two rows, which is what lets an old task keep pointing at the text that governed it;
--   · every CONTENT column is refused on UPDATE (§2). Publishing a correction is an INSERT;
--   · `id` joins the `*_id_immutable` family (§4), because a guard on the content columns is worth
--     nothing if the row's identity can be moved onto another row's.
--
-- ⚠ `deletedAt` IS DELIBERATELY LEFT UPDATEABLE, and this is a decision rather than an omission.
-- Retiring an obligation is the sanctioned way to take one out of service (migration 8's guard exists
-- precisely to force soft-delete over DELETE), so refusing it here would leave the table with no
-- retirement path at all — migration 5 §2f's rule: "a guard nobody can satisfy is a guard that gets
-- deleted." ⚠ It is therefore ALSO not reserved-matter gated, unlike `waqf`/`asset`/`transaction`/
-- `distribution`. Whether retiring an OBLIGATION TEMPLATE — a global row that changes what every
-- endowment owes — deserves the Q8/AV7-F4 gate has never been put to the owner. **Surfaced, not
-- assumed:** it is engineering's reading that a template retirement is closer to catalogue
-- maintenance than to retiring an endowment's record, and that reading is flagged, not settled.
--
-- ── BACKFILL: THE TEN SEEDED ROWS ARE PLACEHOLDERS AND SAY SO ────────────────────────────────
-- `compliance_obligation`'s existing rows are DERIVED BACKWARDS from fixture task instances, one per
-- task, with `SEED-`-namespaced codes. They are not a published library version and must not be
-- labelled as one, so they backfill to `'fixture-derived'` — a value that reads as what it is. When
-- the canonical §09 library is seeded (`packages/domain/src/compliance/catalogue.ts`, version
-- `2026-08-20.1`) it arrives as new rows alongside these, not as an edit to them, which is the whole
-- point of the constraint this file installs.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — COLUMNS, BACKFILL, AND THE VERSIONED UNIQUE KEY
-- ═══════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "compliance_obligation"
  ADD COLUMN IF NOT EXISTS "libraryVersion" TEXT;

UPDATE "compliance_obligation"
   SET "libraryVersion" = 'fixture-derived'
 WHERE "libraryVersion" IS NULL;

ALTER TABLE "compliance_obligation"
  ALTER COLUMN "libraryVersion" SET NOT NULL;

-- THE FROZEN SNAPSHOT ON THE TASK (§09's `templateCode` + `templateVersion`).
--
-- ⚠ Backfilled from the JOIN and then never allowed to move again (§3). The FK stays — it is what
-- makes a task's obligation reachable — but the FK alone was the defect: it names a ROW, and a row's
-- content was mutable. These two columns are what make the task carry the identity of the duty it
-- recorded, so a later correction to the catalogue cannot rewrite history by reference.
ALTER TABLE "compliance_task"
  ADD COLUMN IF NOT EXISTS "templateCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "templateVersion" TEXT;

UPDATE "compliance_task" t
   SET "templateCode"    = o."code",
       "templateVersion" = o."libraryVersion"
  FROM "compliance_obligation" o
 WHERE o."id" = t."obligationId"
   AND (t."templateCode" IS NULL OR t."templateVersion" IS NULL);

-- FAIL LOUDLY rather than leaving a half-frozen register: a task whose snapshot could not be resolved
-- means its obligation row is gone, which the FK should make impossible — so if it happens, the
-- assumption is wrong and this migration must not proceed.
DO $qm_e7_snapshot_check$
DECLARE
  orphans integer;
BEGIN
  SELECT count(*) INTO orphans
    FROM "compliance_task"
   WHERE "templateCode" IS NULL OR "templateVersion" IS NULL;

  IF orphans > 0 THEN
    RAISE EXCEPTION
      'QMULATE E7 S8-Q5: % compliance_task row(s) could not be given a frozen template snapshot, '
      'which means their obligationId names no obligation — a state the foreign key should make '
      'impossible. Investigate before re-running; do NOT relax the NOT NULL below.',
      orphans;
  END IF;
END
$qm_e7_snapshot_check$;

ALTER TABLE "compliance_task"
  ALTER COLUMN "templateCode"    SET NOT NULL,
  ALTER COLUMN "templateVersion" SET NOT NULL;

-- ── THE VERSIONED UNIQUE KEY ────────────────────────────────────────────────────────────────
-- `UNIQUE (code)` made two versions of one obligation impossible to store, which made §09's
-- "publish a new version" instruction impossible to follow. Dropped and replaced.
--
-- ⚠ The index name Prisma generates for `@@unique([code, libraryVersion])` is
-- `compliance_obligation_code_libraryVersion_key`; created explicitly so this migration is the record
-- of the change rather than a `prisma db push` artefact.
-- ⚠ IT IS AN INDEX, NOT A TABLE CONSTRAINT, and that distinction cost a bug worth recording.
-- Prisma's init migration wrote `CREATE UNIQUE INDEX "compliance_obligation_code_key"` (init:857), not
-- `ADD CONSTRAINT`. The first draft of this section did `ALTER TABLE … DROP CONSTRAINT` guarded on a
-- `pg_constraint` lookup — so the DROP found nothing, the guard reported nothing, and §5's
-- verification checked `pg_constraint` too and was blind in exactly the same way. Two checks, one
-- blind spot, which is the "three layers reading one table are ONE layer" lesson in miniature.
--
-- The test caught it: publishing a second version failed with `23505 Key (code)=(SEED-FIN-01) already
-- exists` — a single-column key that was supposed to be gone. Both forms are dropped now, and §5 looks
-- in `pg_class` where an index actually lives.
DO $qm_e7_unique$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_obligation_code_key') THEN
    ALTER TABLE "compliance_obligation" DROP CONSTRAINT "compliance_obligation_code_key";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'compliance_obligation_code_key' AND c.relkind = 'i' AND n.nspname = 'public'
  ) THEN
    DROP INDEX "compliance_obligation_code_key";
  END IF;
END
$qm_e7_unique$;

CREATE UNIQUE INDEX IF NOT EXISTS "compliance_obligation_code_libraryVersion_key"
  ON "compliance_obligation" ("code", "libraryVersion");


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TEMPLATES ARE IMMUTABLE WITHIN A VERSION
--
-- Refuses an UPDATE that changes any CONTENT column. `updatedAt` and `deletedAt` are permitted (see
-- the header for why `deletedAt` is, and what that leaves open).
--
-- ⚠ The refusal names the REMEDY — publish a new version — because a refusal that states only the
-- prohibition gets the guard deleted by the next person who hits it. That is migration 6's stated
-- reason for passing the retirement instruction into its trigger, and it applies here identically.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_obligation_template_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_obligation_immutable$
DECLARE
  changed text[] := ARRAY[]::text[];
BEGIN
  IF NEW."code"            IS DISTINCT FROM OLD."code"            THEN changed := array_append(changed, 'code');            END IF;
  IF NEW."libraryVersion"  IS DISTINCT FROM OLD."libraryVersion"  THEN changed := array_append(changed, 'libraryVersion');  END IF;
  IF NEW."section"         IS DISTINCT FROM OLD."section"         THEN changed := array_append(changed, 'section');         END IF;
  IF NEW."workstreamAr"    IS DISTINCT FROM OLD."workstreamAr"    THEN changed := array_append(changed, 'workstreamAr');    END IF;
  IF NEW."workstreamEn"    IS DISTINCT FROM OLD."workstreamEn"    THEN changed := array_append(changed, 'workstreamEn');    END IF;
  IF NEW."titleAr"         IS DISTINCT FROM OLD."titleAr"         THEN changed := array_append(changed, 'titleAr');         END IF;
  IF NEW."titleEn"         IS DISTINCT FROM OLD."titleEn"         THEN changed := array_append(changed, 'titleEn');         END IF;
  IF NEW."gate"            IS DISTINCT FROM OLD."gate"            THEN changed := array_append(changed, 'gate');            END IF;
  IF NEW."deadlineRuleKey" IS DISTINCT FROM OLD."deadlineRuleKey" THEN changed := array_append(changed, 'deadlineRuleKey'); END IF;

  IF array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'UPDATE on "compliance_obligation" is refused: % (row %, code %, version %). An obligation '
    'TEMPLATE is IMMUTABLE WITHIN A LIBRARY VERSION (§09 Engine A; product owner S8-Q5, 2026-08-23). '
    'Every "compliance_task" naming this row records that a duty applied, and the text of the duty is '
    'the evidence of WHAT applied — editing it in place rewrites history by reference, for every task, '
    'silently. THE REMEDY: publish a NEW VERSION. INSERT a row with the same "code" and a new '
    '"libraryVersion" (UNIQUE is on the pair, so both coexist), and let new tasks snapshot the new '
    'version while old tasks keep pointing at the text that governed them. To take this obligation out '
    'of service instead, set "deletedAt". Neither "updatedAt" nor "deletedAt" is refused here.',
    array_to_string(changed, ', '), OLD."id", OLD."code", OLD."libraryVersion"
    USING ERRCODE = '42501';
  RETURN NULL;
END
$qm_obligation_immutable$;

DROP TRIGGER IF EXISTS "compliance_obligation_template_immutable" ON "compliance_obligation";
CREATE TRIGGER "compliance_obligation_template_immutable"
  BEFORE UPDATE ON "compliance_obligation"
  FOR EACH ROW EXECUTE FUNCTION qmulate_obligation_template_immutable();
ALTER TABLE "compliance_obligation"
  ENABLE ALWAYS TRIGGER "compliance_obligation_template_immutable";


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE TASK'S SNAPSHOT IS FROZEN
--
-- A snapshot that can be updated is not a snapshot. Refuses any change to `templateCode` or
-- `templateVersion` on a task — including a "correction", because a task's snapshot IS the record of
-- which duty it discharged and re-pointing it at a different one is the same rewrite §2 refuses,
-- reached from the other end.
--
-- ⚠ `obligationId` is deliberately NOT frozen here. It is an FK and its integrity is the FK's job;
-- the columns that carry the MEANING are the two frozen ones. Freezing the FK as well would refuse a
-- legitimate re-parent during a data repair while adding nothing, since the snapshot already pins
-- what was recorded.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_task_snapshot_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_task_snapshot$
BEGIN
  IF NEW."templateCode" IS DISTINCT FROM OLD."templateCode"
     OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion" THEN
    RAISE EXCEPTION
      'UPDATE on "compliance_task" is refused: "templateCode"/"templateVersion" are a FROZEN SNAPSHOT '
      '(row %, %@% -> %@%). They record WHICH obligation, at WHICH library version, this task '
      'discharged — §09 Engine A, product owner S8-Q5. A snapshot that can be updated is not a '
      'snapshot: re-pointing it rewrites what the register says was owed, which is the same edit the '
      'template guard refuses, reached from the other end. If this task was instantiated against the '
      'wrong obligation, RETIRE it (set "status" = ''RETIRED'' or "deletedAt") and instantiate a new '
      'one — the history of the mistake is part of the record.',
      OLD."id", OLD."templateCode", OLD."templateVersion", NEW."templateCode", NEW."templateVersion"
      USING ERRCODE = '42501';
    RETURN NULL;
  END IF;
  RETURN NEW;
END
$qm_task_snapshot$;

DROP TRIGGER IF EXISTS "compliance_task_snapshot_frozen" ON "compliance_task";
CREATE TRIGGER "compliance_task_snapshot_frozen"
  BEFORE UPDATE ON "compliance_task"
  FOR EACH ROW EXECUTE FUNCTION qmulate_task_snapshot_frozen();
ALTER TABLE "compliance_task"
  ENABLE ALWAYS TRIGGER "compliance_task_snapshot_frozen";


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — THE IDENTITY EXPOSURE MIGRATION 16 MEASURED
--
-- Migration 16's census measured `UPDATE "compliance_obligation" SET "id" = …` COMMITTING as
-- `qmulate_app`. §2's content guard is worth nothing against that: leave the content alone and move
-- the ROW onto another obligation's identity, and every task pointing at the old id now records a
-- different duty. `compliance_task.id` is the same exposure one level down.
--
-- Reuses `qmulate_identity_immutable()` (migration 16, AV4-01) unchanged, which is why this section is
-- four lines rather than a fifth copy of the same trigger body.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_identity$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['compliance_obligation', 'compliance_task']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_id_immutable', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW '
      'EXECUTE FUNCTION qmulate_identity_immutable()',
      tbl || '_id_immutable', tbl
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_id_immutable');
  END LOOP;
END
$qm_e7_identity$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4b — REVOKE EXECUTE FROM PUBLIC ON THE TWO FUNCTIONS THIS FILE CREATES
--
-- ⚠ **A FRESHLY CREATED FUNCTION HAS `proacl = NULL`, WHICH MEANS EXECUTE IS GRANTED TO PUBLIC.**
-- Migration 10 §2.4 established the rule and `authorization-plane-privilege.integration.test.ts`
-- assertion 1f enforces it: no function in `public` may grant EXECUTE to PUBLIC. Harmless for a
-- SECURITY INVOKER function like these two — they run as the caller and only ever RAISE — but the
-- posture is asserted rather than reasoned about, precisely because the default is PUBLIC and the day
-- somebody adds a SECURITY DEFINER function without noticing is the day it becomes a complete
-- escalation from one forgotten line.
--
-- ⊕ **THIS SECTION WAS MISSING FROM THE FIRST DRAFT AND THE EXISTING CONTROL CAUGHT IT.** Migration 29
-- needed no revoke because it created no function; this one creates two, and I did not notice until
-- assertion 1f went red with both named. That is the control working on its first new subject since it
-- was written, and it is recorded rather than quietly fixed — the rule is "every migration that creates
-- a function ends with this call", and the way to keep a rule is to note when it is nearly broken.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

SELECT qmulate_revoke_public_function_execute();


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — APPLY-TIME VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_immutability_verify$
DECLARE
  missing text[] := ARRAY[]::text[];
  needed  text;
BEGIN
  FOREACH needed IN ARRAY ARRAY[
    'compliance_obligation_template_immutable', 'compliance_task_snapshot_frozen',
    'compliance_obligation_id_immutable', 'compliance_task_id_immutable'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = needed AND NOT tgisinternal AND tgenabled = 'A'
    ) THEN
      missing := missing || ('ENABLE ALWAYS trigger ' || needed);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'compliance_obligation_code_libraryVersion_key'
  ) THEN
    missing := missing || 'unique index compliance_obligation_code_libraryVersion_key';
  END IF;

  -- Both forms, because Prisma wrote it as an INDEX and the first draft of this file only looked for a
  -- CONSTRAINT — so the drop and the verification shared one blind spot.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_obligation_code_key')
     OR EXISTS (
       SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'compliance_obligation_code_key' AND n.nspname = 'public'
     ) THEN
    missing := missing || 'the single-column UNIQUE(code) is still present (as a constraint or an index), so a second version of an obligation cannot be stored';
  END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E7 S8-Q5: % control(s) did not install: %. Without all of them the obligation library '
      'is a current opinion about what is owed wearing a history-shaped table (§09 Engine A).',
      array_length(missing, 1), array_to_string(missing, ', ');
  END IF;
END
$qm_e7_immutability_verify$;
