-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 33 — E7 / S8 · THE COMPARTMENT CLASSIFICATION IS TEMPLATE CONTENT, AND IS FROZEN
--
-- ── WHAT WAS MEASURED, AND WHEN IT STOPPED BEING THEORETICAL ─────────────────────────────────
-- Measured on 2026-08-23 against a freshly migrated, freshly seeded cluster, as `qmulate_app` —
-- the least-privileged application role, which is what makes the measurement mean anything:
--
--     UPDATE "compliance_obligation" SET "confidentiality" = 'NORMAL' WHERE "code" = 'GOV-AML-02';
--     -- COMMITTED.
--     UPDATE "compliance_obligation" SET "titleEn" = 'mutated'      WHERE "code" = 'GOV-AML-02';
--     -- REFUSED, SQLSTATE 42501.
--
-- So the duty to report AML/CTF suspicion to the FIU could be lifted out of the compartment by one
-- UPDATE from the ordinary application role: no new library version, no reserved matter, no approval,
-- and — because nothing malfunctions — no error anywhere. The obligation simply becomes visible to
-- the eleven of thirteen role presets that hold `compliance:task:read`, which is precisely the leak
-- the owner closed in S8-Q1 ("compartment the row", 2026-08-23) arriving back through the UPDATE path.
--
-- ── WHY THE GAP EXISTED, WHICH IS AN ORDERING STORY AND WORTH KEEPING ────────────────────────
-- Migration 31 froze the content columns THAT EXISTED WHEN IT WAS WRITTEN. Migration 32 added
-- `confidentiality` an hour later and joined it to four read paths — `deriveClassification()`,
-- `amlClause()`, `amlClauseGlobal()`, `AML_CONFIDENTIALITY_MODELS` — and to no WRITE guard, because
-- the write guard was in the previous file and nothing forced a second look at it.
--
-- ⚠ **AND IT WAS INVISIBLE UNTIL THE LIBRARY WAS SEEDED.** Migration 32 marked no row: every
-- obligation was `NORMAL`, so "the classification is re-writable" changed nothing observable and no
-- test could distinguish a guarded column from an unguarded one. The seeding stage put the FIRST real
-- `AML_RESTRICTED` obligation in the database, and the gap became live in the same commit that made
-- it findable. That is the ordinary shape of this class: **a control's hole is only reachable once its
-- subject exists**, which is the same lesson migration 32's own header records about writing a
-- compartment test over a table with no restricted row.
--
-- ── WHY THIS IS EXECUTING THE OWNER'S RULING RATHER THAN MAKING ONE ──────────────────────────
-- S8-Q5, verbatim: templates are IMMUTABLE WITHIN A LIBRARY VERSION; changing an obligation means
-- publishing a new version, never mutating a shipped row. `confidentiality` is a property OF THE
-- TEMPLATE — it is what the register discloses about the duty — so it is content by that ruling's own
-- definition, and freezing it needs no separate decision. Nothing here answers a fiqh, legal or scope
-- question; the classification's VALUE stays exactly where S8-Q1 put it.
--
-- ── WHAT THIS DELIBERATELY DOES **NOT** DO ───────────────────────────────────────────────────
-- ⚠ `compliance_task.confidentiality` IS LEFT MUTABLE, and that is a decision rather than an
-- oversight. A TASK is an instance, not a shipped template: its classification is written when it is
-- instantiated and may legitimately have to follow its obligation. Freezing it would be migration 5
-- §2f's forbidden shape — "a guard nobody can satisfy is a guard that gets deleted" — before the
-- instantiation engine that would have to satisfy it even exists (E7's Engine A wiring is not built).
-- ⚠ It is therefore RECORDED that a task's compartment classification is re-writable by the
-- application role. Nothing writes it today (measured: the seed sets no task confidentiality and no
-- router exists), so there is nothing to protect yet — but the day instantiation lands, whether a
-- task's classification is frozen at instantiation is a question that has to be answered, not
-- inherited from this file's silence.
--
-- ⚠ It also does NOT gate re-classification behind a reserved matter. Retiring/altering a catalogue
-- template is ORDINARY MAINTENANCE, AUDITED (owner, S8-Q12, 2026-08-23 — overruling the
-- orchestrator's recommendation of a gate). The audit trail is the control, and the remedy for a
-- genuine re-classification is the same as for any other content change: publish a new version.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — `confidentiality` JOINS THE FROZEN CONTENT SET
--
-- `CREATE OR REPLACE` of migration 31's function, with ONE column added. Replaced rather than
-- supplemented with a second trigger, so there stays exactly one place a reader has to look to know
-- what an obligation template may not change — two triggers refusing overlapping column sets is how
-- the next person concludes the first one is dead code.
--
-- ⚠ The `IS DISTINCT FROM` comparison is what keeps the seed idempotent: an upsert writing the same
-- classification back changes nothing and is permitted. Measured by seeding twice.
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
  -- ⊕ MIGRATION 33. The compartment classification (S8-Q1). Last in the list and first in
  -- consequence: every other column here changes what a duty SAYS, this one changes WHO CAN SEE THAT
  -- IT EXISTS.
  IF NEW."confidentiality" IS DISTINCT FROM OLD."confidentiality" THEN changed := array_append(changed, 'confidentiality'); END IF;

  IF array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'UPDATE on "compliance_obligation" is refused: % (row %, code %, version %). An obligation '
    'TEMPLATE is IMMUTABLE WITHIN A LIBRARY VERSION (§09 Engine A; product owner S8-Q5, 2026-08-23). '
    'Every "compliance_task" naming this row records that a duty applied, and the text of the duty is '
    'the evidence of WHAT applied — editing it in place rewrites history by reference, for every task, '
    'silently. "confidentiality" is in this set for a sharper reason (product owner S8-Q1): it decides '
    'whether the duty is visible outside the AML compartment at all, so an in-place edit is a '
    'compartment lifted with no version, no approval and no error. THE REMEDY: publish a NEW VERSION. '
    'INSERT a row with the same "code" and a new "libraryVersion" (UNIQUE is on the pair, so both '
    'coexist), and let new tasks snapshot the new version while old tasks keep pointing at the text '
    'that governed them. To take this obligation out of service instead, set "deletedAt". Neither '
    '"updatedAt" nor "deletedAt" is refused here.',
    array_to_string(changed, ', '), OLD."id", OLD."code", OLD."libraryVersion"
    USING ERRCODE = '42501';
  RETURN NULL;
END
$qm_obligation_immutable$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — REVOKE EXECUTE FROM PUBLIC
--
-- `CREATE OR REPLACE` preserves an existing ACL, so this call is belt-and-braces here rather than
-- load-bearing. It is made anyway because migration 31's own header records the rule being nearly
-- broken the first time it applied — "every migration that touches a function ends with this call" —
-- and a rule with a remembered exception is a rule that decays.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

SELECT qmulate_revoke_public_function_execute();


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — APPLY-TIME VERIFICATION
--
-- ⚠ Verifies the BEHAVIOUR, not the existence of a trigger. Migration 31 already installed the
-- trigger, so "the trigger is present and ENABLE ALWAYS" was true BEFORE this file and would pass
-- unchanged if the function body had not been replaced at all — a green check over the exact defect
-- it is meant to catch. So the guard is DRIVEN: change a classification inside a savepoint, require
-- the refusal, and roll it back.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_conf_frozen_verify$
DECLARE
  probe_id   text;
  refused    boolean := false;
  sqlstate_seen text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'compliance_obligation_template_immutable' AND NOT tgisinternal AND tgenabled = 'A'
  ) THEN
    RAISE EXCEPTION
      'QMULATE E7: compliance_obligation_template_immutable is missing or not ENABLE ALWAYS. '
      'Migration 31 installs it; this file only replaces its body.';
  END IF;

  -- A row to drive it on. On a database with no obligations yet (a fresh `migrate deploy` before the
  -- seed) there is nothing to probe, and that is REPORTED rather than silently skipped — a
  -- verification that quietly does nothing is the vacuous-pass this project keeps re-learning.
  SELECT "id" INTO probe_id FROM "compliance_obligation" ORDER BY "id" LIMIT 1;

  IF probe_id IS NULL THEN
    RAISE NOTICE
      'QMULATE E7 migration 33: no compliance_obligation row exists yet, so the confidentiality '
      'freeze could not be DRIVEN at apply time. The trigger is installed; the behavioural proof is '
      'obligation-immutability.integration.test.ts, which runs against the seeded fixture.';
    RETURN;
  END IF;

  BEGIN
    UPDATE "compliance_obligation"
       SET "confidentiality" = CASE WHEN "confidentiality" = 'AML_RESTRICTED'
                                    THEN 'NORMAL'::"Confidentiality"
                                    ELSE 'AML_RESTRICTED'::"Confidentiality" END
     WHERE "id" = probe_id;
  EXCEPTION WHEN OTHERS THEN
    refused := true;
    sqlstate_seen := SQLSTATE;
  END;

  IF NOT refused THEN
    RAISE EXCEPTION
      'QMULATE E7 migration 33: the confidentiality freeze did NOT install — an UPDATE of '
      '"confidentiality" on row % committed. The AML compartment can be lifted off the duty to '
      'report with one UPDATE from the application role (product owner S8-Q1).', probe_id;
  END IF;

  -- ⚠ AND IT MUST BE **OUR** REFUSAL. A refusal is only evidence of a control when you know which
  -- layer refused (migration 29's 0A000-vs-42501 lesson): a permission error, a type error or a
  -- serialization failure would all set `refused` and prove nothing about this trigger.
  IF sqlstate_seen IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION
      'QMULATE E7 migration 33: the UPDATE was refused with SQLSTATE % rather than 42501, so '
      'something other than the template-immutability trigger rejected it and the freeze is '
      'UNPROVEN.', sqlstate_seen;
  END IF;
END
$qm_e7_conf_frozen_verify$;
