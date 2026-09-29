/**
 * QMULATE — root ESLint 9 flat config.
 *
 * This is the repo-wide fallback: it re-exports the shared base from
 * `@qmulate/config/eslint` and adds ignores for the non-code trees. Packages
 * that need React or Next.js rules ship their own two-line `eslint.config.js`:
 *
 *   export { default } from '@qmulate/config/eslint';        // pure TS package
 *   export { default } from '@qmulate/config/eslint/react';  // packages/ui
 *   export { default } from '@qmulate/config/eslint/next';   // apps/web
 */

import base from '@qmulate/config/eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      // Documentation, source material and the Obsidian mirror are not code.
      'docs/**',
      'archive/**',
      'Qmulate/**',
      'data/**',
      'scripts/**/*.py',
      // Build output / caches (also covered by the base config's ignores).
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  ...base,
];
