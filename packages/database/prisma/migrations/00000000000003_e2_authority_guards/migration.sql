-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2 AUTHORITY GUARDS.  HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE IN POSTGRES:
--
--     The Nazir is the sole approval authority, per endowment, and never the maker.
--
-- It is stated three times in the codebase — in the preset algebra (`packages/domain/access.ts`),
-- in the procedure ladder (`packages/api`), and here. The first two are TypeScript, and a
-- TypeScript-only proof is one `$executeRawUnsafe` from irrelevant: `SCOPING_KNOWN_GAPS` records
-- verbatim that the Prisma force-filter "does not survive raw SQL", and no RLS policy exists.
-- Everything below is therefore driven from a RAW connection in
-- `test/{approval-authority,grant-escalation,shart-immutability}.integration.test.ts`.
--
-- ── WHAT SPRINT 1 CLAIMED AND DID NOT DO ─────────────────────────────────────────────────────
-- `schema.prisma`'s `ApprovalRequest` doc comment said "SEGREGATION OF DUTIES: `checkerId` must
-- never equal `makerId`; the check is re-verified at commit", and the field carried
-- `/// Enforced: checker != maker`. Grepping all three prior migrations for `approval_request`
-- yields the primary key, the `waqfId` foreign key and one index. Nothing else. A claimed
-- enforcement with no implementation on either side is precisely the Sprint-1 failure mode: both
-- S1 security holes existed because nothing compared two sides that were supposed to agree.
--
-- ── THE CONTROLS ─────────────────────────────────────────────────────────────────────────────
--   1.  CHECK    approval_request_checker_ne_maker             self-approval unrepresentable
--   2.  CHECK    approval_request_decided_requires_checker     a decision names its decider
--   3.  CHECK    approval_request_approved_binds_payload       an approval names its artifact
--   4.  TRIGGER  approval_request_authority                    checker = ACTIVE NAZIR on the SAME
--                                                             endowment + legal status transition
--   5.  UNIQUE   approval_request_one_open_per_subject         at most one live approval per act
--   6.  CHECK    waqf_access_grant_no_self_issue               grantedByUserId <> userId
--   7.  CHECK    waqf_access_grant_aml_flags                   two compartment booleans must agree
--   8.  TRIGGER  waqf_access_grant_role_immutable              role is write-once
--   9.  TRIGGER  waqf_access_grant_permission_guard            only NAZIR holds approve/sign
--  10.  CHECK    membership_role_family_level_only             a family row cannot mint a seat
--  11.  CHECK    distribution_approved_requires_approval_request
--  12.  TRIGGER  distribution_status_transition                no EXECUTED without an APPROVED
--  13.  HARDENED qmulate_shart_guard()                         the Shart hatch is SHUT; the other
--                                                             reserved-matter columns are verified
--
-- ── NAMING ───────────────────────────────────────────────────────────────────────────────────
-- Table names are snake_case singular (Prisma `@@map`); COLUMN names stay Prisma camelCase. Every
-- column identifier is therefore DOUBLE-QUOTED — an unquoted one would be folded to lower case by
-- Postgres and would not match.
--
-- ── WHERE `'VOID'` MAY AND MAY NOT APPEAR ────────────────────────────────────────────────────
-- This file adds `'VOID'` to `ApprovalStatus`, and Postgres refuses to USE a newly-added enum value
-- in the same transaction that added it ("unsafe use of new value") — which a migration file may
-- well be. Two consequences, and they pull in opposite directions:
--
--   • CHECK constraints and the partial UNIQUE index name ONLY pre-existing values ('PENDING',
--     'APPROVED', 'EXECUTED') and compare them as ENUMS, with no `::text` cast. An enum→text cast is
--     STABLE, not IMMUTABLE, and Postgres rejects a non-immutable expression in an index predicate
--     outright ("functions in index predicate must be marked IMMUTABLE"). Learned the hard way.
--   • The plpgsql TRIGGER FUNCTIONS do cast to `text` and do name `'VOID'`. Their bodies are only
--     syntax-checked at creation and resolve at call time, so the new value is safe there.
--
-- ── IDEMPOTENCY (assertion A12) ──────────────────────────────────────────────────────────────
-- Re-runnable end to end: `ADD VALUE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
-- `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`,
-- `CREATE ... IF NOT EXISTS`, and `qmulate_add_check()` (from
-- `00000000000001_init_append_only_audit`) for every CHECK.
--
-- ── RE-ENTRY POINT ───────────────────────────────────────────────────────────────────────────
-- The table-dependent DDL lives in `qmulate_apply_e2_guards()`. After any schema change that
-- recreates a guarded table, re-apply BOTH guard sets:
--     SELECT qmulate_apply_guards(); SELECT qmulate_apply_e2_guards();
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — SCHEMA CHANGES (the Prisma-generated half, hand-written)
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- AlterEnum: §10 §4.3's "the prior approval is voided" was not a representable state.
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'VOID';

-- AlterTable: bind an approval to its SUBJECT and to the exact ARTIFACT that was approved, and
-- record the step-up assertion that authorised it.
ALTER TABLE "approval_request" ADD COLUMN IF NOT EXISTS "subjectId"             TEXT;
ALTER TABLE "approval_request" ADD COLUMN IF NOT EXISTS "payloadHash"           TEXT;
ALTER TABLE "approval_request" ADD COLUMN IF NOT EXISTS "checkerTotpAssertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "approval_request_waqfId_type_subjectId_idx"
  ON "approval_request" ("waqfId", "type", "subjectId");


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — HELPERS
--
-- plpgsql function BODIES are only syntax-checked at creation time and their tables resolve at
-- call time, so this section is safe even before the tables exist.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- The single definition of "this user holds an ACTIVE grant of this role on THIS endowment".
--
-- ⚠ THE `p_waqf_id` PARAMETER IS THE WHOLE POINT. `ApprovalRequest.checkerId` is a bare `String?`
-- with no foreign key and nothing tying it to a grant, so without the endowment parameter a Nazir
-- on endowment A would be able to approve on endowment B — the natural implementation is wrong by
-- default. MP-08's mutation is exactly "drop the waqfId clause", and it must fail loudly.
--
-- The validity window is the same four clauses `activeGrantWhere()` uses in
-- `packages/auth/src/server.ts`: not soft-deleted, not revoked, started, not expired. A test
-- compares the two sides so they cannot drift.
CREATE OR REPLACE FUNCTION qmulate_has_active_grant(
  p_user_id text,
  p_waqf_id text,
  p_role    text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_has_grant$
  SELECT EXISTS (
    SELECT 1
      FROM "waqf_access_grant" g
     WHERE g."userId" = p_user_id
       AND g."waqfId" = p_waqf_id          -- SAME endowment. Never "any endowment".
       AND g."role"::text = p_role
       AND g."deletedAt" IS NULL
       AND g."revokedAt" IS NULL
       AND g."validFrom" <= now()
       AND (g."validUntil" IS NULL OR g."validUntil" >= now())
  );
$qm_has_grant$;


-- Is this `approval_request` id a GENUINE, USABLE reserved-matter approval for this waqf?
--
-- Five conditions, all of them absent from the Sprint-1 Shart guard, which tested only
-- `IF approval IS NULL OR btrim(approval) = '' THEN RAISE` — i.e. any non-empty string opened the
-- door. Combined with the missing checker≠maker CHECK, a single actor could fabricate an approval,
-- self-approve it, and amend the founder's immutable Shart al-Waqif.
--
-- Returns a reason string on failure and NULL on success, so the caller can name WHICH condition
-- failed instead of raising a generic refusal.
CREATE OR REPLACE FUNCTION qmulate_reserved_matter_defect(
  p_approval_id text,
  p_waqf_id     text
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $qm_rm_defect$
DECLARE
  r record;
BEGIN
  IF p_approval_id IS NULL OR btrim(p_approval_id) = '' THEN
    RETURN 'no reserved-matter approval id was set in this transaction';
  END IF;

  SELECT "id", "type"::text AS type, "status"::text AS status, "waqfId", "makerId", "checkerId",
         "deletedAt"
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
  IF r.type <> 'RESERVED_MATTER' THEN
    RETURN format('approval_request %L is type %L, not RESERVED_MATTER', p_approval_id, r.type);
  END IF;
  IF r.status <> 'APPROVED' THEN
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

  RETURN NULL; -- genuine
END;
$qm_rm_defect$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TRIGGER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 2a. APPROVAL AUTHORITY (MP-07, MP-08, MP-23, and the transition lattice) ──────────────────
-- Fires on INSERT and UPDATE, because a raw INSERT that lands directly on `status = 'APPROVED'`
-- with a fabricated `checkerId` must fail exactly as an UPDATE does.
CREATE OR REPLACE FUNCTION qmulate_approval_request_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_authority$
DECLARE
  new_status text := NEW."status"::text;
  old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::text ELSE NULL END;
BEGIN
  -- ── the status lattice ─────────────────────────────────────────────────────────────────────
  -- PENDING -> APPROVED | REJECTED | VOID ;  APPROVED -> EXECUTED | VOID ;  terminal states stay.
  -- Without this, a REJECTED row could be flipped back to APPROVED, and an APPROVED row could be
  -- re-decided by a different Nazir — a second authority reached through an UPDATE.
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
  -- Only a checker holding an ACTIVE `NAZIR` grant ON THIS ENDOWMENT. Not `FAMILY_BOARD` (§9 calls
  -- the principal consent part of an "approval chain", but §3's grid gives family_board no A/S cell
  -- and §9's chain ends "-> nazir S*"); not `AML_OFFICER` (an AML decision can only BLOCK — an
  -- approval authority living inside a compartment the Nazir cannot see is a direct BR-105
  -- violation); not `SYSTEM_ADMIN` (config authority is not governance authority); and not a job,
  -- which has no user id and therefore cannot satisfy this at all.
  IF new_status IN ('APPROVED', 'EXECUTED') THEN
    IF NEW."checkerId" IS NULL THEN
      RAISE EXCEPTION
        'approval_request %: status % requires a checkerId. An approval with no approver is not an '
        'approval (BR-105).', NEW."id", new_status
        USING ERRCODE = '42501';
    END IF;
    IF NOT qmulate_has_active_grant(NEW."checkerId", NEW."waqfId", 'NAZIR') THEN
      RAISE EXCEPTION
        -- plpgsql RAISE understands ONLY `%` (and `%%`). `%L` / `%I` belong to format(); using one
        -- here renders the value followed by a literal "L", which is how a security message starts
        -- naming user ids that do not exist ("user-accountant-001L"). Quote in the text instead.
        'approval_request %: checkerId "%" holds no ACTIVE NAZIR waqf_access_grant on waqf "%". The '
        'Nazir is the sole approval authority, PER ENDOWMENT (BR-105 / BR-1103, §10 §4).',
        NEW."id", NEW."checkerId", NEW."waqfId"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_appr_authority$;


-- ── 2b. GRANT ROLE IS WRITE-ONCE (MP-15) ─────────────────────────────────────────────────────
-- Mirrors the `waqf_shart_immutable` pattern. VERIFIED LIVE HOLE in Sprint 1: `UNIQUE_WRITE_OPS`
-- (update/delete/upsert) authorize by a scope PRE-CHECK and then pass the caller's `where` through
-- untouched, the beneficiary guard lived only in `assertCreateInScope` (the CREATE path), and
-- `scopeFilter`'s beneficiary switch had no `WaqfAccessGrant` case — it fell through to the
-- ordinary `{waqfId: {in: ids}}`. So a beneficiary portal session could run
-- `waqfAccessGrant.update({ where: { id: <own grant> }, data: { role: 'NAZIR' } })`.
--
-- Escalation is only expressible as revoke + re-issue, which is audited and admin-gated.
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

  -- Re-issuing a grant by clearing `revokedAt` skips the admin-gated issue path just as neatly as
  -- editing the role would. Revocation is one-way; a new seat is a new row.
  IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION
      'waqf_access_grant %: revocation is one-way. Un-revoking restores authority with no issue '
      'record — insert a new grant instead.', OLD."id"
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_grant_role$;


-- ── 2c. ONLY `NAZIR` MAY HOLD AN approve/sign PERMISSION (D-1, D-2, MP-18, MP-19) ─────────────
-- `permissions String[]` is free text that Sprint 1 shipped as, verbatim, "stored but not yet
-- interpreted". A grant that keeps `role = FINANCE` while appending `distribution:run:approve` is a
-- second approval authority that every role-shaped check misses.
--
-- `packages/domain`'s `assertGrantPermissionsWithinPreset()` is the FULL ceiling (module × resource
-- × verb against the thirteen presets). This trigger is deliberately the smaller half — the half
-- that survives raw SQL — and it does NOT duplicate the module/resource registry, which would
-- create a second table to drift from. It enforces exactly what can be decided from the string:
--
--   • three colon-separated non-empty segments (`module:resource:verb`);
--   • the verb is one of the five closed verbs;
--   • no wildcard anywhere — a wildcard in a string-based permission model is how a
--     least-privilege matrix quietly becomes root;
--   • an `approve` or `sign` verb requires `role = 'NAZIR'`.
CREATE OR REPLACE FUNCTION qmulate_grant_permission_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_perm$
DECLARE
  permission text;
  parts      text[];
  verb       text;
BEGIN
  FOREACH permission IN ARRAY COALESCE(NEW."permissions", ARRAY[]::text[])
  LOOP
    IF position('*' in permission) > 0 THEN
      RAISE EXCEPTION
        'waqf_access_grant %: permission "%" contains a wildcard. Wildcards are refused — they are '
        'how a least-privilege matrix silently becomes root (§10 principle 3).',
        COALESCE(NEW."id", '<new>'), permission
        USING ERRCODE = '42501';
    END IF;

    parts := string_to_array(permission, ':');
    IF array_length(parts, 1) IS DISTINCT FROM 3
       OR btrim(COALESCE(parts[1], '')) = ''
       OR btrim(COALESCE(parts[2], '')) = ''
       OR btrim(COALESCE(parts[3], '')) = '' THEN
      RAISE EXCEPTION
        'waqf_access_grant %: permission "%" is not a three-segment module:resource:verb tuple. '
        'An unparseable permission grants nothing, so storing one is a bug waiting to be "fixed" '
        'by broadening the matcher.', COALESCE(NEW."id", '<new>'), permission
        USING ERRCODE = '42501';
    END IF;

    verb := parts[3];
    IF verb NOT IN ('read', 'write', 'initiate', 'approve', 'sign') THEN
      RAISE EXCEPTION
        'waqf_access_grant %: permission "%" has verb "%", which is not one of the five closed verbs '
        '(read, write, initiate, approve, sign). A typo must DENY, not be accommodated.',
        COALESCE(NEW."id", '<new>'), permission, verb
        USING ERRCODE = '42501';
    END IF;

    IF verb IN ('approve', 'sign') AND NEW."role"::text <> 'NAZIR' THEN
      RAISE EXCEPTION
        'waqf_access_grant %: role % may not hold "%". Approve and sign belong to the NAZIR alone '
        '(D-1/D-2, BR-105, BR-1103) — leadership is read-only and an authorized representative '
        'never approves, in any combination, on any module. There is no co-authorization concept.',
        COALESCE(NEW."id", '<new>'), NEW."role", permission
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$qm_grant_perm$;


-- ── 2d. DISTRIBUTION STATUS LATTICE (MP-29) ──────────────────────────────────────────────────
-- The CHECK below makes APPROVED/EXECUTED-with-no-approval unrepresentable; this makes the PATH to
-- them legal. DRAFT -> COMPUTED -> PENDING_APPROVAL -> APPROVED -> EXECUTED, with CANCELLED
-- reachable from any non-terminal state, and EXECUTED / CANCELLED terminal.
CREATE OR REPLACE FUNCTION qmulate_distribution_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dist_status$
DECLARE
  old_status text := OLD."status"::text;
  new_status text := NEW."status"::text;
BEGIN
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


-- ── 2e. THE SHART AL-WAQIF GUARD, HARDENED (D-3, D-5, MP-27) ─────────────────────────────────
-- REPLACES the Sprint-1 body. Two changes, in opposite directions:
--
-- (1) THE SHART HATCH IS NOW SHUT, UNCONDITIONALLY.  User decision, 2026-07-27, verbatim: "shart
--     al-waqif cannot be changed, regardless of approvals." So the four Shart columns raise with no
--     reference to the GUC at all — no approval id, however well-formed, opens them. Sprint 1's
--     escape hatch for these columns is gone.
--
--     ⚠ SURFACED, NOT RESOLVED: this is STRICTER than CLAUDE.md binding rule 1, which says the
--     Shart is "amendable only via an explicit authority-gated reserved-matter workflow" — i.e. the
--     binding rule contemplates an amendment and the decision says none is possible. Both cannot be
--     literally true. Binding rule 1's wording needs reconciling with the S2 decision before
--     E11/S12 builds the reserved-matter workflow.
--
-- (2) THE REMAINING GUARDED COLUMNS ARE NOW VERIFIED, NOT MERELY GATED.  `certificateNumber` and
--     `deedNumber` stay reserved-matter-only (D-5: wider is safer, and narrowing a live guard is
--     the risky direction). But the S1 check was `IF approval IS NULL OR btrim(approval) = ''` —
--     ANY non-empty string opened the door. All five conditions now run INSIDE the trigger, so they
--     survive a raw query: the id names a real row, `status = 'APPROVED'`, `type =
--     'RESERVED_MATTER'`, the waqf matches, and `checkerId IS NOT NULL AND checkerId <> makerId`.
CREATE OR REPLACE FUNCTION qmulate_shart_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_shart_guard$
DECLARE
  approval      text;
  shart_changed text := NULL;
  gated_changed text := NULL;
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

  -- ── (2) DEED / CERTIFICATE IDENTITY: reserved-matter-only, and the approval is VERIFIED ─────
  -- Silently re-pointing a waqf at a different deed is as damaging as editing the Shart, so these
  -- stay guarded (D-5). They remain openable, because a mis-keyed certificate number is a real
  -- correction — but only against a genuine approval.
  IF NEW."certificateNumber" IS DISTINCT FROM OLD."certificateNumber" THEN
    gated_changed := 'certificateNumber';
  ELSIF NEW."deedNumber" IS DISTINCT FROM OLD."deedNumber" THEN
    gated_changed := 'deedNumber';
  END IF;

  IF gated_changed IS NOT NULL THEN
    approval := current_setting('qmulate.reserved_matter_approval_id', true);
    defect   := qmulate_reserved_matter_defect(approval, OLD."id");
    IF defect IS NOT NULL THEN
      RAISE EXCEPTION
        'column "%" on waqf % is reserved-matter-only: %. Go through withReservedMatter(), which '
        'verifies an APPROVED, maker <> checker RESERVED_MATTER approval for THIS endowment before '
        'it sets qmulate.reserved_matter_approval_id (Binding rule 1).',
        gated_changed, OLD."id", defect
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_shart_guard$;


-- ── 2f. THE DOCUMENT RETENTION HATCH IS VERIFIED TOO (D-3 "defence in depth") ─────────────────
-- REPLACES the Sprint-1 body. `qmulate_document_retention_forward_only()` released a legal hold and
-- allowed retention to be shortened on the strength of `IF approval IS NOT NULL AND approval <> ''`
-- — the same "any non-empty string is an approval" test the Shart guard used, on the guard that
-- protects a >= 10-year retention obligation and a live legal hold. Narrowing it costs nothing and
-- is strictly safer, so it moves onto the verified check as well.
CREATE OR REPLACE FUNCTION qmulate_document_retention_forward_only()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_doc_forward$
DECLARE
  approval text := current_setting('qmulate.reserved_matter_approval_id', true);
  defect   text;
BEGIN
  IF NEW."retentionUntil" >= OLD."retentionUntil" AND NOT (OLD."legalHold" AND NOT NEW."legalHold") THEN
    RETURN NEW; -- neither guarded change is being attempted
  END IF;

  defect := qmulate_reserved_matter_defect(approval, OLD."waqfId");
  IF defect IS NULL THEN
    RETURN NEW; -- authority-gated release; the approval id is recorded by the caller
  END IF;

  IF NEW."retentionUntil" < OLD."retentionUntil" THEN
    RAISE EXCEPTION
      'document %: retentionUntil may only be extended (% -> % rejected). Shortening retention is '
      'how a delete guard is talked into permitting a delete (NFR-07 / BR-702). %',
      OLD."id", OLD."retentionUntil", NEW."retentionUntil", defect
      USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION
    'document %: a legal hold may only be released through the audited, authority-gated workflow '
    '(NFR-07 / BR-702, §12). %', OLD."id", defect
    USING ERRCODE = '42501';
END;
$qm_doc_forward$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — qmulate_apply_e2_guards()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e2_guards()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_e2$
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.1 approval_request — the maker-checker invariant, in the database (MP-09, MP-30)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'approval_request',
    'approval_request_checker_ne_maker',
    '"checkerId" IS NULL OR "checkerId" <> "makerId"'
  );
  PERFORM qmulate_add_check(
    'approval_request',
    'approval_request_decided_requires_checker',
    '"status" NOT IN (''APPROVED'', ''EXECUTED'') OR ("checkerId" IS NOT NULL AND "decidedAt" IS NOT NULL)'
  );
  -- The approver signs the exact artifact they saw. Without a bound hash there is nothing to
  -- recompute at execute time, so a post-approval edit to the payload is undetectable and whoever
  -- made that edit is the real approver.
  PERFORM qmulate_add_check(
    'approval_request',
    'approval_request_approved_binds_payload',
    '"status" NOT IN (''APPROVED'', ''EXECUTED'') OR "payloadHash" IS NOT NULL'
  );

  DROP TRIGGER IF EXISTS approval_request_authority ON "approval_request";
  CREATE TRIGGER approval_request_authority
    BEFORE INSERT OR UPDATE ON "approval_request"
    FOR EACH ROW EXECUTE FUNCTION qmulate_approval_request_authority();

  -- AT MOST ONE LIVE APPROVAL PER ACT (MP-31).
  -- `@@index([waqfId, status])` was the only index, so two PENDING requests for the same
  -- distribution could each be approved by a different Nazir. `COALESCE("subjectId", '')` means a
  -- NULL subject collapses to one slot per (waqf, type) rather than to unlimited slots — the
  -- fail-closed direction. Non-terminal = PENDING | APPROVED: an APPROVED-but-unexecuted request
  -- is still a live authority.
  CREATE UNIQUE INDEX IF NOT EXISTS approval_request_one_open_per_subject
    ON "approval_request" ("waqfId", "type", (COALESCE("subjectId", '')))
    WHERE "status" IN ('PENDING', 'APPROVED') AND "deletedAt" IS NULL;

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.2 waqf_access_grant — the authorization plane (MP-15, MP-17, MP-18, MP-19, MP-25)
  -- ─────────────────────────────────────────────────────────────────────────────────────────

  -- NO SELF-ISSUED GRANT. `WaqfAccessGrant` was in `WAQF_DIRECT_SCOPED_MODELS`, so the force-filter
  -- treated the authorization table as ordinary endowment data and `assertCreateInScope` checked
  -- only that `row.waqfId` was in the caller's authorized set — nothing about permissions. Any
  -- caller holding any grant on A could therefore create a NAZIR grant for themselves on A.
  PERFORM qmulate_add_check(
    'waqf_access_grant',
    'waqf_access_grant_no_self_issue',
    '"grantedByUserId" <> "userId"'
  );

  -- TWO BOOLEANS WITH COMPARTMENT SEMANTICS, NOW COMPARED. `canViewAmlRestricted` is the global
  -- flag whose own schema comment concedes "prefer the per-waqf list"; `amlCompartment` is the
  -- per-endowment membership. The clearance cannot exist without the membership — that combination
  -- is what let `amlClause()` short-circuit to "no restriction at all" (§10 §6: the compartment is
  -- INVISIBILITY, not redaction, and the Nazir is NOT a member by default).
  PERFORM qmulate_add_check(
    'waqf_access_grant',
    'waqf_access_grant_aml_flags',
    'NOT ("canViewAmlRestricted" AND NOT "amlCompartment")'
  );

  -- A beneficiary seat is pinned to exactly one record; every other seat is pinned to none.
  -- Otherwise a FINANCE grant carrying a `beneficiarySelfId` would silently switch that caller onto
  -- the self-isolation path (or, worse, a BENEFICIARY grant without one would leave the portal
  -- session un-pinned and reading the whole endowment).
  PERFORM qmulate_add_check(
    'waqf_access_grant',
    'waqf_access_grant_beneficiary_self_pin',
    '("role" = ''BENEFICIARY'') = ("beneficiarySelfId" IS NOT NULL)'
  );

  DROP TRIGGER IF EXISTS waqf_access_grant_role_immutable ON "waqf_access_grant";
  CREATE TRIGGER waqf_access_grant_role_immutable
    BEFORE UPDATE ON "waqf_access_grant"
    FOR EACH ROW EXECUTE FUNCTION qmulate_grant_role_immutable();

  DROP TRIGGER IF EXISTS waqf_access_grant_permission_guard ON "waqf_access_grant";
  CREATE TRIGGER waqf_access_grant_permission_guard
    BEFORE INSERT OR UPDATE ON "waqf_access_grant"
    FOR EACH ROW EXECUTE FUNCTION qmulate_grant_permission_guard();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.3 membership — a family-level row can never mint an operational seat (MP-13)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'membership',
    'membership_role_family_level_only',
    '"role" = ''FAMILY_BOARD'''
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.4 distribution — no approved or executed run without an approval (MP-29)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'distribution',
    'distribution_approved_requires_approval_request',
    '"status" NOT IN (''APPROVED'', ''EXECUTED'') OR "approvalRequestId" IS NOT NULL'
  );

  DROP TRIGGER IF EXISTS distribution_status_transition ON "distribution";
  CREATE TRIGGER distribution_status_transition
    BEFORE UPDATE ON "distribution"
    FOR EACH ROW EXECUTE FUNCTION qmulate_distribution_status_transition();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.5 ENABLE ALWAYS on every new guard — close the `session_replication_role` bypass
  --
  -- A trigger created normally is `tgenabled = 'O'` (fire on ORIGIN) and Postgres SKIPS it for a
  -- session that has done `SET LOCAL session_replication_role = 'replica'`. That is a plain `SET`,
  -- not DDL, and during Sprint-1 adversarial review it defeated gate G-1 outright from the
  -- application's own connection. Every guard added here gets `ENABLE ALWAYS` for the same reason
  -- — a new guard that forgot it would be one `SET` from irrelevant.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  ALTER TABLE "approval_request"  ENABLE ALWAYS TRIGGER approval_request_authority;
  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_role_immutable;
  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_permission_guard;
  ALTER TABLE "distribution"      ENABLE ALWAYS TRIGGER distribution_status_transition;
END;
$qm_apply_e2$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — DATA REPAIRS THAT MUST PRECEDE THE CONSTRAINTS
--
-- Both are FIXTURE-ONLY corrections to rows this repository seeds itself, applied here so that a
-- database migrated before the seed rename still converges. Neither touches a governance value:
-- one renames a config KEY, the other narrows permission strings that the fixture file itself
-- labels "PROVISIONAL … nothing in production should read them".
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e2_data$
DECLARE
  legacy_id text := 'setting-nazirFee.percentOfRevenue.default';
  n         bigint;
BEGIN
  IF to_regclass('public."setting"') IS NOT NULL THEN
    -- EXIT-3 WAS BROKEN BY DATA. The seeded GLOBAL key was `nazirFee.percentOfRevenue.default`
    -- while the seeded PER-WAQF override was `nazirFee.percentOfRevenue` — two keys that never
    -- collide and have no fallback link, so asking for the `.default` key ignored the override and
    -- asking for the bare key left every other endowment with no global fallback. The canonical key
    -- is the un-suffixed one (`packages/domain/src/settings.ts`).
    IF EXISTS (SELECT 1 FROM "setting" WHERE "key" = 'nazirFee.percentOfRevenue' AND "waqfId" IS NULL) THEN
      DELETE FROM "setting" WHERE "key" = 'nazirFee.percentOfRevenue.default' AND "waqfId" IS NULL;
    ELSE
      UPDATE "setting"
         SET "key" = 'nazirFee.percentOfRevenue',
             "id"  = 'setting-nazirFee.percentOfRevenue'
       WHERE "key" = 'nazirFee.percentOfRevenue.default'
         AND "waqfId" IS NULL
         AND "id" = legacy_id;
    END IF;
  END IF;

  IF to_regclass('public."waqf_access_grant"') IS NOT NULL THEN
    -- The PROVISIONAL fixture permission strings used verbs and modules §3's grid does not have
    -- (`waqf:waqf:update`, `finance:transaction:create`, `portal:statement:read`), and
    -- `waqf_access_grant_permission_guard` would refuse to load them. The seed now writes the
    -- canonical `module:resource:verb` vocabulary; an already-seeded database is converged here.
    --
    -- Deleting rather than translating: a permission string is a CEILING, and guessing at a
    -- translation would be inventing authority. The seed re-derives every grant's permission list
    -- from `ROLE_PRESETS` on its next run, which is the audited path.
    UPDATE "waqf_access_grant"
       SET "permissions" = ARRAY[]::text[]
     WHERE EXISTS (
       SELECT 1 FROM unnest("permissions") AS p
        WHERE array_length(string_to_array(p, ':'), 1) IS DISTINCT FROM 3
           OR position('*' in p) > 0
           OR split_part(p, ':', 3) NOT IN ('read', 'write', 'initiate', 'approve', 'sign')
     );
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE
        'QMULATE E2: cleared unparseable PROVISIONAL permission strings on % waqf_access_grant '
        'row(s). Re-run the fixture seed to re-derive them from the canonical role presets.', n;
    END IF;

    -- `waqf_access_grant_permission_guard` also refuses an approve/sign string on a non-NAZIR role.
    -- The Sprint-1 fixture never wrote one, but a hand-edited database might.
    UPDATE "waqf_access_grant"
       SET "permissions" = ARRAY(
             SELECT p FROM unnest("permissions") AS p
              WHERE split_part(p, ':', 3) NOT IN ('approve', 'sign')
           )
     WHERE "role"::text <> 'NAZIR'
       AND EXISTS (
         SELECT 1 FROM unnest("permissions") AS p
          WHERE split_part(p, ':', 3) IN ('approve', 'sign')
       );
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE WARNING
        'QMULATE E2: stripped approve/sign permission strings from % NON-NAZIR waqf_access_grant '
        'row(s). Those rows were second approval authorities (BR-105 / BR-1103). Review the audit '
        'trail for how they were issued.', n;
    END IF;
  END IF;
END
$qm_e2_data$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — APPLY
--
-- ⚠ ORDERING. This migration ALTERs tables it does not create, so it must run AFTER the
-- Prisma-generated init migration and after `00000000000001_init_append_only_audit` (whose
-- `qmulate_add_check()` helper it uses). Prisma applies migration directories in lexicographic
-- order, and `00000000000003_…` sorts last. If a prerequisite is missing we fail LOUDLY rather
-- than skipping the guards: a database with an unguarded `approval_request` must never be
-- mistaken for a healthy one.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_request', 'waqf_access_grant', 'membership', 'distribution', 'waqf']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 authority-guards migration ran BEFORE the Prisma-generated init migration. '
      'Missing table(s): %. See packages/database/prisma/sql/README.md.',
      array_to_string(missing, ', ');
  END IF;

  -- `to_regprocedure`, not `to_regproc`: the latter takes a bare NAME and returns NULL for anything
  -- with an argument list, so it would report the helper missing even when it is present.
  IF to_regprocedure('qmulate_add_check(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 authority-guards migration ran BEFORE 00000000000001_init_append_only_audit, '
      'which defines qmulate_add_check(). Migrations apply in lexicographic directory order; this '
      'one must sort last.';
  END IF;

  PERFORM qmulate_apply_e2_guards();
END
$qm_apply$;
