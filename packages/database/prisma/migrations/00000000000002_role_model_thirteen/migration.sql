-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — narrow `Role` to §10's canonical THIRTEEN.
--
-- User decision, 2026-07-27. See `docs/decisions/ADR-0004-role-model-thirteen.md`.
--
-- Sprint 1 shipped a 16-value superset because three role lists disagreed (§07's 11, §10.2's 13,
-- the enum's 16). §10.2's thirteen is now canonical, so three values go:
--
--   MANDATE_LEAD  — a synonym for CASE_MANAGER. Removed.
--   ACCOUNTANT    — a synonym for FINANCE.      Removed.
--   APPROVER      — REMOVED, NOT REMAPPED.
--
-- On APPROVER specifically: §10 does not model "approver" as a role. Approval is an ACTION
-- (`A*`/`S*` in the §10.2 §3 grid) that the `nazir` holds. A standing APPROVER seat would create
-- a second approval authority alongside the Nazir, which BR-105 (accountability stays with the
-- Nazir, joint & several with an authorized representative) and BR-1103 (the RACI keeps
-- accountability with the Nazir) both forbid. There is deliberately no successor value: the
-- authority did not move, it was already the Nazir's.
--
-- ── THE GUARD, AND WHY IT IS NOT OPTIONAL ────────────────────────────────────────────────────
-- Postgres cannot drop a value from an enum in place; the type must be recreated and every
-- column recast. Prisma's generated recast is `("role"::text::"Role_new")`, which for a row
-- holding a REMOVED value fails with a bare `invalid input value for enum` — a message that says
-- nothing about which row, which value, or what the operator should do about it.
--
-- Worse would be to "helpfully" map the removed values onto survivors. That is exactly the silent
-- rewiring the decision forbids: mapping APPROVER onto NAZIR would hand somebody the Nazir's
-- approval authority as a side effect of a migration, with no approval trail and nobody deciding
-- it. So this migration REFUSES to run while any row still holds a removed value, and says which
-- rows and what the two legitimate resolutions are. Repointing a grant is a governance act; it
-- belongs in an audited application write, not in a DDL script.
--
-- No real data exists yet (DATA_CLASSIFICATION=fixture-only, NFR-03) and the fixture seed was
-- updated in the same commit, so on every current database this guard passes silently.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_role_guard$
DECLARE
  removed  text[] := ARRAY['MANDATE_LEAD', 'ACCOUNTANT', 'APPROVER'];
  offenders text;
  total     bigint;
BEGIN
  SELECT string_agg(line, E'\n'), sum(n)
    INTO offenders, total
  FROM (
    SELECT format('    waqf_access_grant.role = %L  (%s row(s))', role_value, n) AS line, n
      FROM (
        SELECT "role"::text AS role_value, count(*) AS n
          FROM "waqf_access_grant"
         WHERE "role"::text = ANY (removed)
         GROUP BY 1
      ) g
    UNION ALL
    SELECT format('    membership.role = %L  (%s row(s))', role_value, n) AS line, n
      FROM (
        SELECT "role"::text AS role_value, count(*) AS n
          FROM "membership"
         WHERE "role"::text = ANY (removed)
         GROUP BY 1
      ) m
  ) rows_holding_removed_values;

  IF total IS NOT NULL AND total > 0 THEN
    RAISE EXCEPTION
      E'QMULATE: refusing to narrow "Role" while % row(s) still hold a removed value.\n%\n\n'
      'MANDATE_LEAD and ACCOUNTANT were synonyms (CASE_MANAGER / FINANCE). APPROVER was REMOVED, '
      'NOT REMAPPED — approval is the Nazir''s action (BR-105 / BR-1103), so granting it to '
      'someone is a governance decision and cannot be a side effect of a migration.\n\n'
      'Resolve deliberately, then re-run:\n'
      '  • a synonym holder -> repoint to CASE_MANAGER or FINANCE (equivalent, safe);\n'
      '  • an APPROVER holder -> decide who actually holds approval authority on that endowment '
      'and issue that grant through the application, so it lands in the audit trail. Do NOT '
      'bulk-UPDATE it here.\n'
      'See docs/decisions/ADR-0004-role-model-thirteen.md.',
      total, offenders
      USING ERRCODE = '23514';
  END IF;
END;
$qm_role_guard$;


-- AlterEnum (Prisma-generated recast, guarded above)
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SYSTEM_ADMIN', 'NAZIR', 'AUTHORIZED_REP', 'CASE_MANAGER', 'FINANCE', 'COMPLIANCE_OFFICER', 'AML_OFFICER', 'COUNSEL', 'AUDITOR', 'SUBCONTRACTOR', 'FAMILY_BOARD', 'LEADERSHIP', 'BENEFICIARY');
ALTER TABLE "membership" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "waqf_access_grant" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;
