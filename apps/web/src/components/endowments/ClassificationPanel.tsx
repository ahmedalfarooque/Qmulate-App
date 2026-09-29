import { getTranslations } from 'next-intl/server';

import { Card, Heading, Mono, Text } from '@qmulate/ui';

import { Chip } from './Chip';
import { DualDateValue } from './DualDateValue';
import { UnverifiedMark } from './UnverifiedMark';
import { VocabLabel, vocabText } from './VocabLabel';

import type { ClassificationRecord, Loaded, ObligationSet } from '@/lib/endowments/types';
import type { ReactNode } from 'react';

/**
 * The Authority classification, its history, and the duties it gates (BR-104).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THREE THINGS THIS SCREEN IS CAREFUL ABOUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · THE BANDS ARE NEVER SHOWN AS SETTLED FIGURES. The SAR 200M / 50M thresholds are UNVERIFIED
 *     against primary Saudi law. They live in `Setting` rows so a correction is a configuration
 *     change rather than a code change, and this screen names the SETTING KEYS the bands resolve
 *     from plus the unverified marker — it does not print the numbers as though they were the law.
 *
 * 2 · THE HISTORY IS THE POINT OF BR-104, NOT A FOOTNOTE. "Re-classification WITH history" means a
 *     history that cannot be rewritten: `reclassification_event` is append-only at the DATABASE
 *     (an UPDATE or a DELETE raises 42501) and each event's `from` must equal the endowment's
 *     classification at the moment it was inserted, so a fabricated transition is unrepresentable
 *     rather than merely discouraged. The screen says so, because a reader cannot see a trigger.
 *
 * 3 · THE EXCLUDED DUTIES ARE RENDERED, NOT HIDDEN. What makes a classification matter is the
 *     DIFFERENCE it makes — a medium endowment carries audited-statement and internal-bylaw duties
 *     that a small one does not. A screen that only listed what applies would leave that difference
 *     invisible and the contrast unprovable.
 *
 * ⚠ THERE IS NO RE-CLASSIFY CONTROL ON THIS SCREEN IN S4. Whether a re-classification needs the
 * Nazir's approval or only a maker is an OWNER decision (§10 §4.1 has no row for it), and the
 * append-only trigger plus the read surface are what the exit clause names as P0. Shipping a write
 * whose approval rung is unsettled would bake an authority answer into a code convenience.
 * SURFACED, not resolved.
 */
