-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2 GUARD GAPS.  HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- WHY THERE IS A FOURTH MIGRATION.  `00000000000003_e2_authority_guards` stated the sentence
--
--     The Nazir is the sole approval authority, per endowment, and never the maker.
--
-- and then left six ways to walk around it. Every one was reproduced from a RAW connection on a
-- freshly migrated + seeded database during S2 adversarial review, and the reproductions are the
-- regression tests in `test/{shart-immutability,approval-authority,guard-verb-coverage}
-- .integration.test.ts`. Migrations 1–3 are applied and their checksums are recorded, so the
-- repairs land here instead of being edited into them.
--
-- ── THE STRUCTURAL LESSON THIS FILE IS WRITTEN AGAINST ───────────────────────────────────────
-- Three of the six holes are the SAME mistake wearing different clothes: a guard that asks "does
-- this row say the right thing?" rather than "how did this row come to say it, and was that path
-- authorized?". A `BEFORE UPDATE` trigger answers the first question and is silent about DELETE +
-- re-INSERT. A CHECK that reads `NEW` alone is a POST-image test, so the same statement that
-- violates the rule can also rewrite the column the rule is compared against. Both are answered
-- here by making the IDENTITY of a row write-once and by covering every VERB.
--
-- ── WHAT THIS FILE CLOSES ────────────────────────────────────────────────────────────────────
--  C-03  D-3 was FALSIFIED. `waqf_shart_immutable` is `BEFORE UPDATE` only, so
--        `DELETE FROM "waqf"` + re-INSERT substituted a founder's Shart al-Waqif with zero audit
--        events and a clean hash chain. `waqf` was the only guarded table with no DELETE
--        coverage — its siblings (`audit_event`, `document`) cover the verbs it missed. Hard
--        DELETE and TRUNCATE on `waqf` are now refused outright: the row carries a >= 10-year
--        retention obligation (NFR-07 / BR-702), so `deletedAt` is its only legal retirement, and
--        `shartAlWaqif` is write-once regardless of approvals (ADR-0006, D-3).
--  C-02  `approval_request`'s identity columns were freely rewritable, so the maker re-pointed
--        `makerId` in the SAME UPDATE that recorded them as checker — satisfying the row-local
--        `approval_request_checker_ne_maker` CHECK — and a Nazir on endowment A re-pointed
--        `waqfId` to approve on endowment B. The identity tuple is now write-once.
--  C-13  Nothing guarded `approval_request."deletedAt"`, so the maker soft-deleted a live request
--        to free the one-open-per-subject slot (approval shopping) or to retire a Nazir's decision,
--        and could resurrect it afterwards. Retirement is `status = 'VOID'`, which is audited and
--        inside the lattice; soft-delete is not a second retirement path.
--  C-09  `waqf_access_grant."deletedAt"` was a second, fully REVERSIBLE off-switch on a live seat,
--        with none of the one-way property `revokedAt` has. Suppression is now one-way too.
--  C-10  `distribution_status_transition` is `BEFORE UPDATE` only and never looked at
--        `approvalRequestId` at all, while the CHECK only tested `IS NOT NULL`. A run could be
--        BORN `EXECUTED` naming a fabricated id, an empty string, a PENDING or soft-deleted
--        approval, or an approval belonging to another endowment.
--  C-14  `qmulate_reserved_matter_defect()` ignored `subjectId`, so ANY genuine APPROVED
--        RESERVED_MATTER on an endowment — including every routine settings-change approval —
--        was a working key for re-pointing that endowment's deed number or releasing a document's
--        legal hold. An approval now binds to its ARTIFACT, not merely to its endowment.
--
-- ── HOUSE RULES FOLLOWED (from migration 3's header) ─────────────────────────────────────────
--   • Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
--     `CREATE TRIGGER`, `CREATE ... IF NOT EXISTS`, `qmulate_add_check()` for every CHECK.
--   • Table-dependent DDL lives in ONE re-appliable block, `qmulate_apply_e2_guard_gaps()`.
--   • `ENABLE ALWAYS` on EVERY trigger. A trigger created normally is `tgenabled = 'O'` and
--     Postgres SKIPS it after a plain `SET session_replication_role = 'replica'` — the Sprint-1
--     finding that defeated gate G-1 outright. A new guard that forgot it is one `SET` from
--     irrelevant.
--   • A CHECK where a CHECK suffices: CHECKs are not skipped by the replica role at all.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- After any schema change that recreates a guarded table, re-apply ALL THREE guard sets, in order:
--     SELECT qmulate_apply_guards();
--     SELECT qmulate_apply_e2_guards();
--     SELECT qmulate_apply_e2_guard_gaps();
-- The third must come last: it REPLACES four trigger FUNCTIONS that migrations 1 and 3 define, and
-- re-running an earlier migration reinstates that migration's weaker bodies.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — HELPERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Is this `approval_request` id a GENUINE, USABLE authority for THIS act on THIS endowment?
--
-- Generalises `qmulate_reserved_matter_defect(text, text)` along two axes that were missing:
--
--   • THE TYPE is a parameter, so the distribution guard can demand a `DISTRIBUTION_RUN` with the
--     same seven conditions the Shart guard already demanded of a `RESERVED_MATTER`. Migration 3
--     wrote those conditions once and then did not apply them to `distribution` at all (C-10).
--
--   • THE SUBJECT is a parameter, and it is MANDATORY (C-14). Migration 3 verified that an
--     approval was genuine, APPROVED, un-deleted, of the right type, on the right endowment, and
--     not self-approved — and never that it was an approval OF THE THING BEING CHANGED. So an
--     approved istibdal, or any routine settings change (`SETTING_CHANGE_APPROVAL_TYPE =
--     'RESERVED_MATTER'`), was a valid key for silently re-pointing the endowment's deed number.
--     The approver signed one artifact and authorised another. This is the same class of defect
--     `payloadHash` was introduced to close on the distribution path.
--
-- FAIL CLOSED. A blank approval id, a blank endowment, a blank expected type or a blank subject
-- all return a defect: absent context is a DENY, never a skipped check. A NULL `subjectId` on the
-- approval row matches nothing, mirroring `approvalFingerprintMatches`'s treatment of a null hash.
--
-- Returns a reason string on failure and NULL on success, so the caller names WHICH condition
-- failed instead of raising a generic refusal.
CREATE OR REPLACE FUNCTION qmulate_approval_defect(
  p_approval_id   text,
  p_waqf_id       text,
  p_expected_type text,
  p_subject_id    text,
  -- `true` also accepts a SPENT (`EXECUTED`) approval. Needed by the distribution guard, because a
  -- run and its approval reach their terminal states together: the seeded historical `dist-001` is
  -- `EXECUTED` and so is `appr-dist-001`. The reserved-matter path leaves it `false` — a spent
  -- reserved matter is not a standing licence.
  p_allow_spent   boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $qm_appr_defect$
DECLARE
  r record;
BEGIN
  IF p_approval_id IS NULL OR btrim(p_approval_id) = '' THEN
    RETURN 'no approval id was supplied — an unnamed authority is not an authority';
  END IF;
  IF p_waqf_id IS NULL OR btrim(p_waqf_id) = '' THEN
    RETURN 'no endowment was supplied to verify the approval against — authority is PER ENDOWMENT';
  END IF;
  IF p_expected_type IS NULL OR btrim(p_expected_type) = '' THEN
    RETURN 'no expected approval type was supplied — an untyped gate accepts every approval';
  END IF;
  IF p_subject_id IS NULL OR btrim(p_subject_id) = '' THEN
    RETURN 'no subject was supplied — an approval binds to the ARTIFACT it approved, not merely '
           'to its endowment (C-14)';
  END IF;

  SELECT "id", "type"::text AS type, "status"::text AS status, "waqfId", "makerId", "checkerId",
         "subjectId", "deletedAt"
    INTO r
    FROM "approval_request"
   WHERE "id" = p_approval_id;

  IF NOT FOUND THEN
    RETURN format('approval_request %L does not exist — a fabricated id is not an approval',
                  p_approval_id);
  END IF;
  IF r."deletedAt" IS NOT NULL THEN
    RETURN format('approval_request %L is soft-deleted', p_approval_id);
  END IF;
  IF r.type IS DISTINCT FROM p_expected_type THEN
    RETURN format('approval_request %L is type %L, not %L', p_approval_id, r.type, p_expected_type);
  END IF;
  IF p_allow_spent THEN
    IF r.status NOT IN ('APPROVED', 'EXECUTED') THEN
      RETURN format('approval_request %L is %L, not APPROVED', p_approval_id, r.status);
    END IF;
  ELSIF r.status <> 'APPROVED' THEN
    RETURN format('approval_request %L is %L, not APPROVED', p_approval_id, r.status);
  END IF;
  IF r."waqfId" IS DISTINCT FROM p_waqf_id THEN
    RETURN format('approval_request %L belongs to waqf %L, not %L — an approval is per endowment',
                  p_approval_id, r."waqfId", p_waqf_id);
  END IF;
  IF r."checkerId" IS NULL THEN
    RETURN format('approval_request %L has no checkerId — nobody approved it', p_approval_id);
  END IF;
  IF r."checkerId" = r."makerId" THEN
    RETURN format('approval_request %L was self-approved (checkerId = makerId = %L)',
                  p_approval_id, r."makerId");
  END IF;
  -- LAST, deliberately. "Nobody approved this" and "the approver approved themselves" are defects
  -- of the approval itself; "this approval is about something else" is a defect of the MATCH. When
  -- both hold, the caller is better served by hearing that the authority is void than that it was
  -- mis-addressed, and the ordering keeps the S1/S2 refusal messages stable.
  IF r."subjectId" IS DISTINCT FROM p_subject_id THEN
    RETURN format('approval_request %L was approved for subject %L, not %L — an approval binds to '
                  'its artifact, and one approved act is not a licence for another',
                  p_approval_id, COALESCE(r."subjectId", '<null>'), p_subject_id);
  END IF;

  RETURN NULL; -- genuine, and genuinely about THIS artifact
END;
$qm_appr_defect$;


-- The reserved-matter door, now subject-bound. A thin wrapper so there is ONE implementation of
-- the eight conditions and the Shart / retention guards cannot drift from the distribution guard.
CREATE OR REPLACE FUNCTION qmulate_reserved_matter_defect(
  p_approval_id text,
  p_waqf_id     text,
  p_subject_id  text
)
RETURNS text
LANGUAGE sql
STABLE
AS $qm_rm_defect3$
  SELECT qmulate_approval_defect(p_approval_id, p_waqf_id, 'RESERVED_MATTER', p_subject_id, false);
$qm_rm_defect3$;


-- THE SUBJECT-BLIND OVERLOAD IS REMOVED, NOT LEFT STANDING.
--
-- `qmulate_reserved_matter_defect(text, text)` — migration 3's two-argument version — answers
-- "is this a genuine approval on this endowment?" and nothing about the artifact. Leaving it
-- installed alongside the three-argument version would leave a second door with the old lock:
-- the next guard to be written would reach for the shorter signature, and C-14 would reappear
-- under a new name. Dropped AFTER the two callers below are replaced (plpgsql bodies resolve
-- their calls at run time, so the order inside this file does not matter — but the intent does).
DROP FUNCTION IF EXISTS qmulate_reserved_matter_defect(text, text);


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TRIGGER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 2a. APPROVAL AUTHORITY, WITH A WRITE-ONCE IDENTITY (C-02, C-13) ──────────────────────────
-- REPLACES migration 3's body. The lattice and the ACTIVE-NAZIR check are unchanged; two blocks
-- are added AHEAD of them, both unconditional on any status change.
--
-- WHY THE IDENTITY BLOCK HAS TO COME FIRST AND HAS TO BE UNCONDITIONAL. Migration 3's whole body
-- was gated on `TG_OP = 'UPDATE' AND new_status IS DISTINCT FROM old_status`, so an UPDATE that
-- touched only `makerId` matched nothing. And `approval_request_checker_ne_maker` is a row-local
-- POST-image comparison — `"checkerId" IS NULL OR "checkerId" <> "makerId"` — so the maker could
-- write `checkerId = <self>, makerId = <somebody else>` in ONE statement and satisfy it. Verified:
-- the straight self-approval was refused (23514) and the identical statement with `makerId`
-- re-pointed reached APPROVED. The same trick on `waqfId` let a Nazir on endowment A approve a
-- request belonging to endowment B, because the trigger reads `NEW."waqfId"`.
--
-- The fix shape already existed twelve lines away in `qmulate_grant_role_immutable()`, which does
-- carry `IS DISTINCT FROM OLD`. It was written for `waqf_access_grant` and omitted here.
CREATE OR REPLACE FUNCTION qmulate_approval_request_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_authority$
DECLARE
  new_status text := NEW."status"::text;
  old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::text ELSE NULL END;
  changed    text := NULL;
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


-- ── 2b. A GRANT HAS ONE OFF-SWITCH, AND IT IS ONE-WAY (C-09) ─────────────────────────────────
-- REPLACES migration 3's body; the three existing clauses are unchanged and a fourth is added.
--
-- `activeGrantWhere()` treats `deletedAt: null` as one of its four validity clauses, exactly like
-- `revokedAt: null`, and `qmulate_has_active_grant()` mirrors it. So `deletedAt` was a second
-- suppression of a live seat — with none of the one-way property the sibling column was given.
-- Verified: `deletedAt = now()` then `deletedAt = NULL` on a seeded NAZIR grant was ALLOWED in one
-- transaction, while the documented `revokedAt` round trip was refused. Because un-deleting
-- restores an EXISTING row, the restored seat keeps its original `createdAt` and
-- `grantedByUserId`: the trail reads as though it was never interrupted. It is also how a
-- beneficiary sheds the `beneficiarySelfId` self-isolation pin and then puts it back.
--
-- ⚠ SURFACED, NOT RESOLVED: two off-switches on one column set is still one more than the design
-- needs. The smaller surface would be to drop `deletedAt` from `activeGrantWhere()` and let
-- `revokedAt` be the single validity switch, or to require `revokedAt` to be set alongside. Both
-- change TypeScript that this migration does not own. One-way is the half that is safe to land
-- alone, and it is strictly better than the reversible status quo.
CREATE OR REPLACE FUNCTION qmulate_grant_role_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_role$
BEGIN
  IF NEW."role" IS DISTINCT FROM OLD."role" THEN
    RAISE EXCEPTION
      'waqf_access_grant %: role is write-once (% -> % rejected). Changing a seat in place is '
      'privilege escalation with no trail — revoke this grant (set "revokedAt") and issue a new '
      'one through the audited, admin-gated path (§10 principle 3).',
      OLD."id", OLD."role", NEW."role"
      USING ERRCODE = '42501';
  END IF;

  IF NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."waqfId" IS DISTINCT FROM OLD."waqfId" THEN
    RAISE EXCEPTION
      'waqf_access_grant %: the (userId, waqfId) subject of a grant is write-once. Re-pointing an '
      'existing grant at another person or another endowment is the same escalation as changing '
      'its role.', OLD."id"
      USING ERRCODE = '42501';
  END IF;

  IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION
      'waqf_access_grant %: revocation is one-way. Un-revoking restores authority with no issue '
      'record — insert a new grant instead.', OLD."id"
      USING ERRCODE = '42501';
  END IF;

  IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
    RAISE EXCEPTION
      'waqf_access_grant %: soft-deletion is one-way, exactly like revocation. Un-deleting '
      'restores the seat — and its beneficiarySelfId self-isolation pin — with no issue record, '
      'no admin gate and no change to createdAt or grantedByUserId, so the trail reads as though '
      'the seat was never interrupted. Insert a new grant instead (§10 principle 3).',
      OLD."id"
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_grant_role$;


-- ── 2c. A DISTRIBUTION'S AUTHORITY IS VERIFIED, NOT MERELY NON-NULL (C-10) ───────────────────
-- `distribution_status_transition` is `BEFORE UPDATE` only, and its body never mentions
-- `approvalRequestId`. The only INSERT-time control was the CHECK
-- `"status" NOT IN ('APPROVED','EXECUTED') OR "approvalRequestId" IS NOT NULL`, which tests the
-- EXISTENCE OF A STRING. `Distribution.approvalRequestId` is deliberately not a foreign key, so
-- the string does not even have to name a row. Verified from a raw connection: runs born EXECUTED
-- with `'this-approval-does-not-exist'`, with `''`, with a PENDING approval, with a soft-deleted
-- approval, with a RESERVED_MATTER approval, and on waqf-002 naming waqf-001's `appr-dist-001`.
-- The UPDATE path was equally unchecked: PENDING_APPROVAL -> APPROVED naming `'total-fiction'`.
--
-- Migration 3's sibling states the rationale it did not apply here, verbatim: "a raw INSERT that
-- lands directly on `status = 'APPROVED'` with a fabricated `checkerId` must fail exactly as an
-- UPDATE does."
--
-- ⚠ WHY THIS IS A **DEFERRED CONSTRAINT TRIGGER** AND NOT A `BEFORE INSERT` ONE.
-- The fixture seed writes distributions at step 13 and the `approval_request` rows that authorise
-- them at step 20 — deliberately, because the `approval_request_authority` trigger needs the
-- grants from step 18 to exist first. The whole seed is ONE transaction, so an immediate
-- INSERT-time check would refuse a row whose authority is written thirty lines later in the same
-- transaction. `DEFERRABLE INITIALLY DEFERRED` fires at COMMIT, when the transaction's final state
-- is knowable — which is also the stricter reading: it is checked against what was actually
-- committed, not against a mid-transaction snapshot. `SET CONSTRAINTS ... IMMEDIATE` can only make
-- it fire EARLIER; there is no statement that makes a deferred constraint not fire, and
-- `ENABLE ALWAYS` covers the replica role.
--
-- THE SUBJECT BIND (C-14, applied here from the start): the approval must name THIS run. The seed's
-- `deriveRunApprovals` already sets `subjectId = <distribution id>`, and `approval.initiate` takes
-- the subject from the caller, so this is the convention the codebase already uses.
CREATE OR REPLACE FUNCTION qmulate_distribution_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dist_authority$
DECLARE
  defect text;
BEGIN
  IF NEW."status"::text NOT IN ('APPROVED', 'EXECUTED') THEN
    RETURN NULL; -- an AFTER trigger's return value is ignored
  END IF;

  -- `p_allow_spent := true`: a run and its approval reach their terminal states together, so an
  -- EXECUTED run legitimately names an EXECUTED approval (the seeded historical `dist-001` does).
  defect := qmulate_approval_defect(
    NEW."approvalRequestId", NEW."waqfId", 'DISTRIBUTION_RUN', NEW."id", true
  );

  IF defect IS NOT NULL THEN
    RAISE EXCEPTION
      'distribution %: status % requires a GENUINE approval for THIS run — %. Zero authority is '
      'worse than a second authority: there is nothing to attribute the payment to, nothing to '
      'audit, and the maker-checker invariant is vacuously satisfied (MP-29, BR-506). '
      '"approvalRequestId" is not a foreign key, so a string that names nothing satisfies the '
      'CHECK; this is the check that does not.',
      NEW."id", NEW."status", defect
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL;
END;
$qm_dist_authority$;


-- ── 2d. THE SHART GUARD, WITH THE RESERVED-MATTER DOOR BOUND TO ITS ARTIFACT (C-14) ──────────
-- REPLACES migration 3's body. The Shart block is unchanged and still raises FIRST, before any
-- GUC is read — D-3 is unaffected and stays absolute. Two changes below it:
--
--   (a) THE APPROVAL MUST NAME THE COLUMN. The subject convention is
--       `waqf:<waqfId>:<column>` — the same shape `settingChangeSubjectId(key, waqfId)` already
--       uses in `packages/api/src/routers/settings.ts`, rather than a second invented one.
--
--       ⚠ SURFACED, NOT RESOLVED (product scope, not fiqh): this ships the STRICT reading — one
--       approval authorises exactly one guarded column. The alternative is a single reserved-matter
--       approval covering several columns at once. Strict is the fail-closed direction and matches
--       D-5's "wider is safer, narrowing a live guard is the risky direction" reasoning inverted:
--       here the SAFER move is the narrower approval. The user may relax it later.
--
--   (b) BOTH GUARDED COLUMNS ARE CHECKED, NOT JUST THE FIRST. Migration 3 used ELSIF, so a
--       statement changing `certificateNumber` AND `deedNumber` together was verified against the
--       certificate's approval only and carried the deed change through with it.
CREATE OR REPLACE FUNCTION qmulate_shart_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_shart_guard$
DECLARE
  approval      text;
  shart_changed text := NULL;
  gated_column  text;
  defect        text;
BEGIN
  -- ── (1) THE FOUNDER'S CONDITIONS: WRITE-ONCE, FULL STOP ────────────────────────────────────
  IF NEW."shartAlWaqif" IS DISTINCT FROM OLD."shartAlWaqif" THEN
    shart_changed := 'shartAlWaqif';
  ELSIF NEW."shartAlWaqifVersion" IS DISTINCT FROM OLD."shartAlWaqifVersion" THEN
    shart_changed := 'shartAlWaqifVersion';
  ELSIF NEW."shartAlWaqifSetAt" IS DISTINCT FROM OLD."shartAlWaqifSetAt" THEN
    shart_changed := 'shartAlWaqifSetAt';
  ELSIF NEW."shartAlWaqifSetAtHijri" IS DISTINCT FROM OLD."shartAlWaqifSetAtHijri" THEN
    shart_changed := 'shartAlWaqifSetAtHijri';
  END IF;

  IF shart_changed IS NOT NULL THEN
    RAISE EXCEPTION
      'shart_al_waqif is immutable: column "%" on waqf % may NEVER be amended (Binding rule 1; '
      'user decision 2026-07-27 — the Shart cannot be changed regardless of approvals). There is '
      'no reserved-matter approval, GUC value or migration that opens this. Record a superseding '
      'instrument instead of editing the founder''s conditions.',
      shart_changed, OLD."id"
      USING ERRCODE = '42501';
  END IF;

  -- ── (2) DEED / CERTIFICATE IDENTITY: reserved-matter-only, verified, and ARTIFACT-BOUND ─────
  approval := current_setting('qmulate.reserved_matter_approval_id', true);

  FOREACH gated_column IN ARRAY ARRAY['certificateNumber', 'deedNumber']
  LOOP
    -- Compared through `to_jsonb` so the loop names each column ONCE. Writing the comparison out
    -- per column is how migration 3 ended up with an ELSIF that checked only the first of the two.
    CONTINUE WHEN (to_jsonb(NEW) ->> gated_column) IS NOT DISTINCT FROM (to_jsonb(OLD) ->> gated_column);

    defect := qmulate_reserved_matter_defect(
      approval, OLD."id", 'waqf:' || OLD."id" || ':' || gated_column
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'column "%" on waqf % is reserved-matter-only: %. Go through withReservedMatter(), which '
        'verifies an APPROVED, maker <> checker RESERVED_MATTER approval for THIS endowment AND '
        'THIS artifact before it sets qmulate.reserved_matter_approval_id (Binding rule 1). The '
        'subject an approval must name for this column is "waqf:%:%".',
        gated_column, OLD."id", defect, OLD."id", gated_column
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$qm_shart_guard$;


-- ── 2e. THE DOCUMENT RETENTION HATCH, ALSO ARTIFACT-BOUND (C-14) ─────────────────────────────
-- REPLACES migration 3's body. Same change: the approval must name the document AND which of the
-- two guarded properties it authorises, rather than being any genuine reserved matter anywhere on
-- the endowment. A >= 10-year retention obligation and a live legal hold (NFR-07 / BR-702, §12)
-- are not things an approved istibdal should be able to release as a side effect.
CREATE OR REPLACE FUNCTION qmulate_document_retention_forward_only()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_doc_forward$
DECLARE
  approval text := current_setting('qmulate.reserved_matter_approval_id', true);
  defect   text;
BEGIN
  IF NEW."retentionUntil" < OLD."retentionUntil" THEN
    defect := qmulate_reserved_matter_defect(
      approval, OLD."waqfId", 'document:' || OLD."id" || ':retentionUntil'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'document %: retentionUntil may only be extended (% -> % rejected). Shortening retention is '
        'how a delete guard is talked into permitting a delete (NFR-07 / BR-702). %. The subject an '
        'approval must name is "document:%:retentionUntil".',
        OLD."id", OLD."retentionUntil", NEW."retentionUntil", defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD."legalHold" AND NOT NEW."legalHold" THEN
    defect := qmulate_reserved_matter_defect(
      approval, OLD."waqfId", 'document:' || OLD."id" || ':legalHold'
    );
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'document %: a legal hold may only be released through the audited, authority-gated '
        'workflow (NFR-07 / BR-702, §12). %. The subject an approval must name is '
        '"document:%:legalHold".',
        OLD."id", defect, OLD."id"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_doc_forward$;


-- ── 2f. AN ENDOWMENT ROW IS NEVER HARD-DELETED (C-03) ────────────────────────────────────────
-- THE HOLE THIS CLOSES, IN ONE LINE: `waqf_shart_immutable` is `BEFORE UPDATE`, so the founder's
-- conditions were substituted by `DELETE FROM "waqf" WHERE id = ...` followed by a re-INSERT of
-- the same id with a different `shartAlWaqif` and any `shartAlWaqifVersion` the attacker liked.
-- Reproduced on a seeded database: `audit_event` moved 131 -> 131, and the G-1 chain verified
-- clean over the substitution, because raw SQL never reaches the Prisma audit extension. Tail
-- truncation was S1's undetectable tampering; this was S2's.
--
-- Refusing outright, rather than gating: a `waqf` row carries a >= 10-year retention obligation
-- (NFR-07 / BR-702) and `deletedAt` already exists as the soft-retirement path the rest of the
-- schema uses. ADR-0006 asserts "there is no code path and NO SQL PATH by which shartAlWaqif
-- changes after first write" — that sentence is only true once this trigger exists.
--
-- ⚠ SURFACED (scope, not fiqh): an endowment created in error now has no purge path in Phase 1.
-- Soft delete plus a superseding record is the posture the rest of the schema takes; confirm
-- nobody expects a hard purge before this reaches production data.
CREATE OR REPLACE FUNCTION qmulate_waqf_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_waqf_no_delete$
BEGIN
  RAISE EXCEPTION
    'DELETE on "waqf" is refused (row %). The Shart al-Waqif is write-once and an endowment row '
    'carries a >= 10-year retention obligation, so DELETE + re-INSERT would substitute the '
    'founder''s conditions with no audit event and a hash chain that still verifies (ADR-0006, '
    'D-3, NFR-07 / BR-702). Set "deletedAt" instead — soft retirement is the only legal one.',
    OLD."id"
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_waqf_no_delete$;


-- ── 2g. TRUNCATE IS REFUSED ON EVERY GUARDED TABLE ───────────────────────────────────────────
-- TRUNCATE fires NO row triggers, so it walks past every guard above. Until now
-- `TRUNCATE "waqf"` failed only because it cascades into `document`, whose statement-level guard
-- fired — a lucky accident of the FK graph, not a control, and one that stops being true the
-- moment a table is dropped from the cascade. Registered per table (not one trigger over several)
-- because that is the portable form, mirroring `document_no_truncate`.
CREATE OR REPLACE FUNCTION qmulate_reject_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_reject_truncate$
BEGIN
  RAISE EXCEPTION
    'TRUNCATE on "%" is refused: it fires no row triggers, so it bypasses every write-once, '
    'authority and retention guard on the table at once.', TG_TABLE_NAME
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_reject_truncate$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — qmulate_apply_e2_guard_gaps()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e2_guard_gaps()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_gaps$
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.1 distribution — a blank approval id is not an approval (C-10, case #4)
  --
  -- A CHECK, not a trigger clause, deliberately: `''` satisfying `IS NOT NULL` is a data-shape
  -- error, and CHECKs are not skipped by `session_replication_role = 'replica'` at all. The
  -- existing `distribution_approved_requires_approval_request` cannot be widened without editing
  -- an applied migration, so this is a second, narrower CHECK beside it. Note migration 3's own
  -- reserved-matter helper already rejected `btrim(...) = ''`; the distribution CHECK did not.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'distribution',
    'distribution_approval_id_not_blank',
    '"status" NOT IN (''APPROVED'', ''EXECUTED'') OR btrim(COALESCE("approvalRequestId", '''')) <> '''''
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.2 distribution — the authority itself, checked at COMMIT (C-10)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS distribution_authority ON "distribution";
  CREATE CONSTRAINT TRIGGER distribution_authority
    AFTER INSERT OR UPDATE ON "distribution"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION qmulate_distribution_authority();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.3 waqf — the missing verbs (C-03)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS waqf_no_delete ON "waqf";
  CREATE TRIGGER waqf_no_delete
    BEFORE DELETE ON "waqf"
    FOR EACH ROW EXECUTE FUNCTION qmulate_waqf_reject_delete();

  DROP TRIGGER IF EXISTS waqf_no_truncate ON "waqf";
  CREATE TRIGGER waqf_no_truncate
    BEFORE TRUNCATE ON "waqf"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.4 the other guarded tables — TRUNCATE coverage
  --
  -- ⚠ HARD DELETE ON `approval_request` AND `waqf_access_grant` IS **NOT** CLOSED HERE, AND THAT
  -- IS A KNOWN, REPORTED RESIDUE — not an oversight. Both are reachable from a raw connection and
  -- both defeat a write-once rule by delete + re-INSERT, exactly as `waqf` did. Landing the two
  -- BEFORE DELETE triggers requires the scaffolding cleanup in five test files to move to an
  -- explicit `ALTER TABLE ... DISABLE TRIGGER` transaction first — three of those files belong to
  -- other owners, and a half-landed guard that reddens CI is worse than a documented gap. Land it
  -- as one coordinated change; the trigger bodies are `qmulate_waqf_reject_delete()`'s shape.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS approval_request_no_truncate ON "approval_request";
  CREATE TRIGGER approval_request_no_truncate
    BEFORE TRUNCATE ON "approval_request"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();

  DROP TRIGGER IF EXISTS waqf_access_grant_no_truncate ON "waqf_access_grant";
  CREATE TRIGGER waqf_access_grant_no_truncate
    BEFORE TRUNCATE ON "waqf_access_grant"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();

  DROP TRIGGER IF EXISTS distribution_no_truncate ON "distribution";
  CREATE TRIGGER distribution_no_truncate
    BEFORE TRUNCATE ON "distribution"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.5 ENABLE ALWAYS on every guard added here (§3.5 of migration 3)
  --
  -- Including the CONSTRAINT trigger: `tgenabled` applies to constraint triggers exactly as it
  -- does to ordinary ones, and without this one `SET LOCAL session_replication_role = 'replica'`
  -- would skip the distribution authority check at commit.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  ALTER TABLE "distribution"      ENABLE ALWAYS TRIGGER distribution_authority;
  ALTER TABLE "distribution"      ENABLE ALWAYS TRIGGER distribution_no_truncate;
  ALTER TABLE "waqf"              ENABLE ALWAYS TRIGGER waqf_no_delete;
  ALTER TABLE "waqf"              ENABLE ALWAYS TRIGGER waqf_no_truncate;
  ALTER TABLE "approval_request"  ENABLE ALWAYS TRIGGER approval_request_no_truncate;
  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_truncate;
END;
$qm_apply_gaps$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — APPLY
--
-- Fails LOUDLY on a missing prerequisite rather than skipping the guards: a database with an
-- unguarded `waqf` must never be mistaken for a healthy one.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_request', 'waqf_access_grant', 'distribution', 'waqf', 'document']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 guard-gaps migration ran BEFORE the Prisma-generated init migration. Missing '
      'table(s): %. See packages/database/prisma/sql/README.md.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_add_check(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 guard-gaps migration ran BEFORE 00000000000001_init_append_only_audit, which '
      'defines qmulate_add_check(). Migrations apply in lexicographic directory order; this one '
      'must sort last.';
  END IF;

  IF to_regprocedure('qmulate_has_active_grant(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 guard-gaps migration ran BEFORE 00000000000003_e2_authority_guards, which '
      'defines qmulate_has_active_grant(). This migration REPLACES four of that migration''s '
      'trigger functions, so it must run after it.';
  END IF;

  PERFORM qmulate_apply_e2_guard_gaps();
END
$qm_apply$;
