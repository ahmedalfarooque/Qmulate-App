import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { Mono } from '@qmulate/ui';

import { KpiStrip } from '@/components/compliance/KpiStrip';
import { DualDateValue } from '@/components/endowments/DualDateValue';
import { Refusal } from '@/components/endowments/Refusal';
import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';

import type {
  BoardRow,
  BoardRule,
  DeadlineBoardView,
  EndowmentBoard,
  FilingsView,
  KycView,
} from '@/lib/compliance/types';
import type { Loaded } from '@/lib/endowments/types';
import type { ReactNode } from 'react';

/**
 * ═══════════════════════════════════════════════════════
 * THE COMPLIANCE BOARD FOR ONE ENDOWMENT (§14 §3) — E10's first screen
 * ═══════════════════════════════════════════════════════
 *
 * Six regions under the chip strip, each reading ONE kernel procedure and each rendering a refusal as a
 * refusal (`<Refusal>` with the kernel's message key) rather than as an empty region — an empty region is
 * a claim about the endowment, and the thing that failed was the read.
 *
 *  §3.2 DEADLINES — every rule from `deadline.board`, one line each. A rule with rows shows each row's
 *       state, its frozen due date in both calendars, and its business days remaining or late. A rule with
 *       NO row shows its CAUSE as a sentence: six kinds of absence, each its own sentence in both locales,
 *       because "—" would collapse "not recorded" (an owner act is owed), "recorded but not computable"
 *       (S11-1's calendar bound), "routed to nowhere", "not computed", "not yet in scope" (healthy) and "no
 *       subject" (healthy) into one cell. A MET row shows its discharge kind and date.
 *  §3.3 KYC — freshness per beneficiary, computed by the kernel on every read (never stored), with the
 *       three counts. An EMPTY register is said in words: nobody to verify is not everyone verified.
 *  §3.4 AML — the chip's sentence only. The compartment's rows never render here (§14:76); on 2026-09-02
 *       the kernel reports the figure as NOT MODELLED and the board says exactly that.
 *  §3.5 FILINGS — `filing.list` with BR-603's manual-status note rendered VERBATIM from the wire, so no
 *       screen can imply a live integration the product does not have.
 *  §3.6 DECISIONS — the overdue rows and the NOT_RECORDED causes pinned, each linking to the endowment
 *       record where the act is taken. THE BOARD HAS NO FORMS (the E3 no-affordance pin): nothing is
 *       recorded from here.
 *
 * ⚠ Binding rule 3 — the kernel's `unverifiedNote` is rendered as visible text over the deadlines region.
 */

export async function ComplianceBoard({
  locale,
  board,
}: {
  readonly locale: string;
  readonly board: EndowmentBoard;
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });

  return (
    <section
      className="flex flex-col gap-[var(--space-24)]"
      data-testid="qm-board"
      data-waqf={board.waqfId}
      data-tone={board.dominant}
    >
      <header className="flex flex-col gap-[var(--space-4)]">
        <p className="qm-label">
          {board.certificateNumber === null ? (
            board.waqfId
          ) : (
            <Mono size="body-sm">{board.certificateNumber}</Mono>
          )}
        </p>
        <h2 className="text-h2">{t('board.title')}</h2>
        <p className="text-body-sm text-mist">{t('board.intro')}</p>
        {board.deadlines.status === 'ok' ? (
          <p className="text-body-sm text-mist" data-testid="qm-board-as-of">
            {`${t('board.asOf')}: `}
            <DualDateValue locale={locale} date={board.deadlines.value.asOf} />
          </p>
        ) : null}
      </header>

      <KpiStrip locale={locale} kpis={board.kpis} />

      <Region testId="qm-deadlines" title={t('deadlines.title')} body={t('deadlines.body')}>
        <DeadlinesRegion locale={locale} loaded={board.deadlines} />
      </Region>

      <Region testId="qm-decisions" title={t('decisions.title')} body={t('decisions.body')}>
        <DecisionsRegion locale={locale} board={board} />
      </Region>

      <Region testId="qm-kyc" title={t('kyc.title')} body={t('kyc.body')}>
        <KycRegion locale={locale} loaded={board.kyc} />
      </Region>

      <Region testId="qm-aml" title={t('aml.title')} body={t('aml.body')}>
        {board.aml.status === 'ok' ? (
          <p className="text-body-sm" data-testid="qm-aml-sentence">
            {board.aml.value.assessable
              ? /* By KEY, never by position: a positional read renders a NEIGHBOURING chip's tone as
                   this region's sentence the day `composeComplianceKpis` reorders its return. */
                t(`tone.${board.kpis.find((chip) => chip.key === 'aml')?.tone ?? 'warning'}`)
              : t('aml.notModelled')}
          </p>
        ) : (
          <Refusal locale={locale} messageKey={board.aml.messageKey} />
        )}
      </Region>

      <Region testId="qm-filings" title={t('filings.title')} body={t('filings.body')}>
        <FilingsRegion locale={locale} loaded={board.filings} />
      </Region>

      <p className="text-body-sm text-mist" data-testid="qm-board-no-forms">
        {t('board.noForms')}
      </p>
    </section>
  );
}

