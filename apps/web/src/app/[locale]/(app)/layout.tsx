import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';

import { ACCESS_KEY_PREFIX, kernelMessageKey } from '@/lib/trpc/client';
import { NavigationProvider } from '@/components/NavigationProvider';
import { TrpcProvider } from '@/lib/trpc/provider';
import { getServerCaller } from '@/lib/trpc/server';

import type { ReactNode } from 'react';

/**
 * The authenticated shell's layout: the auth gate, the kernel provider, and deny-by-default.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · THE GATE IS REPEATED HERE, AND THE PAGE-LEVEL GATE STAYS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `dashboard/page.tsx` runs the same two redirects. That is NOT redundancy to clean up:
 *
 *   · A LAYOUT alone is not a gate. Next.js does not re-run a layout on a client-side navigation
 *     within the same segment, so a page added under this group and reached by `<Link>` would
 *     render with a layout decision taken on some earlier request.
 *   · A PAGE alone is not a gate either — the next person adding a page under `(app)/` will forget.
 *
 * Two layers, same condition, same source of truth (`evaluateAuthGate`). The TOTP ENROLMENT GATE IS
 * UNIVERSAL (user decision, 2026-07-27): every authenticated account is refused until enrolled,
 * role or no role. Do NOT make either layer role-conditional — `e2e/auth-journey.spec.ts` asserts a
 * brand-new, role-less registration cannot reach the dashboard, and that assertion exists because
 * the gate WAS role-conditional and a fresh account walked straight in.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · DENY BY DEFAULT: A SESSION IS NOT AN AUTHORIZATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §10 principle 1 — "the default is the GRANT, not the session". `whoami` is authed but deliberately
 * UNSCOPED (the answer is *which* endowments, so it cannot itself require one). A signed-in caller
 * holding no ACTIVE `WaqfAccessGrant` therefore reaches the shell with nothing behind it, and is
 * shown one honest sentence in their own language instead of a chrome full of empty screens.
 *
 * The wording comes from the catalogue via {@link kernelMessageKey} — never from the error's own
 * `message`, which is developer English that quotes the requested endowment and the refused
 * permission. Rendering that would undo `NO_GRANT → NOT_FOUND` in the UI, one helpful line at a
 * time.
 */

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);
  // Migration 55: the registration state is told in its own words, not as a missing record.
  if (gate.status === 'account-pending') return <AccountStateNotice locale={locale} state="pending" />;
  if (gate.status === 'account-disabled') return <AccountStateNotice locale={locale} state="disabled" />;

  /**
   * ONE kernel call, through the SAME router and middleware chain the HTTP boundary uses. A refusal
   * is caught rather than allowed to become a 500: an unauthorized caller is an expected state, and
   * an error page would leak "something went wrong" where the right answer is "you have no access".
   */
  let identity: Awaited<ReturnType<Awaited<ReturnType<typeof getServerCaller>>['whoami']>> | null = null;
  let refusal: unknown = null;
  try {
    const caller = await getServerCaller(locale);
    identity = await caller.whoami();
  } catch (error) {
    refusal = error;
  }

  if (refusal === null && identity !== null) {
    // Seated on at least one endowment, or holding an organisation permission (Users / Roles /
    // Audit Log): the shell is theirs. Which items appear is decided by `identity.sections`.
    if (identity.grants.length > 0 || identity.org.permissions.length > 0) {
      return (
        <NavigationProvider
          value={{
            sections: identity.sections,
            isPrimaryAdmin: identity.org.isPrimaryAdmin,
            accessLevelKey: identity.org.accessLevel?.key ?? null,
          }}
        >
          <TrpcProvider locale={locale}>{children}</TrpcProvider>
        </NavigationProvider>
      );
    }
    // Approved, enrolled, and not yet seated anywhere: say exactly that.
    return <AccountStateNotice locale={locale} state="no-seat" />;
  }

  const messageKey = kernelMessageKey(
    refusal ?? { messageKey: `${ACCESS_KEY_PREFIX}NO_GRANT` },
    locale,
  );

  return <AccessNotice locale={locale} messageKey={messageKey} />;
}

/**
 * The three ACCOUNT states (migration 55), each in its own words. These are not record refusals
 * and carry no non-disclosure duty: the person is talking about their own account.
 */
async function AccountStateNotice({ locale, state }: { locale: string; state: 'pending' | 'disabled' | 'no-seat' }) {
  const t = await getTranslations({ locale, namespace: 'account' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  return (
    <main
      id="qm-main"
      data-testid="qm-account-state"
      data-state={state}
      className="mx-auto flex min-h-[100dvh] w-full max-w-product flex-col justify-center gap-[var(--space-16)] px-[var(--space-16)] py-[var(--space-24)] text-start"
    >
      <p className="qm-label">{tCommon('appName')}</p>
      <h1 className="text-h2 text-ink">{t(`${state}.title`)}</h1>
      <p className="text-body text-mist">{t(`${state}.body`)}</p>
      <form action={`/api/auth/sign-out`} method="post" className="hidden" />
      <a href={`/${locale}/sign-in`} className="text-body-sm text-blue-strong underline">
        {t('backToSignIn')}
      </a>
    </main>
  );
}

/**
 * The one honest sentence.
 *
 * Layout is authored in LOGICAL properties only (`ms-`/`me-`/`text-start`), so `dir="rtl"` on the
 * root mirrors it with no second stylesheet — the physical `pl-/pr-/ml-/mr-/left-/right-` utilities
 * are banned by `@qmulate/config/eslint`.
 *
 * ⚠ IT RENDERS NO MACHINE CODE, and carries no `data-*` attribute naming one. The three
 * non-disclosure refusals (`NO_GRANT`, `SCOPE_REF_MISMATCH`, `AML_COMPARTMENT_ONLY`) share one
 * identical wording in both locales, asserted by `packages/i18n/test/messages.test.ts`, precisely so
 * the caller cannot tell which of them happened.
 */
async function AccessNotice({ locale, messageKey }: { locale: string; messageKey: string }) {
  const t = await getTranslations({ locale, namespace: 'errors' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  // `namespace: 'errors'` is already scoped, so the leaf is what `t()` wants.
  const leaf = messageKey.startsWith('errors.') ? messageKey.slice('errors.'.length) : 'generic';

  return (
    <main
      id="qm-main"
      data-testid="qm-access-notice"
      className="mx-auto flex min-h-[100dvh] w-full max-w-product flex-col justify-center gap-[var(--space-16)] px-[var(--space-16)] py-[var(--space-24)] text-start"
    >
      <p className="qm-label">{tCommon('appName')}</p>
      <h1 className="text-h2 text-ink">{t('notAuthorized')}</h1>
      <p className="text-body text-mist">{t(leaf)}</p>
    </main>
  );
}
