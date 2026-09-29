import { createHmac } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
} from '@playwright/test';

/**
 * Makes every account this suite REGISTERS unique across RUNS, not merely across projects and
 * retries.
 *
 * ⚠ MEASURED (S4/E3 final gate): with `(project, retry)` alone, `apps/web/e2e` was green EXACTLY
 * ONCE per database — 64 passed on a pristine one, 4 failed on a second run against the same one, in
 * both locales, because the registered account survives the run that created it. CI is structurally
 * blind to it (fresh database every time), which is how it lasted. Overridable via
 * `QM_E2E_RUN_NONCE` so a debugging session can pin an identity deliberately.
 */
const E2E_RUN_NONCE = process.env.QM_E2E_RUN_NONCE ?? String(Date.now());

/**
 * AC-E0-7 — the full authentication journey, end to end:
 *
 *     register → TOTP enrolment required → enrol → verify → signed in
 *     …then a FRESH sign-in is blocked until the TOTP challenge passes.
 *
 * ⚠ WHY THIS FILE EXISTS. Sprint 1 shipped with this journey proven only BY HAND. Every
 * automated check stopped at the sign-in form's markup (`auth.spec.ts` says so in its own
 * header), so a regression anywhere in the protocol — enrolment silently failing, or worse,
 * the second factor quietly ceasing to gate access — would have sailed through CI green.
 * Sprint 1 had already hit two live faults on this exact path (a `TwoFactor` model missing the
 * columns better-auth writes, and a seeded admin who could neither sign up nor sign in), and
 * neither was caught by a test.
 *
 * It lives in the E2E job, not the Vitest integration suite, because it needs a running Next
 * server AND a migrated, seeded Postgres — the E2E job already provides both.
 *
 * ── Two structural decisions, both learned the hard way ──────────────────────────────────
 *
 * 1. **One `BrowserContext` per journey, and API calls go through `context.request`.** The
 *    default `request` fixture is a SEPARATE cookie jar from `page`, and both are recreated
 *    per test — so a journey split across several `test()` blocks silently loses its session
 *    between them and fails for a reason that has nothing to do with auth. A journey is one
 *    test.
 * 2. **The protocol is driven over HTTP; only the gate is checked in the browser.** This test
 *    is about the auth protocol and whether it actually blocks access. Filling three screens
 *    of forms would make it fail for styling reasons and obscure what broke. `auth.spec.ts`
 *    covers the screens; the page navigations here answer the one question markup cannot:
 *    "can this session reach the app?"
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30s) — matching `totpOptions` in
 * `packages/auth`. Written out rather than pulled from a dependency so that a change to the
 * app's TOTP parameters shows up here as a failure instead of being silently absorbed.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`not base32: ${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string, atSeconds = Math.floor(Date.now() / 1000)): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atSeconds / 30)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();

  // RFC 4226 §5.4 dynamic truncation. `readUInt8`/`readUInt32BE` rather than indexing: they are
  // bounds-checked at runtime and, unlike `digest[i]!`, need no non-null assertion to satisfy
  // `noUncheckedIndexedAccess`.
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/** The secret carried in better-auth's `otpauth://` enrolment URI. */
function secretFromTotpUri(uri: unknown): string {
  if (typeof uri !== 'string') throw new Error(`no totpURI returned (got ${typeof uri})`);
  const secret = new URL(uri).searchParams.get('secret');
  if (secret === null || secret === '') throw new Error(`no secret in totpURI: ${uri}`);
  return secret;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/** Published in `packages/database/src/seed/map.ts`; the seed prints it. Not a secret. */
const SEEDED_ADMIN = { email: 'admin@example.test', password: 'fixture-only-not-a-secret-9271' };

/** A seeded operator who HOLDS a TOTP-required role (NAZIR grant on all four endowments). */
const SEEDED_NAZIR = { email: 'nazir@example.test', password: SEEDED_ADMIN.password };

const NEW_USER_PASSWORD = 'fixture-only-e2e-password-9271';

/** Mirrors `playwright.config.ts`. better-auth needs it as an explicit `Origin` — see `post`. */
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`;

async function post(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  // better-auth enforces an Origin check on state-changing endpoints (CSRF). A browser sets
  // that header itself; `APIRequestContext` does not, so without this every enrolment call
  // comes back 403 MISSING_OR_NULL_ORIGIN — a test artefact that looks exactly like an auth bug.
  const response = await request.post(`/api/auth${path}`, {
    data,
    headers: { origin: BASE_URL },
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    /* an empty or non-JSON body is meaningful on its own; the status carries the assertion */
  }
  return { status: response.status(), body };
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A GET THAT SURVIVES ONE TRANSPORT FAULT — AND NOTHING ELSE
 *
 * ⚠ NOT A RETRY OF AN ASSERTION. MEASURED IN CI (run `31969864722`,
 * `[ar] endowment-journey.spec.ts:898`): `apiRequestContext.get: socket hang up`, 22 ms, on the
 * pre-flight `GET /api/auth/get-session` — before the test touched a screen — and reproduced here
 * by FAULT INJECTION. The dev server answers `Keep-Alive: timeout=5` and closes an idle socket at
 * 6.00 s (measured), while `next dev` blocks for seconds compiling routes on demand (same CI run:
 * `deed` 5008 ms, `reserved-matters` 6164 ms, `/api/trpc` 7584 ms), so a connection can die between
 * "written" and "answered". A transport fault has no status and no body: it says nothing about the
 * product, and failing on it dressed a closed socket as a failed authorization check.
 *
 * ONE re-attempt, only when the call THREW (an answered 4xx/5xx is a RESULT and is returned
 * untouched, so no refusal can be hidden here), only for the named faults, and the second failure
 * names both causes so a server that is genuinely gone still fails at once. This helper is
 * DUPLICATED per spec on purpose — the same reason the TOTP generator is (see each file's header):
 * a change to the rule must redden every file, not be absorbed by one shared import.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

const TRANSPORT_FAULT =
  /socket hang up|ECONNRESET|EPIPE|socket disconnected|connection closed|connection was reset/i;

async function getSurvivingOneTransportFault(
  request: APIRequestContext,
  url: string,
  options?: { maxRedirects?: number },
): Promise<APIResponse> {
  try {
    return await request.get(url, options);
  } catch (first) {
    if (!TRANSPORT_FAULT.test(String(first))) throw first;
    console.log(`[e2e][transport] GET ${url} — ${String(first).slice(0, 120)} · ONE re-attempt`);
    await new Promise((done) => setTimeout(done, 250));
    try {
      return await request.get(url, options);
    } catch (second) {
      throw new Error(
        `GET ${url} failed at the TRANSPORT level TWICE — no status, no body, so this is not a ` +
          `statement about the product: the server is unreachable or is closing connections. ` +
          `first: ${String(first)} · second: ${String(second)}`,
      );
    }
  }
}

async function sessionUser(
  request: APIRequestContext,
): Promise<Record<string, unknown> | undefined> {
  const response = await getSurvivingOneTransportFault(request, '/api/auth/get-session');
  if (!response.ok()) return undefined;
  const body = (await response.json()) as { user?: Record<string, unknown> } | null;
  return body?.user ?? undefined;
}

/** Where a navigation to `path` actually ends up, after any server-side redirect. */
async function landsOn(context: BrowserContext, path: string): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(path);
    return new URL(page.url()).pathname;
  } finally {
    await page.close();
  }
}

function localeFor(projectName: string): 'ar' | 'en' {
  return projectName === 'ar' ? 'ar' : 'en';
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1. A NEW registration walks the whole journey.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

// ⚠ EXTENDED TIMEOUT, and the reason is a real property of the system rather than a slow machine.
//
// This is the longest audited path in the suite: a registration, a credential-account write, a TOTP
// enrolment and a sign-in, each of which is a material write and therefore each of which opens an
// audited transaction. Since S2 round 2 the audit hash chain takes its advisory lock EAGERLY, at
// transaction start rather than on first append — the fix for a 40P01 deadlock that killed 14 of 16
// concurrent audited transactions — so audited transactions are now fully SERIALIZED. The
// concurrency level was already 1; what grew is the hold duration, and this spec is where that shows.
//
// It timed out at the default 30s twice on a developer machine (passing on re-run and in isolation
// both times), which is a flaky gate on a security-critical suite, not a passing one. Raised rather
// than retried into looking green: CI's `retries: 1` would have masked it.
test.setTimeout(90_000);

test('AC-E0-7 · register → TOTP enrolment gate → enrol → sign in is challenged', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);

  // Both Playwright projects run against ONE database, and a retry re-runs this whole test —
  // so the identity is unique per (project, attempt). A fixed address would collide and fail
  // as USER_ALREADY_EXISTS, which looks like an auth bug and is not one.
  //
  // ⚠ AND UNIQUE PER RUN, WHICH (project, attempt) ALONE IS NOT. MEASURED in the S4/E3 final gate:
  // this suite was green EXACTLY ONCE per database — 64 passed on a pristine one, 4 failed on a
  // second run against the same one, in both locales — because the address repeats across runs while
  // the account it created does not go away. CI never sees it (a fresh database every run), which is
  // precisely why it survived: it is the V-E3-04 defect class in the one tree that had not been
  // audited for it, and the THIRD surface this sprint where "green" meant "green once".
  const email = `e2e.journey.${testInfo.project.name}.${testInfo.retry}.${E2E_RUN_NONCE}@example.test`;

  const context = await browser.newContext();
  const request = context.request; // shares its cookie jar with pages in this context
  try {
    // ── register ────────────────────────────────────────────────────────────────────────
    const signUp = await post(request, '/sign-up/email', {
      name: 'E2E Journey User (fixture)',
      email,
      password: NEW_USER_PASSWORD,
    });
    expect(signUp.status, `sign-up failed: ${JSON.stringify(signUp.body)}`).toBe(200);

    const afterSignUp = await sessionUser(request);
    expect(afterSignUp, 'sign-up should establish a session').toBeDefined();
    expect(afterSignUp?.twoFactorEnabled ?? false).toBe(false);

    // ── THE ENROLMENT GATE, for a brand-new ROLE-LESS account ───────────────────────────
    // Promoted from a characterization assertion to a real requirement by the 2026-07-27
    // decision. Until then the gate was role-conditional, so a fresh account — which holds no
    // grant and no membership, hence no role — walked into the shell while the sign-up screen
    // promised it could not. The gate is now universal, so registration alone reaches nothing.
    expect(
      await landsOn(context, `/${locale}/dashboard`),
      'a registered but un-enrolled account reached the dashboard',
    ).toBe(`/${locale}/two-factor`);

    // ── enrol ───────────────────────────────────────────────────────────────────────────
    const enable = await post(request, '/two-factor/enable', { password: NEW_USER_PASSWORD });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);

    const secret = secretFromTotpUri(enable.body.totpURI);
    // The issuer is what the user sees in their authenticator app.
    expect(new URL(enable.body.totpURI as string).searchParams.get('issuer')).toBe('QMULATE');
    // Recovery codes matter: without them a lost device locks a Nazir out of a money role.
    const backupCodes = enable.body.backupCodes;
    expect(Array.isArray(backupCodes) ? backupCodes.length : 0).toBeGreaterThan(0);

    // A stale code must be refused — the factor has to be real, not decorative.
    const stale = totp(secret, Math.floor(Date.now() / 1000) - 3600);
    expect(
      (await post(request, '/two-factor/verify-totp', { code: stale })).status,
      'a TOTP code from an hour ago was accepted',
    ).not.toBe(200);

    // ── verify, completing enrolment ────────────────────────────────────────────────────
    const verify = await post(request, '/two-factor/verify-totp', { code: totp(secret) });
    expect(verify.status, `verification failed: ${JSON.stringify(verify.body)}`).toBe(200);
    expect((await sessionUser(request))?.twoFactorEnabled).toBe(true);

    // Enrolled: the dashboard is now reachable.
    expect(await landsOn(context, `/${locale}/dashboard`)).toBe(`/${locale}/dashboard`);

    // ── THE REGRESSION THAT MATTERS: the password alone is no longer enough ─────────────
    const fresh = await browser.newContext(); // clean cookie jar = a genuinely fresh sign-in
    try {
      const signIn = await post(fresh.request, '/sign-in/email', {
        email,
        password: NEW_USER_PASSWORD,
      });
      expect(signIn.status).toBe(200);
      expect(signIn.body.twoFactorRedirect, 'the password alone completed the sign-in').toBe(true);

      // Not merely a UI hint: there is no usable session…
      expect(await sessionUser(fresh.request)).toBeFalsy();
      // …and the app refuses the half-authenticated caller.
      expect(
        await landsOn(fresh, `/${locale}/dashboard`),
        'a caller owing a TOTP challenge reached the dashboard',
      ).not.toBe(`/${locale}/dashboard`);

      // Satisfy the challenge — and only now is the session real.
      const challenge = await post(fresh.request, '/two-factor/verify-totp', {
        code: totp(secret),
      });
      expect(challenge.status, `challenge failed: ${JSON.stringify(challenge.body)}`).toBe(200);
      expect((await sessionUser(fresh.request))?.email).toBe(email);
      expect(await landsOn(fresh, `/${locale}/dashboard`)).toBe(`/${locale}/dashboard`);
    } finally {
      await fresh.close();
    }
  } finally {
    await context.close();
  }
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2. The enrolment gate for an operator who HOLDS a TOTP-required role.
 *
 * Since the gate went universal (2026-07-27) this is no longer a *different* code path from the
 * role-less case above — both are gated by the same one-line condition. It is kept because it
 * covers a different subject: a seeded operator with real grants across all four endowments,
 * i.e. the seat NFR-06 was written for. If the gate ever regresses to being role-conditional,
 * the test above fails and this one still passes — which is precisely the asymmetry that let
 * the original hole through, so both are worth having.
 *
 * Idempotent: enrolment mutates a shared seeded row, so the second Playwright project — or a
 * retry — must not fail for the wrong reason.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('NFR-06 · an operator holding a TOTP-required role is gated until enrolled', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const context = await browser.newContext();
  const request = context.request;

  try {
    const signIn = await post(request, '/sign-in/email', SEEDED_NAZIR);
    expect(signIn.status, `seeded nazir cannot sign in: ${JSON.stringify(signIn.body)}`).toBe(200);

    if (signIn.body.twoFactorRedirect === true) {
      // Already enrolled by an earlier project/attempt: the challenge IS the gate.
      expect(await sessionUser(request)).toBeFalsy();
      expect(await landsOn(context, `/${locale}/dashboard`)).not.toBe(`/${locale}/dashboard`);
      return;
    }

    // Signed in, not yet enrolled, and holding a role that mandates TOTP…
    expect((await sessionUser(request))?.twoFactorEnabled ?? false).toBe(false);
    // …so the app must refuse them until they enrol. This is the assertion NFR-06 rests on.
    expect(
      await landsOn(context, `/${locale}/dashboard`),
      'an un-enrolled operator holding a TOTP-required role reached the dashboard',
    ).toBe(`/${locale}/two-factor`);

    const enable = await post(request, '/two-factor/enable', { password: SEEDED_NAZIR.password });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
    const secret = secretFromTotpUri(enable.body.totpURI);

    expect((await post(request, '/two-factor/verify-totp', { code: totp(secret) })).status).toBe(
      200,
    );

    // Enrolled — the gate opens.
    expect(await landsOn(context, `/${locale}/dashboard`)).toBe(`/${locale}/dashboard`);
  } finally {
    await context.close();
  }
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3. The literal E0 exit criterion: "a SEEDED admin can register, enrol TOTP, and log in."
 *
 * Kept separate because it exercises a different failure mode. Sprint 1 seeded a bare `user`
 * row with no credential `account`, which left the seeded admin unable to sign UP (better-auth
 * refuses an existing email) or sign IN (no password on file) — permanently locked out, with
 * the whole suite green. This asserts the seed produces a usable operator.
 *
 * Idempotent on purpose: enrolment mutates the shared seeded row, so a second project or a
 * retry would otherwise fail for the wrong reason. If the admin is already enrolled the test
 * skips straight to asserting the challenge, which is the part worth protecting.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E0 exit · the seeded admin is a usable, TOTP-gated account', async ({ browser }) => {
  const context = await browser.newContext();
  const request = context.request;
  try {
    const signIn = await post(request, '/sign-in/email', SEEDED_ADMIN);

    // A seeded operator who cannot sign in makes the E0 exit criterion unreachable — which is
    // exactly the state Sprint 1 shipped in before this was caught.
    expect(signIn.status, `the seeded admin cannot sign in: ${JSON.stringify(signIn.body)}`).toBe(
      200,
    );

    if (signIn.body.twoFactorRedirect === true) {
      // Already enrolled by an earlier project/attempt: the gate is the assertion.
      expect(await sessionUser(request)).toBeFalsy();
      return;
    }

    expect((await sessionUser(request))?.email).toBe(SEEDED_ADMIN.email);

    const enable = await post(request, '/two-factor/enable', { password: SEEDED_ADMIN.password });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
    const secret = secretFromTotpUri(enable.body.totpURI);

    expect((await post(request, '/two-factor/verify-totp', { code: totp(secret) })).status).toBe(
      200,
    );
    expect((await sessionUser(request))?.twoFactorEnabled).toBe(true);

    // From here on the seeded admin is TOTP-gated like any other account.
    const fresh = await browser.newContext();
    try {
      const again = await post(fresh.request, '/sign-in/email', SEEDED_ADMIN);
      expect(again.body.twoFactorRedirect).toBe(true);
      expect(await sessionUser(fresh.request)).toBeFalsy();
    } finally {
      await fresh.close();
    }
  } finally {
    await context.close();
  }
});
