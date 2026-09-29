/**
 * `distribution/resolver.ts` — Stage 2: who is ENTITLED (PRD §08 stage 2, rewritten by ADR-0009).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE DISTINCTION THIS MODULE EXISTS TO KEEP
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **Entitlement** (who is *owed*, from the Shart al-Waqif / شرط الواقف) and **payability** (who may
 * be *paid now*, from the compliance gates) are different questions with different rules, different
 * evidence, and different consequences. This module answers ONLY the first.
 *
 * Concretely, and reviewably: the resolver reads exactly nine fields of a beneficiary —
 * `id`, `kind`, `active`, `tabaqa`, `parentId`, `lineageLink`, `line`, `branch`,
 * `stipulatedWeight` — three of which (`active`, `lineageLink`, `parentId`) it also reads on that
 * beneficiary's **ancestors**, because R-FRONTIER's eligibility test is a fact about the line rather
 * than about the person alone. It reads NONE of `verificationStatus`, `kycLastRefreshed`, `category`,
 * `residency`, `disbursingEntity`, `bankingRefForProceeds` — those are Stage 3's (`./gates.ts`), and
 * a resolver that consulted one of them would be silently converting a compliance block into a loss
 * of entitlement. A test drives that claim rather than asserting it: flipping every payability field
 * on every beneficiary leaves this module's verdict byte-identical.
 *
 * **Excluded ≠ withheld** (§08's own phrase, and the distinction the family will read on the
 * statement):
 *
 *   · An **exclusion** here removes a beneficiary from the entitled cohort *entirely*. They are owed
 *     nothing for this period and their weight is **not** in the normalisation denominator.
 *   · A **withhold** in Stage 3 keeps them IN the cohort with their **full** entitled amount, which
 *     is then retained unpaid until the block clears. Their money is theirs; it just cannot move.
 *
 * ⚠ ADR-0009 makes this distinction *sharper*, not softer. The commonest exclusions are no longer
 * "your generation waits" but **"your line does not continue under this deed"**
 * (`BUTUN_LINE_NOT_CONTINUED`) and **"your father is alive and holds it"**
 * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) — statements about a family member's own household that
 * they are far more likely to dispute than a tier wait. So the basis records the whole walk (which
 * parent edge, which fiqh link, which deed term) and the trace names the exact ancestor, not merely
 * the outcome.
 *
 * Conflating exclusion with withholding is not a cosmetic defect: it silently redistributes one
 * family member's entitlement to the others (the exact thing invariant I6 forbids). The type system
 * is enlisted — **no `Minor` appears anywhere in this module's signatures**, so this stage *cannot*
 * touch an amount. That is half of I6's structural proof (`./gates.ts` is the other half).
 *
 * ⚠ **CODE-REVIEW RULE (I6, and it is now easier to break than it was).** If `Minor` — or `Decimal`,
 * or `Number(...)`, or any arithmetic on a weight — appears in this module, I6 has stopped being
 * structural. The lineage graph below is the largest addition this file has ever taken and the
 * per-capita flag ({@link canonicalWeight}) is the first thing in it that *looks* numeric: it is a
 * **string-only** canonicaliser, on the same precedent as {@link isZeroWeight}'s regex, and it must
 * stay one. Comparing two weights for equality never requires arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ENTITLEMENT SITS AT THE LIVING FRONTIER OF EACH LINE (ADR-0009 R1/R2, AS CORRECTED BY R-FRONTIER)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Product-owner decisions of 2026-08-02/03, taken by a practising Nazir. The pre-ADR-0009 resolver
 * keyed *everything* on `tabaqa`; that is now the exception rather than the rule.
 *
 * ⚠ **R-FRONTIER — THE CORRECTION OF 2026-08-03, AND WHY THIS SECTION WAS REWRITTEN.** ADR-0009 as
 * the orchestrator worded it said *"every living descendant of the waqif is eligible"*, and this
 * module faithfully implemented that: it walked the parent chain for the ẓuhūr filter and never read
 * an ancestor's `active` at all. The owner corrected the wording in one sentence — *"son A's child
 * does not get since Son A is alive. Son A's child only gets anything if son A is dead."* — which
 * matches their original narrative, where continuation is **triggered by the ancestor's death**. The
 * bug was in the translation, not the rule.
 *
 * **The test, in full.** Under `LINEAGE_CONTINUATION` a beneficiary **b** is entitled iff:
 *
 *   1. `b.active === true`; **and**
 *   2. **every ancestor strictly between b and the waqif is DECEASED** — a living ancestor holds the
 *      entitlement and their descendants wait (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`); **and**
 *   3. under `ZUHUR_ONLY` only: every ancestor strictly between b and the waqif is a `SON`.
 *
 * `b`'s **own** `lineageLink` is never read — an eligible line may end in a son or a daughter. That
 * half of ADR-0009 was right and is unchanged.
 *
 * · **A generation's death does not block the next generation — it is what RELEASES it.** So a dead
 *   ancestor is walked *through* and there is still deliberately **no exclusion code for "my parent
 *   died"**. The code that exists is its opposite: "my parent is alive". Both facts come from the
 *   same `active` field, read on the ancestors as well as on the beneficiary.
 * · **`tabaqa` is DERIVED from graph depth and cross-checked**, never trusted. A supplied value that
 *   disagrees halts (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) — two sides that must agree, each testing the
 *   other, because a single trusted side is how S3-D1 (an untiered `FAMILY` member escaping the tier
 *   test) shipped. ⚠ The derived depth is **not** the eligibility key: the frontier is a property of
 *   one *line*, not of a tier, so two entitled members can sit at different depths and two members at
 *   the same depth can differ.
 * · **The continuation stipulation is a closed two-value deed term** and it decides what the recorded
 *   `lineageLink` *means*. It is an **additional** filter on top of the frontier test, never a
 *   replacement for it:
 *     · `ZUHUR_AND_BUTUN` — no line filter at all; the frontier test alone decides.
 *     · `ZUHUR_ONLY` — additionally requires that **every ancestor STRICTLY BETWEEN the waqif and the
 *       person is a `SON`**. The person themself may be a son or a daughter: a waqif's daughter is
 *       eligible (no intermediate ancestors), her son is not, a son's daughter is, a son's daughter's
 *       son is not.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ARITHMETIC IS PER CAPITA (R3) — AND THE DEED'S OWN FIGURE IS NOT SILENTLY DROPPED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Everyone on the entitled cohort — i.e. every living head of a continuing line, per R-FRONTIER —
 * shares the distributable **equally per head**, recomputed each period. A deceased member's share
 * does NOT pass down their branch as a block, so once two brothers are both dead, a branch with six
 * eligible children collectively receives six times what a branch with one eligible child receives.
 * The owner chose this explicitly over per-stirpes, having been shown that exact consequence.
 *
 * ⚠ The arithmetic is **unchanged** by R-FRONTIER; only the cohort it runs over is. The measured
 * example that prompted the correction — two sons and one son's child, all living — moves from
 * `26,000,000 / 26,000,000 / 26,000,000` to the two sons taking half each and the child taking
 * nothing.
 *
 * The consequence for this module: on a lineage cohort a family beneficiary's deed
 * `stipulatedWeight` is **NOT USED**. It is not discarded either — the effective weight becomes
 * {@link PER_CAPITA_WEIGHT}, the deed's figure survives untouched on
 * {@link ResolvedBeneficiary.source}, every affected member gets a `STIPULATED_WEIGHT_NOT_APPLIED`
 * trace step, and the run raises `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA`. A recorded Shart figure
 * that vanishes without trace is the defect class this project keeps paying for.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUR ORDERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · **LINEAGE_CONTINUATION** (ẓuhūr wa buṭūn / ظهور وبطون): the deed shape the product treats as
 *   NORMAL. The living frontier of each line (R-FRONTIER) + per capita, filtered by the continuation
 *   stipulation.
 * · **ORDERED** (al-aʿlā fa-l-aʿlā / الأعلى فالأعلى, waqf murattab): the **explicitly stipulated
 *   exception** (R4), preserved verbatim in behaviour. The lowest-numbered ṭabaqa holding at least
 *   one living member is the entitled cohort; tiers above it in number wait (`UPPER_TABAQA_EXTANT`),
 *   tiers below it are wholly extinct (`TABAQA_EXTINCT`). Deed weights ARE applied.
 * · **SHARED** (tashrik / تشريك): every living tier shares together; no tier excludes another; no
 *   ẓuhūr/buṭūn filter; deed weights ARE applied. Deliberately **not** collapsed into lineage.
 * · **NA_DIRECT_USE** (intifāʿ mubāshir / انتفاع مباشر): a short-circuit. The beneficiaries benefit
 *   from the asset itself, so there is no cohort and no monetary line at all (invariant I7).
 *
 * A **JOINT** waqf is no longer a mode — it is a **refused input** (R5, {@link assertSingleWaqfNature}).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE NEVER GUESSES THE FOUNDER'S INTENT (CLAUDE.md binding rule 1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `entitlementOrder`, `continuationStipulation` and `beneficiaries[].lineageLink` all arrive as
 * `z.string()` precisely so an unrecognised value reaches its parser HERE as DATA and halts with
 * `SHART_INCOMPLETE` — not as a zod shape error, which would carry the wrong code. The refusal is a
 * **feature**: it never falls back to an equal split, never reuses the previous period's allocation,
 * never lower-cases or trims the value hoping to match (`'ordered'`, `' ORDERED '` and `'zuhur_only'`
 * all halt — normalising a deed's free text is `packages/database/src/seed/map.ts`'s job, and doing
 * it here would make the engine the place where a mis-transcribed condition becomes a payout).
 *
 * Every such halt carries a `SHART_REFUSALS` discriminator in `details.refusal`, because the thrown
 * *code* is the same for all **twenty-six** of them and a caller, an operator and a test each need to
 * know which condition refused. Never assert a bare `SHART_INCOMPLETE`: R7 moved three refusals, and a
 * test that only checked the code would have silently stopped proving anything.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف — THE ULTIMATE TAKER (product owner, 2026-08-10)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A وقف ذري may name a charity as its **ultimate taker**: *"a waqf ذري may eventually … end up at a
 * charity once ALL descendants are dead and the bloodline is over."* Four consequences for this module,
 * and the first is the one that keeps R5 intact:
 *
 *  · **The charity NEVER shares a period with the bloodline.** A recorded taker is EXCLUDED by default
 *    (`REVERSION_PENDING_LIVING_BLOODLINE`) and becomes entitled only when the reversion triggers. So the
 *    endowment is ذري while the family lives, and nothing is ever both خيري and ذري *at once* — R5 is
 *    narrowed, not weakened. Invariant `I-R1` turns that into a runtime assertion over every run: **a
 *    charity is never paid a halala in the same run as any descendant.**
 *  · **The appointment is a RECORDED DEED FACT** (`input.reversion`), never inferred from a charity being
 *    the only beneficiary left or from a jiha being present (R7-c). Absent or unreadable ⇒ halt.
 *  · **The trigger is NO CONTINUING LINE** (R7-d, product owner **2026-08-11**, answering the question
 *    this header used to carry as open): *"bloodline is over means no continuing line."* Measured over
 *    the graph {@link buildLineage} certified, one shared ancestor walk per recorded descendant
 *    ({@link continuesTheLine}) — so under `ZUHUR_ONLY` a survivor on a broken daughter line does **not**
 *    hold the reversion, while under `ZUHUR_AND_BUTUN` the test collapses to the STRICT reading this
 *    module shipped with. ✓ **ON EVERY ORDER since memo Q5 (product owner, 2026-08-17)**: the
 *    continuation stipulation, not the entitlement order, defines whose line counts, so `ORDERED` and
 *    `SHARED` deeds no longer wait for the last living descendant of a line their own term abandoned.
 *    Living-on-a-continuing-line-but-nobody-entitled still retains the pool and says so, and a register
 *    of unenumerated placeholders still holds the reversion regardless (R7-D1, owner-confirmed).
 *  · **Per capita does not apply to a charity** (R7-e): a taker takes its DEED weight, several takers
 *    split by their recorded weights, and an all-zero vector is refused rather than split equally.
 *
 * ⚠ Three refusals became CONDITIONAL and none was deleted — `CHARITABLE_JIHA_ON_FAMILY_WAQF`,
 * `COHORT_MIXES_CHARITABLE_AND_FAMILY`, and `LINEAGE_ORDER_ON_CHARITABLE_WAQF`'s **jiha arm only**. See
 * {@link assertSingleWaqfNature}. And a guard came back to life: {@link assertJihaNotTiered} has a
 * reachable subject again, so any note calling it unreachable is now false.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NORMALISATION HAPPENS DOWNSTREAM, EXACTLY — AND THAT IS DELIBERATE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 describes `fraction_i = weight_i / Σ(entitled weights)`. This module does **not** compute that
 * quotient, because `1/3` has no exact decimal form and any fraction it emitted would already be
 * rounded before a halala was allocated. It instead publishes the **effective weight vector** as
 * verbatim decimal strings, and `./allocate.ts` normalises by scaling the weights to integers and
 * dividing in `bigint` (`largestRemainderAllocate`) — exact, with no float anywhere on the path.
 *
 * That is also why per capita needed **no arithmetic change at all**: it is expressed entirely as a
 * weight vector of `'1'`s, so the bigint Hamilton allocator, the residual bound, the conservation
 * identities and the corpus segregation are untouched. The entitlement model changed and not one
 * halala of arithmetic moved.
 *
 * {@link ResolvedBeneficiary.stipulatedWeight} is therefore the *effective* weight: `'0'` for an
 * excluded member (so a consumer which forgets to filter on `entitled` still gets the right
 * denominator), `'1'` for an eligible member of a lineage cohort, and the deed's own figure for an
 * entitled member under `ORDERED`/`SHARED`. This is the concrete guard against the failure the
 * fixture audit names: waqf-001's three `12.5` weights summing to 37.5, paying out 37.5% of
 * distributable because an excluded member stayed in the divisor.
 */

import { shartIncomplete } from '../errors.js';
import {
  CONTINUATION_STIPULATIONS,
  ENTITLEMENT_ORDERS,
  LINEAGE_LINKS,
  REVERSION_KINDS,
  compareBeneficiaryIds,
  type BeneficiaryInput,
  type ContinuationStipulation,
  type DistributionInput,
  type EntitlementOrder,
  type EntitlementRule,
  type ExclusionReasonCode,
  type LineBasis,
  type LineageLink,
  type RunFlag,
  type TraceStep,
  type WaqfType,
} from './contract.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Output shapes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One beneficiary's entitlement verdict.
 *
 * No `Minor`, by design (I6): a verdict about *who is owed* cannot carry an amount.
 */
export interface ResolvedBeneficiary {
  readonly beneficiaryId: string;
  /** In the entitled cohort for this period. `false` ⇒ owed nothing, weight out of the denominator. */
  readonly entitled: boolean;
  /**
   * The **effective** weight `./allocate.ts` splits on. Verbatim decimal string — never a JS number,
   * which `largestRemainderAllocate` refuses outright (`MONEY_NUMBER_INPUT`) because a weight
   * multiplies money.
   *
   *  · `'0'` when excluded, on every path.
   *  · `'1'` for every eligible member of a `LINEAGE_CONTINUATION` cohort — **per capita (R3)**. The
   *    deed's own figure survives untouched on {@link ResolvedBeneficiary.source} and is named in the
   *    trace; it is not applied and the run says so.
   *  · the deed's figure when entitled under `ORDERED` or `SHARED`.
   */
  readonly stipulatedWeight: string;
  /** Why the deed owes them nothing this period, or `null` when they are entitled. */
  readonly exclusionReason: ExclusionReasonCode | null;
  /** The entitlement basis printed on the beneficiary's official Arabic statement (BR-505). */
  readonly basis: LineBasis;
  /** The input record this verdict was reached from. Carried for Stage 3/5; never re-read here. */
  readonly source: BeneficiaryInput;
  /**
   * The **derived** lineage depth (1 = a child of the waqif), or `null` outside the lineage graph.
   *
   * Feeds `basis.lineageDepth` and is the value the supplied `tabaqa` was cross-checked against.
   */
  readonly lineageDepth: number | null;
}

/**
 * Stage 2's whole answer.
 *
 * `resolved` carries **every** input beneficiary — entitled and excluded alike — in ascending
 * `beneficiaryId` order (UTF-16 code units, via `compareBeneficiaryIds`). Two reasons the order is
 * load-bearing rather than tidy: the Hamilton residual tie-break is *defined* as ascending
 * `beneficiaryId` (I9), and the canonical serialization the Nazir's signature covers is only stable
 * if the array order is (I8). `localeCompare` is never used — its ICU-dependent ordering would make
 * a payout host-dependent.
 *
 * The one exception is `NA_DIRECT_USE`, where `resolved` is empty: there is no cohort to report
 * (I7).
 */
export interface EntitlementResolution {
  readonly order: EntitlementOrder;
  readonly rule: EntitlementRule;
  /**
   * The deed's continuation stipulation as narrowed by this stage, or `null` on a path that does not
   * consume one (`ORDERED`, `SHARED`, `NA_DIRECT_USE`). A recorded term on one of those paths is
   * reported instead as the `CONTINUATION_STIPULATION_NOT_APPLIED` flag.
   */
  readonly continuation: ContinuationStipulation | null;
  /**
   * The entitled ṭabaqa under `ORDERED`. `null` under `LINEAGE_CONTINUATION` (the tier is **not** the
   * key — R1), under `SHARED`, under direct use, and when no tier lives.
   */
  readonly entitledTabaqa: number | null;
  readonly resolved: readonly ResolvedBeneficiary[];
  /** Entitled ids, ascending — index-aligned with the weight vector `./allocate.ts` consumes. */
  readonly entitledIds: readonly string[];
  readonly excludedCount: number;
  /**
   * Run flags THIS stage raised, for `./engine.ts` to fold into `result.flags`.
   *
   * Same shape as `WaterfallOutcome.flags` / `TimingOutcome.flags`, and present for the same reason:
   * a Shart term this engine recorded but did not apply must be **visibly** not-applied on the run,
   * not merely mentioned in a trace step nobody reads. Only ever
   * `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA`, `CONTINUATION_STIPULATION_NOT_APPLIED` and — R7 —
   * `REVERSION_TO_ULTIMATE_TAKER_APPLIED` / `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, which are
   * mutually exclusive.
   */
  readonly flags: readonly RunFlag[];
  readonly trace: readonly TraceStep[];
}

/**
 * The waqif's family tree as this run's beneficiary set records it — derived, never supplied.
 *
 * Built by {@link buildLineage}, which refuses rather than repairs every way the graph can be
 * invalid, so a consumer of this index may assume it is acyclic, referentially whole, and rooted at
 * the waqif.
 */
