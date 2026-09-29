/**
 * RACI routing for the reserved-matter chain — PURE. (S12-2 · BR-1103 · §10 §9)
 *
 * The operating model's RACI table, as the platform embodies it: which ROLE is due to act at each
 * chain step, and who is notified when the chain completes. Encoded once so approvals and
 * notifications "route correctly and accountability stays with the Nazir" (BR-1103) by TABLE rather
 * than by prose in a router.
 *
 * ⚠ ROUTING IS NOT AUTHORITY. This table says who is NOTIFIED that a step is due. Who may RECORD a
 * step is a permission (`legal:reserved_matter:write` — staff, per the owner's 2026-09-08 ruling
 * *"staff"*), and who may SIGN is `nazir` alone (ADR-0005). A `family_board` seat is routed the
 * principal-consent step because the Principal is the party whose written approval it is; a staff
 * member records the letter when it arrives.
 */

import type { RoleKey } from '../access.js';
import {
  missingReservedMatterChainSteps,
  reservedMatterChainState,
  type ReservedMatterChainRow,
  type ReservedMatterChainStep,
} from './chain.js';

/** The operating model's parties (docs/company/operating-model.md "Accountability (RACI)"). */
export const RACI_PARTIES = [
  'PRINCIPAL',
  'ACCOUNTABLE_GOVERNOR',
  'MANDATE_LEAD',
  'LEGAL_REVIEW',
  'INDEPENDENT_ASSURANCE',
  'SUBCONTRACTORS',
  'REGULATOR',
] as const;
export type RaciParty = (typeof RACI_PARTIES)[number];

/** §10 §9's table — party → platform roles. */
export const RACI_ROLES_BY_PARTY: Readonly<Record<RaciParty, readonly RoleKey[]>> = {
  PRINCIPAL: ['family_board'],
  /**
   * The Nazir, and the authorized representative — "Accountable (joint & several)" in §10 §2.1,
   * Nazarah reg. Art. 11(5). The representative shares the ACCOUNTABILITY, never the SIGN:
   * `RACI_SIGN_ROUTING` names `nazir` alone (ADR-0005; `sign` is non-delegable, §10 §8).
   */
  ACCOUNTABLE_GOVERNOR: ['nazir', 'authorized_rep'],
  MANDATE_LEAD: [
    'case_manager',
    'finance',
    'compliance_officer',
    'aml_officer',
    'admin',
    'leadership',
  ],
  LEGAL_REVIEW: ['counsel'],
  INDEPENDENT_ASSURANCE: ['auditor'],
  SUBCONTRACTORS: ['subcontractor'],
  /** No seat — the Authority is a recipient of filings and notices, never a user of this system. */
  REGULATOR: [],
};

/** Which party is DUE at each chain step, and — because the regulator has no seat — who acts for it. */
export const RACI_STEP_ROUTING: Readonly<
  Record<
    ReservedMatterChainStep,
    { readonly party: RaciParty; readonly notifyRoles: readonly RoleKey[] }
  >
> = {
  PRINCIPAL_CONSENT: { party: 'PRINCIPAL', notifyRoles: ['family_board'] },
  COUNSEL_REVIEW: { party: 'LEGAL_REVIEW', notifyRoles: ['counsel'] },
  /** The Authority has no seat; the Mandate Lead's compliance function carries the notice. */
  AUTHORITY_NOTICE: { party: 'REGULATOR', notifyRoles: ['compliance_officer', 'case_manager'] },
};

/** When the chain is complete, the sign is due — and accountability routes to the Nazir alone. */
export const RACI_SIGN_ROUTING = { party: 'ACCOUNTABLE_GOVERNOR', notifyRoles: ['nazir'] } as const;

export interface ReservedMatterRoute {
  readonly step: ReservedMatterChainStep | 'NAZIR_SIGN';
  readonly party: RaciParty;
  readonly notifyRoles: readonly RoleKey[];
}

/**
 * Where a reserved matter goes NEXT, read off its recorded facts: every unrecorded-but-required step
 * (all of them at once — the steps are independent letters that may arrive in any order), or the
 * sign when the chain is complete. A kindless row routes nowhere: it carries no chain.
 */
export function routeReservedMatter(row: ReservedMatterChainRow): readonly ReservedMatterRoute[] {
  if (row.reservedMatterKind === null) return [];
  const missing = missingReservedMatterChainSteps(reservedMatterChainState(row));
  if (missing.length === 0) return [{ step: 'NAZIR_SIGN', ...RACI_SIGN_ROUTING }];
  return missing.map((step) => ({ step, ...RACI_STEP_ROUTING[step] }));
}
