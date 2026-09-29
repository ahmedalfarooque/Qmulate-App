/**
 * `distribution/__tests__/fixtures/worked-examples.ts` — §08's worked examples as TypeScript
 * constants (S3 decision **D3**).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ALL DATA HERE IS INVENTED. NO CLIENT DATA, EVER.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every id, weight, IBAN-shaped string and entity name below is fictional. The *shape* is derived
 * from `data/fixtures/sample-waqf.json` (itself invented) so that E5/S6 can later wire the same
 * scenarios against the seeded database — but nothing here reads that file, or any file.
 * `archive/raw-intake/` is never touched: it holds a real family's real names, deed numbers and bank
 * details (CLAUDE.md hard constraints).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A TYPESCRIPT MODULE AND NOT THE JSON FIXTURE (decision D3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/domain` is the pure core: **no I/O of any kind**. Reading
 * `data/fixtures/sample-waqf.json` at test time would put a filesystem read on the engine's own test
 * path, make the suite depend on a file outside the package, and couple the engine's expectations to
 * a fixture that E5/S6 still has to change (see `FIXTURE_DELTA_REQUIRED` at the bottom of this file
 * — the JSON is currently *missing* fields these examples need, so the coupling would not even work).
 * The numbers are therefore literals here, and the JSON's own delta is written down as data rather
 * than applied in S3.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERY EXPECTED FIGURE IS IN HALALAS AND WAS DERIVED BY HAND, NOT COPIED FROM OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 SAR = 100n. Each `EXPECTED_*` constant below carries the arithmetic that produced it in a
 * comment, so a reader can check the engine against §08 without running it. An expected value copied
 * from actual output proves nothing, so none was.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS §08's, AND WHAT IS ILLUSTRATIVE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08's five worked examples lean on data the JSON fixture does not contain. Every such record is
 * marked `ILLUSTRATIVE EXTENSION` at its definition. In summary:
 *
 *  · **A** (`waqf-001`, ORDERED) — grounded: `rev-001` 350,000.00, `fee-001` 10% of revenue,
 *    ben-001…ben-003. The `maintenance` RULE is an extension (see `MAINTENANCE_RULE_IS_NOT_AN_EXPENSE`).
 *  · **B** (`waqf-002`, SHARED) — the 200,000.00 revenue and the 5% ṣiyāna rule are extensions; there
 *    is no revenue row for `waqf-002` in the JSON at all.
 *  · **C / C2** (`waqf-004`, direct use) — C's nil period is grounded; C2's incidental rent and both
 *    beneficiary records are extensions.
 *  · **D** (`waqf-003`, JOINT) — **now a REFUSED input** (ADR-0009 R5), kept verbatim as
 *    {@link exampleDJoint} so it can never quietly compute again. `rev-002` 1,800,000.00 and
 *    `exp-e-003` 120,000.00 are grounded; the ṣiyāna rule, the CAPITAL receipt, ben-007, ben-008 and
 *    ben-006's `disbursingEntity` are extensions.
 *  · **D-خ** ({@link exampleDCharitable}) — D's money, gates and corpus proof re-homed onto a legal
 *    `PUBLIC_CHARITABLE` waqf: three jihas at the same 40/30/30. ben-306 / ben-307 are extensions.
 *  · **E** (`waqf-001`, stale KYC) — A with one field changed: ben-001's `kycLastRefreshed`.
 *  · **F** (residual prover) — wholly invented; §08's own 100.00-three-ways case.
 *  · **G / G′ / H** (`waqf-005`, LINEAGE_CONTINUATION) — **wholly invented** and not in §08 at all;
 *    ADR-0009's entitlement model as corrected by **R-FRONTIER**. One three-generation, four-branch,
 *    sixteen-member tree, run under `ZUHUR_ONLY` (G) and `ZUHUR_AND_BUTUN` (G′) so the continuation
 *    stipulation is the ONLY difference between two results, plus H, the per-capita residual prover.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ R6 · EVERY FAMILY BENEFICIARY NOW CARRIES A LINEAGE EDGE, ON EVERY ORDER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The product owner answered ADR-0009's open question 10 **yes**: eligibility comes from descent, so
 * the descent must be recorded whatever rule the deed uses. A `FAMILY` or `CATEGORY_ONLY` member with
 * no `lineageLink` halts `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` on `ORDERED` and `SHARED` too,
 * and `tabaqa` must agree with the depth the edges derive. So waqf-001 (A/E), waqf-002 (B) and the
 * residual prover (F) all carry real, coherent parent chains now — the tier contrast in Example A is
 * expressed *through* a two-node graph rather than beside one.
 *
 * The **one deliberate exception** is `waqf-004` (C / C2): its cohort is edgeless precisely because a
 * direct-use run must short-circuit before the graph is built, and an input that would otherwise halt
 * is the only way to observe that ordering. See {@link BEN_DIRECT_USE_A}.
 *
 * A **خيري** (`PUBLIC_CHARITABLE`) cohort is the mirror image and carries **no** lineage edge at all
 * (ESC-1, `DESCENDANT_ON_CHARITABLE_WAQF`).
 *
 * ⚠ **CORRECTION (R7, product owner 2026-08-10) — this paragraph used to end *"and a ذري
 * (`FAMILY_DHURRI`) cohort may hold no charitable jiha at all (R6-D1,
 * `CHARITABLE_JIHA_ON_FAMILY_WAQF`)"*, and that sentence was FALSE of this very file.** It is kept
 * here as the record rather than deleted, because {@link exampleJ} — `waqf-006`, a ذري bloodline plus
 * `jiha-601` — is exactly the cohort it said could not exist, and a header that contradicts a fixture
 * defined 1,600 lines below it is how the next reader is taught something untrue. The rule as it now
 * stands: a ذري cohort **may** hold a `CHARITABLE_JIHA` **if and only if** the waqf-level `reversion`
 * clause names it as the endowment's ultimate taker (مآل الوقف). Unnamed ⇒ still
 * `CHARITABLE_JIHA_ON_FAMILY_WAQF`; named ⇒ legal, and EXCLUDED
 * (`REVERSION_PENDING_LIVING_BLOODLINE`) until no living descendant remains on record at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHICH FIXTURES ARE MEANT TO BE REFUSED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Three inputs here exist so that a refusal has a subject, and they must NEVER compute:
 * {@link exampleDJoint} (`WAQF_TYPE_JOINT_NOT_SUPPORTED`),
 * {@link exampleDJointReEnteredAsFamily} (`COHORT_MIXES_CHARITABLE_AND_FAMILY` — the re-entry route),
 * and, in the sibling suites, the ẓuhūr/buṭūn and lineage-graph malformations built from
 * {@link LINEAGE_COHORT}. Inverting rather than deleting them is the same discipline used when the
 * tiered-jiha defect was closed: an input that once paid money and now must not is pinned.
 *
 * ⚠ Every regulatory figure applied through these fixtures — the 10% ʿushr rate, the 3-month post-FYE
 * window, the 12-month KYC refresh interval, the `EARLIER_OF` binding-calendar selector — is
 * **unverified — may be stale (confirm vs primary law)** (CLAUDE.md binding rule 3). They are here as
 * *injected caller inputs*, which is exactly the discipline the contract enforces: none of them is a
 * default inside the engine.
 */

import { dual } from '../../../dates/index.js';
import { UNVERIFIED_NOTE } from '../../../settings.js';
import type {
  BeneficiaryLine,
  BeneficiaryKind,
  DistributionInputRaw,
  EntitlementRule,
  GateReasonCode,
  InvariantId,
  LineReasonCode,
  LineStatus,
  Residency,
  RunFlag,
  VerificationStatus,
  WaqfClassification,
  WaqfType,
} from '../../contract.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The injected clock, the injected deadline, the resolved policy
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `asOf` — one instant in two calendars, built by the ONE Umm al-Qura implementation.
 *
 * Deliberately `dual('2026-07-14')` rather than a hand-typed pair: `assertInputConsistency` asserts
 * `toHijri(asOf.gregorian) === asOf.hijri`, and a fixture that hard-codes the Hijri half would be a
 * second (unverified) conversion. `dual` resolves it to `1448-01-29`.
 */
export const AS_OF = dual('2026-07-14');

/** §08 Example A's run date, restated as literals so the test can pin what `dual` produced. */
export const AS_OF_GREGORIAN = '2026-07-14';
export const AS_OF_HIJRI = '1448-01-29';

/**
 * The injected post-FYE deadline for a `12-31` fiscal year end. **Two different days, on purpose.**
 *
 * `2026-12-31 + 3 Gregorian months = 2027-03-31`, while `Hijri(2026-12-31) = 1448-07-22` and
 * `1448-07-22 + 3 Hijri months = 1448-10-22`, which converts back to **2027-03-30** — one day
 * earlier. Under `EARLIER_OF` (decision D2) the Hijri date therefore binds, and the run is judged a
 * day sooner than a Gregorian-only engine would judge it. `worked-examples.test.ts` verifies both
 * halves' provenance against `../../../dates` rather than trusting these strings.
 *
 * ⚠ the 3-month window is unverified — may be stale (confirm vs primary law). Its `Setting` key
 * travels with the run so the row that produced a wrong due date is findable from the result.
 */
export const DEADLINE_3M_POST_FYE = Object.freeze({
  gregorian: '2027-03-31',
  hijri: '1448-10-22',
  settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
  months: 3,
  unverified: true,
}) satisfies DistributionInputRaw['deadline'];

/** The Hijri deadline on the Gregorian axis — `fromHijri('1448-10-22')`. */
export const HIJRI_DEADLINE_AS_GREGORIAN = '2027-03-30';

/** `Hijri(FYE)`, so the "+3 Hijri months" claim above is checkable rather than asserted. */
export const FYE_HIJRI = '1448-07-22';

/**
 * Resolved configuration. Every field required — the engine has no coded default for any of them
 * (binding rule 3), so a fixture that omitted one would fail to parse, which is the point.
 *
 * ⚠ `kycRefreshMonths` (`Setting kyc.refreshIntervalMonths`), `roundingMethod`
 * (`distribution.rounding.method`, OQ-01) and `bindingCalendar`
 * (`distribution.deadline.bindingCalendar`, D2) are all unverified — confirm vs primary law.
 */
export function policy(
  patch: Partial<DistributionInputRaw['policy']> = {},
): DistributionInputRaw['policy'] {
  return {
    kycRefreshMonths: 12,
    roundingUnitMinor: 1n,
    roundingMethod: 'LARGEST_REMAINDER_HALF_UP',
    bindingCalendar: 'EARLIER_OF',
    unverifiedNote: UNVERIFIED_NOTE,
    ...patch,
  };
}

/** The injected deadline, optionally patched (AT-13 re-runs it under a different selector). */
export function deadline(
  patch: Partial<DistributionInputRaw['deadline']> = {},
): DistributionInputRaw['deadline'] {
  return { ...DEADLINE_3M_POST_FYE, ...patch };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Beneficiary records
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type BeneficiaryRaw = DistributionInputRaw['beneficiaries'][number];

/**
 * A beneficiary (mustahiq / مستحق) with every field stated.
 *
 * No optional parameters and no defaults, mirroring `beneficiaryInputSchema`: `active` is a *vital
 * status* and `residency` decides whether a payment is routed cross-border, so a fixture helper that
 * defaulted either would be defaulting exactly what the contract refuses to default.
 *
 * **No `name`.** The contract has no such field: the result and its `computationTrace` are persisted
 * and hashed, and a beneficiary name on that surface would be a PII leak (AT-16). Display names for
 * these fictional people live in {@link DISPLAY_NAMES}, which never enters an engine input.
 */
export function beneficiary(spec: {
  readonly id: string;
  readonly kind: BeneficiaryKind;
  readonly active: boolean;
  readonly tabaqa: number | null;
  /**
   * The lineage edge (ADR-0009). `null` = **a child of the waqif** (ṭabaqa 1), never "unknown".
   *
   * Stated explicitly on every record, with no default, for the same reason `active` and `residency`
   * are: `buildLineage` cross-checks the *derived* depth against `tabaqa` on EVERY order, so a
   * defaulted edge would be a defaulted answer to "which generation is this person in".
   */
  readonly parentId: string | null;
  /**
   * The ẓuhūr/buṭūn eligibility fact — `'SON' | 'DAUGHTER'`, or `null` for a member who is not a
   * descendant of the waqif at all (a charitable jiha).
   *
   * **Not demographics.** It exists for one computation (`ZUHUR_ONLY`'s intermediate-ancestor test)
   * and is never rendered as a person's gender.
   */
  readonly lineageLink: string | null;
  readonly line: BeneficiaryLine;
  readonly branch: string | null;
  readonly stipulatedWeight: string;
  readonly verificationStatus: VerificationStatus;
  readonly kycLastRefreshed: string | null;
  readonly category: string | null;
  readonly residency: Residency;
  readonly disbursingEntity: BeneficiaryRaw['disbursingEntity'];
  readonly bankingRefForProceeds: string | null;
}): BeneficiaryRaw {
  return { ...spec };
}

/** Patch one field of a fixture beneficiary — Example E is Example A with one date changed. */
export function patched(base: BeneficiaryRaw, patch: Partial<BeneficiaryRaw>): BeneficiaryRaw {
  return { ...base, ...patch };
}

/**
 * Fictional display names, kept **out** of every engine input on purpose.
 *
 * `worked-examples.test.ts` scans the whole serialized result and every `DomainError.details` for
 * these strings to prove no PII can reach the hashed surface (AT-16). They are only meaningful as
 * needles for that search.
 */
export const DISPLAY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'ben-001': 'Fatimah Al-Rashidi (fictional)',
  'ben-002': 'Yusuf Al-Rashidi (fictional)',
  'ben-003': 'Maryam Al-Rashidi (fictional)',
  'ben-004': 'Khalid Al-Rashidi (fictional)',
  'ben-005': 'Layla Al-Rashidi (fictional)',
  'ben-006': 'Example Charitable Jiha (fictional)',
  'ben-007': 'Omar Al-Rashidi (fictional)',
  'ben-008': 'Salma Al-Rashidi (fictional)',
  // ADR-0009's replacement jihas. Deliberately NOT the same strings as their `disbursingEntity.name`
  // (that field IS part of an engine input), so each needle below can only appear in a result if a
  // display name leaked — which is the only thing AT-16's scan is entitled to conclude.
  'ben-306': 'Second Charitable Jiha (fictional)',
  'ben-307': 'Third Charitable Jiha (fictional)',
  // waqf-005's three generations (ADR-0009 + R-FRONTIER). Sixteen people, ben-201…ben-216.
  'ben-201': 'Ibrahim Al-Munir (fictional, deceased)',
  'ben-202': 'Nawal Al-Munir (fictional)',
  'ben-203': 'Latifa Al-Munir (fictional, deceased)',
  'ben-204': 'Saad Al-Munir (fictional)',
  'ben-205': 'Faris Al-Munir (fictional)',
  'ben-206': 'Hessa Al-Munir (fictional)',
  'ben-207': 'Bandar Al-Munir (fictional, deceased)',
  'ben-208': 'Rakan Al-Munir (fictional)',
  'ben-209': 'Jawaher Al-Munir (fictional)',
  'ben-210': 'Talal Al-Qahtani (fictional)',
  'ben-211': 'Munira Al-Qahtani (fictional)',
  'ben-212': 'Ziyad Al-Munir (fictional)',
  'ben-213': 'Waleed Al-Harthi (fictional)',
  'ben-214': 'Majid Al-Munir (fictional, deceased)',
  'ben-215': 'Turki Al-Munir (fictional)',
  'ben-216': 'Nayef Al-Qahtani (fictional)',
});

/* ── waqf-001 · ORDERED, medium family_dhurri (Examples A and E) ─────────────────────────── */

/*
 * ⚠ **R6 (product owner, 2026-08-03) — waqf-001's MEMBERS NOW CARRY A REAL LINEAGE EDGE, AND MUST.**
 *
 * This block previously recorded the opposite: ben-001…ben-003 were deliberately `parentId: null,
 * lineageLink: null`, on the reading that `buildLineage` required the edge only under
 * `LINEAGE_CONTINUATION`. **That reading is dead.** The owner answered ADR-0009's open question 10
 * "require the parent on every deed": eligibility comes from descent, so the descent must be on
 * record whatever rule the deed uses, and a `FAMILY`/`CATEGORY_ONLY` member with no `lineageLink`
 * now halts `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` on **every** `entitlementOrder`
 * (`resolver.ts` `buildLineage` pass 4). An edgeless waqf-001 is no longer a valid deed record — it
 * is the exact escape (S3-D1) that paid an unplaceable member 78,000,000 of 78,000,000 halalas.
 *
 * So waqf-001 is now a two-generation tree, and the tier structure Example A exists to prove is
 * expressed through it rather than beside it:
 *
 *   waqif
 *   ├── ben-001  SON       ṭ1  active   (ẓuhūr, Branch A)
 *   │   └── ben-002  SON   ṭ2  active   ← EXCLUDED under ORDERED while ṭabaqa 1 lives
 *   └── ben-003  DAUGHTER  ṭ1  active   (buṭūn, Branch B)
 *
 * ⚠ **CONSEQUENCE FOR SIBLING SUITES, stated because it WILL bite: `BEN_002` now carries
 * `parentId: 'ben-001'`.** Any probe cohort built from `patched(BEN_002, { id: … })` must either
 * include `BEN_001` as well or override `parentId: null, tabaqa: 1` — otherwise the probe halts
 * `LINEAGE_PARENT_UNKNOWN` (or `TABAQA_MISMATCHES_LINEAGE_DEPTH`) and proves nothing about the tier
 * test it meant to exercise. There is no way around it: a ṭabaqa-2 member with no parent edge is a
 * record the engine refuses, so a tier contrast on a family waqf now REQUIRES a two-node graph.
 * `BEN_001` and `BEN_003` are both children of the waqif (`parentId: null` = depth 1, never
 * "unknown"), so a probe built from either alone stays valid.
 */

/** ṭabaqa 1, ẓuhūr, Branch A. KYC 2026-01-15 + 12 months = 2027-01-15, ahead of `asOf` ⇒ FRESH. */
export const BEN_001 = beneficiary({
  id: 'ben-001',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  // A child of the waqif — depth 1. `null` here is a VALUE ("the waqif is my parent"), not an absence.
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  // ILLUSTRATIVE EXTENSION: the JSON carries `sharePercent: 12.5` (a historical record) and no
  // `stipulatedWeight`. §08 treats 12.5 as a RELATIVE deed weight the resolver normalises over the
  // entitled cohort — which is why the two must be different fields. See FIXTURE_DELTA_REQUIRED.
  stipulatedWeight: '12.5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-01-15',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0001',
});

/**
 * ṭabaqa 2 — ben-001's son. In an ORDERED waqf it receives nothing while ṭabaqa 1 lives
 * (`UPPER_TABAQA_EXTANT`).
 *
 * ⚠ The declared `tabaqa: 2` and the derived depth (`parentId: 'ben-001'` ⇒ 2) must agree, and
 * `buildLineage` refuses rather than preferring one. See the block comment above for what that means
 * for any suite that slices this record out of its cohort.
 */
export const BEN_002 = beneficiary({
  id: 'ben-002',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-001',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '12.5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-01-15',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  // ILLUSTRATIVE EXTENSION: the JSON nests a banking reference under `ubo` for UBO records only.
  bankingRefForProceeds: 'FAKE-IBAN-0002',
});

/** ṭabaqa 1, buṭūn, Branch B. `PENDING` with no KYC date ⇒ `KYC_UNVERIFIED`, entitled but withheld. */
export const BEN_003 = beneficiary({
  id: 'ben-003',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch B',
  stipulatedWeight: '12.5',
  verificationStatus: 'PENDING',
  kycLastRefreshed: null,
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0003',
});

/* ── waqf-002 · SHARED (tashrik), small family_dhurri (Example B) ────────────────────────── */

/**
 * ṭabaqa 1. KYC 2025-12-01 + 12 months = 2026-12-01, ahead of `asOf` ⇒ FRESH.
 *
 * ADR-0009: ben-004 and ben-005 are the ONE non-lineage fixture that keeps a real lineage edge —
 * ben-005 is ben-004's daughter, derived depth 2, declared ṭabaqa 2. Example B is `SHARED`, which
 * consumes neither the edge nor the continuation term, so this fixture is what proves the derived-depth
 * cross-check runs on a non-lineage order rather than only where it is used.
 */
