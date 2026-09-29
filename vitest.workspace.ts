import { defineWorkspace } from 'vitest/config';

/**
 * QMULATE root Vitest workspace.
 *
 * Each package owns its own `vitest.config.ts`; this file only aggregates them
 * so a single `pnpm exec vitest` at the repo root runs everything (useful for
 * local watch mode and IDE integrations). CI does NOT use this file — it runs
 * `turbo run test`, which executes each package's own `test` script so that
 * Turborepo can cache per-package results.
 */
export default defineWorkspace(['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts']);
