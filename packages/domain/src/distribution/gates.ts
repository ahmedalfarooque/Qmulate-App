/**
 * `distribution/gates.ts` — Stage 3 of the distribution engine: **who is PAYABLE now** (PRD §08).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A gate answers "may this entitled share move *this period*", never "how much is owed". Stage 2
 * (`./resolver.ts`) has already decided entitlement; a gate only stamps a `status` on the line and
 * hands the caller a reason. **A withheld share is retained in the waqf's own account and is never
 * reallocated to anybody else** — you do not give away a beneficiary's ghallah (غلة) because their
 * paperwork is late. That is §08 invariant **I6** (withhold-never-reallocates), and it is the
 * invariant an adversary will attack hardest.
 *
 * I6 is enforced **structurally, at the type level**, which is stronger than any runtime check:
 *
 *   · **No `Minor` appears anywhere in this module** — not in a signature, not in a local, not in
 *     an import. A gate is handed one `BeneficiaryInput`, the `asOf` civil date and an integer
 *     month count; it therefore *cannot* read, produce or perturb an amount.
 *   · That is also why `evaluateGates` takes `kycRefreshMonths: number` and **not the whole
 *     `PolicyInput`**: `policy.roundingUnitMinor` is a `Minor`, so accepting `policy` would put
 *     money in this module's signature and dissolve the proof.
 *   · **Code-review rule:** if `Minor` (or `PolicyInput`, or `Waterfall`, or `DistributionLine`)
 *     ever appears in a `gates.ts` signature, I6 has stopped being structural and must be
 *     re-proved by other means. Reject the change instead.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * GATES ARE NOT EXCLUSIONS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `EXCLUDED` is a **stage-2 entitlement** verdict (the deed owes this person nothing this period;
 * their weight leaves the normalisation denominator, and their `entitledMinor` is `0n`). `WITHHELD`
 * and `CROSS_BORDER_PENDING` are **stage-3 payability** verdicts (the deed owes them in full; the
 * money simply cannot move yet). §08's "excluded ≠ withheld".
 *
 * Consequences the caller must honour:
 *
 *   1. `evaluateGates` is called **only for the entitled cohort**. An `EXCLUDED` line carries
 *      `gateFlags: []` and its stage-2 `ExclusionReasonCode` (see worked example A's `ben-002`).
 *      Running gates over an excluded line would put a payability reason on a line that is not
 *      payable in the first place, and would imply the deed's exclusion was a paperwork problem.
 *   2. Nothing here creates a task, queues a notice, or moves a halala. `STALE_KYC` on a line *is*
 *      the KYC-refresh signal the compliance engine (E7) and the disbursement worker act on, after
 *      the Nazir signs. This engine performs no I/O and pays nobody.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUR GATES, AND WHY CROSS-BORDER IS NOT ONE OF THE BLOCKS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * | gate                    | condition                                                    | status                |
 * |-------------------------|--------------------------------------------------------------|-----------------------|
 * | `CATEGORY_NOT_CAPTURED` | `kind === 'CATEGORY_ONLY'` and `category` blank               | `WITHHELD`            |
 * | `ENTITY_UNLICENSED`     | a `disbursingEntity` that is unlicensed or whose licence lapsed | `WITHHELD`          |
 * | `STALE_KYC`             | verification happened, then aged past the refresh window     | `WITHHELD`            |
 * | `KYC_UNVERIFIED`        | verification never completed (or carries no evidence date)    | `WITHHELD`            |
 * | `CROSS_BORDER_PENDING`  | `residency === 'CROSS_BORDER'`                               | `CROSS_BORDER_PENDING`|
 *
 * Cross-border is a **routing** verdict, not a block: the share is payable, through the approved
 * mechanism, with an Authority notice recorded (BR-511; Nazarah reg. Art. 10(7) — ⚠ verify, may be
 * stale, confirm vs primary law). That is exactly why it sits last in {@link GATE_PRECEDENCE}: a
 * cross-border line whose KYC is stale is `WITHHELD` (KYC stops the payment outright), while a
 * cross-border line with nothing else wrong is `CROSS_BORDER_PENDING`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PRECEDENCE IS DERIVED FROM THE VOCABULARY, NOT RESTATED BESIDE IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * {@link GATE_PRECEDENCE} is computed by ranking `GATE_REASON_CODES` through {@link GATE_RULES},
 * an **exhaustive** `Record<GateReasonCode, …>`. Two drift bugs are therefore impossible rather
 * than merely tested-for:
 *
 *   · A gate reason added to `contract.ts` with no rank is a **compile error** (the record stops
 *     being exhaustive) — it cannot silently fall out of `gateFlags`, which is built by iterating
 *     `GATE_PRECEDENCE`. A dropped flag is lost evidence in a beneficiary's dispute.
 *   · A gate reason cannot be added without deciding whether it blocks or routes, because
 *     `GATE_RULES` demands a `status` for it.
 *
 * `gateFlags` records **every** tripped gate in precedence order; `reasonCode` is the first, i.e.
 * the binding one. `PAID` ⇒ no flag tripped at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE KYC BOUNDARY, STATED ONCE (§08 is silent, so the reading is written down here)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `expiry = kycLastRefreshed + kycRefreshMonths calendar months` (Gregorian, month-end-clamping via
 * `../dates`'s one implementation), and the line is **stale iff `asOf > expiry`** — so a KYC that
 * expires *today* is still **FRESH** today. Rationale, in order:
 *
 *   1. It is what the S3 brief's worked examples pin: `kycLastRefreshed '2025-07-14'` with
 *      `asOf '2026-07-14'` and a 12-month window ⇒ expiry `2026-07-14`, `asOf > expiry` is false
 *      ⇒ FRESH. (Worked example E; also example A — 2026-01-15 + 12mo = 2027-01-15 ⇒ fresh; and
 *      example B — 2025-12-01 + 12mo = 2026-12-01 ⇒ fresh.)
 *   2. It matches {@link isEntityUnlicensed}, where a licence whose `licenceExpiry` equals `asOf`
 *      is still valid. One inclusive reading of "expiry" across both gates beats two.
 *
 * ⚠ **SURFACED, NOT DECIDED (CLAUDE.md binding rule 4).** The S3 task brief's prose asks for the
 * *stricter* reading ("stale at the boundary"), which contradicts the worked examples above. The
 * worked examples win here because they are the authoritative brief and the sibling
 * `worked-examples.test.ts` is written against them — but the difference is one comparison
 * ({@link KYC_EXPIRY_IS_INCLUSIVE}) and it decides whether a family member is paid or blocked on
 * exactly one day per cycle. The product owner should ratify it. Both sides of the boundary, and
 * the day either side, are pinned by tests.
 *
 * ⚠ `kycRefreshMonths` is itself an **unverified figure** — `Setting kyc.refreshIntervalMonths`,
 * seeded 12 — "verify — may be stale (confirm vs primary law)". It is a required parameter with no
 * coded default precisely so a missing row fails closed upstream (`SETTING_MISSING`) instead of
 * producing a confidently wrong verdict here (binding rule 3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `null` MEANS "NEVER VERIFIED", WHICH IS `KYC_UNVERIFIED` — NEVER `STALE_KYC`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `kycLastRefreshed === null` is not a *stale* verification, it is the **absence** of one, and
 * `../errors.ts` already draws that line ("`KYC_UNVERIFIED` … has never been completed — a distinct
 * condition from `STALE_KYC` (verified once, then expired)"). So {@link isKycStale} returns `false`
 * on `null` and {@link isKycUnverified} returns `true` — which is what makes worked examples A and B
 * report `gateFlags: ['KYC_UNVERIFIED']` for `ben-003` / `ben-005` and *not* both KYC codes at once.
 *
 * The same rule closes a hole §08 leaves open: a record claiming `verificationStatus: 'VERIFIED'`
 * with **no** `kycLastRefreshed` has no evidence date, so nothing places the verification inside the
 * window. {@link isKycUnverified} treats it as unverified and the line is withheld. Failing closed on
 * a self-contradictory record is the whole point of a gate; paying against un-dated verification is
 * how an unverified beneficiary gets paid while the field that would have caught it reads "verified".
 */

