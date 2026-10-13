/**
 * PASSWORD-ONLY SIGN-IN (owner decision, 2026-10-13) — pinned over the SOURCE.
 *
 * Routine sign-in and registration no longer require an OTP / TOTP challenge. Three things must stay
 * true or the decision silently turns into a hole, and each is a one-line edit away from breaking:
 *
 *  1. the sign-in hook clears the in-flight `twoFactorEnabled` flag (that is what stops better-auth's
 *     twoFactor plugin issuing a challenge) — and honours the explicit step-up header, so a person who
 *     WANTS a challenge can still get one;
 *  2. the auth gate has no enrolment condition any more — and nothing re-adds the withdrawn state;
 *  3. approve / sign step-up does not borrow the session's creation time as proof of a second factor.
 *     A password-only session asserted nothing, so the assertion is a separate record, bound to the
 *     session id, written only by a verify endpoint, and read fail-closed.
 *
 * It is a source scan for the reason `auth-plugins.test.ts` gives: `server.ts` constructs a Prisma
 * client at module scope and cannot be unit-tested in isolation. The behavioural proof is the local
 * and E2E journey (`apps/web/e2e/auth-journey.spec.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/server.ts', import.meta.url)), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function between(start: string, end: string): string {
  const from = CODE.indexOf(start);
  expect(from, `\`${start}\` not found in server.ts`).toBeGreaterThanOrEqual(0);
  const to = CODE.indexOf(end, from + start.length);
  expect(to, `\`${end}\` not found after \`${start}\``).toBeGreaterThan(from);
  return CODE.slice(from, to);
}

describe('password-only sign-in', () => {
  it('the sign-in hook clears the in-flight twoFactorEnabled flag, except on an explicit step-up', () => {
    expect(CODE).toMatch(/ctx\.path !== '\/sign-in\/email'/);
    expect(CODE).toMatch(/if \(isStepUpRequest\(ctx\)\) return;/);
    expect(CODE).toMatch(/\.twoFactorEnabled = false;/);
    // The step-up header is the ONLY thing that can keep the challenge, and it only asks for more.
    expect(CODE).toMatch(/headers\?\.get\(STEP_UP_HEADER\) === 'totp'/);
  });

  it('never touches the stored enrolment: no write to the twoFactor table or the user flag at sign-in', () => {
    const hooks = between("if (ctx.path !== '/sign-in/email') return;", 'plugins: [');
    expect(hooks).not.toMatch(/twoFactor\.(update|delete|deleteMany|create)/);
    expect(hooks).not.toMatch(/user\.(update|updateMany)/);
  });

  it('the auth gate has no second-factor state', () => {
    const gateType = between('export type AuthGate =', 'export function accountStatusOf');
    expect(gateType).not.toMatch(/totp-enrolment-required/);
    const gate = between('export async function evaluateAuthGate', 'return { status:');
    expect(gate).not.toMatch(/hasTotpEnrolled|userRequiresTotpEnrolment|isDevAdminExempt/);
  });
});

describe('step-up assertion', () => {
  it('is recorded only by the verify endpoints, keyed to the session', () => {
    const paths = between('const ASSERTION_PATHS', 'const STEP_UP_HEADER');
    expect(CODE).toMatch(/const TOTP_VERIFY_PATH = '\/two-factor\/verify-totp';/);
    expect(paths).toContain('TOTP_VERIFY_PATH');
    expect(paths).toContain('/two-factor/verify-otp');
    expect(paths).toContain('/two-factor/verify-backup-code');
    expect(paths).not.toMatch(/sign-in/);
    expect(CODE).toMatch(/if \(ASSERTION_PATHS\.has\(ctx\.path\)\) await recordTotpAssertion\(ctx\);/);
    expect(CODE).toMatch(/`totp-asserted:\$\{sessionId\}`/);
  });

  it('is read fail-closed: expired, missing and unparsable records are null', () => {
    const read = between('export async function getTotpAssertedAt', 'const TOTP_REPLAY_TTL_MS');
    expect(read).toMatch(/expiresAt: \{ gt: new Date\(\) \}/);
    expect(read).toMatch(/if \(row === null\) return null;/);
    expect(read).toMatch(/Number\.isNaN\(at\.getTime\(\)\) \? null : at/);
    // It must not fall back to the session's own timestamps.
    expect(read).not.toMatch(/createdAt|updatedAt/);
  });
});
