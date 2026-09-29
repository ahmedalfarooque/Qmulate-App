-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E5: ANTI-COMMINGLING AS STRUCTURE, AND THE CORPUS GUARD.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- TWO SENTENCES THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     1. (G-2 / BR-501) A ROW BELONGING TO ONE ENDOWMENT CANNOT POINT AT ANOTHER ENDOWMENT'S
--        ROW. Not "is refused" — UNREPRESENTABLE.
--     2. (Binding rule 1 / ADR-0002) A COMMITTED CAPITAL RECEIPT CANNOT BECOME INCOME.
--        `asl` (أصل) does not turn into `ghallah` (غلة) by an UPDATE.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ── WHAT WAS MEASURED BEFORE THIS FILE, AND IT IS WHY THE FILE IS THIS SIZE ──────────────────
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- As the LEAST-privileged runtime role `qmulate_app` (`DATABASE_URL`), on a `--reset` →
-- `migrate deploy` → `db:seed` database at migration 18. Every one of these COMMITTED:
--
--   G-2 was not partly enforced. It was not enforced AT ALL, on TEN edges across SIX tables:
--
--     1  INSERT "transaction" (waqfId = waqf-001) → "bank_account" of waqf-003
--     2  INSERT "transaction" (waqfId = waqf-001) → "asset" of waqf-002
--     3  UPDATE "transaction"."bankAccountId" across endowments
--     4  UPDATE "transaction"."waqfId" on a committed receipt   ← moves money between endowments
--     5  UPDATE "transaction"."amountSar" on a committed receipt
--     6  INSERT "bank_account" with isDedicated = false, then post a receipt to it
--     7  INSERT "distribution_line_item" on dist-001 (waqf-001) paying ben-004 (waqf-002)
--     8  INSERT "document" (waqf-001) → "beneficiary" of waqf-002
--     9  INSERT "lease" (waqf-001) → "asset" of waqf-002
--     10 INSERT "expropriation" (waqf-001) → "asset" of waqf-002
--
--   Edge 7 is the gravest: a distribution run belonging to one endowment paying a person who is
--   not a beneficiary of it. KPI 2 calls commingling zero-tolerance; this was the shape that
--   makes it a payment rather than a bookkeeping error.
--
--   ⚠ EDGES 7–10 WERE FIRST PROBED AND CAME BACK "REFUSED" — AND THAT WAS THE PROBE'S OWN SQL
--   FAILING ON WRONG COLUMN NAMES, NOT A GUARD BITING. A vacuous negative: R6-C1's lesson
--   ("a property whose generator cannot reach a configuration reports its silence as success")
--   one layer down. Re-probed with the real column shapes, all four commit. THE RULE THIS
--   GENERATES, and every test in `e5-anticommingling.integration.test.ts` follows it: A REFUSAL
--   IS ONLY EVIDENCE WHEN IT CARRIES THE GUARD'S OWN MESSAGE. Never assert on an exit status.
--
--   AND THE CORPUS GUARD (S2 handover row 10, logged open to E5/E6 since 2026-07-28):
--
--     UPDATE "transaction" SET "receiptClass" = 'INCOME', "capitalSource" = NULL
--      WHERE "id" = 'rev-004';
--
--     → COMMITTED. rev-004 is waqf-003's EXPROPRIATION_COMPENSATION receipt — SAR 20,000,000 of
--       CORPUS — and it became distributable ghallah. `audit_event` for that row moved 1 → 1:
--       IT DID NOT MOVE. So the erosion was unaudited, unattributable and unrecoverable, in one
--       statement, from the least-privileged role.
--
--   ⚠ WHY THE EXISTING CHECKS DID NOT SEE IT, precisely — because "we already have constraints"
--   is the sentence that let this live for three sprints. Migration 1 installed four CHECKs and
--   they are all still correct: a REVENUE row must carry a class; an EXPENSE must carry none; a
--   CAPITAL row must name a `capitalSource`; an INCOME row must not. EVERY ONE OF THEM IS
--   SATISFIED BY THE STATEMENT ABOVE, because it moves `receiptClass` and `capitalSource`
--   TOGETHER. A CHECK constrains a row; it cannot see that the row used to be corpus. That is a
--   TRIGGER's question, and there was no trigger.
--
--   ⚠ AND THERE IS A SECOND DOOR, WHICH THE OBVIOUS FIX MISSES:
--     UPDATE "transaction" SET "type" = 'EXPENSE', "receiptClass" = NULL, "capitalSource" = NULL
--   also satisfies all four CHECKs and erases the classification of a corpus receipt entirely.
--   §3's guard is therefore written against the STATE the row leaves, not against one column.
--
-- ── WHAT THIS MIGRATION LANDS ────────────────────────────────────────────────────────────────
--   §1  UNIQUE (waqfId, id) on `bank_account`, `asset`, `distribution` — FK TARGETS.
--   §2  `distribution_line_item` gains `waqfId` (backfilled, then NOT NULL). It had none, so it
--       could not be tied to anything.
--   §3  SEVEN COMPOSITE FOREIGN KEYS — edges 1, 2, 7, 8, 9, 10, and the line-item's parent link.
--   §4  TRIGGER `transaction_corpus_class_immutable`   — a CAPITAL receipt stays CAPITAL.
--   §5  TRIGGER `transaction_endowment_immutable`      — a committed receipt does not change
--                                                        endowment or bank account (edges 3, 4).
--   §6  TRIGGER `transaction_dedicated_account_only`   — BR-501's "personal funds" leg (edge 6).
--
-- ── WHAT IS DELIBERATELY *NOT* HARDENED HERE, AND WHY ────────────────────────────────────────
-- Migration 12 set the house rule and it governs here: a CHECK or trigger is the WRONG place for
-- a rule whose PRODUCT half is unconfirmed, because it makes relaxing the rule a migration and it
-- converts a refusal a Nazir can see and dispute into a SQLSTATE.
--
--   · **WHETHER A MIS-ENTERED RECEIPT MAY BE CORRECTED AT ALL** is the product owner's, and it is
--     NOT pre-answered by §3. Those are different questions and the distinction is load-bearing:
--     §3 kills the IN-PLACE MUTATION, which is binding rule 1 as structure and is uncontested.
--     A CORRECTION, in this house, is never an edit — the Shart (ADR-0006) and the trusteeship
--     deed (memo Q10) both correct by SUPERSEDING RECORD. So if the owner rules that a
--     mis-classified receipt may be corrected, the shape is a REVERSAL ENTRY PLUS A RE-ENTERED
--     RECEIPT, both audited — which ADDS A FLOW and never re-opens this column.
--     TODO(surface): does a correction flow exist, and behind which gate? (a) none — the record
--     stands and the error is explained in the audit trail; (b) a reserved-matter approval;
--     (c) only in the corpus-PROTECTING direction (INCOME → CAPITAL). Subject: `rev-004`.
--   · **`amountSar` ON A COMMITTED RECEIPT IS LEFT MUTABLE** (edge 5), deliberately and visibly.
--     Bank statements really are corrected, and refusing an amount correction with no correction
--     flow built would make a data-entry typo permanent. It is named in the register rather than
--     guarded on a guess.
--     TODO(surface): is a committed receipt's amount correctable, by whom, and does it need the
--     same superseding shape?
--   · **WHICH RECEIPT TYPES ARE CAPITAL** is register item #8 and is NOT touched. The enum
--     `CapitalSource` models the vocabulary; nothing here rules that any particular receipt
--     belongs to it. The Sharia review is UNSIGNED (ADR-0002 §3). Fixture data only.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §0 · PRE-FLIGHT — name the offending rows rather than dying on a bare FK violation.
--
-- If any of these reports rows, the database ALREADY CONTAINS commingled data and the composite
-- FKs below cannot be created. Failing here, naming the ids, is strictly better than failing on
-- `23503 insert or update on table … violates foreign key constraint` with no row named.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(msg, E'\n  ') INTO offenders FROM (
    SELECT 'transaction ' || t."id" || ': waqfId=' || t."waqfId"
             || ' but bank_account ' || b."id" || ' belongs to ' || b."waqfId" AS msg
      FROM "transaction" t JOIN "bank_account" b ON b."id" = t."bankAccountId"
     WHERE b."waqfId" <> t."waqfId"
    UNION ALL
    SELECT 'transaction ' || t."id" || ': waqfId=' || t."waqfId"
             || ' but asset ' || a."id" || ' belongs to ' || a."waqfId"
      FROM "transaction" t JOIN "asset" a ON a."id" = t."assetId"
     WHERE a."waqfId" <> t."waqfId"
    UNION ALL
    SELECT 'lease ' || l."id" || ': waqfId=' || l."waqfId"
             || ' but asset ' || a."id" || ' belongs to ' || a."waqfId"
      FROM "lease" l JOIN "asset" a ON a."id" = l."assetId"
     WHERE a."waqfId" <> l."waqfId"
    UNION ALL
    SELECT 'expropriation ' || e."id" || ': waqfId=' || e."waqfId"
             || ' but asset ' || a."id" || ' belongs to ' || a."waqfId"
      FROM "expropriation" e JOIN "asset" a ON a."id" = e."assetId"
     WHERE a."waqfId" <> e."waqfId"
    UNION ALL
    SELECT 'document ' || d."id" || ': waqfId=' || d."waqfId"
             || ' but beneficiary ' || bn."id" || ' belongs to ' || bn."waqfId"
      FROM "document" d JOIN "beneficiary" bn ON bn."id" = d."beneficiaryId"
     WHERE bn."waqfId" <> d."waqfId"
    UNION ALL
    SELECT 'distribution_line_item ' || li."id" || ': distribution ' || ds."id"
             || ' belongs to ' || ds."waqfId" || ' but beneficiary ' || bn."id"
             || ' belongs to ' || bn."waqfId"
      FROM "distribution_line_item" li
      JOIN "distribution" ds ON ds."id" = li."distributionId"
      JOIN "beneficiary" bn ON bn."id" = li."beneficiaryId"
     WHERE bn."waqfId" <> ds."waqfId"
  ) AS s;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE_E5_PREFLIGHT: this database already contains CROSS-ENDOWMENT rows, so the '
      'anti-commingling foreign keys cannot be created. Commingling is a zero-tolerance control '
      '(BR-501 / KPI 2), so these rows are not migrated around — they are a finding. Offending '
      'rows:%s  %s', E'\n', offenders;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · FK TARGETS — UNIQUE (waqfId, id)
