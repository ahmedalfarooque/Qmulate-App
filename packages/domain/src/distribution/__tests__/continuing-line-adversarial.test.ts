/**
 * `distribution/continuing-line-adversarial.test.ts` — an attack on **R7-d's WIDENED trigger**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * On **2026-08-11** the product owner answered R7-d: asked whether *"the bloodline is over"* means
 * *no living descendant* or *no continuing line*, the answer was **"bloodline is over means no
 * continuing line."** That WIDENS the one trigger in this engine that moves an entire endowment's
 * income from a family to a charity, irreversibly. This file assumes the widening now fires too
 * early and hunts for a register in which it does.
 *
 * `reversion-adversarial.test.ts` specifies the widened rule case by case. This file attacks it by
 * **enumeration** — every tree shape × every liveness pattern × both stipulations × all three money
 * orders — and re-derives the continuing-line predicate **for itself**, so a cell is judged against
 * an independent walk rather than against the engine's own reason codes.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE UNDER ATTACK
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A line continues through the descendants the deed's `continuationStipulation` carries it through:
 *
 *   | stipulation | a living descendant keeps the bloodline going iff… |
 *   |---|---|
 *   | `ZUHUR_AND_BUTUN` | always — every living descendant continues a line (the OLD strict test) |
 *   | `ZUHUR_ONLY` | every ancestor **strictly between** them and the waqif is a `SON` |
 *
 * so
 *
 * ```
 * continuesTheLine(b) ⇔ b.active
 *                       ∧ ( continuation ≠ 'ZUHUR_ONLY'
 *                           ∨ every ancestor strictly between b and the waqif is a SON )
 * ```
 *
 * The member's **own** link is never read (a son's daughter continues the line; a daughter's son does
 * not), and no ancestor's `active` is read (line shape is a fact about links — a dead ancestor is
 * walked *through*).
 *
 * ⚠ **THE THREE BOUNDARIES ARE THE WHOLE DIFFICULTY, and each of them must still HOLD the reversion.**
 * The continuing-line test is **not** the entitled-cohort test, and the cohort can be empty for
 * reasons that say nothing about a line ending:
 *
 *  1. **zero deed weight** on every living descendant (`ZERO_STIPULATED_WEIGHT`, reachable on
 *     `ORDERED`/`SHARED`) — their line continues perfectly well;
 *  2. a descendant **held behind a living ancestor** (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) — the
 *     ancestor is on the line and alive, so the line plainly continues (R-FRONTIER decides *who holds*
 *     it, never *whether it exists*);
 *  3. a **gate** (stale KYC, unverified KYC, unlicensed entity, cross-border) — gates never touch
 *     entitlement at all (I6), so a withheld descendant is an entitled descendant.
 *
 * And R7-D1's **placeholder hold still wins** over the widened trigger (owner-confirmed in the same
 * breath): a `CATEGORY_ONLY` placeholder says nothing about the lines of the people it stands for.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THE MONEY FIGURES HERE WERE OBTAINED — BY HAND, IN HALALAS, NEVER COPIED FROM OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * One money shape throughout, deliberately the same total R6-D1 / ESC-1 / R7-D1 were measured at:
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
 *   | subject | arithmetic | result |
 *   |---|---|---|
 *   | 1 taker, weight 10 | 27,500,000 × 10/10 | **27,500,000**, residual 0 |
 *   | 1 living head, per capita | 27,500,000 × 1/1 | **27,500,000** |
 *   | 2 living heads, per capita | 27,500,000 ÷ 2 | **13,750,000** each, residual 0 |
 *   | 3 living heads, per capita | floor 27,500,000 ÷ 3 = 9,166,666; ×3 = 27,499,998 | residual **2** ⇒ the two lowest ids +1 ⇒ **9,166,667 / 9,166,667 / 9,166,666** |
 *   | 2 heads at deed weights 0 and 0 | nobody entitled | retained **27,500,000** |
 *
 * **13,750,000 is the number to watch** — R6-D1/ESC-1's measured diversion, and exactly half of the
 * distributable, which is what an escaped taker at equal deed weight takes beside one living head.
 * Every taker below carries weight `'10'`, equal to every descendant's, so an escape shows up as a
 * figure and not only as a reason code.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE ATTACK FOUND
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **No early take.** Over **7,680 enumerated runs** (§1 — two trees, every link assignment, every
 * liveness pattern, both stipulations, all three money orders, a named ultimate taker at equal deed
 * weight in every one) the trigger fired in **672** cells — **384 of them the shape the widening
 * created** (the charity taking while living blood descendants remain on the register) and 288 the
 * strict shape that already existed — and in **every one of them** an independent walk agrees that no
 * living descendant sits on a line the deed continues. Not one cell paid a charity a halala beside a
 * paid descendant; not one cell paid a charity while ANY descendant was living on a continuing line.
 * The flag equals the oracle **bidirectionally** on all 7,680 cells, so the trigger is neither over-
 * nor under-firing on any shape these generators reach. Every one of the four counts is derived by
 * hand in §6.1.
 *
 * ⚠ **THE FIGURES ABOVE ARE Q5's, NOT R7-d's, AND THE OLD ONES ARE KEPT SO THE DELTA IS READABLE.**
 * R7-d's sweep was **3,584 cells / 288 triggered / 128 newly-triggering**, with tree B swept on
 * `LINEAGE_CONTINUATION` alone because that was the only order whose trigger consumed the deed's
 * continuation term. Memo Q5 (below) makes the term decide on every order, so tree B is swept on all
 * three and every count is re-derived. **§7 measures the ruling's delta directly: exactly 256 cells
 * change answer, all of them `ORDERED`/`SHARED` + `ZUHUR_ONLY`, all in one direction (held ⇒ triggered),
 * and I-R1 is asserted on every one.**
 *
 * **The three boundaries all hold** (§2), each measured: a zero-weight cohort retains 27,500,000
 * rather than paying the charity; a descendant behind a living ancestor keeps the charity at 0 while
 * the ancestor takes 27,500,000; each of the four gates leaves the descendant *entitled* to
 * 27,500,000 with `paidMinor` 0 and the charity at 0. The combinations hold too, including the one
 * that is *supposed* to trigger — every living descendant simultaneously gated **and** on a broken
 * daughter line, where the charity correctly takes 27,500,000 because the gate is irrelevant to
 * whether the line exists.
 *
 * **The stipulation is genuinely read** (§3): one register, one field flipped, opposite outcomes —
 * 27,500,000 to the charity under `ZUHUR_ONLY`, 27,500,000 to the living grandson under
 * `ZUHUR_AND_BUTUN`. And the trigger is demonstrably not the emptiness of the entitled cohort: §3.3
 * exhibits two registers whose entitled bloodline cohort is equally empty and whose reversion
 * outcomes are opposite.
 *
 * **The two implementations agree, and are genuinely independent** (§4): `invariants` re-narrows the
 * order and the continuation term from the raw `input` and walks its own ancestor chains — proved
 * behaviourally by feeding it a context whose LINES are all zero and whose `entitledIds` is empty and
 * showing its verdict still flips on `continuationStipulation` alone, and flips again on
 * `entitlementOrder` alone.
 *
 * ✓ **THE ONE SCOPE JUDGEMENT THIS FILE SURFACED IS NOW ANSWERED — memo Q5, product owner 2026-08-17.**
 * The paragraph that stood here read: *"The widening is applied **only on `LINEAGE_CONTINUATION`** … On
 * `ORDERED`/`SHARED` a `ZUHUR_ONLY` deed whose survivors all sit on broken daughter lines still HOLDS the
 * reversion. That is engineering's fail-safe scoping of the owner's words … It is pinned here so it cannot
 * drift silently, and it is a **fiqh/scope question for the owner**, not a defect."* It was carried to him
 * and answered: **one trigger everywhere — the continuation stipulation, not the entitlement order, defines
 * whose line counts; the strict no-living-descendant reading is retired.** §2.7 and §6.3, which pinned the
 * scoping, are **inverted** rather than deleted, and §7 is new: the delta, enumerated.
 *
 * ⚠ **THE RULING FORCED ONE THING THE MEMO DID NOT NAME, AND IT IS SURFACED IN ITS TURN (§7.4).** On
 * `ORDERED`/`SHARED` the ENTITLEMENT path still ignores the continuation term (ADR-0009 open question 3,
 * still open), so a living descendant on an abandoned line came out ENTITLED on a run whose reversion had
 * just fired — a charity and a certified descendant paid from one distributable, which invariant **I-R1
 * refuses outright** (measured: 15 red cases before the fix). Of the three possible readings, two are
 * closed by the ruling (don't fire = the retired strict reading; halt = Q5's declined option c), so the
 * survivor is EXCLUDED `BUTUN_LINE_NOT_CONTINUED` — the same fact the trigger used, applied to both sides
 * of one run. It moves money on a real deed shape, so it is written down rather than absorbed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE DEFECT THIS FILE FOUND — §2.9 · AN HONESTY GAP, MOVING NO MONEY · ✓ FIXED, THEN DISSOLVED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * That scoping had a consequence nobody had stated: on `ORDERED`/`SHARED` the continuing-line test
 * collapses to bare liveness, so a deed that **records `ZUHUR_ONLY`** and is ordered `SHARED` raised
 * `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` — and printed *"1 descendant(s) of the waqif is living
 * on a line this deed continues"* — over a survivor whose only ancestor is a **deceased DAUGHTER**. The
 * deed's own recorded stipulation does not carry that line. MEASURED before the fix: `SHARED`,
 * `ZUHUR_ONLY`, `d1` (DAUGHTER, ṭabaqa 1, deceased) → `b1` (SON, ṭabaqa 2, living, deed weight `'0'`),
 * one named taker — the run **retained 27,500,000 halalas** (the fail-safe outcome, unchanged by the
 * fix) while stating a fact the deed contradicts. This is the class
 * `REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED` was split off for: *a code is split when it would
 * otherwise lie.*
 *
 * ✓ FIXED in `resolver`'s `REVERSION_NOT_TRIGGERED` step, which named the scope in the sentence and
 * published **`continuationTermApplied`** beside `continuationStipulation` — so a consumer could tell *"the
 * deed records no term"* from *"the deed records one and this order does not consume it"*, which the old
 * `continuationStipulation: 'null'` collapsed into one value.
 *
 * ✓✓ **AND THEN DISSOLVED BY Q5.** With the term consumed on every order, that register **triggers**, so
 * the false sentence has no run to appear on and the qualifier is deleted from the code rather than kept as
 * dead prose. §2.9 is rewritten to measure the new outcome and to keep all three states of the finding on
 * the record. `continuationTermApplied` survives and still discriminates — for the one remaining case, a
 * deed recording a term the engine cannot recognise (§2.9d). ⚠ The ar/en copy E10/E12 owes this flag is
 * unchanged in status: product-approved legal text, never invented in a code change.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED — every assertion below was shown to FAIL against a deliberately broken engine,
 * and each source file was restored by re-editing and checked byte-for-byte with `shasum -a 256`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   | mutation | where | killed |
 *   |---|---|---|
 *   | **M1** the widening reverted — `continuesTheLine` returns `active` | `resolver` | **20 / 39**, incl. §1.2, §1.3, §3.1, §6.1–6.3 |
 *   | **M2** the trigger reads the deed WEIGHT (the cohort test, sneaking in) | `resolver` | **5 / 39** — §2.1, §2.2, §2.5, §2.9, §3.3, i.e. boundary 1 exactly |
 *   | **M3** the member's OWN `lineageLink` is read | `resolver` | **14 / 39**, incl. §2.5 and the whole sweep |
 *   | **M4** the invariant's third conjunct reverted to `livingBloodlineIds.length === 0` (**R7-D2's exact shape**) | `invariants` | **20 / 39** — the sweep refuses `DISTRIBUTION_INVARIANT_BREACH`, and §4.3/§4.4 flip |
 *   | **M5** R7-D1's placeholder hold removed | `resolver` | **1 / 39** — §2.8, and only §2.8, which is what a one-purpose test should do |
 *   | **M6 (Q5)** the retired scoping restored — `reversionContinuation` back to `continuation` in the resolver, the invariant left widened | `resolver` | **21 / 46**, and the mechanism is stronger than a failed expectation: **the sweep cannot even be built.** Cell `A/ORDERED/ZUHUR_ONLY/links=0/alive=4` is refused `DISTRIBUTION_INVARIANT_BREACH` / I-R1 — *"the run does not report REVERSION_TO_ULTIMATE_TAKER_APPLIED, but recomputing the extinction test from the input says the recorded bloodline IS over … 1 of them living (b1), of whom 0 on a line this deed CONTINUES"* — which is **R7-D2's exact shape, caught by the check that moved in the same change** |
 *
 * ⚠ **M1–M5 were measured against the 39-case, 3,584-cell version of this file** and their counts are
 * kept as taken rather than rescaled — the denominators moved (46 cases, 7,680 cells) and re-running them
 * is owed to the next adversarial pass. **M6 was measured on THIS version** (21/46, quoted above). ⚠ A
 * first estimate of "7/46" was written into this table and then measured as WRONG; the measurement is
 * what the table records, and the estimate is named here because a predicted mutation score that nobody
 * re-measures is the same defect class as a stale closure claim.
 *
 * ⚠ One near-miss worth recording rather than hiding: a mutation making `continuesTheLine` ALSO require
 * `livingAncestorId === null` (i.e. confusing the trigger with R-FRONTIER's frontier test) is
 * **behaviour-equivalent** and cannot be killed — because the highest living member of a continuing line
 * has no living ancestor and is counted anyway. Boundary 2 is therefore structurally safe rather than
 * test-protected, and §2.3 documents that argument instead of pretending to catch it.
 */

