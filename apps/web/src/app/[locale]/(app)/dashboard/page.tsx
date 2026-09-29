import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Mono } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { ComplianceBoard } from '@/components/compliance/ComplianceBoard';
import { DashboardTiles } from '@/components/distributions/DashboardTiles';
import { Refusal } from '@/components/endowments/Refusal';
import { loadRollup } from '@/lib/compliance/loaders';
import { loadDashboardCounts } from '@/lib/distributions/loaders';

import type { KpiTone, RollupLine } from '@/lib/compliance/types';
import type { Metadata } from 'next';

/**
 * The Dashboard — the trustee's morning screen (13-ux §1), now E10's COMPLIANCE BOARD (§14 §3).
 *
 * E0 shipped the SHELL of it and bound nothing to data, with a comment that has aged well: "an all-green
 * board with fabricated numbers is the single most dangerous placeholder this product could ship."
 *
 * ── S7/E6 · THE FIRST LIVE FIGURES ────────────────────────────────────────────────────────────
 * Two tiles read the distribution record: runs awaiting approval, and runs past their deadline — see
 * `DashboardTiles` for why the second also reports how many live runs record no timing at all. They stay.
 *
 * ── S11/E10 (item 2b) · THE COMPLIANCE BOARD REPLACES THE PLACEHOLDER TILE ────────────────────
 * The em-dash tile that stood for "the five zero-tolerance KPIs land with their own engine" is gone; the
 * engine landed (E7–E9, S11-2a's reads) and the board is here. What it claims, and what it does not:
 *
 *  · ONE ENDOWMENT AT A TIME. The board is endowment-scoped because every read behind it is. The
 *    selector lists the endowments this caller's OWN grants reach (`loadEndowmentRefs`); `?waqf=` picks
 *    one and the first is the default. No client JavaScript: each option is a link.
 *  · THE ROLL-UP IS A LIST, NOT A PORTFOLIO COMPUTATION. One line per endowment in scope with its worst
 *    tone ("danger dominates" — `dominantTone` in `@qmulate/api`); a board this seat cannot fully read
 *    is a `refused` line, never a missing one.
 *  · A REFUSAL IS RENDERED AS A REFUSAL. The `loadRollup` read, each region, each chip: refused reads say
 *    so in words. Nothing here is a zero made from a failed request.
 *  · NO FORMS. Every act is taken on the endowment record, which the decisions region links to.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('dashboard') };
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;

  /**
   * Deny by default. No session → sign-in. A TOTP-mandatory seat that has not enrolled →
   * enrolment, and it cannot reach the shell by deep-linking past this (AC-E0-7).
   */
  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'common' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const tBoard = await getTranslations({ locale, namespace: 'dashboard' });

  const [counts, rollup] = await Promise.all([loadDashboardCounts(locale), loadRollup(locale)]);

  const requested = typeof query['waqf'] === 'string' ? query['waqf'] : null;
  const boards = rollup.status === 'ok' ? rollup.value.boards : [];
  const selected = boards.find((board) => board.waqfId === requested) ?? boards[0] ?? null;

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)]">
          <p className="qm-label">{t('portfolioScope')}</p>
          <h1 className="text-h1">{tNav('dashboard')}</h1>
        </header>

        <div className="grid grid-cols-1 gap-[var(--space-16)] sm:grid-cols-2">
          {/* Live: the two distribution tiles. A refusal on the read renders as a refusal rather than as
              a zero — a zero would be a claim about the portfolio made from a failed request. */}
          {counts.status === 'ok' ? (
            <DashboardTiles locale={locale} counts={counts.value} />
          ) : (
            <div className="sm:col-span-2">
              <Refusal locale={locale} messageKey={counts.messageKey} />
            </div>
          )}
        </div>

        {/* The selector — the caller's own scope, as links. */}
        <section className="qm-card flex flex-col gap-[var(--space-12)]" data-testid="qm-selector">
          <h2 className="text-h3">{tBoard('selector.title')}</h2>
          <p className="text-body-sm text-mist">{tBoard('selector.body')}</p>
          {rollup.status !== 'ok' ? (
            <Refusal locale={locale} messageKey={rollup.messageKey} />
          ) : boards.length === 0 ? (
            <p className="text-body-sm text-mist" data-testid="qm-selector-none">
              {tBoard('selector.none')}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-[var(--space-8)]">
              {boards.map((board) => (
                <li key={board.waqfId}>
                  <Link
                    href={`/${locale}/dashboard?waqf=${encodeURIComponent(board.waqfId)}`}
                    aria-current={selected?.waqfId === board.waqfId ? 'true' : undefined}
                    data-testid={`qm-selector-${board.waqfId}`}
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

        {/* The roll-up — one line per endowment in scope, worst tone first. */}
        {rollup.status === 'ok' && rollup.value.lines.length > 0 ? (
          <RollupStrip locale={locale} lines={rollup.value.lines} />
        ) : null}

        {selected !== null ? <ComplianceBoard locale={locale} board={selected} /> : null}
      </div>
    </AppShell>
  );
}

const TONE_TEXT: Readonly<Record<KpiTone, string>> = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
  refused: 'text-mist',
};

async function RollupStrip({
  locale,
  lines,
}: {
  readonly locale: string;
  readonly lines: readonly RollupLine[];
}) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return (
    <section className="qm-card flex flex-col gap-[var(--space-12)]" data-testid="qm-rollup">
      <h2 className="text-h3">{t('rollup.title')}</h2>
      <p className="text-body-sm text-mist">{t('rollup.body')}</p>
      <ul className="flex flex-col gap-[var(--space-4)] text-body-sm">
        {lines.map((line) => (
          <li
            key={line.waqfId}
            className="flex flex-wrap items-baseline gap-[var(--space-12)]"
            data-testid={`qm-rollup-${line.waqfId}`}
            data-tone={line.dominant}
          >
            {line.certificateNumber === null ? (
              <span>{line.waqfId}</span>
            ) : (
              <Mono size="body-sm">{line.certificateNumber}</Mono>
            )}
            <span className={`font-medium ${TONE_TEXT[line.dominant]}`}>
              {t(`tone.${line.dominant}`)}
            </span>
            {line.overdueRows > 0 ? (
              <span className="text-danger">
                {t('rollup.overdue', { count: String(line.overdueRows) })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
