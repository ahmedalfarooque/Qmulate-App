import { getTranslations } from 'next-intl/server';

import { Button, Heading, Label, Text } from '@qmulate/ui';

import { intakeEndowmentAction } from './intake-actions';

import type { IntakeAuthorityView } from '@/lib/endowments/types';

const TYPES = ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI'] as const;
const NATURES = ['AYNI', 'QIYAMI'] as const;
const ORDERS = ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'] as const;

const FIELD = 'flex flex-col gap-[var(--space-4)]';
const INPUT =
  'rounded-[var(--radius-8)] border border-[var(--color-line)] bg-[var(--color-surface)] px-[var(--space-12)] py-[var(--space-8)] text-[var(--color-ink)]';

/**
 * ⊕ S12-3b · the intake form. Arabic-first; drawn only when the caller may register for at least one
 * client (`authority.clients` non-empty) — the page renders the refusal sentence otherwise. Every
 * field posts to ONE server action, which calls the ONE procedure; the database re-proves the birth.
 */
export async function IntakeForm({
  locale,
  authority,
  fixtureOnly,
}: {
  locale: string;
  authority: IntakeAuthorityView;
  fixtureOnly: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const firstClient = authority.clients[0];
  if (firstClient === undefined) return null;

  return (
    <form
      action={intakeEndowmentAction}
      className="flex flex-col gap-[var(--space-24)]"
      data-testid="qm-intake-form"
    >
      <input type="hidden" name="locale" value={locale} />

      {fixtureOnly ? (
        <div data-testid="qm-intake-fixture-note">
          <Text variant="body-sm" tone="mist">
            {/* The fixture grammar's two tokens (`fixture-schema.ts`): ICU arguments, so the Arabic
                catalogue stays Arabic and the heuristic that guards it is not allow-listed around. */}
            {t('intake.fixtureNote', { prefix: 'FAKE-', domain: '@example.test' })}
          </Text>
        </div>
      ) : null}

      <section className="flex flex-col gap-[var(--space-12)]">
        <div className={FIELD}>
          <Label htmlFor="qm-intake-client">{t('intake.client')}</Label>
          <select
            id="qm-intake-client"
            name="clientId"
            className={INPUT}
            defaultValue={firstClient.id}
            data-testid="qm-intake-client"
          >
            {authority.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {locale === 'ar' ? client.nameAr : (client.nameEn ?? client.nameAr)}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-[var(--space-8)]">
          <legend>
            <Text variant="body-sm" className="font-medium">
              {t('intake.waqif')}
            </Text>
          </legend>
          <label className="flex items-center gap-[var(--space-8)]">
            <input
              type="radio"
              name="waqifMode"
              value="existing"
              defaultChecked
              data-testid="qm-intake-waqif-existing"
            />
            <Text variant="body-sm">{t('intake.waqifExisting')}</Text>
          </label>
          <select
            name="waqifId"
            className={INPUT}
            defaultValue={firstClient.waqifs[0]?.id}
            data-testid="qm-intake-waqif"
          >
            {authority.clients.flatMap((client) =>
              client.waqifs.map((waqif) => (
                <option key={waqif.id} value={waqif.id}>
                  {locale === 'ar' ? waqif.nameAr : (waqif.nameEn ?? waqif.nameAr)}
                </option>
              )),
            )}
          </select>
          <label className="flex items-center gap-[var(--space-8)]">
            <input type="radio" name="waqifMode" value="new" data-testid="qm-intake-waqif-new" />
            <Text variant="body-sm">{t('intake.waqifNew')}</Text>
          </label>
          <div className={FIELD}>
            <Label htmlFor="qm-intake-waqif-name-ar">{t('intake.waqifNameAr')}</Label>
            <input
              id="qm-intake-waqif-name-ar"
              name="waqifNameAr"
              className={INPUT}
              maxLength={256}
            />
          </div>
          <div className={FIELD}>
            <Label htmlFor="qm-intake-waqif-name-en">{t('intake.waqifNameEn')}</Label>
            <input
              id="qm-intake-waqif-name-en"
              name="waqifNameEn"
              className={INPUT}
              maxLength={256}
            />
          </div>
        </fieldset>
      </section>

      <section className="grid gap-[var(--space-12)] md:grid-cols-2">
        <div className={FIELD}>
          <Label htmlFor="qm-intake-certificate">{t('intake.certificateNumber')}</Label>
          <input
            id="qm-intake-certificate"
            name="certificateNumber"
            required
            className={INPUT}
            maxLength={128}
            data-testid="qm-intake-certificate"
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="qm-intake-deed">{t('intake.deedNumber')}</Label>
          <input
            id="qm-intake-deed"
            name="deedNumber"
            required
            className={INPUT}
            maxLength={128}
            data-testid="qm-intake-deed"
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="qm-intake-type">{t('intake.type')}</Label>
          <select
            id="qm-intake-type"
            name="type"
            className={INPUT}
            defaultValue="FAMILY_DHURRI"
            data-testid="qm-intake-type"
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`intake.typeValue.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD}>
          <Label htmlFor="qm-intake-nature">{t('intake.nature')}</Label>
          <select id="qm-intake-nature" name="nature" className={INPUT} defaultValue="AYNI">
            {NATURES.map((value) => (
              <option key={value} value={value}>
                {t(`intake.natureValue.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD}>
          <Label htmlFor="qm-intake-order">{t('intake.entitlementOrder')}</Label>
          <select
            id="qm-intake-order"
            name="entitlementOrder"
            className={INPUT}
            defaultValue="LINEAGE_CONTINUATION"
          >
            {ORDERS.map((value) => (
              <option key={value} value={value}>
                {t(`intake.orderValue.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD}>
          <Label htmlFor="qm-intake-fye">{t('intake.fiscalYearEnd')}</Label>
          <input
            id="qm-intake-fye"
            name="fiscalYearEnd"
            required
            pattern="\d{2}-\d{2}"
            defaultValue="12-31"
            className={INPUT}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="qm-intake-registration">{t('intake.registrationDate')}</Label>
          <input
            id="qm-intake-registration"
            name="registrationDate"
            type="date"
            required
            className={INPUT}
            data-testid="qm-intake-registration"
          />
        </div>
      </section>

      <section className={FIELD}>
        <Label htmlFor="qm-intake-shart">{t('intake.shartNarrativeAr')}</Label>
        <textarea
          id="qm-intake-shart"
          name="shartNarrativeAr"
          required
          rows={5}
          dir="rtl"
          className={INPUT}
          maxLength={8000}
          data-testid="qm-intake-shart"
        />
        <Text variant="body-sm" tone="mist">
          {t('intake.shartNote')}
        </Text>
      </section>

      <section className="flex flex-col gap-[var(--space-12)]">
        <Heading level={3}>{t('intake.trusteeship')}</Heading>
        <div className="grid gap-[var(--space-12)] md:grid-cols-2">
          <div className={FIELD}>
            <Label htmlFor="qm-intake-primary-nazir">{t('intake.primaryNazir')}</Label>
            <input
              id="qm-intake-primary-nazir"
              name="primaryNazir"
              required
              className={INPUT}
              maxLength={256}
              data-testid="qm-intake-primary-nazir"
            />
          </div>
          <div className={FIELD}>
            <Label htmlFor="qm-intake-appointed">{t('intake.primaryAppointedDate')}</Label>
            <input
              id="qm-intake-appointed"
              name="primaryAppointedDate"
              type="date"
              required
              className={INPUT}
              data-testid="qm-intake-appointed"
            />
          </div>
        </div>
        <label className="flex items-center gap-[var(--space-8)]">
          <input type="checkbox" name="jointlyLiable" />
          <Text variant="body-sm">{t('intake.jointlyLiable')}</Text>
        </label>
        <fieldset className="flex flex-col gap-[var(--space-8)]">
          <legend>
            <Text variant="body-sm" className="font-medium">
              {t('intake.eligibility')}
            </Text>
          </legend>
          {(['islam', 'legalCapacity', 'noDisqualifyingRemoval', 'ksaResident'] as const).map(
            (flag) => (
              <label key={flag} className="flex items-center gap-[var(--space-8)]">
                <input
                  type="checkbox"
                  name={flag}
                  defaultChecked
                  data-testid={`qm-intake-flag-${flag}`}
                />
                <Text variant="body-sm">{t(`intake.${flag}`)}</Text>
              </label>
            ),
          )}
        </fieldset>
      </section>

      <section className={FIELD}>
        <Label htmlFor="qm-intake-nazir-email">{t('intake.nazirEmail')}</Label>
        <input
          id="qm-intake-nazir-email"
          name="nazirEmail"
          type="email"
          required
          className={INPUT}
          maxLength={256}
          data-testid="qm-intake-nazir-email"
        />
        <Text variant="body-sm" tone="mist">
          {t('intake.nazirNote')}
        </Text>
      </section>

      <div>
        <Button type="submit" variant="primary" data-testid="qm-intake-submit">
          {t('intake.submit')}
        </Button>
      </div>
    </form>
  );
}
