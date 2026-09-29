-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — ROW-LEVEL SECURITY ON THE AUTHORIZATION PLANE: A SECOND LATCH, NOT A REPLACEMENT.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT THIS FILE DOES, IN ONE SENTENCE ─────────────────────────────────────────────────────
-- `ENABLE` + `FORCE ROW LEVEL SECURITY` on `waqf_access_grant` and `membership`, with policies that
-- let the owner and the provisioner write and let everybody read — so that a future migration which
-- re-GRANTs `INSERT` to the runtime role does not, on its own, reopen ADR-0008's route 2.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ READ THIS BEFORE USING RLS ANYWHERE ELSE IN THIS SCHEMA. RLS DOES NOT REFUSE UNIFORMLY.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- MEASURED, PostgreSQL 17.10, `FORCE ROW LEVEL SECURITY` on, as a NON-SUPERUSER role:
--
--   INSERT with no permitting policy   ->  42501 'new row violates row-level security policy
--                                                 for table "waqf_access_grant"'   ← IT RAISES
--   UPDATE with no permitting policy   ->  0 rows affected, NO ERROR                ← IT FILTERS
--   DELETE with no permitting policy   ->  0 rows affected, NO ERROR                ← IT FILTERS
--
-- RLS is a row VISIBILITY mechanism. On `INSERT` there is no row to filter, so a failing
-- `WITH CHECK` is an error; on `UPDATE`/`DELETE` an absent policy simply makes every row invisible
-- and the statement is a silent no-op. That difference is why this migration writes INSERT-side
-- protection and why **RLS IS NOT AND CANNOT BE THE CONTROL FOR AUDIT IMMUTABILITY.**
--
-- `audit_event`'s immutability is the `audit_event_no_mutate` / `_no_mutate_row` / `_no_truncate`
-- TRIGGERS, because a trigger RAISES with a diagnosis. If a later reader "simplifies" by deleting
-- those triggers and trusting RLS, an `UPDATE audit_event SET …` stops being a refusal and becomes
-- a silent zero-row no-op — which looks identical to success from the client. Do not do that.
-- `test/authorization-plane-privilege.integration.test.ts` asserts WHICH control fires for each
-- verb, precisely so this distinction stays measured rather than remembered.
--
-- ── WHY ONLY TWO TABLES ──────────────────────────────────────────────────────────────────────
-- `waqf_access_grant` and `membership` are the two tables on which the runtime role holds NO write
-- privilege at all (migration 10 §2.2). That matters: because there is no runtime write path, a
-- policy this migration forgets cannot silently turn a working write into a zero-row no-op.
--
-- `approval_request` and `audit_event` are DELIBERATELY EXCLUDED for exactly that reason. Both are
-- written by the runtime on the request path (`root.ts`'s maker/checker create + update; every
-- audited write's event), so putting FORCE RLS on them would mean one missing `FOR UPDATE` policy
-- turns a maker/checker decision into a silent no-op that no test would necessarily catch, in
-- exchange for a latch behind a REVOKE that already holds. The trigger guards on those tables
-- already RAISE, and the ownership split now makes them unbypassable from the runtime role. That is
-- a decision recorded here so that "why is there no RLS on audit_event?" has an answer.
--
-- ── WHY THE OWNER MUST BE `NOSUPERUSER NOBYPASSRLS` ──────────────────────────────────────────
-- `FORCE ROW LEVEL SECURITY` is what makes policies apply to the TABLE OWNER; without it, the owner
-- silently bypasses every policy below. But FORCE does not bind a SUPERUSER, and it does not bind a
-- role with `BYPASSRLS` — for those, everything in this file is decorative. `scripts/provision-db-roles.ts`
-- therefore creates all three roles `NOSUPERUSER NOBYPASSRLS` and FAILS LOUDLY otherwise, and the
-- posture test asserts `rolsuper = false AND rolbypassrls = false` for each of them. The local
-- embedded cluster's default connection is `rolsuper = true, rolbypassrls = true` (MEASURED), so a
-- refusal observed on that connection proves nothing at all.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · THE LATCH
--
-- Policies are OR-ed, so the two below compose as: everybody may READ; only the owner or the
-- provisioner may WRITE.
--
-- ⚠ THE PREDICATES NAME ROLES AS STRING LITERALS, NOT VIA `pg_has_role`, AND THAT IS DELIBERATE.
-- `CREATE POLICY … TO qmulate_provisioner` would fail outright on a database where the roles have
-- not been provisioned yet — which is every `prisma migrate dev` on a fresh cluster. A predicate
-- over `current_user` needs no role to exist, so this migration applies unconditionally and the
-- policy simply admits nobody until the roles do exist.
--
-- ⚠ THE TABLE OWNER IS ALSO ADMITTED, AND THAT IS A TRADE-OFF, NOT AN OVERSIGHT. Without the owner
-- disjunct, a database that was migrated before `provision-db-roles.ts` ran would have FORCE RLS on
-- with no write policy at all, and the fixture seed's grant UPSERTs would silently affect zero rows
-- — a brick that looks like a pass. With it, the latch still refuses `qmulate_app` (which never owns
-- anything), which is the whole threat this closes. The posture test asserts the owner of
-- `waqf_access_grant` IS `qmulate_owner`, so "ownership drifted to the runtime role" fails the build
-- rather than quietly widening this policy.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION qmulate_may_write_authz_plane(target regclass) RETURNS boolean
LANGUAGE sql STABLE
AS $qm_may_write$
  SELECT current_user IN (qmulate_provisioning_role(), qmulate_owner_role())
      OR current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = target)
