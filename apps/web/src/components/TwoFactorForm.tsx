'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import type { FormEvent } from 'react';

import { dashboardPath, twoFactor, useSession } from '@/lib/auth-client';

/**
 * The second factor — both halves of it, because which half you need is decided by state,
 * not by navigation:
 *
 *   CHALLENGE — no session yet. The password was accepted and better-auth is holding a
 *               pending 2FA cookie; entering the TOTP completes the sign-in.
 *   ENROL     — a session exists but `twoFactorEnabled` is false. The user holds (or will
 *               hold) a TOTP-mandatory seat and cannot reach the app until they enrol
 *               (NFR-06). Enrolment needs the password again, then one verified code.
 *
 * The TOTP URI is rendered as text rather than a QR image: adding a QR dependency for E0
 * buys nothing an authenticator app cannot do with a pasted `otpauth://` URI, and the
 * secret must not be sent to any third-party QR service. A QR renderer belongs in
 * `packages/ui` when the enrolment screen is designed properly.
 */
type Phase = 'challenge' | 'enrol-password' | 'enrol-verify';
/** `recovery` is a challenge-only path: a saved single-use code stands in for a lost device. */
type Method = 'email' | 'authenticator' | 'recovery';

function isEnrolled(user: unknown): boolean {
  return (
    typeof user === 'object' &&
    user !== null &&
    (user as { twoFactorEnabled?: unknown }).twoFactorEnabled === true
  );
}

