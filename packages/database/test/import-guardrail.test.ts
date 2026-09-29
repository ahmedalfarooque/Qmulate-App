// QMULATE — RELEASE GATE G-8 / scenario V-12, LAYER 3: the first-client importer HARD-FAILS (NFR-03 · BR-1106).
//
// NO DATABASE — that is the property under test, as for the seed: the importer must refuse BEFORE it
// imports a database module, so a refused run cannot have written a row or opened a connection.
// `src/import.ts` makes `assertResidentProductionTarget()` the first statement of `main()` and
// imports the database dynamically after it.
//
// This file REPLACES the `it.todo` that `residency-guardrail.test.ts` carried since Sprint 1 ("G-8 IS
// ONLY PARTIALLY CLOSED … layer 3 lands in E11/S12"). It is part of `pnpm test:guardrail`; CI's
// `residency-guardrail` job additionally runs the real command (G-8d/e/f).
//
// Two layers, on purpose:
//   • UNIT — the exported refusal functions (the decision lives there);
//   • SUBPROCESS — the real `src/import.ts`, spawned the way CI spawns it: exit code, stderr shape,
//     and the "nothing was even attempted" property, proven on the program.
//
// ⚠ The HAPPY PATH is not here and cannot be: it needs production+ksa AND a database, and this
// package's test cluster is fixture-only by construction. `import-apply.integration.test.ts` drives
// `applyImport()` — the seam below the guard — on the test cluster with an invented source.

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { PERMITTED_FIXTURE_RELATIVE_PATH } from '../src/guardrail.js';
import {
  FICTIONAL_MARKERS,
  ImportRefusedError,
  assertImportSourcePath,
  assertNoFictionalMarker,
  assertResidentProductionTarget,
  isDryRun,
  requestedImportSource,
} from '../src/import-guardrail.js';
import { FIXTURE_MARKER } from '../src/seed/fixture-schema.js';
import { PERMITTED_FIXTURE_PATH, runImport, type SeedRun } from './setup.js';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'qmulate-import-guardrail-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A minimal, marker-free, syntactically valid source — what a real intake file looks like to the gate. */
function writeCleanSource(name = 'intake.json'): string {
  const file = path.join(scratch, name);
  writeFileSync(file, JSON.stringify({ clients: [{ id: 'client-001', name: 'A' }] }), 'utf8');
  return file;
}

function firstProgramLine(stderr: string): string {
  return (
    stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => line !== '' && !/Warning:/i.test(line) && !line.startsWith('(Use `node'),
      )[0] ?? ''
  );
}

/** Everything a refusal must be true of, in one place. */
function expectRefused(run: SeedRun, messagePattern: RegExp): void {
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/IMPORT_REFUSED: /);
  expect(run.stderr).toMatch(messagePattern);
  expect(firstProgramLine(run.stderr)).toMatch(/^IMPORT_REFUSED/);
  expect(run.stderr).not.toMatch(/\n\s+at /);
  expect(run.stdout).not.toContain('QMULATE first-client import');
  expect(run.stdout).not.toContain('IMPORT_APPLIED');
}

