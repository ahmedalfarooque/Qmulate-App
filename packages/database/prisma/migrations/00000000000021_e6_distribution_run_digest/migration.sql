-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E6/S7: THE RUN A NAZIR CAN SIGN, AND THE PERIOD THAT HOLDS ONE LIVE RUN.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- S7 wires the ALREADY-BUILT pure distribution engine (`packages/domain/src/distribution`) into a
-- run lifecycle. The engine is not touched — "the schema comes to the engine, never the reverse."
-- Three sentences this file exists to make true in Postgres:
--
--   1. A STORED RUN SAYS WHICH ENGINE PRODUCED IT AND WHAT ITS RESULT HASHED TO. The digest is
--      what a Nazir signs, and `ENGINE_VERSION` is a byte inside it — so a run that records
--      neither is an approval of an artifact nobody can re-derive.
--   2. THE BENEFICIARY'S PRINTED SHARE IS THE ENGINE'S SHARE. `sharePercent` was
--      `DECIMAL(9,4)` against an engine that emits a fixed SIX decimal places, so persistence
--      silently rounded away the last two digits of every statement figure.
--   3. ONE ENDOWMENT + ONE PERIOD CARRIES AT MOST ONE LIVE RUN. Two live runs for one quarter
--      are two answers to "what is this family owed", and nothing stopped them being stored.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ── WHAT WAS MEASURED BEFORE THIS FILE ───────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- On a `--reset` → `provision-db-roles` → `migrate deploy` → `db:seed` database at migration 20,
-- read from the OWNER connection (`MIGRATOR_DATABASE_URL`), 2026-08-18:
--
--   information_schema.columns, table "distribution":
--     · `engineVersion`  — ABSENT. `runDigest` — ABSENT. The only hash column in the whole schema
--       is `approval_request."payloadHash"`.
--   information_schema.columns, table "distribution_line_item":
--     · `sharePercent` numeric PRECISION 9, SCALE 4, NOT NULL, no default.
--   pg_indexes on ("distribution","distribution_line_item"): SEVEN indexes —
--     distribution_pkey, distribution_waqfId_id_key, distribution_waqfId_periodEnd_idx,
--     distribution_line_item_pkey, distribution_line_item_{beneficiaryId,distributionId,waqfId}_idx.
--     NONE of them covers ("waqfId","periodStart","periodEnd"): a second live run for one period
--     was REPRESENTABLE, not merely unhandled.
--   The seeded rows: one run (`dist-001`, waqf-001, 2026-01-01…2026-03-31, EXECUTED) and its two
--     lines, both storing `sharePercent` as **12.5000** — four decimal places, in the database.
--
--   AND THE ROUNDING, MEASURED IN THE SAME SESSION rather than reasoned about:
--     SELECT (33.333333::numeric)::DECIMAL(9,4)::text   →  '33.3333'      ← what a third of a
--     SELECT (33.333333::numeric)::DECIMAL(9,6)::text   →  '33.333333'      cohort used to store
--     SELECT (12.3456789::numeric)::DECIMAL(9,6)::text  →  '12.345679'    ← scale is exactly 6
--
--   `SHARE_PERCENT_SCALE = 6` (`packages/domain/src/distribution/contract.ts:326`) and
--   `sharePercentOf()` (`:2231-2239`) prints `toFixed(6, ROUND_HALF_UP)`, so EVERY line the engine
--   emits carries six decimals and the old column kept four of them. A share is display-only and
--   is never a base for arithmetic (the money is allocated in halalas, integer, by largest
--   remainder) — so this rounding never moved a halala. What it corrupted is the STATEMENT: the
--   percentage a beneficiary reads beside their amount stopped being the percentage the engine
--   computed, and the run's own trace and the stored line disagreed at the 5th decimal.
--
-- ── WHAT THIS MIGRATION LANDS ────────────────────────────────────────────────────────────────
--   §0  PRE-FLIGHT ×2 — name the offending rows rather than dying on a bare 23505 / 22003.
--   §1  `distribution."engineVersion"` + `distribution."runDigest"` — TEXT, NULLABLE, NO DEFAULT,
--       plus two `*_not_blank` CHECKs.
--   §2  `distribution_line_item."sharePercent"` widened DECIMAL(9,4) → DECIMAL(9,6).
--   §3  PARTIAL UNIQUE `distribution_one_live_run_per_period`.
--
-- ── WHAT IS DELIBERATELY *NOT* DONE HERE, AND WHY ────────────────────────────────────────────
-- Migration 12's house rule governs: a CHECK or a trigger is the WRONG place for a rule whose
-- PRODUCT half is unconfirmed, because it makes relaxing the rule a migration and it turns a
-- refusal a Nazir can see and dispute into a SQLSTATE.
--
--   · **NO `@default` ON EITHER NEW COLUMN, AND THIS IS THE POINT OF THE COLUMNS.** A default
--     would mint a version claim for a run nobody computed. `ENGINE_VERSION` is today
--     `e6-distribution/4.0.0` (bumped from 3.0.0 on 2026-08-17 because owner memo Q5 changes the
--     amounts a stored input produces — 256 of 7,680 enumerated cells — and Q7 turns a computing
--     run into a refusal, so a v3 run and a v4 run of ONE register are not comparable). A stored
--     default is exactly the sentence "this run was produced by the current engine" written by
--     the database on behalf of nobody. NULL means NOBODY HAS RECORDED ONE — never "the current
--     version", and never "look it up".
--   · **NO BACKFILL OF THE SEEDED HISTORICAL RUN.** `dist-001` keeps NULL on both columns. It is
--     seeded as a HISTORICAL RECORD, not an engine output, and its own numbers are internally
--     inconsistent three ways (defect F1, recorded in its `computationTrace`). Stamping
--     `e6-distribution/4.0.0` on it would assert that this engine produced a run this engine
--     would refuse.
--   · **NO CHECK ON THE SHAPE OF EITHER VALUE beyond "not blank".** A `~ '^[0-9a-f]{64}$'` CHECK
--     would hardcode sha256 into the database and make a hash-algorithm change a migration; a
--     version-format CHECK would make an engine bump one. `''`, on the other hand, is not a
--     shape opinion — it is the ambiguity that must not exist, and the precedent beside it is
--     migration 4's `distribution_approval_id_not_blank` (a CHECK, not a trigger clause, because
--     `''` satisfying `IS NOT NULL` is a data-shape error and CHECKs are never skipped by
--     `session_replication_role = 'replica'`).
--   · **NO UNIQUE ON `runDigest`, DELIBERATELY.** Two runs of the same register at the same
--     engine version SHOULD hash identically — that is the reproducibility property the digest
--     exists to expose. A unique index would turn reproducibility into an insert failure.
--   · **NO PAIRING CHECK `("engineVersion" IS NULL) = ("runDigest" IS NULL)`, THIS SPRINT.** It is
--     the right invariant — a digest whose engine version is unknown is unverifiable, and a
--     version with no digest attests to nothing — and the house has the convention for it
--     (`waqf_reversion_recorded_dual_dated`). It is held back because WHEN the two are written is
--     a workflow question S7's router is still being built around (one statement at compute, or
--     one at compute and one at submit), and a constraint that decides a workflow by SQLSTATE is
--     migration 12's rule broken in the usual direction. Recommended as migration 22 once the
--     write order is shipped and measured.
--     TODO(surface): confirm the write order, then pair them.
--   · **NOTHING ELSE THE RUN'S OUTPUT NEEDS.** The engine also emits `flags`,
--     `invariantsChecked`, `unverifiedNotes`, `entitlementRule`, `timing.*`, a refusal
--     discriminator, per-line gate flags and a `LineBasis`, and there is still nowhere to land
--     any of them but `computationTrace Json`. `blockedReason` is still free text with no
--     vocabulary, and `transferRef` is still plaintext with its own `TODO(surface)` naming E6/S7
--     as the rename window to `transferRefEnc`. Those are columns with a PRODUCT half — which
--     vocabulary, whose copy, which figures are unverified — and inventing them here would be
--     inventing the answers. Named in the S7 report, not guessed at.
--   · **`beneficiary."sharePercent"` IS NOT TOUCHED** and stays `DECIMAL(9,4)`. It is a different
--     field on a different table: the deed weight the engine actually reads is
--     `beneficiary."stipulatedWeight" DECIMAL(38,18)`, and waqf-001's three roster `sharePercent`
--     values sum to 37.5 rather than 100 precisely because they are a relic. Widening it would
--     imply it is an engine figure. Its fate is E4's.
--   · **NO `qmulate_revoke_public_function_execute()` SWEEP.** That call is owed by any migration
--     that CREATES A FUNCTION in schema public (migration 12 §9 measured why: a fresh function has
--     `proacl = NULL`, which MEANS EXECUTE TO PUBLIC). This migration creates none — no trigger
--     function, no helper — so the sweep is not owed. Saying so out loud rather than pasting the
--     call is the point: a ritual copied without its reason is how the reason gets lost.
--   · **NO `SELECT qmulate_apply_guards()`.** The README rule is that a change RECREATING a
--     guarded table must re-apply the guards. §2's `ALTER COLUMN … TYPE` rewrites the heap and
--     rebuilds this table's indexes but keeps the same relation, its constraints and its
--     triggers; `distribution_line_item` is also not in the guarded-table set the function covers
--     (audit_event, audit_chain_head, waqf, transaction, document, setting). So the honest move is
--     not a ritual call but a MEASUREMENT, and it is pinned in
--     `test/distribution-run-schema.integration.test.ts`: after this migration all six triggers on
--     the two tables are still present at `tgenabled = 'A'` (ENABLE ALWAYS) and both migration-19
--     composite foreign keys still bite, each probe naming its own constraint.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §0 · PRE-FLIGHT — name the offending rows rather than dying on a bare SQLSTATE
--
-- Precedent and reason: migration 19 §0. Failing here, naming ids, is strictly better than
-- failing on `23505 duplicate key value violates unique constraint` or `22003 numeric field
-- overflow` with no row named — and for §0a it is more than ergonomics. A database that already
-- holds two live runs for one period holds two answers to what a family is owed, and that is a
-- FINDING for a Nazir, not something a migration quietly picks a winner from.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  offenders text;
BEGIN
  -- §0a — duplicate live runs, which would make §3's index uncreatable.
  SELECT string_agg(msg, E'\n  ') INTO offenders FROM (
    SELECT 'endowment ' || d."waqfId" || ' period ' || d."periodStart"::date || '…'
             || d."periodEnd"::date || ' has ' || count(*)::text || ' live runs: '
             || string_agg(d."id" || ' (' || d."status"::text || ')', ', ' ORDER BY d."id") AS msg
      FROM "distribution" d
     WHERE d."deletedAt" IS NULL
       AND d."status" <> 'CANCELLED'
     GROUP BY d."waqfId", d."periodStart", d."periodEnd"
    HAVING count(*) > 1
  ) AS s;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE_E6_PREFLIGHT: this database already holds MORE THAN ONE LIVE distribution run for '
      'the same endowment and period, so the one-live-run index cannot be created. Two live runs '
      'are two answers to what the beneficiaries are owed; a migration must not choose between '
      'them. Retire the superseded run with status = ''CANCELLED'' (§08''s correction path — a run '
      'is corrected by a NEW run, never rewritten) or soft-delete it, then re-run. Offending '
      'groups:%s  %s', E'\n', offenders;
  END IF;

  -- §0b — the NARROWING half of the widening, which is easy to miss. DECIMAL(9,4) allowed FIVE
  -- integer digits (up to 99999.9999); DECIMAL(9,6) allows THREE (up to 999.999999). Every legal
  -- share is 0…100, so nothing should be near it — but "should" is what §0 exists to replace.
  SELECT string_agg(
           'distribution_line_item ' || li."id" || ' (run ' || li."distributionId"
             || ') sharePercent = ' || li."sharePercent"::text, E'\n  ' ORDER BY li."id")
    INTO offenders
    FROM "distribution_line_item" li
   WHERE abs(li."sharePercent") >= 1000;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE_E6_PREFLIGHT: a distribution_line_item carries a "sharePercent" of 1000 or more, '
      'which DECIMAL(9,6) cannot represent (three integer digits, six decimals). A share is a '
      'percentage of the distributable and is 0…100 by construction, so such a row is a data '
      'defect to investigate, not a value to round. Rows:%s  %s', E'\n', offenders;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · THE RUN SAYS WHAT PRODUCED IT — `engineVersion` AND `runDigest`
