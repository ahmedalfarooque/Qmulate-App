import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { AdminPage, outcomeOf } from '@/lib/admin/AdminPage';
import { Refusal } from '@/components/endowments/Refusal';
import { loadUsers } from '@/lib/admin/loaders';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REJECTED'] as const;
type Status = (typeof STATUSES)[number];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('usersTitle') };
}

export default async function UsersPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'admin' });
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const status = (STATUSES as readonly string[]).includes(rawStatus ?? '') ? (rawStatus as Status) : undefined;
  const search = typeof query.q === 'string' && query.q !== '' ? query.q : undefined;

  const labels: Record<Status, string> = {
    PENDING_APPROVAL: t('pending'),
    ACTIVE: t('active'),
    DISABLED: t('disabled'),
    REJECTED: t('rejected'),
  };

  return (
    <AdminPage locale={locale} section="users" title={t('usersTitle')} intro={t('usersIntro')} outcome={await outcomeOf(searchParams)}>
      {async () => {
        const users = await loadUsers(locale, { ...(search ? { search } : {}), ...(status ? { status } : {}) });
        if (users.status !== 'ok') return <Refusal locale={locale} messageKey={users.messageKey} />;
        const { counts } = users.value;
        return (
          <div className="flex flex-col gap-[var(--space-16)]">
            <nav aria-label={t('status')} className="flex flex-wrap gap-[var(--space-8)]">
              <Link href={`/${locale}/users`} className="qm-btn" aria-current={status === undefined ? 'page' : undefined}>
                {t('all')}
              </Link>
              {STATUSES.map((s) => (
                <Link key={s} href={`/${locale}/users?status=${s}`} className="qm-btn" aria-current={status === s ? 'page' : undefined}>
                  {labels[s]} ({counts[s] ?? 0})
                </Link>
              ))}
            </nav>
            <form method="get" className="flex gap-[var(--space-8)]">
              {status && <input type="hidden" name="status" value={status} />}
              <input name="q" defaultValue={search ?? ''} placeholder={t('search')} className="qm-field flex-1" dir="auto" />
              <button type="submit" className="qm-btn">{t('search')}</button>
            </form>
            <table className="qm-table w-full text-body-sm" data-testid="qm-users-table">
              <thead>
                <tr>
                  <th className="text-start">{t('name')}</th>
                  <th className="text-start">{t('email')}</th>
                  <th className="text-start">{t('status')}</th>
                  <th className="text-start">{t('level')}</th>
                  <th className="text-start">{t('seats')}</th>
                  <th className="text-start">{t('twoFactor')}</th>
                  <th className="text-start">{t('created')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.value.users.length === 0 && (
                  <tr><td colSpan={8} className="text-mist">{t('noRows')}</td></tr>
                )}
                {users.value.users.map((u) => (
                  <tr key={u.id} data-testid="qm-user-row" data-status={u.status}>
                    <td>{u.name}{u.isPrimaryAdmin ? ` — ${t('primaryAdmin')}` : ''}</td>
                    <td dir="ltr" className="qm-mono">{u.email}</td>
                    <td>{labels[u.status as Status] ?? u.status}</td>
                    <td>{u.accessLevel ? (locale === 'ar' ? u.accessLevel.nameAr : u.accessLevel.nameEn) : t('noLevel')}</td>
                    <td className="qm-num">{u.grantCount}</td>
                    <td>{u.twoFactorEnabled ? '✓' : '—'}</td>
                    <td className="qm-num">{u.createdAt.toISOString().slice(0, 10)}</td>
                    <td><Link href={`/${locale}/users/${u.id}`} className="text-blue-strong underline">{t('open')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    </AdminPage>
  );
}
