/**
 * `engine.test.ts` — the distribution engine end to end (PRD §08, epic E6).
 *
 * Covers what the ASSEMBLY agent owns: `runDistribution`'s stage ordering, both short-circuits,
 * every refusal, output-schema conformance, determinism (I8), the honesty of
 * `result.invariantsChecked`, and the `trace.ts` / `invariants.ts` units.
 *
 * ## Why the output schema is written HERE and not in `contract.ts`
 *
 * The task requires `DistributionResult.parse(result)` — "not just by construction". A zod schema
 * living beside the engine and *used* by the engine would be self-confirming: the engine would
 * satisfy it because it was built from it. {@link distributionResultSchema} below is therefore an
 * INDEPENDENT restatement of the `DistributionResult` interface, written from the contract's field
 * list, `.strict()` at every level so an extra field fails, and annotated
 * `z.ZodType<DistributionResult, z.ZodTypeDef, unknown>` so that **`tsc` fails if the schema and the
 * interface ever disagree**. It catches three things `assertResultShape` cannot: a field the engine
 * forgot, a field it added, and an `undefined` where the contract promises an explicit `null`.
 *
 * ## Purity of the tests themselves
 *
 * No clock, no filesystem, no fixture read. `asOf` is built with `../../dates`'s `dual()` so the
 * cross-calendar check can never fail for an unrelated reason, and the two deadline halves are the
 * S3 brief's verified pair (`2027-03-31` / `1448-10-22`, which is `2027-03-30` — one day earlier,
 * the whole point of decision D2). Every amount is invented; nothing here comes from a real family.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { civilDate, dual } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import { UNVERIFIED_NOTE } from '../../settings.js';
import {
  BENEFICIARY_KINDS,
  BENEFICIARY_LINES,
  CONTINUATION_STIPULATIONS,
  DEADLINE_BASES,
  ENTITLEMENT_ORDERS,
  ENTITLEMENT_RULES,
  EXCLUSION_REASON_CODES,
  FEE_BASES,
  GATE_REASON_CODES,
  INVARIANT_IDS,
  LINEAGE_LINKS,
  LINE_STATUSES,
  RUN_FLAGS,
  TRACE_STAGES,
  WAQF_CLASSIFICATIONS,
  WAQF_TYPES,
  beneficiaryInputSchema,
  civilDateSchema,
  dualDateSchema,
  hijriDateSchema,
  assertResultShape,
  minorOf,
  nonNegativeMinorSchema,
  parseDistributionInput,
} from '../contract.js';
import type {
  BeneficiaryInput,
  DistributionInputRaw,
  DistributionResult,
  InvariantId,
  Minor,
  RunFlag,
} from '../contract.js';
import { allocateMinor, entitledCohortWeights } from '../allocate.js';
import { ENGINE_VERSION, runDistribution } from '../engine.js';
import {
  assertCorpusSegregation,
  assertDirectUseTotals,
  assertInvariants,
  assertResidualBound,
  assertReversionIntegrity,
  assertSplitConservation,
  assertWaterfallConservation,
} from '../invariants.js';
import type { InvariantContext } from '../invariants.js';
import { resolveEntitlement } from '../resolver.js';
import { canonicalizeResult, createTraceBuilder, step, traceText } from '../trace.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The independent output schema (see the file header)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const traceEntrySchema = z
  .object({
    seq: z.number().int().positive(),
    stage: z.enum(TRACE_STAGES),
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    data: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const lineBasisSchema = z
  .object({
    tabaqa: z.number().int().positive().nullable(),
    line: z.enum(BENEFICIARY_LINES),
    branch: z.string().nullable(),
    kind: z.enum(BENEFICIARY_KINDS),
    rule: z.enum(ENTITLEMENT_RULES),
    // ADR-0009's four fields. `.strict()` above is what makes this an independent restatement rather
    // than a copy: adding a field to `LineBasis` and not here stops this file typechecking, and adding
    // one here that the engine does not emit fails at runtime.
    lineageDepth: z.number().int().positive().nullable(),
    parentId: z.string().min(1).nullable(),
    lineageLink: z.enum(LINEAGE_LINKS).nullable(),
    continuationStipulation: z.enum(CONTINUATION_STIPULATIONS).nullable(),
  })
  .strict();

const lineSchema = z
  .object({
    beneficiaryId: z.string().min(1),
    status: z.enum(LINE_STATUSES),
    entitledMinor: nonNegativeMinorSchema,
    // Fixed 6 dp, as a STRING. A float here would reach the official Arabic statement as
    // `33.333333333333336` (NFR-01).
    sharePercent: z.string().regex(/^\d+\.\d{6}$/),
    basis: lineBasisSchema,
    reasonCode: z.union([z.enum(GATE_REASON_CODES), z.enum(EXCLUSION_REASON_CODES)]).nullable(),
    gateFlags: z.array(z.enum(GATE_REASON_CODES)),
    bankingRefForProceeds: z.string().nullable(),
  })
  .strict();

const waterfallSchema = z
  .object({
    revenueMinor: nonNegativeMinorSchema,
    capitalReceiptsMinor: nonNegativeMinorSchema,
    maintenanceReserveMinor: nonNegativeMinorSchema,
    operatingCostMinor: nonNegativeMinorSchema,
    netIncomeMinor: nonNegativeMinorSchema,
    nazirFeeMinor: nonNegativeMinorSchema,
    nazirFeeBasis: z.enum(FEE_BASES).nullable(),
    distributableMinor: nonNegativeMinorSchema,
  })
  .strict();

const totalsSchema = z
  .object({
    paidMinor: nonNegativeMinorSchema,
    withheldMinor: nonNegativeMinorSchema,
    crossBorderMinor: nonNegativeMinorSchema,
    retainedMinor: nonNegativeMinorSchema,
    entitledMinor: nonNegativeMinorSchema,
    excludedCount: z.number().int().nonnegative(),
    entitledLineCount: z.number().int().nonnegative(),
    residualMinor: nonNegativeMinorSchema,
  })
  .strict();

const timingSchema = z
  .object({
    status: z.enum(['ON_TIME', 'OVERDUE']),
    basis: z.enum(DEADLINE_BASES),
    deadlineGregorian: civilDateSchema,
    deadlineHijri: hijriDateSchema,
    hijriDeadlineAsGregorian: civilDateSchema,
    bindingCalendar: z.enum(['EARLIER_OF', 'GREGORIAN', 'HIJRI']),
    boundBy: z.enum(['GREGORIAN', 'HIJRI']),
    bindingDeadlineGregorian: civilDateSchema,
    daysUntilDeadline: z.number().int(),
    asOf: dualDateSchema,
    settingKey: z.string().min(1),
    months: z.number().int().nonnegative(),
    unverifiedNote: z.string().min(1).nullable(),
  })
  .strict();

const authorityNoticeSchema = z
  .object({
    type: z.literal('CROSS_BORDER_DISBURSEMENT'),
    beneficiaryId: z.string().min(1),
    reasonCode: z.enum(GATE_REASON_CODES),
    reason: z.string().min(1),
  })
  .strict();

/**
 * The engine's output contract, restated independently.
 *
 * The `z.ZodType<DistributionResult, …>` annotation is the compile-time half: if a field is added to
 * the interface and not here (or vice versa), this file stops typechecking.
 */
const distributionResultSchema: z.ZodType<DistributionResult, z.ZodTypeDef, unknown> = z
  .object({
    engineVersion: z.string().min(1),
    waqfId: z.string().min(1),
    distributionType: z.enum(['MONETARY', 'NA_DIRECT_USE']),
    classification: z.enum(WAQF_CLASSIFICATIONS),
    waqfType: z.enum(WAQF_TYPES),
    entitlementOrder: z.enum(ENTITLEMENT_ORDERS),
    entitlementRule: z.enum(ENTITLEMENT_RULES),
    period: z.object({ start: civilDateSchema, end: civilDateSchema }).strict(),
    waterfall: waterfallSchema,
    lines: z.array(lineSchema),
    totals: totalsSchema,
    timing: timingSchema,
    authorityNotices: z.array(authorityNoticeSchema),
    flags: z.array(z.enum(RUN_FLAGS)),
    computationTrace: z.array(traceEntrySchema),
    invariantsChecked: z.array(z.enum(INVARIANT_IDS)),
    unverifiedNotes: z.array(z.string().min(1)),
  })
  .strict();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Invented input builders — nothing here comes from a real family (CLAUDE.md hard constraint)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const AS_OF = dual('2026-07-14');

/** The S3 brief's verified deadline pair: `1448-10-22` is `2027-03-30`, one day before 2027-03-31. */
function deadline(): DistributionInputRaw['deadline'] {
  return {
    gregorian: '2027-03-31',
    hijri: '1448-10-22',
    settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
    months: 3,
    unverified: true,
  };
}

function policy(): DistributionInputRaw['policy'] {
  return {
    kycRefreshMonths: 12,
    roundingUnitMinor: 1n,
    roundingMethod: 'LARGEST_REMAINDER_HALF_UP',
    bindingCalendar: 'EARLIER_OF',
    unverifiedNote: UNVERIFIED_NOTE,
  };
}

interface BeneficiaryPatch {
  readonly id: string;
  readonly tabaqa?: number | null;
  /** ADR-0009 · the lineage edge. Defaults below make an unadorned patch a child of the waqif. */
  readonly parentId?: string | null;
  readonly lineageLink?: string | null;
  readonly line?: BeneficiaryInput['line'];
  readonly branch?: string | null;
  readonly kind?: BeneficiaryInput['kind'];
  readonly active?: boolean;
  readonly stipulatedWeight?: string;
  readonly verificationStatus?: BeneficiaryInput['verificationStatus'];
  readonly kycLastRefreshed?: string | null;
  readonly category?: string | null;
  readonly residency?: BeneficiaryInput['residency'];
  readonly disbursingEntity?: DistributionInputRaw['beneficiaries'][number]['disbursingEntity'];
  readonly bankingRefForProceeds?: string | null;
}

function beneficiary(patch: BeneficiaryPatch): DistributionInputRaw['beneficiaries'][number] {
  return {
    id: patch.id,
    kind: patch.kind ?? 'FAMILY',
    active: patch.active ?? true,
    tabaqa: patch.tabaqa === undefined ? 1 : patch.tabaqa,
    // ⚠ **IN the lineage graph by DEFAULT, and the default is READ OFF `line`.**
    //
    // This block previously did the opposite — `lineageLink: null` for everyone — on the reading that
    // `buildLineage` required the edge only under `LINEAGE_CONTINUATION`. **R6 killed that reading**
    // (product owner, 2026-08-03, ADR-0009 open question 10): a `FAMILY`/`CATEGORY_ONLY` member with
    // no `lineageLink` now halts `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` on EVERY
    // `entitlementOrder`, so the old default made every ORDERED and SHARED example in this file an
    // input the engine refuses — the whole suite failed to even collect.
    //
    // The default is derived from `line` rather than fixed, because the two are the same fact recorded
    // twice: a ẓuhūr member descends through sons and a buṭūn member through a daughter, and a fixture
    // that said `line: 'BUTUN'` while recording `lineageLink: 'SON'` would be a self-contradicting
    // record that happens to typecheck. `line: 'NA'` (a charitable jiha) and `kind:
    // 'CHARITABLE_JIHA'` both yield `null`: a charity is not a descendant of the waqif and carrying
    // either field is refused `LINEAGE_EDGE_ON_NON_DESCENDANT`.
    //
    // ⚠ **`parentId` still defaults to `null`, which is the VALUE "a child of the waqif" (depth 1) —
    // never "unknown".** So any call site setting `tabaqa: 2` or deeper MUST also pass `parentId`, or
    // the run halts `TABAQA_MISMATCHES_LINEAGE_DEPTH` — the cross-check firing correctly on a record
    // that declares a tier it cannot reach. That is not a defect to work around; it is the derived
    // depth and the declared ṭabaqa each testing the other.
    parentId: patch.parentId === undefined ? null : patch.parentId,
    lineageLink:
      patch.lineageLink !== undefined
        ? patch.lineageLink
        : (patch.kind ?? 'FAMILY') === 'CHARITABLE_JIHA' || (patch.line ?? 'ZUHUR') === 'NA'
          ? null
          : (patch.line ?? 'ZUHUR') === 'BUTUN'
            ? 'DAUGHTER'
            : 'SON',
    line: patch.line ?? 'ZUHUR',
    branch: patch.branch === undefined ? 'Branch A' : patch.branch,
    stipulatedWeight: patch.stipulatedWeight ?? '12.5',
    verificationStatus: patch.verificationStatus ?? 'VERIFIED',
    kycLastRefreshed: patch.kycLastRefreshed === undefined ? '2026-01-15' : patch.kycLastRefreshed,
    category: patch.category === undefined ? null : patch.category,
    residency: patch.residency ?? 'DOMESTIC',
    disbursingEntity: patch.disbursingEntity ?? null,
    bankingRefForProceeds:
      patch.bankingRefForProceeds === undefined
        ? `FAKE-ACCT-${patch.id}`
        : patch.bankingRefForProceeds,
  };
}

/**
 * Worked example A — ORDERED, medium family-dhurri waqf, three invented beneficiaries.
 *
 * revenue 350,000.00 · ṣiyāna FIXED 40,000.00 · operating 0 · Nazir fee 10% of revenue
 * ⇒ net income 310,000.00, fee 35,000.00, distributable 275,000.00.
 * ⚠ the 10% ʿushr rate and the 3-month window are unverified — confirm vs primary law.
 */
function exampleA(): DistributionInputRaw {
  return {
    waqfId: 'waqf-001',
    classification: 'MEDIUM',
    waqfType: 'FAMILY_DHURRI',
    entitlementOrder: 'ORDERED',
    continuationStipulation: null,
    // R7 · no مآل clause on the baseline example. Every reversion case below overrides it explicitly,
    // so a case that forgets to is testing the pre-R7 shape and says so by its own value.
    reversion: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    fiscalYearEnd: '12-31',
    disbursementSchedule: null,
    revenue: {
      incomeMinor: 35_000_000n,
      receipts: [
        {
          id: 'rev-001',
          receiptClass: 'INCOME',
          amountMinor: 35_000_000n,
          capitalSource: null,
        },
      ],
    },
    operatingCostMinor: 0n,
    maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
    beneficiaries: [
      beneficiary({ id: 'ben-001', tabaqa: 1, line: 'ZUHUR', branch: 'Branch A' }),
      // R6: ben-002's ṭabaqa 2 must now be REACHED through a recorded edge — it is ben-001's son.
      // The ORDERED verdicts are unchanged by that (the tier test still keys on `tabaqa`), which is
      // the point: the edge is a fact about the person, not a change to al-aʿlā fa-l-aʿlā.
      beneficiary({
        id: 'ben-002',
        tabaqa: 2,
        parentId: 'ben-001',
        line: 'ZUHUR',
        branch: 'Branch A',
      }),
      beneficiary({
        id: 'ben-003',
        tabaqa: 1,
        line: 'BUTUN',
        branch: 'Branch B',
        verificationStatus: 'PENDING',
        kycLastRefreshed: null,
      }),
    ],
    asOf: { gregorian: AS_OF.gregorian, hijri: AS_OF.hijri },
    deadline: deadline(),
    policy: policy(),
  };
}

/** Worked example F — SHARED, three equal weights, distributable 100.00, deed silent on the fee. */
function exampleF(): DistributionInputRaw {
  return {
    ...exampleA(),
    waqfId: 'waqf-fixture-residual',
    classification: 'SMALL',
    entitlementOrder: 'SHARED',
    revenue: {
      incomeMinor: 10_000n,
      receipts: [
        { id: 'rev-f', receiptClass: 'INCOME', amountMinor: 10_000n, capitalSource: null },
      ],
    },
    maintenance: { kind: 'NONE' },
    nazirFee: null,
    beneficiaries: [
      beneficiary({ id: 'ben-a', stipulatedWeight: '1' }),
      beneficiary({ id: 'ben-b', stipulatedWeight: '1' }),
      beneficiary({ id: 'ben-c', stipulatedWeight: '1' }),
    ],
  };
}

/**
 * §08's Example D verbatim — a JOINT waqf, and therefore a **REFUSED INPUT** (ADR-0009 R5).
 *
 * Kept so the refusal has its original subject: this exact cohort (a licensed charitable jiha plus two
 * family branches, one cross-border) used to compute and split 40/30/30, and must never do so again.
 * A waqf is either خيري or ذري, never both.
 */
function exampleDJoint(): DistributionInputRaw {
  return {
    ...exampleA(),
    waqfId: 'waqf-003',
    classification: 'LARGE',
    waqfType: 'JOINT',
    entitlementOrder: 'SHARED',
    revenue: {
      incomeMinor: 180_000_000n,
      receipts: [
        { id: 'rev-002', receiptClass: 'INCOME', amountMinor: 180_000_000n, capitalSource: null },
        {
          id: 'cap-001',
          receiptClass: 'CAPITAL',
          amountMinor: 2_000_000_000n,
          capitalSource: 'ISTIBDAL_PROCEEDS',
        },
      ],
    },
    operatingCostMinor: 12_000_000n,
    maintenance: { kind: 'FIXED', amountMinor: 10_000_000n },
    beneficiaries: [
      beneficiary({
        id: 'ben-006',
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        line: 'NA',
        branch: 'Charitable',
        stipulatedWeight: '40',
        kycLastRefreshed: '2026-03-05',
        disbursingEntity: { name: 'Invented Jiha', licensed: true, licenceExpiry: '2027-06-30' },
      }),
      beneficiary({
        id: 'ben-007',
        tabaqa: 1,
        line: 'ZUHUR',
        branch: 'Branch A',
        stipulatedWeight: '30',
        kycLastRefreshed: '2026-04-01',
      }),
      beneficiary({
        id: 'ben-008',
        tabaqa: 1,
        line: 'BUTUN',
        branch: 'Branch B',
        stipulatedWeight: '30',
        kycLastRefreshed: '2026-04-01',
        residency: 'CROSS_BORDER',
      }),
    ],
  };
}

