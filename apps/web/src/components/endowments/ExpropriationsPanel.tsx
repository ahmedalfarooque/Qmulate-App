import { getTranslations } from 'next-intl/server';

import { Button, Card, Heading, Label, Mono, Text } from '@qmulate/ui';

import { DualDateValue } from './DualDateValue';
import { RecordList, type RecordRow } from './RecordList';
import { Refusal } from './Refusal';
import { UnverifiedMark } from './UnverifiedMark';
import { clearIstibdalCompletionAction, recordIstibdalCompletionAction } from './anchor-actions';

import type { ExpropriationView, Loaded } from '@/lib/endowments/types';

/**
 * ⊕ S11-1 — the endowment's takings, each with the ONE input the ruling made an operator's: the
 * istibdal COMPLETION date, `ISTIBDAL_10BD`'s anchor (9f3d8fd).
 *
 * There was no expropriation surface anywhere before this (measured 2026-09-02) — so this is the
 * minimal read-only row the completion input needs to be reachable, not an expropriation workflow.
 * The compensation figure is deliberately absent: it is a ledger fact (a corpus receipt, Binding
 * rule 1), and this panel is about the clock.
 *
 * "Not recorded" renders its own sentence per taking (`expropriations.notCompleted`): a pending
 * substitution has no Authority-notice deadline computed for it, and the screen says so rather than
 * showing an empty date.
 */
export async function ExpropriationsPanel({
  locale,
  waqfId,
  expropriations,
  writable,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly expropriations: Loaded<readonly ExpropriationView[]>;
  /** Whether THIS caller holds `endowment:asset:write` — the forms are drawn only then (E3 pin). */
  readonly writable: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const FIELD = [
    'min-h-tap w-full rounded-control border border-edge bg-well',
    'px-[var(--space-12)] py-[var(--space-8)] text-body text-ink',
    'focus-visible:shadow-focus focus-visible:outline-none',
  ].join(' ');

  return (
    <Card
      as="section"
      className="flex flex-col gap-[var(--space-16)]"
      data-testid="qm-expropriations-panel"
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <Heading level={2}>{t('expropriations.title')}</Heading>
        <Text tone="mist">{t('expropriations.intro')}</Text>
        <UnverifiedMark locale={locale} />
      </div>

      {expropriations.status !== 'ok' ? (
        <Refusal locale={locale} messageKey={expropriations.messageKey} />
      ) : expropriations.value.length === 0 ? (
        <div data-testid="qm-expropriations-empty">
          <Text tone="mist">{t('expropriations.empty')}</Text>
        </div>
      ) : (
        <ul className="flex flex-col gap-[var(--space-24)]">
          {expropriations.value.map((taking) => {
            const rows: readonly RecordRow[] = [
              { key: 'id', label: 'ID', value: <Mono>{taking.id}</Mono> },
              {
                key: 'announced',
                label: t('expropriations.announced'),
                value: <DualDateValue locale={locale} date={taking.announcedDate} />,
              },
              {
                key: 'status',
                label: t('expropriations.status'),
                value: <Mono>{taking.istibdalStatus}</Mono>,
              },
              {
                key: 'completed',
                label: t('expropriations.completed'),
                value:
                  taking.istibdalCompleted === null ? (
                    <span data-testid={`qm-istibdal-not-recorded-${taking.id}`}>
                      <Text as="span" tone="warning" measured={false}>
                        {t('expropriations.notCompleted')}
                      </Text>
                    </span>
                  ) : (
                    <DualDateValue locale={locale} date={taking.istibdalCompleted} />
                  ),
              },
            ];
            const dateId = `qm-istibdal-date-${taking.id}`;
            return (
              <li
                key={taking.id}
                className="flex flex-col gap-[var(--space-12)]"
                data-testid={`qm-expropriation-${taking.id}`}
              >
                <RecordList rows={rows} />
                {writable ? (
                  <form
                    action={recordIstibdalCompletionAction}
                    className="flex flex-col gap-[var(--space-12)]"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="waqfId" value={waqfId} />
                    <input type="hidden" name="expropriationId" value={taking.id} />
                    <div className="flex flex-col gap-[var(--space-4)] sm:max-w-xs">
                      <Label htmlFor={dateId} requiredLabel={tCommon('required')}>
                        {t('expropriations.completed')}
                      </Label>
                      <input
                        id={dateId}
                        name="date"
                        type="date"
                        required
                        defaultValue={
                          taking.istibdalCompleted === null
                            ? ''
                            : taking.istibdalCompleted.iso.slice(0, 10)
                        }
                        className={FIELD}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-[var(--space-12)]">
                      <Button
                        type="submit"
                        variant="primary"
                        data-testid={`qm-istibdal-save-${taking.id}`}
                      >
                        {t('expropriations.save')}
                      </Button>
                    </div>
                  </form>
                ) : null}
                {taking.istibdalCompleted === null || !writable ? null : (
                  <form action={clearIstibdalCompletionAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="waqfId" value={waqfId} />
                    <input type="hidden" name="expropriationId" value={taking.id} />
                    <Button
                      type="submit"
                      variant="tertiary"
                      data-testid={`qm-istibdal-clear-${taking.id}`}
                    >
                      {t('expropriations.clear')}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
