'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { FormEvent } from 'react';

import { dashboardPath, forgotPasswordPath, signIn, signUpPath, twoFactorPath } from '@/lib/auth-client';

/**
 * Email + password sign-in.
 *
 * When the account has TOTP enrolled, better-auth does NOT issue a session here — it
 * returns `twoFactorRedirect`, and the second factor is asserted on `/two-factor`. That
 * branch is the normal path for every internal ops seat, not an edge case (NFR-06).
 *
 * The error surface is deliberately generic: "invalid credentials" for both a wrong
 * password and an unknown address, so the form cannot be used to enumerate who has an
 * account with the trustee.
 */
export function SignInForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn.email({ email, password });

    if (result.error) {
      setError(t('invalidCredentials'));
      setSubmitting(false);
      return;
    }

    const needsSecondFactor =
      typeof result.data === 'object' &&
      result.data !== null &&
      (result.data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true;

    router.replace(needsSecondFactor ? twoFactorPath(locale) : dashboardPath(locale));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-16)]">
      {error !== null && (
        <p role="alert" className="qm-alert-danger text-body-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-[var(--space-4)]">
        <label htmlFor={emailId} className="qm-label">
          {t('email')}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          required
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="qm-field qm-mono"
        />
      </div>

      <div className="flex flex-col gap-[var(--space-4)]">
        <label htmlFor={passwordId} className="qm-label">
          {t('password')}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="qm-field"
        />
      </div>

      <button type="submit" disabled={isSubmitting} className="qm-btn qm-btn--primary">
        {t('submit')}
      </button>

      {/* `auth.createAccount` is one of six keys this app needs that the E0 contract's key
          list does not yet define — reported to the orchestrator. next-intl renders the key
          path when a message is missing, which is visibly wrong rather than quietly wrong. */}
      <Link
        href={signUpPath(locale)}
        className="rounded-control text-body-sm text-blue-strong underline focus-visible:shadow-focus"
      >
        {t('createAccount')}
      </Link>
      <Link
        href={forgotPasswordPath(locale)}
        className="rounded-control text-body-sm text-blue-strong underline focus-visible:shadow-focus"
      >
        {locale === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot your password?'}
      </Link>
    </form>
  );
}
