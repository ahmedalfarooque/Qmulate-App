-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2: THE `SYSTEM` MARKER DISJUNCT IS REMOVED FROM GRANT ADMISSION.
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT THIS FILE DOES, IN ONE SENTENCE ─────────────────────────────────────────────────────
-- `qmulate_grant_admission()` no longer admits a write because the admitting `audit_event` CLAIMS
-- `actorType = 'SYSTEM'`. After this migration the ONLY admissible issuer is a marker naming a real
-- user who holds an **established** `admin:access_matrix:write` grant on THAT endowment, where
-- "established" is migration 7's precedence clause (the authority's own audit event must be strictly
-- older than the event admitting the write).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE ROUTE THIS CLOSES, MEASURED BEFORE AND AFTER
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- `user-accountant-001` — a plain FINANCE seat, no admin verb, no approve verb — on a freshly
-- migrated + seeded database, from `$executeRawUnsafe` on **its own scoped Prisma client**:
--
--   BEFORE (migrations 1-8, 2026-07-29):
--     ROUTE 1 · one forged `audit_event` with `actorType = 'SYSTEM'` and an ARBITRARY `actorId`
--               ('not-a-real-user' — not even a `User` row), the chain head advanced to it, then the
--               grant row  →  *** PERMITTED ***
--               grant present: true · qmulate_has_active_grant(FINANCE, waqf-001, NAZIR) = true
--               appRouter.approval.approve on another maker's SAR 4,500,000 BANK_MOVEMENT
--                 →  { status: 'APPROVED', checkerId: 'user-accountant-001' }
--
--   AFTER (this migration):
--     ROUTE 1 · same three statements  →  REFUSED, 42501:
--               'waqf_access_grant grant-…: actor "not-a-real-user" holds no ACTIVE grant carrying
--                "admin:access_matrix:write" on waqf "waqf-001" that was already recorded in the
--                audit trail before event … The marker''s actorType is no longer consulted …'
--               grant present: false · the SAR 4.5m approval is refused with NOT_NAZIR.
--
-- The exact statements, both outcomes, and the mutation that restores the old behaviour live in
-- `test/grant-admission-system-branch.integration.test.ts` (§9 and the MUTATION block).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ WHAT IS **NOT** CLOSED. READ THIS BEFORE QUOTING ANYTHING ABOVE.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- **ROUTE 2 IS STILL LIVE AND IS NOT CLOSABLE BY ANY IN-DATABASE MARKER LOGIC.** A caller who can
-- run arbitrary SQL as the application role writes the marker HIMSELF, so he can put ANY
-- `actorId` in it — including `user-admin-001`, the one seeded holder of
-- `admin:access_matrix:write` on `waqf-001`. That marker is indistinguishable, row for row, from the
-- one the genuine audited path writes, because attacker and application share ONE database role and
-- the trigger can only read the row, never observe who authored it. Removing the SYSTEM disjunct
-- narrows the attack from "claim to be a system job" to "name the one real admin seat on the one
-- endowment that has one" — a real narrowing, and not a closure.
--
--   MEASURED, AFTER this migration:
--     ROUTE 2 · forged marker `actorType = 'USER'`, `actorId = 'user-admin-001'`, on waqf-001
--               →  *** STILL PERMITTED ***, and `approval.approve` returns `{status:'APPROVED'}`
--               on a SAR 4,500,000 BANK_MOVEMENT raised by a different maker.
--     ROUTE 2' · the same forgery on `waqf-002/003/004`  →  REFUSED. Those endowments have no
--               established admin holder, which is why PO-1's seat is scoped to ONE endowment.
--
-- `test/grant-admission-system-branch.integration.test.ts` PINS route 2 as a passing test that
-- asserts the attack SUCCEEDS. When E12's privilege separation lands, that test goes red and whoever
-- makes it red must come here and delete it. That is this sprint's convention for a live residual:
-- a residual that is only described in prose is a residual nobody is accountable for.
--
-- The DDL residual of ADR-0008 is likewise untouched and remains open: every trigger in this file is
-- `ALTER TABLE … DISABLE TRIGGER`-able and DROP-able by the table OWNER, and on Railway the runtime
-- connects AS THE OWNER. Nothing here narrows ADR-0008's hard gate — **no real client data may enter
-- any environment before E12 delivers privilege separation.**
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- HOW BOOTSTRAP SURVIVES, AND WHY IT IS NOT A NEW HOLE
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Migration 7's header recorded the reason the removal had not shipped: the first
-- `admin:access_matrix:write` holder on a virgin database cannot be issued by the holder of a seat
-- that does not yet exist, and the fixture seed writes all 21 of its grants as ONE actor
-- (`user-seed-admin`) that CHECK `waqf_access_grant_no_self_issue` forbids from holding a seat of its
-- own. That circularity is real and is NOT solved here — it is IRREDUCIBLE. Authority cannot
-- authorise its own first instance. Every possible answer is one of exactly two shapes:
--
--   (i)  a BRANCH inside the guard that admits something without authority — which is what the
--        SYSTEM disjunct was, and which a caller who writes the marker can always satisfy; or
--   (ii) a write that happens OUTSIDE the guard, through a path the runtime role is not supposed to
--        have.
--
-- This migration takes (ii), because (i) is by construction forgeable and therefore cannot be the
-- honest answer. Provisioning — `src/seed.ts` and `packages/api/test/setup.ts` — now suspends the
-- admission trigger around its grant writes, through ONE named helper,
-- `withAccessMatrixBootstrap()` in `src/access-matrix-bootstrap.ts`, which says out loud that it
-- needs table OWNERSHIP and restores `ENABLE ALWAYS` in a `finally`. The database integration
-- suite has used exactly this scaffolding since migration 5 (`authzScaffoldingSql()`).
--
-- WHY THAT IS NOT A NEW ROUTE FOR THE ATTACKER, stated precisely rather than reassuringly:
--   · `ALTER TABLE … DISABLE TRIGGER` was ALREADY available to the runtime role and is ALREADY the
--     named ADR-0008 residual — measured from the FINANCE seat's own scoped client in round 4
--     ("DISABLE TRIGGER as the app role: *** PERMITTED ***"). Provisioning using it adds nothing to
--     what an attacker could already do.
--   · It is however a STRICTLY HIGHER privilege than the route being closed. Route 1 needed only
--     `INSERT` on `audit_event` and `waqf_access_grant` — two grants the runtime must hold forever.
--     The bootstrap path needs OWNERSHIP of the table, which is exactly what E12 takes away. So the
--     floor rises: after E12 the runtime cannot bootstrap and cannot forge, while the migrator role
--     can still provision.
--   · The seeded grants are still fully AUDITED. Suspending admission does not suspend the audit
--     spine, so all 21 grants remain in the append-only, hash-chained, G-1-verified trail with their
--     event ids — which is precisely what makes `user-admin-001`'s seat "established" and therefore
--     able to issue further grants through the ordinary path afterwards.
--
-- WHAT WAS REJECTED, AND WHY (both were priced in migration 7's `it.todo` and are re-recorded here
-- so the next reader does not re-derive them):
--   · "First-ever seat on an endowment with no admin grant yet." Refuses the fixture seed's own
--     writes — the seed creates its admin seat in the SAME transaction as the twenty grants that
--     would then need it — and it would ALSO break `packages/api/test/setup.ts`, which provisions
--     onto endowments that already have seventeen grants. Worse, on a live system every newly
--     onboarded endowment would carry a window in which anyone who can write a marker is an admin.
--   · "A deployment-pinned bootstrap identity." Forgeable by the same argument as route 2, so it
--     buys nothing and would read as a closure.
--
-- ── HOUSE RULES FOLLOWED ─────────────────────────────────────────────────────────────────────
--   • `CREATE OR REPLACE FUNCTION`; no `DROP`. Re-runnable end to end.
--   • Table-dependent DDL in ONE re-appliable block, `qmulate_apply_e2_close_system_marker()`, which
--     re-asserts `ENABLE ALWAYS` on the admission trigger rather than assuming it.
--   • The re-entry order is unchanged and stays:
--         SELECT qmulate_apply_guards();
--         SELECT qmulate_apply_e2_guards();
--         SELECT qmulate_apply_e2_guard_gaps();
--         SELECT qmulate_apply_e2_grant_admission();
--         SELECT qmulate_apply_e2_corpus_retention_guards();
--         SELECT qmulate_apply_e2_retention_remainder();
--         SELECT qmulate_apply_e2_close_system_marker();   -- new, additive, last
--   • Refusal messages name the table.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — PRECONDITIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- This file rewrites a function migration 5 defines and migration 7 narrowed, and it DEPENDS on
-- migration 7's `qmulate_actor_holds_established_permission(...)` being the authority predicate. If
-- it ran out of order it would install the strictest half of the rule on top of the loosest half.

