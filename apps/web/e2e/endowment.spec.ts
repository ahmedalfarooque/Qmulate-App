import { createHmac } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

/**
 * E3 · THE ENDOWMENT SURFACES A SEAT MAY *NOT* READ, IN A REAL BROWSER, IN BOTH LOCALES.
 *
 * What this file proves:
 *   1. deny by default reaches the DEEP LINKS — an unauthenticated request for an endowment record,
 *      its deed, its classification, its founder's conditions or its reserved matters is redirected
 *      to sign-in, not merely the index page;
 *   2. an AUTHENTICATED, GRANTED seat that does not hold `endowment:waqf:read` sees **NO ENDOWMENT
 *      AT ALL** — not a tree it cannot open — and is REFUSED on every endowment record beneath it,
 *      with the non-disclosure sentence and no machine code;
 *   3. a POSITIVE CONTROL on the same page: a seat that DOES hold the verb sees the whole
 *      hierarchy, with its certificate numbers as LTR islands inside the RTL page;
 *   4. no screen renders a raw dotted message key, and the Arabic page never uppercases or
 *      letter-spaces an Arabic label.
 *
 * ── ⚠ G7-V1 · THIS FILE PINNED THE PRE-FIX BOUNDARY AND WAS RED. IT IS INVERTED, NOT DELETED ──
 * Clause 2 used to read *"navigates the hierarchy and is refused on every record"*, and clause 3
 * asserted four certificate numbers visible to a seat holding no endowment verb. That was an
 * accurate record of the shipped behaviour — and the behaviour was **V-E3-03**, the sprint's own
 * HIGH finding: `navigation.tree` was authorized by the Prisma FORCE FILTER alone ("any active
 * grant"), while `endowment.get` additionally demands `endowment:waqf:read`, so the tree handed a
 * Family Board contact and a Finance seat the corpus asset's legal identity — `FAKE-1000001`,
 * `FAKE-DEED-455`, the classification, the type, the nature and the founder's entitlement order —
 * on endowments neither could open.
 *
 * MEASURED before the inversion, on this file as written:
 *
 *   $ pnpm --filter web exec playwright test e2e/endowment.spec.ts --project=en
 *   1) E3 · a granted seat holding no endowment verb navigates the hierarchy and is refused on
 *      every record
 *      Error: expect(locator).toBeVisible() failed
 *      Locator: getByTestId('qm-endowment-tree')  ·  Error: element(s) not found
 *   1 failed, 1 passed
 *
 * The router was narrowed (`routers/navigation.ts` asks `resolveScope` with the SAME constant
 * `endowment.get` is mounted on), so these two seats now correctly read an EMPTY tree. This file
 * therefore asserts the CORRECTED boundary — **no endowment identifier reaches them at all** — and
 * the LTR-island assertion MOVED to the positive control below rather than being dropped, because
 * a page with nothing on it cannot prove a typographic isolate.
 *
 * ⚠ AND THE POSITIVE CONTROL IS NOT DECORATION. "The seat sees no endowment" is also true of a
 * broken page, a failed loader and a 500. Clause 3 opens the SAME route as an ENTITLED seat and
 * requires the full hierarchy, so the empty tree above is proved to be an authorization boundary
 * rather than a screen that renders nothing for everybody.
 *
 * ── ⚠ WHAT CHANGED, AND WHY — A FIXTURE FACT THIS FILE ORIGINALLY GOT WRONG ────────────────
 * This file was written (unrun) asserting that `board@example.test` and `accountant@example.test`
 * could READ the endowment record, the deed, the classification, the Shart and the reserved
 * matters. They cannot, and the FIRST REAL RUN measured it: both locales failed on
 * `getByTestId('qm-endowment-tabs')` with the non-disclosure refusal on screen.
 *
 * The reason is in `GRANT_SHAPE_BY_ROLE` (`packages/database/src/seed/map.ts`) and it is not a bug:
 *
 *   FAMILY_BOARD (`board@`)      → ['reporting:report:read']
 *   FINANCE      (`accountant@`) → finance / distribution / approval verbs only
 *
 * Neither carries `endowment:waqf:read`, and `ctx.permissions` is `grant.permissions ∩ preset(role)`
 * (`packages/api/src/context.ts`), so a seeded grant is the ceiling in practice. The original
 * `holdsReservedMatterRead: true` on the `board` seat was also wrong for the same reason — the
 * PRESET has a legal cell, the seeded GRANT narrows it away, and no seeded shape carries any
 * `legal:` permission at all.
 *
 * NOTHING WAS DELETED TO MAKE THIS PASS. The reading assertions — the BR-101 record, the dual
 * calendars, the structured Shart with no write path, the classification contrast — MOVED to
 * `endowment-journey.spec.ts`, which claims the only unclaimed seat that actually holds
 * `endowment:waqf:read` (`matrix-admin@`, one grant, on `waqf-001` alone) and asserts them MORE
 * strongly there, in both locales, because that seat's narrowness makes the scope claim provable.
 * What is left here is what these two seats can genuinely demonstrate: the refusal ladder.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT PROVE ────────────────────────────────────────────
 * The authority behaviour: maker != checker, the TOTP step-up, the payload-hash void, the
 * append-only classification history, the write-once deed-term guard, and the eligibility resolver's
 * own matrix. Those live in `packages/api/test/*.integration.test.ts` and
 * `packages/database/test/*.integration.test.ts`, against a real database with subjects that CANNOT
 * be provisioned over HTTP — there is no grant-issuing procedure, by design. Re-asserting them
 * through a browser would be slower, flakier and weaker. This file is about the RENDERED SURFACE.
 *
 * ── TWO STRUCTURAL RULES INHERITED FROM `kernel.spec.ts` AND `auth-journey.spec.ts` ────────
 * 1. **One `BrowserContext` per journey; API calls go through `context.request`.** The default
 *    `request` fixture is a separate cookie jar, so a journey split across `test()` blocks silently
 *    loses its session and fails for a reason unrelated to what is under test.
 * 2. **A seat is claimed by exactly one spec.** TOTP enrolment is a ONE-WAY DOOR for a test: the
 *    secret is returned exactly once, so a spec cannot recover it afterwards. `auth-journey.spec.ts`
 *    holds `nazir@` and `admin@`; `kernel.spec.ts` holds `approver@`; `endowment-journey.spec.ts`
 *    holds `matrix-admin@`. This file therefore claims THREE further seats: one refused seat per
 *    LOCALE — because both Playwright projects run against ONE database, so the Arabic and English
 *    journeys must never contend for the same door — plus `case-manager@` for the positive control,
 *    which the two locales SHARE through the filesystem handshake below.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30s), matching `totpOptions` in
 * `packages/auth`.
 *
 * ⚠ DUPLICATED FROM `auth-journey.spec.ts` AND `kernel.spec.ts` ON PURPOSE. The original file's
 * header records why it is written out rather than imported from a dependency — "so that a change to
 * the app's TOTP parameters shows up here as a failure instead of being silently absorbed". Three
 * independent copies means a parameter change reddens three files, not zero.
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
  for (let at = 0; at + 8 <= bits.length; at += 8) {
    bytes.push(Number.parseInt(bits.slice(at, at + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(at / 1000 / 30), 4);
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
 * Fixtures
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/** Published in `packages/database/src/seed/map.ts`; the seed prints it. Not a secret. */
const SEED_PASSWORD = 'fixture-only-not-a-secret-9271';

