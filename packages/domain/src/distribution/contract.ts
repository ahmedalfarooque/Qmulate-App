/**
 * `distribution/contract.ts` — the distribution engine's input/output contract (PRD §08).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUR RULES THIS FILE MAKES STRUCTURAL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. **Money is integer halalas as `bigint`.** `Minor` is a branded bigint; 1 SAR = 100n. Every
 *    monetary field in and out of the engine is `Minor`. `Decimal`↔minor conversion happens ONLY
 *    through the boundary helpers below, which delegate to the tested money engine (`../money.js`).
 *    No JS `number` is money, and — a change from §08's sketch — no JS `number` is a *weight* or a
 *    *rate* either, because both multiply money (see WEIGHTS AND RATES below).
 * 2. **Corpus (asl / أصل) cannot enter the waterfall.** `revenue` carries receipt-level
 *    provenance, not a bare total: the caller must show the classified receipts that add up to the
 *    income it wants distributed. A caller with no breakdown is REFUSED, never trusted
 *    (`RECEIPT_UNCLASSIFIED`); value with no INCOME provenance is refused as
 *    `CORPUS_NOT_DISTRIBUTABLE`. (S3 decision D1 — the E6 half of handover row 10. The DB-level
 *    immutability of the classification stays with E5/S6.) CLAUDE.md binding rule 1.
 * 3. **No regulatory figure has a coded default.** `policy` has no zod `.default()` anywhere: the
 *    caller resolves each figure from a `Setting` and hands it in, or the engine refuses. §08's
 *    sketch defaulted `kycRefreshMonths` to `12` and `roundingUnitMinor` to `1n`; both are removed
 *    — a defaulted statutory window is exactly what `../settings.ts` exists to prevent
 *    (binding rule 3). The ⚠ marker travels with the run in `unverifiedNotes`.
 * 4. **The engine never guesses the Shart.** `entitlementOrder` is a **`z.string()`, not a zod
 *    enum**, on purpose: an unrecognised value must reach the resolver as data and halt with
 *    `SHART_INCOMPLETE` (§08 "Malformed shart"), not die as a shape error. The same applies to
 *    `receiptClass` (see {@link receiptInputSchema}) and — added by ADR-0009 — to the two lineage
 *    fields the founder's conditions are now read through: `continuationStipulation` (waqf level)
 *    and `beneficiaries[].lineageLink` (per person). R7 adds a third: {@link reversionInputSchema}'s
 *    `kind`, the deed's مآل clause. A mis-transcribed deed fact must halt with
 *    `SHART_INCOMPLETE` carrying the refusal that names it, not with a zod shape error carrying
 *    `DISTRIBUTION_INPUT_INVALID`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ENTITLEMENT IS LINEAGE-BASED, PER CAPITA, AND A JOINT WAQF IS REFUSED (ADR-0009)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Product-owner decisions of 2026-08-02/03, taken by a practising Nazir. They change what this
 * contract has to be able to *say*, which is why they land here and not only in `./resolver.ts`:
 *
 *  · **R1/R2 — a beneficiary is entitled because they descend from the waqif on a line the deed
 *    continues, not because their ṭabaqa is the lowest living one.** So the input carries a real
 *    lineage edge ({@link beneficiaryInputSchema}'s `parentId` + `lineageLink`) and a waqf-level
 *    continuation stipulation ({@link CONTINUATION_STIPULATIONS}). `tabaqa` survives as a
 *    **derived, cross-checked** mirror of graph depth, not as an input the engine trusts.
 *  · **R3 — the arithmetic is per capita.** On a lineage cohort a family beneficiary's deed
 *    `stipulatedWeight` is NOT applied; the resolver publishes an effective weight of `'1'` per
 *    head. The deed figure is preserved on `source.stipulatedWeight`, named in the trace, and the
 *    run raises `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` — a Shart figure that vanishes without
 *    trace is the defect class this project keeps paying for.
 *  · **R4 — lineage is the NORMAL deed shape; `ORDERED` (al-aʿlā fa-l-aʿlā) is the explicitly
 *    stipulated exception.** Both paths exist as first-class {@link ENTITLEMENT_ORDERS} values, so
 *    `basis.rule` can always name which one decided a beneficiary's entitlement — that string is
 *    printed on their official Arabic statement (BR-505).
 *  · **R5 — a JOINT waqf is refused.** `waqfType: 'JOINT'`, and any cohort mixing a
 *    `CHARITABLE_JIHA` with a `FAMILY` member, halt with `SHART_INCOMPLETE` at Stage 0. **The
 *    `JOINT` member stays in {@link WAQF_TYPES} and in `schema.prisma`** — the engine refuses the
 *    *value*, it does not narrow the *vocabulary*, because `docs/domain/regulations/awqaf-law.md`
 *    Art. 4 and `docs/domain/glossary.md`'s الوقف المشترك both say a joint endowment exists. That
 *    contradiction is a recorded open item for Saudi counsel, not something a code change resolves
 *    (CLAUDE.md binding rule 4 + the "known vault/spec inconsistencies" discipline).
 *
 * Where these rules are silent the engine **refuses** — see {@link SHART_REFUSALS} for the closed
 * list of discriminators every such halt carries.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف — A ذري DEED MAY NAME A CHARITY AS ITS ULTIMATE TAKER (product owner, 2026-08-10)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Asked whether a وقف ذري may name a charity, the owner answered: yes, as the **ultimate taker**
 * (مآل الوقف) — *"a waqf ذري may eventually (according to the regulatory mandate) end up at a charity
 * once ALL descendants are dead and the bloodline is over."* The charity receives **nothing while any
 * eligible descendant lives**, and takes the distributable once the bloodline is over.
 *
 * ⚠ **AND "OVER" MEANS NO CONTINUING LINE (R7-d, product owner 2026-08-11).** Asked directly whether it
 * means *no living descendant* or *no continuing line*, the owner answered the second. A line continues
 * through the descendants the deed's `continuationStipulation` carries it through, so under
 * `ZUHUR_ONLY` a waqif with only daughters can have living blood descendants and no continuing line —
 * the ẓuhūr bloodline is over while the family is not, and the deed's مآل takes. Under
 * `ZUHUR_AND_BUTUN` the test collapses to "no living descendant", unchanged. ✓ **The trigger applies on
 * EVERY entitlement order (memo Q5, product owner 2026-08-17)** — R7-d's widening was scoped to
 * `LINEAGE_CONTINUATION` by engineering; the owner retired the strict reading on `ORDERED`/`SHARED` too. See
 * {@link REVERSION_TO_ULTIMATE_TAKER_APPLIED} and `resolver.continuesTheLine`.
 *
 * This **narrows** R5 rather than weakening it. The endowment is ذري while the family lives and the
 * charity never shares a period with the bloodline, so nothing is ever both خيري and ذري *at once*.
 * What changes is that a charity recorded on a ذري waqf is no longer *per se* a contradiction — only a
 * charity paid **alongside** living descendants is. Concretely, for this contract:
 *
 *  · **The reversion is a WAQF-LEVEL clause, not a property of a person** — `distributionInput`'s
 *    {@link reversionInputSchema} names the beneficiary ids the deed appoints as مآل. There is **no new
 *    `BeneficiaryKind` and no per-beneficiary marker**: مآل الوقف is what the *deed* says about the
 *    endowment's destination, exactly like `waqfType`, `entitlementOrder` and
 *    `continuationStipulation`; and a clause that names ids gives the engine **two sides that must
 *    agree** (the clause names an id, the register says what that id is), which is the discipline
 *    `tabaqa` survived ADR-0009 for. A boolean on the beneficiary row has one trusted side, which is
 *    how S3-D1 shipped. It also keeps `BENEFICIARY_KINDS` at three, so the ten `MUST_MATCH` Prisma
 *    pairings are untouched and E3/E4 is owed one migration rather than two (ADR-0004 discipline).
 *  · **It is never inferred** (R7-c). Not from "the only beneficiary left is a charity", not from "a
 *    jiha is present". Absent (`null`) ⇒ the deed records no مآل, and a jiha on a ذري waqf is refused
 *    exactly as before (`CHARITABLE_JIHA_ON_FAMILY_WAQF`). Unrecognised ⇒ halt by name.
 *  · **It cannot be made unrepresentable and this contract does not pretend otherwise.** A boolean
 *    would leave "unmarked jiha on a ذري waqf" representable; this object leaves "reversion naming a
 *    descendant" representable. What it buys is that every invalid state is **few, named, and refused
 *    in ONE place before anything depends on it** — `resolver.assertReversionLegible`, step 2 of
 *    `assertSingleWaqfNature`, before every cohort refusal, so no exemption is ever granted on the
 *    strength of an unreadable clause.
 *
 * ✓ **LANDED IN S4/E3 (migration `00000000000012_e3_lineage_reversion_deed_terms`).** This header used
 * to read: *"`REVERSION_KINDS` is a fifth engine-only vocabulary: `schema.prisma` has no `ReversionKind`
 * enum and `Waqf` has nowhere to record this clause. E3/E4 owes both."* Both are now false.
 * `schema.prisma` declares `enum ReversionKind` and `Waqf` carries `reversionKind`,
 * `reversionClauseCaptured`, the dual `reversionRecordedAt`/`…Hijri` pair and a `waqf_reversion_taker`
 * join table holding the ids — with **no `@default` on any of them** (binding rule 6), so an absent
 * clause still reaches this engine as `null` and still means *the deed records no مآل*, never
 * "nobody has read it yet". That second state is the DATABASE's `reversionClauseCaptured = false`, and
 * it is refused at the MAPPING boundary rather than here: this contract stays two-state on purpose, so
 * no new engine discriminator was minted for it.
 * `__tests__/prisma-vocabulary-parity.test.ts` now pairs `REVERSION_KINDS` with the Prisma enum
 * member-for-member and asserts the columns PRESENT — while still refusing the spellings R7 rejected
 * (`ultimateTakerIds`, `maalAlWaqf`), so one fact keeps one spelling.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * VOCABULARY CASE — SCREAMING_SNAKE, matching `schema.prisma`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08's sketch spells its INPUT enums lower-case (`ordered`, `family_dhurri`, `verified`,
 * `direct-utilization`) while its own OUTPUT enums are upper (`PAID`, `WITHHELD`). Every one of
 * those values already exists as a Prisma enum member in SCREAMING_SNAKE. The engine adopts the DB
 * spelling so E5/S6 can feed it straight from a row: a hand-written case-mapping layer between the
 * ledger and the engine is precisely where `direct-utilization` silently fails to equal
 * `DIRECT_UTILIZATION`. The lower-case spellings in `data/fixtures/sample-waqf.json` are already
 * normalised by `packages/database/src/seed/map.ts`.
 *
 * `__tests__/prisma-vocabulary-parity.test.ts` compares the two sides. **This list is that test's
 * list, verbatim — editing one without the other is a deliberate act and shows up in review.**
 *
 *  · **Member-for-member equal today (14):** `WaqfType`, `VerificationStatus`,
 *    `WaqfClassification.DIRECT_UTILIZATION`, `FeeBasis`, `BeneficiaryKind`, `BeneficiaryLine`,
 *    `BeneficiaryResidency`, `ReceiptClass`, `CapitalSource`, `DistributionLineStatus`, and — new in
 *    **S4/E3** — `EntitlementOrder`, `ContinuationStipulation`, `LineageLink`, `ReversionKind`.
 *  · **Engine deliberately AHEAD of `schema.prisma` by a declared delta (0).** ⚠ **This bullet used to
 *    read "(1): `EntitlementOrder` — the engine has `LINEAGE_CONTINUATION` and the database does not
 *    yet (ADR-0009 leaves the migration to E3/E4 and writes none in S4)". That is now FALSE.** Migration
 *    12 added the member, so the pairing is a plain equality above and the declared delta is EMPTY. The
 *    parity test asserts that emptiness as a **value** and names the migration, because `it.each([])`
 *    registers no tests at all — a list that merely happens to be empty would prove nothing. The
 *    category itself is kept, wired, for the next vocabulary the engine legitimately has to lead.
 *  · **Engine-only ON PURPOSE (2):** `DisbursementSchedule` and `MaintenanceRuleKind` — pinned *absent*
 *    from `schema.prisma`, so if E5 adds either the test forces the pairing to be added rather than
 *    letting two spellings drift. **This header does not claim they are Prisma enums, because they are
 *    not.** They are terms of the Shart and live inside `shartAlWaqif Json`; giving either a column and
 *    an enum is E5's decision about where the maintenance rule and the disbursement channel live.
 *    ⚠ Three vocabularies LEFT this bullet in S4 (`ContinuationStipulation`, `LineageLink`,
 *    `ReversionKind`); they were promoted to equality pairings, not deleted.
 *  · **Field-level pairings (S4/E3, inverted from absence to presence):** `Beneficiary.parentId`,
 *    `.lineageLink`, `.active` and `Waqf.continuationStipulation` + the four مآل columns are asserted
 *    PRESENT, each with its positive control kept and each asserted to carry **no `@default`** — while
 *    the rejected spellings stay pinned absent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WEIGHTS AND RATES ARE DECIMAL STRINGS, AND RATES ARE OUT OF 100
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 sketches `stipulatedWeight: z.number()` and `rate: Percent01 = z.number().min(0).max(1)`.
 * Both are corrected here, and the second correction is load-bearing:
 *
 *   · `largestRemainderAllocate` **rejects a JS `number` at runtime** (`MONEY_NUMBER_INPUT`) — a
 *     numeric weight cannot reach the allocator at all. Weights are decimal strings, ≤18 dp.
 *   · The shipped `Setting nazirFee.percentOfRevenue` has `unit: 'percent'` and holds `10`, and
 *     `percentOf(amount, percent)` divides by 100. Feeding §08's `0.10` into that path yields
 *     **0.1% of revenue — a 100× underpayment of the Nazir fee, silently**. The field is therefore
 *     named `ratePercent` (0–100, `'10'` = 10%), renamed so that no call site can carry `0.10`
 *     forward and still look correct.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `asOf` IS ONE DAY IN TWO CALENDARS; `deadline` IS TWO DIFFERENT DAYS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 gives both the same `HijriGreg` shape, which invites a reader to treat the deadline pair as
 * a dual-date of a single day. It is not: `deadlineGregorian = FYE + N calendar months` and
 * `deadlineHijri = Hijri(FYE) + N Hijri months` land on **different days** (for FYE 2026-12-31 they
 * are 2027-03-31 and 1448-10-22 = 2027-03-30 — one day apart). So `asOf` is a true dual date (and
 * the engine asserts `toHijri(asOf.gregorian) === asOf.hijri`, the cheapest possible proof that the
 * caller used our one Umm al-Qura implementation), while `deadline` is a pair of independent dates
 * and is NOT cross-checked. §08 line 144 says the Hijri half arrives "via @umalqura/core,
 * injected" — **@umalqura/core was rejected by ADR-0007**; the caller computes both halves with
 * `computeDeadline` / `toHijri` from `../dates/index.js` and injects them, because purity means the
 * engine reads no calendar it was not handed.
 *
 * Which of the two binds is S3 decision D2: a `Setting`-driven selector whose flagged default is
 * `EARLIER_OF`, so lateness can never be under-reported. Both dates are always reported.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * SPEC CORRECTION — `totals.retainedMinor` (§08 invariant I3 is unsatisfiable as written)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 I3 says `paid + withheld + crossBorder == distributable`. Its own acceptance criteria
 * produce two states where `distributable > 0` with ZERO payout lines — `NO_ELIGIBLE_BENEFICIARIES`
 * ("distributable is retained, carried forward") and a `NA_DIRECT_USE` waqf that did have period
 * revenue (§08 line 54: the waterfall still computes; only the split below it is skipped). Both
 * make I3 false. `retainedMinor` closes it, in I2 as well as I3:
 *
 *     Σ lines.entitledMinor + retainedMinor == distributableMinor          (I2, restated)
 *     paid + withheld + crossBorder + retained == distributableMinor       (I3, restated)
 *
 * ⚠ `retainedMinor` means **distributable attached to NO line**. A WITHHELD amount also physically
 * sits in the waqf account, but it belongs to a named beneficiary and is counted in `withheldMinor`
 * — never here. The engine only *reports* the retained value; where it goes is OQ-01 sub-question 2
 * and is unsigned.
 *
 * // TODO(surface): OQ-01 — rounding direction AND residual destination are still [Product] +
 * // [Counsel] decisions. §08 Stage 5 allocates the residual to beneficiary lines by largest
 * // remainder (tie-broken by ascending `beneficiaryId`) and BUILD-PLAN instructs that; §16 OQ-01
 * // proposes sweeping it into next-period ghallah carry-forward instead. This engine implements
 * // §08/BUILD-PLAN. "Half-up" (§16, BUILD-PLAN) is arithmetically incompatible with Hamilton,
 * // which is floor-then-hand-out-the-remainder: half-up can make Σ lines EXCEED distributable,
 * // which would make §08's own I9 (`residual ≥ 0`) false.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NAME COLLISION WITH `../dates` — read before touching the barrels (S3 CONTRACT-agent note)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `../dates/deadline.ts` already exports a DIFFERENT `DeadlineBasis`
 * (`'business_days' | 'calendar_months' | 'calendar_days'` — which *calendar unit* a window is
 * measured in), and `../index.ts` re-exports it. This file's `DeadlineBasis`
 * (`'SHART_SCHEDULE' | 'POST_FYE_DEFAULT'` — *which instrument* set the due date) is a different
 * concept with the same name. Inside `./distribution/*` the short name is the contract name, as
 * the brief locks it. At the BARREL boundary it must be aliased: `./index.ts` and `../index.ts`
 * must export {@link DistributionDeadlineBasis}, never a bare `DeadlineBasis`, or the package
 * barrel has two exports with one name and `tsc` fails. The alias is declared here so both
 * barrel authors take it from one place. Same care applies to {@link RoundingMethod}, which
 * `../index.ts` already re-exports from `../money.js`: do not re-export it from the distribution
 * barrel as well.
 */