DO $qm_pre$
BEGIN
  IF to_regprocedure('qmulate_grant_admission()') IS NULL
     OR to_regprocedure('qmulate_grant_admission_marker(text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE close-system-marker migration ran BEFORE '
      '00000000000005_e2_grant_admission, which defines qmulate_grant_admission() and '
      'qmulate_grant_admission_marker(text) on "waqf_access_grant". Migrations apply in '
      'lexicographic directory order; this one must sort after it.';
  END IF;

  IF to_regprocedure('qmulate_actor_holds_established_permission(text,text,text,bigint)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE close-system-marker migration ran BEFORE '
      '00000000000007_e2_grant_authority_precedence, which defines '
      'qmulate_actor_holds_established_permission(text,text,text,bigint). Removing the SYSTEM '
      'disjunct WITHOUT the precedence clause would leave "waqf_access_grant" admission satisfiable '
      'by a CYCLE of mutually-vouching grants written in one transaction (measured: three rows, USER '
      'markers only, no SYSTEM claim anywhere), i.e. it would appear closed and not be.';
  END IF;
END
$qm_pre$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — ADMISSION CONTROL WITH NO BOOTSTRAP BRANCH
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Byte-for-byte migration 7 §3 except in the AUTHORITY block:
--   · the `marker_type = 'SYSTEM'` disjunct is GONE;
--   · `marker_type` is still captured, because check (2) reports it in the "names no actor" refusal
--     and that message is what tells an operator a SYSTEM job tried to issue a seat;
--   · the refusal message says that the marker's `actorType` is no longer consulted, so the next
--     reader does not go looking for the branch that used to be here.
-- Everything else — the widening enumeration, the deferral, the wording of checks (1) and (2) — is
-- preserved deliberately: several test files match on this function's exact phrasing.
CREATE OR REPLACE FUNCTION qmulate_grant_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_admission$
DECLARE
  -- Scalars, not a `record`: a `SELECT INTO` that matches no row leaves a record unassigned in some
  -- plpgsql paths, and "record is not assigned yet" is a 55000, not the 42501 a refusal must be.
  marker_actor text;
  marker_type  text;
  -- Migration 7. The id of the `audit_event` admitting THIS write, which is the point the issuer's
  -- authority must predate.
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

  -- ── (1) AUDITABILITY. No marker ⇒ no admission. ─────────────────────────────────────────────
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

  -- ── (2) ATTRIBUTION. `grantedByUserId` is NOT caller-supplied (migration 5 §2b). ───────────
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

  -- ── (3) AUTHORITY. ONE CONDITION, NO DISJUNCT, NO BOOTSTRAP BRANCH. ───────────────────────
  --
  -- The acting identity the marker names must hold `admin:access_matrix:write` on THIS endowment
  -- through an ACTIVE grant that was ALREADY IN THE AUDIT TRAIL before the event admitting this
  -- write (migration 7). `actorType` is deliberately NOT consulted: it is a value in a row the
  -- caller writes, so a rule that reads it is a rule the caller sets.
  --
  -- ⚠ NOTHING ELSE IS ADMITTED — including the fixture seed and the api test harness, which is why
  -- both now suspend this trigger explicitly through `withAccessMatrixBootstrap()` (an OWNER-only
  -- operation) instead of claiming `actorType = 'SYSTEM'`. See this file's header for why the
  -- circularity is irreducible and why an owner-privileged path is the honest form of the answer.
  --
  -- ⚠ AND IT IS STILL NOT A CLOSURE. Route 2 — a forged marker naming `user-admin-001`, who really
  -- does hold the verb on `waqf-001` — is admitted by this very condition and CANNOT be excluded
  -- here: the trigger reads a row, and the attacker wrote the row. See the header, and the pinned
  -- route-2 test.
  authorised := qmulate_actor_holds_established_permission(marker_actor, NEW."waqfId",
                                                           'admin:access_matrix:write', marker_event);

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
      'seat is not a request path: it needs table ownership (withAccessMatrixBootstrap()).',
      NEW."id", marker_actor, NEW."waqfId", marker_event
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL; -- an AFTER trigger's return value is ignored
END;
$qm_grant_admission$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE RE-APPLIABLE BLOCK
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- The trigger is NOT dropped and re-created: `CREATE OR REPLACE FUNCTION` swaps the body under it,
-- and re-creating it risks losing one of its two load-bearing properties. What this block does is
-- ASSERT those properties and RESTORE `ENABLE ALWAYS`, so it is safe to run at any time — including
-- after a suite that disabled the trigger and failed before its `finally`.
CREATE OR REPLACE FUNCTION qmulate_apply_e2_close_system_marker()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply$
DECLARE
  installed record;
BEGIN
  SELECT t.tgname, t.tgenabled, t.tgdeferrable, t.tginitdeferred
    INTO installed
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.waqf_access_grant'::regclass
     AND t.tgname = 'waqf_access_grant_admission';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'waqf_access_grant_admission is not installed on "waqf_access_grant", so this migration just '
      'narrowed a function that nothing calls. Migration 5 §3 creates it.';
  END IF;

  -- The deferral is what lets the audited path write the row and its audit_event on consecutive
  -- lines; firing earlier would refuse every legitimate write.
  IF NOT (installed.tgdeferrable AND installed.tginitdeferred) THEN
    RAISE EXCEPTION
      'waqf_access_grant_admission on "waqf_access_grant" is not DEFERRABLE INITIALLY DEFERRED '
      '(deferrable=%, initdeferred=%).',
      installed.tgdeferrable, installed.tginitdeferred;
  END IF;

  -- 'A' = ENABLE ALWAYS. 'O' means one `SET session_replication_role = ''replica''` skips the guard,
  -- which is the Sprint-1 finding that defeated gate G-1; 'D' means something disabled it and did
  -- not restore it. Both are repaired here rather than merely reported, because this block's whole
  -- job is to leave the guard in the one state that is defensible.
  IF installed.tgenabled <> 'A' THEN
    ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_admission;
    RAISE NOTICE
      'waqf_access_grant_admission on "waqf_access_grant" was tgenabled = "%" and has been restored '
      'to ENABLE ALWAYS.', installed.tgenabled;
  END IF;

  -- The disjunct must be gone from the LIVE body, not merely from this file. `pg_get_functiondef`
  -- is the only authority on what is actually installed — a later migration, a hotfix, or a
  -- mutation harness that failed to roll back could all leave the old body in place while this file
  -- sits in the migrations directory looking authoritative.
  IF position('marker_type = ''SYSTEM''' IN pg_get_functiondef('qmulate_grant_admission()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION
      'the LIVE body of qmulate_grant_admission() still contains the "marker_type = ''SYSTEM''" '
      'disjunct, so "waqf_access_grant" still admits a forged SYSTEM marker: a FINANCE seat can mint '
      'itself an ACTIVE NAZIR seat with an actorId that is not even a User row. Re-apply '
      '00000000000009_e2_close_system_marker.';
  END IF;
END
$qm_apply$;

SELECT qmulate_apply_e2_close_system_marker();
