/**
 * @qmulate/i18n — bilingual (ar/en) copy catalogue, RTL helpers and locale-aware
 * formatters shared by `apps/web`, `apps/mobile` and any report renderer.
 *
 * Everything exported here is CLIENT-SAFE. The next-intl server integration lives in
 * `@qmulate/i18n/request` and is intentionally not re-exported.
 *
 * Non-negotiables this package carries (docs/product/prd/11-localization-spec.md):
 *   · Arabic is the DEFAULT locale, not a fallback.
 *   · No inline hard-coded UI strings anywhere in the product — every visible label
 *     resolves through these catalogues.
 *   · Domain enums stay machine codes; their labels come from the catalogue.
 *   · Money is `string | DecimalLike` — a JS `number` is a compile error.
 *   · A frozen Hijri snapshot is displayed verbatim, never recomputed.
 */

import arMessages from '../messages/ar.json';
import enMessages from '../messages/en.json';
import type { Locale } from './config';

export {
  defaultCurrency,
  defaultLocale,
  defaultNumberingSystem,
  defaultTimeZone,
  intlLocale,
  isLocale,
  localeDirection,
  localeNames,
  localePrefix,
  locales,
  otherLocale,
  resolveLocale,
  type Direction,
  type Locale,
  type NumberingSystem,
} from './config';

export {
  AUTO_ISLAND,
  eyebrowClass,
  forbidsLetterCasing,
  getDirection,
  getHtmlAttributes,
  getHtmlLang,
  isRtl,
  labelClass,
  LTR_ISLAND,
  NEVER_MIRRORED,
  RTL_ISLAND,
  type NeverMirrored,
} from './rtl';

export {
  formatCurrency,
  formatDateDual,
  formatDual,
  formatGregorian,
  formatHijri,
  formatNumber,
  formatPercent,
  formatSar,
  toDecimalString,
  type CalendarName,
  type DateFormatOptions,
  type DateInput,
  type DateStyle,
  type DecimalLike,
  type DualDate,
  type DualDateOptions,
  type MoneyFormatOptions,
  type MoneyValue,
  type NumberFormatOptions,
  type PercentFormatOptions,
} from './formatters';

/**
 * The message catalogues, statically imported.
 *
 * `ar` is the REFERENCE catalogue and `en` is typed against it: adding an Arabic key
 * without its English counterpart (or vice versa) fails `pnpm turbo run typecheck`.
 * That is the mechanism that keeps the two files from drifting.
 */
export const messages = { ar: arMessages, en: enMessages } satisfies Record<
  Locale,
  typeof arMessages
>;

/** Shape of one locale's catalogue. */
export type Messages = typeof arMessages;

/** Namespaces available to `useTranslations(namespace)`. */
export type MessageNamespace = keyof Messages;

/** The full catalogue for one locale. */
export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

/** One namespace of one locale — for renderers that do not run next-intl (PDF, email). */
export function getNamespace<N extends MessageNamespace>(
  locale: Locale,
  namespace: N,
): Messages[N] {
  return messages[locale][namespace];
}
