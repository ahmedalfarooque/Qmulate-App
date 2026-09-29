import { defineConfig } from 'vitest/config';

/**
 * QMULATE — `apps/web` test configuration. **S11, the `apps/*` suite-existence gate stage.**
 *
 * ── WHY THIS FILE DID NOT EXIST UNTIL NOW, AND WHAT THAT COST ──────────────────────────────────
 * CI's suite-existence gate looped the `packages` manifests only, so it checked nine workspaces
 * and **no `apps/*` at all** — and `apps/web` defined no `test` script, so `turbo run test` ran
 * nothing for 91 source files / 14,726 lines and no gate could notice. Two consequences are on the
 * S11 record rather than inferred: 2b's KPI tone logic was written into `@qmulate/api` **because
 * there was nowhere in this app to unit-test it**, and two mutations were reported SURVIVED as
 * "unkillable by construction" for the same reason.
 *
 * `apps/worker` already had both scripts and ran 3 + 9, which is what settled that this was a DEBT
 * and not an exemption: an app can satisfy the gate, and one already did.
 *
 * ── SCOPE, DELIBERATELY SMALL ──────────────────────────────────────────────────────────────────
 * `node` environment and the `test` directory only. This is NOT a testing strategy for React server
 * components — most of this app's surface is server-coupled (`server-only`, `next/headers`,
 * `getTranslations`), and covering it needs a rendering strategy that is its own piece of work.
 * What lives here is what can be asserted honestly without one.
 */
const ALWAYS_EXCLUDE = ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**'];

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // `e2e/` is Playwright's and must never be collected by vitest: those files import
    // `@playwright/test`, whose `test()` is not vitest's, and a suite that silently collected
    // them would report a green run over specs it never executed.
    exclude: ALWAYS_EXCLUDE,
    globals: false,
    restoreMocks: true,
    env: { TZ: 'UTC' },
  },
});
