/**
 * `distribution/reversion-adversarial.test.ts` — an attack on **R7's TIMING**: مآل الوقف.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `resolver.test.ts` and `engine.test.ts` specify R7. This file assumes the timing is subtly wrong
 * and hunts the seam. There is exactly one thing R7 must never do:
 *
 *  · **let a charity take ghallah that belongs to a LIVING bloodline** — the concurrent payment R5
 *    forbids, measured at 13,750,000 halalas of 27,500,000 in R6-D1/ESC-1; or
 *  · **strand a family endowment's income when the line has genuinely ended** — the mirror failure,
 *    where a deed's مآل exists and the money sits.
 *
 * Everything here drives behaviour through `runDistribution` / `resolveEntitlement` /
 * `assertReversionIntegrity`. No assertion is about the shape of the source.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE UNDER ATTACK (product owner, 2026-08-10 · R7, reading A — WIDENED 2026-08-11 · R7-d)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A وقف ذري may record a charitable jiha as its **ultimate taker** (مآل الوقف). It receives
 * **nothing** while the bloodline is going, and takes the distributable **once the bloodline is over**.
 *
 * ⚠ **AND "OVER" MEANS NO CONTINUING LINE.** Asked directly whether it means *no living descendant* or
 * *no continuing line*, the product owner answered the second (2026-08-11): *"bloodline is over means no
 * continuing line."* A line continues through the descendants the deed's `continuationStipulation`
 * carries it through, so under `ZUHUR_ONLY` a waqif with only daughters can have living blood
 * descendants and **no continuing line** — the ẓuhūr bloodline is over while the family is not, and the
 * deed's مآل takes. ✓ **ON EVERY ENTITLEMENT ORDER since memo Q5 (product owner, 2026-08-17)** — the clause
 * that stood here, *"and on the orders that carry the term without consuming it, the test collapses to no
 * living descendant"*, described a scoping the owner has retired: the continuation stipulation, not the
 * entitlement order, defines whose line counts. It now collapses to *no living descendant* only under
 * `ZUHUR_AND_BUTUN`, or where the deed records no term the engine recognises. Measured over the CERTIFIED
 * lineage graph.
 *
 * Four states, and the middle two are the whole subject of this file:
 *
 *   | register | outcome | the taker's line |
 *   |---|---|---|
 *   | ≥1 living descendant on a **CONTINUING** line | `PENDING` | `EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0` |
 *   | 0 continuing, ≥1 recorded, **all ENUMERATED** | `APPLIED` | paid its **deed weight** share, `ULTIMATE_TAKER_MAAL_AL_WAQF` |
 *   | 0 continuing, ≥1 recorded, **any `CATEGORY_ONLY` placeholder** | `PENDING` (**R7-D1**) | nothing — extinction is not certifiable from a placeholder |
 *   | 0 recorded at all | refused | `REVERSION_WITH_NO_RECORDED_BLOODLINE` |
 *
 * ⚠ Row 3 is R7-D1's closure and rows 2 and 3 are ONE `kind` field apart — §7.6 asserts exactly that
 * delta, and §7.4 / §1.6 assert row 2 still works, on all three money orders. §7.7 asserts that row 3
 * wins over the widened trigger, which is the owner's ruling in the same breath.
 *
 * ⚠ **Row 2 can now hold LIVING blood descendants** — a `ZUHUR_ONLY` register whose survivors all sit on
 * broken daughter lines (§3). Every one of them is `EXCLUDED` holding `0n`, which is what keeps I-R1's
 * universal mirror true of a run that pays a charity in a period with living issue on the register.
 *
 * ⚠ Row 1 still does **not** say "≥1 descendant is ENTITLED", and that distinction is what the widening
 * did NOT erase: a continuing line can be alive with nobody entitled on it — a zero deed weight, a head
 * waiting behind a living ancestor, a gate. Those three are §3b, and each of them HOLDS the reversion.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THE MONEY FIGURES HERE WERE OBTAINED — BY HAND, IN HALALAS, NEVER COPIED FROM OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * One money shape throughout (`MAAL_MONEY`), deliberately the same total R6-D1 and ESC-1 were
 * measured at, so the before/after of R7 is directly comparable:
 *
 *     revenue                            40,000,000
 *     − ṣiyāna PERCENT '10'             − 4,000,000   (10% × 40,000,000)
 *     − operating                       − 4,500,000
 *     = net income                       31,500,000
 *     − ʿushr 10% **of revenue**        − 4,000,000   (⚠ set by THIS deed, Nazarah Art. 11 —
 *                                                       verify: may be stale, confirm vs primary law)
 *     = distributable                    27,500,000   (SAR 275,000.00)
 *
 * I1 by hand: 4,000,000 + 4,500,000 + 4,000,000 + 27,500,000 = 40,000,000 ✓
 *
 * Every split used below, derived by hand:
 *
 *   | subject | arithmetic | result |
 *   |---|---|---|
 *   | 1 taker, weight 10 | 27,500,000 × 10/10 | 27,500,000, residual 0 |
 *   | 2 takers, 70/30 | 27,500,000 × 70/100 = 19,250,000; × 30/100 = 8,250,000 | Σ 27,500,000, residual 0 |
 *   | 2 takers, 1/2 | exact 9,166,666.66… / 18,333,333.33…; floors 9,166,666 + 18,333,333 = 27,499,999 | residual **1** to the larger remainder (.666 > .333) ⇒ **9,166,667 / 18,333,333** |
 *   | 1 living head | 27,500,000 × 1/1 | 27,500,000 |
 *   | 2 living heads (per capita) | 27,500,000 ÷ 2 | 13,750,000 each, residual 0 |
 *   | 3 living heads (per capita) | 27,500,000 ÷ 3 ⇒ floor 9,166,666 ×3 = 27,499,998 | residual **2** ⇒ ascending ids +1 ⇒ 9,166,667 / 9,166,667 / 9,166,666 |
 *
 * **13,750,000 is the number to watch.** It is what R6-D1/ESC-1 diverted from a living ṭabaqa-1
 * descendant, and it is exactly half of 27,500,000 — which is what an escaped taker at equal deed
 * weight would take beside one living head. Every taker below carries weight `'10'`, the same as the
 * descendants, so an escape shows up as that figure rather than only as a reason code.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FINDING THIS FILE FOUND — §7 · R7-D1 · ✓ CLOSED (the money) · ⚠ R7-D2 open (the contract)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **R7-D1 · the extinction trigger read an UNENUMERATED `CATEGORY_ONLY` placeholder's `active: false`
 * as evidence that a family is dead, and paid the charity on it.**
 *
 * MEASURED (§7): a `FAMILY_DHURRI` register whose ONLY recorded descendants are `CATEGORY_ONLY`
 * placeholders (*"descendants of Branch A not yet enrolled"*, real lineage edges, derived ṭabaqāt
 * 1 → 2, `active: false`) plus one named ultimate taker paid that charity
 * **27,500,000 of 27,500,000 halalas**, flag `REVERSION_TO_ULTIMATE_TAKER_APPLIED`, with `I-R1`
 * reported as checked. **That is R6-D1's measured payload restored to the halala** — the same
 * cohort `r6-adversarial.test.ts` §2 refuses `CHARITABLE_JIHA_ON_FAMILY_WAQF` — one `reversion`
 * field later.
 *
 * It was a fail-OPEN gap and the engine's own principle answered it:
 * `REVERSION_WITH_NO_RECORDED_BLOODLINE` refuses ∅ because *"the engine cannot certify the extinction of
 * a family it has never been shown"*, and a placeholder is by construction a family it has not been
 * shown. The design had closed exactly this route on the **خيري** side (`REVERSION_ON_CHARITABLE_WAQF`,
 * whose stated rationale is that *"a cohort of inactive CATEGORY_ONLY placeholders would otherwise
 * satisfy 'no living descendant on record' VACUOUSLY"*) — i.e. on the one waqf type where a reversion is
 * refused anyway. On `FAMILY_DHURRI`, the only type where a reversion is legal, the identical hazard was
 * live.
 *
 * **✓ FIXED in `resolver.reversionOutcome`** — the principle, in one line:
 *   *a placeholder is sound evidence FOR a living bloodline, and no evidence at all AGAINST one.*
 * Any recorded descendant that is a placeholder ⇒ the outcome is `PENDING`, carrying
 * `unenumeratedBloodlineIds`, even when nobody living is on record. §7.3 is the control that proves the
 * placeholder was doing the work; §7.4 and §7.6 are the over-broadness checks — an ENUMERATED extinct
 * family still triggers it, on all three orders, and the hold is exactly one `kind` field wide.
 *
 * ⚠⚠ **R7-D2 · THE FIX IS HALF-LANDED, AND §7.1 / 7.2 / 7.5 ARE RED BECAUSE OF IT.**
 * `invariants.independentReversionState` still recomputes `applied` as *"a clause, a non-empty register,
 * nobody living"* — it was not brought onto the fix — so on exactly this register the resolver and the
 * invariant disagree, `I-R1`'s flag cross-check fires, and the run is refused
 * `DISTRIBUTION_INVARIANT_BREACH` instead of retaining the pool and saying why. **No halala moves**, so
 * R7-D1's money claim holds; the *contract* does not. `invariants.ts` is not this file's to edit, so the
 * three cases assert the intended outcome and are left red. §7's own banner has the full argument.
 *
 * ⚠ Still unasked (`TODO(surface)` in `resolver.ts`): the owner has never been told what an inactive
 * placeholder means. *"This branch is closed"* and *"this placeholder is not in force"* are currently the
 * same record, and paying a charity on the strength of the second is what the fix refuses.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED — nine mutations applied, the RED tests RECORDED (not predicted), each file
 * restored by re-editing and its sha256 re-checked
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `resolver.ts`, sha256 `243ae5e3…c814` before and after every cycle:
 *
 *  | mutation | RED here |
 *  |---|---|
 *  | `ultimateTakerVerdict`: drop the `outcome.kind !== 'APPLIED'` rung — the taker's DEFAULT EXCLUSION, which is R6-D1/ESC-1's whole payload | **17 of 36** — all of §1, §3, §4.1–4.3, §5.1, §5.6, §7.3 |
 *  | `reversionOutcome`: `livingBloodlineIds.length > 0` → `>= 0` (never trigger) | **20 of 36** — all of §2, §6, §7.1/7.2/7.4/7.5, §1.6, §3.5, §4.1, §4.4, §5.5, §5.6 |
 *  | `reversionOutcome`: `active === true` → `=== false` (invert vital status) | **30 of 36** |
 *  | the effective-weight ternary: drop `!isTaker`, so a taker on a LINEAGE cohort takes `PER_CAPITA_WEIGHT` | §2.3, §2.5, §4.1, §6.1–6.4 |
 *  | `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` raised unconditionally on `PENDING` | §3.4 **only** — which is what makes 3.4 the test that owns the flag's discrimination |
 *
 * **R7-D1's two mutations, run over the whole package after the fix landed** (`resolver.ts` sha256
 * `b8ec37de…85f1` before and after each cycle, restored by re-editing):
 *
 *  | mutation | recorded result |
 *  |---|---|
 *  | `reversionOutcome`: the placeholder check disabled (`if (false)`) — R7-D1 restored | **8 red**: §7.1/7.2/7.5 fail on the MONEY (`expected 27500000n to be 0n`, `'LINEAGE_CONTINUATION: 27500000'`) instead of on R7-D2 · P13.1's safety counter fires · P13's paired placeholder property fires · the grid's 16 breach cells → 0, its 8 payers → 24, its مآل census loses a key. **This is what makes §7's red a CONTRACT failure and not a money one: the same three tests fail differently with the fix and without it.** |
 *  | `reversionOutcome`: the hold made UNCONDITIONAL (`recordedBloodlineIds.length > 0`) — the over-broad fix | **57 red across 13 files**, including §7.4 and §7.6, `engine.test.ts` T1/T2/T3, AT-15's re-pointed case, the grid's enumerated-extinct 8, P12's refusal-reachability census and `frontier-adversarial` §11. The reversion working at all is load-bearing in 13 files, so "hold everything" cannot ship quietly. |
 *
 * And the GENERATOR, in both directions (`__tests__/arbitraries.ts` sha256 `773d3aaa…8fa2`):
 *
 *  | mutation | recorded result |
 *  |---|---|
 *  | `'WITH_PLACEHOLDER'` forces no index (`index === 999`) | P13.1 `composition 'WITH_PLACEHOLDER' produced a register with no placeholder in it` + P13's paired property `expected 0 to be greater than 0` |
 *  | `'ENUMERATED_ONLY'` forces no index | **8 red** — P13.1 `leaked a placeholder into the register`, plus the four P13 properties whose refusals are only reachable on a register that really does revert |
 *
 * ⚠ **One lesson recorded rather than smoothed over: the axis's coverage assertion needed two attempts.**
 * A *threshold* on "cases from the forced arm that got their shape" stayed green under the first
 * generator mutation, because a drawn register of 2 … 6 members bears a placeholder ~97% of the time
 * anyway — the forced arm and a lucky one are statistically indistinguishable. What discriminates them is
 * the **guarantee**, so P13.1 asserts the shape EXACTLY on every case and the counters only prove both
 * arms were drawn. A coverage minimum can be satisfied by the very accident it was written to exclude.
 *
 * `invariants.ts`, sha256 `d7974127…ddc7` before and after:
 *
 *  | mutation | RED here |
 *  |---|---|
 *  | claim 2 of `assertReversionIntegrity` (`isTaker && paid && !applied`) disabled | §4.2 only |
 *  | the universal mirror (claim 3) disabled | §4.3 only |
 *  | `flagged !== reversion.applied` → `===` (invert the flag cross-check) | **25 of 36** |
 *
 * ⚠ **ONE MUTATION SURVIVED, and it is recorded rather than papered over.** Replacing
 * `reversionOutcome`'s bloodline — `[...lineage.depthById.keys()]` — with a
 * `kind !== 'CHARITABLE_JIHA'` filter leaves all 36 tests GREEN. That is not a hole in this file: on
 * a `FAMILY_DHURRI` waqf the two sets are **extensionally equal on every legal input**, because R6's
 * pass 4 forces every `FAMILY` and `CATEGORY_ONLY` member into the graph and pass 3 keeps every jiha
 * out of it, and a reversion is refused on every other waqf type. So *"never key an eligibility fact
 * on `kind`"* is currently a defence-in-depth choice with **no observable behaviour**, and no test can
 * make it one without first making an unplaceable non-jiha member representable. Worth keeping (it is
 * the discipline that would survive R6 pass 4 being relaxed) — but it must not be *described* as
 * behaviourally load-bearing today, which is lesson 2.
 *
 * ⚠ **A TENTH MUTATION, RUN OVER THE WHOLE PACKAGE, ALSO SURVIVED — and that one is a finding.**
 * Deleting the jiha disjunct of `LINEAGE_ORDER_ON_CHARITABLE_WAQF` (leaving only its
 * `PUBLIC_CHARITABLE` arm) leaves **all 1642 tests in `packages/domain` green**, because on a ذري waqf
 * an unnamed jiha is already refused `CHARITABLE_JIHA_ON_FAMILY_WAQF` two checks earlier. See §5.3.
 *
 * ⚠ **AND ONE TEST OF MINE WAS GREEN FOR THE WRONG REASON** until it was rewritten — see §4.3. The
 * first version drove the mirror over a *pending* reverted run, where claim 2 fires first, so
 * deleting the mirror altogether left it passing. Recorded because it is lesson 4 happening inside
 * the file written to hunt for it.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import {
  parseDistributionInput,
  type DistributionInputRaw,
  type DistributionLine,
  type DistributionResult,
  type Minor,
  type ShartRefusal,
} from '../contract.js';
import { runDistribution } from '../engine.js';
import { assertReversionIntegrity, type InvariantContext } from '../invariants.js';
import { resolveEntitlement } from '../resolver.js';
import { canonicalizeResult } from '../trace.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Builders — invented data only, never `archive/raw-intake/`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];
type Continuation = 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN';
type MoneyOrder = 'LINEAGE_CONTINUATION' | 'ORDERED' | 'SHARED';

const ASOF_GREGORIAN = '2026-07-14';

/** ṣiyāna 10%, operating 4,500,000, ʿushr 10% of revenue ⇒ distributable 27,500,000. */
const MAAL_MONEY = {
  revenue: {
    incomeMinor: 40_000_000n,
    receipts: [{ id: 'rev-maal', receiptClass: 'INCOME', amountMinor: 40_000_000n }],
  },
  operatingCostMinor: 4_500_000n,
  maintenance: { kind: 'PERCENT', ratePercent: '10' },
  nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
} as const satisfies Partial<DistributionInputRaw>;

