/**
 * Domain errors.
 *
 * Every failure the pure engines can produce is a `DomainError` carrying a stable machine
 * `code`. Codes are **machine codes, never prose** — the ar/en wording lives in
 * `@qmulate/i18n` under `errors.domain.<CODE>` (see `messageKey`). Nothing in this file
 * may contain user-facing copy.
 *
 * Adding a code here is a contract change: the i18n catalogue must gain the matching
 * `errors.domain.<CODE>` key in **both** locales.
 */

/**
 * The closed set of domain error codes.
 *
 * Grouped by concern. Later epics extend this list; they must not repurpose an existing code.
 */
export const DOMAIN_ERROR_CODES = [
  // ── Shart al-Waqif (the founder's binding conditions) ───────────────────────────────
  /**
   * The conditions needed to resolve entitlement or shares are missing, ambiguous, or
   * unrecognised.
   *
   * The distribution engine **HALTS** and returns this. It never guesses, defaults to, or
   * infers the founder's intent — resolution goes to the condition-interpretation path
   * (living waqif, else the competent authority), never to code.
   * (CLAUDE.md binding rule 1; PRD §08 "Malformed shart".)
   *
   * **One code, many conditions — the condition is in `details.refusal`.** ADR-0009 added eleven new
   * ways for the engine to refuse (an unreadable continuation stipulation, an invalid lineage graph,
   * a joint waqf, a cohort mixing a charitable jiha with family), and every one of them is this code,
   * because every one of them is "the recorded conditions cannot resolve entitlement". Which
   * condition is carried as a discriminator in `details.refusal`, drawn from the closed
   * `SHART_REFUSALS` vocabulary in `distribution/contract.ts`.
   *
   * That vocabulary deliberately does **not** live here and must not be promoted into this list:
   * splitting one user-facing condition across a dozen codes would need a dozen `errors.domain.*`
   * messages for one meaning, and would push the engine's Stage-2 vocabulary onto
   * `packages/{auth,api,database,i18n}`, all of which consume {@link DomainErrorCode}. A surface
   * renders `errors.domain.SHART_INCOMPLETE` and shows the discriminator as diagnostic detail.
   */
  'SHART_INCOMPLETE',
  /**
   * An attempt was made to mutate the Shart al-Waqif outside the authority-gated
   * reserved-matter workflow. The Shart is write-once: amendable only with competent-authority
   * approval recorded and a full audit trail — never by a direct edit, migration, or backfill.
   */
  'SHART_IMMUTABLE',

  // ── Corpus (asl / أصل) vs income (ghallah / غلة) ────────────────────────────────────
  /**
   * A capital-class receipt reached the distribution waterfall. Sale proceeds and **istibdal**
   * (substitution) proceeds are corpus, not income; corpus is never distributed and never
   * reclassified as income (non-diminution invariant).
   */
  'CORPUS_NOT_DISTRIBUTABLE',
  /** A receipt reached an income/capital-sensitive path without an income-vs-capital classification. */
  'RECEIPT_UNCLASSIFIED',

  // ── Beneficiary / disbursement gates (PRD §08 stage 4) ──────────────────────────────
  /**
   * A `category_only` beneficiary placeholder whose `category` is still empty. The line is
   * withheld and disbursement is blocked until the category is captured.
   */
  'CATEGORY_NOT_CAPTURED',
  /** KYC/UBO verification for this beneficiary is older than the configured refresh window. */
  'STALE_KYC',
  /**
   * KYC/UBO verification for this beneficiary has **never** been completed — a distinct condition
   * from `STALE_KYC` (verified once, then expired), and PRD §08's gate table names both.
   *
   * Like its four siblings it never actually throws: it is a distribution *line* `reasonCode`. It
   * lives in this list anyway because S1 already put the other four gate reasons here, so they
   * already have ar/en `errors.domain.*` copy — adding this one keeps the five uniform and gives
   * it a message for free, instead of leaving one of the five gates as the only one no surface can
   * render.
   *
   * ⚠ §08 also spells the stale case `KYC_STALE`; `STALE_KYC` above is canonical and both must
   * never coexist — one condition with two codes is one condition whose ar/en copy will diverge.
   * (E6 / S3; PRD §08 stage 3 gate table.)
   */
  'KYC_UNVERIFIED',
  /** The beneficiary entity is not licensed / not verifiable as a payable counterparty. */
  'ENTITY_UNLICENSED',
  /** A cross-border disbursement is pending its additional control before it may be paid. */
  'CROSS_BORDER_PENDING',
  /**
   * A death certification already exists on this beneficiary and a second one was submitted
   * (E4/S5 registry write surface). A death is certified ONCE; correcting a wrong certification
   * is an owed, separately-designed act — never an overwrite of the recorded one.
   */
  'DEATH_ALREADY_CERTIFIED',
  /**
   * A death certification was attempted on a beneficiary that is not a natural person — a
   * `CHARITABLE_JIHA` or a `CATEGORY_ONLY` class (E4/S5). A death is a fact about a person; a
   * charity or a not-yet-identified class is retired by a different, reversible act. Guards R7-D1:
   * an unenumerated placeholder's inactivity must never read as a bloodline extinction.
   */
  'DEATH_ON_NON_PERSON',
  /**
   * BR-206's category capture was attempted on an individually identified FAMILY member
   * (E4/S5). The category/characteristics description exists for a not-yet-identified class
   * (`CATEGORY_ONLY`) or a charitable purpose (`CHARITABLE_JIHA`) — accepting it on a person
   * would turn the BR-206 field into free text on every row.
   */
  'CATEGORY_ON_IDENTIFIED_MEMBER',

  // ── Money & allocation ──────────────────────────────────────────────────────────────
  /** A JS `number` was passed where money was expected. Floats are banned for money, always. */
  'MONEY_NUMBER_INPUT',
  /** The value is not a finite decimal literal (empty, NaN, Infinity, or exponent notation). */
  'MONEY_INVALID',
  /** More precision than the 2-dp (halala) money scale allows. Round explicitly via `moneyRound`. */
  'MONEY_PRECISION',
  /** The value does not fit the `Decimal(18,2)` column money is stored in. */
  'MONEY_OVERFLOW',
  /** A value that must be non-negative (a distributable pool, an allocation total) was negative. */
  'MONEY_NEGATIVE',
  /** Allocation weights are absent, negative, sum to zero, or carry unusable precision. */
  'INVALID_ALLOCATION_WEIGHTS',
  /** Internal invariant breach: allocated parts do not sum exactly to the total. Never expected. */
  'ALLOCATION_IMBALANCE',

  // ── The distribution engine (E6; docs/product/prd/08-distribution-engine-spec.md) ────
  /**
   * The waterfall would produce a negative figure, so **no run is emitted at all**.
   *
   * Raised by `computeWaterfall` in two places, deliberately before any beneficiary line exists:
   * when `revenue − ṣiyāna − operating − nazirFee < 0` (§08 invariant I4, "Insufficient revenue"),
   * and when `netIncome < 0` — reserve plus operating cost already exceed revenue — **before** a
   * `PERCENT_OF_NET_INCOME` fee is computed, so a negative base can never yield a negative fee that
   * then "restores" a plausible-looking distributable.
   *
   * Failing here rather than clamping is the point: a capped ṣiyāna reserve would silently
   * understate the founder's stipulated maintenance obligation, and a nil distribution that looks
   * defensible is worse than a refusal that forces a human decision.
   * (§08 I4; CLAUDE.md binding rule 1 — non-diminution of corpus.)
   */
  'DISTRIBUTION_NEGATIVE',
  /**
   * The distribution input does not satisfy the §08 contract.
   *
   * `parseDistributionInput` converts the `ZodError` into this so a raw `ZodError` never escapes a
   * pure engine whose callers switch on `DomainError.code`; `assertInputConsistency` also raises it
   * for a mismatched `asOf` dual date (which means a second Umm al-Qura implementation is in play),
   * a duplicate `beneficiaryId` or `receipt.id`, and `period.start > period.end`.
   */
  'DISTRIBUTION_INPUT_INVALID',
  /**
   * An engine invariant (§08 I1–I9, the corpus invariant I-C1, or ADR-0009's per-capita invariant
   * I-L1) does not hold on an assembled run.
   *
   * §08 says an invariant breach "throws a typed DomainError" but names no code. `ALLOCATION_IMBALANCE`
   * covers only the allocator's own Σ check inside `money.ts`; a breach detected in `invariants.ts`
   * needs its own code so **a bug in the engine is distinguishable from bad data**. This is never
   * expected: reaching it means a partial or self-inconsistent run was about to be emitted, and the
   * engine refuses instead.
   */
  'DISTRIBUTION_INVARIANT_BREACH',

  // ── Authorization algebra (E2; docs/product/prd/10-roles-access-matrix-spec.md) ──────
  /**
   * A permission string is not a well-formed, **registered** `module:resource:verb` triple.
   *
   * Raised for a malformed string, an unknown module/resource/verb, and — deliberately — for
   * every wildcard form (`*`, `approval:*`, `approval:request:*`). A wildcard in a
   * string-based permission model is how a least-privilege matrix quietly becomes root, so
   * the registry is CLOSED and a typo (`aprove`) DENIES rather than matching loosely.
   */
  'PERMISSION_INVALID',
  /**
   * A role key is not one of the thirteen (§10.2, ADR-0004). Fails closed: an unrecognised
   * role resolves to **no permissions at all**, never to a default set.
   */
  'ROLE_UNKNOWN',
  /**
   * A requested permission set exceeds its ceiling — a grant carrying a permission outside
   * its role preset, or a delegation scope that is not a subset of the delegator's own
   * active permissions. §10 principle 3: a custom grant "may narrow (never silently widen)".
   */
  'PERMISSION_ESCALATION',
  /**
   * An `approve`/`sign` verb appeared in a delegation scope. Rejected **even when the
   * delegator legitimately holds it** — §10 §8: "sign on reserved matters and final approve
   * are excluded from any delegatable scope". Accountability is non-delegable: a delegate may
   * `initiate` a reserved matter; only the Nazir signs it (BR-105).
   */
  'DELEGATION_NOT_DELEGABLE',

  // ── Endowment records, deed terms & reserved matters (E3; BR-103/109/306/1102) ───────
  /**
   * The proposed **Nazir (ناظر)** or **authorized representative** does not satisfy BR-109 / NFR-09, so
   * the seat is refused **before any write**. Never overridable in-app (BR-109's own error row).
   *
   * **One code, many criteria — the criteria are in `details.reasons`**, drawn from the closed
   * `ELIGIBILITY_REASON_CODES` vocabulary in `eligibility/contract.ts`. Same reasoning as
   * `SHART_INCOMPLETE`: a Nazir reads one sentence ("this appointment cannot be recorded, because…")
   * and the criteria are the detail behind it, so promoting six criteria to six codes would need six
   * `errors.domain.*` messages for one meaning and would push the eligibility vocabulary onto every
   * package that consumes {@link DomainErrorCode}.
   *
   * ⚠ Every criterion is **UNVERIFIED** against primary Saudi law (binding rule 3) — the KSA-residency
   * block especially, which rests on Beneficial Ownership Standards Art. 8(1) as summarised in `docs/`.
   * `details.unverifiedNotes` carries the marker so a refusal cannot be quoted as settled law.
   *
   * ⚠ **No PII in `details`.** An eligibility refusal concerns a named individual's religion, legal
   * capacity and criminal record; the resolver never takes a name, and nothing may add one here.
   */
  'NAZIR_INELIGIBLE',
  /**
   * A **deed term** that is already recorded was written again — the continuation stipulation
   * (شرط الواقف's ẓuhūr/buṭūn term) or the مآل الوقف reversion clause.
   *
   * These are the founder's conditions living in plain columns, so they are **write-once**: `NULL → value`
   * is permitted once and `value → anything` (including back to `NULL`) is refused by the tier-3 branch of
   * `qmulate_shart_guard()` with SQLSTATE 42501. This is the app-level name for that refusal.
   *
   * The remedy is never an edit. A change to a founder's condition is a **superseding instrument recorded
   * as a NEW record** (ADR-0006, CLAUDE.md binding rule 1) — the table's purpose is to be the record of
   * what the founder instructed, and an amendable record of an unamendable instruction is not one.
   */
  'DEED_TERM_WRITE_ONCE',
  /**
   * An act that is a **reserved matter** was attempted without an `APPROVED` reserved-matter approval for
   * *that* subject — asset disposal or **istibdal (استبدال)**, a pledge, a long lease, deed/certificate
   * identity, or an access-matrix change on a live endowment (BR-306, BR-1102).
   *
   * The database refuses the same act with SQLSTATE 42501 whether or not this code is ever raised; the
   * app-layer refusal exists so a caller gets a typed answer rather than a raw driver error, and the
   * database stays the thing that actually enforces it (defence in depth, not delegation).
   *
   * ⚠ Approval is the **Nazir's alone** (ADR-0005), there is no standing `APPROVER` role (ADR-0004), and
   * an approval for one subject is not a key for another. Istibdal proceeds are **corpus (asl / أصل)**:
   * recording the reserved act writes no receipt and creates no `Transaction` (binding rule 1).
   */
  'RESERVED_MATTER_REQUIRED',

  // ── Configuration ───────────────────────────────────────────────────────────────────
  /**
   * A required `Setting` was not supplied to a pure engine. Regulatory figures (fee basis,
   * classification bands, deadline windows, retention period) are configuration, never
   * constants — an engine refuses to substitute a default for a missing one.
   */
  'SETTING_MISSING',
  /**
   * A `Setting` row exists but its stored value does not satisfy that key's schema — a
   * malformed envelope, a value of the wrong shape, a missing "⚠ unverified" marker on an
   * unverified figure, or an enum value (e.g. a rounding method) the engine does not
   * implement. An engine refuses to guess what a mis-typed regulatory figure meant.
   */
  'SETTING_INVALID',
  /** A business-day computation was requested without an authoritative KSA holiday calendar. */
  'CALENDAR_UNAVAILABLE',

  // ── Deadline engine (E8/S9; docs/product/prd/09-compliance-deadline-engine-spec.md §B) ────
  /**
   * A due-date computation was requested for a binding that is **not a computable clock**.
   *
   * **One code, several bindings — the binding is in `details.refusal`**, drawn from the closed
   * `NON_CLOCK_REFUSALS` vocabulary in `deadlines/rules.ts` (same one-code-many-conditions shape as
   * `SHART_INCOMPLETE` / `NAZIR_INELIGIBLE`, for the same reason). The three ways to reach it:
   * `RETENTION_10Y` is a **floor governing deletion**, enforced by the retention policy, not a due
   * date the reminder loop may compute (§09's own words); `AML_IMMEDIATE` is an event obligation
   * whose SLA is same-day, **not** a business-day clock — and computing one would put an
   * AML-attributable date into the general deadline plane, which G-6 forbids; and an unknown rule
   * key resolves to nothing rather than to something plausible.
   */
  'DEADLINE_RULE_NOT_A_CLOCK',
  /**
   * A deadline's recorded facts contradict each other — e.g. it is marked both met and waived, or
   * its pre-alert offsets are not positive whole business-day counts. The state derivation refuses
   * to rank contradictory facts: a deadline that reads as simultaneously satisfied and excused is
   * one whose escalation nobody can defend later (same shape as `RECEIPT_CLASS_INCOHERENT`).
   */
  'DEADLINE_STATE_INCOHERENT',
  /**
   * §09's "clock starts on" fact could not be established, so no due date was computed.
   *
   * **One code, five conditions — the condition is in `details.refusal`**, drawn from the closed
   * `ANCHOR_ROUTING_REFUSALS` vocabulary in `deadlines/anchors.ts` (the `SHART_INCOMPLETE` shape,
   * for the `SHART_INCOMPLETE` reason: one user-facing meaning, several distinguishable causes
   * with DIFFERENT remedies). The remedies are what make the discriminators non-interchangeable:
   * `ANCHOR_HAS_NO_RECORDED_HOME` needs a COLUMN (`REGISTER_30BD`'s documentation date,
   * `ISTIBDAL_10BD`'s completion date); `ANCHOR_HOME_IS_WRONG_SCOPE` needs a MODEL (the only
   * `licenseExpiry` in the schema is a subcontractor's, on a table that is deliberately not
   * waqf-scoped); `ANCHOR_SOURCE_VALUE_ABSENT` needs somebody to record the fact.
   *
   * ⚠ It never resolves to a substitute date. A due date computed from an invented anchor is
   * indistinguishable, on every screen and every filing, from one computed from a fact — which is
   * why "reasonable default" is the defect this code exists to make loud (the S9-1 M4 lesson).
   */
  'DEADLINE_ANCHOR_NOT_DERIVABLE',

  // ── Financial core / reconciliation (E5) ────────────────────────────────────────────
  /**
   * A reconciliation run was given rows belonging to more than one endowment or bank account.
   *
   * ⚠ THE DOMAIN-LAYER MIRROR OF G-2, AND NOT REDUNDANT WITH MIGRATION 19. The database makes a
   * cross-endowment *row* unrepresentable; this refuses a cross-endowment *run* — a caller whose
   * `where` clause was wrong, or that reconciles two accounts as one. A reconciliation is the one
   * place where mixing two endowments' movements looks like ordinary arithmetic and produces a
   * plausible total, which is why it halts instead of reporting (BR-501 / KPI 2).
   */
  'RECONCILIATION_SCOPE_MIXED',
  /**
   * A ledger row's receipt classification contradicts its direction: a `REVENUE` entry with no
   * class, or an `EXPENSE` carrying one. ADR-0002's shape, asserted rather than assumed.
   *
   * The engine halts rather than deciding what the row is — that is the classification question,
   * and it is the product owner's and the Sharia review's, not a reconciliation's.
   */
  'RECEIPT_CLASS_INCOHERENT',

  // ── Calendar / date conversion (E2) ─────────────────────────────────────────────────
  /** A date input is not a parseable calendar date (or is not a real day in its calendar). */
  'DATE_INVALID',
  /**
   * A conversion was requested outside the supported Umm al-Qura range. Conversions **throw
   * rather than extrapolate** — ICU will silently answer for year 1500 AH, and a confidently
   * wrong Hijri date on a filed statutory statement is worse than no answer.
   */
  'DATE_OUT_OF_RANGE',
] as const;

