#!/usr/bin/env tsx
/**
 * QMULATE — provision the three separated database roles.  (ADR-0008 round 6)
 *
 *   pnpm exec tsx scripts/provision-db-roles.ts
 *
 * Run ONCE per environment, on the PLATFORM SUPERUSER credential (`SUPERUSER_DATABASE_URL`):
 * Railway's `postgres`, CI's service-container superuser, the embedded cluster's `qmulate`. It
 * creates `qmulate_app`, `qmulate_provisioner` and `qmulate_owner`, hands ownership of schema
 * `public` and everything in it to `qmulate_owner`, and calls `qmulate_apply_privilege_matrix()`.
 *
 * ── ORDER MATTERS, ON A FRESH DATABASE ───────────────────────────────────────────────────────
 *   1. this script            (roles must exist BEFORE migration 10 runs, or its matrix — which
 *                              tolerates their absence with a NOTICE — silently does nothing)
 *   2. prisma migrate deploy  (as MIGRATOR_DATABASE_URL; migration 10 applies the matrix)
 *   3. db:seed                (as MIGRATOR_DATABASE_URL; provisioning writes need the owner)
 *
 * It is idempotent and safe to re-run at any point; re-running after step 2 repairs the ownership
 * of anything a migration created under a different role.
 *
 * ── WHY THE IMPLEMENTATION IS NOT IN THIS FILE ───────────────────────────────────────────────
 * It needs a Postgres driver, and `pg` is a devDependency of `@qmulate/database` — module resolution
 * for a root-level script would not find it. The logic therefore lives in
 * `packages/database/src/provision-roles.ts` (which resolves `pg` from its own package) and this is
 * the entry point. `scripts/dev-postgres.ts` imports the same module.
 */

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import '@qmulate/config/load-env';

const HERE = dirname(fileURLToPath(import.meta.url));
const IMPLEMENTATION = join(HERE, '..', 'packages', 'database', 'src', 'provision-roles.ts');

interface ProvisionModule {
  provisionFromEnvironment: (log?: (line: string) => void) => Promise<string[]>;
}

async function main(): Promise<number> {
  const module = (await import(pathToFileURL(IMPLEMENTATION).href)) as ProvisionModule;

  try {
    const changes = await module.provisionFromEnvironment();
    console.log('');
    if (changes.length === 0) {
      console.log('[provision] posture already in place — no changes.');
    } else {
      console.log('[provision] changed:');
      for (const change of changes) console.log(`  • ${change}`);
    }
    console.log('');
    console.log(
      '[provision] NEXT: `pnpm --filter @qmulate/database run migrate:deploy` (which reads ' +
        'MIGRATOR_DATABASE_URL), then `pnpm run db:seed`. Nothing is enforced until migration 10 ' +
        'has run against these roles — assert it with ' +
        '`pnpm --filter @qmulate/database test:integration` ' +
        '(authorization-plane-privilege.integration.test.ts fails, never skips).',
    );
    return 0;
  } catch (error: unknown) {
    // Deliberately the message only — these are connection strings with passwords in them, and the
    // rule in `packages/config/src/env.ts` is that a failure names variables, never values.
    console.error(`[provision] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main();
