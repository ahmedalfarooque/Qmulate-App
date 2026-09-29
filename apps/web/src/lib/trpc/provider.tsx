'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { createKernelLink, trpc } from './client';

import type { ReactNode } from 'react';

/**
 * The browser-side tRPC + React Query provider.
 *
 * Mounted by `app/[locale]/(app)/layout.tsx`, so it wraps every authenticated surface and nothing
 * else — the marketing route, the sign-in screens and the TOTP enrolment screen have no kernel to
 * talk to and must not carry the client.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BOTH CLIENTS ARE CREATED IN `useState`, NOT AT MODULE SCOPE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A module-scope `QueryClient` is shared by every request the Node process serves, so one user's
 * cached endowment rows would be handed to the next. The `useState` initialiser runs once per
 * mounted tree instead — per browser tab in the client, per render in SSR. This is the exact
 * mistake the request context is built to prevent on the server (one Prisma client per request,
 * grants baked in); the cache in front of it must obey the same rule.
 */
export function TrpcProvider({ children, locale }: { children: ReactNode; locale: string }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /**
             * ⚠ `retry: false` IS A CONTROL, NOT A PREFERENCE.
             *
             * React Query retries a failed query three times by default. Every retry of a refused
             * scoped procedure re-enters the ladder and writes ANOTHER `ACCESS_DENIED` audit event
             * (`recordProcedureDenial()` writes one per attempt, outside the transaction, by
             * design). So a single mis-scoped screen would put four identical denial rows into an
             * append-only ≥10-year table and make a genuine probing pattern indistinguishable from
             * a UI retry loop. A refusal is a DECISION; there is nothing to retry.
             */
            retry: false,
            /** Same reason: refocusing a tab is not a new authorization question. */
            refetchOnWindowFocus: false,
            /**
             * Grants are re-resolved server-side on every request, so a stale cache cannot widen
             * access — but it can show a figure that has since changed. Short and explicit.
             */
            staleTime: 30_000,
          },
          mutations: {
            /**
             * Never. A retried mutation is a SECOND attempt at a money movement or an approval;
             * `approvalFingerprint` and the one-open-request-per-subject index would reject the
             * duplicate, and an operator would be left reading two audit rows for one intent.
             */
            retry: false,
          },
        },
      }),
  );

  const [client] = useState(() => trpc.createClient({ links: [createKernelLink(locale)] }));

  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
