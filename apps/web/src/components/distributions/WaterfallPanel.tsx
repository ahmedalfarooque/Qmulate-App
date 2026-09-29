import { getTranslations } from 'next-intl/server';

import { Card, Eyebrow, Heading, Text, Well } from '@qmulate/ui';

import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';

import { DistVocabLabel } from './DistVocabLabel';
import { Sar } from './Sar';

import type { WaterfallView } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE WATERFALL — SIX ROWS IN THE ONE ORDER THAT IS BINDING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ṣiyāna (صيانة) is reserved from income FIRST — before any operating cost, before the Nazir fee, before
 * anything is distributable. Then operating costs. Then the Nazir fee. What remains is the distributable
 * ghallah. Nothing may be re-ordered, and the rows below are rendered in that order for that reason: a
 * screen that listed them alphabetically, or put the fee above the reserve, would teach the order wrong.
 *
 * ⚠ THE CORPUS IS NOT A ROW HERE, AND THAT IS THE POINT. `capitalReceiptsSar` appears in no figure in
 * this panel and is rendered by `<CorpusReceiptsPanel>` instead, on its own, with its own heading and the
 * sentence that says it is never added to income. Putting it in this table — even in a "not included"
 * row — would put a corpus figure inside the income waterfall's own column, and a reader scanning a
 * column of numbers adds them.
 *
 * ── EVERY UNVERIFIED FIGURE CARRIES THE MARKER (binding rule 3) ────────────────────────────
 * The Nazir fee is the one on this panel: this engagement's deed sets 10% of revenue (customary ʿushr)
 * and that percentage is UNVERIFIED against primary Saudi law, as is the Awqaf Law's separate ≤10%-of-net-
 * income Authority fee it is routinely confused with. So the fee row carries `<UnverifiedMark>` and the
 * sentence that the fee is set by the DEED — not by statute and not by a system setting.
 */
export async function WaterfallPanel({
  locale,
  waterfall,
}: {
  readonly locale: string;
  readonly waterfall: WaterfallView;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });

  /**
   * The five deductions and the remainder, in the binding order.
   *
   * `emphasis` marks the two figures a reader looks for — what came in, and what is available to
   * distribute — and it is a type weight, never a colour: this panel must read identically in the flat
   * report theme and in print.
   */
  const rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
    readonly emphasis?: boolean;
    readonly note?: React.ReactNode;
  }[] = [
    { key: 'revenue', label: t('waterfall.revenue'), value: waterfall.revenueSar, emphasis: true },
    {
      key: 'maintenanceReserve',
      label: t('waterfall.maintenanceReserve'),
      value: waterfall.maintenanceReserveSar,
    },
    { key: 'operating', label: t('waterfall.operating'), value: waterfall.operatingSar },
    { key: 'netIncome', label: t('waterfall.netIncome'), value: waterfall.netIncomeSar },
    {
      key: 'nazirFee',
      label: t('waterfall.nazirFee'),
      value: waterfall.nazirFeeSar,
      note: (
        <span className="flex flex-col gap-[var(--space-4)]">
          <span>
            <DistVocabLabel locale={locale} vocab="feeBasis" value={waterfall.nazirFeeBasis} />
          </span>
          <span>{t('waterfall.nazirFeeDeedNote')}</span>
          <UnverifiedMark locale={locale} />
        </span>
      ),
    },
    {
      key: 'distributable',
      label: t('waterfall.distributable'),
      value: waterfall.distributableSar,
      emphasis: true,
    },
  ];

  return (
    <Card
      as="section"
      className="flex flex-col gap-[var(--space-16)] text-start"
      data-testid="qm-waterfall"
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <Eyebrow tick>{t('receiptClass.INCOME')}</Eyebrow>
        <Heading level={2}>{t('waterfall.title')}</Heading>
        <Text tone="mist">{t('waterfall.intro')}</Text>
      </div>

      {/* A real `<dl>`: a screen reader hears "Maintenance reserved, SAR 40,000.00" as one pair rather
          than two unrelated strings. Logical layout only — it mirrors from `dir` on the root element. */}
      <dl
        className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
        data-testid="qm-waterfall-rows"
      >
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className={row.emphasis === true ? 'qm-label text-ink' : 'qm-label'}>
              {row.label}
            </dt>
            <dd
              data-testid="qm-waterfall-row"
              data-row={row.key}
              className="flex min-w-0 flex-col gap-[var(--space-4)]"
            >
              <Well as="output" className="inline-flex w-fit" bordered={row.emphasis === true}>
                <Sar
                  locale={locale}
                  value={row.value}
                  size={row.emphasis === true ? 'lcd' : 'body'}
                />
              </Well>
              {row.note === undefined ? null : (
                <Text variant="body-sm" tone="mist">
                  {row.note}
                </Text>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
