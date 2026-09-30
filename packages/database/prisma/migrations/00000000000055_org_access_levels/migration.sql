-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- CUMULATE APP — THE ORGANISATION LAYER: REGISTRATION STATE, ACCESS LEVELS, THE PRIMARY ADMIN
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────
-- Until now every permission in this product was a PER-ENDOWMENT grant (`waqf_access_grant`),
-- and the first grant of an environment could only be laid down by the bootstrap on the owner
-- connection. That is right for endowment data and stays exactly as it is. What was missing is
-- the layer ABOVE it: who may manage users, who may seat people on endowments, who may read the
-- trail, and what state a freshly registered account is in before anyone has vetted it. This
-- migration adds that layer as DATA, not as code:
--
--   §1  `user.status`        — PENDING_APPROVAL | ACTIVE | DISABLED | REJECTED. Every row that
--                              exists today becomes ACTIVE (they were vetted by being here); every
--                              row created from now on starts PENDING_APPROVAL, by column default,
--                              so the auth library needs no special knowledge of it.
--       `user.isPrimaryAdmin` — the one account that can never be locked out (§5).
--       `user.accessLevelId`  — which organisation-wide level the account holds.
--   §2  `access_level`       — the five levels (ADMIN, OWNER, MANAGER, USER, CUSTOM) with their
--                              ORGANISATION-SCOPE permissions and the seat template used when an
--                              administrator seats the person on an endowment. Rows, so they are
--                              editable from the Roles & Permissions screen; `isSystem` rows may
--                              be edited but not deleted or renamed by key.
--   §3  `user_permission_override` — per-user ALLOW/DENY on top of the level.
--   §4  `qmulate_actor_holds_org_permission(actor, permission)` — the evaluator the DATABASE
--       uses, so that authority written here is the same authority the triggers check.
--   §5  Guards: the last ACTIVE primary administrator cannot be demoted, disabled or deleted;
--       the organisation columns of `user` may only be written on the provisioning connection.
--   §6  `qmulate_grant_admission()` re-created with ONE extra disjunct: an actor holding the
--       ORGANISATION-WIDE `admin:access_matrix:write` (through their level, an override, or by
--       being the primary administrator) may seat people on any endowment. The per-endowment
--       branch, the SYSTEM bootstrap branch, the audit marker and the attribution rule are
--       byte-for-byte what migration 5 wrote. `waqf_access_grant_no_self_issue` still applies:
--       nobody, primary administrator included, seats themselves.
--   §7  Privileges for the runtime and provisioning roles.
--
-- ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────────────────────────
-- Approve/sign stay with the Nazir seat (ADR-0004, BR-105): an access level confers no approval
-- verb on any endowment. Endowment data is still reached only through a grant on that endowment.
-- The thirteen-role enum is untouched. Nothing here is deleted or reset.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── §1 user: registration state, primary administrator, access level ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
    CREATE TYPE "UserStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REJECTED');
  END IF;
END $$;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
-- Rows that exist at migration time were vetted by existing; rows created afterwards start pending.
ALTER TABLE "user" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isPrimaryAdmin" boolean NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accessLevelId" text NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "statusChangedAt" timestamp(3) NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "statusReason" text NULL;

-- ── §2 access_level ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "access_level" (
  "id"              text PRIMARY KEY,
  "key"             text NOT NULL,
  "nameEn"          text NOT NULL,
  "nameAr"          text NOT NULL,
  -- Organisation-scope permissions (`module:resource:verb`), effective everywhere, no endowment.
  "permissions"     text[] NOT NULL DEFAULT '{}',
  -- The seat template: the Role and the permissions an administrator issues by default when seating
  -- a holder of this level on an endowment. NULL role = the level has no default seat.
  "seatRole"        "Role" NULL,
  "seatPermissions" text[] NOT NULL DEFAULT '{}',
  "isSystem"        boolean NOT NULL DEFAULT false,
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       text NULL,
  CONSTRAINT "access_level_key_unique" UNIQUE ("key"),
  CONSTRAINT "access_level_key_shape" CHECK ("key" ~ '^[A-Z][A-Z0-9_]{1,39}$')
);

