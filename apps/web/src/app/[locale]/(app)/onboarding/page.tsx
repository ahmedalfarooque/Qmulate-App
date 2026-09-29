import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Eyebrow, Heading, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { Refusal } from '@/components/endowments/Refusal';
import { IntakeForm } from '@/components/onboarding/IntakeForm';
import { REFUSAL_PARAM } from '@/lib/distributions/paths';
import { NOTICE_PARAM } from '@/lib/endowments/anchor-notices';
import { loadIntakeAuthority } from '@/lib/endowments/loaders';
import { kernelMessageKey } from '@/lib/trpc/client';

import type { Metadata } from 'next';

/**
 * ⊕ S12-3b · `/onboarding` — REGISTER an endowment (owner ruling "build ui intake").
 *
 * The gate is repeated here, as on every `(app)/` page (a layout alone is not a gate). The screen is
 * drawn to every seat; the FORM is drawn only to a seat that may register for at least one client,
 * and the sentence says so otherwise — the refusal is the api's, not a hidden menu item.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('intake.title') };
}

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const authority = await loadIntakeAuthority(locale);

  const refusalParam = query[REFUSAL_PARAM];
  const actionRefusal =
    typeof refusalParam === 'string' && refusalParam !== ''
      ? kernelMessageKey({ messageKey: refusalParam }, locale)
      : null;
  const fixtureOnly = process.env.DATA_CLASSIFICATION !== 'production';
  // The newborn's id travels back on the redirect. The registrar holds NO seat on it (self-issue is
  // refused), so this screen — not the newborn's own — is where the birth is confirmed to them.
  const noticeParam = query[NOTICE_PARAM];
  const bornParam = query['waqfId'];
  const born =
    noticeParam === 'intaken' &&
    typeof bornParam === 'string' &&
    /^[A-Za-z0-9_-]{1,64}$/.test(bornParam)
      ? bornParam
      : null;

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]" data-testid="qm-intake">
        <header className="flex flex-col gap-[var(--space-4)] text-start">
          <Eyebrow tick>{tCommon('portfolioScope')}</Eyebrow>
          <Heading level={1}>{t('intake.title')}</Heading>
          <Text tone="mist">{t('intake.intro')}</Text>
        </header>

        {actionRefusal !== null ? <Refusal locale={locale} messageKey={actionRefusal} /> : null}
        {born !== null ? (
          <div role="status" data-testid="qm-intake-notice" data-waqf-id={born}>
            <Text tone="mist">{t('intake.registered')}</Text>
            <Text variant="body-sm" tone="mist">
              {t('intake.registeredId', { id: born })}
            </Text>
          </div>
        ) : null}

        {authority.status !== 'ok' ? (
          <Refusal locale={locale} messageKey={authority.messageKey} />
        ) : authority.value.clients.length === 0 ? (
          <div role="status" data-testid="qm-intake-no-authority">
            <Text tone="mist">{t('intake.noAuthority')}</Text>
          </div>
        ) : (
          <IntakeForm locale={locale} authority={authority.value} fixtureOnly={fixtureOnly} />
        )}
      </div>
    </AppShell>
  );
}