/* ═════════════════════════════════════════════════
 * Regions
 * ═════════════════════════════════════════════════ */

function Region({
  testId,
  title,
  body,
  children,
}: {
  readonly testId: string;
  readonly title: string;
  readonly body: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="qm-card flex flex-col gap-[var(--space-12)]" data-testid={testId}>
      <header className="flex flex-col gap-[var(--space-4)]">
        <h3 className="text-h3">{title}</h3>
        <p className="text-body-sm text-mist">{body}</p>
      </header>
      {children}
    </section>
  );
}

async function DeadlinesRegion({
  locale,
  loaded,
}: {
  readonly locale: string;
  readonly loaded: Loaded<DeadlineBoardView>;
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  if (loaded.status !== 'ok') return <Refusal locale={locale} messageKey={loaded.messageKey} />;
  const board = loaded.value;

  return (
    <div className="flex flex-col gap-[var(--space-12)]">
      <UnverifiedMark locale={locale} />
      {board.calendar.available ? (
        <p className="text-body-sm text-mist" data-testid="qm-calendar-coverage">
          {`${t('deadlines.calendar')}: `}
          <Mono size="body-sm">{board.calendar.coverage.from}</Mono>
          {' – '}
          <Mono size="body-sm">{board.calendar.coverage.to}</Mono>
        </p>
      ) : (
        <p className="text-body-sm text-warning" data-testid="qm-calendar-unavailable">
          {`${t('deadlines.calendarUnavailable')} `}
          <Mono size="body-sm">{board.calendar.refusal ?? ''}</Mono>
        </p>
      )}
      <ul className="flex flex-col gap-[var(--space-8)]">
        {board.rules.map((rule) => (
          <RuleLine key={rule.ruleKey} locale={locale} rule={rule} />
        ))}
      </ul>
    </div>
  );
}

async function RuleLine({ locale, rule }: { readonly locale: string; readonly rule: BoardRule }) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  const worst = rule.rows.some((row) => row.state === 'overdue')
    ? 'overdue'
    : (rule.rows[0]?.state ?? null);

  return (
    <li
      className="flex flex-col gap-[var(--space-4)] border-t border-edge pt-[var(--space-8)]"
      data-testid={`qm-rule-${rule.ruleKey}`}
      data-state={worst ?? ''}
      data-cause={rule.cause ?? ''}
    >
      <div className="flex flex-wrap items-baseline gap-[var(--space-8)]">
        <span className="text-body font-medium">{t(`rule.${rule.ruleKey}`)}</span>
        {rule.zeroTolerance ? (
          <span className="qm-label text-danger">{t('deadlines.zeroTolerance')}</span>
        ) : null}
      </div>
      {rule.rows.length === 0 && rule.cause !== null ? (
        <p className="text-body-sm text-mist" data-testid={`qm-cause-${rule.ruleKey}`}>
          {t(`cause.${rule.cause}`)}
        </p>
      ) : null}
      {rule.rows.map((row) => (
        <RowLine key={row.id} locale={locale} row={row} />
      ))}
    </li>
  );
}

async function RowLine({ locale, row }: { readonly locale: string; readonly row: BoardRow }) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  const tone =
    row.state === 'overdue'
      ? 'text-danger'
      : row.state === 'at_risk' || row.state === 'due_soon' || row.state === 'cannot_compute'
        ? 'text-warning'
        : row.state === 'met'
          ? 'text-success'
          : 'text-ink';

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-[var(--space-12)] gap-y-[var(--space-4)] text-body-sm"
      data-testid={`qm-row-${row.id}`}
      data-state={row.state}
    >
      <span className={`font-medium ${tone}`} data-testid={`qm-row-${row.id}-state`}>
        {t(`state.${row.state}`)}
      </span>
      <span>
        {`${t('deadlines.due')}: `}
        <DualDateValue locale={locale} date={row.due} />
      </span>
      {row.businessDaysRemaining !== null ? (
        <span data-testid={`qm-row-${row.id}-days`}>
          {row.businessDaysRemaining < 0
            ? t('deadlines.late', { count: String(-row.businessDaysRemaining) })
            : t('deadlines.remaining', { count: String(row.businessDaysRemaining) })}
        </span>
      ) : null}
      {row.state === 'cannot_compute' ? (
        <span className="text-warning">
          {`${t('deadlines.cannotCompute')} `}
          <Mono size="body-sm">{row.cannotCompute ?? ''}</Mono>
        </span>
      ) : null}
      {row.discharged !== null ? (
        <span data-testid={`qm-row-${row.id}-discharged`}>
          {`${t('deadlines.discharged')} (${row.discharged.kind}): `}
          <DualDateValue locale={locale} date={row.discharged.on} />
        </span>
      ) : null}
    </div>
  );
}

