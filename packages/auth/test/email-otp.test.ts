import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { SMTP_HOST: 'smtp.example.test', SMTP_PORT: 587, SMTP_USER: 'sender', SMTP_PASSWORD: 'test-only', SMTP_FROM: 'sender@example.test' },
  sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn(),
}));
vi.mock('@qmulate/config/env', () => ({ serverEnv: mocks.env }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));
import { emailOtpConfigured, sendEmailOtp, withEmailDeliveryStatus } from '../src/email-otp.js';

describe('email MFA delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.SMTP_HOST = 'smtp.example.test';
    mocks.env.SMTP_PORT = 587;
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
    mocks.sendMail.mockResolvedValue({ accepted: ['recipient@example.test'], rejected: [] });
  });
  it('refuses missing sender configuration without making a connection', () => {
    mocks.env.SMTP_HOST = '';
    expect(emailOtpConfigured()).toBe(false);
    expect(() => sendEmailOtp({ user: { email: 'recipient@example.test' }, otp: '123456' })).toThrow('not configured');
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
  it('requires TLS and sends only to the authenticated user', async () => {
    await sendEmailOtp({ user: { email: 'recipient@example.test' }, otp: '123456' });
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, secure: false, logger: false, debug: false }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'recipient@example.test', text: expect.stringContaining('123456') }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('reports a failure even when the auth library swallows the rejection', async () => {
    mocks.sendMail.mockRejectedValue(new Error('sensitive SMTP response'));
    const response = await withEmailDeliveryStatus(async () => {
      await sendEmailOtp({ user: { email: 'recipient@example.test' }, otp: '123456' }).catch(() => {});
      return Response.json({ status: true });
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('sensitive SMTP response');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('rejects an unaccepted recipient', async () => {
    mocks.sendMail.mockResolvedValue({ accepted: [], rejected: ['recipient@example.test'] });
    await expect(sendEmailOtp({ user: { email: 'recipient@example.test' }, otp: '123456' })).rejects.toThrow('could not be delivered');
  });
  it('preserves successful responses and isolates request failure state', async () => {
    const response = await withEmailDeliveryStatus(async () => Response.json({ status: true }));
    expect(response.status).toBe(200);
  });
});
