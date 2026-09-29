import { getTranslations } from 'next-intl/server';

import { Button, Card, Heading, Label, Text } from '@qmulate/ui';

import { newRunPath } from '@/lib/distributions/paths';

import type { RunPeriod } from '@/lib/distributions/types';

/**
 * The fiscal window a run covers — a native `<form method="get">`.
 *
 * ── WHY A GET FORM AND NOT A MUTATION ─────────────────────────────────────────────────────
 * Choosing a period WRITES NOTHING. It selects which window to compute, and `distribution.preview` is a
 * query that writes nothing either. So the submit is a navigation: it puts `periodStart`/`periodEnd` into
 * the URL and the next server render computes from them. That keeps the period shareable, bookmarkable and
 * re-runnable, and it keeps the first control a user touches on this screen off the mutation path entirely.
 *
 * ── WHY THE INPUTS ARE HAND-BUILT ─────────────────────────────────────────────────────────
 * `@qmulate/ui` ships no form primitives at all — no `Input`, no `Select`, no `FormField`, no `DatePicker`.
 * Fifteen runtime exports, and none of them is a control. So these two are written here against the design
 * tokens, with `<Label>` from the library supplying the label treatment, and the fields carry the whole
 * accessibility contract explicitly: a real `<label for>`, `required`, and the `>=3:1` non-shadow edge cue
 * that the design system demands of anything interactive.
 *
 * ⚠ `type="date"` RENDERS IN THE BROWSER'S OWN LOCALE AND THAT IS DELIBERATE. The value it submits is
 * always `yyyy-MM-dd` regardless of how it is displayed, which is exactly the civil-date spelling every
 * boundary in this repository uses. A hand-rolled Hijri picker would be a second calendar implementation in
 * the browser's language, and this app cannot import `@qmulate/domain`'s Umm al-Qura code — two answers to
 * "which day is this" is the defect that would produce. The run's own dates are then rendered back in BOTH
 * calendars from the frozen snapshots the kernel writes.
 *
 * ⚠ THE FORM DOES NOT CHECK `start <= end`. The engine's `assertInputConsistency` owns that comparison;
 * duplicating it here would create a second, silently disagreeing opinion about a fiscal window. A reversed
 * window is refused by the kernel and rendered as a refusal, which is the honest path.
 */
export async function PeriodForm({
  locale,
  waqfId,
  period,
}: {
  readonly locale: string;
  readonly waqfId: string;
  /** Pre-fills the fields when a window is already chosen, so "Recompute" is one click. */
  readonly period: RunPeriod | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const FIELD = [
    'min-h-tap w-full rounded-control border border-edge bg-well',
    'px-[var(--space-12)] py-[var(--space-8)] text-body text-ink',
    'focus-visible:shadow-focus focus-visible:outline-none',
  ].join(' ');

  return (
    <Card as="section" className="flex flex-col gap-[var(--space-16)] text-start">
      <div className="flex flex-col gap-[var(--space-4)]">
        <Heading level={2}>{t('wizard.stepPeriod')}</Heading>
        <Text tone="mist">{t('wizard.stepPeriodBody')}</Text>
      </div>

      {/* `method="get"` on the wizard's own route: the submit is a navigation, not a write. */}
      <form
        method="get"
        action={newRunPath(locale, waqfId)}
        className="flex flex-col gap-[var(--space-16)]"
        data-testid="qm-period-form"
      >
        {/* Land on the waterfall once a window exists — the receipts are shown on this step and the
            next question is what the waterfall did with them. */}
        <input type="hidden" name="step" value="waterfall" />

        <div className="grid grid-cols-1 gap-[var(--space-16)] sm:grid-cols-2">
          <div className="flex flex-col gap-[var(--space-4)]">
            <Label htmlFor="qm-period-start" requiredLabel={tCommon('required')}>
              {t('periodStart')}
            </Label>
            <input
              id="qm-period-start"
              name="periodStart"
              type="date"
              required
              defaultValue={period?.start ?? ''}
              className={FIELD}
              data-testid="qm-period-start"
            />
          </div>
          <div className="flex flex-col gap-[var(--space-4)]">
            <Label htmlFor="qm-period-end" requiredLabel={tCommon('required')}>
              {t('periodEnd')}
            </Label>
            <input
              id="qm-period-end"
              name="periodEnd"
              type="date"
              required
              defaultValue={period?.end ?? ''}
              className={FIELD}
              data-testid="qm-period-end"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[var(--space-12)]">
          <Button type="submit" variant="primary" data-testid="qm-compute">
            {period === null ? t('wizard.compute') : t('wizard.recompute')}
          </Button>
          <Text variant="body-sm" tone="mist">
            {t('wizard.previewOnly')}
          </Text>
        </div>
      </form>
    </Card>
  );
}
