-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 32 — E7 / S8-Q1 · THE AML OBLIGATION ROW IS COMPARTMENTED TOO
--
-- **Owner ruling, 2026-08-23, verbatim selection: "Compartment the row (Recommended)."**
-- Recorded in the memo's S8 addendum, committed RECORD-ONLY as `b662197` before this file cites it.
--
-- ── THE LEAK THE SAR COMPARTMENT DID NOT CLOSE ───────────────────────────────────────────────
-- Migration 29 gave the compartment its subject: a SAR is invisible outside it. But §09 ALSO puts
-- `GOV-AML-02` — *report AML/CTF suspicion to the FIU* — on the GENERAL compliance register at gate
-- `all`, for every endowment, and says its deadline is "surfaced on the dashboard".
--
-- So the report was hidden and the OBLIGATION TO REPORT was not. A `GOV-AML-02` task moving
-- `NOT_STARTED -> COMPLETED` is an AML-attributable state change, and `compliance:task:read` sits in
-- **ELEVEN of the thirteen role presets** — measured — while `aml_officer` holds no compliance
-- permission at all. **The one seat that may know is the one seat that cannot see the task, and
-- everybody else watches it complete.** "The AML report task was completed on 12 Rajab" is a tip-off
-- written by the compliance board rather than by a notification, and no status-code test would catch
-- it because nothing malfunctioned.
--
-- ⚠ **§09's LITERAL TEXT IS NOW THE DRIFTED SIDE** and owes a supersession note citing this ruling.
-- The register keeps the duty; the board cannot leak it.
--
-- ── WHY A `confidentiality` COLUMN AND NOT A SPECIAL CASE ON THE CODE ────────────────────────
-- The obvious alternative — teach the force filter that `code = 'GOV-AML-02'` is special — was
-- rejected. It hardcodes a catalogue value into a security control, so publishing the obligation
-- under a new code (which S8-Q5's versioning makes routine) would silently un-compartment it. A
-- CLASSIFICATION on the row travels with the row, through versions, and is the mechanism every other
-- compartmented model already uses.
--
-- ⚠ THE COLUMN IS SPELLED `confidentiality Confidentiality`, for the reason migration 29 gives at
-- length: `deriveClassification()` reads that exact field name, `amlClause()` filters on it, and the
-- both-directions parity assertion keys on the literal `/^\s*confidentiality\s+Confidentiality\b/`.
-- The name is the control.
--
-- ── AND THE FORCE FILTER NEEDED A NEW SHAPE, WHICH IS WHY THIS IS ITS OWN MIGRATION ──────────
-- `compliance_obligation` is in `UNSCOPED_MODELS` — global reference data, no `waqfId` — and
-- `scopeFilter` returned `null` ("no filter") for it, having never reached `amlClauseFor` outside the
-- endowment-scoped branch. Listing it as a confidentiality-bearing model therefore required giving
-- the UNSCOPED branch an AML arm it had never had: the first predicate any global reference table has
-- ever carried. That is a change to the filter's shape for every such table, not a copy of the SAR
-- wiring, so it landed separately rather than inside a ruling commit where it would blur which
-- control was proven.
--
-- ── WHAT THIS FILE DOES **NOT** DO ───────────────────────────────────────────────────────────
-- ⚠ **IT MARKS NO ROW RESTRICTED, AND THAT IS NOT AN OVERSIGHT.** `GOV-AML-02` exists in the CODE
-- catalogue (`packages/domain/src/compliance/catalogue.ts`); the database holds only the ten
-- `SEED-`-namespaced placeholders derived backwards from fixture tasks, and none of them is the AML
-- duty. The classification arrives WITH the row when the canonical library is seeded — which is still
-- owed, and which S8-Q5's versioning had to land first.
--
-- So this migration installs the MECHANISM and the default is `NORMAL`: every existing row is
-- unchanged and visible, exactly as before. The driven test creates its own restricted row rather
-- than pretending the fixture has one, because a compartment test over an unrestricted table proves
-- nothing — and saying so is cheaper than discovering it later.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "compliance_obligation"
  ADD COLUMN IF NOT EXISTS "confidentiality" "Confidentiality" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "compliance_task"
  ADD COLUMN IF NOT EXISTS "confidentiality" "Confidentiality" NOT NULL DEFAULT 'NORMAL';


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
--
-- ⚠ Checks the COLUMN NAME AND ITS TYPE, not merely that a column arrived. A `visibility` column, or
-- a `confidentiality text`, would satisfy a looser check and defeat every control that reads this
-- field — which is the trap §09's own TS shape sets and migration 29 documents.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_q1_verify$
DECLARE
  missing text[] := ARRAY[]::text[];
  tbl     text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['compliance_obligation', 'compliance_task'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name = tbl
         AND c.column_name = 'confidentiality'
         AND c.udt_name = 'Confidentiality'
    ) THEN
      missing := array_append(missing, tbl || '.confidentiality (of type Confidentiality)');
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E7 S8-Q1: % control(s) did not install: %. Without the column — spelled exactly '
      '"confidentiality" and typed "Confidentiality" — amlClause() cannot subtract the AML obligation '
      'row and deriveClassification() cannot mark its audit events RESTRICTED, so the duty to report '
      'stays visible on a board eleven of thirteen role presets can read while the report itself is '
      'hidden (BR-604, §10 §6, owner ruling S8-Q1).',
      array_length(missing, 1), array_to_string(missing, ', ');
  END IF;
END
$qm_e7_q1_verify$;
