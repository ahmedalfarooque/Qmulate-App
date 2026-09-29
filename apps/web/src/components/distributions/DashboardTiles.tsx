import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@qmulate/i18n';
import { Mono, StatTile } from '@qmulate/ui';

import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';

import type { DashboardCounts } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO LIVE TILES — AND THE NUMBERS THAT STOP A ZERO FROM LYING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The dashboard shipped with two PLACEHOLDER tiles whose figure was an em-dash, and the comment above
 * them said why: "an all-green board with fabricated numbers is the single most dangerous placeholder this
 * product could ship". These two tiles are the first real figures on that board, and they are built to the
 * same standard rather than against it.
 *
 *  · **Runs awaiting approval** is EXACT. It is a count of rows at `PENDING_APPROVAL`.
 *
 *  · **Distributions past their deadline** is counted FROM WHAT EACH RUN RECORDED, not computed here. The
 *    deadline lives in `@qmulate/domain`'s Umm al-Qura and KSA business-day code, which this app cannot
 *    import — and a second deadline implementation in the browser's language would be a second answer to
 *    "is this late". So the tile counts runs whose own stored `timing.status` is `OVERDUE`.
 *
 *    ⚠ WHICH IS WHY THE CAPTION CARRIES `runsWithoutRecordedTiming`. A run written before that trace shape
 *    existed records no timing at all, and a bare zero would then read as "none are late" when the truth is
 *    "none could be assessed". The two are different claims and the tile makes both.
 *
 *    ⚠ AND THE WINDOW IS UNVERIFIED (binding rule 3): the 3-month post-fiscal-year-end default, and
 *    `EARLIER_OF` as the rule that decides which calendar binds. Neither has been confirmed against primary
 *    Saudi law, so the tile carries `<UnverifiedMark>` as visible TEXT — not a tooltip. A caveat that only
 *    appears on hover is not a caveat on a printed board.
 *
 * ── THE TILE IS `@qmulate/ui`'s `StatTile`, NOT A LOCAL COPY ───────────────────────────────
 * The dashboard previously declared its own and wrote `shadow-inset` directly, which breaks the one rule
 * that lets the flat report theme flatten the whole product without a component change: only `<Surface>`
 * and `<Well>` may emit a box-shadow. `StatTile` composes from `<Card>` and `<Well>` and gets that for free.
 *
 * ── COLOUR IS NEVER THE ONLY SIGNAL ───────────────────────────────────────────────────────
 * `status.label` on `StatTile` is REQUIRED by its own type, so there is no way to obtain a warning-toned
 * tile without the words that say why. A non-zero count is toned `warning` and labelled; zero is neutral.
 *
 * ⚠ EVERY TEST HOOK IS ON A WRAPPING `<span>`, NEVER ON `<Mono>`. `MonoProps` declares no `data-*`
 * passthrough, so `<Mono data-testid="…">` is silently dropped — measured in the rendered DOM, where the
 * attribute did not appear at all. A hook that vanishes is worse than none, because the assertion that
 * depends on it then fails for a reason nobody can see.
 */
export async function DashboardTiles({
  locale,
  counts,
}: {
  readonly locale: string;
  readonly counts: DashboardCounts;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const resolved = resolveLocale(locale);

  return (
    <>
      <StatTile
        locale={resolved}
        eyebrow={t('dashboard.pendingTitle')}
        value={
          <span data-testid="qm-tile-pending-value">
            <Mono className="text-h2">{String(counts.pendingApproval)}</Mono>
          </span>
        }
        status={{
          tone: counts.pendingApproval > 0 ? 'warning' : 'neutral',
          label: t('approval.awaitingChecker'),
        }}
        caption={t('dashboard.pendingBody')}
        className="text-start"
      />

      <StatTile
        locale={resolved}
        eyebrow={t('dashboard.overdueTitle')}
        value={
          <span data-testid="qm-tile-overdue-value">
            <Mono className="text-h2">{String(counts.overdue)}</Mono>
          </span>
        }
        status={{
          tone: counts.overdue > 0 ? 'warning' : 'neutral',
          label: t('timingStatus.OVERDUE'),
        }}
        caption={
          <span className="flex flex-col gap-[var(--space-4)]">
            <span>{t('dashboard.overdueBody')}</span>
            {/*
             * THE HONESTY FLOOR, AND IT IS CONDITIONAL ON PURPOSE.
             *
             * The zero above is only an assurance when every live run in scope actually recorded a timing.
             * When one did not — or when no endowment answered at all — the figure means "not assessed",
             * not "not late", and the tile says so with the count.
             *
             * ⚠ IT IS LABELLED `common.notRecorded` BECAUSE NO DEDICATED KEY EXISTS AND NONE WAS INVENTED.
             * The catalogue is `packages/i18n`'s file, not this stage's, so a staff-facing string for
             * "live runs whose deadline could not be assessed" is REPORTED as owed rather than written
             * here. `common.notRecorded` is the generic absence label this app already uses everywhere and
             * it is true of exactly this number; it is simply less specific than the sentence this
             * deserves.
             */}
            {counts.runsWithoutRecordedTiming > 0 || counts.endowmentsRead === 0 ? (
              <span data-testid="qm-tile-overdue-basis">
                {`${tCommon('notRecorded')}: `}
                <Mono size="body-sm">{String(counts.runsWithoutRecordedTiming)}</Mono>
              </span>
            ) : null}
            <UnverifiedMark locale={locale} />
          </span>
        }
        className="text-start"
      />
    </>
  );
}
