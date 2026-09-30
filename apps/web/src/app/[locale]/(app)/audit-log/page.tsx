import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { AdminPage } from '@/lib/admin/AdminPage';
import { Refusal } from '@/components/endowments/Refusal';
import { loadAudit } from '@/lib/admin/loaders';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('auditTitle') };
}

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s !== '' ? s : undefined;
}

export default async function AuditLogPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'admin' });
  const filters: { actorId?: string; entityType?: string; action?: string; before?: string } = {};
  for (const key of ['actorId', 'entityType', 'action', 'before'] as const) {
    const value = one(query[key]);
    if (value !== undefined) filters[key] = value;
  }

  return (
    <AdminPage locale={locale} section="auditLog" title={t('auditTitle')} intro={t('auditIntro')}>
      {async () => {
        const audit = await loadAudit(locale, filters);
        if (audit.status !== 'ok') return <Refusal locale={locale} messageKey={audit.messageKey} />;
        const next = new URLSearchParams({ ...filters, ...(audit.value.nextBefore ? { before: audit.value.nextBefore } : {}) });
        return (
          <div className="flex flex-col gap-[var(--space-16)]">
            <form method="get" className="flex flex-wrap gap-[var(--space-8)]">
              <input name="actorId" defaultValue={filters.actorId ?? ''} placeholder={t('actor')} className="qm-field qm-mono" dir="ltr" />
              <input name="entityType" defaultValue={filters.entityType ?? ''} placeholder={t('entity')} className="qm-field qm-mono" dir="ltr" />
              <input name="action" defaultValue={filters.action ?? ''} placeholder={t('action')} className="qm-field qm-mono" dir="ltr" />
              <button type="submit" className="qm-btn">{t('search')}</button>
            </form>
            <table className="qm-table w-full text-body-sm" data-testid="qm-audit-table">
              <thead><tr><th className="text-start">#</th><th className="text-start">{t('when')}</th><th className="text-start">{t('actor')}</th><th className="text-start">{t('action')}</th><th className="text-start">{t('entity')}</th><th className="text-start">{t('endowment')}</th><th className="text-start">{t('category')}</th></tr></thead>
              <tbody>
                {audit.value.events.length === 0 && <tr><td colSpan={7} className="text-mist">{t('noEvents')}</td></tr>}
                {audit.value.events.map((e) => (
                  <tr key={e.id} data-testid="qm-audit-row">
                    <td className="qm-num">{e.id}</td>
                    <td className="qm-mono" dir="ltr">{e.occurredAt.toISOString().replace('T', ' ').slice(0, 19)}</td>
                    <td className="qm-mono" dir="ltr">{e.actorId ?? e.actorType}</td>
                    <td className="qm-mono" dir="ltr">{e.action}</td>
                    <td className="qm-mono" dir="ltr">{e.entityType} {e.entityId}</td>
                    <td className="qm-mono" dir="ltr">{e.waqfId ?? '—'}</td>
                    <td>{e.category} / {e.classification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.value.nextBefore && (
              <Link href={`/${locale}/audit-log?${next.toString()}`} className="qm-btn self-start">{t('more')}</Link>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
