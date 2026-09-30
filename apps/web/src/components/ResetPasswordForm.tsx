'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';

import type { FormEvent } from 'react';

import { resetPassword, signInPath } from '@/lib/auth-client';

/**
 * Consumes the token the reset email carried (`?token=`) and sets a new password. Every other
 * session of the account is revoked server-side on success; the person then signs in again
 * and passes their second factor as usual — a reset never bypasses 2FA.
 */
export function ResetPasswordForm() {
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const text = locale === 'ar' ? {
    intro: 'اختر كلمة مرور جديدة (12 حرفًا على الأقل).', password: 'كلمة المرور الجديدة', submit: 'تغيير كلمة المرور',
    invalid: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.',
    done: 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.', back: 'الانتقال إلى تسجيل الدخول',
    missing: 'هذه الصفحة تُفتح من رابط إعادة التعيين المرسل إلى بريدك.',
  } : {
    intro: 'Choose a new password (at least 12 characters).', password: 'New password', submit: 'Change password',
    invalid: 'This reset link is invalid or has expired. Request a new one.',
    done: 'Your password has been changed. Sign in with the new password.', back: 'Go to sign in',
    missing: 'Open this page from the reset link sent to your email.',
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    const result = await resetPassword({ newPassword: password, token });
    setSubmitting(false);
    setPassword('');
    if (result.error) {
      setError(text.invalid);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace(signInPath(locale)), 1500);
  }

  if (!token || params.get('error')) {
    return (
      <div className="flex flex-col gap-[var(--space-16)]">
        <p role="alert" className="qm-alert-danger text-body-sm">{params.get('error') ? text.invalid : text.missing}</p>
        <Link href={signInPath(locale)} className="rounded-control text-body-sm text-blue-strong underline focus-visible:shadow-focus">{text.back}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-16)]">
      <p className="text-body-sm text-mist">{text.intro}</p>
      {error !== null && <p role="alert" className="qm-alert-danger text-body-sm">{error}</p>}
      {done && <p role="status" className="text-body-sm">{text.done}</p>}
      <div className="flex flex-col gap-[var(--space-4)]">
        <label htmlFor={passwordId} className="qm-label">{text.password}</label>
        <input id={passwordId} name="password" type="password" autoComplete="new-password" minLength={12} required dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} className="qm-field" />
      </div>
      <button type="submit" disabled={isSubmitting || done} className="qm-btn qm-btn--primary">{text.submit}</button>
      <Link href={signInPath(locale)} className="rounded-control text-body-sm text-blue-strong underline focus-visible:shadow-focus">{text.back}</Link>
    </form>
  );
}