const DISTRIBUTABLE = 27_500_000n;
/** Half of it — what an escaped taker at equal deed weight takes beside ONE living head. */
const HALF = 13_750_000n;

/**
 * A recorded descendant. `tabaqa` must equal the derived depth or `buildLineage` refuses
 * (`TABAQA_MISMATCHES_LINEAGE_DEPTH`), so every tree below states its own depths and a description
 * that drifts from its tree cannot pass silently. Every payability field is clean and identical
 * across members, so no verdict here can move because of a gate.
 */
function person(
  id: string,
  depth: number,
  link: 'SON' | 'DAUGHTER',
  parentId: string | null,
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return {
    id,
    kind: 'FAMILY',
    active: true,
    tabaqa: depth,
    parentId,
    lineageLink: link,
    line: link === 'SON' ? 'ZUHUR' : 'BUTUN',
    branch: null,
    stipulatedWeight: '10',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: 'FAKE-IBAN-MAAL-FAM',
    ...overrides,
  };
}

/** A child of the waqif: depth 1, `parentId: null`, an EMPTY proper-ancestor chain. */
function child(
  id: string,
  link: 'SON' | 'DAUGHTER' = 'SON',
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return person(id, 1, link, null, overrides);
}

/**
 * A not-yet-enumerated generation, recorded as `CATEGORY_ONLY` **with a real lineage edge** — which
 * R6 requires of it on a ذري waqf, and which makes it a CERTIFIED member of the waqif's family tree.
 * `assertSingleWaqfNature`'s own comment calls family + placeholder *"a legitimate family waqf with
 * an unnamed descendant"*.
 */
function placeholder(
  id: string,
  depth: number,
  parentId: string | null,
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return person(id, depth, 'SON', parentId, {
    kind: 'CATEGORY_ONLY',
    category: 'descendants of Branch A not yet enrolled',
    bankingRefForProceeds: 'FAKE-IBAN-MAAL-PH',
    ...overrides,
  });
}

/**
 * A charitable jiha — licensed, KYC-fresh, and carrying **no lineage edge and no ṭabaqa**, which is
 * what makes it legal on a ذري waqf at all (`buildLineage` pass 3 refuses either field on a jiha,
 * `assertJihaNotTiered` refuses a ṭabaqa on any waqf type).
 *
 * ⚠ Deed weight `'10'`, deliberately equal to every descendant's: if it ever escaped its verdict
 * ladder beside one living head it would take exactly {@link HALF} — R6-D1/ESC-1's measured figure —
 * so the failure is visible as a number and not only as a reason code.
 */
function jiha(id: string, overrides: Partial<RawBeneficiary> = {}): RawBeneficiary {
  return {
    id,
    kind: 'CHARITABLE_JIHA',
    active: true,
    tabaqa: null,
    parentId: null,
    lineageLink: null,
    line: 'NA',
    branch: 'Charitable',
    stipulatedWeight: '10',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: null,
    residency: 'DOMESTIC',
    disbursingEntity: {
      name: 'Example Ultimate-Taker Jiha (fictional)',
      licensed: true,
      licenceExpiry: '2027-06-30',
    },
    bankingRefForProceeds: 'FAKE-IBAN-MAAL-J',
    ...overrides,
  };
}

/** The deed's مآل clause, naming these ids. */
function maal(...ultimateTakerIds: readonly string[]): DistributionInputRaw['reversion'] {
  return { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [...ultimateTakerIds] };
}

