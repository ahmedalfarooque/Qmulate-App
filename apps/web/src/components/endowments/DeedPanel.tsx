import { getTranslations } from 'next-intl/server';

import { Card, Heading, Text } from '@qmulate/ui';

import { Chip } from './Chip';
import { DualDateValue } from './DualDateValue';
import { EligibilityPanel } from './EligibilityPanel';
import { RecordList, type RecordRow } from './RecordList';

import type { DeedRecord } from '@/lib/endowments/types';

/**
 * The trusteeship deed: the primary Nazir, the authorized representative, and the liability that
 * binds them (BR-105, Nazarah reg. Art. 11(5)).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * JOINT AND SEVERAL LIABILITY IS SHOWN, NOT BURIED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A delegated manager is jointly and severally liable with the Nazir. That is the whole reason the
 * distinction between a PRIMARY appointment and an AUTHORIZED-REPRESENTATIVE one exists on this
 * record, so it renders as a chip with its own words — never as an unlabelled tick, and never as a
 * colour alone. ⚠ Art. 11(5) is UNVERIFIED against primary law, like every statutory reference in
 * this repo.
 *
 * A representative may INITIATE and act inside the delegated scope. Approval and signature are NOT
 * delegable: only the Nazir approves, and every act taken by a representative is recorded against
 * the Nazir on whose behalf it was taken (`onBehalfOfId` in the audit trail). The screen states that
 * in prose because it is the boundary a delegated manager is most likely to misread — and because
 * there is no standing approver seat anywhere in this product to point at instead.
 *
 * ── A MISSING DEED IS A REAL STATE ────────────────────────────────────────────────────────
 * If no trusteeship deed is recorded, the screen says so and stops. It does not render an empty
 * form, because the appointment is what authorises every act of the trusteeship and nothing may be
 * inferred from its absence.
 */
export async function DeedPanel({
  locale,
  deed,
}: {
  readonly locale: string;
  readonly deed: DeedRecord | null;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  if (deed === null) {
    return (
      <Card as="section" className="flex flex-col gap-[var(--space-8)] text-start">
        <Heading level={2}>{t('deed.notRecorded')}</Heading>
        <Text tone="mist">{t('deed.notRecordedBody')}</Text>
      </Card>
    );
  }

  const notRecorded = tCommon('notRecorded');

  const primaryRows: readonly RecordRow[] = [
    { key: 'nazir', label: t('fields.primaryNazir'), value: deed.primaryNazir },
    {
      key: 'appointed',
      label: t('deed.appointedDate'),
      value:
        deed.primaryAppointed === null ? (
          notRecorded
        ) : (
          <DualDateValue locale={locale} date={deed.primaryAppointed} />
        ),
    },
    {
      key: 'successor',
      label: t('deed.successorNazir'),
      value: deed.successorNazir ?? notRecorded,
    },
  ];

  const repRows: readonly RecordRow[] =
    deed.authorizedRep === null
      ? []
      : [
          { key: 'repName', label: t('deed.repName'), value: deed.authorizedRep.name },
          {
            key: 'repScope',
            label: t('deed.repScope'),
            value: deed.authorizedRep.scope ?? notRecorded,
          },
          {
            key: 'repAppointed',
            label: t('deed.repAppointedDate'),
            value:
              deed.authorizedRep.appointedDate === null ? (
                notRecorded
              ) : (
                <DualDateValue locale={locale} date={deed.authorizedRep.appointedDate} />
              ),
          },
        ];

  const verificationRows: readonly RecordRow[] = [
    {
      key: 'verifiedAt',
      label: t('eligibility.verifiedAt'),
      value:
        deed.verifiedAt === null ? (
          notRecorded
        ) : (
          <DualDateValue locale={locale} date={deed.verifiedAt} />
        ),
    },
    {
      key: 'verifiedBy',
      label: t('eligibility.verifiedBy'),
      value: deed.verifiedBy ?? notRecorded,
    },
  ];

  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('deed.primaryTitle')}</Heading>
        <RecordList rows={primaryRows} data-testid="qm-deed-primary" />
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('deed.repTitle')}</Heading>
        {deed.authorizedRep === null ? (
          <Text tone="mist">{t('deed.repNone')}</Text>
        ) : (
          <>
            <RecordList rows={repRows} data-testid="qm-deed-rep" />
            <section className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]">
              <Heading level={3}>{t('deed.jointLiabilityTitle')}</Heading>
              <Chip
                tone={deed.jointlyLiable ? 'success' : 'danger'}
                label={deed.jointlyLiable ? tCommon('yes') : tCommon('no')}
                data-testid="qm-deed-joint-liability"
              />
              <Text tone="mist">{t('deed.jointLiabilityNote')}</Text>
              {/* The delegation boundary, spelled out: initiate yes, approve and sign never. */}
              <Text tone="mist">{t('deed.repAuthorityNote')}</Text>
            </section>
          </>
        )}
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('eligibility.title')}</Heading>
        <Text tone="mist">{t('eligibility.intro')}</Text>

        {deed.verifiedAt === null ? (
          <div className="flex flex-col gap-[var(--space-8)]">
            {/* Captured flags record a CLAIM. BR-109 asks for capture AND verification, so an
                unverified deed says so rather than presenting the flags as a verification. */}
            <Chip tone="warning" label={t('eligibility.notVerified')} />
            <Text tone="mist">{t('eligibility.notVerifiedBody')}</Text>
          </div>
        ) : (
          <RecordList rows={verificationRows} data-testid="qm-deed-verification" />
        )}

        <EligibilityPanel
          locale={locale}
          verdict={deed.primary}
          subject="primary"
          data-testid="qm-eligibility-primary"
        />

        {deed.representative === null ? null : (
          <EligibilityPanel
            locale={locale}
            verdict={deed.representative}
            subject="representative"
            data-testid="qm-eligibility-representative"
          />
        )}
      </Card>
    </div>
  );
}