-- The five defaults. Organisation-scope permissions only; endowment access is a seat.
INSERT INTO "access_level" ("id", "key", "nameEn", "nameAr", "permissions", "seatRole", "seatPermissions", "isSystem")
VALUES
  ('level-admin', 'ADMIN', 'Administrator', 'مدير النظام',
   ARRAY['admin:user:read','admin:user:write','admin:access_level:read','admin:access_level:write',
         'admin:access_matrix:read','admin:access_matrix:write','admin:setting:read','admin:setting:write',
         'audit:event:read'],
   'SYSTEM_ADMIN',
   ARRAY['endowment:waqf:read','endowment:waqf:write','endowment:deed:read','endowment:deed:write',
         'endowment:asset:read','endowment:asset:write','beneficiary:beneficiary:read','beneficiary:beneficiary:write',
         'beneficiary:ubo:read','beneficiary:ubo:write','compliance:task:read','compliance:task:write',
         'compliance:filing:read','compliance:filing:write','document:document:read','document:document:write',
         'reporting:report:read','reporting:statement:read','admin:access_matrix:read','admin:access_matrix:write',
         'admin:setting:read','admin:setting:write','audit:event:read','approval:request:read','approval:request:initiate'],
   true),
  ('level-owner', 'OWNER', 'Owner', 'مالك',
   ARRAY['admin:user:read','admin:access_level:read','admin:access_matrix:read','admin:access_matrix:write',
         'admin:setting:read','audit:event:read'],
   'LEADERSHIP',
   ARRAY['endowment:waqf:read','endowment:deed:read','endowment:asset:read','beneficiary:beneficiary:read',
         'beneficiary:ubo:read','finance:transaction:read','finance:bank_account:read','distribution:run:read',
         'distribution:line_item:read','distribution:bank_movement:read','fee:nazir_fee:read','compliance:task:read',
         'compliance:filing:read','legal:case:read','legal:reserved_matter:read','document:document:read',
         'reporting:report:read','reporting:statement:read','admin:access_matrix:read','audit:event:read',
         'approval:request:read'],
   true),
  ('level-manager', 'MANAGER', 'Manager', 'مدير',
   ARRAY['audit:event:read'],
   'CASE_MANAGER',
   ARRAY['endowment:waqf:read','endowment:waqf:write','endowment:deed:read','endowment:asset:read',
         'beneficiary:beneficiary:read','beneficiary:beneficiary:write','beneficiary:ubo:read',
         'compliance:task:read','compliance:task:write','compliance:filing:read','document:document:read',
         'document:document:write','reporting:report:read','approval:request:read','approval:request:initiate'],
   true),
  ('level-user', 'USER', 'User', 'مستخدم',
   ARRAY[]::text[],
   'AUDITOR',
   ARRAY['endowment:waqf:read','endowment:deed:read','beneficiary:beneficiary:read','compliance:task:read',
         'document:document:read','reporting:report:read'],
   true),
  ('level-custom', 'CUSTOM', 'Custom', 'مخصص',
   ARRAY[]::text[],
   NULL,
   ARRAY[]::text[],
   true)
ON CONFLICT ("key") DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_accessLevelId_fkey') THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_accessLevelId_fkey"
      FOREIGN KEY ("accessLevelId") REFERENCES "access_level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "user_status_idx" ON "user" ("status");
CREATE INDEX IF NOT EXISTS "user_accessLevelId_idx" ON "user" ("accessLevelId");

-- ── §3 user_permission_override ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_permission_override" (
  "id"         text PRIMARY KEY,
  "userId"     text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "permission" text NOT NULL,
  "effect"     text NOT NULL,
  "createdAt"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"  text NULL,
  -- An override is withdrawn by stamping deletedAt (the audit spine refuses hard deletes); the
  -- (userId, permission) row is revived on re-add, so the unique key stays one row per pair.
  "deletedAt"  timestamp(3) NULL,
  CONSTRAINT "user_permission_override_user_permission_unique" UNIQUE ("userId", "permission"),
  CONSTRAINT "user_permission_override_effect" CHECK ("effect" IN ('ALLOW', 'DENY')),
  CONSTRAINT "user_permission_override_permission_shape" CHECK ("permission" ~ '^[a-z_]+:[a-z_]+:[a-z]+$')
);
ALTER TABLE "user_permission_override" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(3) NULL;
CREATE INDEX IF NOT EXISTS "user_permission_override_userId_idx" ON "user_permission_override" ("userId");

