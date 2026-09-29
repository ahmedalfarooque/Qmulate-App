/**
 * The machine codes the distribution surfaces render, and the line between the two kinds.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO KINDS OF CODE, AND ONLY ONE OF THEM EVER BECOMES A SENTENCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **TIER 2 — ordinary staff-facing vocabulary.** A run status, a line status, a receipt class, a run
 * flag, an invariant id, a trace stage, a mapping diagnostic. These are internal-operations words on
 * an internal-operations screen. S7-5 authored their ar/en copy under the `distribution.*` namespace,
 * flagged as engineering's rendering owed to the E10/E12 review. They resolve through {@link DIST_VOCAB}.
 *
 * **TIER 1 — product-approved legal text.** The eight `EXCLUSION_REASON_CODES`, the seven
 * `ENTITLEMENT_RULES`, and the twenty-six `SHART_REFUSALS` discriminators. This is text *a beneficiary
 * may dispute before the Authority*. It is owned by E10/E12, it has no group in this file and never
 * will, and it renders through `<DiagnosticCode>` — the machine code, beside the ONE catalogued
 * sentence for the halt. {@link TIER_ONE_NO_COPY} exists so that fact is greppable rather than folklore.
 *
 * The failure this whole arrangement closes is the one next-intl makes silent: a missing message is not
 * an exception, it is PRINTED. `t('distribution.flag.SOMETHING_NEW')` on an unpaired value renders
 * `distribution.flag.SOMETHING_NEW` on a Nazir's screen and every suite stays green. So no screen calls
 * `t()` on a runtime-built key directly — every enum-ish value goes through {@link DIST_VOCAB} first,
 * and an unrecognised one is shown AS ITSELF in mono rather than as a raw dotted key or an em-dash.
 *
 * ⚠ THE ARABIC THAT MUST NOT BE INVENTED, NAMED. `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` above all: the
 * exclusion REVERSES on the blocking ancestor's death, so its Arabic must not read as permanent, and
 * nothing downstream may cache or persist it as durable. `REVERSION_PENDING_LIVING_BLOODLINE` prints on
 * a charity's own statement, where copy implying an expectation of the family's death is worse than no
 * copy at all. `BUTUN_LINE_NOT_CONTINUED` is permanent under its deed and must not be phrased like the
 * two temporary ones. None of that wording may be authored in a code change.
 */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · TIER 2 — group → the members that have ar+en copy under `distribution.<group>`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every member list below is spelled exactly as its source vocabulary spells it, and every one is
 * asserted against both catalogues by `packages/i18n/test/code-source-parity.test.ts` (which derives the
 * declared vocabularies from `packages/domain/src/distribution/contract.ts` and
 * `packages/api/src/distribution/refusal.ts` rather than trusting a hand-copied list) and pinned
 * member-for-member by `packages/i18n/test/messages.test.ts`.
 *
 * Counts, re-derived from source rather than taken from a brief: `RUN_FLAGS` 13 · `INVARIANT_IDS` 12
 * (including `I-C1`, `I-L1`, `I-R1`, whose hyphens defeat a `[A-Z][A-Z0-9_]*` literal scan) ·
 * `TRACE_STAGES` 7 · `LINE_STATUSES` 4 · `MAPPING_DIAGNOSTICS` 11 · `DistributionStatus` 6.
 */
