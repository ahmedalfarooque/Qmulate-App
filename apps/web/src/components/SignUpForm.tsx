'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { FormEvent } from 'react';

import { dashboardPath, signIn, signInPath, signUp } from '@/lib/auth-client';

/**
 * Registration — name, email and password, then straight to the dashboard (owner decision,
 * 2026-10-13: no compulsory TOTP enrolment at registration or sign-in).
 *
 * Registration is NOT open self-service: a user with no `WaqfAccessGrant` can see nothing
 * (deny-by-default, §10 §1.1) beyond what the organisation's default access level confers.
 * Enrolling an authenticator remains available, voluntarily, from `/two-factor`.
 *
 * ⚠ Pre-production: email verification is off (no mail transport exists yet) and this
 * route must be closed or invite-gated before any real seat is created.
 */
export function SignUpForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const created = await signUp.email({ name, email, password });
    if (created.error) {
      setError(created.error.message ?? t('invalidCredentials'));
      setSubmitting(false);
      return;
    }

    // better-auth may or may not issue a session on sign-up depending on config; sign in
    // explicitly so the person always lands in the app with a session.
    const signedIn = await signIn.email({ email, password });
    if (signedIn.error) {
      router.replace(signInPath(locale));
      return;
    }

    // Document navigation, so the app shell renders with the fresh session cookie.
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
        {/* `auth.name` — key requested from @qmulate/i18n (see the note in SignInForm). */}
        <label htmlFor={nameId} className="qm-label">
          {t('name')}
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          autoComplete="name"
          required
          // Arabic is the product default, so a name field is an RTL island by default;
          // the browser still renders Latin input LTR inside it via the bidi algorithm.
          dir="auto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="qm-field"
        />
      </div>

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
          autoComplete="new-password"
          required
          minLength={12}
          dir="ltr"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="qm-field"
        />
      </div>

      <button type="submit" disabled={isSubmitting} className="qm-btn qm-btn--primary">
        {t('submit')}
      </button>

      <Link
        href={signInPath(locale)}
        className="rounded-control text-body-sm text-blue-strong underline focus-visible:shadow-focus"
      >
        {t('signInInstead')}
      </Link>
    </form>
  );
}
