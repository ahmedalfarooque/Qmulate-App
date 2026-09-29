/**
 * `distribution/__tests__/arbitraries.ts` — reusable fast-check generators for the §08 engine.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE GENERATORS LIVE IN THEIR OWN MODULE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `distribution.property.test.ts` runs eleven property groups, most of which need the SAME notion
 * of "an arbitrary but well-formed distribution input". If each property built its own, a property
 * could pass because its private generator happened to avoid the shape that breaks the engine.
 * One shared generator means one place to widen coverage and one place to read what is (and is
 * not) being explored.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CENTRAL DESIGN PROBLEM: A VALID INPUT IS NOT A PRODUCT OF INDEPENDENT FIELDS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `parseDistributionInput` enforces five cross-field facts that no `fc.record` of independent
 * fields can satisfy by chance, and a generator that violates them produces `*_INPUT_INVALID`
 * noise instead of engine coverage. Each is therefore satisfied **by construction**, in the
 * generator's `.map`, not by `fc.pre`-filtering afterwards (a filter would silently shrink the
 * explored space and, at 10 000 runs, could quietly cost most of the budget):
 *
 *  1. `asOf` is ONE instant in TWO calendars — `toHijri(asOf.gregorian) === asOf.hijri`. Built with
 *     `dual()`, the same helper the caller is expected to use, so the property suite cannot pass
 *     with a second Hijri implementation in play.
 *  2. `deadline` is TWO DIFFERENT DAYS and is deliberately NOT cross-checked. Both halves are drawn
 *     independently, and the Hijri half is produced by `toHijri` of an independently drawn civil
 *     date purely so it is guaranteed CONVERTIBLE (`resolveBindingDeadline` calls `fromHijri`).
 *     The two deadlines genuinely diverge, which is what exercises decision D2's `EARLIER_OF`.
 *  3. `beneficiaries[].id` is unique — ids are minted positionally (`ben-000`, `ben-001`, …), never
 *     drawn, so a duplicate is impossible. They are zero-padded so that ASCENDING ID ORDER EQUALS
 *     ASCENDING MINT ORDER: the residual tie-break (I9) is defined on id order, and a padded id
 *     makes an assertion about "the first line" mean the same thing to the test and to the engine.
 *  4. `revenue.incomeMinor` is DERIVED as Σ INCOME receipts, and `capitalSource` is non-null exactly
 *     on CAPITAL rows. The corpus guard's refusals are then reached only by the properties that
 *     deliberately break this (see {@link corruptRevenue}), never by accident.
 *  5. `policy.roundingUnitMinor` is `1n` and `roundingMethod` is the one implemented method. Both
 *     other values are refusals, and they are asserted as refusals in their own property rather
 *     than being allowed to poison every other one.
 *
 * The remaining couplings are structural rather than schema-level, and ADR-0009 replaced the one that
 * used to be here. What it USED to say: "a `JOINT` waqf must declare BOTH legs, so `waqfType` is
 * chosen after the cohort and JOINT is generated often." Under ADR-0009 R5 a JOINT waqf is **refused
 * outright** and so is any cohort mixing a `CHARITABLE_JIHA` with a `FAMILY` member — so generating
 * either into the general arbitrary would spend the entire run budget proving one throw. The three
 * that now hold:
 *
 *  6. **A cohort has ONE NATURE.** Every cohort is drawn as either ذري (family: `FAMILY` members plus
 *     optional `CATEGORY_ONLY` placeholders) or خيري (charitable: `CHARITABLE_JIHA` members plus
 *     optional placeholders) — **never both** — and `waqfType` follows from the nature. `JOINT` is
 *     never generated into a computing run; it is generated deliberately by
 *     {@link arbRefusedNatureInput}, which is where a guaranteed refusal belongs.
 *  7. **The lineage graph is ACYCLIC, ROOTED AT THE WAQIF, AND ITS ṬABAQA IS DERIVED.** A parent is
 *     only ever drawn from an EARLIER index, so a cycle is structurally impossible; `tabaqa` is
 *     computed as `depth(parent) + 1` and never drawn. Both matter for the same reason: a generator
 *     that emitted a mismatched `tabaqa`, or a cycle, would make **every** run a
 *     `SHART_INCOMPLETE` refusal and the whole suite would prove nothing while staying green. The
 *     malformations have their own arbitrary ({@link arbMalformedLineageInput}).
 *  8. **`continuationStipulation` is non-null exactly when the order is `LINEAGE_CONTINUATION`**, plus
 *     a deliberate minority of `ORDERED`/`SHARED` runs that record one so
 *     `CONTINUATION_STIPULATION_NOT_APPLIED` is exercised. On the lineage path an absent or
 *     unrecognised value halts, so drawing it freely would again buy a throw instead of coverage.
 *     `LINEAGE_CONTINUATION` is never paired with a charitable cohort: a charitable waqf has no
 *     descendants and the pair is refused (`LINEAGE_ORDER_ON_CHARITABLE_WAQF`).
 *  9. **`reversion` is `null` in every general input, EXPLICITLY** (R7, 2026-08-10). A مآل clause is only
 *     legal where a `CHARITABLE_JIHA` sits in a ذري cohort — which coupling 6's two exhaustive branches
 *     cannot produce — so a reversion here would be a guaranteed refusal on every draw. The reversion
 *     population is its own generator ({@link arbReversionRunInput}) with its own 10 000-run property, and
 *     P12's census pins `reversionRecorded === 0` in the general arbitrary so the confinement is a
 *     **checked fact** rather than a convention that can rot. See the R7 section further down.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ FINDING R6-C1 — COUPLING 6 IS ALSO A BLIND SPOT, AND IT COST A MEASURED DEFECT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Keeping guaranteed refusals out of the general arbitrary is right — a refusal generated into a
 * conservation property buys one throw at the price of the run budget. But "the general generator
 * does not produce X" silently became "**no** generator produces X", and a refusal no generator can
 * reach is a refusal no property can prove exists.
 *
 * Coupling 6 types every cohort from its nature, and the two branches are EXHAUSTIVE: a cohort with
 * a jiha is `PUBLIC_CHARITABLE`, one without is `FAMILY_DHURRI`. So `FAMILY_DHURRI` + a
 * `CHARITABLE_JIHA` was unreachable — MEASURED at zero over 2 000 draws — and 10 000 generated runs
 * stayed green while a hand-built cohort of exactly that shape paid a charity **27,500,000 of
 * 27,500,000 halalas** out of an ancestral endowment (R6-D1). The same audit found `JIHA_TIERED`
 * unreachable for a sibling reason: `toRawBeneficiary` normalises a jiha's `tabaqa` to `null` and
 * nothing put it back.
 *
 * **The rule this file now follows: every refusal the engine can raise must have a generator that
 * reaches it, in one of the refusal arbitraries.** The refused shapes stay out of the *general*
 * arbitrary and live in {@link arbRefusedNatureInput}, {@link arbMalformedLineageInput},
 * {@link arbCharitableJihaOnFamilyWaqfCase}, {@link arbDescendantOnCharitableWaqfCase},
 * {@link arbCharitablePlaceholderCase} and their cohorts ({@link arbFamilyWaqfJihaCohort},
 * {@link arbTieredJihaCohort}, {@link arbMixedNatureCohort}) — where a guaranteed halt is the point
 * rather than a cost.
 *
 * **The rule is now ENFORCED, not merely stated.** `distribution.property.test.ts`'s P12 takes
 * `contract.ts`'s `SHART_REFUSALS` list, runs every refusal arbitrary, and requires each member to
 * be either observed or listed with the reason it cannot be — so a refusal added to the engine
 * without a generator fails **by name** instead of looking covered. It also censuses the general
 * arbitrary over all five closed vocabularies with minimum counts on every legal cell and EXACT-ZERO
 * counts on every refused one. Verified by mutation: deleting one arm of
 * {@link arbRefusedNatureInput} makes P12 name the newly-unreachable refusal.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE AUDIT — CAN THE GENERATORS REACH EVERY REFUSED CELL? (2026-08-09)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Per closed vocabulary the engine refuses on, the refused values and where they are generated:
 *
 * | vocabulary | refused value(s) | reached by |
 * |---|---|---|
 * | `waqfType` | `JOINT` | {@link arbRefusedNatureInput} pick 0 — all four orders |
 * | `waqfType` × cohort | خيري + a descendant | pick 4 + {@link arbDescendantOnCharitableWaqfCase} |
 * | `waqfType` × cohort | ذري + a jiha | pick 3 + {@link arbCharitableJihaOnFamilyWaqfCase} |
 * | `waqfType` × cohort | خيري + an EDGED `CATEGORY_ONLY` | {@link arbCharitablePlaceholderCase} `withLink: true` (the edgeless recording is LEGAL since R6-F1 and is driven as a computing control by the same generator) |
 * | `entitlementOrder` | anything outside the four | P10's near-miss draw (padded, cased, Arabic) |
 * | `entitlementOrder` | lineage on a charity | {@link arbRefusedNatureInput} pick 2 |
 * | `continuationStipulation` | `null` / padded / cased / unknown on a lineage deed | {@link arbMalformedLineageInput} case 7 + P10 |
 * | `kind` | jiha + a ṭabaqa | {@link arbTieredJihaCohort} |
 * | `kind` | jiha + a lineage edge | {@link arbMalformedLineageInput} case 5 (`parentId` form) |
 * | `kind` | jiha beside a `FAMILY` member | {@link arbMixedNatureCohort} |
 * | `lineageLink` | outside {SON, DAUGHTER} | case 0 |
 * | `lineageLink` | absent on a descendant kind | case 4 — on `LINEAGE_CONTINUATION`, `ORDERED` and `SHARED` |
 * | graph | dangling parent / cycle / depth mismatch | cases 1, 2, 6 |
 * | graph | subtree rooted outside the waqif | case 3 (`buildLineage` only) **+ case 7 through the ENGINE, R7** |
 * | `reversion` | خيري / unrecognised kind / no taker / duplicate / unknown / not-charitable / no bloodline / all-zero weights | {@link arbReversionRefusalCase}, all 8 arms |
 * | `kind` | a TIERED ultimate taker on a ذري waqf | {@link arbTieredUltimateTakerCase} + {@link arbRefusedNatureInput} pick 5 — **`JIHA_TIERED`, reachable again (R7-f)** |
 * | `waqfType` × cohort | ذري + a jiha the deed NAMES as مآل | {@link arbReversionRunInput} — **LEGAL since R7**, and its own population |
 * | **bloodline composition** | **an extinct register that is ENUMERATED vs one bearing a `CATEGORY_ONLY` placeholder** | **{@link BloodlineComposition} — R7-D1's axis. The two now have OPPOSITE outcomes (fire vs hold), and before the axis existed the second arrived ~90% of the time from a coin flip nobody had counted.** |
 *
 * **Left unreached, with reasons — these are the audit's findings, not its gaps:**
 *
 *  · `ENTITLEMENT_RULE_UNMAPPED` — a defensive arm of `entitlementRuleFor`; every path to it is
 *    refused earlier by design. No input can reach it, so no generator can.
 *  · `BENEFICIARY_ID_DUPLICATED` — `assertInputConsistency` refuses a duplicate id at the contract
 *    door with `DISTRIBUTION_INPUT_INVALID`. The discriminator exists for direct resolver callers.
 *  · `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` — ✓ **CLOSED BY R7, in the direction nobody was watching.** This
 *    entry read: *"⚠ newly unreachable through `runDistribution`, because ESC-1 refuses the orphaned
 *    subtree's own lineage links at Stage 0 before `buildLineage` runs."* True then. R7 gives the subtree a
 *    legal host — an ultimate-taker jiha sits outside the family tree on a **ذري** waqf, where ESC-1 does
 *    not apply — so a descendant whose `parentId` points at the taker reaches the walk through the front
 *    door. {@link arbMalformedLineageInput} case 7 builds it (`route: 'ENGINE'`); case 3's خيري shape is
 *    kept, still `'BUILD_LINEAGE_ONLY'`, because *it* really is still unreachable. **A refusal can regain
 *    reachability, and if the exemption list is not re-audited the property that "proves" it is asserting
 *    the opposite of the truth.**
 *  · ⚠ **`LINEAGE_ORDER_ON_CHARITABLE_WAQF`'s JIHA ARM is dead code, and R7 did not kill it.** The
 *    discriminator is reached only through its `PUBLIC_CHARITABLE` arm ({@link arbRefusedNatureInput}
 *    pick 2). The jiha arm needs `waqfType === 'FAMILY_DHURRI'` with an unnamed jiha, and
 *    `CHARITABLE_JIHA_ON_FAMILY_WAQF` — same predicate, twenty lines earlier — always answers first;
 *    `JOINT` is refused before both. That precedence pre-dates R7 (the pre-R7 refusal was unconditional
 *    on the jiha's presence, so it pre-empted just as completely), and R7's narrowing changed both arms to
 *    the SAME `unnamedJihaIds.length > 0` predicate, so the ordering is unchanged. Reported, not worked
 *    around: `resolver.ts` is not this file's to edit, and no generator here should pretend to reach it.
 *  · ✓ **CLOSED (R6-F1).** This entry read: *"a `CATEGORY_ONLY` member on a خيري waqf has no legal
 *    recording at all — not a refusal without a generator; a legal shape with nowhere to go, and the
 *    single most consequential finding of this audit."* `buildLineage` pass 4 now requires the
 *    lineage edge from a `CATEGORY_ONLY` member **only on a `FAMILY_DHURRI` waqf**, so an edgeless
 *    charitable placeholder computes. {@link arbCharitablePlaceholderCase} keeps both recordings and
 *    now asserts the two sides of that line: edged ⇒ `DESCENDANT_ON_CHARITABLE_WAQF`, edgeless ⇒
 *    computes. ⚠ The audit row at `waqfType` × cohort above is updated to match.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE COST SHIFT — HOW BOTH SIDES OF `DISTRIBUTION_NEGATIVE` GET EXERCISED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Revenue and the three cost figures (a FIXED/TARGET_TOPUP reserve, the operating cost, a RETAINER
 * fee) are drawn from the same 0 … 10¹⁴-halala range. Drawn independently, roughly half of all
 * inputs would exceed revenue and the suite would spend most of its budget proving that the engine
 * throws — while a generator biased the other way would never exercise the throw at all. Both are
 * a coverage failure, and neither is visible from a green suite.
 *
 * So every cost figure is right-shifted by a generated `costShift` ∈ 0 … 50 bits. Shift 0 leaves
 * the full magnitude (costs usually swamp revenue ⇒ `DISTRIBUTION_NEGATIVE`); shift 50 drives them
 * to ~0 (a comfortable surplus). A uniform draw sweeps the whole cost:revenue ratio range. The
 * property file COUNTS both outcomes and asserts each is well represented, so a future edit that
 * accidentally biases the generator fails the suite instead of silently narrowing it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MAGNITUDE CEILINGS ARE DELIBERATE, NOT ARBITRARY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · Money ≤ 10¹⁴ halalas (1 000 000 000 000.00 SAR) per figure, ≤ 6 receipts. `money.ts` refuses
 *   anything above `Decimal(18,2)`'s 9 999 999 999 999 999.99, so a larger draw would test the
 *   money engine's range guard rather than the distribution engine. The headroom is ~100×.
 * · Rates ≤ 6 dp. Weights are allowed the full 18 dp (`MAX_WEIGHT_DECIMAL_PLACES`) because the
 *   split is exact bigint arithmetic, but a rate multiplies money through `percentOf`'s
 *   40-significant-digit `Decimal`, and 18-dp rates against 10¹⁴-halala bases would push the
 *   product toward that limit — turning a distribution-engine property into a `Decimal` precision
 *   probe. 6 dp is well beyond any real fee.
 * · Dates: `asOf` 2026 … 2028, deadlines 2026 … 2029, KYC/licence dates 2021 … 2029. All are far
 *   inside `HIJRI_SUPPORTED_RANGE` (1882-11-12 … 2174-11-25), so no property can fail merely by
 *   walking out of the Umm al-Qura table — a `HIJRI_OUT_OF_RANGE` inside a property would mask the
 *   invariant it exists to test.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NO REAL DATA, EVER (CLAUDE.md hard constraint)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every id, branch, category, entity name and account reference below is synthetic and obviously
 * so (`ben-###`, `FAKE-ACCT-…`, `Branch A/B/C`). Nothing here is derived from
 * `archive/raw-intake/`, and no beneficiary NAME field exists in the contract at all.
 */

import fc from 'fast-check';

import { addCalendarDays, civilDate, dual, toHijri } from '../../dates/index.js';
import type { CivilDate } from '../../dates/index.js';
import { UNVERIFIED_NOTE } from '../../settings.js';
import {
  BENEFICIARY_LINES,
  BINDING_CALENDARS,
  CAPITAL_SOURCES,
  CONTINUATION_STIPULATIONS,
  RESIDENCIES,
  VERIFICATION_STATUSES,
  WAQF_CLASSIFICATIONS,
} from '../contract.js';
import type {
  BeneficiaryKind,
  CapitalSource,
  ContinuationStipulation,
  DistributionInputRaw,
  LineageLink,
  ReversionKind,
  WaqfType,
} from '../contract.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Aliases for the raw (pre-branding) input shapes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];
export type RawRevenue = DistributionInputRaw['revenue'];
export type RawReceipt = RawRevenue['receipts'][number];
export type RawMaintenance = DistributionInputRaw['maintenance'];
export type RawNazirFee = DistributionInputRaw['nazirFee'];
export type RawDeadline = DistributionInputRaw['deadline'];
export type RawPolicy = DistributionInputRaw['policy'];

/** The gate-relevant slice of a beneficiary — everything Stage 3 reads and Stage 2 does not. */
export interface GateFieldPatch {
  readonly verificationStatus: RawBeneficiary['verificationStatus'];
  readonly kycLastRefreshed: string | null;
  readonly category: string | null;
  readonly residency: RawBeneficiary['residency'];
  readonly disbursingEntity: RawBeneficiary['disbursingEntity'];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Ceilings and windows (see the header for why each is where it is)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** 1 000 000 000 000.00 SAR per money figure — ~100× headroom under `Decimal(18,2)`. */
export const MAX_MINOR = 10n ** 14n;

/** Bits of right-shift applied to every cost figure. See "THE COST SHIFT" in the header. */
export const MAX_COST_SHIFT = 50;

const ASOF_ORIGIN = civilDate('2026-01-01');
const ASOF_SPAN_DAYS = 1095; // 2026-01-01 … 2028-12-31
const DEADLINE_ORIGIN = civilDate('2026-01-01');
const DEADLINE_SPAN_DAYS = 1460; // 2026-01-01 … 2029-12-31
const KYC_ORIGIN = civilDate('2021-01-01');
const KYC_SPAN_DAYS = 3287; // 2021-01-01 … 2029-12-31

/** Real `MM-DD` fiscal year ends, including the leap day the contract deliberately permits. */
const FISCAL_YEAR_ENDS = ['12-31', '03-31', '06-30', '09-30', '02-29', '01-31'] as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Primitives
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A civil date drawn from a window chosen to sit far inside `HIJRI_SUPPORTED_RANGE`. */
function arbCivilDateIn(origin: CivilDate, spanDays: number): fc.Arbitrary<CivilDate> {
  return fc.integer({ min: 0, max: spanDays }).map((offset) => addCalendarDays(origin, offset));
}

export const arbAsOfDate = arbCivilDateIn(ASOF_ORIGIN, ASOF_SPAN_DAYS);
export const arbDeadlineDate = arbCivilDateIn(DEADLINE_ORIGIN, DEADLINE_SPAN_DAYS);
export const arbKycDate = arbCivilDateIn(KYC_ORIGIN, KYC_SPAN_DAYS);

/** Halalas, 0 … 10¹⁴. */
export const arbMinor = fc.bigInt({ min: 0n, max: MAX_MINOR });

/**
 * A rate out of 100 (`'10'` = 10%), 0 … 100, at most 6 dp.
 *
 * The whole-number branch carries most of the weight because every real rate in the domain is a
 * whole percent (the 10% ʿushr, the Authority's ≤10% of net income — both ⚠ unverified); the
 * fractional branch exists so a rate that does not divide the pool evenly is routinely explored.
 */
export const arbRatePercent = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 100 }).map(String) },
  {
    weight: 3,
    arbitrary: fc
      .tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 999_999 }))
      .map(([whole, fraction]) => `${String(whole)}.${String(fraction).padStart(6, '0')}`),
  },
  { weight: 1, arbitrary: fc.constantFrom('0', '100', '10', '0.000001', '99.999999') },
);

/**
 * A deed-stipulated relative weight: a non-negative plain decimal literal, ≤ 18 dp.
 *
 * `'0'` is generated ON PURPOSE and reasonably often — a zero deed share is the
 * `ZERO_STIPULATED_WEIGHT` exclusion, and it is the input that would make
 * `largestRemainderAllocate` throw `INVALID_ALLOCATION_WEIGHTS` if the resolver ever stopped
 * filtering it out before the allocator. The 18-dp constants are the `MAX_WEIGHT_DECIMAL_PLACES`
 * boundary: one at the smallest representable weight, one at a large magnitude, because the split
 * scales every weight to a common integer scale and both extremes stress that scaling.
 */
export const arbWeight = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 1000 }).map(String) },
  {
    weight: 3,
    arbitrary: fc
      .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 999_999 }))
      .map(([whole, fraction]) => `${String(whole)}.${String(fraction).padStart(6, '0')}`),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      '0',
      '1',
      '12.5',
      '0.000000000000000001',
      '999999999999.999999999999999999',
    ),
  },
);

/** A non-zero weight, for cohorts that must actually be entitled to something. */
export const arbNonZeroWeight = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 1, max: 1000 }).map(String) },
  {
    weight: 3,
    arbitrary: fc
      .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 999_999 }))
      .map(([whole, fraction]) => `${String(whole)}.${String(fraction).padStart(6, '0')}`),
  },
  { weight: 1, arbitrary: fc.constantFrom('1', '12.5', '0.000000000000000001') },
);

/** A synthetic disbursing entity, or none. Drives the `ENTITY_UNLICENSED` gate. */
export const arbDisbursingEntity = fc.option(
  fc.record({
    name: fc.constantFrom('Jiha Alpha (invented)', 'Jiha Beta (invented)'),
    licensed: fc.boolean(),
    licenceExpiry: fc.option(arbKycDate, { nil: null }),
  }),
  { nil: null },
);

