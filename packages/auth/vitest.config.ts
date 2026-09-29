import { defineConfig } from 'vitest/config';

/**
 * Unit tests for @qmulate/auth.
 *
 * Scope note: `src/roles.ts` and `src/rate-limit.ts` are dependency-free of Prisma by design
 * — roles has no imports at all, and rate-limit reaches only `@qmulate/config/env` — so both
 * are unit-testable. `src/server.ts` is NOT: it constructs the better-auth instance against a
 * live Prisma client and reads `serverEnv`, and `src/client.ts` is a browser SDK. Exercising
 * those is the job of the `integration` and `e2e` CI jobs (AC-E0-7: register → enrol TOTP →
 * sign in against a migrated database), plus the source pins in `auth-plugins.test.ts` and
 * `rate-limit.test.ts` for the wiring facts source can state.
 *
 * Importing `../src/index` in a test would pull in `server.ts` and therefore Prisma and the
 * environment schema — so tests import the specific module they exercise.
 *
 * `unstubEnvs: true` matches `packages/config`'s config and is load-bearing since S7:
 * `rate-limit.test.ts` stubs `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` and `DATA_CLASSIFICATION`,
 * and a stub that leaked into a later file could turn a fail-closed assertion green.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