/** The MEDIUM, `FAMILY_DHURRI`, `ORDERED` fixture endowment. Invented data throughout. */
const WAQF_ID = 'waqf-001';

/**
 * ONE SEAT PER LOCALE — and what they DO and DO NOT hold is written down here as a fixture fact,
 * because a test that reads the answer from the system under test cannot fail when the answer is
 * wrong.
 *
 * Both hold FOUR ACTIVE GRANTS (one per seeded endowment) and NEITHER holds `endowment:waqf:read`,
 * `endowment:deed:read` or `legal:reserved_matter:read`. Measured from `GRANT_SHAPE_BY_ROLE` and
 * from the seeded `waqf_access_grant` rows:
 *
 *   `board@`      FAMILY_BOARD → ['reporting:report:read']
 *   `accountant@` FINANCE      → ['finance:transaction:read', 'finance:transaction:write',
 *                                 'distribution:run:read', 'distribution:run:initiate',
 *                                 'approval:request:read', 'approval:request:initiate']
 *
 * That combination is exactly the subject this file needs: A GRANT IS NOT A BLANKET. The endowment
 * appears in the navigation tree (which is authorized by the force filter alone) and every record
 * beneath it is refused (which needs the verb). Those are two different layers and a suite that
 * only ever tested a Nazir would never separate them.
 */
const SEATS = {
  ar: {
    email: 'board@example.test',
    password: SEED_PASSWORD,
    role: 'family_board',
  },
  en: {
    email: 'accountant@example.test',
    password: SEED_PASSWORD,
    role: 'finance',
  },
} as const;

/**
 * THE POSITIVE-CONTROL SEAT — the only unclaimed seat whose GRANT carries `endowment:waqf:read`.
 *
 * `CASE_MANAGER`, `onlyWaqfId: null`, so it holds an active grant on every seeded endowment
 * (`GRANT_SHAPE_BY_ROLE.CASE_MANAGER`, added in this close-out by owner decision D-E). It exists in
 * this file for ONE reason: without it, "the refused seat sees no endowment" is equally true of a
 * page that renders nothing for anybody.
 */
const CONTROL_SEAT = { email: 'case-manager@example.test', password: SEED_PASSWORD } as const;

/**
 * The whole seeded portfolio: one family, three founders, FIVE endowments.
 *
 * ⚠ ASSERTED EXACTLY, NOT `>= 1`, AND IT IS THE POSITIVE CONTROL'S NUMBER NOW — not the refused
 * seat's. `navigation.tree` used to be authorized by the force filter alone ("any active grant"),
 * which is what V-E3-03 was; it now additionally demands `endowment:waqf:read`, the same verb
 * `endowment.get` demands. Pinning the exact counts on a seat that DOES hold the verb keeps the
 * boundary visible from the other side: if the tree ever narrows past the verb or widens back to
 * the grant, this number moves and someone has to say why.
 *
 * The fifth endowment is the intake-state one (`reversionClauseCaptured = false`) the product owner
 * asked for in D-C.
 */
