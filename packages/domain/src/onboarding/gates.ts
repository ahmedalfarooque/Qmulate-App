/**
 * The three sequenced handover gates — PURE. (S12-3 · BR-1101 · V-11)
 *
 * docs/company/operating-model.md: "Sequenced handover gates (nothing downstream proceeds until the
 * prior gate clears). Gate 01 Authority & Legal → Gate 02 Systems & Controls → Gate 03 People,
 * Property & Cadence." This module is the ONE vocabulary of gates, their order, what each gate
 * BLOCKS downstream, and the operating model's checklist for each — read here so the api, the seed
 * and the screen cannot disagree about any of them.
 *
 * WHAT IS DECIDED HERE AND WHAT IS NOT. The order is the operating model's. What Gate 02 blocks is
 * §17's E11 exit ("a distribution run is blocked while Gate 02 is incomplete") and V-11 ("a
 * distribution run or an Authority filing"). The MECHANICAL prerequisites are engineering's reading
 * of the operating model's gate text against the record the product actually keeps: a verified
 * trusteeship deed and a recorded classification (Gate 01), a dedicated bank account (Gate 02), a
 * beneficiary registry unless the endowment is direct-use (Gate 03). Everything else the model lists
 * — identity/email, cloud accounting, the ops workspace, the vault, subcontractors, training, the
 * reporting cadence — lives outside this platform and is ATTESTED by the clearer, item by item.
 * ⚠ The owner was asked for the checklist's content (S12 Q4) and has not answered; this is the
 * operating model's own list and is corrected by config, not code.
 */

export const ONBOARDING_GATES = [
  'GATE_01_AUTHORITY_LEGAL',
  'GATE_02_SYSTEMS_CONTROLS',
  'GATE_03_PEOPLE_PROPERTY_CADENCE',
] as const;
export type OnboardingGate = (typeof ONBOARDING_GATES)[number];

export type OnboardingGateStatus = 'OPEN' | 'CLEARED';

/** The activities a gate blocks while it is not CLEARED. Only Gate 02 blocks anything downstream. */
export const GATED_ACTIVITIES = ['DISTRIBUTION_RUN', 'AUTHORITY_FILING_SUBMISSION'] as const;
export type GatedActivity = (typeof GATED_ACTIVITIES)[number];

export const GATE_BLOCKING: Readonly<Record<GatedActivity, OnboardingGate>> = {
  DISTRIBUTION_RUN: 'GATE_02_SYSTEMS_CONTROLS',
  AUTHORITY_FILING_SUBMISSION: 'GATE_02_SYSTEMS_CONTROLS',
};

/** The operating model's checklist per gate — the items a clearer ATTESTS (all must be true). */
export const OPERATING_MODEL_GATE_CHECKLIST: Readonly<Record<OnboardingGate, readonly string[]>> = {
  GATE_01_AUTHORITY_LEGAL: [
    'classificationConfirmed',
    'waqfAndAssetsRegistered',
    'deedCertificateTitleDeedsInVault',
    'counselReviewOfReservedMattersAndLicensing',
  ],
  GATE_02_SYSTEMS_CONTROLS: [
    'identityAndEmailStoodUp',
    'cloudAccountingOnSocpaChart',
    'dedicatedBankAccountsOpened',
    'opsWorkspaceAndComplianceCalendar',
    'vaultAndDashboardStoodUp',
  ],
  GATE_03_PEOPLE_PROPERTY_CADENCE: [
    'beneficiaryRegistryAndAccessMatrixBuilt',
    'licensedSubcontractorsAppointedBoardApproved',
    'annualTrainingComplete',
    'reportingCadenceEstablished',
  ],
};

/** The MECHANICAL prerequisites, as facts the api reads from the record at clear time. */
export interface GatePrerequisiteFacts {
  readonly trusteeshipDeedRecorded: boolean;
  /** `eligibilityVerifiedAt` recorded on the deed (BR-109 / NFR-09 — a recorded verification, not a recomputation). */
  readonly nazirEligibilityVerified: boolean;
  /** `classification <> NOT_CLASSIFIED` (S8-Q4: the absence of a determination is not a class). */
  readonly classificationRecorded: boolean;
  readonly dedicatedBankAccounts: number;
  readonly beneficiaries: number;
  /** `entitlementOrder = NA_DIRECT_USE` — a direct-use endowment has no beneficiary registry to build. */
  readonly directUse: boolean;
}

