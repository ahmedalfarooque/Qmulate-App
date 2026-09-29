import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { Card, Heading, Mono, Text, Well } from '@qmulate/ui';

import { Chip } from '@/components/endowments/Chip';
import { DualDateValue } from '@/components/endowments/DualDateValue';
import { RUN_STATUS_TONE } from '@/lib/distributions/labels';
import { runPath } from '@/lib/distributions/paths';

import { distVocabText } from './DistVocabLabel';
import { Sar } from './Sar';

import type { RunListRow } from '@/lib/distributions/types';

/**
 * Every live run for one endowment, newest period first.
 *
 * ⚠ THE PERIOD IS RENDERED WITH NO HIJRI SNAPSHOT ON THIS LIST, AND THAT IS THE HONEST CHOICE.
 * `distribution.list` projects `periodStart`/`periodEnd` as ISO strings and does NOT project
 * `periodStartHijri`/`periodEndHijri` — the frozen Umm al-Qura snapshots written at insert time. Passing
 * `hijri: null` makes `<DateValue>` show the Gregorian side alone; the alternative would be for this app to
 * RECOMPUTE a Hijri date, which NFR-02 forbids outright: a snapshot is a stored column precisely so a
 * record issued years ago still shows the Hijri date it was issued under, whatever the calendar library
 * does later. The run's own page reads `distribution.get`, which does project both, and shows the pair.
 *
 * ⚠ `engineVersion: null` MEANS NOBODY RECORDED ONE — never "the current engine". Migration 21 gave both
 * new columns no `@default` for exactly that reason, and a run with no recorded build cannot be bound to an
 * approval at all. The list says which runs are in that state instead of quietly filling it in.
 */
export async function RunList({
  locale,
  waqfId,
  runs,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly runs: readonly RunListRow[];
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });

  if (runs.length === 0) {
    return (
      <Card
        as="section"
        className="flex flex-col gap-[var(--space-8)] text-start"
        data-testid="qm-runs-empty"
      >
        <Heading level={2}>{t('empty')}</Heading>
        <Text tone="mist">{t('emptyBody')}</Text>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-[var(--space-12)]" data-testid="qm-run-list">
      {runs.map((run) => (
        <RunCard key={run.distributionId} locale={locale} waqfId={waqfId} run={run} />
      ))}
    </ul>
  );
}

/**
 * One run row, as its own `async` server component — the house pattern (`BeneficiaryPanel`'s
 * `BeneficiaryTr`). A chip label resolves through an async catalogue lookup, and `await` cannot live
 * inside a `.map` callback.
 */
async function RunCard({
  locale,
  waqfId,
  run,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly run: RunListRow;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <li>
      <Card
        as="article"
        className="flex flex-col gap-[var(--space-12)] text-start"
        data-testid="qm-run-row"
        data-distribution-id={run.distributionId}
        data-run-status={run.status}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-12)]">
          <div className="flex flex-col gap-[var(--space-4)]">
            <span className="qm-label">{t('period')}</span>
            <div className="flex flex-wrap items-baseline gap-[var(--space-8)]">
              <DualDateValue locale={locale} date={{ iso: run.periodStart, hijri: null }} />
              <span aria-hidden="true" className="text-mist-2">
                &ndash;
              </span>
              <DualDateValue locale={locale} date={{ iso: run.periodEnd, hijri: null }} />
            </div>
          </div>
          <Chip
            tone={RUN_STATUS_TONE[run.status] ?? 'neutral'}
            label={await distVocabText(locale, 'runStatus', run.status)}
          />
        </div>

        <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] sm:grid-cols-2">
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('waterfall.distributable')}</dt>
            <dd>
              <Well as="output" className="inline-flex w-fit">
                <Sar locale={locale} value={run.distributableSar} />
              </Well>
            </dd>
          </div>
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('engineVersion')}</dt>
            <dd>
              {run.engineVersion === null ? (
                <Text variant="body-sm" tone="mist">
                  {tCommon('notRecorded')}
                </Text>
              ) : (
                <Mono size="body-sm">{run.engineVersion}</Mono>
              )}
            </dd>
          </div>
        </dl>

        <Link
          href={runPath(locale, waqfId, run.distributionId)}
          className="qm-label text-blue-strong underline-offset-4 hover:underline focus-visible:shadow-focus"
          data-testid="qm-run-link"
        >
          {tCommon('openRecord')}
        </Link>
      </Card>
    </li>
  );
}
