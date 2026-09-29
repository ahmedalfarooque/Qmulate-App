import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
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
 * E2 · THE CROSS-CUTTING KERNEL, REACHED FROM A REAL BROWSER, IN BOTH LOCALES.
 *
 * What this file proves, and nothing more:
 *   1. the tRPC HTTP boundary (`/api/trpc/*`) is wired, unredirected by the locale middleware, and
 *      carries the better-auth session cookie — a `fetch` from inside the page reaches the router;
 *   2. an authenticated caller who holds NO grant is refused by a scoped procedure with tRPC
 *      `NOT_FOUND` — explicitly **not** `FORBIDDEN` (§10 §7.2: "do not disclose the endowment
 *      exists"), carrying `apiCode` + `messageKey` on `error.data`;
 *   3. that refusal RENDERS as the ar/en sentence from `packages/i18n` — the expected string is read
 *      OUT OF THE CATALOGUE at test time, never typed into this file — and the screen shows no
 *      machine code, no raw dotted key and no English developer message;
 *   4. a granted operator's scoped read succeeds over the same wire.
 *
 * ── WHAT IS DELIBERATELY *NOT* PROVEN HERE ────────────────────────────────────────────────────
 * Segregation of duties, the AML compartment, beneficiary self-isolation, the Setting resolver and
 * the thirteen-role approval sweep are proven behaviourally in `packages/api/test/*.integration.
 * test.ts`, against a real database with subjects that cannot be provisioned over HTTP (there is no
 * grant-issuing procedure, by design). Re-asserting them through a browser would be slower, flakier
 * and weaker. This file is about the TRANSPORT and the LOCALIZED SURFACE.
 *
 * ── TWO STRUCTURAL RULES INHERITED FROM `auth-journey.spec.ts` ─────────────────────────────────
 * 1. **One `BrowserContext` per journey; API calls go through `context.request`.** The default
 *    `request` fixture is a separate cookie jar, so a journey split across several `test()` blocks
 *    silently loses its session and fails for a reason unrelated to what is under test.
 * 2. **A brand-new identity per (project, retry).** Both Playwright projects run against ONE
 *    database and a retry re-runs the whole test; a fixed address collides as `USER_ALREADY_EXISTS`,
 *    which looks like an auth bug and is not one.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30s), matching `totpOptions` in
 * `packages/auth`.
 *
 * ⚠ DUPLICATED FROM `auth-journey.spec.ts` ON PURPOSE, TWICE OVER: a shared `e2e/_helpers.ts`
 * would be a module Playwright does not treat as a spec (fine), but the original file's own header
 * records why the generator is written out rather than imported from a dependency — "so that a
 * change to the app's TOTP parameters shows up here as a failure instead of being silently
 * absorbed". Two independent copies means a parameter change reddens two files, not zero.
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
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

