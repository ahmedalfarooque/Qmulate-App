import { getTranslations } from 'next-intl/server';

import { BeneficiaryPanel } from '@/components/endowments/BeneficiaryPanel';
import { LineagePanel } from '@/components/endowments/LineagePanel';
import { Refusal } from '@/components/endowments/Refusal';
import { loadBeneficiaries, loadBeneficiaryLineage } from '@/lib/endowments/loaders';

import { endowmentScreenContext, EndowmentScreen } from '../screen';

import type { Metadata } from 'next';

/**
 * The beneficiary registry and the lineage graph (E4: BR-201…BR-206, BR-210) — READ-ONLY in
 * this pass; the write surface (enrolment, death certification, KYC refresh, category capture)
 * is a later pass and no control here pretends otherwise.
 *
 * The two loads are SEPARATE `Loaded<T>`s on purpose: a refusal on the lineage walk must not
 * blank the registry, and vice versa — each half says its own honest sentence. Both go through
 * the caller's own scoped client, so a beneficiary-principal session sees its own row and
 * nothing else (BR-210, §10 §5), enforced by the kernel's force filter rather than by anything
 * this page could get wrong.
 *
 * ⚠ Nothing on this screen renders a lineage link, computes an entitlement, or caches an
 * exclusion — see the panels' own headers and ADR-0009.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('beneficiaries.title') };
}

export default async function BeneficiariesPage({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}) {
  const { locale, waqfId } = await params;
  const context = await endowmentScreenContext(locale, waqfId);
  const ok = context.endowment.status === 'ok';
  const beneficiaries = ok ? await loadBeneficiaries(locale, waqfId) : null;
  const lineage = ok ? await loadBeneficiaryLineage(locale, waqfId) : null;

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="beneficiaries" context={context}>
      {beneficiaries === null ? null : beneficiaries.status === 'ok' ? (
        <BeneficiaryPanel locale={locale} rows={beneficiaries.value} />
      ) : (
        <Refusal locale={locale} messageKey={beneficiaries.messageKey} />
      )}
      {lineage === null ? null : lineage.status === 'ok' ? (
        <LineagePanel
          locale={locale}
          lineage={lineage.value}
          registry={
            beneficiaries !== null && beneficiaries.status === 'ok' ? beneficiaries.value : []
          }
        />
      ) : (
        <Refusal locale={locale} messageKey={lineage.messageKey} />
      )}
    </EndowmentScreen>
  );
}
