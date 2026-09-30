import { AsyncLocalStorage } from 'node:async_hooks';
import nodemailer from 'nodemailer';
import { serverEnv } from '@qmulate/config/env';

/**
 * The one mail transport: nodemailer over authenticated, TLS-only SMTP. With Resend that is
 * `smtp.resend.com`, username `resend`, password = an API key, and a sender on the verified
 * domain (`Cumulate App <no-reply@app.qmulate.ai>`). Every authentication email — the email
 * second factor, password reset, address verification — goes through `sendTransactionalEmail`,
 * so there is exactly one place that knows how mail leaves the application.
 *
 * Messages are plain text on purpose: nothing to render, nothing to track, and a code or link is
 * the only content. Codes and links are never logged here; the provider's own log records the
 * recipient and subject, not the body.
 */
const delivery = new AsyncLocalStorage<{ failed: boolean }>();

export function emailOtpConfigured(): boolean {
  return Boolean(serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASSWORD && serverEnv.SMTP_FROM);
}

/** Alias that reads naturally at the non-OTP call sites; the same four variables gate every email. */
export const emailConfigured = emailOtpConfigured;

export function sendTransactionalEmail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<void> {
  if (!emailOtpConfigured()) throw new Error('Email delivery is not configured.');
  const transport = nodemailer.createTransport({
    host: serverEnv.SMTP_HOST,
    port: serverEnv.SMTP_PORT,
    secure: serverEnv.SMTP_PORT === 465,
    requireTLS: serverEnv.SMTP_PORT !== 465,
    auth: { user: serverEnv.SMTP_USER, pass: serverEnv.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  return transport.sendMail({ from: serverEnv.SMTP_FROM, to, subject, text }).then((result) => {
    if (!result.accepted.length || result.rejected.length) throw new Error('Email delivery rejected.');
  }).catch(() => {
    const state = delivery.getStore();
    if (state) state.failed = true;
    throw new Error('Verification email could not be delivered.');
  }).finally(() => transport.close());
}

export function sendEmailOtp({ user, otp }: { user: { email: string }; otp: string }): Promise<void> {
  return sendTransactionalEmail({
    to: user.email,
    subject: 'Cumulate App — Your verification code',
    text: `Your Cumulate App verification code is ${otp}. It expires in 5 minutes. Do not share this code; Cumulate App staff will never ask for it.\n\nرمز التحقق الخاص بك في Cumulate App هو ${otp}. تنتهي صلاحيته خلال 5 دقائق. لا تشاركه مع أي شخص.`,
  });
}

export function sendPasswordResetEmail({ user, url }: { user: { email: string }; url: string }): Promise<void> {
  return sendTransactionalEmail({
    to: user.email,
    subject: 'Cumulate App — Reset your password',
    text: `A password reset was requested for your Cumulate App account. Open this link to choose a new password (valid for 15 minutes):\n\n${url}\n\nIf you did not request this, ignore this email; your password is unchanged.\n\nطُلب إعادة تعيين كلمة المرور لحسابك في Cumulate App. افتح الرابط أعلاه لاختيار كلمة مرور جديدة (صالح لمدة 15 دقيقة). إن لم تطلب ذلك فتجاهل هذه الرسالة.`,
  });
}

export function sendAddressVerificationEmail({ user, url }: { user: { email: string }; url: string }): Promise<void> {
  return sendTransactionalEmail({
    to: user.email,
    subject: 'Cumulate App — Verify your email address',
    text: `Confirm that this address belongs to your Cumulate App account by opening this link (valid for 1 hour):\n\n${url}\n\nIf you did not create an account, ignore this email.\n\nأكّد أن هذا البريد الإلكتروني يخص حسابك في Cumulate App بفتح الرابط أعلاه (صالح لمدة ساعة واحدة). إن لم تنشئ حسابًا فتجاهل هذه الرسالة.`,
  });
}

// The pinned auth library catches delivery rejections. Preserve the failure at the HTTP boundary.
export async function withEmailDeliveryStatus(handler: () => Promise<Response>): Promise<Response> {
  return delivery.run({ failed: false }, async () => {
    const response = await handler();
    if (delivery.getStore()?.failed) {
      return Response.json({ code: 'EMAIL_DELIVERY_FAILED', message: 'Verification email could not be delivered. Please retry later.' }, { status: 502 });
    }
    return response;
  });
}
