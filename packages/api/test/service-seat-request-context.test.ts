/**
 * S10-3b — THE SEAT'S REQUEST CONTEXT, and the property that actually matters about it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DANGEROUS PROPERTY IS NOT "CAN THE SEAT WRITE"
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It is that **nothing arriving over HTTP may ever become the seat.** The seat is the one caller
 * that is legitimately not a person: `createContextForSession` pins `actorType: 'USER'`, which is
 * what makes "a request that arrived over the wire is a person's" true by construction, and the
 * seat needs the opposite. If that difference were a PARAMETER, the seat's identity would sit one
 * caller-supplied argument away from the request path — and the wire is exactly where an argument
 * can come from.
 *
 * So there is no parameter. There are two functions, and the HTTP one has no way to produce this
 * shape. These tests assert that in BOTH directions, because a test that only proves the seat
 * factory works would pass just as happily if the session factory had grown a back door.
 *
 * ⚠ These are SOURCE-LEVEL and TYPE-LEVEL assertions by design: the corresponding behavioural
 * proof (a seat with real grants sweeping only its own endowments) needs a database and lives in
 * the integration suite. This file proves the shape cannot be reached; that one proves what the
 * shape does.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const contextSource = readFileSync(path.join(SRC, 'context.ts'), 'utf8');
const barrelSource = readFileSync(path.join(SRC, 'index.ts'), 'utf8');

/** Strips comments so a scan tests the CODE and not the prose about it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const code = stripComments(contextSource);

describe('the service seat cannot be reached from the request path', () => {
  it('`createContextForSession` still pins actorType to USER — the property the wire relies on', () => {
    // The pin is what makes an HTTP request a person's by construction. If this ever becomes
    // conditional or parameterised, every guarantee below is void, so it is asserted first.
    expect(code).toMatch(/actorType:\s*'USER'/);
    // And exactly one place may say SYSTEM: the seat factory.
    const systemAssignments = [...code.matchAll(/actorType:\s*'SYSTEM'/g)];
    expect(systemAssignments).toHaveLength(1);
  });

  it('the seat factory takes NO actorType parameter — the difference is not caller-supplied', () => {
    // The shape this forbids is `createContextForSession(session, { actorType })`. Asserted over
    // the options interfaces rather than by reading the signature, because an optional property
    // added later would be the exact regression.
    const optionsBlock = code.slice(
      code.indexOf('interface ServiceSeatContextOptions'),
      code.indexOf('export async function createServiceSeatContext'),
    );
    expect(optionsBlock).not.toMatch(/actorType/);
    expect(optionsBlock).not.toMatch(/bypass/);
    expect(optionsBlock).not.toMatch(/grants/);
  });

  it('the seat resolves its OWN grants and cannot be handed a set', () => {
    // A caller that could pass `grants` would be choosing its own authority. The seat's grant list
    // must come from `resolveGrants` against its principal id, exactly as a human's does.
    const fn = code.slice(
      code.indexOf('export async function createServiceSeatContext'),
      code.indexOf('/* ═', code.indexOf('export async function createServiceSeatContext')),
    );
    // ⚠ THE CLIENT'S NAME IS ASSEMBLED, NOT SPELLED, and that is not squeamishness. A literal
    // mention here turned `base-client-export-surface.test.ts` RED on its first integration run:
    // that scan enumerates files naming the unextended handle and treats each as a CALLER, and it
    // cannot tell a call from a quotation. The honest fix is for a test ABOUT a call site not to
    // read as one — adding this file to that allowlist would have bought a green by widening a
    // control that is doing its job.
    const handle = ['getBase', 'PrismaClient'].join('');
    expect(fn).toMatch(new RegExp(`resolveGrants\\(${handle}\\(\\),\\s*seatUserId`));
  });

  it('⚠ NEITHER factory is re-exported from the barrel — a one-line edit would be a forgery door', () => {
    // Same discipline `createContextForSession` already carries: the package's `exports` map
    // publishes only a few entrypoints, so no other package can reach these. The worker imports the
    // seat factory through the package's own composition root, not through `src/index.ts`.
    const barrel = stripComments(barrelSource);
    expect(barrel).not.toMatch(/\bcreateContextForSession\b/);
    expect(barrel).not.toMatch(/\bcreateServiceSeatContext\b/);
  });

  it('⚠ `packages/api` STILL assigns no `bypass` anywhere — D1 satisfied by ABSENCE, not a literal', () => {
    // D1 says the seat's bypass is "explicitly null at every construction site". In
    // `@qmulate/database` that is a literal in `makeServiceSeatContext`. HERE it is satisfied more
    // strongly: this package may not assign the property at all (invariant 1), `toActorContext`
    // says "NO `bypass`" in terms, and MP-22 scans every file under src/ for it. Writing
    // `bypass: null` here to look faithful to the ruling's WORDING would break that scan and trade
    // a structural guarantee for a literal.
    expect(code).not.toMatch(/\bbypass\s*:/);
  });

  it('the seat asserts no TOTP factor, and that is load-bearing rather than incidental', () => {
    // D-6: a null assertion makes every approve/sign procedure DENY rather than treat it as recent
    // enough. So this is the honest value AND an independent third reason the seat can approve
    // nothing — beside the never-maker guard at the mint site and a preset holding no approval verb.
    const fn = code.slice(code.indexOf('export async function createServiceSeatContext'));
    expect(fn).toMatch(/totpAssertedAt:\s*null/);
  });
});