export interface LineageIndex {
  /** id → derived depth (1 = a child of the waqif). **Absent ⇒ not in the lineage graph.** */
  readonly depthById: ReadonlyMap<string, number>;
  /**
   * id → **proper** ancestors, nearest first (parent, grandparent, …, child-of-the-waqif).
   * Excludes the person themself — which is exactly what makes the `ZUHUR_ONLY` test "strictly
   * between the waqif and them".
   */
  readonly ancestorsById: ReadonlyMap<string, readonly string[]>;
  /**
   * id → the narrowed fiqh link, for every graph member.
   *
   * Beyond the briefed shape, and necessary: the `ZUHUR_ONLY` test reads an **ancestor's** link, and
   * re-narrowing `beneficiaries[].lineageLink` at the point of use would mean the same string was
   * parsed twice with two chances to disagree.
   */
  readonly linkById: ReadonlyMap<string, LineageLink>;
  /**
   * id → the member's own `active`, for every graph member.
   *
   * Here because **R-FRONTIER makes vital status a property of the tree**, not only of the person:
   * the entitled cohort is the set of nearest living points on the lines, so walking a chain answers
   * "who holds this line" only if the walk can see each ancestor's `active`. Keeping it beside
   * `linkById` means {@link lineageFrontierVerdict} does a single pass over one index rather than
   * joining the chain back to `input.beneficiaries` at the point of use.
   *
   * ⚠ **This is the ONLY vital status any lineage code reads, and it is read for exactly one
   * purpose.** It is not a payability field (I6) and it must never become one.
   */
  readonly activeById: ReadonlyMap<string, boolean>;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Narrowing the Shart's declared terms
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * How much of an unrecognised condition is echoed back in the error.
 *
 * A deed's free text can be a paragraph; `DomainError.details` is persisted into the audit trail and
 * the computation trace, so the echo is bounded. It is bounded rather than dropped because the whole
 * value of this refusal is telling a human *which* condition they must go and read.
 */
const MAX_ECHOED_SHART_VALUE = 120;

function echoShartValue(value: string): string {
  const characters = Array.from(value);
  if (characters.length <= MAX_ECHOED_SHART_VALUE) return value;
  return `${characters.slice(0, MAX_ECHOED_SHART_VALUE).join('')}…[truncated]`;
}

/**
 * Narrow the Shart's declared entitlement order, or **halt**.
 *
 * Exact match against the closed vocabulary only. No trimming, no case folding, no aliasing — every
 * such convenience is the engine inferring what the waqif meant, which CLAUDE.md binding rule 1
 * forbids outright. Resolution goes to the condition-interpretation path (the living waqif, else the
 * competent authority), never to code.
 *
 * ⚠ `LINEAGE_CONTINUATION` is the *normal* deed shape (R4) but has **no default here and never
 * will**: an absent or unreadable order still halts. "Normal" means "the value a deed that does not
 * stipulate tier-exclusion is recorded as", not "the value code supplies when the record is silent".
 *
 * @throws `DomainError('SHART_INCOMPLETE')` naming the field, the received value and the closed set.
 */
export function parseEntitlementOrder(raw: string): EntitlementOrder {
  if (typeof raw !== 'string') {
    // Reachable only through a loose cast (a JSON body, an `any`-typed row). Refusing beats
    // coercing: `String(undefined)` would make "undefined" look like a recorded condition.
    throw shartIncomplete(
      `entitlementOrder is not a recorded condition — it arrived as ${typeof raw}, not a string`,
      {
        field: 'entitlementOrder',
        refusal: 'ENTITLEMENT_ORDER_UNRECOGNISED',
        receivedType: typeof raw,
      },
    );
  }

  if ((ENTITLEMENT_ORDERS as readonly string[]).includes(raw)) {
    return raw as EntitlementOrder;
  }

  throw shartIncomplete(
    `entitlementOrder "${echoShartValue(raw)}" is not one of the recognised orders (${ENTITLEMENT_ORDERS.join(
      ', ',
    )}). The order of entitlement (lineage continuation vs الأعلى فالأعلى vs tashrik) decides which descendants are owed the ghallah, so the engine halts instead of choosing one`,
    {
      field: 'entitlementOrder',
      refusal: 'ENTITLEMENT_ORDER_UNRECOGNISED',
      received: echoShartValue(raw),
      recognised: [...ENTITLEMENT_ORDERS],
    },
  );
}

/**
 * Narrow the deed's continuation stipulation (ẓuhūr wa buṭūn / ظهور وبطون), or **halt**.
 *
 * A **closed two-value** term with no third value and **no default**: `null`, `''`, `' ZUHUR_ONLY '`
 * and `'zuhur_only'` all halt (R2). Which lines a founder continued is not something code may
 * choose — it decides whether a daughter's children are beneficiaries at all, which is the single
 * most consequential reading in this module.
 *
 * Only called when `entitlementOrder === 'LINEAGE_CONTINUATION'`, which is the one order whose
 * **ENTITLEMENT** path consumes the term. On `ORDERED`/`SHARED` the term is carried, not applied **to
 * eligibility**, and a recorded value raises `CONTINUATION_STIPULATION_NOT_APPLIED` instead of being
 * silently dropped.
 *
 * ⚠ **That is no longer the same thing as "the term is unused on those orders" — memo Q5 (product owner,
 * 2026-08-17).** The reversion trigger consumes the recorded term on **every** order (see
 * {@link recogniseContinuationStipulation} and {@link continuesTheLine}); only *who is entitled among the
 * living* still ignores it outside `LINEAGE_CONTINUATION`.
 *
 * @throws `DomainError('SHART_INCOMPLETE')` / `CONTINUATION_STIPULATION_UNRECOGNISED`.
 */
export function parseContinuationStipulation(raw: string | null): ContinuationStipulation {
  if (raw === null || typeof raw !== 'string') {
    throw shartIncomplete(
      `entitlementOrder LINEAGE_CONTINUATION requires the deed's continuation stipulation (ẓuhūr wa buṭūn), but continuationStipulation is ${raw === null ? 'not recorded' : `a ${typeof raw}`}. Whether a daughter's children continue as beneficiaries is the founder's condition, not a default the engine may pick`,
      {
        field: 'continuationStipulation',
        refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED',
        received: raw === null ? 'null' : `[${typeof raw}]`,
        recognised: [...CONTINUATION_STIPULATIONS],
      },
    );
  }

  if ((CONTINUATION_STIPULATIONS as readonly string[]).includes(raw)) {
    return raw as ContinuationStipulation;
  }

  throw shartIncomplete(
    `continuationStipulation "${echoShartValue(raw)}" is not one of the recognised terms (${CONTINUATION_STIPULATIONS.join(
      ', ',
    )}). Case, whitespace and near-spellings are NOT normalised here — normalising a deed's free text is the seed mapper's job, and doing it in the engine is where a mis-transcribed condition becomes a payout`,
    {
      field: 'continuationStipulation',
      refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED',
      received: echoShartValue(raw),
      recognised: [...CONTINUATION_STIPULATIONS],
    },
  );
}

/**
 * **Q5 (product owner, 2026-08-17)** · the deed's continuation term for the **reversion trigger**, on
 * every entitlement order — or `null` when the deed records nothing the engine recognises.
 *
 * The owner was asked why *"the bloodline is over"* fired at different moments on `ORDERED`/`SHARED`
 * deeds than on `LINEAGE_CONTINUATION` ones, and ruled: **one trigger everywhere — the continuation
 * stipulation, not the entitlement order, defines whose line counts.** The strict *no-living-descendant*
 * reading is retired. So {@link continuesTheLine} now receives the recorded term whatever the order,
 * while {@link parseContinuationStipulation} keeps its narrower job (the ENTITLEMENT path, which still
 * consumes the term only under `LINEAGE_CONTINUATION` — ADR-0009 open question 3 is untouched by Q5).
 *
 * ⚠ **It RECOGNISES rather than parses, and the difference is a decision.** On `LINEAGE_CONTINUATION` an
 * absent or unreadable term halts the whole run (`CONTINUATION_STIPULATION_UNRECOGNISED`) and must; here
 * it degrades to `null`, i.e. to liveness alone, i.e. to **fewer** reversions. That is the fail-safe
 * direction — money that waits is recoverable, money paid to a charity is not — and the run is not
 * silent about it: a recorded-but-unconsumed term already raises `CONTINUATION_STIPULATION_NOT_APPLIED`
 * with the value echoed, and the `REVERSION_NOT_TRIGGERED` step publishes `continuationTermApplied`.
 * Halting instead would mint a refusal on a deed shape the owner did not rule on, in the direction that
 * refuses rather than the direction that pays — considered, and not taken, deliberately.
 * `invariants.independentReversionState` recognises the term the same way, from `input` alone.
 */
function recogniseContinuationStipulation(raw: string | null): ContinuationStipulation | null {
  if (raw === null) return null;
  return (CONTINUATION_STIPULATIONS as readonly string[]).includes(raw)
    ? (raw as ContinuationStipulation)
    : null;
}

/**
 * Narrow one beneficiary's fiqh link to their parent, or **halt**.
 *
 * `'SON'` | `'DAUGHTER'`. **This is an eligibility fact, not demographics** — it exists for exactly
 * one computation (the `ZUHUR_ONLY` intermediate-ancestor test) and no gate, statement field or
 * report may read it for any other purpose.
 *
 * The field is a `z.string()` so a mis-transcribed deed fact arrives here as DATA and halts with a
 * refusal that names the beneficiary, rather than dying as a `DISTRIBUTION_INPUT_INVALID` shape
 * error that names a zod path.
 *
 * @throws `DomainError('SHART_INCOMPLETE')` / `LINEAGE_LINK_UNRECOGNISED`.
 */
export function parseLineageLink(raw: string, beneficiaryId: string): LineageLink {
  if (typeof raw === 'string' && (LINEAGE_LINKS as readonly string[]).includes(raw)) {
    return raw as LineageLink;
  }

  throw shartIncomplete(
    `beneficiary ${beneficiaryId} records lineageLink ${
      typeof raw === 'string' ? `"${echoShartValue(raw)}"` : `a ${typeof raw}`
    }, which is not one of the recognised links (${LINEAGE_LINKS.join(
      ', ',
    )}). The link is the fact the ẓuhūr/buṭūn eligibility test reads, so an unreadable one cannot be tested and is not guessed`,
    {
      field: 'beneficiaries[].lineageLink',
      refusal: 'LINEAGE_LINK_UNRECOGNISED',
      beneficiaryId,
      received: typeof raw === 'string' ? echoShartValue(raw) : `[${typeof raw}]`,
      recognised: [...LINEAGE_LINKS],
    },
  );
}

/**
 * The rule label recorded on every line as the entitlement basis (BR-505).
 *
 * Two lineage labels rather than one, on purpose: this string is printed on the beneficiary's
 * official Arabic statement, and "your line continues" and "your line does not continue under this
 * deed" are different legal statements to make to a family member. The reason must be legible from
 * the statement without re-reading the deed.
 *
 * Precedence, and why:
 * 1. **`NA_DIRECT_USE` wins over everything.** Direct use means no monetary split happened at all
 *    (I7 holds "REGARDLESS of period revenue"), so labelling such a run with a *splitting* rule
 *    would put a rule on a statement that no line ever applied.
 * 2. **A `JOINT` waqf HALTS.** It used to be labelled `JOINT_FIXED_DEED_SHARES`; ADR-0009 R5 refuses
 *    the input instead, and this arm is purely defensive — {@link assertSingleWaqfNature} has already
 *    refused it at Stage 0 and again at the top of {@link resolveEntitlement}. Reaching here means
 *    that refusal was bypassed, so the discriminator is `ENTITLEMENT_RULE_UNMAPPED`: no rule maps to
 *    this pair, and stamping a line with a rule that did not apply is the failure being prevented.
 *    `JOINT_FIXED_DEED_SHARES` therefore stays in the vocabulary as an **unreachable** value.
 * 3. Otherwise the declared order maps one-for-one, with the continuation stipulation selecting
 *    between the two lineage labels.
 *
 * @throws `DomainError('SHART_INCOMPLETE')` / `ENTITLEMENT_RULE_UNMAPPED`.
 */
export function entitlementRuleFor(
  order: EntitlementOrder,
  waqfType: WaqfType,
  continuation: ContinuationStipulation | null,
): EntitlementRule {
  if (order === 'NA_DIRECT_USE') return 'NA_DIRECT_USE';

  if (waqfType === 'JOINT') {
    throw shartIncomplete(
      `waqfType JOINT has no entitlement rule: a waqf is either خيري (charitable) or ذري (ancestral/generational) and never both, so a joint waqf is refused rather than labelled (ADR-0009 R5). Reaching this arm means the Stage-0 refusal was bypassed`,
      {
        field: 'waqfType',
        refusal: 'ENTITLEMENT_RULE_UNMAPPED',
        waqfType,
        entitlementOrder: order,
      },
    );
  }

  switch (order) {
    case 'LINEAGE_CONTINUATION':
      if (continuation === 'ZUHUR_ONLY') return 'LINEAGE_PER_CAPITA_ZUHUR_ONLY';
      if (continuation === 'ZUHUR_AND_BUTUN') return 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN';
      throw shartIncomplete(
        `entitlementOrder LINEAGE_CONTINUATION has no rule without a continuation stipulation, and none was narrowed. The two lineage rules say different things to a beneficiary about whether their line continues, so the engine will not pick one`,
        {
          field: 'continuationStipulation',
          refusal: 'ENTITLEMENT_RULE_UNMAPPED',
          entitlementOrder: order,
          continuation: continuation === null ? 'null' : continuation,
        },
      );
    case 'ORDERED':
      return 'ORDERED_LOWEST_LIVING_TABAQA';
    case 'SHARED':
      return 'SHARED_ALL_LIVING_TABAQAT';
    default: {
      // Unreachable today. It exists so that growing `ENTITLEMENT_ORDERS` without giving the new
      // order a rule HALTS, rather than silently stamping a line with a rule that did not apply.
      const unmapped: never = order;
      throw shartIncomplete(
        `entitlementOrder "${String(unmapped)}" is in the engine's vocabulary but has no entitlement rule mapped to it`,
        {
          field: 'entitlementOrder',
          refusal: 'ENTITLEMENT_RULE_UNMAPPED',
          received: String(unmapped),
        },
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف · the reversion clause must be LEGIBLE before anything relies on it
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Narrow the deed's reversion clause and return the ids it names as ultimate takers, or **halt**.
 *
 * **Product-owner decision, 2026-08-10 (R7).** A وقف ذري may name a charity as its **ultimate taker**
 * (مآل الوقف): it receives nothing while any eligible descendant lives, and takes the distributable once
 * the bloodline is over. Three of {@link assertSingleWaqfNature}'s refusals grant an exemption on the
 * strength of that clause, so it is validated **first and in one place** — an exemption granted on an
 * unreadable clause is how a refusal becomes a payout.
 *
 * Every check is a refusal, never a repair, and each is named:
 *
 * | # | condition | refusal |
 * |---|---|---|
 * | 1 | `waqfType === 'PUBLIC_CHARITABLE'` | `REVERSION_ON_CHARITABLE_WAQF` |
 * | 2 | `kind` outside {@link REVERSION_KINDS} | `REVERSION_KIND_UNRECOGNISED` |
 * | 3 | `ultimateTakerIds` empty | `REVERSION_WITH_NO_ULTIMATE_TAKER` |
 * | 4 | an id repeated | `REVERSION_ULTIMATE_TAKER_DUPLICATED` |
 * | 5 | an id not in the cohort | `REVERSION_ULTIMATE_TAKER_UNKNOWN` |
 * | 6 | a named id whose `kind` is not `CHARITABLE_JIHA` | `REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE` |
 *
 * Check 4 precedes 5 deliberately: a duplicate that also happens to be unknown must report the fact that
 * would have **moved money** (a repeated id double-counts in the weight vector), not the one that would
 * merely have failed to resolve.
 *
 * Check 6 is the one that is easy to underrate. Without it a deed could name a **descendant** as its
 * ultimate taker, and that member's verdict would then come from the reversion ladder instead of from
 * their own line — paid outside the frontier rule entirely. That is a **new** escape, not a variant of
 * an old one.
 *
 * ⚠ `REVERSION_WITH_NO_RECORDED_BLOODLINE` is **not** here: it needs the certified lineage graph, so it
 * is raised at Stage 2 (see {@link resolveEntitlement}). This function is reachable from Stage 0, where
 * no graph exists yet.
 *
 * @returns the named taker ids, as a set. **Empty when `input.reversion === null`** — so a caller can
 *   use `takerIds.has(id)` without re-testing the clause, and "no clause" and "clause naming nobody"
 *   cannot be confused (the second one throws).
 * @throws `DomainError('SHART_INCOMPLETE')` carrying the refusal that names the illegible part.
 */
export function assertReversionLegible(input: DistributionInput): ReadonlySet<string> {
  const reversion = input.reversion;
  // R7-c · absent means ABSENT. Nothing is inferred from a jiha's presence, or from a jiha being the
  // only beneficiary left. A deed with no مآل clause has no ultimate taker, full stop.
  if (reversion === null) return EMPTY_TAKER_IDS;

  // 1 · a خيري waqf has no bloodline to end, so it has no مآل in this sense — and a cohort of inactive
  //     CATEGORY_ONLY placeholders would otherwise satisfy "no living descendant on record" VACUOUSLY
  //     and trigger a payout on a waqf that never had descendants. Closed structurally here rather than
  //     left to the extinction trigger's own guards.
  //
  // ⚠ TODO(surface) — Claude's fail-safe reading of R5, NOT the owner's ruling: they were asked whether
  // a ذري deed may name a charity, not whether a خيري deed may record a reversion. If it may, this
  // refusal comes out. Same status amendment D's refusal had before R7 confirmed it in part.
  if (input.waqfType === 'PUBLIC_CHARITABLE') {
    throw shartIncomplete(
      `the waqf is typed PUBLIC_CHARITABLE (وقف خيري) but the deed records a reversion (مآل الوقف) to ${String(reversion.ultimateTakerIds.length)} ultimate taker(s). A charitable waqf's beneficiaries are the segment the waqif chose, not a bloodline, so it has no beneficiary class that can END and nothing for a reversion to be triggered by. ⚠ This is the engine's fail-safe reading of R5 and is awaiting the product owner's confirmation`,
      {
        field: 'reversion',
        refusal: 'REVERSION_ON_CHARITABLE_WAQF',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
        ultimateTakerIds: [...reversion.ultimateTakerIds],
      },
    );
  }

  // 2 · legibility of the reading itself. A deed reverting to another waqf, to the Authority, or to the
  //     waqif's nearest relatives is a real مآل this engine does not implement — it halts BY NAME rather
  //     than being coerced into the charitable reading (binding rule 1).
  if (!(REVERSION_KINDS as readonly string[]).includes(reversion.kind)) {
    throw shartIncomplete(
      `the deed's reversion (مآل الوقف) is recorded as "${echoShartValue(reversion.kind)}", which this engine does not recognise. Recognised: ${REVERSION_KINDS.join(' | ')}. A waqf may revert to the poor of a city, to another waqf, to the Authority or to the waqif's nearest relatives; the engine implements only the charitable-ultimate-taker reading and will not treat another one as that one`,
      {
        field: 'reversion.kind',
        refusal: 'REVERSION_KIND_UNRECOGNISED',
        received: echoShartValue(reversion.kind),
        recognised: [...REVERSION_KINDS],
      },
    );
  }

  // 3 · a clause naming nobody has no resolvable destination. Deliberately NOT zod's `.min(1)`: this is
  //     an incomplete FOUNDER'S CONDITION and must carry SHART_INCOMPLETE, not a shape error.
  if (reversion.ultimateTakerIds.length === 0) {
    throw shartIncomplete(
      `the deed records a reversion (مآل الوقف) of kind ${reversion.kind} but names no ultimate taker. There is no destination to resolve, and the engine will not choose one`,
      {
        field: 'reversion.ultimateTakerIds',
        refusal: 'REVERSION_WITH_NO_ULTIMATE_TAKER',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
      },
    );
  }

  const byId = new Map<string, BeneficiaryInput>();
  for (const beneficiary of input.beneficiaries) byId.set(beneficiary.id, beneficiary);

  const named = new Set<string>();
  for (const takerId of reversion.ultimateTakerIds) {
    // 4 · a repeated id would appear twice in the weight vector, so it MOVES MONEY. Refused, never
    //     deduplicated — this engine does not repair a record whose repair changes an amount.
    if (named.has(takerId)) {
      throw shartIncomplete(
        `the deed names "${takerId}" twice as an ultimate taker (مآل الوقف). A repeated id would be counted twice in the reversion's weight vector and would therefore take twice its recorded share, so the record is refused rather than deduplicated`,
        {
          field: 'reversion.ultimateTakerIds',
          refusal: 'REVERSION_ULTIMATE_TAKER_DUPLICATED',
          beneficiaryId: takerId,
          ultimateTakerIds: [...reversion.ultimateTakerIds],
        },
      );
    }
    named.add(takerId);

    // 5 · referential integrity, exactly as `LINEAGE_PARENT_UNKNOWN` treats a dangling parent edge.
    const taker = byId.get(takerId);
    if (taker === undefined) {
      throw shartIncomplete(
        `the deed names "${takerId}" as an ultimate taker (مآل الوقف), but that id is not among this waqf's recorded beneficiaries. The endowment's destination cannot be resolved to anyone`,
        {
          field: 'reversion.ultimateTakerIds',
          refusal: 'REVERSION_ULTIMATE_TAKER_UNKNOWN',
          beneficiaryId: takerId,
          recordedBeneficiaryCount: input.beneficiaries.length,
        },
      );
    }

    // 6 · ⚠ THE CHECK THAT STOPS A NEW ESCAPE, not a variant of an old one. A descendant named as the
    //     ultimate taker would have their verdict taken from the reversion ladder instead of from their
    //     own line — entitled whenever the clause triggered, outside the frontier test altogether.
    if (taker.kind !== 'CHARITABLE_JIHA') {
      throw shartIncomplete(
        `the deed names "${takerId}" as an ultimate taker (مآل الوقف), but that beneficiary is kind ${taker.kind}, not CHARITABLE_JIHA. The reversion decides where the endowment goes once the BLOODLINE is over, so a member of the bloodline cannot be its destination — and naming one would decide their entitlement by the reversion clause instead of by their own line of descent`,
        {
          field: 'reversion.ultimateTakerIds',
          refusal: 'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
          beneficiaryId: takerId,
          kind: taker.kind,
        },
      );
    }
  }

  return named;
}

/** The taker set of a deed with no reversion clause. Frozen and shared — it is read, never added to. */
const EMPTY_TAKER_IDS: ReadonlySet<string> = Object.freeze(new Set<string>());

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R5 · a waqf has ONE nature — خيري or ذري, never both
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A waqf is **either** charitable (وقف خيري) for a segment the waqif chooses **or**
 * ancestral/generational (وقف ذري) — not both. Anything claiming both natures is refused.
 *
 * **Product-owner decision, 2026-08-03 (ADR-0009 R5 / decision 3).** This function REPLACES
 * `assertJointLegsPresent`, whose whole subject — locating the two legs of a joint split — describes
 * an input that can no longer exist. Three refusals, and each is keyed where it can actually be
 * evaded:
 *
 * ⚠ **R7 (product owner, 2026-08-10) MADE THREE OF THESE CONDITIONAL, AND DELETED NONE.** A وقف ذري may
 * name a charity as its **ultimate taker** (مآل الوقف): the charity receives nothing while any eligible
 * descendant lives and takes the distributable once the bloodline is over. This **narrows** R5 rather
 * than weakening it — the endowment is ذري while the family lives, and the charity never shares a period
 * with the bloodline — so what is refused is no longer *a charity on a ذري waqf* but *a charity that
 * would be paid **concurrently** with a bloodline*. The exemption is ONE predicate (`legalReversionCohort`
 * / `unnamedJihaIds` below), and it is granted only over a clause {@link assertReversionLegible} has
 * already validated: **that call is step 2 of this function, before every cohort refusal**, because an
 * exemption granted on an unreadable clause is how a refusal becomes a payout.
 *
 * 1. **`waqfType === 'JOINT'`, unconditionally** — including on a direct-use waqf, which is a
 *    deliberate precedence change from S3 (see the I7 note in {@link resolveEntitlement}). It stays
 *    first, so a reversion recorded on a JOINT waqf is unreachable.
 * 2. **A cohort holding both a `CHARITABLE_JIHA` and a `FAMILY` member, whatever the declared type.**
 *    This is the substantive half: keyed on the *cohort*, because otherwise a mixed cohort simply
 *    re-enters under `waqfType: 'FAMILY_DHURRI'` and nothing has been prevented. A `CATEGORY_ONLY`
 *    placeholder is **not** a leg — jiha + placeholder is a legitimate charitable waqf whose segment
 *    is not yet individually identified, and family + placeholder is a legitimate family waqf with an
 *    unnamed descendant.
 * 3. **A lineage order over a charity** — either a `PUBLIC_CHARITABLE` waqf or a cohort holding a
 *    `CHARITABLE_JIHA` **the deed does not name as its ultimate taker** (R7 narrowed the second arm
 *    only; the first stays absolute). Neither has descent from the waqif, so a record carrying both is
 *    self-contradicting in exactly the shape {@link assertJihaNotTiered} refuses. ⚠ The design placed
 *    this as a separate Stage-0 step; it is folded in here so the whole "this waqf claims two
 *    natures" family of refusals has one call site — `./engine.ts`'s Stage 0 needs exactly one call,
 *    and the check is then also true of the exported Stage-2 function.
 *
 *    ⚠ **The jiha arm was added by the S4 adversarial review, and it closes a real hole.** Check 2
 *    keys on a jiha standing *beside* family members and check 3 keyed only on the declared type, so
 *    a `FAMILY_DHURRI` waqf under `LINEAGE_CONTINUATION` whose cohort was a jiha **alone** passed
 *    both. `buildLineage`'s `LINEAGE_LINK_MISSING` pass covers only `FAMILY`/`CATEGORY_ONLY`, so the
 *    jiha sat outside the graph with an empty ancestor chain, satisfied the `ZUHUR_ONLY` test
 *    vacuously, and was paid **100% of the ghallah** on a line stamped
 *    `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — an official Arabic statement telling a charity that its line
 *    of descent from the waqif continues. Driven by `__tests__/lineage-adversarial.test.ts` §9.
 *
 * ⚠ **THIS CONTRADICTS THE REPO, AND THE CONTRADICTION IS RECORDED, NOT ERASED.**
 * `docs/domain/regulations/awqaf-law.md` summarises **Art. 4** as the Authority overseeing "all
 * public, private (family), and **joint**" endowments, and `docs/domain/glossary.md` defines
 * الوقف المشترك as combining public and private terms. Both stand as the docs side of an open
 * reconciliation item for Saudi counsel. The engine refuses the **value**; the `JOINT` member stays
 * in `WAQF_TYPES` and in `schema.prisma`, and **no migration is written** — ADR-0004 established that
 * this repo's enum narrowings refuse rather than remap. If counsel disagrees, the refusal comes out
 * and nothing has to be un-migrated.
 *
 * @throws `DomainError('SHART_INCOMPLETE')` carrying the refusal that names which nature clashed.
 */
export function assertSingleWaqfNature(input: DistributionInput): void {
  if (input.waqfType === 'JOINT') {
    throw shartIncomplete(
      `waqfType JOINT is NOT SUPPORTED by this engine. الوقف المشترك is a real category — the product owner ruled so on 2026-08-25 ("i was wrong earlier, a joint waqf is described as partially ذري and partially خيري"), reversing the 2026-08-03 position that a waqf could not be both, and aligning with Awqaf Law Art. 4's literal text. What is missing is not the endowment's legitimacy but the ENGINE'S DESIGN: a joint deed pays a charitable jiha its deed share ALONGSIDE the family every period, and this engine has no share basis for splitting between the ذري and خيري portions, no answer to what happens when a family share lapses beside a jiha's fixed share (the S3-D2 defect class, currently dissolved by this refusal rather than fixed), and an invariant (I-R1) that is false by design on such a deed. So the run halts as SCOPE, not as doctrine, and joint support is a designed epic with those questions on its face. Recording a joint endowment is legitimate; computing its distribution here is not yet`,
      {
        field: 'waqfType',
        refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
        ownerRuling:
          'S4 owner-decision memo, fifth batch (2026-08-25) — المشترك reversed; consequence "(a) refuse-as-unsupported"',
        openEpicQuestions: [
          'portion split basis between the ذري and خيري halves',
          'the S3-D2 lapse question (a lapsed family share inflating a jiha fixed share)',
          "I-R1's re-scoping (no charity paid beside a descendant is FALSE on a true joint deed)",
        ],
      },
    );
  }

  // R7 · step 2, and the ORDER is the rule: the مآل clause is narrowed BEFORE any cohort refusal, so
  // none of the three exemptions below can ever be granted on the strength of an unreadable clause.
  const takerIds = assertReversionLegible(input);

  let charitableJihaCount = 0;
  let familyCount = 0;
  let categoryOnlyCount = 0;
  const jihaIds: string[] = [];
  const recordedDescendantIds: string[] = [];
  for (const beneficiary of input.beneficiaries) {
    if (beneficiary.kind === 'CHARITABLE_JIHA') {
      charitableJihaCount += 1;
      jihaIds.push(beneficiary.id);
    }
    if (beneficiary.kind === 'FAMILY') familyCount += 1;
    if (beneficiary.kind === 'CATEGORY_ONLY') categoryOnlyCount += 1;
    // A `lineageLink` is the recorded claim "I descend from the waqif" — membership in the family
    // tree is decided by that field and never by `parentId` (see `buildLineage`), so this is the one
    // honest test for "is this cohort a bloodline?" available before the graph is built.
    if (beneficiary.lineageLink !== null) recordedDescendantIds.push(beneficiary.id);
  }

  // R7 · the ONE exemption clause, and it is exactly one: a ذري deed, a legible reversion, at least one
  // jiha, and EVERY jiha in the cohort named in it. `jihaIds.every(...)` and not `some(...)`: one
  // unnamed jiha beside named ones is still a charity that would be paid concurrently with the family.
  const unnamedJihaIds = jihaIds.filter((id) => !takerIds.has(id));
  const legalReversionCohort =
    input.waqfType === 'FAMILY_DHURRI' &&
    input.reversion !== null &&
    jihaIds.length > 0 &&
    unnamedJihaIds.length === 0;

  if (charitableJihaCount > 0 && familyCount > 0 && !legalReversionCohort) {
    throw shartIncomplete(
      `the recorded cohort holds ${String(charitableJihaCount)} CHARITABLE_JIHA and ${String(familyCount)} FAMILY beneficiar${familyCount === 1 ? 'y' : 'ies'} under waqfType ${input.waqfType}, and the charit${charitableJihaCount === 1 ? 'y is' : 'ies are'} not recorded as this endowment's ultimate taker (مآل الوقف)${unnamedJihaIds.length > 0 && input.reversion !== null ? ` — the deed's reversion clause does not name ${unnamedJihaIds.join(', ')}` : ''}. A waqf is either خيري (charitable) or ذري (ancestral/generational) and never both; a charity and a bloodline cannot SHARE one endowment's ghallah. A charity may be a ذري endowment's ultimate taker, receiving nothing while any descendant lives (R7) — but that must be recorded in the deed's reversion clause, not inferred from its presence in the cohort. Refused on the COHORT rather than on the declared type, because a mixed cohort would otherwise simply re-enter as FAMILY_DHURRI`,
      {
        field: 'beneficiaries[].kind',
        refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY',
        waqfType: input.waqfType,
        charitableJihaCount,
        familyCount,
        // A placeholder is not a leg: jiha+placeholder and family+placeholder are both legal.
        categoryOnlyCount,
        // R7 · which arm of the narrowing failed, so a reader can tell "no clause at all" from "a clause
        // that does not name this charity" without re-deriving it.
        reversionRecorded: input.reversion !== null,
        unnamedJihaIds,
      },
    );
  }

  // A charity may be a beneficiary of a FAMILY_DHURRI (ذري) waqf ONLY as its ULTIMATE TAKER (مآل الوقف)
  // — otherwise refused, whatever else is in the cohort and whatever the entitlementOrder.
  //
  // ⚠ CONDITIONAL SINCE R7 (product owner, 2026-08-10). Amendment D's TODO(surface) is REPLACED, not
  // removed: the owner was asked, and answered that a وقف ذري may indeed end up at a charity — but only
  // "once ALL descendants are dead and the bloodline is over". So the refusal is CONFIRMED for the
  // non-taker case (a charity that would be paid concurrently with the family, which is what R5 forbids)
  // and REVERSED for the ultimate-taker case. `reversion === null` refuses because R7-c forbids inferring
  // a مآل from a charity's mere presence; an unnamed jiha refuses and the message NAMES the unnamed ids.
  //
  // ⚠ CLOSES R6-D1, found by adversarial review after R6 landed. The mixed-cohort refusal above
  // requires `familyCount > 0`, so a family-typed waqf whose descendants are all recorded as
  // CATEGORY_ONLY placeholders — a legitimate way to record a not-yet-enumerated generation — plus one
  // CHARITABLE_JIHA slipped between every existing check. MEASURED: the charity was PAID 27,500,000 of
  // 27,500,000 halalas with no flag and invariant I5 still reported as checked; with a LIVING ṭabaqa-1
  // descendant also present, the charity still took 13,750,000 that belonged to the bloodline. That is
  // the S3-D1 OUTCOME (an untiered beneficiary escaping the tier test and taking the pool) reachable
  // one `kind` field away from the route R6 had just closed.
  //
  // R7 does NOT reopen that measurement, and it is worth being precise about why: the same input is now
  // either refused (no clause) or computes the charity's share as ZERO (clause present, bloodline
  // living), because a recorded taker is EXCLUDED by default and becomes entitled only when the reversion
  // triggers. The 13,750,000-halala diversion is not merely refused — it is priced at nothing.
  //
  // It is stated on the DECLARED TYPE, which is what the two neighbouring checks cannot see:
  // `COHORT_MIXES…` needs a FAMILY member present, and `LINEAGE_ORDER_ON_CHARITABLE_WAQF` needs the
  // lineage order. R5 survives narrowed rather than restated: the endowment is ذري while the family
  // lives, and the charity never shares a period with the bloodline, so nothing is ever both at once.
  // ...and the MIRROR: a waqif's descendant cannot be a beneficiary of a PUBLIC_CHARITABLE (خيري)
  // waqf, whatever the entitlementOrder.
  //
  // ⚠ CLOSES ESC-1, the last surviving route of the escape class, found by enumerating 2,592
  // waqfType × order × cohort × lineage cells. MEASURED on a خيري waqf under ORDERED whose cohort was
  // `CATEGORY_ONLY` members the engine had ITSELF certified as descendants (derived ṭabaqāt 1 and 2,
  // link `SON`, depth cross-check passed, all printed on their BR-505 basis) plus one
  // `CHARITABLE_JIHA`: the jiha is untiered, so `orderedExclusionReason` never tests it, and it took
  // 13,750,000 of 27,500,000 halalas beside a LIVING ṭabaqa-1 descendant — and the whole 27,500,000
  // once both certified descendants were dead and sitting on the run as `EXCLUDED/TABAQA_EXTINCT`.
  //
  // Same reasoning as `CHARITABLE_JIHA_ON_FAMILY_WAQF`, read from the other end: a خيري waqf's
  // beneficiaries are the **segment the waqif chose**, not the waqif's bloodline (R1/R5). A cohort
  // carrying lineage edges IS a bloodline, so the record makes the endowment both خيري and ذري. The
  // existing `LINEAGE_ORDER_ON_CHARITABLE_WAQF` says nearly this, but only fires under
  // `LINEAGE_CONTINUATION` — and ESC-1 lives under `ORDERED`/`SHARED`, which is exactly the gap.
  //
  // ✓ CONFIRMED — memo Q6, product owner 2026-08-17. `DESCENDANT_ON_CHARITABLE_WAQF` is a PRODUCT
  // POSITION, no longer engineering's application of R5 to a shape the owner had not been asked about.
  // The marker that stood here — "TODO(surface) — like its mirror, this is Claude's application of the
  // owner's R5 … Confirm; if a charitable deed may legitimately name the waqif's own descendants as its
  // segment, this refusal comes out and R5 needs restating" — is REPLACED by the ruling, not deleted
  // silently: the owner was asked whether a خيري deed carrying bloodline facts should halt, and confirmed
  // it. (The standing fiqh caveat applies — he is a practising Nazir, not Saudi counsel.)
  //
  // A خيري waqf has no generations, so no beneficiary of one may carry a ṭabaqa.
  //
  // **Product-owner decision, 2026-08-03.** A charitable endowment's beneficiaries are the segment the
  // waqif chose — the poor of a district, a mosque — not descendants of anyone, so ṭabaqa (طبقة, a
  // generational tier of a bloodline) is not a fact that can hold of them. A record carrying one
  // contradicts itself and the engine halts rather than choosing a reading (binding rule 1).
  //
  // ⚠ CLOSES the last of the three reasons G-9 clause 3 could not be reported closed. Correction
  // R6-F1 made a `CATEGORY_ONLY` placeholder legal on a خيري waqf without a lineage edge — correctly,
  // since a charitable segment does not descend from anyone — but that let such a member carry a
  // `tabaqa`, reach an `ORDERED` run, and be paid or excluded by the GENERATIONAL rule on a waqf that
  // has no generations. MEASURED: the line was paid, `assertOrderedExclusion` never tested it (it
  // skips null-ṭabaqa lines and this one had a ṭabaqa), invariant **I5 was still certified in
  // `invariantsChecked`**, and the line's published `basis.rule` read `ORDERED_LOWEST_LIVING_TABAQA` —
  // a BR-505 statement telling a charitable segment it was ranked among generations of a family.
  //
  // This generalises {@link assertJihaNotTiered} (a jiha may never carry a ṭabaqa, on any waqf type)
  // along the other axis: on a خيري waqf **nobody** may. The two together mean a ṭabaqa now exists
  // only where a bloodline does.
  //
  // ✓ CONFIRMED AS A PRODUCT POSITION — memo Q6, product owner 2026-08-17. This refusal shipped on
  // 2026-08-03 and the register carried it as engineering's fail-safe reading of R5 awaiting confirmation;
  // the owner has now confirmed it by name, together with `DESCENDANT_ON_CHARITABLE_WAQF` and R6-F1's
  // ذري-only scoping of the lineage-edge requirement. Nothing about the rule changes — what changes is
  // that a reader can see it is RULED rather than assumed. (Standing fiqh caveat: practising Nazir, not
  // counsel.)
  if (input.waqfType === 'PUBLIC_CHARITABLE') {
    const tieredIds = input.beneficiaries
      .filter((beneficiary) => beneficiary.tabaqa !== null)
      .map((beneficiary) => beneficiary.id);
    if (tieredIds.length > 0) {
      throw shartIncomplete(
        `the waqf is typed PUBLIC_CHARITABLE (وقف خيري) but ${String(tieredIds.length)} beneficiar${tieredIds.length === 1 ? 'y records' : 'ies record'} a generational ṭabaqa (${tieredIds.join(', ')}). A charitable waqf's beneficiaries are the segment the waqif chose, not a bloodline, so there are no ṭabaqāt for them to sit in and no generational order to rank them by`,
        {
          field: 'beneficiaries[].tabaqa',
          refusal: 'TABAQA_ON_CHARITABLE_WAQF',
          waqfType: input.waqfType,
          entitlementOrder: input.entitlementOrder,
          offendingBeneficiaryIds: tieredIds,
        },
      );
    }
  }

  if (input.waqfType === 'PUBLIC_CHARITABLE' && recordedDescendantIds.length > 0) {
    throw shartIncomplete(
      `the waqf is typed PUBLIC_CHARITABLE (وقف خيري) but ${String(recordedDescendantIds.length)} beneficiar${recordedDescendantIds.length === 1 ? 'y records a lineageLink' : 'ies record a lineageLink'} (${recordedDescendantIds.join(', ')}), which is the recorded claim that they descend from the waqif. A charitable waqf's beneficiaries are the segment the waqif chose, not the waqif's bloodline, so this record makes the endowment both خيري and ذري — which a waqf cannot be`,
      {
        field: 'beneficiaries[].lineageLink',
        refusal: 'DESCENDANT_ON_CHARITABLE_WAQF',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
        recordedDescendantIds,
        charitableJihaCount,
        familyCount,
        categoryOnlyCount,
      },
    );
  }

  if (input.waqfType === 'FAMILY_DHURRI' && unnamedJihaIds.length > 0) {
    throw shartIncomplete(
      `the waqf is typed FAMILY_DHURRI (وقف ذري) but the cohort holds ${String(unnamedJihaIds.length)} CHARITABLE_JIHA beneficiar${unnamedJihaIds.length === 1 ? 'y' : 'ies'} (${unnamedJihaIds.join(', ')}) that the deed does not name as this endowment's ultimate taker (مآل الوقف)${input.reversion === null ? ' — the deed records no reversion clause at all' : ''}. A charity may only be a ذري endowment's ULTIMATE TAKER, receiving nothing while any descendant lives and taking the distributable once the bloodline is over (R7); a charity paid alongside the family would make the endowment both خيري and ذري, which a waqf cannot be. That appointment must be RECORDED in the deed's reversion clause — the engine will not infer it from a charity's presence in the cohort`,
      {
        field: 'beneficiaries[].kind',
        refusal: 'CHARITABLE_JIHA_ON_FAMILY_WAQF',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
        charitableJihaCount,
        familyCount,
        categoryOnlyCount,
        // R7 · the two arms, separated: "no clause" and "a clause that does not name this charity" are
        // different deed defects and an operator fixes them differently.
        reversionRecorded: input.reversion !== null,
        unnamedJihaIds,
      },
    );
  }

  // ⚠ R7 NARROWS THE JIHA ARM ONLY, and missing this would have silently killed R7-a on the PRIMARY
  // deed shape: a ذري deed under LINEAGE_CONTINUATION — the NORMAL order — with an ultimate-taker jiha.
  // The PUBLIC_CHARITABLE arm stays ABSOLUTE.
  //
  // The reasoning: the lineage order resolves entitlement BY DESCENT, and a recorded ultimate taker is
  // not inside that descent — its entitlement comes from the reversion clause, evaluated after and
  // outside the frontier test — so the record no longer contradicts itself. The measured payload this
  // refusal closed (a jiha ALONE on a ذري waqf under lineage, paid 100% on a line stamped
  // LINEAGE_PER_CAPITA_ZUHUR_ONLY) stays closed by two INDEPENDENT means: the taker is default-EXCLUDED
  // until the reversion triggers, and a jiha-alone cohort now refuses REVERSION_WITH_NO_RECORDED_BLOODLINE
  // rather than paying anyone.
  if (
    input.entitlementOrder === 'LINEAGE_CONTINUATION' &&
    (input.waqfType === 'PUBLIC_CHARITABLE' || unnamedJihaIds.length > 0)
  ) {
    throw shartIncomplete(
      `entitlementOrder LINEAGE_CONTINUATION resolves entitlement by descent from the waqif, but this record puts a charity inside that descent: ${
        input.waqfType === 'PUBLIC_CHARITABLE'
          ? 'the waqf is typed PUBLIC_CHARITABLE (وقف خيري) and a charitable waqf has no descendants'
          : `the cohort holds ${String(unnamedJihaIds.length)} CHARITABLE_JIHA beneficiar${unnamedJihaIds.length === 1 ? 'y' : 'ies'} (${unnamedJihaIds.join(', ')}) that no reversion clause names as the endowment's ultimate taker, and a charity is not a descendant of the waqif`
      }. The record contradicts itself — the same shape as a charitable jiha carrying a generational ṭabaqa`,
      {
        field: input.waqfType === 'PUBLIC_CHARITABLE' ? 'entitlementOrder' : 'beneficiaries[].kind',
        refusal: 'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
        charitableJihaCount,
        unnamedJihaIds,
      },
    );
  }
}

/**
 * A `CHARITABLE_JIHA` recorded inside the generational tier tree is a **malformed Shart** — halt.
 *
 * **Product-owner decision, 2026-07-30 (S3-D3). UNCHANGED by ADR-0009.** A charitable jiha is not a
 * descendant of the waqif; it has no ṭabaqa, because *al-aʿlā fa-l-aʿlā* is a rule about generations
 * of a family and a charity is not in one. So a jiha carrying a non-null `tabaqa` is not a
 * beneficiary the engine should interpret — it is a deed record that contradicts itself, and per
 * binding rule 1 the engine halts rather than picking a reading.
 *
 * **What this refusal repairs.** Before it, `isTiered()` keyed the tier test on `tabaqa !== null`
 * alone, so populating that one nullable field silently enrolled the jiha in the family's tier
 * contest: measured, a jiha at ṭabaqa 2 under ORDERED was `EXCLUDED (UPPER_TABAQA_EXTANT)` and its
 * entire deed share was redistributed to the family, with no flag raised.
 *
 * ⚠ **Its test coverage had to be RE-POINTED by ADR-0009, and that mattered.** Every case in
 * `__tests__/jiha-tier-refusal.test.ts` was built on a JOINT input, which is now refused *earlier* by
 * {@link assertSingleWaqfNature} — so the whole suite would have started passing for the wrong
 * reason, proving the Stage-0 refusal rather than this one. It is now driven from a
 * `PUBLIC_CHARITABLE` waqf, where a jiha and a tier can legally coexist in a record and only this
 * function refuses them.
 *
 * ⚠ **R7 REVIVED A SECOND REACHABLE SUBJECT, and any note saying this guard is unreachable is now
 * false.** A ذري waqf + a legible reversion + a taker jiha carrying a `tabaqa` passes
 * {@link assertSingleWaqfNature} (`TABAQA_ON_CHARITABLE_WAQF` is خيري-only, and the three narrowed
 * checks exempt a recorded taker) and lands **here**, at step 3 of {@link resolveEntitlement} — before
 * {@link buildLineage}, so `LINEAGE_EDGE_ON_NON_DESCENDANT` does not pre-empt it. The front-door tests
 * that had to be given up are owed back, and any recorded mutation result taken while the guard was
 * unreachable must be **re-measured, not copied**.
 *
 * ⚠ *(The line above read "at step 4" until 2026-08-17 — stale from before Q7's first pass renumbered
 * the steps. Corrected, and noted rather than silently fixed: a step number is exactly the kind of
 * detail a reader trusts without checking.)*
 *
 * ✓ **ESC-2 IS CLOSED — memo Q7, product owner 2026-08-17: "validity precedes short-circuits."** The note
 * that stood here read: *"ESC-2 is UNCHANGED and STILL OPEN, and R7 gives it a second reachable shape: a
 * ذري direct-use waqf with a legible reversion and a TIERED taker jiha short-circuits at `NA_DIRECT_USE`
 * **before** this function, so the self-contradiction goes unreported (no money moves; I7 retains
 * everything). That precedence question … is the owner's to settle."* It was settled: **a record that
 * cannot describe a real endowment halts even when nothing would be paid.** This function is now called
 * at step 3 of {@link resolveEntitlement}, **above** the `NA_DIRECT_USE` short-circuit, so both of ESC-2's
 * reachable shapes — a tiered jiha on a خيري direct-use waqf, a tiered ultimate taker on a ذري direct-use
 * waqf — refuse `JIHA_TIERED`.
 *
 * ⚠ **AND THE CLAIM THIS PARAGRAPH USED TO END WITH WAS PREMATURE, so it is quoted rather than deleted:
 * *"The engine no longer answers this precedence question in two directions."*** It still did, for eight
 * further discriminators, because the pass that wrote that sentence moved only this one function.
 * `buildLineage` was hoisted above the short-circuit in a second pass (2026-08-17), after the reachability
 * of every `SHART_REFUSALS` discriminator on `NA_DIRECT_USE` was **enumerated by driving
 * `runDistribution`** rather than reasoned about. The sentence is true now — of `resolveEntitlement` as a
 * whole, and with three named exceptions that are payment checks by their own stated reason, not validity
 * ones (`LINEAGE_LINK_MISSING`, `REVERSION_WITH_NO_RECORDED_BLOODLINE`, `ULTIMATE_TAKER_WEIGHTS_UNUSABLE`).
 *
 * ⚠ TODO(surface) — NOT DECIDED: a `CATEGORY_ONLY` placeholder carrying a `tabaqa`. Unlike a jiha, a
 * not-yet-identified beneficiary plausibly *does* sit in a generational tier (a grandchild not yet
 * named), so refusing it may be wrong. Left permitted, and left flagged, rather than swept into this
 * rule on the strength of the resemblance.
 *
 * @throws `DomainError('SHART_INCOMPLETE')` / `JIHA_TIERED`, naming every offending beneficiary.
 */
export function assertJihaNotTiered(input: DistributionInput): void {
  const offenders = input.beneficiaries.filter(
    (beneficiary) => beneficiary.kind === 'CHARITABLE_JIHA' && beneficiary.tabaqa !== null,
  );
  if (offenders.length === 0) return;

  throw shartIncomplete(
    `beneficiar${offenders.length === 1 ? 'y' : 'ies'} ${offenders
      .map((beneficiary) => `${beneficiary.id} (tabaqa ${String(beneficiary.tabaqa)})`)
      .join(', ')} ${offenders.length === 1 ? 'is' : 'are'} kind CHARITABLE_JIHA but carr${
      offenders.length === 1 ? 'ies' : 'y'
    } a generational ṭabaqa. A charitable jiha is not a descendant of the waqif and cannot sit in the ṭabaqāt, so the deed record contradicts itself. The engine will not choose between "a charity subject to al-aʿlā fa-l-aʿlā" and "a ṭabaqa recorded in error"`,
    {
      field: 'beneficiaries[].tabaqa',
      refusal: 'JIHA_TIERED',
      offendingBeneficiaryIds: offenders.map((beneficiary) => beneficiary.id),
      waqfType: input.waqfType,
      entitlementOrder: input.entitlementOrder,
    },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R1 · the lineage graph
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Build the waqif's family tree from this run's beneficiary set, or **halt**.
 *
 * ═══ WHY IT RUNS ON EVERY ORDER, NOT ONLY ON LINEAGE — AND SINCE Q7, ON DIRECT USE TOO ═══
 * "Is a descendant of the waqif, at this depth" is a fact about the **person**, not about the deed's
 * order, so the graph is built and the derived depth is cross-checked against the supplied `tabaqa`
 * whatever the order.
 *
 * ✓ **Q7 (product owner, 2026-08-17) extends that to `NA_DIRECT_USE`, which used to short-circuit
 * before this function ran at all.** *Validity precedes short-circuits: a record that cannot describe a
 * real endowment halts even when nothing would be paid.* So a cycle, a dangling parent edge, an
 * unreadable link, a jiha in the family tree, a subtree rooted outside the waqif and a ṭabaqa that
 * disagrees with its own derived depth are now refused on a direct-use deed exactly as on a paying one.
 * **Pass 4 (`LINEAGE_LINK_MISSING`) is the single exception**, because it is a completeness requirement
 * and not a self-contradiction — the reasoning is at the pass itself, with the TODO(surface) it needs.
 *
 * Under `ORDERED`/`SHARED` a beneficiary who records **no** lineage link is
 * simply not in the graph and is resolved exactly as S3 resolved them — the deed weights and the
 * tier test are untouched, which is what keeps worked examples A and B, fixture `waqf-001` and
 * verification scenario V-1 valid (R4). But if such a beneficiary *does* record a link, the depth it
 * implies and the ṭabaqa it declares must agree.
 *
 * ✓ **S3-D1 IS NOW CLOSED ON EVERY PATH (R6, product-owner decision 2026-08-03).** This note
 * previously recorded — correctly — that the hole was still open under `ORDERED`, because
 * `LINEAGE_LINK_MISSING` was gated on `entitlementOrder === 'LINEAGE_CONTINUATION'`, so a `FAMILY`
 * member with `tabaqa: null, lineageLink: null` was in neither the tier tree nor the lineage graph
 * and collected the whole distributable once the recorded ṭabaqāt were extinct. ADR-0009's open
 * question 10 asked whether `ORDERED` deeds should also require the edge; the owner answered **yes**,
 * so pass 4 below is no longer gated on the order. An unplaceable family beneficiary is now an
 * incomplete Shart on every deed, and the escape it enabled no longer exists in either direction:
 * structurally on the lineage path (eligibility is not keyed on `tabaqa` at all) and by refusal on
 * the tier path.
 *
 * ═══ WHAT IT REFUSES, AND IN WHAT ORDER ═══
 * Every check is a refusal, never a repair. Membership in the graph is decided by
 * `lineageLink !== null`, **never** by `parentId`, precisely so that `parentId: null` has exactly one
 * meaning: "a child of the waqif" (depth 1), not "unknown".
 *
 * The per-beneficiary passes run over an **id-sorted** copy so a refusal's message and details do not
 * depend on the caller's array order (the property generator hands the same cohort in both
 * directions). Precedence within one beneficiary, first match wins:
 *
 * | # | condition | refusal |
 * |---|---|---|
 * | 1 | a `lineageLink` outside {SON, DAUGHTER} | `LINEAGE_LINK_UNRECOGNISED` |
 * | 2 | `parentId` set but `lineageLink` null | `LINEAGE_EDGE_ON_NON_DESCENDANT` |
 * | 3 | a `CHARITABLE_JIHA` carrying either field | `LINEAGE_EDGE_ON_NON_DESCENDANT` |
 * | 4 | `FAMILY`/`CATEGORY_ONLY` with no link, on any order **that pays** | `LINEAGE_LINK_MISSING` |
 * | 5 | `parentId` names an id not in the cohort | `LINEAGE_PARENT_UNKNOWN` |
 * | 6 | `parentId === id` (the 1-cycle) | `LINEAGE_CYCLE` |
 *
 * then, walking each graph member to its root: a longer cycle (`LINEAGE_CYCLE`), and a chain
 * terminating at something that is not itself in the graph (`LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` — the
 * subtree hangs off a jiha or an edgeless placeholder, so no eligibility path to the waqif exists).
 * Finally the derived depth is compared with the supplied `tabaqa`
 * (`TABAQA_MISMATCHES_LINEAGE_DEPTH`, including `tabaqa: null` on a recorded descendant).
 *
 * A duplicate `id` is refused first of all (`BENEFICIARY_ID_DUPLICATED`): the walk is keyed on the id,
 * so a duplicate makes the graph ambiguous. `assertInputConsistency` already refuses one at the
 * contract door with `DISTRIBUTION_INPUT_INVALID`; that behaviour is unchanged, and this covers a
 * caller reaching Stage 2 with a hand-built input (which the test suite does constantly).
 *
 * @throws `DomainError('SHART_INCOMPLETE')` carrying the refusal that names the invalid edge.
 */
export function buildLineage(input: DistributionInput): LineageIndex {
  // Idempotent re-narrowing: this function is exported and separately testable, so it must not
  // depend on a caller having parsed the order first.
  const order = parseEntitlementOrder(input.entitlementOrder);

  const byId = new Map<string, BeneficiaryInput>();
  for (const beneficiary of input.beneficiaries) {
    if (byId.has(beneficiary.id)) {
      throw shartIncomplete(
        `beneficiary id "${beneficiary.id}" appears twice. The lineage walk resolves parentId through the id, so a duplicate makes the family tree ambiguous — which parent a chain walks through would depend on map insertion order`,
        {
          field: 'beneficiaries[].id',
          refusal: 'BENEFICIARY_ID_DUPLICATED',
          beneficiaryId: beneficiary.id,
        },
      );
    }
    byId.set(beneficiary.id, beneficiary);
  }

  const sorted = [...input.beneficiaries].sort((a, b) => compareBeneficiaryIds(a.id, b.id));
  const linkById = new Map<string, LineageLink>();
  const activeById = new Map<string, boolean>();

  for (const beneficiary of sorted) {
    if (beneficiary.lineageLink !== null) {
      // 1 · legibility first: an unreadable link is a fact nothing downstream can test.
      linkById.set(beneficiary.id, parseLineageLink(beneficiary.lineageLink, beneficiary.id));
      // Recorded alongside the link, for the same members and for the same reason: R-FRONTIER's
      // walk reads an ancestor's vital status, and it must read it from the same validated index
      // the chain came from.
      activeById.set(beneficiary.id, beneficiary.active);
    }

    const inGraph = beneficiary.lineageLink !== null;

    // 2 · a parent edge on someone who is not recorded as a descendant at all.
    if (beneficiary.parentId !== null && !inGraph) {
      throw shartIncomplete(
        `beneficiary ${beneficiary.id} records parentId "${beneficiary.parentId}" but no lineageLink, so it is not recorded as a descendant of the waqif at all. Membership in the family tree is decided by the lineage link, never by the parent edge — a parent with no link is a record that contradicts itself`,
        {
          field: 'beneficiaries[].parentId',
          refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT',
          beneficiaryId: beneficiary.id,
          parentId: beneficiary.parentId,
          kind: beneficiary.kind,
        },
      );
    }

    // 3 · a charitable jiha is never in the family tree — the same self-contradiction
    //     `assertJihaNotTiered` refuses on the ṭabaqa side.
    if (beneficiary.kind === 'CHARITABLE_JIHA' && (inGraph || beneficiary.parentId !== null)) {
      throw shartIncomplete(
        `beneficiary ${beneficiary.id} is kind CHARITABLE_JIHA but carries a lineage edge (lineageLink ${beneficiary.lineageLink === null ? 'null' : `"${echoShartValue(beneficiary.lineageLink)}"`}, parentId ${beneficiary.parentId === null ? 'null' : `"${beneficiary.parentId}"`}). A charity is not a descendant of the waqif, so it cannot hold a place in the family tree`,
        {
          field: 'beneficiaries[].lineageLink',
          refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT',
          beneficiaryId: beneficiary.id,
          kind: beneficiary.kind,
        },
      );
    }

    // 4 · the descent fact is REQUIRED ON EVERY ORDER, not only under LINEAGE_CONTINUATION.
    //
    //     **Product-owner decision, 2026-08-03 (R6)** — ADR-0009's open question 10, answered:
    //     "require the parent on every deed". Rationale, in the owner's frame: eligibility comes from
    //     descent, so the descent must be on record whatever rule the deed happens to use, and nobody
    //     the engine cannot place in the family tree may ever be paid.
    //
    //     ⚠ This is what CLOSES S3-D1 on the `ORDERED` path, and it is the reason the honesty note in
    //     this function's header (which correctly recorded that the hole was still open) is now
    //     retired. MEASURED before this change: an `ORDERED` deed with every recorded ṭabaqa extinct
    //     and one `FAMILY` member carrying `tabaqa: null, lineageLink: null` paid that member the
    //     ENTIRE distributable — 78,000,000 halalas of 78,000,000 — with no flag, while the run still
    //     reported invariant I5 as checked. The member escaped the tier test because nothing placed
    //     them in the ṭabaqāt, and escaped the lineage test because this guard was gated on the order.
    //     Refusing the record is the fix: an unplaceable beneficiary is an incomplete Shart, not a
    //     beneficiary with an unusual shape.
    //
    //     A jiha is excluded here by construction: pass 3 already refuses one that carries either
    //     field, and a charity does not descend from the waqif.
    //
    //     ✓ **THE ذري-ONLY SCOPING IS CONFIRMED — memo Q6, product owner 2026-08-17** (R6-F1, the third
    //     of the three خيري-nature positions he ruled on). The note that stood here — "the CATEGORY_ONLY
    //     half is still engineering's call, not the owner's rule — see the TODO(surface) below" — is
    //     replaced by the ruling. ⚠ What is NOT closed by it, and keeps its own marker at the bottom of
    //     {@link resolveEntitlement}'s doc: whether an edgeless `CATEGORY_ONLY` placeholder on a ذري deed
    //     should be REFUSED or merely "excluded pending identification" (ADR-0009 open question 5). Q6
    //     settled which DEEDS demand the edge, not what to do with a placeholder that lacks one.
    // ⚠ The `CATEGORY_ONLY` half is scoped to a ذري waqf — CORRECTED after review found R6-F1.
    //
    // R6 as first built required the edge from every `CATEGORY_ONLY` member on every waqf type, and
    // combined with ESC-1 (no lineage edge on a خيري waqf) that left **a charitable placeholder with
    // no representable record at all**: without a link `LINEAGE_LINK_MISSING` refused, and with the
    // link R6 demanded, `DESCENDANT_ON_CHARITABLE_WAQF` refused. "The poor of the district, not yet
    // enrolled" — the ordinary state of a خيري deed before enrolment, and the exact subject of
    // BR-206's category-capture gate — could not be entered.
    //
    // That was an over-application of the owner's R6, whose rationale is "eligibility comes from
    // descent, so descent must be recorded". On a **charitable** waqf eligibility does NOT come from
    // descent — the beneficiaries are the segment the waqif chose — so there is no descent to record
    // and requiring one forced a FICTIONAL edge. A `FAMILY` member is refused on every type, because
    // a bloodline member is a claim of descent whatever the deed is typed.
    // ⚠⚠ Q7 · THIS IS THE ONE PASS IN THIS FUNCTION THAT IS **NOT** A VALIDITY CHECK, AND IT IS THE
    //     ONLY ONE THE `NA_DIRECT_USE` SHORT-CIRCUIT STILL OUTRANKS. Everything else here refuses a
    //     record that CONTRADICTS ITSELF or is ILLEGIBLE — a cycle, a dangling parent, a jiha in the
    //     tree, an unreadable link, a declared ṭabaqa that disagrees with its own edges — and per the
    //     owner's Q7 ruling (*"a record that cannot describe a real endowment halts even when nothing
    //     would be paid"*) those now run ABOVE the short-circuit, on every order including direct use.
    //
    //     This pass is different in kind: nothing here contradicts anything. A `FAMILY` member with no
    //     recorded edge describes a perfectly real endowment whose data entry is incomplete, and the
    //     refusal's own stated reason is a PAYMENT reason — R6's rationale, in the owner's words, is
    //     *"nobody the engine cannot place in the family tree may ever be paid"*, and the message below
    //     ends *"will not pay someone it cannot place"*. On a direct-use run nobody is paid whatever the
    //     register says (I7 is unconditional and the whole distributable is retained), so that sentence
    //     has no subject there. A refusal whose own reason cannot be made true on a route does not
    //     belong on that route.
    //
    //     And the asymmetry that decides it: a validity check refuses only records that are already
    //     wrong, so moving one costs nothing. A completeness check DEMANDS DATA — moving this one would
    //     require every direct-use endowment to enrol its full family tree before a nil run could be
    //     emitted at all, which is a new product requirement on a whole class of deeds, not an
    //     engineering precedence choice. Per binding rule 4 that is surfaced, not resolved here.
    //
    // ⚠ TODO(surface) — R6's recorded wording is *"the lineage edge is REQUIRED ON EVERY DEED"*, and
    // "every deed" could be read to reach a direct-use deed. What the owner was actually asked, and
    // what the register records him answering, is scoped to the three MONETARY orders: *"halts every run
    // on `ORDERED`, `SHARED` and `LINEAGE_CONTINUATION` alike"* (CLAUDE.md register item #12, R6).
    // Direct use was not put to him. Engineering classifies it as completeness-not-validity for the
    // reasons above and leaves it below the short-circuit; if the owner reads R6 as reaching direct-use
    // deeds too, delete the `order !== 'NA_DIRECT_USE'` conjunct — and note that doing so makes §08's
    // worked Examples C and C2 REFUSED inputs, since `waqf-004`'s cohort is deliberately edgeless.
    // Nothing is at risk in the meantime: a direct-use run emits no line, and the same register halts
    // the moment the deed is computed on any order that pays.
    const descentIsTheEligibility =
      beneficiary.kind === 'FAMILY' || input.waqfType === 'FAMILY_DHURRI';
    if (
      !inGraph &&
      order !== 'NA_DIRECT_USE' &&
      descentIsTheEligibility &&
      (beneficiary.kind === 'FAMILY' || beneficiary.kind === 'CATEGORY_ONLY')
    ) {
      throw shartIncomplete(
        `beneficiary ${beneficiary.id} (kind ${beneficiary.kind}) records no lineageLink. Entitlement in a family waqf is decided by descent from the waqif, so the descent must be recorded whatever entitlementOrder the deed stipulates (here ${order}). The engine cannot place this person in the family tree and will not pay someone it cannot place`,
        {
          field: 'beneficiaries[].lineageLink',
          refusal: 'LINEAGE_LINK_MISSING',
          beneficiaryId: beneficiary.id,
          kind: beneficiary.kind,
          entitlementOrder: order,
        },
      );
    }

    // 5 · referential integrity. Zod cannot express a cross-field reference, so it arrives as data.
    if (beneficiary.parentId !== null && !byId.has(beneficiary.parentId)) {
      throw shartIncomplete(
        `beneficiary ${beneficiary.id} records parentId "${beneficiary.parentId}", which is not among this waqf's recorded beneficiaries. The chain to the waqif cannot be walked, so eligibility cannot be resolved`,
        {
          field: 'beneficiaries[].parentId',
          refusal: 'LINEAGE_PARENT_UNKNOWN',
          beneficiaryId: beneficiary.id,
          missingParentId: beneficiary.parentId,
        },
      );
    }

    // 6 · the 1-cycle, named separately from the general walk so the message is actionable.
    if (beneficiary.parentId === beneficiary.id) {
      throw shartIncomplete(
        `beneficiary ${beneficiary.id} is recorded as their own parent. Entitlement is unresolvable from a family tree that contains a cycle`,
        {
          field: 'beneficiaries[].parentId',
          refusal: 'LINEAGE_CYCLE',
          beneficiaryId: beneficiary.id,
          cycle: [beneficiary.id],
        },
      );
    }
  }

