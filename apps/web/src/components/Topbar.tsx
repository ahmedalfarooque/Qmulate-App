'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { dashboardPath, signInPath, signOut, useSession } from '@/lib/auth-client';

import { LocaleSwitch } from './LocaleSwitch';

/**
 * The glass sticky topbar (z = --z-sticky = 60) — the app's persistent context strip.
 *
 * It carries the Endowment Switcher, which drives every scope-aware screen: selecting
 * Client → Waqif → Endowment re-scopes the whole app, and "nothing selected" means
 * portfolio scope (cross-endowment roll-ups). In E0 there is no data behind it, so the
 * control renders in its real resting state — disabled and honest — rather than
 * pretending with invented endowments.
 */
export function Topbar() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [isSigningOut, startSignOut] = useTransition();

  return (
    <header
      className="sticky top-0 z-sticky border-b border-line bg-[var(--glass-fill)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]"
      data-testid="qm-topbar"
    >
      <div className="mx-auto flex w-full max-w-product flex-wrap items-center gap-[var(--space-16)] px-[var(--space-16)] py-[var(--space-12)]">
        <Link
          href={dashboardPath(locale)}
          className="rounded-control px-[var(--space-4)] text-h3 font-semibold tracking-[-0.02em] text-ink focus-visible:shadow-focus"
        >
          {/* The wordmark is never mirrored, never translated. */}
          <span dir="ltr">{t('appName')}</span>
        </Link>

        <EndowmentSwitcher />

        <div className="ms-auto flex items-center gap-[var(--space-12)]">
          <LocaleSwitch />

          {isPending ? (
            <span
              aria-live="polite"
              className="qm-label text-mist-2"
              data-testid="qm-session-pending"
            >
              {t('loading')}
            </span>
          ) : session ? (
            <button
              type="button"
              disabled={isSigningOut}
              onClick={() =>
                startSignOut(() => {
                  void signOut().then(() => router.replace(signInPath(locale)));
                })
              }
              className="min-h-tap rounded-control border border-edge bg-panel px-[var(--space-16)] text-body-sm text-ink shadow-raised-sm transition duration-fast active:shadow-inset focus-visible:shadow-focus"
            >
              {t('signOut')}
            </button>
          ) : (
            <Link
              href={signInPath(locale)}
              className="flex min-h-tap items-center rounded-control border border-edge bg-blue px-[var(--space-16)] text-body-sm text-on-info shadow-raised-sm transition duration-fast active:shadow-inset focus-visible:shadow-focus"
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Client → Waqif → Endowment cascade. E0 ships the resting/empty state only: no client
 * data exists in the app yet, and inventing endowments to make a control look alive is
 * exactly the kind of fake that later gets screenshotted into a deck.
 */
function EndowmentSwitcher() {
  const t = useTranslations('common');

  return (
    <div className="flex min-w-0 items-center gap-[var(--space-8)]" data-testid="qm-scope-switcher">
      <span className="qm-label">{t('portfolioScope')}</span>
      <select
        aria-label={t('selectEndowment')}
        disabled
        defaultValue="portfolio"
        className="min-h-tap max-w-[16rem] rounded-control border border-edge bg-well px-[var(--space-12)] text-body-sm text-mist shadow-inset focus-visible:shadow-focus"
      >
        <option value="portfolio">{t('selectEndowment')}</option>
      </select>
    </div>
  );
}
