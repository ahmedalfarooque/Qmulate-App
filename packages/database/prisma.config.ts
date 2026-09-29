/**
 * QMULATE — Prisma CLI configuration.
 *
 * Two jobs:
 *
 *  1. **Load the environment.** The Prisma CLI reads `.env` relative to the schema, and this
 *     monorepo keeps a single untracked `.env` at the repo root (one file, one
 *     `DATA_CLASSIFICATION` — NFR-03 is much harder to reason about with a copy per package).
 *     Without the side-effect import below, `prisma migrate deploy` fails with
 *     "Environment variable not found: DATABASE_URL" even though a perfectly good `.env` exists
 *     three directories up. The loader never overrides a variable CI or Railway already set.
 *
 *  2. **Declare the seed command**, replacing the deprecated `package.json#prisma` block
 *     (removed in Prisma 7).
 */
import '@qmulate/config/load-env';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // The seed is a PROGRAM: it asserts the residency guardrail and sets a non-zero exit code on
    // refusal, which is what gate G-8 asserts in CI. See `src/guardrail.ts`.
    seed: 'tsx src/seed.ts',
  },
});
