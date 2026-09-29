import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_RATE_LIMIT_TEST_OVERRIDE,
  assertFixtureInputPath,
  assertFixtureOnly,
  assertNoPrivilegedDatabaseUrls,
  assertNoWorkerOnlyDatabaseUrls,
  DATA_CLASSIFICATIONS,
  DATA_RESIDENCIES,
  dataClassification,
  EnvValidationError,
  FIXTURE_ONLY_INPUT_PATH,
  getServerEnv,
  isFixtureOnly,
  isProductionData,
  parseOrExit,
  resetEnvCacheForTests,
  serverEnv,
  serverEnvSchema,
} from '../src/env';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * AC-E0-2 — "Env refuses to boot without the residency flag"
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Given `DATA_CLASSIFICATION` is unset (or outside `fixture-only | production`), when the
 * app starts, then it fails fast with a message NAMING the offending variable, exits
 * non-zero, and prints NO environment values.
 *
 * The last clause is the one that actually matters in production. A boot failure writes to
 * CI logs, Railway logs and a developer's terminal history; a reporter that echoes the
 * offending value leaks `BETTER_AUTH_SECRET` and the `DATABASE_URL` password into all
 * three at once. Several tests below plant sentinel strings in otherwise-VALID secrets and
 * assert the sentinel appears nowhere — not in the thrown message, not in the issue list,
 * not on stderr.
 *
 * ── Why `process.exit` is stubbed for the whole file ───────────────────────────────────
 * `parseOrExit` calls `process.exit(1)` in CLI/worker contexts and throws only when Next.js
 * is detected (`NEXT_RUNTIME` / `NEXT_PHASE` present). A vitest worker IS a CLI context, so
 * an un-stubbed call would kill the runner mid-suite and surface as a truncated, confusing
 * report. Every test therefore runs with `NEXT_RUNTIME` stubbed to force the throwing
 * branch, plus a `process.exit` spy as a backstop — if `shouldExitProcess()` is ever
 * changed, this suite fails loudly instead of vanishing.
 */

/** A complete, valid server environment. Nothing here is a real credential. */
const VALID_SERVER_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://qmulate:qmulate@localhost:5432/qmulate_test?schema=public',
  DATA_CLASSIFICATION: 'fixture-only',
  BETTER_AUTH_SECRET: 'test-only-not-a-real-secret-0000000000000000',
  BETTER_AUTH_URL: 'http://localhost:3000',
};

const REQUIRED_VARIABLES = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'DATABASE_URL',
  'DATA_CLASSIFICATION',
];

/**
 * Sentinels. Both are syntactically VALID for their field (the secret is ≥32 characters),
 * so the only way one can reach the output is a reporter echoing a value it was handed.
 */
const SECRET_SENTINEL = 'LEAKCANARY-secret-3f9a2c7e11b4d6e8a0c5b7d9';
const DB_PASSWORD_SENTINEL = 'LEAKCANARY-dbpassword-91a7c3';

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(
      `process.exit(${String(code)}) was reached. parseOrExit must THROW inside a test or ` +
        'Next context — check shouldExitProcess().',
    );
  });
});

afterEach(() => {
  resetEnvCacheForTests();
});

/** Stub a full valid environment, optionally overridden, and drop the memoised parse. */
function stubEnvironment(overrides: Record<string, string> = {}): void {
  for (const [name, value] of Object.entries({ ...VALID_SERVER_ENV, ...overrides })) {
    vi.stubEnv(name, value);
  }
  resetEnvCacheForTests();
}

/** Everything the reporter emitted or threw, as one searchable blob. */
function capturedOutput(error: unknown): string {
  const printed = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  const thrown =
    error instanceof EnvValidationError
      ? `${error.message}\n${error.issues.join('\n')}`
      : String(error);
  return `${printed}\n${thrown}`;
}

/** Run `fn`, returning whatever it threw. Fails the test if it did not throw. */
function captureThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw, but it returned normally.');
}