async function DecisionsRegion({
  locale,
  board,
}: {
  readonly locale: string;
  readonly board: EndowmentBoard;
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  if (board.deadlines.status !== 'ok') {
    return <Refusal locale={locale} messageKey={board.deadlines.messageKey} />;
  }
  const overdue = board.deadlines.value.rules.flatMap((rule) =>
    rule.rows.filter((row) => row.state === 'overdue').map((row) => ({ rule, row })),
  );
  const notRecorded = board.deadlines.value.rules.filter((rule) => rule.cause === 'NOT_RECORDED');
  const recordHref = `/${locale}/endowments/${board.waqfId}`;

  if (overdue.length === 0 && notRecorded.length === 0) {
    return (
      <p className="text-body-sm text-mist" data-testid="qm-decisions-empty">
        {t('decisions.empty')}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-[var(--space-8)]">
      {overdue.map(({ rule, row }) => (
        <li
          key={row.id}
          className="flex flex-wrap items-baseline gap-[var(--space-8)] text-body-sm"
          data-testid={`qm-decision-overdue-${rule.ruleKey}`}
        >
          <span className="font-medium text-danger">{t('decisions.overdue')}</span>
          <span>{t(`rule.${rule.ruleKey}`)}</span>
          <DualDateValue locale={locale} date={row.due} />
          <Link href={recordHref} className="text-blue underline-offset-2 hover:underline">
            {t('decisions.openRecord')}
          </Link>
        </li>
      ))}
      {notRecorded.map((rule) => (
        <li
          key={rule.ruleKey}
          className="flex flex-wrap items-baseline gap-[var(--space-8)] text-body-sm"
          data-testid={`qm-decision-record-${rule.ruleKey}`}
        >
          <span className="font-medium text-warning">{t('decisions.recordClockStart')}</span>
          <span>{t(`rule.${rule.ruleKey}`)}</span>
          <Link href={recordHref} className="text-blue underline-offset-2 hover:underline">
            {t('decisions.openRecord')}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function KycRegion({
  locale,
  loaded,
}: {
  readonly locale: string;
  readonly loaded: Loaded<KycView>;
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  const tEnd = await getTranslations({ locale, namespace: 'endowments' });
  if (loaded.status !== 'ok') return <Refusal locale={locale} messageKey={loaded.messageKey} />;
  const { rows, counts } = loaded.value;
  if (rows.length === 0) {
    return (
      <p className="text-body-sm text-mist" data-testid="qm-kyc-empty">
        {t('kyc.empty')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--space-8)] text-body-sm">
      <p data-testid="qm-kyc-counts">
        {(['FRESH', 'STALE', 'UNVERIFIED'] as const).map((freshness, index) => (
          <span key={freshness} className={index === 0 ? '' : 'ms-[var(--space-12)]'}>
            {`${tEnd(`beneficiaries.kycValue.${freshness}`)}: `}
            <Mono size="body-sm">{String(counts[freshness])}</Mono>
          </span>
        ))}
      </p>
      <p className="text-mist">{t('kyc.count', { count: String(rows.length) })}</p>
      <UnverifiedMark locale={locale} />
    </div>
  );
}

async function FilingsRegion({
  locale,
  loaded,
}: {
  readonly locale: string;
  readonly loaded: Loaded<FilingsView>;
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  if (loaded.status !== 'ok') return <Refusal locale={locale} messageKey={loaded.messageKey} />;
  const { rows, manualStatusNote } = loaded.value;
  return (
    <div className="flex flex-col gap-[var(--space-8)] text-body-sm">
      {/* BR-603, verbatim from the wire: no screen may imply a live integration. */}
      <p className="text-mist" data-testid="qm-filings-manual-note" lang="en" dir="ltr">
        {manualStatusNote}
      </p>
      {rows.length === 0 ? (
        <p className="text-mist" data-testid="qm-filings-empty">
          {t('filings.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-[var(--space-4)]">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline gap-[var(--space-12)]"
              data-testid={`qm-filing-${row.platform}`}
              data-status={row.status}
            >
              <span className="font-medium">{t(`filings.platform.${row.platform}`)}</span>
              <span>{t(`filings.status.${row.status}`)}</span>
              {row.lastUpdated !== null ? (
                <span className="text-mist">
                  {`${t('filings.lastUpdated')}: `}
                  <DualDateValue locale={locale} date={row.lastUpdated} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
