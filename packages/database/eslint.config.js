/**
 * QMULATE — ESLint config for `@qmulate/database`.
 *
 * This is the one package allowed to import the generated Prisma client directly: it is the
 * package that *builds* the audited / scoped / field-encrypted client everyone else consumes.
 * The ban stays in force everywhere else (base config, `restrictedImports`).
 *
 * The exemption is deliberately narrow — it re-states `no-restricted-imports` with the
 * generated-client group dropped rather than switching the rule off, so the brand's Inter ban
 * (DESIGN.md §3) still applies here too.
 */

import base from '@qmulate/config/eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'inter',
                '@fontsource/inter',
                '@fontsource-variable/inter',
                'next/font/google',
              ],
              message:
                'Inter is banned by the brand (DESIGN.md §3). The typefaces are Outfit / Geist Mono / ' +
                'IBM Plex Sans Arabic, bound to --font-sans / --font-mono / --font-ar in @qmulate/ui.',
            },
          ],
        },
      ],
    },
  },
];