-- ── §4 the organisation-scope evaluator ──────────────────────────────────────────────────────
-- ONE definition of "does this person hold this organisation-wide permission", used by the
-- admission trigger below and mirrored in TypeScript by `resolveOrgAccess()`; a test compares the
-- two so they cannot drift. Order: the account must be ACTIVE; the primary administrator holds
-- every organisation permission; a DENY override beats the level; an ALLOW override adds to it.
CREATE OR REPLACE FUNCTION qmulate_actor_holds_org_permission(p_actor text, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_org_perm$
  SELECT COALESCE((
    SELECT u."status" = 'ACTIVE'
       AND (
         u."isPrimaryAdmin"
         OR (
           NOT EXISTS (SELECT 1 FROM "user_permission_override" o
                        WHERE o."userId" = u."id" AND o."permission" = p_permission AND o."effect" = 'DENY'
                          AND o."deletedAt" IS NULL)
           AND (
             EXISTS (SELECT 1 FROM "access_level" al
                      WHERE al."id" = u."accessLevelId" AND p_permission = ANY(al."permissions"))
             OR EXISTS (SELECT 1 FROM "user_permission_override" o
                         WHERE o."userId" = u."id" AND o."permission" = p_permission AND o."effect" = 'ALLOW'
                           AND o."deletedAt" IS NULL)
           )
         )
       )
      FROM "user" u WHERE u."id" = p_actor
  ), false);
$qm_org_perm$;

-- ── §5 guards on user ────────────────────────────────────────────────────────────────────────
-- 5a. The organisation columns are written only on the provisioning/owner connection: the runtime
--     role (better-auth) updates names, verification flags and second-factor state, never these.
CREATE OR REPLACE FUNCTION qmulate_user_org_columns_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_user_org$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW."status"          IS DISTINCT FROM OLD."status"
       OR NEW."isPrimaryAdmin"  IS DISTINCT FROM OLD."isPrimaryAdmin"
       OR NEW."accessLevelId"   IS DISTINCT FROM OLD."accessLevelId")
     AND current_user NOT IN ('qmulate_provisioner', 'qmulate_owner')
     AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
  THEN
    RAISE EXCEPTION
      'user %: status / isPrimaryAdmin / accessLevelId are written only on the provisioning '
      'connection (current role "%"). Registration decisions and level changes go through the '
      'audited admin path, never through the runtime role.', OLD."id", current_user
      USING ERRCODE = '42501';
  END IF;
  -- The primary administrator is, by definition, an ACTIVE account.
  IF NEW."isPrimaryAdmin" AND NEW."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'user %: the primary administrator must be ACTIVE (status "%")', NEW."id", NEW."status"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$qm_user_org$;
DROP TRIGGER IF EXISTS user_org_columns_guard ON "user";
CREATE TRIGGER user_org_columns_guard
  BEFORE INSERT OR UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION qmulate_user_org_columns_guard();
ALTER TABLE "user" ENABLE ALWAYS TRIGGER user_org_columns_guard;

-- 5b. The application can never be left without an ACTIVE primary administrator.
CREATE OR REPLACE FUNCTION qmulate_last_primary_admin_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_last_admin$
DECLARE
  others integer;
BEGIN
  IF NOT OLD."isPrimaryAdmin" THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' OR NOT NEW."isPrimaryAdmin" OR NEW."status" <> 'ACTIVE' THEN
    SELECT count(*) INTO others FROM "user"
     WHERE "isPrimaryAdmin" AND "status" = 'ACTIVE' AND "id" <> OLD."id";
    IF others = 0 THEN
      RAISE EXCEPTION
        'user %: this is the last ACTIVE primary administrator and cannot be demoted, disabled or '
        'deleted. Promote another account to primary administrator first.', OLD."id"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$qm_last_admin$;