import Decimal from 'decimal.js';
import { z } from 'zod';

import { civilDate, formatHijriDate, parseHijriDate, toHijri } from '../dates/index.js';
import type { CivilDate, HijriDate } from '../dates/index.js';
import { compareCivilDates } from '../dates/index.js';
import { DomainError } from '../errors.js';
import { ROUNDING_METHODS, fromMinor, money, toDbString, toMinor } from '../money.js';
import type { Money, RoundingMethod } from '../money.js';

/**
 * A private `Decimal` constructor, cloned for exactly the reason `../money.js` clones one: this
 * package must never mutate decimal.js behaviour for anything else in the monorepo.
 *
 * `precision: 40` keeps the `sharePercent` quotient exact well past its 6 dp, and pushing
 * `toExpNeg`/`toExpPos` out means no intermediate can ever stringify as `1e-7` — an exponent
 * reaching a statement or a `Decimal(18,2)` column would be a silent corruption.
 */
const ContractDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Minor units (halalas) — the engine's only money representation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Integer halalas. 1 SAR = 100n. Branded so a bare `bigint` count cannot be mistaken for money. */
export const minorSchema: z.ZodBranded<z.ZodBigInt, 'Minor'> = z.bigint().brand<'Minor'>();

/** Non-negative halalas — every monetary field except an explicitly signed one. */
export const nonNegativeMinorSchema: z.ZodBranded<z.ZodBigInt, 'Minor'> = z
  .bigint()
  .nonnegative()
  .brand<'Minor'>();

export type Minor = z.infer<typeof minorSchema>;

/**
 * Brand a bigint as halalas. Bigints are integral by construction, so there is nothing to round.
 *
 * The runtime guard is not decoration. `Minor` is a *type* brand, so `minorOf(x)` on an `any`-typed
 * `x` — a JSON body, a Prisma row read through a loose cast, a test helper — would otherwise brand
 * a JS `number` as money and let `3.5` become "3.5 halalas". `../money.js`'s `rejectNumber`
 * discipline is reproduced here because this is the *other* door money comes through.
 */
export function minorOf(value: bigint): Minor {
  if (typeof value === 'number') {
    throw new DomainError(
      'MONEY_NUMBER_INPUT',
      'minorOf: a JS number is not money (binary floats cannot hold halalas exactly). Pass a bigint of halalas.',
      { details: { context: 'minorOf', receivedType: 'number' } },
    );
  }
  if (typeof value !== 'bigint') {
    throw new DomainError(
      'MONEY_INVALID',
      `minorOf: expected a bigint of halalas, received ${typeof value}.`,
      { details: { context: 'minorOf', receivedType: typeof value } },
    );
  }
  return value as Minor;
}

/** `Minor` from a 2-dp decimal string — the Prisma `Decimal(18,2)` boundary, inbound. */
export function toMinorFromDecimalString(value: string): Minor {
  return minorOf(toMinor(money(value)));
}

/** The exact 2-dp decimal string for a `Decimal(18,2)` column — the boundary, outbound. */
export function minorToDecimalString(value: Minor): string {
  return toDbString(fromMinor(value));
}

/** `Money` view of halalas, for the tested `percentOf` / `largestRemainderAllocate` helpers. */
export function minorToMoney(value: Minor): Money {
  return fromMinor(value);
}

/** Halalas from `Money`. Throws `MONEY_PRECISION` if the amount is not a whole halala. */
export function moneyToMinor(value: Money): Minor {
  return minorOf(toMinor(value));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Decimal-string primitives (weights, rates, share percentages)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Non-negative plain decimal literal. Exponent notation, signs, NaN and Infinity are rejected. */
const NON_NEGATIVE_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Matches `../money.js`'s `MAX_WEIGHT_DECIMAL_PLACES`, which bounds bigint growth in the split. */
export const MAX_WEIGHT_DECIMAL_PLACES = 18;

/** Fixed scale of the `sharePercent` figure printed on the beneficiary statement. */
export const SHARE_PERCENT_SCALE = 6;

const decimalLiteralSchema = z
  .string()
  .regex(
    NON_NEGATIVE_DECIMAL,
    'must be a non-negative plain decimal literal (no sign, no exponent notation) — a JS number is never a weight or a rate here',
  );

/**
 * Parse a decimal literal for a refinement, returning `null` instead of throwing.
 *
 * ⚠ **SPEC CORRECTION (S3 CONTRACT agent) — this defensiveness is load-bearing, not style.**
 * In zod 3 a failed `ZodString` check (a regex) marks the parse **dirty, not aborted**, so a
 * `.refine()` layered on top STILL RUNS with the offending value. The brief's
 * `contractTypes` called `new Decimal(value)` directly inside the refinement, so
 * `stipulatedWeight: ''` (or `'.5'`, or `'NaN'`) threw a raw `DecimalError` **out of
 * `safeParse`** — bypassing `parseDistributionInput`'s ZodError→`DomainError` conversion and
 * escaping the pure engine as an untyped third-party exception. That is precisely the failure
 * mode the header's "no raw ZodError escapes" paragraph exists to prevent; verified by a test
 * (`rejects a JS number, a sign, an exponent, and blank/NaN/Infinity`) which fails against the
 * naive version.
 */
function decimalPlacesOrNull(value: string): number | null {
  if (!NON_NEGATIVE_DECIMAL.test(value)) return null;
  try {
    return new ContractDecimal(value).decimalPlaces();
  } catch {
    return null;
  }
}

/** A deed-stipulated relative weight. Need not sum to 100 across the input set (§08 stage 2). */
export const stipulatedWeightSchema = decimalLiteralSchema.refine(
  (value) => {
    const decimalPlaces = decimalPlacesOrNull(value);
    return decimalPlaces !== null && decimalPlaces <= MAX_WEIGHT_DECIMAL_PLACES;
  },
  `a weight may carry at most ${String(MAX_WEIGHT_DECIMAL_PLACES)} decimal places`,
);

/** A rate **out of 100** — `'10'` is ten percent. Matches `percentOf` and the `Setting` unit. */
export const ratePercentSchema = decimalLiteralSchema.refine((value) => {
  const decimalPlaces = decimalPlacesOrNull(value);
  if (decimalPlaces === null || decimalPlaces > MAX_WEIGHT_DECIMAL_PLACES) return false;
  return new ContractDecimal(value).lessThanOrEqualTo(100);
}, 'a rate is expressed out of 100 ("10" = 10%) and must be between 0 and 100');

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Dates — validated with the ONE Umm al-Qura implementation (`../dates`), never re-derived
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `yyyy-MM-dd` Gregorian. Validated in `superRefine` and branded in `transform`, so `safeParse`
 * reports an issue instead of letting `civilDate`'s `RangeError` escape a non-throwing call.
 */
export const civilDateSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      civilDate(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'not a valid yyyy-MM-dd civil date',
      });
    }
  })
  .transform((value) => civilDate(value));

/** `yyyy-MM-dd` Umm al-Qura, in Latin digits. Out-of-table years are rejected, not extrapolated. */
export const hijriDateSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      parseHijriDate(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'not a valid yyyy-MM-dd Umm al-Qura date inside the supported table range',
      });
    }
  })
  .transform((value) => formatHijriDate(parseHijriDate(value)));

/** One instant in both calendars. Cross-checked by {@link assertInputConsistency}. */
export const dualDateSchema = z
  .object({ gregorian: civilDateSchema, hijri: hijriDateSchema })
  .strict();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Closed vocabularies
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `ReceiptClass` — income (ghallah / غلة) vs capital (asl / أصل). */
export const RECEIPT_CLASSES = ['INCOME', 'CAPITAL'] as const;
/** `CapitalSource` — which corpus event produced a CAPITAL receipt. Required on every CAPITAL row. */
export const CAPITAL_SOURCES = [
  'SALE_PROCEEDS',
  'ISTIBDAL_PROCEEDS',
  'EXPROPRIATION_COMPENSATION',
  'OTHER',
] as const;
/**
 * `WaqfClassification` — drives statement depth (BR-902), not the split. ⚠ bands unverified.
 *
 * ⊕ `NOT_CLASSIFIED` (S8-Q4, owner, 2026-08-23): the onboarding state — the ABSENCE of a
 * determination, not a class. Its consequences live in `../classification/` (the register locks,
 * no gate is ever TRUE at it); THIS engine reads `classification` as trace metadata only and
 * branches on it nowhere, so a run over a not-yet-classified endowment computes — money never
 * consulted the class. Appended LAST: the parity test compares member ORDER against
 * `schema.prisma` with `toStrictEqual`.
 */
/**
 * The Authority's SIZE bands — THREE — plus S8-Q4's onboarding state.
 *
 * ⊕ **S9-4a: `DIRECT_UTILIZATION` IS GONE (owner ruling, fifth batch, 2026-08-25, verbatim
 * selection "a").** The owner stated the taxonomy himself — *"there are 3 types: large, medium,
 * small"* — and ruled that ذات انتفاع مباشر is an **ORTHOGONAL USAGE ATTRIBUTE, not a size**: an
 * endowment could be small AND direct-use. While it lived here the two axes were mutually
 * exclusive — a direct-use endowment had NO size on record, and a small one could not be recorded
 * as direct-use.
 *
 * ⚠ **REFUSED, NEVER REMAPPED (ADR-0004).** Migration 42 refuses to apply over any row holding the
 * value rather than choosing a size on a Nazir's behalf; `Waqf.directUtilization` carries the usage
 * axis, NULLABLE with no default, where **NULL means UNRECORDED and never "not direct"**.
 * `prisma-vocabulary-parity.test.ts` pins this list against `schema.prisma`'s enum.
 */
export const WAQF_CLASSIFICATIONS = ['LARGE', 'MEDIUM', 'SMALL', 'NOT_CLASSIFIED'] as const;
/**
 * `WaqfType`. **`JOINT` is a REFUSED VALUE, not a removed member (ADR-0009 R5 / decision 3).**
 *
 * A waqf is either خيري (charitable, for a segment the waqif chooses) or ذري (ancestral /
 * generational) and never both, so `waqfType: 'JOINT'` halts with `SHART_INCOMPLETE` at Stage 0.
 * The *vocabulary* is untouched: the member stays here and in `schema.prisma`'s `WaqfType`, and no
 * migration is written, because `awqaf-law.md` Art. 4 and `glossary.md`'s الوقف المشترك both record
 * a joint endowment as a real category and that contradiction is open with Saudi counsel. The
 * distinction between refusing a value and narrowing a vocabulary is the whole of ADR-0009
 * decision 3, and `__tests__/prisma-vocabulary-parity.test.ts` is where it stays visible: this list
 * is still asserted member-for-member equal to Prisma's.
 */
export const WAQF_TYPES = ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI', 'JOINT'] as const;
/**
 * `EntitlementOrder`. NOT used as the input schema's type — see rule 4 in the header.
 *
 * `LINEAGE_CONTINUATION` is the deed shape the product treats as **NORMAL** (ADR-0009 R4).
 * "Default" here means "this is the value a deed that does not stipulate tier-exclusion is
 * *recorded* as" — it is **NOT a zod `.default()` and never will be.** An absent or unrecognised
 * `entitlementOrder` still halts with `SHART_INCOMPLETE` (`ENTITLEMENT_ORDER_UNRECOGNISED`);
 * a coded default here would be the engine guessing the founder's intent (binding rule 1).
 *
 * Why a fourth member rather than reusing `SHARED`:
 *
 *  · `SHARED` (tashrik / تشريك) differs from lineage in two substantive ways — it applies no
 *    ẓuhūr/buṭūn eligibility filter, and deed `stipulatedWeight`s **are** applied. Collapsing them
 *    would silently make every tashrik deed per capita. §08 line 105, glossary §B and fixture
 *    `waqf-002` are built on `SHARED`; it is retained verbatim.
 *  · Not `ORDERED`-as-a-flag, because R4 requires both paths to be first-class values so
 *    `basis.rule` can name which one decided an entitlement (BR-505).
 *  · Not `LINEAGE_SUBSTITUTION`: "substitution" is already **istibdal (استبدال)** in this repo's
 *    locked glossary and in `CAPITAL_SOURCES.ISTIBDAL_PROCEEDS`. Giving a locked domain word a
 *    second meaning is how a corpus rule and an entitlement rule end up read as the same thing.
 *    `LINEAGE_CONTINUATION` also matches the deed term it pairs with
 *    ({@link CONTINUATION_STIPULATIONS}) and the owner's own word ("continue").
 *
 * ✓ **S4/E3 · `schema.prisma` now declares this member too** (migration 12,
 * `ALTER TYPE "EntitlementOrder" ADD VALUE 'LINEAGE_CONTINUATION'` — additive, so existing rows keep
 * their value and no data migration was owed). This note used to read *"Engine is ahead of
 * `schema.prisma` by exactly this member. E3/E4 owes the migration"*; the pairing is now a plain
 * equality in the parity test's `MUST_MATCH` and the declared delta is empty. See the header's
 * vocabulary-case section.
 */
export const ENTITLEMENT_ORDERS = [
  'LINEAGE_CONTINUATION',
  'ORDERED',
  'SHARED',
  'NA_DIRECT_USE',
] as const;
/**
 * How the deed continues the waqif's lines — *ẓuhūr wa buṭūn* / ظهور وبطون (ADR-0009 R2).
 *
 * A **CLOSED TWO-VALUE** deed term. There is no third value and **no default**: absent, empty,
 * whitespace-padded, wrong-cased or unrecognised ⇒ `SHART_INCOMPLETE`
 * (`CONTINUATION_STIPULATION_UNRECOGNISED`). Which lines a founder continued is not something code
 * may choose.
 *
 *  · `ZUHUR_ONLY` — the sons' lines continue. A **daughter is a beneficiary in her own right**, but
 *    **her children are not.** Reduced to the test the engine runs: a person is eligible iff every
 *    ancestor *strictly between* the waqif and them is a `SON`. The person themself may be either.
 *  · `ZUHUR_AND_BUTUN` — **both** sons' and daughters' lines continue indefinitely, so every living
 *    descendant of the waqif is eligible whatever the links on the path.
 *
 * ✓ **S4/E3 · `enum ContinuationStipulation` and `Waqf.continuationStipulation` now exist** (migration
 * 12), with **no `@default`** and as a **write-once** deed column: `NULL → value` once, then refused
 * with SQLSTATE 42501 — because this is a founder's condition, and a change to one is a superseding
 * instrument recorded as a new record, never an edit (ADR-0006). This note used to read *"Engine-only
 * vocabulary today — no `ContinuationStipulation` enum exists in `schema.prisma`, and `Waqf` has
 * nowhere to record this term. E3/E4 owes it"*. The parity test now compares the two spellings
 * member-for-member; nullable still means **halt**, never a default.
 */
export const CONTINUATION_STIPULATIONS = ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const;
/**
 * The fiqh link a descendant holds to their parent — the ẓuhūr/buṭūn **eligibility fact**.
 *
 * **NOT a demographic or gender field.** It exists for exactly one computation (the `ZUHUR_ONLY`
 * intermediate-ancestor test), is never rendered as a person's gender, and is `null` on any
 * beneficiary who is not a descendant of the waqif (a charitable jiha). No gate, statement field or
 * report may read it for any other purpose.
 *
 * Kept as the **recorded fact** (`SON`/`DAUGHTER`) rather than pre-interpreted as
 * `NAME_CARRYING`/`NOT_NAME_CARRYING`: under `ZUHUR_AND_BUTUN` the interpreted form carries no
 * information at all, so pre-interpreting would make a `ZUHUR_AND_BUTUN` deed's data unreadable and
 * would bake one deed's reading into every deed's data. **The stipulation decides what the fact
 * means; the fact itself is deed-neutral.**
 *
 * ✓ **S4/E3 · `enum LineageLink` and `Beneficiary.lineageLink` now exist** (migration 12, no
 * `@default`) — see {@link CONTINUATION_STIPULATIONS}. ⚠ The database carries the same prohibition this
 * note does: it is read for **one** computation and must never be rendered as a person's gender — no UI
 * label, no report column, no CSV export, no i18n key.
 */