export const BEN_004 = beneficiary({
  id: 'ben-004',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '25',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2025-12-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0004',
});

/**
 * ṭabaqa 2 — and **entitled**, because this waqf is tashrik. That contrast with `BEN_002` (the same
 * tier, excluded under ORDERED) is the whole content of worked example B.
 */
export const BEN_005 = beneficiary({
  id: 'ben-005',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-004',
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch B',
  stipulatedWeight: '25',
  verificationStatus: 'UNVERIFIED',
  kycLastRefreshed: null,
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0005',
});

/* ── waqf-003 · large (Example D — SPLIT BY ADR-0009) ───────────────────────────────────────
 *
 * §08's Example D was a **JOINT** waqf: a 40% charitable jiha beside two 30% family branches. Under
 * ADR-0009 R5 that input is REFUSED — a waqf is either خيري (charitable) or ذري (ancestral) and never
 * both — so the example splits in two and NOTHING it covered is dropped:
 *
 *  · {@link exampleDJoint} keeps the original cohort verbatim and is now the **refusal subject**. It
 *    must never compute again, and `worked-examples.test.ts` asserts exactly that.
 *  · {@link exampleDCharitable} re-homes the money and the GATE coverage onto a legal
 *    `PUBLIC_CHARITABLE` waqf: three jihas at the same 40/30/30 deed weights, so every halala of
 *    D's waterfall and split survives — including the CAPITAL-receipt corpus proof (I-C1),
 *    `ENTITY_UNLICENSED` (revoked and expired), `CROSS_BORDER_PENDING` + the Authority notice, and
 *    the ascending-id tie-break. Deed weights ARE applied on a charitable allocation (R3 exempts
 *    only a *lineage* cohort), which is why the figures transfer unchanged.
 *  · {@link exampleG} / {@link exampleH} re-home the FAMILY half onto the real thing: a three-
 *    generation lineage cohort on `waqf-005`, per capita.
 */

/**
 * The charitable jiha, 40% by deed weight.
 *
 * `tabaqa: null` ⇒ **never tier-excluded**, whatever any tiers around it do. Without that rule a jiha
 * could lose its deed share by accident (AT-15, invariant I5, `assertJihaNotTiered`).
 *
 * `parentId` and `lineageLink` are BOTH null and must be: a charity is not a descendant of the waqif,
 * and a jiha carrying either field is refused `LINEAGE_EDGE_ON_NON_DESCENDANT` (ADR-0009).
 *
 * ILLUSTRATIVE EXTENSION: `disbursingEntity` does not exist in the JSON at all, so the
 * `ENTITY_UNLICENSED` gate has no fixture-shaped subject today.
 */
export const BEN_006 = beneficiary({
  id: 'ben-006',
  kind: 'CHARITABLE_JIHA',
  active: true,
  tabaqa: null,
  parentId: null,
  lineageLink: null,
  line: 'NA',
  branch: 'Charitable',
  stipulatedWeight: '40',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-03-05',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: {
    name: 'Example Charitable Jiha (fictional)',
    licensed: true,
    licenceExpiry: '2027-06-30',
  },
  bankingRefForProceeds: 'FAKE-IBAN-0006',
});

/**
 * ILLUSTRATIVE EXTENSION — §08 Example D's family leg, Branch A. Does not exist in the JSON.
 *
 * ⚠ It carries a **complete, R6-conformant lineage edge** (a son of the waqif, depth 1) even though
 * the cohort it belongs to is refused before `buildLineage` is ever reached. That is deliberate: the
 * refusal these two records exist to pin must be about the waqf claiming **two natures** (R5), not
 * about a missing descent fact. An edgeless ben-007 would leave a reader unable to tell which rule
 * did the refusing, and would make the fixture pass for the wrong reason if the check order ever
 * moved.
 */
export const BEN_007 = beneficiary({
  id: 'ben-007',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '30',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0007',
});

/**
 * ILLUSTRATIVE EXTENSION — §08 Example D's Branch B leg, **cross-border**.
 *
 * `CROSS_BORDER` is the only gate that ROUTES rather than blocks: the line is
 * `CROSS_BORDER_PENDING`, an Authority notice is queued (BR-511, Nazarah Art. 10(7) — ⚠ verify,
 * confirm vs primary law), and the entitlement is untouched.
 */
export const BEN_008 = beneficiary({
  id: 'ben-008',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  // R6-conformant, for the same reason as ben-007 above: a daughter of the waqif, depth 1.
  parentId: null,
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch B',
  stipulatedWeight: '30',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'CROSS_BORDER',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0008',
});

/* ── waqf-003 · the two jihas that REPLACE Example D's family legs (ADR-0009) ────────────── */

/**
 * ILLUSTRATIVE EXTENSION — a second charitable jiha, 30% by deed weight.
 *
 * It stands exactly where Example D's `ben-007` stood, and for one reason: D's 40/30/30 arithmetic and
 * its `ENTITY_UNLICENSED` / corpus coverage must survive R5's refusal of the mixed cohort. A cohort of
 * three jihas is a legal `PUBLIC_CHARITABLE` waqf (وقف خيري) whose ghallah the deed splits between
 * three segments the waqif chose; deed weights are applied, so every figure transfers unchanged.
 */
export const BEN_306 = beneficiary({
  id: 'ben-306',
  kind: 'CHARITABLE_JIHA',
  active: true,
  tabaqa: null,
  parentId: null,
  lineageLink: null,
  line: 'NA',
  branch: 'Charitable',
  stipulatedWeight: '30',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: { name: 'Jiha Beta (fictional)', licensed: true, licenceExpiry: '2028-01-31' },
  bankingRefForProceeds: 'FAKE-IBAN-0306',
});

/**
 * ILLUSTRATIVE EXTENSION — a third charitable jiha, 30%, **cross-border**.
 *
 * Re-homes Example D's `ben-008` coverage. `CROSS_BORDER` is the only gate that ROUTES rather than
 * blocks: the line is `CROSS_BORDER_PENDING`, an Authority notice is queued (BR-511, Nazarah
 * Art. 10(7) — ⚠ verify, may be stale, confirm vs primary law), and the entitlement is untouched.
 */
export const BEN_307 = beneficiary({
  id: 'ben-307',
  kind: 'CHARITABLE_JIHA',
  active: true,
  tabaqa: null,
  parentId: null,
  lineageLink: null,
  line: 'NA',
  branch: 'Charitable',
  stipulatedWeight: '30',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'CROSS_BORDER',
  disbursingEntity: { name: 'Jiha Gamma (fictional)', licensed: true, licenceExpiry: '2028-01-31' },
  bankingRefForProceeds: 'FAKE-IBAN-0307',
});

/* ── waqf-005 · LINEAGE_CONTINUATION, large family_dhurri (Examples G, G′ and H) ───────────
 *
 * ═══ ILLUSTRATIVE EXTENSION IN FULL. NONE OF THIS IS IN `sample-waqf.json`. ═══
 * `waqf-005` does not exist in the JSON fixture and neither do these sixteen people. The whole record
 * set is invented — see `FIXTURE_DELTA_REQUIRED`, which names the lineage fields and this waqf.
 *
 * ═══ WHY THE TREE WAS REBUILT (R-FRONTIER, product owner 2026-08-03) ═══
 * The nine-member tree this fixture used to carry was built for ADR-0009's original wording —
 * *"every living descendant of the waqif is eligible"* — which the owner **corrected**:
 *
 *     *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A
 *     is dead."*
 *
 * Entitlement therefore sits at the **nearest living point on each line of descent**: a beneficiary
 * is entitled iff (1) they are themselves living, (2) **every ancestor strictly between them and the
 * waqif is deceased**, and (3) under `ZUHUR_ONLY` only, every such intermediate ancestor is a `SON`.
 * A living ancestor **holds** the entitlement and their descendants wait
 * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` — **temporary**, it reverses on that ancestor's death).
 *
 * ⚠ The old tree could not express that rule at all: run through the frontier test it produced the
 * **identical** three-head cohort under both stipulations, so Examples G and G′ would have been the
 * same answer twice and the continuation term would have looked like it did nothing. This tree is
 * built from the frontier rule outwards.
 *
 * ═══ THE TREE ═══
 * Every edge is a `parentId`; `parentId: null` means "a child of the waqif" (depth 1), **never
 * "unknown"**. `tabaqa` is stated on every record AND derived from the edges, and the two must agree
 * (`TABAQA_MISMATCHES_LINEAGE_DEPTH`) — two sides each testing the other. ✝ = deceased (`active:
 * false`). The array below is handed to the engine **scrambled**, so nothing can depend on it.
 *
 *   waqif
 *   ├── ben-201  SON       ṭ1  ✝                        Branch A
 *   │   ├── ben-205  SON       ṭ2  living   ✓✓          — father dead ⇒ at the frontier
 *   │   ├── ben-206  DAUGHTER  ṭ2  living   ✓✓          — a SON's daughter; her own link is not read
 *   │   └── ben-207  SON       ṭ2  ✝
 *   │       ├── ben-208  SON       ṭ3  living   ✓✓      — father AND grandfather dead
 *   │       └── ben-209  DAUGHTER  ṭ3  living   ✓✓      — same, and the CROSS_BORDER line
 *   ├── ben-202  DAUGHTER  ṭ1  living   ✓✓              Branch B — a daughter in her own right (R2)
 *   │   └── ben-213  SON       ṭ2  living   ✗           — ZO: buṭūn(202) · ZAB: held by living 202
 *   ├── ben-203  DAUGHTER  ṭ1  ✝                        Branch C
 *   │   ├── ben-210  SON       ṭ2  living   ✗ / ✓  ★    — ZO: buṭūn(203) · ZAB: ENTITLED
 *   │   │   └── ben-216  SON   ṭ3  living   ✗           — ZO: buṭūn(**203**) · ZAB: held by (**210**)
 *   │   └── ben-211  DAUGHTER  ṭ2  living   ✗ / ✓  ★    — ZO: buṭūn(203) · ZAB: ENTITLED
 *   └── ben-204  SON       ṭ1  living   ✓✓              Branch D
 *       ├── ben-212  SON       ṭ2  living   ✗           — held by living 204 (the owner's own case)
 *       └── ben-214  SON       ṭ2  ✝
 *           └── ben-215  SON   ṭ3  living   ✗           — parent DEAD, grandparent ALIVE ⇒ still held
 *
 *   ✓✓ entitled under BOTH stipulations · ✓ entitled under ZUHUR_AND_BUTUN only · ✗ excluded under both
 *
 * ⇒ **6 eligible heads under `ZUHUR_ONLY`** {202, 204, 205, 206, 208, 209},
 *   **8 under `ZUHUR_AND_BUTUN`** (the same six, plus 210 and 211).
 * 78,000,000 halalas is divisible by both 6 and 8 exactly, so the ONLY thing that changes between
 * Examples G and G′ is the head count — the cleanest available demonstration that the continuation
 * stipulation, and nothing else, decided who was paid.
 *
 * ═══ WHAT EACH RECORD EXISTS TO PROVE — every one breaks a DIFFERENT wrong implementation ═══
 * · **ben-205 / ben-206 are R1 itself.** Their father ben-201 is dead, so they stand at the frontier
 *   and are paid *because* a generation died above them. An implementation that treated a dead
 *   ancestor as a break in the chain pays them nothing.
 * · **ben-206 is a SON's DAUGHTER, entitled under `ZUHUR_ONLY`.** The test reads her *ancestors'*
 *   links, never her own — a line may end in a daughter. An implementation that read
 *   `beneficiary.lineageLink` excludes her.
 * · **ben-208 / ben-209 are two dead ancestors in a row.** The walk must pass through ben-207 AND
 *   ben-201 and find both deceased. An implementation that only inspected the immediate parent gets
 *   these two right by accident and ben-215 (below) wrong, which is why both are here.
 * · **ben-212 is the owner's sentence, verbatim.** Its father ben-204 is alive, so it receives
 *   nothing: `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`. This is the single record the pre-fix engine got
 *   wrong, and it is excluded under BOTH stipulations — the frontier is not a ẓuhūr/buṭūn filter.
 * · **ben-215 is the case that fails an implementation which stops at the parent.** Its father
 *   ben-214 is dead — so a "was my parent alive?" test would pay it — but its *grandfather* ben-204
 *   is alive and holds that line. Excluded, blocking ancestor **ben-204**, not ben-214.
 * · **ben-210 / ben-211 are the whole G↔G′ contrast.** Their mother ben-203 is a dead DAUGHTER of the
 *   waqif: the line is at the frontier (she is deceased) but is a buṭūn line, so `ZUHUR_ONLY`
 *   excludes them `BUTUN_LINE_NOT_CONTINUED` and `ZUHUR_AND_BUTUN` pays them. Two records, because
 *   one of them (ben-211) is herself a daughter and one (ben-210) a son — proving that under
 *   `ZUHUR_AND_BUTUN` the sexes on the path stop mattering entirely.
 * · **ben-213 is buṭūn blocked by a LIVING daughter.** Both facts apply at once and they name the same
 *   ancestor, ben-202: `ZUHUR_ONLY` reports `BUTUN_LINE_NOT_CONTINUED`, `ZUHUR_AND_BUTUN` reports
 *   `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`. Same person, same period, two different sentences on their
 *   Arabic statement — one permanent under this deed, one that reverses on a death.
 * · **ben-216 is the PRECEDENCE case, and the sharpest record here.** Its ancestors are ben-210 (a
 *   living SON) then ben-203 (a dead DAUGHTER). Under `ZUHUR_ONLY` the daughter-line break wins and
 *   the trace must name **ben-203**; under `ZUHUR_AND_BUTUN` there is no break and the trace must
 *   name **ben-210**. A blocking-ancestor field computed from a second walk, or a precedence written
 *   the other way round, tells this beneficiary the wrong thing about their own descent.
 *   ⚠ Rung 2 outranking rung 3 is **engineering's call, not the owner's** (`resolver.ts`
 *   `lineageFrontierVerdict` TODO(surface)); this fixture is what makes the choice visible.
 * · **ben-203 and ben-207 are dead ancestors who are themselves EXCLUDED** — `BENEFICIARY_INACTIVE`,
 *   their own vital status, never a statement about their line. Nothing resurrects them, and no
 *   stipulation changes that (see Example G′).
 *
 * ═══ THE DEED WEIGHTS ARE UNEQUAL ON PURPOSE ═══
 * Per capita (R3) means these figures are **NOT APPLIED**, the run raises
 * `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` and each eligible member gets a
 * `STIPULATED_WEIGHT_NOT_APPLIED` trace step. A fixture whose weights were all equal would make that
 * flag unreachable and the honesty obligation untested. {@link exampleH} is the equal-weight contrast
 * that proves the flag does NOT fire on every lineage run.
 *
 * ═══ IDS ARE CONTIGUOUS, ben-201…ben-216 — A SIBLING SUITE ADDING A NEWCOMER MUST START AT ben-217 ═══
 * A probe that grafts "a new grandchild" onto this cohort with an id already in the tree is refused
 * `BENEFICIARY_ID_DUPLICATED`, which is a confusing way to fail a test about eligibility.
 */

/** ṭ1, son of the waqif, **DECEASED** ✝ — the head of the branch that reaches three generations. */
export const BEN_201 = beneficiary({
  id: 'ben-201',
  kind: 'FAMILY',
  active: false,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '30',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0201',
});

/** ṭ1, DAUGHTER of the waqif, living — entitled in her own right under both stipulations (R2). */
export const BEN_202 = beneficiary({
  id: 'ben-202',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch B',
  stipulatedWeight: '20',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0202',
});

/**
 * ṭ1, DAUGHTER of the waqif, **DECEASED** ✝ — and the parent of two living children.
 *
 * The G↔G′ hinge: her death puts her children at the frontier, and her `DAUGHTER` link is what
 * `ZUHUR_ONLY` then refuses to continue through.
 */
export const BEN_203 = beneficiary({
  id: 'ben-203',
  kind: 'FAMILY',
  active: false,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch C',
  stipulatedWeight: '20',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0203',
});

/** ṭ1, son of the waqif, **living** — so his whole branch below him waits (R-FRONTIER). */
export const BEN_204 = beneficiary({
  id: 'ben-204',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch D',
  stipulatedWeight: '30',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0204',
});

/** ṭ2, son of the DECEASED ben-201 — at the frontier, entitled under both stipulations. */
export const BEN_205 = beneficiary({
  id: 'ben-205',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-201',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0205',
});

/**
 * ṭ2, DAUGHTER of the DECEASED ben-201 — a son's daughter, **entitled under `ZUHUR_ONLY`**.
 *
 * Her own `lineageLink` is never read; only her ancestors' are, and her one proper ancestor is a SON.
 *
 * Also `PENDING` with no KYC date ⇒ `KYC_UNVERIFIED`: entitled but WITHHELD. That pairing is
 * deliberate — it puts an entitlement verdict and a payability verdict on the same person, which is
 * what makes I6 ("a gate never moves a halala") non-vacuous on the lineage path. She is entitled
 * under BOTH stipulations, so the withhold is a constant between Examples G and G′ rather than
 * another moving part.
 */
export const BEN_206 = beneficiary({
  id: 'ben-206',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-201',
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch A',
  stipulatedWeight: '10',
  verificationStatus: 'PENDING',
  kycLastRefreshed: null,
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0206',
});

/** ṭ2, son of the DECEASED ben-201, himself **DECEASED** ✝ — two dead generations in one chain. */
export const BEN_207 = beneficiary({
  id: 'ben-207',
  kind: 'FAMILY',
  active: false,
  tabaqa: 2,
  parentId: 'ben-201',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0207',
});

/** ṭ3, son of the deceased ben-207 whose own father ben-201 is also dead — entitled under both. */
export const BEN_208 = beneficiary({
  id: 'ben-208',
  kind: 'FAMILY',
  active: true,
  tabaqa: 3,
  parentId: 'ben-207',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0208',
});

/**
 * ṭ3, DAUGHTER of the deceased ben-207 — a son's son's daughter, entitled under `ZUHUR_ONLY`, and
 * **cross-border**.
 *
 * Two jobs. It is the record that fails an implementation testing the person's OWN link rather than
 * its ancestors', three generations down where a shallow walk has already gone wrong; and it carries
 * the `CROSS_BORDER_PENDING` + Authority-notice coverage on a **family** member, where a cross-border
 * beneficiary is far more likely in practice than a cross-border jiha. It is entitled under both
 * stipulations, so the notice is a constant between G and G′.
 */
export const BEN_209 = beneficiary({
  id: 'ben-209',
  kind: 'FAMILY',
  active: true,
  tabaqa: 3,
  parentId: 'ben-207',
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch A',
  stipulatedWeight: '5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'CROSS_BORDER',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0209',
});

/**
 * ★ ṭ2, son of the DECEASED DAUGHTER ben-203 — **the continuation stipulation's whole subject.**
 *
 * His mother is dead, so he stands at the frontier of his line and the living-ancestor rule does not
 * touch him. What decides him is which lines the founder continued: `ZUHUR_ONLY` excludes him
 * `BUTUN_LINE_NOT_CONTINUED` (permanent under this deed), `ZUHUR_AND_BUTUN` pays him.
 */
export const BEN_210 = beneficiary({
  id: 'ben-210',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-203',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch C',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0210',
});

/**
 * ★ ṭ2, DAUGHTER of the DECEASED DAUGHTER ben-203 — ben-210's sister, and the second half of the
 * contrast.
 *
 * Under `ZUHUR_AND_BUTUN` she and her brother are paid the identical per-head amount: once daughters'
 * lines continue, the sexes on the path stop mattering **entirely**, and a fixture with only a son
 * here could not show that.
 */
export const BEN_211 = beneficiary({
  id: 'ben-211',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-203',
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  branch: 'Branch C',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0211',
});

/**
 * ★ ṭ2, son of the **LIVING** ben-204 — the product owner's sentence, as a record.
 *
 * *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A is
 * dead."* Excluded `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` under **both** stipulations: the frontier is
 * not a ẓuhūr/buṭūn filter, and every ancestor on this chain is a SON. This is the single record the
 * pre-correction engine paid and should not have.
 *
 * ⚠ The exclusion is **TEMPORARY** — it reverses the period after ben-204 dies, and every other
 * head's share is recomputed with him in the cohort. Nothing here may be read as durable.
 */
