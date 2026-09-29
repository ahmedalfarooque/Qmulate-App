import { defineConfig } from 'vitest/config';

/**
 * QMULATE — `@qmulate/storage` test configuration.
 *
 * ⚠ THIS FILE (and the package's `test` script) DID NOT EXIST BEFORE E2. The package shipped the
 * WORM retention window, the legal hold, the never-shorten rule and the version history in
 * Sprint 1 with **no suite at all** — `scripts` were `lint` + `typecheck` only — so CI's
 * "every packages/* workspace defines a `test` script" gate had nothing to run here. An
 * unenforced guard and an untested one are the same thing to an auditor.
 *
 * The package is PURE in the sense that matters for tests: no database, no network, no clock
 * (the adapter takes an injected `now`). So there is one suite, it runs everywhere, and there is
 * deliberately no `--mode integration` split — nothing here needs Postgres, and a second mode
 * with different skip semantics is how a skipped assertion gets reported as a passed one.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
    globals: false,
    restoreMocks: true,
    // Retention assertions compare frozen ISO-8601 instants; an assertion that passes or fails by
    // the developer's geography is worthless.
    env: { TZ: 'UTC' },
    testTimeout: 15_000,
  },
});
