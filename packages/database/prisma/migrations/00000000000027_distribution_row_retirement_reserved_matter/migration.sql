-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — MIGRATION 27 · RETIRING A DISTRIBUTION RUN IS A RESERVED MATTER
--
-- ⚠⚠ READ THIS FIRST: THIS IS **ENGINEERING'S EXTENSION OF A RULED PATTERN TO A NEW SUBJECT**,
-- NOT A NEW OWNER RULING, AND IT IS FLAGGED AS SUCH.
--
-- The PATTERN is ruled, twice:
--   · product owner, 2026-08-17 (S4 memo Q8)        — `waqf."deletedAt"` is a reserved matter;
--   · product owner, 2026-08-20 (S4 memo AV7-F4)    — soft-deleting ANY committed receipt is a
--     reserved matter, **uniform** across income and capital, on the stated logic that *anything
--     that changes what is distributable gets the gate*.
-- The SUBJECT is new: a `distribution` run. Nobody has asked the owner whether retiring a PAID RUN
-- is a reserved matter, and this file does not pretend otherwise. It applies the family's own logic
-- — a paid run is a record of money already attributed to named beneficiaries, which is at least as
-- grave a record as the receipt it was computed from — and carries a `TODO(surface)` so the record
-- shows an engineering reading awaiting confirmation rather than a ruling that was never given.
-- ⚠ DO NOT CITE THIS FILE AS THE OWNER HAVING RULED ON DISTRIBUTION RUNS.
--
-- ── WHY IT IS WORTH DOING NOW, AND WHAT IT IS **NOT** FIXING ─────────────────────────────────
-- Migration 26 closed AV7-F2 with `distribution_paid_periods_disjoint`, and it deliberately left
-- `"deletedAt"` OUT of that constraint's predicate — precisely so that an ungoverned soft delete on
-- a paid run could not free its period to be paid again. So this migration fixes **no live money
-- breach**: period disjointness already survives an unapproved retirement.
--
-- What it closes is the honesty gap migration 26's own header names: *"Retiring a paid run is still
-- an ungoverned write that hides the run from `get`/`list`."* MEASURED before this file,
-- `qmulate_app`, no approval in session:
--
--     UPDATE "distribution" SET "deletedAt" = now() WHERE "id" = <an EXECUTED run>  → 1 row
--
-- and that run — with its `distribution_line_item` rows intact and its halalas still owed —
-- disappears from every read path in the product (`get`, `list` and `lines` all filter
-- `deletedAt: null`). The beneficiaries are still owed the money; the Nazir can no longer see the
-- run that owes it. **The payment does not vanish, only the evidence of it does**, which is the same
-- sentence AV7-F4 was about one table over.
--
-- ── ⚠ WHAT THE STATUS DOES AND DOES NOT CHANGE ──────────────────────────────────────────────
-- The gate is UNIFORM across statuses, exactly as AV7-F4 is uniform across receipt classes: the
-- REASON below differs for an `EXECUTED` run and for one that never paid, and the STRICTNESS does
-- not. There is exactly ONE `qmulate_reserved_matter_defect()` call in the body, so no later edit
-- can make a paid run stricter than a draft without deleting a line that
-- `guard-verb-coverage.integration.test.ts` asserts on.
--
-- A DRAFT that nobody ever submitted is the weakest case for a gate, and it is still gated, for the
-- reason `distribution_no_delete` (migration 6) exists at all: `"deletedAt"` is the ONLY legal
-- retirement of a run, so an ungated one is an unaudited disappearance whatever the run's status —
-- and a status is not a permission.
--
-- ── WHAT THIS FILE INSTALLS ─────────────────────────────────────────────────────────────────
--   §1  `qmulate_distribution_row_retirement()` — the guard body.
--   §2  `distribution_row_retirement` — BEFORE INSERT OR UPDATE, ENABLE ALWAYS.
--   §3  The PUBLIC-EXECUTE sweep every migration creating a function owes.
--
-- Subject an approval must name:   distribution:<id>:deletedAt
-- Same shape and the SAME VERIFIER as `asset:<id>:deletedAt` (migration 14/15),
-- `waqf:<id>:deletedAt` (migration 17 tier 2b) and `transaction:<id>:deletedAt` (migration 25):
-- `qmulate_reserved_matter_defect(approval, waqfId, subject)`, i.e. migration 4's eight conditions.
-- This makes the soft-delete guard family FOUR members over ONE verifier, and CENSUS-3's family
-- sweep asserts them together rather than as unrelated checks.
--
-- ── ⚠ WHAT THIS FILE DELIBERATELY DOES **NOT** DO ───────────────────────────────────────────
--
-- 1. **IT ADDS NO `ReservedMatterKind`.** No trigger in this repo reads `reservedMatterKind` and
--    none of the three siblings checks one either; the gate is SUBJECT-bound. A kind would need
--    ar/en copy in `packages/i18n/messages/*.json`, which is product-approved text a code change
--    may not invent (the `RECEIPT_CLASS_CORRECTION` precedent). Owed to whoever builds the
--    retirement PROCEDURE — and there is none today: no router writes `distribution.deletedAt`.
--
-- 2. **IT DOES NOT GATE `distribution_line_item."deletedAt"`.** Retiring the LINES rather than the
--    run reaches the same end — a beneficiary's own statement row disappearing — and is NOT closed
--    here. Reported rather than half-built: it is the next item in this family, beside
--    `beneficiary` and `setting`, which are on the register already.
--
-- 3. **IT DOES NOT MAKE `distribution.id` IMMUTABLE.** Same residual migration 25 recorded for
--    `transaction`: `distribution` is not one of AV4-01's four `*_id_immutable` tables. A rename
--    cannot mint an approval, so the gate holds — but it does break the id a stored artifact names.
--
-- ── ⚠ WHAT THE GATE CANNOT DO ───────────────────────────────────────────────────────────────
-- The table OWNER can `ALTER TABLE … DISABLE TRIGGER`. `ENABLE ALWAYS` closes the
-- `session_replication_role = 'replica'` route and nothing else. The residual sits on the
-- deployment fact that `MIGRATOR_DATABASE_URL` is absent from the web and worker processes, which
-- no test can assert.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · THE GUARD BODY
--
-- ⚠ `OLD` ON UPDATE, `NEW` ON INSERT — migration 25's reasoning, unchanged: the subject and the
-- endowment are read from the row AS RECORDED, which is what an approval was minted against.
-- Reading `NEW."id"` on UPDATE would let one statement rename a row and retire it under the new
-- name in the same breath (see note 3 in the header).
--
-- ⚠ IT RETURNS EARLY WHEN THE COLUMN DOES NOT MOVE. Every other UPDATE to a `distribution` — the
-- status ladder, `execute`'s artifact columns, the approval link — passes through untouched. A
-- guard that refuses everything is not a fix, and the whole `distribution-run` lifecycle suite is
-- what holds that claim.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_distribution_row_retirement()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dist_retire$
DECLARE
  approval   text;
  defect     text;
  subject    text;
  row_id     text;
  row_waqf   text;
  row_status text;
  old_value  text;
  new_value  text;
  why        text;
  verb       text;
