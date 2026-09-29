// S10 — the pins that keep `better-auth` OUT of this package, and the seed credential honest.
//
// Context (`docs/product/prd/S10-lockfile-blocker.md`): with `better-auth` in this package's
// manifest, `packages/database` was the one workspace importer holding BOTH `zod@^3` and
// `better-auth`, and pnpm mis-routed `better-call@1.3.7`'s `zod@^4` peer to the importer's zod 3
// on every fresh resolve — so ANY `pnpm add`, anywhere in the repo, flipped every
// `@better-auth/*` package's identity and broke `@qmulate/auth`'s typecheck. CI never saw it
// because `--frozen-lockfile` never re-resolves. The fix (S10) removed the dependency: the seed's
// one runtime need became the precomputed constant in `src/seed/credentials.ts`.
//
// These tests refuse the reintroduction BY NAME, in the package whose manifest and source they
// read — so turbo's hash inputs (this package's own files) cover everything asserted here, and a
// change that would re-open the hazard cannot be replayed from cache as a pass.
//
// The cryptographic half of the guarantee — that the pinned hash still verifies against
// `SEED_PASSWORD` under better-auth's own `verifyPassword` — deliberately does NOT live here:
// this package can no longer resolve `better-auth`, which is the point. It lives in
// `packages/auth/test/seed-credential-parity.test.ts`, the package that owns better-auth.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SEED_PASSWORD, SEED_PASSWORD_HASH } from '../src/seed/credentials.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('better-auth stays out of @qmulate/database (S10 lockfile blocker)', () => {
  it('the manifest declares better-auth in NO dependency block', () => {
    const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const block of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ] as const) {
      expect(
        Object.keys(pkg[block] ?? {}).filter((name) => name.includes('better-auth')),
        `packages/database/package.json ${block} must not reintroduce better-auth: that entry ` +
          `made this package the one importer holding both zod@^3 and better-auth, which ` +
          `mis-routes better-call's zod peer on every fresh resolve and breaks @qmulate/auth ` +
          `on any \`pnpm add\` (docs/product/prd/S10-lockfile-blocker.md). The seed's hash is ` +
          `precomputed in src/seed/credentials.ts; a new runtime need for better-auth belongs ` +
          `in @qmulate/auth, never here.`,
      ).toEqual([]);
    }
  });

  it('no source file imports better-auth', () => {
    // `from 'better-auth…'`, `import('better-auth…')`, `require('better-auth…')`, and the bare
    // side-effect form `import 'better-auth…'` — the four
    // resolvable forms. COMMENTS ARE STRIPPED BEFORE MATCHING, deliberately: the ban is on code
    // that would resolve, not on documentation — `src/seed/credentials.ts`'s header must quote
    // the regeneration command verbatim (a re-runnable command was a condition of the S10
    // approval), and this pin proved it catches that text by failing on its own first run.
    const importPattern = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]better-auth/;
    const codeOnly = (source: string): string =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
    const offenders = sourceFilesUnder(path.join(PACKAGE_ROOT, 'src')).filter((file) =>
      importPattern.test(codeOnly(readFileSync(file, 'utf8'))),
    );
    expect(
      offenders.map((file) => path.relative(PACKAGE_ROOT, file)),
      'an import of better-auth inside packages/database/src would fail resolution at runtime ' +
        '(the dependency was removed in S10 — see docs/product/prd/S10-lockfile-blocker.md) ' +
        'and, if backed by a manifest entry, would re-open the peer-routing hazard.',
    ).toEqual([]);
  });

  it('the pinned credential constants keep the shape the sign-in path verifies', () => {
    // Format only — this package cannot (and must not) resolve better-auth to verify the scrypt
    // round-trip. The round-trip is proven in packages/auth/test/seed-credential-parity.test.ts.
    expect(SEED_PASSWORD).toBe('fixture-only-not-a-secret-9271');
    expect(SEED_PASSWORD_HASH).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });
});
