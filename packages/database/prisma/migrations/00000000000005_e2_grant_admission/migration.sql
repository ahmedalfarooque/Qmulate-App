-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — E2 GRANT ADMISSION CONTROL.  HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHY THERE IS A FIFTH MIGRATION ───────────────────────────────────────────────────────────
-- Migrations 3 and 4 asked, over and over, "does this ROW say the right thing?" — is the role
-- NAZIR, is the checker distinct from the maker, does the approval exist. Not one of them asked
-- **HOW THE ROW GOT THERE, AND WAS THAT PATH AUTHORIZED.** Two independent re-attacks then walked
-- straight through, twice, using the same move:
--
--   `user-accountant-001` — a plain FINANCE seat, no admin verb, no approve verb — was correctly
--   REFUSED by its scoped Prisma delegate ("WaqfAccessGrant is the AUTHORIZATION PLANE … create
--   requires admin:access_matrix:write"), then issued the byte-identical row through
--   `$executeRawUnsafe` **on that same scoped client**, and it COMMITTED. On `waqf-001`, and on
--   `waqf-002`, an endowment it holds nothing on. Reproduced on a freshly migrated + seeded
--   database, 2026-07-28:
--
--     [1] scoped delegate create -> REFUSED (AUTHORIZATION PLANE)
--     [2] $executeRawUnsafe on the SAME client: FORGED grant-r2-901 on waqf-001 — COMMITTED
--     [2] $executeRawUnsafe on the SAME client: FORGED grant-r2-902 on waqf-002 — COMMITTED
--     [4] audit events naming either forged grant: 0
--     [5] qmulate_has_active_grant(FINANCE,'waqf-001','NAZIR') = true, ('waqf-002') = true
--
--   Postgres accepted it because the only INSERT-time controls on `waqf_access_grant` were
--   `waqf_access_grant_permission_guard` — which POSITIVELY PERMITS an `approve` verb when
--   `role = 'NAZIR'` — and CHECK `waqf_access_grant_no_self_issue`, satisfied by naming any third
--   party as `grantedByUserId`. `pg_trigger` showed **no trigger governing WHO MAY INSERT A GRANT**.
--   With [5] true, `approval_request_authority` then accepts that user as the checker, and
--   `appRouter.approval.approve` returns `{status:'APPROVED'}` on someone else's SAR 4,500,000
--   BANK_MOVEMENT.
--
-- Prisma client extensions do NOT intercept `$queryRaw` / `$executeRaw*`. Any control that lives
-- only in an extension is bypassable from the very same scoped client. Controls must be in Postgres.
--
-- ── WHAT THIS FILE CLOSES ────────────────────────────────────────────────────────────────────
--  §2a  ADMISSION CONTROL ON THE AUTHORIZATION PLANE (the headline). A grant may only be born, or
--       widened, inside a transaction that is APPENDING AN AUDIT EVENT NAMING IT, by an acting
--       identity that holds `admin:access_matrix:write` on that endowment through an ACTIVE grant.
--  §2b  `grantedByUserId` IS NO LONGER CALLER-SUPPLIED. It must equal the acting identity the audit
--       event records. Combined with the existing `no_self_issue` CHECK this makes self-promotion
--       unrepresentable — including through the ORDINARY Prisma delegate, with no raw SQL at all,
--       which was the second half of the same finding.
--  §2c  HARD `DELETE` ON `waqf_access_grant` IS REFUSED (C-09). Migration 4 added `no_truncate` and
--       explicitly left `no_delete` open as a "known, reported residue". `DELETE` + re-`INSERT` of
--       the same id with `role = 'NAZIR'` defeated MP-15's write-once role in exactly the shape C-03
--       used to defeat the Shart guard, and it also un-did BOTH one-way off-switches (`revokedAt`,
--       `deletedAt`) by making a fresh row. Revocation is `revokedAt` / `deletedAt`, never a hard
--       delete.
--  §2d  HARD `DELETE` ON `approval_request` IS REFUSED (C-13, C-10). The maker could erase a Nazir's
--       REJECTED decision outright, free the one-open-per-subject slot, and — the C-10 half —
--       DELETE the approval a committed `EXECUTED` distribution names, since `distribution_authority`
--       is DEFERRED and never fires again after that transaction commits.
--  §2e  A SPENT / LIVE AUTHORITY MAY NOT BE VOIDED OUT FROM UNDER A DISTRIBUTION (C-10). `APPROVED
--       -> VOID` is a legal lattice move, and it was legal even when an `APPROVED`/`EXECUTED`
--       distribution already named that approval as its authority.
--  §2f  AN ASSET'S TITLE-DEED NUMBER IS RESERVED-MATTER-ONLY. Re-verified this round: a
--       SUBCONTRACTOR seat holding only compliance/document write permissions rewrote
--       `asset-001`'s `titleDeedNumber` at the database layer. `waqf.deedNumber` has been
--       reserved-matter-gated since migration 3 (D-5) and an asset's title deed is the same class of
--       legal identity, on the corpus (`asl`) itself.
--
-- ── HOUSE RULES FOLLOWED (from migrations 3 and 4) ───────────────────────────────────────────
--   • Re-runnable end to end: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
--     `CREATE TRIGGER`, `qmulate_add_check()` for every CHECK.
--   • Table-dependent DDL lives in ONE re-appliable block, `qmulate_apply_e2_grant_admission()`.
--   • `ENABLE ALWAYS` on EVERY trigger, constraint triggers included. A trigger created normally is
--     `tgenabled = 'O'` and Postgres SKIPS it after a plain `SET session_replication_role =
--     'replica'` — the Sprint-1 finding that defeated gate G-1 outright.
--   • A CHECK where a CHECK suffices: CHECKs are not skipped by the replica role at all.
--   • This migration REPLACES NO FUNCTION DEFINED BY AN EARLIER MIGRATION. Migration 4's header
--     records that it had to run last because it replaced four of migration 3's trigger bodies;
--     everything here is additive, so the re-entry order is unchanged and stays:
--         SELECT qmulate_apply_guards();
--         SELECT qmulate_apply_e2_guards();
--         SELECT qmulate_apply_e2_guard_gaps();
--         SELECT qmulate_apply_e2_grant_admission();   -- new, additive, still last
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ THE RESIDUAL, STATED WITHOUT DECORATION.  READ THIS BEFORE TRUSTING ANYTHING ABOVE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- NOTHING IN THIS FILE PREVENTS AN ATTACKER WHO CAN ALREADY RUN ARBITRARY SQL AS THE APPLICATION
-- ROLE FROM FORGING A GRANT. It raises the cost and makes the forgery LEAVE EVIDENCE. That is a
-- detection property, not a prevention property, and the two must never be conflated:
--
--   1. The admission marker is an `audit_event` row. `audit_event` is append-only, but INSERT is
--      necessarily granted to the runtime role, so a raw-SQL caller CAN write the marker themselves.
--      What they cannot do is write one that verifies: `rowHash` is a SHA-256 over the canonical
--      payload chained to `prevHash`, and gate G-1's verifier recomputes the whole chain. A forged
--      marker therefore (a) appears in the trail, naming an actor and a time, and (b) BREAKS G-1.
--      Before this migration the forgery left ZERO audit events and a chain that verified clean.
--   2. §2a's authority branch can be satisfied by claiming `actorType = 'SYSTEM'` in that forged
--      marker — see the SYSTEM/bootstrap note in `qmulate_grant_admission()`. It cannot be removed
--      inside E2: no endowment's FIRST access-matrix administrator can be issued by the holder of a
--      seat that does not yet exist, and the fixture seed plus every test-provisioning path run as
--      SYSTEM.
--   3. Every trigger and CHECK here is DDL-droppable and `ALTER TABLE … DISABLE TRIGGER`-able by
--      the table OWNER. On Railway the runtime connects AS THE DATABASE OWNER, so today the runtime
--      role can disable its own guards. (The integration suite's scaffolding does exactly this,
--      deliberately and visibly, which is itself the demonstration.)
--
-- THE COMPLETE FIX IS PRIVILEGE SEPARATION: the runtime role must not hold INSERT/UPDATE/DELETE on
-- the authorization plane (`waqf_access_grant`, `approval_request`, `membership`) at all, and must
-- not own those tables. Migration 1 §3.7 already writes those GRANTs for `audit_event` and states
-- in its own comments that they are inert while the runtime is the owner. Doing it properly needs a
-- DEPLOYMENT change — a separate owner/migrator role, a non-owner runtime role, and grant issuance
-- moved behind a `SECURITY DEFINER` procedure owned by the migrator. **ADR-0008 (product-owner
-- decision, 2026-07-28) DEFERS that to E12**, and places the insider with application-database
-- credentials INSIDE the threat model. The hard gate that follows: **no real client data before E12
-- closes it.** Nothing in this repository may claim this residual is gone.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — HELPERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Does `p_user_id` hold `p_permission` on `p_waqf_id` through an ACTIVE grant?
--
-- The validity window is the same four clauses `activeGrantWhere()` uses in
-- `packages/auth/src/server.ts` and that `qmulate_has_active_grant()` already mirrors: not
-- soft-deleted, not revoked, started, not expired. Deliberately a SEPARATE function rather than a
-- parameter on `qmulate_has_active_grant()`: that one answers "which ROLE does this seat carry",
-- this one answers "which VERB does it grant", and the whole lesson of this sprint is that those
-- are different questions.
--
-- ⚠ WHAT THIS IS NOT: it does NOT consult `Membership`. §10 principle 2 — "scope is the endowment,
-- never the client" — and CHECK `membership_role_family_level_only` already confines `membership`
-- to `FAMILY_BOARD`, which holds no admin verb. A client-level row must never mint an operational
-- seat (MP-13), so it must never authorise minting one either.
--
-- FAIL CLOSED: a null or blank user, endowment or permission is FALSE, never "unrestricted".
CREATE OR REPLACE FUNCTION qmulate_actor_holds_permission(
  p_user_id    text,
  p_waqf_id    text,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_holds_perm$
  SELECT p_user_id IS NOT NULL AND btrim(p_user_id) <> ''
     AND p_waqf_id IS NOT NULL AND btrim(p_waqf_id) <> ''
     AND p_permission IS NOT NULL AND btrim(p_permission) <> ''
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
  );
$qm_holds_perm$;


-- The ADMISSION MARKER for an access-matrix write: the `audit_event` row that the audited path
-- appends for this grant, IN THIS TRANSACTION.
--
-- ── WHY AN AUDIT EVENT AND NOT A GUC ─────────────────────────────────────────────────────────
-- The obvious shape is the one `qmulate.reserved_matter_approval_id` already uses: a session-local
-- marker the audited path sets. It was rejected here for two reasons, and the second is decisive.
--   (a) NOTHING SETS IT. The only audited access-matrix door is `activateGrant()` in
--       `packages/api/src/context.ts`, and neither it nor `packages/database/src/**` sets any GUC.
--       A marker no shipped path sets is a guard that refuses the seed and every legitimate write.
--   (b) A GUC LEAVES NO TRACE. `set_config()` is available to anyone who can run SQL, evaporates at
--       COMMIT, and is recorded nowhere — so a forged marker is INDISTINGUISHABLE from a genuine
--       one, forever. That is precisely the Sprint-1 mistake this sprint keeps re-learning: the
--       Shart hatch accepted "any non-empty string". An `audit_event` row is the opposite: it is
--       append-only, hash-chained, and verified by gate G-1, so forging it is possible but is
--       neither silent nor undetectable.
--
-- THREE CONDITIONS, all of them properties of the audited path and none of them of a raw INSERT:
--   1. an `audit_event` naming this grant (`entityType = 'WaqfAccessGrant'`, `entityId = <id>`) —
--      `auditedMutation()` writes exactly this shape for every create/update/upsert;
--   2. it was written in THE CURRENT TRANSACTION (`xmin = pg_current_xact_id()::xid`). Without this
--      a STALE event from an earlier life of the same id would satisfy admission — measured: after
--      a grant id was deleted and re-created, two events named it with different `xmin`s;
--   3. `audit_chain_head."lastId" >= <that event's id>`. `finalizeChain()` advances the head inside
--      the same transaction under the chain advisory lock, so the genuine path always satisfies it,
--      while a forger who inserts only the event does not — they must also move the head, which is
--      the one row G-1's verifier compares the recomputed chain against.
--
-- ⚠ ONE OPERATIONAL HAZARD IN CONDITION 2, WRITTEN DOWN BECAUSE IT WILL LOOK LIKE A BUG.
-- `xmin` is the id of the (sub)transaction that wrote the tuple. Prisma's interactive transactions
-- issue each statement directly, with no per-statement SAVEPOINT, so today the grant row and its
-- `audit_event` carry the SAME `xmin` — measured on this fixture before this migration was written.
-- If a future write path ever wraps the mutation and the append in DIFFERENT subtransactions (an
-- explicit `SAVEPOINT`, or a plpgsql `BEGIN … EXCEPTION` block between them), their `xmin`s diverge
-- and this check will refuse a perfectly legitimate write. That is the FAIL-CLOSED direction and is
-- therefore the right way round — but the refusal will read as "the authorization plane is not
-- writable", which is misleading. If that happens, the fix is to compare transaction identity some
-- other way (e.g. a `txId` column on `audit_event`), NOT to drop the same-transaction condition: a
-- stale event from an earlier life of the same id would then admit the write, which was measured to
-- be reachable (a grant id deleted and re-created had two events with different `xmin`s).
--
-- Returns the acting identity, or `(NULL, NULL)` when there is no marker. The most recent matching
-- event wins (`ORDER BY id DESC`), which is the same transaction's own latest word on the row.
CREATE OR REPLACE FUNCTION qmulate_grant_admission_marker(p_grant_id text)
RETURNS TABLE (actor_id text, actor_type text, event_id bigint)
LANGUAGE sql
STABLE
AS $qm_grant_marker$
  SELECT ae."actorId", ae."actorType"::text, ae."id"
    FROM "audit_event" ae
   WHERE ae."entityType" = 'WaqfAccessGrant'
     AND ae."entityId" = p_grant_id
     AND ae.xmin = pg_current_xact_id()::xid
     AND EXISTS (
           SELECT 1 FROM "audit_chain_head" h WHERE h."id" = 1 AND h."lastId" >= ae."id"
         )
   ORDER BY ae."id" DESC
   LIMIT 1;
$qm_grant_marker$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — TRIGGER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 2a / 2b. ADMISSION CONTROL ON `waqf_access_grant` ────────────────────────────────────────
-- A DEFERRED constraint trigger, for the same reason `distribution_authority` is one: the audited
-- path writes the ROW FIRST and its `audit_event` immediately after, in the same transaction, and
-- the fixture seed writes seventeen grants and 131 events inside ONE transaction. An immediate
-- `AFTER INSERT` check would refuse a row whose marker is written on the next line.
-- `DEFERRABLE INITIALLY DEFERRED` fires at COMMIT, when the transaction's final state is knowable —
-- which is also the stricter reading. `SET CONSTRAINTS … IMMEDIATE` can only make it fire EARLIER;
-- there is no statement that makes a deferred constraint not fire, and `ENABLE ALWAYS` covers the
-- replica role.
--
-- ── WHICH UPDATES ARE GOVERNED, AND WHICH ARE NOT ────────────────────────────────────────────
-- Every INSERT, and every UPDATE that WIDENS or RE-POINTS the seat: `permissions`, `dataScopes`,
-- `scopeRefs`, `canViewAmlRestricted`, `amlCompartment`, `beneficiarySelfId`, `grantedByUserId`,
-- `role`, `userId`, `waqfId`, or a validity change that is not strictly a narrowing (`validFrom`
-- moved EARLIER, `validUntil` moved LATER or cleared, `revokedAt`/`deletedAt` cleared).
--
-- A PURE NARROWING — revoke, soft-delete, shorten the window, start it later — is NOT governed.
-- It can only REDUCE authority; both off-switches are already one-way (migration 4, C-09); and a
-- break-glass revocation of a compromised Nazir seat must not require the very access-matrix path
-- that is suspected. ⚠ SURFACED, NOT RESOLVED, and it is the same gap the existing `it.todo` in
-- `test/guard-verb-coverage.integration.test.ts` records: a raw narrowing UPDATE therefore still
-- produces NO audit event, while §12 wants an `AuditEvent action = delete_soft` for the
-- suppression. Silently suppressing a live seat remains possible from raw SQL. Closing it means
-- deciding whether break-glass revocation is allowed to be unaudited — a product decision, not a
-- mechanical one.
CREATE OR REPLACE FUNCTION qmulate_grant_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_admission$
DECLARE
  -- Scalars, not a `record`: a `SELECT INTO` that matches no row leaves a record unassigned in some
  -- plpgsql paths, and "record is not assigned yet" is a 55000, not the 42501 a refusal must be.
  marker_actor text;
  marker_type  text;
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
      RETURN NULL; -- a pure narrowing, or a no-op. See the note above.
    END IF;
  END IF;

  SELECT m.actor_id, m.actor_type
    INTO marker_actor, marker_type
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

  -- ── (2) ATTRIBUTION. `grantedByUserId` is NOT caller-supplied (§2b). ───────────────────────
  -- Before this, a caller defeated `waqf_access_grant_no_self_issue` (`grantedByUserId <> userId`)
  -- simply by naming a third party — and an admin self-promoted to NAZIR through the ORDINARY
  -- Prisma delegate, no raw SQL at all, by passing somebody else's id as the issuer. Binding the
  -- column to the identity THE AUDIT TRAIL RECORDS makes the pair (`grantedByUserId`, `userId`)
  -- honest, which is what makes `no_self_issue` mean anything.
  --
  -- ⚠ THE TYPESCRIPT SIDE ALREADY AGREES, AND WAS FIXED INDEPENDENTLY: `activateGrant()` in
  -- `packages/api/src/context.ts` writes `grantedByUserId: ctx.actor.actorId`, and its
  -- `input.grantedByUserId` is marked `@deprecated ACCEPTED AND IGNORED`. So this check is not
  -- fighting the shipped path — it is the half that survives raw SQL, since a control that lives
  -- only in TypeScript is one `$executeRawUnsafe` from irrelevant. The remaining follow-up is
  -- cosmetic: DELETE the ignored parameter, because a parameter nothing reads is a trap.
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

  -- ── (3) AUTHORITY. The acting identity must hold the admin verb ON THIS ENDOWMENT. ─────────
  --
  -- ⚠ THE `SYSTEM` BOOTSTRAP BRANCH, AND EXACTLY HOW WIDE IT IS.
  -- A SYSTEM actor is admitted without the permission check. This is NOT tidiness — it is
  -- unavoidable inside E2 and it is a real widening:
  --   • BOOTSTRAP. No endowment's first `admin:access_matrix:write` holder can be issued by the
  --     holder of a seat that does not yet exist. The fixture ships SEVENTEEN grants and NOT ONE
  --     of them carries an admin verb (`GRANT_SHAPE_BY_ROLE` has no admin shape), so on any
  --     database seeded today the branch is the only way a first admin seat can appear at all.
  --   • THE SEED AND EVERY TEST-PROVISIONING PATH ARE SYSTEM. `makeSystemContext()` is what
  --     `src/seed.ts` and `packages/api/test/setup.ts` use.
  -- WHAT IT COSTS: a raw-SQL caller who forges the marker can set `actorType = 'SYSTEM'`. What
  -- they cannot do is forge it silently — see the RESIDUAL block at the top of this file.
  -- `makeSystemContext()` refuses to build a SYSTEM context for a USER actor (`InvalidBypassError`,
  -- MP-22), so no request path can reach this branch through TypeScript.
  authorised := marker_type = 'SYSTEM'
             OR qmulate_actor_holds_permission(marker_actor, NEW."waqfId",
                                               'admin:access_matrix:write');

  IF NOT authorised THEN
    RAISE EXCEPTION
      'waqf_access_grant %: actor "%" holds no ACTIVE grant carrying "admin:access_matrix:write" on '
      'waqf "%", so it may not write that endowment''s access matrix. Authority is PER ENDOWMENT and '
      'a claim in a request context is not authority — the context said this caller was permitted '
      'and the database is the layer that checks (MP-17, MP-18, §10 principle 3).',
      NEW."id", marker_actor, NEW."waqfId"
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL; -- an AFTER trigger's return value is ignored
END;
$qm_grant_admission$;


-- ── THE RULE BOTH DELETE GUARDS APPLY, STATED ONCE ───────────────────────────────────────────
-- **A ROW THE AUDIT TRAIL RECORDED IS A RECORD, AND A RECORD IS NOT ERASABLE.**
--
-- Migration 4 §3.4 named the two hard-DELETE guards as a known residue and deferred them because
-- several test files tear their scaffolding down with `DELETE FROM "waqf_access_grant"` /
-- `"approval_request"`, "and a half-landed guard that reddens CI is worse than a documented gap".
-- The way through is not an exemption but the right predicate:
--
--   • A row for which an `audit_event` exists carries the >= 10-year retention obligation
--     (NFR-07 / BR-702). Erasing it destroys evidence, so it is REFUSED.
--   • A row the trail never recorded was never a record, so purging it takes nothing away.
--
-- WHY THAT IS TOTAL RATHER THAN LENIENT, once §2a is in force: a grant can no longer be BORN
-- outside a transaction that appends an `audit_event` naming it. Every grant a legitimate path can
-- create is therefore in the trail and therefore undeletable. The exempt set is exactly (a) rows
-- laid down with admission deliberately disabled — the integration suite's own scaffolding, which
-- needs table ownership and says so out loud — and (b) rows predating the trail.
--
-- AND IT CANNOT BE TALKED OUT OF: the only way to make a real row deletable is to remove the
-- `audit_event` that names it, and `audit_event` is append-only (migration 1: `audit_event_no_mutate`,
-- `audit_event_no_mutate_row`, `audit_event_no_truncate`). The append-only trail is what makes this
-- guard un-defeatable, which is a much better foundation than a blanket refusal with an exemption
-- list beside it.
CREATE OR REPLACE FUNCTION qmulate_row_is_in_trail(p_entity_type text, p_entity_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $qm_in_trail$
  SELECT EXISTS (
    SELECT 1 FROM "audit_event" ae
     WHERE ae."entityType" = p_entity_type
       AND ae."entityId" = p_entity_id
  );
$qm_in_trail$;


-- ── 2c. A GRANT THE TRAIL KNOWS ABOUT IS NEVER HARD-DELETED (C-09) ───────────────────────────
-- What it closes, concretely: `role`, `(userId, waqfId)`, `revokedAt` and `deletedAt` are all
-- write-once-or-one-way under `qmulate_grant_role_immutable()` — and every one of those properties
-- was defeated by DELETE + re-INSERT of the same id, because a re-INSERT has no OLD row to compare
-- against. Reproduced this round on a seeded database: the seeded FINANCE seat
-- `grant-user-accountant-001-waqf-001` was hard-deleted and re-inserted as `NAZIR`. (§2a closes the
-- re-INSERT half independently; this closes the ERASURE half, which §2a says nothing about.)
CREATE OR REPLACE FUNCTION qmulate_grant_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_grant_no_delete$
BEGIN
  IF NOT qmulate_row_is_in_trail('WaqfAccessGrant', OLD."id") THEN
    RETURN OLD; -- never a record; see the rule above
  END IF;

  RAISE EXCEPTION
    'DELETE on "waqf_access_grant" is refused (row %): the audit trail records this seat, so it is '
    'evidence and carries a >= 10-year retention obligation (NFR-07 / BR-702). Its role and subject '
    'are write-once and both off-switches are one-way, and DELETE + re-INSERT of the same id is how '
    'all four properties were defeated at once — the same move that defeated the Shart guard as '
    'C-03. Retire a seat with "revokedAt" (or "deletedAt") instead (MP-15, §10 principle 3).',
    OLD."id"
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_grant_no_delete$;


-- ── 2d. AN APPROVAL REQUEST THE TRAIL KNOWS ABOUT IS NEVER HARD-DELETED (C-13, C-10) ─────────
-- C-13: migration 4 closed SOFT-deleting a live approval (that frees the one-open-per-subject slot
-- and hides a decision from every live query), and left the hard DELETE standing — so a maker who
-- was REFUSED could erase the refusal outright and re-raise, which is strictly worse: soft-delete at
-- least leaves the row.
--
-- C-10's remaining half: `distribution_authority` is DEFERRED, so it verifies the approval once, at
-- the commit that wrote the run, and NEVER AGAIN. Every other way of invalidating that authority
-- afterwards is already shut — `waqfId`, `type`, `subjectId` and `payload` are write-once, soft-delete
-- of a live row is refused, terminal states cannot be re-decided — except deleting the row, which
-- left a paid `EXECUTED` run naming an approval that no longer existed. `VOID` is the audited
-- retirement path and it stays inside the lattice.
CREATE OR REPLACE FUNCTION qmulate_approval_request_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_no_delete$
BEGIN
  IF NOT qmulate_row_is_in_trail('ApprovalRequest', OLD."id") THEN
    RETURN OLD; -- never a record; see the rule above §2c
  END IF;

  RAISE EXCEPTION
    'DELETE on "approval_request" is refused (row %, status %). An approval — including a REJECTED '
    'one — is the evidence that the maker-checker gate ran, so erasing it erases the refusal and '
    'frees the one-open-per-subject slot for a second attempt (C-13, BR-105 / BR-1103). It is also '
    'the last way to invalidate the authority a committed EXECUTED distribution names, because '
    'distribution_authority is DEFERRED and never re-fires (C-10). Retire it with '
    'status = ''VOID'', which is audited and inside the lattice.',
    OLD."id", OLD."status"
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$qm_appr_no_delete$;


-- ── 2e. AN AUTHORITY A DISTRIBUTION IS STANDING ON MAY NOT BE VOIDED (C-10) ──────────────────
-- `APPROVED -> VOID` is a legal lattice move and must stay one: an approval granted in error has to
-- be retirable. But it was legal even when an `APPROVED` or `EXECUTED` distribution ALREADY named
-- that approval as its authority — and because `distribution_authority` is deferred it never looks
-- again, so the run kept its status while the authority under it evaporated. Cancel or supersede
-- the RUN first; then the approval is free.
--
-- A separate BEFORE UPDATE trigger rather than another clause inside
-- `qmulate_approval_request_authority()`, deliberately: replacing a function an applied migration
-- defines is what forced migration 4 to declare a re-entry ORDER for `qmulate_apply_*`. Additive
-- guards keep that order irrelevant.
CREATE OR REPLACE FUNCTION qmulate_approval_authority_in_use()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_in_use$
DECLARE
  run text;
BEGIN
  IF NEW."status"::text <> 'VOID' OR OLD."status"::text = 'VOID' THEN
    RETURN NEW;
  END IF;

  SELECT d."id" INTO run
    FROM "distribution" d
   WHERE d."approvalRequestId" = OLD."id"
     AND d."status"::text IN ('APPROVED', 'EXECUTED')
     AND d."deletedAt" IS NULL
   LIMIT 1;

  IF run IS NOT NULL THEN
    RAISE EXCEPTION
      'approval_request %: distribution % is % and names this approval as its authority, so it may '
      'not be VOIDed. distribution_authority is a DEFERRED check — it verified this approval once, '
      'at the commit that wrote the run, and never re-fires — so voiding it now leaves a run that '
      'moved money standing on an authority that no longer exists (MP-29, BR-506). Cancel or '
      'supersede the RUN first.',
      OLD."id", run,
      (SELECT d2."status" FROM "distribution" d2 WHERE d2."id" = run)
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_appr_in_use$;


-- ── 2f. AN ASSET'S TITLE-DEED NUMBER IS RESERVED-MATTER-ONLY ─────────────────────────────────
-- FOUND THIS ROUND, re-verified as pre-existing: a SUBCONTRACTOR seat holding only
-- compliance/document write permissions rewrote `asset-001`'s `titleDeedNumber` at the database
-- layer. `waqf.certificateNumber` / `waqf.deedNumber` have been reserved-matter-gated since
-- migration 3 on D-5's reasoning — "silently re-pointing a waqf at a different deed is as damaging
-- as editing the Shart" — and an ASSET's title deed is the same class of fact about the corpus
-- (`asl`) itself: it is the document by which the endowment's ownership of that parcel is proved.
-- Same subject grammar as the other gated columns: `asset:<assetId>:titleDeedNumber`.
--
-- ⚠ THIS CLOSES THE DAMAGE, NOT THE CAUSE, AND THE CAUSE IS NOT IN THIS LAYER. A subcontractor
-- seat should not be able to write `Asset` AT ALL; that is the force filter's permission-to-model
-- mapping in `packages/database/src/extensions/scoping.ts`, which this migration does not own and
-- must not be assumed fixed. Report both.
--
-- ⚠ SURFACED, NOT RESOLVED (product scope): only `titleDeedNumber` is gated. `addressAr`,
-- `valuationSar` and `type` are also identity-ish, and `asset` has no DELETE guard, so DELETE +
-- re-INSERT still walks around this exactly as it walked around the Shart guard as C-03. Gating
-- more columns and adding `asset_no_delete` is the fail-closed direction; it was left out of this
-- migration because `asset` is written by E4/E5 code that does not exist yet and a guard nobody can
-- satisfy is a guard that gets deleted. Decide it before E4 ships.
CREATE OR REPLACE FUNCTION qmulate_asset_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_asset_identity$
DECLARE
  approval text := current_setting('qmulate.reserved_matter_approval_id', true);
  defect   text;
BEGIN
  IF NEW."titleDeedNumber" IS NOT DISTINCT FROM OLD."titleDeedNumber" THEN
    RETURN NEW;
  END IF;

  defect := qmulate_reserved_matter_defect(
    approval, OLD."waqfId", 'asset:' || OLD."id" || ':titleDeedNumber'
  );
  IF defect IS NOT NULL THEN
    RAISE EXCEPTION
      'asset %: "titleDeedNumber" (% -> %) is reserved-matter-only. It is the corpus asset''s legal '
      'identity — re-pointing it silently substitutes which parcel the endowment is proved to own '
      '(Binding rule 1, D-5). %. Go through withReservedMatter(); the subject an approval must name '
      'is "asset:%:titleDeedNumber".',
      OLD."id", OLD."titleDeedNumber", NEW."titleDeedNumber", defect, OLD."id"
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$qm_asset_identity$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — qmulate_apply_e2_grant_admission()
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qmulate_apply_e2_grant_admission()
RETURNS void
LANGUAGE plpgsql
AS $qm_apply_admission$
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.1 waqf_access_grant — an UNATTRIBUTED issuer is not an issuer
  --
  -- A CHECK, not a trigger clause: `waqf_access_grant_no_self_issue` is `grantedByUserId <> userId`,
  -- which `''` satisfies — the same `'' passes IS NOT NULL` shape as C-10 case #4. And CHECKs are
  -- not skipped by `session_replication_role = 'replica'` at all, so this one holds even where a
  -- trigger would not.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  PERFORM qmulate_add_check(
    'waqf_access_grant',
    'waqf_access_grant_granted_by_not_blank',
    'btrim("grantedByUserId") <> '''''
  );

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.2 waqf_access_grant — ADMISSION, checked at COMMIT (the headline)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS waqf_access_grant_admission ON "waqf_access_grant";
  CREATE CONSTRAINT TRIGGER waqf_access_grant_admission
    AFTER INSERT OR UPDATE ON "waqf_access_grant"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION qmulate_grant_admission();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.3 the authorization plane — the DELETE verb migration 4 left open
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS waqf_access_grant_no_delete ON "waqf_access_grant";
  CREATE TRIGGER waqf_access_grant_no_delete
    BEFORE DELETE ON "waqf_access_grant"
    FOR EACH ROW EXECUTE FUNCTION qmulate_grant_reject_delete();

  DROP TRIGGER IF EXISTS approval_request_no_delete ON "approval_request";
  CREATE TRIGGER approval_request_no_delete
    BEFORE DELETE ON "approval_request"
    FOR EACH ROW EXECUTE FUNCTION qmulate_approval_request_reject_delete();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.4 approval_request — an authority in use may not be voided (C-10)
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS approval_request_authority_in_use ON "approval_request";
  CREATE TRIGGER approval_request_authority_in_use
    BEFORE UPDATE ON "approval_request"
    FOR EACH ROW EXECUTE FUNCTION qmulate_approval_authority_in_use();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.5 asset — the corpus asset's legal identity
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  DROP TRIGGER IF EXISTS asset_identity_guard ON "asset";
  CREATE TRIGGER asset_identity_guard
    BEFORE UPDATE ON "asset"
    FOR EACH ROW EXECUTE FUNCTION qmulate_asset_identity_guard();

  DROP TRIGGER IF EXISTS asset_no_truncate ON "asset";
  CREATE TRIGGER asset_no_truncate
    BEFORE TRUNCATE ON "asset"
    FOR EACH STATEMENT EXECUTE FUNCTION qmulate_reject_truncate();

  -- ─────────────────────────────────────────────────────────────────────────────────────────
  -- 3.6 ENABLE ALWAYS on every guard added here
  --
  -- Including the CONSTRAINT trigger: `tgenabled` applies to constraint triggers exactly as it does
  -- to ordinary ones, and without this one `SET LOCAL session_replication_role = 'replica'` would
  -- skip grant admission at commit — which is the whole file.
  -- ─────────────────────────────────────────────────────────────────────────────────────────
  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_admission;
  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_delete;
  ALTER TABLE "approval_request"  ENABLE ALWAYS TRIGGER approval_request_no_delete;
  ALTER TABLE "approval_request"  ENABLE ALWAYS TRIGGER approval_request_authority_in_use;
  ALTER TABLE "asset"             ENABLE ALWAYS TRIGGER asset_identity_guard;
  ALTER TABLE "asset"             ENABLE ALWAYS TRIGGER asset_no_truncate;
END;
$qm_apply_admission$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — APPLY
--
-- Fails LOUDLY on a missing prerequisite rather than skipping the guards: a database whose
-- authorization plane is writable from raw SQL must never be mistaken for a healthy one.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

DO $qm_apply$
DECLARE
  missing text[] := ARRAY[]::text[];
  t       text;
BEGIN
  FOREACH t IN ARRAY ARRAY['waqf_access_grant', 'approval_request', 'audit_event',
                           'audit_chain_head', 'distribution', 'asset']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 grant-admission migration ran BEFORE the Prisma-generated init migration. '
      'Missing table(s): %. See packages/database/prisma/sql/README.md.',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('qmulate_add_check(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 grant-admission migration ran BEFORE 00000000000001_init_append_only_audit, '
      'which defines qmulate_add_check(). Migrations apply in lexicographic directory order; this '
      'one must sort last.';
  END IF;

  IF to_regprocedure('qmulate_reject_truncate()') IS NULL
     OR to_regprocedure('qmulate_reserved_matter_defect(text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'QMULATE E2 grant-admission migration ran BEFORE 00000000000004_e2_guard_gaps, which defines '
      'qmulate_reject_truncate() and the SUBJECT-BOUND qmulate_reserved_matter_defect(text,text,'
      'text). The asset identity guard binds an approval to its artifact and must not fall back to '
      'migration 3''s subject-blind overload (C-14).';
  END IF;

  PERFORM qmulate_apply_e2_grant_admission();
END
$qm_apply$;
