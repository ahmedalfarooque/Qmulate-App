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

import {
  expect,
  type APIRequestContext,
  type Browser,
  type APIResponse,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `e2e/support/seat-handshake.ts` — THE CROSS-LOCALE SEAT HANDSHAKE, IN ONE PLACE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **S11 — the extraction `S11-2` declared owed at the second copy and item 2c escalated at the third.**
 *
 * ── WHAT IT SOLVES ─────────────────────────────────────────────────────────────────────────────
 * Playwright runs this suite as two PROJECTS, `[ar]` and `[en]`, against one database. TOTP
 * enrolment is a ONE-WAY DOOR — better-auth returns the secret exactly once — so both projects
 * cannot enrol the same seat. One becomes the LEADER, enrols, and publishes a `storageState`; the
 * other FOLLOWS and loads it. When the leader cannot enrol at all it publishes the REASON instead,
 * so the follower fails fast and named rather than timing out inside a screen assertion.
 *
 * ── WHY IT WAS COPIED THREE TIMES, AND WHAT THE COPIES HAD BECOME ──────────────────────────────
 * Each journey needs its own seat, and the machinery closed over that seat and its handshake
 * directory as module constants, so "copy the file, change two identifiers" was the cheap move.
 * **Measured at the moment of extraction, the copies HAD already drifted:** `ensureSeatSession` was
 * 3,840 B in `endowment-journey` against 2,525 B in the other two, and `seatedJourney` 2,367 B
 * against 1,266 B. ⊕ **The divergence was documentation and error wording ONLY — ZERO non-comment
 * differing lines**, which is why this collapse is safe. This module takes the RICHEST version, so
 * the two thinner copies gain explanations and actionable error text they did not have.
 *
 * ⚠ `distribution.spec.ts` defines a DIFFERENT `ensureSeatSession(browser, seat, testInfo)` — a
 * single-locale helper with its own signature. It is deliberately NOT folded in: merging two things
 * because they share a name is how a shared module becomes a place where behaviour hides.
 *
 * A pin (`test/e2e-harness-single-source.test.ts`) asserts no spec re-defines the handshake. It was
 * written BEFORE this module existed and watched fail on all three copies.
 */

/** Published in `packages/database/src/seed/map.ts`; the seed prints it. Not a secret. */
export const SEED_PASSWORD = 'fixture-only-not-a-secret-9271';

/** Mirrors `playwright.config.ts`. better-auth needs an explicit `Origin` — see `post`. */
export const BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL']?.replace(/\/$/, '') ?? 'http://localhost:3000';

export interface Seat {
  readonly email: string;
  readonly password: string;
}

export function base32Decode(input: string): Buffer {
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

export function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(at / 1000 / 30), 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function secretFromTotpUri(uri: unknown): string {
  if (typeof uri !== 'string') throw new Error(`no totpURI returned (got ${typeof uri})`);
  const secret = new URL(uri).searchParams.get('secret');
  if (secret === null || secret === '') throw new Error(`no secret in totpURI: ${uri}`);
  return secret;
}

export function localeFor(projectName: string): 'ar' | 'en' {
  return projectName === 'ar' ? 'ar' : 'en';
}

export async function post(
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

export const TRANSPORT_FAULT =
  /socket hang up|ECONNRESET|EPIPE|socket disconnected|connection closed|connection was reset/i;

export async function getSurvivingOneTransportFault(
  request: APIRequestContext,
  url: string,
  options?: { maxRedirects?: number },
): Promise<APIResponse> {
  try {
    return await request.get(url, options);
  } catch (first) {
    if (!TRANSPORT_FAULT.test(String(first))) throw first;
    // Printed, not swallowed: a run that hit this must be visible in the log a human reads.
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
export async function sessionUser(
  request: APIRequestContext,
): Promise<Record<string, unknown> | undefined> {
  const response = await getSurvivingOneTransportFault(request, '/api/auth/get-session');
  if (!response.ok()) return undefined;
  const body = (await response.json()) as { user?: Record<string, unknown> } | null;
  return body?.user ?? undefined;
}

/**
 * The handshake bound to ONE seat, ONE shared directory and ONE endowment for its complementary
 * assertion. Called once at a journey's module scope; nothing here is global, which is what lets
 * several journeys hold different seats in the same run without colliding.
 */
export function createSeatHandshake(options: {
  readonly seat: Seat;
  /** A directory name unique to this seat, under the OS temp dir. */
  readonly handshakeDirName: string;
  /** The endowment the stale-path assertion navigates to — each journey's own subject. */
  readonly waqfId: string;
}) {
  const SEAT = options.seat;
  const WAQF_ID = options.waqfId;
  const HANDSHAKE_DIR = join(tmpdir(), options.handshakeDirName);
  /** Playwright `storageState` for the enrolled seat — the shared artefact. */
  const SEAT_STATE = join(HANDSHAKE_DIR, 'storage-state.json');
  /** Written instead when the seat cannot be enrolled at all, so followers fail fast with the reason. */
  const SEAT_STALE = join(HANDSHAKE_DIR, 'stale.json');
  /** Longer than any single run, shorter than any gap between runs. */
  const HANDSHAKE_STALE_MS = 15 * 60 * 1000;
  const FOLLOWER_WAIT_MS = 20_000;

  type SeatClaim = { readonly kind: 'enrolled' } | { readonly kind: 'stale'; readonly why: string };

  function ageMs(path: string): number {
    try {
      return Date.now() - statSync(path).mtimeMs;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function publishStale(why: string): void {
    const temporary = `${SEAT_STALE}.${String(process.pid)}.tmp`;
    writeFileSync(temporary, JSON.stringify({ stale: why, at: Date.now() }), 'utf8');
    renameSync(temporary, SEAT_STALE);
  }

  function readStale(): string | null {
    try {
      return (JSON.parse(readFileSync(SEAT_STALE, 'utf8')) as { stale: string }).stale;
    } catch {
      return null;
    }
  }

  /** Become the leader if nobody is, resetting a handshake left behind by an earlier run. */
  function tryBecomeLeader(): boolean {
    if (ageMs(HANDSHAKE_DIR) > HANDSHAKE_STALE_MS) {
      rmSync(HANDSHAKE_DIR, { recursive: true, force: true });
    }
    try {
      mkdirSync(HANDSHAKE_DIR);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Establish (or join) the one enrolled session for the reading seat.
   *
   * `attempt` exists for ONE measured case: a handshake left on disk by a PREVIOUS run whose session no
   * longer resolves, typically because the database was re-seeded in between. Discarding it and trying
   * once more recovers a real journey instead of degrading to the complementary assertion.
   */
  async function ensureSeatSession(
    browser: Browser,
    testInfo: TestInfo,
    attempt = 1,
  ): Promise<SeatClaim> {
    if (existsSync(SEAT_STATE) && ageMs(HANDSHAKE_DIR) <= HANDSHAKE_STALE_MS) {
      return { kind: 'enrolled' };
    }

    if (tryBecomeLeader()) {
      const context = await browser.newContext();
      try {
        const signIn = await post(context.request, '/sign-in/email', { ...SEAT });
        expect(
          signIn.status,
          `the seeded reading seat cannot sign in: ${JSON.stringify(signIn.body)}`,
        ).toBe(200);

        if (signIn.body.twoFactorRedirect === true) {
          // The seat carries a COMPLETED enrolment from an earlier run, so its secret is
          // unrecoverable. Tell the followers rather than leaving them to wait, and name the remedy.
          publishStale('already TOTP-enrolled before this run — re-seed and re-run');
          return { kind: 'stale', why: 'the seat was already TOTP-enrolled before this run' };
        }

        const enable = await post(context.request, '/two-factor/enable', {
          password: SEAT.password,
        });
        expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
        const secret = secretFromTotpUri(enable.body.totpURI);
        const verify = await post(context.request, '/two-factor/verify-totp', {
          code: totp(secret),
        });
        expect(verify.status, `verification failed: ${JSON.stringify(verify.body)}`).toBe(200);

        /**
         * ⚠ THE ENROLMENT IS PROVEN, NOT ASSUMED — and this assertion exists because the alternative
         * was measured. `/two-factor/enable` and `/two-factor/verify-totp` both answered 200 while
         * `user.twoFactorEnabled` STAYED FALSE, because a `two_factor` row survived from a previous run
         * (`pnpm db:seed` resets the user's flag but leaves the secret row, so `enable` short-circuits).
         * Every screen then refused with `TOTP_ENROLMENT_REQUIRED` and sixteen tests failed pointing at
         * headings and refusals — never at the session. Checking the flag here turns that into one
         * sentence at the source. If it fires: delete the seeded operators' `two_factor` rows (or
         * re-create the database) before re-running.
         */
        const user = await sessionUser(context.request);
        expect(
          user?.twoFactorEnabled,
          `${SEAT.email} reported a successful TOTP enrolment while still un-enrolled. A ` +
            `\`two_factor\` row from an earlier run survives \`db:seed\` (which resets the user flag ` +
            `but not the secret), so \`/two-factor/enable\` no longer enables anything. Delete the ` +
            `seeded operators' \`two_factor\` rows, or re-create the cluster, and re-run.`,
        ).toBe(true);

        const temporary = `${SEAT_STATE}.${String(process.pid)}.tmp`;
        await context.storageState({ path: temporary });
        renameSync(temporary, SEAT_STATE);
        testInfo.annotations.push({
          type: 'seat',
          description: `${SEAT.email} enrolled; session published for both locales`,
        });
        return { kind: 'enrolled' };
      } finally {
        await context.close();
      }
    }

    // FOLLOWER — wait for the leader to publish a session (or a reason it could not).
    const deadline = Date.now() + FOLLOWER_WAIT_MS;
    while (Date.now() < deadline) {
      if (existsSync(SEAT_STATE)) return { kind: 'enrolled' };
      const stale = readStale();
      if (stale !== null) return { kind: 'stale', why: stale };
      await new Promise((done) => setTimeout(done, 250));
    }
    if (attempt < 2) {
      // The leader died without publishing either artefact; take the handshake over.
      rmSync(HANDSHAKE_DIR, { recursive: true, force: true });
      return ensureSeatSession(browser, testInfo, attempt + 1);
    }
    return { kind: 'stale', why: `no session was published within ${String(FOLLOWER_WAIT_MS)}ms` };
  }

  /**
   * The complementary property, asserted whenever the handshake could not complete.
   *
   * Returning early with NO assertion is how a skipped check gets reported as a pass. Without a
   * completed second factor there is no session, so the endowment screens must stay unreachable —
   * and this is the UNAUTHENTICATED refusal, NOT the "authenticated but ungranted" one. The ladder
   * must not collapse the two.
   */
  async function assertNoSessionReachesTheRecord(
    page: Page,
    locale: 'ar' | 'en',
    claim: { readonly why: string },
    testInfo: TestInfo,
  ): Promise<void> {
    const note = `SEAT UNAVAILABLE (${claim.why}) — asserted the complementary refusal instead`;
    testInfo.annotations.push({ type: 'seat', description: note });
    // Printed, not only annotated: the list reporter shows stdout, so a run that degraded is visible
    // in the log a human actually reads rather than only in a JSON report nobody opens.
    console.log(`[E3-JOURNEY][${locale}] ${note}`);

    await page.goto(`/${locale}/endowments/${WAQF_ID}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/(sign-in|two-factor)`));
  }

  /**
   * One seated journey: a fresh context, the seat claimed, and the body run — or the complementary
   * refusal asserted when the seat could not be claimed.
   *
   * ⚠ THE JOURNEY IS SPLIT ACROSS SEVERAL SMALL TESTS RATHER THAN ONE LONG ONE, and the reason is
   * measured rather than stylistic. Playwright's per-test budget is 30 s and this suite runs against
   * `next dev`, which COMPILES EACH ROUTE ON FIRST REQUEST: 1.5–6.7 s apiece, with four workers
   * competing for the same server (measured on the first real run of this file, where a single
   * eleven-navigation test timed out at exactly 30 s while its `en` twin finished at 29.1 s — a green
   * that was one route away from red). Widening the budget would have hidden that cost instead of
   * removing it, so the work is divided until each test fits inside the budget it was given.
   */
  async function seatedJourney(
    browser: Browser,
    testInfo: TestInfo,
    locale: 'ar' | 'en',
    body: (page: Page, context: BrowserContext) => Promise<void>,
    attempt = 1,
  ): Promise<void> {
    const claim = await ensureSeatSession(browser, testInfo);
    if (claim.kind === 'stale') {
      const context = await browser.newContext();
      try {
        await assertNoSessionReachesTheRecord(await context.newPage(), locale, claim, testInfo);
      } finally {
        await context.close();
      }
      return;
    }

    // The published session, loaded into a context of this test's own.
    const context: BrowserContext = await browser.newContext({ storageState: SEAT_STATE });
    try {
      /**
       * ⚠ THE SESSION IS VERIFIED BEFORE THE BODY RUNS, and this check is the difference between a
       * failure that names its cause and sixteen that do not. A published state file that no longer
       * resolves to the seat (a re-seeded database, an expired session) would otherwise fail deep
       * inside a screen assertion — "heading not found" — which points at the UI for an auth problem.
       */
      const user = await sessionUser(context.request);
      const usable = user?.email === SEAT.email && user.twoFactorEnabled === true;
      if (!usable) {
        /**
         * ⚠ `twoFactorEnabled` IS CHECKED HERE, NOT ONLY THE EMAIL. A published session can resolve to
         * the right account and still be refused by `evaluateAuthGate`, which reads exactly this flag
         * (`hasTotpEnrolled`) — measured: a state file from an earlier run whose seat had since lost its
         * enrolment produced a 30 s timeout inside a layout assertion, because the page under test was
         * the TOTP enrolment screen. Discarding the handshake and re-establishing it once turns that
         * into a real journey; a second failure raises with the reason instead of guessing.
         */
        rmSync(HANDSHAKE_DIR, { recursive: true, force: true });
        if (attempt < 2) {
          await context.close();
          await seatedJourney(browser, testInfo, locale, body, attempt + 1);
          return;
        }
        throw new Error(
          `the published session is not a usable seat: email=${String(user?.email)} ` +
            `twoFactorEnabled=${String(user?.twoFactorEnabled)}`,
        );
      }

      await body(await context.newPage(), context);
    } finally {
      await context.close();
    }
  }

  return {
    ensureSeatSession,
    seatedJourney,
    assertNoSessionReachesTheRecord,
    HANDSHAKE_DIR,
    SEAT_STATE,
  };
}