import { addCalendarMonths, compareCivilDates } from '../dates/index.js';
import type { CivilDate } from '../dates/index.js';
import { DomainError } from '../errors.js';
import { GATE_REASON_CODES } from './contract.js';
import type { BeneficiaryInput, DisbursingEntity, GateReasonCode, LineStatus } from './contract.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The gate table
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The two non-`PAID` statuses a gate can produce. `EXCLUDED` is stage 2's, never a gate's. */
type BlockedStatus = Extract<LineStatus, 'WITHHELD' | 'CROSS_BORDER_PENDING'>;

/**
 * One gate's rank and verdict.
 *
 * `rank` orders {@link GATE_PRECEDENCE} (lower binds first); `status` says whether the gate stops
 * the payment (`WITHHELD`) or merely routes it (`CROSS_BORDER_PENDING`).
 */
interface GateRule {
  readonly rank: number;
  readonly status: BlockedStatus;
}

/**
 * Every gate reason, ranked and classified. **Exhaustive over `GateReasonCode` on purpose** — see
 * the header: a new gate reason cannot reach the vocabulary without a rank and a verdict, so it can
 * never be silently unreported or silently non-blocking.
 *
 * Ranks are distinct, so {@link GATE_PRECEDENCE} does not depend on sort stability.
 */
