// QMULATE — residency guardrail LAYER 3: the first-client importer HARD-FAILS (NFR-03 / G-8 · BR-1106)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE IS, AND WHAT IT MIRRORS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `guardrail.ts` is layer 2: the SEED refuses anything but `fixture-only` and anything but the
// fixture file. This file is layer 3, its mirror image: the IMPORTER refuses anything but
// `production` AND `ksa`, refuses the fixture file (importing the fixture is the seed's job), and
// refuses a source that carries the fixture's fictional-data marker. The two programs' guards are
// mirror images ON PURPOSE — there is no value of the environment under which both run, so real
// data and invented data can never be written by the same command in the same place.
//
// Every refusal here is decided BEFORE any database module is imported (`import.ts` makes
// `assertResidentProductionTarget()` its first statement and imports the database dynamically), so
// a refused run cannot have opened a connection, let alone written a row. That is the property
// `import-guardrail.test.ts` proves on the real program, as `residency-guardrail.test.ts` does for
// the seed.
//
// DESIGN CONSTRAINTS (the same as `guardrail.ts`):
//   • callable and testable WITHOUT a database and WITHOUT any `@qmulate/*` dependency beyond the
//     side-effect `.env` loader;
//   • `DATA_CLASSIFICATION` / `DATA_RESIDENCY` read straight from `process.env` — this refusal must
//     not be defeatable by a config module that failed to load. `@qmulate/config` refuses the same
//     pair at app boot (layer 1, extended in S12-4); both layers stay.
//   • the refusal is a NAMED CODE first: every message begins with the literal `IMPORT_REFUSED:`.

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import '@qmulate/config/load-env';

import { PERMITTED_FIXTURE_PATH } from './guardrail.js';

export const IMPORT_TARGET_CLASSIFICATION = 'production' as const;
export const IMPORT_TARGET_RESIDENCY = 'ksa' as const;

/**
 * Every importer refusal throws this. The message ALWAYS begins with `IMPORT_REFUSED:` and the
 * runner writes it as the FIRST line of stderr, with no stack, and exits non-zero (G-8 assertions
 * G-8d/e/f match `/^IMPORT_REFUSED/`).
 */
export class ImportRefusedError extends Error {
  constructor(message: string) {
    super(`IMPORT_REFUSED: ${message}`);
    this.name = 'ImportRefusedError';
  }
}

function show(value: string | undefined): string {
  return value === undefined || value === '' ? '<unset>' : value;
}

/**
 * THE TARGET GATE. Refuses unless `DATA_CLASSIFICATION=production` AND `DATA_RESIDENCY=ksa`.
 * Both values are enumerations, not secrets, so the refusal names what it saw.
 */
export function assertResidentProductionTarget(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { classification: 'production'; residency: 'ksa' } {
  const classification = env.DATA_CLASSIFICATION;
  const residency = env.DATA_RESIDENCY;
  if (classification !== IMPORT_TARGET_CLASSIFICATION) {
    throw new ImportRefusedError(
      `the importer runs ONLY against a production target: DATA_CLASSIFICATION must be ` +
        `"${IMPORT_TARGET_CLASSIFICATION}" (got "${show(classification)}"). Real client records ` +
        `never enter a fixture-only environment — that is the whole of NFR-03, and this environment ` +
        `may hold nothing but data/fixtures/sample-waqf.json (G-8 layer 3).`,
    );
  }
  if (residency !== IMPORT_TARGET_RESIDENCY) {
    throw new ImportRefusedError(
      `the importer runs ONLY against a KSA-resident target: DATA_RESIDENCY must be ` +
        `"${IMPORT_TARGET_RESIDENCY}" (got "${show(residency)}"). A production classification on a ` +
        `non-KSA host is exactly the posture NFR-03 forbids; @qmulate/config refuses to BOOT it and ` +
        `this importer refuses to WRITE to it (G-8 layer 3).`,
    );
  }
  return { classification: 'production', residency: 'ksa' };
}

/** `--source <file>` / `--source=<file>` / `IMPORT_SOURCE`. */
export function requestedImportSource(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--source' && argv[i + 1] !== undefined) return argv[i + 1];
    if (arg.startsWith('--source=')) return arg.slice('--source='.length);
  }
  const fromEnv = env.IMPORT_SOURCE;
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

export function isDryRun(argv: readonly string[] = process.argv): boolean {
  return argv.includes('--dry-run');
}

/**
 * THE SOURCE GATE, half one: a source must be NAMED and must EXIST — and it must NOT be the fixture.
 * Importing the fixture is the seed's job; refusing it here keeps the two programs' guards mirror
 * images (the seed accepts ONLY that path; the importer accepts EVERY path but that one).
 */
export function assertImportSourcePath(candidate: string | undefined): string {
  if (candidate === undefined || candidate.trim() === '') {
    throw new ImportRefusedError(
      'no source named. Pass `--source <file>` (or IMPORT_SOURCE). The importer never guesses a file.',
    );
  }
  const resolved = path.resolve(candidate);
  if (!existsSync(resolved)) {
    throw new ImportRefusedError(`source file does not exist: ${resolved}`);
  }
  const real = realpathSync(resolved);
  const fixture = existsSync(PERMITTED_FIXTURE_PATH)
    ? realpathSync(PERMITTED_FIXTURE_PATH)
    : PERMITTED_FIXTURE_PATH;
  if (real === fixture) {
    throw new ImportRefusedError(
      `the source IS the fixture (${PERMITTED_FIXTURE_PATH}). Invented data is loaded by the SEED ` +
        `under fixture-only; the importer exists for real client records under production+ksa. The ` +
        `two guards are mirror images, and this is the seam between them.`,
    );
  }
  return real;
}

/**
 * The fixture's provenance markers, spelled ONCE here rather than imported from `fixture-schema.ts`
 * (which would pull the whole zod tree in ahead of the gate). Kept in step with `FIXTURE_MARKER`,
 * `map.ts`'s Arabic marker and the fixture's `(fictional)` name suffix by `import-guardrail.test.ts`.
 */
export const FICTIONAL_MARKERS: readonly string[] = [
  'Entirely fictional',
  'بيانات وهمية',
  '(fictional)',
];

/**
 * THE SOURCE GATE, half two: a source carrying the fixture's fictional-data marker is invented data
 * dressed as a client record. It is refused on CONTENT, before parsing, so a renamed copy of the
 * fixture is caught as surely as the fixture itself.
 */
export function assertNoFictionalMarker(rawText: string): void {
  for (const marker of FICTIONAL_MARKERS) {
    if (rawText.includes(marker)) {
      throw new ImportRefusedError(
        `the source carries the fixture's fictional-data marker (${JSON.stringify(marker)}). ` +
          `Invented records are the seed's domain; the importer refuses them so a fixture copy can ` +
          `never be written into a production target as if it were a client's record.`,
      );
    }
  }
}
