/**
 * packages/i18n/src/config.ts — locale catalogue and routing constants.
 *
 * Arabic is the product DEFAULT, not a fallback: financial records are statutorily
 * Arabic (Nazarah Art. 15(2) — ⚠ unverified, confirm vs primary law) and the Family
 * Board and beneficiaries operate in Arabic. English is the convenience translation.
 * See docs/product/prd/11-localization-spec.md §1.
 */

export const locales = ['ar', 'en'] as const;

export type Locale = (typeof locales)[number];

/** Arabic first — see the note above. Never flip this to 'en' for convenience. */
export const defaultLocale: Locale = 'ar';

/** next-intl routing: every route is `/[locale]/…`, including the default locale. */
export const localePrefix = 'always' as const;

export type Direction = 'rtl' | 'ltr';

/** Reading direction per locale. Drives `<html dir>` and the neumorphic light source. */
export const localeDirection: Readonly<Record<Locale, Direction>> = {
  ar: 'rtl',
  en: 'ltr',
};

/**
 * BCP-47 tags used when building `Intl` formatters. Region is fixed to SA: the
 * product operates under KSA conventions in both languages (week starts Sunday,
 * SAR currency, Umm-al-Qura for statutory dates).
 */
export const intlLocale: Readonly<Record<Locale, string>> = {
  ar: 'ar-SA',
  en: 'en-SA',
};

/** Native language names, for the language switcher. Each is written in its own script. */
export const localeNames: Readonly<Record<Locale, string>> = {
  ar: 'العربية',
  en: 'English',
};

/**
 * Digit shaping. Financial figures default to Latin ('latn') digits even in `ar` —
 * this matches Saudi banking convention and keeps `tabular-nums` columns aligned.
 * 'arab' (Arabic-Indic) is available for beneficiary-facing prose if the business
 * asks for it; digit glyphs are never hard-coded.
 */
export type NumberingSystem = 'latn' | 'arab';

export const defaultNumberingSystem: NumberingSystem = 'latn';

/** The currency every waqf ledger is denominated in. */
export const defaultCurrency = 'SAR';

/** KSA operating timezone — used by next-intl so server and client render alike. */
export const defaultTimeZone = 'Asia/Riyadh';

/** Type guard for untrusted input (URL segments, headers, cookies). */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Narrow untrusted input to a Locale, falling back to the default. */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

/** The other locale — for the two-way language toggle. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}
