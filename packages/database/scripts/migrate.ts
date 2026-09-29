#!/usr/bin/env tsx
/**
 * QMULATE — run the Prisma migrate CLI on the MIGRATOR connection.  (ADR-0008 round 6)
 *
 *   pnpm --filter @qmulate/database run migrate:deploy
 *   pnpm --filter @qmulate/database run migrate:dev
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A WRAPPER AND NOT A SHELL ENV PREFIX
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The Prisma CLI reads its connection string from the `datasource` block, which names
 * `env("DATABASE_URL")` — and `prisma migrate deploy` has NO `--url` flag. Since privilege
 * separation, `DATABASE_URL` points at `qmulate_app`, which owns nothing and can run no DDL. So the
 * migrate commands have to run with `DATABASE_URL` OVERRIDDEN from `MIGRATOR_DATABASE_URL`.
 *
 * `DATABASE_URL=$MIGRATOR_DATABASE_URL prisma migrate deploy` would do it on a POSIX shell, but the
 * same string has to work on Windows, under `railway run`, and in a `pnpm` script that CI invokes —
 * and a prefix that silently expands to an empty value there would run migrations as the app role.
 * A wrapper is one file and behaves identically everywhere.
 *
 * ── THE FALLBACK IS SAFE BECAUSE IT FAILS CLOSED ─────────────────────────────────────────────
 * With no `MIGRATOR_DATABASE_URL` set, this passes `DATABASE_URL` through unchanged. On a
 * privilege-separated database that means the migration runs as `qmulate_app` and dies on its FIRST
 * DDL statement with a loud `42501`, naming the table. That is a better failure than inventing a
 * connection string or silently doing nothing, and it keeps this script usable on a legacy database
 * where the app role IS still the owner.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    '[migrate] no prisma subcommand given. Usage: tsx scripts/migrate.ts deploy|dev [flags]',
  );
  process.exit(2);
}

const migrator = process.env.MIGRATOR_DATABASE_URL?.trim();
const env: NodeJS.ProcessEnv = { ...process.env };

if (migrator !== undefined && migrator !== '') {
  env.DATABASE_URL = migrator;
  console.log('[migrate] using MIGRATOR_DATABASE_URL (qmulate_owner) as DATABASE_URL for the CLI.');
} else {
  console.warn(
    '[migrate] MIGRATOR_DATABASE_URL is not set — falling back to DATABASE_URL as-is.\n' +
      '  Since ADR-0008 round 6 DATABASE_URL is the LEAST-privileged role (qmulate_app), which owns\n' +
      '  no table and can run no DDL. If this run fails with 42501 "must be owner of", that is why:\n' +
      '  run `pnpm exec tsx scripts/provision-db-roles.ts` and set MIGRATOR_DATABASE_URL.',
  );
}

// `prisma` resolves from this package's own node_modules; `pnpm exec` finds it without a path.
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(packageManager, ['exec', 'prisma', 'migrate', ...args], {
  stdio: 'inherit',
  env,
  // Node >=18.20.2 refuses to spawn .cmd/.bat files without a shell (EINVAL).
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[migrate] could not spawn the Prisma CLI: ${String(result.error)}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
