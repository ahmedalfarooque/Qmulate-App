# ADR 0008 — Authorization-Plane Admission Control: App Layer in E2, Privilege Separation DELIVERED in S2 round 6

**Status:** DECIDED (Accepted) — **the HARD GATE STILL STANDS.** **Round 7 (2026-09-08, S12-1): the approval DECISION left the runtime credential — AV4-02 closed by migration 50; read the round-7 addendum after round 6.** The application layer closed in E2; **privilege separation was pulled forward from E12 and landed on 2026-07-29 (round 6 — read that addendum LAST, it supersedes the E12 language in the body)**. Named residuals remain and are enumerated there; they are **in-scope threats**, not accepted risks.
**Date:** 2026-07-28 · **round-5 addendum** 2026-07-29 · **round-6 addendum (privilege separation delivered)** 2026-07-29

**Deciders:** QMULATE (product owner) — engineering presented the reproduction, three options and a recommendation; both picks were the product owner's
**Scope:** `packages/database` (the force filter, the grant guards), `packages/api` (the procedure ladder), and — for the closing half — **E12 / deployment** (Railway roles, connection strings).
**Relates to:** [ADR-0005](ADR-0005-nazir-sole-approval-authority.md) · [ADR-0004](ADR-0004-role-model-thirteen.md) · [§10 Roles & access matrix](../product/prd/10-roles-access-matrix-spec.md) §7.3 · [BR-105](../product/brd/06-functional-requirements.md) · [BR-1103](../product/brd/06-functional-requirements.md) · [NFR-05](../product/brd/08-nonfunctional-requirements.md) · `SCOPING_KNOWN_GAPS` (the S1 RLS deferral) · [Build plan — Sprint 2 status](../product/prd/BUILD-PLAN.md)
**Classification:** Privileged & Confidential — internal

> ⚠ **READING ORDER.** The body below is the ORIGINAL E2 decision and its E12 deferral. It is kept verbatim
> because it is the record of what was decided and why. **Several of its statements are no longer true** —
> in particular "on Railway the runtime connects as the database OWNER" and every "deferred to E12". The
> **round-6 addendum at the end** states what actually holds, what closed, and what did not. Read it last
> and quote it, not the body.

---

## Decision (in two lines)

**E2 closes the authorization plane at the application layer and defers privilege separation to E12.**
**The insider with application-database credentials IS in the threat model, so this is a hard gate before any real client data — not an accepted risk.**

---

## What was found

[ADR-0005](ADR-0005-nazir-sole-approval-authority.md) claims the Nazir is the sole approval authority and
that the rule holds in three layers. Adversarial review reproduced the following on a fresh
migrated-and-seeded database:

`user-accountant-001` — a plain `FINANCE` seat holding no admin verb and no approve verb — was **correctly
refused** when it asked its own scoped Prisma delegate for a `NAZIR` grant. It then issued the
**byte-identical row through `$executeRawUnsafe` on that same scoped client**, and it committed — on
`waqf-001` and on `waqf-002`, an endowment it holds nothing on. `appRouter.approval.approve` then returned
`{status:'APPROVED', checkerId:'user-accountant-001'}` on **two SAR 4,500,000 `BANK_MOVEMENT`s raised by a
different maker.** Zero audit events name either forged grant; the APPROVE events faithfully sealed
`context:{role:'NAZIR'}` into the hash chain.

Two facts make this structural rather than a bug:

1. **Prisma client extensions do not intercept `$queryRaw`/`$executeRawUnsafe`.** Any control living only
   in the force filter is bypassable from the very same scoped client that the filter governs.
2. **The database's INSERT-time guards can only inspect the row's shape, not its provenance.**
   `waqf_access_grant_permission_guard` *positively permits* `approve`/`sign` precisely because the forged
   role genuinely is `NAZIR`; `CHECK waqf_access_grant_no_self_issue` is satisfied by naming a third party
   as `grantedByUserId`. `pg_trigger` shows **no trigger governing who may insert a grant**.

This is ADR-0005's own reasoning turned against it: every layer asked *"does this row say NAZIR?"* and none
asked *"how did this row get here?"* Three layers that all resolve authority by reading one table are one
layer.

## Why a trigger cannot finish the job

The natural next step — an admission trigger requiring a session-local marker that only the audited
access-matrix path sets, mirroring the reserved-matter GUC — **cannot be sufficient on its own**, and it
would be dishonest to ship it as though it were. A GUC is set by SQL. An actor who can already execute
arbitrary SQL as the application role can set the marker as easily as they can insert the row. It raises
the cost of the attack; it does not close it.

