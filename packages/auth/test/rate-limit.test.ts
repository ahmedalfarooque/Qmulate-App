/**
 * THE AUTH RATE LIMITER, EXERCISED — for the first time in this repository.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE EXISTS, AND WHAT IT IS GUARDING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S7 moved the E2E harness onto a production build (the only measured fix for the `next dev`
 * self-restart flake) and the suite immediately started collecting `429`s. That is how this
 * repository learned that **better-auth's rate limiter had never been exercised by any test
 * here** — every test had always run in a mode where the inherited default left it OFF.
 *
 * The owner approved a **test-environment-only override that FAILS CLOSED**
 * (`docs/product/prd/S4-owner-decision-memo.md`, "S7 · E2E-vs-rate-limiter posture"). The
 * failure mode that matters is therefore NOT "the harness gets 429s" — that is loud and
 * self-announcing. It is **production silently unprotected**, which announces nothing at all.
 * So the tests below are weighted accordingly:
 *
 *   · the FAIL-CLOSED direction is asserted from four sides (absent, empty, one-condition-only,
 *     hostile boolean-ish values) and proven BEHAVIOURALLY with a real 429;
 *   · the happy path (both conditions ⇒ relaxed) gets one test, because a failure there stops
 *     the E2E job dead and cannot hide.
 *
 * ⚠ **THE ONE-CONDITION-ONLY CASE IS NOT A THEORETICAL COMPLETENESS TEST.** `deploy-staging` in
 * `.github/workflows/ci.yml` sets `DATA_CLASSIFICATION: fixture-only` deliberately, because
 * staging is not KSA-resident. A classification-only gate would therefore have switched the
 * limiter off on a DEPLOYED environment. `it('keeps the limiter ACTIVE on a fixture-only
 * DEPLOYED environment …')` is that scenario, and it is the test the `&&` mutation kills.
 *
 * ── WHY A REAL better-auth INSTANCE AND NOT AN OPTIONS SNAPSHOT ─────────────────────────────
 * Asserting `{ enabled: true }` proves we passed a flag, not that anything refuses a request.
 * These tests build a real instance over better-auth's own in-memory adapter and fire real
 * requests through `auth.handler`, so a better-auth upgrade that renames, reinterprets or
 * ignores the option turns this suite red instead of quietly disarming the control. It also
 * pins the measurement the posture module's header claims — see the `window`/`max` test.
 *
 * The instance needs no database and no environment: the memory adapter and literal test
 * values keep it a unit test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_RATE_LIMIT_TEST_OVERRIDE,
  EnvValidationError,
  resetEnvCacheForTests,
  serverEnvSchema,
} from '@qmulate/config/env';

import {
  AUTH_RATE_LIMIT_MAX_REQUESTS,
  AUTH_RATE_LIMIT_WINDOW_SECONDS,
  type AuthRateLimitPosture,
  authRateLimitOptions,
  authRateLimitPosture,
} from '../src/rate-limit';

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1 · THE DECISION — pure, every combination, fail-closed
 * ══════════════════════════════════════════════════════════════════════════════════════ */

