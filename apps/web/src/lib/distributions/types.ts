/**
 * The VIEW MODELS the distribution surfaces render.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * SAME CONTRACT AS `lib/endowments/types.ts`, AND FOR THE SAME REASONS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Nothing under `src/components/distributions/**` or `src/app/[locale]/(app)/{distributions,approvals}/**`
 * imports `@qmulate/api`. Every wire shape becomes one of the types below inside `./loaders.ts`, by
 * ASSIGNMENT — never by cast — so a renamed field or a widened projection reddens the one module that
 * knows about both sides instead of fourteen components.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MONEY IS A 2-dp DECIMAL STRING AND IS NEVER ARITHMETIC HERE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api` converts every halala count to a canonical 2-dp string at the boundary
 * (`toDbString(money(...))`). This app cannot import `@qmulate/domain` — it is not a dependency and
 * not in `transpilePackages` — so it CANNOT do that conversion, and must not try: a JS `number` in a
 * fiduciary figure is the defect `<CurrencyValue>`'s type signature exists to make uncompilable.
 * Every `…Sar` field below therefore arrives ready to render and is handed to `<CurrencyValue>` verbatim.
 *
 * ⚠ AND NO FIELD BELOW IS EVER ADDED TO ANOTHER. In particular {@link WaterfallView.capitalReceiptsSar}
 * is CORPUS (asl / أصل) and appears in no total on any screen — binding rule 1 as a rendering
 * constraint. The engine already holds it out of every figure; the UI's job is to show that it was
 * considered and refused, never to combine it with income.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY ABSENT FROM THESE TYPES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Three fields the wire carries and no screen may render. They are dropped in `./loaders.ts`, at the
 * boundary, so a future component cannot reach them by adding a prop:
 *
 *  1. **`LineBasis.lineageLink`** (`SON` | `DAUGHTER`) and **`LineBasis.line`** (`ZUHUR` | `BUTUN`).
 *     These are the ẓuhūr/buṭūn descent FACT the eligibility test reads for one computation. They are
 *     not demographics and must never be rendered as a person's attribute (ADR-0009; the i18n suite
 *     enforces the absence of a catalogue group for either, and `lib/endowments/labels.ts` records
 *     that a group for them "would be the first step of exactly that defect"). A label «بطون» beside a
 *     name discloses descent through a daughter.
 *  2. **`computationTrace[].data`** and the refusal's **`details`**. Both are free-form structured
 *     developer context. V-E3-M4 shipped a 464-character English developer paragraph into a slot
 *     announced in Arabic as "رمز تشخيصي"; the boundary that stops it is a mapping that never carries
 *     it, not a component that remembers not to print it.
 *  3. **`computationTrace[].message`** never crosses the wire at all — it is FROZEN COPY inside the
 *     hashed bytes (Q-S7-3), on the same footing as a trace `code`.
 */

import type { DualDate } from '@/lib/endowments/types';

export type { DualDate };

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The period
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A run's fiscal window, as two civil dates (`yyyy-MM-dd`).
 *
 * ⚠ IT IS CALLER INPUT, NOT A STORED FACT. No column anywhere records which window a Nazir is
 * distributing, so it arrives from the URL and is validated as a shape before it is passed on
 * (`isCivilDate` in `./paths.ts`). An instant with a time of day here would silently move a fiscal
 * period by up to a day.
 */
