/**
 * ⊕ S12-3 · THE ONBOARDING GATE ON THE REQUEST PATH (BR-1101 · V-11 · §17 E11 exit)
 *
 * "A distribution run is blocked while Gate 02 is incomplete" (E11 exit); "a distribution run or an
 * Authority filing is attempted → blocked with a clear gate-not-cleared reason; completing the gate
 * unblocks it" (V-11). This is the SENTENCE. The WALL is migration 52's twins
 * (`distribution_onboarding_gate` on INSERT, `government_filing_onboarding_gate` on the move to
 * SUBMITTED), which hold against raw SQL and against the owner. Both read the same rows; the
 * reading — which gate blocks which activity, and that a MISSING row is an OPEN gate — is the
 * domain's (`downstreamBlock`), so the two cannot disagree.
 *
 * Refused BEFORE any write, with its own code: `GATE_NOT_CLEARED` is the CLASSIFICATION gate (§09)
 * and is not overloaded.
 */

import { downstreamBlock, type GateRow, type GatedActivity } from '@qmulate/domain';

import { ApiError } from '../errors.js';

import type { ScopedContext } from './scope.js';

/** The endowment's gate rows, as the domain reads them. Absence ⇒ OPEN (the domain says so; nothing is invented here). */
export type StoredGateRow = GateRow & { readonly id: string };

export async function readOnboardingGates(ctx: ScopedContext): Promise<readonly StoredGateRow[]> {
  const rows = await ctx.db.onboardingGate.findMany({
    where: { waqfId: ctx.waqfId, deletedAt: null },
    select: { id: true, gate: true, status: true },
  });
  return rows.map((row) => ({
    id: row.id,
    gate: String(row.gate) as GateRow['gate'],
    status: String(row.status) as GateRow['status'],
  }));
}

/** Refuse `activity` on this endowment unless the gate that governs it is CLEARED. */
export async function assertOnboardingGateAllows(
  ctx: ScopedContext,
  activity: GatedActivity,
  procedure: string,
): Promise<void> {
  const block = downstreamBlock(await readOnboardingGates(ctx), activity);
  if (block === null) return;
  throw new ApiError(
    'ONBOARDING_GATE_NOT_CLEARED',
    `${procedure}: ${activity} is blocked on waqf ${ctx.waqfId} — onboarding ${block.gate} is not ` +
      `CLEARED. Nothing downstream proceeds until the prior gate clears (BR-1101, operating model; ` +
      `V-11). Clear the gate on the endowment's onboarding tab; nothing was written.`,
    { waqfId: ctx.waqfId, activity, gate: block.gate, reason: 'ONBOARDING_GATE_NOT_CLEARED' },
  );
}
