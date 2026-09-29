// QMULATE — RELEASE GATE G-8 / scenario V-12: the residency guardrail (NFR-03).
//
// NO DATABASE. That is not a limitation of this suite, it is the property being tested: the seed
// must refuse BEFORE it imports a database module, so a refused run cannot have written a row and
// cannot even have opened a connection. `src/seed.ts` enforces that by making `assertFixtureOnly()`
// the first statement of `main()` and by importing every database module dynamically, after it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT G-8 PROMISES, AND HOW MUCH OF IT SPRINT 1 ACTUALLY CLOSES
// ═══════════════════════════════════════════════════════════════════════════════════════════
// KSA data residency and PDPL are deferred to before production. Until a KSA-resident production
// environment exists, the ONLY data permitted on any Railway environment is the invented fixture.
// Four layers enforce that:
//   1. ENV FLAG        `DATA_CLASSIFICATION` is required and zod-validated at app boot   [E0, S1]
//   2. SEED REFUSES    unless fixture-only, and only for sample-waqf.json          ← THIS FILE
//   3. IMPORT HARD-FAILS  the first-client importer (BR-1106)      ← `import-guardrail.test.ts` [S12-4 ✓]
//   4. CI CHECK        the `residency-guardrail` job reproduces (2) and (3)  [(2) S1 · (3) S12-4 ✓]
//
// ⊕ S12-4: layer 3 EXISTS (`src/import-guardrail.ts`, `src/import.ts`), is tested in
// `import-guardrail.test.ts` (same two-layer shape as this file), and CI asserts it (G-8d/e/f). The
// `it.todo` this file carried since Sprint 1 is replaced by the mirror assertion at the end.
//
// ── THIS FILE IS WHAT `pnpm test:guardrail` RUNS (S4 residuals, H1) ─────────────────────────
// That command used to execute ZERO tests: no workspace defined the script, so turbo resolved every
// one to `<NONEXISTENT>`, the only task that ran was `prisma generate`, and its `Tasks: 1 successful`
// was quoted as G-8 evidence. It now runs THIS file (layer 2 — the seed's refusals, G-8a/G-8b) and
// `@qmulate/config`'s `test/env.test.ts` (layer 1 — the app refusing to boot without the flag, the
// test-shaped form of CI's G-8c step). MEASURED after wiring: 83 tests, and breaking
// `assertFixtureOnly` so it accepts `production` turns 4 of them red and the command exits non-zero.
//
// ⚠ IT IS NOT A SUBSTITUTE FOR THE CI JOB. `residency-guardrail` in `ci.yml` runs the real
// `pnpm --filter @qmulate/database run seed` command, wired the way a developer wires it, and that is
// the leg that catches a broken `run seed` script or a wrong override variable name. Both layers stay.
//
// The tests come in two layers, on purpose:
//   • UNIT — the exported refusal functions, which is where the decision actually lives;
//   • SUBPROCESS — the real `src/seed.ts` entry point, spawned exactly the way CI spawns it, so
//     the exit code, the stderr shape and the "nothing was even attempted" property are proven on
//     the real program rather than on a function a future refactor could stop calling.

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DATA_CLASSIFICATION_VALUES,
  PERMITTED_FIXTURE_RELATIVE_PATH,
  SeedRefusedError,
  assertFixtureOnly,
  assertPermittedFixturePath,
  requestedFixturePath,
} from '../src/guardrail.js';
import { parseFixture } from '../src/seed/fixture-schema.js';
import {
  PERMITTED_FIXTURE_PATH,
  SEED_ENTRYPOINT,
  SEED_SCRIPT_TARGET_IS_MISSING,
  declaredSeedTargets,
  runSeed,
  type SeedRun,
} from './setup.js';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'qmulate-guardrail-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A fresh deep copy of the fixture JSON, for provenance-tampering tests. */
function rawFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(PERMITTED_FIXTURE_PATH, 'utf8')) as Record<string, unknown>;
}

/** First element of a fixture collection, with a real error instead of an index assertion. */
function firstOf<T>(raw: Record<string, unknown>, key: string): T {
  const list = raw[key];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`the fixture has no ${key} to tamper with — this test is out of date`);
  }
  return list[0] as T;
}

