import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, defaultTimeZone, getMessages, locales } from '@qmulate/i18n';

import type { Locale } from '@qmulate/i18n';

function toLocale(value: string | undefined): Locale {
  return (locales as readonly string[]).includes(value ?? '') ? (value as Locale) : defaultLocale;
}

/**
 * Server-side i18n for every request.
 *
 * Messages come from `@qmulate/i18n` — no copy is authored in this app. The timezone is
 * pinned to Asia/Riyadh so a server render and a client hydrate agree on what "today"
 * means; statutory deadlines are counted in KSA business days, and a date that shifts by
 * a timezone is a compliance defect, not a cosmetic one.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = toLocale(await requestLocale);

  return {
    locale,
    messages: await getMessages(locale),
    timeZone: defaultTimeZone,
  };
});