export const LINEAGE_LINKS = ['SON', 'DAUGHTER'] as const;
/** `BeneficiaryLine` — ẓuhūr / buṭūn, or NA for a charitable jiha or a category placeholder. */
export const BENEFICIARY_LINES = ['ZUHUR', 'BUTUN', 'NA'] as const;
/** `BeneficiaryKind`. */
export const BENEFICIARY_KINDS = ['FAMILY', 'CHARITABLE_JIHA', 'CATEGORY_ONLY'] as const;
/** `VerificationStatus`. */
export const VERIFICATION_STATUSES = ['VERIFIED', 'PENDING', 'UNVERIFIED'] as const;
/** `BeneficiaryResidency`. */
export const RESIDENCIES = ['DOMESTIC', 'CROSS_BORDER'] as const;
/** `FeeBasis` — deed-set (Nazarah Art. 11), never statutory. ⚠ the *rate* is unverified. */
export const FEE_BASES = ['PERCENT_OF_REVENUE', 'PERCENT_OF_NET_INCOME', 'RETAINER'] as const;
/** How the Shart stipulates the ṣiyāna (صيانة) reserve that comes FIRST in the waterfall. */
export const MAINTENANCE_RULE_KINDS = [
  'FIXED',
  'PERCENT',
  'TARGET_TOPUP',
  'NONE',
  /**
   * ⊕ OQ-06 (product owner, 2026-08-18). The deed is SILENT on maintenance and the **Nazir has
   * recorded a discretionary percentage** for this endowment. Verbatim: *"the law gives the nazir a
   * discretion. at Qmulate each endownment will have a % set deserve at the nazir's discretion."*
   *
   * ⚠ IT IS A SEPARATE KIND FROM `PERCENT`, AND THE SEPARATION IS THE POINT. `PERCENT` is the
   * **founder's** stipulation — a term of the Shart al-Waqif, immutable, binding. This is the
   * **trustee's** discretion, exercised under a silent deed and revisable by the trustee. Collapsing
   * them would make a Nazir's choice indistinguishable, later, from a founder's condition — and this
   * codebase already carries the scar of two fields that were supposed to agree with nothing
   * comparing them. A statement must be able to say which of the two produced the reserve.
   */
  'NAZIR_DISCRETION_PERCENT',
  /**
   * ⊕ OQ-06. The deed is silent AND **no discretion has been recorded yet**. Reserves zero — and
   * raises {@link RUN_FLAGS} `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED`, so the run cannot be
   * mistaken for one where somebody decided.
   *
   * ⚠ THIS IS THE KIND THAT USED TO BE SPELLED `NONE`, AND THE CONFLATION WAS THE DEFECT OQ-06
   * OPENED. Zero is not the absence of an answer: it is the answer *"reserve nothing"*, and until
   * this kind existed the engine asserted it silently on every silent deed while a Nazir who had
   * genuinely chosen zero produced a byte-identical run. Same shape as the Nazir fee's
   * `AUTHORITY_FEE_DETERMINATION_PENDING`, for the same reason: a silently-zero deduction must be
   * impossible to produce.
   */
  'UNSET',
] as const;
/** A Shart-stipulated disbursement schedule. `null` ⇒ the post-FYE default window applies. */
export const DISBURSEMENT_SCHEDULES = ['ANNUAL', 'QUARTERLY', 'CUSTOM'] as const;
/** `DistributionLineStatus`. */
export const LINE_STATUSES = ['PAID', 'WITHHELD', 'CROSS_BORDER_PENDING', 'EXCLUDED'] as const;

/**
 * **R7** · how the deed disposes of the endowment once its beneficiary class ends — **مآل الوقف**.
 *
 * A closed **one**-value vocabulary today, and the `kind` field exists *because* it is one value. A deed
 * may revert to the poor of a city, to another waqf, to the Authority, or to the waqif's nearest
 * relatives; the engine implements only the reading the product owner gave on 2026-08-10 (a charitable
 * jiha as ultimate taker), so any other recorded مآل must **halt by name**
 * (`REVERSION_KIND_UNRECOGNISED`) rather than be coerced into this one (binding rule 1). A single-member
 * enum with a discriminator is the shape that makes the second reading a *refusal* instead of a
 * silent reinterpretation of the first.
 *
 * ✓ **S4/E3 · `enum ReversionKind` and the `Waqf` مآل columns now exist** (migration 12): `reversionKind`
 * (no `@default`, write-once), `reversionClauseCaptured` (**required**, no default, `false → true` only),
 * the dual `reversionRecordedAt`/`…Hijri` pair, and `waqf_reversion_taker` for the ids the clause names —
 * that table refusing UPDATE, DELETE and TRUNCATE outright, because a row in it decides where the
 * endowment goes when the family ends. This note used to read *"Engine-only vocabulary: `schema.prisma`
 * has no `ReversionKind` enum and `Waqf` has nowhere to record this clause at all. E3/E4 owes both"*.
 *
 * ⚠ **The two-state input did NOT change.** This contract's `reversion` is still `clause | null`, and
 * `null` still means *the deed records no مآل* (R7-c). The database's third state — "nobody has read the
 * clause yet", `reversionClauseCaptured = false` — is refused at the **mapping** boundary, so the
 * un-read state can never masquerade as the deed's silence and **no new engine discriminator was minted**
 * for it. `SHART_REFUSALS` still holds twenty-six.
 */
export const REVERSION_KINDS = ['CHARITABLE_ULTIMATE_TAKER'] as const;

/**
 * Stage-3 gate reasons — **payability**, not entitlement.
 *
 * Four of the five are spelled exactly as their `DOMAIN_ERROR_CODES` twins so the ar/en copy under
 * `errors.domain.*` is reused rather than duplicated; a test asserts that overlap stays identical.
 * `STALE_KYC` is the canonical spelling — §08's `KYC_STALE` is a drift, and shipping both would
 * give one condition two codes.
 */
export const GATE_REASON_CODES = [
  'CATEGORY_NOT_CAPTURED',
  'ENTITY_UNLICENSED',
  'STALE_KYC',
  'KYC_UNVERIFIED',
  'CROSS_BORDER_PENDING',
] as const;

/**
 * Stage-2 exclusion reasons — **entitlement**, not payability. An excluded member is owed nothing
 * this period and contributes 0 to the normalisation denominator (§08 "Excluded ≠ withheld").
 *
 * `BENEFICIARY_INACTIVE` and `ZERO_STIPULATED_WEIGHT` are additions: §08 leaves an inactive member
 * of a still-living ṭabaqa with no applicable code (`UPPER_TABAQA_EXTANT` is wrong — there is no
 * upper tier; `TABAQA_EXTINCT` is wrong — the tier is not extinct), and names zero-weight members
 * as "not eligible" without giving them a status.
 *
 * **Which code can appear on which path (ADR-0009) — the codes are NOT interchangeable:**
 *
 * | Code | `LINEAGE_CONTINUATION` | `ORDERED` | `SHARED` |
 * |---|---|---|---|
 * | `UPPER_TABAQA_EXTANT` | never (I5 asserts it) | yes | never |
 * | `TABAQA_EXTINCT` | never (I5 asserts it) | yes | never |
 * | `BENEFICIARY_INACTIVE` | yes — the member's OWN vital status only | yes | yes |
 * | `ZERO_STIPULATED_WEIGHT` | **a recorded ultimate taker only** (R7) | yes | yes |
 * | `BUTUN_LINE_NOT_CONTINUED` | `ZUHUR_ONLY` only | `ZUHUR_ONLY` **on a run whose reversion APPLIED** (Q5) | ← same |
 * | `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` | yes — both stipulations | never | never |
 * | `REVERSION_PENDING_LIVING_BLOODLINE` | a recorded ultimate taker, on **every** order | ← | ← |
 *
 * ⚠ **The `BUTUN_LINE_NOT_CONTINUED` row was CORRECTED by memo Q5 (product owner, 2026-08-17), and the
 * old value is kept here because a documented table that silently changes is worse than one that argues.**
 * It read *"`ZUHUR_ONLY` only | never | never"*. Q5 made the reversion trigger consume the deed's
 * continuation term on **every** order, so an `ORDERED`/`SHARED` run can now be one where *no line the
 * deed continues is still going* while a living descendant sits on an abandoned line. Emitting that
 * descendant as ENTITLED beside the charity is R5 — I-R1's mirror refuses the whole run — so on an
 * **APPLIED** run they are excluded with this code, the same fact the trigger used. ⚠ On a run whose
 * reversion has **not** applied (or where the deed records no مآل at all) the two right-hand columns are
 * still `never`: ADR-0009 open question 3 is untouched, and a buṭūn survivor is entitled exactly as before.
 *
 * ⚠ **The `ZERO_STIPULATED_WEIGHT` row was CORRECTED by R7 and the correction matters.** It used to
 * read *"never — weights are not applied (R3)"* on the lineage column, and that was true while the only
 * members a lineage cohort could hold were family heads. A recorded ultimate taker is decided by the
 * **reversion clause, not by the entitlement order**, and its share IS its deed weight (R7-e: per
 * capita is the bloodline's rule, not a charity's) — so a taker whose recorded weight is zero is
 * excluded `ZERO_STIPULATED_WEIGHT` on `LINEAGE_CONTINUATION` too. Leaving the row as it was would have
 * made this documented table false, which is defect class 2.
 *
 * **There is deliberately no code for "my parent died", and that absence is still the point of R1.** A
 * generation's *death* does not block the next generation: a deceased ancestor is walked *through*.
 * What blocks is the opposite fact — a **living** ancestor, who holds the entitlement while they live
 * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, R-FRONTIER). So the lineage path reads `active` on the
 * beneficiary **and on their proper ancestors**, and death is the *trigger* for continuation rather
 * than an obstacle to it.
 *
 * ⚠ **THESE SEVEN CODES HAVE NO ar/en COPY ANYWHERE, AND NOTHING FAILS BECAUSE OF IT (NFR-01).**
 * Stated here because it is an open obligation on a later epic, not a defect in this file:
 *
 *  · The five {@link GATE_REASON_CODES} are also `DOMAIN_ERROR_CODES` members, so they already have
 *    `errors.domain.*` messages in **both** locales and `packages/i18n/test/messages.test.ts`
 *    enforces that in both directions. These five are NOT error codes (an exclusion is the deed
 *    operating normally, not a block), so no parity test covers them and none should — putting a
 *    non-error in the error list would teach the next reader that the error list contains non-errors.
 *  · **`BUTUN_LINE_NOT_CONTINUED` makes this gap materially worse and it is named here rather than
 *    quietly inherited.** Under the lineage path the commonest exclusion is no longer "your
 *    generation waits" but **"your line does not continue under this deed"** — a statement a family
 *    member is far more likely to dispute, and one whose Arabic wording is legally consequential
 *    text about their descent. It is deliberately **not** translated in this change: inventing that
 *    Arabic in a code change is exactly what ADR-0009 forbids. E10/E12 + product approval owe it.
 *  · **`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is the same problem again, with a twist E10/E12 must not
 *    miss: the Arabic must not read as permanent.** It is one of two exclusions in this list that
 *    reverse on an event nobody controls — the same person is entitled next period once the
 *    ancestor dies — so copy phrased like `BUTUN_LINE_NOT_CONTINUED` ("your line does not continue")
 *    would misstate the deed to a family member.
 *  · **`REVERSION_PENDING_LIVING_BLOODLINE` is the second, and it is harder.** It is temporary in the
 *    same way and must not read as a permanent disinheritance of the charity — but the event that
 *    reverses it is **the extinction of a family**, and this sentence is printed on a statement the
 *    charity's own trustees read. Copy that implies an expectation of the family's death is worse than
 *    no copy at all. It is deliberately not written here (ADR-0009 forbids inventing that Arabic in a
 *    code change); E10/E12 + product approval owe it.
 *  · But this is the reason a family member is told they receive nothing this period, on a statement
 *    whose authoritative language is **Arabic**, and BR-505 requires the entitlement basis on it. The
 *    same applies to {@link ENTITLEMENT_RULES} (rendered as `line.basis.rule`) and to the trace
 *    `code`s. next-intl PRINTS A MISSING KEY rather than throwing, so absent Arabic copy surfaces as
 *    `distribution.reasons.TABAQA_EXTINCT` in front of a beneficiary and CI stays green.
 *  · **E10/E12's statement work must add a `distribution.reasons.*` (+ `distribution.rules.*`,
 *    `distribution.trace.*`) namespace in ar AND en, and extend the catalogue-parity test to cover
 *    it.** The wording is not a mechanical choice — it is legally consequential text a beneficiary
 *    may dispute — so it needs product-approved Arabic, not a translation invented in a code change.
 *
 * The engine's own obligation is discharged: it emits a stable machine code and never prose, so the
 * copy can be added later without touching a single computed figure.
 */
export const EXCLUSION_REASON_CODES = [
  /** ORDERED path only. An upper (lower-numbered) ṭabaqa still lives, so this tier waits. */
  'UPPER_TABAQA_EXTANT',
  /** ORDERED path only. This tier is wholly extinct and sits below the entitled one. */
  'TABAQA_EXTINCT',
  /** All three paths. The member's OWN vital/scope status — never an ancestor's. */
  'BENEFICIARY_INACTIVE',
  /**
   * ORDERED/SHARED, **and a recorded ultimate taker on any order including
   * `LINEAGE_CONTINUATION`** (R7).
   *
   * ⚠ This line read *"ORDERED/SHARED only. NOT applied on a lineage cohort, where weights are not
   * applied (R3)"* until R7, and left uncorrected it contradicted the per-path table 60 lines above —
   * one file asserting two different rules about the same code. Per capita is the **bloodline's**
   * rule; a taker's share is its deed weight (R7-e), so a taker recorded at zero is excluded here even
   * on a lineage deed. MEASURED: two takers at `'0'` and `'10'` over an extinct bloodline ⇒ the zero
   * one is `EXCLUDED / ZERO_STIPULATED_WEIGHT` and the other takes 27,500,000 of 27,500,000. Family
   * heads on a lineage cohort are still never excluded for their weight — that half of R3 stands.
   */
  'ZERO_STIPULATED_WEIGHT',
  /**
   * `ZUHUR_ONLY` only: an ancestor **strictly between** the waqif and this person is a `DAUGHTER`,
   * so the deed does not continue their line (ADR-0009 R2). Their own `lineageLink` is irrelevant —
   * a son's daughter is eligible; a daughter's son is not.
   *
   * **Permanent under this deed.** Nothing that can happen to a person changes it, which is why it
   * outranks {@link EXCLUSION_REASON_CODES}'s temporary living-ancestor code when both apply.
   */
  'BUTUN_LINE_NOT_CONTINUED',
  /**
   * `LINEAGE_CONTINUATION` only, under **both** stipulations: an ancestor strictly between the waqif
   * and this person is still living, and **the entitlement sits with them** — entitlement rests at
   * the nearest living point on each line of descent (R-FRONTIER, product owner 2026-08-03:
   * *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A is
   * dead."*). The nearest such ancestor is named in the exclusion's trace detail.
   *
   * ⚠ **THIS EXCLUSION IS TEMPORARY AND REVERSES ON THE ANCESTOR'S DEATH.** It is not a statement
   * that the deed owes this person nothing — it is a statement about *who currently stands ahead of
   * them on their own line*. The identical register, one death later, makes the identical person
   * entitled and recomputes every other head's share. Anything that treats an exclusion as durable —
   * copy, a report, a "permanently excluded" filter, a cached cohort — is wrong for this code
   * specifically. Contrast `BUTUN_LINE_NOT_CONTINUED`, which no event reverses under this deed.
   */
  'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
  /**
   * **R7** · a recorded ultimate taker (مآل الوقف) receives nothing this period because **the
   * bloodline is extant** — a descendant of the waqif is still living **on a line this deed
   * continues**. Available on every order, because a taker's verdict comes from the reversion clause
   * and not from the entitlement order.
   *
   * Named for the FACT, not for the mechanism: the reason the deed owes this charity nothing is that
   * the family it was founded for still exists, and that is the sentence a reader must be able to
   * reconstruct from the code.
   *
   * ⚠ **NARROWED 2026-08-11 (R7-d).** *"Bloodline is over means no continuing line"* (product owner), so
   * a survivor whose line the deed does **not** continue no longer produces this code: under
   * `ZUHUR_ONLY` such a register triggers the reversion instead and the taker is paid — ✓ **on every
   * entitlement order since memo Q5 (product owner, 2026-08-17); the clause that limited this to
   * `LINEAGE_CONTINUATION` is retired.** Under `ZUHUR_AND_BUTUN`, or where the deed records no term the
   * engine recognises, "extant" still means "anyone living". Whatever ar/en copy E10/E12 writes must not promise the charity
   * that it waits for the family's *extinction* — it waits for the last line the deed carries.
   *
   * ⚠ **TEMPORARY, AND IT REVERSES WHEN THE LAST CONTINUING LINE ENDS** — exactly like
   * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, and unlike `BUTUN_LINE_NOT_CONTINUED`. The identical
   * register, once no continuing line remains, makes this same beneficiary entitled to the whole
   * distributable. So nothing downstream may treat it as durable: no copy phrased as a permanent
   * exclusion, no "permanently excluded" filter, no cached or persisted cohort. It is recomputed from
   * the register every period — see the reversal open question in `./resolver.ts`.
   */
  'REVERSION_PENDING_LIVING_BLOODLINE',

  /**
   * A recorded ultimate taker held because **every recorded descendant is a `CATEGORY_ONLY` placeholder**
   * for people never individually enumerated, so the engine cannot certify the family's extinction
   * (R7-D1). Temporary, like its sibling — but it reverses on an **enrolment**, not on a death.
   *
   * ⚠ Distinct from {@link REVERSION_PENDING_LIVING_BLOODLINE} because this code is printed on the
   * **charity's own** BR-505 statement: telling a jiha "the bloodline is living" on a register where
   * nobody is recorded as living is a false statement about descent, and the ADR already records that
   * exact class of mis-labelling as a defect.
   *
   * ⚠ Its ar/en copy (E10/E12, product-approved, never invented in a code change) must read as an
   * **incomplete register**, not as a refusal of the charity's appointment.
   */
  'REVERSION_PENDING_BLOODLINE_UNENUMERATED',
] as const;