/**
 * The first line of stderr that is genuinely the program's own output.
 *
 * Acceptance B3 matches `/^SEED_REFUSED/` against stderr. Node and the TypeScript loader may emit
 * their own warnings first, which is an environment artefact rather than a property of the seed —
 * so those are filtered, and everything that remains must be the refusal.
 */
function firstProgramLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .filter((line) => !/Warning:/i.test(line) && !line.startsWith('(Use `node'));
  return lines[0] ?? '';
}

/** Everything a refusal must be true of, in one place, so no case forgets one of them. */
function expectRefused(run: SeedRun, messagePattern: RegExp): void {
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/SEED_REFUSED: /);
  expect(run.stderr).toMatch(messagePattern);
  expect(firstProgramLine(run.stderr)).toMatch(/^SEED_REFUSED/);

  // A refusal is a decision, not a crash: no stack frames.
  expect(run.stderr).not.toMatch(/\n\s+at /);

  // The seed prints this banner only AFTER every guardrail has passed and immediately before it
  // imports a database module. Its absence is the evidence that nothing was written — and that
  // no connection was opened to write it with.
  expect(run.stdout).not.toContain('QMULATE fixture seed');
  expect(run.stdout).not.toContain('Seeded (upsert');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LAYER 2a — DATA_CLASSIFICATION  (assertions B1/B2/B3)
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('assertFixtureOnly — the classification gate', () => {
  it('accepts exactly one value', () => {
    expect(assertFixtureOnly('fixture-only')).toBe('fixture-only');
    expect(DATA_CLASSIFICATION_VALUES).toEqual(['fixture-only', 'production']);
  });

  it('refuses production — the whole point of the gate', () => {
    expect(() => assertFixtureOnly('production')).toThrow(SeedRefusedError);
    expect(() => assertFixtureOnly('production')).toThrow(/^SEED_REFUSED: /);
    expect(() => assertFixtureOnly('production')).toThrow(/got "production"/);
  });

  it('refuses an unset value and names it, rather than defaulting to anything', () => {
    // `assertFixtureOnly(raw = process.env.DATA_CLASSIFICATION)` — passing `undefined`
    // explicitly SELECTS the default, so it reads the ambient environment. The only honest way
    // to test "unset" is to actually unset it: the repo-root `.env` is auto-loaded into
    // `process.env` for plain Node entry points, so the variable is normally present here.
    const previous = process.env.DATA_CLASSIFICATION;
    delete process.env.DATA_CLASSIFICATION;
    try {
      expect(() => assertFixtureOnly()).toThrow(SeedRefusedError);
      expect(() => assertFixtureOnly()).toThrow(/got "<unset>"/);
    } finally {
      if (previous === undefined) delete process.env.DATA_CLASSIFICATION;
      else process.env.DATA_CLASSIFICATION = previous;
    }
  });

  it('refuses a near-miss typo and lists the allowed values (B2)', () => {
    expect(() => assertFixtureOnly('fixtureonly')).toThrow(/fixture-only \| production/);
    expect(() => assertFixtureOnly('FIXTURE-ONLY')).toThrow(SeedRefusedError);
    expect(() => assertFixtureOnly(' fixture-only ')).toThrow(SeedRefusedError);
    expect(() => assertFixtureOnly('')).toThrow(SeedRefusedError);
  });

  it('cites NFR-03 so the refusal explains itself to whoever hits it', () => {
    expect(() => assertFixtureOnly('production')).toThrow(/NFR-03/);
  });

  it('reads process.env when given no argument', () => {
    const saved = process.env.DATA_CLASSIFICATION;
    try {
      process.env.DATA_CLASSIFICATION = 'production';
      expect(() => assertFixtureOnly()).toThrow(SeedRefusedError);

      delete process.env.DATA_CLASSIFICATION;
      expect(() => assertFixtureOnly()).toThrow(/<unset>/);

      process.env.DATA_CLASSIFICATION = 'fixture-only';
      expect(assertFixtureOnly()).toBe('fixture-only');
    } finally {
      if (saved === undefined) delete process.env.DATA_CLASSIFICATION;
      else process.env.DATA_CLASSIFICATION = saved;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LAYER 2b — the input path  (assertion B4)
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('assertPermittedFixturePath — one file, and it is a constant', () => {
  it('resolves to the fixture when nothing was requested', () => {
    const resolved = assertPermittedFixturePath(undefined);
    expect(existsSync(resolved)).toBe(true);
    expect(resolved.endsWith(path.join('data', 'fixtures', 'sample-waqf.json'))).toBe(true);
  });

  it('refuses a foreign path that exists', () => {
    const foreign = path.join(scratch, 'other.json');
    writeFileSync(foreign, '{"clients":[]}', 'utf8');
    expect(() => assertPermittedFixturePath(foreign)).toThrow(SeedRefusedError);
    expect(() => assertPermittedFixturePath(foreign)).toThrow(
      /only data\/fixtures\/sample-waqf\.json/,
    );
  });

  it('refuses a byte-identical COPY of the fixture at another path', () => {
    // The check is on identity, not content. A copy is exactly how real data would arrive
    // wearing the fixture's clothes.
    const copy = path.join(scratch, 'sample-waqf.json');
    cpSync(PERMITTED_FIXTURE_PATH, copy);
    expect(() => assertPermittedFixturePath(copy)).toThrow(
      /only data\/fixtures\/sample-waqf\.json/,
    );
  });

  it('refuses a path that does not resolve, rather than falling back to the fixture', () => {
    const missing = path.join(scratch, 'nope', 'missing.json');
    expect(() => assertPermittedFixturePath(missing)).toThrow(/does not resolve/);
  });

  it('refuses a traversal that lands outside the fixture', () => {
    const traversal = path.join(PERMITTED_FIXTURE_PATH, '..', '..', '..', 'package.json');
    expect(() => assertPermittedFixturePath(traversal)).toThrow(SeedRefusedError);
  });

  it('ACCEPTS a symlink to the fixture — realpath comparison, documented behaviour', () => {
    // Real current behaviour, asserted rather than assumed: the comparison is on realpaths, so a
    // symlink and a relative path both resolve to the one permitted file. Substituting a
    // different file behind the symlink would change the realpath and be refused.
    const link = path.join(scratch, 'linked.json');
    symlinkSync(PERMITTED_FIXTURE_PATH, link);
    expect(assertPermittedFixturePath(link)).toBe(assertPermittedFixturePath(undefined));
  });

  it('ACCEPTS a relative path that resolves to the fixture', () => {
    const relative = path.relative(process.cwd(), PERMITTED_FIXTURE_PATH);
    expect(assertPermittedFixturePath(relative)).toBe(assertPermittedFixturePath(undefined));
  });

  it('names the permitted path in its own error text', () => {
    expect(PERMITTED_FIXTURE_RELATIVE_PATH).toBe('data/fixtures/sample-waqf.json');
  });
});

describe('requestedFixturePath — an override is only ever read in order to be refused', () => {
  const emptyEnv = {} as NodeJS.ProcessEnv;

  it('parses --file <path> and --file=<path>', () => {
    expect(requestedFixturePath(['node', 'seed.ts', '--file', '/tmp/x.json'], emptyEnv)).toBe(
      '/tmp/x.json',
    );
    expect(requestedFixturePath(['node', 'seed.ts', '--file=/tmp/y.json'], emptyEnv)).toBe(
      '/tmp/y.json',
    );
  });

  it('reads SEED_FILE', () => {
    expect(requestedFixturePath([], { SEED_FILE: '/tmp/z.json' } as NodeJS.ProcessEnv)).toBe(
      '/tmp/z.json',
    );
    expect(requestedFixturePath([], { SEED_FILE: '' } as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('prefers the flag over the environment variable', () => {
    expect(
      requestedFixturePath(['--file', '/tmp/flag.json'], {
        SEED_FILE: '/tmp/env.json',
      } as NodeJS.ProcessEnv),
    ).toBe('/tmp/flag.json');
  });

  it('returns undefined when nothing was requested', () => {
    expect(requestedFixturePath([], emptyEnv)).toBeUndefined();
  });

  it('IGNORES an override variable it does not recognise', () => {
    // ⚠ THIS TEST'S STATED REASON WAS WRONG BY THE TIME IT WAS READ AGAIN, AND SAYING SO IS THE
    // POINT (S4 residuals, H1). It used to be titled *"IGNORES SEED_INPUT — a real, live mismatch
    // with .env.example and CI"* and claimed that `.env.example` documented the override as
    // `SEED_INPUT` and that CI's G-8b step set `SEED_INPUT`, so the step "reports a G-8 VIOLATION
    // for the wrong reason". RE-MEASURED 2026-08-17: `.env.example:129` reads
    // `# SEED_FILE=data/fixtures/sample-waqf.json` and `.github/workflows/ci.yml:599` sets
    // `SEED_FILE: /tmp/definitely-not-the-fixture.json` — both agree with `src/guardrail.ts`, which
    // reads `SEED_FILE` / `--file`. The mismatch was reconciled and the accompanying `it.todo`
    // asked for work already done, so the todo is REMOVED rather than left to be re-surfaced.
    //
    // What survives is the property, which is worth pinning on its own: an override the guardrail
    // does not recognise is IGNORED, so it can never widen the permitted input. A caller who sets
    // the wrong variable name gets the fixture, never their own file.
    expect(
      requestedFixturePath([], { SEED_INPUT: '/tmp/foreign.json' } as NodeJS.ProcessEnv),
    ).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LAYER 2c — the fixture's own provenance markers  (assertion B5)
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('fixture provenance — nothing is seeded unless it is demonstrably invented', () => {
  it('accepts the real fixture', () => {
    const fixture = parseFixture(rawFixture());
    expect(fixture.clients).toHaveLength(1);
    expect(fixture.waqifs).toHaveLength(3);
    // FIVE since the S4/E3 close-out: `waqf-005`, the intake-state endowment whose مآل clause is
    // unread (owner decision D-C, 2026-08-16). See `EXPECTED_COUNTS.Waqf` in seed.integration.
    expect(fixture.waqfs).toHaveLength(6);
  });

  it('refuses a fixture whose fictional-data marker has been removed', () => {
    const raw = rawFixture();
    raw._readme = 'Notes about this data file.';
    expect(() => parseFixture(raw)).toThrow(/fixture marker missing/);
  });

  it('refuses a fixture whose marker key is gone entirely', () => {
    const raw = rawFixture();
    delete raw._readme;
    expect(() => parseFixture(raw)).toThrow(SeedRefusedError);
  });

  it('refuses an id outside the fixture id grammar', () => {
    const raw = rawFixture();
    firstOf<{ id: string }>(raw, 'clients').id = 'acme-holdings';
    expect(() => parseFixture(raw)).toThrow(/non-fixture identifier/);
  });

  it('refuses an external reference that is not FAKE-prefixed', () => {
    const raw = rawFixture();
    firstOf<{ certificateNumber: string }>(raw, 'waqfs').certificateNumber = '1000001';
    expect(() => parseFixture(raw)).toThrow(/non-fixture identifier/);
  });

  it('refuses an email outside the reserved @example.test domain', () => {
    const raw = rawFixture();
    firstOf<{ familyBoardContact: string }>(raw, 'clients').familyBoardContact =
      'board@a-real-family.com';
    expect(() => parseFixture(raw)).toThrow(/non-fixture identifier/);
  });

  it('refuses a fixture whose shape has drifted', () => {
    const raw = rawFixture();
    delete raw.waqfs;
    expect(() => parseFixture(raw)).toThrow(/fixture drift/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE REAL PROGRAM  (assertions B3/B4/B5 against `src/seed.ts`)
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('the seed program refuses, exits non-zero, and never reaches the database', () => {
  it('has an entry point where the tests think it does', () => {
    expect(existsSync(SEED_ENTRYPOINT)).toBe(true);
  });

  it('B3 · refuses DATA_CLASSIFICATION=production', () => {
    expectRefused(
      runSeed({ DATA_CLASSIFICATION: 'production' }),
      /DATA_CLASSIFICATION must be "fixture-only"/,
    );
  });

  it('B3 · refuses an unset DATA_CLASSIFICATION', () => {
    expectRefused(runSeed({ DATA_CLASSIFICATION: null }), /got "<unset>"/);
  });

  it('B4 · refuses a SEED_FILE that is not the fixture', () => {
    const foreign = path.join(scratch, 'not-the-fixture.json');
    writeFileSync(foreign, '{"clients":[]}', 'utf8');
    expectRefused(
      runSeed({ DATA_CLASSIFICATION: 'fixture-only', SEED_FILE: foreign }),
      /only data\/fixtures\/sample-waqf\.json/,
    );
  });

  it('B4 · refuses a --file that is not the fixture', () => {
    const foreign = path.join(scratch, 'not-the-fixture-either.json');
    writeFileSync(foreign, '{"clients":[]}', 'utf8');
    expectRefused(
      runSeed({ DATA_CLASSIFICATION: 'fixture-only', SEED_FILE: null }, ['--file', foreign]),
      /only data\/fixtures\/sample-waqf\.json/,
    );
  });

  it('B5 · refuses a copy of the fixture with its fictional-data marker stripped', () => {
    // The copy is refused on identity before its content is ever read — which is the stronger of
    // the two guarantees. The content check (B5 proper) is asserted at unit level above, against
    // `parseFixture`, which is the function the seed calls once a path has been accepted.
    const stripped = path.join(scratch, 'sample-waqf.json.stripped');
    const raw = rawFixture();
    delete raw._readme;
    writeFileSync(stripped, JSON.stringify(raw), 'utf8');
    expectRefused(
      runSeed({ DATA_CLASSIFICATION: 'fixture-only', SEED_FILE: stripped }),
      /only data\/fixtures\/sample-waqf\.json/,
    );
  });

  it('every declared seed entry point resolves to a file that exists', () => {
    // These tests spawn `src/seed.ts` directly, so without this assertion they would keep
    // passing while `pnpm --filter @qmulate/database run seed` — the command BOTH the CI
    // integration job and the CI residency-guardrail (G-8) job run — pointed at a missing file.
    const targets = declaredSeedTargets();
    expect(targets.length).toBeGreaterThan(0);
    for (const { source, command, target } of targets) {
      expect(existsSync(target), `${source} runs \`${command}\` -> missing ${target}`).toBe(true);
    }
  });

  it('G-8 layer 3 EXISTS and is the MIRROR of this file — the two guards never both admit (S12-4)', async () => {
    // Replaces the Sprint-1 `it.todo`. The seed admits ONLY fixture-only; the importer admits ONLY
    // production+ksa. For every value of the pair, at most one program runs — asserted here at the
    // function level (the importer's own suite drives its real program).
    const { assertResidentProductionTarget, ImportRefusedError } =
      await import('../src/import-guardrail.js');
    for (const classification of [...DATA_CLASSIFICATION_VALUES, undefined]) {
      for (const residency of ['ksa', 'non-ksa', undefined]) {
        const seedAdmits = (() => {
          try {
            assertFixtureOnly(classification);
            return true;
          } catch (error) {
            expect(error).toBeInstanceOf(SeedRefusedError);
            return false;
          }
        })();
        const importerAdmits = (() => {
          try {
            assertResidentProductionTarget({
              DATA_CLASSIFICATION: classification,
              DATA_RESIDENCY: residency,
            });
            return true;
          } catch (error) {
            expect(error).toBeInstanceOf(ImportRefusedError);
            return false;
          }
        })();
        expect(seedAdmits && importerAdmits, `${String(classification)}/${String(residency)}`).toBe(
          false,
        );
        if (classification === 'production' && residency === 'ksa')
          expect(importerAdmits).toBe(true);
        if (classification === 'fixture-only') expect(seedAdmits).toBe(true);
      }
    }
  });
});

if (SEED_SCRIPT_TARGET_IS_MISSING) {
  // Belt and braces alongside the assertion above: a broken `pnpm run seed` silently disables the
  // CI integration job AND the CI residency-guardrail (G-8) job, so it must be impossible to miss.
  console.warn(
    '[qmulate] a declared seed entry point in packages/database/package.json points at a file ' +
      'that does not exist — `pnpm --filter @qmulate/database run seed` is broken. These tests ' +
      'spawn src/seed.ts directly and would otherwise keep passing. See declaredSeedTargets().',
  );
}
