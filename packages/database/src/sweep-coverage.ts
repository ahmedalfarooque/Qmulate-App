/**
 * The sweep-coverage control — G-5's second bound made LOUD.  (S10/T2)
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE BLIND SPOT THIS EXISTS FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The deadline sweep runs as the declared service seat with the scoping bypass OFF (D1,
 * 2026-08-28), so `scopeFilter` narrows every read to the seat's real grants — WHICH IS THE
 * FORCE FILTER WORKING CORRECTLY, and it has a consequence the seat cannot see: an endowment
 * nobody granted the seat is silently never swept. Its statutory deadlines are not computed,
 * not reminded, not escalated — and nothing anywhere says so. That silence is one of G-5's two
 * bounds ("the sweep's own, not the engine's").
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * STRUCTURALLY OUTSIDE THE SEAT — the property, and how it is kept
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A control that ran under the seat's context would inherit the exact blind spot it reports on
 * and read zero gaps forever. So, structurally:
 *
 *   · its reads go through the UNEXTENDED base client (`getBasePrismaClient()`) — no scoping
 *     extension, no force filter, no seat context anywhere on the path. The base handle is
 *     read-permitted on every model by design (client.ts's own contract), and `qmulate_app`
 *     holds SELECT everywhere, so no bypass is involved either;
 *   · its ONE input about the seat is the seat's user id — a string, never the seat's context;
 *   · its audit events are attributed to ITS OWN principal (`user-control-sweep-coverage`,
 *     actorType SYSTEM, bypass EXPLICITLY null per D1's convention for every construction
 *     site), so the trail shows the CONTROL noticing, never the seat confessing.
 *
 * The structural test gives the seat ZERO grants and watches this control emit one event per
 * live endowment while the sweep emits nothing — a control wired to the seat's view could not
 * pass it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * LOUD, NOT LETHAL — and one event PER ENDOWMENT, never a summary
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The caller (apps/worker's sweep) runs this AFTER the sweep and logs a failure rather than
 * dying on one: a broken control must not stop deadline evaluation for the endowments the seat
 * DOES hold. Each gap is its own `SWEEP_COVERAGE_GAP` audit event carrying the REAL `waqfId` —
 * an admin reading the trail sees which endowment is dark, not that "some count" was nonzero.
 * `SWEEP_COVERAGE_GAP` is `AuditAction`'s first-ever widening (migration 46, vocabulary only);
 * its ar/en statement copy is DECLARED OWED (E10/E12 product-approved text, never invented in
 * code — the pin's own rule).
 */

import { activeGrantWhere, makeSystemContext } from './context.js';
import { getBasePrismaClient, recordEvent } from './client.js';

/**
 * The control's own principal row (seeded; non-human, NO grants, NO credential account).
 * Distinct from the sweep seat BY DESIGN — see "structurally outside" above.
 */
export const SWEEP_COVERAGE_CONTROL_ACTOR_ID = 'user-control-sweep-coverage';

export interface SweepCoverageInput {
  /** The sweep seat whose coverage is being audited — an ID, deliberately never a context. */
  readonly seatUserId: string;
  /** The tick's clock, stated by the caller (the enqueuer may read a clock; handlers may not). */
  readonly now: Date;
  /** Correlation id linking the control's events to the sweep run that triggered it. */
  readonly requestId: string;
}

export interface SweepCoverageResult {
  readonly liveWaqfIds: readonly string[];
  readonly grantedWaqfIds: readonly string[];
  /** The gaps — endowments the sweep silently cannot see. One audit event was emitted for each. */
  readonly ungrantedWaqfIds: readonly string[];
}

/**
 * Diffs the live endowment set against the seat's active grants and emits one
 * `SWEEP_COVERAGE_GAP` audit event per endowment the seat cannot see.
 *
 * Returns the full accounting either way; emitting zero events on full coverage is the expected
 * steady state, and the caller logs the counts so "the control ran and found nothing" is
 * distinguishable from "the control never ran" (this repo's signature failure, refused by
 * construction here).
 */
export async function runSweepCoverageControl(
  input: SweepCoverageInput,
): Promise<SweepCoverageResult> {
  if (typeof input.seatUserId !== 'string' || input.seatUserId.trim() === '') {
    throw new Error(
      'runSweepCoverageControl: seatUserId is REQUIRED — auditing coverage of no seat is meaningless.',
    );
  }

  const base = getBasePrismaClient();

  // Every waqf row is a live endowment: rows are permanent by construction (migration 4 refuses
  // DELETE; there is no soft-delete column on waqf). If an archival state ever lands, this read
  // must learn it in the same change.
  const waqfs = await base.waqf.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  const liveWaqfIds = waqfs.map((row) => row.id);

  const grants = await base.waqfAccessGrant.findMany({
    where: { userId: input.seatUserId, ...activeGrantWhere(input.now) },
    select: { waqfId: true },
  });
  const grantedWaqfIds = [...new Set(grants.map((row) => row.waqfId))].sort();
  const granted = new Set(grantedWaqfIds);

  const ungrantedWaqfIds = liveWaqfIds.filter((id) => !granted.has(id));

  // The control's OWN identity: SYSTEM actor, its own seeded principal, bypass EXPLICITLY null —
  // not because the control needs scoping (its reads are done, above, on the base client) but
  // because D1's known cost is that every construction site must state the bypass rather than
  // inherit the factory default, and this is a construction site.
  const controlCtx = makeSystemContext({
    actorId: SWEEP_COVERAGE_CONTROL_ACTOR_ID,
    requestId: input.requestId,
    reason: 'sweep-coverage control: G-5 second bound, one event per ungranted endowment',
    bypass: null,
  });

  for (const waqfId of ungrantedWaqfIds) {
    await recordEvent(controlCtx, {
      action: 'SWEEP_COVERAGE_GAP',
      entityType: 'Waqf',
      entityId: waqfId,
      waqfId,
      // `AuditCategory` is the four-value enum {ACCESS, MUTATION, APPROVAL, AUTH} — measured on
      // this control's first live emit, which died on a made-up 'compliance' value. ACCESS is
      // the honest home: a coverage gap is a statement about the ACCESS PLANE (the seat holds no
      // grant here, so the scoping extension — correctly — denies it this endowment), the same
      // plane ACCESS_DENIED events live on. Nothing mutated, nothing approved.
      category: 'ACCESS',
      classification: 'ROUTINE',
      extraContext: {
        control: 'sweep-coverage',
        seatUserId: input.seatUserId,
        asOf: input.now.toISOString(),
        detail:
          'The deadline sweep seat holds no active grant on this endowment: its statutory ' +
          'deadlines are NOT being computed, reminded or escalated. Grant the seat or record ' +
          'why not — this event repeats each sweep until one of those happens.',
      },
    });
  }

  return { liveWaqfIds, grantedWaqfIds, ungrantedWaqfIds };
}