import { describe, expect, it } from 'vitest';

import { civilDate, toHijri } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import {
  parseDistributionInput,
  type DistributionInput,
  type DistributionInputRaw,
  type DistributionResult,
  type EntitlementOrder,
  type RunFlag,
} from '../contract.js';
import { runDistribution } from '../engine.js';
import { assertReversionIntegrity, type InvariantContext } from '../invariants.js';
import { canonicalizeResult } from '../trace.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Builders — INVENTED data only, never `archive/raw-intake/`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type RawBeneficiary = DistributionInputRaw['beneficiaries'][number];
type Link = 'SON' | 'DAUGHTER';
type Continuation = 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN';
type MoneyOrder = Extract<EntitlementOrder, 'LINEAGE_CONTINUATION' | 'ORDERED' | 'SHARED'>;

const ASOF_GREGORIAN = '2026-07-14';
const TAKER_ID = 'maal-j1';

/** ṣiyāna 10%, operating 4,500,000, ʿushr 10% of revenue ⇒ distributable 27,500,000. */
const MONEY = {
  revenue: {
    incomeMinor: 40_000_000n,
    receipts: [{ id: 'rev-cl', receiptClass: 'INCOME', amountMinor: 40_000_000n }],
  },
  operatingCostMinor: 4_500_000n,
  maintenance: { kind: 'PERCENT', ratePercent: '10' },
  nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
} as const satisfies Partial<DistributionInputRaw>;

const DISTRIBUTABLE = 27_500_000n;
/** Half of it — R6-D1/ESC-1's measured diversion, and what an escaped taker takes beside one head. */
const HALF = 13_750_000n;

/**
 * A recorded descendant. `tabaqa` must equal the derived depth or `buildLineage` refuses
 * (`TABAQA_MISMATCHES_LINEAGE_DEPTH`), so every tree below states its own depths — a description that
 * drifts from its tree cannot pass silently. Every payability field is clean and identical unless a
 * case deliberately trips one gate, so no verdict here moves because of a gate by accident.
 */
function person(
  id: string,
  depth: number,
  link: Link,
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
    bankingRefForProceeds: 'FAKE-IBAN-CL-FAM',
    ...overrides,
  };
}

/**
 * A not-yet-enumerated generation — `CATEGORY_ONLY` **with a real lineage edge**, which R6 requires of
 * it on a ذري waqf and which makes it a CERTIFIED member of the waqif's family tree. Used only in
 * §2.8, where R7-D1's hold must beat the widened trigger.
 */
function placeholder(
  id: string,
  depth: number,
  link: Link,
  parentId: string | null,
  overrides: Partial<RawBeneficiary> = {},
): RawBeneficiary {
  return person(id, depth, link, parentId, {
    kind: 'CATEGORY_ONLY',
    category: 'descendants of Branch A not yet enrolled',
    bankingRefForProceeds: 'FAKE-IBAN-CL-PH',
    ...overrides,
  });
}

/**
 * The charitable jiha named as مآل — carrying **no lineage edge and no ṭabaqa**, which is what makes
 * it legal on a ذري waqf at all. Deed weight `'10'`, equal to every descendant's, so an escape is
 * visible as {@link HALF} rather than only as a reason code.
 */
function jiha(id: string = TAKER_ID, overrides: Partial<RawBeneficiary> = {}): RawBeneficiary {
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
    bankingRefForProceeds: 'FAKE-IBAN-CL-J',
    ...overrides,
  };
}

