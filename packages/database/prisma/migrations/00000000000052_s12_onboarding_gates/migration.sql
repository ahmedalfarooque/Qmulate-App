-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — S12-3 · THE THREE ONBOARDING GATES, IN ORDER, AND WHAT GATE 02 BLOCKS (BR-1101 · V-11)
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- The operating model (docs/company/operating-model.md): "Sequenced handover gates — nothing
-- downstream proceeds until the prior gate clears. Gate 01 Authority & Legal → Gate 02 Systems &
-- Controls → Gate 03 People, Property & Cadence." §17's E11 exit: "a distribution run is blocked
-- while Gate 02 is incomplete"; V-11: "a distribution run or an Authority filing is attempted → it is
-- blocked with a clear gate-not-cleared reason; completing the gate unblocks it."
--
--   §1  enums + the `onboarding_gate` table (one row per endowment × gate; three rows at intake)
--   §2  `onboarding_gate_order` — Gate N may be CLEARED only while Gate N-1 is CLEARED; a REOPEN of
--       Gate N-1 while Gate N is CLEARED is refused (the order is not a suggestion in either direction)
--   §3  no delete, no truncate (a gate cleared in error is REOPENED — a recorded transition)
--   §4  the two DOWNSTREAM TWINS: `distribution_onboarding_gate` (BEFORE INSERT) and
--       `government_filing_onboarding_gate` (BEFORE UPDATE into SUBMITTED) refuse unless the
--       endowment's Gate 02 row is CLEARED. The api refuses first, by name; these hold against raw SQL.
--   §5  the privilege matrix (a new table has NO GRANTS until it is re-applied — migration 10 iterates)
--
-- ── WHAT THIS FILE DOES NOT DECIDE ──────────────────────────────────────────────────────────
--   · WHETHER a gate's prerequisites hold. A verified deed, a recorded classification, a dedicated
--     bank account, a beneficiary registry are facts the api reads at clear time; storing a derived
--     verdict beside the facts is the forbidden class (register). The CLEARANCE is what is stored.
--   · The human checklist behind each gate (owner Q4, unanswered) — `evidence` is a JSON attestation.
--   · An endowment with NO gate rows at all (born before this migration, or inserted raw) is treated
--     by §4 as NOT cleared — absence is not evidence. Every fixture endowment receives its three rows
--     from the seed; the intake path (S12-3b) writes them at birth.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · ENUMS + TABLE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $qm_gate_enums$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingGateKind') THEN
    CREATE TYPE "OnboardingGateKind" AS ENUM
      ('GATE_01_AUTHORITY_LEGAL', 'GATE_02_SYSTEMS_CONTROLS', 'GATE_03_PEOPLE_PROPERTY_CADENCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingGateStatus') THEN
    CREATE TYPE "OnboardingGateStatus" AS ENUM ('OPEN', 'CLEARED');
  END IF;
END
$qm_gate_enums$;

