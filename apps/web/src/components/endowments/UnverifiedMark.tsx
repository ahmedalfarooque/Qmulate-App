import { getTranslations } from 'next-intl/server';

/**
 * UnverifiedMark — binding rule 3, as a component.
 *
 * "Every numeric threshold, statutory deadline, fee percentage and classification figure in this
 * repo is UNVERIFIED until confirmed against primary Saudi law." Every place a screen states one —
 * the SAR 200M / 50M classification bands, the ten-business-day istibdal notice window, the 10%
 * (ʿushr) Nazir fee, the three-month post-fiscal-year-end window — the figure carries this marker.
 *
 * ── WHY IT IS A COMPONENT AND NOT A SENTENCE SOMEONE REMEMBERS TO TYPE ────────────────────
 * The rule is "flag ON USE, never present it as settled truth". A shared component means the
 * wording is one catalogue key in both locales (`common.unverifiedFigure`), it cannot drift between
 * screens, and its absence next to a figure is visible in review. It renders as TEXT, not as a
 * tooltip: a caveat that only appears on hover is not a caveat on a printed statement.
 */
export async function UnverifiedMark({ locale }: { readonly locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <span
      data-testid="qm-unverified"
      className="inline-flex items-start gap-[var(--space-4)] text-body-sm text-warning"
    >
      {/* A warning triangle, decorative: the sentence beside it is the accessible content. */}
      <span aria-hidden="true">⚠</span>
      {t('unverifiedFigure')}
    </span>
  );
}
