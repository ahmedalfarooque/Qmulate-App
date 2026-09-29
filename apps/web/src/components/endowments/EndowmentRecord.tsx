import { getTranslations } from 'next-intl/server';

import { Card, Heading, Mono, Text } from '@qmulate/ui';

import { Chip } from './Chip';
import { DualDateValue } from './DualDateValue';
import { CLASSIFICATION_TONE } from './EndowmentHeader';
import { RecordList, type RecordRow } from './RecordList';
import { VocabLabel, vocabText } from './VocabLabel';

import type { EndowmentDetail } from '@/lib/endowments/types';

/**
 * The endowment record — every BR-101 element in one payload, on one screen.
 *
 * Three sections, and the middle one is the reason this screen is not a settings form:
 *
 *   1. IDENTITY AND REGISTRATION — certificate and deed numbers, classification, type, nature, the
 *      registration date in BOTH calendars, certificate validity, fiscal year end.
 *   2. CONDITIONS CARRIED ON THE DEED — the entitlement order, the line-continuation stipulation
 *      and مآل الوقف. These are FOUNDER'S CONDITIONS living in columns. The screen says so in
 *      words and offers no edit affordance for any of them.
 *   3. TRUSTEESHIP — who holds the appointment, and whether a delegated manager is jointly liable.
 *
 * ── THE THREE STATES OF مآل الوقف, KEPT APART ─────────────────────────────────────────────
 * The reversion clause has THREE states, not two, and flattening them is how an endowment quietly
 * acquires an answer nobody gave:
 *
 *   · `captured: false`               — NOBODY HAS READ THE CLAUSE YET.
 *   · `captured: true, kind: null`    — THE DEED POSITIVELY RECORDS NO ULTIMATE TAKER.
 *   · `captured: true, kind: …`       — a named charitable jiha, which receives NOTHING while the
 *                                       bloodline continues and takes at the DEED'S weight.
 *
 * The first two get different sentences, in both languages. Rendering "no ultimate taker" for an
 * unread deed would state, on a legal record, that the founder was silent when in fact nobody has
 * looked — and it is exactly the confusion `reversionClauseCaptured` was added to prevent.
 *
 * ⚠ NO DEFAULTS ANYWHERE ON THIS SCREEN. An absent `continuationStipulation` renders as
 * "not recorded", never as one of the two values: which lines a founder continued is a reading of
 * the deed, and a defaulted term would be code answering a question of fiqh.
 */
