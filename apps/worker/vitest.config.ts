import { defineConfig } from 'vitest/config';

/**
 * QMULATE — `apps/worker` test configuration.  (S10/T2 — the worker's first tests)
 *
 * Same two-suite `--mode` split as `@qmulate/database` and `@qmulate/jobs`:
 *
 *   vitest run                     UNIT ONLY — the KSA-day key boundary, pure module facts.
 *   vitest run --mode integration  UNIT + INTEGRATION — the sweep against a real, seeded
 *                                  database and a real pg-boss schema: the TWO-REAL-WORKERS
 *                                  proof, the coverage control's structural test, and V-4's
 *                                  conjunct (iv) by RUNNING THE WORKER BINARY twice.
 *
 * Integration files are `*.integration.test.ts`, excluded from the unit run — a missing
 * database can never make the two-worker proof silently disappear from a suite that claims to
 * have run it. This is the FOURTH integration suite; its ordering edge lives in `turbo.json`
 * (`worker#test:integration` after `@qmulate/jobs#test:integration`) and CI's task-graph gate
 * verifies it.
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
    ...(mode === 'integration'
      ? {
          fileParallelism: false,
          pool: 'forks' as const,
          poolOptions: { forks: { singleFork: true } },
        }
      : {}),
    env: { TZ: 'UTC' },
    // The binary-run arm builds a seat context, computes deadlines and drains a queue twice.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
}));