function makeRaw(
  beneficiaries: readonly RawBeneficiary[],
  overrides: Partial<DistributionInputRaw> = {},
): DistributionInputRaw {
  return {
    waqfId: 'waqf-cl-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [TAKER_ID] },
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    ...MONEY,
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
 * THE ORACLE — this file's OWN walk, from descent + liveness + the stipulation
 *
 * Derived from the raw register, never from the engine: no exclusion code, no `entitledBloodlineCount`,
 * no line status, no flag, no trace attribute is read. That is what makes §1 a check rather than a
 * restatement.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The proper-ancestor chain, nearest first, over members the register places in the family tree. */
function ancestorChain(
  beneficiaries: readonly RawBeneficiary[],
  id: string,
): readonly RawBeneficiary[] {
  const byId = new Map(beneficiaries.map((b) => [b.id, b]));
  const chain: RawBeneficiary[] = [];
  let cursor = byId.get(id);
  for (let hop = 0; hop < beneficiaries.length; hop += 1) {
    const parentId = cursor?.parentId ?? null;
    if (cursor === undefined || parentId === null) break;
    const parent = byId.get(parentId);
    if (parent === undefined || parent.lineageLink === null) break;
    chain.push(parent);
    cursor = parent;
  }
  return chain;
}

/**
 * **This file's independent continuing-line predicate.** `continuation === null` means the deed's term
 * is not applied on this path, and the test collapses to liveness alone.
 */
function oracleContinues(
  beneficiaries: readonly RawBeneficiary[],
  id: string,
  continuation: Continuation | null,
): boolean {
  const subject = beneficiaries.find((b) => b.id === id);
  if (subject === undefined || subject.lineageLink === null) return false;
  if (!subject.active) return false;
  if (continuation !== 'ZUHUR_ONLY') return true;
  // The subject's OWN link is deliberately unread; no ancestor's `active` is read either.
  return ancestorChain(beneficiaries, id).every((a) => a.lineageLink === 'SON');
}

/** Every recorded descendant who keeps the bloodline going, ascending. */
function oracleContinuingIds(
  beneficiaries: readonly RawBeneficiary[],
  continuation: Continuation | null,
): readonly string[] {
  return beneficiaries
    .filter((b) => b.lineageLink !== null && oracleContinues(beneficiaries, b.id, continuation))
    .map((b) => b.id)
    .sort();
}

/** Every recorded descendant the register says is alive, ascending — the OLD strict test's list. */
function oracleLivingIds(beneficiaries: readonly RawBeneficiary[]): readonly string[] {
  return beneficiaries
    .filter((b) => b.lineageLink !== null && b.active)
    .map((b) => b.id)
    .sort();
}

/**
 * ✓ **THE RETIRED SCOPING — kept as an oracle, not as an expectation (memo Q5, product owner
 * 2026-08-17).** This function used to be *the engine's rule*: the continuation term was consumed only on
 * `LINEAGE_CONTINUATION`, and §1 asserted against it while §2.7/§6.3 pinned the scoping as engineering's
 * own decision. The owner retired it — **one trigger everywhere**, the continuation stipulation and not
 * the entitlement order decides whose line counts — so the engine's rule is now the owner's literal rule
 * (`term`, whatever the order) and the two lists §1 compared have collapsed into one.
 *
 * It stays here for one purpose: **counting the delta Q5 moved** (§7). A cell whose answer differs under
 * this function from the answer under the term is a cell the ruling changed, and that count is the
 * measurable content of the widening rather than a claim about it.
 */
function preQ5ScopedTerm(order: MoneyOrder, term: Continuation): Continuation | null {
  return order === 'LINEAGE_CONTINUATION' ? term : null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Observers — always the ENGINE's own output
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

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

/** Σ every line + retained, which must equal the distributable on every run (I2's own identity). */
function conserved(result: DistributionResult): bigint {
  const lines = result.lines.reduce((sum, line) => sum + (line.entitledMinor as bigint), 0n);
  return lines + (result.totals.retainedMinor as bigint);
}

/** Ids the ENGINE certified as descendants — `basis.lineageDepth !== null`, never a `kind` filter. */
function certifiedDescendantIds(result: DistributionResult): readonly string[] {
  return result.lines
    .filter((line) => line.basis.lineageDepth !== null)
    .map((line) => line.beneficiaryId);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §1 · THE ENUMERATION — can the charity take while a line still continues?
 *
 * Two trees, every link assignment, every liveness pattern, both stipulations, all three money orders,
 * and a named ultimate taker at equal deed weight in every cell. Each cell is judged against
 * {@link oracleContinuingIds} — this file's own walk — and never against the engine's reason codes.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface TreeSpec {
  readonly name: string;
  /** `[id, depth, parentId]`, parents before children. */
  readonly nodes: readonly (readonly [string, number, string | null])[];
  readonly orders: readonly MoneyOrder[];
}

/**
 * Tree A — a fork plus a three-deep line, so a break can sit at depth 1 or depth 2 and a survivor can
 * sit one or two hops below it:
 *
 *     waqif ─┬─ a1 ── b1 ── c1
 *            └─ a2
 */
const TREE_A: TreeSpec = {
  name: 'A(a1,a2,b1<a1,c1<b1)',
  nodes: [
    ['a1', 1, null],
    ['a2', 1, null],
    ['b1', 2, 'a1'],
    ['c1', 3, 'b1'],
  ],
  orders: ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED'],
};

/**
 * Tree B — two independent lines, one of them three deep, so a *continuing* line and a *broken* one
 * can coexist and the trigger has to look at both:
 *
 *     waqif ─┬─ p1 ── q1 ── r1
 *            └─ p2 ── q2
 */
const TREE_B: TreeSpec = {
  name: 'B(p1,p2,q1<p1,q2<p2,r1<q1)',
  nodes: [
    ['p1', 1, null],
    ['p2', 1, null],
    ['q1', 2, 'p1'],
    ['q2', 2, 'p2'],
    ['r1', 3, 'q1'],
  ],
  // ✓ WIDENED TO ALL THREE ORDERS BY Q5 (product owner, 2026-08-17). It ran `LINEAGE_CONTINUATION` alone
  // while that was the only order whose trigger consumed the continuation term — enumerating the richer
  // two-line tree on the orders where the term was ignored would have measured nothing. Now the term is
  // consumed everywhere, so the deepest tree must be swept on the orders the ruling newly reaches; the
  // sweep grows from 3,584 cells to 7,680 and every count in §6.1 is re-derived by hand for it.
  orders: ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED'],
};

interface Cell {
  readonly label: string;
  readonly order: MoneyOrder;
  readonly term: Continuation;
  readonly result: DistributionResult;
  /**
   * The continuing-line list under the deed's recorded term, **whatever the order** — the owner's literal
   * rule, and since memo Q5 also the engine's. The two used to be different lists (see
   * {@link preQ5ScopedTerm}) and §1 asserted against both; they are one list now, which is the ruling.
   */
  readonly continuing: readonly string[];
  /** The same list under the RETIRED scoping. Read only by §7, to count the cells Q5 moved. */
  readonly preQ5Continuing: readonly string[];
  readonly living: readonly string[];
  readonly applied: boolean;
}

function buildCells(tree: TreeSpec): readonly Cell[] {
  const cells: Cell[] = [];
  const n = tree.nodes.length;
  for (const order of tree.orders) {
    for (const term of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
      for (let linkBits = 0; linkBits < 1 << n; linkBits += 1) {
        for (let aliveBits = 0; aliveBits < 1 << n; aliveBits += 1) {
          const family = tree.nodes.map(([id, depth, parentId], index) => {
            const link: Link = (linkBits >> index) & 1 ? 'SON' : 'DAUGHTER';
            const active = ((aliveBits >> index) & 1) === 1;
            return person(id, depth, link, parentId, { active });
          });
          const beneficiaries = [...family, jiha()];
          const raw = makeRaw(beneficiaries, {
            entitlementOrder: order,
            continuationStipulation: term,
          });
          const label = `${tree.name}/${order}/${term}/links=${String(linkBits)}/alive=${String(aliveBits)}`;

          let result: DistributionResult;
          try {
            result = runDistribution(raw);
          } catch (error) {
            // A refusal in this sweep would be a finding in its own right: every register here is
            // well-formed (ṭabaqa == depth, no cycle, no dangling edge, a usable taker weight), so
            // nothing should halt. Name the discriminator rather than swallowing it.
            const refusal =
              isDomainError(error) &&
              typeof error.details === 'object' &&
              error.details !== null &&
              'refusal' in error.details
                ? String((error.details as { refusal: unknown }).refusal)
                : 'NOT-A-DOMAIN-REFUSAL';
            throw new Error(
              `cell ${label} was refused (${refusal}: ${error instanceof Error ? error.message : String(error)})`,
            );
          }

          cells.push({
            label,
            order,
            term,
            result,
            continuing: oracleContinuingIds(beneficiaries, term),
            preQ5Continuing: oracleContinuingIds(beneficiaries, preQ5ScopedTerm(order, term)),
            living: oracleLivingIds(beneficiaries),
            applied: result.flags.includes('REVERSION_TO_ULTIMATE_TAKER_APPLIED'),
          });
        }
      }
    }
  }
  return cells;
}

/** Built once — 7,680 runs since Q5 — and read by every §1/§5/§6/§7 case below. */
let sweepCache: readonly Cell[] | null = null;
function sweep(): readonly Cell[] {
  sweepCache ??= [...buildCells(TREE_A), ...buildCells(TREE_B)];
  return sweepCache;
}

describe('§1 · the enumeration — the charity never takes while a line the deed continues is going', () => {
  it('1.1 · the sweep is the size the header claims, and NOT ONE CELL was refused', () => {
    // Tree A: 3 orders × 2 terms × 2^4 links × 2^4 liveness = 3 × 2 × 16 × 16 = 1,536.
    // Tree B: 3 orders × 2 terms × 2^5 links × 2^5 liveness = 3 × 2 × 32 × 32 = 6,144.  ← Q5: was 1 order
    // 1,536 + 6,144 = 7,680, by hand. (Was 3,584 while tree B ran `LINEAGE_CONTINUATION` alone.)
    expect(sweep()).toHaveLength(7680);
  });

  it('1.2 · every TRIGGERED cell has NO living descendant on a line the deed continues', () => {
    const offenders: string[] = [];
    for (const cell of sweep()) {
      if (!cell.applied) continue;
      // ONE list since memo Q5, and that is the ruling: the deed's recorded term, applied whatever the
      // entitlement order. This assertion used to be made twice — once against the engine's narrower
      // scoping and once against the owner's literal rule — because the two could disagree.
      if (cell.continuing.length > 0) {
        offenders.push(`${cell.label} continuing=[${cell.continuing.join(',')}]`);
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it('1.3 · the flag equals the oracle BIDIRECTIONALLY on all 7,680 cells', () => {
    // Over-firing AND under-firing in one assertion. No placeholders in this sweep, and every register
    // is non-empty, so the engine's trigger reduces to exactly `continuing.length === 0`.
    const disagreements = sweep()
      .filter((cell) => cell.applied !== (cell.continuing.length === 0))
      .map(
        (cell) =>
          `${cell.label} applied=${String(cell.applied)} continuing=[${cell.continuing.join(',')}]`,
      );
    expect(disagreements).toStrictEqual([]);
  });

  it('1.4 · on a TRIGGERED cell the taker takes 27,500,000 and every descendant holds 0', () => {
    const offenders: string[] = [];
    for (const cell of sweep()) {
      if (!cell.applied) continue;
      if (amountOf(cell.result, TAKER_ID) !== DISTRIBUTABLE) {
        offenders.push(`${cell.label} taker=${String(amountOf(cell.result, TAKER_ID))}`);
      }
      for (const id of certifiedDescendantIds(cell.result)) {
        if (amountOf(cell.result, id) !== 0n) {
          offenders.push(`${cell.label} ${id}=${String(amountOf(cell.result, id))}`);
        }
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it('1.5 · on every NON-triggered cell the taker holds exactly 0 halalas', () => {
    const offenders = sweep()
      .filter((cell) => !cell.applied && amountOf(cell.result, TAKER_ID) !== 0n)
      .map((cell) => `${cell.label} taker=${String(amountOf(cell.result, TAKER_ID))}`);
    expect(offenders).toStrictEqual([]);
  });

  it('1.6 · a descendant the ENGINE certified is never paid on a triggered cell — and never 13,750,000 to the charity beside one head', () => {
    // The specific escape figure, hunted as a number: HALF beside a paid descendant is R6-D1/ESC-1.
    const offenders: string[] = [];
    for (const cell of sweep()) {
      const takerAmount = amountOf(cell.result, TAKER_ID);
      const paidDescendants = certifiedDescendantIds(cell.result).filter(
        (id) => amountOf(cell.result, id) !== 0n,
      );
      if (takerAmount !== 0n && paidDescendants.length > 0) {
        offenders.push(
          `${cell.label} taker=${String(takerAmount)} beside [${paidDescendants.join(',')}]`,
        );
      }
      if (takerAmount === HALF) offenders.push(`${cell.label} taker took HALF`);
    }
    expect(offenders).toStrictEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §2 · THE THREE BOUNDARIES — hunted, not accepted
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§2 · the boundaries the widening must NOT cross', () => {
  it('2.1 · BOUNDARY 1 · a zero deed weight on every living head HOLDS the reversion (SHARED)', () => {
    // Two living SON children of the waqif, deed weight '0'. Their line continues perfectly well;
    // nobody is entitled, and the pool must WAIT rather than go to the charity.
    // By hand: distributable 27,500,000, entitled cohort ∅ ⇒ retained 27,500,000, taker 0.
    const raw = makeRaw(
      [
        person('s1', 1, 'SON', null, { stipulatedWeight: '0' }),
        person('s2', 1, 'SON', null, { stipulatedWeight: '0' }),
        jiha(),
      ],
      { entitlementOrder: 'SHARED' },
    );
    const result = runDistribution(raw);

    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(statusesById(result)).toStrictEqual({
      s1: 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      s2: 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      [TAKER_ID]: 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
    expect(conserved(result)).toBe(DISTRIBUTABLE);
  });

  it('2.1b · ONE-FIELD CONTROL · the same register at a real weight pays 13,750,000 each', () => {
    // Proves the zero weight — and nothing else — was producing the empty cohort in 2.1.
    // By hand: 27,500,000 ÷ 2 = 13,750,000 each, residual 0.
    const raw = makeRaw([person('s1', 1, 'SON', null), person('s2', 1, 'SON', null), jiha()], {
      entitlementOrder: 'SHARED',
    });
    const result = runDistribution(raw);
    expect(amountOf(result, 's1')).toBe(HALF);
    expect(amountOf(result, 's2')).toBe(HALF);
    expect(amountOf(result, TAKER_ID)).toBe(0n);
    expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
  });

  it('2.2 · BOUNDARY 1 on ORDERED · a zero-weight living ṭabaqa still HOLDS the reversion', () => {
    const raw = makeRaw(
      [
        person('s1', 1, 'SON', null, { stipulatedWeight: '0' }),
        person('s2', 1, 'SON', null, { stipulatedWeight: '0' }),
        jiha(),
      ],
      { entitlementOrder: 'ORDERED' },
    );
    const result = runDistribution(raw);
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(amountOf(result, TAKER_ID)).toBe(0n);
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
  });

  it('2.3 · BOUNDARY 2 · a descendant held behind a LIVING ancestor is proof the line is alive', () => {
    // s1 (living son of the waqif) → s2 (living son of s1). R-FRONTIER puts the entitlement on s1 and
    // holds s2; the line plainly continues, so the charity gets nothing.
    // By hand: one entitled head ⇒ 27,500,000 × 1/1 = 27,500,000.
    const raw = makeRaw([person('s1', 1, 'SON', null), person('s2', 2, 'SON', 's1'), jiha()]);
    const result = runDistribution(raw);

    expect(statusesById(result)).toStrictEqual({
      s1: 'PAID/null:27500000',
      s2: 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
      [TAKER_ID]: 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // Both ends of the chain count as continuing — the outcome is the same read from either.
    expect(oracleContinuingIds(raw.beneficiaries, 'ZUHUR_ONLY')).toStrictEqual(['s1', 's2']);
  });

  it('2.3b · BOUNDARY 2, ONLY the held descendant alive · the line ends and the charity takes', () => {
    // The mirror of 2.3, one field apart: s1 DEAD, s2 alive. The line is unbroken (s1 is a SON), so
    // s2 becomes the living frontier and IS entitled — the charity must still get nothing.
    const raw = makeRaw([
      person('s1', 1, 'SON', null, { active: false }),
      person('s2', 2, 'SON', 's1'),
      jiha(),
    ]);
    const result = runDistribution(raw);
    expect(statusesById(result)).toStrictEqual({
      s1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      s2: 'PAID/null:27500000',
      [TAKER_ID]: 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
  });

  it.each(['ORDERED', 'SHARED'] as const)(
    '2.3c · BOUNDARY 2 ON THE NEW ORDERS (%s) · a living upper generation keeps the line alive',
    (entitlementOrder) => {
      /*
       * Q5 requires the three non-triggering causes to stay non-triggering on the orders the widening newly
       * reaches. Boundary 2's *code* (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) exists only on the lineage path,
       * so the boundary is asserted here by its content instead: two living SONs, parent and child, on
       * `ORDERED`/`SHARED`. Whatever those orders do about *who* is entitled, the line is plainly alive and
       * the charity must take nothing.
       *
       * By hand: `ORDERED` ⇒ entitled ṭabaqa 1 = {s1} ⇒ 27,500,000 to s1, s2 `UPPER_TABAQA_EXTANT`.
       *          `SHARED` ⇒ both entitled at weight 10 ⇒ 13,750,000 each, residual 0.
       */
      const result = runDistribution(
        makeRaw([person('s1', 1, 'SON', null), person('s2', 2, 'SON', 's1'), jiha()], {
          entitlementOrder,
        }),
      );
      expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
      expect(amountOf(result, TAKER_ID)).toBe(0n);
      expect(amountOf(result, 's1')).toBe(entitlementOrder === 'ORDERED' ? DISTRIBUTABLE : HALF);
      expect(amountOf(result, 's2')).toBe(entitlementOrder === 'ORDERED' ? 0n : HALF);
    },
  );

  it.each([
    ['STALE_KYC', { kycLastRefreshed: '2024-01-15' }, 'WITHHELD'],
    ['KYC_UNVERIFIED', { verificationStatus: 'UNVERIFIED' as const }, 'WITHHELD'],
    [
      'ENTITY_UNLICENSED',
      { disbursingEntity: { name: 'Fictional agent', licensed: false, licenceExpiry: null } },
      'WITHHELD',
    ],
    ['CROSS_BORDER_PENDING', { residency: 'CROSS_BORDER' as const }, 'CROSS_BORDER_PENDING'],
  ])(
    '2.4 · BOUNDARY 3 · gate %s withholds the money but NEVER releases it to the charity',
    (gate, overrides, status) => {
      // A gate never touches entitlement (I6), so a withheld descendant is an ENTITLED descendant and
      // the line is alive. By hand: sole living head ⇒ entitled 27,500,000, paid 0, taker 0.
      const raw = makeRaw([person('s1', 1, 'SON', null, overrides), jiha()]);
      const result = runDistribution(raw);

      expect(amountOf(result, 's1')).toBe(DISTRIBUTABLE);
      expect(result.lines.find((l) => l.beneficiaryId === 's1')?.status).toBe(status);
      expect(result.lines.find((l) => l.beneficiaryId === 's1')?.gateFlags).toContain(gate);
      expect(result.totals.paidMinor).toBe(0n);
      expect(amountOf(result, TAKER_ID)).toBe(0n);
      expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
      // The line is entitled, so the "nobody entitled" flag must NOT appear either.
      expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
      expect(conserved(result)).toBe(DISTRIBUTABLE);
    },
  );

  it.each(['ORDERED', 'SHARED'] as const)(
    '2.4b · BOUNDARY 3 ON THE NEW ORDERS (%s) · every gate still withholds without releasing to the charity',
    (entitlementOrder) => {
      // Q5 obliges boundary 3 to hold on the orders the widening newly reaches. Gates never touch
      // entitlement (I6), so a withheld descendant is an entitled descendant and the line is alive —
      // whatever the order. All four gates, on a single living SON child of the waqif.
      for (const [gate, overrides] of [
        ['STALE_KYC', { kycLastRefreshed: '2024-01-15' }],
        ['KYC_UNVERIFIED', { verificationStatus: 'UNVERIFIED' as const }],
        [
          'ENTITY_UNLICENSED',
          { disbursingEntity: { name: 'Fictional agent', licensed: false, licenceExpiry: null } },
        ],
        ['CROSS_BORDER_PENDING', { residency: 'CROSS_BORDER' as const }],
      ] as const) {
        const result = runDistribution(
          makeRaw([person('s1', 1, 'SON', null, overrides), jiha()], { entitlementOrder }),
        );
        expect(amountOf(result, 's1'), `${entitlementOrder}/${gate}`).toBe(DISTRIBUTABLE);
        expect(result.totals.paidMinor, `${entitlementOrder}/${gate}`).toBe(0n);
        expect(amountOf(result, TAKER_ID), `${entitlementOrder}/${gate}`).toBe(0n);
        expect(result.flags, `${entitlementOrder}/${gate}`).not.toContain(
          'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
        );
        expect(conserved(result), `${entitlementOrder}/${gate}`).toBe(DISTRIBUTABLE);
      }
    },
  );

  it('2.5 · COMBINATION · a zero-weight head on a CONTINUING line beside a full-weight head on a BROKEN one', () => {
    // d1 is a DAUGHTER child of the waqif — her OWN link is never read, so under ZUHUR_ONLY she is on a
    // continuing line and entitled — carrying deed weight '0', which a lineage cohort ignores (R3).
    // b1, her son, IS broken. So: the line continues, the charity gets nothing, and d1 takes the lot.
    // By hand: one entitled head ⇒ 27,500,000.
    const raw = makeRaw([
      person('d1', 1, 'DAUGHTER', null, { stipulatedWeight: '0' }),
      person('b1', 2, 'SON', 'd1'),
      jiha(),
    ]);
    const result = runDistribution(raw);

    expect(statusesById(result)).toStrictEqual({
      b1: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      d1: 'PAID/null:27500000',
      [TAKER_ID]: 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(oracleContinuingIds(raw.beneficiaries, 'ZUHUR_ONLY')).toStrictEqual(['d1']);
    // The deed's own zero figure is preserved and flagged, never silently dropped.
    expect(result.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
  });

  it('2.6 · COMBINATION · every living descendant GATED **and** on a broken line ⇒ the charity DOES take', () => {
    // The case that is *supposed* to trigger, and the one most likely to be got wrong by an
    // implementation that reads exclusion codes: the gate is irrelevant to whether a line exists.
    // d1 (DAUGHTER, depth 1) is DEAD; b1 (her son) is alive with stale KYC. Under ZUHUR_ONLY b1's
    // chain breaks at d1, so no line continues.
    // By hand: taker weight 10 of 10 ⇒ 27,500,000; b1 EXCLUDED holds 0; retained 0.
    const raw = makeRaw([
      person('d1', 1, 'DAUGHTER', null, { active: false }),
      person('b1', 2, 'SON', 'd1', { kycLastRefreshed: '2024-01-15' }),
      jiha(),
    ]);
    const result = runDistribution(raw);

    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(statusesById(result)).toStrictEqual({
      b1: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      d1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      [TAKER_ID]: 'PAID/null:27500000',
    });
    expect(result.totals.retainedMinor).toBe(0n);
    expect(conserved(result)).toBe(DISTRIBUTABLE);
    expect(oracleContinuingIds(raw.beneficiaries, 'ZUHUR_ONLY')).toStrictEqual([]);
    // …and the register still holds a LIVING blood descendant while the charity is paid. That is the
    // widening's whole content, and I-R1's mirror survives it because b1 holds 0n.
    expect(oracleLivingIds(raw.beneficiaries)).toStrictEqual(['b1']);
    expect(result.invariantsChecked).toContain('I-R1');
  });

  it('2.6b · ONE-FIELD CONTROL · the same register with the gate REMOVED still triggers', () => {
    // Proves the gate was doing no work in 2.6 — the broken line was.
    const raw = makeRaw([
      person('d1', 1, 'DAUGHTER', null, { active: false }),
      person('b1', 2, 'SON', 'd1'),
      jiha(),
    ]);
    expect(amountOf(runDistribution(raw), TAKER_ID)).toBe(DISTRIBUTABLE);
  });

  it('2.7 · ✓ THE SCOPING IS RETIRED · the same broken-line register on SHARED now TRIGGERS (memo Q5)', () => {
    /*
     * ⚠⚠ **INVERTED BY RULING, AND THE OLD PIN IS QUOTED RATHER THAN DELETED.** This case read
     * *"THE SCOPING, PINNED · the same broken-line register on SHARED HOLDS the reversion"*, and asserted
     * `taker = 0`, `b1 = 27,500,000`. Its comment said: *"SURFACED, NOT CLOSED. The widening is applied
     * only on LINEAGE_CONTINUATION … That is the fail-safe direction and it is engineering's scoping
     * decision, not the owner's words."* It was surfaced, and it came back answered: **memo Q5 (product
     * owner, 2026-08-17) — one trigger everywhere; the strict reading is retired.**
     *
     * So the identical register — d1 a DECEASED DAUGHTER of the waqif, b1 her living son, recorded
     * `ZUHUR_ONLY` on a `SHARED` deed — now says what the deed says: no line this deed continues is still
     * going, and the مآل takes. By hand: one taker at weight 10 over Σ 10 ⇒ 27,500,000 × 10/10 =
     * **27,500,000**, residual 0; b1 excluded holding 0.
     *
     * ⚠ **AND b1's EXCLUSION IS THE FORCED CONSEQUENCE, ASSERTED HERE RATHER THAN LEFT IMPLICIT.** b1 is
     * living and, on a `SHARED` deed, would be entitled at weight 10 — the entitlement path still does not
     * consume the continuation term (ADR-0009 open question 3). Paying b1 beside the charity is R5, which
     * I-R1's mirror refuses outright, so on a TRIGGERED run b1 is excluded `BUTUN_LINE_NOT_CONTINUED`: the
     * same fact the trigger used, applied to both sides of one run. See the resolver's Q5 block.
     */
    const raw = makeRaw(
      [person('d1', 1, 'DAUGHTER', null, { active: false }), person('b1', 2, 'SON', 'd1'), jiha()],
      { entitlementOrder: 'SHARED' },
    );
    const result = runDistribution(raw);

    // The flag still fires — the term is still not applied to ELIGIBILITY on SHARED, which is what that
    // flag has always been about. Q5 changed the trigger, not open question 3.
    expect(result.flags).toContain('CONTINUATION_STIPULATION_NOT_APPLIED');
    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(amountOf(result, TAKER_ID)).toBe(DISTRIBUTABLE);
    expect(statusesById(result)).toStrictEqual({
      b1: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      d1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      [TAKER_ID]: `PAID/null:${String(DISTRIBUTABLE)}`,
    });
    // I-R1 is what makes that pairing a guarantee rather than an outcome, so it must be asserted here.
    expect(result.invariantsChecked).toContain('I-R1');
    // The owner's literal rule and the engine's rule now agree on this cell — the two lists coincide.
    expect(oracleContinuingIds(raw.beneficiaries, 'ZUHUR_ONLY')).toStrictEqual([]);
    // …and the retired reading, kept as the measure of what moved: it counted b1 as continuing.
    expect(oracleContinuingIds(raw.beneficiaries, null)).toStrictEqual(['b1']);
  });

  it('2.8 · R7-D1 STILL WINS · a placeholder on the register holds the reversion the widening would fire', () => {
    // 2.6b's shape with the DEAD root recorded as an unenumerated CATEGORY_ONLY placeholder. The
    // engine was never shown who exists, so it cannot certify that no line continues — owner-confirmed
    // in the same breath as the widening. By hand: retained 27,500,000, taker 0.
    const raw = makeRaw([
      placeholder('ph1', 1, 'DAUGHTER', null, { active: false }),
      person('b1', 2, 'SON', 'ph1'),
      jiha(),
    ]);
    const result = runDistribution(raw);

    expect(result.flags).toContain('REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED');
    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(statusesById(result)).toStrictEqual({
      b1: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      ph1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      [TAKER_ID]: 'EXCLUDED/REVERSION_PENDING_BLOODLINE_UNENUMERATED:0',
    });
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
    // One `kind` field is all that separates this from 2.6b's 27,500,000 to the charity.
  });

  it('2.9 · ✓ THE FINDING IS DISSOLVED, NOT PATCHED · that sentence is no longer printed on this input', () => {
    /*
     * ⚠⚠ **THE HISTORY OF THIS CASE IS THE POINT AND IS KEPT IN FULL.** Three states:
     *
     * (1) MEASURED as a DEFECT: this register retained 27,500,000 (fail-safe) while its
     *     `REVERSION_NOT_TRIGGERED` step said *"1 descendant(s) of the waqif is living on a line this deed
     *     continues"* — over a survivor whose only ancestor is a **deceased DAUGHTER** on a deed recording
     *     `ZUHUR_ONLY`. A sentence the deed's own term contradicted, on a beneficiary-facing record.
     * (2) FIXED by qualifying the sentence and publishing `continuationTermApplied` — an honesty fix that
     *     left the scoping in place, because the scoping was engineering's and awaiting the owner.
     * (3) ✓ **DISSOLVED by memo Q5 (product owner, 2026-08-17).** With the term consumed on every order the
     *     run **TRIGGERS** on this register, so the false sentence has no run to be printed on: the step is
     *     `REVERSION_TRIGGERED`, and the qualifier that (2) added is gone from the code rather than kept as
     *     dead prose. A defect fixed twice, once by wording and once by the rule being corrected.
     *
     * By hand: b1 is living but on a line the deed does not continue ⇒ no continuing line ⇒ the مآل takes
     * 27,500,000 × 10/10 = **27,500,000**, residual 0. b1's deed weight '0' is irrelevant to the trigger
     * (boundary 1 is about weight *causing* a trigger; here the broken line causes it) and b1 is excluded
     * `ZERO_STIPULATED_WEIGHT` — its own record, checked before the Q5 override, so the reason a reader
     * sees is the deed's own figure rather than the line break.
     */
    const raw = makeRaw(
      [
        person('d1', 1, 'DAUGHTER', null, { active: false }),
        person('b1', 2, 'SON', 'd1', { stipulatedWeight: '0' }),
        jiha(),
      ],
      { entitlementOrder: 'SHARED' },
    );
    const result = runDistribution(raw);

    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(result.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(amountOf(result, TAKER_ID)).toBe(DISTRIBUTABLE);
    expect(result.totals.retainedMinor).toBe(0n);
    expect(statusesById(result)).toStrictEqual({
      b1: 'EXCLUDED/ZERO_STIPULATED_WEIGHT:0',
      d1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      [TAKER_ID]: `PAID/null:${String(DISTRIBUTABLE)}`,
    });

    // The step is the TRIGGERED one, and it names the living survivor on the abandoned line — because
    // "the bloodline is over" is a startling sentence to print over a register that holds a living
    // descendant, and the reader is owed the name.
    expect(
      result.computationTrace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED'),
    ).toBeUndefined();
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_TRIGGERED');
    expect(step?.data).toMatchObject({
      livingNonContinuingBloodlineIds: 'b1',
      continuationStipulation: 'ZUHUR_ONLY',
    });
    // The oracle's two readings disagreed on exactly this cell — which is what the ruling settled.
    expect(oracleContinuingIds(raw.beneficiaries, 'ZUHUR_ONLY')).toStrictEqual([]);
    expect(oracleContinuingIds(raw.beneficiaries, null)).toStrictEqual(['b1']);
  });

  it('2.9b · CONTROL · on LINEAGE_CONTINUATION the term IS consumed and the qualifier is absent', () => {
    // The same distinction from the other side: a deed whose order consumes the term must not carry the
    // "measured without" qualifier, and `continuationTermApplied` must read 'true'.
    const result = runDistribution(
      makeRaw([person('s1', 1, 'SON', null), person('s2', 2, 'SON', 's1'), jiha()]),
    );
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED');
    expect(step?.data).toMatchObject({
      continuationTermApplied: 'true',
      continuationStipulation: 'ZUHUR_ONLY',
      recordedContinuationStipulation: 'ZUHUR_ONLY',
    });
    expect(step?.message).not.toContain('does not consume one');
  });

  it('2.9c · CONTROL · a deed that records NO term is distinguishable from one whose order ignores it', () => {
    // This is what the old single `continuationStipulation: 'null'` could not express. ORDERED with no
    // recorded stipulation at all: the term was never given, so there is nothing to qualify.
    const result = runDistribution(
      makeRaw([person('s1', 1, 'SON', null), person('s2', 1, 'SON', null), jiha()], {
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
      }),
    );
    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED');
    expect(step?.data).toMatchObject({
      continuationTermApplied: 'false',
      recordedContinuationStipulation: 'null',
    });
    expect(step?.message).not.toContain('does not consume one');
    expect(result.flags).not.toContain('CONTINUATION_STIPULATION_NOT_APPLIED');
  });

  it('2.9d · THE ONE SURVIVING ARM · an UNRECOGNISABLE recorded term is measured on liveness alone', () => {
    /*
     * After Q5 there is exactly one way for the trigger to run without the deed's term: the deed records
     * something the engine does not recognise. `parseContinuationStipulation` would halt on it — but it is
     * only called on `LINEAGE_CONTINUATION`, so on `ORDERED` the value arrives as data and the trigger must
     * decide what to do with it. It degrades to **liveness alone**, i.e. to FEWER reversions, and says so:
     * an unreadable term must never be the reason a charity is paid.
     *
     * Deliberately NOT a halt. Halting would mint a refusal on a deed shape the owner did not rule on, in
     * the direction that refuses rather than the direction that pays; the alternative is recorded in
     * `resolver.recogniseContinuationStipulation` rather than left as a silent choice.
     *
     * By hand: b1 living (a deceased daughter's son), the term unreadable ⇒ liveness alone ⇒ b1 counts as
     * continuing ⇒ the taker is HELD at 0 and b1 takes 27,500,000 × 10/10 under SHARED-like ORDERED tier 2…
     * except ORDERED's entitled tier is the lowest LIVING one, which is b1's ṭabaqa 2 ⇒ b1 = 27,500,000.
     */
    const raw = makeRaw(
      [person('d1', 1, 'DAUGHTER', null, { active: false }), person('b1', 2, 'SON', 'd1'), jiha()],
      { entitlementOrder: 'ORDERED', continuationStipulation: 'zuhur_only' },
    );
    const result = runDistribution(raw);

    expect(result.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(amountOf(result, TAKER_ID)).toBe(0n);
    expect(amountOf(result, 'b1')).toBe(DISTRIBUTABLE);

    const step = result.computationTrace.find((entry) => entry.code === 'REVERSION_NOT_TRIGGERED');
    expect(step?.data).toMatchObject({
      continuingBloodlineIds: 'b1',
      continuationStipulation: 'null',
      continuationTermApplied: 'false',
      recordedContinuationStipulation: 'zuhur_only',
    });
    expect(step?.message).toContain('measured on liveness alone');
    // …and the retired qualifier's wording is NOT what a reader is given, because the reason is different.
    expect(step?.message).not.toContain('does not consume one');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §3 · IS THE STIPULATION ACTUALLY READ?
 *
 * If flipping only `continuationStipulation` changes nothing, the widening is either not implemented
 * or was implemented as the entitled-cohort test.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** d1 (DAUGHTER, depth 1) DEAD; g1 (her son, depth 2) ALIVE; one named taker. */
const FLIP_REGISTER: readonly RawBeneficiary[] = [
  person('d1', 1, 'DAUGHTER', null, { active: false }),
  person('g1', 2, 'SON', 'd1'),
  jiha(),
];

describe('§3 · the deed term is read, and the trigger is not the entitled-cohort test', () => {
  it('3.1 · ZUHUR_ONLY ⇒ the charity takes 27,500,000', () => {
    const result = runDistribution(
      makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_ONLY' }),
    );
    expect(statusesById(result)).toStrictEqual({
      d1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      g1: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      [TAKER_ID]: 'PAID/null:27500000',
    });
    expect(result.lines.find((l) => l.beneficiaryId === TAKER_ID)?.basis.rule).toBe(
      'ULTIMATE_TAKER_MAAL_AL_WAQF',
    );
  });

  it('3.2 · ONE FIELD FLIPPED · ZUHUR_AND_BUTUN ⇒ the grandson takes 27,500,000 and the charity 0', () => {
    const result = runDistribution(
      makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_AND_BUTUN' }),
    );
    expect(statusesById(result)).toStrictEqual({
      d1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      g1: 'PAID/null:27500000',
      [TAKER_ID]: 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
  });

  it('3.3 · the trigger is NOT cohort-emptiness · two equally empty cohorts, opposite outcomes', () => {
    // LEFT  — ZUHUR_ONLY, LINEAGE: g1 excluded BUTUN ⇒ entitled bloodline cohort ∅, line OVER  ⇒ TRIGGERS.
    // RIGHT — SHARED, two living zero-weight heads ⇒ entitled bloodline cohort ∅, line ALIVE ⇒ HOLDS.
    // Same emptiness, opposite verdicts. Anything derived from the cohort could not tell them apart.
    const left = runDistribution(makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_ONLY' }));
    const right = runDistribution(
      makeRaw(
        [
          person('s1', 1, 'SON', null, { stipulatedWeight: '0' }),
          person('s2', 1, 'SON', null, { stipulatedWeight: '0' }),
          jiha(),
        ],
        { entitlementOrder: 'SHARED' },
      ),
    );

    const summarize = (result: DistributionResult) => ({
      entitledBloodline: certifiedDescendantIds(result).filter(
        (id) => result.lines.find((l) => l.beneficiaryId === id)?.status !== 'EXCLUDED',
      ).length,
      applied: result.flags.includes('REVERSION_TO_ULTIMATE_TAKER_APPLIED'),
      taker: String(amountOf(result, TAKER_ID)),
      retained: String(result.totals.retainedMinor),
    });

    expect({ left: summarize(left), right: summarize(right) }).toStrictEqual({
      left: { entitledBloodline: 0, applied: true, taker: '27500000', retained: '0' },
      right: { entitledBloodline: 0, applied: false, taker: '0', retained: '27500000' },
    });
  });

  it('3.4 · the flip is visible in the sweep too · ZUHUR_ONLY triggers on cells ZUHUR_AND_BUTUN holds', () => {
    // If the term were ignored, the two halves of the sweep would trigger on identical cells.
    const key = (cell: Cell) => cell.label.replace(`/${cell.term}/`, '/*/');
    const onlyApplied = new Set(
      sweep()
        .filter((c) => c.term === 'ZUHUR_ONLY' && c.applied)
        .map(key),
    );
    const bothApplied = new Set(
      sweep()
        .filter((c) => c.term === 'ZUHUR_AND_BUTUN' && c.applied)
        .map(key),
    );
    // ZUHUR_AND_BUTUN is the strict test, so its triggering set is a STRICT SUBSET of ZUHUR_ONLY's.
    for (const label of bothApplied) expect(onlyApplied.has(label)).toBe(true);
    expect(onlyApplied.size).toBeGreaterThan(bothApplied.size);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §4 · TWO IMPLEMENTATIONS, ONE RULE — R7-D2's shape, hunted
 *
 * `resolver.continuesTheLine` and `invariants.independentReversionState` each derive the
 * continuing-line test. They must never disagree (a disagreement is refused as
 * `DISTRIBUTION_INVARIANT_BREACH`, which is how R7-D2 presented), and they must be genuinely
 * independent — an invariant that read the resolver's answer would be a restatement, not a check.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A context whose LINES and TOTALS are deliberately inert, so only `input` + `flags` can decide. */
function inertCtx(raw: DistributionInputRaw, flags: readonly RunFlag[]): InvariantContext {
  const input: DistributionInput = parseDistributionInput(raw);
  // The real run supplies a well-formed waterfall/totals shape without importing engine internals.
  // Its LINES are then thrown away and replaced with all-zero EXCLUDED ones below, so nothing the
  // resolver decided about the money can reach the invariant — only `input` and the forged `flags`.
  const result = runDistribution(raw);
  return {
    input,
    distributionType: 'MONETARY',
    order: input.entitlementOrder as InvariantContext['order'],
    waterfall: result.waterfall,
    // Every line zero and EXCLUDED: nothing about the money can influence the verdict below.
    lines: result.lines.map((line) => ({
      ...line,
      status: 'EXCLUDED' as const,
      entitledMinor: 0n as (typeof line)['entitledMinor'],
      reasonCode: null,
      gateFlags: [],
    })),
    totals: result.totals,
    floorsMinor: [],
    entitledIds: [],
    flags,
  };
}

function breachOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    if (!isDomainError(error)) throw error;
    expect(error.code).toBe('DISTRIBUTION_INVARIANT_BREACH');
    expect(error.details).toMatchObject({ invariantId: 'I-R1' });
    return error.message;
  }
  expect.unreachable('I-R1 must refuse this context');
  throw new Error('unreachable');
}

describe('§4 · the invariant recomputes the widened trigger for itself', () => {
  it('4.1 · every one of the 7,680 sweep cells reported I-R1 as CHECKED', () => {
    // A disagreement between the two implementations is a DISTRIBUTION_INVARIANT_BREACH, so the sweep
    // completing at all is the cross-check. This asserts the check was not silently skipped.
    const unchecked = sweep()
      .filter((cell) => !cell.result.invariantsChecked.includes('I-R1'))
      .map((cell) => cell.label);
    expect(unchecked).toStrictEqual([]);
  });

  it('4.2 · a run that CLAIMS the reversion fired while a continuing line lives is refused', () => {
    // FLIP_REGISTER under ZUHUR_AND_BUTUN: g1 is living and continues the line. A forged
    // REVERSION_TO_ULTIMATE_TAKER_APPLIED must not be believed.
    const message = breachOf(() => {
      assertReversionIntegrity(
        inertCtx(makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_AND_BUTUN' }), [
          'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
        ]),
      );
    });
    expect(message).toContain('g1');
    expect(message).toContain('CONTINUES');
  });

  it('4.3 · a run that HIDES a fired reversion is refused too — the flag is checked in both directions', () => {
    const message = breachOf(() => {
      assertReversionIntegrity(
        inertCtx(makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_ONLY' }), []),
      );
    });
    expect(message).toContain('does not report');
  });

  it('4.4 · INDEPENDENCE · the invariant reads `continuationStipulation` itself, from `input` alone', () => {
    // Identical register, identical (inert, all-zero, all-EXCLUDED) lines, identical flags. The only
    // difference is one field of `input`. If the invariant were echoing the resolver, or reading the
    // lines, both calls would behave the same.
    expect(() => {
      assertReversionIntegrity(
        inertCtx(makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_ONLY' }), [
          'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
        ]),
      );
    }).not.toThrow();

    breachOf(() => {
      assertReversionIntegrity(
        inertCtx(makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_AND_BUTUN' }), [
          'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
        ]),
      );
    });
  });

  it("4.5 · ✓ INVERTED BY Q5 · the ORDER no longer enters the invariant's reversion test at all", () => {
    /*
     * ⚠ **INVERTED, AND THE OLD ASSERTION IS QUOTED.** This case read *"INDEPENDENCE · the invariant
     * re-narrows `entitlementOrder` itself as well"* and demanded a **breach** on this exact context: same
     * register, same `ZUHUR_ONLY`, order `SHARED` — because the invariant, like the resolver, scoped the
     * term to `LINEAGE_CONTINUATION` and therefore did NOT treat the line as over. Memo Q5 retires that
     * scoping on **both** sides in one change (R7-D2's lesson: a check that still keys on the order while
     * the thing checked does not is how the two drift), so the same context must now be ACCEPTED.
     *
     * That the assertion flips **direction** rather than being deleted is what makes it a test of the
     * ruling: only an invariant that genuinely stopped reading `entitlementOrder` passes here AND passes
     * §4.4 (where flipping the TERM alone still flips the verdict).
     */
    for (const entitlementOrder of ['SHARED', 'ORDERED', 'LINEAGE_CONTINUATION'] as const) {
      expect(() => {
        assertReversionIntegrity(
          inertCtx(
            makeRaw(FLIP_REGISTER, { continuationStipulation: 'ZUHUR_ONLY', entitlementOrder }),
            ['REVERSION_TO_ULTIMATE_TAKER_APPLIED'],
          ),
        );
      }, entitlementOrder).not.toThrow();
    }

    // …and the mirror, so this is not merely "the invariant became permissive": with the term flipped, all
    // three orders refuse the same forged flag. The term decides; the order does not.
    for (const entitlementOrder of ['SHARED', 'ORDERED', 'LINEAGE_CONTINUATION'] as const) {
      breachOf(() => {
        assertReversionIntegrity(
          inertCtx(
            makeRaw(FLIP_REGISTER, {
              continuationStipulation: 'ZUHUR_AND_BUTUN',
              entitlementOrder,
            }),
            ['REVERSION_TO_ULTIMATE_TAKER_APPLIED'],
          ),
        );
      });
    }
  });

  it('4.6 · INDEPENDENCE · a placeholder register is refused the flag by the invariant too', () => {
    const message = breachOf(() => {
      assertReversionIntegrity(
        inertCtx(
          makeRaw([
            placeholder('ph1', 1, 'DAUGHTER', null, { active: false }),
            person('b1', 2, 'SON', 'ph1'),
            jiha(),
          ]),
          ['REVERSION_TO_ULTIMATE_TAKER_APPLIED'],
        ),
      );
    });
    expect(message).toContain('unenumerated placeholder');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §5 · I-R1 ON EVERY RUN, CONSERVATION, DETERMINISM, NO MUTATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§5 · the guarantees the widening most endangers', () => {
  it('5.1 · I-R1 · on no cell is a charity paid a halala beside a certified descendant', () => {
    // Recomputed from the lines rather than trusted: `basis.lineageDepth !== null` is the engine's own
    // certification of descent, and `basis.kind === 'CHARITABLE_JIHA'` the charitable side.
    const offenders: string[] = [];
    for (const cell of sweep()) {
      const paidCharity = cell.result.lines.filter(
        (l) => l.basis.kind === 'CHARITABLE_JIHA' && (l.entitledMinor as bigint) !== 0n,
      );
      const paidBlood = cell.result.lines.filter(
        (l) => l.basis.lineageDepth !== null && (l.entitledMinor as bigint) !== 0n,
      );
      if (paidCharity.length > 0 && paidBlood.length > 0) offenders.push(cell.label);
    }
    expect(offenders).toStrictEqual([]);
  });

  it('5.2 · conservation holds on every cell — paid + withheld + crossBorder + retained == distributable', () => {
    const offenders: string[] = [];
    for (const cell of sweep()) {
      const { paidMinor, withheldMinor, crossBorderMinor, retainedMinor } = cell.result.totals;
      const sum =
        (paidMinor as bigint) +
        (withheldMinor as bigint) +
        (crossBorderMinor as bigint) +
        (retainedMinor as bigint);
      if (sum !== DISTRIBUTABLE) offenders.push(`${cell.label} Σ=${String(sum)}`);
      if (conserved(cell.result) !== DISTRIBUTABLE) offenders.push(`${cell.label} lines+retained`);
      if (cell.result.waterfall.distributableMinor !== DISTRIBUTABLE) {
        offenders.push(`${cell.label} waterfall`);
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it('5.3 · every newly-triggering shape replays byte-for-byte and mutates no input', () => {
    // A newly-triggering cell = the reversion fires WITH living blood descendants on the register.
    // That shape did not exist before 2026-08-11, so determinism and purity are re-proved on it.
    const shapes: readonly RawBeneficiary[][] = [
      // one survivor, break at depth 1
      [person('d1', 1, 'DAUGHTER', null, { active: false }), person('b1', 2, 'SON', 'd1'), jiha()],
      // two survivors, break at depth 1, three deep
      [
        person('d1', 1, 'DAUGHTER', null, { active: false }),
        person('b1', 2, 'SON', 'd1'),
        person('c1', 3, 'SON', 'b1'),
        jiha(),
      ],
      // break at depth 2, plus a dead sibling line
      [
        person('s1', 1, 'SON', null, { active: false }),
        person('d2', 2, 'DAUGHTER', 's1', { active: false }),
        person('g3', 3, 'SON', 'd2'),
        jiha(),
      ],
    ];

    for (const beneficiaries of shapes) {
      const raw = makeRaw(beneficiaries);
      const before = JSON.stringify(raw, (_key, value) =>
        typeof value === 'bigint' ? String(value) : value,
      );
      const first = runDistribution(raw);
      const second = runDistribution(raw);
      const after = JSON.stringify(raw, (_key, value) =>
        typeof value === 'bigint' ? String(value) : value,
      );

      expect(first.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
      expect(amountOf(first, TAKER_ID)).toBe(DISTRIBUTABLE);
      expect(oracleLivingIds(beneficiaries).length).toBeGreaterThan(0);
      expect(canonicalizeResult(second)).toBe(canonicalizeResult(first));
      expect(after).toBe(before);
    }
  });

  it('5.4 · a 70/30 TAKER VECTOR on a newly-triggering lineage run — R7-e beside I-L1, which must stand down', () => {
    // The configuration the widening makes newly reachable and which touches two rules at once: an
    // UNTIERED taker vector splitting by deed weight, on a LINEAGE_CONTINUATION run whose register
    // still holds a living blood descendant. R7-e says the takers split 70/30; I-L1 says a lineage
    // cohort is equal per head. Both cannot be asserted of the same lines — I-L1 must stand down and
    // say so (the R6-I5 honesty rule), with I-R1 standing in its place.
    //
    // By hand: 27,500,000 × 70/100 = 19,250,000; 27,500,000 × 30/100 = 8,250,000.
    //          19,250,000 + 8,250,000 = 27,500,000 exactly ⇒ residual 0, retained 0.
    //          Spread over the two entitled lines = 19,250,000 − 8,250,000 = 11,000,000, which is
    //          I-L1's bound (1) exceeded by eleven million — so a reported I-L1 would be a false claim.
    const raw = makeRaw(
      [
        person('d1', 1, 'DAUGHTER', null, { active: false }),
        person('b1', 2, 'SON', 'd1'),
        jiha('maal-a', { stipulatedWeight: '70', bankingRefForProceeds: 'FAKE-IBAN-CL-JA' }),
        jiha('maal-b', { stipulatedWeight: '30', bankingRefForProceeds: 'FAKE-IBAN-CL-JB' }),
      ],
      {
        reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['maal-a', 'maal-b'] },
      },
    );
    const result = runDistribution(raw);

    expect(statusesById(result)).toStrictEqual({
      b1: 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
      d1: 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'maal-a': 'PAID/null:19250000',
      'maal-b': 'PAID/null:8250000',
    });
    expect(result.totals.residualMinor).toBe(0n);
    expect(result.totals.retainedMinor).toBe(0n);
    expect(conserved(result)).toBe(DISTRIBUTABLE);
    // I-R1 is asserted; I-L1 makes no claim about a charitable split and must NOT be reported.
    expect(result.invariantsChecked).toContain('I-R1');
    expect(result.invariantsChecked).not.toContain('I-L1');
    // …and a living blood descendant is on the register while both charities are paid — the widening's
    // shape, with I-R1's mirror intact because b1 holds 0n.
    expect(oracleLivingIds(raw.beneficiaries)).toStrictEqual(['b1']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §6 · COVERAGE — INSTRUMENTED AND COUNTED, never read off the source
 *
 * A property whose generator cannot reach a configuration reports its silence as success, at scale
 * (R6-C1's permanent lesson). So the newly-triggering shape is COUNTED, its count is floored, and the
 * floor is shown to be sensitive to the generator rather than to the assertion.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface Coverage {
  /** APPLIED with ≥1 living blood descendant on the register — the shape the widening created. */
  readonly newlyTriggering: number;
  /** APPLIED with nobody living — the shape the strict reading already had. */
  readonly strictTriggering: number;
  /** Reversion held while a continuing line is alive. */
  readonly heldByContinuingLine: number;
  /** Held while a continuing line is alive AND nobody is entitled — boundary 1's flag. */
  readonly heldNobodyEntitled: number;
}

function coverageOf(cells: readonly Cell[]): Coverage {
  let newlyTriggering = 0;
  let strictTriggering = 0;
  let heldByContinuingLine = 0;
  let heldNobodyEntitled = 0;
  for (const cell of cells) {
    if (cell.applied) {
      if (cell.living.length > 0) newlyTriggering += 1;
      else strictTriggering += 1;
    } else if (cell.continuing.length > 0) {
      heldByContinuingLine += 1;
      if (cell.result.flags.includes('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING')) {
        heldNobodyEntitled += 1;
      }
    }
  }
  return { newlyTriggering, strictTriggering, heldByContinuingLine, heldNobodyEntitled };
}

describe('§6 · the sweep actually reaches the shape it claims to test', () => {
  it('6.1 · the newly-triggering shape is generated in the EXACT hand-derived quantity', () => {
    /*
     * Every one of these four is derived by hand, not read off the run — a floor chosen to sit under a
     * measured number proves nothing about the generator, so each is an equality with its own
     * combinatorial argument.
     *
     * ── newlyTriggering (APPLIED with ≥1 living blood descendant) ──
     * ✓ **Q5 · reachable under `ZUHUR_ONLY` on ALL THREE ORDERS** — it used to be `LINEAGE_CONTINUATION`
     * only, and §6.3 asserted that scoping; it now asserts the opposite. The per-tree LIVENESS/LINK pattern
     * count below is unchanged and **order-independent by construction** (the trigger reads descent,
     * liveness and the deed's term — never the order), so each tree's count is simply multiplied by the
     * number of orders it is swept on. Need: every living member broken, and ≥1 living. A depth-1 member
     * has an EMPTY ancestor chain and so can never be broken ⇒ every depth-1 member must be dead.
     *
     * TREE A (a1, a2 roots; b1 < a1; c1 < b1) — a1 and a2 dead throughout:
     *   · a1 = DAUGHTER ⇒ b1 broken and c1 broken ⇒ any non-empty subset of {b1, c1} alive: 3 patterns,
     *     × free links on a2, b1, c1 (2³ = 8)                                            = 24
     *   · a1 = SON ⇒ b1 unbroken ⇒ b1 dead; c1 broken needs b1 = DAUGHTER; c1 alive: 1 pattern,
     *     × free links on a2, c1 (2² = 4)                                                =  4
     *   ⇒ 28
     * TREE B (p1, p2 roots; q1 < p1; q2 < p2; r1 < q1) — p1 and p2 dead throughout:
     *   · p1 = D, p2 = D ⇒ q1, q2, r1 all broken ⇒ 7 non-empty subsets × 2³ links       = 56
     *   · p1 = D, p2 = S ⇒ q2 unbroken ⇒ q2 dead; {q1, r1} broken ⇒ 3 subsets × 2³       = 24
     *   · p1 = S, p2 = D ⇒ q1 unbroken ⇒ q1 dead; r1 broken iff q1 = DAUGHTER:
     *       q1 = D ⇒ {q2, r1} broken ⇒ 3 subsets × 2² links (q2, r1)                     = 12
     *       q1 = S ⇒ r1 unbroken ⇒ r1 dead ⇒ only {q2} ⇒ 1 × 2²                          =  4
     *   · p1 = S, p2 = S ⇒ q1, q2 dead; q1 = D ⇒ r1 broken, alive ⇒ 1 × 2² = 4; q1 = S ⇒ nobody = 0
     *   ⇒ 56 + 24 + 12 + 4 + 4 = 100
     *
     * × the orders each tree is swept on (Q5): **A 28 × 3 = 84**, **B 100 × 3 = 300** ⇒ **384**.
     * (Pre-Q5 this was 28 × 1 + 100 × 1 = 128, because only the LINEAGE cells could reach the shape.)
     *
     * ── strictTriggering (APPLIED with nobody living) ──
     * Exactly the all-dead liveness pattern, on every order/term/link combination:
     *   tree A: 3 orders × 2 terms × 2⁴ links × 1 = 96;  tree B: 3 × 2 × 2⁵ × 1 = 192  ⇒ **288**.
     *
     * ── heldByContinuingLine ──
     * There are no placeholders in this sweep and every register is non-empty, so HELD ⇔ a continuing
     * descendant lives (§1.3's bidirectional equality): 7,680 − 384 − 288 = **7,008**.
     *
     * ── heldNobodyEntitled ──
     * Boundary 1's flag needs an order that applies deed weights to an EMPTY cohort, and every family
     * weight in this sweep is '10'. On LINEAGE a live continuing line always yields an entitled head
     * (the highest living one has only deceased ancestors above it); on ORDERED/SHARED a living member
     * at weight 10 is entitled. So 0 — §2.1/§2.2/§2.9 carry that state instead, at named figures.
     */
    expect(coverageOf(sweep())).toStrictEqual({
      newlyTriggering: 384,
      strictTriggering: 288,
      heldByContinuingLine: 7008,
      heldNobodyEntitled: 0,
    });
    // 384 + 288 + 7,008 + 0 = 7,680 — the whole sweep is partitioned, so no cell is uncounted.
    expect(384 + 288 + 7008).toBe(sweep().length);
  });

  it('6.2 · the floor is SENSITIVE to the generator, not to the assertion', () => {
    // Restricting the sweep to ZUHUR_AND_BUTUN removes the only stipulation under which a living
    // descendant can fail to continue a line — and the newly-triggering count collapses to zero. If
    // 6.1 were passing for a reason other than the shape being generated, this would not.
    const strictHalf = sweep().filter((cell) => cell.term === 'ZUHUR_AND_BUTUN');
    expect(strictHalf.length).toBeGreaterThan(0);
    expect(coverageOf(strictHalf).newlyTriggering).toBe(0);
    // And the widened half is where every one of them comes from.
    const widenedHalf = sweep().filter((cell) => cell.term === 'ZUHUR_ONLY');
    expect(coverageOf(widenedHalf).newlyTriggering).toBe(coverageOf(sweep()).newlyTriggering);
  });

  it('6.3 · ✓ INVERTED BY Q5 · the newly-triggering shape now appears on ALL THREE orders, in hand-derived counts', () => {
    /*
     * ⚠ **THIS ASSERTION USED TO BE THE SCOPING, AND IT IS INVERTED RATHER THAN LOOSENED.** It read
     * *"and it is sensitive to the ORDER scoping too — every newly-triggering cell is LINEAGE"* and
     * asserted `[...orders] === ['LINEAGE_CONTINUATION']`. Memo Q5 retires the scoping, so the same
     * measurement must now find the shape on every order — and asserting the SET alone would be a weak
     * test, so the per-order counts are asserted from the §6.1 derivation: tree A contributes 28 and tree
     * B 100 per order, and both trees are swept on all three.
     */
    const perOrder = new Map<MoneyOrder, number>();
    for (const cell of sweep()) {
      if (!cell.applied || cell.living.length === 0) continue;
      perOrder.set(cell.order, (perOrder.get(cell.order) ?? 0) + 1);
    }
    expect([...perOrder.entries()].sort()).toStrictEqual([
      ['LINEAGE_CONTINUATION', 128],
      ['ORDERED', 128],
      ['SHARED', 128],
    ]);
    // 28 (tree A) + 100 (tree B) = 128 per order, × 3 orders = 384 = §6.1's `newlyTriggering`.
    expect(28 + 100).toBe(128);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * §7 · THE Q5 DELTA — what the ruling actually moved, enumerated
 *
 * Q5's own proof, in the shape R7-d's was: the widening's content is the SET OF CELLS whose answer it
 * changed. Every cell is judged twice — once under the deed's term (the rule now) and once under the
 * retired scoping ({@link preQ5ScopedTerm}) — and the difference is counted, characterised, and checked
 * for the one guarantee a widened reversion trigger endangers.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§7 · the ruling’s delta, and I-R1 over every cell of it', () => {
  /** Cells where the retired scoping and the ruling disagree about whether the bloodline is over. */
  function movedCells(): readonly Cell[] {
    return sweep().filter(
      (cell) => (cell.continuing.length === 0) !== (cell.preQ5Continuing.length === 0),
    );
  }

  it('7.1 · the delta is exactly 256 cells, all ORDERED/SHARED + ZUHUR_ONLY, and all in ONE direction', () => {
    /*
     * By hand: the two readings can only differ where the term is `ZUHUR_ONLY` (under `ZUHUR_AND_BUTUN`
     * both collapse to liveness) and where the order is NOT `LINEAGE_CONTINUATION` (there the retired
     * scoping already applied the term). On such a cell the retired reading counts every living descendant
     * as continuing, so it says "over" iff nobody lives — while the ruling says "over" iff nobody lives on
     * a continuing line. They differ exactly on the newly-triggering cells of those orders:
     *   §6.3's per-order count 128 × the two non-lineage orders = **256**.
     * And the direction is one-way by construction: the ruling can only find MORE bloodlines over, never
     * fewer, so no cell moves from triggered to held.
     */
    const moved = movedCells();
    expect(moved).toHaveLength(256);
    for (const cell of moved) {
      expect(cell.term, cell.label).toBe('ZUHUR_ONLY');
      expect(cell.order, cell.label).not.toBe('LINEAGE_CONTINUATION');
      // The ruling triggered it; the retired reading held it. Never the reverse.
      expect(cell.applied, cell.label).toBe(true);
      expect(cell.preQ5Continuing.length, cell.label).toBeGreaterThan(0);
      expect(cell.living.length, cell.label).toBeGreaterThan(0);
    }
    // 128 per non-lineage order, matching §6.3 — the same number derived from two directions.
    expect(128 * 2).toBe(256);
  });

  it('7.2 · on every moved cell the taker takes the whole distributable and every descendant holds 0', () => {
    const offenders: string[] = [];
    for (const cell of movedCells()) {
      if (amountOf(cell.result, TAKER_ID) !== DISTRIBUTABLE) {
        offenders.push(`${cell.label} taker=${String(amountOf(cell.result, TAKER_ID))}`);
      }
      for (const id of certifiedDescendantIds(cell.result)) {
        if (amountOf(cell.result, id) !== 0n) {
          offenders.push(`${cell.label} ${id}=${String(amountOf(cell.result, id))}`);
        }
      }
      if ((cell.result.totals.retainedMinor as bigint) !== 0n) {
        offenders.push(`${cell.label} retained=${String(cell.result.totals.retainedMinor)}`);
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it('7.3 · I-R1 was ASSERTED on every moved cell, and never breached on any of them', () => {
    // The sweep completing at all is the cross-check (a resolver/invariant disagreement throws), but a
    // skipped invariant is silent, so the id is asserted per cell. This is the guarantee the ruling leans
    // on: the taker's line is certified by I-R1, not by I5 (memo Q1).
    const unchecked = movedCells()
      .filter((cell) => !cell.result.invariantsChecked.includes('I-R1'))
      .map((cell) => cell.label);
    expect(unchecked).toStrictEqual([]);
    expect(movedCells().length).toBeGreaterThan(0);
  });

  it('7.4 · the LIVING descendants the delta leaves unpaid are EXCLUDED with a reason, and at least one names the line break', () => {
    /*
     * Q5's forced consequence, enumerated rather than argued: on a moved cell a **living** descendant
     * exists and is not paid. Every such line must be `EXCLUDED` carrying a reason — a line holding 0 with
     * `reasonCode: null` would be an unexplained non-payment on a beneficiary-facing statement — and on
     * every moved cell **at least one** of them must name the line break, which is what proves the Q5
     * override fires rather than some pre-existing exclusion doing the work.
     *
     * ⚠ Two codes are legitimate, and the second is not slack: `BUTUN_LINE_NOT_CONTINUED` is the override,
     * and `UPPER_TABAQA_EXTANT` is what `ORDERED` already said about a living member in a tier above the
     * lowest living one — invariant **I5 independently DEMANDS that exact code there**, so the override
     * must not overwrite it (it is applied only where the order's own verdict was `null`). `TABAQA_EXTINCT`
     * on a living member would be a defect — their tier cannot be extinct while they live — so it is
     * excluded from the allowance rather than tolerated.
     *
     * ⚠ And this only inspects the LIVING. A *deceased* descendant carrying a tier code is correct and I5
     * requires it; an earlier draft of this assertion swept all zero-holding descendants and produced 408
     * "offenders" that were the tier rule working exactly as specified — recorded because a test whose
     * allowance is too narrow is as misleading as one whose allowance is too wide.
     */
    const allowed = new Set(['BUTUN_LINE_NOT_CONTINUED', 'UPPER_TABAQA_EXTANT']);
    const offenders: string[] = [];
    for (const cell of movedCells()) {
      let namedTheBreak = 0;
      for (const id of cell.living) {
        const line = cell.result.lines.find((entry) => entry.beneficiaryId === id);
        if (line === undefined) {
          offenders.push(`${cell.label} ${id} has NO LINE`);
          continue;
        }
        if (line.status !== 'EXCLUDED' || (line.entitledMinor as bigint) !== 0n) {
          offenders.push(
            `${cell.label} ${id} ${line.status}:${String(line.entitledMinor)} — a living descendant was PAID on a reverted run`,
          );
          continue;
        }
        if (line.reasonCode === null || !allowed.has(line.reasonCode)) {
          offenders.push(`${cell.label} ${id} reason=${line.reasonCode ?? 'null'}`);
          continue;
        }
        if (line.reasonCode === 'BUTUN_LINE_NOT_CONTINUED') namedTheBreak += 1;
      }
      if (namedTheBreak === 0) offenders.push(`${cell.label} — NO line named the break`);
    }
    expect(offenders).toStrictEqual([]);
  });

  it('7.5 · SENSITIVITY · the delta is empty when the term cannot break a line', () => {
    // If §7.1 were passing for a reason other than the ruling being implemented, this would not: restrict
    // to ZUHUR_AND_BUTUN and the two readings coincide everywhere, so nothing moved.
    const both = sweep().filter((cell) => cell.term === 'ZUHUR_AND_BUTUN');
    expect(both.length).toBeGreaterThan(0);
    expect(
      both.filter((cell) => (cell.continuing.length === 0) !== (cell.preQ5Continuing.length === 0)),
    ).toStrictEqual([]);
  });
});
