-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2 CORPUS & LEDGER RETENTION GUARDS.  HAND-AUTHORED. Never overwrite with
-- `prisma migrate dev`.
--
-- ── WHY THERE IS A SIXTH MIGRATION ───────────────────────────────────────────────────────────
-- Migration 4 closed hard `DELETE` on `waqf` (C-03) after a live `pg_trigger` census showed it was
-- "the only guarded table with no DELETE coverage". That sentence was true and the conclusion drawn
-- from it was too narrow: the census was run over the GUARDED tables. Run over ALL of them it says
-- something much worse — on a freshly migrated + seeded database, 2026-07-28, **every single
-- corpus- and ledger-bearing table had ZERO DELETE coverage**, and each one was measured to be
-- erasable from a raw connection with no audit event whatsoever:
--
--     table                    target                  deleted  audit_event delta
--     asset                    asset-001                     1  0     ← the CORPUS itself (asl / أصل)
--     expropriation            exp-001                       1  0     ← the istibdal record
--     transaction              exp-e-001                     1  0     ← the ledger
--     distribution_line_item   dli-dist-001-ben-001          1  0     ← who was paid what
--     distribution             dist-001                      1  0     ← a PAID, EXECUTED run
--     bank_account             bankacct-fake-acct-w1         1  0
--     nazir_fee                fee-001                       1  0
--     lease                    (constructed)                 1  0
--     trusteeship_deed         trust-waqf-001                1  0     ← the Nazir's appointment
--     beneficiary              ben-003                       1  0     ← entitlement + UBO dataset
--     reclassification_event   (constructed)                 1  0     ← classification history
--
-- `asset` is the sharpest of these and it is **Binding rule 1** territory. The *asl* (أصل) is the
-- endowed principal and a NON-DIMINUTION-OF-CORPUS INVARIANT ALWAYS HOLDS — "no operation may
-- distribute, erode, or reclassify corpus as income". A corpus asset row vanishing with no audit
-- event is the sharpest available violation of that invariant, and until this file it was PERMITTED.
-- It was reached in the round-2 re-attack by a SUBCONTRACTOR seat holding only compliance/document
-- write permissions, through `$executeRawUnsafe` on its own scoped Prisma client.
--
-- Migration 5 §2f gated `asset."titleDeedNumber"` behind a reserved matter and said so out loud in
-- its own header: "`asset` has no DELETE guard, so DELETE + re-INSERT still walks around this
-- exactly as it walked around the Shart guard as C-03." That is the hole this file closes — for
-- `asset` and for every sibling, in one change, because a guard on one table while its siblings stay
-- open is precisely how `waqf` came to be the only covered table in the first place.
--
-- ── WHAT THIS FILE CLOSES ────────────────────────────────────────────────────────────────────
--  N-3a  HARD `DELETE` IS REFUSED on `asset`, `expropriation`, `transaction`, `distribution`,
--        `bank_account`, `nazir_fee`, `lease`, `trusteeship_deed`, `beneficiary` and
--        `reclassification_event`. Refused OUTRIGHT, on `waqf_no_delete`'s pattern rather than on
--        migration 5's "is this row in the trail?" pattern — see the note in §1 for why the two
--        differ.
--  N-3b  HARD `DELETE` on `distribution_line_item` is refused ONCE THE RUN IS OUT OF COMPUTATION.
--        This one is conditional and the condition is deliberate; see §2b.
--  N-3c  `TRUNCATE` is refused on all of them. TRUNCATE fires NO row triggers, so a `BEFORE DELETE`
--        guard without a `BEFORE TRUNCATE` sibling is one statement from irrelevant — migration 4
--        §2g learned this on `waqf`, where the refusal came only from an accident of the FK cascade.
--  N-5   `qmulate_unaudited_grant_suppressions()` — a DETECTION function that lists every suppressed
--        `waqf_access_grant` seat the trail does not record. It does not prevent anything and does
--        not decide anything; see §3 for what it can and cannot buy, stated flatly.
--
-- ── WHAT THIS FILE DOES **NOT** CLOSE ────────────────────────────────────────────────────────
--   • ADR-0008's residual is UNTOUCHED. Every trigger here is DDL-droppable and
--     `ALTER TABLE … DISABLE TRIGGER`-able by the table OWNER, and on Railway the runtime connects
--     AS THE OWNER. Privilege separation is DEFERRED TO E12, the insider with application-database
--     credentials is INSIDE the threat model, and the hard gate stands: **no real client data before
--     E12.** Nothing in this file may be read as narrowing that residual.
--   • The SUPPRESSION ITSELF still leaves no audit event. §3 explains why a trigger cannot write
--     one, with the two blocking reasons, and leaves the product decision open.
--   • The CAUSE of the `asset` finding is not in this layer. A SUBCONTRACTOR seat should not reach
--     `asset` writes AT ALL; that is the force filter's permission-to-model mapping in
--     `packages/database/src/extensions/scoping.ts`, which this migration does not own.
--
-- ── HOUSE RULES FOLLOWED (from migrations 3, 4 and 5) ────────────────────────────────────────
--   • Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
--     `CREATE TRIGGER`, `qmulate_add_check()` for any CHECK.
--   • Table-dependent DDL lives in ONE re-appliable block, `qmulate_apply_e2_corpus_retention()`.
--   • `ENABLE ALWAYS` on EVERY trigger. A trigger created normally is `tgenabled = 'O'` and Postgres
--     SKIPS it after a plain `SET session_replication_role = 'replica'` — the Sprint-1 finding that
--     defeated gate G-1 outright.
--   • This migration REPLACES NO FUNCTION DEFINED BY AN EARLIER MIGRATION. Everything is additive,
--     so migration 4's re-entry ORDER is unchanged and simply gains a line at the end:
--         SELECT qmulate_apply_guards();
--         SELECT qmulate_apply_e2_guards();
--         SELECT qmulate_apply_e2_guard_gaps();
--         SELECT qmulate_apply_e2_grant_admission();
--         SELECT qmulate_apply_e2_corpus_retention();   -- new, additive, still last
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — THE DELETE RULE, AND WHY IT IS NOT MIGRATION 5's RULE
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Migration 5 §2c/§2d refuse `DELETE` only for a row the audit trail already names
-- (`qmulate_row_is_in_trail`). That predicate is right THERE, on the authorization plane, because a
-- grant can no longer be BORN outside a transaction that audits it — so "in the trail" and "real"
-- coincide, and the exempt set is exactly the integration suite's own raw scaffolding.
--
-- IT IS THE WRONG PREDICATE HERE, for a reason worth writing down. There is no admission control on
-- `asset` / `transaction` / `distribution`: a row CAN be born by raw INSERT with no event naming it.
-- A trail-conditional guard would therefore hand an attacker the erasure path for free — insert the
-- replacement row raw (untrailed, hence deletable), delete the real one… no: worse, and simpler.
-- The rows an attacker most wants to erase are the ones a raw INSERT created moments earlier while
-- covering tracks, and those are exactly the rows a trail-conditional guard would let them remove.
-- The predicate would protect the honest rows and expose the forged ones.
--
-- So: REFUSED OUTRIGHT, on `waqf_no_delete`'s pattern. Every one of these rows carries the >= 10-year
-- retention obligation (NFR-07 / BR-702) and every one of these tables already has `deletedAt` — the
-- soft-retirement path the rest of the schema uses — except `reclassification_event`, whose
-- retirement is a FURTHER event because it is a history table by construction.
--
-- WHAT THAT COSTS, SAID PLAINLY: the integration suite tears its own fixtures down with
-- `DELETE FROM "asset"` / `"distribution"`, so those cleanups must now say out loud that they are
-- disabling a guard (`retentionScaffoldingSql()` in `test/setup.ts`, the sibling of
-- `authzScaffoldingSql()`). That is the point rather than a workaround: migration 4 §3.4 deferred two
-- guards precisely to avoid a silent exemption, and being visible in the test source is what keeps
-- `assertGuardsInstalled()` able to catch a scaffolding leak.
--
-- ⚠ SURFACED, NOT RESOLVED (product scope, not fiqh): a row created IN ERROR now has no purge path
-- in Phase 1 on any of these tables — same consequence migration 4 recorded for `waqf`. Soft delete
-- plus a superseding record is the posture the whole schema takes. Confirm nobody expects a hard
-- purge before this reaches production data, and note that PDPL erasure requests against
-- `beneficiary` (which carries the UBO dataset) will meet this guard: that is a real
-- retention-vs-erasure conflict for the PDPL register, not a bug in the guard.