/** A stable machine code identifying a domain failure. */
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** Structured, non-PII context attached to a domain error. Never put beneficiary PII in here. */
export type DomainErrorDetails = Readonly<Record<string, unknown>>;

export interface DomainErrorOptions {
  /** Structured context for logs, the audit trail, and the computation trace. No PII. */
  readonly details?: DomainErrorDetails;
}

/** Wire/persistence form of a domain error — what a computation trace or audit payload stores. */
export interface SerializedDomainError {
  readonly code: DomainErrorCode;
  readonly messageKey: string;
  readonly message: string;
  readonly details?: DomainErrorDetails;
}

/**
 * Base class for every error the pure domain engines throw.
 *
 * `message` is a developer-facing English string for logs and stack traces. It is **not**
 * user-facing copy — surfaces render `messageKey` through `@qmulate/i18n`.
 */
export class DomainError extends Error {
  /** Stable machine code. Safe to switch on, safe to persist, safe to send over the wire. */
  readonly code: DomainErrorCode;

  /** i18n lookup key for the user-facing ar/en message: `errors.domain.<CODE>`. */
  readonly messageKey: string;

  /** Structured, non-PII context. */
  readonly details?: DomainErrorDetails;

  constructor(code: DomainErrorCode, message: string, options: DomainErrorOptions = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.messageKey = `errors.domain.${code}`;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    // Keep `instanceof` working when the output is transpiled down.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Serializable form — what goes into a computation trace or an audit event payload. */
  toJSON(): SerializedDomainError {
    return {
      code: this.code,
      messageKey: this.messageKey,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/** Type guard for `DomainError`, including any code-specific subclass. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/** Narrow a caught value to a specific domain code. */
export function hasDomainCode(value: unknown, code: DomainErrorCode): value is DomainError {
  return isDomainError(value) && value.code === code;
}

/**
 * The engine halts rather than guessing the founder's intent.
 *
 * Throw this the moment entitlement or shares cannot be resolved from the recorded conditions.
 * Do not fall back to a default split, an equal split, or the previous period's allocation.
 *
 * ⚠ **Every call site must put a `refusal` key in `details`**, drawn from `SHART_REFUSALS` in
 * `distribution/contract.ts` — that is what tells a caller, an operator and a test *which* condition
 * halted the run, since the `code` is the same for all of them (ADR-0009). It is a convention rather
 * than a typed parameter because `errors.ts` is imported **by** the engines and must never import
 * back from one; the constraint is carried by the distribution suite instead, which asserts that
 * every refusal it can provoke arrives with a recognised discriminator.
 */
export function shartIncomplete(reason: string, details?: DomainErrorDetails): DomainError {
  return new DomainError(
    'SHART_INCOMPLETE',
    `Shart al-Waqif is incomplete or unrecognised: ${reason}. The engine halts; it does not infer the waqif's intent.`,
    details !== undefined ? { details } : {},
  );
}

/** A capital receipt tried to enter the distribution waterfall. Corpus is never distributed. */
export function corpusNotDistributable(reason: string, details?: DomainErrorDetails): DomainError {
  return new DomainError(
    'CORPUS_NOT_DISTRIBUTABLE',
    `Capital (asl) receipt blocked from distribution: ${reason}. Sale and istibdal proceeds remain corpus.`,
    details !== undefined ? { details } : {},
  );
}

/**
 * A receipt reached an income/capital-sensitive path without a usable classification.
 *
 * The sibling of {@link corpusNotDistributable} on the *provenance* side of the corpus guard
 * (D1 / binding rule 1): raised when a receipt's class is not exactly `INCOME` or `CAPITAL`, when a
 * `CAPITAL` receipt names no `capitalSource` (or an `INCOME` one does), or when the caller declares
 * distributable income it cannot evidence with classified receipts. A caller that cannot show the
 * classification is REFUSED, never trusted — a bare revenue total is indistinguishable from sale or
 * istibdal proceeds.
 */
export function receiptUnclassified(reason: string, details?: DomainErrorDetails): DomainError {
  return new DomainError(
    'RECEIPT_UNCLASSIFIED',
    `Receipt classification is missing or unrecognised: ${reason}. Every receipt is classified income-vs-capital at entry; the engine refuses rather than assuming income.`,
    details !== undefined ? { details } : {},
  );
}

/**
 * The distribution waterfall would go negative, so no run is emitted.
 *
 * Always thrown at the point of computation, before any beneficiary line exists — a partially
 * assembled run is never returned, and never persisted.
 */
export function distributionNegative(reason: string, details?: DomainErrorDetails): DomainError {
  return new DomainError(
    'DISTRIBUTION_NEGATIVE',
    `Distribution waterfall would be negative: ${reason}. No run is emitted — the engine refuses rather than clamping a stipulated deduction into a plausible-looking nil distribution.`,
    details !== undefined ? { details } : {},
  );
}

/**
 * An engine invariant does not hold on an assembled run — i.e. a bug in the engine, not bad data.
 *
 * `invariantId` is `'I1'`…`'I9'`, `'I-C1'` (the corpus invariant) or `'I-L1'` (ADR-0009's per-capita
 * equality claim, the only load-bearing proof that per capita was applied). It is carried in both
 * the message and `details` so a failing CI line names the invariant without a debugger.
 * Typed as `string` rather than importing the distribution vocabulary: `errors.ts` is imported BY
 * the engine and must not import back from it.
 */
export function distributionInvariantBreach(
  invariantId: string,
  reason: string,
  details?: DomainErrorDetails,
): DomainError {
  return new DomainError(
    'DISTRIBUTION_INVARIANT_BREACH',
    `Distribution invariant ${invariantId} does not hold: ${reason}. This is an engine defect, not a data problem — refusing to emit the run.`,
    { details: { invariantId, ...(details ?? {}) } },
  );
}

/**
 * A required `Setting` was not supplied.
 *
 * Regulatory figures are configuration, not constants — an engine must never invent one.
 * ⚠ unverified — every such figure must be confirmed vs primary Saudi law before real data.
 */
export function settingMissing(settingKey: string, details?: DomainErrorDetails): DomainError {
  return new DomainError(
    'SETTING_MISSING',
    `Required setting "${settingKey}" was not supplied. Regulatory figures are configuration, never hardcoded defaults.`,
    details !== undefined ? { details } : {},
  );
}
