import { defineConfig } from 'vitest/config';

/**
 * QMULATE — `@qmulate/api` test configuration.
 *
 * TWO SUITES, ONE CONFIG, SELECTED BY `--mode` (the same shape as `@qmulate/database`'s, on
 * purpose — two harnesses with different skip semantics is how a skipped security assertion gets
 * reported as a passed one):
 *
 *   vitest run                     UNIT ONLY — no database, no Prisma engine. The procedure-ladder
 *                                  and router-introspection suites run everywhere, including a
 *                                  laptop with no Postgres.
 *   vitest run --mode integration  UNIT + INTEGRATION — needs `DATABASE_URL` pointing at a
 *                                  migrated, seeded, throwaway Postgres.
 *
 * `*.integration.test.ts` files are EXCLUDED from the unit run, so a missing database can never
 * make a denial assertion silently disappear from a suite that claims to have run it. They
 * additionally guard themselves with `describe.skipIf(!hasDatabase)` and print a LOUD warning at
 * module scope (see `test/setup.ts`): a skipped ACCESS_DENIED assertion is NOT a proven one.
 *
 * ── WHY INTEGRATION RUNS IN ONE PROCESS, ONE FILE AT A TIME ──────────────────────────────────
 * Every integration file shares ONE database with `@qmulate/database`'s own suite. The audit hash
 * chain is a global, serialized structure, and several assertions COUNT audit events — two files
 * interleaving writes would make those counts unreproducible.
 *
 * ── THE LIMIT OF THAT: THIS SERIALIZES WITHIN THIS PACKAGE ONLY ───────────────────────────────
 * The sentence above already admits the database is shared with `@qmulate/database`'s suite — and
 * `fileParallelism` / `singleFork` do NOTHING about that suite. They are vitest settings and
 * vitest's authority stops at this package; they order THIS package's files and nothing else.
 * `pnpm turbo run test:integration` ran both packages concurrently against the one database, and
 * CI died on the first E2 run with `40P01 deadlock detected`. Both configs looked fully defensive
 * because each was only ever describing its own files — the gap was the seam between them.
 *
 * Cross-package serialization therefore lives OUTSIDE vitest, in two layers, and if you are
 * debugging a shared-state failure that is where to look:
 *   · `turbo.json` — `test:integration` has a `^test:integration` dependency, so the suites run in
 *     package-dependency order (this package depends on `@qmulate/database` ⇒ that suite runs
 *     first), locally and in CI;
 *   · `.github/workflows/ci.yml` — a gate reads turbo's task graph and fails if any two runnable
 *     integration suites are mutually unordered, and the run is pinned to `--concurrency=1`.
 * Ordering also means this suite may not observe a pristine database: `@qmulate/database`'s suite
 * has already written to it. Assert on rows you created, and count audit events by a delta you
 * captured yourself, never against an absolute total.
 *
 * `TZ=UTC` is pinned because the TOTP step-up window and the Hijri stamps are compared against
 * frozen strings; an assertion that passes or fails by the developer's geography is worthless.
 */
const ALWAYS_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.turbo/**'];

export default defineConfig(({ mode }) => {
  const integration = mode === 'integration';

  return {
    test: {
      environment: 'node',
      globals: false,
      restoreMocks: true,
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.ts'],
      exclude: integration ? ALWAYS_EXCLUDE : [...ALWAYS_EXCLUDE, 'test/**/*.integration.test.ts'],
      env: {
        TZ: 'UTC',
      },
      // A cold Postgres plus a per-request Prisma client per assertion is slow the first time.
      // Unit tests get a tight budget so a hang is visible immediately.
      testTimeout: integration ? 120_000 : 15_000,
      hookTimeout: integration ? 300_000 : 30_000,
      fileParallelism: !integration,
      sequence: { concurrent: false },
      ...(integration ? { poolOptions: { forks: { singleFork: true } } } : {}),
    },
  };
});