-- `TG_ARGV[0]` is the retirement instruction for THIS table, so one function serves every table and
-- the message still tells the caller what to do instead of only what not to do. A refusal that does
-- not name the legal alternative gets the guard deleted by the next person who hits it.
CREATE OR REPLACE FUNCTION qmulate_retention_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_retention_no_delete$
BEGIN
  RAISE EXCEPTION
    'DELETE on "%" is refused (row %). This row is corpus (asl / أصل) or ledger evidence: it '
    'carries a >= 10-year retention obligation (NFR-07 / BR-702) and the non-diminution-of-corpus '
    'invariant means no operation may erode it (Binding rule 1). Measured on a seeded database '
    'before this guard existed: the row went and "audit_event" did not move, so the erasure was '
    'both unaudited and unrecoverable — and DELETE + re-INSERT is how the Shart guard was defeated '
    'as C-03 and a grant''s write-once role as C-09. %',
    TG_TABLE_NAME, OLD."id", TG_ARGV[0]
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_retention_no_delete$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — THE TWO GUARDS THAT ARE NOT THE GENERIC ONE
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 2b. `distribution_line_item` — REFUSED ONCE THE RUN LEAVES COMPUTATION ───────────────────
-- This table is the ONLY one here with no `deletedAt` column, so an outright refusal would leave it
-- with no retirement path at all — and E5's distribution engine, which does not exist yet, has to be
-- able to re-compute a DRAFT run's lines. Migration 5 §2f states the rule this follows: "a guard
-- nobody can satisfy is a guard that gets deleted."
--
-- THE LINE IS DRAWN AT `PENDING_APPROVAL`, not at `EXECUTED`. A line item under review is the
-- artifact a Nazir is being asked to approve; deleting one changes what was approved after the fact,
-- and `payloadHash` binds the approval to the artifact precisely because that matters. `CANCELLED`
-- is on the refused side too: an abandoned run is the record of what was computed and abandoned.
--
-- FAIL CLOSED on a missing parent. `distributionId` is a real FK so an orphan should be
-- unreachable — but "should be unreachable" is not a reason to make the unreachable branch PERMIT.
--
-- ⚠ Note the interaction with `distribution_status_transition` (migration 3): `EXECUTED` and
-- `CANCELLED` are terminal and a status regression is refused, so a caller cannot walk a paid run
-- back to `DRAFT` to unlock its lines. That is what makes the conditional predicate safe rather than
-- merely convenient.
CREATE OR REPLACE FUNCTION qmulate_distribution_line_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dli_no_delete$
DECLARE
  parent_status text;
