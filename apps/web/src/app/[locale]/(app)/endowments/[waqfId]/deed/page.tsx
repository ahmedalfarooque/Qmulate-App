import { getTranslations } from 'next-intl/server';

import { DeedPanel } from '@/components/endowments/DeedPanel';
import { Refusal } from '@/components/endowments/Refusal';
import { loadDeed } from '@/lib/endowments/loaders';

import { endowmentScreenContext, EndowmentScreen } from '../screen';

import type { Metadata } from 'next';

/**
 * The trusteeship deed (BR-105) and the eligibility verdict (BR-109).
 *
 * This is the screen §17's E3 exit clause is about: "an ineligible Nazir (non-resident) is blocked
 * with a clear reason". The verdict comes from the SAME pure resolver the write path refuses on, via
 * `deed.verifyEligibility` — a dry run that writes nothing — so the screen cannot show a verdict the
 * mutation would disagree with, and the reason renders as a sentence in the page's own language
 * rather than as `KSA_RESIDENCY_REQUIRED`.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('deed.title') };
}

export default async function DeedPage({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}) {
  const { locale, waqfId } = await params;
  const context = await endowmentScreenContext(locale, waqfId);
  const deed = context.endowment.status === 'ok' ? await loadDeed(locale, waqfId) : null;

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="deed" context={context}>
      {deed === null ? null : deed.status === 'ok' ? (
        <DeedPanel locale={locale} deed={deed.value} />
      ) : (
        <Refusal locale={locale} messageKey={deed.messageKey} />
      )}
    </EndowmentScreen>
  );
}