/**
 * Example D's money, gates and corpus receipt, re-homed onto a legal `PUBLIC_CHARITABLE` waqf.
 *
 * Three charitable jihas at the same 40/30/30 deed weights, one of them cross-border. Deed weights
 * still govern a charitable allocation (R3 exempts only a *lineage* cohort), so the whole waterfall and
 * split are Example D's unchanged — 140,000,000 halalas split 56/42/42 — and every test that used
 * Example D as its subject keeps the same figures.
 */
function exampleDCharitable(): DistributionInputRaw {
  const joint = exampleDJoint();
  return {
    ...joint,
    waqfType: 'PUBLIC_CHARITABLE',
    beneficiaries: [
      beneficiary({
        id: 'ben-006',
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        line: 'NA',
        branch: 'Charitable',
        stipulatedWeight: '40',
        kycLastRefreshed: '2026-03-05',
        disbursingEntity: { name: 'Invented Jiha', licensed: true, licenceExpiry: '2027-06-30' },
      }),
      beneficiary({
        id: 'ben-306',
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        line: 'NA',
        branch: 'Charitable',
        stipulatedWeight: '30',
        kycLastRefreshed: '2026-04-01',
      }),
      beneficiary({
        id: 'ben-307',
        kind: 'CHARITABLE_JIHA',
        tabaqa: null,
        line: 'NA',
        branch: 'Charitable',
        stipulatedWeight: '30',
        kycLastRefreshed: '2026-04-01',
        residency: 'CROSS_BORDER',
      }),
    ],
  };
}

/**
 * A LINEAGE_CONTINUATION run — ADR-0009's normal deed shape — over a small three-generation tree.
 *
 * ẓuhūr wa buṭūn, `ZUHUR_ONLY`. Same money as Example A (distributable 27,500,000n), so the per-capita
 * arithmetic below is checkable by hand.
 *
 * ⚠ **REBUILT FOR R-FRONTIER (product owner, 2026-08-03), not patched.** The old tree had ben-201
 * ALIVE with ben-204 as his son and expected both to be paid. Under the owner's correction —
 * *"son A's child does not get since Son A is alive"* — that is now wrong: a living ancestor HOLDS
 * the entitlement, so ben-204 would be excluded `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` and the cohort
 * would collapse to two heads with no residual, which is the one thing this fixture exists to
 * produce. The tree is therefore built from the frontier rule outwards:
 *
 *   waqif
 *   ├── ben-201  SON       ṭ1  ✝ DECEASED          ← excluded on his OWN status, BENEFICIARY_INACTIVE
 *   │   ├── ben-204  SON       ṭ2  living  ✓       ← entitled BECAUSE a generation died above him
 *   │   └── ben-205  DAUGHTER  ṭ2  living  ✓       ← entitled too: her OWN link is never read
 *   ├── ben-202  DAUGHTER  ṭ1  living  ✓           ← a daughter of the waqif, entitled in her own right
 *   │   └── ben-206  SON       ṭ2  living  ✗       ← BUTUN_LINE_NOT_CONTINUED (ancestor ben-202)
 *
 * Eligible = {ben-202, ben-204, ben-205}: three heads. Effective weights are all `'1'` (per capita),
 * Σw = 3, so floor_i = 27_500_000 / 3 = 9_166_666n each (Σ 27_499_998n), all three remainders tie, and
 * the residual 2n goes to the two lowest ELIGIBLE ids — ben-202 and ben-204.
 *
 * Three records, three different wrong implementations killed: **ben-204** (a dead ancestor must be
 * walked THROUGH, not treated as a broken chain), **ben-205** (a line may end in a daughter — reading
 * `beneficiary.lineageLink` instead of the ancestors' excludes her), **ben-206** (the ẓuhūr filter
 * reads the ANCESTOR's link, and it is not a tier test).
 */
function exampleLineage(): DistributionInputRaw {
  return {
    ...exampleA(),
    waqfId: 'waqf-005',
    entitlementOrder: 'LINEAGE_CONTINUATION',
    continuationStipulation: 'ZUHUR_ONLY',
    beneficiaries: [
      beneficiary({
        id: 'ben-201',
        tabaqa: 1,
        lineageLink: 'SON',
        active: false,
        stipulatedWeight: '30',
      }),
      beneficiary({
        id: 'ben-202',
        tabaqa: 1,
        lineageLink: 'DAUGHTER',
        line: 'BUTUN',
        branch: 'Branch B',
        stipulatedWeight: '20',
      }),
      beneficiary({
        id: 'ben-204',
        tabaqa: 2,
        parentId: 'ben-201',
        lineageLink: 'SON',
        stipulatedWeight: '10',
      }),
      beneficiary({
        id: 'ben-205',
        tabaqa: 2,
        parentId: 'ben-201',
        lineageLink: 'DAUGHTER',
        line: 'BUTUN',
        stipulatedWeight: '5',
      }),
      beneficiary({
        id: 'ben-206',
        tabaqa: 2,
        parentId: 'ben-202',
        lineageLink: 'SON',
        stipulatedWeight: '10',
      }),
    ],
  };
}

/** Worked example C2 — a direct-utilization waqf that nonetheless had period revenue. */
function exampleC2(): DistributionInputRaw {
  return {
    ...exampleA(),
    waqfId: 'waqf-004',
    classification: 'SMALL',
    entitlementOrder: 'NA_DIRECT_USE',
    revenue: {
      incomeMinor: 10_000_000n,
      receipts: [
        { id: 'rev-c2', receiptClass: 'INCOME', amountMinor: 10_000_000n, capitalSource: null },
      ],
    },
    maintenance: { kind: 'NONE' },
    nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
  };
}

/**
 * Assert a refusal and RETURN it, so the caller can also pin `details.refusal`.
 *
 * Returning the error is an ADR-0009 change: twenty-six distinct refusals now share the
 * `SHART_INCOMPLETE` code, so a code-only assertion can pass against a refusal the test was not about
 * — which is exactly how the joint-waqf change would have silently invalidated the tiered-jiha suite.
 */
/** One line by id, or a failing assertion naming what the run actually emitted. */
function lineFor(result: DistributionResult, id: string): DistributionResult['lines'][number] {
  const found = result.lines.find((line) => line.beneficiaryId === id);
  if (found === undefined) {
    throw new Error(
      `no line for "${id}"; emitted ids were [${result.lines
        .map((line) => line.beneficiaryId)
        .join(', ')}]`,
    );
  }
  return found;
}

/** The exclusion/gate reason on one line. `null` means entitled and payable. */
function reasonFor(result: DistributionResult, id: string): string | null {
  return lineFor(result, id).reasonCode;
}

