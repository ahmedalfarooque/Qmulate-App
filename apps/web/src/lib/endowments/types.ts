/**
 * The VIEW MODELS the endowment screens render.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THESE ARE DECLARED HERE RATHER THAN INFERRED FROM THE ROUTER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every component under `src/components/endowments/` depends on THIS file and on nothing from
 * `@qmulate/api`. Two consequences, both deliberate:
 *
 *  1. The screens are checkable, and reviewable, on their own. A projection change reddens
 *     `loaders.ts` — where the mapping lives — and not fourteen components.
 *  2. The mapping in `loaders.ts` is an ASSIGNMENT from the router's inferred output into these
 *     types, so a renamed field, a dropped column or a `Date` that should have been an ISO string
 *     fails to compile at the one place that knows about both sides. That is the drift detector,
 *     and it earned its keep: every field below was corrected against the shipped routers after
 *     the first `tsc` run. There is no cast anywhere on the path.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * VOCABULARY TRAVELS AS `string`, AND THE REASON IS NOT LAZINESS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api` sends every domain enum across the wire as a `string` (`String(waqf.classification)`,
 * `String(row.status)`, `String(event.from)`) so the transport does not import the domain's
 * vocabulary. The wire type is therefore WIDER than the domain, and restating a narrow union here
 * would be a claim this app cannot check — it would only compile by asserting a `string` into it,
 * which is exactly the cast this file exists to avoid.
 *
 * So a code travels as a `string` and is checked WHERE IT IS RENDERED, through `VOCAB` in
 * `./labels.ts`: a known member resolves to its ar/en label, an unknown one renders as an
 * untranslated diagnostic code. That is the fail-VISIBLE direction — next-intl PRINTS a missing key
 * rather than throwing, so an unchecked value would put `endowments.waqfTypeValue.JOINT` on a
 * Nazir's screen with every suite green. `packages/i18n/test/messages.test.ts` pins each group
 * member-for-member in both locales, so the "known" branch cannot silently lose an entry either.
 */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Dates — a legally significant date is always a PAIR
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical UTC value plus the frozen Umm al-Qura snapshot written at insert time (NFR-02).
 * The snapshot is rendered VERBATIM and never recomputed, so a record issued years ago still shows
 * the Hijri date it was issued under.
 */