  const depthById = new Map<string, number>();
  const ancestorsById = new Map<string, readonly string[]>();

  for (const beneficiary of sorted) {
    if (beneficiary.lineageLink === null) continue;

    const seen = new Set<string>();
    const chain: string[] = [];
    let cursor = beneficiary;
    for (;;) {
      if (seen.has(cursor.id)) {
        throw shartIncomplete(
          `the recorded parent edges form a cycle: walking up from ${beneficiary.id} returns to ${cursor.id} (via ${[beneficiary.id, ...chain].join(' → ')}). Entitlement is unresolvable from a family tree that is not a tree`,
          {
            field: 'beneficiaries[].parentId',
            refusal: 'LINEAGE_CYCLE',
            beneficiaryId: beneficiary.id,
            cycle: [beneficiary.id, ...chain],
            revisited: cursor.id,
          },
        );
      }
      seen.add(cursor.id);

      // `parentId: null` is the ROOT of a line — a child of the waqif — never "unknown".
      if (cursor.parentId === null) break;

      const parent = byId.get(cursor.parentId);
      if (parent === undefined) {
        // Unreachable: pass 5 above refused a dangling parentId for every beneficiary.
        throw shartIncomplete(
          `beneficiary ${cursor.id} records parentId "${cursor.parentId}", which is not among this waqf's recorded beneficiaries`,
          {
            field: 'beneficiaries[].parentId',
            refusal: 'LINEAGE_PARENT_UNKNOWN',
            beneficiaryId: cursor.id,
            missingParentId: cursor.parentId,
          },
        );
      }
      if (parent.lineageLink === null) {
        throw shartIncomplete(
          `the line above ${beneficiary.id} terminates at ${parent.id} (kind ${parent.kind}), which records no lineageLink and is therefore not in the waqif's family tree. The subtree hangs off something that is not the waqif's line, so no eligibility path to the waqif exists`,
          {
            field: 'beneficiaries[].parentId',
            refusal: 'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
            beneficiaryId: beneficiary.id,
            rootedAtId: parent.id,
            rootedAtKind: parent.kind,
          },
        );
      }

      chain.push(parent.id);
      cursor = parent;
    }

    ancestorsById.set(beneficiary.id, Object.freeze([...chain]));
    // A child of the waqif has an empty proper-ancestor chain and is depth 1.
    depthById.set(beneficiary.id, chain.length + 1);
  }

