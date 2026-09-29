-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Migration 48 · S11-1 — the `REGISTER_30BD` and `ISTIBDAL_10BD` clock-starts get a RECORDED HOME.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- THE RULING THIS LANDS (product owner, 2026-08-31; `S4-owner-decision-memo.md`, S10 addendum second
-- batch, record-commit 9f3d8fd — which precedes this file, per protocol). Verbatim: *"the stating
-- dates for now should be an input field that i can put. once there is clarity we can refine down th
-- eline and increase governance"* — and, on the follow-up, *"yes sure, make a drop down if that
-- helps."*
--
-- WHAT WAS TRUE BEFORE THIS FILE (measured 2026-09-02, `deadlines/anchors.ts` + `schema.prisma`):
-- three of the nine §09 deadline rules ROUTED — refused by name — because the fact their clock counts
-- from had no column. `REGISTER_30BD`'s anchor is "the waqf documentation / regulation-effective
-- date", and the only date near it, `waqf.registrationDate`, is the REGISTRATION ITSELF: counting a
-- 30-business-day window from the completion of the act it governs is vacuously met or decades
-- overdue. `ISTIBDAL_10BD`'s anchor is the istibdal COMPLETION date, and `expropriation` records the
-- taking's announcement and the duty's DISCHARGE (`authorityNotifiedDate`), never its completion —
-- deriving from the discharge would make every notification exactly on time. Both were owner-queue
-- items; the owner answered.
--
-- WHAT THIS FILE ADDS, AND THE THREE PROPERTIES THE COLUMNS CARRY:
--
--   1. RECORDED OPERATOR INPUT. A human enters these; nothing derives, infers or defaults them.
--      NO `DEFAULT` on any column below — a defaulted anchor is a defaulted answer to "when did the
--      clock start", and this repository has refused that shape three times (OQ-06's ṣiyāna reserve,
--      `continuationStipulation`, the periodic-register period).
--
--   2. A DECLARED KIND TRAVELS WITH THE REGISTRATION DATE. `"RegistrationAnchorKind"` is a CLOSED
--      two-value type — WAQF_DOCUMENTATION_DATE | REGULATION_EFFECTIVE_DATE — because a bare date
--      preserves WHEN and discards WHAT IT IS, and the owner's own stated intent is to refine later:
--      a refinement that cannot tell which endowments were recorded on which basis would have to
--      re-interview every one of them. CHECK `waqf_registration_anchor_kind_pairs_with_date` makes
--      the kind present exactly when the date is (a bare date is what the owner ruled against; a
--      kind with no date is nothing). `ISTIBDAL_10BD` has ONE anchor kind, so it carries no kind
--      column.
--
--   3. BLANK MEANS "CANNOT COMPUTE", NEVER "NO DEADLINE" — the condition attached to the ruling. A
--      NULL anchor makes the engine refuse the rule for that record BY NAME
--      (`ANCHOR_SOURCE_VALUE_ABSENT`), exactly as it routed before this file; no screen may render
--      that as "nothing due". Nullable is therefore the HONEST type here, not a convenience.
--
-- NOT WRITE-ONCE, DELIBERATELY — AND RULED, NOT REASONED. The Shart columns and the deed terms are
-- founder's conditions and are sealed (migrations 3, 12, 13). These are clock-start facts the owner
-- chose to record under LIGHT governance now and tighten later, and then said so directly (S11 first
-- ruling batch, 2026-09-02, record-commit f57e13d, verbatim: *"i should be able to edit dates …
-- audit log maintain record"*) — so they are plain audited UPDATEs, and the audit trail IS the
-- history: the extension writes a full-row before/after image on every edit, and G-1 refuses
-- UPDATE/DELETE on `audit_event` at the database. What is frozen is the DEADLINE they produce
-- (migration 38): a corrected anchor never edits the computed row, it INSERTs a new one chained by
-- `recomputedFromId`, §09's only recompute path. ⚠ The same ruling's "to remove red" is NOT built
-- here: whether a pre-system discharge is recorded as `met`, `waived` or something else is back with
-- the owner (f57e13d), and editing a statutory fact to change a colour is the shape this repo refuses.
--
-- ⚠ UNVERIFIED (binding rule 3): which of the two registration dates GOVERNS, the 30- and
-- 10-business-day figures, and Art. 8(1) / Art. 12(3) as their sources. This file records the
-- operator's declaration; it rules on nothing.
--
-- ⚠ STILL OPEN — NOT DECIDED HERE: `istibdalCompletedDate` lives on `expropriation` because it is
-- the ONLY home the schema has for an istibdal at all. Whether VOLUNTARY (non-expropriation) istibdal
-- is in Phase-1 scope is UNASKED. The column name presumes nothing about expropriation so a later home
-- can mirror it without a rename; if voluntary istibdal is ruled out of Phase 1, that must be written
-- down as a deliberate exclusion rather than left looking like an oversight.
--
-- ⚠ AND THE HONEST LIMIT OF THIS FILE: it clears the anchor mechanism for TWO of the THREE routed
-- families. `LICENSE_RENEWAL` stays ROUTED (`ANCHOR_HOME_IS_WRONG_SCOPE` — it needs a MODEL, not a
-- column; the owner's own enumeration is in `docs/domain/licences-and-permits.md`). G-5's first
-- bound is NARROWED, not cleared.
--
-- Re-runnable end to end: the type is probed (`CREATE TYPE` has no `IF NOT EXISTS`), columns use
-- `ADD COLUMN IF NOT EXISTS`, CHECKs go through `qmulate_add_check` (migration 1), and the closing
-- block asserts the three constraints exist rather than trusting the PERFORMs.

-- ── 1. The closed two-value kind ─────────────────────────────────────────────────────────────
DO $qm_s11_anchor_types$
BEGIN
  IF to_regtype('"RegistrationAnchorKind"') IS NULL THEN
    CREATE TYPE "RegistrationAnchorKind" AS ENUM ('WAQF_DOCUMENTATION_DATE', 'REGULATION_EFFECTIVE_DATE');
  END IF;
END
$qm_s11_anchor_types$;

-- ── 2. The columns — all nullable, NO defaults ───────────────────────────────────────────────
ALTER TABLE "waqf"
  ADD COLUMN IF NOT EXISTS "registrationAnchorDate"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "registrationAnchorDateHijri" TEXT,
  ADD COLUMN IF NOT EXISTS "registrationAnchorKind"      "RegistrationAnchorKind";

ALTER TABLE "expropriation"
  ADD COLUMN IF NOT EXISTS "istibdalCompletedDate"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "istibdalCompletedDateHijri" TEXT;

-- ── 3. The mechanical CHECKs (shape of a row — never a reading of which date governs) ─────────
DO $qm_s11_anchor_checks$
BEGIN
  -- Convention 2: a legally-significant date is dual-calendar and both halves move together. Half
  -- a pair is a corrupt record, not a convenience to repair by re-converting later.
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_registration_anchor_dual_dated',
    '("registrationAnchorDate" IS NULL) = ("registrationAnchorDateHijri" IS NULL)'
  );

  -- The kind is present EXACTLY when the date is. Both directions matter: a date without its kind is
  -- the bare date the owner ruled against; a kind without a date declares which clock-start a
  -- non-existent date is.
  PERFORM qmulate_add_check(
    'waqf',
    'waqf_registration_anchor_kind_pairs_with_date',
    '("registrationAnchorKind" IS NULL) = ("registrationAnchorDate" IS NULL)'
  );

  PERFORM qmulate_add_check(
    'expropriation',
    'expropriation_istibdal_completed_dual_dated',
    '("istibdalCompletedDate" IS NULL) = ("istibdalCompletedDateHijri" IS NULL)'
  );
END
$qm_s11_anchor_checks$;

-- ── 4. Assert, do not trust (the migration-14 idiom) ─────────────────────────────────────────
DO $qm_s11_anchor_assert$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'waqf_registration_anchor_dual_dated',
    'waqf_registration_anchor_kind_pairs_with_date',
    'expropriation_istibdal_completed_dual_dated'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c) THEN
      RAISE EXCEPTION
        'QMULATE S11-1: CHECK constraint % was not created. A half-applied migration that leaves '
        'the anchor pair unpaired is worse than one that stops.',
        c;
    END IF;
  END LOOP;

  IF to_regtype('"RegistrationAnchorKind"') IS NULL THEN
    RAISE EXCEPTION 'QMULATE S11-1: enum type "RegistrationAnchorKind" is absent after creation.';
  END IF;
END
$qm_s11_anchor_assert$;
