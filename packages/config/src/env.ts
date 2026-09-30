/**
 * QMULATE — environment schema and fail-fast validation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NFR-03 · RESIDENCY GUARDRAIL (release gate G-8) — the reason this file exists
 * ═══════════════════════════════════════════════════════════════════════════
 * QMULATE processes real Saudi family-waqf data: beneficiary identities, IBANs,
 * deed numbers and UBO records. That data is subject to KSA data residency and
 * the PDPL and must never leave KSA-resident infrastructure.
 *
 * `DATA_CLASSIFICATION` is therefore a REQUIRED, validated variable with exactly
 * two legal values:
 *
 *   'fixture-only'  the process may only ever touch invented data, i.e.
 *                   `data/fixtures/sample-waqf.json`.
 *   'production'    reserved for KSA-resident production infrastructure only.
 *
 * Until a KSA-resident production environment exists, `fixture-only` is the only
 * value that may appear anywhere — local, CI, or Railway. The app REFUSES TO
 * BOOT when the variable is missing or invalid, and there is deliberately no
 * `SKIP_ENV_VALIDATION` escape hatch: an escape hatch defeats guardrail layer 1.
 *
 * ── Secret hygiene ─────────────────────────────────────────────────────────
 * Validation errors print variable NAMES and zod messages only. No environment
 * VALUE is ever logged, echoed, or embedded in an Error message — a stack trace
 * from a failed boot must never leak `BETTER_AUTH_SECRET` or `DATABASE_URL`.
 *
 * ── Lazy by design ─────────────────────────────────────────────────────────
 * Parsing happens on first access, not at module load, so that importing this
 * module in a unit test (or in a lint/typecheck pass) does not explode. Consumers
 * can use either `getServerEnv()` or the `serverEnv` proxy — both parse once and
 * memoise.
 */

import { z } from 'zod';

import { loadRootEnv } from './load-env.js';

// Plain Node entry points (seed, worker, scripts, Vitest) get no `.env` for free — load the
// monorepo-root one before anything reads `process.env`. Never overrides an already-set value.
loadRootEnv();

/* ─────────────────────────────────────────────────────────────────────────────
 * Residency classification
 * ────────────────────────────────────────────────────────────────────────── */

export const DATA_CLASSIFICATIONS = ['fixture-only', 'production'] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/**
 * ⊕ S12-4 · GUARDRAIL LAYER 1, EXTENDED (G-8 · NFR-03). `DATA_RESIDENCY` states WHERE this process
 * runs. It is REQUIRED — and must be `ksa` — whenever `DATA_CLASSIFICATION=production`, so the
 * application itself REFUSES TO BOOT in a non-KSA production posture. Until S12-4 it booted: only the
 * absence of any creation path kept real data out, and S12-3b built one (UI intake). Under
 * `fixture-only` the variable is optional and carries no meaning (fixture data may live anywhere).
 */
export const DATA_RESIDENCIES = ['ksa', 'non-ksa'] as const;
export type DataResidency = (typeof DATA_RESIDENCIES)[number];

/** The one fixture file any `fixture-only` process is permitted to read. */
export const FIXTURE_ONLY_INPUT_PATH = 'data/fixtures/sample-waqf.json';

/* ─────────────────────────────────────────────────────────────────────────────
 * The TEST-ONLY auth rate-limit override  (S7 — owner-approved 2026-08-19)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The ONE legal value of `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` — and it is a WORD, not a
 * boolean, on purpose.
 *
 * `true` / `1` / `yes` invite precisely the accident this variable must not be capable of:
 * a value that some reader coerces the wrong way round. With a literal token there is no
 * truthiness to get wrong — `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT=false` is not "off", it is a
 * BOOT FAILURE naming the variable, which is the loudest available way to say that this is
 * not a switch anyone flips in passing.
 *
 * Absence is the safe state and absence is the default: see the schema field below, and
 * `@qmulate/auth`'s `authRateLimitPosture()` for the second condition it must also satisfy.
 */
