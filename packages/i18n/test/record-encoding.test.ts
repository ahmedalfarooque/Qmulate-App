/**
 * ⊕ S11-2 — THE RECORD IS UTF-8, AND ITS ARABIC DOES NOT SHRINK.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────
 * On 2026-09-02 a `perl -0pi -e 'use utf8; …'` one-liner — a file read as BYTES, a replacement carrying
 * one wide character, the whole string upgraded and re-encoded — turned EVERY non-ASCII character in
 * `docs/product/prd/BUILD-PLAN.md` (559 Arabic-block characters, the owner's own `رخضة` among them) and in
 * `packages/database/prisma/schema.prisma` (231) into `Ã`+C1 sequences, and left two lone Latin-1 bytes in
 * a vault note. Three commits carried it before it was noticed — by an orchestrator comparing byte growth
 * against line growth, not by anyone reading the file. The same tool had already left 42 double-encoded
 * em dashes in the fixture's `_note`s and 15 in §09's rule rows a stage earlier, and those were PUSHED.
 *
 * The rule this protects (CLAUDE.md: the owner's characters are carried un-normalised) has now failed by
 * two mechanisms: S10's was normalisation by JUDGMENT (a person deciding `ض` should be `ص`); this was
 * destruction by TOOLING, with no decision anywhere. A visual check passes mojibake — it is legible-looking
 * garbage — and the obvious grep for `Ã`/`Â` returns ZERO because the second byte of each pair is an
 * INVISIBLE C1 control (U+0080–U+009F). So the control is two COUNTS, per file:
 *   · the file decodes as UTF-8 with no replacement character (no lone byte anywhere);
 *   · it contains NO C1 control character (the double-encoding signature);
 *   · its Arabic-block count is at or above a PINNED FLOOR — a floor is raised deliberately when Arabic is
 *     added, never lowered, because a record whose non-ASCII content silently halves is exactly the change
 *     no diff review catches.
 *
 * ⚠ The floors are MEASURED (2026-09-02, after the repair), not derived. If one fails: do not lower it —
 * find the tool that rewrote the file, repair by EXTRACTION from the last clean commit, and then raise the
 * floor only if Arabic was genuinely added.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Arabic-block floors, MEASURED 2026-09-02 after the repair. Raise deliberately; never lower. */
const ARABIC_FLOORS: Readonly<Record<string, number>> = {
  'docs/product/prd/BUILD-PLAN.md': 559,
  'docs/product/prd/S4-owner-decision-memo.md': 522,
  'docs/product/prd/09-compliance-deadline-engine-spec.md': 15,
  'docs/domain/glossary.md': 907,
  'packages/database/prisma/schema.prisma': 231,
  'packages/database/src/seed/map.ts': 1106,
  'packages/database/src/seed/fixture-schema.ts': 39,
  // Re-pinned 2026-09-08 (S12-2/S12-3 added the reserved-matter chain and onboarding-gate copy): measured 26023.
  'packages/i18n/messages/ar.json': 25500,
  // The fixture carries NO Arabic by design (invented Latin data); it is here for the C1 check — its
  // `_note`s carried 42 double-encoded em dashes for a stage.
  'data/fixtures/sample-waqf.json': 0,
};

const ARABIC_BLOCK = /[\u0600-\u06ff]/g;
const C1_CONTROLS = /[\u0080-\u009f]/g;

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

describe('the record is UTF-8 and its Arabic does not shrink (S11-2 control)', () => {
  for (const [relative, floor] of Object.entries(ARABIC_FLOORS)) {
    describe(relative, () => {
      const text = readFileSync(path.join(REPO_ROOT, relative), 'utf8');

      it('decodes as UTF-8 with no replacement character — no lone byte anywhere', () => {
        expect(text.includes('�'), 'U+FFFD present: a byte that is not UTF-8').toBe(false);
      });

      it('carries NO C1 control character (U+0080–U+009F) — the double-encoding signature', () => {
        expect(
          countMatches(text, C1_CONTROLS),
          'C1 controls present: the file was read as Latin-1 and re-encoded (the `perl -pi … use utf8` ' +
            'shape). HOW TO REPAIR: write the file back from the last clean commit (`git show <rev>:<path>`), ' +
            're-apply the intended edits with a SCRIPT that opens BOTH handles with explicit UTF-8 layers, ' +
            'and NEVER retype anything non-ASCII — the Arabic you need is already in that blob. Then re-run ' +
            'this file. Do not paper over it with a per-character fix by eye: mojibake is legible-looking garbage.',
        ).toBe(0);
      });

      it(`has at least ${String(floor)} Arabic-block characters — the pinned floor`, () => {
        expect(
          countMatches(text, ARABIC_BLOCK),
          'Arabic count fell below its floor. Do not lower the floor: something rewrote the file. HOW TO ' +
            'REPAIR: extract the last clean version from git, re-apply the intended edits through a script ' +
            'with explicit UTF-8 layers on both handles, never retype — then, and only if Arabic was ' +
            'genuinely added, raise the floor in the same change.',
        ).toBeGreaterThanOrEqual(floor);
      });
    });
  }

  it('the floors themselves are not stale by more than a stage — a file well ABOVE its floor is re-pinned deliberately', () => {
    // Informational drift guard: if a file has grown by more than 25% over its floor, the floor is
    // out of date and should be raised in the same change that added the Arabic.
    const stale = Object.entries(ARABIC_FLOORS)
      .filter(([, floor]) => floor > 0)
      .map(([relative, floor]) => {
        const count = countMatches(
          readFileSync(path.join(REPO_ROOT, relative), 'utf8'),
          ARABIC_BLOCK,
        );
        return { relative, floor, count };
      })
      .filter(({ floor, count }) => count > floor * 1.25);
    expect(stale, `raise these floors deliberately: ${JSON.stringify(stale)}`).toStrictEqual([]);
  });
});