  // ṭabaqa is DERIVED and CROSS-CHECKED — two sides that must agree, each testing the other. A
  // silently-preferred side is how this repo's worst defects shipped.
  for (const beneficiary of sorted) {
    const derivedDepth = depthById.get(beneficiary.id);
    if (derivedDepth === undefined) {
      // Outside the graph. A `CHARITABLE_JIHA` with a ṭabaqa is already refused by
      // `assertJihaNotTiered`; a `CATEGORY_ONLY` placeholder carrying one stays PERMITTED and
      // undecided, exactly as S3 left it (see that function's TODO(surface)). No new refusal.
      continue;
    }
    if (beneficiary.tabaqa !== derivedDepth) {
      throw shartIncomplete(
        `beneficiary ${beneficiary.id} declares ṭabaqa ${beneficiary.tabaqa === null ? 'null' : String(beneficiary.tabaqa)} but the recorded parent edges put them at depth ${String(derivedDepth)} from the waqif. The two must agree: the depth is what the eligibility test walks and the ṭabaqa is what the register states, so a disagreement is a record that contradicts itself — a recorded descendant with no tier included`,
        {
          field: 'beneficiaries[].tabaqa',
          refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH',
          beneficiaryId: beneficiary.id,
          suppliedTabaqa: beneficiary.tabaqa === null ? 'null' : String(beneficiary.tabaqa),
          derivedDepth,
        },
      );
    }
  }