export const BEN_212 = beneficiary({
  id: 'ben-212',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-204',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch D',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0212',
});

/**
 * ṭ2, son of the **LIVING** DAUGHTER ben-202 — blocked by two facts at once, and they disagree about
 * which sentence he is owed.
 *
 * `ZUHUR_ONLY` ⇒ `BUTUN_LINE_NOT_CONTINUED` (his line never continues under this deed);
 * `ZUHUR_AND_BUTUN` ⇒ `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` (he waits for his mother). Both name
 * ben-202. Same register, same period, two different legal statements — which is exactly why the two
 * codes are not interchangeable and why E10/E12 owes them **separate** product-approved Arabic.
 *
 * He is **CROSS_BORDER** on purpose and is excluded under both stipulations: a gate is only evaluated
 * for the entitled cohort, so this record proves an excluded line carries no `gateFlags` and queues
 * **no** Authority notice. A gate that ran before the entitlement verdict would show up here as a
 * spurious second notice.
 */
export const BEN_213 = beneficiary({
  id: 'ben-213',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: 'ben-202',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch B',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'CROSS_BORDER',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0213',
});

/** ṭ2, son of the LIVING ben-204, himself **DECEASED** ✝ — the middle link of ben-215's chain. */
export const BEN_214 = beneficiary({
  id: 'ben-214',
  kind: 'FAMILY',
  active: false,
  tabaqa: 2,
  parentId: 'ben-204',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch D',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0214',
});

/**
 * ★ ṭ3, son of the DECEASED ben-214 whose own father ben-204 is **ALIVE** — the case that fails an
 * implementation which stops at the parent.
 *
 * His father is dead, so a "was my parent alive?" test pays him. The rule is *every* ancestor
 * strictly between him and the waqif, and ben-204 is one of them and is living — so he is excluded
 * `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` with the blocking ancestor recorded as **ben-204**, his
 * grandfather, not ben-214. A death in the middle of a chain frees nobody while anyone above it lives.
 */
export const BEN_215 = beneficiary({
  id: 'ben-215',
  kind: 'FAMILY',
  active: true,
  tabaqa: 3,
  parentId: 'ben-214',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch D',
  stipulatedWeight: '5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0215',
});

/**
 * ★ ṭ3, son of the LIVING ben-210, grandson of the DECEASED DAUGHTER ben-203 — **the precedence case.**
 *
 * His chain, nearest first, is `[ben-210 (SON, living), ben-203 (DAUGHTER, deceased)]`, so BOTH
 * exclusion facts apply and they name **different** ancestors:
 *
 *  · `ZUHUR_ONLY`      ⇒ `BUTUN_LINE_NOT_CONTINUED`, blocking ancestor **ben-203** (the nearest
 *                         non-SON, two steps up — not the nearest ancestor).
 *  · `ZUHUR_AND_BUTUN` ⇒ `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, blocking ancestor **ben-210**.
 *
 * The engine walks the chain **once** and collects both facts, which is what makes the reason and the
 * ancestor printed beside it structurally unable to disagree. This record is the only place that
 * property is observable, because it is the only place the two answers differ.
 */
export const BEN_216 = beneficiary({
  id: 'ben-216',
  kind: 'FAMILY',
  active: true,
  tabaqa: 3,
  parentId: 'ben-210',
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch C',
  stipulatedWeight: '5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0216',
});

/**
 * The sixteen-member tree, in a **deliberately scrambled** array order.
 *
 * The engine must emit lines in ascending `beneficiaryId` order (I8/I9) and must resolve the ancestor
 * walk regardless of the order the cohort arrives in — a child before its parent, a grandchild before
 * both. Handing it a sorted array would let a walk that depended on array order pass.
 */
export const LINEAGE_COHORT: readonly BeneficiaryRaw[] = Object.freeze([
  BEN_216,
  BEN_205,
  BEN_209,
  BEN_201,
  BEN_213,
  BEN_204,
  BEN_211,
  BEN_207,
  BEN_215,
  BEN_202,
  BEN_208,
  BEN_212,
  BEN_206,
  BEN_210,
  BEN_214,
  BEN_203,
]);

/** The same tree with every deed weight set to `'1'` — the R3-flag contrast. See {@link exampleH}. */
export const LINEAGE_COHORT_EQUAL_WEIGHTS: readonly BeneficiaryRaw[] = Object.freeze(
  LINEAGE_COHORT.map((member) => patched(member, { stipulatedWeight: '1' })),
);

/* ── waqf-004 · direct utilization (Examples C and C2) ───────────────────────────────────── */

/**
 * ILLUSTRATIVE EXTENSION — the JSON records no beneficiary for `waqf-004`.
 *
 * They are included precisely because a direct-use run must emit **no line even with a live
 * cohort**: I7 is unconditional, and an empty beneficiary array would prove that vacuously.
 *
 * ⚠ **THESE TWO ARE THE ONLY FAMILY RECORDS LEFT IN THIS MODULE WITH NO LINEAGE EDGE, AND THAT IS
 * DELIBERATE — DO NOT "FIX" THEM.** Under R6 a `FAMILY` member with `lineageLink: null` is refused
 * `LINEAGE_LINK_MISSING` on every monetary order, so this cohort is *precisely* an input that would
 * halt if it were ever resolved, and `worked-examples.test.ts` runs the identical cohort under
 * `ORDERED` and shows it halting.
 *
 * ⚠⚠ **THE PRECEDENCE CLAIM THAT STOOD HERE IS NOW FALSE TWICE OVER, AND IS QUOTED RATHER THAN
 * QUIETLY REWRITTEN.** It read: *"`resolveEntitlement` short-circuits `NA_DIRECT_USE` **before**
 * `assertJihaNotTiered`, before the continuation parse and before `buildLineage` runs, and these two
 * records are what makes that ordering observable rather than asserted … Give them edges and the
 * short-circuit's precedence becomes untestable."* Memo Q7 (product owner, 2026-08-17) retired both
 * halves: `assertJihaNotTiered` was hoisted above the short-circuit in the first pass, and
 * `buildLineage` in the second — *validity precedes short-circuits.*
 *
 * What these two records now observe is **narrower and still worth keeping**: `LINEAGE_LINK_MISSING` is
 * the one `buildLineage` pass the short-circuit still outranks, because it is a completeness
 * requirement rather than a self-contradiction (the argument is at that pass in `resolver.ts`, with its
 * TODO(surface)). So this cohort is the fixture that makes *that* scoping observable — and it is also
 * the concrete cost of ever hoisting it: MEASURED, deleting the `order !== 'NA_DIRECT_USE'` conjunct
 * makes `worked-examples.test.ts` **fail to collect at all** (145 tests), because §08's Example C is
 * built at module scope.
 *
 * (`tabaqa: 2` on ben-102 with no parent edge is still legal, but no longer for the old reason: the
 * graph IS built on a direct-use run now. It is legal because ben-102 records no `lineageLink`, so it
 * is not a graph member and there is no derived depth to cross-check the ṭabaqa against. Give it a link
 * and `TABAQA_MISMATCHES_LINEAGE_DEPTH` refuses this fixture — on direct use too, since Q7.)
 */
export const BEN_DIRECT_USE_A = beneficiary({
  id: 'ben-101',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: null,
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '50',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0101',
});

/** ILLUSTRATIVE EXTENSION — see {@link BEN_DIRECT_USE_A}. */
export const BEN_DIRECT_USE_B = beneficiary({
  id: 'ben-102',
  kind: 'FAMILY',
  active: true,
  tabaqa: 2,
  parentId: null,
  lineageLink: null,
  line: 'BUTUN',
  branch: 'Branch B',
  stipulatedWeight: '50',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0102',
});

/* ── the residual prover (Example F) — wholly invented ───────────────────────────────────── */

/**
 * Three equal deed weights. Ids chosen so ascending `beneficiaryId` is unambiguous.
 *
 * All three are **children of the waqif** (`parentId: null` ⇒ depth 1) carrying a real
 * `lineageLink`, because R6 requires the descent fact on every deed — a `SHARED` cohort with no
 * lineage edge is now refused `LINEAGE_LINK_MISSING` and Example F would never reach the allocator.
 * Three siblings is the flattest legal graph, which keeps the residual the only moving part.
 */
export const BEN_A = beneficiary({
  id: 'ben-a',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: null,
  stipulatedWeight: '1',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-04-01',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0A',
});

/**
 * ben-b is a **DAUGHTER**, and is paid the identical halala.
 *
 * `SHARED` (tashrik) applies no continuation term at all, so a buṭūn sibling is not filtered — the
 * link is recorded, carried onto the line's basis, and not consumed. A fixture of three sons could
 * not tell "SHARED ignores the link" apart from "SHARED never saw one".
 */
export const BEN_B = patched(BEN_A, {
  id: 'ben-b',
  lineageLink: 'DAUGHTER',
  line: 'BUTUN',
  bankingRefForProceeds: 'FAKE-IBAN-0B',
});
export const BEN_C = patched(BEN_A, { id: 'ben-c', bankingRefForProceeds: 'FAKE-IBAN-0C' });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The 2026 fiscal year. `disbursementSchedule: null` is what makes the post-FYE window bind. */
const PERIOD_2026 = Object.freeze({ start: '2026-01-01', end: '2026-12-31' });

/**
 * §08 **Example A** — ORDERED, medium `FAMILY_DHURRI`.
 *
 * Revenue 350,000.00 (`rev-001`, INCOME) · ṣiyāna 40,000.00 FIXED · operating 0 ·
 * ʿushr 10% of revenue · distributable **275,000.00**.
 *
 * ILLUSTRATIVE EXTENSION — the ṣiyāna RULE. The JSON's only maintenance datum is `exp-e-001`, a
 * maintenance expense already PAID on 2026-02-10. §08 Example A uses that paid expense *as* the
 * stipulated reserve; this engine does not, and the difference is a real fiqh + accounting question.
 * See {@link MAINTENANCE_RULE_IS_NOT_AN_EXPENSE}.
 */
