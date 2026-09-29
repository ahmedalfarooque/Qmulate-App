/**
 * The machine codes the endowment screens render, and the ONE rule for all of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A RUNTIME REGISTRY AND NOT A SET OF TYPES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api` sends every domain enum across the wire as a `string` — `String(waqf.classification)`,
 * `String(row.status)`, `String(event.from)` — and it does so deliberately, so the transport does not
 * import the domain's vocabulary. The consequence for this app is precise: the WIRE TYPE IS WIDER
 * THAN THE DOMAIN, so the screens cannot assume a value has a label. They must check.
 *
 * The failure this closes is the one next-intl makes silent: a missing message is not an exception,
 * it is PRINTED. A `JOINT` endowment with no `waqfTypeValue.JOINT` entry renders
 * `endowments.waqfTypeValue.JOINT` on a Nazir's screen and every suite stays green.
 *
 * So every enum-ish value goes through {@link VOCAB}: a known member resolves to its catalogue label,
 * and an unknown one renders as an untranslated diagnostic code. `packages/i18n/test/messages.test.ts`
 * pins each group member-for-member in both locales and in both directions, so the "known" branch
 * cannot silently lose an entry either.
 *
 * ⚠ WHAT IS NOT HERE, ON PURPOSE: the distribution EXCLUSION-REASON codes, the ENTITLEMENT-RULE codes,
 * the computationTrace codes and the twenty-six `SHART_REFUSALS` discriminators. That text is
 * product-approved legal wording a beneficiary may dispute before the Authority, it is owned by
 * E10/E12, and it must never be invented in a code change. Those always render as codes — see
 * `components/endowments/DiagnosticCode.tsx`.
 */

/**
 * group → the members that have ar+en copy under `endowments.<group>`.
 *
 * Each list is spelled exactly as the DOMAIN spells it, and every one of them is asserted against the
 * catalogue by the i18n suite. Adding a schema enum member without adding it here AND to both
 * catalogues reddens that suite rather than shipping a raw key.
 */
