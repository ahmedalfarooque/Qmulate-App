'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useId, useState } from 'react';

import type { FormEvent } from 'react';

import { requestPasswordReset, resetPasswordPath, signInPath } from '@/lib/auth-client';

/**
 * Asks the auth server to email a reset link. The response is the same whether or not the
 * address has an account, so this form cannot be used to enumerate who works with the trustee;
 * the only distinguishable failures are "no mail transport" and "provider refused the message".
 */
export function ForgotPasswordForm() {
  const locale = useLocale();
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const text = locale === 'ar' ? {
    intro: 'أدخل بريدك الإلكتروني وسنرسل رابطًا لإعادة تعيين كلمة المرور إن كان له حساب.',
    email: 'البريد الإلكتروني', submit: 'إرسال رابط إعادة التعيين',
    sent: 'إن كان لهذا البريد حساب فقد أُرسل رابط إعادة التعيين. تحقق من بريدك والبريد غير المرغوب فيه. ينتهي الرابط بعد 15 دقيقة.',
    notConfigured: 'خدمة البريد الإلكتروني غير مُعدّة على هذا الخادم. أبلغ مسؤول النظام.',
    failed: 'تعذر إرسال الرسالة. حاول مرة أخرى بعد قليل.', back: 'العودة إلى تسجيل الدخول',
  } : {
    intro: 'Enter your email address and, if it has an account, we will send a link to reset the password.',
    email: 'Email address', submit: 'Send reset link',
    sent: 'If that address has an account, a reset link has been sent. Check your inbox and spam folder. The link expires in 15 minutes.',
    notConfigured: 'Email delivery is not configured on this server. Tell your administrator.',
    failed: 'The email could not be sent. Try again shortly.', back: 'Back to sign in',
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const redirectTo = `${window.location.origin}${resetPasswordPath(locale)}`;
    const result = await requestPasswordReset({ email, redirectTo });
    setSubmitting(false);
    if (result.error) {
      setState('error');
      setError(result.error.code === 'EMAIL_NOT_CONFIGURED' ? text.notConfigured : text.failed);
      return;
    }
    setState('sent');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-16)]">
      <p className="text-body-sm text-mist">{text.intro}</p>
      {error !== null && (
        <p role="alert" className="qm-alert-danger text-body-sm">{error}</p>
      )}
      {state === 'sent' && <p role="status" className="text-body-sm">{text.sent}</p>}
      <div className="flex flex-col gap-[var(--space-4)]">
        <label htmlFor={emailId} className="qm-label">{text.email}</label>
        <input id={emailId} name="email" type="email" autoComplete="username" required dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} className="qm-field qm-mono" />
      </div>
      <button type="submit" disabled={isSubmitting || state === 'sent'} className="qm-btn qm-btn--primary">{text.submit}</button>
      <Link href={signInPath(locale)} className="rounded-control text-body-sm text-blue-strong underline focus-visible:shadow-focus">{text.back}</Link>
    </form>
  );
}