export const GATE_PREREQUISITE_CODES = [
  'TRUSTEESHIP_DEED_NOT_RECORDED',
  'NAZIR_ELIGIBILITY_NOT_VERIFIED',
  'CLASSIFICATION_NOT_RECORDED',
  'NO_DEDICATED_BANK_ACCOUNT',
  'NO_BENEFICIARY_RECORDED',
] as const;
export type GatePrerequisiteCode = (typeof GATE_PREREQUISITE_CODES)[number];

/** The unmet mechanical prerequisites of `gate`, in a fixed order. Empty ⇔ the gate MAY be cleared (order permitting). */
export function unmetGatePrerequisites(
  gate: OnboardingGate,
  facts: GatePrerequisiteFacts,
): readonly GatePrerequisiteCode[] {
  const unmet: GatePrerequisiteCode[] = [];
  if (gate === 'GATE_01_AUTHORITY_LEGAL') {
    if (!facts.trusteeshipDeedRecorded) unmet.push('TRUSTEESHIP_DEED_NOT_RECORDED');
    else if (!facts.nazirEligibilityVerified) unmet.push('NAZIR_ELIGIBILITY_NOT_VERIFIED');
    if (!facts.classificationRecorded) unmet.push('CLASSIFICATION_NOT_RECORDED');
  } else if (gate === 'GATE_02_SYSTEMS_CONTROLS') {
    if (facts.dedicatedBankAccounts < 1) unmet.push('NO_DEDICATED_BANK_ACCOUNT');
  } else if (!facts.directUse && facts.beneficiaries < 1) {
    unmet.push('NO_BENEFICIARY_RECORDED');
  }
  return unmet;
}

export interface GateRow {
  readonly gate: OnboardingGate;
  readonly status: OnboardingGateStatus;
}

export function gateRank(gate: OnboardingGate): 1 | 2 | 3 {
  return (ONBOARDING_GATES.indexOf(gate) + 1) as 1 | 2 | 3;
}

/** The gate immediately before `gate`, or `null` for Gate 01. */
export function priorGate(gate: OnboardingGate): OnboardingGate | null {
  return ONBOARDING_GATES[ONBOARDING_GATES.indexOf(gate) - 1] ?? null;
}

/** The gate immediately after `gate`, or `null` for Gate 03. */
export function nextGate(gate: OnboardingGate): OnboardingGate | null {
  return ONBOARDING_GATES[ONBOARDING_GATES.indexOf(gate) + 1] ?? null;
}

export function isGateCleared(rows: readonly GateRow[], gate: OnboardingGate): boolean {
  // Absence is NOT evidence: a missing row is an OPEN gate.
  return rows.some((row) => row.gate === gate && row.status === 'CLEARED');
}

export type GateOrderRefusal = 'PRIOR_GATE_NOT_CLEARED' | 'LATER_GATE_STILL_CLEARED';

/** Why the ORDER forbids clearing `gate` now, or `null`. (Prerequisites are a separate question.) */
export function clearOrderRefusal(
  rows: readonly GateRow[],
  gate: OnboardingGate,
): GateOrderRefusal | null {
  const prior = priorGate(gate);
  if (prior !== null && !isGateCleared(rows, prior)) return 'PRIOR_GATE_NOT_CLEARED';
  return null;
}

/** Why the ORDER forbids reopening `gate` now, or `null`. */
export function reopenOrderRefusal(
  rows: readonly GateRow[],
  gate: OnboardingGate,
): GateOrderRefusal | null {
  const later = nextGate(gate);
  if (later !== null && isGateCleared(rows, later)) return 'LATER_GATE_STILL_CLEARED';
  return null;
}

export interface DownstreamBlock {
  readonly activity: GatedActivity;
  readonly gate: OnboardingGate;
}

/** The gate blocking `activity` on an endowment with these gate rows, or `null` when nothing blocks. */
export function downstreamBlock(
  rows: readonly GateRow[],
  activity: GatedActivity,
): DownstreamBlock | null {
  const gate = GATE_BLOCKING[activity];
  return isGateCleared(rows, gate) ? null : { activity, gate };
}

/** The checklist items of `gate` the attestation leaves unattested (missing or not `true`). */
export function unattestedChecklistItems(
  gate: OnboardingGate,
  attestation: Readonly<Record<string, unknown>> | null | undefined,
): readonly string[] {
  return OPERATING_MODEL_GATE_CHECKLIST[gate].filter((item) => attestation?.[item] !== true);
}
