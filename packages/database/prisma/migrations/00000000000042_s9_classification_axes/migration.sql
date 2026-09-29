-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 42 — S9-4a · THE CLASSIFICATION AXES SEPARATE (owner ruling, fifth batch)
--
-- **Owner's answer (2026-08-25), verbatim selection: "a"** — to the framed choice *"(a) The
-- Authority's size bands are three (large/medium/small), and ذات انتفاع مباشر is an orthogonal
-- usage attribute, not a size — an endowment could be small AND direct-use."* The owner had stated
-- the taxonomy in his own words first: *"there are 3 types: large, medium, small."* Recorded in
-- `docs/product/prd/S4-owner-decision-memo.md` (fifth batch) and, for the SEQUENCING of this file,
-- in the **S9 first batch** — *"Own stage (Recommended). S9-4a stands as its own stage with its own
-- mutation matrix — not folded into the library bump. The S9-4a record commit cites THIS entry."*
-- Commit `e808bb6`.
--
-- ── WHAT WAS WRONG, PRECISELY ────────────────────────────────────────────────────────────────
-- `WaqfClassification` carried `DIRECT_UTILIZATION` as a fourth SIZE value, which made two real
-- facts mutually exclusive: a direct-use endowment had no size on record at all, and a small
-- endowment could not be recorded as direct-use. §09's `exclude_direct` gate and its ONE
-- income-conditional cell (`SMALL_DIRECT` at direct-use) were both keyed on that conflation.
--
-- ── §1 · THE ATTRIBUTE, AND WHY IT IS NULLABLE ───────────────────────────────────────────────
-- `waqf.directUtilization BOOLEAN` — NULLABLE, NO DEFAULT. ⚠ **NULL MEANS UNRECORDED AND NEVER
-- "NOT DIRECT".** The ruling: *"no default — an endowment whose usage is unrecorded is UNRECORDED,
-- not 'not direct'."* A required Boolean cannot express that: `false` is a positive claim that the
-- benefit is the YIELD, and a DEFAULT of `false` would make that claim on behalf of every endowment
-- nobody has looked at — which is exactly how a defaulted regulatory fact becomes a fabricated one.
-- The resolver refuses to gate on NULL (`DIRECT_USE_UNRECORDED`), the way the distribution engine
-- halts on an absent `continuationStipulation`.
--
-- ── §2 · THE ENUM NARROWS, AND THE MIGRATION REFUSES RATHER THAN REMAPPING ───────────────────
-- ⚠ **ADR-0004's LAW, AND IT IS THE WHOLE DESIGN OF THIS SECTION.** Postgres cannot drop an enum
-- value in place, so the mechanical options are (a) leave the value orphaned, (b) remap existing
-- rows to some size, or (c) refuse. This file does (c): it REFUSES TO APPLY if any row anywhere
-- holds `DIRECT_UTILIZATION` — `waqf.classification`, and `reclassification_event`'s `from` AND
-- `to`, because the history is evidence and rewriting it is the falsified-history shape migration
-- 36 refuses for instantiation identity.
--
-- Why refusing is right rather than merely strict: choosing a SIZE for a real endowment is a
-- REGULATORY DETERMINATION (the SAR bands, ⚠ unverified, in `Setting`), made by a Nazir against a
-- valuation. A migration that picked `SMALL` because direct-use endowments are usually small would
-- put a classification nobody made into the very column that gates which statutory duties the
-- endowment owes. The refusal message says what to do instead: reclassify through
-- `classification.reclassify`, which appends the BR-104 history event, and record the usage
-- attribute separately.
--
-- ⚠ THE FIXTURE MOVED WITH THIS FILE: `waqf-004` was `direct-utilization` and is now `SMALL` +
-- `directUtilization: true`, so a FRESH seed produces no offending row. An EXISTING database
-- carrying one is refused, loudly, which is the honest outcome — the same posture migration 37 took
-- over existing `suspicionSummary` rows.
--
-- §3 re-applies the privilege matrix (this file alters a table but creates none — the call is
-- harmless and idempotent, and cheaper than reasoning about whether it is needed).
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — THE ORTHOGONAL ATTRIBUTE ─────────────────────────────────────────────────────
ALTER TABLE "waqf" ADD COLUMN IF NOT EXISTS "directUtilization" BOOLEAN;

