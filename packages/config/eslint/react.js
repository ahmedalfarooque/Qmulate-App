/**
 * QMULATE — ESLint 9 flat config for React libraries (`packages/ui` and friends).
 *
 *   import react from '@qmulate/config/eslint/react';
 *   export default react;
 *
 * Layers the React + React Hooks plugins and the design-system restrictions
 * (no raw hex, no hand-rolled box-shadow) on top of the shared base.
 */

import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import base, { designSystemRestrictions } from './base.js';

/** @type {import('eslint').Linter.Config[]} */
const reactConfig = [
  ...base,
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // The new JSX transform: no `import React` needed, and no prop-types in TS.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',

      // Accessibility affordances are non-negotiable (AC-E0-6): a control's state
      // must be reflected in ARIA, never in shadow alone.
      'react/jsx-no-target-blank': ['error', { allowReferrer: false }],
      'react/no-danger': 'error',
      'react/self-closing-comp': 'error',
    },
  },
  ...designSystemRestrictions,
];

export default reactConfig;
