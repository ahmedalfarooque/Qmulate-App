import { defineConfig } from 'vitest/config';

/**
 * QMULATE — `@qmulate/database` test configuration.
 *
 * TWO SUITES, ONE CONFIG, SELECTED BY `--mode`:
 *
 *   vitest run                     UNIT ONLY — no database, no network, no Prisma engine.
 *                                  Runs everywhere, including a laptop with no Postgres and a
 *                                  CI job that has not stood one up.
 *   vitest run --mode integration  UNIT + INTEGRATION — needs `DATABASE_URL` pointing at a
 *                                  migrated, throwaway Postgres.
 *
 * Integration files are named `*.integration.test.ts` and are EXCLUDED from the unit run, so a
 * missing database can never make an integration assertion silently disappear from a suite that
 * claims to have run it. They additionally guard themselves with `describe.skipIf(!hasDatabase)`
 * (see `test/setup.ts`), which prints a loud warning rather than passing quietly — a skipped
 * G-1 assertion is NOT a proven G-1.
 *
 * ── WHY INTEGRATION RUNS IN ONE PROCESS, ONE FILE AT A TIME ──────────────────────────────────
 * Every integration file shares ONE database. The audit hash chain is a global, serialized
 * structure and the seed is a whole-database upsert, so two files running concurrently would
 * interleave writes and make chain-verification failures unreproducible. `singleFork` +
 * `fileParallelism: false` also lets `ensureSeeded()` memoize across files, so the fixture is
 * seeded once per run instead of once per file.
 *
 * ── THE LIMIT OF THAT: THIS SERIALIZES WITHIN THIS PACKAGE ONLY ───────────────────────────────
 * `fileParallelism` and `singleFork` are vitest settings and vitest's authority stops at this
 * package. `@qmulate/api` has an integration suite pointed at the SAME `DATABASE_URL` and the
 * same audit chain, and nothing in this file can stop it running at the same moment as this one.
 * `pnpm turbo run test:integration` used to do exactly that, and CI died on the first E2 run with
 * `40P01 deadlock detected` — two suites, one database, genuinely concurrent, while both configs
 * looked fully defensive because each was only ever describing its own files.
 *
 * Cross-package serialization therefore lives OUTSIDE vitest, in two layers, and if you are
 * debugging a shared-state failure that is where to look:
 *   · `turbo.json` — `test:integration` has a `^test:integration` dependency, so the suites run in
 *     package-dependency order (api depends on database ⇒ database first), locally and in CI;
 *   · `.github/workflows/ci.yml` — a gate reads turbo's task graph and fails if any two runnable
 *     integration suites are mutually unordered, and the run is pinned to `--concurrency=1`.
 * Adding a THIRD integration suite anywhere in the monorepo is a decision about that shared
 * database, not a local one. See the recommendation for a schema-per-suite harness in the S2
 * notes before doing it.
 *
 * `TZ=UTC` is pinned because several assertions compare frozen ISO-8601 and Umm al-Qura strings.
 * The production code always passes `timeZone: 'UTC'` explicitly, so this is belt-and-braces —
 * but a dual-calendar assertion that passes or fails by the developer's geography is worthless.
 */
const ALWAYS_EXCLUDE = [
  '**/node_modules/**',
  '**/generated/**',
  '**/dist/**',
  '**/.turbo/**',
  '**/prisma/migrations/**',
];

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
      // A cold Postgres, a `prisma migrate deploy` and a 96-write seed are all slow the first
      // time. Unit tests get a tight budget so a hang is visible immediately.
      testTimeout: integration ? 120_000 : 15_000,
      hookTimeout: integration ? 300_000 : 30_000,
      fileParallelism: !integration,
      sequence: { concurrent: false },
      ...(integration ? { poolOptions: { forks: { singleFork: true } } } : {}),
    },
  };
});