function secretFromTotpUri(uri: unknown): string {
  if (typeof uri !== 'string') throw new Error(`no totpURI returned (got ${typeof uri})`);
  const secret = new URL(uri).searchParams.get('secret');
  if (secret === null || secret === '') throw new Error(`no secret in totpURI: ${uri}`);
  return secret;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Fixtures and helpers
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/** Published in `packages/database/src/seed/map.ts`; the seed prints it. Not a secret. */
const SEED_PASSWORD = 'fixture-only-not-a-secret-9271';

/**
 * The SECOND seeded `NAZIR` seat (`user-approver-001`), which holds `endowment:waqf:read` on all
 * four endowments.
 *
 * Chosen because no other spec touches it: `auth-journey.spec.ts` enrols `nazir@example.test` and
 * `admin@example.test`, and enrolment is a one-way door for a test (the TOTP secret is returned
 * exactly once, so a spec cannot recover it afterwards). Sharing a seat across files would make the
 * two suites order-dependent.
 */
const GRANTED_OPERATOR = { email: 'approver@example.test', password: SEED_PASSWORD };

/** The four seeded endowments, all owned by client-001. Same family; scope is still the endowment. */
const SEEDED_WAQF_IDS = ['waqf-001', 'waqf-002', 'waqf-003', 'waqf-004'] as const;

const NEW_USER_PASSWORD = 'fixture-only-e2e-kernel-9271';

/** Mirrors `playwright.config.ts`. better-auth needs an explicit `Origin` — see `post`. */
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`;

async function post(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  // better-auth enforces an Origin check on state-changing endpoints (CSRF). A browser sets the
  // header itself; `APIRequestContext` does not, and without it every call returns 403
  // MISSING_OR_NULL_ORIGIN — a test artefact that looks exactly like an auth bug.
  const response = await request.post(`/api/auth${path}`, { data, headers: { origin: BASE_URL } });
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

function localeFor(projectName: string): 'ar' | 'en' {
  return projectName === 'ar' ? 'ar' : 'en';
}

/**
 * The ar/en wording, READ FROM THE CATALOGUE.
 *
 * The whole point of the rendering assertions below is that the screen shows the catalogue's
 * sentence. Typing that sentence into this file would assert only that two copies of a string
 * match, and would go stale the first time a translator improves the wording.
 */
function catalogue(locale: 'ar' | 'en'): {
  notAuthorized: string;
  noGrant: string;
  generic: string;
} {
  const path = fileURLToPath(
    new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url),
  );
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    errors: { notAuthorized: string; generic: string; access: { NO_GRANT: string } };
  };
  return {
    notAuthorized: json.errors.notAuthorized,
    noGrant: json.errors.access.NO_GRANT,
    generic: json.errors.generic,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Calling the kernel FROM INSIDE THE PAGE
 * ────────────────────────────────────────────────────────────────────────────────────────── */

interface KernelResponse {
  readonly status: number;
  readonly result?: { readonly data?: unknown };
  readonly error?: {
    readonly message?: string;
    readonly data?: {
      readonly code?: string;
      readonly httpStatus?: number;
      readonly apiCode?: string | null;
      readonly messageKey?: string | null;
    };
  };
}

/**
 * Invokes a query through the REAL browser `fetch`, not Playwright's request fixture.
 *
 * That distinction is the assertion: it proves the page's own origin, its own cookie jar and the
 * un-widened middleware matcher all line up. A `context.request` call would pass even if the
 * browser could not reach the endpoint.
 *
 * The un-batched `?input=<json>` form is used rather than `httpBatchLink`'s `?batch=1&input={"0":…}`
 * so a failure reads as one procedure's refusal instead of a batch envelope.
 *
 * `locale` sets `x-qmulate-locale`, exactly as `createKernelLink()` does. Passing `undefined` OMITS
 * the header, which is a case worth exercising in its own right — see the assertion that the server
 * then falls back to ARABIC, the product default, and not to English.
 */
async function callKernel(
  page: Page,
  path: string,
  input?: unknown,
  locale?: string,
): Promise<KernelResponse> {
  const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return page.evaluate(
    async ({ url, localeHeader }: { url: string; localeHeader?: string }) => {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          ...(localeHeader === undefined ? {} : { 'x-qmulate-locale': localeHeader }),
        },
      });
      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = { error: { message: text.slice(0, 200) } };
      }
      return { status: response.status, ...parsed };
    },
    {
      url: `/api/trpc/${path}${query}`,
      ...(locale === undefined ? {} : { localeHeader: locale }),
    },
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1 · A fresh authenticated account: the kernel answers, every scoped read is refused, and the
 *     refusal is rendered in the caller's language.
 *
 * This subject is EXIT-1's shape — "an authenticated caller with a valid session, TOTP enrolled,
 * and no grant" — provisioned through the product's own registration flow rather than the seed, so
 * it cannot be perturbed by another spec and needs no cleanup.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E2 · a session is not an authorization: every scoped read is refused, in the caller’s language', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  const email = `e2e.kernel.${testInfo.project.name}.${testInfo.retry}.${E2E_RUN_NONCE}@example.test`;

  const context = await browser.newContext();
  const request = context.request; // shares its cookie jar with pages in this context
  const page = await context.newPage();

  try {
    // ── register, then satisfy the UNIVERSAL TOTP enrolment gate ─────────────────────────
    const signUp = await post(request, '/sign-up/email', {
      name: 'E2E Kernel User (fixture)',
      email,
      password: NEW_USER_PASSWORD,
    });
    expect(signUp.status, `sign-up failed: ${JSON.stringify(signUp.body)}`).toBe(200);

    const enable = await post(request, '/two-factor/enable', { password: NEW_USER_PASSWORD });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
    const secret = secretFromTotpUri(enable.body.totpURI);
    const verify = await post(request, '/two-factor/verify-totp', { code: totp(secret) });
    expect(verify.status, `verification failed: ${JSON.stringify(verify.body)}`).toBe(200);
    expect((await sessionUser(request))?.twoFactorEnabled).toBe(true);

    // The page must be on the app's origin before a relative `fetch` means anything.
    await page.goto(`/${locale}/dashboard`);

    // ── the kernel is REACHABLE from the browser ─────────────────────────────────────────
    const health = await callKernel(page, 'health', undefined, locale);
    expect(
      health.status,
      `the tRPC route did not answer — if this is a 307 the middleware matcher was widened to ` +
        `include /api, which also breaks every sign-in POST (AC-E0-8): ${JSON.stringify(health)}`,
    ).toBe(200);
    expect((health.result?.data as { status?: string } | undefined)?.status).toBe('ok');
    // The locale the client's link asserts is echoed back, so a mis-set header is visible.
    expect((health.result?.data as { locale?: string } | undefined)?.locale).toBe(locale);

    /**
     * ⚠ AND WITH NO HEADER AT ALL, THE ANSWER IS ARABIC — never English.
     *
     * `createContext` funnels the header through `@qmulate/i18n`'s `isLocale()` and falls back to
     * `defaultLocale`. That default is `'ar'` because Arabic is the PRODUCT default, not a
     * fallback: the financial record is statutorily Arabic (Nazarah Art. 15(2) — ⚠ unverified,
     * confirm vs primary law). A framework-shaped "fall back to en" would silently make English the
     * language of a refusal shown to the Family Board, so it is pinned here.
     */
    const headerless = await callKernel(page, 'health');
    expect((headerless.result?.data as { locale?: string } | undefined)?.locale).toBe('ar');

    // ── the session cookie crossed with it ───────────────────────────────────────────────
    const whoami = await callKernel(page, 'whoami', undefined, locale);
    expect(
      whoami.status,
      `whoami was refused, so the session cookie did not reach the router: ${JSON.stringify(whoami)}`,
    ).toBe(200);
    const identity = whoami.result?.data as { userId?: string; grants?: unknown[] } | undefined;
    expect(typeof identity?.userId).toBe('string');
    // DENY BY DEFAULT: registering created a principal, not an authorization (§10 principle 1).
    expect(identity?.grants).toEqual([]);

    // ── every scoped read is NOT_FOUND, on every endowment, and never FORBIDDEN ──────────
    for (const waqfId of SEEDED_WAQF_IDS) {
      const denied = await callKernel(page, 'endowment.get', { waqfId }, locale);

      expect(denied.status, `expected 404 for ${waqfId}, got ${JSON.stringify(denied)}`).toBe(404);
      expect(denied.error?.data?.code).toBe('NOT_FOUND');
      // ⚠ THE ASSERTION THAT MATTERS. `FORBIDDEN` on endowment B tells the caller B exists and
      // that they are not on it; across four endowments of one family that is an enumeration
      // oracle. AC-1's and EXIT-1's mutation is literally this flip.
      expect(denied.error?.data?.code).not.toBe('FORBIDDEN');
      expect(denied.error?.data?.apiCode).toBe('NO_GRANT');
      // The contract the UI depends on: the wire carries a KEY, and the wording is looked up.
      expect(denied.error?.data?.messageKey).toBe('errors.access.NO_GRANT');
    }

    // ── and the SCREEN says it in the caller's language ──────────────────────────────────
    await page.reload();
    const notice = page.getByTestId('qm-access-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(copy.notAuthorized);
    await expect(notice).toContainText(copy.noGrant);
    // Not the generic fallback: `kernelMessageKey` resolved the real code, so a regression that
    // silently degrades every refusal to "Something went wrong" fails here.
    await expect(notice).not.toContainText(copy.generic);

    // The app chrome is NOT rendered: a caller with no grant gets one honest sentence, not a
    // shell full of empty screens.
    await expect(page.getByTestId('qm-topbar')).toHaveCount(0);

    // Direction still comes from the locale, not from the error path.
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

    /* ── NOTHING RAW REACHED THE READER ───────────────────────────────────────────────────
     *
     * Two scopes, because they are two different claims, and conflating them produced a false
     * failure on the first run of this suite.
     *
     * ⚠ `page.content()` LEGITIMATELY CONTAINS EVERY ERROR CODE NAME, and always will:
     * `[locale]/layout.tsx` hands the WHOLE catalogue to `NextIntlClientProvider`, so next-intl
     * serialises `errors.access.NO_GRANT`'s KEY and wording into the RSC payload of EVERY page.
     * That is not a disclosure — the list is a static, identical constant for every caller, and it
     * says nothing about which refusal (if any) happened on THIS request. The non-disclosure
     * property is "the caller cannot tell WHICH of the three NOT_FOUND refusals fired", and a
     * complete list of all eleven codes carries exactly zero bits about that.
     */
    const visible = await page.locator('body').innerText();
    for (const forbidden of [
      // machine codes, in text a human reads
      'NO_GRANT',
      'ACCESS_DENIED',
      'NOT_FOUND',
      // a raw dotted key — what next-intl PRINTS when a message is missing rather than throwing.
      // This is the assertion that catches an unpaired error code reaching a real screen.
      'errors.access',
      'errors.domain',
      // internals and identifiers
      'WaqfAccessGrant',
      'TRPCError',
      '§10',
      ...SEEDED_WAQF_IDS,
    ]) {
      expect(visible, `"${forbidden}" was shown to the reader`).not.toContain(forbidden);
    }

    /**
     * At DOCUMENT level, the claim is narrower and specific: no sentence of the developer-facing
     * message may be in the response at all.
     *
     * `noGrant()` builds an English message quoting the requested endowment, the refused permission
     * and the spec paragraph, and it DOES cross the HTTP boundary in `error.message` (harmlessly —
     * the endowment id came from the caller). What must never happen is that message being rendered
     * or embedded by a PAGE, because a page is what a screenshot, a support ticket and a browser
     * cache keep. These three fragments are distinctive enough to catch it and appear nowhere else.
     *
     * ⚠ WHY THIS LIST DOES NOT NAME TABLES OR CODES. `next dev` — which is what this suite runs
     * against — embeds React's server-component DEBUG payload in the HTML: it contains the Prisma
     * query names the render performed (`findManyWaqfAccessGrant`) and the PROPS of server
     * components (`messageKey: "errors.access.NO_GRANT"`), and next-intl separately ships the whole
     * message catalogue, so every error code NAME is present on every page by construction. None of
     * that is a disclosure — it is a static constant plus a dev-only trace, identical for every
     * caller, and it carries no information about which refusal fired on this request. Asserting
     * against it would only pin a development artefact. Reported to the orchestrator: the
     * production payload is a DIFFERENT artefact, and a `next build && next start` pass over this
     * same screen is worth adding when the E2E job can afford it.
     */
    const html = await page.content();
    for (const fragment of [
      'no active WaqfAccessGrant for waqf',
      'Deny by default',
      'is not visible to this caller',
    ]) {
      expect(html, `the developer message ("${fragment}") reached the document`).not.toContain(
        fragment,
      );
    }
  } finally {
    await page.close();
    await context.close();
  }
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2 · A GRANTED operator's scoped read succeeds over the same wire.
 *
 * ⚠ IDEMPOTENCY, AND WHY THE FALLBACK BRANCH STILL ASSERTS SOMETHING REAL.
 * Enrolment is a one-way door: `/two-factor/enable` returns the secret exactly once, so a second
 * Playwright project — or a retry — cannot re-derive it and cannot complete the challenge for an
 * already-enrolled seat. `auth-journey.spec.ts` handles this by returning early. Returning early
 * with NO assertion is how a skipped check gets reported as a pass, so this branch asserts the
 * complementary property instead: without a completed session the same scoped read is refused as
 * `UNAUTHORIZED`. One of the two branches always runs, and both assert.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E2 · a granted operator reads their own endowment through the browser', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const context: BrowserContext = await browser.newContext();
  const request = context.request;
  const page = await context.newPage();

  try {
    const signIn = await post(request, '/sign-in/email', GRANTED_OPERATOR);
    expect(
      signIn.status,
      `the seeded operator cannot sign in: ${JSON.stringify(signIn.body)}`,
    ).toBe(200);

    if (signIn.body.twoFactorRedirect === true) {
      testInfo.annotations.push({
        type: 'note',
        description:
          `${GRANTED_OPERATOR.email} was already TOTP-enrolled by an earlier project or attempt, ` +
          `so its secret is unrecoverable here. Asserting the complementary refusal instead.`,
      });

      // Half-authenticated: there is no session…
      expect(await sessionUser(request)).toBeFalsy();
      // …and the kernel refuses the scoped read outright. Note this is UNAUTHORIZED (no session),
      // NOT the NOT_FOUND of "authenticated but ungranted" — the two refusals are different facts
      // and the ladder must not collapse them.
      await page.goto(`/${locale}/sign-in`);
      const refused = await callKernel(page, 'endowment.get', { waqfId: 'waqf-001' }, locale);
      expect(refused.status).toBe(401);
      expect(refused.error?.data?.apiCode).toBe('UNAUTHENTICATED');
      return;
    }

    const enable = await post(request, '/two-factor/enable', {
      password: GRANTED_OPERATOR.password,
    });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
    const secret = secretFromTotpUri(enable.body.totpURI);
    expect((await post(request, '/two-factor/verify-totp', { code: totp(secret) })).status).toBe(
      200,
    );

    await page.goto(`/${locale}/dashboard`);

    // The positive path: a NAZIR grant on waqf-001 carrying `endowment:waqf:read`.
    const allowed = await callKernel(page, 'endowment.get', { waqfId: 'waqf-001' }, locale);
    expect(allowed.status, `scoped read failed: ${JSON.stringify(allowed)}`).toBe(200);
    const endowment = allowed.result?.data as
      { waqfId?: string; found?: boolean; classification?: string | null } | undefined;
    expect(endowment?.waqfId).toBe('waqf-001');
    // `found` is the force-filter's independent verdict: the row came back through the caller's own
    // scoped Prisma client, so the grant is real at both layers, not just at the procedure.
    expect(endowment?.found).toBe(true);

    // An endowment that does not exist is ALSO `NOT_FOUND` with `NO_GRANT` — non-existence and
    // no-access are indistinguishable, which is the same non-disclosure property from the other side.
    const absent = await callKernel(
      page,
      'endowment.get',
      { waqfId: 'waqf-does-not-exist' },
      locale,
    );
    expect(absent.status).toBe(404);
    expect(absent.error?.data?.apiCode).toBe('NO_GRANT');

    // With a grant, the real shell renders — the access notice is gone.
    await page.reload();
    await expect(page.getByTestId('qm-topbar')).toBeVisible();
    await expect(page.getByTestId('qm-access-notice')).toHaveCount(0);
  } finally {
    await page.close();
    await context.close();
  }
});