/**
 * The rule the resolver applied, recorded on every line as the entitlement basis (BR-505).
 *
 * **Two lineage labels rather than one, on purpose.** `basis.rule` is printed on the beneficiary's
 * official Arabic statement (BR-505 / NFR-01), and "your line continues" and "your line does not
 * continue under this deed" are different legal statements to make to a family member. The reason
 * must be legible from the statement without re-reading the deed.
 */
export const ENTITLEMENT_RULES = [
  /**
   * Lineage, per capita, `ZUHUR_ONLY`: only sons' lines continue past the waqif's children, and
   * within a continuing line entitlement rests at the nearest living head (R-FRONTIER).
   */
  'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
  /**
   * Lineage, per capita, `ZUHUR_AND_BUTUN`: both sons' and daughters' lines continue, and within
   * each line entitlement rests at the nearest living head (R-FRONTIER).
   *
   * ⚠ This comment previously read *"every living descendant is eligible"*. That was ADR-0009's own
   * wording and it was corrected by the product owner on 2026-08-03: a descendant whose parent is
   * still alive is **not** entitled, under either stipulation.
   */
  'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
  /** The explicitly stipulated tier-exclusion exception (al-aʿlā fa-l-aʿlā). */
  'ORDERED_LOWEST_LIVING_TABAQA',
  /** tashrik / تشريك — every living tier shares, and deed weights ARE applied. */
  'SHARED_ALL_LIVING_TABAQAT',
  /**
   * ⚠ **UNREACHABLE as of ADR-0009: no run can be stamped with this rule.** A `JOINT` waqf is
   * refused at Stage 0, and a mixed charitable+family cohort is refused whatever its declared type.
   *
   * Kept rather than deleted so the record that this repo once modelled joint deeds survives the
   * reversal-if-counsel-disagrees path (ADR-0009 decision 3, reconciliation step 2). **Its
   * unreachability is carried by a TEST — "no run produces `JOINT_FIXED_DEED_SHARES`" — never by
   * this comment.** A comment claiming a correctness property the code lacks is a defect, and this
   * repo has shipped three of them.
   */
  'JOINT_FIXED_DEED_SHARES',
  /**
   * **R7** · مآل الوقف — this line was decided by the deed's **reversion clause**, not by its standing
   * entitlement order: the recorded bloodline is over and the endowment's ultimate taker receives the
   * distributable.
   *
   * **Mandatory, not decorative.** A charity paid a family endowment's whole ghallah on a line stamped
   * `LINEAGE_PER_CAPITA_ZUHUR_ONLY` — an official Arabic statement telling a charity that its line of
   * descent from the waqif continues — is the exact mis-statement ADR-0009 records as a defect. This is
   * what a charity's BR-505 basis must say instead.
   *
   * ⚠ Carried on the **taker's line only**, and only on a run where the reversion actually triggered.
   * Run-level `result.entitlementRule` keeps the *order's* rule, because the deed's standing entitlement
   * order did not change — its reversion clause took effect. So `basis.rule` can now **vary within one
   * run**, for the first time.
   *
   * // TODO(surface) — on a run where the clause exists but has NOT triggered, the taker's line carries
   * // the ORDER's rule (e.g. `LINEAGE_PER_CAPITA_ZUHUR_ONLY`) beside the exclusion
   * // `REVERSION_PENDING_LIVING_BLOODLINE`. That label is a statement about descent and it is false of
   * // a charity, even though no money moves and the exclusion beside it reads correctly. Stamping this
   * // label on a recorded taker's line on EVERY run would be more honest; it is not done here because
   * // which of the two a pending statement should print is a reporting decision (E10/E12), not an
   * // arithmetic one. Whoever writes that copy must not render the order's rule as the charity's basis.
   */
  'ULTIMATE_TAKER_MAAL_AL_WAQF',
  /** intifāʿ mubāshir / انتفاع مباشر — no cohort, no monetary line (I7). */
  'NA_DIRECT_USE',
] as const;

/**
 * Run-level flags. `NO_ELIGIBLE_BENEFICIARIES` lives HERE and not in `DOMAIN_ERROR_CODES`: §08's
 * own text says it is "not an exception … a flag", and adding a non-error to the error list would
 * demand ar/en `errors.domain.*` copy for something that never throws.
 */
export const RUN_FLAGS = [
  'AUTHORITY_FEE_DETERMINATION_PENDING',
  'NO_ELIGIBLE_BENEFICIARIES',
  'NIL_DISTRIBUTION',
  'NA_DIRECT_USE',
  'CAPITAL_RECEIPTS_EXCLUDED',
  /**
   * ⊕ OQ-06 (product owner, 2026-08-18). The deed is silent on ṣiyāna and **no Nazir discretion has
   * been recorded for this endowment**, so the reserve is zero *because nobody has decided*, not
   * because anybody chose nothing.
   *
   * Raised for the `UNSET` maintenance kind and for no other. `NONE` — the deed expressly stipulating
   * no reserve — is a founder's condition and raises nothing; `NAZIR_DISCRETION_PERCENT` at `'0'` is
   * a recorded trustee decision and raises nothing either. **A zero reserve is only flagged when it
   * is nobody's answer.**
   *
   * Deliberately a FLAG and not a refusal: the owner's interim, recorded in the S4 memo, is that the
   * run still computes. Turning it into a `SHART_INCOMPLETE` halt would block every silent-deed
   * endowment on day one — but a run that distributes the whole yield under a silent deed must never
   * be indistinguishable from one where the Nazir signed off on doing so.
   */
  'MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED',
  'TIMING_OVERDUE',
  'UNVERIFIED_FIGURES_APPLIED',
  /**
   * A lineage cohort's recorded `stipulatedWeight`s were **not applied**, because per capita
   * (ADR-0009 R3) publishes one equal share per head. The trace names every such member and the
   * deed figure that was skipped; the figure itself survives on `source.stipulatedWeight`.
   *
   * Raised in exactly the two cases where per capita **overrode** the deed rather than agreeing with
   * it: the eligible cohort's weights are not all the same figure, **or** every eligible weight is
   * zero (⚠ the second arm was added by the S4 adversarial review — an all-zero vector has no
   * normalisable deed reading at all, so per capita replaces it and pays out 100%, while the
   * identical record under `ORDERED`/`SHARED` excludes every member and retains everything). An
   * all-equal non-zero cohort normalises to the same equal shares, so no flag is owed there.
   *
   * A recorded Shart figure that vanishes without trace is the defect class this project keeps
   * paying for, so the run says so out loud rather than quietly ignoring it.
   *
   * // TODO(surface): "per capita ALWAYS" vs "deed weights govern where the deed explicitly
   * // allocates them" was never put to the product owner as its own question — they chose per
   * // capita over per stirpes, which is a different question. Until it is answered this flag is the
   * // honest position but not a stable one, and it is the single most likely source of a
   * // beneficiary dispute about a statement. (ADR-0009 open question 1.)
   */
  'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
  /**
   * A non-null `continuationStipulation` was recorded on an `ORDERED` or `SHARED` run, where this
   * engine does not consume it. Same reasoning as the flag above: a recorded Shart term that the
   * chosen path does not apply must be **visibly** not-applied, never silently dropped.
   *
   * Not raised on `NA_DIRECT_USE`, which short-circuits before Stage 2 reads either field.
   *
   * // TODO(surface): whether a deed can be BOTH al-aʿlā fa-l-aʿlā and ZUHUR_ONLY — i.e. whether the
   * // continuation term should also filter eligibility on those paths — is unanswered. If it should,
   * // this flag is marking a defect: a buṭūn descendant is being paid on an ORDERED deed that
   * // excluded them. (ADR-0009 open question 3.)
   *
   * ✓ **R7-d's WIDENING NO LONGER HANGS OFF THIS OPEN QUESTION — memo Q5, product owner 2026-08-17.** The
   * paragraph here read: *"on `ORDERED`/`SHARED`, where the term is carried and not consumed, the extinction
   * trigger is **not** widened either: a living descendant on a broken daughter line still holds the
   * reversion there … Consuming the term for the trigger while refusing to consume it for eligibility would
   * answer open question 3 in a code change, and would answer it in the direction that pays a charity. If
   * the owner later says the term binds on every order, this scoping comes out with it."* He said it: **one
   * trigger everywhere** — the continuation stipulation, not the entitlement order, defines whose line
   * counts. The scoping came out.
   *
   * ⚠ **Open question 3 is still OPEN, and the two are now cleanly separated.** The term decides *whether a
   * bloodline is over* on every order; it still does **not** decide *who is entitled among the living*
   * outside `LINEAGE_CONTINUATION`, which is what this flag reports. One forced consequence: on a run whose
   * reversion HAS triggered, a living descendant on an abandoned line is excluded
   * `BUTUN_LINE_NOT_CONTINUED` — because paying them beside the charity is R5, and I-R1 refuses it.
   */
  'CONTINUATION_STIPULATION_NOT_APPLIED',
  /**
   * **R7** · the recorded bloodline is over and the distributable went to the deed's مآل — the
   * endowment's ultimate taker(s).
   *
   * On the run itself and not merely in the trace, because this is the single most consequential state
   * change in a family endowment's life: the period in which a ذري waqf stops paying a family and
   * starts paying a charity. A reader of a stored run must not have to reconstruct that from the lines.
   *
   * Raised on the trigger as widened on **2026-08-11** — **no recorded descendant is living on a line
   * this deed CONTINUES** (R7-d; under `ZUHUR_AND_BUTUN`, and on the orders that do not consume the
   * continuation term, that is still "nobody living"). It is cross-checked by invariant `I-R1`, which
   * recomputes the extinction test independently and refuses the run if the flag and the register
   * disagree: the flag is checkable, not trusted.
   *
   * ⚠ Since the widening this flag can appear on a run whose register still holds **living blood
   * descendants** — a `ZUHUR_ONLY` deed whose survivors all sit on broken daughter lines. They are every
   * one EXCLUDED `BUTUN_LINE_NOT_CONTINUED` and hold `0n`, so `I-R1`'s universal mirror (no charity is
   * ever PAID beside a paid descendant) is untouched; but a consumer that reads this flag as "the family
   * is gone" will be wrong, and the run's trace names the survivors for that reason.
   */
  'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
  /**
   * **R7-d** · the deed records a reversion, **nobody** is entitled this period, and yet at least one
   * descendant of the waqif is still living **on a line this deed continues** — so the reversion did
   * **not** trigger and the whole distributable is retained.
   *
   * ⚠ **NARROWED 2026-08-11, and the name is now weaker than the meaning.** Asked whether *"the
   * bloodline is over"* means *no living descendant* or *no continuing line*, the product owner answered
   * **"no continuing line"**. So a living descendant is no longer *sufficient* to hold the reversion:
   * this flag's old headline example — under `ZUHUR_ONLY` every survivor on a broken daughter line —
   * is now the case that **TRIGGERS** it (`REVERSION_TO_ULTIMATE_TAKER_APPLIED`), because the ẓuhūr line
   * is over even though the family is not.
   *
   * What is left, and what the flag now means: **a line the deed continues is still going, and nobody on
   * it is entitled this period.** Reachable states —
   *
   *  · on `ORDERED`/`SHARED`, every living descendant carries a **zero deed weight**
   *    (`ZERO_STIPULATED_WEIGHT`). Their line continues perfectly well and a charity must not take;
   *  · on `ORDERED`, no ṭabaqa holds a living member the order will pay;
   *  · **not** reachable on `LINEAGE_CONTINUATION`: if a continuing line lives, the highest living head
   *    on it has only deceased ancestors above them and is therefore entitled, so the cohort is
   *    non-empty. The flag is not deleted for that — it is order-specific, not dead.
   *
   * Money waits, recoverably, instead of going to a charity irreversibly.
   *
   * **The name was KEPT rather than changed, deliberately.** It is under-specified but never false: on
   * every run that raises it, descendants ARE living. Renaming it would churn a published `RUN_FLAGS`
   * member, its acceptance tests and its (still owed) ar/en copy to sharpen a label whose statement is
   * true — whereas the sibling `REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED` exists because *that*
   * label would have been false. A code is split when it would otherwise lie, not when it could be more
   * precise.
   *
   * ✓ **"A LINE THE DEED CONTINUES" IS NOW MEASURED WITH THE DEED'S TERM ON EVERY ORDER — memo Q5,
   * product owner 2026-08-17.** The paragraph that stood here recorded a MEASURED honesty gap created by the
   * old scoping: on `ORDERED`/`SHARED` the continuing-line test collapsed to bare liveness, so a deed
   * RECORDING `ZUHUR_ONLY` raised this flag over a survivor whose only ancestor was a deceased DAUGHTER — a
   * line that term does not carry — and the trace sentence *"1 descendant is living on a line this deed
   * continues"* was contradicted by the deed's own term (money unaffected: 27,500,000 retained). The fix was
   * a qualifier plus `continuationTermApplied`; the RULING removed the cause, so that register now
   * **triggers** and this flag is not raised on it at all.
   *
   * ⚠ Two things survive unchanged. **(1)** ADR-0009 open question 3 is still open — the term still does not
   * bind ELIGIBILITY outside `LINEAGE_CONTINUATION`, and `CONTINUATION_STIPULATION_NOT_APPLIED` still says
   * so. **(2)** The ar/en copy E10/E12 owes this flag is still owed and must still be exact: the one case
   * where the sentence is measured on liveness alone is a deed recording a term the engine cannot
   * recognise, which `continuationTermApplied: 'false'` publishes.
   *
   * Raised only in that discriminating state: not on an ordinary run, and not on `NA_DIRECT_USE`, which
   * short-circuits before the clause is evaluated at all (`CONTINUATION_STIPULATION_NOT_APPLIED`'s
   * precedent). A flag that fires on every run tells a reader nothing.
   */
  'REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING',

  /**
   * The مآل clause did not trigger because **every recorded descendant is a `CATEGORY_ONLY`
   * placeholder** for people never individually enumerated — so the engine was never shown who exists
   * and cannot certify the family's extinction (R7-D1). The pool is retained.
   *
   * ⚠ **Distinct from {@link REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING} on purpose, and the two must
   * never be collapsed.** On this register no *continuing* line is recorded as living, so saying
   * "descendants are living on a line this deed continues" would put a false statement on a
   * beneficiary's BR-505 record and send a Nazir looking for a family the register does not contain. One
   * reason is *a continuing line is here and something else withholds*; this one is *we were never shown
   * the family*. The remedy differs too — the first waits for a death or a corrected weight, the second
   * waits for an enrolment.
   *
   * ⚠ **The placeholder hold SURVIVED the 2026-08-11 widening, owner-confirmed in the same breath** (a
   * register of unenumerated placeholders must *"hold the reversion"*). It is applied after and
   * independently of the continuing-line test and wins whatever that test says: a placeholder's
   * `lineageLink` is where the register hangs a branch, and it says nothing about the lines of the
   * people it stands for. Under `ZUHUR_ONLY` least of all, where the answer turns on each unrecorded
   * person's own chain of links.
   *
   * ⚠ Its ar/en copy (E10/E12, product-approved, never invented in a code change) must read as an
   * **incomplete register**, not as a disinheritance of either the charity or the family.
   */
  'REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED',
] as const;

export const TIMING_STATUSES = ['ON_TIME', 'OVERDUE'] as const;
/** D2: which calendar binds the post-FYE window. `Setting`-driven; flagged default `EARLIER_OF`. */
export const BINDING_CALENDARS = ['EARLIER_OF', 'GREGORIAN', 'HIJRI'] as const;
/** Which INSTRUMENT set the due date. Not `../dates`'s `DeadlineBasis` — see the header note. */
export const DEADLINE_BASES = ['SHART_SCHEDULE', 'POST_FYE_DEFAULT'] as const;
export const AUTHORITY_NOTICE_TYPES = ['CROSS_BORDER_DISBURSEMENT'] as const;
export const TRACE_STAGES = [
  'INPUT',
  'WATERFALL',
  'RESOLVER',
  'GATES',
  'TIMING',
  'ALLOCATE',
  'INVARIANTS',
] as const;
/**
 * §08's I1–I9, the corpus invariant, and ADR-0009's per-capita invariant. Reported in
 * `invariantsChecked`; an id absent from a run appears in the trace's `notAsserted` list, so
 * "checked" and "not applicable here" are distinguishable.
 *
 * `I-L1` is **per-capita equality** and is the only load-bearing proof that R3 was applied: on a
 * `LINEAGE_CONTINUATION` monetary run with at least one entitled line,
 * `max(entitledMinor) − min(entitledMinor) <= 1n` over the entitled lines. Exact, not approximate —
 * with equal weights every Hamilton remainder is equal, so the residual hands exactly one extra
 * halala to the `r` lowest ids and the spread cannot exceed one.
 */