const SEEDED_PORTFOLIO = { clients: 1, waqifs: 3, endowments: 6 } as const;
const SEEDED_CERTIFICATES = [
  'FAKE-1000001',
  'FAKE-1000002',
  'FAKE-1000003',
  'FAKE-1000004',
  'FAKE-1000005',
  // ⊕ M1-b · waqf-007, the computing lineage sibling — endowments moved 5 → 6 with it.
  'FAKE-1000007',
] as const;

/**
 * EVERY endowment identifier in the fixture — the exact strings a refused seat must not meet.
 *
 * ⚠ THE LIST IS THE MEASUREMENT V-E3-03 RECORDED, not a guess: certificate numbers, deed numbers,
 * endowment ids, and the endower's and family's names in BOTH scripts. `waqf-001` is deliberately
 * absent from the record-screen sweep further down — it is in the URL the caller typed — but on the
 * INDEX page nothing was typed, so every id is a disclosure.
 */
const SEEDED_ENDOWMENT_IDENTIFIERS = [
  ...SEEDED_CERTIFICATES,
  'FAKE-DEED-455',
  'FAKE-DEED-456',
  'FAKE-DEED-2352',
  'FAKE-DEED-2510',
  'FAKE-DEED-2610',
  'FAKE-DEED-3110',
  'waqf-001',
  'waqf-002',
  'waqf-003',
  'waqf-004',
  'waqf-005',
  'waqf-007',
  'الراشدي', // the family's and every endower's name, Arabic
  'Al-Rashidi', // and English
] as const;

