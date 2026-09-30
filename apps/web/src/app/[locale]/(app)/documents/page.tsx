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
  return { title: t('documentsTitle') };
}

/** Cross-endowment document vault listing: one `document.list` per seated endowment. */
export default async function DocumentsPage({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return (
    <AdminPage locale={locale} section="documents" title={t('documentsTitle')} intro={t('documentsIntro')}>
      {async () => {
        const rows = await loadAcrossSeats(locale, 'document:document:read', (c, waqfId) => c.document.list({ waqfId }));
        if (rows.status !== 'ok') return <Refusal locale={locale} messageKey={rows.messageKey} />;
        const flat = rows.value.flatMap((r) => r.value.documents.map((d) => ({ waqfId: r.waqfId, ...d })));
        return (
          <table className="qm-table w-full text-body-sm" data-testid="qm-documents-table">
            <thead><tr><th className="text-start">{t('endowment')}</th><th className="text-start">{t('document')}</th><th className="text-start">{t('kind')}</th><th className="text-start">{t('uploaded')}</th></tr></thead>
            <tbody>
              {flat.length === 0 && <tr><td colSpan={4} className="text-mist">{t('noRows')}</td></tr>}
              {flat.map((d) => (
                <tr key={`${d.waqfId}:${d.id}`}>
                  <td><Link href={`/${locale}/endowments/${d.waqfId}`} className="text-blue-strong underline">{d.waqfId}</Link></td>
                  <td>{locale === 'ar' ? d.titleAr : d.titleEn} · v{d.version}{d.legalHold ? ' · hold' : ''}</td>
                  <td>{d.type}</td>
                  <td className="qm-num" dir="ltr">{d.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </AdminPage>
  );
}
