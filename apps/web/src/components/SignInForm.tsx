'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useId, useState } from 'react';

import type { FormEvent } from 'react';

import { dashboardPath, forgotPasswordPath, signIn, signUpPath } from '@/lib/auth-client';

/**
 * Email + password sign-in.
 *
 * Routine sign-in asks for nothing but the email and the password (owner decision, 2026-10-13):
 * the server issues the session and this form goes to the dashboard. The one exception is a
 * deliberate STEP-UP: `/sign-in?stepUp=1` (linked from the approve / sign refusal) asks the server
 * for a second-factor challenge, so the person can prove a recorded TOTP before an approve or sign
 * action. In that mode better-auth returns `twoFactorRedirect` and the code is asserted on
 * `/two-factor`. The server decides; this header only asks.
 *
 * The error surface is deliberately generic: "invalid credentials" for both a wrong
 * password and an unknown address, so the form cannot be used to enumerate who has an
 * account with the trustee.
 */
export function SignInForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
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

    // Step-up is requested explicitly; routine sign-in sends no header and gets a password-only session.
    const stepUp =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('stepUp') === '1';
    const result = await signIn.email(
      { email, password },
      stepUp ? { headers: { 'x-qm-step-up': 'totp' } } : undefined,
    );

    if (result.error) {
      // 401/4xx = the credentials were checked and refused. A 503 (the server could not reach its
      // database), any other 5xx, or no status at all (network) is a service problem and is told
      // as one — never dressed up as a wrong password.
      const status = typeof result.error.status === 'number' ? result.error.status : 0;
      setError(status === 0 || status >= 500 ? t('serviceUnavailable') : t('invalidCredentials'));
      setSubmitting(false);
      return;
    }

    const needsSecondFactor =
      typeof result.data === 'object' &&
      result.data !== null &&
      (result.data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true;

    // The two-factor client plugin already performs a document navigation to `/two-factor` on
    // that response (`onTwoFactorRedirect`); a second, soft navigation here only races it.
    if (needsSecondFactor) return;
    window.location.assign(dashboardPath(locale));
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
