# Cumulate App

**Cumulate App** is the operations platform QMULATE (a Saudi wealth-governance and real-estate
advisory firm) uses to act as professional *Nazir* — the court/Awqaf-Authority-recognised trustee —
for family waqf endowments. It records endowments, deeds, beneficiaries and lineage, income and
corpus, distributions under maker/checker approval, compliance obligations and filings, and keeps
an append-only, hash-chained audit trail of everything.

Product context: `docs/product/` (one-pager, positioning, BRD, PRD). Domain reference:
`docs/domain/`. Engineering decisions: `docs/decisions/` (ADRs). Build history and status:
`docs/product/prd/BUILD-PLAN.md`.

> The firm is QMULATE; the product is Cumulate App. Package scopes (`@qmulate/*`), database role
> names (`qmulate_*`) and environment variable names are internal identifiers and are unchanged.

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router) operations app — Arabic-first, RTL, `ar`/`en` |
| `apps/worker` | pg-boss job worker (deadline engine, notifications) — long-running process |
| `apps/mobile` | Expo client/beneficiary portal (Phase 2 scaffold) |
| `packages/database` | Prisma schema, 54 hand-authored migrations, the fixture seed, the audit/scoping/encryption extensions, role provisioning |
| `packages/api` | tRPC v11 routers and the authorization ladder |
| `packages/auth` | better-auth (email + password, mandatory TOTP), role catalogue, session gate |
| `packages/domain` | Pure engines: distribution, compliance, dates (Hijri/business days), access presets |
| `packages/config` | Fail-fast env schema and the residency guardrail |
| `packages/ui`, `packages/i18n` | Design tokens/components and the `ar`/`en` catalogues |
| `scripts/` | Embedded local Postgres, role provisioning, E2E harness |

## Local development

Requirements: Node ≥ 22, pnpm 10 (`corepack enable`). No Docker is needed — local Postgres is
embedded.

```bash
pnpm install
cp .env.example .env                 # fixture-only values; never commit .env
pnpm db:generate                     # Prisma client — re-run after moving the checkout

# Fresh local cluster → migrations → fixture seed → web app on http://localhost:3000
pnpm exec tsx scripts/dev-postgres.ts --name manual --port 54460 --reset --run \
  "pnpm --filter @qmulate/database run migrate:deploy && pnpm run db:seed && \
   pnpm exec cross-env MIGRATOR_DATABASE_URL= SUPERUSER_DATABASE_URL= PGBOSS_DATABASE_URL= pnpm --filter web dev"
```

`dev-postgres` injects five separated connection strings; the web app refuses to boot while it
holds the owner, superuser or queue credential, which is why the last command blanks them.
Seeded operators (`*@example.test`) share the published fixture password in
`packages/database/src/seed/credentials.ts` and must enrol TOTP on first sign-in.

### The local development administrator (fixture-only)

`pnpm db:dev-admin` provisions the account named by `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` in
`.env`: every internal-ops seat on every endowment, TOTP enrolled through better-auth (the URI and
backup codes land in the gitignored `.dev-admin.local.json`), and — **only while
`DATA_CLASSIFICATION=fixture-only`** — an exemption from the TOTP gate, the sign-in challenge,
step-up freshness, and (via a per-database setting only the database owner can write) the
maker≠checker rule for its own requests. None of this exists unless those variables are set in that
classification; the cloud deployment sets neither.

## Production / cloud architecture

| Concern | Choice |
|---|---|
| Hosting (web) | Vercel — Next.js, root directory `apps/web`, pnpm workspace install at the repo root |
| Database | Supabase Postgres (project `cumulate-app`, region `ap-south-1`) |
| Worker | Needs a long-running host (Railway or similar); not deployable on Vercel |
| Data classification | `fixture-only` + `DATA_RESIDENCY=non-ksa` — see below |

### Why the cloud deployment is `fixture-only`

`packages/config/src/env.ts` refuses to boot with `DATA_CLASSIFICATION=production` unless
`DATA_RESIDENCY=ksa` (NFR-03: real client data never leaves KSA-resident infrastructure — a legal
posture, not a deployment assumption). Neither Supabase nor Vercel offers a KSA region, so this
deployment is honestly declared `fixture-only` / `non-ksa`: **the complete application runs — every
module, role, approval and financial workflow — but only invented data may enter it** (the intake
enforces the fixture identifier grammar). Moving to `production` means moving the database and the
runtime to KSA-resident infrastructure and running the first-client importer
(`packages/database/src/import.ts`), which itself requires `production` + `ksa`.

### Database connections (privilege separation, ADR-0008)

Five roles, one per credential, provisioned once per environment (`scripts/provision-db-roles.ts`,
or the equivalent SQL on a managed platform):

| Variable | Role | Used by | Supabase form |
|---|---|---|---|
| `DATABASE_URL` | `qmulate_app` (least privilege) | web runtime | transaction pooler `:6543`, `?pgbouncer=true&connection_limit=1` |
| `ACCESS_MATRIX_DATABASE_URL` | `qmulate_provisioner` | web: seat issuance, approval decisions | transaction pooler `:6543` |
| `MIGRATOR_DATABASE_URL` | `qmulate_owner` (owns the schema) | `migrate deploy`, seed, importer — **never a web/worker env** | session pooler `:5432` |
| `PGBOSS_DATABASE_URL` | `qmulate_pgboss` (owns schema `pgboss` only) | worker only — web refuses it | session pooler `:5432` |
| `SUPERUSER_DATABASE_URL` | platform credential | role provisioning only | not stored anywhere long-lived |

