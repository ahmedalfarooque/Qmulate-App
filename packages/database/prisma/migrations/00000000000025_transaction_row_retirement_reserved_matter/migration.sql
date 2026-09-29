-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — MIGRATION 25 · RETIRING A LEDGER ROW IS A RESERVED MATTER (owner ruling, AV7-F4)
--
-- Closes the DATABASE half of **AV7-F4** (MED-HIGH on the V-S7 adversarial register): a
-- soft-deleted CAPITAL receipt made the corpus INVISIBLE rather than visibly excluded.
-- Reproducers: `packages/api/test/av7-corpus-wall.integration.test.ts` A-6 and A-11.
--
-- ── WHAT WAS BROKEN, MEASURED ON THIS BRANCH BEFORE THIS FILE ───────────────────────────────
-- One statement, on `qmulate_app` — the RUNTIME credential, i.e. the role a compromised web
-- process holds — with no approval of any kind in session:
--
--     UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = <a CAPITAL receipt>
--       → {"rows":1,"error":null}
--
-- and the distribution run for that period went, in the probe's own output:
--
--     BEFORE  revenue 500000.00 · capitalReceipts 4200000.00   [CAPITAL_RECEIPTS_EXCLUDED raised]
--     AFTER   revenue 500000.00 · capitalReceipts       0.00   [flag ABSENT, excluded list EMPTY,
--                                                               no diagnostic, no trace step]
--
-- Income unchanged, so the disappearance could not be blamed on the period window. A-11 repeated
-- it through the REQUEST-PATH client (`ctx.db.$executeRawUnsafe`), so `extensions/scoping.ts`'s
-- own header — *"this does not survive raw SQL"* — is measured, not merely cited.
--
-- ⚠ AND THE BIRTH ROUTE WAS OPEN TOO, MEASURED HERE (rolled back), same role, no approval:
--
--     INSERT INTO "transaction" (… "receiptClass"='CAPITAL', "amountSar"='9000000.00',
--                                "deletedAt"=now()) → {"cmd":"INSERT","rowCount":1}
--
-- i.e. SAR 9,000,000 of istibdal proceeds recorded in the ledger and present in NO register. That
-- is AV3-03 one table over: `asset_identity_guard` gated the `deletedAt` TRANSITION and said
-- nothing about a row BORN retired, and migration 15 had to close it. This file does not repeat
-- the mistake — the guard is `BEFORE INSERT OR UPDATE` from the start.
--
-- ── THE OWNER'S RULING, WHICH DECIDES THE SHAPE (do NOT re-derive it) ───────────────────────
-- S4 owner-decision memo, **"S7 · AV7-F4", 2026-08-20: (a) UNIFORM.** Soft-deleting **any**
-- committed receipt — income or capital — is a **reserved-matter-gated act**, on Q-E5-1's logic:
-- *anything that changes what is distributable gets the gate*. The rejected alternative is
-- recorded in the memo (capital undeletable absolutely + income deletable as an audited ordinary
-- correction).
--
-- ⚠ **THE INCOME/CAPITAL DIFFERENCE APPEARS IN THE REFUSAL'S STATED REASON, NEVER IN ITS
-- STRICTNESS.** §1's body computes a different sentence for a CAPITAL receipt, an INCOME receipt
-- and an EXPENSE — and then applies the IDENTICAL test to all three. There is exactly one
-- `qmulate_reserved_matter_defect()` call in the body, deliberately, so no future edit can make
-- one class stricter than another without deleting a line that is asserted on in
-- `packages/database/test/guard-verb-coverage.integration.test.ts`.
--
-- ── WHAT THIS FILE INSTALLS ─────────────────────────────────────────────────────────────────
--   §1  `qmulate_transaction_row_retirement()` — the guard body.
--   §2  `transaction_row_retirement` — BEFORE INSERT OR UPDATE, ENABLE ALWAYS.
--   §3  The PUBLIC-EXECUTE sweep, which every migration creating a function owes.
--
-- ── THE SUBJECT AN APPROVAL MUST NAME, AND WHY IT IS THIS EXACT STRING ──────────────────────
--     transaction:<id>:deletedAt
--
-- Same shape as `asset:<id>:deletedAt` (migration 14/15) and `waqf:<id>:deletedAt` (migration 17
-- tier 2b, memo Q8), and verified by the SAME function — `qmulate_reserved_matter_defect(approval,
-- waqfId, subject)`, i.e. migration 4's eight conditions: the approval exists, is not
-- soft-deleted, is type `RESERVED_MATTER`, is `APPROVED` (not spent), belongs to THIS endowment,
-- has a non-null `checkerId`, was not self-approved, and names THIS artifact. ⊕ **IT COMPOSES
-- WITH Q8 BY CONSTRUCTION, NOT BY COINCIDENCE**: the three soft-delete gates are now one family
-- over one verifier, and `guard-verb-coverage.integration.test.ts`'s new family sweep asserts all
-- three together rather than as unrelated checks — which is AV4-01's lesson (*a guard family with
-- the same hole on N tables is ONE change, not N*) applied to the census as well as to the SQL.
--
-- ── ⚠ WHAT THIS FILE DELIBERATELY DOES **NOT** DO, EACH WITH ITS REASON ─────────────────────
--
-- 1. **IT ADDS NO `ReservedMatterKind`.** A retirement has no kind of its own, so a request must
--    be labelled with one of the eight that exist or with none. That is a REAL gap and it is
--    reported rather than papered over — but the DB gate is SUBJECT-bound, exactly like the two
--    siblings above (neither of which checks a kind either; no trigger in this repo reads
--    `reservedMatterKind`, verified by grep over every migration). Adding a value would require
--    ar/en copy in `packages/i18n/messages/*.json` plus `apps/web`'s label list, and that copy is
--    **product-approved text this change may not invent** (the `RECEIPT_CLASS_CORRECTION`
--    precedent). ⚠ WHOEVER BUILDS THE SOFT-DELETE **PROCEDURE** OWES BOTH: a kind, and its copy.
--    There is no such procedure today — measured: `softDelete()` in
--    `packages/database/src/extensions/audit.ts` is exported and has **zero** production callers,
--    and no router sets `deletedAt` on a `transaction`. So this gate breaks nothing that exists;
--    it forecloses a route.
--
-- 2. **IT DOES NOT GATE `beneficiary.deletedAt` OR `setting.deletedAt`, WHICH HAVE THE SAME
--    SHAPE.** MEASURED here, `qmulate_app`, no approval, each rolled back — both COMMIT:
--        UPDATE "beneficiary" SET "deletedAt" = now() …   → rowCount 1
--        UPDATE "setting"     SET "deletedAt" = now() …   → rowCount 1
--    and `assembleRun` filters BOTH on `deletedAt: null`, so either one silently changes what a
--    period pays (a head leaving a per-capita cohort raises every remaining share; a hidden
--    `nazirFee.percentOfRevenue` row changes the waterfall). ⚠ NOT GATED HERE FOR TWO DIFFERENT
--    REASONS, and neither is "we did not notice". (a) The owner's ruling is about a **receipt**;
--    a beneficiary is not a receipt, and who may remove a mustahiq from an endowment is a
--    governance question for him, not for this file (binding rule 4). (b) `setting.deletedAt` is
--    **legitimately written by the test harness today** — `packages/api/test/setup.ts`'s
--    `withGlobalSettingHidden()` and `setting-resolver.integration.test.ts` both soft-delete a
--    global `Setting` and restore it — so gating it is a change to those suites' contract and not
--    a one-line addition. Both are on the register as the next items in this family.
--
-- 3. **IT DOES NOT MAKE `transaction.id` IMMUTABLE.** MEASURED, `qmulate_app`, rolled back:
--    `UPDATE "transaction" SET "id" = …` COMMITS — `transaction` is not one of AV4-01's four
--    `*_id_immutable` tables (migration 16 covers `asset`, `waqf`, `beneficiary`,
--    `trusteeship_deed`). It does NOT weaken this gate — the subject names an id, so a renamed row
--    needs an approval naming the new id, which an attacker cannot mint — but a rename does break
--    the id a STORED run's `excludedCapitalReceipts` recorded. Reported, not fixed here: widening
--    migration 16's family is its own change with its own census entries.
--
-- ── ⚠ WHAT THE GATE CANNOT DO, STATED SO NOBODY QUOTES IT TOO WIDELY ────────────────────────
-- The table OWNER can `ALTER TABLE … DISABLE TRIGGER`, and a SUPERUSER can do more. `ENABLE
-- ALWAYS` closes the `session_replication_role = 'replica'` route and nothing else. The residual
-- therefore sits on the deployment fact that `MIGRATOR_DATABASE_URL` is absent from the web and
-- worker processes — which no test can assert, and which this repo says so elsewhere too.
-- **THAT IS EXACTLY WHY THE SECOND HALF OF AV7-F4 IS IN THE QUERY AND NOT ONLY HERE**: with
-- `ledgerWindowWhere` no longer pinning `deletedAt: null`, a row retired by ANY route — including
-- one this trigger never saw — is now SEEN by the run and refused BY NAME
-- (`LEDGER_ROW_SOFT_DELETED`), instead of silently vanishing from the corpus accounting. Two
-- layers, each testing the other; a single trusted side is this repo's standing lesson.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · THE GUARD BODY
--
-- ⚠ THE `OLD` / `NEW` CHOICE IS DELIBERATE. On UPDATE the subject, the endowment and the stated
-- reason are all read from **OLD** — the row as RECORDED, which is what an approval was minted
-- against. Reading `NEW."id"` there would let one statement rename a row and retire it under the
-- new name in the same breath (see note 3 in the header: `transaction.id` is not yet immutable).
-- On INSERT there is no OLD, so the subject is `NEW."id"` and the reason is read from NEW.
--
-- ⚠ IT RETURNS EARLY WHEN THE COLUMN DOES NOT MOVE. Every other UPDATE to a `transaction` — a
-- reconciliation stamp, the owner-ruled in-place `correctAmount` (memo Q-E5-2(b)), a bank
-- reference — passes through untouched. A guard that refuses everything is not a fix, and the
-- positive controls in `av7-corpus-wall.integration.test.ts` (A-1's `correctAmount`, PC-0's whole
-- run) are what hold that claim.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_transaction_row_retirement()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_txn_retire$
DECLARE
  approval    text;
  defect      text;
  subject     text;
  row_id      text;
  row_waqf    text;
  old_value   text;
  new_value   text;
  ledger_side text;
  why         text;
  verb        text;
