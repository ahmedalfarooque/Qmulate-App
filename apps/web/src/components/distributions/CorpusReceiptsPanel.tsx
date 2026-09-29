import { getTranslations } from 'next-intl/server';

import { Card, Eyebrow, Heading, Mono, Text, Well } from '@qmulate/ui';

import { DistVocabLabel } from './DistVocabLabel';
import { Sar } from './Sar';

import type { CorpusReceiptView } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * أصل — THE CORPUS RECEIPTS, SHOWN AS VISIBLY REFUSED RATHER THAN QUIETLY ABSENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Binding rule 1: corpus (asl / أصل) and income (ghallah / غلة) are distinct and never mixed. Sale
 * proceeds and istibdal (substitution) proceeds are CORPUS — they flow back into the corpus and no
 * capital receipt may enter the distribution waterfall.
 *
 * The engine already enforces that. This panel exists for the other half of the rule, which is a
 * RENDERING obligation and has no engine to enforce it:
 *
 *   **A screen that hides the corpus is worse than one that never mentioned it.** The Nazir is the person
 *   who must see that the amount was CONSIDERED AND REFUSED. If the wizard silently filtered a
 *   4,200,000 SAR istibdal receipt out of the period, nothing on the screen would distinguish "the
 *   corpus was correctly held out" from "the receipt was never read at all" — and those two states have
 *   very different consequences for a trustee signing the result.
 *
 * So the mapping passes capital receipts THROUGH to the engine (rather than filtering them upstream),
 * the engine holds them out and names them by id, and this panel prints them struck through, with the
 * class and the corpus source that explains the exclusion.
 *
 * ── THREE RULES THIS COMPONENT ENFORCES BY CONSTRUCTION ───────────────────────────────────
 *  1. **NO COMBINED TOTAL, ANYWHERE.** The corpus figure is rendered inside this panel and is added to
 *     nothing. There is no prop by which a caller could sum it with income, and `waterfall.corpusNoTotal`
 *     states the rule in words beside the figure so it survives a printout.
 *  2. **THE STRIKE-THROUGH IS NEVER THE ONLY SIGNAL.** `<del>` carries it semantically for assistive
 *     technology, and the reason — the receipt class and the corpus source, as words — is printed beside
 *     every row. A line-through alone would be a purely visual claim.
 *  3. **AN EMPTY LIST IS A STATEMENT, NOT A BLANK.** When the period holds no capital receipt the panel
 *     still renders and says the count is zero. "No corpus receipts in this period" and "corpus receipts
 *     were not looked for" must not look the same.
 */
export async function CorpusReceiptsPanel({
  locale,
  receipts,
  /**
   * The engine's own `capitalReceiptsSar`, or `null` on a stored run.
   *
   * ⚠ `null` MEANS NOT PROJECTED, NEVER ZERO. `distribution.get` carries no `excludedCapitalReceipts`,
   * and the stored input's halala integers may not be converted to SAR in this app (`packages/api` owns
   * every halala→decimal conversion). So a re-read of a stored run shows the receipts BY ID with no
   * amount, and says which figure is missing rather than printing a zero that would read as "no corpus".
   */
  totalSar,
}: {
  readonly locale: string;
  readonly receipts: readonly CorpusReceiptView[];
  readonly totalSar: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <Card
      as="section"
      className="flex flex-col gap-[var(--space-16)] text-start"
      data-testid="qm-corpus-receipts"
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <Eyebrow tick>{t('receiptClass.CAPITAL')}</Eyebrow>
        <Heading level={2}>{t('waterfall.corpusTitle')}</Heading>
        <Text tone="mist">{t('waterfall.corpusBody')}</Text>
      </div>

      <dl className="grid grid-cols-1 gap-[var(--space-16)] sm:grid-cols-2">
        <div className="flex flex-col gap-[var(--space-4)]">
          <dt className="qm-label">{t('waterfall.corpusReceiptCount')}</dt>
          <dd>
            {/* A count, not money: `<Mono>` for the tabular figure, LTR-isolated like every numeral. */}
            {/* ⚠ THE HOOK IS ON THE WRAPPER, NOT ON `<Mono>`. `MonoProps` declares no `data-*` passthrough,
                  so a `data-testid` written on the component is SILENTLY DROPPED — measured in the rendered
                  DOM, where the attribute simply did not appear. A test hook that vanishes is worse than
                  none: the assertion that depends on it fails for a reason nobody can see. */}
            <span data-testid="qm-corpus-count">
              <Mono>{String(receipts.length)}</Mono>
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-[var(--space-4)]">
          <dt className="qm-label">{t('waterfall.corpusAmount')}</dt>
          <dd className="flex flex-col gap-[var(--space-4)]">
            {totalSar === null ? (
              <Text variant="body-sm" tone="mist">
                {tCommon('notRecorded')}
              </Text>
            ) : (
              <Well as="output" className="inline-flex w-fit" data-testid="qm-corpus-total">
                <Sar locale={locale} value={totalSar} />
              </Well>
            )}
            <Text variant="body-sm" tone="warning">
              {t('waterfall.corpusNoTotal')}
            </Text>
          </dd>
        </div>
      </dl>

      {receipts.length === 0 ? null : (
        <ul className="flex flex-col gap-[var(--space-8)]">
          {receipts.map((receipt) => (
            <li
              key={receipt.transactionId}
              data-testid="qm-corpus-receipt"
              data-transaction-id={receipt.transactionId}
              className="flex flex-wrap items-baseline gap-x-[var(--space-16)] gap-y-[var(--space-4)] rounded-control border border-edge bg-panel-tint px-[var(--space-12)] py-[var(--space-8)]"
            >
              {/* The struck-through half: the receipt, as excluded. `<del>` is the semantic carrier. */}
              <del className="flex flex-wrap items-baseline gap-[var(--space-8)] text-mist">
                <Mono size="body-sm">{receipt.transactionId}</Mono>
                {receipt.amountSar === null ? null : (
                  <Sar locale={locale} value={receipt.amountSar} size="body-sm" />
                )}
              </del>
              {/* The reason, in words, never struck through — it is what a reader needs most. */}
              <Text variant="body-sm" tone="mist">
                <DistVocabLabel locale={locale} vocab="receiptClass" value={receipt.receiptClass} />
                {' · '}
                <DistVocabLabel
                  locale={locale}
                  vocab="capitalSource"
                  value={receipt.capitalSource}
                  fallback={tCommon('notRecorded')}
                />
              </Text>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