describe('DATA_CLASSIFICATION — the NFR-03 residency flag', () => {
  it('rejects a MISSING DATA_CLASSIFICATION and names it', () => {
    const { DATA_CLASSIFICATION: _omitted, ...withoutFlag } = VALID_SERVER_ENV;

    const result = serverEnvSchema.safeParse(withoutFlag);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.error.flatten().fieldErrors)).toContain('DATA_CLASSIFICATION');
  });

  it.each([
    ['a production-ish typo', 'prod'],
    ['the wrong case', 'FIXTURE-ONLY'],
    ['an underscore instead of a hyphen', 'fixture_only'],
    ['an empty string', ''],
    ['untrimmed whitespace', ' fixture-only '],
    ['a plausible third value', 'staging'],
  ])('rejects %s', (_label, value) => {
    const result = serverEnvSchema.safeParse({ ...VALID_SERVER_ENV, DATA_CLASSIFICATION: value });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.error.flatten().fieldErrors)).toContain('DATA_CLASSIFICATION');
  });

  it('tells the operator what the legal values are', () => {
    const result = serverEnvSchema.safeParse({ ...VALID_SERVER_ENV, DATA_CLASSIFICATION: 'prod' });

    expect(result.success).toBe(false);
    if (result.success) return;
    // An error that says only "invalid" costs the reader a trip into the source.
    expect(result.error.flatten().fieldErrors.DATA_CLASSIFICATION?.join(' ')).toMatch(
      /fixture-only/,
    );
  });

  it("accepts 'fixture-only'", () => {
    const result = serverEnvSchema.safeParse(VALID_SERVER_ENV);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.DATA_CLASSIFICATION).toBe('fixture-only');
  });

  // ⊕ S12-4 · this test used to read "accepts 'production' at the SCHEMA layer — refusing it is
  // assertFixtureOnly's job", and its comment warned against "collapsing the two". The split STANDS:
  // the enum still holds `production`, and `assertFixtureOnly` is still what stops a fixture-only
  // workload. What S12-4 added is a RESIDENCY refinement beside it: `production` parses ONLY with
  // DATA_RESIDENCY=ksa, so KSA-resident production can be stood up without editing the schema and a
  // non-KSA production posture cannot be stood up at all (G-8 layer 1, extended).
  it("accepts 'production' ONLY beside DATA_RESIDENCY=ksa (G-8 layer 1, S12-4)", () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      DATA_CLASSIFICATION: 'production',
      DATA_RESIDENCY: 'ksa',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.DATA_RESIDENCY).toBe('ksa');
  });

  it("refuses 'production' with DATA_RESIDENCY absent — and names DATA_RESIDENCY, not a value", () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      DATA_CLASSIFICATION: 'production',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    expect(Object.keys(errors)).toContain('DATA_RESIDENCY');
    expect(errors.DATA_RESIDENCY?.join(' ')).toMatch(
      /REQUIRED when DATA_CLASSIFICATION=production/,
    );
    expect(errors.DATA_RESIDENCY?.join(' ')).toMatch(/NFR-03/);
  });

  it("refuses 'production' with DATA_RESIDENCY=non-ksa — the app does not boot outside KSA on real data", () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      DATA_CLASSIFICATION: 'production',
      DATA_RESIDENCY: 'non-ksa',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.DATA_RESIDENCY?.join(' ')).toMatch(
      /non-KSA production posture is refused at boot/,
    );
  });

  it('refuses an unrecognised DATA_RESIDENCY value under either classification', () => {
    for (const classification of ['fixture-only', 'production'] as const) {
      const result = serverEnvSchema.safeParse({
        ...VALID_SERVER_ENV,
        DATA_CLASSIFICATION: classification,
        DATA_RESIDENCY: 'saudi',
      });
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(Object.keys(result.error.flatten().fieldErrors)).toContain('DATA_RESIDENCY');
    }
  });

  it("under 'fixture-only' DATA_RESIDENCY is optional and may be either value or empty", () => {
    for (const residency of [undefined, '', 'ksa', 'non-ksa']) {
      const result = serverEnvSchema.safeParse({
        ...VALID_SERVER_ENV,
        ...(residency === undefined ? {} : { DATA_RESIDENCY: residency }),
      });
      expect(result.success, `residency=${String(residency)}`).toBe(true);
    }
  });

  it('exposes exactly the two legal residencies', () => {
    expect(DATA_RESIDENCIES).toEqual(['ksa', 'non-ksa']);
  });

  it('exposes exactly the two legal classifications', () => {
    expect(DATA_CLASSIFICATIONS).toEqual(['fixture-only', 'production']);
  });
});