export async function EndowmentRecord({
  locale,
  endowment,
  clientName,
  waqifName,
}: {
  readonly locale: string;
  readonly endowment: EndowmentDetail;
  /** `null` when the family is outside the caller's scope — non-disclosure, not an error. */
  readonly clientName: string | null;
  readonly waqifName: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  // The withheld-deed sentence reuses the catalogue's existing access wording — see below.
  const tErrors = await getTranslations({ locale, namespace: 'errors' });

  const notRecorded = (
    <Text as="span" variant="body" tone="mist" measured={false}>
      {tCommon('notRecorded')}
    </Text>
  );

  const identityRows: readonly RecordRow[] = [
    {
      key: 'client',
      label: t('fields.client'),
      value:
        clientName === null ? (
          notRecorded
        ) : (
          <span lang={locale === 'ar' ? 'ar' : 'en'}>{clientName}</span>
        ),
    },
    {
      key: 'waqif',
      label: t('fields.waqif'),
      value:
        waqifName === null ? (
          notRecorded
        ) : (
          <span lang={locale === 'ar' ? 'ar' : 'en'}>{waqifName}</span>
        ),
    },
    {
      key: 'certificateNumber',
      label: t('fields.certificateNumber'),
      value: <Mono>{endowment.certificateNumber}</Mono>,
    },
    {
      key: 'deedNumber',
      label: t('fields.deedNumber'),
      value: endowment.deedNumber === null ? notRecorded : <Mono>{endowment.deedNumber}</Mono>,
    },
    {
      key: 'classification',
      label: t('fields.classification'),
      value: (
        <Chip
          tone={CLASSIFICATION_TONE[endowment.classification] ?? 'neutral'}
          label={await vocabText(locale, 'classification', endowment.classification)}
        />
      ),
    },
    {
      key: 'waqfType',
      label: t('fields.waqfType'),
      value: <VocabLabel locale={locale} vocab="waqfType" value={endowment.type} />,
    },
    {
      key: 'waqfNature',
      label: t('fields.waqfNature'),
      value: <VocabLabel locale={locale} vocab="waqfNature" value={endowment.nature} />,
    },
    {
      key: 'registrationDate',
      label: t('fields.registrationDate'),
      value:
        endowment.registrationDate === null ? (
          notRecorded
        ) : (
          <DualDateValue locale={locale} date={endowment.registrationDate} />
        ),
    },
    {
      key: 'certificateExpiry',
      label: t('fields.certificateExpiry'),
      value:
        endowment.certificateExpiry === null ? (
          notRecorded
        ) : (
          <DualDateValue locale={locale} date={endowment.certificateExpiry} />
        ),
    },
    {
      key: 'fiscalYearEnd',
      label: t('fields.fiscalYearEnd'),
      // A month-day pattern, not a date: Latin digits, tabular, LTR-isolated.
      value:
        endowment.fiscalYearEnd === null ? notRecorded : <Mono>{endowment.fiscalYearEnd}</Mono>,
    },
  ];

  const termRows: readonly RecordRow[] = [
    {
      key: 'entitlementOrder',
      label: t('fields.entitlementOrder'),
      value: (
        <VocabLabel locale={locale} vocab="entitlementOrder" value={endowment.entitlementOrder} />
      ),
    },
    {
      key: 'continuationStipulation',
      label: t('fields.continuationStipulation'),
      // A CLOSED two-value term with NO default. Absent means absent, and renders as such.
      value: (
        <VocabLabel
          locale={locale}
          vocab="continuation"
          value={endowment.continuationStipulation}
        />
      ),
    },
    {
      key: 'shartVersion',
      label: t('fields.shartVersion'),
      value:
        endowment.shartAlWaqifVersion === null ? (
          notRecorded
        ) : (
          <Mono>{String(endowment.shartAlWaqifVersion)}</Mono>
        ),
    },
  ];

  /**
   * ⚠ THREE OUTCOMES, AND THE FIRST TWO MUST NOT LOOK ALIKE (G7-V2).
   *
   *  · WITHHELD (`disclosed: false`) — the reader holds no `endowment:deed:read`, so the section
   *    shows the catalogue's own access sentence and NOTHING about the deed. It does not say "not
   *    recorded", because that would be a false statement about a governance record made on the
   *    strength of a fact about the READER.
   *  · NOT RECORDED (`recorded: false`) — the endowment genuinely has no trusteeship deed.
   *  · DISCLOSED — the three-field summary; the representative's identity stays on the deed screen.
   *
   * Both sentences are EXISTING catalogue entries (`errors.notAuthorizedBody`,
   * `endowments.deed.notRecorded`). No new copy is minted here.
   */
  const trusteeship = endowment.trusteeship;
  const trusteeshipWithheld = trusteeship !== null && !trusteeship.disclosed;
  const trusteeshipRows: readonly RecordRow[] =
    trusteeship === null || !trusteeship.disclosed || trusteeship.recorded !== true
      ? []
      : [
          {
            key: 'primaryNazir',
            label: t('fields.primaryNazir'),
            value: trusteeship.primaryNazir ?? notRecorded,
          },
          {
            key: 'authorizedRep',
            label: t('fields.authorizedRep'),
            value: trusteeship.hasAuthorizedRep === true ? tCommon('yes') : tCommon('no'),
          },
          {
            key: 'jointlyLiable',
            label: t('fields.jointlyLiable'),
            // Colour is never the only signal: the chip's own words carry the fact.
            value: (
              <Chip
                tone={trusteeship.jointlyLiable === true ? 'success' : 'warning'}
                label={trusteeship.jointlyLiable === true ? tCommon('yes') : tCommon('no')}
                data-testid="qm-jointly-liable"
              />
            ),
            note: trusteeship.hasAuthorizedRep === true ? t('deed.jointLiabilityNote') : undefined,
          },
        ];

  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('record.identityTitle')}</Heading>
        <RecordList rows={identityRows} data-testid="qm-record-identity" />
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('record.termsTitle')}</Heading>
        {/* The sentence that stops this screen reading like a settings page. */}
        <Text tone="mist">{t('record.termsIntro')}</Text>
        <RecordList rows={termRows} data-testid="qm-record-terms" />
        <ReversionBlock locale={locale} endowment={endowment} />
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('record.trusteeshipTitle')}</Heading>
        {/*
          ⚠ THE TEST ID SITS ON THE WRAPPER, NOT ON `<Text>` — and that is not a style choice.
          `Text` enumerates its props and forwards no `data-*`, while TypeScript permits a
          hyphenated JSX attribute on ANY component without checking it, so `data-testid` on a
          `<Text>` compiles, renders nothing, and the assertion looking for it fails with
          "element not found" pointing at the screen instead of at the prop. MEASURED here.
        */}
        {trusteeshipWithheld ? (
          <div data-testid="qm-record-trusteeship-withheld">
            <Text tone="mist">{tErrors('notAuthorizedBody')}</Text>
          </div>
        ) : trusteeshipRows.length === 0 ? (
          <div data-testid="qm-record-trusteeship-absent">
            <Text tone="mist">{t('deed.notRecorded')}</Text>
          </div>
        ) : (
          <RecordList rows={trusteeshipRows} data-testid="qm-record-trusteeship" />
        )}
      </Card>
    </div>
  );
}

