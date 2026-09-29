import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@qmulate/i18n';
import { StatTile } from '@qmulate/ui';

import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';

import type { KpiChip, KpiTone } from '@/lib/compliance/types';

/**
 * ═══════════════════════════════════════════════════════
 * THE FIVE ZERO-TOLERANCE CHIPS (§14 §3.1) — AND WHAT THEY DO AND DO NOT CLAIM
 * ═══════════════════════════════════════════════════════
 * E0 shipped this strip as a single em-dash with a comment that has aged well: "an all-green board with
 * fabricated numbers is the single most dangerous placeholder this product could ship." This is the strip
 * with figures, built to that standard:
 *
 *  · NO TONE IS DECIDED HERE. Each chip's `tone` and `reasons` arrive from `@qmulate/api`'s
 *    `composeComplianceKpis`, unit-tested there. This file maps a tone to a `StatTile` status and a
 *    sentence, and does nothing else — a wrong colour on this screen is a wrong line in that function.
 *
 *  · THE FOURTH TONE IS WORDS, NOT A COLOUR. A read this seat could not make renders as `refused` with
 *    the sentence that says so, in the NEUTRAL status colour: yellow would claim "there is something to
 *    attend to", and the truth is "this seat could not look". A refusal is never a zero and never green.
 *
 *  · COLOUR IS NEVER THE ONLY SIGNAL. `StatTile.status.label` is required by its own type; the label here
 *    is the tone's sentence ("Breach — zero tolerance" / "Cannot be assured today" / …), so a red dot
 *    cannot exist without the words that carry its meaning (WCAG 1.4.1).
 *
 *  · THE FIGURE IN THE WELL IS THE TONE'S WORD, not a count. Four of the five indicators are not counts
 *    (commingling is a property, KYC a freshness, AML a not-yet-modelled figure, licensing a routing), and
 *    a "0" in a well reads as "zero breaches" whatever the caption says. The word is the figure.
 *
 *  ⚠ Binding rule 3 — KPI 1's windows and KPI 3's refresh interval are unverified against primary law.
 *    The mark is visible TEXT on those two chips, not a tooltip.
 */

const STAT_TONE: Readonly<Record<KpiTone, 'danger' | 'warning' | 'success' | 'neutral'>> = {
  danger: 'danger',
  warning: 'warning',
  success: 'success',
  refused: 'neutral',
};

const UNVERIFIED_KPIS: ReadonlySet<KpiChip['key']> = new Set(['registration', 'kyc']);

export async function KpiStrip({
  locale,
  kpis,
}: {
  readonly locale: string;
  readonly kpis: readonly KpiChip[];
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  const resolved = resolveLocale(locale);

  return (
    <div
      className="grid grid-cols-1 gap-[var(--space-16)] sm:grid-cols-2 lg:grid-cols-5"
      data-testid="qm-kpi-strip"
    >
      {kpis.map((chip) => (
        <div key={chip.key} data-testid={`qm-kpi-${chip.key}`} data-tone={chip.tone}>
          <StatTile
            locale={resolved}
            eyebrow={t(`kpi.${chip.key}.title`)}
            value={
              <span
                className="text-h3 text-ink"
                data-testid={`qm-kpi-${chip.key}-value`}
                lang={resolved}
              >
                {t(`tone.${chip.tone}`)}
              </span>
            }
            status={{ tone: STAT_TONE[chip.tone], label: t(`tone.${chip.tone}`) }}
            caption={
              <span className="flex flex-col gap-[var(--space-4)]">
                <span>{t(`kpi.${chip.key}.body`)}</span>
                {chip.tone === 'refused' ? (
                  <span data-testid={`qm-kpi-${chip.key}-refused`}>{t('board.refusedRead')}</span>
                ) : null}
                {UNVERIFIED_KPIS.has(chip.key) ? <UnverifiedMark locale={locale} /> : null}
              </span>
            }
            className="text-start"
          />
        </div>
      ))}
    </div>
  );
}