function makeRaw(
  beneficiaries: readonly RawBeneficiary[],
  overrides: Partial<DistributionInputRaw> = {},
): DistributionInputRaw {
  return {
    waqfId: 'waqf-maal-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    // Stated rather than inherited: a case that means to carry a clause supplies one in `overrides`,
    // and a case that means to prove the no-clause behaviour keeps this null visibly (R7-c).
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    ...MAAL_MONEY,
    beneficiaries: [...beneficiaries],
    asOf: { gregorian: ASOF_GREGORIAN, hijri: toHijri(civilDate(ASOF_GREGORIAN)) },
    deadline: {
      gregorian: '2027-03-31',
      hijri: '1448-10-22',
      settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
      months: 3,
      unverified: true,
    },
    policy: {
      kycRefreshMonths: 12,
      roundingUnitMinor: 1n,
      roundingMethod: 'LARGEST_REMAINDER_HALF_UP',
      bindingCalendar: 'EARLIER_OF',
      unverifiedNote: '⚠ unverified — confirm vs primary law',
    },
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Observers — always the ENGINE's own output, never a re-implementation
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `id → 'STATUS/reason:amount'` for every line. */
function statusesById(result: DistributionResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of result.lines) {
    out[line.beneficiaryId] =
      `${line.status}/${line.reasonCode ?? 'null'}:${String(line.entitledMinor)}`;
  }
  return out;
}

function amountOf(result: DistributionResult, id: string): bigint {
  const line = result.lines.find((entry) => entry.beneficiaryId === id);
  if (line === undefined) throw new Error(`no line for ${id}`);
  return line.entitledMinor as bigint;
}

function ruleOf(result: DistributionResult, id: string): string {
  const line = result.lines.find((entry) => entry.beneficiaryId === id);
  if (line === undefined) throw new Error(`no line for ${id}`);
  return line.basis.rule;
}

/** Every line that received a halala, whatever its payability status. */
function paidIds(result: DistributionResult): readonly string[] {
  return result.lines
    .filter((line) => (line.entitledMinor as bigint) !== 0n)
    .map((line) => line.beneficiaryId);
}

function expectRefused(input: DistributionInputRaw, refusal: ShartRefusal): { message: string } {
  try {
    runDistribution(input);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    // Never a bare SHART_INCOMPLETE: twenty-six refusals share that code, and a code-only assertion
    // passes against whichever check happens to fire first — which is how a suite goes green for the
    // wrong reason when a refusal moves earlier.
    expect(error.code).toBe('SHART_INCOMPLETE');
    expect(error.details).toMatchObject({ refusal });
    return { message: error.message };
  }
  expect.unreachable(`the run must be refused with ${refusal}`);
  throw new Error('unreachable');
}

/** Σ every line + retained, which must equal the distributable on every run (I2's own identity). */
function conserved(result: DistributionResult): bigint {
  const lines = result.lines.reduce((sum, line) => sum + (line.entitledMinor as bigint), 0n);
  return lines + (result.totals.retainedMinor as bigint);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §1 · CAN THE CHARITY TAKE EARLY? — every arrangement of one living descendant
 *
 * The attack: find any register holding a living descendant **on a line this deed continues** in which
 * the recorded ultimate taker receives a single halala. If any descendant is ENTITLED the taker must be
 * 0 — and it must be 0 even when nobody on the continuing line is entitled, which is R7-d's boundary and
 * §3b's subject. Every descendant in this section is a `SON` child of the waqif with an EMPTY ancestor
 * chain, so no walk can break their line at either continuation term and the widening leaves the whole
 * section unchanged; §3 is where a broken line is driven.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§1 · a recorded ultimate taker takes NOTHING while a descendant lives', () => {
  const TAKER = jiha('maal-j1');

  /** A straight chain `g1` (child of the waqif) → `g2` → … → `gN`, every link a SON. */
  function chainOf(depth: number): RawBeneficiary[] {
    const members: RawBeneficiary[] = [];
    for (let i = 1; i <= depth; i += 1) {
      members.push(person(`g${String(i)}`, i, 'SON', i === 1 ? null : `g${String(i - 1)}`));
    }
    return members;
  }

  function withActive(
    members: readonly RawBeneficiary[],
    aliveIds: readonly string[],
  ): RawBeneficiary[] {
    const alive = new Set(aliveIds);
    return members.map((member) => ({ ...member, active: alive.has(member.id) }));
  }

  function reverted(
    members: readonly RawBeneficiary[],
    overrides: Partial<DistributionInputRaw> = {},
  ): DistributionResult {
    return runDistribution(
      makeRaw([...members, TAKER], { reversion: maal('maal-j1'), ...overrides }),
    );
  }

  it('1.1 · exactly ONE living descendant, at every position of a depth-5 chain, on all three money orders', () => {
    // 15 cells. The living member's position changes which descendant is entitled and under which
    // rule — but never whether the charity is paid, which must be "not at all" in all 15.
    for (const order of [
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
    ] as const satisfies readonly MoneyOrder[]) {
      for (let position = 1; position <= 5; position += 1) {
        const alive = `g${String(position)}`;
        const result = reverted(withActive(chainOf(5), [alive]), { entitlementOrder: order });
        const cell = `${order}/alive=${alive}`;

        // The claim, as a number: not 13,750,000, not 1 — zero.
        expect(`${cell}: ${String(amountOf(result, 'maal-j1'))}`).toBe(`${cell}: 0`);
        expect(`${cell}: ${statusesById(result)['maal-j1'] ?? 'MISSING'}`).toBe(
          `${cell}: EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0`,
        );
        expect(
          `${cell}: ${result.flags.includes('REVERSION_TO_ULTIMATE_TAKER_APPLIED') ? 'FLAGGED' : 'not-flagged'}`,
        ).toBe(`${cell}: not-flagged`);

        // …and the whole 27,500,000 went to the ONE living descendant, whichever rule reached them.
        // Every order here has exactly one entitled head: LINEAGE gives the nearest living point of
        // the line, ORDERED the lowest living ṭabaqa, SHARED every living member.
        expect(`${cell}: ${String(amountOf(result, alive))}`).toBe(
          `${cell}: ${String(DISTRIBUTABLE)}`,
        );
        expect(`${cell}: ${String(result.totals.retainedMinor)}`).toBe(`${cell}: 0`);
      }
    }
  });

  it('1.2 · a living descendant WITHHELD by a gate is still ENTITLED — the charity gets nothing', () => {
    // The nastiest early-take shape: the family's only living member cannot be paid this period, so
    // there is 27,500,000 sitting unpayable next to a charity that would like it. Entitlement is not
    // payability (I6), so the taker stays at zero and the money stays with the family's line.
    const result = reverted([
      child('g1', 'SON', { active: true, verificationStatus: 'UNVERIFIED' }),
    ]);
    expect(statusesById(result)).toStrictEqual({
      g1: `WITHHELD/KYC_UNVERIFIED:${String(DISTRIBUTABLE)}`,
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    // Withheld, NOT retained and NOT redistributed: the halalas are still owed to g1.
    expect(result.totals.withheldMinor).toBe(DISTRIBUTABLE);
    expect(result.totals.retainedMinor).toBe(0n);
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  it('1.3 · a living descendant with a ZERO deed weight — entitled under lineage, excluded under SHARED, taker 0 in both', () => {
    // Two different family outcomes, one reversion outcome. Under LINEAGE per capita overrides the
    // deed vector (ADR-0009 R3), so g1 is a head and takes 27,500,000 × 1/1. Under SHARED a zero
    // weight EXCLUDES, so nobody is entitled and the pool is RETAINED — and the charity still takes
    // nothing, because g1's line CONTINUES whether or not he is entitled this period.
    //
    // ⚠ R7-d's answer (2026-08-11) did not move this case, and the reason it did not is the point: g1 is
    // a `SON` child of the waqif with an EMPTY proper-ancestor chain, so his line continues at either
    // continuation term. What changed is only the reason it holds — *a continuing line is alive*, not
    // *someone is alive*. §3b.1 is the same boundary generalised; §3 is the register that DID move.
    const lineage = reverted([child('g1', 'SON', { stipulatedWeight: '0' })]);
    expect(statusesById(lineage)).toStrictEqual({
      g1: `PAID/null:${String(DISTRIBUTABLE)}`,
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    // The deed weight was overridden, and the run says so rather than doing it silently.
    expect(lineage.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');

    const shared = reverted([child('g1', 'SON', { stipulatedWeight: '0' })], {
      entitlementOrder: 'SHARED',
    });
    expect(statusesById(shared)).toStrictEqual({
      g1: 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(shared.totals.retainedMinor).toBe(DISTRIBUTABLE);
    expect(shared.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
  });

  it('1.4 · a living descendant BLOCKED by a living ancestor — the ancestor takes it, not the charity', () => {
    // R-FRONTIER: g1 lives, so g2 waits. Someone IS entitled and it is g1. If the taker escaped its
    // ladder here it would split with g1 at equal deed weight — 13,750,000 each, the exact ESC-1
    // figure — so the assertion is g1 = 27,500,000 and not merely "the taker is excluded".
    const result = reverted([child('g1'), person('g2', 2, 'SON', 'g1')]);
    expect(statusesById(result)).toStrictEqual({
      g1: `PAID/null:${String(DISTRIBUTABLE)}`,
      g2: 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(amountOf(result, 'g1')).toBe(HALF + HALF);
  });

  it('1.5 · a living CATEGORY_ONLY placeholder blocks the reversion — a placeholder IS a certified descendant', () => {
    // The direction in which counting placeholders as bloodline is CORRECT, and it is load-bearing:
    // "descendants of Branch A not yet enrolled" being alive means the family is not over. §7 is the
    // same field read in the other direction, where it is not evidence at all — R7-D1, now closed. The
    // reason code is pinned here rather than only the amount, so this case cannot start passing because
    // of the placeholder HOLD while its own subject (a living bloodline) has stopped working.
    const result = reverted([placeholder('ph1', 1, null, { active: true })]);
    expect(statusesById(result)).toStrictEqual({
      ph1: `PAID/null:${String(DISTRIBUTABLE)}`,
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    // The engine certified it as a descendant at derived depth 1 — that is why it counts.
    expect(result.lines.find((line) => line.beneficiaryId === 'ph1')?.basis.lineageDepth).toBe(1);
  });

  it('1.6 · the FULL liveness truth table over a 3-member tree × 3 orders — paid iff nobody lives', () => {
    // 8 liveness states × 3 orders = 24 cells, enumerated rather than sampled. The claim is an IFF:
    // the taker is paid in exactly the one state where no member of the certified bloodline is
    // active, and in no other. A trigger that read "nobody entitled" instead of "nobody living"
    // would pay the charity in several of the other 21.
    const tree = [child('g1'), person('g2', 2, 'SON', 'g1'), child('g3', 'DAUGHTER')];
    const observed: string[] = [];
    for (const order of [
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
    ] as const satisfies readonly MoneyOrder[]) {
      for (let mask = 0; mask < 8; mask += 1) {
        const alive = tree.filter((_member, index) => (mask & (1 << index)) !== 0).map((m) => m.id);
        const result = reverted(withActive(tree, alive), { entitlementOrder: order });
        const takerPaid = amountOf(result, 'maal-j1') !== 0n;
        observed.push(
          `${order}/${alive.length === 0 ? 'none' : alive.join('+')}=${takerPaid ? 'PAID' : 'zero'}`,
        );
      }
    }
    // Exactly three cells say PAID — the all-dead state on each order — and they are named, not counted.
    expect(observed.filter((cell) => cell.endsWith('=PAID'))).toStrictEqual([
      'LINEAGE_CONTINUATION/none=PAID',
      'ORDERED/none=PAID',
      'SHARED/none=PAID',
    ]);
    expect(observed).toHaveLength(24);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §2 · CAN THE FAMILY BE PAID LATE, OR THE POOL STRANDED?
 *
 * The mirror failure. Once the bloodline is genuinely over the deed's مآل must fire, the whole
 * distributable must reach the taker(s) by their DEED weights, and no descendant may hold a halala.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§2 · once the recorded bloodline is over, the مآل fires and conserves exactly', () => {
  it('2.1 · every descendant dead at once ⇒ 27,500,000 to the taker, 0 to the family, residual 0', () => {
    const result = runDistribution(
      makeRaw(
        [
          { ...child('g1'), active: false },
          { ...child('g2', 'DAUGHTER'), active: false },
          jiha('maal-j1'),
        ],
        { reversion: maal('maal-j1') },
      ),
    );
    // By hand: one entitled taker, weight 10 over Σ 10 ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
    expect(statusesById(result)).toStrictEqual({
      g1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      g2: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'maal-j1': `PAID/null:${String(DISTRIBUTABLE)}`,
    });
    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.flags).not.toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(result.totals.residualMinor).toBe(0n);
    // The BR-505 label a charity's statement must carry — never the lineage rule (ADR-0009's defect).
    expect(ruleOf(result, 'maal-j1')).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    // …and the run-level rule still reports the deed's standing ORDER, which did not change.
    expect(result.entitlementRule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
  });

  it('2.2 · dead ACROSS generations — a depth-4 chain, every link deceased — fires the same way', () => {
    const chain = [1, 2, 3, 4].map((depth) =>
      person(`g${String(depth)}`, depth, 'SON', depth === 1 ? null : `g${String(depth - 1)}`, {
        active: false,
      }),
    );
    const result = runDistribution(
      makeRaw([...chain, jiha('maal-j1')], { reversion: maal('maal-j1') }),
    );
    expect(amountOf(result, 'maal-j1')).toBe(DISTRIBUTABLE);
    for (const depth of [1, 2, 3, 4]) {
      expect(amountOf(result, `g${String(depth)}`)).toBe(0n);
    }
    expect(conserved(result)).toBe(DISTRIBUTABLE);
  });

  it('2.3 · TWO takers split by their DEED weights — 70/30, never per capita', () => {
    // R7-e: per capita is the bloodline's rule and a charity is not a head of a bloodline. Unequal
    // weights are the only way to see the difference: an equal 10/10 pair would look identical either
    // way, which is exactly how a per-capita regression hides (the lesson `frontier-adversarial` paid
    // for on `PER_CAPITA_WEIGHT`).
    const result = runDistribution(
      makeRaw(
        [
          { ...child('g1'), active: false },
          jiha('maal-j1', { stipulatedWeight: '70' }),
          jiha('maal-j2', { stipulatedWeight: '30' }),
        ],
        { reversion: maal('maal-j1', 'maal-j2') },
      ),
    );
    // By hand: 27,500,000 × 70/100 = 19,250,000; 27,500,000 × 30/100 = 8,250,000;
    //          19,250,000 + 8,250,000 = 27,500,000 ✓ residual 0.
    expect(amountOf(result, 'maal-j1')).toBe(19_250_000n);
    expect(amountOf(result, 'maal-j2')).toBe(8_250_000n);
    expect(amountOf(result, 'maal-j1') + amountOf(result, 'maal-j2')).toBe(DISTRIBUTABLE);
    // ⚠ Per capita would have paid 13,750,000 each. Stated as the FAILING figure so the test cannot
    // be read as merely checking a sum.
    expect(amountOf(result, 'maal-j1')).not.toBe(HALF);
    // I-L1 must NOT be asserted on a reverted run (equal-per-head makes no claim about these lines);
    // I-R1 stands in its place.
    expect(result.invariantsChecked).not.toContain('I-L1');
    expect(result.invariantsChecked).toContain('I-R1');
  });

  it('2.4 · a مآل over an EMPTY family register is REFUSED — ∅ is "not enrolled", not "extinct"', () => {
    const refusal = expectRefused(
      makeRaw([jiha('maal-j1')], { reversion: maal('maal-j1') }),
      'REVERSION_WITH_NO_RECORDED_BLOODLINE',
    );
    expect(refusal.message).toContain('not yet enrolled');
    // The control that makes it a scoping rule and not a denial of service: enrol ONE deceased
    // descendant and the identical deed computes.
    const enrolled = runDistribution(
      makeRaw([{ ...child('g1'), active: false }, jiha('maal-j1')], { reversion: maal('maal-j1') }),
    );
    expect(amountOf(enrolled, 'maal-j1')).toBe(DISTRIBUTABLE);
  });

  it('2.5 · conservation is exact on every reverted arrangement — 1..6 dead descendants, 1..2 takers', () => {
    for (let dead = 1; dead <= 6; dead += 1) {
      for (const takerCount of [1, 2] as const) {
        const chain = Array.from({ length: dead }, (_unused, index) =>
          person(
            `g${String(index + 1)}`,
            index + 1,
            'SON',
            index === 0 ? null : `g${String(index)}`,
            { active: false },
          ),
        );
        const takers =
          takerCount === 1
            ? [jiha('maal-j1')]
            : [
                jiha('maal-j1', { stipulatedWeight: '1' }),
                jiha('maal-j2', { stipulatedWeight: '2' }),
              ];
        const result = runDistribution(
          makeRaw([...chain, ...takers], {
            reversion: maal(...takers.map((taker) => taker.id)),
          }),
        );
        const cell = `dead=${String(dead)}/takers=${String(takerCount)}`;
        expect(`${cell}: ${String(conserved(result))}`).toBe(`${cell}: ${String(DISTRIBUTABLE)}`);
        // Every halala reached a taker and none reached the family.
        expect(`${cell}: ${paidIds(result).join(',')}`).toBe(
          `${cell}: ${takers.map((taker) => taker.id).join(',')}`,
        );
        // I9's bound, stated here too: residual < entitled line count.
        expect(`${cell}: residual<${String(takerCount)}`).toBe(
          `${cell}: residual<${String(takerCount)}`,
        );
        expect(Number(result.totals.residualMinor as bigint)).toBeLessThan(takerCount);
      }
    }
  });

  it('2.6 · a DISSOLVED taker on a triggered run retains the pool — it is never redistributed to the dead family', () => {
    // The stranding case that is correct: the bloodline is over and the named charity no longer
    // exists. Nobody may be paid, so the whole 27,500,000 is retained — and in particular it does NOT
    // flow back to the deceased descendants, which is the failure a "redistribute the remainder"
    // shortcut would produce.
    const result = runDistribution(
      makeRaw([{ ...child('g1'), active: false }, jiha('maal-j1', { active: false })], {
        reversion: maal('maal-j1'),
      }),
    );
    expect(statusesById(result)).toStrictEqual({
      g1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'maal-j1': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
    });
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    // ⚠ MEASURED AND SURFACED, not endorsed: the run also carries
    // `REVERSION_TO_ULTIMATE_TAKER_APPLIED` while NOTHING reached the مآل. The flag names the
    // extinction state (which did occur) rather than a payment, and I-R1 cross-checks it against the
    // register — but a reader of `RUN_FLAGS` could take it for "the distributable went to the مآل".
    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §3 · R7-d ANSWERED — "the bloodline is over" means NO CONTINUING LINE
 *
 * ⚠ **INVERTED 2026-08-11.** Asked whether *"the bloodline is over"* means **no living descendant** or
 * **no continuing line**, the product owner answered: *"bloodline is over means no continuing line."*
 *
 * So this section's subject flipped without one input changing. Under `ZUHUR_ONLY` a waqif with only
 * daughters has living blood descendants whose line the deed does not continue: the ẓuhūr line is over
 * while the family is not, and the deed's مآل **TAKES**. What survives from the old section is the
 * distinction the widening did NOT erase — *no continuing line* is still not *nobody entitled this
 * period* — and that is now §3b, three boundaries deep.
 *
 * MEASURED BEFORE 2026-08-11 on the register below: taker **0**, retained **27,500,000**, flags
 * `NO_ELIGIBLE_BENEFICIARIES` + `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, taker's line
 * `REVERSION_PENDING_LIVING_BLOODLINE`. Every one of those is now the opposite.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§3 · INVERTED · a broken line ends the bloodline, and the مآل takes', () => {
  /** Waqif → `d` (DAUGHTER, deceased) → `c` (her living son). Under ZUHUR_ONLY `c`'s line stops. */
  const BROKEN_BUTUN = [{ ...child('d', 'DAUGHTER'), active: false }, person('c', 2, 'SON', 'd')];

  function run(continuation: Continuation): DistributionResult {
    return runDistribution(
      makeRaw([...BROKEN_BUTUN, jiha('maal-j1')], {
        reversion: maal('maal-j1'),
        continuationStipulation: continuation,
      }),
    );
  }

  it('3.1 · INVERTED · ZUHUR_ONLY · a LIVING descendant on a broken line ⇒ the taker takes 27,500,000 — was 0', () => {
    // ⚠ THE CASE THE OWNER'S ANSWER TURNS ON, and the input is unchanged from the measurement: the
    // waqif's deceased DAUGHTER and her LIVING son, under a deed that continues only through sons.
    // `c` is a blood descendant of the waqif and he is alive — and his line is not one this deed
    // carries, so no line continues and the recorded bloodline is over.
    //
    // By hand: 40,000,000 revenue − 4,000,000 ṣiyāna (10%) − 4,500,000 operating − 4,000,000 ʿushr
    // (10% of revenue) = 27,500,000 distributable. One entitled taker at deed weight '10' ⇒
    // 27,500,000 × 10/10 = 27,500,000, residual 0. Σ lines + retained = 27,500,000 + 0 ✓ (I2).
    const result = run('ZUHUR_ONLY');
    expect(statusesById(result)).toStrictEqual({
      d: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      // ⚠ The PERMANENT code, and that is what keeps R5 intact on a run that pays a charity while a
      // blood descendant of the waqif is alive: `c` holds 0n, so no descendant is *paid*, so I-R1's
      // universal mirror has nothing to fire on. A temporary code here would additionally be the wrong
      // sentence — nobody is waiting for anything under this deed.
      c: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      'maal-j1': `PAID/null:${String(DISTRIBUTABLE)}`,
    });
    expect(result.totals.retainedMinor).toBe(0n);
    expect(conserved(result)).toBe(DISTRIBUTABLE);
    expect(ruleOf(result, 'maal-j1')).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(result.flags).not.toContain('NO_ELIGIBLE_BENEFICIARIES');
    // The invariant that makes the above a check rather than a claim about itself.
    expect(result.invariantsChecked).toContain('I-R1');
  });

  it('3.2 · INVERTED · the trace names the LIVING survivor it decided the bloodline was over despite', () => {
    // ⚠ "The bloodline is over" is a startling sentence to print on a register that still holds a
    // living grandson of the waqif, so the run owes the reader his name. Before the inversion this
    // trace step was `REVERSION_NOT_TRIGGERED` carrying `openQuestion: 'R7-d — no living descendant
    // vs no continuing line'`; the question is answered, so the field is gone and the branch changed.
    const result = run('ZUHUR_ONLY');
    expect(result.computationTrace.some((entry) => entry.code === 'REVERSION_NOT_TRIGGERED')).toBe(
      false,
    );
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_TRIGGERED');
    expect(step?.data).toMatchObject({
      livingNonContinuingBloodlineIds: 'c',
      // ⚠ Was hardcoded `'0'` before the widening, which is exactly what made it unfalsifiable: a
      // triggered run could not previously carry a living descendant, so the field could never be
      // wrong. It can now, so it is asserted.
      livingBloodlineCount: '1',
      recordedBloodlineCount: '2',
      continuationStipulation: 'ZUHUR_ONLY',
    });
    // …and no stored run may claim the open question is still open.
    expect(JSON.stringify(result.computationTrace)).not.toContain(
      'no living descendant vs no continuing line',
    );
  });

  it('3.3 · THE CONTROL · ZUHUR_AND_BUTUN on the SAME register does NOT trigger — the term is read', () => {
    // ⚠ **THE SHARPEST PROOF THAT THE STIPULATION IS DOING THE WORK.** One deed term apart, same three
    // people, same vital statuses. Under `ZUHUR_AND_BUTUN` the daughter's line IS continued, so `c`
    // keeps the bloodline going: he is the living frontier and takes the whole 27,500,000, and the
    // charity waits. Under `ZUHUR_ONLY` no line continues and the charity takes it instead.
    //
    // If `continuesTheLine` ever stopped reading the term — collapsing to `active` — this pair would
    // become identical and the widening would have silently become universal.
    const control = run('ZUHUR_AND_BUTUN');
    expect(statusesById(control)).toStrictEqual({
      d: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      c: `PAID/null:${String(DISTRIBUTABLE)}`,
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(control.totals.retainedMinor).toBe(0n);
    expect(control.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // …and the money goes to opposite parties on the two terms. 27,500,000 either way, and the only
    // thing that decides which is the founder's condition.
    const widened = run('ZUHUR_ONLY');
    expect(amountOf(widened, 'maal-j1')).toBe(DISTRIBUTABLE);
    expect(amountOf(widened, 'c')).toBe(0n);
    expect(amountOf(control, 'maal-j1')).toBe(0n);
    expect(amountOf(control, 'c')).toBe(DISTRIBUTABLE);
  });

  it('3.4 · the not-triggered flag is raised ONLY in the discriminating state', () => {
    // A flag that fires on every ordinary run tells a reader nothing. Here: same clause, same
    // charity, one living ENTITLED descendant ⇒ the flag must be absent.
    const entitledLives = runDistribution(
      makeRaw([child('g1'), jiha('maal-j1')], { reversion: maal('maal-j1') }),
    );
    expect(entitledLives.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(amountOf(entitledLives, 'maal-j1')).toBe(0n);
    // …and absent on a direct-use waqf, where the clause is CARRIED and not applied at all.
    const directUse = runDistribution(
      makeRaw([{ ...child('g1'), active: false }, jiha('maal-j1')], {
        reversion: maal('maal-j1'),
        entitlementOrder: 'NA_DIRECT_USE',
      }),
    );
    expect(directUse.lines).toStrictEqual([]);
    expect(directUse.flags).toContain('NA_DIRECT_USE');
    expect(directUse.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(directUse.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(directUse.totals.retainedMinor).toBe(DISTRIBUTABLE);
  });

  it('3.5 · one death later the SAME register flips PENDING → APPLIED, and nothing was cached', () => {
    // The exclusion is temporary and reverses on an event nobody controls. Three runs: pending,
    // applied, then the ORIGINAL input again — byte-identical to the first, which is what proves no
    // pending state was memoised anywhere.
    const living = makeRaw([child('g1'), jiha('maal-j1')], { reversion: maal('maal-j1') });
    const dead = makeRaw([{ ...child('g1'), active: false }, jiha('maal-j1')], {
      reversion: maal('maal-j1'),
    });

    const before = runDistribution(living);
    expect(amountOf(before, 'g1')).toBe(DISTRIBUTABLE);
    expect(amountOf(before, 'maal-j1')).toBe(0n);

    const after = runDistribution(dead);
    expect(amountOf(after, 'g1')).toBe(0n);
    expect(amountOf(after, 'maal-j1')).toBe(DISTRIBUTABLE);

    const again = runDistribution(living);
    expect(canonicalizeResult(again)).toBe(canonicalizeResult(before));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §3b · THE THREE BOUNDARIES — "no continuing line" is NOT "nobody entitled"
 *
 * ⚠ **THE WHOLE DIFFICULTY OF R7-d's ANSWER LIVES HERE, and it is one that moves money.** The
 * widened trigger and the entitled cohort agree on §3's register, so an implementation that computed
 * *"the bloodline is over"* from the exclusion codes — or from `entitledBloodlineCount`, or from a
 * line's status — would pass every case in §3 and hand a charity the pool on each case below, while
 * the family plainly continues.
 *
 * The entitled cohort can be empty, or the money can be withheld, for reasons that say nothing at all
 * about a line ending:
 *
 *  1. **a zero deed weight on every living head** — their line continues perfectly well; the deed
 *     merely gives them nothing this period;
 *  2. **a head waiting behind a LIVING ancestor** (R-FRONTIER) — the ancestor is on the line and
 *     breathing, which is proof the line is alive rather than evidence against it;
 *  3. **a GATE** (stale KYC, cross-border, uncaptured category) — gates never touch entitlement at all
 *     (I6), so a withheld descendant is an ENTITLED descendant and the trigger never sees the gate.
 *
 * On every case in this section the taker holds **zero halalas** and the family's money stays the
 * family's. Kept as a separate section from §3 rather than merged into it, because §3 proves the
 * widening happened and this proves it did not go one step further.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§3b · a CONTINUING line holds the reversion however few are entitled', () => {
  it('3b.1 · BOUNDARY 1 · every living head on a continuing line carries deed weight 0 ⇒ taker 0, RETAINED', () => {
    // Two LIVING sons of the waqif — depth 1, `parentId: null`, EMPTY ancestor chains, so no walk can
    // break either line under either stipulation. The deed gives both a weight of '0', and `SHARED`
    // applies deed weights, so both are `ZERO_STIPULATED_WEIGHT` and nobody is entitled.
    //
    // ⚠ The entitled cohort is EMPTY and both lines are alive: the exact configuration on which the two
    // possible implementations of the trigger part company. The correct one HOLDS — 27,500,000 waits,
    // recoverably, and the charity takes nothing. Paying it here would move the whole distributable on
    // the strength of a data-entry figure.
    const zeroWeight = runDistribution(
      makeRaw(
        [
          child('s1', 'SON', { stipulatedWeight: '0' }),
          child('s2', 'SON', { stipulatedWeight: '0' }),
          jiha('maal-j1'),
        ],
        { reversion: maal('maal-j1'), entitlementOrder: 'SHARED', continuationStipulation: null },
      ),
    );
    expect(statusesById(zeroWeight)).toStrictEqual({
      s1: 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      s2: 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(zeroWeight.totals.retainedMinor).toBe(DISTRIBUTABLE);
    expect(conserved(zeroWeight)).toBe(DISTRIBUTABLE);
    expect(zeroWeight.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    // The narrowed flag's REMAINING meaning, and the population that keeps it from being dead code:
    // a line the deed continues is still going and nobody on it is entitled this period.
    expect(zeroWeight.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(zeroWeight.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(zeroWeight.invariantsChecked).toContain('I-R1');

    // …and the trace says it in the register's own terms: two living heads, both on continuing lines.
    const step = zeroWeight.computationTrace.find(
      (entry) => entry.code === 'REVERSION_NOT_TRIGGERED',
    );
    expect(step?.data).toMatchObject({
      livingBloodlineIds: 's1,s2',
      continuingBloodlineIds: 's1,s2',
      continuingBloodlineCount: '2',
      unenumeratedBloodlineIds: 'none',
    });

    // ⚠ THE ONE-FIELD CONTROL that proves the weight is what emptied the cohort and NOT the trigger:
    // the same register with a real weight pays the family the whole 27,500,000 (÷ 2 = 13,750,000 each,
    // residual 0) and the charity still zero. Both runs hold the reversion; only one has an entitled
    // head. If a future trigger ever read the cohort, the first would pay a charity and this would not.
    const realWeight = runDistribution(
      makeRaw([child('s1'), child('s2'), jiha('maal-j1')], {
        reversion: maal('maal-j1'),
        entitlementOrder: 'SHARED',
        continuationStipulation: null,
      }),
    );
    expect(amountOf(realWeight, 's1')).toBe(HALF);
    expect(amountOf(realWeight, 's2')).toBe(HALF);
    expect(amountOf(realWeight, 'maal-j1')).toBe(0n);
    expect(realWeight.totals.retainedMinor).toBe(0n);
  });

  it('3b.2 · BOUNDARY 2 · a head waiting behind a LIVING ancestor is proof the line is ALIVE', () => {
    // Waqif → `s1` (living son) → `s2` (his living son). R-FRONTIER puts the entitlement at the
    // nearest LIVING point on the line, so `s1` holds it and `s2` waits — temporarily, until `s1` dies.
    //
    // ⚠ The frontier rule is IRRELEVANT to the trigger and this is where that is asserted: `s2` being
    // excluded says nothing about the line, and `s1` being alive on it says everything. A trigger that
    // read the frontier from the wrong end — "the deepest recorded head is excluded, so the line has
    // stopped" — would pay the charity while a living son of the waqif was collecting.
    //
    // By hand: one entitled head ⇒ 27,500,000 × 1/1 = 27,500,000 to `s1`, residual 0.
    const held = runDistribution(
      makeRaw([child('s1'), person('s2', 2, 'SON', 's1'), jiha('maal-j1')], {
        reversion: maal('maal-j1'),
      }),
    );
    expect(statusesById(held)).toStrictEqual({
      s1: `PAID/null:${String(DISTRIBUTABLE)}`,
      // ⚠ TEMPORARY, and it must stay temporary — the code reverses on `s1`'s death.
      s2: 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(held.totals.retainedMinor).toBe(0n);
    expect(held.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // BOTH heads count as continuing the line — the trigger reads links and liveness, so a member is
    // counted from either end of the chain and the blocked one is not written off.
    const step = held.computationTrace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED');
    expect(step?.data).toMatchObject({ continuingBloodlineIds: 's1,s2' });

    // …and the same register with BOTH dead is the contrast: 27,500,000 to the charity. One field on
    // one person separates "a son is collecting" from "the bloodline is over".
    const gone = runDistribution(
      makeRaw(
        [
          { ...child('s1'), active: false },
          person('s2', 2, 'SON', 's1', { active: false }),
          jiha('maal-j1'),
        ],
        { reversion: maal('maal-j1') },
      ),
    );
    expect(amountOf(gone, 'maal-j1')).toBe(DISTRIBUTABLE);
    expect(gone.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  it('3b.3 · BOUNDARY 3 · a GATE withholds money and never touches the trigger (I6)', () => {
    // Three gates, one per register, each on the endowment's ONLY living descendant. A withheld
    // descendant is an ENTITLED descendant (I6: gates stamp a status and move no halala out of
    // `entitledMinor`), so the line continues, the cohort is non-empty, and the charity gets nothing.
    //
    // ⚠ This is the boundary most likely to be got wrong by a reasonable-looking shortcut, because from
    // outside the run it LOOKS like nobody was paid: `paidMinor` is 0 on all three. If the trigger read
    // payment rather than entitlement, a charity would take 27,500,000 because a beneficiary's KYC had
    // lapsed. Each figure by hand: one entitled head ⇒ 27,500,000 × 1/1 = 27,500,000, residual 0.
    // ⚠ `CATEGORY_NOT_CAPTURED` is deliberately NOT one of the three: it only fires on a
    // `CATEGORY_ONLY` member, which would additionally trip R7-D1's placeholder hold and leave a green
    // run ambiguous about which of the two fail-safes kept the charity at zero.
    const gates = [
      // Refreshed 2024-01-15 against `kycRefreshMonths: 12` and an `asOf` of 2026-07-14 ⇒ expired.
      ['STALE_KYC', { kycLastRefreshed: '2024-01-15' }],
      // Never verified — the gate §1.2 drives, repeated here as one of the three.
      ['KYC_UNVERIFIED', { verificationStatus: 'UNVERIFIED' }],
      // The one NON-blocking gate: a dedicated cross-border path, not a refusal (BR-511).
      ['CROSS_BORDER_PENDING', { residency: 'CROSS_BORDER' }],
    ] as const satisfies readonly (readonly [string, Partial<RawBeneficiary>])[];

    for (const [gate, patch] of gates) {
      const result = runDistribution(
        makeRaw([child('s1', 'SON', patch), jiha('maal-j1')], { reversion: maal('maal-j1') }),
      );
      // The gate DID trip — otherwise this case asserts nothing about gates. Looked up by id rather
      // than by position: lines are ordered by ascending id, so `maal-j1` sorts BEFORE `s1` and
      // `lines[0]` is the charity's line, not the descendant's.
      const descendant = result.lines.find((line) => line.beneficiaryId === 's1');
      expect(`${gate}: ${descendant?.reasonCode ?? 'none'}`).toBe(`${gate}: ${gate}`);
      // WITHHELD or CROSS_BORDER_PENDING — never EXCLUDED. A gate is not an exclusion (I6), which is
      // precisely why it cannot reach the trigger.
      expect(`${gate}: ${descendant?.status ?? 'none'}`).not.toBe(`${gate}: EXCLUDED`);
      // ⚠ …and the money is still the family's: ENTITLED in full, merely not disbursed.
      expect(`${gate}: ${String(amountOf(result, 's1'))}`).toBe(
        `${gate}: ${String(DISTRIBUTABLE)}`,
      );
      expect(`${gate}: ${String(amountOf(result, 'maal-j1'))}`).toBe(`${gate}: 0`);
      expect(`${gate}: ${String(result.totals.paidMinor)}`).toBe(`${gate}: 0`);
      expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
      expect(result.flags).not.toContain('NO_ELIGIBLE_BENEFICIARIES');
      // The taker's reason names the family's survival, not the gate — a gate is not a fact about a
      // charity's entitlement and must never appear as one.
      expect(`${gate}: ${statusesById(result)['maal-j1'] ?? 'none'}`).toBe(
        `${gate}: EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0`,
      );
      expect(conserved(result)).toBe(DISTRIBUTABLE);
    }
  });

  it('3b.4 · the three boundaries and §3 differ ONLY in the register, and 27,500,000 changes hands', () => {
    // ⚠ **THE DISCRIMINATION IN ONE PLACE, so the four cases cannot drift into agreement unnoticed.**
    // Four registers, one clause, one charity, one distributable. The taker takes the pool on exactly
    // one of them — the one where no line the deed continues is still going — and nothing on the three
    // where a line is alive, whoever is entitled and whoever was paid.
    const takerTook = (
      members: readonly RawBeneficiary[],
      overrides: Partial<DistributionInputRaw> = {},
    ): string => {
      const result = runDistribution(
        makeRaw([...members, jiha('maal-j1')], { reversion: maal('maal-j1'), ...overrides }),
      );
      return `${String(amountOf(result, 'maal-j1'))}/${String(result.totals.retainedMinor)}`;
    };

    expect({
      // §3 · no continuing line ⇒ TRIGGERS.
      brokenLine: takerTook([
        { ...child('d', 'DAUGHTER'), active: false },
        person('c', 2, 'SON', 'd'),
      ]),
      // 3b.1 · continuing line, zero weight ⇒ held, pool retained.
      zeroWeight: takerTook([child('s1', 'SON', { stipulatedWeight: '0' })], {
        entitlementOrder: 'SHARED',
        continuationStipulation: null,
      }),
      // 3b.2 · continuing line, a head waiting behind a living ancestor ⇒ held, family paid.
      heldByAncestor: takerTook([child('s1'), person('s2', 2, 'SON', 's1')]),
      // 3b.3 · continuing line, entitled but gated ⇒ held, family entitled.
      gated: takerTook([child('s1', 'SON', { kycLastRefreshed: '2024-01-15' })]),
    }).toStrictEqual({
      brokenLine: `${String(DISTRIBUTABLE)}/0`,
      zeroWeight: `0/${String(DISTRIBUTABLE)}`,
      heldByAncestor: '0/0',
      gated: '0/0',
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §4 · DOES R5 STILL HOLD? — no run pays a charity and a bloodline member
 *
 * R5: *a waqf is either خيري or ذري, never both.* R7 narrows it to "never in the same period", so
 * the runtime claim is that no single run has both a paid charitable line and a paid certified
 * descendant. That is I-R1's universal mirror, and it is the guarantee that survives any refusal
 * being relaxed — so it is attacked directly, not merely observed.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§4 · R5 as a runtime property, and the invariant that enforces it', () => {
  const TREE = [child('g1'), person('g2', 2, 'SON', 'g1'), child('g3', 'DAUGHTER')];

  it('4.1 · over 8 liveness states × 3 orders × 1–2 takers, no run pays a charity beside a descendant', () => {
    let sharedRuns = 0;
    let revertedRuns = 0;
    for (const order of [
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
    ] as const satisfies readonly MoneyOrder[]) {
      for (let mask = 0; mask < 8; mask += 1) {
        for (const takerCount of [1, 2] as const) {
          const alive = new Set(
            TREE.filter((_member, index) => (mask & (1 << index)) !== 0).map((m) => m.id),
          );
          const takers =
            takerCount === 1
              ? [jiha('maal-j1')]
              : [
                  jiha('maal-j1', { stipulatedWeight: '70' }),
                  jiha('maal-j2', { stipulatedWeight: '30' }),
                ];
          const result = runDistribution(
            makeRaw(
              [...TREE.map((member) => ({ ...member, active: alive.has(member.id) })), ...takers],
              { reversion: maal(...takers.map((taker) => taker.id)), entitlementOrder: order },
            ),
          );

          const paid = result.lines.filter((line) => (line.entitledMinor as bigint) !== 0n);
          const paidCharities = paid.filter((line) => line.basis.kind === 'CHARITABLE_JIHA');
          const paidDescendants = paid.filter((line) => line.basis.lineageDepth !== null);
          const cell = `${order}/${alive.size}/${String(takerCount)}`;
          expect(
            `${cell}: charities=${String(paidCharities.length)} descendants=${String(paidDescendants.length)}`,
          ).toBe(
            alive.size === 0
              ? `${cell}: charities=${String(takerCount)} descendants=0`
              : `${cell}: charities=0 descendants=${String(paidDescendants.length)}`,
          );
          if (paidCharities.length > 0 && paidDescendants.length > 0) sharedRuns += 1;
          if (alive.size === 0) revertedRuns += 1;
        }
      }
    }
    expect(sharedRuns).toBe(0);
    // …and the reverted state was actually reached, 6 times. A property whose configuration is never
    // generated reports its silence as success (lesson 5).
    expect(revertedRuns).toBe(6);
  });

  it('4.2 · I-R1 REFUSES a hand-built run that pays the taker while the bloodline lives', () => {
    // The invariant driven directly, because it is the guarantee that must hold even if the verdict
    // ladder is bypassed. Every part of the context comes from a REAL run; only the taker's line is
    // tampered with, to the exact figure ESC-1 diverted.
    const raw = makeRaw([child('g1'), jiha('maal-j1')], { reversion: maal('maal-j1') });
    const honest = runDistribution(raw);
    expect(amountOf(honest, 'maal-j1')).toBe(0n);

    const tampered: DistributionLine[] = honest.lines.map((line) =>
      line.beneficiaryId === 'maal-j1'
        ? { ...line, status: 'PAID', entitledMinor: HALF as Minor, reasonCode: null }
        : line,
    );
    const ctx: InvariantContext = {
      input: parseDistributionInput(raw),
      distributionType: 'MONETARY',
      order: honest.entitlementOrder,
      waterfall: honest.waterfall,
      lines: tampered,
      totals: honest.totals,
      floorsMinor: [],
      entitledIds: ['g1', 'maal-j1'],
      flags: honest.flags,
    };
    try {
      assertReversionIntegrity(ctx);
      expect.unreachable('I-R1 must refuse a taker paid beside a living descendant');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
      expect(error.message).toContain('maal-j1');
      expect(error.message).toContain('13750000');
      // Claim 2's own words — not the mirror's — so this test pins the rung it names.
      expect(error.message).toContain('only once the bloodline is over');
    }
  });

  it('4.3 · I-R1’s UNIVERSAL MIRROR refuses a charity paid beside a certified descendant, with NO مآل clause at all', () => {
    // ⚠ ISOLATED DELIBERATELY, and the first version of this test was green for the wrong reason.
    // Written over a *pending* reverted run, claim 2 (`isTaker && paid && !applied`) fires first and a
    // bare `.toThrow()` cannot tell the two apart — so deleting the mirror left this test GREEN
    // (measured). The mirror is the guarantee that survives every refusal being relaxed, so it needs a
    // case where it is the ONLY claim that can speak: `reversion: null` ⇒ the taker set is empty ⇒
    // claims 1, 2 and 4 are all inert, and what remains is R5 itself.
    //
    // Two living children under SHARED, 13,750,000 each by hand (27,500,000 ÷ 2, residual 0). One
    // line's published `basis.kind` is then flipped to `CHARITABLE_JIHA` — which is exactly the shape
    // R6-D1 and ESC-1 shipped: a paid charity and a paid line the engine had ITSELF certified as a
    // descendant, out of one period's ghallah.
    const raw = makeRaw([child('g1'), child('g2')], {
      reversion: null,
      entitlementOrder: 'SHARED',
    });
    const honest = runDistribution(raw);
    expect(amountOf(honest, 'g1')).toBe(HALF);
    expect(amountOf(honest, 'g2')).toBe(HALF);

    const tampered: DistributionLine[] = honest.lines.map((line) =>
      line.beneficiaryId === 'g2'
        ? { ...line, basis: { ...line.basis, kind: 'CHARITABLE_JIHA' as const } }
        : line,
    );
    const ctx: InvariantContext = {
      input: parseDistributionInput(raw),
      distributionType: 'MONETARY',
      order: honest.entitlementOrder,
      waterfall: honest.waterfall,
      lines: tampered,
      totals: honest.totals,
      floorsMinor: [],
      entitledIds: ['g1', 'g2'],
      flags: honest.flags,
    };
    try {
      assertReversionIntegrity(ctx);
      expect.unreachable('I-R1 must refuse a charity paid beside a certified descendant');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
      // The MIRROR's own words, so this test cannot pass on some other claim of I-R1.
      expect(error.message).toContain('never SHARES a period');
      expect(error.message).toContain('g1');
      expect(error.message).toContain('g2');
    }

    // …and the mirror is genuinely live on ordinary runs: a خيري cohort holding a charitable line
    // reports I-R1 even with no مآل clause anywhere, which is what makes it non-vacuous.
    const charitableRun = runDistribution(
      makeRaw([jiha('maal-j1')], {
        reversion: null,
        entitlementOrder: 'SHARED',
        waqfType: 'PUBLIC_CHARITABLE',
      }),
    );
    expect(charitableRun.invariantsChecked).toContain('I-R1');
    expect(amountOf(charitableRun, 'maal-j1')).toBe(DISTRIBUTABLE);
  });

  it('4.4 · the reversion FLAG is cross-checked against the register, in both directions', () => {
    const raw = makeRaw([{ ...child('g1'), active: false }, jiha('maal-j1')], {
      reversion: maal('maal-j1'),
    });
    const honest = runDistribution(raw);
    expect(honest.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // Strip the flag off a genuinely reverted run: I-R1 must refuse, because a run that quietly paid
    // a charity without saying so is the worse of the two directions.
    const ctx: InvariantContext = {
      input: parseDistributionInput(raw),
      distributionType: 'MONETARY',
      order: honest.entitlementOrder,
      waterfall: honest.waterfall,
      lines: honest.lines,
      totals: honest.totals,
      floorsMinor: [],
      entitledIds: ['maal-j1'],
      flags: honest.flags.filter((flag) => flag !== 'REVERSION_TO_ULTIMATE_TAKER_APPLIED'),
    };
    try {
      assertReversionIntegrity(ctx);
      expect.unreachable('I-R1 must refuse a reverted run that does not report the flag');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
      expect(error.message).toContain('must be a fact about the register');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §5 · THE REFUSAL BOUNDARY — every مآل discriminator, and the precedence between them
 *
 * A refusal asserted only by its `code` passes against whichever check fires first, so every case
 * here names its discriminator. The PRECEDENCE cases are the ones that would rot silently: an
 * exemption granted on an unreadable clause is how a refusal becomes a payout.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§5 · the مآل refusals, each by discriminator', () => {
  const DEAD = { ...child('g1'), active: false };
  const LIVING = child('g1');

  it('5.1 · a jiha on a ذري waqf that the deed does NOT name is still refused', () => {
    // R7-b. Three cells, one field apart: no clause at all, a clause naming a different charity, and
    // a clause naming this one.
    const other = jiha('maal-j2');
    expectRefused(
      makeRaw([LIVING, jiha('maal-j1')], { reversion: null }),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expectRefused(
      makeRaw([LIVING, jiha('maal-j1'), other], { reversion: maal('maal-j2') }),
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    const named = runDistribution(
      makeRaw([LIVING, jiha('maal-j1')], { reversion: maal('maal-j1') }),
    );
    expect(amountOf(named, 'maal-j1')).toBe(0n);
    expect(amountOf(named, 'g1')).toBe(DISTRIBUTABLE);
  });

  it('5.2 · a placeholder-only ذري cohort with an unnamed jiha keeps its OWN discriminator', () => {
    // The R6-D1 route, where no FAMILY member exists to trip the mixed-cohort check.
    expectRefused(
      makeRaw([placeholder('ph1', 1, null, { active: false }), jiha('maal-j1')], {
        reversion: null,
        entitlementOrder: 'ORDERED',
      }),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
  });

  it('5.3 · the jiha-alone-under-lineage payload stays closed, and the PRECEDENCE is asserted', () => {
    // ⚠ MEASURED PRECEDENCE, and it is not what a reader of `LINEAGE_ORDER_ON_CHARITABLE_WAQF`'s own
    // doc comment would predict: on a ذري waqf `CHARITABLE_JIHA_ON_FAMILY_WAQF` fires FIRST (it is the
    // earlier check and needs neither a FAMILY member nor the lineage order), so the payload that arm
    // was written for — a jiha ALONE on a ذري deed under lineage, paid 100% on a line stamped
    // LINEAGE_PER_CAPITA_ZUHUR_ONLY — is now closed by the neighbouring refusal instead.
    expectRefused(
      makeRaw([jiha('maal-j1')], { reversion: null }),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
    // ⚠ AND THE CONSEQUENCE, MEASURED ACROSS THE WHOLE PACKAGE: deleting
    // `LINEAGE_ORDER_ON_CHARITABLE_WAQF`'s jiha disjunct entirely — leaving only the
    // `PUBLIC_CHARITABLE` arm — leaves **all 1642 tests in `packages/domain` green**. It can never be
    // the deciding disjunct: `unnamedJihaIds.length > 0` on a ذري waqf is already refused two checks
    // earlier, `JOINT` is refused first of all, and on a خيري waqf the first arm is true anyway. So
    // R7's narrowing of that arm (which the design brief called *"easy to miss and would silently
    // kill R7-a"*) was applied to a branch that decides nothing, and its `unnamedJihaIds` message
    // text is unreachable. Harmless to the money; a live claim in a doc comment that the code no
    // longer supports.
    //
    // The arm that IS reachable is the absolute one: a خيري waqf under a lineage order, whatever its
    // cohort. R7 did not narrow this half and must not be read as having done so.
    expectRefused(
      makeRaw([jiha('maal-j1')], { reversion: null, waqfType: 'PUBLIC_CHARITABLE' }),
      'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
    );
    // …and with the clause added the ذري cohort is STILL not paid — it refuses on the empty family
    // register, which is the second independent guard over the same payload.
    expectRefused(
      makeRaw([jiha('maal-j1')], { reversion: maal('maal-j1') }),
      'REVERSION_WITH_NO_RECORDED_BLOODLINE',
    );
  });

  it('5.4 · the six legibility refusals, and REVERSION_ON_CHARITABLE_WAQF outranks the rest', () => {
    const cases: readonly (readonly [string, DistributionInputRaw, ShartRefusal])[] = [
      [
        'kind',
        makeRaw([DEAD, jiha('maal-j1')], {
          reversion: { kind: 'REVERT_TO_THE_POOR_OF_A_CITY', ultimateTakerIds: ['maal-j1'] },
        }),
        'REVERSION_KIND_UNRECOGNISED',
      ],
      [
        'empty',
        makeRaw([DEAD, jiha('maal-j1')], {
          reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [] },
        }),
        'REVERSION_WITH_NO_ULTIMATE_TAKER',
      ],
      [
        'unknown id',
        makeRaw([DEAD, jiha('maal-j1')], { reversion: maal('ghost') }),
        'REVERSION_ULTIMATE_TAKER_UNKNOWN',
      ],
      [
        'names a descendant',
        makeRaw([DEAD, jiha('maal-j1')], { reversion: maal('g1') }),
        'REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE',
      ],
      [
        'duplicated',
        makeRaw([DEAD, jiha('maal-j1')], { reversion: maal('maal-j1', 'maal-j1') }),
        'REVERSION_ULTIMATE_TAKER_DUPLICATED',
      ],
      [
        'خيري waqf',
        makeRaw([jiha('maal-j1')], { reversion: maal('maal-j1'), waqfType: 'PUBLIC_CHARITABLE' }),
        'REVERSION_ON_CHARITABLE_WAQF',
      ],
    ];
    for (const [label, input, refusal] of cases) {
      try {
        runDistribution(input);
        expect.unreachable(`${label} must be refused with ${refusal}`);
      } catch (error) {
        if (!isDomainError(error)) throw error;
        expect(`${label}: ${String((error.details as { refusal?: string }).refusal)}`).toBe(
          `${label}: ${refusal}`,
        );
      }
    }

    // PRECEDENCE · a خيري waqf whose clause is ALSO unreadable reports the waqf-type refusal, and a
    // JOINT waqf outranks even that — so a reversion on a JOINT waqf is unreachable.
    expectRefused(
      makeRaw([jiha('maal-j1')], {
        reversion: { kind: 'NONSENSE', ultimateTakerIds: [] },
        waqfType: 'PUBLIC_CHARITABLE',
      }),
      'REVERSION_ON_CHARITABLE_WAQF',
    );
    expectRefused(
      makeRaw([DEAD, jiha('maal-j1')], { reversion: maal('maal-j1'), waqfType: 'JOINT' }),
      'WAQF_TYPE_JOINT_NOT_SUPPORTED',
    );
  });

  it('5.5 · an ultimate taker may carry NO lineage edge and NO ṭabaqa — R7-f revived both guards', () => {
    // A taker is not a descendant, so the two self-contradiction refusals reach it — and on a ذري
    // waqf they are now reachable through the FRONT DOOR for the first time (they were unreachable
    // while a jiha could not sit on a ذري waqf at all).
    expectRefused(
      makeRaw([DEAD, jiha('maal-j1', { tabaqa: 3 })], { reversion: maal('maal-j1') }),
      'JIHA_TIERED',
    );
    expectRefused(
      makeRaw([DEAD, jiha('maal-j1', { lineageLink: 'SON' })], { reversion: maal('maal-j1') }),
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    );
    // …and R6 does NOT demand an edge from it: the same deed with a clean taker computes.
    const clean = runDistribution(makeRaw([DEAD, jiha('maal-j1')], { reversion: maal('maal-j1') }));
    expect(amountOf(clean, 'maal-j1')).toBe(DISTRIBUTABLE);
  });

  it('5.6 · an ALL-ZERO taker weight vector is refused rather than split equally — but only once it FIRES', () => {
    expectRefused(
      makeRaw([DEAD, jiha('maal-j1', { stipulatedWeight: '0' })], { reversion: maal('maal-j1') }),
      'ULTIMATE_TAKER_WEIGHTS_UNUSABLE',
    );
    // A zero weight on ONE of two takers excludes that taker and normalises over the rest — the
    // vector is usable, so nothing is refused. By hand: 27,500,000 × 10/10 = 27,500,000.
    const oneZero = runDistribution(
      makeRaw([DEAD, jiha('maal-j1', { stipulatedWeight: '0' }), jiha('maal-j2')], {
        reversion: maal('maal-j1', 'maal-j2'),
      }),
    );
    expect(statusesById(oneZero)).toStrictEqual({
      g1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'maal-j1': 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      'maal-j2': `PAID/null:${String(DISTRIBUTABLE)}`,
    });

    // ⚠ MEASURED AND SURFACED · the identical unusable deed record computes happily for every period
    // in which the family lives, and refuses only in the period the family ends — i.e. the latent
    // defect surfaces at the worst possible moment, on the run that decides where 27,500,000 goes.
    const pending = runDistribution(
      makeRaw([LIVING, jiha('maal-j1', { stipulatedWeight: '0' })], { reversion: maal('maal-j1') }),
    );
    expect(amountOf(pending, 'g1')).toBe(DISTRIBUTABLE);
    expect(statusesById(pending)['maal-j1']).toBe('EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §6 · DETERMINISM, CONSERVATION AND PURITY over the reversion path
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§6 · the reversion path is pure, deterministic and conserving', () => {
  const INPUT = makeRaw(
    [
      { ...child('g1'), active: false },
      person('g2', 2, 'SON', 'g1', { active: false }),
      jiha('maal-j1', { stipulatedWeight: '1' }),
      jiha('maal-j2', { stipulatedWeight: '2' }),
    ],
    { reversion: maal('maal-j1', 'maal-j2') },
  );

  it('6.1 · a 1:2 taker split lands on the largest-remainder halala, by hand', () => {
    // exact 27,500,000 × 1/3 = 9,166,666.66…, × 2/3 = 18,333,333.33…
    // floors 9,166,666 + 18,333,333 = 27,499,999 ⇒ residual 1 ⇒ largest remainder (.666 > .333)
    // ⇒ maal-j1 9,166,667 · maal-j2 18,333,333 · Σ 27,500,000 ✓
    const result = runDistribution(INPUT);
    expect(amountOf(result, 'maal-j1')).toBe(9_166_667n);
    expect(amountOf(result, 'maal-j2')).toBe(18_333_333n);
    expect(result.totals.residualMinor).toBe(1n);
    expect(conserved(result)).toBe(DISTRIBUTABLE);
  });

  it('6.2 · two runs of one input are byte-identical, and the input is not mutated', () => {
    const snapshot = JSON.stringify(INPUT, (_key, value) =>
      typeof value === 'bigint' ? String(value) : value,
    );
    const first = runDistribution(INPUT);
    const second = runDistribution(INPUT);
    expect(canonicalizeResult(first)).toBe(canonicalizeResult(second));
    expect(
      JSON.stringify(INPUT, (_key, value) => (typeof value === 'bigint' ? String(value) : value)),
    ).toBe(snapshot);
  });

  it('6.3 · Stage 2 alone agrees with the assembled run about who is entitled', () => {
    // The exported resolver and the engine must not drift: a taker entitled at Stage 2 and excluded
    // at Stage 5 (or the reverse) would make every figure above unfalsifiable.
    const resolution = resolveEntitlement(parseDistributionInput(INPUT));
    expect([...resolution.entitledIds]).toStrictEqual(['maal-j1', 'maal-j2']);
    expect(resolution.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(paidIds(runDistribution(INPUT))).toStrictEqual(['maal-j1', 'maal-j2']);
  });

  it('6.4 · a taker gate moves no other line — I6 over the new path', () => {
    // Cross-border routing changes the taker's STATUS and nothing else's amount.
    const domestic = runDistribution(INPUT);
    const crossBorder = runDistribution(
      makeRaw(
        [
          { ...child('g1'), active: false },
          person('g2', 2, 'SON', 'g1', { active: false }),
          jiha('maal-j1', { stipulatedWeight: '1', residency: 'CROSS_BORDER' }),
          jiha('maal-j2', { stipulatedWeight: '2' }),
        ],
        { reversion: maal('maal-j1', 'maal-j2') },
      ),
    );
    expect(amountOf(crossBorder, 'maal-j1')).toBe(amountOf(domestic, 'maal-j1'));
    expect(amountOf(crossBorder, 'maal-j2')).toBe(amountOf(domestic, 'maal-j2'));
    expect(statusesById(crossBorder)['maal-j1']).toBe(
      'CROSS_BORDER_PENDING/CROSS_BORDER_PENDING:9166667',
    );
    // The Authority notice follows the taker, not the bloodline.
    expect(crossBorder.authorityNotices.map((notice) => notice.beneficiaryId)).toStrictEqual([
      'maal-j1',
    ]);
    expect(crossBorder.totals.crossBorderMinor).toBe(9_166_667n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §7 · R7-D1 · ✓ CLOSED — extinction cannot be certified from an UNENUMERATED placeholder
 *
 * ── WHAT THIS SECTION MEASURED, kept verbatim as the record ───────────────────────────────────
 * A `FAMILY_DHURRI` register whose only recorded descendants were `CATEGORY_ONLY` placeholders
 * (*"descendants of Branch A not yet enrolled"*, real lineage edges, derived ṭabaqāt 1 → 2,
 * `active: false`) plus one named ultimate taker **paid that charity 27,500,000 of 27,500,000
 * halalas** — flag `REVERSION_TO_ULTIMATE_TAKER_APPLIED`, `I-R1` reported as checked, both
 * placeholders `EXCLUDED/TABAQA_EXTINCT:0`. That is R6-D1's measured payload restored to the halala,
 * one `reversion` field after `r6-adversarial.test.ts` §2 refuses the identical cohort. §7.2 measured
 * the same payout from a SINGLE placeholder on all three money orders, and §7.5 measured a MIXED
 * register (enumerated dead **plus** a placeholder) firing on the enumerated dead.
 *
 * ── THE PRINCIPLE THE FIX ENCODES ─────────────────────────────────────────────────────────────
 *   **a placeholder is sound evidence FOR a living bloodline, and no evidence at all AGAINST one.**
 * Its `active: false` records that a *placeholder* is not in force — nobody's death. §7.3 is the
 * control that proved the placeholder was doing the work: the same record with `active: true` blocks
 * the charity and pays the placeholder instead. `resolver.reversionOutcome` now returns `PENDING`,
 * carrying `unenumeratedBloodlineIds`, whenever any recorded descendant is a placeholder — the same
 * fail-safe direction as R7-d's living-but-not-entitled case, and for the same reason: money that
 * waits is recoverable, money paid to a charity is not.
 *
 * ── ⚠⚠ R7-D2 · WHY 7.1 / 7.2 / 7.5 ARE **RED**, AND WHY THAT IS THE HONEST STATE ──────────────
 * The three inverted cases below assert the CONTRACT the fix set out to deliver: the run **emits**,
 * the charity gets **0**, the pool is **RETAINED**, and the run **says why**. It delivers the first
 * half of that and not the second:
 *
 *   `resolver.reversionOutcome` holds the trigger, but `invariants.independentReversionState` still
 *   recomputes `applied` from *"a clause, a non-empty register, nobody living"* — it was **not brought
 *   onto the fix**. The two now disagree on exactly this register, `I-R1`'s flag cross-check fires,
 *   and the run is refused **`DISTRIBUTION_INVARIANT_BREACH`** whose own message reads *"This is an
 *   engine defect, not a data problem — refusing to emit the run."*
 *
 * **No halala moves**, so R7-D1's money claim holds and is asserted at scale elsewhere
 * (`distribution.property.test.ts` P13.1, 2,374 of 10,000 runs reach this configuration and not one
 * pays a charity; `escape-class-adversarial.test.ts` bounds the grid's 16 cells). What does NOT hold is
 * the contract: a legal ذري deed over an incompletely-enumerated family is reported to the Nazir as an
 * engine bug rather than as a retained pool with a reason. Two smaller gaps ride along, both asserted
 * below because they are what "says why" means:
 *
 *   · `unenumeratedBloodlineIds` is computed in `resolver.ts` and **read by nothing** — no flag, no
 *     trace step, no line. The reason exists in a local variable.
 *   · the two labels that WOULD be published are false statements about this register:
 *     `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` (no descendant is living) and the taker's
 *     `REVERSION_PENDING_LIVING_BLOODLINE` (there is no living bloodline). Neither may be reused here.
 *
 * ⚠ `resolver.ts`, `contract.ts`, `invariants.ts` and `engine.ts` are **not this file's to edit**, so
 * the cases are left RED rather than re-pointed at the behaviour that ships. Do not "fix" them by
 * asserting `DISTRIBUTION_INVARIANT_BREACH` — that would pin an engine defect as the contract.
 *
 * ⚠ And `resolver.ts` carries a `TODO(surface)`: **the owner has never been asked what an inactive
 * placeholder means.** If it turns out to retire a never-enumerated branch, the deed needs a way to
 * say *"this branch is closed"* that is distinguishable from *"this placeholder is not in force"* —
 * paying a charity on the strength of the second is what the fix refuses.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§7 · R7-D1 · CLOSED · a placeholder cannot certify a family’s extinction', () => {
  /** R6-D1's cohort, verbatim: two placeholders (ṭabaqa 1 → 2, both inactive) and one jiha. */
  const PLACEHOLDERS = [
    placeholder('ph1', 1, null, { active: false }),
    placeholder('ph2', 2, 'ph1', { active: false }),
  ];

  /**
   * The run that must EMIT with its pool held.
   *
   * A bare `runDistribution` would surface R7-D2 as an uncaught `DomainError` with no statement of what
   * was expected, so the throw is converted into a named failure instead. `expect.fail` and not a
   * tolerated branch: the contract is *"the run emits"*, and a helper that quietly accepted a throw
   * would turn these three cases green over an engine that refuses every one of them.
   */
  function heldRun(input: DistributionInputRaw): DistributionResult {
    try {
      return runDistribution(input);
    } catch (error) {
      if (!isDomainError(error)) throw error;
      const refusal = (error.details as { refusal?: string } | undefined)?.refusal ?? 'none';
      return expect.fail(
        `⚠ R7-D2 — the held run did NOT EMIT: ${error.code}/${refusal}. ` +
          `R7-D1's fix holds the trigger in resolver.reversionOutcome, but ` +
          `invariants.independentReversionState still recomputes applied = "clause + non-empty ` +
          `register + nobody living", so I-R1's flag cross-check refuses the run. No halala moves, ` +
          `but a legal ذري deed over an incompletely-enumerated family must RETAIN the pool and say ` +
          `why — not be reported as an engine defect. invariants.ts is not this file's to edit.`,
      );
    }
  }

  /**
   * The full held contract, in one place so all three inverted cases assert the same thing.
   *
   * Every figure by hand: the taker takes **0**, the pool retained is the whole **27,500,000**
   * (= 40,000,000 − 4,000,000 ṣiyāna − 4,500,000 operating − 4,000,000 ʿushr), and Σ lines + retained
   * = 27,500,000 (I2's identity).
   */
  function expectHeldByPlaceholders(
    result: DistributionResult,
    takerId: string,
    unenumeratedIds: readonly string[],
  ): void {
    // 1 · the money. Not 13,750,000, not 1 — zero, and the pool is still the family's.
    expect(amountOf(result, takerId)).toBe(0n);
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
    expect(conserved(result)).toBe(DISTRIBUTABLE);
    expect(paidIds(result)).toStrictEqual([]);
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // 2 · the run SAYS WHY, naming the records whose generation nobody has enumerated. Searched over
    // the serialized trace rather than pinned to one code, because which code carries it is the
    // engine's choice and this assertion is about the statement existing at all.
    const said = JSON.stringify(result.computationTrace);
    for (const id of unenumeratedIds) {
      expect(
        said,
        `the run must name the unenumerated record ${id} as the reason it held`,
      ).toContain(id);
    }

    // 3 · and it must NOT say something false. Both existing labels claim a LIVING bloodline, and on
    // this register there is none — a beneficiary statement reading "wait, a descendant is alive"
    // about a family whose enrolment is simply incomplete is the wrong sentence, not a near-enough one.
    expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    const takerLine = result.lines.find((line) => line.beneficiaryId === takerId);
    expect(takerLine?.reasonCode).not.toBe('REVERSION_PENDING_LIVING_BLOODLINE');
  }

  it('7.1 · INVERTED · a مآل over placeholders ONLY pays the charity 0 — was 27,500,000 of 27,500,000', () => {
    // The input is R6-D1's cohort VERBATIM and unchanged from the measurement: two `CATEGORY_ONLY`
    // placeholders at derived ṭabaqāt 1 → 2, both `active: false`, plus the named taker, `ORDERED`.
    // Only the expected outcome is inverted.
    const result = heldRun(
      makeRaw([...PLACEHOLDERS, jiha('maal-j1')], {
        reversion: maal('maal-j1'),
        entitlementOrder: 'ORDERED',
      }),
    );
    expectHeldByPlaceholders(result, 'maal-j1', ['ph1', 'ph2']);
    // …and the placeholders themselves still hold nothing — the pool is RETAINED, not redirected to a
    // record that stands for people nobody has enrolled.
    expect(amountOf(result, 'ph1')).toBe(0n);
    expect(amountOf(result, 'ph2')).toBe(0n);
  });

  it('7.2 · INVERTED · one placeholder is enough to hold it, on all three money orders', () => {
    // Not a two-generation artefact in either direction: ONE unenumerated record used to unlock the
    // whole 27,500,000 on every order, and one must now hold it on every order.
    for (const order of [
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
    ] as const satisfies readonly MoneyOrder[]) {
      const result = heldRun(
        makeRaw([placeholder('ph1', 1, null, { active: false }), jiha('maal-j1')], {
          reversion: maal('maal-j1'),
          entitlementOrder: order,
        }),
      );
      expect(`${order}: ${String(amountOf(result, 'maal-j1'))}`).toBe(`${order}: 0`);
      expectHeldByPlaceholders(result, 'maal-j1', ['ph1']);
    }
  });

  it('7.3 · CONTROL · the same register with the placeholder ALIVE pays the family, not the charity', () => {
    // The control that made 7.1 a defect rather than a design choice, and it is UNCHANGED by the fix —
    // deliberately. It is the other half of the principle: a placeholder IS sound evidence for a living
    // bloodline, so an active one blocks the charity and takes the pool.
    const alive = runDistribution(
      makeRaw([placeholder('ph1', 1, null, { active: true }), jiha('maal-j1')], {
        reversion: maal('maal-j1'),
        entitlementOrder: 'ORDERED',
      }),
    );
    expect(amountOf(alive, 'maal-j1')).toBe(0n);
    expect(amountOf(alive, 'ph1')).toBe(DISTRIBUTABLE);
  });

  it('7.4 · ⚠ THE OVER-BROADNESS CHECK · an ENUMERATED extinct family DOES still trigger it', () => {
    /*
     * ⚠ **THE HALF THAT MATTERS EQUALLY.** A fix that closed 7.1 by holding every extinct register
     * would strand a family endowment's income for ever, which is the mirror failure this file's header
     * names. So: a register of individually-named `FAMILY` members, every one deceased, **no
     * placeholder anywhere** — precisely the state the owner described (*"once ALL descendants are dead
     * and the bloodline is over"*) — and the taker takes the pool.
     *
     * By hand: 1 taker at deed weight '10' ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
     * Σ lines + retained = 27,500,000 + 0 = 27,500,000 ✓ (I2).
     */
    for (const order of [
      'LINEAGE_CONTINUATION',
      'ORDERED',
      'SHARED',
    ] as const satisfies readonly MoneyOrder[]) {
      const enumerated = runDistribution(
        makeRaw(
          [
            { ...child('g1'), active: false },
            person('g2', 2, 'SON', 'g1', { active: false }),
            jiha('maal-j1'),
          ],
          { reversion: maal('maal-j1'), entitlementOrder: order },
        ),
      );
      expect(`${order}: ${String(amountOf(enumerated, 'maal-j1'))}`).toBe(
        `${order}: ${String(DISTRIBUTABLE)}`,
      );
      expect(`${order}: ${String(enumerated.totals.retainedMinor)}`).toBe(`${order}: 0`);
      expect(`${order}: ${ruleOf(enumerated, 'maal-j1')}`).toBe(
        `${order}: ULTIMATE_TAKER_MAAL_AL_WAQF`,
      );
      expect(enumerated.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
      expect(enumerated.invariantsChecked).toContain('I-R1');
      expect(conserved(enumerated)).toBe(DISTRIBUTABLE);
      // Both named descendants are out and hold nothing — the bloodline being over IS the trigger.
      expect(amountOf(enumerated, 'g1')).toBe(0n);
      expect(amountOf(enumerated, 'g2')).toBe(0n);
    }
  });

  it('7.5 · INVERTED · a MIXED register HOLDS — the enumerated dead do not certify the whole family', () => {
    // ⚠ THE SHARPEST CASE, and the one a real engagement actually produces: two named deceased
    // descendants **plus** one placeholder for a generation nobody has enrolled. It used to fire on the
    // enumerated dead while the placeholder stood, paying the charity 27,500,000 of 27,500,000. The
    // enumerated deaths are real deaths — and they still say nothing about the branch the placeholder
    // stands for, so extinction is not certifiable and the pool waits.
    const mixed = heldRun(
      makeRaw(
        [
          { ...child('g1'), active: false },
          placeholder('ph1', 1, null, { active: false }),
          jiha('maal-j1'),
        ],
        { reversion: maal('maal-j1') },
      ),
    );
    expectHeldByPlaceholders(mixed, 'maal-j1', ['ph1']);
    // The enumerated member's own verdict is untouched: they really are deceased, and the run still
    // says so — the hold is about what the register does NOT record, not a re-reading of what it does.
    expect(statusesById(mixed)['g1']).toBe('EXCLUDED/BENEFICIARY_INACTIVE:0');
  });

  it('7.6 · BOUNDED · the hold is one field wide — removing the placeholder pays the taker again', () => {
    // The narrowness check, as a one-field delta on ONE register rather than two hand-built cohorts:
    // the same three-member cohort as 7.5 with the placeholder's `kind` changed from `CATEGORY_ONLY`
    // to `FAMILY` (same edge, same ṭabaqa, same `active: false`) must PAY. If this ever goes red
    // together with 7.4, the fix has become "hold every extinct register".
    const asPlaceholder = [
      { ...child('g1'), active: false },
      placeholder('ph1', 1, null, { active: false }),
      jiha('maal-j1'),
    ];
    const asEnumerated = asPlaceholder.map((member) =>
      member.id === 'ph1' ? { ...member, kind: 'FAMILY' as const, category: null } : member,
    );
    const paid = runDistribution(makeRaw(asEnumerated, { reversion: maal('maal-j1') }));
    expect(amountOf(paid, 'maal-j1')).toBe(DISTRIBUTABLE);
    expect(paid.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(conserved(paid)).toBe(DISTRIBUTABLE);
    // ⚠ Kept GREEN on purpose, and it is the only assertion this case makes. The other side of the
    // delta — the identical register with `kind: 'CATEGORY_ONLY'` — is 7.5's subject and is RED for
    // R7-D2's reason; asserting both here would make the over-broadness check unreadable, because a
    // reader could not tell which half of the delta had failed.
    expect(asPlaceholder.find((member) => member.id === 'ph1')?.kind).toBe('CATEGORY_ONLY');
  });

  it('7.7 · R7-D1 × R7-d · the placeholder hold WINS over the widened trigger — the ORDER matters', () => {
    /*
     * ⚠ **THE INTERACTION THE OWNER CONFIRMED IN THE SAME BREATH AS THE WIDENING.** Asked whether *"the
     * bloodline is over"* meant *no continuing line*, the owner said yes — and separately, that a
     * register of unenumerated placeholders must *"hold the reversion"*. Those two answers meet on
     * exactly one register and they point opposite ways, so the precedence is load-bearing rather than
     * incidental.
     *
     * The register: a `CATEGORY_ONLY` placeholder standing at the head of a DAUGHTER branch (deceased —
     * a placeholder that is not in force), with a LIVING enumerated grandson beneath it, under
     * `ZUHUR_ONLY`. The continuing-line test says **no line continues**: the only survivor sits on a
     * broken buṭūn line. §3.1's register, one `kind` field apart, TRIGGERS on exactly that reasoning and
     * pays the charity 27,500,000.
     *
     * ⚠ And here it must NOT, because the placeholder's `lineageLink` is only where the register hangs a
     * branch — it says nothing about the lines of the people it stands for, and under `ZUHUR_ONLY` least
     * of all, where the answer turns on each unrecorded person's own chain of links. The engine cannot
     * certify that no line continues when it was never shown who exists. A widened trigger applied over a
     * placeholder is R7-D1's payload (27,500,000 of 27,500,000 to the charity) with one extra step of
     * reasoning in front of it.
     *
     * ⚠ …and the run must say **unenumerated**, not **living**: the enumerated survivor here is on a
     * broken line, so "descendants are living on a line this deed continues" would be a false sentence on
     * a beneficiary's BR-505 record. That is why the two codes were never collapsed.
     */
    const held = heldRun(
      makeRaw(
        [
          placeholder('ph1', 1, null, { active: false, lineageLink: 'DAUGHTER', line: 'BUTUN' }),
          person('c', 2, 'SON', 'ph1'),
          jiha('maal-j1'),
        ],
        { reversion: maal('maal-j1'), continuationStipulation: 'ZUHUR_ONLY' },
      ),
    );
    expect(statusesById(held)).toStrictEqual({
      ph1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      // The living grandson: his line does not continue under this deed, permanently…
      c: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      // …and yet the charity is held, on the UNENUMERATED code rather than the living-bloodline one.
      'maal-j1': 'EXCLUDED/REVERSION_PENDING_BLOODLINE_UNENUMERATED:0',
    });
    expectHeldByPlaceholders(held, 'maal-j1', ['ph1']);
    expect(held.flags).toContain('REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED');
    expect(held.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');

    // ⚠ THE ONE-FIELD DELTA that shows the placeholder is doing the work and not the broken line: the
    // identical register with `ph1` enumerated as a `FAMILY` record TRIGGERS, and the charity takes the
    // whole 27,500,000 (× 10/10, residual 0). Same links, same vital statuses, same clause, same deed
    // term — one `kind` field, and 27,500,000 halalas.
    const enumerated = runDistribution(
      makeRaw(
        [
          {
            ...person('ph1', 1, 'DAUGHTER', null, { active: false }),
            bankingRefForProceeds: 'FAKE-IBAN-MAAL-PH',
          },
          person('c', 2, 'SON', 'ph1'),
          jiha('maal-j1'),
        ],
        { reversion: maal('maal-j1'), continuationStipulation: 'ZUHUR_ONLY' },
      ),
    );
    expect(amountOf(enumerated, 'maal-j1')).toBe(DISTRIBUTABLE);
    expect(enumerated.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(amountOf(enumerated, 'c')).toBe(0n);
    expect(conserved(enumerated)).toBe(DISTRIBUTABLE);
  });
});
