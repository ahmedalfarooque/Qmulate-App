'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

/**
 * The full permission matrix of the product, generated from the registry the API serves — never
 * typed in. Two halves:
 *
 *   ORGANISATION-WIDE — the closed `ORG_SCOPE_PERMISSIONS` list: what a holder of this level may
 *   do with no endowment in the sentence (users, levels, seating, settings, the audit trail).
 *
 *   SEAT TEMPLATE — every `module:resource:verb` in the registry, laid out module × verb: the
 *   permissions issued by default when a holder of this level is SEATED on an endowment. The seat
 *   role's ceiling still applies at issuance; approve/sign are shown disabled because they belong
 *   to the Nazir seat alone (ADR-0004, BR-105).
 *
 * The inputs are plain form fields (`org:<perm>`, `seat:<perm>`) read by the server action; the
 * "select all" controls are a convenience over them.
 */
export interface Catalog {
  readonly orgPermissions: readonly string[];
  readonly modules: readonly { readonly module: string; readonly resources: readonly string[] }[];
  readonly verbs: readonly string[];
  readonly roles: readonly string[];
  readonly rolePresets: Readonly<Record<string, readonly string[]>>;
}

const APPROVAL_VERBS = new Set(['approve', 'sign']);

export function PermissionMatrix({
  catalog,
  orgPermissions,
  seatRole,
  seatPermissions,
  readOnly,
}: {
  locale: string;
  catalog: Catalog;
  orgPermissions: readonly string[];
  seatRole: string | null;
  seatPermissions: readonly string[];
  readOnly: boolean;
}) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const roleId = useId();
  const [org, setOrg] = useState<Set<string>>(() => new Set(orgPermissions));
  const [seat, setSeat] = useState<Set<string>>(() => new Set(seatPermissions));
  const [role, setRole] = useState<string>(seatRole ?? '');
  const ceiling = role === '' ? null : new Set(catalog.rolePresets[role] ?? []);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    setter(next);
  };
  const setMany = (set: Set<string>, setter: (s: Set<string>) => void, keys: readonly string[], on: boolean) => {
    const next = new Set(set);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    setter(next);
  };

  const allSeatKeys = catalog.modules.flatMap((m) =>
    m.resources.flatMap((r) => catalog.verbs.filter((v) => !APPROVAL_VERBS.has(v)).map((v) => `${m.module}:${r}:${v}`)),
  );

  return (
    <div className="flex flex-col gap-[var(--space-24)]" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <section className="qm-card flex flex-col gap-[var(--space-8)]">
        <h2 className="text-h3">{t('orgPermissions')}</h2>
        {!readOnly && (
          <div className="flex gap-[var(--space-8)]">
            <button type="button" className="qm-btn" onClick={() => setMany(org, setOrg, catalog.orgPermissions, true)}>{t('selectAll')}</button>
            <button type="button" className="qm-btn" onClick={() => setMany(org, setOrg, catalog.orgPermissions, false)}>{t('clearAll')}</button>
          </div>
        )}
        <ul className="grid gap-[var(--space-4)] md:grid-cols-3" data-testid="qm-org-matrix">
          {catalog.orgPermissions.map((p) => (
            <li key={p}>
              <label className="flex items-center gap-[var(--space-8)] text-body-sm">
                <input type="checkbox" name={`org:${p}`} checked={org.has(p)} disabled={readOnly} onChange={(e) => toggle(org, setOrg, p, e.target.checked)} />
                <span className="qm-mono" dir="ltr">{p}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="qm-card flex flex-col gap-[var(--space-8)]">
        <h2 className="text-h3">{t('seatTemplate')}</h2>
        <label htmlFor={roleId} className="qm-label">{t('seatRole')}</label>
        <select id={roleId} name="seatRole" value={role} disabled={readOnly} onChange={(e) => setRole(e.target.value)} className="qm-field max-w-xs">
          <option value="">{t('noSeatRole')}</option>
          {catalog.roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {!readOnly && (
          <div className="flex flex-wrap gap-[var(--space-8)]">
            <button type="button" className="qm-btn" onClick={() => setMany(seat, setSeat, allSeatKeys, true)}>{t('selectAll')}</button>
            <button type="button" className="qm-btn" onClick={() => setMany(seat, setSeat, allSeatKeys, false)}>{t('clearAll')}</button>
            {catalog.verbs.filter((v) => !APPROVAL_VERBS.has(v)).map((v) => (
              <button key={v} type="button" className="qm-btn" onClick={() => setMany(seat, setSeat, allSeatKeys.filter((k) => k.endsWith(`:${v}`)), true)}>
                {t('selectAll')} · {v}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="qm-table text-body-sm" data-testid="qm-seat-matrix">
            <thead>
              <tr>
                <th className="text-start">module · resource</th>
                {catalog.verbs.map((v) => <th key={v} className="text-start">{v}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {catalog.modules.flatMap((m) =>
                m.resources.map((r) => {
                  const rowKeys = catalog.verbs.filter((v) => !APPROVAL_VERBS.has(v)).map((v) => `${m.module}:${r}:${v}`);
                  return (
                    <tr key={`${m.module}:${r}`}>
                      <td className="qm-mono" dir="ltr">{m.module}:{r}</td>
                      {catalog.verbs.map((v) => {
                        const key = `${m.module}:${r}:${v}`;
                        const approval = APPROVAL_VERBS.has(v);
                        const beyondCeiling = ceiling !== null && !ceiling.has(key);
                        return (
                          <td key={v}>
                            <input
                              type="checkbox"
                              name={`seat:${key}`}
                              checked={!approval && seat.has(key)}
                              disabled={readOnly || approval}
                              title={approval ? 'Nazir seat only' : beyondCeiling ? `above the ${role} ceiling: cut at issuance` : key}
                              onChange={(e) => toggle(seat, setSeat, key, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                      <td>
                        {!readOnly && (
                          <button type="button" className="qm-btn" onClick={() => setMany(seat, setSeat, rowKeys, !rowKeys.every((k) => seat.has(k)))}>
                            {t('selectAll')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
