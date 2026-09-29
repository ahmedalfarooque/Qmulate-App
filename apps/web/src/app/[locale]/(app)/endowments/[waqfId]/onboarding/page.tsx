import { getTranslations } from 'next-intl/server';

import { Heading, Text } from '@qmulate/ui';

import { OnboardingPanel } from '@/components/endowments/OnboardingPanel';
import { Refusal } from '@/components/endowments/Refusal';
import { REFUSAL_PARAM } from '@/lib/distributions/paths';
import { isAnchorNotice } from '@/lib/endowments/anchor-notices';
import { loadOnboarding } from '@/lib/endowments/loaders';
import { kernelMessageKey } from '@/lib/trpc/client';

import { endowmentScreenContext, EndowmentScreen } from '../screen';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('onboarding.title') };
}

/** ⊕ S12-3 · the endowment's three handover gates (BR-1101). */
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, waqfId } = await params;
  const query = await searchParams;
  const context = await endowmentScreenContext(locale, waqfId);
  const t = await getTranslations({ locale, namespace: 'endowments' });

  const refusalParam = query[REFUSAL_PARAM];
  const actionRefusal =
    typeof refusalParam === 'string' && refusalParam !== ''
      ? kernelMessageKey({ messageKey: refusalParam }, locale)
      : null;
  const noticeParam = query['notice'];
  const notice =
    isAnchorNotice(noticeParam) &&
    (noticeParam === 'gateCleared' || noticeParam === 'gateReopened' || noticeParam === 'intaken')
      ? noticeParam
      : null;

  const onboarding =
    context.endowment.status === 'ok' ? await loadOnboarding(locale, waqfId) : null;

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="onboarding" context={context}>
      {onboarding === null ? null : (
        <div className="flex flex-col gap-[var(--space-16)]">
          <header className="flex flex-col gap-[var(--space-4)] text-start">
            <Heading level={2}>{t('onboarding.title')}</Heading>
            <Text tone="mist">{t('onboarding.intro')}</Text>
          </header>

          {actionRefusal !== null ? <Refusal locale={locale} messageKey={actionRefusal} /> : null}
          {notice !== null ? (
            <div role="status" data-testid="qm-onboarding-notice" data-notice={notice}>
              <Text tone="mist">
                {t(
                  notice === 'gateCleared'
                    ? 'onboarding.cleared'
                    : notice === 'intaken'
                      ? 'onboarding.intaken'
                      : 'onboarding.reopened',
                )}
              </Text>
            </div>
          ) : null}

          {onboarding.status === 'ok' ? (
            <OnboardingPanel locale={locale} onboarding={onboarding.value} />
          ) : (
            <Refusal locale={locale} messageKey={onboarding.messageKey} />
          )}
        </div>
      )}
    </EndowmentScreen>
  );
}
