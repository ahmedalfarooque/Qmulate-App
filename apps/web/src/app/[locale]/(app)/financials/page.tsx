import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { CurrencyValue, Mono } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { Refusal } from '@/components/endowments/Refusal';
import { FinancialBoard } from '@/components/financials/FinancialBoard';
import { loadFinancialRollup } from '@/lib/financials/loaders';

import type { FinancialRollupLine } from '@/lib/financials/types';
import type { Metadata } from 'next';

/**
 * `/financials` — THE FINANCIAL SCREEN. **S11 · 2c (E10).**
 *
 * ── WHY IT IS ITS OWN ROUTE ────────────────────────────────────────────────────────────────────
 * Three specs disagreed: `13-ux` §10 specifies a *"Financial ledger & reconciliation"* screen (the
 * ONLY layout spec for financial figures in the repository), `05-scope-phasing-priority.md:144` said
 * the P0 financial view was *"surfaced on the compliance dashboard"*, and `17-build-ship-dod.md:138`
 * says *"both dashboards"*. The product owner ruled on 2026-09-03 (*"i like b"*): its own screen.
 * Under the rejected option the figures would have been a REGION on `/dashboard`, and E10's exit
 * clause *"both dashboards render live fixture data"* could not honestly have been claimed — one
 * dashboard with two regions is not two dashboards. `05-scope:144` is now the DRIFTED side and is
 * annotated in place, never silently rewritten.
 *
 * ── WHAT IT CLAIMS AND WHAT IT DOES NOT ────────────────────────────────────────────────────────
 * ⚠ **E10's EXIT IS NOT CLAIMED BY THIS SCREEN, and not because the work is short.** `17:138` DEFINES
 * the financial dashboard as *"cash position, revenue/expense, distributions, arrears;
 * **class-appropriate statements**"* — so the statement export sits INSIDE the exit's own definition,
 * while `05-scope:144` marks statement generation **P1**. **E10's exit is P0 and requires a feature
 * the phasing document marks P1**: that is a SPEC CONFLICT, it is with the product owner, and neither
 * a carve-out claim nor a qualified one is written here. Six premature exit claims already sit on
 * this record.
 *
 * ── THE READS ──────────────────────────────────────────────────────────────────────────────────
 * ONE endowment at a time, because every read behind it is endowment-scoped. `?waqf=` selects; the
 * first in the caller's own scope is the default; each option is a LINK, so the screen needs no
 * client JavaScript. A refused read renders as a refusal — never as a zero, which on a financial
 * screen would be a claim about a family's money made from a failed request.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('financials') };
}

export default async function FinancialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;

  /** Deny by default — identical gate to every other app route (AC-E0-7). */
  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'common' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const tFin = await getTranslations({ locale, namespace: 'financials' });

  const rollup = await loadFinancialRollup(locale);

  const requested = typeof query['waqf'] === 'string' ? query['waqf'] : null;
  const boards = rollup.status === 'ok' ? rollup.value.boards : [];
  const selected = boards.find((board) => board.waqfId === requested) ?? boards[0] ?? null;

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)]">
          <p className="qm-label">{t('portfolioScope')}</p>
          <h1 className="text-h1">{tNav('financials')}</h1>
          <p className="text-body-sm text-mist">{tFin('subtitle')}</p>
        </header>

        {/* The selector — the caller's OWN scope, as links. */}
        <section
          className="qm-card flex flex-col gap-[var(--space-12)]"
          data-testid="qm-fin-selector"
        >
          <h2 className="text-h3">{tFin('selector.title')}</h2>
          <p className="text-body-sm text-mist">{tFin('selector.body')}</p>
          {rollup.status !== 'ok' ? (
            <Refusal locale={locale} messageKey={rollup.messageKey} />
          ) : boards.length === 0 ? (
            <p className="text-body-sm text-mist" data-testid="qm-fin-selector-none">
              {tFin('selector.none')}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-[var(--space-8)]">
              {boards.map((board) => (
                <li key={board.waqfId}>
                  <Link
                    href={`/${locale}/financials?waqf=${encodeURIComponent(board.waqfId)}`}
                    aria-current={selected?.waqfId === board.waqfId ? 'true' : undefined}
                    data-testid={`qm-fin-selector-${board.waqfId}`}
                    className={`flex min-h-tap items-center rounded-control border px-[var(--space-12)] text-body-sm ${
                      selected?.waqfId === board.waqfId
                        ? 'border-blue bg-panel text-ink shadow-raised-sm'
                        : 'border-edge bg-well text-mist'
                    }`}
                  >
                    {board.certificateNumber === null ? (
                      board.waqfId
                    ) : (
                      <Mono size="body-sm">{board.certificateNumber}</Mono>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {rollup.status === 'ok' && rollup.value.lines.length > 0 ? (
          <RollupStrip locale={locale} lines={rollup.value.lines} />
        ) : null}

        {selected !== null ? <FinancialBoard locale={locale} board={selected} /> : null}
      </div>
    </AppShell>
  );
}

/**
 * One line per endowment in scope. ⚠ Every line carries BOTH the total AND its corpus figure —
 * the portfolio strip is exactly where a blended number would otherwise be read as spendable cash
 * across five endowments at once.
 */
async function RollupStrip({
  locale,
  lines,
}: {
  readonly locale: string;
  readonly lines: readonly FinancialRollupLine[];
}) {
  const t = await getTranslations({ locale, namespace: 'financials' });
  const { resolveLocale } = await import('@qmulate/i18n');
  const resolved = resolveLocale(locale);

  return (
    <section className="qm-card flex flex-col gap-[var(--space-12)]" data-testid="qm-fin-rollup">
      <h2 className="text-h3">{t('cash.title')}</h2>
      <ul className="flex flex-col gap-[var(--space-4)] text-body-sm">
        {lines.map((line) => (
          <li
            key={line.waqfId}
            className="flex flex-wrap items-baseline gap-[var(--space-12)]"
            data-testid={`qm-fin-rollup-${line.waqfId}`}
            data-refused={line.refused ? 'true' : 'false'}
          >
            {line.certificateNumber === null ? (
              <span>{line.waqfId}</span>
            ) : (
              <Mono size="body-sm">{line.certificateNumber}</Mono>
            )}
            {line.refused || line.totalSar === null || line.ofWhichCapitalSar === null ? (
              /* A refusal says so IN WORDS. It is never a zero. */
              <span className="text-mist" data-testid={`qm-fin-rollup-${line.waqfId}-refused`}>
                {t('selector.none')}
              </span>
            ) : (
              <>
                <CurrencyValue value={line.totalSar} locale={resolved} size="body-sm" />
                <span className="text-mist">
                  {t('cash.ofWhichCorpus')}{' '}
                  <CurrencyValue value={line.ofWhichCapitalSar} locale={resolved} size="body-sm" />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