export const VOCAB = {
  /**
   * `WaqfClassification`. ⚠ The SAR 200M / 50M bands behind these are UNVERIFIED.
   * ⊕ `NOT_CLASSIFIED` (S8-Q4): the onboarding state. Its LABEL renders here like any member; the
   * register-LOCK prompt A2 requires beside it is separate product-approved copy still owed
   * (E10/E12) — the label alone must not be read as that prompt.
   */
  /**
   * `WaqfClassification` — THREE size bands plus the onboarding state.
   *
   * ⊕ S9-4a: `DIRECT_UTILIZATION` removed with the enum (owner ruling, fifth batch — it is an
   * orthogonal usage attribute, not a size). Its approved wording was *"Direct-benefit"* /
   * *"ذات انتفاع مباشر"*; the copy is removed here because the value cannot be rendered any more.
   *
   * ⚠ **OWED, DECLARED, AND DELIBERATELY NOT INVENTED HERE: the new `Waqf.directUtilization`
   * ATTRIBUTE HAS NO DISPLAY COPY.** It needs a yes/no label pair in both locales, and inventing
   * Arabic for a regulatory attribute in a backend change is exactly what the M1-a partition
   * forbids — statement copy is product-approved wording, not engineering's. No screen renders the
   * attribute yet (S9-4a is backend only), so nothing is broken by the absence; the pair is owed to
   * whichever stage first renders it, and it should REUSE the wording above for the `true` case
   * rather than composing new Arabic for a concept that already has approved words.
   */
  classification: {
    group: 'classificationValue',
    members: ['LARGE', 'MEDIUM', 'SMALL', 'NOT_CLASSIFIED'],
  },
  /**
   * `WaqfType`. ⚠ `JOINT` IS DELIBERATELY INCLUDED, and the REASON CHANGED on 2026-08-25 while the
   * inclusion did not.
   *
   * The distribution engine REFUSES the value (`WAQF_TYPE_JOINT_NOT_SUPPORTED`). ⊕ It used to refuse
   * it because الوقف المشترك was read as an Authority oversight category spanning both kinds rather
   * than a hybrid endowment — **the product owner REVERSED that** (*"i was wrong earlier, a joint
   * waqf is described as partially ذري and partially خيري"*), so the refusal is now SCOPE (this
   * engine has no share basis for the two portions) and not doctrine. Joint support is a designed
   * epic.
   *
   * Which makes rendering this label MORE important than before, not less: a joint endowment is a
   * legitimate thing to have on record, so the record screen must be able to say what it is.
   */
  waqfType: { group: 'waqfTypeValue', members: ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI', 'JOINT'] },
  waqfNature: { group: 'waqfNatureValue', members: ['AYNI', 'QIYAMI'] },
  /** `EntitlementOrder` — four as of migration 12, which added `LINEAGE_CONTINUATION`. */
  entitlementOrder: {
    group: 'entitlementOrderValue',
    members: ['ORDERED', 'SHARED', 'LINEAGE_CONTINUATION', 'NA_DIRECT_USE'],
  },
  /**
   * `ContinuationStipulation` — a CLOSED two-value deed term. There is no third member and no
   * default: absent is the ABSENCE of a value, renders as `common.notRecorded`, and keeps halting
   * the engine.
   */
  continuation: { group: 'continuationValue', members: ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] },
  reversionKind: { group: 'reversionKindValue', members: ['CHARITABLE_ULTIMATE_TAKER'] },
  // ⊕ S11-1 — the owner's dropdown for the REGISTER_30BD clock-start (9f3d8fd); labels in
  // `endowments.registrationAnchorKindValue`, parsed from schema.prisma by code-source-parity.
  registrationAnchorKind: {
    group: 'registrationAnchorKindValue',
    members: ['WAQF_DOCUMENTATION_DATE', 'REGULATION_EFFECTIVE_DATE'],
  },
  classificationGate: {
    group: 'classification.gate',
    // ⊕ S8-Q3 (owner, 2026-08-23) — six gates. ⚠ THIS LIST IS THE ONE WITH NO TEST. The measured
    // incident above is exactly this shape: RECEIPT_CLASS_CORRECTION had approved ar/en in BOTH
    // catalogues and still rendered as a bare Latin code on a Nazir's screen, because VOCAB listed 7
    // of 8. Catalogue parity does NOT imply correct rendering, and the parity assertion for this file
    // is still OWED — it cannot live in apps/web, which is Playwright-only.
    members: ['ALL', 'LARGE_MEDIUM', 'SMALL_DIRECT', 'EXCLUDE_DIRECT', 'HAS_INCOME', 'LARGE_ONLY'],
  },
  obligationSection: {
    group: 'classification.section',
    members: ['FINANCIAL', 'OPERATIONAL', 'GOVERNMENT_LEGAL'],
  },
  approvalStatus: {
    group: 'reserved.status',
    members: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'VOID'],
  },
  /**
   * `RESERVED_MATTER_KINDS` (`packages/api/src/routers/reservedMatter.ts`) — EIGHT.
   *
   * ⚠ `RECEIPT_CLASS_CORRECTION` WAS MISSING FROM THIS LIST WHILE BOTH CATALOGUES CARRIED IT, and the
   * consequence was precisely the defect this registry exists to prevent, inverted: not a raw dotted key
   * for a value with no copy, but a bare Latin code for a value whose approved ar/en copy already existed
   * (`ar.json` reads «تصحيح تصنيف مقبوض (غلة أو أصل)»). A reserved matter that renders as
   * `RECEIPT_CLASS_CORRECTION` on a Nazir's screen is a governance record shown in the developer's
   * language. Measured at 7-vs-8 during S7 and fixed here; all eighteen other groups matched.
   *
   * ⚠ AND THE PARITY ASSERTION IS STILL OWED. `VOCAB` is a FOURTH hand-maintained list with NO TEST — grep
   * finds it only in this file, `VocabLabel.tsx` and `types.ts`. `packages/i18n/test/messages.test.ts` pins
   * each catalogue group member-for-member, but nothing compares THIS registry to those groups, which is
   * exactly why an eight-member vocabulary could sit here as seven. The assertion belongs in the i18n suite
   * (a `VOCAB`-vs-catalogue comparison, both directions, for all nineteen groups); `apps/web` has no unit
   * test harness of its own — only Playwright — so it cannot host it. Reported as owed rather than left
   * unsaid.
   */
  reservedMatterKind: {
    group: 'reserved.kind',
    members: [
      'ASSET_DISPOSAL',
      'ASSET_SUBSTITUTION_ISTIBDAL',
      'ASSET_PLEDGE',
      'ASSET_LONG_LEASE',
      'DEED_IDENTITY',
      'DEED_TERM_RECORD',
      'ACCESS_MATRIX_CHANGE',
      'RECEIPT_CLASS_CORRECTION',
      // ⊕ S12-5 · the NINTH kind (S9-4a's owner-ruled gated correction). S12-2 recorded this list as
      // eight of nine and owed the parity; both catalogues already carried the copy.
      'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED',
    ],
  },
  chainState: {
    group: 'reserved.chainState',
    members: ['RECORDED', 'NOT_RECORDED', 'NOT_REQUIRED'],
  },
  /** ⊕ S12-2 · `RESERVED_MATTER_CHAIN_STEPS` (`@qmulate/domain`) — the three BR-1102 steps by machine code. */
  chainStep: {
    group: 'reserved.chainStep',
    members: ['PRINCIPAL_CONSENT', 'COUNSEL_REVIEW', 'AUTHORITY_NOTICE'],
  },
  /** ⊕ S12-3 · `ONBOARDING_GATES` (`@qmulate/domain`) — the operating model's three gates. */
  onboardingGate: {
    group: 'onboarding.gate',
    members: [
      'GATE_01_AUTHORITY_LEGAL',
      'GATE_02_SYSTEMS_CONTROLS',
      'GATE_03_PEOPLE_PROPERTY_CADENCE',
    ],
  },
  onboardingGateStatus: {
    group: 'onboarding.status',
    members: ['OPEN', 'CLEARED'],
  },
  /** `GATE_PREREQUISITE_CODES` — the mechanical prerequisites the record must carry before a gate clears. */
  gatePrerequisite: {
    group: 'onboarding.prerequisite',
    members: [
      'TRUSTEESHIP_DEED_NOT_RECORDED',
      'NAZIR_ELIGIBILITY_NOT_VERIFIED',
      'CLASSIFICATION_NOT_RECORDED',
      'NO_DEDICATED_BANK_ACCOUNT',
      'NO_BENEFICIARY_RECORDED',
    ],
  },
  /** `GATED_ACTIVITIES` — what Gate 02 blocks (V-11). */
  gatedActivity: {
    group: 'onboarding.activity',
    members: ['DISTRIBUTION_RUN', 'AUTHORITY_FILING_SUBMISSION'],
  },
  /** `OPERATING_MODEL_GATE_CHECKLIST`, flattened — the thirteen items a clearer attests. */
  gateChecklist: {
    group: 'onboarding.checklist',
    members: [
      'classificationConfirmed',
      'waqfAndAssetsRegistered',
      'deedCertificateTitleDeedsInVault',
      'counselReviewOfReservedMattersAndLicensing',
      'identityAndEmailStoodUp',
      'cloudAccountingOnSocpaChart',
      'dedicatedBankAccountsOpened',
      'opsWorkspaceAndComplianceCalendar',
      'vaultAndDashboardStoodUp',
      'beneficiaryRegistryAndAccessMatrixBuilt',
      'licensedSubcontractorsAppointedBoardApproved',
      'annualTrainingComplete',
      'reportingCadenceEstablished',
    ],
  },
  /**
   * `BeneficiaryKind` (schema.prisma). ⚠ What is NOT a group here, and never will be: the
   * ẓuhūr/buṭūn `lineageLink` values (`SON`/`DAUGHTER`). They are an ELIGIBILITY FACT read for one
   * computation, never rendered as a person's gender — no label, no i18n key (ADR-0009). A group
   * for them in this registry would be the first step of exactly that defect.
   */
  beneficiaryKind: {
    group: 'beneficiaries.kindValue',
    members: ['FAMILY', 'CHARITABLE_JIHA', 'CATEGORY_ONLY'],
  },
  /** `VerificationStatus` (schema.prisma). `UNVERIFIED` ≠ KYC-stale — different facts, below. */
  beneficiaryVerification: {
    group: 'beneficiaries.verificationValue',
    members: ['VERIFIED', 'PENDING', 'UNVERIFIED'],
  },
  /** `BeneficiaryResidency` (schema.prisma) — drives the BR-511 cross-border payment path. */
  beneficiaryResidency: {
    group: 'beneficiaries.residencyValue',
    members: ['DOMESTIC', 'CROSS_BORDER'],
  },
  /**
   * `KycFreshness` — the api's COMPUTED classification (`beneficiary.ts`), never a stored column.
   * ⚠ `STALE` and `UNVERIFIED` are DIFFERENT states with different labels: the engine's own gates
   * distinguish "verified, but the refresh window lapsed" from "never verified at all", and a chip
   * that collapsed them would tell a Nazir a file exists that does not. The window behind `STALE`
   * is `Setting['kyc.refreshIntervalMonths']` — a figure that is UNVERIFIED against primary law,
   * so the screen marks it (binding rule 3).
   */
  kycFreshness: {
    group: 'beneficiaries.kycValue',
    members: ['FRESH', 'STALE', 'UNVERIFIED'],
  },
  /**
   * `ELIGIBILITY_CRITERIA` from `@qmulate/domain/eligibility` — SCREAMING_SNAKE, not the deed's
   * camelCase column names. Six: BR-109 names two more ("qualifications", "good conduct") for which
   * `TrusteeshipDeed` records no flag, and a criterion the resolver could only ever report as `null`
   * would make every deed permanently unseatable.
   */
  eligibilityCriterion: {
    group: 'eligibility.criteria',
    members: [
      'ISLAM',
      'LEGAL_CAPACITY',
      'NO_DISQUALIFYING_REMOVAL',
      'KSA_RESIDENCY',
      'SAUDI_NATIONALITY_WHERE_REQUIRED',
      'AUTHORITY_LICENSED',
    ],
  },
  /**
   * `CRITERION_APPLICABILITIES`. `UNDECIDED_SURFACED` is the honest third value: whether a criterion
   * binds an authorized REPRESENTATIVE is a live legal question, so it is reported, never blocks, and
   * is never a pass. Collapsing it into `NOT_APPLICABLE` would be code answering counsel's question.
   */
  criterionApplicability: {
    group: 'eligibility.applicability',
    members: ['REQUIRED', 'NOT_APPLICABLE', 'UNDECIDED_SURFACED'],
  },
  /**
   * `ELIGIBILITY_REASON_CODES` plus `REP_JOINT_LIABILITY_REQUIRED` (the api's Art. 11(5) refusal).
   *
   * ⚠ THESE ARE ORDINARY E3 VALIDATION MESSAGES, NOT DISTRIBUTION REASON CODES. The E10/E12
   * prohibition covers the text a beneficiary may dispute before the Authority; an eligibility
   * refusal is a form validation message about a trustee APPOINTMENT, and BR-109's exit clause
   * ("blocked with a clear reason") is only met if it reads as a sentence in both languages.
   *
   * ⚠ Note the polarity of `DISQUALIFYING_REMOVAL_RECORDED`: the flag is positive
   * (`noDisqualifyingRemoval: true` = clean), so the REFUSAL names the removal, not the flag.
   */
  eligibilityReason: {
    group: 'eligibility.reasons',
    members: [
      'ISLAM_REQUIRED',
      'LEGAL_CAPACITY_REQUIRED',
      'DISQUALIFYING_REMOVAL_RECORDED',
      'KSA_RESIDENCY_REQUIRED',
      'SAUDI_NATIONALITY_REQUIRED',
      'AUTHORITY_LICENCE_REQUIRED',
      'ELIGIBILITY_NOT_ASSESSED',
      'REP_JOINT_LIABILITY_REQUIRED',
    ],
  },
} as const satisfies Record<
  string,
  { readonly group: string; readonly members: readonly string[] }
