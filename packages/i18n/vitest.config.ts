import { defineConfig } from 'vitest/config';

/**
 * Unit tests for @qmulate/i18n.
 *
 * `TZ` and `LANG` are pinned deliberately. Both suites assert on `Intl` output, and an
 * unpinned timezone makes the dual-calendar assertions pass or fail by geography: a
 * 09:00 UTC instant is the previous calendar day west of Greenwich, which shifts both the
 * Gregorian and the Umm-al-Qura rendering. Asia/Riyadh matches `defaultTimeZone` in
 * `src/config.ts`, so the suite exercises the same clock the product runs on.
 *
 * NOTE: full ICU is required. Node 22's official builds ship it; a `small-icu` build would
 * silently fall back to `en-US` and Arabic assertions would fail with confusing diffs.
 * `test/formatters.test.ts` asserts full ICU up-front so that failure is self-explaining.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
    env: {
      TZ: 'Asia/Riyadh',
      LANG: 'en_US.UTF-8',
    },
  },
});