DROP TRIGGER IF EXISTS user_last_primary_admin_guard ON "user";
CREATE TRIGGER user_last_primary_admin_guard
  BEFORE UPDATE OR DELETE ON "user"
  FOR EACH ROW EXECUTE FUNCTION qmulate_last_primary_admin_guard();
ALTER TABLE "user" ENABLE ALWAYS TRIGGER user_last_primary_admin_guard;

-- 5c. System levels keep their key and are never deleted; any level in use is never deleted (FK).
CREATE OR REPLACE FUNCTION qmulate_access_level_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_level_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isSystem" THEN
      RAISE EXCEPTION 'access_level %: system levels are edited, never deleted', OLD."key" USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."key" IS DISTINCT FROM OLD."key" OR NEW."isSystem" IS DISTINCT FROM OLD."isSystem") THEN
    RAISE EXCEPTION 'access_level %: key and isSystem are immutable', OLD."key" USING ERRCODE = '23514';
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$qm_level_guard$;
DROP TRIGGER IF EXISTS access_level_guard ON "access_level";
CREATE TRIGGER access_level_guard
  BEFORE UPDATE OR DELETE ON "access_level"
  FOR EACH ROW EXECUTE FUNCTION qmulate_access_level_guard();
ALTER TABLE "access_level" ENABLE ALWAYS TRIGGER access_level_guard;

