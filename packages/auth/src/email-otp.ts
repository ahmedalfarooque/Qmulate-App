import { AsyncLocalStorage } from 'node:async_hooks';
import nodemailer from 'nodemailer';
import { serverEnv } from '@qmulate/config/env';

const delivery = new AsyncLocalStorage<{ failed: boolean }>();

export function emailOtpConfigured(): boolean {
  return Boolean(serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASSWORD && serverEnv.SMTP_FROM);
}

export function sendEmailOtp({ user, otp }: { user: { email: string }; otp: string }): Promise<void> {
  if (!emailOtpConfigured()) throw new Error('Email verification delivery is not configured.');
  const transport = nodemailer.createTransport({
    host: serverEnv.SMTP_HOST,
    port: serverEnv.SMTP_PORT,
    secure: serverEnv.SMTP_PORT === 465,
    requireTLS: serverEnv.SMTP_PORT !== 465,
    auth: { user: serverEnv.SMTP_USER, pass: serverEnv.SMTP_PASSWORD },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  return transport.sendMail({
    from: serverEnv.SMTP_FROM,
    to: user.email,
    subject: 'QMULATE verification code',
    text: `Your QMULATE verification code is ${otp}. It expires in 5 minutes. Do not share this code.`,
  }).then((result) => {
    if (!result.accepted.length || result.rejected.length) throw new Error('Email delivery rejected.');
  }).catch(() => {
    const state = delivery.getStore();
    if (state) state.failed = true;
    throw new Error('Verification email could not be delivered.');
  }).finally(() => transport.close());
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