export function exampleA(): DistributionInputRaw {
  return {
    waqfId: 'waqf-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'ORDERED',
    continuationStipulation: null,
    // R7 · `null` — this deed records no مآل clause. See `FIXTURE_DELTA_REQUIRED`: `sample-waqf.json`
    // cannot state this fact at all yet, so its absence is a declared delta, not a silent default.
    reversion: null,
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 35_000_000n,
      receipts: [{ id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
    // ⚠ 10% ʿushr — set by THIS DEED (Nazarah Art. 11), not by statute, and unverified.
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [BEN_001, BEN_002, BEN_003],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * §08 **Example B** — SHARED (tashrik), small `FAMILY_DHURRI`.
 *
 * Revenue 200,000.00 · ṣiyāna 5% = 10,000.00 · ʿushr 20,000.00 · distributable **170,000.00**.
 *
 * ILLUSTRATIVE EXTENSION — both the revenue and the ṣiyāna rate. `waqf-002` has **no revenue row at
 * all** in the JSON (and no dedicated bank account reference), so §08's own 200,000 is flagged
 * illustrative in the spec too.
 */
export function exampleB(): DistributionInputRaw {
  return {
    waqfId: 'waqf-002',
    classification: 'SMALL',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'SHARED',
    continuationStipulation: null,
    /** R7 · no مآل clause recorded. */
    reversion: null,
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 20_000_000n,
      receipts: [{ id: 'rev-003', receiptClass: 'INCOME', amountMinor: 20_000_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'PERCENT', ratePercent: '5' },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [BEN_004, BEN_005],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * §08 **Example C** — direct utilization, nil period.
 *
 * The beneficiaries benefit from `asset-006` itself, not from ghallah. `entitlementOrder` is
 * `NA_DIRECT_USE`: the JSON's free text `"n/a (direct use of the asset)"` is normalised by
 * `packages/database/src/seed/map.ts`, **not** by the engine — an unmapped spelling reaches
 * `parseEntitlementOrder` as data and halts with `SHART_INCOMPLETE`.
 */
export function exampleC(): DistributionInputRaw {
  return {
    waqfId: 'waqf-004',
    classification: 'SMALL',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'NA_DIRECT_USE',
    continuationStipulation: null,
    // R7 · no مآل clause, and on this order it would be CARRIED, not applied: Stage 2 short-circuits
    // before the clause is read, and no flag is raised (`CONTINUATION_STIPULATION_NOT_APPLIED`'s
    // precedent). ⚠ The tail of this comment named `exampleCReversionCarried` "below" as the fixture
    // driving that path; **no such fixture exists in this module** — a dangling forward reference, and a
    // reader chasing it would conclude the path was covered here when it is covered by
    // `resolver.test.ts`'s "the clause is CARRIED, not applied" case instead.
    reversion: null,
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: { incomeMinor: 0n, receipts: [] },
    operatingCostMinor: 0n,
    maintenance: { kind: 'NONE' },
    // Not `null`: a silent deed would add AUTHORITY_FEE_DETERMINATION_PENDING and muddy the flag set
    // this example exists to pin. The fee computes to 0 on 0 revenue, with its basis still recorded.
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [BEN_DIRECT_USE_A, BEN_DIRECT_USE_B],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * §08 **Example C2** — direct utilization **with** period revenue. **The DEFECT-1 prover.**
 *
 * §08 line 54 says the waterfall still computes for a direct-use waqf; only the split below it is
 * skipped. So distributable is 90,000.00 with ZERO payout lines, and §08's invariant I3 as written
 * (`paid + withheld + crossBorder == distributable`) reads `0 == 9_000_000` — **false**. The restated
 * I3, with `retainedMinor`, reads `9_000_000 == 9_000_000`.
 *
 * ILLUSTRATIVE EXTENSION — the incidental rent. The engine only REPORTS the retained value; where it
 * goes is OQ-01 sub-question 2 and is unsigned.
 */
export function exampleC2(): DistributionInputRaw {
  return {
    ...exampleC(),
    revenue: {
      incomeMinor: 10_000_000n,
      receipts: [{ id: 'rev-006', receiptClass: 'INCOME', amountMinor: 10_000_000n }],
    },
  };
}

/**
 * §08 **Example D**, VERBATIM — and **now a REFUSED input** (ADR-0009 R5).
 *
 * ⚠ **This fixture exists to be refused. It must never compute again.** It is `waqfType: 'JOINT'`
 * with a cohort mixing a `CHARITABLE_JIHA` and two `FAMILY` members — the shape the product owner
 * ruled impossible: a waqf is either خيري (charitable, for a segment the waqif chooses) or ذري
 * (ancestral/generational), never both. `runDistribution` halts with `SHART_INCOMPLETE` /
 * `WAQF_TYPE_JOINT_NOT_SUPPORTED` before any figure is used.
 *
 * It is kept rather than deleted for two reasons. First, the same discipline used when the tiered-jiha
 * defect was closed: an input that once computed and now must not is pinned as a refusal, so a future
 * edit that re-legalises it fails loudly instead of quietly paying a joint deed. Second, ADR-0009
 * decision 3 is a **product rule under counsel review** — `docs/domain/regulations/awqaf-law.md`
 * Art. 4 and `docs/domain/glossary.md`'s الوقف المشترك both record a joint endowment as real, and that
 * contradiction is an open reconciliation item. If counsel disagrees, this fixture is the record of
 * exactly what has to work again.
 *
 * Its unique coverage is re-homed, not lost — see {@link exampleDCharitable} (money, gates, corpus)
 * and {@link exampleG} / {@link exampleH} (the family half, per capita).
 *
 * The original figures, for the record: revenue 1,800,000.00 (`rev-002`) · CAPITAL 20,000,000.00
 * (`cap-001`) · ṣiyāna 100,000.00 · operating 120,000.00 · ʿushr 10% of revenue 180,000.00 ·
 * distributable 1,400,000.00, split 40/30/30.
 */
export function exampleDJoint(): DistributionInputRaw {
  return {
    waqfId: 'waqf-003',
    classification: 'LARGE',
    waqfType: 'JOINT',
    // SHARED so the family sub-tree does not tier-exclude; §08's JOINT *rule* labelled the run.
    entitlementOrder: 'SHARED',
    continuationStipulation: null,
    // R7 · `null`, and it MUST stay null for this fixture to keep proving what it exists to prove: a
    // JOINT waqf is refused on `waqfType` alone, before the reversion clause is even looked at
    // (`assertReversionLegible` is step 2, `JOINT` is step 1). A clause here would test nothing new.
    reversion: null,
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 180_000_000n,
      receipts: [
        { id: 'rev-002', receiptClass: 'INCOME', amountMinor: 180_000_000n },
        {
          id: 'cap-001',
          receiptClass: 'CAPITAL',
          capitalSource: 'ISTIBDAL_PROCEEDS',
          amountMinor: 2_000_000_000n,
        },
      ],
    },
    operatingCostMinor: 12_000_000n,
    maintenance: { kind: 'FIXED', amountMinor: 10_000_000n },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [BEN_006, BEN_007, BEN_008],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * Example D's JOINT cohort re-declared as `FAMILY_DHURRI` — the **re-entry route**, also refused.
 *
 * The cohort-keyed refusal exists precisely for this: if the engine only refused
 * `waqfType: 'JOINT'`, the identical mixed خيري/ذري cohort would simply arrive under a family type
 * and nothing would have been prevented. Halts `COHORT_MIXES_CHARITABLE_AND_FAMILY`.
 */
export function exampleDJointReEnteredAsFamily(): DistributionInputRaw {
  return { ...exampleDJoint(), waqfType: 'FAMILY_DHURRI' };
}

/**
 * **Example D-خ** — Example D's money and gate coverage, on a LEGAL `PUBLIC_CHARITABLE` waqf.
 *
 * Three charitable jihas (وقف خيري, segments the waqif chose) at the SAME 40/30/30 deed weights, under
 * `SHARED`. Deed weights are applied on a charitable allocation — R3's per-capita rule exempts only a
 * *lineage* cohort — so every halala below is D's, unchanged and re-derived by hand in
 * {@link EXPECTED_D_CHARITABLE}:
 *
 * Revenue 1,800,000.00 (`rev-002`, INCOME) · CAPITAL 20,000,000.00 (`cap-001`, istibdal proceeds
 * standing in for `exp-001`'s expropriation compensation) · ṣiyāna 100,000.00 · operating 120,000.00
 * (`exp-e-003`) · ʿushr 10% **of revenue, not of the corpus** = 180,000.00 · distributable
 * **1,400,000.00**.
 *
 * The 2,000,000,000n of corpus (asl / أصل) must appear in `capitalReceiptsMinor` and in **no figure
 * below `revenueMinor`** — invariant I-C1, CLAUDE.md binding rule 1. This example is therefore still
 * the corpus-guard prover.
 *
 * ⚠ `entitlementOrder` is `SHARED`, not `LINEAGE_CONTINUATION`: a lineage order on a charitable waqf
 * is itself refused (`LINEAGE_ORDER_ON_CHARITABLE_WAQF`) because a charity has no descendants.
 *
 * ILLUSTRATIVE EXTENSIONS — the ṣiyāna rule, the CAPITAL receipt, all three `disbursingEntity`
 * records, and ben-306 / ben-307 themselves.
 */
export function exampleDCharitable(): DistributionInputRaw {
  return {
    ...exampleDJoint(),
    waqfType: 'PUBLIC_CHARITABLE',
    beneficiaries: [BEN_006, BEN_306, BEN_307],
  };
}

/** Example D-خ with the first jiha's licence REVOKED — the `ENTITY_UNLICENSED` case §08 names. */
export function exampleDCharitableUnlicensedJiha(): DistributionInputRaw {
  return {
    ...exampleDCharitable(),
    beneficiaries: [
      patched(BEN_006, {
        disbursingEntity: {
          name: 'Example Charitable Jiha (fictional)',
          licensed: false,
          licenceExpiry: '2027-06-30',
        },
      }),
      BEN_306,
      BEN_307,
    ],
  };
}

/** Example D-خ with the licence EXPIRED rather than revoked — the same gate, the other cause. */
export function exampleDCharitableExpiredJihaLicence(): DistributionInputRaw {
  return {
    ...exampleDCharitable(),
    beneficiaries: [
      patched(BEN_006, {
        disbursingEntity: {
          name: 'Example Charitable Jiha (fictional)',
          licensed: true,
          // One day before `asOf` — expiry day itself is still valid, so this is the first stale day.
          licenceExpiry: '2026-07-13',
        },
      }),
      BEN_306,
      BEN_307,
    ],
  };
}

/**
 * **Example G** — `LINEAGE_CONTINUATION` + `ZUHUR_ONLY`, large `FAMILY_DHURRI` on `waqf-005`.
 *
 * The product's NORMAL deed shape (ADR-0009 R4), over the nine-member three-generation tree defined
 * above. Same money profile as Example D-خ's structure but round figures chosen so the per-capita
 * split is exact under BOTH stipulations, which is what makes {@link EXPECTED_G} and
 * {@link EXPECTED_G_ZUHUR_AND_BUTUN} a clean contrast rather than two residual puzzles:
 *
 * Revenue 1,000,000.00 (INCOME) · CAPITAL 20,000,000.00 (istibdal proceeds) · ṣiyāna 100,000.00 FIXED
 * · operating 20,000.00 · ʿushr 10% of revenue = 100,000.00 · distributable **780,000.00**.
 *
 * 780,000.00 = 78_000_000n is divisible by both 6 (ZUHUR_ONLY's eligible head count) and 8
 * (ZUHUR_AND_BUTUN's), so the ONLY thing that changes between the two runs is the head count — the
 * cleanest possible demonstration that the continuation stipulation, and nothing else, decided who
 * was paid.
 *
 * It also carries the CAPITAL receipt, so the corpus guard is proven on the lineage path too — the
 * path that will carry every real family statement.
 *
 * ILLUSTRATIVE EXTENSION IN FULL — `waqf-005` and all nine people are invented.
 */
export function exampleG(): DistributionInputRaw {
  return {
    waqfId: 'waqf-005',
    classification: 'LARGE',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    // R7 · `null` — Example G is the deed shape with NO reversion, and it must stay that way: it is the
    // control for {@link exampleJ}, which is the same tree and money with a مآل clause added.
    reversion: null,
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 100_000_000n,
      receipts: [
        { id: 'rev-005', receiptClass: 'INCOME', amountMinor: 100_000_000n },
        {
          id: 'cap-005',
          receiptClass: 'CAPITAL',
          capitalSource: 'ISTIBDAL_PROCEEDS',
          amountMinor: 2_000_000_000n,
        },
      ],
    },
    operatingCostMinor: 2_000_000n,
    maintenance: { kind: 'FIXED', amountMinor: 10_000_000n },
    // ⚠ 10% ʿushr — set by THIS DEED (Nazarah Art. 11), not by statute, and unverified.
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [...LINEAGE_COHORT],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * **Example G′** — Example G with the ONE field the founder's conditions turn on flipped to
 * `ZUHUR_AND_BUTUN`.
 *
 * Nothing else changes: same tree, same money, same gates. Two more heads become eligible (ben-206,
 * the waqif's daughter's son; ben-208, a daughter's son one generation further down) and every
 * surviving beneficiary's amount falls from 13,000.00 to 9,750.00 — per capita recomputed over the
 * larger cohort (R3). That drop is the visible cost of the head count, and it is why ADR-0009 open
 * question 8 (observation date) matters.
 */
export function exampleGZuhurAndButun(): DistributionInputRaw {
  return { ...exampleG(), continuationStipulation: 'ZUHUR_AND_BUTUN' };
}

/**
 * **Example H** — the per-capita RESIDUAL prover, and the R3-flag contrast.
 *
 * Example G's tree with every deed weight set to `'1'`, 100.00 of revenue, no ṣiyāna, no operating
 * cost and a SILENT deed on the Nazir fee. Two jobs no other fixture does:
 *
 * 1. **A non-zero Hamilton residual on a per-capita cohort.** 10_000n over 6 equal heads does not
 *    divide: floors are 1_666n each (Σ 9_996n), all six remainders tie, and the residual 4n goes to
 *    the four LOWEST ids. So amounts are 1_667 / 1_667 / 1_667 / 1_667 / 1_666 / 1_666 and invariant
 *    I-L1's bound (`max − min <= 1n`) is exercised at its limit instead of vacuously at 0.
 * 2. **`STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` must NOT fire here.** Every eligible member records
 *    the same weight, so per capita overrode nothing and the flag would be noise. A flag that fires on
 *    every lineage run tells a reader nothing, and this is the fixture that pins the difference.
 */
export function exampleH(): DistributionInputRaw {
  return {
    ...exampleG(),
    waqfId: 'waqf-005-residual',
    classification: 'SMALL',
    revenue: {
      incomeMinor: 10_000n,
      receipts: [{ id: 'rev-h-001', receiptClass: 'INCOME', amountMinor: 10_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'NONE' },
    // The deed is silent on the Nazir fee ⇒ fee 0 and the run is FLAGGED, never silently zero-fee'd.
    nazirFee: null,
    beneficiaries: [...LINEAGE_COHORT_EQUAL_WEIGHTS],
  };
}

/**
 * Example A with a continuation stipulation RECORDED on an `ORDERED` deed — the
 * `CONTINUATION_STIPULATION_NOT_APPLIED` prover.
 *
 * `ORDERED` does not consume the continuation term **when deciding who is entitled**, so the engine carries
 * it, does NOT apply it there, and says so on the run. Every figure is byte-identical to Example A's: the
 * flag is the whole difference. ✓ Since memo Q5 (product owner, 2026-08-17) the term IS consumed by the
 * deed's **reversion trigger** on every order — irrelevant to this fixture, which records no مآل clause, and
 * named so a reader does not take the flag as "the term is unused".
 *
 * ⚠ SURFACED, NOT RESOLVED (ADR-0009 open question 3) — whether a deed can be BOTH al-aʿlā fa-l-aʿlā
 * and ZUHUR_ONLY, i.e. whether the continuation term should also filter eligibility on `ORDERED` and
 * `SHARED`. If the answer is yes, this flag is marking a live defect: a buṭūn descendant is being paid
 * on a deed that excluded them. The fixture is here so the question has a subject rather than a note.
 */
export function exampleAContinuationRecorded(): DistributionInputRaw {
  return { ...exampleA(), continuationStipulation: 'ZUHUR_ONLY' };
}

/**
 * §08 **Example E** — the stale-KYC block. Example A with **one field changed**.
 *
 * ben-001's `kycLastRefreshed` moves to 2025-06-01, so the window expires 2026-06-01 and `asOf`
 * 2026-07-14 is past it (age 13 months 13 days) ⇒ `STALE_KYC`. The waterfall is byte-identical to
 * A's, every entitlement is unchanged (I6), and the run still computes: `paid` 0,
 * `withheld == distributable`.
 */
export function exampleE(): DistributionInputRaw {
  const base = exampleA();
  return {
    ...base,
    beneficiaries: [patched(BEN_001, { kycLastRefreshed: '2025-06-01' }), BEN_002, BEN_003],
  };
}

/** Example E with ben-001's KYC dated exactly one refresh window before `asOf` ⇒ FRESH, not stale. */
export function exampleEKycExactlyAtExpiry(): DistributionInputRaw {
  const base = exampleA();
  return {
    ...base,
    // 2025-07-14 + 12 months = 2026-07-14 = asOf. `asOf > expiry` is FALSE ⇒ fresh. §08 is silent on
    // this edge and an off-by-one here wrongly blocks or wrongly pays a family member.
    beneficiaries: [patched(BEN_001, { kycLastRefreshed: '2025-07-14' }), BEN_002, BEN_003],
  };
}

/**
 * §08 **Example F** — the residual (Hamilton) prover. Wholly invented ids.
 *
 * 100.00 three equal ways. Floors are `10_000 / 3 = 3_333n` each (Σ 9,999), all three remainders
 * tie, the tie breaks on ascending `beneficiaryId`, and `ben-a` takes the single leftover halala:
 * **3_334 / 3_333 / 3_333**, Σ exactly 10_000n. `nazirFee: null` also exercises
 * `AUTHORITY_FEE_DETERMINATION_PENDING`.
 */
export function exampleF(): DistributionInputRaw {
  return {
    waqfId: 'waqf-fixture-residual',
    classification: 'SMALL',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'SHARED',
    continuationStipulation: null,
    /** R7 · no مآل clause recorded. */
    reversion: null,
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 10_000n,
      receipts: [{ id: 'rev-f-001', receiptClass: 'INCOME', amountMinor: 10_000n }],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'NONE' },
    // The deed is silent on the Nazir fee ⇒ fee 0 and the run is FLAGGED, never silently zero-fee'd.
    nazirFee: null,
    beneficiaries: [BEN_A, BEN_B, BEN_C],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · Example J — مآل الوقف, a ذري endowment that names an ultimate taker
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `waqf-006`'s two-generation bloodline plus one charitable jiha the deed names as its **مآل**.
 *
 * ⚠ All four records are INVENTED, like every other member of these fixtures. `jiha-601` carries
 * **no `tabaqa` and no lineage edge** — it is not a descendant of the waqif, and recording either
 * would be refused (`JIHA_TIERED` / `LINEAGE_EDGE_ON_NON_DESCENDANT`).
 */
export const BEN_601 = beneficiary({
  id: 'ben-601',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-01-15',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-0601',
});

/** `ben-601`'s son. Depth 2, so he waits while his father lives (R-FRONTIER). */
export const BEN_602 = patched(BEN_601, {
  id: 'ben-602',
  tabaqa: 2,
  parentId: 'ben-601',
  bankingRefForProceeds: 'FAKE-IBAN-0602',
});

/**
 * The endowment's ultimate taker (مآل الوقف) — a licensed, KYC-fresh charitable jiha at deed weight 10.
 *
 * ⚠ Its weight is DELIBERATELY equal to `ben-601`'s. If the taker ever escaped its verdict ladder on a
 * pending run it would take exactly half the distributable — 13,750,000 halalas — which is the figure
 * R6-D1/ESC-1 were measured at. Equal weights make that failure visible as a number rather than only as
 * a reason code.
 */
export const JIHA_601 = beneficiary({
  id: 'jiha-601',
  kind: 'CHARITABLE_JIHA',
  active: true,
  tabaqa: null,
  parentId: null,
  lineageLink: null,
  line: 'NA',
  branch: 'Charitable',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-03-05',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: {
    name: 'Example Ultimate-Taker Jiha (fictional)',
    licensed: true,
    licenceExpiry: '2027-06-30',
  },
  bankingRefForProceeds: 'FAKE-IBAN-J601',
});

/** The deed's مآل clause. Naming ids is the whole shape decision — see `contract.ts`'s R7 header. */
const MAAL_CLAUSE = Object.freeze({
  kind: 'CHARITABLE_ULTIMATE_TAKER',
  ultimateTakerIds: Object.freeze(['jiha-601']),
});

/**
 * **Example J** — `LINEAGE_CONTINUATION` + `ZUHUR_ONLY` on `waqf-006`, with a recorded **مآل الوقف**,
 * in the period **while the family still lives**.
 *
 * Product-owner decision, 2026-08-10 (R7): a وقف ذري may name a charity as its ultimate taker, which
 * *"receives nothing while any eligible descendant lives"*. So this run pays the family and the charity
 * **zero** — and that zero is the feature, not an omission.
 *
 * The waterfall, by hand, in halalas, and deliberately a different route to Example A's total so the
 * figure is reached rather than inherited:
 *
 *   revenue                            40,000,000
 *   − ṣiyāna PERCENT '10'             − 4,000,000   (10% × 40,000,000)
 *   − operating                       − 4,500,000
 *   = net income                       31,500,000
 *   − ʿushr 10% **of revenue**        − 4,000,000   (⚠ set by THIS deed, Nazarah Art. 11, unverified)
 *   = distributable                    27,500,000
 *
 * I1: 4,000,000 + 4,500,000 + 4,000,000 + 27,500,000 = 40,000,000 ✓
 *
 * 27,500,000 is the same total Examples A and E reach, and that is on purpose: it is the figure R6-D1
 * and ESC-1 were measured against, so the before/after of R7 is directly comparable.
 */
export function exampleJ(): DistributionInputRaw {
  return {
    waqfId: 'waqf-006',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    reversion: { kind: MAAL_CLAUSE.kind, ultimateTakerIds: [...MAAL_CLAUSE.ultimateTakerIds] },
    period: { ...PERIOD_2026 },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 40_000_000n,
      receipts: [{ id: 'rev-006', receiptClass: 'INCOME', amountMinor: 40_000_000n }],
    },
    operatingCostMinor: 4_500_000n,
    maintenance: { kind: 'PERCENT', ratePercent: '10' },
    // ⚠ 10% ʿushr — set by THIS DEED (Nazarah Art. 11), not by statute, and unverified.
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [BEN_601, BEN_602, JIHA_601],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/**
 * **Example J′** — the SAME deed and the SAME clause, one period later: **both descendants deceased**.
 *
 * Two `active` flags are the only difference between this fixture and {@link exampleJ}, and 27,500,000
 * halalas change destination. That contrast IS the feature — the period in which a family endowment
 * stops paying a family and starts paying a charity — and it is why the two are a pair rather than one
 * fixture with a variant.
 */
export function exampleJReverted(): DistributionInputRaw {
  return {
    ...exampleJ(),
    beneficiaries: [
      patched(BEN_601, { active: false }),
      patched(BEN_602, { active: false }),
      JIHA_601,
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Expectations — every figure in halalas, with its arithmetic
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The waterfall an example must produce, term by term. */
export interface ExpectedWaterfall {
  readonly revenueMinor: bigint;
  readonly capitalReceiptsMinor: bigint;
  readonly maintenanceReserveMinor: bigint;
  readonly operatingCostMinor: bigint;
  readonly netIncomeMinor: bigint;
  readonly nazirFeeMinor: bigint;
  readonly nazirFeeBasis: 'PERCENT_OF_REVENUE' | 'PERCENT_OF_NET_INCOME' | 'RETAINER' | null;
  readonly distributableMinor: bigint;
}

/** One expected output line. Every field explicit — `null` is a value, not an omission. */
export interface ExpectedLine {
  readonly beneficiaryId: string;
  readonly status: LineStatus;
  readonly entitledMinor: bigint;
  readonly sharePercent: string;
  readonly tabaqa: number | null;
  readonly line: BeneficiaryLine;
  readonly branch: string | null;
  readonly kind: BeneficiaryKind;
  readonly rule: EntitlementRule;
  readonly reasonCode: LineReasonCode | null;
  readonly gateFlags: readonly GateReasonCode[];
  readonly bankingRefForProceeds: string | null;
  /**
   * The four ADR-0009 `basis` fields, stated on EVERY expected line.
   *
   * They are on the beneficiary's official Arabic statement (BR-505), so they are asserted like any
   * other figure. `lineageDepth` is the DERIVED depth and must equal `tabaqa` for any graph member —
   * both are stated separately here on purpose, so a resolver that quietly preferred one side over the
   * other (instead of refusing the disagreement) fails.
   */
  readonly lineageDepth: number | null;
  readonly parentId: string | null;
  readonly lineageLink: 'SON' | 'DAUGHTER' | null;
  readonly continuationStipulation: 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN' | null;
}

export interface ExpectedTotals {
  readonly paidMinor: bigint;
  readonly withheldMinor: bigint;
  readonly crossBorderMinor: bigint;
  readonly retainedMinor: bigint;
  readonly entitledMinor: bigint;
  readonly excludedCount: number;
  readonly entitledLineCount: number;
  readonly residualMinor: bigint;
}

/** A whole worked example's expected result. */
export interface ExpectedExample {
  readonly label: string;
  readonly waqfId: string;
  readonly distributionType: 'MONETARY' | 'NA_DIRECT_USE';
  readonly classification: WaqfClassification;
  readonly waqfType: WaqfType;
  readonly entitlementOrder: 'LINEAGE_CONTINUATION' | 'ORDERED' | 'SHARED' | 'NA_DIRECT_USE';
  readonly entitlementRule: EntitlementRule;
  readonly waterfall: ExpectedWaterfall;
  readonly lines: readonly ExpectedLine[];
  readonly totals: ExpectedTotals;
  readonly flags: readonly RunFlag[];
  readonly invariantsChecked: readonly InvariantId[];
  readonly authorityNoticeBeneficiaryIds: readonly string[];
}

/**
 * The invariants a full monetary run with at least one entitled line asserts.
 *
 * I8 is **never** here: determinism is a claim about two runs and cannot be asserted from one.
 */
export const INVARIANTS_FULL_MONETARY_RUN: readonly InvariantId[] = Object.freeze([
  'I1',
  'I2',
  'I3',
  'I4',
  'I5',
  'I6',
  'I7',
  'I9',
  'I-C1',
]);

/**
 * The invariants a run with **no emitted line** asserts.
 *
 * I5 has no line to make a claim about and I6 has no entitled line, so neither is reported — the
 * engine records what it actually checked rather than a fixed list.
 */
export const INVARIANTS_NO_LINES: readonly InvariantId[] = Object.freeze([
  'I1',
  'I2',
  'I3',
  'I4',
  'I7',
  'I9',
  'I-C1',
]);

/**
 * The invariants a `LINEAGE_CONTINUATION` monetary run with at least one entitled line asserts.
 *
 * Exactly {@link INVARIANTS_FULL_MONETARY_RUN} **plus `I-L1`** (per-capita equality, ADR-0009 R3).
 * `I-L1` is last because `assertInvariants` returns the checked ids in canonical `INVARIANT_IDS`
 * order and `'I-L1'` is appended there after `'I-C1'` — so this list is not a guess about call order.
 *
 * Written as a spread of the monetary list rather than as a fresh literal on purpose: if a future
 * change adds an invariant to a normal monetary run and forgets the lineage list, the two would
 * silently diverge and the lineage examples would stop asserting the new one.
 */
export const INVARIANTS_FULL_LINEAGE_RUN: readonly InvariantId[] = Object.freeze([
  ...INVARIANTS_FULL_MONETARY_RUN,
  'I-L1',
]);

/**
 * **R7** · the invariants a monetary run asserts when at least one **charitable** line is paid.
 *
 * Exactly {@link INVARIANTS_FULL_MONETARY_RUN} **plus `I-R1`**, and the reason it is a separate list is
 * the interesting part: `I-R1` is reported here even though these examples record **no مآل clause at
 * all**. Its universal mirror still makes a live claim about them — *no charitable line is paid a halala
 * in the same run as a line the engine certified as a descendant of the waqif* (R5 as a runtime
 * assertion) — and `assertInvariants` reports an id when the invariant CLAIMS something, never when a
 * feature is merely configured.
 *
 * ⚠ That is not decoration. The mirror is measured to refuse **ESC-1**, whose payload was on this exact
 * waqf type: a خيري waqf under `ORDERED` whose cohort was `CATEGORY_ONLY` members the engine had itself
 * certified as descendants plus one `CHARITABLE_JIHA`, where the jiha took 13,750,000 of 27,500,000
 * halalas beside a living ṭabaqa-1 descendant. A run with neither a clause nor a charitable line has
 * nothing for I-R1 to say and correctly does not report it — see {@link INVARIANTS_FULL_MONETARY_RUN},
 * which Examples A, B, E and F still use unchanged.
 *
 * Spread rather than re-literalled, for {@link INVARIANTS_FULL_LINEAGE_RUN}'s reason.
 */
export const INVARIANTS_FULL_CHARITABLE_RUN: readonly InvariantId[] = Object.freeze([
  ...INVARIANTS_FULL_MONETARY_RUN,
  'I-R1',
]);

/**
 * **R7** · the invariants a **reverted** ذري run asserts — the مآل clause has triggered.
 *
 * `INVARIANTS_FULL_MONETARY_RUN` **plus `I-R1`**, and — the load-bearing part — **without `I-L1`**, even
 * though the order is `LINEAGE_CONTINUATION`. Per capita is the BLOODLINE's rule; once the reversion has
 * triggered the entitled lines are charitable ultimate takers splitting by their recorded deed weights
 * (R7-e), so "equal per head" makes no claim about the line that took the money — and a 70/30 taker
 * split would fail it outright. I-R1 stands in its place.
 *
 * ⚠ So this list is deliberately **not** `INVARIANTS_FULL_LINEAGE_RUN + I-R1`. Reporting an invariant
 * that makes no claim about the paid line is the R6-I5 defect (I5 was certified in `invariantsChecked`
 * on a run where the untiered line that took the pool was never tested), and it is not repeated here.
 */
export const INVARIANTS_REVERTED_RUN: readonly InvariantId[] = Object.freeze([
  ...INVARIANTS_FULL_MONETARY_RUN,
  'I-R1',
]);

/**
 * **Example A.**
 *
 * Waterfall: 35_000_000 − 4_000_000 (ṣiyāna) − 0 (operating) = 31_000_000 net;
 * fee = 10% of 35_000_000 = 3_500_000; distributable = 31_000_000 − 3_500_000 = **27_500_000**.
 * I1: 4_000_000 + 0 + 3_500_000 + 27_500_000 = 35_000_000 ✓
 *
 * Split: entitled ṭabaqa 1 = {ben-001 '12.5', ben-003 '12.5'} ⇒ weight ints [125, 125] over 250.
 * floor = 27_500_000 × 125 / 250 = 13_750_000 each; Σ = 27_500_000 exactly, residual 0.
 * sharePercent = 13_750_000 × 100 / 27_500_000 = 50.000000.
 *
 * ben-002 is EXCLUDED and its 12.5 is **absent from the denominator** — the two entitled members
 * take 50% each, not 33.3%. That is the check which catches an implementation that "excludes" by
 * zeroing an amount while leaving the weight in the divisor.
 */
export const EXPECTED_A: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'A — ORDERED, medium family_dhurri (V-1)',
  waqfId: 'waqf-001',
  distributionType: 'MONETARY',
  classification: 'MEDIUM',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'ORDERED',
  entitlementRule: 'ORDERED_LOWEST_LIVING_TABAQA',
  waterfall: {
    revenueMinor: 35_000_000n,
    capitalReceiptsMinor: 0n,
    maintenanceReserveMinor: 4_000_000n,
    operatingCostMinor: 0n,
    netIncomeMinor: 31_000_000n,
    nazirFeeMinor: 3_500_000n,
    nazirFeeBasis: 'PERCENT_OF_REVENUE',
    distributableMinor: 27_500_000n,
  },
  lines: [
    {
      beneficiaryId: 'ben-001',
      status: 'PAID',
      entitledMinor: 13_750_000n,
      sharePercent: '50.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0001',
      // R6: the descent fact is recorded on an ORDERED deed too. It is CARRIED (and printed on the
      // BR-505 basis) but not consumed — the tier test, not the frontier, decided this cohort.
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-002',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      reasonCode: 'UPPER_TABAQA_EXTANT',
      // Empty: an exclusion is an ENTITLEMENT verdict and payability was never reached.
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0002',
      // Derived depth 2 from `parentId: 'ben-001'`, and it AGREES with the declared ṭabaqa 2 —
      // `buildLineage` would have halted `TABAQA_MISMATCHES_LINEAGE_DEPTH` otherwise.
      lineageDepth: 2,
      parentId: 'ben-001',
      lineageLink: 'SON',
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-003',
      status: 'WITHHELD',
      entitledMinor: 13_750_000n,
      sharePercent: '50.000000',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
      bankingRefForProceeds: 'FAKE-IBAN-0003',
      // A DAUGHTER of the waqif, and entitled: `ORDERED` applies no continuation filter, so the
      // buṭūn link changes nothing here. Contrast Example G, where the same fact decides eligibility.
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: null,
    },
  ],
  totals: {
    paidMinor: 13_750_000n,
    withheldMinor: 13_750_000n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 27_500_000n,
    excludedCount: 1,
    entitledLineCount: 2,
    residualMinor: 0n,
  },
  flags: ['UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_FULL_MONETARY_RUN,
  authorityNoticeBeneficiaryIds: [],
});

/**
 * **Example B.**
 *
 * Waterfall: ṣiyāna = 5% of 20_000_000 = 1_000_000; net = 19_000_000;
 * fee = 10% of 20_000_000 = 2_000_000; distributable = **17_000_000**.
 * I1: 1_000_000 + 0 + 2_000_000 + 17_000_000 = 20_000_000 ✓
 *
 * Split: {ben-004 '25', ben-005 '25'} ⇒ 8_500_000 each, residual 0.
 *
 * **The contrast with A is the test.** ṭabaqa 2 (ben-005) is ENTITLED here — tashrik has no tier
 * test — so `excludedCount` is 0 and the block on ben-005 is a payability WITHHOLD (I6), not an
 * entitlement EXCLUSION (I5). A resolver that ignored `entitlementOrder` would fail A or B.
 */
export const EXPECTED_B: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'B — SHARED (tashrik), small family_dhurri (V-2)',
  waqfId: 'waqf-002',
  distributionType: 'MONETARY',
  classification: 'SMALL',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'SHARED',
  entitlementRule: 'SHARED_ALL_LIVING_TABAQAT',
  waterfall: {
    revenueMinor: 20_000_000n,
    capitalReceiptsMinor: 0n,
    maintenanceReserveMinor: 1_000_000n,
    operatingCostMinor: 0n,
    netIncomeMinor: 19_000_000n,
    nazirFeeMinor: 2_000_000n,
    nazirFeeBasis: 'PERCENT_OF_REVENUE',
    distributableMinor: 17_000_000n,
  },
  lines: [
    {
      beneficiaryId: 'ben-004',
      status: 'PAID',
      entitledMinor: 8_500_000n,
      sharePercent: '50.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0004',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-005',
      status: 'WITHHELD',
      entitledMinor: 8_500_000n,
      sharePercent: '50.000000',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
      bankingRefForProceeds: 'FAKE-IBAN-0005',
      lineageDepth: 2,
      parentId: 'ben-004',
      lineageLink: 'DAUGHTER',
      continuationStipulation: null,
    },
  ],
  totals: {
    paidMinor: 8_500_000n,
    withheldMinor: 8_500_000n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 17_000_000n,
    excludedCount: 0,
    entitledLineCount: 2,
    residualMinor: 0n,
  },
  flags: ['UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_FULL_MONETARY_RUN,
  authorityNoticeBeneficiaryIds: [],
});

/**
 * **Example C** — direct utilization, nil period. Everything zero, no line, both short-circuit flags.
 *
 * ⚠ `flags` is a SET rendered in canonical `RUN_FLAGS` order, so `NIL_DISTRIBUTION` precedes
 * `NA_DIRECT_USE` here even though the S3 brief lists them the other way round.
 */
export const EXPECTED_C: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'C — DIRECT_UTILIZATION, nil period (V-3)',
  waqfId: 'waqf-004',
  distributionType: 'NA_DIRECT_USE',
  classification: 'SMALL',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'NA_DIRECT_USE',
  entitlementRule: 'NA_DIRECT_USE',
  waterfall: {
    revenueMinor: 0n,
    capitalReceiptsMinor: 0n,
    maintenanceReserveMinor: 0n,
    operatingCostMinor: 0n,
    netIncomeMinor: 0n,
    nazirFeeMinor: 0n,
    // The basis is still recorded: the deed was NOT silent, the base was simply zero.
    nazirFeeBasis: 'PERCENT_OF_REVENUE',
    distributableMinor: 0n,
  },
  lines: [],
  totals: {
    paidMinor: 0n,
    withheldMinor: 0n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 0n,
    excludedCount: 0,
    entitledLineCount: 0,
    residualMinor: 0n,
  },
  flags: ['NIL_DISTRIBUTION', 'NA_DIRECT_USE', 'UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_NO_LINES,
  authorityNoticeBeneficiaryIds: [],
});

/**
 * **Example C2** — direct utilization WITH revenue. **The DEFECT-1 prover.**
 *
 * Waterfall: net = 10_000_000; fee = 10% of 10_000_000 = 1_000_000; distributable = **9_000_000**.
 * Lines: none. `retainedMinor` = 9_000_000.
 *
 * §08's I3 as written: `0 + 0 + 0 == 9_000_000` → **FALSE**.
 * Restated I3: `0 + 0 + 0 + 9_000_000 == 9_000_000` → true.
 * Restated I2: `Σ lines (0) + 9_000_000 == 9_000_000` → true.
 */
export const EXPECTED_C2: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'C2 — DIRECT_UTILIZATION with period revenue (DEFECT-1 prover)',
  waqfId: 'waqf-004',
  distributionType: 'NA_DIRECT_USE',
  classification: 'SMALL',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'NA_DIRECT_USE',
  entitlementRule: 'NA_DIRECT_USE',
  waterfall: {
    revenueMinor: 10_000_000n,
    capitalReceiptsMinor: 0n,
    maintenanceReserveMinor: 0n,
    operatingCostMinor: 0n,
    netIncomeMinor: 10_000_000n,
    nazirFeeMinor: 1_000_000n,
    nazirFeeBasis: 'PERCENT_OF_REVENUE',
    distributableMinor: 9_000_000n,
  },
  lines: [],
  totals: {
    paidMinor: 0n,
    withheldMinor: 0n,
    crossBorderMinor: 0n,
    retainedMinor: 9_000_000n,
    entitledMinor: 0n,
    excludedCount: 0,
    entitledLineCount: 0,
    residualMinor: 0n,
  },
  flags: ['NA_DIRECT_USE', 'UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_NO_LINES,
  authorityNoticeBeneficiaryIds: [],
});

/**
 * **Example D-خ** — Example D's arithmetic, re-homed onto a legal `PUBLIC_CHARITABLE` waqf.
 *
 * ⚠ Every figure below is Example D's, **re-derived by hand rather than copied**, because the input
 * changed: the deed weights are the same 40/30/30 but they now sit on three charitable jihas under
 * `SHARED` instead of on a jiha plus two family branches under the JOINT rule. Deed weights ARE
 * applied on a charitable allocation (ADR-0009 R3 exempts only a *lineage* cohort), so the split is
 * identical — which is the point: R5 removed an impossible waqf, not a computation.
 *
 * Waterfall: revenue 180_000_000 (the 2_000_000_000n of corpus is NOT in it);
 * net = 180_000_000 − 10_000_000 − 12_000_000 = 158_000_000;
 * fee = 10% of **revenue** = 18_000_000 (not 10% of 2_180_000_000);
 * distributable = 158_000_000 − 18_000_000 = **140_000_000**.
 * I1: 10_000_000 + 12_000_000 + 18_000_000 + 140_000_000 = 180_000_000 ✓
 *
 * Split: {ben-006 '40', ben-306 '30', ben-307 '30'} ⇒ ints [40,30,30] over 100.
 * 140_000_000 × 40 / 100 = 56_000_000; × 30 / 100 = 42_000_000 twice.
 * Σ = 56_000_000 + 42_000_000 + 42_000_000 = 140_000_000 exactly, residual 0.
 * sharePercent = 56_000_000 × 100 / 140_000_000 = 40.000000; 42_000_000 × 100 / 140_000_000 = 30.000000.
 *
 * ben-307 is CROSS_BORDER_PENDING — **routed, not blocked** — and is the one line that queues an
 * Authority notice.
 *
 * ⚠ `entitlementRule` is `SHARED_ALL_LIVING_TABAQAT`, not `JOINT_FIXED_DEED_SHARES`. That rule is now
 * UNREACHABLE (no run can be stamped with it) and `worked-examples.test.ts` asserts so directly —
 * carried by a test, never by a comment.
 *
 * Every `lineageDepth` / `parentId` / `lineageLink` below is `null`, and that is load-bearing: a
 * `CHARITABLE_JIHA` carrying any lineage edge is refused `LINEAGE_EDGE_ON_NON_DESCENDANT`, because a
 * charity is not a descendant of the waqif.
 */
export const EXPECTED_D_CHARITABLE: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'D-خ — PUBLIC_CHARITABLE, large; also the corpus-guard prover',
  waqfId: 'waqf-003',
  distributionType: 'MONETARY',
  classification: 'LARGE',
  waqfType: 'PUBLIC_CHARITABLE',
  entitlementOrder: 'SHARED',
  entitlementRule: 'SHARED_ALL_LIVING_TABAQAT',
  waterfall: {
    revenueMinor: 180_000_000n,
    capitalReceiptsMinor: 2_000_000_000n,
    maintenanceReserveMinor: 10_000_000n,
    operatingCostMinor: 12_000_000n,
    netIncomeMinor: 158_000_000n,
    nazirFeeMinor: 18_000_000n,
    nazirFeeBasis: 'PERCENT_OF_REVENUE',
    distributableMinor: 140_000_000n,
  },
  lines: [
    {
      beneficiaryId: 'ben-006',
      status: 'PAID',
      entitledMinor: 56_000_000n,
      sharePercent: '40.000000',
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      kind: 'CHARITABLE_JIHA',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0006',
      lineageDepth: null,
      parentId: null,
      lineageLink: null,
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-306',
      status: 'PAID',
      entitledMinor: 42_000_000n,
      sharePercent: '30.000000',
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      kind: 'CHARITABLE_JIHA',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0306',
      lineageDepth: null,
      parentId: null,
      lineageLink: null,
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-307',
      status: 'CROSS_BORDER_PENDING',
      entitledMinor: 42_000_000n,
      sharePercent: '30.000000',
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      kind: 'CHARITABLE_JIHA',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: 'CROSS_BORDER_PENDING',
      gateFlags: ['CROSS_BORDER_PENDING'],
      bankingRefForProceeds: 'FAKE-IBAN-0307',
      lineageDepth: null,
      parentId: null,
      lineageLink: null,
      continuationStipulation: null,
    },
  ],
  totals: {
    paidMinor: 98_000_000n,
    withheldMinor: 0n,
    crossBorderMinor: 42_000_000n,
    retainedMinor: 0n,
    entitledMinor: 140_000_000n,
    excludedCount: 0,
    entitledLineCount: 3,
    residualMinor: 0n,
  },
  flags: ['CAPITAL_RECEIPTS_EXCLUDED', 'UNVERIFIED_FIGURES_APPLIED'],
  // R7 · a خيري run paying charitable lines reports I-R1: its universal mirror claims that no charity is
  // paid beside a certified descendant, and that is a live claim here even with no مآل clause recorded.
  invariantsChecked: INVARIANTS_FULL_CHARITABLE_RUN,
  authorityNoticeBeneficiaryIds: ['ben-307'],
});

/**
 * **Example E** — the stale-KYC block, and the "ALL LINES GATED" state.
 *
 * The waterfall is identical to A's. ben-001's window: 2025-06-01 + 12 months = 2026-06-01, and
 * `asOf` 2026-07-14 is past it ⇒ `STALE_KYC`. `isKycUnverified` is false (VERIFIED, with a date), so
 * exactly ONE gate flag — a single condition must not carry two reason codes.
 *
 * `paidMinor` is 0 and `withheldMinor == distributableMinor`: the run still computes, is reviewable
 * and signable, and every `entitledMinor` is unchanged from A (I6).
 */
export const EXPECTED_E: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'E — STALE_KYC, all lines gated',
  waqfId: 'waqf-001',
  distributionType: 'MONETARY',
  classification: 'MEDIUM',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'ORDERED',
  entitlementRule: 'ORDERED_LOWEST_LIVING_TABAQA',
  waterfall: EXPECTED_A.waterfall,
  lines: [
    {
      beneficiaryId: 'ben-001',
      status: 'WITHHELD',
      entitledMinor: 13_750_000n,
      sharePercent: '50.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      reasonCode: 'STALE_KYC',
      gateFlags: ['STALE_KYC'],
      bankingRefForProceeds: 'FAKE-IBAN-0001',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    },
    EXPECTED_A.lines[1] as ExpectedLine,
    EXPECTED_A.lines[2] as ExpectedLine,
  ],
  totals: {
    paidMinor: 0n,
    withheldMinor: 27_500_000n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 27_500_000n,
    excludedCount: 1,
    entitledLineCount: 2,
    residualMinor: 0n,
  },
  flags: ['UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_FULL_MONETARY_RUN,
  authorityNoticeBeneficiaryIds: [],
});

/**
 * **Example F** — the Hamilton residual, verified against the allocator's algorithm line by line.
 *
 * weightScale 0 ⇒ ints [1n,1n,1n], Σw = 3n.
 * numerator_i = 10_000 × 1 = 10_000; floor_i = 10_000 / 3 = **3_333n** each (Σ 9_999n);
 * remainder_i = 10_000 − 3_333 × 3 = **1n** for all three ⇒ a three-way tie, broken by ascending
 * index (== ascending `beneficiaryId`) ⇒ `ben-a` is bumped. residual = 10_000 − 9_999 = **1n**.
 *
 * Σ sharePercent = 33.34 + 33.33 + 33.33 = 100.000000 here **by luck**; it does not generalise and
 * no test asserts it (see AT-04/AT-16).
 */
export const EXPECTED_F: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'F — residual (Hamilton) prover',
  waqfId: 'waqf-fixture-residual',
  distributionType: 'MONETARY',
  classification: 'SMALL',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'SHARED',
  entitlementRule: 'SHARED_ALL_LIVING_TABAQAT',
  waterfall: {
    revenueMinor: 10_000n,
    capitalReceiptsMinor: 0n,
    maintenanceReserveMinor: 0n,
    operatingCostMinor: 0n,
    netIncomeMinor: 10_000n,
    nazirFeeMinor: 0n,
    // The deed is SILENT — a null basis, not a zero rate. The flag below is what records that.
    nazirFeeBasis: null,
    distributableMinor: 10_000n,
  },
  lines: [
    {
      beneficiaryId: 'ben-a',
      status: 'PAID',
      entitledMinor: 3_334n,
      sharePercent: '33.340000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: null,
      kind: 'FAMILY',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0A',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-b',
      status: 'PAID',
      entitledMinor: 3_333n,
      sharePercent: '33.330000',
      tabaqa: 1,
      // A DAUGHTER, paid the identical halala: `SHARED` consumes no continuation term.
      line: 'BUTUN',
      branch: null,
      kind: 'FAMILY',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0B',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: null,
    },
    {
      beneficiaryId: 'ben-c',
      status: 'PAID',
      entitledMinor: 3_333n,
      sharePercent: '33.330000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: null,
      kind: 'FAMILY',
      rule: 'SHARED_ALL_LIVING_TABAQAT',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0C',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: null,
    },
  ],
  totals: {
    paidMinor: 10_000n,
    withheldMinor: 0n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 10_000n,
    excludedCount: 0,
    entitledLineCount: 3,
    residualMinor: 1n,
  },
  flags: ['AUTHORITY_FEE_DETERMINATION_PENDING', 'UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_FULL_MONETARY_RUN,
  authorityNoticeBeneficiaryIds: [],
});

/** The pre-bump Hamilton floors for Example F, so I9 is checked against a separate derivation. */
export const EXPECTED_F_FLOORS: readonly bigint[] = Object.freeze([3_333n, 3_333n, 3_333n]);

/**
 * **Example G** — `LINEAGE_CONTINUATION` + `ZUHUR_ONLY` on `waqf-005`. The product's normal deed.
 *
 * Waterfall: revenue 100_000_000 (the 2_000_000_000n of corpus is NOT in it);
 * net = 100_000_000 − 10_000_000 (ṣiyāna) − 2_000_000 (operating) = 88_000_000;
 * fee = 10% of **revenue** = 10_000_000 (not 10% of 2_100_000_000);
 * distributable = 88_000_000 − 10_000_000 = **78_000_000**.
 * I1: 10_000_000 + 2_000_000 + 10_000_000 + 78_000_000 = 100_000_000 ✓
 *
 * ELIGIBILITY, walked by hand from the tree. **R-FRONTIER**: entitled iff (1) living, (2) every
 * ancestor strictly between the person and the waqif is DECEASED, and (3) under `ZUHUR_ONLY`, every
 * such intermediate ancestor is a `SON`. The person's own `lineageLink` is never read. Where both
 * (2) and (3) fail, the daughter-line break wins — it is permanent, the living-ancestor hold is not.
 *
 * | id | proper ancestors, nearest first (✝ = deceased) | verdict under ZUHUR_ONLY |
 * |---|---|---|
 * | ben-201 | — | EXCLUDED `BENEFICIARY_INACTIVE` — his own vital status ✝ |
 * | ben-202 | — | **eligible** — a DAUGHTER of the waqif, in her own right (R2) |
 * | ben-203 | — | EXCLUDED `BENEFICIARY_INACTIVE` ✝ |
 * | ben-204 | — | **eligible** — a living son of the waqif |
 * | ben-205 | ben-201 SON ✝ | **eligible** — at the frontier; his father's death is the trigger |
 * | ben-206 | ben-201 SON ✝ | **eligible** — a son's DAUGHTER; her own link is not tested |
 * | ben-207 | ben-201 SON ✝ | EXCLUDED `BENEFICIARY_INACTIVE` ✝ |
 * | ben-208 | ben-207 SON ✝, ben-201 SON ✝ | **eligible** — two dead ancestors walked through |
 * | ben-209 | ben-207 SON ✝, ben-201 SON ✝ | **eligible** — a son's son's DAUGHTER |
 * | ben-210 | ben-203 DAUGHTER ✝ | EXCLUDED `BUTUN_LINE_NOT_CONTINUED` (blocking ben-203) |
 * | ben-211 | ben-203 DAUGHTER ✝ | EXCLUDED `BUTUN_LINE_NOT_CONTINUED` (blocking ben-203) |
 * | ben-212 | ben-204 SON, LIVING | EXCLUDED `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` (ben-204) |
 * | ben-213 | ben-202 DAUGHTER, LIVING | EXCLUDED `BUTUN_LINE_NOT_CONTINUED` (ben-202) — the break out-ranks the hold |
 * | ben-214 | ben-204 SON, LIVING | EXCLUDED `BENEFICIARY_INACTIVE` ✝ — own status first |
 * | ben-215 | ben-214 SON ✝, ben-204 SON LIVING | EXCLUDED `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` (**ben-204**, the grandfather) |
 * | ben-216 | ben-210 SON LIVING, ben-203 DAUGHTER ✝ | EXCLUDED `BUTUN_LINE_NOT_CONTINUED` (**ben-203**, two steps up) |
 *
 * ⇒ **6 eligible heads**: ben-202, ben-204, ben-205, ben-206, ben-208, ben-209. **10 excluded.**
 *
 * SPLIT, PER CAPITA (R3): effective weight `'1'` per eligible head, so weight ints [1,1,1,1,1,1]
 * over Σw = 6. floor_i = 78_000_000 × 1 / 6 = **13_000_000n** each; Σ = 6 × 13_000_000 = 78_000_000
 * exactly ⇒ every remainder is 0 and **residual 0n**.
 * sharePercent = 13_000_000 × 100 / 78_000_000 = 16.6666666… ⇒ HALF_UP at 6 dp = **16.666667**.
 *
 * The deed's OWN weights are **not applied** — hence `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA`.
 * ben-204's deed figure is 30 and ben-208's is 5, and they are paid the SAME 13,000.00 (ADR-0009 open
 * question 1). Note also the per-capita/per-stirpes discriminator: **Branch A collects four of the six
 * heads** (205, 206, 208, 209) while Branch B collects one (202) and Branch D one (204) — a branch is
 * paid per living head, not per branch, and Branch C collects **nothing at all** this period.
 *
 * TOTALS: paid = 4 × 13_000_000 (202, 204, 205, 208) = 52_000_000; withheld = 13_000_000 (206);
 * crossBorder = 13_000_000 (209). I3: 52_000_000 + 13_000_000 + 13_000_000 + 0 = 78_000_000 ✓
 *
 * I-L1: max entitled 13_000_000 − min entitled 13_000_000 = 0 ≤ 1 ✓ (see {@link EXPECTED_H} for the
 * case where the bound is exercised at its limit rather than at zero).
 */
export const EXPECTED_G: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'G — LINEAGE_CONTINUATION / ZUHUR_ONLY, large family_dhurri (waqf-005)',
  waqfId: 'waqf-005',
  distributionType: 'MONETARY',
  classification: 'LARGE',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'LINEAGE_CONTINUATION',
  entitlementRule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
  waterfall: {
    revenueMinor: 100_000_000n,
    capitalReceiptsMinor: 2_000_000_000n,
    maintenanceReserveMinor: 10_000_000n,
    operatingCostMinor: 2_000_000n,
    netIncomeMinor: 88_000_000n,
    nazirFeeMinor: 10_000_000n,
    nazirFeeBasis: 'PERCENT_OF_REVENUE',
    distributableMinor: 78_000_000n,
  },
  lines: [
    {
      beneficiaryId: 'ben-201',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0201',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-202',
      status: 'PAID',
      entitledMinor: 13_000_000n,
      sharePercent: '16.666667',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0202',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-203',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0203',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-204',
      status: 'PAID',
      entitledMinor: 13_000_000n,
      sharePercent: '16.666667',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0204',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-205',
      status: 'PAID',
      entitledMinor: 13_000_000n,
      sharePercent: '16.666667',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0205',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-206',
      status: 'WITHHELD',
      entitledMinor: 13_000_000n,
      sharePercent: '16.666667',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
      bankingRefForProceeds: 'FAKE-IBAN-0206',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-207',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0207',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-208',
      status: 'PAID',
      entitledMinor: 13_000_000n,
      sharePercent: '16.666667',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0208',
      lineageDepth: 3,
      parentId: 'ben-207',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-209',
      status: 'CROSS_BORDER_PENDING',
      entitledMinor: 13_000_000n,
      sharePercent: '16.666667',
      tabaqa: 3,
      line: 'BUTUN',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'CROSS_BORDER_PENDING',
      gateFlags: ['CROSS_BORDER_PENDING'],
      bankingRefForProceeds: 'FAKE-IBAN-0209',
      lineageDepth: 3,
      parentId: 'ben-207',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-210',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0210',
      lineageDepth: 2,
      parentId: 'ben-203',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-211',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0211',
      lineageDepth: 2,
      parentId: 'ben-203',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-212',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // R-FRONTIER, the product owner's own sentence: his father ben-204 is alive and holds this line.
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0212',
      lineageDepth: 2,
      parentId: 'ben-204',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-213',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // BOTH facts apply (his mother ben-202 is a DAUGHTER and is LIVING); the permanent one wins.
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      // CROSS_BORDER on the record, and NO gate flag: gates run only for the entitled cohort.
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0213',
      lineageDepth: 2,
      parentId: 'ben-202',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-214',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // His own vital status out-ranks the living ancestor above him — rung 1 of the precedence.
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0214',
      lineageDepth: 2,
      parentId: 'ben-204',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-215',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // His father ben-214 is DEAD and he is STILL excluded: his grandfather ben-204 lives.
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0215',
      lineageDepth: 3,
      parentId: 'ben-214',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-216',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // The precedence case: a LIVING son one step up, a DECEASED daughter two steps up. The break
      // wins, and the trace must name ben-203 — not the nearest ancestor, ben-210.
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0216',
      lineageDepth: 3,
      parentId: 'ben-210',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
  ],
  totals: {
    paidMinor: 52_000_000n,
    withheldMinor: 13_000_000n,
    crossBorderMinor: 13_000_000n,
    retainedMinor: 0n,
    entitledMinor: 78_000_000n,
    excludedCount: 10,
    entitledLineCount: 6,
    residualMinor: 0n,
  },
  flags: [
    'CAPITAL_RECEIPTS_EXCLUDED',
    'UNVERIFIED_FIGURES_APPLIED',
    'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
  ],
  invariantsChecked: INVARIANTS_FULL_LINEAGE_RUN,
  authorityNoticeBeneficiaryIds: ['ben-209'],
});

/**
 * **Example G′** — the SAME input with `continuationStipulation` flipped to `ZUHUR_AND_BUTUN`.
 *
 * The waterfall is byte-identical to G's: the continuation term is a Stage-2 fact and touches no money
 * above the split. Under `ZUHUR_AND_BUTUN` the daughter-line filter disappears **and nothing else
 * does** — R-FRONTIER's living-ancestor rule is untouched, because it is not a ẓuhūr/buṭūn rule:
 *
 *  · **ben-210 and ben-211 become eligible.** Their mother ben-203 is a *deceased* daughter of the
 *    waqif, so they already stood at the frontier of their line; the only thing that had excluded
 *    them was that the line ran through a daughter. This is the whole G↔G′ contrast.
 *  · **ben-213 and ben-216 do NOT become eligible — their exclusion CODE changes instead.** ben-213's
 *    mother ben-202 is a *living* daughter, and ben-216's grandmother ben-203 is dead but his father
 *    ben-210 is alive. Under `ZUHUR_ONLY` both read `BUTUN_LINE_NOT_CONTINUED`; here both read
 *    `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`. ⚠ And they now name **different ancestors**: ben-216's
 *    blocking ancestor moves from ben-203 (two steps up) to ben-210 (one step up).
 *  · **ben-212 and ben-215 are unchanged** — every ancestor on their chains is a SON, so the
 *    stipulation was never what excluded them.
 *  · **ben-201, ben-203, ben-207 and ben-214 stay EXCLUDED `BENEFICIARY_INACTIVE`** — a stipulation is
 *    not a resurrection.
 *
 * ⇒ 8 eligible heads, 8 excluded. floor_i = 78_000_000 × 1 / 8 = **9_750_000n** each;
 * Σ = 8 × 9_750_000 = 78_000_000 exactly ⇒ residual 0n.
 * sharePercent = 9_750_000 × 100 / 78_000_000 = **12.500000** exactly.
 *
 * TOTALS: paid = 6 × 9_750_000 (202, 204, 205, 208, 210, 211) = 58_500_000;
 * withheld = 9_750_000 (206); crossBorder = 9_750_000 (209).
 * I3: 58_500_000 + 9_750_000 + 9_750_000 + 0 = 78_000_000 ✓
 *
 * **Read the contrast with G and it is the whole rule:** ben-204's payment falls from 13,000.00 to
 * 9,750.00 — a 25% cut — because two more heads are eligible. Nothing about ben-204 changed; the
 * founder's stipulation did. That is per capita recomputed each period (R3), and it is why the
 * observation date (ADR-0009 open question 8) has to be settled before real statements ship.
 */
export const EXPECTED_G_ZUHUR_AND_BUTUN: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'G′ — LINEAGE_CONTINUATION / ZUHUR_AND_BUTUN, the same tree (waqf-005)',
  waqfId: 'waqf-005',
  distributionType: 'MONETARY',
  classification: 'LARGE',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'LINEAGE_CONTINUATION',
  entitlementRule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
  waterfall: EXPECTED_G.waterfall,
  lines: [
    {
      beneficiaryId: 'ben-201',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0201',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-202',
      status: 'PAID',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0202',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-203',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0203',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-204',
      status: 'PAID',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0204',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-205',
      status: 'PAID',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0205',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-206',
      status: 'WITHHELD',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
      bankingRefForProceeds: 'FAKE-IBAN-0206',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-207',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0207',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-208',
      status: 'PAID',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0208',
      lineageDepth: 3,
      parentId: 'ben-207',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-209',
      status: 'CROSS_BORDER_PENDING',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 3,
      line: 'BUTUN',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'CROSS_BORDER_PENDING',
      gateFlags: ['CROSS_BORDER_PENDING'],
      bankingRefForProceeds: 'FAKE-IBAN-0209',
      lineageDepth: 3,
      parentId: 'ben-207',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      // ★ Excluded under ZUHUR_ONLY, PAID here. The one field the founder's conditions turn on.
      beneficiaryId: 'ben-210',
      status: 'PAID',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0210',
      lineageDepth: 2,
      parentId: 'ben-203',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      // ★ And his sister, at the identical amount: the sexes on the path stop mattering entirely.
      beneficiaryId: 'ben-211',
      status: 'PAID',
      entitledMinor: 9_750_000n,
      sharePercent: '12.500000',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0211',
      lineageDepth: 2,
      parentId: 'ben-203',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-212',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      // Unchanged from G: the frontier is not a ẓuhūr/buṭūn rule, and his father still lives.
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0212',
      lineageDepth: 2,
      parentId: 'ben-204',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-213',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      // ★ Still excluded, but for a DIFFERENT reason than in G — and one that reverses on a death
      // rather than never reversing. Same person, same period, a different Arabic statement.
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0213',
      lineageDepth: 2,
      parentId: 'ben-202',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-214',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0214',
      lineageDepth: 2,
      parentId: 'ben-204',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-215',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0215',
      lineageDepth: 3,
      parentId: 'ben-214',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
    {
      beneficiaryId: 'ben-216',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
      // ★ The precedence case seen from the other side: with no daughter-line break left, the hold
      // is what remains — and the blocking ancestor moves from ben-203 to ben-210.
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0216',
      lineageDepth: 3,
      parentId: 'ben-210',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    },
  ],
  totals: {
    paidMinor: 58_500_000n,
    withheldMinor: 9_750_000n,
    crossBorderMinor: 9_750_000n,
    retainedMinor: 0n,
    entitledMinor: 78_000_000n,
    excludedCount: 8,
    entitledLineCount: 8,
    residualMinor: 0n,
  },
  flags: [
    'CAPITAL_RECEIPTS_EXCLUDED',
    'UNVERIFIED_FIGURES_APPLIED',
    'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
  ],
  invariantsChecked: INVARIANTS_FULL_LINEAGE_RUN,
  authorityNoticeBeneficiaryIds: ['ben-209'],
});

/**
 * **Example H** — the per-capita residual prover, and the R3-flag NEGATIVE case.
 *
 * Same tree and the same `ZUHUR_ONLY` verdicts as G (so 6 eligible heads, 10 excluded), but every deed
 * weight is `'1'`, revenue is 100.00, ṣiyāna is NONE, operating is 0 and the deed is SILENT on the
 * Nazir fee.
 *
 * Waterfall: net = 10_000; fee = 0 with a **null basis** (silent ≠ zero rate ⇒
 * `AUTHORITY_FEE_DETERMINATION_PENDING`); distributable = **10_000**.
 * I1: 0 + 0 + 0 + 10_000 = 10_000 ✓
 *
 * SPLIT, verified against the Hamilton allocator step by step: weight ints [1,1,1,1,1,1], Σw = 6.
 * numerator_i = 10_000 × 1 = 10_000; floor_i = 10_000 / 6 = **1_666n** each ⇒ Σ floors = 9_996n.
 * remainder_i = 10_000 − 1_666 × 6 = **4n** for all six ⇒ a six-way tie, broken by ascending
 * `beneficiaryId`, so the residual 4n goes to the FOUR LOWEST ELIGIBLE ids —
 * ben-202, ben-204, ben-205, ben-206 — and ben-208 / ben-209 stay at 1_666n.
 * residual = 10_000 − 9_996 = **4n**.
 *
 * ⚠ Note which ids are bumped: the excluded members are **not in the cohort at all**, so the tie-break
 * skips them. An implementation that ranked over all sixteen records would bump ben-201, ben-202,
 * ben-203 and ben-204 instead — the same halalas, attached to the wrong people, and two of them dead.
 *
 * TOTALS: paid = 1_667 + 1_667 + 1_667 (202, 204, 205) + 1_666 (208) = 6_667;
 * withheld = 1_667 (206); crossBorder = 1_666 (209).
 * I3: 6_667 + 1_667 + 1_666 + 0 = 10_000 ✓
 *
 * **I-L1 at its limit:** max 1_667 − min 1_666 = **1n**, exactly the bound. With equal weights every
 * Hamilton remainder is equal, so the spread can never exceed one halala — and this fixture is the one
 * that would catch a bound written as `< 1n` or as `== 0n`.
 *
 * `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` is **absent**: every eligible member records the same
 * weight, so per capita overrode nothing.
 */
export const EXPECTED_H: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'H — per-capita residual prover, ZUHUR_ONLY (waqf-005-residual)',
  waqfId: 'waqf-005-residual',
  distributionType: 'MONETARY',
  classification: 'SMALL',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'LINEAGE_CONTINUATION',
  entitlementRule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
  waterfall: {
    revenueMinor: 10_000n,
    capitalReceiptsMinor: 0n,
    maintenanceReserveMinor: 0n,
    operatingCostMinor: 0n,
    netIncomeMinor: 10_000n,
    nazirFeeMinor: 0n,
    nazirFeeBasis: null,
    distributableMinor: 10_000n,
  },
  lines: [
    {
      beneficiaryId: 'ben-201',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0201',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-202',
      status: 'PAID',
      entitledMinor: 1_667n,
      sharePercent: '16.670000',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0202',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-203',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'BUTUN',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0203',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-204',
      status: 'PAID',
      entitledMinor: 1_667n,
      sharePercent: '16.670000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0204',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-205',
      status: 'PAID',
      entitledMinor: 1_667n,
      sharePercent: '16.670000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0205',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-206',
      status: 'WITHHELD',
      entitledMinor: 1_667n,
      sharePercent: '16.670000',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
      bankingRefForProceeds: 'FAKE-IBAN-0206',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-207',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0207',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-208',
      status: 'PAID',
      entitledMinor: 1_666n,
      sharePercent: '16.660000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0208',
      lineageDepth: 3,
      parentId: 'ben-207',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-209',
      status: 'CROSS_BORDER_PENDING',
      entitledMinor: 1_666n,
      sharePercent: '16.660000',
      tabaqa: 3,
      line: 'BUTUN',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'CROSS_BORDER_PENDING',
      gateFlags: ['CROSS_BORDER_PENDING'],
      bankingRefForProceeds: 'FAKE-IBAN-0209',
      lineageDepth: 3,
      parentId: 'ben-207',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-210',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0210',
      lineageDepth: 2,
      parentId: 'ben-203',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-211',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'BUTUN',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0211',
      lineageDepth: 2,
      parentId: 'ben-203',
      lineageLink: 'DAUGHTER',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-212',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0212',
      lineageDepth: 2,
      parentId: 'ben-204',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-213',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch B',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0213',
      lineageDepth: 2,
      parentId: 'ben-202',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-214',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0214',
      lineageDepth: 2,
      parentId: 'ben-204',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-215',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch D',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0215',
      lineageDepth: 3,
      parentId: 'ben-214',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-216',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 3,
      line: 'ZUHUR',
      branch: 'Branch C',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: 'BUTUN_LINE_NOT_CONTINUED',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0216',
      lineageDepth: 3,
      parentId: 'ben-210',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
  ],
  totals: {
    paidMinor: 6_667n,
    withheldMinor: 1_667n,
    crossBorderMinor: 1_666n,
    retainedMinor: 0n,
    entitledMinor: 10_000n,
    excludedCount: 10,
    entitledLineCount: 6,
    residualMinor: 4n,
  },
  flags: ['AUTHORITY_FEE_DETERMINATION_PENDING', 'UNVERIFIED_FIGURES_APPLIED'],
  invariantsChecked: INVARIANTS_FULL_LINEAGE_RUN,
  authorityNoticeBeneficiaryIds: ['ben-209'],
});

/** Example H's pre-bump Hamilton floors, so I9 is checked against a separate derivation. */
export const EXPECTED_H_FLOORS: readonly bigint[] = Object.freeze([
  1_666n,
  1_666n,
  1_666n,
  1_666n,
  1_666n,
  1_666n,
]);

/**
 * The timing block every example produces (they share `asOf`, the deadline and the selector).
 *
 * `boundBy: 'HIJRI'` is decision D2 doing visible work: the Hijri window closes 2027-03-30, a day
 * before the Gregorian 2027-03-31, and `EARLIER_OF` takes it so lateness can never be under-reported.
 */
/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · Example J / J′ — the expected halalas, both periods
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Example J and J′ share one waterfall — only the register's vital statuses differ. */
const WATERFALL_J: ExpectedWaterfall = Object.freeze({
  revenueMinor: 40_000_000n,
  capitalReceiptsMinor: 0n,
  // 10% × 40,000,000 = 4,000,000.
  maintenanceReserveMinor: 4_000_000n,
  operatingCostMinor: 4_500_000n,
  // 40,000,000 − 4,000,000 − 4,500,000 = 31,500,000.
  netIncomeMinor: 31_500_000n,
  // ⚠ 10% of REVENUE, not of net income: 10% × 40,000,000 = 4,000,000. The difference from a
  // net-income basis is 3,150,000 halalas, which is why the basis is a recorded deed fact.
  nazirFeeMinor: 4_000_000n,
  nazirFeeBasis: 'PERCENT_OF_REVENUE',
  // 31,500,000 − 4,000,000 = 27,500,000.
  distributableMinor: 27_500_000n,
});

/**
 * **Example J** — the family lives, so the مآل receives NOTHING.
 *
 * The cohort is the living FRONTIER: `ben-601` is a child of the waqif with an empty proper-ancestor
 * chain, so he is entitled; `ben-602` is his son and his father is alive, so the entitlement is HELD
 * above him (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, temporary). One entitled head, per capita:
 *
 *   27,500,000 × 1/1 = **27,500,000** halalas to ben-601, residual 0.
 *
 * ⚠ **`jiha-601` takes ZERO, and it is recorded at the same deed weight as ben-601 on purpose.** Had
 * the taker escaped its verdict ladder it would have taken 27,500,000 × 10/20 = **13,750,000** — the
 * exact figure R6-D1 and ESC-1 were measured at, halving a living descendant of the waqif. R7 does not
 * merely refuse that input; it computes it to nothing.
 *
 * ⚠ `STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA` is **absent**, and that is a real claim rather than an
 * omission: the flag is computed over the entitled BLOODLINE with takers filtered out, and ben-601 is
 * the only entitled bloodline member, so there is no distinct-weight disagreement to report. A flag
 * here would be telling a reader that deed weights were overridden on a one-head cohort.
 */
export const EXPECTED_J: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'J — LINEAGE_CONTINUATION + ZUHUR_ONLY, ذري with a recorded مآل, family LIVING (R7)',
  waqfId: 'waqf-006',
  distributionType: 'MONETARY',
  classification: 'MEDIUM',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'LINEAGE_CONTINUATION',
  entitlementRule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
  waterfall: WATERFALL_J,
  lines: [
    {
      beneficiaryId: 'ben-601',
      status: 'PAID',
      entitledMinor: 27_500_000n,
      sharePercent: '100.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0601',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-602',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // TEMPORARY — it reverses the period his father dies. Its Arabic must not read as permanent.
      reasonCode: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0602',
      lineageDepth: 2,
      parentId: 'ben-601',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'jiha-601',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      // Untiered and edgeless — a charity is not in a generation and does not descend from the waqif.
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      kind: 'CHARITABLE_JIHA',
      // ⚠ On a PENDING run the taker's line carries the ORDER's rule. `resolver.ts` carries a
      // TODO(surface) about exactly this: that label is a statement about descent and is false of a
      // charity, even though no money moves and the exclusion beside it reads correctly. Which of the
      // two a pending statement should print is a reporting decision (E10/E12), not an arithmetic one.
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // TEMPORARY, and the hardest copy on the list: it must not read as a permanent disinheritance of
      // the charity, nor as an expectation of the family's extinction (E10/E12, product-approved).
      reasonCode: 'REVERSION_PENDING_LIVING_BLOODLINE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-J601',
      lineageDepth: null,
      parentId: null,
      lineageLink: null,
      continuationStipulation: 'ZUHUR_ONLY',
    },
  ],
  totals: {
    paidMinor: 27_500_000n,
    withheldMinor: 0n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 27_500_000n,
    excludedCount: 2,
    entitledLineCount: 1,
    residualMinor: 0n,
  },
  flags: ['UNVERIFIED_FIGURES_APPLIED'],
  // I-L1 IS asserted (per capita governs the family, and the reversion has not triggered) and I-R1 too
  // (a charitable line exists, so the universal mirror has a claim: no charity beside a descendant).
  invariantsChecked: Object.freeze([...INVARIANTS_FULL_MONETARY_RUN, 'I-L1', 'I-R1']),
  authorityNoticeBeneficiaryIds: [],
});

/**
 * **Example J′** — the recorded bloodline is over, so the **مآل الوقف** takes the distributable.
 *
 * One taker, deed weight 10 over Σ 10:
 *
 *   27,500,000 × 10/10 = **27,500,000** halalas, residual 0.
 *
 * ⚠ **Per capita is NOT applied to the charity** (R7-e): a charity is not a head of a bloodline, so its
 * share is its recorded deed weight. With one taker the two arithmetics coincide at 27,500,000 — which
 * is why `engine.test.ts` also drives the 70/30 and 1:2 taker splits, where they do not.
 *
 * ⚠ **`basis.rule` is `ULTIMATE_TAKER_MAAL_AL_WAQF` on the taker's line and
 * `LINEAGE_PER_CAPITA_ZUHUR_ONLY` on the family's — the first fixture in this file where `rule` VARIES
 * WITHIN ONE RUN.** Run-level `entitlementRule` keeps the order's rule, because the deed's standing
 * entitlement order did not change: its reversion clause took effect. A charity paid a family
 * endowment's whole ghallah on a line stamped with a lineage rule is the exact mis-statement ADR-0009
 * records as a defect.
 *
 * ⚠ **`I-L1` is ABSENT and `I-R1` present** — the swap R7's design requires. Equality per head makes no
 * claim about the line that took the money once the takers split by deed weight, and reporting an
 * invariant that says nothing about the paid line is the R6-I5 defect.
 */
export const EXPECTED_J_REVERTED: ExpectedExample = Object.freeze<ExpectedExample>({
  label: 'J′ — the same deed one period later: the bloodline is over and the مآل takes it (R7)',
  waqfId: 'waqf-006',
  distributionType: 'MONETARY',
  classification: 'MEDIUM',
  waqfType: 'FAMILY_DHURRI',
  entitlementOrder: 'LINEAGE_CONTINUATION',
  // The ORDER's rule, unchanged — see the note above.
  entitlementRule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
  waterfall: WATERFALL_J,
  lines: [
    {
      beneficiaryId: 'ben-601',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // The frontier rule reads the member's OWN vital status first and never reaches the walk.
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0601',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'ben-602',
      status: 'EXCLUDED',
      entitledMinor: 0n,
      sharePercent: '0.000000',
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      // ⚠ NOT `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`: his father is dead, so nothing is held above him.
      // He is excluded on his own status, which is what makes the bloodline over rather than waiting.
      reasonCode: 'BENEFICIARY_INACTIVE',
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-0602',
      lineageDepth: 2,
      parentId: 'ben-601',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    },
    {
      beneficiaryId: 'jiha-601',
      status: 'PAID',
      entitledMinor: 27_500_000n,
      sharePercent: '100.000000',
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      kind: 'CHARITABLE_JIHA',
      // ⚠ THE NEW LABEL, and it is mandatory rather than decorative — see the note above.
      rule: 'ULTIMATE_TAKER_MAAL_AL_WAQF',
      reasonCode: null,
      gateFlags: [],
      bankingRefForProceeds: 'FAKE-IBAN-J601',
      lineageDepth: null,
      parentId: null,
      lineageLink: null,
      continuationStipulation: 'ZUHUR_ONLY',
    },
  ],
  totals: {
    paidMinor: 27_500_000n,
    withheldMinor: 0n,
    crossBorderMinor: 0n,
    retainedMinor: 0n,
    entitledMinor: 27_500_000n,
    excludedCount: 2,
    entitledLineCount: 1,
    residualMinor: 0n,
  },
  // The single most consequential state change in a family endowment's life, on the run itself.
  //
  // ⚠ The ORDER is `RUN_FLAGS`' declaration order, not alphabetical and not the order the engine
  // happened to push them: `UNVERIFIED_FIGURES_APPLIED` is the seventh member and
  // `REVERSION_TO_ULTIMATE_TAKER_APPLIED` the tenth. Flag order is inside `canonicalizeResult`'s bytes,
  // so it is part of what a Nazir's signature covers and is asserted rather than sorted away.
  flags: ['UNVERIFIED_FIGURES_APPLIED', 'REVERSION_TO_ULTIMATE_TAKER_APPLIED'],
  invariantsChecked: INVARIANTS_REVERTED_RUN,
  authorityNoticeBeneficiaryIds: [],
});

export const EXPECTED_TIMING = Object.freeze({
  status: 'ON_TIME' as const,
  basis: 'POST_FYE_DEFAULT' as const,
  deadlineGregorian: '2027-03-31',
  deadlineHijri: '1448-10-22',
  hijriDeadlineAsGregorian: HIJRI_DEADLINE_AS_GREGORIAN,
  bindingCalendar: 'EARLIER_OF' as const,
  boundBy: 'HIJRI' as const,
  bindingDeadlineGregorian: HIJRI_DEADLINE_AS_GREGORIAN,
  // 2026-07-14 → 2027-03-30 inclusive of neither endpoint's partial day: 259 calendar days.
  daysUntilDeadline: 259,
  asOf: { gregorian: AS_OF_GREGORIAN, hijri: AS_OF_HIJRI },
  settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
  months: 3,
  unverifiedNote: UNVERIFIED_NOTE,
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Surfaced questions and the JSON fixture's delta — DATA, not applied in S3
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ SURFACED, NOT RESOLVED (CLAUDE.md binding rule 4) — ṣiyāna: reserve, or actual cost?
 *
 * §08 Example A uses `exp-e-001`, a maintenance expense **already paid** on 2026-02-10, as the
 * *stipulated reserve*. This engine takes `maintenance` as a RULE (the Shart's stipulation) and
 * `operatingCostMinor` as ACTUALS, and never derives a reserve from an expense row — so these
 * fixtures inject an explicit rule instead.
 *
 * The two readings give different real numbers on a real statement: counting both a 40,000 reserve
 * AND a 40,000 paid expense leaves the waqf 80,000 short of yield, while counting only one
 * under-reserves. Whether ṣiyāna is a forward reserve, an incurred cost, or both — and therefore
 * whether a paid maintenance expense belongs in `operatingCostMinor`, reduces the reserve, or
 * neither — is a fiqh + accounting question for the Sharia reviewer, not a coding choice.
 */
export const MAINTENANCE_RULE_IS_NOT_AN_EXPENSE =
  'ṣiyāna as a Shart-stipulated forward reserve vs an incurred maintenance cost — unresolved (fiqh + accounting)';

/**
 * What `data/fixtures/sample-waqf.json` must GAIN before S5/S7 can wire V-1/V-2/V-3 against the
 * seeded database.
 *
 * Exported as data rather than written in prose so the parent agent can hand it straight to S5/S7,
 * and so a test can assert the list is non-empty — i.e. that the engine-vs-database gap stays
 * visible instead of being quietly forgotten.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S4/E3 · SEVEN ITEMS CLOSED — MOVED, NOT DELETED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S3 applied none of this (decision D3). **S4/E3 applied part of it**: migration
 * `00000000000012_e3_lineage_reversion_deed_terms` plus the fixture and seed changes that came with it.
 * The seven items it discharged are in {@link FIXTURE_DELTA_CLOSED_IN_S4}, **verbatim**, each prefixed
 * with what closed it — not deleted, because this list's whole value is that it records what the seeded
 * database could not express and when that stopped being true. A test asserts
 * `required.length + closed.length` has not shrunk, so an item cannot leave here without arriving there.
 *
 * ⚠ **Three items were AMENDED IN PLACE rather than closed** (`active`, `tabaqa`, `entitlementOrder`):
 * each had a clause the migration satisfied *and* a clause it did not, and collapsing the two would
 * have retired an obligation that is still owed. The amendments say which half moved.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S5/E4 · THIRTEEN MORE CLOSED — MOVED, NOT DELETED (2026-08-17)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S5/E4 applied most of the remaining delta to `data/fixtures/sample-waqf.json` itself (measured
 * green: database suite 36 files / 889 tests twice consecutively; api suite 358 twice). The thirteen
 * items it discharged are in {@link FIXTURE_DELTA_CLOSED_IN_S5}, **verbatim**, each behind a
 * `✓ CLOSED` prefix naming what closed it. Of S4's three in-place amendments, `tabaqa` and
 * `entitlementOrder` closed outright (their still-owed half was waqf-005, which now exists) and
 * `active` was amended AGAIN — the tree's four deceased ancestors satisfy nothing for AT-03, whose
 * ORDERED extinction subject is still missing. `disbursingEntity` and `bankingRefForProceeds` were
 * likewise amended rather than closed: the FIXTURE now records both, but the Beneficiary COLUMNS do
 * not exist, so the seeded DATABASE still cannot express them (owed to E5/E6).
 */
export const FIXTURE_DELTA_REQUIRED: readonly string[] = Object.freeze([
  "⚠ CORRECTION to the R6-D1 item (moved 2026-08-17 to FIXTURE_DELTA_CLOSED_IN_S5, closed by waqf-003's re-typing), which is now half-false. It says a FAMILY_DHURRI (ذري) waqf may hold NO charitable_jiha at all. As of R7 it may hold one **if and only if** the deed names it in the reversion clause as the endowment's ultimate taker: unnamed ⇒ still refused (CHARITABLE_JIHA_ON_FAMILY_WAQF), named ⇒ permitted and EXCLUDED (REVERSION_PENDING_LIVING_BLOODLINE) until no living descendant remains on record. The خيري half of that item is UNCHANGED and still absolute — a PUBLIC_CHARITABLE waqf may hold no beneficiary recording a lineageLink (✓ DESCENDANT_ON_CHARITABLE_WAQF is a PRODUCT POSITION since memo Q6, product owner 2026-08-17, together with TABAQA_ON_CHARITABLE_WAQF and R6-F1's ذري-only edge scoping), and may not record a reversion at all (REVERSION_ON_CHARITABLE_WAQF, ⚠ still Claude's fail-safe reading of R5 and NOT among the three Q6 confirmed — awaiting the owner). So waqf-003 may become EITHER jiha-only-and-خيري OR ذري-with-descendants-plus-a-named-مآل; it may not become ذري with an unnamed charity.",
  '⚠ R7-d — a reverting deed needs its DECEASED descendants on record, which is a seed obligation nobody would guess. The reversion triggers only when NO living descendant is on record at all, measured over the CERTIFIED lineage graph; a clause recorded over an EMPTY family register is refused (REVERSION_WITH_NO_RECORDED_BLOODLINE) because ∅ is "not yet enrolled", not "extinct". So an endowment taken on after its family died out cannot be computed until its dead descendants are enrolled with active: false and real lineage edges. ⚠ Engineering\'s fail-safe call, not the owner\'s; the operational cost is real and is surfaced.',
  // ── ADR-0009's lineage model: FULLY DISCHARGED ACROSS TWO SPRINTS. The two COLUMN items
  //    (`parentId`, `lineageLink`) are in FIXTURE_DELTA_CLOSED_IN_S4 (migration 12); the fixture
  //    endowment that EXERCISES the rule (waqf-005) and the frontier's ancestor data obligation are
  //    in FIXTURE_DELTA_CLOSED_IN_S5 (S5/E4 applied the delta to sample-waqf.json, 2026-08-17).
  "⚠ AMENDED IN S4/E3, NOT CLOSED — beneficiaries[].active. WHAT LANDED: the column and the data. `active` is now a REQUIRED Boolean with NO @default on Beneficiary (migration 12) and every fixture record states it; ben-010 (waqf-002, a deceased daughter at tier 1) is the first `active: false` row the seed has ever carried, and R-FRONTIER's ancestor walk is what reads it. WHAT IS STILL OWED, and it is the half this entry was really about: AT-03 needs an ALL-INACTIVE UPPER TIER (or a documented test-only override) and no such tier exists — waqf-001 is the ORDERED endowment and both of its tier-1 members (ben-001, ben-003) are alive, so the ORDERED extinction test still has no fixture-shaped subject. The engine's own suite covers it; the SEEDED database does not. ⚠ AMENDED AGAIN IN S5/E4 (2026-08-17), STILL NOT CLOSED: the delta was applied and waqf-005's tree carries four deceased ancestors (ben-201, ben-203, ben-207, ben-214) — but they satisfy NOTHING for AT-03, which needs an all-inactive upper tier on an ORDERED deed. waqf-001 is still the only ORDERED endowment and its tier-1 members (ben-001, ben-003) are BOTH alive, so the ORDERED extinction test STILL has no fixture-shaped subject. Still owed.",
  'beneficiaries[].disbursingEntity { name, licensed, licenceExpiry } — absent, so ENTITY_UNLICENSED is untestable against seeded data. ben-006 needs one licensed; a second record needs licensed:false or an expired licenceExpiry for the negative case. ⚠ AMENDED IN S5/E4 (2026-08-17), NOT CLOSED: the FIXTURE now records it on ben-006 (licensed), ben-306 (unlicensed) and ben-307 (expired licence) — all three gate arms have fixture subjects — but NO Beneficiary COLUMN exists in schema.prisma, so ENTITY_UNLICENSED is still untestable against the seeded DATABASE. The column is owed to E5/E6.',
  'beneficiaries[].bankingRefForProceeds at TOP LEVEL — today it exists only nested under ubo, and only for ben-001 and ben-004, so a non-UBO PAID line has no target reference to record (BR-501). ⚠ AMENDED IN S5/E4 (2026-08-17), NOT CLOSED: the fixture key now exists at TOP LEVEL on every record, but the encrypted column pair (…Enc/…Hmac, on the UBO precedent) is owed to E5, so the seeded DATABASE still has no column to carry it onto a PAID line.',
  'SUPERSEDED by ADR-0009 — the earlier delta asked for family beneficiaries ben-007 / ben-008 on waqf-003 so the JOINT waqf would have a family leg. That is now the OPPOSITE of what is wanted: a jiha plus family members on one endowment is exactly the refused mixed cohort. The records themselves are kept in this fixture module as the REFUSAL subject (exampleDJoint) and must not be seeded as a computable waqf. See the ben-306 / ben-307 item above for the replacement.',
  'NO CHANGE NEEDED to waqf-004\'s entitlementOrder "n/a (direct use of the asset)", nor to any other lower-case enum value: packages/database/src/seed/map.ts already normalises them to the SCREAMING_SNAKE vocabulary the engine consumes.',
]);

/**
 * The items {@link FIXTURE_DELTA_REQUIRED} carried until S4/E3, and what discharged each.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A SECOND LIST RATHER THAN A SHORTER FIRST ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `FIXTURE_DELTA_REQUIRED` is not a to-do list; it is the **record of what the seeded database could
 * not express**, written down at the moment the engine discovered it. Deleting an entry when the gap
 * closes destroys the only place that history lives, and — this repo's actual failure mode — makes the
 * *next* reader unable to tell "closed" from "never noticed". Four premature closures are already on
 * this project's record (see CLAUDE.md register item #13), so the closure of each item is now itself a
 * recorded, checkable fact.
 *
 * Each entry is the **original text, verbatim**, behind a `✓ CLOSED …` prefix naming the artefact that
 * closed it. `worked-examples.test.ts` asserts `required.length + closed.length` has not fallen below
 * the pre-S4 total of 26, so an item cannot leave the first list without arriving in this one.
 *
 * ⚠ **This list is not evidence that the seeded database now RUNS these paths.** It says the fields
 * exist and the fixture states them. Whether a seeded endowment exercises the lineage rule end-to-end
 * is a separate obligation and is still OPEN in `FIXTURE_DELTA_REQUIRED` (waqf-005).
 */
export const FIXTURE_DELTA_CLOSED_IN_S4: readonly string[] = Object.freeze([
  '✓ CLOSED S4/E3 by migration 00000000000012_e3_lineage_reversion_deed_terms (enum ReversionKind, Waqf.reversionKind + reversionClauseCaptured + reversionRecordedAt/Hijri, the waqf_reversion_taker join table — no @default on any of them, write-once at the trigger) AND by data/fixtures/sample-waqf.json, where every endowment now STATES the clause as absent (`reversion: null`, `reversionClauseCaptured`) instead of omitting the key. ⚠ The engine input stayed TWO-STATE and no new discriminator was minted; the database\'s third state ("nobody has read the clause yet") is refused at the mapping boundary. ── ORIGINAL ENTRY ── waqfs[].reversion { kind, ultimateTakerIds } | null — ABSENT ENTIRELY, and it is a WAQF-LEVEL clause of the Shart (مآل الوقف: where the endowment goes once its beneficiary class ends). Product-owner decision 2026-08-10 (R7): a وقف ذري MAY name a charitable jiha as its ULTIMATE TAKER, receiving nothing while any descendant lives and taking the distributable once the bloodline is over. NULLABLE BUT NOT OPTIONAL and with NO default — "where does this endowment go when the family ends?" is a fiqh reading of the deed, so the key must be present and the value stated. Every ذري endowment in sample-waqf.json (waqf-001, waqf-002, waqf-004, and waqf-003 once it is re-typed) must therefore state it as ABSENT (null) rather than omitting it. ⚠ OWED BY E3/E4 IN schema.prisma TOO: `model Waqf` declares no reversion column and there is no `ReversionKind` enum, both pinned absent (with a positive control) in __tests__/prisma-vocabulary-parity.test.ts. The link to the takers must be a real reference to beneficiaries of the SAME waqf — the resolver refuses an unknown id (REVERSION_ULTIMATE_TAKER_UNKNOWN), a non-charity (REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE) and a repeated one (REVERSION_ULTIMATE_TAKER_DUPLICATED, never deduplicated, because a repeat double-counts in the weight vector and MOVES MONEY). Weights are NOT duplicated into the clause: a taker\'s share is its existing stipulatedWeight.',
  '✓ CLOSED S4/E3 by migration 12 (Beneficiary.parentId String? with the COMPOSITE FK [waqfId, parentId] → [waqfId, id], a CHECK forbidding a self-parent, @@index([waqfId, parentId]) added while @@index([waqfId, tabaqa]) was KEPT, and no @default) AND by the fixture, where ben-001…ben-010 each carry an explicit edge (ben-002 → ben-001, ben-005 → ben-010, ben-009 → ben-004, the rest null = a child of the waqif). ⚠ The composite FK answers ADR-0009 open question 9 STRUCTURALLY as waqf-scoped; the surfaced-question marker on contract.ts\'s parentId stays, because the owner was not asked. ⚠ Neither index is measured. ── ORIGINAL ENTRY ── beneficiaries[].parentId (string | null) — ABSENT, and now required on every record. null means "a child of the waqif" (ṭabaqa 1), NEVER "unknown": a member of the lineage graph whose parent is unrecorded is refused (LINEAGE_PARENT_UNKNOWN). It must reference another beneficiary of the SAME waqf, the graph must be acyclic, and every chain must terminate at a child of the waqif — so waqf-001\'s ben-001…ben-003 and waqf-002\'s ben-004/ben-005 each need an explicit edge, not a defaulted one. ⚠ OWED BY E3/E4 IN schema.prisma TOO, not only in the JSON: `Beneficiary` has NO parent self-relation and NO lineageLink column, so the engine currently leads the schema by this whole model (the declared delta is pinned in __tests__/prisma-vocabulary-parity.test.ts). @@index([waqfId, tabaqa]) also needs revisiting — the hot query is now an ancestor walk, not a tier scan.',
  '✓ CLOSED S4/E3 by migration 12 (enum LineageLink { SON DAUGHTER }, Beneficiary.lineageLink LineageLink?, no @default) AND by the fixture, where every FAMILY and CATEGORY_ONLY record carries a real link and ben-006 (the jiha) carries null on both this and parentId. ⚠ THE PROHIBITION TRAVELS WITH THE COLUMN: it is read for exactly one computation and must NEVER be rendered as a person\'s gender — no UI label, no report column, no CSV export, no i18n key. ── ORIGINAL ENTRY ── beneficiaries[].lineageLink ("SON" | "DAUGHTER" | null) — ABSENT, and it is the ẓuhūr/buṭūn ELIGIBILITY FACT (ADR-0009 R2), not demographics. null = not a descendant of the waqif (a charitable jiha; ben-006 must be null on both this and parentId or the run is refused LINEAGE_EDGE_ON_NON_DESCENDANT). ⚠ R6 (product owner, 2026-08-03 — ADR-0009 open question 10 answered YES): a FAMILY or CATEGORY_ONLY member with a null link is REFUSED (LINEAGE_LINK_MISSING) on **every** entitlementOrder, not only under LINEAGE_CONTINUATION. So ben-001…ben-005 each need a real link in the JSON, not just the lineage waqf\'s members: an ORDERED or SHARED deed whose beneficiaries record no descent no longer computes at all.',
  '✓ CLOSED S4/E3 by migration 12 (enum ContinuationStipulation, Waqf.continuationStipulation ContinuationStipulation? — NO @default and DELIBERATELY NO CHECK forcing it non-null on a LINEAGE_CONTINUATION deed, because the database must be able to RECORD an incomplete deed and the ENGINE must be the thing that halts; a Nazir has to be able to see the halt) AND by the fixture, where waqf-001 states zuhur_only, waqf-002 zuhur_and_butun, and waqf-003/004 state it as absent. ── ORIGINAL ENTRY ── waqfs[].continuationStipulation ("ZUHUR_ONLY" | "ZUHUR_AND_BUTUN" | null) — ABSENT. A CLOSED two-value deed term with NO default: on a LINEAGE_CONTINUATION waqf an absent or unrecognised value halts SHART_INCOMPLETE, because which lines a founder continued is not something code may choose. It must be a recorded fact per waqf, and it decides head count — under the invented waqf-005 tree the same 780,000.00 pays 6 heads at 13,000.00 under ZUHUR_ONLY and 8 heads at 9,750.00 under ZUHUR_AND_BUTUN, a 25% cut to every surviving beneficiary from one deed field.',
  '✓ CLOSED S4/E3 by the fixture: every beneficiary now states `kind`, and ben-009 exists on waqf-002 as the "category_only" record with stipulatedWeight "10", so the CATEGORY_NOT_CAPTURED gate (G-4, BR-206) finally has a fixture-shaped subject. ⚠ `beneficiaries[].category` itself is STILL ABSENT and remains its own open entry in FIXTURE_DELTA_REQUIRED — a category_only record with no `category` key is exactly the withheld case, so the gate has a subject either way. ── ORIGINAL ENTRY ── beneficiaries[].kind — absent entirely. ben-001…ben-005 = "family", ben-006 = "charitable_jiha". No "category_only" record exists anywhere, so the CATEGORY_NOT_CAPTURED gate (G-4, BR-206) has no fixture-shaped subject: add ben-009 on waqf-002 with kind "category_only", category null, stipulatedWeight "10".',
  "✓ CLOSED S4/E3 by migration 12 (Beneficiary.stipulatedWeight Decimal? @db.Decimal(38, 18) — a field DISTINCT from sharePercent, scale 18 matching the engine's MAX_WEIGHT_DECIMAL_PLACES, NULLABLE so the migration invented no weight for any existing row and the mapper REFUSES a null instead of substituting one) AND by the fixture, which states a weight string on every record. sharePercent was left untouched — its fate is E4's. ── ORIGINAL ENTRY ── beneficiaries[].stipulatedWeight (decimal STRING) — absent, and distinct from the existing sharePercent. waqf-001's three sharePercent: 12.5 values sum to 37.5, not 100, whereas §08 treats 12.5 as a RELATIVE deed weight normalised over the entitled cohort. One field for both meanings is how a 37.5%-of-distributable payout ships.",
  '✓ CLOSED S4/E3 by the fixture AND by packages/database/src/seed/map.ts: rev-001 and rev-002 each carry an explicit receiptClass ("income") with capitalSource null, and the mapper now READS that field instead of writing receiptClass: "INCOME" unconditionally — it also refuses a "capital" row with no capitalSource and an "income" row that names one. The classification is DATA in the fixture, which is what binding rule 1 needed it to be. ⚠ A CAPITAL receipt still does not exist in the fixture and stays its own open entry: the guard is now data-driven but has no positive corpus row to refuse. ── ORIGINAL ENTRY ── REVENUE: an explicit receiptClass ("income" | "capital") on EVERY row, plus capitalSource where capital. rev-001 and rev-002 carry neither, and packages/database/src/seed/map.ts HARDCODES receiptClass: "INCOME" for them — which is exactly the silent trust D1\'s engine-side guard exists to close. The classification must be DATA in the fixture, not a decision in the mapper.',
]);

/**
 * The items {@link FIXTURE_DELTA_REQUIRED} carried until S5/E4 (2026-08-17), and what discharged each.
 *
 * **S5/E4 APPLIED the delta to `data/fixtures/sample-waqf.json` itself** — the sprint this list was
 * always addressed to. What landed, in one pass, measured green (database suite 36 files / 889 tests
 * twice consecutively; api suite 358 twice):
 *
 *  · **waqf-003 re-typed `public_charitable`**, jiha-only, with ben-306 / ben-307 beside ben-006 at
 *    the 40/30/30 deed weights — the mixed cohort is gone, not re-declared.
 *  · **waqf-005 gained the sixteen-member three-generation tree** (ben-201…ben-216), mirroring the
 *    engine tree in this module, so the seeded database can finally express a `LINEAGE_CONTINUATION`
 *    cohort — including its four deceased ancestors with explicit `active: false`.
 *  · **Every beneficiary gained `residency`, `category`, `disbursingEntity` and
 *    `bankingRefForProceeds`** as stated (not defaulted) keys.
 *  · **Revenue gained `rev-003`** (waqf-002, with the FAKE-ACCT-W2 dedicated account) **and the
 *    CAPITAL `rev-004`** (expropriation compensation on asset-005, tied to exp-001).
 *  · **Every waqf gained `maintenanceRule` / `nazirFee` / `disbursementSchedule`**, feeding the
 *    structured Shart.
 *
 * Same law as {@link FIXTURE_DELTA_CLOSED_IN_S4}: each entry is the **original text, verbatim**,
 * behind a `✓ CLOSED` prefix naming what closed it, and the conservation test asserts
 * `required + closedS4 + closedS5` never falls below the pre-S4 total. ⚠ Closure here means the
 * FIXTURE states the fact — where the DATABASE column is still missing (`disbursingEntity`,
 * `bankingRefForProceeds`), the entry did NOT move and was amended in place instead.
 */
export const FIXTURE_DELTA_CLOSED_IN_S5: readonly string[] = Object.freeze([
  '✓ CLOSED (S5/E4, 2026-08-17): waqf-003 re-typed PUBLIC_CHARITABLE and jiha-only (ben-006/ben-306/ben-307), and every family waqf in sample-waqf.json is descendant-only — ' +
    "⚠⚠ THE ذري HALF OF THIS ENTRY IS SUPERSEDED BY R7 — read the CORRECTION entry near the top of this list before acting on the sentence beginning 'Practically'. Kept verbatim rather than rewritten because it is the record of what the engine refused between 2026-08-09 and 2026-08-10, and the measured figures below are still the reason the refusal exists. WHAT IS STILL TRUE: the خيري half, absolutely. WHAT IS NOT: 'may hold NO charitable_jiha at all' and 'every family waqf must become descendant-only' — a ذري waqf MAY hold a charitable jiha named in the deed's reversion clause as its ultimate taker, so a family waqf may be descendant-only OR descendants-plus-a-named-مآل. ── ORIGINAL ENTRY ── R6-D1 + ESC-1 — the COHORT must match the waqf's nature, and the seed currently cannot satisfy both. A FAMILY_DHURRI (ذري) waqf may hold NO charitable_jiha at all (CHARITABLE_JIHA_ON_FAMILY_WAQF), and a PUBLIC_CHARITABLE (خيري) waqf may hold NO beneficiary recording a lineageLink (DESCENDANT_ON_CHARITABLE_WAQF) — both refused whatever the entitlementOrder, and both are Claude's application of the owner's R5 to shapes the owner was not asked about directly (the engine carries a TODO(surface) on each). MEASURED before they landed: a jiha on a family waqf took 27,500,000 of 27,500,000 halalas unflagged, and an untiered jiha on a charitable waqf took 13,750,000 beside a living certified descendant. Practically: waqf-003 must become jiha-only, and every family waqf must become descendant-only.",
  "✓ CLOSED (S5/E4, 2026-08-17): every ancestor in the seeded fixture carries an explicit, accurate `active` flag, including the four deceased ancestors of waqf-005's tree — " +
    "⚠ R-FRONTIER (product owner, 2026-08-03, CORRECTING ADR-0009's own wording) — entitlement sits at the NEAREST LIVING point on each line of descent, not with every living descendant. A beneficiary is entitled only if EVERY ancestor strictly between them and the waqif is deceased; a living ancestor holds the entitlement and their descendants wait (ENTITLEMENT_HELD_BY_LIVING_ANCESTOR, a TEMPORARY exclusion that reverses on that ancestor's death). This is a data obligation, not only an engine one: the seed must carry an explicit, accurate `active` flag on every ancestor, because one stale vital status now silently moves an entire branch's money — and any UI, report or cache that treats an exclusion as durable is wrong for this code specifically.",
  '✓ CLOSED (S5/E4, 2026-08-17): waqf-005 (lineage_continuation) now carries the sixteen-member register, so the seeded database can express a LINEAGE_CONTINUATION cohort; waqf-001 stays ORDERED and waqf-002 SHARED — ' +
    '⚠ AMENDED IN S4/E3, NOT CLOSED — waqfs[].entitlementOrder must gain "LINEAGE_CONTINUATION" ON A FIXTURE ENDOWMENT, and no endowment uses it yet. WHAT LANDED: the Prisma enum member (migration 12), so the sentence this entry used to carry — "⚠ The Prisma EntitlementOrder enum does NOT yet have it: the engine is deliberately AHEAD of schema.prisma by that one declared member (see prisma-vocabulary-parity.test.ts PENDING_MIGRATION) and E3/E4 owes the migration" — is now FALSE and is recorded here rather than quietly dropped. WHAT IS STILL OWED: sample-waqf.json records ORDERED (waqf-001), SHARED (waqf-002, waqf-003) and n/a-direct-use (waqf-004) and NOTHING on LINEAGE_CONTINUATION, so the seeded database still cannot reproduce a single run on the order ADR-0009 R4 calls NORMAL. That needs waqf-005 (the entry below). waqf-001 stays ORDERED and waqf-002 stays SHARED — both are still valid deeds and are the contrast that proves the order is read.',
  "✓ CLOSED (S5/E4, 2026-08-17): waqf-005's sixteen and ben-306/ben-307 exist and every recorded tabaqa equals its derived parentId depth, measured by the seed suite — " +
    "⚠ AMENDED IN S4/E3, NOT CLOSED — beneficiaries[].tabaqa is NO LONGER A TRUSTED INPUT; it is a CROSS-CHECK. For any lineage-graph member the authoritative value is DERIVED from parentId depth, and a supplied value that disagrees HALTS (TABAQA_MISMATCHES_LINEAGE_DEPTH), tabaqa: null on a recorded descendant included. So the seed must not emit a tabaqa the edges do not imply; the two sides exist to test each other. MEASURED 2026-08-13 on the eight records sample-waqf.json now carries: every recorded tabaqa equals its derived parentId depth (ben-001/003/004/010 depth 1 tabaqa 1; ben-002/005/009 depth 2 tabaqa 2; ben-006 both null), so the CURRENT rows are consistent. The entry stays OPEN because its subject includes the records that do not exist yet — waqf-005's sixteen, ben-306/307 — and a three-generation tree is exactly where a hand-written tabaqa stops matching a hand-written edge.",
  '✓ CLOSED (S5/E4, 2026-08-17): the sixteen (ben-201…ben-216) are in sample-waqf.json in topological order; a newcomer must start at ben-217 — ' +
    "NEW WAQF waqf-005 + SIXTEEN beneficiaries ben-201…ben-216 — the three-generation, four-branch lineage tree these fixtures use. It carries a deceased son with living children, a deceased DAUGHTER with living children (the ZUHUR_ONLY↔ZUHUR_AND_BUTUN hinge), a son's daughter, a living son whose children are all held back, a chain whose middle generation is dead while the grandparent lives, and a descendant blocked by a dead daughter two steps up past a living son. Nothing in sample-waqf.json exercises the lineage rule at all today, so without this waqf the seeded database cannot reproduce a single LINEAGE_CONTINUATION run. All sixteen records are invented, and the ids are contiguous — a seed or a probe adding a newcomer must start at ben-217 or it collides (BENEFICIARY_ID_DUPLICATED).",
  '✓ CLOSED (S5/E4, 2026-08-17): both exist and waqf-003 is re-typed public_charitable; `joint` remains in schema.prisma and the mapper as refused-not-remapped vocabulary (ADR-0004), untouched — ' +
    'NEW BENEFICIARIES ben-306 / ben-307 on waqf-003 — two further charitable jihas. ⚠ waqf-003 is recorded "joint" and a JOINT waqf is now REFUSED (ADR-0009 R5: a waqf is either خيري or ذري, never both), as is any cohort mixing a CHARITABLE_JIHA with a FAMILY member under any type. waqf-003 must therefore be re-typed — to public_charitable with three jihas (what the engine fixtures now do), or to family_dhurri with family beneficiaries only. ⚠⚠ DO NOT remove "joint" from schema.prisma\'s WaqfType and do not write a migration: Awqaf Law Art. 4 and glossary.md\'s الوقف المشترك both record joint endowments as real, that contradiction is an OPEN item for Saudi counsel, and ADR-0004 established that this repo\'s enum narrowings refuse rather than remap.',
  "✓ CLOSED (S5/E4, 2026-08-17): the required explicit key on every record; ben-209 and ben-213 are CROSS_BORDER — this entry's ben-008 case is superseded (waqf-003 is now خيري) and the cross-border subjects live on waqf-005 — " +
    'beneficiaries[].residency ("domestic" | "cross_border") — absent. Example D\'s ben-008 needs cross_border, and it must be EXPLICIT because a defaulted domestic silently routes a cross-border payment as domestic (BR-511, Nazarah Art. 10(7)).',
  "✓ CLOSED (S5/E4, 2026-08-17): a required key on every record, mapped to categoryDescriptionAr; ben-009's null stays the CATEGORY_NOT_CAPTURED subject — " +
    'beneficiaries[].category (string | null) — absent entirely.',
  '✓ CLOSED (S5/E4, 2026-08-17): rev-003 plus the FAKE-ACCT-W2 dedicated-account reference (asset-003 moved vacant → fully_rented so ledger and occupancy agree) — ' +
    "REVENUE: a rev row for waqf-002 — Example B's 200,000 has no row behind it, and there is no FAKE-ACCT-W2 dedicated-account reference for waqf-002 either.",
  '✓ CLOSED (S5/E4, 2026-08-17): rev-004 (expropriation_compensation, 20,000,000, on asset-005, tied to the existing exp-001 taking) — ' +
    'REVENUE: at least one CAPITAL receipt (e.g. rev-004 on waqf-003, expropriation_compensation 20,000,000, tied to the existing exp-001 taking). AT-12 and I-C1 need it, and G-9\'s "no leakage" claim is weak with no corpus row present to leak.',
  '✓ CLOSED (S5/E4, 2026-08-17): the waqf-level key feeding the structured Shart (waqf-001 fixed 40,000; waqf-002 percent 5; waqf-003 fixed 100,000; waqf-004 POSITIVELY none; waqf-005 null-as-unread) — ' +
    'WAQFS: a structured maintenanceRule per waqf under its Shart (waqf-001 fixed 40,000; waqf-002 percent 5; waqf-003 fixed 100,000; waqf-004 none). Today the only maintenance datum is exp-e-001, a PAID expense — see MAINTENANCE_RULE_IS_NOT_AN_EXPENSE.',
  "✓ CLOSED (S5/E4, 2026-08-17): the waqf-level key; waqf-002's explicit null is the deliberately-silent AUTHORITY_FEE_DETERMINATION_PENDING subject (AT-02) — " +
    'WAQFS: a nazirFee basis+rate per waqf, or an explicit null for "deed silent". nazirFees[] has one row (fee-001, waqf-001), so waqf-002 and waqf-003 have no fee basis and Examples B and D silently assume 10%. One deliberately-null case would exercise AUTHORITY_FEE_DETERMINATION_PENDING (AT-02).',
  '✓ CLOSED (S5/E4, 2026-08-17): the waqf-level key (waqf-001 quarterly, waqf-003 annual, the others null) — ' +
    'WAQFS: disbursementSchedule ("annual" | "quarterly" | "custom" | null) per waqf. Absent — and null is what makes the post-FYE default window bind, so it must be a RECORDED fact rather than an inference from a missing field.',
]);

/**
 * The size of `FIXTURE_DELTA_REQUIRED` immediately before S4/E3.
 *
 * **MEASURED, not remembered:** 27 entries at commit `1375a4b` (the commit S4 opened on), counted from
 * that revision of this file rather than from the sprint brief — the brief said 26, and a hand-copied
 * count is exactly the kind of fact that stops being read. S4/E3 discharged seven and S5/E4 thirteen more
 * (2026-08-17), so the three lists hold 7 + 7 + 13 today.
 *
 * Pinned as a number so the two lists cannot both shrink: `required + closed >= this` is asserted, which
 * makes "an entry was tidied away" a red test rather than a diff nobody re-reads.
 */
export const FIXTURE_DELTA_TOTAL_BEFORE_S4 = 27;
