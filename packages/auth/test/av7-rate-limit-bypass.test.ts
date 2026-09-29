/**
 * AV7 — ADVERSARY PROBE. TRYING TO DISABLE THE AUTH RATE LIMITER WITHOUT BOTH CONDITIONS.
 *
 * NOT a regression suite. `test/rate-limit.test.ts` already asserts the truth table, the schema
 * refusals and a real 429 on `/sign-in`. This file goes after what that suite does NOT cover:
 *
 *   A. `/two-factor/*` — the header and the CI comment both CLAIM a built-in 3-per-10 s rule on
 *      it, and the E2E 429s were measured there. No test installs the twoFactor plugin, so the
 *      claim has never been taken. Item 8 of the brief: measure a real 429, do not read a config.
 *   B. THE POSTURE IS READ LAZILY FROM A MEMOISED ENV, and `resetEnvCacheForTests` is exported on
 *      the package's public surface. So: can the posture be re-decided in-process, after boot?
 *   C. Exotic values the existing table does not carry — unicode look-alikes, zero-width
 *      characters, a trailing newline. Each must land on ACTIVE or on a BOOT FAILURE, never on
 *      relaxed.
 *   D. `NODE_ENV` — the posture is supposed to be independent of it. Asserted as a fact about the
 *      running worker rather than as a comment.
 *   E. ⚠ THE FILE-INJECTION ASYMMETRY — **THIS SECTION IS NOW INVERTED (AV7-AUD-F5, MEDIUM).**
 *      `loadRootEnv()` kept `DATA_CLASSIFICATION` off the list of things a stray `.env` may set,
 *      because "a guardrail a stray untracked file can satisfy is not a guardrail". The rate-limit
 *      override is the same kind of guardrail and was NOT on that list — and the exposure was
 *      bigger than the list, because `apps/web` does not use that loader at all. MEASURED with
 *      `apps/web/next.config.ts`'s own call, `loadEnvConfig(repoRoot, NODE_ENV !== 'production')`:
 *
 *          NODE_ENV=<unset>     -> loadedEnvFiles [".env.development",".env"] -> override injected
 *          NODE_ENV=test        -> loadedEnvFiles [".env.test",".env"]        -> override injected
 *          NODE_ENV=development -> loadedEnvFiles [".env.development",".env"] -> override injected
 *          NODE_ENV=production  -> loadedEnvFiles [".env.production"]         -> override injected
 *
 *      and `.gitignore` covered `.env`, `.env.local`, `.env.*.local` but NOT `.env.production`,
 *      `.env.test`, `.env.development`:
 *
 *          NOT IGNORED (committable): .env.test / .env.development / .env.production
 *
 *      So a COMMITTED file satisfied BOTH conditions of the fail-closed override on the process
 *      that serves `/api/auth/*`, and `NODE_ENV` still selected the posture — not through any
 *      branch in `packages/auth` (grepped; there is none) but through WHICH FILE Next reads. The
 *      property the S7 change removed was reachable again one file away.
 *
 *      Section E now pins all three fixes, and each one is a fact this suite can check rather than
 *      a convention: (1) `.gitignore` ignores `.env.*`, asked of `git check-ignore -v` so the
 *      answer names the rule that matched; (2) `NEVER_FROM_FILE` lists the override; (3) the
 *      variable appears in `.github/workflows/ci.yml` ONLY inside the `e2e` job, and in no tracked
 *      `.env*` file. ⚠ (2) does NOT cover `apps/web`; (1) and (3) are what do.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { twoFactor } from 'better-auth/plugins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_RATE_LIMIT_TEST_OVERRIDE,
  DATA_CLASSIFICATIONS,
  resetEnvCacheForTests,
  serverEnvSchema,
} from '@qmulate/config/env';
import { NEVER_FROM_FILE, parseEnvFile } from '@qmulate/config/load-env';

import { authRateLimitOptions, authRateLimitPosture } from '../src/rate-limit';

const VALID_SERVER_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://qmulate:qmulate@localhost:5432/qmulate_test?schema=public',
  DATA_CLASSIFICATION: 'fixture-only',
  BETTER_AUTH_SECRET: 'test-only-not-a-real-secret-0000000000000000',
  BETTER_AUTH_URL: 'http://localhost:3000',
};

/** A real instance WITH the twoFactor plugin — the shape `src/server.ts` actually builds. */
function makeAuthWithTwoFactor(enabled: boolean) {
  return betterAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      twoFactor: [],
      rateLimit: [],
    }),
    baseURL: 'http://localhost:3000',
    secret: 'test-only-not-a-real-secret-0000000000000000',
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    rateLimit: { enabled, window: 10, max: 100 },
    plugins: [twoFactor({ issuer: 'QMULATE', totpOptions: { digits: 6, period: 30 } })],
  });
}

