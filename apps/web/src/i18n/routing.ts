import { defineRouting } from 'next-intl/routing';

import { defaultLocale, locales } from '@qmulate/i18n';

/**
 * next-intl routing for the operations app.
 *
 * `localePrefix: 'always'` — Arabic is the product default, not a fallback, so `/ar/...`
 * is spelled out rather than living at the bare root. A URL always states its language,
 * which matters when a deep link is pasted into a regulator-facing thread.
 *
 * Scope-aware routes land later: `/[locale]/c/[clientId]/w/[waqifId]/e/[waqfId]/[...section]`
 * (13-ux-designsystem-reference.md · the Endowment Switcher).
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];
