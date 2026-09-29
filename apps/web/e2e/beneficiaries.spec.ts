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
 * E4 · THE BENEFICIARY REGISTRY AND THE LINEAGE TREE, IN A REAL BROWSER, IN BOTH LOCALES.
 *
 * ── WHAT THIS FILE PROVES ─────────────────────────────────────────────────────────────────
 *   1. the SIXTEEN-member registry on `waqf-005` renders for a granted staff seat: a known row
 *      carries its branch and its Arabic relationship copy (Arabic is authoritative, NFR-01);
 *   2. a CERTIFIED death renders as the deceased state WITH its certification date (R7-D1's
 *      three-sentence rule: a scope exit is not a death, and the two must not share a chip);
 *   3. the KYC chip keeps UNVERIFIED and FRESH as DIFFERENT labels from the locale catalogue —
 *      BR-205's "STALE ≠ UNVERIFIED" discipline, asserted from the never-verified side;
 *   4. the ẓuhūr/buṭūn `lineageLink` values NEVER reach the screen — no `SON`, `DAUGHTER`,
 *      `ZUHUR` or `BUTUN` token renders anywhere on the page (ADR-0009: an eligibility fact,
 *      read for one computation, never rendered as a person's gender);
 *   5. the lineage tree NESTS by the recorded parent edges (a great-grandchild sits inside its
 *      parent's subtree, three generations deep) and the integrity panel shows the all-clear on
 *      a coherent seeded graph;
 *   6. BR-206 on `waqf-002`: the CATEGORY_ONLY row whose category was never captured says
 *      "disbursement blocked" ON THE ROW, and the deceased member renders as certified-deceased;
 *   7. `waqf-003`'s three charitable jihas carry kind chips and are listed OUTSIDE the lineage
 *      tree — a jiha is not a descendant, so it is never drawn as a tree node.
 *
 * ── THE SEAT: THIS FILE **JOINS** THE `case-manager@` HANDSHAKE, IT DOES NOT TAKE THE DOOR ──
 * The house rule is "a seat is claimed by exactly one spec", and the rule exists because TOTP
 * enrolment is a ONE-WAY DOOR (`/two-factor/enable` returns the secret exactly once). Measured
 * against `GRANT_SHAPE_BY_ROLE` (`packages/database/src/seed/map.ts`): `beneficiary:beneficiary:read`
 * is held by exactly TWO seeded shapes — `BENEFICIARY` (self-scoped to `ben-001` on `waqf-001`,
 * useless for a staff registry) and `CASE_MANAGER`. Even the NAZIR shape does not carry it. So the
 * ONLY staff seat that can open these screens is `case-manager@example.test`, which
 * `endowment.spec.ts` already enrolled as its positive control.
 *
 * The conflict the claim rule prevents is CONTENDING FOR THE ENROLMENT, and the control seat's
 * handshake already solves that for an arbitrary number of consumers: whoever wins one ATOMIC
 * `mkdir` enrols ONCE and publishes the SESSION (never the secret) by `rename`; everyone else opens
 * a context from the published `storageState`. This file therefore uses the SAME handshake
 * directory as `endowment.spec.ts` — deliberately, so the two files cooperate through one
 * leader election instead of racing two — and never performs an enrolment the handshake did not
 * elect it to perform. (Contrast `endowment-journey.spec.ts`, which holds a DIFFERENT seat on a
 * DIFFERENT directory: separate doors stay separate.)
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT COVER, AND WHY ───────────────────────────────────
 * G-7/V-5's SCREEN half — a beneficiary-principal session seeing exactly its own row on
 * `waqf-001` and the refusal on `waqf-003` — is NOT here. The e2e harness has NO
 * beneficiary-principal session pattern (grep: no spec references `beneficiary.ben-001@` or a
 * BENEFICIARY seat), and inventing one in this file would claim an unclaimed seat and a new
 * handshake design in the same change as fourteen rendering assertions. The isolation itself is
 * proven at the API layer (`packages/api/test`, the force-filter narrowing to
 * `beneficiarySelfId`), and the lineage procedure additionally INTERSECTS its raw-SQL ancestry
 * with the caller-visible rows (`routers/beneficiary.ts`). The browser half remains owed to the
 * spec that introduces the beneficiary-portal journey (E9).
 *
 * ── STRUCTURAL RULES INHERITED FROM THE OTHER FIVE SPECS ──────────────────────────────────
 * One `BrowserContext` per test; API calls through `context.request` (same cookie jar); routes
 * WARMED server-side before a rendering assertion depends on them (`next dev` compiles on first
 * request, measured at 1.5–7.6 s per route); ONE transport-fault re-attempt and never a retry of
 * an answered response; the ar/en copy READ FROM THE CATALOGUE, never typed into this file.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30s), matching `totpOptions` in
 * `packages/auth`.
 *
 * ⚠ DUPLICATED FROM THE OTHER SPECS ON PURPOSE — their headers record why: a change to the app's
 * TOTP parameters must redden every file rather than being silently absorbed by a shared helper
 * that changed with it.
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
 * Fixture facts — every one MEASURED against `data/fixtures/sample-waqf.json` and the seed's
 * own mapping (`packages/database/src/seed/map.ts`), not assumed. Invented data throughout.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/** Published in `packages/database/src/seed/map.ts`; the seed prints it. Not a secret. */
const SEED_PASSWORD = 'fixture-only-not-a-secret-9271';

/** The one seeded staff seat holding `beneficiary:beneficiary:read` — see the file header. */
const CONTROL_SEAT = { email: 'case-manager@example.test', password: SEED_PASSWORD } as const;

/** The SIXTEEN-member, three-generation, four-branch LINEAGE_CONTINUATION endowment (S5/E4). */
const LINEAGE_WAQF = 'waqf-005';
const LINEAGE_REGISTRY_SIZE = 16;
/** `waqf-005`'s children of the waqif: ben-201…ben-204 → four ROOT nodes in the tree. */
const LINEAGE_ROOT_COUNT = 4;
/**
 * ben-201: Branch A, `relationship: 'child of waqif'`, deceased 2019-05-02. The seed derives the
 * Arabic relationship copy from its `RELATIONSHIP` table — 'ابن الواقف' — and the registry renders
 * that Arabic on BOTH locales' pages, because Arabic is the authoritative script (NFR-01).
 */
const DECEASED_MEMBER = 'ben-201';
const DECEASED_MEMBER_BRANCH = 'Branch A';
const DECEASED_MEMBER_RELATIONSHIP_AR = 'ابن الواقف';
const DECEASED_MEMBER_ISO = '2019-05-02';
/**
 * The KYC pair. ben-206 is `verificationStatus: pending` with `kycLastRefreshed: null`, so the
 * computed freshness is UNVERIFIED regardless of any window. ben-205 is `verified`, refreshed
 * 2026-04-01 — inside the seeded `kyc.refreshIntervalMonths` (12, an UNVERIFIED figure, binding
 * rule 3), so it computes FRESH. ⚠ Freshness is computed against the wall clock on every read: if
 * this assertion ever reddens as STALE-instead-of-FRESH long after 2027-04, the fixture's refresh
 * date has aged past the window — move the fixture date, not the assertion.
 */
const KYC_UNVERIFIED_MEMBER = 'ben-206';
const KYC_FRESH_MEMBER = 'ben-205';
/** The three-generation chain on Branch C: ben-203 (deceased) → ben-210 → ben-216. */
const CHAIN_GRANDPARENT = 'ben-203';
const CHAIN_PARENT = 'ben-210';
const CHAIN_CHILD = 'ben-216';

/** The SHARED endowment: four members, incl. the BR-206 subject and a certified death. */
const SHARED_WAQF = 'waqf-002';
const SHARED_REGISTRY_SIZE = 4;
/** ben-009: `kind: category_only`, `category: null` — the CATEGORY_NOT_CAPTURED gate's subject. */
const BLOCKED_CATEGORY_MEMBER = 'ben-009';
/** ben-010: deceased 2024-06-15, certified. */
const SHARED_DECEASED_MEMBER = 'ben-010';
const SHARED_DECEASED_ISO = '2024-06-15';

/** The PUBLIC_CHARITABLE endowment: three jihas at fixed 40/30/30, and NO family member. */
const CHARITABLE_WAQF = 'waqf-003';
const CHARITABLE_JIHAS = ['ben-006', 'ben-306', 'ben-307'] as const;

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
 * The ar/en wording, READ FROM THE CATALOGUE — the test asserts THE SCREEN SHOWS THE CATALOGUE
 * (NFR-01), never that two copies of a string match.
 */
interface BeneficiariesCopy {
  readonly registryTitle: string;
  readonly kindValue: {
    readonly FAMILY: string;
    readonly CHARITABLE_JIHA: string;
    readonly CATEGORY_ONLY: string;
  };
  readonly kycValue: {
    readonly FRESH: string;
    readonly STALE: string;
    readonly UNVERIFIED: string;
  };
  readonly statusActive: string;
  readonly statusDeceased: string;
  readonly deathCertified: string;
  readonly categoryNotCaptured: string;
  readonly lineageTitle: string;
  readonly lineageEmpty: string;
  readonly nonLineageTitle: string;
  readonly integrityOk: string;
}

function catalogue(locale: 'ar' | 'en'): BeneficiariesCopy {
  const path = fileURLToPath(
    new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url),
  );
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    endowments: { beneficiaries: BeneficiariesCopy };
  };
  return json.endowments.beneficiaries;
}

