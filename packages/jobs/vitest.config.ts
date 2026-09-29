import { defineConfig } from 'vitest/config';

/**
 * QMULATE — `@qmulate/jobs` test configuration.
 *
 * ⚠ THIS FILE (and the package's `test` script) DID NOT EXIST BEFORE E2 — `scripts` were `lint` +
 * `typecheck` only, so CI's "every packages/* workspace defines a `test` script" gate had nothing
 * to run here and the job vocabulary shipped with no assertions at all.
 *
 * TWO SUITES, ONE CONFIG, SELECTED BY `--mode` — the same split `@qmulate/database` uses, adopted
 * in S10/T1 when the pg-boss transport landed (this header used to read "the pg-boss transport is
 * S9/E8, and when it lands it needs its own integration mode" — it landed, and it did):
 *
 *   vitest run                     UNIT ONLY — the interface and the in-memory queue; no
 *                                  database, no network.
 *   vitest run --mode integration  UNIT + INTEGRATION — the pg-boss transport against a real
 *                                  Postgres, connecting as `qmulate_pgboss` via
 *                                  `PGBOSS_DATABASE_URL` into the `pgboss` schema it owns.
 *
 * Integration files are named `*.integration.test.ts` and EXCLUDED from the unit run, so a
 * missing database can never make an integration assertion silently disappear from a suite that
 * claims to have run it. They guard themselves with `describe.skipIf` + a loud warning — a
 * skipped structural-dedupe proof is NOT a proven one.
 *
 * ⚠ CROSS-PACKAGE SERIALIZATION: this package's integration suite is the THIRD in the monorepo,
 * and the shared-database warning in `packages/database/vitest.config.ts` applies. Its ordering
 * edge lives in `turbo.json` (`@qmulate/jobs#test:integration` depends on
 * `@qmulate/api#test:integration`), which CI's task-graph gate verifies — the suites run
 * database → api → jobs, never concurrently. The pgboss schema is not the audit chain, but it is
 * the same cluster, and "probably disjoint enough" is how 40P01 happened the first time.
 */
const ALWAYS_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.turbo/**'];

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude:
      mode === 'integration' ? ALWAYS_EXCLUDE : [...ALWAYS_EXCLUDE, '**/*.integration.test.ts'],
    globals: false,
    restoreMocks: true,
    // One process, one file at a time in integration mode: every file talks to the ONE pgboss
    // schema on the ONE cluster, and pg-boss's own maintenance loops make concurrent instances
    // from parallel files an ordering lottery.
    ...(mode === 'integration'
      ? {
          fileParallelism: false,
          pool: 'forks' as const,
          poolOptions: { forks: { singleFork: true } },
        }
      : {}),
    // Every payload carries a canonical UTC ISO-8601 `asOf` and the handler context's `now` is
    // injected; TZ is pinned anyway so an assertion cannot pass or fail by the developer's
    // geography.
    env: { TZ: 'UTC' },
    testTimeout: 30_000,
  },
}));
