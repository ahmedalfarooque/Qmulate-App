/**
 * QMULATE — ESLint 9 flat config for Next.js apps (`apps/web`).
 *
 *   import next from '@qmulate/config/eslint/next';
 *   export default next;
 *
 * Base + React + the Next.js plugin's core-web-vitals rule set.
 */

import nextPlugin from '@next/eslint-plugin-next';

import react from './react.js';

/** @type {import('eslint').Linter.Config[]} */
const nextConfig = [
  ...react,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    // Next.js generates and owns these.
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];

export default nextConfig;