describe('assertResidentProductionTarget — the target gate (G-8 layer 3)', () => {
  it('admits exactly production + ksa', () => {
    expect(
      assertResidentProductionTarget({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa' }),
    ).toEqual({ classification: 'production', residency: 'ksa' });
  });

  it('refuses fixture-only — the whole point of the gate (G-8d)', () => {
    const attempt = () =>
      assertResidentProductionTarget({
        DATA_CLASSIFICATION: 'fixture-only',
        DATA_RESIDENCY: 'ksa',
      });
    expect(attempt).toThrow(ImportRefusedError);
    expect(attempt).toThrow(/^IMPORT_REFUSED: /);
    expect(attempt).toThrow(/got "fixture-only"/);
    expect(attempt).toThrow(/NFR-03/);
  });

  it('refuses production without a residency, naming the variable (G-8e)', () => {
    const attempt = () => assertResidentProductionTarget({ DATA_CLASSIFICATION: 'production' });
    expect(attempt).toThrow(ImportRefusedError);
    expect(attempt).toThrow(/DATA_RESIDENCY must be "ksa" \(got "<unset>"\)/);
  });

  it('refuses production on a non-KSA host (G-8e)', () => {
    const attempt = () =>
      assertResidentProductionTarget({
        DATA_CLASSIFICATION: 'production',
        DATA_RESIDENCY: 'non-ksa',
      });
    expect(attempt).toThrow(/got "non-ksa"/);
    expect(attempt).toThrow(/non-KSA host is exactly the posture NFR-03 forbids/);
  });

  it('refuses an unset classification and every near-miss, never defaulting', () => {
    for (const value of [undefined, '', 'prod', 'PRODUCTION', ' production ']) {
      expect(() =>
        assertResidentProductionTarget({ DATA_CLASSIFICATION: value, DATA_RESIDENCY: 'ksa' }),
      ).toThrow(ImportRefusedError);
    }
    for (const value of ['KSA', 'saudi', ' ksa ']) {
      expect(() =>
        assertResidentProductionTarget({
          DATA_CLASSIFICATION: 'production',
          DATA_RESIDENCY: value,
        }),
      ).toThrow(ImportRefusedError);
    }
  });
});

describe('the source gates', () => {
  it('requestedImportSource reads --source, --source=, then IMPORT_SOURCE, else undefined', () => {
    expect(requestedImportSource(['node', 'x', '--source', '/a.json'], {})).toBe('/a.json');
    expect(requestedImportSource(['node', 'x', '--source=/b.json'], {})).toBe('/b.json');
    expect(requestedImportSource(['node', 'x'], { IMPORT_SOURCE: '/c.json' })).toBe('/c.json');
    expect(requestedImportSource(['node', 'x'], { IMPORT_SOURCE: '' })).toBeUndefined();
    expect(isDryRun(['node', 'x', '--dry-run'])).toBe(true);
    expect(isDryRun(['node', 'x'])).toBe(false);
  });

  it('refuses no source, and a source that does not exist', () => {
    expect(() => assertImportSourcePath(undefined)).toThrow(/no source named/);
    expect(() => assertImportSourcePath('   ')).toThrow(/no source named/);
    expect(() => assertImportSourcePath(path.join(scratch, 'missing.json'))).toThrow(
      /does not exist/,
    );
  });

  it('refuses THE FIXTURE itself, by realpath — importing it is the seed’s job (G-8f)', () => {
    const attempt = () => assertImportSourcePath(PERMITTED_FIXTURE_PATH);
    expect(attempt).toThrow(ImportRefusedError);
    expect(attempt).toThrow(new RegExp(PERMITTED_FIXTURE_RELATIVE_PATH.replace(/\//g, '\\/')));
    expect(attempt).toThrow(/mirror images/);
  });

  it('accepts any other existing file, returning its realpath', () => {
    const file = writeCleanSource('clean.json');
    // realpath, not the path as written: macOS's tmpdir is a symlink (/var → /private/var).
    expect(assertImportSourcePath(file)).toBe(realpathSync(file));
  });

  it('refuses a source carrying ANY of the fixture’s fictional markers — a renamed fixture copy is caught on content', () => {
    expect(FICTIONAL_MARKERS).toContain(FIXTURE_MARKER); // kept in step with fixture-schema.ts
    const fixtureText = readFileSync(PERMITTED_FIXTURE_PATH, 'utf8');
    expect(() => assertNoFictionalMarker(fixtureText)).toThrow(ImportRefusedError);
    for (const marker of FICTIONAL_MARKERS) {
      expect(() => assertNoFictionalMarker(`{"nameAr":"x ${marker} y"}`)).toThrow(
        /fictional-data marker/,
      );
    }
    expect(() =>
      assertNoFictionalMarker('{"clients":[{"id":"c1","nameAr":"أسرة"}]}'),
    ).not.toThrow();
  });
});

describe('the real program, spawned as CI spawns it', () => {
  const clean = () => writeCleanSource('subprocess-clean.json');

  it('G-8d · REFUSES under fixture-only, before any database module — first line of stderr, no stack', () => {
    expectRefused(
      runImport({ DATA_CLASSIFICATION: 'fixture-only', DATA_RESIDENCY: 'ksa' }, [
        '--source',
        clean(),
        '--dry-run',
      ]),
      /DATA_CLASSIFICATION must be "production" \(got "fixture-only"\)/,
    );
  });

  it('G-8e · REFUSES production without DATA_RESIDENCY=ksa (absent, and non-ksa)', () => {
    expectRefused(
      runImport({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: null }, [
        '--source',
        clean(),
        '--dry-run',
      ]),
      /DATA_RESIDENCY must be "ksa" \(got "<unset>"\)/,
    );
    expectRefused(
      runImport({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'non-ksa' }, [
        '--source',
        clean(),
        '--dry-run',
      ]),
      /got "non-ksa"/,
    );
  });

  it('G-8f · REFUSES the fixture as a source even on production+ksa', () => {
    expectRefused(
      runImport({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa' }, [
        '--source',
        PERMITTED_FIXTURE_PATH,
        '--dry-run',
      ]),
      /the source IS the fixture/,
    );
  });

  it('G-8f′ · REFUSES a renamed copy of the fixture on production+ksa — caught on its marker', () => {
    const copy = path.join(scratch, 'renamed-fixture.json');
    writeFileSync(copy, readFileSync(PERMITTED_FIXTURE_PATH, 'utf8'), 'utf8');
    expectRefused(
      runImport({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa' }, [
        '--source',
        copy,
        '--dry-run',
      ]),
      /fictional-data marker/,
    );
  });

  it('refuses when no source is named, whatever the target', () => {
    expectRefused(
      runImport({ DATA_CLASSIFICATION: 'production', DATA_RESIDENCY: 'ksa', IMPORT_SOURCE: null }, [
        '--dry-run',
      ]),
      /no source named/,
    );
  });
});