export function TwoFactorForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const codeId = useId();
  const passwordId = useId();
  const { data: session, isPending } = useSession();

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<Method>('email');
  const [emailSent, setEmailSent] = useState(false);
  const emailText = locale === 'ar' ? {
    intro: 'سنرسل رمز تحقق إلى البريد الإلكتروني المسجل لحسابك.',
    send: 'إرسال رمز إلى البريد الإلكتروني', resend: 'إعادة إرسال الرمز',
    sent: 'تم قبول رسالة الرمز للإرسال. تحقق من بريدك والبريد غير المرغوب فيه. تنتهي صلاحيته بعد 5 دقائق.',
    notConfigured: 'خدمة البريد الإلكتروني غير مُعدّة على هذا الخادم. استخدم تطبيق المصادقة أو رمز الاسترداد، وأبلغ مسؤول النظام.',
    deliveryFailed: 'تعذر تسليم رسالة الرمز. حاول مرة أخرى بعد قليل أو استخدم تطبيق المصادقة.',
    tooMany: 'طلبات كثيرة خلال فترة قصيرة. انتظر لحظات ثم أعد المحاولة.',
    challengeExpired: 'انتهت صلاحية خطوة التحقق. سجّل الدخول من جديد.',
    failed: 'تعذر إرسال الرمز. حاول مرة أخرى أو استخدم تطبيق المصادقة.',
    email: 'البريد الإلكتروني', authenticator: 'تطبيق المصادقة', recovery: 'رمز الاسترداد',
    recoveryIntro: 'أدخل أحد رموز الاسترداد التي احتفظت بها عند تفعيل التحقق بخطوتين. يُستخدم كل رمز مرة واحدة فقط.',
    recoveryCode: 'رمز الاسترداد', recoveryInvalid: 'رمز الاسترداد غير صالح أو سبق استخدامه.',
  } : {
    intro: 'A verification code will be sent to the email address registered to your account.',
    send: 'Send code to my email', resend: 'Resend email code',
    sent: 'The email was accepted for delivery. Check your inbox and spam folder. The code expires in 5 minutes.',
    notConfigured: 'Email delivery is not configured on this server. Use the authenticator app or a recovery code, and tell your administrator.',
    deliveryFailed: 'The code email could not be delivered. Try again shortly or use the authenticator app.',
    tooMany: 'Too many requests in a short time. Wait a moment and try again.',
    challengeExpired: 'The verification step has expired. Sign in again.',
    failed: 'Unable to send the code. Try again or use the authenticator app.',
    email: 'Email code', authenticator: 'Authenticator app', recovery: 'Recovery code',
    recoveryIntro: 'Enter one of the recovery codes you saved when two-factor was enabled. Each code works once.',
    recoveryCode: 'Recovery code', recoveryInvalid: 'That recovery code is not valid or was already used.',
  };

  /** One sentence per server outcome — the code is what the operator needs, never the mail server's words. */
  function sendFailureMessage(status: number | undefined, code: string | undefined): string {
    if (code === 'EMAIL_NOT_CONFIGURED') return emailText.notConfigured;
    if (code === 'EMAIL_DELIVERY_FAILED') return emailText.deliveryFailed;
    if (status === 429) return emailText.tooMany;
    if (status === 401) return emailText.challengeExpired;
    return emailText.failed;
  }

  async function sendCode() {
    setError(null);
    setSubmitting(true);
    setEmailSent(false);
    try {
      const result = await twoFactor.sendOtp({});
      if (result.error) setError(sendFailureMessage(result.error.status, result.error.code));
      else setEmailSent(true);
    } catch { setError(emailText.failed); }
    finally { setSubmitting(false); }
  }

  let phase: Phase = 'challenge';
  if (totpUri !== null) {
    phase = 'enrol-verify';
  } else if (session && !isEnrolled(session.user)) {
    phase = 'enrol-password';
  }

  if (isPending) {
    return (
      <p aria-live="polite" className="qm-label">
        {t('totpTitle')}
      </p>
    );
  }

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await twoFactor.enable({ password });
    setSubmitting(false);

    if (result.error || !result.data) {
      setError(t('invalidCredentials'));
      return;
    }

    setTotpUri(result.data.totpURI);
    setBackupCodes(result.data.backupCodes);
    setPassword('');
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = method === 'email'
      ? await twoFactor.verifyOtp({ code })
      : method === 'recovery'
        ? await twoFactor.verifyBackupCode({ code })
        : await twoFactor.verifyTotp({ code });
    setSubmitting(false);

    if (result.error) {
      setError(method === 'recovery' ? emailText.recoveryInvalid : t('invalidTotp'));
      setCode('');
      return;
    }

    /**
     * A full navigation, not `router.replace`: the verify response has just rotated the session
     * cookie, and a soft navigation races the session hook's own refetch and the router's cached
     * view of `/dashboard` (which last resolved to a redirect back here). Measured on production:
     * a 200 from verify-otp followed by a reload of this page. A document load carries the new
     * cookie unconditionally and lets the server gate decide from the database.
     */
    window.location.assign(dashboardPath(locale));
  }

  return (
    <div className="flex flex-col gap-[var(--space-16)]">
      <div className="flex gap-[var(--space-8)]">
        <button type="button" aria-pressed={method === 'email'} className="qm-btn" onClick={() => { setMethod('email'); setCode(''); setError(null); }}>{emailText.email}</button>
        <button type="button" aria-pressed={method === 'authenticator'} className="qm-btn" onClick={() => { setMethod('authenticator'); setCode(''); setError(null); }}>{emailText.authenticator}</button>
        {phase === 'challenge' && (
          <button type="button" aria-pressed={method === 'recovery'} className="qm-btn" onClick={() => { setMethod('recovery'); setCode(''); setError(null); }}>{emailText.recovery}</button>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="qm-alert-danger text-body-sm">
          {error}
        </p>
      )}

      {phase === 'enrol-password' && (
        <form onSubmit={handleEnable} className="flex flex-col gap-[var(--space-16)]">
          <p className="text-body-sm text-mist">{method === 'email' ? emailText.intro : t('totpEnrolIntro')}</p>
          <p className="text-body-sm text-ink">{t('totpEnrolRequired')}</p>

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
        </form>
      )}

      {phase === 'enrol-verify' && totpUri !== null && (
        <section className="flex flex-col gap-[var(--space-12)]">
          <h2 className="text-h3">{t('totpEnrolTitle')}</h2>
          {/* The URI is a secret. LTR island, never mirrored, never sent anywhere else. */}
          {method === 'authenticator' && <code dir="ltr" className="qm-code-block" data-testid="qm-totp-uri">
            {totpUri}
          </code>}

          {backupCodes.length > 0 && (
            <div className="flex flex-col gap-[var(--space-8)]">
              <h3 className="qm-label">{t('backupCodes')}</h3>
              <p className="text-body-sm text-mist">{t('backupCodesWarning')}</p>
              <ul dir="ltr" className="qm-code-block flex flex-col gap-[var(--space-4)]">
                {backupCodes.map((backupCode) => (
                  <li key={backupCode}>{backupCode}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {(phase === 'challenge' || phase === 'enrol-verify') && (
        <form onSubmit={handleVerify} className="flex flex-col gap-[var(--space-16)]">
          {method === 'email' && <>
            <p className="text-body-sm">{emailText.intro}</p>
            <button type="button" disabled={isSubmitting} className="qm-btn" onClick={() => { void sendCode(); }}>{emailSent ? emailText.resend : emailText.send}</button>
            {emailSent && <p role="status">{emailText.sent}</p>}
          </>}
          {method === 'recovery' && <p className="text-body-sm">{emailText.recoveryIntro}</p>}
          <div className="flex flex-col gap-[var(--space-4)]">
            <label htmlFor={codeId} className="qm-label">
              {method === 'recovery' ? emailText.recoveryCode : t('totpCode')}
            </label>
            {method === 'recovery' ? (
              <input
                id={codeId}
                name="code"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                required
                dir="ltr"
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
                className="qm-field qm-num"
              />
            ) : (
              <input
                id={codeId}
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                dir="ltr"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                className="qm-field qm-num"
              />
            )}
          </div>

          <button type="submit" disabled={isSubmitting} className="qm-btn qm-btn--primary">
            {t('totpVerify')}
          </button>
        </form>
      )}
    </div>
  );
}
