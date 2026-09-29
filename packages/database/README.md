# `@qmulate/database`

Prisma schema, migrations, the three Prisma client extensions (**audit · scoping · field-encryption**), and the fixture-only seed.

This package is where the platform's non-negotiable guarantees are physically enforced: the append-only audit
spine, the *Shart al-Waqif* immutability trigger, the corpus/income guard, and the residency guardrail. Most of
them live in **hand-authored SQL**, not in generated code — read [Migrations](#migrations) before you touch
anything under `prisma/`.

**Read first:** [ADR 0002 · Receipt income/capital classification](../../docs/decisions/ADR-0002-receipt-income-capital-classification.md) ·
[ADR 0003 · Append-only audit & Shart immutability](../../docs/decisions/ADR-0003-append-only-audit-and-shart-immutability.md) ·
[§07 Data model](../../docs/product/prd/07-data-model-spec.md) · [§12 Security, audit & retention](../../docs/product/prd/12-security-audit-retention-spec.md)

---

## Contents

```
prisma/
  schema.prisma                        the Phase-1 data model
  migrations/
    00000000000000_init/               Prisma-generated tables  (must sort FIRST)
    00000000000001_init_append_only_audit/
                                       HAND-AUTHORED guards     (must sort SECOND)
  sql/README.md                        the SQL-migration playbook — read it before editing migrations
  seed.ts                              entry point for `db:seed`
src/
  guardrail.ts        DATA_CLASSIFICATION + permitted-fixture-path checks (NFR-03 / gate G-8)
  context.ts          ActorContext, the reserved-matter GUC name, the runtime role name
  hash-chain.ts       canonicalJSON, rowHash, chain verification (gate G-1)
  crypto.ts           AES-256-GCM field encryption + searchable HMAC
  extensions/         audit · scoping · encryption
  seed/               fixture parsing, enum mapping, Hijri snapshots, Settings, Shart JSON
```

---

## Prerequisites

- **Node 22**, **pnpm 10.15.0** (pinned via `packageManager` at the repo root).
- **PostgreSQL 16+**, reachable at `DATABASE_URL`. Local Docker one-liner:
  ```bash
  docker run --name qmulate-pg -e POSTGRES_PASSWORD=qmulate -e POSTGRES_USER=qmulate \
    -e POSTGRES_DB=qmulate_dev -p 5432:5432 -d postgres:16
  ```
- A `.env` at the repo root. Copy `.env.example` and fill it in — **never commit a real `.env`.**

### Environment

| Variable | Required by | Notes |
|---|---|---|
| `DATABASE_URL` | migrations, seed, runtime | `postgres://` or `postgresql://`. Validated by `@qmulate/config`. |
| `DATA_CLASSIFICATION` | **everything** | `fixture-only` \| `production`. No default, no escape hatch. See [the guardrail](#the-residency-guardrail). |
| `FIELD_ENCRYPTION_KEYS` | seed, runtime | JSON map of key version → base64 **32-byte** key, e.g. `{"1":"<base64>"}`. |
| `FIELD_ENCRYPTION_ACTIVE_KEY` | seed, runtime | Which version new writes use, e.g. `"1"`. Older versions stay for reads (rotation). |
| `FIELD_HMAC_KEY` | seed, runtime | base64 **32-byte** key, **separate** from the encryption keys — used for the searchable `…Hmac` columns. |
| `SEED_FILE` | seed only | Optional override. Any value other than the one permitted fixture makes the seed **refuse**; that is what CI's guardrail job exercises. |

Generate the three key values locally with `openssl rand -base64 32` (run it three times — do not reuse one
value across all three).

> **Two known gaps, flagged rather than silently fixed** (neither is owned by this package):
> `.env.example` documents the seed override as `SEED_INPUT`, but the implementation reads **`SEED_FILE`**
> (or `--file <path>`); and the three `FIELD_*` variables are read directly from `process.env` here and are
> **not** yet in `@qmulate/config`'s zod schema or in `.env.example`. Until both are reconciled, this table is
> the accurate list.

---

## Quick start

From the repo root:

```bash
pnpm install                                   # once
pnpm --filter @qmulate/database generate       # prisma generate → prisma/generated/client
pnpm exec tsx scripts/provision-db-roles.ts    # ⚠ FIRST — creates the three separated roles
pnpm --filter @qmulate/database migrate:deploy # apply every migration in order (as qmulate_owner)
pnpm run db:seed                               # load the fixture (refuses unless fixture-only)
```

`migrate:deploy` is the correct command for a fresh or existing database in **every** environment including
your laptop. `migrate:dev` is only for authoring a new migration — and it has a sharp edge, see below.

### ⚠ FOUR CONNECTIONS, THREE DATABASE ROLES  (ADR-0008 round 6 — privilege separation)

The application no longer connects as the database owner, and that single fact is what closes ADR-0008's
central finding: a caller with any seat could previously forge itself a `NAZIR` `waqf_access_grant` through
`$executeRawUnsafe` on its own scoped Prisma client, because attacker and application shared one database
role and no trigger can observe who authored a row.

| env var | role | what it may do |
|---|---|---|
| `DATABASE_URL` | `qmulate_app` | **The request path.** `SELECT/INSERT/UPDATE` on the business tables; `SELECT` **only** on `waqf_access_grant` and `membership`; `INSERT` (never `UPDATE`/`DELETE`/`TRUNCATE`) on `audit_event`; `DELETE` on the five better-auth identity tables and nowhere else. **Owns nothing**, so no DDL, no trigger suspension, and no `SET session_replication_role`. |
| `ACCESS_MATRIX_DATABASE_URL` | `qmulate_provisioner` | The **one** narrow audited path that may mint or widen a seat: `provisionAccessGrant()` / `revokeAccessGrant()`. Its Prisma client is module-private and is never returned to a caller. **Grant admission is fully live on it** — it owns nothing either. |
| `MIGRATOR_DATABASE_URL` | `qmulate_owner` | `migrate deploy`/`dev`, the fixture seed, the two integration harnesses' scaffolding, one-off production bootstrap. Owns schema `public` and everything in it. **Must not be present in the web or worker service environment** — both call `assertNoPrivilegedDatabaseUrls()` at boot and refuse to start if it is. |
| `SUPERUSER_DATABASE_URL` | the platform superuser | `scripts/provision-db-roles.ts` **only**, once per environment. Bypasses GRANTs, ownership checks and `FORCE ROW LEVEL SECURITY` alike — so no "it was blocked" result obtained on it means anything. |

Missing privileged credentials **throw, naming the variable**; they never silently fall back to
`DATABASE_URL`. A privilege split that falls back is worse than none, because it looks done.

**Provisioning must run before the first `migrate deploy`.** Migration 10 applies the privilege matrix and
*tolerates* the roles being absent (a `RAISE NOTICE`, so `prisma migrate dev` still works on a virgin
cluster) — which means a database migrated too early is seeded, green and completely unenforced. The hard
failure lives in `test/authorization-plane-privilege.integration.test.ts`, which FAILS rather than skips.
Locally, `scripts/dev-postgres.ts` provisions on every start and injects all four URLs into its `--run`
child, with `DATABASE_URL` pointing at the least-privileged role.

### What a successful seed produces

1 Client · 3 Waqifs · **4 Waqfs (the four fixture endowments)** · 4 TrusteeshipDeeds · 6 Assets ·
1 Expropriation · 6 Beneficiaries · 2 BankAccounts · 5 Transactions · 1 NazirFee ·
1 Distribution + 2 line items · 8 ComplianceObligations + 8 ComplianceTasks · 4 GovernmentFilings ·
8 Users · 18 WaqfAccessGrants · 1 Membership · ~16 Settings · 1 AuditChainHead — **and an `audit_event` row for
every material write**, chained from a genesis `prevHash` of 64 zeroes.

The seed is **byte-deterministic**: fixture ids are used verbatim as primary keys, every derived id is a pure
function of fixture values, and every timestamp the fixture does not supply comes from a fixed `SEED_EPOCH`
plus an insertion ordinal. There is no `Date.now()`, no `new Date()` without an argument, no `Math.random()`,
no `cuid()`. That is what lets the integration suite pin the chain's final `rowHash` as a frozen constant. **If
you change the seed, that pinned hash changes** — re-pin it deliberately; do not "fix" the test by loosening it.

The seed is idempotent (upsert on fixed ids), so re-running it is safe.

---

## The residency guardrail

**Why the seed refuses.** QMULATE handles real Saudi family-waqf data — beneficiary identities, IBANs, deed
numbers, UBO records — subject to KSA data residency and the PDPL ([NFR-03](../../docs/product/brd/08-nonfunctional-requirements.md),
release gate **G-8**). Until a KSA-resident production environment exists, the only data permitted anywhere
near a Railway environment is the invented fixture. The guardrail is four layers; **three of them ship here**:

| Layer | Mechanism | Status |
|---|---|---|
| 1 · Env | `DATA_CLASSIFICATION` is required and zod-validated in `@qmulate/config`. The app **refuses to boot** without it. There is deliberately **no `SKIP_ENV_VALIDATION`**. | shipped |
| 2 · Seed flag | The seed exits non-zero unless `DATA_CLASSIFICATION` is exactly `fixture-only`. | shipped |
| 3 · Seed input | The input path is a **constant**, not an argument: `data/fixtures/sample-waqf.json`. Any other resolved realpath is refused. Plus content assertions — the fixture's `_readme` marker, the id pattern, `FAKE-*` external references, `@example.test` emails. | shipped |
| 4 · Importer | The first-client importer hard-fails on a non-KSA / non-production target ([BR-1106](../../docs/product/brd/06-functional-requirements.md)). | **E11 / S12 — not yet** |

Every refusal exits **1**, writes **zero rows**, and prints a message beginning with the literal
`SEED_REFUSED:` on stderr. Reproduce each one:

```bash
# refuses: wrong classification
DATA_CLASSIFICATION=production      pnpm --filter @qmulate/database db:seed

# refuses: not the permitted fixture
DATA_CLASSIFICATION=fixture-only SEED_FILE=/tmp/other.json \
                                    pnpm --filter @qmulate/database db:seed

# refuses: fixture marker stripped / non-fixture identifier present
DATA_CLASSIFICATION=fixture-only SEED_FILE=/tmp/doctored-copy.json \
                                    pnpm --filter @qmulate/database db:seed
```

CI runs these three as the **`residency-guardrail`** job and **fails the pipeline if any of them stops
refusing**. It also greps that the `DATA_CLASSIFICATION` check has not been deleted from the seed. If you are
tempted to relax one of these to unblock yourself: don't — reach for a fixture record instead. Extend
`data/fixtures/sample-waqf.json` with more invented rows; never point the seed at anything else, and never put
a real name, IBAN, or deed number anywhere in this repo.

---

## Migrations

Two directories, and **the order between them is load-bearing**:

| Directory | Origin | Contains |
|---|---|---|
| `00000000000000_init` | Prisma-generated | Every table, enum, index and FK. |
| `00000000000001_init_append_only_audit` | **hand-authored, never generated** | The five database-level controls + two integrity constraints Prisma cannot express. |

Prisma applies migration directories in **lexicographic order of their names**, so the generated init must sort
before the guards migration. The guards migration `ALTER`s tables it does not create, and it **fails loudly**
with a named error if the base tables are missing — a database with an unguarded `audit_event` must never be
mistaken for a healthy one.

### What the hand-authored migration installs

1. **Audit append-only guard** — `BEFORE UPDATE OR DELETE OR TRUNCATE` statement trigger on `audit_event`
   (gate G-1 / [NFR-04](../../docs/product/brd/08-nonfunctional-requirements.md)).
2. **Least-privilege runtime role** — `qmulate_app_runtime`, `INSERT`/`SELECT` only (defence in depth).
3. **Shart al-Waqif immutability** — `BEFORE UPDATE` row trigger on `waqf`, bypassable only by an approved
   reserved matter (CLAUDE.md Binding rule 1).
4. **Corpus / income guard** — the seven `transaction_*` CHECK constraints (Binding rule 1, ADR 0002).
5. **Document retention guard** — no hard delete inside the retention window
   ([NFR-07](../../docs/product/brd/08-nonfunctional-requirements.md) / [BR-702](../../docs/product/brd/06-functional-requirements.md)).
6. `setting_global_key_unique` — a partial unique index, because Postgres treats `NULL`s as distinct and
   `@@unique([waqfId, key])` alone does **not** stop duplicate global rows.
7. `audit_chain_head_singleton` — the chain head is pinned to `id = 1`.

Every statement is idempotent (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, `IF NOT EXISTS`, and a
`pg_constraint` existence check before each `ADD CONSTRAINT`). Running the whole file twice succeeds.

### How not to clobber it

> ⚠ **`prisma migrate dev` regenerates migration SQL from the schema. It does not know these guards exist and
> will not reproduce them.** A regenerated migration that silently drops the append-only trigger is a G-1
> failure that looks like a green build.

Rules:

- **Never edit `00000000000001_init_append_only_audit/migration.sql` by running a Prisma command.** Edit it by
  hand, as SQL.
- **When you change `schema.prisma`,** generate the *new* migration into its own directory that sorts **after**
  the guards migration, then re-apply the guards:
  ```sql
  SELECT qmulate_apply_guards();
  ```
  All table-dependent DDL lives inside that function precisely so re-application is one call. Any schema change
  that **recreates a guarded table** (`audit_event`, `audit_chain_head`, `waqf`, `transaction`, `document`,
  `setting`) *must* be followed by it, in the same migration.
- **Column names are Prisma camelCase; table names are snake_case singular via `@@map`.** Every column
  identifier in raw SQL must therefore be **double-quoted** — unquoted identifiers get folded to lower case by
  Postgres and will not match.
- **After any migration work, re-run the guard assertions** (`A1`–`A13` in the integration suite). They exist to
  catch exactly this class of regression.
- The playbook — including how the generated init migration is produced into `00000000000000_init` with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` — lives in
  [`prisma/sql/README.md`](prisma/sql/README.md).

### Migration 21 — the signable run (E6/S7)

`00000000000021_e6_distribution_run_digest` lands three things and **deliberately leaves five undone**. Read
the file's own header for the reasoning; this is the index.

| § | Lands | Why it is not a Prisma-generated migration |
|---|---|---|
| §0 | Two pre-flights that **name the offending rows** instead of dying on a bare `23505` / `22003` | A database already holding two live runs for one period is a **finding for a Nazir**, not something a migration picks a winner from |
| §1 | `distribution."engineVersion"`, `distribution."runDigest"` — `TEXT`, nullable, **no default**, plus `distribution_engine_version_not_blank` / `distribution_run_digest_not_blank` | The digest is what a Nazir signs and `ENGINE_VERSION` is a byte inside it. A default would make the **database** assert "the current engine produced this run" on behalf of nobody; `NULL` means *nobody recorded one* |
| §2 | `distribution_line_item."sharePercent"` widened `DECIMAL(9,4)` → `DECIMAL(9,6)` | The engine prints a **fixed six** decimals (`SHARE_PERCENT_SCALE = 6`); at scale 4 the last two were dropped on the way in. **No halala ever moved** — the figure is display-only — but the percentage a beneficiary reads stopped matching the run's own trace at the 5th decimal |
| §3 | `distribution_one_live_run_per_period` — **PARTIAL** unique on `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'` | Prisma has no `where` on `@@unique`. **Partial** because §08's correction path is a *new* run with the old one retired as `CANCELLED`; a total index would make that path unrepresentable |

Measured on a `--reset` → `provision-db-roles` → `migrate:deploy` → `db:seed` cluster, 2026-08-18: at `(9,4)`
`33.333333` stored as `'33.3333'`; at `(9,6)` as `'33.333333'`. Re-applying the whole file twice more raised
nothing, did **not** rewrite the heap (`pg_relation_filenode` unchanged) and did **not** recreate the index.

**It does not call `SELECT qmulate_apply_guards()`, and that is a measurement rather than an omission.** §2's
`ALTER COLUMN … TYPE` rewrites the heap of `distribution_line_item` and rebuilds its indexes, but keeps the
same relation, its constraints and its triggers — and that table is not in the guarded set the function covers.
`test/distribution-run-schema.integration.test.ts` §4 takes that measurement on every run: all six triggers
across `distribution` / `distribution_line_item` still present at `tgenabled = 'A'`, both migration-19 composite
foreign keys still biting, the status lattice still terminal at `EXECUTED`, `distribution_line_item_no_delete`
still firing — **each pinned to its own constraint or guard message, and each with a positive control.**

> ⚠ **Three consequences for anyone writing against `distribution` after this migration.**
> 1. Anything keyed on `(waqfId, period)` now **collides on a second attempt** — a retry, or a Playwright spec
>    that runs once per locale project against one database. Nonce-derive the period.
> 2. `engineVersion` / `runDigest` are **not write-once.** `distribution_status_transition` fires only when the
>    *status* changes, so `UPDATE … SET "runDigest" = …` on an `EXECUTED` run commits. Measured, not assumed
>    (that test file, §5). The seal is recommended as migration 22, once the write order is shipped.
> 3. The two columns are **not paired.** `("engineVersion" IS NULL) = ("runDigest" IS NULL)` is the right
>    invariant and is held back for the same reason.

**Owed to `test/setup.ts`, which no S7 stage owns** — until these land, the three new objects are pinned by name
in `distribution-run-schema.integration.test.ts` and nowhere else, so `assertGuardsInstalled()` will **not** fail
a database that lacks them:

- `REQUIRED_UNIQUE_INDEXES` += `distribution_one_live_run_per_period`;
- `REQUIRED_CHECK_CONSTRAINTS` += `distribution_engine_version_not_blank`, `distribution_run_digest_not_blank`;
- `GuardCondition` += `'unique_violation'` (`23505`), which would delete that file's local `uniqueProbeSql`.

---

## The client extensions — and one loaded footgun

Composition order is **required** and is asserted by a test:

```ts
base.$extends(audit).$extends(scoping).$extends(encryption)
```

Encryption is **outermost** so it encrypts arguments first; audit is **innermost** so it records ciphertext and
never plaintext ([§12](../../docs/product/prd/12-security-audit-retention-spec.md)). Results unwind in reverse,
so callers still get plaintext back.

- **`createScopedPrisma(ctx: ActorContext)`** — build **one per request** (in the tRPC context). Applies the
  per-endowment force-filter, beneficiary self-isolation, and the AML compartment. **Fail-closed:** with no
  actor context it filters to `{ id: { in: [] } }` — an empty set, never the full table.
- **`withAudit(ctx, fn)`** — the **only** sanctioned write path for audited models. Opens the interactive
  transaction; the business write and its `audit_event` row commit or roll back together. `createMany`,
  `updateMany`, `deleteMany` and `delete` are refused at runtime on audited models (no reliable per-row
  before/after), as are raw `$executeRaw` mutations outside this package.
- **`withReservedMatter(db, ctx, approvalRequestId, waqfId, fn)`** — the **only** way to amend a
  `shartAlWaqif`. Verifies the approval is `RESERVED_MATTER` + `APPROVED`, for the right waqf, with
  `checkerId` set and `checkerId ≠ makerId`, before setting the transaction-local GUC. In Sprint 1 no workflow
  can produce such an approval — the hatch ships closed (see ADR 0003 §5.3).

### ⚠ `systemPrisma` bypasses scoping

The package also exports an **unscoped** client for migrations, jobs, and the seed. It has **no force-filter**:
a `findMany` on it returns rows for *every* endowment, and a write on it is not checked against
`authorizedWaqfIds`.

- **Never** reach for it in `packages/api`, `apps/web`, or anything that runs inside a request. If a query
  "doesn't return the row," the answer is almost always that the caller genuinely lacks the grant — fix the
  grant, do not switch clients.
- Legitimate callers: the fixture seed, migration scripts, and system jobs in `apps/worker` that operate
  across endowments by design (chain verification, deadline sweeps). Each must still pass an
  `ActorContext` with `actorType: 'SYSTEM'` and an explicit `bypass` so the bypass is **recorded in the audit
  trail** rather than being invisible.
- It bypasses the *scoping* extension. It does **not** bypass the database triggers — `audit_event` is still
  append-only and `shartAlWaqif` is still immutable, whatever client you hold.

---

## Scripts

| Script | Does |
|---|---|
| `generate` / `build` | `prisma generate` → `prisma/generated/client` (explicit output: pnpm-safe and turbo-cacheable). |
| `migrate:deploy` | Apply pending migrations. Use this everywhere, including locally. |
| `migrate:dev` | **Authoring only.** Read [How not to clobber it](#how-not-to-clobber-it) first. |
| `db:seed` / `seed` | Load the fixture. Refuses unless `DATA_CLASSIFICATION=fixture-only`. |
| `test` | `vitest run` — canonicalization frozen vectors, guardrail units, extension behaviour. |
| `lint` / `typecheck` | `eslint .` / `tsc --noEmit`. |

Nothing else imports `@prisma/client` directly — the generated client is re-exported from `src/index.ts`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Boot fails naming `DATA_CLASSIFICATION` | The variable is missing or misspelled. Working as designed — there is no escape hatch. |
| `SEED_REFUSED: …` | One of the three guardrail layers fired. The message names which. |
| `QMULATE constraints migration ran BEFORE the Prisma-generated init migration` | Directory ordering. The generated init must sort before `00000000000001_…`. |
| `SQLSTATE 42501 … append-only` | You tried to `UPDATE`/`DELETE`/`TRUNCATE` `audit_event`. This is the guarantee, not a bug. |
| `SQLSTATE 42501 … shart_al_waqif is immutable` | A `shartAlWaqif` change outside `withReservedMatter`. Also the guarantee. |
| A `transaction_*` CHECK violation | A receipt was written without a coherent income/capital classification. See [ADR 0002 §4](../../docs/decisions/ADR-0002-receipt-income-capital-classification.md). |
| Chain verification fails after a seed change | Expected — re-pin the frozen `rowHash` deliberately. |
| Queries return nothing under a scoped client | Almost always a missing `WaqfAccessGrant`. Fix the grant; do **not** reach for `systemPrisma`. |