describe('TEST_ONLY_DISABLE_AUTH_RATE_LIMIT — the test-only auth rate-limit override', () => {
  /**
   * The variable is declared HERE (this is the file that refuses to boot on a bad guardrail
   * value), while the two-condition decision it feeds lives in `@qmulate/auth`'s
   * `authRateLimitPosture()`. Both halves are pinned in both places on purpose: MEASURED
   * during S7 — loosening this enum to also accept `'true'` killed three tests in
   * `packages/auth` and left this suite's 57 GREEN, so a future edit to *this* file, verified
   * with only `pnpm --filter @qmulate/config test`, would have looked clean.
   *
   * The rule the enum encodes: ABSENT (or empty, which is how CI and Railway spell "unset")
   * means FULL RATE LIMITING, and any value that is not the exact token is a BOOT FAILURE
   * rather than an interpretation. `false` is not "off" — it is an error naming the variable.
   */
  it('parses to `undefined` when absent — absence is the safe state and the default', () => {
    const result = serverEnvSchema.safeParse(VALID_SERVER_ENV);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT).toBeUndefined();
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('treats %s as ABSENT, not as invalid', (_label, value) => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: value,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TEST_ONLY_DISABLE_AUTH_RATE_LIMIT).toBeUndefined();
  });

  it('accepts exactly one token', () => {
    expect(AUTH_RATE_LIMIT_TEST_OVERRIDE).toBe('disabled-for-tests');

    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: AUTH_RATE_LIMIT_TEST_OVERRIDE,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['the boolean-shaped "true"', 'true'],
    ['the boolean-shaped "false"', 'false'],
    ['"1"', '1'],
    ['"0"', '0'],
    ['"yes"', 'yes'],
    ['the wrong case', 'DISABLED-FOR-TESTS'],
    ['an untrimmed token', ' disabled-for-tests '],
    ['a near-miss', 'disable-for-tests'],
    ['a plausible extension', 'disabled-for-tests-and-staging'],
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

  it('never echoes the offending VALUE, only the name — same rule as every other variable', () => {
    const sentinel = 'LEAKCANARY-ratelimit-7c1e4a';
    const error = captureThrow(() =>
      parseOrExit(serverEnvSchema, {
        ...VALID_SERVER_ENV,
        TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: sentinel,
      }),
    );

    const output = capturedOutput(error);
    expect(output).toContain('TEST_ONLY_DISABLE_AUTH_RATE_LIMIT');
    expect(output).not.toContain(sentinel);
  });
});

describe('serverEnvSchema — the rest of the required surface', () => {
  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      DATABASE_URL: 'mysql://qmulate@localhost:3306/qmulate',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.error.flatten().fieldErrors)).toContain('DATABASE_URL');
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    const result = serverEnvSchema.safeParse({ ...VALID_SERVER_ENV, BETTER_AUTH_SECRET: 'short' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.BETTER_AUTH_SECRET?.join(' ')).toMatch(/32/);
  });

  it('applies the documented defaults when the optional variables are absent', () => {
    const result = serverEnvSchema.safeParse(VALID_SERVER_ENV);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.LOG_LEVEL).toBe('info');
    expect(result.data.PORT).toBe(3000);
    // NFR-06 security target — not a statutory figure, but held in the schema with a
    // default rather than as a constant so it can be tightened without a code change.
    expect(result.data.SESSION_IDLE_MINUTES).toBe(30);
  });

  it('coerces the numeric variables from their string environment form', () => {
    const result = serverEnvSchema.safeParse({
      ...VALID_SERVER_ENV,
      PORT: '4321',
      SESSION_IDLE_MINUTES: '15',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.PORT).toBe(4321);
    expect(result.data.SESSION_IDLE_MINUTES).toBe(15);
  });

  it('strips unknown variables rather than failing on them', () => {
    // The source is always the whole `process.env`, which carries hundreds of unrelated
    // keys. A strict schema would mean the app could never boot anywhere.
    const result = serverEnvSchema.safeParse({ ...VALID_SERVER_ENV, HOME: '/root', TERM: 'xterm' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('HOME');
  });
});

describe('parseOrExit — fail-fast reporting', () => {
  it('returns the parsed, defaulted object when the environment is valid', () => {
    const parsed = parseOrExit(serverEnvSchema, VALID_SERVER_ENV, 'server');

    expect(parsed.DATA_CLASSIFICATION).toBe('fixture-only');
    expect(parsed.PORT).toBe(3000);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('throws EnvValidationError naming EVERY missing required variable in one pass', () => {
    const caught = captureThrow(() => parseOrExit(serverEnvSchema, {}, 'server'));

    expect(caught).toBeInstanceOf(EnvValidationError);
    const output = capturedOutput(caught);
    for (const name of REQUIRED_VARIABLES) {
      expect(output).toContain(name);
    }

    // A partial report is worse than none: the developer fixes one variable, re-runs, and
    // walks straight into the next failure. Exactly these four, no more, no fewer.
    const reported = new Set(
      (caught as EnvValidationError).issues.map((issue) => issue.split(':')[0]?.trim() ?? ''),
    );
    expect([...reported].sort()).toEqual(REQUIRED_VARIABLES);
  });

  it('reports to stderr as well as throwing, so a failed boot is visible in logs', () => {
    expect(() => parseOrExit(serverEnvSchema, {}, 'server')).toThrow(EnvValidationError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.join(' ')).toContain('DATA_CLASSIFICATION');
  });

  it('NEVER prints an environment VALUE — not a secret, not a database password', () => {
    // Both secrets below are individually VALID. The only failure is the missing residency
    // flag, so any appearance of a sentinel proves the reporter echoed a value it held.
    const { DATA_CLASSIFICATION: _omitted, ...withoutFlag } = VALID_SERVER_ENV;
    const caught = captureThrow(() =>
      parseOrExit(
        serverEnvSchema,
        {
          ...withoutFlag,
          BETTER_AUTH_SECRET: SECRET_SENTINEL,
          DATABASE_URL: `postgresql://qmulate:${DB_PASSWORD_SENTINEL}@localhost:5432/qmulate`,
        },
        'server',
      ),
    );

    const output = capturedOutput(caught);

    expect(output).toContain('DATA_CLASSIFICATION'); // the NAME is reported …
    expect(output).not.toContain(SECRET_SENTINEL); // … the VALUES are not
    expect(output).not.toContain(DB_PASSWORD_SENTINEL);
    expect(output).not.toContain('LEAKCANARY');
  });

  it('does not leak a value even when THAT value is what failed validation', () => {
    // The tempting reporter bug is `${name} received "${value}"`. An invalid DATABASE_URL
    // still contains the password, so the invalid case has to be as tight-lipped as the
    // missing one.
    const caught = captureThrow(() =>
      parseOrExit(
        serverEnvSchema,
        {
          ...VALID_SERVER_ENV,
          DATABASE_URL: `mysql://qmulate:${DB_PASSWORD_SENTINEL}@localhost:3306/qmulate`,
          BETTER_AUTH_SECRET: SECRET_SENTINEL.slice(0, 8), // too short → also invalid
        },
        'server',
      ),
    );

    const output = capturedOutput(caught);

    expect(output).toContain('DATABASE_URL');
    expect(output).toContain('BETTER_AUTH_SECRET');
    expect(output).not.toContain(DB_PASSWORD_SENTINEL);
    expect(output).not.toContain('LEAKCANARY');
  });

  it('offers no SKIP_ENV_VALIDATION escape hatch', () => {
    // An escape hatch defeats guardrail layer 1: someone sets it "just for local", it ends
    // up in a deploy environment, and the residency flag stops being enforced anywhere.
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true');

    expect(() => parseOrExit(serverEnvSchema, {}, 'server')).toThrow(EnvValidationError);
  });
});

describe('lazy accessors', () => {
  it('does not validate on import — only on first property access', () => {
    // Were the parse eager, every test file, lint pass and tooling import in the monorepo
    // would need a complete environment. The proof is that this suite already imported
    // `serverEnv` at the top of the file without exploding.
    expect(typeof serverEnv).toBe('object');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('parses process.env on access and memoises the result', () => {
    stubEnvironment({ PORT: '3100', LOG_LEVEL: 'debug' });

    const first = getServerEnv();
    expect(first.DATA_CLASSIFICATION).toBe('fixture-only');
    expect(first.PORT).toBe(3100);
    expect(first.LOG_LEVEL).toBe('debug');

    // Memoised: the same object identity comes back without re-reading process.env.
    expect(getServerEnv()).toBe(first);
    expect(serverEnv.BETTER_AUTH_URL).toBe(VALID_SERVER_ENV.BETTER_AUTH_URL);
    expect(isFixtureOnly()).toBe(true);
    expect(isProductionData()).toBe(false);
    expect(dataClassification()).toBe('fixture-only');
  });

  it('reflects a production classification through the helpers', () => {
    // ⊕ S12-4: a production posture parses only beside DATA_RESIDENCY=ksa (G-8 layer 1).
    stubEnvironment({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa' });

    expect(dataClassification()).toBe('production');
    expect(isFixtureOnly()).toBe(false);
    expect(isProductionData()).toBe(true);
  });

  it('is read-only — the environment cannot be mutated at runtime', () => {
    stubEnvironment();

    expect(() => {
      serverEnv.DATA_CLASSIFICATION = 'production';
    }).toThrow(/read-only/i);
  });
});

describe('assertFixtureOnly — release gate G-8, classification half', () => {
  it('permits the operation under fixture-only', () => {
    stubEnvironment({ DATA_CLASSIFICATION: 'fixture-only' });

    expect(() => assertFixtureOnly('seed')).not.toThrow();
  });

  it('REFUSES the operation under production, naming the variable and the operation', () => {
    // ⊕ S12-4: a production posture parses only beside DATA_RESIDENCY=ksa (G-8 layer 1).
    stubEnvironment({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa' });

    const caught = captureThrow(() => assertFixtureOnly('seed'));

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as Error).message).toContain('DATA_CLASSIFICATION');
    expect((caught as Error).message).toContain('seed');
    // It must THROW, not exit — the seed's own error handling decides the exit code.
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('names the one permitted input file in the refusal', () => {
    // ⊕ S12-4: a production posture parses only beside DATA_RESIDENCY=ksa (G-8 layer 1).
    stubEnvironment({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa' });

    const caught = captureThrow(() => assertFixtureOnly('seed'));

    expect((caught as Error).message).toContain(FIXTURE_ONLY_INPUT_PATH);
  });
});

describe('assertFixtureInputPath — release gate G-8, input-file half', () => {
  it('names the one permitted fixture', () => {
    expect(FIXTURE_ONLY_INPUT_PATH).toBe('data/fixtures/sample-waqf.json');
  });

  /**
   * The repo root the relative fixture path is resolved against. Passed explicitly so these
   * cases do not depend on the working directory Vitest happens to run in.
   */
  const ROOT = '/Users/dev/Qmulate';

  it.each([
    ['the canonical repo-relative path', FIXTURE_ONLY_INPUT_PATH],
    ['a ./-prefixed path', `./${FIXTURE_ONLY_INPUT_PATH}`],
    ['an absolute path to the same file', `${ROOT}/${FIXTURE_ONLY_INPUT_PATH}`],
    [
      'a path with redundant traversal that resolves to it',
      `${ROOT}/data/../data/fixtures/sample-waqf.json`,
    ],
  ])('accepts %s', (_label, candidate) => {
    expect(() => assertFixtureInputPath(candidate, ROOT)).not.toThrow();
  });

  /**
   * ⚠ REGRESSION — this suite previously asserted that ANY absolute path ending in
   * `data/fixtures/sample-waqf.json` was accepted, because the implementation was a suffix
   * test. Adversarial review showed that let the confidential intake tree straight through the
   * one guard whose entire purpose is to keep real client data out. A suffix is not an identity:
   * the attacker controls the prefix. These cases pin the tightened contract.
   */
  it.each([
    [
      'the fixture path nested under the CONFIDENTIAL intake tree',
      'archive/raw-intake/linga-waqf-case/data/fixtures/sample-waqf.json',
    ],
    [
      'the fixture path under an unrelated absolute prefix',
      '/tmp/exfil/data/fixtures/sample-waqf.json',
    ],
    ['a traversal that escapes the repo root', '../../../../etc/data/fixtures/sample-waqf.json'],
    [
      'the same filename in a different checkout',
      '/Users/someone-else/Qmulate/data/fixtures/sample-waqf.json',
    ],
  ])('refuses %s — a matching SUFFIX is not the same file', (_label, candidate) => {
    expect(() => assertFixtureInputPath(candidate, ROOT)).toThrow(/refusing to read an input file/);
  });

  it.each([
    // The whole reason the gate exists: this directory holds a real family's real names,
    // deed numbers and bank details. It is gitignored, and it must never reach a Railway
    // environment.
    ['the confidential raw-intake tree', 'archive/raw-intake/linga-waqf-case/export.json'],
    ['a lookalike filename', 'data/fixtures/sample-waqf.backup.json'],
    ['a sibling fixture', 'data/fixtures/real-waqf.json'],
    ['a path that merely mentions the fixture', 'data/fixtures/sample-waqf.json.bak'],
    ['a bare filename', 'sample-waqf.json'],
    ['an empty path', ''],
  ])('refuses %s', (_label, candidate) => {
    expect(() => assertFixtureInputPath(candidate)).toThrow(EnvValidationError);
  });

  it('explains the refusal without echoing anything sensitive', () => {
    const caught = captureThrow(() =>
      assertFixtureInputPath('archive/raw-intake/linga-waqf-case/beneficiaries.json'),
    );

    const message = (caught as Error).message;
    expect(message).toContain(FIXTURE_ONLY_INPUT_PATH);
    // The rejected path is NOT echoed. A refusal log must not become a breadcrumb trail
    // pointing at the confidential file someone just tried to load.
    expect(message).not.toContain('linga');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * PRIVILEGE SEPARATION — the boot guard, and "empty means absent"  (ADR-0008 round 6)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertNoPrivilegedDatabaseUrls (ADR-0008 round 6)', () => {
  const VARS = ['MIGRATOR_DATABASE_URL', 'SUPERUSER_DATABASE_URL'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('permits a boot with none of the privileged credentials present', () => {
    // ⚠ THIS IS THE CASE THAT MATTERS MOST, AND IT IS EASY TO BREAK BY MAKING THE VARIABLES REQUIRED.
    // The web runtime must boot holding ONLY the least-privilege credential — that is the entire point
    // of the split. A schema that required the migrator URL would put an owner credential in the web
    // service's environment as a matter of policy.
    expect(() => assertNoPrivilegedDatabaseUrls('apps/web')).not.toThrow();
  });

  it('REFUSES the boot when the migrator credential is present, naming it and the service', () => {
    process.env.MIGRATOR_DATABASE_URL = 'postgresql://qmulate_owner:pw@localhost:5432/db';
    let message = '';
    try {
      assertNoPrivilegedDatabaseUrls('apps/web');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message, 'apps/web booted while holding the OWNER credential').not.toBe('');
    expect(message).toContain('MIGRATOR_DATABASE_URL');
    expect(message).toContain('apps/web');
    // ⚠ NAMES ONLY, NEVER VALUES — these are connection strings with passwords in them, and the
    // secret-hygiene rule at the top of `env.ts` applies to every error this package raises.
    expect(message, 'the refusal leaked the connection string').not.toContain('pw@localhost');
    expect(message).not.toContain('qmulate_owner:pw');
  });

  it('REFUSES the superuser credential too, and reports both together', () => {
    process.env.MIGRATOR_DATABASE_URL = 'postgresql://qmulate_owner:pw@localhost:5432/db';
    process.env.SUPERUSER_DATABASE_URL = 'postgresql://postgres:pw@localhost:5432/db';
    expect(() => assertNoPrivilegedDatabaseUrls('apps/worker')).toThrow(/SUPERUSER_DATABASE_URL/);
    try {
      assertNoPrivilegedDatabaseUrls('apps/worker');
    } catch (error) {
      expect((error as Error).message).toContain('MIGRATOR_DATABASE_URL, SUPERUSER_DATABASE_URL');
    }
  });

  it('treats an EMPTY value as absent, because that is how a credential is withheld', () => {
    // ⚠ MEASURED NECESSARY. `apps/web/playwright.config.ts` sets `MIGRATOR_DATABASE_URL: ''` on the dev
    // server it launches — a child environment can be overridden but cannot have a key deleted — and CI
    // and Railway both materialise an unset variable as `''`. If empty counted as present, the guard
    // would refuse the exact posture it exists to enforce, and the e2e web server would not boot.
    process.env.MIGRATOR_DATABASE_URL = '';
    process.env.SUPERUSER_DATABASE_URL = '   ';
    expect(() => assertNoPrivilegedDatabaseUrls('apps/web')).not.toThrow();
  });

  it('does NOT refuse the provisioning credential — grant.activate needs it', () => {
    // Deliberate, and recorded as an OPEN product-owner question in ADR-0008's round-6 addendum:
    // `ACCESS_MATRIX_DATABASE_URL` is the one credential that may mint a seat, and the shipped
    // `grant.activate` procedure is on the request path. Whether access-matrix administration should
    // move to a separate ops service — taking this credential out of the web environment too — is not
    // settled, and this test records which way the code currently reads.
    process.env.ACCESS_MATRIX_DATABASE_URL =
      'postgresql://qmulate_provisioner:pw@localhost:5432/db';
    try {
      expect(() => assertNoPrivilegedDatabaseUrls('apps/web')).not.toThrow();
    } finally {
      delete process.env.ACCESS_MATRIX_DATABASE_URL;
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * WORKER-ONLY CREDENTIALS — the queue credential stays out of apps/web  (S10/T1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertNoWorkerOnlyDatabaseUrls (S10/T1)', () => {
  const saved: string | undefined = process.env.PGBOSS_DATABASE_URL;

  beforeEach(() => {
    delete process.env.PGBOSS_DATABASE_URL;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.PGBOSS_DATABASE_URL;
    else process.env.PGBOSS_DATABASE_URL = saved;
  });

  it('permits a boot with no queue credential present — the normal web posture', () => {
    expect(() => assertNoWorkerOnlyDatabaseUrls('apps/web')).not.toThrow();
  });

  it('REFUSES the boot when PGBOSS_DATABASE_URL is present, naming it, the service, and the RIGHT blast radius', () => {
    process.env.PGBOSS_DATABASE_URL = 'postgresql://qmulate_pgboss:pw@localhost:5432/db';
    let message = '';
    try {
      assertNoWorkerOnlyDatabaseUrls('apps/web');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message, 'apps/web booted while holding the queue credential').not.toBe('');
    expect(message).toContain('PGBOSS_DATABASE_URL');
    expect(message).toContain('apps/web');
    // The refusal must describe THIS credential's harm — stopping the deadline engine — not
    // borrow the owner-credential text, which would misdescribe the incident to whoever debugs it.
    expect(message).toContain('deadline engine');
    // Names only, never values.
    expect(message, 'the refusal leaked the connection string').not.toContain('pw@localhost');
    expect(message).not.toContain('qmulate_pgboss:pw');
  });

  it('treats an EMPTY value as absent — the playwright/CI way of withholding a credential', () => {
    // `apps/web/playwright.config.ts` blanks PGBOSS_DATABASE_URL on the web server it launches
    // (a child environment can be overridden but never have a key deleted), exactly as it blanks
    // the two privileged URLs. If empty counted as present, the guard would refuse the posture
    // it exists to enforce and no E2E run could boot.
    process.env.PGBOSS_DATABASE_URL = '   ';
    expect(() => assertNoWorkerOnlyDatabaseUrls('apps/web')).not.toThrow();
  });
});