The control that actually closes it is **privilege separation**: the runtime role must not hold
`INSERT`/`UPDATE`/`DELETE` on the authorization plane, and access-matrix changes must travel through a
separate, narrowly-scoped, audited path. Migration 1 already established exactly this pattern for
`audit_event` (a dedicated `INSERT`-only role plus `REVOKE`). **It does not currently bite, because on
Railway the runtime connects as the database OWNER, and an owner bypasses GRANTs** — and bypasses RLS too
unless `FORCE ROW LEVEL SECURITY` is set. So the fix is a deployment change, not only a schema change,
which is what puts it outside §17's E2 scope.

## The options presented

| | Option | Assessment given |
|---|---|---|
| (a) | Close the application layer in E2; document the SQL residual as a named, bounded gap; privilege separation + RLS land in **E12** before production | *Recommended.* Matches how S1 handled the RLS deferral, keeps E2's scope honest. Cost: the headline sentence ships **qualified** — true through the application, not absolute |
| (b) | Do privilege separation now, inside E2 | Makes the claim absolute; touches Railway config, connection management, `.env` and the seed — real infrastructure work well beyond E2 |
| (c) | Postgres RLS on the authorization plane now | Narrower than (b) and stays in the database — but needs the same deployment change to be worth anything, since owners bypass RLS |

**Decided: (a).** And separately, on the threat model: **an insider with application-database credentials is
IN scope** — appropriate for a professional Nazir holding court-recognised trustee duties over other
families' endowments.

## Consequences

### What E2 ships

- The **application layer is closed**: no forged or widened grant passes through Prisma by any nesting,
  verb, depth, model, seat, or batching form that two independent re-attackers could construct.
- The **headline claim is recorded as qualified, not absolute** — in [ADR-0005](ADR-0005-nazir-sole-approval-authority.md),
  in the build plan's status table, and in `SCOPING_KNOWN_GAPS`. **No document may state it unqualified**
  until E12 closes it. The previous version of that sentence was believed by the next reader, which is how
  the Shart claim in [ADR-0006](ADR-0006-shart-hatch-shut-in-e2.md) survived being false.
- The false comments that claimed otherwise are removed from shipped source (`scoping.ts` asserted these
  controls "DO survive raw SQL"; they do not).

### The hard gate

Because the insider is in scope, **this is not an accepted risk — it is deferred work with a deadline.**

> **No real client data may enter any environment before privilege separation is in place.** Until then the
> `DATA_CLASSIFICATION=fixture-only` guardrail is doing double duty: it protects data residency *and* it is
> the only thing standing between this gap and a real family's endowment.

E12 must deliver, at minimum: a least-privilege runtime role that does **not** own the database; `REVOKE`
on the authorization plane for that role; a separate audited path for access-matrix changes; and RLS with
`FORCE ROW LEVEL SECURITY` where it adds defence in depth. The E12 scope line and the pen-test checklist
must both name this ADR.

### Addendum — S2 round 5 (2026-07-29): route 1 closed, route 2 open, and one NEW E12 obligation