Pooler usernames take the `role.<project-ref>` form; provisioning strips the tenant suffix. All
URLs carry `sslmode=require`.

### Required environment variables (web runtime)

`DATABASE_URL`, `ACCESS_MATRIX_DATABASE_URL`, `DATA_CLASSIFICATION`, `DATA_RESIDENCY`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`,
`FIELD_ENCRYPTION_KEYS` (`{"<id>":"<base64 32 bytes>"}`), `FIELD_ENCRYPTION_ACTIVE_KEY`,
`FIELD_HMAC_KEY`, `NODE_ENV=production`. Optional: `SMTP_*` (email OTP), `SESSION_IDLE_MINUTES`,
`LOG_LEVEL`. **Never** in a web/worker environment: `MIGRATOR_DATABASE_URL`,
`SUPERUSER_DATABASE_URL`, `DEV_ADMIN_*`, `TEST_ONLY_*`. The full annotated list is `.env.example`.
Generate fresh keys per environment — the fixture keys in `.env.example` are public.

### Migrations

Migrations are hand-authored SQL under `packages/database/prisma/migrations` and are applied with
`pnpm --filter @qmulate/database run migrate:deploy` **from a migration step, never from the Vercel
build** (the build has no owner credential by design). Run it from CI or an operator machine with
`MIGRATOR_DATABASE_URL` pointing at the session pooler; the Prisma client is generated during the
Vercel build from the schema alone.

### Deploying a schema change

`git push origin main` builds and deploys the web app on Vercel, but it does **not** migrate the
database (the build holds no owner credential by design). Apply migrations from an operator
machine before or right after the deploy, then verify:

```bash
pnpm exec cross-env-shell "MIGRATOR_DATABASE_URL=$MIGRATOR_DATABASE_URL pnpm --filter @qmulate/database run migrate:deploy"
pnpm --filter @qmulate/database exec tsx scripts/migrate.ts status
```

### Bootstrapping seats

Authority cannot authorise its own first instance: the first `admin:access_matrix:write` seat is
laid down on the owner connection. On a fixture-only environment that is the deterministic seed
(`pnpm run db:seed`, exactly as CI staging does); on a KSA production environment it is the
importer. Real users then sign up, enrol TOTP, and are seated through `grant.activate` by an
established administrator.

## The organisation layer: registration, access levels, the primary administrator (migration 55)

Endowment data is reached only through a per-endowment seat (`waqf_access_grant`), exactly as
before. Above it sits an organisation layer, stored as data:

| Piece | Where | Meaning |
|---|---|---|
| `user.status` | `user` | `PENDING_APPROVAL` (every new sign-up) → `ACTIVE` / `REJECTED` / `DISABLED`, decided by an administrator |
| `user.isPrimaryAdmin` | `user` | the account the database will never let be demoted, disabled or deleted while it is the last active one |
| `access_level` | table | ADMIN, OWNER, MANAGER, USER, CUSTOM (+ any created later): organisation-scope permissions and the seat template issued when its holders are seated |
| `user_permission_override` | table | per-user ALLOW / DENY on one organisation permission, on top of the level (withdrawn rows are stamped, never deleted) |

Organisation-scope permissions are the closed list in `ORG_SCOPE_PERMISSIONS`
(`packages/domain/src/access.ts`): user management, levels, seating, settings, the audit trail. No
approval verb can be written into a level — approve/sign stay with the Nazir seat (ADR-0004,
BR-105). The database evaluates the same rule (`qmulate_actor_holds_org_permission`) that the API
evaluates (`resolveOrgPermissions`), and the grant-admission trigger accepts an organisation-wide
`admin:access_matrix:write` holder as an issuer; nobody may seat themselves.

Screens: **Users** (`/users`, requests → approve/reject, level, overrides, seats, password reset),
**Roles & Permissions** (`/roles`, the full matrix, editable), **Audit Log** (`/audit-log`), plus the
cross-endowment registers Beneficiaries & UBO, Compliance, Calendar and Documents. The sidebar
shows only the sections the caller may see (`whoami.sections`); every page and procedure enforces
its own permission regardless.

Designating the primary administrator (once per environment, after the person has signed up and
enrolled their second factor; needs `ACCESS_MATRIX_DATABASE_URL`):

```bash
pnpm admin:primary <email>
```

## Tests

```bash
pnpm turbo run lint typecheck test          # unit
pnpm exec tsx scripts/dev-postgres.ts --name itest --port 54470 --reset --run \
  "pnpm --filter @qmulate/database run migrate:deploy && pnpm run db:seed && pnpm turbo run test:integration"
pnpm test:e2e:local-fixture-only            # Playwright, production build
```

## Binding rules

The domain invariants, the bilingual glossary, the regulatory-figure staleness rule and the
decision boundary in `CLAUDE.md` apply to every change. Real client material under
`archive/raw-intake/` is confidential and never enters fixtures, tests, docs or UI copy.
