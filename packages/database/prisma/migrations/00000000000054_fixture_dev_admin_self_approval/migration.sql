-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — THE FIXTURE-ONLY DEVELOPMENT ADMINISTRATOR MAY APPROVE ITS OWN REQUESTS
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────
-- Maker ≠ checker is enforced HERE, not in application code: `approval_request_checker_ne_maker`
-- (migration 3) makes a self-approved row unrepresentable, and `qmulate_approval_defect()` (4/51)
-- repeats the test wherever an approval is SPENT. A local development database has ONE human, and
-- that human cannot both raise and decide a request — so every approve/sign path is unreachable
-- on a fixture cluster without a second person. This file adds the NARROWEST exception that can
-- exist at the database: ONE user id, named in a place only the DATABASE OWNER or a superuser can
-- write, consulted by the one CHECK and the one function that carry the rule.
--
-- ── WHERE THE EXEMPTION LIVES, AND WHY THERE ───────────────────────────────────────────────────
-- A per-DATABASE setting: `ALTER DATABASE … SET qmulate.dev_admin_self_approval_user_id = '<id>'`.
--   · It is written by `ALTER DATABASE`, which needs database OWNERSHIP (or superuser) — a
--     privilege the runtime role (`qmulate_app`), the provisioner and the migrator (`qmulate_owner`,
--     which owns the SCHEMA, not the database) all lack. A caller holding any application
--     credential cannot name themselves.
--   · It is READ FROM THE CATALOG (`pg_db_role_setting`), never from `current_setting()`: a session
--     `SET` of the same name — which any role may issue — is invisible to the function below. The
--     per-database default is the only thing that counts, and only the database owner writes it.
--   · A GUC holds ONE value, so at most one user id is exempt at a time, by construction.
--   · It is a fact about THIS database. A production or staging database never receives it: the
--     only writer is `packages/auth/src/dev-admin-setup.ts`, which refuses to start outside
--     `DATA_CLASSIFICATION=fixture-only`, and the application layer re-checks that classification
--     on every approve (`isDevAdminExempt`, `@qmulate/auth`) before the row ever reaches this CHECK.
--
-- ── WHAT CHANGES, EXACTLY ─────────────────────────────────────────────────────────────────────
--   §1  `qmulate_self_approval_exempt(text)` — the catalog reader (STABLE, SECURITY INVOKER)
--   §2  CHECK `approval_request_checker_ne_maker` re-created under the SAME NAME with ONE extra
--       disjunct: `OR qmulate_self_approval_exempt("checkerId")`. Every existing refusal is
--       unchanged for every other checker; the constraint stays in `REQUIRED_CHECK_CONSTRAINTS`.
--   §3  `qmulate_approval_defect()` — migration 51 §4's body byte-for-byte, except that the
--       "was self-approved" defect is not raised for the exempt checker. Every caller of that
--       function (distribution execute, filing submission, the reserved-matter door) inherits it.
--   §4  the EXECUTE sweep (the CHECK evaluates §1 as the writing role, which needs EXECUTE).
--
-- ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────────────────────────
-- The checker must still hold an ACTIVE NAZIR grant on the endowment (`approval_request_authority`);
-- the decision is still taken only on the approval plane (migration 50); the identity and decision
-- columns stay write-once; the BR-1102 chain is still required; nothing about grants, AML, scope,
-- audit or sessions is touched. With the setting absent — every database this file has ever met
-- except a fixture cluster that ran the dev-admin program — the CHECK is EXACTLY migration 3's.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · THE CATALOG READER
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_self_approval_exempt(p_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_self_approval_exempt$
  SELECT p_user_id IS NOT NULL
     AND btrim(p_user_id) <> ''
     AND EXISTS (
           SELECT 1
             FROM pg_catalog.pg_db_role_setting s
            WHERE s.setdatabase = (SELECT d.oid FROM pg_catalog.pg_database d
                                    WHERE d.datname = current_database())
              AND s.setrole = 0
              AND ('qmulate.dev_admin_self_approval_user_id=' || p_user_id) = ANY (s.setconfig)
         );
$qm_self_approval_exempt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · THE CHECK, SAME NAME, ONE MORE DISJUNCT
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "approval_request" DROP CONSTRAINT IF EXISTS approval_request_checker_ne_maker;
SELECT qmulate_add_check(
  'approval_request',
  'approval_request_checker_ne_maker',
  '"checkerId" IS NULL OR "checkerId" <> "makerId" OR qmulate_self_approval_exempt("checkerId")'
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §3 · qmulate_approval_defect() — migration 51 §4, with the exempt checker allowed
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_approval_defect(
  p_approval_id   text,
  p_waqf_id       text,
  p_expected_type text,
  p_subject_id    text,
  p_allow_spent   boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $qm_appr_defect$
DECLARE
  r record;
  missing text;
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
  -- THE ONE CHANGE (migration 54): the fixture-only development administrator, and nobody else.
  IF r."checkerId" = r."makerId" AND NOT qmulate_self_approval_exempt(r."checkerId") THEN
    RETURN format('approval_request %L was self-approved (checkerId = makerId = %L)',
                  p_approval_id, r."makerId");
  END IF;
  IF r."subjectId" IS DISTINCT FROM p_subject_id THEN
    RETURN format('approval_request %L was approved for subject %L, not %L — an approval binds to '
                  'its artifact, and one approved act is not a licence for another',
                  p_approval_id, COALESCE(r."subjectId", '<null>'), p_subject_id);
  END IF;

  -- ── S12-2 · THE CHAIN, LAST (BR-1102) ─────────────────────────────────────────────────────
  missing := qmulate_reserved_matter_chain_defect(p_approval_id);
  IF missing IS NOT NULL THEN
    RETURN format('approval_request %L: the BR-1102 approval chain is incomplete — %s is not '
                  'recorded. A reserved matter cannot execute without written principal approval, '
                  'counsel review and the Authority notice where required (§10 §9).',
                  p_approval_id, missing);
  END IF;

  RETURN NULL; -- genuine, genuinely about THIS artifact, and its chain is complete
END;
$qm_appr_defect$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §4 · THE EXECUTE SWEEP — PUBLIC executes nothing; the invoker functions above are granted back
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT qmulate_revoke_public_function_execute();