Delivering product-owner decision **PO-1** ("seed a real admin seat, then remove the SYSTEM marker
disjunct from grant admission") changed what this ADR's residual consists of. Recorded here because the
migration files that carry the detail (5 and 7) are applied and cannot be edited, and their headers now
describe a state that no longer holds.

**What closed.** `migrations/00000000000009_e2_close_system_marker` deletes the
`marker_type = 'SYSTEM'` disjunct from `qmulate_grant_admission()`. Reproduced before, on a freshly
migrated + seeded database: a FINANCE seat forged one `audit_event` with `actorType = 'SYSTEM'` and
`actorId = 'not-a-real-user'` — not even a `User` row — advanced the chain head, inserted the grant from
its own scoped client, and `appRouter.approval.approve` returned `{status:'APPROVED'}` on another maker's
SAR 4,500,000 `BANK_MOVEMENT`. After: 42501, no row, the approval stays `PENDING`. The mutation is run —
the disjunct is substituted back into the live body via `pg_get_functiondef()` inside a rolled-back
transaction, and route 1 becomes PERMITTED again.

**What did NOT close, and is now the whole residual.** A forged marker with `actorType = 'USER'` (or any
`actorType` — the field is no longer read) naming **`user-admin-001`**, the one seeded holder of
`admin:access_matrix:write` on `waqf-001`, is still admitted, and still ends in an `APPROVED` SAR 4.5m
movement. **It is not closable by any in-database marker logic**: the marker is a row, the attacker writes
the row, and while attacker and application share one database role the trigger cannot observe who
authored a row. Any scheme that looks like a fix (a GUC, a second marker table, a signature under a key
the same role can read, a `session_user` check) is satisfiable by the same caller. It is pinned as a
**passing** test — `packages/database/test/grant-admission-system-branch.integration.test.ts` §11 — which
must be **deleted**, not inverted, when privilege separation lands.

**The new E12 obligation.** Bootstrap moved out of the guard and behind a privilege. Authority cannot
authorise its own first instance, so the fixture seed and both test harnesses now call
`withAccessMatrixBootstrap()` (`packages/database/src/access-matrix-bootstrap.ts`), which suspends the
admission trigger and therefore **requires table ownership**. That adds nothing an attacker did not
already have — DDL bypass is open item #8 and was measured from the app role in round 4 — and it raises
the floor, because route 1 needed only `INSERT` on two tables the runtime must hold forever. But it means
**E12 cannot simply revoke ownership: it must also supply the provisioning path that replaces this one**
(the `SECURITY DEFINER` procedure owned by the migrator, with `EXECUTE` withheld from the runtime role).
A privilege separation that lands without it breaks `pnpm db:seed` and both integration suites.

### What this does not decide

- **The threat model itself is still unwritten** — CLAUDE.md lists it as a load-bearing gap, and this ADR
  settles only the one question that blocked S2. The product owner chose "insider in scope" for *this*
  decision; that is not a substitute for the document. Until it exists, every similar judgement will
  recur at each sprint boundary.
- Whether other tables need the same treatment. `waqf_access_grant` is the one that mints authority, so it
  is first; `approval_request`, `distribution` and `setting` deserve the same question asked of them.

---

## Addendum — S2 round 6 (2026-07-29): privilege separation LANDED. What that closed, and what it did not.

**Status of this addendum:** the product owner pulled privilege separation FORWARD from E12 to now, on the
evidence of round 5. It is delivered. This section is deliberately written as *which layer closed what*,
because five decision records in this sprint claimed properties the code lacked and each was believed by
the next reader.

### What was built

| | Control | Where |
|---|---|---|
| 1 | **Three separated database roles.** `qmulate_app` (runtime, `DATABASE_URL`), `qmulate_provisioner` (`ACCESS_MATRIX_DATABASE_URL`), `qmulate_owner` (`MIGRATOR_DATABASE_URL`). All three `NOSUPERUSER NOBYPASSRLS NOCREATEROLE`, none a member of another. | `scripts/provision-db-roles.ts` → `packages/database/src/provision-roles.ts` |
| 2 | **The runtime role owns nothing.** Ownership of schema `public`, all tables, all functions, the one sequence and every enum type is reassigned to `qmulate_owner`. | same script |
| 3 | **`REVOKE` on the authorization plane.** `qmulate_app` holds `SELECT` and nothing else on `waqf_access_grant` and `membership`. `audit_event` keeps `SELECT, INSERT` — append-only *requires* INSERT — and loses `UPDATE, DELETE, TRUNCATE`. `DELETE` survives on exactly the five identity tables better-auth owns. | migration `00000000000010_privilege_separation_matrix` |
| 4 | **`ENABLE` + `FORCE ROW LEVEL SECURITY`** on `waqf_access_grant` and `membership`, with a read-all `SELECT` policy and a write policy admitting only the provisioner, the owner, and the table's own owner. | migration `00000000000011_authz_plane_rls_insert_latch` |
| 5 | **A separate, narrow, audited write path.** `provisionAccessGrant()` / `revokeAccessGrant()` open one audited transaction on the provisioner connection. The Prisma client for that role is module-private and is never returned to a caller. `activateGrant()` in `packages/api` now goes through it. | `packages/database/src/access-matrix.ts` |
| 6 | **Boot-time detector.** `assertNoPrivilegedDatabaseUrls()` makes `apps/web` and `apps/worker` refuse to start if `MIGRATOR_DATABASE_URL` or `SUPERUSER_DATABASE_URL` is in their environment. | `packages/config/src/privileged-urls.ts` |

### What closed, layer by layer — MEASURED as `qmulate_app` on a migrated + seeded database

Every line below is a result, not a design intention. The statements, and the mutation that restores each
old behaviour, are in `packages/database/test/authorization-plane-privilege.integration.test.ts`.

```
route 2 (forge marker → advance chain head → insert grant)  42501 permission denied for table waqf_access_grant
  … with INSERT re-GRANTed to qmulate_app (mutation, run)   42501 new row violates row-level security policy
ALTER TABLE "waqf_access_grant" DISABLE TRIGGER …           42501 must be owner of table waqf_access_grant
DROP TRIGGER …                                              42501 must be owner of relation waqf_access_grant
ALTER TABLE … DROP CONSTRAINT waqf_access_grant_no_self_issue  42501 must be owner of table
CREATE OR REPLACE FUNCTION qmulate_grant_admission()        42501 permission denied for schema public
SET session_replication_role = 'replica'                    42501 permission denied to set parameter
SET ROLE qmulate_owner                                      42501 permission denied to set role
UPDATE / DELETE / TRUNCATE on "audit_event"                 42501 permission denied for table audit_event
INSERT on "audit_event"                                     PERMITTED  ← append-only requires it
DELETE FROM "asset" / UPDATE "membership"                   42501 permission denied for table
CREATE TABLE / CREATE SCHEMA                                42501 permission denied
```

Three consequences worth naming individually:

1. **Route 2 is closed unconditionally for anything holding only `DATABASE_URL`** — which is every
   SQL-injection, every `$executeRawUnsafe` on a caller's own scoped client, and every holder of the
   application database credential alone. The marker is still writable and is now simply irrelevant: the
   question is no longer about what a row says.
2. **The DDL residual is closed for the runtime role**, and `SET session_replication_role = 'replica'`
   needs SUPERUSER — which retires, for the runtime, the entire bypass class this repository has fought
   since Sprint 1. `ENABLE ALWAYS` stays on every guard as defence against a privileged caller.
3. **The `it.todo` from Sprint 1 is delivered.** `audit-immutability.integration.test.ts` used to carry
   "Railway connects as the database OWNER, and an owner bypasses GRANTs. A4 proves the least-privilege
   posture EXISTS; it does not prove the running application is constrained by it." A4 now asserts the
   posture against `qmulate_app` — the role the application actually connects as — and additionally
   asserts that role does not own `audit_event`.

### ⚠ WHAT DID **NOT** CLOSE. No document may state otherwise.

1. **Whoever holds `ACCESS_MATRIX_DATABASE_URL` can still forge route 2.** The provisioner must hold
   `INSERT` on `waqf_access_grant` and on `audit_event` to do its one job, and those are exactly the two
   privileges the attack needed. MEASURED and **pinned as a passing attack** in §6c of the privilege test,
   by this sprint's convention that a residual recorded only in prose is a residual nobody is accountable
   for. What the split removes is the route available to a caller holding only the application credential.
2. **Code running inside the web process can still call `provisionAccessGrant()`.** Only an
   out-of-process provisioner authenticating its own operator would close that. Open question 1 below.
3. **Unaudited raw writes to ordinary audited tables are UNTOUCHED.** The runtime must keep
   `SELECT, INSERT, UPDATE` on the business tables or the application cannot function, so
   `UPDATE "asset" SET "valuationSar" = …` with `audit_event` unmoved is still permitted — `SCOPING_KNOWN_GAPS`
   item (1), and the header of `extensions/audit.ts`. Closing it needs per-table audit triggers, not a GRANT.
4. **Cross-endowment reads through the unextended handle are UNTOUCHED** — `SCOPING_KNOWN_GAPS` item (2),
   pinned by `base-client-bypass.integration.test.ts`. RLS is on the authorization plane only.
5. **Anyone holding `MIGRATOR_DATABASE_URL` or the platform superuser credential can switch every guard
   off.** The power did not disappear; it moved to a credential that is supposed to be absent from
   application services. **Whether a deployed service actually holds only the least-privilege credential
   is a DEPLOYMENT fact that no test in this repository can assert.**
   `assertNoPrivilegedDatabaseUrls()` at each app's boot is the only in-repo detector, and it only catches
   the variable being present in the same process.
6. **The threat model is still unwritten**, and the PDPL / KSA-residency review has not been re-run for a
   three-credential topology.

### ⚠ Addendum — S4 (2026-08-13): §2.4's "future functions are covered" was FALSE from the day it shipped

Round 6's §2.4 ran two statements and read as though both worked:

```sql
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;            -- worked, ONE-TIME
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;  -- NO EFFECT
```

**The second does nothing here, MEASURED on PostgreSQL 17.10 as `qmulate_owner` — the role that applies
every migration.** `pg_default_acl` holds **zero** rows before and after it; a function created
immediately afterwards has `proacl = NULL`, which **means EXECUTE is granted to PUBLIC**. The `GRANT`
direction does store a row, which is the tell: `ALTER DEFAULT PRIVILEGES … REVOKE` only *deletes* an
explicit row, and "no row" means the **built-in** default — and the built-in default for FUNCTIONS grants
EXECUTE to PUBLIC. Identical whether the statement is bare or inside a plpgsql `DO` block, so plpgsql is
not the cause.

**Consequence, stated without softening:** the protection round 6 claimed for *future* functions never
existed. Only the one-time sweep worked, which is why the 39 functions present then are clean. **S4's
migration 12 was the first migration since to add a function, and all five of its functions landed
PUBLIC-executable on a fresh database.** None was `SECURITY DEFINER`, so no live escalation shipped — but
the invariant round 6 wrote is *"PUBLIC executes nothing in schema public"*, and the first
`SECURITY DEFINER` function would have inherited the same default.

**What found it:** assertion **1f** — the posture census round 6 wrote saying it *"must exist BEFORE the
first SECURITY DEFINER function does, not after."* It did, and it fired on the first fresh-database run.
That is the round-6 design working exactly as intended, and it is the reason this addendum is a
correction rather than an incident.

**What masked it for hours:** `scripts/provision-db-roles.ts` re-runs a blanket revoke on every
`dev-postgres` start, so the posture self-cleans and the failure only appears on the FIRST suite run after
a fresh migrate. It presented as flaky (2 failures in 12 runs) until a `--reset` reproduced it every time.
A first diagnosis blaming Prisma's connection pool was WRONG and is recorded as wrong.

**The fix, in S4's migration 12:** `qmulate_revoke_public_function_execute()` — a reusable sweep applying
round 6's policy (PUBLIC executes nothing; EXECUTE granted back only on `prosecdef = false`), **called at
the end of any migration that adds a function**, because hand-listing one migration's functions leaves the
next migration with the same trap. Mutation-verified: removing the call turns 1f **and** 1f-MUTATION red.
New test **1f-ENVIRONMENT** pins the Postgres fact itself, so the reliance cannot be re-introduced
silently — if a future Postgres changes the behaviour that test goes red and the sweep can be retired
deliberately. *(1f-ENVIRONMENT deliberately does NOT die under that mutation: it documents the mechanism
and asserts it exists. 1f is the guard.)*

### The hard gate is UNCHANGED

> **`DATA_CLASSIFICATION` stays `fixture-only`. No real client data may enter any environment** until the
> open questions below are answered and the residuals in the previous section are dispositioned.

Round 6 raises the floor substantially; it does not discharge the gate. **[ADR-0005](ADR-0005-nazir-sole-approval-authority.md)'s
headline claim stays QUALIFIED** — it may now say that the SQL route from the application credential is
closed by privilege, and it must still name residuals 1, 2 and 5 above. Making it unqualified is a
decision to take deliberately, not a consequence to assume.

### Deviations from the plan this work was given, and why

* **Bootstrap keeps `ALTER TABLE … DISABLE TRIGGER`** rather than gaining a `current_user`-keyed disjunct
  inside `qmulate_grant_admission()`. Adding a disjunct means widening the one function that decides
  whether a seat may be born; the DDL it replaces is now only reachable from a credential the request path
  does not have. `withAccessMatrixBootstrap()` keeps its name and signature and re-throws a 42501 with the
  variable to fix. **Migration 12 was therefore not needed and is unassigned.**
* **RLS is on `waqf_access_grant` and `membership` only** — not on `approval_request` or `audit_event`.
  MEASURED: with `FORCE RLS` on and no `UPDATE`/`DELETE` policy, those verbs do **not** raise — RLS filters
  rows, so the statement is a silent zero-row no-op. On the two authorization-plane tables the runtime has
  no write path at all, so a forgotten policy cannot silently break one; on `approval_request` (written by
  the shipped maker/checker flow on the request path) and `audit_event` (written by every audited write) it
  could, in exchange for a latch behind a REVOKE that already holds. The trigger guards on those two tables
  RAISE, and the ownership split now makes them unbypassable from the runtime role.
* **The whole fixture seed runs on the owner connection**, not steps 1–17 as app and 18–19 as owner. The
  seed is ONE audited transaction whose every `occurredAt` is `SEED_EPOCH + <insertion ordinal>`; splitting
  it renumbers the ordinals, rewrites the frozen hash chain and gives the seed two independent fates. The
  demonstration that the app role suffices for ordinary business writes moved into the privilege test.
* **`runProbe()` in the database harness moved to the OWNER connection.** Since the app role holds no
  `DELETE`, no `TRUNCATE` and no `UPDATE` on `audit_event`, a guard probe on the app connection is refused
  by the **ACL** before the trigger fires — which would have left the entire guard suite green while
  measuring nothing. Running as the owner restores exactly the environment those assertions were written
  for and makes each claim stronger ("even the table owner is refused"). Probes that
  `SET session_replication_role` route further, to the platform superuser, because no application role may
  set that parameter — otherwise the `ENABLE ALWAYS` claim would have been silently retired.
  **Every PRIVILEGE claim lives in one file, on the restricted connection, whose `beforeAll` fails if that
  connection turns out to be SUPERUSER or BYPASSRLS.**

### Open questions for the product owner (round 6)

1. **Does the access-matrix path get its own out-of-process service?** An in-process provisioner removes
   two attacker classes outright; it does not remove code running inside the web process. Both are
   defensible; they differ in cost and in what ADR-0005 may then say.
2. **Do the provisioner's credentials live in the same environment as the app's?** If
   `ACCESS_MATRIX_DATABASE_URL` sits in the web service's env, an insider who can read that env holds
   both — and that insider is explicitly inside this ADR's threat model.
3. **Is `qmulate_provisioner` present in the web service at all, or only in an admin/ops service?**
   Answering "ops only" moves `grant.activate` out of the request path, which is a product-scope call.
4. **Who performs the production bootstrap of an endowment's first `admin:access_matrix:write` seat, with
   which credential, under what recorded authority?** Authority cannot authorise its own first instance.
   Today the fixture seed does it on the migrator credential; in production that is a human.
5. **Does `approval_request` DML stay on the runtime connection?** It must today. The ownership split
   already makes its trigger guards unbypassable, which may be enough.
   ✅ **ANSWERED 2026-09-08 (S12-1, round 7 below): NO — it is SPLIT.** Minting, spending and voiding stay on
   the runtime; the DECISION moved to the provisioner. The ownership split was NOT enough (AV4-02).
6. **May ADR-0005's headline become unqualified?** The honest default is no — it stays qualified, naming
   which layer holds and which is bounded by deployment.
7. **Does Railway permit non-superuser LOGIN roles and `ALTER … OWNER TO` on the existing staging
   database, and are its environment variables scoped per-service or per-environment?** Both are
   load-bearing and neither could be verified from here. If variables are environment-wide,
   `MIGRATOR_DATABASE_URL` is visible to the web service — and `assertNoPrivilegedDatabaseUrls()` will make
   that deploy fail rather than pass silently, which is the intended behaviour.
8. **Does the KSA-residency / PDPL review need re-running for a three-credential deployment?**

---

## Addendum — S12 round 7 (2026-09-08): the approval DECISION leaves the runtime credential. AV4-02 CLOSED.

**Status of this addendum:** delivered in S12-1 on `sprint/s12-e11`, migration `00000000000050_s12_approval_decision_plane`. It answers round 6's open question 5 and closes the register's highest-severity open item.

### What was found (S4 round 4, carried open through S5–S11)

`qmulate_app` — the least-privileged runtime role, the one the application connects as — could INSERT its own `APPROVED` `RESERVED_MATTER` `approval_request` and spend it in the same transaction: `set_config('qmulate.reserved_matter_approval_id', …)` then `UPDATE "asset" SET "titleDeedNumber" = 'FORGED-999'` **committed**, `audit_event` 153 → 153. Every reserved-matter gate in the repository therefore proved only that the door was closed *without a key*, never that the key had to come from an approval authority. The register said so on every such measurement.

### Why a trigger could close it now, when round 5 proved a trigger could not

Round 5's proof stands: a marker, a GUC, a second table, a `session_user` check — every one is *a row the attacker writes*, satisfiable by the caller **while attacker and application share one database role**. Round 6 ended the sharing and measured, as `qmulate_app`, `SET ROLE qmulate_owner` → 42501 and `SET session_replication_role` → 42501. So `current_user` is the one fact about a connection the runtime credential cannot rewrite, and a rule keyed on it is a rule the caller does not set. Round 6 applied that to `waqf_access_grant` as a REVOKE plus an RLS policy; round 7 applies it to the *decision columns* of `approval_request` as a trigger — because RLS filters an UPDATE into a silent zero-row no-op (migration 11's own measurement) and a refused approval must **raise**.

