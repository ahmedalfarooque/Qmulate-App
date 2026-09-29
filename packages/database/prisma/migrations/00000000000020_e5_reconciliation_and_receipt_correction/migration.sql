-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E5: THE RECONCILIATION KEY, AND THE RECEIPT-CORRECTION FLOW THE OWNER RULED ON.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- TWO OWNER RULINGS OF 2026-08-18 LAND HERE (S4 owner-decision memo, S6 addendum):
--
--   Q-E5-1(b)  A mis-classified receipt MAY be corrected, in BOTH directions, and EVERY such
--              correction requires an approved reserved matter. The flow is a SUPERSEDING
--              RECORD — a reversal entry plus a re-entered receipt, both audited — NEVER an edit.
--              *(Engineering had recommended asymmetric gating; the owner chose the stricter
--              uniform gate. This file implements the owner's answer, not engineering's.)*
--
--   Q-E5-2(b)  A committed receipt's `amountSar` MAY be corrected IN PLACE, with an audit event
--              carrying before/after. This deliberately departs from the superseding-record
--              convention used for the Shart, the trusteeship deed and the receipt class.
--
-- ⚠ MIGRATION 19'S CORPUS GUARD DOES NOT MOVE, AND THAT IS THE WHOLE POINT OF Q-E5-1(b).
-- `transaction_corpus_class_immutable` still refuses every in-place reclassification of a
-- committed CAPITAL receipt, unconditionally, with no approval id consulted. The correction flow
-- ADDS RECORDS; it does not open the column. A reader who takes "corrections are now allowed" to
-- mean the guard was relaxed has it exactly backwards: the guard is what forces the flow to be a
-- superseding record instead of an UPDATE.
--
-- ── WHAT THIS MIGRATION LANDS ────────────────────────────────────────────────────────────────
--   §1  `transaction."bankReference"` — the reconciliation's ONLY matching key.
--   §2  UNIQUE (waqfId, id) on `transaction` — the FK target for §3.
--   §3  `reversalOfId` / `correctionOfId` / `correctionApprovalRequestId`, with COMPOSITE foreign
--       keys, so a correction can never reach across endowments.
--   §4  `ReservedMatterKind` gains `RECEIPT_CLASS_CORRECTION`.
--   §5  TRIGGER `transaction_correction_shape` — a reversal must MIRROR its original exactly, a
--       row may be reversed at most once, and a reversal may not itself be reversed.
--   §6  The three TODO(surface) questions migration 19 raised are ANSWERED — recorded by
--       rewriting the guard messages that asked them.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · THE RECONCILIATION KEY
--
-- The reconciliation engine (`packages/domain/src/reconciliation`) matches a ledger entry to a
-- statement line on an EXPLICIT SHARED BANK REFERENCE and on nothing else. It had no column to
-- read: `Transaction` carried no bank reference at all, so every entry would have come back
-- `UNREFERENCED` and no run could ever have matched anything.
--
-- ⚠ THAT IS WORSE THAN IT SOUNDS, AND IT IS WHY THIS COLUMN IS PART OF THE EXIT CLAUSE. A
-- reconciliation in which nothing can ever match still REPORTS findings, so a suite asserting
-- "the run reports exceptions" would have passed over an engine that was structurally incapable
-- of reconciling anything. R6-C1's lesson one layer down: a generator that cannot reach a
-- configuration reports its silence as success.
--
-- NULLABLE, on purpose. `NULL` means NOBODY HAS RECORDED ONE — never "look it up by amount". An
-- unreferenced entry is a FINDING (`UNREFERENCED`), which is a piece of work for a human, not an
-- error and not a gap for a heuristic to close.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "bankReference" TEXT;

-- The reconciliation's hot query: one account's entries for a period, by reference.
CREATE INDEX IF NOT EXISTS "transaction_bankAccountId_bankReference_idx"
  ON "transaction" ("bankAccountId", "bankReference");

