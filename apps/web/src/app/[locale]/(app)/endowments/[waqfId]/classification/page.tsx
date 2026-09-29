import { getTranslations } from 'next-intl/server';

import { ClassificationPanel } from '@/components/endowments/ClassificationPanel';
import { Refusal } from '@/components/endowments/Refusal';
import { loadApplicableObligations, loadClassification } from '@/lib/endowments/loaders';

import { endowmentScreenContext, EndowmentScreen } from '../screen';

import type { Metadata } from 'next';

/**
 * Classification, its append-only history, and the duties it gates (BR-104).
 *
 * The two reads are INDEPENDENT on purpose: a refusal on the duty catalogue must not blank the
 * classification and its history, which are the P0 half of the exit clause. The catalogue is a
 * global, unscoped model — the regulation's, not the endowment's — so it can be refused for reasons
 * that have nothing to do with this endowment.
 *
 * ⚠ Every figure this screen touches (the SAR 200M / 50M bands, any deadline rule behind a duty) is
 * UNVERIFIED against primary Saudi law and is rendered with the marker that says so.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('classification.title') };
}

export default async function ClassificationPage({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}) {
  const { locale, waqfId } = await params;
  const context = await endowmentScreenContext(locale, waqfId);

  const [record, obligations] =
    context.endowment.status === 'ok'
      ? await Promise.all([
          loadClassification(locale, waqfId),
          loadApplicableObligations(locale, waqfId),
        ])
      : [null, null];

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="classification" context={context}>
      {record === null || obligations === null ? null : record.status === 'ok' ? (
        <ClassificationPanel locale={locale} record={record.value} obligations={obligations} />
      ) : (
        <Refusal locale={locale} messageKey={record.messageKey} />
      )}
    </EndowmentScreen>
  );
}