  return { depthById, ancestorsById, linkById, activeById };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Internals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The effective weight of every eligible member of a lineage cohort — **per capita (R3)**.
 *
 * One head, one share — where "a head" is a **living head of a continuing line** (R-FRONTIER), not
 * every living descendant. `'1'` rather than an equal fraction because `./allocate.ts` normalises by
 * scaling the weight vector to integers and dividing in `bigint`: with an equal integer weight per
 * head, every Hamilton remainder is equal and the residual hands exactly one extra halala to the `r`
 * lowest ids, which is what invariant I-L1 pins.
 */
const PER_CAPITA_WEIGHT = '1';

/**
 * Is this beneficiary in the generational tier tree at all? **`ORDERED` only.**
 *
 * Keyed on `tabaqa !== null`, **not** on `kind` — and that is safe only because
 * {@link assertJihaNotTiered} runs first. Keeping the predicate on `tabaqa` also keeps it identical
 * to the one `invariants.assertOrderedExclusion` recomputes I5 with; keying one side on `kind` and
 * the other on `tabaqa` makes the invariant fire on legal data (verified during the S3 review).
 *
 * ⚠ Under `LINEAGE_CONTINUATION` this predicate is **never consulted**. That is the whole of R1: the
 * tier is not the key, so there is nothing for a tier-membership test to decide.
 */
function isTiered(beneficiary: BeneficiaryInput): boolean {
  return beneficiary.tabaqa !== null;
}

/**
 * Exact zero test on a validated non-negative decimal literal.
 *
 * `'0'`, `'0.0'` and `'00.000'` are all a zero deed share. Done with a regex rather than `Decimal`
 * so this module keeps no numeric dependency at all — the strongest available statement that Stage 2
 * does no arithmetic. A string that does not match the contract's decimal shape is reported as
 * NON-zero, so it travels to `largestRemainderAllocate` and is refused loudly there
 * (`INVALID_ALLOCATION_WEIGHTS`) instead of being silently read as nothing.
 *
 * ⚠ **`ORDERED`/`SHARED` only.** On a lineage cohort weights are not applied at all (R3), so a zero
 * deed share does **not** exclude — see the TODO(surface) in {@link resolveEntitlement}.
 */
function isZeroWeight(weight: string): boolean {
  return /^0+(?:\.0+)?$/.test(weight);
}

/**
 * Canonical form of a validated non-negative decimal literal, for **equality comparison only**.
 *
 * `'10'`, `'10.0'` and `'010.00'` are the same deed figure; `'10'` and `'20'` are not. Used solely to
 * decide whether a lineage cohort's recorded weights are all equal — i.e. whether per capita
 * actually *changed* anything and the `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` flag is owed.
 *
 * ⚠ **String-only, by rule.** No `Decimal`, no `Number()`, no arithmetic — this is the first thing in
 * this module that looks numeric, and I6 is carried structurally by the absence of exactly that (see
 * the module header's code-review rule). Comparing two weights for equality never needs arithmetic.
 * A string outside the contract's decimal shape is returned verbatim, so it compares as distinct and
 * is refused downstream by the allocator rather than being quietly normalised here.
 */
function canonicalWeight(weight: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(weight)) return weight;
  const dot = weight.indexOf('.');
  const integerPart = (dot === -1 ? weight : weight.slice(0, dot)).replace(/^0+(?=\d)/, '');
  const fractionPart = dot === -1 ? '' : weight.slice(dot + 1).replace(/0+$/, '');
  return fractionPart === '' ? integerPart : `${integerPart}.${fractionPart}`;
}

/**
 * The lowest-numbered ṭabaqa with at least one LIVING member — the `ORDERED` entitled cohort.
 *
 * "Living/extant" is `active === true` and nothing else. Death or exit from scope is modelled as
 * `active: false`, and an inactive member does **not** keep their tier alive (§08: they are absent
 * for the extinction test). Returns `null` when no tiered member is living — every tier is extinct,
 * and only untiered members (a jiha, a category placeholder) can still be entitled.
 *
 * ⚠ A **zero `stipulatedWeight` does not affect this test.** A zero deed share is not death, and
 * `active` is the sole recorded vital status. The consequence is deliberate: a tier whose only living
 * members all carry weight `'0'` still blocks the tier below it, and the run ends in
 * `NO_ELIGIBLE_BENEFICIARIES` with the distributable retained (S3's open DEFECT-A3).
 */
function lowestLivingTabaqa(beneficiaries: readonly BeneficiaryInput[]): number | null {
  let lowest: number | null = null;
  for (const beneficiary of beneficiaries) {
    if (beneficiary.tabaqa === null) continue;
    if (!beneficiary.active) continue;
    if (lowest === null || beneficiary.tabaqa < lowest) lowest = beneficiary.tabaqa;
  }
  return lowest;
}

/**
 * One beneficiary's `LINEAGE_CONTINUATION` verdict, and the ancestor that produced it.
 *
 * The reason and the ancestor it names come out of the **same walk**, so the exclusion and the
 * explanation printed beside it cannot disagree about *which* ancestor blocked — the beneficiary
 * disputing that exclusion is entitled to be told, and it is the fact they will dispute.
 */
interface LineageVerdict {
  /** `null` ⇒ entitled. */
  readonly reason: ExclusionReasonCode | null;
  /**
   * The **nearest** proper ancestor whose fact produced `reason`, or `null` when no ancestor did
   * (entitled, or excluded on the beneficiary's own status).
   */
  readonly blockingAncestorId: string | null;
}

const ENTITLED: LineageVerdict = Object.freeze({ reason: null, blockingAncestorId: null });
const EXCLUDED_INACTIVE: LineageVerdict = Object.freeze({
  reason: 'BENEFICIARY_INACTIVE',
  blockingAncestorId: null,
});

/**
 * **R-FRONTIER · the whole `LINEAGE_CONTINUATION` eligibility test** (product owner, 2026-08-03).
 *
 * Entitlement sits at the **nearest living point on each line of descent**. A beneficiary is
 * entitled iff they are themselves living, **every ancestor strictly between them and the waqif is
 * deceased**, and — under `ZUHUR_ONLY` only — every such ancestor is a `SON`.
 *
 * ⚠ **This is a different test from the one this file shipped, not the old one with a filter added.**
 * The shipped test read ancestors' *links* and never their `active`; this one reads both, because
 * "who currently holds this line" is not answerable from the links alone. The old wording — ADR-0009's
 * *"every living descendant of the waqif is eligible"* — was the orchestrator's, and the owner's
 * correction (*"son A's child does not get since Son A is alive"*) restores the rule their original
 * narrative always described: continuation is **triggered by the ancestor's death**.
 *
 * ═══ PRECEDENCE, AND THE ONE PART OF IT NOBODY DECIDED ═══
 *
 * 1. **The member's OWN vital/scope status** ⇒ `BENEFICIARY_INACTIVE`. Someone out of scope receives
 *    nothing; their descendants' verdicts are computed independently, on their own chains.
 * 2. **Under `ZUHUR_ONLY`, an intermediate ancestor who is not a `SON`** ⇒
 *    `BUTUN_LINE_NOT_CONTINUED`. Their own link is irrelevant: a son's daughter is eligible, a
 *    daughter's son is not. Under `ZUHUR_AND_BUTUN` there is no line filter at all.
 * 3. **An intermediate ancestor who is still living** ⇒ `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`. This
 *    exclusion is **temporary**: it reverses the moment that ancestor dies, and the same person is
 *    entitled next period.
 *
 * ✓ **Rung 2 outranking rung 3 is RATIFIED — the OWNER'S ruling since 2026-08-25** (memo, S8
 * addendum FOURTH batch, "Register #12 · exclusion-reason precedence": verbatim selection
 * *"Ratify permanent-over-temporary (Recommended)"*). A beneficiary blocked by BOTH is told the
 * PERMANENT reason: their official Arabic statement must not say "wait for your father to die"
 * when in fact their line never continues under this Shart. *(This block was a `TODO(surface)` —
 * engineering's call, pending the owner — from R-FRONTIER on 2026-08-03 until that ruling; the
 * reasoning above was put to the owner as recorded and adopted. Reversing the rungs moves no
 * halala — only which sentence a family member reads about their own descent.)*
 *
 * And, deliberately, what CANNOT exclude here — each absence is a decision:
 *
 *  · **No ṭabaqa test.** The frontier is a property of one *line*, not of a generation: an extinct
 *    tier does not block a descendant and a living tier does not block a cousin's branch, so neither
 *    `UPPER_TABAQA_EXTANT` nor `TABAQA_EXTINCT` can appear on this path (I5 asserts it).
 *  · **No zero-weight test.** Weights are not applied to a bloodline at all (R3), so this function
 *    never returns `ZERO_STIPULATED_WEIGHT` — see the TODO(surface) in {@link resolveEntitlement},
 *    because this moves money to someone the deed's own recorded figure gave nothing.
 *
 *    ⚠ **Scoped to THIS FUNCTION since R7, and the distinction is not pedantry.** The sentence used to
 *    read *"`ZERO_STIPULATED_WEIGHT` never appears"*, which a reader would take as a claim about the
 *    whole run — and on a lineage run it is now false. A recorded ultimate taker never reaches this
 *    function ({@link ultimateTakerVerdict} decides it instead) and IS excluded for a zero deed weight
 *    on every order, because a taker's share is its weight and per capita is the bloodline's rule
 *    (R7-e). MEASURED: two takers at `'0'` and `'10'` over an extinct bloodline under
 *    `LINEAGE_CONTINUATION` ⇒ the zero one carries this code and the other takes 27,500,000. The
 *    per-path table in `./contract.ts` is the authority; keep the two in step.
 *  · **No payability field**, on any path (I6).
 *
 * ═══ TERMINATION, AND THE ONE WALK ═══
 * The ancestor walk itself lives in {@link ancestorChainFacts} and is **shared** with R7-d's
 * extinction trigger ({@link continuesTheLine}), so the buṭūn test that decides an exclusion and the
 * buṭūn test that decides whether a bloodline is over cannot drift apart. It iterates a **finite
 * frozen array** — `lineage.ancestorsById`, built and validated by {@link buildLineage}, which
 * refuses every cycle (`LINEAGE_CYCLE`) and every dangling or externally-rooted edge before this
 * function can be reached. {@link resolveEntitlement} calls `buildLineage` before the
 * per-beneficiary loop, so the ordering is not an assumption: it is checked, and a cohort that
 * cannot form a tree never reaches a verdict at all.
 */
