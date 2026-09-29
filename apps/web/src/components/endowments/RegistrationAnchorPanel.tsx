import { getTranslations } from 'next-intl/server';

import { Button, Card, Heading, Label, Text } from '@qmulate/ui';

import { DualDateValue } from './DualDateValue';
import { RecordList, type RecordRow } from './RecordList';
import { UnverifiedMark } from './UnverifiedMark';
import { VocabLabel } from './VocabLabel';
import {
  clearRegistrationAnchorAction,
  dischargeRegistrationDutyAction,
  recordRegistrationAnchorAction,
} from './anchor-actions';

import type { EndowmentDetail, Loaded, RegistrationDeadlineView } from '@/lib/endowments/types';

/**
 * ⊕ S11-1 — the `REGISTER_30BD` clock-start, as the input field the owner asked for.
 *
 * Owner, 2026-08-31 (9f3d8fd): *"the stating dates for now should be an input field that i can put …
 * yes sure, make a drop down if that helps."* Owner, 2026-09-02 (f57e13d): editable, with the audit
 * log as the history. This panel is both halves: the recorded state, read back in both calendars
 * from the frozen snapshot, and the form — a date and the two-option dropdown — that records or
 * corrects it.
 *
 * ── "NOT RECORDED" IS A SENTENCE, NEVER AN EMPTY FIELD ─────────────────────────────────────────
 * The condition attached to the ruling: blank means CANNOT COMPUTE, never "no deadline". So the
 * absent state renders its own sentence (`anchor.notRecorded`) beside the empty form, rather than
 * the form alone — an operator must read that the registration deadline is not being computed for
 * this endowment, not infer it from a blank input.
 *
 * ── HAND-BUILT CONTROLS, THE `PeriodForm` PRECEDENT ────────────────────────────────────────────
 * `@qmulate/ui` ships no form primitives; the inputs are written against the tokens with `<Label>`
 * supplying the label treatment, a real `<label for>`, `required`, and the ≥3:1 edge cue. The date
 * input is the browser's own (`type="date"`, submits `yyyy-MM-dd` whatever it displays) — this app
 * has no calendar implementation by design; the kernel derives the frozen Hijri twin and this panel
 * renders it BACK from the record.
 *
 * ⚠ The rule-3 flag is on the panel, in both locales: which date governs and the 30-day figure are
 * unverified against primary law, and the screen says so where the operator is asked to choose.
 */
