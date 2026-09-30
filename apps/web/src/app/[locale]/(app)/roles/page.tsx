import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { saveLevelAction } from '@/components/admin/actions';
import { AdminPage, outcomeOf } from '@/lib/admin/AdminPage';
import { Refusal } from '@/components/endowments/Refusal';
import { loadLevels } from '@/lib/admin/loaders';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('rolesTitle') };
}

export default async function RolesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });

  return (
    <AdminPage locale={locale} section="roles" title={t('rolesTitle')} intro={t('rolesIntro')} outcome={await outcomeOf(searchParams)}>
      {async (identity) => {
        const levels = await loadLevels(locale);
        if (levels.status !== 'ok') return <Refusal locale={locale} messageKey={levels.messageKey} />;
        const canWrite = identity.org.permissions.includes('admin:access_level:write');
        return (
          <div className="flex flex-col gap-[var(--space-16)]">
            <table className="qm-table w-full text-body-sm" data-testid="qm-levels-table">
              <thead><tr><th className="text-start">{t('key')}</th><th className="text-start">{t('name')}</th><th className="text-start">{t('orgPermissions')}</th><th className="text-start">{t('seatRole')}</th><th className="text-start">{t('users')}</th><th /></tr></thead>
              <tbody>
                {levels.value.map((l) => (
                  <tr key={l.id} data-testid="qm-level-row" data-key={l.key}>
                    <td className="qm-mono" dir="ltr">{l.key}{l.isSystem ? ` (${t('system')})` : ''}</td>
                    <td>{locale === 'ar' ? l.nameAr : l.nameEn}</td>
                    <td className="qm-num">{l.permissions.length}</td>
                    <td>{l.seatRole ?? t('noSeatRole')}</td>
                    <td className="qm-num">{l.userCount}</td>
                    <td><Link href={`/${locale}/roles/${l.id}`} className="text-blue-strong underline">{t('open')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canWrite && (
              <form action={saveLevelAction} className="qm-card flex flex-wrap gap-[var(--space-8)]" data-testid="qm-new-level">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="seatRole" value="" />
                <h3 className="qm-label w-full">{t('newLevel')}</h3>
                <input name="key" placeholder={t('key')} pattern="[A-Z][A-Z0-9_]{1,39}" required className="qm-field qm-mono" dir="ltr" />
                <input name="nameEn" placeholder={t('nameEn')} required className="qm-field" dir="ltr" />
                <input name="nameAr" placeholder={t('nameAr')} required className="qm-field" dir="rtl" />
                <button type="submit" className="qm-btn qm-btn--primary">{t('create')}</button>
              </form>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