describe('authRateLimitPosture — the fail-closed truth table', () => {
  it('ABSENT override ⇒ the limiter is ACTIVE (the default posture)', () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: undefined,
      dataClassification: 'fixture-only',
    });

    expect(posture.enabled).toBe(true);
    expect(posture.relaxedForTests).toBe(false);
  });

  it('override set AND fixture-only ⇒ relaxed (the harness path, and the only one)', () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      dataClassification: 'fixture-only',
    });

    expect(posture.enabled).toBe(false);
    expect(posture.relaxedForTests).toBe(true);
  });

  it('⚠ override set but classification is `production` ⇒ still ACTIVE', () => {
    // Real-data infrastructure cannot be relaxed by an environment variable, full stop.
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      dataClassification: 'production',
    });

    expect(posture.enabled).toBe(true);
    expect(posture.relaxedForTests).toBe(false);
  });

  it('fixture-only WITHOUT the override ⇒ still ACTIVE (staging must not lose the control)', () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: undefined,
      dataClassification: 'fixture-only',
    });

    expect(posture.enabled).toBe(true);
  });

  /**
   * Every value that a `Boolean(...)`, a `!== 'false'` or a case-insensitive comparison would
   * have got wrong. All of them must land on ACTIVE. The schema refuses most of them at boot
   * as well (section 2) — this is the second layer, because a decision function that trusts its
   * caller is one refactor away from being the only layer.
   */
  it.each([
    ['an empty string', ''],
    ['whitespace', '   '],
    ['the string "true"', 'true'],
    ['the string "false"', 'false'],
    ['the string "1"', '1'],
    ['the string "0"', '0'],
    ['"yes"', 'yes'],
    ['the token in the wrong case', 'DISABLED-FOR-TESTS'],
    ['the token with surrounding whitespace', ' disabled-for-tests '],
    ['a near-miss token', 'disable-for-tests'],
    ['the token plus a suffix', 'disabled-for-tests-really'],
  ])('%s does NOT relax the limiter', (_label, value) => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: value,
      dataClassification: 'fixture-only',
    });

    expect(posture.enabled).toBe(true);
    expect(posture.relaxedForTests).toBe(false);
  });

  it('states better-auth’s measured defaults rather than re-tuning them silently', () => {
    // 10 s / 100 are the values read out of better-auth 1.6.25's
    // `dist/context/create-context.mjs:172-173`. Restating them unchanged is deliberate: S7 made
    // the posture EXPLICIT and did not re-tune a security control inside a flake fix. If someone
    // changes these numbers, that is a decision — and this line is where it gets noticed.
    expect(AUTH_RATE_LIMIT_WINDOW_SECONDS).toBe(10);
    expect(AUTH_RATE_LIMIT_MAX_REQUESTS).toBe(100);

    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: undefined,
      dataClassification: 'fixture-only',
    });
    expect(posture.window).toBe(AUTH_RATE_LIMIT_WINDOW_SECONDS);
    expect(posture.max).toBe(AUTH_RATE_LIMIT_MAX_REQUESTS);
  });

  it('never reports `enabled` and `relaxedForTests` as agreeing', () => {
    // The two fields are one fact stated twice; a future edit that lets them disagree would let
    // a caller log "relaxed" while the limiter bites, or the reverse.
    for (const override of [undefined, AUTH_RATE_LIMIT_TEST_OVERRIDE, 'true']) {
      for (const classification of ['fixture-only', 'production']) {
        const posture = authRateLimitPosture({
          testOnlyDisableAuthRateLimit: override,
          dataClassification: classification,
        });
        expect(posture.enabled).toBe(!posture.relaxedForTests);
      }
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2 · THE SCHEMA — an unrecognised value stops the process, it is not interpreted
 * ══════════════════════════════════════════════════════════════════════════════════════ */

const VALID_SERVER_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://qmulate:qmulate@localhost:5432/qmulate_test?schema=public',
  DATA_CLASSIFICATION: 'fixture-only',
  BETTER_AUTH_SECRET: 'test-only-not-a-real-secret-0000000000000000',
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('TEST_ONLY_DISABLE_AUTH_RATE_LIMIT — declared and refused in the env schema', () => {
  it('parses to `undefined` when absent', () => {
    const result = serverEnvSchema.safeParse(VALID_SERVER_ENV);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT).toBeUndefined();
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '  '],
  ])('treats %s as ABSENT rather than invalid (CI/Railway spell "unset" as "")', (_l, value) => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: value,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT).toBeUndefined();
  });

  it('accepts the one legal token', () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: AUTH_RATE_LIMIT_TEST_OVERRIDE,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT).toBe(AUTH_RATE_LIMIT_TEST_OVERRIDE);
  });

  it.each([
    ['true', 'true'],
    ['1', '1'],
    ['false', 'false'],
    ['0', '0'],
    ['yes', 'yes'],
    ['the wrong case', 'DISABLED-FOR-TESTS'],
    ['an untrimmed token', ' disabled-for-tests '],
    ['a near-miss', 'disable-for-tests'],
  ])('REFUSES %s and names the variable', (_label, value) => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: value,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.error.flatten().fieldErrors)).toContain(
      'TEST_ONLY_DISABLE_AUTH_RATE_LIMIT',
    );
  });

  it('the refusal message says what the legal value is, and that absent means full limiting', () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: 'true',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const message =
      result.error.flatten().fieldErrors.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT?.join(' ') ?? '';
    expect(message).toContain(AUTH_RATE_LIMIT_TEST_OVERRIDE);
    expect(message).toMatch(/ABSENT/);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3 · THE WIRING — `authRateLimitOptions()` reads the VALIDATED environment
 * ══════════════════════════════════════════════════════════════════════════════════════ */

describe('authRateLimitOptions — through the real env schema', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // `parseOrExit` calls `process.exit` in a CLI context and a vitest worker IS one; stubbing
    // NEXT_RUNTIME forces the throwing branch. Same reasoning as packages/config's env suite.
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)}) reached — parseOrExit must throw in a test.`);
    });
  });

  afterEach(() => {
    resetEnvCacheForTests();
  });

  /** Stub a complete valid environment (CI's unit job carries only two of these) and re-parse. */
  function stubEnvironment(overrides: Record<string, string> = {}): void {
    for (const [name, value] of Object.entries({ ...VALID_SERVER_ENV, ...overrides })) {
      vi.stubEnv(name, value);
    }
    resetEnvCacheForTests();
  }

  it('is ACTIVE when the variable is absent from the process environment', () => {
    stubEnvironment({ TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: '' }); // '' == absent, by design

    expect(authRateLimitOptions().enabled).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('is ACTIVE with the override present but DATA_CLASSIFICATION=production', () => {
    stubEnvironment({
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      DATA_CLASSIFICATION: 'production',
      // ⊕ S12-4 (G-8 layer 1, extended): a production posture parses ONLY beside DATA_RESIDENCY=ksa —
      // without it the schema refuses to boot at all, which is a different (and earlier) refusal than
      // the one this test is about. CI caught this on the first run of the sprint branch.
      DATA_RESIDENCY: 'ksa',
    });

    expect(authRateLimitOptions().enabled).toBe(true);
  });

  it('is relaxed only with both conditions present', () => {
    stubEnvironment({
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      DATA_CLASSIFICATION: 'fixture-only',
    });

    expect(authRateLimitOptions()).toMatchObject({ enabled: false, relaxedForTests: true });
  });

  it('REFUSES TO BOOT on an unrecognised value rather than guessing', () => {
    stubEnvironment({ TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: 'true' });

    expect(() => authRateLimitOptions()).toThrow(EnvValidationError);
    // Names only, never values — the file's secret-hygiene rule.
    const printed = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printed).toContain('TEST_ONLY_DISABLE_AUTH_RATE_LIMIT');
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 4 · THE LIMITER ACTUALLY BITES — a real instance, real requests, a real 429
 * ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ EVERY TEST HERE NEEDS ITS OWN IP. better-auth's default rate-limit store is a
 * MODULE-LEVEL `Map` (`better-auth/dist/api/rate-limiter/index.mjs:6`) keyed by
 * `` `${ip}|${path}` `` — so it is shared by every instance in this vitest worker. Distinct
 * `x-forwarded-for` values give each test its own bucket; the header is trusted by default for
 * a SINGLE value (`@better-auth/core/dist/utils/ip.mjs:193-215`), which is also the reason
 * production IP resolution is a `TODO(surface)` in `src/rate-limit.ts`.
 */
function makeAuth(posture: AuthRateLimitPosture) {
  return betterAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
    }),
    baseURL: 'http://localhost:3000',
    // Not a credential: 32+ characters of obvious placeholder, same convention as the fixtures.
    secret: 'test-only-not-a-real-secret-0000000000000000',
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    rateLimit: { enabled: posture.enabled, window: posture.window, max: posture.max },
  });
}

/** Fire `count` sign-in attempts for an unknown user and return the status codes in order. */
async function signInStatuses(
  auth: ReturnType<typeof makeAuth>,
  ip: string,
  count: number,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < count; attempt++) {
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email: 'nobody@example.test', password: 'not-the-password' }),
      }),
    );
    statuses.push(response.status);
  }
  return statuses;
}

describe('the limiter, exercised', () => {
  it('REFUSES the 4th sign-in with 429 under the DEFAULT posture (override absent)', async () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: undefined,
      dataClassification: 'fixture-only',
    });

    const statuses = await signInStatuses(makeAuth(posture), '203.0.113.10', 5);

    // 401 = credentials refused (no such user) — the request reached the handler.
    // 429 = the limiter refused it before the handler. MEASURED: better-auth's built-in
    // `/sign-in*` rule is 3 per 10 s, which OVERRIDES our window/max entirely.
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('⚠ STILL REFUSES on a fixture-only DEPLOYED environment — override without classification', async () => {
    // THE STAGING CASE, and the reason two conditions are required. `deploy-staging` sets
    // DATA_CLASSIFICATION=fixture-only; if the override alone were enough, this instance would
    // serve unlimited sign-in attempts on a deployed environment.
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      dataClassification: 'production',
    });

    const statuses = await signInStatuses(makeAuth(posture), '203.0.113.11', 5);

    expect(statuses).toContain(429);
  });

  it('says WHY it refused, so a 429 in a log is never mistaken for a credentials failure', async () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: undefined,
      dataClassification: 'fixture-only',
    });
    const auth = makeAuth(posture);

    await signInStatuses(auth, '203.0.113.12', 3);
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.12' },
        body: JSON.stringify({ email: 'nobody@example.test', password: 'not-the-password' }),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toMatch(/Too many requests/i);
    // The retry hint is what a client needs in order to back off rather than hammer.
    expect(response.headers.get('X-Retry-After')).not.toBeNull();
  });

  it('serves the whole E2E-shaped burst without a 429 when BOTH conditions hold', async () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      dataClassification: 'fixture-only',
    });

    // The suite signs in ~74 times from one IP; 12 is enough to be 4× past the 3-per-10 s rule
    // that broke it, and keeps this a unit test.
    const statuses = await signInStatuses(makeAuth(posture), '203.0.113.13', 12);

    expect(statuses).toHaveLength(12);
    expect(statuses).not.toContain(429);
  });

  it('PROVES our window/max do not govern /sign-in — the built-in rule does', async () => {
    // This is the measurement `src/rate-limit.ts`'s header claims, taken here rather than
    // trusted: even with a deliberately absurd global allowance, the 4th sign-in is refused.
    // If a better-auth upgrade changes the built-in `/sign-in` rule, this test says so.
    const statuses = await signInStatuses(
      makeAuth({ enabled: true, window: 1, max: 100_000, relaxedForTests: false }),
      '203.0.113.14',
      4,
    );

    expect(statuses[3]).toBe(429);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 5 · THE POSTURE CANNOT BE ORPHANED — a source pin over `src/server.ts`
 * ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Everything above tests `src/rate-limit.ts`. None of it would notice if `buildAuth()` stopped
 * passing the result to `betterAuth` — the module would keep returning correct answers that
 * nothing consumed, which is the failure mode this repository has already met once (a property
 * whose generator could not reach the configuration it was asserting about; see R6-C1 in
 * CLAUDE.md). A source scan is used for the same reason `auth-plugins.test.ts` uses one:
 * constructing the real instance from `src/server.ts` needs a live Prisma client and the full
 * env, and the thing being asserted is a WIRING fact, which source can state.
 */
describe('src/server.ts wires the posture into better-auth', () => {
  const SERVER_SOURCE = readFileSync(
    fileURLToPath(new URL('../src/server.ts', import.meta.url)),
    'utf8',
  );
  /** Comments discuss `rateLimit` at length; only CODE counts. */
  const CODE = SERVER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('passes a `rateLimit` option at all', () => {
    expect(CODE, 'no `rateLimit:` in the betterAuth options — the posture is unwired').toMatch(
      /rateLimit:\s*\{/,
    );
  });

  it('takes it from authRateLimitOptions() rather than an inline literal', () => {
    // An inline `rateLimit: { enabled: true, … }` would pass the test above while bypassing the
    // doubly-gated decision entirely — including the fail-closed half.
    expect(CODE).toMatch(/authRateLimitOptions\(\)/);
  });

  it('does not smuggle in a NODE_ENV or CI condition', () => {
    // The whole point of S7's posture is that it does NOT depend on which shell launched the
    // process. `next start` preserves an already-set NODE_ENV (`next/dist/bin/next:68`), which is
    // how the inherited default came to be ON locally and OFF in CI for the same command.
    expect(
      CODE,
      'a NODE_ENV or CI condition appeared next to the rateLimit option. If that is deliberate, it ' +
        'is a security-policy change and needs the owner, not a passing test: the measured problem ' +
        'was that NODE_ENV made the same command limited locally and unlimited in CI.',
    ).not.toMatch(/rateLimit[\s\S]{0,200}?(NODE_ENV|process\.env\.CI)/);
  });
});
