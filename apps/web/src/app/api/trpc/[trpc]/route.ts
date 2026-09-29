import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter, createContext } from '@qmulate/api';

/**
 * The tRPC HTTP boundary — `/api/trpc/*`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY IT LIVES OUTSIDE `app/[locale]/`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Same reason as better-auth's handler next door: these are API endpoints, not pages, and a
 * locale prefix would break every client call. The next-intl middleware matcher
 * (`src/middleware.ts`) already excludes ALL of `/api`, so requests arrive here unredirected with
 * their bodies intact. ⚠ DO NOT WIDEN THAT MATCHER. If the locale middleware ever touched `/api`,
 * every mutation POST would be 307-redirected, the redirect would drop the body, and the failure
 * would look like a validation bug rather than a routing one (AC-E0-8 records the same lesson for
 * `/api/auth/**`).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CONTEXT IS BUILT ONCE PER REQUEST, FROM THE REQUEST'S OWN HEADERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `createContext()` re-resolves the caller's ACTIVE grants on every request and bakes them into a
 * fresh Prisma client (§10 §7.1: "evaluated on every request — no cached 'logged-in = authorized'
 * state"). So there is exactly one call, inside the handler, per HTTP request. A module-scope
 * context would hand one caller another caller's visibility — the grants are IN the client.
 *
 * Everything else about authorization happens in the ladder, not here. This file deliberately
 * contains no session check, no role lookup and no `waqfId` handling: a second, differently-worded
 * copy of the gate at the transport edge is how the two sides drift apart.
 */

/** Must match the `endpoint` the client's link is pointed at (`src/lib/trpc/client.ts`). */
const TRPC_ENDPOINT = '/api/trpc';

/**
 * The locale header the browser link sets.
 *
 * Read as a HINT, never as authority: `createContext` funnels it through `@qmulate/i18n`'s
 * `isLocale()` and falls back to the default (Arabic), so an absent or forged value changes the
 * language of a message and nothing else. It is here because the audit trail and any
 * server-rendered error copy need to know which language the caller is reading.
 */
const LOCALE_HEADER = 'x-qmulate-locale';

/**
 * Client IP for the audit trail's `context.ip`.
 *
 * `x-forwarded-for` is a comma-separated chain; the FIRST hop is the client. On Railway the proxy
 * sets it. `null` when absent — a fabricated value in an append-only, ≥10-year trail is worse than
 * an honest blank.
 */
function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first !== undefined && first !== '') return first;
  return headers.get('x-real-ip') ?? undefined;
}

function handler(request: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req: request,
    router: appRouter,
    createContext: ({ req }) => {
      // Read once each. The conditional spreads are `exactOptionalPropertyTypes` hygiene: an
      // explicit `undefined` is not the same as an absent field, and `CreateContextOptions`
      // declares these optional rather than nullable.
      const locale = req.headers.get(LOCALE_HEADER);
      const ipAddress = clientIpFrom(req.headers);
      const userAgent = req.headers.get('user-agent');

      return createContext({
        headers: req.headers,
        ...(locale !== null ? { locale } : {}),
        ...(ipAddress !== undefined ? { ipAddress } : {}),
        ...(userAgent !== null ? { userAgent } : {}),
      });
    },

    /**
     * ⚠ WHAT IS LOGGED, AND WHAT IS NOT.
     *
     * The path and the tRPC status code, nothing else. NOT the input (a distribution payload
     * carries beneficiary detail), NOT `error.message` (the ladder's developer messages quote the
     * requested `waqfId` and the refused permission, and a log line naming an endowment a caller
     * may not see re-discloses exactly what `NO_GRANT → NOT_FOUND` exists to withhold), and NOT
     * the session. The AUDIT trail is the record of a refusal — `recordProcedureDenial()` writes
     * it inside `@qmulate/api`; this hook is operator telemetry only.
     */
    onError({ error, path, type }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // A 500 is a server bug (an unaudited write, a bulk op on an audited model, money as a
        // float). It is the one case where the stack is worth having, and it is never a refusal.
        console.error(`[trpc] ${type} ${path ?? '<no path>'} failed: ${error.code}`, error.cause);
        return;
      }
      console.warn(`[trpc] ${type} ${path ?? '<no path>'} refused: ${error.code}`);
    },
  });
}

export { handler as GET, handler as POST };

/**
 * Node, not Edge: the ladder resolves grants through Prisma, and the audit extension's hash chain
 * needs `node:crypto`. Sessions and grants are per-request state, so nothing here may be cached.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
