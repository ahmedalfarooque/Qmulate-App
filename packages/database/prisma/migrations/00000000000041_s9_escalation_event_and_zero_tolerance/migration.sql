-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 41 — S9-3d · THE ESCALATION RECORD, AND §09's "CANNOT BE DISMISSED, ONLY RESOLVED"
--                AS A DATABASE REFUSAL
--
-- §09 Engine B, "Escalation & reminder cadence", verbatim on both halves:
--
--   > **Daily evaluator** … escalates per the operating-model path — **owner (Case Manager) →
--   > Nazir → Leadership** (BR-1004). Each escalation writes an `EscalationEvent` + audit entry.
--
--   > **Zero-tolerance deadlines** (registration/updates `GOV-REG-01/02`, AML `GOV-AML-02`)
--   > escalate on a faster ladder and **cannot be dismissed, only resolved** — mirroring the
--   > governance dashboard's non-dismissible KPI breach.
--
-- ── §1-§3 · THE ESCALATION EVENT ────────────────────────────────────────────────────────────
-- APPEND-ONLY, and the reason is the same one `reclassification_event` carries: an escalation is
-- the evidence that somebody was told, on a day, at a rung. A record of notification that can be
-- edited afterwards is not evidence of notification — and the party with the strongest motive to
-- edit it is the party it escalated past. So: no UPDATE at all, and DELETE/TRUNCATE refused
-- outright by joining migration 8's retention family (its function, its hint mechanism — additive,
-- because this table does not exist until §2 of this file).
--
-- ⚠ NO `dismissedAt`, NO `acknowledgedAt`, NO `resolvedAt` COLUMN — DELIBERATELY, and this is the
-- design decision of the file rather than an omission. §09 says a zero-tolerance obligation cannot
-- be DISMISSED, only RESOLVED, and resolution is a fact about the OBLIGATION (the deadline was
-- satisfied, or the task was completed), not about the message that reported it. Giving the event
-- row a dismissal column would create exactly the affordance §09 forbids, and giving it a
-- resolution column would put a second, editable copy of the obligation's state beside the
-- authoritative one. The event says "at 06:00 on this day, this rung was engaged for this
-- deadline"; whether the duty is now discharged is `deadline."satisfiedAt"` and nothing else.
--
-- ── §4 · THE REFUSAL THAT MAKES "ONLY RESOLVED" TRUE OF THE OBLIGATION ──────────────────────
-- Migration 38 made `waivedAt` write-once. Write-once is not the same as unavailable: a
-- zero-tolerance deadline could still be waived ONCE, which is a dismissal with a different name —
-- and it is the cheapest possible way to make a missed registration deadline stop escalating.
-- `deadline_zero_tolerance_no_waiver` (BEFORE INSERT OR UPDATE, `ENABLE ALWAYS`) refuses a waiver
-- on a zero-tolerance rule outright. The only way such a deadline leaves the escalation ladder is
-- `satisfiedAt` — i.e. by being MET.
--
-- ⚠ THE ZERO-TOLERANCE SET IS DUPLICATED HERE, IN SQL, AND THAT IS A DECLARED COST. The
-- authoritative list is `DEADLINE_RULES[key].zeroTolerance` in `deadlines/rules.ts` (§09's rule
-- table, transcribed structurally). A guard that has to run inside Postgres cannot import it, so it
-- is restated in `qmulate_zero_tolerance_rule_keys()` — a named function rather than an inline
-- literal, precisely so a test can read it back and pin it against the domain descriptor. That pin
-- is the whole mitigation: an uncompared second spelling of a vocabulary is the defect this
-- repository has been bitten by five times, and the answer here is the same as everywhere else —
-- compare the two, do not trust them.
--
-- §5 calls the migration-12 §6 public-execute sweep (this file creates functions) and §6 re-applies
-- migration 10's privilege matrix (this file creates a TABLE — the omission CENSUS-G now catches,
-- measured on migration 40).
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ── SECTION 1 — VOCABULARY ───────────────────────────────────────────────────────────────────
-- The BR-1004 path, closed. Spelled as the domain spells it (`ESCALATION_LEVELS`), so the pin
-- compares like with like.
DO $qm_esc_level$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EscalationLevel') THEN
    CREATE TYPE "EscalationLevel" AS ENUM ('CASE_MANAGER', 'NAZIR', 'LEADERSHIP');
  END IF;
