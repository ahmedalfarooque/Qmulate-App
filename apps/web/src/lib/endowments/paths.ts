/**
 * Route helpers for the endowment surfaces.
 *
 * Every href is built here rather than interpolated at the call site, for the same reason
 * `@/lib/auth-client` centralises its paths: the locale prefix is part of the URL contract
 * (`localePrefix: 'always'`), and a hand-written `/endowments/...` that forgets it lands on the
 * middleware's redirect instead of the screen.
 *
 * `encodeURIComponent` on the id is not decoration. A `waqfId` reaches these helpers from a
 * route segment or an API payload; a value carrying a `/` or a `?` would otherwise silently
 * re-target the link.
 */

export const ENDOWMENT_TABS = [
  'record',
  'deed',
  'classification',
  'shart',
  'beneficiaries',
  'reserved',
  /** ⊕ S12-3 · the three handover gates (BR-1101). */
  'onboarding',
] as const;

export type EndowmentTab = (typeof ENDOWMENT_TABS)[number];

/** The segment each tab lives under. `record` is the endowment's own index route. */
const TAB_SEGMENT: Readonly<Record<EndowmentTab, string>> = {
  record: '',
  deed: 'deed',
  classification: 'classification',
  shart: 'shart',
  beneficiaries: 'beneficiaries',
  reserved: 'reserved-matters',
  onboarding: 'onboarding',
};

export function endowmentsPath(locale: string): string {
  return `/${locale}/endowments`;
}

export function endowmentPath(
  locale: string,
  waqfId: string,
  tab: EndowmentTab = 'record',
): string {
  const base = `${endowmentsPath(locale)}/${encodeURIComponent(waqfId)}`;
  const segment = TAB_SEGMENT[tab];
  return segment === '' ? base : `${base}/${segment}`;
}
