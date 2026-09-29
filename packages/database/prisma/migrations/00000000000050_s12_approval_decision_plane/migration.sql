-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — S12-1 · AV4-02 CLOSED: THE APPROVAL DECISION LEAVES THE RUNTIME CREDENTIAL.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── THE DEFECT THIS FILE CLOSES, IN ITS OWN MEASURED WORDS ──────────────────────────────────
-- `packages/database/test/e3-deed-term-guards.integration.test.ts` (S4 round 4), verbatim:
--
--     `qmulate_app` — the LEAST-privileged runtime role, the one the application actually connects
--     with — CAN MINT ITS OWN `APPROVED` `RESERVED_MATTER` `approval_request` AND SPEND IT IN THE
--     SAME TRANSACTION. … a self-minted approval naming `asset:asset-001:titleDeedNumber` opened the
--     title deed, with `audit_event` 153 → 153.
--
-- and the register's verdict: it "QUALIFIES EVERY 'REFUSED 42501 AS `qmulate_app`' MEASUREMENT" —
-- every reserved-matter gate proved only that the door is CLOSED WITHOUT A KEY, never that the key
-- had to come from an approval AUTHORITY, because the caller could cut the key. ADR-0008 round 6
-- named it open question 5 ("Does `approval_request` DML stay on the runtime connection?") and
-- migration 10's header left it open as "a scope decision". This file is that decision.
--
-- ── WHY A TRIGGER CAN CLOSE IT NOW, WHEN ADR-0008 ROUND 5 PROVED A TRIGGER COULD NOT ─────────
-- Round 5's proof was exact and it is still true: a marker, a GUC, a second table, a signature under
-- a key the same role can read — every one is "a row the attacker writes", satisfiable by the caller
-- while attacker and application share ONE database role. Round 6 ended the sharing. MEASURED there,
-- as `qmulate_app`: `SET ROLE qmulate_owner` → 42501, `SET session_replication_role` → 42501. So
-- `current_user` is the ONE fact about a connection that the runtime credential cannot rewrite, and
-- a rule keyed on it is a rule the caller does not set. This is the same control migration 10/11
-- applied to `waqf_access_grant` (REVOKE + an RLS policy keyed on the role), moved to the DECISION
-- columns of `approval_request` and expressed as a trigger rather than an RLS policy — because RLS
-- FILTERS an UPDATE into a silent zero-row no-op (migration 11's own measurement) and a refused
-- approval must RAISE with a diagnosis, never vanish.
--
-- ── THE RULE, IN ONE SENTENCE ────────────────────────────────────────────────────────────────
--   ONLY THE APPROVAL PLANE DECIDES. A row is BORN PENDING with no decision recorded, and the
--   decision — `checkerId` NULL→value, `status` → APPROVED | REJECTED, `decidedAt` /
--   `decidedAtHijri` / `checkerTotpAssertedAt` NULL→value — is writable only when `current_user`
--   is `qmulate_provisioner` (connection B, `ACCESS_MATRIX_DATABASE_URL`), `qmulate_owner`, or a
--   superuser. INSERT of an already-decided row is the same rule at birth.
--
-- What stays on the runtime role, deliberately: minting a PENDING request (`approval.initiate`,
-- every `mintApprovalRequest` caller), `APPROVED → EXECUTED` (SPENDING an approval grants no
-- authority) and `→ VOID` (retiring one removes authority). The runtime keeps SELECT/INSERT/UPDATE
-- on the table at the ACL, and its UPDATE of a decision column now dies at THIS TRIGGER — so a
-- future GRANT cannot reopen the route, and there is no policy to forget.
--
-- ── WHY THE PROVISIONER AND NOT A FIFTH ROLE ────────────────────────────────────────────────
-- The provisioner credential already holds approval power TRANSITIVELY: whoever has it can mint a
-- NAZIR `waqf_access_grant` (its one job) and then approve through the ordinary application path.
-- A separate `qmulate_approver` role would therefore add no separation the provisioner does not
-- already lack, at the cost of a fifth connection string threaded through three CI jobs, three
-- turbo env lists, `.env.example`, `dev-postgres.ts`, `playwright.config.ts` and the posture test.
-- Reuse is the honest shape. The application-side door is `decideApproval()` in
-- `packages/database/src/approval-plane.ts` — module-private client, never returned, same as
-- `access-matrix.ts`.
--
-- ── ⚠ WHAT THIS DOES NOT CLOSE, STATED SO NOBODY QUOTES IT AS MORE ─────────────────────────
--   1. Code running INSIDE the web process can still call `decideApproval()` — the process holds
--      `ACCESS_MATRIX_DATABASE_URL`. This is ADR-0008 round 6's residual (1)/(2) for grants, now
--      applying to approvals too. Closing it is an out-of-process approver, not a trigger.
--   2. The TOTP step-up and the maker≠checker identity comparison live in `checkerProcedure`, in
--      TypeScript, in front of the door. The database checks `checkerId <> makerId` (CHECK) and
--      "ACTIVE NAZIR on this endowment" (below); it cannot check that the person at the keyboard IS
--      that Nazir. That gap is the application's, and it was the application's before this file.
--   3. Whoever holds `MIGRATOR_DATABASE_URL` or the platform superuser can do anything, as before.
--
-- What the register MAY now say: a "refused 42501 as `qmulate_app`" measurement of a reserved-matter
-- gate is no longer qualified by the caller's ability to forge the key. The qualification paragraphs
-- in `e3-deed-term-guards` and `grant-admission` come off IN THE CHANGE THAT SHIPS THIS FILE and
-- cite it; `approval-decision-plane.integration.test.ts` runs the exact AV4-02 script and asserts it
-- is now refused, and runs the mutation (this trigger's role clause removed) and asserts the attack
-- is admitted again.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · WHO IS THE APPROVAL PLANE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A superuser is admitted for the same reason `ENABLE ALWAYS` does not pretend to bind one: it can
-- disable the trigger, so excluding it buys nothing and would only break the platform credential's
-- out-of-band operations. The THREAT is the runtime role, and the runtime role is NOSUPERUSER
-- (`provision-db-roles.ts` fails loudly otherwise; the posture test asserts it).
CREATE OR REPLACE FUNCTION qmulate_is_approval_plane_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_plane$
  SELECT current_user IN (qmulate_provisioning_role(), qmulate_owner_role())
      OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper);
$qm_plane$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · A PENDING ROW CARRIES NO CHECKER — the converse of migration 3's
--      `approval_request_decided_requires_checker`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Without it, a PENDING row could be born with `checkerId` already filled by the runtime role and
-- the later `PENDING → APPROVED` flip would not be a NULL→value decision on that column. Validated
-- against existing rows: a violation FAILS this migration rather than being remapped (ADR-0004).
SELECT qmulate_add_check(
  'approval_request',
  'approval_request_pending_has_no_checker',
  '"status" <> ''PENDING'' OR "checkerId" IS NULL'
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §3 · THE TRIGGER BODY — migration 22 §2's body, byte-for-byte, plus blocks (-1) and (0c).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_approval_request_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_authority$
DECLARE
  new_status text := NEW."status"::text;
  old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::text ELSE NULL END;
  changed    text := NULL;
  decision   text := NULL;
  deciding   text := NULL;
BEGIN
  -- ── (-1) BORN PENDING (S12-1 / AV4-02) ───────────────────────────────────────────────────
  -- An INSERT that lands already decided is the AV4-02 script's first statement. It is admitted
  -- only from the approval plane (the fixture seed and the test scaffolds run on the owner).
  IF TG_OP = 'INSERT' THEN
    IF new_status <> 'PENDING' THEN
      deciding := 'status=' || new_status;
    ELSIF NEW."checkerId" IS NOT NULL THEN
      deciding := 'checkerId';
    ELSIF NEW."decidedAt" IS NOT NULL THEN
      deciding := 'decidedAt';
    ELSIF NEW."decidedAtHijri" IS NOT NULL THEN
      deciding := 'decidedAtHijri';
    ELSIF NEW."checkerTotpAssertedAt" IS NOT NULL THEN
      deciding := 'checkerTotpAssertedAt';
    END IF;
    IF deciding IS NOT NULL AND NOT qmulate_is_approval_plane_role() THEN
      RAISE EXCEPTION
        'approval_request %: an approval request is BORN PENDING. This INSERT carries a decision '
        '("%") and the connection role "%" is not the approval plane. MEASURED (AV4-02, S4 round '
        '4): the runtime role inserted its own APPROVED RESERVED_MATTER row naming '
        'asset:asset-001:titleDeedNumber and spent it in the same transaction — the gate opened '
        'because the caller cut the key. Decisions travel through decideApproval() on the '
        'provisioning connection (ADR-0008 round 7, migration 50).',
        NEW."id", deciding, current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- ── (0) THE WRITE-ONCE IDENTITY OF A REQUEST (C-02) ──────────────────────────────────────
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

    -- ── (0c) THE DECISION IS TAKEN ONLY ON THE APPROVAL PLANE (S12-1 / AV4-02) ───────────────
    -- NULL→value on a decision column, or a status change INTO APPROVED / REJECTED, is the act of
    -- deciding. `→ EXECUTED` (spending) and `→ VOID` (retiring) are not, and stay on the runtime.
    IF OLD."checkerId" IS NULL AND NEW."checkerId" IS NOT NULL THEN
      deciding := 'checkerId';
    ELSIF new_status IS DISTINCT FROM old_status AND new_status IN ('APPROVED', 'REJECTED') THEN
      deciding := 'status=' || new_status;
    ELSIF OLD."decidedAt" IS NULL AND NEW."decidedAt" IS NOT NULL THEN
      deciding := 'decidedAt';
    ELSIF OLD."decidedAtHijri" IS NULL AND NEW."decidedAtHijri" IS NOT NULL THEN
      deciding := 'decidedAtHijri';
    ELSIF OLD."checkerTotpAssertedAt" IS NULL AND NEW."checkerTotpAssertedAt" IS NOT NULL THEN
      deciding := 'checkerTotpAssertedAt';
    END IF;

    IF deciding IS NOT NULL AND NOT qmulate_is_approval_plane_role() THEN
      RAISE EXCEPTION
        'approval_request %: "%" is the DECISION of a request, and the connection role "%" is not '
        'the approval plane. ONLY THE APPROVAL PLANE DECIDES (qmulate_provisioner / qmulate_owner): '
        'the runtime role may mint a PENDING request, spend an APPROVED one (-> EXECUTED) or retire '
        'one (-> VOID), and may not approve, reject, or record an approver. This is the control that '
        'closes AV4-02: it is keyed on current_user, the one fact about a connection the runtime '
        'credential cannot rewrite (SET ROLE measured 42501, ADR-0008 round 6). Route the decision '
        'through decideApproval() (packages/database/src/approval-plane.ts).',
        OLD."id", deciding, current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── the status lattice ────────────────────────────────────────────────────────────────────
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

  -- ── who may be recorded as the approver ──────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §4 · THE PRIVILEGE MATRIX — the provisioner gains UPDATE on `approval_request`, nothing else.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Migration 10's function, re-created with ONE new branch. No INSERT for the provisioner: it never
-- MINTS a request — minting stays a maker act on the runtime role — it only DECIDES one that exists.
-- The runtime role's grants on the table are UNCHANGED (SELECT, INSERT, UPDATE); its decision
-- UPDATEs are refused by §3, not by the ACL, on purpose (see the header).
CREATE OR REPLACE FUNCTION qmulate_apply_privilege_matrix() RETURNS void
LANGUAGE plpgsql
AS $qm_matrix$
DECLARE
  app_role   text := qmulate_runtime_role();
  prov_role  text := qmulate_provisioning_role();
  authz      text[] := qmulate_authz_plane_tables();
  identity   text[] := qmulate_identity_plane_tables();
  has_app    boolean;
  has_prov   boolean;
  rec        record;
BEGIN
  has_app  := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role);
  has_prov := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = prov_role);

  IF NOT has_app AND NOT has_prov THEN
    RAISE NOTICE
      'QMULATE: neither %  nor % exists — the privilege matrix was NOT applied. Run '
      '`pnpm exec tsx scripts/provision-db-roles.ts` on the platform superuser FIRST. A database '
      'without those roles is migrated and seedable but the authorization plane is UNPROTECTED at '
      'the privilege layer (ADR-0008 round 6).', app_role, prov_role;
    RETURN;
  END IF;

  REVOKE CREATE ON SCHEMA public FROM PUBLIC;

  IF has_app THEN
    GRANT USAGE ON SCHEMA public TO qmulate_app;
    REVOKE CREATE ON SCHEMA public FROM qmulate_app;
  END IF;
  IF has_prov THEN
    GRANT USAGE ON SCHEMA public TO qmulate_provisioner;
    REVOKE CREATE ON SCHEMA public FROM qmulate_provisioner;
  END IF;

  FOR rec IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
     ORDER BY tablename
  LOOP
    IF has_app THEN
      IF rec.tablename = ANY (authz) THEN
        EXECUTE format('GRANT SELECT ON TABLE %I TO qmulate_app', rec.tablename);
        EXECUTE format(
          'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_app',
          rec.tablename);
      ELSIF rec.tablename = 'audit_event' THEN
        EXECUTE 'GRANT SELECT, INSERT ON TABLE audit_event TO qmulate_app';
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE audit_event FROM qmulate_app';
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO qmulate_app', rec.tablename);
        EXECUTE format(
          'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_app',
          rec.tablename);
      END IF;

      IF rec.tablename = ANY (identity) THEN
        EXECUTE format('GRANT DELETE ON TABLE %I TO qmulate_app', rec.tablename);
      END IF;
    END IF;

    IF has_prov THEN
      EXECUTE format('GRANT SELECT ON TABLE %I TO qmulate_provisioner', rec.tablename);
      IF rec.tablename = ANY (authz) THEN
        EXECUTE format('GRANT INSERT, UPDATE ON TABLE %I TO qmulate_provisioner', rec.tablename);
        EXECUTE format(
          'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_provisioner',
          rec.tablename);
      ELSIF rec.tablename = 'audit_event' THEN
        EXECUTE 'GRANT INSERT ON TABLE audit_event TO qmulate_provisioner';
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE audit_event FROM qmulate_provisioner';
      ELSIF rec.tablename = 'audit_chain_head' THEN
        EXECUTE 'GRANT INSERT, UPDATE ON TABLE audit_chain_head TO qmulate_provisioner';
        EXECUTE 'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE audit_chain_head FROM qmulate_provisioner';
      ELSIF rec.tablename = 'approval_request' THEN
        -- S12-1 / AV4-02: the approval plane DECIDES (UPDATE) and never MINTS (no INSERT).
        EXECUTE 'GRANT UPDATE ON TABLE approval_request TO qmulate_provisioner';
        EXECUTE 'REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE approval_request FROM qmulate_provisioner';
      ELSE
        EXECUTE format(
          'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_provisioner',
          rec.tablename);
      END IF;
    END IF;
  END LOOP;

  IF has_app THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE audit_chain_head TO qmulate_app;
  END IF;

  FOR rec IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    IF has_app THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO qmulate_app', rec.sequencename);
    END IF;
    IF has_prov THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO qmulate_provisioner', rec.sequencename);
    END IF;
  END LOOP;

  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = false
  LOOP
    IF has_app THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO qmulate_app', rec.sig);
    END IF;
    IF has_prov THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO qmulate_provisioner', rec.sig);
    END IF;
  END LOOP;

  RAISE NOTICE 'QMULATE: privilege matrix applied (app=%, provisioner=%).', has_app, has_prov;
END
$qm_matrix$;

SELECT qmulate_apply_privilege_matrix();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §5 · THE SWEEP — migration 22 §3's obligation: a new function is EXECUTE-to-PUBLIC by default.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION qmulate_is_approval_plane_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION qmulate_is_approval_plane_role() TO qmulate_app, qmulate_provisioner;
