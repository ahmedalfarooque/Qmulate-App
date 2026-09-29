// QMULATE — residency guardrail (NFR-03 / gate G-8)
//
// WHY THIS FILE EXISTS
// ───────────────────────────────────────────────────────────────────────────────────────────
// KSA data residency and PDPL compliance are DEFERRED to before production (§17). Until a
// KSA-resident production environment exists, **no real client data may touch any Railway
// environment** — the only data permitted anywhere in this repo's infrastructure is the
// invented fixture at `data/fixtures/sample-waqf.json`.
//
// That promise is enforced by FOUR INDEPENDENT LAYERS (§17 "Residency guardrail"):
//   1. ENV FLAG      — `DATA_CLASSIFICATION` (`fixture-only` | `production`) is required and
//                      zod-validated at boot in `@qmulate/config`; the app refuses to start
//                      without it.                                     [E0 — ships in S1]
//   2. SEED REFUSES  — the fixture seed aborts unless `DATA_CLASSIFICATION=fixture-only`, and
//                      it will not load anything but `sample-waqf.json`.  ← THIS FILE  [S1]
//   3. IMPORT HARD-FAILS — the first-client importer (BR-1106) hard-fails unless
//                      `DATA_CLASSIFICATION=production` AND `DATA_RESIDENCY=ksa`; refuses the
//                      fixture and any fictional-marker source.  ← `import-guardrail.ts` [S12-4 ✓]
//   4. CI CHECK      — the `residency-guardrail` job reproduces (2) and (3) and fails the
//                      pipeline if either stops refusing.               [S1 for the (2) leg]
//
// Sprint 1 closed G-8 only PARTIALLY (layers 1, 2 and the (2)-leg of 4). ⊕ S12-4 landed layer 3
// (`import-guardrail.ts` + `import.ts`, CI G-8d/e/f) and EXTENDED layer 1 (`@qmulate/config` refuses
// to boot a `production` posture without `DATA_RESIDENCY=ksa`). G-8 is asserted in FULL since S12-4.
//
// DESIGN CONSTRAINTS
//   • Everything here must be callable and testable WITHOUT a database and WITHOUT any
//     `@qmulate/*` dependency, so B1–B5 can run as plain unit tests.
//   • `DATA_CLASSIFICATION` is read straight from `process.env` rather than through
//     `@qmulate/config`. That is deliberate: this refusal must not be defeatable by a config
//     module that failed to load, and the seed must refuse identically in a bare `tsx` process.
//     `@qmulate/config` still validates the same variable at app boot (assertions B1/B2).
//   • The permitted input path is a CONSTANT, never an argument. A caller may *name* a file,
//     but the only name that is accepted is the fixture's own resolved realpath.

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Side-effect import, and it must come BEFORE anything reads `process.env`.
//
// This module is the FIRST thing the seed runs — deliberately, so the classification gate closes
// before a database connection is even opened. That ordering also means it runs before any module
// that would otherwise have loaded the monorepo-root `.env`, so without this line a developer
// with a perfectly good `.env` gets `got "<unset>"` and the seed refuses.
//
// This cannot weaken the gate: the loader never overrides a variable that is already set (so CI
// and Railway still win), and the only value that satisfies `assertFixtureOnly` is the
// restrictive one. A `.env` saying `production` is still refused.
import '@qmulate/config/load-env';

/** The two legal values of `DATA_CLASSIFICATION`. Mirrored by the zod env schema in `@qmulate/config`. */
export const DATA_CLASSIFICATION_VALUES = ['fixture-only', 'production'] as const;
export type DataClassification = (typeof DATA_CLASSIFICATION_VALUES)[number];

/**
 * Every guardrail refusal, fixture-drift failure, and unmapped-enum failure throws this.
 *
 * The message ALWAYS begins with the literal `SEED_REFUSED:` — acceptance assertions B3/B4/B5
 * match `/^SEED_REFUSED/` against stderr, so the runner must make this the FIRST thing it
 * writes to stderr (no stack trace, no preamble) and must exit non-zero.
 */
export class SeedRefusedError extends Error {
  readonly code = 'SEED_REFUSED';

