import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createMiddleware(routing);

/**
 * The matcher is the load-bearing part (AC-E0-8).
 *
 * `/api/auth/**` is better-auth's handler. If the locale middleware touched it, every
 * sign-in POST would be 307-redirected to `/ar/api/auth/...`, the redirect would drop the
 * body, and authentication would fail in a way that looks like a credentials bug.
 *
 * Excluded: `/api` (all of it), `/_next`, `/_vercel`, `/monitoring`, and anything with a
 * file extension (static assets, favicon, fonts, the OpenAPI export).
 */
export const config = {
  matcher: ['/((?!api|_next|_vercel|monitoring|.*\\..*).*)'],
};
