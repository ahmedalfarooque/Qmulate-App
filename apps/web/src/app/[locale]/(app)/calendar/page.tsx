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
  return { title: t('calendarTitle') };
}

/** Cross-endowment calendar: every deadline the caller may read, soonest first. */
export default async function CalendarPage({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return (
    <AdminPage locale={locale} section="calendar" title={t('calendarTitle')} intro={t('calendarIntro')}>
      {async () => {
        const rows = await loadAcrossSeats(locale, 'compliance:task:read', (c, waqfId) => c.deadline.list({ waqfId }));
        if (rows.status !== 'ok') return <Refusal locale={locale} messageKey={rows.messageKey} />;
        const flat = rows.value
          .flatMap((r) => r.value.deadlines.map((d) => ({ ...d, waqfId: r.waqfId })))
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        return (
          <table className="qm-table w-full text-body-sm" data-testid="qm-calendar-table">
            <thead><tr><th className="text-start">{t('dueDate')}</th><th className="text-start">{t('endowment')}</th><th className="text-start">{t('task')}</th><th className="text-start">{t('status')}</th></tr></thead>
            <tbody>
              {flat.length === 0 && <tr><td colSpan={4} className="text-mist">{t('noRows')}</td></tr>}
              {flat.map((d) => (
                <tr key={`${d.waqfId}:${d.id}`}>
                  <td className="qm-num" dir="ltr">{d.dueDate.toISOString().slice(0, 10)} · {d.dueDateHijri}</td>
                  <td><Link href={`/${locale}/endowments/${d.waqfId}`} className="text-blue-strong underline">{d.waqfId}</Link></td>
                  <td className="qm-mono" dir="ltr">{d.ruleKey}</td>
                  <td>{d.satisfiedAt ? `met ${d.satisfiedAt.toISOString().slice(0, 10)}` : d.waivedAt ? 'waived' : d.escalatedAt ? 'escalated' : 'open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </AdminPage>
  );
}