export const INVARIANT_IDS = [
  'I1',
  'I2',
  'I3',
  'I4',
  'I5',
  'I6',
  'I7',
  'I8',
  'I9',
  'I-C1',
  'I-L1',
  /**
   * **R7** · reversion integrity, and it carries a claim that is stronger than the refusal it backs.
   *
   * On a run where the reversion **applied**: every entitled line is one of the ids the deed named as
   * مآل, every bloodline line is `EXCLUDED` holding `0n`, no line carries
   * `REVERSION_PENDING_LIVING_BLOODLINE`, and the paid lines' `basis.rule` is
   * `ULTIMATE_TAKER_MAAL_AL_WAQF`.
   *
   * On **any** run holding a charitable line at all — the universal mirror, and the load-bearing half:
   * **a charity is never paid a halala in the same run as a line the engine certified as a descendant of
   * the waqif.** That is R5 turned into a runtime assertion, and it is the strongest guarantee this design
   * can offer, because it holds whatever a future refusal is relaxed to.
   *
   * ✓ **THIS MIRROR IS WHAT CERTIFIES G-9 CLAUSE 3 FOR THE ULTIMATE TAKER'S LINE — memo Q1, product owner
   * 2026-08-17: "I-R1 is the guarantee."** Clause 3 ("ordered mode excludes lower tiers while upper
   * live") is certified in two halves that must not be confused: **I5 asserts tier exclusion over
   * DESCENDANTS**, and an untiered recorded ultimate taker is by design outside tier logic, so its line is
   * guaranteed by this mirror **plus** the taker's default exclusion
   * (`REVERSION_PENDING_LIVING_BLOODLINE`) instead. No comment anywhere may claim I5 covers the jiha line.
   *
   * ⚠ It covers *sharing* only —
   * mutation-measured, it refuses ESC-1's 13,750,000-halala diversion, and it deliberately says nothing
   * about a charity paid alone after the family is gone (that is the refusals' job). See
   * `invariants.assertReversionIntegrity` for the exact boundary rather than a rounder claim.
   *
   * The extinction test is **recomputed from `ctx.input`** — never read back from the resolution or from
   * the run flag — and a disagreement between the recomputation and the published flag is itself a
   * breach. `I-L1` is *not* asserted on a reverted run (per capita is the bloodline's rule and the
   * takers split by deed weight, so equality per head makes no claim about the line that took the
   * money); it goes into `notAsserted` and I-R1 stands in its place. Reporting an invariant that makes
   * no claim about the paid line is the R6-I5 defect, and it is not repeated here.
   */
  'I-R1',
] as const;

/**
 * The closed set of **refusal discriminators** carried in `DomainError.details.refusal` on every
 * `SHART_INCOMPLETE` this engine raises.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS, AND WHY IT IS NOT A `DOMAIN_ERROR_CODE`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 adds **eleven** new ways for the engine to refuse, and every one of them is
 * `SHART_INCOMPLETE` — correctly, because each is "the recorded conditions cannot resolve
 * entitlement" (CLAUDE.md binding rule 1). But a caller, a test and an operations screen all need to
 * know *which* condition, and a free-text `details` string is how a refusal ends up matched on prose
 * in one place and on a typo in another. So the discriminator is a closed vocabulary here.
 *
 * These are **NOT** `DOMAIN_ERROR_CODES` members and must not become any:
 *
 *  · The thrown code is what a caller switches on and what `errors.domain.*` renders. Splitting one
 *    condition across twelve codes would need twelve ar/en messages for one user-facing meaning, and
 *    CLAUDE.md's own rule is that one condition never gets two codes.
 *  · `packages/{auth,api,database,i18n}` all depend on the `DomainErrorCode` union; growing it by
 *    eleven engine-internal discriminators would make every consumer carry the engine's Stage-2
 *    vocabulary.
 *
 * ⚠ So these strings have **no ar/en copy and need none** — a surface renders
 * `errors.domain.SHART_INCOMPLETE` and shows the discriminator as diagnostic detail alongside it.
 * The distinction from {@link EXCLUSION_REASON_CODES} (which DOES owe Arabic copy) is that a refusal
 * is never shown to a beneficiary as the reason they were paid nothing: **no run is emitted at all**,
 * so there is no statement for it to appear on.
 *
 * The list is not enforced at the throw site by a type (`DomainErrorDetails` is
 * `Record<string, unknown>` and `errors.ts` must not import the distribution vocabulary — it is
 * imported *by* the engine). It is enforced by tests: every member must be reachable, and every
 * refusal the engine raises must carry a member of this list.
 *
 * ⚠ **TWENTY-SIX members as of R7** (18 → 26; the eight new ones are the مآل clause's). Always assert
 * the **specific** discriminator, never a bare `SHART_INCOMPLETE`: when a refusal moves — and R7 moved
 * three of them — a test that only checked the code silently stops proving anything.
 */
export const SHART_REFUSALS = [
  /* ── the Shart's own legibility (pre-existing behaviour, discriminator added) ───────────── */
  /** `entitlementOrder` is absent, padded, wrong-cased, or outside the four recognised orders. */
  'ENTITLEMENT_ORDER_UNRECOGNISED',
  /** An `ENTITLEMENT_ORDERS` member reached `entitlementRuleFor` with no rule mapped to it. */
  'ENTITLEMENT_RULE_UNMAPPED',
  /** A `CHARITABLE_JIHA` carries a generational ṭabaqa — the deed record contradicts itself (S3-D3). */
  'JIHA_TIERED',

  /* ── R5 · a waqf is either خيري or ذري … AND THE OWNER REVERSED THAT ON 2026-08-25 ────────── */
  /**
   * `waqfType === 'JOINT'`, unconditionally — including on a direct-use waqf.
   *
   * ⊕ **RENAMED IN S9-4a FROM `WAQF_TYPE_JOINT_NOT_POSSIBLE`, BY OWNER RULING, AND THE RENAME IS THE
   * WHOLE POINT OF THE CHANGE.** The owner reversed register item #11 on 2026-08-25, verbatim:
   * *"i was wrong earlier, a joint waqf is described as partially ذري and partially خيري."* Then, on
   * the consequence, verbatim selection **"a"** — *refuse-as-unsupported for now: rename/reword the
   * discriminators so they say "not supported", not "not possible"; joint support becomes a designed
   * epic with its own fiqh questions.*
   *
   * So the BEHAVIOUR is unchanged and the CLAIM is not: the engine still refuses every joint deed,
   * but as **SCOPE, not doctrine**. A discriminator asserting impossibility was making a legal claim
   * the owner has withdrawn — and a name is not cosmetic when it is the thing a Nazir reads and a
   * report quotes.
   *
   * ⚠ **ADR-0004 DISCIPLINE: THE OLD NAME IS REFUSED, NEVER REMAPPED.** It is gone from this closed
   * vocabulary, so every consumer that still spells it fails to build (`SHART_REFUSALS` is the source
   * of a `z.enum`), and a test asserts the old spelling appears nowhere in hand-written source. A
   * silent alias would leave the withdrawn legal claim in circulation under a new label.
   *
   * ⚠ **WHAT THIS RENAME DOES NOT DO:** joint support is a designed epic, not a rewording. Its open
   * questions are enumerated in the memo's fifth batch and stay open — the share basis between the
   * ذري and خيري portions, the S3-D2 lapse question (a lapsed family share inflating a jiha's fixed
   * share, currently DISSOLVED by this very refusal rather than fixed), and **I-R1's re-scoping**:
   * *"no charity is ever paid a halala in the same run as any descendant"* is FALSE BY DESIGN on a
   * true joint deed, and remains a correct invariant only OF THE CURRENTLY SUPPORTED SHAPES.
   */
  'WAQF_TYPE_JOINT_NOT_SUPPORTED',
  /**
   * A cohort holds both a `CHARITABLE_JIHA` and a `FAMILY` member, whatever the declared type.
   * Keyed on the COHORT, not the type — otherwise a mixed cohort re-enters as `FAMILY_DHURRI`.
   *
   * ⚠ **NARROWED BY R7 BY EXACTLY ONE EXEMPTION CLAUSE, and the re-reading is honest rather than
   * convenient.** R5 forbids a charity and a bloodline **sharing** one endowment's ghallah. This
   * refusal keyed on co-presence in the register because, before R7, co-presence *implied* concurrency.
   * R7 breaks that implication — a ذري deed may name both while their periods are strictly disjoint —
   * so as written it now over-reaches, and it would have made R7-a unimplementable for every properly
   * recorded family register (the primary deed shape: real named `FAMILY` descendants plus a مآل).
   *
   * The exemption is one predicate: `waqfType === 'FAMILY_DHURRI'` **and** a legible reversion clause
   * **and** every jiha in the cohort named in it. Everything else keeps firing unchanged — every
   * `PUBLIC_CHARITABLE` cohort holding a jiha beside a `FAMILY` member, every ذري cohort with a jiha
   * that is not a recorded taker, and every cohort whose reversion clause the validator rejected
   * (`assertReversionLegible` runs FIRST, so the exemption can never be granted on an unreadable
   * clause). What is **not** narrowed: it still keys on the COHORT and not on the declared type, so a
   * genuinely concurrent cohort cannot re-enter as `FAMILY_DHURRI`.
   */
  'COHORT_MIXES_CHARITABLE_AND_FAMILY',

  /* ── R2 · the continuation stipulation ──────────────────────────────────────────────────── */
  /** `LINEAGE_CONTINUATION` with a null/empty/padded/wrong-cased/unknown continuation term. */
  'CONTINUATION_STIPULATION_UNRECOGNISED',
  /**
   * A lineage order recorded over a **charity**, which has no descent from the waqif: either the
   * waqf is typed `PUBLIC_CHARITABLE`, or the cohort holds a `CHARITABLE_JIHA`.
   *
   * ⚠ The jiha arm was added by the S4 adversarial review. `COHORT_MIXES_CHARITABLE_AND_FAMILY`
   * catches a jiha standing *beside* family members; a `FAMILY_DHURRI` waqf whose cohort was a jiha
   * ALONE fell between the two refusals, and the jiha — outside the lineage graph, so with no
   * ancestors to test — passed the ẓuhūr filter vacuously and was paid 100% of the ghallah on a line
   * stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY`.
   *
   * ⚠ **R7 NARROWS THE JIHA ARM ONLY — and missing this would have silently killed R7-a on the PRIMARY
   * deed shape.** A ذري deed under `LINEAGE_CONTINUATION` (the *normal* order) with an ultimate-taker
   * jiha would otherwise refuse. The jiha arm now fires only for a jiha the reversion does **not** name;
   * the `PUBLIC_CHARITABLE` arm stays **absolute**. The reasoning: the lineage order resolves entitlement
   * BY DESCENT, and a recorded ultimate taker is not inside that descent — its entitlement comes from the
   * reversion clause, evaluated after and outside the frontier test — so the record no longer
   * contradicts itself. The payload this refusal closed stays closed by **two independent means**: the
   * taker is default-EXCLUDED until the reversion triggers, and a jiha-alone cohort now refuses
   * `REVERSION_WITH_NO_RECORDED_BLOODLINE` rather than paying anyone.
   */
  'LINEAGE_ORDER_ON_CHARITABLE_WAQF',

  /**
   * A `CHARITABLE_JIHA` recorded on a `FAMILY_DHURRI` (وقف ذري) waqf that the deed does **not** name as
   * an ultimate taker — whatever else the cohort holds and whatever the `entitlementOrder`.
   *
   * ⚠ **CONDITIONAL SINCE R7 (product owner, 2026-08-10), and NOT deleted.** This refusal used to be
   * unconditional, on the reasoning that "an ancestral waqf's beneficiaries are the waqif's descendants
   * and a charity is not one" — full stop. R7 makes that false as an absolute: a ذري deed **may** name a
   * charity as its مآل الوقف, receiving nothing while any descendant lives and taking the distributable
   * once the bloodline is over. So the refusal now fires on exactly the case R5 still forbids — a
   * charity that would be paid **concurrently** with a bloodline:
   *
   *  · `reversion === null` ⇒ refused. The deed records no مآل clause, so there is no reading on which
   *    this charity is an ultimate taker, and R7-c forbids inferring one from its mere presence.
   *  · a jiha not named in `reversion.ultimateTakerIds` ⇒ refused, **naming the unnamed ids**.
   *  · every jiha named ⇒ **permitted**, and default-EXCLUDED until the bloodline ends.
   *
   * ⚠ Added after adversarial review found **R6-D1**: `COHORT_MIXES_CHARITABLE_AND_FAMILY` requires a
   * `FAMILY` member to be present, so a family waqf recording its descendants as `CATEGORY_ONLY`
   * placeholders — a legitimate way to record a not-yet-enumerated generation — plus one jiha slipped
   * past every check. MEASURED: the charity was paid **27,500,000 of 27,500,000 halalas**, unflagged,
   * with invariant I5 still reported as checked; with a living ṭabaqa-1 descendant present it still
   * took 13,750,000 from the bloodline. Stated on the DECLARED TYPE, which is the one thing the two
   * neighbouring refusals cannot see. **R7 does not reopen that**: the same input is now either refused
   * (no clause) or computes the charity's share as **zero** (clause present, bloodline living) — the
   * diversion is not merely refused, it is priced at nothing.
   */
  'CHARITABLE_JIHA_ON_FAMILY_WAQF',

  /**
   * A beneficiary recording a `lineageLink` — the claim "I descend from the waqif" — on a
   * `PUBLIC_CHARITABLE` (وقف خيري) waqf, whatever the `entitlementOrder`.
   *
   * The mirror of {@link CHARITABLE_JIHA_ON_FAMILY_WAQF}, read from the other end: a charitable
   * waqf's beneficiaries are the **segment the waqif chose**, not the waqif's bloodline (R1/R5), so a
   * cohort carrying lineage edges makes one endowment both خيري and ذري.
   *
   * ✓ **A PRODUCT POSITION since memo Q6 (product owner, 2026-08-17)** — confirmed by name, together with
   * {@link TABAQA_ON_CHARITABLE_WAQF} and R6-F1's ذري-only scoping of the lineage-edge requirement (see
   * {@link LINEAGE_LINK_MISSING}). It shipped as engineering's fail-safe reading of R5; the reading was put
   * to the owner and confirmed, so the `TODO(surface)` in `resolver.ts` is replaced by the ruling. Standing
   * fiqh caveat: the owner is a practising Nazir, not Saudi counsel.
   *
   * ⚠ Added after an enumeration of 2,592 waqfType × order × cohort × lineage cells found **ESC-1**,
   * the last surviving route of the escape class. MEASURED under `ORDERED` on a خيري waqf whose
   * cohort was `CATEGORY_ONLY` members the engine had itself certified as descendants (derived
   * ṭabaqāt 1 and 2, cross-check passed) plus one jiha: the untiered jiha took **13,750,000 of
   * 27,500,000 halalas** beside a living ṭabaqa-1 descendant, and the **whole 27,500,000** once both
   * certified descendants were dead. `LINEAGE_ORDER_ON_CHARITABLE_WAQF` says nearly this but fires
   * only under `LINEAGE_CONTINUATION`; ESC-1 lived under `ORDERED`/`SHARED`.
   */
  'DESCENDANT_ON_CHARITABLE_WAQF',

  /**
   * Any beneficiary of a `PUBLIC_CHARITABLE` (وقف خيري) waqf recording a generational `tabaqa`.
   *
   * **Product-owner decision, 2026-08-03**, and ✓ **re-confirmed as a product position by memo Q6
   * (product owner, 2026-08-17)** after the register had recorded it as engineering's fail-safe reading of
   * R5. A charitable endowment's beneficiaries are the segment the waqif chose — the poor of a district, a
   * mosque — not descendants, so a ṭabaqa (طبقة, a generational tier of a bloodline) is not a fact that
   * can hold of them.
   *
   * ⚠ Closed the last reason G-9 clause 3 could not be reported closed. After R6-F1 made an
   * edge-free `CATEGORY_ONLY` placeholder legal on a خيري waqf, such a member could carry a `tabaqa`,
   * reach an `ORDERED` run and be decided by the GENERATIONAL rule on a waqf with no generations —
   * while `assertOrderedExclusion` never tested it, **I5 was still certified**, and its BR-505
   * statement read `ORDERED_LOWEST_LIVING_TABAQA`. Generalises {@link JIHA_TIERED} along the other
   * axis: a jiha may never be tiered on any type; on a خيري waqf nobody may. Together, a ṭabaqa now
   * exists only where a bloodline does.
   */
  'TABAQA_ON_CHARITABLE_WAQF',

  /* ── R1 · the lineage graph must be legible, integral and rooted at the waqif ───────────── */
  /** A `lineageLink` outside {`SON`, `DAUGHTER`}. Arrives as data (header rule 4), halts here. */
  'LINEAGE_LINK_UNRECOGNISED',
  /**
   * A `FAMILY` member with no `lineageLink` at all, on **every** order (R6, product owner 2026-08-03) —
   * or a `CATEGORY_ONLY` member with none **on a ذري waqf only**.
   *
   * ✓ That ذري-only scoping (R6-F1) is a **product position** since memo Q6 (product owner, 2026-08-17):
   * on a خيري deed eligibility does not come from descent, so an unnamed charitable segment needs no
   * fabricated bloodline. ⚠ Still open, and separately marked: whether an edgeless placeholder on a ذري
   * deed should refuse or be "excluded pending identification" (ADR-0009 open question 5).
   */
  'LINEAGE_LINK_MISSING',
  /** `parentId` or `lineageLink` on someone who cannot be a descendant (a jiha; a parentless edge). */
  'LINEAGE_EDGE_ON_NON_DESCENDANT',
  /** `parentId` names an id that is not among `input.beneficiaries`. */
  'LINEAGE_PARENT_UNKNOWN',
  /** A cycle in the parent graph, including the 1-cycle `parentId === id`. */
  'LINEAGE_CYCLE',
  /** An ancestor chain terminating at a beneficiary that is not itself in the lineage graph. */
  'LINEAGE_ROOTED_OUTSIDE_THE_WAQIF',
  /**
   * A supplied `tabaqa` disagrees with the derived lineage depth — **including `tabaqa: null` on a
   * recorded descendant.** Two sides that must agree, each testing the other.
   */
  'TABAQA_MISMATCHES_LINEAGE_DEPTH',
  /**
   * Two beneficiaries share an `id`, which makes `parentId` resolution ambiguous.
   *
   * ⚠ **Normally unreachable, and that is not a defect.** `assertInputConsistency` already refuses a
   * duplicate id at the contract door with `DISTRIBUTION_INPUT_INVALID`, and `parseDistributionInput`
   * is the only sanctioned way in. This discriminator covers the resolver being called directly on a
   * hand-built `DistributionInput` (which the test suite does constantly), where the ancestor walk
   * would otherwise read whichever duplicate a `Map` happened to keep. The pre-existing
   * `DISTRIBUTION_INPUT_INVALID` behaviour is NOT changed or inverted.
   */
  'BENEFICIARY_ID_DUPLICATED',

  /* ── R7 · مآل الوقف · the reversion clause must be LEGIBLE before anything relies on it ──── */
  /**
   * `reversion.kind` is outside {@link REVERSION_KINDS}.
   *
   * Arrives as a `z.string()` (header rule 4) precisely so it halts here. A deed may revert to the poor
   * of a city, to another waqf, to the Authority, or to the waqif's nearest relatives; this engine
   * implements **one** reading — the charitable ultimate taker the owner described on 2026-08-10 — and
   * any other recorded مآل must halt **by name** rather than be coerced into it (binding rule 1).
   */
  'REVERSION_KIND_UNRECOGNISED',
  /**
   * `reversion.ultimateTakerIds` is empty: a مآل clause naming nobody has no resolvable destination.
   *
   * Kept out of zod's `.min(1)` on purpose — this is a deed **incompleteness**, so it must carry
   * `SHART_INCOMPLETE` and this discriminator, not `DISTRIBUTION_INPUT_INVALID`.
   */
  'REVERSION_WITH_NO_ULTIMATE_TAKER',
  /** A named id is not among `input.beneficiaries`. Same failure shape as `LINEAGE_PARENT_UNKNOWN`. */
  'REVERSION_ULTIMATE_TAKER_UNKNOWN',
  /**
   * A named id whose `kind` is not `CHARITABLE_JIHA`.
   *
   * This is what stops *"name a descendant as the ultimate taker"* — which would pay a bloodline member
   * outside the frontier rule entirely, its verdict taken from the reversion ladder instead of from
   * their own line. That is a **new** escape, not a variant of an old one, and it is refused rather than
   * interpreted.
   */
  'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
  /**
   * An id repeated in `ultimateTakerIds`.
   *
   * Refused, never deduplicated: a repeated id would double-count in the weight vector, so it **moves
   * money**. Never repair a record that changes an amount.
   */
  'REVERSION_ULTIMATE_TAKER_DUPLICATED',
  /**
   * A reversion recorded on a `PUBLIC_CHARITABLE` (وقف خيري) waqf.
   *
   * A خيري waqf has no bloodline to end, so it has no مآل in this sense — and a cohort of inactive
   * `CATEGORY_ONLY` placeholders would otherwise satisfy "no living descendant on record" **vacuously**
   * and trigger a payout on a waqf that never had descendants. Closed structurally here rather than left
   * to the trigger's own guards.
   *
   * ⚠ **Claude's fail-safe reading of R5, not the owner's ruling** — the same status amendment D's
   * refusal had. TODO(surface): may a خيري deed record a reversion at all? If it may, this comes out.
   */
  'REVERSION_ON_CHARITABLE_WAQF',
  /**
   * A reversion clause with **zero certified descendants** on record.
   *
   * ∅ is *"not yet enrolled"*, not *"extinct"*: the engine cannot certify the extinction of a family it
   * has never been shown, and will not pay a charity because the data entry is incomplete. Measured over
   * the **certified** graph (`buildLineage`'s output), never over a `kind` filter — keying on `kind` is
   * the unrepaired proxy behind the whole escape class.
   *
   * ⚠ The operational cost is real and is engineering's call, not the owner's: an old endowment taken on
   * after its family died out must have its **deceased** descendants enrolled before it can be computed
   * at all. TODO(surface).
   */
  'REVERSION_WITH_NO_RECORDED_BLOODLINE',
  /**
   * The reversion triggered and **every** named taker's `stipulatedWeight` canonicalises to `'0'`.
   *
   * Refused rather than split equally (R7-e: per capita is the bloodline's rule, not a charity's), and
   * refused rather than allowed to fall through to `NO_ELIGIBLE_BENEFICIARIES` — which would hide an
   * unusable deed record behind an ordinary flag and retain the pool as though the deed were fine.
   */
  'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
] as const;

