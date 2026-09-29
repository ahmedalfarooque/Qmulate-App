-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 30 — E7 / S8-Q3 · §09's FIVE GATES
--
-- **Owner ruling, 2026-08-23, verbatim selection: "Adopt §09's five gates (Recommended)."**
-- Recorded in `docs/product/prd/S4-owner-decision-memo.md` (S8 addendum) and committed RECORD-ONLY
-- as `b662197` before this migration cited it — the `c00e832` / `f2c1f23` pattern.
--
-- ── WHAT WAS BROKEN ──────────────────────────────────────────────────────────────────────────
-- §09's obligation-library table uses five gates. `enum ClassificationGate` had four, and the two
-- it lacked — `exclude_direct` and `has_income` — were used by **SEVEN of §09's 37 templates**,
-- including `FIN-DIST-01` and `FIN-DIST-02`: the duty to compute and disburse ghallah, and the duty
-- to produce per-beneficiary statements. Those are not obscure rows. The library was
-- unrepresentable in the database and E7's exit condition unreachable.
--
-- ── LARGE_ONLY IS RETIRED: REFUSED, NOT REMAPPED ─────────────────────────────────────────────
-- The same ruling retires `LARGE_ONLY`. **This migration therefore does NOT drop it, and that is
-- the point of the ADR-0004 / `JOINT` precedent it follows:**
--
--   · There is nothing to remap. Measured: ZERO §09 library rows and ZERO fixture rows have ever
--     used it, so no data moves and no data is at risk.
--   · Dropping a Postgres enum member is not a small act — it requires rewriting the type and every
--     dependent column — and it would make an old record, an old backup or an old import
--     UNREADABLE rather than refusable.
--   · The refusal lives in `packages/domain`'s gating resolver, which routes a catalogue row on this
--     gate to its OWN bucket (`retiredGate`) — never to `excluded`. A silently excluded obligation is
--     a statutory duty vanishing from a register with nothing anywhere saying so, which is BR-104's
--     central failure and the reason those buckets exist.
--
-- ⚠ **A CONSEQUENCE THE RULING IMPLIES AND NOBODY SHOULD REDISCOVER: after this, NO GATE
-- DISTINGUISHES `LARGE` FROM `MEDIUM`.** `LARGE_ONLY` was the only one that did, so a MEDIUM → LARGE
-- reclassification now changes no duty at all — for that one transition, classification is a label
-- rather than a gate, which is the inverse of BR-104's premise. It is asserted as such in
-- `obligation-gating.test.ts`. If the regulation does impose something on Large-and-not-Medium
-- endowments, §09's own table has no row for it and that is a question for counsel, not a gap here.
--
-- ── WHY THERE IS NO `CHECK` REFUSING THE RETIRED VALUE ───────────────────────────────────────
-- Considered and rejected. A CHECK on `compliance_obligation.gate` would refuse the value at the
-- database, which sounds stricter — but it would make an existing row carrying it UNWRITEABLE rather
-- than reportable, so the row could not even be corrected in place, and it would refuse an
-- INSERT that a data migration might legitimately need to make while re-gating. The engine's typed
-- refusal names the row, names the live alternatives, and leaves the data correctable. Strictness
-- that prevents the remedy is not strictness.
--
-- ── SAFETY OF `ALTER TYPE … ADD VALUE` ──────────────────────────────────────────────────────
-- Adding an enum value is not transactional on PostgreSQL before 12 and cannot be run inside a
-- transaction block that also uses the new value. Both statements here only ADD, use the value
-- nowhere, and are guarded by an existence check — so this file is safely re-runnable and safe under
-- `migrate deploy`'s implicit transaction on PG 12+. `IF NOT EXISTS` is used rather than a
-- `pg_enum` lookup because it is the form that carries the concurrency guarantee.
--
-- ⚠ ORDER MATTERS AND IS DELIBERATE. `BEFORE 'LARGE_ONLY'` places the two new members so the type's
-- member order matches `CLASSIFICATION_GATES` in `packages/domain` exactly. A Postgres enum's order
-- is part of its type and determines sort behaviour, and `classification-parity.test.ts` compares the
-- two sides with `toStrictEqual` — so order is not cosmetic here, it is the parity contract.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

ALTER TYPE "ClassificationGate" ADD VALUE IF NOT EXISTS 'EXCLUDE_DIRECT' BEFORE 'LARGE_ONLY';
ALTER TYPE "ClassificationGate" ADD VALUE IF NOT EXISTS 'HAS_INCOME' BEFORE 'LARGE_ONLY';


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — fails LOUDLY rather than leaving a half-applied vocabulary
--
-- A database whose enum lacks these members but whose seed tries to write them fails at INSERT time
-- with a type error, far from the cause. Checked here, where the cause is.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_e7_gates_verify$
DECLARE
  missing text[] := ARRAY[]::text[];
  needed  text;
  ordered text[];
BEGIN
  FOREACH needed IN ARRAY ARRAY['ALL', 'LARGE_MEDIUM', 'SMALL_DIRECT', 'EXCLUDE_DIRECT',
                                'HAS_INCOME', 'LARGE_ONLY']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'ClassificationGate' AND e.enumlabel = needed
    ) THEN
      missing := missing || needed;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E7 S8-Q3: enum ClassificationGate is missing %: %. Seven of §09''s 37 obligation '
      'templates are gated on EXCLUDE_DIRECT or HAS_INCOME — including FIN-DIST-01/02, the '
      'distribution duty itself — so a database without them cannot hold the obligation library.',
      array_length(missing, 1), array_to_string(missing, ', ');
  END IF;

  -- And the ORDER, because `classification-parity.test.ts` compares the two sides with toStrictEqual
  -- and a Postgres enum's member order is part of its type.
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO ordered
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'ClassificationGate';

  IF ordered <> ARRAY['ALL', 'LARGE_MEDIUM', 'SMALL_DIRECT', 'EXCLUDE_DIRECT', 'HAS_INCOME',
                      'LARGE_ONLY'] THEN
    RAISE EXCEPTION
      'QMULATE E7 S8-Q3: enum ClassificationGate member ORDER is %, expected '
      'ALL, LARGE_MEDIUM, SMALL_DIRECT, EXCLUDE_DIRECT, HAS_INCOME, LARGE_ONLY. Order is part of a '
      'Postgres enum''s type and packages/domain compares the two sides with toStrictEqual.',
      array_to_string(ordered, ', ');
  END IF;
END
$qm_e7_gates_verify$;
