import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@qmulate/i18n';
import { CurrencyValue, Mono, StatTile, Well } from '@qmulate/ui';

import type { FinancialBoard as BoardView } from '@/lib/financials/types';

/**
 * ═══════════════════════════════════════════════════════
 * `/financials` — THE FINANCIAL POSITION OF ONE ENDOWMENT (§14 §5, 13-ux §10)
 * ═══════════════════════════════════════════════════════
 * S11 · 2c (E10), on the owner's ruling of 2026-09-03 that the financial figures get their OWN
 * screen rather than a region on the dashboard.
 *
 * ⚠ WHAT THIS SCREEN IS BUILT TO, EXACTLY: **13-ux §10's LAYOUT and its FOUR STATES — NOT §10's
 * ACCEPTANCE CRITERIA.** Both of those criteria are WRITE/IMPORT criteria (*"when I save it"*,
 * *"given a bank statement import"*), and neither the transaction write form nor the statement
 * import exists. Reading "built to §10" as "§10's ACs pass" would be the seventh premature exit
 * claim on this record.
 *
 * ── THE ONE RULE EVERY FIGURE HERE OBEYS ──────────────────────────────────────────────────────
 * **No money figure renders without its class, and a figure that MIXES classes renders its
 * "of which corpus" companion ADJACENT — never in a tooltip, never below the fold.** Binding rule 1
 * (corpus and income are distinct; only income may be distributed) is the one invariant a financial
 * screen can break silently, by showing a single total that blends the two. `netSar` per account is
 * exactly such a total, which is why `AccountView.ofWhichCapitalSar` is REQUIRED in the type.
 *
 * ── AND WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────
 * The transaction table, the reconciliation panel and the statement export are **declared on the
 * screen** rather than omitted, because a financial screen that simply lacked a reconciliation panel
 * would read as "nothing to reconcile". Same standard that made `arrears` a rendered sentence rather
 * than a missing tile.
 *
 * NO FORMS (the E3 pin): every act is taken on the endowment record.
 */