--
-- What the maker-checker gate actually approves is an ARTIFACT: `mintApprovalRequest` binds the
-- payload with `payloadHash = approvalFingerprint(serializeForAudit(payload))`, and the S7 router
-- puts `engineVersion` and `runDigest` INSIDE that payload. So the approval already carries them.
-- These two columns are the RUN's own copy of the same two facts, and the reason the run needs its
-- own copy is that an `ApprovalRequest` may outlive its subject and `approvalRequestId` is a plain
-- column, not a foreign key (see the model's comment). A run row that cannot say which engine
-- produced it and what that result hashed to is a payment nobody can re-derive later — and
-- re-derivation is the whole claim of a deterministic engine.
--
-- TEXT, nullable, no default. `runDigest` is expected to be the hex sha256 of the engine result's
-- canonical form (`canonicalizeResult`, `packages/domain/src/distribution/trace.ts`), computed in
-- `packages/api` — the database does not compute it and does not opine on its algorithm.
--
-- ⚠ AND THE THING THIS MIGRATION DOES NOT GIVE THEM: neither column is WRITE-ONCE. The status
-- lattice makes `EXECUTED` terminal for the STATUS, and `distribution_status_transition` fires
-- only when the status actually changes — so a plain `UPDATE "distribution" SET "runDigest" = …`
-- on an EXECUTED run is not a transition and no guard sees it. MEASURED, on the same database, in
-- `test/distribution-run-schema.integration.test.ts` (§5): that UPDATE COMMITS. It is recorded
-- rather than guarded for the same reason as the pairing CHECK above — the write order is still
-- being built — and it is the strongest remaining argument for that migration-22 guard, which
-- should be a trigger sealing both columns once the run leaves DRAFT/COMPUTED, mirroring
-- `qmulate_distribution_line_reject_delete()`'s parent-status test rather than inventing a
-- second rule.
-- TODO(surface): seal `engineVersion`/`runDigest` once a run leaves computation.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE "distribution" ADD COLUMN IF NOT EXISTS "engineVersion" TEXT;
ALTER TABLE "distribution" ADD COLUMN IF NOT EXISTS "runDigest" TEXT;

-- `qmulate_add_check` is migration 1's idempotent helper (it checks `pg_constraint` first).
-- `NULL` stays legal — it is the honest "nobody recorded one". `''` and `'   '` do not.
SELECT qmulate_add_check(
  'distribution',
  'distribution_engine_version_not_blank',
  '"engineVersion" IS NULL OR btrim("engineVersion") <> '''''
);
SELECT qmulate_add_check(
  'distribution',
  'distribution_run_digest_not_blank',
  '"runDigest" IS NULL OR btrim("runDigest") <> '''''
);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · THE PRINTED SHARE BECOMES THE ENGINE'S SHARE — DECIMAL(9,4) → DECIMAL(9,6)
--
-- `SHARE_PERCENT_SCALE = 6` in the engine; the column kept 4. Measured above: a third of a cohort
-- stored '33.3333' where the engine said '33.333333'. Nine total digits is unchanged, so the
-- widening spends two integer digits it never had a use for (a percentage is 0…100) to buy the two
-- decimals the statement is printed from. §0b guards that trade.
--
-- ⚠ Guarded on the CATALOG, not on a bare `ALTER`, so re-running the file is a no-op rather than a
-- second full table rewrite. Every statement in this repository's migrations must be idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'distribution_line_item'
       AND column_name  = 'sharePercent'
       AND (numeric_precision <> 9 OR numeric_scale <> 6)
  ) THEN
    ALTER TABLE "distribution_line_item"
      ALTER COLUMN "sharePercent" TYPE DECIMAL(9,6);
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · ONE LIVE RUN PER ENDOWMENT AND PERIOD
--
-- Before this index, `INSERT`ing a second run for waqf-001's 2026 Q1 succeeded. That is not a
-- tidiness problem: a distribution run is the computed answer to "what is this family owed for
-- this period", and two live answers mean the next reader — a statement, a dashboard tile, an
-- Authority report — picks one by `ORDER BY` accident. It is also the only thing that makes the
-- API's `create` verb idempotent under a double submit, which matters more than usual here because
-- `apps/web` sets `retry: false` on mutations precisely because "a retried mutation is a second
-- attempt at a money movement".
--
-- ⚠ WHY PARTIAL, AND WHY EXACTLY THESE TWO EXCLUSIONS:
--   · `"status" <> 'CANCELLED'` — §08's correction path is a NEW RUN, and the lattice's way of
--     retiring the old one is `CANCELLED` (there is no `REJECTED` in `DistributionStatus`: a
--     rejected run is CANCELLED). A total unique index would make the correction path
--     UNREPRESENTABLE — the replacement run could never be inserted. The index would then be
--     enforcing "compute once, correctly, forever", which no engine can promise.
--   · `"deletedAt" IS NULL` — the same argument for the soft-delete convention every table here
--     uses. Note `distribution_no_delete` (migration 6) means a hard DELETE is refused outright,
--     so soft-deletion is the only retirement other than CANCELLED.
-- Both exclusions are PROVEN to be live in the test file (§4): a CANCELLED second run and a
-- soft-deleted second run each COMMIT, and a run for a different period commits. Without those
-- three positive controls, "the index refused" would be indistinguishable from "the index is
-- total" — and a total index would silently kill the correction path.
--
-- ⚠ AND THE TWO CONSEQUENCES A CALLER MUST KNOW ABOUT:
--   1. Any writer keyed on `(waqfId, period)` now COLLIDES on a second attempt — including a
--      Playwright spec that runs twice against one database (once per locale project) and any
--      retry. Nonce-derive the period, or make the assertion idempotent.
--   2. This is an index, so the refusal is `23505` with the index's own name in it, not a Nazir-
--      readable sentence. That is the right trade for a uniqueness fact (a trigger could not be
--      concurrency-safe), but the API layer owes the human sentence — as data, not by parsing
--      this message.
--
-- The predicate must be immutable, which it is: `enum_ne` is immutable, and the literal is cast
-- explicitly so the stored `indexdef` says what it means.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS "distribution_one_live_run_per_period"
  ON "distribution" ("waqfId", "periodStart", "periodEnd")
  WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'::"DistributionStatus";