export const DIST_VOCAB = {
  /** `DistributionStatus` (schema.prisma). ⚠ `EXECUTED` and `CANCELLED` are terminal; there is no `REJECTED`. */
  runStatus: {
    group: 'runStatus',
    members: ['DRAFT', 'COMPUTED', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'CANCELLED'],
  },
  /**
   * `LINE_STATUSES`. ⚠ `CROSS_BORDER_PENDING` ALSO EXISTS UNDER `errors.domain` AS A GATE CODE — a
   * different vocabulary sharing a spelling. Do not reach for the gate wording to label a line status.
   */
  lineStatus: {
    group: 'lineStatus',
    members: ['PAID', 'WITHHELD', 'CROSS_BORDER_PENDING', 'EXCLUDED'],
  },
  /** `DistributionResult.distributionType`. */
  distributionTypeValue: {
    group: 'distributionTypeValue',
    members: ['MONETARY', 'NA_DIRECT_USE'],
  },
  /** `RECEIPT_CLASSES` — ghallah (غلة) vs asl (أصل). The distinction the whole waterfall rests on. */
  receiptClass: { group: 'receiptClass', members: ['INCOME', 'CAPITAL'] },
  /** `CAPITAL_SOURCES` — which corpus event produced a CAPITAL receipt. Required on every CAPITAL row. */
  capitalSource: {
    group: 'capitalSource',
    members: ['SALE_PROCEEDS', 'ISTIBDAL_PROCEEDS', 'EXPROPRIATION_COMPENSATION', 'OTHER'],
  },
  /** `FEE_BASES`. ⚠ The 10% ʿushr behind `PERCENT_OF_REVENUE` is UNVERIFIED against primary law. */
  feeBasis: {
    group: 'feeBasis',
    members: ['PERCENT_OF_REVENUE', 'PERCENT_OF_NET_INCOME', 'RETAINER'],
  },
  /** `TIMING_STATUSES`. */
  timingStatus: { group: 'timingStatus', members: ['ON_TIME', 'OVERDUE'] },
  /** `DEADLINE_BASES`. ⚠ The 3-month post-fiscal-year-end window is UNVERIFIED. */
  deadlineBasis: { group: 'deadlineBasis', members: ['SHART_SCHEDULE', 'POST_FYE_DEFAULT'] },
  /** `BINDING_CALENDARS`. ⚠ `EARLIER_OF` is itself an unverified reading of the obligation. */
  bindingCalendar: { group: 'bindingCalendar', members: ['EARLIER_OF', 'GREGORIAN', 'HIJRI'] },
  /** `AUTHORITY_NOTICE_TYPES` — one member, and the `kind` field exists because it is one. */
  authorityNoticeType: {
    group: 'authorityNoticeType',
    members: ['CROSS_BORDER_DISBURSEMENT'],
  },
  /**
   * `RUN_FLAGS`, in the engine's canonical order.
   *
   * ⚠ THREE OF THESE CARRY SUBJECT MATTER ADJACENT TO A TIER-1 PROHIBITION, and S7-5 flagged them
   * rather than assuming: `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`,
   * `REVERSION_TO_ULTIMATE_TAKER_APPLIED`, `REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED`. Their copy
   * is written as a statement about the CLAUSE's state and never about anyone's death. They are
   * rendered ONLY on these internal run screens. The moment one of them lands on a beneficiary
   * statement it becomes a different artifact and goes to the owed register.
   */
  flag: {
    group: 'flag',
    members: [
      'AUTHORITY_FEE_DETERMINATION_PENDING',
      'NO_ELIGIBLE_BENEFICIARIES',
      'NIL_DISTRIBUTION',
      'NA_DIRECT_USE',
      'CAPITAL_RECEIPTS_EXCLUDED',
      'MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED',
      'TIMING_OVERDUE',
      'UNVERIFIED_FIGURES_APPLIED',
      'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
      'CONTINUATION_STIPULATION_NOT_APPLIED',
      'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
      'REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING',
      'REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED',
    ],
  },
  /**
   * `INVARIANT_IDS` — TWELVE, and the three hyphenated ones are the point.
   *
   * `I-C1` (corpus never mixes with income), `I-L1` (per capita) and `I-R1` (no charity paid in the
   * same run as any descendant) are the corpus, per-capita and reversion guarantees. A scan whose code
   * literal was `[A-Z][A-Z0-9_]*` could not see any of them and would report success about exactly the
   * three that matter most.
   *
   * This list is also the SOURCE of `invariantsNotAsserted`: the complement of what a run checked. `I8`
   * (determinism) is unprovable from one run and is therefore always in the complement.
   */
  invariant: {
    group: 'invariant',
    members: ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I-C1', 'I-L1', 'I-R1'],
  },
  /** `TRACE_STAGES`. */
  traceStage: {
    group: 'traceStage',
    members: ['INPUT', 'WATERFALL', 'RESOLVER', 'GATES', 'TIMING', 'ALLOCATE', 'INVARIANTS'],
  },
  /** `MAPPING_DIAGNOSTICS` (packages/api) — what reading the RECORD noticed, outside the digest. */
  diagnostic: {
    group: 'diagnostic',
    members: [
      'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION',
      'MAINTENANCE_PERCENT_RATE_NOT_EXACTLY_REPRESENTABLE',
      'MAINTENANCE_POLICY_UNACKNOWLEDGED',
      'NAZIR_FEE_DEED_SILENT_CONFIGURED_FIGURE_NOT_SUBSTITUTED',
      'NAZIR_FEE_DEED_RATE_DISAGREES_WITH_CONFIGURED_FIGURE',
      'OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED',
      'LEDGER_REVERSED_PAIR_EXCLUDED',
      'CAPITAL_RECEIPTS_PASSED_TO_ENGINE',
      'SHART_ADVISORY_GAP',
      'DISBURSING_ENTITY_HAS_NO_COLUMN',
      'BANKING_REF_FOR_PROCEEDS_HAS_NO_COLUMN',
    ],
  },
  /** `MappingDiagnosticSeverity`. `CONFLICT` is a record defect; `NOTICE` is an observation. */
  diagnosticSeverity: { group: 'diagnosticSeverity', members: ['CONFLICT', 'NOTICE'] },
} as const satisfies Record<
  string,
  { readonly group: string; readonly members: readonly string[] }