function lineageFrontierVerdict(
  beneficiary: BeneficiaryInput,
  continuation: ContinuationStipulation,
  lineage: LineageIndex,
): LineageVerdict {
  if (!beneficiary.active) return EXCLUDED_INACTIVE;

  const { lineBreakAncestorId, livingAncestorId } = ancestorChainFacts(
    beneficiary,
    continuation,
    lineage,
  );

  if (lineBreakAncestorId !== null) {
    return { reason: 'BUTUN_LINE_NOT_CONTINUED', blockingAncestorId: lineBreakAncestorId };
  }
  if (livingAncestorId !== null) {
    return { reason: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR', blockingAncestorId: livingAncestorId };
  }
  return ENTITLED;
}

/** The two facts a proper-ancestor chain can carry, each taken at its NEAREST occurrence. */
interface AncestorChainFacts {
  /**
   * Under `ZUHUR_ONLY` only: the nearest ancestor strictly between the beneficiary and the waqif
   * whose `lineageLink` is not `SON`, i.e. the point at which the deed stops continuing this line.
   * `null` under `ZUHUR_AND_BUTUN`, always — that stipulation applies no line filter at all.
   */
  readonly lineBreakAncestorId: string | null;
  /** The nearest ancestor strictly between the beneficiary and the waqif who is still `active`. */
  readonly livingAncestorId: string | null;
}

/**
 * **ONE walk up the proper-ancestor chain — the single implementation of the ẓuhūr/buṭūn and
 * frontier facts, shared by every caller that needs either.**
 *
 * Two callers read it and they read *different* halves, which is exactly why it is one function:
 *
 *  · {@link lineageFrontierVerdict} needs **both** facts — the line break (permanent under this deed)
 *    and the living ancestor (temporary) — and its verdict names the ancestor that produced it.
 *  · {@link continuesTheLine} (R7-d, the extinction trigger) needs **only** `lineBreakAncestorId`.
 *    Whether a line still *exists* is a different question from who currently *holds* it, so the
 *    living-ancestor fact is deliberately unread there — see that function's doc.
 *
 * Extracting it was not tidying. Two implementations of the same fiqh rule that can drift apart is
 * this repo's most expensive recurring defect (R7-D2 is the most recent), and R7-d's widening put a
 * second consumer on the buṭūn test for the first time. The independent recomputation in
 * `./invariants.ts` is a *deliberate* second implementation and stays one; two inside this module
 * would not be.
 *
 * ⚠ FAIL CLOSED, not open. The chain read used to be `?? []`, which meant that a beneficiary absent
 * from the ancestor index — i.e. one the engine cannot place in the family tree — walked ZERO
 * ancestors, satisfied both frontier conditions vacuously, and was ENTITLED. Adversarial review
 * named that as one of three reasons G-9 clause 3 could not be called closed: the closure rested on
 * three upstream refusals over a default that pays, and removing any one of them re-opened 128
 * paying cells.
 *
 * The upstream refusals (R6, R6-D1, ESC-1, and `buildLineage`'s rooted/dangling checks) should make
 * this unreachable, and a test pins that. But "should be unreachable" is precisely the assumption
 * this engine has been burned by, so the DEFAULT is a refusal rather than a payment: an unplaceable
 * beneficiary halts the run instead of collecting. A rule about who is owed a family's ghallah must
 * fail towards paying nobody, never towards paying someone unknown. On the R7-d path the same
 * default is fail-safe in the other direction too: an unplaceable member halts rather than being
 * silently counted as a line that has ended, which would hand a charity the distributable.
 *
 * ═══ TERMINATION ═══
 * The walk is an iteration over a **finite frozen array** — `lineage.ancestorsById`, built and
 * validated by {@link buildLineage}, which refuses every cycle (`LINEAGE_CYCLE`) and every dangling
 * or externally-rooted edge before this function can be reached.
 *
 * @throws `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` for a beneficiary outside the lineage graph.
 */
function ancestorChainFacts(
  beneficiary: BeneficiaryInput,
  continuation: ContinuationStipulation | null,
  lineage: LineageIndex,
): AncestorChainFacts {
  const ancestorChain = lineage.ancestorsById.get(beneficiary.id);
  if (ancestorChain === undefined) {
    throw shartIncomplete(
      `beneficiary ${beneficiary.id} is not in the waqf's lineage graph, so the engine cannot tell whether their line descends from the waqif or whether it continues under this deed. It will not pay a beneficiary it cannot place`,
      {
        field: 'beneficiaries[].lineageLink',
        refusal: 'LINEAGE_LINK_MISSING',
        beneficiaryId: beneficiary.id,
        kind: beneficiary.kind,
      },
    );
  }

  // Nearest first, collecting both facts in a single pass. Walking once is what makes a verdict and
  // the ancestor it names structurally consistent.
  let lineBreakAncestorId: string | null = null;
  let livingAncestorId: string | null = null;

  for (const ancestorId of ancestorChain) {
    if (
      lineBreakAncestorId === null &&
      continuation === 'ZUHUR_ONLY' &&
      lineage.linkById.get(ancestorId) !== 'SON'
    ) {
      lineBreakAncestorId = ancestorId;
    }
    // `activeById` holds every graph member, and an ancestor is always one: `buildLineage` refuses
    // a chain that passes through a non-member (`LINEAGE_ROOTED_OUTSIDE_THE_WAQIF`). So `undefined`
    // is unreachable here — and if that guarantee were ever broken, `=== true` would fail OPEN
    // (pay), which is why it is not the only line of defence: I5 recomputes this verdict from
    // `input.beneficiaries`, where `active` always exists, and refuses the run on a disagreement.
    if (livingAncestorId === null && lineage.activeById.get(ancestorId) === true) {
      livingAncestorId = ancestorId;
    }
    if (lineBreakAncestorId !== null && livingAncestorId !== null) break;
  }

  return { lineBreakAncestorId, livingAncestorId };
}

/**
 * **R7-d · does this recorded descendant KEEP THE BLOODLINE GOING?** (product owner, 2026-08-11.)
 *
 * The owner was asked whether *"the bloodline is over"* means *no living descendant* or *no
 * continuing line*, and answered: **"bloodline is over means no continuing line."** So the question a
 * line-by-line test must answer is not *"is anyone alive?"* but *"is anyone alive **on a line the
 * deed carries forward**?"*, and that is exactly this predicate:
 *
 * ```
 * continuesTheLine(b) ⇔ b.active
 *                       ∧ ( continuation ≠ 'ZUHUR_ONLY'
 *                           ∨ every ancestor strictly between b and the waqif is a SON )
 * ```
 *
 *  · under **`ZUHUR_AND_BUTUN`** it collapses to `b.active` — every living descendant continues a
 *    line, which is the STRICT reading the engine shipped before this widening, unchanged;
 *  · under **`ZUHUR_ONLY`** it is the ẓuhūr ancestor walk: a living descendant sitting on a broken
 *    daughter line does **not** keep the bloodline going, because the deed never carried it there.
 *    A waqif with only daughters can have living blood descendants and no continuing ẓuhūr line —
 *    the family is not over, but the *waqf's* bloodline is, and the deed's مآل takes.
 *
 * ═══ WHAT IT IS DELIBERATELY NOT ═══
 *
 * 1. **It is NOT the entitled-cohort test, and must never be implemented as one.** The entitled
 *    cohort can be empty for reasons that say nothing about a line ending, and each of them must
 *    still HOLD the reversion:
 *      · every living descendant carries a **zero deed weight** (`ZERO_STIPULATED_WEIGHT`, reachable
 *        on `ORDERED`/`SHARED`) — their line continues perfectly well and a charity must not take;
 *      · a descendant is held behind a **living ancestor** (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) —
 *        see 2;
 *      · a **gate** withheld a payment (stale KYC, cross-border, uncaptured category) — gates never
 *        touch entitlement at all (I6), so they can never reach this test.
 *    Hence: descent + liveness + the stipulation. Never an exclusion code, never
 *    `entitledBloodlineCount`, never a line's status.
 * 2. **The frontier rule is irrelevant to it, and `livingAncestorId` is therefore UNREAD.**
 *    R-FRONTIER decides *which* living member of a line holds the entitlement this period; whether
 *    the line exists at all is a different question. A descendant waiting behind a living ancestor is
 *    proof the line is alive — the ancestor is themselves living and on it — not evidence against it.
 *    (And the ancestor is independently counted by this same predicate, so the outcome is the same
 *    from either end of the chain.)
 * 3. **It does not decide the R7-D1 placeholder hold.** A `CATEGORY_ONLY` placeholder stands for
 *    people never enumerated, so no answer about *it* is an answer about *them*; that hold is applied
 *    by {@link reversionOutcome} on top of this test and wins regardless of what it returns.
 *
 * ✓ **`continuation` IS NOW THE DEED'S RECORDED TERM ON EVERY ORDER — memo Q5, product owner
 * 2026-08-17.** The paragraph that stood here said the opposite, and it is replaced rather than softened:
 * *"`continuation` is `null` on every order that does not consume the deed's continuation term
 * (`ORDERED`, `SHARED`) … widening the trigger on those orders would consume a term the entitlement path
 * refuses to consume (ADR-0009 open question 3) and would move money to a charity on the strength of
 * it."* That was engineering's fail-safe scoping of R7-d, pinned as a surfaced scope judgement; the owner
 * was asked and ruled **one trigger everywhere**, because *"the continuation stipulation, not the
 * entitlement order, defines whose line counts."* So the strict reading is retired on `ORDERED`/`SHARED`
 * too, and `continuation` here is {@link recogniseContinuationStipulation}'s output.
 *
 * ⚠ **What did NOT move, and must not be read as having moved:** ADR-0009 open question 3 is still open,
 * and the ENTITLEMENT path still does not consume the term outside `LINEAGE_CONTINUATION`
 * (`CONTINUATION_STIPULATION_NOT_APPLIED` still fires, and still means what it said). Q5 changes *when a
 * bloodline is over*, not *who is entitled while it is going*. `continuation` is `null` here only when
 * the deed records no recognisable term at all, and then this collapses to liveness alone.
 */
function continuesTheLine(
  beneficiary: BeneficiaryInput,
  continuation: ContinuationStipulation | null,
  lineage: LineageIndex,
): boolean {
  if (!beneficiary.active) return false;
  return ancestorChainFacts(beneficiary, continuation, lineage).lineBreakAncestorId === null;
}

/**
 * `ORDERED` exclusion, per beneficiary. `null` ⇒ entitled. **UNCHANGED by ADR-0009.**
 *
 * The check order IS the reason precedence, and each rung is pinned by an acceptance test:
 *
 * 1. **A tier below the entitled one is wholly extinct** ⇒ `TABAQA_EXTINCT`. It out-ranks
 *    `BENEFICIARY_INACTIVE` even though every such member is also individually inactive: the
 *    operative fact on the statement is that the *generation* has ended (AT-03).
 * 2. **A tier above the entitled one waits** ⇒ `UPPER_TABAQA_EXTANT`, whether the individual is
 *    active or not. The deed's reason for owing them nothing is that an upper tier still lives,
 *    which is true regardless of their own status — and I5 asserts exactly this code for *every*
 *    member of a higher-numbered tier (AT-15, worked example A's ben-002).
 * 3. **In the entitled tier (or untiered), individually inactive** ⇒ `BENEFICIARY_INACTIVE`. §08
 *    supplies no code for the commonest real case — one living and one dead sibling in the entitled
 *    tier — and both of its codes are wrong there (AT-15's ben-B).
 * 4. **Living but the deed gives them a zero share** ⇒ `ZERO_STIPULATED_WEIGHT`. Filtered out before
 *    the allocator, which throws `INVALID_ALLOCATION_WEIGHTS` on an all-zero vector and would
 *    otherwise turn §08's explicitly non-throwing `NO_ELIGIBLE_BENEFICIARIES` state into an
 *    exception (AT-06).
 */
function orderedExclusionReason(
  beneficiary: BeneficiaryInput,
  entitledTabaqa: number | null,
): ExclusionReasonCode | null {
  if (isTiered(beneficiary) && beneficiary.tabaqa !== null) {
    if (entitledTabaqa === null || beneficiary.tabaqa < entitledTabaqa) return 'TABAQA_EXTINCT';
    if (beneficiary.tabaqa > entitledTabaqa) return 'UPPER_TABAQA_EXTANT';
  }
  if (!beneficiary.active) return 'BENEFICIARY_INACTIVE';
  if (isZeroWeight(beneficiary.stipulatedWeight)) return 'ZERO_STIPULATED_WEIGHT';
  return null;
}

/**
 * `SHARED` (tashrik) exclusion, per beneficiary. `null` ⇒ entitled. **UNCHANGED by ADR-0009.**
 *
 * No tier test at all — that is the whole content of tashrik — and no ẓuhūr/buṭūn filter either,
 * which is precisely why `SHARED` was NOT collapsed into `LINEAGE_CONTINUATION`: it applies no
 * continuation term and it DOES apply deed weights. Collapsing them would silently make every
 * tashrik deed per capita. §08 is silent on inactive members in SHARED; they are excluded
 * `BENEFICIARY_INACTIVE`, the same code and meaning as in ORDERED.
 */
function sharedExclusionReason(beneficiary: BeneficiaryInput): ExclusionReasonCode | null {
  if (!beneficiary.active) return 'BENEFICIARY_INACTIVE';
  if (isZeroWeight(beneficiary.stipulatedWeight)) return 'ZERO_STIPULATED_WEIGHT';
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف · the extinction trigger, and the ultimate taker's verdict
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * What the deed's reversion clause does to **this period**.
 *
 * Three states, and the middle one is the whole point: a clause can exist and not have triggered.
 */
type ReversionOutcome =
  /** The deed records no مآل clause. Nothing is inferred (R7-c). */
  | { readonly kind: 'NONE' }
  /**
   * The clause exists and a line the deed continues is **still going**, so the taker(s) receive
   * nothing this period. The descendants keeping it going are named so the trace can say *which* of
   * them held it back.
   */
  | {
      readonly kind: 'PENDING';
      readonly takerIds: ReadonlySet<string>;
      /**
       * Every `active` recorded descendant — including those on a line this deed does **not**
       * continue. Carried for the trace and the messages, and deliberately **not** the trigger: since
       * R7-d (2026-08-11) a living descendant on a broken line no longer holds the reversion — on
       * **every** entitlement order since memo Q5 (2026-08-17).
       */
      readonly livingBloodlineIds: readonly string[];
      /**
       * The living descendants who **keep the bloodline going** — {@link continuesTheLine}. This is
       * the list the trigger reads. Non-empty on an ordinary PENDING run; empty when the hold comes
       * from `unenumeratedBloodlineIds` instead.
       */
      readonly continuingBloodlineIds: readonly string[];
      /**
       * Recorded descendants that are `CATEGORY_ONLY` **placeholders** for people never enumerated
       * (R7-D1). Non-empty ⇒ the reversion is held even though no *continuing* descendant is on
       * record, because a placeholder's `active: false` records that a placeholder is not in force —
       * not that anyone died, and a placeholder's `lineageLink` says nothing about the lines of the
       * people it stands for. Extinction cannot be certified from it. Empty on an ordinary PENDING
       * run, where `continuingBloodlineIds` carries the reason instead.
       */
      readonly unenumeratedBloodlineIds?: readonly string[];
    }
  /** No line the deed continues is still going. The taker(s) take the distributable. */
  | {
      readonly kind: 'APPLIED';
      readonly takerIds: ReadonlySet<string>;
      readonly recordedBloodlineCount: number;
      /**
       * Living recorded descendants whose line the deed does **not** continue — non-empty only under
       * `ZUHUR_ONLY`, and the whole content of the 2026-08-11 widening. Before it, a non-empty list
       * here was a PENDING run. Named on the trace because "the bloodline is over" is a startling
       * sentence to print on a register that still holds living blood descendants, and the reader is
       * owed the names.
       */
      readonly livingNonContinuingBloodlineIds: readonly string[];
    };

const REVERSION_NONE: ReversionOutcome = Object.freeze({ kind: 'NONE' });

/**
 * **R7-d · the extinction trigger — "NO CONTINUING LINE", over the graph the engine CERTIFIED.**
 *
 * ⚠ **WIDENED 2026-08-11 by the product owner; the strict reading this function shipped with is now
 * WRONG and is recorded here rather than deleted.** Asked whether *"the bloodline is over"* means *no
 * living descendant* or *no continuing line*, the owner answered: **"bloodline is over means no
 * continuing line."** So the trigger is no longer *"nobody is alive"* but *"nobody is alive **on a line
 * this deed carries forward**"* — {@link continuesTheLine}, one call per recorded descendant.
 *
 * MEASURED difference, and it is one shape only: a `ZUHUR_ONLY` deed whose only living blood
 * descendants sit on broken daughter lines. Before the widening that register RETAINED the whole
 * distributable and flagged `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`; it now TRIGGERS and the deed's
 * مآل takes. Under `ZUHUR_AND_BUTUN` — or where the deed records no recognisable term at all —
 * `continuesTheLine` collapses to `active` and the behaviour is bit-for-bit the old one.
 *
 * ✓ **WIDENED AGAIN 2026-08-17 (memo Q5, product owner) — TO EVERY ENTITLEMENT ORDER.** R7-d's widening
 * was scoped by engineering to `LINEAGE_CONTINUATION`, the one order whose *entitlement* path consumes
 * the continuation term; `ORDERED` and `SHARED` kept the strict *no-living-descendant* reading, so one
 * مآل clause fired at two different moments depending on an unrelated setting. The owner retired the
 * strict reading: **the continuation stipulation, not the entitlement order, defines whose line counts.**
 * The same one shape moves on those orders as moved on lineage in 2026-08-11, for the same reason.
 *
 * The trigger is *the bloodline being over*, which is still **not** the same as *"no beneficiary is
 * entitled this period"* — the three boundaries in {@link continuesTheLine}'s doc are the whole
 * difficulty, and each of them still HOLDS the reversion:
 *
 *  · **triggers only when no descendant on record keeps a continuing line going**;
 *  · **does not trigger** when a continuing line lives and merely nobody is entitled — a zero deed
 *    weight on every living head (`ORDERED`/`SHARED`), a head waiting behind a living ancestor, a gate
 *    withholding a payment. The pool is retained as before (`NO_ELIGIBLE_BENEFICIARIES`) and the run
 *    carries `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`. Money that waits is recoverable; money paid
 *    to a charity is not.
 *
 * ⚠ **The bloodline is `lineage.depthById` — the CERTIFIED graph — and never a `kind` filter.** Keying
 * an eligibility fact on `kind` is the unrepaired proxy behind the whole escape class, and a bloodline
 * the engine could not certify must not be able to declare itself over. On a `FAMILY_DHURRI` waqf that
 * partitions the cohort exactly: R6's pass 4 puts every `FAMILY` and `CATEGORY_ONLY` member into the
 * graph, pass 3 keeps every jiha out of it, and a reversion is refused on every other waqf type — so
 * `cohort = recordedBloodline ⊎ takers`, with no third class.
 *
 * ⚠ **Still OPEN and NOT widened by this change: R7-D1's placeholder hold, which the owner confirmed in
 * the same breath** (*a register of unenumerated placeholders must "hold the reversion"*). It is applied
 * below, after the continuing-line test and independently of it.
 *
 * @throws `SHART_INCOMPLETE` / `REVERSION_WITH_NO_RECORDED_BLOODLINE` when a clause is recorded over an
 *   empty family register. ∅ is *"not yet enrolled"*, not *"extinct"*.
 */
function reversionOutcome(
  input: DistributionInput,
  lineage: LineageIndex,
  byId: ReadonlyMap<string, BeneficiaryInput>,
  continuation: ContinuationStipulation | null,
): ReversionOutcome {
  // R7-c · NEVER INFERRED. Not "the only beneficiary left is a charity"; not "a jiha is present".
  if (input.reversion === null) return REVERSION_NONE;

  // Already validated at Stage 0 by `assertReversionLegible`: kind recognised, list non-empty, no
  // duplicates, every id present, every id a CHARITABLE_JIHA, waqfType !== PUBLIC_CHARITABLE.
  const takerIds: ReadonlySet<string> = new Set(input.reversion.ultimateTakerIds);

  const recordedBloodlineIds = [...lineage.depthById.keys()].sort(compareBeneficiaryIds);
  const livingBloodlineIds = recordedBloodlineIds.filter((id) => byId.get(id)?.active === true);
  // R7-d (2026-08-11) · THE TRIGGER'S OWN LIST. Descent + liveness + the deed's continuation term, one
  // shared ancestor walk per head — never an exclusion code, never `entitledBloodlineCount`, never a
  // line's status. Under `ZUHUR_AND_BUTUN`, or where the deed records no recognisable term, this equals
  // `livingBloodlineIds`. ⚠ Since memo Q5 the entitlement order does NOT enter this — see the call site.
  const continuingBloodlineIds = livingBloodlineIds.filter((id) => {
    const descendant = byId.get(id);
    return descendant !== undefined && continuesTheLine(descendant, continuation, lineage);
  });

  if (recordedBloodlineIds.length === 0) {
    throw shartIncomplete(
      `the deed records a reversion to ${String(takerIds.size)} ultimate taker(s), but no descendant of the waqif is on record at all. An empty family register is "not yet enrolled", not "the bloodline is over": the engine cannot certify the extinction of a family it has never been shown, and will not pay a charity because the data entry is incomplete`,
      {
        field: 'reversion.ultimateTakerIds',
        refusal: 'REVERSION_WITH_NO_RECORDED_BLOODLINE',
        waqfType: input.waqfType,
        entitlementOrder: input.entitlementOrder,
        ultimateTakerIds: [...takerIds],
        recordedBloodlineCount: 0,
      },
    );
  }

  if (continuingBloodlineIds.length > 0) {
    return {
      kind: 'PENDING',
      takerIds,
      livingBloodlineIds: Object.freeze(livingBloodlineIds),
      continuingBloodlineIds: Object.freeze(continuingBloodlineIds),
    };
  }

  // ⚠ EXTINCTION CANNOT BE CERTIFIED FROM A PLACEHOLDER. Closes R7-D1.
  //
  // A `CATEGORY_ONLY` member is a placeholder for descendants **not yet enumerated** — "the children of
  // Branch A, not yet enrolled". R6 pass 4 forces a lineage edge onto it on a ذري waqf, so it is in
  // `lineage.depthById` and counts as recorded bloodline. That is correct and useful in one direction
  // and invalid in the other:
  //
  //   **a placeholder is sound evidence FOR a living bloodline, and no evidence at all AGAINST one.**
  //
  // Its `active: false` records that a PLACEHOLDER is not in force — nobody's death. Reading it as a
  // family's extinction let the charity take everything: MEASURED end to end, the R6-D1 cohort verbatim
  // (two inactive placeholders + one named taker, ORDERED) paid the charity 27,500,000 of 27,500,000
  // halalas — R6-D1's exact payload, restored one `reversion` field later, with `I-R1` still reported
  // as checked. The control proves it was the placeholder doing the work: the same record with
  // `active: true` blocks the charity and pays the placeholder instead.
  //
  // So the reversion does NOT fire while any placeholder stands among the recorded descendants: the
  // pool is retained and the run says why. Same fail-safe direction as the living-but-not-entitled case
  // (R7-d) and for the same reason — money that waits is recoverable, money paid to a charity is not.
  //
  // ⚠ **UNCHANGED BY THE 2026-08-11 WIDENING, AND THE OWNER CONFIRMED IT IN THE SAME BREATH** — a
  // register of unenumerated placeholders must *"hold the reversion"*. The hold is applied HERE, after
  // and independently of the continuing-line test, and it wins whatever that test said: a placeholder's
  // `lineageLink` is the register's guess at where a branch hangs, and it says nothing about the lines
  // of the people it stands for. The engine cannot certify that no line continues when it was never
  // shown who exists — under `ZUHUR_ONLY` least of all, where the answer turns on each unrecorded
  // person's chain of links. A widened trigger over a placeholder is R7-D1's payload with one extra
  // step of reasoning in front of it.
  // This mirrors the rationale already carried by `REVERSION_WITH_NO_RECORDED_BLOODLINE` ("the engine
  // cannot certify the extinction of a family it has never been shown") and by
  // `REVERSION_ON_CHARITABLE_WAQF`; R7-D1 was the asymmetry that those two left on the one waqf type
  // where a reversion is legal.
  //
  // ⚠ TODO(surface) — the owner has NOT been asked what an inactive placeholder means. Two readings:
  // (a) it retires a branch that was never enumerated, in which case extinction may be certifiable
  // once every placeholder is inactive; (b) it says nothing about whether those people exist, which is
  // what is implemented. If (a) is right the deed needs a way to say "this branch is closed" that is
  // distinguishable from "this placeholder is not in force", because paying a charity on the strength
  // of the second is what this block refuses.
  const unenumeratedIds = recordedBloodlineIds.filter(
    (id) => byId.get(id)?.kind === 'CATEGORY_ONLY',
  );
  if (unenumeratedIds.length > 0) {
    return {
      kind: 'PENDING',
      takerIds,
      // ⚠ The REAL living list, not `[]`. Since the widening a placeholder-held register can also hold
      // living descendants — ones on broken lines, which no longer hold the reversion themselves. The
      // flag/reason split below keys on `unenumeratedBloodlineIds`, so the honest list costs nothing
      // there and a trace that claimed "0 living" over a register with survivors would be false.
      livingBloodlineIds: Object.freeze(livingBloodlineIds),
      continuingBloodlineIds: Object.freeze([]),
      unenumeratedBloodlineIds: Object.freeze(unenumeratedIds),
    };
  }

  return {
    kind: 'APPLIED',
    takerIds,
    recordedBloodlineCount: recordedBloodlineIds.length,
    // Empty under `ZUHUR_AND_BUTUN`, and wherever no recognisable term was recorded, since there APPLIED
    // still implies nobody living. ⚠ No longer empty on ORDERED/SHARED as a matter of course (memo Q5).
    livingNonContinuingBloodlineIds: Object.freeze(livingBloodlineIds),
  };
}

/**
 * A recorded ultimate taker's verdict — governed by the **reversion clause, not by the entitlement
 * order**, so it does not go through `lineageFrontierVerdict` / `orderedExclusionReason` /
 * `sharedExclusionReason` at all.
 *
 * ⚠ **DEFAULT-EXCLUDED IS THE LOAD-BEARING BIT.** Before R7 an untiered member was simply never tested
 * by `orderedExclusionReason` — that *is* R6-D1/ESC-1's payload, measured at 13,750,000 halalas taken
 * from a living ṭabaqa-1 descendant. A taker that reached an `ORDERED` cohort without this ladder would
 * reproduce it exactly. So the taker is excluded by default and becomes entitled **only** on `APPLIED`.
 *
 * ✓ **AND THIS LADDER IS ONE OF THE TWO THINGS THAT CERTIFY G-9 CLAUSE 3 — memo Q1, product owner
 * 2026-08-17: "I-R1 is the guarantee."** Clause 3 is *"ordered mode excludes lower tiers while upper
 * live"*, and it is certified in two halves that must be kept apart: invariant **I5 asserts tier
 * exclusion over DESCENDANTS**, while an untiered recorded ultimate taker is **by design outside tier
 * logic** — it stands in no generation, so no tier code may ever decide it. What guarantees its line is
 * this default exclusion plus **I-R1's universal mirror** (no charity paid a halala in the same run as
 * any certified descendant). Neither claim substitutes for the other, and nothing in this file may say
 * I5 covers the taker's line.
 *
 * The rungs, in precedence order:
 *
 * 1. the taker's **own** status — a dissolved or out-of-scope jiha receives nothing, and its share is
 *    retained rather than redistributed to the other takers;
 * 2. **a line the deed continues is still going** ⇒ `REVERSION_PENDING_LIVING_BLOODLINE` (temporary —
 *    it reverses when the last continuing line ends). ⚠ Since 2026-08-11 this rung is NOT *"any
 *    descendant is alive"*: a survivor on a line the deed does not continue no longer blocks the taker;
 *    see {@link continuesTheLine};
 * 3. **the deed gives this taker a zero share** ⇒ `ZERO_STIPULATED_WEIGHT`. This is the one place the
 *    code appears on the lineage path, because a taker's share IS its deed weight (R7-e). An
 *    **all**-zero taker vector is refused upstream instead (`ULTIMATE_TAKER_WEIGHTS_UNUSABLE`).
 */
function ultimateTakerVerdict(
  beneficiary: BeneficiaryInput,
  outcome: ReversionOutcome,
): LineageVerdict {
  if (!beneficiary.active) return EXCLUDED_INACTIVE;
  if (outcome.kind !== 'APPLIED') {
    // TWO REASONS, TWO CODES — see the matching run flags. This one is printed on the CHARITY's own
    // BR-505 statement, so "pending: the bloodline is living" must not appear on a register whose only
    // recorded descendants are placeholders. There the truth is that the family was never enumerated,
    // and the remedy is an enrolment rather than a death. Checked FIRST, because since the 2026-08-11
    // widening a placeholder-held register can also carry living descendants — ones on broken lines,
    // which no longer hold the reversion by themselves — so `livingBloodlineIds` is no longer empty
    // here and the placeholder is the operative reason.
    if (outcome.kind === 'PENDING' && (outcome.unenumeratedBloodlineIds ?? []).length > 0) {
      return { reason: 'REVERSION_PENDING_BLOODLINE_UNENUMERATED', blockingAncestorId: null };
    }
    return { reason: 'REVERSION_PENDING_LIVING_BLOODLINE', blockingAncestorId: null };
  }
  if (isZeroWeight(beneficiary.stipulatedWeight)) {
    return { reason: 'ZERO_STIPULATED_WEIGHT', blockingAncestorId: null };
  }
  return ENTITLED;
}

/**
 * The resolved mode, as a discriminated union.
 *
 * Built once, before the per-beneficiary loop, so the continuation stipulation is narrowed to
 * non-null exactly where the lineage test needs it — rather than being re-checked (or worse,
 * `!`-asserted) inside the loop.
 */
type ResolvedMode =
  | { readonly kind: 'LINEAGE'; readonly continuation: ContinuationStipulation }
  | { readonly kind: 'ORDERED'; readonly entitledTabaqa: number | null }
  | { readonly kind: 'SHARED' };

function basisFor(
  beneficiary: BeneficiaryInput,
  rule: EntitlementRule,
  lineageDepth: number | null,
  lineageLink: LineageLink | null,
  continuation: ContinuationStipulation | null,
): LineBasis {
  return {
    // The derived depth wins where it exists; `buildLineage` has already refused any disagreement,
    // so for a graph member the two values are equal and this coalesce is a statement of precedence
    // rather than a choice between two live answers.
    tabaqa: lineageDepth ?? beneficiary.tabaqa,
    line: beneficiary.line,
    branch: beneficiary.branch,
    kind: beneficiary.kind,
    rule,
    lineageDepth,
    parentId: beneficiary.parentId,
    lineageLink,
    continuationStipulation: continuation,
  };
}

function step(code: string, message: string, data?: Readonly<Record<string, string>>): TraceStep {
  return data === undefined
    ? { stage: 'RESOLVER', code, message }
    : { stage: 'RESOLVER', code, message, data };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Stage 2
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve the entitled cohort from the Shart al-Waqif.
 *
 * Order of operations, which is itself a rule:
 *
 * 1. {@link parseEntitlementOrder} — a malformed condition halts before anything else is computed,
 *    so no partial reasoning about a deed nobody can read is ever emitted.
 * 2. {@link assertSingleWaqfNature} — a waqf that **cannot exist** is refused before any reasoning
 *    about its cohort, and **before** the direct-use short-circuit.
 *
 *    ⚠ **I7 PRECEDENCE CHANGE (ADR-0009), stated because the previous comment here is now false.** S3
 *    put the `NA_DIRECT_USE` short-circuit *before* the joint-legs check, on the reasoning that a
 *    direct-use run moves no ghallah so refusing it for a missing leg would block a run whose answer
 *    was "no monetary distribution" either way. That reasoning does not survive R5: a `JOINT` waqf is
 *    not a waqf with an incomplete record, it is **not a waqf** — so a direct-use JOINT waqf is now
 *    refused, and the S3 test that pinned the opposite is inverted. I7's *substance* is unchanged and
 *    still unconditional **for runs that happen**: direct use ⇒ no cohort and no monetary line,
 *    whatever the period's revenue was.
 *
 *    `./engine.ts` calls this again at Stage 0, before `computeWaterfall`, so the refusal also
 *    outranks a money error (`DISTRIBUTION_NEGATIVE`) — a run on a waqf that cannot exist is void
 *    whatever its figures say. It is called here as well so the claim is true of the exported Stage-2
 *    function on its own, which is where the test suite drives it.
 * 3. {@link assertJihaNotTiered} (S3-D3) — ✓ **MOVED AHEAD OF THE SHORT-CIRCUIT by memo Q7 (product
 *    owner, 2026-08-17): validity precedes short-circuits.** *A record that cannot describe a real
 *    endowment halts even when nothing would be paid.* It used to run below the short-circuit,
 *    which is what made ESC-2 reachable: a tiered jiha on a **direct-use** waqf computed while the same
 *    record on any other order was refused, so the engine answered one precedence question in two
 *    directions (`WAQF_TYPE_JOINT_NOT_SUPPORTED` refuses a direct-use JOINT waqf; `JIHA_TIERED` did not).
 * 4. {@link buildLineage} — on **every** order, because descent is a fact about the person, and
 *    (⊕ Q7, second pass) **above the short-circuit**, because nine of its ten refusals are validity
 *    checks in exactly the sense step 3 is. ⚠ It **must** precede step 8: R-FRONTIER's walk iterates
 *    the ancestor chains this builds, and the guarantee that the walk terminates is `buildLineage`'s
 *    refusal of every cycle, not a bound inside the walk.
 * 5. The `NA_DIRECT_USE` short-circuit — an empty cohort. No continuation parse, no verdict, no
 *    weights, no flag: none of those facts is read on a run with no monetary line.
 *
 *    ⚠⚠ **THE SENTENCE THAT STOOD HERE WAS FALSE, AND IT IS QUOTED RATHER THAN QUIETLY REPLACED,
 *    BECAUSE A COMMENT ASSERTING A PROTECTION THE CODE DOES NOT HAVE IS THIS REPO'S MOST EXPENSIVE
 *    RECURRING DEFECT.** It read: *"No continuation parse, no lineage build, no flag: none of those
 *    facts is read on a run with no monetary line. **Only validity outranks it.**"* Shipped with Q7's
 *    first pass, which moved **one** check ({@link assertJihaNotTiered}) — so the code answered ESC-2
 *    for a tiered jiha and went on answering the identical precedence question the *other* way for
 *    **seven** further discriminators, while this line claimed the general rule. MEASURED at the time, by
 *    driving `runDistribution` on each defect shape under all four orders: `LINEAGE_LINK_UNRECOGNISED`,
 *    `LINEAGE_EDGE_ON_NON_DESCENDANT`, `LINEAGE_PARENT_UNKNOWN`, `LINEAGE_CYCLE` (both the 1-cycle and
 *    a 2-cycle), `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` and `TABAQA_MISMATCHES_LINEAGE_DEPTH` all refused on
 *    `ORDERED`/`SHARED`/`LINEAGE_CONTINUATION` and **RESOLVED** on `NA_DIRECT_USE`, and
 *    `BENEFICIARY_ID_DUPLICATED` did the same through the exported Stage-2 function. The claim is now
 *    true because step 4 moved, not because the wording was softened.
 * 6. {@link parseContinuationStipulation} on the lineage order, then {@link entitlementRuleFor} — the
 *    label every line's basis carries (BR-505).
 * 7. **R7 · the extinction trigger** (`reversionOutcome`) — after the graph, before any verdict, so
 *    the test runs over the **certified** bloodline and no taker's verdict is reached before it is
 *    known whether the family still exists. An empty family register refuses
 *    (`REVERSION_WITH_NO_RECORDED_BLOODLINE`); an all-zero taker weight vector on a triggered run
 *    refuses (`ULTIMATE_TAKER_WEIGHTS_UNUSABLE`) rather than being split equally. ✓ Its continuation
 *    term is {@link recogniseContinuationStipulation}'s, **not** step 6's — one trigger on every order
 *    (memo Q5, product owner 2026-08-17).
 *
 *    ⚠ Q7 · both of its refusals stay **below** the short-circuit, and that is a classification, not an
 *    oversight: `REVERSION_WITH_NO_RECORDED_BLOODLINE` refuses an incomplete family register (*"∅ is
 *    not yet enrolled, not extinct … will not pay a charity because the data entry is incomplete"*) and
 *    `ULTIMATE_TAKER_WEIGHTS_UNUSABLE` refuses a weight vector that cannot split **an amount**. Both are
 *    payment checks by their own stated reason, and a direct-use run has no amount to split and pays no
 *    charity. See {@link buildLineage}'s pass 4 for the same distinction argued at length.
 * 8. The per-beneficiary verdict ({@link lineageFrontierVerdict} on the lineage path,
 *    `ultimateTakerVerdict` for a recorded ultimate taker on any path) over a COPY sorted into
 *    ascending `beneficiaryId` (I8, I9).
 * 9. Per-capita weights and the `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` flag (R3) — computed over
 *    the entitled **bloodline** only, so a reverted run's 70/30 takers do not raise a flag claiming
 *    deed weights were not applied while they were the only thing applied.
 * 10. The two mutually exclusive R7 flags, each raised only where it discriminates.
 *
 * // TODO(surface) — ADR-0009 open question 1, and the most likely source of a beneficiary dispute
 * // about a statement: **"per capita ALWAYS" vs "deed weights govern where the deed explicitly
 * // allocates them" was never put to the product owner as its own question.** They chose per capita
 * // over per stirpes, which is a different question. Until it is answered, a Shart figure recorded
 * // against a family beneficiary is visibly not applied on every lineage run — the honest position,
 * // but not a stable one.
 * //
 * // TODO(surface) — ADR-0009 open question 2, the sharpest edge of R3: a lineage-cohort member whose
 * // recorded `stipulatedWeight` is `'0'` is **ELIGIBLE and paid an equal share**, because weights
 * // are not applied. Under ORDERED/SHARED the same member is excluded `ZERO_STIPULATED_WEIGHT`, so
 * // the two paths now disagree about the same recorded fact — and this one moves money to someone
 * // the deed's own figure gave nothing.
 * //
 * // TODO(surface) — ADR-0009 open question 5: a `CATEGORY_ONLY` placeholder with no lineage fact is
 * // REFUSED under lineage ({@link buildLineage} pass 4). That is engineering's call, not the owner's
 * // rule. A per-capita denominator is exquisitely sensitive to head count — one unnamed grandchild
 * // counted or not changes every other beneficiary's amount — so refusing is the safe direction, but
 * // "excluded pending identification" is an equally defensible reading.
 *
 * @throws `DomainError('SHART_INCOMPLETE')` carrying a `SHART_REFUSALS` discriminator in
 *   `details.refusal` — an unreadable order, continuation term or reversion clause, a joint waqf, a
 *   cohort mixing a charity with a bloodline **concurrently**, an invalid lineage graph, a reversion
 *   over an empty family register, or a triggered reversion whose taker weights are all zero.
 */
export function resolveEntitlement(input: DistributionInput): EntitlementResolution {
  const trace: TraceStep[] = [];
  const flags: RunFlag[] = [];

  const order = parseEntitlementOrder(input.entitlementOrder);

  // R5 · unconditional, and BEFORE the direct-use short-circuit. See the precedence note above.
  assertSingleWaqfNature(input);

  // ✓ Q7 / ESC-2 (product owner, 2026-08-17) · VALIDITY PRECEDES SHORT-CIRCUITS. This call used to sit
  // AFTER the block below, which meant a self-contradicting record — a charitable jiha sitting in a
  // generational ṭabaqa — was accepted on a direct-use waqf and refused on every other order. The owner
  // ruled: *a record that cannot describe a real endowment halts even when nothing would be paid.* So the
  // engine now answers the precedence question ONE way everywhere (`assertSingleWaqfNature` already did,
  // for JOINT, since S3), and ESC-2's two reachable shapes — a tiered jiha on a خيري direct-use waqf, a
  // tiered ultimate taker on a ذري direct-use waqf — are refused `JIHA_TIERED` rather than computing with
  // the contradiction unreported. No new discriminator: the record is wrong for exactly the reason
  // `JIHA_TIERED` already names, and minting a second name for one deed defect would make an operator
  // learn two.
  assertJihaNotTiered(input);

  // ⚠ HOISTED WITH `buildLineage` AND FOR EXACTLY ONE REASON: TO KEEP A PRE-EXISTING PRECEDENCE THAT
  // Q7 DOES NOT TOUCH. Both of these are no-ops on `NA_DIRECT_USE` — `parseContinuationStipulation` is
  // reached only under `LINEAGE_CONTINUATION`, and `entitlementRuleFor` returns `NA_DIRECT_USE` on its
  // first line — so hoisting them past the short-circuit changes nothing about a direct-use run. What it
  // preserves is the order on a PAYING run: the continuation parse has outranked a lineage-graph refusal
  // since R2, so a `LINEAGE_CONTINUATION` deed with no continuation term reports
  // `CONTINUATION_STIPULATION_UNRECOGNISED` and not whatever its family register also gets wrong.
  //
  // MEASURED WHY THIS IS HERE: the first attempt at this change hoisted `buildLineage` alone, and a
  // ذري `LINEAGE_CONTINUATION` deed with a null continuation term AND an edgeless member flipped from
  // `CONTINUATION_STIPULATION_UNRECOGNISED` to `LINEAGE_LINK_MISSING`. That is a different precedence
  // question, on the money-moving path, changed as a side effect of answering Q7 — which is precisely
  // the kind of unasked-for widening this sprint has been paying for. It was measured and undone.
  const continuation =
    order === 'LINEAGE_CONTINUATION'
      ? parseContinuationStipulation(input.continuationStipulation)
      : null;
  const rule = entitlementRuleFor(order, input.waqfType, continuation);

  // ⊕ Q7, SECOND PASS · THE SAME RULE, APPLIED TO THE REST OF THE CHECKS RATHER THAN TO ONE.
  //
  // This call used to sit BELOW the short-circuit, and the first pass at memo Q7 moved only
  // `assertJihaNotTiered` — which left the engine answering the owner's precedence question in two
  // directions for SEVEN further discriminators while the comment above the short-circuit claimed the
  // general rule. MEASURED before this move, by driving `runDistribution` on one minimal defect record
  // per discriminator under all four orders: `LINEAGE_LINK_UNRECOGNISED`,
  // `LINEAGE_EDGE_ON_NON_DESCENDANT`, `LINEAGE_PARENT_UNKNOWN`, `LINEAGE_CYCLE` (in two shapes — the
  // self-parent and a two-member cycle), `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` and
  // `TABAQA_MISMATCHES_LINEAGE_DEPTH` each refused on `ORDERED`/`SHARED`/`LINEAGE_CONTINUATION` and
  // RESOLVED on `NA_DIRECT_USE`; `BENEFICIARY_ID_DUPLICATED` did the same through the exported Stage-2
  // function, which is the only route that reaches it (the contract door refuses a duplicate id first).
  // Eight record shapes, seven discriminators. Pinned in `__tests__/q7-validity-precedence.test.ts`.
  //
  // Every one of those refuses a record that CONTRADICTS ITSELF or is ILLEGIBLE — a person who is their
  // own ancestor, a parent edge naming nobody, a subtree hanging off a charity, a register whose
  // declared ṭabaqa disagrees with its own edges, a descent link outside {SON, DAUGHTER}. None of them
  // is about an amount, a gate or an entitlement outcome, so the owner's ruling reaches all of them:
  // *a record that cannot describe a real endowment halts even when nothing would be paid.*
  //
  // ⚠ ONE of `buildLineage`'s ten refusals does NOT move, and it is `LINEAGE_LINK_MISSING` — a
  // completeness requirement rather than a contradiction, scoped inside `buildLineage` itself, with the
  // full argument and its TODO(surface) at that pass. Two more stay below at step 7
  // (`REVERSION_WITH_NO_RECORDED_BLOODLINE`, `ULTIMATE_TAKER_WEIGHTS_UNUSABLE`) for the same reason.
  // So the direct-use path still builds no cohort and resolves no entitlement — it merely no longer
  // accepts a family register that could not exist.
  const lineage = buildLineage(input);

  if (order === 'NA_DIRECT_USE') {
    // I7: direct use (intifāʿ mubāshir) has no cohort and no monetary line, whatever the period's
    // revenue was. Any positive distributable is reported as `totals.retainedMinor` by Stage 5;
    // where it then goes is OQ-01 sub-question 2 and is unsigned — nothing is decided here.
    trace.push(
      step(
        'ENTITLEMENT_ORDER_RESOLVED',
        'entitlement order NA_DIRECT_USE resolved to rule NA_DIRECT_USE',
        {
          order,
          rule: 'NA_DIRECT_USE',
          waqfType: input.waqfType,
          continuationStipulation: 'null',
          beneficiaryCount: String(input.beneficiaries.length),
        },
      ),
      step(
        'NA_DIRECT_USE_SHORT_CIRCUIT',
        // ⚠ THE PREVIOUS WORDING IS NOW FALSE AND IS REPLACED, NOT TRIMMED. It said the lineage graph
        // was "not read at all", which was true until the call above moved: a direct-use run now
        // VALIDATES the family register's integrity and then resolves no entitlement from it. Leaving
        // the old sentence would have published, on the run's own trace, a claim about what the engine
        // did not look at that the engine had just looked at.
        "direct-utilization waqf: beneficiaries benefit from the asset itself, so no entitled cohort and no monetary line is resolved. The recorded family tree WAS validated for integrity (a cycle, a dangling parent edge, an unreadable descent link or a ṭabaqa disagreeing with its own edges halts a direct-use deed exactly as it halts a paying one — product owner, 2026-08-17), but no entitlement is resolved from it: the continuation stipulation and the deed's reversion clause (مآل الوقف) are not read at all, the reversion is CARRIED, not applied, and no flag is raised. A member whose descent is simply UNRECORDED is not refused here, because that refusal's reason is that the engine will not pay someone it cannot place, and this run pays nobody.",
        {
          order,
          beneficiaryCount: String(input.beneficiaries.length),
          // ⊕ Q7 · what the validation certified, published so "no refusal" is not read as "not
          // checked". `0` on a cohort whose members record no descent at all is the ordinary state of
          // §08's Example C, not a failure.
          lineageGraphValidated: 'true',
          lineageGraphMemberCount: String(lineage.depthById.size),
          // A recorded Shart term this path does not consume is named rather than silently dropped —
          // `CONTINUATION_STIPULATION_NOT_APPLIED`'s precedent, without minting a flag that would fire
          // on a run where nothing could have moved anyway.
          reversionRecorded: input.reversion === null ? 'false' : 'true',
          reversionUltimateTakerCount:
            input.reversion === null ? '0' : String(input.reversion.ultimateTakerIds.length),
        },
      ),
    );
    return {
      order,
      rule: 'NA_DIRECT_USE',
      continuation: null,
      entitledTabaqa: null,
      resolved: [],
      entitledIds: [],
      excludedCount: 0,
      flags: Object.freeze([]),
      trace,
    };
  }

  trace.push(
    step('ENTITLEMENT_ORDER_RESOLVED', `entitlement order ${order} resolved to rule ${rule}`, {
      order,
      rule,
      waqfType: input.waqfType,
      continuationStipulation: continuation ?? 'null',
      beneficiaryCount: String(input.beneficiaries.length),
    }),
  );

  if (order !== 'LINEAGE_CONTINUATION' && input.continuationStipulation !== null) {
    // A recorded Shart term this path does not consume must be VISIBLY not-applied. Whether the
    // continuation term should also filter eligibility on ORDERED/SHARED — i.e. whether a deed can be
    // both al-aʿlā fa-l-aʿlā and ZUHUR_ONLY — is ADR-0009 open question 3. If it should, this flag is
    // marking a defect: a buṭūn descendant is being paid on a deed that excluded them.
    //
    // ⚠ NARROWED IN MEANING BY Q5 (product owner, 2026-08-17), and the flag is KEPT: the term is now
    // consumed by the REVERSION trigger on every order (`recogniseContinuationStipulation`), so "not
    // applied" is true of ELIGIBILITY only. Deleting the flag would claim open question 3 was answered;
    // leaving the old wording would claim the term is unused, which is now false. Both are refused.
    flags.push('CONTINUATION_STIPULATION_NOT_APPLIED');
    trace.push(
      step(
        'CONTINUATION_STIPULATION_NOT_APPLIED',
        `the deed records a continuation stipulation, but entitlement order ${order} does not consume one when deciding WHO IS ENTITLED among the living. It is carried, not applied there, and never silently dropped. ⚠ It IS applied to the deed's reversion trigger — whether any line the deed continues is still going (مآل الوقف; product owner, 2026-08-17) — so this flag is about eligibility, not about the term being unused.`,
        {
          order,
          recordedStipulation: echoShartValue(input.continuationStipulation),
          openQuestion: 'ADR-0009 open question 3',
          // The one scope this flag does NOT cover, published so a consumer cannot over-read it.
          appliedToReversionTrigger: 'true',
        },
      ),
    );
  }

  // ⊕ Q7 · the graph was built ABOVE the short-circuit (step 4) — it is only REPORTED here, so the
  // monetary trace's step order is unchanged by the move. The trace step and the build are deliberately
  // separated rather than both hoisted: a `LINEAGE_GRAPH_RESOLVED` step on a direct-use run would claim
  // an entitlement graph was resolved on a run that resolves none, which is the false-comment defect in
  // trace form. What the direct-use run publishes instead is `lineageGraphValidated` on its own step.
  //
  // Folded rather than `Math.max(...depths)`: a spread would put one argument per graph member on the
  // call stack, and a large family register is exactly the input that would find that limit.
  let maxDepth = 0;
  let rootCount = 0;
  for (const depth of lineage.depthById.values()) {
    if (depth > maxDepth) maxDepth = depth;
    if (depth === 1) rootCount += 1;
  }
  trace.push(
    step(
      'LINEAGE_GRAPH_RESOLVED',
      "The waqif's family tree was derived from the recorded parent edges; every declared ṭabaqa was cross-checked against its derived depth.",
      {
        graphMemberCount: String(lineage.depthById.size),
        // Children of the waqif — depth 1 is exactly "an empty proper-ancestor chain".
        rootCount: String(rootCount),
        maxDepth: String(maxDepth),
        continuationStipulation: continuation ?? 'null',
      },
    ),
  );

  /* ── R7 · مآل الوقف · does the deed's reversion clause take effect this period? ─────────── */
  // Placed HERE — after the graph is built and cross-checked, before any per-beneficiary verdict — and
  // the placement is itself a rule: the extinction test runs over the CERTIFIED bloodline, and no
  // verdict may be reached for a taker before it is known whether the family still exists.
  const byId = new Map<string, BeneficiaryInput>();
  for (const beneficiary of input.beneficiaries) byId.set(beneficiary.id, beneficiary);
  // ✓ Q5 (product owner, 2026-08-17) · ONE TRIGGER EVERYWHERE. The comment that stood here read: "
  // `continuation` is non-null only on LINEAGE_CONTINUATION — the one order that consumes the deed's
  // continuation term. R7-d's widening therefore reaches exactly the deeds whose entitlement path already
  // applies ẓuhūr/buṭūn, and nowhere else." That scoping is RETIRED: the deed's recorded term now decides
  // whose line counts on `ORDERED` and `SHARED` too, so the same مآل clause fires at the same moment
  // whatever the (unrelated) entitlement order. `continuation` — the ENTITLEMENT term — is deliberately
  // NOT reused for this: it is null outside LINEAGE_CONTINUATION and would silently restore the asymmetry.
  const reversionContinuation =
    continuation ?? recogniseContinuationStipulation(input.continuationStipulation);
  const reversion = reversionOutcome(input, lineage, byId, reversionContinuation);

  if (reversion.kind !== 'NONE') {
    trace.push(
      step(
        'REVERSION_CLAUSE_RESOLVED',
        `the deed records a reversion (مآل الوقف) naming ${String(reversion.takerIds.size)} ultimate taker(s). A recorded taker receives NOTHING while any line the deed continues is still going, and takes the distributable once the recorded bloodline is over — "over" meaning NO CONTINUING LINE (product owner, 2026-08-11), not merely no survivor.`,
        {
          reversionKind: input.reversion === null ? 'null' : input.reversion.kind,
          ultimateTakerIds: [...reversion.takerIds].sort(compareBeneficiaryIds).join(','),
          recordedBloodlineCount: String(lineage.depthById.size),
          // Q5 · the term the TRIGGER used, which since 2026-08-17 is the deed's recorded one on every
          // order. Publishing the entitlement term here would misreport the test that just ran.
          continuationStipulation: reversionContinuation ?? 'null',
          triggered: reversion.kind === 'APPLIED' ? 'true' : 'false',
        },
      ),
      reversion.kind === 'APPLIED'
        ? step(
            'REVERSION_TRIGGERED',
            `no line this deed continues is still going: of ${String(reversion.recordedBloodlineCount)} certified descendant(s) on record, ${String(reversion.livingNonContinuingBloodlineIds.length)} ${reversion.livingNonContinuingBloodlineIds.length === 1 ? 'is' : 'are'} living and ${reversion.livingNonContinuingBloodlineIds.length === 1 ? 'sits' : 'sit'} on a line this deed does NOT continue. The recorded bloodline is over and the endowment's ultimate taker(s) receive the distributable (مآل الوقف).`,
            {
              recordedBloodlineCount: String(reversion.recordedBloodlineCount),
              // ⚠ Was hardcoded `'0'`, which the widening made falsifiable: a ZUHUR_ONLY register whose
              // survivors all sit on broken daughter lines now triggers WITH living descendants on it.
              livingBloodlineCount: String(reversion.livingNonContinuingBloodlineIds.length),
              livingNonContinuingBloodlineIds:
                reversion.livingNonContinuingBloodlineIds.join(',') || 'none',
              continuationStipulation: reversionContinuation ?? 'null',
              ultimateTakerIds: [...reversion.takerIds].sort(compareBeneficiaryIds).join(','),
            },
          )
        : step(
            'REVERSION_NOT_TRIGGERED',
            // ⚠ THE QUALIFIER WAS NOT DECORATION, AND Q5 IS WHAT RETIRES IT. It read: "(measured WITHOUT
            // the deed's recorded continuation stipulation: entitlement order X does not consume one —
            // CONTINUATION_STIPULATION_NOT_APPLIED — so a survivor whose line that term would NOT carry
            // still counts as continuing here)", and it was necessary while the trigger's scoping was
            // engineering's: a `SHARED` deed RECORDING `ZUHUR_ONLY` whose only survivor was a son of a
            // deceased DAUGHTER retained 27,500,000 and said "1 descendant is living on a line this deed
            // continues" — a sentence that deed's own term contradicted. ✓ Since memo Q5 (product owner,
            // 2026-08-17) the term IS consumed by this test on every order, so the sentence is true
            // unqualified and the parenthesis is gone rather than reworded. The remaining arm covers the
            // one case where the term still is not consumed: the deed records NOTHING the engine
            // recognises, where the test is liveness alone and says so instead of implying a term.
            `the reversion did NOT trigger: ${String(reversion.continuingBloodlineIds.length)} descendant(s) of the waqif ${reversion.continuingBloodlineIds.length === 1 ? 'is' : 'are'} living on a line this deed continues${reversionContinuation === null && input.continuationStipulation !== null ? ` (measured on liveness alone: the deed's recorded continuation stipulation "${echoShartValue(input.continuationStipulation)}" is not one the engine recognises, so no line-continuation term could be applied — the fail-safe direction, since an unreadable term must never be the reason a charity is paid)` : ''}${(reversion.unenumeratedBloodlineIds ?? []).length > 0 ? `, or the register holds ${String((reversion.unenumeratedBloodlineIds ?? []).length)} unenumerated placeholder(s) whose people the engine has never been shown` : ''}, so the endowment's ultimate taker(s) receive nothing this period — whether or not any descendant is ENTITLED this period.`,
            {
              livingBloodlineIds: reversion.livingBloodlineIds.join(',') || 'none',
              livingBloodlineCount: String(reversion.livingBloodlineIds.length),
              continuingBloodlineIds: reversion.continuingBloodlineIds.join(',') || 'none',
              continuingBloodlineCount: String(reversion.continuingBloodlineIds.length),
              unenumeratedBloodlineIds:
                (reversion.unenumeratedBloodlineIds ?? []).join(',') || 'none',
              continuationStipulation: reversionContinuation ?? 'null',
              // Whether the continuing-line test consumed the deed's term at all, stated as its own fact
              // so a consumer never has to infer it from `continuationStipulation: 'null'` (which is also
              // what a deed that records nothing produces — a different situation). ⚠ Since Q5 this is
              // `false` ONLY when the deed records nothing recognisable; it is no longer a function of the
              // entitlement order, and a consumer that inferred the order from it was reading a
              // coincidence.
              continuationTermApplied: reversionContinuation === null ? 'false' : 'true',
              recordedContinuationStipulation:
                input.continuationStipulation === null
                  ? 'null'
                  : echoShartValue(input.continuationStipulation),
              ultimateTakerIds: [...reversion.takerIds].sort(compareBeneficiaryIds).join(','),
            },
          ),
    );
  }

  if (reversion.kind === 'APPLIED') {
    // R7-e · the takers split by their DEED weights (per capita is the bloodline's rule, not a
    // charity's). An all-zero vector has no normalisable reading, so it is REFUSED — never split
    // equally, and never allowed to fall through to `NO_ELIGIBLE_BENEFICIARIES`, which would hide an
    // unusable deed record behind an ordinary flag and retain the pool as though the deed were fine.
    const usable = [...reversion.takerIds].some((takerId) => {
      const taker = byId.get(takerId);
      return taker !== undefined && !isZeroWeight(taker.stipulatedWeight);
    });
    if (!usable) {
      throw shartIncomplete(
        `the recorded bloodline is over and the deed's reversion (مآل الوقف) takes effect, but every named ultimate taker carries a stipulated weight of zero. There is no normalisable reading of the deed's own figures, and the engine will not invent an equal split between charities the waqif may have weighted deliberately`,
        {
          field: 'reversion.ultimateTakerIds',
          refusal: 'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
          waqfType: input.waqfType,
          entitlementOrder: order,
          ultimateTakerIds: [...reversion.takerIds].sort(compareBeneficiaryIds),
        },
      );
    }
  }

  const mode: ResolvedMode =
    order === 'LINEAGE_CONTINUATION'
      ? { kind: 'LINEAGE', continuation: continuation ?? assertContinuationNarrowed() }
      : order === 'ORDERED'
        ? { kind: 'ORDERED', entitledTabaqa: lowestLivingTabaqa(input.beneficiaries) }
        : { kind: 'SHARED' };

  if (mode.kind === 'ORDERED') {
    const tieredCount = input.beneficiaries.filter(isTiered).length;
    trace.push(
      mode.entitledTabaqa === null
        ? step(
            'ORDERED_NO_LIVING_TABAQA',
            "no ṭabaqa holds a living member: every generational tier is extinct, so only untiered members can be entitled — a category placeholder, or (on a ذري waqf, and ONLY via the deed's recorded reversion clause) a charitable jiha as ultimate taker",
            { tieredCount: String(tieredCount) },
          )
        : step(
            'ORDERED_ENTITLED_TABAQA',
            `ṭabaqa ${String(mode.entitledTabaqa)} is the lowest-numbered tier holding a living member and is the entitled cohort (al-aʿlā fa-l-aʿlā)`,
            { entitledTabaqa: String(mode.entitledTabaqa), tieredCount: String(tieredCount) },
          ),
    );
  }

  // Sort a COPY: the input is the caller's, and `resolved` must be ascending by id for the residual
  // tie-break (I9) and the canonical serialization (I8). Never `localeCompare`.
  const ordered = [...input.beneficiaries].sort((a, b) => compareBeneficiaryIds(a.id, b.id));

  const resolved: ResolvedBeneficiary[] = [];
  const entitledIds: string[] = [];
  /**
   * The entitled BLOODLINE members only — takers filtered out.
   *
   * ⚠ Deliberately not "every entitled member": the per-capita honesty flag below is a claim about the
   * *family's* recorded weights, and a reverted run with 70/30 takers would otherwise raise a flag saying
   * deed weights were not applied while they were the only thing applied.
   */
  const entitledSources: BeneficiaryInput[] = [];
  let entitledBloodlineCount = 0;
  let excludedCount = 0;

  for (const beneficiary of ordered) {
    // R7 · a recorded ultimate taker's verdict comes from the REVERSION CLAUSE, not from the entitlement
    // order, so it bypasses all three order verdicts. It is EXCLUDED by default and becomes entitled only
    // when the bloodline is over — the absence of that default is exactly R6-D1/ESC-1's payload.
    const isTaker = reversion.kind !== 'NONE' && reversion.takerIds.has(beneficiary.id);

    // The lineage path answers with a verdict rather than a bare code, because R-FRONTIER's
    // exclusions name an ancestor and that name has to reach the trace unchanged. `ORDERED` and
    // `SHARED` name nobody — their reasons are about a tier or the member's own record — so they lift
    // into the same shape with a null ancestor rather than the shape being made optional.
    const orderVerdict: LineageVerdict = isTaker
      ? ultimateTakerVerdict(beneficiary, reversion)
      : mode.kind === 'LINEAGE'
        ? lineageFrontierVerdict(beneficiary, mode.continuation, lineage)
        : {
            reason:
              mode.kind === 'ORDERED'
                ? orderedExclusionReason(beneficiary, mode.entitledTabaqa)
                : sharedExclusionReason(beneficiary),
            blockingAncestorId: null,
          };

    /*
     * ✓ Q5's FORCED CONSEQUENCE (memo Q5, product owner 2026-08-17) — and it is forced, not chosen.
     *
     * Once the reversion has APPLIED, "no line this deed continues is still going" is a fact the run has
     * already acted on: the charity is entitled. On `ORDERED`/`SHARED` the entitlement path does **not**
     * consume the continuation term (ADR-0009 open question 3, still open), so a LIVING descendant sitting
     * on a line the deed abandoned — a daughter's son under `ZUHUR_ONLY` — came out of
     * `orderedExclusionReason` / `sharedExclusionReason` as ENTITLED. That state cannot be emitted: it
     * would pay a charity and a certified descendant out of one distributable, which is R5, which invariant
     * **I-R1's universal mirror refuses** as a `DISTRIBUTION_INVARIANT_BREACH`. MEASURED: the Q5 widening
     * with this block absent turned 15 of `continuing-line-adversarial`'s cases red on exactly that breach.
     *
     * Only three readings exist, and two are closed by the ruling: (i) exclude the abandoned line's
     * survivor, (ii) do not fire the trigger while any descendant lives — **the strict reading the owner
     * retired**, (iii) halt — Q5's option (c), which he declined. So (i) is the only one left, and the code
     * is the existing `BUTUN_LINE_NOT_CONTINUED`: their line is not one this deed carries forward, which is
     * the same fact the trigger just used. Nothing is invented — no new code, no new copy.
     *
     * ⚠ **WHAT THIS DOES AND DOES NOT ANSWER, precisely.** It does NOT answer open question 3: while any
     * line the deed continues is still going, a buṭūn survivor on an `ORDERED`/`SHARED` deed is entitled
     * exactly as before, and `CONTINUATION_STIPULATION_NOT_APPLIED` still says so. What it does is apply
     * *one* fact — the bloodline is over by the deed's own term — to **both** sides of the same run instead
     * of to the charity's side only. ⊕ SURFACED, because it changes who is paid on a real deed shape: the
     * same person can be entitled in one period and excluded in the next without their own record changing,
     * when the last continuing line ends. That is the ruling's arithmetic, not a discretion, and it is
     * written down here rather than left for a beneficiary to discover on a statement.
     */
    const verdict: LineageVerdict =
      orderVerdict.reason === null &&
      !isTaker &&
      reversion.kind === 'APPLIED' &&
      lineage.depthById.has(beneficiary.id)
        ? { reason: 'BUTUN_LINE_NOT_CONTINUED', blockingAncestorId: null }
        : orderVerdict;
    const exclusionReason = verdict.reason;
    const entitled = exclusionReason === null;

    const lineageDepth = lineage.depthById.get(beneficiary.id) ?? null;
    const lineageLink = lineage.linkById.get(beneficiary.id) ?? null;

    resolved.push({
      beneficiaryId: beneficiary.id,
      entitled,
      // Effective weight. An excluded member contributes 0 to the normalisation denominator, so a
      // consumer that forgets to filter on `entitled` still splits over the right total. On a lineage
      // cohort an eligible member contributes ONE HEAD (R3) — but NEVER a recorded ultimate taker: per
      // capita is the bloodline's rule and a charity is not a head of a bloodline (R7-e), so its deed
      // weight is the figure that applies. The deed's own figure is preserved on `source` in every case
      // — exclusion is not a rewrite of the deed, and neither is per capita.
      stipulatedWeight: !entitled
        ? '0'
        : mode.kind === 'LINEAGE' && !isTaker
          ? PER_CAPITA_WEIGHT
          : beneficiary.stipulatedWeight,
      exclusionReason,
      basis: basisFor(
        beneficiary,
        // R7 · the taker's BR-505 basis must name the rule that actually decided it. A charity paid a
        // family endowment's whole ghallah on a line stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY` is the exact
        // mis-statement ADR-0009 records as a defect. Run-level `entitlementRule` keeps the order's rule:
        // the deed's standing order did not change, its reversion clause took effect.
        isTaker && reversion.kind === 'APPLIED' ? 'ULTIMATE_TAKER_MAAL_AL_WAQF' : rule,
        lineageDepth,
        lineageLink,
        mode.kind === 'LINEAGE' ? mode.continuation : null,
      ),
      source: beneficiary,
      lineageDepth,
    });

    if (entitled) {
      entitledIds.push(beneficiary.id);
      if (!isTaker) {
        entitledSources.push(beneficiary);
        entitledBloodlineCount += 1;
      }
    } else {
      excludedCount += 1;
      trace.push(
        step(
          'BENEFICIARY_EXCLUDED',
          `beneficiary ${beneficiary.id} is not entitled this period: ${exclusionReason}`,
          {
            beneficiaryId: beneficiary.id,
            reasonCode: exclusionReason,
            tabaqa: beneficiary.tabaqa === null ? 'null' : String(beneficiary.tabaqa),
            lineageDepth: lineageDepth === null ? 'null' : String(lineageDepth),
            // The ancestor whose fact blocked them — the one whose link ended the line, or the one
            // still living who holds it. A beneficiary disputing "your line does not continue" or
            // "your father holds this" is entitled to be told WHICH ancestor, not merely that one
            // exists: naming them is what makes the exclusion checkable against the register.
            blockingAncestorId: verdict.blockingAncestorId ?? 'null',
            line: beneficiary.line,
            kind: beneficiary.kind,
          },
        ),
      );
    }
  }

  if (mode.kind === 'LINEAGE') {
    /*
     * R3's honesty obligation. The flag is owed whenever per capita actually **overrode** what the
     * deed recorded, and that is exactly two cases:
     *
     *  1. **The eligible cohort's recorded weights are not all the same figure.** Normalising an
     *     all-equal non-zero vector (`10:10:10`) gives the same equal thirds per capita does, so
     *     nothing was overridden and no flag is owed — a flag that fires on every run tells a reader
     *     nothing.
     *  2. **Every eligible weight is ZERO.** ⚠ Added by the S4 adversarial review; the original
     *     predicate was inequality alone, and its comment claimed that "every cohort whose weights
     *     are all '0' loses nothing". That claim was FALSE and it was the one case where the deed's
     *     own figure was most emphatically "nothing": an all-zero cohort has no normalisable deed
     *     vector at all, so per capita does not agree with the deed — it replaces it, and pays out
     *     100% of the distributable. The identical record under `ORDERED`/`SHARED` excludes every
     *     member (`ZERO_STIPULATED_WEIGHT`) and retains the whole distributable, so the two paths
     *     disagree completely about the same recorded fact. Whether a zero deed weight SHOULD
     *     exclude on the lineage path is ADR-0009 open question 2 and is NOT decided here; what is
     *     fixed is that the override is no longer silent. Driven by
     *     `__tests__/lineage-adversarial.test.ts` §7.
     */
    const distinctWeights = new Set(
      entitledSources.map((beneficiary) => canonicalWeight(beneficiary.stipulatedWeight)),
    );
    if (distinctWeights.size > 1 || distinctWeights.has('0')) {
      flags.push('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
      for (const beneficiary of entitledSources) {
        trace.push(
          step(
            'STIPULATED_WEIGHT_NOT_APPLIED',
            `beneficiary ${beneficiary.id} carries a deed-stipulated weight that was NOT applied: a lineage cohort shares per capita (ADR-0009 R3), one equal share per entitled head — the living head of each continuing line (R-FRONTIER).`,
            {
              beneficiaryId: beneficiary.id,
              deedWeight: beneficiary.stipulatedWeight,
              appliedWeight: PER_CAPITA_WEIGHT,
              rule: 'per capita — ADR-0009 R3',
              openQuestion: 'ADR-0009 open question 1',
            },
          ),
        );
      }
    }
  }

  /* ── R7 · the two reversion flags, each raised only where it discriminates ──────────────── */
  if (reversion.kind === 'APPLIED') {
    flags.push('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  } else if (reversion.kind === 'PENDING' && entitledBloodlineCount === 0) {
    // ⚠ The DISCRIMINATING states, and the fail-safe direction made visible: the whole distributable is
    // retained rather than going to a charity irreversibly. A flag that fired on every ordinary run
    // would tell a reader nothing, so these fire only here.
    //
    // TWO REASONS, TWO FLAGS — never one. They are not interchangeable and the difference is the whole
    // content of R7-D1:
    //
    //  · descendants are living ON A LINE THIS DEED CONTINUES but none is entitled this period — the
    //    line is present and something else withholds: a zero deed weight on every living head
    //    (ORDERED/SHARED), or a head waiting behind a living ancestor. ⚠ NARROWED 2026-08-11: "every
    //    survivor on a broken buṭūn line" used to be this flag's headline example and is now the
    //    opposite case — it TRIGGERS the reversion. A living descendant is no longer sufficient to
    //    raise this flag; a living descendant on a CONTINUING line is;
    //  · every recorded descendant is a PLACEHOLDER for people never enumerated, so the engine was
    //    never shown who exists and cannot certify extinction either way.
    //
    // Collapsing them would put a false statement on a beneficiary's BR-505 record — "the reversion did
    // not trigger because descendants are living" is untrue of a register on which nobody is recorded as
    // living, and a Nazir reading it would look for a family the register does not contain. Caught by
    // `reversion-adversarial.test.ts` §7 asserting the wrong flag's ABSENCE, which is the only way a
    // false-but-plausible reason code ever gets caught.
    if ((reversion.unenumeratedBloodlineIds ?? []).length > 0) {
      flags.push('REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED');
    } else {
      flags.push('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    }
  }

  trace.push(
    step(
      'ENTITLED_COHORT_RESOLVED',
      `${String(entitledIds.length)} of ${String(resolved.length)} recorded beneficiaries are entitled under ${rule}`,
      {
        rule,
        entitledCount: String(entitledIds.length),
        excludedCount: String(excludedCount),
        entitledTabaqa:
          mode.kind === 'ORDERED' && mode.entitledTabaqa !== null
            ? String(mode.entitledTabaqa)
            : 'null',
        // Per capita governs the BLOODLINE's shares; a reverted cohort's takers split by deed weight.
        perCapita: mode.kind === 'LINEAGE' ? 'true' : 'false',
        reversionApplied: reversion.kind === 'APPLIED' ? 'true' : 'false',
        entitledBloodlineCount: String(entitledBloodlineCount),
      },
    ),
  );

  return {
    order,
    rule,
    continuation: mode.kind === 'LINEAGE' ? mode.continuation : null,
    entitledTabaqa: mode.kind === 'ORDERED' ? mode.entitledTabaqa : null,
    resolved,
    entitledIds,
    excludedCount,
    flags: Object.freeze([...flags]),
    trace,
  };
}

/**
 * Unreachable: {@link parseContinuationStipulation} either returns a vocabulary member or throws, so
 * a `LINEAGE_CONTINUATION` run always holds a narrowed term by this point.
 *
 * Kept as a throw rather than a `!` assertion so that if the narrowing above is ever restructured
 * into something that *can* yield `null`, the run HALTS instead of silently resolving a lineage
 * cohort with no continuation term — which would pay a buṭūn descendant on a ZUHUR_ONLY deed.
 */
function assertContinuationNarrowed(): never {
  throw shartIncomplete(
    'entitlementOrder LINEAGE_CONTINUATION reached the cohort verdict with no narrowed continuation stipulation. The engine will not resolve a lineage cohort without the deed term that decides which lines continue',
    {
      field: 'continuationStipulation',
      refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED',
      received: 'null',
      recognised: [...CONTINUATION_STIPULATIONS],
    },
  );
}