### What was built

| | Control | Where |
|---|---|---|
| 1 | **Born PENDING.** An INSERT carrying a decision (`status ≠ PENDING`, or any of `checkerId`, `decidedAt`, `decidedAtHijri`, `checkerTotpAssertedAt` non-NULL) is refused unless `current_user` is the provisioner, the owner or a superuser. | migration 50 §3 block (-1) |
| 2 | **The decision is role-keyed.** UPDATE setting `checkerId` NULL→value, or moving `status` into `APPROVED`/`REJECTED`, or setting a decision instant NULL→value, is refused unless the connection role is the approval plane. `APPROVED → EXECUTED` (spending) and `→ VOID` (retiring) stay on the runtime — neither grants authority. | migration 50 §3 block (0c) |
| 3 | **CHECK `approval_request_pending_has_no_checker`** — the converse of migration 3's decided-requires-checker. | migration 50 §2 |
| 4 | **The provisioner gains `UPDATE` on `approval_request` and NO `INSERT`.** It decides; it never mints. The runtime keeps SELECT/INSERT/UPDATE at the ACL and its decision UPDATEs die at the trigger — so a future GRANT cannot reopen the route and there is no policy to forget. | migration 50 §4 (`qmulate_apply_privilege_matrix()` re-created) |
| 5 | **`decideApproval()`** — module-private provisioner client, one audited transaction, the decision and its APPROVE/REJECT event commit together; never returns the client. `approval.approve`, `reservedMatter.approve`, `settings.set` and `endowment.recordDeedTerms` route through it (the last two now decide FIRST and execute SECOND, voiding the decision if the execution fails). | `packages/database/src/approval-plane.ts`, `packages/api/src/middleware/approval-plane.ts` |

