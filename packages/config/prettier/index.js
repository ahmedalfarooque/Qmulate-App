/**
 * QMULATE — shared Prettier configuration.
 *
 *   // prettier.config.js
 *   export { default } from '@qmulate/config/prettier';
 *
 * Prettier owns formatting; `eslint-config-prettier` is loaded last in the
 * ESLint base config so the two never fight.
 *
 * @type {import('prettier').Config}
 */
const config = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  endOfLine: 'lf',
  // Arabic message catalogues and RTL prose must not be re-wrapped.
  proseWrap: 'preserve',
  htmlWhitespaceSensitivity: 'css',
  embeddedLanguageFormatting: 'auto',
  singleAttributePerLine: false,
  overrides: [
    {
      // Message catalogues: keep them stable and diff-friendly.
      files: ['**/messages/**/*.json', '**/locales/**/*.json'],
      options: { printWidth: 120 },
    },
    {
      files: ['*.md', '*.mdx'],
      options: { proseWrap: 'preserve', printWidth: 100 },
    },
    {
      files: ['*.yml', '*.yaml'],
      options: { singleQuote: false },
    },
  ],
};

export default config;
