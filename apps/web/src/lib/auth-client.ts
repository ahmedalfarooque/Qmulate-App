/**
 * The app's single import point for browser-side auth.
 *
 * Components import from `@/lib/auth-client`, never from `@qmulate/auth` — the latter is
 * the SERVER entry and drags the Prisma client and the server env schema into whatever
 * bundle touches it. The ESLint config enforces the boundary; this file is the sanctioned
 * crossing.
 */

export {
  authClient,
  dashboardPath,
  forgotPasswordPath,
  localeFromPathname,
  requestPasswordReset,
  resetPassword,
  resetPasswordPath,
  signIn,
  signInPath,
  signOut,
  signUp,
  signUpPath,
  twoFactor,
  twoFactorPath,
  useSession,
} from '@qmulate/auth/client';

export type { AuthClient } from '@qmulate/auth/client';