-- ⚠ NO UNIQUE CONSTRAINT ON `bankReference`, DELIBERATELY. Two ledger entries claiming one bank
-- reference is a REAL AND REPORTABLE CONDITION — the engine's `DUPLICATE_LEDGER_REFERENCE`
-- finding exists for it. A unique index would turn a finding a Nazir can see and resolve into an
-- insert failure at the moment of capture, which is how a bookkeeper learns to leave the field
-- blank. Migration 12's house rule: a constraint is the wrong place for a rule whose product half
-- is a workflow.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · FK TARGET — UNIQUE (waqfId, id) on `transaction`
--
-- Same shape and same reason as migration 19 §1: `id` is already the primary key, so this adds no
-- constraint the data did not satisfy. It exists so Postgres will ACCEPT the composite references
-- in §3, which is what makes a cross-endowment correction UNREPRESENTABLE rather than merely
-- refused by application code.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_waqfId_id_key" ON "transaction" ("waqfId", "id");

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · THE SUPERSEDING-RECORD LINKS
--
-- A correction under Q-E5-1(b) produces TWO NEW ROWS and touches the original's classification
-- not at all:
--
--     original      the mis-classified receipt. UNCHANGED. Still says what it said.
--     reversal      reversalOfId -> original. Mirrors it exactly (§5). Cancels it.
--     re-entry      correctionOfId -> original. Carries the CORRECTED classification.
--
-- ⚠ WHY A MIRROR AND NOT A NEGATIVE AMOUNT. `transaction_amount_nonnegative` holds: the sign is
-- carried by the transaction TYPE, never by the amount. A contra-entry with a negative figure is
-- therefore unrepresentable, and expressing the reversal as an EXPENSE would be worse — it would
-- book a corpus mis-classification as an operating outflow and corrupt the waterfall's step 2.
-- So the reversal is a row IDENTICAL to the original that declares itself a reversal, and the
-- pair nets to zero by EXCLUSION rather than by arithmetic.
--
-- ⚠ AND THAT EXCLUSION IS A QUERY CONTRACT, NOT A CONSTRAINT — SAID PLAINLY BECAUSE IT IS THE
-- WEAKEST LINK IN THIS FILE. Any consumer of the ledger (the distribution waterfall's income set,
-- a statement, the reconciliation) MUST exclude both a reversed original and its reversal.
-- Nothing in Postgres forces that. `packages/domain/src/ledger` ships the canonical predicate and
-- E6 owes using it when the waterfall's input is finally assembled from the database; until then
-- this is an obligation on the next epic, recorded here rather than assumed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "correctionOfId" TEXT;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "correctionApprovalRequestId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_reversal_of_same_waqf') THEN
    ALTER TABLE "transaction"
      ADD CONSTRAINT "transaction_reversal_of_same_waqf"
      FOREIGN KEY ("waqfId", "reversalOfId") REFERENCES "transaction" ("waqfId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_correction_of_same_waqf') THEN
    ALTER TABLE "transaction"
      ADD CONSTRAINT "transaction_correction_of_same_waqf"
      FOREIGN KEY ("waqfId", "correctionOfId") REFERENCES "transaction" ("waqfId", "id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "transaction_reversalOfId_idx"   ON "transaction" ("reversalOfId");
CREATE INDEX IF NOT EXISTS "transaction_correctionOfId_idx" ON "transaction" ("correctionOfId");

-- A row may be reversed AT MOST ONCE. Two reversals of one receipt would net the original to
-- MINUS one copy of itself under any exclusion rule that counts rows.
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_one_reversal_per_row"
  ON "transaction" ("reversalOfId") WHERE "reversalOfId" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §4 · `ReservedMatterKind` GAINS `RECEIPT_CLASS_CORRECTION`
--
-- The owner ruled that EVERY reclassification correction is reserved-matter-gated. An approval of
-- type RESERVED_MATTER already says WHAT it authorises through `reservedMatterKind`, and
-- `executeReservedAct` compares that kind — so without a member of its own, a receipt correction
-- would have to borrow one of the seven asset/deed kinds, and a mislabelled authority is worse
-- than an unlabelled one because the comparison then passes for the wrong act.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ TOP LEVEL, and `IF NOT EXISTS`, not wrapped in a DO block. `ALTER TYPE … ADD VALUE` inside a
-- DO block is a subtransaction, which Postgres refuses for this statement; the `IF NOT EXISTS`
-- form gives idempotence without one.
ALTER TYPE "ReservedMatterKind" ADD VALUE IF NOT EXISTS 'RECEIPT_CLASS_CORRECTION';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §5 · TRIGGER `transaction_correction_shape` — a reversal MIRRORS, it does not merely point
--
-- Without this, `reversalOfId` is a decorative column: a row could claim to reverse a
-- SAR 20,000,000 corpus receipt while itself being SAR 1 of income, and the pair would "net" to
-- a 19,999,999 corpus write-off that no guard ever saw. The link has to carry the mirror or it
-- carries nothing.
--
-- Enforced ON INSERT as well as UPDATE, because the reversal row is created, not amended.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_transaction_correction_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  orig RECORD;
BEGIN
  IF NEW."reversalOfId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."reversalOfId" = NEW."id" THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = format('transaction %s cannot reverse itself.', NEW."id");
  END IF;

  SELECT t."id", t."type", t."receiptClass", t."capitalSource", t."amountSar",
         t."bankAccountId", t."reversalOfId"
    INTO orig
    FROM "transaction" t WHERE t."id" = NEW."reversalOfId";

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = format('transaction %s reverses %s, which does not exist.',
                       NEW."id", NEW."reversalOfId");
  END IF;

  -- A reversal may not itself be reversed. Otherwise a chain nets to an arbitrary figure and no
  -- reader can tell which rows are live without walking the whole chain.
  IF orig."reversalOfId" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = format(
        'transaction %s is itself a reversal (of %s) and may not be reversed again. A correction '
        'is a superseding record, not a chain: re-correct the RE-ENTRY, so every row still names '
        'exactly what it cancels.', orig."id", orig."reversalOfId");
  END IF;

  IF NEW."type" IS DISTINCT FROM orig."type"
     OR NEW."receiptClass" IS DISTINCT FROM orig."receiptClass"
     OR NEW."capitalSource" IS DISTINCT FROM orig."capitalSource"
     OR NEW."amountSar" IS DISTINCT FROM orig."amountSar"
     OR NEW."bankAccountId" IS DISTINCT FROM orig."bankAccountId" THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = format(
        'a reversal must MIRROR the receipt it cancels exactly. transaction %s reverses %s but '
        'differs: type %s vs %s, receiptClass %s vs %s, capitalSource %s vs %s, amount %s vs %s, '
        'bankAccount %s vs %s. The pair nets to zero by EXCLUSION, not by arithmetic — a reversal '
        'that does not mirror is a partial write-off of corpus wearing a correction''s name '
        '(Binding rule 1, owner ruling Q-E5-1(b) 2026-08-18).',
        NEW."id", orig."id",
        NEW."type", orig."type",
        COALESCE(NEW."receiptClass"::text,'NULL'), COALESCE(orig."receiptClass"::text,'NULL'),
        COALESCE(NEW."capitalSource"::text,'NULL'), COALESCE(orig."capitalSource"::text,'NULL'),
        NEW."amountSar", orig."amountSar",
        NEW."bankAccountId", orig."bankAccountId");
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS transaction_correction_shape ON "transaction";
CREATE TRIGGER transaction_correction_shape
  BEFORE INSERT OR UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION qmulate_transaction_correction_shape();
-- `ENABLE ALWAYS`: a trigger left at 'O' is skipped by any session that sets
-- `session_replication_role = replica`.
ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_correction_shape;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §6 · MIGRATION 19'S THREE OPEN QUESTIONS ARE ANSWERED — the guard messages are rewritten
--
-- Migration 19 raised three TODO(surface) questions inside guard messages, because a message a
-- Nazir reads at the moment of refusal is the only documentation anybody is guaranteed to see.
-- The owner answered all three on 2026-08-18. Leaving the messages saying "this is an OPEN
-- PRODUCT QUESTION" would tell every future reader that a decision nobody has taken is still
-- pending — so the functions are replaced rather than left standing with stale prose.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_transaction_corpus_class_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."type" = 'REVENUE' AND OLD."receiptClass" = 'CAPITAL'
     AND NOT (NEW."type" = 'REVENUE' AND NEW."receiptClass" = 'CAPITAL') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format(
        'transaction %s is a CAPITAL receipt (asl / أصل) and may not be reclassified IN PLACE. '
        'It was type=%s receiptClass=%s capitalSource=%s; this statement would make it type=%s '
        'receiptClass=%s. Corpus and income are distinct and are never mixed: only income-class '
        'receipts enter the distribution waterfall, and capital receipts — sale proceeds, '
        'istibdal proceeds, expropriation compensation — flow back into corpus (Binding rule 1, '
        'ADR-0002). Reclassifying one here is not a bookkeeping correction, it is the '
        'non-diminution invariant being defeated in a single UPDATE: MEASURED before this guard, '
        'rev-004 (SAR 20,000,000 of expropriation compensation) was flipped to INCOME and became '
        'distributable while audit_event for the row did not move at all. '
        'A CORRECTION IS NEVER AN EDIT IN THIS SYSTEM. ✓ ANSWERED by the product owner on '
        '2026-08-18 (S4 memo Q-E5-1(b)): a mis-classified receipt MAY be corrected, in BOTH '
        'directions, and EVERY such correction requires an APPROVED RESERVED MATTER of kind '
        'RECEIPT_CLASS_CORRECTION. The flow is a SUPERSEDING RECORD — a reversal entry that '
        'mirrors this row exactly, plus a re-entered receipt carrying the corrected class, both '
        'audited. Use finance.receiptClass.requestCorrection / executeCorrection. THAT FLOW ADDS '
        'RECORDS AND DOES NOT OPEN THIS COLUMN: this guard is unconditional and consults no '
        'approval id, which is precisely what forces a correction to be a record rather than an '
        'UPDATE.',
        OLD."id", OLD."type", OLD."receiptClass", COALESCE(OLD."capitalSource"::text, 'NULL'),
        NEW."type", COALESCE(NEW."receiptClass"::text, 'NULL'));
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION qmulate_transaction_dedicated_account_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dedicated boolean;
  ref       text;
BEGIN
  SELECT b."isDedicated", b."accountRef" INTO dedicated, ref
    FROM "bank_account" b WHERE b."id" = NEW."bankAccountId";

  IF dedicated IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format(
        'transaction %s may not be posted to bank account %s (%s): it is not a DEDICATED waqf '
        'account. BR-501 requires dedicated account(s) per endowment and forbids commingling with '
        'personal or other-endowment funds; commingling is a zero-tolerance control (KPI 2). '
        '✓ ANSWERED by the product owner on 2026-08-18 (S4 memo Q-E5-3(a)): an isDedicated=false '
        'account IS deliberately REPRESENTABLE — an engagement may need to RECORD an account it '
        'does not control, e.g. a legacy commingled account during onboarding — and is '
        'PERMANENTLY UNPOSTABLE. The account may exist; nothing may ever post to it. That is the '
        'shipped behaviour, now owner-ruled rather than engineering''s reading.',
        NEW."id", NEW."bankAccountId", COALESCE(ref, 'unknown'));
  END IF;

  RETURN NEW;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §7 · THE SWEEP — PUBLIC EXECUTES NOTHING IN SCHEMA public
--
-- ⚠ NOT OPTIONAL AND NOT INHERITED, for the reason migration 12 §9 measured: a freshly created
-- function has `proacl = NULL`, which MEANS EXECUTE TO PUBLIC, and `ALTER DEFAULT PRIVILEGES`
-- stores nothing when no explicit `pg_default_acl` row exists. This migration creates one new
-- function and replaces two, so it owes the sweep. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