  constructor(reason: string) {
    super(`SEED_REFUSED: ${reason}`);
    this.name = 'SeedRefusedError';
  }
}

/** `<repo>/packages/database` */
export const PACKAGE_ROOT: string = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** `<repo>` — this file is at `<repo>/packages/database/src/guardrail.ts`, so three levels up. */
export const REPO_ROOT: string = path.resolve(PACKAGE_ROOT, '..', '..');

/** The ONE permitted seed input, relative to the repo root. Referenced verbatim in error text. */
export const PERMITTED_FIXTURE_RELATIVE_PATH = 'data/fixtures/sample-waqf.json';

/** The ONE permitted seed input, absolute. A constant — never derived from user input. */
export const PERMITTED_FIXTURE_PATH: string = path.join(
  REPO_ROOT,
  ...PERMITTED_FIXTURE_RELATIVE_PATH.split('/'),
);

/**
 * LAYER 2a — refuse to run unless `DATA_CLASSIFICATION=fixture-only`.
 *
 * Called FIRST by the seed, before any database module is even imported, so a misconfigured
 * environment cannot so much as open a connection.
 *
 * @param raw the raw env value; injectable so B1–B3 can be unit-tested without mutating `process.env`.
 * @returns the validated literal `'fixture-only'`.
 * @throws {SeedRefusedError} on any other value, including `undefined`.
 */
export function assertFixtureOnly(
  raw: string | undefined = process.env.DATA_CLASSIFICATION,
): 'fixture-only' {
  if (raw === 'fixture-only') return raw;
  const got = raw === undefined ? '<unset>' : raw;
  throw new SeedRefusedError(
    `DATA_CLASSIFICATION must be "fixture-only" (got "${got}"). ` +
      `Allowed values: ${DATA_CLASSIFICATION_VALUES.join(' | ')}. ` +
      `Real client data may never leave KSA-resident infrastructure (NFR-03).`,
  );
}

/**
 * Reads a caller-requested fixture path from `SEED_FILE` / `--file <p>` / `--file=<p>`.
 *
 * NOTE the shape of this API: a requested path is only ever used to be REJECTED. The seed
 * always loads {@link PERMITTED_FIXTURE_PATH}; supplying anything else is an error rather than
 * an override. Parsing the flag at all is what makes assertion B4 meaningful.
 */
export function requestedFixturePath(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--file' && argv[i + 1] !== undefined) return argv[i + 1];
    if (arg.startsWith('--file=')) return arg.slice('--file='.length);
  }
  const fromEnv = env.SEED_FILE;
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

/**
 * LAYER 2b — refuse any input file other than the fixture.
 *
 * Compares REALPATHS, so a symlink, a relative path, a `..` traversal, or a copy at a different
 * location all fail. `undefined` means "no override requested" and resolves to the constant.
 *
 * @returns the absolute, real path of the fixture that may be read.
 * @throws {SeedRefusedError} when the fixture is missing, or when a different file was named.
 */
export function assertPermittedFixturePath(candidate?: string): string {
  if (!existsSync(PERMITTED_FIXTURE_PATH)) {
    throw new SeedRefusedError(
      `only ${PERMITTED_FIXTURE_RELATIVE_PATH} may be seeded, and it was not found at ` +
        `${PERMITTED_FIXTURE_PATH}`,
    );
  }
  const permittedReal = realpathSync(PERMITTED_FIXTURE_PATH);
  if (candidate === undefined) return permittedReal;

  let candidateReal: string;
  try {
    candidateReal = realpathSync(path.resolve(candidate));
  } catch {
    // A non-existent override is still an override: refuse rather than silently fall back.
    throw new SeedRefusedError(
      `only ${PERMITTED_FIXTURE_RELATIVE_PATH} may be seeded (requested "${candidate}", which ` +
        `does not resolve)`,
    );
  }
  if (candidateReal !== permittedReal) {
    throw new SeedRefusedError(
      `only ${PERMITTED_FIXTURE_RELATIVE_PATH} may be seeded (requested "${candidate}")`,
    );
  }
  return permittedReal;
}
