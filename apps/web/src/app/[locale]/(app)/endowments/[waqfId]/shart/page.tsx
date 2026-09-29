import { getTranslations } from 'next-intl/server';

import { Refusal } from '@/components/endowments/Refusal';
import { ShartPanel } from '@/components/endowments/ShartPanel';
import { loadShart, loadShartCompleteness } from '@/lib/endowments/loaders';

import { endowmentScreenContext, EndowmentScreen } from '../screen';

import type { Metadata } from 'next';

/**
 * شرط الواقف — the founder's conditions (BR-103).
 *
 * ⚠ READ-ONLY, AND THERE IS NO WRITE PATH ANYWHERE BEHIND THIS SCREEN. There is no `shart.update`
 * procedure, no writer in `loaders.ts`, and no control on the panel — not even a disabled one. The
 * conditions are written once; no approval opens them, because no such approval exists; and a lawful
 * correction is a SUPERSEDING INSTRUMENT recorded as a NEW record, never an edit (binding rule 1,
 * ADR-0006). The database enforces it with an unconditional trigger and the panel states it in words.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('shart.title') };
}

export default async function ShartPage({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}) {
  const { locale, waqfId } = await params;
  const context = await endowmentScreenContext(locale, waqfId);

  // Independent reads: a refusal on completeness must not blank the recorded conditions, which are
  // the record itself. The conditions are what the founder instructed; completeness is a derived
  // opinion about whether a computation could run today.
  const [shart, completeness] =
    context.endowment.status === 'ok'
      ? await Promise.all([loadShart(locale, waqfId), loadShartCompleteness(locale, waqfId)])
      : [null, null];

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="shart" context={context}>
      {shart === null || completeness === null ? null : shart.status === 'ok' ? (
        <ShartPanel locale={locale} shart={shart.value} completeness={completeness} />
      ) : (
        <Refusal locale={locale} messageKey={shart.messageKey} />
      )}
    </EndowmentScreen>
  );
}