/** مآل الوقف — the ultimate taker, in whichever of its three states this deed is in. */
async function ReversionBlock({
  locale,
  endowment,
}: {
  readonly locale: string;
  readonly endowment: EndowmentDetail;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const { reversion } = endowment;

  return (
    <section
      data-testid="qm-reversion"
      data-captured={reversion.captured ? 'true' : 'false'}
      className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)] text-start"
    >
      <Heading level={3}>{t('fields.reversion')}</Heading>

      {!reversion.captured ? (
        <>
          {/* State 1 — the clause has not been read. A warning, because no distribution may be
              produced from this endowment until it is: the mapper refuses to build a run input at
              all rather than let "unread" pass as the founder's silence. */}
          <Chip tone="warning" label={t('reversion.notCaptured')} />
          <Text tone="mist">{t('reversion.notCapturedBody')}</Text>
        </>
      ) : reversion.kind === null ? (
        <>
          {/* State 2 — the deed positively records no ultimate taker. A statement, not a gap. */}
          <Chip tone="neutral" label={t('reversion.recordsNone')} />
          <Text tone="mist">{t('reversion.recordsNoneBody')}</Text>
        </>
      ) : (
        <>
          {/* State 3 — a named charitable jiha. */}
          <Chip
            tone="info"
            label={<VocabLabel locale={locale} vocab="reversionKind" value={reversion.kind} />}
          />
          <Text tone="mist">{t('reversion.takersBody')}</Text>
          <Text variant="body-sm" tone="mist">
            {t('reversion.takersTitle')}
          </Text>
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {reversion.ultimateTakerIds.map((id) => (
              <li key={id}>
                <Mono size="body-sm" tone="mist">
                  {id}
                </Mono>
              </li>
            ))}
          </ul>
          {reversion.recordedAt === null ? null : (
            <Text variant="body-sm" tone="mist">
              {t('reversion.recordedAt')}{' '}
              <DualDateValue locale={locale} date={reversion.recordedAt} />
            </Text>
          )}
        </>
      )}
    </section>
  );
}
