import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

import type { ServerCaller } from '@/lib/trpc/server';

/**
 * Server-side loaders for the organisation screens (migration 55). Every call goes through the
 * real router and middleware chain; a refusal becomes a message key for the page to render, never
 * a 500 — an unauthorised caller is an expected state.
 */
export type Loaded<T> = { status: 'ok'; value: T } | { status: 'refused'; messageKey: string };

async function load<T>(locale: string, fn: (caller: ServerCaller) => Promise<T>): Promise<Loaded<T>> {
  try {
    const caller = await getServerCaller(locale);
    return { status: 'ok', value: await fn(caller) };
  } catch (error) {
    return { status: 'refused', messageKey: kernelMessageKey(error, locale) };
  }
}

export const loadIdentity = (locale: string) => load(locale, (c) => c.whoami());

export const loadUsers = (
  locale: string,
  input: { search?: string; status?: 'PENDING_APPROVAL' | 'ACTIVE' | 'DISABLED' | 'REJECTED' },
) => load(locale, (c) => c.admin.users.list(input));

export const loadUser = (locale: string, userId: string) => load(locale, (c) => c.admin.users.get({ userId }));

export const loadLevels = (locale: string) => load(locale, (c) => c.admin.accessLevels.list());

export const loadCatalog = (locale: string) => load(locale, (c) => c.admin.accessLevels.catalog());

export const loadEndowments = (locale: string) => load(locale, (c) => c.admin.endowments());

export const loadAudit = (
  locale: string,
  input: { actorId?: string; entityType?: string; action?: string; before?: string },
) => load(locale, (c) => c.admin.audit.list(input));

/**
 * The cross-endowment registers: one call per seated endowment, the seats that lack the read
 * verb skipped rather than refused, so the page shows what the caller may see and nothing else.
 */
export async function loadAcrossSeats<T>(
  locale: string,
  permission: string,
  fn: (caller: ServerCaller, waqfId: string) => Promise<T>,
): Promise<Loaded<{ waqfId: string; value: T }[]>> {
  const identity = await loadIdentity(locale);
  if (identity.status !== 'ok') return identity;
  const caller = await getServerCaller(locale);
  // One row set per ENDOWMENT: a person holding several seats on the same endowment (the primary
  // administrator, a dev-admin bootstrap) must not see that endowment's rows once per seat.
  const waqfIds = [
    ...new Set(
      identity.value.grants
        .filter((g) => (g.permissions as readonly string[]).includes(permission))
        .map((g) => g.waqfId),
    ),
  ];
  const rows: { waqfId: string; value: T }[] = [];
  for (const waqfId of waqfIds) {
    try {
      rows.push({ waqfId, value: await fn(caller, waqfId) });
    } catch {
      // A seat whose read was refused for a reason the kernel keeps to itself: skip it silently.
    }
  }
  return { status: 'ok', value: rows };
}
