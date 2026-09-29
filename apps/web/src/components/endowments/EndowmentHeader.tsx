import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { cx, Eyebrow, Heading, Mono, Surface, Text } from '@qmulate/ui';

import { endowmentPath, ENDOWMENT_TABS, type EndowmentTab } from '@/lib/endowments/paths';

import { Chip, type ChipTone } from './Chip';
import { vocabText } from './VocabLabel';

/**
 * The header every endowment sub-screen shares: whose endowment this is, which one, and the tab
 * strip between its five records.
 *
 * ── THE CERTIFICATE NUMBER IS AN LTR ISLAND INSIDE AN RTL PAGE ────────────────────────────
 * `FAKE-1000001` goes through `<Mono>`, which sets Geist Mono, tabular figures and `dir="ltr"`
 * inside a `<bdi>`. Without the isolate, a certificate or deed number placed next to Arabic text
 * reorders itself — the hyphen and the digits swap sides — and the number a Nazir reads off the
 * screen is not the number in the deed. That is a correctness bug, not a typographic nicety
 * (11-localization-spec.md §4).
 *
 * ── THE TAB STRIP IS LINKS, NOT A WIDGET ──────────────────────────────────────────────────
 * Five server-rendered `<Link>`s in a `<nav>`, with the active one carrying THREE non-shadow cues —
 * the accent inline-start border, the accent text colour and `aria-current="page"` — plus the inset
 * well. No client JavaScript, no `usePathname`: the page already knows which record it is, so it
 * passes `active` and the strip stays a server component.
 */

const TAB_BASE = [
  'flex min-h-tap items-center whitespace-nowrap',
  'rounded-control border-s-2 px-[var(--space-12)] py-[var(--space-8)]',
  'qm-label transition duration-fast focus-visible:shadow-focus',
].join(' ');

/**
 * ⚠ THE TONE IS A READING AID, NEVER THE FACT. The chip's own words carry the classification, so an
 * unrecognised value simply falls back to neutral rather than being dropped. The SAR bands behind
 * these are UNVERIFIED against primary law.
 */
export const CLASSIFICATION_TONE: Readonly<Record<string, ChipTone>> = {
  LARGE: 'info',
  MEDIUM: 'info',
  SMALL: 'neutral',
  DIRECT_UTILIZATION: 'neutral',
};

export async function EndowmentHeader({
  locale,
  waqfId,
  active,
  certificateNumber,
  classification,
  waqifName,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly active: EndowmentTab;
  readonly certificateNumber: string | null;
  readonly classification: string | null;
  readonly waqifName: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <header className="flex flex-col gap-[var(--space-16)] text-start">
      <div className="flex flex-col gap-[var(--space-4)]">
        <Eyebrow tick>{tCommon('endowment')}</Eyebrow>
        <div className="flex flex-wrap items-center gap-[var(--space-12)]">
          <Heading level={1}>
            {certificateNumber === null ? (
              tCommon('notRecorded')
            ) : (
              <Mono tone="inherit">{certificateNumber}</Mono>
            )}
          </Heading>
          {classification === null ? null : (
            <Chip
              tone={CLASSIFICATION_TONE[classification] ?? 'neutral'}
              label={await vocabText(locale, 'classification', classification)}
              data-testid="qm-classification-chip"
            />
          )}
        </div>
        {waqifName === null ? null : (
          <Text variant="body-sm" tone="mist">
            {`${t('fields.waqif')}: ${waqifName}`}
          </Text>
        )}
      </div>

      <nav aria-label={t('title')} data-testid="qm-endowment-tabs">
        {/* Depth comes from <Surface>, the only component allowed to emit a box-shadow — not from
            a shadow utility written here. Wide strips scroll inside their own container so the
            page itself never scrolls horizontally in either direction. */}
        <Surface
          as="ul"
          variant="raised-sm"
          radius="card"
          className="flex gap-[var(--space-4)] overflow-x-auto p-[var(--space-8)]"
        >
          {ENDOWMENT_TABS.map((tab) => {
            const isActive = tab === active;
            return (
              <li key={tab}>
                <Link
                  href={endowmentPath(locale, waqfId, tab)}
                  aria-current={isActive ? 'page' : undefined}
                  data-tab={tab}
                  className={cx(
                    TAB_BASE,
                    isActive
                      ? 'border-blue bg-well text-blue-strong shadow-inset'
                      : 'border-transparent text-mist hover:text-ink active:shadow-inset',
                  )}
                >
                  {t(`tabs.${tab}`)}
                </Link>
              </li>
            );
          })}
        </Surface>
      </nav>
    </header>
  );
}
