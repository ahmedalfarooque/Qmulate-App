import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { saveLevelAction } from '@/components/admin/actions';
import { AdminPage, outcomeOf } from '@/lib/admin/AdminPage';
import { PermissionMatrix } from '@/components/admin/PermissionMatrix';
import { Refusal } from '@/components/endowments/Refusal';
import { loadCatalog, loadLevels } from '@/lib/admin/loaders';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; levelId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('rolesTitle') };
}

export default async function LevelPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, levelId } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });

  return (
    <AdminPage locale={locale} section="roles" title={t('rolesTitle')} intro={t('rolesIntro')} outcome={await outcomeOf(searchParams)}>
      {async (identity) => {
        const [levels, catalog] = await Promise.all([loadLevels(locale), loadCatalog(locale)]);
        if (levels.status !== 'ok') return <Refusal locale={locale} messageKey={levels.messageKey} />;
        if (catalog.status !== 'ok') return <Refusal locale={locale} messageKey={catalog.messageKey} />;
        const level = levels.value.find((l) => l.id === levelId);
        if (level === undefined) return <Refusal locale={locale} messageKey="errors.access.NO_GRANT" />;
        const canWrite = identity.org.permissions.includes('admin:access_level:write');

        return (
          <form action={saveLevelAction} className="flex flex-col gap-[var(--space-24)]" data-testid="qm-level-editor" data-key={level.key}>
            <Link href={`/${locale}/roles`} className="text-body-sm text-blue-strong underline">← {t('rolesTitle')}</Link>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={level.id} />
            <input type="hidden" name="key" value={level.key} />
            <section className="qm-card grid gap-[var(--space-8)] md:grid-cols-3">
              <label className="flex flex-col gap-[var(--space-4)]"><span className="qm-label">{t('key')}</span><input value={level.key} readOnly className="qm-field qm-mono" dir="ltr" /></label>
              <label className="flex flex-col gap-[var(--space-4)]"><span className="qm-label">{t('nameEn')}</span><input name="nameEn" defaultValue={level.nameEn} required className="qm-field" dir="ltr" readOnly={!canWrite} /></label>
              <label className="flex flex-col gap-[var(--space-4)]"><span className="qm-label">{t('nameAr')}</span><input name="nameAr" defaultValue={level.nameAr} required className="qm-field" dir="rtl" readOnly={!canWrite} /></label>
            </section>

            <PermissionMatrix
              locale={locale}
              catalog={catalog.value}
              orgPermissions={level.permissions}
              seatRole={level.seatRole}
              seatPermissions={level.seatPermissions}
              readOnly={!canWrite}
            />

            {canWrite && (
              <div><button type="submit" className="qm-btn qm-btn--primary" data-testid="qm-level-save">{t('save')}</button></div>
            )}
          </form>
        );
      }}
    </AdminPage>
  );
}
