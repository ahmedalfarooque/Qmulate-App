# `scripts/`

Repo-level utilities that are **not** part of any workspace package. Nothing here is
imported by application code, and nothing here runs in CI unless a workflow calls it
explicitly.

| Script | Runtime | What it does |
| --- | --- | --- |
| `dev-postgres.ts` | Node 22 + `tsx` | Starts a throwaway local PostgreSQL for development. No Docker, no system Postgres, no root. |
| `e2e-local-fixture-only.ts` | Node 22 + `tsx` | ⊕ S11-2 — the LOCAL E2E LEG as one artifact (`pnpm test:e2e:local-fixture-only`): cold `.next`, `CI=1`, the fail-closed rate-limit test override, the documented `dev-postgres --reset --run "…"` chain with the `env -u` flags in place; REFUSES when `DATA_CLASSIFICATION` is set to anything but `fixture-only`. The exit code is the verdict. |
| `brand/build_qmulate_brand.py` | Python 3 (Pillow, reportlab) | Pre-existing brand-book/asset generator. Unrelated to the monorepo build. |

---

## `provision-db-roles.ts` — the three separated database roles  (ADR-0008 round 6)

```bash
pnpm exec tsx scripts/provision-db-roles.ts
```

Run **once per environment**, on the PLATFORM SUPERUSER credential (`SUPERUSER_DATABASE_URL`). It creates
`qmulate_app`, `qmulate_provisioner` and `qmulate_owner` — all `NOSUPERUSER NOBYPASSRLS NOCREATEROLE`, none
a member of another — hands ownership of schema `public` and every table, function, sequence and enum type
in it to `qmulate_owner`, and calls `qmulate_apply_privilege_matrix()`.

It is idempotent, and the **order matters on a fresh database**:

```
1. provision-db-roles.ts      roles must exist BEFORE migration 10 runs
2. migrate:deploy             as MIGRATOR_DATABASE_URL; migration 10 applies the matrix
3. db:seed                    as MIGRATOR_DATABASE_URL (step 18 lays the first admin seat)
```

⚠ **Migration 10 tolerates the roles being absent, degrading to a `RAISE NOTICE`** — a hard failure there
would break `prisma migrate dev` on a virgin cluster. So a database migrated before this script ran is
migrated, seeded and **green over a completely unenforced privilege matrix**. The hard failure lives in
`packages/database/test/authorization-plane-privilege.integration.test.ts`, which FAILS (never skips) when
the posture is absent, and CI runs it.

⚠ **Why it is a script and not a migration:** `CREATE ROLE` needs `CREATEROLE` and `ALTER … OWNER TO` needs
to already be the owner. The migrator must hold neither — a migrator that can create roles can create
itself a superuser. The implementation lives in `packages/database/src/provision-roles.ts` because it needs
`pg`, which resolves from that package rather than from the repo root; this file is the entry point and
`dev-postgres.ts` imports the same module.

**Staging/production is a manual step**, deliberately not wired into CI: putting a platform-superuser
connection string into a pull-request job would be a worse exposure than the one privilege separation
removes. See the note on the "Apply migrations on staging" step in `.github/workflows/ci.yml`.

---

## `dev-postgres.ts` — throwaway local PostgreSQL

### Why it exists

CI runs the database jobs against a real `postgres:16-alpine` **service container**
(`.github/workflows/ci.yml` → `integration`, `residency-guardrail`, `e2e`). Locally, the
development machine has **neither Docker nor a system PostgreSQL**, so `prisma migrate dev`,
the fixture seed, the append-only audit triggers and the `pg_advisory_xact_lock` work would
have nothing to talk to.