-- ── §6 grant admission: the organisation-wide branch ─────────────────────────────────────────
-- Migration 53's function (which carries migration 7's precedence clause, migration 9's closed
-- SYSTEM route and S12-3b's birth clause) re-created with exactly ONE extra disjunct in the
-- authority expression. Nothing else in the body is changed.
CREATE OR REPLACE FUNCTION qmulate_grant_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_admission$
DECLARE
  marker_actor text;
  marker_type  text;
  marker_event bigint;
  widened      text := NULL;
  authorised   boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF    NEW."role"                 IS DISTINCT FROM OLD."role"                 THEN widened := 'role';
    ELSIF NEW."userId"               IS DISTINCT FROM OLD."userId"               THEN widened := 'userId';
    ELSIF NEW."waqfId"               IS DISTINCT FROM OLD."waqfId"               THEN widened := 'waqfId';
    ELSIF NEW."permissions"          IS DISTINCT FROM OLD."permissions"          THEN widened := 'permissions';
    ELSIF NEW."dataScopes"           IS DISTINCT FROM OLD."dataScopes"           THEN widened := 'dataScopes';
    ELSIF NEW."scopeRefs"            IS DISTINCT FROM OLD."scopeRefs"            THEN widened := 'scopeRefs';
    ELSIF NEW."canViewAmlRestricted" IS DISTINCT FROM OLD."canViewAmlRestricted" THEN widened := 'canViewAmlRestricted';
    ELSIF NEW."amlCompartment"       IS DISTINCT FROM OLD."amlCompartment"       THEN widened := 'amlCompartment';
    ELSIF NEW."beneficiarySelfId"    IS DISTINCT FROM OLD."beneficiarySelfId"    THEN widened := 'beneficiarySelfId';
    ELSIF NEW."grantedByUserId"      IS DISTINCT FROM OLD."grantedByUserId"      THEN widened := 'grantedByUserId';
    ELSIF NEW."validFrom" < OLD."validFrom"                                      THEN widened := 'validFrom';
    ELSIF OLD."validUntil" IS NOT NULL
      AND (NEW."validUntil" IS NULL OR NEW."validUntil" > OLD."validUntil")      THEN widened := 'validUntil';
    ELSIF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL                THEN widened := 'revokedAt';
    ELSIF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL                THEN widened := 'deletedAt';
    END IF;

    IF widened IS NULL THEN
      RETURN NULL; -- a pure narrowing, or a no-op. See migration 5's note.
    END IF;
  END IF;

  SELECT m.actor_id, m.actor_type, m.event_id
    INTO marker_actor, marker_type, marker_event
    FROM qmulate_grant_admission_marker(NEW."id") m;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'waqf_access_grant %: the authorization plane is not writable outside the AUDITED '
      'access-matrix path. This transaction wrote%the row and appended no audit_event naming it, '
      'so there is nothing to attribute the change to and nothing for anyone to review. A '
      'FINANCE seat used exactly this path — `$executeRawUnsafe` on its own scoped client — to '
      'mint itself an ACTIVE NAZIR grant on two endowments with ZERO audit events, and then to '
      'approve another maker''s SAR 4.5m bank movement (MP-15, MP-17, BR-105/BR-1103, §10 '
      'principle 3). Write grants through activateGrant() / withAudit().',
      NEW."id", CASE WHEN TG_OP = 'UPDATE' THEN ' (widened "' || widened || '" on) ' ELSE ' ' END
      USING ERRCODE = '42501';
  END IF;

  IF marker_actor IS NULL THEN
    RAISE EXCEPTION
      'waqf_access_grant %: the audit_event admitting this write names no actor (actorType "%"). An '
      'access-matrix change must be attributable to a person; a SYSTEM job with no actorId cannot '
      'issue a seat.', NEW."id", marker_type
      USING ERRCODE = '42501';
  END IF;
  IF NEW."grantedByUserId" IS DISTINCT FROM marker_actor THEN
    RAISE EXCEPTION
      'waqf_access_grant %: "grantedByUserId" is "%" but the audit_event admitting this write was '
      'recorded for actor "%". The issuer is NOT caller-supplied — it is bound to the acting '
      'identity, because a caller who may name a third party as issuer defeats '
      'waqf_access_grant_no_self_issue by writing somebody else''s id and promoting themselves '
      '(§10 principle 3, BR-105).',
      NEW."id", NEW."grantedByUserId", marker_actor
      USING ERRCODE = '42501';
  END IF;

  authorised := qmulate_actor_holds_established_permission(marker_actor, NEW."waqfId",
                                                           'admin:access_matrix:write', marker_event)
             -- Migration 55 · THE ORGANISATION BRANCH: an ACTIVE account holding the organisation-wide
             -- `admin:access_matrix:write` (primary administrator, its level, or an ALLOW override)
             -- may seat people on ANY endowment. The rows it reads (`user`, `access_level`,
             -- `user_permission_override`) are writable only on the provisioning connection, so the
             -- claim cannot be minted by the caller; `waqf_access_grant_no_self_issue` still refuses
             -- seating oneself.
             OR qmulate_actor_holds_org_permission(marker_actor, 'admin:access_matrix:write')
             -- S12-3b · THE BIRTH CLAUSE, bounded to THIS transaction: the endowment was born here,
             -- and the actor holds sibling authority on the same client. Any seat issued in a
             -- later transaction is judged by the on-endowment clause above and nothing else.
             OR (qmulate_waqf_born_in_this_transaction(NEW."waqfId")
                 AND qmulate_sibling_endowment_authority(marker_actor, NEW."waqfId", marker_event));

  IF NOT authorised THEN
    RAISE EXCEPTION
      'waqf_access_grant %: actor "%" holds no ACTIVE grant carrying "admin:access_matrix:write" on '
      'waqf "%" that was already recorded in the audit trail before event % — so it may not write '
      'that endowment''s access matrix. THE MARKER''S actorType IS NO LONGER CONSULTED: claiming '
      '"SYSTEM" admitted this write until migration 9, and a FINANCE seat used exactly that claim, '
      'with an actorId that was not even a User row, to mint itself an ACTIVE NAZIR seat and approve '
      'another maker''s SAR 4.5m bank movement. Authority is PER ENDOWMENT, and it must PREDATE the '
      'act it authorises: a seat issued in this very transaction cannot be the authority for it, '
      'because two rows that vouch for each other are not authority, they are a loop. A claim in a '
      'request context is not authority either — the context said the caller was permitted and the '
      'database is the layer that checks (MP-17, MP-18, §10 principle 3). Provisioning a FIRST admin '
      'seat is not a request path: it needs table ownership (withAccessMatrixBootstrap()). The ONE '
      'exception (migration 53): a seat laid down in the SAME transaction as the endowment''s birth, '
      'by an actor holding sibling-endowment authority on the same client.',
      NEW."id", marker_actor, NEW."waqfId", marker_event
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL; -- an AFTER trigger's return value is ignored
END;
$qm_grant_admission$;

