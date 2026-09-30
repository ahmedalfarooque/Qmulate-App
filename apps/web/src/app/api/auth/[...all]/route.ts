import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth, emailOtpConfigured, withEmailDeliveryStatus } from '@qmulate/auth';

/**
 * better-auth's catch-all handler.
 *
 * It lives OUTSIDE `app/[locale]/` on purpose: these are API endpoints, not pages, and a
 * locale prefix would break every SDK call. The next-intl middleware matcher excludes
 * `/api` so requests arrive here unredirected with their bodies intact (AC-E0-8).
 *
 * The handler is resolved per request rather than at module scope: constructing better-auth
 * reads `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` through the fail-fast env schema, and
 * `next build` evaluates this module while collecting route metadata — a production build must
 * not require runtime secrets. `getAuth()` memoises, so this is one property lookup per request.
 */
export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

/** Endpoints whose whole purpose is to send an email: refused up front when no transport exists. */
const EMAIL_SENDING_PATHS = new Set([
  '/api/auth/two-factor/send-otp',
  '/api/auth/request-password-reset',
  '/api/auth/forget-password',
  '/api/auth/send-verification-email',
]);

export async function POST(request: Request): Promise<Response> {
  if (EMAIL_SENDING_PATHS.has(new URL(request.url).pathname)) {
    if (!emailOtpConfigured()) {
      return Response.json({ code: 'EMAIL_NOT_CONFIGURED', message: 'Email delivery is not configured. Ask the administrator to configure SMTP.' }, { status: 503 });
    }
    return withEmailDeliveryStatus(() => toNextJsHandler(getAuth()).POST(request));
  }
  return toNextJsHandler(getAuth()).POST(request);
}

/** Sessions and TOTP challenges are per-request state — never cache this route. */
export const dynamic = 'force-dynamic';