**Why the provisioner and not a fifth role.** The provisioner credential already held approval power transitively — mint a `NAZIR` seat (its one job), then approve through the ordinary application path. A separate `qmulate_approver` would add no separation the provisioner lacked, at the cost of a fifth connection string through three CI jobs, three turbo env lists, `.env.example`, `dev-postgres.ts`, `playwright.config.ts` and the posture test. Reuse is the honest shape; the orchestrator was offered the alternative and did not object.

### What closed — MEASURED as `qmulate_app`, `approval-decision-plane.integration.test.ts` (14 tests)

```
INSERT … status = 'APPROVED', checkerId = <nazir> …           42501 "BORN PENDING … not the approval plane"
INSERT PENDING; UPDATE … SET status = 'APPROVED', checkerId …  42501 "ONLY THE APPROVAL PLANE DECIDES"
INSERT PENDING; set_config(GUC); UPDATE asset.titleDeedNumber  42501 "is 'PENDING', not APPROVED"  ← the key does not cut
each of checkerId / decidedAt / decidedAtHijri / TOTP alone     42501; REJECTED alone                42501
INSERT PENDING; UPDATE → VOID                                   PERMITTED (rolled back)   ← minting/retiring stay
APPROVED → EXECUTED                                             PERMITTED (rolled back)   ← spending stays
as qmulate_provisioner: PENDING → APPROVED                      PERMITTED; INSERT PENDING → 42501 (decides, never mints)
decideApproval() end to end                                     APPROVED, checker recorded, 2 × APPROVE in the trail
MUTATION qmulate_is_approval_plane_role() := true               the WHOLE AV4-02 script is ADMITTED (rolled back)
restored                                                        refused again; function text byte-identical
```

