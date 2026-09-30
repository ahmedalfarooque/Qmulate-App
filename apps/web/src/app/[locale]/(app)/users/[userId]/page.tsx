import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import {
  requestPasswordResetAction,
  seatUserAction,
  setUserLevelAction,
  setUserOverridesAction,
  setUserStatusAction,
  unseatUserAction,
} from '@/components/admin/actions';
import { AdminPage, outcomeOf } from '@/lib/admin/AdminPage';
import { Refusal } from '@/components/endowments/Refusal';
import { loadCatalog, loadEndowments, loadLevels, loadUser } from '@/lib/admin/loaders';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; userId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('usersTitle') };
}

export default async function UserDetailPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, userId } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });

  return (
    <AdminPage locale={locale} section="users" title={t('usersTitle')} intro={t('usersIntro')} outcome={await outcomeOf(searchParams)}>
      {async (identity) => {
        const [user, levels, endowments] = await Promise.all([loadUser(locale, userId), loadLevels(locale), loadEndowments(locale)]);
        if (user.status !== 'ok') return <Refusal locale={locale} messageKey={user.messageKey} />;
        const u = user.value;
        const canWrite = identity.org.permissions.includes('admin:user:write');
        const canSeat = identity.org.permissions.includes('admin:access_matrix:write');
        const catalog = canWrite || canSeat ? await loadCatalog(locale) : null;
        const orgPermissions = catalog?.status === 'ok' ? catalog.value.orgPermissions : [];
        const overrideOf = new Map(u.permissionOverrides.map((o) => [o.permission, o.effect]));
        const name = (l: { nameAr: string; nameEn: string | null }) => (locale === 'ar' ? l.nameAr : (l.nameEn ?? l.nameAr));
        const hidden = (
          <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="userId" value={u.id} />
          </>
        );

        return (
          <div className="flex flex-col gap-[var(--space-24)]" data-testid="qm-user-detail" data-status={u.status}>
            <Link href={`/${locale}/users`} className="text-body-sm text-blue-strong underline">← {t('usersTitle')}</Link>

            <section className="qm-card flex flex-col gap-[var(--space-8)]">
              <h2 className="text-h3">{u.name}{u.isPrimaryAdmin ? ` — ${t('primaryAdmin')}` : ''}</h2>
              <dl className="grid grid-cols-2 gap-[var(--space-8)] text-body-sm">
                <dt className="text-mist">{t('email')}</dt><dd dir="ltr" className="qm-mono">{u.email}</dd>
                <dt className="text-mist">{t('status')}</dt><dd data-testid="qm-user-status">{u.status}</dd>
                <dt className="text-mist">{t('level')}</dt><dd>{u.accessLevel ? name(u.accessLevel) : t('noLevel')}</dd>
                <dt className="text-mist">{t('verified')}</dt><dd>{u.emailVerified ? '✓' : '—'}</dd>
                <dt className="text-mist">{t('twoFactor')}</dt><dd>{u.twoFactorEnabled ? '✓' : '—'}</dd>
                <dt className="text-mist">{t('created')}</dt><dd className="qm-num">{u.createdAt.toISOString().slice(0, 10)}</dd>
              </dl>

              {canWrite && (
                <div className="flex flex-wrap gap-[var(--space-8)]">
                  {u.status !== 'ACTIVE' && (
                    <form action={setUserStatusAction}>{hidden}<input type="hidden" name="status" value="ACTIVE" />
                      <button type="submit" className="qm-btn qm-btn--primary" data-testid="qm-approve">{u.status === 'PENDING_APPROVAL' ? t('approve') : t('reactivate')}</button>
                    </form>
                  )}
                  {u.status === 'PENDING_APPROVAL' && (
                    <form action={setUserStatusAction}>{hidden}<input type="hidden" name="status" value="REJECTED" />
                      <button type="submit" className="qm-btn" data-testid="qm-reject">{t('reject')}</button>
                    </form>
                  )}
                  {u.status === 'ACTIVE' && !u.isPrimaryAdmin && (
                    <form action={setUserStatusAction}>{hidden}<input type="hidden" name="status" value="DISABLED" />
                      <button type="submit" className="qm-btn" data-testid="qm-disable">{t('disable')}</button>
                    </form>
                  )}
                  <form action={requestPasswordResetAction}>{hidden}
                    <button type="submit" className="qm-btn">{t('sendReset')}</button>
                  </form>
                </div>
              )}
            </section>

            {canWrite && levels.status === 'ok' && (
              <section className="qm-card flex flex-col gap-[var(--space-8)]">
                <h3 className="qm-label">{t('level')}</h3>
                <form action={setUserLevelAction} className="flex gap-[var(--space-8)]">{hidden}
                  <select name="accessLevelId" defaultValue={u.accessLevel?.id ?? ''} className="qm-field" data-testid="qm-level-select" disabled={u.isPrimaryAdmin}>
                    <option value="">{t('noLevel')}</option>
                    {levels.value.map((l) => <option key={l.id} value={l.id}>{name(l)} ({l.key})</option>)}
                  </select>
                  <button type="submit" className="qm-btn qm-btn--primary" disabled={u.isPrimaryAdmin}>{t('saveLevel')}</button>
                </form>
              </section>
            )}

            {canWrite && !u.isPrimaryAdmin && (
              <section className="qm-card flex flex-col gap-[var(--space-8)]">
                <h3 className="qm-label">{t('overridesTitle')}</h3>
                <p className="text-body-sm text-mist">{t('overridesIntro')}</p>
                <form action={setUserOverridesAction} className="flex flex-col gap-[var(--space-8)]">{hidden}
                  <table className="qm-table text-body-sm">
                    <tbody>
                      {orgPermissions.map((p) => (
                        <tr key={p}>
                          <td dir="ltr" className="qm-mono">{p}</td>
                          {(['', 'ALLOW', 'DENY'] as const).map((effect) => (
                            <td key={effect || 'inherit'}>
                              <label className="flex items-center gap-[var(--space-4)]">
                                <input type="radio" name={`ovr:${p}`} value={effect} defaultChecked={(overrideOf.get(p) ?? '') === effect} />
                                {effect === '' ? t('inherit') : effect === 'ALLOW' ? t('allow') : t('deny')}
                              </label>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="submit" className="qm-btn">{t('saveOverrides')}</button>
                </form>
              </section>
            )}

            <section className="qm-card flex flex-col gap-[var(--space-8)]">
              <h3 className="qm-label">{t('seatsTitle')}</h3>
              <p className="text-body-sm text-mist">{t('seatsIntro')}</p>
              {u.grants.length === 0 && <p className="text-body-sm text-mist">{t('noSeats')}</p>}
              {u.grants.length > 0 && (
                <table className="qm-table text-body-sm" data-testid="qm-seats">
                  <thead><tr><th className="text-start">{t('endowment')}</th><th className="text-start">{t('role')}</th><th className="text-start">{t('status')}</th><th /></tr></thead>
                  <tbody>
                    {u.grants.map((g) => (
                      <tr key={g.id}>
                        <td>{g.waqfId} · {g.waqf.certificateNumber}</td>
                        <td>{g.role}</td>
                        <td>{g.revokedAt ? t('revoked') : t('active')}</td>
                        <td>
                          {canSeat && !g.revokedAt && (
                            <form action={unseatUserAction}>{hidden}<input type="hidden" name="grantId" value={g.id} />
                              <button type="submit" className="qm-btn">{t('unseat')}</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {canSeat && catalog?.status === 'ok' && endowments.status === 'ok' && u.status === 'ACTIVE' && u.id !== identity.userId && (
                <form action={seatUserAction} className="flex flex-wrap gap-[var(--space-8)]" data-testid="qm-seat-form">{hidden}
                  <select name="waqfId" className="qm-field" required>
                    {endowments.value.map((w) => <option key={w.id} value={w.id}>{w.id} · {w.certificateNumber} · {name(w.waqif)}</option>)}
                  </select>
                  <select name="role" className="qm-field" defaultValue={levels.status === 'ok' ? (levels.value.find((l) => l.id === u.accessLevel?.id)?.seatRole ?? catalog.value.roles[0]) : catalog.value.roles[0]}>
                    {catalog.value.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="submit" className="qm-btn qm-btn--primary">{t('seat')}</button>
                </form>
              )}
            </section>

            <section className="qm-card flex flex-col gap-[var(--space-8)]">
              <h3 className="qm-label">{t('recentActivity')}</h3>
              {u.recentEvents.length === 0 && <p className="text-body-sm text-mist">{t('noActivity')}</p>}
              <ul className="text-body-sm">
                {u.recentEvents.map((e) => (
                  <li key={e.id} className="qm-mono" dir="ltr">{e.occurredAt.toISOString()} · {e.action} · {e.entityType} {e.entityId}</li>
                ))}
              </ul>
            </section>
          </div>
        );
      }}
    </AdminPage>
  );
}
