import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Card, Eyebrow, Heading, Mono, Text, Well } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { CorpusReceiptsPanel } from '@/components/distributions/CorpusReceiptsPanel';
import { LinesPanel } from '@/components/distributions/LinesPanel';
import { MakerCheckerPanel } from '@/components/distributions/MakerCheckerPanel';
import { RunNotesPanel } from '@/components/distributions/RunNotesPanel';
import { Sar } from '@/components/distributions/Sar';
import { DiagnosticCode } from '@/components/endowments/DiagnosticCode';
import { DualDateValue } from '@/components/endowments/DualDateValue';
import { Refusal } from '@/components/endowments/Refusal';
import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';
import {
  loadApproval,
  loadCaller,
  loadLineItems,
  loadStoredRun,
} from '@/lib/distributions/loaders';
import { REFUSAL_PARAM } from '@/lib/distributions/paths';
import { kernelMessageKey } from '@/lib/trpc/client';

import type { Metadata } from 'next';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ONE PERSISTED RUN — THE RECORD, AND THE GOVERNANCE OF IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * This is where a run lives after the wizard: the five money columns migration 21 records, the identity of
 * the build that produced it, the stored computation, and the maker/checker panel that carries it from
 * `COMPUTED` through `PENDING_APPROVAL` to `EXECUTED`.
 *
 * ── THREE THINGS THIS SCREEN STATES RATHER THAN FILLS IN ──────────────────────────────────
 *  1. **NET INCOME IS NOT SHOWN.** Migration 21 records five money columns and net income is not one of
 *     them. Deriving a sixth figure by subtracting two decimal strings would be money arithmetic in this
 *     app, which is banned outright — every halala→decimal conversion belongs to `packages/api`. The five
 *     recorded figures are shown; the preview screen shows all six because the engine hands it the whole
 *     waterfall.
 *  2. **THE CORPUS RECEIPTS ARE SHOWN BY ID, WITH NO AMOUNT.** `distribution.get` projects no
 *     `excludedCapitalReceipts`; the stored input holds each amount as an exact base-10 HALALA integer, and
 *     converting it here is the same banned arithmetic. So the ids, the class and the corpus source are
 *     shown and the amount reads `common.notRecorded` — which is true of the PROJECTION, and is why the
 *     panel's own copy distinguishes "not projected" from "zero".
 *  3. **`engineVersion: null` MEANS NOBODY RECORDED ONE**, never "the current engine". `dist-001` is seeded
 *     as a historical record with no engine version and a computation trace that records its own
 *     inconsistency rather than repairing it. This screen shows exactly that.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string; distributionId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'distribution' });
  return { title: t('runTitle') };
}

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; waqfId: string; distributionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, waqfId, distributionId } = await params;
  const query = await searchParams;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  // Re-validated, never trusted because an action wrote it. See the wizard's note.
  const rawRefusal = query[REFUSAL_PARAM];
  const actionRefusal =
    typeof rawRefusal === 'string' ? kernelMessageKey({ messageKey: rawRefusal }, locale) : null;

  // Independent reads: a refusal on any one of them must not blank the others. The line items in
  // particular use a DIFFERENT permission (`distribution:line_item:read`, which the `beneficiary` preset
  // holds and `distribution:run:read` is not), so one may be refused while the other is not.
  const [stored, caller, lineItems] = await Promise.all([
    loadStoredRun(locale, waqfId, distributionId),
    loadCaller(locale),
    loadLineItems(locale, waqfId, distributionId),
  ]);
  const callerFacts = caller.status === 'ok' ? caller.value : null;

  if (stored.status !== 'ok') {
    return (
      <AppShell>
        <Refusal locale={locale} messageKey={stored.messageKey} />
      </AppShell>
    );
  }

  const run = stored.value;
  if (run === null) {
    // Absence reads as NOT FOUND, never as FORBIDDEN: the endowment's existence is not disclosed by a
    // different wording for "you may not see this" and "this is not here".
    return (
      <AppShell>
        <Refusal locale={locale} messageKey="errors.access.NO_GRANT" />
      </AppShell>
    );
  }

  const approval =
    run.approvalRequestId === null
      ? null
      : await loadApproval(locale, waqfId, run.approvalRequestId);

  const trace = run.trace;

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-8)] text-start">
          <Eyebrow tick>{t('title')}</Eyebrow>
          <Heading level={1}>{t('runTitle')}</Heading>
          <div className="flex flex-wrap items-baseline gap-[var(--space-12)]">
            <span className="qm-label">{t('period')}</span>
            {/* BOTH calendars, from the FROZEN snapshots written at insert time. Never recomputed:
                a run recorded years ago must still show the Hijri date it was recorded under. */}
            <DualDateValue locale={locale} date={run.periodStart} />
            <span aria-hidden="true" className="text-mist-2">
              &ndash;
            </span>
            <DualDateValue locale={locale} date={run.periodEnd} />
          </div>
        </header>

        {actionRefusal === null ? null : (
          <Refusal
            locale={locale}
            messageKey={actionRefusal}
            title={t('approval.notAuthorisedTitle')}
          />
        )}

        <MakerCheckerPanel
          locale={locale}
          run={run}
          approval={approval !== null && approval.status === 'ok' ? approval.value : null}
          caller={callerFacts}
        />

        {/* ── The five recorded money columns ───────────────────────────────────────────── */}
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-16)] text-start"
          data-testid="qm-stored-waterfall"
        >
          <div className="flex flex-col gap-[var(--space-4)]">
            <Heading level={2}>{t('waterfall.title')}</Heading>
            <Text tone="mist">{t('waterfall.intro')}</Text>
          </div>
          <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <Row label={t('waterfall.revenue')} name="revenue">
              <Sar locale={locale} value={run.grossRevenueSar} size="lcd" />
            </Row>
            <Row label={t('waterfall.maintenanceReserve')} name="reserve">
              <Sar locale={locale} value={run.reserveSar} />
            </Row>
            <Row label={t('waterfall.operating')} name="operating">
              <Sar locale={locale} value={run.operatingSar} />
            </Row>
            <Row
              label={t('waterfall.nazirFee')}
              name="nazirFee"
              note={
                <span className="flex flex-col gap-[var(--space-4)]">
                  <span>{t('waterfall.nazirFeeDeedNote')}</span>
                  {/* ⚠ The 10% ʿushr this engagement's deed sets is UNVERIFIED against primary law, and
                      is not the Awqaf Law's separate ≤10%-of-net-income Authority fee. */}
                  <UnverifiedMark locale={locale} />
                </span>
              }
            >
              <Sar locale={locale} value={run.nazirFeeSar} />
            </Row>
            <Row label={t('waterfall.distributable')} name="distributable">
              <Sar locale={locale} value={run.distributableSar} size="lcd" />
            </Row>
          </dl>
        </Card>

        {/* ── The build that produced it ────────────────────────────────────────────────── */}
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-12)] text-start"
          data-testid="qm-run-identity"
        >
          <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] sm:grid-cols-2">
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
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{t('runDigest')}</dt>
              <dd className="overflow-x-auto">
                {run.runDigest === null ? (
                  <Text variant="body-sm" tone="mist">
                    {tCommon('notRecorded')}
                  </Text>
                ) : (
                  <Mono size="body-sm">{run.runDigest}</Mono>
                )}
              </dd>
            </div>
            {run.executedAt === null ? null : (
              <div className="flex flex-col gap-[var(--space-4)]">
                <dt className="qm-label">{t('approval.submittedAt')}</dt>
                <dd>
                  <DualDateValue locale={locale} date={run.executedAt} />
                </dd>
              </div>
            )}
            {trace?.entitlementRule === undefined || trace.entitlementRule === null ? null : (
              <div className="flex flex-col gap-[var(--space-4)]">
                <dt className="qm-label">{t('lines.rule')}</dt>
                <dd className="flex flex-col gap-[var(--space-4)]">
                  {/* TIER 1 — a machine code. Its wording is approved elsewhere. */}
                  <DiagnosticCode locale={locale} code={trace.entitlementRule} />
                  <Text variant="body-sm" tone="mist">
                    {t('lines.noCopyBody')}
                  </Text>
                </dd>
              </div>
            )}
          </dl>
          <Text variant="body-sm" tone="mist">
            {t('runDigestBody')}
          </Text>
        </Card>

        {/* ── The corpus, by id ─────────────────────────────────────────────────────────── */}
        {trace === null ? null : (
          <CorpusReceiptsPanel locale={locale} receipts={trace.corpusReceipts} totalSar={null} />
        )}

        {/* ── The computed lines, from the stored run ───────────────────────────────────── */}
        {trace === null ? null : (
          <LinesPanel locale={locale} lines={trace.lines} totals={trace.totals} />
        )}

        {/* ── The PERSISTED line items — the record after `execute`, and a different table ─ */}
        {lineItems.status === 'ok' && lineItems.value.length > 0 ? (
          <Card
            as="section"
            className="flex flex-col gap-[var(--space-12)] text-start"
            data-testid="qm-line-items"
          >
            <Heading level={2}>{t('lines.title')}</Heading>
            <Text tone="mist">{t('approval.executeBody')}</Text>
            <ul className="flex flex-col gap-[var(--space-8)]">
              {lineItems.value.map((item) => (
                <li
                  key={item.lineItemId}
                  data-testid="qm-line-item"
                  data-beneficiary-id={item.beneficiaryId}
                  data-line-status={item.status}
                  className="flex flex-wrap items-baseline gap-[var(--space-12)] rounded-control border border-edge bg-panel-tint px-[var(--space-12)] py-[var(--space-8)]"
                >
                  <Mono size="body-sm">{item.beneficiaryId}</Mono>
                  <Well as="output" className="inline-flex w-fit" padded={false}>
                    <Sar locale={locale} value={item.amountSar} size="body-sm" />
                  </Well>
                  <Mono size="body-sm" tone="mist">{`${item.sharePercent}%`}</Mono>
                  {/* The engine's own reasonCode, written verbatim into a free-text column. TIER 1. */}
                  {item.blockedReason === null ? null : (
                    <DiagnosticCode locale={locale} code={item.blockedReason} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* ── Everything the run said about itself ──────────────────────────────────────── */}
        {trace === null ? (
          <Card
            as="section"
            className="flex flex-col gap-[var(--space-8)] text-start"
            data-testid="qm-no-trace"
          >
            <Heading level={3}>{t('traceTitle')}</Heading>
            {/* A run whose stored computation cannot be read is SAID to be unreadable. Rendering an
                empty trace would claim the run recorded nothing, which is a different fact. */}
            <Text tone="mist">{tCommon('notRecorded')}</Text>
          </Card>
        ) : (
          <RunNotesPanel
            locale={locale}
            flags={trace.flags}
            invariantsChecked={trace.invariantsChecked}
            invariantsNotAsserted={trace.invariantsNotAsserted}
            unverifiedNotes={trace.unverifiedNotes}
            timing={trace.timing}
            authorityNotices={[]}
            diagnostics={trace.diagnostics}
            trace={trace.trace}
          />
        )}
      </div>
    </AppShell>
  );
}

/** One `<dt>`/`<dd>` pair of the stored waterfall. */
function Row({
  label,
  name,
  note,
  children,
}: {
  readonly label: string;
  readonly name: string;
  readonly note?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="contents">
      <dt className="qm-label">{label}</dt>
      <dd
        className="flex min-w-0 flex-col gap-[var(--space-4)]"
        data-testid="qm-stored-row"
        data-row={name}
      >
        <Well as="output" className="inline-flex w-fit">
          {children}
        </Well>
        {note === undefined ? null : (
          <Text variant="body-sm" tone="mist">
            {note}
          </Text>
        )}
      </dd>
    </div>
  );
}
