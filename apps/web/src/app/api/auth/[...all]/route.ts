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
/**
 * A backend failure (database down, wrong port, pool exhausted) must never reach the browser as a
 * generic 500 that the sign-in form would read as "wrong credentials". The handler's 5xx is turned
 * into an explicit 503 `SERVICE_UNAVAILABLE`, and the REAL cause is logged server-side: the probe
 * names the database target (host:port/db, never credentials) and the connection error code.
 * Credential failures are 401s from better-auth and pass through untouched.
 */
async function guardBackend(path: string, handler: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    await logBackendFailure(path, error);
    return serviceUnavailable();
  }
  if (response.status >= 500) {
    await logBackendFailure(path, null, response.status);
    return serviceUnavailable();
  }
  return response;
}

function serviceUnavailable(): Response {
  return Response.json(
    { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again shortly.' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}

async function logBackendFailure(path: string, error: unknown, status?: number): Promise<void> {
  try {
    const { probeDatabase } = await import('@qmulate/database');
    const probe = await probeDatabase();
    const cause = error instanceof Error ? error.message.split('\n')[0] : status !== undefined ? `handler returned ${status}` : String(error);
    if (!probe.ok) {
      console.error(`[auth] ${path}: backend failure — DATABASE UNREACHABLE at ${probe.target} (${probe.code ?? 'unknown'}). ${cause}`);
    } else {
      console.error(`[auth] ${path}: backend failure with the database reachable at ${probe.target}. ${cause}`);
    }
  } catch (probeError) {
    console.error(`[auth] ${path}: backend failure; the database probe itself failed:`, probeError instanceof Error ? probeError.message : probeError);
  }
}

export async function GET(request: Request): Promise<Response> {
  return guardBackend(new URL(request.url).pathname, () => toNextJsHandler(getAuth()).GET(request));
}

/** Endpoints whose whole purpose is to send an email: refused up front when no transport exists. */
const EMAIL_SENDING_PATHS = new Set([
  '/api/auth/two-factor/send-otp',
  '/api/auth/request-password-reset',
  '/api/auth/forget-password',
  '/api/auth/send-verification-email',
]);

export async function POST(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (EMAIL_SENDING_PATHS.has(path)) {
    if (!emailOtpConfigured()) {
      return Response.json({ code: 'EMAIL_NOT_CONFIGURED', message: 'Email delivery is not configured. Ask the administrator to configure SMTP.' }, { status: 503 });
    }
    return guardBackend(path, () => withEmailDeliveryStatus(() => toNextJsHandler(getAuth()).POST(request)));
  }
  return guardBackend(path, () => toNextJsHandler(getAuth()).POST(request));
}

/** Sessions and TOTP challenges are per-request state — never cache this route. */
export const dynamic = 'force-dynamic';