CREATE TABLE IF NOT EXISTS "onboarding_gate" (
  "id"              TEXT NOT NULL,
  "waqfId"          TEXT NOT NULL,
  "gate"            "OnboardingGateKind" NOT NULL,
  "status"          "OnboardingGateStatus" NOT NULL,
  "clearedAt"       TIMESTAMP(3),
  "clearedAtHijri"  TEXT,
  "clearedBy"       TEXT,
  "evidence"        JSONB,
  "note"            TEXT,
  "reopenedAt"      TIMESTAMP(3),
  "reopenedAtHijri" TEXT,
  "reopenedBy"      TEXT,
  "reopenReason"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "createdBy"       TEXT,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "onboarding_gate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "onboarding_gate" DROP CONSTRAINT IF EXISTS "onboarding_gate_waqfId_fkey";
ALTER TABLE "onboarding_gate" ADD CONSTRAINT "onboarding_gate_waqfId_fkey"
  FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_gate_waqfId_gate_key" ON "onboarding_gate" ("waqfId", "gate");
CREATE INDEX IF NOT EXISTS "onboarding_gate_waqfId_status_idx" ON "onboarding_gate" ("waqfId", "status");

-- A CLEARED gate is attributed and dual-dated; an OPEN gate carries no clearance.
SELECT qmulate_add_check('onboarding_gate', 'onboarding_gate_cleared_is_attributed',
  '("status" = ''CLEARED'') = ("clearedAt" IS NOT NULL) AND ("status" = ''CLEARED'') = ("clearedBy" IS NOT NULL)');
SELECT qmulate_add_check('onboarding_gate', 'onboarding_gate_cleared_dual_dated',
  '("clearedAt" IS NULL) = ("clearedAtHijri" IS NULL)');
-- A REOPEN is attributed, dual-dated and REASONED — and a CLEARED gate carries no reopen record.
SELECT qmulate_add_check('onboarding_gate', 'onboarding_gate_reopen_is_reasoned',
  '("reopenedAt" IS NULL) = ("reopenedAtHijri" IS NULL) AND ("reopenedAt" IS NULL) = ("reopenedBy" IS NULL) '
  'AND ("reopenedAt" IS NULL) = ("reopenReason" IS NULL)');
SELECT qmulate_add_check('onboarding_gate', 'onboarding_gate_cleared_has_no_reopen',
  '"status" <> ''CLEARED'' OR "reopenedAt" IS NULL');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · THE ORDER — in both directions
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_onboarding_gate_rank(p_gate "OnboardingGateKind")
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $qm_gate_rank$
  SELECT CASE p_gate
    WHEN 'GATE_01_AUTHORITY_LEGAL' THEN 1
    WHEN 'GATE_02_SYSTEMS_CONTROLS' THEN 2
    WHEN 'GATE_03_PEOPLE_PROPERTY_CADENCE' THEN 3
  END;
$qm_gate_rank$;

/** TRUE when the endowment's Gate 02 row exists AND is CLEARED. Absence is NOT evidence. */
CREATE OR REPLACE FUNCTION qmulate_onboarding_gate_cleared(p_waqf_id text, p_gate "OnboardingGateKind")
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_gate_cleared$
  SELECT EXISTS (
    SELECT 1 FROM "onboarding_gate" g
     WHERE g."waqfId" = p_waqf_id AND g."gate" = p_gate
       AND g."status" = 'CLEARED' AND g."deletedAt" IS NULL
  );
$qm_gate_cleared$;

CREATE OR REPLACE FUNCTION qmulate_onboarding_gate_order()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_gate_order$
DECLARE
  rank integer := qmulate_onboarding_gate_rank(NEW."gate");
  prior "OnboardingGateKind";
  later "OnboardingGateKind";
BEGIN
  -- The gate identity is write-once: a row may not migrate to another gate or endowment.
  IF TG_OP = 'UPDATE' AND (NEW."gate" IS DISTINCT FROM OLD."gate" OR NEW."waqfId" IS DISTINCT FROM OLD."waqfId") THEN
    RAISE EXCEPTION 'onboarding_gate %: (waqfId, gate) is write-once — a gate row is not re-pointed.', OLD."id"
      USING ERRCODE = '42501';
  END IF;

  -- CLEARING Gate N requires Gate N-1 CLEARED (INSERT born CLEARED — the seed — or UPDATE into it).
  IF NEW."status" = 'CLEARED' AND (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM 'CLEARED') AND rank > 1 THEN
    prior := CASE rank WHEN 2 THEN 'GATE_01_AUTHORITY_LEGAL'::"OnboardingGateKind"
                       ELSE 'GATE_02_SYSTEMS_CONTROLS'::"OnboardingGateKind" END;
    IF NOT qmulate_onboarding_gate_cleared(NEW."waqfId", prior) THEN
      RAISE EXCEPTION
        'onboarding_gate %: % cannot be CLEARED on waqf % while % is not CLEARED — the handover gates '
        'are SEQUENCED (BR-1101, operating model: "nothing downstream proceeds until the prior gate '
        'clears"). ONBOARDING_GATE_ORDER.',
        NEW."id", NEW."gate", NEW."waqfId", prior
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- REOPENING Gate N-1 while Gate N is CLEARED is refused: the order holds in both directions.
  IF TG_OP = 'UPDATE' AND OLD."status" = 'CLEARED' AND NEW."status" = 'OPEN' AND rank < 3 THEN
    later := CASE rank WHEN 1 THEN 'GATE_02_SYSTEMS_CONTROLS'::"OnboardingGateKind"
                       ELSE 'GATE_03_PEOPLE_PROPERTY_CADENCE'::"OnboardingGateKind" END;
    IF qmulate_onboarding_gate_cleared(NEW."waqfId", later) THEN
      RAISE EXCEPTION
        'onboarding_gate %: % cannot be REOPENED on waqf % while % is CLEARED — reopen the later gate '
        'first. ONBOARDING_GATE_ORDER.',
        NEW."id", NEW."gate", NEW."waqfId", later
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_gate_order$;

DROP TRIGGER IF EXISTS onboarding_gate_order ON "onboarding_gate";
CREATE TRIGGER onboarding_gate_order
  BEFORE INSERT OR UPDATE ON "onboarding_gate"
  FOR EACH ROW EXECUTE FUNCTION qmulate_onboarding_gate_order();
ALTER TABLE "onboarding_gate" ENABLE ALWAYS TRIGGER onboarding_gate_order;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §3 · NO DELETE, NO TRUNCATE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $qm_gate_retention$
BEGIN
  IF to_regprocedure('qmulate_remainder_reject_delete()') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S12-3: qmulate_remainder_reject_delete() is missing (migration 8).';
  END IF;
  IF to_regprocedure('qmulate_reject_truncate()') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S12-3: qmulate_reject_truncate() is missing (migration 4).';
  END IF;

  DROP TRIGGER IF EXISTS onboarding_gate_no_delete ON "onboarding_gate";
  EXECUTE format(
    'CREATE TRIGGER onboarding_gate_no_delete BEFORE DELETE ON "onboarding_gate" '
    'FOR EACH ROW EXECUTE FUNCTION qmulate_remainder_reject_delete(%L)',
    'This row is the record of a handover gate — cleared by whom, when, on what evidence, or '
    'reopened why. Deleting it erases the fact that a distribution or filing was, or was not, '
    'permitted at the time. A gate cleared in error is REOPENED (status = OPEN, with a reason), '
    'never removed.'
  );
  ALTER TABLE "onboarding_gate" ENABLE ALWAYS TRIGGER onboarding_gate_no_delete;

  DROP TRIGGER IF EXISTS onboarding_gate_no_truncate ON "onboarding_gate";
  CREATE TRIGGER onboarding_gate_no_truncate
    BEFORE TRUNCATE ON "onboarding_gate"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();
  ALTER TABLE "onboarding_gate" ENABLE ALWAYS TRIGGER onboarding_gate_no_truncate;
END
$qm_gate_retention$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §4 · WHAT GATE 02 BLOCKS — the database twins of the api's refusal
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_distribution_onboarding_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_dist_gate$
BEGIN
  IF NOT qmulate_onboarding_gate_cleared(NEW."waqfId", 'GATE_02_SYSTEMS_CONTROLS') THEN
    RAISE EXCEPTION
      'distribution %: a distribution run cannot be created on waqf % while onboarding Gate 02 '
      '(Systems & Controls) is not CLEARED — dedicated accounts, accounting and the compliance calendar '
      'precede any payout (BR-1101, §17 E11 exit, V-11). ONBOARDING_GATE_NOT_CLEARED.',
      NEW."id", NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$qm_dist_gate$;

DROP TRIGGER IF EXISTS distribution_onboarding_gate ON "distribution";
CREATE TRIGGER distribution_onboarding_gate
  BEFORE INSERT ON "distribution"
  FOR EACH ROW EXECUTE FUNCTION qmulate_distribution_onboarding_gate();
ALTER TABLE "distribution" ENABLE ALWAYS TRIGGER distribution_onboarding_gate;

CREATE OR REPLACE FUNCTION qmulate_government_filing_onboarding_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_filing_gate$
BEGIN
  IF NEW."status"::text = 'SUBMITTED' AND (TG_OP = 'INSERT' OR OLD."status"::text IS DISTINCT FROM 'SUBMITTED') THEN
    IF NOT qmulate_onboarding_gate_cleared(NEW."waqfId", 'GATE_02_SYSTEMS_CONTROLS') THEN
      RAISE EXCEPTION
        'government_filing %: an Authority filing cannot be SUBMITTED on waqf % while onboarding Gate 02 '
        '(Systems & Controls) is not CLEARED (BR-1101, V-11). ONBOARDING_GATE_NOT_CLEARED.',
        NEW."id", NEW."waqfId"
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$qm_filing_gate$;

DROP TRIGGER IF EXISTS government_filing_onboarding_gate ON "government_filing";
CREATE TRIGGER government_filing_onboarding_gate
  BEFORE INSERT OR UPDATE ON "government_filing"
  FOR EACH ROW EXECUTE FUNCTION qmulate_government_filing_onboarding_gate();
ALTER TABLE "government_filing" ENABLE ALWAYS TRIGGER government_filing_onboarding_gate;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §5 · THE PRIVILEGE MATRIX — a new table has no grants until this runs (migration 10 iterates)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $qm_gate_matrix$
BEGIN
  IF to_regprocedure('qmulate_apply_privilege_matrix()') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S12-3: qmulate_apply_privilege_matrix() is missing (migration 10).';
  END IF;
END
$qm_gate_matrix$;
SELECT qmulate_apply_privilege_matrix();

REVOKE EXECUTE ON FUNCTION qmulate_onboarding_gate_rank("OnboardingGateKind") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION qmulate_onboarding_gate_cleared(text, "OnboardingGateKind") FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION qmulate_onboarding_gate_rank("OnboardingGateKind") TO qmulate_app, qmulate_provisioner;
GRANT  EXECUTE ON FUNCTION qmulate_onboarding_gate_cleared(text, "OnboardingGateKind") TO qmulate_app, qmulate_provisioner;
