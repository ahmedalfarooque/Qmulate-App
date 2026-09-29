import { headers } from 'next/headers';

import { appRouter, createContext, createCallerFactory } from '@qmulate/api';

/**
 * The SERVER-side caller: a server component invoking a procedure in-process, with no HTTP hop.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * SERVER-ONLY, ENFORCED BY `next/headers`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * There is no `server-only` package in this workspace, so the guard is structural: `next/headers`
 * throws if it is imported into a client component, which makes accidentally pulling this module —
 * and with it Prisma, the audit hash chain and the force-filter — into the browser bundle a loud
 * build error rather than a silent 2 MB regression.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A DIRECT CALLER RATHER THAN AN HTTP CALL TO OUR OWN ROUTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A server component fetching `/api/trpc` would have to re-forward the session cookie by hand,
 * double the latency, and — the part that matters — reconstruct the request context from a request
 * it synthesised. `createCallerFactory` runs THE SAME router with THE SAME middleware chain
 * (`router-introspection.test.ts` walks that chain), so the ladder's guards apply identically. The
 * only difference is that tRPC's `errorFormatter` does not run in-process, which is why
 * {@link kernelMessageKey} reads `messageKey` off `error.cause` as well as off `error.data`.
 *
 * ⚠ ONE CALLER PER REQUEST, NEVER MEMOISED ACROSS REQUESTS. The context bakes the caller's ACTIVE
 * grants into a Prisma client (§10 §7.1 — re-evaluated on every request, no cached
 * "logged-in = authorized" state), so a module-scope caller would hand one user another user's
 * visibility. `createCaller` below is the FACTORY — safe at module scope — and it is invoked per
 * call site.
 */

/** Bound once: this is a pure factory over the router, with no request state in it. */
const createCaller = createCallerFactory(appRouter);

/**
 * A caller for the CURRENT request, built from the current request's headers.
 *
 * @param locale the route segment's locale, passed through so a refusal and the audit event agree
 *   with the language the caller is reading. `createContext` validates it via `isLocale()` and
 *   falls back to Arabic, so an unexpected segment cannot widen anything.
 */
export async function getServerCaller(locale?: string) {
  const requestHeaders = await headers();
  const context = await createContext({
    headers: requestHeaders,
    ...(locale !== undefined ? { locale } : {}),
  });
  return createCaller(context);
}

/** The caller's shape, for annotating a server component's local variable. */
export type ServerCaller = Awaited<ReturnType<typeof getServerCaller>>;