BEGIN
  -- ── (1) DOES THIS STATEMENT MOVE THE COLUMN AT ALL? ────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NULL THEN
      RETURN NEW;
    END IF;
    row_id    := NEW."id";
    row_waqf  := NEW."waqfId";
    old_value := '<no prior row: this receipt is BORN retired>';
    new_value := NEW."deletedAt"::text;
    verb      := 'RECORDING A LEDGER ROW THAT IS ALREADY RETIRED';
  ELSE
    IF NEW."deletedAt" IS NOT DISTINCT FROM OLD."deletedAt" THEN
      RETURN NEW;
    END IF;
    row_id    := OLD."id";
    row_waqf  := OLD."waqfId";
    old_value := coalesce(OLD."deletedAt"::text, 'NULL');
    new_value := coalesce(NEW."deletedAt"::text, 'NULL');
    verb      := CASE
                   WHEN OLD."deletedAt" IS NULL THEN 'RETIRING A COMMITTED LEDGER ROW'
                   WHEN NEW."deletedAt" IS NULL THEN 'UN-RETIRING A RETIRED LEDGER ROW'
                   ELSE 'RE-DATING A RETIREMENT'
                 END;
  END IF;

  -- ── (2) THE STATED REASON DIFFERS BY CLASS. THE STRICTNESS DOES NOT. ───────────────────
  -- Product owner, 2026-08-20 (memo "S7 · AV7-F4"), option (a) UNIFORM. This block chooses a
  -- SENTENCE; it chooses no test. Exactly one gate follows, for all three arms.
  IF (TG_OP = 'INSERT' AND NEW."type" = 'REVENUE' AND NEW."receiptClass" = 'CAPITAL')
     OR (TG_OP <> 'INSERT' AND OLD."type" = 'REVENUE' AND OLD."receiptClass" = 'CAPITAL') THEN
    ledger_side := format('a CAPITAL receipt (asl / أصل, capitalSource=%s)',
                          coalesce(CASE WHEN TG_OP = 'INSERT' THEN NEW."capitalSource"::text
                                        ELSE OLD."capitalSource"::text END, 'NULL'));
    why := 'A retired capital receipt is CORPUS THE RUN CANNOT SEE. Measured before this guard: '
           'one soft delete took capitalReceiptsSar from 4200000.00 to 0.00, dropped '
           'CAPITAL_RECEIPTS_EXCLUDED from the flags, emptied excludedCapitalReceipts and left no '
           'diagnostic and no trace step — the corpus became INVISIBLE instead of VISIBLY '
           'EXCLUDED, which is the difference between a wall and a habit. Non-diminution cannot '
           'watch what it cannot see (Binding rule 1, ADR-0002).';
  ELSIF (TG_OP = 'INSERT' AND NEW."type" = 'REVENUE')
     OR (TG_OP <> 'INSERT' AND OLD."type" = 'REVENUE') THEN
    ledger_side := 'an INCOME receipt (ghallah / غلة)';
    why := 'A retired income receipt SHRINKS the distributable pool: every mustahiq is paid less '
           'out of a period, and the run reports the smaller figure as if it were the whole '
           'ghallah. ⚠ THE GATE IS THE SAME STRICTNESS AS THE CAPITAL ARM, by the product '
           'owner''s ruling of 2026-08-20 (option (a), UNIFORM) — anything that changes what is '
           'distributable gets the gate, and only the sentence you are reading differs.';
  ELSE
    ledger_side := format('an EXPENSE (%s)',
                          coalesce(CASE WHEN TG_OP = 'INSERT' THEN NEW."expenseCategory"::text
                                        ELSE OLD."expenseCategory"::text END, 'NULL'));
    why := 'A retired expense changes the waterfall''s operating leg (Σ OPERATIONS is deducted '
           'before the distributable) and removes a real bank movement from reconciliation, which '
           'is a BR-501 anti-commingling control. Same strictness as the two receipt arms, by the '
           'same ruling.';
  END IF;

  -- ── (3) THE ONE GATE ───────────────────────────────────────────────────────────────────
  approval := current_setting('qmulate.reserved_matter_approval_id', true);
  subject  := 'transaction:' || row_id || ':deletedAt';
  defect   := qmulate_reserved_matter_defect(approval, row_waqf, subject);

  IF defect IS NOT NULL THEN
    RAISE EXCEPTION
      '% on transaction % is a RESERVED MATTER. This row is %. "deletedAt" would move % -> %. '
      '% '
      'PRODUCT OWNER, 2026-08-20 (S4 owner-decision memo, "S7 · AV7-F4"): soft-deleting ANY '
      'committed receipt, income or capital, requires an approved reserved matter — the same '
      'logic as Q-E5-1''s reclassification gate, that anything changing what is distributable '
      'gets the gate. THE INCOME/CAPITAL DIFFERENCE IS IN THE REASON ABOVE, NEVER IN THE '
      'STRICTNESS. %. Go through withReservedMatter(), which verifies an APPROVED, maker <> '
      'checker RESERVED_MATTER approval for THIS endowment AND THIS artifact before it sets '
      'qmulate.reserved_matter_approval_id; the subject an approval must name is "%". '
      '⚠ AND NOTE WHAT AN APPROVAL BUYS: the retirement, not silence. `ledgerWindowWhere` no '
      'longer filters "deletedAt", so a legitimately retired row is SEEN by the next distribution '
      'run and refused by name (LEDGER_ROW_SOFT_DELETED) rather than dropped from the corpus '
      'accounting. If the intent is to CORRECT a receipt, the instrument is a superseding record '
      '— a mirroring reversal plus a re-entered row (finance.receiptClass.requestCorrection / '
      'executeCorrection, owner ruling Q-E5-1(b)) — never a retirement: a correction is never an '
      'edit in this system, and a reversed pair stays VISIBLE and nets to zero by exclusion.',
      verb, row_id, ledger_side, old_value, new_value, why, defect, subject
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_txn_retire$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · THE TRIGGER — `IU`, AND THE `I` IS NOT OPTIONAL
--
-- ⚠ `BEFORE INSERT OR UPDATE`, declared as ONE trigger rather than two, for migration 14 §4.6's
-- reason: the retention scaffolding wrappers suspend *the one named guard per table*, and a
-- sibling they do not know about silently defeats the wrapper (CENSUS-1's exact failure, which
-- migration 12 paid 24 falsely-skipped retention tests for).
--
-- ⚠ NO `D`, DELIBERATELY. DELETE and TRUNCATE on `transaction` have been migration 6's since S2
-- (`transaction_no_delete` / `transaction_no_truncate`), and `RETENTION_SCAFFOLDING_GUARDS` names
-- exactly one DELETE guard per table. A second `D` here is precisely the defect above.
--
-- ⚠ IT FIRES LAST OF THE FIVE (triggers fire in NAME order:
-- `transaction_corpus_class_immutable` < `_correction_shape` < `_dedicated_account_only` <
-- `_endowment_immutable` < `_row_retirement`). That ordering is a deliberate consequence rather
-- than an accident: a statement that BOTH reclassifies and retires should hear about the
-- reclassification first, because `transaction_corpus_class_immutable` is unconditional and this
-- guard is not — a caller holding a genuine retirement approval must not be told that their
-- approval is the problem.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS transaction_row_retirement ON "transaction";
CREATE TRIGGER transaction_row_retirement
  BEFORE INSERT OR UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION qmulate_transaction_row_retirement();

ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_row_retirement;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · EXECUTE IS REVOKED FROM PUBLIC ON THE FUNCTION THIS FILE CREATES
--
-- Not optional and not inherited: a freshly created function has `proacl = NULL`, which MEANS
-- EXECUTE TO PUBLIC, and `ALTER DEFAULT PRIVILEGES` stores nothing when no explicit
-- `pg_default_acl` row exists. Migration 12 §6 learned it, S6/E5 learned it again (three new
-- trigger functions landed PUBLIC-executable and posture assertion 1f went red naming all three).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
