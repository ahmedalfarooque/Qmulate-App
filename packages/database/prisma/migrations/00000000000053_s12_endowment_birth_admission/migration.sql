-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — S12-3b · THE BIRTH OF AN ENDOWMENT IS GOVERNED (BR-1101 intake · ADR-0008 round 8)
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT WAS TRUE BEFORE THIS FILE ─────────────────────────────────────────────────────────────
-- Migration 17's header: "the birth of an endowment is UNGOVERNED WHOLESALE — nothing asks WHO may
-- create one or that an `audit_event` name it, the way `waqf_access_grant_admission` does for a
-- seat." MEASURED there and re-stated in `guard-verb-coverage`'s two `waqf` exemptions: as
-- `qmulate_app`, `INSERT INTO "waqf" (…)` COMMITS, with `deletedAt` NULL or set (an endowment BORN
-- retired). S12-3b builds the FIRST request-path creation of an endowment (UI intake — owner ruling
-- 2026-09-08 "build ui intake"), so the gap it would otherwise walk through is closed FIRST.
--
-- ── WHAT THIS FILE DOES ────────────────────────────────────────────────────────────────────────
--   §1  two planes, named once: the BIRTH plane (`waqf`, `waqif` — the runtime role LOSES INSERT;
--       the provisioner GAINS it) and the birth CHILDREN (`trusteeship_deed`, `onboarding_gate` —
--       the provisioner gains INSERT so one intake transaction can lay the whole record down; the
--       runtime keeps its INSERT, because `deed.upsert` and `onboarding.clearGate` write them)
--   §2  `qmulate_apply_privilege_matrix()` re-created with those two branches (migration 10/50 shape)
--   §3  three readers: was this `waqf` row born in THIS transaction; the birth MARKER (the audit
--       event naming the new endowment, in this transaction, in the chain); and SIBLING-ENDOWMENT
--       AUTHORITY — the actor holds BOTH `endowment:waqf:write` AND `admin:access_matrix:write`,
--       established in the trail before the marker, on another live endowment of the SAME CLIENT
--   §4  `waqf_birth_admission` — a DEFERRABLE INITIALLY DEFERRED constraint trigger on INSERT:
--       a marker must exist and name an actor; `createdBy` is BOUND to that actor; the actor must
--       hold sibling authority; and no endowment is BORN RETIRED (`deletedAt` must be NULL at birth)
--   §5  `qmulate_grant_admission()` re-created with ONE bounded extra clause: when the target
--       `waqf` row was born in THIS transaction, sibling authority is accepted in place of
--       on-endowment authority — so the first NAZIR seat can be laid down with the birth. A seat
--       issued in any LATER transaction needs on-endowment authority exactly as before.
--   §6  the matrix applied; the EXECUTE sweep
--
-- ── THE OWNER CONNECTION IS EXEMPT FROM §4, BY `current_user`, AND THAT IS A DECISION ──────────
-- The ratified plan said the owner (seed, importer) would SUSPEND the trigger explicitly, as
-- `withAccessMatrixBootstrap()` does for seats. It does not, for three measured reasons: (1) six
-- database probes, the api harness and the seed all construct endowments raw AS THE OWNER inside
-- rolled-back or bootstrap transactions — every one is bootstrap-class by construction; (2) the owner
-- can `ALTER TABLE … DISABLE TRIGGER` regardless, so an explicit suspension adds ceremony and no
-- control; (3) `current_user` is the one fact a caller cannot write — migration 50 keys the approval
-- DECISION on exactly it (ADR-0008 round 7). This is NOT a `SYSTEM`-marker disjunct: the marker was
-- caller-authored text; the connection role is not. The born-retired refusal applies to EVERY role.
-- Grant admission (§5) exempts nobody — the seed keeps suspending it as before.
--
-- ── WHAT THIS FILE DOES NOT DECIDE ─────────────────────────────────────────────────────────────
--   · Q7 (owner, open): the FIRST endowment of a BRAND-NEW client has no sibling to lend authority.
--     Until answered, that birth is the owner-credential bootstrap (the importer / seed path) — the
--     refusal text below says so, as grant admission's does for the first admin seat.
--   · Whether `admin:access_matrix:write` alone should suffice. Both verbs are required: a birth is a
--     record write AND an issuance of the first seat, and the fixture's admin seat gains the record
--     verb (within the `admin` preset) with its reason in `seed/map.ts`.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · THE PLANES, WRITTEN ONCE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_endowment_birth_tables() RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['waqf', 'waqif']::text[] $$;

CREATE OR REPLACE FUNCTION qmulate_endowment_birth_child_tables() RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['trusteeship_deed', 'onboarding_gate']::text[] $$;

