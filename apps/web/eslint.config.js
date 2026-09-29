/**
 * apps/web/eslint.config.js — ESLint 9 flat config for the operations app.
 *
 * The hard bans (physical `pl-/pr-/ml-/mr-/left-/right-/text-left/h-screen`, raw hex,
 * hand-rolled `box-shadow`, `Inter`, `@prisma/client`, money-as-`number`) are NOT redefined
 * here — they live in `@qmulate/config/eslint` so every workspace fails the same way.
 * This file adds only what is app-specific: browser globals and the server/client import
 * boundary. The Next.js and react-hooks plugins are registered ONCE, in
 * `@qmulate/config/eslint/next` — flat config rejects a plugin key being defined twice, so
 * they must not be re-registered here.
 */

import {
  RUNTIME_BYPASS_ASSIGN_MESSAGE,
  restrictedImports,
  runtimeBypassImportPatterns,
} from '@qmulate/config/eslint';
import next from '@qmulate/config/eslint/next';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...next,

  {
    ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'],
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  /**
   * Ban 5, applied HERE because a path-scoped glob in the shared config cannot reach this app.
   *
   * `@qmulate/config/eslint`'s Ban-5 block is scoped by repo path, which works for `apps/worker`
   * (no local config, so ESLint's base directory is the repo root). This app HAS a local config,
   * so its base directory is `apps/web` and that glob never matches. Measured, not assumed:
   * probes in `src/app/` importing `makeSystemContext` and assigning `bypass` were BOTH clean
   * until this block existed.
   *
   * The patterns and the message are IMPORTED, never retyped — one definition, two application
   * sites. `no-restricted-syntax` has to be re-stated here too because `designSystemRestrictions`
   * sets it for every `.ts`/`.tsx` downstream of the shared config, and ESLint replaces a rule's
   * options rather than merging them.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...restrictedImports.patterns, ...runtimeBypassImportPatterns] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "Property[key.name='bypass']", message: RUNTIME_BYPASS_ASSIGN_MESSAGE },
      ],
    },
  },

  /**
   * The server/client boundary. `@qmulate/auth` (the server entry) imports the Prisma
   * client and the *server* env schema; pulling it into a `'use client'` component would
   * bundle both into the browser. Components use `@/lib/auth-client` instead.
   */
  {
    files: ['src/components/**/*.tsx', 'src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...runtimeBypassImportPatterns,
            {
              group: ['@qmulate/auth', '@qmulate/auth/server', '@qmulate/database'],
              message:
                'Server-only module. Client components must use `@/lib/auth-client` ' +
                '(`@qmulate/auth/client`), which never touches Prisma or the server env schema.',
            },
            {
              group: ['@prisma/client', '@prisma/client/*', '**/generated/client'],
              message: 'Import the client from `@qmulate/database`, and only on the server.',
            },
            {
              group: ['next/font/google', 'inter', '@fontsource/inter'],
              message:
                'Fonts are self-hosted from packages/ui/fonts via next/font/local (no Google ' +
                'Fonts request at runtime — data residency, NFR-03). Inter is banned by the brand.',
            },
          ],
        },
      ],
    },
  },

  // `@/lib/auth-client` is the sanctioned re-export point for the browser client.
  {
    files: ['src/lib/auth-client.ts'],
    // The exemption is for the SERVER/CLIENT boundary only. It used to be a blanket
    // `'off'`, which also switched off the force-filter-bypass ban in the one file whose
    // whole job is to be imported by the browser. Narrowed to re-state the bypass patterns.
    rules: {
      'no-restricted-imports': ['error', { patterns: [...runtimeBypassImportPatterns] }],
    },
  },

  {
    files: ['e2e/**/*.ts', 'playwright.config.ts', '*.config.ts', '*.config.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