/**
 * A raw dotted message key — what next-intl PRINTS when a message is missing, instead of throwing.
 * The trailing `[a-zA-Z]` discriminates a missing translation from an ordinary full stop.
 */
const RAW_KEY_PATTERN = /(?:endowments|errors|common|nav|auth)\.[a-zA-Z][a-zA-Z0-9_]*/;

/**
 * ⚠ THE LOAD-BEARING NEGATIVE OF THIS FILE (ADR-0009). The ẓuhūr/buṭūn `lineageLink` values are an
 * ELIGIBILITY FACT read for one computation — never a person's gender — and the loader DROPS the
 * field at the wire boundary, so no screen could render one even by mistake. This scan pins that:
 * the exact enum tokens must not appear as rendered text anywhere on the page.
 *
 * The lookarounds keep it honest in English, where `.qm-label` CSS-uppercases Latin headers and
 * `innerText` returns the TRANSFORMED text: `REASON` contains `SON` but has a letter on the
 * boundary, so it does not match; a standalone `SON` chip would. The scan is case-sensitive on
 * purpose — the enum members are SCREAMING_SNAKE, and lowercase English prose ("season", "person")
 * is not the defect being hunted.
 */
const FORBIDDEN_LINEAGE_TOKENS = /(?<![A-Z_])(SON|DAUGHTER|ZUHUR|BUTUN)(?![A-Z_])/;

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * THE SEAT HANDSHAKE — JOINED, NOT DUPLICATED. Same directory as `endowment.spec.ts`, so both
 * files elect ONE leader between them; the session is the shared artefact, never the secret.
 * The mechanics (and their measured history — the age-gated variant that went red once per
 * database, V-E3-04's shape) are recorded in that file; this is a consumer of the same contract.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

const CONTROL_HANDSHAKE_DIR = join(tmpdir(), 'qmulate-e2e-seat-case-manager');
const CONTROL_STATE = join(CONTROL_HANDSHAKE_DIR, 'storage-state.json');
const CONTROL_STALE = join(CONTROL_HANDSHAKE_DIR, 'stale.json');
const HANDSHAKE_STALE_MS = 15 * 60 * 1000;
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
 * ⚠ NOT A RETRY OF AN ASSERTION. Measured in CI (run `31969864722`): `socket hang up` at 22 ms on a
 * pre-flight `get-session`, because the dev server closes an idle socket at 6.00 s while `next dev`
 * blocks for seconds compiling routes. A transport fault has no status and no body — it says
 * nothing about the product. ONE re-attempt, only when the call THREW (an answered 4xx/5xx is a
 * RESULT and is returned untouched, so no refusal can be hidden here), only for the named faults;
 * the second failure names both causes. DUPLICATED per spec on purpose, like the TOTP generator:
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

/** Does the published `storageState` still resolve to the control seat? Validated by USE, not age. */
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
 * Establish (or join) the one enrolled session for the control seat. THROWS rather than degrading:
 * every test in this file is a POSITIVE read, and "the reading seat could not run" must never be
 * reported as a pass. Same contract as `endowment.spec.ts`'s `ensureControlSession` — the two
 * files share the directory, so whichever runs first does the one enrolment for both.
 */
async function ensureControlSession(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (await publishedSessionIsTheSeat(browser)) return;

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
        publishControlStale(
          `${CONTROL_SEAT.email} is TOTP-enrolled from an earlier run and no published session ` +
            `still resolves. Re-seed the database (or delete the seeded operators' \`two_factor\` ` +
            `rows) and re-run.`,
        );
      }
      expect(
        signIn.body.twoFactorRedirect,
        `${CONTROL_SEAT.email} carries a COMPLETED enrolment from an earlier run and no published ` +
          `session still resolves, so the registry journey cannot run. Re-seed (or delete the ` +
          `seeded operators' \`two_factor\` rows) and re-run — do NOT let this degrade into a skip.`,
      ).not.toBe(true);

      const enable = await post(context.request, '/two-factor/enable', {
        password: CONTROL_SEAT.password,
      });
      expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
      const secret = secretFromTotpUri(enable.body.totpURI);
      const verify = await post(context.request, '/two-factor/verify-totp', { code: totp(secret) });
      expect(verify.status, `verification failed: ${JSON.stringify(verify.body)}`).toBe(200);

      // ⚠ THE ENROLMENT IS PROVEN, NOT ASSUMED — `enable` + `verify-totp` both answer 200 while
      // `twoFactorEnabled` stays FALSE when a `two_factor` row survives a re-seed.
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
    `no session for ${CONTROL_SEAT.email} was published within ${String(FOLLOWER_WAIT_MS)}ms. ` +
      `The registry journey did NOT run — reported rather than skipped.`,
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
 * Compile a route SERVER-SIDE before a rendering assertion depends on it. `next dev` compiles a
 * route on its first request (measured: 1.5–7.6 s apiece, four workers competing), so warming pays
 * that cost through `context.request` — the same cookie jar, so the page renders for real — and
 * leaves every assertion below strict.
 */
async function warm(context: BrowserContext, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const response = await getSurvivingOneTransportFault(context.request, path);
    expect(
      response.status(),
      `warming ${path} answered ${String(response.status())}; the assertions below would fail ` +
        `for the wrong reason`,
    ).toBeLessThan(400);
  }
}