This script starts a private, disposable cluster from the
[`embedded-postgres`](https://www.npmjs.com/package/embedded-postgres) npm package — genuine
PostgreSQL binaries unpacked into a data directory under `.pgdata/` (already gitignored). It
needs no daemon, no container runtime and no elevated privileges.

> **It is not a substitute for CI.** Server-version parity with the CI container is
> best-effort (see [Version parity](#version-parity) below). Anything that depends on server
> behaviour — trigger semantics, advisory locks, collation, `jsonb` ordering — is only
> **green when CI says so**. Use this to iterate quickly, not to sign anything off.

### Install (orchestrator action required)

The script is written but its dependency is **not** in `package.json` — that file is owned by
another agent. Add it as a **root devDependency**:

```bash
pnpm add -Dw embedded-postgres
```

Notes for whoever runs that:

- **Version.** The package's major version tracks the PostgreSQL major it ships. Prefer the
  **`16.x` line** so local matches CI's `postgres:16-alpine`; if only `17.x` is published,
  take it and record the mismatch in [Version parity](#version-parity). *(I could not run an
  installer, so the exact published version range is unverified — check `pnpm view
  embedded-postgres versions` before pinning.)*
- **Platform binary.** The real PostgreSQL build arrives through an optional dependency
  (`@embedded-postgres/darwin-arm64`, `@embedded-postgres/linux-x64`, …). pnpm resolves it
  automatically; it must not be added by hand.
- **pnpm 10 blocks postinstall scripts.** If the install reports a blocked build script for
  this package, add `embedded-postgres` to `onlyBuiltDependencies` in `pnpm-workspace.yaml`
  (and the mirrored `pnpm` block in the root `package.json`), alongside `prisma`,
  `@prisma/client`, `esbuild` and `sharp`.
- **`tsx` is already a root devDependency**, so no separate TypeScript runner is needed.

An optional convenience script for the root `package.json` (also not mine to add):

```json
{
  "scripts": {
    "db:dev": "tsx scripts/dev-postgres.ts start",
    "db:dev:stop": "tsx scripts/dev-postgres.ts stop"
  }
}
```

### Usage

```bash
# Start it and keep it in the foreground. Provisions the three separated roles and prints all
# four connection strings. Ctrl-C shuts down cleanly.
pnpm exec tsx scripts/dev-postgres.ts start

# Is anything running?
pnpm exec tsx scripts/dev-postgres.ts status

# Shut down a cluster left behind by a previous session (works even after a hard kill).
pnpm exec tsx scripts/dev-postgres.ts stop

# Start → provision the three roles → run one command with all FOUR connection strings
# injected (DATABASE_URL = the LEAST-privileged role, qmulate_app) → stop. Exit code propagated.
pnpm exec tsx scripts/dev-postgres.ts --run "pnpm --filter @qmulate/database run migrate:dev"
pnpm exec tsx scripts/dev-postgres.ts --run "pnpm --filter @qmulate/database run seed"
pnpm exec tsx scripts/dev-postgres.ts --run "pnpm turbo run test:integration"

# Throw the local database away and rebuild it from migrations + fixture.
pnpm exec tsx scripts/dev-postgres.ts --reset \
  --run "pnpm --filter @qmulate/database run migrate:deploy && pnpm --filter @qmulate/database run seed"
```

### Flags

| Flag | Default | Notes |
| --- | --- | --- |
| `--run "<command>"` | — | Start, run, stop. The command runs through a shell, so pipes and `&&` work. |
| `--port <n>` | `54329` (`QMULATE_PG_PORT`) | Deliberately **not** 5432 — see below. |
| `--name <cluster>` | `qmulate-dev` (`QMULATE_PG_NAME`) | Directory under `.pgdata/`. Several clusters can coexist. |
| `--database <name>` | `qmulate_dev` | Created on first start; reused afterwards. |
| `--user` / `--password` | `qmulate` / `qmulate` | Throwaway loopback credentials. Never reuse them. |
| `--data-dir <path>` | `.pgdata/<name>` | Must resolve inside `.pgdata/` — a guard against `--reset` on a mistyped path. |
| `--reset` | off | **Deletes the data directory.** Destroys the local database. |
| `--keep` | off | With `--run`: leave the cluster up afterwards. Ignored if you Ctrl-C. |
| `--verbose` | off | Forward the PostgreSQL server log to stdout. |

**Why port 54329 and not 5432.** A developer may also have a system PostgreSQL, a Docker
PostgreSQL, or a second checkout. Binding the default port risks a migration running against
the wrong database, which is a much worse failure than "connection refused".

### Behaviour worth knowing

- **`start` runs in the foreground.** It prints the URL and holds the cluster open until
  Ctrl-C. That keeps the lifetime visible; there is no hidden background daemon.
- **`stop` needs no npm package.** It reads `postmaster.pid` from the data directory and
  signals the postmaster directly, so it can rescue a cluster whose supervising Node process
  was `SIGKILL`ed. `status` is the same — only `start` and `--run` need `embedded-postgres`.
- **Shutdown uses `SIGINT` (PostgreSQL "fast shutdown"), not `SIGTERM`.** `SIGTERM` is
  *smart* shutdown, which waits for every client to disconnect and can hang indefinitely
  behind a forgotten `psql` session. After 20 s it escalates to `SIGQUIT` (immediate); the
  cluster then runs crash recovery on the next start and no committed data is lost.
- **Ctrl-C is safe at any point.** During `--run` the signal is forwarded to the child, the
  child's exit is awaited, and the cluster is stopped in a `finally`. A second Ctrl-C
  `SIGKILL`s the child.
- **The data directory persists between runs** so migrations and seed data survive.
  `--reset` is the explicit way to discard it.
- **Already-initialised is the normal case.** The script probes for `PG_VERSION` and skips
  `initdb` rather than letting it fail. A directory that exists, is non-empty and has no
  `PG_VERSION` (an interrupted `initdb`) is reported with an instruction to use `--reset`.

### Residency guardrail (NFR-03 / release gate G-8)

A cluster in a scratch directory on a laptop is, by definition, **not KSA-resident production
infrastructure**. So the script:

- **refuses to run** `start` or `--run` when `DATA_CLASSIFICATION=production` is exported in
  the shell, and
- **pins `DATA_CLASSIFICATION=fixture-only`** in the child environment when the variable is
  unset, printing a line saying it did so.

`fixture-only` is the strictest legal value, so this can only ever tighten the guard, never
widen it. The only data any command run through this harness may touch is
`data/fixtures/sample-waqf.json`.

### Version parity

| | Local (`dev-postgres.ts`) | CI |
| --- | --- | --- |
| Server | `embedded-postgres` binaries | `postgres:16-alpine` service container |
| Started by | this script | GitHub Actions `services:` |
| Data | `.pgdata/<name>/` (gitignored, persists) | fresh container per job |
| Classification | `fixture-only` (pinned) | `fixture-only` (workflow-level `env`) |

Keep the two majors aligned. If they drift, say so here and treat any server-behaviour
assertion — the append-only `audit_event` triggers above all — as **unproven until CI runs
it**.

### Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `embedded-postgres is not installed` | Run the install step above. `stop` and `status` still work without it. |
| `A cluster is already running` | `dev-postgres.ts stop`, or reuse the printed URL. |
| `exists, is not empty, and has no PG_VERSION` | An interrupted `initdb`. Re-run with `--reset`. |
| Port already in use | Another Postgres holds it — `--port <n>`, or stop the other one. |
| `no constructor was found on the module` | `embedded-postgres` changed its export shape; update `loadEmbeddedPostgres()`. |
| Cluster orphaned after a crash | `dev-postgres.ts stop` — it works from the pid file alone. |