The qualification paragraphs in `e3-deed-term-guards` and `grant-admission` are replaced by the closure, citing this addendum. The register row AV4-02 / A1 flips to CLOSED in the same change.

### ⚠ What did NOT close

1. **Whoever holds `ACCESS_MATRIX_DATABASE_URL` is the approval plane.** Code inside the web process can call `decideApproval()`. This is residual (1)/(2) of round 6, now with an approvals twin. It is bounded by who can reach the credential — round 6's open questions 1–3 — and nothing in round 7 changes that bound.
2. **The identity of the person deciding is the application's claim.** The database proves `checkerId <> makerId` and "an ACTIVE NAZIR on this endowment"; TOTP freshness and "the session IS that Nazir" are `checkerProcedure`'s, in TypeScript, as before.
3. **ADR-0005's headline stays QUALIFIED**, for residual 1 above. It may now additionally say: *the runtime credential alone can neither mint a seat nor decide an approval.*

### Open question answered, and one sharpened

- Round 6 **Q5** — *does `approval_request` DML stay on the runtime connection?* — **No: it is split.** Minting, spending and voiding stay; deciding moved.
- Round 6 **Q2/Q3** — *do the provisioner's credentials live in the web service's environment?* — now carries **both** planes' weight. If the answer is ever "an ops-only service", both `provisionAccessGrant()` and `decideApproval()` move out together; they are the same credential and the same shape by design.


