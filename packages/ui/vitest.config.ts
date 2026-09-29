import { defineConfig } from 'vitest/config';

/**
 * Component tests for @qmulate/ui.
 *
 * No `@vitejs/plugin-react`: `esbuild.jsx: 'automatic'` is enough to transform TSX for
 * these tests, and it keeps one fewer dependency in the tree.
 *
 * `TZ` and `LANG` are pinned because the two suites here assert on `Intl` output. Without
 * a fixed timezone a UTC-midnight date can format as the previous day on a machine west of
 * Greenwich, and the dual-calendar assertions would pass or fail by geography.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    env: {
      TZ: 'Asia/Riyadh',
      LANG: 'en_US.UTF-8',
    },
  },
});
