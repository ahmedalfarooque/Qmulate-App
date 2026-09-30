import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { AdminPage } from '@/lib/admin/AdminPage';
import { Refusal } from '@/components/endowments/Refusal';
import { loadAcrossSeats } from '@/lib/admin/loaders';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('beneficiariesTitle') };
}

/** Cross-endowment register: one `beneficiary.list` per seated endowment carrying the read verb. */
export default async function BeneficiariesPage({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return (
    <AdminPage locale={locale} section="beneficiaries" title={t('beneficiariesTitle')} intro={t('beneficiariesIntro')}>
      {async () => {
        const rows = await loadAcrossSeats(locale, 'beneficiary:beneficiary:read', (c, waqfId) => c.beneficiary.list({ waqfId }));
        if (rows.status !== 'ok') return <Refusal locale={locale} messageKey={rows.messageKey} />;
        const flat = rows.value.flatMap((r) => r.value.map((b) => ({ waqfId: r.waqfId, ...b })));
        return (
          <table className="qm-table w-full text-body-sm" data-testid="qm-beneficiaries-table">
            <thead><tr><th className="text-start">{t('endowment')}</th><th className="text-start">{t('beneficiary')}</th><th className="text-start">{t('line')}</th><th className="text-start">{t('kind')}</th><th className="text-start">{t('status')}</th><th className="text-start">UBO</th></tr></thead>
            <tbody>
              {flat.length === 0 && <tr><td colSpan={6} className="text-mist">{t('noRows')}</td></tr>}
              {flat.map((b) => (
                <tr key={`${b.waqfId}:${b.id}`}>
                  <td><Link href={`/${locale}/endowments/${b.waqfId}/beneficiaries`} className="text-blue-strong underline">{b.waqfId}</Link></td>
                  <td>{b.id} · {locale === 'ar' ? b.relationshipAr : b.relationshipEn}</td>
                  <td>{b.branch}</td>
                  <td>{b.kind}</td>
                  <td>{b.verificationStatus}{b.active ? '' : ' · inactive'}</td>
                  <td>{b.isUbo ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </AdminPage>
  );
}
