'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

/**
 * Server actions for the organisation screens (migration 55). Each one reads a form, calls the
 * real router (so every guard runs), and returns to the page with `?ok=1` or `?error=<key>` in the
 * URL — the page renders the outcome, and nothing is decided in the browser.
 */
function text(form: FormData, field: string, max = 200): string {
  const value = form.get(field);
  if (typeof value !== 'string' || value.length > max) throw new Error(`${field} is missing or malformed`);
  return value;
}

function optionalText(form: FormData, field: string, max = 500): string | undefined {
  const value = form.get(field);
  return typeof value === 'string' && value !== '' && value.length <= max ? value : undefined;
}

function backTo(path: string, outcome: { ok: true } | { error: string }): never {
  const query = 'ok' in outcome ? 'ok=1' : `error=${encodeURIComponent(outcome.error)}`;
  revalidatePath(path);
  redirect(`${path}?${query}`);
}

async function run(locale: string, path: string, fn: () => Promise<unknown>): Promise<never> {
  try {
    await fn();
  } catch (error) {
    // `redirect()` throws by design; anything else is a kernel refusal to show on the page.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    backTo(path, { error: kernelMessageKey(error, locale) });
  }
  backTo(path, { ok: true });
}

export async function setUserStatusAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  const status = text(form, 'status', 32) as 'PENDING_APPROVAL' | 'ACTIVE' | 'DISABLED' | 'REJECTED';
  const reason = optionalText(form, 'reason');
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.setStatus({ userId, status, ...(reason ? { reason } : {}) });
  });
}

export async function setUserLevelAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  const level = text(form, 'accessLevelId', 128);
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.setAccessLevel({ userId, accessLevelId: level === '' ? null : level });
  });
}

export async function setUserOverridesAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  const overrides: { permission: string; effect: 'ALLOW' | 'DENY' }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('ovr:') || typeof value !== 'string') continue;
    if (value === 'ALLOW' || value === 'DENY') overrides.push({ permission: key.slice(4), effect: value });
  }
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.setOverrides({ userId, overrides });
  });
}

export async function createUserAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2) as 'ar' | 'en';
  const accessLevelId = optionalText(form, 'accessLevelId', 128);
  const initialPassword = optionalText(form, 'initialPassword', 128);
  let created: { userId: string } | null = null;
  try {
    const caller = await getServerCaller(locale);
    created = await caller.admin.users.create({
      name: text(form, 'name', 120),
      email: text(form, 'email', 254),
      locale,
      ...(accessLevelId ? { accessLevelId } : {}),
      ...(initialPassword ? { initialPassword } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    backTo(`/${locale}/users`, { error: kernelMessageKey(error, locale) });
  }
  backTo(`/${locale}/users/${created.userId}`, { ok: true });
}

export async function updateUserDetailsAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  const email = optionalText(form, 'email', 254);
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.updateDetails({
      userId,
      name: text(form, 'name', 120),
      ...(email ? { email } : {}),
    });
  });
}

export async function removeUserAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  let removed = false;
  try {
    const caller = await getServerCaller(locale);
    await caller.admin.users.remove({ userId });
    removed = true;
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    backTo(`/${locale}/users/${userId}`, { error: kernelMessageKey(error, locale) });
  }
  if (removed) backTo(`/${locale}/users`, { ok: true });
}

export async function requestPasswordResetAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2) as 'ar' | 'en';
  const userId = text(form, 'userId', 128);
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.requestPasswordReset({ userId, locale });
  });
}

export async function seatUserAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  const waqfId = text(form, 'waqfId', 128);
  const role = text(form, 'role', 40);
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.seat({ userId, waqfId, role });
  });
}

export async function unseatUserAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const userId = text(form, 'userId', 128);
  const grantId = text(form, 'grantId', 128);
  await run(locale, `/${locale}/users/${userId}`, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.users.unseat({ grantId });
  });
}

function collectPermissions(form: FormData, prefix: string): string[] {
  const out: string[] = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith(prefix) && value === 'on') out.push(key.slice(prefix.length));
  }
  return out;
}

export async function saveLevelAction(form: FormData): Promise<void> {
  const locale = text(form, 'locale', 2);
  const id = optionalText(form, 'id', 128);
  const key = text(form, 'key', 40);
  const seatRole = text(form, 'seatRole', 40);
  const path = id ? `/${locale}/roles/${id}` : `/${locale}/roles`;
  await run(locale, path, async () => {
    const caller = await getServerCaller(locale);
    await caller.admin.accessLevels.upsert({
      ...(id ? { id } : {}),
      key,
      nameEn: text(form, 'nameEn', 80),
      nameAr: text(form, 'nameAr', 80),
      permissions: collectPermissions(form, 'org:'),
      seatRole: seatRole === '' ? null : seatRole,
      seatPermissions: collectPermissions(form, 'seat:'),
    });
  });
}
