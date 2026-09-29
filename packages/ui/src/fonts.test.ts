/**
 * ⊕ S11 (2026-09-02) — the typeface contract is WIRED, not merely described.
 *
 * Until S11, `tokens.css` led `--font-sans` with `'Outfit Variable'` while `apps/web` re-pointed the
 * token to a `next/font/local` hashed family bound to a 400/700-only TTF — so the variable name in the
 * stack was a dead word, one family name resolved to two faces, and Display 300 / H3 500 / H1 600 /
 * mono-label 500 rendered synthetic or snapped. Nothing noticed, because nothing pinned the wiring.
 *
 * This file pins the three joints where that can silently reopen:
 *   1. the lead family of each `FONT_STACKS` entry is the family the @fontsource package defines;
 *   2. every `FONTSOURCE_PACKAGES` entry is a real dependency of `apps/web` (the CSS consumer);
 *   3. `apps/web`'s stylesheet imports those packages and does NOT re-point `--font-sans` /
 *      `--font-mono` to a `--qm-font-*` variable, and its root layout binds no `next/font` face.
 *
 * What it cannot do is judge a rendered glyph — that is a person's eye on the first screen.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FONTSOURCE_PACKAGES, FONT_STACKS, MISSING_FONT_WEIGHTS } from './fonts.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WEB = path.join(REPO_ROOT, 'apps', 'web');

function leadFamily(stack: string): string {
  const first = stack.split(',')[0] ?? '';
  return first.trim().replace(/^'|'$/g, '');
}

describe('the typeface contract is wired (S11)', () => {
  it('each FONT_STACKS lead family is the @fontsource family name', () => {
    expect(leadFamily(FONT_STACKS.sans)).toBe('Outfit Variable');
    expect(leadFamily(FONT_STACKS.mono)).toBe('Geist Mono Variable');
    expect(leadFamily(FONT_STACKS.arabic)).toBe('IBM Plex Sans Arabic');
  });

  it('every FONTSOURCE_PACKAGES entry is a dependency of apps/web, pinned', () => {
    const manifest = JSON.parse(readFileSync(path.join(WEB, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = manifest.dependencies ?? {};
    for (const entry of FONTSOURCE_PACKAGES) {
      expect(deps[entry.pkg], `${entry.pkg} is not a dependency of apps/web`).toBeDefined();
    }
    // The variable IBM Plex Sans Arabic does not exist upstream; the record must not start naming it.
    expect(FONTSOURCE_PACKAGES.map((e) => e.pkg)).not.toContain(
      '@fontsource-variable/ibm-plex-sans-arabic',
    );
  });

  it('globals.css imports the three faces and never re-points the tokens to a next/font variable', () => {
    const css = readFileSync(path.join(WEB, 'src', 'app', 'globals.css'), 'utf8');
    expect(css).toContain("@import '@fontsource-variable/outfit/index.css';");
    expect(css).toContain("@import '@fontsource-variable/geist-mono/index.css';");
    for (const weight of [400, 500, 600, 700]) {
      expect(css).toContain(`@import '@fontsource/ibm-plex-sans-arabic/${String(weight)}.css';`);
    }
    // The dead-word shape: a token re-pointed to a hashed next/font family.
    expect(css).not.toMatch(/--font-sans:\s*var\(--qm-font-/);
    expect(css).not.toMatch(/--font-mono:\s*var\(--qm-font-/);
  });

  it('the root layout binds no next/font face — one family per name', () => {
    const layout = readFileSync(path.join(WEB, 'src', 'app', '[locale]', 'layout.tsx'), 'utf8');
    expect(layout).not.toContain("from 'next/font/local'");
    expect(layout).not.toContain('localFont(');
    expect(layout).not.toMatch(/className=\{`\$\{outfit\.variable\}/);
  });

  it('MISSING_FONT_WEIGHTS is history, and every family it names is served by a listed package', () => {
    const families = new Set(MISSING_FONT_WEIGHTS.map((row) => row.family));
    expect([...families].sort()).toStrictEqual(['Geist Mono', 'IBM Plex Sans Arabic', 'Outfit']);
    const covered = FONTSOURCE_PACKAGES.map((e) => e.covers).join(' ');
    for (const family of families) expect(covered).toContain(family);
  });
});