COMMENT ON COLUMN "waqf"."directUtilization" IS
  'S9-4a (owner ruling, fifth batch 2026-08-25): ذات انتفاع مباشر as an ORTHOGONAL usage axis. '
  'NULL = UNRECORDED and NEVER "not direct" — a defaulted false would claim the benefit is the '
  'yield on behalf of every endowment nobody has looked at. The gate resolver refuses to gate on '
  'NULL (DIRECT_USE_UNRECORDED).';


-- ── SECTION 2 — THE SIZE AXIS NARROWS TO THREE (+ the onboarding state) ─────────────────────
DO $qm_s94a_narrow$
DECLARE
  offending_waqfs  bigint;
  offending_events bigint;
BEGIN
  -- Nothing to do if the value is already gone (a re-application, or a database built after this).
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'WaqfClassification' AND e.enumlabel = 'DIRECT_UTILIZATION'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO offending_waqfs
    FROM "waqf" WHERE "classification"::text = 'DIRECT_UTILIZATION';
  SELECT count(*) INTO offending_events
    FROM "reclassification_event"
   WHERE "from"::text = 'DIRECT_UTILIZATION' OR "to"::text = 'DIRECT_UTILIZATION';

  IF offending_waqfs > 0 OR offending_events > 0 THEN
    RAISE EXCEPTION
      'QMULATE S9-4a: this migration REFUSES to apply. % waqf row(s) and % reclassification_event '
      'row(s) still hold classification DIRECT_UTILIZATION, and ADR-0004 forbids remapping a '
      'removed enum value. Choosing a SIZE for a real endowment is a REGULATORY DETERMINATION made '
      'by a Nazir against a valuation (the SAR bands live in "setting" and are UNVERIFIED against '
      'primary law) — a migration that guessed SMALL because direct-use endowments are usually '
      'small would write a classification NOBODY MADE into the column that gates which statutory '
      'duties this endowment owes. And the reclassification history is EVIDENCE: rewriting a past '
      '"from"/"to" is the falsified-history shape migration 36 refuses for instantiation identity. '
      'WHAT TO DO: for each endowment, record its real size through classification.reclassify '
      '(which appends the BR-104 history event), then set "directUtilization" = true separately — '
      'they are two axes now, and that is the point of this change.',
      offending_waqfs, offending_events
      USING ERRCODE = '23514';
  END IF;

  -- The narrowing itself. A NEW type + a cast, because Postgres cannot DROP an enum value.
  -- ⚠ `USING …::text::"WaqfClassification_new"` is safe ONLY because the refusal above proved no
  -- row holds the removed label; without it the cast would fail per-row with a message about a
  -- type, not about a regulatory determination.
  CREATE TYPE "WaqfClassification_new" AS ENUM ('LARGE', 'MEDIUM', 'SMALL', 'NOT_CLASSIFIED');

  ALTER TABLE "waqf"
    ALTER COLUMN "classification" TYPE "WaqfClassification_new"
    USING ("classification"::text::"WaqfClassification_new");
  ALTER TABLE "reclassification_event"
    ALTER COLUMN "from" TYPE "WaqfClassification_new"
    USING ("from"::text::"WaqfClassification_new");
  ALTER TABLE "reclassification_event"
    ALTER COLUMN "to" TYPE "WaqfClassification_new"
    USING ("to"::text::"WaqfClassification_new");
  ALTER TABLE "compliance_task"
    ALTER COLUMN "classificationAtInstantiation" TYPE "WaqfClassification_new"
    USING ("classificationAtInstantiation"::text::"WaqfClassification_new");

  DROP TYPE "WaqfClassification";
  ALTER TYPE "WaqfClassification_new" RENAME TO "WaqfClassification";
END
$qm_s94a_narrow$;


-- ── SECTION 3 — RE-APPLY THE PRIVILEGE MATRIX ────────────────────────────────────────────────
-- This file creates no table, so strictly the matrix is unchanged — but §2 DROPS AND RECREATES a
-- type that four columns depend on, and re-applying is idempotent and cheap. CENSUS-G measured what
-- happens when a migration reasons its way out of this call (migration 40) and is green precisely
-- because nothing has to reason about it.
DO $qm_s94a_matrix$
BEGIN
  IF to_regprocedure('qmulate_apply_privilege_matrix()') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S9-4a: qmulate_apply_privilege_matrix() is missing (migration 10).';
  END IF;
END
$qm_s94a_matrix$;

SELECT qmulate_apply_privilege_matrix();