>;

export type VocabName = keyof typeof VOCAB;

/** Does this value have ar+en copy in its group? */
export function isKnownVocab(name: VocabName, value: string): boolean {
  return (VOCAB[name].members as readonly string[]).includes(value);
}

/** The catalogue key for a member of `name`'s group, relative to the `endowments` namespace. */
export function vocabKey(name: VocabName, value: string): string {
  return `${VOCAB[name].group}.${value}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The maintenance reserve — the ONE distinction that must survive the UI
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `'unspecified'` means the deed is SILENT or the term is illegible. `'none'` means the deed
 * POSITIVELY STIPULATES no maintenance reserve. They are different facts about what a founder
 * instructed, the seed treats the distinction as load-bearing, and a screen that rendered both as
 * "no reserve" would erase it. Anything else renders as a machine code rather than being guessed at.
 */
export const MAINTENANCE_RESERVE_UNSPECIFIED = 'unspecified';
export const MAINTENANCE_RESERVE_NONE = 'none';

/**
 * مآل الوقف has THREE recorded states and `shart.get` reports them as one string.
 *
 * `'unread'` — nobody has read the deed's clause yet. `'none'` — the deed positively records no
 * ultimate taker (a statement, not a gap). `'named'` — a named charitable jiha. Flattening the first
 * two is exactly what `reversionClauseCaptured` was added to prevent, so each has its own sentence,
 * and `'unrecognised'` (the api's own fallback for an unreadable clause) renders as a code.
 */
export const REVERSION_STATUS_UNREAD = 'unread';
export const REVERSION_STATUS_NONE = 'none';
export const REVERSION_STATUS_NAMED = 'named';