>;

export type DistVocabName = keyof typeof DIST_VOCAB;

/** Does this value have ar+en copy in its group? */
export function isKnownDistVocab(name: DistVocabName, value: string): boolean {
  return (DIST_VOCAB[name].members as readonly string[]).includes(value);
}

/** The catalogue key for a member of `name`'s group, relative to the `distribution` namespace. */
export function distVocabKey(name: DistVocabName, value: string): string {
  return `${DIST_VOCAB[name].group}.${value}`;
}

/**
 * Every declared invariant this run did NOT assert.
 *
 * The complement, derived — not a second hand-maintained list. Anything the run reported that this app
 * does not recognise is dropped from the complement rather than being claimed as unasserted: the honest
 * answer about an unknown id is silence, not a guarantee.
 */
export function invariantsNotAsserted(checked: readonly string[]): readonly string[] {
  const asserted = new Set(checked);
  return DIST_VOCAB.invariant.members.filter((id) => !asserted.has(id));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · TIER 1 — the codes that have NO group here, written down so the absence is deliberate
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The codes that STILL render as machine codes alone, because their wording is not this
 * repository's to write — the render-site view of the i18n owed register.
 *
 * ⚠ THIS IS DOCUMENTATION, NOT A SWITCH. Nothing branches on it — `statement-copy.ts` decides
 * coverage by reading the CATALOGUE (`Object.hasOwn`), so a NEW Tier-1 code missing from this list
 * still renders safely as a code rather than as invented prose, and a code gaining approved copy
 * starts rendering its sentence without this list moving. The i18n partition law
 * (`code-source-parity.test.ts`: approved-subset ⊎ owed-register = engine contract, per group) is
 * the PIN that this list's content equals the fallback set; this copy exists so a reviewer of the
 * render site can see it without opening that suite.
 *
 * ⊖ REWRITTEN IN M1-b. Before M1-a wired the drafter's ANSWERED brief, ALL eight exclusion codes
 * and ALL seven entitlement rules were here. Five of each gained approved verbatim wording
 * (byte-locked to `APPROVED-WORDING.md`); what remains below is the owed register's Tier-1 slice
 * (plus the two owed gate codes, which live with the withheld voice). The twenty-six
 * `SHART_REFUSALS` discriminators need no register entry by design: a run that refuses reaches no
 * statement, so the discriminator sits beside `errors.domain.SHART_INCOMPLETE` as a code an
 * operator quotes in a ticket.
 */
export const TIER_ONE_NO_COPY = {
  /** `EXCLUSION_REASON_CODES` still without copy (3 of 8) — on the owed register. */
  exclusionReasons: [
    /** One code covering a death and a scope removal (REV4-M2, owner 2026-08-24: stands) — the drafter's follow-up round owes the one status-neutral sentence. */
    'BENEFICIARY_INACTIVE',
    /** ⚠ Prints on a charity's own statement. Copy implying an expectation of a family's death is worse than none. */
    'REVERSION_PENDING_LIVING_BLOODLINE',
    'REVERSION_PENDING_BLOODLINE_UNENUMERATED',
  ],
  /** `ENTITLEMENT_RULES` still without copy (2 of 7) — each prints on the BR-505 beneficiary statement. */
  entitlementRules: ['ULTIMATE_TAKER_MAAL_AL_WAQF', 'NA_DIRECT_USE'],
  /** Gate codes whose STATEMENT voice is still owed (2 of 5) — the toast voice exists in `errors.domain`. */
  withheldReasons: ['CATEGORY_NOT_CAPTURED', 'ENTITY_UNLICENSED'],
} as const;

/**
 * ⚠ `NA_DIRECT_USE` APPEARS THREE TIMES IN THIS REPOSITORY AS THREE DIFFERENT THINGS, and they must not
 * be confused at a render site:
 *
 *  1. `endowments.entitlementOrderValue.NA_DIRECT_USE` — the `EntitlementOrder` enum member. Has copy.
 *  2. `distribution.distributionTypeValue.NA_DIRECT_USE` — the run's `distributionType`. Has copy.
 *  3. `ENTITLEMENT_RULES`' `NA_DIRECT_USE` — TIER 1, and has NONE.
 *
 * Reusing (1) or (2) to label (3) would put an order label where a statement's entitlement basis
 * belongs. `line.basis.rule` always goes through `<DiagnosticCode>`; nothing resolves it by spelling.
 */
export const NA_DIRECT_USE_IS_THREE_VOCABULARIES = true;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Reading aids — a tone is never the fact
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * status → chip tone.
 *
 * ⚠ THE CHIP'S OWN WORDS CARRY THE MEANING. `<Chip>` requires a text `label` and has no icon-only
 * variant, so the tone is a reading aid that reinforces a sentence which is already there. An
 * unrecognised value falls through to `neutral` and still renders its code, rather than being dropped.
 */
export const RUN_STATUS_TONE: Readonly<Record<string, 'neutral' | 'info' | 'success' | 'warning'>> =
  {
    DRAFT: 'neutral',
    COMPUTED: 'info',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'info',
    EXECUTED: 'success',
    CANCELLED: 'neutral',
  };

/**
 * line status → chip tone.
 *
 * `WITHHELD` is WARNING and `EXCLUDED` is NEUTRAL, and the difference is substantive rather than
 * decorative: a withheld line has full entitlement that a procedural hold is blocking (I6 asserts not
 * one halala moved), while an excluded line was never entitled under this deed. Tinting them alike
 * would tell a Nazir the two are one state.
 */
export const LINE_STATUS_TONE: Readonly<
  Record<string, 'neutral' | 'info' | 'success' | 'warning'>
> = {
  PAID: 'success',
  WITHHELD: 'warning',
  CROSS_BORDER_PENDING: 'info',
  EXCLUDED: 'neutral',
};

/** `CONFLICT` is a defect in the record; `NOTICE` is an observation about it. Different tones. */
export const DIAGNOSTIC_SEVERITY_TONE: Readonly<Record<string, 'warning' | 'neutral'>> = {
  CONFLICT: 'warning',
  NOTICE: 'neutral',
};

/**
 * The run statuses that are still LIVE — nothing is paid, and a decision is still owed.
 *
 * Used to bound the dashboard tiles' reads and to decide which runs the Nazir's queue lists. Derived
 * from the lattice: `EXECUTED` and `CANCELLED` are terminal (a database trigger refuses any transition
 * out of either), so everything else is live.
 */
export const LIVE_RUN_STATUSES: readonly string[] = [
  'DRAFT',
  'COMPUTED',
  'PENDING_APPROVAL',
  'APPROVED',
];

/** A run in this status is waiting on the Nazir. */
export const AWAITING_APPROVAL_STATUS = 'PENDING_APPROVAL';

/** A run in this status has an approval and is waiting to be posted. */
export const AWAITING_EXECUTION_STATUS = 'APPROVED';
