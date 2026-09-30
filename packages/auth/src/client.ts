/**
 * packages/auth/src/client.ts — the browser-side better-auth client.
 *
 * Import this (or `apps/web/src/lib/auth-client`) from client components ONLY. It must
 * never pull in `./server`: that module imports the Prisma client and the *server* env
 * schema, and bundling either into the browser would both bloat and break the build.
 *
 * `baseURL` is deliberately omitted. better-auth defaults to the current origin, and the
 * handler is mounted same-origin at `/api/auth/**`. Reading `clientEnv` here would import
 * `@qmulate/config/env`, whose module graph also constructs the *server* schema — the
 * exact leak this file is meant to avoid.
 */

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // basePath defaults to '/api/auth', which is where the route handler is mounted.
  plugins: [
    twoFactorClient({
      /**
       * Where the server sends a user who authenticated with a password but still owes a
       * TOTP challenge. The locale prefix is prepended by the caller: the sign-in form
       * passes its own redirect, so this is only the fallback for direct SDK calls.
       */
      onTwoFactorRedirect() {
        if (typeof window === 'undefined') return;
        window.location.href = twoFactorPath(localeFromPathname(window.location.pathname));
      },
    }),
  ],
});

export const { signIn, signOut, signUp, useSession, twoFactor, requestPasswordReset, resetPassword } = authClient;

export type AuthClient = typeof authClient;

/* ── Small route helpers, so no component hard-codes an auth path ────────────────────── */

/** First path segment, when it is one of the supported locales. Falls back to `ar`. */
export function localeFromPathname(pathname: string): string {
  const [, first] = pathname.split('/');
  return first === 'ar' || first === 'en' ? first : 'ar';
}

export function signInPath(locale: string): string {
  return `/${locale}/sign-in`;
}

export function signUpPath(locale: string): string {
  return `/${locale}/sign-up`;
}

export function twoFactorPath(locale: string): string {
  return `/${locale}/two-factor`;
}

export function forgotPasswordPath(locale: string): string {
  return `/${locale}/forgot-password`;
}

export function resetPasswordPath(locale: string): string {
  return `/${locale}/reset-password`;
}

export function dashboardPath(locale: string): string {
  return `/${locale}/dashboard`;
}
