/**
 * `@qmulate/config` — shared build + runtime configuration.
 *
 * What lives where:
 *   `@qmulate/config`                       → this barrel (env schema + helpers)
 *   `@qmulate/config/env`                   → the env module directly
 *   `@qmulate/config/eslint`                → ESLint 9 flat base config
 *   `@qmulate/config/eslint/react`          → base + React
 *   `@qmulate/config/eslint/next`           → base + React + Next.js
 *   `@qmulate/config/prettier`              → Prettier config object
 *   `@qmulate/config/tsconfig/base.json`    → strict TS base
 *   `@qmulate/config/tsconfig/node.json`    → Node/worker/scripts
 *   `@qmulate/config/tsconfig/nextjs.json`  → Next.js App Router
 *   `@qmulate/config/tsconfig/react-library.json` → React component libraries
 *
 * Importing this barrel does NOT validate the environment: `serverEnv` /
 * `clientEnv` parse lazily on first property access, so tests and tooling can
 * import freely. See `./env.ts` for the NFR-03 residency guardrail.
 */

export {
  // residency (NFR-03 / G-8)
  DATA_CLASSIFICATIONS,
  DATA_RESIDENCIES,
  FIXTURE_ONLY_INPUT_PATH,
  assertFixtureInputPath,
  assertFixtureOnly,
  dataClassification,
  isFixtureOnly,
  isProductionData,
  // schemas
  clientEnvSchema,
  serverEnvSchema,
  // accessors
  clientEnv,
  getClientEnv,
  getServerEnv,
  serverEnv,
  // plumbing
  EnvValidationError,
  parseOrExit,
  resetEnvCacheForTests,
} from './env';

export type { ClientEnv, DataClassification, DataResidency, ServerEnv } from './env';