$qm_may_write$;

DO $qm_rls$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT unnest(qmulate_authz_plane_tables()) AS tablename
  LOOP
    IF to_regclass(format('public.%I', rec.tablename)) IS NULL THEN
      RAISE EXCEPTION
        'QMULATE: table %.% does not exist — migration 11 cannot install the authorization-plane '
        'RLS latch. Migrations apply in lexicographic order; this one requires the init migration.',
        'public', rec.tablename;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);
    -- FORCE is the half that makes the policies apply to the OWNER too. Without it this file is a
    -- comment (see the header).
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', rec.tablename);

    -- `CREATE POLICY` has no `OR REPLACE` before PostgreSQL 17 and this repository must keep
    -- applying on 16 (CI runs postgres:16-alpine), so DROP-then-CREATE is the portable idempotent
    -- shape. It is safe inside this `DO` block: one block = one statement = one transaction, so a
    -- failure between the DROP and the CREATE rolls the DROP back rather than leaving the table
    -- policy-less.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   rec.tablename || '_read_all', rec.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
      rec.tablename || '_read_all', rec.tablename);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   rec.tablename || '_privileged_write', rec.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      '  USING (qmulate_may_write_authz_plane(%L::regclass)) '
      '  WITH CHECK (qmulate_may_write_authz_plane(%L::regclass))',
      rec.tablename || '_privileged_write', rec.tablename,
      'public.' || rec.tablename, 'public.' || rec.tablename);

    RAISE NOTICE 'QMULATE: FORCE ROW LEVEL SECURITY + 2 policies installed on public.%',
                 rec.tablename;
  END LOOP;
END
$qm_rls$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · RE-APPLY THE MATRIX
--
-- Migration 10 §2.4 revoked EXECUTE from PUBLIC and granted it back only on the functions that
-- existed then. §1 above created a new one (`qmulate_may_write_authz_plane`), and the RLS policies
-- CALL it as whatever role is running the statement — so without this re-apply the runtime role
-- would hit 42501 on the function while merely SELECTing from `waqf_access_grant`, which is a
-- request-path read.
--
-- ⚠ THIS IS THE RULE FOR EVERY FUTURE MIGRATION THAT ADDS A FUNCTION, A TABLE OR A SEQUENCE:
-- end it with `SELECT qmulate_apply_privilege_matrix();`. The re-entry order is recorded in
-- `prisma/sql/README.md`; this call is always LAST.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DO $qm_reapply$
BEGIN
  PERFORM qmulate_apply_privilege_matrix();
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'QMULATE: privilege matrix re-apply skipped (%).', SQLERRM;
END
$qm_reapply$;