/** Mirrors `playwright.config.ts`. better-auth needs an explicit `Origin` — see `post`. */
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`;

function localeFor(projectName: string): 'ar' | 'en' {
  return projectName === 'ar' ? 'ar' : 'en';
}

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

/**
 * The ar/en wording, READ FROM THE CATALOGUE.
 *
 * Typing the sentence into this file would assert only that two copies of a string match, and would
 * go stale the first time a translator improves the wording. Reading it means the test asserts the
 * SCREEN SHOWS THE CATALOGUE — which is the actual bilingual requirement (NFR-01).
 */
function catalogue(locale: 'ar' | 'en') {
  const path = fileURLToPath(
    new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url),
  );
  // Narrowed to what THIS file reads. The reading-side copy (the Shart's immutability statement,
  // the eligibility reasons, the classification history) is read in `endowment-journey.spec.ts`,
  // where a seat that can open those screens lives.
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    nav: { endowments: string };
    errors: { notAuthorized: string };
    endowments: {
      title: string;
      /** The empty-scope card — the CORRECTED boundary's own sentence (G7-V1). */
      empty: string;
      emptyBody: string;
      tree: { clientLabel: string };
      /** The reserved-matter screen, reachable by a seeded seat since owner decision D-E. */
      reserved: { title: string; empty: string };
    };
  };
  return json;
}

/**
 * A raw dotted message key — what next-intl PRINTS when a message is missing, instead of throwing.
 *
 * The trailing `[a-zA-Z]` matters: English prose legitimately ends a sentence with "…endowments.",
 * and a pattern without it would fail on correct copy. A KEY always has a letter straight after the
 * dot, so this discriminates a missing translation from a full stop.
 */
const RAW_KEY_PATTERN = /(?:endowments|errors|common|nav|auth)\.[a-zA-Z][a-zA-Z0-9_]*/;

/** Every endowment sub-route, so the deny-by-default check covers the deep links, not just the index. */
const SUB_ROUTES = ['', '/deed', '/classification', '/shart', '/reserved-matters'] as const;

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1 · DENY BY DEFAULT REACHES THE DEEP LINKS
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · an unauthenticated request for any endowment screen is sent to sign-in', async ({
  page,
  context,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);

  /**
   * ⚠ ASSERTED AT THE SERVER, THEN ONCE IN THE BROWSER — and the split is deliberate.
   *
   * The original version drove all six routes with `page.goto`, which waits for the REDIRECT TARGET
   * to finish loading. Against `next dev` each of those routes compiles on demand (measured: 1.5–6.7 s
   * apiece, four workers competing), so the test exceeded its 30 s budget on the sixth navigation —
   * a harness cost, not a defect, and widening the timeout would have hidden the fact rather than
   * removed it.
   *
   * Reading the redirect itself is both FASTER and a STRONGER claim: `maxRedirects: 0` proves the
   * SERVER refuses the deep link (307 + a `Location` pointing at sign-in) rather than that the
   * browser eventually ends up somewhere plausible. The browser landing is then asserted once, so
   * the end-to-end behaviour is still covered.
   */
  for (const suffix of SUB_ROUTES) {
    const url = `/${locale}/endowments/${WAQF_ID}${suffix}`;
    const response = await getSurvivingOneTransportFault(context.request, url, {
      maxRedirects: 0,
    });
    expect(response.status(), `deep link ${url} was not gated (no redirect)`).toBe(307);
    expect(
      response.headers()['location'] ?? '',
      `deep link ${url} redirected somewhere other than sign-in`,
    ).toContain(`/${locale}/sign-in`);
  }

  const index = await getSurvivingOneTransportFault(context.request, `/${locale}/endowments`, {
    maxRedirects: 0,
  });
  expect(index.status()).toBe(307);
  expect(index.headers()['location'] ?? '').toContain(`/${locale}/sign-in`);

  // …and a real browser actually lands there, with the sign-in form to prove it is the page and not
  // a redirect loop.
  await page.goto(`/${locale}/endowments/${WAQF_ID}`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
});
/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2 · A GRANT IS NOT A READ PERMISSION — the seat sees NOTHING, and every record is refused
 *
 * These two seats hold an ACTIVE grant on every seeded endowment and NOT ONE endowment verb (see
 * `SEATS`). So this is the layer no Nazir-only journey can reach — and it is the layer V-E3-03 got
 * wrong. Before the fix the force filter authorized the NAVIGATION while the per-verb check
 * authorized only the RECORD, and the product showed a Family Board contact the founder's
 * conditions on four endowments it could not open. The two are now the SAME gate, so the tree these
 * seats read is empty and every record beneath it is refused for the same reason.
 *
 * ⚠ IDEMPOTENCY, AND WHY THE FALLBACK BRANCH STILL ASSERTS SOMETHING REAL.
 * Enrolment is a one-way door: `/two-factor/enable` returns the secret exactly once, so a RETRY
 * cannot re-derive it. Returning early with no assertion is how a skipped check gets reported as a
 * pass, so that branch asserts the complementary property instead — a half-authenticated session
 * still cannot reach an endowment screen. One of the two branches always runs, and both assert.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · a granted seat holding no endowment verb sees NO endowment at all, and is refused on every record', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const seat = SEATS[locale];
  const copy = catalogue(locale);

  const context: BrowserContext = await browser.newContext();
  const request = context.request;
  const page = await context.newPage();

  try {
    const signIn = await post(request, '/sign-in/email', {
      email: seat.email,
      password: seat.password,
    });
    expect(
      signIn.status,
      `the seeded ${seat.role} seat cannot sign in: ${JSON.stringify(signIn.body)}`,
    ).toBe(200);

    if (signIn.body.twoFactorRedirect === true) {
      testInfo.annotations.push({
        type: 'note',
        description:
          `${seat.email} was already TOTP-enrolled by an earlier attempt, so its secret is ` +
          `unrecoverable here. Asserting the complementary refusal instead.`,
      });

      // Half-authenticated: the second factor was never asserted, so there is no session and the
      // endowment screens stay unreachable. This is the UNAUTHENTICATED refusal, NOT the
      // "authenticated but ungranted" one — the ladder must not collapse the two.
      await page.goto(`/${locale}/endowments/${WAQF_ID}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/(sign-in|two-factor)`));
      return;
    }

    const enable = await post(request, '/two-factor/enable', { password: seat.password });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
    const secret = secretFromTotpUri(enable.body.totpURI);
    expect((await post(request, '/two-factor/verify-totp', { code: totp(secret) })).status).toBe(
      200,
    );

    /* ── 2a · THE INDEX RENDERS, AND CARRIES NO ENDOWMENT (G7-V1, THE INVERTED CLAUSE) ──── */

    await page.goto(`/${locale}/endowments`);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.getByTestId('qm-access-notice')).toHaveCount(0);

    // The sidebar destination is a real link now, not a `planned` span.
    const sidebarEndowments = page
      .getByTestId('qm-sidebar')
      .getByRole('link', { name: copy.nav.endowments });
    await expect(sidebarEndowments).toHaveAttribute('href', `/${locale}/endowments`);

    /**
     * ⚠ THE PAGE ITSELF IS PROVEN HEALTHY FIRST. An empty tree and a 500 look identical to an
     * assertion that only counts what is absent, so the screen's own chrome — the catalogue's title
     * and the empty-scope sentence — is required before anything is counted as withheld.
     */
    await expect(page.getByRole('heading', { name: copy.endowments.title })).toBeVisible();
    await expect(page.getByText(copy.endowments.empty)).toBeVisible();
    await expect(page.getByText(copy.endowments.emptyBody)).toBeVisible();

    // ── THE CORRECTED BOUNDARY ────────────────────────────────────────────────────────────
    // No tree, and no branch of one. `EndowmentTree` renders the empty-scope card INSTEAD of the
    // `qm-endowment-tree` group when the caller reaches nothing, so all four counts are zero.
    await expect(page.getByTestId('qm-endowment-tree')).toHaveCount(0);
    await expect(page.getByTestId('qm-tree-client')).toHaveCount(0);
    await expect(page.getByTestId('qm-tree-waqif')).toHaveCount(0);
    await expect(page.getByTestId('qm-tree-endowment')).toHaveCount(0);

    /**
     * ⚠ AND NOT ONE ENDOWMENT IDENTIFIER REACHES THE READER — the exact strings V-E3-03 measured.
     * Counting absent test-ids proves the COMPONENT did not render; this proves the FACTS did not,
     * which is the property that survives a component being replaced.
     */
    const indexBody = await page.locator('#qm-main').innerText();
    for (const identifier of SEEDED_ENDOWMENT_IDENTIFIERS) {
      expect(
        indexBody,
        `"${identifier}" was disclosed to a seat holding no endowment verb (V-E3-03)`,
      ).not.toContain(identifier);
    }

    await expectNoRawKeys(page);
    await expectNoHorizontalOverflow(page, `/${locale}/endowments`);

    /* ── 2b · RTL GEOMETRY AND THE ARABIC LABEL TREATMENT, ON THIS SAME PAGE ─────────── */

    // ⚠ NO NAVIGATION HERE: the assertions below read the page the test is already on. The first
    // version re-`goto`'d the index, which against `next dev` is a whole extra route render for
    // nothing and was part of what pushed this test past its 30 s budget (measured).
    if (locale === 'ar') {
      // `--nu-dir` is an X multiplier on every shadow offset: the neumorphic light source is
      // inline-start, so it mirrors with direction while Y offsets never change.
      const nuDir = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--nu-dir').trim(),
      );
      expect(nuDir).toBe('-1');

      /**
       * Arabic is NEVER uppercased or letter-spaced: Geist Mono has no Arabic glyphs and both
       * treatments break the cursive joins. The label convention is LANGUAGE-SWITCHED, not
       * translated — IBM Plex Sans Arabic 600, no transform, no tracking.
       *
       * ⚠ `.qm-eyebrow`, not `.qm-label`: the tree's level labels ("client", "endower") are
       * `<Eyebrow>`s, and the two classes share this rule in `tokens.css`. The record's `<dt>`
       * labels are asserted in `endowment-journey.spec.ts`, on a seat that can read the record.
       */
      const labels = page.locator('#qm-main .qm-eyebrow');
      const labelCount = await labels.count();
      expect(labelCount, 'no eyebrow labels on the index to check').toBeGreaterThan(0);
      for (let index = 0; index < Math.min(labelCount, 12); index += 1) {
        const style = await labels.nth(index).evaluate((node) => {
          const computed = getComputedStyle(node);
          return { transform: computed.textTransform, spacing: computed.letterSpacing };
        });
        expect(style.transform, 'an Arabic label is uppercased').toBe('none');
        expect(
          ['normal', '0px', ''].includes(style.spacing),
          `an Arabic label is letter-spaced (${style.spacing})`,
        ).toBe(true);
      }
    }

    /* ── 2c · AND EVERY RECORD BENEATH IT IS REFUSED, IDENTICALLY ──────────────────────── */

    /**
     * FIVE screens, ONE sentence. The record, the deed, the classification, the founder's conditions
     * and the reserved matters are all refused for want of a verb — and the refusal carries NO
     * machine code, NO permission string and NO endowment fact. `NO_GRANT`, `PERMISSION_DENIED`,
     * `SCOPE_REF_MISMATCH` and `AML_COMPARTMENT_ONLY` deliberately share their user-facing wording
     * so a caller cannot tell which fired (§10 §6/§7.2).
     */
    for (const suffix of SUB_ROUTES) {
      const url = `/${locale}/endowments/${WAQF_ID}${suffix}`;
      await page.goto(url);

      // The record chrome is NOT drawn: a certificate number and a classification are precisely the
      // facts being withheld.
      await expect(page.getByTestId('qm-endowment-tabs'), `${url} rendered the record`).toHaveCount(
        0,
      );
      const refusal = page.locator('#qm-main [role="alert"]');
      await expect(refusal, `${url} rendered neither a record nor a refusal`).toHaveCount(1);
      await expect(refusal).toContainText(copy.errors.notAuthorized);

      const body = await page.locator('#qm-main').innerText();
      for (const forbidden of [
        'NO_GRANT',
        'PERMISSION_DENIED',
        'errors.access',
        'TRPCError',
        'endowment:waqf:read',
        'legal:reserved_matter:read',
        // The endowment's own facts stay withheld — including the one identifier the caller did not
        // supply. (`WAQF_ID` is in the URL they typed, so it is not a disclosure.)
        'FAKE-DEED-455',
        'FAKE-1000001',
      ]) {
        expect(body, `"${forbidden}" was shown to the reader on ${url}`).not.toContain(forbidden);
      }

      await expectNoRawKeys(page);
    }
  } finally {
    await page.close();
    await context.close();
  }
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3 · THE POSITIVE CONTROL — the same route, a seat that IS entitled, the whole hierarchy
 *
 * ⚠ WITHOUT THIS TEST, SECTION 2 PASSES ON A BROKEN PAGE. "No endowment reaches this seat" is
 * equally true of a failed loader, a 500 and a component that renders nothing for everybody. The
 * control opens `/{locale}/endowments` as `case-manager@`, whose GRANT carries
 * `endowment:waqf:read` on every seeded endowment, and requires the full 1 / 3 / 5 hierarchy — so
 * the empty tree above is proved to be an authorization boundary rather than an outage.
 *
 * ── THE SEAT IS SHARED BETWEEN THE TWO LOCALES THROUGH THE FILESYSTEM ─────────────────────
 * Both Playwright projects run against ONE database, TOTP enrolment is a one-way door (the secret
 * is returned exactly once), and `case-manager@` is the ONLY unclaimed seat that holds the verb.
 * The house pattern "if already enrolled, assert the complementary refusal and return" would give
 * one locale a real control and silently degrade the other — the wrong trade for a control whose
 * whole job is to stop a silent pass.
 *
 * So the projects cooperate: whoever wins an ATOMIC `mkdir` signs in, enrols, PROVES the enrolment
 * took, and publishes its `storageState` by `rename`; the other opens a context from that file.
 * ⚠ THE SHARED ARTEFACT IS THE SESSION, NOT THE SECRET — `endowment-journey.spec.ts` records the
 * measurement behind that choice (four workers inside one 30-second TOTP window collide, and the
 * recovery regenerates the secret under everyone still holding it). This is a second, independent
 * copy of that mechanism on a DIFFERENT seat and a DIFFERENT handshake directory, deliberately: the
 * two specs must not be able to take each other's door, and the duplication is the same trade the
 * TOTP generator above is written out for.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

const CONTROL_HANDSHAKE_DIR = join(tmpdir(), 'qmulate-e2e-seat-case-manager');
/** Playwright `storageState` for the enrolled control seat — the shared artefact. */
const CONTROL_STATE = join(CONTROL_HANDSHAKE_DIR, 'storage-state.json');
/** Written instead when the seat cannot be enrolled at all, so followers fail fast with the reason. */
const CONTROL_STALE = join(CONTROL_HANDSHAKE_DIR, 'stale.json');
/**
 * How long a handshake DIRECTORY WITH NO PUBLISHED ARTEFACT may sit before it is treated as a
 * leader that died. It is NOT how long a published session lives — see {@link ensureControlSession}.
 */
const HANDSHAKE_STALE_MS = 15 * 60 * 1000;
/** A follower's wait, kept well inside the test budget so a give-up REPORTS rather than times out. */
const FOLLOWER_WAIT_MS = 20_000;

function ageMs(path: string): number {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
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

/** better-auth's own view of the session — `undefined` until the second factor is asserted. */
async function sessionUser(
  request: APIRequestContext,
): Promise<Record<string, unknown> | undefined> {
  const response = await getSurvivingOneTransportFault(request, '/api/auth/get-session');
  if (!response.ok()) return undefined;
  const body = (await response.json()) as { user?: Record<string, unknown> } | null;
  return body?.user ?? undefined;
}

/** Does the published `storageState` still resolve to the control seat? Validated by USE, not by age. */
async function publishedSessionIsTheSeat(browser: Browser): Promise<boolean> {
  if (!existsSync(CONTROL_STATE)) return false;
  let context;
  try {
    context = await browser.newContext({ storageState: CONTROL_STATE });
  } catch {
    return false; // an unreadable / half-written state file
  }
  try {
    const user = await sessionUser(context.request);
    return user?.email === CONTROL_SEAT.email && user.twoFactorEnabled === true;
  } finally {
    await context.close();
  }
}

/**
 * Establish (or join) the one enrolled session for the control seat.
 *
 * ⚠ IT THROWS RATHER THAN DEGRADING. Every other seat in this file has a complementary property to
 * fall back on; a POSITIVE control does not — "the control could not run" and "the control passed"
 * must never be the same outcome, because the whole point of it is to catch a screen that renders
 * nothing. The message names the remedy.
 *
 * ⚠ AND THE PUBLISHED SESSION IS VALIDATED BY USE, NOT BY AGE — which is the difference between a
 * suite that is green once per database and one that is green every time. MEASURED: an age-gated
 * handshake expired 15 minutes after the first run, the leader re-signed in, better-auth answered
 * `twoFactorRedirect: true` because the seat was ALREADY enrolled, its secret was unrecoverable, and
 * all four control tests went red on a database that was perfectly healthy. That is V-E3-04's shape
 * — "green exactly once per database" — in the browser suite. A session cookie outlives a TOTP
 * secret's usability here, so the artefact is kept until it stops working.
 */
async function ensureControlSession(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (await publishedSessionIsTheSeat(browser)) return;

  // Either nothing was ever published, or what was published no longer resolves (a re-seed). A
  // handshake directory with no artefact at all and no recent mtime is a leader that died.
  if (existsSync(CONTROL_STATE) || ageMs(CONTROL_HANDSHAKE_DIR) > HANDSHAKE_STALE_MS) {
    rmSync(CONTROL_HANDSHAKE_DIR, { recursive: true, force: true });
  }

  let leader = false;
  try {
    mkdirSync(CONTROL_HANDSHAKE_DIR);
    leader = true;
  } catch {
    leader = false;
  }

  if (leader) {
    const context = await browser.newContext();
    try {
      const signIn = await post(context.request, '/sign-in/email', {
        email: CONTROL_SEAT.email,
        password: CONTROL_SEAT.password,
      });
      expect(
        signIn.status,
        `the seeded control seat cannot sign in: ${JSON.stringify(signIn.body)}`,
      ).toBe(200);
      if (signIn.body.twoFactorRedirect === true) {
        // The seat is enrolled and no usable session survives, so its secret is unrecoverable. Tell
        // the followers rather than leaving them to time out on a reason nobody can read.
        publishControlStale(
          `${CONTROL_SEAT.email} is TOTP-enrolled from an earlier run and no published session ` +
            `still resolves. Re-seed the database (or delete the seeded operators' \`two_factor\` ` +
            `rows) and re-run.`,
        );
      }
      expect(
        signIn.body.twoFactorRedirect,
        `${CONTROL_SEAT.email} carries a COMPLETED enrolment from an earlier run and no published ` +
          `session still resolves, so the positive control cannot run. Re-seed (or delete the ` +
          `seeded operators' \`two_factor\` rows) and re-run — do NOT let this degrade into a skip.`,
      ).not.toBe(true);

      const enable = await post(context.request, '/two-factor/enable', {
        password: CONTROL_SEAT.password,
      });
      expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
      const secret = secretFromTotpUri(enable.body.totpURI);
      const verify = await post(context.request, '/two-factor/verify-totp', { code: totp(secret) });
      expect(verify.status, `verification failed: ${JSON.stringify(verify.body)}`).toBe(200);

      // ⚠ THE ENROLMENT IS PROVEN, NOT ASSUMED. `enable` + `verify-totp` both answer 200 while
      // `twoFactorEnabled` stays FALSE when a `two_factor` row survives a re-seed, and every screen
      // then refuses for a reason that looks like the screen's fault.
      const user = await sessionUser(context.request);
      expect(
        user?.twoFactorEnabled,
        `${CONTROL_SEAT.email} reported a successful TOTP enrolment while still un-enrolled — a ` +
          `\`two_factor\` row from an earlier run survives \`db:seed\`. Delete those rows, or ` +
          `re-create the cluster, and re-run.`,
      ).toBe(true);

      const temporary = `${CONTROL_STATE}.${String(process.pid)}.tmp`;
      await context.storageState({ path: temporary });
      renameSync(temporary, CONTROL_STATE);
      testInfo.annotations.push({
        type: 'seat',
        description: `${CONTROL_SEAT.email} enrolled; session published for both locales`,
      });
      return;
    } finally {
      await context.close();
    }
  }

  const deadline = Date.now() + FOLLOWER_WAIT_MS;
  while (Date.now() < deadline) {
    if (existsSync(CONTROL_STATE)) return;
    const stale = readControlStale();
    if (stale !== null) throw new Error(`the control seat is unavailable: ${stale}`);
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(
    `no session for ${CONTROL_SEAT.email} was published within ${String(FOLLOWER_WAIT_MS)}ms. The ` +
      `positive control did NOT run, and a positive control that does not run is the failure it ` +
      `exists to catch — reported rather than skipped.`,
  );
}