export interface DualDate {
  readonly iso: string;
  readonly hijri: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * navigation.tree — Client → Waqif → Endowment
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface TreeEndowment {
  readonly id: string;
  readonly certificateNumber: string;
  readonly deedNumber: string | null;
  readonly classification: string;
  readonly type: string;
  readonly nature: string;
  readonly entitlementOrder: string;
}

/** `nameEn` is nullable in the schema: an Arabic-only record is legitimate, Arabic being the
 *  authoritative language (NFR-01). The screens fall back to `nameAr`, never to a placeholder. */
export interface TreeWaqif {
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly waqfs: readonly TreeEndowment[];
}

export interface TreeClient {
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly waqifs: readonly TreeWaqif[];
}

export interface NavigationTree {
  readonly clients: readonly TreeClient[];
}

export interface PartyName {
  readonly nameAr: string;
  readonly nameEn: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * endowment.get — the BR-101 record
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * مآل الوقف — where the endowment goes once its beneficiary class ends.
 *
 * ⚠ THE THREE STATES ARE NOT TWO. `captured: false` means NOBODY HAS READ THE CLAUSE YET;
 * `captured: true, kind: null` means THE DEED POSITIVELY RECORDS NO ULTIMATE TAKER. Collapsing the
 * first into the second would let "unread" masquerade as the founder's silence, which is the whole
 * reason `reversionClauseCaptured` exists as a column. The screens render them as different
 * sentences, and neither is ever a default.
 */
export interface ReversionSummary {
  readonly captured: boolean;
  readonly kind: string | null;
  /**
   * ⚠ `ultimateTakerIds`, NOT `ultimateTakerBeneficiaryIds` (V-E3-L2, closed S4). This view model and
   * the tRPC contract used the longer spelling while the engine input, the fixture and the seed used
   * this one. The record's spelling won: the key lives inside the write-once `shartAlWaqif` JSON,
   * which nothing may rewrite (Binding rule 1). See `deedTermArtifact` in
   * `packages/api/src/routers/endowment.ts` for the full note, including what the rename costs.
   */
  readonly ultimateTakerIds: readonly string[];
  readonly recordedAt: DualDate | null;
}

/**
 * The three deed facts the record screen shows — with WHY they are absent when they are.
 *
 * ⚠ `disclosed` AND `recorded` ARE DIFFERENT FACTS (G7-V2). `disclosed: false` means the reader
 * does not hold `endowment:deed:read` and nothing was read; `recorded: false` means the endowment
 * genuinely has no trusteeship deed. Collapsing them into one nullable object is how a screen tells
 * a Family Board member "no Nazir is appointed" about an endowment that has one.
 */
export interface EndowmentTrusteeshipSummary {
  readonly disclosed: boolean;
  readonly recorded: boolean | null;
  readonly primaryNazir: string | null;
  readonly jointlyLiable: boolean | null;
  readonly hasAuthorizedRep: boolean | null;
}

/**
 * ⊕ S11-1 — the `REGISTER_30BD` clock-start as RECORDED OPERATOR INPUT (owner ruling 9f3d8fd), with
 * the KIND that travels with it. `null` on the record = NOT RECORDED, which the engine turns into a
 * refusal BY NAME — never "no deadline". ⚠ It is NOT `registrationDate` (the registration itself).
 */
export interface RegistrationAnchorView {
  readonly date: DualDate;
  /** `RegistrationAnchorKind`, rendered through `endowments.registrationAnchorKindValue`. */
  readonly kind: string;
}

/**
 * ⊕ S11-2 — the REGISTER_30BD chain HEAD as the record page shows it: the frozen due date and, when the
 * duty has been recorded as discharged, the completion date. Read through `deadline.list`
 * (`compliance:task:read`), so a seat without that verb sees the anchor and nothing about the deadline —
 * never a sentence claiming there is none.
 */
export interface RegistrationDeadlineView {
  readonly id: string;
  readonly due: DualDate;
  readonly discharged: { readonly on: DualDate; readonly kind: string } | null;
}

export interface EndowmentDetail {
  readonly id: string;
  readonly waqifId: string;
  readonly clientId: string;
  readonly certificateNumber: string;
  readonly deedNumber: string | null;
  readonly classification: string;
  readonly type: string;
  readonly nature: string;
  readonly entitlementOrder: string;
  /** `null` = not on record. NEVER a default — an absent term must keep halting the engine. */
  readonly continuationStipulation: string | null;
  readonly reversion: ReversionSummary;
  readonly fiscalYearEnd: string | null;
  readonly registrationDate: DualDate | null;
  readonly certificateExpiry: DualDate | null;
  readonly registrationAnchor: RegistrationAnchorView | null;
  /**
   * ⊕ S11-1 — which clock-start inputs THIS CALLER may write, as the kernel answered from the same
   * `resolveScope` the procedures are mounted on. A form is drawn only where `true`: a control the
   * reader cannot use is a false statement about the product (the E3 no-affordance pin).
   */
  readonly writable: {
    readonly registrationAnchor: boolean;
    readonly istibdalCompletion: boolean;
    /** ⊕ S11-2 — `compliance:task:write`: may record the registration duty as discharged. */
    readonly registrationDischarge: boolean;
  };
  readonly shartAlWaqifVersion: number | null;
  readonly trusteeship: EndowmentTrusteeshipSummary | null;
}

/**
 * ⊕ S11-1 — one taking, for the record screen's istibdal-completion input. `istibdalCompleted: null`
 * = the substitution's completion is NOT RECORDED, and `ISTIBDAL_10BD` refuses by name for it.
 */
export interface ExpropriationView {
  readonly id: string;
  readonly assetId: string;
  readonly scope: string;
  readonly announcedDate: DualDate;
  readonly istibdalStatus: string;
  readonly istibdalCompleted: DualDate | null;
  readonly authorityNotified: DualDate | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * deed.get — the appointment and the verdict on the RECORDED facts
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface AuthorizedRepresentative {
  readonly name: string;
  readonly scope: string | null;
  readonly appointedDate: DualDate | null;
}

/**
 * One eligibility condition, as the pure resolver reports it.
 *
 * `satisfied: null` is NOT "false" and not "true": it is NOT ASSESSED, and a binding condition that
 * arrives unassessed is a refusal (`ELIGIBILITY_NOT_ASSESSED`), never a pass.
 *
 * `applicability` has THREE values, not two. `UNDECIDED_SURFACED` is the honest third: whether a
 * criterion binds an authorized REPRESENTATIVE is a live legal question, so it is reported, never
 * blocks, and is never a pass. `unverified` marks that the criterion's statutory basis has not been
 * confirmed against primary law — which is true of all six.
 */
export interface EligibilityCriterion {
  readonly key: string;
  readonly applicability: string;
  readonly required: boolean;
  readonly satisfied: boolean | null;
  readonly reasonCode: string | null;
  readonly unverified: boolean;
}

export interface EligibilityVerdict {
  readonly eligible: boolean;
  /** Machine reason codes. Rendered as sentences where known, as the raw code where not. */
  readonly reasons: readonly string[];
  /** WHICH criteria nobody has assessed. Data, not a second reason code. */
  readonly notAssessed: readonly string[];
  readonly criteria: readonly EligibilityCriterion[];
  /**
   * ⚠ `surfacedQuestions` IS DELIBERATELY ABSENT FROM THIS VIEW MODEL (V-E3-M4).
   *
   * `deed.get` does send it, and the domain resolver does fill it: for an authorized representative
   * it carries `SURFACED_REPRESENTATIVE_SCOPE`, a 464-character ENGLISH DEVELOPER PARAGRAPH. It was
   * carried here and rendered on the deed screen as though it were a machine code — MEASURED
   * reaching the DOM verbatim, in both locales, on fixture `waqf-001`. A developer note is not copy,
   * so the field stops at the wire: dropping it here means no future screen can render it by
   * reaching for a field that looks harmless.
   *
   * The FACT it describes still reaches the reader, as the per-criterion `UNDECIDED_SURFACED`
   * applicability label, which has catalogued ar/en copy. TODO(surface): a product-approved
   * statement of the open question itself (and a stable code to key it by — the wire has none)
   * is owed by E10/E12 before anything about it renders again.
   */
}

export interface DeedRecord {
  readonly id: string;
  readonly primaryNazir: string;
  readonly primaryAppointed: DualDate | null;
  readonly successorNazir: string | null;
  readonly authorizedRep: AuthorizedRepresentative | null;
  readonly jointlyLiable: boolean;
  readonly verifiedAt: DualDate | null;
  readonly verifiedBy: string | null;
  readonly primary: EligibilityVerdict;
  /** `null` when no authorized representative is recorded — not an empty verdict. */
  readonly representative: EligibilityVerdict | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * classification.get + classification.applicableObligations
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface ReclassificationEntry {
  readonly from: string;
  readonly to: string;
  readonly at: DualDate;
  readonly reason: string;
  readonly createdBy: string | null;
}

export interface ClassificationRecord {
  readonly current: string;
  /**
   * The `Setting` KEYS the bands resolve from — never the figures themselves.
   *
   * ⚠ The SAR 200M / 50M thresholds are UNVERIFIED against primary Saudi law. They live in `Setting`
   * rows so a correction is a configuration change rather than a code change, and the screen names
   * the keys plus the unverified marker instead of printing the numbers as though they were the law.
   */
  readonly bandSettingKeys: readonly string[];
  readonly history: readonly ReclassificationEntry[];
}

/**
 * A duty from the regulation's own catalogue.
 *
 * `titleAr` / `titleEn` come from the DATABASE, not from `packages/i18n`, and that is the right
 * split: the catalogue is the regulation's text recorded as data, and translating it in a copy deck
 * would put the product between a Nazir and the law.
 */
export interface Obligation {
  readonly code: string;
  readonly section: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly workstreamAr: string;
  readonly workstreamEn: string;
  readonly gate: string;
  /** ⚠ The WINDOW behind the key (10 business days, 3 months) is a `Setting`, and UNVERIFIED. */
  readonly deadlineRuleKey: string | null;
}

export interface ExcludedObligation {
  readonly code: string;
  readonly gate: string;
  /** `GATE_EXCLUDES_CLASSIFICATION` — the single reason gating can exclude anything. */
  readonly reason: string;
}

export interface ObligationSet {
  readonly classification: string;
  readonly obligations: readonly Obligation[];
  /**
   * ⚠ RETURNED ALONGSIDE `obligations`, AND THE SCREEN RENDERS BOTH. What makes a classification
   * matter is the DIFFERENCE it makes; a screen that only listed what applies would leave the
   * medium-vs-small contrast invisible, which an empty catalogue and a broken query both satisfy.
   */
  readonly excluded: readonly ExcludedObligation[];
  /** Non-empty whenever any figure in this set is unverified against primary law. */
  readonly unverifiedNotes: readonly string[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * shart.get + shart.completeness
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** One ṭabaqa named by the deed. `stipulatedWeight: null` is a FACT, not a default. */
export interface ShartTier {
  readonly tabaqa: number | null;
  readonly labelAr: string | null;
  readonly lines: readonly string[];
  readonly stipulatedWeight: number | null;
}

/**
 * مآل الوقف as `shart.get` reports it: a three-state status string rather than a boolean pair.
 *
 * `'unread'` · `'none'` · `'named'`, plus the api's own `'unrecognised'` fallback for a clause it
 * could not read. `'unread'` MUST NEVER be rendered as `'none'`.
 */
export interface ShartReversion {
  readonly status: string;
  readonly kind: string | null;
  readonly ultimateTakerIds: readonly string[];
  readonly recordedAtHijri: string | null;
}

/** ⚠ Deed-set (Art. 11), never statutory. The customary 10% (ʿushr) is UNVERIFIED. */
export interface ShartNazirFee {
  readonly basis: string | null;
  readonly ratePercent: number | null;
  /** A money figure crosses as a STRING — `Decimal(18,2)` does not fit IEEE-754. Never a number. */
  readonly amountSar: string | null;
}

export interface ShartStructured {
  readonly orderRule: string | null;
  readonly tiers: readonly ShartTier[];
  /** The distinct ẓuhūr/buṭūn lines the tiers mention. Derived, never a second stored list. */
  readonly lines: readonly string[];
  /**
   * `'unspecified'` (the deed is silent, or the term is illegible) and `'none'` (the deed positively
   * stipulates no reserve) are DIFFERENT FACTS. Carried through as the recorded kind so the screen
   * cannot collapse one into the other.
   */
  readonly maintenanceReserveKind: string;
  readonly disbursementChannelKind: string;
  readonly nazirFee: ShartNazirFee;
  readonly continuationStipulation: string | null;
  readonly reversion: ShartReversion;
}

export interface ShartRecord {
  readonly version: number | null;
  readonly setAt: DualDate | null;
  readonly structured: ShartStructured;
}

export interface ShartCompleteness {
  /** HALTING. The engine returns `SHART_INCOMPLETE` and computes nothing. */
  readonly missing: readonly string[];
  /** NON-HALTING. The run proceeds and the flag is surfaced. Never merged with `missing`. */
  readonly advisory: readonly string[];
  /**
   * ⚠ `SHART_REFUSALS` discriminators. RENDERED AS MACHINE CODES, NEVER TRANSLATED. The
   * per-discriminator ar/en wording is product-approved legal text a beneficiary may dispute before
   * the Authority; it is owned by E10/E12 and may not be invented in a code change. The one
   * catalogued sentence for a halt is `errors.domain.SHART_INCOMPLETE`.
   *
   * TODO(surface): the twenty-six SHART_REFUSALS discriminators still have no ar/en statement copy —
   * including ENTITLEMENT_HELD_BY_LIVING_ANCESTOR, whose Arabic must not read as permanent, since
   * the exclusion reverses on the living ancestor's death. Until E10/E12 supplies it, the screen
   * shows the code.
   */
  readonly wouldHaltWith: readonly string[];
  /**
   * ⚠ HALTING GAPS WITH NO MAPPED DISCRIMINATOR, NAMED RATHER THAN DROPPED. A halting gap that
   * produced no `wouldHaltWith` entry would read on screen as "nothing would go wrong".
   */
  readonly unmappedHaltingGaps: readonly string[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * beneficiary.list + beneficiary.lineage — the registry (E4: BR-201…BR-206)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One registry row (BR-201).
 *
 * ⚠ THERE IS NO `lineageLink` FIELD HERE, AND THERE NEVER WILL BE. The api's `list`/`get`
 * projections do not send it, and this view model must never grow it: it is the ẓuhūr/buṭūn
 * ELIGIBILITY FACT, read for exactly one computation, and rendering it would put a person's
 * descent line on screen as though it were their gender (ADR-0009; the router header).
 *
 * ⚠ `active: false` WITHOUT a death certification is a SCOPE EXIT, not a death (R7-D1,
 * owner-confirmed: an unenumerated placeholder's `active: false` cannot certify a death). The
 * screen renders the three states as three different sentences — living, certified deceased,
 * and inactive-with-no-certification — and never collapses the third into the second.
 *
 * ⚠ `kycFreshness` is COMPUTED ON EVERY READ from the refresh instant plus
 * `Setting['kyc.refreshIntervalMonths']` (unverified vs primary law), through the same domain
 * predicates the distribution gates use. `STALE` and `UNVERIFIED` are DIFFERENT states with
 * different labels; the engine distinguishes them and so must the chip.
 *
 * Decimals (`sharePercent`, `stipulatedWeight`) cross as STRINGS and stay strings — never
 * revived as JS numbers on the way to the screen.
 */
export interface BeneficiaryRow {
  readonly id: string;
  readonly branch: string;
  /** Arabic-authoritative (NFR-01). Always rendered; `relationshipEn` is the secondary label. */
  readonly relationshipAr: string;
  readonly relationshipEn: string | null;
  readonly kind: string;
  readonly verificationStatus: string;
  readonly active: boolean;
  /** The death CERTIFICATION, dual-dated. `null` + `active: false` = a scope exit, NOT a death. */
  readonly deceased: DualDate | null;
  readonly tabaqa: number | null;
  readonly residency: string;
  /** BR-203 — the beneficial-owner flag. The dataset itself is not on the registry projection. */
  readonly isUbo: boolean;
  readonly kycLastRefreshed: DualDate | null;
  readonly kycFreshness: string;
  /** BR-206. `false` on a CATEGORY_ONLY row = disbursement is blocked until the category is captured. */
  readonly categoryCaptured: boolean;
  readonly sharePercent: string | null;
  readonly stipulatedWeight: string | null;
}

/**
 * One node of the lineage graph, as `beneficiary.lineage` projects it.
 *
 * ⚠ THE WIRE SENDS `lineageLink` AND IT IS READ AND DROPPED IN THE LOADER, ON PURPOSE — same
 * boundary discipline as `surfacedQuestions` (V-E3-M4). The api returns it because its own
 * integrity cross-check needs it; no screen may render it, so it stops where the wire becomes
 * a view model. The tree renders ids, relationships, ṭabaqa and vital status ONLY.
 *
 * `tabaqaRecorded` vs `tabaqaDerived`: the recorded value is a CROSS-CHECK, not a trusted
 * input — the authoritative depth is derived from the parent edge (`parentId: null` = a child
 * of the waqif, never "unknown"). `agrees: false` is REPORTED, never reconciled: the engine
 * refuses such a graph (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) and the screen must not make it
 * look healthy.
 */
export interface LineageMember {
  readonly id: string;
  readonly parentId: string | null;
  readonly tabaqaRecorded: number | null;
  readonly tabaqaDerived: number | null;
  readonly agrees: boolean;
  readonly active: boolean;
  readonly kind: string;
}

/**
 * The integrity verdicts, RECOMPUTED BY THE KERNEL ON EVERY CALL and never persisted — the
 * exclusions this graph drives are temporary (R-FRONTIER), so nothing downstream may cache one.
 * Each array carries beneficiary IDS; the ids render as diagnostic codes, and the values that
 * put them there (the lineage links) never cross into this model.
 *
 * `cycles` is ALWAYS EMPTY today, and honestly so: a one-row cycle is structurally impossible
 * and a longer one is refused by the ENGINE (`LINEAGE_CYCLE`), not detected by this read. The
 * screen renders the section only when non-empty rather than claiming a detection that does
 * not happen here.
 */
export interface LineageIntegrity {
  readonly missingLineageLink: readonly string[];
  readonly tabaqaMismatch: readonly string[];
  readonly rootedOutsideWaqif: readonly string[];
  readonly cycles: readonly string[];
}

/**
 * The family tree (BR-204 / ADR-0009), as STRUCTURE ONLY.
 *
 * ⚠ THE WIRE'S `ancestry` ARRAY IS DELIBERATELY ABSENT. It is the frontier test's input — every
 * (beneficiary, ancestor) pair with the ancestor's vital status and lineage link — and it exists
 * so the ENGINE can decide entitlement. A screen holding it would be one map() away from
 * computing "who is entitled today" in the UI, which is exactly what must never happen: no
 * exclusion or entitlement verdict is ever computed, rendered or cached client-side. The tree
 * is drawn from `members`' parent edges alone.
 */
export interface BeneficiaryLineage {
  readonly members: readonly LineageMember[];
  readonly integrity: LineageIntegrity;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * reservedMatter.list
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface ReservedMatterChain {
  readonly principalConsent: string;
  readonly counselReview: string;
  readonly authorityNotice: string;
}

/** ⊕ S12-2 · one RECORDED chain step, as the screen shows it. `null` until recorded. */
export interface ReservedMatterRecordedStep {
  readonly at: DualDate;
  readonly by: string | null;
  readonly reference: string | null;
}

export interface ReservedMatterRecorded {
  readonly principalConsent: ReservedMatterRecordedStep | null;
  readonly counselReview: ReservedMatterRecordedStep | null;
  readonly authorityNotice: ReservedMatterRecordedStep | null;
}

/** Facts about the READER — which chain acts this caller may take. Forms are drawn only where `true`. */
export interface ReservedMatterWritable {
  readonly recordStep: boolean;
  readonly sign: boolean;
}

export interface ReservedMatter {
  readonly approvalRequestId: string;
  /** ⊕ S12-2 · the endowment the matter belongs to — the record-step forms post it back. */
  readonly waqfId: string;
  /**
   * ⚠ `null` FOR EVERY ROW MINTED BEFORE MIGRATION 12, and reported as null rather than guessed.
   * Inferring a kind from the subject would manufacture an authority the maker never asked for, so
   * the screen says "not recorded" instead.
   */
  readonly kind: string | null;
  readonly subjectType: string | null;
  readonly subjectId: string | null;
  readonly status: string;
  readonly makerId: string | null;
  readonly checkerId: string | null;
  readonly decidedAt: DualDate | null;
  readonly chain: ReservedMatterChain;
  /** ⊕ S12-2 · the unrecorded-but-required steps, in chain order — the sentence the sign is blocked on. */
  readonly chainMissing: readonly string[];
  readonly recorded: ReservedMatterRecorded;
  readonly writable: ReservedMatterWritable;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The loader result
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Two outcomes, and no third.
 *
 *  · `ok`      — the record, as read through the caller's own scoped client.
 *  · `refused` — the kernel said no. The wording comes from the CATALOGUE via `kernelMessageKey`,
 *                never from the error's developer-English `message`, which quotes the endowment id
 *                and the refused permission. `NO_GRANT` is NOT_FOUND and its sentence must stay
 *                indistinguishable from the other two non-disclosure refusals; an unrecognised
 *                refusal degrades to `errors.generic` rather than printing a machine code on screen.
 *
 * There is deliberately no `empty` or `unavailable` state. A screen that cannot read its record says
 * so; it never renders a blank record, because a blank record is a claim about the ENDOWMENT and the
 * thing that failed was the READ.
 */
export type Loaded<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'refused'; readonly messageKey: string };

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S12-3 · the three onboarding gates (BR-1101), as the screen shows them
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface OnboardingGateView {
  readonly gate: string;
  /** `false` ⇒ NO ROW EXISTS (an endowment born before migration 52). Reads as OPEN; the screen says so. */
  readonly recorded: boolean;
  readonly status: 'OPEN' | 'CLEARED';
  readonly clearedAt: DualDate | null;
  readonly clearedBy: string | null;
  readonly evidence: Readonly<Record<string, unknown>> | null;
  readonly note: string | null;
  readonly reopenedAt: DualDate | null;
  readonly reopenedBy: string | null;
  readonly reopenReason: string | null;
  readonly checklist: readonly string[];
  readonly unmetPrerequisites: readonly string[];
  readonly orderRefusal: string | null;
  readonly blocks: readonly string[];
}

export interface OnboardingView {
  readonly waqfId: string;
  readonly writable: { readonly clear: boolean; readonly reopen: boolean };
  readonly gates: readonly OnboardingGateView[];
  readonly blocked: ReadonlyArray<{ readonly activity: string; readonly by: string | null }>;
}

/** ⊕ S12-3b · the clients this caller may REGISTER an endowment for, with founders and siblings. */
export interface IntakeAuthorityView {
  readonly clients: readonly {
    readonly id: string;
    readonly nameAr: string;
    readonly nameEn: string | null;
    readonly siblingWaqfIds: readonly string[];
    readonly waqifs: readonly {
      readonly id: string;
      readonly nameAr: string;
      readonly nameEn: string | null;
    }[];
  }[];
}