-- ── §7 privileges ────────────────────────────────────────────────────────────────────────────
-- The two new tables join the AUTHORIZATION PLANE: the runtime role reads them and never writes
-- them; the provisioner writes them through the audited admin path. The privilege matrix
-- function is re-created (migration 53's text) with one branch: provisioner column-UPDATE on
-- `user`'s organisation columns (overrides are soft-deleted, so no DELETE anywhere). Re-running the matrix
-- — which every provisioning run does — therefore converges to this state instead of undoing it.
CREATE OR REPLACE FUNCTION qmulate_authz_plane_tables() RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['waqf_access_grant', 'membership', 'access_level', 'user_permission_override']::text[] $$;

CREATE OR REPLACE FUNCTION qmulate_apply_privilege_matrix() RETURNS void
LANGUAGE plpgsql
AS $qm_matrix$
DECLARE
  app_role   text := qmulate_runtime_role();
  prov_role  text := qmulate_provisioning_role();
  authz      text[] := qmulate_authz_plane_tables();
  identity   text[] := qmulate_identity_plane_tables();
  birth      text[] := qmulate_endowment_birth_tables();
  birthkids  text[] := qmulate_endowment_birth_child_tables();
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
      ELSIF rec.tablename = ANY (birth) THEN
        -- S12-3b: the BIRTH PLANE. The runtime UPDATES an endowment record (classification, deed
        -- terms, retirement — each behind its own guard) and never CREATES one: a birth is the
        -- provisioner's act, admitted by `waqf_birth_admission` on sibling-endowment authority.
        EXECUTE format('GRANT SELECT, UPDATE ON TABLE %I TO qmulate_app', rec.tablename);
        EXECUTE format(
          'REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_app',
          rec.tablename);
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
      ELSIF rec.tablename = 'user' THEN
        -- Migration 55: registration decisions and level changes are provisioner writes, but only
        -- on the organisation columns — names, credentials and second-factor state stay the
        -- runtime role's (better-auth) business. `user_org_columns_guard` refuses the same columns
        -- from every other role.
        EXECUTE 'GRANT UPDATE ("status", "isPrimaryAdmin", "accessLevelId", "statusChangedAt", "statusReason", "updatedAt") ON TABLE "user" TO qmulate_provisioner';
        EXECUTE 'REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "user" FROM qmulate_provisioner';
      ELSIF rec.tablename = 'approval_request' THEN
        -- S12-1 / AV4-02: the approval plane DECIDES (UPDATE) and never MINTS (no INSERT).
        EXECUTE 'GRANT UPDATE ON TABLE approval_request TO qmulate_provisioner';
        EXECUTE 'REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE approval_request FROM qmulate_provisioner';
      ELSIF rec.tablename = ANY (birth) OR rec.tablename = ANY (birthkids) THEN
        -- S12-3b: the provisioner BIRTHS (INSERT) an endowment, its founder row, its trusteeship
        -- deed and its three gates in ONE audited transaction — and never UPDATES any of them.
        EXECUTE format('GRANT INSERT ON TABLE %I TO qmulate_provisioner', rec.tablename);
        EXECUTE format(
          'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I FROM qmulate_provisioner',
          rec.tablename);
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

REVOKE EXECUTE ON FUNCTION qmulate_actor_holds_org_permission(text, text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_app') THEN
    GRANT EXECUTE ON FUNCTION qmulate_actor_holds_org_permission(text, text) TO qmulate_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmulate_provisioner') THEN
    GRANT EXECUTE ON FUNCTION qmulate_actor_holds_org_permission(text, text) TO qmulate_provisioner;
  END IF;
END $$;