export type ReceiptClass = (typeof RECEIPT_CLASSES)[number];
export type CapitalSource = (typeof CAPITAL_SOURCES)[number];
export type WaqfClassification = (typeof WAQF_CLASSIFICATIONS)[number];
export type WaqfType = (typeof WAQF_TYPES)[number];
export type EntitlementOrder = (typeof ENTITLEMENT_ORDERS)[number];
export type ContinuationStipulation = (typeof CONTINUATION_STIPULATIONS)[number];
/** **R7** · the recognised مآل readings. One member today — see {@link REVERSION_KINDS}. */
export type ReversionKind = (typeof REVERSION_KINDS)[number];
export type LineageLink = (typeof LINEAGE_LINKS)[number];
export type BeneficiaryLine = (typeof BENEFICIARY_LINES)[number];
export type BeneficiaryKind = (typeof BENEFICIARY_KINDS)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type Residency = (typeof RESIDENCIES)[number];
export type FeeBasis = (typeof FEE_BASES)[number];
export type MaintenanceRuleKind = (typeof MAINTENANCE_RULE_KINDS)[number];
export type DisbursementSchedule = (typeof DISBURSEMENT_SCHEDULES)[number];
export type LineStatus = (typeof LINE_STATUSES)[number];
export type GateReasonCode = (typeof GATE_REASON_CODES)[number];
export type ExclusionReasonCode = (typeof EXCLUSION_REASON_CODES)[number];
export type EntitlementRule = (typeof ENTITLEMENT_RULES)[number];
export type RunFlag = (typeof RUN_FLAGS)[number];
export type TimingStatus = (typeof TIMING_STATUSES)[number];
export type BindingCalendar = (typeof BINDING_CALENDARS)[number];
export type DeadlineBasis = (typeof DEADLINE_BASES)[number];
/**
 * Barrel-safe alias for {@link DeadlineBasis}.
 *
 * `../dates/deadline.ts` exports a different type of the same name and `../index.ts` already
 * re-exports it. Export THIS name from `./index.ts` and from `../index.ts`; a bare `DeadlineBasis`
 * there is a duplicate-export compile error, and — worse if it ever resolved — two unrelated
 * vocabularies sharing one name on the package's public surface.
 */
export type DistributionDeadlineBasis = DeadlineBasis;
export type AuthorityNoticeType = (typeof AUTHORITY_NOTICE_TYPES)[number];
export type TraceStage = (typeof TRACE_STAGES)[number];
export type InvariantId = (typeof INVARIANT_IDS)[number];
/** The `details.refusal` discriminator on a `SHART_INCOMPLETE`. See {@link SHART_REFUSALS}. */
export type ShartRefusal = (typeof SHART_REFUSALS)[number];
/** A line's reason: a payability gate, an entitlement exclusion, or none. */
export type LineReasonCode = GateReasonCode | ExclusionReasonCode;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Input — receipts (D1: the corpus guard's provenance)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One period receipt with its income-vs-capital classification.
 *
 * `receiptClass` is a **`z.string()`, not an enum**, so an unclassified or unrecognised value
 * surfaces as `RECEIPT_UNCLASSIFIED` from `assertIncomeProvenance` (the code CLAUDE.md names)
 * rather than as a shape error.
 *
 * ⚠ OBLIGATION ON `assertIncomeProvenance` (waterfall.ts), stated here because the schema
 * deliberately cannot express it: `capitalSource` must be non-null when
 * `receiptClass === 'CAPITAL'` **and null when it is `'INCOME'`**. An INCOME receipt carrying
 * `capitalSource: 'ISTIBDAL_PROCEEDS'` is a self-contradictory record — corpus proceeds filed as
 * ghallah — and must be refused with `RECEIPT_UNCLASSIFIED`, not silently distributed. It cannot
 * be a discriminated union here because `receiptClass` must stay `z.string()` (rule 4), and it
 * cannot be a `superRefine` without turning the corpus verdict into a shape error with the wrong
 * code.
 */
export const receiptInputSchema = z
  .object({
    id: z.string().min(1),
    receiptClass: z.string(),
    amountMinor: nonNegativeMinorSchema,
    /** Required whenever `receiptClass === 'CAPITAL'`; must be null otherwise. */
    capitalSource: z.enum(CAPITAL_SOURCES).nullable().default(null),
  })
  .strict();

/**
 * Period revenue, declared **and** evidenced.
 *
 * `incomeMinor` is the caller's assertion of the distributable ghallah; `receipts` is the
 * provenance. `assertIncomeProvenance` requires them to agree exactly. Declaring both is the only
 * shape in which a caller that cannot show the classification is refused rather than trusted: a
 * bare `revenueMinor` (§08's sketch) is indistinguishable from sale or istibdal proceeds.
 */
export const revenueInputSchema = z
  .object({
    incomeMinor: nonNegativeMinorSchema,
    receipts: z.array(receiptInputSchema),
  })
  .strict();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Input — the Shart's money rules
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The ṣiyāna (صيانة) reserve rule. Reserved FIRST, before any operating cost, fee or distribution.
 *
 * A discriminated union rather than §08's optional-fields object, so `{ kind: 'FIXED' }` with no
 * amount cannot parse.
 */
export const maintenanceRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('FIXED'), amountMinor: nonNegativeMinorSchema }).strict(),
  z.object({ kind: z.literal('PERCENT'), ratePercent: ratePercentSchema }).strict(),
  z
    .object({
      kind: z.literal('TARGET_TOPUP'),
      targetBalanceMinor: nonNegativeMinorSchema,
      currentBalanceMinor: nonNegativeMinorSchema,
    })
    .strict(),
  /**
   * The **DEED** stipulates no maintenance reserve. A founder's condition, not an absence of one.
   * ⚠ Do NOT use this for a deed that simply says nothing about maintenance — that is `UNSET`.
   */
  z.object({ kind: z.literal('NONE') }).strict(),
  /**
   * The deed is silent and the **Nazir has recorded a discretionary percentage** for this endowment
   * (OQ-06). Same arithmetic as `PERCENT`, different authority — see `MAINTENANCE_RULE_KINDS`.
   *
   * ⚠ unverified — no percentage is suggested, defaulted or floored anywhere in this package. The
   * figure is the Nazir's, resolved from `Setting['distribution.maintenance.nazirDiscretionPercent']`
   * scoped to the endowment. A prudential minimum baked in here would be the engine exercising the
   * discretion the ruling gives to the trustee.
   */
  z
    .object({ kind: z.literal('NAZIR_DISCRETION_PERCENT'), ratePercent: ratePercentSchema })
    .strict(),
  /** Deed silent, nothing recorded. Zero reserve **plus** a flag. See `MAINTENANCE_RULE_KINDS`. */
  z.object({ kind: z.literal('UNSET') }).strict(),
]);

/**
 * The Nazir fee, set by the DEED (Nazarah Art. 11) — not by statute. Deducted at waterfall step 3
 * whatever its basis. `null` ⇒ the deed is silent ⇒ fee 0 + `AUTHORITY_FEE_DETERMINATION_PENDING`.
 *
 * ⚠ the rate is unverified — confirm vs primary law. This engagement's deed sets
 * `PERCENT_OF_REVENUE @ '10'` (customary ʿushr / عُشر).
 */
export const nazirFeeSchema = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('PERCENT_OF_REVENUE'), ratePercent: ratePercentSchema }).strict(),
  z.object({ basis: z.literal('PERCENT_OF_NET_INCOME'), ratePercent: ratePercentSchema }).strict(),
  z.object({ basis: z.literal('RETAINER'), fixedAmountMinor: nonNegativeMinorSchema }).strict(),
]);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Input — beneficiaries
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A legal entity that disburses a line (e.g. a charitable jiha). Triggers the licence gate. */
export const disbursingEntitySchema = z
  .object({
    name: z.string().min(1),
    licensed: z.boolean(),
    licenceExpiry: civilDateSchema.nullable(),
  })
  .strict();

/**
 * One beneficiary (mustahiq / مستحق) as the engine consumes them.
 *
 * No zod `.default()`s: §08 defaults `active` to `true`, `line` to `NA`, `category` to `null` and
 * `residency` to `DOMESTIC`. A defaulted `active` is a defaulted *vital status* — the sole input to the
 * ORDERED extinction test, **and, since R-FRONTIER, a fact read along the ANCESTOR WALK for every
 * lineage cohort** (see the field's own note) — and a defaulted `residency` silently routes a
 * cross-border payment as domestic. The caller states all five.
 *
 * ADR-0009's two additions — `parentId` and `lineageLink` — follow the same rule and have **no
 * `.default()` either.** Both are `.nullable()` but neither is optional, so the key must be present:
 * the caller states the lineage facts or the input does not parse. A defaulted `lineageLink` would be
 * a defaulted answer to "does this person's line continue?", which is a fiqh reading of the deed.
 *
 * **No `name` field, deliberately.** The result and its `computationTrace` are persisted and
 * hashed; a beneficiary name in either would put PII on the audit surface (AT-16). The lineage edge
 * ADR-0009 adds keeps that property: `parentId` is an **id**, so recording the family tree adds no
 * PII to the hashed trace.
 */