export async function FinancialBoard({
  locale,
  board,
}: {
  readonly locale: string;
  readonly board: BoardView;
}) {
  const t = await getTranslations({ locale, namespace: 'financials' });
  const resolved = resolveLocale(locale);

  return (
    <section
      className="flex flex-col gap-[var(--space-16)]"
      data-testid="qm-financials"
      data-waqf={board.waqfId}
      data-empty={board.emptyReason ?? 'none'}
    >
      {board.emptyReason !== null ? (
        <div className="qm-card flex flex-col gap-[var(--space-8)]" data-testid="qm-fin-empty">
          <h2 className="text-h3">{t('cash.title')}</h2>
          <p className="text-body" data-testid="qm-fin-empty-sentence">
            {board.emptyReason === 'DIRECT_USE'
              ? t('empty.directUse')
              : board.emptyReason === 'DIRECT_USE_UNRECORDED'
                ? t('empty.directUseUnrecorded')
                : t('empty.noTransactions')}
          </p>
          <p className="text-body-sm text-mist">{t('empty.reasonNotHere')}</p>
        </div>
      ) : (
        <>
          {/* ── The account header: cash position in an inset LCD well (13-ux §10's layout) ── */}
          <div className="grid grid-cols-1 gap-[var(--space-16)] sm:grid-cols-2">
            <div data-testid="qm-fin-cash">
              <StatTile
                locale={resolved}
                eyebrow={t('cash.total')}
                value={<CurrencyValue value={board.cash.totalSar} locale={resolved} size="lcd" />}
                caption={
                  <span className="flex flex-col gap-[var(--space-4)]">
                    {/* THE COMPANION, adjacent and in words — never a tooltip. */}
                    <span data-testid="qm-fin-cash-corpus">
                      {t('cash.ofWhichCorpus')}{' '}
                      <CurrencyValue
                        value={board.cash.ofWhichCapitalSar}
                        locale={resolved}
                        size="body-sm"
                      />
                    </span>
                    <span>{t('cash.blendedNote')}</span>
                  </span>
                }
                className="text-start"
              />
            </div>

            <div data-testid="qm-fin-receipts">
              <StatTile
                locale={resolved}
                eyebrow={t('receipts.income')}
                value={
                  <CurrencyValue value={board.receipts.incomeSar} locale={resolved} size="lcd" />
                }
                caption={
                  <span className="flex flex-col gap-[var(--space-4)]">
                    <span data-testid="qm-fin-receipts-capital">
                      {t('receipts.capital')}{' '}
                      <CurrencyValue
                        value={board.receipts.capitalSar}
                        locale={resolved}
                        size="body-sm"
                      />
                    </span>
                    <span>{t('receipts.wall')}</span>
                  </span>
                }
                className="text-start"
              />
            </div>
          </div>

          {/* ── Per-account rows. EVERY net carries its own corpus figure. ── */}
          <div
            className="qm-card flex flex-col gap-[var(--space-12)]"
            data-testid="qm-fin-accounts"
          >
            <h2 className="text-h3">{t('cash.accounts')}</h2>
            <ul className="flex flex-col gap-[var(--space-8)]">
              {board.cash.accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex flex-col gap-[var(--space-4)]"
                  data-testid={`qm-fin-account-${account.accountRef}`}
                  data-dedicated={account.isDedicated ? 'true' : 'false'}
                >
                  <span className="flex flex-wrap items-baseline gap-[var(--space-8)]">
                    <Mono size="body-sm">{account.accountRef}</Mono>
                    <span className={account.isDedicated ? 'text-mist' : 'text-danger'}>
                      {account.isDedicated ? t('cash.dedicated') : t('cash.notDedicated')}
                    </span>
                  </span>
                  <Well
                    bordered={false}
                    className="flex flex-wrap items-baseline gap-[var(--space-12)]"
                  >
                    <span>
                      {t('cash.accountNet')}{' '}
                      <CurrencyValue value={account.netSar} locale={resolved} />
                    </span>
                    <span data-testid={`qm-fin-account-${account.accountRef}-corpus`}>
                      {t('cash.accountCorpus')}{' '}
                      <CurrencyValue value={account.ofWhichCapitalSar} locale={resolved} />
                    </span>
                  </Well>
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-mist">{t('cash.blendedNote')}</p>
          </div>

          {/* ── Capital by source, expenses by category, distributions ── */}
          <div className="grid grid-cols-1 gap-[var(--space-16)] lg:grid-cols-3">
            <div
              className="qm-card flex flex-col gap-[var(--space-8)]"
              data-testid="qm-fin-capital"
            >
              <h3 className="text-h3">{t('receipts.bySource')}</h3>
              <ul className="flex flex-col gap-[var(--space-4)] text-body-sm">
                {board.receipts.capitalBySource.map((row) => (
                  <li key={row.source} className="flex flex-wrap gap-[var(--space-8)]">
                    <Mono size="body-sm">{row.source}</Mono>
                    <CurrencyValue value={row.amountSar} locale={resolved} size="body-sm" />
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="qm-card flex flex-col gap-[var(--space-8)]"
              data-testid="qm-fin-expenses"
            >
              <h3 className="text-h3">{t('expenses.title')}</h3>
              <p>
                {t('expenses.total')}{' '}
                <CurrencyValue value={board.expenses.totalSar} locale={resolved} />
              </p>
              <ul className="flex flex-col gap-[var(--space-4)] text-body-sm">
                {board.expenses.byCategory.map((row) => (
                  <li key={row.category} className="flex flex-wrap gap-[var(--space-8)]">
                    <Mono size="body-sm">{row.category}</Mono>
                    <CurrencyValue value={row.amountSar} locale={resolved} size="body-sm" />
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="qm-card flex flex-col gap-[var(--space-8)]"
              data-testid="qm-fin-distributions"
            >
              <h3 className="text-h3">{t('distributions.title')}</h3>
              <p>{t('distributions.count', { count: String(board.distributions.count) })}</p>
              <p>
                {t('distributions.executed')}{' '}
                <CurrencyValue
                  value={board.distributions.executedDistributableSar}
                  locale={resolved}
                />
              </p>
            </div>
          </div>

          {/* ── ARREARS: a sentence, never a zero (the fourth-batch ruling) ── */}
          <div className="qm-card flex flex-col gap-[var(--space-8)]" data-testid="qm-fin-arrears">
            <h3 className="text-h3">{t('arrears.title')}</h3>
            <p
              className="text-body"
              data-testid="qm-fin-arrears-state"
              data-state={board.arrears.state}
            >
              {t('arrears.notModelled')}
            </p>
          </div>

          {board.excludedRows > 0 ? (
            <p className="text-body-sm text-mist" data-testid="qm-fin-excluded">
              {t('excluded.label')}: {t('excluded.body', { count: String(board.excludedRows) })}
            </p>
          ) : null}
        </>
      )}

      {/* ── DECLARED OWED, on the screen, in both locales ── */}
      <div className="qm-card flex flex-col gap-[var(--space-8)]" data-testid="qm-fin-owed">
        <h3 className="text-h3">{t('owed.title')}</h3>
        <p className="text-body-sm text-mist">{t('owed.body')}</p>
        <ul className="flex flex-col gap-[var(--space-4)] text-body-sm">
          <li data-testid="qm-fin-owed-transactions">{t('owed.transactions')}</li>
          <li data-testid="qm-fin-owed-reconciliation">{t('owed.reconciliation')}</li>
          <li data-testid="qm-fin-owed-statements">{t('owed.statements')}</li>
        </ul>
      </div>

      <p className="text-body-sm text-mist" data-testid="qm-fin-unverified">
        {t('unverified')}
      </p>
    </section>
  );
}
