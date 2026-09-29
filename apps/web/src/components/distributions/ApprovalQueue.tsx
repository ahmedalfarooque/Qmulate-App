import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { Card, Heading, Mono, Text, Well } from '@qmulate/ui';

import { Chip } from '@/components/endowments/Chip';
import { DualDateValue } from '@/components/endowments/DualDateValue';
import { VocabLabel } from '@/components/endowments/VocabLabel';
import { RUN_STATUS_TONE } from '@/lib/distributions/labels';
import { runPath } from '@/lib/distributions/paths';

import { distVocabText } from './DistVocabLabel';
import { Sar } from './Sar';

import type { CallerFacts, QueueRow } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE NAZIR'S QUEUE — WHAT IS WAITING ON A DECISION, ACROSS EVERY ENDOWMENT IN SCOPE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ IT COVERS DISTRIBUTION RUNS AND NOTHING ELSE, AND THAT IS A FACT ABOUT THE KERNEL. There is no
 * `approval.list` procedure: the API exposes `approval.get({approvalRequestId})` and nothing that
 * enumerates open requests. So this queue is composed from `distribution.list` per endowment plus one
 * `approval.get` per run that names an approval. A pending `RESERVED_MATTER` or `BANK_MOVEMENT` therefore
 * does NOT appear here — reported to the API layer rather than papered over with a heading that implies
 * completeness. The section is titled from the `distribution` namespace so a reader can see its scope.
 *
 * ── WHY THE MAKER IS SHOWN ON EVERY ROW ───────────────────────────────────────────────────
 * The row a Nazir must not act on looks exactly like the one they must, unless the maker is visible.
 * `resolveApprover` refuses maker = checker BY IDENTITY, before it even looks for a `NAZIR` grant — so a
 * caller who prepared a run is refused on it even though they are also the Nazir. Printing the maker's id
 * beside every row is what makes that predictable instead of surprising, and the row the caller made is
 * marked with the approved `SEGREGATION_OF_DUTIES` sentence rather than left to fail on click.
 *
 * ⚠ THE MONEY ON A ROW IS THE DISTRIBUTABLE, NOT A PAYMENT. Nothing in this queue has been paid; the
 * figure is what the run computed as available to distribute, and `execute` is a separate rung after the
 * approval.
 */
export async function ApprovalQueue({
  locale,
  rows,
  caller,
}: {
  readonly locale: string;
  readonly rows: readonly QueueRow[];
  readonly caller: CallerFacts | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });

  if (rows.length === 0) {
    return (
      <Card
        as="section"
        className="flex flex-col gap-[var(--space-8)] text-start"
        data-testid="qm-queue-empty"
      >
        <Heading level={2}>{t('approval.queueEmpty')}</Heading>
        <Text tone="mist">{t('approval.queueEmptyBody')}</Text>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-[var(--space-12)]" data-testid="qm-approval-queue">
      {rows.map((row) => (
        <QueueCard
          key={`${row.waqfId}:${row.run.distributionId}`}
          locale={locale}
          row={row}
          caller={caller}
        />
      ))}
    </ul>
  );
}

/**
 * One queue row, as its own `async` server component — the house pattern. A chip label resolves through an
 * async catalogue lookup, and `await` cannot live inside a `.map` callback.
 */
async function QueueCard({
  locale,
  row,
  caller,
}: {
  readonly locale: string;
  readonly row: QueueRow;
  readonly caller: CallerFacts | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tErrors = await getTranslations({ locale, namespace: 'errors' });

  /**
   * The identity test, exactly as `resolveApprover` step 3 makes it: against the PERSISTED `makerId`, and
   * BEFORE any role is considered. A caller holding both a `FINANCE` and a `NAZIR` grant on this endowment
   * is refused on their own run even though they are also the Nazir.
   */
  const callerIsMaker =
    caller !== null && row.approval !== null && row.approval.makerId === caller.userId;

  return (
    <li>
      <Card
        as="article"
        className="flex flex-col gap-[var(--space-12)] text-start"
        data-testid="qm-queue-row"
        data-waqf-id={row.waqfId}
        data-distribution-id={row.run.distributionId}
        data-run-status={row.run.status}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-12)]">
          <div className="flex flex-col gap-[var(--space-4)]">
            <span className="qm-label">{tCommon('endowment')}</span>
            {/* An LTR island inside an RTL page: without the isolate, a certificate number reorders
                itself against Arabic text and the number a Nazir reads off the screen is not the
                number in the deed. */}
            {row.certificateNumber === null ? (
              <Mono size="body-sm">{row.waqfId}</Mono>
            ) : (
              <Mono>{row.certificateNumber}</Mono>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-[var(--space-8)]">
            <Chip
              tone={RUN_STATUS_TONE[row.run.status] ?? 'neutral'}
              label={await distVocabText(locale, 'runStatus', row.run.status)}
            />
            {row.approval === null ? null : (
              <Chip
                tone={row.approval.status === 'APPROVED' ? 'success' : 'warning'}
                label={
                  <VocabLabel locale={locale} vocab="approvalStatus" value={row.approval.status} />
                }
              />
            )}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] sm:grid-cols-3">
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('approval.queuePeriod')}</dt>
            <dd className="flex flex-wrap items-baseline gap-[var(--space-8)]">
              <DualDateValue locale={locale} date={{ iso: row.run.periodStart, hijri: null }} />
              <span aria-hidden="true" className="text-mist-2">
                &ndash;
              </span>
              <DualDateValue locale={locale} date={{ iso: row.run.periodEnd, hijri: null }} />
            </dd>
          </div>
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('approval.queueDistributable')}</dt>
            <dd>
              {/* ⚠ NOTHING HERE HAS BEEN PAID. This is what the run computed as available to
                  distribute; `execute` is a separate rung after the approval. */}
              <Well as="output" className="inline-flex w-fit">
                <Sar locale={locale} value={row.run.distributableSar} />
              </Well>
            </dd>
          </div>
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('approval.maker')}</dt>
            <dd>
              {row.approval === null ? (
                <Text variant="body-sm" tone="mist">
                  {tCommon('notRecorded')}
                </Text>
              ) : (
                <Mono size="body-sm">{row.approval.makerId}</Mono>
              )}
            </dd>
          </div>
        </dl>

        {callerIsMaker ? (
          <Well invalid data-testid="qm-queue-segregation">
            <Text variant="body-sm">{tErrors('access.SEGREGATION_OF_DUTIES')}</Text>
          </Well>
        ) : null}

        <Link
          href={runPath(locale, row.waqfId, row.run.distributionId)}
          className="qm-label text-blue-strong underline-offset-4 hover:underline focus-visible:shadow-focus"
          data-testid="qm-queue-link"
        >
          {tCommon('openRecord')}
        </Link>
      </Card>
    </li>
  );
}