export const beneficiaryInputSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(BENEFICIARY_KINDS),
    /**
     * Vital/scope status. Death or exit is modelled as `false`; the resolver treats it as absent.
     *
     * ⚠ **THIS FIELD IS READ ALONG AN ANCESTOR WALK, NOT ONLY ON THE BENEFICIARY** — under
     * `LINEAGE_CONTINUATION` a beneficiary is entitled only if **every ancestor strictly between them
     * and the waqif is DECEASED**; a living ancestor holds the entitlement and their descendants wait
     * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, a **temporary** exclusion that reverses on that
     * ancestor's death). So one stale vital status moves an entire branch's money, and the caller owes
     * an accurate flag on **ancestors** as much as on payees. See `./resolver.ts`'s R-FRONTIER section.
     *
     * ⚠ **CORRECTED IN S4/E3 — THIS COMMENT WAS WRONG, AND WRONG IN THE DIRECTION THAT MOVES MONEY.**
     * It read, until 2026-08-13: *"Under `LINEAGE_CONTINUATION` this is read for the beneficiary
     * themselves and nobody else. An ancestor's `active` is never consulted: a dead parent, grandparent
     * or whole generation does not block a descendant (ADR-0009 R1). That is the substance of the
     * change, not an oversight."* That described ADR-0009 as the orchestrator worded it. **R-FRONTIER
     * (product owner, 2026-08-03) superseded it** — *"son A's child does not get since Son A is alive"*
     * — and `./resolver.ts` was rewritten to walk ancestors the same day, but this comment was not.
     * It is recorded rather than quietly replaced because it sat on the exact field S4 added a column
     * for (`Beneficiary.active`, migration 12): whoever mapped the column would have been told by the
     * contract that an ancestor's flag does not matter, and would have had no reason to keep an
     * ancestor's row accurate. **No behaviour changed in this correction; the code was already right.**
     */
    active: z.boolean(),
    /**
     * ṭabaqa (generational tier).
     *
     * ⚠ **AS OF ADR-0009 THIS IS A CROSS-CHECK, NOT AN INPUT THE ENGINE TRUSTS.** For any
     * beneficiary in the lineage graph the authoritative value is **DERIVED** from `parentId` depth,
     * and a supplied value that disagrees **HALTS** (`SHART_INCOMPLETE` /
     * `TABAQA_MISMATCHES_LINEAGE_DEPTH`) — including `tabaqa: null` on a recorded descendant, which
     * is a record that contradicts itself.
     *
     * It stays required-and-compared rather than being dropped because two sides that must agree,
     * each testing the other, is this repo's standing lesson — a single trusted side is how the
     * untiered-`FAMILY` member that took the whole pool (S3-D1) shipped.
     *
     * `null` only for a member outside the lineage graph: a charitable jiha (also refused a ṭabaqa by
     * `assertJihaNotTiered`), or a `CATEGORY_ONLY` placeholder — whose ṭabaqa remains **permitted and
     * undecided**, exactly as S3 left it.
     */
    tabaqa: z.number().int().positive().nullable(),
    /**
     * The lineage edge: this descendant's **parent within this waqf's beneficiary set**.
     *
     * `null` means **"a child of the waqif"** — the root of a line, derived depth 1. It does **NOT**
     * mean "unknown": a member of the lineage graph whose parent is unrecorded cannot be
     * eligibility-tested and is refused. Membership in the graph is decided by
     * `lineageLink !== null`, never by this field, precisely so that `parentId: null` has exactly one
     * meaning.
     *
     * The resolver refuses, rather than repairing, every way this graph can be invalid: an id not
     * present in `input.beneficiaries` (`LINEAGE_PARENT_UNKNOWN`), a cycle including a self-parent
     * (`LINEAGE_CYCLE`), a chain that terminates at something which is not the waqif's line
     * (`LINEAGE_ROOTED_OUTSIDE_THE_WAQIF`), and an edge on a beneficiary that cannot be a descendant
     * (`LINEAGE_EDGE_ON_NON_DESCENDANT`). Zod cannot express a cross-field reference, so all four
     * arrive here as data and halt with the discriminator that names them.
     *
     * // TODO(surface): the edge is scoped to THIS WAQF's beneficiary set, so the same person
     * // beneficiary of two endowments is two records with two parent edges that nothing keeps
     * // consistent. Whether the family tree belongs to the WAQF or to the WAQIF (one waqif may
     * // found several endowments) is E3/E4's to decide before the migration, and the answer changes
     * // whether `LINEAGE_PARENT_UNKNOWN` is an integrity failure or a scoping question.
     * // (ADR-0009 open question 9.)
     * //
     * // ⚠ S4/E3 UPDATE — THE MIGRATION LANDED AND ANSWERED THIS **STRUCTURALLY, NOT DELIBERATELY.**
     * // Migration 12 gives `Beneficiary.parentId` a COMPOSITE foreign key
     * // `([waqfId, parentId]) → ([waqfId, id])`, which makes a cross-endowment parent edge
     * // *unrepresentable* — i.e. the answer shipped is WAQF-SCOPED. It matches this engine's behaviour
     * // and it is the fail-safe direction, but it is a fiqh/scope answer delivered by a foreign key,
     * // and the same person beneficiary of two endowments is still two records with two edges. **This
     * // marker therefore STAYS**: the owner has not been asked, and a schema that makes one answer
     * // convenient has not made the question go away.
     */
    parentId: z.string().min(1).nullable(),
    /**
     * The fiqh link this descendant holds to their parent — to the **waqif** when `parentId` is
     * `null`. `'SON'` | `'DAUGHTER'`; `null` ⇒ not a descendant of the waqif at all.
     *
     * **This is an eligibility fact, not demographics.** It exists for exactly one computation —
     * `ZUHUR_ONLY`'s "is every ancestor strictly between the waqif and this person a son?" — is never
     * rendered as a person's gender, and no gate, statement field or report may read it for any other
     * purpose. See {@link LINEAGE_LINKS} for why the recorded fact is kept rather than pre-interpreted.
     *
     * A `z.string()`, **not** `z.enum(LINEAGE_LINKS)`, for header rule 4's reason: a mis-transcribed
     * deed fact must reach the resolver as DATA and halt with `SHART_INCOMPLETE` /
     * `LINEAGE_LINK_UNRECOGNISED`, not die as a shape error carrying `DISTRIBUTION_INPUT_INVALID`.
     *
     * // TODO(surface): there is no way to record "related but not by descent" — adoption, or a
     * // descendant through a line the waqif disinherited. Discovering such a beneficiary after this
     * // ships means either a migration or a mis-recorded fact, and the ZUHUR_ONLY test would
     * // silently answer whatever the mis-recording implied. (ADR-0009 open question 6.)
     */
    lineageLink: z.string().nullable(),
    line: z.enum(BENEFICIARY_LINES),
    branch: z.string().nullable(),
    /**
     * The deed-stipulated relative weight.
     *
     * ⚠ **NOT APPLIED on a lineage cohort (ADR-0009 R3).** The resolver publishes an effective weight
     * of `'1'` per eligible head; this figure survives untouched on `ResolvedBeneficiary.source`, is
     * named in the `computationTrace`, and raises
     * `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA`. Fully meaningful under `ORDERED`, `SHARED`, and for
     * a charitable waqf's allocations, which is why the field stays required.
     *
     * // TODO(surface): a lineage-cohort member whose recorded weight is `'0'` is now ELIGIBLE and
     * // paid an equal share, because weights are not applied — while under ORDERED/SHARED the same
     * // member is excluded `ZERO_STIPULATED_WEIGHT`. The two paths now disagree about the same
     * // recorded fact, and this one moves money to someone the deed's own figure gave nothing.
     * // (ADR-0009 open question 2; related to S3's open DEFECT-A3.)
     */
    stipulatedWeight: stipulatedWeightSchema,
    verificationStatus: z.enum(VERIFICATION_STATUSES),
    kycLastRefreshed: civilDateSchema.nullable(),
    /** The captured beneficiary category. Empty/`null` on a `CATEGORY_ONLY` line blocks payment. */
    category: z.string().nullable(),
    residency: z.enum(RESIDENCIES),
    disbursingEntity: disbursingEntitySchema.nullable(),
    /** The dedicated-account reference proceeds would move to. The engine records it; it never pays. */
    bankingRefForProceeds: z.string().nullable(),
  })
  .strict();

/**
 * **R7** · the deed's reversion clause — مآل الوقف, where the endowment goes once its beneficiary class
 * is over.
 *
 * `kind` is a **`z.string()`** and `ultimateTakerIds` is **unbounded**, both for header rule 4's reason:
 * a mis-transcribed or incomplete مآل is an unreadable FOUNDER'S CONDITION and must halt with
 * `SHART_INCOMPLETE` plus the discriminator that names it, not die as `DISTRIBUTION_INPUT_INVALID`. In
 * particular an **empty** `ultimateTakerIds` is deliberately legal to the schema and refused by the
 * resolver as `REVERSION_WITH_NO_ULTIMATE_TAKER`: "the deed names a reversion but nobody to take it" is
 * a statement about the deed, and `.min(1)` here would report it as a shape error.
 *
 * **Weights are NOT duplicated into this clause.** The takers' shares are their existing
 * `stipulatedWeight`s, which are already the meaningful figure for a charitable allocation (R7-e). One
 * figure, one place — two copies with money between them is a defect waiting to be written.
 */
export const reversionInputSchema = z
  .object({
    /** ⚠ `z.string()`, not `z.enum(REVERSION_KINDS)` — header rule 4. */
    kind: z.string(),
    /**
     * The beneficiary ids the deed names as مآل الوقف. Each must resolve to a recorded
     * `CHARITABLE_JIHA` in this run's cohort; the resolver refuses — never repairs — an id that is
     * unknown, not a charity, or repeated.
     */
    ultimateTakerIds: z.array(z.string().min(1)),
  })
  .strict();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Input — timing and policy
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The injected post-FYE deadline: **two independent dates**, plus the provenance of the window.
 *
 * `settingKey`, `months` and `unverified` mirror `../dates`'s `DeadlineWindow` discipline so the
 * figure's origin and its staleness travel into the result instead of being asserted in prose.
 * ⚠ the 3-month window is unverified — confirm vs primary law.
 */
export const deadlineInputSchema = z
  .object({
    gregorian: civilDateSchema,
    hijri: hijriDateSchema,
    settingKey: z.string().min(1),
    months: z.number().int().nonnegative(),
    unverified: z.boolean(),
  })
  .strict();

/**
 * Resolved configuration. **Every field is required — there is no `.default()` in this object.**
 * A `Setting` the caller failed to resolve must produce `SETTING_MISSING` upstream, never a coded
 * fallback (binding rule 3; `../settings.ts` "Fail closed").
 */
export const policyInputSchema = z
  .object({
    /** ⚠ unverified — `Setting kyc.refreshIntervalMonths`. Counted in Gregorian calendar months. */
    kycRefreshMonths: z.number().int().nonnegative(),
    /** `Setting distribution.rounding.unitMinor`. Must be `1n`; anything else is refused. */
    roundingUnitMinor: nonNegativeMinorSchema,
    /** ⚠ unverified (OQ-01) — `Setting distribution.rounding.method`. */
    roundingMethod: z.enum(ROUNDING_METHODS),
    /** ⚠ unverified (D2) — `Setting distribution.deadline.bindingCalendar`. */
    bindingCalendar: z.enum(BINDING_CALENDARS),
    /**
     * The verbatim ⚠ marker, carried into `unverifiedNotes`.
     *
     * NOT pinned to a constant, on purpose: `packages/domain` currently holds TWO different
     * markers — `../settings.ts`'s `UNVERIFIED_NOTE` ('⚠ unverified — confirm vs primary law',
     * byte-pinned against the database seed) and a longer one private to
     * `../dates/deadline.ts`. Pinning either here would reject a caller carrying the other. The
     * drift is reported to the product owner rather than silently resolved in this engine.
     */
    unverifiedNote: z.string().min(1),
  })
  .strict();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Input — the whole thing
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `MM-DD`. The regex alone admits `13-45`, so existence is checked against the ONE calendar.
 * The probe year is a leap year, so `02-29` — a real, if awkward, fiscal year end — stays legal.
 */
const fiscalYearEndSchema = z
  .string()
  .regex(/^\d{2}-\d{2}$/, 'fiscalYearEnd must be "MM-DD"')
  .refine((value) => {
    try {
      civilDate(`2000-${value}`);
      return true;
    } catch {
      return false;
    }
  }, 'fiscalYearEnd must be a real MM-DD day (checked against a leap year, so 02-29 is legal)');

export const distributionInputSchema = z
  .object({
    waqfId: z.string().min(1),
    classification: z.enum(WAQF_CLASSIFICATIONS),
    /**
     * ⚠ **`'JOINT'` is a REFUSED VALUE (ADR-0009 R5), not a removed member.** It parses — the enum is
     * unchanged and still matches `schema.prisma` member-for-member — and then halts at Stage 0 with
     * `SHART_INCOMPLETE` / `WAQF_TYPE_JOINT_NOT_SUPPORTED`. Deliberately a `z.enum` and not a
     * `z.string()`: unlike the Shart's free-text terms, an unrecognised waqf *type* is a data-model
     * failure rather than an unreadable founder's condition, and header rule 4 is about the latter.
     */
    waqfType: z.enum(WAQF_TYPES),
    /**
     * Deliberately `z.string()`, NOT `z.enum(ENTITLEMENT_ORDERS)` — see header rule 4. The resolver
     * narrows it with `parseEntitlementOrder`, which halts on anything unrecognised.
     *
     * Four recognised values as of ADR-0009 R4, with `LINEAGE_CONTINUATION` the normal deed shape and
     * `ORDERED` the explicitly stipulated exception. **No default, in code or in zod.**
     */
    entitlementOrder: z.string(),
    /**
     * The deed's continuation stipulation — *ẓuhūr wa buṭūn* / ظهور وبطون. `'ZUHUR_ONLY'` |
     * `'ZUHUR_AND_BUTUN'` (see {@link CONTINUATION_STIPULATIONS}).
     *
     * A `z.string().nullable()`, not `z.enum(CONTINUATION_STIPULATIONS)`, for header rule 4's reason:
     * a mis-transcribed deed term must halt with the refusal that names it, not with a shape error.
     *
     *  · `entitlementOrder === 'LINEAGE_CONTINUATION'` ⇒ must be non-null **and** exactly recognised,
     *    else `SHART_INCOMPLETE` / `CONTINUATION_STIPULATION_UNRECOGNISED`. `null`, `''`,
     *    `' ZUHUR_ONLY '` and `'zuhur_only'` all halt. **There is no default:** which lines a founder
     *    continued is not something code may choose (binding rule 1).
     *  · `ORDERED` / `SHARED` ⇒ **carried, not applied to ELIGIBILITY**, and flagged
     *    `CONTINUATION_STIPULATION_NOT_APPLIED` when non-null. A recorded Shart term is never silently
     *    dropped; whether it *should* filter eligibility on those paths is an open fiqh question (open
     *    question 3). ✓ It **is** applied to the reversion trigger on every order (memo Q5, product owner
     *    2026-08-17), so "not applied" here means eligibility and not "unused".
     *  · `NA_DIRECT_USE` ⇒ never read — Stage 2 short-circuits first (I7) — and no flag. ⚠ Validity checks
     *    still precede that short-circuit (memo Q7): the term is unread, but a self-contradicting record
     *    halts anyway.
     */
    continuationStipulation: z.string().nullable(),
    /**
     * **R7** · مآل الوقف — where the endowment goes once its beneficiary class is over.
     *
     * `null` ⇒ **the deed records no reversion**, and a charity may not be a beneficiary of a ذري waqf at
     * all (`CHARITABLE_JIHA_ON_FAMILY_WAQF`, unchanged for exactly that case). It does NOT mean "maybe" —
     * R7-c: the engine must not decide that a charity is the ultimate taker because it happens to be the
     * only beneficiary left, and must not decide a waqf has a reversion because a jiha is present.
     *
     * **Nullable but NOT optional, and no `.default()`** — the same rule ADR-0009 applied to
     * `parentId`/`lineageLink`, so the key must be present and the caller states the fact. A defaulted
     * reversion is a defaulted answer to *"where does this endowment go when the family ends?"*, which is
     * a fiqh reading of the deed, not a convenience (binding rule 1).
     *
     * · `PUBLIC_CHARITABLE` ⇒ a non-null clause is REFUSED (`REVERSION_ON_CHARITABLE_WAQF`).
     * · `NA_DIRECT_USE` ⇒ carried, **not applied**: Stage 2 short-circuits before the clause is
     *   evaluated, and no flag is raised (`CONTINUATION_STIPULATION_NOT_APPLIED`'s precedent). The
     *   short-circuit trace step says so out loud rather than dropping the term silently.
     */
    reversion: reversionInputSchema.nullable(),
    period: z.object({ start: civilDateSchema, end: civilDateSchema }).strict(),
    /** `MM-DD`. Echoed for the trace; the deadline itself is injected, never derived here. */
    fiscalYearEnd: fiscalYearEndSchema,
    /** `null` ⇒ the Shart is silent ⇒ the post-FYE default window binds. */
    disbursementSchedule: z.enum(DISBURSEMENT_SCHEDULES).nullable(),
    revenue: revenueInputSchema,
    operatingCostMinor: nonNegativeMinorSchema,
    maintenance: maintenanceRuleSchema,
    nazirFee: nazirFeeSchema.nullable(),
    beneficiaries: z.array(beneficiaryInputSchema),
    /** The injected clock. One instant, both calendars; cross-checked. */
    asOf: dualDateSchema,
    deadline: deadlineInputSchema,
    policy: policyInputSchema,
  })
  .strict();

/** What a caller may hand in: plain `string`s and `bigint`s, before branding. */
export type DistributionInputRaw = z.input<typeof distributionInputSchema>;
/** The parsed, branded input every stage function consumes. */
export type DistributionInput = z.output<typeof distributionInputSchema>;

export type ReceiptInput = z.output<typeof receiptInputSchema>;
export type RevenueInput = z.output<typeof revenueInputSchema>;
export type MaintenanceRule = z.output<typeof maintenanceRuleSchema>;
export type NazirFee = z.output<typeof nazirFeeSchema>;
export type BeneficiaryInput = z.output<typeof beneficiaryInputSchema>;
/** **R7** · the deed's مآل clause as the engine consumes it. */
export type ReversionInput = z.output<typeof reversionInputSchema>;
export type DisbursingEntity = z.output<typeof disbursingEntitySchema>;
export type DeadlineInput = z.output<typeof deadlineInputSchema>;
export type PolicyInput = z.output<typeof policyInputSchema>;
export type DualDateInput = z.output<typeof dualDateSchema>;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Output
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One trace step as a stage emits it, before the engine numbers it.
 *
 * Structured rather than §08's bare `string`, for two reasons: the trace is HASHED, so a prose
 * copy-edit would otherwise invalidate every historical run hash; and the official statement is
 * Arabic (NFR-01), which needs a `code` to render from, not English prose. `message` is
 * developer-facing English, exactly like `DomainError.message`. **No PII — ids only, never names.**
 */
