-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2 RETENTION REMAINDER: THE CONFIGURATION, IDENTITY AND COMPLIANCE-EVIDENCE
-- TABLES MIGRATION 6 LEFT OPEN.  HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHY THERE IS AN EIGHTH MIGRATION ─────────────────────────────────────────────────────────
-- Migration 6 closed hard `DELETE` and `TRUNCATE` on eleven corpus- and ledger-bearing tables. It
-- named, in its own header, what it was NOT closing, and this file closes that remainder. A census
-- read from the LIVE `pg_trigger` catalogue over EVERY table in `public` — freshly migrated and
-- seeded, 2026-07-29 — measured the following. Every DELETE below was a real erasure inside a
-- transaction that was then rolled back, with the `audit_event` count read before and after:
--
--   table                   pg_trigger  DELETE (plain)        DELETE (replica role)  TRUNCATE   audit
--   setting                 NONE        **PERMITTED**         **PERMITTED**          PERMITTED  131->131
--   client                  NONE        FK-accident [23503]   **PERMITTED**          FK-acc.    131->131
--   waqif                   NONE        FK-accident [23503]   **PERMITTED**          FK-acc.    131->131
--   compliance_obligation   NONE        FK-accident [23503]   **PERMITTED**          FK-acc.    131->131
--   compliance_task         NONE        **PERMITTED**         **PERMITTED**          PERMITTED  131->131
--   government_filing       NONE        **PERMITTED**         **PERMITTED**          PERMITTED  131->131
--   zakat_filing            NONE        **PERMITTED**†        **PERMITTED**†         PERMITTED  131->131
--   deadline                NONE        **PERMITTED**†        **PERMITTED**†         PERMITTED  131->131
--   legal_case              NONE        **PERMITTED**†        **PERMITTED**†         PERMITTED  131->131
--
--   † the fixture seeds NO row in these three, so the probe CONSTRUCTED one first. A DELETE against
--     an empty table erases nothing and reads as "guarded" — one of the four false negatives round 3
--     caught in its own probes. The verdict above is from a probe that really removed a row.
--
-- TWO THINGS IN THAT TABLE ARE WORTH SAYING OUT LOUD.
--
--   1. `FK-accident [23503]` IS NOT A CONTROL. `client`, `waqif` and `compliance_obligation` refuse a
--      plain `DELETE` only because a child row happens to exist and the FK is RESTRICT/NO ACTION.
--      `SET session_replication_role = 'replica'` skips the INTERNAL RI triggers too, so ONE
--      statement turns all three into **PERMITTED** — measured, above — and it leaves the children
--      ORPHANED, pointing at a parent id that no longer exists. Referential integrity that evaporates
--      under a session GUC is an accident of the FK graph, exactly as migration 4 §2g found for
--      `waqf`'s TRUNCATE.
--
--   2. `TRUNCATE "client" CASCADE` was ALREADY refused before this file — and the refusal read
--      `TRUNCATE on "waqf" is refused`. It cascaded into `waqf`, which migration 4 guarded, and the
--      guard that fired belonged to a DIFFERENT table. That is the precise false negative migration 4
--      shipped and migration 6 fixed by requiring the refusal to NAME THE TABLE. Every TRUNCATE
--      assertion in `retention-remainder-truncate.integration.test.ts` therefore matches
--      `TRUNCATE on "<the target>" is refused`, so a cascade into a guarded neighbour can never be
--      mistaken for coverage of the target.
--
-- ── WHAT THIS FILE CLOSES ────────────────────────────────────────────────────────────────────
--  R-1  HARD `DELETE` IS REFUSED OUTRIGHT on `setting`, `client`, `waqif`, `compliance_obligation`,
--       `compliance_task`, `government_filing`, `zakat_filing`, `deadline` and `legal_case`. Outright,
--       on `qmulate_retention_reject_delete()`'s pattern and for its reason (§1).
--  R-2  `TRUNCATE` is refused on all nine, ON EACH TABLE'S OWN ACCOUNT.
--  R-3  `qmulate_unaudited_setting_suppressions()` — a DETECTION function over the one residual this
--       file cannot close with a DELETE guard: a raw `UPDATE "setting" SET "deletedAt" = now()`, which
--       makes a regulatory figure invisible to every reader with no audit event. §3, and read what it
--       does and does not buy there.
--
-- ── WHAT THIS FILE DOES **NOT** CLOSE ────────────────────────────────────────────────────────
--   • ADR-0008's RESIDUAL IS UNTOUCHED AND UNNARROWED. Every trigger here is DDL-droppable and
--     `ALTER TABLE … DISABLE TRIGGER`-able by the table OWNER, and on Railway the runtime connects AS
--     THE OWNER. Privilege separation is DEFERRED TO E12; the insider with application-database
--     credentials is INSIDE the threat model; the hard gate stands — **no real client data before
--     E12.** Nothing in this file may be read as narrowing that, and the test suite's own scaffolding
--     wrapper (`retentionRemainderScaffoldingSql()`) is the standing demonstration that it is real.
--   • `UPDATE` on `setting` IS NOT GOVERNED. A raw `UPDATE "setting" SET "value" = …` still rewrites a
--     fee basis or a statutory window with no audit event. §3 says why a trigger cannot write the
--     event (migration 6 §3's two blockers apply verbatim) and ships DETECTION for the suppression
--     half only. The value-rewrite half is REPORTED, not closed.
--   • `budget`, `vendor` and `maintenance_ticket` are DELIBERATELY LEFT UNGUARDED. §4 gives the
--     reason for each, one at a time. "It carries retention meaning" was not treated as sufficient.
--   • `membership` (client-tier roles, `membership_role_family_level_only`) and better-auth's `user` /
--     `account` / `session` have no DELETE coverage either. They are the identity plane rather than
--     this file's subject and are REPORTED, not guarded here.
--
-- ── HOUSE RULES FOLLOWED (migrations 3, 4, 5, 6) ──────────────────────────────────────────────
--   • Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` first.
--   • Table-dependent DDL in ONE re-appliable block, `qmulate_apply_e2_retention_remainder()`.
--   • `ENABLE ALWAYS` on EVERY trigger. A trigger created normally is `tgenabled = 'O'` and Postgres
--     SKIPS it after a plain `SET session_replication_role = 'replica'` — the Sprint-1 finding that
--     defeated gate G-1, and the very GUC that turns three of the FK accidents above into erasures.
--   • REPLACES NO FUNCTION DEFINED BY AN EARLIER MIGRATION. Migration 6's
--     `qmulate_retention_reject_delete()` is reused UNCHANGED for nothing — its message reads "this
--     row is corpus (asl / أصل) or ledger evidence", which is false of a `setting` or a `client`, so
--     this file defines its OWN generic refusal rather than editing a shipped one. Re-entry order
--     gains one line at the end:
--         SELECT qmulate_apply_guards();
--         SELECT qmulate_apply_e2_guards();
--         SELECT qmulate_apply_e2_guard_gaps();
--         SELECT qmulate_apply_e2_grant_admission();
--         SELECT qmulate_apply_e2_corpus_retention();
--         SELECT qmulate_apply_e2_retention_remainder();   -- new, additive, still last
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — THE DELETE RULE: OUTRIGHT, NOT TRAIL-CONDITIONAL
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Migration 5 refuses `DELETE` only for a row the audit trail already names, and that predicate is
-- right THERE because `waqf_access_grant` has admission control: a grant cannot be BORN outside a
-- transaction that audits it, so "in the trail" and "real" coincide.
--
-- NONE of the nine tables here has admission control. A row can be born by raw `INSERT` with no event
-- naming it, so a trail-conditional guard would protect the honest rows and leave exactly the forged
-- ones deletable — migration 6 §1's reasoning, unchanged, and it applies with more force to `setting`
-- than to anything migration 6 governed: a forged per-waqf override that changes a fee basis is
-- precisely the row an attacker would want to insert and then remove.
--
-- So: REFUSED OUTRIGHT. All nine have a `deletedAt` column — the soft-retirement path the rest of the
-- schema uses — so a legal retirement route exists for every one of them, which is what stops this
-- being "a guard nobody can satisfy" (migration 5 §2f).
--
-- ⚠ SURFACED, NOT RESOLVED (product scope, not fiqh) — AND SHARPER HERE THAN IN MIGRATION 6.
-- Migration 6 recorded that a row created IN ERROR now has no hard-purge path. On three of these
-- tables the soft-delete route does not free the row's identity either, because the unique key does
-- not exclude soft-deleted rows:
--     setting             UNIQUE ("waqfId", "key")
--     government_filing   UNIQUE ("waqfId", "platform")
--     zakat_filing        UNIQUE ("waqfId", "fiscalYear")
-- So "soft-delete it and record a replacement" is NOT available for those three: the slot stays
-- occupied. Today that costs nothing, because — verified across `packages/{api,database}/src` — NO
-- SHIPPED CODE PATH WRITES A NON-NULL `deletedAt` ON ANY OF THEM. `settings.set` upserts through
-- `createSettingResolver(...).set()`; there is no "unset this override" procedure at all, and the
-- resolver's only interest in `deletedAt` is that it reads `deletedAt: null`. Whoever builds the
-- unset/correction path in E11 must decide between a partial unique index
-- (`… WHERE "deletedAt" IS NULL`) and a supersede-in-place update. Naming it now so that decision is
-- made deliberately rather than discovered by a 23505 in production.
--
-- ⚠ AND THE PDPL CONFLICT WIDENS. Migration 6 recorded it for `beneficiary`. `client` and `waqif` are
-- named natural persons too (`nameAr` is Arabic-authoritative and required), so a PDPL erasure request
-- against a family or a founder now meets this guard as well. That is a real
-- retention-versus-erasure conflict for the PDPL compliance register — which CLAUDE.md lists as an
-- unwritten load-bearing gap — and not a bug in the guard.

-- `TG_ARGV[0]` is the retirement instruction for THIS table, so one function serves all nine and the
-- refusal still tells the caller what to do instead of only what not to do. Migration 6 §1's reason
-- for that, verbatim: a refusal that does not name the legal alternative gets the guard deleted by the
-- next person who hits it.
CREATE OR REPLACE FUNCTION qmulate_remainder_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_remainder_no_delete$
BEGIN
  RAISE EXCEPTION
    'DELETE on "%" is refused (row %). This row is configuration, identity or compliance evidence '
    'under a >= 10-year retention obligation (NFR-07 / BR-702), and it was measured erasable with '
    '"audit_event" not moving at all — so the erasure was unaudited, unattributable and '
    'unrecoverable. DELETE + re-INSERT is also how a write-once rule gets defeated: that is how the '
    'Shart al-Waqif was substituted (C-03) and how a grant''s immutable role was rewritten (C-09). %',
    TG_TABLE_NAME, OLD."id", TG_ARGV[0]
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_remainder_no_delete$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — WHY EACH OF THE NINE IS GUARDED
--
-- Stated per table rather than as one sweep, because "it is a table and tables should be guarded" is
-- how a guard set stops being defensible. The per-table sentence also becomes the refusal's hint.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- setting                 EVERY regulatory figure in the system lives here — the SAR 200M/50M
--                         classification bands, the 30/15/10-business-day windows, the 3-month
--                         post-FYE distribution window, the >= 10-year retention period, the 10%
--                         ʿushr Nazir fee and the Authority's own <= 10%-of-net-income fee. All of
--                         them are ⚠ UNVERIFIED against primary Saudi law (Binding rule 3), which is
--                         exactly why they are configuration and not constants. Deleting a per-waqf
--                         OVERRIDE is the sharpest case: the resolver falls back to the global value
--                         with no error and no event, so a fee basis or a statutory deadline changes
--                         SILENTLY for one endowment. Deleting a GLOBAL row makes the resolver
--                         fail closed instead — safer, still unattributable.
-- client                  The engagement grouping and the parent of `membership` (client-tier roles).
--                         A named family; erasing it orphaned three `waqif` rows in the measurement
--                         above.
-- waqif                   The FOUNDER (واقف). The Shart al-Waqif is immutable and amendable only via
--                         an authority-gated reserved matter (Binding rule 1) — but the Shart is
--                         stored on `waqf`, and before this file the PERSON whose binding intent it
--                         records could be erased out from under it, leaving `waqf."waqifId"`
--                         dangling. An immutable condition whose author can be deleted is not
--                         immutable in any sense a court would recognise.
-- compliance_obligation   The obligation CATALOGUE: code, section, `gate` (which classification the
--                         obligation applies to) and `deadlineRuleKey`. Migration 6 guarded
--                         `reclassification_event` because "the classification a waqf held at a point
--                         in time decides which compliance obligations applied to it". This is the
--                         other half of that same sentence: erase the obligation and every
--                         `compliance_task` pointing at it becomes a task nobody can say the purpose
--                         of. Under the replica role the FK did not stop it.
-- compliance_task         The per-endowment INSTANCE, with `status`, `startDate` and `closeDate` —
--                         the record of whether a statutory duty was discharged, and when.
-- government_filing       The manual filing status against Awqaf Digital, Baladi, Istihkam, Muqeem,
--                         Qiwa and Ejar (BR-603). `accepted` is the Authority's "registered". This is
--                         the evidence that a filing was made — or the evidence that it was not.
-- zakat_filing            BR-509: fiscal year, status and amount. Same class of evidence, plus a
--                         figure.
-- deadline                Computed by the deadline engine, but NOT a disposable projection:
--                         `businessDaysUsed` is deliberately a SNAPSHOT of the window actually
--                         applied "so a later Setting change never silently rewrites history" (the
--                         schema's own words), and `satisfiedAt` / `escalatedAt` are facts about what
--                         happened. Deleting the row rewrites that history by erasure — the exact
--                         thing the snapshot column exists to prevent. Unlike the three above,
--                         `deadline` has no unique key, so soft-delete-and-supersede genuinely works.
-- legal_case              BR-612. A judicial matter's forum, status and hearing dates. §10's grid
--                         already treats it as authority-bearing (`R W A*` for the Nazir), and a case
--                         is frequently ABOUT the corpus — an expropriation dispute, a title
--                         challenge, an entitlement claim.


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — R-3: THE RESIDUAL A DELETE GUARD CANNOT REACH, MADE DETECTABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ── THE RESIDUAL, STATED WITHOUT DECORATION ──────────────────────────────────────────────────
-- Once hard `DELETE` is refused, the cheapest way to make a regulatory figure stop applying is
-- `UPDATE "setting" SET "deletedAt" = now()`. Every reader filters `deletedAt: null` (see
-- `packages/api/src/context.ts` — the resolver's per-waqf and global lookups both do), so a
-- soft-deleted override vanishes from resolution and the global value silently takes over. No audit
-- event is written, because nothing in `src/**` writes `deletedAt` on `setting` at all: the operation
-- is necessarily raw today.
--
-- ── WHY THIS IS A DETECTION FUNCTION AND NOT A TRIGGER THAT WRITES THE EVENT ──────────────────
-- Migration 6 §3's two blockers apply verbatim and were re-checked, not assumed:
--   1. IT WOULD FORK THE HASH CHAIN. `runAuditedTransaction` reads `audit_chain_head` once and then
--      carries `prevHash` IN MEMORY while the head row lags until `finalizeChain()`. A trigger firing
--      mid-transaction cannot see that value; it would chain onto the real tail and the application's
--      next `appendEvent()` would chain onto its own — two rows claiming one predecessor, which
--      `verifyChain()` cannot distinguish from tampering.
--   2. IT WOULD NEED A SECOND HIJRI IMPLEMENTATION AND A SECOND CANONICALIZER.
--      `audit_event."occurredAtHijri"` is NOT NULL and ADR-0007 decided there is exactly ONE
--      Umm al-Qura implementation, in `packages/domain` on Node `Intl`, because two had already
--      drifted. `rowHash` is SHA-256 over `canonicalJson(serializeForAudit(payload))`; a plpgsql
--      canonicalizer whose output drifts from the TypeScript one breaks gate G-1 SILENTLY.
--
-- ── SO WHAT THIS BUYS ────────────────────────────────────────────────────────────────────────
-- It converts a SILENT suppression into a DETECTABLE one. That is a detection property, not a
-- prevention property, and the two must never be conflated. The suppression is still PERMITTED,
-- exactly as before. AND IT IS NOT A CONTROL UNTIL SOMETHING CALLS IT: the integration suite calls it
-- on every run, which is a standing check in CI only. Wiring it into gate G-1's verifier or the
-- reporting layer is the follow-up that makes it operational, and that code is not owned here.
--
-- THE VALUE, NOT THE KEY — the same false negative migration 6 §3 measured. A `Setting` CREATE event's
-- `after` is the whole row and therefore already contains `"deletedAt": null`, so a test for the KEY
-- would report every setting ever created as having an audited suppression. Verified on this database:
--   audit_event."after" for setting-classification.threshold.large.sar => { …, "deletedAt": null, … }
CREATE OR REPLACE FUNCTION qmulate_unaudited_setting_suppressions()
RETURNS TABLE (
  setting_id            text,
  setting_key           text,
  waqf_id               text,
  tier                  text,
  suppressed_at         timestamp,
  events_naming_setting bigint
)
LANGUAGE sql
STABLE
AS $qm_unaudited_setting_suppressions$
  SELECT s."id",
         s."key",
         s."waqfId",
         CASE WHEN s."waqfId" IS NULL THEN 'global' ELSE 'endowment' END,
         s."deletedAt",
         (SELECT count(*) FROM "audit_event" ae
           WHERE ae."entityType" = 'Setting' AND ae."entityId" = s."id")
    FROM "setting" s
   WHERE s."deletedAt" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM "audit_event" ae
        WHERE ae."entityType" = 'Setting'
          AND ae."entityId" = s."id"
          -- THE VALUE, not the key. See the false-negative note above.
          AND (ae."after" ->> 'deletedAt') IS NOT NULL
     )
   ORDER BY s."id";
$qm_unaudited_setting_suppressions$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — THE THREE TABLES DELIBERATELY LEFT UNGUARDED, ONE REASON EACH
--
-- Each carries some retention meaning, which is why they were candidates. None is corpus, ledger,
-- authority or filing evidence, and a guard set that grows by reflex stops being defensible — so each
-- verdict is stated with its reason and can be argued with.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- budget — NOT GUARDED.
--   It is an ESTIMATE: `revenueEstimate`, `expenseEstimate`, one row per (waqf, fiscal year). The only
--   fact about the past on it is `approvedAt`. What actually happened lives in `transaction` and
--   `distribution`, both refused outright by migration 6, so erasing a budget destroys no evidence of
--   any act, moves no money and touches the non-diminution invariant nowhere. Nothing in the BRD or
--   the Nazarah regulation obliges retention of a superseded plan.
--   Second, concrete reason: `packages/api/test/domain-write-gate.integration.test.ts` uses `budget`
--   AS ITS PROBE TABLE for the ADR-0008 child-create residual, precisely because — in its own words —
--   "migration 6 refuses a DELETE on `asset` … `budget` is not in that guard's table list". Guarding
--   it would remove the last unguarded, waqf-scoped, `finance:*`-governed table that residual can be
--   demonstrated against, and would break a file outside this change's ownership. If the retention
--   verdict were the other way that would be a coordination cost to pay; it is not.
--
-- vendor — NOT GUARDED.
--   Global reference data (deliberately NOT waqf-scoped): a subcontractor registry of names, licence
--   numbers and roles. It records no act, no amount and no endowment. The schema has ALREADY decided
--   this table is disposable and said why: `maintenance_ticket."vendorId"` is "a plain column, not an
--   FK — Vendor is a global registry, not waqf-scoped, and a ticket must survive vendor de-listing."
--   Guarding it would contradict the schema's own stated intent.
--   ⚠ WHAT IS WORTH REPORTING INSTEAD: `licenseNo` / `licenseExpiry` are the evidence that a licensed
--   subcontractor was engaged (BR-305 / BR-603) — but they are MUTABLE CURRENT STATE on a shared
--   registry row, so they do not evidence what the licence was AT THE TIME of the engagement, guard or
--   no guard. The gap is that no ticket, document or transaction SNAPSHOTS the licence. That is a data
--   model finding for E7, not something a DELETE trigger fixes.
--
-- maintenance_ticket — NOT GUARDED.
--   The ṣiyāna argument is the tempting one — maintenance is reserved from ghallah BEFORE any
--   operating cost, Nazir fee or distribution, so it comes off the top of what beneficiaries receive,
--   and its justification looks like it belongs under retention. It does not live here: the table has
--   NO amount column at all (`kind`, `status`, `openedAt`, `vendorId`, `assetId`). The ṣiyāna money is
--   a `transaction` row with an expense category, and `transaction` is refused outright by migration 6;
--   the supporting paperwork is a `document`, and `document_retention_guard` has covered that since
--   migration 1. What remains here is operational work-tracking whose every financial and evidentiary
--   consequence is already in a guarded table.
--   Stated for the record: `packages/database/test/nested-write-audit.integration.test.ts` deletes its
--   own tickets raw and would need the scaffolding wrapper if this verdict were reversed. That file is
--   outside this change's ownership — which is a reason to reverse the verdict as ONE COORDINATED
--   CHANGE if someone disagrees with the paragraph above, and NOT a reason for the verdict.


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — qmulate_apply_e2_retention_remainder()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e2_retention_remainder()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_remainder$
DECLARE
  spec text[];
  tbl  text;
  hint text;
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 5.1 hard DELETE refused outright, one trigger per table
  --
  -- Registered in a loop rather than written out nine times, for migration 4 §2d's reason: a
  -- hand-repeated per-table block is where the copy that checks the wrong column comes from. The
  -- trigger NAME is `<table>_no_delete`, the vocabulary `waqf_no_delete` /
  -- `waqf_access_grant_no_delete` / `asset_no_delete` already use, so `assertGuardsInstalled()` and
  -- any future census read one grammar.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    -- configuration: every regulatory figure in the system, all of them ⚠ unverified
    ['setting',               'Set "deletedAt" instead, through the AUDITED path. ⚠ Removing a per-waqf OVERRIDE makes the resolver fall back to the GLOBAL value with no error and no event — a silent change to a fee basis or a statutory window for one endowment. Change the figure through settings.set (Nazir approval + TOTP) rather than removing the row. Note UNIQUE ("waqfId","key") does not exclude soft-deleted rows, so the key stays occupied.'],
    -- identity: the family and the founder
    ['client',               'Set "deletedAt" instead. This row groups the engagement and parents the client-tier "membership" roles; erasing it orphans every "waqif" beneath it. ⚠ A PDPL erasure request meets this guard — that conflict belongs in the PDPL register, not in a DELETE.'],
    ['waqif',                'Set "deletedAt" instead. This row is the FOUNDER (واقف). The Shart al-Waqif is immutable and amendable only by an authority-gated reserved matter (Binding rule 1); erasing the person whose binding intent it records leaves "waqf"."waqifId" dangling and the condition authorless. ⚠ PDPL: same conflict as "client".'],
    -- compliance evidence: what applied, whether it was done, and what was filed
    ['compliance_obligation','Set "deletedAt" instead. This is the obligation CATALOGUE (code, section, classification gate, deadline rule). Erasing one leaves every "compliance_task" naming it unexplainable — the same reason "reclassification_event" is guarded, from the other end.'],
    ['compliance_task',      'Set "deletedAt" instead. Status, start date and close date are the record of whether a statutory duty was discharged and when; a missing task is indistinguishable from a duty that never applied.'],
    ['government_filing',    'Set "deletedAt" instead, or set "status" = ''n_a'' — the status IS the record (BR-603), and "accepted" is the Authority''s "registered". Erasing the row erases the evidence that a filing was made, or that it was not. Note UNIQUE ("waqfId","platform") does not exclude soft-deleted rows.'],
    ['zakat_filing',         'Set "deletedAt" instead, or correct "status"/"amountSar" in place (BR-509). Note UNIQUE ("waqfId","fiscalYear") does not exclude soft-deleted rows, so soft-delete does NOT free the year for a replacement row.'],
    ['deadline',             'Set "deletedAt" and record a superseding deadline — there is no unique key here, so that route is fully available. "businessDaysUsed" is a deliberate snapshot of the window actually applied so a later Setting change never silently rewrites history; deleting the row rewrites it by erasure, and "satisfiedAt"/"escalatedAt" are the record of whether a statutory window was met or blown.'],
    ['legal_case',           'Set "deletedAt" instead and record a superseding case row. A judicial matter''s forum, status and hearing dates are the government-and-legal evidence for a dispute that is often ABOUT the corpus (BR-612).']
  ]
  LOOP
    tbl  := spec[1];
    hint := spec[2];

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_no_delete', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW '
      'EXECUTE FUNCTION qmulate_remainder_reject_delete(%L)',
      tbl || '_no_delete', tbl, hint
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', tbl, tbl || '_no_delete');
  END LOOP;

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 5.2 TRUNCATE, on every table this file governs
  --
  -- TRUNCATE fires NO row triggers, so §5.1 without this is one statement from irrelevant. Reuses
  -- migration 4's `qmulate_reject_truncate()`, whose message NAMES `TG_TABLE_NAME` — which is what
  -- lets a test tell "this table is guarded" apart from "the statement cascaded into a guarded
  -- neighbour", the false negative migration 4 shipped on `waqf` and this file measured again on
  -- `TRUNCATE "client" CASCADE` (refused, naming "waqf").
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  FOREACH tbl IN ARRAY ARRAY[
    'setting', 'client', 'waqif', 'compliance_obligation', 'compliance_task',
    'government_filing', 'zakat_filing', 'deadline', 'legal_case'
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
$qm_apply_remainder$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — APPLY
--
-- Fails LOUDLY on a missing prerequisite rather than skipping the guards: a database whose every
-- regulatory figure can be erased without a trace must never be mistaken for a healthy one.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['setting', 'client', 'waqif', 'compliance_obligation',
                           'compliance_task', 'government_filing', 'zakat_filing', 'deadline',
                           'legal_case', 'audit_event']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 retention-remainder migration ran BEFORE the Prisma-generated init migration. '
      'Missing table(s): %. See packages/database/prisma/sql/README.md.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_reject_truncate()') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 retention-remainder migration ran BEFORE 00000000000004_e2_guard_gaps, which '
      'defines qmulate_reject_truncate(). Migrations apply in lexicographic directory order; this '
      'one must sort last.';
  END IF;

  PERFORM qmulate_apply_e2_retention_remainder();
END
$qm_apply$;