BEGIN
  SELECT d."status"::text INTO parent_status
    FROM "distribution" d
   WHERE d."id" = OLD."distributionId";

  IF parent_status IN ('DRAFT', 'COMPUTED') THEN
    RETURN OLD; -- still being computed; the lines are working state, not yet a record
  END IF;

  RAISE EXCEPTION
    'DELETE on "distribution_line_item" is refused (row %, run % is %). Once a run leaves '
    'computation its lines are the record of WHO WAS PAID WHAT — the artifact the Nazir approved '
    '(bound by "payloadHash") and, at EXECUTED, the record of money that moved (MP-29, BR-506, '
    'NFR-07 / BR-702). This table has no "deletedAt": retire the RUN (status = ''CANCELLED'') and '
    'record a NEW one, which is §08''s correction path — a paid run is never rewritten. Lines of a '
    'DRAFT or COMPUTED run are still deletable, so re-computation is unaffected.',
    OLD."id", OLD."distributionId", COALESCE(parent_status, '<no parent row>')
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_dli_no_delete$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — N-5: THE UNAUDITED SUPPRESSION OF A LIVE SEAT, MADE DETECTABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ── THE FINDING, REPRODUCED ──────────────────────────────────────────────────────────────────
-- A raw `UPDATE "waqf_access_grant" SET "revokedAt" = now()` on the seeded LIVE NAZIR seat
-- `grant-user-nazir-001-waqf-001`, measured 2026-07-28 on a freshly seeded database:
--
--     audit_event 131 -> 131                       (zero events; nothing to attribute it to)
--     qmulate_has_active_grant(NAZIR) true -> false (the endowment lost its approval authority)
--     events naming the grant in that transaction: 0
--     un-revoking afterwards: REFUSED [42501]      (migration 4's one-way property DOES hold)
--
-- Migration 5 §2a deliberately does not govern a pure NARROWING, and that reasoning stands: a
-- break-glass revocation of a compromised Nazir seat must not require the very access-matrix path
-- that is under suspicion. The half that is wrong is that the suppression leaves NO TRAIL.
--
-- ── WHY THIS IS A DETECTION FUNCTION AND NOT A TRIGGER THAT WRITES THE EVENT ──────────────────
-- The obvious fix — have a trigger append the `audit_event` §12 wants (`action = delete_soft`) — was
-- attempted on paper and is NOT SHIPPABLE INSIDE E2. Two independent blockers, both verified:
--
--   1. IT WOULD FORK THE HASH CHAIN. `runAuditedTransaction` reads `audit_chain_head` ONCE, at the
--      start of the transaction, and then carries `state.prevHash` IN MEMORY, inserting each event
--      chained onto the previous one while the HEAD ROW LAGS until `finalizeChain()`. A trigger
--      firing mid-transaction cannot see that in-memory value: it would chain onto the real tail,
--      and the application's next `appendEvent()` would chain onto ITS OWN last hash instead —
--      two rows claiming the same predecessor. `verifyChain()` cannot distinguish a fork from
--      tampering, and THREE integration files verify the whole chain end to end
--      (`audit-immutability` A6, `g1-replica-role-bypass`, `scope-denial-audit`). A deferred
--      constraint trigger firing at COMMIT would dodge the ordering problem, which leaves blocker 2.
--   2. IT WOULD REQUIRE A SECOND HIJRI IMPLEMENTATION, AND A SECOND CANONICALIZER.
--      `audit_event."occurredAtHijri"` is NOT NULL, and ADR-0007 decided there is exactly ONE
--      Umm al-Qura implementation, in `packages/domain` on Node `Intl`, precisely because two had
--      already drifted. A plpgsql conversion would be a third. And `rowHash` is SHA-256 over
--      `canonicalJson(serializeForAudit(payload))` — sorted keys, no whitespace, every numeric as a
--      string — so a trigger would need a second canonicalizer whose drift from the TypeScript one
--      breaks gate G-1 SILENTLY, on real data.
--
-- A side ledger outside the hash chain (a table in a non-`public` schema, so Prisma does not see
-- drift) WOULD work and is the honest third option — but it is an architecture decision about what
-- the evidence pack contains and what PDPL applies to, not a mechanical one. **SURFACED, NOT TAKEN.**
--
-- ── SO WHAT THIS BUYS, STATED WITHOUT DECORATION ─────────────────────────────────────────────
-- It converts a SILENT suppression into a DETECTABLE one. That is a detection property, not a
-- prevention property, and migration 5's header is right that the two must never be conflated. It
-- decides nothing about whether break-glass revocation may be unaudited — the operation is still
-- permitted, exactly as before.
--
-- ⚠ AND IT IS NOT A CONTROL UNTIL SOMETHING CALLS IT. `test/grant-suppression-trail.integration
-- .test.ts` calls it on every integration run, which is a standing check but only in CI. The
-- follow-up that makes it operational is wiring it into gate G-1's verifier
-- (`packages/database/src/**`, not owned here) or into the reporting layer, so a suppression nobody
-- authorised is SEEN rather than merely findable.
--
-- ── WHAT COUNTS AS "AUDITED", AND THE FALSE NEGATIVE THAT SHAPED IT ──────────────────────────
-- An `audit_event` naming the grant whose `after` payload carries a NON-NULL value for the
-- suppression column. Testing for the KEY instead of the VALUE would be a false negative: the CREATE
-- event's `after` is the whole row, so it already contains `"revokedAt": null`, and every grant ever
-- created would read as having an audited revocation. Measured, not assumed — an audited narrowing
-- through the ordinary delegate writes `action = UPDATE`, `before = {"revokedAt": null}`,
-- `after = {"revokedAt": "2026-07-01T00:00:00.000Z"}`.
--
-- ⚠ WORTH REPORTING BEYOND THIS FILE: **no shipped code path revokes a grant at all.** Nothing in
-- `packages/{api,database,auth}/src` writes a non-null `revokedAt`; `activateGrant()` only issues.
-- So today EVERY revocation is necessarily raw, and this function's "audited" branch describes a
-- path E11/E12 has yet to build. It is reachable now through `withAudit()` +
-- `waqfAccessGrant.update()` by a holder of `admin:access_matrix:write`, which is what the positive
-- control in the test exercises.
CREATE OR REPLACE FUNCTION qmulate_unaudited_grant_suppressions()
RETURNS TABLE (
  grant_id            text,
  user_id             text,
  waqf_id             text,
  grant_role          text,
  suppression_column  text,
  suppressed_at       timestamp,
  events_naming_grant bigint
)
LANGUAGE sql
STABLE
AS $qm_unaudited_suppressions$
  WITH suppressed AS (
    SELECT g."id", g."userId", g."waqfId", g."role"::text AS role, col, ts
      FROM "waqf_access_grant" g
      CROSS JOIN LATERAL (
        VALUES ('revokedAt', g."revokedAt"), ('deletedAt', g."deletedAt")
      ) AS v(col, ts)
     WHERE ts IS NOT NULL
  )
  SELECT s."id", s."userId", s."waqfId", s.role, s.col, s.ts,
         (SELECT count(*) FROM "audit_event" ae
           WHERE ae."entityType" = 'WaqfAccessGrant' AND ae."entityId" = s."id")
    FROM suppressed s
   WHERE NOT EXISTS (
     SELECT 1
       FROM "audit_event" ae
      WHERE ae."entityType" = 'WaqfAccessGrant'
        AND ae."entityId" = s."id"
        -- THE VALUE, not the key. See the false-negative note above.
        AND (ae."after" ->> s.col) IS NOT NULL
   )
   ORDER BY s."id", s.col;
$qm_unaudited_suppressions$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — qmulate_apply_e2_corpus_retention()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e2_corpus_retention()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_retention$
DECLARE
  spec  text[];
  tbl   text;
  hint  text;
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.1 the corpus / ledger tables — hard DELETE refused outright
  --
  -- Registered per table in a loop rather than written out ten times: migration 4 §2d records what
  -- hand-repeating a per-column comparison cost (an `ELSIF` that checked only the first of two
  -- guarded columns). The trigger NAME is `<table>_no_delete`, matching `waqf_no_delete` /
  -- `waqf_access_grant_no_delete`, so `assertGuardsInstalled()` and any future census read the same
  -- vocabulary.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    -- the corpus itself, and the two things that move it
    ['asset',                  'Set "deletedAt" instead — soft retirement is the only legal one. The corpus asset is the parcel the endowment is PROVED to own; an istibdal is recorded as a substitution (a replacement asset plus an "expropriation" row), never as an erasure of the original.'],
    ['expropriation',          'Set "deletedAt" instead. This row is the istibdal record — the government taking, the compensation, and the <= 10-business-day Authority notice. Erasing it erases the proof that corpus proceeds stayed corpus (Binding rule 1).'],
    ['reclassification_event', 'This table has no "deletedAt" because it IS history: record a FURTHER reclassification event instead. The classification a waqf held at a point in time decides which compliance obligations applied to it, so a missing step makes the obligation record unexplainable.'],
    -- the ledger and what is computed from it
    ['transaction',            'Set "deletedAt" instead. Every receipt is classified income-vs-capital at entry and the distribution waterfall consumes income only; a receipt that can be erased is a waterfall input nobody can reconstruct (Binding rule 1, ADR-0002).'],
    ['distribution',           'Set "deletedAt", or retire the run with status = ''CANCELLED'' — which is inside the lattice and audited. Deleting the run also strands its "distribution_line_item" children and removes the row that "distribution_authority" verified at commit (C-10).'],
    ['nazir_fee',              'Set "deletedAt" instead. The Nazir fee is deed-set (Art. 11) and is taken out of ghallah before distribution, so an erased fee row is an unexplained gap between gross revenue and what beneficiaries received.'],
    ['bank_account',           'Set "deletedAt" instead. Waqf funds sit on DEDICATED accounts with no commingling; the account row is what proves which endowment''s money moved where.'],
    ['lease',                  'Set "deletedAt" instead. The lease is the instrument the ghallah arises from, and its Ejar reference is the government-filing evidence for it.'],
    -- the people and the appointment
    ['trusteeship_deed',       'Set "deletedAt" instead. This row is the Nazir APPOINTMENT — primary or authorized-representative, jointly and severally liable (Nazarah reg. Art. 11(5)). Erasing it erases the basis on which every other act was performed.'],
    ['beneficiary',            'Set "deletedAt" instead. The row carries entitlement (branch, tabaqa, share) and the UBO / beneficial-owner dataset. ⚠ A PDPL erasure request meets this guard: that conflict belongs in the PDPL register, not in a DELETE.']
  ]
  LOOP
    tbl  := spec[1];
    hint := spec[2];

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_no_delete', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW '
      'EXECUTE FUNCTION qmulate_retention_reject_delete(%L)',
      tbl || '_no_delete', tbl, hint
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_no_delete');
  END LOOP;

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.2 distribution_line_item — conditional on the run's status (§2b)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS distribution_line_item_no_delete ON "distribution_line_item";
  CREATE TRIGGER distribution_line_item_no_delete
    BEFORE DELETE ON "distribution_line_item"
    FOR EACH ROW EXECUTE FUNCTION qmulate_distribution_line_reject_delete();
  ALTER TABLE "distribution_line_item" ENABLE ALWAYS TRIGGER distribution_line_item_no_delete;

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 4.3 TRUNCATE, on every table this file governs
  --
  -- TRUNCATE fires no ROW triggers at all, so §4.1 and §4.2 without this are one statement from
  -- irrelevant. `asset` and `distribution` already carry a `no_truncate` from migrations 4/5; the
  -- loop is idempotent (`DROP TRIGGER IF EXISTS` first) so re-creating them is harmless and keeps
  -- the set stated in ONE place rather than split across three files.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  FOREACH tbl IN ARRAY ARRAY[
    'asset', 'expropriation', 'reclassification_event', 'transaction', 'distribution',
    'distribution_line_item', 'nazir_fee', 'bank_account', 'lease', 'trusteeship_deed',
    'beneficiary'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_no_truncate', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT '
      'EXECUTE FUNCTION qmulate_reject_truncate()',
      tbl || '_no_truncate', tbl
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_no_truncate');
  END LOOP;
END;
$qm_apply_retention$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — APPLY
--
-- Fails LOUDLY on a missing prerequisite rather than skipping the guards: a database whose corpus
-- rows can be erased without a trace must never be mistaken for a healthy one.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset', 'expropriation', 'reclassification_event', 'transaction',
                           'distribution', 'distribution_line_item', 'nazir_fee', 'bank_account',
                           'lease', 'trusteeship_deed', 'beneficiary', 'waqf_access_grant',
                           'audit_event']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 corpus-retention migration ran BEFORE the Prisma-generated init migration. '
      'Missing table(s): %. See packages/database/prisma/sql/README.md.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_reject_truncate()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 corpus-retention migration ran BEFORE 00000000000004_e2_guard_gaps, which '
      'defines qmulate_reject_truncate(). Migrations apply in lexicographic directory order; this '
      'one must sort last.';
  END IF;

  PERFORM qmulate_apply_e2_corpus_retention();
END
$qm_apply$;
