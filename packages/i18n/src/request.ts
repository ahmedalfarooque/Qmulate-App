/**
 * packages/i18n/src/request.ts — next-intl server request configuration.
 *
 * SERVER-ONLY. This module imports `next-intl/server`; it is deliberately NOT re-exported
 * from `src/index.ts` so a client component can never pull the server runtime in.
 * Import it as `@qmulate/i18n/request`.
 *
 * `apps/web/src/i18n/request.ts` may re-export the default below, or wrap `getMessages()`
 * with app-specific namespaces.
 */

import { getRequestConfig } from 'next-intl/server';

import { defaultTimeZone, resolveLocale } from './config';
import { getMessages } from './index';

/**
 * next-intl v3 `getRequestConfig`. `requestLocale` is untrusted URL input, so it is
 * narrowed through `resolveLocale` (falling back to `ar`) rather than trusted.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = resolveLocale(await requestLocale);

  return {
    locale,
    messages: getMessages(locale),
    /** Fixed to KSA so server and client agree on the calendar day. */
    timeZone: defaultTimeZone,
    /**
     * Anything formatted through next-intl is a DISPLAY value. Statutory deadline
     * arithmetic lives in `@qmulate/domain`, and a frozen `…Hijri` snapshot is rendered
     * verbatim by `formatDateDual` — neither passes through this config.
     */
    now: new Date(),
  };
});