function publishControlStale(why: string): void {
  const temporary = `${CONTROL_STALE}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, JSON.stringify({ stale: why, at: Date.now() }), 'utf8');
  renameSync(temporary, CONTROL_STALE);
}

function readControlStale(): string | null {
  try {
    return (JSON.parse(readFileSync(CONTROL_STALE, 'utf8')) as { stale: string }).stale;
  } catch {
    return null;
  }
}

/**
 * Compile a route SERVER-SIDE before a rendering assertion depends on it.
 *
 * `next dev` compiles a route on its first request, so the first navigation can take longer than
 * the 5 s `expect` budget and fail an assertion for a reason that has nothing to do with the
 * screen. Warming pays that cost through `context.request` — the same cookie jar, so the page
 * renders for real — and leaves every assertion below strict. The same helper, and the same
 * reasoning, as `endowment-journey.spec.ts`.
 */
async function warm(context: BrowserContext, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const response = await getSurvivingOneTransportFault(context.request, path);
    expect(
      response.status(),
      `warming ${path} answered ${String(response.status())}; the assertions below would fail for ` +
        `the wrong reason`,
    ).toBeLessThan(400);
  }
}

test('E3 · positive control · an ENTITLED seat sees the whole hierarchy on the same page', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await ensureControlSession(browser, testInfo);
  const context = await browser.newContext({ storageState: CONTROL_STATE });
  const page = await context.newPage();

  try {
    // The session must actually be the control seat — a stale state file would otherwise be read as
    // "signed in as nobody" and the tree would be empty for the wrong reason.
    const user = await sessionUser(context.request);
    expect(user?.email, 'the published session is not the control seat').toBe(CONTROL_SEAT.email);

    // ⚠ WARMED SERVER-SIDE FIRST, and it is a fix rather than a shortcut. `next dev` compiles a
    // route on its first request, and with four workers on a cold server the index has taken longer
    // than the 5 s `expect` budget — MEASURED: this control went red once on a second run while the
    // page was perfectly healthy, which for a POSITIVE control is the worst available flake (it
    // reports "the tree is missing" when the tree is fine). Warming pays the compile through the
    // same cookie jar and leaves every assertion below strict.
    await warm(context, [`/${locale}/endowments`]);

    await page.goto(`/${locale}/endowments`);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

    const tree = page.getByTestId('qm-endowment-tree');
    await expect(
      tree,
      'the entitled seat sees NO tree either — section 2 is passing on a broken page',
    ).toBeVisible();
    await expect(tree.getByTestId('qm-tree-client')).toHaveCount(SEEDED_PORTFOLIO.clients);
    await expect(tree.getByTestId('qm-tree-waqif')).toHaveCount(SEEDED_PORTFOLIO.waqifs);
    await expect(tree.getByTestId('qm-tree-endowment')).toHaveCount(SEEDED_PORTFOLIO.endowments);
    // The empty-scope sentence section 2 requires must NOT be on this page: the two states are
    // mutually exclusive, and asserting only the tree would let a page render both.
    await expect(page.getByText(copy.endowments.empty)).toHaveCount(0);

    /**
     * ── THE MACHINE-READABLE HALF STAYS LTR INSIDE THE RTL PAGE ──────────────────────────
     * MOVED HERE FROM SECTION 2 (G7-V1), NOT DELETED. `<Mono>` wraps a certificate number in
     * `<bdi dir="ltr">`. Without the isolate the digits and the hyphen of `FAKE-1000001` reorder
     * against the surrounding Arabic and the number a Nazir reads off the screen is not the number
     * in the deed — a correctness bug, not a typographic nicety. It can only be asserted where the
     * numbers actually render, which since the V-E3-03 narrowing is on an ENTITLED seat's page.
     */
    for (const certificate of SEEDED_CERTIFICATES) {
      await expect(
        page.locator('#qm-main bdi[dir="ltr"]', { hasText: certificate }),
        `${certificate} is not inside an LTR isolate`,
      ).toHaveCount(1);
    }

    await expectNoRawKeys(page);
  } finally {
    await page.close();
    await context.close();
  }
});

/**
 * V-E3-L1's browser half: a SEEDED seat can now open the reserved-matter screen.
 *
 * ⚠ WHAT THIS DOES AND DOES NOT PROVE. Before owner decision D-E, not one of the eighteen seeded
 * grants carried `legal:reserved_matter:*` or `endowment:deed:*` — measured, zero rows — so §17's
 * E3 exit clause ("the reason renders as a human-readable statement") was unreachable by every user
 * that existed. The `CASE_MANAGER` shape now carries the read, and this proves the screen actually
 * renders for it, in both locales, rather than refusing.
 *
 * It does NOT prove the "blocked until approved" rendering: the seed mints no `RESERVED_MATTER`
 * approval request at all, so the panel has nothing to mark blocked and correctly shows its empty
 * sentence. That remaining gap stays PINNED in `endowment-journey.spec.ts` — asserted against the
 * seed's own source so it fires the day a matter is seeded, rather than being asserted
 * conditionally and reporting its silence as success (R6-C1).
 */
test('E3 · positive control · a seeded seat holding the reserved-matter read reaches that screen', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await ensureControlSession(browser, testInfo);
  const context = await browser.newContext({ storageState: CONTROL_STATE });
  const page = await context.newPage();

  try {
    await warm(context, [`/${locale}/endowments/${WAQF_ID}/reserved-matters`]);
    await page.goto(`/${locale}/endowments/${WAQF_ID}/reserved-matters`);

    // NOT refused — which is the whole claim. A seat without the verb gets the alert instead.
    await expect(page.locator('#qm-main [role="alert"]')).toHaveCount(0);
    await expect(page.getByText(copy.endowments.reserved.title).first()).toBeVisible();
    // Zero matters on this seed, so the panel's own empty sentence is the correct rendering.
    await expect(page.getByText(copy.endowments.reserved.empty)).toBeVisible();
    await expect(page.getByTestId('qm-reserved-blocked')).toHaveCount(0);

    await expectNoRawKeys(page);
  } finally {
    await page.close();
    await context.close();
  }
});

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Shared assertions
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * No raw dotted message key reached the reader.
 *
 * ⚠ SCOPED TO VISIBLE TEXT, NOT `page.content()`. `[locale]/layout.tsx` hands the WHOLE catalogue to
 * `NextIntlClientProvider`, so every key path is serialised into the RSC payload of every page by
 * construction. That is not a defect and asserting against the document would only pin a framework
 * artefact. What must never happen is a key path being RENDERED, which is exactly what next-intl
 * does when a message is missing — it prints the key rather than throwing.
 */
async function expectNoRawKeys(page: Page): Promise<void> {
  const visible = await page.locator('#qm-main').innerText();
  const match = RAW_KEY_PATTERN.exec(visible);
  expect(
    match?.[0] ?? null,
    'a raw message key was rendered — the catalogue is missing an entry',
  ).toBeNull();
}

/**
 * The page itself never scrolls horizontally, in either direction, at any of the three widths.
 *
 * `globals.css` deliberately does NOT set `overflow-x: hidden`: hiding the overflow would make this
 * assertion vacuous, and a mirrored layout that overflows in one direction only is the classic RTL
 * regression. Wide content (the obligation tables, the tab strip) scrolls inside its own container.
 *
 * ⚠ IT RESIZES WITHOUT RE-NAVIGATING, and that is a fix rather than a shortcut. The first version
 * re-`goto`'d the same URL at every width, which against `next dev` cost three extra route
 * compilations and pushed the whole test past its 30 s budget (measured). The breakpoints are CSS
 * media queries — `md:flex-row`, `md:grid-cols-*` — so a viewport change re-lays the page out on its
 * own; the reload proved nothing the resize does not. The assertion is unchanged.
 */
async function expectNoHorizontalOverflow(page: Page, url: string): Promise<void> {
  await page.goto(url);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `horizontal overflow at ${String(viewport.width)}px on ${url}`,
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