/** The five fields Stage 3 reads. Kept as one unit so the I6 mutation can replace exactly them. */
export const arbGateFields: fc.Arbitrary<GateFieldPatch> = fc.record({
  verificationStatus: fc.constantFrom(...VERIFICATION_STATUSES),
  kycLastRefreshed: fc.option(arbKycDate, { nil: null }),
  // `''` is generated deliberately: `isCategoryUncaptured` trims, so a whitespace-only category
  // must block a CATEGORY_ONLY line exactly as `null` does.
  category: fc.option(fc.constantFrom('orphans', 'students', '   ', ''), { nil: null }),
  residency: fc.constantFrom(...RESIDENCIES),
  disbursingEntity: arbDisbursingEntity,
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Beneficiaries
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Zero-padded so ascending id order equals ascending mint order. See header point 3. */
export function beneficiaryId(index: number): string {
  return `ben-${String(index).padStart(3, '0')}`;
}

interface BeneficiaryDraw {
  readonly kind: BeneficiaryKind;
  readonly active: boolean;
  readonly tabaqa: number | null;
  /** ADR-0009 · the lineage edge. Both `null` ⇒ this member is NOT in the waqif's family tree. */
  readonly parentId: string | null;
  readonly lineageLink: LineageLink | null;
  readonly line: RawBeneficiary['line'];
  readonly branch: string | null;
  readonly stipulatedWeight: string;
  readonly gate: GateFieldPatch;
  readonly bankingRefForProceeds: string | null;
}

/** The gate fields, the weight, the vital status and the display-ish fields — everything but lineage. */
interface BeneficiaryBodyDraw {
  readonly active: boolean;
  readonly line: RawBeneficiary['line'];
  readonly branch: string | null;
  readonly stipulatedWeight: string;
  readonly gate: GateFieldPatch;
  readonly bankingRefForProceeds: string | null;
}

const arbBeneficiaryBody: fc.Arbitrary<BeneficiaryBodyDraw> = fc.record({
  // Biased live: an all-inactive cohort is a legitimate and separately-tested state, but if it were
  // half of every draw the suite would spend most of its budget on empty cohorts.
  active: fc.oneof(
    { weight: 4, arbitrary: fc.constant(true) },
    { weight: 1, arbitrary: fc.constant(false) },
  ),
  line: fc.constantFrom(...BENEFICIARY_LINES),
  branch: fc.option(fc.constantFrom('Branch A', 'Branch B', 'Branch C'), { nil: null }),
  stipulatedWeight: arbWeight,
  gate: arbGateFields,
  bankingRefForProceeds: fc.option(fc.constantFrom('FAKE-ACCT-1', 'FAKE-ACCT-2'), { nil: null }),
});

function toRawBeneficiary(draw: BeneficiaryDraw, index: number): RawBeneficiary {
  return {
    id: beneficiaryId(index),
    kind: draw.kind,
    active: draw.active,
    // S3-D3: a CHARITABLE_JIHA carrying a ṭabaqa is a self-contradictory deed record and halts with
    // SHART_INCOMPLETE (`resolver.assertJihaNotTiered`). Normalised to null here so the properties
    // explore the legal space; the refusal is driven directly in `jiha-tier-refusal.test.ts`.
    tabaqa: draw.kind === 'CHARITABLE_JIHA' ? null : draw.tabaqa,
    // ADR-0009: a jiha carrying either lineage field is refused (LINEAGE_EDGE_ON_NON_DESCENDANT), on
    // the same reasoning — a charity is not a descendant of the waqif. Normalised for the same reason.
    parentId: draw.kind === 'CHARITABLE_JIHA' ? null : draw.parentId,
    lineageLink: draw.kind === 'CHARITABLE_JIHA' ? null : draw.lineageLink,
    line: draw.line,
    branch: draw.branch,
    stipulatedWeight: draw.stipulatedWeight,
    verificationStatus: draw.gate.verificationStatus,
    kycLastRefreshed: draw.gate.kycLastRefreshed,
    category: draw.gate.category,
    residency: draw.gate.residency,
    disbursingEntity: draw.gate.disbursingEntity,
    bankingRefForProceeds: draw.bankingRefForProceeds,
  };
}

/* ── the lineage graph, generated STRUCTURALLY ─────────────────────────────────────────────── */

/**
 * One node's shape in a generated family tree, before ids and depths exist.
 *
 * `parentPick` is a raw natural; the mapper reduces it modulo the node's own index, so a parent is
 * ALWAYS an earlier node. That single constraint is what makes every generated graph acyclic and
 * rooted at the waqif by construction — there is no filter, no retry and no possibility of a
 * `LINEAGE_CYCLE` or `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` slipping into a property that is about
 * something else. The malformations are generated on purpose by {@link arbMalformedLineageInput}.
 */
interface LineageNodeDraw {
  readonly link: LineageLink;
  readonly parentPick: number;
  /** Force this node to be a child of the waqif (depth 1) rather than of an earlier node. */
  readonly isRoot: boolean;
}

const arbLineageNode: fc.Arbitrary<LineageNodeDraw> = fc.record({
  // Both links carry real weight: DAUGHTER is what makes ZUHUR_ONLY exclude anything at all, and a
  // cohort of nothing but sons would let a broken ẓuhūr filter pass every property.
  link: fc.constantFrom<LineageLink>('SON', 'DAUGHTER'),
  parentPick: fc.nat(1_000_000),
  // Biased AWAY from roots so trees actually get deep. All-roots (every draw a child of the waqif) is
  // a legitimate one-generation waqf, but a suite of them never tests an ancestor WALK — and the
  // ZUHUR_ONLY rule is entirely about ancestors two or more steps up.
  isRoot: fc.oneof(
    { weight: 1, arbitrary: fc.constant(true) },
    { weight: 3, arbitrary: fc.constant(false) },
  ),
});

/**
 * Resolve a list of node draws into `{ parentId, lineageLink, tabaqa }` per index.
 *
 * `tabaqa` is **DERIVED** (`depth(parent) + 1`), never drawn — see header coupling 7. Ids are the same
 * positional `ben-###` the cohort generator mints, so the edge and the id it references cannot
 * disagree.
 */
function resolveLineage(nodes: readonly LineageNodeDraw[]): readonly {
  readonly parentId: string | null;
  readonly link: LineageLink;
  readonly depth: number;
}[] {
  const resolved: { parentId: string | null; link: LineageLink; depth: number }[] = [];
  nodes.forEach((node, index) => {
    if (index === 0 || node.isRoot) {
      resolved.push({ parentId: null, link: node.link, depth: 1 });
      return;
    }
    const parentIndex = node.parentPick % index;
    const parent = resolved[parentIndex];
    resolved.push({
      parentId: beneficiaryId(parentIndex),
      link: node.link,
      // `parent` cannot be undefined (`parentIndex < index` and every earlier index is filled), but
      // the fallback is a depth of 1 rather than a `!`: a silent NaN here would be a generated
      // TABAQA_MISMATCHES_LINEAGE_DEPTH on some fraction of runs, i.e. exactly the failure mode
      // coupling 7 exists to prevent.
      depth: (parent?.depth ?? 0) + 1,
    });
  });
  return resolved;
}

/**
 * The deepest generation in a cohort's lineage graph — a COVERAGE statistic, not an assertion.
 *
 * Re-derived here rather than read from `tabaqa`, so a property can assert that the generator really
 * produces multi-generation trees. Without that, a generator that drifted into all-roots would leave
 * the entire ẓuhūr ancestor-walk untested while every property stayed green — the failure mode the
 * whole `stats` discipline in `distribution.property.test.ts` exists to catch.
 *
 * Iterated to a fixed point rather than recursed: the cohort may arrive with children before parents.
 * Bounded by the cohort size, so it terminates on any acyclic graph and cannot hang on a malformed one.
 */
export function maxLineageDepth(cohort: readonly RawBeneficiary[]): number {
  const depthById = new Map<string, number>();
  for (let round = 0; round <= cohort.length; round += 1) {
    let changed = false;
    for (const member of cohort) {
      if (member.lineageLink === null) continue;
      let depth: number | undefined;
      if (member.parentId === null) {
        depth = 1;
      } else {
        const parentDepth = depthById.get(member.parentId);
        if (parentDepth !== undefined) depth = parentDepth + 1;
      }
      if (depth !== undefined && depthById.get(member.id) !== depth) {
        depthById.set(member.id, depth);
        changed = true;
      }
    }
    if (!changed) break;
  }
  let deepest = 0;
  for (const depth of depthById.values()) if (depth > deepest) deepest = depth;
  return deepest;
}

/* ── cohorts ──────────────────────────────────────────────────────────────────────────────── */

/** A cohort's single nature — ذري or خيري. ADR-0009 R5: never both. See header coupling 6. */
export type CohortNature = 'FAMILY' | 'CHARITABLE';

/**
 * A **family** (ذري) cohort of 0 … 12 members with a real generated lineage graph.
 *
 * Every member is `FAMILY` or `CATEGORY_ONLY` and every member is IN the graph — it carries a
 * `lineageLink` and a derived `tabaqa`. Putting the placeholders in the graph too is deliberate: under
 * `LINEAGE_CONTINUATION` a `CATEGORY_ONLY` member with no lineage fact is REFUSED
 * (`LINEAGE_LINK_MISSING`), so a generator that left them out would make every lineage run a refusal.
 * Their gate fields still vary freely, which keeps `CATEGORY_NOT_CAPTURED` reachable.
 *
 * The empty cohort is generated on purpose (`NO_ELIGIBLE_BENEFICIARIES` with the pool retained).
 * `reversed` hands the engine the cohort in DESCENDING id order for half of all draws — so a child
 * arrives before its parent, and every output-ordering assertion (and the ancestor walk itself) is
 * tested against an input order that would break an implementation relying on array position.
 */
export const arbFamilyCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc
  .record({
    bodies: fc.array(arbBeneficiaryBody, { minLength: 0, maxLength: 12 }),
    nodes: fc.array(arbLineageNode, { minLength: 12, maxLength: 12 }),
    // A placeholder is NOT a leg (ADR-0009), so family + placeholder is a legal ذري cohort.
    placeholderPicks: fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
    reversed: fc.boolean(),
  })
  .map(({ bodies, nodes, placeholderPicks, reversed }) => {
    const lineage = resolveLineage(nodes.slice(0, bodies.length));
    const cohort = bodies.map((body, index) => {
      const edge = lineage[index];
      return toRawBeneficiary(
        {
          ...body,
          kind: placeholderPicks[index] === true ? 'CATEGORY_ONLY' : 'FAMILY',
          tabaqa: edge?.depth ?? 1,
          parentId: edge?.parentId ?? null,
          lineageLink: edge?.link ?? 'SON',
        },
        index,
      );
    });
    return reversed ? [...cohort].reverse() : cohort;
  });

/**
 * A **charitable** (خيري) cohort of 0 … 6 members. **`CHARITABLE_JIHA` ONLY — nothing else.**
 *
 * A jiha carries no lineage edge and no `tabaqa`: a charity is not a descendant of the waqif,
 * `assertJihaNotTiered` refuses a tiered one and `buildLineage` refuses one carrying either edge
 * field.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ FINDING ESC-1×R6 — WHY THE `CATEGORY_ONLY` PLACEHOLDERS ARE GONE, AND WHY THAT IS NOT TIDYING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * This generator used to mint `CATEGORY_ONLY` placeholders beside the jihas, each carrying a
 * `lineageLink: 'SON'` that the old comment here called an "R6-F1 fiction" — recorded because R6
 * requires the link on every `FAMILY`/`CATEGORY_ONLY` record, on every order, whatever the type.
 *
 * **ESC-1 closed the other side of that fiction, and the two together make a `CATEGORY_ONLY`
 * beneficiary UNREPRESENTABLE on a `PUBLIC_CHARITABLE` waqf.** MEASURED against the shipped engine
 * (`resolveEntitlement` on a خيري waqf holding one jiha and one placeholder):
 *
 * | order | placeholder WITH a `lineageLink` | placeholder WITHOUT one |
 * |---|---|---|
 * | `SHARED` | `DESCENDANT_ON_CHARITABLE_WAQF` | `LINEAGE_LINK_MISSING` |
 * | `ORDERED` | `DESCENDANT_ON_CHARITABLE_WAQF` | `LINEAGE_LINK_MISSING` |
 * | `LINEAGE_CONTINUATION` | `DESCENDANT_ON_CHARITABLE_WAQF` | `LINEAGE_ORDER_ON_CHARITABLE_WAQF` |
 * | `NA_DIRECT_USE` | `DESCENDANT_ON_CHARITABLE_WAQF` | **resolves** (I7 short-circuits first) |
 *
 * So on every order that resolves a cohort there was no legal way to record a charitable waqf's
 * not-yet-enumerated segment. Keeping the fiction here would have made **every** خيري draw in the
 * general arbitrary a guaranteed refusal — P1, P2, P7 and P8 all failed on exactly that — and
 * removing the link would have swapped one guaranteed refusal for another.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ✓ R6-F1 IS CLOSED — AND THIS GENERATOR STILL MINTS JIHAS ONLY, ON PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `buildLineage` pass 4 now requires the lineage edge from a `CATEGORY_ONLY` member **only on a
 * `FAMILY_DHURRI` waqf**, so the `WITHOUT one` column above is now **resolves** for `SHARED` and
 * `ORDERED` too. The table stays as the record of what was measured; the two `DESCENDANT_…` cells and
 * the `LINEAGE_CONTINUATION` row are unchanged and still hold.
 *
 * This generator is nonetheless left as `CHARITABLE_JIHA`-only, and that is a deliberate scope choice
 * rather than a leftover: an edgeless `CATEGORY_ONLY` placeholder is now legal on a خيري waqf but is
 * `CATEGORY_NOT_CAPTURED`-gated whenever its `category` is blank, so minting it here would spread a
 * BR-206 gate across every خيري draw of the GENERAL arbitrary and quietly change what P4/P7/P8 are
 * measuring. The shape is driven where it belongs — {@link arbCharitablePlaceholderCase}, which now
 * asserts BOTH sides of the line R6-F1's correction drew, and the deterministic خيري slice of
 * `escape-class-adversarial.test.ts` §1.
 */
export const arbCharitableCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc
  .record({
    bodies: fc.array(arbBeneficiaryBody, { minLength: 0, maxLength: 6 }),
    reversed: fc.boolean(),
  })
  .map(({ bodies, reversed }) => {
    const cohort = bodies.map((body, index) =>
      toRawBeneficiary(
        {
          ...body,
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          parentId: null,
          lineageLink: null,
          line: 'NA',
        },
        index,
      ),
    );
    return reversed ? [...cohort].reverse() : cohort;
  });

/**
 * The `CATEGORY_ONLY`-on-a-خيري-waqf shape, generated in **BOTH recordings** — the SAME two inputs as
 * before, with the no-link arm's expectation INVERTED because the engine's answer to it changed.
 *
 * ═══ WHAT THIS GENERATOR MEASURED, KEPT AS THE RECORD ═══
 * It used to carry `refusal: 'DESCENDANT_ON_CHARITABLE_WAQF' | 'LINEAGE_LINK_MISSING'` and the
 * property over it asserted *"a خيري waqf with a placeholder must refuse either way"* — the
 * measurement of **R6-F1**: R6 demanded a `lineageLink` on every `CATEGORY_ONLY` record whatever the
 * waqf type, ESC-1 refused any record carrying one on a خيري waqf, and between them a charitable
 * deed's not-yet-enumerated segment had no legal recording at all.
 *
 * ═══ WHAT MOVED ═══
 * `buildLineage` pass 4 now requires the edge from a `CATEGORY_ONLY` member **only on a
 * `FAMILY_DHURRI` waqf**, because on a charitable deed eligibility does not come from descent and
 * demanding an edge forced a fiction. So:
 *
 *  · `withLink: true` — the placeholder recorded the way R6 demanded (a `lineageLink`, ṭabaqa
 *    cross-checked against derived depth 1) still halts `DESCENDANT_ON_CHARITABLE_WAQF`. **Unchanged**,
 *    and it is the arm that would redden if ESC-1 ever lapsed.
 *  · `withLink: false` — the edgeless recording now **RESOLVES**. It is the ordinary state of a خيري
 *    deed before enrolment ("the poor of the district, not yet enrolled") and the subject BR-206's
 *    `CATEGORY_NOT_CAPTURED` gate exists for.
 *
 * ═══ ⚠ AND WHAT MOVED AGAIN, 2026-08-03 · `TABAQA_ON_CHARITABLE_WAQF` ═══
 * The ṭabaqa is now drawn as its **own axis** rather than being welded to `withLink`, because the two
 * facts are refused by two different rules and the ṭabaqa rule is checked FIRST. The generator became
 * a 2 × 2, and the honest expectation of each cell is:
 *
 *     withTabaqa | withLink | verdict
 *     -----------|----------|-----------------------------------------------
 *        true    |   true   | TABAQA_ON_CHARITABLE_WAQF   (the ṭabaqa rule outranks ESC-1)
 *        true    |   false  | TABAQA_ON_CHARITABLE_WAQF   (a generation with no descent claim)
 *        false   |   true   | DESCENDANT_ON_CHARITABLE_WAQF  ← the ONLY cell ESC-1 still owns
 *        false   |   false  | RESOLVES                    (R6-F1's correction, intact)
 *
 * Had the ṭabaqa stayed welded to the link, the `withLink: true` arm would have silently retargeted
 * onto the newer rule and ESC-1 would have been left with **no generator at all** while the suite
 * stayed green — the argument-from-silence this file exists to prevent.
 *
 * Both arms still carry a live `CHARITABLE_JIHA` beside the placeholder, so the cohort is otherwise a
 * perfectly ordinary charitable register and the verdict is unambiguously about the placeholder.
 *
 * `NA_DIRECT_USE` is still excluded from the draw, and the reason is now different and worth stating:
 * it resolves via I7's short-circuit **before** the graph is built, so it would satisfy the resolving
 * arm for a reason that has nothing to do with pass 4 — a green cell that proves nothing.
 * `LINEAGE_CONTINUATION` is still remapped to `SHARED` on the no-link arm, because a lineage order on
 * a charitable waqf is refused at Stage 0 (`LINEAGE_ORDER_ON_CHARITABLE_WAQF`) three steps before
 * pass 4 is consulted.
 */
export const arbCharitablePlaceholderCase: fc.Arbitrary<{
  readonly input: (base: DistributionInputRaw) => DistributionInputRaw;
  /**
   * `null` = the run must COMPUTE. Otherwise the discriminator it must halt on — never a bare
   * `SHART_INCOMPLETE`, which twenty-six refusals share.
   */
  readonly refusal: 'DESCENDANT_ON_CHARITABLE_WAQF' | 'TABAQA_ON_CHARITABLE_WAQF' | null;
  readonly withLink: boolean;
  readonly withTabaqa: boolean;
  readonly order: string;
}> = fc
  .record({
    jiha: arbBeneficiaryBody,
    placeholder: arbBeneficiaryBody,
    withLink: fc.boolean(),
    withTabaqa: fc.boolean(),
    // The lineage order is excluded from the resolving arm below: there it refuses
    // LINEAGE_ORDER_ON_CHARITABLE_WAQF, which is a different (and correct) refusal.
    order: fc.constantFrom('SHARED', 'ORDERED', 'LINEAGE_CONTINUATION'),
  })
  .map(({ jiha, placeholder, withLink, withTabaqa, order }) => {
    const refuses = withLink || withTabaqa;
    const effectiveOrder = refuses || order !== 'LINEAGE_CONTINUATION' ? order : 'SHARED';
    const cohort: readonly RawBeneficiary[] = [
      toRawBeneficiary(
        {
          ...jiha,
          kind: 'CHARITABLE_JIHA',
          active: true,
          tabaqa: null,
          parentId: null,
          lineageLink: null,
          line: 'NA',
          stipulatedWeight: jiha.stipulatedWeight === '0' ? '1' : jiha.stipulatedWeight,
        },
        0,
      ),
      toRawBeneficiary(
        {
          ...placeholder,
          kind: 'CATEGORY_ONLY',
          active: true,
          // `tabaqa: 1` pairs with `parentId: null` (derived depth 1) so the depth cross-check can
          // never be what refuses. ⚠ Drawn independently of `withLink` since 2026-08-03 — see the
          // 2 × 2 table in the header; welding them together would have cost ESC-1 its generator.
          tabaqa: withTabaqa ? 1 : null,
          parentId: null,
          lineageLink: withLink ? 'SON' : null,
          stipulatedWeight:
            placeholder.stipulatedWeight === '0' ? '1' : placeholder.stipulatedWeight,
        },
        1,
      ),
    ];
    return {
      input: (base: DistributionInputRaw): DistributionInputRaw => ({
        ...base,
        waqfType: 'PUBLIC_CHARITABLE',
        entitlementOrder: effectiveOrder,
        continuationStipulation: effectiveOrder === 'LINEAGE_CONTINUATION' ? 'ZUHUR_ONLY' : null,
        beneficiaries: [...cohort],
        /*
         * ⚠ THE COSTS ARE ZEROED, AND THE REASON SURVIVED THE INVERSION — it just changed which arm
         * it protects. **The two arms are decided at DIFFERENT STAGES.**
         *
         *  · `DESCENDANT_ON_CHARITABLE_WAQF` is Stage 0 (`assertSingleWaqfNature`, called by
         *    `runDistribution` BEFORE `computeWaterfall`) — it outranks the money verdict, so the
         *    with-link arm would prove its refusal on any base at all.
         *  · The no-link arm is now Stage 2 and beyond — it has to reach `resolveEntitlement` and
         *    then produce lines, and `computeWaterfall` runs first. MEASURED, back when that arm was
         *    `LINEAGE_LINK_MISSING`: on the undamped base it returned `DISTRIBUTION_NEGATIVE` on the
         *    very first insolvent draw. Insolvency would now break the RESOLVING arm the same way —
         *    the property would fail on a draw whose costs merely exceeded its revenue, not on
         *    anything to do with pass 4.
         *
         * Zeroing makes every draw solvent so each arm proves the verdict it names; the precedence is
         * recorded here rather than hidden by the zeroing.
         */
        operatingCostMinor: 0n,
        maintenance: { kind: 'NONE' },
        nazirFee: null,
      }),
      // The precedence, stated as data rather than as prose: the ṭabaqa rule is checked before ESC-1.
      refusal: withTabaqa
        ? ('TABAQA_ON_CHARITABLE_WAQF' as const)
        : withLink
          ? ('DESCENDANT_ON_CHARITABLE_WAQF' as const)
          : null,
      withLink,
      withTabaqa,
      order: effectiveOrder,
    };
  });

/**
 * The general cohort: one nature or the other, never mixed.
 *
 * Family is the majority because it is the nature the product's normal deed shape applies to and the
 * only one with a lineage graph to explore; charitable is a fifth of draws, enough to keep the jiha
 * gates and the untiered-member paths covered.
 *
 * ⚠ Since finding ESC-1×R6 the charitable branch is **jiha-only** — see {@link arbCharitableCohort}.
 *
 * ⚠⚠ **THE CONSEQUENCE THIS COMMENT USED TO CLAIM IS NO LONGER TRUE, AND R7 IS WHAT MADE IT FALSE.** It
 * read: *"the only untiered beneficiary the engine still admits is a `CHARITABLE_JIHA`, and a jiha can
 * only stand on a `PUBLIC_CHARITABLE` waqf, where nothing else may be recorded at all. So no cohort can
 * hold a tiered member and an untiered one at the same time, on any order — the S3-D1 escape … is now
 * structurally unrepresentable rather than merely refused."*
 *
 * R7 admits exactly that cohort: **tiered descendants plus an UNTIERED ultimate-taker jiha, on a ذري
 * waqf.** So the shape is representable again and "structurally unrepresentable" would be a comment
 * asserting a property the code lacks. What protects the S3-D1 outcome now is not absence but
 * **default exclusion**: a recorded taker's verdict comes from the reversion clause, and it is EXCLUDED
 * until the bloodline is over — plus I-R1's universal mirror, which refuses any run paying a charity and
 * a certified descendant together. That is a stronger guarantee than absence, and it is NEW CODE, which
 * is why it is asserted ({@link arbReversionRunInput}'s properties) rather than argued here.
 *
 * **This generator is still one-natured**, which is a scope choice: a mixed reversion cohort in the
 * GENERAL arbitrary would put a jiha in a ذري cohort and break coupling 9.
 */
export const arbCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc.oneof(
  { weight: 4, arbitrary: arbFamilyCohort },
  { weight: 1, arbitrary: arbCharitableCohort },
);

/** Does this cohort contain a `CHARITABLE_JIHA`? Decides which `waqfType`s and orders are legal. */
export function cohortIsCharitable(cohort: readonly RawBeneficiary[]): boolean {
  return cohort.some((member) => member.kind === 'CHARITABLE_JIHA');
}

/** Does this cohort contain a `FAMILY` member? */
export function cohortHasFamily(cohort: readonly RawBeneficiary[]): boolean {
  return cohort.some((member) => member.kind === 'FAMILY');
}

/**
 * Can this cohort legally be run under `LINEAGE_CONTINUATION`?
 *
 * Derived from the DATA, not from which generator produced it — which is the whole point. The first
 * version of this module keyed the decision on "does the cohort contain a `CHARITABLE_JIHA`", and the
 * property suite found the hole in seconds: a charitable cohort that happened to draw only
 * `CATEGORY_ONLY` placeholders contains no jiha, so it was treated as ذري, paired with a lineage order,
 * and refused `LINEAGE_LINK_MISSING` — a generated guaranteed refusal inside P1, which then failed
 * demanding `DISTRIBUTION_NEGATIVE`. Reading the engine's actual precondition off the records cannot
 * drift from the engine, and it also holds for a caller-supplied `options.cohort`.
 *
 * The two conditions are exactly `assertSingleWaqfNature`'s and `buildLineage`'s:
 *  · no `CHARITABLE_JIHA` (a charity has no descendants), and
 *  · every `FAMILY` / `CATEGORY_ONLY` member records a `lineageLink` — without it the engine cannot
 *    eligibility-test them and refuses rather than guessing.
 */
export function cohortSupportsLineageOrder(cohort: readonly RawBeneficiary[]): boolean {
  return cohort.every((member) => member.kind !== 'CHARITABLE_JIHA' && member.lineageLink !== null);
}

/**
 * The mixed خيري/ذري cohort ADR-0009 R5 refuses — generated ONLY for the refusal arbitraries.
 *
 * Exported so a property can state the refusal positively ("no generated mixed cohort ever computes")
 * rather than relying on the general generator's absence of one, which would be an argument from
 * silence.
 */
export const arbMixedNatureCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc
  .record({ family: arbFamilyCohort, charitable: arbCharitableCohort })
  .map(({ family, charitable }) => {
    const familyMembers = family.filter((member) => member.kind === 'FAMILY');
    const jihas = charitable.filter((member) => member.kind === 'CHARITABLE_JIHA');
    // Guarantee one of each: a "mixed" cohort with no jiha, or no family member, is not mixed and
    // would silently become a legal input the refusal property then fails on.
    const guaranteedFamily =
      familyMembers.length > 0
        ? familyMembers
        : [
            toRawBeneficiary(
              {
                kind: 'FAMILY',
                active: true,
                tabaqa: 1,
                parentId: null,
                lineageLink: 'SON',
                line: 'ZUHUR',
                branch: 'Branch A',
                stipulatedWeight: '1',
                gate: {
                  verificationStatus: 'VERIFIED',
                  kycLastRefreshed: null,
                  category: null,
                  residency: 'DOMESTIC',
                  disbursingEntity: null,
                },
                bankingRefForProceeds: null,
              },
              900,
            ),
          ];
    const guaranteedJiha =
      jihas.length > 0
        ? jihas
        : [
            toRawBeneficiary(
              {
                kind: 'CHARITABLE_JIHA',
                active: true,
                tabaqa: null,
                parentId: null,
                lineageLink: null,
                line: 'NA',
                branch: 'Charitable',
                stipulatedWeight: '1',
                gate: {
                  verificationStatus: 'VERIFIED',
                  kycLastRefreshed: null,
                  category: null,
                  residency: 'DOMESTIC',
                  disbursingEntity: null,
                },
                bankingRefForProceeds: null,
              },
              901,
            ),
          ];
    // Re-mint ids so the two halves cannot collide (both generators start at ben-000).
    return [...guaranteedFamily, ...guaranteedJiha].map((member, index) => ({
      ...member,
      id: beneficiaryId(index),
      parentId: null,
      lineageLink: member.kind === 'FAMILY' ? 'SON' : null,
      tabaqa: member.kind === 'FAMILY' ? 1 : member.kind === 'CATEGORY_ONLY' ? member.tabaqa : null,
    }));
  });

/**
 * The **R6-D1 cohort**: `CATEGORY_ONLY` placeholders in a real family tree, plus a `CHARITABLE_JIHA`,
 * and **no `FAMILY` member at all**. Generated only to be REFUSED, on a `FAMILY_DHURRI` (وقف ذري) waqf.
 *
 * ═══ WHY THIS GENERATOR EXISTS — FINDING R6-C1 ═══
 * Until it did, **no generator in this module could emit `FAMILY_DHURRI` + a `CHARITABLE_JIHA` at
 * all**, and the two branches were exhaustive: {@link arbTieredCohort}'s untiered subject has to be a
 * jiha (after R6 only a jiha may carry a null `tabaqa`), and {@link arbLiveRunInput} /
 * {@link arbDistributionInput} then type *any* cohort containing a jiha as `PUBLIC_CHARITABLE`.
 * MEASURED over 2 000 draws of `arbDistributionInput()`: zero such shapes.
 *
 * That silence is why 10 000 generated runs stayed green while a hand-built cohort of exactly this
 * shape paid a charity **27,500,000 of 27,500,000 halalas** out of an ancestral endowment, unflagged
 * (R6-D1). **A property whose generator cannot reach a configuration reports its silence as success,
 * at scale.** The refusal now exists (`CHARITABLE_JIHA_ON_FAMILY_WAQF`); this generator is what proves
 * it exists, rather than the suite proving it by never looking.
 *
 * ═══ WHY NO `FAMILY` MEMBER, EVER ═══
 * Not squeamishness — **precedence, measured.** With a `FAMILY` member present the engine refuses
 * earlier, with `COHORT_MIXES_CHARITABLE_AND_FAMILY`, so a generator that drew one would spend those
 * runs re-proving a refusal that already has its own arbitrary while reporting them as coverage of
 * this one. The placeholder-only cohort is precisely the gap the mixed-cohort check could not see: it
 * requires `familyCount > 0`. A caller may assert `familyCount === 0` on every draw.
 *
 * The placeholders carry **real, well-formed lineage edges and derived ṭabaqāt** (`resolveLineage`), so
 * that the jiha-free control — see {@link withoutCharitableJihas} — genuinely COMPUTES. That control is
 * load-bearing: without it, "the engine refuses this cohort" would be satisfied by an engine that
 * refused every family waqf holding placeholders, which is a denial of service rather than a fix.
 *
 * Their vital status varies (`arbBeneficiaryBody` is biased 4:1 live), which reaches both measured
 * halves of R6-D1: the all-dead register where the jiha took the entire 27,500,000, and the
 * living-ṭabaqa-1 register where it still diverted 13,750,000 from the bloodline.
 *
 * ⚠ The placeholders' edges are R6-F1 fictions in the same sense as {@link arbCharitableCohort}'s —
 * recorded because R6 requires a link on every `CATEGORY_ONLY` record. Here it is doubly harmless:
 * every draw is refused before `buildLineage` runs.
 *
 * ⚠⚠ **R7 · THE REFUSAL THIS COHORT PROVES IS NOW CONDITIONAL, AND THIS COHORT IS THE CONDITION'S FALSE
 * SIDE.** `CHARITABLE_JIHA_ON_FAMILY_WAQF` fires for a jiha the deed does **not** name as its ultimate
 * taker. This cohort is a bare cohort — it carries no clause — and every consumer builds it through
 * {@link arbLiveRunInput}, which emits `reversion: null` (coupling 9). So the refusal still fires on every
 * draw, and it fires for the R7 reason rather than the pre-R7 one.
 *
 * **That `null` is load-bearing, not incidental**: attach a clause naming these jihas and the identical
 * register becomes LEGAL, and this generator silently stops proving anything. Its consumers therefore
 * assert `input.reversion === null` at the point of use rather than trusting the builder.
 */
export const arbFamilyWaqfJihaCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc
  .record({
    // 0 placeholders is included on purpose: the jiha ALONE on a ذري waqf is the simplest form of the
    // contradiction, and under ORDERED it was the shape that ran to completion and was PAID 100%.
    placeholders: fc.array(arbBeneficiaryBody, { minLength: 0, maxLength: 4 }),
    nodes: fc.array(arbLineageNode, { minLength: 4, maxLength: 4 }),
    jihas: fc.array(arbBeneficiaryBody, { minLength: 1, maxLength: 2 }),
    reversed: fc.boolean(),
  })
  .map(({ placeholders, nodes, jihas, reversed }) => {
    const lineage = resolveLineage(nodes.slice(0, placeholders.length));
    const cohort: RawBeneficiary[] = placeholders.map((body, index) => {
      const edge = lineage[index];
      return toRawBeneficiary(
        {
          ...body,
          kind: 'CATEGORY_ONLY',
          tabaqa: edge?.depth ?? 1,
          parentId: edge?.parentId ?? null,
          lineageLink: edge?.link ?? 'SON',
          // Non-zero so the control cohort has a real denominator to split — a '0'-weight placeholder
          // would make the control's payout trivially nil and the restored-money check vacuous.
          stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
        },
        index,
      );
    });
    jihas.forEach((body) => {
      cohort.push(
        toRawBeneficiary(
          {
            ...body,
            kind: 'CHARITABLE_JIHA',
            // Live, so that "the charity was never even considered" is the refusal's doing and not the
            // beneficiary's own vital status.
            active: true,
            tabaqa: null,
            parentId: null,
            lineageLink: null,
            line: 'NA',
            branch: 'Charitable',
            stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
          },
          cohort.length,
        ),
      );
    });
    return reversed ? [...cohort].reverse() : cohort;
  });

/**
 * The same cohort with every `CHARITABLE_JIHA` removed — the **control** for the refusal above.
 *
 * A refusal property on its own cannot tell "the engine refuses a charity on an ancestral waqf" from
 * "the engine refuses this whole family of inputs". Running the identical register minus the jiha and
 * requiring it to RESOLVE is what separates them, and it is the same control the hand-built R6-D1
 * inversion carries (`r6-adversarial.test.ts`: the jiha-free register pays the living descendant the
 * 13,750,000 the defect diverted).
 */
export function withoutCharitableJihas(
  cohort: readonly RawBeneficiary[],
): readonly RawBeneficiary[] {
  return cohort.filter((member) => member.kind !== 'CHARITABLE_JIHA');
}

/**
 * A legal خيري cohort in which **one jiha carries a generational ṭabaqa** — the S3-D3 contradiction.
 *
 * ═══ ALSO PART OF FINDING R6-C1 ═══
 * `JIHA_TIERED` had **no generator either**: {@link toRawBeneficiary} hard-normalises a jiha's `tabaqa`
 * to `null` (deliberately, so the general properties explore the legal space), and nothing anywhere
 * put it back. MEASURED over 2 000 draws of `arbDistributionInput()` plus every specialised
 * generator: zero jihas carrying a ṭabaqa. The refusal was driven only by the hand-built vectors in
 * `jiha-tier-refusal.test.ts` — real coverage, but a fixed set of five, and the property suite was
 * silent about a refusal it appeared to cover.
 *
 * The `tabaqa` is therefore written back **after** `toRawBeneficiary`, which is the one place in this
 * module that deliberately un-does its own normalisation. Stated loudly rather than done quietly.
 *
 * ⚠ **MEASURED PRECEDENCE — this cohort only reaches `JIHA_TIERED` on `ORDERED` and `SHARED`:**
 *  · `LINEAGE_CONTINUATION` ⇒ `LINEAGE_ORDER_ON_CHARITABLE_WAQF` refuses at Stage 0, earlier.
 *  · `NA_DIRECT_USE` ⇒ the run **succeeds**. I7's short-circuit outranks `assertJihaNotTiered`, so a
 *    direct-use خيري waqf carrying a self-contradictory tiered jiha computes and emits no line. It
 *    pays nobody, so no halala moves — but the deed record's contradiction goes unreported. NOT
 *    changed here (engine behaviour is not this file's to decide); recorded, and the property is
 *    scoped to the two orders where the refusal is actually reachable rather than being written to
 *    pass by accident.
 *  · `FAMILY_DHURRI` ⇒ `CHARITABLE_JIHA_ON_FAMILY_WAQF` now refuses first, on any order.
 *
 * ⚠ **The `CATEGORY_ONLY` placeholders this generator used to add beside the jihas are GONE** —
 * finding ESC-1×R6 ({@link arbCharitableCohort}). With one present, a خيري cohort halts
 * `DESCENDANT_ON_CHARITABLE_WAQF` at Stage 0, which is EARLIER than `assertJihaNotTiered` at Stage 2:
 * the generator would have gone on "passing" while proving the wrong refusal, which is precisely the
 * disease this module is being audited for. Jihas only.
 */
export const arbTieredJihaCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc
  .record({
    jihas: fc.array(arbBeneficiaryBody, { minLength: 1, maxLength: 3 }),
    // Which jiha gets the ṭabaqa, and which tier it claims. 1 is included: a jiha claiming to be a
    // child of the waqif is as contradictory as one claiming to be a great-grandchild.
    tieredPick: fc.nat(1_000_000),
    tabaqa: fc.integer({ min: 1, max: 4 }),
    reversed: fc.boolean(),
  })
  .map(({ jihas, tieredPick, tabaqa, reversed }) => {
    const cohort: RawBeneficiary[] = jihas.map((body, index) =>
      toRawBeneficiary(
        {
          ...body,
          kind: 'CHARITABLE_JIHA',
          active: true,
          tabaqa: null,
          parentId: null,
          lineageLink: null,
          line: 'NA',
          branch: 'Charitable',
          stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
        },
        index,
      ),
    );
    const tieredIndex = tieredPick % jihas.length;
    // The deliberate un-normalisation. `toRawBeneficiary` nulls a jiha's ṭabaqa by design; this
    // generator exists precisely to produce the record that contradicts itself.
    const withTier = cohort.map((member, index) =>
      index === tieredIndex ? { ...member, tabaqa } : member,
    );
    return reversed ? [...withTier].reverse() : withTier;
  });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Revenue and receipts (the corpus-guard surface)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface ReceiptDraw {
  readonly capital: boolean;
  readonly amountMinor: bigint;
  readonly capitalSource: CapitalSource;
}

const arbReceiptDraw: fc.Arbitrary<ReceiptDraw> = fc.record({
  // Capital receipts are the minority of real periods but must appear often enough that I-C1's
  // "the corpus total is absent from every downstream figure" is exercised on most runs.
  capital: fc.oneof(
    { weight: 2, arbitrary: fc.constant(false) },
    { weight: 1, arbitrary: fc.constant(true) },
  ),
  amountMinor: arbMinor,
  capitalSource: fc.constantFrom(...CAPITAL_SOURCES),
});

/**
 * Period revenue with its provenance, CONSISTENT by construction.
 *
 * `incomeMinor` is derived as Σ INCOME receipts (never drawn), and `capitalSource` is non-null
 * exactly on CAPITAL rows. An empty receipt list yields `incomeMinor: 0n`, which is the legitimate
 * nil-revenue period (§08 "Zero revenue") — not a corpus-guard refusal.
 */
export const arbRevenue: fc.Arbitrary<RawRevenue> = fc
  .array(arbReceiptDraw, { minLength: 0, maxLength: 6 })
  .map((draws) => {
    const receipts: RawReceipt[] = draws.map((draw, index) => ({
      id: `rcpt-${String(index).padStart(2, '0')}`,
      receiptClass: draw.capital ? 'CAPITAL' : 'INCOME',
      amountMinor: draw.amountMinor,
      capitalSource: draw.capital ? draw.capitalSource : null,
    }));
    const incomeMinor = receipts.reduce(
      (running, receipt) =>
        receipt.receiptClass === 'INCOME' ? running + receipt.amountMinor : running,
      0n,
    );
    return { incomeMinor, receipts };
  });

/** Σ of the receipts in one class — the independent re-derivation I-C1 is checked against. */
export function sumReceipts(revenue: RawRevenue, receiptClass: 'INCOME' | 'CAPITAL'): bigint {
  return revenue.receipts.reduce(
    (running, receipt) =>
      receipt.receiptClass === receiptClass ? running + receipt.amountMinor : running,
    0n,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The Shart's money rules
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Costs are shifted right by `costShift` bits; see "THE COST SHIFT" in the header. */
function damp(value: bigint, costShift: number): bigint {
  return value >> BigInt(costShift);
}

interface MaintenanceDraw {
  readonly pick: number;
  readonly amountMinor: bigint;
  readonly ratePercent: string;
  readonly targetBalanceMinor: bigint;
  readonly currentBalanceMinor: bigint;
}

const arbMaintenanceDraw: fc.Arbitrary<MaintenanceDraw> = fc.record({
  pick: fc.integer({ min: 0, max: 3 }),
  amountMinor: arbMinor,
  ratePercent: arbRatePercent,
  targetBalanceMinor: arbMinor,
  currentBalanceMinor: arbMinor,
});

/**
 * All four ṣiyāna rule kinds. `TARGET_TOPUP` keeps its two balances UNDAMPED relative to each other
 * so `current > target` (a reserve already above target ⇒ a top-up of zero, not a negative one) is
 * routinely generated — that clamp is the difference between a nil top-up and a reserve that
 * inflates distributable.
 */
function toRawMaintenance(draw: MaintenanceDraw, costShift: number): RawMaintenance {
  switch (draw.pick) {
    case 0:
      return { kind: 'FIXED', amountMinor: damp(draw.amountMinor, costShift) };
    case 1:
      return { kind: 'PERCENT', ratePercent: draw.ratePercent };
    case 2:
      return {
        kind: 'TARGET_TOPUP',
        targetBalanceMinor: damp(draw.targetBalanceMinor, costShift),
        currentBalanceMinor: damp(draw.currentBalanceMinor, costShift),
      };
    default:
      return { kind: 'NONE' };
  }
}

interface NazirFeeDraw {
  readonly pick: number;
  readonly ratePercent: string;
  readonly fixedAmountMinor: bigint;
}

const arbNazirFeeDraw: fc.Arbitrary<NazirFeeDraw> = fc.record({
  // pick 3 ⇒ `null`, the deed-is-silent case (AT-02 / AUTHORITY_FEE_DETERMINATION_PENDING).
  pick: fc.integer({ min: 0, max: 3 }),
  ratePercent: arbRatePercent,
  fixedAmountMinor: arbMinor,
});

function toRawNazirFee(draw: NazirFeeDraw, costShift: number): RawNazirFee {
  switch (draw.pick) {
    case 0:
      return { basis: 'PERCENT_OF_REVENUE', ratePercent: draw.ratePercent };
    case 1:
      return { basis: 'PERCENT_OF_NET_INCOME', ratePercent: draw.ratePercent };
    case 2:
      return { basis: 'RETAINER', fixedAmountMinor: damp(draw.fixedAmountMinor, costShift) };
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Timing and policy
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The injected post-FYE deadline: two INDEPENDENT days, per the contract.
 *
 * The Hijri half is `toHijri` of its own independently drawn civil date — not of the Gregorian
 * half. That guarantees it is a real, convertible Umm al-Qura date (`resolveBindingDeadline` calls
 * `fromHijri` and refuses anything else) while leaving the two deadlines genuinely divergent, which
 * is the only way `EARLIER_OF` — decision D2 — is actually exercised.
 */
export const arbDeadline: fc.Arbitrary<RawDeadline> = fc
  .record({
    gregorian: arbDeadlineDate,
    hijriSource: arbDeadlineDate,
    months: fc.constantFrom(0, 1, 3, 6, 12),
    unverified: fc.boolean(),
  })
  .map(({ gregorian, hijriSource, months, unverified }) => ({
    gregorian,
    hijri: toHijri(hijriSource),
    settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
    months,
    unverified,
  }));

/**
 * Resolved configuration.
 *
 * `roundingUnitMinor` is pinned to `1n` and `roundingMethod` to the one implemented method, because
 * every other value is a REFUSAL (`SETTING_INVALID`) — asserted as such by its own property rather
 * than allowed to swallow the run budget of all the others. `bindingCalendar` varies across all
 * three selectors so decision D2's branch is covered on every property.
 */
export const arbPolicy: fc.Arbitrary<RawPolicy> = fc
  .record({
    kycRefreshMonths: fc.integer({ min: 0, max: 36 }),
    bindingCalendar: fc.constantFrom(...BINDING_CALENDARS),
  })
  .map(({ kycRefreshMonths, bindingCalendar }) => ({
    kycRefreshMonths,
    roundingUnitMinor: 1n,
    roundingMethod: 'LARGEST_REMAINDER_HALF_UP' as const,
    bindingCalendar,
    unverifiedNote: UNVERIFIED_NOTE,
  }));

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The whole input
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface InputOptions {
  /**
   * Which orders to draw. Defaults to all FOUR (ADR-0009): `LINEAGE_CONTINUATION` — the deed shape the
   * product treats as normal — carries the largest weight, `ORDERED` and `SHARED` are the preserved
   * exceptions (R4), and `NA_DIRECT_USE` stays at low weight because a direct-use waqf WITH period
   * revenue is the state that makes §08's I2 and I3 false as written (DEFECT-1), so the conservation
   * property must meet it.
   */
  readonly orders?: readonly string[];
  readonly orderWeights?: readonly number[];
  /** Force a cohort generator (the tier and gate properties supply their own). */
  readonly cohort?: fc.Arbitrary<readonly RawBeneficiary[]>;
  /** Force the revenue generator (the corpus properties supply their own). */
  readonly revenue?: fc.Arbitrary<RawRevenue>;
}

/** Both members of the closed continuation vocabulary, drawn evenly. */
export const arbContinuationStipulation = fc.constantFrom<ContinuationStipulation>(
  'ZUHUR_ONLY',
  'ZUHUR_AND_BUTUN',
);

/**
 * An arbitrary, well-formed `DistributionInputRaw`.
 *
 * Well-formed means "the eight couplings in the header hold". It does NOT mean the run succeeds: a
 * `DISTRIBUTION_NEGATIVE` waterfall is a legitimate and required part of the explored space.
 *
 * ⚠ What it will NOT produce, and each is a deliberate ADR-0009 choice with its own home:
 * `waqfType: 'JOINT'`, a mixed خيري/ذري cohort, `LINEAGE_CONTINUATION` on a charitable cohort, a
 * malformed lineage graph, or a `LINEAGE_CONTINUATION` run with an unreadable stipulation. All five
 * are guaranteed refusals, and a guaranteed refusal inside a general arbitrary buys one throw at the
 * price of the whole run budget. See {@link arbRefusedNatureInput} and
 * {@link arbMalformedLineageInput}.
 */
export function arbDistributionInput(
  options: InputOptions = {},
): fc.Arbitrary<DistributionInputRaw> {
  const orders = options.orders ?? ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'];
  const orderWeights = options.orderWeights ?? [5, 4, 4, 1];

  return fc
    .record({
      classification: fc.constantFrom(...WAQF_CLASSIFICATIONS),
      entitlementOrderIndex: fc.nat(1_000_000),
      continuation: arbContinuationStipulation,
      // A minority of ORDERED/SHARED runs RECORD a stipulation the path does not consume, so
      // `CONTINUATION_STIPULATION_NOT_APPLIED` is exercised rather than merely declared. Legal — the
      // term is carried, not applied.
      recordUnappliedStipulation: fc.oneof(
        { weight: 4, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) },
      ),
      periodStart: arbAsOfDate,
      periodLengthDays: fc.integer({ min: 0, max: 400 }),
      fiscalYearEnd: fc.constantFrom(...FISCAL_YEAR_ENDS),
      disbursementSchedule: fc.constantFrom(
        'ANNUAL' as const,
        'QUARTERLY' as const,
        'CUSTOM' as const,
        null,
      ),
      revenue: options.revenue ?? arbRevenue,
      operatingCostMinor: arbMinor,
      maintenance: arbMaintenanceDraw,
      nazirFee: arbNazirFeeDraw,
      costShift: fc.integer({ min: 0, max: MAX_COST_SHIFT }),
      beneficiaries: options.cohort ?? arbCohort,
      asOfGregorian: arbAsOfDate,
      deadline: arbDeadline,
      policy: arbPolicy,
    })
    .map((draw): DistributionInputRaw => {
      const charitable = cohortIsCharitable(draw.beneficiaries);

      // `waqfType` FOLLOWS the cohort's nature (header coupling 6). `JOINT` is never chosen — it is a
      // refused value, not a narrowed vocabulary member, and `arbRefusedNatureInput` generates it.
      const waqfType: WaqfType = charitable ? 'PUBLIC_CHARITABLE' : 'FAMILY_DHURRI';

      const picked = pickWeighted(orders, orderWeights, draw.entitlementOrderIndex);
      // A lineage order is legal only on a cohort that can actually be eligibility-tested: no jiha (a
      // charity has no descendants ⇒ LINEAGE_ORDER_ON_CHARITABLE_WAQF) and every member carrying its
      // lineage fact (⇒ LINEAGE_LINK_MISSING otherwise). Substituted rather than filtered, so no run
      // budget is discarded — a filter at 10 000 runs would silently shrink the explored space.
      const order =
        picked === 'LINEAGE_CONTINUATION' && !cohortSupportsLineageOrder(draw.beneficiaries)
          ? 'SHARED'
          : picked;

      const continuationStipulation =
        order === 'LINEAGE_CONTINUATION'
          ? draw.continuation
          : draw.recordUnappliedStipulation
            ? draw.continuation
            : null;

      const asOf = dual(draw.asOfGregorian);

      return {
        waqfId: 'waqf-prop',
        classification: draw.classification,
        waqfType,
        entitlementOrder: order,
        continuationStipulation,
        // R7 · EXPLICITLY null — coupling 9. A مآل clause needs a `CHARITABLE_JIHA` inside a ذري cohort,
        // which is precisely the pair this generator's two exhaustive branches cannot produce, and a
        // reversion recorded without one is a guaranteed refusal. The reversion population lives in
        // {@link arbReversionRunInput}; P12's census pins this `null` so the confinement is a checked fact.
        reversion: null,
        period: {
          start: draw.periodStart,
          end: addCalendarDays(draw.periodStart, draw.periodLengthDays),
        },
        fiscalYearEnd: draw.fiscalYearEnd,
        disbursementSchedule: draw.disbursementSchedule,
        revenue: draw.revenue,
        operatingCostMinor: damp(draw.operatingCostMinor, draw.costShift),
        maintenance: toRawMaintenance(draw.maintenance, draw.costShift),
        nazirFee: toRawNazirFee(draw.nazirFee, draw.costShift),
        beneficiaries: [...draw.beneficiaries],
        asOf: { gregorian: asOf.gregorian, hijri: asOf.hijri },
        deadline: draw.deadline,
        policy: draw.policy,
      };
    });
}

/** Deterministic weighted pick, so the choice shrinks with its integer draw. */
function pickWeighted(
  values: readonly string[],
  weights: readonly number[],
  index: number,
): string {
  const total = values.reduce((running, _value, position) => running + (weights[position] ?? 1), 0);
  let cursor = index % total;
  for (const [position, value] of values.entries()) {
    cursor -= weights[position] ?? 1;
    if (cursor < 0) return value;
  }
  return values[0] ?? 'SHARED';
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Specialised generators
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A cohort guaranteed to produce ≥ `minEntitled` ENTITLED lines under `SHARED`.
 *
 * Every member is `active` with a non-zero weight, so `sharedExclusionReason` returns `null` for
 * all of them. `kind` is restricted to `FAMILY` and `CATEGORY_ONLY` so `waqfType` stays non-JOINT
 * without a further coupling; the gate fields still vary freely, which is the point — the I6
 * property needs many entitled lines whose PAYABILITY differs.
 */
export function arbEntitledCohort(
  minEntitled: number,
  maxEntitled: number,
): fc.Arbitrary<readonly RawBeneficiary[]> {
  return fc
    .record({
      draws: fc.array(
        fc.record({
          kind: fc.constantFrom<BeneficiaryKind>('FAMILY', 'CATEGORY_ONLY'),
          // ADR-0009: every member is a CHILD OF THE WAQIF — `parentId: null`, derived depth 1, so
          // `tabaqa` must be 1 and cannot be drawn. Flat by design: this cohort exists for the I6 gate
          // property, which needs many entitled lines and no eligibility structure to reason about.
          lineageLink: fc.constantFrom<LineageLink>('SON', 'DAUGHTER'),
          line: fc.constantFrom(...BENEFICIARY_LINES),
          branch: fc.option(fc.constantFrom('Branch A', 'Branch B'), { nil: null }),
          stipulatedWeight: arbNonZeroWeight,
          gate: arbGateFields,
          bankingRefForProceeds: fc.option(fc.constant('FAKE-ACCT-1'), { nil: null }),
        }),
        { minLength: minEntitled, maxLength: maxEntitled },
      ),
      reversed: fc.boolean(),
    })
    .map(({ draws, reversed }) => {
      const cohort = draws.map((draw, index) =>
        toRawBeneficiary({ ...draw, active: true, tabaqa: 1, parentId: null }, index),
      );
      return reversed ? [...cohort].reverse() : cohort;
    });
}

/**
 * A cohort for the ORDERED-monotonicity property (I5).
 *
 * ═══ THE SHAPE, AND WHY IT IS A TREE NOW ═══
 * ```
 * ben-000  ṭabaqa 1, EXTINCT (active: false)      ← the senior generation, recorded and dead
 *   └── ben-001  ṭabaqa 2, forced ALIVE           ← so `lowestLivingTabaqa` is never null
 *         └── ben-002  ṭabaqa 3 …  up to ṭabaqa 5
 * plus 0…2 SIBLINGS attached to any spine node, so a tier can hold more than one member
 * ```
 *
 * ⚠ **R6 (product owner, 2026-08-03) FORCED THIS REWRITE, in two separate places.** The S3 generator
 * minted every member with `parentId: null, lineageLink: null` and a free-floating `tabaqa` of 2 … 5,
 * plus 0 … 2 members with `tabaqa: null`. Neither survives:
 *
 *  1. **A ṭabaqa is no longer a free integer — it is a CROSS-CHECK against the depth the parent edges
 *     derive.** A member declaring ṭabaqa 4 must show three ancestors on file, so the cohort is built
 *     as an actual chain and a ṭabaqa-1 root has to EXIST. It is generated extinct, which is what
 *     leaves the lowest LIVING tier at 2 or below and keeps the property's premise
 *     ("ṭabaqa 1 comes alive") meaningful.
 *  2. **An untiered `FAMILY` / `CATEGORY_ONLY` member is refused outright** (`LINEAGE_LINK_MISSING`
 *     without a link, `TABAQA_MISMATCHES_LINEAGE_DEPTH` with one). That shape was S3's DEFECT-A1 and
 *     it is now unrepresentable — which is the whole of R6.
 *
 * ⚠⚠ **THE OLD COMMENT HERE RATIFIED A FIQH READING AND IS RETIRED WITH THE SHAPE IT DESCRIBED.** It
 * said untiered members "are the case that must NOT be tier-excluded, and the case whose share
 * legitimately RISES when a senior tier appears". Calling an untiered FAMILY member's exemption and
 * its enrichment "legitimate" was a reading of the founder's deed made in a generator — the reading
 * the owner has now rejected (`g9-adversarial.test.ts` DEFECT-A1). Nothing here calls it legitimate.
 *
 * ═══ THERE IS NO UNTIERED MEMBER ANY MORE, AND THAT IS THE FINDING ═══
 * S3's version, and then R6's, kept an untiered subject alive so the property's secondary claim —
 * *an untiered member is never tier-excluded* — had something to be about. R6 already forced that
 * subject to be a `CHARITABLE_JIHA` (the only kind that may carry a null `tabaqa`), which forced the
 * tiered chain to become `CATEGORY_ONLY` placeholders on a `PUBLIC_CHARITABLE` waqf.
 *
 * **ESC-1 removed that last host.** A `CATEGORY_ONLY` member is now unrepresentable on a خيري waqf in
 * either recording (see {@link arbCharitableCohort} for the measured table), so the charitable variant
 * cannot be built at all — and, following the chain through, **no cohort the engine admits can hold a
 * tiered member and an untiered one simultaneously, on any order:**
 *
 *  · on a ذري waqf every `FAMILY`/`CATEGORY_ONLY` member must carry a lineage edge (R6), and an edge
 *    forces a derived depth, so **everyone is tiered**; a jiha is refused outright (R6-D1);
 *  · on a خيري waqf only jihas may be recorded, and a jiha may not carry a ṭabaqa (S3-D3), so
 *    **nobody is tiered**.
 *
 * MEASURED: `FAMILY_DHURRI` + one tiered member + one untiered `FAMILY` member ⇒
 * `LINEAGE_LINK_MISSING`; `PUBLIC_CHARITABLE` + one jiha + one ṭabaqa-1 `CATEGORY_ONLY` ⇒
 * `DESCENDANT_ON_CHARITABLE_WAQF`. Both still hold.
 *
 * ⚠⚠ **BUT THE CONCLUSION DRAWN FROM THEM IS RETIRED BY R7, AND ITS OLD WORDING IS KEPT AS THE RECORD.**
 * It read: *"The S3-D1 escape is therefore **structurally unrepresentable**, not merely refused — which is
 * a stronger result than the property that used to chase it."* R7 makes a third cohort legal that neither
 * measurement covers: **tiered descendants on a ذري waqf plus an untiered `CHARITABLE_JIHA` the deed names
 * as its ultimate taker.** I5's untiered exemption therefore has a reachable subject again, and the
 * exemption is the CORRECT answer for it — a recorded taker must not be tier-excluded, because tiers are
 * not what decides it.
 *
 * **THIS generator still cannot build that cohort, and that is deliberate**: it exists for the ORDERED
 * monotonicity pair (`withSeniorTabaqaMember` must not change the cohort's nature), and adding a taker
 * would make every draw a reversion run. The reachable subject is generated by
 * {@link arbReversionRunInput} under `ORDERED`, where the taker's default exclusion is asserted directly.
 * So the property over THIS cohort still counts zero untiered subjects — but the reason is now *"this
 * generator has none"*, not *"the engine admits none"*, and stating it the old way would be an argument
 * from silence about a shape that has since become legal.
 */
export const arbTieredCohort: fc.Arbitrary<readonly RawBeneficiary[]> = fc
  .record({
    root: arbBeneficiaryBody,
    spine: fc.array(arbBeneficiaryBody, { minLength: 1, maxLength: 4 }),
    siblings: fc.array(fc.record({ attachAt: fc.nat({ max: 4 }), body: arbBeneficiaryBody }), {
      minLength: 0,
      maxLength: 2,
    }),
    // A placeholder is not a leg, and on a ذري waqf it is legal beside FAMILY members — so the
    // `CATEGORY_ONLY` half of the tier tree stays generated, keeping `CATEGORY_NOT_CAPTURED`
    // reachable on this path. What is gone is the UNTIERED subject, not the placeholder kind.
    placeholderPicks: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
    reversed: fc.boolean(),
  })
  .map(({ root, spine, siblings, placeholderPicks, reversed }) => {
    const kindAt = (index: number): BeneficiaryKind =>
      placeholderPicks[index] === true ? 'CATEGORY_ONLY' : 'FAMILY';
    const cohort: RawBeneficiary[] = [];
    /** Parallel to `cohort`: the depth of each spine node, index 0 being the ṭabaqa-1 root. */
    const spineIds: string[] = [];

    const rootMember = toRawBeneficiary(
      {
        ...root,
        kind: kindAt(0),
        // EXTINCT by construction. A living ṭabaqa 1 would make the property's perturbation a no-op.
        active: false,
        tabaqa: 1,
        parentId: null,
        lineageLink: 'SON',
        stipulatedWeight: root.stipulatedWeight === '0' ? '1' : root.stipulatedWeight,
      },
      0,
    );
    cohort.push(rootMember);
    spineIds.push(rootMember.id);

    spine.forEach((body, offset) => {
      const parentId = spineIds[offset] ?? rootMember.id;
      const member = toRawBeneficiary(
        {
          ...body,
          kind: kindAt(cohort.length),
          // The first spine member is always living, so `lowestLivingTabaqa` is never null and the
          // "before" run always has an entitled tier to be driven to zero.
          active: offset === 0 ? true : body.active,
          tabaqa: offset + 2,
          parentId,
          lineageLink: 'SON',
          stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
        },
        cohort.length,
      );
      cohort.push(member);
      spineIds.push(member.id);
    });

    siblings.forEach(({ attachAt, body }) => {
      // Attach to a spine node that exists; its child sits one tier below it.
      const parentDepthIndex = attachAt % spineIds.length;
      const parentId = spineIds[parentDepthIndex] ?? rootMember.id;
      cohort.push(
        toRawBeneficiary(
          {
            ...body,
            kind: kindAt(cohort.length),
            tabaqa: parentDepthIndex + 2,
            parentId,
            lineageLink: 'DAUGHTER',
            stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
          },
          cohort.length,
        ),
      );
    });

    return reversed ? [...cohort].reverse() : cohort;
  });

/**
 * Revenue that is strictly positive, with its provenance intact.
 *
 * Used by the properties that need a real pool to split (I5, I6): a nil pool short-circuits before
 * the resolver and the allocator, so it proves nothing about either.
 */
export const arbPositiveRevenue: fc.Arbitrary<RawRevenue> = fc
  .record({
    incomeParts: fc.array(fc.bigInt({ min: 1n, max: MAX_MINOR / 4n }), {
      minLength: 1,
      maxLength: 3,
    }),
    capitalParts: fc.array(
      fc.record({ amountMinor: arbMinor, capitalSource: fc.constantFrom(...CAPITAL_SOURCES) }),
      { minLength: 0, maxLength: 2 },
    ),
  })
  .map(({ incomeParts, capitalParts }) => {
    const receipts: RawReceipt[] = incomeParts.map((amountMinor, index) => ({
      id: `rcpt-inc-${String(index)}`,
      receiptClass: 'INCOME',
      amountMinor,
      capitalSource: null,
    }));
    capitalParts.forEach((part, index) => {
      receipts.push({
        id: `rcpt-cap-${String(index)}`,
        receiptClass: 'CAPITAL',
        amountMinor: part.amountMinor,
        capitalSource: part.capitalSource,
      });
    });
    return {
      incomeMinor: incomeParts.reduce((running, part) => running + part, 0n),
      receipts,
    };
  });

/**
 * An input guaranteed to reach Stage 5 with a POSITIVE distributable and a live entitled cohort.
 *
 * The money side is constrained rather than damped: revenue ≥ 1 000 000 halalas, the ṣiyāna reserve
 * is a PERCENT ≤ 50, the operating cost is zero and the fee is either silent or ≤ 20% of revenue.
 * So `distributable ≥ revenue × 0.3 > 0` by construction — no `fc.pre`, no discarded runs, and no
 * property that quietly degenerates into "the engine threw again".
 */
export function arbLiveRunInput(
  cohort: fc.Arbitrary<readonly RawBeneficiary[]>,
  order: string,
  /**
   * The deed's continuation stipulation. **Required, non-null, when `order` is
   * `LINEAGE_CONTINUATION`** — the engine has no default and would halt
   * `CONTINUATION_STIPULATION_UNRECOGNISED`, turning every run of the calling property into one throw.
   * Left `null` on the other orders unless a caller wants the not-applied flag.
   */
  continuationStipulation: ContinuationStipulation | null = null,
): fc.Arbitrary<DistributionInputRaw> {
  return fc
    .record({
      classification: fc.constantFrom(...WAQF_CLASSIFICATIONS),
      revenue: arbPositiveRevenue,
      maintenanceRate: fc.integer({ min: 0, max: 50 }).map(String),
      feePick: fc.integer({ min: 0, max: 2 }),
      feeRate: fc.integer({ min: 0, max: 20 }).map(String),
      beneficiaries: cohort,
      periodStart: arbAsOfDate,
      periodLengthDays: fc.integer({ min: 0, max: 400 }),
      fiscalYearEnd: fc.constantFrom(...FISCAL_YEAR_ENDS),
      disbursementSchedule: fc.constantFrom('ANNUAL' as const, null),
      asOfGregorian: arbAsOfDate,
      deadline: arbDeadline,
      policy: arbPolicy,
    })
    .map((draw): DistributionInputRaw => {
      const asOf = dual(draw.asOfGregorian);
      const nazirFee: RawNazirFee =
        draw.feePick === 0
          ? null
          : draw.feePick === 1
            ? { basis: 'PERCENT_OF_REVENUE', ratePercent: draw.feeRate }
            : { basis: 'PERCENT_OF_NET_INCOME', ratePercent: draw.feeRate };

      return {
        waqfId: 'waqf-prop-live',
        classification: draw.classification,
        // The waqf's type FOLLOWS THE COHORT'S NATURE, read off the records rather than assumed from
        // which generator produced them. This used to be hardcoded `FAMILY_DHURRI` on the reasoning
        // that "the cohort generators for this path never mint a CHARITABLE_JIHA"; R6 broke that
        // premise — `arbTieredCohort` now has to mint a charitable variant, because after R6 a
        // `CHARITABLE_JIHA` is the ONLY kind that may carry a null `tabaqa` and the untiered-member
        // branch of P3 would otherwise have no subject at all. A hardcoded type would make every such
        // draw a `COHORT_MIXES_CHARITABLE_AND_FAMILY` refusal (header coupling 6).
        waqfType: cohortIsCharitable(draw.beneficiaries) ? 'PUBLIC_CHARITABLE' : 'FAMILY_DHURRI',
        entitlementOrder: order,
        continuationStipulation,
        // R7 · EXPLICITLY null, for the same reason as {@link arbDistributionInput}. Every caller that
        // wants a مآل clause overrides it AFTER this builder — {@link arbReversionRunInput} — exactly as
        // the `waqfType` override works, and for the same reason: this builder types the waqf from the
        // cohort's nature and a reversion cohort deliberately contradicts that typing.
        reversion: null,
        period: {
          start: draw.periodStart,
          end: addCalendarDays(draw.periodStart, draw.periodLengthDays),
        },
        fiscalYearEnd: draw.fiscalYearEnd,
        disbursementSchedule: draw.disbursementSchedule,
        revenue: draw.revenue,
        operatingCostMinor: 0n,
        maintenance: { kind: 'PERCENT', ratePercent: draw.maintenanceRate },
        nazirFee,
        beneficiaries: [...draw.beneficiaries],
        asOf: { gregorian: asOf.gregorian, hijri: asOf.hijri },
        deadline: draw.deadline,
        policy: draw.policy,
      };
    });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Corruptions — the corpus guard's refusal surface
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The ways a caller can fail to evidence its declared ghallah. Each maps to ONE refusal code. */
export type RevenueCorruption =
  | { readonly kind: 'DROP_ALL_RECEIPTS' }
  | { readonly kind: 'OVERSTATE_INCOME'; readonly deltaMinor: bigint }
  | { readonly kind: 'UNDERSTATE_INCOME'; readonly deltaMinor: bigint }
  | { readonly kind: 'RECLASSIFY_INCOME_AS_CAPITAL'; readonly source: CapitalSource }
  | { readonly kind: 'UNKNOWN_RECEIPT_CLASS'; readonly value: string }
  | { readonly kind: 'INCOME_WITH_CAPITAL_SOURCE'; readonly source: CapitalSource };

export const arbRevenueCorruption: fc.Arbitrary<RevenueCorruption> = fc.oneof(
  fc.constant<RevenueCorruption>({ kind: 'DROP_ALL_RECEIPTS' }),
  fc
    .bigInt({ min: 1n, max: MAX_MINOR })
    .map((deltaMinor): RevenueCorruption => ({ kind: 'OVERSTATE_INCOME', deltaMinor })),
  fc
    .bigInt({ min: 1n, max: MAX_MINOR })
    .map((deltaMinor): RevenueCorruption => ({ kind: 'UNDERSTATE_INCOME', deltaMinor })),
  fc
    .constantFrom(...CAPITAL_SOURCES)
    .map((source): RevenueCorruption => ({ kind: 'RECLASSIFY_INCOME_AS_CAPITAL', source })),
  // Near-misses on purpose: the vocabulary is closed AND case-significant, so `'income'` must be
  // refused exactly as loudly as `''` or a random string.
  fc
    .oneof(fc.constantFrom('', 'income', 'Income', 'INCOME ', 'GHALLAH', 'capital'), fc.string())
    .filter((value) => value !== 'INCOME' && value !== 'CAPITAL')
    .map((value): RevenueCorruption => ({ kind: 'UNKNOWN_RECEIPT_CLASS', value })),
  fc
    .constantFrom(...CAPITAL_SOURCES)
    .map((source): RevenueCorruption => ({ kind: 'INCOME_WITH_CAPITAL_SOURCE', source })),
);

/**
 * Apply one corruption to a revenue block, and report the code the engine must answer with.
 *
 * Returns `null` when the corruption would be a no-op on this particular revenue (reclassifying a
 * 0-halala receipt leaves `incomeMinor` still equal to Σ INCOME, so nothing is wrong and nothing
 * should be refused). Returning `null` rather than silently corrupting something else is what keeps
 * the property's expectation honest.
 */
export function corruptRevenue(
  revenue: RawRevenue,
  corruption: RevenueCorruption,
): { readonly revenue: RawRevenue; readonly expectedCode: string } | null {
  const incomeReceipts = revenue.receipts.filter((receipt) => receipt.receiptClass === 'INCOME');

  switch (corruption.kind) {
    case 'DROP_ALL_RECEIPTS': {
      if (revenue.incomeMinor === 0n) return null; // 0 income with no receipts is a valid nil period
      return {
        revenue: { incomeMinor: revenue.incomeMinor, receipts: [] },
        expectedCode: 'RECEIPT_UNCLASSIFIED',
      };
    }
    case 'OVERSTATE_INCOME':
      return {
        revenue: {
          incomeMinor: revenue.incomeMinor + corruption.deltaMinor,
          receipts: revenue.receipts,
        },
        // PRECEDENCE, and it is deliberate in `assertIncomeProvenance`: "no breakdown at all" is a
        // PROVENANCE failure and is checked BEFORE the sum comparison, so an overstatement against
        // an empty receipt list answers `RECEIPT_UNCLASSIFIED`, not `CORPUS_NOT_DISTRIBUTABLE`. The
        // property found this expectation wrong the first time it ran — the engine is right and the
        // table was wrong (AT-11's bare `{ incomeMinor, receipts: [] }` must say "unclassified").
        expectedCode:
          revenue.receipts.length === 0 ? 'RECEIPT_UNCLASSIFIED' : 'CORPUS_NOT_DISTRIBUTABLE',
      };
    case 'UNDERSTATE_INCOME': {
      if (revenue.incomeMinor < corruption.deltaMinor) return null; // would go negative, not shrink
      if (corruption.deltaMinor === 0n) return null;
      return {
        revenue: {
          incomeMinor: revenue.incomeMinor - corruption.deltaMinor,
          receipts: revenue.receipts,
        },
        expectedCode: 'DISTRIBUTION_INPUT_INVALID',
      };
    }
    case 'RECLASSIFY_INCOME_AS_CAPITAL': {
      const target = incomeReceipts.find((receipt) => receipt.amountMinor > 0n);
      if (target === undefined) return null;
      return {
        revenue: {
          incomeMinor: revenue.incomeMinor,
          receipts: revenue.receipts.map((receipt) =>
            receipt.id === target.id
              ? { ...receipt, receiptClass: 'CAPITAL', capitalSource: corruption.source }
              : receipt,
          ),
        },
        // Declared income now exceeds Σ INCOME: value with no income provenance is corpus.
        expectedCode: 'CORPUS_NOT_DISTRIBUTABLE',
      };
    }
    case 'UNKNOWN_RECEIPT_CLASS': {
      const target = revenue.receipts[0];
      if (target === undefined) return null;
      return {
        revenue: {
          incomeMinor: revenue.incomeMinor,
          receipts: revenue.receipts.map((receipt) =>
            receipt.id === target.id
              ? { ...receipt, receiptClass: corruption.value, capitalSource: null }
              : receipt,
          ),
        },
        expectedCode: 'RECEIPT_UNCLASSIFIED',
      };
    }
    case 'INCOME_WITH_CAPITAL_SOURCE': {
      const target = incomeReceipts[0];
      if (target === undefined) return null;
      return {
        revenue: {
          incomeMinor: revenue.incomeMinor,
          receipts: revenue.receipts.map((receipt) =>
            receipt.id === target.id ? { ...receipt, capitalSource: corruption.source } : receipt,
          ),
        },
        expectedCode: 'RECEIPT_UNCLASSIFIED',
      };
    }
    default: {
      const unmapped: never = corruption;
      throw new Error(`corruptRevenue: unmapped corruption ${JSON.stringify(unmapped)}`);
    }
  }
}

/**
 * Add one arbitrary CAPITAL receipt to an input — the I-C1 injection probe (AT-12).
 *
 * `incomeMinor` is untouched, which is the whole point: a corpus receipt of any size must move no
 * halala of the distribution. Sale, istibdal (استبدال) and expropriation proceeds are asl / أصل.
 */
export function withInjectedCapitalReceipt(
  input: DistributionInputRaw,
  amountMinor: bigint,
  source: CapitalSource,
): DistributionInputRaw {
  return {
    ...input,
    revenue: {
      incomeMinor: input.revenue.incomeMinor,
      receipts: [
        ...input.revenue.receipts,
        {
          id: 'rcpt-injected-capital',
          receiptClass: 'CAPITAL',
          amountMinor,
          capitalSource: source,
        },
      ],
    },
  };
}

/** Replace exactly the five gate-relevant fields on one beneficiary (the I6 mutation). */
export function withGateFieldsReplaced(
  input: DistributionInputRaw,
  beneficiaryIndex: number,
  patch: GateFieldPatch,
): DistributionInputRaw {
  return {
    ...input,
    beneficiaries: input.beneficiaries.map((member, index) =>
      index === beneficiaryIndex
        ? {
            ...member,
            verificationStatus: patch.verificationStatus,
            kycLastRefreshed: patch.kycLastRefreshed,
            category: patch.category,
            residency: patch.residency,
            disbursingEntity: patch.disbursingEntity,
          }
        : member,
    ),
  };
}

/**
 * Insert a living SENIOR-generation member (ṭabaqa 1) — the I5 monotonicity probe.
 *
 * The id is chosen to sort AFTER every `ben-###` minted by {@link arbTieredCohort}, so the newcomer
 * is last in id order. That is deliberate: if it sorted first, an off-by-one in the residual
 * tie-break could hide behind the newcomer always being index 0.
 */
export function withSeniorTabaqaMember(
  input: DistributionInputRaw,
  stipulatedWeight: string,
): DistributionInputRaw {
  return {
    ...input,
    beneficiaries: [
      ...input.beneficiaries,
      {
        id: 'zz-senior-newcomer',
        // R6 · the newcomer must not change the cohort's NATURE, or `assertSingleWaqfNature` refuses
        // the "after" run (`COHORT_MIXES_CHARITABLE_AND_FAMILY`) and the property compares a run with
        // a refusal. Read off the data, never off which generator produced it — the same discipline
        // as `cohortSupportsLineageOrder`.
        kind: cohortIsCharitable(input.beneficiaries) ? 'CATEGORY_ONLY' : 'FAMILY',
        active: true,
        tabaqa: 1,
        // IN the graph, as a child of the waqif. R6 requires the link on every order, and depth 1 is
        // the one shape that needs no ancestor from a cohort this function cannot see.
        parentId: null,
        lineageLink: 'SON',
        line: 'ZUHUR',
        branch: 'Branch A',
        stipulatedWeight,
        verificationStatus: 'VERIFIED',
        kycLastRefreshed: null,
        // Non-null so a CATEGORY_ONLY newcomer is not WITHHELD on CATEGORY_NOT_CAPTURED, which would
        // move the pool for a payability reason and confuse the entitlement claim being tested.
        category: 'unnamed segment (fictional)',
        residency: 'DOMESTIC',
        disbursingEntity: null,
        bankingRefForProceeds: null,
      },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 · lineage generators
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A family tree of `minSize` … `maxSize` members carrying a non-zero deed weight, with a real
 * generated shape and a generated **vital status**.
 *
 * ═══ WHY `vitalStatus` EXISTS (R-FRONTIER, 2026-08-03) ═══
 * This generator used to mint every member ALIVE, full stop, and the comment justifying it read
 * *"under `ZUHUR_AND_BUTUN` every member is eligible, so the cohort size IS the denominator"*. That was
 * true of the SUPERSEDED rule. Under R-FRONTIER entitlement sits at the nearest living point on each
 * line, so an all-alive tree entitles **only its roots** and every deeper member is excluded
 * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`. Generating nothing but all-alive trees would therefore leave
 * the whole substitution half of the rule ungenerated: no dead ancestor with a living descendant, no
 * living grandparent above a dead parent, no branch whose frontier is two generations down.
 *
 *  · `'ALL_ALIVE'` — the original shape, kept because it is the *pure frontier* case: the entitled set
 *    is exactly the set of roots, which is knowable without walking anything, so a property can check
 *    the walk against a closed form.
 *  · `'MIXED'` — each member is independently ~40% deceased. On a 2–9 member tree that reliably yields
 *    all four shapes the frontier rule turns on: living root, dead root with living issue, dead parent
 *    under a LIVING grandparent (the case a "check the parent" implementation gets wrong), and two
 *    dead generations in a row. Properties that assert coverage counts pin that it really does.
 *
 * ⚠ It is deliberately NOT guaranteed that anyone is alive: an all-inactive cohort is a legal input
 * that pays nobody and retains the whole distributable, and a generator that excluded it would leave
 * that path ungenerated too.
 *
 * `weightsEqual` exists because R3's flag is a claim about the *cohort's* recorded weights: with equal
 * weights `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` must be ABSENT, with unequal weights present.
 * Both halves have to be generated or the flag is only ever tested in one direction.
 */
export function arbLineageTreeCohort(
  minSize: number,
  maxSize: number,
  options: { readonly weightsEqual?: boolean; readonly vitalStatus?: 'ALL_ALIVE' | 'MIXED' } = {},
): fc.Arbitrary<readonly RawBeneficiary[]> {
  return fc
    .record({
      bodies: fc.array(
        fc.record({
          line: fc.constantFrom(...BENEFICIARY_LINES),
          branch: fc.option(fc.constantFrom('Branch A', 'Branch B', 'Branch C'), { nil: null }),
          stipulatedWeight: arbNonZeroWeight,
          gate: arbGateFields,
          bankingRefForProceeds: fc.option(fc.constant('FAKE-ACCT-1'), { nil: null }),
        }),
        { minLength: minSize, maxLength: maxSize },
      ),
      nodes: fc.array(arbLineageNode, { minLength: maxSize, maxLength: maxSize }),
      // Drawn per POSITION rather than per member so the draw is independent of the cohort length
      // fast-check happens to pick, and shrinks toward "everyone alive" (the simpler tree).
      deceasedPicks: fc.array(
        fc.oneof(
          { weight: 3, arbitrary: fc.constant(false) },
          { weight: 2, arbitrary: fc.constant(true) },
        ),
        { minLength: maxSize, maxLength: maxSize },
      ),
      reversed: fc.boolean(),
    })
    .map(({ bodies, nodes, deceasedPicks, reversed }) => {
      const lineage = resolveLineage(nodes.slice(0, bodies.length));
      const cohort = bodies.map((body, index) => {
        const edge = lineage[index];
        return toRawBeneficiary(
          {
            ...body,
            kind: 'FAMILY',
            active: options.vitalStatus === 'MIXED' ? deceasedPicks[index] !== true : true,
            stipulatedWeight: options.weightsEqual === true ? '1' : body.stipulatedWeight,
            tabaqa: edge?.depth ?? 1,
            parentId: edge?.parentId ?? null,
            lineageLink: edge?.link ?? 'SON',
          },
          index,
        );
      });
      return reversed ? [...cohort].reverse() : cohort;
    });
}

/**
 * A live `LINEAGE_CONTINUATION` run: positive distributable, a real tree, a stated stipulation.
 *
 * Thin wrapper over {@link arbLiveRunInput}, and it exists to make the stipulation impossible to
 * forget: a `LINEAGE_CONTINUATION` input with a null `continuationStipulation` halts
 * `CONTINUATION_STIPULATION_UNRECOGNISED`, so a property built on the bare helper would run 500 cases
 * and prove one throw.
 */
export function arbLineageRunInput(
  continuation: ContinuationStipulation,
  options: {
    readonly minSize?: number;
    readonly maxSize?: number;
    readonly weightsEqual?: boolean;
    readonly vitalStatus?: 'ALL_ALIVE' | 'MIXED';
  } = {},
): fc.Arbitrary<DistributionInputRaw> {
  return arbLiveRunInput(
    arbLineageTreeCohort(options.minSize ?? 2, options.maxSize ?? 9, {
      weightsEqual: options.weightsEqual,
      vitalStatus: options.vitalStatus,
    }),
    'LINEAGE_CONTINUATION',
    continuation,
  );
}

/**
 * The proper-ancestor chain of every graph member, nearest first — rebuilt from a RAW cohort.
 *
 * A third implementation of the walk, independent of both `resolver.buildLineage` and
 * `invariants.independentAncestorChains`, so a property built on it is checking the engine rather than
 * paraphrasing it. Tolerant and bounded: it is used on generated cohorts that are well-formed by
 * construction, and a bound rather than a `while (true)` means a generator regression fails instead of
 * hanging the suite.
 */
export function ancestorChains(
  cohort: readonly RawBeneficiary[],
): ReadonlyMap<string, readonly string[]> {
  const byId = new Map(cohort.map((member) => [member.id, member]));
  const chains = new Map<string, readonly string[]>();
  for (const member of cohort) {
    if (member.lineageLink === null) continue;
    const chain: string[] = [];
    let cursor = member.parentId === null ? undefined : byId.get(member.parentId);
    for (let step = 0; step < cohort.length && cursor !== undefined; step += 1) {
      chain.push(cursor.id);
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    chains.set(member.id, Object.freeze(chain));
  }
  return chains;
}

/**
 * Which of R-FRONTIER's four generated shapes a cohort actually contains — a COVERAGE statistic.
 *
 * A property that never met a dead ancestor with a living descendant would prove nothing about the
 * substitution half of the rule while staying perfectly green, which is the failure mode the whole
 * `stats` discipline in `distribution.property.test.ts` exists to catch.
 */
export function frontierShapes(cohort: readonly RawBeneficiary[]): {
  readonly livingRoot: boolean;
  readonly deadAncestorLivingDescendant: boolean;
  readonly livingAncestorLivingDescendant: boolean;
  /** A LIVING ancestor two-or-more steps up, above a DEAD nearer one — the "check the parent" trap. */
  readonly livingGrandparentDeadParent: boolean;
} {
  const byId = new Map(cohort.map((member) => [member.id, member]));
  const chains = ancestorChains(cohort);
  let livingRoot = false;
  let deadAncestorLivingDescendant = false;
  let livingAncestorLivingDescendant = false;
  let livingGrandparentDeadParent = false;

  for (const member of cohort) {
    const chain = chains.get(member.id);
    if (chain === undefined) continue;
    if (chain.length === 0) {
      if (member.active) livingRoot = true;
      continue;
    }
    if (!member.active) continue;
    const statuses = chain.map((id) => byId.get(id)?.active === true);
    if (statuses.some((alive) => !alive)) deadAncestorLivingDescendant = true;
    if (statuses.some((alive) => alive)) livingAncestorLivingDescendant = true;
    // The nearest ancestor is dead and some FURTHER-UP one is alive.
    if (statuses[0] === false && statuses.slice(1).some((alive) => alive)) {
      livingGrandparentDeadParent = true;
    }
  }
  return {
    livingRoot,
    deadAncestorLivingDescendant,
    livingAncestorLivingDescendant,
    livingGrandparentDeadParent,
  };
}

/**
 * The **root of each member's line** — the waqif's own child that heads it. A member's own id when it
 * is itself a root; `undefined` for anyone outside the lineage graph.
 *
 * "Branch" throughout these generators means *a line of descent from one child of the waqif*, and this
 * is the only definition of it: `branch` the STRING field is a display label a caller may set to
 * anything and is never read for arithmetic. Keeping the two apart matters — R-FRONTIER's containment
 * claim ("a death moves entitlement only down that person's own line") is false if "branch" is allowed
 * to mean the free-text label.
 */
export function branchRoots(cohort: readonly RawBeneficiary[]): ReadonlyMap<string, string> {
  const chains = ancestorChains(cohort);
  const roots = new Map<string, string>();
  for (const [id, chain] of chains) roots.set(id, chain.at(-1) ?? id);
  return roots;
}

/**
 * Every living graph member that has at least one recorded descendant — the only deaths that can move
 * the frontier at all.
 *
 * Exported so a property can BIAS its victim draw toward them. A uniformly drawn victim is mostly a
 * leaf or an already-excluded member, whose death changes the entitled SET not at all; a property that
 * only ever drew those would assert containment over a no-op several hundred times and report it as
 * coverage. (The uniform draw is kept too — a death that changes nothing must also be safe.)
 */
export function livingMembersWithIssue(cohort: readonly RawBeneficiary[]): readonly string[] {
  const chains = ancestorChains(cohort);
  const hasIssue = new Set<string>();
  for (const chain of chains.values()) for (const ancestorId of chain) hasIssue.add(ancestorId);
  return cohort
    .filter((member) => member.active && hasIssue.has(member.id))
    .map((member) => member.id);
}

/**
 * A family tree of **exactly `branches` separate lines**, each a chain of `depth` generations, with a
 * generated vital status — the shape R-FRONTIER's containment claim needs and
 * {@link arbLineageTreeCohort} cannot guarantee.
 *
 * ═══ WHY A SECOND TREE GENERATOR ═══
 * `arbLineageTreeCohort` draws each node's parent freely (biased 3:1 AWAY from being a root), so the
 * number of distinct lines is a random variable — a two-member draw is frequently ONE chain. The claim
 * *"killing an ancestor moves entitlement only down their own line and never changes another line's
 * head count"* is **vacuously true on a single-line cohort**, and a property built on a generator that
 * usually produced one would report that vacuity as a pass. This generator fixes the branch count so
 * the "other line" always exists and always has heads to count.
 *
 * ═══ LINE 0 IS BUILT, NOT DRAWN — AND THAT IS THE HEAD-COUNT-RISE CASE ═══
 * ⚠ **MEASURED: the first version of this generator built every line as a pure CHAIN, and
 * `stats.headCountRose` came back ZERO over 1 000 paired runs.** On a chain each death promotes
 * exactly one child, so the denominator is invariant and the property could never meet the case
 * R-FRONTIER exists for — a beneficiary's share FALLING because someone died. A generator that cannot
 * reach a configuration reports its silence as success; the counter caught it, which is the entire
 * point of asserting minimum counts.
 *
 * Line 0 therefore has a forced **fan-out of two**: slots 1 and 2 are both children of the root, and
 * the root and both children are forced ALIVE with the root's link forced `SON` so the ẓuhūr filter
 * cannot pre-empt the substitution under `ZUHUR_ONLY`. Killing that root promotes two heads in place
 * of one and the head count rises by exactly one, deterministically.
 *
 * Lines 1…n-1 are drawn: each node's parent is any EARLIER node in the same line (so a cycle is
 * structurally impossible, `resolveLineage`'s discipline scoped per line), and their vital statuses
 * and links are free — which is what keeps the dead-parent/living-grandparent trap, the
 * two-dead-generations case and the buṭūn break in the explored space.
 */
export function arbBranchedLineageCohort(
  options: { readonly branches?: number; readonly perBranch?: number } = {},
): fc.Arbitrary<readonly RawBeneficiary[]> {
  const branches = Math.max(2, options.branches ?? 3);
  // 4 keeps line 0's forced shape (root + two children + one grandchild) exactly expressible.
  const perBranch = Math.max(4, options.perBranch ?? 4);
  const size = branches * perBranch;

  return fc
    .record({
      bodies: fc.array(
        fc.record({
          line: fc.constantFrom(...BENEFICIARY_LINES),
          branch: fc.option(fc.constantFrom('Branch A', 'Branch B', 'Branch C'), { nil: null }),
          stipulatedWeight: arbNonZeroWeight,
          gate: arbGateFields,
          bankingRefForProceeds: fc.option(fc.constant('FAKE-ACCT-1'), { nil: null }),
        }),
        { minLength: size, maxLength: size },
      ),
      links: fc.array(fc.constantFrom<LineageLink>('SON', 'DAUGHTER'), {
        minLength: size,
        maxLength: size,
      }),
      parentPicks: fc.array(fc.nat(1_000_000), { minLength: size, maxLength: size }),
      deceasedPicks: fc.array(
        fc.oneof(
          { weight: 3, arbitrary: fc.constant(false) },
          { weight: 2, arbitrary: fc.constant(true) },
        ),
        { minLength: size, maxLength: size },
      ),
      reversed: fc.boolean(),
    })
    .map(({ bodies, links, parentPicks, deceasedPicks, reversed }) => {
      const cohort: RawBeneficiary[] = [];
      for (let branch = 0; branch < branches; branch += 1) {
        /** Depth of each already-built node of THIS line, indexed by its offset within the line. */
        const depths: number[] = [];
        for (let offset = 0; offset < perBranch; offset += 1) {
          const slot = branch * perBranch + offset;
          const body = bodies[slot];
          if (body === undefined) continue;

          // Line 0: root, then two children OF THE ROOT, then a grandchild. Everything else draws.
          const forcedParentOffset =
            branch === 0 ? (offset === 0 ? null : offset <= 2 ? 0 : 1) : undefined;
          const parentOffset =
            forcedParentOffset !== undefined
              ? forcedParentOffset
              : offset === 0
                ? null
                : (parentPicks[slot] ?? 0) % offset;

          const parentId =
            parentOffset === null ? null : beneficiaryId(branch * perBranch + parentOffset);
          const depth = parentOffset === null ? 1 : (depths[parentOffset] ?? 0) + 1;
          depths.push(depth);

          const forcedAlive = branch === 0 && offset <= 2;
          cohort.push(
            toRawBeneficiary(
              {
                ...body,
                kind: 'FAMILY',
                active: forcedAlive || deceasedPicks[slot] !== true,
                tabaqa: depth,
                parentId,
                // Line 0's root must be a SON, or ZUHUR_ONLY breaks both its children's lines and the
                // forced substitution never happens under that stipulation.
                lineageLink: branch === 0 && offset === 0 ? 'SON' : (links[slot] ?? 'SON'),
              },
              slot,
            ),
          );
        }
      }
      return reversed ? [...cohort].reverse() : cohort;
    });
}

/**
 * A live `LINEAGE_CONTINUATION` run over a fixed-branch tree — {@link arbBranchedLineageCohort} wired
 * to {@link arbLiveRunInput}, so the pool is positive and the stipulation is never forgotten.
 */
export function arbBranchedLineageRunInput(
  continuation: ContinuationStipulation,
  options: { readonly branches?: number; readonly perBranch?: number } = {},
): fc.Arbitrary<DistributionInputRaw> {
  return arbLiveRunInput(arbBranchedLineageCohort(options), 'LINEAGE_CONTINUATION', continuation);
}

/** Mark one member deceased — the per-capita recomputation probe (ADR-0009 R1/R3). */
export function withMemberDeceased(
  input: DistributionInputRaw,
  beneficiaryId: string,
): DistributionInputRaw {
  return {
    ...input,
    beneficiaries: input.beneficiaries.map((member) =>
      member.id === beneficiaryId ? { ...member, active: false } : member,
    ),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف — the reversion generators (product owner, 2026-08-10)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A وقف ذري may record a charitable jiha as its **ultimate taker**: it receives nothing while any
 * descendant lives, and takes the distributable once the bloodline is over. That is a new legal cohort
 * shape AND a new distribution path, and **lesson 5 applies to it before it applies to anything else** —
 * this repo has already paid, twice and measurably, for a generator that could not reach a
 * configuration and reported its silence as success.
 *
 * ═══ WHY THE REVERSION POPULATION IS ITS OWN GENERATOR (coupling 9) ═══
 * `arbDistributionInput` and `arbLiveRunInput` emit `reversion: null` **explicitly**. Not laziness:
 *
 *  1. A مآل clause is only legal where a `CHARITABLE_JIHA` sits inside a **ذري** cohort, and both
 *     builders type the waqf FROM the cohort's nature (coupling 6), so a jiha-bearing cohort is typed
 *     `PUBLIC_CHARITABLE` and a reversion on it is refused `REVERSION_ON_CHARITABLE_WAQF`.
 *  2. A reversion recorded without a taker jiha is refused too, so putting one in the general arbitrary
 *     would buy a throw at the price of the run budget — the mistake ESC-1×R6 already cost this file.
 *
 * So the general arbitrary stays reversion-free (P12's census pins `reversionRecorded === 0` there, so
 * the confinement is a **checked fact** rather than a convention), and every reversion shape is built
 * here, with its own 10 000-run property and its own coverage minimums.
 *
 * ═══ THE FIVE BLOODLINE STATES, AND WHY THE LAST TWO ARE NOT A LUXURY ═══
 * `ALL_DECEASED` triggers the reversion; `MIXED` and `ALL_LIVING` do not, and the taker takes zero.
 *
 * ⚠ **R7-d (product owner, 2026-08-11) moved the fourth and forced a fifth.** `LIVING_BUT_NONE_ENTITLED`
 * — a deceased `DAUGHTER` root above living issue — used to be the generator for *the reversion is HELD
 * while nobody is entitled*. Now that *"the bloodline is over"* means **no continuing line**, that same
 * register **TRIGGERS** under `LINEAGE_CONTINUATION` + `ZUHUR_ONLY`, and the state it used to cover would
 * have had no generator at all: the hold's whole population would have vanished, taking
 * `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` with it and reporting the silence as success. So
 * `LIVING_CONTINUING_ZERO_WEIGHT` (boundary 1 — living heads on continuing lines, every deed weight `'0'`)
 * was added in the same change, with its own counted minimum. Neither state may be dropped: one proves
 * the widening happened, the other proves it did not go too far.
 *
 * ═══ TWO REFUSALS R7 BRINGS BACK FROM THE DEAD, both re-audited here rather than assumed ═══
 *  · **`JIHA_TIERED`** was unreachable through `runDistribution` and `resolveEntitlement` by any input at
 *    all (P12 listed it with that reason). A ذري waqf could not host a jiha, and the other two types were
 *    spoken for. It is reachable again — {@link arbTieredUltimateTakerCase} — because an ultimate-taker
 *    jiha carrying a `tabaqa` passes every Stage-0 check and lands on the guard at Stage 2.
 *  · **`LINEAGE_ROOTED_OUTSIDE_THE_WAQIF`** was `route: 'BUILD_LINEAGE_ONLY'` since ESC-1, on the
 *    reasoning that the only member allowed outside the family tree is a `CHARITABLE_JIHA` and a jiha's
 *    waqf must be خيري, where ESC-1 refuses the orphaned subtree's own links at Stage 0. **R7 breaks that
 *    reasoning**: an ultimate-taker jiha sits legally outside the graph on a **ذري** waqf, so a
 *    descendant whose `parentId` points at it hangs off something that is not the waqif's line, and
 *    `buildLineage`'s walk refuses it through the front door again. {@link arbMalformedLineageInput}
 *    case 8 builds exactly that; P12's exemption for it is therefore GONE.
 *
 * Neither was found by the suite. Both were found by asking, for every refusal, *"did R7 change what
 * reaches this?"* — which is the audit requirement, not a nice-to-have.
 *
 * ═══ MUTATION-VERIFIED — THE GENERATORS, NOT ONLY THE ENGINE ═══
 * A coverage assertion nobody has broken on purpose is decoration, so each of these was broken and the
 * failure recorded (every file restored by re-editing and confirmed byte-identical with `shasum -a 256`):
 *
 *  · `arbUltimateTakerCohort`'s `ALL_DECEASED` arm forced ALIVE ⇒ P13.1 fails
 *    `expected 0 to be greater than 2000`, plus P13.6 and P13.7. **The whole reverted distribution path
 *    would have gone unexecuted with every assertion in the file still green** — lesson 5, on the feature
 *    it was written for.
 *  · {@link arbRefusedNatureInput}'s R7-f arm disabled ⇒ P12 fails **by name** (`+ "JIHA_TIERED"`) and
 *    P10's per-refusal counter fails `expected 0 to be greater than 50`.
 *  · {@link arbMalformedLineageInput} case 7 disabled ⇒ P12 fails **by name**
 *    (`+ "LINEAGE_ROOTED_OUTSIDE_THE_WAQIF"`).
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The raw (pre-branding) shape of the deed's مآل clause. `null` = the deed records no reversion. */
export type RawReversion = DistributionInputRaw['reversion'];

/**
 * The one recognised مآل reading.
 *
 * Typed `ReversionKind` rather than written as a bare string: if `REVERSION_KINDS` is renamed or its
 * single member replaced, every generator below fails to COMPILE instead of silently generating a
 * `REVERSION_KIND_UNRECOGNISED` refusal into properties that are about something else.
 */
const RECOGNISED_REVERSION_KIND: ReversionKind = 'CHARITABLE_ULTIMATE_TAKER';

/** A legible مآل clause naming exactly these ids. */
export function reversionNaming(ultimateTakerIds: readonly string[]): RawReversion {
  return { kind: RECOGNISED_REVERSION_KIND, ultimateTakerIds: [...ultimateTakerIds] };
}

/**
 * The state of the recorded bloodline — the axis R7-d's trigger turns on.
 *
 * ⚠ **RE-POINTED 2026-08-11 (R7-d).** The owner answered that *"the bloodline is over"* means **no
 * CONTINUING line**, so the trigger is no longer *"nobody is alive"* but *"nobody is alive on a line the
 * deed carries forward"*. That moves one of these states across the line and adds one:
 *
 *  · **`LIVING_BUT_NONE_ENTITLED`** builds a chain whose root is a DECEASED `DAUGHTER` with living
 *    issue. Under **`LINEAGE_CONTINUATION` + `ZUHUR_ONLY`** every survivor is `BUTUN_LINE_NOT_CONTINUED`
 *    and **the reversion now TRIGGERS** — before 2026-08-11 the same register RETAINED the pool. Under
 *    `ZUHUR_AND_BUTUN` the survivors are entitled, and under `ORDERED`/`SHARED` they hold the lowest
 *    living ṭabaqa (or are entitled outright), so those three are the control. Its NAME is still true —
 *    living descendants, none entitled — but it is no longer a generator for *the reversion is held*.
 *  · **`LIVING_CONTINUING_ZERO_WEIGHT`** is the replacement generator for the hold, and it is boundary
 *    1: living descendants, every link a `SON` so **every line continues**, every deed weight `'0'` so
 *    nobody is entitled on `ORDERED`/`SHARED` (`ZERO_STIPULATED_WEIGHT`). The reversion must NOT
 *    trigger. Without it the widening would have deleted the only population that exercises
 *    `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` at all, and the flag would be code no property runs.
 *
 * Callers pass the order and the continuation term, so a state is a **request rather than a
 * guarantee** — which is why {@link ReversionRunCase} reports what the built cohort actually is
 * ({@link ReversionRunCase.continuingBloodlineIds}) and every property derives its expectation from
 * that rather than from the label.
 */
export type BloodlineLiveness =
  /** Every recorded descendant `active: false` ⇒ no line continues ⇒ the reversion TRIGGERS. */
  | 'ALL_DECEASED'
  /** ~40% deceased, with index 0 (always a root, hence always entitled) forced ALIVE. */
  | 'MIXED'
  /** Every recorded descendant living ⇒ the frontier is exactly the roots. */
  | 'ALL_LIVING'
  /**
   * A deceased DAUGHTER root above living issue — living descendants, none entitled.
   *
   * ⚠ Under `LINEAGE_CONTINUATION` + `ZUHUR_ONLY` this is now the **TRIGGERING** shape (R7-d,
   * 2026-08-11): no line the deed continues is still going. Under every other order/term pairing the
   * survivors continue their line and it is held.
   */
  | 'LIVING_BUT_NONE_ENTITLED'
  /**
   * **BOUNDARY 1** · living descendants on lines that plainly CONTINUE (every link a `SON`), each
   * carrying deed weight `'0'`.
   *
   * Nobody is entitled on `ORDERED`/`SHARED` and the reversion must **NOT** trigger: a zero deed weight
   * says nothing about whether a line exists, and paying a charity on the strength of one would be
   * money moved by a data-entry figure. On `LINEAGE_CONTINUATION` the weight is not applied at all
   * (per capita, R3), so there the survivors ARE entitled — which is the same generator proving the
   * neighbouring fact.
   */
  | 'LIVING_CONTINUING_ZERO_WEIGHT';

/**
 * **R7-D1** · how the recorded bloodline is COMPOSED — the axis the extinction trigger turns on once
 * `livingBloodlineIds` is empty, and the one this generator did not have.
 *
 * ⚠ **WHY IT IS AN AXIS AND NOT A COIN FLIP.** `arbUltimateTakerCohort` drew each member's kind from an
 * independent `fc.boolean()`, so with 2 … 6 members a register with **no** placeholder in it arrived at
 * roughly 2⁻ⁿ and a register with one arrived almost always. That was harmless while both kinds meant the
 * same thing to the trigger. R7-D1 makes them mean opposite things — *a placeholder is sound evidence FOR
 * a living bloodline and no evidence at all AGAINST one* — so a coin flip now decides, invisibly and at
 * scale, **which** of the two outcomes a property is really about. Both must be REACHED ON PURPOSE, with a
 * counted minimum, because a property whose generator cannot reach a configuration reports its silence as
 * success and this repo has been bitten by exactly that once already (R6-C1).
 */
export type BloodlineComposition =
  /**
   * Every recorded descendant is an individually-enumerated `FAMILY` record — a named person whose
   * `active: false` really is a death. This is the register the reversion is FOR, and the only one on
   * which extinction can be certified.
   */
  | 'ENUMERATED_ONLY'
  /**
   * At least one `CATEGORY_ONLY` **placeholder** among the recorded descendants — *"the children of
   * Branch A, not yet enrolled"*. Index 0 is forced, so the shape is guaranteed rather than drawn.
   * Extinction is NOT certifiable from this register however many of its records read `active: false`.
   */
  | 'WITH_PLACEHOLDER'
  /** The historical behaviour: an independent coin flip per index. Kept so the mixed register is generated too. */
  | 'DRAWN';

/** How the deed weights the ultimate takers. R7-e: a charity's share IS its deed weight. */
export type TakerWeights =
  /** Every taker a DISTINCT non-zero weight — so a 2-taker split is 70/30-shaped, never per capita. */
  | 'DISTINCT'
  /** The first taker `'0'`, the rest non-zero — the taker ladder's rung 3 (`ZERO_STIPULATED_WEIGHT`). */
  | 'ONE_ZERO'
  /** Every taker `'0'` — refused `ULTIMATE_TAKER_WEIGHTS_UNUSABLE`, never split equally (R7-e). */
  | 'ALL_ZERO';

export interface UltimateTakerCohortOptions {
  readonly liveness: BloodlineLiveness;
  /**
   * **R7-D1** · defaults to `'DRAWN'`, which is what every caller had before the axis existed. A caller
   * whose property needs the reversion to actually TRIGGER must say `'ENUMERATED_ONLY'` — under `'DRAWN'`
   * an `ALL_DECEASED` register is placeholder-bearing about 90% of the time and the trigger is HELD.
   */
  readonly composition?: BloodlineComposition;
  readonly takerWeights?: TakerWeights;
  readonly minBloodline?: number;
  readonly maxBloodline?: number;
  readonly minTakers?: number;
  readonly maxTakers?: number;
  /**
   * Emit the takers with **no bloodline at all** — the `REVERSION_WITH_NO_RECORDED_BLOODLINE` shape.
   *
   * ∅ is *"not yet enrolled"*, not *"extinct"*, and the engine refuses rather than paying a charity
   * because the data entry is incomplete. Generated so that refusal has a generator rather than a
   * paragraph.
   */
  readonly withoutBloodline?: boolean;
}

/**
 * A ذري cohort: a **certified** bloodline (real parent edges, derived ṭabaqāt, generated vital status)
 * plus 1 … 2 `CHARITABLE_JIHA` ultimate takers carrying **no lineage edge and no ṭabaqa**.
 *
 * The takers' edgelessness is not incidental — it is what makes them legal. `buildLineage` pass 3
 * refuses a jiha carrying either field, R6's pass 4 does not demand one from a jiha, and
 * `TABAQA_ON_CHARITABLE_WAQF` is خيري-only. So an ultimate taker is the one beneficiary the engine
 * admits **outside** the family tree on a ذري waqf, which is exactly why it can be paid after the
 * bloodline ends and exactly why it must never be paid before.
 *
 * Bloodline weights are forced non-zero: on `ORDERED`/`SHARED` a `'0'` weight excludes a member
 * (`ZERO_STIPULATED_WEIGHT`), which would silently turn a "descendant entitled" case into a "nobody
 * entitled" one and make property (a) pass for a reason that has nothing to do with the reversion.
 */
export function arbUltimateTakerCohort(
  options: UltimateTakerCohortOptions,
): fc.Arbitrary<readonly RawBeneficiary[]> {
  const minBloodline = options.withoutBloodline === true ? 0 : (options.minBloodline ?? 2);
  const maxBloodline = options.withoutBloodline === true ? 0 : (options.maxBloodline ?? 6);
  const minTakers = options.minTakers ?? 1;
  const maxTakers = options.maxTakers ?? 2;
  const takerWeights = options.takerWeights ?? 'DISTINCT';
  const liveness = options.liveness;
  const composition = options.composition ?? 'DRAWN';

  return fc
    .record({
      bodies: fc.array(arbBeneficiaryBody, { minLength: minBloodline, maxLength: maxBloodline }),
      nodes: fc.array(arbLineageNode, {
        minLength: Math.max(maxBloodline, 1),
        maxLength: Math.max(maxBloodline, 1),
      }),
      // A placeholder is not a leg (ADR-0009), so FAMILY + CATEGORY_ONLY is a legal ذري register. Both
      // kinds are drawn because the refusal PRECEDENCE differs by kind: an unnamed jiha beside a `FAMILY`
      // member halts `COHORT_MIXES_CHARITABLE_AND_FAMILY`, beside placeholders only it halts
      // `CHARITABLE_JIHA_ON_FAMILY_WAQF`, and a generator producing one kind would leave the other's
      // route unproven (that is R6-D1's own lesson, one refusal along).
      placeholderPicks: fc.array(fc.boolean(), {
        minLength: Math.max(maxBloodline, 1),
        maxLength: Math.max(maxBloodline, 1),
      }),
      deceasedPicks: fc.array(
        fc.oneof(
          { weight: 3, arbitrary: fc.constant(false) },
          { weight: 2, arbitrary: fc.constant(true) },
        ),
        { minLength: Math.max(maxBloodline, 1), maxLength: Math.max(maxBloodline, 1) },
      ),
      takerBodies: fc.array(arbBeneficiaryBody, { minLength: minTakers, maxLength: maxTakers }),
      takerWeightPicks: fc.array(fc.integer({ min: 1, max: 1000 }), {
        minLength: maxTakers,
        maxLength: maxTakers,
      }),
      reversed: fc.boolean(),
    })
    .map(
      ({
        bodies,
        nodes,
        placeholderPicks,
        deceasedPicks,
        takerBodies,
        takerWeightPicks,
        reversed,
      }) => {
        const cohort: RawBeneficiary[] = [];

        /**
         * **R7-D1** · the composition axis, applied at every index in one place.
         *
         * `'WITH_PLACEHOLDER'` forces index 0 rather than trusting the draw: the guarantee is the point,
         * and a filtered coin flip would leave the shape's frequency a function of `maxBloodline`.
         * `'ENUMERATED_ONLY'` overrides the draw entirely — a single placeholder anywhere in the register
         * is enough to hold the trigger, so "mostly `FAMILY`" is not the same configuration.
         */
        const kindAt = (index: number): 'FAMILY' | 'CATEGORY_ONLY' => {
          if (composition === 'ENUMERATED_ONLY') return 'FAMILY';
          if (composition === 'WITH_PLACEHOLDER' && index === 0) return 'CATEGORY_ONLY';
          return placeholderPicks[index] === true ? 'CATEGORY_ONLY' : 'FAMILY';
        };

        if (liveness === 'LIVING_CONTINUING_ZERO_WEIGHT') {
          /*
           * **BOUNDARY 1, built rather than drawn.** Every member a LIVING child of the waqif — depth 1,
           * `parentId: null`, an EMPTY proper-ancestor chain — with a `SON` link, so no ancestor walk can
           * break the line under either stipulation and `continuesTheLine` is `true` for every one of
           * them at every continuation term. Deed weight `'0'` on all of them, so on `ORDERED`/`SHARED`
           * the whole cohort is `ZERO_STIPULATED_WEIGHT` and nobody is entitled.
           *
           * That pairing is the boundary the widening most endangers: the entitled cohort is empty and
           * the lines are all alive, so a trigger implemented from the exclusion codes (or from
           * `entitledBloodlineCount`) would fire here and hand a charity the pool while the family lives.
           * Roots rather than a chain on purpose — a chain would add
           * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` to the reasons and make it ambiguous which fact kept
           * the reversion held.
           */
          bodies.forEach((body, index) => {
            cohort.push(
              toRawBeneficiary(
                {
                  ...body,
                  kind: kindAt(index),
                  active: true,
                  tabaqa: 1,
                  parentId: null,
                  lineageLink: 'SON',
                  stipulatedWeight: '0',
                },
                index,
              ),
            );
          });
        } else if (liveness === 'LIVING_BUT_NONE_ENTITLED') {
          /*
           * Built, not drawn — and the shape is the whole point. A DECEASED `DAUGHTER` root with living
           * issue is the register R7-d turned on: under `ZUHUR_ONLY` the ẓuhūr line is over while the
           * FAMILY is not.
           *
           * ⚠ **This is now the TRIGGERING shape** (product owner 2026-08-11: *"bloodline is over means
           * no continuing line"*), not the held one. Before that answer the same register retained the
           * whole pool and flagged `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`; it now pays the deed's
           * مآل. The hold's generator is {@link BloodlineLiveness}'s `LIVING_CONTINUING_ZERO_WEIGHT`.
           *
           * A drawn tree cannot guarantee it: `resolveLineage` biases 3:1 away from roots but every index
           * MAY be a root, and one living root entitles itself (a member's own `lineageLink` is never
           * read, so a living DAUGHTER root is entitled under both stipulations). A chain forces exactly
           * one root and puts every survivor strictly below it.
           */
          bodies.forEach((body, index) => {
            cohort.push(
              toRawBeneficiary(
                {
                  ...body,
                  kind: kindAt(index),
                  // The root is dead so it cannot entitle itself; everyone below is ALIVE so the register
                  // really does hold living descendants — which is what stops the reversion.
                  active: index !== 0,
                  tabaqa: index + 1,
                  parentId: index === 0 ? null : beneficiaryId(index - 1),
                  // DAUGHTER at the root: under ZUHUR_ONLY that breaks every line beneath it, which is
                  // the state the fail-safe branch exists for.
                  lineageLink: index === 0 ? 'DAUGHTER' : 'SON',
                  stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
                },
                index,
              ),
            );
          });
        } else {
          const lineage = resolveLineage(nodes.slice(0, bodies.length));
          const anyLiving =
            liveness === 'ALL_LIVING' ||
            (liveness === 'MIXED' && bodies.some((_body, index) => deceasedPicks[index] !== true));
          bodies.forEach((body, index) => {
            const edge = lineage[index];
            const active =
              liveness === 'ALL_DECEASED'
                ? false
                : liveness === 'ALL_LIVING'
                  ? true
                  : // MIXED · index 0 is always a root (`resolveLineage`), and a living root is entitled
                    // under all three money orders — so forcing it alive when the draw killed everyone
                    // keeps "at least one descendant is ENTITLED" reachable instead of leaving it to luck.
                    index === 0 && !anyLiving
                    ? true
                    : deceasedPicks[index] !== true;
            cohort.push(
              toRawBeneficiary(
                {
                  ...body,
                  kind: kindAt(index),
                  active,
                  tabaqa: edge?.depth ?? 1,
                  parentId: edge?.parentId ?? null,
                  lineageLink: edge?.link ?? 'SON',
                  stipulatedWeight: body.stipulatedWeight === '0' ? '1' : body.stipulatedWeight,
                },
                index,
              ),
            );
          });
        }

        takerBodies.forEach((body, takerIndex) => {
          const pick = takerWeightPicks[takerIndex] ?? 1;
          const weight =
            takerWeights === 'ALL_ZERO'
              ? '0'
              : takerWeights === 'ONE_ZERO' && takerIndex === 0
                ? '0'
                : // Distinct across takers by construction (`pick ≤ 1000`, spaced by 1000), and still
                  // DRAWN — so a 2-taker split is a real unequal weight vector rather than a constant, and
                  // the I-L1/I-R1 swap has something to be about (per capita would give 50/50).
                  String(pick + takerIndex * 1000);
          cohort.push(
            toRawBeneficiary(
              {
                ...body,
                kind: 'CHARITABLE_JIHA',
                // Live, so "the charity took nothing" is the reversion clause's doing and never the
                // beneficiary's own vital status. Its GATE fields still vary freely, which keeps a
                // WITHHELD / CROSS_BORDER_PENDING taker in the explored space.
                active: true,
                tabaqa: null,
                parentId: null,
                lineageLink: null,
                line: 'NA',
                branch: 'Charitable (invented)',
                stipulatedWeight: weight,
              },
              // Ids are minted past the bloodline's range so a taker always sorts AFTER every
              // descendant — a deliberate choice: if a taker sorted first, an off-by-one in the residual
              // tie-break (I9) could hide behind it always being line 0.
              500 + takerIndex,
            ),
          );
        });

        return reversed ? [...cohort].reverse() : cohort;
      },
    );
}

/** Which clause the deed records against a cohort that holds ultimate-taker-shaped jihas. */
export type ReversionClauseShape =
  /** The legal shape: every jiha in the cohort named as مآل. */
  | 'NAMES_EVERY_JIHA'
  /** No clause at all — the pre-R7 record, still refused (R7-b, R7-c). */
  | 'NULL'
  /**
   * A clause naming only SOME of the jihas.
   *
   * The narrowing's negative control: `jihaIds.every(named)` and not `some(named)`, because one unnamed
   * charity beside named ones is still a charity that would be paid concurrently with the family.
   */
  | 'NAMES_SOME_JIHAS';

/** A generated ذري-with-ultimate-taker run, plus everything a property needs to derive its own expectation. */
export interface ReversionRunCase {
  readonly input: DistributionInputRaw;
  /** The ids the clause actually names (empty on `NULL`). */
  readonly takerIds: readonly string[];
  /** Every `CHARITABLE_JIHA` in the cohort, named or not. */
  readonly jihaIds: readonly string[];
  /** The jihas the clause does NOT name — non-empty exactly on `NAMES_SOME_JIHAS`. */
  readonly unnamedJihaIds: readonly string[];
  /** Members the register claims descend from the waqif (`lineageLink !== null`). */
  readonly bloodlineIds: readonly string[];
  readonly livingBloodlineIds: readonly string[];
  /**
   * **R7-d (2026-08-11) · THE TRIGGER'S OWN LIST.** The living recorded descendants who **keep the
   * bloodline going** — descent + liveness + the deed's `continuationStipulation`, and nothing else.
   *
   * A THIRD derivation of the same fiqh rule, on purpose: `resolver.continuesTheLine` is the first,
   * `invariants.independentReversionState` the second, and {@link continuingBloodlineOf} — walking the
   * built cohort's own `parentId` edges — this one. A property that read either engine module's answer
   * would assert that the engine agrees with itself.
   */
  readonly continuingBloodlineIds: readonly string[];
  /**
   * Living recorded descendants whose line the deed does **NOT** continue — non-empty only under
   * `ZUHUR_ONLY`, and the entire content of the widening. Before 2026-08-11 a non-empty list here meant
   * the pool was RETAINED; it now means (absent a placeholder) the reversion FIRES with these people
   * still alive, which is the startling-but-correct state `REVERSION_TRIGGERED` has to name.
   */
  readonly livingNonContinuingBloodlineIds: readonly string[];
  /**
   * **R7-D1** · the recorded descendants that are `CATEGORY_ONLY` **placeholders** for people never
   * enumerated. Non-empty ⇒ the trigger is HELD however many records read `active: false`, because a
   * placeholder's inactivity is nobody's death.
   */
  readonly unenumeratedBloodlineIds: readonly string[];
  /** Whether the cohort holds a `FAMILY` member — it decides which cohort refusal wins. */
  readonly hasFamilyMember: boolean;
  /**
   * R7-d's trigger, re-derived from the BUILT cohort rather than from the `liveness` label.
   *
   * Deriving it from the label would make every property downstream a statement about this generator's
   * intent; deriving it from the data makes them statements about the register, which is what the engine
   * reads too.
   *
   * ⚠ **R7-D1 added the fourth conjunct and it is the one that moved money.** Without
   * `unenumeratedBloodlineIds.length === 0` this field claimed the reversion fires over a register of
   * inactive placeholders — which is exactly what the engine used to do, measured at **27,500,000 of
   * 27,500,000 halalas to the charity** on R6-D1's cohort verbatim.
   *
   * ⚠ **AND THE THIRD CONJUNCT WIDENED ON 2026-08-11 (R7-d).** It read
   * `livingBloodlineIds.length === 0` — the strict reading — and now reads
   * `continuingBloodlineIds.length === 0`. MEASURED: with the resolver widened and this oracle left
   * strict, the 10,000-run mirror failed at case 206 on a `ZUHUR_ONLY` register holding an inactive
   * `CATEGORY_ONLY` daughter above a living son, where the engine answered
   * `REVERSION_PENDING_BLOODLINE_UNENUMERATED` against an oracle still expecting
   * `REVERSION_PENDING_LIVING_BLOODLINE`. The oracle moved; `RUNS_LEAKAGE` did not.
   */
  readonly expectApplied: boolean;
  /**
   * **R7-D1** · the reversion is HELD by placeholder evidence: **no CONTINUING line** is on record, yet
   * the register cannot certify extinction. Disjoint from {@link expectApplied} by construction, and the
   * complement of both is the ordinary "a line the deed continues is still going" hold.
   *
   * ⚠ Widened with `expectApplied` on 2026-08-11 and for the same reason — the placeholder hold is
   * applied *after* the continuing-line test and wins whatever it says (owner-confirmed: a register of
   * unenumerated placeholders must *"hold the reversion"*). Since the widening this state can carry
   * **living** blood descendants: ones on broken daughter lines, who no longer hold the reversion by
   * themselves. Keyed on `continuingBloodlineIds`, never on `livingBloodlineIds`.
   */
  readonly expectHeldByPlaceholder: boolean;
  readonly order: string;
  readonly liveness: BloodlineLiveness;
  readonly composition: BloodlineComposition;
  readonly clause: ReversionClauseShape;
}

export interface ReversionRunOptions extends UltimateTakerCohortOptions {
  readonly order: string;
  readonly continuation?: ContinuationStipulation | null;
  readonly clause?: ReversionClauseShape;
}

/**
 * **R7-d · which recorded descendants KEEP THE BLOODLINE GOING** — the trigger's own predicate, derived
 * here a THIRD time from the built register's own `parentId` edges.
 *
 * ```
 * continues(b) ⇔ b.lineageLink !== null            // on the register's claimed bloodline
 *                ∧ b.active                        // and alive
 *                ∧ ( continuation ≠ 'ZUHUR_ONLY'
 *                    ∨ every ancestor STRICTLY BETWEEN b and the waqif is a SON )
 * ```
 *
 * Three things it deliberately does not read, each of them a boundary the owner's answer turns on:
 *
 *  1. **the member's OWN `lineageLink`.** A son's daughter continues the ẓuhūr line; a daughter's son
 *     does not. The walk is over proper ancestors only, exactly as `resolveEntitlement` does it.
 *  2. **any ancestor's `active`.** Whether a line *continues* is a fact about links; a dead ancestor is
 *     walked THROUGH. R-FRONTIER's living-ancestor fact decides *who holds* the entitlement, which is a
 *     different question — and a descendant waiting behind a living ancestor is proof the line is alive
 *     rather than evidence against it (the ancestor is independently counted here too).
 *  3. **any deed weight, any gate field, any exclusion code.** A zero-weight living head continues a
 *     line; so does a head whose KYC has gone stale. Implementing the trigger from the entitled cohort
 *     is the one mistake that would pay a charity while the family lives.
 *
 * `continuation` is `null` on every order that does not consume the deed's continuation term, and there
 * this collapses to liveness — the strict reading, unchanged.
 */
function continuingBloodlineOf(
  beneficiaries: readonly RawBeneficiary[],
  continuation: ContinuationStipulation | null,
): readonly string[] {
  const byId = new Map(beneficiaries.map((member) => [member.id, member] as const));
  const continues = (member: RawBeneficiary): boolean => {
    if (member.lineageLink === null || !member.active) return false;
    if (continuation !== 'ZUHUR_ONLY') return true;
    // The proper-ancestor walk: start at the PARENT, so the member's own link is never inspected. The
    // hop budget is the register's own size, which cannot be exceeded by an acyclic graph — and
    // `arbUltimateTakerCohort` only ever emits acyclic ones (`resolveLineage` forces parent < index).
    let cursor = byId.get(member.parentId ?? '');
    for (let hops = 0; cursor !== undefined && hops <= beneficiaries.length; hops += 1) {
      if (cursor.lineageLink !== 'SON') return false;
      cursor = byId.get(cursor.parentId ?? '');
    }
    return true;
  };
  return beneficiaries
    .filter((member) => continues(member))
    .map((member) => member.id)
    .sort();
}

/**
 * A live ذري run whose deed names its charitable jiha(s) as **ultimate taker** — the R7-a shape.
 *
 * ⚠ Two fields are overridden AFTER {@link arbLiveRunInput} has built the run, and both overrides ARE the
 * subject:
 *
 *  · `waqfType: 'FAMILY_DHURRI'` — `arbLiveRunInput` types the waqf from the cohort's nature and would
 *    call any jiha-bearing cohort `PUBLIC_CHARITABLE`, which is the exhaustive two-branch typing that
 *    made `FAMILY_DHURRI` + a jiha unreachable in the first place (finding R6-C1). R7 makes that pair
 *    LEGAL, so the override is no longer a malformation — it is the deed shape the owner described.
 *  · `reversion` — the clause itself, built from the cohort's own jiha ids, so the two sides of the
 *    record cannot disagree by accident. `NAMES_SOME_JIHAS` makes them disagree ON PURPOSE.
 *
 * The money side is guaranteed positive by `arbLiveRunInput`, so a refusal from one of these inputs is
 * never "the pool went negative" — it is always the deed record.
 */
export function arbReversionRunInput(options: ReversionRunOptions): fc.Arbitrary<ReversionRunCase> {
  const clause = options.clause ?? 'NAMES_EVERY_JIHA';
  return arbLiveRunInput(
    arbUltimateTakerCohort(options),
    options.order,
    options.continuation ?? (options.order === 'LINEAGE_CONTINUATION' ? 'ZUHUR_ONLY' : null),
  ).map((built): ReversionRunCase => {
    const jihaIds = built.beneficiaries
      .filter((member) => member.kind === 'CHARITABLE_JIHA')
      .map((member) => member.id)
      .sort();
    // `NAMES_SOME_JIHAS` drops the LAST id rather than the first, so the named set is never empty (an
    // empty list is a different refusal, `REVERSION_WITH_NO_ULTIMATE_TAKER`, with its own generator).
    const namedIds =
      clause === 'NULL'
        ? []
        : clause === 'NAMES_SOME_JIHAS' && jihaIds.length > 1
          ? jihaIds.slice(0, -1)
          : jihaIds;
    const bloodline = built.beneficiaries.filter((member) => member.lineageLink !== null);
    const livingBloodlineIds = bloodline
      .filter((member) => member.active)
      .map((member) => member.id)
      .sort();
    const unenumeratedBloodlineIds = bloodline
      .filter((member) => member.kind === 'CATEGORY_ONLY')
      .map((member) => member.id)
      .sort();
    const clauseUsable = clause !== 'NULL' && namedIds.length > 0 && bloodline.length > 0;
    // R7-d · read off the BUILT input's own term, not off `options.continuation`: `arbLiveRunInput`
    // decides what actually lands on the deed, and an oracle that trusted the request rather than the
    // record would drift from the engine the moment that mapping changed.
    const builtContinuation: ContinuationStipulation | null =
      built.entitlementOrder === 'LINEAGE_CONTINUATION' &&
      built.continuationStipulation !== null &&
      (CONTINUATION_STIPULATIONS as readonly string[]).includes(built.continuationStipulation)
        ? (built.continuationStipulation as ContinuationStipulation)
        : null;
    const continuingBloodlineIds = continuingBloodlineOf(built.beneficiaries, builtContinuation);
    const continuingSet = new Set(continuingBloodlineIds);

    return {
      input: {
        ...built,
        waqfType: 'FAMILY_DHURRI',
        reversion: clause === 'NULL' ? null : reversionNaming(namedIds),
      },
      takerIds: Object.freeze(namedIds),
      jihaIds: Object.freeze(jihaIds),
      unnamedJihaIds: Object.freeze(jihaIds.filter((id) => !namedIds.includes(id))),
      bloodlineIds: Object.freeze(bloodline.map((member) => member.id).sort()),
      livingBloodlineIds: Object.freeze(livingBloodlineIds),
      continuingBloodlineIds: Object.freeze(continuingBloodlineIds),
      livingNonContinuingBloodlineIds: Object.freeze(
        livingBloodlineIds.filter((id) => !continuingSet.has(id)),
      ),
      unenumeratedBloodlineIds: Object.freeze(unenumeratedBloodlineIds),
      hasFamilyMember: built.beneficiaries.some((member) => member.kind === 'FAMILY'),
      // The trigger, spelled out: a clause exists, the register is non-empty, NO LINE THIS DEED
      // CONTINUES is still going (R7-d, 2026-08-11 — was `livingBloodlineIds.length === 0`), and every
      // record in it is an ENUMERATED person whose inactivity is a death (R7-D1).
      expectApplied:
        clauseUsable &&
        continuingBloodlineIds.length === 0 &&
        unenumeratedBloodlineIds.length === 0,
      expectHeldByPlaceholder:
        clauseUsable && continuingBloodlineIds.length === 0 && unenumeratedBloodlineIds.length > 0,
      order: options.order,
      liveness: options.liveness,
      composition: options.composition ?? 'DRAWN',
      clause,
    };
  });
}

/** The three orders that resolve a cohort — `NA_DIRECT_USE` resolves none (I7). */
export const MONEY_ORDERS = ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED'] as const;

/**
 * The whole legal reversion space in one arbitrary: every liveness state × every money order.
 *
 * Used by the 10 000-run mirror property, so that "a charity is never paid in the same run as a
 * descendant" is asserted over the ONLY population where it could be violated. Asserting it over the
 * general arbitrary would be very nearly vacuous — that generator cannot put a charity and a bloodline
 * in one cohort at all, which is precisely the silence R6-D1 hid inside.
 */
export const arbAnyReversionRunInput: fc.Arbitrary<ReversionRunCase> = fc
  .record({
    // ⚠ **R7-D1 · `ALL_DECEASED` IS WEIGHTED 3:1:1:1 AND THAT IS NOT A CONVENIENCE.** The composition axis
    // splits every extinct register into two outcomes — the trigger FIRES on an enumerated one and is HELD
    // on a placeholder-bearing one — so at the old 1:1:1 liveness weighting each of the two would have got
    // half of the old `applied` population and P13.1's `applied > 2000` minimum would have been met by
    // LOWERING it. Weighting the liveness arm instead keeps **both** outcomes above their own minimum
    // with the minimums untouched, which is the only acceptable direction (measured at the 2:1:1
    // weighting: applied ≈ 2,600, held-by-placeholder ≈ 2,400, living-hold ≈ 5,000 of 10,000).
    //
    // ⚠ **R7-d (2026-08-11) added the fourth arm and re-weighted the first from 2 to 3 for the same
    // reason.** `LIVING_BUT_NONE_ENTITLED` is the register the widening turned around — a deceased
    // DAUGHTER root above living issue, which under `LINEAGE_CONTINUATION` + `ZUHUR_ONLY` now TRIGGERS —
    // and it belongs in the 10,000-run mirror rather than only in its own property, because a wrongly
    // widened trigger pays a charity while the family lives and I-R1 is the assertion that catches it.
    // Adding it at weight 1 against `ALL_DECEASED` at 2 would have cut that arm from 1/2 of the draw to
    // 2/5 and taken `applied` to ≈ 2,080 — a minimum met by erosion. At 3:1:1:1 `ALL_DECEASED` holds
    // exactly 1/2, every existing count is preserved, and the widened shape arrives on top with its own
    // counted minimum (`appliedWithLivingNonContinuing`). `MIXED`/`ALL_LIVING` fall from 1/4 to 1/6 each
    // and are compensated by the new arm, which is itself a *pending* register on five of its six
    // order × term pairings.
    liveness: fc.constantFrom<BloodlineLiveness>(
      'ALL_DECEASED',
      'ALL_DECEASED',
      'ALL_DECEASED',
      'MIXED',
      'ALL_LIVING',
      'LIVING_BUT_NONE_ENTITLED',
    ),
    // Both R7-D1 outcomes reached ON PURPOSE. `DRAWN` is kept as a quarter of the draw so the MIXED
    // register — enumerated dead beside a placeholder, §7.5's shape and the one a real engagement
    // produces — is generated too rather than being squeezed out by two forced extremes.
    composition: fc.constantFrom<BloodlineComposition>(
      'ENUMERATED_ONLY',
      'ENUMERATED_ONLY',
      'WITH_PLACEHOLDER',
      'DRAWN',
    ),
    order: fc.constantFrom(...MONEY_ORDERS),
    continuation: arbContinuationStipulation,
    takerWeights: fc.constantFrom<TakerWeights>('DISTINCT', 'DISTINCT', 'ONE_ZERO'),
    minTakers: fc.constantFrom(1, 2),
  })
  .chain(({ liveness, composition, order, continuation, takerWeights, minTakers }) =>
    arbReversionRunInput({
      liveness,
      composition,
      order,
      continuation: order === 'LINEAGE_CONTINUATION' ? continuation : null,
      // `ONE_ZERO` needs a second taker to be anything other than an all-zero vector.
      takerWeights,
      minTakers: takerWeights === 'ONE_ZERO' ? 2 : minTakers,
      maxTakers: 2,
    }),
  );

/**
 * A tiered ultimate taker on a ذري waqf — **`JIHA_TIERED`, reachable again (R7-f)**.
 *
 * ═══ WHY THIS GENERATOR EXISTS ═══
 * `assertJihaNotTiered` had no reachable input at all. `TABAQA_ON_CHARITABLE_WAQF` (Stage 0) answered
 * every خيري route, `CHARITABLE_JIHA_ON_FAMILY_WAQF` answered every ذري route, and `JOINT` was refused
 * outright — `WAQF_TYPES` has exactly three members, so that was exhaustive. P12 listed the refusal with
 * that reason and `jiha-tier-refusal.test.ts` drove the guard directly.
 *
 * **R7 re-opens the ذري route, and it is the *only* thing that changed.** A recorded ultimate taker now
 * passes `assertReversionLegible` (kind `CHARITABLE_JIHA`, edgeless, named), passes the narrowed
 * `COHORT_MIXES_CHARITABLE_AND_FAMILY` and `CHARITABLE_JIHA_ON_FAMILY_WAQF` (nothing unnamed), passes the
 * narrowed `LINEAGE_ORDER_ON_CHARITABLE_WAQF` jiha arm for the same reason, and is untouched by
 * `TABAQA_ON_CHARITABLE_WAQF` (خيري-only) — so a taker carrying `tabaqa: 3` reaches Stage 2 and lands on
 * `assertJihaNotTiered`, **before** `buildLineage` could answer with `LINEAGE_EDGE_ON_NON_DESCENDANT`.
 *
 * ✓ **`NA_DIRECT_USE` IS NOW INCLUDED — memo Q7, product owner 2026-08-17.** The exclusion that stood here
 * was a recorded open finding: *"On a ذري DIRECT-USE waqf the same input **computes**: I7's short-circuit
 * returns before `assertJihaNotTiered`, so the self-contradiction goes unreported. No halala moves … but the
 * deed record's contradiction is silently accepted. That is ESC-2's second reachable shape, opened by R7,
 * and it is the owner's precedence question to settle."* He settled it — **validity precedes short-circuits**
 * — so the guard moved above the short-circuit and the direct-use draw now refuses like every other. Drawing
 * it is the strongest form of the claim rather than a gap, and the separate property that drove the
 * computing case is **inverted** in `distribution.property.test.ts` rather than deleted.
 *
 * ⚠ The costs are ZEROED, and this time it is load-bearing rather than historical: `assertJihaNotTiered`
 * runs at Stage 2, **after** `computeWaterfall` (`engine.ts` line ~227), so an insolvent draw answers
 * `DISTRIBUTION_NEGATIVE` and the property would prove the money verdict under this refusal's name. The
 * same measurement that forced this on the old `JIHA_TIERED` arm — 29 of 144 draws — applies unchanged.
 */
export const arbTieredUltimateTakerCase: fc.Arbitrary<{
  readonly beneficiaries: readonly RawBeneficiary[];
  readonly reversion: RawReversion;
  readonly order: string;
  readonly continuationStipulation: ContinuationStipulation | null;
  readonly tieredTakerId: string;
  readonly tabaqa: number;
}> = fc
  .record({
    cohort: arbUltimateTakerCohort({ liveness: 'MIXED', minTakers: 1, maxTakers: 2 }),
    tieredPick: fc.nat(1_000_000),
    // 1 is included on purpose: a charity claiming to be a CHILD of the waqif is as self-contradictory
    // as one claiming to be a great-grandchild, and a generator that only drew deep tiers would leave
    // the shape an operator is most likely to typo untested.
    tabaqa: fc.integer({ min: 1, max: 4 }),
    // ✓ WIDENED TO ALL FOUR ORDERS by memo Q7 (product owner, 2026-08-17). It drew `MONEY_ORDERS` while
    // `NA_DIRECT_USE` was the one order on which this record COMPUTED (ESC-2's second shape); the guard now
    // runs above the short-circuit, so the direct-use draw is the STRONGEST form of the claim — the same
    // reasoning `arbEveryOrderForReversion` already applied to the Stage-0 reversion refusals.
    order: fc.constantFrom('LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'),
    continuation: arbContinuationStipulation,
  })
  .map(({ cohort, tieredPick, tabaqa, order, continuation }) => {
    const jihaIds = cohort
      .filter((member) => member.kind === 'CHARITABLE_JIHA')
      .map((member) => member.id)
      .sort();
    const tieredTakerId = jihaIds[tieredPick % Math.max(jihaIds.length, 1)] ?? '';
    return {
      // The deliberate un-normalisation: `toRawBeneficiary` nulls a jiha's ṭabaqa by design, and this is
      // the one place that puts it back — loudly, because the record contradicting itself is the point.
      beneficiaries: cohort.map((member) =>
        member.id === tieredTakerId ? { ...member, tabaqa } : member,
      ),
      reversion: reversionNaming(jihaIds),
      order,
      continuationStipulation: order === 'LINEAGE_CONTINUATION' ? continuation : null,
      tieredTakerId,
      tabaqa,
    };
  });

/** Which R7 refusal a generated illegible-or-unusable مآل clause is built to trigger. */
export type ReversionRefusal =
  | 'REVERSION_ON_CHARITABLE_WAQF'
  | 'REVERSION_KIND_UNRECOGNISED'
  | 'REVERSION_WITH_NO_ULTIMATE_TAKER'
  | 'REVERSION_ULTIMATE_TAKER_DUPLICATED'
  | 'REVERSION_ULTIMATE_TAKER_UNKNOWN'
  | 'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE'
  | 'REVERSION_WITH_NO_RECORDED_BLOODLINE'
  | 'ULTIMATE_TAKER_WEIGHTS_UNUSABLE';

interface ReversionRefusalCase {
  readonly input: DistributionInputRaw;
  readonly refusal: ReversionRefusal;
  readonly order: string;
}

/** All four orders — the six Stage-0 reversion refusals are unconditional on every one of them. */
const arbEveryOrderForReversion = fc.constantFrom(
  'LINEAGE_CONTINUATION',
  'ORDERED',
  'SHARED',
  'NA_DIRECT_USE',
);

/**
 * Each of R7's **eight** new refusals, generated deliberately with the discriminator it must carry.
 *
 * ═══ THE PRECEDENCE THIS ARBITRARY PROVES, not merely relies on ═══
 * `assertReversionLegible` is step 2 of `assertSingleWaqfNature` — **before** every cohort refusal — and
 * that ordering is a rule rather than an implementation detail: three cohort refusals grant an EXEMPTION
 * on the strength of the clause, and an exemption granted on an unreadable clause is how a refusal
 * becomes a payout. Every arm below therefore builds a cohort that would *otherwise* halt on a cohort
 * refusal (a jiha sitting on a ذري waqf), and requires the REVERSION discriminator instead. If the two
 * were ever reordered, these arms go red by name.
 *
 * Six of the eight are Stage 0 and are drawn across **all four orders**, including `NA_DIRECT_USE` — the
 * strongest form of the claim, since I7's short-circuit would otherwise win. The two Stage-2 arms
 * (`REVERSION_WITH_NO_RECORDED_BLOODLINE`, `ULTIMATE_TAKER_WEIGHTS_UNUSABLE`) are drawn over the three
 * money orders only: a direct-use run returns before the graph is built, so it never reaches either, and
 * including the order would generate a non-refusal that fails the property for the wrong reason.
 */
export const arbReversionRefusalCase: fc.Arbitrary<ReversionRefusalCase> = fc.oneof(
  /*
   * 1 · a reversion on a خيري waqf. Built by declaring the SAME ذري taker register `PUBLIC_CHARITABLE` —
   *     one word changed — so the arm is a control-shaped pair rather than a fresh input: the cohort would
   *     otherwise halt `TABAQA_ON_CHARITABLE_WAQF`/`DESCENDANT_ON_CHARITABLE_WAQF`, and it is exactly the
   *     precedence claim above that it does not.
   *
   * ⚠ Claude's fail-safe reading of R5, awaiting the owner — TODO(surface) in `resolver.ts`. Generated
   *     because a refusal that ships must have a generator whatever its status; if the owner reverses it,
   *     this arm inverts rather than disappearing.
   */
  arbEveryOrderForReversion.chain((order) =>
    arbReversionRunInput({ liveness: 'MIXED', order }).map(({ input }): ReversionRefusalCase => ({
      input: { ...input, waqfType: 'PUBLIC_CHARITABLE' },
      refusal: 'REVERSION_ON_CHARITABLE_WAQF',
      order,
    })),
  ),

  /* 2 · an unrecognised مآل reading. Near-misses on purpose: the vocabulary is closed AND
   *     case-significant, and a deed reverting to another waqf or to the Authority is a REAL clause this
   *     engine does not implement — it must halt by name, never be coerced into the charitable reading. */
  fc
    .tuple(
      arbEveryOrderForReversion,
      fc.oneof(
        fc.constantFrom(
          '',
          ' ',
          'charitable_ultimate_taker',
          'CHARITABLE_ULTIMATE_TAKER ',
          'ULTIMATE_TAKER',
          'NEAREST_RELATIVES',
          'ANOTHER_WAQF',
          'AUTHORITY',
          'مآل الوقف',
        ),
        fc.string(),
      ),
    )
    .chain(([order, kind]) =>
      arbReversionRunInput({ liveness: 'MIXED', order }).map(
        ({ input, jihaIds }): ReversionRefusalCase => ({
          input: {
            ...input,
            reversion: {
              kind: kind === RECOGNISED_REVERSION_KIND ? `${kind} ` : kind,
              ultimateTakerIds: [...jihaIds],
            },
          },
          refusal: 'REVERSION_KIND_UNRECOGNISED',
          order,
        }),
      ),
    ),

  /* 3 · a clause naming nobody. Deliberately NOT zod's `.min(1)`: an incomplete FOUNDER'S CONDITION must
   *     carry `SHART_INCOMPLETE`, not `DISTRIBUTION_INPUT_INVALID`. */
  arbEveryOrderForReversion.chain((order) =>
    arbReversionRunInput({ liveness: 'MIXED', order }).map(({ input }): ReversionRefusalCase => ({
      input: { ...input, reversion: reversionNaming([]) },
      refusal: 'REVERSION_WITH_NO_ULTIMATE_TAKER',
      order,
    })),
  ),

  /* 4 · a repeated id — refused, never deduplicated, because a repeat DOUBLE-COUNTS in the weight vector
   *     and therefore MOVES MONEY. Checked before the unknown-id case for exactly that reason. */
  arbEveryOrderForReversion.chain((order) =>
    arbReversionRunInput({ liveness: 'MIXED', order }).map(
      ({ input, jihaIds }): ReversionRefusalCase => ({
        input: {
          ...input,
          reversion: reversionNaming([...jihaIds, ...jihaIds.slice(0, 1)]),
        },
        refusal: 'REVERSION_ULTIMATE_TAKER_DUPLICATED',
        order,
      }),
    ),
  ),

  /* 5 · referential integrity, exactly as `LINEAGE_PARENT_UNKNOWN` treats a dangling parent edge. The id
   *     cannot collide: every generated id is `ben-###`. */
  arbEveryOrderForReversion.chain((order) =>
    arbReversionRunInput({ liveness: 'MIXED', order }).map(
      ({ input, jihaIds }): ReversionRefusalCase => ({
        input: {
          ...input,
          reversion: reversionNaming([...jihaIds, 'jiha-does-not-exist']),
        },
        refusal: 'REVERSION_ULTIMATE_TAKER_UNKNOWN',
        order,
      }),
    ),
  ),

  /*
   * 6 · ⚠ THE ARM THAT STOPS A NEW ESCAPE, not a variant of an old one: naming a DESCENDANT as the
   *     ultimate taker. Their verdict would then come from the reversion ladder instead of from their own
   *     line — entitled whenever the clause triggered, outside the frontier test altogether. The victim is
   *     a real recorded bloodline member, so the input is otherwise a perfectly ordinary ذري register.
   */
  fc.tuple(arbEveryOrderForReversion, fc.nat(1_000_000)).chain(([order, victimPick]) =>
    arbReversionRunInput({ liveness: 'MIXED', order, minBloodline: 2 }).map(
      ({ input, jihaIds, bloodlineIds }): ReversionRefusalCase => {
        const victimId = bloodlineIds[victimPick % Math.max(bloodlineIds.length, 1)] ?? '';
        return {
          input: { ...input, reversion: reversionNaming([...jihaIds, victimId]) },
          refusal: 'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
          order,
        };
      },
    ),
  ),

  /*
   * 7 · a clause over an EMPTY family register. ∅ is "not yet enrolled", not "extinct": the engine cannot
   *     certify the extinction of a family it has never been shown, and will not pay a charity because the
   *     data entry is incomplete.
   *
   * This is also the second of the two INDEPENDENT means by which the pre-R7 payload of
   * `LINEAGE_ORDER_ON_CHARITABLE_WAQF` stays closed — a jiha ALONE on a ذري waqf under the lineage order,
   * measured at 100% of the ghallah on a line stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY`. Narrowing that
   * refusal's jiha arm did not reopen it; this halt is why.
   */
  fc.constantFrom(...MONEY_ORDERS).chain((order) =>
    arbReversionRunInput({ liveness: 'ALL_DECEASED', order, withoutBloodline: true }).map(
      ({ input }): ReversionRefusalCase => ({
        input,
        refusal: 'REVERSION_WITH_NO_RECORDED_BLOODLINE',
        order,
      }),
    ),
  ),

  /*
   * 8 · the reversion TRIGGERED and every named taker's weight canonicalises to `'0'`. Refused rather
   *     than split equally (R7-e: per capita is the bloodline's rule, never a charity's) and rather than
   *     falling through to `NO_ELIGIBLE_BENEFICIARIES`, which would hide an unusable deed record behind an
   *     ordinary flag and retain the pool as though the deed were fine.
   *
   * ⚠ **`composition: 'ENUMERATED_ONLY'` is REQUIRED here, and it is R7-D1's doing rather than tidying.**
   * This refusal is only reachable on a run where the reversion actually TRIGGERS — it is a statement about
   * the weights the engine is about to divide the pool by. Over a placeholder-bearing register the trigger
   * is held, the weights are never reached, and this arm would generate an input whose refusal it cannot
   * honestly predict. Left on the default `'DRAWN'` it did exactly that about 90% of the time.
   */
  fc.constantFrom(...MONEY_ORDERS).chain((order) =>
    arbReversionRunInput({
      liveness: 'ALL_DECEASED',
      composition: 'ENUMERATED_ONLY',
      order,
      takerWeights: 'ALL_ZERO',
    }).map(({ input }): ReversionRefusalCase => ({
      input,
      refusal: 'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
      order,
    })),
  ),
);

/**
 * The `ULTIMATE_TAKER_WEIGHTS_UNUSABLE` case **paired with its control** — the same triggered register
 * with one taker weight non-zero.
 *
 * "The engine refuses an all-zero taker vector" is satisfied by an engine that refuses every reverted
 * run. The control is what tells the two apart: change one weight from `'0'` to a real figure and the
 * identical register must PAY that taker the whole distributable.
 */
export const arbUltimateTakerWeightsUnusableCase: fc.Arbitrary<{
  readonly input: DistributionInputRaw;
  readonly control: DistributionInputRaw;
  readonly controlTakerId: string;
  readonly order: string;
}> = fc.constantFrom(...MONEY_ORDERS).chain((order) =>
  arbReversionRunInput({
    liveness: 'ALL_DECEASED',
    // R7-D1 · the refusal AND its control both need the trigger to fire, so the register must be
    // enumerated. See the note on arm 8 of {@link arbReversionRefusalCase}.
    composition: 'ENUMERATED_ONLY',
    order,
    takerWeights: 'ALL_ZERO',
    minTakers: 1,
    maxTakers: 2,
  }).map(({ input, takerIds }) => {
    const controlTakerId = takerIds[0] ?? '';
    return {
      input,
      control: {
        ...input,
        beneficiaries: input.beneficiaries.map((member) =>
          member.id === controlTakerId ? { ...member, stipulatedWeight: '7' } : member,
        ),
      },
      controlTakerId,
      order,
    };
  }),
);

/* ── the refusal arbitraries: where a guaranteed halt belongs ──────────────────────────────── */

/**
 * Which "this record claims two natures" refusal a generated input is built to trigger.
 *
 * ⚠ **The name says R5; the set is now every refusal about a record contradicting itself about what
 * kind of waqf it is.** `JIHA_TIERED` (S3-D3) joined because it had no generator at all and the same
 * disease — see {@link arbTieredJihaCohort}.
 */
export type RefusedNature =
  | 'WAQF_TYPE_JOINT_NOT_SUPPORTED'
  | 'COHORT_MIXES_CHARITABLE_AND_FAMILY'
  | 'LINEAGE_ORDER_ON_CHARITABLE_WAQF'
  | 'CHARITABLE_JIHA_ON_FAMILY_WAQF'
  | 'DESCENDANT_ON_CHARITABLE_WAQF'
  /*
   * ⚠ **`JIHA_TIERED` IS BACK, AND ITS ABSENCE IS PART OF THE RECORD.** This entry read:
   *
   *   "⚠ `JIHA_TIERED` WAS HERE AND IS GONE — it is no longer PRODUCIBLE, not merely no longer wanted.
   *    `TABAQA_ON_CHARITABLE_WAQF` (product owner, 2026-08-03) generalises it along the waqf axis and is
   *    checked earlier, so the arm that used to build a tiered jiha now yields the newer discriminator."
   *
   * True of that engine, FALSE of this one. R7 makes a `CHARITABLE_JIHA` legal on a ذري waqf as its
   * recorded ultimate taker, and `TABAQA_ON_CHARITABLE_WAQF` is خيري-only — so a taker carrying a ṭabaqa
   * reaches `assertJihaNotTiered` at Stage 2 with nothing in front of it. The arm below is a NEW route,
   * not the restored old one (the old one was JOINT, then خيري); see {@link arbTieredUltimateTakerCase}.
   */
  | 'JIHA_TIERED'
  | 'TABAQA_ON_CHARITABLE_WAQF';

/**
 * An input that **must** halt with `SHART_INCOMPLETE`, paired with the discriminator it must carry.
 *
 * ADR-0009 R5's refusals, generated deliberately rather than stumbled into. Three of them used to be
 * legal — the JOINT waqf was §08's worked Example D — so a property that only asserted "the general
 * generator never produces one" would be an argument from silence. This asserts the refusal itself.
 *
 * · `WAQF_TYPE_JOINT_NOT_SUPPORTED` — `waqfType: 'JOINT'` with ANY cohort and ANY order, including a
 *   direct-use waqf and including a one-natured cohort. Every joint waqf, not only a mixed one.
 * · `COHORT_MIXES_CHARITABLE_AND_FAMILY` — the RE-ENTRY route: the same mixed cohort declared
 *   `FAMILY_DHURRI` or `PUBLIC_CHARITABLE`. Without this the refusal would be trivially evadable.
 * · `LINEAGE_ORDER_ON_CHARITABLE_WAQF` — a lineage order on a waqf with no descendants.
 * · `CHARITABLE_JIHA_ON_FAMILY_WAQF` — **added by finding R6-C1.** A jiha on a ذري waqf whose
 *   descendants are recorded as placeholders: the shape no generator could reach, and the one that
 *   paid a charity a family's whole ghallah. Drawn across all four orders, because the refusal is
 *   unconditional on the order and a generator pinned to one would leave the direct-use path — where
 *   I7's short-circuit would otherwise outrank it — unproven.
 * · `DESCENDANT_ON_CHARITABLE_WAQF` — **added by the ESC-1 audit.** The mirror of the case above: a
 *   real family tree declared `PUBLIC_CHARITABLE`. Drawn across all four orders because the refusal is
 *   unconditional on the order — including `NA_DIRECT_USE`, which is the one that proves R5 outranks
 *   I7's short-circuit.
 *   ⚠ **The ṭabaqāt are STRIPPED on this arm since 2026-08-03, and that is not cosmetic.** The tree
 *   used to arrive ṭabaqa-cross-checked, and `TABAQA_ON_CHARITABLE_WAQF` now answers exactly that
 *   record first — so leaving the ṭabaqāt on would silently retarget this arm and leave ESC-1 with no
 *   generator at all. Descent recorded WITHOUT a generation is the one shape that still reaches ESC-1,
 *   so it is the shape this arm builds. (The depth cross-check never runs here: both refusals are
 *   Stage 0, ahead of `buildLineage`.)
 * · `TABAQA_ON_CHARITABLE_WAQF` — **replaces the `JIHA_TIERED` arm (product owner, 2026-08-03).** The
 *   arm still builds {@link arbTieredJihaCohort} — a jiha carrying a ṭabaqa on a خيري waqf — because
 *   that is the shape whose refusal moved; only the discriminator it now yields is different.
 *   ⚠ Widened from `ORDERED`/`SHARED` to **all four orders**: `assertJihaNotTiered` sat at Stage 2 and
 *   was outranked by the lineage-order refusal and by I7's short-circuit, but the ṭabaqa rule is
 *   Stage 0 and outranks both — which is a stronger claim and is now generated rather than argued.
 */
export const arbRefusedNatureInput: fc.Arbitrary<{
  readonly input: DistributionInputRaw;
  readonly refusal: RefusedNature;
}> = fc
  .record({
    base: arbDistributionInput(),
    mixed: arbMixedNatureCohort,
    charitable: arbCharitableCohort,
    jihaOnFamily: arbFamilyWaqfJihaCohort,
    tieredJiha: arbTieredJihaCohort,
    // ≥ 1 member, every one carrying a lineage edge — an EMPTY cohort records no descendant and the
    // ESC-1 refusal would simply not fire, turning that arm into a generated non-refusal.
    descendants: arbLineageTreeCohort(1, 5, { vitalStatus: 'MIXED' }),
    /**
     * R7-f · the tiered ULTIMATE TAKER — `JIHA_TIERED`'s new and only reachable route. Carried as a whole
     * pre-built case (cohort + clause + order) because the arm has to set four coupled fields at once and
     * a half-set reversion would silently retarget onto a different refusal.
     */
    tieredTaker: arbTieredUltimateTakerCase,
    // ⚠ 0…5 → 0…6 when R7-f revived `JIHA_TIERED`. Widening the range REBALANCES the whole population
    // (each arm goes from 1/6 to 1/7 of draws), which is why P10's per-refusal minimums are stated
    // separately for every arm rather than as one aggregate count.
    pick: fc.integer({ min: 0, max: 6 }),
    reDeclareAsCharitable: fc.boolean(),
    jointOrder: fc.constantFrom('LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'),
    jihaOnFamilyOrder: fc.constantFrom(
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
      'NA_DIRECT_USE',
    ),
    descendantOrder: fc.constantFrom('LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'),
    // ⚠ Widened to all four orders when this arm moved from `JIHA_TIERED` (Stage 2, outranked by the
    // lineage-order refusal and by I7's short-circuit) to `TABAQA_ON_CHARITABLE_WAQF` (Stage 0, which
    // outranks both). The wider draw is the stronger claim.
    tieredJihaOrder: fc.constantFrom('LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'),
  })
  .map(
    ({
      base,
      mixed,
      charitable,
      jihaOnFamily,
      tieredJiha,
      descendants,
      tieredTaker,
      pick,
      reDeclareAsCharitable,
      jointOrder,
      jihaOnFamilyOrder,
      descendantOrder,
      tieredJihaOrder,
    }) => {
      if (pick === 0) {
        return {
          input: {
            ...base,
            waqfType: 'JOINT' as const,
            entitlementOrder: jointOrder,
            // Stated so the halt cannot be the stipulation's rather than the type's.
            continuationStipulation:
              jointOrder === 'LINEAGE_CONTINUATION' ? ('ZUHUR_ONLY' as const) : null,
          },
          refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' as const,
        };
      }
      if (pick === 1) {
        return {
          input: {
            ...base,
            // NOT 'JOINT': the whole point is that the mixed cohort is refused under a LEGAL type.
            waqfType: reDeclareAsCharitable
              ? ('PUBLIC_CHARITABLE' as const)
              : ('FAMILY_DHURRI' as const),
            // Neither ORDERED nor SHARED can be the cause here — both are legal orders.
            entitlementOrder: 'SHARED',
            continuationStipulation: null,
            beneficiaries: [...mixed],
          },
          refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY' as const,
        };
      }
      if (pick === 2) {
        return {
          input: {
            ...base,
            waqfType: 'PUBLIC_CHARITABLE' as const,
            entitlementOrder: 'LINEAGE_CONTINUATION',
            continuationStipulation: 'ZUHUR_ONLY' as const,
            // Charitable ONLY — a mixed cohort would be refused first, for a different reason.
            beneficiaries: [...charitable],
          },
          refusal: 'LINEAGE_ORDER_ON_CHARITABLE_WAQF' as const,
        };
      }
      if (pick === 3) {
        return {
          input: {
            ...base,
            // The DECLARED type is the whole subject: this cohort holds no `FAMILY` member, so the
            // mixed-cohort refusal cannot see it, and on `PUBLIC_CHARITABLE` it would be a legal
            // charitable waqf. Only the declaration makes it a contradiction.
            waqfType: 'FAMILY_DHURRI' as const,
            entitlementOrder: jihaOnFamilyOrder,
            // Stated on the lineage order so the halt cannot be the stipulation's rather than the
            // cohort's — the same discipline as the JOINT case above.
            continuationStipulation:
              jihaOnFamilyOrder === 'LINEAGE_CONTINUATION' ? ('ZUHUR_ONLY' as const) : null,
            beneficiaries: [...jihaOnFamily],
          },
          refusal: 'CHARITABLE_JIHA_ON_FAMILY_WAQF' as const,
        };
      }
      if (pick === 4) {
        return {
          input: {
            ...base,
            // The DECLARED type again, read from the other end. This cohort holds no jiha, so neither
            // the mixed-cohort check nor `CHARITABLE_JIHA_ON_FAMILY_WAQF` can see it; on
            // `FAMILY_DHURRI` it is an entirely ordinary ancestral register (that is the CONTROL, in
            // `arbDescendantOnCharitableWaqfCase`). Only the خيري declaration makes it a contradiction.
            waqfType: 'PUBLIC_CHARITABLE' as const,
            entitlementOrder: descendantOrder,
            continuationStipulation:
              descendantOrder === 'LINEAGE_CONTINUATION' ? ('ZUHUR_ONLY' as const) : null,
            // ⚠ ṭabaqāt STRIPPED — see the header. `TABAQA_ON_CHARITABLE_WAQF` is checked before
            // ESC-1, so a tree that kept its generations would retarget this arm and leave ESC-1
            // ungenerated. The `lineageLink` — the recorded claim of descent ESC-1 is actually keyed
            // on — is untouched, which is what makes this still the ESC-1 shape.
            beneficiaries: descendants.map((member) => ({ ...member, tabaqa: null })),
          },
          refusal: 'DESCENDANT_ON_CHARITABLE_WAQF' as const,
        };
      }
      if (pick === 5) {
        /*
         * R7-f · a TIERED ULTIMATE TAKER on a ذري waqf — `JIHA_TIERED`'s new route.
         *
         * Every Stage-0 check is passed on purpose, and each for a reason worth naming: the clause is
         * legible and names every jiha (so the three narrowed cohort refusals grant their exemption), the
         * waqf is ذري (so `TABAQA_ON_CHARITABLE_WAQF` — which is خيري-only — cannot pre-empt it), and the
         * taker carries no lineage edge (so `buildLineage`'s pass 3 cannot answer first either). What is
         * left is `assertJihaNotTiered`, at Stage 2, which is the guard this arm exists to reach.
         *
         * ⚠ Costs zeroed: the guard runs AFTER `computeWaterfall`, so an insolvent draw answers
         * `DISTRIBUTION_NEGATIVE` and this arm would prove the money verdict under the refusal's name.
         * ✓ `NA_DIRECT_USE` is now **included** by {@link arbTieredUltimateTakerCase} (memo Q7) — the
         * exclusion existed only while that route computed instead of refusing.
         */
        return {
          input: {
            ...base,
            waqfType: 'FAMILY_DHURRI' as const,
            entitlementOrder: tieredTaker.order,
            continuationStipulation: tieredTaker.continuationStipulation,
            beneficiaries: [...tieredTaker.beneficiaries],
            reversion: tieredTaker.reversion,
            operatingCostMinor: 0n,
            maintenance: { kind: 'NONE' as const },
            nazirFee: null,
          },
          refusal: 'JIHA_TIERED' as const,
        };
      }
      return {
        input: {
          ...base,
          // خيري, so `CHARITABLE_JIHA_ON_FAMILY_WAQF` cannot pre-empt this. ⚠ Drawn across ALL FOUR
          // orders now: this arm used to name `JIHA_TIERED`, which sat at Stage 2 and lost to the
          // lineage-order refusal and to I7's short-circuit; `TABAQA_ON_CHARITABLE_WAQF` is Stage 0
          // and beats both, so the wider draw is a stronger claim rather than a looser one.
          waqfType: 'PUBLIC_CHARITABLE' as const,
          entitlementOrder: tieredJihaOrder,
          continuationStipulation:
            tieredJihaOrder === 'LINEAGE_CONTINUATION' ? ('ZUHUR_ONLY' as const) : null,
          beneficiaries: [...tieredJiha],
          /*
           * ⚠ THE COSTS ARE ZEROED, AND THAT WAS A MEASURED NECESSITY WHEN THIS ARM NAMED
           * `JIHA_TIERED` — KEPT, AND THE REASON IT IS NO LONGER LOAD-BEARING RECORDED.
           *
           * `assertJihaNotTiered` ran at **Stage 2**, AFTER the waterfall. MEASURED on the undamped
           * base: 29 of 144 draws threw `DISTRIBUTION_NEGATIVE` before the deed contradiction was ever
           * looked at — *the money verdict outranked the tiered-jiha verdict*, where for an unreadable
           * ORDER it is the other way round (`P10`: "the deed-illegibility verdict outranks the money
           * verdict").
           *
           * `TABAQA_ON_CHARITABLE_WAQF` is raised in `assertSingleWaqfNature` at **Stage 0**, so it
           * outranks `DISTRIBUTION_NEGATIVE` and the zeroing is no longer needed for this arm to prove
           * its refusal. It is kept so the draw space is unchanged from the measurement above — one
           * variable at a time — and so a future move of the check back to Stage 2 shows up as a
           * failure here rather than as a quietly different generated population.
           */
          operatingCostMinor: 0n,
          maintenance: { kind: 'NONE' as const },
          nazirFee: null,
        },
        refusal: 'TABAQA_ON_CHARITABLE_WAQF' as const,
      };
    },
  );

/** The four recognised orders, as a draw. R6-D1's refusal is unconditional on every one of them. */
const arbEveryEntitlementOrder = fc.constantFrom(
  'LINEAGE_CONTINUATION',
  'ORDERED',
  'SHARED',
  'NA_DIRECT_USE',
);

/**
 * The R6-D1 case **paired with its control**: the same ancestral register, minus the charity.
 *
 * `input` holds a `CHARITABLE_JIHA` on a `FAMILY_DHURRI` waqf and must halt
 * `CHARITABLE_JIHA_ON_FAMILY_WAQF`. `control` is byte-for-byte the same run with the jiha(s) dropped
 * and **must COMPUTE** — the money side is guaranteed positive by {@link arbLiveRunInput}, so a
 * control that refuses is a real regression and not a thin generated pool.
 *
 * ═══ WHY THE PAIR, AND NOT JUST THE REFUSAL ═══
 * "The engine refuses this input" is satisfied by an engine that refuses everything nearby. The
 * refusal being asserted is narrow — *a charity may not be a beneficiary of an ancestral waqf
 * **unless the deed names it as the endowment's ultimate taker**, which since R7 is the whole content
 * of the refusal; this arbitrary inherits `reversion: null` from {@link arbLiveRunInput} (coupling 9)
 * and so only ever builds the unnamed case* — and
 * the family waqf recording its not-yet-enumerated generation as `CATEGORY_ONLY` placeholders is a
 * **legitimate** register that must keep working. The hand-built inversion carries the same control
 * for the same reason (`r6-adversarial.test.ts`: the jiha-free register pays the living descendant the
 * 13,750,000 halalas the defect diverted). This is that control at generated scale.
 *
 * ⚠ `waqfType` is FORCED to `FAMILY_DHURRI` after {@link arbLiveRunInput} has built the run.
 * `arbLiveRunInput` reads the type off the cohort's nature and would type any jiha-bearing cohort
 * `PUBLIC_CHARITABLE` — which is exactly the exhaustive two-branch typing that made this shape
 * unreachable (finding R6-C1). The override is the one deliberate exception, and it is what the
 * refusal is about: the DECLARED type, which neither neighbouring refusal can see.
 */
export const arbCharitableJihaOnFamilyWaqfCase: fc.Arbitrary<{
  readonly input: DistributionInputRaw;
  readonly control: DistributionInputRaw;
  readonly order: string;
}> = arbEveryEntitlementOrder.chain((order) =>
  arbLiveRunInput(
    arbFamilyWaqfJihaCohort,
    order,
    order === 'LINEAGE_CONTINUATION' ? 'ZUHUR_ONLY' : null,
  ).map((built) => {
    const input: DistributionInputRaw = { ...built, waqfType: 'FAMILY_DHURRI' };
    return {
      input,
      control: { ...input, beneficiaries: [...withoutCharitableJihas(input.beneficiaries)] },
      order,
    };
  }),
);

/**
 * The **ESC-1 case paired with its control**: the identical ancestral register, declared the other way.
 *
 * `input` is a well-formed family tree — real parent edges, ṭabaqāt cross-checked, mixed vital status,
 * no charitable jiha anywhere — sitting on a waqf **declared `PUBLIC_CHARITABLE`**, and it must halt.
 * `control` is the SAME input with one field changed, `waqfType: 'FAMILY_DHURRI'`, and it must
 * **COMPUTE AND PAY**.
 *
 * ⚠ **The discriminator it halts on moved on 2026-08-03, from `DESCENDANT_ON_CHARITABLE_WAQF` to
 * `TABAQA_ON_CHARITABLE_WAQF`, and the pair was deliberately NOT re-shaped to preserve the old one.**
 * The tree arrives ṭabaqa-cross-checked because it has to — a ذري control with no ṭabaqāt halts
 * `TABAQA_MISMATCHES_LINEAGE_DEPTH` — so stripping them to chase ESC-1 would have destroyed the very
 * thing this generator exists for: two byte-identical registers differing in one word. ESC-1's own
 * generator therefore lives in {@link arbCharitablePlaceholderCase} (the 2 × 2) and in
 * {@link arbRefusedNatureInput}'s ṭabaqa-stripped arm, where a control is not required.
 *
 * ═══ WHY THE CONTROL IS THE DECLARATION AND NOT THE RECORDS ═══
 * The obvious control — strip the lineage edges — is not available: R6 then refuses the same cohort
 * with `LINEAGE_LINK_MISSING`, so "refused either way" would prove nothing about ESC-1 (that pair is a
 * finding in its own right and is generated by {@link arbCharitablePlaceholderCase}). Flipping the
 * DECLARED TYPE isolates exactly the fact the refusal is about: one word of the deed record, with every
 * beneficiary byte-identical. A refusal that survived the flip would be refusing ancestral registers in
 * general — a denial of service — and this pair is what tells the two apart.
 *
 * `NA_DIRECT_USE` is drawn too. On the refusal side it is the strongest case in the set: Stage 0 runs
 * BEFORE I7's short-circuit, so it proves R5 outranks direct use. On the control side a direct-use run
 * legitimately emits no line, so the "and pays" half of the claim is asserted only on the three orders
 * that resolve a cohort — stated here so the exemption is visible rather than discovered.
 */
export const arbDescendantOnCharitableWaqfCase: fc.Arbitrary<{
  readonly input: DistributionInputRaw;
  readonly control: DistributionInputRaw;
  readonly order: string;
}> = arbEveryEntitlementOrder.chain((order) =>
  arbLiveRunInput(
    arbLineageTreeCohort(1, 6, { vitalStatus: 'MIXED' }),
    order,
    order === 'LINEAGE_CONTINUATION' ? 'ZUHUR_AND_BUTUN' : null,
  ).map((built) => ({
    // `arbLiveRunInput` reads the type off the cohort's nature and types this one `FAMILY_DHURRI`;
    // the override IS the malformation, and it is the only difference between the two runs.
    input: { ...built, waqfType: 'PUBLIC_CHARITABLE' as const },
    control: built,
    order,
  })),
);

/** Which lineage-graph malformation a generated input carries. */
export type LineageMalformation =
  | 'LINEAGE_LINK_UNRECOGNISED'
  | 'LINEAGE_PARENT_UNKNOWN'
  | 'LINEAGE_CYCLE'
  | 'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF'
  | 'LINEAGE_LINK_MISSING'
  | 'LINEAGE_EDGE_ON_NON_DESCENDANT'
  | 'TABAQA_MISMATCHES_LINEAGE_DEPTH'
  | 'CONTINUATION_STIPULATION_UNRECOGNISED';

/**
 * Which entry point still reaches a generated malformation's refusal.
 *
 * ⚠ **`'BUILD_LINEAGE_ONLY'` is a FINDING, not a convenience.** Every malformation used to be
 * reachable through `runDistribution`; ESC-1 made one of them unreachable that way, and a property
 * that quietly kept asserting through the engine would have started proving a DIFFERENT refusal under
 * the same name. The route is therefore carried as data and the property dispatches on it, so the fact
 * is visible in the coverage census instead of buried in a passing assertion.
 */
export type MalformationRoute = 'ENGINE' | 'BUILD_LINEAGE_ONLY';

/**
 * A well-formed lineage input with **exactly one** malformation injected, and the refusal it owes.
 *
 * Every one of these is a way a real seed mapper or a mis-transcribed deed could break the family
 * tree, and each must halt rather than be repaired: an engine that "fixed" a dangling `parentId` by
 * treating the member as a child of the waqif would silently promote them a generation and change
 * every other beneficiary's per-capita share.
 *
 * The base is always a ≥ 2-member tree so there is a parent to dangle from and a chain to break.
 *
 * Each case also carries the {@link MalformationRoute} that still reaches it. Seven of the eight are
 * `'ENGINE'`; `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` is `'BUILD_LINEAGE_ONLY'` — see its case below.
 */
export const arbMalformedLineageInput: fc.Arbitrary<{
  readonly input: DistributionInputRaw;
  readonly refusal: LineageMalformation;
  readonly route: MalformationRoute;
}> = fc
  .record({
    base: arbLineageRunInput('ZUHUR_ONLY', { minSize: 3, maxSize: 8 }),
    // ⚠ 0…7 → 0…8 (R7). Case 7 is NEW: `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` is reachable through
    // `runDistribution` again, because R7 gives the orphaned subtree a legal host on a **ذري** waqf.
    pick: fc.integer({ min: 0, max: 8 }),
    victimPick: fc.nat(1_000_000),
    badLink: fc.constantFrom('son', 'SON ', ' SON', 'Son', 'ZUHUR', '', 'ابن'),
    badStipulation: fc.constantFrom('zuhur_only', 'ZUHUR_ONLY ', '', 'ZUHUR', 'ظهور فقط'),
    tabaqaDelta: fc.constantFrom(1, 2, -1),
    /**
     * R6 requires the lineage link on **every** order, not only the lineage one — so the
     * link-missing case is driven on `ORDERED` and `SHARED` too (finding R6-C1: this arbitrary's base
     * is always `LINEAGE_CONTINUATION`, so the wider claim had no generator).
     *
     * ⚠ `NA_DIRECT_USE` is deliberately absent, and MEASURED: an edgeless `FAMILY` member on a
     * direct-use waqf **computes**, because I7's short-circuit returns before the lineage pass. That
     * is correct — a direct-use waqf resolves no cohort at all — but it means including the order
     * here would generate a non-refusal and the property would fail for the wrong reason.
     */
    linkMissingOrder: fc.constantFrom('LINEAGE_CONTINUATION', 'ORDERED', 'SHARED'),
    /**
     * Whether the edge-on-a-non-descendant case uses its **headline** shape — a lineage edge on a
     * `CHARITABLE_JIHA` — or the parentless-edge shape on a family member.
     *
     * The ADR names the jiha first ("a jiha; a parentless edge") and it had no generator: a jiha
     * cannot sit beside a `FAMILY` member (R5 refuses earlier), so producing it needs the whole cohort
     * re-cast as خيري, which nothing did.
     *
     * ⚠ **The jiha shape had to change from a `lineageLink` to a `parentId`, and that is a finding.**
     * MEASURED: a `CHARITABLE_JIHA` carrying `lineageLink: 'SON'` never reaches `buildLineage` any
     * more — on خيري, ESC-1's `DESCENDANT_ON_CHARITABLE_WAQF` sees the link at Stage 0 and refuses
     * first (the check is `lineageLink !== null` over the WHOLE cohort and does not exempt a jiha); on
     * ذري, `CHARITABLE_JIHA_ON_FAMILY_WAQF` refuses first. A jiha carrying only a `parentId` is
     * invisible to both — it records no descent claim — and still hits `buildLineage`'s pass 2, so the
     * refusal keeps a generator and the case keeps proving its own name.
     */
    edgeOnJiha: fc.boolean(),
  })
  .map(
    ({
      base,
      pick,
      victimPick,
      badLink,
      badStipulation,
      tabaqaDelta,
      linkMissingOrder,
      edgeOnJiha,
    }) => {
      const members = base.beneficiaries;
      const victimIndex = victimPick % members.length;
      const victim = members[victimIndex];
      // `members` has ≥ 3 entries by construction, so this is a total function; the fallback keeps the
      // mapper honest rather than asserting non-null.
      if (victim === undefined) {
        return {
          input: base,
          refusal: 'LINEAGE_LINK_MISSING' as const,
          route: 'ENGINE' as const,
        };
      }

      const replace = (patch: Partial<RawBeneficiary>): DistributionInputRaw => ({
        ...base,
        beneficiaries: members.map((member, index) =>
          index === victimIndex ? { ...member, ...patch } : member,
        ),
      });

      switch (pick) {
        case 0:
          return {
            input: replace({ lineageLink: badLink }),
            refusal: 'LINEAGE_LINK_UNRECOGNISED' as const,
            route: 'ENGINE' as const,
          };
        case 1:
          return {
            // An id no member holds. The generator mints `ben-###`, so this cannot collide.
            input: replace({ parentId: 'ben-does-not-exist' }),
            refusal: 'LINEAGE_PARENT_UNKNOWN' as const,
            route: 'ENGINE' as const,
          };
        case 2:
          // The 1-cycle: a member is its own parent.
          return {
            input: replace({ parentId: victim.id }),
            refusal: 'LINEAGE_CYCLE' as const,
            route: 'ENGINE' as const,
          };
        case 3: {
          /*
           * Hang the victim's subtree off a member that is legitimately NOT in the graph, so no
           * eligibility path to the waqif exists.
           *
           * ⚠ **FINDING, NARROWED TWICE. `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` is now reachable only on a
           * `PUBLIC_CHARITABLE` cohort.**
           *
           * ADR-0009 already made it unreachable under `LINEAGE_CONTINUATION`: to host an orphaned
           * subtree a member must be in the cohort but out of the graph, and a lineage order refuses an
           * edgeless `FAMILY`/`CATEGORY_ONLY` member (`LINEAGE_LINK_MISSING`) in the per-beneficiary pass,
           * which runs BEFORE the ancestor walk. This case was therefore built on `SHARED`, where an
           * edgeless family member was still legal.
           *
           * **R6 (2026-08-03) removed that last host.** The link is now required on every order, so an
           * edgeless FAMILY member is refused on `SHARED` too and the S3 spelling of this case
           * (`{ lineageLink: null, parentId: null, tabaqa: null }` on a family member) produces
           * `LINEAGE_LINK_MISSING` instead — a generator that would have gone on "passing" while proving
           * a different refusal than the one it names.
           *
           * The only kind that may legally sit outside the tree is a `CHARITABLE_JIHA`, and a jiha beside
           * a `FAMILY` member is refused earlier still (`COHORT_MIXES_CHARITABLE_AND_FAMILY`, R5). So the
           * whole cohort is re-cast: the host becomes the jiha and every other member a `CATEGORY_ONLY`
           * placeholder — a legal خيري cohort — on a `PUBLIC_CHARITABLE` waqf under `SHARED`. The parent
           * edges are carried over unchanged, so the subtree the walk refuses is the generated one.
           *
           * ⚠⚠ **NARROWED A THIRD TIME, AND OUT OF THE ENGINE ALTOGETHER — `route:
           * 'BUILD_LINEAGE_ONLY'`.** ESC-1 refuses any beneficiary carrying a `lineageLink` on a خيري
           * waqf, and the orphaned subtree's members necessarily carry one (graph membership IS the
           * link). MEASURED on exactly the input this case builds: through `resolveEntitlement` it now
           * halts `DESCENDANT_ON_CHARITABLE_WAQF` at Stage 0; through `buildLineage` — which does not
           * run Stage 0 — it still halts `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` as designed.
           *
           * **So the refusal is unreachable through `runDistribution`.** There is no legal host left:
           * an edgeless `FAMILY`/`CATEGORY_ONLY` member is refused by pass 4 before the walk, and the
           * jiha — the only kind allowed outside the graph — can only stand on a waqf whose other
           * members may not be in the graph at all. The case is kept and re-pointed at `buildLineage`
           * rather than deleted: the guard is live code, it is exported and separately testable, and
           * deleting its only generator is how a dead refusal becomes invisible. The property dispatches
           * on `route` and the census counts it, so the narrowing is a reported fact.
           */
          const hostIndex = (victimIndex + 1) % members.length;
          const host = members[hostIndex];
          if (host === undefined) {
            return {
              input: base,
              refusal: 'LINEAGE_LINK_MISSING' as const,
              route: 'ENGINE' as const,
            };
          }
          return {
            input: {
              ...base,
              waqfType: 'PUBLIC_CHARITABLE',
              entitlementOrder: 'SHARED',
              continuationStipulation: null,
              beneficiaries: members.map((member, index) => {
                if (index === hostIndex) {
                  return {
                    ...member,
                    kind: 'CHARITABLE_JIHA' as const,
                    line: 'NA' as const,
                    category: null,
                    lineageLink: null,
                    parentId: null,
                    tabaqa: null,
                  };
                }
                const asPlaceholder = {
                  ...member,
                  kind: 'CATEGORY_ONLY' as const,
                  category: 'unnamed segment (fictional)',
                };
                return index === victimIndex
                  ? { ...asPlaceholder, parentId: host.id }
                  : asPlaceholder;
              }),
            },
            refusal: 'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF' as const,
            route: 'BUILD_LINEAGE_ONLY' as const,
          };
        }
        case 4: {
          // The fiqh fact the eligibility test needs, absent — and NOT only under a lineage order:
          // R6 requires the link on ORDERED and SHARED too, and until R6-C1 nothing generated that.
          const stripped = replace({ lineageLink: null, parentId: null, tabaqa: null });
          return {
            input:
              linkMissingOrder === 'LINEAGE_CONTINUATION'
                ? stripped
                : {
                    ...stripped,
                    entitlementOrder: linkMissingOrder,
                    // The order does not consume one; carrying it would only add a NOT_APPLIED flag to
                    // a run that halts before flags are folded, but stating null keeps the input honest.
                    continuationStipulation: null,
                  },
            refusal: 'LINEAGE_LINK_MISSING' as const,
            route: 'ENGINE' as const,
          };
        }
        case 5: {
          if (edgeOnJiha) {
            /*
             * The ADR's headline shape, **as it is still reachable**: an edge on a **charity**, which
             * cannot be a descendant of the waqif at all.
             *
             * The whole cohort is replaced by a two-jiha خيري register — NOT re-cast as
             * `CATEGORY_ONLY` placeholders, which ESC-1 now refuses on a خيري waqf before the graph is
             * ever built (see {@link arbCharitableCohort}). The second jiha carries `parentId` pointing
             * at the first and **no `lineageLink`**: a link would be a recorded descent claim and ESC-1
             * would see it at Stage 0, so the case would prove `DESCENDANT_ON_CHARITABLE_WAQF` under the
             * name of a different refusal. MEASURED both ways — link ⇒ `DESCENDANT_ON_CHARITABLE_WAQF`,
             * parent-only ⇒ `LINEAGE_EDGE_ON_NON_DESCENDANT`.
             *
             * `SHARED` on a `PUBLIC_CHARITABLE` waqf, all measured: a lineage order refuses earlier
             * (`LINEAGE_ORDER_ON_CHARITABLE_WAQF`), `NA_DIRECT_USE` computes (I7), and `FAMILY_DHURRI`
             * refuses first (`CHARITABLE_JIHA_ON_FAMILY_WAQF`).
             */
            const template = members[0];
            if (template === undefined) {
              return {
                input: base,
                refusal: 'LINEAGE_LINK_MISSING' as const,
                route: 'ENGINE' as const,
              };
            }
            const asJiha = (id: string, parentId: string | null): RawBeneficiary => ({
              ...template,
              id,
              kind: 'CHARITABLE_JIHA' as const,
              active: true,
              line: 'NA' as const,
              category: null,
              tabaqa: null,
              parentId,
              lineageLink: null,
              stipulatedWeight: '1',
            });
            return {
              input: {
                ...base,
                waqfType: 'PUBLIC_CHARITABLE',
                entitlementOrder: 'SHARED',
                continuationStipulation: null,
                beneficiaries: [
                  asJiha('ben-jiha-host', null),
                  // The malformation: a parent edge recorded against something with no descent.
                  asJiha('ben-jiha-child', 'ben-jiha-host'),
                ],
              },
              refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT' as const,
              route: 'ENGINE' as const,
            };
          }
          // A parent edge on a member recorded as no descendant at all.
          return {
            input: replace({
              lineageLink: null,
              tabaqa: null,
              parentId: members[0]?.id ?? 'ben-000',
            }),
            refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT' as const,
            route: 'ENGINE' as const,
          };
        }
        case 6: {
          const supplied = victim.tabaqa ?? 1;
          // Never 0 or negative: the schema refuses those at the door with DISTRIBUTION_INPUT_INVALID,
          // which is a different (and correct) error, and would make this case prove the wrong thing.
          const shifted = Math.max(1, supplied + tabaqaDelta);
          return {
            input: replace({ tabaqa: shifted === supplied ? supplied + 1 : shifted }),
            refusal: 'TABAQA_MISMATCHES_LINEAGE_DEPTH' as const,
            route: 'ENGINE' as const,
          };
        }
        case 7: {
          /*
           * ⚠⚠ **CASE 7 IS A FINDING OF THE R7 AUDIT: `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF` IS REACHABLE
           * THROUGH `runDistribution` AGAIN, AND CASE 3'S `'BUILD_LINEAGE_ONLY'` REASONING IS NOW FALSE
           * AS A GENERAL CLAIM.**
           *
           * Case 3's argument, quoted from its own comment, was: *"The only kind that may legally sit
           * outside the tree is a `CHARITABLE_JIHA`, and a jiha … can only stand on a waqf whose other
           * members may not be in the graph at all."* Every step held — **until R7 gave a jiha a legal
           * seat on a ذري waqf**, as the deed's recorded ultimate taker (مآل الوقف). On that waqf the
           * other members not only MAY be in the graph, they MUST be (R6), so the orphaned subtree finally
           * has a host that ESC-1 does not refuse.
           *
           * The shape, and every check it walks past on the way to the guard:
           *
           *  · a legible clause naming the jiha ⇒ the three narrowed cohort refusals grant their exemption
           *    (`COHORT_MIXES_CHARITABLE_AND_FAMILY`, `CHARITABLE_JIHA_ON_FAMILY_WAQF`, and the jiha arm of
           *    `LINEAGE_ORDER_ON_CHARITABLE_WAQF` — which matters, since the base is a lineage run);
           *  · ذري ⇒ `TABAQA_ON_CHARITABLE_WAQF` and `DESCENDANT_ON_CHARITABLE_WAQF` are both خيري-only;
           *  · the taker carries NO lineage edge ⇒ `buildLineage` pass 3 has nothing to refuse, and pass 2
           *    does not fire on the victim either (the victim keeps its `lineageLink`);
           *  · the victim's `parentId` points AT the taker ⇒ the ancestor walk terminates at a member with
           *    no `lineageLink`, which is precisely `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF`.
           *
           * The ṭabaqa cross-check cannot pre-empt it: that loop runs after the walk loop, so the walk
           * throws first — which is why the victim's now-wrong declared ṭabaqa is left alone here.
           *
           * Case 3 is KEPT unchanged, `route: 'BUILD_LINEAGE_ONLY'`, because its own خيري shape really is
           * still unreachable through the engine. Two routes to one refusal, each with its own reason, is
           * the honest record — and P12's exemption entry for this refusal is now GONE.
           */
          const taker: RawBeneficiary = {
            id: 'zz-ultimate-taker',
            kind: 'CHARITABLE_JIHA',
            active: true,
            tabaqa: null,
            parentId: null,
            lineageLink: null,
            line: 'NA',
            branch: 'Charitable (invented)',
            stipulatedWeight: '1',
            verificationStatus: 'VERIFIED',
            kycLastRefreshed: null,
            category: null,
            residency: 'DOMESTIC',
            disbursingEntity: null,
            bankingRefForProceeds: null,
          };
          return {
            input: {
              ...base,
              reversion: reversionNaming([taker.id]),
              beneficiaries: [
                ...members.map((member, index) =>
                  // The malformation: a recorded descendant whose line terminates at the charity.
                  index === victimIndex ? { ...member, parentId: taker.id } : member,
                ),
                taker,
              ],
            },
            refusal: 'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF' as const,
            route: 'ENGINE' as const,
          };
        }
        default:
          return {
            input: { ...base, continuationStipulation: badStipulation },
            refusal: 'CONTINUATION_STIPULATION_UNRECOGNISED' as const,
            route: 'ENGINE' as const,
          };
      }
    },
  );
