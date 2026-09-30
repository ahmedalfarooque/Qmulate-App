import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Eyebrow, Heading, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { Refusal } from '@/components/endowments/Refusal';
import { loadIdentity } from '@/lib/admin/loaders';

import type { ReactNode } from 'react';

/**
 * The scaffold every organisation screen (migration 55) stands on: the auth gate, the section
 * check (visibility AND the page-level refusal for a direct URL), the shell and the header.
 * A caller whose `whoami.sections` does not list the section gets the permission refusal inside
 * the shell — the URL is not a way around the sidebar.
 */
export async function AdminPage({
  locale,
  section,
  title,
  intro,
  outcome,
  children,
}: {
  locale: string;
  section: string;
  title: string;
  intro: string;
  outcome?: { ok?: string; error?: string };
  children: (identity: NonNullable<Extract<Awaited<ReturnType<typeof loadIdentity>>, { status: 'ok' }>['value']>) => Promise<ReactNode> | ReactNode;
}) {
  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tAdmin = await getTranslations({ locale, namespace: 'admin' });
  const tErrors = await getTranslations({ locale, namespace: 'errors' });
  const identity = await loadIdentity(locale);

  if (identity.status !== 'ok' || !(identity.value.sections as readonly string[]).includes(section)) {
    return (
      <AppShell>
        <Refusal
          locale={locale}
          messageKey={identity.status === 'ok' ? 'errors.access.PERMISSION_DENIED' : identity.messageKey}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)] text-start">
          <Eyebrow tick>{tCommon('appName')}</Eyebrow>
          <Heading level={1}>{title}</Heading>
          <Text tone="mist">{intro}</Text>
        </header>
        {outcome?.ok && (
          <p role="status" className="qm-alert-success text-body-sm" data-testid="qm-admin-ok">
            {tAdmin('ok')}
          </p>
        )}
        {outcome?.error && (
          <p role="alert" className="qm-alert-danger text-body-sm" data-testid="qm-admin-error">
            {tAdmin('failed', {
              reason: outcome.error.startsWith('errors.')
                ? tErrors(outcome.error.slice('errors.'.length) as never)
                : outcome.error,
            })}
          </p>
        )}
        {await children(identity.value)}
      </div>
    </AppShell>
  );
}

/** Reads the `?ok=1` / `?error=` outcome a server action left on the URL. */
export async function outcomeOf(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { ok: one(params.ok), error: one(params.error) };
}