const GATE_RULES: Readonly<Record<GateReasonCode, GateRule>> = {
  /** No captured category ⇒ there is no identified recipient to pay at all (BR-206). */
  CATEGORY_NOT_CAPTURED: { rank: 0, status: 'WITHHELD' },
  /** An unlicensed counterparty may not receive waqf funds. */
  ENTITY_UNLICENSED: { rank: 1, status: 'WITHHELD' },
  /** Verified once, now expired. Ranked above `KYC_UNVERIFIED` per §08's gate order. */
  STALE_KYC: { rank: 2, status: 'WITHHELD' },
  /** Never verified, or verified with no evidence date. */
  KYC_UNVERIFIED: { rank: 3, status: 'WITHHELD' },
  /** Last, and the only non-blocking gate: a dedicated path, not a refusal (BR-511). */
  CROSS_BORDER_PENDING: { rank: 4, status: 'CROSS_BORDER_PENDING' },
};

/**
 * Gate precedence, most restrictive first:
 * `CATEGORY_NOT_CAPTURED → ENTITY_UNLICENSED → STALE_KYC → KYC_UNVERIFIED → CROSS_BORDER_PENDING`.
 *
 * Derived from `GATE_REASON_CODES` via {@link GATE_RULES} rather than restated, and frozen so an
 * untyped consumer cannot reorder the payability rules of a live endowment. Iterate this constant;
 * never hard-code the order at a call site or in a test.
 */
export const GATE_PRECEDENCE: readonly GateReasonCode[] = Object.freeze(
  [...GATE_REASON_CODES].sort((a, b) => GATE_RULES[a].rank - GATE_RULES[b].rank),
);

/**
 * Whether a KYC window's final day is still inside it (`asOf > expiry` ⇒ stale).
 *
 * A named constant because it is a **product decision, not an implementation detail** — see the
 * header's ⚠ SURFACED note. Flipping it to `false` makes expiry day itself stale.
 */
const KYC_EXPIRY_IS_INCLUSIVE: boolean = true;

/**
 * Developer-facing English for each gate reason — the twin of `DomainError.message`.
 *
 * **Not user-facing copy.** A beneficiary reads the Arabic (authoritative, NFR-01) rendered from
 * the machine `reasonCode`; four of the five codes already have `errors.domain.*` ar/en entries and
 * `KYC_UNVERIFIED` is added by E6. This map exists so `AuthorityNotice.reason` (assembled in
 * `./allocate.ts`) has **one** source for its English text instead of a second hand-written copy.
 * Contains no PII — ids and conditions only.
 */
export const GATE_REASON_TEXT: Readonly<Record<GateReasonCode, string>> = {
  CATEGORY_NOT_CAPTURED:
    'The beneficiary category has not been captured, so no recipient is identified; disbursement is blocked until it is.',
  ENTITY_UNLICENSED:
    'The disbursing entity is not licensed, or its licence has expired as of the run date.',
  STALE_KYC: 'KYC/UBO verification is older than the configured refresh window as of the run date.',
  KYC_UNVERIFIED:
    'KYC/UBO verification has never been completed, or carries no verification date to place it inside the refresh window.',
  CROSS_BORDER_PENDING:
    'A cross-border disbursement is routed through the approved mechanism and recorded to the Authority; the entitlement is unchanged.',
};

