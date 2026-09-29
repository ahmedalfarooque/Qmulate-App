/**
 * packages/auth/src/index.ts — the SERVER entry point for `@qmulate/auth`.
 *
 * `import { auth } from '@qmulate/auth'` gives you the better-auth instance, the session
 * gate, and the role catalogue. The browser client is a separate entry
 * (`@qmulate/auth/client`) on purpose — this one imports Prisma and the server env schema,
 * so it must never reach a client bundle.
 */

export * from './server';
export * from './rate-limit';
export * from './roles';
export * from './dev-admin';
export { emailOtpConfigured, withEmailDeliveryStatus } from './email-otp';