-- ── §1b · what this file does NOT do: `waqf."reversionClauseCaptured"` keeps NO DEFAULT ──────────
-- A first draft gave it DEFAULT false so the intake could omit it. `e3-lineage-reversion` refused
-- that in the catalogue ("has acquired a DEFAULT (binding rule 6)"): a defaulted مآل capture state is
-- a defaulted answer to "has anyone read where this endowment goes?", and the record must be made to
-- SAY it. So the intake STATES `false` (unread) explicitly, and the scoping extension's Waqf policy
-- judges that one sentinel on CREATE by the record verb rather than the signer's (see its note).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · THE MATRIX, RE-CREATED (migration 50's text + the two birth-plane branches, marked S12-3b)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §3 · THE READERS
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Was this endowment row inserted in the CURRENT transaction? The same `xmin` technique
-- `qmulate_grant_admission_marker()` uses for the marker (migration 5).
CREATE OR REPLACE FUNCTION qmulate_waqf_born_in_this_transaction(p_waqf_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_born$
  SELECT EXISTS (
    SELECT 1 FROM "waqf" w
     WHERE w."id" = p_waqf_id
       AND w.xmin = pg_current_xact_id()::xid
  );
$qm_born$;

-- The birth MARKER: the `audit_event` naming the new endowment, appended in THIS transaction and
-- already in the chain (the head has moved past it). Same shape as the grant marker.
CREATE OR REPLACE FUNCTION qmulate_waqf_birth_marker(p_waqf_id text)
RETURNS TABLE (actor_id text, actor_type text, event_id bigint)
LANGUAGE sql
STABLE
AS $qm_birth_marker$
  SELECT ae."actorId", ae."actorType"::text, ae."id"
    FROM "audit_event" ae
   WHERE ae."entityType" = 'Waqf'
     AND ae."entityId" = p_waqf_id
     AND ae.xmin = pg_current_xact_id()::xid
     AND EXISTS (
           SELECT 1 FROM "audit_chain_head" h WHERE h."id" = 1 AND h."lastId" >= ae."id"
         )
   ORDER BY ae."id" ASC
   LIMIT 1;
$qm_birth_marker$;

-- SIBLING-ENDOWMENT AUTHORITY. The actor holds BOTH verbs, ESTABLISHED (in the trail, strictly
-- before `p_before_event_id` — migration 7's precedence clause, reused, not re-implemented) on some
-- OTHER live endowment of the SAME CLIENT as `p_waqf_id`. Authority is per endowment (§10 principle
-- 2); this is the one place a family's sibling lends it, and only for a birth into that family.
CREATE OR REPLACE FUNCTION qmulate_sibling_endowment_authority(
  p_actor_id        text,
  p_waqf_id         text,
  p_before_event_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_sibling$
  SELECT p_actor_id IS NOT NULL AND btrim(p_actor_id) <> ''
     AND p_waqf_id IS NOT NULL AND btrim(p_waqf_id) <> ''
     AND p_before_event_id IS NOT NULL
     AND EXISTS (
    SELECT 1
      FROM "waqf" born
      JOIN "waqif" born_wf ON born_wf."id" = born."waqifId"
      JOIN "waqif" sib_wf  ON sib_wf."clientId" = born_wf."clientId"
      JOIN "waqf" sib      ON sib."waqifId" = sib_wf."id"
     WHERE born."id" = p_waqf_id
       AND sib."id" <> born."id"
       AND sib."deletedAt" IS NULL
       AND qmulate_actor_holds_established_permission(p_actor_id, sib."id", 'endowment:waqf:write', p_before_event_id)
       AND qmulate_actor_holds_established_permission(p_actor_id, sib."id", 'admin:access_matrix:write', p_before_event_id)
  );
$qm_sibling$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §4 · BIRTH ADMISSION
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_waqf_birth_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_birth_admission$
DECLARE
  marker_actor text;
  marker_type  text;
  marker_event bigint;
BEGIN
  -- Applies to EVERY role, the owner included: an endowment is never BORN retired. Before this
  -- file that INSERT committed (guard-verb-coverage's `waqf.deletedAt` exemption measured it).
  IF NEW."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION
      'waqf %: an endowment cannot be BORN retired ("deletedAt" is set on INSERT). Retirement of a '
      'LIVE endowment is a reserved matter (migration 17, memo Q8); a row born retired records an '
      'endowment as never having existed while occupying its identity. WAQF_BORN_RETIRED.',
      NEW."id"
      USING ERRCODE = '42501';
  END IF;

  -- The owner connection is the bootstrap (seed, importer, harness, probes) — see the header.
  IF current_user = qmulate_owner_role() THEN
    RETURN NULL;
  END IF;

  SELECT m.actor_id, m.actor_type, m.event_id
    INTO marker_actor, marker_type, marker_event
    FROM qmulate_waqf_birth_marker(NEW."id") m;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'waqf %: an endowment is not born outside the AUDITED intake path. This transaction inserted '
      'the row and appended no audit_event naming it, so there is nothing to attribute the birth to '
      'and nothing for anyone to review (BR-1101; migration 17 measured this route OPEN). Births go '
      'through intakeEndowment() on the provisioning connection. WAQF_BIRTH_NOT_ADMITTED.',
      NEW."id"
      USING ERRCODE = '42501';
  END IF;

  IF marker_actor IS NULL THEN
    RAISE EXCEPTION
      'waqf %: the audit_event admitting this birth names no actor (actorType "%"). An endowment '
      'must be attributable to a person; a SYSTEM job with no actorId cannot register one. '
      'WAQF_BIRTH_NOT_ADMITTED.',
      NEW."id", marker_type
      USING ERRCODE = '42501';
  END IF;

  IF NEW."createdBy" IS DISTINCT FROM marker_actor THEN
    RAISE EXCEPTION
      'waqf %: "createdBy" is "%" but the audit_event admitting this birth was recorded for actor '
      '"%". The registrar is NOT caller-supplied — it is bound to the acting identity, exactly as a '
      'seat''s issuer is (migration 5 §2b). WAQF_BIRTH_NOT_ADMITTED.',
      NEW."id", NEW."createdBy", marker_actor
      USING ERRCODE = '42501';
  END IF;

  IF NOT qmulate_sibling_endowment_authority(marker_actor, NEW."id", marker_event) THEN
    RAISE EXCEPTION
      'waqf %: actor "%" holds no ACTIVE grant carrying BOTH "endowment:waqf:write" AND '
      '"admin:access_matrix:write" on a SIBLING endowment of the same client, recorded in the audit '
      'trail before event % — so it may not register an endowment for that client. Authority is PER '
      'ENDOWMENT and it must PREDATE the act it authorises; a family''s sibling lends it for a birth '
      'INTO that family and for nothing else. The FIRST endowment of a BRAND-NEW client has no '
      'sibling and is not a request path: it needs the owner credential (the importer; S12 Q7). '
      'WAQF_BIRTH_NOT_ADMITTED.',
      NEW."id", marker_actor, marker_event
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL; -- an AFTER trigger's return value is ignored
END;
$qm_birth_admission$;

DROP TRIGGER IF EXISTS waqf_birth_admission ON "waqf";
CREATE CONSTRAINT TRIGGER waqf_birth_admission
  AFTER INSERT ON "waqf"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION qmulate_waqf_birth_admission();
ALTER TABLE "waqf" ENABLE ALWAYS TRIGGER waqf_birth_admission;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §5 · GRANT ADMISSION, RE-CREATED WITH THE BIRTH CLAUSE
--
-- Byte-for-byte migration 9's body except: (a) the authority assignment gains ONE disjunct —
-- `OR (born in this transaction AND sibling authority)`; (b) the refusal message gains one closing
-- sentence naming it. The assignment's FIRST TOKENS are unchanged on purpose:
-- `grant-admission-system-branch.integration.test.ts` locates
-- `authorised := qmulate_actor_holds_established_permission(` in the LIVE body to install its mutant,
-- and fails loudly if the substring is absent.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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

-- The trigger itself is unchanged (migration 5 §3: DEFERRABLE INITIALLY DEFERRED, ENABLE ALWAYS);
-- CREATE OR REPLACE FUNCTION rebinds it. Assert that here rather than assume it.
DO $qm_grant_trigger_check$
DECLARE
  installed record;
BEGIN
  SELECT t.tgenabled, t.tgdeferrable, t.tginitdeferred INTO installed
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.waqf_access_grant'::regclass AND t.tgname = 'waqf_access_grant_admission';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QMULATE S12-3b: waqf_access_grant_admission is not installed (migration 5 §3).';
  END IF;
  IF installed.tgenabled <> 'A' OR NOT (installed.tgdeferrable AND installed.tginitdeferred) THEN
    RAISE EXCEPTION 'QMULATE S12-3b: waqf_access_grant_admission is not ENABLE ALWAYS + DEFERRABLE INITIALLY DEFERRED.';
  END IF;
END
$qm_grant_trigger_check$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §6 · THE MATRIX APPLIED; THE SWEEP
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT qmulate_apply_privilege_matrix();

REVOKE EXECUTE ON FUNCTION qmulate_endowment_birth_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION qmulate_endowment_birth_child_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION qmulate_waqf_born_in_this_transaction(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION qmulate_waqf_birth_marker(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION qmulate_sibling_endowment_authority(text, text, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION qmulate_endowment_birth_tables() TO qmulate_app, qmulate_provisioner;
GRANT  EXECUTE ON FUNCTION qmulate_endowment_birth_child_tables() TO qmulate_app, qmulate_provisioner;
GRANT  EXECUTE ON FUNCTION qmulate_waqf_born_in_this_transaction(text) TO qmulate_app, qmulate_provisioner;
GRANT  EXECUTE ON FUNCTION qmulate_waqf_birth_marker(text) TO qmulate_app, qmulate_provisioner;
GRANT  EXECUTE ON FUNCTION qmulate_sibling_endowment_authority(text, text, bigint) TO qmulate_app, qmulate_provisioner;