/** The developer-facing English for one gate reason. See {@link GATE_REASON_TEXT}. */
export function gateReasonText(code: GateReasonCode): string {
  return GATE_REASON_TEXT[code];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The outcome
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One beneficiary's payability verdict.
 *
 * **No amount, by construction (I6).** `reasonCode` is the binding gate (first in
 * {@link GATE_PRECEDENCE}); `gateFlags` is *every* tripped gate in that same order, because a
 * dropped flag is evidence lost from a dispute. `PAID` ⇒ `reasonCode === null` and `gateFlags` empty.
 */
export interface GateOutcome {
  readonly status: Extract<LineStatus, 'PAID' | 'WITHHELD' | 'CROSS_BORDER_PENDING'>;
  readonly reasonCode: GateReasonCode | null;
  readonly gateFlags: readonly GateReasonCode[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The individual gates
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `CATEGORY_NOT_CAPTURED` — a `CATEGORY_ONLY` placeholder whose category is still blank.
 *
 * Only `CATEGORY_ONLY` lines are gated: a `FAMILY` member or a `CHARITABLE_JIHA` is identified by
 * their own record and needs no category, so a `null` category there is ordinary data, not a block.
 *
 * A **whitespace-only** category counts as blank. That is deliberate hardening, not fussiness: a
 * guard that a single typed space unlocks is a guard an operator can bypass under deadline pressure,
 * and §08's "category empty" plainly means "nobody has said who this is".
 */
export function isCategoryUncaptured(beneficiary: BeneficiaryInput): boolean {
  if (beneficiary.kind !== 'CATEGORY_ONLY') return false;
  const { category } = beneficiary;
  return category === null || category.trim() === '';
}

/**
 * `ENTITY_UNLICENSED` — the legal entity disbursing this line is not a payable counterparty.
 *
 * Three cases, in order:
 *   · no `disbursingEntity` ⇒ **not gated**. The line pays a natural person; there is no licence.
 *   · `licensed === false` ⇒ gated.
 *   · a `licenceExpiry` strictly **before** `asOf` ⇒ gated. Expiry day itself is still valid,
 *     matching the KYC boundary (see the header).
 *
 * ⚠ **SURFACED, NOT DECIDED (binding rule 4).** `licenceExpiry === null` is read here as "no expiry
 * recorded", so the `licensed` flag alone governs and the line may pay. The other reading is
 * fail-closed: an unrecorded expiry is an *unverifiable* licence and should block. That is a
 * question of Saudi licensing practice for counsel — a perpetual licence and a missing data field
 * are indistinguishable in this shape — and it is one line to change here once answered.
 */
export function isEntityUnlicensed(
  entity: DisbursingEntity | null,
  asOfGregorian: CivilDate,
): boolean {
  if (entity === null) return false;
  if (!entity.licensed) return true;
  if (entity.licenceExpiry === null) return false;
  return compareCivilDates(entity.licenceExpiry, asOfGregorian) < 0;
}

/**
 * `KYC_UNVERIFIED` — verification never completed, or completed with no evidence date.
 *
 * Both halves matter (see the header): `verificationStatus !== 'VERIFIED'` covers `PENDING` and
 * `UNVERIFIED`, and a missing `kycLastRefreshed` covers the self-contradictory "verified, but we
 * cannot say when" record that {@link isKycStale} deliberately cannot catch.
 */
export function isKycUnverified(beneficiary: BeneficiaryInput): boolean {
  return beneficiary.verificationStatus !== 'VERIFIED' || beneficiary.kycLastRefreshed === null;
}

/**
 * `STALE_KYC` — a verification that *did* happen has aged past `kycRefreshMonths`.
 *
 * `null` ⇒ `false`: never-verified is {@link isKycUnverified}'s condition, and reporting both codes
 * for one record would give a single condition two reasons whose ar/en copy will diverge.
 *
 * Refuses rather than guesses in two configuration cases, so neither can produce a confident
 * verdict from an unusable window (binding rule 3):
 *   · a non-integer or negative `kycRefreshMonths` — the schema forbids it, but this predicate is
 *     exported and reachable without the schema;
 *   · an expiry outside the representable calendar (an absurd window, or a refresh date near year
 *     9999). `SETTING_INVALID` names `kyc.refreshIntervalMonths` because that is the operand a
 *     caller can fix, and `details` carries both so the real cause is diagnosable. Returning
 *     "fresh" here would honour a 1,000,000-month window as "KYC never expires"; returning "stale"
 *     would block a family on a config typo. Neither is honest, so the engine refuses.
 */
export function isKycStale(
  kycLastRefreshed: CivilDate | null,
  asOfGregorian: CivilDate,
  kycRefreshMonths: number,
): boolean {
  if (kycLastRefreshed === null) return false;

  const expiry = kycExpiryOf(kycLastRefreshed, kycRefreshMonths);
  const comparison = compareCivilDates(asOfGregorian, expiry);
  return KYC_EXPIRY_IS_INCLUSIVE ? comparison > 0 : comparison >= 0;
}

/** `kycLastRefreshed + kycRefreshMonths` calendar months, or a typed refusal. Private on purpose. */
function kycExpiryOf(kycLastRefreshed: CivilDate, kycRefreshMonths: number): CivilDate {
  if (!Number.isInteger(kycRefreshMonths) || kycRefreshMonths < 0) {
    throw new DomainError(
      'SETTING_INVALID',
      `kyc.refreshIntervalMonths is ${String(kycRefreshMonths)}; a KYC refresh window must be a non-negative whole number of calendar months. Refusing rather than rounding a mis-typed regulatory figure.`,
      {
        details: {
          settingKey: 'kyc.refreshIntervalMonths',
          kycRefreshMonths: String(kycRefreshMonths),
        },
      },
    );
  }

  try {
    return addCalendarMonths(kycLastRefreshed, kycRefreshMonths);
  } catch {
    throw new DomainError(
      'SETTING_INVALID',
      `kyc.refreshIntervalMonths of ${String(kycRefreshMonths)} month(s) puts the KYC expiry for a verification dated ${kycLastRefreshed} outside the representable calendar (0000-01-01…9999-12-31). Refusing: a window this long is indistinguishable from "KYC never expires", and honouring it silently would pay against unverified identity.`,
      {
        details: {
          settingKey: 'kyc.refreshIntervalMonths',
          kycRefreshMonths: String(kycRefreshMonths),
          kycLastRefreshed,
        },
      },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The stage
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Stage 3 — classify one **entitled** beneficiary's payability.
 *
 * Pure: the only inputs are the beneficiary record, the injected `asOf` civil date and the resolved
 * refresh window. There is no clock read, no randomness, no I/O, and — the point — no money.
 *
 * Never call this for an `EXCLUDED` line (see the header): stage 2 already decided that line, and a
 * payability reason on it would misrepresent the deed's own exclusion as a paperwork problem.
 */
export function evaluateGates(args: {
  readonly beneficiary: BeneficiaryInput;
  readonly asOfGregorian: CivilDate;
  readonly kycRefreshMonths: number;
}): GateOutcome {
  const { beneficiary, asOfGregorian, kycRefreshMonths } = args;

  // Built by iterating GATE_PRECEDENCE, so the flag order IS the precedence order and no ranked
  // gate can be omitted. Every tripped gate is recorded, not just the binding one.
  const gateFlags: GateReasonCode[] = [];
  for (const code of GATE_PRECEDENCE) {
    if (isGateTripped(code, beneficiary, asOfGregorian, kycRefreshMonths)) {
      gateFlags.push(code);
    }
  }

  const binding = gateFlags[0];
  if (binding === undefined) {
    return { status: 'PAID', reasonCode: null, gateFlags: [] };
  }

  return { status: GATE_RULES[binding].status, reasonCode: binding, gateFlags };
}

/**
 * Dispatch one gate reason to its predicate.
 *
 * The exhaustive `switch` is the second half of the drift proof: a gate reason added to the
 * vocabulary has to be given a predicate here, or the `never` assignment in `default` fails to
 * compile. The runtime `throw` is therefore unreachable, and says so.
 */
function isGateTripped(
  code: GateReasonCode,
  beneficiary: BeneficiaryInput,
  asOfGregorian: CivilDate,
  kycRefreshMonths: number,
): boolean {
  switch (code) {
    case 'CATEGORY_NOT_CAPTURED':
      return isCategoryUncaptured(beneficiary);
    case 'ENTITY_UNLICENSED':
      return isEntityUnlicensed(beneficiary.disbursingEntity, asOfGregorian);
    case 'STALE_KYC':
      return isKycStale(beneficiary.kycLastRefreshed, asOfGregorian, kycRefreshMonths);
    case 'KYC_UNVERIFIED':
      return isKycUnverified(beneficiary);
    // Trivial enough to inline, and inlining keeps the `switch` the single place a reason code is
    // mapped to a condition. Residency is stated by the caller — never defaulted (contract).
    case 'CROSS_BORDER_PENDING':
      return beneficiary.residency === 'CROSS_BORDER';
    default: {
      const unhandled: never = code;
      throw new DomainError(
        'DISTRIBUTION_INVARIANT_BREACH',
        `Gate reason ${String(unhandled)} is ranked in GATE_RULES but has no predicate. An unevaluated gate would silently pay a line it should have stopped, so the engine refuses.`,
        { details: { invariantId: 'I6', gateReasonCode: String(unhandled) } },
      );
    }
  }
}