export async function ClassificationPanel({
  locale,
  record,
  obligations,
}: {
  readonly locale: string;
  readonly record: ClassificationRecord;
  /** Loaded separately: a refusal on the duty catalogue must not blank the classification. */
  readonly obligations: Loaded<ObligationSet>;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });

  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('classification.currentTitle')}</Heading>
        <Chip
          tone="info"
          label={await vocabText(locale, 'classification', record.current)}
          data-testid="qm-classification-current"
        />

        <section className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]">
          <Heading level={3}>{t('classification.bandsTitle')}</Heading>
          <Text tone="mist">{t('classification.bandsBody')}</Text>
          {record.bandSettingKeys.length === 0 ? null : (
            <>
              <Text variant="body-sm" tone="mist">
                {t('classification.bandsSettings')}
              </Text>
              <ul className="flex flex-wrap gap-[var(--space-8)]">
                {record.bandSettingKeys.map((key) => (
                  <li key={key}>
                    <Mono size="body-sm" tone="mist">
                      {key}
                    </Mono>
                  </li>
                ))}
              </ul>
            </>
          )}
          <UnverifiedMark locale={locale} />
        </section>
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('classification.historyTitle')}</Heading>
        <Text tone="mist">{t('classification.historyNote')}</Text>

        {record.history.length === 0 ? (
          <p
            className="max-w-measure text-body text-mist"
            data-testid="qm-classification-history-empty"
          >
            {t('classification.historyEmpty')}
          </p>
        ) : (
          <ol
            className="flex flex-col gap-[var(--space-12)]"
            data-testid="qm-classification-history"
          >
            {record.history.map((entry, index) => (
              <li
                key={`${entry.from}-${entry.to}-${entry.at.iso}-${String(index)}`}
                // Dense content inside a raised card is FLAT — no per-row neumorphism.
                className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-12)] first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-[var(--space-8)]">
                  {/* `label` takes a node, so the vocabulary lookup stays a component and this map
                      callback does not have to become async. */}
                  <Chip
                    tone="neutral"
                    label={<VocabLabel locale={locale} vocab="classification" value={entry.from} />}
                  />
                  {/* Decorative: the two chips carry the transition, and an arrow glyph would
                      point the wrong way in a mirrored layout if it were meaningful. */}
                  <span aria-hidden="true" className="text-mist">
                    →
                  </span>
                  <Chip
                    tone="info"
                    label={<VocabLabel locale={locale} vocab="classification" value={entry.to} />}
                  />
                </div>
                <Text variant="body-sm" tone="mist">
                  {t('classification.at')} <DualDateValue locale={locale} date={entry.at} />
                </Text>
                <Text variant="body-sm">{`${t('classification.reason')}: ${entry.reason}`}</Text>
                {entry.createdBy === null ? null : (
                  <Text variant="body-sm" tone="mist">
                    {t('classification.by')}{' '}
                    <Mono size="body-sm" tone="mist">
                      {entry.createdBy}
                    </Mono>
                  </Text>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {obligations.status === 'ok' ? (
        <ObligationTables locale={locale} set={obligations.value} />
      ) : null}
    </div>
  );
}

/**
 * The duties that apply, and the duties this classification excludes.
 *
 * The titles come from the DATABASE — `titleAr` / `titleEn` on the global `ComplianceObligation`
 * catalogue — not from `packages/i18n`. That is the right split: the catalogue is the regulation's
 * own text recorded as data, and translating it in a copy deck would put the product between a
 * Nazir and the law. Each row's `unverified` flag is honoured; a deadline rule key is shown as a
 * machine code because the FIGURE behind it (10 business days, 30 days, 3 months) is unverified.
 */
async function ObligationTables({
  locale,
  set,
}: {
  readonly locale: string;
  readonly set: ObligationSet;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const isArabic = locale === 'ar';
  // ⚠ The marker comes off the SET's own notes, not off a per-row flag: the api reports the unverified
  // caveat once for the whole answer, and a screen that invented a per-row flag would be asserting
  // something the kernel never said.
  const anyUnverified = set.unverifiedNotes.length > 0;

  return (
    <>
      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('classification.obligationsTitle')}</Heading>
        <Text tone="mist">{t('classification.obligationsIntro')}</Text>

        {set.obligations.length === 0 ? (
          <Text tone="mist">{t('classification.obligationsEmpty')}</Text>
        ) : (
          // Wide content scrolls inside its own container: the PAGE never scrolls horizontally.
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[36rem] border-collapse text-start"
              data-testid="qm-obligations"
            >
              <thead>
                <tr className="border-b border-line">
                  <Th>{t('classification.columnCode')}</Th>
                  <Th>{t('classification.columnObligation')}</Th>
                  <Th>{t('classification.columnSection')}</Th>
                  <Th>{t('classification.columnGate')}</Th>
                </tr>
              </thead>
              <tbody>
                {set.obligations.map((obligation) => (
                  <tr
                    key={obligation.code}
                    data-code={obligation.code}
                    data-gate={obligation.gate}
                    className="border-b border-line last:border-b-0"
                  >
                    <Td>
                      <Mono size="body-sm" tone="mist">
                        {obligation.code}
                      </Mono>
                    </Td>
                    <Td>
                      <span lang={isArabic ? 'ar' : 'en'}>
                        {isArabic ? obligation.titleAr : obligation.titleEn}
                      </span>
                      {obligation.deadlineRuleKey === null ? null : (
                        <span className="mt-[var(--space-4)] block">
                          <Mono size="body-sm" tone="mist">
                            {obligation.deadlineRuleKey}
                          </Mono>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <VocabLabel
                        locale={locale}
                        vocab="obligationSection"
                        value={obligation.section}
                      />
                    </Td>
                    <Td>
                      <VocabLabel
                        locale={locale}
                        vocab="classificationGate"
                        value={obligation.gate}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {anyUnverified ? <UnverifiedMark locale={locale} /> : null}
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('classification.excludedTitle')}</Heading>
        <Text tone="mist">{t('classification.excludedIntro')}</Text>

        {set.excluded.length === 0 ? (
          <Text tone="mist">{t('classification.excludedEmpty')}</Text>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[30rem] border-collapse text-start"
              data-testid="qm-obligations-excluded"
            >
              <thead>
                <tr className="border-b border-line">
                  <Th>{t('classification.columnCode')}</Th>
                  <Th>{t('classification.columnGate')}</Th>
                  <Th>{t('classification.columnReason')}</Th>
                </tr>
              </thead>
              <tbody>
                {set.excluded.map((entry) => (
                  <tr
                    key={entry.code}
                    data-code={entry.code}
                    className="border-b border-line last:border-b-0"
                  >
                    <Td>
                      <Mono size="body-sm" tone="mist">
                        {entry.code}
                      </Mono>
                    </Td>
                    <Td>
                      <VocabLabel locale={locale} vocab="classificationGate" value={entry.gate} />
                    </Td>
                    {/* The reason arrives as a machine discriminator; the sentence is the
                        catalogue's, and the code is shown beside it for a ticket. */}
                    <Td>
                      <span className="flex flex-col gap-[var(--space-4)]">
                        {t('classification.excludedReasonGate')}
                        <Mono size="body-sm" tone="mist">
                          {entry.reason}
                        </Mono>
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** Mono uppercase header cell in Latin, IBM Plex Sans Arabic 600 in Arabic — `.qm-label` picks. */
function Th({ children }: { readonly children: ReactNode }) {
  return (
    <th scope="col" className="qm-label px-[var(--space-8)] py-[var(--space-8)] text-start">
      {children}
    </th>
  );
}

function Td({ children }: { readonly children: ReactNode }) {
  return (
    <td className="px-[var(--space-8)] py-[var(--space-12)] align-top text-body-sm text-ink">
      {children}
    </td>
  );
}
