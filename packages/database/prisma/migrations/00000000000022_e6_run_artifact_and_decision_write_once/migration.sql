-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E6/S7 ADVERSARIAL CLOSE-OUT: THE JSON THE MONEY IS READ FROM, AND THE DECISION
-- THAT MAY ONLY BE TAKEN ONCE.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- This file closes three breaches from the V-S7 adversarial register, all of them found by
-- driving the committed procedures rather than by reading them. Each one is the same species of
-- defect: a guard exists, is live, and is gated on a condition the attacker simply does not
-- satisfy.
--
--   AV7-E / E2 / E3 (HIGH) — `distribution.execute` writes the line items from
--     `readStoredLines(run.computationTrace)`, a Json blob that NO digest covers. Step 7 of
--     `execute`'s ladder compares the approval payload's `runDigest`/`engineVersion` to the
--     COLUMNS of the same name, and the money comes from somewhere else entirely. Measured on a
--     seeded cluster: paid lines of SAR 1,137,499.00 against a `distributableSar` of
--     SAR 275,000.00, with `runDigest` unchanged and the approval still verifying against its own
--     payload. E2 flipped an `EXCLUDED` line to `PAID` after a real Nazir approved it. **E3 is
--     the grading one: the write succeeded on `qmulate_app`, the role the API process itself
--     holds** — so this needed no DBA, only a raw-SQL seam inside the app.
--
--   AV7-B (HIGH) — one approval decided TWICE. Two Nazirs approving one PENDING request
--     concurrently BOTH received a success carrying their own id, three `APPROVE` events landed
--     for one approval, and the row kept whichever transaction committed last —
--     nondeterministically across runs (`nazir-b` once, `author-nazir` twice).
--
--   AV7-D1 / D1c (HIGH) — `checkerId` is NOT write-once, so the recorded approver of a run that
--     has ALREADY PAID can be rewritten. The `APPROVE` audit event still named the original; the
--     row named someone else.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ── THE ONE SENTENCE THAT EXPLAINS ALL THREE ────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Both guards involved are gated on a STATUS CHANGE:
--
--   `qmulate_distribution_status_transition()`   begins `IF new_status = old_status THEN RETURN NEW`
--   `qmulate_approval_request_authority()`       gates its lattice on
--                                                `new_status IS DISTINCT FROM old_status`
--
-- So an `UPDATE` that moves only a Json, or only a `checkerId`, matches nothing. This is EXACTLY
-- the defect migration 4 §2a already fixed once, for exactly this reason, in its own words:
-- *"Migration 3's whole body was gated on `TG_OP = 'UPDATE' AND new_status IS DISTINCT FROM
-- old_status`, so an UPDATE that touched only `makerId` matched nothing."* The identity block it
-- added is unconditional and comes FIRST. This migration applies that same shape to the two
-- columns migration 4 did not reach and to the Json migration 21 explicitly recorded as unsealed.
--
-- ⚠ AND THE FIX IS AT THE DATABASE, NOT ONLY IN THE PROCEDURE, DELIBERATELY. AV7-B is a TOCTOU:
-- `resolveApprover` reads the approval OUTSIDE the write transaction and takes no lock. A second
-- read-then-check in application code is the control that already failed. What closes a race is
-- making the losing write UNREPRESENTABLE, which only the row lock plus a trigger on the POST
-- image can do — the second transaction blocks, re-reads `OLD` as already-decided, and is refused.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ── WHAT WAS MEASURED BEFORE THIS FILE ──────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Cluster `fixdigest` (port 54422), `provision-db-roles` → `migrate deploy` (through 21) →
-- `db:seed`, 2026-08-19. `packages/api/test/av7-approval-identity.integration.test.ts` at
-- HEAD `afeac89`: **16 tests, 16 passed** — i.e. every exploit above WORKS on this tree.
--
--   · `UPDATE "distribution" SET "computationTrace" = jsonb_set(…, '{lines,0,entitledSar}', …)`
--     COMMITS on `qmulate_owner` AND on `qmulate_app` (AV7-E, AV7-E3), and the following
--     `distribution.execute` posts the substituted amount.
--   · `UPDATE "approval_request" SET "checkerId" = <another ACTIVE Nazir>` COMMITS on an APPROVED
--     row and on an EXECUTED row (AV7-D1, AV7-D1c). The bound, also measured: it CANNOT reach the
--     maker or a non-Nazir — both refused 42501 by
--     `qmulate_approval_request_authority()`'s own ACTIVE-NAZIR clause. So the reachable set was
--     "any OTHER active Nazir on that endowment", which is precisely the set AV7-B's race draws
--     from — one guard closes both.
--   · Nothing in the repository UPDATEs `computationTrace`: grepped across `packages/*/src`,
--     `apps/*/src`, `prisma/`, the seed and every migration. The only writer is
--     `distribution.create`'s INSERT. Five test files write it, all through raw SQL, and four of
--     them are INSERTs of whole fixture rows. So a write-once-on-UPDATE seal costs no production
--     path anything — measured, not assumed.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ── WHAT THIS MIGRATION LANDS ───────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   §1  `qmulate_distribution_status_transition()` REPLACED — a `computationTrace` write-once
--       clause AHEAD of the status early-return. No new trigger, on purpose (see §1's note).
--   §2  `qmulate_approval_request_authority()` REPLACED — the write-once identity block gains a
--       second half, THE DECISION: `checkerId`, `decidedAt`, `decidedAtHijri`,
--       `checkerTotpAssertedAt`, each write-once ONCE SET.
--   §3  The `qmulate_revoke_public_function_execute()` sweep.
--
-- ── WHAT IS DELIBERATELY *NOT* DONE HERE, AND WHY ───────────────────────────────────────────
--   · **NO SEAL ON `runDigest` / `engineVersion` / `distribution_line_item."amountSar"`.** That is
--     migration 21's own `TODO(surface)` and adversarial finding **AV7-AUD-F4**, a different
--     lens with its own owner in this sprint. Landing it here would collide with that change.
--     Named, not silently skipped. ⚠ It is still OWED, and until it lands the step-7 comparison
--     rests on a column the runtime role can rewrite — which is fail-SAFE for payment (a moved
--     `runDigest` makes `execute` refuse with `ARTIFACT_DIGEST_MISMATCH`) and fail-UNSAFE for
--     evidence (an EXECUTED run's digest can be rewritten after the fact).
--   · **NO OVERLAP CONSTRAINT ON `(waqfId, period)` — AV7-F2 IS NOT CLOSED HERE.**
--     `distribution_one_live_run_per_period` is unique on the EXACT triple, so two windows one day
--     apart are both live and the same ghallah is distributed twice. Two reasons this file does not
--     touch it, both measured: (a) the real fix is a **consumed-by-a-run marker on `transaction`**
--     — `Transaction` has no link to a `Distribution` at all — which is a schema design with an
--     owner-facing half (is a receipt consumed by the run that DISTRIBUTED it, or by the period it
--     FELL IN? what happens when that run is CANCELLED?); and (b) an overlap `EXCLUDE`/trigger
--     would refuse the *existing* test corpus, which deliberately uses overlapping windows on
--     waqf-001 (`dist-001` 01-01…03-31 plus start days 3,4,5..14,15..31 across four suites, all
--     ending 03-31 — every one of them overlaps every other). A constraint that reddens four
--     suites owned by three agents is not a contained addition. **REPORTED, NOT HALF-BUILT.**
--   · **NO CHANGE TO THE LATTICE ITSELF.** `APPROVED -> APPROVED` stays representable as a
--     statement; what becomes unrepresentable is a *different decision* inside it. The narrower
--     rule is the right one: migration 4 §0b deliberately ALLOWS soft-deleting an already-terminal
--     approval, which is an UPDATE with no status change, and a blanket "no UPDATE on a decided
--     row" would kill that retirement path.
--   · **NOTHING ABOUT `apps/web`.** No procedure calls either of these paths, so no application
--     change is owed by this file.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §0 · PRE-FLIGHT — is any EXISTING row already in a state this file would make unwritable?
--
-- Precedent: migration 19 §0 / migration 21 §0. A write-once guard is installed against a
-- database that may already hold the state it forbids, and the honest failure is a named row, not
-- a 42501 in whatever transaction touches it next. Nothing here can be *repaired* by a migration
-- — a duplicated decision is a FINDING for a Nazir — so this block WARNS rather than raising: the
-- guard must go in either way, and refusing to install it would leave the breach open.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  offenders text;
BEGIN
  -- An APPROVED/EXECUTED approval whose decision is half-recorded: a checker with no decision
  -- instant, or an instant with no checker. Both become permanent once the columns are sealed.
  SELECT string_agg(
           'approval_request ' || a."id" || ' (' || a."status"::text || ') checkerId='
             || COALESCE(a."checkerId", 'NULL') || ' decidedAt='
             || COALESCE(a."decidedAt"::text, 'NULL'), E'\n  ' ORDER BY a."id")
    INTO offenders
    FROM "approval_request" a
   WHERE a."status"::text IN ('APPROVED', 'EXECUTED')
     AND (a."checkerId" IS NULL) <> (a."decidedAt" IS NULL);

  IF offenders IS NOT NULL THEN
    RAISE WARNING
      'QMULATE_E6_22_PREFLIGHT: % approval(s) carry a HALF-RECORDED decision (a checker without a '
      'decision instant, or the reverse). §2 seals both columns once set, so the missing half can '
      'never be filled in afterwards. This is reported, not repaired: writing a decision instant '
      'on behalf of nobody is exactly what the seal exists to prevent. Rows:%s  %s',
      (SELECT count(*) FROM "approval_request" a
        WHERE a."status"::text IN ('APPROVED','EXECUTED')
          AND (a."checkerId" IS NULL) <> (a."decidedAt" IS NULL)),
      E'\n', offenders;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · THE JSON THE MONEY IS READ FROM IS WRITE-ONCE (AV7-E / E2 / E3)
--
-- REPLACES migration 3 §2's body. The whole status lattice below is byte-for-byte unchanged; ONE
-- block is added AHEAD of it, and the placement is the entire point.
--
-- WHY AHEAD OF THE EARLY RETURN. The function opened with `IF new_status = old_status THEN RETURN
-- NEW; END IF;` — a fast path for "this UPDATE is not a transition". That fast path is the hole:
-- `UPDATE "distribution" SET "computationTrace" = jsonb_set(…)` changes no status, so the guard
-- returned before looking at anything. Same species as migration 4 §2a's finding, same fix.
--
-- WHY A CLAUSE IN THE EXISTING FUNCTION AND NOT A NEW TRIGGER. Three reasons, in order of weight:
--   1. `distribution` already carries a BEFORE UPDATE row trigger whose job is "what may an UPDATE
--      to this row do". A second one firing on the same verb for the same table is two places to
--      look for one answer.
--   2. `packages/database/test/distribution-run-schema.integration.test.ts` §4 pins the EXACT
--      trigger census for `distribution` + `distribution_line_item` (six triggers, by name, by
--      verb, all at `tgenabled = 'A'`). A new trigger reddens that assertion — and that file
--      belongs to another change this sprint. An added CLAUSE keeps the census true, and the
--      census stays a real measurement rather than a list edited to match.
--   3. Migration 5 §2e's note is the counter-argument and it does not apply here: it chose an
--      ADDITIVE trigger to avoid re-entry ORDER problems between `qmulate_apply_*` functions.
--      `distribution` is not in the guarded-table set `qmulate_apply_guards()` covers
--      (audit_event, audit_chain_head, waqf, transaction, document, setting), so there is no
--      re-entry order to preserve.
--
-- ⚠ WHAT THE MESSAGE HAS TO SAY, AND WHY IT IS THIS LONG. A refusal is only evidence when it
-- carries the guard's own words (the V-S7 register's own rule, learned from two vacuous negatives).
-- A probe that mistypes a column name also "fails". So the sentence names the column, the reason,
-- and the correction path — and `packages/api/test/av7-approval-identity.integration.test.ts`
-- asserts ON THIS TEXT rather than on a SQLSTATE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_distribution_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dist_status$
DECLARE
  old_status text := OLD."status"::text;
  new_status text := NEW."status"::text;
BEGIN
  -- ── (0) `computationTrace` IS WRITE-ONCE (AV7-E / E2 / E3) ─────────────────────────────────
  -- UNCONDITIONAL, and BEFORE the status early-return.
  --
  -- This Json is not a log. `distribution.execute` reads the LINE SET out of it — every
  -- beneficiary, every status, every halala — and writes `distribution_line_item` from it. It is
  -- therefore the money, and until this clause it was the ONE money-bearing field on the run with
  -- no guard at all: `runDigest` is at least compared to the approved payload at spend time
  -- (`execute` step 7), and every SAR column is compared to nothing but is also read by nothing.
  --
  -- The digest DOES cover these bytes' provenance — `canonicalizeResult(result)` is hashed at
  -- `create` and the same `result` produces `storedTrace` — but a hash written beside a value it
  -- is not re-checked against protects nothing, and the comparison at spend time never touched
  -- this column. Sealing it makes the substitution UNREPRESENTABLE instead of undetected.
  IF TG_OP = 'UPDATE' AND NEW."computationTrace" IS DISTINCT FROM OLD."computationTrace" THEN
    RAISE EXCEPTION
      'distribution %: "computationTrace" is WRITE-ONCE. It is not a log — `distribution.execute` '
      'reads the LINE SET out of it (every beneficiary, every status, every halala) and writes '
      'distribution_line_item from those values, so rewriting it rewrites the payment while the '
      'approved "runDigest" still matches the column beside it. MEASURED before this guard '
      '(AV7-E/E2/E3): paid lines of SAR 1,137,499.00 against a distributableSar of SAR 275,000.00, '
      'an EXCLUDED line flipped to PAID after a Nazir approved it, and both writes succeeding on '
      'the least-privileged runtime role. A run is corrected by a NEW run (§08) — never by editing '
      'the artifact the approval attests to.',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;

  IF new_status = old_status THEN
    RETURN NEW;
  END IF;

  IF old_status IN ('EXECUTED', 'CANCELLED') THEN
    RAISE EXCEPTION
      'distribution %: % is terminal; % rejected. A correction is a NEW run (§08) — a paid run is '
      'never rewritten.', OLD."id", old_status, new_status
      USING ERRCODE = '42501';
  END IF;

  IF new_status = 'CANCELLED' THEN
    RETURN NEW; -- abandoning a run in progress is always allowed
  END IF;

  IF NOT (
       (old_status = 'DRAFT'            AND new_status IN ('COMPUTED', 'PENDING_APPROVAL'))
    OR (old_status = 'COMPUTED'         AND new_status = 'PENDING_APPROVAL')
    OR (old_status = 'PENDING_APPROVAL' AND new_status = 'APPROVED')
    OR (old_status = 'APPROVED'         AND new_status = 'EXECUTED')
  ) THEN
    RAISE EXCEPTION
      'distribution %: illegal status transition % -> %. APPROVED is reachable only from '
      'PENDING_APPROVAL and EXECUTED only from APPROVED — skipping a step means money moved '
      'without the maker-checker gate it was supposed to pass (BR-506).',
      OLD."id", old_status, new_status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_dist_status$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · ONE APPROVAL, ONE DECISION (AV7-B, AV7-D1, AV7-D1c)
--
-- REPLACES migration 4 §2a's body. Everything migration 4 wrote is byte-for-byte unchanged —
-- the identity block, the soft-delete block, the lattice, the ACTIVE-NAZIR clause. ONE half is
-- added to the identity block: THE DECISION.
--
-- `(waqfId, type, makerId, subjectId, payload, payloadHash)` is WHAT WAS ASKED. It was sealed
-- because a rule whose operands the subject of the rule may rewrite is not a rule. The same
-- sentence is true of WHO DECIDED AND WHEN, and it was not sealed:
--
--   checkerId             — the maker <> checker comparison at approve time AND at spend time
--                           (`execute` step 4), and the only record of which human authorised a
--                           payment. AV7-D1c rewrote it on a run that had ALREADY PAID.
--   decidedAt             — when the authority was exercised; the anchor for any lateness or
--                           sequence question an Authority audit asks.
--   decidedAtHijri        — the other half of the SAME instant. Sealing one and not the other
--                           permits a pair that disagrees, which is worse than either alone
--                           (`waqf_reversion_recorded_dual_dated`'s precedent).
--   checkerTotpAssertedAt — the step-up EVIDENCE (NFR-06). The freshness WINDOW is a `Setting` and
--                           is evaluated in the procedure layer, but the recorded instant is the
--                           only durable proof the assertion happened; rewriting it forges
--                           freshness after the fact.
--
-- ⚠ WRITE-ONCE **ONCE SET**, NOT FROM BIRTH — the same shape migration 4 chose for `payloadHash`,
-- and for the same reason. A request is raised PENDING with all four NULL, and `approval.approve`
-- (plus `reservedMatter.approve`, `settings.set`, `endowment.recordDeedTerms`) writes all four in
-- ONE statement. Sealing from birth would make the decision unwritable; sealing once set makes
-- the SECOND decision unwritable, which is the actual rule.
--
-- ⚠ HOW THIS CLOSES A RACE THAT APPLICATION CODE COULD NOT. `resolveApprover` reads the approval
-- outside the write transaction and takes no lock, so its "is it still PENDING" check is TOCTOU.
-- Under `READ COMMITTED` the second `UPDATE` blocks on the row lock, then re-reads OLD — which is
-- now APPROVED with the first Nazir's id — and this clause refuses it. The loser gets a 42501
-- instead of a success carrying their own id. MEASURED before the guard (AV7-B): both callers
-- succeeded, three `APPROVE` events landed for one approval, and the surviving `checkerId` varied
-- ACROSS RUNS — the signature of a real race, not a fixed order.
--
-- ⚠ AND WHAT THIS DOES **NOT** MAKE TRUE. The audit trail may still carry more than one `APPROVE`
-- event for one approval: the losing transaction's event is written before its `UPDATE` is
-- refused, and the whole transaction then rolls back — so the surplus event does not commit, but a
-- caller retrying with the SAME checker id writes a second event on top of a no-op UPDATE. Two
-- events naming ONE actor is a duplicate record, not a second authority; two events naming TWO
-- actors is what this clause makes impossible. Stated because the register's AV7-B entry is about
-- the trail as much as the row.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_approval_request_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_authority$
DECLARE
  new_status text := NEW."status"::text;
  old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::text ELSE NULL END;
  changed    text := NULL;
  decision   text := NULL;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- ── (0) THE WRITE-ONCE IDENTITY OF A REQUEST (C-02) ──────────────────────────────────────
    -- (waqfId, type, makerId, subjectId, payload) is WHAT WAS ASKED, BY WHOM, ABOUT WHICH THING,
    -- ON WHICH ENDOWMENT. Every one of them is a term in a rule stated somewhere else:
    --   makerId   — the maker≠checker comparison, in the CHECK and in `resolveApprover` step 3;
    --   waqfId    — the per-endowment ACTIVE-NAZIR lookup below;
    --   subjectId — the one-open-per-subject index AND `qmulate_approval_defect`'s subject bind;
    --   type      — re-pointing it manufactures a RESERVED_MATTER out of a DISTRIBUTION_RUN;
    --   payload   — the artifact the approver signed.
    -- A rule whose operands the subject of the rule may rewrite is not a rule.
    IF NEW."waqfId" IS DISTINCT FROM OLD."waqfId" THEN
      changed := 'waqfId';
    ELSIF NEW."type" IS DISTINCT FROM OLD."type" THEN
      changed := 'type';
    ELSIF NEW."makerId" IS DISTINCT FROM OLD."makerId" THEN
      changed := 'makerId';
    ELSIF NEW."subjectId" IS DISTINCT FROM OLD."subjectId" THEN
      changed := 'subjectId';
    ELSIF NEW."payload" IS DISTINCT FROM OLD."payload" THEN
      changed := 'payload';
    -- `payloadHash` is write-once ONCE SET rather than from birth: the shipped `approval.initiate`
    -- writes it at creation, but a request may legitimately be raised before its artifact is
    -- fingerprinted. Overwriting a hash that already exists is the post-approval edit that
    -- `approval_request_approved_binds_payload` exists to make detectable.
    ELSIF OLD."payloadHash" IS NOT NULL AND NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    THEN
      changed := 'payloadHash';
    END IF;

    IF changed IS NOT NULL THEN
      RAISE EXCEPTION
        'approval_request %: "%" is part of the WRITE-ONCE IDENTITY of a request (waqfId, type, '
        'makerId, subjectId, payload, payloadHash). Re-pointing it is how maker <> checker and '
        'per-endowment authority are defeated in the very UPDATE that satisfies them — the CHECK '
        'compares the POST image, so rewriting the operand rewrites the answer. Raise a NEW '
        'request instead (BR-105 / BR-1103, §10 §4).',
        OLD."id", changed
        USING ERRCODE = '42501';
    END IF;

    -- ── (0a) THE WRITE-ONCE **DECISION** (AV7-B, AV7-D1) ─────────────────────────────────────
    -- ONCE SET, exactly like `payloadHash` above: NULL -> value is the decision being taken;
    -- value -> anything else is a SECOND decision on one request.
    IF OLD."checkerId" IS NOT NULL AND NEW."checkerId" IS DISTINCT FROM OLD."checkerId" THEN
      decision := 'checkerId';
    ELSIF OLD."decidedAt" IS NOT NULL AND NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt" THEN
      decision := 'decidedAt';
    ELSIF OLD."decidedAtHijri" IS NOT NULL
      AND NEW."decidedAtHijri" IS DISTINCT FROM OLD."decidedAtHijri" THEN
      decision := 'decidedAtHijri';
    ELSIF OLD."checkerTotpAssertedAt" IS NOT NULL
      AND NEW."checkerTotpAssertedAt" IS DISTINCT FROM OLD."checkerTotpAssertedAt" THEN
      decision := 'checkerTotpAssertedAt';
    END IF;

    IF decision IS NOT NULL THEN
      RAISE EXCEPTION
        'approval_request %: "%" is part of the WRITE-ONCE DECISION of a request (checkerId, '
        'decidedAt, decidedAtHijri, checkerTotpAssertedAt) and is already recorded. ONE APPROVAL, '
        'ONE DECISION: re-attributing it is not a legal transition of the decision — it replaces '
        'the human who authorised the act, after the act, and MEASURED (AV7-D1c) on a run that had '
        'already paid, while the APPROVE audit event went on naming the original. The status '
        'lattice cannot see this, because it is gated on a status CHANGE and this UPDATE is not '
        'one. Retire the approval with status = ''VOID'' and raise a NEW request (BR-105 / '
        'BR-1103, §10 §4.3).',
        OLD."id", decision
        USING ERRCODE = '42501';
    END IF;

    -- ── (0b) SOFT-DELETE IS NOT A RETIREMENT PATH (C-13) ─────────────────────────────────────
    -- `approval_request_one_open_per_subject` is partial on `"deletedAt" IS NULL`, so setting
    -- `deletedAt` FREES the slot. Verified: the maker soft-deleted their own PENDING request and
    -- immediately raised a second one for the same subject — approval shopping — and soft-deleted
    -- an APPROVED row, retiring a Nazir's decision from every live query, including
    -- `qmulate_approval_defect` and `resolveApprover`'s `{ id, deletedAt: null }` read.
    --
    -- E2 added `VOID` precisely so retirement is REPRESENTABLE: it moves through the lattice, it
    -- is audited as a status change, and it leaves the row visible. Soft-delete is therefore
    -- allowed only for rows that are already terminal and already outside the index.
    IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN
      IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
        RAISE EXCEPTION
          'approval_request %: soft-deletion is one-way. Resurrecting a retired approval lets the '
          'maker choose, after the fact, which of two decided approvals is the live one.', OLD."id"
          USING ERRCODE = '42501';
      END IF;
      IF old_status IN ('PENDING', 'APPROVED') THEN
        RAISE EXCEPTION
          'approval_request %: a LIVE approval (%) is retired with status = ''VOID'', never by '
          'soft-delete. Soft-deleting it frees the one-open-per-subject slot and hides the '
          'decision from every live query, with no lattice transition to audit (§10 §4.3).',
          OLD."id", old_status
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ── the status lattice ─────────────────────────────────────────────────────────────────────
  -- PENDING -> APPROVED | REJECTED | VOID ;  APPROVED -> EXECUTED | VOID ;  terminal states stay.
  IF TG_OP = 'UPDATE' AND new_status IS DISTINCT FROM old_status THEN
    IF old_status IN ('REJECTED', 'EXECUTED', 'VOID') THEN
      RAISE EXCEPTION
        'approval_request %: % is terminal; % rejected. Re-deciding a closed approval is how a '
        'second authority is created through an UPDATE — raise a NEW request instead.',
        OLD."id", old_status, new_status
        USING ERRCODE = '42501';
    END IF;
    IF NOT (
         (old_status = 'PENDING'  AND new_status IN ('APPROVED', 'REJECTED', 'VOID'))
      OR (old_status = 'APPROVED' AND new_status IN ('EXECUTED', 'VOID'))
    ) THEN
      RAISE EXCEPTION
        'approval_request %: illegal status transition % -> %. Legal: PENDING -> '
        'APPROVED|REJECTED|VOID, APPROVED -> EXECUTED|VOID (§10 §4.3).',
        OLD."id", old_status, new_status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── who may be recorded as the approver ────────────────────────────────────────────────────
  IF new_status IN ('APPROVED', 'EXECUTED') THEN
    IF NEW."checkerId" IS NULL THEN
      RAISE EXCEPTION
        'approval_request %: status % requires a checkerId. An approval with no approver is not an '
        'approval (BR-105).', NEW."id", new_status
        USING ERRCODE = '42501';
    END IF;
    IF NOT qmulate_has_active_grant(NEW."checkerId", NEW."waqfId", 'NAZIR') THEN
      RAISE EXCEPTION
        'approval_request %: checkerId "%" holds no ACTIVE NAZIR waqf_access_grant on waqf "%". The '
        'Nazir is the sole approval authority, PER ENDOWMENT (BR-105 / BR-1103, §10 §4).',
        NEW."id", NEW."checkerId", NEW."waqfId"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_appr_authority$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · THE SWEEP — PUBLIC EXECUTES NOTHING IN SCHEMA public
--
-- ⚠ OWED EVEN THOUGH THIS FILE CREATES NO NEW FUNCTION, and the reason is worth writing down
-- rather than reasoning about each time: `CREATE OR REPLACE FUNCTION` PRESERVES the existing
-- `proacl`, so replacing a swept function does not re-open it. Migration 12 §9's finding was
-- about `proacl = NULL` on a FRESH function. Both functions here already exist and were already
-- swept — so this call is a no-op assertion, not a repair. It is here because the sweep is
-- idempotent and cheap, and because a reader should be able to confirm the posture from the file
-- that touched the functions rather than from three migrations away. Migration 21's note is the
-- other side of the same discipline: it declined the call and SAID SO.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regprocedure('qmulate_revoke_public_function_execute()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E6 migration 22: qmulate_revoke_public_function_execute() is missing. It is defined '
      'by migration 12 §9 and every later migration that touches a function in schema public '
      'depends on it; a database without it has not run the privilege-separation matrix.';
  END IF;
END
$$;

SELECT qmulate_revoke_public_function_execute();