async function burst(
  auth: ReturnType<typeof makeAuthWithTwoFactor>,
  path: string,
  ip: string,
  count: number,
  body: unknown,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      }),
    );
    statuses.push(response.status);
  }
  return statuses;
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * A · /two-factor/* — the claim nobody had measured
 * ══════════════════════════════════════════════════════════════════════════════════════ */

describe('AV7/A · the limiter on /two-factor/* — measured, not read off a comment', () => {
  it('ATTACK · a burst on /two-factor/verify-totp is REFUSED with 429 (override absent)', async () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: undefined,
      dataClassification: 'fixture-only',
    });
    expect(posture.enabled).toBe(true);

    const statuses = await burst(
      makeAuthWithTwoFactor(posture.enabled),
      '/two-factor/verify-totp',
      '198.51.100.20',
      6,
      { code: '000000' },
    );
    console.log(`AV7/A verify-totp, limiter ON  => ${statuses.join(',')}`);
    expect(statuses).toContain(429);
  });

  it('POSITIVE CONTROL · the SAME burst gets no 429 when both conditions hold', async () => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: AUTH_RATE_LIMIT_TEST_OVERRIDE,
      dataClassification: 'fixture-only',
    });
    expect(posture.enabled).toBe(false);

    const statuses = await burst(
      makeAuthWithTwoFactor(posture.enabled),
      '/two-factor/verify-totp',
      '198.51.100.21',
      6,
      { code: '000000' },
    );
    console.log(`AV7/A verify-totp, limiter OFF => ${statuses.join(',')}`);
    expect(statuses).not.toContain(429);
  });

  it('ATTACK · /two-factor/enable — the path the E2E suite actually 429d on', async () => {
    const on = await burst(makeAuthWithTwoFactor(true), '/two-factor/enable', '198.51.100.22', 6, {
      password: 'not-the-password',
    });
    const off = await burst(
      makeAuthWithTwoFactor(false),
      '/two-factor/enable',
      '198.51.100.23',
      6,
      { password: 'not-the-password' },
    );
    console.log(`AV7/A enable ON => ${on.join(',')}   OFF => ${off.join(',')}`);
    expect(on).toContain(429);
    expect(off).not.toContain(429);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * B · the posture is decided at the FIRST env read, and the cache can be reset in-process
 * ══════════════════════════════════════════════════════════════════════════════════════ */

describe('AV7/B · the posture is a lazy read of a resettable cache', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs'); // force parseOrExit's throwing branch
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    resetEnvCacheForTests();
  });

  function stub(overrides: Record<string, string> = {}): void {
    for (const [name, value] of Object.entries({ ...VALID_SERVER_ENV, ...overrides })) {
      vi.stubEnv(name, value);
    }
    resetEnvCacheForTests();
  }

  it('ATTACK · mutating process.env AFTER boot and resetting the cache flips the posture to RELAXED', () => {
    stub({ TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: '' });
    // POSITIVE CONTROL: it starts ACTIVE, which is the whole claim.
    expect(authRateLimitOptions().enabled).toBe(true);

    // THE ATTACK: in-process code sets the variable and clears the validated-env cache. No
    // deployment variable, no restart, no config change.
    vi.stubEnv('TEST_ONLY_DISABLE_AUTH_RATE_LIMIT', AUTH_RATE_LIMIT_TEST_OVERRIDE);
    resetEnvCacheForTests();

    const after = authRateLimitOptions();
    console.log(`AV7/B posture after in-process mutation => ${JSON.stringify(after)}`);
    expect(after.enabled).toBe(false);
    expect(after.relaxedForTests).toBe(true);
  });

  it('`resetEnvCacheForTests` is reachable from the package’s PUBLIC entry point', async () => {
    // Not a test-only export behind a guard — the same specifier application code imports.
    const barrel = (await import('@qmulate/config/env')) as Record<string, unknown>;
    expect(typeof barrel['resetEnvCacheForTests']).toBe('function');
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * C · exotic values — every one must be ACTIVE or a BOOT FAILURE, never relaxed
 * ══════════════════════════════════════════════════════════════════════════════════════ */

describe('AV7/C · hostile spellings of the override token', () => {
  const CANDIDATES: readonly [string, string][] = [
    ['trailing newline', 'disabled-for-tests\n'],
    ['leading newline', '\ndisabled-for-tests'],
    ['trailing tab', 'disabled-for-tests\t'],
    ['NBSP suffix (U+00A0)', 'disabled-for-tests '],
    ['zero-width space suffix (U+200B)', 'disabled-for-tests​'],
    ['zero-width space ONLY', '​'],
    ['fullwidth letters', 'ｄisabled-for-tests'],
    ['non-breaking hyphen (U+2011)', 'disabled‑for‑tests'],
    ['Cyrillic а look-alike', 'disаbled-for-tests'],
    ['NFD-decomposed-looking', 'disabled-for-testś'],
    ['title case', 'Disabled-For-Tests'],
    ['quoted', '"disabled-for-tests"'],
    ['with a trailing semicolon', 'disabled-for-tests;'],
    ['url-encoded', 'disabled%2Dfor%2Dtests'],
    ['the token twice', 'disabled-for-tests,disabled-for-tests'],
  ];

  it.each(CANDIDATES)('%s: the posture is ACTIVE', (_label, value) => {
    const posture = authRateLimitPosture({
      testOnlyDisableAuthRateLimit: value,
      dataClassification: 'fixture-only',
    });
    expect(posture.enabled).toBe(true);
    expect(posture.relaxedForTests).toBe(false);
  });

  it.each(CANDIDATES)(
    '%s: the env schema either REFUSES it or reads it as absent',
    (label, value) => {
      const result = serverEnvSchema.safeParse({
        ...VALID_SERVER_ENV,
        TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: value,
      });
      const verdict = result.success
        ? `PARSED as ${JSON.stringify(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT)}`
        : 'REFUSED (boot failure)';
      console.log(`AV7/C ${label} => ${verdict}`);
      if (result.success) {
        // The only acceptable "success" is that it read as ABSENT.
        expect(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT).toBeUndefined();
      } else {
        expect(Object.keys(result.error.flatten().fieldErrors)).toContain(
          'TEST_ONLY_DISABLE_AUTH_RATE_LIMIT',
        );
      }
    },
  );

  it('the DATA_CLASSIFICATION half is equally exact', () => {
    for (const value of ['Fixture-Only', 'fixture-only ', 'fixture_only', 'FIXTURE-ONLY']) {
      const result = serverEnvSchema.safeParse({ ...VALID_SERVER_ENV, DATA_CLASSIFICATION: value });
      expect(result.success, `DATA_CLASSIFICATION=${JSON.stringify(value)} parsed`).toBe(false);
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * D · NODE_ENV does not govern the posture — asserted, not asserted-in-a-comment
 * ══════════════════════════════════════════════════════════════════════════════════════ */

describe('AV7/D · NODE_ENV', () => {
  it('a real 429 is produced in THIS worker, whose NODE_ENV is not production', async () => {
    // better-auth's inherited default is `enabled: isProduction`, captured at module load. If the
    // explicit option were being dropped, this burst could not 429 here.
    console.log(`AV7/D NODE_ENV=${String(process.env.NODE_ENV)}`);
    expect(process.env.NODE_ENV).not.toBe('production');

    const statuses = await burst(
      makeAuthWithTwoFactor(true),
      '/sign-in/email',
      '198.51.100.30',
      5,
      { email: 'nobody@example.test', password: 'nope' },
    );
    expect(statuses).toContain(429);
  });

  it('the posture function has no NODE_ENV term at all, for every combination', () => {
    for (const nodeEnv of ['production', 'development', 'test']) {
      vi.stubEnv('NODE_ENV', nodeEnv);
      expect(
        authRateLimitPosture({
          testOnlyDisableAuthRateLimit: undefined,
          dataClassification: 'fixture-only',
        }).enabled,
      ).toBe(true);
      expect(
        authRateLimitPosture({
          testOnlyDisableAuthRateLimit: AUTH_RATE_LIMIT_TEST_OVERRIDE,
          dataClassification: 'fixture-only',
        }).enabled,
      ).toBe(false);
    }
    vi.unstubAllEnvs();
  });
});
/* ═════════════════════════════════════════════════════════════════════════════════════════
 * E · FILE INJECTION OF THE OVERRIDE — **INVERTED (AV7-AUD-F5, MEDIUM)**
 *
 * The probe found three doors and only ever measured the first two. All three are now closed and
 * each `it()` below asserts the CLOSURE, with the positive control that tells a closure apart from
 * a lockout — because `.gitignore: .env.*` would also "pass" by making `.env.example` untrackable,
 * and a workflow grep would also "pass" by finding nothing anywhere.
 *
 *   E-1  a COMMITTED `.env.production` — the one that reached `next start`. Closed by `.gitignore`.
 *   E-2  a root `.env` read by `loadRootEnv()`. Closed by `NEVER_FROM_FILE`.
 *   E-3  promotion of the variable out of the `e2e` job. Closed by a check, not by a comment.
 *   E-4  ⚠ the RESIDUALS, asserted rather than described: the parser still parses the token, and
 *        `NEVER_FROM_FILE` does not reach `apps/web` at all. Plus AV7-AUD-F10's bound.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

/** `packages/auth/test` → the monorepo root. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface IgnoreVerdict {
  ignored: boolean;
  /** `git`'s own answer, e.g. `.gitignore:38:.env.*\t.env.production`. */
  rule: string;
}

/**
 * Asks GIT, not a regex over `.gitignore`. `-v` makes it name the file, line and pattern that
 * decided, so a passing assertion below quotes the rule rather than asserting a boolean.
 *
 * ⚠ `--no-index` is load-bearing and not tidiness. Without it `check-ignore` reports a TRACKED
 * path as "not ignored" whatever the patterns say — which would make the `.env.example` control
 * below pass even if `!.env.example` had been deleted, i.e. exactly the vacuous negative this
 * repo's own rule warns about.
 *
 * ⚠ A NEGATION MATCH EXITS 0 TOO, so the exit status cannot be the verdict: `.env.example` returns
 * `.gitignore:39:!.env.example` with status 0. The pattern's leading `!` is what decides.
 */
function ignoreVerdictFor(candidate: string): IgnoreVerdict {
  let output: string;
  try {
    output = execFileSync('git', ['check-ignore', '-v', '--no-index', '--', candidate], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch {
    // Exit 1 with no output = NO pattern matched ⇒ the path is committable. (A missing `git`
    // lands here too, which is why E-1 asserts an IGNORED verdict for three paths AND a
    // NOT-IGNORED verdict for a fourth: no single failure mode produces all four.)
    return { ignored: false, rule: 'NO RULE MATCHED — the path is committable' };
  }
  const rule = output.trim();
  const pattern = rule.split('\t')[0]?.split(':')[2] ?? '';
  return { ignored: !pattern.startsWith('!'), rule };
}

/** Line-number ranges of the top-level jobs in a workflow file, plus the pre-`jobs:` region. */
function workflowRegions(text: string): { name: string; from: number; to: number }[] {
  const lines = text.split('\n');
  const jobsAt = lines.findIndex((line) => line === 'jobs:');
  expect(
    jobsAt,
    'ci.yml has no top-level `jobs:` key — the region parser cannot be trusted',
  ).toBeGreaterThan(0);

  const regions: { name: string; from: number; to: number }[] = [
    // 1-based, and the workflow-level `env:` block lives in here.
    { name: '<workflow-level>', from: 1, to: jobsAt },
  ];
  for (let i = jobsAt + 1; i < lines.length; i += 1) {
    const match = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i] ?? '');
    if (match?.[1] === undefined) continue;
    const previous = regions[regions.length - 1];
    if (previous !== undefined) previous.to = i;
    regions.push({ name: match[1], from: i + 1, to: lines.length });
  }
  return regions;
}

function regionOf(regions: { name: string; from: number; to: number }[], line: number): string {
  return regions.find((region) => line >= region.from && line <= region.to)?.name ?? '<none>';
}

/** Every 1-based line number in `text` whose content mentions `needle`. */
function linesMentioning(text: string, needle: string): number[] {
  return text
    .split('\n')
    .map((line, index) => (line.includes(needle) ? index + 1 : 0))
    .filter((line) => line > 0);
}

describe('AV7/E · file injection of the override — INVERTED (AV7-AUD-F5)', () => {
  it('E-1 · INVERTED · `.env.production`, `.env.test` and `.env.development` are UNCOMMITTABLE, and git names the rule', () => {
    // These three are the whole exploit. `apps/web/next.config.ts` calls
    // `loadEnvConfig(repoRoot, NODE_ENV !== 'production')`, so Next reads one of them on every
    // start, and a COMMITTED one satisfied BOTH conditions of the fail-closed override on the very
    // process that serves `/api/auth/*`. Measured before the fix:
    //     NOT IGNORED (committable): .env.test / .env.development / .env.production
    const attacks = ['.env.production', '.env.test', '.env.development', '.env.local', '.env'];
    for (const candidate of attacks) {
      const verdict = ignoreVerdictFor(candidate);
      console.log(
        `AV7/E-1 ${candidate.padEnd(18)} ignored=${String(verdict.ignored)}  ${verdict.rule}`,
      );
      expect(verdict.ignored, `${candidate} is COMMITTABLE — AV7-AUD-F5 is open again`).toBe(true);
    }
    // The rule is the pattern, not a list: `.env.staging`, `.env.ci`, anything.
    expect(ignoreVerdictFor('.env.whatever-comes-next').ignored).toBe(true);

    // ── POSITIVE CONTROL · the guard is a PATTERN WITH AN EXCEPTION, not a blanket ban ──────
    // `.env.example` is tracked deliberately (it is the documentation of every variable). If
    // `!.env.example` were dropped, `.env.*` alone would make the one file that MUST be committed
    // untrackable — and every assertion above would still be green. This is what distinguishes the
    // fix from a lockout.
    const example = ignoreVerdictFor('.env.example');
    console.log(`AV7/E-1 CONTROL .env.example ignored=${String(example.ignored)}  ${example.rule}`);
    expect(example.ignored, '.env.example must stay committable').toBe(false);
    expect(example.rule).toContain('!.env.example');
    // And it really is in the index, so the negation is not theoretical.
    const tracked = execFileSync('git', ['ls-files', '--', '.env.example'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(tracked).toBe('.env.example');
  });

  it('E-2 · INVERTED · a root `.env` no longer reaches process.env with the override — driven through loadRootEnv()', async () => {
    // The ATTACK, run against the real loader rather than described: a repo root whose `.env` sets
    // BOTH guarded variables and one ordinary one. `loadRootEnv()` runs on import and is idempotent
    // behind a module-level flag, so the fresh module registry is what makes this drivable at all.
    const root = mkdtempSync(join(tmpdir(), 'av7-root-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeFileSync(
      join(root, '.env'),
      [
        `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT=${AUTH_RATE_LIMIT_TEST_OVERRIDE}`,
        'DATA_CLASSIFICATION=production',
        'AV7_E2_CONTROL_VARIABLE=reached-process-env',
        '',
      ].join('\n'),
    );

    // ⚠ The two guarded variables must be ABSENT before the drive, or `??=` would decline to write
    // them for a reason that has nothing to do with the guard — a vacuous negative.
    const saved: Record<string, string | undefined> = {
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: process.env['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT'],
      DATA_CLASSIFICATION: process.env['DATA_CLASSIFICATION'],
      AV7_E2_CONTROL_VARIABLE: process.env['AV7_E2_CONTROL_VARIABLE'],
    };
    try {
      delete process.env['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT'];
      delete process.env['DATA_CLASSIFICATION'];
      delete process.env['AV7_E2_CONTROL_VARIABLE'];

      vi.spyOn(process, 'cwd').mockReturnValue(root);
      vi.resetModules();
      // Importing it IS the drive: the module calls `loadRootEnv()` at the bottom of the file.
      await import('@qmulate/config/load-env');

      const observed = {
        override: process.env['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT'],
        classification: process.env['DATA_CLASSIFICATION'],
        control: process.env['AV7_E2_CONTROL_VARIABLE'],
      };
      console.log(`AV7/E-2 after loadRootEnv() from ${root} => ${JSON.stringify(observed)}`);

      // THE FIX: the override did not come through, for the same reason DATA_CLASSIFICATION never
      // did — "a guardrail a stray untracked file can satisfy is not a guardrail".
      expect(observed.override, 'a file-supplied override reached process.env').toBeUndefined();
      expect(observed.classification).toBeUndefined();

      // ── POSITIVE CONTROL · the loader DID read that file ────────────────────────────────────
      // Without this, "the override is absent" is indistinguishable from "the loader never ran",
      // which is how a broken cwd stub would bank a green.
      expect(
        observed.control,
        'loadRootEnv() never read the temp .env — the negative above is vacuous',
      ).toBe('reached-process-env');
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    // And the policy list itself, so a future edit that removes the entry fails here too.
    console.log(`AV7/E-2 NEVER_FROM_FILE = ${JSON.stringify(NEVER_FROM_FILE)}`);
    expect(NEVER_FROM_FILE).toContain('TEST_ONLY_DISABLE_AUTH_RATE_LIMIT');
    expect(NEVER_FROM_FILE).toContain('DATA_CLASSIFICATION');
  });

  it('E-3 · INVERTED · the override appears ONLY in ci.yml’s `e2e` job, and in no tracked `.env*` file', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const regions = workflowRegions(workflow);
    const hits = linesMentioning(workflow, 'TEST_ONLY_DISABLE_AUTH_RATE_LIMIT');
    const placed = hits.map((line) => `${String(line)}:${regionOf(regions, line)}`);
    console.log(
      `AV7/E-3 jobs=${regions.map((region) => region.name).join(',')}\n` +
        `AV7/E-3 override occurrences => ${placed.join(' · ')}`,
    );

    // Non-vacuous: it IS there, in the one job that runs the suite.
    expect(hits.length).toBeGreaterThan(0);
    for (const line of hits) expect(regionOf(regions, line)).toBe('e2e');
    // Named explicitly, because these two are the promotions the comment forbids and nothing enforced.
    expect(placed.some((entry) => entry.endsWith(':deploy-staging'))).toBe(false);
    expect(placed.some((entry) => entry.endsWith(':<workflow-level>'))).toBe(false);

    // ── POSITIVE CONTROL · the region parser can attribute a line to a job OTHER than e2e ────
    // `DATA_CLASSIFICATION` is set at workflow level AND in `deploy-staging` — deliberately, and
    // that asymmetry is the whole reason the classification alone is not sufficient. If the parser
    // were broken and swept every line into `e2e`, this is the assertion that would go red.
    const classificationRegions = new Set(
      linesMentioning(workflow, 'DATA_CLASSIFICATION: fixture-only').map((line) =>
        regionOf(regions, line),
      ),
    );
    console.log(
      `AV7/E-3 CONTROL DATA_CLASSIFICATION regions => ${[...classificationRegions].join(',')}`,
    );
    expect(classificationRegions.has('<workflow-level>')).toBe(true);
    expect(classificationRegions.has('deploy-staging')).toBe(true);
    expect(classificationRegions.size).toBeGreaterThan(2);

    // ── AND NO TRACKED `.env*` FILE SETS IT ────────────────────────────────────────────────
    // E-1 makes such a file unaddable; this catches one already in the index (and `.env.example`,
    // which is exempt from E-1 by design, is exactly where a "documented default" would land).
    const trackedEnvFiles = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((file) => file.split('/').pop()?.startsWith('.env') === true);
    expect(
      trackedEnvFiles.length,
      'no tracked .env* file at all — this check is vacuous',
    ).toBeGreaterThan(0);
    for (const file of trackedEnvFiles) {
      const parsed = parseEnvFile(readFileSync(join(REPO_ROOT, file), 'utf8'));
      console.log(
        `AV7/E-3 ${file}: ${String(Object.keys(parsed).length)} assignment(s), override=${String(
          parsed['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT'],
        )}`,
      );
      expect(parsed['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT']).toBeUndefined();
      // POSITIVE CONTROL · the parser really read it. `.env.example` yields 16 assignments here,
      // `DATA_CLASSIFICATION` among them — so "the override is absent" is a fact about the file,
      // not about a parse that returned nothing.
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
      expect(parsed['DATA_CLASSIFICATION']).toBeDefined();
    }
  });

  it('E-4 · ⚠ THE RESIDUALS · the parser still parses the token, NEVER_FROM_FILE does not reach apps/web, and the AND is a ONE-condition gate', () => {
    // RESIDUAL 1 · `parseEnvFile` is a dumb parser and is meant to be: it has no policy. The policy
    // is the one `continue` in `loadRootEnv()`. Kept from the original probe as the measurement it
    // was, so nobody re-reads "the parser refuses it" into the fix.
    const parsed = parseEnvFile(
      `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT=${AUTH_RATE_LIMIT_TEST_OVERRIDE}\n`,
    );
    expect(parsed['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT']).toBe(AUTH_RATE_LIMIT_TEST_OVERRIDE);
    // …and such a value, if it ever DID reach process.env, still relaxes the posture. The fix is
    // that it cannot arrive from a file, not that the posture stopped honouring it.
    expect(
      authRateLimitPosture({
        testOnlyDisableAuthRateLimit: parsed['TEST_ONLY_DISABLE_AUTH_RATE_LIMIT'],
        dataClassification: 'fixture-only',
      }).relaxedForTests,
    ).toBe(true);

    // RESIDUAL 2 · `apps/web` DOES NOT USE THIS LOADER, so E-2's fix buys nothing on the process
    // that serves `/api/auth/*`. Asserted as a source fact rather than a comment: `next.config.ts`
    // calls Next's own loader and imports nothing from `@qmulate/config/load-env`. E-1 and E-3 are
    // what cover that path.
    const nextConfig = readFileSync(join(REPO_ROOT, 'apps', 'web', 'next.config.ts'), 'utf8');
    expect(nextConfig).toContain('loadEnvConfig(');
    expect(nextConfig).not.toContain('@qmulate/config/load-env');

    // RESIDUAL 3 · AV7-AUD-F10, RECORDED AS A BOUND AND NOT FIXED. `DATA_CLASSIFICATION` has
    // exactly two legal values and `production` is unreachable until a KSA-resident production
    // exists, so condition 2 is a CONSTANT `true` in every environment that exists: the AND is a
    // ONE-condition gate in practice, and `rate-limit.ts`'s "one of them impossible on production
    // data by construction" becomes true only when production data does.
    expect(DATA_CLASSIFICATIONS).toEqual(['fixture-only', 'production']);
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const regions = workflowRegions(workflow);
    const jobsSettingFixtureOnly = new Set(
      linesMentioning(workflow, 'DATA_CLASSIFICATION: fixture-only').map((line) =>
        regionOf(regions, line),
      ),
    );
    console.log(
      `AV7/E-4 AUD-F10 bound: every environment that exists sets fixture-only => ` +
        `${[...jobsSettingFixtureOnly].join(',')} (incl. deploy-staging)`,
    );
    expect(jobsSettingFixtureOnly.has('deploy-staging')).toBe(true);
  });
});
