-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — MIGRATION 26 · ONE PERIOD'S GHALLAH IS PAID ONCE  (closes AV7-F2)
--
-- Closes **AV7-F2** (HIGH on the V-S7 adversarial register): *the same ghallah distributed
-- twice.* Reproducer: `packages/api/test/av7-corpus-wall.integration.test.ts` A-10, which is
-- INVERTED in the same commit as this file.
--
-- ── WHAT WAS BROKEN, MEASURED THROUGH THE API AND NOT INFERRED ──────────────────────────────
-- `distribution_one_live_run_per_period` (migration 3) is UNIQUE on the **EXACT TRIPLE**
-- `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'`.
-- Two windows ONE DAY APART are therefore two different triples, and the index sees nothing:
--
--     run 1   waqf-001   2027-08-01 … 2027-08-31   APPROVED by a real second Nazir   EXECUTED
--     run 2   waqf-001   2027-08-02 … 2027-08-31   APPROVED by a real second Nazir   EXECUTED
--     ⇒ SAR 820,000.00 recorded as owed against SAR 410,000.00 of ghallah from ONE
--       SAR 500,000.00 receipt.
--
-- ⚠ AND THE ENGINE CANNOT SEE IT, WHICH IS THE WHOLE FINDING: **each run is INDIVIDUALLY
-- CORRECT.** No invariant inside `runDistribution` is violated by either one; there is no
-- second answer to compare against. The excess has no income provenance, so it is **asl by the
-- engine's own definition** (Binding rule 1, ADR-0002) — corpus paid out as though it were
-- yield, arrived at without one wrong arithmetic step. Nothing raw-SQL is needed and no trigger
-- is disabled: it is ordinary procedure calls and genuine Nazir approvals all the way down.
--
-- ── WHY A CONSTRAINT AND NOT A TRIGGER — the one place this repo's usual answer is wrong ─────
-- Every other guard in this schema is a `BEFORE` trigger, and for every other guard that is
-- right. Not here. A trigger would have to ask *"does any other paid run overlap me?"*, which is
-- a READ followed by a WRITE — **TOCTOU by construction**, exactly the shape AV7-B was: two
-- concurrent `execute` calls each read, each see no overlap, each commit. `resolveApprover`
-- already paid for that lesson (*"the loser must be stopped by the row lock plus a post-image
-- test, never by a second read"*), and there is no row here to lock — the conflict is between
-- two rows that do not exist yet.
--
-- An `EXCLUDE` constraint is **race-free by construction**: the index entry itself is the mutual
-- exclusion, so the second committer is refused by the same mechanism that made the first one
-- visible. That is worth the cost stated below.
--
-- ⚠ AND THE COST IS REAL, SO IT IS STATED RATHER THAN GLOSSED: a `23P01` carries only the
-- constraint name and the two conflicting keys. It CANNOT carry a remedy sentence the way every
-- `qmulate_*` trigger in this schema does. The remedy therefore lives in the PROCEDURE — the
-- `execute` path maps `23P01` on this constraint to a named refusal — and the explanation lives
-- in this header. A constraint that is silent about what to do next is only acceptable because
-- something else is not silent.
--
-- ── THE PREDICATE, AND WHY IT IS **NOT** THE ONE §6 RECOMMENDED ──────────────────────────────
--     WHERE ("status" = 'EXECUTED')
--
-- `distribution-run-schema.integration.test.ts` §6 measured and recommended
-- `WHERE ("deletedAt" IS NULL AND "status" = 'EXECUTED')`. **The `deletedAt` half is dropped
-- here, deliberately, and this is the one place this file departs from its own measurement.**
--
-- Keeping it would rebuild **AV7-F4's exact failure mode in a brand-new constraint, on the same
-- day it was closed one table over**: with `deletedAt IS NULL` in the predicate, ONE
-- `UPDATE "distribution" SET "deletedAt" = now()` on a paid run drops it out of the index and
-- **frees its period to be paid again** — a paid run becoming INVISIBLE instead of visibly PAID.
-- MEASURED: nothing gates `distribution."deletedAt"` (migration 25 gated `transaction`, and the
-- soft-delete guard family's own declared gap list names `beneficiary` and `setting`, not this),
-- so that route needs no approval at all.
--
-- The asymmetry is the point, and it is the same sentence `ledgerWindowWhere` now carries: **a
-- SCREEN may hide a retired row; a query that decides whether money may move may not.** Soft
-- deleting a paid run does not un-pay a beneficiary — the `distribution_line_item` rows are
-- still there and the halalas are still owed — so its period must stay blocked. Dropping the
-- clause removes a residual instead of recording one.
--
-- `'EXECUTED'` rather than `<> 'CANCELLED'`, on the other hand, IS §6's recommendation and is
-- kept: two overlapping runs that have not paid are two COMPUTATIONS, and refusing them would
-- kill the ability to preview an alternative window for one period. The invariant AV7-F2 breaks
-- is about **money recorded as owed**, so the refusal belongs at the transition INTO `EXECUTED`
-- — the last moment before a halala is attributed to a beneficiary. MEASURED cost of the
-- alternative: 45 of 60 `@qmulate/api` distribution tests red for `<> 'CANCELLED'` against 25
-- for this predicate.
--
-- ⚠ AND `EXECUTED` IS **TERMINAL**, WHICH IS WHAT MAKES THAT SAFE — verified, not assumed.
-- `qmulate_distribution_status_transition()` (migration 3, and again migration 22 §2) begins
-- `IF old_status IN ('EXECUTED','CANCELLED') THEN` and refuses. So a paid run can NEVER be
-- cancelled, and the obvious escape — pay, cancel, re-run the window — **does not exist**. Had
-- `EXECUTED → CANCELLED` been legal, this predicate would have been the wrong one.
--
-- ── WHY THE INTERVAL IS EXACTLY THIS INTERVAL, AND WHY THAT MATTERS ─────────────────────────
--     daterange("periodStart"::date, "periodEnd"::date, '[]')
--
-- `'[]'` is INCLUSIVE on both ends, which Postgres normalises to `[start, end+1)`. That is
-- **byte-for-byte the interval the run's own ledger query uses**: `periodWindow()` in
-- `packages/api/src/distribution/input.ts` returns
-- `{ fromInclusive: periodStart, toExclusive: periodEnd + 1 day }` and `ledgerWindowWhere`
-- applies it as `date >= fromInclusive AND date < toExclusive`.
--
-- ⚠ THAT IDENTITY IS WHAT MAKES THIS CONSTRAINT **SUFFICIENT** RATHER THAN MERELY NARROWING THE
-- SHAPE A-10 USED, and it is worth spelling out because it is not obvious:
--   1. a run's receipts are the ledger rows inside `[periodStart, periodEnd+1)`;
--   2. `create` writes the period COLUMNS and the stored input from the SAME `period` argument,
--      so they agree by construction, and `computationTrace` is WRITE-ONCE (migration 22 §1) so
--      the input cannot be swapped afterwards;
--   3. `execute` pays from a REPLAY of that stored input (AV7-E's fix, step 8) — it does not
--      re-read the ledger;
--   4. so if two paid runs' `[start, end+1)` intervals are DISJOINT, no receipt can be in both,
--      and one receipt can never be paid twice.
-- Step 2 is *"two sides that must agree, with nothing comparing them"* — this repo's own named
-- failure mode — so it is PINNED by a test in this commit rather than left true by inspection.
-- A half-open `'[)'` here would have broken step 1 and let 2029-08-31…09-30 sit beside
-- 2029-08-01…08-31 as if they were disjoint.
--
-- ⚠ `::date` IS FAITHFUL, MEASURED: every write path stores midnight UTC
-- (`civilDateToUtcDate`), so the cast truncates nothing that exists. It is also the conservative
-- direction — a stray time component could only ever make the constraint STRICTER.
--
-- ── ⚠ WHAT THIS FILE DOES **NOT** DO, EACH WITH ITS REASON ──────────────────────────────────
--
-- 1. **IT DOES NOT ADD A `consumedByDistributionId` MARKER TO `transaction`.** The `Transaction`
--    model's own note calls for one and says *"Both, or a named hole either way."* This file is
--    the "either way", and the reason is step 4 above: with periods disjoint, a receipt cannot
--    reach two paid runs, so the marker would answer *"which run paid this rent?"* — a
--    QUERYABILITY question — and not *"was it paid twice?"*, which is now structurally closed.
--    That is a real and useful column and it is still owed; it is no longer a CONTROL.
--    ⚠ The measurement that says so is also the one that limits it: `dist-001`'s trace carries
--    `derivation,fixtureTotalSar,note,origin` and **no `input`**, so a marker back-filled from
--    stored inputs would be blind to the one historical payment in the fixture.
--
-- 2. **IT DOES NOT GATE `distribution."deletedAt"`.** It makes the gate unnecessary FOR THIS
--    INVARIANT by leaving the clause out of the predicate (above). Retiring a paid run is still
--    an ungoverned write that hides the run from `get`/`list`, and that is on the register as
--    the soft-delete family's next item, beside `beneficiary` and `setting`.
--
-- 3. **IT DOES NOT CONSTRAIN `periodStart <= periodEnd`.** An inverted range would make
--    `daterange` throw at INSERT rather than pass silently, so the failure is loud; a CHECK
--    would be tidier and is not this file's job.
--
-- ── ⚠ WHAT IT CANNOT DO ─────────────────────────────────────────────────────────────────────
-- A constraint is not a trigger: there is no `ENABLE ALWAYS` for it, and the table OWNER can
-- `ALTER TABLE … DROP CONSTRAINT`. `session_replication_role = 'replica'` does **not** skip
-- constraint indexes, so the `ENABLE ALWAYS` concern does not arise here — but the residual
-- still sits on the deployment fact that `MIGRATOR_DATABASE_URL` is absent from the web and
-- worker processes, which no test can assert. The census in
-- `guard-verb-coverage.integration.test.ts` asserts the constraint is PRESENT by name, so a drop
-- turns the suite red rather than passing quietly.
--
-- ── ⚠ IT REQUIRES AN EXTENSION, AND THE PRIVILEGE TO INSTALL IT WAS VERIFIED, NOT ASSUMED ────
-- `EXCLUDE USING gist` needs `btree_gist` to mix `=` on a `text` column with `&&` on a range.
-- MEASURED on this cluster before writing this file:
--   · `btree_gist` is `trusted` in `pg_available_extension_versions`;
--   · `qmulate_owner` — the MIGRATOR role — is **NOT a superuser** (`rolsuper = false`) and holds
--     `CREATE` on the database, granted by `packages/database/src/provision-roles.ts`
--     (`GRANT CREATE, CONNECT, TEMPORARY ON DATABASE … TO qmulate_owner`), which CI runs BEFORE
--     `migrate deploy`;
--   · so a non-superuser can install a trusted extension, and `CREATE EXTENSION` as the migrator
--     succeeded. `qmulate_app` reports `has_database_privilege(…, 'CREATE') = false` and cannot.
-- Stated because "it worked on my machine as a superuser" would have proven nothing about CI.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · THE OPERATOR CLASS THIS NEEDS — INSTALLED IN ITS **OWN SCHEMA**, NOT IN `public`
--
-- `EXCLUDE USING gist` needs `btree_gist` to mix `=` on a `text` column with `&&` on a range.
-- This is the FIRST EXTENSION this schema has ever carried, and where it goes turned out to
-- matter a great deal.
--
-- ── ⚠ WHY NOT `public` — MEASURED, AFTER IT BROKE TWO SECURITY ASSERTIONS ────────────────────
-- The first version of this file ran a bare `CREATE EXTENSION IF NOT EXISTS btree_gist`, which
-- installs into `public`. `@qmulate/database`'s privilege-separation suite went RED, twice, and
-- both were TRUE POSITIVES about a real change in posture:
--
--   1f · `no SECURITY DEFINER function is executable by PUBLIC or by the runtime role`
--        → **186 functions** reported as PUBLIC-executable. A freshly created function has
--          `proacl = NULL`, which MEANS EXECUTE TO PUBLIC, and an extension's functions are no
--          exception.
--   1b · `everything in schema public is owned by qmulate_owner`
--        → a second owner appeared among the functions in `public`.
--
-- ⚠ AND THE OBVIOUS FIX WAS THE WRONG ONE. `qmulate_revoke_public_function_execute()` — the sweep
-- every migration that adds a function calls — would have "fixed" 1f by revoking EXECUTE from
-- PUBLIC on 186 gist support functions this repo does not own and did not write. That is a change
-- to a third party's objects made to quiet an assertion, which is the shape of exactly the mistake
-- these assertions exist to catch.
--
-- ⚠ THE OTHER TEMPTING FIX WAS WORSE. `qmulate_assert_privilege_separation()` (migration 10 §3) is
-- the function that IS the privilege-separation control, and it could have been redefined here to
-- exclude extension-dependent objects. Editing a security control so that a new object stops being
-- reported is not something to do in passing, however defensible the exclusion.
--
-- ── WHAT THIS DOES INSTEAD ──────────────────────────────────────────────────────────────────
-- The extension goes in a dedicated `extensions` schema. `public` then contains **no third-party
-- objects at all**, every posture assertion keeps its exact original meaning, and no security
-- control is touched. §3 asserts the choice rather than trusting it: if a future migration
-- installs an extension into `public`, this file's own self-check goes red.
--
-- ⚠ THE `search_path` DANCE IN §2 IS THE COST, AND IT IS ONE-TIME. Postgres picks the default
-- operator class for `(text, gist)` by searching the search_path AT CREATION TIME; afterwards the
-- index stores the opclass OID, so the constraint keeps working with `extensions` nowhere on any
-- search_path. Nothing at runtime needs it, and the runtime role needs no privilege on the schema:
-- exclusion enforcement calls the opclass support functions INTERNALLY through the index access
-- method, not as SQL, so no EXECUTE check occurs. MEASURED: A-10 drives the refusal through the
-- API on `qmulate_app` with the extension in `extensions` and no grant on that schema.
--
-- ⚠ THE PRIVILEGE TO DO ANY OF THIS WAS VERIFIED, NOT ASSUMED. `btree_gist` is `trusted` in
-- `pg_available_extension_versions`, and `qmulate_owner` — the MIGRATOR — is **NOT a superuser**
-- (`rolsuper = false`) but holds `CREATE` on the database, granted by
-- `packages/database/src/provision-roles.ts` (`GRANT CREATE, CONNECT, TEMPORARY ON DATABASE … TO
-- qmulate_owner`), which CI runs BEFORE `migrate deploy`. A trusted extension plus a non-superuser
-- with database CREATE is installable. `qmulate_app` reports
-- `has_database_privilege(…, 'CREATE') = false` and cannot.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · THE CONSTRAINT
--
-- ⚠ GUARDED BY A CATALOGUE LOOKUP RATHER THAN `IF NOT EXISTS`, WHICH `ADD CONSTRAINT` HAS NOT
-- GOT. Re-running a migration is not supposed to happen under `migrate deploy`, but this repo
-- has re-applied a migration by hand more than once while a cluster was being repaired, and a
-- `42710` there reads as a broken migration rather than as a no-op.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $qm_f2$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'distribution_paid_periods_disjoint'
       AND conrelid = '"distribution"'::regclass
  ) THEN
    -- ⚠ `extensions` ON THE SEARCH PATH FOR THIS STATEMENT ONLY (`is_local = true`, so it ends
    -- with the transaction). Postgres resolves the default `(text, gist)` operator class through
    -- the search_path AT CREATION TIME; afterwards the index stores the opclass OID and nothing
    -- needs this again. Without it: `data type text has no default operator class for access
    -- method "gist"` — a message that reads like a missing extension rather than a missing path.
    PERFORM set_config('search_path', 'public, extensions', true);
    ALTER TABLE "distribution"
      ADD CONSTRAINT distribution_paid_periods_disjoint
      EXCLUDE USING gist (
        "waqfId" WITH =,
        daterange("periodStart"::date, "periodEnd"::date, '[]') WITH &&
      )
      WHERE ("status" = 'EXECUTED');
  END IF;
END
$qm_f2$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · SELF-VERIFICATION — the INSTALLED DEFINITION, not the DDL this file appears to say
--
-- ⚠ WHY THIS SECTION IS SHAPED THE WAY IT IS, AND WHAT IT DELIBERATELY DOES NOT DO.
-- `ADD CONSTRAINT` succeeding proves the DDL parsed. It does not prove the constraint is the one
-- intended. Migration 23 §7 answered that class of doubt with a KNOWN-ANSWER test that refuses
-- to install when two sides disagree, and that is the precedent followed here.
--
-- The FIRST draft of this section drove A-10's shape — two `EXECUTED` runs one day apart —
-- inside a doomed subtransaction. It was DELETED before it shipped, and the reason is worth
-- keeping: `distribution` carries an FK to `waqf`, so that probe needed a parent row, and on a
-- freshly migrated cluster with no fixture there is none. It therefore had to degrade to
-- `RAISE NOTICE … RETURN` — i.e. **a self-test that reports its own silence as success on
-- exactly the environments where nobody is watching.** That is CENSUS-1, the defect this repo
-- paid 24 falsely-skipped retention tests for, rebuilt inside the assertion meant to prevent it.
-- Migration 23 §7's precedent does not transfer, because ITS known-answer test was over a PURE
-- function and needed no rows at all.
--
-- So this section asserts only what can be asserted with NO DATA, and cannot skip:
--   a. the constraint EXISTS on `distribution` and is of type `x` (EXCLUDE);
--   b. its installed definition carries `USING gist`, the `"waqfId"` equality operand, a
--      `daterange(...)` overlap operand with the INCLUSIVE `'[]'` bound, and the
--      `status = 'EXECUTED'` predicate;
--   c. its definition does **NOT** mention `deletedAt` — because a predicate that did would let
--      one ungoverned soft delete free a PAID period, which is AV7-F4's failure mode rebuilt in
--      a new constraint (see the header). This is the clause most likely to be "tidied" back in
--      by someone reconciling this file against §6's original recommendation, so it is asserted
--      rather than explained.
--
-- ⚠ THE BEHAVIOURAL PROOF IS NOT HERE, AND MUST NOT BE READ AS BEING HERE. That the constraint
-- actually REFUSES A-10's two runs and ACCEPTS disjoint months, overlapping unpaid runs and
-- another endowment's identical quarter is driven, with the guard's own SQLSTATE and
-- CONSTRAINT_NAME, in:
--   · `packages/database/test/distribution-run-schema.integration.test.ts` §6 (seven sub-probes)
--   · `packages/api/test/av7-corpus-wall.integration.test.ts` A-10 (the measured attack, through
--     the API, inverted in the same commit as this file)
-- Those run where the fixture is guaranteed to exist, which is the whole reason they, and not
-- this file, carry the behaviour.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $qm_f2_verify$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO def
    FROM pg_constraint c
   WHERE c.conname = 'distribution_paid_periods_disjoint'
     AND c.conrelid = '"distribution"'::regclass
     AND c.contype = 'x';

  IF def IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION 26 REFUSES TO INSTALL: no EXCLUDE constraint named '
      'distribution_paid_periods_disjoint exists on "distribution" after section 2 ran. Either '
      'the ADD CONSTRAINT was skipped by section 2''s catalogue guard while a DIFFERENT object '
      'of that name exists, or it was created as another contype. AV7-F2 stays open until this '
      'object is present: two EXECUTED runs one day apart recorded SAR 820,000.00 as owed '
      'against SAR 410,000.00 of ghallah, and each run was individually correct.';
  END IF;

  IF def NOT LIKE '%USING gist%' THEN
    RAISE EXCEPTION 'MIGRATION 26 REFUSES TO INSTALL: not a gist exclusion. Definition: %', def;
  END IF;

  IF def NOT LIKE '%daterange%' OR def NOT LIKE '%''[]''%' THEN
    RAISE EXCEPTION
      'MIGRATION 26 REFUSES TO INSTALL: the range operand is not an INCLUSIVE-BOUND daterange. '
      'The bound is load-bearing: ''[]'' normalises to [start, end+1), which is byte-for-byte '
      'the interval periodWindow() gives the run''s own ledger query. A half-open ''[)'' would '
      'let 2029-08-31..09-30 sit beside 2029-08-01..08-31 as if they were disjoint, and the '
      'sufficiency argument in this file''s header would no longer hold. Definition: %', def;
  END IF;

  IF def NOT LIKE '%EXECUTED%' THEN
    RAISE EXCEPTION
      'MIGRATION 26 REFUSES TO INSTALL: the predicate does not name EXECUTED. Definition: %', def;
  END IF;

  IF def LIKE '%deletedAt%' THEN
    RAISE EXCEPTION
      'MIGRATION 26 REFUSES TO INSTALL: the predicate mentions "deletedAt". That clause was '
      'REMOVED ON PURPOSE and this assertion exists to stop it coming back (see the header). '
      'With it, ONE ungoverned `UPDATE "distribution" SET "deletedAt" = now()` on a PAID run '
      'drops it out of the index and FREES ITS PERIOD TO BE PAID AGAIN — a paid run becoming '
      'INVISIBLE instead of visibly PAID, which is AV7-F4''s failure mode rebuilt in a new '
      'constraint on the same day it was closed one table over. Nothing gates '
      'distribution."deletedAt". A screen may hide a retired run; a query that decides whether '
      'money may move may not. Definition: %', def;
  END IF;

  -- ── d. `public` MUST STILL CONTAIN NO THIRD-PARTY OBJECTS ────────────────────────────────
  -- The reason §1 put `btree_gist` in its own schema, asserted rather than trusted to a comment.
  -- A bare `CREATE EXTENSION` in a future migration would land 186 PUBLIC-executable functions in
  -- `public` and turn privilege-separation assertions 1b and 1f red — with a message about
  -- SECURITY DEFINER escalation, three files away from the migration that caused it. This makes
  -- the failure land HERE, naming the extension.
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  ) THEN
    RAISE EXCEPTION
      'MIGRATION 26 REFUSES TO INSTALL: schema "public" contains EXTENSION-OWNED functions. This '
      'file installs btree_gist into a dedicated "extensions" schema precisely so that it does '
      'not: a bare CREATE EXTENSION put 186 functions into "public" with proacl = NULL (which '
      'MEANS EXECUTE TO PUBLIC) and a second owner among them, turning privilege-separation '
      'assertions 1b and 1f RED — and the two obvious ways to quiet those were (a) revoking '
      'EXECUTE from PUBLIC on 186 gist support functions this repo does not own, or (b) editing '
      'qmulate_assert_privilege_separation(), the function that IS the control. Neither is '
      'acceptable. Install extensions into "extensions".';
  END IF;

  RAISE NOTICE
    'migration 26 §3: distribution_paid_periods_disjoint is installed as %, and "public" holds no '
    'extension-owned objects. Behaviour is proven in '
    'distribution-run-schema.integration.test.ts section 6 and av7-corpus-wall A-10, not here — '
    'this cluster may have no fixture and a self-test that can skip is not a self-test.',
    def;
END
$qm_f2_verify$;