export interface RunPeriod {
  readonly start: string;
  readonly end: string;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The waterfall
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The binding order, as five deductions and one remainder.
 *
 * ṣiyāna is reserved FIRST, before any operating cost, before the Nazir fee, before anything is
 * distributable (binding rule 1 / §08 / §17). The field order here is the waterfall's order, and the
 * panel renders them in declaration order for exactly that reason.
 */
export interface WaterfallView {
  readonly revenueSar: string;
  /**
   * ⚠ CORPUS (asl / أصل). Sale and istibdal proceeds are capital, not income: they return to the
   * corpus and enter NONE of the figures below. Reported so they are visibly EXCLUDED rather than
   * absent — a screen that silently hid them would be worse than one that never mentioned them,
   * because the Nazir is the person who must see that the amount was considered and refused.
   */
  readonly capitalReceiptsSar: string;
  readonly maintenanceReserveSar: string;
  readonly operatingSar: string;
  readonly netIncomeSar: string;
  readonly nazirFeeSar: string;
  /**
   * `FEE_BASES` member, or `null`.
   *
   * ⚠ `null` IS A REAL RECORDED STATE, NOT A GAP: the deed records NO Nazir-fee basis, so no fee was
   * deducted and its determination is pending (the run carries the
   * `AUTHORITY_FEE_DETERMINATION_PENDING` flag). Defaulting it to a basis — any basis — would be this
   * layer deciding the founder's fee, which is exactly what the deed is for.
   *
   * ⚠ The 10% ʿushr behind `PERCENT_OF_REVENUE` is an UNVERIFIED figure, and it is not the Awqaf Law's
   * separate ≤10%-of-net-income Authority fee.
   */
  readonly nazirFeeBasis: string | null;
  readonly distributableSar: string;
}

/** One asl receipt the engine held out, BY ID — read from the run's input, never parsed out of prose. */
export interface CorpusReceiptView {
  readonly transactionId: string;
  /** `RECEIPT_CLASSES` member — `CAPITAL` for every row here, stated rather than assumed. */
  readonly receiptClass: string;
  /** `CAPITAL_SOURCES` member. `null` is a record defect, shown as `common.notRecorded`. */
  readonly capitalSource: string | null;
  /**
   * `null` where the projection does not carry it. The PREVIEW and CREATE paths report the amount;
   * a re-read of a STORED run does not (`distribution.get` projects no `excludedCapitalReceipts`,
   * and the stored input's halala integers may not be converted to SAR in this app). A `null` here
   * means "not projected", never "zero".
   */
  readonly amountSar: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Totals and lines
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface TotalsView {
  readonly paidSar: string;
  readonly withheldSar: string;
  readonly crossBorderSar: string;
  /** Distributable attached to NO line. A withheld amount belongs to a named beneficiary instead. */
  readonly retainedSar: string;
  readonly entitledSar: string;
  readonly residualSar: string;
  readonly excludedCount: number;
  readonly entitledLineCount: number;
}

/**
 * How one line was decided — the BR-505 basis, minus the two descent fields (see the file header).
 *
 * `rule` is an `ENTITLEMENT_RULES` member and is TIER 1: it prints on a beneficiary's statement, its
 * ar/en wording is product-approved legal text owned by E10/E12, and it therefore renders as a machine
 * code through `<DiagnosticCode>` and never as a sentence this app invented.
 */
export interface LineBasisView {
  readonly tabaqa: number | null;
  readonly branch: string | null;
  /** `BeneficiaryKind` — has catalogue copy under `endowments.beneficiaries.kindValue`. */
  readonly kind: string;
  /** `ENTITLEMENT_RULES` member. TIER 1 — renders as a code. */
  readonly rule: string;
  /** `CONTINUATION_STIPULATIONS` member, or `null` where this order consumed none. */
  readonly continuationStipulation: string | null;
}

export interface LineView {
  readonly beneficiaryId: string;
  /** `LINE_STATUSES` member — catalogue copy under `distribution.lineStatus`. */
  readonly status: string;
  readonly entitledSar: string;
  /** The engine's own SIX decimals, verbatim. Display-only; never a base for an allocation. */
  readonly sharePercent: string;
  /** `EXCLUSION_REASON_CODES` or a `GATE_REASON_CODES` member. TIER 1 — renders as a code. */
  readonly reasonCode: string | null;
  /** `GATE_REASON_CODES` members. A hold stops payment WITHOUT reducing entitlement. */
  readonly gateFlags: readonly string[];
  readonly basis: LineBasisView;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Timing, notices, diagnostics, trace
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The deadline, in both calendars, plus which one bound.
 *
 * ⚠ `deadlineGregorian` and `deadlineHijri` ARE TWO DIFFERENT DAYS, not one day in two calendars:
 * `FYE + N calendar months` and `Hijri(FYE) + N Hijri months` land apart. They are therefore NOT a
 * `DualDate` and are deliberately not rendered through `<DualDateValue>`, which would state that one
 * instant has two spellings.
 *
 * ⚠ EVERY FIGURE HERE IS UNVERIFIED (binding rule 3): the 3-month post-fiscal-year-end window, the
 * `EARLIER_OF` binding rule, and `months` itself. `unverified` carries the engine's own ⚠ note.
 */
export interface TimingView {
  /** `TIMING_STATUSES` member. */
  readonly status: string;
  /** `DEADLINE_BASES` member. */
  readonly basis: string;
  /** `BINDING_CALENDARS` member — the configured preference. */
  readonly bindingCalendar: string;
  /** Which calendar actually bound. A tie under `EARLIER_OF` resolves to `GREGORIAN`. */
  readonly boundBy: string;
  readonly deadlineGregorian: string;
  readonly deadlineHijri: string;
  readonly bindingDeadlineGregorian: string;
  /** Negative when overdue. A count of days, not money — safe as a number. */
  readonly daysUntilDeadline: number;
  readonly months: number;
  /** The date the run was computed as of, in both calendars — this one IS a single day. */
  readonly asOf: DualDate;
  /** `true` when the engine attached its ⚠ marker to the window. */
  readonly unverified: boolean;
}

export interface AuthorityNoticeView {
  /** `AUTHORITY_NOTICE_TYPES` member. */
  readonly type: string;
  readonly beneficiaryId: string | null;
  /** ⚠ Rendered from the CODE. `notice.reason` is developer English and stays server-side. */
  readonly reasonCode: string;
}

/**
 * One mapping observation — its code and its severity, and nothing else.
 *
 * ⚠ `MappingDiagnostic.detail` IS NOT HERE, AND ITS ABSENCE IS THE ENFORCEMENT. It is
 * `Readonly<Record<string, string>>` of the mapper's own developer context — row ids, column names, spec
 * paragraph references, decimal-string amounts — and rendering it would put developer English on a
 * trustee's screen (V-E3-M4). Not carrying it means no component can render it by adding a prop, and the
 * type system says so rather than a comment: `tsc` refused the version of this type that had a `detail:
 * string` field, because the wire's detail is an object. It belongs in the operator log.
 */
export interface MappingDiagnosticView {
  /** `MAPPING_DIAGNOSTICS` member — catalogue copy under `distribution.diagnostic`. */
  readonly code: string;
  /** `CONFLICT` | `NOTICE`. */
  readonly severity: string;
}

export interface TraceEntryView {
  readonly seq: number;
  /** `TRACE_STAGES` member — catalogue copy under `distribution.traceStage`. */
  readonly stage: string;
  /** The step's machine code. Frozen inside the digest; rendered as a code, never as prose. */
  readonly code: string;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * A computed run — `distribution.preview` / `distribution.create`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface ComputedRunView {
  readonly engineVersion: string;
  readonly runDigest: string;
  readonly waqfId: string;
  /** `MONETARY` | `NA_DIRECT_USE`. */
  readonly distributionType: string;
  readonly classification: string;
  readonly waqfType: string;
  readonly entitlementOrder: string;
  /** The run-level `ENTITLEMENT_RULES` member. TIER 1 — renders as a code. */
  readonly entitlementRule: string;
  readonly period: RunPeriod;
  readonly waterfall: WaterfallView;
  /** ⚠ CORPUS, by id. Empty means the period held no capital receipt — a fact, not a filter. */
  readonly excludedCapitalReceipts: readonly CorpusReceiptView[];
  readonly totals: TotalsView;
  readonly lines: readonly LineView[];
  readonly timing: TimingView;
  readonly authorityNotices: readonly AuthorityNoticeView[];
  /** `RUN_FLAGS` members, in canonical order — catalogue copy under `distribution.flag`. */
  readonly flags: readonly string[];
  /** `INVARIANT_IDS` this run ASSERTED. */
  readonly invariantsChecked: readonly string[];
  /**
   * The complement — every declared invariant this run did NOT assert, derived in `./loaders.ts`
   * from the catalogue-backed member list.
   *
   * ⚠ RENDERED SEPARATELY AND NEVER FOLDED IN. An invariant that says nothing about this run must not
   * appear beside the ones that do: a reader would rely on a guarantee that was never given. `I8`
   * (determinism) is unprovable from a single run and is always here.
   */
  readonly invariantsNotAsserted: readonly string[];
  /** The engine's verbatim ⚠ notes. Rendered as text beside the figures they qualify. */
  readonly unverifiedNotes: readonly string[];
  readonly diagnostics: readonly MappingDiagnosticView[];
  readonly trace: readonly TraceEntryView[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * A refused run
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The engine halted, or the mapping refused before the engine saw the record.
 *
 * `messageKey` is the ONE catalogued sentence and has already been validated through
 * `kernelMessageKey` — so a renamed code cannot print `errors.domain.WHATEVER` on a Nazir's screen.
 * `refusal` is the DISCRIMINATOR: the only field that tells the twenty-six `SHART_INCOMPLETE`s apart,
 * and it has no approved wording in any locale, so it renders as a machine code.
 *
 * ⚠ `refusal: null` MEANS THE ERROR CARRIED NO RECOGNISED DISCRIMINATOR. It is never inferred, never
 * parsed out of the message, and never replaced with a plausible one.
 */
export interface RunRefusalView {
  readonly period: RunPeriod;
  /** A `DOMAIN_ERROR_CODES` member, or `UNKNOWN`. */
  readonly code: string;
  readonly refusal: string | null;
  /** `engine` | `mapper` | `null`. Decides which of the two catalogued explanations is shown. */
  readonly refusalSource: string | null;
  /** Validated against both error namespaces; degrades to `errors.generic`. */
  readonly messageKey: string;
}

export type RunPreview =
  | { readonly status: 'computed'; readonly run: ComputedRunView }
  | { readonly status: 'refused'; readonly refusal: RunRefusalView };

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * A stored run — `distribution.list` / `distribution.get` / `distribution.lines`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface RunListRow {
  readonly distributionId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** `DistributionStatus` member — catalogue copy under `distribution.runStatus`. */
  readonly status: string;
  readonly distributableSar: string;
  readonly approvalRequestId: string | null;
  /** ⚠ `null` means NOBODY RECORDED ONE — never "the current engine". */
  readonly engineVersion: string | null;
  readonly runDigest: string | null;
}

/**
 * What the stored `computationTrace` Json yields once read defensively.
 *
 * ⚠ EVERY FIELD IS OPTIONAL-BY-ABSENCE. The column is untyped Json and holds rows written before
 * this shape existed (`dist-001` is seeded as a historical record whose own numbers are internally
 * inconsistent, deliberately). So the reader returns `null` for anything it cannot recognise and the
 * screen states the absence, rather than presenting a partial run as a complete one.
 */
export interface StoredTraceView {
  readonly engineVersion: string | null;
  readonly runDigest: string | null;
  readonly distributionType: string | null;
  readonly entitlementOrder: string | null;
  readonly entitlementRule: string | null;
  readonly flags: readonly string[];
  readonly invariantsChecked: readonly string[];
  readonly invariantsNotAsserted: readonly string[];
  readonly unverifiedNotes: readonly string[];
  readonly timing: TimingView | null;
  readonly totals: TotalsView | null;
  readonly lines: readonly LineView[];
  /** ⚠ CORPUS, by id, recovered from the stored input. `amountSar` is `null` here — see the type. */
  readonly corpusReceipts: readonly CorpusReceiptView[];
  readonly diagnostics: readonly MappingDiagnosticView[];
  readonly trace: readonly TraceEntryView[];
}

export interface StoredRunView {
  readonly distributionId: string;
  readonly waqfId: string;
  readonly status: string;
  readonly periodStart: DualDate;
  readonly periodEnd: DualDate;
  readonly grossRevenueSar: string;
  readonly reserveSar: string;
  readonly operatingSar: string;
  readonly nazirFeeSar: string;
  readonly distributableSar: string;
  readonly approvalRequestId: string | null;
  readonly executedAt: DualDate | null;
  readonly engineVersion: string | null;
  readonly runDigest: string | null;
  /**
   * ⚠ NET INCOME IS NOT HERE, AND ITS ABSENCE IS DELIBERATE. Migration 21 records five money columns
   * and net income is not one of them. Subtracting two decimal strings in this app to produce a sixth
   * is money arithmetic in the browser bundle's language — the one thing risk #9 forbids. The stored
   * screen shows the five recorded figures and says so.
   */
  readonly trace: StoredTraceView | null;
}

/** One PERSISTED line item — the record after `execute`, distinct from the computed lines above. */
export interface LineItemRow {
  readonly lineItemId: string;
  readonly beneficiaryId: string;
  readonly status: string;
  readonly sharePercent: string;
  readonly amountSar: string;
  /** The engine's `reasonCode`, written verbatim. TIER 1 — renders as a code. */
  readonly blockedReason: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The approval
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The `ApprovalRequest` behind a run.
 *
 * ⚠ `makerId` AND `checkerId` ARE USER IDS, NOT NAMES, and are rendered as such. There is no
 * procedure that resolves a user id to a person's name, and inventing a display name from an email
 * local part would put a real person's identity on a screen from a string nobody validated.
 */
export interface ApprovalView {
  readonly approvalRequestId: string;
  /** `DISTRIBUTION_RUN` for a run. Stated, because `approval.approve` does NOT check the type. */
  readonly type: string;
  /** `ApprovalStatus` member — catalogue copy under `endowments.reserved.status`. */
  readonly status: string;
  readonly makerId: string;
  readonly checkerId: string | null;
  /**
   * ⚠ NULLABLE IN THE SCHEMA, AND THE NULL IS LOAD-BEARING ELSEWHERE. A `null` `subjectId` makes the
   * one-open-per-subject index read as "at most one open request of this TYPE on this endowment" rather
   * than "unlimited" — the fail-closed direction. A `DISTRIBUTION_RUN` should never carry one (the
   * database trigger compares it to the run's own id), so a `null` here is a defect worth showing.
   */
  readonly subjectId: string | null;
  /** ⚠ Nullable. `null` means no artifact hash was recorded, so there is nothing for an approval to bind to. */
  readonly payloadHash: string | null;
}

/** One row of the Nazir's queue: the run, its endowment, and the approval awaiting a decision. */
export interface QueueRow {
  readonly waqfId: string;
  readonly certificateNumber: string | null;
  readonly run: RunListRow;
  readonly approval: ApprovalView | null;
}

/**
 * One endowment in the caller's scope.
 *
 * ⚠ THE LIST COMES FROM `whoami`'s GRANTS, NOT FROM `navigation.tree`, AND THE REASON WAS MEASURED.
 * Against the seeded database, `user-accountant-001` (`FINANCE`, five ACTIVE grants, holding
 * `distribution:run:read` and `distribution:run:initiate` on every one of them) gets
 * `navigation.tree` → `{clients: []}` while `whoami` reports all five grants — verified live through
 * `/api/trpc`. The pre-existing `/en/endowments` index shows the same seat "No endowment is within
 * your access scope". So the tree's force filter narrows on something a maker seat does not hold,
 * and a distribution module built on the tree would be BLANK for the only role that may create a run.
 *
 * `whoami` is also the more correct source on its own terms: it reports the caller's OWN grants, needs
 * no further permission, and a grant is exactly what "in scope" means.
 *
 * ⚠ WHICH MAKES THE DESCRIPTIVE FIELDS NULLABLE, AND THEY ARE TYPED THAT WAY RATHER THAN DEFAULTED.
 * The certificate number and the classification live on `Waqf` and reach this app only through the
 * tree, so a seat that cannot read the tree gets `null` for both and the screens fall back to the
 * `waqfId`. A fabricated label would be worse: `classification` gates real regulatory obligations, and
 * guessing one is inventing a compliance fact.
 */
export interface EndowmentRef {
  readonly waqfId: string;
  readonly certificateNumber: string | null;
  readonly classification: string | null;
  readonly entitlementOrder: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The dashboard tiles
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Two live counts, and the four numbers that keep them from being read as more than they are.
 *
 * ⚠ `overdue` IS COUNTED FROM WHAT EACH RUN RECORDED, NOT COMPUTED HERE. The deadline lives in
 * `@qmulate/domain`'s Umm al-Qura and business-day code, which this app cannot import; a second
 * deadline implementation in the browser's language is how two answers to "is this late" get created.
 * So the tile counts runs whose own stored `timing.status` is `OVERDUE`.
 *
 * ⚠ WHICH MAKES {@link runsWithoutRecordedTiming} LOAD-BEARING, NOT DECORATION. A run written before
 * this trace shape existed records no timing at all, and a zero on the tile would then read as "none
 * are late" when the truth is "none could be assessed". The tile states both numbers.
 */
export interface DashboardCounts {
  /** Runs at `PENDING_APPROVAL` across every endowment the caller may read. Exact. */
  readonly pendingApproval: number;
  /** Live runs whose stored `timing.status` is `OVERDUE`. */
  readonly overdue: number;
  /** How many endowments contributed — a zero over zero endowments is not a clean board. */
  readonly endowmentsRead: number;
  /** How many live runs were inspected for a recorded timing. */
  readonly runsInspected: number;
  /** Of those, how many record no readable timing. See the note above. */
  readonly runsWithoutRecordedTiming: number;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The caller's own facts
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `whoami`, narrowed to what a distribution screen needs.
 *
 * ⚠ THIS IS NOT AN AUTHORIZATION BOUNDARY AND MUST NEVER BE TREATED AS ONE. The kernel refuses every
 * verb on its own, on every call, from the caller's own scoped client. This exists so a screen does
 * not offer a control that is certain to be refused — a courtesy, checked again below it. Note what is
 * absent: a role list. `whoami` deliberately reports none, because `getUserRoleKeys()` unions roles
 * across every grant with no `waqfId` at all, and a screen rendering "you are the Nazir" from it would
 * be one refactor away from a permission check doing the same (MP-12).
 */
export interface CallerFacts {
  readonly userId: string;
  /** waqfId → the permissions the caller's ACTIVE grant on that endowment resolves to. */
  readonly permissionsByWaqf: ReadonlyMap<string, readonly string[]>;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Loaded — the same three-state result the endowment loaders return
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type { Loaded } from '@/lib/endowments/types';
