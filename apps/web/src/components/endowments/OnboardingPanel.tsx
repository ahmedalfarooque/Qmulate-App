import { getTranslations } from 'next-intl/server';

import { Button, Card, Heading, Label, Mono, Text } from '@qmulate/ui';

import { Chip, type ChipTone } from './Chip';
import { DualDateValue } from './DualDateValue';
import { VocabLabel } from './VocabLabel';
import { clearGateAction, reopenGateAction } from './onboarding-actions';

import type { OnboardingGateView, OnboardingView } from '@/lib/endowments/types';

/**
 * ⊕ S12-3 · THE THREE HANDOVER GATES (BR-1101), as a Nazir reads them.
 *
 * Each gate card says: its state (cleared by whom, when — dual-dated — or reopened why), what it
 * BLOCKS while open, what the record does not yet carry (the mechanical prerequisites, computed now),
 * and — only to a seat holding the verb — the form to clear it, with the operating model's checklist
 * attested item by item, or the Nazir's form to reopen it with a reason. A control the reader cannot
 * use is a false statement about the product, so a read-only seat sees state and nothing to press.
 */

const STATUS_TONE: Readonly<Record<string, ChipTone>> = { OPEN: 'warning', CLEARED: 'success' };
const FIELD =
  'rounded-[var(--radius-8)] border border-line bg-surface px-[var(--space-12)] py-[var(--space-8)] text-body text-ink';