export async function RegistrationAnchorPanel({
  locale,
  endowment,
  deadline,
}: {
  readonly locale: string;
  readonly endowment: EndowmentDetail;
  /**
   * ⊕ S11-2 — the REGISTER_30BD chain head, read separately under `compliance:task:read`. A REFUSAL
   * hides the whole discharge section (a seat that cannot read deadlines is told nothing about them —
   * never "none is on file"); `null` inside an `ok` result is the honest "no deadline on file".
   */
  readonly deadline: Loaded<RegistrationDeadlineView | null>;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const anchor = endowment.registrationAnchor;

  const FIELD = [
    'min-h-tap w-full rounded-control border border-edge bg-well',
    'px-[var(--space-12)] py-[var(--space-8)] text-body text-ink',
    'focus-visible:shadow-focus focus-visible:outline-none',
  ].join(' ');

  const recordedRows: readonly RecordRow[] =
    anchor === null
      ? []
      : [
          {
            key: 'anchorDate',
            label: t('anchor.date'),
            value: <DualDateValue locale={locale} date={anchor.date} />,
          },
          {
            key: 'anchorKind',
            label: t('anchor.kind'),
            value: (
              <VocabLabel locale={locale} vocab="registrationAnchorKind" value={anchor.kind} />
            ),
          },
        ];

  return (
    <Card
      as="section"
      className="flex flex-col gap-[var(--space-16)]"
      data-testid="qm-anchor-panel"
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <Heading level={2}>{t('anchor.title')}</Heading>
        <Text tone="mist">{t('anchor.intro')}</Text>
        <UnverifiedMark locale={locale} />
      </div>

      {anchor === null ? (
        // THE STATE THAT MUST NEVER LOOK LIKE "NOTHING DUE".
        <div data-testid="qm-anchor-not-recorded" role="status">
          <Text tone="warning">{t('anchor.notRecorded')}</Text>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--space-8)]" data-testid="qm-anchor-recorded">
          <Text variant="body-sm" tone="success">
            {t('anchor.recorded')}
          </Text>
          <RecordList rows={recordedRows} data-testid="qm-anchor-record" />
        </div>
      )}

      {/* ⚠ DRAWN ONLY FOR A SEAT THAT HOLDS `endowment:waqf:write` (the kernel answers; the E3 pin:
          a control the reader cannot use is a false statement about the product). A read-only seat
          sees the recorded state above and nothing to press. */}
      {endowment.writable.registrationAnchor ? (
        <form
          action={recordRegistrationAnchorAction}
          className="flex flex-col gap-[var(--space-16)]"
          data-testid="qm-anchor-form"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="waqfId" value={endowment.id} />
          <div className="grid grid-cols-1 gap-[var(--space-16)] sm:grid-cols-2">
            <div className="flex flex-col gap-[var(--space-4)]">
              <Label htmlFor="qm-anchor-date" requiredLabel={tCommon('required')}>
                {t('anchor.date')}
              </Label>
              <input
                id="qm-anchor-date"
                name="date"
                type="date"
                required
                defaultValue={anchor === null ? '' : anchor.date.iso.slice(0, 10)}
                className={FIELD}
                data-testid="qm-anchor-date"
              />
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <Label htmlFor="qm-anchor-kind" requiredLabel={tCommon('required')}>
                {t('anchor.kind')}
              </Label>
              {/* THE OWNER'S DROPDOWN. Two options, no default selected: the kind is chosen, never assumed. */}
              <select
                id="qm-anchor-kind"
                name="kind"
                required
                defaultValue={anchor === null ? '' : anchor.kind}
                className={FIELD}
                data-testid="qm-anchor-kind"
              >
                <option value="" disabled>
                  {t('anchor.kindPlaceholder')}
                </option>
                <option value="WAQF_DOCUMENTATION_DATE">
                  {t('registrationAnchorKindValue.WAQF_DOCUMENTATION_DATE')}
                </option>
                <option value="REGULATION_EFFECTIVE_DATE">
                  {t('registrationAnchorKindValue.REGULATION_EFFECTIVE_DATE')}
                </option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--space-12)]">
            <Button type="submit" variant="primary" data-testid="qm-anchor-save">
              {t('anchor.save')}
            </Button>
            <Text variant="body-sm" tone="mist">
              {t('anchor.editable')}
            </Text>
          </div>
        </form>
      ) : null}

      {anchor === null || !endowment.writable.registrationAnchor ? null : (
        // Clearing is its own form so the primary action never carries a hidden "clear" flag.
        <form action={clearRegistrationAnchorAction} data-testid="qm-anchor-clear-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="waqfId" value={endowment.id} />
          <Button type="submit" variant="tertiary" data-testid="qm-anchor-clear">
            {t('anchor.clear')}
          </Button>
        </form>
      )}

      {/* ⊕ S11-2 — THE DISCHARGE (owner ruling f797fea): the red clears because the duty was MET,
          recorded here as a fact with its date — never by editing the clock-start above. Drawn only
          when the deadline is READABLE by this seat; the form only to a seat holding
          `compliance:task:write` (the E3 no-affordance pin). */}
      {anchor === null || deadline.status !== 'ok' ? null : (
        <div
          className="flex flex-col gap-[var(--space-12)] border-t border-edge pt-[var(--space-16)]"
          data-testid="qm-discharge-section"
        >
          <div className="flex flex-col gap-[var(--space-4)]">
            <Heading level={3}>{t('discharge.title')}</Heading>
            <Text tone="mist">{t('discharge.intro')}</Text>
          </div>

          {deadline.value === null ? (
            // A recorded clock-start with NO deadline row (not computable): nothing to discharge against.
            <div data-testid="qm-registration-no-deadline" role="status">
              <Text tone="warning">{t('discharge.noDeadline')}</Text>
            </div>
          ) : deadline.value.discharged !== null ? (
            <div
              className="flex flex-col gap-[var(--space-8)]"
              data-testid="qm-registration-discharged"
            >
              <Text variant="body-sm" tone="success">
                {t('dischargeKindValue.MET')}
              </Text>
              <RecordList
                rows={[
                  {
                    key: 'dischargedOn',
                    label: t('discharge.dischargedOn'),
                    value: <DualDateValue locale={locale} date={deadline.value.discharged.on} />,
                  },
                  {
                    key: 'due',
                    label: t('discharge.due'),
                    value: <DualDateValue locale={locale} date={deadline.value.due} />,
                  },
                ]}
                data-testid="qm-discharge-record"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-[var(--space-12)]" data-testid="qm-registration-open">
              <Text variant="body-sm" tone="warning">
                {t('discharge.open')}
              </Text>
              <RecordList
                rows={[
                  {
                    key: 'due',
                    label: t('discharge.due'),
                    value: <DualDateValue locale={locale} date={deadline.value.due} />,
                  },
                ]}
                data-testid="qm-discharge-record"
              />
              {endowment.writable.registrationDischarge ? (
                <form
                  action={dischargeRegistrationDutyAction}
                  className="flex flex-col gap-[var(--space-16)]"
                  data-testid="qm-discharge-form"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="waqfId" value={endowment.id} />
                  <div className="flex flex-col gap-[var(--space-4)] sm:max-w-[50%]">
                    <Label htmlFor="qm-discharge-date" requiredLabel={tCommon('required')}>
                      {t('discharge.date')}
                    </Label>
                    <input
                      id="qm-discharge-date"
                      name="date"
                      type="date"
                      required
                      className={FIELD}
                      data-testid="qm-discharge-date"
                    />
                  </div>
                  <div>
                    <Button type="submit" variant="primary" data-testid="qm-discharge-save">
                      {t('discharge.save')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
