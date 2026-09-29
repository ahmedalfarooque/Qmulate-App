-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — PRIVILEGE SEPARATION: THE RUNTIME ROLE LOSES THE AUTHORIZATION PLANE.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT THIS FILE DOES, IN ONE SENTENCE ─────────────────────────────────────────────────────
-- It installs `qmulate_apply_privilege_matrix()` — one idempotent, re-appliable function that
-- GRANTs and REVOKEs the per-table privileges of three separate database roles — and calls it.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS: THE THING NINE MIGRATIONS COULD NOT CLOSE
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ADR-0008 and migrations 5, 7 and 9 each narrowed one route by which a caller holding ANY seat
-- could mint itself a `NAZIR` `waqf_access_grant` through `$executeRawUnsafe` on its own scoped
-- Prisma client, and then approve another maker's SAR 4,500,000 `BANK_MOVEMENT`. Migration 9's
-- header states the residual plainly and correctly:
--
--   "ROUTE 2 IS STILL LIVE AND IS NOT CLOSABLE BY ANY IN-DATABASE MARKER LOGIC. A caller who can
--    run arbitrary SQL as the application role writes the marker HIMSELF … attacker and application
--    share ONE database role and the trigger can only read the row, never observe who authored it."
--
-- Note the scope of that impossibility proof: **while attacker and application share one database
-- role.** This migration is what ends the sharing. Authority derived from a row the attacker can
-- write is forgeable; a PRIVILEGE the server checks before the statement is ever parsed is not.
--
-- ── THE OTHER HALF OF THE SAME RESIDUAL ──────────────────────────────────────────────────────
-- Every trigger in migrations 1–9 is `ALTER TABLE … DISABLE TRIGGER`-able and `DROP TRIGGER`-able
-- by the table OWNER, and on Railway the runtime connects AS THE OWNER. Migration 1 §2 already
-- created an INSERT-only `qmulate_app_runtime` role and REVOKEd `UPDATE, DELETE, TRUNCATE` on
-- `audit_event` from it, and that GRANT has never once bitten — because nothing ever connected as
-- it. The fact this migration changes is not which GRANTs exist; it is WHICH ROLE THE APPLICATION
-- CONNECTS AS. GRANTs and RLS are both worthless against a role that owns the table.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE THREE ROLES, AND WHY THREE RATHER THAN TWO
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--   qmulate_app           Connection A · env DATABASE_URL · everything on the request path.
--                         SELECT/INSERT/UPDATE on the business tables. **NO INSERT, UPDATE, DELETE
--                         or TRUNCATE on `waqf_access_grant` or `membership` — SELECT only.**
--                         DELETE only on the five identity tables better-auth owns. Owns nothing,
--                         so it cannot DISABLE or DROP a trigger, cannot ALTER a table, and cannot
--                         `SET session_replication_role = 'replica'` (that needs superuser) — which
--                         retires the entire "one SET skips the trigger" class this repository has
--                         fought since Sprint 1.
--
--   qmulate_provisioner   Connection B · env ACCESS_MATRIX_DATABASE_URL · the ONE narrow audited
--                         path that may mint or widen a seat (`provisionAccessGrant()` /
--                         `revokeAccessGrant()` in `src/access-matrix.ts`). INSERT/UPDATE on the
--                         authorization plane — and **still fully subject to
--                         `waqf_access_grant_admission`**, because it owns nothing either. The
--                         privileged path is NARROWER, not exempt: it must still name an actor with
--                         established `admin:access_matrix:write` on that endowment.
--
--   qmulate_owner         Connection C · env MIGRATOR_DATABASE_URL · `prisma migrate deploy`, the
--                         test harnesses' scaffolding, the fixture seed, and the one-off production
--                         bootstrap of an endowment's first admin seat. Owns the schema, the tables,
--                         the functions and the sequence. MUST be NOSUPERUSER NOBYPASSRLS (see
--                         migration 11). NEVER present in the web or worker service environment.
--
-- Two roles were considered and rejected: with only {app, owner}, `activateGrant()` — the shipped
-- tRPC access-matrix write path — would have to run as the owner, which both bypasses admission
-- (see the bootstrap note in migration 11's sibling `access-matrix-bootstrap.ts`) and hands the
-- request path DDL. The provisioner exists so that the one legitimate runtime write to the
-- authorization plane travels a credential that can do NOTHING ELSE.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ WHAT THIS MIGRATION DOES **NOT** DO, AND MUST NOT
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- It does NOT create the roles and does NOT set ownership. `CREATE ROLE` needs `CREATEROLE` and
-- `ALTER … OWNER TO` needs to already be the owner — neither of which the migrator may hold, and
-- neither of which belongs in a migration that also runs against a shadow database. Both live in
-- `scripts/provision-db-roles.ts`, run once per environment on the platform superuser.
--
-- ⚠ AND THAT TOLERANCE IS ITSELF A RISK, STATED RATHER THAN GLOSSED. Exactly like migration 1 §2,
-- the matrix call below degrades to `RAISE NOTICE` when the roles are absent or the connection
-- lacks the privilege to change ACLs. So a database where provisioning never ran ends up migrated,
-- seeded and GREEN over a completely unenforced matrix. A hard failure here would break
-- `prisma migrate dev` on a fresh cluster, so the hard failure lives in a TEST instead:
-- `test/authorization-plane-privilege.integration.test.ts` FAILS (never skips) when the posture is
-- absent, and CI runs it. If you delete that test you delete the only thing that notices.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- MEASURED (PostgreSQL 17.10, local embedded cluster, connected AS `qmulate_app`, seeded fixture)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--   INSERT INTO "waqf_access_grant" …            -> 42501 permission denied for table waqf_access_grant
--   ALTER TABLE … DISABLE TRIGGER …              -> 42501 must be owner of table waqf_access_grant
--   DROP TRIGGER …                               -> 42501 must be owner of relation waqf_access_grant
--   ALTER TABLE … DROP CONSTRAINT …              -> 42501 must be owner of table waqf_access_grant
--   CREATE OR REPLACE FUNCTION qmulate_grant_admission() -> 42501 permission denied for schema public
--   UPDATE "audit_event" SET …                   -> 42501 permission denied for table audit_event
--   DELETE FROM "audit_event" …                  -> 42501 permission denied for table audit_event
--   TRUNCATE "audit_event"                       -> 42501 permission denied for table audit_event
--   SET session_replication_role = 'replica'     -> 42501 permission denied to set parameter
--   SET ROLE qmulate_owner                       -> 42501 permission denied to set role
--   CREATE TABLE / CREATE SCHEMA                 -> 42501 permission denied
-- The exact statements and the mutations that restore each old behaviour live in
-- `test/authorization-plane-privilege.integration.test.ts`.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · THE ROLE NAMES, WRITTEN ONCE
--
-- Every later migration, every posture assertion and every test reads the names from here rather
-- than spelling a string literal, so a rename is one edit. `IMMUTABLE` + `sql` so they inline.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION qmulate_runtime_role() RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT 'qmulate_app'::text $$;

CREATE OR REPLACE FUNCTION qmulate_provisioning_role() RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT 'qmulate_provisioner'::text $$;

CREATE OR REPLACE FUNCTION qmulate_owner_role() RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT 'qmulate_owner'::text $$;

--
-- The tables the runtime role may NOT write, at any verb, ever.
--
-- `waqf_access_grant` is the table that MINTS AUTHORITY — every permission decision in the product
-- resolves through it, so a row here is the whole game (ADR-0008). `membership` is here because it
-- is the other row-shaped claim about who somebody is; nothing on the request path writes it today
-- (only the fixture seed does), so revoking it costs nothing and closes a route before it opens.
--
-- ⚠ `approval_request` is deliberately NOT on this list, and that is a decision, not an omission.
-- The shipped maker/checker flow writes it on the REQUEST path — `root.ts` (create/update),
-- `routers/settings.ts`, `middleware/segregation.ts` — so revoking it would break the flow this
-- whole ADR exists to protect. What the ownership split gives `approval_request` instead is that
-- its trigger guards (`approval_request_authority`, `approval_request_no_delete`,
-- `approval_request_no_truncate`) are now UNBYPASSABLE from the runtime role, because suspending
-- them needs ownership. ADR-0008's closing section asks whether approval creation should move
-- behind the provisioner too; that is a scope decision and is left open.
--
CREATE OR REPLACE FUNCTION qmulate_authz_plane_tables() RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['waqf_access_grant', 'membership']::text[] $$;

--
-- The five tables better-auth's Prisma adapter owns, and the ONLY tables the runtime role keeps
-- `DELETE` on.
--
-- ⚠ THIS CARVE-OUT IS THE ONE PLACE A TOO-BROAD REVOKE BREAKS LOGIN RATHER THAN A TEST. MEASURED:
-- no application source performs a hard delete on any other table — a grep for `.delete(` and
-- `.deleteMany(` over every package's and app's `src` tree returns only in-memory Map/Set
-- operations — but better-auth deletes sessions on sign-out and prunes expired `verification` and
-- `two_factor` rows. Miss this and login/logout breaks in a way no database test covers, which is
-- why `packages/api/test/setup.ts`'s identity-plane assertions exercise all five by name.
--
-- ⚠ AND NOTE WHAT THIS FILE MUST NOT CONTAIN: a `/` followed by a `*` anywhere in a comment.
-- PostgreSQL block comments NEST, so a path written with a glob inside a `/* … */` block opens a
-- nested comment that never closes and the whole migration fails with 42601. Every comment in this
-- file is therefore a `--` line comment. (MEASURED the hard way.)
CREATE OR REPLACE FUNCTION qmulate_identity_plane_tables() RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['user', 'session', 'account', 'verification', 'two_factor']::text[]
  $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · THE MATRIX
--
-- One function, so the whole posture is re-appliable in one statement after any migration that
-- adds a table, a function or a sequence — and so a reviewer reads the posture in one place
-- instead of assembling it from scattered GRANT lines.
--
-- It is driven by `pg_tables` rather than a hand-written list, so a table added to the schema is
-- covered by DEFAULT instead of by remembering. The deny-list is the only hand-written part, and
-- the belt-and-braces REVOKE after each GRANT catches an ACL that a previous deployment already
-- widened.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

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

  -- ── 2.1 · Schema-level ────────────────────────────────────────────────────────────────────
  -- `CREATE` on `public` is granted to PUBLIC by default on PostgreSQL < 15 and this revoke is a
  -- no-op on 15+. Either way it is the difference between "the runtime cannot create a table" and
  -- "the runtime can create a table named after one of ours".
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;

  IF has_app THEN
    GRANT USAGE ON SCHEMA public TO qmulate_app;
    REVOKE CREATE ON SCHEMA public FROM qmulate_app;
  END IF;
  IF has_prov THEN
    GRANT USAGE ON SCHEMA public TO qmulate_provisioner;
    REVOKE CREATE ON SCHEMA public FROM qmulate_provisioner;
  END IF;

  -- ── 2.2 · Per-table ───────────────────────────────────────────────────────────────────────
  -- `_prisma_migrations` is EXCLUDED deliberately: it is the migrator's bookkeeping, the runtime
  -- never reads it, and a runtime that can UPDATE it can make a migration look applied.
  FOR rec IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
     ORDER BY tablename
  LOOP
    IF has_app THEN
      IF rec.tablename = ANY (authz) THEN
        -- THE AUTHORIZATION PLANE. Read-only, and then explicitly stripped of every write verb.
        -- The GRANT below never mentioned them, so the REVOKE is belt: it catches a database that
        -- an earlier deployment (or a well-meaning fix) already granted.
        EXECUTE format('GRANT SELECT ON TABLE %I TO qmulate_app', rec.tablename);
        EXECUTE format(
          'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_app',
          rec.tablename);
      ELSIF rec.tablename = 'audit_event' THEN
        -- APPEND-ONLY, AS A PRIVILEGE AND NOT ONLY AS A TRIGGER. `INSERT` must stay — that is what
        -- append-only MEANS, and it is why forging a marker row was possible at all. Everything
        -- else goes. The `audit_event_no_mutate` / `_no_truncate` / `_no_mutate_row` triggers stay
        -- the load-bearing control (they RAISE, with a diagnosis); this is the second latch, and
        -- `test/authorization-plane-privilege.integration.test.ts` records WHICH of the two fires.
        EXECUTE 'GRANT SELECT, INSERT ON TABLE audit_event TO qmulate_app';
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE audit_event FROM qmulate_app';
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO qmulate_app', rec.tablename);
        EXECUTE format(
          'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_app',
          rec.tablename);
      END IF;

      -- The identity-plane carve-out, applied AFTER the blanket revoke above so ordering cannot
      -- silently undo it.
      IF rec.tablename = ANY (identity) THEN
        EXECUTE format('GRANT DELETE ON TABLE %I TO qmulate_app', rec.tablename);
      END IF;
    END IF;

    IF has_prov THEN
      -- The provisioner READS everything (the scoping/audit extension chain reads on its way to a
      -- write) and WRITES only the authorization plane and the audit spine.
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
      ELSE
        EXECUTE format(
          'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_provisioner',
          rec.tablename);
      END IF;
    END IF;
  END LOOP;

  -- `audit_chain_head` needs UPDATE from the runtime: the hash chain advances its single row on
  -- every audited write. DELETE and TRUNCATE were revoked in the loop above.
  IF has_app THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE audit_chain_head TO qmulate_app;
  END IF;

  -- ── 2.3 · Sequences ───────────────────────────────────────────────────────────────────────
  -- MEASURED: exactly one sequence in `public` (`audit_event_id_seq`) — `audit_event.id` is the
  -- only autoincrement column in the schema; every other primary key is an application-supplied
  -- id. Driven off the catalogue anyway, so a second one is covered without an edit. An INSERT
  -- privilege without `USAGE` on the sequence fails at runtime with a confusing error, so this is
  -- not optional.
  FOR rec IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    IF has_app THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO qmulate_app', rec.sequencename);
    END IF;
    IF has_prov THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO qmulate_provisioner', rec.sequencename);
    END IF;
  END LOOP;

  -- ── 2.4 · FUNCTION EXECUTE — THE ONE MEASURED SILENT FULL ESCALATION ──────────────────────
  --
  -- ⚠ MEASURED AND LOAD-BEARING. A freshly created function has `proacl = NULL`, and a NULL ACL
  -- means EXECUTE IS GRANTED TO PUBLIC. So the moment anybody adds a `SECURITY DEFINER` function
  -- owned by `qmulate_owner` — the obvious shape for a provisioning procedure — the runtime role
  -- can call it, and INSIDE it `current_user` is the OWNER. That is a complete escalation from one
  -- forgotten line, and it is invisible in the migration that introduces it.
  --
  -- So: EXECUTE is revoked from PUBLIC on every function in `public`, the default for FUTURE
  -- functions is revoked too, and EXECUTE is then granted back ONLY on functions that are
  -- `SECURITY INVOKER` (`prosecdef = false`) — which run as the caller and therefore confer
  -- nothing. MEASURED today: 39 functions in `public`, ALL of them `prosecdef = false`, so nothing
  -- loses a privilege it was using; the integration suite calls several of them
  -- (`qmulate_unaudited_grant_suppressions`, `qmulate_apply_e2_*`) from the app connection and
  -- keeps working.
  --
  -- The posture test enumerates every `prosecdef` function and asserts its ACL grants EXECUTE to
  -- neither PUBLIC nor the runtime role, with the mutation being `GRANT EXECUTE … TO PUBLIC`
  -- inside a rolled-back transaction. That test must exist BEFORE the first SECURITY DEFINER
  -- function does, not after.
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §3 · THE POSTURE, READ FROM THE CATALOGUE
--
-- ⚠ WHY A FUNCTION AND NOT A LIST OF ASSERTIONS IN A TEST FILE. Five decision records in this
-- sprint claimed properties the code lacked, and each was believed by the next reader. A test that
-- asserts the SOURCE of a migration proves the migration says something; only a read of
-- `pg_roles` / `pg_class` / `information_schema.table_privileges` proves the database IS something.
-- This returns the live posture as one JSON document so the assertion cannot drift from the SQL.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION qmulate_assert_privilege_separation() RETURNS jsonb
LANGUAGE sql STABLE
AS $qm_posture$
  SELECT jsonb_build_object(
    'currentUser', current_user,
    'currentUserIsSuperuser',
      COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false),
    'currentUserBypassesRls',
      COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false),
    'roles', COALESCE((
      SELECT jsonb_object_agg(r.rolname, jsonb_build_object(
               'canLogin', r.rolcanlogin,
               'superuser', r.rolsuper,
               'bypassRls', r.rolbypassrls,
               'createRole', r.rolcreaterole,
               'createDb', r.rolcreatedb,
               'memberOf', COALESCE((
                 SELECT jsonb_agg(g.rolname ORDER BY g.rolname)
                   FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
                  WHERE m.member = r.oid), '[]'::jsonb)))
        FROM pg_roles r
       WHERE r.rolname IN (qmulate_runtime_role(), qmulate_provisioning_role(), qmulate_owner_role())
    ), '{}'::jsonb),
    'inventory', jsonb_build_object(
      'tables',    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
      'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public'),
      'sequences', (SELECT count(*) FROM pg_sequences WHERE schemaname = 'public')),
    -- One entry per DISTINCT owner, so "everything in public is owned by one role" is a
    -- single-key object rather than 38 rows a reader has to scan.
    'tableOwners', COALESCE((
      SELECT jsonb_object_agg(owner, n) FROM (
        SELECT tableowner AS owner, count(*) AS n FROM pg_tables
         WHERE schemaname = 'public' GROUP BY tableowner) o
    ), '{}'::jsonb),
    'functionOwners', COALESCE((
      SELECT jsonb_object_agg(owner, n) FROM (
        SELECT pg_get_userbyid(p.proowner) AS owner, count(*) AS n
          FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname = 'public' GROUP BY 1) o
    ), '{}'::jsonb),
    'sequenceOwners', COALESCE((
      SELECT jsonb_object_agg(sequenceowner, n) FROM (
        SELECT sequenceowner, count(*) AS n FROM pg_sequences
         WHERE schemaname = 'public' GROUP BY 1) o
    ), '{}'::jsonb),
    -- `{table: [privileges]}` for the runtime role and for the provisioner. Read from
    -- `information_schema` so an ACL entry inherited through a role membership is included —
    -- checking `relacl` by hand would miss exactly that.
    'appPrivileges', COALESCE((
      SELECT jsonb_object_agg(table_name, privs) FROM (
        SELECT table_name, jsonb_agg(DISTINCT privilege_type ORDER BY privilege_type) AS privs
          FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND grantee = qmulate_runtime_role()
         GROUP BY table_name) p
    ), '{}'::jsonb),
    'provisionerPrivileges', COALESCE((
      SELECT jsonb_object_agg(table_name, privs) FROM (
        SELECT table_name, jsonb_agg(DISTINCT privilege_type ORDER BY privilege_type) AS privs
          FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND grantee = qmulate_provisioning_role()
         GROUP BY table_name) p
    ), '{}'::jsonb),
    'rls', COALESCE((
      SELECT jsonb_object_agg(c.relname, jsonb_build_object(
               'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity,
               'policies', COALESCE((SELECT jsonb_agg(pol.polname ORDER BY pol.polname)
                                       FROM pg_policy pol WHERE pol.polrelid = c.oid), '[]'::jsonb)))
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ), '{}'::jsonb),
    -- THE ONE MEASURED SILENT FULL ESCALATION (see §2.4). Empty object = no SECURITY DEFINER
    -- function exists. A non-empty one must be reviewed entry by entry.
    'securityDefinerFunctions', COALESCE((
      SELECT jsonb_object_agg(p.proname, COALESCE(p.proacl::text, 'NULL (= EXECUTE TO PUBLIC)'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
    ), '{}'::jsonb),
    'publicExecutableFunctions', COALESCE((
      SELECT jsonb_agg(p.proname ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (p.proacl IS NULL OR EXISTS (
               SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
    ), '[]'::jsonb)
  )
$qm_posture$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §4 · APPLY
--
-- Same shape as migration 1 §2: tolerate the absent-role / insufficient-privilege case with a
-- NOTICE rather than failing the migration, because `prisma migrate dev` on a fresh cluster runs
-- before provisioning can have happened. §2's header says where the hard failure lives instead.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DO $qm_apply$
BEGIN
  PERFORM qmulate_apply_privilege_matrix();
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE
      'QMULATE: could not apply the privilege matrix — this connection lacks the privilege to '
      'change ACLs in schema public (%). Run `pnpm exec tsx scripts/provision-db-roles.ts` as the '
      'platform superuser, which creates the roles, reassigns ownership and calls '
      'qmulate_apply_privilege_matrix() itself.', SQLERRM;
END
$qm_apply$;