BEGIN
  -- ── (1) DOES THIS STATEMENT MOVE THE COLUMN AT ALL? ────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NULL THEN
      RETURN NEW;
    END IF;
    row_id     := NEW."id";
    row_waqf   := NEW."waqfId";
    row_status := NEW."status"::text;
    old_value  := '<no prior row: this run is BORN retired>';
    new_value  := NEW."deletedAt"::text;
    verb       := 'RECORDING A DISTRIBUTION RUN THAT IS ALREADY RETIRED';
  ELSE
    IF NEW."deletedAt" IS NOT DISTINCT FROM OLD."deletedAt" THEN
      RETURN NEW;
    END IF;
    row_id     := OLD."id";
    row_waqf   := OLD."waqfId";
    row_status := OLD."status"::text;
    old_value  := coalesce(OLD."deletedAt"::text, 'NULL');
    new_value  := coalesce(NEW."deletedAt"::text, 'NULL');
    verb       := CASE
                    WHEN OLD."deletedAt" IS NULL THEN 'RETIRING A DISTRIBUTION RUN'
                    WHEN NEW."deletedAt" IS NULL THEN 'UN-RETIRING A RETIRED DISTRIBUTION RUN'
                    ELSE 'RE-DATING A RETIREMENT'
                  END;
  END IF;

  -- ── (2) THE STATED REASON DIFFERS BY STATUS. THE STRICTNESS DOES NOT. ──────────────────
  -- Uniform, on AV7-F4's own logic (product owner, 2026-08-20, option (a)). This block chooses a
  -- SENTENCE; it chooses no test. Exactly one gate follows, for both arms.
  IF row_status = 'EXECUTED' THEN
    why := 'THIS RUN HAS PAID. Its distribution_line_item rows are intact and those halalas are '
           'still owed to named beneficiaries — retiring the run does not un-pay anybody, it only '
           'removes the evidence: get, list and lines all filter "deletedAt" IS NULL, so the Nazir '
           'loses sight of a payment that still stands. MEASURED before this guard, as qmulate_app '
           'with no approval, one UPDATE did exactly that. ⚠ AND IT IS NOT WHY '
           'distribution_paid_periods_disjoint IS SAFE: migration 26 deliberately left "deletedAt" '
           'out of that predicate, so period disjointness already survives an unapproved '
           'retirement. This gate closes the EVIDENCE gap, not a money gap.';
  ELSE
    why := format('This run is %s and has paid nothing, which is the weakest case for a gate — and '
                  'it is gated anyway, at the SAME STRICTNESS, because "deletedAt" is the ONLY '
                  'legal retirement of a run (distribution_no_delete, migration 6) and an ungated '
                  'one is an unaudited disappearance whatever the status. A status is not a '
                  'permission. Only the sentence you are reading differs from the EXECUTED arm.',
                  row_status);
  END IF;

  -- ── (3) THE ONE GATE ───────────────────────────────────────────────────────────────────
  approval := current_setting('qmulate.reserved_matter_approval_id', true);
  subject  := 'distribution:' || row_id || ':deletedAt';
  defect   := qmulate_reserved_matter_defect(approval, row_waqf, subject);

  IF defect IS NOT NULL THEN
    RAISE EXCEPTION
      '% on distribution % (status %) is a RESERVED MATTER. "deletedAt" would move % -> %. '
      '% '
      '⚠ THIS GATE IS ENGINEERING''S EXTENSION OF A RULED PATTERN TO A NEW SUBJECT, NOT A RULING '
      'ABOUT DISTRIBUTION RUNS. The pattern is ruled twice — waqf."deletedAt" (product owner, '
      '2026-08-17, S4 memo Q8) and ANY committed receipt, uniformly (product owner, 2026-08-20, '
      'S4 memo AV7-F4, on the logic that anything changing what is distributable gets the gate). '
      'Whether retiring a PAID RUN is a reserved matter has NOT been put to the owner; this file '
      'carries a TODO(surface) saying so. %. Go through withReservedMatter(), which verifies an '
      'APPROVED, maker <> checker RESERVED_MATTER approval for THIS endowment AND THIS artifact '
      'before it sets qmulate.reserved_matter_approval_id; the subject an approval must name is '
      '"%". ⚠ AND NOTE WHAT AN APPROVAL BUYS: the retirement, not the period. '
      'distribution_paid_periods_disjoint (migration 26) does NOT filter "deletedAt", so a '
      'legitimately retired PAID run still blocks its period from being paid a second time — a '
      'retired run is not an unpaid one.',
      verb, row_id, row_status, old_value, new_value, why, defect, subject
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_dist_retire$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · THE TRIGGER — `IU`, AND THE `I` IS NOT OPTIONAL
--
-- ⚠ AV3-03's lesson applied in advance rather than after a finding: on `asset` the `deletedAt`
-- TRANSITION was gated while a row BORN retired committed, and migration 15 had to close it.
-- Migration 25 did not repeat it for `transaction`; this does not repeat it for `distribution`.
-- A run born retired is not a payment, but it IS an `EXECUTED`-status row that blocks its period
-- under migration 26's predicate while being invisible to every read path — a denial of a period,
-- written by a caller nobody authorised.
--
-- ⚠ ONE trigger, not two, for migration 14 §4.6's reason: the retention scaffolding wrappers
-- suspend *the one named guard per table*, and a sibling they do not know about silently defeats
-- the wrapper (CENSUS-1's exact failure).
--
-- ⚠ NO `D`. DELETE and TRUNCATE on `distribution` are migration 6's
-- (`distribution_no_delete` / `distribution_no_truncate`), and `RETENTION_SCAFFOLDING_GUARDS` names
-- exactly one DELETE guard per table. A second `D` here is precisely the defect above.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS distribution_row_retirement ON "distribution";
CREATE TRIGGER distribution_row_retirement
  BEFORE INSERT OR UPDATE ON "distribution"
  FOR EACH ROW EXECUTE FUNCTION qmulate_distribution_row_retirement();

ALTER TABLE "distribution" ENABLE ALWAYS TRIGGER distribution_row_retirement;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · EXECUTE IS REVOKED FROM PUBLIC ON THE FUNCTION THIS FILE CREATES
--
-- Not optional and not inherited: a freshly created function has `proacl = NULL`, which MEANS
-- EXECUTE TO PUBLIC, and `ALTER DEFAULT PRIVILEGES` stores nothing when no explicit
-- `pg_default_acl` row exists. Migration 12 §6 learned it; S6/E5 learned it again. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