END
$qm_esc_level$;


-- ── SECTION 2 — THE EVENT TABLE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "escalation_event" (
  "id"               TEXT NOT NULL,
  "waqfId"           TEXT NOT NULL,
  "deadlineId"       TEXT NOT NULL,
  "complianceTaskId" TEXT,
  "level"            "EscalationLevel" NOT NULL,
  -- The DERIVED state at the moment of escalation, and the business-day count behind it. Stored
  -- because the derivation is a function of the day it ran on: re-deriving next week gives next
  -- week's answer, so a record of "why this rung, then" cannot be reconstructed later.
  "derivedStatus"        TEXT NOT NULL,
  "businessDaysOverdue"  INTEGER NOT NULL,
  -- WHICH ladder was applied. §09 gives zero-tolerance rules a faster one, and an escalation that
  -- cannot say which ladder produced it cannot be defended against "why so soon / so late".
  "ladderUsed"       TEXT NOT NULL,
  -- The evaluator's stated `asOf` day, dual-dated like every legally-significant date here.
  "asOfDate"         TIMESTAMP(3) NOT NULL,
  "asOfDateHijri"    TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"        TEXT,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "escalation_event_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "escalation_event" DROP CONSTRAINT IF EXISTS "escalation_event_waqfId_fkey";
ALTER TABLE "escalation_event" ADD CONSTRAINT "escalation_event_waqfId_fkey"
  FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "escalation_event_waqfId_asOfDate_idx"
  ON "escalation_event" ("waqfId", "asOfDate");
CREATE INDEX IF NOT EXISTS "escalation_event_deadlineId_idx"
  ON "escalation_event" ("deadlineId");

-- ONE escalation per (deadline, rung, day) — the transport's idempotency key, as a constraint.
-- `escalationIdempotencyKey` puts the DAY in the key deliberately (an obligation that stays overdue
-- must keep escalating daily at the rung it reached, or the ladder going quiet would be a dismissal
-- implemented as silence), and this index is what makes a retried cron a no-op rather than a second
-- record of the same notification.
CREATE UNIQUE INDEX IF NOT EXISTS "escalation_event_one_per_rung_per_day"
  ON "escalation_event" ("deadlineId", "level", "asOfDate")
  WHERE "deletedAt" IS NULL;

-- The ladder must be one of the two that exist. CHECKed rather than enum'd: it is a DERIVED value
-- whose vocabulary lives in `packages/domain`, and a Postgres enum would be a third spelling to keep
-- in step. The pin compares this CHECK to the domain list.
ALTER TABLE "escalation_event" DROP CONSTRAINT IF EXISTS "escalation_event_ladder_known";
ALTER TABLE "escalation_event" ADD CONSTRAINT "escalation_event_ladder_known"
  CHECK ("ladderUsed" IN ('ordinary', 'zero_tolerance'));

-- ⚠ ONLY AN OVERDUE DEADLINE ESCALATES, AND THAT IS AN INVARIANT NOT A CONVENTION.
-- `deriveEscalationLevel` returns `null` for every other status, and its doc comment explains why
-- it takes the whole derived state rather than a bare day count: "due today but not yet overdue"
-- (0 remaining, status `at_risk`) must be unrepresentable as an escalation input. This CHECK is the
-- same statement at rest — a row recording `at_risk` would mean somebody escalated a deadline that
-- was not yet late.
--
-- ⚠ AND IT SUBSUMES THE VOCABULARY CHECK, WHICH IS WHY THERE ISN'T ONE. This file's first draft also
-- carried `derivedStatus IN ('pending','due_soon','at_risk','overdue','met','waived')` — a DEAD
-- constraint beside this one, since a value pinned to exactly `'overdue'` cannot be any of the other
-- five. A dead constraint is worse than no constraint: it reads as coverage and enforces nothing, so
-- it is not shipped. The column is still STORED, because the record of what was derived on the day is
-- what makes the rung defensible later, and re-deriving next week gives next week's answer.
ALTER TABLE "escalation_event" DROP CONSTRAINT IF EXISTS "escalation_event_derived_status_known";
ALTER TABLE "escalation_event" DROP CONSTRAINT IF EXISTS "escalation_event_only_overdue_escalates";
ALTER TABLE "escalation_event" ADD CONSTRAINT "escalation_event_only_overdue_escalates"
  CHECK ("derivedStatus" = 'overdue' AND "businessDaysOverdue" >= 0);


-- ── SECTION 3 — APPEND-ONLY (no UPDATE at all), + migration 8's retention family ────────────
CREATE OR REPLACE FUNCTION qmulate_escalation_event_no_update()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_esc_no_update$
BEGIN
  -- The ONE exception is the soft-delete column, and it is an exception on purpose: DELETE is
  -- refused outright below, so `deletedAt` is the only legal retirement route this table has
  -- (migration 8 §2's own test for whether a refusal is satisfiable). Everything else is sealed.
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."waqfId" IS DISTINCT FROM OLD."waqfId"
     OR NEW."deadlineId" IS DISTINCT FROM OLD."deadlineId"
     OR NEW."complianceTaskId" IS DISTINCT FROM OLD."complianceTaskId"
     OR NEW."level" IS DISTINCT FROM OLD."level"
     OR NEW."derivedStatus" IS DISTINCT FROM OLD."derivedStatus"
     OR NEW."businessDaysOverdue" IS DISTINCT FROM OLD."businessDaysOverdue"
     OR NEW."ladderUsed" IS DISTINCT FROM OLD."ladderUsed"
     OR NEW."asOfDate" IS DISTINCT FROM OLD."asOfDate"
     OR NEW."asOfDateHijri" IS DISTINCT FROM OLD."asOfDateHijri"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" THEN
    RAISE EXCEPTION
      'UPDATE on "escalation_event" % is refused: this table is APPEND-ONLY. An escalation event '
      'is the evidence that somebody was told, on a day, at a rung — and a record of notification '
      'that can be edited afterwards is not evidence of notification. The party with the strongest '
      'motive to edit it is the party it escalated past. Only "deletedAt" may move, because DELETE '
      'is refused outright and soft-retirement is this table''s one legal route.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_esc_no_update$;

DROP TRIGGER IF EXISTS escalation_event_no_update ON "escalation_event";
CREATE TRIGGER escalation_event_no_update
  BEFORE UPDATE ON "escalation_event"
  FOR EACH ROW EXECUTE FUNCTION qmulate_escalation_event_no_update();
ALTER TABLE "escalation_event" ENABLE ALWAYS TRIGGER escalation_event_no_update;

DO $qm_esc_retention$
BEGIN
  -- NO-ARG signature, deliberately — a PL/pgSQL trigger function declares no parameters and takes
  -- its hint via `TG_ARGV`. Migration 40's first draft probed for `(text)` and FAILED the migration;
  -- the note is kept here so the next file does not re-learn it.
  IF to_regprocedure('qmulate_remainder_reject_delete()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3d: qmulate_remainder_reject_delete() is missing (migration 8).';
  END IF;
  IF to_regprocedure('qmulate_reject_truncate()') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S9-3d: qmulate_reject_truncate() is missing (migration 4).';
  END IF;

  DROP TRIGGER IF EXISTS escalation_event_no_delete ON "escalation_event";
  EXECUTE format(
    'CREATE TRIGGER escalation_event_no_delete BEFORE DELETE ON "escalation_event" '
    'FOR EACH ROW EXECUTE FUNCTION qmulate_remainder_reject_delete(%L)',
    'This row is the evidence that an escalation was raised — who was told, at which rung, on '
    'which day, and under which ladder. Deleting it erases the record of a notification that a '
    'later dispute turns on, and it is the cheapest way to make a missed statutory deadline look '
    'as though nobody was ever warned. Set "deletedAt" instead; this table has no unique key on '
    'identity, so soft-retirement does not hold the slot.'
  );
  ALTER TABLE "escalation_event" ENABLE ALWAYS TRIGGER escalation_event_no_delete;

  DROP TRIGGER IF EXISTS escalation_event_no_truncate ON "escalation_event";
  CREATE TRIGGER escalation_event_no_truncate
    BEFORE TRUNCATE ON "escalation_event"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();
  ALTER TABLE "escalation_event" ENABLE ALWAYS TRIGGER escalation_event_no_truncate;
END
$qm_esc_retention$;


-- ── SECTION 4 — "CANNOT BE DISMISSED, ONLY RESOLVED", ENFORCED ──────────────────────────────
-- The zero-tolerance rule keys, as a NAMED FUNCTION so a test can read them back and pin them
-- against `DEADLINE_RULES[key].zeroTolerance`. ⚠ AML is zero-tolerance in §09's sentence too, but
-- `AML_IMMEDIATE` is NOT a deadline rule key at all (S9-1 refuses it as a non-clock, and a computed
-- AML date in the general deadline plane would itself be a G-6 leak), so it cannot appear on a
-- `deadline` row and is deliberately absent from this list.
CREATE OR REPLACE FUNCTION qmulate_zero_tolerance_rule_keys() RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['REGISTER_30BD', 'UPDATE_15BD']::text[] $$;

CREATE OR REPLACE FUNCTION qmulate_deadline_zero_tolerance_no_waiver()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_zt_no_waiver$
BEGIN
  IF NEW."waivedAt" IS NOT NULL
     AND NEW."ruleKey" = ANY (qmulate_zero_tolerance_rule_keys()) THEN
    RAISE EXCEPTION
      '% on "deadline" %: rule % is ZERO-TOLERANCE and cannot be WAIVED. §09: zero-tolerance '
      'deadlines (registration and Authority-update obligations) "escalate on a faster ladder and '
      'CANNOT BE DISMISSED, ONLY RESOLVED". Migration 38 made "waivedAt" write-once, which is not '
      'the same as unavailable — a single waiver is a dismissal under another name, and it is the '
      'cheapest possible way to stop a missed registration deadline escalating. The only way this '
      'deadline leaves the ladder is by being MET ("satisfiedAt"). If the obligation genuinely did '
      'not apply, that is a CLASSIFICATION or scope question about the task, not an excuse '
      'recorded against the clock.',
      TG_OP, NEW."id", NEW."ruleKey"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_zt_no_waiver$;

-- BEFORE INSERT **OR** UPDATE — CENSUS-2's rule, and it applies squarely here: if moving `waivedAt`
-- into a value is refused, a row BORN with that value must be refused too, or the identical act is
-- refused as a transition and committed as a birth (C-10, measured twice in this repository).
DROP TRIGGER IF EXISTS deadline_zero_tolerance_no_waiver ON "deadline";
CREATE TRIGGER deadline_zero_tolerance_no_waiver
  BEFORE INSERT OR UPDATE ON "deadline"
  FOR EACH ROW EXECUTE FUNCTION qmulate_deadline_zero_tolerance_no_waiver();
ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_zero_tolerance_no_waiver;


-- ── SECTION 5 — CLOSE THE PUBLIC-EXECUTE DEFAULT (migration 12 §6; mandatory) ────────────────
DO $qm_s93d_sweep$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3d: qmulate_revoke_public_function_execute() is missing. It is defined by '
      '00000000000012_e3_lineage_reversion_deed_terms §6 and MUST be called at the end of every '
      'migration that creates a function.';
  END IF;
END
$qm_s93d_sweep$;

SELECT qmulate_revoke_public_function_execute();


-- ── SECTION 6 — RE-APPLY THE PRIVILEGE MATRIX (mandatory: this file CREATES A TABLE) ────────
-- Migration 10 grants by ITERATING `pg_tables`, so a table born after the last application has no
-- grants at all for the runtime role. Migration 40 forgot this and the defect was invisible to every
-- privileged probe in `packages/database` — it surfaced as `42501 permission denied` in an api
-- suite. `grant-census.integration.test.ts` (CENSUS-G) now catches the omission here instead; this
-- call is what keeps it green.
DO $qm_s93d_matrix$
BEGIN
  IF to_regprocedure('qmulate_apply_privilege_matrix()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE S9-3d: qmulate_apply_privilege_matrix() is missing (migration 10). Every migration '
      'that creates a table must re-apply it.';
  END IF;
END
$qm_s93d_matrix$;

SELECT qmulate_apply_privilege_matrix();