export const AUTH_RATE_LIMIT_TEST_OVERRIDE = 'disabled-for-tests' as const;
export type AuthRateLimitTestOverride = typeof AUTH_RATE_LIMIT_TEST_OVERRIDE;

/* ─────────────────────────────────────────────────────────────────────────────
 * Schemas
 * ────────────────────────────────────────────────────────────────────────── */

/** The shared shape of every connection-string variable. Written once so they cannot drift. */
function postgresUrl(name: string): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .url(`${name} must be a URL`)
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      `${name} must be a postgres:// or postgresql:// connection string`,
    );
}

/**
 * An OPTIONAL connection string, where **an empty value means absent** rather than invalid.
 *
 * ⚠ `.optional()` ALONE IS NOT ENOUGH, AND THE FAILURE IS EXACTLY THE ONE THIS SPLIT INTRODUCES.
 * Zod's `.optional()` skips `undefined` only — an EMPTY STRING is a present value and fails `.url()`.
 * Both of the ways a privileged credential is legitimately withheld produce an empty string rather
 * than an absent key:
 *
 *   · `apps/web/playwright.config.ts` sets `MIGRATOR_DATABASE_URL: ''` on the dev server it launches,
 *     because a child environment can be OVERRIDDEN but not have a key deleted;
 *   · CI and Railway both materialise an unset variable as `''` in a job or service environment.
 *
 * MEASURED: without this, the e2e web server refused to boot with "MIGRATOR_DATABASE_URL must be a
 * URL" — i.e. the app rejected the very posture it is supposed to run in. Treating empty as absent is
 * the strict reading, not a loosening: the guard in `./privileged-urls.js` uses the same
 * `trim() === ''` test, so "absent" means the same thing on both sides.
 */
function optionalPostgresUrl(name: string): z.ZodType<string | undefined> {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    postgresUrl(name).optional(),
  ) as z.ZodType<string | undefined>;
}

/** Comma-separated origin list → trimmed entries; an unset or blank variable is an empty list. */
function splitOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** `scheme://host[:port]` and nothing else — a path, query or trailing slash is a typo, not an origin. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