--
-- A composite FK needs a UNIQUE on exactly its referenced columns. `id` is already the primary
-- key, so `(waqfId, id)` is unique for free — the index exists to make Postgres ACCEPT the
-- reference, not to add a constraint the data did not already satisfy. Precedent:
-- `beneficiary_waqfId_id_key`, migration 12 §7, which is what makes the lineage edge
-- cross-endowment-proof.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS "bank_account_waqfId_id_key" ON "bank_account" ("waqfId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "asset_waqfId_id_key"        ON "asset"        ("waqfId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "distribution_waqfId_id_key" ON "distribution" ("waqfId", "id");

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · `distribution_line_item` GAINS `waqfId`
--
-- It had NO endowment column at all — it reached the endowment only through `distributionId`.
-- That is why edge 7 was unreachable by any constraint: there was nothing on the line item to
-- compare the beneficiary's endowment against. The column is DERIVED from the parent run and
-- then both edges are tied, so the three ids cannot disagree.
--
-- ⚠ THIS TOUCHES E6's TABLE FROM AN E5 MIGRATION, DELIBERATELY. AV4-01's lesson: a guard family
-- with the same hole on N tables is ONE migration, not N. Splitting it would ship a
-- half-enforced invariant and leave the gravest edge for a later sprint to rediscover.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE "distribution_line_item" ADD COLUMN IF NOT EXISTS "waqfId" TEXT;

UPDATE "distribution_line_item" li
   SET "waqfId" = ds."waqfId"
  FROM "distribution" ds
 WHERE ds."id" = li."distributionId"
   AND li."waqfId" IS DISTINCT FROM ds."waqfId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "distribution_line_item" WHERE "waqfId" IS NULL) THEN
    RAISE EXCEPTION
      'QMULATE_E5_PREFLIGHT: a distribution_line_item has no reachable parent distribution, so '
      'its endowment cannot be derived. A payout line whose endowment is unknown must not be '
      'migrated into a NOT NULL column by guessing.';
  END IF;
END
$$;

ALTER TABLE "distribution_line_item" ALTER COLUMN "waqfId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "distribution_line_item_waqfId_idx"
  ON "distribution_line_item" ("waqfId");

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · THE COMPOSITE FOREIGN KEYS — G-2 AS STRUCTURE
--
-- MATCH SIMPLE (Postgres's default) is what makes the nullable edges correct: when ANY column of
-- the key is NULL the constraint is satisfied without a lookup. `transaction.assetId` and
-- `document.beneficiaryId` are legitimately NULL (a receipt not tied to a parcel; an endowment-level
-- document), and those rows are unaffected. A NON-NULL value, however, must belong to the same
-- endowment — there is no third state.
--
-- The single-column FKs stay. They are not redundant: they carry the ON DELETE behaviour, and a
-- composite FK's failure message names the composite constraint, which is what a reader needs.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- edge 1 · a receipt's bank account belongs to the receipt's endowment
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_waqfId_bankAccountId_fkey') THEN
    ALTER TABLE "transaction"
      ADD CONSTRAINT "transaction_waqfId_bankAccountId_fkey"
      FOREIGN KEY ("waqfId", "bankAccountId") REFERENCES "bank_account" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- edge 2 · a receipt's parcel belongs to the receipt's endowment
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_waqfId_assetId_fkey') THEN
    ALTER TABLE "transaction"
      ADD CONSTRAINT "transaction_waqfId_assetId_fkey"
      FOREIGN KEY ("waqfId", "assetId") REFERENCES "asset" ("waqfId", "id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- edge 9 · a lease's parcel belongs to the lease's endowment
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_waqfId_assetId_fkey') THEN
    ALTER TABLE "lease"
      ADD CONSTRAINT "lease_waqfId_assetId_fkey"
      FOREIGN KEY ("waqfId", "assetId") REFERENCES "asset" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- edge 10 · an expropriation's parcel belongs to the expropriation's endowment
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expropriation_waqfId_assetId_fkey') THEN
    ALTER TABLE "expropriation"
      ADD CONSTRAINT "expropriation_waqfId_assetId_fkey"
      FOREIGN KEY ("waqfId", "assetId") REFERENCES "asset" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- edge 8 · a document's beneficiary belongs to the document's endowment.
  --          This is also a §10 §5 isolation edge: the force filter narrows Document by
  --          `beneficiaryId = beneficiarySelfId`, and a cross-endowment attachment would put one
  --          endowment's file inside another endowment's beneficiary's own-record view.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_waqfId_beneficiaryId_fkey') THEN
    ALTER TABLE "document"
      ADD CONSTRAINT "document_waqfId_beneficiaryId_fkey"
      FOREIGN KEY ("waqfId", "beneficiaryId") REFERENCES "beneficiary" ("waqfId", "id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- edge 7 · THE GRAVEST — a payout line's beneficiary belongs to the run's endowment…
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'distribution_line_item_waqfId_beneficiaryId_fkey') THEN
    ALTER TABLE "distribution_line_item"
      ADD CONSTRAINT "distribution_line_item_waqfId_beneficiaryId_fkey"
      FOREIGN KEY ("waqfId", "beneficiaryId") REFERENCES "beneficiary" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- …and the line's own endowment is its parent run's. Both are needed: the first ties the
  -- beneficiary to `li.waqfId`, this ties `li.waqfId` to the run. Without it, `waqfId` could be
  -- set to the beneficiary's endowment and the pair would agree with each other while disagreeing
  -- with the run that is paying.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'distribution_line_item_waqfId_distributionId_fkey') THEN
    ALTER TABLE "distribution_line_item"
      ADD CONSTRAINT "distribution_line_item_waqfId_distributionId_fkey"
      FOREIGN KEY ("waqfId", "distributionId") REFERENCES "distribution" ("waqfId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §4 · THE CORPUS GUARD — a committed CAPITAL receipt stays CAPITAL
--
-- Written against the STATE THE ROW LEAVES, not against one column, because there are at least
-- two ways out and a column-wise guard catches one of them:
--
--     receiptClass CAPITAL → INCOME  (with capitalSource nulled in the same statement)
--     type         REVENUE → EXPENSE (with both classification columns nulled)
--
-- Both satisfy every CHECK migration 1 installed. The predicate here is therefore:
-- IF THE OLD ROW WAS A CAPITAL RECEIPT, THE NEW ROW MUST STILL BE ONE.
--
-- ⚠ This does NOT seal the row. Everything else about a CAPITAL receipt still moves —
-- `reconciledAt`, `descriptionAr`, `category`, `deletedAt`. E5 needs those to work. What is
-- sealed is the one transition that turns corpus into distributable income.
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
        'transaction %s is a CAPITAL receipt (asl / أصل) and may not be reclassified. '
        'It was type=%s receiptClass=%s capitalSource=%s; this statement would make it type=%s '
        'receiptClass=%s. Corpus and income are distinct and are never mixed: only income-class '
        'receipts enter the distribution waterfall, and capital receipts — sale proceeds, '
        'istibdal proceeds, expropriation compensation — flow back into corpus (Binding rule 1, '
        'ADR-0002). Reclassifying one here is not a bookkeeping correction, it is the '
        'non-diminution invariant being defeated in a single UPDATE: MEASURED before this guard, '
        'rev-004 (SAR 20,000,000 of expropriation compensation) was flipped to INCOME and became '
        'distributable while audit_event for the row did not move at all. A CORRECTION IS NEVER '
        'AN EDIT IN THIS SYSTEM — the Shart al-Waqif (ADR-0006) and the trusteeship deed '
        '(owner-decision memo Q10) both correct by superseding record, and a mis-classified '
        'receipt would correct the same way: a reversal entry plus a re-entered receipt, both '
        'audited. Whether such a flow exists, and behind which gate, is an OPEN PRODUCT QUESTION '
        '(TODO(surface)) — it would add a flow, never re-open this column.',
        OLD."id", OLD."type", OLD."receiptClass", COALESCE(OLD."capitalSource"::text, 'NULL'),
        NEW."type", COALESCE(NEW."receiptClass"::text, 'NULL'));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS transaction_corpus_class_immutable ON "transaction";
CREATE TRIGGER transaction_corpus_class_immutable
  BEFORE UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION qmulate_transaction_corpus_class_immutable();
-- `ENABLE ALWAYS`, never plain ENABLE: a trigger left at 'O' is skipped by any session that sets
-- `session_replication_role = replica`, which is exactly the escape S2 round 6 closed elsewhere.
ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_corpus_class_immutable;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §5 · A COMMITTED RECEIPT DOES NOT CHANGE ENDOWMENT OR BANK ACCOUNT (edges 3 and 4)
--
-- The composite FK in §3 makes an INCOHERENT pair unrepresentable — but a COHERENT pair can still
-- be moved wholesale: `SET "waqfId" = 'waqf-002', "bankAccountId" = <waqf-002's account>` satisfies
-- the FK perfectly and relocates the money. An FK constrains agreement, not identity.
--
-- Moving a receipt between endowments is not a correction of anything. The receipt records that a
-- specific endowment's bank account received a specific sum; if it was entered against the wrong
-- endowment, both endowments' records are wrong and the fix is two entries, not one relabelling.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_transaction_endowment_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."waqfId" IS DISTINCT FROM OLD."waqfId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format(
        'transaction %s may not change endowment (%s → %s). A receipt records that ONE '
        'endowment''s dedicated account received a sum; relabelling it moves money between two '
        'endowments'' records in a single statement and leaves both wrong. Commingling is a '
        'zero-tolerance control (BR-501 / KPI 2). The composite foreign key stops an INCOHERENT '
        'pair; this stops a COHERENT pair being moved wholesale, which the foreign key cannot '
        'see. Enter the correction as its own transactions on each endowment.',
        OLD."id", OLD."waqfId", NEW."waqfId");
  END IF;

  IF NEW."bankAccountId" IS DISTINCT FROM OLD."bankAccountId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format(
        'transaction %s may not change bank account (%s → %s). Which dedicated account received '
        'the money is part of what the receipt asserts and is the leg bank reconciliation '
        '(BR-503 / FIN-ACC-04) matches against; re-pointing it silently invalidates a completed '
        'reconciliation. TODO(surface): a genuine account-correction flow is not designed yet — '
        'it is named in the E5 register rather than guessed at here.',
        OLD."id", OLD."bankAccountId", NEW."bankAccountId");
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS transaction_endowment_immutable ON "transaction";
CREATE TRIGGER transaction_endowment_immutable
  BEFORE UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION qmulate_transaction_endowment_immutable();
ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_endowment_immutable;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §6 · BR-501's OTHER LEG — NO POSTING TO A NON-DEDICATED ACCOUNT (edge 6)
--
-- BR-501: "Manage dedicated waqf bank account(s) per endowment; PREVENT COMMINGLING WITH PERSONAL
-- or other-endowment funds." §1–§5 close the other-endowment half. This is the personal half:
-- `BankAccount.isDedicated` existed since S1 with `@default(true)` and NOTHING read it, so an
-- account could be created with `isDedicated = false` and receipts posted to it — measured, both
-- committed.
--
-- ⚠ THE GUARD IS ON THE POSTING, NOT ON THE ACCOUNT. Whether a non-dedicated account should be
-- REPRESENTABLE at all is a product question (a real engagement may need to record an account it
-- does not control — an inherited one mid-transfer, a tenant's escrow). Refusing the row would
-- answer that question by migration; refusing the POSTING enforces BR-501's actual sentence and
-- leaves the answer where it belongs.
-- TODO(surface): should `isDedicated = false` be representable, and if so what is such an account
-- FOR, given nothing may be posted to it?
-- ═══════════════════════════════════════════════════════════════════════════════════════════
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
        'personal or other-endowment funds — a zero-tolerance control (KPI 2). "isDedicated" '
        'existed from Sprint 1 and nothing read it, so this posting committed before this guard.',
        NEW."id", NEW."bankAccountId", COALESCE(ref, '?'));
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS transaction_dedicated_account_only ON "transaction";
CREATE TRIGGER transaction_dedicated_account_only
  BEFORE INSERT OR UPDATE ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION qmulate_transaction_dedicated_account_only();
ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_dedicated_account_only;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §7 · THE SWEEP — PUBLIC EXECUTES NOTHING IN SCHEMA public
--
-- ⚠ NOT OPTIONAL, AND NOT INHERITED. Migration 12 §9 measured the Postgres fact this depends on:
-- `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC` stores NOTHING when no explicit
-- `pg_default_acl` row exists, so migration 10's protection for FUTURE functions never held. A
-- freshly created function has `proacl = NULL`, which MEANS EXECUTE TO PUBLIC.
--
-- The three trigger functions above were created with exactly that default, and the posture
-- assertion caught them on the first full run of this migration — `1f · no SECURITY DEFINER
-- function is executable by PUBLIC` went red naming all three. It worked as designed: the
-- assertion exists so that the FIRST `SECURITY DEFINER` function cannot slip through, and it does
-- not wait for one to appear before complaining. None of these three is `SECURITY DEFINER`, so
-- nothing here was a live escalation — the invariant is "PUBLIC executes nothing", and an
-- exception kept because it is currently harmless is precisely how the dangerous one gets in.
--
-- `qmulate_revoke_public_function_execute()` is migration 12's helper and its own comment says
-- "CALL THIS AT THE END OF ANY MIGRATION THAT CREATES A FUNCTION IN SCHEMA public". Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
