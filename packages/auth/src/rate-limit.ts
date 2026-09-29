/**
 * packages/auth/src/rate-limit.ts — THE AUTH RATE-LIMIT POSTURE, STATED IN CODE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Until S7, `betterAuth({ … })` passed **no `rateLimit` option at all**, so QMULATE's auth
 * rate-limit posture was whatever better-auth's defaults happened to be on the day — and
 * nobody in this repository had ever read them, let alone reviewed them. That was found the
 * way these things are found: the E2E harness was moved to a production build to kill the
 * `next dev` self-restart flake, and the suite started collecting `429 Too many requests`.
 *
 * The owner approved the fix (`docs/product/prd/S4-owner-decision-memo.md`, **S7 ·
 * E2E-vs-rate-limiter posture**, 2026-08-19): an explicit posture, plus a
 * **test-environment-only override that FAILS CLOSED**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE INSTALLED DEFAULT, MEASURED — better-auth 1.6.25, read out of node_modules
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every figure below was read from the installed package (or observed by running it), not from
 * documentation or memory:
 *
 * | fact | value | where |
 * |---|---|---|
 * | `enabled` default | `isProduction` | `dist/context/create-context.mjs:171` |
 * | `isProduction` | `nodeENV === 'production'`, captured **at module load** | `@better-auth/core/dist/env/env-impl.mjs:30-32` |
 * | `window` default | **10 seconds** | `dist/context/create-context.mjs:172` |
 * | `max` default | **100** per window | `dist/context/create-context.mjs:173` |
 * | `storage` default | `'memory'` — a MODULE-LEVEL `Map` | `dist/api/rate-limiter/index.mjs:6`, `:234-270` |
 * | bucket key | `` `${ip}|${path}` `` | `@better-auth/core/dist/utils/ip.mjs:226` |
 *
 * **The default store is in-memory and therefore PER PROCESS.** It resets on every restart and
 * is not shared between instances, so on a multi-instance deployment the effective limit is
 * `max × instances`. That is a property of the default, not a choice made here; it is recorded
 * in the pre-production security items rather than fixed in a flake change.
 *
 * ⚠ **AND `window`/`max` DO NOT GOVERN THE PATHS THAT ACTUALLY MATTER.** better-auth applies
 * stricter BUILT-IN rules that overwrite both, and they are the ones the E2E suite hit
 * (`dist/api/rate-limiter/index.mjs:370-383`, plus each plugin's own list):
 *
 *   · `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*`  →  **3 per 10 s**
 *   · `/request-password-reset`, `/forget-password*`, `/send-verification-email` → 3 per 60 s
 *   · `/two-factor/*` (from the twoFactor plugin) → **3 per 10 s** (`dist/plugins/two-factor/index.mjs:314-320`)
 *
 * MEASURED, against a real instance with `{ enabled: true, window: 10, max: 100 }`: six POSTs
 * to `/api/auth/sign-in/email` from one IP returned **`401, 401, 401, 429, 429, 429`** — the
 * fourth request is refused by the *special* rule, nowhere near `max: 100`. With
 * `{ enabled: false }` the same twelve requests all returned 401 and never 429. Those two
 * measurements are now `test/rate-limit.test.ts`, so they are re-taken on every run rather
 * than trusted from this comment.
 *
 * ⚠ **THESE NUMBERS ARE NOT A SAUDI STATUTORY FIGURE and carry no staleness marker** (binding
 * rule 3 is about regulatory figures; this is a security control). They ARE, however,
 * better-auth's defaults rather than a reviewed QMULATE policy — see the `TODO(surface)`
 * below. Restating them unchanged is deliberate: this change makes the posture EXPLICIT
 * without silently re-tuning a security control in a flake fix.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY `enabled` IS NOT DERIVED FROM `NODE_ENV` ANY MORE — the measurement that decided it
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MEASURED, on the installed better-auth: the inherited default resolves to
 * `enabled: true` under `NODE_ENV=production` and **`enabled: false` under both `test` and
 * `development`**. MEASURED, in `next/dist/bin/next:68`:
 *
 *     process.env.NODE_ENV = process.env.NODE_ENV || defaultEnv;
 *
 * `next start` therefore **does not overwrite an NODE_ENV that is already set** — and
 * `.github/workflows/ci.yml`'s E2E job sets `NODE_ENV: test`. So the inherited posture was
 * **ON when a developer ran `next start` locally (no NODE_ENV in the shell ⇒ `production`) and
 * OFF for the very same command in CI**. A security control whose state depends on which
 * shell launched it is not a posture; it is an accident with two outcomes. Stating
 * `enabled` explicitly removes the variable from the question.
 *
 * Consequence, stated plainly rather than buried: **the limiter is now ON in development and
 * in `NODE_ENV=test` too**, where the inherited default left it off. That is a deliberate
 * tightening in the safe direction — it is also the only reason the suite in
 * `test/rate-limit.test.ts` can exercise the limiter at all, and "never exercised by any test"
 * is exactly what this file was written to end.
 *
 * TODO(surface): SECURITY — `window`/`max` are better-auth's defaults, not a QMULATE decision,
 * and the built-in `3 per 10 s` on `/sign-in` is stricter than anything we chose. Two questions
 * for the owner before production: (1) are those the numbers we want for a Nazir operations
 * surface, and (2) **IP RESOLUTION IS UNCONFIGURED**, which decides whether the limit is per-client
 * or global. `getIp()` trusts `x-forwarded-for` only when it carries a SINGLE value, and only walks
 * a chain when `trustedProxies` is declared — neither is configured here
 * (`@better-auth/core/dist/utils/ip.mjs:193-215`). MEASURED, both halves:
 *
 *   · **Locally it works by accident of Next.** `next start` sets
 *     `req.headers['x-forwarded-for'] ??= socket.remoteAddress`
 *     (`next/dist/server/base-server.js:568`), so a direct request arrives with exactly one value
 *     and buckets per client. That is why the e2e runs show no IP warning.
 *   · **Behind a real proxy it degrades to ONE GLOBAL BUCKET.** With two hops in the header and no
 *     `trustedProxies`, `getIp()` returns `null` and better-auth logs "could not determine a client
 *     IP and is falling back to a single shared per-path bucket" — reproduced directly
 *     (`NODE_ENV=production`, no header ⇒ that warning, then `401,401,401,429,429`). At the
 *     built-in 3-per-10 s on `/sign-in`, one shared bucket is a self-inflicted outage rather than a
 *     control: every operator in the firm sharing three sign-in attempts per ten seconds.
 *
 * Neither is settled here — this change states the posture it inherited rather than re-tuning it,
 * and choosing Railway's trusted-proxy ranges is a deployment fact nobody in-repo has verified.
 */