export async function OnboardingPanel({
  locale,
  onboarding,
}: {
  readonly locale: string;
  readonly onboarding: OnboardingView;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const blockedNow = onboarding.blocked.filter((entry) => entry.by !== null);

  return (
    <div className="flex flex-col gap-[var(--space-16)]" data-testid="qm-onboarding">
      <Card
        as="section"
        className="flex flex-col gap-[var(--space-8)] text-start"
        data-testid="qm-onboarding-blocked"
      >
        <Heading level={3}>{t('onboarding.blockedNow')}</Heading>
        {blockedNow.length === 0 ? (
          <div data-testid="qm-onboarding-nothing-blocked">
            <Text tone="mist">{t('onboarding.nothingBlocked')}</Text>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {blockedNow.map((entry) => (
              <li
                key={entry.activity}
                data-testid="qm-onboarding-blocked-activity"
                data-activity={entry.activity}
              >
                <Chip
                  tone="danger"
                  label={
                    <VocabLabel locale={locale} vocab="gatedActivity" value={entry.activity} />
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ol className="flex flex-col gap-[var(--space-16)]" data-testid="qm-onboarding-gates">
        {onboarding.gates.map((gate) => (
          <li key={gate.gate}>
            <GateCard
              locale={locale}
              waqfId={onboarding.waqfId}
              gate={gate}
              writable={onboarding.writable}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

async function GateCard({
  locale,
  waqfId,
  gate,
  writable,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly gate: OnboardingGateView;
  readonly writable: OnboardingView['writable'];
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const isOpen = gate.status === 'OPEN';
  const mayClear =
    isOpen && writable.clear && gate.orderRefusal === null && gate.unmetPrerequisites.length === 0;
  const mayReopen = !isOpen && writable.reopen && gate.orderRefusal === null;

  return (
    <Card
      as="article"
      data-testid="qm-onboarding-gate"
      data-gate={gate.gate}
      data-status={gate.status}
      data-recorded={gate.recorded ? 'true' : 'false'}
      className="flex flex-col gap-[var(--space-16)] text-start"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-12)]">
        <Heading level={3}>
          <VocabLabel locale={locale} vocab="onboardingGate" value={gate.gate} />
        </Heading>
        <Chip
          tone={STATUS_TONE[gate.status] ?? 'neutral'}
          label={<VocabLabel locale={locale} vocab="onboardingGateStatus" value={gate.status} />}
          data-testid="qm-onboarding-gate-status"
        />
      </div>

      {!gate.recorded ? (
        <div data-testid="qm-onboarding-gate-unrecorded">
          <Text variant="body-sm" tone="mist">
            {t('onboarding.notRecorded')}
          </Text>
        </div>
      ) : null}

      {gate.status === 'CLEARED' ? (
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-[var(--space-12)] gap-y-[var(--space-4)] text-body-sm"
          data-testid="qm-onboarding-gate-cleared"
        >
          <dt className="text-mist">{t('onboarding.clearedBy')}</dt>
          <dd>
            {gate.clearedBy === null ? (
              tCommon('notRecorded')
            ) : (
              <Mono size="body-sm">{gate.clearedBy}</Mono>
            )}
          </dd>
          <dt className="text-mist">{t('onboarding.clearedAt')}</dt>
          <dd>
            {gate.clearedAt === null ? (
              tCommon('notRecorded')
            ) : (
              <DualDateValue locale={locale} date={gate.clearedAt} />
            )}
          </dd>
        </dl>
      ) : gate.reopenedAt !== null ? (
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-[var(--space-12)] gap-y-[var(--space-4)] text-body-sm"
          data-testid="qm-onboarding-gate-reopened"
        >
          <dt className="text-mist">{t('onboarding.reopenedBy')}</dt>
          <dd>
            {gate.reopenedBy === null ? (
              tCommon('notRecorded')
            ) : (
              <Mono size="body-sm">{gate.reopenedBy}</Mono>
            )}
          </dd>
          <dt className="text-mist">{t('onboarding.reopenedAt')}</dt>
          <dd>
            <DualDateValue locale={locale} date={gate.reopenedAt} />
          </dd>
          <dt className="text-mist">{t('onboarding.reopenReason')}</dt>
          <dd>{gate.reopenReason ?? tCommon('notRecorded')}</dd>
        </dl>
      ) : null}

      {gate.blocks.length > 0 ? (
        <section className="flex flex-col gap-[var(--space-4)]">
          <Text variant="body-sm" className="font-medium">
            {t('onboarding.blocksTitle')}
          </Text>
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {gate.blocks.map((activity) => (
              <li key={activity}>
                <Chip
                  tone={isOpen ? 'danger' : 'neutral'}
                  label={<VocabLabel locale={locale} vocab="gatedActivity" value={activity} />}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isOpen && gate.unmetPrerequisites.length > 0 ? (
        <section
          className="flex flex-col gap-[var(--space-4)]"
          data-testid="qm-onboarding-prerequisites"
        >
          <Text variant="body-sm" className="font-medium">
            {t('onboarding.prerequisitesTitle')}
          </Text>
          <ul className="flex flex-col gap-[var(--space-4)]">
            {gate.unmetPrerequisites.map((code) => (
              <li key={code} data-testid="qm-onboarding-prerequisite" data-code={code}>
                <Text variant="body-sm" tone="mist">
                  <VocabLabel locale={locale} vocab="gatePrerequisite" value={code} />
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {gate.orderRefusal !== null ? (
        <div data-testid="qm-onboarding-order-refusal" data-refusal={gate.orderRefusal}>
          <Text variant="body-sm" tone="mist">
            {t(`onboarding.orderRefusal.${gate.orderRefusal}`)}
          </Text>
        </div>
      ) : null}

      {mayClear ? (
        <form
          action={clearGateAction}
          className="flex flex-col gap-[var(--space-12)] border-t border-line pt-[var(--space-16)]"
          data-testid="qm-onboarding-clear-form"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="waqfId" value={waqfId} />
          <input type="hidden" name="gate" value={gate.gate} />
          <Heading level={3}>{t('onboarding.clearTitle')}</Heading>
          <Text variant="body-sm" tone="mist">
            {t('onboarding.clearIntro')}
          </Text>
          <Text variant="body-sm" className="font-medium">
            {t('onboarding.checklistTitle')}
          </Text>
          <ul className="flex flex-col gap-[var(--space-8)]">
            {gate.checklist.map((item) => (
              <li key={item} className="flex items-center gap-[var(--space-8)]">
                <input
                  id={`qm-attest-${gate.gate}-${item}`}
                  type="checkbox"
                  name={`attest:${item}`}
                  required
                  data-testid="qm-onboarding-attest"
                  data-item={item}
                />
                <Label htmlFor={`qm-attest-${gate.gate}-${item}`}>
                  <VocabLabel locale={locale} vocab="gateChecklist" value={item} />
                </Label>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-[var(--space-4)]">
            <Label htmlFor={`qm-gate-note-${gate.gate}`}>{t('onboarding.note')}</Label>
            <input
              id={`qm-gate-note-${gate.gate}`}
              name="note"
              type="text"
              maxLength={2048}
              className={FIELD}
            />
          </div>
          <div>
            <Button type="submit" variant="primary" data-testid="qm-onboarding-clear-save">
              {t('onboarding.clear')}
            </Button>
          </div>
        </form>
      ) : null}

      {mayReopen ? (
        <form
          action={reopenGateAction}
          className="flex flex-col gap-[var(--space-12)] border-t border-line pt-[var(--space-16)]"
          data-testid="qm-onboarding-reopen-form"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="waqfId" value={waqfId} />
          <input type="hidden" name="gate" value={gate.gate} />
          <Heading level={3}>{t('onboarding.reopenTitle')}</Heading>
          <Text variant="body-sm" tone="mist">
            {t('onboarding.reopenIntro')}
          </Text>
          <div className="flex flex-col gap-[var(--space-4)]">
            <Label htmlFor={`qm-gate-reason-${gate.gate}`} requiredLabel={tCommon('required')}>
              {t('onboarding.reason')}
            </Label>
            <input
              id={`qm-gate-reason-${gate.gate}`}
              name="reason"
              type="text"
              required
              maxLength={2048}
              className={FIELD}
              data-testid="qm-onboarding-reason"
            />
          </div>
          <div>
            <Button type="submit" variant="tertiary" data-testid="qm-onboarding-reopen-save">
              {t('onboarding.reopen')}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
