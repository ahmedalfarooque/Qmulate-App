import { defineConfig } from 'vitest/config';

/**
 * Unit tests for @qmulate/config.
 *
 * `environment: 'node'` because everything under test is boot-time plumbing: the zod
 * environment schema, the fail-fast reporter and the NFR-03 residency guards. None of it
 * touches a DOM, a database or the network.
 *
 * The suite deliberately does NOT rely on the ambient shell environment. Every assertion
 * about validation passes an explicit source object to `parseOrExit` / `safeParse`, so a
 * developer with `DATA_CLASSIFICATION` exported in their shell gets exactly the same
 * result as CI. The two tests that must exercise `process.env` stub it explicitly and
 * call `resetEnvCacheForTests()` afterwards.
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
