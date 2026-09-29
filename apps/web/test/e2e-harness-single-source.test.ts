/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THE CROSS-LOCALE SEAT HANDSHAKE HAS EXACTLY ONE DEFINITION
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **S11 — the extraction S11-2 declared owed at the second copy and item 2c escalated at the third.**
 *
 * ── WHY A PIN AND NOT JUST A REFACTOR ──────────────────────────────────────────────────────────
 * Collapsing three copies into one helper is worth nothing if a fourth appears next sprint: the
 * declared debt was never the duplication itself but the DRIFT it invites — *"both copies must redden
 * together on a parameter change"*. Measured before the extraction, the copies HAD already drifted:
 * `endowment-journey`'s `ensureSeatSession` was 3,840 B against the other two at 2,525 B, and its
 * `seatedJourney` 2,367 B against 1,266 B. The divergence was **documentation and error wording only
 * — ZERO non-comment differing lines** — so the merge was safe, but the next divergence might not be,
 * and nothing would have reported it.
 *
 * ── WHY THIS IS A LEGITIMATE SOURCE ASSERTION ──────────────────────────────────────────────────
 * This project's standing lesson is that *a source-shape assertion is not a test* — a real S2 test
 * asserted strings appeared within 400 characters of a call site while the guard it described was
 * bypassable. That warning is about using source shape as a PROXY for behaviour. Here the source
 * shape **is** the claim: "the handshake is defined once and imported everywhere else" is a fact
 * about the file layout, and there is nothing else it could be measured against.
 *
 * ⚠ This pin was written BEFORE the extraction and watched fail on three definitions, so it is
 * authored against the shape it had to change rather than the shape it created.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const E2E_DIR = fileURLToPath(new URL('../e2e', import.meta.url));
const SUPPORT = 'support/seat-handshake';

const specs = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith('.spec.ts'))
  .sort();

const read = (name: string) => readFileSync(`${E2E_DIR}/${name}`, 'utf8');

/** The two functions that ARE the cross-locale handshake. `distribution.spec.ts` defines a
 *  different, single-locale `ensureSeatSession(browser, seat, testInfo)` — a separate helper with a
 *  separate signature, deliberately out of this pin's scope and named here so its exclusion is a
 *  decision rather than an oversight. */
const HANDSHAKE_DEFINITIONS = [
  /async function seatedJourney\s*\(/,
  /async function ensureSeatSession\s*\(\s*$/m,
];

describe('the cross-locale seat handshake is defined once', () => {
  it('finds the spec files at all — an empty glob would make every check vacuous', () => {
    expect(specs.length).toBeGreaterThanOrEqual(8);
  });

  it.each(
    HANDSHAKE_DEFINITIONS.map(
      (re, i) => [i === 0 ? 'seatedJourney' : 'ensureSeatSession', re] as const,
    ),
  )('%s is defined in NO spec file — it lives in the shared support module', (name, pattern) => {
    const offenders = specs.filter((spec) => pattern.test(read(spec)));
    expect(
      offenders,
      `${name} is defined inside ${offenders.join(', ')} — the handshake has been copied again. ` +
        `It belongs in e2e/${SUPPORT}.ts, imported by every journey that needs it.`,
    ).toEqual([]);
  });

  it('every spec that USES the handshake imports it from the one module', () => {
    const users = specs.filter((spec) => /\bseatedJourney\s*\(/.test(read(spec)));
    // A floor: the three journey specs. If this drops, a journey stopped using the shared seat
    // handshake and nobody said so.
    expect(users.length).toBeGreaterThanOrEqual(3);
    // ⚠ THE EXACT QUOTED SPECIFIER, not a substring. A mutation caught this: a broken path of
    // `'./support/seat-handshakeX'` CONTAINS the substring `support/seat-handshake`, so an
    // `includes()` check passed while the import pointed nowhere. A comment mentioning the path
    // would have satisfied it too. The claim is "this spec imports FROM that module", so the
    // assertion has to be the import statement.
    const importsIt = new RegExp(String.raw`from '\./${SUPPORT}'`);
    const notImporting = users.filter((spec) => !importsIt.test(read(spec)));
    expect(notImporting, `these use seatedJourney without importing the shared module`).toEqual([]);
  });
});