export const serverEnvSchema = z
  .object({
    // ── REQUIRED ──────────────────────────────────────────────────────────────
    /**
     * ⚠ SINCE ADR-0008 ROUND 6 THIS IS THE **LEAST-PRIVILEGE** RUNTIME CREDENTIAL.
     *
     * It must connect as `qmulate_app`: no INSERT/UPDATE/DELETE on `waqf_access_grant` or `membership`,
     * no ownership of any table, and therefore no `ALTER TABLE … DISABLE TRIGGER`. A `DATABASE_URL`
     * whose role OWNS the schema silently makes migrations 10 and 11 decorative — GRANTs and
     * `FORCE ROW LEVEL SECURITY` both yield to the owner — and the app would keep working, which is
     * exactly why it is worth saying here. `scripts/provision-db-roles.ts` creates the role;
     * `packages/database/test/authorization-plane-privilege.integration.test.ts` FAILS (never skips)
     * when the posture is absent.
     */
    DATABASE_URL: postgresUrl('DATABASE_URL'),

    /** NFR-03 residency guardrail. See the file header. */
    DATA_CLASSIFICATION: z.enum(DATA_CLASSIFICATIONS, {
      errorMap: () => ({
        message: `must be one of: ${DATA_CLASSIFICATIONS.join(' | ')} (NFR-03 residency guardrail)`,
      }),
    }),
    /** ⊕ S12-4 · see `DATA_RESIDENCIES`. Empty / whitespace means ABSENT (the `optionalPostgresUrl` rule). */
    DATA_RESIDENCY: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .enum(DATA_RESIDENCIES, {
          errorMap: () => ({
            message: `must be one of: ${DATA_RESIDENCIES.join(' | ')} (NFR-03 residency guardrail)`,
          }),
        })
        .optional(),
    ) as z.ZodType<DataResidency | undefined>,

    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be an absolute URL'),
    /**
     * Extra browser origins allowed to call the auth API with a session cookie, comma-separated
     * (e.g. `http://192.168.0.101:3000` for office-LAN access to a dev server, or a custom domain
     * that fronts the same deployment). The origin of BETTER_AUTH_URL is always trusted; no
     * wildcards. Cross-origin POSTs from anywhere else are refused (403 INVALID_ORIGIN).
     */
    BETTER_AUTH_TRUSTED_ORIGINS: z
      .string()
      .optional()
      .transform((raw) => splitOrigins(raw))
      .pipe(
        z.array(
          z.string().refine(isOrigin, {
            message: 'BETTER_AUTH_TRUSTED_ORIGINS entries must be absolute origins (scheme://host[:port]) with no path',
          }),
        ),
      ),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),

    // ── OPTIONAL / DEFAULTED ─────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    PORT: z.coerce.number().int().positive().default(3000),

    /**
     * Idle-session timeout (minutes) for money-movement and statutory-filing
     * roles. 30 is the NFR-06 SECURITY target — not a statutory figure — but it
     * stays configurable rather than a hardcoded constant so it can be tightened
     * without a code change.
     */
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),

    /* ── THE PRIVILEGE-SEPARATION CREDENTIALS (ADR-0008 round 6) ──────────────
     *
     * ⚠ ALL THREE ARE **OPTIONAL, DELIBERATELY**. The web runtime must boot with
     * NONE of them — that is the entire point of the split. Making any of them
     * required would put a privileged credential in the web service's environment
     * as a matter of schema, which is the misconfiguration
     * `assertNoPrivilegedDatabaseUrls()` exists to catch.
     *
     * Where each one belongs:
     *   ACCESS_MATRIX_DATABASE_URL  the only credential that may mint or widen a
     *                               seat (`qmulate_provisioner`). Needed by any
     *                               service that serves `grant.activate`.
     *   MIGRATOR_DATABASE_URL       migrations, the fixture seed, the test
     *                               harnesses' scaffolding, one-off bootstrap
     *                               (`qmulate_owner` — owns every table).
     *                               MUST NOT be present in web or worker.
     *   SUPERUSER_DATABASE_URL      provisioning only, one command per
     *                               environment. MUST NOT be present in ANY
     *                               application service.
     */
    ACCESS_MATRIX_DATABASE_URL: optionalPostgresUrl('ACCESS_MATRIX_DATABASE_URL'),
    MIGRATOR_DATABASE_URL: optionalPostgresUrl('MIGRATOR_DATABASE_URL'),
    SUPERUSER_DATABASE_URL: optionalPostgresUrl('SUPERUSER_DATABASE_URL'),

    /* ── TEST-ONLY: RELAX THE AUTH RATE LIMITER (S7, owner-approved 2026-08-19) ────
     *
     * ⚠ **ABSENT / UNSET / EMPTY ⇒ FULL RATE LIMITING.** That is the whole design: the
     * production posture cannot be weakened by a variable nobody set, a variable that got
     * dropped by a platform, or a variable that arrived as `''` — which is how CI, Railway and
     * `playwright.config.ts` all spell "withheld" (see `optionalPostgresUrl` above, which was
     * written after that exact case broke the e2e boot).
     *
     * ⚠ **THIS VARIABLE IS NOT SUFFICIENT ON ITS OWN, BY CONSTRUCTION.** The relaxation also
     * requires `DATA_CLASSIFICATION === 'fixture-only'`, and the AND is enforced in
     * `@qmulate/auth`'s `authRateLimitPosture()`, not here. Neither condition is enough alone,
     * and the reason the *other* one is not enough is concrete rather than theoretical:
     * **staging is deliberately fixture-only** (`.github/workflows/ci.yml`'s `deploy-staging`
     * job sets `DATA_CLASSIFICATION: fixture-only`, because staging is not KSA-resident), so a
     * classification-only gate would silently disable rate limiting on a DEPLOYED environment.
     *
     * WHY IT IS DECLARED HERE rather than read from `process.env` at the point of use: this is
     * the file that refuses to boot on a bad guardrail value (NFR-03 precedent above). A raw
     * `process.env.X === 'y'` read accepts every typo silently and fails open on none of them,
     * which for a security control is the wrong failure mode — an unrecognised value must stop
     * the process, not be interpreted.
     *
     * WHY THE NAME LEADS WITH `TEST_ONLY_DISABLE`: it has to be unmistakable in a CI diff. A
     * reviewer who sees `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` appear in a deploy job should balk
     * without reading a doc, and a name like `E2E_RATE_LIMIT_MODE` would not achieve that.
     *
     * ⚠ **BUT A REVIEWER IS NOT AN ENFORCEMENT MECHANISM, AND AV7-AUD-F5 MEASURED THE ROUTE THAT
     * BYPASSES ONE.** The paragraph above was, until 2026-08-19, the only thing standing between
     * this variable and a deployed process. What was measured, with `apps/web/next.config.ts`'s own
     * call (`loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production')`):
     *
     *     NODE_ENV=<unset>     -> loadedEnvFiles [".env.development",".env"] -> override injected
     *     NODE_ENV=test        -> loadedEnvFiles [".env.test",".env"]        -> override injected
     *     NODE_ENV=development -> loadedEnvFiles [".env.development",".env"] -> override injected
     *     NODE_ENV=production  -> loadedEnvFiles [".env.production"]         -> override injected
     *
     * — and `.gitignore` covered `.env`, `.env.local` and `.env.*.local` but NOT `.env.production`,
     * `.env.test` or `.env.development`, so a COMMITTED file satisfied BOTH conditions of the
     * relaxation on the very process that serves `/api/auth/*`, with a `console.warn` as the only
     * signal. `NODE_ENV` therefore still selected the posture — not through any branch in
     * `@qmulate/auth` (there is none; it was grepped) but through WHICH FILE Next reads. The
     * property the S7 change removed was reachable again one file away.
     *
     * THE THREE THINGS THAT NOW ENFORCE IT, none of which is a reviewer:
     *   1. `.gitignore` ignores `.env.*` (keeping `!.env.example`), so the file cannot be committed.
     *      Verified with `git check-ignore -v`, which names the rule that matched.
     *   2. `loadRootEnv`'s `NEVER_FROM_FILE` now lists this variable beside `DATA_CLASSIFICATION`
     *      — for the Node entry points that WRITE. ⚠ It does not reach `apps/web`, which uses
     *      Next's loader; that is what 1 and 3 are for.
     *   3. `packages/auth/test/av7-rate-limit-bypass.test.ts` asserts the variable appears in
     *      `.github/workflows/ci.yml` ONLY inside the `e2e` job, and in no tracked `.env*` file.
     *
     * ⚠ AND ONE BOUND ON THE "TWO INDEPENDENT CONDITIONS" CLAIM, recorded rather than fixed
     * (AV7-AUD-F10): `DATA_CLASSIFICATION` has exactly two legal values and `production` is
     * unreachable until KSA-resident production exists, so condition 2 is a CONSTANT `true` in every
     * environment that exists today — `.env`, every CI job and `deploy-staging` all set
     * `fixture-only`. The AND is therefore a ONE-condition gate in practice, and the sibling phrase
     * in `@qmulate/auth`'s `rate-limit.ts` — "one of them impossible on production data by
     * construction" — becomes true only when production data does. Not a defect; a bound this
     * comment must carry rather than a claim it may make.
     */
    TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: z.preprocess(
      // Empty / whitespace means ABSENT, exactly as in `optionalPostgresUrl`. Same test
      // (`trim() === ''`), so "withheld" means the same thing on both sides of this schema.
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .enum([AUTH_RATE_LIMIT_TEST_OVERRIDE], {
          errorMap: () => ({
            message:
              `must be exactly '${AUTH_RATE_LIMIT_TEST_OVERRIDE}' or be ABSENT ` +
              '(absent = full rate limiting). Booleans are refused on purpose: `false` is not ' +
              '"off", it is this error — and it additionally requires ' +
              "DATA_CLASSIFICATION='fixture-only' to have any effect at all.",
          }),
        })
        .optional(),
    ) as z.ZodType<AuthRateLimitTestOverride | undefined>,
  })
  .superRefine((env, ctx) => {
    // ⊕ S12-4 · THE PRODUCTION POSTURE MUST BE KSA-RESIDENT, OR THE PROCESS DOES NOT START. This is
    // the app-boot form of guardrail layer 3 (the importer refuses the same pair at its first
    // statement). Reported on DATA_RESIDENCY, naming the rule and never a value.
    if (env.DATA_CLASSIFICATION === 'production' && env.DATA_RESIDENCY !== 'ksa') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATA_RESIDENCY'],
        message:
          env.DATA_RESIDENCY === undefined
            ? "is REQUIRED when DATA_CLASSIFICATION=production and must be 'ksa' — real client data never leaves KSA-resident infrastructure (NFR-03, G-8)"
            : "must be 'ksa' when DATA_CLASSIFICATION=production — a non-KSA production posture is refused at boot (NFR-03, G-8)",
      });
    }
  });

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be an absolute URL'),
  /** Arabic is the product default, not a fallback. */
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['ar', 'en']).default('ar'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/* ─────────────────────────────────────────────────────────────────────────────
 * Fail-fast plumbing
 * ────────────────────────────────────────────────────────────────────────── */

/** Thrown (rather than `process.exit`) wherever exiting the process is wrong. */
export class EnvValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(scope: string, issues: readonly string[]) {
    super(formatEnvErrorMessage(scope, issues));
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Build the human-readable report. NAMES AND MESSAGES ONLY — never values.
 */
function formatEnvErrorMessage(scope: string, issues: readonly string[]): string {
  return [
    '',
    `✗ Invalid ${scope} environment — QMULATE refuses to start.`,
    '',
    ...issues.map((issue) => `  • ${issue}`),
    '',
    '  Fix your environment (see .env.example) and try again.',
    '  Reminder (NFR-03): DATA_CLASSIFICATION must be `fixture-only` everywhere',
    '  until a KSA-resident production environment exists.',
    '  There is no SKIP_ENV_VALIDATION escape hatch, by design.',
    '',
  ].join('\n');
}

/** Flatten a zod error into `VAR_NAME: message` lines. Values are never included. */
function collectIssues(error: z.ZodError): string[] {
  const flattened = error.flatten();
  const issues: string[] = [];

  for (const [name, messages] of Object.entries(flattened.fieldErrors)) {
    for (const message of messages ?? []) {
      issues.push(`${name}: ${message}`);
    }
  }
  for (const message of flattened.formErrors) {
    issues.push(message);
  }

  return issues.length > 0 ? issues.sort() : ['unknown validation failure'];
}

/**
 * True where killing the process is the correct failure mode (Node CLI, the
 * worker, the seed). Inside Next.js — server components, route handlers, the
 * build — we throw instead, so the framework reports a loud, catchable error
 * rather than the dev server vanishing.
 */
function shouldExitProcess(): boolean {
  if (typeof process === 'undefined' || typeof process.exit !== 'function') return false;
  if (process.env['NEXT_RUNTIME'] !== undefined) return false; // 'nodejs' | 'edge'
  if (process.env['NEXT_PHASE'] !== undefined) return false;
  return true;
}

/**
 * Parse or die. Prints the aggregated report to stderr, then exits non-zero in
 * CLI/worker contexts or throws inside Next.
 */
export function parseOrExit<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Record<string, string | undefined>,
  scope = 'server',
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const issues = collectIssues(result.error);
  const message = formatEnvErrorMessage(scope, issues);

  // Boot-time diagnostics, emitted before any logger exists. Names only, no values.
  console.error(message);

  if (shouldExitProcess()) {
    process.exit(1);
  }
  throw new EnvValidationError(scope, issues);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Lazy accessors
 * ────────────────────────────────────────────────────────────────────────── */

let cachedServerEnv: ServerEnv | undefined;
let cachedClientEnv: ClientEnv | undefined;

/** Parse (once) and return the validated server environment. */
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseOrExit(serverEnvSchema, process.env, 'server');
  return cachedServerEnv;
}

/**
 * Parse (once) and return the validated client environment.
 *
 * The reads below MUST stay literal `process.env.NEXT_PUBLIC_*` member accesses:
 * Next.js inlines client env vars by static analysis, and a dynamic lookup such
 * as `process.env[name]` would be replaced with `undefined` in the browser bundle.
 */
export function getClientEnv(): ClientEnv {
  cachedClientEnv ??= parseOrExit(
    clientEnvSchema,
    {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
    },
    'client',
  );
  return cachedClientEnv;
}

/** Test-only: drop the memoised parse so a test can re-stub `process.env`. */
export function resetEnvCacheForTests(): void {
  cachedServerEnv = undefined;
  cachedClientEnv = undefined;
}

function lazyEnvProxy<T extends object>(load: () => T): T {
  return new Proxy({} as T, {
    get: (_target, property) => Reflect.get(load(), property),
    has: (_target, property) => Reflect.has(load(), property),
    ownKeys: () => Reflect.ownKeys(load()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(load(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set: () => {
      throw new Error('The QMULATE environment is read-only.');
    },
    deleteProperty: () => {
      throw new Error('The QMULATE environment is read-only.');
    },
  });
}

/**
 * Validated server environment, parsed on FIRST PROPERTY ACCESS.
 * `import { serverEnv } from '@qmulate/config/env'` is safe in a test file;
 * `serverEnv.DATABASE_URL` is what triggers validation.
 */
export const serverEnv: ServerEnv = lazyEnvProxy(getServerEnv);

/** Validated client environment, parsed on first property access. */
export const clientEnv: ClientEnv = lazyEnvProxy(getClientEnv);

/* ─────────────────────────────────────────────────────────────────────────────
 * Residency helpers (NFR-03 / G-8)
 * ────────────────────────────────────────────────────────────────────────── */

/** The validated residency classification of this process. */
export function dataClassification(): DataClassification {
  return getServerEnv().DATA_CLASSIFICATION;
}

/** `true` when this process is only permitted to touch invented fixture data. */
export function isFixtureOnly(): boolean {
  return dataClassification() === 'fixture-only';
}

/** `true` when this process is running against KSA-resident production data. */
export function isProductionData(): boolean {
  return dataClassification() === 'production';
}

/**
 * Hard gate for anything that writes or reads bulk data — above all the seed.
 *
 * THROWS (never exits silently, never warns-and-continues) unless
 * `DATA_CLASSIFICATION === 'fixture-only'`. Release gate G-8 requires that the
 * seed exit non-zero when invoked with `DATA_CLASSIFICATION=production`; CI
 * asserts exactly that.
 *
 * @param operation short label used in the error message, e.g. `'seed'`.
 */
export function assertFixtureOnly(operation = 'this operation'): void {
  const classification = dataClassification();
  if (classification === 'fixture-only') return;

  throw new EnvValidationError('residency guardrail (NFR-03 / G-8)', [
    `DATA_CLASSIFICATION: refusing to run ${operation} with classification '${classification}'.`,
    "DATA_CLASSIFICATION: 'fixture-only' is the only permitted value until a KSA-resident production environment exists.",
    `DATA_CLASSIFICATION: the only permitted input file is '${FIXTURE_ONLY_INPUT_PATH}'.`,
  ]);
}

/**
 * Companion guard for the seed's INPUT PATH half of G-8: refuses any file other
 * than the invented fixture.
 *
 * ⚠ FOUND BY ADVERSARIAL REVIEW. The first version of this function was a
 * SUFFIX test (`normalised.endsWith('/' + FIXTURE_ONLY_INPUT_PATH)`), which is
 * the exact opposite of what its own doc comment promised: it happily accepted
 *
 *   archive/raw-intake/linga-waqf-case/data/fixtures/sample-waqf.json
 *   /tmp/exfil/data/fixtures/sample-waqf.json
 *   ../../../../etc/data/fixtures/sample-waqf.json
 *
 * — i.e. a path under the confidential intake directory sailed straight through
 * the guard whose entire job is to keep real client data out. A suffix is not an
 * identity: any attacker-controlled prefix satisfies it.
 *
 * It now resolves both sides against the repo root and compares absolute paths,
 * so only the one real file is accepted however it is spelled. Symlink identity
 * is handled by `packages/database/src/guardrail.ts`, which additionally
 * compares `realpath`s — this function is the config-layer half and must not be
 * the weaker of the two.
 *
 * @param inputPath the path the caller was asked to read.
 * @param repoRoot  the directory `FIXTURE_ONLY_INPUT_PATH` is relative to.
 */
/* ─────────────────────────────────────────────────────────────────────────────
 * Privilege-separation boot guard (ADR-0008 round 6) — re-exported
 *
 * ⚠ IT LIVES IN ITS OWN MODULE WITH **NO NODE BUILTIN IMPORTS**, AND THAT IS NOT STYLE.
 * This file imports `./load-env.js`, which reads `node:fs`/`node:path`/`node:url`. `apps/web`'s
 * `instrumentation.ts` is compiled for BOTH the nodejs and the EDGE runtime, and webpack fails the
 * whole build with `UnhandledSchemeError: Reading from "node:fs" is not handled` when an edge bundle
 * reaches a node builtin. MEASURED: importing the guard from here broke `next build` outright.
 *
 * `./privileged-urls.js` therefore contains only the variable list, the guard and the error class it
 * throws — no filesystem, no zod, nothing. Both this module and `apps/web/src/instrumentation.ts`
 * import it, so there is still exactly ONE list of privileged variable names.
 * ────────────────────────────────────────────────────────────────────────── */

export {
  PRIVILEGED_DATABASE_URL_VARIABLES,
  WORKER_ONLY_DATABASE_URL_VARIABLES,
  assertNoPrivilegedDatabaseUrls,
  assertNoWorkerOnlyDatabaseUrls,
} from './privileged-urls.js';

export function assertFixtureInputPath(inputPath: string, repoRoot = process.cwd()): void {
  const toAbsolute = (candidate: string): string => {
    const slashed = candidate.replaceAll('\\', '/');
    const joined = slashed.startsWith('/')
      ? slashed
      : `${repoRoot.replaceAll('\\', '/')}/${slashed}`;
    // Resolve `.`/`..` without touching the filesystem, so this stays usable in a unit test.
    const parts: string[] = [];
    for (const segment of joined.split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') parts.pop();
      else parts.push(segment);
    }
    return `/${parts.join('/')}`;
  };

  if (toAbsolute(inputPath) === toAbsolute(FIXTURE_ONLY_INPUT_PATH)) return;

  throw new EnvValidationError('residency guardrail (NFR-03 / G-8)', [
    `SEED_FILE: refusing to read an input file other than '${FIXTURE_ONLY_INPUT_PATH}'.`,
    'SEED_FILE: real client data must never enter a non-KSA-resident environment.',
  ]);
}