/** One seated read: the shared session verified as THE seat, then the body, then teardown. */
async function seatedRead(
  browser: Browser,
  testInfo: TestInfo,
  body: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  await ensureControlSession(browser, testInfo);
  const context = await browser.newContext({ storageState: CONTROL_STATE });
  const page = await context.newPage();
  try {
    // A stale state file would otherwise fail deep inside a screen assertion — "row not found" —
    // which points at the UI for an auth problem.
    const user = await sessionUser(context.request);
    expect(user?.email, 'the published session is not the control seat').toBe(CONTROL_SEAT.email);
    await body(page, context);
  } finally {
    await page.close();
    await context.close();
  }
}

/** No raw dotted message key reached the reader. Scoped to VISIBLE text, not `page.content()`. */
async function expectNoRawKeys(page: Page, where: string): Promise<void> {
  const visible = await page.locator('#qm-main').innerText();
  const match = RAW_KEY_PATTERN.exec(visible);
  expect(
    match?.[0] ?? null,
    `a raw message key was rendered on ${where} — the catalogue is missing an entry`,
  ).toBeNull();
}

/**
 * The ADR-0009 negative, applied to a whole rendered page: no `lineageLink` enum token, and not
 * the wire field's own name either. `#qm-main` covers the registry, the tree, the integrity panel
 * and every chip — everything this screen says.
 */