function expectDomainCode(run: () => unknown, code: string): DomainError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  if (!isDomainError(thrown)) {
    throw new Error(
      `expected a DomainError with code ${code}; received ${String(thrown)} (${typeof thrown})`,
    );
  }
  expect(thrown.code).toBe(code);
  return thrown;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The happy path, end to end
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('runDistribution — the happy path (ORDERED, worked example A)', () => {
  const result = runDistribution(exampleA());

  it('computes the waterfall in the fixed regulatory order: ṣiyāna → operating → Nazir fee', () => {
    expect(result.waterfall).toStrictEqual({
      revenueMinor: 35_000_000n,
      capitalReceiptsMinor: 0n,
      maintenanceReserveMinor: 4_000_000n,
      operatingCostMinor: 0n,
      netIncomeMinor: 31_000_000n,
      nazirFeeMinor: 3_500_000n,
      nazirFeeBasis: 'PERCENT_OF_REVENUE',
      distributableMinor: 27_500_000n,
    });
  });

  it('applies the ʿushr rate as a percentage OUT OF 100 — 10% of revenue, not 0.1%', () => {
    // The single highest-consequence arithmetic defect in §08 (its `Percent01` sketch would have
    // produced 35,000.00 halalas — a 100× underpayment — while every conservation check still held).
    expect(result.waterfall.nazirFeeMinor).toBe(3_500_000n);
    expect(result.waterfall.nazirFeeMinor).not.toBe(35_000n);
  });

  it('splits distributable over the entitled ṭabaqa only, and excludes the upper tier', () => {
    expect(
      result.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-001', 'PAID', 13_750_000n],
      ['ben-002', 'EXCLUDED', 0n],
      ['ben-003', 'WITHHELD', 13_750_000n],
    ]);
    // The check that catches an "exclusion" implemented by zeroing the amount while leaving the
    // weight in the divisor: ben-002's 12.5 is OUT of the denominator, so the other two get 50%
    // each and not 33.33%.
    expect(result.lines.map((line) => line.sharePercent)).toEqual([
      '50.000000',
      '0.000000',
      '50.000000',
    ]);
  });

  it('records the entitlement basis and the reason on every line (BR-505)', () => {
    const excluded = result.lines.find((line) => line.beneficiaryId === 'ben-002');
    expect(excluded?.reasonCode).toBe('UPPER_TABAQA_EXTANT');
    expect(excluded?.gateFlags).toEqual([]);
    expect(excluded?.basis).toStrictEqual({
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'ORDERED_LOWEST_LIVING_TABAQA',
      // ⚠ **RE-POINTED BY R6, and the change is the substance.** These four fields used to be all
      // null here, because this fixture's members were out of the lineage graph. Under R6 they cannot
      // be: a `FAMILY` member with no `lineageLink` halts on EVERY order, so an `ORDERED` line now
      // carries the derived descent facts too — and that is what BR-505 is for. `lineageDepth: 2`
      // is DERIVED from `parentId: 'ben-001'` and independently agrees with the declared `tabaqa: 2`
      // above (`buildLineage` refuses a disagreement rather than preferring a side).
      //
      // `continuationStipulation` stays null and MUST: `ORDERED` consumes no continuation term, so a
      // value here would be the statement telling this beneficiary their line was tested for
      // continuation when it was not. `toStrictEqual` asserts the statement's basis block whole, so a
      // field appearing with a stale or invented value fails rather than being ignored.
      lineageDepth: 2,
      parentId: 'ben-001',
      lineageLink: 'SON',
      continuationStipulation: null,
    });

    const withheld = result.lines.find((line) => line.beneficiaryId === 'ben-003');
    expect(withheld?.reasonCode).toBe('KYC_UNVERIFIED');
    expect(withheld?.gateFlags).toEqual(['KYC_UNVERIFIED']);
  });

  it('rolls the lines up into balanced totals', () => {
    expect(result.totals).toStrictEqual({
      paidMinor: 13_750_000n,
      withheldMinor: 13_750_000n,
      crossBorderMinor: 0n,
      retainedMinor: 0n,
      entitledMinor: 27_500_000n,
      excludedCount: 1,
      entitledLineCount: 2,
      residualMinor: 0n,
    });
  });

  it('reports BOTH deadlines and which one bound (S3 decision D2)', () => {
    expect(result.timing).toStrictEqual({
      status: 'ON_TIME',
      basis: 'POST_FYE_DEFAULT',
      deadlineGregorian: '2027-03-31',
      deadlineHijri: '1448-10-22',
      hijriDeadlineAsGregorian: '2027-03-30',
      bindingCalendar: 'EARLIER_OF',
      boundBy: 'HIJRI',
      bindingDeadlineGregorian: '2027-03-30',
      daysUntilDeadline: 259,
      asOf: { gregorian: '2026-07-14', hijri: '1448-01-29' },
      settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
      months: 3,
      unverifiedNote: UNVERIFIED_NOTE,
    });
  });

  it('carries the ⚠ unverified marker into the run instead of asserting it in prose', () => {
    expect(result.unverifiedNotes).toEqual([UNVERIFIED_NOTE]);
    expect(result.flags).toContain('UNVERIFIED_FIGURES_APPLIED');
  });

  it('still flags unverified figures when the DEADLINE window itself has been confirmed', () => {
    // `policy` is assembled entirely from Settings registered in `UNVERIFIED_FIGURE_KEYS`
    // (kyc.refreshIntervalMonths, distribution.rounding.method,
    // distribution.deadline.bindingCalendar), so the run applied a stale figure even with a
    // confirmed window. Under-reporting staleness is the direction that matters (binding rule 3).
    const confirmedWindow = runDistribution({
      ...exampleA(),
      deadline: { ...deadline(), unverified: false },
    });
    // The narrower field goes null — the WINDOW is confirmed…
    expect(confirmedWindow.timing.unverifiedNote).toBeNull();
    // …while the run-level caveat stays, because other applied figures are not.
    expect(confirmedWindow.unverifiedNotes).toEqual([UNVERIFIED_NOTE]);
    expect(confirmedWindow.flags).toContain('UNVERIFIED_FIGURES_APPLIED');
  });

  it('reports both ⚠ markers when the caller carries a different one from the window', () => {
    // `packages/domain` currently holds TWO different ⚠ strings (settings.ts's and
    // dates/deadline.ts's). The engine reports both rather than picking one.
    const twoMarkers = runDistribution({
      ...exampleA(),
      policy: { ...policy(), unverifiedNote: 'a different ⚠ marker' },
    });
    expect(twoMarkers.unverifiedNotes).toEqual(['a different ⚠ marker']);
    expect(twoMarkers.timing.unverifiedNote).toBe('a different ⚠ marker');
  });

  it('pins the engine version, the mode and the rule that decided entitlement', () => {
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.distributionType).toBe('MONETARY');
    expect(result.entitlementOrder).toBe('ORDERED');
    expect(result.entitlementRule).toBe('ORDERED_LOWEST_LIVING_TABAQA');
    expect(result.classification).toBe('MEDIUM');
    expect(result.waqfType).toBe('FAMILY_DHURRI');
    expect(result.period).toStrictEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('queues no Authority notice when nothing is cross-border', () => {
    expect(result.authorityNotices).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Output-schema conformance (AT-16)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the result satisfies its own output schema, not merely its construction', () => {
  const cases: ReadonlyArray<readonly [string, DistributionInputRaw]> = [
    ['ORDERED, worked example A', exampleA()],
    ['SHARED with a residual, worked example F', exampleF()],
    ['PUBLIC_CHARITABLE with a capital receipt, worked example D-خ', exampleDCharitable()],
    ['direct use WITH revenue, worked example C2', exampleC2()],
  ];

  for (const [label, input] of cases) {
    it(`parses against the independent DistributionResult schema — ${label}`, () => {
      const parsed = distributionResultSchema.safeParse(runDistribution(input));
      expect(
        parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.')),
      ).toEqual([]);
      expect(parsed.success).toBe(true);
    });
  }

  it('has no optional/undefined field anywhere — every absent value is an explicit null', () => {
    const result = runDistribution(exampleA());
    const undefinedPaths: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (value === undefined) {
        undefinedPaths.push(path);
        return;
      }
      if (value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach((element, index) => walk(element, `${path}[${String(index)}]`));
        return;
      }
      for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
        walk(member, `${path}.${key}`);
      }
    };
    walk(result, 'result');
    // `TraceStep.data` is the one legitimately optional field, and it is OMITTED rather than set to
    // undefined — so an absent key never appears here.
    expect(undefinedPaths).toEqual([]);
  });

  it('orders lines by ascending beneficiaryId, one per input beneficiary', () => {
    const input = exampleA();
    const result = runDistribution(input);
    expect(result.lines).toHaveLength(input.beneficiaries.length);
    const ids = result.lines.map((line) => line.beneficiaryId);
    expect(ids).toEqual([...ids].sort());
  });

  it('freezes every container it returns — a signed run must not be mutable downstream', () => {
    const result = runDistribution(exampleA());
    const containers: ReadonlyArray<readonly [string, object]> = [
      ['result', result],
      ['period', result.period],
      ['waterfall', result.waterfall],
      ['totals', result.totals],
      ['timing', result.timing],
      ['timing.asOf', result.timing.asOf],
      ['lines', result.lines],
      ['authorityNotices', result.authorityNotices],
      ['flags', result.flags],
      ['computationTrace', result.computationTrace],
      ['invariantsChecked', result.invariantsChecked],
      ['unverifiedNotes', result.unverifiedNotes],
    ];
    for (const [label, container] of containers) {
      expect(Object.isFrozen(container), `${label} must be frozen`).toBe(true);
    }
    // Trace entries too — they are what the run's hash covers.
    for (const entry of result.computationTrace) expect(Object.isFrozen(entry)).toBe(true);
  });

  it('assertResultShape rejects a mis-ordered or duplicated line set', () => {
    // ⚠ HONESTY NOTE: this pins the GUARD, not the call site. `runDistribution` calls
    // `assertResultShape` on its way out, but `assembleLines` already sorts and
    // `assertInputConsistency` already refuses duplicate ids, so removing the call is not
    // detectable by any test over real inputs. The guard is kept for a caller round-tripping a
    // persisted run years later, which is the case it can actually catch.
    const result = runDistribution(exampleA());
    const reversed = [...result.lines].reverse();
    const duplicated = [result.lines[0], result.lines[0]].filter(
      (line): line is (typeof result.lines)[number] => line !== undefined,
    );
    expect(duplicated).toHaveLength(2);
    expectDomainCode(
      () => assertResultShape({ ...result, lines: reversed }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
    expectDomainCode(
      () => assertResultShape({ ...result, lines: duplicated }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
    expect(assertResultShape(result)).toBe(result);
  });

  it('keeps PII off the hashed surface: ids only, and the input has no name field at all', () => {
    const result = runDistribution(exampleDCharitable());
    // Structural half — a beneficiary record cannot carry a name, so none can reach the trace.
    expect(Object.keys(beneficiaryInputSchema.shape)).not.toContain('name');
    // Behavioural half — no trace datum is keyed like a person, and every id-shaped value is one
    // of the input's own ids.
    const inputIds = new Set([
      ...exampleDCharitable().beneficiaries.map((b) => b.id),
      ...exampleDCharitable().revenue.receipts.map((r) => r.id),
    ]);
    for (const entry of result.computationTrace) {
      for (const key of Object.keys(entry.data ?? {})) {
        expect(key).not.toMatch(/name|fullName|holder/i);
      }
      const beneficiaryId = entry.data?.['beneficiaryId'];
      if (beneficiaryId !== undefined) expect(inputIds.has(beneficiaryId)).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Determinism (I8)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('determinism (I8) — no clock, no randomness, no host-dependent ordering', () => {
  it('two runs of the same input are deep-equal, computationTrace included', () => {
    const first = runDistribution(exampleA());
    const second = runDistribution(exampleA());
    expect(first).toStrictEqual(second);
    expect(first.computationTrace).toStrictEqual(second.computationTrace);
  });

  it('canonicalizeResult is byte-identical over 50 repetitions', () => {
    const reference = canonicalizeResult(runDistribution(exampleDCharitable()));
    for (let index = 0; index < 50; index += 1) {
      expect(canonicalizeResult(runDistribution(exampleDCharitable()))).toBe(reference);
    }
  });

  it('emits flags in canonical RUN_FLAGS order, never in stage-emission order', () => {
    const result = runDistribution({
      ...exampleC2(),
      revenue: { incomeMinor: 0n, receipts: [] },
      nazirFee: null,
    });
    // A direct-use nil run raises four flags from three different stages. The array is the SET
    // rendered in vocabulary order — which is why NIL_DISTRIBUTION precedes NA_DIRECT_USE here even
    // though the engine pushes them the other way round.
    expect(result.flags).toEqual([
      'AUTHORITY_FEE_DETERMINATION_PENDING',
      'NIL_DISTRIBUTION',
      'NA_DIRECT_USE',
      'UNVERIFIED_FIGURES_APPLIED',
    ]);
    const vocabularyOrder = RUN_FLAGS.filter((flag) => result.flags.includes(flag));
    expect(result.flags).toEqual(vocabularyOrder);
  });

  it('numbers the trace 1..N in one unbroken sequence across every stage', () => {
    const result = runDistribution(exampleA());
    expect(result.computationTrace.map((entry) => entry.seq)).toEqual(
      result.computationTrace.map((_entry, index) => index + 1),
    );
    // The stages appear in §08 order, and each stage's steps are contiguous.
    const stagesInOrder = result.computationTrace
      .map((entry) => entry.stage)
      .filter((stage, index, all) => stage !== all[index - 1]);
    expect(stagesInOrder).toEqual([
      'INPUT',
      'WATERFALL',
      'RESOLVER',
      'GATES',
      'TIMING',
      'ALLOCATE',
      'INVARIANTS',
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * `invariantsChecked` is honest
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('invariantsChecked reports what was ACTUALLY asserted', () => {
  it('NEVER claims I8 — determinism is a statement about two runs', () => {
    for (const input of [exampleA(), exampleF(), exampleDCharitable(), exampleC2()]) {
      expect(runDistribution(input).invariantsChecked).not.toContain('I8');
    }
  });

  it('lists nine invariants on a full monetary run', () => {
    expect(runDistribution(exampleA()).invariantsChecked).toEqual([
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
  });

  it('omits I5 and I6 on a nil run, because it emits no line to make a claim about', () => {
    const nil = runDistribution({
      ...exampleA(),
      revenue: { incomeMinor: 0n, receipts: [] },
      maintenance: { kind: 'NONE' },
    });
    expect(nil.lines).toEqual([]);
    expect(nil.invariantsChecked).toEqual(['I1', 'I2', 'I3', 'I4', 'I7', 'I9', 'I-C1']);
  });

  it('omits I6 but keeps I5 when a cohort exists yet nobody is entitled', () => {
    const noneEligible = runDistribution({
      ...exampleA(),
      beneficiaries: [
        beneficiary({ id: 'ben-001', tabaqa: 1, stipulatedWeight: '0' }),
        beneficiary({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', active: false }),
      ],
    });
    expect(noneEligible.totals.entitledLineCount).toBe(0);
    expect(noneEligible.invariantsChecked).toEqual([
      'I1',
      'I2',
      'I3',
      'I4',
      'I5',
      'I7',
      'I9',
      'I-C1',
    ]);
  });

  it('records the NOT-checked ids in the trace, so the omission is explicit rather than inferred', () => {
    const result = runDistribution(exampleA());
    const asserted = result.computationTrace.find((entry) => entry.code === 'INVARIANTS_ASSERTED');
    expect(asserted?.data?.['checked']).toBe(result.invariantsChecked.join(','));
    // I8 is never assertable from one run; I-L1 is a LINEAGE claim and Example A is ORDERED, so the
    // engine reports it as not-checked rather than silently omitting it. That is the point of the
    // notChecked list: an invariant that did not apply is stated, not inferred from an absence.
    //
    // R7 · I-R1 joins them, and for the honest reason: Example A records no مآل clause AND pays no
    // charitable line, so the reversion invariant has nothing to claim about this run. It is STATED as
    // not-checked rather than omitted, so a reader can tell "I-R1 did not apply" from "I-R1 was
    // forgotten" — the same discipline that put I-L1 on this list.
    expect(asserted?.data?.['notChecked']).toBe('I8,I-L1,I-R1');
    // And on a lineage run I-L1 moves to the other side of the line. I-R1 does NOT: this fixture's
    // cohort is a pure bloodline with no clause, so it still claims nothing.
    const lineage = runDistribution(exampleLineage());
    const lineageStep = lineage.computationTrace.find(
      (entry) => entry.code === 'INVARIANTS_ASSERTED',
    );
    expect(lineageStep?.data?.['notChecked']).toBe('I8,I-R1');
    expect(lineage.invariantsChecked).toContain('I-L1');
    expect(lineage.invariantsChecked).not.toContain('I-R1');

    // ⚠ And the case that makes the list meaningful rather than a transcript: on a خيري run that pays
    // charitable lines, I-R1's universal mirror DOES claim something (no charity beside a certified
    // descendant) and it crosses over, while I-L1 stays behind because the order is not lineage.
    const charitable = runDistribution(exampleDCharitable());
    const charitableStep = charitable.computationTrace.find(
      (entry) => entry.code === 'INVARIANTS_ASSERTED',
    );
    expect(charitableStep?.data?.['notChecked']).toBe('I8,I-L1');
    expect(charitable.invariantsChecked).toContain('I-R1');
  });

  it('every reported id is a real INVARIANT_IDS member, in canonical order', () => {
    const checked = runDistribution(exampleDCharitable()).invariantsChecked;
    expect(checked).toEqual(INVARIANT_IDS.filter((id) => checked.includes(id)));
    for (const id of checked) expect(INVARIANT_IDS).toContain(id);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The short-circuits
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('short-circuit · NIL_DISTRIBUTION (AT-07)', () => {
  const result = runDistribution({
    ...exampleA(),
    revenue: { incomeMinor: 0n, receipts: [] },
    maintenance: { kind: 'NONE' },
  });

  it('emits no line at all and zeroes every total (§08 line 405, implemented literally)', () => {
    expect(result.waterfall.distributableMinor).toBe(0n);
    expect(result.lines).toEqual([]);
    expect(result.totals).toStrictEqual({
      paidMinor: 0n,
      withheldMinor: 0n,
      crossBorderMinor: 0n,
      retainedMinor: 0n,
      entitledMinor: 0n,
      excludedCount: 0,
      entitledLineCount: 0,
      residualMinor: 0n,
    });
    expect(result.flags).toContain('NIL_DISTRIBUTION');
  });

  it('still computes and reports the timing block — a nil run is still a filed statement', () => {
    expect(result.timing.status).toBe('ON_TIME');
    expect(result.timing.deadlineGregorian).toBe('2027-03-31');
  });

  it('skips the gates, and says so in the trace rather than silently', () => {
    const skipped = result.computationTrace.find((entry) => entry.code === 'GATES_SKIPPED');
    expect(skipped?.data?.['reason']).toBe('NIL_DISTRIBUTION');
    expect(result.computationTrace.some((entry) => entry.code === 'GATE_OUTCOME')).toBe(false);
  });

  it('discards the entitlement-basis record that the ineligible-cohort branch keeps (SURFACED)', () => {
    // §08 is inconsistent: `lines = []` on zero revenue, but zero *payout* lines on an ineligible
    // cohort. Pinned here so the inconsistency is visible in CI rather than discovered on a
    // statement. See the TODO(surface) in engine.ts.
    expect(result.totals.excludedCount).toBe(0);
    const ineligible = runDistribution({
      ...exampleA(),
      beneficiaries: [beneficiary({ id: 'ben-001', stipulatedWeight: '0' })],
    });
    expect(ineligible.totals.excludedCount).toBe(1);
  });
});

describe('short-circuit · NA_DIRECT_USE (I7)', () => {
  it('with a nil period, reports both flags and no line (worked example C)', () => {
    const result = runDistribution({
      ...exampleC2(),
      revenue: { incomeMinor: 0n, receipts: [] },
      nazirFee: null,
    });
    expect(result.distributionType).toBe('NA_DIRECT_USE');
    expect(result.entitlementRule).toBe('NA_DIRECT_USE');
    expect(result.lines).toEqual([]);
    expect(result.flags).toContain('NA_DIRECT_USE');
    expect(result.flags).toContain('NIL_DISTRIBUTION');
    expect(result.totals.retainedMinor).toBe(0n);
  });

  it('WITH period revenue, the waterfall still computes and the value is RETAINED (DEFECT-1)', () => {
    const result = runDistribution(exampleC2());
    // This is the one case in which §08's I3 as written — paid + withheld + crossBorder ==
    // distributable — is arithmetically FALSE (0 == 9,000,000). The restated I3 holds.
    expect(result.waterfall.distributableMinor).toBe(9_000_000n);
    expect(result.lines).toEqual([]);
    expect(result.totals.retainedMinor).toBe(9_000_000n);
    expect(
      result.totals.paidMinor + result.totals.withheldMinor + result.totals.crossBorderMinor,
    ).toBe(0n);
    expect(
      result.totals.paidMinor +
        result.totals.withheldMinor +
        result.totals.crossBorderMinor +
        result.totals.retainedMinor,
    ).toBe(result.waterfall.distributableMinor);
    expect(result.flags).toContain('NA_DIRECT_USE');
    expect(result.flags).not.toContain('NIL_DISTRIBUTION');
  });

  /**
   * ⚠ **INVERTED BY ADR-0009.** This test used to assert that a direct-use JOINT waqf COMPUTES,
   * because "the direct-use short-circuit runs BEFORE assertJointLegsPresent: no ghallah moves either
   * way, so refusing for a missing charitable leg would block a run whose answer is nothing".
   *
   * That reasoning was about a joint waqf whose SPLIT could not be resolved. R5 is a different claim:
   * the waqf **cannot exist**. So there is nothing for I7 to outrank, and Stage 0 refuses it before the
   * waterfall — deliberately inverting S3's "money wins" asymmetry for this one case. I7 itself is
   * unchanged and still unconditional for runs that happen.
   */
  it('does NOT extend to a JOINT waqf — an impossible endowment is refused before Stage 1', () => {
    try {
      runDistribution({ ...exampleC2(), waqfType: 'JOINT' });
      expect.unreachable('a direct-use JOINT waqf must be refused, not short-circuited');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.code).toBe('SHART_INCOMPLETE');
      expect(error.details).toMatchObject({ refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' });
    }
  });

  /**
   * ⚠ **RE-POINTED — the cohort moved from a وقف ذري to a وقف خيري, and it had to.**
   *
   * This case drove a tiered `CHARITABLE_JIHA` on a `FAMILY_DHURRI` direct-use waqf. That input is now
   * refused at Stage 0 by `CHARITABLE_JIHA_ON_FAMILY_WAQF` (R6-D1) — earlier than the short-circuit —
   * so the test would have gone on "passing" only in the sense that `runDistribution` threw where it
   * once returned, and the claim in its own name (I7 is unconditional) would have been proved by
   * nothing. On a `PUBLIC_CHARITABLE` waqf a jiha is where it belongs, its ṭabaqa is the S3-D3
   * self-contradiction `assertJihaNotTiered` refuses, and the short-circuit is once again the only
   * thing standing between the input and that refusal.
   *
   * The claim it still proves is precedence, in three parts: the direct-use short-circuit runs BEFORE
   * `assertJihaNotTiered` (the tiered jiha is not refused), BEFORE `parseContinuationStipulation` (an
   * unreadable stipulation is not refused) and BEFORE `buildLineage`. All three would halt this input
   * under any monetary order — proven directly below.
   *
   * ⚠⚠ **THE FIRST OF THOSE THREE PARTS IS NOW INVERTED (product owner, 2026-08-03).** A ṭabaqa on a
   * وقف خيري is refused by `TABAQA_ON_CHARITABLE_WAQF` inside `assertSingleWaqfNature`, which — like
   * the JOINT refusal in the test above, and for the identical reason — is a fact about **the waqf's
   * nature** and is checked at Stage 0, BEFORE the short-circuit. MEASURED on the cohort kept verbatim
   * below: it used to compute (`distributionType: 'NA_DIRECT_USE'`, `entitlementRule:
   * 'NA_DIRECT_USE'`, `lines: []`); it now halts. The ṭabaqa and the unreadable stipulation are
   * therefore driven apart, so the two surviving parts of the precedence claim are still proven rather
   * than merely asserted.
   *
   * ⚠ And the control below CANNOT be re-pointed at `JIHA_TIERED` any more: that refusal is
   * unreachable through `runDistribution` on every route (`jiha-tier-refusal.test.ts`
   * §"REACHABILITY"). It names the rule that actually answers this cohort instead.
   */
  it('IS still unconditional for every legal direct-use waqf, whatever its cohort', () => {
    const tieredCohort = [
      beneficiary({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: 2, line: 'NA' }),
    ];

    // ── THE INVERTED PART. Input verbatim; a ṭabaqa on a خيري waqf now outranks I7's short-circuit.
    const tieredOnDirectUse = expectDomainCode(
      () =>
        runDistribution({
          ...exampleC2(),
          waqfType: 'PUBLIC_CHARITABLE',
          continuationStipulation: 'not a stipulation the engine knows',
          beneficiaries: tieredCohort,
        }),
      'SHART_INCOMPLETE',
    );
    expect(tieredOnDirectUse.details).toMatchObject({ refusal: 'TABAQA_ON_CHARITABLE_WAQF' });

    // ── THE SURVIVING PARTS, one field apart: drop the ṭabaqa and the direct-use run computes with
    //    the unreadable stipulation still unread. I7 itself is untouched.
    const cohort = [
      beneficiary({ id: 'ben-006', kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA' }),
    ];
    const result = runDistribution({
      ...exampleC2(),
      waqfType: 'PUBLIC_CHARITABLE',
      continuationStipulation: 'not a stipulation the engine knows',
      beneficiaries: cohort,
    });
    expect(result.distributionType).toBe('NA_DIRECT_USE');
    expect(result.entitlementRule).toBe('NA_DIRECT_USE');
    expect(result.lines).toEqual([]);

    // The control: the SAME tiered cohort under a monetary order halts too. Without this the run
    // above is equally consistent with "the engine never refuses this input at all". MEASURED BEFORE:
    // `JIHA_TIERED`; that refusal now has no reachable route and the winner is named honestly.
    const error = expectDomainCode(
      () =>
        runDistribution({
          ...exampleC2(),
          waqfType: 'PUBLIC_CHARITABLE',
          entitlementOrder: 'SHARED',
          continuationStipulation: null,
          beneficiaries: tieredCohort,
        }),
      'SHART_INCOMPLETE',
    );
    expect(error.details).toMatchObject({ refusal: 'TABAQA_ON_CHARITABLE_WAQF' });
  });

  /**
   * R6's half of the same precedence claim, and a case that could not exist before it.
   *
   * A `FAMILY` member with no `lineageLink` is refused `LINEAGE_LINK_MISSING` on every **monetary**
   * order (product owner, 2026-08-03). A direct-use waqf never builds the graph at all, so the same
   * record resolves to an empty cohort — which is why `BEN_DIRECT_USE_A`/`_B` in the shared fixture
   * module are the only edgeless family records left in the suite and must stay that way.
   */
  it('runs BEFORE buildLineage — an edgeless family cohort short-circuits, and halts on any other order', () => {
    const edgeless = [
      beneficiary({ id: 'ben-101', tabaqa: 1, lineageLink: null }),
      beneficiary({ id: 'ben-102', tabaqa: 2, lineageLink: null }),
    ];
    const result = runDistribution({ ...exampleC2(), beneficiaries: edgeless });
    expect(result.distributionType).toBe('NA_DIRECT_USE');
    expect(result.lines).toEqual([]);

    const error = expectDomainCode(
      () =>
        runDistribution({ ...exampleC2(), entitlementOrder: 'SHARED', beneficiaries: edgeless }),
      'SHART_INCOMPLETE',
    );
    expect(error.details).toMatchObject({
      refusal: 'LINEAGE_LINK_MISSING',
      beneficiaryId: 'ben-101',
    });
  });
});

describe('NO_ELIGIBLE_BENEFICIARIES is a flag, not a short-circuit (AT-06)', () => {
  const result = runDistribution({
    ...exampleA(),
    beneficiaries: [
      beneficiary({ id: 'ben-001', tabaqa: 1, stipulatedWeight: '0' }),
      beneficiary({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', active: false }),
    ],
  });

  it('does not throw, and flags the state', () => {
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
  });

  it('emits the EXCLUDED lines WITH their reason codes, and no payout line', () => {
    expect(result.lines.map((line) => [line.beneficiaryId, line.status, line.reasonCode])).toEqual([
      ['ben-001', 'EXCLUDED', 'ZERO_STIPULATED_WEIGHT'],
      ['ben-002', 'EXCLUDED', 'UPPER_TABAQA_EXTANT'],
    ]);
    expect(result.lines.every((line) => line.entitledMinor === 0n)).toBe(true);
  });

  it('retains the whole distributable — which is the only reason the restated I3 holds', () => {
    expect(result.totals.retainedMinor).toBe(result.waterfall.distributableMinor);
    expect(result.totals.retainedMinor).toBe(27_500_000n);
    expect(result.totals.paidMinor).toBe(0n);
    expect(result.totals.excludedCount).toBe(2);
    expect(result.totals.entitledLineCount).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The refusals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('refusals — no run is emitted at all', () => {
  it('AT-05 · DISTRIBUTION_NEGATIVE when the deductions exceed revenue', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          revenue: {
            incomeMinor: 5_000_000n,
            receipts: [
              { id: 'rev-x', receiptClass: 'INCOME', amountMinor: 5_000_000n, capitalSource: null },
            ],
          },
          maintenance: { kind: 'FIXED', amountMinor: 4_000_000n },
          operatingCostMinor: 1_000_000n,
        }),
      'DISTRIBUTION_NEGATIVE',
    );
  });

  it('AT-05 · a negative net-income base never produces a negative PERCENT_OF_NET_INCOME fee', () => {
    // The net-income check runs BEFORE the fee, so a negative base cannot yield a fee credit that
    // "restores" a plausible-looking distributable.
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          maintenance: { kind: 'FIXED', amountMinor: 40_000_000n },
          nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
        }),
      'DISTRIBUTION_NEGATIVE',
    );
  });

  it('AT-08a · SHART_INCOMPLETE on an unrecognised entitlementOrder', () => {
    expectDomainCode(
      () => runDistribution({ ...exampleA(), entitlementOrder: 'MURATTAB' }),
      'SHART_INCOMPLETE',
    );
    // It arrives as DATA, not as a shape error — which is why the field is `z.string()`.
    expectDomainCode(
      () => runDistribution({ ...exampleA(), entitlementOrder: 'ordered' }),
      'SHART_INCOMPLETE',
    );
    expectDomainCode(
      () => runDistribution({ ...exampleA(), entitlementOrder: ' ORDERED ' }),
      'SHART_INCOMPLETE',
    );
  });

  it('AT-08a · an unreadable Shart halts even when the waterfall would ALSO refuse', () => {
    // The pre-flight narrowing runs before Stage 1, so the operator is told the deed is unreadable
    // rather than being told "insufficient revenue" about figures that were never going to be used.
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          entitlementOrder: 'MURATTAB',
          maintenance: { kind: 'FIXED', amountMinor: 99_000_000n },
        }),
      'SHART_INCOMPLETE',
    );
  });

  /**
   * ⚠ **RE-POINTED BY ADR-0009 — same code, a different and larger reason.**
   *
   * AT-08b used to be "a JOINT waqf MISSING a leg halts". It is now "EVERY joint waqf halts, one leg or
   * two", plus the mixed cohort under any legal type. Asserting the discriminator and not only
   * `SHART_INCOMPLETE` is what stops this test passing on the wrong refusal.
   */
  it('AT-08b · SHART_INCOMPLETE for EVERY JOINT waqf — one leg, two legs, or a direct-use one', () => {
    const joint = exampleDJoint();
    const cases: readonly DistributionInputRaw[] = [
      // Both legs declared — the shape that used to compute.
      joint,
      // One leg only, each way — the shape AT-08b originally covered.
      { ...joint, beneficiaries: joint.beneficiaries.filter((b) => b.kind === 'CHARITABLE_JIHA') },
      { ...joint, beneficiaries: joint.beneficiaries.filter((b) => b.kind === 'FAMILY') },
      // No cohort at all, and a direct-use one: the type alone is enough.
      { ...joint, beneficiaries: [] },
      { ...exampleC2(), waqfType: 'JOINT' },
    ];
    for (const input of cases) {
      const error = expectDomainCode(() => runDistribution(input), 'SHART_INCOMPLETE');
      expect(error.details).toMatchObject({ refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' });
    }
  });

  it('AT-08b · and the RE-ENTRY route: the same mixed cohort under a legal waqfType', () => {
    const joint = exampleDJoint();
    for (const waqfType of ['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const) {
      const error = expectDomainCode(
        () => runDistribution({ ...joint, waqfType }),
        'SHART_INCOMPLETE',
      );
      expect(error.details).toMatchObject({
        refusal: 'COHORT_MIXES_CHARITABLE_AND_FAMILY',
        waqfType,
      });
    }
  });

  it('AT-11 · RECEIPT_UNCLASSIFIED when income is declared with no receipts behind it', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          revenue: { incomeMinor: 35_000_000n, receipts: [] },
        }),
      'RECEIPT_UNCLASSIFIED',
    );
  });

  it('AT-11 · RECEIPT_UNCLASSIFIED on a wrong-case, blank or source-less classification', () => {
    const cases: ReadonlyArray<DistributionInputRaw['revenue']['receipts'][number]> = [
      { id: 'r', receiptClass: 'income', amountMinor: 35_000_000n, capitalSource: null },
      { id: 'r', receiptClass: '', amountMinor: 35_000_000n, capitalSource: null },
      { id: 'r', receiptClass: 'CAPITAL', amountMinor: 35_000_000n, capitalSource: null },
      {
        id: 'r',
        receiptClass: 'INCOME',
        amountMinor: 35_000_000n,
        capitalSource: 'ISTIBDAL_PROCEEDS',
      },
    ];
    for (const receipt of cases) {
      expectDomainCode(
        () =>
          runDistribution({
            ...exampleA(),
            revenue: { incomeMinor: 35_000_000n, receipts: [receipt] },
          }),
        'RECEIPT_UNCLASSIFIED',
      );
    }
  });

  it('AT-11 · CORPUS_NOT_DISTRIBUTABLE when declared income exceeds its INCOME provenance', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          revenue: {
            incomeMinor: 35_000_000n,
            receipts: [
              {
                id: 'rev-001',
                receiptClass: 'INCOME',
                amountMinor: 30_000_000n,
                capitalSource: null,
              },
              {
                id: 'cap-001',
                receiptClass: 'CAPITAL',
                amountMinor: 5_000_000n,
                capitalSource: 'SALE_PROCEEDS',
              },
            ],
          },
        }),
      'CORPUS_NOT_DISTRIBUTABLE',
    );
  });

  it('AT-11 · DISTRIBUTION_INPUT_INVALID when declared income falls SHORT of its receipts', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          revenue: {
            incomeMinor: 30_000_000n,
            receipts: [
              {
                id: 'rev-001',
                receiptClass: 'INCOME',
                amountMinor: 35_000_000n,
                capitalSource: null,
              },
            ],
          },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('AT-14 · DISTRIBUTION_INPUT_INVALID on a mismatched asOf dual date', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          asOf: { gregorian: '2026-07-14', hijri: '1448-01-30' },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('AT-14 · DISTRIBUTION_INPUT_INVALID on a duplicate beneficiaryId', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          beneficiaries: [beneficiary({ id: 'ben-001' }), beneficiary({ id: 'ben-001' })],
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('AT-14 · SETTING_INVALID for a rounding granularity this engine cannot honour', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          policy: { ...policy(), roundingUnitMinor: 5n },
        }),
      'SETTING_INVALID',
    );
  });

  it('AT-14 · SETTING_INVALID for LARGEST_REMAINDER_BANKERS — never a silent fall back to half-up', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          policy: { ...policy(), roundingMethod: 'LARGEST_REMAINDER_BANKERS' },
        }),
      'SETTING_INVALID',
    );
  });

  it('AT-14 · a missing policy figure fails to parse rather than defaulting to 12 months', () => {
    const { kycRefreshMonths: _dropped, ...withoutKyc } = policy();
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          policy: withoutKyc as DistributionInputRaw['policy'],
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });

  it('refuses a period whose start is after its end', () => {
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          period: { start: '2026-12-31', end: '2026-01-01' },
        }),
      'DISTRIBUTION_INPUT_INVALID',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The corpus guard, end to end (I-C1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('corpus (asl / أصل) can move no halala of a distribution (AT-12, I-C1)', () => {
  /** Everything a capital receipt is ALLOWED to change: the corpus figure, the flag, the trace. */
  function comparable(result: DistributionResult): unknown {
    const { waterfall, flags: _flags, computationTrace: _trace, ...rest } = result;
    const { capitalReceiptsMinor: _corpus, ...waterfallRest } = waterfall;
    return { ...rest, waterfall: waterfallRest };
  }

  const withoutCapital = runDistribution(exampleA());
  const withCapital = runDistribution({
    ...exampleA(),
    revenue: {
      incomeMinor: 35_000_000n,
      receipts: [
        { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_000n, capitalSource: null },
        {
          id: 'cap-001',
          receiptClass: 'CAPITAL',
          amountMinor: 2_000_000_000n,
          capitalSource: 'ISTIBDAL_PROCEEDS',
        },
      ],
    },
  });

  it('changes NOTHING except capitalReceiptsMinor and the flag', () => {
    expect(comparable(withCapital)).toStrictEqual(comparable(withoutCapital));
    expect(withoutCapital.waterfall.capitalReceiptsMinor).toBe(0n);
    expect(withCapital.waterfall.capitalReceiptsMinor).toBe(2_000_000_000n);
    expect(withCapital.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(withoutCapital.flags).not.toContain('CAPITAL_RECEIPTS_EXCLUDED');
  });

  it('keeps the Nazir fee on revenue — 10% of ghallah, not 10% of the corpus', () => {
    expect(withCapital.waterfall.nazirFeeMinor).toBe(3_500_000n);
  });

  it('records which receipts were held out, so the exclusion is auditable', () => {
    const excluded = withCapital.computationTrace.find(
      (entry) => entry.code === 'CAPITAL_RECEIPTS_EXCLUDED',
    );
    expect(excluded?.data?.['receiptIds']).toBe('cap-001');
  });

  it('leaves the capital total arithmetically absent from every figure below revenue', () => {
    const { waterfall, totals } = withCapital;
    expect(
      totals.entitledMinor +
        totals.retainedMinor +
        waterfall.maintenanceReserveMinor +
        waterfall.operatingCostMinor +
        waterfall.nazirFeeMinor,
    ).toBe(waterfall.revenueMinor);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The remaining §08 acceptance criteria that are engine-level
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the fee basis and the deduction position are independent', () => {
  it('AT-01 · PERCENT_OF_NET_INCOME computes on net but still deducts at step 3', () => {
    const result = runDistribution({
      ...exampleA(),
      operatingCostMinor: 500_000n,
      maintenance: { kind: 'FIXED', amountMinor: 1_000_000n },
      nazirFee: { basis: 'PERCENT_OF_NET_INCOME', ratePercent: '10' },
    });
    expect(result.waterfall.netIncomeMinor).toBe(33_500_000n);
    expect(result.waterfall.nazirFeeMinor).toBe(3_350_000n);
    expect(result.waterfall.distributableMinor).toBe(30_150_000n);
    expect(result.waterfall.nazirFeeBasis).toBe('PERCENT_OF_NET_INCOME');
  });

  it('AT-02 · a deed silent on the fee yields zero AND the pending flag — never a silent zero', () => {
    const result = runDistribution({ ...exampleA(), nazirFee: null });
    expect(result.waterfall.nazirFeeMinor).toBe(0n);
    expect(result.waterfall.nazirFeeBasis).toBeNull();
    expect(result.flags).toContain('AUTHORITY_FEE_DETERMINATION_PENDING');
    expect(result.waterfall.distributableMinor).toBe(31_000_000n);
  });
});

describe('AT-03 · ORDERED with the top ṭabaqa wholly extinct', () => {
  const result = runDistribution({
    ...exampleA(),
    beneficiaries: [
      beneficiary({ id: 'ben-001', tabaqa: 1, active: false }),
      beneficiary({ id: 'ben-003', tabaqa: 1, active: false, line: 'BUTUN', branch: 'Branch B' }),
      beneficiary({ id: 'ben-002', tabaqa: 2, parentId: 'ben-001', stipulatedWeight: '12.5' }),
    ],
  });

  it('promotes ṭabaqa 2 to the whole distributable', () => {
    const promoted = result.lines.find((line) => line.beneficiaryId === 'ben-002');
    expect(promoted?.status).toBe('PAID');
    expect(promoted?.entitledMinor).toBe(27_500_000n);
    expect(promoted?.sharePercent).toBe('100.000000');
  });

  it('excludes the extinct tier with TABAQA_EXTINCT, not with BENEFICIARY_INACTIVE', () => {
    expect(
      result.lines
        .filter((line) => line.beneficiaryId !== 'ben-002')
        .map((line) => [line.beneficiaryId, line.reasonCode]),
    ).toEqual([
      ['ben-001', 'TABAQA_EXTINCT'],
      ['ben-003', 'TABAQA_EXTINCT'],
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ADR-0009 · the lineage path THROUGH THE ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('LINEAGE_CONTINUATION · the engine wires Stage 2 into the run it emits', () => {
  const result = runDistribution(exampleLineage());

  /**
   * Per capita over the eligible heads, **derived by hand in halalas**.
   *
   * distributable 27_500_000n. Eligible = {ben-202, ben-204, ben-205} — see `exampleLineage`'s tree.
   * Effective weights are all `'1'` (R3), Σw = 3, so
   *
   *     floor_i = 27_500_000 × 1 / 3 = 9_166_666n each   ⇒ Σ floors = 27_499_998n
   *     residual = 27_500_000 − 27_499_998 = 2n
   *
   * all three remainders tie (they are equal by construction — that is what a weight vector of ones
   * buys), so the tie breaks on ascending `beneficiaryId` and the two lowest ELIGIBLE ids take one
   * halala each: ben-202 → 9_166_667n, ben-204 → 9_166_667n, ben-205 → 9_166_666n.
   * Σ = 9_166_667 + 9_166_667 + 9_166_666 = 27_500_000n ✓ (invariant I3).
   *
   * ⚠ **Lowest ELIGIBLE, not lowest id.** ben-201 sorts first of all and is excluded, so an
   * implementation that broke the tie over the full cohort would hand a halala to a dead man.
   */
  it('splits per capita and hands the residual to the two lowest ELIGIBLE ids', () => {
    expect(result.entitlementOrder).toBe('LINEAGE_CONTINUATION');
    expect(result.entitlementRule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');
    expect(result.waterfall.distributableMinor).toBe(27_500_000n);
    expect(
      result.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-201', 'EXCLUDED', 0n],
      ['ben-202', 'PAID', 9_166_667n],
      ['ben-204', 'PAID', 9_166_667n],
      ['ben-205', 'PAID', 9_166_666n],
      ['ben-206', 'EXCLUDED', 0n],
    ]);
    expect(9_166_667n * 2n + 9_166_666n).toBe(27_500_000n);
    expect(result.totals.residualMinor).toBe(2n);
    expect(result.totals.entitledMinor).toBe(27_500_000n);
  });

  /**
   * R-FRONTIER's three exclusions, each with the ancestor that produced it.
   *
   * ⚠ **ben-205 is the record that makes this test worth running.** She is a DAUGHTER, entitled under
   * `ZUHUR_ONLY`, because the filter reads her ANCESTORS' links and never her own — a line may end in
   * a daughter. An implementation that read `beneficiary.lineageLink` would exclude her and still
   * satisfy every other assertion in this block.
   */
  it('excludes the buṭūn line for BUTUN_LINE_NOT_CONTINUED, not for any tier reason', () => {
    const butun = result.lines.find((line) => line.beneficiaryId === 'ben-206');
    expect(butun?.reasonCode).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(butun?.gateFlags).toEqual([]);

    // The dead ancestor is excluded on his OWN vital status — never on a statement about his line.
    const deceased = result.lines.find((line) => line.beneficiaryId === 'ben-201');
    expect(deceased?.reasonCode).toBe('BENEFICIARY_INACTIVE');

    // A daughter at the frontier IS entitled: the ẓuhūr test is about the path, not about her.
    const daughterAtFrontier = result.lines.find((line) => line.beneficiaryId === 'ben-205');
    expect(daughterAtFrontier?.status).toBe('PAID');
    expect(daughterAtFrontier?.reasonCode).toBeNull();
    expect(daughterAtFrontier?.basis.lineageLink).toBe('DAUGHTER');

    // No tier reason may appear on a lineage run at all — the frontier is a property of one LINE.
    expect(result.lines.map((line) => line.reasonCode)).not.toContain('UPPER_TABAQA_EXTANT');
    expect(result.lines.map((line) => line.reasonCode)).not.toContain('TABAQA_EXTINCT');
    expect(result.totals.excludedCount).toBe(2);
  });

  /**
   * The exclusion NAMES the ancestor, and the temporary one REVERSES on that ancestor's death.
   *
   * This is the owner's own sentence, run in both directions: with ben-201 alive his children wait
   * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, blocking ancestor **ben-201**); with him dead — the fixture
   * as built — they are paid. Nothing else about the record changes.
   */
  it('holds a line at its living ancestor, and releases it when that ancestor dies', () => {
    const ancestorAlive = runDistribution({
      ...exampleLineage(),
      beneficiaries: exampleLineage().beneficiaries.map((member) =>
        member.id === 'ben-201' ? { ...member, active: true } : member,
      ),
    });

    expect(
      ancestorAlive.lines.map((line) => [line.beneficiaryId, line.status, line.reasonCode]),
    ).toEqual([
      ['ben-201', 'PAID', null],
      ['ben-202', 'PAID', null],
      ['ben-204', 'EXCLUDED', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'],
      ['ben-205', 'EXCLUDED', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'],
      ['ben-206', 'EXCLUDED', 'BUTUN_LINE_NOT_CONTINUED'],
    ]);
    // Two heads now, and 27_500_000 / 2 = 13_750_000n exactly — residual 0.
    expect(ancestorAlive.lines.map((line) => line.entitledMinor)).toEqual([
      13_750_000n,
      13_750_000n,
      0n,
      0n,
      0n,
    ]);

    // The trace names WHICH ancestor holds the line — the fact a beneficiary would dispute.
    const step = ancestorAlive.computationTrace.find(
      (entry) => entry.code === 'BENEFICIARY_EXCLUDED' && entry.data?.beneficiaryId === 'ben-204',
    );
    expect(step?.data?.blockingAncestorId).toBe('ben-201');
  });

  /**
   * **The load-bearing test for the engine's flag wiring.**
   *
   * `resolveEntitlement` raises the two ADR-0009 flags on its own `flags` array; `runDistribution` has
   * to fold them into `result.flags` alongside the waterfall's and the timing's. Nothing else in the
   * suite would notice if it did not: the trace step would still be there, the amounts would be right,
   * and a Shart figure the engine did not apply would vanish from the run's own summary — which is
   * exactly the class of defect ADR-0009 R3 exists to prevent.
   */
  it('folds Stage 2 flags into result.flags — a recorded-but-unapplied Shart term is VISIBLE', () => {
    expect(result.flags).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    // The ELIGIBLE cohort really does record unequal weights (20 / 10 / 5), so the flag is earned.
    // Filtering on the entitled set and not merely on "not the buṭūn one" matters: ben-201's 30 is
    // outside it (he is dead), so a flag computed over the whole cohort would fire on inputs where
    // per capita overrode nothing.
    const entitled = new Set(
      result.lines.filter((line) => line.status !== 'EXCLUDED').map((line) => line.beneficiaryId),
    );
    expect([...entitled].sort()).toEqual(['ben-202', 'ben-204', 'ben-205']);
    const eligibleWeights = exampleLineage()
      .beneficiaries.filter((member) => entitled.has(member.id))
      .map((member) => member.stipulatedWeight);
    expect(new Set(eligibleWeights).size).toBeGreaterThan(1);
    // And it is in canonical RUN_FLAGS order with the rest, not appended out of band.
    expect(result.flags).toEqual(RUN_FLAGS.filter((flag) => result.flags.includes(flag)));

    // The NEGATIVE half: equal weights ⇒ per capita overrode nothing ⇒ no flag.
    const equalWeights = runDistribution({
      ...exampleLineage(),
      beneficiaries: exampleLineage().beneficiaries.map((member) => ({
        ...member,
        stipulatedWeight: '7',
      })),
    });
    expect(equalWeights.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
    // …and the amounts are identical, which is what "the weight was not applied" means.
    expect(equalWeights.lines.map((line) => line.entitledMinor)).toEqual(
      result.lines.map((line) => line.entitledMinor),
    );
  });

  it('folds the CONTINUATION_STIPULATION_NOT_APPLIED flag in too, on an ORDERED deed', () => {
    const ordered = runDistribution({ ...exampleA(), continuationStipulation: 'ZUHUR_AND_BUTUN' });
    expect(ordered.flags).toContain('CONTINUATION_STIPULATION_NOT_APPLIED');
    // Not one halala moved — the flag is the whole difference from Example A.
    expect(ordered.lines.map((line) => line.entitledMinor)).toEqual(
      runDistribution(exampleA()).lines.map((line) => line.entitledMinor),
    );
  });

  it('stamps the derived lineage facts on every line, for the Arabic statement (BR-505)', () => {
    const basisById = new Map(result.lines.map((line) => [line.beneficiaryId, line.basis]));
    expect(basisById.get('ben-201')).toStrictEqual({
      tabaqa: 1,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      lineageDepth: 1,
      parentId: null,
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    });
    expect(basisById.get('ben-204')).toStrictEqual({
      tabaqa: 2,
      line: 'ZUHUR',
      branch: 'Branch A',
      kind: 'FAMILY',
      rule: 'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
      lineageDepth: 2,
      parentId: 'ben-201',
      lineageLink: 'SON',
      continuationStipulation: 'ZUHUR_ONLY',
    });
  });

  it('refuses at Stage 0 before the WATERFALL — the joint refusal outranks the money error', () => {
    // ⚠ This is a DELIBERATE precedence inversion of S3's pinned "money wins" asymmetry, and it is
    // pinned here in the shape that used to give the other answer: a cost far above revenue, which
    // `computeWaterfall` would answer with DISTRIBUTION_NEGATIVE if it ran first.
    const error = expectDomainCode(
      () =>
        runDistribution({
          ...exampleDJoint(),
          maintenance: { kind: 'FIXED', amountMinor: 999_000_000_000n },
        }),
      'SHART_INCOMPLETE',
    );
    expect(error.details).toMatchObject({ refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' });

    // The contrast that makes it a PRECEDENCE claim rather than a coincidence: the same impossible
    // figures on a LEGAL waqf still report the money error, so Stage 1 was not disabled.
    expectDomainCode(
      () =>
        runDistribution({
          ...exampleA(),
          maintenance: { kind: 'FIXED', amountMinor: 999_000_000_000n },
        }),
      'DISTRIBUTION_NEGATIVE',
    );
  });

  it('records the Stage-0 nature check in the trace, so the refusal that did NOT fire is auditable', () => {
    const step = result.computationTrace.find((entry) => entry.code === 'WAQF_NATURE_SINGLE');
    expect(step?.stage).toBe('INPUT');
    expect(step?.data?.waqfType).toBe('FAMILY_DHURRI');
  });
});

describe('AT-04 / worked example F · the Hamilton residual', () => {
  const result = runDistribution(exampleF());

  it('floors, then hands the leftover halala to the largest remainder, tie-break ascending id', () => {
    expect(result.waterfall.distributableMinor).toBe(10_000n);
    expect(result.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-a', 3_334n],
      ['ben-b', 3_333n],
      ['ben-c', 3_333n],
    ]);
    expect(result.totals.residualMinor).toBe(1n);
    expect(result.totals.entitledMinor).toBe(10_000n);
  });

  it('reports sharePercent at 6 dp, which does NOT sum to 100.000000 in general', () => {
    expect(result.lines.map((line) => line.sharePercent)).toEqual([
      '33.340000',
      '33.330000',
      '33.330000',
    ]);
  });

  it('honours the ascending-id tie-break rather than input order', () => {
    const reversed = runDistribution({
      ...exampleF(),
      beneficiaries: [
        beneficiary({ id: 'ben-c', stipulatedWeight: '1' }),
        beneficiary({ id: 'ben-b', stipulatedWeight: '1' }),
        beneficiary({ id: 'ben-a', stipulatedWeight: '1' }),
      ],
    });
    // Same three lines, same amounts — the extra halala follows the id, not the array position.
    expect(reversed.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-a', 3_334n],
      ['ben-b', 3_333n],
      ['ben-c', 3_333n],
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * R7 · مآل الوقف — the reversion END TO END, in halalas
 *
 * One deed, one waterfall, six registers. Every figure below is derived BY HAND in halalas with the
 * arithmetic in the comment, from the chain
 *
 *   revenue 40,000,000 − ṣiyāna PERCENT '10' (4,000,000) − operating 4,500,000
 *                      − ʿushr PERCENT_OF_REVENUE '10' (4,000,000) = **27,500,000 distributable**
 *
 * ⚠ the 10% ʿushr rate is set by THIS DEED (Nazarah Art. 11), not by statute, and is unverified —
 * confirm vs primary law. 27,500,000 is deliberately the same figure R6-D1 and ESC-1 were measured
 * against, so the before/after is directly comparable rather than merely analogous.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('R7 · مآل الوقف end to end — a family endowment reaching its ultimate taker', () => {
  /**
   * The R7 money chain, chosen to exercise a PERCENT ṣiyāna and a non-zero operating cost rather than
   * Example A's FIXED-and-zero, so the distributable is reached by a different route to the same total.
   *
   * I1: 4,000,000 + 4,500,000 + 4,000,000 + 27,500,000 = 40,000,000 ✓
   * net income = 40,000,000 − 4,000,000 − 4,500,000 = 31,500,000; fee = 10% × 40,000,000 = 4,000,000
   * (of REVENUE, not of net income — the deed's basis, and the difference is 3,150,000 halalas).
   */
  function maalWaqf(
    beneficiaries: readonly DistributionInputRaw['beneficiaries'][number][],
    overrides: Partial<DistributionInputRaw> = {},
  ): DistributionInputRaw {
    return {
      ...exampleA(),
      waqfId: 'waqf-maal',
      classification: 'MEDIUM',
      waqfType: 'FAMILY_DHURRI',
      entitlementOrder: 'LINEAGE_CONTINUATION',
      continuationStipulation: 'ZUHUR_ONLY',
      revenue: {
        incomeMinor: 40_000_000n,
        receipts: [{ id: 'rev-maal', receiptClass: 'INCOME', amountMinor: 40_000_000n }],
      },
      maintenance: { kind: 'PERCENT', ratePercent: '10' },
      operatingCostMinor: 4_500_000n,
      nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: '10' },
      beneficiaries: [...beneficiaries],
      reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['jiha-001'] },
      ...overrides,
    };
  }

  const DISTRIBUTABLE = 27_500_000n;

  function jiha(id: string, stipulatedWeight: string) {
    return beneficiary({ id, kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA', stipulatedWeight });
  }

  /** waqif → ben-001 (SON, ṭ1) → ben-002 (SON, ṭ2), each alive or not. */
  function family(aliveOne: boolean, aliveTwo: boolean) {
    return [
      beneficiary({ id: 'ben-001', tabaqa: 1, lineageLink: 'SON', active: aliveOne }),
      beneficiary({
        id: 'ben-002',
        tabaqa: 2,
        parentId: 'ben-001',
        lineageLink: 'SON',
        active: aliveTwo,
      }),
    ];
  }

  it('the waterfall reaches 27,500,000 by the R7 chain — the figure every case below splits', () => {
    const run = runDistribution(maalWaqf([...family(true, true), jiha('jiha-001', '10')]));
    expect(run.waterfall.revenueMinor).toBe(40_000_000n);
    expect(run.waterfall.maintenanceReserveMinor).toBe(4_000_000n); // 10% × 40,000,000
    expect(run.waterfall.operatingCostMinor).toBe(4_500_000n);
    expect(run.waterfall.netIncomeMinor).toBe(31_500_000n); // 40,000,000 − 4,000,000 − 4,500,000
    expect(run.waterfall.nazirFeeMinor).toBe(4_000_000n); // ⚠ ʿushr unverified
    expect(run.waterfall.distributableMinor).toBe(DISTRIBUTABLE);
  });

  /**
   * ⚠ **P1 — THE MEASUREMENT AT THE HEART OF R7, and the strongest thing in this file.**
   *
   * MEASURED on this exact cohort **before amendment D**: the charity was PAID **13,750,000 of
   * 27,500,000 halalas**, halving the living ṭabaqa-1 descendant from 27,500,000 to 13,750,000, with no
   * flag raised and invariant I5 still reported as checked (R6-D1 / ESC-1's payload). Amendment D then
   * refused the input outright. **R7 makes the input LEGAL and computes the charity's share as ZERO.**
   *
   * That is a stronger guarantee than a refusal, because it survives a refusal being relaxed: the
   * default exclusion is in the taker's own verdict ladder, and invariant I-R1 asserts independently
   * that no charity is ever paid a halala in the same run as a certified descendant.
   */
  it('P1 · the family lives ⇒ the descendant takes 27,500,000 and the charity takes ZERO', () => {
    const run = runDistribution(maalWaqf([...family(true, true), jiha('jiha-001', '10')]));

    expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor])).toEqual([
      // ONE head on the living frontier ⇒ 27,500,000 × 1/1 = 27,500,000, residual 0.
      ['ben-001', 'PAID', DISTRIBUTABLE],
      ['ben-002', 'EXCLUDED', 0n],
      ['jiha-001', 'EXCLUDED', 0n],
    ]);
    expect(reasonFor(run, 'ben-002')).toBe('ENTITLEMENT_HELD_BY_LIVING_ANCESTOR');
    expect(reasonFor(run, 'jiha-001')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');

    expect(run.totals.paidMinor).toBe(DISTRIBUTABLE);
    expect(run.totals.retainedMinor).toBe(0n);
    // I2: 27,500,000 + 0 retained = 27,500,000 distributable ✓
    expect(run.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(run.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');

    // I-R1 IS asserted: a charitable line exists, so the mirror has a claim to make about this run —
    // and the claim is precisely that this charity took nothing beside the descendant.
    expect(run.invariantsChecked).toContain('I-R1');
    expect(run.invariantsChecked).toContain('I-L1');
  });

  /**
   * ⚠ **T1 — the same deed, the same clause, two `active` flags flipped.** The whole distributable
   * changes destination on nothing but the register, which is what makes the state change auditable.
   */
  it('T1 · the bloodline is over ⇒ ONE taker at weight 10 takes the whole 27,500,000', () => {
    const run = runDistribution(maalWaqf([...family(false, false), jiha('jiha-001', '10')]));

    // 27,500,000 × 10/10 = 27,500,000, residual 0.
    expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor])).toEqual([
      ['ben-001', 'EXCLUDED', 0n],
      ['ben-002', 'EXCLUDED', 0n],
      ['jiha-001', 'PAID', DISTRIBUTABLE],
    ]);
    expect(reasonFor(run, 'ben-001')).toBe('BENEFICIARY_INACTIVE');
    expect(reasonFor(run, 'ben-002')).toBe('BENEFICIARY_INACTIVE');
    expect(run.totals.retainedMinor).toBe(0n);

    expect(run.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // The taker's BR-505 basis names its OWN rule; the run keeps the deed's standing order rule.
    expect(lineFor(run, 'jiha-001').basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');
    expect(run.entitlementRule).toBe('LINEAGE_PER_CAPITA_ZUHUR_ONLY');

    // ⚠ I-L1 is NOT asserted and I-R1 IS — the swap the design calls for. Per capita is the
    // bloodline's rule, so equality per head makes no claim about the line that took the money;
    // reporting it anyway is the R6-I5 defect.
    expect(run.invariantsChecked).not.toContain('I-L1');
    expect(run.invariantsChecked).toContain('I-R1');
  });

  it('T2 · two takers at 70/30 split the distributable by DEED weight, exactly', () => {
    const run = runDistribution(
      maalWaqf([...family(false, false), jiha('jiha-001', '70'), jiha('jiha-002', '30')], {
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['jiha-001', 'jiha-002'],
        },
      }),
    );
    // 27,500,000 × 70/100 = 19,250,000 exactly; × 30/100 = 8,250,000 exactly.
    // 19,250,000 + 8,250,000 = 27,500,000 ✓ residual 0.
    expect(lineFor(run, 'jiha-001').entitledMinor).toBe(19_250_000n);
    expect(lineFor(run, 'jiha-002').entitledMinor).toBe(8_250_000n);
    expect(run.totals.paidMinor).toBe(DISTRIBUTABLE);
    expect(run.totals.residualMinor).toBe(0n);

    // ⚠ The spread between the two paid lines is 19,250,000 − 8,250,000 = 11,000,000 halalas. I-L1's
    // bound is `max − min <= 1n`, so asserting it here would fail by eleven million: this is the case
    // that proves the I-L1 gate is load-bearing rather than tidy.
    expect(run.invariantsChecked).not.toContain('I-L1');
    // …and no flag claiming the deed's weights went unapplied, because they were the ONLY thing applied.
    expect(run.flags).not.toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
  });

  it('T3 · 1:2 does not divide — the Hamilton residual goes to the LARGER remainder', () => {
    const run = runDistribution(
      maalWaqf([...family(false, false), jiha('jiha-001', '1'), jiha('jiha-002', '2')], {
        reversion: {
          kind: 'CHARITABLE_ULTIMATE_TAKER',
          ultimateTakerIds: ['jiha-001', 'jiha-002'],
        },
      }),
    );
    // Σw = 3. Exact: 27,500,000 × 1/3 = 9,166,666.666…; × 2/3 = 18,333,333.333…
    // Floors: 9,166,666 + 18,333,333 = 27,499,999 ⇒ residual 1.
    // Remainders: .666… > .333…, so the single halala goes to jiha-001 — NOT to the lowest id, which
    // is the tie-break and applies only when the remainders are equal.
    expect(lineFor(run, 'jiha-001').entitledMinor).toBe(9_166_667n);
    expect(lineFor(run, 'jiha-002').entitledMinor).toBe(18_333_333n);
    // 9,166,667 + 18,333,333 = 27,500,000 ✓
    expect(
      (lineFor(run, 'jiha-001').entitledMinor as bigint) +
        (lineFor(run, 'jiha-002').entitledMinor as bigint),
    ).toBe(DISTRIBUTABLE);
    expect(run.totals.residualMinor).toBe(1n);
  });

  /**
   * ⚠ **P2 — INVERTED 2026-08-11 · R7-d ANSWERED, and 27,500,000 halalas changed destination.**
   *
   * Asked whether *"the bloodline is over"* means **no living descendant** or **no continuing line**, the
   * product owner answered the second. Under `ZUHUR_ONLY` a waqif with only daughters has living blood
   * descendants whose line the deed does not carry — the ẓuhūr line is over while the family is not — so
   * the reversion **FIRES** and the deed's مآل takes the whole distributable.
   *
   * MEASURED BEFORE THE ANSWER, on this exact register: all three lines `EXCLUDED` holding `0n`,
   * `paidMinor` 0, `retainedMinor` 27,500,000, flags `NO_ELIGIBLE_BENEFICIARIES` +
   * `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, taker's reason `REVERSION_PENDING_LIVING_BLOODLINE`.
   * Every one of those is now the opposite.
   *
   * ⚠ **What did NOT move, and it is what keeps R5 intact:** `dau-002` is still excluded on the PERMANENT
   * buṭūn code and still holds `0n`. So the charity is paid in a period in which a blood descendant of the
   * waqif is alive, and no descendant is *paid* — which is exactly the distinction I-R1's universal mirror
   * asserts on every run.
   */
  it('P2 · INVERTED · living descendants on a BROKEN line ⇒ 27,500,000 to the مآل — was RETAINED', () => {
    const run = runDistribution(
      maalWaqf([
        // The waqif's daughter, deceased — so the walk goes THROUGH her.
        beneficiary({
          id: 'dau-001',
          tabaqa: 1,
          lineageLink: 'DAUGHTER',
          line: 'BUTUN',
          active: false,
        }),
        // Her living son: a blood descendant of the waqif whose line this deed does not continue.
        beneficiary({ id: 'dau-002', tabaqa: 2, parentId: 'dau-001', lineageLink: 'SON' }),
        jiha('jiha-001', '10'),
      ]),
    );

    // One entitled taker at deed weight '10' ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
    expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor])).toEqual([
      ['dau-001', 'EXCLUDED', 0n],
      ['dau-002', 'EXCLUDED', 0n],
      ['jiha-001', 'PAID', DISTRIBUTABLE],
    ]);
    expect(reasonFor(run, 'dau-002')).toBe('BUTUN_LINE_NOT_CONTINUED');
    expect(reasonFor(run, 'jiha-001')).toBeNull();
    expect(lineFor(run, 'jiha-001').basis.rule).toBe('ULTIMATE_TAKER_MAAL_AL_WAQF');

    // I2 restated: 27,500,000 entitled + 0 retained = 27,500,000 distributable ✓
    expect(run.totals.paidMinor).toBe(DISTRIBUTABLE);
    expect(run.totals.retainedMinor).toBe(0n);
    expect(run.totals.residualMinor).toBe(0n);

    expect(run.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(run.flags).not.toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(run.flags).not.toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(run.invariantsChecked).toContain('I-R1');

    // ⚠ INVERTED · this register used to differ from T1's by ONE `active` flag worth 27,500,000. It no
    // longer differs in destination at all: `dau-002`'s death changes nothing, because his line was
    // already not one the deed continues. Asserted rather than dropped, so the collapse is on the record.
    const bothDead = runDistribution(
      maalWaqf([
        beneficiary({
          id: 'dau-001',
          tabaqa: 1,
          lineageLink: 'DAUGHTER',
          line: 'BUTUN',
          active: false,
        }),
        beneficiary({
          id: 'dau-002',
          tabaqa: 2,
          parentId: 'dau-001',
          lineageLink: 'SON',
          active: false,
        }),
        jiha('jiha-001', '10'),
      ]),
    );
    expect(bothDead.totals.retainedMinor).toBe(0n);
    expect(lineFor(bothDead, 'jiha-001').entitledMinor).toBe(DISTRIBUTABLE);
    expect(bothDead.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // ⚠ THE CONTRAST THAT REPLACES IT · the same three records under `ZUHUR_AND_BUTUN`, where the
    // daughter's line IS carried. `dau-002` becomes the living frontier and takes 27,500,000 × 1/1; the
    // charity waits on the temporary code. One deed term, 27,500,000 halalas, opposite parties — and the
    // only thing deciding it is the founder's condition, which is what a widened trigger must keep reading.
    const continued = runDistribution(
      maalWaqf(
        [
          beneficiary({
            id: 'dau-001',
            tabaqa: 1,
            lineageLink: 'DAUGHTER',
            line: 'BUTUN',
            active: false,
          }),
          beneficiary({ id: 'dau-002', tabaqa: 2, parentId: 'dau-001', lineageLink: 'SON' }),
          jiha('jiha-001', '10'),
        ],
        { continuationStipulation: 'ZUHUR_AND_BUTUN' },
      ),
    );
    expect(lineFor(continued, 'dau-002').entitledMinor).toBe(DISTRIBUTABLE);
    expect(lineFor(continued, 'jiha-001').entitledMinor).toBe(0n);
    expect(reasonFor(continued, 'jiha-001')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    expect(continued.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
  });

  /**
   * ⚠ **BOUNDARY · the widening did NOT make "nobody entitled" a trigger, and this is the end-to-end
   * proof in halalas.**
   *
   * `SHARED`, one LIVING son of the waqif with an EMPTY ancestor chain — his line continues at either
   * continuation term — and a deed weight of `'0'`. He is excluded `ZERO_STIPULATED_WEIGHT`, so the
   * entitled cohort is empty and `paidMinor` is 0. The whole 27,500,000 is **RETAINED**, recoverably, and
   * the charity takes nothing.
   *
   * This is the state P2 used to occupy, reached by a route the widening does not touch. Keeping it is
   * what stops the inversion above from being read as *"an empty cohort hands the pool to the charity"* —
   * and it is the population that keeps `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` from becoming dead
   * code now that its old headline example triggers instead.
   */
  it('P2b · BOUNDARY · a zero-weight living head on a CONTINUING line ⇒ 27,500,000 RETAINED, taker 0', () => {
    const run = runDistribution(
      maalWaqf(
        [
          beneficiary({
            id: 'ben-001',
            tabaqa: 1,
            lineageLink: 'SON',
            active: true,
            stipulatedWeight: '0',
          }),
          jiha('jiha-001', '10'),
        ],
        { entitlementOrder: 'SHARED', continuationStipulation: null },
      ),
    );
    expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor])).toEqual([
      ['ben-001', 'EXCLUDED', 0n],
      ['jiha-001', 'EXCLUDED', 0n],
    ]);
    expect(reasonFor(run, 'ben-001')).toBe('ZERO_STIPULATED_WEIGHT');
    expect(reasonFor(run, 'jiha-001')).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
    // I2 restated: 0 entitled + 27,500,000 retained = 27,500,000 ✓
    expect(run.totals.paidMinor).toBe(0n);
    expect(run.totals.retainedMinor).toBe(DISTRIBUTABLE);
    expect(run.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(run.flags).toContain('REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING');
    expect(run.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(run.invariantsChecked).toContain('I-R1');
  });

  it('Z1 · a clause over an EMPTY family register is REFUSED — ∅ is "not enrolled", not "extinct"', () => {
    const refused = expectDomainCode(
      () => runDistribution(maalWaqf([jiha('jiha-001', '10')])),
      'SHART_INCOMPLETE',
    );
    expect(refused.details).toMatchObject({
      refusal: 'REVERSION_WITH_NO_RECORDED_BLOODLINE',
      recordedBloodlineCount: 0,
    });
  });

  it('refuses an all-zero taker vector rather than inventing an equal split (R7-e)', () => {
    const refused = expectDomainCode(
      () =>
        runDistribution(
          maalWaqf([...family(false, false), jiha('jiha-001', '0'), jiha('jiha-002', '0')], {
            reversion: {
              kind: 'CHARITABLE_ULTIMATE_TAKER',
              ultimateTakerIds: ['jiha-001', 'jiha-002'],
            },
          }),
        ),
      'SHART_INCOMPLETE',
    );
    expect(refused.details).toMatchObject({ refusal: 'ULTIMATE_TAKER_WEIGHTS_UNUSABLE' });
  });

  /**
   * ⚠ **Stage-0 refusal ORDER, end to end. `JOINT` stays first and the مآل clause is narrowed second —
   * before every cohort refusal, so no exemption is ever granted on an unreadable clause.**
   */
  it('orders the Stage-0 refusals: JOINT first, then the clause, then the cohort', () => {
    // A JOINT waqf with an illegible clause AND a mixed cohort: `JOINT` wins.
    expect(
      expectDomainCode(
        () =>
          runDistribution(
            maalWaqf([...family(true, true), jiha('jiha-001', '10')], {
              waqfType: 'JOINT',
              reversion: { kind: 'NOT_A_KIND', ultimateTakerIds: [] },
            }),
          ),
        'SHART_INCOMPLETE',
      ).details,
    ).toMatchObject({ refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED' });

    // …drop the JOINT and the CLAUSE wins over the cohort refusal it would otherwise have exempted.
    expect(
      expectDomainCode(
        () =>
          runDistribution(
            maalWaqf([...family(true, true), jiha('jiha-001', '10')], {
              reversion: { kind: 'NOT_A_KIND', ultimateTakerIds: ['jiha-001'] },
            }),
          ),
        'SHART_INCOMPLETE',
      ).details,
    ).toMatchObject({ refusal: 'REVERSION_KIND_UNRECOGNISED' });

    // …and both outrank a MONEY error. A run on a deed nobody can read is void whatever its figures
    // say, so `DISTRIBUTION_NEGATIVE` must not be what an operator is told to go and fix.
    expect(
      expectDomainCode(
        () =>
          runDistribution(
            maalWaqf([...family(true, true), jiha('jiha-001', '10')], {
              reversion: { kind: 'NOT_A_KIND', ultimateTakerIds: ['jiha-001'] },
              operatingCostMinor: 999_000_000n,
            }),
          ),
        'SHART_INCOMPLETE',
      ).details,
    ).toMatchObject({ refusal: 'REVERSION_KIND_UNRECOGNISED' });
  });

  /**
   * ⚠ **I6 OVER THE NEW PATH: a gate stamps a status, it never moves an amount — and that must hold for
   * the ultimate taker too, on the one run where it is the ONLY payee.**
   *
   * This is the case where a gate failure is most tempting to "handle": the recorded bloodline is over,
   * the charity is the sole entitled line, and its licence has lapsed. Redistributing would mean the
   * engine choosing a new destination for a family endowment's whole ghallah — which is a reading of the
   * deed, not a payment operation. The amount is WITHHELD against the taker's own line and reported as
   * `withheldMinor`; nothing is reassigned and nothing is retained.
   *
   * ⚠ Covered here rather than in `gates.test.ts` on purpose: that file is a pure unit test of `gates.ts`
   * and imports no engine at all, and the claim being made is about the ENGINE's assembly (which total
   * the amount lands in), not about the gate's verdict.
   */
  it('I6 · an UNLICENSED ultimate taker is WITHHELD, and its share goes nowhere else', () => {
    const unlicensed = beneficiary({
      id: 'jiha-001',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      stipulatedWeight: '10',
      disbursingEntity: {
        name: 'Lapsed Ultimate-Taker Jiha (fictional)',
        licensed: false,
        licenceExpiry: '2027-06-30',
      },
    });
    const run = runDistribution(maalWaqf([...family(false, false), unlicensed]));

    expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor])).toEqual([
      ['ben-001', 'EXCLUDED', 0n],
      ['ben-002', 'EXCLUDED', 0n],
      // The ENTITLEMENT is untouched — 27,500,000 × 10/10 — and only the STATUS changed.
      ['jiha-001', 'WITHHELD', DISTRIBUTABLE],
    ]);
    expect(reasonFor(run, 'jiha-001')).toBe('ENTITY_UNLICENSED');
    expect(run.totals.withheldMinor).toBe(DISTRIBUTABLE);
    expect(run.totals.paidMinor).toBe(0n);
    // ⚠ NOT retained: retention is what happens when nobody is ENTITLED. Here the deed's مآل is
    // entitled and merely unpayable, and conflating the two would misreport who the money is owed to.
    expect(run.totals.retainedMinor).toBe(0n);
    // I2 restated: 27,500,000 entitled + 0 retained = 27,500,000 distributable ✓
    expect(run.totals.entitledMinor).toBe(DISTRIBUTABLE);
    // …and the reversion still applied: a payability block is not a reason to un-trigger the clause.
    expect(run.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    expect(run.invariantsChecked).toContain('I6');
    expect(run.invariantsChecked).toContain('I-R1');
  });

  it('a CROSS_BORDER ultimate taker raises the Authority notice, and is not paid domestically', () => {
    // BR-511 / Nazarah Art. 10(7). The taker being a charity changes nothing about the routing rule,
    // and a reverted run is exactly when a large single cross-border transfer becomes likely.
    const crossBorder = beneficiary({
      id: 'jiha-001',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      stipulatedWeight: '10',
      residency: 'CROSS_BORDER',
    });
    const run = runDistribution(maalWaqf([...family(false, false), crossBorder]));

    expect(lineFor(run, 'jiha-001').status).toBe('CROSS_BORDER_PENDING');
    expect(lineFor(run, 'jiha-001').entitledMinor).toBe(DISTRIBUTABLE);
    expect(run.totals.crossBorderMinor).toBe(DISTRIBUTABLE);
    expect(run.totals.paidMinor).toBe(0n);
    expect(run.authorityNotices.map((notice) => notice.beneficiaryId)).toStrictEqual(['jiha-001']);
    // The entitlement is unchanged by the routing, which is I6 again from the other side.
    expect(run.totals.entitledMinor).toBe(DISTRIBUTABLE);
  });

  /**
   * ⚠ **I-R1's flag cross-check, driven through a doctored run.** A flag nothing checks is a comment
   * with a `RUN_FLAGS` entry, so the invariant recomputes the extinction test from `input` and refuses
   * the run when the two disagree — in **both** directions.
   */
  it('I-R1 refuses a run whose reversion FLAG disagrees with its own register', () => {
    const applied = runDistribution(maalWaqf([...family(false, false), jiha('jiha-001', '10')]));
    const pending = runDistribution(maalWaqf([...family(true, true), jiha('jiha-001', '10')]));
    const input = parseDistributionInput(
      maalWaqf([...family(false, false), jiha('jiha-001', '10')]),
    );

    // Direction 1: the run paid a charity and dropped the flag. This is the worse of the two, because
    // a stored run would record the family endowment's end as an ordinary period.
    expect(() =>
      assertReversionIntegrity({
        input,
        distributionType: applied.distributionType,
        order: applied.entitlementOrder,
        waterfall: applied.waterfall,
        lines: applied.lines,
        totals: applied.totals,
        floorsMinor: [],
        entitledIds: [],
        flags: applied.flags.filter((flag) => flag !== 'REVERSION_TO_ULTIMATE_TAKER_APPLIED'),
      }),
    ).toThrowError(/REVERSION_TO_ULTIMATE_TAKER_APPLIED/);

    // Direction 2: the run claims the reversion applied while the family lives. That is the one that
    // would have moved money.
    expect(() =>
      assertReversionIntegrity({
        input: parseDistributionInput(maalWaqf([...family(true, true), jiha('jiha-001', '10')])),
        distributionType: pending.distributionType,
        order: pending.entitlementOrder,
        waterfall: pending.waterfall,
        lines: pending.lines,
        totals: pending.totals,
        floorsMinor: [],
        entitledIds: [],
        flags: [...pending.flags, 'REVERSION_TO_ULTIMATE_TAKER_APPLIED'],
      }),
    ).toThrowError(/recomputing the extinction test/);
  });

  /**
   * ⚠⚠ **I-R1's UNIVERSAL MIRROR, DRIVEN DIRECTLY — and this test exists because MUTATION FOUND ITS
   * ABSENCE.**
   *
   * Disabling the mirror's `if` in `invariants.ts` left **the entire domain suite green** (1,562 tests).
   * That is the definition of an untested guard: it bit under *other* mutations (removing the taker's
   * default exclusion) but nothing drove it in the green state, so a future edit could have deleted the
   * design's self-described *strongest guarantee* with no test objecting.
   *
   * The claim: **a charitable line is never paid a halala in the same run as a line the engine certified
   * as a descendant of the waqif.** That is R5 as a runtime assertion, and its value is that it holds
   * **whatever a future refusal is relaxed to** — it does not depend on `input.reversion` at all.
   *
   * It is driven by doctoring a real run's LINES rather than by finding an input the engine accepts,
   * because no legal input produces this state — which is exactly why the invariant is the last line of
   * defence rather than the first.
   */
  it('I-R1 · the universal mirror refuses a charity paid beside a certified descendant', () => {
    const base = runDistribution(maalWaqf([...family(true, true), jiha('jiha-001', '10')]));

    /*
     * ⚠ `input.reversion` is set to NULL here, and that is the point of the test rather than a
     * convenience. The mirror must hold **independently of the clause** — "whatever a future refusal is
     * relaxed to" — so the subject is the PRE-R7 payload: a ذري cohort in which a charity and a certified
     * descendant are both paid, with no مآل recorded at all. That input is refused at Stage 0
     * (`COHORT_MIXES_CHARITABLE_AND_FAMILY`), which is why the invariant has to be driven directly:
     * `parseDistributionInput` validates the SHAPE and not the cohort, so the context is constructible
     * while the run is not.
     *
     * With a clause present, claim 2 ("a named taker holds nothing while the bloodline is extant") fires
     * first and the mirror would never be reached — asserting that instead would have been this file's
     * own lesson-4 failure: a test green for the wrong reason.
     */
    const input = parseDistributionInput({
      ...maalWaqf([...family(true, true), jiha('jiha-001', '10')]),
      reversion: null,
    });

    // ben-001 is PAID and carries `lineageDepth: 1` — the engine's own certification of descent. Give
    // the charity's line the 13,750,000 the pre-R7 engine actually paid it, and the two are sharing one
    // period's ghallah, which is the exact R6-D1/ESC-1 measurement.
    const shared = base.lines.map((line) =>
      line.beneficiaryId === 'jiha-001'
        ? { ...line, status: 'PAID' as const, entitledMinor: 13_750_000n as Minor }
        : line,
    );
    // The precondition, asserted rather than assumed: without a CERTIFIED descendant on a paid line the
    // mirror correctly says nothing, so a doctored run that failed to include one would pass vacuously.
    const paidDescendant = shared.find(
      (line) => line.beneficiaryId === 'ben-001' && line.basis.lineageDepth !== null,
    );
    expect(paidDescendant?.entitledMinor).toBe(27_500_000n);

    const context = (lines: readonly DistributionResult['lines'][number][]): InvariantContext => ({
      input,
      distributionType: base.distributionType,
      order: base.entitlementOrder,
      waterfall: base.waterfall,
      lines,
      totals: base.totals,
      floorsMinor: [],
      entitledIds: [],
      // No clause and no living-bloodline flag, so claims 1, 2 and 4 all stand aside and the mirror is
      // the only thing that can object.
      flags: base.flags,
    });

    expect(() => assertReversionIntegrity(context(shared))).toThrowError(/never both|خيري/);

    // …and the SAME doctored charitable line with no descendant beside it does NOT breach: the mirror is
    // about SHARING, and over-claiming would make it fire on a legal خيري cohort (the next test).
    expect(() =>
      assertReversionIntegrity(
        context(shared.filter((line) => line.basis.kind === 'CHARITABLE_JIHA')),
      ),
    ).not.toThrow();
  });

  /**
   * ⚠ **THE FALSE POSITIVE THE MIRROR MUST NOT HAVE, and it is a real one that was designed out.**
   *
   * Keyed on `kind !== 'CHARITABLE_JIHA'` instead of on descendant-ness, the mirror would throw
   * `DISTRIBUTION_INVARIANT_BREACH` — the loudest failure this engine has — on the ordinary state of a
   * charitable deed before enrolment: a `CHARITABLE_JIHA` beside a paid `CATEGORY_ONLY` segment ("the poor
   * of the district, not yet individually named"). Both are paid, neither descends from anyone, and
   * nothing about R5 is violated. Driven as a passing run so the narrowing cannot be undone silently.
   */
  it('I-R1 · does NOT fire on a خيري cohort paying a jiha beside an unnamed segment', () => {
    const run = runDistribution({
      ...exampleA(),
      waqfType: 'PUBLIC_CHARITABLE',
      entitlementOrder: 'SHARED',
      continuationStipulation: null,
      reversion: null,
      beneficiaries: [
        beneficiary({
          id: 'jiha-x',
          kind: 'CHARITABLE_JIHA',
          tabaqa: null,
          line: 'NA',
          stipulatedWeight: '10',
        }),
        beneficiary({
          id: 'segment-x',
          kind: 'CATEGORY_ONLY',
          // Edgeless AND untiered: on a خيري waqf a segment descends from nobody (R6-F1) and sits in
          // no generation (`TABAQA_ON_CHARITABLE_WAQF`).
          tabaqa: null,
          parentId: null,
          lineageLink: null,
          line: 'NA',
          category: 'the poor of the district, not yet individually named',
          stipulatedWeight: '10',
        }),
      ],
    });

    // Both PAID: 27,500,000 × 10/20 = 13,750,000 each, Σ 27,500,000, residual 0.
    expect(run.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor])).toEqual([
      ['jiha-x', 'PAID', 13_750_000n],
      ['segment-x', 'PAID', 13_750_000n],
    ]);
    // I-R1 IS asserted — a charitable line exists — and it PASSES, which is the whole claim.
    expect(run.invariantsChecked).toContain('I-R1');
    // …and neither paid line is a certified descendant, which is why nothing is shared.
    for (const line of run.lines) {
      expect(line.basis.lineageDepth, line.beneficiaryId).toBeNull();
      expect(line.basis.lineageLink, line.beneficiaryId).toBeNull();
    }
  });
});

/**
 * ⚠ **RE-HOMED BY ADR-0009, NOT DELETED.** This block was AT-10 on §08's JOINT Example D and is the
 * only place `ENTITY_UNLICENSED`, `CROSS_BORDER_PENDING` + the Authority notice, and the full
 * gate-precedence stack are exercised together. The subject is now the legal `PUBLIC_CHARITABLE`
 * re-homing, whose deed weights and therefore whose halalas are identical.
 */
describe('AT-10 / worked example D-خ · PUBLIC_CHARITABLE, gates, and the Authority notice', () => {
  const result = runDistribution(exampleDCharitable());

  it('splits the deed shares 40/30/30 and never tier-excludes an untiered jiha', () => {
    // Was JOINT_FIXED_DEED_SHARES. That rule is now unreachable — see the unreachability test below.
    expect(result.entitlementRule).toBe('SHARED_ALL_LIVING_TABAQAT');
    expect(result.waterfall.distributableMinor).toBe(140_000_000n);
    expect(
      result.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-006', 'PAID', 56_000_000n],
      ['ben-306', 'PAID', 42_000_000n],
      ['ben-307', 'CROSS_BORDER_PENDING', 42_000_000n],
    ]);
    expect(result.totals.excludedCount).toBe(0);
  });

  it('no legal input produces the JOINT_FIXED_DEED_SHARES rule — unreachability carried by a test', () => {
    for (const input of [
      exampleA(),
      exampleF(),
      exampleC2(),
      exampleDCharitable(),
      exampleLineage(),
    ]) {
      const run = runDistribution(input);
      expect(run.entitlementRule).not.toBe('JOINT_FIXED_DEED_SHARES');
      for (const line of run.lines) expect(line.basis.rule).not.toBe('JOINT_FIXED_DEED_SHARES');
    }
    // And the only inputs that ever carried it emit no run at all.
    expect(() => runDistribution(exampleDJoint())).toThrowError();
  });

  it('routes cross-border rather than blocking it, and queues exactly one notice', () => {
    expect(result.totals.crossBorderMinor).toBe(42_000_000n);
    expect(result.authorityNotices).toHaveLength(1);
    expect(result.authorityNotices[0]?.beneficiaryId).toBe('ben-307');
    expect(result.authorityNotices[0]?.reasonCode).toBe('CROSS_BORDER_PENDING');
  });

  it('withholds an unlicensed jiha WITHOUT reallocating its share (I6)', () => {
    const unlicensed = runDistribution({
      ...exampleDCharitable(),
      beneficiaries: exampleDCharitable().beneficiaries.map((candidate) =>
        candidate.id === 'ben-006'
          ? {
              ...candidate,
              disbursingEntity: { name: 'Invented Jiha', licensed: false, licenceExpiry: null },
            }
          : candidate,
      ),
    });
    const jiha = unlicensed.lines.find((line) => line.beneficiaryId === 'ben-006');
    expect(jiha?.status).toBe('WITHHELD');
    expect(jiha?.reasonCode).toBe('ENTITY_UNLICENSED');
    // The amount is UNCHANGED, and nobody else moved.
    expect(jiha?.entitledMinor).toBe(56_000_000n);
    expect(unlicensed.lines.map((line) => line.entitledMinor)).toEqual(
      result.lines.map((line) => line.entitledMinor),
    );
    expect(unlicensed.totals.paidMinor).toBe(42_000_000n);
    expect(unlicensed.totals.withheldMinor).toBe(56_000_000n);
  });

  /**
   * ⚠ **RE-POINTED ONTO A وقف ذري — and the reason it was re-pointed is now HALF retired.**
   *
   * MEASURED WHEN THIS BLOCK MOVED: the gate stack used to be driven by mutating `ben-307` (a jiha)
   * into a `CATEGORY_ONLY` placeholder with a blank category on the `PUBLIC_CHARITABLE` cohort, and
   * two rules had closed that shape off in both directions — edgeless ⇒ `LINEAGE_LINK_MISSING` (R6
   * demanded the descent fact from a `CATEGORY_ONLY` record on every waqf type), edged ⇒
   * `DESCENDANT_ON_CHARITABLE_WAQF` (ESC-1). That squeeze was R6-F1, and the **edgeless** half is
   * closed: `buildLineage` pass 4 now scopes the `CATEGORY_ONLY` edge requirement to a ذري waqf, so a
   * charitable placeholder is representable again and BR-206's gate has a reachable subject on the one
   * waqf type it exists for. The following test drives exactly that, on the same cohort.
   *
   * This block STAYS on the ذري side regardless, and not out of inertia: the four-gate stack it pins
   * needs a `CATEGORY_ONLY` member carrying a **real ṭabaqa and a real edge**, which is legal only on
   * a family waqf (the "grandchild not yet named" case `assertJihaNotTiered`'s TODO(surface) leaves
   * deliberately permitted). On a خيري waqf that same record is still `DESCENDANT_ON_CHARITABLE_WAQF`.
   * So the two tests now cover the two sides of one line rather than two halves of a closed shape.
   */
  it('reports EVERY tripped gate, with the first in GATE_PRECEDENCE binding', () => {
    const gated = runDistribution({
      ...exampleDJoint(),
      waqfType: 'FAMILY_DHURRI',
      entitlementOrder: 'SHARED',
      beneficiaries: [
        beneficiary({ id: 'ben-007', tabaqa: 1, stipulatedWeight: '40' }),
        beneficiary({
          id: 'ben-008',
          tabaqa: 1,
          line: 'BUTUN',
          branch: 'Branch B',
          stipulatedWeight: '30',
        }),
        beneficiary({
          id: 'ben-009',
          kind: 'CATEGORY_ONLY',
          tabaqa: 1,
          lineageLink: 'SON',
          stipulatedWeight: '30',
          category: null,
          verificationStatus: 'UNVERIFIED',
          kycLastRefreshed: null,
          residency: 'CROSS_BORDER',
          disbursingEntity: { name: 'Invented Agent', licensed: false, licenceExpiry: null },
        }),
      ],
    });
    const line = gated.lines.find((candidate) => candidate.beneficiaryId === 'ben-009');
    expect(line?.status).toBe('WITHHELD');
    expect(line?.reasonCode).toBe('CATEGORY_NOT_CAPTURED');
    expect(line?.gateFlags).toEqual([
      'CATEGORY_NOT_CAPTURED',
      'ENTITY_UNLICENSED',
      'KYC_UNVERIFIED',
      'CROSS_BORDER_PENDING',
    ]);
    // Cross-border was not the binding status, so no Authority notice is filed for a disbursement
    // that is not happening — while the routing requirement survives in `gateFlags`.
    expect(gated.authorityNotices).toEqual([]);
  });

  /**
   * ⚠⚠ **HALF-INVERTED — and the half that moved is R6-F1's whole content.**
   *
   * ── WHAT THIS TEST MEASURED, KEPT VERBATIM AS THE RECORD ──────────────────────────────────
   * Its name was *"has no representable CATEGORY_ONLY placeholder at all on a خيري waqf"*, and both
   * halves were refusals over the SAME two inputs used below, unchanged:
   *
   *   · `withPlaceholder(null, null)` ⇒ `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING`, naming
   *     `beneficiaryId: 'ben-307'` — R6 demanded the descent fact from a `CATEGORY_ONLY` record on
   *     every waqf type;
   *   · `withPlaceholder('SON', 1)` ⇒ `SHART_INCOMPLETE` / `DESCENDANT_ON_CHARITABLE_WAQF` — ESC-1
   *     refused the very edge R6 had just demanded.
   *
   * Together they said: a وقف خيري's not-yet-enumerated segment could not be entered at all. That
   * was R6-F1.
   *
   * ── WHAT CLOSED IT ────────────────────────────────────────────────────────────────────────
   * `buildLineage` pass 4 now scopes the `CATEGORY_ONLY` edge requirement to a `FAMILY_DHURRI` waqf,
   * because on a charitable deed eligibility does not come from descent and demanding an edge forced
   * a fiction. **The first half is therefore inverted and the second is untouched** — deliberately
   * kept in one test, because a re-broadened R6 would redden only the first half and a lapsed ESC-1
   * only the second, and the pair names which rule moved.
   *
   * ── THE MONEY, BY HAND (halalas), and it is Example D-خ's own, unchanged ───────────────────
   *   revenue (INCOME `rev-002`)                      180,000,000
   *   − ṣiyāna FIXED                                 − 10,000,000
   *   − operating (`exp-e-003`)                      − 12,000,000
   *   − ʿushr 10% OF REVENUE (⚠ unverified)          − 18,000,000
   *   = distributable                                 140,000,000
   *   ⚠ the 2,000,000,000 CAPITAL receipt (`cap-001`, istibdal proceeds) enters NO line of that
   *     column — invariant I-C1, binding rule 1 — and the run flags `CAPITAL_RECEIPTS_EXCLUDED`.
   *
   *   deed weights 40 / 30 / 30, total 100, applied on a charitable allocation (R3 exempts only a
   *   *lineage* cohort), so every share divides exactly and the residual is 0:
   *     ben-006  140,000,000 × 40/100 =  56,000,000
   *     ben-306  140,000,000 × 30/100 =  42,000,000
   *     ben-307  140,000,000 × 30/100 =  42,000,000
   *     Σ = 56,000,000 + 42,000,000 + 42,000,000 = 140,000,000 ⇒ residual 0
   *
   * ── AND THE POINT OF THE WHOLE THING: BR-206 HAS A SUBJECT AGAIN ──────────────────────────
   * `ben-307` is the placeholder with `category: null`, so its line is `WITHHELD` on
   * `CATEGORY_NOT_CAPTURED` while KEEPING its 42,000,000 entitlement (I6 — a gate stamps a status, it
   * never moves an amount). Under R6-F1 that gate was unreachable on the one waqf type it exists for.
   * `CROSS_BORDER_PENDING` rides along in `gateFlags` without binding, so no Authority notice is filed
   * for a disbursement that is not happening.
   */
  it('a خيري placeholder is representable edgeless, and refused the moment it records descent', () => {
    function withPlaceholder(lineageLink: string | null, tabaqa: number | null) {
      return {
        ...exampleDCharitable(),
        beneficiaries: exampleDCharitable().beneficiaries.map((candidate) =>
          candidate.id === 'ben-307'
            ? { ...candidate, kind: 'CATEGORY_ONLY' as const, lineageLink, tabaqa, category: null }
            : candidate,
        ),
      };
    }

    // ── INVERTED HALF: the edgeless recording now COMPUTES ──────────────────────────────────
    const resolved = runDistribution(withPlaceholder(null, null));
    expect(resolved.entitlementRule).toBe('SHARED_ALL_LIVING_TABAQAT');
    expect(resolved.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-006', 56_000_000n],
      ['ben-306', 42_000_000n],
      ['ben-307', 42_000_000n],
    ]);
    expect(resolved.totals.entitledMinor).toBe(140_000_000n);
    expect(resolved.totals.residualMinor).toBe(0n);
    // The gate that had no reachable subject under R6-F1.
    const placeholder = resolved.lines.find((line) => line.beneficiaryId === 'ben-307');
    expect(placeholder?.status).toBe('WITHHELD');
    expect(placeholder?.reasonCode).toBe('CATEGORY_NOT_CAPTURED');
    expect(placeholder?.gateFlags).toEqual(['CATEGORY_NOT_CAPTURED', 'CROSS_BORDER_PENDING']);
    expect(resolved.authorityNotices).toEqual([]);
    expect(resolved.totals.paidMinor).toBe(98_000_000n);
    expect(resolved.totals.withheldMinor).toBe(42_000_000n);
    // ⚠ It is paid as a charitable SEGMENT, not as a descendant: the engine placed nobody in a
    // family tree here, and no line claims a lineage depth. That is what makes this legitimate
    // rather than an escape — there is no bloodline in this run to take ghallah from.
    expect(resolved.lines.map((line) => line.basis.lineageDepth)).toEqual([null, null, null]);
    expect(resolved.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');

    // ── STILL-REFUSED HALF: recording descent on a خيري waqf is refused, and now by TWO rules ──
    // ⚠ INVERTED IN PART (2026-08-03). `withPlaceholder('SON', 1)` records BOTH an edge and a
    // generational tier. MEASURED BEFORE: `DESCENDANT_ON_CHARITABLE_WAQF` with
    // `recordedDescendantIds: ['ben-307']`. MEASURED AFTER: `TABAQA_ON_CHARITABLE_WAQF`, which runs
    // first and reports the same offender under `offendingBeneficiaryIds`. Both recordings are driven
    // so neither rule's coverage is silently absorbed by the other.
    expect(
      expectDomainCode(() => runDistribution(withPlaceholder('SON', 1)), 'SHART_INCOMPLETE')
        .details,
    ).toMatchObject({
      refusal: 'TABAQA_ON_CHARITABLE_WAQF',
      offendingBeneficiaryIds: ['ben-307'],
    });
    // …and ESC-1's own discriminator, on descent recorded WITHOUT a tier — the only shape that still
    // reaches it. `tabaqa: null` is what clears the newer rule.
    expect(
      expectDomainCode(() => runDistribution(withPlaceholder('SON', null)), 'SHART_INCOMPLETE')
        .details,
    ).toMatchObject({
      refusal: 'DESCENDANT_ON_CHARITABLE_WAQF',
      recordedDescendantIds: ['ben-307'],
    });
  });
});

describe('AT-13 · which calendar binds is a Setting, and both dates are always reported', () => {
  function overdueInput(
    bindingCalendar: 'EARLIER_OF' | 'GREGORIAN' | 'HIJRI',
  ): DistributionInputRaw {
    return {
      ...exampleA(),
      asOf: { gregorian: '2027-03-31', hijri: '1448-10-23' },
      policy: { ...policy(), bindingCalendar },
    };
  }

  it('EARLIER_OF binds on the Hijri deadline and reports the run OVERDUE by one day', () => {
    const result = runDistribution(overdueInput('EARLIER_OF'));
    expect(result.timing.hijriDeadlineAsGregorian).toBe('2027-03-30');
    expect(result.timing.boundBy).toBe('HIJRI');
    expect(result.timing.bindingDeadlineGregorian).toBe('2027-03-30');
    expect(result.timing.status).toBe('OVERDUE');
    expect(result.timing.daysUntilDeadline).toBe(-1);
    expect(result.flags).toContain('TIMING_OVERDUE');
  });

  it('GREGORIAN on the SAME input reports ON_TIME — the one-day divergence IS decision D2', () => {
    const result = runDistribution(overdueInput('GREGORIAN'));
    expect(result.timing.boundBy).toBe('GREGORIAN');
    expect(result.timing.status).toBe('ON_TIME');
    expect(result.timing.daysUntilDeadline).toBe(0);
    expect(result.flags).not.toContain('TIMING_OVERDUE');
    // Both dates are still reported, so a GREGORIAN-configured run is distinguishable from an
    // EARLIER_OF one that happened to land on the Gregorian date.
    expect(result.timing.deadlineHijri).toBe('1448-10-22');
    expect(result.timing.hijriDeadlineAsGregorian).toBe('2027-03-30');
  });

  it('OVERDUE never blocks — the run still computes, is reviewable and is signable', () => {
    const result = runDistribution(overdueInput('EARLIER_OF'));
    expect(result.totals.entitledMinor).toBe(27_500_000n);
    expect(result.lines).toHaveLength(3);
  });

  it('records the Shart schedule as the basis when the deed stipulates one', () => {
    const result = runDistribution({ ...exampleA(), disbursementSchedule: 'QUARTERLY' });
    expect(result.timing.basis).toBe('SHART_SCHEDULE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * `trace.ts` — the builder and the canonicalizer
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('trace.ts · step()', () => {
  it('accepts a well-formed step and omits `data` rather than setting it to undefined', () => {
    const bare = step('INPUT', 'INPUT_PARSED', 'parsed');
    expect(Object.prototype.hasOwnProperty.call(bare, 'data')).toBe(false);
    expect(step('INPUT', 'INPUT_PARSED', 'parsed', { a: '1' }).data).toStrictEqual({ a: '1' });
  });

  it('refuses an unknown stage, a prose code, a blank message and a non-string datum', () => {
    expectDomainCode(
      () => step('LEDGER' as 'INPUT', 'CODE', 'msg'),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
    expectDomainCode(() => step('INPUT', 'not a code', 'msg'), 'DISTRIBUTION_INVARIANT_BREACH');
    expectDomainCode(() => step('INPUT', 'CODE', '   '), 'DISTRIBUTION_INVARIANT_BREACH');
    expectDomainCode(
      () => step('INPUT', 'CODE', 'msg', { amount: 1n as unknown as string }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });
});

describe('trace.ts · createTraceBuilder()', () => {
  it('numbers steps 1..N in insertion order and returns a detached copy', () => {
    const builder = createTraceBuilder();
    builder.add(step('INPUT', 'ONE', 'first'));
    builder.addAll([step('WATERFALL', 'TWO', 'second'), step('ALLOCATE', 'THREE', 'third')]);
    const entries = builder.entries();
    expect(entries.map((entry) => [entry.seq, entry.code])).toEqual([
      [1, 'ONE'],
      [2, 'TWO'],
      [3, 'THREE'],
    ]);
    builder.add(step('INVARIANTS', 'FOUR', 'fourth'));
    expect(entries).toHaveLength(3);
    expect(builder.entries()).toHaveLength(4);
  });

  it('traceText renders one deterministic line per step, data sorted by key', () => {
    const builder = createTraceBuilder();
    builder.add(step('WATERFALL', 'NAZIR_FEE', 'fee', { zebra: '1', alpha: '2' }));
    expect(traceText(builder.entries())).toEqual([
      '#1 [WATERFALL] NAZIR_FEE — fee (alpha=2; zebra=1)',
    ]);
  });
});

describe('trace.ts · canonicalizeResult()', () => {
  const result = runDistribution(exampleA());

  it('renders every bigint as its exact halala string — JSON.stringify would throw', () => {
    expect(() => JSON.stringify(result)).toThrow(TypeError);
    expect(canonicalizeResult(result)).toContain('"distributableMinor":"27500000"');
  });

  it('sorts object keys, so a field reorder upstream cannot change the bytes', () => {
    // `JSON.parse` preserves the textual order of string keys, so re-parsing the canonical bytes
    // shows exactly the order they were emitted in.
    const roundTripped = JSON.parse(canonicalizeResult(result)) as Record<string, unknown>;
    const topLevelKeys = Object.keys(roundTripped);
    expect(topLevelKeys).toEqual([...topLevelKeys].sort());
    expect(topLevelKeys[0]).toBe('authorityNotices');
    expect(topLevelKeys.at(-1)).toBe('waterfall');
    // …and every nested object too, including the reordered-by-construction trace steps.
    const line = (roundTripped['lines'] as Array<Record<string, unknown>>)[0];
    expect(Object.keys(line ?? {})).toEqual([...Object.keys(line ?? {})].sort());
  });

  it('emits the same bytes for two objects that differ only in key order', () => {
    const forward = { ...result };
    const reversed = Object.fromEntries(
      Object.entries(result).reverse(),
    ) as unknown as DistributionResult;
    expect(canonicalizeResult(reversed)).toBe(canonicalizeResult(forward));
  });

  it('is stable under a re-run, and differs when a single halala differs', () => {
    expect(canonicalizeResult(runDistribution(exampleA()))).toBe(canonicalizeResult(result));
    const nudged = runDistribution({
      ...exampleA(),
      revenue: {
        incomeMinor: 35_000_001n,
        receipts: [
          { id: 'rev-001', receiptClass: 'INCOME', amountMinor: 35_000_001n, capitalSource: null },
        ],
      },
    });
    expect(canonicalizeResult(nudged)).not.toBe(canonicalizeResult(result));
  });

  it('refuses a value the canonical form cannot represent rather than dropping it', () => {
    const withDate = { ...result, period: new Date(0) } as unknown as DistributionResult;
    expectDomainCode(() => canonicalizeResult(withDate), 'DISTRIBUTION_INVARIANT_BREACH');
    const withFloat = { ...result, totals: { ...result.totals, excludedCount: 1.5 } };
    expectDomainCode(() => canonicalizeResult(withFloat), 'DISTRIBUTION_INVARIANT_BREACH');
  });

  it('keeps a halala figure exact past 2^53 — the digits, never a float round-trip', () => {
    // 9_007_199_254_740_993 halalas is `Number.MAX_SAFE_INTEGER + 2`, i.e. the smallest amount a
    // `Number(bigint)` round-trip would silently corrupt (it lands on …992). ~SAR 90 trillion is
    // absurd for one endowment and exactly why the check belongs here rather than on a real run.
    const huge = {
      ...result,
      waterfall: { ...result.waterfall, revenueMinor: 9_007_199_254_740_993n as Minor },
    };
    expect(canonicalizeResult(huge)).toContain('"revenueMinor":"9007199254740993"');
    expect(canonicalizeResult(huge)).not.toContain('9007199254740992');
  });

  it('OMITS an undefined member rather than emitting it as null', () => {
    // An absent key and a `key: null` are different bytes, and the bytes are what the Nazir's
    // signature covers. `TraceStep.data` is the one optional field in the whole output.
    const withExplicitUndefined = {
      ...result,
      futureOptionalField: undefined,
    } as DistributionResult;
    expect(canonicalizeResult(withExplicitUndefined)).toBe(canonicalizeResult(result));
    expect(canonicalizeResult(withExplicitUndefined)).not.toContain('futureOptionalField');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * `invariants.ts` — the breach paths, driven by doctored contexts
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('invariants.ts · a doctored run is refused, never emitted', () => {
  /**
   * A real, valid context for any input, from which each case below breaks exactly one thing.
   *
   * Everything is derived by re-running the real stages, so nothing is hardcoded and the helper
   * cannot drift from the engine.
   */
  function contextFor(raw: DistributionInputRaw): InvariantContext {
    const input = parseDistributionInput(raw);
    const result = runDistribution(raw);
    const resolution = resolveEntitlement(input);
    const cohort = entitledCohortWeights(resolution);
    const allocation =
      cohort.weights.length === 0
        ? { amountsMinor: [], floorsMinor: [], residualMinor: 0n }
        : allocateMinor(
            result.waterfall.distributableMinor,
            cohort.weights,
            input.policy.roundingMethod,
          );
    return {
      input,
      distributionType: result.distributionType,
      order: result.entitlementOrder,
      waterfall: result.waterfall,
      lines: result.lines,
      totals: result.totals,
      floorsMinor: allocation.floorsMinor,
      entitledIds: resolution.entitledIds,
      // R7 · the run's own published flags. `InvariantContext` gained this for ONE purpose — I-R1
      // recomputes the extinction test from `input` and refuses the run if the recomputation and the
      // published `REVERSION_TO_ULTIMATE_TAKER_APPLIED` disagree — so it is taken from the real result
      // rather than stubbed, and a case below doctors it deliberately to prove the cross-check bites.
      flags: result.flags,
    };
  }

  const baseContext = (): InvariantContext => contextFor(exampleA());

  it('accepts the real run and reports the nine ids the engine reports', () => {
    expect(assertInvariants(baseContext())).toEqual([
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
  });

  it('I1 · catches a waterfall that does not conserve value', () => {
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          waterfall: { ...ctx.waterfall, nazirFeeMinor: minorOf(3_400_000n) },
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I1 · catches a fee taken with no recorded basis', () => {
    expectDomainCode(
      () =>
        assertWaterfallConservation({
          revenueMinor: minorOf(100n),
          capitalReceiptsMinor: minorOf(0n),
          maintenanceReserveMinor: minorOf(0n),
          operatingCostMinor: minorOf(0n),
          netIncomeMinor: minorOf(100n),
          nazirFeeMinor: minorOf(10n),
          nazirFeeBasis: null,
          distributableMinor: minorOf(90n),
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I2/I3 · catches a totals roll-up that has drifted from the lines', () => {
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          totals: { ...ctx.totals, paidMinor: minorOf(13_750_001n) },
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I3 · catches an EXCLUDED line carrying money', () => {
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          lines: ctx.lines.map((line) =>
            line.status === 'EXCLUDED' ? { ...line, entitledMinor: minorOf(1n) } : line,
          ),
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I5 · catches a tier-excluded line stamped with the wrong reason code', () => {
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          lines: ctx.lines.map((line) =>
            line.status === 'EXCLUDED'
              ? { ...line, reasonCode: 'BENEFICIARY_INACTIVE' as const }
              : line,
          ),
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I5 · catches the ORDERED tier rule applied to a SHARED waqf', () => {
    const ctx = baseContext();
    expectDomainCode(
      () => assertInvariants({ ...ctx, order: 'SHARED' }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I6 · catches a halala moved between two SAME-STATUS lines — every total still balances', () => {
    // The hard case, and the reason the I6 check recomputes the split rather than checking a band:
    // both lines are PAID, so `paidMinor`, `entitledMinor`, the floors and the residual are ALL
    // unchanged. I1, I2, I3, I4, I5, I7, I9 and I-C1 every one of them still hold. Only the
    // weight-only recomputation — which has no gate data in scope — notices.
    const ctx = contextFor(exampleF());
    expect(ctx.lines.every((line) => line.status === 'PAID')).toBe(true);
    const doctored = ctx.lines.map((line) => {
      if (line.beneficiaryId === 'ben-b') return { ...line, entitledMinor: minorOf(3_334n) };
      if (line.beneficiaryId === 'ben-c') return { ...line, entitledMinor: minorOf(3_332n) };
      return line;
    });
    const movedTotal = doctored.reduce((running, line) => running + line.entitledMinor, 0n);
    expect(movedTotal).toBe(ctx.totals.entitledMinor);
    expectDomainCode(
      () => assertInvariants({ ...ctx, lines: doctored }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I6 · catches the leftover halala given to the wrong family member', () => {
    // Only the TIE-BREAK differs: ben-a loses the bump and ben-b gains it. Same totals, same
    // residual, same floors — and a different person receives money.
    const ctx = contextFor(exampleF());
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          lines: ctx.lines.map((line) => {
            if (line.beneficiaryId === 'ben-a') return { ...line, entitledMinor: minorOf(3_333n) };
            if (line.beneficiaryId === 'ben-b') return { ...line, entitledMinor: minorOf(3_334n) };
            return line;
          }),
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I6 · hands the leftover halala to the LARGEST remainder when the remainders differ', () => {
    // Weights 1 / 2 / 4 over 10,000 halalas: floors 1428 / 2857 / 5714 (Σ 9999, residual 1) with
    // remainders 4 / 1 / 2 out of 7. The bump belongs to ben-a. A ranking that took the SMALLEST
    // remainder first would bump ben-b instead — invisible in every conservation identity, and a
    // different family member paid. `assertInvariants` re-derives the ranking, so if the engine and
    // the invariant disagreed, this run would refuse.
    const unequal = runDistribution({
      ...exampleF(),
      beneficiaries: [
        beneficiary({ id: 'ben-a', stipulatedWeight: '1' }),
        beneficiary({ id: 'ben-b', stipulatedWeight: '2' }),
        beneficiary({ id: 'ben-c', stipulatedWeight: '4' }),
      ],
    });
    expect(unequal.lines.map((line) => [line.beneficiaryId, line.entitledMinor])).toEqual([
      ['ben-a', 1_429n],
      ['ben-b', 2_857n],
      ['ben-c', 5_714n],
    ]);
    expect(unequal.totals.residualMinor).toBe(1n);
    expect(unequal.totals.entitledMinor).toBe(10_000n);
  });

  it('I6 · catches a resolver that quietly altered an entitled deed weight', () => {
    // The weights the invariant splits on come from `input.beneficiaries`, not from the resolver's
    // output, so a resolver that rewrote one is caught rather than believed.
    const ctx = contextFor(exampleA());
    const rewritten = ctx.input.beneficiaries.map((candidate) =>
      candidate.id === 'ben-001' ? { ...candidate, stipulatedWeight: '25' } : candidate,
    );
    expectDomainCode(
      () => assertInvariants({ ...ctx, input: { ...ctx.input, beneficiaries: rewritten } }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I7 · catches a mode/type disagreement in either direction', () => {
    const ctx = baseContext();
    expectDomainCode(
      () => assertInvariants({ ...ctx, distributionType: 'NA_DIRECT_USE' }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
    const directUse = contextFor(exampleC2());
    expectDomainCode(
      () => assertInvariants({ ...directUse, distributionType: 'MONETARY' }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I7 · asserts the monetary claim directly, not only as an implication', () => {
    // ⚠ Both of the assertions below are defence in depth: once `lines === []`, I3 already forces
    // the status sums to 0 and `retained` to equal `distributable`, so neither can be the sole
    // failure on a real run. They are exercised through the exported function so the claim "a
    // direct-use waqf distributes nothing" is pinned on its own terms — see the HONESTY NOTE on
    // `assertDirectUseTotals`.
    const ctx = contextFor(exampleC2());
    expect(() => assertDirectUseTotals(ctx.totals, ctx.waterfall)).not.toThrow();
    expectDomainCode(
      () => assertDirectUseTotals({ ...ctx.totals, paidMinor: minorOf(1n) }, ctx.waterfall),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
    expectDomainCode(
      () => assertDirectUseTotals({ ...ctx.totals, retainedMinor: minorOf(0n) }, ctx.waterfall),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I2 · asserts the roll-up-vs-lines identity directly, not only as an implication', () => {
    // Also defence in depth (see the HONESTY NOTE in `assertSplitConservation`): a drifted
    // `entitledMinor` on a real run would surface as an I-C1 corpus breach, which sends the reader
    // looking for leaked principal instead of a bad summary. Pinned here on its own.
    const ctx = baseContext();
    expect(() => assertSplitConservation(ctx.lines, ctx.totals, ctx.waterfall)).not.toThrow();
    expectDomainCode(
      () =>
        assertSplitConservation(
          ctx.lines,
          { ...ctx.totals, entitledMinor: minorOf(27_500_001n) },
          ctx.waterfall,
        ),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I9 · refuses a negative residual — the signature failure of half-up rounding', () => {
    expectDomainCode(() => assertResidualBound(minorOf(-1n), 3), 'DISTRIBUTION_INVARIANT_BREACH');
    expectDomainCode(() => assertResidualBound(minorOf(3n), 3), 'DISTRIBUTION_INVARIANT_BREACH');
    expectDomainCode(() => assertResidualBound(minorOf(1n), 0), 'DISTRIBUTION_INVARIANT_BREACH');
    expect(() => assertResidualBound(minorOf(2n), 3)).not.toThrow();
  });

  it('I-C1 · catches a corpus figure that does not match the classified receipts', () => {
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          waterfall: { ...ctx.waterfall, capitalReceiptsMinor: minorOf(1n) },
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I-C1 · catches distributable exceeding the period income', () => {
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertInvariants({
          ...ctx,
          waterfall: {
            ...ctx.waterfall,
            revenueMinor: minorOf(27_499_999n),
            distributableMinor: minorOf(27_500_000n),
          },
        }),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
  });

  it('I-C1 · catches income unaccounted for below revenue, the direct corpus-leak identity', () => {
    // ⚠ HONESTY NOTE, and the reason this case is asserted through `assertCorpusSegregation`
    // DIRECTLY rather than through `assertInvariants`: the leakage identity
    // `Σ entitled + retained + reserve + operating + fee == revenue` is IMPLIED by I1 ∧ I2, so
    // while both of those hold it can never be the sole failure and no single-field mutation of a
    // real run can reach it. It is kept as defence in depth — it is the literal statement of
    // CLAUDE.md binding rule 1 and it would bite the moment I1 or I2 were weakened — and it is
    // exercised here with a hand-built pair that violates only it.
    const ctx = baseContext();
    expectDomainCode(
      () =>
        assertCorpusSegregation(
          ctx.input,
          {
            ...ctx.waterfall,
            maintenanceReserveMinor: minorOf(3_999_999n),
          },
          ctx.totals,
        ),
      'DISTRIBUTION_INVARIANT_BREACH',
    );
    // …and it passes on the real, balanced run.
    expect(() => assertCorpusSegregation(ctx.input, ctx.waterfall, ctx.totals)).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Vocabulary sanity — the engine reports nothing outside the closed sets
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the engine reports only closed-vocabulary values', () => {
  const results = [exampleA(), exampleF(), exampleDCharitable(), exampleC2()].map((input) =>
    runDistribution(input),
  );

  it('every flag is a RUN_FLAGS member', () => {
    for (const result of results) {
      for (const flag of result.flags) expect(RUN_FLAGS).toContain(flag as RunFlag);
    }
  });

  it('every trace stage is a TRACE_STAGES member and every code is SCREAMING_SNAKE', () => {
    for (const result of results) {
      for (const entry of result.computationTrace) {
        expect(TRACE_STAGES).toContain(entry.stage);
        expect(entry.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    }
  });

  it('every invariant id is an INVARIANT_IDS member', () => {
    for (const result of results) {
      for (const id of result.invariantsChecked) expect(INVARIANT_IDS).toContain(id as InvariantId);
    }
  });

  it('the engine version is pinned and does not drift silently', () => {
    // ADR-0009 bumped the MAJOR to 2.0.0: the result shape gained four `basis` fields, the trace gained
    // codes, and a family cohort's arithmetic changed from deed weights to per capita. All three are
    // inside `canonicalizeResult`'s bytes, so a v1 run and a v2 run of the same input are not
    // comparable and the version is what tells a replayed computation apart from a defect.
    //
    // R7 bumps it to 3.0.0, and the argument is stronger than "the output changed": **a v2 run and a
    // v3 run of "the same" input are not comparable because v2's input COULD NOT EXPRESS THE CLAUSE.**
    // A stored v2 run of a ذري deed that in fact has a مآل clause is not a run of that deed at all. On
    // top of that the trace gained three codes, `RUN_FLAGS` two, `EXCLUSION_REASON_CODES` one,
    // `ENTITLEMENT_RULES` one, `INVARIANT_IDS` one — and `basis.rule` can now VARY WITHIN ONE RUN for
    // the first time, which breaks any consumer that grouped lines by a single per-run rule.
    //
    // **4.0.0 — memo Q5 + Q7 (product owner, 2026-08-17), and the argument is different in kind from the
    // last two: no vocabulary grew and the result SHAPE is untouched.** What changed is the ANSWER. Q5
    // widened the مآل trigger to every entitlement order, so an `ORDERED`/`SHARED` deed recording
    // `ZUHUR_ONLY` whose survivors sit on abandoned lines now pays the charity the whole distributable where
    // v3 retained it — 256 of 7,680 enumerated cells moved — and that survivor goes from ENTITLED to
    // `EXCLUDED / BUTUN_LINE_NOT_CONTINUED`. Q7 turned a computing run into a refusal. A stored v3 run and a
    // v4 run of the same register are not comparable, and a MINOR bump would have implied they were.
    expect(ENGINE_VERSION).toBe('e6-distribution/4.0.0');
    for (const result of results) expect(result.engineVersion).toBe(ENGINE_VERSION);
  });

  it('civilDate() still rejects what the schema rejects — the date guard is one implementation', () => {
    expect(() => civilDate('2026-02-30')).toThrow();
  });
});
