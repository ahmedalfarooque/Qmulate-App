/**
 * packages/i18n/src/rtl.ts — direction and script helpers.
 *
 * Layout itself is done with LOGICAL CSS ONLY (`ps-/pe-/ms-/me-/start-/end-`,
 * `padding-inline`, `inset-inline-start`). Physical `left/right/pl/pr/ml/mr` are
 * banned in component code and lint-enforced. These helpers exist for the handful of
 * things CSS cannot infer: the `<html dir>` attribute, per-element `dir` islands, and
 * the language-switched label treatment.
 */

import { type Direction, type Locale, localeDirection } from './config';

/** `ar` → `'rtl'`, `en` → `'ltr'`. Drives `<html dir>` and the neumorphic light source. */
export function getDirection(locale: Locale): Direction {
  return localeDirection[locale];
}

export function isRtl(locale: Locale): boolean {
  return getDirection(locale) === 'rtl';
}

/** The value for `<html lang>`. Kept as the bare language subtag. */
export function getHtmlLang(locale: Locale): string {
  return locale;
}

/** Props to spread onto `<html>`: `<html {...getHtmlAttributes(locale)}>`. */
export function getHtmlAttributes(locale: Locale): { lang: string; dir: Direction } {
  return { lang: getHtmlLang(locale), dir: getDirection(locale) };
}

/**
 * Fields that must render LEFT-TO-RIGHT even inside an RTL Arabic form:
 * IBANs, deed and certificate numbers, national IDs, phone numbers, SAR figures.
 * Spread onto the input/`<bdi>`: `<input {...LTR_ISLAND} />`.
 *
 * The neumorphic light source does NOT flip for these — `--nu-dir` and the `--nu-*`
 * shadow values are declared on `:root[dir="rtl"]` only, so a nested LTR island keeps
 * the page's light source (DESIGN.md §4.2).
 */
export const LTR_ISLAND = { dir: 'ltr' } as const;

/** Arabic free-text inputs (names, descriptions) inside either form direction. */
export const RTL_ISLAND = { dir: 'rtl' } as const;

/** User-supplied values of unknown script — let the UA decide per string. */
export const AUTO_ISLAND = { dir: 'auto' } as const;

/**
 * THE ARABIC LABEL PROBLEM.
 *
 * The brand's signature label is mono / UPPERCASE / +0.13em tracked. Geist Mono has no
 * Arabic glyphs, and Arabic must NEVER be uppercased or letter-spaced — both break the
 * cursive joins. So the label convention is language-switched, not translated:
 *
 *   - Latin  → Geist Mono, `text-transform: uppercase`, `letter-spacing: .13em`, --color-mist
 *   - Arabic → IBM Plex Sans Arabic **600**, `text-transform: none`, `letter-spacing: 0`
 *
 * Both treatments are defined in `@qmulate/ui/tokens.css`. This returns the class names
 * that select them, so a component can compute the treatment when it cannot rely on the
 * inherited `:lang(ar)` cascade (portals, SSR fragments, PDF/report renderers).
 *
 * @example <span className={labelClass(locale)}>{t('nav.distributions')}</span>
 */
export function labelClass(locale: Locale): string {
  return locale === 'ar' ? 'qm-label qm-label--ar' : 'qm-label';
}

/** As `labelClass`, for the eyebrow variant (same rules, different semantic slot). */
export function eyebrowClass(locale: Locale): string {
  return locale === 'ar' ? 'qm-eyebrow qm-eyebrow--ar' : 'qm-eyebrow';
}

/**
 * True when a string must never be uppercased or letter-spaced. Guards any code path
 * that applies typographic transforms programmatically (chart labels, canvas, PDF).
 */
export function forbidsLetterCasing(locale: Locale): boolean {
  return locale === 'ar';
}

/**
 * Elements that must NOT be mirrored in RTL, per DESIGN.md §4.4 and
 * 11-localization-spec.md §3.3. Kept as data so a lint rule or a review checklist can
 * reference one list: the logo/mark, brand imagery, checkmarks, media thumbnails, and —
 * critically — time-series chart axes (mirroring time confuses finance users; mirror the
 * labels and the legend, keep the temporal order LTR).
 */
export const NEVER_MIRRORED = [
  'logo',
  'mark',
  'brand-imagery',
  'checkmark',
  'media-thumbnail',
  'time-series-axis',
] as const;

export type NeverMirrored = (typeof NEVER_MIRRORED)[number];