export interface TraceStep {
  readonly stage: TraceStage;
  readonly code: string;
  readonly message: string;
  /** Primitive-only detail. Money as a decimal string; never a bigint (it must survive JSON). */
  readonly data?: Readonly<Record<string, string>>;
}

/** A numbered trace step. `seq` is assigned once, in order, by the engine's trace builder. */
export interface TraceEntry extends TraceStep {
  readonly seq: number;
}

/**
 * The entitlement basis printed on the beneficiary's official Arabic statement (BR-505).
 *
 * ADR-0009 adds four fields so the statement can **show the walk** that decided the entitlement, not
 * merely assert its outcome: under lineage the reason a family member receives nothing is "your line
 * does not continue under this deed", and a beneficiary disputing that is entitled to see which
 * ancestor and which deed term produced it.
 *
 * ⚠ Every field here is inside the bytes `canonicalizeResult` hands the caller to hash, so this
 * interface growing is one of the reasons `ENGINE_VERSION` moved to `2.0.0` — and to `3.0.0` with R7,
 * which added a rule label this interface can carry and made `rule` vary between lines of one run.
 */
export interface LineBasis {
  /**
   * The generational tier. **DERIVED** from lineage depth for a graph member (the input's supplied
   * value is only its cross-check, and a disagreement halts); the recorded input value for a member
   * outside the graph. `null` when neither exists.
   */
  readonly tabaqa: number | null;
  readonly line: BeneficiaryLine;
  readonly branch: string | null;
  readonly kind: BeneficiaryKind;
  /**
   * The rule that decided THIS line.
   *
   * ⚠ **R7: this can now VARY WITHIN ONE RUN, for the first time.** On a run where the deed's reversion
   * triggered, the ultimate taker's line carries `ULTIMATE_TAKER_MAAL_AL_WAQF` while every other line
   * carries the order's rule, and run-level `result.entitlementRule` keeps the order's rule (the deed's
   * standing entitlement order did not change; its reversion clause took effect). A consumer that
   * assumed one rule per run — a statement template, a report grouping — is wrong as of `3.0.0`. (The
   * version is `4.0.0` since memo Q5/Q7, 2026-08-17; this property arrived in 3.0.0 and is unchanged.)
   */
  readonly rule: EntitlementRule;
  /**
   * NEW (ADR-0009) · the derived lineage depth, `1` = a child of the waqif. Stated **separately** from
   * `tabaqa` rather than folded into it: `tabaqa` is the deed/register's tier and may exist without a
   * graph, while this is what the engine actually computed the eligibility test over. `null` outside
   * the lineage graph.
   */
  readonly lineageDepth: number | null;
  /** NEW (ADR-0009) · the edge that placed them. `null` = a child of the waqif, or not a descendant. */
  readonly parentId: string | null;
  /**
   * NEW (ADR-0009) · the fiqh link the eligibility test read. `null` = not in the lineage graph.
   *
   * ⚠ Present so the *basis* is auditable, **not** as a demographic attribute. A statement or report
   * must not render it as the beneficiary's gender.
   */
  readonly lineageLink: LineageLink | null;
  /**
   * NEW (ADR-0009) · the deed term that decided it. `null` when the path did not consume one — i.e.
   * on `ORDERED`, `SHARED` and `NA_DIRECT_USE`, where a recorded term is instead reported as the
   * `CONTINUATION_STIPULATION_NOT_APPLIED` run flag.
   */
  readonly continuationStipulation: ContinuationStipulation | null;
}

/**
 * One output line.
 *
 * **No optional fields anywhere in the output** — every absent value is an explicit `null`. An
 * absent key and a `null` key serialize differently, and the result is canonicalized and hashed for
 * the Nazir's signature.
 */
export interface DistributionLine {
  readonly beneficiaryId: string;
  readonly status: LineStatus;
  /** The amount owed. Unchanged by any gate (I6) and zero on an EXCLUDED line. */
  readonly entitledMinor: Minor;
  /** `entitledMinor` as a percentage of distributable, fixed at 6 dp. Display only — never a base. */
  readonly sharePercent: string;
  readonly basis: LineBasis;
  readonly reasonCode: LineReasonCode | null;
  /** EVERY tripped gate, not only the binding one (§08 gate precedence). */
  readonly gateFlags: readonly GateReasonCode[];
  readonly bankingRefForProceeds: string | null;
}

/** Stage 1. Every intermediate is exposed so the deduction order is auditable, not inferred. */
export interface Waterfall {
  /** Gross ghallah = Σ INCOME receipts. Asserted equal to `revenue.incomeMinor`. */
  readonly revenueMinor: Minor;
  /** Σ CAPITAL receipts — asl. Reported so the corpus is *visible*, and in no total below (I-C1). */
  readonly capitalReceiptsMinor: Minor;
  readonly maintenanceReserveMinor: Minor;
  readonly operatingCostMinor: Minor;
  /** `revenue − reserve − operating` — the `PERCENT_OF_NET_INCOME` base. */
  readonly netIncomeMinor: Minor;
  readonly nazirFeeMinor: Minor;
  /** `null` when the deed is silent (fee held pending the Authority-determination path). */
  readonly nazirFeeBasis: FeeBasis | null;
  readonly distributableMinor: Minor;
}

export interface Totals {
  readonly paidMinor: Minor;
  readonly withheldMinor: Minor;
  readonly crossBorderMinor: Minor;
  /**
   * Distributable attached to NO line (SPEC CORRECTION — see the header). A withheld amount is
   * physically retained too, but it belongs to a named beneficiary and is in `withheldMinor`.
   */
  readonly retainedMinor: Minor;
  /** Σ `entitledMinor` over the entitled cohort. `+ retainedMinor == distributableMinor` (I2). */
  readonly entitledMinor: Minor;
  readonly excludedCount: number;
  readonly entitledLineCount: number;
  /** Halalas the Hamilton pass handed out above the floors. `0 ≤ residual < entitledLineCount` (I9). */
  readonly residualMinor: Minor;
}

/** Stage 4. Both calendars always, plus which one bound and why (D2). */
export interface Timing {
  readonly status: TimingStatus;
  readonly basis: DeadlineBasis;
  readonly deadlineGregorian: CivilDate;
  readonly deadlineHijri: HijriDate;
  /** `fromHijri(deadlineHijri)` — the single axis both deadlines are compared on. */
  readonly hijriDeadlineAsGregorian: CivilDate;
  readonly bindingCalendar: BindingCalendar;
  /** Which calendar actually bound. A tie under `EARLIER_OF` resolves to `GREGORIAN`. */
  readonly boundBy: 'GREGORIAN' | 'HIJRI';
  readonly bindingDeadlineGregorian: CivilDate;
  /** Calendar days from `asOf` to the binding deadline. Negative when overdue. */
  readonly daysUntilDeadline: number;
  readonly asOf: DualDateInput;
  readonly settingKey: string;
  readonly months: number;
  /** The ⚠ marker, or `null` if the window has been confirmed against primary law. */
  readonly unverifiedNote: string | null;
}

/**
 * A notice the caller owes the Awqaf Authority as a consequence of this run.
 *
 * Emitted only where the notice obligation is actually triggered — a cross-border line whose binding
 * status is `CROSS_BORDER_PENDING`. A line that is withheld for KYC keeps `CROSS_BORDER_PENDING` in
 * its `gateFlags` (the routing requirement is not lost) but produces no notice, because notifying
 * the Authority of a disbursement that is not happening is a mis-filing. ⚠ SURFACED, NOT RESOLVED:
 * whether Nazarah Art. 10(7) attaches the notice at the point of ENTITLEMENT or of PAYMENT is a
 * question of Saudi law for counsel — verify, may be stale (confirm vs primary law).
 */
export interface AuthorityNotice {
  readonly type: AuthorityNoticeType;
  readonly beneficiaryId: string;
  /** The machine code. **This is the field a filing renders from** — see `reason` below. */
  readonly reasonCode: GateReasonCode;
  /**
   * ⚠ **DEVELOPER-FACING ENGLISH. DO NOT PUT THIS IN FRONT OF THE AUTHORITY OR A BENEFICIARY.**
   *
   * Exactly the same status as {@link TraceStep.message}, and called out separately because this
   * field is the one most likely to be rendered verbatim by mistake: an `AuthorityNotice` is
   * addressed to a Saudi regulator whose filings are Arabic (NFR-01), so a reader can reasonably
   * assume `reason` is the text to file. It is not. Render from `reasonCode` — which is one of the
   * five {@link GATE_REASON_CODES} and therefore already has ar/en copy under `errors.domain.*`.
   *
   * Like every other string in a `DistributionResult`, this one is inside the bytes
   * `canonicalizeResult` produces, so **editing it changes the stored run digest**. Treat it as
   * frozen copy, not as a comment.
   */
  readonly reason: string;
}

export interface DistributionResult {
  /** Pins the computation to a code version, so a replayed run can be compared like for like. */
  readonly engineVersion: string;
  readonly waqfId: string;
  readonly distributionType: 'MONETARY' | 'NA_DIRECT_USE';
  readonly classification: WaqfClassification;
  readonly waqfType: WaqfType;
  readonly entitlementOrder: EntitlementOrder;
  readonly entitlementRule: EntitlementRule;
  readonly period: { readonly start: CivilDate; readonly end: CivilDate };
  readonly waterfall: Waterfall;
  /** ALL lines — entitled and excluded — ordered by ascending `beneficiaryId` (determinism, I8). */
  readonly lines: readonly DistributionLine[];
  readonly totals: Totals;
  readonly timing: Timing;
  readonly authorityNotices: readonly AuthorityNotice[];
  readonly flags: readonly RunFlag[];
  readonly computationTrace: readonly TraceEntry[];
  readonly invariantsChecked: readonly InvariantId[];
  /** Every ⚠ unverified figure this run applied, so no surface can quote one without its caveat. */
  readonly unverifiedNotes: readonly string[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Parsing and cross-field consistency
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Parse an untrusted input into the branded `DistributionInput`.
 *
 * A `ZodError` is converted to `DomainError('DISTRIBUTION_INPUT_INVALID')`: callers switch on
 * domain codes, and a raw `ZodError` escaping a pure engine is an untyped failure mode. Semantic
 * checks (dual-date agreement, duplicate ids, the rounding unit) run in
 * {@link assertInputConsistency}, which this calls — so `parseDistributionInput` is the single
 * door in.
 */
export function parseDistributionInput(raw: unknown): DistributionInput {
  const result = distributionInputSchema.safeParse(raw);
  if (!result.success) {
    throw new DomainError(
      'DISTRIBUTION_INPUT_INVALID',
      `Distribution input does not satisfy the §08 contract: ${result.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
      { details: { issues: result.error.issues.map((issue) => issue.message) } },
    );
  }
  assertInputConsistency(result.data);
  return result.data;
}

/**
 * Cross-field checks zod cannot express, each raising the code §08/CLAUDE.md names.
 *
 * 1. `asOf.hijri` must equal `toHijri(asOf.gregorian)` — the cheapest proof that the caller used
 *    the one Umm al-Qura implementation and not a second one. (`deadline` is NOT cross-checked:
 *    its two halves are different days on purpose.)
 * 2. `beneficiaries[].id` must be unique — the split and the ascending-id tie-break both assume it,
 *    and §08 never says so. **ADR-0009 makes this load-bearing rather than merely tidy:**
 *    `parentId` resolution and the ancestor walk are keyed on the id, so a duplicate makes the
 *    lineage graph ambiguous — which parent a chain walks through would depend on `Map` insertion
 *    order. The code raised here is unchanged (`DISTRIBUTION_INPUT_INVALID`, because this is the
 *    contract door, not a reading of the Shart); the resolver additionally refuses duplicates with
 *    `SHART_INCOMPLETE` / `BENEFICIARY_ID_DUPLICATED` for callers that bypass this function.
 * 3. `revenue.receipts[].id` must be unique — added beyond the brief. The corpus guard reports the
 *    ids of the CAPITAL receipts it excluded, and a duplicated id makes that record ambiguous:
 *    an auditor cannot tell whether one receipt was counted twice or two were counted once.
 * 4. `policy.roundingUnitMinor` must be `1n`. Any other granularity is refused rather than ignored.
 * 5. `period.start <= period.end`.
 */
export function assertInputConsistency(input: DistributionInput): void {
  const expectedHijri = toHijri(input.asOf.gregorian);
  if (expectedHijri !== input.asOf.hijri) {
    throw new DomainError(
      'DISTRIBUTION_INPUT_INVALID',
      `asOf is not one instant in two calendars: ${input.asOf.gregorian} converts to ${expectedHijri}, not ${input.asOf.hijri}. A mismatched dual date means a second Hijri implementation is in play.`,
      {
        details: {
          gregorian: input.asOf.gregorian,
          expectedHijri,
          suppliedHijri: input.asOf.hijri,
        },
      },
    );
  }

  const seenBeneficiaries = new Set<string>();
  for (const beneficiary of input.beneficiaries) {
    if (seenBeneficiaries.has(beneficiary.id)) {
      throw new DomainError(
        'DISTRIBUTION_INPUT_INVALID',
        `beneficiary id "${beneficiary.id}" appears twice. Ids must be unique: the split, the residual tie-break and the statement all key on them.`,
        { details: { beneficiaryId: beneficiary.id } },
      );
    }
    seenBeneficiaries.add(beneficiary.id);
  }

  const seenReceipts = new Set<string>();
  for (const receipt of input.revenue.receipts) {
    if (seenReceipts.has(receipt.id)) {
      throw new DomainError(
        'DISTRIBUTION_INPUT_INVALID',
        `receipt id "${receipt.id}" appears twice. The corpus guard reports the ids it excluded (I-C1); a duplicated id makes that record unauditable.`,
        { details: { receiptId: receipt.id } },
      );
    }
    seenReceipts.add(receipt.id);
  }

  if (input.policy.roundingUnitMinor !== minorOf(1n)) {
    throw new DomainError(
      'SETTING_INVALID',
      `distribution.rounding.unitMinor is ${String(input.policy.roundingUnitMinor)}; this engine allocates at the halala (1). Refusing rather than silently ignoring a configured granularity.`,
      { details: { roundingUnitMinor: String(input.policy.roundingUnitMinor) } },
    );
  }

  if (compareCivilDates(input.period.start, input.period.end) > 0) {
    throw new DomainError(
      'DISTRIBUTION_INPUT_INVALID',
      `period.start ${input.period.start} is after period.end ${input.period.end}.`,
      { details: { start: input.period.start, end: input.period.end } },
    );
  }
}

/**
 * Validate a `DistributionResult` (for tests, and for a caller round-tripping a persisted run).
 *
 * Two structural facts, both of which a persisted run must still satisfy years later:
 * one line per beneficiary, and lines in ascending `beneficiaryId` order. The ordering is not
 * cosmetic — the residual tie-break is defined in terms of it (I9), and `canonicalizeResult` is
 * only stable if the array order is (I8).
 */
export function assertResultShape(result: DistributionResult): DistributionResult {
  if (result.lines.length !== new Set(result.lines.map((line) => line.beneficiaryId)).size) {
    throw new DomainError(
      'DISTRIBUTION_INVARIANT_BREACH',
      'result contains two lines for one beneficiary.',
    );
  }

  for (let index = 1; index < result.lines.length; index += 1) {
    const previous = result.lines[index - 1];
    const current = result.lines[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      compareBeneficiaryIds(previous.beneficiaryId, current.beneficiaryId) >= 0
    ) {
      throw new DomainError(
        'DISTRIBUTION_INVARIANT_BREACH',
        `result lines are not in ascending beneficiaryId order ("${previous.beneficiaryId}" before "${current.beneficiaryId}"). The residual tie-break (I9) and the canonical serialization (I8) both depend on that order.`,
        { details: { previous: previous.beneficiaryId, current: current.beneficiaryId } },
      );
    }
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Small shared helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Total order on beneficiary ids.
 *
 * **Never `localeCompare`** — its ordering depends on the host's ICU data, which would make the
 * residual tie-break, and therefore a payout, host-dependent. UTF-16 code-unit order is fixed.
 */
export function compareBeneficiaryIds(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** `entitledMinor` as a percentage of distributable at a fixed 6 dp. `'0.000000'` when nil. */
export function sharePercentOf(entitledMinor: Minor, distributableMinor: Minor): string {
  if (distributableMinor === minorOf(0n)) {
    return new ContractDecimal(0).toFixed(SHARE_PERCENT_SCALE);
  }
  return new ContractDecimal(entitledMinor.toString())
    .times(100)
    .dividedBy(new ContractDecimal(distributableMinor.toString()))
    .toFixed(SHARE_PERCENT_SCALE, Decimal.ROUND_HALF_UP);
}

/** Narrow an untrusted string to a run flag (for a persisted run read back). */
export function isRunFlag(value: unknown): value is RunFlag {
  return typeof value === 'string' && (RUN_FLAGS as readonly string[]).includes(value);
}

/** Re-export so downstream modules take the rounding vocabulary from one place. */
export type { RoundingMethod };