async function expectNoLineageLinkReachesTheReader(page: Page, where: string): Promise<void> {
  const visible = await page.locator('#qm-main').innerText();
  const match = FORBIDDEN_LINEAGE_TOKENS.exec(visible);
  expect(
    match?.[0] ?? null,
    `a ẓuhūr/buṭūn lineage-link token was RENDERED on ${where} — the eligibility fact must never ` +
      `reach a screen as though it were a person's gender (ADR-0009)`,
  ).toBeNull();
  expect(visible, `the wire field name "lineageLink" was rendered on ${where}`).not.toContain(
    'lineageLink',
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1 · THE SIXTEEN-MEMBER REGISTRY — a known row, a certified death, and the KYC contrast
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E4 · the sixteen-member registry renders: a known row, a certified death, and two different KYC labels', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedRead(browser, testInfo, async (page, context) => {
    const url = `/${locale}/endowments/${LINEAGE_WAQF}/beneficiaries`;
    await warm(context, [url]);
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

    // The screen is proven HEALTHY first — an absent row and a refused page look identical to an
    // assertion that only counts what is present further down.
    await expect(page.getByTestId('qm-endowment-tabs')).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.registryTitle })).toBeVisible();
    const registry = page.getByTestId('qm-beneficiary-registry');
    await expect(registry).toBeVisible();

    // ⚠ EXACTLY sixteen, not `>= 1`. The fixture's tree is the engine's worked example, record for
    // record; a row count that drifted would mean the seed and this suite disagree about the tree.
    await expect(registry.locator('tbody tr[data-beneficiary]')).toHaveCount(LINEAGE_REGISTRY_SIZE);

    /* ── 1a · A KNOWN ROW: the branch label and the AUTHORITATIVE Arabic relationship ────── */

    const deceasedRow = registry.locator(`tr[data-beneficiary="${DECEASED_MEMBER}"]`);
    await expect(deceasedRow).toHaveCount(1);
    // The Arabic relationship renders on BOTH locales' pages (NFR-01: the Arabic is the record's
    // authoritative copy, the English label is secondary and never replaces it).
    await expect(deceasedRow).toContainText(DECEASED_MEMBER_RELATIONSHIP_AR);
    await expect(deceasedRow).toContainText(DECEASED_MEMBER_BRANCH);

    /* ── 1b · THE CERTIFIED DEATH — the deceased state WITH its certification date ───────── */

    await expect(deceasedRow).toContainText(copy.statusDeceased);
    await expect(deceasedRow).toContainText(copy.deathCertified);
    // The date is asserted by its machine-readable ISO anchor (`<DateValue data-iso>`), which is
    // stable across locale formatting, and the row must NOT carry the scope-exit chip: a certified
    // death and a scope exit are DIFFERENT sentences (R7-D1) and must never share a rendering.
    await expect(deceasedRow.locator(`[data-iso^="${DECEASED_MEMBER_ISO}"]`)).toHaveCount(1);
    await expect(deceasedRow.getByTestId('qm-beneficiary-scope-exit')).toHaveCount(0);
    await expect(deceasedRow).not.toContainText(copy.statusActive);

    /* ── 1c · KYC: UNVERIFIED and FRESH are DIFFERENT labels, both from the catalogue ────── */

    const unverifiedChip = registry
      .locator(`tr[data-beneficiary="${KYC_UNVERIFIED_MEMBER}"]`)
      .getByTestId('qm-beneficiary-kyc');
    const freshChip = registry
      .locator(`tr[data-beneficiary="${KYC_FRESH_MEMBER}"]`)
      .getByTestId('qm-beneficiary-kyc');
    await expect(unverifiedChip).toContainText(copy.kycValue.UNVERIFIED);
    await expect(freshChip).toContainText(copy.kycValue.FRESH);
    // …and the two rendered labels genuinely differ — the collapse BR-205 forbids would satisfy
    // two `toContainText`s if the catalogue ever merged the strings, so the difference is pinned
    // on the RENDERED text, not only on the catalogue.
    const [unverifiedText, freshText] = await Promise.all([
      unverifiedChip.innerText(),
      freshChip.innerText(),
    ]);
    expect(
      unverifiedText.trim(),
      'the never-verified and the fresh KYC chips render the SAME label — BR-205 collapsed',
    ).not.toBe(freshText.trim());

    /* ── 1d · AND NO LINEAGE-LINK VALUE REACHES THE READER, ANYWHERE ON THE PAGE ─────────── */

    await expectNoLineageLinkReachesTheReader(page, url);
    await expectNoRawKeys(page, url);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2 · THE LINEAGE TREE — nesting follows the recorded parent edges; the integrity all-clear
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E4 · the lineage tree nests three generations by the recorded edges, and the integrity panel is all-clear', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedRead(browser, testInfo, async (page, context) => {
    const url = `/${locale}/endowments/${LINEAGE_WAQF}/beneficiaries`;
    await warm(context, [url]);
    await page.goto(url);

    await expect(page.getByRole('heading', { name: copy.lineageTitle })).toBeVisible();
    const tree = page.getByTestId('qm-lineage-tree');
    await expect(tree).toBeVisible();

    // The four children of the waqif — and ONLY they — sit at the root. A flat list (every member
    // drawn at depth zero) would satisfy a bare "the node exists" assertion, which is why the
    // DIRECT-child count is pinned.
    await expect(tree.locator('> li')).toHaveCount(LINEAGE_ROOT_COUNT);

    /**
     * ⚠ THE NESTING IS ASSERTED AS DOM CONTAINMENT, three generations deep, on Branch C:
     * ben-203 (a deceased child of the waqif) → ben-210 → ben-216. `TreeNode` renders a child as
     * an `<li data-lineage-node>` INSIDE its parent's `<li>`, so ancestor-descendant containment
     * is exactly the recorded edge. Each member is also pinned to appear EXACTLY once — a member
     * drawn both nested and at the root would double-count silently otherwise.
     */
    await expect(page.locator(`[data-lineage-node="${CHAIN_CHILD}"]`)).toHaveCount(1);
    await expect(
      page.locator(`[data-lineage-node="${CHAIN_PARENT}"] [data-lineage-node="${CHAIN_CHILD}"]`),
      `${CHAIN_CHILD} is not drawn inside ${CHAIN_PARENT}'s subtree — the recorded edge is not the nesting`,
    ).toHaveCount(1);
    await expect(
      page.locator(
        `[data-lineage-node="${CHAIN_GRANDPARENT}"] [data-lineage-node="${CHAIN_PARENT}"]`,
      ),
      `${CHAIN_PARENT} is not drawn inside ${CHAIN_GRANDPARENT}'s subtree`,
    ).toHaveCount(1);

    // No jiha section on a family endowment: every waqf-005 member is a descendant.
    await expect(page.getByTestId('qm-lineage-non-descendants')).toHaveCount(0);

    /* ── THE INTEGRITY ALL-CLEAR, AND NOT MERELY "NO FINDINGS RENDERED" ──────────────────── */

    // The seeded tree is coherent (every member carries its edge, every recorded ṭabaqa agrees
    // with the derived depth), so the panel must show its POSITIVE all-clear chip — a panel that
    // failed to load would also render no finding sections, which is why the chip is required
    // rather than the sections merely absent.
    await expect(page.getByTestId('qm-lineage-integrity-ok')).toBeVisible();
    await expect(page.getByTestId('qm-lineage-integrity-ok')).toContainText(copy.integrityOk);
    for (const section of [
      'missingLineageLink',
      'tabaqaMismatch',
      'rootedOutsideWaqif',
      'cycles',
    ] as const) {
      await expect(page.getByTestId(`qm-lineage-integrity-${section}`)).toHaveCount(0);
    }
    // A coherent graph shows no per-node disagreement chip either.
    await expect(page.getByTestId('qm-lineage-tier-mismatch')).toHaveCount(0);

    await expectNoLineageLinkReachesTheReader(page, url);
    await expectNoRawKeys(page, url);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3 · waqf-002 — BR-206's "disbursement blocked" ON THE ROW, and a second certified death
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E4 · an uncaptured CATEGORY_ONLY row says disbursement-blocked on the row, and the deceased member is certified', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedRead(browser, testInfo, async (page, context) => {
    const url = `/${locale}/endowments/${SHARED_WAQF}/beneficiaries`;
    await warm(context, [url]);
    await page.goto(url);

    const registry = page.getByTestId('qm-beneficiary-registry');
    await expect(registry).toBeVisible();
    await expect(registry.locator('tbody tr[data-beneficiary]')).toHaveCount(SHARED_REGISTRY_SIZE);

    /* ── 3a · BR-206: the gate's rank-0 reason, said in words ON THE ROW ──────────────────── */

    const blockedRow = registry.locator(`tr[data-beneficiary="${BLOCKED_CATEGORY_MEMBER}"]`);
    await expect(blockedRow).toHaveCount(1);
    await expect(blockedRow.getByTestId('qm-beneficiary-kind')).toContainText(
      copy.kindValue.CATEGORY_ONLY,
    );
    const blockedChip = blockedRow.getByTestId('qm-beneficiary-category-blocked');
    await expect(
      blockedChip,
      `${BLOCKED_CATEGORY_MEMBER} (category never captured) does not say it is disbursement-blocked`,
    ).toBeVisible();
    await expect(blockedChip).toContainText(copy.categoryNotCaptured);

    /* ── 3b · ben-010: deceased WITH its certification — never a scope exit ───────────────── */

    const deceasedRow = registry.locator(`tr[data-beneficiary="${SHARED_DECEASED_MEMBER}"]`);
    await expect(deceasedRow).toContainText(copy.statusDeceased);
    await expect(deceasedRow).toContainText(copy.deathCertified);
    await expect(deceasedRow.locator(`[data-iso^="${SHARED_DECEASED_ISO}"]`)).toHaveCount(1);
    await expect(deceasedRow.getByTestId('qm-beneficiary-scope-exit')).toHaveCount(0);
    // …and the certified death carries no BR-206 chip of its own: the two states are about
    // different members and must not bleed across rows.
    await expect(deceasedRow.getByTestId('qm-beneficiary-category-blocked')).toHaveCount(0);

    await expectNoLineageLinkReachesTheReader(page, url);
    await expectNoRawKeys(page, url);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 4 · waqf-003 — three jihas with kind chips, listed OUTSIDE the lineage, and NO tree node
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E4 · a charitable endowment renders its jihas with kind chips, outside the lineage, with no tree node at all', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedRead(browser, testInfo, async (page, context) => {
    const url = `/${locale}/endowments/${CHARITABLE_WAQF}/beneficiaries`;
    await warm(context, [url]);
    await page.goto(url);

    /* ── 4a · THE REGISTRY: three rows, three CHARITABLE_JIHA kind chips ──────────────────── */

    const registry = page.getByTestId('qm-beneficiary-registry');
    await expect(registry).toBeVisible();
    await expect(registry.locator('tbody tr[data-beneficiary]')).toHaveCount(
      CHARITABLE_JIHAS.length,
    );
    for (const jiha of CHARITABLE_JIHAS) {
      await expect(
        registry.locator(`tr[data-beneficiary="${jiha}"]`).getByTestId('qm-beneficiary-kind'),
        `${jiha} does not carry the charitable-jiha kind chip`,
      ).toContainText(copy.kindValue.CHARITABLE_JIHA);
    }

    /* ── 4b · THE TREE: no descendants, so NO tree — and the jihas listed as outside it ───── */

    // A jiha legitimately carries no parent edge, which is the same shape as a child of the
    // waqif; drawing one at the tree's root would state a bloodline the deed never recorded. So:
    // no tree at all (the empty sentence renders instead), not one tree node anywhere, and the
    // three jihas named in their own "outside the lineage" section.
    await expect(page.getByTestId('qm-lineage-tree')).toHaveCount(0);
    await expect(page.getByText(copy.lineageEmpty)).toBeVisible();
    await expect(page.locator('[data-lineage-node]')).toHaveCount(0);

    const outside = page.getByTestId('qm-lineage-non-descendants');
    await expect(outside).toBeVisible();
    await expect(outside).toContainText(copy.nonLineageTitle);
    for (const jiha of CHARITABLE_JIHAS) {
      await expect(outside, `${jiha} is missing from the outside-the-lineage list`).toContainText(
        jiha,
      );
    }

    await expectNoLineageLinkReachesTheReader(page, url);
    await expectNoRawKeys(page, url);
  });
});
