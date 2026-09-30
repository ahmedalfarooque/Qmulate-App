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
  return { title: t('complianceTitle') };
}

/** Cross-endowment compliance register: one `compliance.tasks` per seated endowment. */
export default async function CompliancePage({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return (
    <AdminPage locale={locale} section="compliance" title={t('complianceTitle')} intro={t('complianceIntro')}>
      {async () => {
        const rows = await loadAcrossSeats(locale, 'compliance:task:read', (c, waqfId) => c.compliance.tasks({ waqfId }));
        if (rows.status !== 'ok') return <Refusal locale={locale} messageKey={rows.messageKey} />;
        const flat = rows.value.flatMap((r) => r.value.tasks.map((task) => ({ waqfId: r.waqfId, ...task })));
        return (
          <table className="qm-table w-full text-body-sm" data-testid="qm-compliance-table">
            <thead><tr><th className="text-start">{t('endowment')}</th><th className="text-start">{t('task')}</th><th className="text-start">{t('status')}</th><th className="text-start">{t('actor')}</th></tr></thead>
            <tbody>
              {flat.length === 0 && <tr><td colSpan={4} className="text-mist">{t('noRows')}</td></tr>}
              {flat.map((task) => (
                <tr key={`${task.waqfId}:${task.id}`}>
                  <td><Link href={`/${locale}/endowments/${task.waqfId}`} className="text-blue-strong underline">{task.waqfId}</Link></td>
                  <td className="qm-mono" dir="ltr">{task.templateCode} v{task.templateVersion}</td>
                  <td>{task.status}</td>
                  <td>{task.owner ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </AdminPage>
  );
}
