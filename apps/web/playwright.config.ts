import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Both locales are first-class projects, not a parameterised afterthought. Arabic is the
 * product default; an `en`-only suite would let an RTL regression ship, which is the exact
 * failure mode 11-localization-spec.md exists to prevent.
 *
 * Each project sets the browser's own locale so `Intl`-driven rendering matches the route
 * under test; the specs read `testInfo.project.name` to pick their URL prefix.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  /**
   * Fails the run if the dev server restarted mid-suite. See the `webServer` block below: that
   * restart is the root cause of the S5–S7 flake class, and `retries: 1` above was absorbing exactly
   * one victim of it per run — which is how seven consecutive CI runs went green with the defect live.
   */
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // KSA operating timezone — dual-calendar rendering must not drift with the runner's TZ.
    timezoneId: 'Asia/Riyadh',
  },

  projects: [
    {
      name: 'ar',
      use: { ...devices['Desktop Chrome'], locale: 'ar-SA' },
    },
    {
      name: 'en',
      use: { ...devices['Desktop Chrome'], locale: 'en-SA' },
    },
  ],

  webServer: {
    /**
     * ⚠ THE **PRODUCTION** SERVER, BEHIND A WRAPPER THAT WILL NOT LET A SERVER RESTART PASS AS A
     * GREEN RUN (S7 — owner-approved 2026-08-19).
     *
     * ROOT CAUSE OF THE S5–S7 E2E FLAKE CLASS, measured rather than inferred. `next dev`'s request
     * listener re-checks the V8 heap after EVERY request and exits the process when it crosses 80%
     * of the limit (`next/dist/server/lib/start-server.js`, inside `requestListener`'s `finally`,
     * gated on `isDev`):
     *
     *     if (v8.getHeapStatistics().used_heap_size > 0.8 * v8.getHeapStatistics().heap_size_limit) {
     *       log.warn('Server is approaching the used memory threshold, restarting...');
     *       process.exit(RESTART_EXIT_CODE);
     *     }
     *
     * The supervisor restarts it — and for the ~2.9 s it takes to come back, NOTHING IS BOUND TO
     * :3000, so whichever navigation is in flight dies with `net::ERR_CONNECTION_REFUSED`. CI run
     * 32140325175 shows the whole causal chain with nothing between the lines: a 200 on `…/deed`,
     * the warning, the failure on the very next sub-route (`…/classification`),
     * `▲ Next.js 15.5.22`, `✓ Ready in 2.9s`, then the same test passing on retry #1.
     *
     * THE CORRELATION WAS 7 FOR 7 across every recorded E2E leg, and the shape of it is the useful
     * part: **exactly one warning per run — never zero, never two.** The restart was
     * DETERMINISTIC; only the victim was stochastic, which is why the flake was always `1 flaky`
     * and never `2 flaky`, why `workers: 1` shrank the blast radius without ever removing it, and
     * why the only clean run in the table was the 64-test one — the suite crossed the budget when
     * it grew to 72. With `retries: 1` the margin was exactly one.
     *
     * ── WHAT IS SHIPPED HERE ─────────────────────────────────────────────────────────────────
     *
     * **`e2e/web-server.mjs` now spawns `next start` over a `next build`.** `isDev` is false, so
     * the branch above CANNOT EXECUTE — the only measured route to zero crossings. Measured when
     * the option was first explored: the build needs **no database** (every route is `ƒ`, only
     * `/_not-found` prerenders) and takes **~25 s**, replacing the ~5 min of in-run compilation
     * that dominated the 7.5-minute job, with **0** memory-threshold warnings on a full cold run.
     *
     * What had blocked it was auth, not memory: a production server **429s the suite**, because
     * better-auth's rate limiter is OFF in development and ON in production and this repo
     * configured none — which is also how we learned **the limiter had never been exercised by any
     * test here**. It now has an explicit posture and a doubly-gated, FAIL-CLOSED test override
     * (`packages/auth/src/rate-limit.ts`; `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` +
     * `DATA_CLASSIFICATION=fixture-only`, both required). ⚠ **That variable is set by the E2E JOB's
     * environment, not by this file and not by the wrapper** — a harness that relaxed a security
     * control on its own authority would relax it everywhere it ran. Locally it comes from the
     * command in BUILD-PLAN.md's "Run locally" block; in CI from `ci.yml`'s e2e job alone.
     *
     * ⚠ **THE TRIPWIRE STAYS, AND ITS JOB HAS CHANGED.** The wrapper still scans the server's
     * output for the warning and `globalTeardown` still turns a hit into a **FAILED RUN** — but
     * under a production build the branch is unreachable, so a hit now means **the suite has been
     * silently reverted to `next dev`**. That is the regression this file could not otherwise
     * detect, and it is the reason not to delete the guard once the symptom is gone.
     *
     * ⚠ **AND THERE IS STILL NO TUNING ROUTE — MEASURED.** An earlier attempt pinned
     * `--max-old-space-size=4096`, reasoning that a declared budget beats a host-derived one. It
     * turned a clean **72 passed / 0 crossings** run into **1 failed · 3 flaky · 68 passed with a
     * crossing**, because `used_heap_size` counts uncollected garbage: a bigger limit lets V8 defer
     * GC and cross 80% of a bigger number. The pin survives only as the reproducer, and now needs
     * `E2E_WEB_SERVER_COMMAND='pnpm --filter web dev'` alongside it, since the default child has no
     * such branch.
     */
    command: 'node e2e/web-server.mjs',
    url: `${BASE_URL}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    /**
     * ⚠ THE PRIVILEGED CREDENTIALS ARE STRIPPED FROM THE WEB SERVER'S ENVIRONMENT (ADR-0008 round 6).
     *
     * `apps/web/src/instrumentation.ts` calls `assertNoPrivilegedDatabaseUrls()` at boot and REFUSES TO
     * START if it finds `MIGRATOR_DATABASE_URL` or `SUPERUSER_DATABASE_URL`. That guard is the point —
     * either credential owns every table and can suspend every guard trigger in migrations 1-11 — and
     * it fired here first: the migrate/seed steps that must run before an e2e suite need those
     * variables, Playwright's `webServer` inherits the whole shell environment, and the dev server
     * refused to boot with `PrivilegedDatabaseUrlError`. MEASURED, on the first e2e run after the split.
     *
     * Clearing them HERE rather than in the surrounding shell means this suite MODELS THE DEPLOYMENT
     * POSTURE instead of depending on whoever invoked it having been careful: the app under test holds
     * exactly the credentials a deployed web service is supposed to hold. It also means the guard is
     * exercised in anger — an e2e run that starts at all is one where the stripping worked.
     */
    /**
     * ⚠ AND NOTE WHAT IS **NOT** HERE: `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT`. The rate-limit
     * relaxation is a property of the ENVIRONMENT THE SUITE IS INVOKED IN (ci.yml's e2e job, or the
     * documented local command), never something this config grants itself. Playwright merges this
     * block over `process.env`, so the variable is inherited when it is legitimately set — and
     * absent, with the limiter fully ON, when it is not. That is the fail-closed direction.
     */
    env: {
      MIGRATOR_DATABASE_URL: '',
      SUPERUSER_DATABASE_URL: '',
      // S10/T1: the queue credential is WORKER-ONLY and apps/web's boot refuses it too
      // (assertNoWorkerOnlyDatabaseUrls). Same mechanism as the two above — the harness chain
      // legitimately holds it (dev-postgres injects it for the provision step), Playwright's
      // webServer inherits the whole shell environment, and a child env can be overridden but
      // never deleted. Blanked so the app under test holds exactly a deployed web service's
      // credentials, and the guard is exercised in anger on every run that boots.
      PGBOSS_DATABASE_URL: '',
    },
  },
});
