/**
 * S10-3a — THE DECLARED SERVICE SEAT'S CONTEXT, and the control the D1 ruling says is owed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS BEING PROVEN, AND WHY IT NEEDS PROVING AT ALL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Owner ruling D1 (2026-08-28, memo S10 addendum first batch): the seat is `actorType: 'SYSTEM'`
 * with the scoping `bypass` **explicitly `null` at every construction site**, never left to the
 * factory default.
 *
 * The memo records the known cost of that form in terms: unlike a `SERVICE` seat — for which a
 * bypass is refused BY TYPE — a `SYSTEM` seat remains ELIGIBLE for one, and `makeSystemContext`'s
 * default is on the UNSAFE side. The guarantee would otherwise be a convention every future
 * construction site must keep, where forgetting is SILENT and the audit events look identical
 * either way.
 *
 * `makeServiceSeatContext` is the control: it takes no `bypass` and no `actorType`, so the unsafe
 * value is unreachable rather than merely discouraged. These tests prove that claim in the only way
 * worth anything — by trying to break it, including through the shapes that defeated Sprint 1's
 * `makeSystemContext` (T-25: an `...overrides` spread applied AFTER the safe literals).
 */

import { describe, expect, it } from 'vitest';

import {
  isBypassed,
  makeServiceSeatContext,
  makeSystemContext,
  type RequestContext,
} from '../src/index.js';

const SEAT = 'user-service-deadline-evaluator';

describe('makeServiceSeatContext — the bypass cannot be turned on', () => {
  it('produces a SYSTEM context that is NOT bypassed', () => {
    const ctx = makeServiceSeatContext({
      actorId: SEAT,
      authorizedWaqfIds: ['waqf-001'],
      requestId: 'sweep-1',
    });

    expect(ctx.actorType).toBe('SYSTEM');
    expect(ctx.bypass).toBeNull();
    // THE ASSERTION THE WHOLE RULING RESTS ON. `isBypassed` is the single predicate standing
    // between a context and an unfiltered query, and it is what `scopeFilter()` consults at step 2
    // before beneficiary isolation, grants or AML are reached.
    expect(isBypassed(ctx)).toBe(false);
  });

  it('⚠ CONTRAST — the general factory defaults to the UNSAFE value, which is why this exists', () => {
    // Not a criticism of `makeSystemContext`: its default is correct for the seed and the test
    // harnesses, which genuinely want the bypass. It is the reason the seat needs its own door.
    const general = makeSystemContext({ actorId: SEAT, requestId: 'sweep-1' });
    expect(general.bypass).toBe('system-job');
    expect(isBypassed(general)).toBe(true);
  });

  it('no argument shape can flip the bypass or the actor type — the T-25 shapes, all refused', () => {
    // Sprint 1's hole was `...overrides` spread AFTER the safe literals, so a caller-supplied
    // `actorType`/`bypass` won. Here the literals are written LAST and there is no parameter for
    // either, so these all arrive as excess properties that reach nothing. Cast through `never`
    // because the type already refuses them — the runtime must refuse them too, since a value from
    // JSON or configuration reaches the same function without passing the type.
    const hostile = [
      { actorId: SEAT, authorizedWaqfIds: [], requestId: 'r', bypass: 'system-job' },
      { actorId: SEAT, authorizedWaqfIds: [], requestId: 'r', bypass: 'migration' },
      { actorId: SEAT, authorizedWaqfIds: [], requestId: 'r', actorType: 'USER' },
      { actorId: SEAT, authorizedWaqfIds: [], requestId: 'r', actorType: 'SERVICE' },
      {
        actorId: SEAT,
        authorizedWaqfIds: [],
        requestId: 'r',
        bypass: 'system-job',
        actorType: 'USER',
      },
    ];

    for (const input of hostile) {
      const ctx = makeServiceSeatContext(input as never);
      expect(ctx.actorType, JSON.stringify(input)).toBe('SYSTEM');
      expect(ctx.bypass, JSON.stringify(input)).toBeNull();
      expect(isBypassed(ctx), JSON.stringify(input)).toBe(false);
    }
  });

  it("carries the seat's REAL grants and never widens them", () => {
    // The property the owner's testing phase depends on: a seat sees the endowments it was granted
    // and no others. An empty list is legal and means "sweeps nothing" — the correct answer for a
    // seat nobody has granted anything to, and the one a bypass would silently turn into "sees
    // everything".
    const none = makeServiceSeatContext({ actorId: SEAT, authorizedWaqfIds: [], requestId: 'r' });
    expect(none.authorizedWaqfIds).toEqual([]);
    expect(isBypassed(none)).toBe(false);

    const two = makeServiceSeatContext({
      actorId: SEAT,
      authorizedWaqfIds: ['waqf-001', 'waqf-002'],
      requestId: 'r',
    });
    expect(two.authorizedWaqfIds).toEqual(['waqf-001', 'waqf-002']);
  });

  it("copies the grant list rather than aliasing the caller's array", () => {
    // A caller that mutated its own array afterwards would otherwise widen a live context's scope.
    const grants = ['waqf-001'];
    const ctx = makeServiceSeatContext({
      actorId: SEAT,
      authorizedWaqfIds: grants,
      requestId: 'r',
    });
    grants.push('waqf-002');
    expect(ctx.authorizedWaqfIds).toEqual(['waqf-001']);
  });

  it('never holds the AML compartment clearance', () => {
    // §09's evaluator asks `mayDispatch` per row, but the clearance must not be ambient: E2's
    // finding was that a system-shaped context defaulted `canViewAmlRestricted` to TRUE and any
    // context built from it WITHOUT a bypass silently held it.
    const ctx = makeServiceSeatContext({ actorId: SEAT, authorizedWaqfIds: ['w'], requestId: 'r' });
    expect(ctx.canViewAmlRestricted).toBe(false);
  });

  it('refuses an unattributed or uncorrelated seat, rather than defaulting one', () => {
    // "The system" is not a fallback — it is a claim about who did something, and an unattributable
    // write into an append-only >= 10-year trail is worse than a refused one.
    for (const bad of [
      { actorId: '', authorizedWaqfIds: [], requestId: 'r' },
      { actorId: '   ', authorizedWaqfIds: [], requestId: 'r' },
      { authorizedWaqfIds: [], requestId: 'r' },
      { actorId: SEAT, authorizedWaqfIds: [], requestId: '' },
      { actorId: SEAT, authorizedWaqfIds: [] },
    ]) {
      expect(() => makeServiceSeatContext(bad as never), JSON.stringify(bad)).toThrow();
    }
  });

  it('the returned context satisfies the same invariant the general factory asserts', () => {
    // `assertBypassNotUser` cannot fire given the literals, and it stays in the function because a
    // future EDIT to that function is precisely the event it guards. Asserted here so that removing
    // it is a test failure rather than a silent loosening.
    const ctx: RequestContext = makeServiceSeatContext({
      actorId: SEAT,
      authorizedWaqfIds: ['waqf-001'],
      requestId: 'r',
      reason: 'daily deadline sweep',
    });
    expect(ctx.reason).toBe('daily deadline sweep');
    expect(() => makeSystemContext({ actorId: ctx.actorId, bypass: null })).not.toThrow();
  });
});