import { AUTH_RATE_LIMIT_TEST_OVERRIDE, getServerEnv } from '@qmulate/config/env';

/**
 * The rolling window, in seconds, for the GLOBAL rule. better-auth's own default, restated
 * explicitly. Note the built-in per-path rules above override it on the auth-critical paths.
 */
export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 10;

/** Requests permitted per `AUTH_RATE_LIMIT_WINDOW_SECONDS`, per IP, per path. */
export const AUTH_RATE_LIMIT_MAX_REQUESTS = 100;

/** Exactly the subset of better-auth's `rateLimit` option this repo sets, plus why. */
export type AuthRateLimitPosture = {
  readonly enabled: boolean;
  readonly window: number;
  readonly max: number;
  /**
   * True only on the doubly-gated test path. Kept on the returned object so a caller (or a
   * test, or a boot log) can assert WHICH posture it got rather than inferring it from
   * `enabled`, and so "relaxed" can never be read as "misconfigured".
   */
  readonly relaxedForTests: boolean;
};

/**
 * The two facts the decision is made from. Passed IN rather than read from `process.env`, so
 * the decision function is pure and every combination is testable without a live environment.
 */
export type AuthRateLimitInputs = {
  /** The raw validated value of `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT`; `undefined` = absent. */
  readonly testOnlyDisableAuthRateLimit: string | undefined;
  /** The validated `DATA_CLASSIFICATION`. */
  readonly dataClassification: string;
};

/**
 * DECIDE THE POSTURE. **FAILS CLOSED, AND THE DIRECTION IS THE WHOLE POINT.**
 *
 * The limiter is relaxed if and only if BOTH of these hold:
 *
 *   1. `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` is exactly `AUTH_RATE_LIMIT_TEST_OVERRIDE`, and
 *   2. `DATA_CLASSIFICATION` is exactly `'fixture-only'`.
 *
 * Anything else — absent, empty, misspelt, a boolean-looking string, one condition without the
 * other — yields the FULL limiter. There is no `NODE_ENV` clause and no `CI` clause, because a
 * relaxation that can be reached by an environment nobody set is not a relaxation, it is a
 * hole.
 *
 * ⚠ **WHY BOTH CONDITIONS, since either alone looks sufficient:** `fixture-only` alone is NOT
 * safe, and the counter-example is in this repository — `.github/workflows/ci.yml`'s
 * `deploy-staging` job sets `DATA_CLASSIFICATION: fixture-only`, deliberately, because staging
 * is not KSA-resident. Gating on classification alone would therefore ship a DEPLOYED
 * environment with its auth rate limiter switched off. And the override variable alone is not
 * safe either: it would then be one stray value away from doing the same thing on KSA-resident
 * production. Two independent facts, both required, one of them impossible on production data
 * by construction.
 *
 * ⚠ The `&&` below is mutation-pinned: `test/rate-limit.test.ts` fails if it becomes `||`.
 */
export function authRateLimitPosture(inputs: AuthRateLimitInputs): AuthRateLimitPosture {
  const overrideRequested = inputs.testOnlyDisableAuthRateLimit === AUTH_RATE_LIMIT_TEST_OVERRIDE;
  const fixtureOnlyData = inputs.dataClassification === 'fixture-only';

  const relaxedForTests = overrideRequested && fixtureOnlyData;

  return {
    enabled: !relaxedForTests,
    window: AUTH_RATE_LIMIT_WINDOW_SECONDS,
    max: AUTH_RATE_LIMIT_MAX_REQUESTS,
    relaxedForTests,
  };
}

/**
 * The posture for THIS process, read through the fail-fast env schema.
 *
 * Called from `buildAuth()`, i.e. lazily — reading the env at module scope would make
 * `next build` demand runtime secrets just to collect route metadata (the same reason
 * `getAuth()` is lazy).
 */
export function authRateLimitOptions(): AuthRateLimitPosture {
  const env = getServerEnv();
  return authRateLimitPosture({
    testOnlyDisableAuthRateLimit: env.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT,
    dataClassification: env.DATA_CLASSIFICATION,
  });
}
