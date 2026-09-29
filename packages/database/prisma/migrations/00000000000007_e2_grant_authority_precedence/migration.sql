-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2 GRANT-AUTHORITY PRECEDENCE.  HAND-AUTHORED. Never overwrite with
-- `prisma migrate dev`.
--
-- ── WHAT THIS FILE WAS ASKED TO DO, AND WHAT IT ACTUALLY DOES ─────────────────────────────────
-- The assignment was product-owner decision PO-1: seed one real `admin` seat, then DELETE the
-- `SYSTEM` disjunct from migration 5's admission guard, on the reasoning that the SYSTEM branch was
-- "the last surviving permitted route" and that a seeded admin makes it unnecessary.
--
-- Half of PO-1 shipped: the fixture now seats `user-admin-001` with `admin:access_matrix:write` on
-- `waqf-001` (`src/seed/map.ts`). The other half — deleting the disjunct — **did not ship, and this
-- header is the reason, with the executed output.** Two findings, both reproduced on a freshly
-- migrated + seeded database on 2026-07-29, and the FIRST one is why this file exists at all.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- FINDING 1 — DELETING THE `SYSTEM` DISJUNCT WOULD HAVE CLOSED NOTHING.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- The premise of PO-1 was that the SYSTEM branch is the surviving route. It is not the only one.
-- `user-accountant-001` — a plain FINANCE seat, no admin verb, no approve verb — reached an ACTIVE
-- `NAZIR` seat from `$executeRawUnsafe` on its own scoped Prisma client **with no `SYSTEM` claim
-- anywhere in the attack.** Every forged marker was `actorType = 'USER'`.
--
-- The move is a CYCLE. Migration 5 §2a §3 asks "does the marker's actor hold
-- `admin:access_matrix:write` on this endowment?" — and it asks at COMMIT, because the trigger is
-- `DEFERRABLE INITIALLY DEFERRED`. By then every row the transaction wrote exists and is visible, so
-- three grants written in one transaction can each be vouched for by another one of the three:
--
--     G1  userId = accountant   role SYSTEM_ADMIN  grantedBy = unscoped    marker actor = unscoped
--     G2  userId = unscoped     role SYSTEM_ADMIN  grantedBy = accountant  marker actor = accountant
--     G3  userId = accountant   role NAZIR         grantedBy = unscoped    marker actor = unscoped
--
--   G1's authority ← G2 (unscoped is an admin).   G2's authority ← G1 (accountant is an admin).
--   G3's authority ← G2.   Every check passes. Every OTHER guard passes too:
--   `waqf_access_grant_no_self_issue` is satisfied (no row names its own subject as issuer), §2b's
--   attribution binding is satisfied (each `grantedByUserId` equals its own marker's actor), and
--   `waqf_access_grant_permission_guard` positively permits `approve` because the role really is
--   NAZIR.
--
-- MEASURED (`SET CONSTRAINTS ALL IMMEDIATE`, then rolled back):
--
--     C  · three mutually-vouching grants, USER markers only   *** PERMITTED ***
--          seats: grant-r4c-1 accountant SYSTEM_ADMIN | grant-r4c-2 unscoped SYSTEM_ADMIN
--                 grant-r4c-3 accountant NAZIR
--          qmulate_has_active_grant(accountant, waqf-001, NAZIR) = true
--
-- And the negative controls, which prove the deferred trigger really fired and that the CYCLE is
-- what admitted it rather than some unrelated leniency:
--
--     C1 · G3 alone                     REFUSED — actor "user-unscoped" holds no ACTIVE grant …
--     C2 · G1 + G3 (no reciprocal)      REFUSED — actor "user-unscoped" holds no ACTIVE grant …
--     C3 · G2 + G3 (no reciprocal)      REFUSED — actor "user-accountant-001" holds no ACTIVE grant …
--     C4 · G1 + G2 (the minimal cycle)  *** PERMITTED *** — two admin seats out of nothing
--
-- So the SYSTEM disjunct was never the last route; it was merely the SHORTEST. Deleting it would
-- have moved the attack from three rows to three rows and changed nothing about the outcome, while
-- producing a document that said the authorization plane was closed. That is the third time this
-- sprint a security claim outran the code, and ADR-0008 exists because of the previous two.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- FINDING 2 — DELETING THE `SYSTEM` DISJUNCT BRICKS `pnpm db:seed`. EXECUTED.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- With `marker_type = 'SYSTEM'` substituted for `false` in the live function body and the schema
-- dropped and re-migrated, the fixture seed fails at COMMIT — and the row it names first is PO-1's
-- own admin seat:
--
--     prisma:error transaction failed to commit
--     ERROR: waqf_access_grant grant-user-admin-001-waqf-001: actor "user-seed-admin" holds no
--     ACTIVE grant carrying "admin:access_matrix:write" on waqf "waqf-001" …
--
-- The seat PO-1 provisions **in order to** allow the removal cannot itself be provisioned once the
-- removal happens. That is not a seed bug; it is a closed loop in the rules:
--
--   · the seed writes all 21 of its grants as ONE actor, `user-seed-admin` (`SEED_ACTOR_ID`), so the
--     USER branch would require THAT actor to hold `admin:access_matrix:write`;
--   · §2b binds `grantedByUserId` to the identity the admitting `audit_event` names, so only
--     `user-seed-admin` can be the issuer of anything the seed writes;
--   · CHECK `waqf_access_grant_no_self_issue` is `"grantedByUserId" <> "userId"`.
--
-- Those three together make the one row that would satisfy the USER branch — an admin seat FOR
-- `user-seed-admin`, ISSUED BY `user-seed-admin` — literally unrepresentable. And the same argument
-- applies to `packages/api/test/setup.ts`, which provisions every API test subject as a SYSTEM actor
-- holding no grant, so the removal also reddens that suite by construction.
--
-- ⚠ THE REMOVAL IS THEREFORE **NOT A ONE-LINE CHANGE AND NOT AN E2 CHANGE.** It needs a provisioning
-- path that does not derive its authority from the access matrix it is provisioning — which is
-- exactly ADR-0008's E12 item ("a separate audited path for access-matrix changes"), and which the
-- `it.todo` in `test/grant-admission-system-branch.integration.test.ts` already priced as option (c),
-- a `SECURITY DEFINER` procedure owned by the migrator. Surfaced to the product owner rather than
-- resolved here.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES CLOSE — AUTHORITY MUST PREDATE THE ACT IT AUTHORISES
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- The authority test gains one clause: the grant conferring `admin:access_matrix:write` must be
-- named by an `audit_event` whose id is **strictly less than** the id of the marker admitting the
-- current write. Authority must already be in the trail before the act it authorises appears in it.
--
-- WHY THAT IS TOTAL AGAINST CYCLES RATHER THAN A PATCH ON ONE SHAPE. Write f(G) for the id of the
-- event admitting grant G, and read "G ← H" as "H is the authority for G". The new clause is
-- f(H) < f(G). A cycle G1 ← G2 ← … ← Gn ← G1 would need
-- f(G2) < f(G1), f(G3) < f(G2), …, f(G1) < f(Gn), hence f(G1) < f(G1). **A cycle of any length is
-- arithmetically impossible, and so is self-vouching (f(G) < f(G)).** This is not a list of
-- forbidden patterns that a fourth row could sidestep; it is a well-founded ordering, so every
-- admitted write's authority chain must terminate at a grant that existed BEFORE the transaction —
-- and on a fresh database, at the SYSTEM bootstrap branch, which is the one thing still standing
-- between the access matrix and nothing.
--
-- ⚠ WHAT IT DOES **NOT** DO, STATED FIRST SO NOBODY READS IT AS MORE.
--   • **It does not reduce what a raw-SQL caller can do TODAY.** The SYSTEM disjunct is still there
--     and is still the shortest route: one forged `actorType = 'SYSTEM'` marker admits any grant.
--     This migration's value is that when that branch finally goes, the plane will actually be
--     closed instead of appearing to be — the cycle route would otherwise have SURVIVED the removal
--     in silence, which is precisely the failure mode ADR-0008 was written about.
--   • **It does not make the seeded admin seat safe to impersonate.** A caller who can run arbitrary
--     SQL can forge a marker naming `user-admin-001`, which now genuinely and durably holds the verb
--     on `waqf-001`, and be admitted by the USER branch. PO-1's seat is a named impersonation target;
--     that is a cost of the decision, not a defect in it, and it is why the seat is scoped to ONE
--     endowment (`waqf-002/003/004` have no established admin holder at all).
--   • **It is DDL-droppable and `ALTER TABLE … DISABLE TRIGGER`-able by the table owner**, and on
--     Railway the runtime connects AS THE OWNER. Every guard in this file is a DETECTION property,
--     not a PREVENTION one. ADR-0008 defers privilege separation to **E12** with a HARD GATE: no
--     real client data may enter any environment before it lands. Nothing here narrows that gate and
--     nothing here may be quoted as having closed it.
--
-- ── WHY NOT AN `xmin` TEST, WHICH IS THE OBVIOUS SHAPE ───────────────────────────────────────
-- "Was this row written by the current transaction" reads naturally as
-- `g.xmin <> pg_current_xact_id()::xid`, mirroring `qmulate_grant_admission_marker()`. **It is
-- bypassable, measured:** a plpgsql `BEGIN … EXCEPTION` block (or any `SAVEPOINT`) opens a
-- SUBtransaction with its own xid, and the attacker writes the SQL.
--
--     id  xmin  pg_current_xact_id()  xmin = top   pg_xact_status
--      1   852                   852        true   in progress   ← top-level INSERT
--      2   853                   852       FALSE   in progress   ← same txn, EXCEPTION block
--
-- So an xmin test would have called row 2 "not mine" and re-admitted the whole cycle. `pg_xact_status`
-- distinguishes both correctly, but reaching it needs an `xid`→`xid8` conversion that is wrong across
-- transaction-id wraparound (`xmin::text::xid8` ignores the epoch), which is a production landmine in
-- exchange for nothing. Audit-event ids are a monotonic sequence in an append-only, hash-chained,
-- G-1-verified table — a stronger ordering primitive than transaction identity, and one the attacker
-- cannot make non-monotonic.
--
-- ── ONE CONSEQUENCE WORTH KNOWING BEFORE IT LOOKS LIKE A BUG ──────────────────────────────────
-- An issuer's admin seat that is NOT in the audit trail can no longer authorise anything. Every
-- legitimately-created grant is in the trail — migration 5 §2a made that a precondition of existing —
-- so the affected set is exactly (a) rows laid down with admission deliberately disabled (the
-- integration suite's own `authzScaffoldingSql` scaffolding, which needs table ownership and says so)
-- and (b) rows predating the trail. If a suite ever scaffolds an ADMIN seat that way and then expects
-- it to issue, the refusal will read as "holds no ACTIVE grant" — the fix is to create that seat
-- through `withAudit()`, which is what `grant-admission.integration.test.ts`,
-- `grant-escalation.integration.test.ts` and `packages/api/test/setup.ts` already do.
--
-- ── WHAT IS DELIBERATELY LEFT ALONE ──────────────────────────────────────────────────────────
-- `approval_request_authority` (migration 3) resolves a checker with
-- `qmulate_has_active_grant(checkerId, waqfId, 'NAZIR')` and gets NO precedence clause here, even
-- though the same-transaction question can be asked of it. Reason, measured: the fixture seed writes
-- its `ApprovalRequest` (step 20) in the SAME transaction as the grants it depends on (step 18), so a
-- precedence clause there would brick the seed for a second, unrelated reason. It is also unnecessary
-- while admission holds — a forged NAZIR seat can no longer be minted by a cycle, so there is nothing
-- new for the checker test to catch. SURFACED, NOT RESOLVED.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — PRECONDITIONS. This file rewrites two functions migration 5 defines; if it ran
-- first it would silently install a definition the rest of the guard set does not agree with.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_pre$
BEGIN
  IF to_regprocedure('qmulate_grant_admission()') IS NULL
     OR to_regprocedure('qmulate_grant_admission_marker(text)') IS NULL
     OR to_regprocedure('qmulate_actor_holds_permission(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 grant-authority-precedence migration ran BEFORE '
      '00000000000005_e2_grant_admission, which defines qmulate_grant_admission(), '
      'qmulate_grant_admission_marker(text) and qmulate_actor_holds_permission(text,text,text). '
      'Migrations apply in lexicographic directory order; this one must sort after it.';
  END IF;
END
$qm_pre$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — THE ESTABLISHED-AUTHORITY TEST
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- `qmulate_actor_holds_permission(text,text,text)` is deliberately left in place, unchanged. It
-- answers "does this actor hold this permission right now", which is the right question for every
-- OTHER caller, and narrowing a shared predicate to suit one call site is how a guard acquires a
-- second meaning nobody remembers. This is a NEW, STRICTER function used by grant admission only.
--
-- The four activity clauses are copied from `activeGrantWhere()` / `qmulate_actor_holds_permission`
-- rather than delegated to it, because a delegating wrapper would return true for an in-transaction
-- grant and then be filtered afterwards — two places where "active" is defined is exactly the drift
-- `grant-admission.integration.test.ts` already guards against. `test/grant-authority-precedence.
-- integration.test.ts` asserts the two functions agree on every case EXCEPT precedence.
CREATE OR REPLACE FUNCTION qmulate_actor_holds_established_permission(
  p_user_id         text,
  p_waqf_id         text,
  p_permission      text,
  p_before_event_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_established$
  SELECT p_user_id IS NOT NULL AND btrim(p_user_id) <> ''
     AND p_waqf_id IS NOT NULL AND btrim(p_waqf_id) <> ''
     AND p_permission IS NOT NULL AND btrim(p_permission) <> ''
     -- FAIL CLOSED. No marker id ⇒ no precedence can be established ⇒ no authority. A NULL here
     -- would otherwise make every comparison below NULL, which `IF NOT authorised` would treat as
     -- "not authorised" anyway — this states it rather than relying on that.
     AND p_before_event_id IS NOT NULL
     AND EXISTS (
    SELECT 1
      FROM "waqf_access_grant" g
     WHERE g."userId" = p_user_id
       AND g."waqfId" = p_waqf_id          -- SAME endowment. Never "any endowment".
       AND p_permission = ANY (g."permissions")
       AND g."deletedAt" IS NULL
       AND g."revokedAt" IS NULL
       AND g."validFrom" <= now()
       AND (g."validUntil" IS NULL OR g."validUntil" >= now())
       -- ── THE PRECEDENCE CLAUSE ────────────────────────────────────────────────────────────
       -- The authority must already be IN THE TRAIL, and its event must be OLDER than the event
       -- admitting the write it is authorising. `<`, not `<=`: strictness is what makes the
       -- ordering well-founded, and therefore what makes a cycle of any length impossible.
       AND EXISTS (
             SELECT 1
               FROM "audit_event" ae
              WHERE ae."entityType" = 'WaqfAccessGrant'
                AND ae."entityId" = g."id"
                AND ae."id" < p_before_event_id
           )
  );
$qm_established$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — ADMISSION CONTROL, WITH THE AUTHORITY BRANCH NARROWED
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Byte-for-byte migration 5 §2a except for three things, all of them in the AUTHORITY block:
--   · `marker_event` is declared and captured (the marker function already RETURNED `event_id`;
--     nothing read it);
--   · the authority disjunct calls `qmulate_actor_holds_established_permission(…, marker_event)`;
--   · the refusal message names the precedence requirement and the measured attack.
-- The `SYSTEM` disjunct is UNCHANGED — see FINDING 2. Every other condition, comment and message is
-- preserved deliberately: three test files match on this function's exact wording, and the mutation
-- test in `grant-admission-system-branch.integration.test.ts` substitutes the literal
-- `marker_type = 'SYSTEM'` out of the live body and FAILS LOUDLY if it is absent.
CREATE OR REPLACE FUNCTION qmulate_grant_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_admission$
DECLARE
  -- Scalars, not a `record`: a `SELECT INTO` that matches no row leaves a record unassigned in some
  -- plpgsql paths, and "record is not assigned yet" is a 55000, not the 42501 a refusal must be.
  marker_actor text;
  marker_type  text;
  -- NEW IN MIGRATION 7. The id of the `audit_event` admitting THIS write, which is the point the
  -- issuer's authority must predate.
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

  -- ── (3) AUTHORITY. The acting identity must hold the admin verb ON THIS ENDOWMENT, and must
  --        have held it BEFORE this write entered the trail (migration 7). ────────────────────
  --
  -- ⚠ THE `SYSTEM` BOOTSTRAP BRANCH IS STILL HERE, AND MIGRATION 7's HEADER IS WHY. It was
  -- assigned for deletion by PO-1; deleting it (a) closes nothing, because the authority branch was
  -- independently cycle-satisfiable — measured, three mutually-vouching grants with USER markers
  -- only — and (b) makes `pnpm db:seed` fail at COMMIT on PO-1's own admin seat, because the seed
  -- writes every grant as one SYSTEM actor that `no_self_issue` forbids from holding a seat of its
  -- own. Removing it needs a provisioning path outside the access matrix: ADR-0008's E12 item.
  --
  -- WHAT THE PRECEDENCE ARGUMENT BUYS: authority must appear in the append-only trail BEFORE the act
  -- it authorises. f(authority) < f(act) is a well-founded ordering, so a cycle of ANY length — and
  -- self-vouching — is arithmetically impossible, and every admitted write's authority chain must
  -- terminate in a grant that existed before the transaction opened.
  authorised := marker_type = 'SYSTEM'
             OR qmulate_actor_holds_established_permission(marker_actor, NEW."waqfId",
                                                           'admin:access_matrix:write', marker_event);

  IF NOT authorised THEN
    RAISE EXCEPTION
      'waqf_access_grant %: actor "%" holds no ACTIVE grant carrying "admin:access_matrix:write" on '
      'waqf "%" that was already recorded in the audit trail before event % — so it may not write '
      'that endowment''s access matrix. Authority is PER ENDOWMENT, and it must PREDATE the act it '
      'authorises: a seat issued in this very transaction cannot be the authority for it, because '
      'two rows that vouch for each other are not authority, they are a loop. Measured before '
      'migration 7: a FINANCE seat minted itself an ACTIVE NAZIR seat from raw SQL with NO SYSTEM '
      'claim anywhere, using three mutually-issued grants in one transaction. A claim in a request '
      'context is not authority either — the context said the caller was permitted and the database '
      'is the layer that checks (MP-17, MP-18, §10 principle 3).',
      NEW."id", marker_actor, NEW."waqfId", marker_event
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL; -- an AFTER trigger's return value is ignored
END;
$qm_grant_admission$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — THE TRIGGER IS NOT RE-CREATED, DELIBERATELY
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- `waqf_access_grant_admission` already points at `qmulate_grant_admission()` and is already
-- `DEFERRABLE INITIALLY DEFERRED` + `ENABLE ALWAYS` (migration 5 §3). `CREATE OR REPLACE FUNCTION`
-- swaps the body under it, so dropping and re-creating the trigger would only risk losing one of
-- those two properties. What this section does instead is ASSERT them, so a migration that arrives
-- after some future edit cannot leave the guard installed-but-toothless.
DO $qm_verify$
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
      'waqf_access_grant_admission is not installed, so migration 7 just narrowed a function that '
      'nothing calls. Migration 5 §3 creates it.';
  END IF;

  -- 'A' = ENABLE ALWAYS. 'O' means one `SET session_replication_role = ''replica''` skips it, which
  -- is the Sprint-1 finding that defeated gate G-1; 'D' means a suite disabled it and did not
  -- restore it.
  IF installed.tgenabled <> 'A' THEN
    RAISE EXCEPTION
      'waqf_access_grant_admission is installed but tgenabled = "%" rather than "A" (ENABLE ALWAYS). '
      'Restore with: ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_admission;',
      installed.tgenabled;
  END IF;

  -- The deferral is what lets the audited path write the row and its audit_event on consecutive
  -- lines. It is ALSO what made the cycle reachable, which is why the precedence clause and not the
  -- deferral is the thing this migration changes: firing earlier would refuse every legitimate write.
  IF NOT (installed.tgdeferrable AND installed.tginitdeferred) THEN
    RAISE EXCEPTION
      'waqf_access_grant_admission is not DEFERRABLE INITIALLY DEFERRED (deferrable=%, initdeferred=%). '
      'The audited path writes the grant row before its audit_event, so an immediate check refuses a '
      'row whose marker is written on the next line.',
      installed.tgdeferrable, installed.tginitdeferred;
  END IF;
END
$qm_verify$;