## Addendum — S12 round 8 (2026-09-08): the BIRTH of an endowment leaves the runtime credential. Migration 17's "ungoverned wholesale" is CLOSED.

### What was found (migration 17, carried open through S4–S12-3a)

`INSERT INTO "waqf"` was governed by nothing: not WHO may create an endowment, not that an `audit_event` name it. MEASURED as `qmulate_app` (`guard-verb-coverage`'s two `waqf` exemptions): the INSERT committed with `deletedAt` NULL, and committed with `deletedAt` SET — an endowment BORN retired. S12-3b builds the first request-path creation of an endowment (owner ruling 2026-09-08 *"build ui intake"*), so the route it would have walked through was closed first.

### What was built (migration 53 `s12_endowment_birth_admission`)

- **Privilege.** `qmulate_endowment_birth_tables()` = `waqf`, `waqif`: the runtime role keeps SELECT+UPDATE and **loses INSERT**; the provisioner **gains INSERT** (never UPDATE). `qmulate_endowment_birth_child_tables()` = `trusteeship_deed`, `onboarding_gate`: the provisioner gains INSERT so one intake transaction lays the whole record down; the runtime keeps its INSERT (`deed.upsert`, `onboarding.clearGate`). CENSUS-G pins both planes from the migration's own functions.
- **Admission.** `waqf_birth_admission` — DEFERRABLE INITIALLY DEFERRED, ENABLE ALWAYS, mirror of `waqf_access_grant_admission`: a MARKER (`audit_event` naming the new endowment, this transaction, in the chain) must exist and name an actor; `createdBy` is BOUND to that actor; the actor must hold **sibling-endowment authority** — BOTH `endowment:waqf:write` AND `admin:access_matrix:write`, established (migration 7's precedence clause, reused) on another live endowment of the SAME CLIENT; and **nobody is BORN retired** (`deletedAt` set on INSERT → `WAQF_BORN_RETIRED`, for every role).
- **The first seat.** `qmulate_grant_admission()` gains ONE bounded disjunct: a seat on a `waqf` row born in THIS transaction (`xmin = pg_current_xact_id()`) is admitted on sibling authority. A seat issued in any later transaction is judged by the on-endowment clause exactly as before (measured: the registrar cannot seat a second person on the newborn afterwards).
- **The door.** `intakeEndowment()` (`packages/database/src/intake.ts`) on the provisioner connection, one audited transaction: founder (new or visible existing) → endowment (`NOT_CLASSIFIED`, Shart captured ONCE as stated with `completeness: INCOMPLETE`, `reversionClauseCaptured: false` STATED) → trusteeship deed (eligibility flags as stated, UNVERIFIED) → three gates OPEN → the first NAZIR seat → an explicit CREATE-kind INTAKE event. `onboarding.intake` resolves the caller's sibling authority explicitly and says `ENDOWMENT_INTAKE_NOT_AUTHORISED` first; the trigger is the wall.

### Two decisions taken here, recorded because they deviate from the ratified plan

1. **The owner connection is exempt from `waqf_birth_admission` by `current_user`**, not by explicit suspension. Six database probes, the api harness and the seed construct endowments raw as the owner; the owner can disable any trigger regardless; and `current_user` is the one fact a caller cannot write (round 7 keys the approval decision on it). This is not a `SYSTEM`-marker disjunct — the marker was caller-authored text. Grant admission exempts nobody.
2. **`reversionClauseCaptured` keeps NO default.** A first draft defaulted it to `false` so the intake could omit it; `e3-lineage-reversion` refused the default in the catalogue (binding rule: a defaulted مآل capture state is a defaulted answer). So the intake STATES `false`, and the scoping extension judges that one sentinel on CREATE by the record verb rather than the signer's — recording `true`, and every update, stays `endowment:deed:sign`. The scoping policy's S4 note *"COUPLES E11's onboarding to the Nazir's signature"* is answered in place.

### What closed — MEASURED (`endowment-birth-admission.integration.test.ts`)

```
as qmulate_app:   INSERT INTO waqf / waqif                         42501 permission denied for table (the ACL)
                  UPDATE waqf (no-op, rolled back)                  PERMITTED  ← the record stays writable
as provisioner:   raw INSERT, no marker                            42501 WAQF_BIRTH_NOT_ADMITTED "appended no audit_event"
                  intakeEndowment(), both verbs on a SIBLING        ADMITTED: NOT_CLASSIFIED, 3 gates OPEN, 1 NAZIR seat, createdBy = actor
                  record verb only                                  refused before/at the wall, nothing written
                  both verbs on ANOTHER client's endowment          42501 "SIBLING endowment of the same client"
                  a second seat on the newborn, later transaction   42501 "holds no ACTIVE grant … SAME transaction as the endowment"
as owner:         INSERT … deletedAt = now()                        42501 WAQF_BORN_RETIRED
MUTATION          qmulate_sibling_endowment_authority() := true     the FOREIGN birth is ADMITTED; restored byte-identical → refused
```

### ⚠ What did NOT close

1. **Q7 (owner, open):** the FIRST endowment of a BRAND-NEW client has no sibling. That birth is the owner-credential bootstrap (the importer path) — the refusal text says so. Option (b), a client-level `Membership(admin)` as bootstrap authority, is not built.
2. **Residual (1)/(2) of round 6, now with a birth twin:** whoever holds `ACCESS_MATRIX_DATABASE_URL` can birth an endowment with a forged marker; the web process holds it. ADR-0005's headline stays qualified for the same reason it did in round 7.
3. **Founders a caller cannot see are not offered**: `onboarding.intakeAuthority` lists only founders owning an endowment the caller holds a grant on (`CLIENT_REACHABLE_MODELS`). A new founder may always be recorded. This is honest scoping, not a gap — noted so nobody "fixes" it into a family-wide directory.
